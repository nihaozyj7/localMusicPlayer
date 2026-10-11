# 深渊 abyss —— 第三方播放界面样式

> 契约 v3（`apiVersion: "3.0"`）· 清单 `order: 270` · `capabilities { spectrum, background, interactive }`
> 极限轴：**像素 / 着色器**。舞台是一缸缓慢流动的深水，歌词是水面被压出来的凹陷。

## 它长什么样

- **水**：半分辨率 WebGL2 流场（两张 `RGBA16F` 纹理 ping-pong）。频谱的低频推流速与液面高度、
  中频推域扭曲、高频推泡沫颗粒；封面被降采样成 64×64，再放大成 256×256 的密度场当"颜料"。
- **歌词**：宿主 SDK 的 `createLyricsView` 渲染**真文字**（矢量、可选中、逐字填充 `--w` 都在），
  `mix-blend-mode: screen` 让字"咬"进水里。
- **凹陷**：当前行会**再渲染一次**到一张离屏遮罩画布（同字体、同字号、同坐标），
  shader 拿它求梯度当法线，把液面压下去并折射它下面的颜料 —— 这是本款的技术核心。
- **背景层**：清单声明 `background: true`，所以整窗底色（径向渐变 + 封面 + 光斑）由本包填、也由本包清。
- **HUD**：曲名 / 下潜深度读数（`− 1240 m`，整首歌 0..2400m）/ 时间码。

## 文件

```
skin.json         清单（order 270 / background:true / budgetFps 45）
skin.js           入口：挂载、补丁、时钟、帧循环、降档、上报配色、卸载
skin.css          舞台 / 液面 / 歌词 / HUD / 背景层 / 降级档
lib/water.js      纯逻辑：频谱→泵浦、封面→密度场、深度、分辨率、降档、相位、遮罩坐标、涌浪
lib/gl.js         WebGL2 流场（ping-pong / GPU 计时器 / 上下文丢失 / 主动释放）
lib/canvas2d.js   Canvas2D 伪流体兜底（双层位移贴图 + 遮罩暗刻）
lib/mask.js       字形遮罩：用 Range 量出真实排版，再照着画一遍
assets/icon.svg   图标
tests/            自检（纯逻辑 + 浏览器）
```

## 自检

```powershell
# 纯逻辑（39 项：泵浦/密度场/深度/分辨率/降档/相位/遮罩坐标/涌浪 + 契约静态扫描）
node --test "plugins/style/abyss/tests/*.test.js"

# 浏览器（自带静态服务 + 假宿主 + 真歌词模块 + 无头 Edge，走 CDP）
node plugins/style/abyss/tests/abyss-check.mjs
```

浏览器自检里有三件是**量出来**的，不是"看起来对"：

1. 把 `WebGL2RenderingContext.prototype.drawArrays` 打点，并在**成画那一笔**（默认帧缓冲）
   之后立刻 `readPixels` 取 16×4 像素指纹 —— 指纹随时间变化才算"水真的在流"；
2. 字形遮罩的**墨迹包围盒** vs DOM 文字的包围盒，四条边逐像素比（要求 ≤ 4px）；
3. 兜底不是装饰：一种把 `getContext("webgl2")` 关掉，另一种**真的**用
   `WEBGL_lose_context.loseContext()` 把上下文丢掉 —— 两条路都必须无缝切 Canvas2D，
   画面继续（数 2D 画布的 `clearRect`），并且 `destroy` 时 `loseContext()` 必须被调到。

## 实现要点（踩过的坑）

- **探针 P1 的结论**（真机 WebView2 / ANGLE D3D11）：`webgl2` ✓、`alpha`+`premultipliedAlpha:false` ✓、
  `EXT_color_buffer_float` ✓、`EXT_disjoint_timer_query_webgl2` ✓。
  `gl.finish()` **基本不等 GPU**（实测 0ms），所以一帧耗时只能用 GPU 计时器量；
  计时结果在**同一个 rAF 循环里顺手取**，不额外开探测循环。
- **不许自我反馈**：渲染目标同时当采样源会报 1282 `INVALID_OPERATION` 并静默丢掉整帧
  （表现为"每帧 0.008ms，快得像没画"）。所以两张纹理 ping-pong，且**每帧查一次 `getError()`**。
- **兜底要另一张 canvas**：一个 canvas 一辈子只能有一种上下文；`.ab__fluid` 拿过 webgl2 之后，
  再问它要 `"2d"` 永远是 `null`（上下文丢了也一样）。两张画布用 `visibility` 切，布局盒子不变。
- **时间轴分两口钟**：`performance.now()` 只管调度（限帧、闲置看门狗、计时窗口），
  画面用**歌曲钟**（外推位置）与**真实经过的毫秒**（泵浦相位积分）——
  直接把 4Hz、量化 250ms 的进度当相位用会一顿一顿。
- **遮罩每行只画一次**：判据是「行号 + 文本 + 遮罩尺寸」，逐帧重画一张全舞台画布纯属浪费。
- **当前行只改字号，不许 transform 缩放**：缩放会改变字形，遮罩是按"盒子 + 计算字号"画的，一缩就不齐。

## 降级链

| 情况 | 表现 |
| :--- | :--- |
| 正常 | 半分辨率 GL 流场；GPU 计时器说慢就降到 1/3，说快连续三窗才升回全分辨率 |
| `performanceMode: "performance"` | 固定 1/3 分辨率 + 24fps |
| `animations: false` / `reducedMotion` | 一次静态帧，不进帧循环；补丁来了同步画一帧 |
| 切后台 / `close` | 停帧；回前台继续 |
| 暂停 6 秒 | 停帧（水停在最后一帧） |
| 拿不到 `webgl2` / 上下文丢失 | Canvas2D 伪流体 + 屏角"Canvas2D 伪流体"角标，`data-gl="0"`、`data-fallback="1"` |

## 可观测状态（自检与真机探针读它，不靠"看起来正常"）

`data-gl` / `data-render` / `data-tier` / `data-tier-move` / `data-flow` / `data-draws` / `data-glerr` /
`data-glerrcode` / `data-glms` / `data-meas` / `data-half-float` / `data-timer` / `data-gl-fail` /
`data-fallback` / `data-gl-lost` / `data-mask` / `data-maskerr` / `data-maskrev` / `data-maskscale` /
`data-depth` / `data-line` / `data-total` / `data-empty` / `data-playing` / `data-flow-state` /
`data-spec` / `data-idle` / `data-perf` / `data-animations` / `data-interactive` / `data-narrow` /
`data-dpr` / `data-cover-ready` / `data-surge`

## 安装

把 `abyss/` 整个目录拷到 `%APPDATA%\LocalMusicPlayer\player-skins\abyss\`，然后在播放器里
「重新扫描」并选择「深渊」。仓库里的 `plugins/style/index.json` 由 `node plugins/build-index.mjs`
生成（客户端「从仓库获取」那页读它）。

## 验收结果（2026-10-11）

**验收结果**：纯逻辑 **39/39**、浏览器 **125/125**（连跑两次全绿）、真机探针 **28/28**；
`node plugins/build-index.mjs --check` → `plugins/style/index.json` 已是最新（7 个条目 / 58 个文件）。
签收台账见 `plugins/style/pending-designs.md` §4 与 §5.06。

| 命令 | 结果 |
| :--- | :--- |
| `node --test "plugins/style/abyss/tests/*.test.js"` | **39 / 39 通过** |
| `node plugins/style/abyss/tests/abyss-check.mjs` | **125 / 125 通过**（连跑两次全绿） |
| `node .tmp-skin-live.mjs --skin abyss`（真机） | **28 / 28 通过**：真机真的跑在 WebGL2（`data-gl=1` / `glerr=0` / 854 次出帧 / 流场 1280×820 / `tier=full`）、真频谱喂进水里（`--ab-lift 0.995` / `--ab-turb 1.000` / `--ab-foam 1.000`）、真歌词逐字写进 `--w`（0.06）且字形遮罩按当前行画出来（`mask=5` / `maskerr=0`）、暂停 6 秒 `data-idle=1` 且时间码不再走、换样式零残留、820px 窄窗不溢出、切深浅色不炸、关详情页再开能重挂、控制台零 error/warn |

浏览器自检里最硬的两条读数：**成画那一笔之后 `readPixels` 出来的 16×4 像素指纹，81 帧里有 80 个不同值**
（水真的在流，不是自己报的计数）；**字形遮罩的墨迹包围盒 vs DOM 文字行盒：左边缘 0px、中心 2px、
宽度比 0.972**（一份排版渲染两次真的对得上）。GPU 时间由 `EXT_disjoint_timer_query_webgl2` 量到
1.0~1.3ms（`gl.finish()` 在 ANGLE 上是假 0ms，不能用）。

## 实现偏差与限制

- **暂停后水面停帧**：设计稿写的是"静置时也有微流、永不完全停"，但签收规则 S6 的"暂停后自动停帧"
  是硬条件 —— 现在是暂停 6 秒后连 GL 一起停帧，最后一帧留在屏上（停帧前 `--ab-lift` 会衰减但不归零）。
- **兜底必须用第二张 canvas**：一个 canvas 一辈子只能有一种上下文，`.ab__fluid` 拿过 `webgl2` 之后
  再问它要 `"2d"` 永远是 `null`（**上下文丢了之后也一样**）。所以 `.ab__soft` 是独立的画布，
  用 `visibility` 切换（两张布局盒子完全一致）。这条是写完浏览器自检才暴露的。
- **`gl.finish()` 不是量具**：探针 P1 在真机 ANGLE/D3D11 上量到它基本不等 GPU（0ms 级）。
  一帧耗时只能用 GPU 计时器查询，而且要**攒 30 帧一个窗口**、连续 3 窗同向才动档位。
- **不许自我反馈**：渲染目标同时当采样源会报 1282 `INVALID_OPERATION` 并静默丢帧
  （表现是"每帧 0.008ms，快得像没画"）。两张纹理 ping-pong，每帧查一次 `getError()`。
- **自适应档位会把默认半分辨率升到全分辨率**：真机实测半分辨率只要 ~1ms，连续三窗"够快"就升到
  `full`（探针里就是 `tier=full`）。这不是 bug，是设计里"能快就快"的那一条；`performanceMode`
  档位固定 1/3 + 24fps，不受自适应影响。
- **名词表**：设计稿的 `empty → surfacing → flowing → paused` 状态机，落成屏上可见的三个值
  `empty / flowing / still`；"surfacing"改成一次 900ms 的**涌浪包络**（换歌必发，频谱尖峰也能触发）。
