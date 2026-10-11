# 暗房 darkroom

> 第三方播放界面样式（**不是内置样式**，本体只在本仓库的 `plugins/style/` 下管理）。
> 视觉极限轴：**后期 / 光** —— 把封面与歌词冲洗成一张正在显影的胶片。

```
darkroom/
├── skin.json              清单（id / order 210 / capabilities / colors / budgetFps）
├── skin.js                入口：帧循环、歌词渲染、封面取色、快门
├── skin.css               全部视觉（叠层、逐字点亮、颗粒、扫描线、快门）
├── assets/icon.svg        样式按钮图标（单色线稿，宿主当 alpha mask 用）
├── lib/
│   ├── color.js           封面取色与配色推导（纯函数）
│   ├── film.js            频谱 / 帧预算 / 时间码（纯函数）
│   └── lyric-timing.js    播放时钟与逐字进度（纯函数）
├── tests/
│   ├── darkroom-logic.test.js   node --test：纯逻辑 + 契约静态体检
│   └── darkroom-check.mjs       本机 Edge：自带静态服务 + 假宿主，像素级断言
└── README.md
```

## 1. 安装

播放器**不读本目录**，它只认数据目录里的样式包：

```powershell
# 装到数据目录（第三方样式）
$dst = "$env:APPDATA\LocalMusicPlayer\player-skins\darkroom"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item -Recurse -Force plugins\style\darkroom\* $dst
```

然后在播放器里「设置 → 播放界面样式 → 重新扫描」。客户端里也可以直接「添加播放界面样式 →
从仓库获取」（读的是 `plugins/style/index.json`，见 `plugins/README.md`）。

## 2. 它长什么样

| 画面元素 | 做法 | 数据来源 |
| :--- | :--- | :--- |
| 整窗背景 | 封面第二份，`blur(40px)` 压暗 + 冷暖面纱 | `ctx.media().cover` |
| 光晕溢出 | 又一份封面 `blur(38px)` + `screen` 混合，只动 `opacity/scale` | `ctx.spectrum()` 低频 |
| 逐字点亮 | 每个字素一个 `--g`（0..1，量化 8 档），颜色从冷灰混到暖金 | `lyrics.lines[].words` |
| 色差 | 已唱字的 `text-shadow` 红/青偏移（偏移量 = `--g` × 1.4px） | 同上 |
| halation | 打击时整行暖色辉光脉冲一次（自适应阈值 + 260ms 冷却） | `ctx.spectrum()` 谱通量 |
| 颗粒 | 两层重复点阵 + `steps(5)` 位移 | 高频能量 → 浓度 |
| 扫描线 / 暗角 / 片框 | 静态叠层，零运行期开销 | — |
| 快门开合 | 换歌时两片黑幕闭合 → 换图 → 打开 | `song` 补丁 |
| 宿主壳配色 | `reportBackdrop({bg, fg})`（400ms 防抖）+ 清单 `colors` 兜底 | 封面取色 |

封面采样走的是"每首歌一次"：一张 96×96 离屏 canvas，`getImageData` 后取均色 / 主色。
封面是 data URL 或同源 `/online/cover` 代理，所以不会被 canvas 污染（无需 `crossOrigin`）。

## 3. 契约用法（对照组）

| 用到的 | 说明 |
| :--- | :--- |
| `ctx.root` / `ctx.backgroundRoot` | 舞台与整窗背景层的容器。**背景层的内容是本包填的**，因此不依赖宿主 `background-layer.js` 的骨架样式 |
| `ctx.options()` | `animations` / `interactive` / `performanceMode` / `lyricsFontSize` / `showLyrics` |
| `ctx.env()` | `reducedMotion` |
| `ctx.media()` / `ctx.playback()` | 曲目、封面、歌词、进度 |
| `ctx.spectrum()` | 128 段对数谱（拉取式，宿主已节流到 ~30Hz） |
| `ctx.actions.seek` / `reportBackdrop` | 点歌词跳转；把封面配色上报给宿主壳 |
| `ctx.sdk.splitGraphemes` / `html.*` | 字素切分（必须与 `words` 下标同一份切法）/ 空态文案、副标题、封面兜底 |

**没有用**的东西（都是坑，写在 `pending-designs.md` §1.3）：`ctx.assets`、`ctx.log`、
`capabilities.paintSelf`（宿主解析了但没有消费者）、`sdk.createFxLyrics` / `createLyricsView`
（要宿主骨架样式表，单独一个包拿不到，所以本包自己渲染歌词）。

## 4. 降级矩阵（都是实测过行为的，不是"应该会"）

| 条件 | 表现 |
| :--- | :--- |
| `options.animations === false` 或 `env.reducedMotion === true` | **完全不跑帧循环**（只画一帧），CSS 动画与过渡一并关掉；逐字点亮仍然正确（跟随进度补丁） |
| `options.performanceMode === "performance"` | 帧循环按清单 `budgetFps: 30` 限帧；颗粒层停止位移（改静态图） |
| `options.performanceMode === "smooth"` | 不限帧（交 rAF）；写 DOM 前做过差值判断，没有变化就不写 |
| 暂停 / 无音频 | 6 秒后停帧，并暂停 CSS 动画（`[data-idle]`），不再转风扇 |
| `visibility: {foreground:false}` | 立即停帧；回到前台且仍在播放时自动恢复 |
| `close`（详情页收起） | 停帧 + 隐藏整窗背景层 |
| `showLyrics === false` | 只留胶片与 HUD，不显示空态文案 |
| 无封面 | 保持清单里的默认配色，不取色、不报错 |
| `lyrics.lines[].words` 缺字 / 与字素数不一致 | 该行退回"整行线性点亮"（否则下标串位会点错字） |
| 无歌词 | 显示 `sdk.html.lyricsEmptyText()`（含"匹配中"状态），并保留胶片画面 |

## 5. 自检

```powershell
# 纯逻辑 + 契约静态体检（不需要浏览器，~0.2s）
node --test "plugins/style/darkroom/tests/*.test.js"

# 浏览器里的真实观感（自带静态服务 + 假宿主 + 系统自带 Edge）
node plugins/style/darkroom/tests/darkroom-check.mjs
```

`darkroom-check.mjs` 覆盖：挂载无报错、歌词行/字素数量与 `words` 对齐、逐字 `--g` 真的分档、
换行高亮、点歌词能 `seek`、封面取色后 `reportBackdrop` 收到合法且对比度 ≥4.5 的配色、
`animations:false` 时**零帧**、`destroy` 后舞台与整窗背景层都干净（这是第三方样式最容易漏的地方：
背景层容器是宿主的，宿主不会替你清）。

## 6. 已知边界

- 颗粒 / 扫描线的观感依赖 `mix-blend-mode: overlay`，在极亮封面上会比暗封面更"脏"——这是胶片的本意。
- 全屏 `blur(40px)` 只在换封面时重算一次；但**换封面那一帧**在低端核显上仍可能掉一帧。
- 逐字点亮依赖 `words` 的千分位精度；纯 `[mm:ss]` 的行级歌词只能用线性点亮（这是数据本身的极限）。
