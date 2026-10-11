# 活字 · letterpress

> 第三方播放界面样式包（契约 v3，`apiVersion: "3.0"`，`order: 240`）。
> **不与播放器源码耦合**：只走 `ctx` 契约，零项目 import。

**极限轴**：文字 / 排版本身 —— 整屏只有字，没有一个图形元素、没有一张图片、没有 canvas。

**一句话**：字是被"排"出来的 —— 字号 / 字重 / 字距 / 斜切由 128 段频谱映射成一条排版曲线，
换句就是一次**活字重排**：新句的字素从旧句的位置飞过来（FLIP，只动 `transform`）。

---

## 1. 包结构

```
letterpress/
├── skin.json                  清单（能力 / 配色 / 帧预算 / 图标）
├── skin.js                    入口：mount(ctx) / update(ctx, patch) / destroy(ctx)
├── skin.css                   版面与纸面（只有纸张纹理挂了一个 filter）
├── assets/icon.svg            样式卡片图标（遮罩友好）
├── lib/
│   ├── typeset.js             排版曲线 + 版面几何 + 逐字插值（纯逻辑，无 DOM）
│   └── ink.js                 专色取色 + 对比度（纯逻辑，无 DOM）
├── README.md
└── tests/
    ├── letterpress-logic.test.js   纯逻辑自检（node --test）
    └── letterpress-check.mjs       浏览器自检（自带静态服务 + 假宿主 + 无头 Edge）
```

子模块用 `import(\`./lib/<file>${Q}\`)` 加载，`Q = new URL(import.meta.url).search` ——
宿主的样式包是同源路由 `/skins/<id>/<file>?t=<token>`，丢了查询串会 404（自检里有一条静态扫描盯着）。

## 2. 画面结构（DOM 层次）

```
ctx.root（舞台）
└─ .lp                     纸面 + 排版（这一款**不申请**整窗背景层：capabilities.background = false）
   ├─ .lp__paper           纸面：基线网格 + 版口四角标记（全静态）
   ├─ .lp__sheet           版面区
   │   ├─ .lp__elide--top      "⋯ 前 N 行"（没排出来的部分，静态）
   │   ├─ .lp__col             一列文字（列位移 = 分页推进）
   │   │   └─ .lp__line × 81   行池：当前行前后各 40 行（屏幕上只看得见 7 行左右）
   │   │        └─ .lp__u × M   **只有当前行**切成逐字素 span
   │   ├─ .lp__elide--bottom
   │   └─ .lp__poster          海报形态（showLyrics:false）：整屏只剩曲名
   ├─ .lp__empty           空态（提示语也走同一套排版）
   └─ .lp__hud             曲名 / 「§ 12 / 48」/ 字号读数 / 时间码
```

行池固定 **81** 个槽位（`2×40+1`），与歌词行数无关；槽位号 `--slot` 建池时写一次，
**页面推进靠整列的 `translateY(--lp-shift)`**，不靠逐行改位置。

## 3. 数据映射

| 输入 | 驱动 | 落在哪 |
| :--- | :--- | :--- |
| `bands[0..12]`（低频） | 字重 `--lp-wt`（300→820，取整到 10）+ 字号 `--lp-sz`（基准 ×1.00→1.12）+ 墨色 `--lp-inkv` | 当前行与整版 |
| `bands[13..44]`（中频） | 字距 `--lp-sp`（−0.012em→0.20em）+ 基线上抬 `--lp-lift`（0→3.2px） | 当前行 |
| `bands[45..127]`（高频） | 斜切 `--lp-sk`（0→−7deg）+ 收字号（−5.5%） | 当前行 |
| `progress` 位置 | 当前行号（`lineIndexAt`）→ 换行 = 重排；行内逐字 `--g` | `.lp__u` |
| `lyrics.lines[].words` | 逐字素点亮量（0..1，按字级时间戳插值） | `.lp__u` 的 `--g` |
| `options.lyricsFontSize` | **基准字号** `--lp-base`（曲线只做乘在上面的相对量） | `.lp` |
| `options.showLyrics:false` | 切成"只剩曲名的排版海报"（`data-poster="1"`） | `.lp` |
| `options.performanceMode` | 曲线只留低频轴 + 按清单 30fps 限帧 + 关过渡 | `.lp[data-perf="1"]` |
| `options.animations:false` / `env.reducedMotion` | 中性版式，**一帧都不进帧循环**（补丁来了只画一帧） | `.lp[data-animations="0"]` |
| `env.width < 900` | 幅度收敛（`--lp-fit`）+ 行高 54→44px + 版面收边 | `.lp[data-narrow="1"]` |
| 封面 | **只取一个专色** `--lp-spot`（跳过纸白/墨黑，按饱和度×中间明度打分） | 当前行强调 + 铅块 |
| 点击某一行 | `ctx.actions.seek(那一句的 time)` | — |
| `ctx.actions.reportBackdrop` | 纸白/墨黑固定，专色随封面变；400ms 防抖 | 宿主壳配色 |

### 为什么"封面只给一个专色"

活字印刷的规矩是**纸白、墨黑，只有一个专色**（spot color）。所以这一款不跟封面走整体配色
（那会变成"封面染色的排版"，和暗房/拓印重复），而是从封面里挑出最像专色的那个颜色，
只用在当前行与铅块上。挑色不是求平均色，而是**跳过接近纸白与接近墨黑的像素**，
在剩下的里按"饱和度 × 中间明度"打分，取分数最高那个 4bit 色桶的均色（`lib/ink.js#pickSpot`）。

## 4. 状态机

`empty`（无歌词 / 关歌词）→ `composing`（换行，重排 280..560ms，铅块显形）→ `set`（版式确定，只有排版轴在呼吸）→ `paused`（暂停 6 秒停帧，保留最后状态）。

对外只暴露四个可观测属性（`data-empty` / `data-set` / `data-playing` / `data-idle`），
不引入"自己再维护一份真源"的显式状态机。

## 5. 降级矩阵

| 条件 | 行为 |
| :--- | :--- |
| `performance` 档 | 只有低频轴在动（字重/字号）；字距与斜切锁 0；按清单 30fps 限帧；关列/行过渡 |
| `animations:false` 或 `reducedMotion` | 中性版式，不进帧循环（补丁来了一帧一画），关掉铅块与过渡 |
| 无字级歌词 / 字数对不齐 | 整行一起亮（宁可不逐字，也不能错位点亮） |
| 无封面 / 取不到色 | 专色退成清单 `colors.accent` |
| 窄窗口（< 900px） | 幅度收敛 `--lp-fit` + 行高压缩 + 版面收边 |
| `showLyrics:false` | 海报形态：只剩曲名与歌手的大字排版 |
| `interactive:false` | 行不可点、无悬停反馈 |
| 宿主不给频谱 | 曲线退到中性版式（画面不会停在"半截排版"） |

## 6. 自检

```powershell
node --test "plugins/style/letterpress/tests/*.test.js"     # 纯逻辑
node plugins/style/letterpress/tests/letterpress-check.mjs   # 浏览器（自带静态服务 + 无头 Edge）
```

- **纯逻辑**：排版曲线（值域 / 单调性 / performance 档只留低频 / 幅度收敛）、版面视窗与列位移
  （视窗滑动必须不动画面）、深度样式、字素相位、逐字时间戳插值（含最后一个字的兜底时长）、
  FLIP 增量、行定位、时间码、专色取色与对比度。
- **浏览器**：真实 `@layer`+`@scope` 下曲线是否真的写进 CSS、逐字素 span 是否**只在当前行**、
  换行是否真的播了 FLIP（WAAPI 数量与 transform-only）、点击某行是否 seek 到那一句、
  暂停 6 秒停帧、切后台停帧、`close` 清画面、`animations:false` 零帧但版面完整、
  performance 档按清单 30fps 限帧、窄窗口收敛、destroy 零残留。
- **真机**：`.tmp-skin-live.mjs --skin letterpress`（真 CSP 下 `/skins/` token 路由 import、
  真频谱喂动字重/字号、真歌词写出 `--g`、换样式零残留、窄窗不溢出、切主题不炸）。

**验收结果（2026-10-11）**：纯逻辑 **41/41**、浏览器 **115/115**（连跑两次全绿）、真机探针 **28/28**；
`node plugins/build-index.mjs --check` → `plugins/style/index.json` 已是最新（5 个条目 / 42 个文件）。
签收台账见 `plugins/style/pending-designs.md` §4 与 §5.04。

真机探针的实测读数（宽带 FLAC、音量 0.04）：`--lp-wt 490` / `--lp-sz 1.032` / `--lp-sp 0.036em` /
`--lp-sk -1.437deg` / `--lp-lift 0.722px`；逐字 `--g` 在新句开门时是 `0.02/0/0/0/0`（唱到哪亮到哪）；
`reportBackdrop` 的 bg/fg 是清单里的纸白与墨黑（对比度 15.77），accent 随封面换（`#8f3b52` → `#2f6f4f`）。

## 7. 实现偏差与限制

- **不用可变字体**：CJK 可变字体子集化后仍有数 MB，且首帧必然跳字。用四个真实存在的 CSS 属性
  （`font-weight` / `font-size` / `letter-spacing` / `skewX`）模拟排版轴。若将来做
  "自带子集化 woff2 + `font-variation-settings`" 的 V2，才需要动 `FontFace`。
- **逐字素属性写在行上，不是写在每个字上**：设计稿是"每个字素每帧写 4 条轴属性"
  （≈ 一行 30 字 = 120 次 `setProperty`/帧）。实际是：轴值写在行根上 **6 个**自定义属性
  （写前比对旧值，静止帧零写入），字素只带 `--lp-a`（相位，换行时写一次）与 `--g`（点亮量，变了才写）。
  视觉上是同一件事，代价差一个数量级。
- **重排时长按字数**（280..560ms）而不是设计稿的固定 400ms：字越多，活字要走的路越长。
- **版面是"一列 + 行池 81"**：设计稿写的是"当前行前后 ±12 行"，实际用 ±40 —— 因为列位移
  只由 `(当前行 − 视窗首行)` 决定，视窗滑动本身不动画面，所以"槽位换字"这件事被推到
  离当前行 40 行的地方（屏幕上一共只看得见 7 行），永远不会被看见。
- **`lyrics().index` 只做交叉校验**：当前行由 4Hz 的 `progress` 位置经 `lineIndexAt` 推出
  （`lyrics().index` 只在换句时更新，不能用来做连续量）。
- **只有一个 `filter`**：挂在纸张纹理 `.lp__rules` 上；整屏正文一个滤镜都不挂（"清晰度"这条轴）。
- **行元素是纯文本 + 当前行才切字素 span**：给全文都切 span 在长歌里是几万个节点。
