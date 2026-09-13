// @ts-check
/* ==========================================================================
   lrc.js — LRC 解析与定位
   --------------------------------------------------------------------------
   为什么解析放在皮肤包里：宿主把「歌词文本」交给皮肤（可能是内嵌 / .lrc /
   缓存 / 在线匹配来的），而**怎么把它变成一行行带时间戳的歌词**属于呈现层。
   三种内置样式共用这一份实现，第三方皮肤也可以直接用（从包入口导出）。

   解析规则（与主流播放器一致）：
     · 一行可以带多个时间标签（`[00:12.00][01:20.00]同一句`），要展开成多行；
     · 分秒是 `mm:ss`，小数部分 `.xx` / `.xxx` / `:xx` 都接受，按毫秒补齐；
     · 没有时间标签的行（作词/作曲之类的元信息行）直接丢掉 —— 它们没有
       时间轴，留在列表里会永远停在高亮不到的位置。
   ========================================================================== */

const TIME_TAG = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/**
 * LRC 文本 → 按时间升序的 `[{ time, text }]`（time 单位毫秒）。
 * @param {string} text
 * @returns {Array<{time:number,text:string}>}
 */
export function parseLrc(text) {
  if (!text) return [];
  /** @type {Array<{time:number,text:string}>} */
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const times = [];
    TIME_TAG.lastIndex = 0;
    let m;
    while ((m = TIME_TAG.exec(raw))) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const frac = m[3] ? Number(`0.${m[3].padEnd(3, "0")}`) : 0;
      times.push((min * 60 + sec + frac) * 1000);
    }
    const content = raw.replace(TIME_TAG, "").trim();
    if (!times.length || !content) continue;
    for (const t of times) out.push({ time: t, text: content });
  }
  return out.sort((a, b) => a.time - b.time);
}

/**
 * 二分查找当前播放位置对应的歌词行下标（-1 表示还没到第一句）。
 * @param {Array<{time:number}>} lines
 * @param {number} currentMs
 * @returns {number}
 */
export function findLyricIndex(lines, currentMs) {
  if (!lines || !lines.length) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= currentMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
