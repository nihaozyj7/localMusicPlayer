# AGENTS.md — 本地音乐播放器（localMusicPlayer）

## 1. 项目是什么

Windows 桌面音乐播放器（绿色版单 exe，`bin/lmplayer.exe`，无需安装）。
**本地曲库为主，在线能力可选**：在线功能（搜索 / 试听 / 下载 / 封面与歌词匹配 / AI 清洗）没有一个在必经路径上，
断网时仍是完整可用的离线播放器。

| 层 | 技术 |
| :--- | :--- |
| 后端 | Go 1.25（目录扫描、标签解析、音频 HTTP 服务、响度测量、第三方接口聚合） |
| 桌面外壳 | Wails v3 `v3.0.0-beta.14`（Go ↔ WebView 桥、无边框窗口、托盘、单实例、系统对话框） |
| 渲染引擎 | WebView2（系统自带，不内嵌浏览器内核） |
| 前端视图 | Lit 3（自定义元素 + light DOM，只负责模板与增量 diff） |
| 前端工程 | 原生 ESM + Vite 7 + npm workspaces + ESLint / Prettier / TypeScript(JSDoc) |
| 音频 | 内嵌自编译 FFmpeg 8.1.2（LGPL-2.1+，exe 6.0MB / gz 2.2MB）+ 纯 Go 的 EBU R128 响度补偿 |

- Go module：`localmusicplayer`；npm 根包：`locallocalmusicplayer-workspace`（version `0.1.5`）。
- 只保证在 **Windows 10 1809+ / 11 x64** 上可用。

---

## 2. 常用命令

```powershell
npm install                 # 一次：Vite / ESLint / Prettier / TypeScript
npm run dev                 # 只改界面：Vite HMR，http://127.0.0.1:5173/（假数据渲染，无需 Go）
npm run dev:static          # 零构建静态预览 —— 无头自检脚本请用这个

npm run check               # lint + typecheck + test（提交前必跑）
npm run lint / typecheck / test / format:check
npm run build               # = node tools/build-frontend.mjs

wails3 task run             # 构建前端 → 生成绑定 → go build → 运行
wails3 task build           # 只出 exe 到 bin/
wails3 task package         # Windows 安装包（NSIS，需本机装 NSIS）
wails3 task dev             # 开发模式（Vite HMR + 自动重编译 Go）
wails3 task test            # go test . ./internal/... ./tools/...
wails3 task check:go        # node tools/check-gofmt.mjs + go vet + go test -race
```

注意事项：

- **不要直接跑 `wails3 dev`**：它默认 Vite 端口 9245，而 `frontend/vite.config.js` 写死 5173，
  会卡在 "Waiting for frontend dev server to start..."。请用 `wails3 task dev`（Taskfile 显式传了端口）。
- **不要用 `go test ./...`**：`node_modules/flatted/golang/pkg/flatted` 是第三方包里自带的 Go 源码，
  会被算成本模块的包。Taskfile 里显式列出了 `. ./internal/... ./tools/...`。
- 只用 npm（有 `package-lock.json` 与 npm workspaces），不要引入 pnpm/yarn。
- 内置 ffmpeg 的体积/许可证/能力核对：`node tools/build-ffmpeg.mjs --info`（重编译需 MinGW-w64 + bash，约 6~10 分钟）。

### 无头浏览器自检（CDP 驱动系统自带 Edge）

先另开一个终端跑 `node tools/dev-server.js 5173`（自检必须对静态预览跑，原因见 §6 第 9 条），然后：

| 脚本 | 覆盖 |
| :--- | :--- |
| `tools/cdp-check.js` | 14 个场景的 console 报错 + 布局体检 |
| `tools/ui-interact.mjs` | 25 项真实交互（详情页、歌词、沉浸背景、队列…） |
| `tools/check-player-host.mjs` | 12 项宿主 + 皮肤包交互 |
| `tools/ui-search.mjs` / `ui-playlist.mjs` / `ui-round2.mjs` / `ui-narrow.mjs` | 弹层 / 歌单 / 标题栏 / 窄窗口 |
| `tools/hitcheck.mjs` | **真实鼠标坐标命中测试**（能抓到「弹层透明但吃了点击」这类 bug） |
| `tools/check-app.mjs` / `onlinecheck.mjs` / `settingscheck.mjs` / `probe-live-settings.mjs` | 真实应用（Go + WebView2）里的皮肤加载 / 在线链路 / 设置落盘 / 设置层几何 |

真实应用里调试：`$env:LMPLAYER_DEBUG_PORT = "9333"; .\bin\lmplayer.exe`，再开 `http://127.0.0.1:9333/json`。
完整工具清单见 `docs/19-开发说明.md`；`tools/` 下共 71 个入库文件（59 个 `.mjs` + 7 个 `.go` + 2 个 `.ps1` + 2 个 `.js` + 1 个 `.json`），
临时探针一律命名成 `.tmp-*.mjs`（已在 `.gitignore` 里，不要提交、也不要留在 `tools/` 以外）。

---

## 3. 后端（Go）模块地图

### 3.1 根包 `package main` —— 只做「装配 + 绑定」

`main.go` 是唯一入口：装配配置 / 主题 / 曲库 / 音频服务 / 窗口 / 托盘 / 皮肤，并注册 HTTP 路由
（`/audio/*` 转发到 `internal/media`、`/skins/*`、`/online/cover`、`/boot-frame.jpg`、`/boot/reveal`）。

绑定给前端的服务（`frontend/bindings/localmusicplayer/*.js` 是 `wails3 generate bindings` 的产物）：

| 文件 | 服务 | 职责 |
| :--- | :--- | :--- |
| `services.go` | `LibraryService` / `PlaylistService` / `LyricsService` / `ThemeService` / `ConfigService` / `MediaService` / `LoudnessService` / `WindowService` | 曲库扫描与文件夹、歌单、歌词读写、主题、**配置读写（含 ****`applyPatch`****）**、媒体 URL、响度、窗口与托盘 |
| `services_online.go` | `OnlineService` | 在线搜索、音频代理、封面代理、在线歌词 |
| `services_download.go` | `DownloadService` | 在线歌曲下载（默认 `%USERPROFILE%\Music\downloads`，可配置可迁移） |
| `services_cover.go` | `CoverService` | 多封面（缓存 + 文件内嵌）、联网搜索、按设置写回文件 |
| `services_skins.go` | `SkinService` | 播放界面样式：列表 / 重扫 / 打开目录（资源本体走 `/skins/`） |
| `services_player.go` | `PlayerService` | 后端原生播放（前端不出声）；进度用**锚点 + 前端外推** |
| `services_update.go` + `update_install.go` + `update_launch_*.go` | `UpdateService` | 检查更新、镜像通道下载、安装与重启 |
| `services_ai.go` + `ai_tags.go` + `ai_vendor.go` | `AiService` | OpenAI 兼容接口：元数据清洗、下载后整理并回写标签 |
| `services_unplayable.go` | `UnplayableService` | 坏歌清单与熔断 |
| `services_app.go` / `services_mediakey.go` | `AppService` / 媒体键 | 版本、打开链接、热键 |
| `services_reference.go` | — | 给 AI 提示词提供**本机真实存在**的参考文件路径 |
| `online_wiring.go` | — | 三个第三方接口包的装配 |

其他根目录文件：`boot_frame*.go`（退出时抓帧 / 启动首屏图）、`window_reveal_*.go`（DWM 遮罩 + 露面）、
`main_window_geometry.go`、`early_theme.go`（首屏前注入主题，防白闪）、`desktop_lyrics.go` /
`desktop_wallpaper*.go`（桌面歌词与桌面背景窗口）、`http_stream_client.go`、`lyrics_meta.go`、
`app_icon_*.go`。

**平台差异一律用文件名后缀表达**：`*_windows.go` / `*_other.go`（以及 `internal/executil/command_*.go`）。

### 3.2 `internal/` 各包

| 包 | 职责 |
| :--- | :--- |
| `bootstrap/` | 数据模型、配置读写与校验、**稳定 ID**（`StableID`）、扫描根计算 |
| `library/` | 扫描、元数据缓存、增量重扫、fsnotify 递归监听（500ms 防抖） |
| `meta/` | 标签与封面解析（含多张内嵌封面）、各格式时长 |
| `lyrics/` | `.lrc` 与内嵌歌词解析；`linelevel.go` / `wordlevel.go` 分行级与字级（逐字） |
| `filter/` | 过滤规则引擎（与前端语义必须一致） |
| `media/` | 本地音频 HTTP 服务（Range / 转码缓存 / LRU 600MB） |
| `audioplay/` | DSP 与播放引擎：环形缓冲 + malgo/WASAPI；响度增益、音效、绕头轨道、跳静音、频谱 |
| `loudness/` | EBU R128（`bs1770.go` 纯 Go 实现）、测量缓存、播放优先队列调度 |
| `ffmpeg/` | 内嵌 ffmpeg 的定位、解包（`bin/*.gz` 不入库）、转码与 `LoudnessScanner` |
| `metacache/` | 多封面/歌词缓存 + **写回文件标签**（`embed.go`：m4a 多个 `covr`、flac 多个 `PICTURE`） |
| `covercache/` `onlinecache/` | 封面缓存；在线试听音频缓存（临时目录、原子落盘、下载时搬走） |
| `coverfetch/` `lyricsfetch/` `bilibili/` | ★ 三个**随时会变**的第三方接口，各自独立成包，上游只依赖聚合器 |
| `skins/` | 样式包目录扫描（只读内置资源 + 数据目录第三方）、`/skins/` 同源只读托管 |
| `theme/` | 主题目录扫描（内置主题 `builtin/` 随二进制分发） |
| `update/` | 检查更新、镜像通道、版本比较 |
| `atomicfile/` `executil/` | 原子写盘；子进程调用的跨平台封装 |

---

## 4. 前端（`frontend/`）模块地图

### 4.1 分层（Lit 迁移之后）

入口：`src/index.html`（只有一个挂载点 `<mp-app>`）→ `src/js/main.js` → `src/js/ui/app.js`（Lit 根组件）。
`main.js` 的每帧 paint 主循环**已删除**，改为「组件按依赖数组自更新」+「副作用单独跑（`runtime.js`）」。

**`ui/` 是唯一的子目录**，其余模块平铺在 `js/` 根层。按职责分组如下（不要照旧文档里
「`core/` / `host/` / `logic/`」那套不存在的目录去找文件 —— 它们从来就没有被建出来）：

```
frontend/src/js/
├── 入口与副作用    main.js（装配 + 快捷键 + 预览参数）runtime.js（与渲染无关的副作用）
├── 状态层          store.js（状态 + 过滤引擎 + 持久化 + 配置同步 + 封面集合表）
│                   bridge.js（前端 ↔ Go 桥，浏览器下自动降级假数据）
├── 播放链路        audio.js（驱动 Go 引擎；后端不可用时回退 legacy <audio>）
│                   spectrum.js  media-keys.js  desktop-lyrics.js  desktop-wallpaper.js
├── 宿主（皮肤契约）playerhost.js（播放详情页宿主）skinhost.js
├── 业务动作        shell.js tracks.js playlists.js settings.js coverpanel.js searchpanel.js
│   （渲染已剥离）  lyrics-panel.js downloads.js playerbar.js dom.js
├── 工具/主题       utils.js theme.js cover-accent.js runtime-tokens.js desktop-mode.js
│                   slider.js probe.js mock.js ai-vendors.js provider-names.js about-info.js
├── 独立窗口页      desktop-lyrics-window.js  desktop-wallpaper-window.js
└── ui/（Lit 组件，light DOM）
                    base.js app.js overlays.js titlebar.js sidebar.js content.js
                    track-table.js playerbar.js panels.js playerview.js settings-view.js
                    lyrics.js search.js cover.js add-songs.js
                    floating-lyrics.js desktop-lyrics.js
                    effect-presets.js lyric-size.js
```

- `ui/base.js#MpElement`：`createRenderRoot()` 返回 `this`（**light DOM**）+ `static deps(state)` 声明原始值数组做 `===` 比较。
  非 store 的变化源（下载快照、皮肤注册表…）改完数据后调 `requestAppUpdate()` 广播。
- 根层的业务模块**仍然活着**：状态、后端调用、菜单/拖拽等非 DOM 行为都在那里，被 `ui/` 组件 import。
  改界面前先确认某个渲染逻辑到底在 `ui/` 还是在根层模块，不要重复实现。
- 另外两个窗口页：`lyrics.html`（桌面歌词）、`wallpaper.html`（桌面背景歌词）。

### 4.2 样式

```
src/styles/index.css      唯一样式入口（@import 顺序固定）
  base.css tokens.css utilities.css
  themes/                 dark-minimal.css light-minimal.css cover-dark.css _template.css（只声明令牌）
  components/             14 个组件样式（layout / sidebar / titlebar / playerview / playerbar / tracktable …）
```

### 4.3 播放界面样式包（皮肤）

- 契约与运行时零件：`frontend/packages/player-skins/`（`contract.js` 是**契约唯一定义**，`SKIN_API_VERSION = "3.0"`）。
- **内置样式本体是数据**，在 Go 侧只读资源目录 `internal/skins/resources/player-skins/{classic,immersive}/`，
  与第三方样式**同构、同一条加载路径**（`skin.json` + `skin.js` + `skin.css` + `assets/`）。
- 第三方样式放数据目录 `player-skins/<id>/`；示例包与《皮肤说明.md》在 `internal/skins/template/`。

### 4.4 生成物与构建

```
frontend/bindings/   wails3 generate bindings 的产物（**入库**，但**不参与 Vite 打包**）
frontend/dist/       Vite 产物 + bindings 副本 + 内置主题同步源（**入库**，被 go:embed 打进 exe）
```

`tools/build-frontend.mjs` 做三件事：Vite 构建 → 拷 bindings 到 `dist/bindings` → 把
`src/styles/themes/*.css` 同步到 `internal/theme/builtin/`。

---

## 5. 运行时数据与地址

| 位置 | 内容 |
| :--- | :--- |
| `%APPDATA%\LocalMusicPlayer\` | `config.json`、`themes\`、曲库缓存、歌词与封面缓存 |
| `%LOCALAPPDATA%\LocalMusicPlayer\bin\` | 解包出来的 `ffmpeg.exe`（按内容哈希命名，只解包一次） |
| `%TEMP%\LocalMusicPlayer\online\` | 试听音频缓存（可丢弃的派生数据，不进下载目录、不进扫描） |
| `<cacheDir>/meta/covers/` 与 `meta/lyrics/` | 封面原图与歌词文本 + 各自的 `index.json` |
| `<cacheDir>/loudness/<songID>.json` | 响度测量与各挡位增益（**唯一的响度写入**，绝不改源文件） |
| `%USERPROFILE%\Music\downloads` | 默认下载目录；`EffectiveFolders() = 用户文件夹 + 下载目录` |

关键 URL（同源，CSP 与 WebView2 都要求这样）：`/audio/<songID>?t=<token>`（转发到 `internal/media`）、
`/skins/<id>/<file>`、`/online/cover?src=…`（封面代理，带域名白名单防 SSRF）、`/boot-frame.jpg`、`/boot/reveal`。

环境变量：`LMPLAYER_FFMPEG`（指定本机 ffmpeg）、`LMPLAYER_FFMPEG_DIR`（改解包位置）、`LMPLAYER_DEBUG_PORT`（DevTools 远程调试）。

---

## 6. 不变量与工作纪律

> 详细版本见 `docs/19-开发说明.md` §「设计约束（改代码时请遵守）」——**两处编号一一对应**，
> 改一条请同时改两份（这两份曾经各写各的，同一条约束在两处说法不同）。

 1. **配置键必须三处同步**：`internal/bootstrap/config.go` 的字段 + `services.go#applyPatch` + `store.js#SYNCED_KEYS`。
    漏一个键不会报错，只会**静默丢弃**（表现为「改了设置，重启就没了」）。`config_service_test.go` 会跨进程读盘验证。
 2. **`StableID` 两端必须一致**：Go `bootstrap.StableID` ↔ 前端 `utils.js#stableId`，有测试逐条比对。
    改成不一致会让歌单 / 收藏 / 队列在重扫后集体失效。
 3. **「当前」只能有一个真源**：选中行 = `state.currentId`；当前封面 = `coverSets.active`；轮播开关 = `config.coverCarousel`（全局）。
    新增任何「当前是哪个」的界面元素前，先想清楚真源在哪，不要在 DOM 里再存一份。
 4. **HTML 里不写样式；组件 CSS 只写布局，视觉一律走令牌（= 归主题）**：不加 `style="…"` / `<style>`；
    尺寸、间距、定位、栅格、过渡时长留在 `components/*.css`，凡是**不影响盒子尺寸与位置**的东西
    （颜色、描边色、背景、渐变、阴影、模糊、滤镜、不透明度）都必须 `var(--token)` ——
    字面量只出现在 `tokens.css` 与 `themes/*.css`，主题文件只声明令牌。
    新增视觉值要同时补进 `tokens.css` 与 `themes/_template.css`（用户复制的就是后者）。
    守卫测试 `frontend/tests/css-visual-tokens.test.js`：颜色 / 硬编码滤镜 / 裸 `box-shadow`、
    以及引用了不存在的令牌都会失败。**唯一例外**是独立透明页 `desktoplyrics.css`（不加载主题），
    它的视觉常量集中在该文件顶部自己的 `:root { --dl-* }`。
    布局关键尺寸（`--h-titlebar` / `--w-sidebar` / `--h-playerbar` / `--h-header` / `--row-h`）全部令牌化。
    运行时改变量走 `runtime-tokens.js#setRuntimeToken()`：它写一条带 `!important` 的 `:root` 规则，
    能盖过 `early_theme.go` 留下的首帧**行内**值（直接写 `element.style` 一来盖不过它，
    二来散落的内联副本没有一处能统一回收）。
 5. **`[hidden]` 必须真的不显示**：`utilities.css` 里已有 `[hidden] { display: none !important }` 兜底
    （组件里一句 `display: flex` 就能让 hidden 元素透明地铺满整窗、吃掉所有点击，界面表现是「点啥都没反应」）。
    **改弹层样式后跑 `tools/hitcheck.mjs` 或 `ui-round2.mjs`** —— `element.click()` 绕过命中测试，测不出这类 bug。
 6. **层级**：弹窗 `.modal-backdrop` 必须用 `--z-modal-top`（与设置层同为 `--z-modal` 时，设置层会盖住弹窗：看得见、点不动）。
 7. **设置层分组状态存在渲染之外**：`ui/settings-view.js` 的 `_activeSection`（**不在** `settings.js`），
    否则整块重渲染后导航选中态跳回第一个。
 8. **UI 的 `id` / `class` 是对外契约**：主题 CSS、皮肤包 CSS、`tools/*.mjs` 自检脚本都按它们查询，改名会静默破坏自检。
 9. **无头自检必须对静态预览服务器（`tools/dev-server.js`）跑**，不要对 Vite 跑：Vite 会给模块 URL 加查询串，
    脚本里的 `import("./js/store.js")` 会拿到**另一个空实例**（断言全读到 `songs=0`，看着像功能坏了）。
10. **皮肤插件零 import**：`player-skins` 里只允许包内相对路径；数据只从 `ctx` 拿、动作只走 `ctx.actions`、
    复用零件走 `ctx.sdk`。第三方样式是运行时从 `/skins/` import 的，一旦依赖 `store.js` 之类，接口就没法演进。
11. **插件 CSS 由宿主强制包裹**（`@layer skin` + `@scope(舞台)`）：选择器**相对舞台根**写（舞台自身用 `::scope`），
    不要写 `.playerview[data-skin="<id>"]` 前缀；想影响宿主控件观感只有一条路 —— 在清单 `colors` 里声明配色。
12. **写用户文件的代码只做最小插入**（`internal/metacache/embed.go`）：不改动音频数据、不改动任何 chunk 的语义与顺序；
    但**该同步的偏移必须同步** —— 容器头部变大后（往 `moov` 加 `covr`、往 FLAC 的 metadata 区加 `PICTURE`），
    记录数据块绝对位置的 `stco` / `co64` 会整体失效，不按 delta 修正就是**把文件写坏**
    （faststart 的 m4a 全是 `moov` 在 `mdat` 之前，必然命中）。判据是「能不能证明它安全」：
    只认白名单内的容器结构，遇到无法同步的（`moof` / `mfra` / `iloc` / `saio` / `stsh`、32 位长度溢出）
    就**放弃写入并保持原文件一个字节不动**。写盘一律「临时文件 + 原子改名」（`internal/atomicfile`）；
    不支持的格式**明确返回不支持**，不要赌一把写坏用户的东西。详见 `EmbedCover` / `EmbedLyrics` 的文档注释
    与 `internal/metacache/embed_offset_test.go`。
13. **依赖第三方网络的代码单独成包**（`internal/bilibili` / `coverfetch` / `lyricsfetch`），上游只依赖聚合器方法。
14. **不要靠读配置决定一次性的动作**：配置是前端 400ms 防抖同步过来的，「刚改完设置立刻做某件事」时后端很可能还没收到新值。
    这类选择由调用方**显式传参**（见 `CoverService.ApplyWith`）。
15. **音频必须与页面同源**：页面从 `http://wails.localhost` 加载 `http://127.0.0.1:port` 的媒体会被 WebView2 直接拒绝
    （`Media load rejected by URL safety check`）。音频、皮肤、封面代理都必须走 Wails 的 asset server 同源路由。
16. **音频在后端出声**（`internal/audioplay`，独立线程）：正常路径下前端不出声，所以 `ctx.audio` 早已从皮肤契约移除。
    进度用「后端锚点 `{positionMs, atMs}` + 前端 `performance.now()` 外推」；频谱由后端计算、皮肤**拉取式** `ctx.spectrum()` 取。
    ⚠️ 别把「前端不再有 `<audio>`」读成「`audio.js` 里那段 `<audio>` 可以删」——
    `audio.js` 仍保留一条**可达的 legacy 回退路径**（`Player.Available()` 为假时，例如浏览器预览、
    或用户机器上 WASAPI 打不开）。它是保底，不是死代码：改播放链路时两条路径都要照顾。
17. **CSS 与格式策略**：Prettier **不覆盖** `frontend/src/styles/` 与 `frontend/src/*.html`（数值是量出来的；HTML 里行内元素空格有语义）。
    源码是原生 JS，需要类型的地方写 JSDoc + 文件头 `// @ts-check`（tsconfig 是「逐个文件收紧」）。
18. **界面按钮由 Lit 模板渲染**（`ui/*.js`），不要再用运行时 `document.createElement` 注入
    —— 历史上 inject 的按钮在模块没被 import 时**静默消失**，从 HTML 里完全看不出来。

### 工作纪律

- **改前端源码后要重新构建产物**：`frontend/dist` 与 `frontend/bindings` 是入库的，
  提交 UI 改动时按仓库习惯一起更新构建产物（见近期 commit：`build(frontend): 更新前端构建产物…`）。
- **`.tmp-*` 目录是自检脚本的临时工作区**，已由 `.gitignore` 忽略（需要两条模式：`.tmp-*/` 匹配目录、`.tmp-*` 匹配文件）。
  不要把探针脚本丢在 `tools/` 之外，也不要提交这些目录的内容。
- **提交信息用中文、带类型前缀**（`feat(...)` / `fix(...)` / `docs(...)` / `build(...)`）。
- **文档有时效性，且已按这个前提整理过**：`docs/` 根目录只放**现在仍然成立**的内容
  （需求、设计、契约、开发约定、功能实现记录）；针对历史代码快照做的一次性审查 / 修复报告
  已全部移进 `docs/archive/`，并各自带上了「历史文档，已归档」抬头。
  **不要把 `docs/archive/` 里的描述当成现状**（那里的行号、架构、问题清单都已经过期）；
  需要依据时用代码、本文件与 `docs/10` / `docs/19` / `docs/42`。
  往仓库里写新的审查报告时，请同样遵守：**时效性会过期的报告不要留在 `docs/` 根目录**。
- 只在 Windows 上验证；改动平台相关代码时请同时检查 `*_other.go` 分支能不能编译。

---

## 7. CI 门禁（`.github/workflows/ci.yml`）

两个 job，命令与本地**完全一致**（避免「CI 绿、本地红」）：

```
frontend:  npm ci → npm run check（eslint + tsc + node:test）→ npm run build
go:        装 GTK4/WebKitGTK/X11/ALSA + 起 Xvfb → node tools/check-gofmt.mjs → go vet → go test -race
```

- `gofmt` 由 `tools/check-gofmt.mjs` 把关；仓库里 `*.go` 已显式 `eol=lf`（工作区 CRLF 会让 gofmt 假红灯）。
- `go test -race` 是后端最重要的门禁之一：库里有并发扫描与缓存落盘路径，历史上有过真实竞态。
- 前端测试是 `node:test`，入口 `tools/run-frontend-tests.mjs`，用例在 `frontend/tests/`。

---

## 8. 文档索引（`docs/`）

| 文档 | 用途 |
| :--- | :--- |
| `01-需求原始记录.md` · `02-界面设计方案.md` · `03-技术方案.md` | 需求与设计基线 |
| `04-后端实现说明.md` | 后端实现与尚未实现项 |
| `08-歌词工作台设计方案.md` | 歌词工作台 |
| `10-Lit迁移报告.md` · `11-性能对比报告.md` | **前端 Lit 迁移结果（当前前端架构的事实来源）**；`09` 是迁移前的方案，`§1 现状` 描述的是已不存在的旧实现 |
| `16-封面缓存内容寻址改造.md` · `17-桌面背景歌词黑闪修复.md` · `25` · `30` · `31` · `38` | 单个功能的实现记录与取舍（**仍然是当前行为**，可放心引用） |
| `36` · `37` | 帧率档位的诊断与方案：**机制仍有效**，但两文引用的 `arcanum` / `magia` 皮肤已移除，行号证据失效（文首已标注） |
| `19-开发说明.md` | **开发约定总纲**：命令、窗口/首屏、响度、在线能力、自检工具、设计约束 18 条 |
| `20-folia歌词舞台调研.md` | 外部项目（Folia）的歌词舞台调研，不描述本项目代码 |
| `42-播放器样式插件系统设计方案.md` | **皮肤契约 v3（事实来源）** |
| `screenshots/` | README 用的界面截图 |
| `archive/` | **历史文档存档**：一次性审查 / 修复报告，描述的是过期快照，勿当现状 —— 见 `archive/README.md` |

