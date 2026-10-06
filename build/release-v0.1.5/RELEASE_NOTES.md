第五个公开版本。这一版**重写了 3D 环绕**（修掉无声与爆音）、给它加上了**绕头旋转的声像轨道**与
**早期反射场**，并把**从存在起就没绿过的 CI 门禁**修到全绿；两份 README 也一并重写。

> 命名：仓库 / 项目全名 **localMusicPlayer**，中文名 **本地音乐播放器**，
> 应用标题与可执行文件是 **LMPlayer** / `lmplayer.exe`。

## 新增

- **声像轨道运动（orbit）**。3D 环绕的声像与反射不再静态加宽，而是**随时间绕着头转**：
  绕一圈 6 秒（上一版 4 秒，实测「转得有一点点快」，放慢 50%），摆动深度 `K = 0.55` ——
  摆到极端时左右耳响度比约 3.4（10.7dB，上一版约 2.6）。反射延迟每耳摆 ±0.6ms，
  两耳时间差因此会**穿过 0**：最强的那个反射真的会从左耳转到右耳。
  `K` 的上限不是听感定的，是**软限幅**定的 —— mid 被推到 `1+K` 倍后再叠加全通注入与混响，
  满幅素材会越过 `softClipThreshold`，输出连续钉死在满幅，那正是「爆音」的形态；
  `TestChainNoClippingAtOrbitPeak` 逐频点扫、把 LFO 相位拨到正峰，看有没有 ≥3 的连续顶格游程。
- **早期反射场（`effects_early.go`）**。环绕档里唯一携带**双耳时间差（ITD）**的环节：
  用 `enableEarly` 布尔标志随 preset 一起固化，不再依赖去相关来推断「空间感」。
  配套测试盯的是「单耳不能被挖空」与「环绕感确实提升」，而不是「有没有变化」。

## 修复

- **3D 环绕在某些输入下无声 / 爆音**。重写立体声环绕链路（`effects_stereo.go` 重写、
  990 行改动），原先的加宽 + 串扰 + Haas 叠加在部分素材上要么整条链路没声音、
  要么叠加后越限削波产生爆音。现在这条链路的每一环增益都有回归测试守着。

## CI

四条门禁（`gofmt` / `go vet` / `go test -race` / `npm run check`）**从存在起就没绿过**，
这一版逐条修到全绿 —— 门禁长期红灯等于没有门禁：

- **后端 job 在 Linux 上根本编不过**：补装 GTK4 / WebKitGTK / X11 / ALSA 系统依赖
  （逐项从依赖源码的 pkg-config 指令核对，不是猜的），`go vet` 与 race 测试才第一次真正执行；
- **剪贴板依赖初始化时 panic**：`libx11-dev` 只给编译期头文件，运行期要真实 display
  → 起 `Xvfb :99` 并导出 `DISPLAY=:99`；
- **前端测试在 bash 上必红**：引号包住的通配符 bash 不展开、Node 20 的 `--test` 也不收路径片段
  → 改成 `tools/run-frontend-tests.mjs` 显式列文件，两个平台行为一致；
- **四条只在 Windows 成立的测试**：断言写死了 `runtime.GOOS`、Windows 路径分隔符与
  排队时序 → 改成断言**安全性质**与平台无关的语义（生产代码没错，错的是测试前提）；
- **一条时序敏感的音频测试**：`settle()` 忙等 300 圈可能不到 1ms，Linux 上 feeder 还没喂进第一块
  数据就判「没声音」→ 改成按真实时间等（5 秒预算）+ 每圈让出 CPU；
- **gofmt 恒红 4 个文件**：1 个 CRLF 残留 + 3 个真实格式差异，只动空白与注释排版，无逻辑变化。

## 文档

- 两份 README **重写**：新增「功能地图」总览表与「更新」章节（检查更新 / 自动检查 / 镜像通道），
  内置播放样式补上第六种「星阵咏唱」，截图改用 `docs/screenshots` 的现行编号，
  中英文互相补上了语言切换链接，目录结构补上 `audioplay/` 与 `update/`。

## 验证

- `wails3 task check:go` 全绿：gofmt、`go vet` 无告警、`go test -race . ./internal/... ./tools/...` 全过；
- `npm run check` 全绿：ESLint 与 `tsc` 干净，前端 206 项测试全部通过；
- 本机 `wails3 task build` 出包（Go 1.27 / Wails v3.0.0-beta.14 / Vite 7.3.6）。

## 下载

| 文件 | 说明 |
| --- | --- |
| `LMPlayer-v0.1.5-windows-x64.exe` | 绿色版，双击运行，不需要安装 |
| `SHA256SUMS.txt` | 上表的 SHA-256 校验值 |

校验：

```powershell
Get-FileHash .\LMPlayer-v0.1.5-windows-x64.exe -Algorithm SHA256
```

## 系统要求

- Windows 10 1809+ / Windows 11（x64）
- [WebView2 运行时](https://developer.microsoft.com/microsoft-edge/webview2/) —— Windows 11 与较新的 Windows 10 已预装

首次运行会在数据目录解包内嵌的 FFmpeg：

```text
%APPDATA%\LocalMusicPlayer\             配置、曲库缓存、歌词与封面缓存
%LOCALAPPDATA%\LocalMusicPlayer\bin\    解包出来的 ffmpeg.exe（可以直接替换）
%TEMP%\LocalMusicPlayer\online\         在线试听的音频缓存（可随时删除）
```

## 从旧版本升级

直接覆盖 `lmplayer.exe` 即可，配置与曲库缓存都在数据目录里，不受影响。
升级后 3D 环绕的听感会明显不同：转得更慢（6 秒一圈）、左右差距更大（10.7dB），
如果你上一版把环绕调到「刚好听得出」，这一版可能会觉得更明显 —— 在底栏「选项」里换档即可。
