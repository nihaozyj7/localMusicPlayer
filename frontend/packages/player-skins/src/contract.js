// @ts-check
/* ==========================================================================
   contract.js — 播放界面插件（样式）的统一接口 · **契约 v3**
   --------------------------------------------------------------------------
   这个文件是「宿主」与「样式插件」之间唯一的契约。
   宿主是播放器主程序（frontend/src/js/skinhost.js / playerhost.js），
   插件是任意来源的一个目录（随包分发的内置样式 / 用户丢进数据目录的第三方样式）。

   分工：
     · 宿主负责**数据与环境**：播放进度、当前曲目、封面集合、歌词文本（含联网匹配与
       缓存）、设置项、主题、窗口尺寸、实时频谱采样、以及一套可复用的渲染 SDK。
     · 插件负责**呈现与交互**：播放详情页里画什么、怎么排、点什么做什么。
       宿主的 DOM 里只留一个空的挂载点，插件内部结构宿主一概不碰。
     · 信息变化由宿主**主动推**（`update(ctx, patch)` + `ctx.on(type, fn)`），
       插件不需要轮询，也不需要 import 宿主内部模块。

   ★ v3 相对 v2 的**破坏性**变化（现在没有第三方样式在野，是重写成本最低的窗口）：
     1. 插件包格式改为「清单（skin.json）+ 入口 + 自带 CSS/图标/私有模块」，
        `apiVersion` 从 `skin.js` 移到 `skin.json`，版本号改为语义化字符串
        （`"3.0"`，major 严格相等、minor 向后兼容，见 apiStatus）。
     2. 插件**零 import**：不再 `import` 包内模块（`../html.js` 之类），
        公共能力全部从 `ctx.sdk` 取（歌词渲染器 / 背景层 / LRC / 工具）。
     3. 插件 CSS 由**宿主强制包裹** `@layer skin { @scope (<舞台根>) { … } }`：
        作者不必再自己写作用域前缀，也**改不到宿主壳**（标题栏 / 底栏 / 浮层）。
     4. 新增 `colors` 声明：插件用自己的 bg / fg 描述画面配色，宿主据此保证
        **自己的控件栏与浮层在任何插件配色下都可读**（详见 colors.js）。
        缺失时降级用主题配色，并在设置页该样式卡片上打警告图标。
     5. 修正 v2 的四处契约漂移：`ctx.spectrum`（从未写进契约）、歌词对象的
        `status/statusText`（实际存在）、`song` 里的 `path/online`（提示词写错，
        实际只给 5 个字段）、以及第二宿主残留的 `ctx.audio`。
   ========================================================================== */

/**
 * 宿主实现的契约基线版本（语义化字符串）。
 *
 * · `major` **必须严格相等**：3.x 的宿主只加载 3.x 的插件；
 * · `minor` 向后兼容：宿主 `3.2` 能加载声明 `3.0` / `3.1` 的插件；
 *   插件声明得比宿主新（例如插件 `3.2` / 宿主 `3.0`）会被拒绝，并说明原因。
 */
export const SKIN_API_VERSION = "3.0";

/** 宿主自己的实现版本（可以比基线新；比基线新的字段对老插件只是"用不到"） */
export const HOST_API_VERSION = "3.0";

/**
 * 宿主推给插件的更新类型。
 *
 * 名字沿用 v2（`song` / `media` / `close` / `destroy`）—— 重命名收益低、回归面大；
 * v3 只**新增** `visibility` 与 `chrome`，并在文档里把每个类型的载荷写清楚。
 *
 * 设计要点：`song` 是「换歌」这一件事的完整快照（曲目 + 封面 + 歌词），
 * 插件可以在 mount 之后只靠它就把界面填满；其余类型都是增量的高频更新。
 * 之所以不做成「一个大对象每帧全推」，是因为歌词行高亮要跟随进度走，
 * 每帧重排整个曲目信息会白白触发大量 DOM 写入。
 */
export const PATCH_TYPES = [
  "mount", // 挂载完成（mount 之后立即推一次，携带全量快照）
  "song", // 换歌：{ song, cover, covers, coverIndex, lyrics }
  "media", // 封面变化 / 轮播切图：{ cover, covers, coverIndex }
  "lyrics", // 歌词装载完成或更新：{ lyrics }
  "progress", // 播放进度（宿主已按帧节流）：{ position, duration, playing, lyricIndex }
  "state", // 播放状态变化（播放/暂停/音量/静音）：{ playing, volume, muted }
  "spectrum", // 实时频谱（宿主采样，约 30Hz）：{ bands: number[] | null }
  "options", // 设置项变化：{ options }
  "theme", // 主题/深浅色变化：{ themeId, mode }
  "resize", // 舞台尺寸变化：{ width, height }
  "visibility", // 详情页打开/关闭：{ foreground: boolean }（插件据此停帧）
  "chrome", // 宿主壳配色已按插件声明算好：{ fg, bg, accent }（只读对拍用）
  "close", // 播放详情页关闭
  "destroy", // 插件即将被卸载（destroy 之前推最后一次）
];

/* --------------------------------------------------------------------------
   插件清单（skin.json）
   -------------------------------------------------------------------------- */

/**
 * @typedef {Object} SkinManifest
 * @property {string} id 必须与目录名一致
 * @property {string} name 显示名
 * @property {string} [version] 插件自身版本（排错用）
 * @property {string} apiVersion 契约版本，形如 "3.0"
 * @property {string} [author]
 * @property {string} [description]
 * @property {string} [entry] 入口文件，默认 skin.js
 * @property {string[]} [styles] CSS 文件；缺省 = 目录内顶层所有 *.css
 * @property {{file?: string, sprite?: string}} [icon] 自带图标文件优先；缺省用 sprite 或 "disc"
 * @property {number} [order] 按钮组排序：内置 10~90，第三方建议 ≥ 200
 * @property {SkinCapabilities} [capabilities]
 * @property {SkinColors} [colors] 见 colors.js —— 宿主 UI 可见性的依据
 * @property {{budgetFps?: number}} [performance] performanceMode 下的目标帧率
 */

/**
 * 能力声明：宿主据此决定采不采样、给不给背景层容器、允不允许交互。
 *
 * @typedef {Object} SkinCapabilities
 * @property {number|boolean} [spectrum] 需要实时频谱；数字 = 段数（1~128），true = 32 段。
 *   未声明时宿主**一次都不采样**（省掉后端算频谱的开销）。
 * @property {boolean} [background] true = 需要「整窗背景层」容器（ctx.backgroundRoot）。
 *   宿主同时会把 `.app` 的 `data-skin-background` 置为 yes —— 宿主壳会据此退成半透明，
 *   这正是 v2 里靠 `data-mode="immersive"` 写死的那件事。
 * @property {boolean} [interactive] 默认 true。false = 宿主可能把插件挂到"只能看"的舞台
 *   （桌面背景歌词窗口），插件应当去掉可点/可聚焦/悬停反馈。
 * @property {boolean} [paintSelf] 默认 true。false = 宿主负责画最基本的曲名/歌词兜底。
 */

/**
 * 配色声明：插件用来自我描述"我的画面大体是什么颜色"。
 *
 * ★ 这不是宿主的样式来源，而是宿主保证自己 UI 可读性的输入：
 *   · bg      —— 插件画面的主底色
 *   · fg      —— 插件画面上主要文字/图标的颜色
 *   · accent  —— 可选强调色；缺省用宿主主题的 --accent
 *
 * 任何一项缺失/非法 → 宿主该处**降级用主题配色**，并在设置页该样式卡片上打警告图标。
 * 宿主还会做对比度兜底（fg/bg 对比度不足时自动换成黑或白），详见 colors.js。
 *
 * ★ `theme: true` 是给"跟随宿主主题"的样式用的合法写法（内置的经典/沉浸就是）：
 *   它的画面底色/前景都取自主题令牌，没有固定的 bg/fg 可声明。声明了 theme 就不再
 *   打"未声明配色"的警告 —— 宿主本来就是要用主题配色画自己的壳。
 *   随着封面取色而变的样式，用 `ctx.actions.reportBackdrop()` 动态上报实际颜色。
 *
 * @typedef {Object} SkinColors
 * @property {string} [bg]
 * @property {string} [fg]
 * @property {string} [accent]
 * @property {boolean} [theme] 画面跟随宿主主题（与 bg/fg 二选一）
 */

/* --------------------------------------------------------------------------
   插件拿到的数据与环境
   -------------------------------------------------------------------------- */

/**
 * @typedef {Object} SkinPlayback
 * @property {number} position 毫秒
 * @property {number} duration 毫秒
 * @property {boolean} playing
 * @property {number} volume 0..1
 * @property {boolean} muted
 */

/**
 * @typedef {Object} SkinLyrics
 * @property {Array<{time:number,text:string}>} lines 已解析并应用过偏移的 LRC 行
 * @property {string} text 原始 LRC 文本
 * @property {string} source none | embedded | lrc-file | cache | online | preview
 * @property {string} status none | loading | matching | failed | ok
 * @property {string} statusText 空态文案（有歌词时是空串）
 * @property {number} index 当前高亮行（-1 = 还没到第一句）
 */

/**
 * @typedef {Object} SkinMedia
 * @property {SkinTrack|null} song 曲目（宿主裁好的视图，见 SkinTrack）
 * @property {string} cover 当前生效封面（data URL 或同源 URL）
 * @property {string[]} covers 全部封面（轮播用；至少一张）
 * @property {number} coverIndex 轮播当前下标
 * @property {SkinLyrics} lyrics
 */

/**
 * 交给插件渲染的曲目视图。**只有这几个字段**：宿主不把内部曲目对象
 * （本地路径、所属文件夹、来源标记…）递出去 —— 那会让内部结构变成对外契约。
 * 需要打开文件位置之类的操作，用 ctx.actions。
 *
 * 注意 `kind` 是 v3 新增：插件可以据此给「在线试听」加标记，但拿不到 URL。
 *
 * @typedef {Object} SkinTrack
 * @property {string} id 稳定标识（换歌判定用）
 * @property {string} title
 * @property {string} artist
 * @property {string} album
 * @property {number} duration 毫秒
 * @property {"local"|"online"} kind
 */

/**
 * @typedef {Object} SkinOptions
 * @property {boolean} showLyrics
 * @property {number} lyricsFontSize
 * @property {boolean} animations
 * @property {boolean} coverCarousel
 * @property {number} coverCarouselInterval
 * @property {boolean} interactive 宿主是否允许交互（桌面背景歌词窗口为 false）
 * @property {"smooth"|"performance"} performanceMode 背景动效帧率档位
 * @property {number} budgetFps performance 档下清单声明的目标帧率（缺省 30）
 */

/**
 * 运行环境快照（v3 新增，把散在 getter / resize 补丁里的东西集中起来）。
 *
 * @typedef {Object} SkinEnv
 * @property {string} themeId
 * @property {"dark"|"light"} mode
 * @property {number} width 舞台宽（px）
 * @property {number} height 舞台高（px）
 * @property {number} dpr 设备像素比
 * @property {boolean} reducedMotion 用户是否要求减少动效
 * @property {boolean} foreground 详情页是否处于前台（同 visibility 补丁）
 */

/**
 * 宿主提供的可复用渲染 SDK（v3 新增；插件零 import 的替代品）。
 *
 * 这些都是"零件"，不是"皮肤"：插件用不用、怎么拼都是自由。
 *
 * @typedef {Object} SkinSdk
 * @property {(skin: any) => any} define 形状校验（可选：宿主加载时已经校验过清单与入口）
 * @property {Function} createLyricsView 滚动歌词渲染器
 * @property {Function} createFxLyrics 特效歌词渲染器（逐字入场 / 卡拉OK）
 * @property {Function} createCamera 运镜（分层视差 + 机位切换 + 手持微动）
 * @property {Function} createBackgroundLayer 整窗背景层
 * @property {Function} applyFit 把「舞台短边 / 基准短边」写进自定义属性
 * @property {Function} fitScale
 * @property {Function} fitScaleOf
 * @property {Function} parseLrc
 * @property {Function} findLyricIndex
 * @property {Function} formatLrcTime
 * @property {Object} html { EMPTY_TRACK, escapeHtml, setCoverImage, subtitleOf, lyricsEmptyText }
 * @property {Object} util { clamp, esc, debounce }
 * @property {string} version SDK 版本（= HOST_API_VERSION）
 */

/**
 * @typedef {Object} SkinContext 宿主上下文（插件拿到的唯一入口）
 * @property {HTMLElement} root 插件自己的挂载点（宿主已清空）
 * @property {HTMLElement} backgroundRoot 整窗背景层的容器（宿主已就位，按需填充）
 * @property {() => SkinPlayback} playback 播放进度快照
 * @property {() => SkinMedia} media 曲目/封面/歌词快照（聚合，等价于 track+covers+lyrics）
 * @property {() => SkinTrack|null} track 当前曲目
 * @property {() => SkinLyrics} lyrics 当前歌词
 * @property {() => {list:string[],index:number,current:string}} covers 封面集合
 * @property {() => SkinOptions} options 显示相关设置
 * @property {() => SkinEnv} env 运行环境（尺寸 / 主题 / 清晰度 / 前后台）
 * @property {SkinSdk} sdk 可复用渲染 SDK
 * @property {(type: string, fn: (patch: any) => void) => () => void} on 订阅宿主推送
 * @property {SkinActions} actions 受控动作（不要在插件里直接操作宿主状态）
 * @property {string} defaultCover 封面加载失败时的兜底图（内联 SVG data URL）
 * @property {string} themeId 当前主题 id（getter）
 * @property {string} mode dark | light（getter）
 * @property {boolean} interactive 是否允许交互（= options().interactive）
 */

/**
 * @typedef {Object} SkinActions
 * @property {(ms:number) => void} seek 跳转到某个毫秒位置
 * @property {(deltaMs:number) => void} seekBy 相对跳转（歌词点句常用）
 * @property {(ratio:number) => void} seekRatio 按 0..1 比例跳转（自定义进度条用）
 * @property {() => void} togglePlay
 * @property {() => void} next
 * @property {() => void} prev
 * @property {() => void} toggleLike 收藏/取消收藏
 * @property {() => void} like
 * @property {() => void} unlike
 * @property {() => void} openFolder 在资源管理器里定位当前文件
 * @property {() => void} openCoverPanel 打开封面面板
 * @property {() => void} openLyricsPanel 打开宿主歌词面板
 * @property {(c: SkinColors) => void} reportBackdrop 随封面取色的插件低频上报自己当前配色
 */

/**
 * @typedef {Object} PlayerSkin
 * @property {string} id
 * @property {string} name
 * @property {string} [icon] 解析后的图标：sprite id 或图标文件 URL
 * @property {string} [iconUrl] 图标文件 URL（有则优先于 icon）
 * @property {number} [order]
 * @property {string} [version]
 * @property {string} [author]
 * @property {string} [description]
 * @property {string} [apiVersion]
 * @property {boolean} [background]
 * @property {number|boolean} [spectrum]
 * @property {boolean} [interactive]
 * @property {boolean} [paintSelf]
 * @property {number} [budgetFps]
 * @property {SkinColors} [colors]
 * @property {string[]} [colorsMissing] 缺失/非法的颜色键（设置页打警告图标用）
 * @property {ReturnType<typeof import("./colors.js").deriveChrome>} [chrome]
 *   由加载器算好的壳层配色（变量表 / 缺失项 / 对比度自检结果）。
 *   宿主直接用它的结果，避免"同一套推导在两个地方各算一遍"。
 * @property {string[]} [styles] CSS 相对路径（宿主负责注入并包裹作用域）
 * @property {boolean} [builtin] 是否内置样式
 * @property {string} [source] 来源描述（目录名 / 根目录，便于排错）
 * @property {(ctx: SkinContext) => void} mount
 * @property {(ctx: SkinContext, patch: {type: string} & Record<string, any>) => void} [update]
 * @property {(ctx: SkinContext) => void} [destroy]
 */

/* --------------------------------------------------------------------------
   版本与形状校验
   -------------------------------------------------------------------------- */

/** 皮肤必须实现的字段（生命周期） */
const REQUIRED = ["id", "mount"];

/**
 * 解析 `major.minor` 形式的版本号；无法解析返回 null。
 * @param {unknown} v
 * @returns {{major:number, minor:number, raw:string}|null}
 */
export function parseApiVersion(v) {
  const s = String(v ?? "").trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2] ?? 0), raw: s };
}

/**
 * 判断一个插件声明的契约版本能否被本宿主加载。
 *
 * 规则（设计文档 §7）：
 *   · major 必须严格相等；
 *   · minor 允许插件比宿主旧，不允许比宿主新（宿主不知道该给新字段填什么）。
 *
 * @param {unknown} declared 插件声明的 apiVersion
 * @returns {{ok:boolean, reason?:string}}
 */
export function apiStatus(declared) {
  const plugin = parseApiVersion(declared);
  if (!plugin) return { ok: false, reason: `apiVersion 非法：${JSON.stringify(declared)}（应形如 "3.0"）` };
  const host = parseApiVersion(HOST_API_VERSION);
  if (!host) return { ok: false, reason: "宿主版本号异常" };
  if (plugin.major !== host.major) {
    return { ok: false, reason: `契约主版本不匹配：插件要求 ${plugin.raw}，宿主是 ${host.raw}（主版本必须相同）` };
  }
  if (plugin.minor > host.minor) {
    return { ok: false, reason: `插件要求契约 ${plugin.raw}，宿主只实现到 ${host.raw}（请升级应用）` };
  }
  return { ok: true };
}

/**
 * 把「清单 + 入口模块」合成一个皮肤对象：补默认值 + 校验 + 一致性地对拍。
 *
 * 为什么要合成而不是直接用模块导出：v3 起**元数据在清单里**（id/name/icon/order/
 * capabilities/colors/apiVersion），模块只负责生命周期。清单是运维侧信息、模块是
 * 代码侧信息，两者分开之后，改显示名/排序/配色不需要动代码。
 *
 * @param {any} mod `import()` 的结果
 * @param {SkinManifest} manifest 清单（已过 schema 校验的原始对象）
 * @param {{builtin?:boolean, source?:string, iconUrl?:string, colorsMissing?:string[]}} [meta]
 * @returns {PlayerSkin}
 */
export function composeSkin(mod, manifest, meta = {}) {
  const candidate = mod?.default ?? mod?.skin ?? null;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("入口模块没有导出插件对象（应为 `export default { … }`）");
  }
  for (const key of REQUIRED) {
    if (key === "id") continue; // id 以清单为准（模块里可以不写）
    if (!candidate[key]) throw new Error(`插件缺少必需字段：${key}`);
  }
  if (typeof candidate.mount !== "function") {
    throw new Error(`插件 ${manifest.id} 的 mount 必须是函数`);
  }
  // 模块里若也写了 apiVersion / id，必须与清单一致：不一致时报错，
  // 而不是"以谁为准"地静默二选一（那种沉默会让作者查很久）。
  if (candidate.apiVersion != null && String(candidate.apiVersion) !== String(manifest.apiVersion)) {
    throw new Error(
      `apiVersion 不一致：清单是 ${manifest.apiVersion}，入口模块写的是 ${candidate.apiVersion}（请只保留一处）`
    );
  }
  if (candidate.id != null && String(candidate.id) !== String(manifest.id)) {
    throw new Error(`id 不一致：清单是 ${manifest.id}，入口模块写的是 ${candidate.id}`);
  }

  const cap = manifest.capabilities || {};
  const colors = manifest.colors && typeof manifest.colors === "object" ? manifest.colors : {};
  const perf = manifest.performance || {};

  return {
    // —— 元数据（清单优先）——
    id: String(manifest.id),
    name: String(manifest.name ?? candidate.name ?? manifest.id),
    apiVersion: String(manifest.apiVersion),
    version: String(manifest.version ?? ""),
    author: String(manifest.author ?? ""),
    description: String(manifest.description ?? candidate.description ?? ""),
    icon: manifest.icon?.sprite ? String(manifest.icon.sprite) : "disc",
    iconUrl: meta.iconUrl || "",
    order: Number.isFinite(Number(manifest.order)) ? Number(manifest.order) : 100,
    // —— 能力 ——
    background: cap.background === true,
    spectrum: cap.spectrum === undefined ? false : cap.spectrum,
    interactive: cap.interactive !== false,
    paintSelf: cap.paintSelf !== false,
    budgetFps: Number.isFinite(Number(perf.budgetFps)) ? Number(perf.budgetFps) : 30,
    // —— 配色（缺失项由设置页打警告；宿主按主题降级）——
    colors,
    colorsMissing: meta.colorsMissing || [],
    // —— 其它 ——
    styles: Array.isArray(manifest.styles) ? manifest.styles.map(String) : [],
    builtin: meta.builtin === true,
    source: meta.source || "",
    // —— 生命周期（模块提供）——
    mount: candidate.mount,
    update: typeof candidate.update === "function" ? candidate.update : null,
    destroy: typeof candidate.destroy === "function" ? candidate.destroy : null,
  };
}

/**
 * 把「已经校验过清单」的插件声明成皮肤对象（保留给宿主内部/测试使用）。
 *
 * @param {Partial<PlayerSkin> & {id:string, mount:Function}} skin
 * @returns {PlayerSkin}
 */
export function defineSkin(skin) {
  if (!skin || typeof skin !== "object") throw new Error("皮肤必须是一个对象");
  if (!skin.id) throw new Error("皮肤缺少必需字段：id");
  if (typeof skin.mount !== "function") throw new Error(`皮肤 ${skin.id} 的 mount 必须是函数`);
  const st = apiStatus(skin.apiVersion ?? SKIN_API_VERSION);
  if (!st.ok) throw new Error(`皮肤 ${skin.id}：${st.reason}`);
  return /** @type {PlayerSkin} */ ({
    name: skin.id,
    icon: "disc",
    order: 100,
    apiVersion: SKIN_API_VERSION,
    colors: {},
    colorsMissing: [],
    styles: [],
    update: null,
    destroy: null,
    ...skin,
  });
}

/**
 * 校验一个「从外部加载回来的模块 + 清单」是不是合法插件，并给出人话原因。
 *
 * @param {any} mod 动态 import() 的结果
 * @param {SkinManifest} manifest
 * @param {{builtin?:boolean, source?:string, iconUrl?:string, colorsMissing?:string[]}} [meta]
 * @returns {{ok:boolean, skin?:PlayerSkin, reason?:string}}
 */
export function inspectSkinModule(mod, manifest, meta = {}) {
  try {
    return { ok: true, skin: composeSkin(mod, manifest, meta) };
  } catch (err) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}
