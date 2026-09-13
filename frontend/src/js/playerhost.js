// @ts-check
/* ==========================================================================
   playerhost.js — 播放详情页「宿主」
   --------------------------------------------------------------------------
   需求：把播放详情界面的**背景渲染与交互（含歌词渲染）**抽成独立包
   （frontend/packages/player-skins），主程序只当宿主。
   于是这个文件只剩「宿主该做的事」：

     1. **数据**：歌词的装载与缓存（内嵌 → .lrc → 缓存 → 在线匹配）、
        封面集合与轮播、播放进度、设置项、主题、尺寸；
     2. **托管**：给皮肤一块挂载点（#playerview-stage）、一个整窗背景容器
        （#skin-background），以及一个 ctx 上下文对象；
     3. **推送**：任何「相关信息」变化时主动 update 给皮肤
        （换歌 / 歌词装载完成 / 封面轮播 / 播放进度 / 设置 / 主题 / 尺寸 / 关闭）；
     4. **开合动效**：从下方滑入滑出（这不是皮肤的事，皮肤的 DOM 在舞台里）。

   皮肤拿不到 store、拿不到后端 —— 只能用 ctx。这样第三方皮肤不会因为内部
   重构而碎掉，宿主也不用担心皮肤乱改状态。

   打开方式：点击底栏封面或曲目名（同一个按钮，进/出详情页互相切换）。
   ========================================================================== */

import { $ } from "./dom.js";
import { MOCK_LYRICS, MOCK_LYRICS_ALT } from "./mock.js";
import { backend, isWails } from "./bridge.js";
import { audioElement, seekTo } from "./audio.js";
import { commit, playNext, playPrev, songById, state, togglePlay } from "./store.js";
import { DEFAULT_COVER, clamp, coverOf, esc } from "./utils.js";
import { animationMs } from "./runtime-tokens.js";

import {
  SKIN_API_VERSION,
  findLyricIndex,
  listSkins,
  loadExternalSkin,
  parseLrc,
  resolveSkin,
  unregisterSkin,
} from "@musicplayer/player-skins";

/**
 * 播放详情页滑入 / 滑出，等的是 playerview.css 里的 --pv-slide-dur
 * （= --dur × 1.3）。以前写死 260ms，但「过渡速度」变成用户可调之后，
 * 写死就会在 0.35s / 0.5s 档把滑出的尾巴切掉。
 */
function openCloseMs() {
  return Math.round(animationMs() * 1.3);
}

/**
 * 用户数据目录里的皮肤由后端托管在同源 `/skins/<id>/<file>` 下
 * （见 internal/skins 与 main.go 的 asset server 中间件）。
 * 前缀必须与 Go 侧保持一致。
 */
const SKINS_PREFIX = "/skins/";

/* ==========================================================================
   歌词装载（宿主职责：要访问后端与缓存，皮肤只消费解析好的结果）
   ==========================================================================
   回退链（顺序与设置里的「歌词来源优先级」一致）：
     内嵌歌词 → 同目录同名 .lrc → 本程序缓存 → 在线自动匹配 → 暂无歌词

   前三级由后端 Lyrics.Load 一次搞定（读本地，很快）；在线匹配是网络操作，
   拆成第二步异步做（Lyrics.AutoMatch），这样切歌时界面不会白等十几秒。
   在线试听曲目（不在本地曲库里）没有本地文件，直接走在线匹配，
   匹配到的结果会写进后端缓存 —— 下次再听同一首就不用再联网了。
   ========================================================================== */

let lyricsCache = new Map(); // songId -> { lines, text, source }
/** 已经做过在线匹配的歌曲（避免同一首歌反复联网） */
const autoMatched = new Set();
const lyricsPending = new Set();

function currentSong() {
  return songById(state.currentId);
}

/** 在线匹配是否开启（设置 → 歌词 → 歌词来源优先级里包含 online） */
function onlineLyricsEnabled() {
  const list = state.config.lyricsSources;
  if (!Array.isArray(list) || !list.length) return true;
  return list.includes("online");
}

async function getLyrics(song) {
  if (!song) return { lines: [], text: "", source: "none" };
  if (lyricsCache.has(song.id)) return lyricsCache.get(song.id);

  let text = "";
  let source = "none";

  if (isWails()) {
    // 1) 本地三级：内嵌 → .lrc → 缓存（后端一次做完）
    const res = await backend.loadLyrics(song.id);
    if (res && typeof res === "object" && typeof res.lrc === "string") {
      text = res.lrc;
      source = res.source || "backend";
    } else if (typeof res === "string") {
      text = res;
      source = "backend";
    }

    // 2) 本地都没有 → 在线自动匹配
    if (!text && onlineLyricsEnabled()) {
      text = await tryAutoMatch(song);
      if (text) source = "online";
    }
  }

  if (!text) {
    if (isWails()) {
      // 后端可用但没有歌词：不要编造假歌词，直接显示空态
      const payload = { lines: [], text: "", source: "none" };
      lyricsCache.set(song.id, payload);
      return payload;
    }
    // 浏览器预览：前两首给真实感的示例歌词，其余用占位
    const idx = state.songs.findIndex((s) => s.id === song.id);
    text = idx === 0 ? MOCK_LYRICS : idx === 1 ? MOCK_LYRICS_ALT : buildFallbackLyrics(song);
    source = "preview";
  }

  const payload = { lines: parseLrc(text), text, source };
  lyricsCache.set(song.id, payload);
  return payload;
}

/**
 * 在线自动匹配一次（失败/没匹配到都返回空串，不抛异常）。
 *
 * 本地歌曲走后端 Lyrics.AutoMatch（它会顺手写缓存）；
 * 在线试听曲目没有本地记录，走 Online.Lyrics，再由前端把结果存进后端缓存
 * （这样第二次听同一首就是「命中缓存」而不是重新联网）。
 */
async function tryAutoMatch(song) {
  if (autoMatched.has(song.id)) return "";
  autoMatched.add(song.id);
  try {
    if (song.online) {
      const res = await backend.onlineLyrics(song.title || "", song.artist || "", song.duration || 0);
      const lrc = typeof res?.lrc === "string" ? res.lrc : "";
      if (!lrc) return "";
      backend.lyricsSave(song.id, lrc, res?.source || "online", false).catch(() => {});
      return lrc;
    }
    const res = await backend.lyricsAutoMatch(song.id);
    return typeof res?.lrc === "string" ? res.lrc : "";
  } catch (err) {
    console.warn("[lyrics] 在线自动匹配失败", err);
    return "";
  }
}

function buildFallbackLyrics(song) {
  const out = [];
  for (let t = 12; t < Math.max(60, Math.floor((song.duration || 180000) / 1000) - 10); t += 9) {
    out.push(
      `[00:${String(t).padStart(2, "0")}.00]（${song.title} · 暂无歌词文件，接入后端后可读取 .lrc 或内嵌歌词）`
    );
  }
  return out.join("\n");
}

/** 丢弃某首（或不传 = 全部）的歌词缓存，下次会重新装载 */
export function invalidateLyrics(songId) {
  if (songId) {
    lyricsCache.delete(songId);
    autoMatched.delete(songId);
    // 偏移也要一起清：它只是「对旧文本的临时修正」，文本换了再叠加就错了
    lyricsOffsets.delete(songId);
  } else {
    lyricsCache = new Map();
    autoMatched.clear();
    lyricsOffsets.clear();
  }
  lastPushed.lyricsText = null;
}

/* --------------------------------------------------------------------------
   歌词时间微调（整体提前 / 延后）
   --------------------------------------------------------------------------
   这里只存「**待应用**的偏移」：它作用于歌词**定位**，不改歌词文本。

   为什么这么设计（而不是直接改文本）：
     · 用户是「一边听一边拧」的，每次都重写文本会让高亮抖、也看不到本来时间；
     · 偏移只在定位那一处 + 一次加法，微调面板上的预览、详情页、桌面歌词、
       桌面背景歌词、第三方皮肤全都自动一致（它们都走 findLyricIndex）。
   点「应用到歌词」时才把偏移烙进时间戳并写盘（见 lyrics-panel.js），
   所以这里不需要任何持久化，进程重启后归零是正确行为。
   -------------------------------------------------------------------------- */
const lyricsOffsets = new Map(); // songId -> 毫秒（正数 = 整体延后）

/** 取某首歌当前生效的待应用偏移（毫秒） */
export function lyricsOffsetOf(songId) {
  return lyricsOffsets.get(songId) || 0;
}

/** 设置待应用偏移，并立即重推一次（皮肤 / 桌面歌词同步跟着动） */
export function setLyricsOffset(songId, ms) {
  if (!songId) return 0;
  const value = Math.round(Number(ms) || 0);
  if (!value) lyricsOffsets.delete(songId);
  else lyricsOffsets.set(songId, value);
  lastPushed.lyricsText = null;
  if (host.ctx && currentSong()?.id === songId) push({ type: "lyrics", ...mediaSnapshot() });
  return value;
}

/**
 * 取某首歌**应用了待应用偏移之后**的歌词行。
 *
 * 为什么偏移加在「行」上而不是加在「定位时间」上：
 * 消费歌词的一共有两拨人 —— 宿主自己算的 `lyrics.index`，以及**皮肤自己**
 * 拿 `ctx.playback().position` 再算一遍行号的（classic / fx-lyrics 都是这样）。
 * 把偏移加在时间上只有前者能照顾到，详情页的高亮会跟微调面板对不上；
 * 加在行上则两边天然一致，而且不需要改皮肤契约（对皮肤来说那就是「歌词的时间」）。
 *
 * 没有偏移时直接返回原数组：mediaSnapshot 是每帧都会调的，不能每帧都重建
 * N 个对象（100 行歌词 = 每秒 6000 次分配）。
 */
let shiftedCache = { songId: "", offset: 0, lines: [] };

function linesForSong(song) {
  const cached = song ? lyricsCache.get(song.id) : null;
  const raw = cached?.lines || [];
  const offset = lyricsOffsetOf(song?.id);
  if (!offset || !raw.length) return raw;
  if (shiftedCache.songId === song.id && shiftedCache.offset === offset) return shiftedCache.lines;
  const out = raw.map((l) => ({ time: l.time + offset, text: l.text }));
  shiftedCache = { songId: song.id, offset, lines: out };
  return out;
}

/**
 * 当前曲目的歌词原文、来源与行（歌词工作台用）。
 *
 * 返回**原文**而不是解析结果：微调要在原文上整体平移（保留作词/作曲这类
 * 没有时间标签的信息行），手动编辑也要把原文放进文本框。
 */
export function currentLyricsInfo(songId) {
  // songId 可选：手动编辑的草稿属于「某一首」而不是「当前正在播的那首」，
  // 用户在编辑途中切歌时，保存目标必须仍然是草稿原本那首（见 lyrics-panel.js）。
  const song = songId ? songById(songId) : currentSong();
  const cached = song ? lyricsCache.get(song.id) : null;
  return {
    song: song || null,
    songId: song?.id || "",
    text: cached?.text || "",
    source: cached?.source || "none",
    lines: cached?.lines || [],
  };
}

/** 歌词来源的中文名（面板与设置界面共用同一套说法） */
export function lyricsSourceLabel(source) {
  switch (source) {
    case "embedded":
      return "音频内嵌";
    case "lrc-file":
      return "同名 .lrc 文件";
    case "cache":
      return "程序缓存";
    case "online":
      return "在线匹配";
    case "manual":
      return "手动编辑";
    case "preview":
      return "预览数据";
    default:
      return "暂无";
  }
}

/** 确保当前歌曲的歌词已装入缓存（桌面歌词在详情页未打开时也要能显示）。 */
export async function ensureLyricsLoaded() {
  const song = currentSong();
  if (!song || lyricsCache.has(song.id) || lyricsPending.has(song.id)) return;
  lyricsPending.add(song.id);
  try {
    await getLyrics(song);
  } finally {
    lyricsPending.delete(song.id);
  }
}

/** 当前应高亮的那一句歌词文本（供桌面歌词悬浮条使用）。 */
export function currentLyricLine() {
  const song = currentSong();
  if (!song) return "";
  const lines = linesForSong(song);
  if (!lines.length) return "";
  const idx = findLyricIndex(lines, state.position);
  return idx >= 0 ? lines[idx].text : "";
}

/**
 * 当前歌词的三行窗口：上一行 / 当前行 / 下一行。
 *
 * 桌面背景歌词是铺满整屏的，只画一行太单薄，所以要多给上下两行做上下文
 * （窗口歌词只有一条窄条，用不上，所以那边仍然用 currentLyricLine）。
 * 三行一次性算好再推，省得让背景窗口自己去解析歌词 —— 它连歌词缓存都够不到。
 */
export function currentLyricWindow() {
  const empty = { prev: "", text: "", next: "" };
  const song = currentSong();
  if (!song) return empty;
  const lines = linesForSong(song);
  if (!lines.length) return empty;
  const idx = findLyricIndex(lines, state.position);
  if (idx < 0) return empty;
  return {
    prev: lines[idx - 1]?.text || "",
    text: lines[idx].text || "",
    next: lines[idx + 1]?.text || "",
  };
}

/**
 * 应用一段「外部来源」的歌词（用户手动匹配，或在线接口返回）。
 *
 * 除了更新内存里的渲染缓存，还会把它写进后端缓存：
 * 只放内存的话，关掉应用再打开就没了（这是实测到的问题）。
 * 是否同时嵌入音频文件由设置决定，显式传过去避免配置同步的防抖竞态。
 */
export async function applyOnlineLyrics(songId, text, source = "online", options = {}) {
  if (!songId || !text) return false;
  lyricsCache.set(songId, { lines: parseLrc(text), text, source });
  autoMatched.add(songId);
  lastPushed.lyricsText = null;

  // 后端保存结果（含 note：说明「已缓存」/「已写入歌曲文件」/「该格式不支持」）。
  // 调用方（歌词工作台）需要它来告诉用户这次保存到底有没有真正生效 ——
  // 只回一个 true 的话，遇到「格式不支持写标签」就变成了静默失败。
  let saveResult = null;
  if (!options.transient && isWails()) {
    const embed = options.embed ?? state.config.embedMeta === true;
    try {
      const res = await backend.lyricsSave(songId, text, source, embed);
      saveResult = res || null;
      // 后端在「应用」这一步会把字级歌词（逐字 / QRC / KRC）归一化成行级，
      // 并用归一化后的文本写缓存与内嵌文件。用返回值刷新前端缓存，
      // 否则界面与桌面歌词会一直显示 <00:12.00> 这类逐字标记。
      const saved = typeof res?.lrc === "string" && res.lrc ? res.lrc : text;
      if (saved !== text) {
        lyricsCache.set(songId, { lines: parseLrc(saved), text: saved, source });
        lastPushed.lyricsText = null;
      }
    } catch (err) {
      console.warn("[lyrics] 写入缓存失败", err);
    }
  }

  // 正在看这首 → 立刻重新推给皮肤
  if (host.ctx && currentSong()?.id === songId) push({ type: "lyrics", ...mediaSnapshot() });
  return saveResult || { ok: true };
}

/* ==========================================================================
   皮肤注册表
   ========================================================================== */

/** 加载失败的第三方皮肤：{ id, reason }，设置界面/控制台能看到原因 */
const skinFailures = [];

/**
 * 已经注册进包里的第三方样式 id。
 *
 * 重扫时要拿它跟后端返回的清单对账：上一次加载过、这一次扫不到的
 * 说明磁盘上已经没有了（用户在资源管理器里删了，或者在设置里点了移除），
 * 必须注销掉 —— 只加不减的话，按钮组里会永远留着一个已经删掉的样式。
 */
const externalSkinIds = new Set();

/**
 * 发现全部可用样式：内置样式已在包里注册，这里只补用户数据目录里的第三方皮肤。
 * 幂等：只扫一次；用户丢了新样式后可以调 reloadSkins 重扫。
 */
let skinsReady = null;

async function ensureSkins() {
  if (!skinsReady) skinsReady = discoverSkins();
  return skinsReady;
}

/**
 * 启动时就扫一次样式目录（设置界面用）。
 *
 * 以前样式只在「第一次打开播放详情页」时才扫描，于是刚启动就进设置，
 * 看到的永远只有内置三款 —— 用户会以为第三方样式没被识别。
 */
export async function preloadSkins() {
  try {
    await ensureSkins();
  } catch (err) {
    console.warn("[skins] 启动扫描样式失败", err);
  }
  return listSkins();
}

async function discoverSkins() {
  if (!isWails()) return listSkins();
  try {
    const list = await backend.listSkins();
    const items = Array.isArray(list) ? list : [];
    // 失败清单要跟着这次扫描重建：留着上一次的记录会让「已经修好的样式」
    // 一直挂在「加载失败」里（用户改了文件、重扫，提示却不变）。
    skinFailures.length = 0;

    const found = new Set();
    for (const info of items) {
      if (!info?.id || !info?.module) continue;
      const base = `${SKINS_PREFIX}${encodeURIComponent(info.id)}/`;
      try {
        await loadExternalSkin({
          id: info.id,
          name: info.name,
          module: base + String(info.module).replace(/^\/+/, ""),
          styles: (Array.isArray(info.styles) ? info.styles : []).map(
            (s) => base + String(s).replace(/^\/+/, "")
          ),
        });
        externalSkinIds.add(info.id);
        found.add(info.id);
      } catch (err) {
        skinFailures.push({ id: info.id, reason: err?.message ?? String(err) });
        console.warn(`[skins] 样式「${info.id}」加载失败：`, err);
      }
    }

    // 以磁盘为准：这次没扫到的第三方样式从注册表里摘掉
    for (const id of [...externalSkinIds]) {
      if (found.has(id)) continue;
      externalSkinIds.delete(id);
      unregisterSkin(id);
    }
  } catch (err) {
    console.warn("[skins] 皮肤目录扫描失败", err);
  }
  return listSkins();
}

/** 重扫第三方皮肤（设置界面里点「重新扫描样式」时调用） */
export async function reloadSkins() {
  skinsReady = null;
  await ensureSkins();
  paintSkinButtons();
}

/**
 * 移除一个第三方样式（后端删目录 + 前端立刻按磁盘重扫）。
 *
 * 删掉的正好是当前生效的那个时，把配置切回默认样式：不然配置会一直指向
 * 一个不存在的 id，下次打开详情页只会悄悄回退，用户以为「设置没保存」。
 */
export async function removeSkin(id) {
  await backend.deleteSkin(id);
  await reloadSkins();
  const alive = listSkins().some((s) => s.id === id);
  if (!alive && (state.pvMode === id || state.config.playerViewMode === id)) {
    setPlayerViewMode(resolveSkin("").skin?.id || "");
  }
  return { removed: !alive, skinIds: listSkins().map((s) => s.id) };
}

/** 供设置界面展示「哪些样式加载失败了」 */
export function skinLoadFailures() {
  return skinFailures.slice();
}

function paintSkinButtons() {
  const box = $("#playerview-mode");
  if (!box) return;
  const html = listSkins()
    .map((s) => {
      const id = esc(s.id);
      const name = esc(s.name || s.id);
      // data-pv-mode 是历史属性名：留着它，旧自检脚本仍能按样式切换
      return `<button class="viewmode__btn" type="button" data-pv-skin="${id}" data-pv-mode="${id}"
        aria-pressed="false" data-tip="${name}" aria-label="${name}">
        <svg><use href="#i-${esc(s.icon || "disc")}"/></svg>
      </button>`;
    })
    .join("");
  if (box.dataset.rendered !== html) {
    box.dataset.rendered = html;
    box.innerHTML = html;
  }
  const active = state.pvMode;
  box.querySelectorAll(".viewmode__btn").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.pvSkin === active));
  });
}

/* ==========================================================================
   宿主实例
   ========================================================================== */

const host = {
  view: null,
  stage: null,
  backgroundRoot: null,
  skin: null,
  ctx: null,
  mountedId: null,
  closeTimer: null,
  resizeObserver: null,
  themeObserver: null,
  carouselTimer: null,
  carouselIndex: 0,
  carouselLastAdvance: 0,
  carouselSongId: null,
};

/** 上一次推给皮肤的关键值（用来判断「要不要推」，而不是每帧都推） */
const lastPushed = {
  songId: null,
  cover: null,
  lyricsText: null,
  options: null,
  playing: null,
  themeId: null,
};

/* --------------------------------------------------------------------------
   上下文：皮肤唯一的入口
   -------------------------------------------------------------------------- */

function playbackSnapshot() {
  return {
    position: state.position,
    duration: state.duration,
    playing: state.playing,
    volume: state.volume,
    muted: state.muted,
  };
}

/** 当前歌的封面集合（没有多封面时就是「一首歌一张」） */
function coverListOf(song) {
  if (!song) return [DEFAULT_COVER];
  const items = state.coverSets.get(song.id)?.items;
  const list = Array.isArray(items) ? items.map((i) => i.preview).filter(Boolean) : [];
  if (list.length) return list;
  return [coverOf(song)];
}

function lyricsSnapshot(song) {
  const cached = song ? lyricsCache.get(song.id) : null;
  // lines 是**应用了待应用偏移**的行（见 linesForSong）：皮肤拿它配
  // ctx.playback().position 自己算行号，也是对的
  const lines = linesForSong(song);
  return {
    lines,
    text: cached?.text || "",
    source: cached?.source || "none",
    index: findLyricIndex(lines, state.position),
  };
}

function mediaSnapshot() {
  const song = currentSong();
  const covers = coverListOf(song);
  const index = clamp(host.carouselIndex, 0, Math.max(0, covers.length - 1));
  return {
    song,
    cover: covers[index] || DEFAULT_COVER,
    covers,
    coverIndex: index,
    lyrics: lyricsSnapshot(song),
  };
}

function optionsSnapshot() {
  return {
    showLyrics: state.config.showLyrics !== false,
    lyricsFontSize: state.config.lyricsFontSize,
    animations: state.config.animations !== false,
    coverCarousel: state.config.coverCarousel === true,
    coverCarouselInterval: carouselSettings().seconds,
    // 主窗口永远是可交互的。桌面背景歌词窗口用同一个快照并把这一项改成 false
    // （见 desktop-wallpaper.js），皮肤据此把可点/可聚焦的东西去掉。
    interactive: true,
  };
}

/* --------------------------------------------------------------------------
   快照出口：给「桌面背景歌词」镜像到另一个窗口用
   --------------------------------------------------------------------------
   桌面背景歌词窗口跑的是**同一套皮肤**，所以它需要一个形状完全一样的 ctx。
   它自己够不到 store（也不该够到），于是由主窗口按皮肤契约把快照推过去。

   这里只把内部快照原样暴露出去、不做任何加工：任何加工都会让「详情页里的皮肤」
   和「桌面上的皮肤」慢慢长出两套逻辑，而那正是这次改动要避免的事。
   -------------------------------------------------------------------------- */

/** 当前曲目/封面/歌词快照（= 皮肤 ctx.media() 的那一份） */
export function currentMediaSnapshot() {
  return mediaSnapshot();
}

/** 当前播放进度快照（= 皮肤 ctx.playback() 的那一份） */
export function currentPlaybackSnapshot() {
  return playbackSnapshot();
}

/** 当前显示设置快照；overrides 用来按宿主覆写（例如桌面那边把 interactive 关掉） */
export function currentOptionsSnapshot(overrides = {}) {
  return { ...optionsSnapshot(), ...overrides };
}

function makeCtx() {
  /** @type {Map<string, Set<(patch: any) => void>>} */
  const listeners = new Map();

  const ctx = {
    root: host.stage,
    backgroundRoot: host.backgroundRoot,
    audio: audioElement(),
    defaultCover: DEFAULT_COVER,
    get themeId() {
      return document.documentElement.dataset.theme || "";
    },
    get mode() {
      return document.documentElement.dataset.mode === "light" ? "light" : "dark";
    },
    playback: playbackSnapshot,
    media: mediaSnapshot,
    options: optionsSnapshot,
    actions: {
      seek(ms) {
        seekTo(ms);
        syncPlaybackState({ force: true });
      },
      togglePlay,
      next: () => playNext(false),
      prev: () => playPrev(),
      openFolder() {
        const song = currentSong();
        if (song?.path) backend.revealInExplorer(song.path);
      },
      openCoverPanel() {
        const song = currentSong();
        if (!song || song.online) return;
        import("./coverpanel.js").then((m) => m.openCoverPanel(song.id));
      },
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
        host.skin?.update?.(ctx, patch);
      } catch (err) {
        console.warn(`[skins] ${host.mountedId} 处理 ${patch.type} 更新失败`, err);
      }
      for (const [type, set] of listeners) {
        if (type !== patch.type && type !== "*") continue;
        for (const fn of set) {
          try {
            fn(patch);
          } catch (err) {
            console.warn(`[skins] ${type} 订阅回调失败`, err);
          }
        }
      }
    },
  };
  return ctx;
}

function push(patch) {
  host.ctx?.push(patch);
}

/* --------------------------------------------------------------------------
   挂载 / 卸载
   -------------------------------------------------------------------------- */

function mountSkin(id) {
  const { skin, fellBack } = resolveSkin(id);
  if (!skin) return;
  if (fellBack) console.warn(`[skins] 样式「${id}」不存在，已回退到「${skin.name}」`);

  unmountSkin();

  host.skin = skin;
  host.mountedId = skin.id;
  host.stage.innerHTML = "";
  // data-skin 是给皮肤 CSS 用的作用域钩子（皮肤包里的选择器都写成 [data-skin="xxx"]）
  host.view.dataset.skin = skin.id;
  document.getElementById("app")?.setAttribute("data-mode", skin.id);

  const ctx = makeCtx();
  host.ctx = ctx;

  try {
    skin.mount(ctx);
  } catch (err) {
    console.error(`[skins] ${skin.id} 挂载失败`, err);
    host.stage.innerHTML = `<div class="skin-error">样式「${esc(skin.name)}」加载失败：${esc(
      err?.message ?? err
    )}</div>`;
    return;
  }

  // 挂载完成后立刻推一次全量快照：皮肤不需要自己再拉一遍数据
  ctx.push({ type: "mount", ...mediaSnapshot(), ...playbackSnapshot(), options: optionsSnapshot() });
  watchResize();
  // 新皮肤（尤其带整窗背景层的）落下时统一从「关闭态」起步，
  // 由 renderPlayerView 翻到「打开态」触发一次滑入淡入 —— 换样式也一样流畅。
  setSkinBackground("closed");
}

/* --------------------------------------------------------------------------
   整窗背景层的进出场
   --------------------------------------------------------------------------
   背景层（`.skin-bg`，沉浸类样式用）由宿主放在 `.playerview` 之外，因为它要
   盖住侧边栏与主内容。它以前只跟着皮肤的 mount / unmount 切 hidden，
   于是「详情页在滑动、背景却硬切」：关闭时背景一直盖着整个窗口、
   到卸载那一刻才瞬间消失，进详情页时也是啪地出现 —— 背景越复杂越难看。

   现在由宿主在同一个地方（renderPlayerView）给它打 data-state，
   与 `.playerview` 用同一套时长与缓动做「向下滑出 + 淡出 / 向上滑入 + 淡入」。
   注意 hidden 仍然由皮肤包控制（它决定「这张样式要不要背景」），
   这里只管「显示与消失的过程」。
   -------------------------------------------------------------------------- */

function setSkinBackground(state) {
  const bg = host.backgroundRoot;
  if (bg) bg.dataset.state = state;
}

function unmountSkin() {
  if (!host.skin) return;
  push({ type: "close" });
  push({ type: "destroy" });
  try {
    host.skin.destroy?.(host.ctx);
  } catch (err) {
    console.warn(`[skins] ${host.mountedId} 卸载失败`, err);
  }
  host.stage.innerHTML = "";
  host.skin = null;
  host.ctx = null;
  host.mountedId = null;
  if (host.resizeObserver) {
    host.resizeObserver.disconnect();
    host.resizeObserver = null;
  }
}

function watchResize() {
  if (host.resizeObserver || typeof ResizeObserver !== "function") return;
  host.resizeObserver = new ResizeObserver(() => {
    const r = host.stage.getBoundingClientRect();
    push({ type: "resize", width: Math.round(r.width), height: Math.round(r.height) });
  });
  host.resizeObserver.observe(host.stage);
}

/* --------------------------------------------------------------------------
   封面轮播
   --------------------------------------------------------------------------
   需求：多封面时可以轮播。轮播只影响**详情页正在显示哪一张**，
   不动「当前生效封面」—— 后者是列表缩略图 / 底栏 / 写回文件的真相来源，
   每 10 秒跟着换一次会让整个界面的缩略图一起抖，属于干扰。
   -------------------------------------------------------------------------- */

function carouselSettings() {
  const raw = Number(state.config.coverCarouselInterval);
  const seconds = Number.isFinite(raw) && raw > 0 ? Math.max(2, raw) : 10;
  return { enabled: state.config.coverCarousel === true, seconds, intervalMs: seconds * 1000 };
}

function tickCarousel() {
  const song = currentSong();
  if (host.carouselSongId !== (song?.id ?? null)) {
    host.carouselSongId = song?.id ?? null;
    host.carouselIndex = state.coverSets.get(song?.id)?.active ?? 0;
    host.carouselLastAdvance = Date.now();
  }
  const { enabled, intervalMs } = carouselSettings();
  const covers = coverListOf(song);
  if (!enabled || !state.playerOpen || !state.playing || covers.length < 2) return;
  if (Date.now() - host.carouselLastAdvance < intervalMs) return;
  host.carouselLastAdvance = Date.now();
  host.carouselIndex = (host.carouselIndex + 1) % covers.length;
  push({ type: "media", ...mediaSnapshot() });
}

function ensureCarouselTicker() {
  if (host.carouselTimer) return;
  // 1 秒一跳的「检查器」而不是按间隔直接起定时器：
  // 这样改设置、暂停、切歌都能立刻生效，不用到处重起定时器
  host.carouselTimer = setInterval(tickCarousel, 1000);
}

/** 手动切到下一张封面（点详情页封面时用） */
export function nextCover() {
  const covers = coverListOf(currentSong());
  if (covers.length < 2) return false;
  host.carouselIndex = (host.carouselIndex + 1) % covers.length;
  host.carouselLastAdvance = Date.now();
  push({ type: "media", ...mediaSnapshot() });
  return true;
}

/** 封面集合变化后立刻通知皮肤（封面面板保存完就调它，不必等下一帧） */
export function notifyCoverChanged() {
  lastPushed.cover = null;
  if (!host.ctx) return;
  push({ type: "media", ...mediaSnapshot() });
}

/* --------------------------------------------------------------------------
   推送辅助
   -------------------------------------------------------------------------- */

/** 推「曲目/封面/歌词」快照；只在真的变了（或被强制）时推 */
function pushMedia(extra = {}) {
  const media = mediaSnapshot();
  const forced = extra.type === "song" || extra.type === "lyrics" || extra.type === "media";
  const changed = media.cover !== lastPushed.cover || media.song?.id !== lastPushed.songId;
  lastPushed.cover = media.cover;
  if (!changed && !forced) return;
  push({ ...extra, ...media });
}

function pushOptions() {
  const options = optionsSnapshot();
  const serialized = JSON.stringify(options);
  if (serialized === lastPushed.options) return;
  lastPushed.options = serialized;
  push({ type: "options", options });
}

/* ==========================================================================
   渲染入口（由 main.js 每帧调用）
   ========================================================================== */

export async function renderPlayerView() {
  if (!host.view) {
    host.view = $("#playerview");
    host.stage = $("#playerview-stage");
    host.backgroundRoot = document.getElementById("skin-background");
    if (!host.view || !host.stage) return;
    observeTheme();
    ensureCarouselTicker();
  }

  const view = host.view;
  const appEl = document.getElementById("app");
  const song = currentSong();
  const open = Boolean(state.playerOpen);

  if (appEl) {
    // data-view 驱动侧边栏收起与播放界面铺满；data-mode 供样式自己的 chrome 规则用
    appEl.dataset.view = open ? "player" : "library";
  }
  // 「详情页显示歌词」开关：关掉时歌词区收起，详情页只留封面/曲目信息
  view.dataset.lyrics = state.config.showLyrics === false ? "off" : "on";

  if (!open) {
    if (view.dataset.state !== "closed") {
      view.dataset.state = "closed";
      // 背景层跟着一起向下滑出淡出（它不在 .playerview 里，必须显式同步）
      setSkinBackground("closed");
      if (host.closeTimer) clearTimeout(host.closeTimer);
      host.closeTimer = setTimeout(() => {
        host.closeTimer = null;
        if (state.playerOpen) return;
        view.hidden = true;
        unmountSkin();
        resetPushed();
      }, openCloseMs() + 20);
    }
    return;
  }

  if (host.closeTimer) {
    clearTimeout(host.closeTimer);
    host.closeTimer = null;
  }
  view.hidden = false;

  await ensureSkins();
  paintSkinButtons();

  const wanted = state.pvMode || state.config.playerViewMode || "";
  const remounted = host.mountedId !== wanted;
  if (remounted) {
    mountSkin(wanted);
    resetPushed();
  }

  /**
   * 打开详情页的入场动效。
   *
   * 必须在**元素已经参与渲染**之后才能改 data-state：从 display:none 直接跳到
   * 结束态不会产生过渡（浏览器不把「刚出现的元素」当作过渡起点），
   * 表现就是「关的时候有滑出动画，开的时候啪地出现」。
   * 所以这里先强制一次样式重算，再翻状态；背景层同理（换样式时它也要重新入场）。
   */
  if (view.dataset.state !== "opened" || remounted) {
    void view.offsetHeight;
    view.dataset.state = "opened";
    setSkinBackground("opened");
  }

  // 「更换封面」对在线试听曲目没有意义（没有本地文件可写）
  const coverBtn = $("#btn-player-cover");
  if (coverBtn) coverBtn.disabled = !song || Boolean(song.online);
  paintCarouselButton();

  if (!host.skin) return;

  // 换歌：先推 song（含封面与「已缓存的歌词」），歌词装载完成后再补一次 lyrics
  if (lastPushed.songId !== (song?.id ?? null)) {
    lastPushed.songId = song?.id ?? null;
    lastPushed.cover = null;
    lastPushed.lyricsText = null;
    host.carouselSongId = song?.id ?? null;
    host.carouselIndex = state.coverSets.get(song?.id)?.active ?? 0;
    pushMedia({ type: "song" });

    const pending = song?.id ?? null;
    const lyrics = await getLyrics(song);
    if ((currentSong()?.id ?? null) !== pending) return; // 等待期间又换歌了
    lastPushed.lyricsText = lyrics.text;
    pushMedia({ type: "lyrics" });
    pushOptions();
    return;
  }

  // 封面变化（封面面板应用/切换、轮播到下一张）
  pushMedia();

  // 歌词变化（手动匹配、在线匹配回来）
  const lyrics = lyricsSnapshot(song);
  if (lyrics.text !== lastPushed.lyricsText) {
    lastPushed.lyricsText = lyrics.text;
    push({ type: "lyrics", ...mediaSnapshot() });
  }

  pushOptions();
  syncPlaybackState();
}

function resetPushed() {
  lastPushed.songId = null;
  lastPushed.cover = null;
  lastPushed.lyricsText = null;
  lastPushed.options = null;
  lastPushed.playing = null;
}

/** 轮播开关按钮的可用态与按下态 */
function paintCarouselButton() {
  const btn = $("#btn-cover-carousel");
  if (!btn) return;
  const covers = coverListOf(currentSong());
  const enabled = state.config.coverCarousel === true;
  const usable = covers.length > 1;
  btn.disabled = !usable;
  btn.setAttribute("aria-pressed", String(enabled && usable));
  const seconds = carouselSettings().seconds;
  btn.dataset.tip = usable
    ? enabled
      ? "关闭封面轮播"
      : `开启封面轮播（每 ${seconds} 秒换一张）`
    : "这首歌只有一张封面";
}

/* --------------------------------------------------------------------------
   播放状态同步（进度 → 皮肤）
   -------------------------------------------------------------------------- */

export function syncPlaybackState({ force = false } = {}) {
  if (!state.playerOpen || !host.skin) return;
  const playback = playbackSnapshot();
  if (lastPushed.playing !== playback.playing || force) {
    lastPushed.playing = playback.playing;
    push({ type: "state", ...playback });
  }
  push({ type: "progress", ...playback, lyricIndex: lyricsSnapshot(currentSong()).index });
}

/* --------------------------------------------------------------------------
   主题变化
   -------------------------------------------------------------------------- */

function observeTheme() {
  if (host.themeObserver) return;
  lastPushed.themeId = document.documentElement.dataset.theme || "";
  host.themeObserver = new MutationObserver(() => {
    const themeId = document.documentElement.dataset.theme || "";
    const mode = document.documentElement.dataset.mode || "dark";
    if (themeId === lastPushed.themeId) return;
    lastPushed.themeId = themeId;
    push({ type: "theme", themeId, mode });
  });
  host.themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-mode"],
  });
}

/* ==========================================================================
   对外动作
   ========================================================================== */

/**
 * 切换播放详情页样式。
 * 不识别的 id 会退回默认样式，并把真实生效的 id 写回 state/config —— 这样
 * 「用户删掉了一个第三方皮肤」不会让配置永远指向一个不存在的 id。
 */
export function setPlayerViewMode(id) {
  const { skin, fellBack } = resolveSkin(id);
  if (!skin) return;
  state.pvMode = skin.id;
  state.config.playerViewMode = skin.id;
  resetPushed();
  commit();
  if (fellBack) console.warn(`[skins] 样式「${id}」不可用，已切换到「${skin.name}」`);
}

export function openPlayer() {
  state.playerOpen = true;
  // 配置里的样式可能已经被用户删掉了，这里统一走一次解析
  state.pvMode = resolveSkin(state.config.playerViewMode || "").skin?.id || state.pvMode;
  resetPushed();
  commit();
}

export function closePlayer() {
  state.playerOpen = false;
  commit();
}

export function togglePlayer() {
  if (state.playerOpen) closePlayer();
  else openPlayer();
}

/** 当前可用的样式 id（含运行时加载的第三方样式） */
export function playerSkinIds() {
  return listSkins().map((s) => s.id);
}

/**
 * 当前可用的样式清单（设置界面展示用）。
 *
 * 只暴露「展示需要」的字段：皮肤对象里可能挂着内部状态/函数，
 * 直接交出去会让设置界面或者其它调用方有机会改到它。
 */
export function availableSkins() {
  return listSkins().map((s) => ({
    id: s.id,
    name: s.name,
    icon: s.icon || "disc",
    // 内置的来自包（builtin 未声明），运行时加载的会显式标 false
    builtin: s.builtin !== false,
    source: s.source || "",
  }));
}

/** 皮肤接口版本（设置界面展示 / 排障用） */
export const PLAYER_SKIN_API_VERSION = SKIN_API_VERSION;
