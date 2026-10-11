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
import { requestAppUpdate } from "./ui/base.js";
import { MOCK_LYRICS, MOCK_LYRICS_ALT } from "./mock.js";
import { backend, isWails } from "./bridge.js";
import { seekTo, spectrumSnapshot } from "./audio.js";
import { commit, isLiked, playNext, playPrev, songById, state, toggleLike, togglePlay } from "./store.js";
import { DEFAULT_COVER, clamp, coverOf } from "./utils.js";
import { animationMs } from "./runtime-tokens.js";
import { toggleLyricsPanel } from "./lyrics-panel.js";

import {
  deriveChrome,
  findLyricIndex,
  getSkin,
  listSkins,
  loadSkin,
  lyricDisplayText,
  noteBuiltin,
  parseLrc,
  resetBuiltins,
  resolveSkin,
  unregisterSkin,
} from "@localmusicplayer/player-skins";
import { createSkinHost } from "./skinhost.js";

/**
 * 播放详情页滑入 / 滑出，等的是 playerview.css 里的 --pv-slide-dur
 * （= --dur × 1.3）。以前写死 260ms，但「过渡速度」变成用户可调之后，
 * 写死就会在 0.5s / 0.75s 档把滑出的尾巴切掉。
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
     内嵌歌词 → 同目录 .lrc → 歌词缓存 → 在线自动匹配 → 暂无歌词

   前三级由后端 Lyrics.Load 一次搞定（读本地，很快）；在线匹配是网络操作，
   拆成第二步异步做（Lyrics.AutoMatch），这样切歌时界面不会白等十几秒。
   在线试听曲目（不在本地曲库里）没有本地文件，直接走在线匹配，
   匹配到的结果会写进后端缓存 —— 下次再听同一首就不用再联网了。
   ========================================================================== */

/* 歌词装载状态：样式据此显示「匹配中 / 匹配失败」而不是一律「暂无歌词」。
   idle/ok 有内容时不显示文案，只有空态才会用到 statusText。 */
const LYRICS_STATUS_TEXT = {
  loading: "歌词匹配中…",
  matching: "歌词匹配中…",
  failed: "歌词匹配失败",
  none: "暂无歌词",
};

/* --------------------------------------------------------------------------
   歌词缓存的上限（LRU）
   --------------------------------------------------------------------------
   这几个缓存原来都是**无上限**的：每播一首新歌就往 lyricsCache 里塞一条
   （含整份歌词行数组），autoMatched / lyricsOffsets 同理。长时间挂着播放
   （或者开着自动匹配连续切歌）会一直涨，而它们缓存的数据**丢了完全能重建**
   （重新读一次本地 / 再匹配一次），所以用 LRU 封顶是纯收益。

   上限取 300 首：远大于「一个会话里会来回切的那几十首」，又能把内存封死。
   store.js 的 PROGRESS_MAX=1500 是同一思路的先例。

   为什么不用 Map 的插入顺序就够了：Map 保持插入序，重写一个 key 不会把它
   移到末尾。所以读取时显式 delete + set 一次，把它刷成「最近使用」——
   这是 LRU 与 FIFO 的唯一差别，而它对「来回听同一批歌」的场景很关键。
   -------------------------------------------------------------------------- */
const LYRICS_CACHE_MAX = 300;

/**
 * 带上限的 Map：set 之后自动淘汰最旧的一条。
 *
 * 为什么用子类而不是在每个写入点手动 trim：写入点有 6 处以上，漏一处就是
 * 一个静默的无界增长 —— 与 base.js 用 deps 数组取代「手工 renderKey」是同一个
 * 理由：把纪律放进一个漏斗里，就不可能漏。
 */
class BoundedMap extends Map {
  constructor(max, entries) {
    super(entries);
    this.max = max;
  }
  set(key, value) {
    // 先删再插：保证「重写已有 key」也把它刷成最近使用（LRU 而非 FIFO）
    if (super.has(key)) super.delete(key);
    super.set(key, value);
    while (this.size > this.max) {
      const oldest = super.keys().next();
      if (oldest.done) break;
      super.delete(oldest.value);
    }
    return this;
  }
  /** 标记为最近使用（读取路径调用） */
  touch(key) {
    if (!super.has(key)) return undefined;
    const v = super.get(key);
    this.set(key, v);
    return v;
  }
}

/**
 * 带上限的 Set（同样是「插入后淘汰最旧」）。
 * autoMatched 只用来回答「这首歌已经联网匹配过了吗」，丢了最坏就是再匹配一次，
 * 所以淘汰是安全的；不封顶则会在长时间连续切歌时持续增长。
 */
class BoundedSet extends Set {
  constructor(max, values) {
    super(values);
    this.max = max;
  }
  add(value) {
    if (super.has(value)) return this;
    super.add(value);
    while (this.size > this.max) {
      const oldest = super.values().next();
      if (oldest.done) break;
      super.delete(oldest.value);
    }
    return this;
  }
}

const lyricsCache = new BoundedMap(LYRICS_CACHE_MAX); // songId -> { lines, text, source, status }
/** 已经做过在线匹配的歌曲（避免同一首歌反复联网） */
const autoMatched = new BoundedSet(LYRICS_CACHE_MAX);
const lyricsPending = new Set();

/**
 * 更新某首歌的歌词装载状态，并在它正好是当前曲目时立刻推给皮肤。
 *
 * 为什么需要这一步：宿主先前只把「歌词文本」推给样式，而自动匹配期间文本
 * 一直是空的 —— 样式只能显示「暂无歌词」，用户以为这首歌没有歌词，
 * 实际上联网匹配还在跑（AI 清洗元数据时可能要十几秒）。
 * 现在文本变了**或者状态变了**都会推。
 */
function setLyricsStatus(song, status) {
  if (!song?.id) return;
  const cur = lyricsCache.get(song.id) || { lines: [], text: "", source: "none" };
  if (cur.status === status) return;
  lyricsCache.set(song.id, { ...cur, status });
  lastPushed.lyricsStatus = null; // 让下一次同步一定会带上新状态
  if (currentSong()?.id === song.id) push({ type: "lyrics", ...mediaSnapshot() });
}

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
  if (!song) return { lines: [], text: "", source: "none", status: "none" };
  if (lyricsCache.has(song.id)) return lyricsCache.get(song.id);

  let text = "";
  let source = "none";
  // 先给出「正在装载」的空快照：本地三级读完之前界面不该是空的，
  // 更重要的是下面联网匹配可能要十几秒（AI 清洗元数据），
  // 那段时间里样式显示「歌词匹配中…」而不是「暂无歌词」。
  lyricsCache.set(song.id, { lines: [], text: "", source: "none", status: "loading" });

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

    // 2) 本地都没有 → 在线自动匹配（期间状态 = matching）
    if (!text && onlineLyricsEnabled()) {
      setLyricsStatus(song, "matching");
      text = await tryAutoMatch(song);
      if (text) source = "online";
    }
  }

  if (!text) {
    if (isWails()) {
      // 后端可用但没有歌词：不要编造假歌词，直接显示空态。
      // status 区分「联网匹配过且失败」与「本来就没有 / 联网被关掉」，
      // 前者文案是「歌词匹配失败」，后者才是「暂无歌词」。
      const status = onlineLyricsEnabled() ? "failed" : "none";
      const payload = { lines: [], text: "", source: "none", status };
      lyricsCache.set(song.id, payload);
      return payload;
    }
    // 浏览器预览：前两首给真实感的示例歌词，其余用占位
    const idx = state.songs.findIndex((s) => s.id === song.id);
    text = idx === 0 ? MOCK_LYRICS : idx === 1 ? MOCK_LYRICS_ALT : buildFallbackLyrics(song);
    source = "preview";
  }

  const payload = { lines: parseLrc(text), text, source, status: "ok" };
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
const lyricsOffsets = new BoundedMap(LYRICS_CACHE_MAX); // songId -> 毫秒（正数 = 整体延后）

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
  if (host.skinHost && currentSong()?.id === songId) push({ type: "lyrics", ...mediaSnapshot() });
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
  // 多语言副行（trans）必须跟着偏移一起走 —— 漏了它会让「应用了微调的歌词」
  // 退化成只剩原文。字级时间轴（words，每个字素一个起始毫秒）同理：漏了它
  // 就会出现「行高亮挪了、字却还按原时间点亮」。只有真的有这些键才挂，
  // 单语言、行级的行形状与从前一致。
  const out = raw.map((l) => {
    /** @type {{time:number,text:string,trans?:string[],words?:number[]}} */
    const next = { time: l.time + offset, text: l.text };
    if (l.trans) next.trans = l.trans;
    if (l.words) next.words = l.words.map((w) => w + offset);
    return next;
  });
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
    // 装载状态：歌词工作台与详情页都要能说出「正在匹配」而不是「暂无」
    status: cached?.status || (cached?.lines?.length ? "ok" : "none"),
    lines: cached?.lines || [],
  };
}

/** 歌词来源的中文名（面板与设置界面共用同一套说法） */
export function lyricsSourceLabel(source) {
  switch (source) {
    case "embedded":
      return "内嵌歌词";
    case "lrc-file":
      return "同目录 .lrc";
    case "cache":
      return "歌词缓存";
    case "online":
      return "在线自动匹配";
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
  // 多语言歌词：桌面歌词只有一条，把同一时间戳的其它语言行拼在后面一起显示
  return idx >= 0 ? lyricDisplayText(lines[idx]) : "";
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
    prev: lyricDisplayText(lines[idx - 1]) || "",
    text: lyricDisplayText(lines[idx]) || "",
    next: lyricDisplayText(lines[idx + 1]) || "",
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
  lyricsCache.set(songId, { lines: parseLrc(text), text, source, status: "ok" });
  autoMatched.add(songId);
  lastPushed.lyricsText = null;
  lastPushed.lyricsStatus = null;

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
        lyricsCache.set(songId, { lines: parseLrc(saved), text: saved, source, status: "ok" });
        lastPushed.lyricsText = null;
        lastPushed.lyricsStatus = null;
      }
    } catch (err) {
      console.warn("[lyrics] 写入缓存失败", err);
    }
  }

  // 正在看这首 → 立刻重新推给皮肤
  if (host.skinHost && currentSong()?.id === songId) push({ type: "lyrics", ...mediaSnapshot() });
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
  // ★ 异步加载完成后必须主动 bump 一次注册表版本。
  //
  // 契约 v3 起样式是**启动后动态 import** 的（后端下发清单 / 预览走 dev 中间件），
  // 首帧渲染时注册表还是空的；样式按钮组的 Lit 依赖里有 skinRegistryVersion()，
  // 不 bump 它就一直停在"一个按钮都没有" —— 除非恰好有个别的 state 变化顺带
  // 触发重渲染（真机上是配置里的旧样式 id 归一化那次，预览模式下 pv= 查询参数
  // 已经把 pvMode 设成最终值，于是永远等不到那次重渲染，按钮组就一直是空的）。
  bumpSkinVersion();
  return listSkins();
}

/**
 * 拿「样式清单 + 文件 URL 前缀 + token 后缀」。
 *
 * · 真机（Wails）：Go 扫两个根目录（只读资源 + 用户数据目录）并归一化清单，
 *   资源挂在 /skins/<id>/，**要带 token**（见 internal/skins 的 Handler）；
 * · 浏览器预览（npm run dev，没有 Go）：内置样式契约 v3 起不在前端包里，
 *   所以由 Vite 的 dev 中间件镜像同一份扫描（vite.config.js#previewSkins），
 *   资源在 /preview-skins/<id>/，没有 token。
 *
 * 两条路返回的 items **形状相同**，所以下面的加载循环只有一条。
 */
async function fetchSkinList() {
  if (isWails()) {
    const list = await backend.listSkins();
    let token = "";
    try {
      token = String((await backend.skinsToken()) || "");
    } catch (err) {
      console.warn("[skins] 读取皮肤访问令牌失败", err);
    }
    return {
      items: Array.isArray(list) ? list : [],
      base: (id) => `${SKINS_PREFIX}${encodeURIComponent(id)}/`,
      suffix: token ? `?t=${encodeURIComponent(token)}` : "",
    };
  }
  try {
    const res = await fetch("/preview-skins/__list.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    return {
      items: Array.isArray(items) ? items : [],
      base: (id) => `/preview-skins/${encodeURIComponent(id)}/`,
      suffix: "",
    };
  } catch (err) {
    console.warn("[skins] 预览模式读取样式清单失败", err);
    return { items: [], base: (id) => `${SKINS_PREFIX}${encodeURIComponent(id)}/`, suffix: "" };
  }
}

async function discoverSkins() {
  try {
    const { items, base, suffix } = await fetchSkinList();
    // 失败清单要跟着这次扫描重建：留着上一次的记录会让「已经修好的样式」
    // 一直挂在「加载失败」里（用户改了文件、重扫，提示却不变）。
    skinFailures.length = 0;

    const found = new Set();
    // 契约 v3：内置样式与第三方样式**走同一条加载路径** —— 后端扫两个根目录
    // （只读资源目录 + 用户数据目录）并把清单下发，前端只按清单加载。
    // 于是"内置"在这里只是 info.builtin 这个标记，没有第二条代码路径。
    resetBuiltins();
    for (const info of items) {
      if (!info?.id || !info?.module || !info?.manifest) continue;
      const prefix = base(info.id);
      const url = (rel) => prefix + String(rel).replace(/^\/+/, "") + suffix;
      const iconFile = info.manifest?.icon?.file;
      try {
        await loadSkin({
          manifest: info.manifest,
          moduleUrl: url(info.module),
          cssUrls: (Array.isArray(info.styles) ? info.styles : []).map(url),
          iconUrl: iconFile ? url(iconFile) : "",
          builtin: info.builtin === true,
          source: info.source || "",
        });
        if (info.builtin === true) noteBuiltin(getSkin(info.id));
        else externalSkinIds.add(info.id);
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
  bumpSkinVersion();
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

/**
 * 皮肤注册表版本号。
 *
 * 「可用样式清单」是 Lit 组件之外的可变数据（内置 + 运行时加载的第三方样式，
 * 还能被重扫 / 移除）。组件把它放进依赖数组就能跟着更新 ——
 * 取代了迁移前那句 paintSkinButtons() 里的 innerHTML 重建。
 */
let skinVersion = 0;

export function skinRegistryVersion() {
  return skinVersion;
}

function bumpSkinVersion() {
  skinVersion += 1;
  requestAppUpdate();
}

/* ==========================================================================
   宿主实例
   ========================================================================== */

const host = {
  view: null,
  stage: null,
  backgroundRoot: null,
  /**
   * 插件宿主运行时（skinhost.js）：ctx / 推送 / 挂载卸载 / 配色契约都在那边。
   *
   * skin / ctx / mountedId 保留成**只读转发**，原来是三个字段，改起来面太大；
   * 现在它们只有一个真源（skinHost），不会再出现"宿主字段与运行时不同步"。
   */
  skinHost: null,
  get skin() {
    return host.skinHost?.skin || null;
  },
  get ctx() {
    return host.skinHost?.ctx || null;
  },
  get mountedId() {
    return host.skinHost?.mountedId || null;
  },
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
  // 歌词状态也要参与「变了才推」的判断：自动匹配期间文本一直是空的，
  // 只看文本的话状态从 matching → failed 时界面不会更新。
  lyricsStatus: null,
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

/**
 * 只取「当前唱到第几行」，不建完整快照。
 *
 * 为什么单独抽出来：syncPlaybackState 在播放期间每 250ms 走一次，它只需要
 * 这一个整数。原来它调 lyricsSnapshot() 拿到 .index 就把对象丢掉 ——
 * 那份对象含 6 个字段（lines/text/source/status/statusText/index），
 * 每条进度 tick 白白分配一次。findLyricIndex 本身是二分查找（lrc.js），很便宜。
 *
 * @param {object|null} song
 * @returns {number} 行号，-1 表示还没唱到任何一行
 */
function lyricIndexOf(song) {
  if (!song) return -1;
  return findLyricIndex(linesForSong(song), state.position);
}

function lyricsSnapshot(song) {
  const cached = song ? lyricsCache.get(song.id) : null;
  // lines 是**应用了待应用偏移**的行（见 linesForSong）：皮肤拿它配
  // ctx.playback().position 自己算行号，也是对的
  const lines = linesForSong(song);
  // status：ok / loading（本地读取中）/ matching（联网匹配中）/ failed（匹配失败）/ none
  // 只有空态才会用到 statusText，有歌词时它是空串。
  const status = cached?.status || (lines.length ? "ok" : "none");
  return {
    lines,
    text: cached?.text || "",
    source: cached?.source || "none",
    status,
    statusText: lines.length ? "" : LYRICS_STATUS_TEXT[status] || "暂无歌词",
    index: findLyricIndex(lines, state.position),
  };
}

/**
 * 推给皮肤的「曲目」视图：只带样式真的会渲染的字段。
 *
 * 之前这里直接把 store 里的 song 整个递出去 —— 那是个内部对象（本地路径、所属
 * 文件夹、来源标记、文件大小、缓存状态…），皮肤一个字段都用不到，却让内部结构
 * 变成了事实上的对外契约：以后想改内部字段都得先考虑皮肤。样式要用路径相关的
 * 能力就走 ctx.actions（openFolder 之类），不要把路径递出去。
 *
 * @param {{id?:string,title?:string,artist?:string,album?:string,duration?:number,online?:boolean}|null} song
 */
function trackView(song) {
  if (!song) return null;
  return {
    id: song.id ?? "",
    title: song.title || "",
    artist: song.artist || "",
    album: song.album || "",
    duration: song.duration || 0,
    // 契约 v3 的 SkinTrack.kind：插件据此给「在线试听」加标记，但拿不到 URL。
    // store 给在线曲目打的是 online:true（见 store.js#registerOnlineSong）。
    kind: song.online ? "online" : "local",
  };
}

function mediaSnapshot() {
  const song = currentSong();
  const covers = coverListOf(song);
  const index = clamp(host.carouselIndex, 0, Math.max(0, covers.length - 1));
  return {
    song: trackView(song),
    cover: covers[index] || DEFAULT_COVER,
    covers,
    coverIndex: index,
    lyrics: lyricsSnapshot(song),
  };
}

/**
 * 皮肤能看到的「显示相关设置」快照。
 *
 * 显式标注 `performanceMode` 为字面量联合类型：三元表达式的推断结果是宽化的
 * `string`，而皮肤契约里它是 `"smooth" | "performance"` —— 不标注就会让
 * 这个快照与 SkinContext 不兼容（tsc 报 TS2345）。
 *
 * @returns {{
 *   showLyrics: boolean,
 *   lyricsFontSize: number,
 *   animations: boolean,
 *   coverCarousel: boolean,
 *   coverCarouselInterval: number,
 *   interactive: boolean,
 *   performanceMode: "smooth" | "performance",
 * }}
 */
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
    // 背景动效档位：smooth（跟随刷新率，默认）| performance（省电档）。
    // 见 contract.js 的 SkinOptions.performanceMode —— 皮肤收到 smooth 应当
    // 「不限帧」，收到 performance 才套自己的省电预算。
    // 兜底 smooth 与 Go 侧 NormalizeSkinPerformanceMode 一致：静默降级成
    // 省电档会被用户误读成「还是卡 / 程序坏了」。
    performanceMode: state.config.skinPerformanceMode === "performance" ? "performance" : "smooth",
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

/* --------------------------------------------------------------------------
   插件宿主运行时
   --------------------------------------------------------------------------
   ctx / 推送 / 挂载卸载 / 配色契约全部收在 skinhost.js（两个舞台共用一份实现）。
   这里只提供「数据从哪来、动作做什么」。
   -------------------------------------------------------------------------- */

function ensureSkinHost() {
  if (host.skinHost) return host.skinHost;
  host.skinHost = createSkinHost({
    root: host.stage,
    backgroundRoot: host.backgroundRoot,
    view: host.view,
    // 宿主壳（标题栏 / 底栏 / 浮层）消费 --chrome-*：插件只能通过清单里的
    // colors 影响它，而且宿主会做对比度兜底（见 player-skins/colors.js）。
    app: document.getElementById("app"),
    source: {
      playback: playbackSnapshot,
      media: mediaSnapshot,
      options: optionsSnapshot,
      env: skinEnvSnapshot,
      defaultCover: DEFAULT_COVER,
      /**
       * 频谱（拉取式，契约 v3）：插件真的调 ctx.spectrum() 时才会走到这里 ——
       * 「读到才采样」的门控天然成立（30Hz 节流在 spectrum.js）。
       * 没在播放返回 null，与旧约定一致（停止 = 无频谱，皮肤回待机起伏）。
       */
      spectrum: () => (state.playing ? spectrumSnapshot() : null),
      actions: {
        seek(ms) {
          seekTo(ms);
          syncPlaybackState({ force: true });
        },
        seekBy(deltaMs) {
          seekTo(Math.max(0, Number(state.position || 0) + Number(deltaMs || 0)));
          syncPlaybackState({ force: true });
        },
        seekRatio(ratio) {
          const r = Math.max(0, Math.min(1, Number(ratio) || 0));
          if (!state.duration) return;
          seekTo(r * state.duration);
          syncPlaybackState({ force: true });
        },
        togglePlay,
        next: () => playNext(false),
        prev: () => playPrev(),
        toggleLike() {
          const song = currentSong();
          if (song) toggleLike(song.id);
        },
        like() {
          const song = currentSong();
          if (song && !isLiked(song.id)) toggleLike(song.id);
        },
        unlike() {
          const song = currentSong();
          if (song && isLiked(song.id)) toggleLike(song.id);
        },
        openFolder() {
          const song = currentSong();
          if (song?.path) {
            // ★ 必须 catch。
            //
            // 这里原来是 fire-and-forget：文件已经被删掉（或盘符掉线）时，
            // 后端 reject 就变成一条未处理的 promise 拒绝 —— 用户什么提示都没有，
            // 控制台里只有 `Uncaught (in promise)`（而仓库的 cdp 自检脚本正是按
            // 控制台报错判失败的）。曲目表的同名动作（tracks.js 的 reveal 分支）
            // 是 await + 成功/失败提示。
            //
            // 这里不弹提示：playerhost 是**皮肤宿主契约**文件（见文件头的分层说明），
            // 不引入 UI 提示通道，所以只把拒绝吃掉。
            backend.revealInExplorer(song.path).catch(() => {});
          }
        },
        openCoverPanel() {
          const song = currentSong();
          if (!song || song.online) return;
          import("./coverpanel.js").then((m) => m.openCoverPanel(song.id));
        },
        openLyricsPanel() {
          // 宿主歌词面板的入口是 toggleLyricsPanel（见 lyrics-panel.js）：
          // 它已经开着时就收起 —— 插件把它当"打开歌词面板"用即可。
          toggleLyricsPanel();
        },
        /**
         * 随封面取色的插件上报「我现在实际是什么配色」。
         *
         * 只重算宿主壳层变量（低频，用户改封面时才会有），插件画面本身
         * 仍然是它自己的 CSS 说了算 —— 宿主不去猜、也不去改插件的内容。
         */
        reportBackdrop(colors) {
          const current = host.skin;
          if (!current || !colors || typeof colors !== "object") return;
          current.colors = { ...current.colors, ...colors };
          current.chrome = deriveChrome(current.colors);
          host.skinHost?.applyChrome(state.playerOpen && !host.view?.hidden);
        },
      },
    },
  });
  return host.skinHost;
}

/** 运行环境快照（尺寸 / 主题 / 清晰度 / 前后台） */
function skinEnvSnapshot() {
  const rect = host.stage?.getBoundingClientRect?.() || { width: 0, height: 0 };
  return {
    themeId: document.documentElement.dataset.theme || "",
    mode: document.documentElement.dataset.mode === "light" ? "light" : "dark",
    width: Math.round(rect.width || 0),
    height: Math.round(rect.height || 0),
    dpr: Number(window.devicePixelRatio) || 1,
    reducedMotion: Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches),
    foreground: Boolean(state.playerOpen) && !host.view?.hidden,
  };
}

/** 把补丁推给当前插件（宿主各处只调这一个出口） */
function push(patch) {
  host.skinHost?.push(patch);
}

/* --------------------------------------------------------------------------
   挂载 / 卸载
   -------------------------------------------------------------------------- */

function mountSkin(id) {
  const { skin, fellBack } = resolveSkin(id);
  if (!skin) return;
  if (fellBack) console.warn(`[skins] 样式「${id}」不存在，已回退到「${skin.name}」`);

  // 插件 id 可能与请求的不一致（请求的样式被删了 → resolveSkin 回退）。
  // 写回 state，这样 Lit 渲染出来的 data-skin / 按钮按下态与真正挂载的样式一致。
  state.pvMode = skin.id;
  // .app 上的 data-mode = 当前样式 id：宿主 CSS 用它做「按能力让位」的钩子
  // （详见 layout.css：整窗背景型样式下让标题栏/底栏半透明）。
  // 注意它**只表达"谁在挂"**，不再表达任何具体样式的外观 —— 具体样式的外观
  // 归插件自己的 CSS（而且插件的 CSS 在 @layer skin 里，改不到宿主壳）。
  document.getElementById("app")?.setAttribute("data-mode", skin.id);

  // 挂载 / 卸载 / 推送 / 配色全部交给共享运行时（见 skinhost.js）
  ensureSkinHost().mount(skin);
  // 壳层配色跟着插件一起换（详情页正开着时立刻生效）
  host.skinHost.applyChrome(state.playerOpen && !host.view?.hidden);
  watchResize();
  // 新样式（尤其带整窗背景层的）落下时统一从「关闭态」起步，
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
  // 卸载（含 close/destroy 两次推送、插件 destroy、清 DOM 与订阅）
  // 与"壳层配色回到主题"都在运行时里，这里只收尾宿主自己的东西。
  host.skinHost?.unmount();
  if (host.resizeObserver) {
    host.resizeObserver.disconnect();
    host.resizeObserver = null;
  }
  // ★ 轮播定时器必须一起停掉。
  //
  // 它原来是 setInterval(…, 1000) 且全文没有一处 clearInterval ——
  // 卸载皮肤后定时器还在跑，每秒调一次 tickCarousel()，
  // 而那个函数会去读已经清空的 host.stage / host.ctx（潜在报错源），
  // 也让「关掉播放页」之后进程里始终挂着一个无用的常驻定时器。
  if (host.carouselTimer) {
    clearInterval(host.carouselTimer);
    host.carouselTimer = null;
  }
}

// teardownHost 在窗口/详情页彻底销毁时调用：把宿主持有的**长期**watcher
// 也一并释放。与 unmountSkin 的分工：unmountSkin 管「换皮肤 / 关详情页」，
// 这个管「宿主本身不再使用」。
export function teardownHost() {
  unmountSkin();
  if (host.themeObserver) {
    // themeObserver 观察 document.documentElement，从来没有 disconnect 过 ——
    // 它挂在 document 上，只要文档还在就永远不会被 GC，
    // 且每次主题变化都会回调进一个可能已经废弃的宿主。
    host.themeObserver.disconnect();
    host.themeObserver = null;
  }
}

function watchResize() {
  if (host.resizeObserver || typeof ResizeObserver !== "function") return;
  host.resizeObserver = new ResizeObserver(() => {
    const r = host.stage.getBoundingClientRect();
    push({ type: "resize", width: Math.round(r.width), height: Math.round(r.height) });
  });
  // box: "border-box" —— 观察边框盒而不是内容盒。
  // 皮肤会在 resize 里改自己的 padding / 字号（窗口适配比例，见 fit.js）：
  // 默认观察内容盒时，padding 一变就算「尺寸变了」，回调里再写样式会立刻触发
  // 「ResizeObserver loop completed with undelivered notifications」。
  // 我们本来读的就是 getBoundingClientRect()（边框盒），观察边框盒才是同一件事。
  host.resizeObserver.observe(host.stage, { box: "border-box" });
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
  if (!host.skinHost) return;
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
  // 逐字段比较，不用 JSON.stringify：
  // 这个函数在「详情页打开时的每次进度 tick」上被调（见 renderPlayerView），
  // 而为了一次比较把整个对象序列化成字符串，是纯粹的浪费与瞬时垃圾。
  // options 是固定几个原始字段（见 optionsSnapshot），逐项 === 更便宜也更直白。
  // 新增字段时**必须**同时加到这里 —— 否则该字段变化不会被推给皮肤（漏推是静默的）。
  if (
    lastPushed.options &&
    lastPushed.options.showLyrics === options.showLyrics &&
    lastPushed.options.lyricsFontSize === options.lyricsFontSize &&
    lastPushed.options.animations === options.animations &&
    lastPushed.options.coverCarousel === options.coverCarousel &&
    lastPushed.options.coverCarouselInterval === options.coverCarouselInterval &&
    lastPushed.options.interactive === options.interactive &&
    lastPushed.options.performanceMode === options.performanceMode
  ) {
    return;
  }
  lastPushed.options = options;
  push({ type: "options", options });
}

/* ==========================================================================
   宿主壳配色（契约 v3）
   --------------------------------------------------------------------------
   v2 的做法是：插件在 CSS 里声明 --pv-*，宿主把它们**整套投影**到
   播放队列 / 选项 / 定时停止 / 歌词工作台这些浮层上（15 个令牌逐个抄），
   于是宿主壳的颜色完全由插件决定 —— 插件给一套低对比度配色，宿主就只能跟着看不清。

   v3 改成"插件声明、宿主决定"：
     · 插件在 skin.json 里给出 colors.bg / colors.fg（或声明 colors.theme）；
     · 宿主用 player-skins/colors.js 算出一小组 --chrome-*（对比度不足会纠正，
       缺失就回落主题令牌），写在 `<html>` 上；
     · 宿主壳（标题栏 / 底栏 / 浮层）只消费 --chrome-*，不读插件任何变量。
   细节见 skinhost.applyChrome 与 docs/42-播放器样式插件系统设计方案.md 第 5 节。
   ========================================================================== */

/** 让宿主壳用/不用当前插件的配色（详情页开合时由 renderPlayerView 调用） */
export function syncChromeColors() {
  const on = Boolean(state.playerOpen) && Boolean(host.view?.dataset.theme);
  return host.skinHost?.applyChrome(on) ?? false;
}

/* ==========================================================================
   渲染入口（由 ui/playerview.js 在 store 广播与外壳重绘时调用）
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
  const song = currentSong();
  const open = Boolean(state.playerOpen);

  // 注：.app 的 data-view 与 .playerview 的 data-lyrics 现在由 Lit 组件按 state 渲染，
  // 宿主不再碰它们 —— 同一份 DOM 属性只有一个写入方。
  if (!open) {
    if (view.dataset.state !== "closed") {
      view.dataset.state = "closed";
      // 详情页关掉 → 宿主壳回到主题配色（不再跟随插件声明）
      syncChromeColors();
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
    // 详情页真正显示出来了 → 浮层此刻起跟随它的色彩域
    syncChromeColors();
  }

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
    lastPushed.lyricsStatus = lyrics.status || "";
    pushMedia({ type: "lyrics" });
    pushOptions();
    return;
  }

  // 封面变化（封面面板应用/切换、轮播到下一张）
  pushMedia();

  // 歌词变化（手动匹配、在线匹配回来、状态从 matching → failed）
  const lyrics = lyricsSnapshot(song);
  if (lyrics.text !== lastPushed.lyricsText || lyrics.status !== lastPushed.lyricsStatus) {
    lastPushed.lyricsText = lyrics.text;
    lastPushed.lyricsStatus = lyrics.status;
    push({ type: "lyrics", ...mediaSnapshot() });
  }

  pushOptions();
  syncPlaybackState();
}

function resetPushed() {
  lastPushed.songId = null;
  lastPushed.cover = null;
  lastPushed.lyricsText = null;
  lastPushed.lyricsStatus = null;
  lastPushed.options = null;
  lastPushed.playing = null;
}

/* --------------------------------------------------------------------------
   播放状态同步（进度 → 皮肤）
   -------------------------------------------------------------------------- */

/**
 * 把当前播放状态（进度 / 歌名 / 歌词行号）推给已挂载的皮肤。
 *
 * @param {{force?: boolean, lyricIndex?: number}} [opts]
 *   force —— 即使播放状态没变也推一次 state 补丁；
 *   lyricIndex —— 调用方已经算好的歌词行号。省略时本函数自己算（二分查找）。
 * @returns {void}
 */
export function syncPlaybackState({ force = false, lyricIndex } = {}) {
  if (!state.playerOpen || !host.skin) return;
  const playback = playbackSnapshot();
  if (lastPushed.playing !== playback.playing || force) {
    lastPushed.playing = playback.playing;
    push({ type: "state", ...playback });
  }
  // 只需要 lyricIndex 一个整数，就不要为了它建一份完整的歌词快照
  // （lyricsSnapshot 会跑 linesForSong + findLyricIndex 并分配 6 个字段的对象，
  //   而这条路径在播放期间每 250ms 走一次）。调用方若已经算过就直接传进来。
  const idx = typeof lyricIndex === "number" ? lyricIndex : lyricIndexOf(currentSong());
  push({ type: "progress", ...playback, lyricIndex: idx });
  // 频谱不再随这条路径推送（契约 v3 拉取式）：插件自己在帧循环里调
  // ctx.spectrum()，读到才采样 —— 见 spectrum.js 的读门控说明。
}

/* --------------------------------------------------------------------------
   频谱：插件拉取（ctx.spectrum()），宿主不再推送 spectrum 补丁
   --------------------------------------------------------------------------
   这里曾经是「宿主 30Hz 采样 → push spectrum 补丁」的整套循环（含段数参数化、
   停止帧、Array.from 序列化）。契约改为纯拉取后：

     · 采样/缓存/节流全在 spectrum.js（读门控：插件不读就一次都不采）；
     · 段数固定 128（全谱），插件自己切粒度；
     · 主窗口的 provider 接在 ensureSkinHost 的 source.spectrum 上。
   -------------------------------------------------------------------------- */

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

/**
 * 当前可用的样式清单（设置界面展示用）。
 *
 * 只暴露「展示需要」的字段：皮肤对象里可能挂着内部状态/函数，
 * 直接交出去会让设置界面或者其它调用方有机会改到它。
 *
 * v3 新增三组字段，都是给样式卡片做"体检"用的：
 *   · `iconUrl`       —— 插件自带图标（清单 icon.file）
 *   · `colorsMissing` —— 清单里缺失/写错的配色键 → 卡片上打警告图标
 *   · `chrome`        —— 宿主算好的壳层配色（色块预览 + 对比度自检结论）
 */
export function availableSkins() {
  return listSkins().map((s) => ({
    id: s.id,
    name: s.name,
    icon: s.icon || "disc",
    iconUrl: s.iconUrl || "",
    // 内置的来自只读资源目录（随包分发），运行时加载的来自数据目录
    builtin: s.builtin === true,
    source: s.source || "",
    version: s.version || "",
    author: s.author || "",
    description: s.description || "",
    colorsMissing: Array.isArray(s.colorsMissing) ? s.colorsMissing.slice() : [],
    chrome: s.chrome || null,
    background: s.background === true,
    spectrum: s.spectrum || false,
  }));
}
