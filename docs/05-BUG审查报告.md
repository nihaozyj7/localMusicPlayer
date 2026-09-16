# BUG 审查报告（音乐播放器）

> 审查对象：本项目仓库根目录（Go 1.25 + Wails v3 beta.14 + 原生 ES Module 前端）
> 审查方式：**只读**。全程未修改任何源码，仅新增本报告文件。
> 需求/设计依据：`docs/01-需求原始记录.md`、`docs/03-技术方案.md`、`docs/04-后端实现说明.md`，以及代码内大量中文注释。

---

## 0. 实际执行的命令与结果（verified-by-execution）

| #   | 命令                                                                                                                             | 结果                                                     | 说明                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `go test ./...`                                                                                                                  | **exit 0**，全部 `ok`（musicplayer + 15 个 internal 包） | 现有测试全绿                                                                                                                                                              |
| 2   | `go vet ./...`                                                                                                                   | **exit 0**，无输出                                       | 静态检查无告警                                                                                                                                                            |
| 3   | `go test -race ./...`                                                                                                            | **exit 0**，无 `DATA RACE`                               | 见下方「重要限制」：现有测试没有覆盖到下面报告的并发路径                                                                                                                  |
| 4   | `npm run check`                                                                                                                  | **exit 1**                                               | lint 失败：`frontend/packages/player-skins/src/skins/magia.js 711:52 error Unnecessary escape character: \-  no-useless-escape`（typecheck / node:test 因此**没有运行**） |
| 5   | `Get-ChildItem -Recurse` / 全库 `grep`（`emit(`、`on(`、`ShowDesktopWallpaper`、`watcher.Start`、`setWatchers`、`innerHTML` 等） | —                                                        | 用于交叉核对「事件发出/订阅」「配置键写入/应用」的完整性                                                                                                                  |

**重要限制（据实说明）**：

- `go test -race` 通过**不代表没有数据竞争**。本报告中的并发问题（`ffmpeg.Resolve/Reset`、`loudness.Manager.tools`、`theme/skins.Manager` 的 map 替换、`enrichDurations` 的 `done` 读取）都没有被现有测试触发，属于**读代码确认**。
- 除 #1~#4 外，其余结论全部是 **verified-by-reading**：已在「证据」里给出确切 `file:line` 与原文，可独立复核。
- 无法用 `go test` 直接复现的 UI 缺陷（队列、监听、配置持久化），已给出逐个可点的复现步骤，但仍属静态验证。

---

## 1. 判定为真实 BUG 的发现

### [严重] 文件夹实时监听在「启动时没有文件夹」或「启动时关闭监听」后永远不启动

- **位置**: `main.go:305-323` `startWatchers()`；`internal/library/watcher.go:52-56` `Watcher.Start`；`services.go:254-266` `LibraryService.refreshWatcher`
- **是不是 BUG**: 是
- **判断依据**: 需求 A2「设置完成后监听这些文件夹，自动更新歌曲」；`watcher.go:18` 注释「Watcher 监听音乐文件夹变化（需求 A2）」；`main.go:305-323` 的 `startWatchers` 是启动期唯一的启动点。
- **现象**: 全新安装（配置里还没有任何文件夹）时，用户添加第一个文件夹后，「实时监听」在设置里显示为开、文件夹徽标也显示监听中，但**实际不生效**——之后往这个目录里放文件/删文件，曲库不会自动同步，必须手动「重新扫描」。同理：启动时「实时监听」是关的，用户在设置里打开它，本次运行也不会生效。
- **复现步骤**:
  1. 删除/重命名 `%APPDATA%\MusicPlayer\config.json`（或让 `folders` 为空），启动应用；
  2. 设置 → 添加一个音乐文件夹（此时 `startWatchers` 早已在启动时因 `len(roots)==0` 直接 return，`Watcher.Start` 从未被调用）；
  3. 用资源管理器往该文件夹复制一个 .mp3；
  4. 观察「所有歌曲」——不会出现新歌（`scan:done` 不触发）。
- **证据**:
  - `main.go:317-320`：
    ```go
    if len(roots) == 0 {
        return
    }
    if err := state.watch.Start(roots); err != nil {
    ```
  - `watcher.go:52-56`：`func (w *Watcher) Start(roots []string) error { w.SetRoots(roots); go w.loop(); return nil }` —— **只有 `Start` 会 `go w.loop()`**。
  - `grep 'watch\\.Start' → 全库只有 main.go:320 一个调用点`；而 `refreshWatcher`（`services.go:254-266`）只调用 `s.watch.SetRoots(roots)`，`SetRoots`（`watcher.go:59-72`）只做 `fsw.Add`，**不会启动 `loop`**。
- **触发条件**: 100%（只要应用启动那一刻没有文件夹，或 `watchFolders=false`）。这是新用户的默认路径。
- **建议修法**: 在 `refreshWatcher()` 里当「需要监听且尚未启动」时调用一次 `Start(roots)`（或在 `Watcher` 内用 `sync.Once` 保护 `go w.loop()`）。不改变任何既定行为，只是补上缺失的启动。
- **置信度**: 高

### [严重] 元数据阶段被取消时扫描会清空整个曲库，并广播 `scan:done`（Kept=0）

- **位置**: `internal/library/library.go:312-416` `Manager.Scan`；`internal/library/library.go:511-566` `readAll`
- **是不是 BUG**: 是
- **判断依据**: `library.go:100-105` 注释「它们不能并行（会互相覆盖 songs 表），也不能直接丢弃后到的请求——否则前端会一直等不到 scan:done 事件」；`readAll` 自己的注释 `558`「丢掉空槽（并发取消时可能出现零值）」说明作者知道取消会产生零值，但只在**全量成功**路径做了兜底。
- **现象**: 扫描在「并发读取元数据」阶段被 `ctx` 取消（例如库很大超过 `runScan` 的 30 分钟上限，或将来任何取消来源）时，`readAll` 返回空切片，`Scan` **不再检查 `ctx.Err()`**，于是把 `m.songs` 覆盖成空 map、文件夹曲目数全部归零，然后正常返回 `ScanResult{Kept:0}` → 前端收到 `scan:done` 并渲染出「曲库为空」，用户看到「扫描完成」的成功提示但歌全没了（重启后才恢复）。
- **复现步骤**:
  1. 构造超大曲库（或把 `runScan` 的超时临时改小）让「遍历文件」成功、「读取元数据」阶段超时；
  2. 触发扫描；
  3. 观察：出现成功提示，但「所有歌曲」变空、各文件夹曲目数变 0。
- **证据**:
  - `library.go:349` `results := m.readAll(ctx, candidates, concurrency, force)`，其后 `353-357` 直接 `filter.Apply` + `enrichDurations`，**没有任何 `ctx.Err()` 检查**（唯一检查在 `339-341` 的 walk 循环里，早于 `readAll`）。
  - `library.go:545-552`：
    ```go
    case <-ctx.Done():
        close(jobs)
        wg.Wait()
        return out[:0]
    ```
    返回的是**非 nil 的空切片**，`Scan` 无法区分「取消」与「真的没有歌」。
  - `library.go:383-385`：`m.songs = newSongs`（空）、`m.pathIndex = newIndex`、`m.raw = results`。
- **触发条件**: 取消发生在 `readAll` 期间。已知可触发路径：`runScan` 的 30 分钟超时（`services.go:92`）、`Watcher.Stop` → `RescanPaths(w.ctx, …)`（`watcher.go:196`）在增量扫描中途取消。
- **建议修法**: `Scan`/`RescanPaths` 在 `readAll` 之后立即 `if ctx.Err() != nil { return ScanResult{}, ctx.Err() }`（保持旧 `m.songs` 不变）；`readAll` 可改为返回 `(songs, ok)`。属于纯修复，不改变成功路径行为。
- **置信度**: 高

### [中等] 移除「正在播放」的队列歌曲会把 currentId 置空，播放直接停止

- **位置**: `frontend/src/js/store.js:540-547` `removeFromQueue`
- **是不是 BUG**: 是
- **判断依据**: 代码自己的意图写在 542-544 行——它**尝试**在移除后挑一首邻居继续播（`indexOf` + 末尾钳制），但下标是从**已经被过滤掉该项**的数组里取的，逻辑必然失败。
- **现象**: 在「播放列表（队列）」里点某一行的「移除」，且这一行正是当前正在播放的歌曲、队列里还有别的歌时：底栏播放器立刻变成空（封面/标题清空、进度归零、暂停），实际播放停止，而不是顺延到下一首。
- **复现步骤**:
  1. 播放任意 3 首以上的队列；
  2. 打开底部「播放列表」面板（或切到 [播放列表] 选项卡）；
  3. 对**正在播放的那一行**点删除；
  4. 观察：播放停止、底栏清空；而删掉的是非当前行则正常。
- **证据**: `store.js:540-547`：
  ```js
  export function removeFromQueue(songId) {
    state.queue = state.queue.filter((id) => id !== songId); // 541：songId 已被移除
    if (state.currentId === songId) {
      const i = state.queue.indexOf(songId); // 543：永远 -1
      state.currentId = state.queue[Math.min(i, state.queue.length - 1)] ?? null; // 544：queue[-1] → null
    }
    commit();
  }
  ```
  `currentId = null` 后 `audio.js#syncAudio` 会暂停并清掉 `src`（`frontend/src/js/audio.js` 的 currentSong null 分支）。
- **触发条件**: 队列长度 ≥1 且删除的是当前曲目。100% 复现。
- **建议修法**: 先算出被删项的下标再过滤，例如 `const i = state.queue.indexOf(songId); state.queue = …filter…; if (state.currentId === songId) state.currentId = state.queue[Math.min(i, state.queue.length - 1)] ?? null;`（i 是移除前的下标，正好指向「下一首」的位置）。这是修 bug，不是改需求。
- **置信度**: 高

### [中等] 队列视图 / 队列面板丢掉「在线试听」曲目 → 拖拽排序错位、计数错误

- **位置**: `frontend/src/js/store.js:324-335` `currentSongList`；`frontend/src/js/playerbar.js:264-266` `renderQueuePanel`
- **是不是 BUG**: 是
- **判断依据**: `store.js:112-118` 明确写「在线歌曲（试听）**不放进 songs**……队列 / 底栏 / 播放详情页照样能查到它」，并为此提供了 `songById`（`store.js:574-582`：「先查本地曲库，再查在线登记表」）。但队列列表与队列面板绕过了 `songById`，只在 `state.songs` 里查。
- **现象**: 试听一首在线歌曲（它会被追加进队列）后：底部「播放列表」面板里看不到这一项、计数比实际少；切到 [播放列表] 选项卡也少一行。此时拖动队列里的任意一行，DOM 下标与 `state.queue` 下标错位，**移动的不是用户拖的那首**。
- **复现步骤**:
  1. 打开在线搜索，点一首试听（`searchpanel.js:460-462` 会把它的 id 追加进 `state.queue`）；
  2. 再在本地曲库里播放 2~3 首，使队列 = 在线曲 + 本地曲混合；
  3. 打开底部播放列表面板：在线曲不显示（计数少 1）；
  4. 在 [播放列表] 里把最后一行拖到最前：顺序变化与拖动目标不一致。
- **证据**:
  - `store.js:326-328`：`const byId = new Map(songs.map((s) => [s.id, s])); if (view === "queue") return queue.map((id) => byId.get(id)).filter(Boolean);`
  - `playerbar.js:264`：`const songs = state.queue.map((id) => state.songs.find((s) => s.id === id)).filter(Boolean);`
  - `tracks.js:669-676`（`bindQueueSort.onEnd`）把 SortableJS 的 `oldIndex/newIndex` 直接交给 `reorderQueue(from, to)`（`store.js:549-557`），下标对应 `state.queue`；
  - `searchpanel.js:438-462` 证明在线曲确实会进入 `state.queue`。
  - （附带：`playerbar.js:887-890` `nextSongPreview` 同样只在 `state.songs` 里找，在线曲的「下一曲」提示为空。）
- **触发条件**: 队列中同时存在本地曲与在线试听曲（混合顺序）时。
- **建议修法**: 两处改用 `songById(id)` / 用 `state.onlineSongs` 补齐（`songById` 已存在）；拖拽排序前先校验「可见行数 === queue 长度」，不等则禁用排序或加映射表。不改变需求语义。
- **置信度**: 高

### [中等] 队列拖拽把「队列下标」写回来源歌单，队列≠歌单时会改错歌单顺序

- **位置**: `frontend/src/js/store.js:549-557` `reorderQueue`；`frontend/src/js/store.js:521-538` `appendToQueue/addNextInQueue`
- **是不是 BUG**: 是
- **判断依据**: `store.js:555-556` 把队列的 `from/to` 当作歌单的 `from/to` 直接落盘（`backend.reorderPlaylist(state.queueOrigin.id, from, to)`）。只有当「队列与来源歌单逐项相同」时这两个下标体系才等价，代码里没有任何校验。
- **现象**: 从歌单开始播放后，又往队列里插入/追加了别的歌（`addNextInQueue` / `appendToQueue` 都不会清掉 `queueOrigin`），此时在 [播放列表] 里拖动某一行，**来源歌单的持久化顺序会被改成另一个位置的那首歌**；重扫/重启后歌单顺序与用户拖的完全不符。
- **复现步骤**:
  1. 歌单 P = [A,B,C,D,E]，从 P 播放（`queueOrigin = P`）；
  2. 在曲库对 X、Y 各点一次「下一首播放」：队列 = [A,Y,X,B,C,D,E]；
  3. 进入 [播放列表]，把第 4 行（B，队列下标 3）拖到第 2 位（to=1）；
  4. 结果：界面队列变成 [A,B,Y,X,C,D,E]，但后端把 **P 的下标 3（D）** 移到了 1 → P = [A,D,B,C,E]。重启后从后端拉回的就是这个错误顺序。
- **证据**: `store.js:555-557` `if (isWails() && state.queueOrigin?.id) { backend.reorderPlaylist(state.queueOrigin.id, from, to); }`；`addNextInQueue`（`521-538`）只改 `state.queue`，不重置 `queueOrigin`。
- **触发条件**: 从歌单/专辑播放后又往队列加过歌，再在队列视图拖拽。
- **建议修法**: 落盘前校验「队列与歌单内容完全一致」（比较 id 序列），不一致就不调用 `reorderPlaylist`（或把 `queueOrigin` 降级为 null）。属修 bug。
- **置信度**: 中（逻辑链完整；影响依赖具体操作序列）

### [中等] 「实时监听」开关只写配置、从不调用后端 `SetWatchers`，运行期不生效

- **位置**: `frontend/src/js/settings.js:2446-2455` `handleSettingControl`；`services.go:1516-1523` `applyPatch`；`services.go:201-212` `LibraryService.SetWatchers`；`frontend/src/js/bridge.js:160`
- **是不是 BUG**: 是
- **判断依据**: `applyPatch` 的 `watchFolders` 分支只改配置字段与文件夹徽标，注释里也没提刷新；而专门为运行期生效准备的 `SetWatchers`（`services.go:201-212` 内含 `s.refreshWatcher()`）在整个前端**没有任何调用点**。
- **现象**: 设置里拨动「实时监听」：UI 立刻变、写进 config.json、文件夹徽标也变，但 fsnotify 的监听根**本次运行内不变**（已开启时关掉仍继续监听/触发增量扫描；关闭时打开也不会开始监听）。用户以为已经生效。
- **复现步骤**:
  1. 启动应用（此时有文件夹），确认监听中；
  2. 关闭「实时监听」，往文件夹里复制一首歌；
  3. 观察：曲库仍然自动更新（说明监听没停）；反向操作同理。
- **证据**: 全库 grep `setWatchers` 只有 `bridge.js:160` 的定义，**零调用**；`settings.js:2452-2454` 只更新前端数组；`services.go:1519-1523` 只改 `c.WatchFolders`/`c.Folders[i].Watching`。
- **触发条件**: 100%（拨动开关时）。
- **建议修法**: 在 `handleSettingControl` 的 `watchFolders` 分支里调用 `backend.setWatchers(next)`（或让 `applyPatch` 在值变化时调用 `refreshWatcher` 并确保监听已启动——见「严重 #1」）。
- **置信度**: 高

### [中等] 桌面背景歌词开关从未持久化，重启后不恢复

- **位置**: `services.go:1476-1625` `applyPatch`（无 `showDesktopWallpaper` 分支）；`desktop_wallpaper.go` `SetDesktopWallpaper`；`frontend/src/js/desktop-wallpaper.js:111-116`
- **是不是 BUG**: 是
- **判断依据**: `internal/bootstrap/config.go:155-162` 对该字段的注释明确说这是要持久化并在启动时恢复的开关；`early_theme.go:212-270` 的 `restoreDesktopModeOnStartup` / `stillWanted` 专门读它并做启动恢复；`store.js:1017` 也把它列进 `SYNCED_KEYS` 推给后端。前端确实在写（`desktop-wallpaper.js:114`），后端没有任何地方接收。
- **现象**: 打开「桌面背景歌词」，功能当场可用；重启应用后桌面背景歌词不再出现（配置里该值仍是 false），设置/底栏按钮显示为关。桌面歌词（`showDesktopLyrics`）没有这个问题。
- **复现步骤**:
  1. 打开「桌面背景歌词」，确认桌面出现背景歌词；
  2. 关闭应用再启动；
  3. 观察：不会恢复；查看 `%APPDATA%\MusicPlayer\config.json`，`"showDesktopWallpaper"` 仍为 `false`。
- **证据**:
  - `grep 'ShowDesktopWallpaper' *.go` → 仅 `internal/bootstrap/config.go`（定义/默认值/规范化）与 `early_theme.go`（**读取**），**没有任何写入**；`services.go:1592-1593` 只有 `case "showDesktopLyrics": c.ShowDesktopLyrics = …`。
  - `services.go:1477-1624` 的 switch 中没有 `showDesktopWallpaper` 分支（未知键被静默忽略）。
  - `desktop-wallpaper.js:111-116` 只写 `state.config` 并 `commit()`（→ localStorage + `setConfig` patch）。
- **触发条件**: 100%。
- **建议修法**: 在 `applyPatch` 增加 `case "showDesktopWallpaper": c.ShowDesktopWallpaper = asBool(...)`（与 `showDesktopLyrics` 对称；注意配置层已有互斥规范化 `config.go:662-663`）。纯补漏。
- **置信度**: 高

### [中等] `RemoveFolder` 的 `defer cancel()` 会取消刚启动的扫描 → 每次移除文件夹都弹「扫描失败：context canceled」

- **位置**: `services.go:170-198` `LibraryService.RemoveFolder`
- **是不是 BUG**: 是
- **判断依据**: 这里显然想「移除后异步重扫清掉旧歌」（同函数 190-196 行的结构与 `AddFolder` 的 `go runScan` 一致），但 `defer cancel()` 在函数 `return` 时立刻执行，等于把刚交给 goroutine 的 ctx 当场取消。
- **现象**: 每次在设置里移除一个文件夹，都会弹一条红色 toast「扫描失败：context canceled」；并且曲库里来自该文件夹的旧歌**不会**在这次扫描里被清掉（要等前端紧接着触发的第二次 `doRescan` 才恢复）。
- **复现步骤**:
  1. 设置 → 音乐文件夹 → 对任一文件夹点删除 → 确认；
  2. 观察：立即出现红色「扫描失败：context canceled」。
- **证据**: `services.go:190-197`：
  ```go
  ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
  defer cancel()              // ← 函数返回即取消
  go func() {
      if _, err := s.lib.Scan(ctx, false); err != nil {
          s.emit("scan:failed", map[string]any{"message": err.Error()})
      }
  }()
  return nil
  ```
  `library.Scan` 在 `library.go:339-341` 一旦看到 `ctx.Err() != nil` 就 `return ScanResult{}, ctx.Err()`。
- **触发条件**: 每次移除文件夹（`ctx` 在 goroutine 真正开始前就被取消的概率接近 100%）。
- **建议修法**: 把 `cancel()` 移进 goroutine（`go func(){ defer cancel(); … }()`），或直接复用 `runScan`。属于修 bug；错误提示与多余的一次重扫同时消失。
- **置信度**: 高

### [中等] 封面/歌词索引 `index.json` 是非原子写入（与项目其它缓存不一致）

- **位置**: `internal/metacache/store.go:792-812` `Store.saveIndexLocked`
- **是不是 BUG**: 是（鲁棒性/数据丢失）
- **判断依据**: 同一文件里对**图片**和**歌词**都用了「临时文件 + Rename」（`store.go:360-365`、`628-632`，注释「先写临时文件再改名：避免读到写了一半的图片」）；`docs/04` 也把「原子写盘」列为该包职责。索引却直接 `os.WriteFile`，且它是所有封面/歌词的**唯一目录表**。
- **现象**: 程序在写 `covers/index.json` / `lyrics/index.json` 的过程中崩溃/断电，会留下**被截断的 JSON**；下次启动 `loadIndexLocked` 解析失败（`store.go:733+`）后静默把索引当作空——用户之前换过的封面、缓存过的歌词全部「消失」（磁盘上的图片文件还在，但没人引用）。对比：配置（`bootstrap/config.go:706-732`）和曲库缓存（`library.go:231-235`）都做了 tmp+rename。
- **复现步骤**: 难以稳定复现（需在写盘瞬间杀进程）；可用极小磁盘/写保护目录模拟。属静态确认。
- **证据**: `store.go:804-811`：
  ```go
  raw, err := json.MarshalIndent(payload, "", "  ")
  ...
  return os.WriteFile(s.indexPath(kind), raw, 0o644)   // 直接覆盖，非原子
  ```
- **触发条件**: 低频（崩溃/断电/磁盘满时）。
- **建议修法**: 改成与同包图片一致的 `tmp := path+".tmp"; WriteFile(tmp); Rename(tmp, path)`。
- **置信度**: 高

### [中等] `DeleteCover` 缺少 `ensureLoadedLocked()` → 首次调用静默失败且封面会「复活」

- **位置**: `internal/metacache/store.go:576-594` `Store.DeleteCover`
- **是不是 BUG**: 是
- **判断依据**: 该包所有读写索引的方法都遵循「先 ensureLoadedLocked」的约定，`Stats` 甚至专门写了注释（`store.go:696-698`）强调漏掉这一步会误报；`DeleteCover` 是唯一例外。
- **现象**: 如果 `DeleteCover` 是某个 Store 实例的**第一个**缓存调用（索引还没读盘），`s.covers` 还是空 map，于是 `ok=false`：既不写索引、也不删文件、直接返回成功；随后任意一次封面读取触发 `ensureLoadedLocked` 把磁盘索引读回来——用户刚执行的「恢复原始封面」等于没做，封面又出现了。
- **复现步骤**: 需要在「Store 尚未被任何封面方法触碰」时调用 DELETE（当前经由 `CoverService.Reset`；由于 `Reset` 前先调了 `CoverIDs()`，常见路径已被间接兜住——见「触发条件」）。
- **证据**: `store.go:576-584` 没有 `s.ensureLoadedLocked()`；而 `CoverIDs`（`597-607`）、`Covers`（`256-266`）、`SetActiveCover`（`515-532`）等都有。
- **触发条件**: 低——只有当 `DeleteCover` 成为首个访问者时。它是一处**潜伏**缺陷（任何新增调用方都可能踩中），当前 UI 路径不直接触发。
- **建议修法**: 在 `s.mu.Lock()` 后第一行加 `s.ensureLoadedLocked()`。
- **置信度**: 中（代码事实高，当前可达性低）

### [中等] 下载完成后不触发曲库重扫，且下载目录不在监听根内 → 新下载的歌不出现

- **位置**: `services_download.go:446-453`（成功后只 emit）；`main.go:305-323` `startWatchers`；`services.go:254-266` `refreshWatcher`
- **是不是 BUG**: 是
- **判断依据**: `main.go:223-224` 注释：「下载目录变了要让曲库重载文件夹（下载目录是隐式扫描根）并重扫一次，这样刚迁移过去的歌会立刻出现在本地歌曲里」——说明「下载的歌要自动进曲库」是明确意图；`bootstrap.EffectiveFolders` 也确实把下载目录当成扫描根。但两处监听根都只取 `cfg.Folders`，把隐式下载根漏了，且下载成功路径没有任何 `Scan`。
- **现象**: 下载一首歌成功后，toast 说「已保存到 …」，但「所有歌曲」里没有它；必须手动点「重新扫描」或重启（`autoScanOnStart`）才出现——除非用户恰好把下载目录的上级目录也加成了音乐文件夹（那样会被递归监听覆盖）。
- **复现步骤**:
  1. 设置里保证下载目录不是任何已添加音乐文件夹的子目录；
  2. 下载任意一首歌，等到「已完成」；
  3. 查看「所有歌曲」：没有新歌（除非立刻重扫）。
- **证据**:
  - `services_download.go:446-453`：成功后仅 `s.emit("download:done", …)`，无 `lib.Scan`/`RescanPaths`。
  - `main.go:313-316`：`for _, f := range cfg.Folders { roots = append(roots, f.Path) }`（**未用 `EffectiveFolders()`**）；`services.go:259-264` 同样。
  - 对照 `library.go:324`：`Scan` 确实用 `m.store.Get().EffectiveFolders()` ——两处口径不一致。
- **触发条件**: 下载目录不在任何用户文件夹之下时 100%。
- **建议修法**: 两处 roots 改用 `store.Get().EffectiveFolders()`；并在 `download:done` 之后对下载目录做一次 `RescanPaths`（或直接 `lib.Scan` 排队）。不改变需求语义。
- **置信度**: 中高

### [中等] 过滤正则的匹配语义前后端不一致（前端用 `标题.扩展名`，后端/文档用 `文件名`）

- **位置**: `frontend/src/js/store.js:276-280` `matchRules`；`internal/filter/filter.go:96,126`
- **是不是 BUG**: 是
- **判断依据**: `filter.go:9`（包注释，即设计约定）：「regex 规则同时匹配『完整路径』与『文件名』」；`store.js:264` 也自称「与 Go 侧 filter.Match 保持一致」。前端却用 `song.title`（标签标题）而不是文件名。
- **现象**: 前端拿到的是**后端已过滤过**的列表，然后 `main.js:569` / `store.js:1213` 又用前端规则筛一遍，得到真正显示的 `state.songs`。所以只要正则「匹配到标签标题但匹配不到路径/文件名」，这首歌就会从界面消失（后端其实保留了它）；反之后端已排除的则无法回来。设置页的「当前规则下：共扫描 N 个 / 过滤掉 M 个」也会与实际扫描结果不符（且因为输入列表已被后端过滤，`过滤掉` 常恒为 0）。
- **复现步骤**:
  1. 准备一个标签 title = 「作者」但文件名/path 都不含「作者」的音频；
  2. 设置 → 过滤规则 → 新增 regex 规则「作者」、scope=排除；
  3. 观察：该曲在列表里消失（后端 `m.songs` 保留），且预览数字与后端 `ScanResult.Found/Excluded`（`scan:done` 事件里有）不一致。
- **证据**:
  - 前端 `store.js:279`：`hit = re.test(song.path) || re.test(\`${song.title}.${song.ext}\`);`
  - 后端 `filter.go:96`：`fileName := filepath.Base(path)`；`filter.go:126`：`hit = re.MatchString(path) || re.MatchString(fileName)`
  - `library.go:242`：`Songs 返回过滤后的全部歌曲`；`main.js:568-570` 把返回值当 raw 再 `applyRules`。
- **触发条件**: 使用与本条差异相关的正则（标题 ≠ 文件名）时。
- **建议修法**: 前端改为匹配完整路径 + 从 `song.path` 取 `basename`；或干脆不再二次过滤，直接用后端结果与 `scan:done` 的统计。属修 bug。
- **置信度**: 中（差异确凿；影响取决于用户规则写法）

### [轻微] 「清空缓存」只删 .lrc 文件，不清歌词索引/内存 → 统计与实际不一致且残留索引写回磁盘

- **位置**: `services_cover.go:1099-1119` `CoverService.ClearCache`；`internal/metacache/store.go:694-714` `Stats`
- **是不是 BUG**: 是
- **判断依据**: `ClearCache` 的注释是「清空缓存（封面 + 歌词）」，返回 `{covers, lyrics}`；而封面走 `DeleteCover` 会更新索引，歌词只 `os.Remove` 文件——两条腿不一致。
- **现象**: 执行「清空缓存」后，提示的清空数量正确，但设置页缓存概况仍显示旧的「已缓存 N 份歌词」（`Stats` 用内存 `len(s.lyrics)`）；`lyrics/index.json` 也仍保留已删文件的条目，重启后依旧。随后「写入缓存到文件」仍会把这些幽灵条目计入 `total`。
- **复现步骤**:
  1. 缓存若干歌词后用「清空缓存」；
  2. 观察设置页概况的歌词数量不归零；查看缓存目录 `lyrics/index.json` 条目仍在。
- **证据**: `services_cover.go:1107-1116`（只 `os.Remove(filepath.Join(lyricsDir, e.Name()))`）；`metacache/store.go:702-703` `covers := len(s.covers); lyrics := len(s.lyrics)`。
- **触发条件**: 每次清空缓存。
- **建议修法**: 给 metacache 增加 `DeleteLyrics/clearLyrics` 并同步索引与内存；或让 `ClearCache` 遍历 `LyricsIDs()` 删除。
- **置信度**: 中高

### [轻微] 底栏封面兜底是一次性的：第二首坏封面会显示浏览器「碎图」

- **位置**: `frontend/src/js/dom.js:312-324` `bindCoverFallback`；`frontend/src/js/playerbar.js:96`
- **是不是 BUG**: 是
- **判断依据**: `main.js:283-288` 的注释**明确承认**这个标记「再也没人清掉」，但只对「取色」路径做了绕行（另开 `Image`），没有修 `bindCoverFallback` 本身；同时 `html.js:38-50` 的 `setCoverImage` 会在换图时显式 `img.dataset.failed = ""`，说明「换图要复位失败标记」是既定做法。
- **现象**: 底栏封面 `<img>` 是常驻复用的。一旦某首歌封面加载失败（置 `coverFallbackDone=1` 并换成默认封面），后面**再遇到**加载失败的封面时 `error` 处理直接 return，碎图一直显示，违反需求 B10「封面图 + 缺省占位」。
- **复现步骤**:
  1. 队列里放 3 首：B 的封面地址失效、其余正常，顺序为 A(正常) → B(坏) → 再回到一首坏的 C；
  2. 依次播放：B 时兜底成默认封面；到 C 时底栏出现碎图。
- **证据**: `dom.js:317-321`：`if (img.dataset.coverFallbackDone === "1") return; img.dataset.coverFallbackDone = "1"; img.src = DEFAULT_COVER;`——没有任何地方把它清回 `""`；`playerbar.js:96` 只对同一个常驻元素绑定一次。
- **触发条件**: 同一运行期内出现两次以上「封面加载失败」。
- **建议修法**: `paintPlayerBar` 换 `src` 时清掉 `coverFallbackDone`（或在 `error` 回调里先判断当前 src 是否已是默认封面，而不是用一次性标记）。属修 bug。
- **置信度**: 高

### [轻微] `meta:embed-progress` 事件无人订阅，「写入缓存到文件」期间没有进度

- **位置**: `services_cover.go:1065`（emit）；前端无 `on("meta:embed-progress")`
- **是不是 BUG**: 存疑（可能是刻意只留一个 busy toast）
- **判断依据**: 事件名与 payload（`done/total/title`，见 `services_cover.go:1055-1075`）明显是为进度条设计的；但前端 `settings.js:2176-2199` 只用一条 duration:0 的 toast 表意「正在进行」，所以不算「UI 撒谎」。
- **现象**: 对成百上千首歌执行「写入缓存到文件」时，界面只有一句「正在把缓存写入歌曲文件…」，看不到任何进度，用户无法判断是卡死还是在推进。
- **复现步骤**: 缓存几十首歌后点「写入缓存到文件」，观察无任何进度变化。
- **证据**: `grep -n 'meta:embed-progress' frontend/src/js/*.js` → 无结果；`services_cover.go:1065` `s.emit("meta:embed-progress", …)`。
- **触发条件**: 每次批量写入。
- **建议修法**: 在 `runEmbedCache` 里订阅该事件更新 toast 文案；或后端不再发（明确不做进度）。二选一即可。
- **置信度**: 中

### [轻微] 并发安全：`ffmpeg` 的 `once/resolved` 与 `loudness.Manager.tools` 无锁读写

- **位置**: `internal/ffmpeg/ffmpeg.go:66-93` `Resolve/Reset/Prewarm`；`internal/loudness/loudness.go:124-134` `Available/Tools/RefreshTools`
- **是不是 BUG**: 是（数据竞争）
- **判断依据**: `Resolve` 的注释是「结果缓存，进程内只算一次」，但 `Reset` 会在运行期被 `Prewarm`、`MediaService/RefreshFFmpeg`、`Loudness/RefreshTools` 调用，与并行读取冲突；`Manager.tools` 同理（`Map/State/Measure` 会读 `m.tools`，`RefreshTools` 会写）。
- **现象**: 启动阶段 `go func(){ Prewarm(); …RefreshFFmpeg(); RefreshTools() }()`（`main.go:102-114`）与首次扫描的 `enrichDurations` → `ffmpeg.Resolve()`（`library.go:652`）并发；此时对 `once`/`resolved` 的写读是数据竞争。Go 内存模型下属未定义行为，最坏情况是读到撕裂的 `Tools`（两个 string）导致「ffmpeg 路径错/为空」。
- **复现步骤**: 需 `go test -race` 专门写并发用例；现有测试未覆盖（`go test -race ./...` 通过不代表不存在）。
- **证据**: `ffmpeg.go:72-81`：
  ```go
  func Resolve() Tools { once.Do(func() { resolved = resolve() }); return resolved }
  func Reset() { once = sync.Once{}; resolved = Tools{} }   // 无锁
  ```
  `loudness.go:125-134`：`func (m *Manager) Available() bool { return m.tools.Available() }` / `func (m *Manager) RefreshTools() { ffmpeg.Reset(); m.tools = ffmpeg.Resolve() }`（`m.tools` 无锁）。
- **触发条件**: 启动/设置里切换 ffmpeg 时的并发调用。
- **建议修法**: `ffmpeg` 用 `sync.RWMutex`（或 `atomic.Pointer[Tools]`）保护；`loudness` 给 `tools` 加互斥。
- **置信度**: 中（竞争存在是确定的；后果严重性不定）

### [轻微] 并发安全：`theme.Manager` / `skins.Manager` 的整表替换无锁，注释声称的「不会读到半成品」不成立

- **位置**: `internal/theme/theme.go:135-147` `Reload/List`；`internal/skins/skins.go:63-72`（注释）与 `:328-329` `Reload/List/Get`
- **是不是 BUG**: 是
- **判断依据**: `skins.go:65-67` 注释：「Reload 是整体替换（先构造好新 map 再一次性换指针），因此并发读 List/Get 不会读到半成品」，所以**刻意不引入 mutex**。但代码是两次独立赋值 `m.byID = byID; m.order = order`，且对 map 头的读写不是原子的；更现实的是「新 order + 旧 byID」组合会导致 `List()` 里 `byID[id]` 取到零值 `Info{}`（返回一个 id/name 全空的主题）。
- **现象**: 在「重扫主题」的同时打开主题列表/切换主题（服务方法可并发调用），极小概率出现一个空白主题项或旧的列表；`go test -race` 本来会报 data race（当前无用例覆盖）。
- **复现步骤**: 并发调用 `ThemeService.Reload` 与 `ThemeService.List`（或 `SkinService` 同理）。
- **证据**: `theme.go:135-136`：`m.byID = byID` / `m.order = order`（struct 无 mutex，见 `theme.go:38-42`）；`skins.go:328-329` 同样；`skins.go:68-72` 的 Manager 结构体没有任何锁字段。
- **触发条件**: 低频并发。
- **建议修法**: 用 `sync.RWMutex` 或 `atomic.Pointer` 整体发布一个不可变结构。
- **置信度**: 中

### [轻微] `enrichDurations` 在锁外读 `done`

- **位置**: `internal/library/library.go:704-737` `enrichDurations`
- **是不是 BUG**: 是（数据竞争）
- **判断依据**: `done++` 明确在 `mu.Lock()` 内（`704-705`），说明作者知道它要保护；但同一函数的 `if done%4 == 0`（`735`）在 `mu.Unlock()`（`716`）之后读同一变量。
- **现象**: 并发探测多个 wma/ape 文件时对 `done` 的读写竞争（race detector 会报；后果仅是进度上报偶发偏差）。
- **复现步骤**: 放置多个无时长格式文件触发 `enrichDurations`，配 `-race`。
- **证据**: `library.go:704-716`（`mu.Lock() … done++ … mu.Unlock()`）与 `735`（`if done%4 == 0`，无锁）。
- **触发条件**: 单次扫描有 >4 个无时长待探测文件。
- **建议修法**: 把 `done` 的读取移进锁内（或改用 `atomic.Int64`）。
- **置信度**: 高（代码事实）

### [轻微] 下载文件名未处理 Windows 保留设备名

- **位置**: `services_download.go:719-735` `safeFilename`
- **是不是 BUG**: 是（边界）
- **判断依据**: 注释写的是「生成安全的文件名（去掉路径分隔符与 Windows 保留字符）」，但只处理了字符与结尾点/空格，没处理 `CON/PRN/AUX/NUL/COM1-9/LPT1-9` 这些**保留名**（Windows 上即使带扩展名也不能作为文件创建）。
- **现象**: 当视频标题恰好是这些保留名时，`os.Create(target+".part")` 失败，下载以「创建文件失败」告终（`services_download.go:475-478`）。
- **复现步骤**: 给一首在线曲目标题设为 `NUL` 并下载。
- **证据**: `services_download.go:719-734`（`strings.NewReplacer` 只替换非法字符，随后 `TrimRight(s, ". ")`，无保留名判断）；`uniquePath`（`738-749`）也不处理。
- **触发条件**: 极低频（标题正好是保留名）。
- **建议修法**: 命中保留名时加后缀（如 `NUL_`）。
- **置信度**: 高（代码事实）

### [轻微] `npm run check` 当前失败（eslint `no-useless-escape`）

- **位置**: `frontend/packages/player-skins/src/skins/magia.js:711`
- **是不是 BUG**: 是（CI/自检失败）
- **判断依据**: `package.json` 的 `check` = `eslint . && tsc && node:test`，lint 失败会**阻断**后面的 typecheck 与 node:test —— 即整个前端自检链形同虚设。
- **现象**: `npm run check` 退出码 1，只输出一条 lint 错误，测试根本没有运行。
- **复现步骤**: `npm run check`。
- **证据**: 源文件 `magia.js:711`：`const isWord = (ch) => /[0-9A-Za-z\u00c0-\u024f'’-]/.test(ch);`，字符类里的 `\-` 是不必要的转义。
- **触发条件**: 100%。
- **建议修法**: 去掉 `\-` 的转义（写成 `-` 并置于类首/尾）。不改变运行行为。
- **置信度**: 高（已执行验证）

### [轻微] `bridge.on()` 在订阅完成前退订会泄漏监听

- **位置**: `frontend/src/js/bridge.js:126-137` `on`
- **是不是 BUG**: 是（资源泄漏）
- **判断依据**: 函数契约是「返回取消订阅函数」，但 Wails 模式下真正的注册是异步的（`ensureEvents().then(...)`），返回的闭包 `() => off?.()` 在 `off` 赋值前调用是空操作。
- **现象**: 若调用方在注册真正完成前就调用退订（组件 teardown / 快速重渲染），该监听**永远不会被摘掉**，后续每次事件都会调用已销毁组件的回调。
- **复现步骤**: 在 `connect()` 成功后立即 `const off = on("x", h); off();`，随后触发一次 `x` 事件 → `h` 仍被调用。
- **证据**: `bridge.js:128-132`：`let off = null; ensureEvents().then((mod) => { … off = mod.Events.On(…) }); return () => off?.();`
- **触发条件**: 异步窗口期内的退订（当前调用点大多不主动退订，故未暴露为线上症状）。
- **建议修法**: 用 `let cancelled = false`，在 `then` 里若已取消则立即 `off()`。
- **置信度**: 中高

---

## 2. 判定为「业务所需」（不是 BUG）

| 候选                                                            | 结论           | 依据                                                                                                                                                            |
| --------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 播放模式没有独立的 `loop-all`，「顺序播放」就是列表循环         | 否（业务所需） | `store.js:16-19` 注释「『sequence（顺序）』现在的语义就是『列表循环』……所以不再单独保留一个行为完全相同的 loop-all」；`playerbar.js:43-46` `MODE_META` 同步标注 |
| `Lyrics.Load` 只读本地、不联网                                  | 否（业务所需） | `services.go:576-582` 注释「本方法在『每次切歌』时都会被调用，联网等待会把播放界面卡住十几秒」；在线匹配有独立入口 `AutoMatch`                                  |
| watcher 的 500ms 是「最后一次事件后 500ms」的 trailing debounce | 否（业务所需） | `watcher.go:21` 注释「事件在 500ms 窗口内合并，避免大批量拷贝时反复触发增量扫描」；实现与描述一致                                                               |
| 扫描并发请求排队而不是丢弃                                      | 否（业务所需） | `library.go:100-105` 注释说明「不能直接丢弃……否则前端会一直等不到 scan:done」                                                                                   |
| 浏览器预览模式下用 mock / localStorage 兜底                     | 否（业务所需） | `bridge.js:52-102`、`store.js:7`、`docs/02` 的预览说明                                                                                                          |

---

## 3. 顺带存疑（未证实 / 影响很小）

1. **`slider.js:34` 的 `aria-valuenow` 写的是百分比而不是取值**：`root.setAttribute("aria-valuenow", String(Math.round(pct)))` 对音量恰好是百分比，但对进度（0..duration）、歌词字号（12..26）、睡眠分钟数（0..300）都是错的，屏幕阅读器读到的数值无意义。属无障碍缺陷，未做辅助技术实测。
2. **`skins.go:351-373` 的 `styles` 未做 `..` 校验**（`module` 校验了）：`skin.json` 里写 `"styles": ["../x.css"]` 会让后端返回越界路径给前端，但 `Handler`（`skins.go:440+`）的 `Clean` 会拒绝下载，实际取不到文件，危害有限。
3. **`theme.go` 的 `parseTheme` 允许两个 CSS 文件产生同一个 `data-theme` id**：`byID[info.ID] = info` 覆盖 + `order` 追加两次，`List()` 会显示两条同名项，`Delete` 只删其中一个文件。未实测。
4. **`dom.js#openMenu` 的 `setTimeout(…,0)` 监听注册**：若在同一次事件循环内连续 `openMenu` 两次，第一次的 document 监听会被覆盖 `menuCloser` 而永久残留。当前调用点都会先 `closeMenu`，未证实可触发。
5. **`store.js#applyPersisted` 恢复队列时用 `state.songs` 过滤**（`store.js:1094-1095`）：重启后保存过的在线试听曲目会被丢掉（songs 不含在线曲）。与「中等 #在线曲目」同源，未单独展开。
6. **`MediaService.URL`/`State` 与 `media.Server.Start` 的「独立端口」**：`main.go:89` 启动了 127.0.0.1 随机端口服务，但前端音频走的是同源 `/audio/`（`SameOriginURL`）；该端口目前似乎只用于 `ToolsInfo`/诊断。未确认是否有意保留。

---

## 4. 修复优先级建议

1. **先修两个「严重」**：`Watcher.Start` 缺失、`Scan` 取消清库。二者直接破坏需求 A2 与数据可信度。
2. 再修「设置写了不生效」这一类状态不同步：`watchFolders`、`showDesktopWallpaper`（都属同一根因：前端 `SYNCED_KEYS` 与后端 `applyPatch` 未对齐 + 运行期副作用未触发）。
3. 再修队列相关（`removeFromQueue`、在线曲目丢失、队列→歌单下标），它们都是用户高频可见的错位。
4. 最后处理鲁棒性/并发/无障碍（索引原子写、DeleteCover、数据竞争、封面兜底、aria）。

> 说明：本报告只列「已读到确切代码并给出 file:line」的项；第 3 节为未证实项，请勿当作已确认缺陷排期。
