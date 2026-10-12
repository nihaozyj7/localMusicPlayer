/* ==========================================================================
   ui/lyric-size.js — 歌词字号的取值范围
   --------------------------------------------------------------------------
   两个地方要调歌词字号：播放选项面板（底栏「选项」）与设置界面。
   量程必须**完全一致** —— 只有一处能拖到 72px、另一处拖到 26px 的话，
   用户会把「设置里拖到头了怎么还能更大」当成故障。

   为什么是 14~72：
     · 14 是「小屏也能多显示几行」的下限，再小就低于正文可读尺寸；
     · 72 是「桌面歌词那种远距离观看」的上限。原来是 12~26，
       26px 在 2K/4K 屏上仍然偏小，用户明确要求放开到 72。

   ★ 字号是**运行时令牌**（--lyric-size）下发给播放界面的：歌词由样式包渲染，
     宿主不碰它们的 DOM，只能给一个 CSS 变量（见 packages/player-skins 的
     lyrics.css）。下发的值一律经 lyricSizeToken()，量程与兜底只此一处 ——
     启动时（theme.js#applyResolvedTheme）与两个滑杆都走它。
   ========================================================================== */

export const LYRIC_SIZE_MIN = 14;
export const LYRIC_SIZE_MAX = 72;
/** 配置缺值 / 非法值时的兜底（与 Go 侧 bootstrap 默认值一致） */
export const LYRIC_SIZE_DEFAULT = 16;

/**
 * 把配置里的歌词字号折算成 --lyric-size 的值（带 px）。
 *
 * 越界值一律夹回量程：配置是用户可手改的 JSON 文件，一个 500 进来就会让
 * 歌词变成两行一个屏幕（而且没有任何报错）。
 *
 * @param {unknown} value 配置里的 lyricsFontSize
 * @returns {string} 例如 "16px"
 */
export function lyricSizeToken(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return `${LYRIC_SIZE_DEFAULT}px`;
  return `${Math.min(LYRIC_SIZE_MAX, Math.max(LYRIC_SIZE_MIN, n))}px`;
}
