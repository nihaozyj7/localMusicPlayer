// @ts-check
/* ==========================================================================
   types.js — 播放界面样式的 JSDoc 类型清单（**只给编辑器看，运行期从不加载**）
   --------------------------------------------------------------------------
   为什么随模板一起分发：第三方样式是运行时从 /skins/ 加载的，插件又规定
   **零 import**，所以在数据目录里 `import("@localmusicplayer/player-skins")`
   解析不到任何东西 —— 没有这份文件的话，写 skin.js 时 ctx / patch 全是 any，
   "有哪些字段、字段长什么样"只能靠翻文档。

   用法（skin.js 文件头）：

     // @ts-check
     // 然后用 JSDoc 注释把默认导出对象标成 import("./types.js").SkinModule（
     // 注释写法见 skin.js 与下面任何一个 typedef；这里不重复写，避免把本段注释提前结束）

   于是 VSCode / WebStorm 里的 ctx.* / patch.* / ctx.sdk.* 都会有补全与类型检查；
   运行期这个文件不会被 import（JSDoc 只是注释），删掉也不影响加载。

   ★ 它抄自 frontend/packages/player-skins/src/contract.js —— **契约的唯一定义**
     仍然是那边；这里只是给"数据目录里的样式包"一份自包含的副本。
     如果宿主升级了契约（apiVersion 的 minor 变了），以那边的 typedef 为准，
     把新字段照抄过来即可；本文件不参与任何门禁，抄漏了不会让 CI 变红。
   ========================================================================== */

/**
 * 清单（skin.json）。宿主加载时就是这么读的。
 * @typedef {Object} SkinManifest
 * @property {string} id 必须与目录名一致
 * @property {string} name 设置页显示名
 * @property {string} apiVersion 契约版本，形如 "3.0"（major 必须与宿主相同）
 * @property {string} [version] 插件自身版本（排错 / "从仓库获取"判断有没有新版）
 * @property {string} [author]
 * @property {string} [description]
 * @property {string} [entry] 入口文件，默认 skin.js
 * @property {string[]} [styles] CSS 文件；缺省 = 目录内顶层所有 *.css
 * @property {{file?: string, sprite?: string}} [icon]
 * @property {number} [order] 按钮组排序：内置 10~90，第三方建议 ≥ 200
 * @property {SkinCapabilities} [capabilities]
 * @property {SkinColors} [colors]
 * @property {{budgetFps?: number}} [performance]
 */

/**
 * @typedef {Object} SkinCapabilities
 * @property {boolean|number} [spectrum] true = 允许读 ctx.spectrum()（固定 128 段全谱，拉取式）
 * @property {boolean} [background] true = 需要整窗背景层（ctx.backgroundRoot），舞台会铺满整窗
 * @property {boolean} [interactive] 默认 true；false = 宿主可能把样式挂到"只能看"的舞台
 * @property {boolean} [paintSelf] 默认 true
 */

/**
 * @typedef {Object} SkinColors
 * @property {string} [bg] 你的画面主底色
 * @property {string} [fg] 你的画面上主要文字/图标颜色
 * @property {string} [accent] 可选专色（宿主壳的强调色）
 * @property {boolean} [theme] 画面跟随宿主主题（与 bg/fg 二选一）
 */

/**
 * 曲目视图。宿主**只给这几个字段**（内部路径 / 文件夹不会被递出来）。
 * @typedef {Object} SkinTrack
 * @property {string} id 稳定标识
 * @property {string} title
 * @property {string} artist
 * @property {string} album
 * @property {number} duration 毫秒
 * @property {"local"|"online"} kind
 */

/**
 * 一行歌词。
 *
 * · 多语言：同一时间戳的多行已折叠成一行 —— 第一行是 text，其余语言进 trans；
 * · 字级（逐字）：行上有 words 时，它是**每个字素一个起始毫秒**，与
 *   sdk.splitGraphemes(text) 一一对应。没有逐字时间轴的行**不带**这个键。
 *
 * @typedef {Object} SkinLyricLine
 * @property {number} time 毫秒
 * @property {string} text
 * @property {string[]} [trans] 同时间戳的译文 / 罗马音
 * @property {number[]} [words] 每个字素的起始毫秒（逐字歌词才有）
 */

/**
 * @typedef {Object} SkinLyrics
 * @property {SkinLyricLine[]} lines
 * @property {string} text 原始 LRC 文本
 * @property {"none"|"embedded"|"lrc-file"|"cache"|"online"|"preview"} source
 * @property {"none"|"loading"|"matching"|"failed"|"ok"} status
 * @property {string} statusText 空态文案（有歌词时是空串）
 * @property {number} index 当前高亮行（-1 = 还没到第一句）
 */

/**
 * @typedef {Object} SkinPlayback
 * @property {number} position 毫秒。已按锚点外推到推送时刻，且**单调不减**
 * @property {number} duration 毫秒
 * @property {boolean} playing
 * @property {number} volume 0..1
 * @property {boolean} muted
 */

/**
 * @typedef {Object} SkinMedia
 * @property {SkinTrack|null} song
 * @property {string} cover 当前封面（data URL 或同源 URL）
 * @property {string[]} covers 全部封面（轮播用；至少一张）
 * @property {number} coverIndex 轮播当前下标
 * @property {SkinLyrics} lyrics
 */

/**
 * @typedef {Object} SkinOptions
 * @property {boolean} showLyrics
 * @property {number} lyricsFontSize
 * @property {boolean} animations
 * @property {boolean} coverCarousel
 * @property {number} coverCarouselInterval
 * @property {boolean} interactive 宿主是否允许交互（桌面背景歌词窗口为 false）
 * @property {"smooth"|"performance"} performanceMode
 * @property {number} budgetFps
 */

/**
 * @typedef {Object} SkinEnv
 * @property {string} themeId
 * @property {"dark"|"light"} mode
 * @property {number} width
 * @property {number} height
 * @property {number} dpr
 * @property {boolean} reducedMotion
 * @property {boolean} foreground
 */

/**
 * 宿主推来的一份更新（update(ctx, patch) / ctx.on(type, fn)）。
 *
 * type 取值见契约的 PATCH_TYPES：mount / song / media / lyrics / progress /
 * state / options / theme / resize / close / destroy。字段随 type 不同，
 * 最省事的用法是**不看 patch 里的数据**，直接 ctx.track() / ctx.lyrics() /
 * ctx.playback() 现取快照 —— 任何一次推送之后快照与载荷一定一致。
 *
 * @typedef {Object} SkinPatch
 * @property {string} type
 * @property {SkinTrack|null} [song]
 * @property {string} [cover]
 * @property {string[]} [covers]
 * @property {number} [coverIndex]
 * @property {SkinLyrics} [lyrics]
 * @property {number} [position]
 * @property {number} [duration]
 * @property {boolean} [playing]
 * @property {number} [volume]
 * @property {boolean} [muted]
 * @property {number} [lyricIndex]
 * @property {SkinOptions} [options]
 * @property {string} [themeId]
 * @property {"dark"|"light"} [mode]
 * @property {number} [width]
 * @property {number} [height]
 */

/**
 * 滚动歌词零件（ctx.sdk.createLyricsView）的返回值。
 * @typedef {Object} LyricsView
 * @property {HTMLElement} element
 * @property {(lines: SkinLyricLine[], meta?: {emptyText?: string, emptyHint?: string, showOpenFolder?: boolean}) => void} setLines
 * @property {(positionMs: number, opts?: {immediate?: boolean, playing?: boolean}) => void} setPosition
 * @property {(playing: boolean) => void} setPlaying
 * @property {() => void} destroy
 * @property {SkinLyricLine[]} lines
 * @property {number} activeIndex
 */

/**
 * 宿主提供的可复用渲染零件（ctx.sdk）。
 *
 * 这些是"零件"不是"样式"：用不用、怎么拼都是自由。它们对应的骨架样式表
 * 由宿主加载、不在 skin 层里 —— 视觉通过传选项或 CSS 变量定制
 * （例如 --lyric-size / --lyric-size-active / --lyric-dim）。
 *
 * @typedef {Object} SkinSdk
 * @property {Function} define
 * @property {(host: HTMLElement, opts?: {onSeek?: (ms:number)=>void, onOpenFolder?: ()=>void, interactive?: boolean, escape?: (text:string)=>string}) => LyricsView} createLyricsView
 *   滚动歌词（高亮 / 点击跳转 / 空态 / 逐字平滑填充）
 * @property {(host: HTMLElement, opts?: {onSeek?: (ms:number)=>void, interactive?: boolean, escape?: (text:string)=>string}) => {element: HTMLElement, setLines: Function, setPosition: Function, setPlaying: Function, markMeasure: Function, destroy: ()=>void}} createFxLyrics
 *   特效歌词（逐字入场 / 卡拉OK / 残影）
 * @property {Function} createCamera 运镜
 * @property {Function} createBackgroundLayer 整窗背景层
 * @property {Function} marqueeText 标题单行 + 放不下时横向跑马灯
 * @property {(prev:number, next:number) => number} steadyPosition 播放位置防回退
 * @property {number} POSITION_HOLD_MS 小幅回退的阈值（毫秒）
 * @property {Function} applyFit
 * @property {Function} fitScale
 * @property {Function} fitScaleOf
 * @property {Function} parseLrc
 * @property {Function} splitGraphemes 文本 → 字素数组（与 line.words 的下标对齐）
 * @property {Function} findLyricIndex
 * @property {Function} formatLrcTime
 * @property {Function} lyricDisplayText
 * @property {Object} html { EMPTY_TRACK, escapeHtml, setCoverImage, subtitleOf, lyricsEmptyText }
 * @property {Object} util { clamp, esc, debounce }
 * @property {string} version
 */

/**
 * 受控动作（ctx.actions）。不要自己碰音频元素 / 宿主状态。
 * @typedef {Object} SkinActions
 * @property {(ms:number) => void} seek
 * @property {(deltaMs:number) => void} seekBy
 * @property {(ratio:number) => void} seekRatio
 * @property {() => void} togglePlay
 * @property {() => void} next
 * @property {() => void} prev
 * @property {() => void} toggleLike
 * @property {() => void} openFolder
 * @property {() => void} openCoverPanel
 * @property {() => void} openLyricsPanel
 * @property {(colors:{bg:string,fg:string}) => void} reportBackdrop
 */

/**
 * 实时频谱快照（拉取式）。
 * @typedef {Object} SpectrumSnapshot
 * @property {Float32Array} bands 128 段对数全谱（0..1，只读）
 * @property {number} at 采样时刻（performance.now()）
 */

/**
 * 插件拿到的唯一入口（mount / update / destroy 的第一个参数）。
 * @typedef {Object} SkinContext
 * @property {HTMLElement} root 挂载点（宿主已清空，往这里写 DOM）
 * @property {HTMLElement} backgroundRoot 整窗背景层容器（声明 capabilities.background 才有）
 * @property {() => SkinPlayback} playback
 * @property {() => SkinMedia} media
 * @property {() => SkinTrack|null} track
 * @property {() => SkinLyrics} lyrics
 * @property {() => {list:string[], index:number, current:string}} covers
 * @property {() => SkinOptions} options
 * @property {() => SkinEnv} env
 * @property {() => SpectrumSnapshot|null} spectrum 拉取式：调用才采样；null = 没在播放 / 未声明能力
 * @property {SkinSdk} sdk
 * @property {(type:string, fn:(patch:SkinPatch)=>void) => (() => void)} on 订阅更新，返回退订函数
 * @property {SkinActions} actions
 * @property {string} defaultCover 封面加载失败时的兜底图
 * @property {string} themeId
 * @property {"dark"|"light"} mode
 * @property {boolean} interactive
 */

/**
 * 入口模块 default 导出的对象（清单里的 entry 指向的文件）。
 * @typedef {Object} SkinModule
 * @property {string} [id] 与清单一致（可不写）
 * @property {string} [name]
 * @property {string} [apiVersion]
 * @property {(ctx: SkinContext) => void} mount 必需：建 DOM / 挂监听 / 起帧循环
 * @property {(ctx: SkinContext, patch: SkinPatch) => void} [update] 可选：增量更新
 * @property {(ctx: SkinContext) => void} [destroy] 可选：清定时器 / 监听 / 引用
 */

export {};
