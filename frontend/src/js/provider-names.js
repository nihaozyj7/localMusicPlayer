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
  // ★ lrclib 曾经漏在这张表里。providerName() 对未知 id 是「原样返回」，
  // 于是「在线歌词来源」这一行直接显示了内部标识：
  //     在线歌词来源：lrclib / 网易云音乐 / QQ 音乐
  // 这正是本文件存在的理由（见文件头注释）被打破的样子 ——
  // 而它没有任何测试守着，只靠人肉比对。现在两份清单由
  // frontend/tests/provider-names.test.js 对着 Go 源码逐一核对。
  lrclib: "LRCLIB",
  // kugou / kuwo / migu 目前 Go 侧没有对应的 provider（保留给后续接入），
  // 因此不在下面的分组清单里 —— 测试只要求「在用的 id 都有显示名」，
  // 反向（表里有暂时用不到的条目）是允许的。
  kugou: "酷狗音乐",
  kuwo: "酷我音乐",
  migu: "咪咕音乐",
};

/**
 * 封面来源 id（后端 internal/coverfetch 在用的那些）。
 *
 * 为什么要显式列出来：界面上有好几处「后端还没给出列表时」的兜底文案，
 * 各自的硬编码清单已经漂移过（cover.js 里那一份就没跟上）。
 * 这里作为唯一来源，并由测试对着 Go 源码核对。
 */
export const COVER_PROVIDERS = ["itunes", "netease", "qq", "deezer", "musicbrainz"];

/** 歌词来源 id（后端 internal/lyricsfetch 在用的那些）。 */
export const LYRICS_PROVIDERS = ["lrclib", "netease", "qq"];

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

/**
 * 「后端还没给出来源列表」时的封面来源兜底文案。
 *
 * 以前这串字面量硬写在 ui/cover.js 里，是同一份枚举的第 4 份拷贝：
 * 后端加了来源（或改了显示名）它不会跟着变。现在从 COVER_PROVIDERS 派生。
 */
export function providerFallbackLabel() {
  return providerListLabel(COVER_PROVIDERS);
}
