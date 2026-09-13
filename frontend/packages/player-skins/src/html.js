// @ts-check
/* ==========================================================================
   html.js — 皮肤用的小工具（转义 + 封面图兜底）
   --------------------------------------------------------------------------
   包不能 import 宿主的 utils.js（否则「单独一个包」就名不副实了），
   所以这里自带一份最小实现。第三方皮肤也可以直接用（从包入口导出）。
   ========================================================================== */

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

/** 曲目副标题：歌手 · 专辑（专辑为空时不留下多余的分隔点） */
export function subtitleOf(artist, album) {
  const a = String(artist ?? "").trim();
  const b = String(album ?? "").trim();
  if (a && b) return `${a} · ${b}`;
  return a || b || "—";
}
