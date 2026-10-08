// @ts-check
/* ==========================================================================
   colors.js — 插件配色声明 → 宿主壳层变量（纯逻辑，零 DOM）
   --------------------------------------------------------------------------
   解决的问题（需求原文）：
     「播放器宿主环境本身比如播放器控件栏里面会被插件本身控制颜色，但是这个问题
       也很好解决，直接要求插件声明里面规定一个前景色和一个背景色即可，用来解决
       插件本身配色造成的宿主 UI 可视性差的问题。」

   所以本模块干三件事：
     1. **校验**插件声明的 `colors.bg / colors.fg / colors.accent`；
     2. **兜底**：算 WCAG 对比度，fg 与 bg 对比不足时把它推向黑或白，
        保证宿主控件栏/浮层在任何插件配色下都可读；
     3. **派生**宿主壳层用的一小组 CSS 变量（`--chrome-*`）：
        半透明底 + 前景 + hover/active + 边框 + 强调色，全部由插件那两个色算出来。

   设计取舍：
     · 缺失的项**不猜**：直接不产出该变量，让宿主 CSS 回落到主题令牌
       （= 设置页那条"降级使用主题配色"的定案，并在卡片上打警告图标）。
     · 派生用 `color-mix(in oklab, …)` 而不是自己在 JS 里做色彩空间转换：
       WebView2（Chromium）原生支持，结果与设计师在浏览器里手调的一致，
       而且省掉一整套色彩算法。本模块只做"能不能读、对比度够不够"的判断。
   ========================================================================== */

/** @typedef {{r:number,g:number,b:number,a:number}} Rgba */

/** 插件声明里参与校验的三个键 */
export const COLOR_KEYS = ["bg", "fg", "accent"];

/**
 * 解析一个 CSS 颜色字面量（hex / rgb / rgba / hsl / hsla）。
 *
 * 只接受**确定能算出 RGB** 的写法：
 *   · `#rgb` `#rrggbb` `#rrggbbaa`
 *   · `rgb(1 2 3 / 50%)` `rgb(1,2,3)` `rgba(1,2,3,.5)`
 *   · `hsl(210 40% 20%)` `hsla(210,40%,20%,.5)`
 *
 * 刻意**不**接受 `var(--x)` / `color-mix(...)` / 渐变 / 图片：
 * 那些值在 JS 里算不出对比度，无法参与兜底 —— 与其假装支持，不如让它走"缺失"分支
 * （降级用主题配色 + 卡片警告），这样行为是可预期的。
 *
 * @param {unknown} value
 * @returns {Rgba|null}
 */
export function parseColor(value) {
  if (typeof value !== "string") return null;
  const s = value.trim().toLowerCase();
  if (!s) return null;

  // #rgb / #rgba / #rrggbb / #rrggbbaa
  if (s.startsWith("#")) {
    const h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return null;
    const to = (x) => parseInt(x, 16);
    if (h.length === 3 || h.length === 4) {
      return {
        r: to(h[0] + h[0]),
        g: to(h[1] + h[1]),
        b: to(h[2] + h[2]),
        a: h.length === 4 ? to(h[3] + h[3]) / 255 : 1,
      };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: to(h.slice(0, 2)),
        g: to(h.slice(2, 4)),
        b: to(h.slice(4, 6)),
        a: h.length === 8 ? to(h.slice(6, 8)) / 255 : 1,
      };
    }
    return null;
  }

  const fn = /^(rgba?|hsla?)\(([^)]+)\)$/.exec(s);
  if (!fn) return null;
  const kind = fn[1];
  // 逗号或空格分隔都支持；`/` 之后是 alpha
  const parts = fn[2]
    .replace(/\//g, " ")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;

  const num = (x, scale) => {
    const pct = x.endsWith("%");
    const v = parseFloat(x);
    if (!Number.isFinite(v)) return null;
    return pct ? (v / 100) * scale : v;
  };
  const alpha = parts[3] === undefined ? 1 : num(parts[3], 1);
  if (alpha === null) return null;

  if (kind === "rgb" || kind === "rgba") {
    const r = num(parts[0], 255);
    const g = num(parts[1], 255);
    const b = num(parts[2], 255);
    if (r === null || g === null || b === null) return null;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: clamp01(alpha) };
  }

  // hsl / hsla
  const h = parseFloat(String(parts[0]).replace(/deg$/, ""));
  const sat = num(parts[1], 1);
  const lig = num(parts[2], 1);
  if (!Number.isFinite(h) || sat === null || lig === null) return null;
  const rgb = hslToRgb(((h % 360) + 360) % 360, clamp01(sat), clamp01(lig));
  return { ...rgb, a: clamp01(alpha) };
}

function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/** @param {number} h 0..360 @param {number} s 0..1 @param {number} l 0..1 */
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return { r: clamp255((r + m) * 255), g: clamp255((g + m) * 255), b: clamp255((b + m) * 255) };
}

/** `rgb()` / `rgba()` 文本（派生变量里要用到） */
export function rgbText(c) {
  return `rgb(${clamp255(c.r)} ${clamp255(c.g)} ${clamp255(c.b)})`;
}

/** `#rrggbb` 文本（设置页色块用） */
export function hexText(c) {
  const h = (v) => clamp255(v).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/**
 * WCAG 2.1 相对亮度（0 = 全黑，1 = 全白）。
 * @param {Rgba} c
 * @returns {number}
 */
export function relativeLuminance(c) {
  const lin = (v) => {
    const s = clamp255(v) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/**
 * WCAG 对比度（1 ~ 21）。不考虑 alpha：声明的是"画面底色/前景"，
 * 半透明由宿主自己派生（见 deriveChrome）。
 *
 * @param {Rgba} a
 * @param {Rgba} b
 * @returns {number}
 */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** 可读性门槛：WCAG AA 正文 4.5:1 */
export const CONTRAST_OK = 4.5;
/** 低于这个值就直接换成黑/白，不再尝试微调 */
export const CONTRAST_HOPELESS = 2.0;

/**
 * 把前景色推向"与 bg 足够对比"的方向。
 *
 * 做法：先看原色够不够；不够就朝更亮/更暗两端按 10 档步进混色，取第一个达标的；
 * 都不达标（或对比度低于 CONTRAST_HOPELESS）就直接用黑或白里更好的那个。
 * 用 sRGB 线性插值而不是 oklch 变换，是为了让结果可预测、可单测。
 *
 * @param {Rgba} bg
 * @param {Rgba} fg
 * @returns {{color:Rgba, corrected:boolean}}
 */
export function ensureReadableFg(bg, fg) {
  if (contrastRatio(bg, fg) >= CONTRAST_OK) return { color: fg, corrected: false };

  // 朝白还是朝黑：看 bg 是暗还是亮（bg 暗 → 往白推）
  const toward = relativeLuminance(bg) < 0.5 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
  if (contrastRatio(bg, fg) >= CONTRAST_HOPELESS) {
    for (let step = 1; step <= 10; step += 1) {
      const t = step / 10;
      const mixed = {
        r: Math.round(fg.r + (toward.r - fg.r) * t),
        g: Math.round(fg.g + (toward.g - fg.g) * t),
        b: Math.round(fg.b + (toward.b - fg.b) * t),
        a: 1,
      };
      if (contrastRatio(bg, mixed) >= CONTRAST_OK) return { color: mixed, corrected: true };
    }
  }
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const best = contrastRatio(bg, black) >= contrastRatio(bg, white) ? black : white;
  return { color: best, corrected: true };
}

/**
 * 校验插件声明，并算出宿主壳层变量。
 *
 * 返回值：
 *   · `vars`      要写到 `#app` 上的 CSS 变量（缺失的项**不出现** → CSS 回落主题）
 *   · `missing`   缺失/非法的键（设置页打警告图标 + tooltip 用）
 *   · `corrected` 是否做了对比度纠正
 *   · `contrast`  最终 fg/bg 对比度（设置页显示"自检"结果）
 *   · `preview`   设置页色块要用到的最终颜色（可能是纠正后的）
 *
 * @param {any} declared 清单里的 colors
 */
export function deriveChrome(declared) {
  const raw = declared && typeof declared === "object" ? declared : {};

  // 「跟随主题」的样式：没有任何固定配色可声明，宿主壳直接用主题配色。
  // 这是合法写法（不是"缺失"），所以不产变量、也不记警告。
  if (raw.theme === true) {
    return {
      theme: true,
      vars: {},
      missing: [],
      corrected: false,
      contrast: 0,
      preview: { bg: null, fg: null, accent: null, declaredFg: null },
      readable: null,
    };
  }

  const missing = [];
  /** @type {Record<string,string>} */
  const vars = {};

  const bg = parseColor(raw.bg);
  const fg = parseColor(raw.fg);
  const accent = parseColor(raw.accent);

  if (!bg) missing.push("bg");
  if (!fg) missing.push("fg");
  // accent 是可选增强：缺失不算"警告"，只是回落主题强调色
  if (raw.accent != null && !accent) missing.push("accent");

  let finalFg = fg;
  let corrected = false;
  if (bg && fg) {
    const r = ensureReadableFg(bg, fg);
    finalFg = r.color;
    corrected = r.corrected;
  }

  if (bg) {
    // 半透明底 + 宿主自己的毛玻璃：与 v2 的 --glass-bg-strong 消费方式一致
    vars["--chrome-bg"] = `color-mix(in oklab, ${rgbText(bg)} 82%, transparent)`;
    vars["--chrome-bg-soft"] = `color-mix(in oklab, ${rgbText(bg)} 62%, transparent)`;
    vars["--skin-bg"] = rgbText(bg);
  }
  if (finalFg) {
    vars["--chrome-fg"] = rgbText(finalFg);
    vars["--chrome-fg-dim"] = `color-mix(in oklab, ${rgbText(finalFg)} 60%, transparent)`;
    vars["--chrome-hover"] = `color-mix(in oklab, ${rgbText(finalFg)} 10%, transparent)`;
    vars["--chrome-active"] = `color-mix(in oklab, ${rgbText(finalFg)} 16%, transparent)`;
    vars["--chrome-border"] = `color-mix(in oklab, ${rgbText(finalFg)} 18%, transparent)`;
    vars["--skin-fg"] = rgbText(finalFg);
  }
  if (accent) vars["--chrome-accent"] = rgbText(accent);

  return {
    theme: false,
    vars,
    missing,
    corrected,
    contrast: bg && finalFg ? Math.round(contrastRatio(bg, finalFg) * 100) / 100 : 0,
    /** 设置页卡片预览用的最终颜色（缺省时给 null，由卡片回落到主题色块） */
    preview: {
      bg: bg ? hexText(bg) : null,
      fg: finalFg ? hexText(finalFg) : null,
      accent: accent ? hexText(accent) : null,
      declaredFg: fg ? hexText(fg) : null,
    },
    /** 对比度自检结论（设置页显示"偏低"提示用） */
    readable: !(bg && fg) ? null : contrastRatio(bg, finalFg) >= CONTRAST_OK,
  };
}

/**
 * 把派生结果写到一个元素上（宿主用）。
 *
 * 只在"详情页打开 + 已挂载插件"时调用；卸载 / 关闭详情页时用 `clearChromeVars` 清掉，
 * 让壳层干净地回到主题配色。
 *
 * @param {HTMLElement|null} el
 * @param {ReturnType<typeof deriveChrome>} derived
 */
export function applyChromeVars(el, derived) {
  if (!el) return;
  for (const [k, v] of Object.entries(derived.vars)) el.style.setProperty(k, v);
  el.dataset.chrome = "on";
}

/** 清掉宿主壳层变量（回到主题配色） */
export function clearChromeVars(el) {
  if (!el) return;
  for (const key of CHROME_VAR_NAMES) el.style.removeProperty(key);
  delete el.dataset.chrome;
}

/** 所有可能被写上去的变量名（清理时要全部移除，避免残留上一次插件的颜色） */
export const CHROME_VAR_NAMES = [
  "--chrome-bg",
  "--chrome-bg-soft",
  "--chrome-fg",
  "--chrome-fg-dim",
  "--chrome-hover",
  "--chrome-active",
  "--chrome-border",
  "--chrome-accent",
  "--skin-bg",
  "--skin-fg",
];
