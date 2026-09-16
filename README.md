<div align="center">

# 音乐播放器 · MusicPlayer

**本地曲库 + 在线试听的桌面音乐播放器**

Go · Wails v3 · Lit 3 · Vite · FFmpeg

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/nihaozyj7/MusicPlayer?include_prereleases&sort=semver)](https://github.com/nihaozyj7/MusicPlayer/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-0078d4.svg)](#系统要求)
[![Made with Wails](https://img.shields.io/badge/made%20with-Wails%20v3-DF0000.svg)](https://v3.wails.io/)

[功能](#功能) · [截图](#截图) · [下载](#下载) · [开发](#开发) · [技术栈](#技术栈) · [开源与致谢](#开源与致谢)

</div>

---

## 这是什么

一个**只做本地音乐**的桌面播放器：把散落在硬盘上的音乐文件夹交给它，它会扫描、解析标签与封面、
监听文件变化，然后把界面做得像样一点。

它同时带一点在线能力（搜索、试听、下载、封面与歌词自动匹配），但**所有在线功能都是可选的**：
不联网时它就是一个完全离线的本地播放器，曲库、封面、歌词缓存全部在你自己机器的磁盘上。

- **不需要安装浏览器内核**：界面跑在 Windows 自带的 WebView2 上；
- **不需要预先装 FFmpeg**：程序内嵌一份自行编译的 5.6MB 精简版，用来放 `ape` / `wma` / `dsf` 这些
  WebView 放不了的格式；
- **播放界面是可扩展的样式包**：六种内置样式，还能把第三方样式放进数据目录加载。

---

## 功能

### 曲库

- **多文件夹 + 实时监听**：`fsnotify` 递归监听，新增 / 删除 / 重命名文件后自动增量重扫；
- **过滤规则**：按文件大小、按正则表达式（同时匹配路径与文件名）过滤，编辑时实时预览会滤掉多少；
- **元数据解析**：读取 mp3 / m4a / flac / ogg 的标签与**多张内嵌封面**；
- **稳定 ID**：同一路径永远得到同一个 id，重扫后歌单 / 收藏 / 队列不会失效。

### 播放

- 本地音频 HTTP 服务（`127.0.0.1` + token），原生格式支持字节级 `Range` 精确 seek；
- 内置 FFmpeg 转码，`ape` / `wma` / `dsf` 等格式转成 PCM/WAV 后播放，转码结果按文件缓存；
- **响度均衡**：EBU R128（`loudnorm`）测量 + 回放增益补偿，支持逐曲或同专辑统一；
- 播放队列拖拽排序、歌单、我喜欢、定时停止、可自定义的快捷键；
- 无边框窗口 + 系统原生材质（Mica / Acrylic）+ 圆角 + 最小化到托盘。

### 封面

- 一首歌可以有多张封面：缓存里的（可增删 / 切换 / 轮播）与文件内嵌的（只读展示）分开管理；
- 联网匹配聚合 iTunes / 网易云音乐 / QQ 音乐 / Deezer / MusicBrainz 五个来源；
- 匹配结果可以一次性写回歌曲文件（m4a 的多个 `covr`、flac 的多个 `PICTURE`），写盘走「临时文件 + 原子改名」。

### 歌词

- 四级回退：文件内嵌 → 同目录 `.lrc` → 程序缓存 → 在线自动匹配（LRCLIB / 网易云 / QQ 音乐）；
- **歌词工作台**：在线匹配 / 整首微调（±10s）/ 手动打轴（一边播放一边按空格）；
- **桌面歌词**：独立的透明置顶窗口，鼠标移入才变成「正常窗口」并浮出样式下拉，位置会被记住；
- **桌面背景歌词**：铺满桌面、垫在桌面图标之下（与桌面歌词二选一）。

### 界面

- **主题**：内置深色极简 / 浅色极简 / 封面取色，支持放一份 CSS 自定义主题；
- **播放界面样式包（皮肤）**：经典 / 沉浸 / 简约 / 逐字入场 / 卡拉OK / 运镜特效等六种内置样式，
  第三方样式包放进数据目录即可加载，接口契约见 [`packages/player-skins`](frontend/packages/player-skins)；
- 列表密度、列显示、动画速度等都可以调；关闭动画时全部动效统一归零。

### 在线与 AI

- 在线搜索 → 试听 → 下载到本地（下载目录可配置、可迁移，下载完自动入库）；
- **AI 元数据清洗**（可选）：填一个 OpenAI 兼容接口，自动匹配前先用 AI 从脏文件名里还原标题 / 歌手。

---

## 截图

| 主界面 | 沉浸播放 |
| --- | --- |
| ![主界面](docs/screenshots/01-main-dark.png) | ![沉浸播放](docs/screenshots/08-player-immersive.png) |

| 浅色主题 | 设置 |
| --- | --- |
| ![浅色主题](docs/screenshots/02-main-light.png) | ![设置](docs/screenshots/05-settings-folders.png) |

更多截图（播放样式、歌单、封面面板等）见 [`docs/screenshots`](docs/screenshots)。

---

## 下载

到 [Releases](https://github.com/nihaozyj7/MusicPlayer/releases) 下载最新的 `musicplayer.exe`，
双击即可运行，**不需要安装**（绿色版）。

首次运行时程序会在数据目录解包内嵌的 FFmpeg：

```text
%APPDATA%\MusicPlayer\         配置、曲库缓存、歌词与封面缓存
%LOCALAPPDATA%\MusicPlayer\bin\  解包出来的 ffmpeg.exe（可以直接替换）
```

### 系统要求

- Windows 10 1809+ / Windows 11（x64）
- [WebView2 运行时](https://developer.microsoft.com/microsoft-edge/webview2/) —— Windows 11 与较新的
  Windows 10 已预装；没有的话装一次 Evergreen Runtime 即可

> 目前只在 Windows 上验证过。代码里保留了 macOS / Linux 的分支（数据目录、原生材质、托盘等），
> 但没有实际验证与 CI 覆盖，欢迎补充。

---

## 开发

### 需要什么

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| [Go](https://go.dev/) | 1.25+ | 后端 |
| [Node.js](https://nodejs.org/) | ≥ 20.19 | 前端构建与检查 |
| [Wails v3 CLI](https://v3.wails.io/) | `v3.0.0-beta.14` | `go install github.com/wailsapp/wails/v3/cmd/wails3@latest` |
| [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) | — | 运行应用时用 |
| MinGW-w64 | — | **只有**要重新编译内置 FFmpeg 时才需要 |

### 只改界面（不需要 Go）

```powershell
npm install
npm run dev        # Vite 开发服务器（HMR），默认 http://127.0.0.1:5173/
```

浏览器预览用假数据渲染，改 CSS / JS 后刷新即可。`npm run dev:static` 是不依赖 `node_modules` 的
静态预览（自检脚本用这个）。

### 跑起来

```powershell
npm install
wails3 task run    # 构建前端 → 生成绑定 → go build → 直接运行
```

### 打包

```powershell
wails3 task build     # 只出 exe，产物在 bin/
wails3 task package   # 出 Windows 安装包（NSIS）
```

### 检查

```powershell
npm run check              # ESLint + tsc 类型检查 + node:test 单测
wails3 task test           # Go 单元测试
wails3 task check:go       # gofmt + go vet + go test -race
wails3 task ffmpeg:info    # 查看内嵌 ffmpeg 的体积 / 许可证 / 能力清单
```

`tools/` 下还有一批无头浏览器自检脚本（CDP 驱动 Edge），用来验证真实交互而不是「元素存在」：

```powershell
node tools/dev-server.js 5173   # 另开一个终端起着
node tools/cdp-check.js         # 14 个场景的布局与 console 报错检查
node tools/hitcheck.mjs         # 用真实鼠标坐标做命中测试（能抓到「弹层透明但吃了点击」这类 bug）
```

完整的工具清单与开发约定见 [`docs/19-开发说明.md`](docs/19-开发说明.md)。

---

## 技术栈

| 层级 | 用了什么 |
| --- | --- |
| 后端 | Go 1.25 —— 目录扫描、标签解析、音频 HTTP 服务、响度测量、在线接口聚合 |
| 桌面外壳 | Wails v3（Go ↔ WebView 桥、无边框窗口、托盘、单实例、系统文件对话框） |
| 渲染引擎 | WebView2（系统自带，不内嵌浏览器内核） |
| 前端视图层 | Lit 3（自定义元素，light DOM；只负责模板与增量 diff，样式仍是全局 CSS） |
| 前端工程 | 原生 ES Module + Vite 7 + npm workspaces + ESLint / Prettier / TypeScript(JSDoc) |
| 音频 | 内嵌自编译 FFmpeg 8.1.2（LGPL-2.1+）+ 自实现的 EBU R128 响度补偿 |

### 目录结构

```text
main.go                  应用入口：装配配置 / 主题 / 曲库 / 音频服务 / 窗口 / 托盘
services*.go             Go 侧服务（绑定给前端的接口）
internal/
  bootstrap/             数据模型、配置读写、稳定 id、扫描根计算
  library/               扫描、元数据缓存、增量重扫、fsnotify 监听
  meta/  lyrics/         标签、封面、歌词解析
  media/                 本地音频 HTTP 服务（CORS / Range / 转码缓存）
  loudness/              EBU R128 响度测量与补偿增益
  ffmpeg/                内嵌 ffmpeg 的定位与解包（bin/ 不入库）
  coverfetch/ lyricsfetch/ bilibili/   三个随时会变的第三方接口，各自独立成包
  metacache/ skins/ theme/             多封面缓存写回、样式包、主题目录
frontend/
  src/                   页面（Lit 组件 + 全局 CSS，无 JSX / 无 TS 源码）
  packages/player-skins/ 播放界面样式包（第三方可扩展的契约在这里）
  bindings/              wails3 生成的 Go 绑定（可重新生成）
  dist/                  Vite 产物，被 go:embed 打进 exe
build/                   Wails 打包脚手架与精简 ffmpeg 的编译脚本
tools/                   构建脚本 + 无头浏览器自检脚本
docs/                    设计、审查与实现文档
```

### 几条刻意的取舍

- **源码是原生 JS**：打包器只负责依赖解析与产物哈希，不引入 JSX / TS。需要类型的地方用 JSDoc，
  `tsc --checkJs` 吃得到，保持「打开文件就能读」。
- **样式是全局 class，不是 Shadow DOM**：主题 CSS、样式包、自检脚本都按 `#id` / `.class` 查询，
  它们**是对外契约**。Lit 在这里只负责模板与增量更新。
- **依赖第三方网络的代码各自独立成包**：`internal/bilibili` / `lyricsfetch` / `coverfetch` 接口随时会变，
  隔离之后失效范围只有一个文件。
- **写用户文件的代码只做最小插入**：往 m4a / flac 里加封面时不改动音频数据、不改动任何偏移，
  写盘一律「临时文件 + 原子改名」。

---

## 开源与致谢

### 许可证

本项目以 **Apache License 2.0** 开源，全文见 [`LICENSE`](LICENSE)。

```text
Copyright 2026 The MusicPlayer Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```

你可以自由使用、修改、分发（包括商用），需要保留版权与许可声明，并说明你改了什么。

### 第三方组件

程序里分发了一部分第三方代码与二进制，它们的许可证与版权声明见：

- [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) —— 全部依赖、版本、许可证与版权行；
- [`NOTICE`](NOTICE) —— Apache-2.0 要求的声明文件；
- [`internal/ffmpeg/bin/FFMPEG-LICENSE.txt`](internal/ffmpeg/bin/FFMPEG-LICENSE.txt) —— 内嵌 FFmpeg 的来源、
  编译选项与 LGPL 结论。

界面里的「设置 → 关于」会把同一份清单直接展示出来（数据源在 `frontend/src/js/about-info.js`）。

### 数据来源

在线能力调用了下面这些公开服务，版权归各自权利人所有，本项目与它们没有隶属或背书关系：

[LRCLIB](https://lrclib.net/) · [网易云音乐](https://music.163.com/) · [QQ 音乐](https://y.qq.com/) ·
[iTunes Search API](https://performance-partners.apple.com/search-api) · [Deezer](https://developers.deezer.com/api) ·
[MusicBrainz](https://musicbrainz.org/) · [哔哩哔哩](https://www.bilibili.com/)

### 致谢

感谢 [Go](https://go.dev/)、[Wails](https://v3.wails.io/)、[Lit](https://lit.dev/)、[Vite](https://vite.dev/)、
[FFmpeg](https://ffmpeg.org/) 以及 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) 里列出的每一个库 —— 
没有它们，这个播放器不会存在。

也感谢上面那些数据服务的提供方，以及每一位提反馈的人：界面细节、格式兼容性、性能问题的每一条
都直接变成了代码里的修复。

### 免责声明

- 本软件只做**本地音乐的整理与播放**，不提供、不存储、不分发任何音乐内容；
- 在线搜索 / 试听 / 下载依赖第三方公开接口，可用性与内容由对应平台决定；
- 自动匹配的封面与歌词来自公开曲库，**不保证与歌曲完全对应**，请自行核对后再写回文件。

---

<div align="center">

如果这个项目对你有用，欢迎 Star ⭐ 或提 Issue。

</div>
