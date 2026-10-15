# 水果忍者 · ninja

> 第三方播放界面样式包（契约 v3，`apiVersion: "3.0"`，`order: 290`）。
> **不与播放器源码耦合**：只走 `ctx` 契约，零项目 import；水果、果肉、果汁、刀光、炸弹
> **全部是 canvas 现场画的**，包里一张图片素材都没有（只有卡片图标那一个 SVG）。

**极限轴**：程序化实体 + 斩击物理 —— 把"歌词的每个字"变成一枚被抛起来的水果。

**一句话**：当前这句歌词的每个字都是一枚水果；**唱到哪个字，一道刀光就把那枚水果劈成两半**，
果汁顺着深木案板渗开、把那个字从左到右染亮；连击与分数摆在右上角，
长间奏会抛出一枚引线在烧的炸弹，下一句开口时炸成一片金色烟花。

---

## 1. 包结构

```
ninja/
├── skin.json                  清单（能力 / 配色 / 帧预算 / 图标）
├── skin.js                    入口：mount / update / destroy + 帧循环 + DOM 与补丁
├── skin.css                   道场（墙 / 竹帘 / 案板）、歌词带、HUD、空态与海报
├── assets/icon.svg            样式卡片图标（遮罩友好：只画形状、用 currentColor）
├── lib/
│   ├── util.js                帧预算、降级状态机、确定性随机、频谱切片（纯函数）
│   ├── palette.js             封面 → 果盘配色；字色/凹痕色的对比度兜底（纯函数）
│   ├── timeline.js            逐字时间轴 → 投掷/切开时刻、连击、间奏炸弹（纯函数）
│   ├── fruit.js               8 个品种的程序化水果与剖面绘制（吃一个 2D context）
│   └── juice.js               果汁粒子池 + 两半刚体（SoA 定长，无 DOM）
├── README.md
└── tests/
    ├── ninja-logic.test.js       纯逻辑自检（node --test）
    └── ninja-check.mjs           浏览器自检（自带静态服务 + 假宿主 + 无头 Edge）
```

子模块用 ``import(`./lib/<file>${Q}`)`` 加载，`Q = new URL(import.meta.url).search` ——
宿主的样式包是同源路由 `/skins/<id>/<file>?t=<token>`，丢了查询串会 403，
而且报错挂在**入口**上（自检里有一条静态扫描盯着）。lib 之间**不许互相 import**：
那会二次加载并丢掉 token，依赖一律当参数注入。

## 2. 画面结构（DOM 层次）

```
ctx.root（舞台）                              ← 清单声明 background:true，舞台铺满整窗
└─ .nj                                      案板与道场（JS 写 --nj-* 配色变量）
   ├─ .nj::before / .nj::after              墙 + 竹帘 + 深木案板 + 暗角（纯静态渐变）
   ├─ canvas.nj__fx                          全部程序化实体：水果 / 两半 / 果汁 / 刀光 / 炸弹 / 烟花
   ├─ .nj__field                             安全区容器（top/bottom = 宿主两条 chrome 的内沿）
   │   └─ .nj__lyric                          当前句（DOM 文本，一字素一个 span）
   │        └─ span.nj__g × N                 带 --g：果汁沿 X 渗开的进度
   ├─ .nj__hud                               曲名 / 试听角标 / 提示 / 时间码（两排都让开安全区）
   ├─ .nj__chips                             封面圆牌 + 分数 + 连击（右上角，让开安全区）
   ├─ .nj__empty                             空态（自带图标当遮罩 + 宿主的状态文案）
   └─ .nj__poster                            海报形态（showLyrics:false ⇒ 只剩曲名与歌手）
整窗背景层 ctx.backgroundRoot
└─ .njbg                                     垫底的木纹与暖光（舞台铺满整窗时只是进退场那几帧）
```

**为什么歌词是 DOM 而不是画在 canvas 上**：字要一直读得清。未唱到的字是"果皮拓印在案板上的
凹痕"（对比度由 `palette.unlitOf` 兜到 4.2:1 以上），唱到的部分由一层沿 X 推进的果汁渐变
`background-clip: text` 染亮。canvas 在文字**下面**（z-index 1 < 2）——果汁从字背后落下去，
可读性永远优先。

## 3. 数据映射

| 输入 | 驱动 | 落在哪 |
| :--- | :--- | :--- |
| `lyrics.lines[].text` | 一字素一个 span、一枚水果（品种按文本 hash 分配，相邻两枚必不同） | `.nj__lyric` / 座位表 |
| `lyrics.lines[].words` | **唯一的高精度时间源**：`apexAt == slashAt == 该字起唱` | 投掷时刻表 |
| `words` 长度与字素数对不上 | 整行退回合成时间轴（按字素类别加权、单字封顶 420ms） | 投掷时刻表 |
| `progress.position`（4Hz、量化 250ms） | 播放钟（墙钟外推，上限 1200ms —— 补丁不来就冻住） | 全部 |
| 上一句末字 → 下一句开口的间隔 | 间隔 ≥ 3.2s ⇒ 抛一枚炸弹，引线烧到下一句开口时炸开 | `.nj__fx` + `data-bomb` |
| 切开事件 | 两半沿刀口法线分离（刚体 + 重力 + 自转）+ 两股果汁 + 一次刀光 | 两个池 |
| 切开事件（第二件事） | 案板上留一处**果汁印**（最多 44 处，26 秒淡出；换歌清空） | `.nj__fx` + `data-stains` |
| 切开的间隔 ≤ 1.5s | 连击 +1（分数 = 10 × min(连击, 9)） | `data-combo` / `data-score` |
| 指针划过 | 刀痕轨迹（150ms 淡出）；划过水果会**提前**把它劈开（字仍按歌曲时刻染色） | `.nj__fx` |
| `spectrum().bands[0..12]` | 低频：案板震屏 + 刀光加粗 + 连击读数脉冲 | `--nj-shake` / `--nj-pulse` |
| `spectrum().bands[96..128]` | 高频：切开时的细沫粒数 | 果汁池 |
| 频谱通量（自算，自适应阈值） | 刀痕的亮度（`--nj-flux`） | `--nj-flux` |
| `cover` | 每首歌采样一次 64×64：有效色相 → 整套果盘**只偏 22%** + 果汁色 | `--nj-juice*` |
| `cover`（合成之后的底） | `reportBackdrop({bg, fg, accent})`（400ms 防抖） | 宿主壳配色 |
| `env.width < 900` | 收边、藏提示、缩封面牌 | `data-narrow="1"` |

**为什么没有 `ctx.actions.seek`**：这个舞台上指针是**刀**（划过水果会把它提前劈开），
把点击同时绑成"跳进度"会让每次挥刀都可能误跳（rubbing 的先例也是去掉 seek）。要跳进度请用宿主的进度条。

## 4. 降级矩阵

| 条件 | 行为 |
| :--- | :--- |
| `performanceMode: "performance"` | 按清单 `budgetFps: 45` 限帧；果汁粒数 ×0.5；水果半径 ×0.94 |
| `animations:false` / `env.reducedMotion` | **一帧都不起**：一排水果静止停在案板上，字按歌曲位置直接给终态；补丁来了同步画一帧 |
| 暂停 | 6 秒后停帧（最后一帧留在屏上；果汁与两半在此期间继续落完） |
| `env.foreground:false`（详情页退出前台） | 立刻停帧（前景是现取 `env()`，不等宿主补丁） |
| `interactive:false` | 一个指针监听都不挂（刀痕、提前劈开都没有） |
| 无歌词 / 无歌 | 空态：一枚刀与果的图标 + 宿主的 `lyricsEmptyText` |
| `showLyrics:false` | 海报形态：只剩曲名与歌手 |
| 无封面 / 灰阶封面 | 整套果盘退回清单配色（`#1b1008` / `#f7ecd8` / `#e2543a`） |
| 画布一帧画得太慢 | 自适应降级 `data-lod` 0→3（果汁粒数 ×0.3，后两档半分辨率；连续两帧超预算才退，8 秒后不再退） |
| `dpr` 高 | `min(dpr, 2)`，再乘降级档系数 |

## 5. 想调什么改哪里

| 想改 | 改哪 |
| :--- | :--- |
| 水果抛得多快 | `lib/timeline.js` 的 `TOSS_MS`（顶点必须留在字素起唱点上，只改飞行时长） |
| 果汁把一个字染满用多久 | `timeline.FILL_MS`（默认 260ms） |
| 一刀喷多少果汁 | `skin.js` 的 `JUICE_PER_CUT` / `JUICE_MIST` |
| 炸弹从多长的间奏开始出现 | `timeline.BOMB_GAP_MS`（默认 3200ms） |
| 连击窗口 / 读数留白 | `timeline.COMBO_GAP_MS` / `COMBO_IDLE_MS` |
| 果汁印留多久 / 最多几处 | `skin.js` 的 `STAINT_LIFE_MS`（26s）/ `MAX_STAINS`（44） |
| 换句提前多久（水果的飞行必须看得见） | `skin.js` 的 `LINE_LEAD_MS`（760ms = 飞行 560 + 切开延迟 40 + 余量） |
| 多长的间隔算"跳转"（不许补喷果汁） | `skin.js` 的 `SEEK_JUMP_MS`（520ms） |
| 品种、果皮厚度、籽 | `lib/fruit.js` 的 `KINDS` 表（加一条就是加一个品种，绘制代码不用动） |
| 果盘跟封面走多近 | `skin.js` 的 `TINT_SHIFT`（0.22 = 只偏 22%；调大就会"西瓜变蓝"） |
| 字用的果汁色（比画布上的浅一档） | `skin.js#applyBowl` 里的 `--nj-juice-txt`（0.4 混合比） |
| 木头的颜色 / 竹帘 / 案板明暗 | `skin.css` 的 `:scope { --nj-wall-* / --nj-wood-* / --nj-bamboo }` —— ★ 改案板明暗要**同时**改 `lib/palette.js#BOARD_LIT`（字色的对比度是拿它算的） |

## 6. 安装与自检

```powershell
# 安装（拷进数据目录，然后在设置里点「重新扫描样式」）
Copy-Item plugins\style\ninja "$env:APPDATA\LocalMusicPlayer\player-skins\" -Recurse -Force

# 纯逻辑（零依赖，不需要浏览器）
node --test "plugins/style/ninja/tests/*.test.js"

# 浏览器（自带静态服务 + 假宿主 + 无头 Edge，不依赖播放器项目源码）
node plugins/style/ninja/tests/ninja-check.mjs
node plugins/style/ninja/tests/ninja-check.mjs --shots   # 另存 4 张整页 PNG 供肉眼复核
```

也可以在设置里点「添加播放界面样式 → 从仓库获取」直接装（清单由
`node plugins/build-index.mjs` 生成）。

## 7. 写这一款时踩到的坑（都写进了自检）

- **静默登记 vs 现场切**：拖进度条跳过来时，已经唱过的字必须只"标成已切"，
  不能补喷果汁 / 补加连击 —— 否则拖一次进度条就喷掉几百粒、分数直接飙到几十。
  判据是"这一帧的位置跳了多远"（`SEEK_JUMP_MS = 520`），不是"切开晚了几毫秒"：
  `progress` 补丁是 4Hz 且位置量化到 250ms，窗口开小了正常播放也会被误判成跳转
  （表现是"切开了却没果汁、也不加连击"，一声不吭）。
- **换句必须带提前量**（`LINE_LEAD_MS = 760`）：水果要飞 560ms 才到顶点，而一句的第一个字
  就在这句的 `time` 上起唱 —— 等 `pos >= line.time` 才换句，第一枚水果只剩 0ms 可飞
  （直接在顶点弹出来，"抛上来"这件事整个看不见）。
- **百分比 `padding` 是按宽度算的**：1280 宽的舞台里 `padding-bottom: 20%` 是 256px，
  直接把歌词顶到半空（真机上量到的 `lineY` 是 447 而不是 587）。抬高一行要用
  `flex-basis` 的百分比 —— 纵向容器里它才按高度算。
- **`--skin-inset-*` 在 `getComputedStyle` 里是原样 token 流**（`calc(36px + 52px)`），
  `parseFloat` 出来是 36。所以安全区一律由 CSS **结构化**让开，JS 只用
  `getBoundingClientRect` 量位置 —— 果汁与两半落地的"地板"（`st.floorY`）就是这么量的，
  写死 `h - 6` 会让它们全落在宿主底栏背后（用户根本看不见）。
- **`:scope` 不是 `::scope`**：`@scope` 里代表作用域根的是**伪类** `:scope`；
  写成 `::scope` 不是"不生效"，而是**整条规则被丢掉** —— 于是这一组默认变量全是空的，
  依赖它们的整条 `background` 简写一起失效（表现是"舞台只剩一层纯色，木纹/竹帘/案板全没了"，
  而 `getComputedStyle(…, "::before").backgroundImage` 会是 `none`）。
- **`--g` 要在建行时就写 0**：不写的话这个自定义属性在 DOM 上**不存在**，
  读它的人拿到的是空串（`parseFloat` → `NaN`），"还没唱"与"没这条数据"分不出来。
- **`performanceMode` 是字符串**（`"smooth" | "performance"`），`Boolean("smooth")` 恒真。
- **`ctx.spectrum()` 返回 `{bands, at}` 快照**，不是裸数组。
- **`ctx.root` 的 CSS 是 `@layer skin` 里的**，宿主骨架未分层 —— 所以这一包
  **不碰 `--lyric-size`**（只乘自己的 `--nj-scale`），否则用户拖字号就没反应了。
- **文字的对比度必须按"实际画出来的底"算**：字压在案板受光面上，不是压在 `colors.bg` 上
  （rubbing 就是拿未压暗的封面主色当选字依据，真机上只剩 1.08:1）。
  这一款还额外垫了一层歌词专用暗纱（`.nj__lyric::before`）：案板是有明暗的木头，
  字压在哪一档木纹上不该由运气决定；而回退用的淡灰字色仍然保证在案板上有 6:1 以上。
- **`ctx.actions.seek` 一次都没调**：指针在这个舞台上是刀（划过水果会提前劈开它），
  点击同时绑"跳进度"会让每次挥刀都可能误跳。
