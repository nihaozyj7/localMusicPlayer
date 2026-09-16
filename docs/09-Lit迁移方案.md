# 09 · 前端 Lit 迁移方案

> 目标：把主窗口前端（`frontend/src/js/**`）从「手写 innerHTML + 手工增量 diff」
> 整体迁移到 **Lit 3**；主题（`styles/themes/*`）与播放界面样式插件
> （`frontend/packages/player-skins`）**保持原样不重构**。

---

## 1. 迁移前审查

### 1.1 现状

| 层        | 文件                                                                                                                                                | 说明                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 数据/服务 | `store.js`(1446) `bridge.js` `audio.js` `theme.js` `utils.js` `mock.js` `probe.js` `runtime-tokens.js` `backdrop.js` `desktop-*.js` `ai-vendors.js` | 与框架无关，**保留**                     |
| 皮肤宿主  | `playerhost.js`(1158)                                                                                                                               | 播放界面皮肤契约宿主，**保留**（插件域） |
| 视图渲染  | `shell.js` `tracks.js` `playerbar.js` `settings.js` `lyrics-panel.js` `searchpanel.js` `coverpanel.js` `downloads.js` `playlists.js` `dom.js`       | HTML 字符串 + innerHTML 全量替换为主     |

统计：主窗口 JS ≈ 13 400 行；`innerHTML =` 赋值 64 处；`main.js` 的
`tick()` 每帧（订阅者回调）串行执行 **10 个 paint 函数**。

### 1.2 已存在的性能问题（实测定位）

1. **单帧全量 paint 链**：`tick()` → `applyDensity / renderKey / renderShell /
paintTrackSelection / paintPlayerBar / syncCoverAccent / syncThemeBackdrop /
renderPlayerView / paintDesktopLyrics / paintDesktopWallpaper /
syncPlaybackState / syncAudio / applyGainForSong`。
   其中 `paintPlayerBar()` **每帧 20+ 次 `querySelector`**，
   `syncCoverAccent/syncThemeBackdrop` 每帧再各查一次 DOM。
2. **渲染键字符串拼接**：`renderKey()` 每帧 `join` 整个歌单表 +
   `[...state.selectedIds].join(",")`，曲库/歌单越大越贵。
3. **字符串全量重建**：`settings.js` 每一次开关/滑条 → `renderSettings(body)`
   重建 **2 600 行** HTML，再重新 `bindSettingsSliders`，然后靠
   「记住 scrollTop / 焦点 / 当前分区」把状态补回去（`refreshSettingsLayer`）。
4. **手工增量 diff 的复杂度**：`tracks.js` 维护 `tableStates(WeakMap)` +
   `rowFields` 快照 + `patchRowEl` 逐字段比较 + `reconcileRows` 的
   `insertBefore` 游标；`shell.js`/側边栏/工具条各自维护 `lastKey`。
   任何一处漏写字段就是「界面不更新」的 BUG。
5. **`main.js` 的 `renderKey` 依赖可见列表版本号**：新增字段必须记得
   加进 key，否则表现为「设置改了但界面没变」。
6. **面板 innerHTML 重建**：队列面板 / 下载面板 / 搜索结果 / 封面面板 /
   歌词工作台都是字符串重建，靠 `panelKey` / `dataset.rendered` 去重。

> 结论：正确性靠「人去维护 diff」，性能靠「人去写 key」。这两件事都应该
> 交给框架——这正是迁移到 Lit 的直接动机。

### 1.3 迁移约束（从现有实现推导，不可破坏）

- **CSS 全部是全局 class 选择器**，且被主题 / 皮肤 CSS 依赖。
  → Lit 组件必须走 **light DOM**（`createRenderRoot() { return this }`），
  **不使用 Shadow DOM**，模板产出的 class / id / 结构尽量与现状一致。
- **DOM id / class 是对外契约**：`probe.js`、`tools/*.mjs` 自检脚本、
  用户主题 CSS、`desktop-wallpaper-window.js` 都按 `#id` / `.class` 查询。
  → 迁移后**保留全部 id 与 class**（`#content-body` `.track` `.tracks__head`
  `.queue-item` `#playerview-stage` …）。
- **播放界面皮肤契约不变**：`#playerview` / `#playerview-stage` /
  `#skin-background` / `ctx` 全部保留，`playerhost.js` 只需把
  「按钮组渲染」交给 Lit 组件。
- **CSP**：`script-src 'self'`，无内联脚本；样式统一走 CSSOM / class。
  Lit 默认的 `style` 元素注入方式在 light DOM 下不适用 → 我们用全局 CSS。
- **浏览器预览模式**（无 Go 后端）必须继续可用（`?theme=` `?view=player` 等）。

---

## 2. 目标架构

```
frontend/src/js/
  core（保留，几乎不动）
    store.js  bridge.js  utils.js  mock.js  runtime-tokens.js  audio.js
    theme.js  backdrop.js  desktop-mode.js  desktop-lyrics.js
    desktop-wallpaper.js  ai-vendors.js  probe.js  slider.js
  host（保留，插件宿主）
    playerhost.js              # 皮肤契约 / 歌词装载 / 轮询 / 频谱推送
  logic（保留业务，去渲染）
    shell.js  tracks.js  playlists.js  settings.js  lyrics-panel.js
    searchpanel.js  coverpanel.js  downloads.js  dom.js(兼容层)
  ui（新增：Lit 组件）
    base.js          # MpElement（light DOM）+ store 依赖响应 + icon()
    overlays.js      # mp-menu / mp-modal / mp-toasts（命令式 API 不变）
    app.js           # <mp-app> 根组件
    titlebar.js      # <mp-titlebar>
    sidebar.js       # <mp-sidebar>
    content.js       # <mp-content> + <mp-content-header>
    track-table.js   # <mp-track-table> + <mp-track-row>（keyed repeat）
    playerbar.js     # <mp-playerbar> + <mp-progress>
    panels.js        # 队列 / 选项 / 定时 / 下载 面板
    playerview.js    # <mp-playerview>（外壳 + 样式按钮组）
    settings-view.js # <mp-settings-layer>（设置模板）
    lyrics-view.js   # <mp-lyrics-panel>
    search-view.js   # <mp-search-overlay>
    cover-view.js    # <mp-cover-layer>
    floating-lyrics.js # <mp-floating-lyrics>（预览降级）
  main.js            # 只负责装配与后端事件，删除 tick() 主循环
  windows/
    desktop-lyrics-window.js   # 迁移为 <mp-desktop-lyrics>（独立窗口）
```

### 2.1 响应式模型

```js
class MpElement extends LitElement {
  createRenderRoot() { return this; }          // light DOM
  static deps = (s) => [...];                  // 只读原始值数组
  // 订阅 store：deps 逐项 === 比较，变了才 requestUpdate()
}
```

- 取代 `renderKey`：**每个组件声明自己真正依赖的字段**，
  不再需要一个全局大 key，也不会「忘了加字段 → 界面不更新」。
- 取代 `tick()`：没有全局主循环，谁的数据变了谁更新。
- 每帧（进度）只会让 `<mp-progress>` 更新；切歌只会让底栏 / 表格 / 详情页更新。
- 额外变更源（下载任务、皮肤注册表、歌词缓存）通过
  `requestAppUpdate()` 显式广播，组件在 deps 里读取对应快照。

### 2.2 列表渲染

用 `lit/directives/repeat.js`（keyed）替换手写 `reconcileRows`：

- key = `song.id` → 换歌不再重建行、封面 <img> 不重新解码；
- 行内变化由 Lit 的 part 级 diff 处理（只写变化的 text/attribute）；
- `<img>` 的「先在游离 Image 上预加载再替换 src」仍保留
  （`setCoverSrc`，避免列表批量闪白）。

### 2.3 拖拽排序（SortableJS）与 Lit 的配合

SortableJS 会直接移动 DOM 节点，而 Lit 的 `repeat` 内部维护自己的节点链表 ——
两者同时改 DOM 会错位。处理方式：
拖拽结束（`onEnd`）时**先把节点搬回原位**，再调用 `reorderQueue()`，
由 Lit 按新顺序移动节点。这样 DOM 的真相始终只有 Lit 一个来源。

---

## 3. 迁移步骤

| 步骤 | 内容                                                                              | 验收                                               |
| ---- | --------------------------------------------------------------------------------- | -------------------------------------------------- |
| S1   | `ui/base.js` + `ui/overlays.js`；`dom.js` 变兼容层                                | 菜单/弹窗/Toast 行为不变                           |
| S2   | `<mp-app>` + 标题栏 / 侧边栏 / 内容区骨架；`index.html` 只剩图标精灵 + `<mp-app>` | 首屏结构、`probe.js` 通过                          |
| S3   | `<mp-track-table>`（keyed repeat）+ 空态                                          | 1000 首滚动、排序、多选、右键菜单                  |
| S4   | `<mp-playerbar>` + `<mp-progress>` + 队列/选项/定时/下载面板                      | 进度、音量、模式、面板拖拽                         |
| S5   | `<mp-playerview>` 外壳 + 样式按钮组；`playerhost.js` 保持契约                     | 换样式、进入/退出动效、皮肤数据推送                |
| S6   | `<mp-settings-layer>`（设置模板 Lit 化，动作逻辑复用 `settings.js`）              | 全部设置项生效、滚动/分区不跳                      |
| S7   | 歌词工作台 / 搜索 / 封面 / 桌面歌词窗口                                           | 三 tab、在线搜索、封面管理                         |
| S8   | 删除 `main.js#tick` 与全部手写 diff/key 代码                                      | 无 `renderKey`/`lastKey`/`reconcileRows`           |
| S9   | 构建 + lint + tsc + 单测 + 无头 Edge CDP 功能与性能验证                           | 全绿                                               |
| S10  | 报告                                                                              | `docs/10-Lit迁移报告.md` `docs/11-性能对比报告.md` |

---

## 4. 性能验证方法

沿用项目已有的无头 Edge + CDP 方案（`tools/cdp-*.mjs`），新增
`tools/perf-lit.mjs`：

1. 起本地静态服务（dist 或 src）、启动 headless Edge、连 CDP；
2. 注入 `1000 / 3000` 首假曲库，测量：
   - **首屏**：`domContentLoaded → body[data-ready]`；
   - **切歌一帧的渲染耗时**：`PerformanceObserver(longtask)` /
     包裹一次 `togglePlay/playSong` 后手动 `performance.measure`；
   - **DOM 变动量**：`MutationObserver` 统计 1 次切歌 / 1 次设置开关产生的
     mutation 条数与新增节点数；
   - **常驻帧开销**：`requestAnimationFrame` 计时 60 帧的脚本时间。
3. 迁移前后各跑一次（迁移前用 git stash / 旧 dist），产出对比表。

---

## 5. 风险与对策

| 风险                                                 | 对策                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| light DOM 下自定义元素默认 `display:inline` 破坏布局 | 统一 `mp-* { display: contents }`（见 `utilities.css`），宿主不产生盒子 |
| `repeat` 与 SortableJS 争抢 DOM                      | onEnd 先复位再交给 Lit（见 2.3）                                        |
| 面板动画依赖 `hidden` → `data-state` 两帧切换        | 组件内保留同一套 `data-state` 机，`updated()` 里翻转                    |
| 设置层输入框焦点丢失                                 | Lit 的 part 级 diff 不再重建 input，天然不丢焦点                        |
| 主题 / 皮肤 CSS 依赖结构                             | 模板 1:1 保留 class 与层级                                              |
| 皮肤包不能改                                         | `playerhost.js` 与包 API 保持；只换调用方                               |

---

## 6. 明确不迁移

- `frontend/packages/player-skins/**`（播放界面样式插件，含其 CSS 与主题 CSS）
- `frontend/src/styles/**`（除新增 `mp-*` 宿主显示规则外不改）
- `internal/theme/builtin/*`（由构建脚本从 `styles/themes` 同步）
- Go 侧任何代码
