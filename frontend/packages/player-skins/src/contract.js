// @ts-check
/* ==========================================================================
   contract.js — 播放界面皮肤（样式）的统一接口
   --------------------------------------------------------------------------
   这个文件是「宿主」与「皮肤」之间唯一的契约。宿主是播放器主程序
   （frontend/src/js/playerhost.js），皮肤是本包或用户自己放进
   数据目录 `player-skins/<id>/` 的第三方模块。

   分工（为什么这么切）：
     · 宿主负责**数据**：音频元素本身、播放进度、当前曲目、封面集合、
       歌词文本（含联网匹配与缓存）、设置项、主题变化、窗口尺寸。
     · 皮肤负责**呈现与交互**：播放详情页里的背景怎么画、歌词怎么排、
       点歌词要不要 seek、封面怎么动。宿主的 DOM 里只留一个空的挂载点。
     · 只要「相关信息」有更新（换歌 / 歌词装载完成 / 封面轮播 / 播放进度 /
       设置变化 / 主题变化 / 尺寸变化），宿主就会**主动推**给皮肤
       （`update(ctx, patch)` + `ctx.on(type, fn)`），皮肤不需要轮询，也不需要
       自己去 import store —— 这样第三方皮肤永远够不到内部状态，
       接口也不会因为内部重构而碎掉。

   皮肤对象的形状（用 defineSkin 定义，会做一次校验）：

     export default defineSkin({
       apiVersion: 1,
       id: "classic",
       name: "经典",
       icon: "disc",              // index.html 里图标 sprite 的 id（可省略）
       order: 10,                 // 按钮组里的排序，小的在前
       background: false,         // 是否需要「整窗背景层」（沉浸类皮肤需要）
       styles: [],                // 外部皮肤的 CSS（相对皮肤目录），内置皮肤由打包器处理
       mount(ctx) {},             // 建 DOM（往 ctx.root 里写）
       update(ctx, patch) {},     // 宿主推来的更新（patch.type 见 PATCH_TYPES）
       destroy(ctx) {},           // 清理定时器 / 监听 / 引用
     });

   ★ 兼容性：皮肤接口按 apiVersion 走。宿主只加载 `apiVersion === SKIN_API_VERSION`
     的皮肤；不认识的就跳过并在控制台说明原因（而不是装作没事然后崩在半路）。
   ========================================================================== */

/** 当前宿主实现的皮肤接口版本 */
export const SKIN_API_VERSION = 1;

/**
 * 宿主推给皮肤的更新类型。
 *
 * 设计要点：`song` 是「换歌」这一件事的完整快照（曲目 + 封面 + 歌词），
 * 皮肤可以在 mount 之后只靠它就把界面填满；其余类型都是增量的高频更新。
 * 之所以不做成「一个大对象每帧全推」，是因为歌词行高亮要跟随进度走，
 * 每帧重排整个曲目信息会白白触发大量 DOM 写入。
 */
export const PATCH_TYPES = [
  "mount", // 挂载完成（mount 之后立即推一次，携带全量快照）
  "song", // 换歌：{ song, cover, covers, coverIndex, lyrics }
  "media", // 封面变化 / 轮播切图：{ cover, covers, coverIndex }
  "lyrics", // 歌词装载完成或更新：{ lyrics }
  "progress", // 播放进度（宿主已按帧节流）：{ position, duration, playing, lyricIndex }
  "state", // 播放状态变化（播放/暂停/音量）：{ playing, volume, muted }
  "options", // 设置项变化：{ options }
  "theme", // 主题/深浅色变化：{ themeId, mode }
  "resize", // 容器尺寸变化：{ width, height }
  "close", // 播放详情页关闭
  "destroy", // 皮肤即将被卸载（destroy 之前推最后一次）
];

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
 * @property {Array<{time:number,text:string}>} lines 已解析的 LRC 行
 * @property {string} text 原始 LRC 文本
 * @property {string} source none | embedded | lrc-file | cache | online | preview
 * @property {number} index 当前高亮行（-1 = 还没到第一句）
 */

/**
 * @typedef {Object} SkinMedia
 * @property {object|null} song 曲目对象（宿主 store 里的那一份）
 * @property {string} cover 当前生效封面（data URL 或同源 URL）
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
 * @property {boolean} interactive 宿主是否允许交互。
 *   默认 true。宿主把同一个皮肤挂到「只能看」的地方时传 false ——
 *   目前唯一这样的宿主是**桌面背景歌词**窗口：它垫在桌面图标之下，
 *   本来就收不到鼠标与键盘事件。皮肤收到 false 应当把可点、可聚焦、
 *   悬停反馈这类东西一起去掉，只留渲染出来的内容。
 */

/**
 * @typedef {Object} SkinContext 宿主上下文（皮肤拿到的唯一入口）
 * @property {HTMLElement} root 皮肤自己的挂载点（宿主已清空）
 * @property {HTMLElement} backgroundRoot 整窗背景层的容器（宿主已就位，皮肤按需填充）
 * @property {HTMLAudioElement|null} audio 真实音频元素（可直接读 buffered / 挂监听）
 * @property {() => SkinPlayback} playback 播放进度快照
 * @property {() => SkinMedia} media 曲目/封面/歌词快照
 * @property {() => SkinOptions} options 显示相关设置（showLyrics / lyricsFontSize / interactive…）
 * @property {(type: string, fn: (patch: any) => void) => () => void} on 订阅宿主推送
 * @property {SkinActions} actions 受控动作（不要在皮肤里直接操作 store）
 * @property {string} defaultCover 封面加载失败时的兜底图（内联 SVG data URL）
 * @property {string} themeId 当前主题 id
 * @property {string} mode dark | light
 */

/**
 * @typedef {Object} SkinActions
 * @property {(ms:number) => void} seek 跳转到某个毫秒位置
 * @property {() => void} togglePlay
 * @property {() => void} next
 * @property {() => void} prev
 * @property {() => void} openFolder 在资源管理器里定位当前文件
 * @property {() => void} openCoverPanel 打开封面面板
 */

/**
 * @typedef {Object} PlayerSkin
 * @property {number} [apiVersion]
 * @property {string} id
 * @property {string} name
 * @property {string} [icon]
 * @property {number} [order]
 * @property {string} [description]
 * @property {boolean} [background] 需要整窗背景层
 * @property {string[]} [styles] CSS 相对路径（外部皮肤用；内置皮肤由打包器引入）
 * @property {boolean} [builtin] 是否内置样式（内置样式省略此字段，视为 true）
 * @property {string} [source] 外部样式的来源描述（目录名，便于排错）
 * @property {(ctx: SkinContext) => void} mount
 * @property {(ctx: SkinContext, patch: {type: string} & Record<string, any>) => void} [update]
 * @property {(ctx: SkinContext) => void} [destroy]
 */

/** 皮肤必须实现的字段 */
const REQUIRED = ["id", "name", "mount"];

/**
 * 把一个普通对象声明成皮肤：补齐默认值 + 做一次结构校验。
 *
 * 为什么要有这个包装：第三方皮肤是运行时从磁盘加载的，
 * 出错的时机越早越好（加载时报出「缺 mount」比点开详情页白屏好得多）。
 *
 * @param {Partial<PlayerSkin>} skin
 * @returns {PlayerSkin}
 */
export function defineSkin(skin) {
  if (!skin || typeof skin !== "object") {
    throw new Error("皮肤必须是一个对象（export default defineSkin({...})）");
  }
  for (const key of REQUIRED) {
    if (!skin[key]) throw new Error(`皮肤缺少必需字段：${key}`);
  }
  if (typeof skin.mount !== "function") {
    throw new Error(`皮肤 ${skin.id} 的 mount 必须是函数`);
  }
  const version = Number(skin.apiVersion ?? SKIN_API_VERSION);
  if (version !== SKIN_API_VERSION) {
    throw new Error(`皮肤 ${skin.id} 声明接口版本 ${version}，宿主只支持 ${SKIN_API_VERSION}`);
  }
  // 注意：这里的对象字面量是「默认值 + 用户值」，赋值给 PlayerSkin 之前
  // 已经在上面校验过必需字段，因此用一次断言把可选性收紧。
  return /** @type {PlayerSkin} */ ({
    icon: "disc",
    order: 100,
    description: "",
    background: false,
    styles: [],
    update: null,
    destroy: null,
    ...skin,
    apiVersion: version,
  });
}

/**
 * 校验一个「从外部加载回来的模块」是不是合法皮肤，并给出人话原因。
 *
 * 返回值刻意不用 `ok: true/false` 的判别联合：JSDoc 里的布尔字面量类型
 * 在窄化时并不可靠（调用方会拿到「联合上没有 reason」这种假报错），
 * 这里用「可选的 skin / reason」表达同一件事，调用方先看 ok 即可。
 *
 * @typedef {Object} SkinModuleVerdict
 * @property {boolean} ok
 * @property {PlayerSkin} [skin] 合法时给出补全默认值后的皮肤
 * @property {string} [reason] 不合法时给出人话原因
 */

/**
 * @param {any} mod 动态 import() 的结果
 * @returns {SkinModuleVerdict}
 */
export function inspectSkinModule(mod) {
  const candidate = mod?.default ?? mod?.skin ?? null;
  if (!candidate) return { ok: false, reason: "模块没有 default 导出皮肤对象" };
  try {
    return { ok: true, skin: defineSkin(candidate) };
  } catch (err) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}
