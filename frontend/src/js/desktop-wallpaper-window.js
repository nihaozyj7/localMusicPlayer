/* ==========================================================================
   desktop-wallpaper-window.js — 桌面背景歌词窗口里的**宿主**
   --------------------------------------------------------------------------
   需求：「把当前正在播放的样式投影到桌面中去……去除掉 UI，只保留播放界面样式
   所渲染的内容」。所以这个页面不再自己画一层背景加几行字，而是——

     加载与详情页**完全相同的那套皮肤**（@localmusicplayer/player-skins），
     挂载主窗口当前正在用的那一个样式，只把 UI 砍掉。

   于是它和 frontend/src/js/playerhost.js 是同一件事的两个宿主。差别只有三处：

     playerhost.js（详情页）            本文件（桌面背景）
     ──────────────────────────────    ──────────────────────────────
     数据来自 store / 音频元素 / 后端    数据全部由主窗口按皮肤契约推过来
     有 .playerview__head 与底栏        只有一个 .playerview__stage
     options.interactive = true        options.interactive = false

   为什么把「数据」整包推过来、而不是让这个窗口自己去查：
   它没有 store、没有曲库、没有音频元素，也不该有 —— 一个能自己查状态的第二个
   播放器界面，迟早会和主界面显示得不一样。

   ★ 这个页面「什么循环都不跑」。
   没有常驻的 requestAnimationFrame、没有 setInterval、没有常驻驱动动画的脚本：
   只在收到推送时写一次 DOM。皮肤自己的 CSS 动画（例如唱片旋转）不在这个范畴，
   那是样式的一部分。加任何一条循环之前请先想清楚 —— 它会让一张静止的壁纸
   每秒重绘 60 次，而那正是「双份资源」最贵的部分。
   （唯一的例外是报「首帧已提交」时用的那两次 requestAnimationFrame，
   见本文件末尾的 afterPaint：那是**一次性**的，不是循环。）

   连实时频谱也是这样：那个窗口没有音频图，采样由**主窗口**做完，
   按 ~25Hz 以 spectrum 补丁推过来（desktop-wallpaper.js），皮肤只负责画。
   所以这里不需要任何「渲染循环」—— 推一帧画一帧，不推就不画。
   ========================================================================== */

import { backend, connect, on } from "./bridge.js";
import { DEFAULT_COVER } from "./utils.js";
import { loadSkin, resolveSkin } from "@localmusicplayer/player-skins";
import { createSkinHost } from "./skinhost.js";

const appEl = document.getElementById("wp-app");
const view = document.getElementById("wp-playerview");
const stage = document.getElementById("wp-stage");
const backgroundRoot = document.getElementById("wp-skin-background");

/**
 * 第三方样式由后端托管在同源 `/skins/<id>/<file>` 下。
 * 前缀必须与 Go 侧 internal/skins 以及 playerhost.js 的 SKINS_PREFIX 一致 ——
 * 这里没有再 import 那个常量，是为了**不把整个主窗口的模块图拉进这个页面**
 * （playerhost.js 会连带 audio.js / store.js / 各种 DOM 查询）。
 */
const SKINS_PREFIX = "/skins/";

/* --------------------------------------------------------------------------
   本地状态：就是皮肤契约里 ctx.media() / ctx.playback() / ctx.options() 的内容
   -------------------------------------------------------------------------- */

const state = {
  media: {
    song: null,
    cover: "",
    covers: [DEFAULT_COVER],
    coverIndex: 0,
    lyrics: { lines: [], text: "", source: "none", index: -1 },
  },
  playback: { position: 0, duration: 0, playing: false, volume: 1, muted: false },
  options: {
    showLyrics: true,
    lyricsFontSize: 16,
    animations: true,
    coverCarousel: false,
    coverCarouselInterval: 10,
    // 与详情页的唯一区别：这个窗口收不到输入事件（它垫在桌面图标之下），
    // 皮肤据此把可点 / 可聚焦 / 悬停反馈一起去掉。
    interactive: false,
    // 背景动效档位：真实值由主窗口经 options 补丁推来（见 applyPatch），
    // 这里只是「还没收到推送时」的初值，与 Go 侧默认值保持一致。
    performanceMode: "smooth",
  },
};

/**
 * 主窗口**想要**的样式 id（经 skinId 补丁推来）。
 *
 * 注意它不等于"已经挂上的那个"：挂载本身归共享运行时
 * （skinHost.skin），这里只记"目标是谁"，避免两处各存一份挂载状态。
 */
let wantedSkinId = "";
/** 尺寸观察器（换样式时重建） */
let resizeObserver = null;

/* --------------------------------------------------------------------------
   上下文
   -------------------------------------------------------------------------- */

/**
 * 插件宿主运行时：ctx / 推送 / 挂载卸载都走共享实现（skinhost.js）——
 * 这个窗口只提供「数据从哪来、动作做什么」。
 *
 * 数据全部来自主窗口经 IPC 推来的快照（state.*）；动作一律空实现：
 * 这个窗口垫在桌面图标之下，鼠标与键盘都到不了这里，而"桌面背景自己把歌切了"
 * 比"点了没反应"更难排查。
 */
let skinHost = null;

function ensureSkinHost() {
  if (skinHost) return skinHost;
  skinHost = createSkinHost({
    root: stage,
    backgroundRoot,
    view,
    app: appEl,
    source: {
      playback: () => state.playback,
      media: () => state.media,
      options: () => state.options,
      env: envSnapshot,
      defaultCover: DEFAULT_COVER,
      actions: NOOP_ACTIONS,
    },
  });
  return skinHost;
}

/** 运行环境快照（这个窗口没有 store，尺寸直接量舞台） */
function envSnapshot() {
  const r = stage?.getBoundingClientRect?.() || { width: 0, height: 0 };
  return {
    themeId: document.documentElement.dataset.theme || "",
    mode: document.documentElement.dataset.mode === "light" ? "light" : "dark",
    width: Math.round(r.width || 0),
    height: Math.round(r.height || 0),
    dpr: Number(window.devicePixelRatio) || 1,
    reducedMotion: Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches),
    foreground: false,
  };
}

/** 动作全部空实现（见上面的说明） */
const NOOP_ACTIONS = {
  seek() {},
  seekBy() {},
  seekRatio() {},
  togglePlay() {},
  next() {},
  prev() {},
  like() {},
  unlike() {},
  toggleLike() {},
  openFolder() {},
  openCoverPanel() {},
  openLyricsPanel() {},
  reportBackdrop() {},
};

/* --------------------------------------------------------------------------
   挂载 / 卸载
   -------------------------------------------------------------------------- */

function unmountSkin() {
  // close → destroy 两次推送、插件 destroy、清 DOM 与订阅都在运行时里
  // （与 playerhost 的卸载路径完全一致）。
  skinHost?.unmount();
  wantedSkinId = "";
  stopWatchingResize();
  backgroundRoot.hidden = true;
  backgroundRoot.removeAttribute("data-state");
  appEl.dataset.mode = "";
}
/**
 * 挂载一个插件（与 playerhost.js#mountSkin 共用 skinhost.js 的运行时）。
 *
 * 这里只做**窗口自身**的三件事，其余都在共享运行时里：
 *   · data-mode  打在 .app 上（调试与历史钩子；整窗背景让位的钩子是
 *     data-skin-background，由运行时按 capabilities.background 打，见 layout.css）；
 *   · 舞台状态翻开 + 歌词可见性同步（桌面窗口没有进出场动效）；
 *   · 开尺寸观察，把 resize 增量推给插件（画布类插件靠它对齐尺寸）。
 *
 * 抽不出共用函数：那边带着 store、音频元素、歌词装载、封面轮播一堆只属于
 * 主窗口的东西，硬抽会把两边都变得难读。这里就二十行，重复得起。
 */
function mountSkin(id) {
  const { skin: found, fellBack } = resolveSkin(id);
  if (!found) return;
  wantedSkinId = found.id;
  if (fellBack && id) {
    // 主窗口与这个窗口各有一份注册表，第三方样式在这里没装上时，
    // 与其静默画成「经典」，不如说清楚是哪一步没跟上。
    console.warn(`[desktop-wallpaper] 样式「${id}」不可用，已回退到「${found.name}」`);
  }

  // 挂载（含 data-skin / data-skin-background 与 mount 全量快照）交给共享运行时，
  // 与主窗口逐条一致 —— 这正是"两个宿主不该各写一份"的地方。
  appEl.dataset.mode = found.id;
  ensureSkinHost().mount(found);

  view.hidden = false;
  // 背景层由皮肤在 mount 里按需启用（background:true 的样式才会用到）。
  // 这里直接给「已入场」：桌面窗口没有进出场动效，不需要先关后开那一下。
  backgroundRoot.dataset.state = "opened";
  view.dataset.state = "opened";
  syncLyricsVisibility();
  watchResize();
}

/* --------------------------------------------------------------------------
   尺寸变化
   --------------------------------------------------------------------------
   与 playerhost#watchResize 同一个做法：观察舞台，把尺寸作为 resize 增量推给
   皮肤。画布类样式（每次重建 canvas 都要按 CSS 尺寸乘 dpr 设像素尺寸）需要它；
   它们多数还自己挂了 ResizeObserver，但契约里有 resize 就该推 ——
   少推一次的表现是「画布对，但歌词行的宽度上限还按旧尺寸算」。
   -------------------------------------------------------------------------- */

function watchResize() {
  if (resizeObserver || typeof ResizeObserver !== "function") return;
  resizeObserver = new ResizeObserver(() => {
    if (!skinHost?.skin) return;
    const r = stage.getBoundingClientRect();
    skinHost.push({ type: "resize", width: Math.round(r.width), height: Math.round(r.height) });
  });
  // box: "border-box" 的理由见 playerhost.js#watchResize：皮肤会在 resize
  // 回调里改自己的 padding / 字号，观察内容盒会把这种改动当成尺寸变化。
  resizeObserver.observe(stage, { box: "border-box" });
}

function stopWatchingResize() {
  if (!resizeObserver) return;
  resizeObserver.disconnect();
  resizeObserver = null;
}

/** 「显示歌词」开关：与详情页同一套属性，规则写在包里的 lyrics.css */
function syncLyricsVisibility() {
  view.dataset.lyrics = state.options.showLyrics === false ? "off" : "on";
}

/**
 * 加载用户数据目录里的第三方样式。
 *
 * 注册表是**每个窗口各自一份**（各自一个 JS 上下文），所以这个窗口也得自己
 * 扫一遍 —— 否则用户把样式包丢进目录后，桌面上会莫名其妙回退成「经典」。
 * 只在启动时扫一次：这个窗口是跟着开关开关的，目录变化时重开一次就够了。
 */
async function loadAllSkins() {
  try {
    const list = await backend.listSkins();
    const items = Array.isArray(list) ? list : [];
    // /skins/ 需要 token（见 internal/skins 的 Handler）
    const token = String((await backend.skinsToken()) || "");
    const query = token ? `?t=${encodeURIComponent(token)}` : "";
    // 契约 v3：内置与第三方同一条加载路径（后端扫两个根目录）。
    for (const info of items) {
      if (!info?.id || !info?.module || !info?.manifest) continue;
      const base = `${SKINS_PREFIX}${encodeURIComponent(info.id)}/`;
      const withToken = (rel) => base + String(rel).replace(/^\/+/, "") + query;
      const iconFile = info.manifest?.icon?.file;
      try {
        await loadSkin({
          manifest: info.manifest,
          moduleUrl: withToken(info.module),
          cssUrls: (Array.isArray(info.styles) ? info.styles : []).map(withToken),
          iconUrl: iconFile ? withToken(iconFile) : "",
          builtin: info.builtin === true,
          source: info.source || "",
        });
      } catch (err) {
        console.warn(`[desktop-wallpaper] 样式「${info.id}」加载失败：`, err);
      }
    }
  } catch (err) {
    console.warn("[desktop-wallpaper] 样式目录扫描失败", err);
  }
}
/* --------------------------------------------------------------------------
   主题令牌镜像
   --------------------------------------------------------------------------
   桌面上的这个皮肤要和窗口里那个长得一模一样，靠的是同一套设计令牌。
   令牌散在三处：tokens.css 的 :root、主题文件里的 :root[data-theme=…]、
   以及运行时的 setRuntimeToken（毛玻璃、过渡时长、封面种子色、歌词字号…）。
   主窗口把它们算好，这里只负责原样贴到自己的 :root 上。

   为什么要用 insertRule 而不是拼一个 <style> 的 textContent：
   页面的 CSP 是 style-src 'self'，实测会拦截后者（见 runtime-tokens.js 的说明）。
   -------------------------------------------------------------------------- */

const TOKEN_STYLE_ID = "wp-tokens";

/**
 * 把主窗口传来的令牌写成一条 :root 规则。
 *
 * 每条都带 !important：主题令牌写在 `:root[data-theme="x"]` 里，选择器比 `:root`
 * 更具体，不带 !important 的话运行时覆盖会被主题原值压回去（与主窗口
 * runtime-tokens.js 的做法一致）。
 *
 * @param {Record<string, string>} tokens
 */
function applyTokens(tokens) {
  let el = document.getElementById(TOKEN_STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = TOKEN_STYLE_ID;
    document.head.appendChild(el);
  }
  const sheet = el.sheet;
  if (!sheet) return;
  for (let i = sheet.cssRules.length - 1; i >= 0; i -= 1) sheet.deleteRule(i);
  if (!tokens) return;

  const body = Object.entries(tokens)
    .filter(([name, value]) => name.startsWith("--") && value)
    .map(([name, value]) => `${name}:${value} !important`)
    .join(";");
  if (!body) return;
  try {
    sheet.insertRule(`:root{${body}}`, 0);
  } catch (err) {
    console.warn("[desktop-wallpaper] 主题令牌写入失败", err);
  }
}

/* --------------------------------------------------------------------------
   接收主窗口推来的增量
   --------------------------------------------------------------------------
   payload 的形状就是皮肤契约里的 patch：`type` 说明这条是什么更新，其余键是
   本次变化的字段。这里按「先落地到本地状态，再把 patch 原样转给皮肤」两步走 ——
   皮肤只从 ctx 读数据，不从 patch 读，所以状态必须先合并完。
   -------------------------------------------------------------------------- */

function applyPatch(payload) {
  if (!payload || typeof payload !== "object") return;
  const type = typeof payload.type === "string" ? payload.type : "";

  // —— ① 主题 / 令牌（与皮肤无关，随时可以落地）——
  if (typeof payload.theme === "string" && payload.theme) {
    document.documentElement.dataset.theme = payload.theme;
  }
  if (typeof payload.mode === "string" && payload.mode) {
    document.documentElement.dataset.mode = payload.mode;
  }
  if (typeof payload.density === "string") {
    if (payload.density) document.documentElement.dataset.density = payload.density;
    else delete document.documentElement.dataset.density;
  }
  if (payload.tokens) applyTokens(payload.tokens);

  // —— ② 数据落地 ——
  //
  // ★ 这一步必须在「皮肤还没挂上就早退」**之前**。
  // 主窗口第一批会同时发几条独立的 IPC，而 IPC 的到达顺序并不保证是发出顺序
  // （实测带 skinId 的那条会排在 song 后面）。早退的话，先到的 song 就被丢掉了
  // —— 表现是桌面上一直停在「未在播放」，直到下一次换歌才恢复。
  // 数据是无条件接受的，皮肤没挂上只是暂时画不出来而已。
  if (payload.song !== undefined) {
    state.media.song = payload.song;
    // 收到过主窗口的媒体快照 = 那边已经启动完毕（不是「有歌在播」，
    // 曲库为空时 song 是 null 也算）。它是首帧就绪的判据之一，见 announcePainted。
    mediaSeen = true;
  }
  if (payload.cover !== undefined) state.media.cover = payload.cover;
  if (payload.covers !== undefined) state.media.covers = payload.covers;
  if (payload.coverIndex !== undefined) state.media.coverIndex = payload.coverIndex;
  if (payload.lyrics !== undefined) state.media.lyrics = payload.lyrics;

  if (payload.position !== undefined) state.playback.position = payload.position;
  if (payload.duration !== undefined) state.playback.duration = payload.duration;
  if (payload.playing !== undefined) state.playback.playing = payload.playing;
  if (payload.volume !== undefined) state.playback.volume = payload.volume;
  if (payload.muted !== undefined) state.playback.muted = payload.muted;

  if (payload.options) {
    Object.assign(state.options, payload.options);
    // interactive 由这个窗口说了算：主窗口推来的是 true（详情页用），
    // 直接照抄会让歌词行在这里也变回可点的按钮。
    // （performanceMode **不要**在这里覆盖：桌面背景同样是「皮肤在画背景」，
    //   它应当跟随用户在设置里选的档位，否则桌面上会与详情页表现不一致。）
    state.options.interactive = false;
    syncLyricsVisibility();
  }

  // —— ③ 样式：变了就重挂 ——
  // data-skin / data-mode 变了，皮肤包里所有选择器随之换一套。
  // mountSkin 内部会推一次 mount 全量快照，所以不需要在这里补画。
  const wanted = typeof payload.skinId === "string" ? payload.skinId : wantedSkinId;
  if (wanted !== wantedSkinId || !skinHost?.skin) mountSkin(wanted);

  // —— ④ 原样转给皮肤 ——
  // 不改造 type：契约里每个类型都有自己的处理分支，宿主擅自改写（例如把
  // theme 说成 song）会让皮肤少跑它该跑的那一段 —— magia 就是在 theme 里
  // 重新取调色板并把画布尺寸对齐的，被改写成 song 之后粒子颜色会一直停在
  // 挂载时那一套。
  if (skinHost?.skin && type) skinHost.push({ type, ...payload });

  // —— ⑤ 皮肤挂上、数据也落地了 → 告诉后端可以摘遮罩了 ——
  // 必须放在最后：露出时机的判据就是「这一次更新已经画进合成器」，
  // 具体在哪一刻由 announcePainted 里的 afterPaint 决定。
  announcePainted();
}

/* --------------------------------------------------------------------------
   首帧就绪
   --------------------------------------------------------------------------
   这个窗口在渲染首帧时对用户是**不可见**的（见 Go 侧
   desktop_wallpaper.go#ensureDesktopWallpaper 与
   desktop_wallpaper_windows.go#armDesktopWallpaperOffscreen）：它先被 DWM 遮住
   显示出来，WebView2 因此开始出帧，而屏幕上一片空白。

   这里决定的是「什么时候把遮罩摘掉」——也就是窗口第一次出现在桌面上的时刻，
   所以判据分两层：
     · 内容齐了：皮肤挂上、并且主窗口的媒体快照已经到了（announcePainted）；
     · 这一帧真的画出来了：再等两帧 rAF（afterPaint），确保合成器已经收到。
   只有内容、没有第二层，摘遮罩时会露出上一帧的深色底，就是「黑一下」。
   Go 那边另有兜底定时器，页面出任何问题时窗口也会出现。
   -------------------------------------------------------------------------- */

/** 是否已经通知过后端显示窗口（只通知一次） */
let paintedAnnounced = false;
/** 是否收到过主窗口推来的媒体快照（type: song，哪怕 song 是 null） */
let mediaSeen = false;

/**
 * 「两帧 rAF 一直没来」时的兜底通知时刻（ms）。
 *
 * 正常只要 ~32ms（两帧）；给到 150ms 是给「窗口刚创建、合成器还在热身」留余量。
 * 真到了这个点 rAF 还没来，说明它在当前环境下根本不会来（旧路径的隐藏窗口），
 * 那就只能先发信号 —— 宁可早一点黑一下，也不能让窗口永远不出现。
 */
const paintedFallbackDelay = 150;

function announcePainted() {
  if (paintedAnnounced) return;
  // 两个条件缺一不可：只有样式没有数据 = 空皮肤；只有数据没挂样式 = 空壳。
  // 注意 mediaSeen 判的是「收到过 song 补丁」而不是「有歌在播」——
  // 曲库为空、没有当前曲目时 song 是 null，那也是一份合法且已经渲染完的画面。
  if (!skinHost?.skin || !mediaSeen) return;
  paintedAnnounced = true;
  afterPaint(() => {
    backend.desktopWallpaperPainted?.().catch(() => {});
  });
}

// announcePainted 在「挂载完成 / 收到 song 补丁」两处都会被调用，谁后到谁触发。
// 走的是同一个 paintedAnnounced 幂等闸门：先到的那次只把条件凑齐，后到的那次
// 才真的发信号 —— 也就是说，即便两条 IPC 的到达顺序反过来（skinId 那条在
// song 之后），也不会漏掉信号。

/**
 * 在「这一帧真的已经交给合成器」之后执行 fn。
 *
 * 为什么必须是**两帧** rAF，而不是以前那样等一轮宏任务（setTimeout 0）：
 * 后端一收到这个信号就挂载 + 摘掉 DWM 遮罩，窗口从壁纸层里露出来。
 * 而 setTimeout(0) 只说明「这一次 DOM 写入的任务跑完了」—— 样式、布局、绘制
 * 以及合成器的提交都还没发生，摘遮罩时露出来的仍是上一帧（空皮肤那块深色底），
 * 于是又黑一下。rAF 回调跑在下一帧的绘制**之前**，所以第二个 rAF 执行时，
 * 第一次那次带内容的帧已经提交上去了。
 *
 * 为什么还要一条定时器兜底：万一本机不支持 DWM 遮罩，窗口走的是「隐藏创建」
 * 那条旧路径，而隐藏窗口根本不派发 BeginFrame —— rAF 永远不会来。
 * 没有兜底就等于信号永远发不出去，窗口也就永远不显示（那比黑一下严重得多）。
 *
 * @param {() => void} fn
 */
function afterPaint(fn) {
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    fn();
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(fire));
    setTimeout(fire, paintedFallbackDelay);
    return;
  }
  setTimeout(fire, 0);
}

/* --------------------------------------------------------------------------
   启动
   -------------------------------------------------------------------------- */

async function boot() {
  // 窗口销毁时把插件卸载干净（close/destroy 两次推送 + 插件自己的清理）。
  // 挂载路径里不再需要它：共享运行时的 mount() 会先卸载上一个。
  window.addEventListener("beforeunload", () => unmountSkin());

  const ready = await connect();
  if (!ready) {
    // 浏览器预览：这个页面本身不会被打开（没有第二个窗口），留一行说明即可
    console.info("[desktop-wallpaper] 预览模式：桌面背景歌词窗口需要应用后端");
    return;
  }

  await loadAllSkins();

  // 先挂皮肤再订阅？不行 —— 初始状态里才有 skinId，而要订阅又必须先于首次推送。
  // 顺序：订阅 → 拉全量（全量里带 skinId，会触发挂载）→ 之后都是增量。
  on("desktop:wallpaper", applyPatch);

  try {
    const initial = await backend.desktopWallpaperReady();
    if (initial && typeof initial === "object") applyPatch(initial);
  } catch (err) {
    console.info("[desktop-wallpaper] 初始状态读取失败", err?.message ?? err);
  }
}

boot();
