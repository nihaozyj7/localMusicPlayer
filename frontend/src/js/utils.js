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
  // 提升到模块级：fmtCount 在列表/提示里被频繁调用，每次 new 一个
  // Intl.NumberFormat 会重复构造 ICU 实例（同文件的 Collator 已经是这个写法）。
  return countFormatter.format(n || 0);
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

/** LRC 解析与定位已随「歌词渲染」一起抽到 @musicplayer/player-skins（src/lrc.js）。
 *  这里刻意不再保留副本：两份实现迟早会漂，而歌词行号算错的表现是「高亮错行」，
 *  非常难查。需要解析/定位请从包入口 import。 */

/** 自然排序（含中文数字感知） */
const collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });

/** 千分位格式化器（模块级复用，见 fmtCount） */
const countFormatter = new Intl.NumberFormat("zh-CN");
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

/* --------------------------------------------------------------------------
   默认封面
   --------------------------------------------------------------------------
   后端没有解析到内嵌封面时，song.cover 可能是空串，也可能是后端返回的
   一个取不到图的地址。两种情况都不能把 <img> 留在「无 src / 加载失败」的
   状态 —— 浏览器会画出那个破碎的小图标，非常难看。
   这里统一给一张内联 SVG 默认封面（深色唱片 + 音符），它是图片本身，
   所以既能让 <img> 正常渲染，也不依赖任何颜色令牌。
   -------------------------------------------------------------------------- */
const DEFAULT_COVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#26262c"/>
<stop offset="1" stop-color="#101014"/>
</linearGradient>
<radialGradient id="glow" cx="32%" cy="24%" r="78%">
<stop offset="0" stop-color="#ffffff" stop-opacity=".12"/>
<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</radialGradient>
</defs>
<rect width="300" height="300" fill="url(#bg)"/>
<rect width="300" height="300" fill="url(#glow)"/>
<circle cx="150" cy="150" r="104" fill="none" stroke="#ffffff" stroke-opacity=".07" stroke-width="1.2"/>
<circle cx="150" cy="150" r="86" fill="none" stroke="#ffffff" stroke-opacity=".1" stroke-width="1.2"/>
<circle cx="150" cy="150" r="68" fill="none" stroke="#ffffff" stroke-opacity=".07" stroke-width="1.2"/>
<circle cx="150" cy="150" r="50" fill="#ffffff" fill-opacity=".05"/>
<g transform="translate(150 150) scale(1.32) translate(-12 -12)" fill="none" stroke="#ffffff" stroke-opacity=".42" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
<path d="M9 18V5.5a1 1 0 0 1 .8-1l9-1.8a1 1 0 0 1 1.2 1V16"/>
<circle cx="6.5" cy="18" r="2.5"/>
<circle cx="17.5" cy="16" r="2.5"/>
</g>
</svg>`;

/** 默认封面（data URL，可在任意 <img src> 里直接用） */
export const DEFAULT_COVER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(DEFAULT_COVER_SVG)}`;

/**
 * 歌曲封面地址。
 *
 * 优先级：
 *   1. coverUrl —— 同源封面地址。本地歌曲指封面缓存目录里内容寻址的那张图
 *      （后端给出的 /cover/<hash>?t=…，平均 143KB 的图不再随列表接口一起传输）；
 *      在线歌曲指后端联网抓到的封面代理地址。
 *   2. cover —— 仍以 data URL 给出封面的场景（在线曲目、封面面板读到的内嵌封面）；
 *   3. 默认占位封面。
 *
 * 绝不在线歌曲退回默认封面之前先试 cover（在线搜索结果里的视频封面是外链，
 * 会被页面 CSP 的 img-src 'self' 直接拒绝，等于白加载一次）。
 */
export function coverOf(song) {
  if (!song) return DEFAULT_COVER;
  const override = coverOverrideFor(song.id);
  if (override) return override;
  return coverOfRaw(song) || DEFAULT_COVER;
}

/**
 * 歌曲「原始」封面（不含用户在封面搜索里选的覆盖图）。
 *
 * 封面面板要用它来显示「当前文件自带的封面」，否则一旦选了新封面，
 * 面板里的对比图就也跟着变了，用户无法比较。
 */
export function coverOfRaw(song) {
  if (!song) return "";
  const proxied = typeof song.coverUrl === "string" ? song.coverUrl.trim() : "";
  if (proxied) return proxied;
  const c = typeof song.cover === "string" ? song.cover.trim() : "";
  return c;
}

/* --------------------------------------------------------------------------
   封面覆盖表
   --------------------------------------------------------------------------
   coverOf 是在同步的模板拼接里被大量调用的，不能是 async，
   也不适合为了读一个 Map 去 import store（会形成 utils ⇄ store 循环依赖）。
   所以这里留一个可注入的读取钩子，由 store.js 在初始化时接上。
   -------------------------------------------------------------------------- */
let coverOverrideGetter = null;

export function setCoverOverrideGetter(fn) {
  coverOverrideGetter = fn;
}

function coverOverrideFor(id) {
  if (!id || typeof coverOverrideGetter !== "function") return "";
  return coverOverrideGetter(id) || "";
}

/**
 * 在线歌曲在「拿不到封面」时应该显示什么。
 *
 * 需求：在线封面获取不到时**不显示封面**，而不是留一个破图或占位图。
 * 这里返回 true 表示调用方应当渲染一个空槽位（或直接省略 <img>）。
 *
 * 注意与 isPlaceholderCoverUrl 的分工：本函数问的是「这首歌该不该画封面」，
 * 后者问的是「这个 <img src> 是不是那张占位图本身」（取色时要靠它把关）。
 */
export function isPlaceholderCover(song) {
  return coverOf(song) === DEFAULT_COVER;
}

/** 这个封面地址是不是那张默认占位封面（DEFAULT_COVER）本身 */
export function isPlaceholderCoverUrl(url) {
  return String(url || "") === DEFAULT_COVER;
}
