/* ==========================================================================
   about-info.js — 「设置 → 关于」的全部静态资料
   --------------------------------------------------------------------------
   关于界面要展示的东西（技术栈、依赖库、开源协议、数据来源、致谢）全部是
   **不会随运行时状态变化**的常量，所以它们从视图里搬出来放在这里：
     · settings-view.js 只负责排版，改版不用在几百行模板里翻依赖清单；
     · 发版时改版本号 / 换仓库地址只需要动这一个文件；
     · 清单能被 tests 直接 import 做结构断言（见 frontend/tests/about.test.js）。

   维护要求：
     · 依赖项跟着 go.mod / package.json 走，增删依赖时同步这一份；
     · license 写 SPDX 标识符，与依赖自带的 LICENSE 文件一致；
     · 每一项都要有 url，界面上的名字是可点的（见 settings.js#about-open-url）。
   ========================================================================== */

/* --------------------------------------------------------------------------
   应用自身
   -------------------------------------------------------------------------- */

/** 应用显示名。和窗口标题 / 托盘提示保持一致。 */
export const APP_NAME = "本地音乐播放器";

/** 仓库里用的英文标识（模块名、包作用域、数据目录名都以它为准）。 */
export const APP_ID = "localMusicPlayer";

/** 应用标题：窗口标题栏、托盘提示、安装包产品名都用它（取 ID 的首字母）。 */
export const APP_TITLE = "LMPlayer";

/** 一句话定位，显示在关于页顶部。 */
export const APP_TAGLINE = "本地曲库 + 在线试听的桌面音乐播放器";

/**
 * 版本号兜底值。
 *
 * 真实版本来自 Go 侧 AppService.Version()（唯一事实来源）；这里是浏览器预览
 * 状态下没有后端时用的值，两者应当一致。
 */
export const APP_VERSION_FALLBACK = "0.1.0";

/** 本项目自身的开源协议（SPDX）。 */
export const APP_LICENSE = "Apache-2.0";

export const APP_COPYRIGHT = "Copyright 2026 The localMusicPlayer Authors";

const REPO = "https://github.com/nihaozyj7/localMusicPlayer";

/** 关于页顶部那几个跳转按钮。 */
export const PROJECT_LINKS = [
  { id: "home", label: "项目主页", icon: "external", url: REPO },
  { id: "issues", label: "问题反馈", icon: "external", url: `${REPO}/issues` },
  { id: "releases", label: "更新日志", icon: "external", url: `${REPO}/releases` },
  { id: "license", label: "Apache-2.0 协议全文", icon: "scale", url: "https://www.apache.org/licenses/LICENSE-2.0" },
];

/* --------------------------------------------------------------------------
   技术栈
   -------------------------------------------------------------------------- */

/**
 * 应用真正「站在上面」的技术。
 *
 * @type {{ name: string, version: string, role: string, url: string }[]}
 */
export const TECH_STACK = [
  {
    name: "Go",
    version: "1.25",
    role: "后端：目录扫描、标签解析、音频 HTTP 服务、响度测量、在线接口聚合",
    url: "https://go.dev/",
  },
  {
    name: "Wails",
    version: "v3（beta.14）",
    role: "桌面外壳：Go ↔ WebView 桥、无边框窗口、托盘、单实例、系统文件对话框",
    url: "https://v3.wails.io/",
  },
  {
    name: "WebView2",
    version: "系统自带",
    role: "界面渲染引擎（Windows）；应用不内嵌浏览器内核，因此安装包很小",
    url: "https://developer.microsoft.com/microsoft-edge/webview2/",
  },
  {
    name: "Lit",
    version: "3",
    role: "前端视图层：设置、曲目表、各弹层都是增量更新的自定义元素",
    url: "https://lit.dev/",
  },
  {
    name: "原生 ES Module + Vite",
    version: "7",
    role: "界面代码本身是可直接阅读的 JS，Vite 只做依赖解析与产物打包",
    url: "https://vite.dev/",
  },
  {
    name: "npm workspaces",
    version: "—",
    role: "单仓多包：应用壳 + 播放界面样式包（frontend/packages/player-skins）",
    url: "https://docs.npmjs.com/cli/using-npm/workspaces",
  },
  {
    name: "ffmpeg",
    version: "8.1.2（自行编译的精简版）",
    role: "解码 WebView 放不了的格式、转码为 PCM/WAV、loudnorm 响度测量",
    url: "https://ffmpeg.org/",
  },
  {
    name: "ESLint / Prettier / TypeScript",
    version: "9 / 3 / 5",
    role: "代码检查与类型检查（JSDoc + checkJs，逐个文件收紧）",
    url: "https://eslint.org/",
  },
];

/* --------------------------------------------------------------------------
   第三方库
   -------------------------------------------------------------------------- */

/** 运行时会随程序一起分发的库。 */
export const RUNTIME_LIBS = [
  { name: "Wails", version: "v3.0.0-beta.14", license: "MIT", role: "桌面外壳与 Go↔JS 桥", url: "https://github.com/wailsapp/wails" },
  { name: "dhowden/tag", version: "2024-04-17", license: "BSD-2-Clause", role: "mp3 / m4a / flac / ogg 标签解析", url: "https://github.com/dhowden/tag" },
  { name: "fsnotify/fsnotify", version: "1.9.0", license: "BSD-3-Clause", role: "音乐文件夹的实时监听", url: "https://github.com/fsnotify/fsnotify" },
  { name: "Lit", version: "3.3.3", license: "BSD-3-Clause", role: "前端视图层", url: "https://github.com/lit/lit" },
  { name: "SortableJS", version: "1.15.7", license: "MIT", role: "播放队列与歌单的拖拽排序", url: "https://github.com/SortableJS/Sortable" },
];

/**
 * 由 Wails 间接引入的库（本项目没有直接 import，但会一起编译进二进制）。
 * 单独列出来是因为分发时必须一并保留它们的许可证声明。
 */
export const TRANSITIVE_LIBS = [
  { name: "coder/websocket", version: "1.8.14", license: "ISC", role: "Wails 的 WebSocket 传输", url: "https://github.com/coder/websocket" },
  { name: "go-ole/go-ole", version: "1.3.0", license: "MIT", role: "Windows COM 绑定", url: "https://github.com/go-ole/go-ole" },
  { name: "godbus/dbus/v5", version: "5.2.2", license: "BSD-2-Clause", role: "Linux 桌面集成", url: "https://github.com/godbus/dbus" },
  { name: "jchv/go-winloader", version: "2025-04-06", license: "ISC", role: "Windows 依赖加载", url: "https://github.com/jchv/go-winloader" },
  { name: "adrg/xdg", version: "0.5.3", license: "MIT", role: "跨平台标准目录", url: "https://github.com/adrg/xdg" },
  { name: "mattn/go-colorable", version: "0.1.14", license: "MIT", role: "Windows 控制台彩色输出", url: "https://github.com/mattn/go-colorable" },
  { name: "mattn/go-isatty", version: "0.0.20", license: "MIT", role: "判断 stdout 是否为终端", url: "https://github.com/mattn/go-isatty" },
  { name: "golang.org/x/sys", version: "0.46.0", license: "BSD-3-Clause", role: "Go 官方系统调用扩展", url: "https://pkg.go.dev/golang.org/x/sys" },
];

/** 随应用分发的二进制组件（不是 Go/npm 依赖，单独说明）。 */
export const BUNDLED_BINARIES = [
  {
    name: "FFmpeg",
    version: "8.1.2",
    license: "LGPL-2.1-or-later",
    role: "由本项目用 build/ffmpeg/build-minimal.sh 从官方源码自行编译的精简版（约 5.6MB），只保留音频解码 / 转码 / loudnorm，未启用 GPL 组件",
    url: "https://ffmpeg.org/legal.html",
  },
];

/* --------------------------------------------------------------------------
   开源协议
   -------------------------------------------------------------------------- */

/**
 * 关于界面上「许可证」一节的说明条目。
 *
 * 每条的 tone 会被渲染成不同颜色的徽标：ok（绿）/ note（普通）。
 */
export const LICENSE_NOTES = [
  {
    label: "本项目",
    value: "Apache License 2.0",
    tone: "ok",
    desc: "可自由使用、修改、分发（含商用），需保留版权与许可声明，并附带变更说明。仓库根目录的 LICENSE 是完整协议文本。",
  },
  {
    label: "内嵌 FFmpeg",
    value: "LGPL-2.1-or-later",
    tone: "note",
    desc: "以独立可执行文件形式随应用解包到数据目录，用户可以直接替换；本应用未修改 FFmpeg 源码。详见 internal/ffmpeg/bin/FFMPEG-LICENSE.txt。",
  },
  {
    label: "第三方库",
    value: "MIT / BSD / ISC",
    tone: "note",
    desc: "均为宽松许可证，允许在 Apache-2.0 项目中使用；完整清单与版本见下方表格。",
  },
];

/* --------------------------------------------------------------------------
   参考与致谢
   -------------------------------------------------------------------------- */

/**
 * 在线能力用到的公开数据来源。
 *
 * 这些不是「依赖」，而是本项目调用的第三方服务；能力失效时功能会降级，
 * 但不影响本地曲库的使用。
 */
export const DATA_SOURCES = [
  { name: "LRCLIB", role: "歌词（无需鉴权的开放歌词库）", url: "https://lrclib.net/" },
  { name: "网易云音乐", role: "歌词 / 封面备选来源", url: "https://music.163.com/" },
  { name: "QQ 音乐", role: "歌词 / 封面备选来源", url: "https://y.qq.com/" },
  { name: "iTunes Search API", role: "封面（Apple 官方公开接口）", url: "https://performance-partners.apple.com/search-api" },
  { name: "Deezer", role: "封面备选来源", url: "https://developers.deezer.com/api" },
  { name: "MusicBrainz", role: "封面（配合 Cover Art Archive）", url: "https://musicbrainz.org/" },
  { name: "哔哩哔哩", role: "在线试听与下载（公开 Web 接口）", url: "https://www.bilibili.com/" },
];

/** 参考资料与致谢。 */
export const THANKS = [
  {
    title: "开源社区",
    body: "Go、Wails、Lit、Vite、FFmpeg 以及上面列出的每一个库 —— 没有它们，这个播放器不会存在。",
  },
  {
    title: "FFmpeg 项目",
    body: "让「放不出来的格式」有了统一的解法；EBU R128 响度测量也建立在它的 loudnorm 滤镜之上。",
  },
  {
    title: "数据服务提供方",
    body: "LRCLIB、网易云音乐、QQ 音乐、Apple、Deezer、MusicBrainz、哔哩哔哩 提供了歌词与封面等公开数据。本项目的调用均来自官方或公开接口，版权归各自权利人所有。",
  },
  {
    title: "每一位反馈者",
    body: "界面细节、格式兼容性、性能问题的每一条反馈都直接变成了代码里的修复。",
  },
];

/** 项目自己声明的边界（放在关于页最下方，避免用户对能力产生误解）。 */
export const DISCLAIMER = [
   "本软件只做本地音乐的整理与播放，不提供、不存储、不分发任何音乐内容。",
   "在线搜索 / 试听 / 下载依赖第三方公开接口，其可用性与内容均由对应平台决定。",
   "自动匹配的封面与歌词来自公开曲库，不保证与歌曲完全对应，请自行核对后再写回文件。",
];

/* --------------------------------------------------------------------------
   小工具
   -------------------------------------------------------------------------- */

/** 依赖 / 技术条目 → 一句「名称 版本」文本（表格里省一列用）。 */
export function nameWithVersion(item) {
  const version = String(item?.version || "").trim();
  if (!version || version === "—") return String(item?.name || "");
  return `${item.name} ${version}`;
}

/** 全部第三方库（运行时 + 间接），把许可证换成数组给表格统一渲染。 */
export function allLibs() {
  return [...RUNTIME_LIBS.map((x) => ({ ...x, kind: "运行时" })), ...TRANSITIVE_LIBS.map((x) => ({ ...x, kind: "随 Wails 引入" }))];
}

/** 同一个许可证出现了多少次（表头那句「MIT × 5」用）。 */
export function licenseSummary(items) {
  const counts = new Map();
  for (const item of items) counts.set(item.license, (counts.get(item.license) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([license, count]) => ({ license, count }));
}
