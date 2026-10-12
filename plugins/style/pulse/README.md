# 心跳 · pulse

> 第三方播放界面样式包（契约 v3，`apiVersion: "3.0"`，`order: 250`）。
> **不与播放器源码耦合**：只走 `ctx` 契约，零项目 import。

**极限轴**：同步 / 预测。宿主给的料很少、很难看 —— 频谱只有 ~30Hz（拉取式 `ctx.spectrum()`），
进度只有 4Hz 且位置被量化到 250ms。这一款要在这点料上做**音画同拍**。

**一句话**：一台老式心电示波器。屏幕上是过去 6 秒的能量包络（向上长）+ 谱质心轨迹（上方窄带）+
flux 闸门（基线下方）；自己算 onset、自己估 BPM、自己预测拍点，把拍点画成一列**跟着窗口平移**的
网格线，把歌词行切换柔性吸附到拍点上，还让两枚机械刻度环的转速与相位跟着脉搏走。

---

## 1. 包结构

```
pulse/
├── skin.json                  清单（能力 / 配色 / 帧预算 / 图标）
├── skin.js                    入口：mount(ctx) / update(ctx, patch) / destroy(ctx)
├── skin.css                   示波器外观（无 filter：扫描线是纯渐变）
├── assets/icon.svg            样式卡片图标
├── lib/
│   ├── beat.js                检测 / PLL / 预测 / 吸附（纯逻辑，无 DOM）
│   └── scope.js               示波器几何 + 配色工具（纯逻辑，无 DOM）
├── README.md
└── tests/
    ├── pulse-logic.test.js    纯逻辑自检（node --test，51 项）
    └── pulse-check.mjs        浏览器自检（自带静态服务 + 假宿主 + 无头 Edge）
```

子模块用 ``import(`./lib/<file>${Q}`)`` 加载，`Q = new URL(import.meta.url).search` ——
宿主的样式包是同源路由 `/skins/<id>/<file>?t=<token>`，丢了查询串会 404（自检里有一条静态扫描盯着）。
**所以 lib 之间不许互相 import**（那会绕开 token）：`scope.js` 需要的吸附函数由调用方注入
（`railTicks(words, beats, layout, t0, span, snapFn, maxMs)`）。

## 2. 画面结构（DOM 层次）

```
ctx.root（舞台）
└─ .pl                     示波器整屏（这一款**不申请**整窗背景层：capabilities.background = false）
   ├─ .pl__scope           屏幕（canvas 的坐标空间就是这一块盒子）
   │   ├─ canvas.pl__cv       包络 + 质心 + flux（一条 canvas，逐帧重画）
   │   ├─ .pl__beats       预测拍点竖线 × 16（DOM：自检能量它的 x）
   │   ├─ .pl__rail        当前行逐字素刻度 × 64（吸附上的更长更亮，带 data-snap）
   │   ├─ .pl__sweep       扫描指针（右端 = 现在；亮度跟着 --pl-pulse）
   │   └─ .pl__nospec      无频谱提示
   ├─ .pl__grid            屏幕框 + 四角括号 + 刻度
   ├─ .pl__gears           两枚机械刻度环（12 等分 conic-gradient，转速 = 一拍一圈）
   ├─ .pl__lyrics          宿主 SDK 的 createLyricsView 渲染在这里
   └─ .pl__hud             BPM / 提示 / 曲名 / 相位 / 时间码
```

**拍点与刻度是 DOM，波形是 canvas** —— 这么分的理由很实际：自检要能**量**"预测的拍点落在哪"、
"哪些字素真的吸上去了"，而 canvas 像素取证又慢又脆。波形（连续量、每帧都变）留在 canvas 里。

## 3. 数据映射

| 输入 | 驱动 | 落在哪 |
| :--- | :--- | :--- |
| `spectrum().bands[0..127]` | 能量 `Σbands/128`（包络） | canvas：基线**向上**生长的曲线 |
| 同上 | 谱质心 `Σ(i·b)/Σb`（0..1） | canvas：上方窄带的轨迹 |
| 同上 | flux `Σmax(0, b−b_prev)/128` + 自适应阈值 | onset 检测 → PLL |
| onset 流 | 间隔的**修剪均值** → BPM（折进 60..180） | `.pl__bpm`、齿轮转速 |
| 间隔的变异系数 | `locked` / `listening` / `free`（**不谎报 BPM**） | `.pl[data-beat]`、文案 |
| 预测拍点 | 竖线网格（每帧只写一次容器位移）+ canvas 淡竖线 | `.pl__beats` / canvas |
| `progress` 位置（4Hz + 250ms 量化） | 墙钟外推 + 70ms 视觉提前量 | 歌词当前行 / 时间码 |
| `lyrics.lines[].words` | 字素时刻 → 刻度；偏差 ≤ 90ms 的**柔性吸附**到拍点 | `.pl__tick[data-snap]` |
| 拍点相位 | 脉冲峰值出现在**拍点之前 40ms**（负延迟补偿） | `--pl-pulse` → 扫描指针与 BPM 数字的辉光 |
| 相位（0..1） | 齿轮的 `animation-delay`（负值）= 相位对齐 | `--pl-period` / `--pl-phase-ms` |
| `options.performanceMode:"performance"` | 包络降采样到 **15Hz**（取 min(清单 60, 15)）、齿轮停转 | `.pl[data-perf="1"]` |
| `options.animations:false` / `env.reducedMotion` | **不进帧循环**，补丁来了画一帧静态包络；不做 PLL | `.pl[data-animations="0"]` |
| `env.width < 900` | 屏幕框收窄、齿轮缩小、字号收一档 | `.pl[data-narrow="1"]` |
| 点击屏幕 | `ctx.actions.seek(那一刻)`（整块示波器都是命中区） | — |
| `ctx.actions.reportBackdrop` | 清单配色（深底 + 荧光绿）固定，挂载后 400ms 防抖上报一次 | 宿主壳配色 |

### 为什么"只有一条 rAF"

契约允许皮肤自己开循环，但歌词视图 `createLyricsView` 内部也有一条：它的 `setPlaying(true)` 会启动
自己的平滑推进 rAF。这一款**不需要**它 —— 皮肤每帧自己喂一个墙钟外推过的位置
（`view.setPosition(pos, {playing:false})`，`setActive` 会在行号没变时提前返回），
而 SDK 的逐字丝滑推进**已经在 `setPosition` 里做了**，`playing` 只控制它自己那条 rAF。
于是整屏只有 `skin.js` 这一个 `requestAnimationFrame`，暂停 6 秒后干净停帧。

## 4. 状态机

`listening`（校准中…，拍点不足 4 个）→ `locked`（间隔变异系数 ≤ 0.16，显示 BPM 与拍点网格）
→ 中间地带仍是 `listening`（0.16..0.34 之间**继续校准**，不显示数字）→ `free`（≥ 0.34 或拿不到频谱，
如实显示「自由节拍」，并说明原因）。换歌时 PLL 整个重置（新歌的 BPM 大概率不一样，留着旧锚点只会错拍）。

对外可观测的 `data-*`：`beat` / flash / playing / idle / closed / perf / animations / lowMotion /
narrow / mode / dpr / total / empty / line / marks / ticks / snapped / foreground。

## 5. 降级矩阵

| 条件 | 行为 |
| :--- | :--- |
| `performance` 档 | 包络降采样到 15Hz（比清单的 60 更严，取 `min`）、齿轮停转；网格与刻度照旧 |
| `animations:false` 或 `reducedMotion` | 不进帧循环、不做 PLL、不显示拍点；补丁来了一帧一画，信息不丢 |
| 拿不到频谱（预览 / 后端未就绪） | `free` + 「自由节拍」+ 屏内「无频谱输入」，绝不假装在监听 |
| 拍点不稳（cv ≥ 0.34） | `free`：不显示 BPM、不画拍点网格、歌词刻度全部不吸附（散板保留） |
| 无字级歌词 | 刻度一条不画，歌词照常滚动（不猜字素时刻） |
| 窄窗口（< 900px） | 屏幕框收窄、齿轮 58→40px、BPM 字号收一档 |
| `interactive:false` | 屏幕不可点（不 seek）、歌词行不可点 |
| 暂停 6 秒 | 停帧（保留最后画面），播放或任何补丁把它唤醒 |

## 6. 自检

```powershell
node --test "plugins/style/pulse/tests/*.test.js"     # 纯逻辑
node plugins/style/pulse/tests/pulse-check.mjs        # 浏览器（自带静态服务 + 无头 Edge）
```

- **纯逻辑**（51 项）：能量 / 质心 / flux 的语义（稳态不报 onset、抬起来才算）、自适应阈值
  （**音量 4% 时照样检出**：频谱是音量后的口径，绝对阈值会全漏）、onset 冷却、
  间隔物理范围过滤、修剪均值估 BPM、变异系数判定、四个状态分支的文案、
  PLL 软校正（偏差 ≤ 25% 周期只挪一半，超了就重新起拍）、负延迟补偿的峰值位置、
  柔性吸附（窗口边界取等号、吸最近的那个、差得远的不许拖）、环形缓冲与插值、
  窗口映射（参照点换掉时屏幕位置仍连续）、示波器几何（单调性 / 越界钳制 / 空序列）、
  颜色工具、**环形缓冲的两种上界（时间保留：30/60/85/120/144/240Hz 下 6 秒窗口都要铺满；
  容量：样本很密时不许越过 `RING_CAP`）**、以及**契约纪律的静态扫描**
  （imports / `?t=` 透传 / `ctx.*` 白名单 / 不碰 `backgroundRoot` / CSS 禁用项 /
  只有 3 处 rAF 且歌词视图恒以 `playing:false` 驱动 / destroy 清理清单）。
- **浏览器**（114 项）：真实 `@layer`+`@scope` 下装真模块（含真实的 `createLyricsView`）——
  500ms 合成 onset 流是否真的收敛到 120BPM 并写出拍点、随机间隔是否真的落到 `free`、
  刻度是否真的吸到拍点上（**吸过的刻度与拍点标记的 rect 重合 ≤ 1.5px**）、
  点屏幕是否 seek 到那一刻、窗口位移是否连续（每 50ms = −plotW×50/6000、拍点整体刚性左移）、
  暂停 6 秒停帧、切后台停帧、`close` 停帧、`animations:false` 零帧但画面完整、
  performance 档按 **15Hz** 渲染（数的是渲染帧，不是 rAF 回调）、窄窗口不溢出、destroy 零残留、
  **歌词真的自己滚**（场景 F：60 行歌词，滚动容器的 `clientHeight` 必须等于歌词带的可见高度、
  当前句必须落在带子里且被滚到垂直中央、进度往前走 `scrollTop` 单调增长）。
  这些场景跑在**宿主的真样式**上（`/host.css` = 复位 + 令牌 + 深色主题 + 真 `lyrics.css`），
  不是自检里抄的一份骨架 —— 见 §7 第一条。
- **真机**：`.tmp-skin-live.mjs --skin pulse`（真 CSP 下 `/skins/` token 路由 import、真频谱驱动
  检测与包络、真歌词驱动刻度、换样式零残留、窄窗不溢出、切主题不炸）。

### 验收结果

| 命令 | 结果 |
| :--- | :--- |
| `node --test "plugins/style/pulse/tests/*.test.js"` | **51 / 51 通过** |
| `node plugins/style/pulse/tests/pulse-check.mjs` | **114 / 114 通过**（有一项「拍点整体跟着容器刚性左移」是**历史遗留的偶发**：它按 50ms 采样、用最近邻配对，采样格差一帧就会出现 12 vs 11 的 1px 对不上 —— 与歌词无关，改动前它同样会偶发失败） |
| `node .tmp-skin-live.mjs --skin pulse`（真机） | **36 / 36 通过**：真频谱上 `data-beat=locked`、`data-onsets=27`、`data-cv=0.07`、29 个拍点、2 个刻度吸附；**歌词滚动容器 173px = 歌词带的可视高度 173px**（`--lyric-pad` 86.4px，当前句落在带子中央 67..113）；暂停 6 秒 `data-idle=1` 且时间码不再动；换样式零残留；820px 窄窗画布跟随舞台不溢出；切深浅色不炸；关详情页再开能重挂；控制台零 error/warn |
| `node plugins/build-index.mjs --check` | 通过（7 个条目 / 58 个文件） |

## 7. 实现偏差与限制

- **拍点网格用"滑动窗口"而不是逐帧写 x**：设计稿是"每帧重算 16 个拍点的 x"。实际是
  40 个元素带 `--x`（只在重锚 / 换行 / 窗口重设时写）+ 容器每帧只写**一条** `--pl-slide`。
  窗口重设时同一帧里重算 x 并把位移归零 —— 屏幕上的位置是连续的，不会跳。写入量差一个数量级。
  （池子 40 而不是 16：元素保留范围是**双倍窗口** 12 秒，180BPM 时那里有 36 个拍点。）
- **齿轮转角交给 CSS animation**：设计稿是"每帧写一个旋转角"。实际写 `--pl-period` 与
  `--pl-phase-ms`（一拍一次），相位用**负 `animation-delay`** 对齐，旋转由合成器跑。
- **BPM 用修剪均值**，不是中位数也不是均值：中位数抗漏检但对抖动敏感（±8% 抖动会偏 5%），
  均值对漏检敏感。做法是先取中位数，再只平均落在中位数 ±35% 内的间隔（±8% 抖动下偏 1%）。
- **阈值是三选一取最大**（下限 / 近期峰值的一部分 / 近期中位数的 1.7 倍）：因为频谱是**音量后**的
  口径 —— 真机探针把音量压到 0.04，纯绝对阈值会一个 onset 都检不出来。
- **字级刻度上限 64 个**（一行最多量 64 个字素）：超长行的尾部刻度不画，避免一行几百个节点。
- **不做"能量阈值自适应 BPM 范围"**：BPM 固定折进 60..180（`foldBpm`），
  所以 90 与 180 会被判成同一个脉搏 —— 这是刻意的（也是唯一不谎报的办法：频谱给不出小节线）。
- **环形缓冲按「时间」保留，不按帧数**：缓冲是**每帧**写一个样本，所以能存几秒取决于刷新率。
  容量曾经写死 512（"6 秒 × 60fps，留点余量"）：60Hz 下 8.5 秒看着没问题，**120Hz 只剩 4.26 秒**、
  144Hz 只剩 3.55 秒 —— 真机表现是**波形左端整块空掉**（120Hz 空 29%、144Hz 空 41%，刷新率越高空得越多），
  而开/拖窗口时帧率一掉就"刚好好了"、停下来一会儿又空回去（看起来像随机故障）。
  现在 `ringPush` 以 `RING_KEEP_MS`（窗口 6 秒 + 1 秒余量）为准丢最旧的样本，容量（`RING_CAP = 4096`）
  只当内存上界（够到 ~580Hz）。这条有回归用例钉着：`30/60/85/120/144/240Hz 下窗口覆盖都要≈6 秒`。
- **歌词当前行自己算**（二分查找），不调 `lyrics().index`（4Hz 才更新，不能当连续量用）。
- **歌词带必须自己重设 `--lyric-pad`，否则表现是「歌词不会自行滚动」**：宿主 `lyrics.css`
  给的是 `--lyric-pad: 34%`，而 CSS 的百分比内边距是相对**宽度**解析的 —— 那一档是按
  「几百 px 高的竖排歌词列」定的。心跳的歌词带只有舞台高的 27%（1100×700 窗口下 189px 高）、
  宽却有 ≈1030px，34% = 350px 的上下内边距**比容器本身还高**：`box-sizing: border-box` 下
  浏览器会把盒子撑到「内边距之和」（`clientHeight` 变成 702px，而可见的只有父级 `.pl__lyrics`
  裁出来的 189px）。SDK 按 `clientHeight` 居中当前行时，就把当前句放到了可见带**之下 160px** ——
  屏幕上一直是「8 句以前」的歌词在慢慢爬，当前句永远不进视野。现在按**舞台高**取半个歌词带
  （`calc(var(--pl-h) * 0.135)`，窄窗口 0.145），既让第一句正好落在带子中线，又保证
  `clientHeight == 可见高度`。回归用例钉在自检场景 F（需求侧的证据：宿主 `lyrics.css`
  是**未分层**注入，本包整份 CSS 在 `@layer skin` 里，层级优先于特异性 —— 所以 `.pl__lyrics
  .lyric { … }` 这类声明同样压不过宿主，颜色/字号只能通过声明在 `.lyrics__scroll` 上的
  `--lyric-*` / `--text-*` / `--accent` 变量生效，与「深渊」同款问题，见那份 README §「歌词」）。
