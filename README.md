# 音乐播放器

本地音乐播放器 · **Go + Wails3** · 原生 HTML/CSS/JS（无前端框架、无构建步骤）

当前状态：**界面 + 后端都已实现，可编译运行**。

- 界面：浏览器里就能预览与评审（不需要 Go）
- 后端：扫描 / 文件夹监听 / 过滤 / 元数据 / 封面 / 歌词 / 音频播放 / 配置落盘，见 `docs/04-后端实现说明.md`

---

## 运行应用

```powershell
# 首次构建前先编译内置 ffmpeg（精简版约 5.6MB，只需一次，约 3~6 分钟）
# 需要 MinGW-w64（gcc/nasm/mingw32-make）+ 一个 bash（Git for Windows 自带）
node tools/build-ffmpeg.mjs

# 构建（会同步前端产物 + 生成绑定 + 编译，带上内置 ffmpeg 约 18MB）
wails3 build
.\bin\musicplayer.exe

# 跑后端测试
go test ./...

# 看看内置 ffmpeg 的体积/许可证/实际编进去的能力
node tools/build-ffmpeg.mjs --info

# 打包 Windows 安装程序（需要本机安装 NSIS）
wails3 task package
```

首次运行会在 `%APPDATA%\MusicPlayer\` 生成 `config.json` 与 `themes\`（内置主题会同步过去）。
添加音乐文件夹后，扫描与监听都会自动生效。

**ffmpeg 是内置的**：首次启动会把编译进 exe 的 ffmpeg 解包到
`%LOCALAPPDATA%\MusicPlayer\bin\`（约 5.6MB，按内容哈希命名，只解包一次）。
因此用户机器上不需要预装 ffmpeg；`ape/wma/dsf` 等格式能直接播放。
如果本机已装了 ffmpeg 也可以指定：

```powershell
$env:MUSICPLAYER_FFMPEG = "D:\ffmpeg\bin\ffmpeg.exe"   # 优先使用它
$env:MUSICPLAYER_FFMPEG_DIR = "D:\mp-bin"              # 改内置版本的解包位置
```

> 内置的是 GPL 构建版 ffmpeg，许可证随二进制放在
> `internal/ffmpeg/bin/FFMPEG-LICENSE.txt`，再分发时请一并保留。

---

## 响度均衡（音量一致化）

不同来源的音乐响度差得很远。实测你的曲库（53 首 m4a）：

```
实测响度范围: -23.25 ~ -8.51 LUFS  →  相差 14.74 LU
补偿增益范围: +4.67 dB ~ -7.49 dB
```

也就是说切歌时音量可能突然跳 15 dB。开启响度均衡后，每首歌会被补偿到同一个
目标响度（默认 **-16 LUFS**），切换歌曲音量保持稳定。

- 在 **设置 → 响度均衡** 里选择模式：`关闭` / `逐曲均衡` / `同专辑统一`
- **不需要预先扫描**：播到哪首就算哪首，算好的补偿会缓存下来，之后播放零延迟
- 改了 **目标响度** 后旧补偿会自动失效，并按新标准重算
- 「预先把全部歌曲算好」只是可选的批量预热，正常使用不需要点

实现要点：

- 整合响度与真峰值由**纯 Go 实现**的 ITU-R BS.1770-4 / EBU R128 计算
  （K 加权 + 400ms 门限块 + 真峰值 4 倍过采样），与 ffmpeg 的 `loudnorm`
  在真实曲库上平均偏差 0.040 LU、最大 0.066 LU，在标准允差内
- 补偿采用**静态线性增益**（`目标响度 − 实测响度`）而不是动态归一化：
  保留原始动态范围，且结果是个恒定 dB，前端可以用 GainNode 实时套用、切歌零延迟
- **真峰值保护**：增益后真峰值不超过 -1 dBTP，避免抬升导致削波
- 缓存有效性 = 文件未变 && 算法版本未变 && **补偿标准未变**
- 回放链路：`<audio>` → `MediaElementSource` → `GainNode`（用户音量 × 响度补偿）→ 输出

> **音频必须与页面同源。** 实测（Windows 11 + WebView2 152）从
> `http://wails.localhost` 页面加载 `http://127.0.0.1:port` 的媒体会被
> Chromium 直接拒绝：`MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check`，
> 请求连发都不会发出去。因此音频走 Wails 自己的 asset server：
> `http://wails.localhost/audio/<songID>?t=<token>`，
> 由 `main.go` 里的 asset middleware 转发到 `internal/media`。
> 同源后 CORS / `crossorigin` / Web Audio 跨源取数限制都不再是问题。

### 关于内置 ffmpeg 的体积

内置的是**自己编译的精简构建**：只包含本项目真正用到的组件，
单个二进制 5.6MB（对照：第三方通用静态构建 155MB）。
打包产物因此从 **167.6MB 降到 18.0MB**，许可证也从 GPLv3 变成 **LGPL-2.1-or-later**
（编译时没有 `--enable-gpl`/`--enable-nonfree`，而 FFmpeg 的 AAC 解码器与
`loudnorm` 滤镜本身都是 LGPL）。

能力清单是唯一事实来源，写在 `build/ffmpeg/features.env`：
`build-minimal.sh` 照它生成 configure 参数，`--info` 照它核对实际产物，
两边不会漂移。清单是这样的：

| 用途 | 编进去的组件 |
| --- | --- |
| 解码 | aac, alac, ac3, eac3, dca, mp3, flac, vorbis, opus, wmav1/2, wmapro, ape, dsd_*, wavpack, pcm_* |
| 滤镜 | **loudnorm**（EBU R128 测量）、aresample、aformat、anull、volumedetect |
| 编码 | pcm_s16le、flac |
| 封装 | pcm_s16le/pcm_f32le（裸 PCM）、wav、flac、null |
| 协议 | file、pipe |

明确关掉：所有视频编解码器、所有硬件加速、网络、字幕、设备输入输出，
以及全部第三方外部库（x264/x265/libvpx/fdk-aac/opus…）。

重新编译：

```powershell
node tools/build-ffmpeg.mjs            # 已有产物则跳过
node tools/build-ffmpeg.mjs --force    # 强制重新编译
node tools/build-ffmpeg.mjs --download # 只下载解压源码
node tools/build-ffmpeg.mjs --info     # 体积 + 许可证 + 能力清单核对
```

**响度测量已经不再依赖 ffmpeg** —— 那部分改成了纯 Go 实现的 ITU-R BS.1770
（见下一节）。ffmpeg 现在只负责**解码**：

| 用途 | 能否纯 Go | 说明 |
| --- | --- | --- |
| 响度测量（LUFS / 真峰值） | ✅ 已实现 | `internal/loudness/bs1770.go` |
| WAV / FLAC / MP3 / OGG / Opus 解码 | ✅ 有成熟纯 Go 库 | go-audio/wav、mewkiz/flac、hajimehoshi/go-mp3、jfreymuth/oggvorbis、pion/opus |
| **AAC / M4A 解码** | ❌ 没有纯 Go 实现 | 而本机曲库全是 .m4a |
| ape / wma / dsf 转码 | ❌ | 依赖 ffmpeg 的对应解码器 |

所以要彻底去掉 ffmpeg，下一步得走 **Windows Media Foundation**
（系统自带 AAC 解码，COM 调用，不增加分发体积，但是 Windows 专有且实现量大）。

### 标题栏拖动（Wails v3 的写法）

v3 不再读 `-webkit-app-region`，而是读 CSS 自定义属性：

```css
.titlebar        { --wails-draggable: drag; }
.titlebar__btn   { --wails-draggable: no-drag; }
```

运行时判定是 `getComputedStyle(el).getPropertyValue("--wails-draggable").trim() === "drag"`，
所以按钮区域必须显式 `no-drag`，否则点击会变成拖窗口。

### 播放排查工具

```powershell
# 在真实应用里点歌播放并确认 currentTime 真的在推进、无解码错误
node tools/playtest.mjs --exe bin/musicplayer.exe --query "星月神话"

# 验证「按需响度补偿」：播放时算出来、进入增益表、改标准后失效
node tools/loudtest.mjs --exe bin/musicplayer.exe

# 核对标题栏拖拽的 CSS 契约（是否 drag / no-drag）
node tools/tiltest.mjs --exe bin/musicplayer.exe

# 纯 Go 响度算法 vs ffmpeg loudnorm 的逐首对比
go run tools/loudcompare.go "C:\Users\Example\Music" 8

# 接入真实 WebView2，抓页面报错 + 网络事件（定位「请求有没有发出去」）
node tools/netprobe.mjs

# 跨源播放 / CORS / Web Audio 实测（独立端口模式）
$env:MP_AUDIO_URL="http://127.0.0.1:PORT/audio/ID?t=TOKEN"; node tools/media-check.mjs

# 起点地址空间矩阵测试：哪些「页面源 × 音频地址」组合会被允许
node tools/origin-check.mjs
```

要在真实应用里开 DevTools 远程调试，设置环境变量后启动即可：

```powershell
$env:MUSICPLAYER_DEBUG_PORT = "9333"
.\bin\musicplayer.exe
# 然后浏览器打开 http://127.0.0.1:9333/json
```

---

## 只预览界面（不需要编译 Go）

```powershell
node tools/dev-server.js 5173
# 浏览器打开 http://127.0.0.1:5173/
```

预览用假数据渲染，改 CSS / JS 后刷新页面即可。预览服务器同时也提供
`/bindings/*`（生成的前端绑定）与 `/wails/runtime.js` 桩，
因此 `bridge.js` 的降级逻辑和打包后完全一致。

### 用 URL 参数定格任意界面状态

| 参数 | 作用 | 示例 |
| --- | --- | --- |
| `theme` | 指定主题 | `?theme=light-minimal` |
| `tab` | 主界面选项卡 | `?tab=queue` / `?tab=playlist` / `?tab=settings` |
| `view` + `pv` | 直接打开播放界面并指定样式 | `?view=player&pv=immersive` |
| `playing` / `pos` | 定格在播放中的某一秒 | `?playing=1&pos=62000` |
| `query` | 预置搜索词 | `?query=陈默` |
| `probe` | 输出界面自检报告（见下） | `?probe=1` |

---

## 界面自检（无头浏览器）

两套工具，都不需要额外依赖（用系统自带 Edge）：

```powershell
# 1) 逐场景检查：console 报错 + 布局体检（固定区域尺寸、横向溢出、对比度、毛玻璃是否生效）
node tools/cdp-check.js

# 2) 批量截图到 docs/screenshots（用于设计评审）
& .\tools\screenshots.ps1
```

`cdp-check.js` 当前覆盖 12 个场景（深/浅主题、队列、歌单、设置、播放界面三种样式、封面取色主题、搜索、扫描遮罩），全部通过为退出码 0。

---

## 目录结构

```
main.go                       应用入口：装配配置 / 主题 / 曲库 / 音频服务 / 响度 / 窗口
services.go                   8 个 Wails 服务（前端调用的接口层）
internal/
  bootstrap/                  数据模型、配置读写、稳定 id
  filter/                     过滤规则引擎（与前端语义一致）
  library/                    扫描、元数据缓存、增量重扫、fsnotify 监听
  meta/                       标签与封面解析、各格式时长解析
  lyrics/                     .lrc 与内嵌歌词
  ffmpeg/                     ffmpeg 定位与内置二进制解包（bin/ 不入库）
  loudness/                   EBU R128 响度测量与补偿增益计算
  media/                      本地音频 HTTP 服务（CORS / Range / 转码缓存）
  theme/                      主题目录扫描（内置主题随二进制分发）
build/                        Wails 构建脚手架（Taskfile / 图标 / NSIS 脚本）
Taskfile.yml                  构建入口（build / run / package / ffmpeg:build / test）
docs/                         需求原文、界面设计、技术方案、后端实现说明、截图
frontend/
  bindings/                   ★ wails3 生成的前端绑定（可重新生成）
  dist/                       ★ 构建产物：前端同步结果 + 绑定的副本（go:embed 对象）
  src/
    index.html                唯一页面（无内联样式，图标用 SVG sprite）
    styles/
      index.css               唯一样式入口（@import 顺序固定）
      base.css                复位 / 字体 / 滚动条 / 关键帧
      tokens.css              设计令牌默认值
      utilities.css           极少量原子类
      themes/                 ★ 一个主题一个文件，只声明令牌
        dark-minimal.css  light-minimal.css  cover-dark.css  _template.css
      components/             组件样式（只用 var(--…)，无硬编码颜色）
    js/
      main.js                 入口与装配、快捷键、预览参数
      bridge.js               前端 ↔ Go 桥（浏览器下自动降级假数据）
      store.js                状态 + 过滤引擎 + 持久化 + 配置同步
      audio.js                真实播放（对接本地音频服务，驱动进度条）
      shell.js                侧边栏 / 头部工具条 / 内容区路由
      tracks.js               曲目表格（爱心、右键菜单、拖拽排序）
      playerbar.js            底部常驻播放控件
      playerview.js           播放界面 经典 / 沉浸 / 简约
      settings.js             设置界面
      theme.js / runtime-tokens.js  主题解析与运行时令牌覆盖
      slider.js dom.js playlists.js utils.js mock.js probe.js
tools/
  dev-server.js               零依赖静态预览服务器（含绑定与 runtime 桩）
  build-frontend.mjs          同步前端产物 + 内置主题 + 绑定
  build-ffmpeg.mjs            从源码编译精简 ffmpeg（含 --info 能力核对）
  cdp-check.js                场景化自检（CDP，14 个场景）
  e2e.mjs                     打包产物的端到端验收（渲染 / 播放 / 响度 / ffmpeg）
  playtest.mjs                真实应用里点歌播放并确认真的在出声
  loudtest.mjs                真实应用里验证按需响度补偿与改标准失效
  transcodetest.mjs           真实应用里验证转码播放链路
  loudprobe.mjs               定位「按需响度没算出来」卡在哪一环
  tiltest.mjs                 核对标题栏拖拽的 CSS 契约
  netprobe.mjs                接入真实 WebView2 抓报错与网络事件
  appinspect.mjs              接入真实应用读取页面状态 / DOM / 控制台
  origin-check.mjs            地址空间矩阵测试（哪种跨源组合会被允许）
  media-check.mjs             跨源播放 / CORS / Web Audio 实测
  probe-audio.mjs             媒体事件细粒度追踪（播放卡住时用）
  mincheck.go                 三条 ffmpeg 调用路径的能力自检
  realcheck.go                真实曲库全链路验收
  loudcheck.go                真实曲库响度测量验收
  loudcompare.go              纯 Go 响度算法 vs ffmpeg loudnorm 逐首对比
  screenshots.ps1             批量截图
  ui-probe.ps1                探针的 PowerShell 版（备用）
```

---

## 需求实现状态

图例：✅ 已完成 ｜ ⏳ 部分/后续

### 设置界面
| 需求 | 状态 |
| --- | --- |
| 添加多个本地音乐路径 | ✅ 系统目录选择器 + 去重 + 可访问性校验 |
| 监听文件夹自动更新歌曲 | ✅ fsnotify 递归监听 + 500ms 防抖 + 增量重扫 |
| 按文件大小过滤 | ✅ 规则编辑 + 实时预览统计，前后端语义一致 |
| 按正则表达式过滤 | ✅ 同时匹配路径与文件名，非法正则会标红 |
| 深色 / 浅色主题 | ✅ 三套内置主题 + 跟随系统，配置落盘 |
| 毛玻璃拟态风格 | ✅ 令牌化（模糊半径、透明度、边框高光、阴影） |
| 布局固定、样式全在 CSS | ✅ HTML 零内联样式，组件 CSS 只用令牌 |
| 用户自行添加主题 CSS | ✅ 主题目录扫描，丢文件即出现在设置界面 |

### 主界面
| 需求 | 状态 |
| --- | --- |
| [所有歌曲] 列表 | ✅ 真实元数据（标题/歌手/专辑/时长/内嵌封面） |
| [所有歌曲] 重新扫描按钮 | ✅ 异步扫描 + 进度事件 + 结果 Toast |
| [播放列表] 显示当前播放队列 | ✅ |
| [播放列表] 拖拽排序 | ✅ 即时生效并持久化到后端 |
| [播放列表] 移除歌曲 | ✅ |
| [歌单] 默认「我喜欢」不可删除 | ✅ 后端直接拒绝重命名/删除 |
| [所有歌曲] 每首歌爱心按钮 | ✅ 状态回显 + 可取消，落盘 |
| [歌单] 用户创建自定义歌单 | ✅ 新建 / 重命名 / 删除 / 拖拽排序 / 导出 m3u |
| 底部常驻播放控件 | ✅ 封面、进度条（可拖+时间气泡）、音量、上一曲/下一曲、播放暂停、循环方式、歌词开关、全屏 |

### 播放界面
| 需求 | 状态 |
| --- | --- |
| 三种样式可切换 | ✅ 经典 / 沉浸 / 简约 |
| [经典] 圆形旋转唱片 + 右侧歌词 | ✅ 暂停时停止旋转 |
| [沉浸] 封面铺满 + 毛玻璃 + 中间歌词 | ✅ |
| [简约] 无封面 + 中间歌词 | ✅ |
| 下方常驻播放控件 | ✅ 与主界面共用同一个控件 |

### 播放与歌词
| 需求 | 状态 |
| --- | --- |
| 真实播放 | ✅ 本地音频服务（127.0.0.1 + token），原生格式支持 Range 精确 seek |
| ape / wma 等格式 | ✅ 内置 ffmpeg 转码（首次启动解包，用户无需安装） |
| 转码缓存 | ✅ 转成 WAV 落盘后按文件提供，长度准确、支持字节级 seek，LRU 上限 600MB |
| 响度测量与补偿 | ✅ EBU R128（loudnorm）+ 静态增益 + 真峰值保护，逐曲/同专辑两种模式 |
| 歌词 | ✅ 同名 `.lrc`（含 `song.zh.lrc`）→ 音频内嵌歌词，按设置顺序 |
| 进度条真实进度 | ✅ 由 `<audio>` 事件驱动（预览下仍是模拟时钟） |
| 在线歌词匹配 | ⏳ 预留开关位，未实现 |

---

## 设计约束（改代码时请遵守）

1. **HTML 里不写样式**：不加 `style="…"`、不加 `<style>` 内容；类名走 `styles/components/`。
2. **组件 CSS 不写颜色字面量**：一律 `var(--token)`，颜色只在 `tokens.css` 与 `themes/*.css` 出现。
3. **主题文件只声明令牌**：写选择器/组件样式会破坏「布局固定」这一需求。
4. **布局关键尺寸全部令牌化**：`--h-titlebar` / `--w-sidebar` / `--h-playerbar` / `--h-header` / `--row-h`。
5. **动态样式用 CSSOM**：运行时改主题相关变量请用 `runtime-tokens.js` 的 `setRuntimeToken()`，不要直接写 `element.style.setProperty("--x", …)`（会被 CSP 判为内联样式）。
6. **`StableID` 两端必须一致**：Go 的 `bootstrap.StableID` 与前端 `utils.js#stableId` 有测试逐条比对，改成不一致会让歌单/收藏/队列在重扫后集体失效。

---

## 下一步（可选）

1. 你评审界面与样式，提修改意见（视觉改动都在 `frontend/src/styles/`）。
2. 用真实曲库跑一遍：加文件夹 → 看扫描结果与元数据 → 试 ape/wma 转码播放。
3. 待定的增强项（见 `docs/04-后端实现说明.md` §7）：
   在线歌词匹配、m3u 导入、系统媒体控制（媒体键 / SMTC）、频谱可视化、NSIS 安装包。
4. `mock.js` 与 `probe.js` 是预览与自检专用，可以一直保留（打包后不产生副作用）。
