// @ts-check
/* ==========================================================================
   html.js — 皮肤用的小工具（转义 + 封面图兜底）
   --------------------------------------------------------------------------
   包不能 import 宿主的 utils.js（否则「单独一个包」就名不副实了），
   所以这里自带一份最小实现。第三方皮肤也可以直接用（从包入口导出）。
   ========================================================================== */

/**
 * 「没有曲目」时用的空曲目视图。
 *
 * 皮肤拿到的 song 是宿主裁好的 SkinTrack（见 contract.js）或 null，
 * 直接用 `m.song || {}` 会得到一个空对象、字段全是 undefined，
 * 类型上也拿不到字段。用这个常量兜底，字段齐全、类型也对。
 *
 * @type {import("./contract.js").SkinTrack}
 */
export const EMPTY_TRACK = Object.freeze({
  id: "",
  title: "",
  artist: "",
  album: "",
  duration: 0,
  kind: "local",
});

/**
 * HTML 转义。曲目名/歌手名来自文件标签，属于用户数据，拼进模板必须转义。
 * @param {unknown} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]
  );
}

/**
 * 给 <img> 设置封面地址，并在加载失败时退回默认封面。
 *
 * 为什么必须兜底：在线试听的封面是后端代理地址，代理失败时浏览器会画出
 * 那个破碎的小图标（很显眼）。退回一张内联 SVG 至少是「安静的默认封面」。
 *
 * @param {HTMLImageElement|null} img
 * @param {string} src
 * @param {string} fallback 默认封面（ctx.defaultCover）
 */
export function setCoverImage(img, src, fallback) {
  if (!img) return;
  const next = src || fallback;
  if (next && img.getAttribute("src") !== next) {
    img.dataset.failed = "";
    img.src = next;
  }
  img.onerror = () => {
    if (img.dataset.failed === "1") return;
    img.dataset.failed = "1";
    if (fallback) img.src = fallback;
  };
}

/**
 * 歌词区空态文案。
 *
 * 以前每个内置样式各自写了一份 `if (source === 'online') return '在线匹配没有结果'`，
 * 结果是「是不是在匹配中」这件事在样式里无法表达：宿主正在联网匹配时，
 * 屏幕上显示的仍然是「暂无歌词」——用户以为这首没歌词，其实只是还没回来。
 *
 * 现在宿主在 lyrics 快照里带上 `status` / `statusText`：
 *   · status = "loading"  → 「歌词匹配中…」（本地读取 + 在线匹配期间）
 *   · status = "failed"   → 「歌词匹配失败」
 *   · status = "none"     → 「暂无歌词」（真的没有，或在线匹配被关掉）
 *   · status = "ok"       → 有歌词，不会走到这里
 * 样式只需要拿 statusText 显示；宿主没给（第三方老宿主 / 桌面背景窗口的旧快照）
 * 时退回这套默认映射，保证任何情况下都不会出现空白。
 *
 * @param {{status?: string, source?: string, statusText?: string}|null|undefined} lyrics
 * @returns {string}
 */
export function lyricsEmptyText(lyrics) {
  const custom = typeof lyrics?.statusText === "string" ? lyrics.statusText.trim() : "";
  if (custom) return custom;
  switch (lyrics?.status) {
    case "loading":
    case "matching":
      return "歌词匹配中…";
    case "failed":
      return "歌词匹配失败";
    case "none":
      return "暂无歌词";
    default:
      break;
  }
  // 没有 status 的老路径：保留原来的判断（在线匹配过但结果为空）
  if (lyrics?.source === "online") return "在线匹配失败";
  return "暂无歌词";
}

/** 曲目副标题：歌手 · 专辑（专辑为空时不留下多余的分隔点） */
export function subtitleOf(artist, album) {
  const a = String(artist ?? "").trim();
  const b = String(album ?? "").trim();
  if (a && b) return `${a} · ${b}`;
  return a || b || "—";
}
