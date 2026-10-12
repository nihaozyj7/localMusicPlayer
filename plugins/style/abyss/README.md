# 深渊 abyss —— 第三方播放界面样式

> 契约 v3（`apiVersion: "3.0"`）· 清单 `order: 270` · `capabilities { spectrum, background, interactive }`
> 极限轴：**像素 / 着色器**。舞台是一缸缓慢流动的深水，歌词是水面被压出来的凹陷。

## 它长什么样

- **水**：半分辨率 WebGL2 流场（两张 `RGBA16F` 纹理 ping-pong）。频谱的低频推流速与液面高度、
  中频推域扭曲、高频推泡沫颗粒；封面被降采样成 128×128，再抹两遍、放大成 256×256 的密度场当"颜料"。
  湍流用的是**平滑值噪声**而不是逐纹素白噪声 —— 后者会被速度积分放大 ~60 倍，
  表现成"水面上撒了一层麻点"（见"实现要点"）。
- **歌词**：宿主 SDK 的 `createLyricsView` 渲染**真文字**（矢量、可选中、逐字填充 `--w` 都在），
  `mix-blend-mode: screen` 让字"咬"进水里。
- **凹陷**：当前行会**再渲染一次**到一张离屏遮罩画布（同字体、同字号、同坐标），
  shader 拿它求梯度当法线，把液面压下去并折射它下面的颜料 —— 这是本款的技术核心。
- **背景层**：清单声明 `background: true`，所以整窗底色（径向渐变 + 封面 + 光斑）由本包填、也由本包清。
- **HUD**：曲名 / 下潜深度读数（`− 1240 m`，整首歌 0..2400m）/ 时间码。本款声明了
  `background:true`（舞台 `inset:0` 铺满整窗），而宿主的「标题栏 + 详情页头部行」与
  「底部播放控件栏」浮在画面上 —— 所以 HUD 的上下两行、以及 Canvas2D 兜底角标都用
  `calc(var(--skin-inset-*, 0px) + Npx)` 让开；窄窗档覆盖 `padding` 时同样要把 `calc(...)` 带上。

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
# 纯逻辑（40 项：泵浦/密度场/深度/分辨率/降档/相位/遮罩坐标/涌浪 + 契约静态扫描 + 可解析性）
node --test "plugins/style/abyss/tests/*.test.js"

# 浏览器（自带静态服务 + 假宿主 + 真歌词模块 + 无头 Edge，走 CDP）
node plugins/style/abyss/tests/abyss-check.mjs
```

浏览器自检里有四件是**量出来**的，不是"看起来对"：

1. 把 `WebGL2RenderingContext.prototype.drawArrays` 打点，并在**成画那一笔**（默认帧缓冲）
   之后立刻 `readPixels` 取 16×4 像素指纹 —— 指纹随时间变化才算"水真的在流"；
2. 字形遮罩的**墨迹包围盒** vs DOM 文字的包围盒，四条边逐像素比（要求 ≤ 4px）；
3. **当前行真的读得清**：把当前行那一条（±6px）截下来，在页内解码后取"暗的一半的中位数"当底色、
   取最亮的 1% 当中值当前景色，算 WCAG 对比度，要求 ≥ 4.5:1（实测 9.8:1）。
   这条是补出来的 —— 在这之前 39 项纯逻辑 + 125 项浏览器全绿，而真机上是**一层灰雾盖着字**（1.31:1）；
4. 兜底不是装饰：一种把 `getContext("webgl2")` 关掉，另一种**真的**用
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
- **遮罩每行只画一次**：判据是「行号 + 文本 + 遮罩尺寸 + 滚动位置」，逐帧重画一张全舞台画布纯属浪费。
  `+ 滚动位置`是后加的：SDK 把当前行滚到中间时改的是 `scroller.scrollTop`（**滚动**，不是布局变更），
  只按「行号 + 尺寸」判重会让遮罩停在上一行的坐标上，实测偏 11~46px。
- **当前行只改字号，不许 transform 缩放**：缩放会改变字形，遮罩是按"盒子 + 计算字号"画的，一缩就不齐。
- **`@layer` 输给没分层的样式表**：宿主把插件 CSS 包成 `@layer skin { @scope(…) { … } }`，
  而宿主的 `lyrics.css` 是**没有分层**注入的。层叠里"未分层"永远赢分层（层序优先于特异性），
  所以本包写 `.lyric { font-size/color/opacity }` **一条都不可能生效** —— 屏幕上就是主题那套灰蓝字。
  唯一能改的旋钮是**自定义属性**：把 `--lyric-size / --lyric-size-active / --lyric-dim / --text-1 /
  --accent` 声明在 `.lyrics__scroll` 上（它比 `.lyrics` 更靠近 `.lyric`），变量按"最近的声明"解析，
  与层无关。自检为此专门加了 `/host/` 路由把真的 `lyrics.css` 一起加载 —— 在此之前自检
  跑在一个"没有歌词 CSS"的假环境里，看着全绿。
- **`--lyric-pad` 是百分比，解出来是**水平**内边距**：百分比 padding 永远按**宽度**算。
  舞台 1280×800 时 `padding: 36% 0` 是上下各 460px，把字挤出可视区。改成 `calc(var(--ab-h) * 0.245)`。
- **颜色按 0..255 传进 `uniform3f` 会炸成白雾**：`hexToRgb` / Canvas2D 那一侧的口径是 0..255，
  着色器要的是 0..1。忘了除 255，`uBg * 0.6` 直接是 (2.4, 10.8, 16.2) —— 整屏灰白。
  两条自检当时都是绿的，因为**没有任何一条在量"渲染出来的亮度"**。
- **canvas 的 `letterSpacing` 在这个 Chromium 上不算数**：宿主给当前行带 `letter-spacing: -0.01em`，
  `measureText` 与 `fillText` 都不理它，遮罩于是比 DOM 宽 n × 0.32px（20 个字就是 6px）。
  现在不赌引擎支持：按 DOM 量出来的宽度**横向微缩**（通常 0.99x，肉眼看不出），轮廓与 DOM 完全重合。
- **逐纹素白噪声不能当湍流**：速度场每帧衰减 0.985 ⇒ 白噪声被积分放大 ~60 倍，
  下游又拿 `flow` 去挪封面采样点，相邻像素采到封面不同位置 —— 屏幕上是一层"麻点"，
  还因为 `floor(uv*20)` 聚成方块。换成平滑值噪声（格子间插值）后才有"水在流"而不是"水在抖"。
- **封面平铺不能用 `fract`**：接缝两侧取到封面的两端，明暗差一截，再被逐纹素噪声一推就是
  "一块硬边色块 + 一排毛刺"。改成镜像折叠（`abs(fract(v)*2-1)`），接缝两侧取值连续。
- **插件里的 JS 模板串很脆**：着色器源码写在模板串里，改注释时顺手写了一个反引号，
  模板串提前闭合 —— 静态扫描（只读文本）看不出来，浏览器里是 `SyntaxError`。
  自检里因此有一条**真的 `import()` 一遍**每个文件的用例（40 项里的最后一条）。

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

## 验收结果（2026-10-11 复验）

**验收结果**：纯逻辑 **40/40**、浏览器 **130/130**、真机探针 **9/9**；
`node plugins/build-index.mjs --check` → `plugins/style/index.json` 已是最新（7 个条目 / 58 个文件）。
签收台账见 `plugins/style/pending-designs.md` §4 与 §5.06。

| 命令 | 结果 |
| :--- | :--- |
| `node --test "plugins/style/abyss/tests/*.test.js"` | **40 / 40 通过** |
| `node plugins/style/abyss/tests/abyss-check.mjs` | **130 / 130 通过** |
| `node tools/.tmp-abyss-live.mjs`（真机，临时探针） | **9 / 9 通过**：真机真的跑在 WebGL2（`data-gl=1` / `glerr=0` / 流场 1170×764 / `tier=full`）、真频谱喂进水里（`--ab-lift 0.999` / `--ab-turb 0.991`）、真歌词逐字写进 `--w` 且字形遮罩按当前行画出来（`mask=9` / `maskerr=0`）、当前行 32px 且是 `rgb(88, 199, 255)`、当前行落在舞台 53% 高度、控制台零 error |

浏览器自检里最硬的三条读数：**成画那一笔之后 `readPixels` 出来的 16×4 像素指纹，88 帧里有 85 个不同值**
（水真的在流，不是自己报的计数）；**字形遮罩的墨迹包围盒 vs DOM 文字行盒：左边缘 ≤1px、中心 ≤3px**
（一份排版渲染两次真的对得上）；**当前行那一条的 WCAG 对比度 9.36:1**（底色 `(10,30,42)` / 字色 `(92,204,255)`）。
GPU 时间由 `EXT_disjoint_timer_query_webgl2` 量到 ~1.6ms（`gl.finish()` 在 ANGLE 上是假 0ms，不能用）。

> 上一轮（2026-10-11）的读数曾经是"纯逻辑 39/39 + 浏览器 125/125 全绿"，但真机上字是**读不清**的：
> 对比度只有 1.31:1，因为暗角层在 DOM 里排在歌词**之后**、又把整块压暗。这一轮把暗角挪到歌词之前、
> 加了一层歌词专用的柔光底、并且补上了上面那条**量对比度**的断言 —— 绿的前提是先有量具。

## 实现偏差与限制

- **暂停后水面停帧**：设计稿写的是"静置时也有微流、永不完全停"，但签收规则 S6 的"暂停后自动停帧"
  是硬条件 —— 现在是暂停 6 秒后连 GL 一起停帧，最后一帧留在屏上（停帧前 `--ab-lift` 会衰减但不归零）。
- **歌词的字号 / 颜色只能靠自定义属性改**（见上面那条 `@layer` 的坑）：宿主 `lyrics.css` 没分层，
  任何直接命中 `.lyric` 的规则都赢不了它。好处是本包不会跟主题的字号设置打架；
  代价是**能改的东西只有那几个变量**，想要别的效果得先请宿主把变量开出来。
- **密度场是 128 采样 + 两遍模糊**：封面自带的硬边（标题条、白框）仍然会以"水下的一块暗/亮斑"出现，
  这是"封面当颜料"的既定行为，不是瑕疵。采样降到 64 会在屏幕上留下 ~17px 的硬边方块（已经踩过）。
- **兜底必须用第二张 canvas**：一个 canvas 一辈子只能有一种上下文，`.ab__fluid` 拿过 `webgl2` 之后
  再问它要 `"2d"` 永远是 `null`（**上下文丢了之后也一样**）。所以 `.ab__soft` 是独立的画布，
  用 `visibility` 切换（两张布局盒子完全一致）。这条是写完浏览器自检才暴露的。
- **`gl.finish()` 不是量具**：探针 P1 在真机 ANGLE/D3D11 上量到它基本不等 GPU（0ms 级）。
  一帧耗时只能用 GPU 计时器查询，而且要**攒 30 帧一个窗口**、连续 3 窗同向才动档位。
- **不许自我反馈**：渲染目标同时当采样源会报 1282 `INVALID_OPERATION` 并静默丢帧
  （表现是"每帧 0.008ms，快得像没画"）。两张纹理 ping-pong，每帧查一次 `getError()`。
- **自适应档位会把默认半分辨率升到全分辨率**：真机实测半分辨率只要 ~1ms，连续三窗"够快"就升到
  `full`（真机探针里就是 `tier=full`）。这不是 bug，是设计里"能快就快"的那一条；`performanceMode`
  档位固定 1/3 + 24fps，不受自适应影响。
- **`letterSpacing` 靠横向微缩补**：canvas 不认这个属性，遮罩用"按 DOM 宽度横向缩一点"来对齐
  （k 通常 0.99）。如果哪个版本开始认了，`measureText` 会跟着变，k 自动回到 1，不需要改代码。
- **名词表**：设计稿的 `empty → surfacing → flowing → paused` 状态机，落成屏上可见的三个值
  `empty / flowing / still`；"surfacing"改成一次 900ms 的**涌浪包络**（换歌必发，频谱尖峰也能触发）。
