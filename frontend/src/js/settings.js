/* ==========================================================================
   settings.js — 设置界面的业务逻辑
   （文件夹 / 规则 / 主题 / 播放界面样式 / 播放 / 歌词 / 响度 / 在线 / AI / 窗口与系统）
   ========================================================================== */

import { openModal, toast } from "./dom.js";
import { html, nothing } from "./ui/base.js";
import { requestAppUpdate } from "./ui/base.js";
import { state } from "./store.js";
import { backend, isWails, on } from "./bridge.js";
import { fmtCount, uid } from "./utils.js";
import { aiVendorHint, aiVendorLabel } from "./ai-vendors.js";
import { applyResolvedTheme, discoverThemes, listThemes, removeTheme } from "./theme.js";
import { BACKDROP_MODES, backdropLabel } from "./backdrop.js";
import { invalidateLoudnessForTarget, refreshLoudnessGains, refreshLoudnessState } from "./audio.js";
import { animationDurationValue, setRuntimeToken, replaceStyleRules } from "./runtime-tokens.js";
import { applyDesktopMode } from "./desktop-mode.js";

import { availableSkins, reloadSkins, removeSkin, setPlayerViewMode, skinLoadFailures } from "./playerhost.js";

/* --------------------------------------------------------------------------
   各分区
   -------------------------------------------------------------------------- */
/**
 * 原生材质的状态说明。
 *
 * 材质是「创建窗口时」定下的（Wails v3 没有运行期接口），所以这里必须把
 * 「窗口当前生效什么」「改了要不要重启」「系统支不支持」讲清楚，
 * 否则用户会觉得设置项点了没反应。
 *
 * 样式完全复用现有的 setting--stack / setting__hint / card__actions，
 * 不新增任何颜色规则。
 */
/** 单击歌曲行的可选行为（与 Go 侧 bootstrap.RowClickActions 一致） */
export const ROW_CLICK_ACTIONS = [
  { value: "play", label: "播放" },
  { value: "play-list", label: "播放当前列表" },
  { value: "next", label: "下一首播放" },
];

/**
 * 主窗口圆角（与 Go 侧 bootstrap.WindowCornerModes 一致）。
 * 圆角是系统（DWM）画的，只有这几档；没有「任意像素半径」——
 * 那需要放弃系统外框自己画，是另一个量级的改动。
 */
export const WINDOW_CORNERS = [
  { value: "system", label: "跟随系统" },
  { value: "round", label: "标准" },
  { value: "small", label: "小圆角" },
  { value: "square", label: "直角" },
];

/** 列表密度（与 Go 侧 bootstrap.ListDensities 一致） */
export const LIST_DENSITIES = [
  { value: "compact", label: "紧凑" },
  { value: "cozy", label: "标准" },
  { value: "roomy", label: "宽松" },
];

/**
 * 过渡速度（与 Go 侧 bootstrap.AnimationsSpeeds 一致）。
 * 全站动效时长都由 --dur 派生，所以这里改的是「所有弹出层 / 菜单 / 面板」的节奏。
 */
export const ANIMATION_SPEEDS = [
  { value: "fast", label: "快速 0.25s" },
  { value: "medium", label: "适中 0.5s" },
  { value: "slow", label: "缓慢 0.75s" },
];

/** 歌词来源的中文名（与 Go 侧 internal/lyrics 的来源常量一一对应） */
export const LYRICS_SOURCE_LABELS = {
  embedded: "内嵌歌词",
  "lrc-file": "同目录 .lrc",
  cache: "歌词缓存",
  online: "在线自动匹配",
};

export function lyricsSourceLabels() {
  const list = Array.isArray(state.config.lyricsSources) ? state.config.lyricsSources : [];
  const names = list.map((s) => LYRICS_SOURCE_LABELS[s] || s);
  return names.length ? names.join(" → ") : "（未配置）";
}

/* --------------------------------------------------------------------------
   在线歌曲：下载位置 + 封面来源
   -------------------------------------------------------------------------- */
/** 缓存目录概况（数量 + 占用），数据由 CoverService.CacheStats 异步补齐 */
export function cacheSummary() {
  const c = state.coverCache;
  if (!c) return "正在读取…";
  const mb = ((c.bytes || 0) / 1024 / 1024).toFixed(1);
  return `已缓存 ${fmtCount(c.covers || 0)} 张封面、${fmtCount(c.lyrics || 0)} 份歌词，共 ${mb} MB`;
}

/** 缓存里有多少份可写的内容（0 表示还没抓过任何封面/歌词） */
export function cachedMetaCount() {
  const c = state.coverCache || {};
  return (Number(c.covers) || 0) + (Number(c.lyrics) || 0);
}

/** 「把封面/歌词写进歌曲文件」这一行的说明文字 */
export function embedHintText() {
  const base =
    "默认关闭：封面与歌词都只放在缓存目录里。开启后下载 / 更换封面时会把它们写进文件标签，" +
    "这样把文件拷到别的播放器上也能看到封面与歌词（m4a / flac 支持，mp3 等格式会明确跳过）";
  const c = state.coverCache;
  if (!c) return base;
  if (cachedMetaCount() === 0) return `${base}。当前缓存里还没有封面或歌词可写`;
  return `${base}。缓存里已经有 ${cacheSummary()}`;
}

/** 「把已有缓存补写进文件」按钮的说明文字 */
export function embedWriteHint() {
  return (
    "这个开关只对之后下载或更换的封面生效；已经存在缓存里的封面与歌词" +
    `（${cacheSummary()}）可以用下面的按钮一次性写进歌曲文件。mp3 / wav 等暂不支持写标签的格式会被跳过，不会动你的文件。`
  );
}

/* --------------------------------------------------------------------------
   主题色卡
   -------------------------------------------------------------------------- */
/**
 * 把主题色板写成样式表里的规则，而不是 HTML 行内 style。
 * 通过 CSSOM insertRule 写入（CSP style-src 'self' 允许），
 * 不用 <style>.textContent，也不用 blob: 样式表。
 */
export function ensureSwatchStyles() {
  const themes = listThemes();
  const colors = [];
  for (const t of themes) {
    for (const c of t.swatch || []) if (!colors.includes(c)) colors.push(c);
  }
  const css = colors.map((c, i) => `[data-swatch="${i}"]{background:${c}}`).join("\n");
  replaceStyleRules("swatch-styles", css);

  return (t) => (t.swatch || []).map((c) => colors.indexOf(c));
}

/* --------------------------------------------------------------------------
   AI 元数据清洗
   --------------------------------------------------------------------------
   本地文件名里常常带着歌名/歌手，但混有脏数据，直接联网匹配封面/歌词命中率低。
   填好 OpenAI 兼容接口后，自动匹配时会先把元数据交给 AI 清洗一遍。
   -------------------------------------------------------------------------- */
/**
 * 播放界面样式（皮肤）卡片。
 *
 * 内置样式已经从主程序抽到独立包 @musicplayer/player-skins，
 * 用户还可以往数据目录 `<数据目录>/player-skins/<id>/` 丢一个第三方样式
 * （skin.js + 可选 skin.css / skin.json），点「重新扫描样式」即可出现。
 * 卡片里同时放着轮播的两个设置 —— 它们本来就属于「播放界面怎么显示」。
 */
/* --------------------------------------------------------------------------
   自定义样式 / 主题：AI 引导弹层
   --------------------------------------------------------------------------
   需求：设置 → 播放界面样式 后面加一个「自定义」按钮，点开后给出可直接交给
   AI 使用的提示词，让用户用 AI 生成一个播放界面样式（皮肤）；外观主题那边
   同样有一个「添加自定义主题」的引导。

   两个引导弹层刻意**不再展示提示词原文**：提示词很长，铺在弹窗里既占地方、
   又会让人以为要自己改；真正要做的只有两件事 —— 复制提示词、把 AI 生成好的
   文件导入进来。所以每个弹层只放两个按钮，导入的合法性判定在后端完成
   （theme.ImportDir / skins.ImportDir），前端只负责汇报结果。

   提示词的定位（重要）：它是一份**产物规格**，只写「交付物长什么样、必须满足
   哪些规则 / 格式 / 接口 / 环境限制 / 参考文件 / 自检清单」，**不指导也不暗示
   具体样式**（没有示例配色、布局、动效建议）。视觉风格属于用户自己的构思，
   所以两份提示词都以一条「风格要求 · 由使用者自行填写」的占位结尾，用户自己
   补一句或先删掉再和 AI 聊。改提示词时请守住这条边界：只增删约束，不塞风格。
   -------------------------------------------------------------------------- */

/**
 * 参考资料一节：后端给得到本机真实路径就用真实路径，否则退回源码仓库路径。
 *
 * 为什么要有这个分支：提示词里的参考必须是「AI 能找到的东西」。用户大多数只装了
 * 编译好的程序，仓库里的 contract.js / _template.css 并不存在，让 AI 照着找等于
 * 没有参考；所以由后端列出运行时真实存在的目录与文件（见 services_reference.go），
 * 这里只负责把它们写成提示词里的一段话。AI 读不到文件时（纯聊天环境），也明确
 * 告诉它该让使用者贴哪一份过来。
 */
function skinReferenceSection(ref) {
  if (!ref?.dir) {
    return `（浏览器预览模式读不到本机目录，以下是源码仓库里的参考文件）
1. 接口唯一定义（含 JSDoc 类型）：frontend/packages/player-skins/src/contract.js
2. 内置三款实现（结构可参考）：frontend/packages/player-skins/src/skins/classic.js、immersive.js、minimal.js
3. 可直接复制改名的最小示例包：数据目录下的 player-skins/_template/（skin.js / skin.css / skin.json）
4. 说明文档：frontend/packages/player-skins/README.md`;
  }
  const lines = [
    "本机真实路径如下。如果你能读文件，请先打开它们当范例；如果读不到（例如纯聊天环境），请让使用者把下面第 2 条的文件内容贴给你，再开始写。",
    `1. 样式（皮肤）目录 —— 第三方样式包都放在这里，扫描只认它下面的一层子目录：${ref.dir}`,
  ];
  if (ref.example) {
    lines.push(
      `2. 示例样式包（完整可运行的 skin.js / skin.css / skin.json，复制改名就是一份新样式）：${ref.example}`
    );
  } else {
    lines.push("2. 示例样式包：本机没有找到 _template 目录，请只按本规格的接口定义写。");
  }
  if (ref.current) {
    lines.push(`3. 当前正在使用的样式包（最贴近现状的参考）：${ref.current}`);
  } else {
    lines.push(
      `3. 当前正在使用的是内置样式（${ref.currentId || "classic / immersive / minimal"}）：它的源码打包在程序里，磁盘上没有对应目录，请以第 2 条的示例包为准。`
    );
  }
  const packs = Array.isArray(ref.packs) ? ref.packs : [];
  if (packs.length) {
    lines.push("4. 该目录里已有的第三方样式包（可以直接读它们的入口与样式）：");
    for (const pack of packs) {
      const files = [pack.module, ...(Array.isArray(pack.styles) ? pack.styles : [])].filter(Boolean);
      lines.push(`   · ${pack.name || pack.id}（id: ${pack.id}）：${files.join("、") || pack.dir}`);
    }
  } else {
    lines.push("4. 该目录里目前还没有第三方样式包 —— 你写的这个会是第一个。");
  }
  lines.push("5. 宿主只加载 apiVersion 为 1 的样式，本程序用的就是这个版本。");
  return lines.join("\n");
}

/** 外观主题提示词的参考资料一节，规则同 skinReferenceSection */
function themeReferenceSection(ref) {
  if (!ref?.dir) {
    return `（浏览器预览模式读不到本机目录，以下是源码仓库里的参考文件）
1. 令牌默认值与注释：frontend/src/styles/tokens.css、frontend/src/styles/themes/_template.css
2. 内置主题（可直接对照写法）：frontend/src/styles/themes/dark-minimal.css、light-minimal.css、cover-dark.css
3. 扫描与指令解析实现：internal/theme/theme.go`;
  }
  const lines = [
    "本机真实路径如下。如果你能读文件，请先打开它们当范例；如果读不到（例如纯聊天环境），请让使用者把下面第 2 条的文件内容贴给你，再开始写。",
    `1. 主题目录 —— 用户主题都放在这里，只扫一层、不递归；文件名默认就是主题 id，显示名由 @theme-name 决定：${ref.dir}`,
  ];
  if (ref.currentFile) {
    lines.push(
      `2. 当前正在使用的主题：${ref.currentName || ref.currentId}（id: ${ref.currentId}）→ 文件：${ref.currentFile}`
    );
  } else {
    lines.push("2. 当前主题的文件没找到，请以第 3 条列出的文件为准。");
  }
  const files = Array.isArray(ref.files) ? ref.files : [];
  if (files.length) {
    lines.push("3. 主题目录里已有的主题文件（都是合法示例，可直接对照写法）：");
    for (const item of files) {
      lines.push(
        `   · ${item.file}（${item.name || item.id}，id: ${item.id}，模式 ${item.mode}，${item.builtin ? "内置" : "用户导入"}）`
      );
    }
  } else {
    lines.push("3. 主题目录里暂时没有 .css 文件。");
  }
  return lines.join("\n");
}

function skinAiPrompt(ref = null) {
  return `请为「音乐播放器」（Go + WebView2 的 Windows 桌面应用）产出一个第三方「播放界面样式（皮肤）」包。这个包会被应用直接扫描并加载，因此必须严格满足下面的规格。

本说明只约定「产物必须满足哪些规则、格式、环境与参考」，不规定也不暗示视觉风格；风格由使用者自行构思。

【一、交付物与目录结构】
输出一个目录，目录名就是样式 id（建议小写字母、数字、短横线，例如 aurora；不能以 _ 或 . 开头，不要用空格与中文）：
  <样式id>/
    skin.js     必需，入口 ES module
    skin.css    可选，样式表
    skin.json   可选，清单：{"name":"显示名","version":"1.0.0","module":"skin.js","styles":["skin.css"]}
规则：
1. 没有 skin.json 也能工作（id、name 取目录名，入口默认 skin.js，样式取目录下全部 .css），但建议写上。
2. module 与 styles 必须是本目录内的相对路径，不能含 .. 或写成绝对路径。
3. 目录里可以放子目录与静态资源（.js .mjs .css .json .png .jpg .jpeg .webp .gif .svg .woff .woff2）；以 _ 或 . 开头的文件与目录不会被提供，请避开。
4. 不要依赖打包器、npm 包、CDN、外链字体或图片；产物必须能直接放进目录就运行。

【二、运行环境】
1. 原生 ES module，浏览器直接 import，没有打包与转译：skin.js 必须 export default 一个皮肤对象（宿主也接受名为 skin 的具名导出）。不要用需要 import 的 defineSkin(...) 之类的包装。
2. 页面 CSP：script-src 'self'；style-src 'self' 'unsafe-inline'；img-src 'self' data: blob: file:；media-src 'self' blob: file:。因此：
   · 不能加载任何外部资源（远程 JS / CSS / 字体 / 图片 / 接口请求都会被拦截）；
   · 不能 import CSS（浏览器原生不支持），skin.css 由宿主按清单自动插入；
   · 可以用相对路径 import 同目录下的其它 .js，图片与字体也用相对路径引用。
3. 内核是现代 Chromium（WebView2）：color-mix()、oklch()、:has()、CSS 嵌套等都可用。
4. 皮肤只在「播放详情页」里生效，宿主已经准备好容器：.playerview[data-skin="<样式id>"] 里的 #playerview-stage 就是 ctx.root；整窗背景层容器是 .skin-bg（在 .playerview 之外，因此 position: fixed 能铺满窗口）。
5. 深浅色主题、强调色、毛玻璃强度等都由应用的主题令牌决定，皮肤应跟随，不要写死。

【三、接口契约（必须严格遵守）】
export default {
  apiVersion: 1,                // 必需，且必须正好等于 1；其它值会被直接跳过
  id: "<样式id>",               // 必需，与目录名一致
  name: "<显示名>",             // 必需，显示在样式按钮的提示里
  icon: "disc",                 // 可选，图标 sprite id，见下
  order: 200,                   // 可选，样式按钮排序，越小越靠前（内置三款 10~30，第三方建议 >= 200）
  description: "<一句话说明>",  // 可选
  background: false,            // 可选，true 才需要整窗背景层（此时才用 ctx.backgroundRoot）
  mount(ctx) {},                // 必需，函数
  update(ctx, patch) {},        // 可选
  destroy(ctx) {}               // 可选
};
1. 缺 id / name / mount（或 mount 不是函数）都会导致加载失败，控制台会给出原因。
2. icon 取 index.html 里图标 sprite 的 id，可用值包括：disc / immersive / minimal / lyrics / lyric-match / slideshow / palette / image / music / album / headphones / play / pause / prev / next / shuffle / repeat / repeat-one / volume-high / volume-low / volume-mute / heart / download / bolt / check / sun / moon / expand / options / queue / settings / filter / trash；不确定就写 "disc"。

ctx 是皮肤唯一的入口（只读，直接改它不会生效）：
- ctx.root            你的挂载点（宿主已清空，往这里写 DOM）
- ctx.backgroundRoot  整窗背景层容器（background: true 时才用于渲染）
- ctx.audio           真实 <audio> 元素，只读：可以读 currentTime / buffered、挂事件监听；不要 play / pause / 改 src
- ctx.media()         返回 { song, cover, covers, coverIndex, lyrics }
                      · song：当前曲目对象，可能为 null，字段有 id / title / artist / album / duration / path / online 等
                      · cover：当前生效封面（data URL 或同源 URL）；covers：全部封面（轮播用，至少一张）；coverIndex：轮播下标
                      · lyrics：{ lines: [{ time, text }], text, source, index }，time 单位毫秒，index 是当前高亮行（-1 表示还没到第一句）
- ctx.playback()      返回 { position, duration, playing, volume, muted }，时间单位毫秒
- ctx.options()       返回 { showLyrics, lyricsFontSize, animations, coverCarousel, coverCarouselInterval }
- ctx.actions         只读动作：seek(ms) / togglePlay() / next() / prev() / openFolder() / openCoverPanel()
- ctx.on(type, fn)    订阅宿主推送，返回取消订阅的函数
- ctx.defaultCover    封面兜底图（内联 SVG data URL），封面加载失败时用它
- ctx.themeId         当前主题 id（getter）
- ctx.mode            当前深浅色 "dark" | "light"（getter）

宿主推送：update(ctx, patch) 与 ctx.on() 收到同一份 patch，patch.type 取值：
mount（挂载后立即推一次，带全量快照）/ song（换歌）/ media（封面变化或轮播切图）/ lyrics（歌词装载完成或更新）/ progress（播放进度，宿主已按帧节流）/ state（播放、暂停、音量变化）/ options（设置项变化）/ theme（主题或深浅色变化）/ resize（容器尺寸变化）/ close（详情页关闭）/ destroy（即将卸载，destroy 之前最后一次）。
patch 只带与该类型相关的字段；不确定时用 ctx.media() / ctx.playback() / ctx.options() 现取快照。

【四、CSS 约定】
1. skin.css 里每一条选择器都必须以 .playerview[data-skin="<样式id>"] 开头；需要影响详情页之外的外壳（标题栏、底栏）时可另加 .app[data-mode="<样式id>"]。不限定作用域会污染其它界面。
2. 不要写 :root / html / body / * 级别或裸标签选择器，不要用 !important 去覆盖别人的规则。
3. 可以直接使用主题令牌，深浅色会自动跟随：
   --accent / --accent-weak / --accent-weak-hover / --accent-text / --accent-contrast / --text-1 / --text-2 / --text-3 / --text-inverse / --surface-1 / --surface-2 / --surface-3 / --surface-hover / --surface-active / --glass-bg / --glass-bg-strong / --glass-blur / --glass-saturate / --glass-border / --border-1 / --border-2 / --divider / --r-sm / --r-md / --r-lg / --r-xl / --dur / --ease / --lyric-size
4. 不要改布局令牌（--h-titlebar / --w-sidebar / --h-playerbar / --h-header / --row-h / --row-h-compact），改了会破坏固定布局。
5. 需要私有变量时定义在自己的作用域里（例如 .playerview[data-skin="<样式id>"] 内），不要写到 :root。

【五、行为约束】
1. 不要 import 应用内部模块（store / bridge / utils / playerhost / @musicplayer/player-skins 等）；数据只从 ctx 拿，动作只走 ctx.actions；不要直接操作音频元素或应用状态。
2. 不要轮询：禁止用 setInterval 或定时 setTimeout 反复拉数据（动画、防抖、一次性延时除外）。
3. 歌词高亮用 ctx.media().lyrics.index 与 lines，不要自己解析 LRC 文本。
4. 动效要尊重 ctx.options().animations（为 false 时不要做位移动效）；时长与缓动优先用 --dur / --ease。
5. destroy(ctx) 里清掉定时器、事件监听、ResizeObserver 与大对象引用；切换样式会先 destroy 再 mount，两个方法都可能被多次调用。
6. 不要往 window / document 上挂全局变量或样式，不要改 document.documentElement 上的 data-* 属性。
7. 不要发网络请求（CSP 也会拦），不要用 eval / new Function。

【六、交付前自检清单】
1. 目录名 = id = skin.js 里的 id = CSS 选择器里的 data-skin 值；
2. skin.js 有 export default，且包含 apiVersion: 1、id、name、mount；
3. 每条 CSS 选择器都在 .playerview[data-skin="<样式id>"] 作用域内；
4. 没有裸包名 import、没有 fetch、没有 setInterval 轮询、没有全局选择器、没有 !important；
5. 换歌、歌词装载、进度更新、深浅色切换、窗口缩放、切走再切回都不会报错，也不留残余节点或监听。

【七、参考资料】
${skinReferenceSection(ref)}

【八、输出格式】
1. 先写清目录名与文件清单；
2. 再逐个文件输出完整代码，每个文件单独一个代码块，并在代码块第一行用注释标明文件名；
3. 不要省略、不要用省略号占位、不要留 __SKIN_ID__ 之类的占位符，代码要能直接运行。

【九、风格】
本提示词只约定产物必须满足的规则、格式、环境与参考，不规定也不暗示视觉风格；具体样式（布局、配色、动效、气质）由使用者自行构思。
请以使用者随附的风格说明为准；若使用者没有给出，先向使用者确认，不要自行假设。

【风格要求 · 由使用者自行填写（本行只是占位，本提示词不提供任何风格建议）】
`;
}

function themeAiPrompt(ref = null) {
  return `请为「音乐播放器」（Go + WebView2 的 Windows 桌面应用）产出一个「外观主题」CSS 文件。

本说明只约定「产物必须满足哪些规则、格式、环境与参考」，不规定也不暗示配色与气质；主题风格由使用者自行构思。

【一、交付物与格式】
1. 只交付 1 个 .css 文件（不要 HTML / JS / JSON，不要打包，不要 @import 外部资源）。
2. 文件名就是主题 id，建议小写字母、数字、短横线（例如 sunset）；不能以 _ 或 . 开头（会被当模板 / 隐藏文件跳过），不要用空格与中文。
3. 文件里只有一条规则，选择器固定为 :root[data-theme="<主题id>"]，与文件名一致最省事：

:root[data-theme="sunset"] {
  color-scheme: dark;
  /* 只声明你想覆盖的令牌，未声明的会自动回退到默认主题 */
}

4. 文件头可以写三行可选指令（建议写），供应用读取主题名 / 深浅模式 / 色板缩略图：

/* @theme-name 落日橘
   @theme-mode dark
   @theme-swatch #1a1020 #ff8a3d #ffd166 #fff4e6 #ff5a5f */

   · @theme-name 后跟显示名，可用中文；
   · @theme-mode 只能是 dark 或 light；
   · @theme-swatch 后跟若干（建议 5 个）代表色，第一个当底色、最后一个当强调色；
   · 不写也能用：名称取文件名，模式按文件名里的 dark / light 或 深色 / 浅色 猜（猜不到按 dark），色板从文件里的颜色字面量取前 5 个。

【二、加载与校验环境（决定哪些写法会被拒绝）】
1. 应用扫描主题目录下的 *.css，只扫一层，不支持子目录。
2. 文件名以 _ 或 . 开头的会跳过（_template.css 这类模板不参与）。
3. 文件里必须能匹配到 :root[data-theme="…"]，否则导入时会被判为「不像主题」并跳过。
4. 主题 id 取自这个选择器里的值；同 id 会互相覆盖，所以请保证 id 唯一。
5. 主题 CSS 被当作普通样式表注入页面；选中该主题时，文档根元素上会有 data-theme="<主题id>" 与 data-mode="dark|light"。
6. 页面 CSP 是 style-src 'self' 'unsafe-inline'：不能 @import 远程 CSS，不能 url() 外链网络字体或图片（同源、data: 可以用）。
7. 内核是现代 Chromium（WebView2）：color-mix()、oklch()、相对颜色、渐变、嵌套都可用，内置主题就用了 color-mix()。

【三、产物必须满足的规则】
1. 只声明设计令牌（CSS 自定义属性），不要写任何组件选择器、结构样式、@media 或关键帧。
2. 只写 :root[data-theme="<主题id>"] 这一条规则，不要用 !important，不要写 html / body / * 规则。
3. 不要改布局令牌：--h-titlebar / --w-sidebar / --h-playerbar / --h-header / --row-h / --row-h-compact，改了会破坏固定布局。
4. 不要覆盖 --bg-window（它由 tokens.css 从 --bg-app 派生）；想给「窗口原生材质（Mica / Acrylic）」叠一层底色时，改 --bg-window-material（默认全透明）。
5. 颜色要有明确层级和足够对比度：--text-1 对 --bg-app 与 --surface-1 的正文对比度应不低于 4.5:1，--text-2 / --text-3 仍要可读。
6. 深浅模式要自洽：写 dark 就整套按深色给值，写 light 就整套按浅色给值，不要一半深一半浅。
7. 文件必须自包含、可离线：不引用任何外部资源，不含 JS。
8. 可以只覆盖一部分令牌，其余回退默认；但 --bg-app / --text-1 / --accent / --accent-text / --accent-contrast 这几项建议一起给，免得强调色与文字色互相打架。

【四、可声明的令牌（参考清单，按需覆盖）】
- 表面：--bg-app（窗口底色）、--bg-canvas（背景渐变 / 纹理）、--surface-1 / --surface-2 / --surface-3 / --surface-hover / --surface-active
- 毛玻璃：--glass-bg / --glass-bg-strong / --glass-bg-weak / --glass-blur（0 表示关闭毛玻璃）/ --glass-saturate / --glass-border / --glass-highlight / --glass-shadow
- 文字：--text-1 / --text-2 / --text-3 / --text-inverse
- 描边：--border-1 / --border-2 / --divider / --focus-ring
- 强调色：--accent / --accent-weak / --accent-weak-hover / --accent-text / --accent-contrast
- 状态色：--heart / --heart-off / --danger / --success / --warning
- 播放页：--immersive-veil / --vinyl（唱片底纹）
- 圆角与动效：--r-sm / --r-md / --r-lg / --r-xl / --dur / --ease
完整默认值见 frontend/src/styles/tokens.css 与现成示例 frontend/src/styles/themes/_template.css。

【五、参考资料】
${themeReferenceSection(ref)}

【六、交付前自检清单】
1. 只有一个 :root[data-theme="<主题id>"] 规则，且 id 与文件名一致；
2. 三行 @theme-* 指令齐备，@theme-mode 是 dark 或 light；
3. 没有组件选择器、没有布局令牌、没有 --bg-window、没有 @import / url() 外链、没有 !important；
4. 明暗层级清楚，正文对比度不低于 4.5:1。

【七、输出格式】
直接输出这个 CSS 文件的完整内容：一个代码块，第一行用注释标明文件名。不要省略、不要用省略号占位、不要附加其它文件。

【八、风格】
本提示词只约定产物必须满足的规则、格式、环境与参考，不规定也不暗示视觉风格；配色与气质由使用者自行构思。
请以使用者随附的风格说明为准；若使用者没有给出，先向使用者确认，不要自行假设。

【风格要求 · 由使用者自行填写（本行只是占位，本提示词不提供任何风格建议）】
`;
}

/** 引导弹层底部的两个按钮：复制提示词 + 导入（不再展示提示词原文） */
function promptActions({ copyKey, importKind, importLabel }) {
  return html` <div class="card__actions">
    <button class="btn btn--sm btn--primary" type="button" data-copy-prompt=${copyKey}>
      <svg aria-hidden="true"><use href="#i-file"></use></svg><span>复制提示词</span>
    </button>
    <button class="btn btn--sm" type="button" data-import=${importKind}>
      <svg aria-hidden="true"><use href="#i-folder"></use></svg><span>${importLabel}</span>
    </button>
  </div>`;
}

/**
 * 取「参考资料」：真实路径来自后端（services_reference.go）。
 *
 * 拿不到就返回 null（浏览器预览模式 / 后端出错）：提示词会退回源码仓库路径，
 * 而不是编一条不存在的本机路径 —— 参考路径写错比没有参考更糟。
 */
async function themeReference() {
  if (!isWails()) return null;
  try {
    const currentId = document.documentElement.dataset.theme || state.config.theme || "";
    return (await backend.themeReference(currentId)) || null;
  } catch (err) {
    console.warn("[settings] 读取主题参考资料失败", err);
    return null;
  }
}

async function skinReference() {
  if (!isWails()) return null;
  try {
    const currentId = state.pvMode || state.config.playerViewMode || "";
    return (await backend.skinReference(currentId)) || null;
  } catch (err) {
    console.warn("[settings] 读取样式参考资料失败", err);
    return null;
  }
}

/** 把提示词写进剪贴板；剪贴板 API 不可用时退化到「隐藏文本框 + execCommand」 */
export async function copyPrompt(key) {
  const isTheme = key === "theme";
  // 先取本机参考路径再生成提示词：AI 拿到的参考资料必须是真实存在的目录/文件
  const text = isTheme ? themeAiPrompt(await themeReference()) : skinAiPrompt(await skinReference());
  try {
    await navigator.clipboard.writeText(text);
    toast("提示词已复制，粘贴给 AI 即可", { tone: "success", duration: 2000 });
    return;
  } catch {
    /* 某些 WebView / 非安全上下文没有 clipboard，走下面的兜底 */
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  toast(ok ? "提示词已复制，粘贴给 AI 即可" : "复制失败，请手动复制", {
    tone: ok ? "success" : "warning",
    duration: 2600,
  });
}

/**
 * 导入主题 / 样式包。
 *
 * 合法性判定在后端（theme.ImportDir / skins.ImportDir）：前端只负责弹选择器、
 * 把结果如实汇报出来。部分文件不合格时后端会同时给 imported 与 skipped，
 * 所以这里既报成功数，也把跳过的原因列出来。
 */
export async function importPack(kind, ctx = {}) {
  const isTheme = kind === "theme";
  if (!isWails()) {
    toast("浏览器预览模式无法导入，请手动把文件放进目录", { tone: "warning", duration: 3600 });
    return;
  }
  const progress = toast(isTheme ? "正在导入主题…" : "正在导入样式包…", { duration: 0 });
  try {
    const res = isTheme ? await backend.importTheme() : await backend.importSkin();
    progress.close();
    if (res?.cancelled) return;
    const imported = isTheme ? (Array.isArray(res?.imported) ? res.imported : []) : res?.id ? [res.id] : [];
    const skipped = Array.isArray(res?.skipped) ? res.skipped : [];

    if (isTheme) {
      await discoverThemes();
      ctx.commit?.();
      ctx.render?.();
    } else {
      await reloadSkins();
      ctx.render?.();
    }

    let text = isTheme
      ? imported.length
        ? `已导入 ${imported.length} 个主题：${imported.join("、")}`
        : "没有导入任何主题"
      : imported.length
        ? `已导入样式「${imported[0]}」`
        : "没有导入任何样式";
    if (skipped.length) text += `；另有 ${skipped.length} 个文件被跳过`;
    toast(text, {
      tone: imported.length ? (skipped.length ? "warning" : "success") : "warning",
      duration: 4600,
    });
    if (skipped.length) {
      openModal({
        title: "部分文件没有导入",
        body: html`<div class="setting__hint setting__hint--steps">
          ${skipped.map((s, i) => html`${i ? html`<br />` : nothing}${s}`)}
        </div>`,
        okText: "知道了",
        cancelText: "关闭",
        onOk: () => true,
      });
    }
  } catch (err) {
    progress.close();
    toast(`导入失败：${err?.message ?? err}`, { tone: "error", duration: 6000 });
  }
}

/** 给引导弹层绑定「复制提示词 / 导入」两个动作 */
function bindPromptActions(root, ctx = {}) {
  root.addEventListener("click", (e) => {
    const copyBtn = e.target.closest("[data-copy-prompt]");
    if (copyBtn) {
      copyPrompt(copyBtn.dataset.copyPrompt);
      return;
    }
    const importBtn = e.target.closest("[data-import]");
    if (importBtn) importPack(importBtn.dataset.import, ctx);
  });
}

/** 打开「用 AI 创建播放界面样式（皮肤）」的引导弹层 */
export function openSkinHelp(ctx = {}) {
  const body = html` <div class="setting__hint setting__hint--steps">
      · 点「复制提示词」把它粘贴给
      AI：提示词里只有产物的目录结构、接口契约与硬性规则，不含任何风格建议，风格请在末尾那条「风格要求」里自己补一句，它会直接产出一个样式包目录；<br />
      · 提示词里的「参考资料」会自动带上本机的真实路径（样式目录、示例包 _template、当前样式包），AI
      能读文件就会直接照着写；<br />
      · 生成好后回到这里点「导入样式包」，选中那个目录即可（目录里必须有 skin.js）；<br />
      · 也可以手动放进「样式目录/&lt;样式id&gt;/」，回来点「重新扫描样式」。
    </div>
    ${promptActions({ copyKey: "skin", importKind: "skin", importLabel: "导入样式包…" })}
    <div class="setting__hint">
      接口的唯一定义在 frontend/packages/player-skins/src/contract.js；样式目录里也有现成的 _template
      示例可以直接复制改名。
    </div>`;

  const { root } = openModal({
    title: "用 AI 创建播放界面样式",
    body,
    okText: "知道了",
    cancelText: "关闭",
    onOk: () => true,
  });
  bindPromptActions(root, ctx);
}

/** 打开「添加自定义主题」的引导弹层 */
export function openThemeHelp(ctx = {}) {
  const body = html` <div class="setting__hint setting__hint--steps">
      · 点「复制提示词」把它粘贴给
      AI：提示词里只有文件格式、令牌清单与校验规则，不含任何配色建议，风格请在末尾那条「风格要求」里自己补一句，它会产出一个主题
      CSS；<br />
      · 提示词里的「参考资料」会自动带上本机的真实路径（主题目录、当前主题文件、目录里已有的主题 CSS），AI
      能读文件就会直接照着写；<br />
      · 生成好后回到这里点「导入主题」，选中放着那个 CSS 的文件夹即可；<br />
      · 也可以手动放进主题文件夹（上面有「打开主题文件夹」按钮），回来点「重新扫描主题」。
    </div>
    ${promptActions({ copyKey: "theme", importKind: "theme", importLabel: "导入主题…" })}
    <div class="setting__hint setting__hint--steps">
      主题只声明颜色，不需要写组件样式，因此换主题不会破坏布局：<br />
      · 选择器写 <b>:root[data-theme="你的文件名"]</b>，与文件名一致最省事；<br />
      · 只改你想要的颜色，其余保持默认即可；<br />
      · 没写到的颜色会自动沿用默认主题，缺失也不会弄坏布局。
    </div>`;

  const { root } = openModal({
    title: "添加自定义主题",
    body,
    okText: "知道了",
    cancelText: "关闭",
    onOk: () => true,
  });
  bindPromptActions(root, ctx);
}

/* --------------------------------------------------------------------------
   移除主题 / 移除样式包
   --------------------------------------------------------------------------
   需求：外观主题与播放界面样式的自定义区域都要能直接「移除」，而不是只能
   自己去资源管理器里删文件 —— 删完还得重扫，而且以前重扫也不会把已经删掉的
   条目从列表里去掉（见 theme.js / playerhost.js 里的注册表同步）。

   两个动作都先弹确认：删除不可撤销（样式包是整个目录一起删）。
   真正删什么由后端决定（它只认自己扫描出来的文件 / 目录），前端传的 id
   不是路径，删不到目录之外的任何东西。
   -------------------------------------------------------------------------- */

async function runThemeRemove(id, name, ctx) {
  if (!isWails()) {
    toast("浏览器预览模式下不能移除，请手动删除主题文件", { tone: "warning", duration: 3600 });
    return;
  }
  const progress = toast("正在移除主题…", { duration: 0 });
  try {
    const res = await removeTheme(id);
    progress.close();
    if (!res.removed) {
      toast(`没有移除「${name}」`, { tone: "warning" });
      return;
    }
    // 删掉的可能正是当前主题：重新解析一次，自动回退到仍然存在的主题
    await applyResolvedTheme(state.config);
    ctx.commit?.();
    ctx.render?.();
    toast(`已移除主题「${name}」`, { tone: "success" });
  } catch (err) {
    progress.close();
    // 内置主题会被后端挡下来（每次启动都会重新生成），这里如实说出原因
    toast(`移除失败：${err?.message ?? err}`, { tone: "error", duration: 6000 });
  }
}

function confirmThemeRemove(actEl, ctx) {
  const id = actEl.dataset.id;
  const name = actEl.dataset.name || id;
  openModal({
    title: `移除主题「${name}」？`,
    desc: "会删除这个主题对应的样式文件。内置主题不能移除。",
    okText: "移除",
    danger: true,
    onOk: async () => {
      await runThemeRemove(id, name, ctx);
      return true;
    },
  });
}

async function runSkinRemove(id, name, ctx) {
  if (!isWails()) {
    toast("浏览器预览模式下不能移除，请手动删除样式目录", { tone: "warning", duration: 3600 });
    return;
  }
  const progress = toast("正在移除样式…", { duration: 0 });
  try {
    const res = await removeSkin(id);
    progress.close();
    if (!res.removed) {
      toast(`没有移除「${name}」`, { tone: "warning" });
      return;
    }
    ctx.commit?.();
    ctx.render?.();
    toast(`已移除样式「${name}」`, { tone: "success" });
  } catch (err) {
    progress.close();
    toast(`移除失败：${err?.message ?? err}`, { tone: "error", duration: 6000 });
  }
}

function confirmSkinRemove(actEl, ctx) {
  const id = actEl.dataset.id;
  const name = actEl.dataset.name || id;
  openModal({
    title: `移除样式「${name}」？`,
    desc: "会把样式目录里对应的整个文件夹删掉（里面只有这个样式的文件，不含歌曲）。",
    okText: "移除",
    danger: true,
    onOk: async () => {
      await runSkinRemove(id, name, ctx);
      return true;
    },
  });
}

/* --------------------------------------------------------------------------
   响度均衡（EBU R128 测量 + 回放增益补偿）
   -------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------
   交互绑定（在 shell.js 中一次性绑定到内容容器上）
   -------------------------------------------------------------------------- */
export async function handleSettingsAction(actEl, ctx = {}) {
  const act = actEl.dataset.act;
  const id = actEl.dataset.id;

  switch (act) {
    /* 桌面歌词位置记忆的出口：换显示器/改分辨率后存档可能落在别扭的地方，
       给用户一个「回到默认」的按钮，而不是让他去删配置文件。 */
    case "reset-desktop-lyrics-pos": {
      if (!isWails()) {
        toast("浏览器预览模式下没有独立歌词窗口", { duration: 2200 });
        return;
      }
      try {
        const res = await backend.desktopLyricsResetPos();
        if (res && res.applied === false) {
          toast("已清掉位置记忆；下次打开桌面歌词会用默认位置", { tone: "success", duration: 2600 });
        } else {
          toast("桌面歌词已移回默认位置", { tone: "success", duration: 2000 });
        }
      } catch (err) {
        toast(`重置失败：${err?.message ?? err}`, { tone: "error", duration: 5000 });
      }
      return;
    }

    /* AI 配置文本框（change 事件触发，即失焦时写入） */
    case "ai-field": {
      const key = actEl.dataset.key;
      if (!key) return;
      state.config[key] = actEl.value;
      ctx.commit?.();
      return;
    }

    /* 文件夹 */
    case "add-folder": {
      // 后端模式：由 Go 弹出系统目录选择器，选完直接写配置并开始扫描
      if (isWails()) {
        let res = null;
        try {
          res = await backend.addFolder("");
        } catch (err) {
          // 系统选择器打不开时（少见，但确实发生过）退化为手动输入，
          // 否则用户只会看到「点了没反应」。
          toast(`系统目录选择器不可用：${err?.message ?? err}`, { tone: "warning", duration: 5000 });
          res = null;
        }

        if (res === null) {
          const manual = await promptPath({ manual: true });
          if (!manual) return;
          try {
            res = await backend.addFolder(manual);
          } catch (err) {
            toast(`添加失败：${err?.message ?? err}`, { tone: "error", duration: 6000 });
            return;
          }
        }

        if (res?.cancelled) return;
        if (res?.duplicated) {
          toast(`该文件夹已在曲库中：${res.path}`, { tone: "warning" });
          return;
        }
        if (res?.folder) {
          state.folders = [...state.folders.filter((f) => f.id !== res.folder.id), res.folder];
          ctx.commit?.();
          toast(`已添加并开始扫描：${res.folder.path}`, { tone: "success" });
          // 扫描结果由后端 scan:done 事件推回来，这里不再重复触发 rescan，
          // 避免出现两次并发扫描（曲库会排队，但没必要让用户多等一轮）
        } else {
          toast("添加文件夹失败，请重试", { tone: "error", duration: 6000 });
        }
        return;
      }

      // 预览模式：手动输入路径（无后端可用）
      const manual = await promptPath();
      if (!manual) return;
      state.folders.push({
        id: uid("folder"),
        path: manual,
        trackCount: 0,
        status: "ok",
        watching: state.config.watchFolders,
        addedAt: Date.now(),
      });
      ctx.commit?.();
      toast(`已添加文件夹：${manual}`, { tone: "success" });
      ctx.rescan?.();
      break;
    }
    case "remove-folder": {
      const folder = state.folders.find((f) => f.id === id);
      if (!folder) return;
      openModal({
        title: "移除音乐文件夹？",
        desc: `${folder.path}\n仅从曲库中移除，不会删除任何本地文件。`,
        okText: "移除",
        danger: true,
        onOk: async () => {
          if (isWails()) await backend.removeFolder(id);
          state.folders = state.folders.filter((f) => f.id !== id);
          ctx.commit?.();
          toast("已移除文件夹");
          ctx.rescan?.({ manual: false });
          return true;
        },
      });
      break;
    }
    case "scan-now":
      ctx.rescan?.({ manual: true });
      break;
    case "rescan-folder":
      toast("正在重新扫描该文件夹…");
      ctx.rescan?.({ manual: true });
      break;

    /* 规则 */
    case "rule-add":
      state.filterRules.push({
        id: uid("rule"),
        type: "regex",
        op: "match",
        value: "",
        scope: "exclude",
        enabled: true,
      });
      ctx.commit?.();
      break;
    case "rule-del":
      state.filterRules = state.filterRules.filter((r) => r.id !== id);
      ctx.commit?.();
      ctx.refreshRules?.();
      break;
    case "rule-toggle": {
      const rule = state.filterRules.find((r) => r.id === id);
      if (rule) rule.enabled = !rule.enabled;
      ctx.commit?.();
      ctx.refreshRules?.();
      break;
    }
    case "rule-scope": {
      const rule = state.filterRules.find((r) => r.id === id);
      if (rule) rule.scope = actEl.dataset.scope;
      ctx.commit?.();
      ctx.refreshRules?.();
      break;
    }
    case "preset-small":
      state.filterRules.push({
        id: uid("rule"),
        type: "size",
        op: "lt",
        value: "10240",
        unit: "B",
        scope: "exclude",
        enabled: true,
      });
      ctx.commit?.();
      ctx.refreshRules?.();
      toast("已添加：排除小于 10KB 的文件", { tone: "success" });
      break;
    case "preset-mp4":
      state.filterRules.push({
        id: uid("rule"),
        type: "regex",
        op: "match",
        value: "\\.mp4$",
        scope: "exclude",
        enabled: true,
      });
      ctx.commit?.();
      ctx.refreshRules?.();
      toast("已添加：排除 .mp4 文件", { tone: "success" });
      break;

    /* 外观 */
    case "theme-pick": {
      const themes = listThemes();
      const t = themes.find((x) => x.id === id);
      if (!t) return;
      state.config.theme = t.id;
      state.config.themeMode = t.mode;
      await applyResolvedTheme(state.config);
      ctx.commit?.();
      // 选中态（卡片描边 + aria-pressed）是**渲染时**写进 DOM 的，只 commit
      // 不会重建设置层，用户看到的就是「点了没反应，关掉再开才生效」。
      ctx.render?.();
      toast(`已切换到主题「${t.name}」`, { tone: "success", duration: 1600 });
      break;
    }
    case "open-theme-dir": {
      if (!isWails()) {
        toast("主题目录：frontend/src/styles/themes/", { duration: 3200 });
        break;
      }
      // 打开失败时必须说出来：以前不管成没成都会弹「已打开」，
      // 用户看到的就是「提示成功、实际没反应」。
      try {
        const dir = await backend.themeDir();
        await backend.revealThemeDir();
        toast(dir ? `已打开主题目录：${dir}` : "已打开主题目录", { duration: 3200 });
      } catch (err) {
        toast(`打开主题目录失败：${err?.message ?? err}`, { tone: "error", duration: 5000 });
      }
      break;
    }
    case "theme-help":
      openThemeHelp(ctx);
      break;
    case "theme-remove":
      confirmThemeRemove(actEl, ctx);
      break;
    case "reload-themes":
      if (isWails()) {
        const list = await backend.reloadThemes();
        await discoverThemes();
        // 当前主题的文件可能已经被删掉了：重解析一次，回退到仍然存在的主题
        await applyResolvedTheme(state.config);
        ctx.commit?.();
        toast(`已重新扫描到 ${list?.length ?? 0} 个主题`, { tone: "success" });
      } else {
        toast("浏览器预览模式下仅内置主题可用", { tone: "warning" });
      }
      break;
    /* 播放界面样式（皮肤包） */
    case "skin-pick": {
      const picked = availableSkins().find((x) => x.id === id);
      if (!picked) return;
      setPlayerViewMode(picked.id);
      ctx.commit?.();
      // 同 theme-pick：卡片的选中态只存在于渲染结果里，必须重绘设置层
      ctx.render?.();
      toast(`播放界面已切换到「${picked.name}」`, { tone: "success", duration: 1600 });
      break;
    }
    case "open-skin-dir": {
      if (!isWails()) {
        toast("样式目录：frontend/packages/player-skins/", { duration: 3200 });
        break;
      }
      try {
        const dir = await backend.skinDir();
        await backend.revealSkinDir();
        toast(dir ? `已打开样式目录：${dir}` : "已打开样式目录", { duration: 3200 });
      } catch (err) {
        toast(`打开样式目录失败：${err?.message ?? err}`, { tone: "error", duration: 5000 });
      }
      break;
    }
    case "reload-skins":
      try {
        if (isWails()) await backend.reloadSkins();
        await reloadSkins();
        // 正在用的样式可能已经被删掉了：统一解析一次，回退到仍然存在的样式
        setPlayerViewMode(state.pvMode || state.config.playerViewMode || "");
        ctx.render?.();
        const n = availableSkins().length;
        const bad = skinLoadFailures();
        toast(bad.length ? `已扫描到 ${n} 个样式，${bad.length} 个加载失败` : `已扫描到 ${n} 个样式`, {
          tone: bad.length ? "warning" : "success",
        });
      } catch (err) {
        toast(`重新扫描失败：${err?.message ?? err}`, { tone: "error" });
      }
      break;

    /* 自定义样式：AI 引导弹层（需求：播放器样式后面的「自定义」按钮） */
    case "skin-help":
      openSkinHelp(ctx);
      break;

    /* 移除第三方样式（内置三款打包在程序里，所以卡片上不出现移除按钮） */
    case "skin-remove":
      confirmSkinRemove(actEl, ctx);
      break;

    /* AI 模型类型（决定思考开关的请求体字段） */
    case "ai-vendor": {
      const vendor = String(actEl.value || "auto");
      if (vendor === (state.config.aiVendor || "auto")) break;
      state.config.aiVendor = vendor;
      ctx.commit?.();
      ctx.render?.();
      const hint = aiVendorHint(vendor);
      toast(`模型类型已设为「${aiVendorLabel(vendor)}」${hint ? "：" + hint : ""}`, { duration: 3600 });
      break;
    }

    /* 窗口原生材质（Mica / Acrylic） */
    case "backdrop-mode": {
      const mode = BACKDROP_MODES.includes(actEl.value) ? actEl.value : "off";
      if (mode === (state.config.nativeBackdrop || "off")) break;
      state.config.nativeBackdrop = mode;
      ctx.commit?.();
      ctx.render?.();
      toast(
        mode === "off" ? "已关闭窗口原生材质，重启应用后生效" : `已选择「${backdropLabel(mode)}」，重启应用后生效`,
        { tone: "success", duration: 3200 }
      );
      break;
    }
    case "backdrop-restart": {
      if (!isWails()) {
        toast("浏览器预览无法重启应用", { tone: "warning" });
        break;
      }
      toast("正在重启应用…", { duration: 2000 });
      try {
        await backend.restartApp();
      } catch (err) {
        toast(`重启失败：${err?.message ?? err}`, { tone: "error", duration: 6000 });
      }
      break;
    }

    /* 响度均衡 */
    case "loudness-refresh": {
      if (!isWails()) return;
      await refreshLoudnessGains();
      const ls = await refreshLoudnessState();
      ctx.commit?.();
      toast(`已重新获取响度数据（已测量 ${ls?.measured ?? 0} 首）`, { tone: "success" });
      break;
    }
    case "loudness-clear": {
      if (!isWails()) return;
      openModal({
        title: "清除响度测量数据？",
        desc: "只会删除测量缓存，不会动你的音乐文件。清除后再次启用响度均衡会重新测量。",
        okText: "清除",
        danger: true,
        onOk: async () => {
          await backend.loudnessClear();
          state.loudnessGains = {};
          await refreshLoudnessState();
          ctx.commit?.();
          ctx.render?.();
          toast("已清除响度测量数据", { tone: "success" });
          return true;
        },
      });
      break;
    }

    case "loudness-target": {
      const v = Number(actEl.value);
      const prev = state.config.loudnessTarget;
      if (v === prev) break;
      state.config.loudnessTarget = v;
      ctx.commit?.();
      // 补偿标准变了 → 之前算好的补偿全部作废，按新标准重算
      await invalidateLoudnessForTarget();
      await refreshLoudnessState();
      ctx.render?.();
      toast("目标响度已切换，响度数据将重新计算", { tone: "success", duration: 3200 });
      break;
    }

    /* 在线歌曲：下载位置与封面 */
    case "download-dir-pick": {
      if (!isWails()) {
        toast("浏览器预览无法调用系统目录选择器", { tone: "warning" });
        break;
      }
      try {
        const res = await backend.downloadPickDir();
        if (res?.cancelled) break;
        await confirmDownloadDir(res, ctx);
      } catch (err) {
        toast(`无法更改下载位置：${err?.message ?? err}`, { tone: "error", duration: 6000 });
      }
      break;
    }
    case "download-dir-open": {
      if (!isWails()) break;
      try {
        await backend.downloadOpenDir(state.config.downloadDir || "");
      } catch (err) {
        toast(`打开失败：${err?.message ?? err}`, { tone: "error", duration: 5000 });
      }
      break;
    }
    case "download-dir-reset": {
      if (!isWails()) break;
      try {
        const res = await backend.downloadSetDir("");
        if (res?.cancelled) break;
        // SetDir 现在只返回「提案」，真正生效要等用户确认是否迁移
        const proposal = res?.next ? res : await backend.downloadSetDir("");
        await confirmDownloadDir(proposal, ctx);
      } catch (err) {
        toast(`恢复默认失败：${err?.message ?? err}`, { tone: "error", duration: 6000 });
      }
      break;
    }
    case "cache-open-covers":
    case "cache-open-lyrics": {
      if (!isWails()) break;
      try {
        await backend.coverOpenCacheDir(act === "cache-open-covers" ? "covers" : "lyrics");
      } catch (err) {
        toast(`打开缓存目录失败：${err?.message ?? err}`, { tone: "error", duration: 5000 });
      }
      break;
    }
    case "cover-refresh": {
      if (!isWails()) break;
      try {
        const stats = await backend.coverClearCache();
        state.coverCache = await backend.coverCacheStats();
        await refreshCoverProviders();
        ctx.commit?.();
        ctx.render?.();
        toast(`已清空缓存（封面 ${stats?.covers ?? 0} 张、歌词 ${stats?.lyrics ?? 0} 份）`, { tone: "success" });
      } catch (err) {
        toast(`清空失败：${err?.message ?? err}`, { tone: "error", duration: 5000 });
      }
      break;
    }

    /* 把缓存里已有的封面/歌词补写进歌曲文件 */
    case "embed-cache-write":
      await promptEmbedExistingCache({ ctx, force: true });
      break;

    default:
      break;
  }
}

/* --------------------------------------------------------------------------
   把缓存里的封面/歌词补写进歌曲文件
   --------------------------------------------------------------------------
   需求：设置里的「把封面/歌词写进歌曲文件」在打开时要提示「是否把已有的缓存
   写入到文件中」。
   实现上分成两个入口，指向同一个动作：
     · 打开那个开关时弹一次提示（只在缓存里真的有东西可写时才弹，避免空打扰）；
     · 开关旁边常驻一个按钮，用户以后想补写随时可以点。
   真正写文件之前**一定**要用户确认 —— 这会改写他自己的音乐文件。
   -------------------------------------------------------------------------- */

/**
 * 「要不要把已有缓存写进文件」这一个提示，两个入口共用：
 *   · 打开「把封面/歌词写进歌曲文件」开关时（force=false，缓存为空就安静跳过）；
 *   · 点「写入缓存到文件」按钮时（force=true，缓存为空也要说清楚为什么没得写）。
 *
 * 缓存统计是异步回来的，所以这里先等一小会儿：拿到准确数量比弹两次框更不打扰。
 */
async function promptEmbedExistingCache({ ctx = {}, force = false } = {}) {
  if (!isWails()) {
    // 浏览器预览没有后端，也就没有可写的文件，别弹一个点了没反应的框
    if (force) toast("写入歌曲文件需要后端支持，浏览器预览不可用", { tone: "warning" });
    return;
  }

  // 缓存统计是异步回来的，先等一下；点按钮进来的话再主动补拉一次，
  // 免得因为「刚打开设置就点」而误报「没有可写的内容」。
  for (let i = 0; i < 20 && !state.coverCache; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!state.coverCache && force) {
    try {
      state.coverCache = await backend.coverCacheStats();
    } catch {
      /* 拿不到就按「没有」处理，下面的提示会说明 */
    }
  }

  if (cachedMetaCount() === 0) {
    if (force) {
      toast(state.coverCache ? "缓存里还没有封面或歌词，暂时没有可写入的内容" : "暂时读不到缓存统计，请稍后再试", {
        duration: 3400,
      });
    } else {
      // 打开开关时：缓存里没东西可写就别弹框，用一句提示说明「以后会自动写」
      if (state.coverCache) {
        toast("已开启：以后下载 / 更换封面时会把封面与歌词写进歌曲文件", { duration: 3600 });
      }
    }
    return;
  }

  const covers = Number(state.coverCache?.covers) || 0;
  const lyrics = Number(state.coverCache?.lyrics) || 0;
  openModal({
    title: "要把已有的缓存写进歌曲文件吗？",
    body: html` <div class="setting__hint">
        缓存目录里已经有 <b>${fmtCount(covers)}</b> 张封面、<b>${fmtCount(lyrics)}</b> 份歌词。
        它们现在只放在缓存目录里；写进歌曲文件之后，把文件拷到别的播放器上也能看到。
      </div>
      <div class="setting__hint">
        写入只会在原文件的标签里做最小插入 / 替换（m4a 的 covr 与 ©lyr、FLAC 的 PICTURE 与 LYRICS），
        不动音频数据；mp3、wav、ogg 等格式会被跳过。这一步无法撤销，但不会影响播放。
      </div>`,
    okText: "写入文件",
    cancelText: "暂不写入",
    onOk: async () => {
      await runEmbedCache(ctx);
      return true;
    },
  });
}

async function runEmbedCache(ctx = {}) {
  const progress = toast("正在把缓存写入歌曲文件…", { duration: 0 });
  // 批量写入可能要跑几十秒到几分钟。后端一直在发 meta:embed-progress，
  // 以前前端没人订阅，界面只有一句「正在进行」——用户分不清是在推进还是卡死。
  const offProgress = on("meta:embed-progress", (payload) => {
    const done = Number(payload?.done) || 0;
    const total = Number(payload?.total) || 0;
    const title = payload?.title ? " · " + payload.title : "";
    progress.update(total ? "正在写入歌曲文件 " + done + "/" + total + title : "正在把缓存写入歌曲文件…");
  });
  try {
    const res = await backend.coverWriteCacheToFiles();
    const written = Number(res?.written) || 0;
    const skipped = Number(res?.skipped) || 0;
    const failed = Number(res?.failed) || 0;
    const total = Number(res?.total) || 0;

    progress.close();
    if (!total) {
      toast("缓存里还没有封面或歌词，暂时没有可写入的内容", { duration: 3200 });
      return;
    }

    let text = `已写入 ${fmtCount(written)} 首`;
    if (res?.covers) text += `（封面 ${fmtCount(res.covers)}）`;
    if (res?.lyrics) text += `（歌词 ${fmtCount(res.lyrics)}）`;
    if (skipped) text += `，跳过 ${fmtCount(skipped)} 首`;
    if (failed) text += `，失败 ${fmtCount(failed)} 首`;
    toast(text, {
      tone: failed ? "warning" : skipped ? "info" : "success",
      duration: 5200,
    });

    // 跳过的原因值得让用户看到（多数是「这个格式不支持写标签」）
    const reasons = Array.isArray(res?.reasons) ? res.reasons : [];
    if (reasons.length) {
      openModal({
        title: failed ? "部分歌曲没能写入" : "部分歌曲已跳过",
        body: html`<div class="setting__hint setting__hint--steps">
          ${reasons.map((r, i) => html`${i ? html`<br />` : nothing}${r}`)}
        </div>`,
        okText: "知道了",
        cancelText: "关闭",
        onOk: () => true,
      });
    }

    state.coverCache = await backend.coverCacheStats();
    ctx.commit?.();
    ctx.render?.();
  } catch (err) {
    progress.close();
    toast(`写入失败：${err?.message ?? err}`, { tone: "error", duration: 6000 });
  } finally {
    offProgress();
  }
}

/* --------------------------------------------------------------------------
   更改下载目录：先问用户要不要迁移已有文件
   --------------------------------------------------------------------------
   需求：更改默认歌曲下载路径时弹提示，问用户是否把下载的歌曲迁移到新目录。
   后端 PickDir / SetDir 只返回「提案」（含旧目录里有多少个音频文件），
   用户确认后才调 ApplyDir 真正生效 —— 这样「取消」不会留下改了一半的状态。
   -------------------------------------------------------------------------- */
async function confirmDownloadDir(proposal, ctx) {
  if (!proposal || proposal.cancelled) return;
  const next = proposal.next;
  if (!next) return;

  if (proposal.same) {
    toast("这已经是当前的下载目录", { duration: 2200 });
    return;
  }

  const count = Number(proposal.count) || 0;
  const sizeMB = ((Number(proposal.bytes) || 0) / 1024 / 1024).toFixed(1);
  const nextCount = Number(proposal.nextCount) || 0;

  // 旧目录没有歌曲 → 没什么可迁移的，直接改（少一次打扰）
  if (count === 0) {
    await applyDownloadDir(next, false, ctx);
    return;
  }

  const body = html` <div class="setting__hint">
      当前下载目录里有 <b>${fmtCount(count)}</b> 首歌曲（约 ${sizeMB} MB）。 要一并搬到新目录吗？
    </div>
    <div class="dir-compare">
      <div class="dir-compare__row">
        <span class="dir-compare__tag">从</span>
        <span class="dir-compare__path u-selectable">${proposal.current || ""}</span>
      </div>
      <div class="dir-compare__row">
        <span class="dir-compare__tag">到</span>
        <span class="dir-compare__path u-selectable">${next}</span>
      </div>
    </div>
    ${
      nextCount
        ? html`<div class="setting__hint">新目录里已经有 ${fmtCount(nextCount)} 首歌曲，同名的不会被覆盖。</div>`
        : nothing
    }
    <div class="setting__hint">不迁移的话，旧目录里的歌曲会留在原地；新目录会成为新的默认保存位置。</div>`;

  openModal({
    title: "更改下载位置",
    body,
    okText: "迁移并更改",
    cancelText: "不迁移，只更改位置",
    onOk: async () => {
      await applyDownloadDir(next, true, ctx);
      return true;
    },
    onCancel: async () => {
      await applyDownloadDir(next, false, ctx);
    },
  });
}

async function applyDownloadDir(dir, migrate, ctx) {
  try {
    const res = await backend.downloadApplyDir(dir, migrate);
    if (res?.dir) state.config.downloadDir = res.dir;
    ctx.commit?.();
    ctx.render?.();

    if (!migrate) {
      toast(`下载位置已改为：${res?.dir || dir}`, { tone: "success", duration: 3200 });
      return;
    }
    const moved = Number(res?.migrated) || 0;
    const skipped = Number(res?.skipped) || 0;
    const failed = Array.isArray(res?.failed) ? res.failed : [];
    let text = `已迁移 ${fmtCount(moved)} 首`;
    if (skipped) text += `，跳过 ${fmtCount(skipped)} 首（新目录已有同名文件）`;
    if (failed.length) text += `，${fmtCount(failed.length)} 首失败`;
    toast(`${text}；新位置：${res?.dir || dir}`, {
      tone: failed.length ? "warning" : "success",
      duration: 4200,
    });
  } catch (err) {
    toast(`更改下载位置失败：${err?.message ?? err}`, { tone: "error", duration: 6000 });
  }
}

/* --------------------------------------------------------------------------
   在线封面来源信息
   -------------------------------------------------------------------------- */

/**
 * 拉取后端注册的封面来源与熔断状态。
 *
 * 单独放在 settings.js 里（而不是塞进主 tick）：它只在打开设置页时才需要，
 * 而来源可用性来自第三方接口，不需要实时刷新。
 */
export async function refreshCoverProviders() {
  if (!isWails()) {
    state.coverProviders = [];
    state.coverBreaker = {};
    return null;
  }
  try {
    const res = await backend.coverProviders();
    state.coverProviders = Array.isArray(res?.providers) ? res.providers : [];
    state.coverBreaker = res?.breaker && typeof res.breaker === "object" ? res.breaker : {};
    return res;
  } catch {
    state.coverProviders = [];
    state.coverBreaker = {};
    return null;
  }
}

/** 只拉一次（打开设置页时触发），避免每次重绘都打后端 */
let coverProvidersRequested = false;

export function ensureCoverProviders() {
  if (coverProvidersRequested) return;
  coverProvidersRequested = true;
  // 缓存统计也一起拉：设置里的「缓存目录」「写入缓存到文件」都要用到它，
  // 拿不到就只能显示「正在读取…」，用户会觉得界面坏了。
  const stats = isWails()
    ? backend
        .coverCacheStats()
        .then((s) => {
          state.coverCache = s;
          return s;
        })
        .catch(() => null)
    : Promise.resolve(null);

  Promise.all([refreshCoverProviders(), stats]).then(() => {
    // 主题 / 来源 / 缓存概况都是 Lit 组件之外的数据：广播一次让设置层重新求值依赖。
    // 迁移前这里要手工找到那几处 DOM 就地改写（refreshOnlineCard / refreshCacheHints），
    // 现在由组件的依赖数组覆盖，不再需要「改哪一处文案」的隐性分工。
    requestAppUpdate();
  });
}

export function promptPath({ manual = false } = {}) {
  return new Promise((resolve) => {
    openModal({
      title: "添加音乐文件夹",
      desc: manual
        ? "系统目录选择器没能打开，请直接粘贴文件夹完整路径。"
        : "浏览器预览模式下无法调用系统目录选择器，请手动输入路径。",
      body: html`<input class="input" data-field="path" type="text" placeholder="C:\\Users\\Example\\Music" />`,
      okText: "添加",
      onOk: (values) => {
        const p = String(values.path || "").trim();
        if (!p) return "请输入路径";
        resolve(p);
        return true;
      },
    });
  });
}

/* --------------------------------------------------------------------------
   通用设置控件（开关 / 分段 / 滑杆）
   -------------------------------------------------------------------------- */
export function handleSettingControl(actEl, ctx = {}) {
  const toggleKey = actEl.dataset.toggle;
  if (toggleKey) {
    const next = actEl.getAttribute("aria-checked") !== "true";

    // 桌面歌词 / 桌面背景歌词必须在**写 state.config 之前**处理：
    // applyDesktopMode 要靠「改动前是什么」判断这次该开哪个窗口，
    // 提前把值写掉它就会以为「没变化」而跳过开窗。
    // 两个开关是一组单选，所以走同一个入口（它会顺手把另一个关掉）。
    if (toggleKey === "showDesktopLyrics" || toggleKey === "showDesktopWallpaper") {
      const mode = toggleKey === "showDesktopLyrics" ? (next ? "lyrics" : "off") : next ? "wallpaper" : "off";
      applyDesktopMode(mode).then((res) => {
        // 按钮的选中态由 sync*Buttons 按配置写，这里只补「失败」的提示：
        // 桌面背景歌词依赖系统的桌面窗口结构，确实会开不起来，得说清原因
        if (res.ok === false) {
          toast(`打不开：${res.reason || res.error || "未知原因"}`, { tone: "warning", duration: 3200 });
        }
        ctx.commit?.();
      });
      ctx.commit?.();
      return true;
    }

    actEl.setAttribute("aria-checked", String(next));
    if (toggleKey in state.config) {
      state.config[toggleKey] = next;
      if (toggleKey === "animations") {
        // 重新按当前「过渡速度」算一遍 --dur：关掉是 0.001ms，打开则回到该档时长
        setRuntimeToken("--dur", animationDurationValue(state.config));
      }
      if (toggleKey === "minimizeToTray") {
        // 除了写配置（commit 会推给后端），还要立刻让后端创建/销毁托盘图标，
        // 否则用户拨了开关要等下次启动才看到托盘
        if (isWails()) {
          backend.minimizeToTray(next).catch((err) => {
            console.warn("[settings] 同步托盘开关失败", err);
          });
        }
      }
      if (toggleKey === "watchFolders") {
        state.folders.forEach((f) => (f.watching = next));
        // 必须通知后端：以前只改前端配置与徽标，fsnotify 的监听根在本次运行里
        // 完全不变 —— 表现是「开关拨了、界面变了、实际开关无效」。
        // 后端 SetWatchers 会写配置并刷新监听（含「启动时没有文件夹」的补启动）。
        if (isWails()) {
          backend.setWatchers(next).catch((err) => {
            console.warn("[settings] 切换实时监听失败", err);
          });
        }
      }
    }
    ctx.commit?.();
    // 打开「把封面/歌词写进歌曲文件」时，缓存里往往已经有一批封面与歌词了。
    // 这里问一次要不要顺手补写进文件（需求原文），不写也不会做任何事。
    if (toggleKey === "embedMeta" && next) {
      promptEmbedExistingCache();
    }
    return true;
  }

  const segKey = actEl.closest("[data-segment]")?.dataset.segment;
  if (segKey) {
    const value = actEl.dataset.value;
    actEl.parentElement.querySelectorAll(".segmented__btn").forEach((b) => {
      b.setAttribute("aria-pressed", String(b === actEl));
    });
    if (segKey === "themeMode") {
      state.config.themeMode = value;
      const themes = listThemes();
      const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const preferred = value === "system" ? (sysDark ? "dark" : "light") : value;
      const t = themes.find((x) => x.mode === preferred && x.id !== "cover-dark") || themes[0];
      state.config.theme = t.id;
      applyResolvedTheme(state.config);
    } else if (segKey in state.config) {
      const numeric = ["lyricsLines", "scanConcurrency"];
      state.config[segKey] = numeric.includes(segKey) ? Number(value) : value;
      if (segKey === "lyricsLines") {
        setRuntimeToken("--lyric-pad", `${50 - Number(value) * 4}%`);
      }
      if (segKey === "animationsSpeed") {
        // 立即生效、并且立刻看得见（弹出层本身就是这段动效的展示窗口）
        setRuntimeToken("--dur", animationDurationValue(state.config));
      }
      if (segKey === "loudnessMode") {
        // 模式切换后需要重新拉取补偿增益表（off→on 或 track↔album）
        refreshLoudnessGains();
      }
      if (segKey === "windowCorners") {
        // 圆角是运行期可写的 DWM 属性：立刻推给后端，点完就能看到（不用重启）
        if (isWails()) {
          backend.setWindowCorners(value).catch((err) => {
            console.warn("[settings] 设置窗口圆角失败", err);
          });
        }
      }
    }
    ctx.commit?.();
    return true;
  }

  return false;
}
