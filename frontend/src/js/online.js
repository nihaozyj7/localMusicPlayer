/* ==========================================================================
   online.js — 在线歌词手动匹配面板
   --------------------------------------------------------------------------
   历史说明：这个文件以前还负责「在线歌曲搜索」面板。搜索改成标题栏
   搜索框 + 结果弹层之后（见 searchpanel.js），歌曲搜索的部分已经整体移走，
   这里只保留「手动匹配歌词」这块与歌曲搜索无关的功能。
   ========================================================================== */

import { songById, state } from "./store.js";
import { toast } from "./dom.js";

let bindings = null;

/** 与 bridge.js 同理：绑定是按 URL 在运行时解析的，不能让打包器按文件路径解析 */
const BINDINGS_ENTRY = "../bindings/musicplayer/index.js";

async function getBindings() {
  if (bindings) return bindings;
  try {
    const mod = await import(/* @vite-ignore */ BINDINGS_ENTRY);
    bindings = mod && mod.OnlineService ? mod.OnlineService : null;
  } catch (err) {
    console.info("[online] backend unavailable", err);
  }
  return bindings;
}

function style(el, css) {
  el.style.cssText = css;
}

function fmt(ms) {
  if (!ms || ms < 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return m + ":" + s;
}

/* --------------------------------------------------------------------------
   手动匹配歌词
   --------------------------------------------------------------------------
   按钮本身写在 index.html 里（`#btn-lyrics-match`，夹在「播放模式」与「桌面歌词」
   之间）。以前它是运行时 inject 进来的：那样一旦 online.js 没被任何模块 import，
   按钮就会**静默消失**，而且从 HTML 里完全看不出少了什么（就是踩过的这个坑）。
   现在改为静态按钮 + 这里只做绑定，并在 main.js 里显式 import 本模块。
   -------------------------------------------------------------------------- */
let lyricsPanel = null;
let lyricsInput = null;
let lyricsResults = null;
let lyricsHint = null;

function bindLyricsButton() {
  const btn = document.getElementById("btn-lyrics-match");
  if (!btn) return;
  btn.addEventListener("click", openLyricsPanel);
}

bindLyricsButton();

function openLyricsPanel() {
  if (!lyricsPanel) makeLyricsPanel();
  lyricsPanel.style.display = "flex";
  const song = currentTarget();
  if (song) {
    lyricsInput.value = [song.title, song.artist].filter(Boolean).join(" ");
  }
  lyricsInput.focus();
}

/**
 * 当前要匹配歌词的曲目。
 *
 * 用 songById 而不是只查 state.songs：在线试听曲目不在本地曲库里
 * （它们登记在 state.onlineSongs 里）。早期版本只查 songs，于是「在线试听时
 * 点手动匹配歌词」会一路走到「请先播放一首歌曲」—— 明明正在播，提示却是错的。
 */
function currentTarget() {
  return songById(state.currentId) || null;
}

function makeLyricsPanel() {
  lyricsPanel = document.createElement("section");
  style(
    lyricsPanel,
    "position:fixed;top:52px;right:18px;bottom:90px;width:min(520px,calc(100vw - 36px));z-index:85;display:none;flex-direction:column;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(18,18,20,.96);box-shadow:0 24px 60px rgba(0,0,0,.45);overflow:hidden;color:#fff;"
  );
  const head = document.createElement("div");
  style(head, "display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.1);");
  const title = document.createElement("b");
  title.textContent = "手动匹配歌词";
  const hint = document.createElement("span");
  // 来源名由后端给出（不写死）：加/换歌词来源时这里自动跟着变
  hint.textContent = "在线歌词来源";
  hint.style.cssText = "color:#888;font-size:12px;";
  lyricsHint = hint;
  const spacer = document.createElement("span");
  spacer.style.flex = "1";
  const close = document.createElement("button");
  close.textContent = "×";
  close.style.cssText = "border:0;background:transparent;color:inherit;font-size:18px;cursor:pointer;";
  close.addEventListener("click", () => {
    lyricsPanel.style.display = "none";
  });
  head.append(title, hint, spacer, close);

  const searchRow = document.createElement("div");
  style(searchRow, "display:flex;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.1);");
  lyricsInput = document.createElement("input");
  lyricsInput.placeholder = "输入歌词搜索关键词";
  style(
    lyricsInput,
    "flex:1;min-width:0;height:34px;padding:0 12px;color:inherit;border:1px solid rgba(255,255,255,.16);border-radius:6px;background:rgba(255,255,255,.06);outline:none;"
  );
  const submit = document.createElement("button");
  submit.textContent = "搜索";
  style(submit, "height:34px;padding:0 14px;border:0;border-radius:6px;background:#fff;color:#111;cursor:pointer;");
  submit.addEventListener("click", searchLyrics);
  lyricsInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchLyrics();
  });
  searchRow.append(lyricsInput, submit);

  lyricsResults = document.createElement("div");
  style(lyricsResults, "flex:1;overflow:auto;padding:8px;color:#ddd;");
  lyricsResults.textContent = "搜索结果会显示在这里，点击使用按钮应用歌词";

  lyricsPanel.append(head, searchRow, lyricsResults);
  document.body.appendChild(lyricsPanel);
}

async function searchLyrics() {
  const song = currentTarget();
  const keyword = lyricsInput.value.trim();
  if (!keyword) {
    toast("请输入歌词搜索关键词", { duration: 1500 });
    return;
  }
  const service = await getBindings();
  if (!service) {
    toast("在线歌词后端未就绪", { tone: "error" });
    return;
  }
  refreshLyricsHint(service);
  lyricsResults.textContent = "搜索中…";
  try {
    // keyword 是用户在输入框里写/改的搜索词；title/artist 是这首歌的元数据，
    // 一起传过去是为了让后端**按它们给候选打分排序** —— 只给关键词时所有候选
    // 都是同一个基础分，翻唱版会跑到原唱前面（这就是「搜到的一堆但都不是想要的」）。
    const list = await service.SearchLyrics(
      keyword,
      song ? song.title : "",
      song ? song.artist : "",
      song ? song.duration : 0
    );
    renderLyricCandidates(Array.isArray(list) ? list : []);
  } catch (err) {
    lyricsResults.textContent = "搜索失败：" + (err.message || err);
  }
}

/** 来源名由后端提供（LRCLIB / 网易云 / QQ 音乐…），拿不到就保持通用文案 */
async function refreshLyricsHint(service) {
  if (!lyricsHint) return;
  try {
    const res = await service.LyricsProviders?.();
    const list = Array.isArray(res?.providers) ? res.providers : [];
    if (list.length) lyricsHint.textContent = list.join(" / ");
  } catch {
    /* 拿不到来源列表不影响搜索 */
  }
}

function renderLyricCandidates(list) {
  lyricsResults.textContent = "";
  if (!list.length) {
    lyricsResults.textContent = "没有找到候选歌词";
    return;
  }
  list.forEach((c) => {
    const row = document.createElement("div");
    style(row, "display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:8px;border-radius:6px;");
    const meta = document.createElement("div");
    meta.style.minWidth = "0";
    const title = document.createElement("div");
    title.textContent = (c.title || "未命名") + " - " + (c.artist || "未知");
    title.style.cssText = "font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    const sub = document.createElement("div");
    sub.textContent = (c.provider || "") + " · score " + (c.score || 0) + " · " + fmt(c.duration);
    sub.style.cssText = "color:#888;font-size:11px;margin-top:3px;";
    meta.append(title, sub);
    const use = document.createElement("button");
    use.textContent = "使用";
    style(use, "height:28px;padding:0 10px;border:0;border-radius:6px;background:#fff;color:#111;cursor:pointer;");
    use.addEventListener("click", () => applyLyricCandidate(c));
    row.append(meta, use);
    lyricsResults.appendChild(row);
  });
}

async function applyLyricCandidate(candidate) {
  const song = currentTarget();
  if (!song) {
    toast("请先播放一首歌曲", { tone: "warning" });
    return;
  }
  const service = await getBindings();
  if (!service) {
    toast("在线歌词后端未就绪", { tone: "error" });
    return;
  }
  try {
    const res = await service.FetchLyrics(candidate.provider, candidate.id);
    if (!res || !res.lrc) {
      toast("没有取到歌词", { tone: "warning" });
      return;
    }
    // applyOnlineLyrics 内部会把歌词写进后端缓存（并按设置决定是否嵌入文件），
    // 所以「第二次打开又没有了」不会再发生。
    const mod = await import("./playerhost.js");
    if (mod && mod.applyOnlineLyrics) {
      mod.applyOnlineLyrics(song.id, res.lrc, res.source || "online");
    }
    lyricsPanel.style.display = "none";
    toast("歌词已应用并保存", { tone: "success", duration: 1500 });
  } catch (err) {
    toast("获取歌词失败：" + (err.message || err), { tone: "error" });
  }
}
