# plugins/style/ — 自开发的第三方播放器样式包

样式包（皮肤）改的是**播放详情页那一整块舞台**怎么画：歌词排布、背景、动效，
全部由样式自己渲染，宿主只负责给数据与给舞台容器。

契约见 `docs/42-播放器样式插件系统设计方案.md` 与
`frontend/packages/player-skins/contract.js`（**契约的唯一定义**，`SKIN_API_VERSION = "3.0"`）；
面向作者的说明见 `internal/skins/template/皮肤说明.md`。

## 本目录现有的样式包

### `pending-designs.md` — 待设计与交付台账

六款**第三方**样式的完整设计规格 + 签收台账（暗房 / 拓印 / 塔 / 活字 / 心跳 / 深渊）。
每款实现完在台账里签收一款，签收规则见该文件 §0，共同工程约束见 §3。
**这些不是内置样式** —— 源码在 `plugins/style/<id>/`，安装到
`%APPDATA%\LocalMusicPlayer\player-skins\<id>\`，`order` 一律 ≥ 200。

### `magic-circle/` — 魔法阵歌词舞台

一句话：**歌词是世界里的固定物体，镜头飞过去看它。** 世界 12000×12000，
每句歌词钉在一个世界坐标上，换句 = 运镜 = 转场；全部动效只有一个输入
`ctx.spectrum()` 给的 128 段对数全谱。

```
magic-circle/
├── skin.json          清单：id / 名称 / 版本 / capabilities / colors
├── skin.js            入口（零裸包名 import；子模块走 await import 透传 token）
├── skin.css           样式（宿主强制包进 @layer skin + @scope(舞台)，选择器相对舞台根写）
├── assets/icon.svg
├── lib/               config / layout / camera / render / particles / spectrum / util
└── tests/             这份样式包自己的自检（见下）
```

## 写样式包时的硬约束（契约 v3）

1. **零裸包名 import**：只允许包内相对路径。数据只从 `ctx` 拿、动作只走
   `ctx.actions`、复用零件走 `ctx.sdk`。第三方样式是运行时从 `/skins/` import 的，
   一旦依赖 `store.js` 之类，接口就没法演进。
2. **子模块用 `await import()` 而不是静态 import**：`/skins/` 是逐文件鉴权的，
   ES 模块解析相对说明符时会**丢掉 query**，静态 import 会请求到没带 token 的
   URL（403）。细则见 `magic-circle/skin.js` 的文件头。
3. **CSS 由宿主强制包裹**（`@layer skin` + `@scope(舞台)`）：选择器**相对舞台根**写，
   不要写 `.playerview[data-skin="<id>"]` 前缀。给舞台**自身**写规则（比如默认变量）
   用 `:scope`（**伪类**）—— `:scope` 不是合法伪元素，整条规则会被静默丢掉。
   想影响宿主控件观感只有一条路 —— 在清单 `colors` 里声明配色，由宿主办对比度。
4. **让开宿主壳（安全区）**：`background: true` 的样式舞台是**铺满整窗**的，而宿主的
   「标题栏 + 详情页头部行」与「底部播放控件栏」是**浮在画面上**的
   （`.titlebar` / `.playerbar` 的 z-index 都高于 `.playerview`）。这两条带子的高度由
   宿主写成 `--skin-inset-top` / `--skin-inset-bottom`（主窗口 88px / 86~92px）：

   ```css
   /* 要给人读的文字（曲名 / 歌手 / 时间码 / 提示 / HUD）一律这样让开 */
   padding: calc(var(--skin-inset-top, 0px) + 20px) 26px calc(var(--skin-inset-bottom, 0px) + 18px);
   ```

   装饰层（背景图 / 渐变 / 粒子 / 光晕）可以画到带子底下去，**文字不行**；
   兜底值必须写 `0px`（桌面背景歌词窗口没有这两块 chrome）；
   窄窗口与降级档的 `padding` 覆盖最容易把这两项吃掉。

5. **不轮询**：只保留一条 `requestAnimationFrame` 帧循环，暂停后自己停帧。
6. **不碰 `window` / `document.documentElement`，不发网络请求。**
7. **只能在 Windows 上验证**；调试用 `$env:LMPLAYER_DEBUG_PORT = "9333"`。

## 自检

样式包的自检**跟着样式包走**（不放进项目的 `tools/` 与 `frontend/tests/`）：

```powershell
# 纯逻辑：node --test（零依赖，不需要浏览器、不需要起服务）
node --test "plugins/style/magic-circle/tests/*.test.js"

# 画布像素：自己起静态服务 + 无头 Edge，自带假宿主
node plugins/style/magic-circle/tests/canvas-word-check.mjs
```

> `node --test` 这里要写成**带引号的文件通配**，不要传目录 ——
> Node 22 会把目录参数当成一个要 import 的模块（`MODULE_NOT_FOUND`）。

## 安装

```powershell
Copy-Item plugins\style\magic-circle "$env:APPDATA\LocalMusicPlayer\player-skins\" -Recurse -Force
```

然后设置 → 播放界面样式 → 「重新扫描样式」。也可以在设置里点「导入样式」，
直接选中 `plugins/style/magic-circle` 这个目录（选中外层目录也会被正确识别）。
