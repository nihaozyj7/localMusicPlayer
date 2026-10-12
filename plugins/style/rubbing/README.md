# 拓印 rubbing

> 第三方播放界面样式（**不是内置样式**，本体只在本仓库的 `plugins/style/` 下管理）。
> 视觉极限轴：**图像数据化 + 粒子物理** —— 歌词是用这张封面的像素堆出来的。

```
rubbing/
├── skin.json              清单（id / order 220 / capabilities / colors / budgetFps 45）
├── skin.js                入口：帧循环、字形掩码、粒子调度、封面取色、自适应降级
├── skin.css               全部视觉（画布、灰尘层、HUD、刻度、背景层内容）
├── assets/icon.svg        样式按钮图标（单色线稿，宿主当 alpha mask 用）
├── lib/
│   ├── palette.js         封面像素 → 颜色阶梯（纯函数）
│   ├── glyph.js           文字 → 掩码 → 目标点 → 逐字进度（纯函数）
│   └── field.js           粒子池（SoA）+ 物理 + 帧预算/自适应降级（纯函数）
├── tests/
│   ├── rubbing-logic.test.js   node --test：纯逻辑 + 契约静态体检
│   └── rubbing-check.mjs       本机 Edge：自带静态服务 + 假宿主，像素级断言
└── README.md
```

## 1. 安装

播放器**不读本目录**，它只认数据目录里的样式包：

```powershell
$dst = "$env:APPDATA\LocalMusicPlayer\player-skins\rubbing"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item -Recurse -Force plugins\style\rubbing\* $dst
```

然后在播放器里「设置 → 播放界面样式 → 重新扫描」。客户端里也可以直接「添加播放界面样式 →
从仓库获取」（读的是 `plugins/style/index.json`，见 `plugins/README.md`）。

## 2. 它长什么样

| 画面元素 | 做法 | 数据来源 |
| :--- | :--- | :--- |
| 字形 | 当前这句歌词离屏渲染成 560×180 掩码，膨胀一圈后在墨点上抽 3000~14000 个目标点 | `lyrics.lines[].text` |
| 粒子颜色 | 每个目标点按**自己的相对位置**去 64×64 封面采样上取像素 → 6 档色桶 | `ctx.media().cover` |
| 聚拢 | 弹簧 + 阻尼；已唱到的粒子强吸引（`springLit`），未唱到的只是灰尘（`springDust`） | `lyrics.lines[].words` |
| 逐字进度 | 每个字素一个 0..1 档，映射到 3 个亮度档（批次 = 色桶 × 亮度档 = 18 次 `fillStyle`） | `lyrics.lines[].words` |
| 湍流 | 频谱 0..12 段均值 → 每个粒子的随机加速度（相位错开，不会整体漂移） | `ctx.spectrum()` |
| 撒沙 | 切句时给每个粒子一次随机冲量，同时 `--rb-flux` 让整块画布"扬起"420ms | `song` / 行号变化 |
| 暂停 | 重力接管 → 落到地板上堆积（**不是冻结**），6 秒后才停帧 | `ctx.playback().playing` |
| 指针磁铁 | `pointermove` → 半径 74px 内的粒子被推开；`interactive:false` 时监听都不挂 | `ctx.options().interactive` |
| 灰尘层 | 整句 DOM 文本，极淡 + 1.1px 模糊（比用粒子再画一遍便宜得多） | 同上 |
| 整窗背景 | 封面第二份 `blur(34px)` + 面纱 + CSS 点阵砂纸颗粒 | `ctx.media().cover` |
| HUD | 曲名 / 艺人·专辑 / 试听角标 / 时间码 / 48 格进度刻度（只在变化时写 DOM） | `ctx.track()` `ctx.playback()` |
| 宿主壳配色 | `reportBackdrop({bg, fg, accent})`（400ms 防抖）+ 清单 `colors` 兜底 | 封面取色 |

> **配色口径（2026-10 修订）**：上报给宿主的 `bg`、以及 HUD 自己用的 `--rb-fg` 所依据的底，
> **不是封面本身**，而是「封面 → `.rbbg__img` 的 `blur(34px) brightness(0.46)` → `.rbbg__veil` 暗纱」
> 之后的**合成色**（再亮的封面压完也是近黑）。换算在 `lib/palette.js#backdropUnderCover`，
> 参数与 `skin.css` 同源（纯逻辑自检会比对两侧）。
> 早期版本拿未压暗的封面主色当选色依据 —— 封面比 ~0.17 亮就选出深色字，压在近黑的底上
> （实测 ~1.1:1），宿主壳（标题栏 / 底栏 / 侧栏）与 HUD 一起看不见。`accent` 现在也一起上报：
> 宿主壳的进度条 / 音量条 / 播放键 / 播放模式按钮走 `--accent` 家族，不报就会永远停在清单里
> 那个静态专色上、与封面无关。

封面是 data URL 或同源 `/online/cover` 代理，`drawImage` + `getImageData` 不会被污染（无需 `crossOrigin`）。

## 3. 契约用法（对照组）

| 用到的 | 说明 |
| :--- | :--- |
| `ctx.root` / `ctx.backgroundRoot` | 舞台与整窗背景层的容器。**背景层的内容是本包填的**，`destroy` 时自己清空并隐藏 |
| `ctx.options()` | `animations` / `interactive` / `performanceMode` |
| `ctx.env()` | `width` / `height` / `dpr` / `reducedMotion` |
| `ctx.track()` / `ctx.media()` / `ctx.playback()` | 曲目、封面、歌词、进度 |
| `ctx.spectrum()` | 128 段对数谱（拉取式，宿主已节流到 ~30Hz，**音量后取谱**） |
| `ctx.actions.seek` / `reportBackdrop` | 点字形带跳到本句；把**合成底 + 字色 + 封面强调色**上报给宿主壳 |
| `ctx.sdk.splitGraphemes` / `html.*` | 字素切分（必须与 `words` 下标同一份切法）/ 空态文案、封面兜底 |

**没有用**的东西（都是坑，见 `pending-designs.md` §1.3）：`ctx.assets`、`ctx.log`、
`capabilities.paintSelf`（宿主解析了但没有消费者）、`sdk.createFxLyrics` / `createLyricsView`
（要宿主骨架样式表）。粒子是自己画的：`<canvas>` + 定长类型化数组。

## 4. 降级矩阵（都是实测过行为的，不是"应该会"）

| 条件 | 表现 |
| :--- | :--- |
| `options.animations === false` 或 `env.reducedMotion === true` | 只算一次目标点并把粒子瞬移过去，**只画一帧**；CSS 过渡一并关掉 |
| `options.performanceMode === "performance"` | 粒子数 ÷3、帧循环按清单 `budgetFps: 45` 限帧、画布不再叠 `contrast()` 滤镜 |
| `options.performanceMode === "smooth"` | 不限帧（交 rAF）；写 DOM 前做过差值判断 |
| 画布耗时连续两帧超预算 | 自适应退档 `data-lod` 0→3（粒子 ×1 / ×0.66 / ×0.45 / ×0.30，后两档同时半分辨率，8 秒后不再退） |
| 暂停 / 无音频 | 重力落地堆积，6 秒后停帧（`[data-idle]`） |
| `visibility: {foreground:false}` | 立即停帧；回到前台且仍在播放时自动恢复 |
| `close`（详情页收起） | 停帧 + 隐藏整窗背景层 |
| 无封面 | 保持清单配色的**单色沙**（不取色、不报错） |
| `lyrics.lines[].words` 缺字 / 与字素数不一致 | 该行退回"整行一起亮"（否则下标串位会点错字） |
| 无歌词 / 无歌 | 显示 `sdk.html.lyricsEmptyText()`，整池退化成灰尘（画面不是白屏） |
| 非 16:9 视口 / 极窄窗口 | 字形带按舞台宽度等比缩放（`fitPoints` 不变形），画布按 dpr 重设 backing store |

## 5. 自检

```powershell
# 纯逻辑 + 契约静态体检（不需要浏览器，~0.2s）
node --test "plugins/style/rubbing/tests/*.test.js"

# 浏览器里的真实观感（自带静态服务 + 假宿主 + 系统自带 Edge）
node plugins/style/rubbing/tests/rubbing-check.mjs
```

`rubbing-check.mjs` 覆盖：挂载无报错、画布上真的出现了**非背景像素**（粒子确实画出来了）、
逐字档位随进度变化、暂停后**质心继续下落**、`animations:false` 时零帧、
`data-lod` 在慢帧下真的退档、窄窗口不横向溢出、`destroy` 后舞台与整窗背景层都干净
（这是第三方样式最容易漏的地方：背景层容器是宿主的，宿主不会替你清）。

## 6. 已知边界

- 一万多个 `fillRect` 是这一款最贵的地方：1080p 大约 3850 个粒子，4K + dpr2 会顶到 14000 上限。
  低端机上靠自适应降级退到 30%（画面变稀，但字仍然成形）。
- 逐字进度依赖 `words` 的千分位精度；纯 `[mm:ss]` 的行级歌词只能整行一起亮。
- 掩码渲染用的是系统字体栈（`Segoe UI` / `Microsoft YaHei`）：同一句歌词在不同机器上
  笔画粗细会有差别（目标点跟着笔画走，所以观感一致，只是颗粒疏密不同）。
- 换封面会重算整池粒子颜色（一次 64×64 采样 + 一次目标点重算），在低端核显上可能掉一帧。
