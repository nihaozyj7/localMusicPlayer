# 音乐播放器

本地音乐播放器 · **Go + Wails3** · 原生 HTML/CSS/JS（无前端框架、无构建步骤）

当前状态：**界面 + 后端都已实现，可编译运行**。

- 界面：浏览器里就能预览与评审（不需要 Go）
- 后端：扫描 / 文件夹监听 / 过滤 / 元数据 / 封面 / 歌词 / 音频播放 / 配置落盘，见 `docs/04-后端实现说明.md`

---

## 运行应用

```powershell
# 首次构建前先取内置 ffmpeg（约 155MB，只需一次）
node tools/fetch-ffmpeg.mjs

# 构建（会同步前端产物 + 生成绑定 + 编译，带上内置 ffmpeg 约 168MB）
wails3 build
.\bin\musicplayer.exe

# 跑后端测试
go test ./...

# 打包 Windows 安装程序（需要本机安装 NSIS）
wails3 task package
```

首次运行会在 `%APPDATA%\MusicPlayer\` 生成 `config.json` 与 `themes\`（内置主题会同步过去）。
添加音乐文件夹后，扫描与监听都会自动生效。

**ffmpeg 是内置的**：首次启动会把编译进 exe 的 ffmpeg 解包到
`%LOCALAPPDATA%\MusicPlayer\bin\`（约 155MB，按内容哈希命名，只解包一次）。
因此用户机器上不需要预装 ffmpeg；`ape/wma` 等格式能直接播放。
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
- 点「测量全部歌曲」批量分析（后台进行，有进度条，可随时停止）
- 播放某首歌时若还没测过，会自动后台补测，测好立即生效
- 测量结果缓存在 `%APPDATA%\MusicPlayer\loudness-cache.json`，每首歌只测一次

实现要点：

- 用 ffmpeg 的 `loudnorm` 滤镜按 **EBU R128** 测出整合响度（LUFS）与真峰值（dBTP）
- 补偿采用**静态线性增益**（`目标响度 − 实测响度`）而不是动态归一化：
  保留原始动态范围，且结果是个恒定 dB，前端可以用 GainNode 实时套用、切歌零延迟
- **真峰值保护**：增益后真峰值不超过 -1 dBTP，避免抬升导致削波
- 回放链路：`<audio>` → `MediaElementSource` → `GainNode`（用户音量 × 响度补偿）→ 输出

> 跨源细节：打包后前端在 `http://wails.localhost`，音频服务在 `http://127.0.0.1:port`。
> 实测若服务端不给 CORS 头，`<audio>` 仍能出声，但 **Web Audio 会读到纯静音**，
> 响度均衡就完全失效。因此音频服务会回显 `Origin` 并暴露 `Content-Range` 等头，
> 前端 `<audio>` 也固定设置 `crossOrigin="anonymous"`。

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
Taskfile.yml                  构建入口（build / run / package / ffmpeg:fetch / test）
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
  fetch-ffmpeg.mjs            下载内置 ffmpeg（静态构建）
  cdp-check.js                场景化自检（CDP，14 个场景）
  media-check.mjs             跨源播放 / CORS / Web Audio 实测
  probe-audio.mjs             媒体事件细粒度追踪（播放卡住时用）
  realcheck.go                真实曲库全链路验收
  loudcheck.go                真实曲库响度测量验收
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
