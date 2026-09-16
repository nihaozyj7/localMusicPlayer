/* ==========================================================================
   provider-names.js — 第三方来源 id → 用户可读名
   --------------------------------------------------------------------------
   后端返回的是稳定的英文 id（封面来源见 internal/coverfetch，歌词来源见
   internal/lyrics）。这些 id 是给程序对接口用的，不应该直接出现在界面上，
   否则用户看到的是 "netease / musicbrainz" 这类内部标识。
   ========================================================================== */

const PROVIDER_NAMES = {
  itunes: "iTunes",
  netease: "网易云音乐",
  qq: "QQ 音乐",
  deezer: "Deezer",
  musicbrainz: "MusicBrainz",
  kugou: "酷狗音乐",
  kuwo: "酷我音乐",
  migu: "咪咕音乐",
};

/** 单个来源 id → 显示名；不认识的原样返回，至少不会显示空白 */
export function providerName(id) {
  const key = String(id || "")
    .trim()
    .toLowerCase();
  return PROVIDER_NAMES[key] || String(id || "");
}

/** 来源 id 列表 → 「A / B」；列表为空时返回 fallback */
export function providerListLabel(ids, fallback = "") {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!list.length) return fallback;
  return list.map((id) => providerName(id)).join(" / ");
}
