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
>
> **P5 已结（拓印签收时实测）**：真机 `bin/lmplayer.exe` 里 `drawImage` + `getImageData` 拿得到像素、
> 画布未被 taint；采样固定走 **64×64 离屏画布**（解码一次、`getImageData` 一次、按歌缓存），
> 所以封面尺寸与 base64 长度对帧率没有影响。4K + dpr2 的填充率那一半由**自适应降级控制器**兜住
> （见 §5.02「实现偏差」#8）。
>
> **P4 已结（动「塔」之前先探，`.tmp-p4-3d.mjs` → 17/17 通过）**，判据全部走几何读数
> （`getBoundingClientRect` / `elementFromPoint`），不依赖 GPU 像素回读：
>
> | 结论 | 实测 |
> | :--- | :--- |
> | `preserve-3d` + `perspective` 真的投影 | `perspective:800px` 下 `translateZ(200px)` 的板投影宽度 ×**1.3333**（不是被压平） |
> | `filter` 是分组属性 | 容器上挂 `blur(0.0001px)` → 两块板的投影**完全重合**（scale=1）→ **塔的祖先链上一个 `filter` 都不能有** |
> | `overflow != visible` 同样压平 | `overflow:hidden` → scale=1（塔的"取景框"不能用 overflow 裁） |
> | `opacity < 1` 同样压平 | `opacity:0.999` → scale=1 |
> | `backdrop-filter` 同样压平 | 挂在塔容器上 → scale=1（**玻璃板不能用 `backdrop-filter` 做"透出背景"**，改用半透明渐变 + 内发光） |
> | `will-change: transform` **不**压平 | scale 仍是 1.3333 → 可以放心给塔加合成提示 |
> | 祖先上的分组属性**不**压平 | `overflow:hidden` / `filter` / `opacity<1` 挂在**透视容器的祖先**上时 scale 仍 1.3333 → **舞台根可以放心用 `overflow:hidden` 裁掉飞出去的层**（致命的是挂在 `preserve-3d` 那个元素自己身上） |
> | 按 Z 正确排序 | `elementFromPoint` 命中近处板；交换两块板的 Z 后命中换人 |
> | `rotateY` 与 `translateZ` 可叠加 | `rotateY(28deg) translateZ(200px)` 投影 scale 1.1848 → 螺旋塔成立 |
> | `transform` 不参与布局 | 改 Z 前后 `offsetWidth` 恒为 140、`font-size` 不变 → 逐帧动画不触发重排 |
> | 文字栅格化倍率 ≈ 投影比 | `translateZ(140px)` 下文本投影宽 ×1.2121 → **把 Z 引起的缩放控制在 1.15× 以内**，字形就不会糊 |
>
> **P1 已结（动「深渊」之前先探，`.tmp-gl-probe.mjs`）**：真机 `bin/lmplayer.exe`（WebView2）里
> 建得出 `webgl2`，走的是真 GPU —— `ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)`，
> 不是 SwiftShader 软渲。读数：
>
> | 探针项 | 实测（1280×820 窗口 / dpr 1） |
> | :--- | :--- |
> | 上下文 | `WebGL 2.0 (OpenGL ES 3.0 Chromium)` / `GLSL ES 3.00`；`alpha:true` 与 **`premultipliedAlpha:false` 都被接受**（要拿到非预乘 alpha 才能和舞台叠） |
> | 上限 | `MAX_TEXTURE_SIZE 16384` / `MAX_SAMPLES 8` / `MAX_DRAW_BUFFERS 8` / `MAX_FRAGMENT_UNIFORM_VECTORS 1024` / `MAX_TEXTURE_IMAGE_UNITS 16` / 各向异性 16 |
> | 浮点渲染目标 | `EXT_color_buffer_float` ✓、`EXT_color_buffer_half_float` ✓、`OES_texture_float_linear` ✓、`EXT_float_blend` ✓；**`RGBA16F` 的 FBO `checkFramebufferStatus` = 36053（COMPLETE）**，半浮点线性过滤可用 |
> | 计时 | `EXT_disjoint_timer_query_webgl2` ✓（**能拿真实 GPU 时间**，不用猜帧率）、`KHR_parallel_shader_compile` ✓、`WEBGL_lose_context` ✓ |
> | 重片元成本（1216×269，64 步循环 + 每步一次纹理采样） | GPU 计时 **0.557ms**；"回读 1 像素强制同步"对照 **0.65ms**（两个读数一致 ⇒ 计时可信） |
> | 同一条着色器 | 半分辨率（608×135）**0.116ms**、1/3 分辨率（405×90）**0.096ms** |
> | 流体的一趟推进（608×135 `RGBA16F` ping-pong：读上一帧 + 半拉格朗日回采 + 加力） | GPU 计时 **0.014ms**、强制同步对照 **0.016ms** |
> | 回读 / 兜底 | `readPixels` ✓（`getError()===0`）；`canvas2d` 的 `filter: blur()` ✓、`getImageData` ✓；CSS `mix-blend-mode` / `backdrop-filter` / `filter` / `will-change` 都支持 |
>
> 两个**必须写进实现的教训**（都是探针里真踩到的）：
> 1. `gl.finish()` 在 ANGLE 上**基本不等 GPU**：同样 20 帧 64 步循环，`finish()` 量出 **0ms**，
>    而 GPU 计时器量出 0.557ms/帧。要"先跑一帧测耗时再决定分辨率"，只能用
>    `EXT_disjoint_timer_query_webgl2`（真机上就有），或者用**回读 1 像素**强制同步 —— 绝不能信 `finish()`。
> 2. 渲染目标**绝不能同时当采样源**（反馈环）：探针第一版把上一帧纹理既绑成采样器、又绑成 FBO 附件，
>    结果 GL 报 1282 `INVALID_OPERATION`，绘制被整帧丢掉 —— 表现是"每帧 0.008ms，快得像没画"。
>    必须 ping-pong 两张纹理，并且**每帧查一次 `getError()`**（自检里把这条固定成断言）。
>
> 结论：P1 成立且余量极大（半分辨率流体哪怕再多 20 趟也在 0.3ms 量级），
> §5.06 的"半分辨率 + 自适应降级"照原设计实现，不需要退化成 Canvas2D 伪流体；
> 兜底路径仍然保留（拿不到 `webgl2` / 上下文丢失时无缝切 Canvas2D）。


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
| 01 | 暗房 | `darkroom` | `plugins/style/darkroom/` | 210 | 后期 / 光 | 纯 CSS+DOM（无 canvas 绘制） | **已签收** |
| 02 | 拓印 | `rubbing` | `plugins/style/rubbing/` | 220 | 图像数据化 + 粒子物理 | Canvas2D + 封面采样（P5） | **已签收** |
| 03 | 塔 | `spire` | `plugins/style/spire/` | 230 | 空间 / 清晰度 | CSS 3D（P4） | **已签收** |
| 04 | 活字 | `letterpress` | `plugins/style/letterpress/` | 240 | 文字 / 排版 | 逐字素 + 四个真实排版轴（不用可变字体） | **已签收** |
| 05 | 心跳 | `pulse` | `plugins/style/pulse/` | 250 | 同步 / 预测 | 自写 onset + PLL | **已签收** |
| 06 | 深渊 | `abyss` | `plugins/style/abyss/` | 270 | 像素 / 着色器 | WebGL2（P1） | **已签收** |

### 签收记录

> 每款签收时在这里追加一行。格式：`- YYYY-MM-DD <id>：证据命令 → 结果`。

- 2026-10-11 `darkroom`：
  - `node --test "plugins/style/darkroom/tests/*.test.js"` → **28/28 通过**（含封面采样边界、快门/时间码/逐字插值的纯函数，以及 imports / fetch / eval / `ctx.*` 白名单 / CSS 禁用项 / 清单 / 图标 的静态扫描）。
  - `node plugins/style/darkroom/tests/darkroom-check.mjs` → **72/72 通过**（真静态服务 + 假宿主 + 无头 Edge：逐字点亮、长间奏末字不拖亮、暂停 6 秒停帧、`visibility:false` 停帧、`animations:false` 零帧、performance 档限帧、destroy 零残留）。
  - `node .tmp-skin-live.mjs --skin darkroom` → **27/27 通过**（真机 `bin/lmplayer.exe` + 隔离数据目录 + 现场生成的宽带 FLAC）：真 CSP 下 `/skins/` token 路由 import 成功、真频谱（0.38/0.20/0.58）驱动光晕与颗粒、真歌词写出 `--g`、暂停 6 秒 `data-idle=1` 且时间码不再走、换样式零残留、820px 窄窗文字不越界、关详情页再开能重挂、控制台零 error/warn。
  - `node plugins/build-index.mjs --check` → `plugins/style/index.json` 已是最新（2 个条目 / 20 个文件）。
- 2026-10-11 `rubbing`：
  - `node --test "plugins/style/rubbing/tests/*.test.js"` → **35/35 通过**（色板 LUT / 主色提取 / 字形位图采样 / 目标点散布与装框 / 字素档位与末字 tail / 粒子池 SoA 步进与磁铁 / 面积→粒子数 / 降级控制器 / EMA 与 LOD 状态机，以及 imports / `?t=` 透传 / `ctx.*` 白名单 / CSS 禁用项 / `filter`、`blur` 白名单 / 清单 / 图标 / destroy 的静态扫描）。
  - `node plugins/style/rubbing/tests/rubbing-check.mjs` → **70/70 通过**（真静态服务 + 假宿主 + 无头 Edge）：逐字进度（亮像素质心右移）、封面换色重新上报 `reportBackdrop` 且对比度 ≥ 3.9、暂停后质心继续下落、暂停 6 秒停帧、切后台停帧、`animations:false` 零帧但静态画面完整、performance 档按清单 45fps 限帧、`fillRect` 打点拖到 45ms 后 `data-lod` 退档且仍在画、dpr2 背板翻倍、820px 窄窗不溢出、destroy 零残留。
  - `node .tmp-skin-live.mjs --skin rubbing` → **29/29 通过**（真机 `bin/lmplayer.exe` + 隔离数据目录 + 现场生成的宽带 FLAC）：真 CSP 下 `/skins/rubbing/…?t=` token 路由 import 成功、真频谱喂进 `--rb-turb`（0.375）、真歌词写出 `data-lit`/`data-glyphs`（新句开门时 lit=1 < glyphs=5）、暂停 6 秒 `data-idle=1` 且时间码不再走、换样式零残留、820px 窄窗画布跟随舞台不溢出、关详情页再开能重挂、控制台零 error/warn。
  - 同一份探针回归 `--skin darkroom` → **28/28 通过**（探针已改成按样式适配表驱动，两款共用一条链路）。
  - `node plugins/build-index.mjs --check` → `plugins/style/index.json` 已是最新（3 个条目 / 28 个文件）。
- 2026-10-11 `spire`：
  - `node --test "plugins/style/spire/tests/*.test.js"` → **42/42 通过**（塔体几何 / 可见度 / 深度着色 / DOM 窗口 / 行间隔→飞行时长 / easeOutCubic 飞行插值 / 塔形收缩 / 逐字档位 / 行定位 / 时间码 + 阻尼相机 / 段落抬升 / 呼吸 / EMA，以及 imports / `?t=` 透传 / `ctx.*` 白名单 / 频谱 `.bands` / **shapeFor 完整性** / 3D 链条分组属性 / 背景层有样式 / 清单 / 图标 / destroy 的静态扫描）。
  - `node plugins/style/spire/tests/spire-check.mjs` → **70/70 通过**（真静态服务 + 假宿主 + 无头 Edge，固定 1200×760 视口）：`preserve-3d` 在真 `@layer`+`@scope` 下仍然生效、**投影尺寸分层**（近层 760×73.8 → 远层 494×65.1，不是"计算值对但被压平"）、螺旋层沿 X 偏移、三片切片都拿到了封面、逐字 `--g` 由 1/7 推到 5/7、8s 行间隔→飞行 1400ms 且 `data-cam` 中途停在 0.16、点第 3 层 seek 14000、低频→`--sp-breath`、换封面重上报、空态收起塔体、暂停 6 秒 `data-idle` 且停帧、切后台停帧/回前台醒、`close` 藏背景层、`animations:false` 零帧但静态一列列表完整（含补丁来了一帧）、performance 档 13 张卡片+45fps 限帧+直跳、窄窗 820px 塔形收敛、destroy 零残留且再收 update 不抛。
  - `node .tmp-skin-live.mjs --skin spire` → **27/27 通过**（真机 `bin/lmplayer.exe` + 隔离数据目录 + 现场生成的宽带 FLAC）：真 CSP 下 `/skins/spire/…?t=` token 路由 import 成功、**真实舞台上塔的投影真的分层**（近层 760×76.2 / 远层 518×70.7）、真频谱喂进 `--sp-breath`（3.30px）、真歌词逐字写进 `--g`、`--sp-cam` 在真机上真的在飞行（0.156）、暂停 6 秒 `data-idle=1` 且时间码不再走、换样式零残留、820px 窄窗塔形收敛（900→648 / 108→69）、切深浅色不炸、关详情页再开能重挂、控制台零 error/warn。
  - `node plugins/build-index.mjs --check` → `plugins/style/index.json` 已是最新（4 个条目 / 35 个文件）。
- 2026-10-11 `letterpress`：
  - `node --test "plugins/style/letterpress/tests/*.test.js"` → **41/41 通过**（排版曲线的值域与单调性（低频→字重/字号、中频→字距/抬升、高频→斜切/收字号）/ performance 档只剩低频轴 / 幅度收敛但不归零 / 版面视窗与列位移（**视窗滑动必须不动画面**）/ 深度样式 / 字素相位确定性 / 逐字时间戳插值（含最后一个字的兜底时长、长度对不齐就退回整行）/ FLIP 增量 / 行定位 / 时间码 / 专色取色与 WCAG 对比度，以及 imports / `?t=` 透传 / `ctx.*` 白名单 / `update(ctx, patch)`+`destroy(ctx)` 签名 / **逐字素只写当前行** / CSS 禁用项 / 全 CSS 只有一个 `filter` / 清单 / destroy 的静态扫描）。
  - `node plugins/style/letterpress/tests/letterpress-check.mjs` → **115/115 通过**（真静态服务 + 假宿主 + 无头 Edge，固定 1200×760 视口；**连跑两次全绿**）：宿主 `@layer`+`@scope` 之后纸白/字号/字距/字重/斜切**真的穿过 CSS 生效**（读 computed 而不是读行内）/ 行池恒为 81 且五行按 54px 槽位依次落位（`--slot` 被换歌词清掉会让整页叠在一起 —— 这条是自检抓出来的 bug）/ **只有当前行**有字素 span（其余行纯文本）/ 换行真的播 FLIP（拦 `Element.prototype.animate`：keyframes 只有 `transform,opacity`、时长 280–560ms）/ 列上移一个行高且**当前行仍停在版面中央**（322→322）/ 铅块「刚排好」会自动退掉 / 长歌 300 行时行池仍是 81、版口省略号「后 219 行 ⋯」/ 点某行 seek 到那一句（点 HUD 与空槽位不 seek）/ 上报 `reportBackdrop`（bg/fg 固定、专色随封面变，对比度 15.77）/ 海报形态与空态互切 / 暂停 6 秒停帧→回前台醒→切后台立即停帧 / `animations:false` **零帧**（补丁来了同步画一帧）且是中性版式 / performance 档**数出来的真帧数**按清单 30fps 限帧（rAF 回调数≈刷新率，数回调会得出 61 的假数）/ 宿主字号改 40 时正文与读数同步 / 820px 窄窗收敛（fit 1→0.745、行高 54→44）不溢出 / destroy 清空自己的树且**没删宿主给的挂载点**、没碰背景层、无残留 WAAPI。
  - `node .tmp-skin-live.mjs --skin letterpress --port 9371` → **28/28 通过**（真机 `bin/lmplayer.exe` + 隔离数据目录 + 现场生成的宽带 FLAC）：真 CSP 下 `/skins/letterpress/…?t=` token 路由 import 成功、真实频率喂进排版曲线（`--lp-wt 490` / `--lp-sz 1.032` / `--lp-sp 0.036em` / `--lp-sk -1.437deg` / `--lp-lift 0.722px`）、真歌词逐字写进 `--g`（新句开门时 0.02/0/0/0/0）、HUD「§ 1 / 5」、暂停 6 秒 `data-idle=1` 且时间码不再走、换样式零残留（舞台 + 整窗背景层都干净）、820px 窄窗收敛（fit 1→0.72、行高 54→44）且文字仍在视口内、切深浅色不炸、关详情页再开能重挂、控制台零 error/warn。
  - `node plugins/build-index.mjs` → `plugins/style/index.json` 已更新（5 个条目 / 42 个文件），`--check` 通过。
- 2026-10-11 `pulse`：
  - `node --test "plugins/style/pulse/tests/*.test.js"` → **49/49 通过**（onset 检测（自适应阈值 / 冷却 / 静音不误报 / 稳态巨响只出一次）/ 节拍收敛（500ms 一拍 → 120BPM、「8% 抖动仍锁得住」、「间隔忽长忽短必须落 free」/ PLL 软校正只挪偏差的一半 / **负延迟脉冲**（峰值在拍点前 40ms，`pulseAt(beat−40)` 必须是极值）/ 吸附取最近且在窗口内 / 环形缓冲与窗口切片 / 窗口映射（`winOf` 的双倍保留区 + `markXs` 用 refT 映射、保留范围用 from/to）/ 几何 / 颜色 / 时间码 / 齿轮相位，以及 imports / `?t=` 透传 / `ctx.*` 白名单 / 不用 backgroundRoot / CSS 禁用项（无 `!important`、无 `:root`、无裸标签）/ **全包只有 3 个 rAF**（且歌词视图恒以 `playing:false` 驱动 —— 宿主 SDK 的平滑 rAF 不许被点亮）/ destroy 的静态扫描）。
  - `node plugins/style/pulse/tests/pulse-check.mjs` → **109/109 通过**（真静态服务 + 假宿主 + 无头 Edge，固定 1200×760 视口；**连跑两次全绿**）：宿主的 `@layer`+`@scope` 之后清单底色/扫描线/`@keyframes pl-spin` **真的生效**（读 computed）/ 歌词用的是**宿主真模块** `createLyricsView`（`/sdk/` 路由托管整个 `player-skins/src`，5 行真渲染、当前行有且只有一个 `aria-current`）/ 合成 500ms onset 流 → **锁定 120BPM**、拍点间距 = 估出来的周期（±2px）、最右可见拍点就在扫描指针处 / **字级刻度真的吸到拍点上**（吸过的刻度与拍点标记 rect 重合 ≤1.5px —— 证明"窗口映射 + 容器位移"两套坐标是同一套数字）/ 点屏幕中间 = seek 到那一刻 / **滑动窗口连续**（每 50ms 位移 = −plotW×50/6000，窗口重设那一下正好复位 +plotW，拍点整体刚性左移）/ 脉冲峰值 0.94 而拍点之间回到 0 / 间隔 180..900ms 的散板 → **`free` 且只显示「自由节拍」**（不谎报 BPM）、不画网格、不吸附、齿轮回到 4 秒一圈 / 断掉频谱 → 「无频谱输入」但仍然在画 / `interactive:false` 不 seek / performance 档**数真帧**按 15Hz 渲染（rAF 回调 60）且齿轮停转 / `animations:false` **零帧**且补丁来了同步画一帧、画面与读数完整 / 切后台停帧、`close` 停帧、暂停 6 秒 `data-idle` 后归零、恢复播放立刻继续画 / 820px 窄窗齿轮 40px、画布跟随盒子、页面不横向滚动 / destroy 清空自己的树且**没删宿主给的挂载点**、没碰背景层、无残留帧。
  - `node .tmp-skin-live.mjs --skin pulse` → **30/30 通过**（真机 `bin/lmplayer.exe` + 隔离数据目录 + 现场生成的宽带 FLAC）：真 CSP 下 `/skins/pulse/…?t=` token 路由 import 成功（子模块靠 `?t=` 透传）、**真频谱上真的锁上了拍**（`data-beat=locked` / `data-onsets=27` / `data-cv=0.05` / 29 个拍点 / 1 个刻度吸附）、真歌词逐字写进 `--w`（0.53）、时间码在走、暂停 6 秒 `data-idle=1` 且时间码不再动、换样式零残留、820px 窄窗画布跟随舞台不溢出、切深浅色不炸、关详情页再开能重挂、控制台零 error/warn。
  - `node plugins/build-index.mjs` → `plugins/style/index.json` 已更新（6 个条目 / 49 个文件），`--check` 通过。
- 2026-10-11 `abyss`：
  - `node --test "plugins/style/abyss/tests/*.test.js"` → **39/39 通过**（频谱→泵浦（三段分频不串台 / attack-release 不对称 / 音量无关 / 静音回落）/ 封面降采样成密度场（双线性平滑且对比度还在）/ 深度读数（0..2400m 与「− N m」文案）/ 分辨率（`min(dpr,1.5)` + 档位系数）/ **降档状态机**（`nextTier` 的 lo/hi 取反曾把「从 full 降档」判成不动，是这条测出来的）/ 泵浦相位积分 / 字形遮罩的坐标规划与 key / 涌浪包络 / 液面抬升，以及 imports / 子模块 `?t=` 透传 / `ctx.*` 白名单 / **lib 之间的静态 import 禁令**（会丢 `?t=` 并二次加载）/ 只有 `mask.js` 碰 DOM / 无 fetch·eval·setInterval / CSS 禁用项 / **当前行不许 transform 缩放**（一缩遮罩就对不齐）/ 全包一条 rAF / GL 三条铁律（ping-pong、不许采样自己渲染的目标、不靠 `gl.finish()`）/ 遮罩按行上传而不是按帧 / destroy 清单 / 可观测 `data-*` 的静态扫描）。
  - `node plugins/style/abyss/tests/abyss-check.mjs` → **125/125 通过**（真静态服务 + 假宿主 + 宿主真 `createLyricsView` + 无头 Edge 走真 WebGL2；**连跑两次全绿**）：把 `WebGL2RenderingContext.prototype.drawArrays` 打点并在**成画那一笔**（默认帧缓冲）之后立刻 `readPixels` 取 16×4 像素指纹 —— **81 帧 80 个不同指纹**（"水真的在流"是读回来的像素，不是自己报的计数）/ `data-glerr=0` 且一整轮没有 1282（自我反馈环会留下它）/ **一份排版渲染两次对得上**：字形遮罩的墨迹包围盒 vs DOM 文字行盒（左边缘 0px、中心 2px、宽度比 0.972、整体包含）/ GPU 计时器量到真时间（1.0~1.3ms，`gl.finish()` 在 ANGLE 上是假 0ms）/ 同一行跑 500ms 遮罩**一次都没重画**（`data-maskrev` 不变）/ 换行才重画且三行都对齐 / 换歌涌浪 + 深度归零 + 曲名跟着换 / 点水面 seek 而点歌词让路给 SDK（各一次）/ 拿不到 `webgl2` → 无缝切 Canvas2D（兜底画布顶上来、GL 画布藏起来、2D 每帧 clearRect 真的在重画）/ **真的丢上下文**（`WEBGL_lose_context`）→ 同样无缝切并记 `data-gl-lost=1` / performance 档 1/3 分辨率且**数真帧**按 24fps 封顶（1 秒 23 帧 / rAF 112）/ 静态档 rAF·GL·2D 三处都是 0 帧而补丁来了同步画一帧 / 切后台停帧、回前台继续、暂停 6 秒 `data-idle=1` 停帧、恢复播放继续画 / 820px 窄窗字号收一档（21→18）不溢出 / 上报配色对比度 16.51 / destroy 后自己的树空、背景层清空并收回、**真的调了 `loseContext()`**、之后零帧。
  - `node .tmp-skin-live.mjs --skin abyss` → **28/28 通过**（真机 `bin/lmplayer.exe` + 隔离数据目录 + 现场生成的宽带 FLAC）：真 CSP 下 `/skins/abyss/…?t=` token 路由 import 成功（子模块靠 `?t=` 透传）、**真机上真的跑在 WebGL2 上**（`data-gl=1` / `glerr=0` / 854 次出帧 / 流场 1280×820 / `tier=full`）、真频谱喂进水里（`--ab-lift 0.995` / `--ab-turb 1.000` / `--ab-foam 1.000`）、真歌词逐字写进 `--w`（0.06）且字形遮罩按当前行画出来（`mask=5` / `maskerr=0`）、下潜深度读数、暂停 6 秒 `data-idle=1` 且时间码不再走、换样式零残留（舞台 + 整窗背景层都干净）、820px 窄窗画布跟随舞台不溢出、切深浅色不炸、关详情页再开能重挂、控制台零 error/warn。
  - 探针同时修了一处**隔离不干净**：`pvMode` 也存在 WebView2 profile 的 localStorage 里，上一次跑别的样式会留下它的 id，应用启动时 localStorage 先于 Go 配置生效 → 控制台多一条「样式「X」不存在，已回退到「经典」」，把"零 error/warn"误判成失败。现在每次跑都清掉 `wv2/` profile。（另：探针的 `SPECS` 为 abyss 显式**不用** `SPEC.canvas` 读像素 —— GL 画布是 `preserveDrawingBuffer:false`，复制到 2D 上读到的可能是空的，那是量具不可靠而不是画面没画。）
  - `node plugins/build-index.mjs` → `plugins/style/index.json` 已更新（7 个条目 / 58 个文件），`--check` 通过。
- 2026-10-12 `abyss` 修**观感**（用户报：「深渊这个播放器样式观感很差，歌词看不清，背景也不知道在干嘛」）：
  - 复现与量具：先补了一条**量对比度**的断言（把当前行那一条 ±6px 截下来，在页内解码后取"暗的一半的中位数"当底色、
    最亮的 1% 当中值当前景色，算 WCAG）—— 量出来只有 **1.31:1**。在此之前的 39 项纯逻辑 + 125 项浏览器**全绿**，
    因为没有任何一条在量"合成之后字到底看不看得清"。修完是 **9.36:1**（底 `(10,30,42)` / 字 `(92,204,255)`）。
  - 根因（四条，都与"层叠/坐标/量纲"有关，不是美术问题）：
    1. `.ab__vig` 在 DOM 里排在 `.ab__text` **之后**，`rgba(bg,0.6→0.85)` 到歌词那一行时 alpha≈0.79，等于给字盖了层纱。
       现在暗角在歌词之前，另加一层歌词专用柔光底（`.ab__scrim`）。
    2. 宿主 `lyrics.css` 是**未分层**注入的，插件 CSS 被宿主包进 `@layer skin` —— 未分层永远赢分层，
       所以本包写 `.lyric { font-size/color }` 一条都不生效（屏幕上一直是主题的灰蓝字）。
       唯一旋钮是把 `--lyric-*` / `--text-1` / `--accent` 声明到 `.lyrics__scroll` 上。
       **自检为此加了 `/host/` 路由把真的 `lyrics.css` 一起加载** —— 在此之前它跑在一个没有歌词 CSS 的假环境里，
       既掩盖了这条，也让窄窗档位的"死规则"看起来是活的。
    3. `--lyric-pad` 是百分比 padding，而百分比永远按**宽度**算：1280×800 下 `36% 0` 是上下各 460px，把字挤出可视区。
       改成 `calc(var(--ab-h) * 0.245)`，当前行现在落在舞台 **53%** 高度。
    4. `gl.js` 把 0..255 的颜色直接喂了 `uniform3f`（`hexToRgb`/Canvas2D 那一侧的口径），
       `uBg * 0.6` 变成 `(2.4,10.8,16.2)` —— 整屏灰白雾。这就是"背景不知道在干嘛"。
  - 顺带修掉的画质问题：封面密度场 64→**128** 采样 + 两遍模糊（64 采样在屏幕上是 ~17px 硬边方块）；
    速度场的**逐纹素白噪声**换成平滑值噪声（白噪声被 0.985 的衰减积分放大 ~60 倍，
    成画时拿它挪封面采样点 ⇒ 满屏麻点 + `floor(uv*20)` 方块）；封面平铺从 `fract` 改**镜像折叠**（接缝硬边）；
    泡沫/颗粒噪声压到接近不可见并只撒在液面附近。
  - `node --test "plugins/style/abyss/tests/*.test.js"` → **40/40 通过**（新增一条：**真的 `import()` 每个文件** ——
    着色器源码写在 JS 模板串里，改注释时写了个反引号就会提前闭合模板串，静态扫描看不出来；
    这条在本轮真的抓到了一次）。
  - `node plugins/style/abyss/tests/abyss-check.mjs` → **130/130 通过**：指纹 **88 帧 85 个不同值** /
    遮罩 vs DOM 文字行盒（左 ≤1px、中心 ≤3px、宽度比 0.994、整体包含）/ **当前行合成对比度 9.36:1** /
    GPU 计时器 1.61ms / 层序 `vig < scrim < text < hud` / 当前行 32px 是 `rgb(88,199,255)` 而其它行 23px。
  - `node tools/.tmp-abyss-live.mjs`（真机 `bin/lmplayer.exe` + 真实曲库）→ **9/9 通过**：
    `data-gl=1` / `glerr=0` / 流场 1170×764 / `tier=full`、真频谱（`--ab-lift 0.999` / `--ab-turb 0.991`）、
    真歌词遮罩 `mask=9` / `maskerr=0`、当前行 32px `rgb(88,199,255)`、当前行在舞台 53% 高度、控制台零 error。
  - `node plugins/build-index.mjs` → `plugins/style/index.json` 已更新，`--check` 通过。
  - 教训（写进 README）：**"全绿"只证明被量到的东西是对的**。上一轮 125 项全绿的时候，
    真机上是 1.31:1 的灰雾 —— 缺的不是断言数量，是"渲染出来的像素"这一路的量具。
- 2026-10-12 `pulse` 修一处**高刷屏缺料**（用户报：「心电图区域铺满窗口，波形左端却空一段；调整窗口尺寸能撑满，过一会儿又空回去」）：
  - 根因：环形缓冲只按**帧数**保留（512 个样本），而它的语义是"过去 6 秒" —— 每帧写一个样本，所以能存几秒取决于刷新率：
    60Hz 下 8.5 秒（开发者机器与自检都看不出问题），**120Hz 只剩 4.26 秒、144Hz 只剩 3.55 秒**，
    于是窗口左端 29% / 41% 根本没有样本（波形左边空一截）。开/拖窗口时帧率掉到 85Hz 以下就"刚好"盖满 6 秒，
    帧率恢复后 512 帧（约 4 秒）又空回去 —— 用户感知就是"随机故障"。（本机屏恰好是 2560×1440@120Hz。）
  - 修法：`ringPush` 改为按 **时间** 丢最旧（`RING_KEEP_MS` = 窗口 6 秒 + 1 秒余量，余量给 4Hz/250ms 量化的进度补丁跳变）；
    `RING_CAP` 只当内存上界：512 → 4096（240Hz 要 1680，4096 够到 ~580Hz）。
  - 验证：`node --test "plugins/style/pulse/tests/*.test.js"` → **51/51 通过**（新增两条：30/60/85/120/144/240Hz 下窗口覆盖都要≈6 秒、
    时间上界与容量上界各管一段）；`pulse-check.mjs` → **109/109 连跑两次全绿**；
    另用"假 rAF 钉在 120Hz"的探针在 1000×700 / 1400×900 / 1600×1000 三个尺寸上**量画布像素**：
    修前波形左端空 271~436px，修后 0~2px（`gapPx`）。
  - `node plugins/build-index.mjs` → `plugins/style/index.json` 已更新，`--check` 通过。
- 2026-10-12 `rubbing` 修**可见性**（用户报：「进度条/音量条/播放键/播放模式按钮的颜色和其他控件不一样」+「拓印里 UI 已经不可见、和背景融为一体」）：
  - 根因（两个症状同一条链，都在插件侧）：`applyPalette` 拿**未压暗的封面主色**当选字色的依据，
    而整窗真正的底是 `.rbbg__img`（`blur(34px) brightness(0.46)`）叠 `.rbbg__veil` 暗纱
    （恒为近黑）—— 封面主色比 ~0.17 亮就选出深色字，落在近黑底上只剩 **1.08:1**
    （用户封面 `#d48995` 实测；宿主壳标题栏/底栏/侧栏与 HUD 一起消失）。宿主救不了：它只按
    "声明的 bg"算对比度，声明的是亮色封面主色（7:1，看着达标）。
    同时 `reportBackdrop` 只报 `{bg, fg}`，宿主壳的**强调色家族**（`--accent`：进度条/音量条/
    播放键/播放模式按钮）就永远停在清单里那个静态专色 `#b9a37e` 上，与封面无关。
  - 修法：新增 `lib/palette.js#backdropUnderCover`（把「封面 → brightness(.46) → 暗纱 α=.72」
    换算成合成底，参数与 `skin.css` 同源）→ 用**合成底**选 fg、`--rb-bg` 也写合成底；
    `reportBackdrop` 改为 `{bg, fg, accent}`（accent = `pal.accent`，与画面里的 `--rb-accent` 同源）。
    修后同一张封面：bg `#211718` / fg `#f2ece0` / **14.90:1**。
  - 验证：`node --test "plugins/style/rubbing/tests/*.test.js"` → **37/37 通过**
    （新增"选字色用合成底（亮封面也不会选出深色字）"与"选字色与上报都走合成底、accent 一起报"）；
    `node plugins/style/rubbing/tests/rubbing-check.mjs` → **74/74 通过**
    （新增 4 条：上报的 bg 是近黑合成底、fg 是亮色字、accent 是 hex、accent 与 `--rb-accent` 同源）。
  - `node plugins/build-index.mjs` → `plugins/style/index.json` 已更新，`--check` 通过（`npm run check:plugins`）。

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

- [x] S1 包结构齐全（`skin.json` / `skin.js` / `skin.css` / `assets/icon.svg` / `lib/*.js` / `README.md` / `tests/`）
- [x] S2 纯逻辑自检全绿（28/28）
- [x] S3 浏览器自检全绿（72/72，含 destroy 无残留、关动效零帧、切后台停帧）
- [x] S4 契约纪律零违规（静态扫描：无 fetch / eval / setInterval / 越权 `ctx.*`；CSS 只写相对舞台的选择器）
- [x] S5 `colors` 三项齐全 + `reportBackdrop` 防抖上报（≥300ms）已验证
- [x] S6 一条 rAF / 暂停停帧 / 前台切换停帧 / performance 档按清单 30fps
- [x] S7 `destroy` 清干净（舞台节点 + 整窗背景层 + 帧循环 + 计时器）
- [x] S8 真机挂载 + 真播放/暂停/换样式/切主题/窄窗口不崩（`.tmp-skin-live.mjs` 27/27）
- [x] S9 `node plugins/build-index.mjs` 已重跑（`--check` 通过）
- [x] S10 本文件 §4 已签收

### 实现偏差（与设计稿不同之处，均为落地时的实测取舍）

| # | 设计稿 | 实际实现 | 原因 |
| :--- | :--- | :--- | :--- |
| 1 | 用 `ctx.sdk.createBackgroundLayer` | 自己往 `ctx.backgroundRoot` 里放 `.drbg__img` + veil，`destroy` 时清空并 `hidden = true` | 需要「封面 second copy + 暖色 veil」两层且要按 `--dr-*` 变量呼吸，sdk 那层不够用；宿主**不会**替你清 `backgroundRoot`，所以卸载必须自己清 |
| 2 | 用 `ctx.sdk.createFxLyrics`（`--w`） | 自己的歌词渲染器（每字素一个 `.dr__g`，写 `--g`） | 逐字进度要按**自算的字素进度**（含末字 tail 规则）而 sdk 只给整行状态 |
| 3 | 色差用「复制一层歌词」 | 每字素 `text-shadow` 双色偏移 | 复制层会让 DOM/帧成本翻倍，`text-shadow` 免费拿到同样的错位感 |
| 4 | 频段划分 64~128 为高频 | 与 `magic-circle` 对齐：低 0–11 / 中 32–95 / 高 96–127 | 128 段是对数分桶，64–128 实际只覆盖 4kHz 以上，做不出「低频 → 光晕」 |
| 5 | 降级矩阵写 24fps | 清单 `performance.budgetFps = 30` | 以清单为唯一口径（自检直接读清单值断言） |
| 6 | 快门「轻微开合」 | 由 onset 驱动 `--dr-snap`（0→1 衰减），两层结构（慢 300ms 换歌过渡 + 快 60ms 打击抖动）分开 | 一层做不出「换歌慢开合 + 打击瞬间抖一下」 |
| 7 | 末字按 `words[i+1]` 或行尾结束 | 末字时长 = 相邻正间隔的**中位数**（回退 400ms），并夹在行尾之内 | 否则长间奏时最后一个字会亮十几秒（已写进测试） |
| 8 | 「延迟补偿插值」 | `VISUAL_LAG_MS = 80` 的固定前视 + 墙钟外推（`maxExtrapolateMs = 1200`） | 进度补丁 4Hz、位置量化 250ms，不等就必然一顿一顿 |

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

### 签收清单（02）

- [x] S1 包结构齐全（`skin.json` / `skin.js` / `skin.css` / `assets/icon.svg` / `lib/*.js` / `README.md` / `tests/`）
- [x] S2 纯逻辑自检全绿（37/37，含"选字色必须走合成底 + accent 必须上报"两条回归）
- [x] S3 浏览器自检全绿（74/74，含画布像素质心、destroy 无残留、关动效零帧、切后台停帧、LOD 退档仍在画、上报配色是近黑合成底）
- [x] S4 契约纪律零违规（静态扫描：无 fetch / eval / setInterval / 越权 `ctx.*`；子模块 import 透传 `?t=`；CSS 只写相对舞台的选择器、`filter`/`blur` 只在白名单元素上）
- [x] S5 `colors` 三项齐全 + `reportBackdrop` 防抖上报（400ms，**`{bg, fg, accent}`**；bg/fg 按"合成底"推导，见「实现偏差」#11）+ 上报配色对比度 ≥ 3.9 已验证
- [x] S6 一条 rAF / 暂停停帧 / 前台切换停帧 / performance 档按清单 45fps（自检直接读清单值断言）
- [x] S7 `destroy` 清干净（舞台节点 + 整窗背景层 + 帧循环 + 计时器 + 类型化数组）
- [x] S8 真机挂载 + 真播放/暂停/换样式/切主题/窄窗口不崩（`.tmp-skin-live.mjs` 29/29）
- [x] S9 `node plugins/build-index.mjs` 已重跑（`--check` 通过）
- [x] S10 本文件 §4 已签收

### 实现偏差（与设计稿不同之处，均为落地时的实测取舍）

| # | 设计稿 | 实际实现 | 原因 |
| :--- | :--- | :--- | :--- |
| 1 | 四层直接挂在 `ctx.root` 上 | 自包一层 `.rb`（画布 / 灰尘 / 空态 / HUD 都在里面） | 宿主用 `@layer skin { @scope(舞台根) }` 包插件 CSS，插件需要一个**自己的**作用域根来写 `--rb-*` 变量与状态属性（`data-lit`/`data-lod`/`data-idle`）；直接写舞台根会和宿主的状态属性混在一起，`destroy` 也没法整块回收 |
| 2 | 封面采样 96×96 | **64×64** | 采样只为"每个目标点取一个颜色"，64×64 在 14000 个点下已经够密；再大只是白付解码与 `getImageData` 的钱 |
| 3 | 未唱到的字画"低 alpha 粒子" | 未唱的部位改成 **DOM 文本印痕**（`.rb__dust`，极淡 + `blur(1.1px)`） | 一万个粒子再画一遍轮廓是双倍填充；而且"模糊的轮廓"用 canvas 画更贵。灰尘层只做"没唱到的地方有东西"这一件事，交给合成器最便宜 |
| 4 | 逐字"聚拢"（连续量） | 逐字档位**量化成 3 档**，颜色预建 **18 条批次**（6 色桶 × 3 档） | 逐粒子上色（每帧上万次 `fillStyle` + 字符串拼接）会直接顶掉帧预算；批次化后每帧只有 18 次 `fillStyle` + 每粒子一次 `fillRect` |
| 5 | `bands[0..8]` 驱动湍流 | `bands[0..12]` 的均值（与暗房 / `magic-circle` 的低频口径对齐） | 128 段是对数分桶，0–8 只到 ~200Hz；0–12 才是"低频涌"的手感 |
| 6 | `flux` 是一次「撒沙」 | 撒沙由**两个**来源驱动：自算的谱通量（突增）+ 换句 | 契约里没有 `flux` 数据面（进度补丁只给 position/playing），只能自己从频谱算通量 |
| 7 | 降级矩阵写 30fps | 清单 `performance.budgetFps = 45` | 以清单为唯一口径（自检直接读清单值断言）；30fps 在粒子上会明显看出跳格 |
| 8 | 「必要时整幅画按 scale 画在半分辨率画布上再放大」 | 做成**自适应降级控制器**：量每帧画布耗时的 EMA，连续 2 帧超预算才退一档（`data-lod` 0→3：粒子 ×1/×0.66/×0.45/×0.30，后两档背板半分辨率），8 秒后不再退 | 静态阈值在 4K/核显/后台负载下必然选错；退档要"迟滞 + 封顶"，否则会在两档之间来回跳（每次跳都 resize 画布 = 一次清屏） |
| 9 | （设计稿未提）切句时才现算字形位图 | 切句前 **240ms 预热**下一句的目标点，LRU 缓存 8 条 | 否则每次换行都在同一帧里塞一次离屏 `fillText` + `getImageData`（低端机上一次就是一次掉帧） |
| 10 | （设计稿未提）频谱口径 | 探针里音量给 `0.04`；`ctx.spectrum()` 必须读 `.bands` | 频谱是**音量后**的：音量 0 时分析器读到静音，视觉量全 0（宿主行为）。另外 `spectrum()` 给的是快照 `{bands, at}` —— 当成裸数组用会静默读出恒 0（本项目已两次踩到，第二次写进了静态扫描） |
| 11 | `colors` / `reportBackdrop({bg, fg})` 里的 `bg` = 「画面底色」 | 上报的是**合成底**（封面经 `blur + brightness(.46)` 再叠暗纱之后的颜色，恒为近黑），并且**把 `accent` 一起上报** | 真机暴露的可见性 bug：拿未压暗的封面主色当底选字色，封面比 ~0.17 亮就会选出深色字，压在近黑的画面底上（实测 ~1.1:1）—— 宿主壳（标题栏 / 底栏 / 侧栏）与 HUD 的字一起消失，而宿主看不出来（它按"声明的亮底"算，7:1 看着达标）。`accent` 不报则宿主壳的进度条 / 音量条 / 播放键 / 播放模式按钮（`--accent` 家族）永远停在清单里的静态专色上，与当前封面无关（用户报的"这些控件颜色和别人不一样"） |

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
.sp__world（perspective: var(--sp-persp)，默认 900px）
├─ .sp__fog        远景雾（两层静态渐变；**不用 mask-image**，它是分组属性）
├─ .sp__slices     封面视差切片（3 片，translateZ −180/−260/−420px，screen 混合）
├─ .sp__tower      preserve-3d 的塔体（卡片**池**：2×半窗+1 个节点，与歌词行数无关）
│   └─ .sp__card × (2×半窗+1)   窗口化：只画当前句前后 ±12 层（性能档 ±6）
│        ├─ .sp__plate    玻璃板（渐变底 + 描边 + 内阴影；不用 filter）
│        └─ .sp__line     歌词行（DOM 文本，矢量；逐字素 span 带 --g）
├─ .sp__empty      空态
└─ .sp__hud        曲名 + 歌手 · 「第 n / N 层」+ 时间码
```

### 数据映射

| 输入 | 驱动 |
| :--- | :--- |
| `progress` 的位置 | 当前层号（`lineIndexAt`）→ 镜头目标；层内逐字 `--g` |
| `lyrics()` 的行 | 每一层（`time` + 字素 + 字级时间戳） |
| 行距（两行时间差） | 飞行时长（`600..1400ms`） |
| `bands[0..12]` | 塔体的呼吸式上浮（`--sp-breath`，0..9px） |
| 相机值 | 每帧由 JS 写每层的 `--c-tf` / `--c-op`（**自己实现分层相机**：`sdk.createCamera` 只能驱动一个容器） |
| 点击某层 | `ctx.actions.seek(该行 time)`（DOM 命中天然精确） |

### 状态机

`empty` → `rising`（换层：镜头沿塔体飞行 0.6~1.4s，时长由行间隔反算）→ `holding`（停在该层）→ `paused`（悬停，不飞）。

### 降级矩阵

| 条件 | 行为 |
| :--- | :--- |
| `performance` 档 | 层数 ±12 → ±6；关雾与切片；镜头改为直接跳（无飞行）；按清单 45fps 限帧 |
| `animations:false` | 不做 3D 变换，退化成「一列垂直居中列表」，且**一帧都不进帧循环**（补丁来了只画一帧） |
| P4 不成立（3D 撕裂/糊） | 退化成 **2.5D**：只保留 `translate3d` 与 `scale`，不做 `rotateY` |
| 窄窗口（< 900px） | 透视收敛（900→648px），层间距压缩（108→69px），`rotateY` ×0.4 |
| 无封面 | 用 `ctx.defaultCover`；取色失败回落到清单配色 |
| 无字级歌词 / 字数对不齐 | 整行一起亮（不做逐字） |
| `interactive:false` | 层不可点 |

### 自检

- **纯逻辑**：塔体几何（层号 → `x/y/z/rotateY`）、行间隔 → 层间距映射、飞行时长反算、窗口化的可见区间计算（当前句 ±N）。
- **DOM**：点第 k 层 → `actions.seek` 收到该行的 `time`（假宿主断言）；`destroy` 后 `.sp__world` 消失且 `preserve-3d` 节点清空。
- **投影**：近层与远层的 `getBoundingClientRect` 必须**不一样**（被压平的两个值会完全相同）——这是"3D 真的生效"唯一靠得住的判据，假宿主与真机各验一次。

### 签收清单（03）

- [x] S1 包结构齐全（`skin.json` / `skin.js` / `skin.css` / `assets/icon.svg` / `lib/tower.js` / `lib/camera.js` / `README.md` / `tests/`）
- [x] S2 纯逻辑自检全绿（42/42）
- [x] S3 浏览器自检全绿（70/70，含投影分层、逐字推进、飞行中途值、destroy 零残留、关动效零帧、切后台停帧、performance 档按清单 45fps）
- [x] S4 契约纪律零违规（静态扫描：无 fetch / eval / setInterval / 越权 `ctx.*`；子模块 import 透传 `?t=`；CSS 只写相对舞台的选择器；3D 链条（`.sp__world` / `.sp__tower` / `.sp__card`）上零分组属性）
- [x] S5 `colors` 三项齐全 + 封面取色→`reportBackdrop` 防抖上报（400ms）+ 对比度已算（`--sp-on-accent` 按对比度选深浅）
- [x] S6 一条 rAF / 暂停停帧 / 前台切换停帧 / performance 档按清单 45fps（自检直接读清单值断言；静态档一帧都不进循环）
- [x] S7 `destroy` 清干净（舞台节点 + 整窗背景层 + 帧循环 + 计时器 + 点击监听 + 卡片池引用）
- [x] S8 真机挂载 + 真播放/暂停/换样式/切主题/窄窗口不崩（`.tmp-skin-live.mjs` 27/27）
- [x] S9 `node plugins/build-index.mjs` 已重跑（`--check` 通过：4 个条目 / 35 个文件）
- [x] S10 本文件 §4 已签收

### 实现偏差（与设计稿不同之处，均为落地时的实测取舍）

| # | 设计稿 | 实际实现 | 原因 |
| :--- | :--- | :--- | :--- |
| 1 | `lyrics().index` 驱动镜头 | 镜头是**自己算的一个数**（`st.camPos`，可带小数），由 `progress` 的位置经 `lineIndexAt` 推出 | 契约里 `lyrics().index` 只在换句时更新一次（4Hz 的 `progress` 才是连续量）；而且镜头要能停在**层间**（飞行途中），必须允许小数 |
| 2 | 行距 → 层间距 `--step`（"长留白 → 层更高"） | 行距改为驱动**飞行时长**（`600..1400ms`）；层间距是**常量**（`--sp-step`） | 层间距随行距变化会让塔在歌里忽高忽低（空间感崩），而"抬头看"的段落感用飞行时长表达更准（也更好断言） |
| 3 | `bands[0..8]` 驱动呼吸 | `bands[0..12]` 的均值（与暗房 / 拓印同一口径） | 128 段是对数分桶，0–8 只到 ~200Hz；0–12 才是"低频涌"的手感 |
| 4 | 每帧写各层的 `--cam-x/--cam-y/--cam-z/--cam-rot` | 每层每帧只写 **2 个**自定义属性：`--c-tf`（整条 transform）与 `--c-op` | 写 4~6 个属性 × 25 层 = 每帧上百次样式失效；整条 transform 一次写完还没有中间态。写之前先与上次的值比对，静止时不产生任何写入 |
| 5 | `.dr__fog` 用 `mask-image` 做雾 | 改用**两层静态渐变**（径向 + 线性） | `mask-image` 是分组属性（P4：挂在 `preserve-3d` 子树里会压平 3D）—— 塔里一个分组属性都不能有 |
| 6 | 玻璃板"边框 + 内阴影" | 半透明**渐变底** + 1px 描边 + 内阴影 + 一条上沿反光伪元素 | 完全透明的板在深色封面下没有"玻璃"的体积感；`::before` 是伪元素、不参与 3D 排序，不会引起 z 撕裂 |
| 7 | 封面视差切片 3~4 片 | **3 片** + `mix-blend-mode: screen` + `translateZ(-180/-260/-420px)` | 4 片在窄窗口会互相盖住；3 片已经能读出视差。切片在塔外（`.`sp__slices`），所以用混合模式也不会影响塔的 3D 上下文 |
| 8 | 窄窗口"透视收敛（`--sp-zoom` 变小）" | 改的是 `--sp-persp`（透视距离 900→648）与 `--sp-ty`（层距 108→69），并把 `rotateY` 降到 40% | 减小投影缩放会同时把文字缩糊（P4：栅格化倍率 ≈ 投影比）；拉远透视距离 + 压缩层距既能"收"，又让每层的投影比更贴近 1 |
| 9 | 状态机 `empty → rising → holding → paused` | 落地为 **`data-playing` / `data-idle` / `data-flying` / `data-empty`** 四个可观测属性，不引入显式状态机 | 宿主只推补丁，没有"状态机"这一层；四个属性既够 CSS 用，也够自检断言（显式状态机在这里只是多一份要同步的真相） |
| 10 | （设计稿未提）`preserve-3d` 的祖先能不能有分组属性 | **祖先可以**（`.sp` 的 `overflow:hidden` 用来裁掉飞出去的层），只有**挂在 `preserve-3d` 那个元素自己身上**才致命 | P4 补测（17/17）：透视容器的祖先挂 `overflow:hidden` / `filter` / `opacity<1` 时投影仍是 ×1.3333；这条放宽了舞台根的写法 |
| 11 | （设计稿未提）`shapeFor` 的返回值形状 | 必须是**完整**塔形（`{...SHAPE, 覆盖项}`），并写了专门的自检 | 第一版只返回覆盖项，缺 `farScale` → `scale` 算出 `NaN` → `transform: scale(NaN)` 是**非法值**，CSS 直接忽略整条 transform：表现是"所有层叠在同一个位置"，控制台一声不吭。自检里现在断言"用塔形算出的几何全是有限数" |
| 12 | （设计稿未提）`update` / `destroy` 的签名 | `update(ctx, patch)` / `destroy(ctx)` | 契约是 `update(ctx, patch)`（见 `contract.js`）。第一版写成了 `update(patch)`，自检里表现为"所有补丁都像没收到"（画面永远停在挂载那一刻、`close` 不清背景层）——这一条是自检抓出来的，最好地说明了为什么每款都要有浏览器自检 |

### 风险

- `preserve-3d` 子树里出现 `filter` / `backdrop-filter` / `overflow:hidden` / `opacity<1` 会被**强制扁平化**，整套透视崩掉 → 塔体内部禁用全部分组属性（静态扫 + 投影尺寸双重把关）。
- 半透明层的 z 排序在 Chromium 里会撕裂 → 层用**不透明感强的底 + 半透明描边**，不叠两层半透明大面。

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

### 画面结构（落地版）

```
ctx.root（.lp，浅色纸面）—— 恰好 4 个直接子元素
├─ .lp__paper     纸面：纸纹 + 基线网格（.lp__rules，全 CSS 唯一的 filter）+ 版口 marks
├─ .lp__sheet     版面：.lp__elide--top / .lp__col / .lp__elide--bottom / .lp__poster
│    └─ .lp__line × 81  行池（槽位固定 --slot = k，DOM 数量与歌词行数无关）
│         └─ .lp__u × N **只有当前行**有字素 span（其余行是纯文本）
├─ .lp__empty     空态（无歌词时的排版提示）
└─ .lp__hud       曲名 / 「§ 行号 / 总数」/ 字号·字重读数 / 时间码
```

### 数据映射

| 输入 | 驱动 |
| :--- | :--- |
| `bands` 分段（低 0–12 / 中 13–44 / 高 45–127） | 排版曲线：低频→字重 + 字号、中频→字距 + 抬升、高频→斜切 + 收字号 |
| `words` | 逐字素入场：**只有当前行**写字素级 `--g`（行数 N 小、成本可控） |
| `lyricsFontSize`（宿主设置） | **基准字号**（`--lp-base`），排版曲线是乘在它上面的相对量（不覆盖宿主设置） |
| `showLyrics:false` | 画面切成「只有曲名与歌手的排版海报」形态 |
| 换行 | FLIP 重排：新旧行都用 `Element.prototype.animate` 动 `transform`/`opacity`（时长 280–560ms 按字数） |

### 状态机（落地版：四个可观测属性，不引入显式状态机）

`data-empty`（无歌词）/ `data-poster`（海报形态）/ `data-set`（刚排好，铅块短暂显形 320ms）/ `data-idle`（暂停 6 秒后停帧）。
另有 `data-perf`（performance 档）/ `data-animations` / `data-interactive` / `data-narrow` / `data-dpr` / `data-playing` / `data-show-lyrics` 供 CSS 与自检读取。

### 降级矩阵

| 条件 | 行为 |
| :--- | :--- |
| `performance` 档 | 按清单 `budgetFps: 30` 限帧（**真帧数**，不是 rAF 回调数）；只有低频轴在动，字距/斜切/抬升锁在中性值 |
| `animations:false` 或 `env.reducedMotion` | 不进 rAF 循环：一次算出**中性版式**，之后每个补丁同步画一帧；换行不飞 |
| 窄窗口（≤ 900px） | 曲线幅度按 `fit` 收敛（1 → 0.72），行高 54 → 44px，不溢出 |
| `interactive:false` | 行不可点，也不 seek；`cursor: default` |
| `showLyrics:false` | 海报形态，歌词列 `display:none` |

### 自检

- **纯逻辑**（`tests/letterpress-logic.test.js`，41 项）：排版曲线的值域与单调性（`performance` 档只剩低频轴）、幅度收敛、版面视窗与列位移（**视窗滑动必须不动画面**）、深度样式（越远越小越淡、且 9 与 3 同档）、字素相位确定性、逐字时间戳插值（最后一个字的兜底时长、长度对不齐就退回整行）、FLIP 增量、行定位、时间码、专色取色与 WCAG 对比度。
- **DOM**（`tests/letterpress-check.mjs`，115 项）：computed 值真的穿过 `@layer`+`@scope` 生效、行池恒 81 且按 54px 槽位依次落位、**只有当前行**有字素 span、换行真的播 FLIP（拦 `animate` 看 keyframes 只有 transform/opacity）、当前行换行后**仍在版面中央**、长歌 300 行时行池不涨且版口标出「后 N 行」、点击 seek、`reportBackdrop` 专色随封面变、暂停/切后台/关动效/performance 档/destroy 的行为。

### 风险

- 每帧写字素级属性 = 每帧 N 次 `setProperty`（N ≈ 一行字数，20~40，可接受）；**绝不能给所有行写** —— 实测把轴写在行根上（每行 6 个变量、**变了才写**），只有 `--g` 与 `--lp-a` 落到字素上。
- 浅色舞台下宿主 `colors` 派生（`fg` 墨黑 / `bg` 纸白）要保证底栏可读 —— 真机确认：`colors` 三项齐全、`reportBackdrop` 对比度 15.77（清单声明 4.5 的下限之上）。
- 深色主题**不换纸面**（印好的纸不随房间灯变）—— `[data-mode="dark"]` 下纸白仍是 `rgb(242,239,231)`，自检专门断言这一条（否则对比度会被主题做坏）。

### 签收清单（04）

- [x] S1 包结构齐全（`skin.json` / `skin.js` / `skin.css` / `assets/icon.svg` / `lib/typeset.js` / `lib/ink.js` / `README.md` / `tests/`）
- [x] S2 纯逻辑自检全绿（41/41）
- [x] S3 浏览器自检全绿（115/115，连跑两次；含 computed 值穿透 `@layer`+`@scope`、行池恒 81、只有当前行有字素 span、FLIP keyframes、当前行换行不动位、长歌 300 行、destroy 零残留、关动效零帧、切后台停帧、performance 档按清单 30fps 的**真帧数**）
- [x] S4 契约纪律零违规（静态扫描：无 fetch / eval / setInterval / 越权 `ctx.*`；子模块 import 透传 `?t=`；`update(ctx, patch)` / `destroy(ctx)` 签名；逐字素只写当前行；CSS 只写相对舞台的选择器、全 CSS 只有一个 `filter`（且在 `.lp__rules` 上））
- [x] S5 `colors` 三项齐全 + 封面取色→`reportBackdrop` 防抖上报（400ms，bg/fg 固定、accent 随封面变）+ 对比度已算（≥ 3.9 自检 / 15.77 实测）
- [x] S6 一条 rAF / 暂停 6 秒停帧 / 切后台停帧 / performance 档按清单 30fps（自检读清单值并数**真帧数**；静态档一帧都不进循环，但补丁来了同步画一帧）
- [x] S7 `destroy` 清干净（舞台自己的树 + 帧循环 + 2 个计时器 + WAAPI + 点击监听 + 行池引用；**没删宿主给的挂载点**；`background:false` 所以一个字节没碰背景层）
- [x] S8 真机挂载 + 真播放/暂停/换样式/切主题/窄窗口不崩（`.tmp-skin-live.mjs --skin letterpress` 28/28）
- [x] S9 `node plugins/build-index.mjs` 已重跑（`--check` 通过：5 个条目 / 42 个文件）
- [x] S10 本文件 §4 已签收

### 实现偏差（与设计稿不同之处，均为落地时的实测取舍）

| # | 设计稿 | 实际实现 | 原因 |
| :--- | :--- | :--- | :--- |
| 1 | 自带子集化 woff2 + `font-variation-settings`（可变字体轴） | **不用可变字体**，用四个真实存在的 CSS 属性（`font-weight` / `letter-spacing` / `font-size` / `skewX`）模拟排版轴 | CJK 可变字体子集化后仍有数 MB；而且 `FontFace` 是异步加载，第一帧必然跳字（"字被排出来"的感觉全毁）。P3 只做到"可选"，实测后决定不做 |
| 2 | 每帧给每个字素写 `--lp-w / --lp-s / --lp-sp / --lp-sk` | 轴值写在**行**上（6 个行级变量：`--lp-wt/-sz/-sp/-sk/-lift/-inkv`），且**变了才写**；字素级每帧只写 `--g`（量化到 1%）与换行时的 `--lp-a` | 一行 30 字 × 4 个属性 = 每帧 120 次样式失效，纯属浪费（同一行的轴值本来就完全相同）。落到行上还让"整行一起呼吸"在视觉上更整齐 |
| 3 | 行池窗口 ±12 行 | **±40 行**（池子 81 个） | ±12 时换行会让窗口滑动 + 行内容重排，**正在屏幕上的行会被改文本**（肉眼可见的跳字）。±40 之后重排发生在屏幕外（可见区只有 ~7 行），屏幕上的行永远只是"往下挪一格" |
| 4 | 重排固定 400ms | **280–560ms 按字数**（`200 + 9 × 字数`，夹在 280..560） | 一个字的重排和 40 个字的重排用同一时长，前者像卡了一下、后者像拖尾。按字数走才像"铅字一块块落版" |
| 5 | `.lp__grid` 基线网格 + `.lp__blocks` 活动铅块两个独立层 | 合并进 `.lp__paper`（网格 + 版口 marks）与行上的伪元素（铅块），根元素只有 4 个直接子元素 | 层数不是目的；`filter` 只留给纸纹一处（多一个 `filter` 就多一层合成开销，还容易被误判成"分组属性"） |
| 6 | 状态机 `empty → composing → set → paused` | 落地为 `data-empty` / `data-poster` / `data-set` / `data-idle` 四个可观测属性 | 与 03 同一取向：宿主只推补丁，没有"状态机"这一层；属性既够 CSS 用，也够自检断言 |
| 7 | 逐字进度用 `lyrics().index` 定位 | 位置来自 4Hz 的 `progress` + 墙钟外推（`VISUAL_LAG_MS = 70`、最多外推 1200ms），行号由 `lineIndexAt` 推出；`lyrics().index` 只做交叉核对 | `lyrics().index` 只在换句时更新一次，是**阶跃**量；逐字进度必须是连续量 |
| 8 | 窄窗口"曲线幅度收敛" | 收敛到 `fit ≤ 0.72` 并**行高 54 → 44px**；`--lp-base` 不动 | 只收幅度不改行高，窄窗里行会挤（44px 在 820×560 下刚好） |
| 9 | （设计稿未提）清版面时清哪些变量 | `syncLines` 只清**内容相关**的 `--lp-ds/--lp-di`，**保留 `--slot`** | 第一版用 `removeAttribute("style")` 一把清，`--slot` 也没了 → 81 行全塌到同一个槽位（表现是"整页文字叠在一起"），而行号/帧数/逐字档位**全都是对的**。这条是浏览器自检抓出来的（"五行按 54px 槽位依次落位"） |
| 10 | （设计稿未提）performance 档怎么证明限帧 | **数真帧数**（每帧必拉一次 `ctx.spectrum()`，数它的调用次数），不数 rAF 回调 | 被限掉的帧照样会再排一次 rAF → 数回调得到 61/秒（≈刷新率），看着像"限帧没生效"。这条差点写成假绿 |

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

### 签收清单（05）

- [x] S1 包结构齐全（`skin.json` / `skin.js` / `skin.css` / `assets/icon.svg` / `lib/beat.js` / `lib/scope.js` / `README.md` / `tests/`）
- [x] S2 纯逻辑自检全绿（51/51；含 2026-10-12 补的两条**高刷屏**用例：30/60/85/120/144/240Hz 下 6 秒窗口都要铺满、时间上界与容量上界各管一段）
- [x] S3 浏览器自检全绿（109/109，连跑两次；含 `@layer`+`@scope` 之后 `@keyframes` 仍生效、**宿主真 `createLyricsView`**、合成 onset 流锁 120BPM、字级刻度吸附后与拍点标记 rect 重合、滑动窗口连续（每 50ms = −plotW×50/6000）、散板如实落 `free`、performance 档数**真帧**、静态档零帧但补丁来了一帧、切后台/暂停 6 秒/恢复、窄窗、destroy 零残留）
- [x] S4 契约纪律零违规（静态扫描：无 fetch / eval / setInterval / 越权 `ctx.*`；子模块 import 透传 `?t=`；`update(ctx, patch)` / `destroy(ctx)` 签名；`background:false` 所以全包不出现 `backgroundRoot`；CSS 无 `!important` / `:root` / 裸标签；全包只有 3 处 `requestAnimationFrame`，且**歌词视图恒以 `playing:false` 驱动**（不许把宿主 SDK 的平滑 rAF 点亮））
- [x] S5 `colors` 三项齐全 + 挂载后**防抖 400ms** 上报一次 `reportBackdrop`（bg/fg/accent 都来自清单）+ 对比度已算（自检 15.61 / 清单声明 15.61，都 ≥ 4.5）
- [x] S6 一条 rAF / 暂停 6 秒停帧 / 切后台停帧 / `close` 停帧 / performance 档按 `min(清单 60, 15)` = 15Hz（自检数**真渲染帧**：1 秒 13 帧而 rAF 回调 60）/ 静态档一帧都不进循环但补丁来了同步画一帧
- [x] S7 `destroy` 清干净（帧循环 + 2 个计时器 + 点击监听 + 歌词视图 + 自己的树；**没删宿主给的挂载点**；`background:false` 所以一个字节没碰背景层）
- [x] S8 真机挂载 + 真播放/暂停/换样式/切主题/窄窗口不崩（`.tmp-skin-live.mjs --skin pulse` 30/30，真频谱上真的锁上了拍：`onsets=27` / `cv=0.05`）
- [x] S9 `node plugins/build-index.mjs` 已重跑（`--check` 通过：6 个条目 / 49 个文件）
- [x] S10 本文件 §4 已签收

### 实现偏差（与设计稿不同之处，均为落地时的实测取舍）

| # | 设计稿 | 实际实现 | 原因 |
| :--- | :--- | :--- | :--- |
| 1 | BPM = 最近 8 个间隔的**中位数** | 中位数附近 ±35% 的间隔取**截尾均值** | 中位数被量化到帧网格（16.7ms）后会系统性偏高：500ms 一拍实测中位数 475ms → 126BPM。截尾均值实测稳定在 120±3；间隔抖动 8% 时误差 ≤5% |
| 2 | 拍点标记每帧写一次 `--x` | **滑动窗口**：`--x` 只在重锚 / 换行 / 窗口重设时写，每帧只写容器的一个 `--pl-slide` | 6 秒窗口里 12~40 个标记 × 每帧写 = 每秒上千次样式失效。滑动之后每帧只有 1 次 |
| 3 | （设计稿未提）窗口参考点怎么走 | 可见区间恒为 [now−6s, now]，`--x` 以 `tRef−6s` 为参考点、容器位移 `−(now−tRef)/6s×plotW`；`tRef` **每 6 秒**才换一次，且元素保留范围是**双倍窗口**（12 秒） | 一个周期里"过去的 6 秒"必须有现成元素；参考点一换就在同一帧里重算 x 并把位移归零，屏幕位置因此**连续**（自检专门量"拍点整体刚性左移"） |
| 4 | 齿轮每帧写一个旋转角 | 相位交给 CSS animation（`--pl-period` + 负 `animation-delay`），只在锁定状态改变时写两个变量 | 每帧写 `transform` 会一直触发样式失效；负 delay 让"转到的角度"天然与节拍相位对齐，还省掉每帧一次字符串拼接 |
| 5 | flux 阈值用固定倍数 | 三路自适应：`max(0.002, 峰值×0.32, 最近 24 帧中位数×1.7)`，峰值按 0.98/帧衰减 | 宿主响度补偿后音量是**未知数**（探针里是 0.04），绝对阈值必然失效；相对自身的"变响"才与音量无关 |
| 6 | 拍点在画布上画 | 拍点标记与字级刻度都是 **DOM**（画布只留包络/质心/flux） | 吸附与时间轴这两件事必须能被**量**到（自检量 rect、量 `data-snap`、量间距），画在 canvas 里就只能靠像素取证 |
| 7 | `--pl-pulse` 由 PLL 直接给 | 负延迟补偿后的脉冲值，锁定才非 0，`data-flash` 在 >0.5 时置 1 | 峰值提前 40ms 才是"卡在鼓点上"的观感；未锁定时恒 0（不假装在打拍子） |
| 8 | BPM 直接显示估计值 | 折进 60..180（`foldBpm`）后显示 | 90 与 180 是同一个脉冲（相差一个八度），不折的话半拍误检会显示出两倍 BPM；锁定判据用**间隔变异系数**（cv ≤ 0.16 锁定 / ≥ 0.34 落 free / 中间仍是"校准中"） |
| 9 | 时间轴用 `performance.now()` | 画面一律架在**歌曲位置钟**上（`position + 墙钟外推`），墙上时钟只管调度（限帧、暂停 6 秒的看门狗） | 第一版把 `performance.now()` 当时间轴：探针里字级刻度"刚好"吸上是因为合成拍点凑巧同相；真机上歌曲位置（几万毫秒）与页面开机时间（几百万毫秒）差着数量级，**一条刻度都不会画**。同时暂停时歌曲钟必须不走，而"暂停 6 秒"必须走 |
| 10 | 6 秒窗口里的 16 个标记池 | 池子 40 个（最快 180BPM 时 12 秒窗口 = 36 个拍点） | 双倍窗口（偏差 3）带来的上限变化；DOM 数量与拍数无关这一点不变 |
| 11 | 字级刻度由宿主 SDK 提供 | 刻度自己算（`lib/scope.js#railTicks`），歌词用宿主真 `createLyricsView` | 宿主视图只提供"字素 span + `--w` 填充"，**时间轴**是这一款的极限轴；两个都自己算就等于重写歌词视图，不如各管一段 |

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

### 签收清单（06）

- [x] S1 包结构齐全（`skin.json` / `skin.js` / `skin.css` / `assets/icon.svg` / `lib/water.js` / `lib/gl.js` / `lib/canvas2d.js` / `lib/mask.js` / `README.md` / `tests/`）
- [x] S2 纯逻辑自检全绿（39/39）
- [x] S3 浏览器自检全绿（125/125，连跑两次；含**成画那一笔的像素指纹**、`glerr=0`、GPU 计时器真时间、字形遮罩 vs DOM 行盒对齐、遮罩每行只画一次、换歌涌浪、两条兜底路径（关掉 webgl2 / 真的丢上下文）、performance 数真帧、静态档三处零帧、切后台/暂停 6 秒/恢复、窄窗、destroy 零残留且 `loseContext()` 真的被调到）
- [x] S4 契约纪律零违规（静态扫描：无裸包名 import / 无 fetch·eval·setInterval；子模块 import 透传 `?t=`；**lib 之间不许静态 import**（会丢查询串并二次加载），依赖一律当参数注入；只有 `mask.js` 碰 DOM；`ctx.*` 白名单；CSS 无 `!important` / `:root` / 裸标签 / 作用域前缀；全包只有一条 `requestAnimationFrame`）
- [x] S5 `colors` 三项齐全 + 挂载后**防抖 400ms** 上报一次 `reportBackdrop`（bd/fg/accent 都来自清单 + 封面主色微调）+ 对比度已算（自检 16.51 / 清单声明 16.51，都 ≥ 4.5）
- [x] S6 一条 rAF / 暂停 6 秒停帧 / 切后台停帧 / `close` 停帧 / performance 档按 `min(清单 45, 24)` = 24fps（自检数**真渲染帧**：1 秒 23 帧而 rAF 回调 112）/ 静态档（`animations:false` 与 `reducedMotion`）一帧都不进循环但补丁来了同步画一帧 / GPU 计时器连续三窗都说慢才降档、说快才升档
- [x] S7 `destroy` 清干净（帧循环 + ResizeObserver + 点击监听 + 歌词视图 + 字形遮罩离屏 canvas + GL 纹理/程序/帧缓冲并主动 `WEBGL_lose_context.loseContext()` + 自己的树；**没删宿主给的挂载点**；`background:true` 所以背景层内容清空、`hidden` 收回、`data-skin` 抹掉）
- [x] S8 真机挂载 + 真播放/暂停/换样式/切主题/窄窗口不崩（`.tmp-skin-live.mjs --skin abyss` 28/28，真机真的跑在 WebGL2 上：`gl=1` / `draws=854` / `flow=1280x820` / `tier=full`）
- [x] S9 `node plugins/build-index.mjs` 已重跑（`--check` 通过：7 个条目 / 58 个文件）
- [x] S10 本文件 §4 已签收

### 实现偏差（与设计稿不同之处，均为落地时的实测取舍）

| # | 设计稿 | 实际实现 | 原因 |
| :--- | :--- | :--- | :--- |
| 1 | 暂停后水**不停**（静置也有微流） | 暂停 6 秒后**停帧**，最后一帧留在屏上 | S6 的"暂停后自动停帧"是硬条件，压过了这条观感描述；停帧前水一直在微流（`--ab-lift` 衰减但不归零） |
| 2 | 一次「涌浪」由 flux 触发 | 换歌补丁**必发**一次涌浪，flux 尖峰**也能**触发（同一条 900ms 包络，冷却 300ms） | flux 要自己从频谱里检测，静音/纯正弦的验收曲不一定有尖峰；换歌是**确定发生**的时刻，先保证它 |
| 3 | 「测一帧耗时超 33ms 就降档」 | 用 `EXT_disjoint_timer_query_webgl2` 量**30 帧窗口**的平均 GPU 时间，连续 3 窗慢才降、连续 3 窗快才升 | 单帧耗时被帧边界/驱动抖动污染；ANGLE 上 `gl.finish()` 实测**基本不等 GPU**（探针 P1 量到 0ms），单帧根本量不准 |
| 4 | 字形遮罩每帧重画 | 判据是「行号 + 文本 + 遮罩尺寸」的 key，**换行才重画**（`data-maskrev` 可观测） | 一张 2048 边的全舞台画布逐帧重画纯属浪费；自检专门量"同一行跑 500ms，rev 一次都不涨" |
| 5 | 兜底用同一张 canvas | 兜底是**第二张** canvas（`.ab__soft`），用 `visibility` 切换，两张布局盒子完全一致 | 一个 canvas 一辈子只能有一种上下文：`.ab__fluid` 拿过 webgl2 之后，再问它要 `"2d"` 永远是 `null`（**上下文丢了之后也一样**）—— 这条是写完浏览器自检才暴露出来的 |
| 6 | 背景层跟随"静态档关动画" | 状态**镜像**到 `.abbg` 自己身上再写规则（`.abbg[data-animations="0"] …`） | 背景层在宿主给的另一个容器里，`.ab[data-animations="0"] .abbg__caustics` 这条选择器**永远匹配不到**（两个容器是兄弟关系，宿主给它们各开了一个 `@scope` 根） |
| 7 | `dpr` 只按 `min(dpr,1.5)` | 在此之上再乘档位系数（half = 0.5、third = 1/3），并因此有了**三个档位**的自适应 | 探针里 dpr 1 时 1280×820 的舞台在真机上 GPU 时间只有 ~1ms，说明半分辨率明显保守；自适应把"够快就升到 full"变成可观测的事实（探针实测 `tier=full`） |
| 8 | 用户可见的"状态机" `empty → surfacing → flowing → paused` | 屏上只有 `empty / flowing / still` 三个值（`data-flow-state`），涌浪是**一次包络**而不是一个状态 | 涌浪只有 900ms，"surfacing"做成一档状态会与"正在播放"打架；包络更适合表达"一次扰动"，也更容易被量到 |
| 9 | 字形遮罩用「同一字体、同一字号、同一坐标」渲染 | 用 `Range` 逐个文本节点量出**真排版矩形**（含计算字号与字距），再照着矩形画，并对齐数据写在 `data-maskerr` 上 | 直接把整行文字画进 canvas 会丢"宿主 SDK 自己切了字素 span"这层排版；按 Range 量出来才与 DOM 逐字对齐（自检量到左边缘 0px） |
| 10 | 舞台 5 层（canvas / text / surface / vig / hud） | **9 层**：GL 水 + 兜底水 + 字形遮罩 + 光晕 + 液面 + 歌词 + 暗角 + HUD + 兜底角标 | 两条兜底路径各要一张自己的 canvas（偏差 5）、GL 的凹陷要一张离屏遮罩当纹理（偏差 9）；光晕与「Canvas2D 伪流体」角标是加出来的可见状态（降级必须是**看得见**的，不能静默变糊） |

---

## 6. 附：六款速查

| id | 一句话 | 播放界面最抢眼的一刻 |
| :--- | :--- | :--- |
| `darkroom` | 整块舞台是一张正在显影的胶片 | 换歌时快门「啪」地开合，画面重新显影 |
| `rubbing` | 歌词是用封面像素堆出来的沙画 | 切句瞬间整行字散成沙，再用新封面主色聚拢 |
| `spire` | 歌词是塔上的玻璃板，镜头飞过去 | 长留白之后镜头慢慢爬起来，整座塔往后推一层（一次跳好几句时才会掠过好几层） |
| `letterpress` | 整屏只有字，字是被排出来的 | 换句时字素从旧位置飞到新位置（活字重排），列整版上移一格 |
| `pulse` | 一台心电示波器，画面卡在拍点上 | 预测拍点提前点亮的那一下 |
| `abyss` | 歌词是水面被压出的凹陷 | 低频涌上来时整个水面抬升，字从水里浮出来 |
