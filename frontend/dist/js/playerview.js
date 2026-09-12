/* ==========================================================================
   playerview.js — 播放界面（经典 / 沉浸 / 简约）
   ========================================================================== */

import { $, icon } from "./dom.js";
import { MOCK_LYRICS, MOCK_LYRICS_ALT } from "./mock.js";
import { backend, emit, isWails } from "./bridge.js";
import { commit, currentSong, seek, state } from "./store.js";
import { esc, findLyricIndex, parseLrc } from "./utils.js";

export const PV_MODES = ["classic", "immersive", "minimal"];
export const PV_LABELS = { classic: "经典", immersive: "沉浸", minimal: "简约" };

let lyricsCache = new Map(); // songId -> { lines, text }
let lastRendered = { id: null, mode: null };
let activeLyricIndex = -1;

/* --------------------------------------------------------------------------
   歌词装载
   -------------------------------------------------------------------------- */
async function getLyrics(song) {
  if (!song) return { lines: [], text: "", source: "none" };
  if (lyricsCache.has(song.id)) return lyricsCache.get(song.id);

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
  const song = currentSong();

  view.hidden = !state.playerOpen;
  // 骨架上的 data-view 驱动侧边栏收起与播放界面铺满
  const appEl = document.getElementById("app");
  if (appEl) appEl.dataset.view = state.playerOpen ? "player" : "library";
  if (!state.playerOpen) return;

  const mode = state.pvMode;
  view.dataset.mode = mode;
  $("#playerview-crumb").textContent = song ? `${song.title} · ${song.artist}` : "未在播放";

  document.querySelectorAll("#playerview-mode .viewmode__btn").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.pvMode === mode));
  });

  const needRebuild = lastRendered.id !== song?.id || lastRendered.mode !== mode;
  if (needRebuild) {
    lastRendered = { id: song?.id ?? null, mode };
    stage.innerHTML = stageHtml(mode, song);
    activeLyricIndex = -1;
    // 重新装载歌词并填充
    const { lines } = await getLyrics(song);
    const scroll = stage.querySelector(".lyrics__scroll");
    if (scroll) {
      if (lines.length) {
        scroll.innerHTML = lines
          .map(
            (l, i) =>
              `<button class="lyric" type="button" data-time="${l.time}" data-lyric-index="${i}">${esc(l.text)}</button>`
          )
          .join("");
      } else {
        scroll.innerHTML = emptyLyricsHtml();
      }
    }
    bindStage(stage);
  }

  syncPlaybackState();
}

function stageHtml(mode, song) {
  const title = esc(song?.title || "未在播放");
  const artist = esc(song?.artist || "—");
  const album = esc(song?.album || "");
  const cover = song?.cover || "";

  if (mode === "immersive") {
    return `
      <div class="immersive__bg" aria-hidden="true">${cover ? `<img src="${cover}" alt="" />` : ""}</div>
      <div class="immersive__veil" aria-hidden="true"></div>
      <div class="immersive__grain" aria-hidden="true"></div>
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
          ${cover ? `<img src="${cover}" alt="${title} 封面" />` : `<div class="cover-placeholder"></div>`}
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
      <button class="btn btn--sm" type="button" data-act="open-folder">${icon("folder")}<span>打开所在文件夹</span></button>
    </div>`;
}

function bindStage(stage) {
  stage.addEventListener("click", (e) => {
    const lyric = e.target.closest(".lyric");
    if (lyric) {
      seek(Number(lyric.dataset.time));
      return;
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "open-folder") {
      const song = currentSong();
      if (song) backend.revealInExplorer(song.path);
    }
  });
}

/* --------------------------------------------------------------------------
   播放状态同步（进度 → 歌词高亮 / 唱片旋转）
   -------------------------------------------------------------------------- */
export function syncPlaybackState() {
  if (!state.playerOpen) return;
  const disc = document.getElementById("pv-disc");
  if (disc) disc.dataset.spinning = state.playing ? "true" : "false";

  const scroll = document.querySelector("#pv-lyrics .lyrics__scroll");
  if (!scroll || !scroll.querySelector(".lyric")) return;

  const song = currentSong();
  const cached = song ? lyricsCache.get(song.id) : null;
  const lines = cached?.lines || [];
  const idx = findLyricIndex(lines, state.position);
  if (idx === activeLyricIndex) return;
  activeLyricIndex = idx;

  scroll.querySelectorAll(".lyric").forEach((node, i) => {
    const active = i === idx;
    node.setAttribute("aria-current", String(active));
    node.dataset.past = String(i < idx);
  });

  const target = scroll.querySelector(`.lyric[data-lyric-index="${idx}"]`);
  if (target) {
    const top = target.offsetTop - scroll.clientHeight / 2 + target.offsetHeight / 2;
    scroll.scrollTo({ top, behavior: "smooth" });
  }
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
