# @localmusicplayer/player-skins

播放界面**插件（样式）**的契约与运行时零件。宿主（主窗口详情页、桌面背景歌词窗口）
与插件都只依赖这里的东西，因此**接口的唯一定义就在这个包里**。

> 契约版本：`SKIN_API_VERSION = "3.0"`（语义化：major 必须与宿主相同，
> minor 可以比宿主旧）。宿主自己的版本是 `HOST_API_VERSION`。

## 这个包负责什么 / 不负责什么

| 负责 | 不负责 |
| --- | --- |
| `contract.js`：契约字段、版本协商、`composeSkin` 元数据合并、`apiStatus` | 数据获取与播放逻辑（宿主的 store / Go 后端） |
| `colors.js`：清单 `colors` → 宿主壳的 `--chrome-*`（含对比度兜底） | 插件自己画面的绘制 |
| 注册表：`registerSkin / listSkins / getSkin / unregisterSkin / resolveSkin` | 插件目录的扫描与 HTTP 托管（`internal/skins`，Go 侧） |
| `wrapPluginCss / injectSkinStyles`：把插件 CSS 包进 `@layer skin` + `@scope` | 判断某个 id 是不是"内置"（由加载器标 `builtin`） |
| `sdk.js` + 骨架样式：`createLyricsView / createBackgroundLayer / parseLrc / …` | 视觉风格（那是插件自己的事） |

**内置样式不再在包里。** 它们是 `internal/skins/resources/player-skins/<id>/`
下的**数据**（与第三方样式同构），由 Go 侧扫两个根目录、前端按清单加载 ——
于是"加/删一款内置样式"不需要改前端源码，第三方样式的写法也不再有第二条路径。

## 插件目录长什么样

```
<样式id>/
  skin.json     清单（元数据 + 能力 + 配色，必需）
  skin.js       入口（清单 entry，默认 skin.js），export default 插件对象
  skin.css      外观（清单 styles；不写就取目录顶层全部 *.css）
  assets/       自带图标与贴图（清单 icon.file 引用）
  lib/          自带私有模块（只允许包内相对 import）
```

清单示例：

```json
{
  "id": "aurora",
  "name": "极光",
  "version": "1.0.0",
  "apiVersion": "3.0",
  "entry": "skin.js",
  "styles": ["skin.css"],
  "icon": { "file": "assets/icon.svg" },
  "order": 200,
  "capabilities": { "spectrum": true, "background": false, "interactive": true },
  "colors": { "bg": "#0b1020", "fg": "#f2f4ff", "accent": "#7aa2ff" },
  "performance": { "budgetFps": 45 }
}
```

字段含义见 `contract.js` 的 `SkinManifest` 注释，或 `internal/skins/template/皮肤说明.md`
（示例包自带的说明，随首次启动写进用户目录）。

## 入口模块（skin.js）

```js
export default {
  id: "aurora",          // 可选；写了就必须与清单 id 一致
  mount(ctx) {},         // 必需
  update(ctx, patch) {}, // 可选
  destroy(ctx) {},       // 可选
};
```

三条硬约束：

1. **零 import**（除包内相对路径的私有模块）：插件拿不到打包器，也不许 import
   宿主的 store / utils / 本包 —— 公共零件从 `ctx.sdk` 拿。
2. **CSS 作用域由宿主强制包裹**（见下节），选择器相对舞台根写。
3. **配色靠清单声明**（见「配色契约」一节），不要试图改宿主 UI 的颜色。

### ctx 提供什么

```
ctx.root / ctx.backgroundRoot
ctx.track()      { id, title, artist, album, duration, kind }
ctx.media()      { song, cover, covers, coverIndex, lyrics }   ← 聚合快照
ctx.lyrics()     { lines, index, status, statusText, source, text }
ctx.covers()     { list, index, current }
ctx.playback()   { position, duration, playing, volume, muted }
ctx.options()    { showLyrics, lyricsFontSize, animations, coverCarousel, …, interactive }
ctx.env()        { themeId, mode, width, height, dpr, reducedMotion, foreground }
ctx.spectrum()   { bands: Float32Array(128 段对数全谱, 0..1), at } | null
                 ← 拉取式：调用才采样（30Hz 节流）；不调不采、没声明不给
ctx.sdk          复用零件（见 sdk.js）
ctx.actions      seek / seekBy / seekRatio / togglePlay / next / prev /
                 toggleLike / like / unlike / openFolder / openCoverPanel /
                 openLyricsPanel / reportBackdrop({bg, fg})
ctx.on(type, fn) 订阅一次推送（返回退订函数）
ctx.defaultCover / ctx.themeId / ctx.mode
```

`update(ctx, patch)` 与 `ctx.on(type, fn)` 收到同一份 patch：

| type | 载荷 | 说明 |
| --- | --- | --- |
| `mount` | 全量快照 | 挂载后立即一次 |
| `song` / `media` / `lyrics` | 对应快照 | 换歌 / 封面轮播 / 歌词装载 |
| `progress` | `{ position, duration, playing, lyricIndex }` | 宿主约 4Hz 推一次（位置按 250ms 一档量化），插件需自行在两帧之间插值 |
| `state` | `{ playing, volume, muted }` | 播放状态与音量 |
| `options` / `theme` / `resize` / `visibility` / `chrome` | 对应对象 | 设置、主题、尺寸、前后台、壳层配色 |
| `close` / `destroy` | — | 收起 / 即将卸载 |

**没有 `spectrum` 补丁**：实时频谱是**拉取式** `ctx.spectrum()`（固定 128 段全谱、
读到才采样，见上）。插件不读 = 一次采样都没有；也不再有"补丁在两帧之间到达"的错位。

不确定时用 `ctx.track() / ctx.lyrics() / ctx.playback()` 现取快照：**任何一次推送
之后，快照与载荷一定一致**（`ctx.media()` 是它们的聚合）。

## 配色契约（`colors.js`）

宿主 UI（标题栏 / 底栏 / 侧边栏 / 播放队列等浮层）会叠在插件画面上，
所以配色走"**插件声明、宿主决定**"：

```js
import { deriveChrome, applyChromeVars, clearChromeVars } from "@localmusicplayer/player-skins";

const chrome = deriveChrome(manifest.colors);
// chrome = { theme, vars, missing, corrected, contrast, preview, readable }
```

* `colors: { bg, fg }` → 派生出 `--chrome-bg / -bg-soft / -fg / -fg-dim / -hover / -active / -border / -accent`，
  由宿主写到 `<html>` 上（浮层是 `#app` 外的 fixed 元素，只能挂在文档根）；
* **对比度兜底**：`bg` 与 `fg` 的 WCAG 对比度低于 4.5:1 时，把 `fg` 推向黑/白
  （`corrected: true`，`contrast` 是纠正后的值）；
* `colors: { theme: true }` → 合法写法：不写任何变量，宿主壳直接用主题令牌；
* **缺失或写错**（`missing: ["bg","fg"]`）→ 不写变量、降级主题，设置页在该样式
  卡片上显示警告图标（悬浮看原因）。

宿主壳只读 `--chrome-*`，不读插件任何变量；插件自己画面的配色是插件 CSS 的事。

## CSS 隔离（`wrapPluginCss`）

宿主注入样式表时强制包裹：

```css
@layer skin {
  @scope (.playerview[data-skin="<id>"], .skin-bg[data-skin="<id>"]) {
    /* 插件的 CSS 原文 */
  }
}
```

* `@layer skin`：插件**压不过**宿主壳的规则（宿主壳在未分层的样式表里）；
* `@scope`：插件**写不到**作用域外（宿主 UI 完全不可达，也就没有污染风险）；
* 引擎不支持 `@scope` 时退化为只包 `@layer` 并 `console.warn` 一次（宿主内核是
  现代 Chromium，实际不会走到这条分支）。

因此插件的选择器**相对舞台根**写：

```css
.demo { … }              /* 舞台里面的元素，直接写 */
::scope { … }            /* 舞台（挂载点）自身 */
```

**不要**再写 `.playerview[data-skin="<id>"]` 前缀（在 `@scope` 里，作用域根通常只能
用 `::scope` 匹配，写全前缀反而可能匹配不到）。也不许写 `:root / html / body / *`、
裸标签与 `!important`。

## 用法（应用侧）

```js
import { loadSkin, resolveSkin, listSkins, unregisterSkin, noteBuiltin, resetBuiltins } from "@localmusicplayer/player-skins";

// 一条加载路径：内置与第三方都由 Go 扫出来并下发归一化清单
await loadSkin({
  manifest,          // 后端下发的清单（skin.json 原文 + 默认值补齐）
  moduleUrl, cssUrls, iconUrl,   // /skins/<id>/<file>?t=<token>（同源 + token）
  builtin: info.builtin === true,
  source: info.source,           // builtin | data
});
if (info.builtin) noteBuiltin(getSkin(info.id));

const { skin, fellBack } = resolveSkin(configuredId); // 不认识就回退到默认样式
```

`loadSkin` 做的事：校验 `apiStatus` → `import(moduleUrl)` → `composeSkin`（元数据以
清单为准）→ 注入包好作用域的 CSS → `deriveChrome`（配色体检）→ 注册。

## 内置与第三方的区别只有标记

| | 内置 | 第三方 |
| --- | --- | --- |
| 位置 | `internal/skins/resources/player-skins/`（`//go:embed`，只读） | `<dataDir>/player-skins/`（用户可改可删） |
| 加载 | `loadSkin({ builtin: true, source: "builtin" })` | `loadSkin({ builtin: false, source: "data" })` |
| id 冲突 | **内置胜出**（数据目录里的同名副本不生效） | 后到者被忽略并记日志 |
| 删除 | `unregisterSkin` 拒绝、Go 侧 `Delete` 拒绝 | 可删（设置页有删除按钮） |

## 单测

```bash
node --import ./frontend/tests/register.mjs --test frontend/tests/player-skins.test.js
```

覆盖：契约版本协商、`composeSkin` 元数据合并与冲突报错、`deriveChrome`（对比度
纠正 / 缺失检测 / theme 写法）、`wrapPluginCss`（`@layer` + `@scope` 及退化分支）、
注册表（内置不可注销、按 order 排序、回退）、LRC 与歌词工具、`fitScale`。
