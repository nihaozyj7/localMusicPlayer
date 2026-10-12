# 塔 · spire

第三方播放界面样式（皮肤契约 **v3** / `apiVersion: "3.0"`）。

> **一句话**：歌词是一层层悬浮的玻璃板，沿 Z 轴螺旋排成一座无限塔；唱到哪一层，镜头就停在哪一层。

- **极限轴**：空间 + 清晰度 —— 全程 CSS 3D（`perspective` + `preserve-3d`），正文永远是 DOM 里的矢量文字。
- **没有 canvas、没有贴图、没有 `filter`**。整套空间感来自「透视投影 + 每层一个 `transform`」。

---

## 装到播放器里

播放器不读本仓库的 `plugins/`（它只认数据目录），所以要么用界面里的
「添加播放界面样式 → 从仓库获取」，要么手动拷过去：

```powershell
# 1) 拷包（目标目录要带样式 id）
$dst = Join-Path $env:APPDATA "LocalMusicPlayer\player-skins\spire"
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item -Recurse -Force .\plugins\style\spire\* $dst
Remove-Item -Recurse -Force (Join-Path $dst "tests") -ErrorAction SilentlyContinue

# 2) 让播放器重扫样式目录（设置里点「重新扫描」，或重启）
```

`tests/` 只是自检脚本，装的时候可以不要。

---

## 画面结构

```
.sp（舞台根：宿主已经用 @scope 限定，自带 overflow:hidden 裁掉飞出去的层）
├─ .sp__world            透视容器（perspective: var(--sp-persp)）
│  ├─ .sp__fog           远景雾（两层静态渐变，随低频做毫米级上浮）
│  ├─ .sp__slices        封面视差切片 ×3（translateZ −180/−260/−420px，screen 混合）
│  ├─ .sp__tower         preserve-3d 的塔体（卡片池）
│  │   └─ .sp__card × (2×半窗+1)   一层 = 一句
│  │        ├─ .sp__plate  玻璃板（半透明渐变底 + 描边 + 内阴影；**不用 filter/backdrop-filter**）
│  │        └─ .sp__line   歌词行（每个字素一个 .sp__u，--g 逐字点亮）
│  └─ .sp__empty         空态
└─ .sp__hud              曲名 / 歌手 · 第 n / N 层 · 时间码

ctx.backgroundRoot（整窗背景层，宿主给容器）
└─ .spbg__img + .spbg__veil + .spbg__shaft
```

**卡片池**：DOM 节点数与歌词行数**无关** —— 只有 `2×半窗+1` 个 `.sp__card`
（默认半窗 12 → 25 个；性能档 6 → 13 个；窄窗 8）。窗口滑动时把文字重刷进池子，
所以一首 200 行的歌也只写 25 个节点的样式。

---

## 数据映射

| 输入 | 驱动 |
| :--- | :--- |
| `lyrics()` 的行 | 一层（`time` + 字素） |
| `progress` 的位置 | 当前层号 → 镜头目标；层内逐字 `--g` |
| 相邻两行的时间差 | 飞行时长（`600..1400ms`，长留白 → 慢慢爬，快节奏 → 干脆跳过去） |
| `bands[0..12]` 的平均 | 塔体呼吸 `--sp-breath`（0..9px，性能档/静态档为 0） |
| 封面 | 1×1 降采样 → 壳配色（`reportBackdrop`）+ 背景层 + 切片 |
| 点击某一层 | `ctx.actions.seek(该行的 time)` |
| `playing:false` | 不飞、不动（进度补丁仍会把画面挪到暂停的位置） |

**镜头是"一个数"**：`st.camPos`（可以带小数）。每层的位置都由它派生
（`lib/tower.js#cardGeometry`），所以不需要逐层写相机 —— 这是 `sdk.createCamera`
（只能驱动一个容器）在这里不够用的原因。

---

## 关键取舍（都是量出来的，不是猜的）

1. **`preserve-3d` 的祖先链上一个分组属性都不能有**。
   动工前跑了 `.tmp-p4-3d.mjs`（17/17）：`filter` / `overflow:hidden` / `opacity<1` /
   `backdrop-filter` 挂在 **`preserve-3d` 那个元素自己身上**会把整套透视**压平**
   （两块板的投影完全重合）；而挂在**透视容器的祖先**上（例如 `.sp` 的 `overflow:hidden`）
   不会 —— 所以舞台根可以放心裁掉飞出去的层。
2. **玻璃感不用 `backdrop-filter`**：它同样是分组属性（见上），改用
   「半透明渐变底 + 1px 描边 + 内阴影 + 一条上沿反光伪元素」。
3. **`transform` 不参与布局**（P4 实测：改 Z 前后 `offsetWidth` 恒为 140）→
   逐帧改 `transform` 不触发重排，只走合成。
4. **文字锐度**：P4 实测文本投影宽在 `translateZ(140px)` 下是 ×1.2121 ——
   即"栅格化倍率 ≈ 投影比"。所以塔形把 Z 引起的缩放控制在 **1.15× 以内**
   （`SHAPE.farScale = 0.9` + 相机停在层上而不是层间），字形不会糊。
5. **一层只写 2 个自定义属性**：`--c-tf`（整条 transform）与 `--c-op`；
   写之前先跟上次的值比对（自定义属性每次写都会让样式失效，逐帧写上百个是白烧 CPU）。
6. **窄窗口**：透视收敛 + 层间距压缩 + `rotateY` 降到 40%（`lib/tower.js#shapeFor`）。
7. **HUD 要让开宿主壳（安全区）**：本款声明了 `background:true`，舞台是 `inset:0` 铺满整窗的，
   而宿主的「标题栏 + 详情页头部行」与「底部播放控件栏」浮在画面上。曲名 / 歌手 / 层号 / 时间码
   用 `padding-bottom: calc(var(--skin-inset-bottom, 0px) + 30px)` 抬起来 ——
   渐变暗底仍然铺到舞台底，只有文字让开；窄窗档覆盖 `padding` 时必须把 `calc(...)` 原样带过去。
   自检的 `__scenarioE` 会把 inset 设成真机的 88/92（以及窄窗 86、归零）**量**文字行的包围盒。

---

## 降级矩阵

| 条件 | 行为 |
| :--- | :--- |
| `performance` 档 | 半窗 12 → 6、关雾与切片、飞行改直跳、发光关掉、按清单 45fps 限帧 |
| `animations:false` / `env.reducedMotion` | 不做 3D：退化成一列垂直列表（只保留纵向位移），**一帧都不进循环** |
| 窄窗口（< 900px） | 半窗 8、透视与层间距压缩、`rotateY` ×0.4 |
| 无封面 | 用 `ctx.defaultCover`；取色失败就回落到清单配色（画面不受影响） |
| 无歌词 / `showLyrics:false` | 塔体收起、显示空态文案，HUD 仍在 |
| `interactive:false` | 层不可点（`cursor: default` + `pointer-events: none`） |
| 暂停 | 不飞不动；详情页 6 秒后停帧（`data-idle=1`），切后台立即停帧 |
| 频谱拿不到 | 呼吸为 0（塔体静止，不报错） |

---

## 自检

```powershell
# 纯逻辑（39 项：塔体几何 / 可见度 / 窗口 / 飞行 / 逐字档位 / 阻尼相机 / 静态纪律）
node --test "plugins/style/spire/tests/*.test.js"

# 浏览器（自带静态服务 + 假宿主 + 无头 Edge，随机 CDP 端口）
node plugins/style/spire/tests/spire-check.mjs
```

浏览器自检**必须对静态服务跑**，不要对 Vite 跑：Vite 会给模块 URL 加查询串，
`import()` 会拿到第二个空实例（断言全绿看着像没问题，其实测的是另一个模块）。

真机验收（需要 `bin/lmplayer.exe` 与内置 ffmpeg）：

```powershell
node .tmp-skin-live.mjs --skin spire     # 探针按 .tmp-skin-live.mjs 里的 SPECS 适配表驱动
```

---

## 已知限制

- **层数很多的长歌**：卡片池只保留当前行前后各 12 层，超出范围既不建 DOM 也不画 ——
  快速拖动进度条跳很远时，中间那些层不会"飞过去"，而是直接换窗口。
- **半透明大面**：Chromium 在 `preserve-3d` 里叠多层半透明面时排序偶尔会闪，
  所以玻璃板用「不透明感强的底 + 半透明描边」，不叠两层半透明大面。
- **`color-mix()`**：需要 Chromium 111+（WebView2 是常青的，Win10 1809+ 都满足）。
- **没有可变字体**：字号/字距不做可变轴动画，避免首帧跳字与包体积。
