/* ==========================================================================
   desktop-wallpaper-window.js — 桌面背景歌词窗口里的**宿主**
   --------------------------------------------------------------------------
   需求：「把当前正在播放的样式投影到桌面中去……去除掉 UI，只保留播放界面样式
   所渲染的内容」。所以这个页面不再自己画一层背景加几行字，而是——

     加载与详情页**完全相同的那套皮肤**（@musicplayer/player-skins），
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
   没有 requestAnimationFrame、没有 setInterval、没有常驻驱动动画的脚本：
   只在收到推送时写一次 DOM。皮肤自己的 CSS 动画（例如唱片旋转）不在这个范畴，
   那是样式的一部分。加任何一条循环之前请先想清楚 —— 它会让一张静止的壁纸
   每秒重绘 60 次，而那正是「双份资源」最贵的部分。
   ========================================================================== */

import { backend, connect, on } from "./bridge.js";
import { DEFAULT_COVER } from "./utils.js";
import { loadExternalSkin, resolveSkin } from "@musicplayer/player-skins";

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
  },
};

/** 当前挂载的样式 id（与主窗口推来的 skinId 对齐） */
let mountedId = "";
/** 当前挂载的皮肤对象 */
let skin = null;
/** 当前上下文（皮肤的唯一入口） */
let ctx = null;
/** 尺寸观察器（换样式时重建） */
let resizeObserver = null;

/* --------------------------------------------------------------------------
   上下文
   -------------------------------------------------------------------------- */

function makeCtx() {
  /** @type {Map<string, Set<(patch: any) => void>>} */
  const listeners = new Map();

  const context = {
    root: stage,
    backgroundRoot,
    // 这个窗口不持有播放器：皮肤若想读缓冲进度会拿到 null，
    // 内置样式都不用（它们只依赖宿主推的 playback 快照）。
    audio: null,
    defaultCover: DEFAULT_COVER,
    get themeId() {
      return document.documentElement.dataset.theme || "";
    },
    get mode() {
      return document.documentElement.dataset.mode === "light" ? "light" : "dark";
    },
    playback: () => state.playback,
    media: () => state.media,
    options: () => state.options,
    // 动作一律是空实现：窗口在桌面图标之下，鼠标与键盘都到不了这里。
    // 万一将来有人把这个窗口挪出来，也不该让它去操作播放器 ——
    // 「桌面背景自己把歌切了」比「点了没反应」更难排查。
    actions: {
      seek() {},
      togglePlay() {},
      next() {},
      prev() {},
      openFolder() {},
      openCoverPanel() {},
    },
    on(type, fn) {
      if (typeof fn !== "function") return () => {};
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    /** 宿主内部使用：一次更新同时交给 skin.update 与 ctx.on 订阅者 */
    push(patch) {
      try {
        skin?.update?.(context, patch);
      } catch (err) {
        console.warn(`[desktop-wallpaper] ${mountedId} 处理 ${patch.type} 更新失败`, err);
      }
      for (const [type, set] of listeners) {
        if (type !== patch.type && type !== "*") continue;
        for (const fn of set) {
          try {
            fn(patch);
          } catch (err) {
            console.warn(`[desktop-wallpaper] ${type} 订阅回调失败`, err);
          }
        }
      }
    },
  };
  return context;
}

/* --------------------------------------------------------------------------
   挂载 / 卸载
   -------------------------------------------------------------------------- */

function unmountSkin() {
  if (skin?.destroy) {
    try {
      skin.destroy(ctx);
    } catch (err) {
      console.warn(`[desktop-wallpaper] ${mountedId} 卸载失败`, err);
    }
  }
  skin = null;
  ctx = null;
  mountedId = "";
  stopWatchingResize();
  stage.innerHTML = "";
  backgroundRoot.hidden = true;
  backgroundRoot.removeAttribute("data-state");
  appEl.dataset.mode = "";
}

/**
 * 挂载一个样式。
 *
 * 步骤与 playerhost.js#mountSkin **逐条对齐**（这是刻意的：两边都是皮肤宿主，
 * 差别只该在「数据从哪来」）。任何一处少做，第三方样式就可能只在一侧正常：
 *   · data-skin  打在 .playerview 上 —— 详情页内的选择器全靠它；
 *   · data-mode  打在 .app 上      —— 整窗背景层（沉浸 / magia 这类
 *     background:true 的样式）全靠它，勾子写在 .app[data-mode="<id>"] 下；
 *   · mount 之后立刻推一次 mount 全量快照，皮肤不需要自己再拉；
 *   · 开尺寸观察，把 resize 增量推给皮肤（画布类样式靠它对齐尺寸）。
 *
 * 抽不出共用函数：那边带着 store、音频元素、歌词装载、封面轮播一堆只属于
 * 主窗口的东西，硬抽会把两边都变得难读。这里就二十行，重复得起。
 */
function mountSkin(id) {
  const { skin: found, fellBack } = resolveSkin(id);
  if (!found) return;
  if (fellBack && id) {
    // 主窗口与这个窗口各有一份注册表，第三方样式在这里没装上时，
    // 与其静默画成「经典」，不如说清楚是哪一步没跟上。
    console.warn(`[desktop-wallpaper] 样式「${id}」不可用，已回退到「${found.name}」`);
  }

  unmountSkin();
  skin = found;
  mountedId = found.id;
  view.dataset.skin = found.id;
  appEl.dataset.mode = found.id;
  ctx = makeCtx();

  try {
    found.mount(ctx);
  } catch (err) {
    console.warn(`[desktop-wallpaper] 样式「${found.id}」挂载失败`, err);
    stage.innerHTML = `<div class="skin-error">这个播放界面样式在桌面上渲染失败了</div>`;
  }

  view.hidden = false;
  // 背景层由皮肤在 mount 里按需启用（background:true 的样式才会用到）。
  // 这里直接给「已入场」：桌面窗口没有进出场动效，不需要先关后开那一下。
  backgroundRoot.dataset.state = "opened";
  view.dataset.state = "opened";
  syncLyricsVisibility();

  // 挂载完成后立刻推一次全量快照 —— 与 playerhost 同一个理由：
  // 皮肤 mount 时读到的可能是空状态（这个窗口刚打开时正是如此），
  // 让它自己去拉一遍数据既违背契约也容易漏。
  ctx.push({
    type: "mount",
    ...state.media,
    ...state.playback,
    options: state.options,
  });
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
    if (!skin || !ctx) return;
    const r = stage.getBoundingClientRect();
    ctx.push({ type: "resize", width: Math.round(r.width), height: Math.round(r.height) });
  });
  resizeObserver.observe(stage);
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
async function loadExternalSkins() {
  if (typeof backend.listSkins !== "function") return;
  let list = null;
  try {
    list = await backend.listSkins();
  } catch (err) {
    console.info("[desktop-wallpaper] 第三方样式清单读取失败", err?.message ?? err);
    return;
  }
  for (const info of Array.isArray(list) ? list : []) {
    if (!info?.id || !info?.module) continue;
    const base = `${SKINS_PREFIX}${encodeURIComponent(info.id)}/`;
    try {
      await loadExternalSkin({
        id: info.id,
        name: info.name,
        module: base + String(info.module).replace(/^\/+/, ""),
        styles: (Array.isArray(info.styles) ? info.styles : []).map((s) =>
          base + String(s).replace(/^\/+/, "")
        ),
      });
    } catch (err) {
      console.warn(`[desktop-wallpaper] 样式「${info.id}」加载失败：`, err);
    }
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
  if (payload.song !== undefined) state.media.song = payload.song;
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
    state.options.interactive = false;
    syncLyricsVisibility();
  }

  // —— ③ 样式：变了就重挂 ——
  // data-skin / data-mode 变了，皮肤包里所有选择器随之换一套。
  // mountSkin 内部会推一次 mount 全量快照，所以不需要在这里补画。
  const wanted = typeof payload.skinId === "string" ? payload.skinId : mountedId;
  if (wanted !== mountedId) mountSkin(wanted);

  if (!skin) return;

  // —— ④ 原样转给皮肤 ——
  // 不改造 type：契约里每个类型都有自己的处理分支，宿主擅自改写（例如把
  // theme 说成 song）会让皮肤少跑它该跑的那一段 —— magia 就是在 theme 里
  // 重新取调色板并把画布尺寸对齐的，被改写成 song 之后粒子颜色会一直停在
  // 挂载时那一套。
  if (!type) return;
  ctx.push({ type, ...payload });
}

/* --------------------------------------------------------------------------
   启动
   -------------------------------------------------------------------------- */

async function boot() {
  const ready = await connect();
  if (!ready) {
    // 浏览器预览：这个页面本身不会被打开（没有第二个窗口），留一行说明即可
    console.info("[desktop-wallpaper] 预览模式：桌面背景歌词窗口需要应用后端");
    return;
  }

  await loadExternalSkins();

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


