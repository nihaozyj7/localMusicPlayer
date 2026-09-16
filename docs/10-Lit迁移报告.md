# 10 · 前端 Lit 迁移报告

> 对应方案：[`09-Lit迁移方案.md`](./09-Lit迁移方案.md)
> 性能数据：[`11-性能对比报告.md`](./11-性能对比报告.md)

---

## 1. 结论

主窗口前端（`frontend/src/js/**`）已整体迁移到 **Lit 3.3**：

- 所有界面渲染都是 Lit 模板（lit-html），**不再有 `innerHTML` 拼接**；
- 所有列表都是 keyed `repeat`，**不再有手写增量 diff**
  （`tableStates` / `rowFields` / `patchRowEl` / `reconcileRows` 全部删除）；
- 所有面板/浮层都是 Lit 组件，**不再有「谁负责改哪个节点」的隐性分工**；
- `main.js` 的 **13 个函数组成的每帧 paint 主循环被删除**，改成
  「组件按依赖数组自更新」+「与渲染无关的副作用单独跑（runtime.js）」；
- 主题（`styles/themes/*`）与播放界面样式插件
  （`frontend/packages/player-skins`）**一行未改**，按需求保持原样。

验证：`npm run check`（lint + tsc + 26 项单测）全绿、`npm run build` 成功、
无头 Edge 端到端 18 组功能检查全通过，内置 `probe.js` 布局体检
`ok:true / issues:[]`。

---

## 2. 迁移后的目录结构

`@
frontend/src/js/
├── core（与框架无关，基本未动）
│   store.js  bridge.js  utils.js  mock.js  runtime-tokens.js
│   audio.js  theme.js  backdrop.js  desktop-mode.js  desktop-wallpaper.js
│   ai-vendors.js  probe.js  slider.js  cover-accent.js(新)  runtime.js(新)
├── host（插件宿主，保持契约）
│   playerhost.js
├── logic（业务动作，渲染已剥离）
│   shell.js  tracks.js  playlists.js  settings.js
│   dom.js(兼容层)  coverpanel.js(兼容层)  searchpanel.js(兼容层)
│   lyrics-panel.js(兼容层)  downloads.js
└── ui（Lit 组件，本次全部新增）
    base.js              MpElement 基类（light DOM + 依赖数组响应）
    overlays.js          菜单 / 弹窗 / Toast / Tooltip
    app.js               <mp-app> 根组件
    titlebar.js          <mp-titlebar>
    sidebar.js           <mp-sidebar>
    content.js           <mp-content>
    track-table.js       <mp-track-table>
    playerbar.js         <mp-playerbar>
    panels.js            队列 / 选项 / 定时 / 下载 四个浮层
    playerview.js        <mp-playerview>（皮肤宿主外壳）
    settings-view.js     <mp-settings-layer>
    lyrics.js            <mp-lyrics-panel>（歌词工作台）
    search.js            <mp-search-overlay>
    cover.js             <mp-cover-layer>
    floating-lyrics.js   <mp-floating-lyrics>（预览降级）
    desktop-lyrics.js    <mp-desktop-lyrics>（桌面歌词窗口）
`@

## 3. 关键设计决策

### 3.1 Light DOM（不用 Shadow DOM）

这个项目的 CSS 全是**全局 class 选择器**，而且它们是对外契约：
主题 CSS、皮肤包 CSS、`tools/*.mjs` 无头自检脚本都按 `#id` / `.class` 查询。
套 Shadow DOM 会把它们全部挡在外面。

所以 `MpElement.createRenderRoot()` 直接返回 `this`，Lit 只负责
「模板 + 增量 diff」，样式归属不变；宿主元素统一 `display:contents`
（`styles/utilities.css`），不产生盒子，布局与迁移前完全一致。

**代价**：每个绑定会多一个注释标记节点，40 行列表首屏 DOM 节点
1708 → 2466；1000 行时两者基本相同（28451 → 28390）。

### 3.2 用「依赖数组」取代 `renderKey`

迁移前 `main.js` 每帧拼一个渲染键（视图 / 歌单 / 排序 / 密度 / 封面版本 /
多选状态 / 曲库长度 …），漏加字段就是「设置改了界面不动」的 BUG。
每个组件现在声明自己真正依赖的原始值：

`@js
static deps = (s) => [s.view, s.visibleVersion, s.currentId, s.playing, /* … */];
`@

store 广播时逐项 `===` 比较，只有变了才 `requestUpdate()`。
组件之外的变化源（下载任务、皮肤注册表、歌词缓存、封面候选）通过
`requestAppUpdate()` 显式广播，组件在 `deps()` 里读对应版本号。

### 3.3 列表：keyed `repeat` 取代手写 diff

`tracks.js` 里近 200 行的 `tableStates(WeakMap)` + 字段快照 +
`patchRowEl` + `reconcileRows` 全部删除，换成：

`@js
repeat(songs, (song) => song.id, (song, i) => this.rowTemplate(song, i, mode))
`@

换歌只改 `aria-current` / `data-playing`，封面变化时才换 `img.src`
（且仍保留「先在游离 Image 上预加载再替换」的防闪白处理，见 `coverSrc` 指令）。

### 3.4 SortableJS 与 Lit 的 DOM 归属

拖拽排序由 SortableJS 负责（需求要求不自己实现），但它会直接移动 DOM，
而 `repeat` 内部维护自己的节点链表 —— 两边同时改 DOM 会错位。
处理方式：`onEnd` 时**先把节点搬回原位**，再调用 `reorderQueue()`，
由 Lit 按新顺序移动节点。DOM 的真相始终只有一个来源。

### 3.5 与渲染无关的副作用单独成层

`runtime.js` 只在「依赖键」变化时（250ms 一档）执行：
`syncAudio` / `applyGainForSong` / 桌面歌词与桌面背景歌词推送 /
封面取色与取色主题整窗底图。这些是真实副作用，不是渲染，所以不进组件。

---

## 4. 迁移中发现并修掉的真实 BUG

| #   | 问题                                                                                | 根因                                                                                                                                         | 修法                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 播放时约每 250ms 抛一次 `TypeError: Cannot set properties of null (setting 'data')` | `slider.js` 的 `paint()` 写 `.slider__bubble` 的 `textContent`，而气泡里同时挂着 Lit 的文本绑定 —— `textContent` 把 Lit 的标记节点一起清掉了 | 明确「一个节点只有一个写入方」：`.slider` 内部（轨道/滑块/气泡）由 `slider.js` 独占，模板里不再给它挂任何绑定；设置里的数值标签也改成由滑杆写 |
| 2   | 进度条拖动时抛同类错误                                                              | 拖动中直接写 `#time-current.textContent`（该节点是 Lit 文本绑定）                                                                            | 改成只改 `state.position` + `requestUpdate()`，由模板渲染                                                                                     |
| 3   | 点表头排序没反应                                                                    | 事件委托挂在 `.tracks__body`，而排序按钮在 `.tracks__head`（body 之外）                                                                      | 委托上移到 `.tracks`（含表头），行/表头右键按 `closest` 区分                                                                                  |
| 4   | 往队列加一首歌会顺带重绘隐藏的队列面板                                              | 面板内容无条件渲染，只靠 `hidden` 藏起来                                                                                                     | 关闭时不渲染列表内容（打开时 `queueOpen` 变化会触发重绘，内容依然齐）                                                                         |
| 5   | 设置里改开关后模板状态可能不跟随                                                    | `state.config` 是原地修改的对象（引用不变），依赖数组抓不到字段变化                                                                          | 控制项自己知道改了东西，处理后显式 `requestUpdate()`（Lit 只更新变化的那几个 part）                                                           |

第 1、2 条是「Lit 的标记节点被外部 `textContent` / `innerHTML` 冲掉」
这一类问题的典型表现。迁移纪律因此写进注释：**同一节点只允许一个写入方**。

---

## 5. 行为契约（刻意保持不变）

- **所有 `id` / `class` 与迁移前一致**：皮肤包拼的 `#playerview-stage` /
  `#skin-background`、自检脚本查的 `#content-body` `.track` `.tracks__head`
  `.queue-item` `#progress` …；
- **主题与皮肤 CSS 命中方式不变**（light DOM + 同样的结构层级）；
- **浏览器预览模式**（无 Go 后端、`?theme=` `?view=player` `?tab=` `?probe=1`
  `?downloads=1`）全部可用，并新增 `?songs=N` 用于性能压测；
- **命令式 API 不变**：`openMenu` / `openModal` / `toast` / `openCoverPanel` /
  `doRescan` / `navigate` 的签名与语义未变（业务逻辑模块基本零改动）；
- **皮肤契约不变**：`playerhost.js` 仍是唯一宿主，只把「样式按钮组」的渲染
  交给组件（`skinRegistryVersion()` 作为响应式信号）。

### 未迁移（按需求）

| 范围                                             | 原因                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `frontend/packages/player-skins/**`              | 播放界面样式插件，需求明确不重构                                                                       |
| `frontend/src/styles/**`                         | 主题与组件样式；只新增了 `mp-*` 宿主的 `display:contents` 两条规则                                     |
| `internal/theme/builtin/*`                       | 由构建脚本从 `styles/themes` 同步                                                                      |
| `desktop-wallpaper-window.js` / `wallpaper.html` | 桌面背景歌词窗口本体就是「皮肤渲染器」，属于插件域（其宿主逻辑 `desktop-wallpaper.js` 已改为状态驱动） |
| Go 侧代码                                        | 无改动                                                                                                 |

---

## 6. 验证

### 6.1 自动化

`@bash
npm run check          # eslint + tsc + node --test（26 项，全绿）
npm run build          # vite 构建 + 绑定拷贝 + 主题同步
node tools/verify-lit.mjs   # 无头 Edge 端到端功能验证（18 组）
node tools/shot-lit.mjs     # 关键界面截图 → .task/shots/
node tools/perf-lit.mjs frontend/dist lit   # 性能测量
`@

### 6.2 端到端检查项（`tools/verify-lit.mjs`）

骨架与首屏 · 视图切换 · 设置层（10 张卡片 / 开关 / 分段控件 / 滚动不跳 /
导航跳转）· 播放列表浮层 · 播放详情页（进入 / 退出 / 皮肤挂载）·
播放暂停与进度 · 搜索弹层（自动聚焦）· 歌词工作台三 tab + 打轴草稿 ·
右键菜单 · 深浅色切换 · 行更新不重建 DOM · 歌单多选与批量移除 ·
队列拖拽句柄 · 封面管理面板 · 桌面歌词窗口（5 种样式 / 全透明窗口）·
下载任务面板（预览假数据）· 皮肤切换（immersive）· 排序与本地筛选 ·
`probe.js` 布局体检。

一次完整跑分的结论：**唯一控制台报错是预览环境下的
`/early-theme.js` 404**（真实应用里由 Go 侧提供），其余全部通过。

---

## 7. 后续建议

1. **`mp-track-table` 在大曲库下仍然是 O(N) 重算模板**
   （1000 首时一次全表更新的解析成本与旧实现相当）。
   若以后要支持上万首，可把行拆成 `<mp-track-row>` 子组件，
   让未变化的行完全跳过模板求值。
2. `tools/*.mjs` 里还有一批针对旧 DOM 结构的自检脚本（`check-app.mjs` /
   `ui-interact.mjs` 等）没有跑过；它们查的 id/class 都还在，
   但脚本自身依赖旧的开发服务器启动方式，建议逐步换成
   `verify-lit.mjs` 这种「打 dist 产物」的形态。
3. `desktop-wallpaper-window.js` 仍是命令式渲染（皮肤域），
   如果以后皮肤契约升级，可以顺势一起 Lit 化。
