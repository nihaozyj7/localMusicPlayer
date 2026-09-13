/* ==========================================================================
   playerview.js — 播放界面（经典 / 沉浸 / 简约）
   --------------------------------------------------------------------------
   进出动效：从下方滑入 / 向下方滑出（不再用淡入，避免侧边栏"闪一下"）。
   打开方式：点击底栏封面或曲目名（同一个按钮，进/出详情页互相切换）。
   ========================================================================== */

import { $, bindCoverFallback } from "./dom.js";
import { MOCK_LYRICS, MOCK_LYRICS_ALT } from "./mock.js";
import { backend, emit, isWails } from "./bridge.js";
import { seekTo } from "./audio.js";
import { commit, currentSong, state } from "./store.js";
import { coverOf, esc, findLyricIndex, parseLrc } from "./utils.js";

export const PV_MODES = ["classic", "immersive", "minimal"];
export const PV_LABELS = { classic: "经典", immersive: "沉浸", minimal: "简约" };

/** 与 playerview.css 里的 --pv-slide-dur 保持一致 */
const OPEN_CLOSE_MS = 260;

let lyricsCache = new Map(); // songId -> { lines, text }
let lastRendered = { id: null, mode: null };
let activeLyricIndex = -1;
let closeTimer = null;

/* --------------------------------------------------------------------------
   歌词装载
   -------------------------------------------------------------------------- */
async function getLyrics(song) {
  if (!song) return { lines: [], text: "", source: "none" };
  if (lyricsCache.has(song.id)) return lyricsCache.get(song.id);

  // 在线试听曲目不在本地曲库里，后端 Lyrics.Load 会直接报「歌曲不存在」。
  // 这类曲目走在线歌词接口，失败就安静地当成「暂无歌词」——
  // 早期版本在这里会弹一句「歌曲不存在: bili:xxxx」，既不准确也很吵。
  if (song.online) {
    const payload = { lines: [], text: "", source: "none" };
    lyricsCache.set(song.id, payload);
    return payload;
  }

  let text = "";
  let source = "none";

  if (isWails()) {
    // 后端会按「.lrc 文件 → 内嵌歌词 → 在线」的优先级返回
    const res = await backend.loadLyrics(song.id);
    if (res && typeof res === "object" && typeof res.lrc === "string") {
      text = res.lrc;
      source = res.source || "backend";
    } else if (typeof res === "string") {
      text = res;
      source = "backend";
    }
  }

  if (!text) {
    if (isWails()) {
      // 后端可用但没有歌词文件：不要编造假歌词，直接显示空态
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

function buildFallbackLyrics(song) {
  const out = [];
  for (let t = 12; t < Math.max(60, Math.floor((song.duration || 180000) / 1000) - 10); t += 9) {
    out.push(`[00:${String(t).padStart(2, "0")}.00]（${song.title} · 暂无歌词文件，接入后端后可读取 .lrc 或内嵌歌词）`);
  }
  return out.join("\n");
}

export function invalidateLyrics(songId) {
  if (songId) lyricsCache.delete(songId);
  else lyricsCache = new Map();
  lastRendered.id = null;
}

/* --------------------------------------------------------------------------
   渲染
   -------------------------------------------------------------------------- */
export async function renderPlayerView() {
  const view = $("#playerview");
  const stage = $("#playerview-stage");
  const appEl = document.getElementById("app");
  const song = currentSong();
  const open = Boolean(state.playerOpen);

  if (appEl) {
    // data-view 驱动侧边栏收起与播放界面铺满；data-mode 供沉浸模式的整体样式用
    appEl.dataset.view = open ? "player" : "library";
    appEl.dataset.mode = state.pvMode;
  }
  // 「桌面歌词」开关：关掉时歌词区收起，详情页只留封面/曲目信息
  view.dataset.lyrics = state.config.showLyrics === false ? "off" : "on";

  if (!open) {
    // 关闭：先播放滑出动画，动画结束再真正隐藏
    const bg = $("#immersive-bg");
    if (bg) bg.hidden = true;
    if (view.dataset.state !== "closed") {
      view.dataset.state = "closed";
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        closeTimer = null;
        if (!state.playerOpen) {
          view.hidden = true;
          lastRendered = { id: null, mode: null };
          activeLyricIndex = -1;
        }
      }, OPEN_CLOSE_MS + 20);
    }
    return;
  }

  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  // 先解除 hidden 再标 opened，让 transition 真正发生（同一帧内切换不触发过渡）
  view.hidden = false;
  if (view.dataset.state !== "opened") {
    view.dataset.state = "opened";
  }

  const mode = state.pvMode;
  view.dataset.mode = mode;

  document.querySelectorAll("#playerview-mode .viewmode__btn").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.pvMode === mode));
  });
  // 在线试听曲目没有本地文件，封面按钮对它们没有意义
  const coverBtn = $("#btn-player-cover");
  if (coverBtn) coverBtn.hidden = !song || Boolean(song.online);

  syncImmersiveBg(mode, song);

  const needRebuild = lastRendered.id !== song?.id || lastRendered.mode !== mode;
  if (!needRebuild) {
    syncPlaybackState();
    return;
  }
  // 换歌 / 换样式：重建舞台，重建期间先别让旧的高亮状态残留
  lastRendered = { id: song?.id ?? null, mode };
  activeLyricIndex = -1;
  stage.innerHTML = stageHtml(mode, song);
  bindStage(stage);
  stage.querySelectorAll("img").forEach(bindCoverFallback);

  // 歌词是异步装载的（后端读 .lrc / 内嵌歌词），装完再填充
  const { lines } = await getLyrics(song);
  // 等待期间可能又换歌了，避免把旧歌词写进新舞台
  if (lastRendered.id !== (song?.id ?? null) || lastRendered.mode !== mode) return;

  const scroll = stage.querySelector(".lyrics__scroll");
  if (scroll) {
    if (lines.length) {
      scroll.innerHTML = lines
        .map(
          (l, i) =>
            `<div class="lyric" role="button" tabindex="0" data-time="${l.time}" data-lyric-index="${i}">${esc(l.text)}</div>`
        )
        .join("");
    } else {
      scroll.innerHTML = emptyLyricsHtml();
    }
    scroll.scrollTop = 0;
  }

  // 立即定位到当前行（不等下一次 tick），否则刚打开时歌词停在最上面
  syncPlaybackState({ force: true });
}

function stageHtml(mode, song) {
  const title = esc(song?.title || "未在播放");
  const artist = esc(song?.artist || "—");
  const album = esc(song?.album || "");
  const cover = esc(coverOf(song));

  if (mode === "immersive") {
    return `
      <div class="immersive__card">
        <div class="immersive__info">
          <div class="immersive__title">${title}</div>
          <div class="immersive__artist">${artist}${album ? ` · ${album}` : ""}</div>
        </div>
        <div class="lyrics" id="pv-lyrics">
          <div class="lyrics__scroll"></div>
        </div>
      </div>`;
  }

  if (mode === "minimal") {
    return `
      <div class="minimal__inner">
        <div class="minimal__info">
          <div class="minimal__title">${title}</div>
          <div class="minimal__artist">${artist}</div>
        </div>
        <div class="lyrics" id="pv-lyrics">
          <div class="lyrics__scroll"></div>
        </div>
      </div>`;
  }

  // classic
  return `
    <div class="disc" id="pv-disc" data-spinning="${state.playing ? "true" : "false"}">
      <div class="disc__shadow"></div>
      <div class="disc__platter">
        <div class="disc__label">
          <img src="${cover}" alt="${title} 封面" />
        </div>
        <div class="disc__hole"></div>
      </div>
      <div class="disc__arm"></div>
    </div>
    <div class="classic__side">
      <div class="classic__info">
        <div class="classic__title">${title}</div>
        <div class="classic__artist">${artist}</div>
        ${album ? `<div class="classic__album">${album}</div>` : ""}
      </div>
      <div class="lyrics" id="pv-lyrics">
        <div class="lyrics__scroll"></div>
      </div>
    </div>`;
}

function emptyLyricsHtml() {
  return `
    <div class="lyrics__empty">
      <svg class="lyrics__empty-icon" aria-hidden="true"><use href="#i-lyrics"/></svg>
      <div class="lyrics__empty-text">暂无歌词</div>
      <button class="btn btn--sm" type="button" data-act="open-folder"><span>打开所在文件夹</span></button>
    </div>`;
}

/**
 * 沉浸模式的整窗背景（位于 .app 下、所有内容之下）。
 * 只有「沉浸模式 + 播放界面打开」时才显示，其余时候 hidden，
 * 这样不会给其他界面平白多渲染一张模糊大图。
 */
function syncImmersiveBg(mode, song) {
  const bg = $("#immersive-bg");
  if (!bg) return;
  const show = mode === "immersive" && Boolean(state.playerOpen) && Boolean(song);
  bg.hidden = !show;
  if (!show) return;
  const img = $("#immersive-bg-img");
  const src = coverOf(song);
  if (img && img.getAttribute("src") !== src) {
    img.src = src;
    img.alt = `${song.title} 背景`;
    bindCoverFallback(img);
  }
}
/* --------------------------------------------------------------------------
   歌词区交互
   --------------------------------------------------------------------------
   两件事必须同时成立：
     1) 播放时自动把当前行滚到中间；
     2) 用户可以用滚轮 / 拖动滚动条自己翻歌词。
   因此自动滚动在「用户正在滚动」时让位，停手一秒后再自动接管。
   -------------------------------------------------------------------------- */
const USER_SCROLL_PAUSE_MS = 1200;
let userScrollingUntil = 0;
let resumeTimer = null;

function watchUserScroll(scroll) {
  if (scroll.dataset.userScrollBound === "1") return;
  scroll.dataset.userScrollBound = "1";

  const mark = () => {
    userScrollingUntil = Date.now() + USER_SCROLL_PAUSE_MS;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      // 松手后自动回到当前行
      activeLyricIndex = -2; // 强制重算定位
      syncPlaybackState({ force: true });
    }, USER_SCROLL_PAUSE_MS + 40);
  };

  scroll.addEventListener("wheel", mark, { passive: true });
  scroll.addEventListener("touchmove", mark, { passive: true });
  scroll.addEventListener("pointerdown", mark, { passive: true });
}

function bindStage(stage) {
  if (stage.dataset.bound === "1") return;
  stage.dataset.bound = "1";

  const scroll = stage.querySelector(".lyrics__scroll");
  if (scroll) watchUserScroll(scroll);

  stage.addEventListener("click", (e) => {
    const lyric = e.target.closest(".lyric");
    if (lyric) {
      const t = Number(lyric.dataset.time);
      if (Number.isFinite(t)) {
        // seekTo：同时改状态与真实音频位置，只改状态的话进度条会闪一下又弹回来
        seekTo(t);
        syncPlaybackState({ force: true });
      }
      return;
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "open-folder") {
      const song = currentSong();
      if (song) backend.revealInExplorer(song.path);
    }
  });

  // 键盘可达：歌词行是 role="button" 的可聚焦元素
  stage.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const lyric = e.target.closest?.(".lyric");
    if (!lyric) return;
    e.preventDefault();
    const t = Number(lyric.dataset.time);
    if (Number.isFinite(t)) {
      seekTo(t);
      syncPlaybackState({ force: true });
    }
  });
}

/* --------------------------------------------------------------------------
   播放状态同步（进度 → 歌词高亮 / 唱片旋转）
   -------------------------------------------------------------------------- */
export function syncPlaybackState({ force = false } = {}) {
  if (!state.playerOpen) return;
  const disc = document.getElementById("pv-disc");
  if (disc) disc.dataset.spinning = state.playing ? "true" : "false";

  const scroll = document.querySelector("#pv-lyrics .lyrics__scroll");
  if (!scroll || !scroll.querySelector(".lyric")) return;

  const song = currentSong();
  const cached = song ? lyricsCache.get(song.id) : null;
  const lines = cached?.lines || [];
  const idx = findLyricIndex(lines, state.position);
  if (idx === activeLyricIndex && !force) return;
  activeLyricIndex = idx;

  scroll.querySelectorAll(".lyric").forEach((node, i) => {
    const active = i === idx;
    node.setAttribute("aria-current", String(active));
    node.dataset.past = String(idx >= 0 && i < idx);
  });

  // 用户正在手动滚动时先不抢滚动位置
  if (Date.now() < userScrollingUntil) return;
  // 首次定位（刚打开 / 刚换歌）直接跳过去，不要做平滑动画
  scrollToActiveLine(scroll, idx, { immediate: force });
}

/** 把当前歌词行滚到容器垂直中央 */
function scrollToActiveLine(scroll, idx, { immediate = false } = {}) {
  if (idx < 0) {
    scroll.scrollTo({ top: 0, behavior: immediate ? "auto" : "smooth" });
    return;
  }
  const target = scroll.querySelector(`.lyric[data-lyric-index="${idx}"]`);
  if (!target) return;
  // 用相对容器的偏移计算，避免受页面滚动 / 定位上下文影响
  const top = target.offsetTop - (scroll.clientHeight - target.offsetHeight) / 2;
  const max = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
  const clamped = Math.max(0, Math.min(top, max));
  // 已经在目标位置附近就不动，避免每帧都触发平滑滚动而看起来"卡住"
  if (Math.abs(scroll.scrollTop - clamped) < 4) return;
  scroll.scrollTo({ top: clamped, behavior: immediate ? "auto" : "smooth" });
}

/* --------------------------------------------------------------------------
   对外动作
   -------------------------------------------------------------------------- */
export function setPlayerViewMode(mode) {
  if (!PV_MODES.includes(mode)) return;
  state.pvMode = mode;
  state.config.playerViewMode = mode;
  commit();
  emit("player:viewmode", { mode });
}

export function openPlayer() {
  state.playerOpen = true;
  state.pvMode = state.config.playerViewMode || "classic";
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

export function applyOnlineLyrics(songId, text, source = "online") {
    if (!songId || !text) return false;
    const payload = { lines: parseLrc(text), text, source };
    lyricsCache.set(songId, payload);
    lastRendered = { id: null, mode: null };
    try {
        renderPlayerView();
    } catch (err) {
        console.warn("[lyrics] refresh failed", err);
    }
    return true;
}

