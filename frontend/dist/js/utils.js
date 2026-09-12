/* ==========================================================================
   utils.js — 纯函数工具（无状态、无 DOM 依赖）
   ========================================================================== */

/** 毫秒 → mm:ss */
export function fmtTime(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 毫秒 → h:mm:ss（超过 1 小时时用） */
export function fmtTimeLong(ms) {
  const total = Math.floor((ms || 0) / 1000);
  const h = Math.floor(total / 3600);
  if (h <= 0) return fmtTime(ms);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 毫秒 → 中文时长描述（用于「全部播放 · 约 1 小时 20 分」） */
export function fmtDurationCn(ms) {
  const total = Math.floor((ms || 0) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分`;
  return `${total} 秒`;
}

/** 字节 → 可读大小 */
export function fmtSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** 数字千分位 */
export function fmtCount(n) {
  return new Intl.NumberFormat("zh-CN").format(n || 0);
}

/** 生成稳定 id */
let idSeq = 0;
export function uid(prefix = "id") {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeq.toString(36)}`;
}

/**
 * 由字符串派生稳定 id（FNV-1a 32 位）
 * 用途：同一路径重复扫描得到同一个 id，歌单 / 播放队列的引用不会因重扫而失效。
 */
export function stableId(input, prefix = "t") {
  let h = 0x811c9dc5;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${prefix}_${h.toString(36)}`;
}

/** 简易唯一值 */
export function uniq(arr) {
  return Array.from(new Set(arr));
}

/** 按 key 去重（保留先出现的） */
export function uniqBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/** 数组按 key 分组 */
export function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

/** LRC 文本 → [{time, text}] */
export function parseLrc(text) {
  if (!text) return [];
  const lines = [];
  const tag = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of text.split(/\r?\n/)) {
    const times = [];
    let m;
    tag.lastIndex = 0;
    while ((m = tag.exec(raw))) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const frac = m[3] ? Number(`0.${m[3].padEnd(3, "0")}`) : 0;
      times.push((min * 60 + sec + frac) * 1000);
    }
    const content = raw.replace(tag, "").trim();
    if (!times.length || !content) continue;
    for (const t of times) lines.push({ time: t, text: content });
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** 二分查找当前歌词行索引（-1 表示还没到第一句） */
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

/** 自然排序（含中文数字感知） */
const collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });
export function naturalCompare(a, b) {
  return collator.compare(a ?? "", b ?? "");
}

/** 平台安全的文件名（用于歌单命名等） */
export function sanitizeName(name) {
  return (name || "").replace(/[\\/:*?"<>|]/g, "_").trim();
}

/** 防抖 */
export function debounce(fn, wait = 200) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** 节流（requestAnimationFrame 版，适合滚动/拖动） */
export function rafThrottle(fn) {
  let queued = false;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...lastArgs);
    });
  };
}

/** 数值夹取 */
export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** 数组移动元素（拖拽排序用） */
export function moveItem(arr, from, to) {
  if (from === to || from < 0 || from >= arr.length) return arr.slice();
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  const target = clamp(to, 0, next.length);
  next.splice(target, 0, item);
  return next;
}

/** HTML 转义（渲染用户文本时必须调用） */
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

/**
 * 生成占位封面（内联 SVG data URL）
 * 正式版会由 Go 后端读取音频内嵌封面；这里用于界面预览。
 */
export function placeholderCover(text = "♪", seed = 0) {
  const hue = (seed * 47) % 360;
  const l1 = 14 + (seed % 5) * 3;
  const l2 = 6 + (seed % 3) * 2;
  const glyph = esc(String(text).slice(0, 1) || "♪");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue} 12% ${l1 + 12}%)"/>
<stop offset="1" stop-color="hsl(${hue} 10% ${l2}%)"/>
</linearGradient>
<radialGradient id="r" cx="30%" cy="22%" r="72%">
<stop offset="0" stop-color="rgba(255,255,255,.30)"/>
<stop offset="1" stop-color="rgba(255,255,255,0)"/>
</radialGradient>
</defs>
<rect width="300" height="300" fill="url(#g)"/>
<rect width="300" height="300" fill="url(#r)"/>
<circle cx="150" cy="150" r="66" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/>
<circle cx="150" cy="150" r="94" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1"/>
<text x="150" y="172" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="72" fill="rgba(255,255,255,.62)">${glyph}</text>
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** 从当前主题读取令牌（供 JS 绘制 canvas / 取色等使用） */
export function cssVar(name, fallback = "") {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v || "").trim() || fallback;
}
