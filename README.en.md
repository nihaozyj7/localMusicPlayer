<div align="center">

# localMusicPlayer

**LMPlayer** — a desktop music player for your local library, with optional online search

Go · Wails v3 · Lit 3 · Vite · FFmpeg

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/nihaozyj7/localMusicPlayer?include_prereleases&sort=semver)](https://github.com/nihaozyj7/localMusicPlayer/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-0078d4.svg)](#requirements)
[![Made with Wails](https://img.shields.io/badge/made%20with-Wails%20v3-DF0000.svg)](https://v3.wails.io/)

[Features](#features) · [Screenshots](#screenshots) · [Download](#download) · [Development](#development) · [Tech stack](#tech-stack) · [License & credits](#license--credits)

[简体中文](README.md) · **English**

</div>

---

## What is this

> Names: the project / repository is **localMusicPlayer**, the Chinese display name is **本地音乐播放器**,
> and the app title / executable is **LMPlayer** / `lmplayer.exe`.

A desktop player that does **local music only**: point it at the music folders scattered across your
drives and it will scan them, parse tags and cover art, watch for file changes, and try to look decent
while doing it.

It also ships some online capabilities (search, preview, download, automatic cover and lyric matching),
but **every online feature is optional**: offline, it is a completely self-contained player — your
library, cover art and lyric cache all live on your own disk.

- **No bundled browser engine**: the UI runs on the WebView2 that ships with Windows;
- **No FFmpeg install required**: a self-compiled 5.6 MB minimal build is embedded in the executable,
  so `ape` / `wma` / `dsf` files play even though the WebView cannot decode them;
- **The player view is an extensible skin pack**: six built-in styles, plus drop-in third-party packs.

---

## Features

### Library

- **Multiple folders + live watching**: recursive `fsnotify` watching, with incremental rescans after
  files are added, removed or renamed;
- **Filter rules**: filter by file size or by regular expression (matched against both path and file name),
  with a live preview of how many files a rule would drop;
- **Metadata parsing**: tags and **multiple embedded cover images** from mp3 / m4a / flac / ogg;
- **Stable IDs**: the same path always yields the same id, so playlists, likes and the queue survive a rescan.

### Playback

- A local audio HTTP server (`127.0.0.1` + token); native formats support byte-exact `Range` seeking;
- Built-in FFmpeg transcoding: `ape` / `wma` / `dsf` and friends are transcoded to PCM/WAV, cached per file;
- **Loudness normalisation**: EBU R128 (`loudnorm`) measurement plus replay-gain compensation, per track
  or per album;
- Drag-and-drop queue reordering, playlists, likes, a sleep timer and configurable keyboard shortcuts;
- Frameless window with native materials (Mica / Acrylic), rounded corners and minimise-to-tray.

### Cover art

- A track can have several covers: cached ones (add / remove / switch / slideshow) and embedded ones
  (read-only) are managed separately;
- Online matching aggregates five sources: iTunes, NetEase Cloud Music, QQ Music, Deezer and MusicBrainz;
- Results can be written back into the audio file in one go (multiple `covr` atoms for m4a, multiple
  `PICTURE` blocks for flac), always via "temp file + atomic rename".

### Lyrics

- A four-level fallback chain: embedded → sibling `.lrc` → app cache → automatic online match
  (LRCLIB / NetEase / QQ Music);
- **Lyrics workbench**: online matching, whole-song nudging (±10s), and manual timing (tap space while playing);
- **Desktop lyrics**: a separate transparent, always-on-top window that only becomes a "normal window"
  with a style dropdown when the mouse enters; its position is remembered;
- **Wallpaper lyrics**: a full-screen layer that sits under the desktop icons (mutually exclusive with
  desktop lyrics).

### Interface

- **Themes**: dark minimal / light minimal / cover-derived accent, plus custom themes as a single CSS file;
- **Player skins**: classic / immersive / minimal / per-character entry / karaoke / camera-FX — six built-in
  styles. Third-party packs are loaded from the data directory; the contract lives in
  [`packages/player-skins`](frontend/packages/player-skins);
- List density, visible columns and animation speed are all configurable; turning animations off zeroes out
  every transition at once.

### Online & AI

- Search → preview → download to your machine (the download folder is configurable and migratable, and
  finished downloads are added to the library automatically);
- **AI metadata cleanup** (optional): point it at any OpenAI-compatible endpoint and it will recover the
  real title / artist from messy file names before online matching runs.

---

## Screenshots

| Main view | Immersive player |
| --- | --- |
| ![Main view](docs/screenshots/01-main-dark.png) | ![Immersive player](docs/screenshots/08-player-immersive.png) |

| Light theme | Settings |
| --- | --- |
| ![Light theme](docs/screenshots/02-main-light.png) | ![Settings](docs/screenshots/05-settings-folders.png) |

More screenshots (player skins, playlists, cover panel, …) are in [`docs/screenshots`](docs/screenshots).

---

## Download

Grab the latest `lmplayer.exe` from [Releases](https://github.com/nihaozyj7/localMusicPlayer/releases)
and run it — **no installation needed** (portable build).

On first launch the embedded FFmpeg is unpacked into your data directory:

```text
%APPDATA%\LocalMusicPlayer\          config, library cache, lyrics and cover cache
%LOCALAPPDATA%\LocalMusicPlayer\bin\  the unpacked ffmpeg.exe (you may replace it)
```

### Requirements

- Windows 10 1809+ / Windows 11 (x64)
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) — preinstalled on
  Windows 11 and recent Windows 10 builds; otherwise install the Evergreen Runtime once

> So far this has only been verified on Windows. The code keeps macOS / Linux branches (data directories,
> native materials, tray, …) but they are neither tested nor covered by CI. Contributions welcome.

---

## Development

### Prerequisites

| Dependency | Version | Notes |
| --- | --- | --- |
| [Go](https://go.dev/) | 1.25+ | Backend |
| [Node.js](https://nodejs.org/) | ≥ 20.19 | Frontend build and checks |
| [Wails v3 CLI](https://v3.wails.io/) | `v3.0.0-beta.14` | `go install github.com/wailsapp/wails/v3/cmd/wails3@latest` |
| [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) | — | Needed to run the app |
| MinGW-w64 | — | Only if you want to rebuild the embedded FFmpeg |

### UI only (no Go required)

```powershell
npm install
npm run dev        # Vite dev server (HMR), http://127.0.0.1:5173/ by default
```

The browser preview renders with mock data — edit CSS / JS and refresh. `npm run dev:static` is a static
preview that does not need `node_modules` (the self-check scripts use it).

### Running it

```powershell
npm install
wails3 task run    # build frontend → generate bindings → go build → run
```

### Packaging

```powershell
wails3 task build     # executable only, output in bin/
wails3 task package   # Windows installer (NSIS)
```

### Checks

```powershell
npm run check              # ESLint + tsc type check + node:test unit tests
wails3 task test           # Go unit tests
wails3 task check:go       # gofmt + go vet + go test -race
wails3 task ffmpeg:info    # size / license / capability list of the embedded ffmpeg
```

`tools/` also contains a set of headless-browser self-check scripts (driving Edge over CDP) that verify
real interactions rather than "the element exists":

```powershell
node tools/dev-server.js 5173   # keep this running in another terminal
node tools/cdp-check.js         # layout and console-error checks across 14 scenarios
node tools/hitcheck.mjs         # hit testing with real mouse coordinates (catches "transparent overlay eats clicks")
```

The full tool list and development conventions are in [`docs/19-开发说明.md`](docs/19-开发说明.md) (Chinese).

---

## Tech stack

| Layer | What it uses |
| --- | --- |
| Backend | Go 1.25 — folder scanning, tag parsing, audio HTTP server, loudness measurement, online API aggregation |
| Desktop shell | Wails v3 (Go ↔ WebView bridge, frameless window, tray, single instance, native file dialogs) |
| Rendering engine | WebView2 (ships with Windows; no browser engine is bundled) |
| View layer | Lit 3 (custom elements, light DOM; templates and incremental diffing only — styling stays global CSS) |
| Frontend tooling | Native ES Modules + Vite 7 + npm workspaces + ESLint / Prettier / TypeScript (JSDoc) |
| Audio | Embedded self-compiled FFmpeg 8.1.2 (LGPL-2.1+) + a hand-written EBU R128 gain implementation |

### Repository layout

```text
main.go                  entry point: config / themes / library / audio service / window / tray
services*.go             Go-side services (the API exposed to the frontend)
internal/
  bootstrap/             data model, config I/O, stable ids, scan-root computation
  library/               scanning, metadata cache, incremental rescans, fsnotify watching
  meta/  lyrics/         tag, cover and lyric parsing
  media/                 local audio HTTP server (CORS / Range / transcode cache)
  loudness/              EBU R128 measurement and gain compensation
  ffmpeg/                locating and unpacking the embedded ffmpeg (bin/ is not committed)
  coverfetch/ lyricsfetch/ bilibili/   three volatile third-party APIs, each isolated
  metacache/ skins/ theme/             multi-cover write-back, skin packs, theme directory
frontend/
  src/                   the pages (Lit components + global CSS, no JSX / no TS sources)
  packages/player-skins/ the player-skin pack (the extensible contract lives here)
  bindings/              Go bindings generated by wails3 (regenerable)
  dist/                  Vite output, embedded into the executable via go:embed
build/                   Wails packaging scaffolding and the minimal-ffmpeg build script
tools/                   build scripts + headless-browser self-check scripts
docs/                    design, review and implementation documents
```

### A few deliberate trade-offs

- **The source is plain JS**: the bundler only resolves dependencies and hashes output; no JSX/TS is
  introduced. Types, where wanted, are JSDoc that `tsc --checkJs` understands — files stay readable as-is.
- **Styling is global classes, not Shadow DOM**: theme CSS, skin packs and the self-check scripts all query
  by `#id` / `.class`, and those are a **public contract**. Lit only handles templates and incremental updates.
- **Anything depending on a third-party network API lives in its own package**:
  `internal/bilibili` / `lyricsfetch` / `coverfetch` change without notice, so isolating them keeps the
  blast radius to one file.
- **Code that writes user files only does minimal insertion**: adding cover art to m4a / flac never touches
  the audio data or any offset, and every write goes through "temp file + atomic rename".

---

## License & credits

### License

Released under the **Apache License 2.0** — see [`LICENSE`](LICENSE).

```text
Copyright 2026 The localMusicPlayer Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```

You are free to use, modify and redistribute it (commercially included), as long as you keep the
copyright and license notices and state what you changed.

### Third-party components

The program redistributes some third-party code and binaries. Their licenses and copyright notices are in:

- [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) — every dependency, version, license and copyright line;
- [`NOTICE`](NOTICE) — the notice file required by Apache-2.0;
- [`internal/ffmpeg/bin/FFMPEG-LICENSE.txt`](internal/ffmpeg/bin/FFMPEG-LICENSE.txt) — the origin, build flags
  and LGPL conclusion for the embedded FFmpeg.

The same list is rendered inside the app under "Settings → About" (data source:
`frontend/src/js/about-info.js`).

### Data sources

The online features call the following public services. Copyright belongs to their respective owners;
this project is neither affiliated with nor endorsed by any of them:

[LRCLIB](https://lrclib.net/) · [NetEase Cloud Music](https://music.163.com/) · [QQ Music](https://y.qq.com/) ·
[iTunes Search API](https://performance-partners.apple.com/search-api) · [Deezer](https://developers.deezer.com/api) ·
[MusicBrainz](https://musicbrainz.org/) · [Bilibili](https://www.bilibili.com/)

### Credits

Thanks to [Go](https://go.dev/), [Wails](https://v3.wails.io/), [Lit](https://lit.dev/), [Vite](https://vite.dev/),
[FFmpeg](https://ffmpeg.org/) and every library listed in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) —
none of this would exist without them.

Thanks as well to the providers of the data services above, and to everyone who reported an issue: every
piece of UI feedback, format-compatibility problem and performance complaint turned directly into a fix.

### Disclaimer

- This software only **organises and plays local music**; it does not provide, store or distribute any
  music content;
- Online search / preview / download rely on third-party public APIs; availability and content are decided
  by those platforms;
- Automatically matched cover art and lyrics come from public databases and are **not guaranteed to match**
  the track — please verify before writing them back into your files.

---

<div align="center">

If this project is useful to you, a ⭐ or an issue is very welcome.

</div>
