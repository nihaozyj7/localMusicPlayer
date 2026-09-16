# 14 · UI 层与 CSS 层审查补充（第三轮 · 前端表现层专项）

> 补充 `docs/12-性能审查报告-第二轮.md` 与 `docs/13-代码质量审查报告.md`。
> 那两份报告的实测数据与 P0/S1 结论不受本文件影响；本文件只补齐**表现层**
> （`frontend/src/js/ui/*`、`frontend/src/styles/**`、`frontend/packages/player-skins/**`、
> `frontend/src/index.html`、`tools/*.mjs`）的深度。
> 标记 ✅ 的条目由我逐行复核过；其余来自同一套「必须引用行号」的专项审查
> （其子审查给的行号我已抽查，其中 arcade.css 的若干 keyframe 行号在合并时已修正）。

---

## 0. 实测基准

| 指标                    | 数值                                                                    |
| ----------------------- | ----------------------------------------------------------------------- |
| 源码 CSS                | 32 个文件 / **280,079 B**，其中 `player-skins` 包占 **95,179 B（34%）** |
| `frontend/dist` 合计    | **686,612 B** / 37 个文件                                               |
| 入口 JS                 | 287,287 B                                                               |
| **唯一的 CSS 产物**     | **161,957 B**                                                           |
| lit vendor chunk        | 41,445 B（独立，未与业务代码混合）                                      |
| `index.html`            | 27,704 B                                                                |
| 字体 / 图片 / sourcemap | **均为 0**（没有可优化的二进制资产）                                    |
| 首屏传输量              | index 550.7 KiB · wallpaper 275.0 KiB · lyrics 212.5 KiB                |

严重度统计：**1 Critical · 12 High · 21 Medium · 14 Low**。

---

## 1. 渲染与合成层（性能）

### C1 ✅ 曲目表零虚拟化、零 containment —— 与性能报告 P0-2 同一问题

`frontend/src/js/ui/track-table.js:168-172` 对**全部** `state.visibleSongs` 建行。
全仓 `content-visibility` 命中 **0 次**，`contain` 命中 **1 次**
（`frontend/packages/player-skins/src/skins/magia.css:110`）——主机 UI 完全没有 containment。
滚动容器是 `.content-body`（`layout.css:89-95`），表格自己被裁切：

```css
/* frontend/src/styles/components/tracktable.css:23-24 */
overflow: hidden;
overflow: clip;
```

性能报告里实测的 **5,000 首 = 136,389 个 DOM 节点 / 首帧 2,882 ms** 就是这条的直接后果。

**一行成本的缓解方案**（在真正虚拟化之前先做）：

```css
.track {
  content-visibility: auto;
  contain-intrinsic-size: auto var(--row-h);
}
```

行高由 `data-density` 决定且是常量（`--row-h`），所以 `contain-intrinsic-size` 能算准，
浏览器会跳过视口外行的布局与绘制而**不改变任何现有逻辑**。真正的窗口化仍是 P0-2 的目标。

### H1 ✅ 进度/音量滑条动画的是 `width`/`height`，且每个 tick 都被重写

```css
/* frontend/src/styles/components/playerbar.css:316-324 */
/* 填充与滑块位置由 JS 写入具体属性（width / left），不用自定义属性，
   因为 CSP style-src 'self' 会拦截 CSSOM 写自定义属性 */
.slider__fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0;
  border-radius: var(--r-full);
  background: var(--accent);
  transition: width 80ms linear;
}
```

`playerbar.css:313` 的滑轨也 `transition: height var(--dur-fast) var(--ease)`，
`playerbar.css:350-352` 还在 hover 时改 `--track-h: 6px`。

`frontend/src/js/ui/playerbar.js:133` 在 `updated()` 里写入填充比例，而 `updated()`
因为 `playerbar.js:51` 的 deps 含 `s.position` 而**每次 store 广播都跑**。
`width`/`height` 是布局属性：每次写入都让播放条那一行样式失效并**重启 80ms 过渡**，
60 Hz 下过渡永远无法收敛（每秒最多重启 60 次）。

**说明与修法**：注释解释了为什么用具体属性而不是自定义属性（CSP 限制）——这个理由成立，
但**不代表必须动画布局属性**。填充改用 `transform: scaleX()`（`transform-origin: left`）、
滑轨 hover 改用 `scaleY()`，JS 只写 `transform`，既绕开 CSP 又完全可合成。

> 这也是 H1 值得单列的原因：全仓只有 6 条存活声明在过渡布局属性
> （`playerbar.css:274/313/324`、`downloadpanel.css:201`、`lyricspanel.css:434`），
> 主机 UI 其余部分**已经**是 transform/opacity 驱动。H1 是例外，不是普遍模式。

### H2 歌词行过渡的是 `font-size` 与 `filter` —— 文本重排 + 重新栅格化

```css
/* frontend/packages/player-skins/src/lyrics.css:89-96，classic / immersive / minimal 共用 */
transition:
  opacity var(--dur) var(--ease),
  transform var(--dur) var(--ease),
  font-size var(--dur) var(--ease),
  color var(--dur) var(--ease),
  filter var(--dur) var(--ease);
cursor: pointer;
filter: blur(0.3px);
```

当前行靠改 `font-size`（`lyrics.css:115-121` 的 `--lyric-size-active`）来强调，
于是「强调」被实现成**文本度量变化**：滚动区重新布局，所有行在过渡期间持续重新栅格化。
每行还常驻 `filter: blur(0.3px)`，当前行再把它过渡掉。`fx-lyrics.css:75-79` 同样，
`magia.css:945-950` 与 `magia.css:962` 也一样（`font-size: calc(var(--mg-lyric-size) * 1.16)`）。

**修法**：`font-size` 保持常量，强调改用 `transform: scale()`——
`transform-origin` 在 `lyrics.css:88`、`fx-lyrics.css:74`、`magia.css:944` 都已经设好；
并把 `filter` 移出过渡列表。

### H3 ✅ 常驻 `will-change`，而代码库自己在别处写明了不该这么做

同一份代码里同时存在**正确示范**与**反面示范**：

```css
/* frontend/packages/player-skins/src/fx-lyrics.css:130-132 —— 正确 */
/* 刻意不写 will-change：一首歌几十行 × 每行几十个字 = 上千个元素，
   逐个提升成合成层会把显存和图层树撑爆（实测表现为整片文字糊掉）。 */
```

但下面这些都常驻提升：

| 位置                                                                | 对象                                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------- |
| `layout.css:133-137`                                                | `will-change: transform, opacity`（整个 `.playerview`，全窗层） |
| `background-layer.css:33-38`                                        | `will-change: opacity, transform`（另一个全窗层 `.skin-bg`）    |
| `magia.css:984-986`                                                 | `will-change: transform, opacity` —— **当前歌词行的每个字**     |
| `anime.css:279`、`arcade.css:214`、`magia.css:255`、`magia.css:662` | 其他常驻提升（全仓共 9 处）                                     |

`magia.css:984-986` 那条正好违反上面引用的策略：当前行有 10~40 个字，
每次换行都剥掉旧行、建新行（`magia.js:879-900`），**提升的图层集合每换一行就翻一次**。

反证：桌面背景歌词窗口**已经**在主动中和宿主的提升
（`desktopwallpaper.css:58-61` 的 `will-change: auto`）——说明这个开销是真实的。

**修法**：删掉常驻 `will-change`。Chromium 在动画期间会自动提升、结束自动回收，常驻只会白占显存。

### H4 `magia` 皮肤暂停后仍以显示刷新率重绘 canvas

`frontend/packages/player-skins/src/skins/magia.js:1147-1150, 1195-1200`

```js
function step(now) {
  if (!inst) return;
  inst.raf = requestAnimationFrame(step);
  ...
    inst.particles.frame(dt, { /* … */ live: inst.anim && !inst.closed });
```

`live` 只关掉了粒子的**积分步进**；canvas 仍被清空、最多 96 个精灵仍被重绘，
外加 8 次 `setProperty`（`magia.js:1177-1188`）和 `lyrics.paint()/follow()`（`magia.js:1191-1192`）。
暂停时这些全是纯浪费。

**修法**：暂停且 pulse/cut/beat 已衰减到 0 时停掉循环；`frame()` 在 `!live` 时早退。

### H5 `anime` / `arcade` 关闭详情页后不停止逐帧相机

`frontend/packages/player-skins/src/skins/anime.js:367-369`（`arcade.js:428-431` 同形）

```js
case "close":
  if (inst.bg) inst.bg.dataset.anim = "off";
  break;
```

`camera.setEnabled()` 只在 options patch 里被调用（`anime.js:312`、`arcade.js:354`），
所以关闭后 `fx-camera` 的 rAF 仍在写 transform。`fx-camera.js:246-251` 只在
`visibilitychange` 时停。**`magia` 在 close 时正确关闭了**（`magia.js:1391-1396`）——
这个不对称本身就是 bug 的证据。

### H6 `arcade` 用 `drop-shadow` + `brightness` 按频谱速率驱动

```css
/* frontend/packages/player-skins/src/skins/arcade.css:62-64, 83 */
filter: drop-shadow(0 0 calc(var(--ag-bass, 0) * 10px) color-mix(in oklab, var(--ag-neon) 70%, transparent));
...
filter: brightness(calc(1 + var(--ag-bass, 0) * 1.1));
```

`arcade.js:226` 每个频谱 patch（约 25~30 Hz，由 `desktop-wallpaper.js:356` 的
`SPECTRUM_INTERVAL = 40` 定速）写 `--ag-bass`。`drop-shadow` 的模糊半径变化 = **整层重新栅格化**，
而它作用在 `.ag-bg__grid`（`arcade.css:49-53`，`left:-60%`/`right:-60%`、
`perspective(320px) rotateX(76deg)`）上；`brightness` 又作用在 18 个 `.ag-pixel` 上。

**修法**：把辉光做成预模糊的渐变层，只动画它的 `opacity`。

### H7 全窗图层上的无限 `background-position` keyframes（不可合成）

```css
/* frontend/packages/player-skins/src/skins/arcade.css:525-537 */
@keyframes ag-grid {
  from {
    background-position:
      0 0,
      0 0;
  }
  to {
    background-position:
      0 0,
      0 52px;
  }
}
```

同类还有 `magia.css:1091-1099`（`mg-grid-run`，作用在 `left:-30%`/`right:-30%`/`height:68%` 的层）
与 `magia.css:1101-1109`（`mg-streak-run`）。`background-position` **不可合成**，
所以每条都在**永久重绘自己那一层**（2.6 s / 7 s / 12 s 无限循环）。
宿主侧同类：`frontend/src/styles/base.css:219-226` 的 ```keyframes shimmer`（`.u-skeleton` 用）。

**修法**：把图案放进子元素，用 `translate3d` 动画它，让动画走合成器。

---

## 2. 设置层与滚动热路径

### H8 ✅ 设置层每次渲染都重算全库聚合，而 deps 里居然有音量

`frontend/src/js/ui/settings-view.js:151-172` 的 deps **第 171 行是 `s.volume`**；
`render()`（`:244`）无条件求值全部十张卡片，其中三张随曲库规模线性增长：

```js
settings-view.js:302   const count = state.songs.filter((s) => s.path.startsWith(f.path)).length;
settings-view.js:397   const { kept, excluded, total } = applyRules(state.allSongsRaw, state.filterRules);
settings-view.js:1005  const total = state.songs.reduce((sum, x) => sum + x.duration, 0);
settings-view.js:1006  const bytes = state.songs.reduce((sum, x) => sum + x.size, 0);
```

后果：**设置层开着时拖动底部音量条** = 「文件夹数 × 曲库数」次 `startsWith` + 一次全库
`applyRules` + 两次全库 `reduce`，全部同步发生在 Lit 渲染里。
音量滑条按 `pointermove` 触发（`store.js:1156-1158` 的注释自己写明「一次拖动几十上百次」）。

**修法**：先把 `s.volume` 从 deps 删掉（几乎零成本）；再把三个派生值按
`folders / filterRules / visibleVersion` 的修订号做 memo。

### H9 设置层导航高亮在每次 scroll 事件上强制布局，且未节流

`frontend/src/js/ui/settings-view.js:1122-1127`

```js
const top = scroll.getBoundingClientRect().top + 80;
let current = SECTIONS[0].id;
for (const s of SECTIONS) {
  const node = this.querySelector('[data-section="' + s.id + '"]');
  if (node && node.getBoundingClientRect().top <= top) current = s.id;
}
```

监听器以**捕获阶段**注册在宿主上（`settings-view.js:226`），所以每个滚动帧都触发：
1 次 + 最多 8 次 `getBoundingClientRect()`（强制布局）、最多 8 次 `querySelector`，
然后 `paintNav()`（`:1139-1143`）写 8 个属性。

**修法**：rAF 合并、缓存节点、改用 `offsetTop` 比较而不是 rect。

### M2 渲染内部的逐行线性扫描

- `frontend/src/js/ui/panels.js:228` 的 `const index = state.queue.indexOf(song.id);`
  —— 每个队列项一次，整体 O(n²)
- `frontend/src/js/ui/cover.js:73` 的 `state.songs.find((x) => x.id === id) || null`
  —— 每次封面层渲染一次全库扫描

**修法**：每次渲染建一份 id→index 映射。

### M3 `render()` 里读 localStorage + `JSON.parse`，且每次按键都整层 diff

`frontend/src/js/ui/search.js:114-117` 的 `render()` 调 `loadHistory()`
（`:32-40` 做 `localStorage.getItem` + `JSON.parse`）；输入框每次按键都 `bump()`
重渲染（`:141-144`），连带重跑 `bodyContent()` 和未加 key 的 `history.map`（`:186-199`）。

### M4 工具提示定位每次 hover 都做样式重算 + 布局

`frontend/src/js/ui/overlays.js:396-398` 每次都 `getComputedStyle(document.documentElement)`
读 `--h-titlebar`，然后 `:404-408` 先写 `left`/`top` 再读 `offsetWidth`/`offsetHeight`。
`position()` 由每个 `[data-tip]` 元素的 `mouseover` 触达（`:439-443`）。

**修法**：缓存该令牌（它是会话常量）、用 `transform` 定位、缓存测得的尺寸。

---

## 3. 跨窗口推送开销

### H10 频谱数组每次推送都重建；换歌时整份 CSS 令牌表被镜像一遍

```js
// frontend/src/js/desktop-wallpaper.js:411
return { type: "spectrum", bands: Array.from(data, (v) => Math.round(v * 100) / 100) };
```

每 40 ms 一个新的 32 元素数组 + 逐元素取整。进度 patch 本身是**按帧**发的
（`desktop-wallpaper.js:290-300`）——即每帧一次 IPC 到背景歌词窗口，该窗口再重绘自己那份皮肤。
另外 `collectThemeTokens()`（`:513-534`）在令牌签名变化时递归遍历所有样式表，
而 `tokenSignature()` 含 `c.coverSeed`——用封面取色主题时**每次换歌都会跑**。

**修法**：复用预分配数组（或发 `Int8Array`）；进度合并到约 30 Hz（除非当前皮肤声明需要逐帧位置——
`skinSpectrumBands()` 已经会读 `skin.spectrum`）；令牌表改成 diff 而不是重收集。

### M8 推给背景歌词窗口的每个令牌都带 `!important`，且整条规则删了重建

`frontend/src/js/desktop-wallpaper-window.js:321-330` 先循环 `deleteRule` 清空，
再用 `name + ":" + value + " !important"` 重建约 100 条声明。
每次令牌变化（封面种子、玻璃模糊、歌词字号…）都会让文档样式失效并重新解析整条规则。
`!important` 只是因为 `:root[data-theme=…]` 的特异性高于 `:root`（`:306-308` 有说明）。

**修法**：改成 `:root[data-theme]` 形状的覆盖（不需要 `!important`），并 diff 令牌表。

### M21 背景歌词窗口的 IPC 失败没有任何退避

`frontend/src/js/desktop-wallpaper.js:428-432`

```js
backend.updateDesktopWallpaper(patch).catch((err) => {
  console.warn("[desktop-wallpaper] 同步背景歌词失败", err?.message ?? err);
});
```

若窗口已消失而标志位还在，**每帧都会打一条日志**，没有失败计数也没有关闭路径。
该模块其余部分很谨慎（patch 做值比较、有 `resetDesktopWallpaperSync`），
所以加一个「连续失败 N 次即停」很契合现有设计。

---

## 4. 产物与构建

### H11 ✅ 三个窗口共用一份 161,957 B 的 CSS

`frontend/vite.config.js:151-156` 的注释**明确承认**了这个取舍：

```js
// 两个入口共用一份 CSS 产物（两个 HTML 的 <link> 指向同一个 style-*.css）。
// 代价：任何「只服务于某张页面」的样式表都会同时作用到另一张页面上。
cssCodeSplit: false,
```

实测后果：`index.html`（27,704 B）、`lyrics.html`（1,700 B）、`wallpaper.html`（3,926 B）
都 `<link>` 同一个 161,957 B 的样式表。即两个小窗口各自下载的 CSS 是**自己 HTML 的 41 倍 / 95 倍**，
其中 `[data-skin=magia|arcade|anime]`、曲目表、设置层、弹出层组件 CSS 在那两个窗口里**永远不可能匹配**。

**修法**：给 `lyrics.html` / `wallpaper.html` 各自的 CSS 入口（只 import 皮肤包），
主窗口保留单文件。这会同时解掉 §5 里那两个窗口「手工给自己的覆盖加作用域」的维护成本
（`desktoplyrics.css:17-22`、`desktopwallpaper.css:15-19` 就是为此存在的）。

### M18 ✅ 构建配置正好压掉了它自己需要的体积信号

```js
// frontend/vite.config.js:157-159
sourcemap: false,
reportCompressedSize: false,
chunkSizeWarningLimit: 900,
```

主 chunk 是 280.6 KiB，而 `chunkSizeWarningLimit: 900`（KB）**高于它**——
Rollup 永远不会对最大的产物报警；`reportCompressedSize: false` 又移除了日志里的 gzip 数字。
剩下的唯一信号是 `tools/build-frontend.mjs:112` 的一行 print。

**修法**：`chunkSizeWarningLimit` 降到实际目标（例如 300），`reportCompressedSize` 打开。

相关：`tools/build-frontend.mjs:74` 用 `cp`（合并而非清空）拷贝 `bindings/`，
而 `emptyOutDir` 归 Vite 管（`vite.config.js:133`），所以 `--skip-vite` 路径
（`build-frontend.mjs:121-131`）**可能发布已从源码删除的绑定文件**。

### H12 构建工具重复：5 份漂移的运行时 shim、约 30 份复制粘贴的 CDP 脚手架

- `tools/` 下 `msedge.exe|remote-debugging-port` 有 **62 处命中**，
  同一套无头 Edge 前导 + CDP bootstrap 被复制到 `cdp-measure.mjs`、`verify-lit.mjs`、
  `perf-lit.mjs`、`shot-lit.mjs`、`cdp-svg-audit.mjs`、`media-check.mjs`、
  `origin-check.mjs`、`ui-*.mjs`、`check-*.mjs`、`verify-*.mjs`。
  只有 `tools/measure-template.mjs` 被抽出来，且**只有 `tools/cdp-measure.mjs:18` import 了它**。
- Wails 运行时 shim 有 **5 份**（`frontend/vite.config.js:30-51`、`tools/dev-server.js:100-121`、
  `tools/verify-lit.mjs:49-55`、`tools/cdp-measure.mjs:51-54`、`tools/perf-lit.mjs:52-55`），
  其中两份**缺少 `WML`/`Flags`/`Window`**——于是页面可以「通过 perf-lit」却在真实应用里挂掉。
- 无失败清理：`tools/verify-lit.mjs:573-575` 只在 happy path 释放资源，
  没有顶层 `catch/finally`，断言失败会**泄漏一个 msedge.exe 进程和一份临时 profile**。
- `tools/cdp-check.js:152-157`（及三份副本）的 `send()` promise **没有超时也不会 reject**，
  一条消息丢失就让作业永久挂住。
- `tools/cdp-check.js:205-208` 退出时没有 `child.kill()`，且复用固定的、不删除的 profile 目录（`:126`）。
- 33 个硬编码端口，其中 **9333 出现在三个脚本里**——两个 verify 并发跑会接到同一个浏览器上。
- 只有 **4 / 48** 个工具脚本被接进任何 manifest，没有 `npm test` / CI 入口，其余全靠手动。

### L14 作者特定的绝对路径 + 未校验的下载

```js
// tools/build-ffmpeg.mjs:64
const MINGW_BIN = process.env.MP_MINGW_BIN || "C:\\Users\\Example\\Application\\mingw64\\bin";
```

有 env 覆盖，但默认值是**作者本机路径**。同文件 pin 了 `SOURCE_VERSION = "8.1.2"`（`:59`）
却只查 HTTP 状态码（`:92-93`），之后永久信任缓存 tarball；体积守卫只 warn（`:136-138`）。
Edge 路径在 20+ 个脚本里硬编码，其中至少 `tools/cdp-svg-audit.mjs:23` **没有 ProgramFiles(x86) 回退**。

> **对专项审查的一处更正**（避免误报）：`frontend/dist/index.html:26` 引用的
> `/early-theme.js` **不是**缺失的构建产物——它由 Go 侧生成
> （`internal/theme/early_theme.go`；`internal/theme/theme.go:42, 182` 记录了该 handler）。
> 所以「404 风险」是错的，无需处理。

---

## 5. CSS 可维护性

### M5 ✅ `[hidden]` 被全局守卫，却仍有 25 处组件级重复声明

```css
/* frontend/src/styles/utilities.css:19-21 */
[hidden] {
  display: none !important;
}
```

`utilities.css:9-18` 的注释解释了为什么这么做。这条全局保证让所有组件级覆盖都**成为死规则**：
`content.css:355`/`412`、`downloadpanel.css:38-41`/`70`/`192`、`layers.css:61-64`、
`layout.css:144`、`lyricspanel.css:29`/`171`/`183`/`203`/`307`/`588`、
`overlay.css:28`/`263`/`359`/`485`/`532`/`638`/`824`、
`playerbar.css:536`、`searchpanel.css:35`/`161`/`173`、`background-layer.css:47`。

**修法**：全删，只留全局那一条。

### M6 死 CSS 块（已确认在 `frontend/src`、`internal/`、`tools/` 里都没有生产者）

| 位置                                                                                                             | 内容                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings.css:202-248`                                                                                           | 整个 `.progress-line` 家族（base / `__text` / `__track` / `__bar` + 21 条 `[data-value]`）。仅剩的引用是它自己的注释和 `downloadpanel.css:205` 的一句注释 |
| `settings.css:216`                                                                                               | `background: var(--surface-sunken);` —— **该令牌在全仓只出现这一次，从未被声明** ✅（已 grep 全部 CSS 确认）                                              |
| `content.css:178-200`、`:289-296`、`:316-325`                                                                    | `.search__input` 家族（标题栏搜索框已被弹出层取代）                                                                                                       |
| `searchpanel.css:259-290`、`:412-425`                                                                            | `.search-overlay__tabs`/`__tab*`（该层今天只有一个 tab）、`.search-row__time`/`__source`                                                                  |
| `overlay.css:696-698`、`:610-614`                                                                                | `.jsonly-when-empty`、`.menu__sub`                                                                                                                        |
| `sidebar.css:206-210`、`titlebar.css:59-65`、`layers.css:249-253`、`settings.css:176-192`、`content.css:322-324` | `.sidebar__empty`、`.titlebar__caption`、`.cover-panel__row`、`.prompt-box`、`.btn--label-hide span`                                                      |
| `utilities.css:23-25, 28-34, 36-39, 86-96, 99-109`                                                               | `.u-invisible`、`.u-drag`、`.u-no-drag`、`.u-scroll`、`.u-sr-only`、`.u-skeleton` 从未被使用。`.u-sr-only` 是**可访问性辅助类却零用户**                   |
| `fx-lyrics.css:127`、`fx-lyrics.js:187`                                                                          | `--fxl-ch` 无人设置；`--n` 写了没人读                                                                                                                     |
| `lyrics.css:129-154`                                                                                             | `.lyric__word` / `[data-active]` / `.lyric__trans` / `.lyric__interlude` —— `lyrics-view.js:159-167` 只产出 `.lyric`                                      |

`--surface-sunken` 尤其典型：它是**写错的令牌名**，今天不可达，
但一旦那段 markup 回归，轨道会渲染成透明——比缺失更糟。

### M7 重复选择器与跨文件职责泄漏

- `titlebar.css:111-114` 与 `searchpanel.css:9-12` 声明**完全相同**的
  `.titlebar__btn[aria-pressed="true"]` 块，而后者是另一个组件文件。
- `.content-body` 在 `layout.css:89-95`（骨架）和 `tracktable.css:256-258`（`scroll-padding-top`）
  各声明一次——表格文件伸手进了宿主布局。
- `tracktable.css:62-75` 把 `:40-42` 的 `grid-template-columns` 逐字重复了一遍。
- 密度规则在 `tracktable.css:596-651` 写成两遍（`:root[data-density=…]` 与 `.tracks[data-density=…]`），6 组重复选择器对。
- `frontend/src/js/ui/panels.js:520` 用 options 面板的类（`class="options-panel__btn"`）
  给睡眠面板的关闭按钮加样式，把两个不相关组件耦合在一起。

> 值得强调的**反面好消息**：全仓**只有这一处**逐字重复的选择器对，选择器整体是扁平单类，
> 没有特异性战争。唯一的刻意层叠技巧在 `lyricspanel.css:498-505` 且有注释说明。

### M17 `desktoplyrics.css` 硬编码颜色，打破了其余 CSS 遵守的令牌契约

```css
/* frontend/src/styles/desktoplyrics.css:87-91 */
.dl:hover,
.dl:focus-within {
  background: rgba(16, 16, 20, 0.86);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(16px);
}
```

`frontend/src/styles/tokens.css:5` 明确规定了「组件 CSS 不得硬编码颜色，只用 `var(--…)`」。
同类越界：`overlay.css:27`/`41`/`256` 的 `rgba(0, 0, 0, 0.42)`、
`overlay.css:480` 的 `z-index: 5000`、`overlay.css:793` 的 `z-index: 9999`
（而 `tokens.css:174-186` 定义了一整套 z-index 体系，最大 80——**令牌系统已经不再描述现实**）。
后果：浅色主题无法重设桌面歌词的 hover 外观。

### 其他 CSS 层问题（汇总）

| 编号 | 位置                                                                                                                                                                                                                            | 问题                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L6   | `overlay.css:475-483`/`791-793`、`index.html:42-46`                                                                                                                                                                             | 游离于令牌体系之外的 `z-index: 5000 / 9999`，而 `tokens.css:174-186` 的注释恰好警告过这类问题                                                                                                                                                                                     |
| L11  | `fx-lyrics.css:44-45`、`magia.css:913-914`                                                                                                                                                                                      | 同一套 `padding-block` 回退技巧抄了两份却用了**不同的回退值**；`container-type: size` 也在两处各声明一次                                                                                                                                                                          |
| L13  | `downloadpanel.css:206-268`、`settings.css:228-248`                                                                                                                                                                             | 21 条 `[data-value]` 宽度桶在组件间手抄两遍（后者还是死代码）。`playerbar.js:677-678` 已经会取整到桶，应该做成共享工具类                                                                                                                                                          |
| L12  | `arcade.js:190-193`                                                                                                                                                                                                             | 注释声称「clip-path 只做合成」；Chromium 把 `clip-path` 当作 paint 属性，30 条柱子（`arcade.css:151-152`，由 `arcade.js:221` 写）与其遮罩父层（`arcade.css:143`）每个频谱帧都在重绘，空闲循环（`arcade.css:539-547`）也一样。修注释，或把揭示改成内层元素的 `transform: scaleY()` |
| M20  | `magia.js:745-992`（`createLyrics` ~248 行）、`:512-693`（~182）、`fx-lyrics.js:77-299`（~223）、`fx-camera.js:92-309`（~218）、`lyrics-view.js:62-241`（~180）、`arcade.js:87-370` `mount`（~284）、`anime.js:153-324`（~172） | 超长函数；同一个「用户滚动暂停」常量在 `lyrics-view.js:19`、`fx-lyrics.js:30` 命名了两次（都是 1200），`magia.js:763` 又写了裸字面量 1400                                                                                                                                         |

---

## 6. 皮肤包内部的重复（补充代码质量报告 S3-2）

与 `docs/13` 的 S3-2 是同一发现，此处给出完整清单：

| 重复内容                                    | 份数  | 位置                                                                                                                                                                                        |
| ------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `emptyTextFor`（函数体逐字节相同）          | **6** | `classic.js:130-133`、`immersive.js:108-111`、`minimal.js:87-90`、`anime.js:384-387`、`arcade.js:446-449`、`magia.js:1113-1118`                                                             |
| HTML 转义器                                 | **3** | `html.js:31-43`、`fx-lyrics.js:52-64`、`lyrics-view.js:244-256` —— 而两个渲染器**都接受 `opts.escape`**（`fx-lyrics.js:78`、`lyrics-view.js:63`），`escapeHtml` 也已经从 `index.js:51` 导出 |
| 整窗透明块                                  | 4     | `immersive.css:79-100`、`anime.css:241-249`、`arcade.css:173-186`、`magia.css:65-96`                                                                                                        |
| `.playerview[data-skin=X]{background:none}` | 3     | `anime.css:258-260`、`arcade.css:190-192`、`magia.css:445-447`                                                                                                                              |
| 同一个入场动画                              | 3     | `fxl-in`（`fx-lyrics.css:158-176`）、`an-jelly`（`anime.css:506-527`）、`mg-pop`（`magia.css:1058-1076`）；`an-eq`（`anime.css:659-668`）≡ `mg-eq`（`magia.css:1169-1178`）                 |

**一个额外的不一致**：`magia.js:1113-1118` 对 `none` 来源返回 **「这首歌还没有歌词」**，
而另外五个皮肤返回 **「暂无歌词」**——同一状态在同一应用里有两套文案。

---

## 7. 可访问性（质量项，非性能）

| 编号 | 位置                                                                 | 问题                                                                                                                                                                                                                                                                                                                                       |
| ---- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M10  | `cover.js:54`、`search.js:128`、`settings-view.js:257`               | 都声明了 `role="dialog" aria-modal="true"`，但**没有任何东西设置 `inert`/`aria-hidden`，焦点既不捕获也不归还**。从设置层按 Tab 会走到下面的侧边栏/播放条；关闭后焦点回到 `body`                                                                                                                                                            |
| M11  | `playerbar.js:163-171`、`:262-270`、`panels.js:374`/`407`/`418`      | 进度滑条 `aria-valuenow` 硬编码为字面量 0 且从不更新——辅助技术永远播报 0%；音量滑条**没有** `aria-valuenow`；选项面板四个滑条共用 `aria-label="调节"` 且无值语义。值在 `playerbar.js:129` 已经算出来了                                                                                                                                     |
| M12  | `track-table.js:222-230`、`:261-265`、`:252-253`                     | 行是**纯 div**（无 `role`、无 `tabindex`），点击才激活 → **键盘用户完全无法选中或激活曲目**（只有内部两个按钮可达）。队列面板做对了（`panels.js:231-238` + `:269-275`），应照抄。另外 `role="checkbox"` 的 span 没有可访问名、没有 `tabindex`、没有键盘处理；「加入我喜欢」即使 `aria-pressed="true"` 也始终播报 `aria-label="加入我喜欢"` |
| M13  | `fx-camera.js:28` 是全包**唯一**查询 `prefers-reduced-motion` 的地方 | `player-skins` 下**没有任何** ```media (prefers-reduced-motion: reduce)` 块，而那里有约 36 个无限动画。`base.css:237-244` 的应用级重置只覆盖主窗口，且很粗暴（`animation-duration: 0.001ms !important`），会把基于旋转的指示器冻在第一帧                                                                                                   |
| M14  | `lyrics-view.js:162`、`fx-lyrics.js:191`                             | 歌词**每一行都是一个 tab stop**——一首 60 行的歌意味着歌词面板到下一个控件之间有 60~200 个停留点。`magia` 已经实现了 roving tabindex（`magia.js:913-914`），修法应落在两个共享渲染器里                                                                                                                                                      |
| M9   | `magia.css:989-996`、`arcade.css:489-492`                            | 「已唱」与「正在唱」**仅靠色相/发光区分**（`arcade` 给「现在」加了框，但 `done` 仍是纯颜色）                                                                                                                                                                                                                                               |
| L5   | `overlays.js:439-448`                                                | 工具提示只绑 `mouseover`/`mouseout`，没有 `focusin`/`focusout` → `data-tip` 文本键盘不可达（多数按钮另有 `aria-label`，故列为 Low）                                                                                                                                                                                                        |
| L4   | `settings-view.js:829-831`                                           | `.switch__thumb` 在任何 CSS 里都没有规则（滑块是 `.switch::after`，`settings.css:477-487`）；且这是**唯一没有可访问名**的开关（`switchControl()` 会传 `aria-label`）                                                                                                                                                                       |

---

## 8. 已检查且**未发现问题**的部分（避免重复排查）

这一节与前面同等重要——它划定了不需要动的地方：

- **`!important` 滥用：无。** 全仓仅 10 处：3 处是 `prefers-reduced-motion` 重置
  （`base.css:241-243`）、2 处是刻意的 `[hidden]` 守卫、1 处是桌面歌词透明覆盖，
  其余是注释。系统性使用只有 §3 的背景歌词令牌镜像，且**有文档说明**。
- **特异性战争：无。** 全仓**只有一处**逐字重复的选择器对（M7）。选择器整体是扁平单类。
  唯一刻意的层叠技巧在 `lyricspanel.css:498-505` 且有注释（`.is-now` 早于 `.is-cursor`，同特异性后者胜）。
- **`IntersectionObserver`：全仓 0 次使用**。这正是 C1 的根因——没有任何东西观察行的可见性；
  一旦虚拟化，也不需要它。
- **Canvas：只有 `magia` 使用**（`magia.js:525-538` 预渲染 64×64 精灵，`magia.js:550` 把 DPR 上限压到 2）。
  宿主 UI 无 canvas。绘制本身没问题，问题只在「何时停」（H4）。
- **定时器：只有两个 1 Hz interval**（`playerbar.js:80-83`、`panels.js:460-462`；
  两者都在 `onDisconnected` 里清掉），皮肤包里两个 `setTimeout` 都在 `destroy` 里清。
  皮肤包**没有** `timeupdate`/`pointermove`/`scroll` 监听器，
  其 `wheel`/`touch` 监听器都是 `{ passive: true }`
  （`fx-lyrics.js:117-119`、`lyrics-view.js:98-100`、`magia.js:782-784`）。
- **「本该事件驱动却用 rAF」：只有三个皮肤/相机循环**（H4、H5）。
  `panels.js:74`、`search.js:86`/`90`/`343`、`overlays.js:131`/`264`、`playerbar.js:438`
  的一次性 rAF 都是正确用法。
- **字体 / 图片 / 资源：一个都没产出。** `frontend/dist` 里 0 个 woff/ttf/png/jpg/webp/svg/ico，
  那一份样式表里 0 个 `url()`、0 个 ```font-face`，0 个 sourcemap。**这方面没有可优化的。**
- **vendor 重复：无。** lit 只出现在 `assets/base-*.js`（41,445 B），SortableJS 只在主 chunk。
- **`innerHTML` 整块重建列表：宿主 UI 里没有**（只有皮肤舞台的拆除与错误路径
  `playerhost.js:711`/`730`/`772`）。`player-skins` 内部有（M15），但那是皮肤自己的渲染器。
- **`magia` 的 `putVars`（`magia.js:1124-1131`）对逐帧自定义属性做了与前值的去重比较**——
  这是该代码库里最好的逐帧写入实践，值得作为其他皮肤的参照。
- **`desktop-wallpaper-window.js` 没有 per-frame 写入**：它按 patch 类型分发，
  进度与频谱是分开的两条通道（`:290-300`、`:411`）。

---

## 9. 修复顺序（表现层）

1. **C1** —— `.track { content-visibility: auto; contain-intrinsic-size: auto var(--row-h) }`
   作为一行成本的第一步（真正的窗口化见性能报告 P0-2）。
2. **H1** —— 滑条填充/滑轨改 `transform` 驱动（消掉每个 position tick 上的一次布局失效）。
3. **H8** —— 把 `s.volume` 从设置层 deps 删掉，并把三个全库聚合做 memo。
4. **H2** —— `font-size`/`filter` 移出歌词过渡列表，强调改用 `transform: scale()`。
5. **H3** —— 删掉常驻 `will-change`（宿主 `.playerview`、`.skin-bg`、`magia .mg-unit`）。
6. **H4/H5** —— `magia` 暂停时停 rAF；`anime`/`arcade` 关闭时 `camera.setEnabled(false)`。
7. **H9** —— 设置层滚动处理 rAF 合并 + 缓存节点 + 改用 `offsetTop`。
8. **M5/M6** —— 删掉 25 条冗余 `[hidden]` 与死代码块（含 `.progress-line`、`.search__input`、
   tabs、caption 家族），并修掉 `--surface-sunken` 这个拼错的令牌名。
9. **H11** —— 给 `lyrics.html` / `wallpaper.html` 独立 CSS 入口。
10. **H7/H6** —— `background-position` 动画改成 transform 子层；`arcade` 的辉光改预模糊 + 只动 `opacity`。
11. **M10-M14** —— 弹层 `inert` + 焦点归还、`aria-valuenow`、曲目行键盘可达、
    两个共享歌词渲染器改 roving tabindex。
12. **M18/H12/L14** —— 打开体积信号、抽公共 CDP 模块与统一 shim、清理作者特定路径。
13. **M19/M20/M2/M3/M4/M8/M21** —— 皮肤共享辅助模块、长函数拆分、缓存与 diff。
