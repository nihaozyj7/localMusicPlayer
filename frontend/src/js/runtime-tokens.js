/* ==========================================================================
   runtime-tokens.js — 运行时令牌覆盖
   --------------------------------------------------------------------------
   为什么需要它：
     1. :root 上的行内自定义属性压不过 :root[data-theme] 里的主题令牌；
     2. index.html 的 CSP 是 style-src 'self'，实测会拦截两类写法：
          · 给 <style> 元素写 textContent / innerHTML
          · <link rel=stylesheet href=blob:...>
        但通过 CSSOM 的 sheet.insertRule() 写入规则是允许的。
   做法：
     创建一个空的 <style>，用 insertRule 往里面插 :root{--x:…!important} 规则。
   ========================================================================== */

const STYLE_ID = "runtime-tokens";
const overrides = new Map();

function styleSheet() {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  return el.sheet;
}

function flush() {
  const sheet = styleSheet();
  if (!sheet) return;
  // 清空旧规则（倒序删除，避免索引漂移）
  for (let i = sheet.cssRules.length - 1; i >= 0; i -= 1) sheet.deleteRule(i);
  if (!overrides.size) return;
  const body = [...overrides.entries()].map(([name, value]) => `${name}:${value} !important`).join(";");
  try {
    sheet.insertRule(`:root{${body}}`, 0);
  } catch (err) {
    console.warn("[runtime-tokens] 规则插入失败", err);
  }
}

/** 覆盖一个全局设计令牌（例如 --glass-blur、--dur、--lyric-size） */
export function setRuntimeToken(name, value) {
  if (value === null || value === undefined || value === "") overrides.delete(name);
  else overrides.set(name, value);
  flush();
}

/** 批量覆盖 */
export function setRuntimeTokens(patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") overrides.delete(k);
    else overrides.set(k, v);
  }
  flush();
}

export function clearRuntimeTokens() {
  overrides.clear();
  flush();
}

export function getRuntimeTokens() {
  return Object.fromEntries(overrides);
}

/* --------------------------------------------------------------------------
   动画时长
   --------------------------------------------------------------------------
   --dur 是全站唯一的过渡时长令牌（见 tokens.css）。弹出层的关闭逻辑必须等
   过渡真的放完才能把元素 hidden —— 这个等待时间要读同一个令牌，
   固定写死 180~220ms 会在用户把速度调成 0.5s / 0.75s 时把动画尾巴切掉。
   -------------------------------------------------------------------------- */

/** 动画档位 → 毫秒（与设置里的「过渡速度」一一对应，默认 fast = 250ms） */
export const ANIM_SPEEDS = { fast: 250, medium: 500, slow: 750 };

/**
 * 由配置算出 --dur 应该写什么值。
 *
 * · 关闭动画 → 0.001ms（全站归零，见 settings.js 的界面动画开关）；
 * · 默认档 fast → null（**不覆盖**，让主题 / tokens.css 自己决定，保持可定制；
 *   tokens.css 的默认 --dur 就是 250ms，与「快速」档一致）；
 * · medium / slow → 500ms / 750ms。
 */
export function animationDurationValue(config) {
  if (!config || config.animations === false) return "0.001ms";
  const speed = config.animationsSpeed;
  if (!speed || speed === "fast") return null;
  return `${ANIM_SPEEDS[speed] ?? ANIM_SPEEDS.fast}ms`;
}

/**
 * --dur-fast（悬停 / 按下 / 菜单）的毫秒值。
 *
 * tokens.css 把它定义为 --dur × 0.6，这里必须用同一个系数，
 * 否则菜单的淡出会和 CSS 的实际过渡时长对不上。
 */
export function animationFastMs() {
  return Math.round(animationMs() * 0.6);
}

/** 读取当前 --dur 的毫秒值（动画关闭时是 0.001ms，这里返回 0） */
export function animationMs() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--dur").trim();
  if (!raw) return ANIM_SPEEDS.fast;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return ANIM_SPEEDS.fast;
  const ms = raw.endsWith("ms") ? n : raw.endsWith("s") ? n * 1000 : n;
  return Math.max(0, ms);
}

/**
 * 通用：把一段 CSS 文本写进一个具名 <style>（用 insertRule，符合 CSP）
 * @param {string} id 样式元素 id
 * @param {string} css 规则文本，可含多条顶层规则
 */
export function replaceStyleRules(id, css) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  const sheet = el.sheet;
  if (!sheet) return;
  for (let i = sheet.cssRules.length - 1; i >= 0; i -= 1) sheet.deleteRule(i);
  if (!css) return;
  // 顺序插入，失败的单条跳过，不影响其它规则
  const rules = splitTopLevelRules(css);
  for (const rule of rules) {
    try {
      sheet.insertRule(rule, sheet.cssRules.length);
    } catch (err) {
      console.warn("[runtime-tokens] 跳过无效规则", rule, err);
    }
  }
}

/** 极简的顶层规则切分（够用即可：不处理字符串里带 } 的极端情况） */
function splitTopLevelRules(css) {
  const out = [];
  let depth = 0;
  let buf = "";
  for (const ch of css) {
    buf += ch;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        out.push(buf.trim());
        buf = "";
      }
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}
