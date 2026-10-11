# 待设计 · 第三方播放界面样式清单（设计与交付台账）

> **这些是第三方样式包，不是内置样式。**
>
> | | 第三方（本文件描述的对象） | 内置 |
> | :--- | :--- | :--- |
> | 源码位置 | `plugins/style/<id>/`（就在这里） | `internal/skins/resources/player-skins/<id>/` |
> | 分发方式 | 用户自己拷进数据目录（或从仓库 index.json 拉） | `//go:embed` 随二进制 |
> | 安装到 | `%APPDATA%\LocalMusicPlayer\player-skins\<id>\` | 只读资源目录 |
> | 清单 `order` | **≥ 200** | 10~90 |
> | 删改 | 用户可删可改 | 卸载被拒绝 |
>
> 契约的唯一定义：`frontend/packages/player-skins/src/contract.js`（`SKIN_API_VERSION = "3.0"`）。
> 设计背景与契约取舍：`docs/42-播放器样式插件系统设计方案.md`。
>
> 本文件是**设计规格 + 交付台账**：实现一款、签收一款，勾下面 §4 的表。

---

## 0. 签收规则（每款样式都要走完）

一款样式只有**同时**满足下列条件才算签收，缺一条就留在「进行中」：

| # | 条件 | 怎么验 |
| :--- | :--- | :--- |
| S1 | 包结构齐全：`skin.json` / `skin.js` / `skin.css` / `assets/icon.svg` / `lib/` / `tests/` / `README.md` | 看目录 |
| S2 | 纯逻辑自检全绿 | `node --test "plugins/style/<id>/tests/*.test.js"` |
| S3 | 浏览器自检全绿（自带静态服务 + 假宿主，**不依赖播放器项目源码**） | `node plugins/style/<id>/tests/<id>-check.mjs` |
| S4 | 契约纪律零违规：无裸包名 `import`、无 `fetch`/`XMLHttpRequest`、无 `eval`、无 `setInterval`、不碰 `window`/`documentElement`；CSS 无 `:root`/`html`/`body`/`*`/`!important`/作用域前缀 | 自检脚本静态扫描 + 人工复核 |
| S5 | 清单 `colors` 三项（bg/fg/accent）齐全且合法；随封面取色的样式用 `ctx.actions.reportBackdrop()` 低频上报（≥300ms 防抖） | 清单 + 自检断言 |
| S6 | 一条 `requestAnimationFrame`；暂停后自动停帧；`visibility:false` 停帧；`reducedMotion` / `animations:false` 静止；`performanceMode:performance` 按 `budgetFps` 降级 | 自检断言 + 读代码 |
| S7 | `destroy()` 清干净：rAF、`ResizeObserver`、指针监听、离屏 canvas、位图缓存、（有 WebGL 则）GL 上下文 | 自检：destroy 后 stage 与 backgroundRoot 无残留节点 |
| S8 | 真机（`bin/lmplayer.exe`）里：挂载成功、控制台无报错、换歌/进度/暂停/切主题/窄窗口/切走再切回都不崩 | `$env:LMPLAYER_DEBUG_PORT = "9333"` + `tools/` 里的探针，或人工确认 |
| S9 | 重新生成 `plugins/style/index.json` | `node plugins/build-index.mjs` |
| S10 | 台账里勾选并写一行签收记录（日期 + 证据命令 + 实测结果） | 本文件 §4 |

> **不要在项目门禁里加用例**（`tools/check-*.mjs`、`frontend/tests/`）。样式包的自检**跟着包走**，
> 这是 `plugins/README.md` 与根 `AGENTS.md` 已经定下的硬约定。临时探针命名 `.tmp-*.mjs`。

---

## 1. 能力天花板（设计前提，动工前先认这些）

### 1.1 数据面

| 接口 | 实情 | 设计含义 |
| :--- | :--- | :--- |
| `ctx.spectrum()` | 固定 **128 段对数全谱**（0..1）、**~30Hz** 节流、**拉取式**（读到才采样）、没播放返回 `null`；清单未声明 `capabilities.spectrum` 时恒 `null` 并 warn 一次 | **没有波形、没有左右声道、没有节拍 API**；拍点只能自己用 flux + 自适应阈值检测；"打击瞬间"最多晚 ~33ms |
| `progress` 补丁 | 宿主 ~**4Hz** 推一次，`position` **按 250ms 量化** | 任何连续动画必须用**墙钟**自己插值；直接吃补丁就是 4Hz 阶梯 |
| `lyrics.lines[].words` | **每个字素一个起始毫秒**，与 `sdk.splitGraphemes(text)` 下标严格对齐 | 唯一的高精度时间源 → 逐字动画的节拍器 |
| `lyrics.lines[].trans` | 同一时间戳的其它语言（已折叠成一行） | 双语同排、共用一次高亮 |
| `track` | 只有 `id` / `title` / `artist` / `album` / `duration` / `kind` | 没有文件路径、码率、声道、流派；画面不能依赖这些 |
| `cover` / `covers` | **data URL**（或 `/online/cover` 同源代理） | 可以 `drawImage` 进 canvas 再 `getImageData`，**不会被 taint** —— 封面像素可以被真的读出来 |
| `env` | `themeId` / `mode` / `width` / `height` / `dpr` / `reducedMotion` / `foreground` | 清晰度感知、明暗联动、面积自适应 |
| `options` | `animations` / `showLyrics` / `lyricsFontSize` / `coverCarousel` / `interactive` / `performanceMode` / `budgetFps` | **双向尊重**：宿主的设置必须生效，不能自己另开一套 |
| `actions` | `seek` / `seekBy` / `seekRatio` / `togglePlay` / `next` / `prev` / `like` / `unlike` / `toggleLike` / `openFolder` / `openCoverPanel` / `openLyricsPanel` / `reportBackdrop` | 不可交互舞台上**全是空实现** |
| `capabilities` | `spectrum` / `background` / `interactive` | `background:true` 才有整窗舞台 + `--skin-inset-top/bottom` |

### 1.2 三条硬边界

1. **CSP `default-src 'self'`**：无网络、无 `eval`。但 **Canvas2D / WebGL2 / SVG 滤镜 / 自带字体（`font-src` 回落 `self`）/ 同源 Worker 脚本**都合法。
2. **CSS 被宿主强制包进 `@layer skin { @scope(舞台根) }`**：`:root` / `body` / `*` / `!important` 全部无效；**宿主壳（标题栏/底栏/侧栏/浮层）改不动**，舞台里也没有全局后期。
3. **影响宿主观感的唯一合法通道**：清单 `colors` + `ctx.actions.reportBackdrop()`（宿主做对比度兜底，见 `colors.js`）。

### 1.3 三个「文档说了但实现没有」的坑（别依赖）

| 坑 | 事实 |
| :--- | :--- |
| `capabilities.paintSelf` | 契约解析了它，但**宿主全仓没有消费者** —— 写 `false` 不会让宿主画兜底 |
| `ctx.assets` / `ctx.log` | `docs/42` §6.1 写了，**契约与 `skinhost.js#makeCtx` 都没有** |
| 素材取址 | 只能自己用 `import.meta.url` 拼，并**透传 `?t=` token**（`/skins/` 逐文件鉴权，而 ESM 解析相对说明符会丢 query，见 `magic-circle/skin.js` 文件头）；CSS 里写相对 `url()` 会相对**文档**解析，基本是 404 —— 素材一律由 JS 取址后写进自定义属性 / 内联样式 |

### 1.4 性能侧已知教训

- `docs/36` 实测：**全屏大半径 `blur` 是每帧最贵的操作之一**；全窗 `filter` 会拉长每帧耗时。
- `magic-circle` 实测把 27.6 FPS 修到 60 FPS，结论是**瓶颈在原生绘制**（放大贴图、整屏渐变），JS 只占个位数。
  → 所以：整屏级绘制**先量再决定**；能用 CSS 覆盖层就不要每帧往 canvas 上画。

---

## 2. 六个待验证假设（相关款动工前必须先探）

探针一律 `.tmp-*.mjs` + 无头 Edge（或真机 `LMPLAYER_DEBUG_PORT`），**不留在 `tools/` 之外、不提交**。

| # | 假设 | 影响哪款 | 怎么验 | 不成立的退路 |
| :--- | :--- | :--- | :--- | :--- |
| P1 | WebView2 里 `canvas.getContext("webgl2")` 拿得到且走 GPU（而非 SwiftShader 软渲） | 深渊 | 真机里读 `UNMASKED_RENDERER_WEBGL` + 实测帧率 | 退化成 Canvas2D 伪流体（双层位移贴图） |
| P2 | 舞台内元素的 `backdrop-filter` 能采到宿主的 `.skin-bg` / 整窗背景 | 暗房、深渊 | 真机里放一个探针元素，看有没有采样到画面 | 退化成「同源图叠层 + `mix-blend-mode`」 |
| P3 | `/skins/<id>/assets/*` 能被 `FontFace` 与 CSS `url()` 加载（token 的 cookie 放行是否覆盖子资源） | 活字、拓印（贴图） | 真机里 `new FontFace(...).load()` 试一次 | 由 JS 用 `import.meta.url + ?t=` 取址再 `FontFace` |
| P4 | `preserve-3d` 子树里文字保持清晰、半透明层排序可控（`filter` 会强制扁平化） | 塔 | 真机里看几何撕裂与文字锐度 | 退化成 2.5D（只有 translate/scale，不做 rotateY） |
| P5 | 封面 `data:` URL 解码后 `drawImage` + `getImageData` 不被 taint（尺寸/损耗可接受） | 拓印、暗房、深渊 | 真机里对一张真实封面跑一次采样 | 退化成「只取主色」（不做像素级材质） |
| P6 | 暂停后停帧、`visibility:false` 停帧、恢复后不跳帧（宿主补丁能把循环拉起来） | 全部 | 真机里切后台/暂停观察 CPU 与恢复表现 | 无（这是硬约束 S6） |

> P5 理论上必然成立（data URL 与同源都不污染画布），但**封面尺寸与 base64 解码开销**要实测：
> 一张 3000×3000 的 data URL 封面，每次都重新解码会掉帧 → 必须**每首歌只采样一次并缓存**。

---

## 3. 共同工程约束（六款都要满足）

### 3.1 包结构

```
plugins/style/<id>/
├── skin.json          清单：id / name / version / apiVersion / entry / styles / icon / order / capabilities / colors / performance
├── skin.js            入口：export default { id, mount, update, destroy }（零裸包名 import）
├── skin.css           样式（宿主包 @layer skin + @scope；选择器相对舞台根写，舞台自身用 ::scope）
├── assets/icon.svg    自带图标（单色线稿，宿主用 mask + currentColor 上色）
├── lib/*.js           私有子模块（**必须** `await import()` 并透传 `?t=` token）
├── tests/             这份样式包自己的自检
└── README.md          设计说明 + 参数调法 + 安装与自检命令
```

### 3.2 帧循环纪律

- **只有一条 `requestAnimationFrame`**；`setInterval` 一律不许用于动画。
- 暂停（`playing:false`）后 **6 秒停帧**（照 `docs/37` 的约定）；`visibility` 补丁 `foreground:false` 立刻停帧；宿主任何一次推送都能把循环拉起来。
- `performanceMode === "performance"` → 按清单 `budgetFps` 限帧；`"smooth"` → 不限帧（交 `rAF`）。
- `options.animations === false` 或 `env.reducedMotion` → **静止形态**（画面仍然完整可读，只是不动）。

### 3.3 一致性纪律

- 逐行/逐字必须与 `lyrics().index`、`words` 下标**严格对齐**；多语言行（`words.length !== 字素数`）**回退成逐行**。
- 空态（无歌 / 无歌词 / 歌词加载中 / 在线试听）都要有明确画面，不能白屏。
- `interactive:false`（桌面背景歌词窗口）：去掉所有可点/可聚焦/悬停反馈，动作调用全部包在 `if (ctx.options().interactive)` 里。
- 颜色不写死在自己画面之外；自己的画面配色用 CSS 自定义属性集中声明在 `skin.css` 顶部，运行期由 JS 改属性。

### 3.4 交付纪律

- 每款完成后跑 `node plugins/build-index.mjs` 重新生成 `plugins/style/index.json`（客户端「从仓库获取」读它）。
- 本文件 §4 台账里签收：勾选 + 写一行「日期 / 证据 / 实测」。

---

## 4. 交付台账

状态：`待实现` → `进行中` → `已签收`。**实现顺序按此表自上而下。**

| 序 | 样式 | id | 目录 | 清单 order | 极限轴 | 依赖 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 01 | 暗房 | `darkroom` | `plugins/style/darkroom/` | 210 | 后期 / 光 | 纯 CSS+DOM（无 canvas 绘制） | 待实现 |
| 02 | 拓印 | `rubbing` | `plugins/style/rubbing/` | 220 | 图像数据化 + 粒子物理 | Canvas2D + 封面采样（P5） | 待实现 |
| 03 | 塔 | `spire` | `plugins/style/spire/` | 230 | 空间 / 清晰度 | CSS 3D（P4） | 待实现 |
| 04 | 活字 | `letterpress` | `plugins/style/letterpress/` | 240 | 文字 / 排版 | 逐字素 + 伪可变轴（P3 可选） | 待实现 |
| 05 | 心跳 | `pulse` | `plugins/style/pulse/` | 250 | 同步 / 预测 | 自写 onset + PLL | 待实现 |
| 06 | 深渊 | `abyss` | `plugins/style/abyss/` | 270 | 像素 / 着色器 | WebGL2（P1） | 待实现 |

### 签收记录

> 每款签收时在这里追加一行。格式：`- YYYY-MM-DD <id>：证据命令 → 结果`。

（尚无）

---

## 5. 各款设计规格

---

## 01 · 暗房 `darkroom`

**极限轴**：后期 / 光 —— 不用 WebGL，把「封面 + 歌词」冲洗成一张胶片。

**一句话**：整块舞台是一张正在显影的胶片：色差、halation（高光溢出）、颗粒、扫描线、快门开合，全部由 CSS 叠层与混合模式完成。

### 清单

```json
{
  "id": "darkroom", "order": 210,
  "capabilities": { "spectrum": true, "background": true, "interactive": true },
  "colors": { "bg": "#12100e", "fg": "#f0e6d8", "accent": "#c8a165" },
  "performance": { "budgetFps": 30 }
}
```

### 画面结构（DOM 层次）

```
ctx.backgroundRoot（整窗背景层，宿主提供）
  └─ createBackgroundLayer：封面虚化（blur 40 / brightness .7 / scale 1.2）+ 暖色调 veil
ctx.root（舞台）
  ├─ .dr__bloom     封面第二份，重度模糊 + mix-blend-mode:screen，随低频呼吸（光晕溢出）
  ├─ .dr__frame     画面「片框」：内阴影 + 边角磨损（纯 CSS 渐变）
  ├─ .dr__stage     歌词区（createFxLyrics）—— 暖金渐变文字 + halation 多层 text-shadow
  ├─ .dr__chroma    色差层：同一份文字的伪元素副本（红/蓝偏移），只挂当前行
  ├─ .dr__scan      扫描线（repeating-linear-gradient）
  ├─ .dr__grain     颗粒（多层 repeating-radial-gradient + steps 位移动画）
  ├─ .dr__gate      快门（上下两片黑幕，换歌开合）
  ├─ .dr__vig       暗角（径向渐变，一次性静态）
  └─ .dr__hud       曲名（marqueeText）+ 时间码 mm:ss / 总时长 + 「片号」
```

### 数据映射

| 输入 | 驱动 |
| :--- | :--- |
| `bands[0..10]` 低频均值 | `.dr__bloom` 的 `opacity` / `scale`（光晕呼吸）—— 只写一个自定义属性，不重绘 |
| `bands[64..128]` 高频均值 | 颗粒层的 `opacity`（高频亮 → 颗粒重） |
| `flux`（自写） | 快门：「啪」一下轻微开合 + 一次 halation 脉冲 |
| `cover` | 背景层图 + 第二份 bloom 图；同时 `getImageData` 取平均色与主色（**每首歌只采一次**） |
| `cover` 主色 | `ctx.actions.reportBackdrop({ bg, fg })`（≥300ms 防抖）→ 宿主底栏跟着画面变暖 |
| `words` | 逐字亮起（`createFxLyrics` 的平滑填充 `--w`）；**影片质感的关键是文字比声音略慢**（延迟 80ms，可调） |
| `progress` | 时间码读数（墙钟外推，不能用补丁原值，否则 4Hz 跳字） |
| `options().animations` / `reducedMotion` | 关动效 → 颗粒静止、快门不弹、bloom 不呼吸（画面仍然是一张"照片"） |

### 状态机

`empty`（无歌）→ `loading`（封面/歌词未到，显示「显影中…」）→ `playing` → `paused`（bloom 停、颗粒继续慢爬）→ `song-change`（快门闭合 → 换图 → 打开）。

### 降级矩阵

| 条件 | 行为 |
| :--- | :--- |
| `performanceMode: performance` | 24fps；颗粒层动画停下（改成静态图）；bloom 只改 `opacity` |
| `animations:false` / `reducedMotion` | 全静止；保留 complete 的画面 |
| `interactive:false` | 歌词不可点；HUD 去掉悬停反馈 |
| 无封面（`cover` 为空） | 背景层用 `ctx.defaultCover`；色差层改挂曲名 |
| 无歌词 | 中央显示 `html.lyricsEmptyText()`，bloom 用「无字」形态（更轻） |
| 在线试听（`kind: "online"`） | HUD 加一枚「试听」角标；封面不可用时走 defaultCover |

### 自检

- **纯逻辑**（`node --test`）：封面采样 → 平均色/主色的纯函数（含纯黑/纯白/单色图的边界）、色温映射（`bass → 快门开合量`）、时间码格式化、延迟补偿的插值函数。
- **浏览器**（自带静态服务 + 假宿主）：挂载后 stage 非空、无 console 错误；`reportBackdrop` 被调用且值合法；`destroy` 后 stage/backgroundRoot 无残留；关动效后**不再有 rAF 帧**（打点计数为 0）。

### 签收清单（01）

- [ ] S1 包结构齐全
- [ ] S2 纯逻辑自检全绿
- [ ] S3 浏览器自检全绿（含 destroy 无残留、关动效零帧）
- [ ] S4 契约纪律零违规
- [ ] S5 `colors` 三项齐全 + `reportBackdrop` 防抖上报已验证
- [ ] S6 一条 rAF / 暂停停帧 / 前台切换停帧 / performance 档 24fps
- [ ] S7 `destroy` 清干净
- [ ] S8 真机挂载 + 换歌/暂停/切主题/窄窗口不崩
- [ ] S9 `node plugins/build-index.mjs` 已重跑
- [ ] S10 本文件 §4 已签收

### 风险

- 舞台内 `backdrop-filter` 能否采到整窗背景（**P2**）；不成立就用纯叠图方案，设计不受影响。
- 全屏 `blur` 每帧很贵（`docs/36`）→ 背景层模糊是**一次性**的（图不变就不重算），bloom 只动 `opacity`/`scale`。

---

## 02 · 拓印 `rubbing`

**极限轴**：图像数据化 + 粒子物理 —— 歌词是用**这张封面的像素**堆出来的。

**一句话**：每个字都由封面的彩色颗粒（沙 / 铁屑）磁吸聚成；切句时散开，再用新封面主色重新聚拢成下一句。

### 清单

```json
{
  "id": "rubbing", "order": 220,
  "capabilities": { "spectrum": true, "background": true, "interactive": true },
  "colors": { "bg": "#0d0c0b", "fg": "#e8e2d6", "accent": "#b9a37e" },
  "performance": { "budgetFps": 45 }
}
```

### 画面结构

```
ctx.root
├─ canvas.rb__canvas    主画布（粒子全部画在这里，dpr 感知）
├─ .rb__dust            未唱到的字：极淡的灰尘/轮廓（CSS 或低 alpha 粒子）
├─ .rb__hud             曲名 + 进度刻度（DOM）
└─ .rb__empty           空态文案
```

**离屏**（不挂 DOM）：封面 96×96 采样画布、当前行字形位图（用于目标点采样）。

### 数据映射

| 输入 | 驱动 |
| :--- | :--- |
| `cover` | ① 粒子色板（按目标点位置从封面采样取色）② 切换封面（轮播）= 整幅画换色 |
| 当前行文本 | 离屏渲染 → 按像素 alpha 采样出**目标点集**（数量 = 粒子数，按笔画密度加权） |
| `words` | **逐字聚拢**：唱到第 k 个字素才启用它的目标点；未唱到的点不吸引 |
| `bands[0..8]` | 湍流强度（低频涌 → 沙被吹起来） |
| `flux` | 一次「撒沙」（散开→再聚） |
| `progress` + 墙钟 | 物理步进 `dt`（**必须墙钟**，不能按补丁间隔，否则 4Hz 一顿一顿） |
| `playing:false` | **重力接管**：粒子缓慢下落堆积（不是冻结） |

### 状态机

`empty` → `assembling`（字形目标点已算出，粒子飞向目标）→ `singing`（逐字点亮/聚拢）→ `scatter`（散开）→ `settled`（暂停落地堆积）→ 下一句 `assembling`。

### 降级矩阵

| 条件 | 行为 |
| :--- | :--- |
| `performance` 档 | 粒子数 ÷3、半分辨率、30fps |
| `animations:false` | 粒子**瞬移**到目标（一次画完就停帧，不进物理循环） |
| 无封面 | 色板退化成 `colors.fg` → 单色沙 |
| 无字级歌词 | 逐行聚拢（整行一起亮） |
| 窗口很大 / dpr 高 | 粒子数按 `面积 × dpr` 自适应并 **clamp（3000~14000）** |
| `interactive:false` | 没有指针磁铁 |

### 自检

- **纯逻辑**：字形目标点采样（笔画密度加权、去重、数量归一）、封面色板 LUT（按亮度排序 + 主色提取）、`dt` 钳制、粒子池索引换算（**不 new 对象**）。
- **画布像素**：跑 N 帧后画布上非背景像素 ≥ 阈值；暂停后粒子**继续下落**（前后两帧的质心 y 增大）；`destroy` 后画布节点消失。

### 风险

- 填充率：4K + dpr2 的整屏填充会顶到上限（`magic-circle` 的教训）。→ 粒子数**按面积自适应**，必要时整幅画按 `scale` 画在半分辨率画布上再放大。

---

## 03 · 塔 `spire`

**极限轴**：空间 + 清晰度 —— 全程 CSS 3D，正文永远是矢量清晰的。

**一句话**：歌词是一层层悬浮玻璃板，沿 Z 轴螺旋排成一座无限塔；唱到哪一层，镜头就停在哪一层。

### 清单

```json
{
  "id": "spire", "order": 230,
  "capabilities": { "spectrum": true, "background": true, "interactive": true },
  "colors": { "bg": "#070a12", "fg": "#e9eefb", "accent": "#6f9dff" },
  "performance": { "budgetFps": 45 }
}
```

### 画面结构（`perspective` + `preserve-3d`）

```
.sp__world（perspective: 900px）
├─ .sp__fog        远景雾（CSS 渐变 + mask-image）
├─ .sp__slices     封面视差切片（3~4 片，各自 translateZ / 不同 --depth）
├─ .sp__tower      preserve-3d 的塔体
│   └─ .sp__card × N（窗口化：只保留当前句前后 ±12 层）
│        ├─ .sp__line     歌词行（DOM 文本，矢量）
│        └─ .sp__plate    玻璃板（边框 + 内阴影；不用 filter）
└─ .sp__hud        曲名 + 层号「第 n / N 层」
```

### 数据映射

| 输入 | 驱动 |
| :--- | :--- |
| `lyrics().index` | 当前层号 → 塔体 `rotateY` 与 `translate3d` 的目标值 |
| 行距（两行时间差） | 层间距 `--step`（长留白 → 层更高，产生"抬头看"的段落感） |
| `bands[0..8]` | 塔体的呼吸式下沉/上浮（幅度很小，只为了让空间"活着"） |
| 相机值 | 每帧由 JS 写各层的 `--cam-x / --cam-y / --cam-z / --cam-rot`（**自己实现分层相机**：`sdk.createCamera` 只能驱动一个容器） |
| 点击某层 | `ctx.actions.seek(该行 time)`（DOM 命中天然精确） |
| `progress` | 当前层内的逐字点亮（`createLyricsView` 的 `--w`） |

### 状态机

`empty` → `rising`（换层：镜头沿塔体飞行 0.6~1.4s，时长由行间隔反算）→ `holding`（停在该层）→ `paused`（悬停，不飞）。

### 降级矩阵

| 条件 | 行为 |
| :--- | :--- |
| `performance` 档 | 层数 ±12 → ±6；关雾；镜头改为直接跳（无飞行） |
| `animations:false` | 不做 3D 变换，退化成「一列垂直居中列表」 |
| P4 不成立（3D 撕裂/糊） | 退化成 **2.5D**：只保留 `translate3d` 与 `scale`，不做 `rotateY` |
| 窄窗口（< 900px） | 透视收敛（`--sp-zoom` 变小），层间距压缩 |
| `interactive:false` | 层不可点 |

### 自检

- **纯逻辑**：塔体几何（层号 → `x/y/z/rotateY`）、行间隔 → 层间距映射、飞行时长反算、窗口化的可见区间计算（当前句 ±N）。
- **DOM**：点第 k 层 → `actions.seek` 收到该行的 `time`（假宿主断言）；`destroy` 后 `.sp__world` 消失且 `preserve-3d` 节点清空。

### 风险

- `preserve-3d` 子树里出现 `filter` / `backdrop-filter` 会被**强制扁平化**，整套透视崩掉 → 塔体内部禁用 filter，玻璃感用边框 + `linear-gradient` 内阴影做。
- 半透明层的 z 排序在 Chromium 里会撕裂 → 层用**不透明底 + 半透明描边**，绝不叠两层半透明大面。

---

## 04 · 活字 `letterpress`

**极限轴**：文字 / 排版本身 —— 整屏只有字，没有图形。

**一句话**：字是被"排"出来的：字号 / 字重 / 字距 / 斜切由 128 段频谱映射成一条排版曲线；换句 = 活字重排。

### 清单

```json
{
  "id": "letterpress", "order": 240,
  "capabilities": { "spectrum": true, "background": false, "interactive": true },
  "colors": { "bg": "#f2efe7", "fg": "#171610", "accent": "#a8452c" },
  "performance": { "budgetFps": 30 }
}
```

> ⚠ **关于"可变字体"**：清单里**不打包字体文件**（CJK 可变字体子集化后仍有数 MB，且首帧必跳字）。
> 第一版用**四个真实存在的 CSS 属性**模拟排版轴：`font-weight` + `letter-spacing` + `font-size` + `transform: skewX/scale`。
> 若 P3 成立且体积可接受，再做「自带子集化 woff2 + `font-variation-settings`」的 V2（那时才需要动 `FontFace`）。

### 画面结构

```
ctx.root（浅色纸面）
├─ .lp__grid      基线网格（极淡的 CSS 横线，随字号缩放）
├─ .lp__lines     歌词区（createFxLyrics 的字素单元 + 自己的排版层）
│    └─ .fxl__u × N  每个字素：--lp-w / --lp-s / --lp-sp / --lp-sk 由 JS 每帧写
├─ .lp__blocks    活动铅块：当前行的每个字后面有一个"铅块"（伪元素，重排时短暂显形）
└─ .lp__hud       曲名 / 行号「§ 12 / 48」/ 字号读数
```

### 数据映射

| 输入 | 驱动 |
| :--- | :--- |
| `bands` 分段（低/中/高） | 排版曲线：低频抬字重、中频拉字距、高频给斜切与抬升 |
| `words` | 逐字素入场（**只有当前行**写字素级属性，行数 N 小、成本可控） |
| `lyricsFontSize`（宿主设置） | **基准字号**，排版曲线是乘在它上面的相对量（不能覆盖宿主设置） |
| `showLyrics:false` | 画面切成「只有曲名与字号的排版海报」形态 |
| 换行 | FLIP 重排：新行字素从旧行位置飞入（WAAPI，只动 `transform`） |

### 状态机

`empty` → `composing`（重排，400ms）→ `set`（排版确定，只有排版轴在呼吸）→ `paused`（呼吸停下，保留最后状态）。

### 降级矩阵

| 条件 | 行为 |
| :--- | :--- |
| `performance` 档 | 20fps；只有低频轴在动（字重/字号），字距与斜切不动 |
| `animations:false` | 固定排版：一次算出静态版式后停帧 |
| 字号很小（窄窗口） | 曲线幅度按 `fitScale` 收敛，避免字挤在一起 |
| `interactive:false` | 行不可点，去掉 HUD 的悬停反馈 |

### 自检

- **纯逻辑**：排版曲线（`bands → {weight, size, spacing, skew}`）的值域与单调性、FLIP 的起止计算、字素单元与 `words` 下标对齐（含多语言行回退逐行）、`lyricsFontSize` 的乘法关系。
- **DOM**：活动行上确实写了字素级自定义属性，且**行数是 O(当前行)**（不能给全文都写）；关动效后属性不再变化。

### 风险

- 每帧写字素级属性 = 每帧 N 次 `setProperty`（N ≈ 一行字数，20~40，可接受）；**绝不能给所有行写**。
- 浅色舞台下宿主 `colors` 派生（`fg` 墨黑 / `bg` 纸白）要保证底栏可读 —— 由宿主 `deriveChrome` 兜底，但要在真机里确认一次。

---

## 05 · 心跳 `pulse`

**极限轴**：同步 / 预测 —— 在只有 30Hz 频谱、4Hz 进度的条件下做"音画同拍"。

**一句话**：一台老式心电示波器；歌词行切换柔性吸附到**预测**的拍点上。

### 清单

```json
{
  "id": "pulse", "order": 250,
  "capabilities": { "spectrum": true, "background": false, "interactive": true },
  "colors": { "bg": "#05070a", "fg": "#7cfc9b", "accent": "#7cfc9b" },
  "performance": { "budgetFps": 60 }
}
```

### 画面结构

```
ctx.root
├─ canvas.pl__scope   示波器：能量包络 + 谱质心轨迹（过去 6 秒，环形缓冲）
├─ .pl__grid          刻度网格 + BPM / 节拍相位读数（DOM）
├─ .pl__gears         两侧机械刻度环（CSS conic-gradient + 每帧 write 一个旋转角）
├─ .pl__lyrics        歌词行（createLyricsView；当前行在"心电图"上有标记）
└─ .pl__empty         空态 + 「自由节拍」提示
```

### 数据映射

| 输入 | 驱动 |
| :--- | :--- |
| `spectrum`（每帧现取） | 能量 `Σbands` 与质心 `Σ(i·band)/Σband` 入环形缓冲；flux（正向差分之和）做 onset 检测 |
| onset 序列 | 用最近 8 个间隔的**中位数**估计 BPM；相位 = 上一个 onset 时刻 + 间隔 |
| 预测拍点 | **负延迟补偿**：在预测时刻**之前**就点亮脉冲（提前 ~40ms），人眼看到的是"正好卡在鼓点" |
| `words` | 精拍基准：字级时间轴与预测拍点做**柔性吸附**（只吸附偏差 < 90ms 的，避免把抒情歌拖歪） |
| `progress` + 墙钟 | 长时基准（补 250ms 台阶），防止 PLL 长时间漂移 |
| 节拍不稳（间隔方差过大） | **退回纯能量包络形态**，HUD 显示「自由节拍」，不假装有拍 |

### 状态机

`empty` → `listening`（攒 onset，网格显示"校准中…"）→ `locked`（BPM 稳定，拍点标记全亮）→ `free`（判定为自由节拍）→ `paused`（波形继续走完缓冲，指针停）。

### 降级矩阵

| 条件 | 行为 |
| :--- | :--- |
| `performance` 档 | 包络降采样到 15Hz；网格与齿轮停转 |
| `animations:false` | 只画一帧静态包络；不做 PLL |
| 未声明 / 拿不到频谱（返回 `null`） | 走 `free` 形态并说明原因（预览模式、后端未就绪） |
| `interactive:false` | 不能点波形 seek |

### 自检

- **纯逻辑**（这款的核心，全部可测）：环形缓冲写入/读取、能量与质心、flux 与自适应阈值、onset 冷却、中位数 BPM、相位预测与负延迟补偿、**柔性吸附函数**、方差判定「自由节拍」的边界。
- **DOM/画布**：给定一串人造 onset（固定 500ms 间隔），PLL 收敛到 120 BPM ± 2；喂一串随机间隔 → 判定为 `free`。

### 风险

- 自由节拍 / 变速曲目：必须**如实**退回，不能显示假的 BPM。
- `progress` 是 250ms 量化值：PLL 的长时基准要用墙钟外推值，直接用补丁值会把相位拉歪。

---

## 06 · 深渊 `abyss`

**极限轴**：像素 / 着色器 —— 半分辨率 GLSL 流体，文字用 DOM 保持矢量。

**一句话**：舞台是一缸缓慢流动的深水，歌词是**液面被压出的凹陷**（折射出来的，不是画上去的）。

> ⚠ **这款必须先过 P1（WebGL2 在真机里走 GPU）**。若 P1 不成立，按降级方案实现（Canvas2D 伪流体），设计意图保留、视觉损失约 40%。

### 清单

```json
{
  "id": "abyss", "order": 270,
  "capabilities": { "spectrum": true, "background": true, "interactive": true },
  "colors": { "bg": "#04121b", "fg": "#dff2ff", "accent": "#58c7ff" },
  "performance": { "budgetFps": 45 }
}
```

### 画面结构

```
ctx.backgroundRoot  整窗底色（CSS 径向渐变，深度分层）
ctx.root
├─ canvas.ab__fluid   半分辨率 WebGL2：流场 + 封面密度场 + 折射（上采样到整屏）
├─ .ab__text          歌词（DOM）：mix-blend-mode 让字"咬"进水里
├─ .ab__surface       水面高光带（CSS 渐变，随低频上浮/下沉）
├─ .ab__vig           暗角 + 颗粒（CSS，一次性）
└─ .ab__hud           曲名 + 深度读数（"− 1240 m"）
```

**关键技巧（本款的技术核心）**：**同一份排版渲染两次** ——
把当前行文本用**同一字体、同一字号、同一坐标**渲染进一张离屏 canvas，作为字形遮罩纹理上传给 shader；
shader 用它的梯度做法线，在液面上压出凹陷；DOM 上的真实文字叠在完全对齐的位置上。
这样"液体虚、文字实"的反差才成立。

### 数据映射

| 输入 | 驱动 |
| :--- | :--- |
| `bands[0..7]` | 泵浦：流速与液面高度（低频涌 → 水面整体抬升） |
| `bands[32..96]` | 湍流噪声强度（域扭曲） |
| `bands[96..128]` | 表面颗粒/泡沫 |
| `flux` | 一次「涌浪」（整屏一次折射偏移） |
| `cover` | 降到 256×256 当密度纹理（水的"颜料"） |
| 当前行文本 | 字形遮罩纹理（**每行只上传一次**，不是每帧） |
| `progress` + 墙钟 | 泵浦相位（4Hz 直接喂 shader 会抖） |
| 深度读数 | 由 `position/duration` 映射成"下潜深度" |

### 状态机

`empty` → `surfacing`（换歌：水面一次涌浪后稳定）→ `flowing` → `paused`（流速衰减到很慢，但**不停**，水在静置时也有微流）。

### 降级矩阵

| 条件 | 行为 |
| :--- | :--- |
| P1 不成立 / `webgl2` 拿不到 | Canvas2D 伪流体：双层位移贴图（封面两份不同相位） + 遮罩暗刻 |
| `performance` 档 | 1/3 分辨率 + 24fps；噪声 3 阶 → 2 阶 |
| `animations:false` | 渲染一帧静态水纹后停帧（画面完整） |
| 窗口失焦 / 后台 | 停帧（GL 也停） |
| `dpr` 高 | 分辨率基准按 `min(dpr, 1.5)` 再乘半分辨率系数 |

### 自检

- **纯逻辑**：封面降采样 → 纹理数据的纯函数、泵浦相位、深度读数映射、分辨率与降级档位的计算。
- **GL 可用性**：拿不到 `webgl2` 时必须**无缝**走 Canvas2D 路径（自检里用一个"禁止 webgl"的假宿主断言这一点）。
- **资源**：`destroy` 后 `WEBGL_lose_context` 被调用、canvas 节点与纹理全部释放。

### 风险

- 半分辨率流体在集显上仍可能吃满 → 必须有 1/3 分辨率档，并且**默认先跑一帧测耗时**，超过 33ms 自动降档（自适应）。
- GL 上下文丢失（`webglcontextlost`）要能恢复或至少不白屏。

---

## 6. 附：六款速查

| id | 一句话 | 播放界面最抢眼的一刻 |
| :--- | :--- | :--- |
| `darkroom` | 整块舞台是一张正在显影的胶片 | 换歌时快门「啪」地开合，画面重新显影 |
| `rubbing` | 歌词是用封面像素堆出来的沙画 | 切句瞬间整行字散成沙，再用新封面主色聚拢 |
| `spire` | 歌词是塔上的玻璃板，镜头飞过去 | 长留白之后镜头一口气爬起来，掠过好几层 |
| `letterpress` | 整屏只有字，字是被排出来的 | 换句时字素从旧位置飞到新位置（活字重排） |
| `pulse` | 一台心电示波器，画面卡在拍点上 | 预测拍点提前点亮的那一下 |
| `abyss` | 歌词是水面被压出的凹陷 | 低频涌上来时整个水面抬升，字从水里浮出来 |
