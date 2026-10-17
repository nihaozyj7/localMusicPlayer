# diva — 虚拟歌姬 · 全息舞台

> 一句话：**一座会跟着歌呼吸的全息演唱会舞台。**
> 深空舞台中央站着一个程序化绘制的全息歌姬：她随人声开合口型、按节拍摆身、会眨眼，
> 发丝与裙摆按频谱飘动；背后是巨型全息光环、体积光与透视地面；底部是卡拉 OK 逐字歌词。
>
> **全部画面由代码绘制，不使用任何图片、字体或既有 IP 角色素材**（图标除外）。
> 契约 v3，第三方样式包，安装到 `%APPDATA%\LocalMusicPlayer\player-skins\diva\`。

---

## 1. 文件结构

```
plugins/style/diva/
├── skin.json          清单：id / 名称 / 版本 / apiVersion / capabilities / colors / performance
├── skin.js            入口：DOM 外壳 + ctx 装配 + 唯一一条 rAF + 补丁处理 + 交互
├── skin.css           外观：HUD / 歌词 / 提示 / 装饰（由宿主包进 @layer skin + @scope）
├── assets/icon.svg    单色线稿图标（宿主用 mask + currentColor 上色）
├── lib/
│   ├── config.js      设计常量：布局比例 / 配色 / 时间 / 性能档（改观感先改这里）
│   ├── util.js        纯函数：clamp/lerp/smoothTo/mulberry32/noise1D/颜色/时间格式化
│   ├── spectrum.js    128 段全谱 → 分频段能量 / 质心 / 通量 / 节拍检测（纯逻辑）
│   ├── stage.js       舞台：离屏静态底图缓存 + 光环刻度 / 斜轨道 / 体积光 / 透视地面 / 光尘
│   ├── diva.js        歌姬：单位空间 Canvas2D 人物 + 姿态 / 口型 / 眨眼 / 发丝 / 全息后期
│   ├── lyrics.js      三行提词器：当前行逐字素点亮 + 翻译 + 点击跳转 + 空态
│   ├── hud.js         LIVE / PAUSED / STANDBY + 曲目 + 秒级时间码（只在秒变化时写 DOM）
│   └── palette.js     封面 32×32 采样 → 冷色霓虹带内的 accent 家族（带缓存）
├── tests/
│   ├── diva-rules.test.js        包结构 / 清单 / 契约纪律 / CSS 越权 / 安全区 / 主题完整性
│   ├── diva-diva-logic.test.js   人物姿态 / 口型 / 眨眼 / 绘制预算 / 确定性
│   ├── diva-spectrum.test.js     分频段 / 质心 / 通量 / 节拍冷却 / 衰减 / 脏数据
│   ├── diva-stage-logic.test.js  光尘 / 刻度 / perf 降档 / 离屏只建一次
│   ├── diva-lyrics.test.js       逐字边界 / 均摊 / 末字兜底 / 多语言 / DOM 纪律
│   ├── diva-hud.test.js          三态 / 空歌 / 歌手兜底 / 在线标记
│   ├── diva-palette.test.js      圆均值 / 色相带约束 / 兜底 / 缓存 / 确定性
│   └── diva-check.mjs            无头浏览器自检（自带静态服务 + 假宿主 + 真 CDP，63 项）
└── README.md
```

---

## 2. 画面是怎么来的

一次 `mount` 之后，entry 只保留**一条 `requestAnimationFrame`**。每帧：

```
ctx.spectrum()（拉取式，不读=不采样）
  → lib/spectrum.js  128 段 → { low, mid, high, vocal, energy, centroid, beat, … }
  → 组装一个复用的 frame 对象 f
  → stage.drawBack(g, f)   离屏底图 drawImage + 光环刻度 / 斜轨道 / 光尘
  → diva.draw(g, f)        单位空间画人物（脚底原点、高 1000）
  → stage.drawFront(g, f)  近景 bokeh / 地平线雾
  → hud.tick(pos, dur, playing) + lyrics.tick(now)
  → 写 CSS 变量 --dv-beat / --dv-energy（空态环、LIVE 圆点用它呼吸）
```

- **进度**：宿主 `progress` 补丁约 4Hz 且位置按 250ms 量化。entry 记 `(pos, posAt)`，
  帧之间按墙钟外推（上限 `TIMING.maxInterpMs`）；歌词的逐字高亮也按同一套锚点补帧。
- **频谱**：契约 v3 是拉取式。清单声明了 `capabilities.spectrum` 才会真的采样；
  卡片不播放时 `ctx.spectrum()` 返回 `null`，画面退化成缓慢待机。
- **配色**：`palette.js` 从封面取色，但始终夹在 `COLOR.hueMin..hueMax`（青 172° → 品红 318°）
  的冷色霓虹带里；结果写进 `--dv-accent / --dv-violet / --dv-pink / --dv-glow`，
  并低频 `ctx.actions.reportBackdrop({ bg, fg, accent })` 让宿主壳的控件栏也保持可读。
- **人物是全程序化的**：没有素材、没有 `shadowBlur`、没有每帧全屏渐变；
  发丝是分层的锥形路径，全息感靠「描边光 + 极淡扫描线 + 轻微 RGB 分离」，
  节拍只让亮度/色散轻微脉冲，不改变构图。

### 2.1 帧对象（模块间唯一的接口）

```js
f = {
  w, h, dpr, t, dt, now, layout,
  playing, pos, duration, progress, lyricIndex,
  reduced, perf, narrow, tiny,
  palette: { bg, fg, accent, cyan, violet, pink },
  spec: { ready, bands, low, mid, high, vocal, energy, centroid, flux, beat, beatPhase, beats, at } | null,
  beat, energy,
};
```

`layout` 由 `config.js#computeLayout(w, h)` 算出来（`cx / baseY / divaH / haloX / haloY / haloR / narrow / tiny`），
`stage` 与 `diva` 都只读它 —— 几何只有一个真源。

---

## 3. 观感怎么调

先改 `lib/config.js`（不要在各模块里翻魔数）：

| 想改什么 | 改哪里 |
| :--- | :--- |
| 人物大小 / 站得高低 | `LAYOUT.divaHeight`（占舞台高比例）、`LAYOUT.divaWidth`（超宽屏上限）、`LAYOUT.divaX`、`LAYOUT.horizon` |
| 光环大小 / 圆心位置 | `LAYOUT.haloRadius`、`LAYOUT.haloLift` |
| 歌词块宽度 / 距底距离 | `LAYOUT.lyricWidth`、`LAYOUT.lyricMaxWidth`、`LAYOUT.lyricBottom`（另加安全区） |
| 霓虹基色 | `PALETTE`（封面取色会在这里的基础上混 34%，见 `COLOR.mix`） |
| 取色自由度 | `COLOR.hueMin/hueMax/mix/satMin…`（想完全固定霓虹就把 `mix` 调小） |
| 停帧 / 眨眼 / 口型速度 | `TIMING.idleStopMs / blinkMinMs / blinkMaxMs / blinkMs / mouthAttack / mouthRelease` |
| 帧率上限 / 粒子数 / 刻度段数 | `PERF`（`budgetFps` 必须与 `skin.json` 的 `performance.budgetFps` 一致，测试会查） |
| HUD 文案 | `UI` |

人物细节（发丝数量、裙摆层数、眼睛形状）在 `lib/diva.js` 的绘制函数里；
舞台细节（刻度环、光尘、地面网格）在 `lib/stage.js` 里。两份文件顶部都有坐标 / 图层说明。

---

## 4. 可观测的 data-*（自检按这些断言）

挂在舞台根元素 `.dv` 上（`root.querySelector(".dv")`）：

| 属性 | 含义 |
| :--- | :--- |
| `data-dv-ready` | `1` = 挂载完成（首帧数据已经灌进去） |
| `data-dv-frames` | 已渲染帧数（每 8 帧更新一次；静止档恒为 `0`） |
| `data-dv-idle` | `1` = 暂停后安静超时、帧循环已停 |
| `data-dv-spec` | `1` = 最近一次读到了 `ctx.spectrum()` 且样本已就绪 |
| `data-dv-beat` | 累计检测到的节拍数 |
| `data-dv-anim` | `1` = 动画开；`0` = 静止形态（`animations:false` 或 `reducedMotion`） |
| `data-dv-perf` | `1` = performance 帧率档 |
| `data-dv-narrow` / `data-dv-tiny` | 窄窗 / 极窄窗布局标记 |
| `data-dv-foreground` | `0` = 详情页在前台但页面被切走（已停帧） |
| `data-dv-interactive` | `0` = 只读舞台（桌面背景歌词窗口） |

歌词容器 `.dv-lrc` 上：`data-dv-lines`（行数）、`data-dv-index`（当前行下标）、
`data-dv-lit`（当前行已点亮字素数）、`data-dv-empty`（`1` = 空态）、`data-dv-status`（歌词状态）。
每个当前行字素是 `.dv-lrc__g`，`data-lit`：`0` 未唱 / `1` 正在唱 / `2` 已唱。

---

## 5. 安装

```powershell
# 样式包
Copy-Item plugins\style\diva "$env:APPDATA\LocalMusicPlayer\player-skins\" -Recurse -Force

# 配套主题（可选；进设置 → 外观 → 主题）
Copy-Item plugins\theme\holo-diva.css "$env:APPDATA\LocalMusicPlayer\themes\" -Force
```

然后设置 →「播放界面样式」→ 重新扫描 → 选「虚拟歌姬 · 全息舞台」；
主题在设置 → 外观里选「全息歌姬」（青 / 紫 / 品红冷色霓虹、深蓝玻璃面板）。

也可以在设置 →「添加播放界面样式」里用「从仓库获取」直接装（需要先重新生成
`plugins/style/index.json`，见 `plugins/README.md`）。

---

## 6. 自检

```powershell
# 纯逻辑（7 个文件；需要 DOM 的部分都抽成了纯函数，不需要 jsdom）
node --test "plugins/style/diva/tests/*.test.js"

# 无头浏览器：自带静态服务 + 假宿主 + 真 CDP，63 项
node plugins/style/diva/tests/diva-check.mjs

# 想留截图给人工看观感（会写 .tmp-diva-shot.png / -narrow.png 与画布 PNG）
node plugins/style/diva/tests/diva-check.mjs --shot
```

> **沙箱 / 受限环境提示**：某些受限会话里 `node --test` 会因禁止带管道 stdio 的子进程而报
> `spawn EPERM`。这时用进程内隔离即可：
> `node --experimental-test-isolation=none --test "plugins/style/diva/tests/*.test.js"`。
>
> **截图提示**：headless Edge + `--disable-gpu` 下 `Page.captureScreenshot` 偶尔拍不到
> `<canvas>` 内容（页面截图里只有 DOM 层）。`--shot` 会另外导出画布自身的 PNG
> （`.tmp-diva-canvas.png`），验证人物/舞台观感以它为准；真机（WebView2）截图不受影响。

覆盖内容：挂载 / HUD / 逐字歌词 / 画布真的在动 / 频谱与节拍 / 暂停 6 秒停帧与恢复 /
前后台停帧 / `animations:false` 与 `reducedMotion` 静止形态 / performance 档限帧与
dpr 封顶 / 安全区（88-92、窄窗 86、归零档）/ 点击舞台与歌词 / `interactive:false` /
封面取色上报 / 空态 / 窄窗 resize / destroy 零残留与可重挂 / 控制台零 error。

---

## 7. 契约纪律（改代码时别破坏）

1. **零裸包名 import**：只允许包内相对路径；子模块用 `await import()` 并透传入口的 `?t=`
   token（`/skins/` 逐文件鉴权，静态 import 会丢 query → 403）。
2. **一条 rAF**：只有 `skin.js` 持有帧循环；任何一条宿主补丁都能把它拉起来。
3. **不碰 `window` / `documentElement`，不发网络请求**（`document.createElement("canvas")`
   做离屏缓存是允许的）。
4. **CSS 不越权**：选择器相对舞台根写，舞台自身用 `:scope`；不写 `:root` / `body` /
   `!important` / 作用域前缀 / 键帧动画（节奏由 JS 写 CSS 变量驱动）。
5. **安全区**：`background:true` 的舞台铺满整窗，标题栏 + 头部行与底栏浮在画面上；
   所有可读文字都必须 `calc(var(--skin-inset-*, 0px) + Npx)` 让开，窄窗覆盖也要带过去。
6. **尊重用户设置**：`animations:false` / `reducedMotion` → 静止形态（0 帧但画面完整）；
   `performanceMode:"performance"` → 按 `budgetFps` 限帧并降规格（dpr 1.5× 封顶、粒子/刻度减半）。
7. **画面确定性**：不用 `Math.random`，随机都走 `mulberry32` 的种子流（同一帧同样的输入 → 同样的输出，
   截图/测试才可复现）。
8. **destroy 清干净**：rAF、`click` 监听、提示用的 `setTimeout`、离屏 canvas、背景层节点。

---

## 8. 已知取舍

- **不是逐音素口型**：口型由上屏数据里的 `vocal`（人声频段能量）驱动，跟着演唱的起伏开合，
  但不与具体音素对齐（契约没有音素级别的时间轴）。
- **色相是约束过的**：封面只影响 accent 家族的色相/饱和度，不会把舞台涂成暖色 ——
  这是「全息冷色」这条设计线的硬约束；想放开改 `lib/config.js#COLOR`。
- **人物是风格化插画**：程序化 Canvas 绘制，刻意不做写实/精细动漫脸；放大到 4K 时
  边缘仍清晰（矢量路径），但细节密度不会随分辨率增加。
- **歌词只有三行上下文**：上一句 / 当前句 / 下一句。整篇歌词的浏览交给宿主的歌词面板。
- **光源/粒子是固定编排**：没有物理模拟，`--dv-beat` 只驱动亮度与轻微色散，
  不会让构图大幅移动（长时间观看不容易晕）。
