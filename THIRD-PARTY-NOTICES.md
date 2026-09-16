# Third-Party Notices / 第三方许可证声明

本项目（localMusicPlayer / 本地音乐播放器）以 **Apache License 2.0** 发布（见 [LICENSE](LICENSE)）。
下面的内容说明**随程序一起分发**的第三方组件、它们各自的许可证，以及必须一并保留的版权声明。

> 这份清单与「设置 → 关于 → 开源依赖」里展示的是同一份数据（源文件 `frontend/src/js/about-info.js`）。
> 增删依赖时请同步更新两处；`frontend/tests/about.test.js` 会对结构做校验。

---

## 1. 总览

| 组件 | 版本 | 许可证 | 用途 |
| --- | --- | --- | --- |
| [Wails](https://github.com/wailsapp/wails) | v3.0.0-beta.14 | MIT | 桌面外壳与 Go ↔ JS 桥 |
| [dhowden/tag](https://github.com/dhowden/tag) | 2024-04-17 | BSD-2-Clause | mp3 / m4a / flac / ogg 标签解析 |
| [fsnotify/fsnotify](https://github.com/fsnotify/fsnotify) | 1.9.0 | BSD-3-Clause | 音乐文件夹的实时监听 |
| [Lit](https://github.com/lit/lit) | 3.3.3 | BSD-3-Clause | 前端视图层 |
| [SortableJS](https://github.com/SortableJS/Sortable) | 1.15.7 | MIT | 播放队列与歌单的拖拽排序 |
| [coder/websocket](https://github.com/coder/websocket) | 1.8.14 | ISC | Wails 的 WebSocket 传输（间接依赖） |
| [go-ole/go-ole](https://github.com/go-ole/go-ole) | 1.3.0 | MIT | Windows COM 绑定（间接依赖） |
| [godbus/dbus](https://github.com/godbus/dbus) | 5.2.2 | BSD-2-Clause | Linux 桌面集成（间接依赖） |
| [jchv/go-winloader](https://github.com/jchv/go-winloader) | 2025-04-06 | ISC | Windows 依赖加载（间接依赖） |
| [adrg/xdg](https://github.com/adrg/xdg) | 0.5.3 | MIT | 跨平台标准目录（间接依赖） |
| [mattn/go-colorable](https://github.com/mattn/go-colorable) | 0.1.14 | MIT | Windows 控制台彩色输出（间接依赖） |
| [mattn/go-isatty](https://github.com/mattn/go-isatty) | 0.0.20 | MIT | 判断 stdout 是否为终端（间接依赖） |
| [golang.org/x/sys](https://pkg.go.dev/golang.org/x/sys) | 0.46.0 | BSD-3-Clause | Go 官方系统调用扩展（间接依赖） |
| [FFmpeg](https://ffmpeg.org/) | 8.1.2（自行编译） | LGPL-2.1-or-later | 音频解码 / 转码 / loudnorm |

构建期工具（ESLint、Prettier、TypeScript、Vite、Rollup、esbuild 等）不随产物分发，
因此不在此声明；它们各自的许可证见 `node_modules`。

---

## 2. 许可证全文

### MIT License

适用于：Wails、go-ole/go-ole、adrg/xdg、mattn/go-colorable、mattn/go-isatty、SortableJS。

```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### BSD 2-Clause License

适用于：dhowden/tag、godbus/dbus。

```text
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### BSD 3-Clause License

适用于：fsnotify/fsnotify、Lit、golang.org/x/sys。

```text
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### ISC License

适用于：coder/websocket、jchv/go-winloader。

```text
Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

---

## 3. 各组件版权声明

```text
Wails                     Copyright (c) 2018-Present Lea Anthony
dhowden/tag               Copyright 2015, David Howden
fsnotify/fsnotify         Copyright (c) 2012 The Go Authors. All rights reserved.
                          Copyright (c) fsnotify Authors. All rights reserved.
Lit                       Copyright (c) 2017 Google LLC. All rights reserved.
SortableJS                Copyright (c) 2019 All contributors to Sortable
coder/websocket           Copyright (c) 2025 Coder
go-ole/go-ole             Copyright (c) 2013-2017 Yasuhiro Matsumoto
godbus/dbus               Copyright (c) 2013, Georg Reinke, Google
jchv/go-winloader         Copyright (c) 2021, John Chadwick
adrg/xdg                  Copyright (c) 2014 Adrian-George Bostan
mattn/go-colorable        Copyright (c) 2016 Yasuhiro Matsumoto
mattn/go-isatty           Copyright (c) Yasuhiro MATSUMOTO
golang.org/x/sys          Copyright 2009 The Go Authors.
```

---

## 4. FFmpeg（内嵌二进制）

程序内嵌一份 **自行从官方源码编译的精简 FFmpeg 8.1.2**，用于解码 WebView 无法播放的音频格式、
把音频转成 PCM/WAV，以及通过 `loudnorm` 滤镜做 EBU R128 响度测量。

- 来源：<https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz>
- 编译脚本：`build/ffmpeg/build-minimal.sh`（入口 `node tools/build-ffmpeg.mjs`，可完整复现）
- 许可证：**LGPL-2.1-or-later** —— 编译时未启用 `--enable-gpl`，也未启用 `--enable-nonfree`
- 分发方式：以**独立可执行文件**形式随应用解包到用户数据目录，用户可以直接替换，
  满足 LGPL 对「允许用户替换库」的要求
- 本项目**未修改** FFmpeg 源码

完整的组件清单与许可证分析见 [`internal/ffmpeg/bin/FFMPEG-LICENSE.txt`](internal/ffmpeg/bin/FFMPEG-LICENSE.txt)，
FFmpeg 官方的许可说明见 <https://ffmpeg.org/legal.html>。

---

## 5. 在线数据来源

下面这些是程序**调用**的第三方公开服务，不是随包分发的代码，版权归各自权利人所有：

| 服务 | 用途 |
| --- | --- |
| [LRCLIB](https://lrclib.net/) | 歌词 |
| [网易云音乐](https://music.163.com/) | 歌词 / 封面备选来源 |
| [QQ 音乐](https://y.qq.com/) | 歌词 / 封面备选来源 |
| [iTunes Search API](https://performance-partners.apple.com/search-api) | 封面 |
| [Deezer](https://developers.deezer.com/api) | 封面备选来源 |
| [MusicBrainz](https://musicbrainz.org/) | 封面（配合 Cover Art Archive） |
| [哔哩哔哩](https://www.bilibili.com/) | 在线试听与下载 |

各服务的名称与商标归各自所有者。本项目与上述任何平台均无隶属或背书关系。
