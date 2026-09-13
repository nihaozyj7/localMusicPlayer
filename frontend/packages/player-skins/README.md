# @musicplayer/player-skins

播放详情页的**样式包**（皮肤）：负责背景渲染、歌词渲染与交互；
音频、进度、曲目、封面、歌词文本、设置项全部由宿主提供并主动推送。

三种内置样式：`classic`（经典唱片）· `immersive`（沉浸）· `minimal`（简约）。

## 为什么单独成包

需求原文把「播放详情界面的背景渲染和交互（含歌词渲染）」整体划给样式，
并要求「相关信息更新时主动推给背景扩展」。所以这里的原则是：

- **宿主负责数据**：`<audio>` 元素、播放进度、当前曲目、封面集合、歌词文本
  （含联网匹配与缓存）、设置项、主题、窗口尺寸；
- **样式负责呈现与交互**：DOM 结构、背景怎么画、歌词怎么排、点歌词要不要 seek；
- **单向推送**：宿主在换歌 / 封面轮播 / 歌词装载 / 进度 / 设置 / 主题 / 尺寸变化时
  调 `update(ctx, patch)` 并触发 `ctx.on(type, fn)`。样式**不轮询**，
  也不 import 应用内部模块（`store` / `bridge` / `utils`）——
  这样内部重构不会波及第三方样式，接口也能按 `apiVersion` 演进。

## 用法（应用侧）

```js
import { listSkins, getSkin, resolveSkin, reloadSkins } from "@musicplayer/player-skins";

for (const skin of listSkins()) {
  // { id, name, icon, order, background, builtin, source }
}
```

宿主怎么把数据推下去，见 `frontend/src/js/playerhost.js`（`makeCtx()` / `push()`）。

## 用法（写一个样式）

```js
import { defineSkin } from "@musicplayer/player-skins/contract";

export default defineSkin({
  apiVersion: 1,
  id: "aurora",
  name: "极光",
  icon: "disc", // index.html 里图标 sprite 的 id
  order: 200, // 样式按钮组里的排序，小的在前
  background: false, // 需要整窗背景层就写 true，然后用 ctx.backgroundRoot
  mount(ctx) {}, // 建 DOM（往 ctx.root 里写）
  update(ctx, patch) {}, // 宿主推来的更新
  destroy(ctx) {}, // 清理定时器 / 监听 / 引用
});
```

`update` 的 `patch.type` 取值见 `PATCH_TYPES`：
`mount | song | media | lyrics | progress | state | options | theme | resize | close | destroy`。

### ctx 提供什么

| 成员               | 说明                                                           |
| ------------------ | -------------------------------------------------------------- |
| `root`             | 挂载点（宿主已清空）                                           |
| `backgroundRoot`   | 整窗背景层容器（声明 `background: true` 时宿主会就位）         |
| `audio`            | 真实 `<audio>` 元素（只读用：读 `buffered`、挂监听）           |
| `playback()`       | `{ position, duration, playing, volume, muted }`               |
| `media()`          | `{ song, cover, covers, coverIndex, lyrics }` 快照             |
| `options()`        | `{ showLyrics, lyricsFontSize, animations, coverCarousel, … }` |
| `actions`          | `{ seek, togglePlay, next, prev, openFolder, openCoverPanel }` |
| `on(type, fn)`     | 订阅某类更新，返回取消订阅函数                                 |
| `defaultCover`     | 封面加载失败时的兜底图（内联 SVG data URL）                    |
| `themeId` / `mode` | 当前主题 id 与深浅色（getter，随主题变化自动更新）             |

### 自带两个可复用的零件

```js
import { createLyricsView, createBackgroundLayer, parseLrc, findLyricIndex } from "@musicplayer/player-skins";
```

- `createLyricsView(host, { escape, onSeek, onOpenFolder })`：
  歌词滚动区（自动居中高亮 + 用户滚动时让位 1.2 秒 + 点行/回车跳转 + 空态）。
  返回值 `{ element, scrollElement, setLines, setActive, setPosition, destroy, lines, activeIndex }`。
  三种内置样式共用它，差别只在 CSS 令牌上。
- `createBackgroundLayer(host)`：
  整窗背景层 `{ setEnabled, setImage, setStyle, destroy }`，视觉参数是
  CSS 变量 `--skin-bg-blur / -scale / -brightness / -veil`。
  **容器的类名与位置由宿主决定**（`.skin-bg` 写在 `index.html` 里）：
  `.playerview` 有 transform 动效，挂在它里面的 `position: fixed` 会被裁在详情页范围内。

### CSS 约定

- 内置样式的选择器都挂在 `.playerview[data-skin="<id>"]` 下；
  容器外（标题栏/底栏透明化）用 `.app[data-mode="<id>"]`。
- 第三方样式**必须自己限定作用域**，因为所有样式共用一张样式表。
- 主题令牌（`--accent` / `--text-1` / `--surface-1` / `--glass-bg` / `--lyric-size`…）
  可以直接用，深浅色会自动跟随。

## 第三方样式（运行时加载）

放进数据目录即可，不需要重新打包：

```
<数据目录>/player-skins/
  aurora/
    skin.json     可选：{"name":"极光","version":"1.0.0","module":"skin.js","styles":["skin.css"]}
    skin.js       入口（必需；没有它这个目录不算样式）
    skin.css      可选（不写清单时会自动带上目录下所有 .css）
```

- 应用把该目录挂在 `/skins/` 下同源提供（只读、`no-store`、挡目录穿越与隐藏文件、
  显式指定 JS/CSS 的 MIME）。为什么必须同源：页面 CSP 是 `script-src 'self'`，
  `file://` 的模块会被同源策略拒绝。
- 外部样式的 CSS 由宿主按清单插 `<link>`（浏览器原生 ESM 不能 `import` CSS）。
- 目录里的 `_template/` 是随应用分发的示例（下划线开头 = 不参与扫描），
  复制改名并把里面的 `__SKIN_ID__` 换成新 id 即可。已存在的模板文件不会被覆盖。

Go 侧实现见 `internal/skins/`（扫描 + 托管）与 `services_skins.go`（列表 / 重扫 / 打开目录）。

## 单测

```powershell
npm test        # frontend/tests/player-skins.test.js
```

覆盖 LRC 解析与定位、皮肤契约校验（缺字段 / 接口版本不符）、注册表顺序与兜底、
HTML 转义。DOM 行为（挂载、歌词滚动、整窗背景层）由无头浏览器自检覆盖：
`node tools/check-player-host.mjs`。单测能 `import` 皮肤包是因为
`frontend/tests/css-stub-loader.mjs` 把 `.css` 换成了空模块（Node 原生不认识 CSS）。
