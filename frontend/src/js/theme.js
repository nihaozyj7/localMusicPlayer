/* ==========================================================================
   theme.js — 主题注册与切换
   --------------------------------------------------------------------------
   · 一个主题 = styles/themes/ 下的一个 CSS 文件（文件名即 data-theme 值）
   · 浏览器预览无法列目录，故内置主题在此登记；接入 Go 后端后，
     backend.listThemes() 会扫描 themes/ 目录并把新主题自动注入 <link>，
     无需修改任何组件代码（满足需求 A8）。
   ========================================================================== */

import { backend, isWails } from "./bridge.js";
import { animationDurationValue, setRuntimeTokens, replaceStyleRules } from "./runtime-tokens.js";
import { commit, state } from "./store.js";
import { toast } from "./ui/overlays.js";
import { isPlaceholderCoverUrl } from "./utils.js";

/** 内置主题登记表（新增主题时可在此追加，或依赖后端自动扫描） */
const BUILTIN_THEMES = [
  {
    id: "dark-minimal",
    name: "深色 · 黑白极简",
    mode: "dark",
    builtin: true,
    swatch: ["#08080a", "#1b1b1f", "#3a3a42", "#f4f4f6", "#ff4d6d"],
  },
  {
    id: "light-minimal",
    name: "浅色 · 黑白极简",
    mode: "light",
    builtin: true,
    swatch: ["#f2f2f4", "#ffffff", "#d8d8dd", "#14141a", "#e8384f"],
  },
  {
    id: "cover-dark",
    name: "封面取色 · 深色",
    mode: "dark",
    builtin: true,
    swatch: ["#0b0b12", "#2a2a31", "#6b6b76", "#f7f7fa", "#ff4d6d"],
  },
];

const registry = BUILTIN_THEMES.slice();

/* --------------------------------------------------------------------------
   注册表版本号
   --------------------------------------------------------------------------
   主题列表是 Lit 组件之外的可变数据（重扫 / 导入 / 移除都会改），
   store 的订阅广播覆盖不到它。组件把它放进 deps() 就能跟着更新 ——
   这就是「以原始值数组声明依赖」在非 store 数据上的用法。
   -------------------------------------------------------------------------- */
let registryVersion = 0;

export function themeRegistryVersion() {
  return registryVersion;
}

export function listThemes() {
  return registry;
}

export function getTheme(id) {
  return registry.find((t) => t.id === id) || registry[0];
}

/**
 * 后端模式：扫描用户主题目录并把每个主题的 CSS 注入为独立样式表。
 * 这样用户往 %APPDATA%\LocalMusicPlayer\themes\ 丢一个 CSS 文件，
 * 打开设置界面就能看到新主题 —— 不需要改任何前端文件（需求 A8）。
 *
 * 每次扫描都是**以磁盘为准的整体同步**，而不是只往上加：
 * 用户在资源管理器里删掉一个主题 CSS、或者在设置里点了「移除」之后，
 * 注册表里那个主题必须跟着消失。只加不减的话，列表会永远留着它，
 * 点它还会切到一个已经不存在的主题上。
 */
export async function discoverThemes() {
  if (!isWails()) return registry;
  try {
    const res = await backend.listThemes();
    // 后端一个主题都没返回只可能是调用出了岔子（内置三款由后端在启动时
    // 写入主题目录，正常情况下一定扫得到）。这时保持现状，不要清空列表。
    if (!Array.isArray(res) || !res.length) return registry;

    for (const t of res) {
      if (!t?.id) continue;
      const css = await backend.loadTheme(t.id);
      if (typeof css === "string" && css.trim()) injectTheme(t.id, css);
    }
    syncThemeRegistry(res);
  } catch (err) {
    console.warn("[theme] 主题目录扫描失败", err);
  }
  return registry;
}

/**
 * 把注册表对齐到后端这次的扫描结果（原地改，外部拿到的引用一直有效）。
 *
 * 分两步：先按后端清单更新 / 补齐，再把「这次没扫到」的旧条目连同它们的
 * 样式表一起丢掉 —— 后者正是「手动删了主题、再扫描还在」的修法。
 */
function syncThemeRegistry(list) {
  const next = [];
  const seen = new Set();

  for (const t of list) {
    if (!t?.id || seen.has(t.id)) continue;
    seen.add(t.id);
    const entry = {
      id: t.id,
      name: t.name || t.id,
      mode: t.mode || "dark",
      swatch: Array.isArray(t.swatch) ? t.swatch : [],
      builtin: Boolean(t.builtin),
    };
    const existing = registry.find((x) => x.id === t.id);
    if (existing) {
      Object.assign(existing, entry);
      next.push(existing);
    } else {
      next.push(entry);
    }
  }

  for (const old of registry) {
    if (next.includes(old)) continue;
    // 一并撤掉它注入的样式表：留着的话，下次导入一个同名 id 的主题时
    // 旧规则还在，会出现「同一个 data-theme 命中两套令牌」。
    replaceStyleRules(`theme-file-${old.id}`, "");
  }

  registry.length = 0;
  registry.push(...next);
  registryVersion += 1;
  return registry;
}

/**
 * 移除一个用户主题：后端删掉主题目录里的那个 CSS 文件，前端立刻按磁盘重扫。
 *
 * 这里不碰「当前用的是哪个主题」——删掉的正好是当前主题时，调用方紧接着调
 * applyResolvedTheme(config) 就会自动回退到一个仍然存在的主题（它本来就会
 * 校验注册表）。把这两件事分开，theme.js 也不必反过来依赖 store。
 *
 * 返回 { removed, themeIds }：removed=false 表示后端没有删成（例如内置主题）。
 */
export async function removeTheme(id) {
  await backend.deleteTheme(id);
  await discoverThemes();
  const removed = !registry.some((t) => t.id === id);
  return { removed, themeIds: registry.map((t) => t.id) };
}

/**
 * 把后端返回或用户自定义的主题 CSS 挂载为样式表。
 * 用 CSSOM 的 insertRule 写入，避免 CSP 对 <style>.textContent 与 blob: 样式表的拦截。
 */
export function injectTheme(id, css) {
  replaceStyleRules(`theme-file-${id}`, css);
}

/** 读取 CSS 变量（如封面取色时回读 --accent） */
function rootVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* --------------------------------------------------------------------------
   首帧主题脚本留下的行内令牌
   --------------------------------------------------------------------------
   Go 侧的 /early-theme.js（见 early_theme.go）会在页面加载前把 --seed / --seed-2
   以及由种子色算出的近似 --bg-app / --bg-window **写进 <html> 的行内样式**，
   让首帧就是对的颜色，而不是「先黑再取色」。

   但行内自定义属性的优先级**高于任何样式表规则**（连运行时令牌表里的 !important
   也压不过它）。这些值只在首帧有意义，之后必须撤掉，否则：

     · --bg-app / --bg-window 会把窗口底色**永久锁**在启动时那个颜色上 ——
       换主题后侧边栏、曲目区、底栏还是旧主题的底色，看起来就是「切主题没效果，
       只是取色主题还残留一点颜色」（正是这一条造成的串味）；
     · --seed / --seed-2 会盖住主题自带的默认种子色。

   ★ 但**不能直接删掉就走人**。--seed 是封面取色主题的底色来源，而真正的种子色
   要等封面解码完（primeCoverAccent / 主循环的 syncCoverAccent）才拿得到；直接
   删掉的话，中间这段空窗期主题会退回自己写死的占位灰，于是启动时又变成
   「上次保留的颜色 → 占位灰 → 真正的取色」三段 —— 就是修串味时引入的回退。

   所以删之前先把行内值**搬进运行时令牌表**：观感与首帧完全一致（同一个颜色），
   只是把「压过所有样式表的行内副本」换成了「可被后续覆盖的运行时令牌」。
   底色令牌不搬 —— 主题样式表本来就会用同一个种子色算出精确值，让主题说了算。
   -------------------------------------------------------------------------- */
const EARLY_THEME_INLINE_PROPS = ["--seed", "--seed-2", "--bg-app", "--bg-window"];
/** 需要「搬进运行时令牌表」的行内令牌（其余的直接删） */
const EARLY_THEME_CARRIED_PROPS = ["--seed", "--seed-2"];

function readHtmlInlineProp(name) {
  const raw = document.documentElement.style.getPropertyValue(name).trim();
  return raw ? String(document.documentElement.style.getPropertyValue(name)) : null;
}

/** 把首帧行内令牌降级成运行时令牌，然后撤掉行内副本。返回降级后的种子色。 */
function demoteEarlyThemeInlineProps() {
  const html = document.documentElement;
  const carried = {};
  for (const name of EARLY_THEME_CARRIED_PROPS) {
    const value = readHtmlInlineProp(name);
    if (value) carried[name] = value;
  }
  for (const name of EARLY_THEME_INLINE_PROPS) html.style.removeProperty(name);
  return carried;
}

/** 目前消费 --seed / --seed-2 的主题（用户主题若照着写，见 seedFor 的说明） */
export const SEED_CONSUMER = "cover-dark";

/* --------------------------------------------------------------------------
   封面取色的「种子源」策略
   --------------------------------------------------------------------------
   取色是**主题能力**（只有声明了 --seed / --seed-2 的主题才消费它），所以
   「拿哪个封面去取色、什么源不该取色」属于主题层，不属于主循环。主循环只负责
   在合适的时机把封面地址交过来（见 main.js#syncCoverAccent）。

   唯一一条硬规则：**默认占位封面绝不取色**。那张内联 SVG 的主色是一个中性
   深灰（实测 #1d1d22），拿它写进 --seed 会同时造成两件坏事：
     1. 主题整片变灰（不是封面主色，却冒充主色）；
     2. 它会被写回配置的 coverSeed，**覆盖掉上次真正的取色结果** ——
        下次启动的首帧主题就用错了颜色。
   占位封面出现的地方有两类：曲目本身没有内嵌封面；底栏 <img> 还没画出真正
   那张封面时的过渡状态。
   -------------------------------------------------------------------------- */
export function seedSourceUsable(src) {
  return Boolean(src) && !isPlaceholderCoverUrl(src);
}

/**
 * 上一次真正把种子色落到运行时令牌表里的主题；null 表示「还没有落过，现在用的
 * 是首帧脚本留下的那个种子色」。
 *
 * 它的唯一作用是判断「这次换主题，是不是该把旧种子撤掉」：
 * 启动阶段（null）绝不能撤 —— 真正的种子色要等封面解码完才拿得到，中间撤掉
 * 就会闪回主题的占位灰（就是这一条造成「启动时主题闪一下」）。
 */
let seedTheme = null;

/** 首帧脚本留下的种子色：降级时暂存，供启动这段异步窗口顶上 */
let earlySeed = null;
let earlySeed2 = null;

/**
 * 应用主题：
 *  0. 首帧主题脚本留下的行内令牌降级为运行时令牌（否则换主题不会生效，见上）
 *  1. 解析深浅模式（dark / light / system）
 *  2. 写入 data-theme
 *  3. 应用毛玻璃强度与不透明度覆盖
 *  4. 处理封面取色主题的种子色
 */
export async function applyResolvedTheme(config) {
  const html = document.documentElement;
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  // 必须在解析主题之前做：行内副本压着所有样式表，不移走的话下面读到的、
  // 以及换主题之后生效的都还是启动时那个值。
  // 降级出来的种子色只暂存起来，稍后按下面的「粘住」规则决定要不要继续用。
  const carried = demoteEarlyThemeInlineProps();
  if (carried["--seed"]) earlySeed = carried["--seed"];
  if (carried["--seed-2"]) earlySeed2 = carried["--seed-2"];

  let themeId = config.theme || "dark-minimal";
  if (config.themeMode === "system") {
    const wanted = sysDark ? "dark" : "light";
    const fallback = registry.find((t) => t.mode === wanted && t.id !== "cover-dark");
    if (fallback) themeId = fallback.id;
  } else if (registry.find((t) => t.id === themeId)?.mode !== config.themeMode) {
    const fallback = registry.find((t) => t.mode === config.themeMode && t.id !== "cover-dark");
    if (fallback) themeId = fallback.id;
  }

  html.dataset.theme = themeId;
  // 解析出来的深浅模式也写进 DOM：播放界面皮肤通过 ctx.mode 读它
  // （皮肤拿不到 config，也不该为了知道深浅色去 import 主题模块）
  html.dataset.mode = registry.find((t) => t.id === themeId)?.mode || config.themeMode || "dark";
  config.theme = themeId;

  /* —— 种子色：粘住，而不是「先清空再等封面取色」 ——
     运行时令牌表一旦写进 --seed，就有 !important 优先级；而真正的取色结果要等
     当前封面解码完（primeCoverAccent / 主循环的 syncCoverAccent）才写第二次。
     所以在它到来之前，种子里必须一直是「首帧脚本留下的那个上次取色结果」，
     中途清空就会闪回主题写死的占位灰（启动时闪一下就是这么来的）。

     清空只在两种情况下做（此时主题的默认种子色才该生效）：
       · 用户明确关掉了「主题色跟随封面」；
       · 换主题时**真正把种子落过地的那个主题**（seedTheme）不是当前主题 ——
         即从封面取色主题切到了别的主题。启动阶段 seedTheme 是 null，
         所以这一条不会在启动时误伤。 */
  const derivedSeed = seedFor(config, themeId);
  const derivedSeed2 = seedFor(config, themeId, true);
  const seedEnabled = config.accentFromCover !== false;
  const dropEarlySeed = config.accentFromCover === false || (seedTheme !== null && themeId !== SEED_CONSUMER);
  if (dropEarlySeed) {
    earlySeed = null;
    earlySeed2 = null;
  }
  const seed = derivedSeed ?? (seedEnabled ? earlySeed : null);
  const seed2 = derivedSeed2 ?? earlySeed2 ?? seed;

  // 动画开关始终生效；毛玻璃强度只有在用户手动调过之后才覆盖主题自带的值，
  // 否则无论切到哪个主题都会显示成配置里的 22px（主题自己的 26px 就看不到了）。
  setRuntimeTokens({
    "--glass-blur": config.glassBlurCustom ? `${config.glassBlur}px` : null,
    // --dur 是全站唯一的过渡时长令牌：动画开关与「过渡速度」都只改它
    "--dur": animationDurationValue(config),
    // 封面取色的种子色。
    //
    // 为什么换主题时必须重下发：运行时令牌表的优先级**高于**
    // :root[data-theme] 里的主题令牌，一旦写进去就会一直压着主题 ——
    // 换了主题却不重发，新主题就会用着上一个主题的种子色。
    "--seed": seed,
    "--seed-2": seed2,
  });
  // 记下「现在真正管着种子色的是谁」：只有确实是封面取色主题时才认，别的主题
  // 一律把种子色标记为「该撤」。启动阶段这里可能是 null（种子还只是首帧脚本
  // 留下的暂存值）—— 那正是我们要的：下一次套主题时才允许撤它。
  seedTheme = seed && themeId === SEED_CONSUMER ? SEED_CONSUMER : null;

  forceStyleRefresh();
  // 主题（以及由主题派生的 --seed / --glass-bg）刚变过，底色缓存必须丢掉。
  // cover-accent.js 的换种子色也全部经由本函数，所以这里是唯一的失效点。
  invalidateGlassBase();
  // 用户手动调过面板透明度时，换主题后按新主题的底色重新套一遍
  if (config.glassAlphaCustom) applyGlassAlpha(config.glassAlpha);
  return themeId;
}

/**
 * 取配置里的封面种子色（secondary = 次色），没记录时返回 null（= 不覆盖，
 * 用主题自己的默认值）。
 *
 * 只有**消费** --seed 的主题才下发：内置主题里目前只有 cover-dark 用种子色
 * 派生底色，其它主题拿到它不会有任何效果，反而会让「主题自带的颜色是不是
 * 被盖住了」变得难以判断。自定义主题若声明了 --seed，也一并受益。
 */
function seedFor(config, themeId, secondary = false) {
  if (!config || config.accentFromCover !== true) return null;
  // 目前只有 cover-dark 会消费 --seed（用户主题若照着写也会生效）
  if (themeId !== "cover-dark") return null;
  const hex = normalizeSeed(secondary ? config.coverSeed2 : config.coverSeed);
  return hex || null;
}

/**
 * 底栏「切换深浅色」按钮：在深色 / 浅色之间切换（写 themeMode，不改 theme）。
 *
 * 以前它长在 main.js 里 —— 主题相关的东西散在入口文件并不合适，
 * 迁移时顺手收进主题模块（调用方只有标题栏）。
 */
export async function toggleTheme() {
  const resolved = getTheme(state.config.theme);
  const nextMode = resolved?.mode === "light" ? "dark" : "light";
  state.config.themeMode = nextMode;
  await applyResolvedTheme(state.config);
  commit();
  toast(nextMode === "dark" ? "已切换到深色主题" : "已切换到浅色主题", { duration: 1500 });
}

/* --------------------------------------------------------------------------
   面板透明度（真正的「背景不透明度」）
   --------------------------------------------------------------------------
   内置主题把 --glass-bg 写成各自的 rgba/color-mix，直接改 --glass-alpha 没有主题
   会消费它（那只是预留令牌）。这里用一个小探针元素把当前主题的底色解析成 rgb，
   再按用户给的百分比重新合成 rgba 写回，于是「背景不透明度」能够真正生效，
   并且换主题时会基于新主题的底色重新计算。
   -------------------------------------------------------------------------- */
let alphaProbe = null;

function resolveThemeColor(expr) {
  if (!alphaProbe) {
    alphaProbe = document.createElement("div");
    alphaProbe.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;";
    document.body.appendChild(alphaProbe);
  }
  alphaProbe.style.backgroundColor = expr;
  return getComputedStyle(alphaProbe).backgroundColor;
}

function rgbaWithAlpha(color, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  const text = String(color);
  // 普通 rgb()/rgba()
  const rgb = text.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const parts = rgb[1].split(/[,/]/).map((s) => parseFloat(s.trim()));
    const [r, g, b] = parts;
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
    }
  }
  // color-mix 等会解析成 color(srgb r g b / a)，分量为 0-1
  const srgb = text.match(/color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (srgb) {
    const [r, g, b] = srgb.slice(1, 4).map((n) => Math.round(parseFloat(n) * 255));
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  }
  return null;
}

/** 读当前主题实际生效的面板透明度百分比（用于滑块初值） */
export function resolvedGlassAlpha() {
  const text = String(resolveThemeColor("var(--glass-bg)"));
  const rgba = text.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/);
  const slash = text.match(/\/\s*([\d.]+)\s*\)/);
  const a = parseFloat((rgba && rgba[1]) || (slash && slash[1]) || "");
  return Number.isFinite(a) ? Math.round(a * 100) : 62;
}

/** 缓存的「主题自己的」三档面板底色 */
let glassBaseCache = null;

/**
 * 丢掉主题底色缓存。
 *
 * **套主题之后必须调用**：底色来自主题 CSS 与 --seed，换主题或换种子色之后
 * 旧值就不再有效。cover-accent.js 换种子色也走 applyResolvedTheme，
 * 所以那边不用单独调。
 */
export function invalidateGlassBase() {
  glassBaseCache = null;
}

/**
 * 解析当前主题的 --glass-bg / --glass-bg-strong / --glass-bg-weak 实际颜色。
 *
 * 为什么要缓存：applyGlassAlpha 挂在「面板透明度」滑条上，一次拖动会触发
 * 几十上百次；而每次解析都要「先清掉上一轮覆盖 → 写探针 → getComputedStyle
 * 强制样式重算」，是 4 次强制同步样式计算（即每次输入一次布局抖动）。
 * 底色只在换主题/换种子色时变，用上面的失效点 + 这里的缓存即可。
 *
 * 注意：缓存的是**主题自己的**底色，不是上一次合成出来的 rgba —— 所以
 * 连续拖动不会把透明度「套娃」叠加，这也比原来每次重读更正确。
 */
function resolveGlassBase() {
  if (glassBaseCache) return glassBaseCache;
  // 先清掉上一轮覆盖，才能读到「当前主题真实的」底色
  setRuntimeTokens({ "--glass-bg": null, "--glass-bg-strong": null, "--glass-bg-weak": null });
  glassBaseCache = {
    bg: resolveThemeColor("var(--glass-bg)"),
    strong: resolveThemeColor("var(--glass-bg-strong)"),
    weak: resolveThemeColor("var(--glass-bg-weak)"),
  };
  return glassBaseCache;
}

/** 按百分比（0-100）设置面板背景的不透明度 */
export function applyGlassAlpha(percent) {
  const a = Math.max(0, Math.min(1, (Number(percent) || 0) / 100));
  const base = resolveGlassBase();
  setRuntimeTokens({
    "--glass-bg": rgbaWithAlpha(base.bg, a),
    "--glass-bg-strong": rgbaWithAlpha(base.strong, Math.min(1, a + 0.18)),
    "--glass-bg-weak": rgbaWithAlpha(base.weak, Math.max(0, a - 0.22)),
  });
}

/**
 * 强制重算全页样式。
 *
 * 为什么要这么绕：主题令牌来自样式表里的 import 语句（打包器会把它内联成真正的 CSS），
 * 实测在 WebView2/Chromium 上只改根节点的 data-theme 时，**已经存在的元素**不会重新解析
 * var(--…) —— 它们的计算样式停在旧主题上。症状就是切到浅色主题后，侧边栏文字仍然是
 * 深色主题的浅灰（还带着旧主题的旧数值），落在浅色背景上几乎看不见。
 * 新建的元素是正常的，所以这个问题只在"切换主题"时暴露。
 *
 * 改一下 body 上那个不参与任何样式的 data-route 属性，会让整棵子树失效重算，
 * 但不重建 DOM，因此不丢焦点、不闪屏。
 */
function forceStyleRefresh() {
  const body = document.body;
  if (!body) return;
  body.dataset.styleEpoch = String((Number(body.dataset.styleEpoch) || 0) + 1);
}

/** 读取当前主题实际生效的毛玻璃模糊半径（px） */
export function resolvedGlassBlur() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--glass-blur");
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 22;
}

/** 把 #rgb / #rrggbb / rgb() 统一成小写 #rrggbb（认不出来返回 ""） */
export function normalizeSeed(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const hex = text.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hex) {
    let h = hex[1].toLowerCase();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return `#${h}`;
  }
  const rgb = text.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgb) {
    const to = (n) =>
      Math.max(0, Math.min(255, Math.round(Number(n))))
        .toString(16)
        .padStart(2, "0");
    return `#${to(rgb[1])}${to(rgb[2])}${to(rgb[3])}`;
  }
  return "";
}

/**
 * 把当前封面主色写入 --seed / --seed-2（供 cover-dark 等主题使用），
 * 并写回配置 / localStorage。
 *
 * 写回配置是为了「下一次启动的首帧」：Go 侧在页面加载前就把上次的取色结果
 * 挂到 <html> 上（见 early_theme.go），否则封面取色主题每次启动都要经历
 * 「先黑 → 占位灰 → 取色重绘」三段。
 *
 * 只负责写令牌与持久化；调用方在 active 时再套一次 applyResolvedTheme，
 * 让依赖种子色的派生令牌（面板底色 / 强调色）跟着更新。
 */
/* --------------------------------------------------------------------------
   封面取色主题的整窗底图
   --------------------------------------------------------------------------
   取色主题的底子改成「当前封面 + 重模糊」（参考「沉浸」样式的背景），而不是
   只用提取出来的两个种子色 —— 单纯取色出来的底色往往偏灰、也看不出是哪张封面。

   种子色**仍然保留**：封面还没解码完时的首帧兜底、以及强调色派生都靠它。

   这里只写 --cover-bg 一个令牌，真正的渲染在 base.css 的 .app-bg 里；
   不是取色主题时把它撤掉，否则换到别的主题后旧封面还会一直贴着。
   -------------------------------------------------------------------------- */
let coverBackdropSrc = "";

/**
 * 把当前封面交给取色主题当整窗底图。src 为空 = 撤掉底图（回到渐变）。
 * @param {string} src 当前的封面地址（data URL / 同源代理地址）
 */
export function applyCoverBackdrop(src) {
  const themeId = document.documentElement.dataset.theme || "";
  const usable = typeof src === "string" ? src.trim() : "";
  const want = themeId === SEED_CONSUMER ? usable : "";
  if (want === coverBackdropSrc) return;
  coverBackdropSrc = want;
  // 用 url("…") 包起来：地址里可能带 ? & 之类的查询串，裸写进 background-image
  // 会被 CSS 解析成一个孤立的自定义属性值而不是图片。
  setRuntimeTokens({
    "--cover-bg": want ? `url("${want.replace(/["\\]/g, "\\$&")}")` : null,
  });
}

export function applyCoverSeed(seedHex, seed2Hex) {
  const seed = normalizeSeed(seedHex);
  const seed2 = normalizeSeed(seed2Hex) || seed;
  if (!seed) return false;

  setRuntimeTokens({ "--seed": seed, "--seed-2": seed2 });

  if (state.config.coverSeed !== seed || state.config.coverSeed2 !== seed2) {
    state.config.coverSeed = seed;
    state.config.coverSeed2 = seed2;
    rememberSeed();
    return true;
  }
  return false;
}

/* --------------------------------------------------------------------------
   主题 / 取色的本地快照（只服务于浏览器预览与调试）
   --------------------------------------------------------------------------
   真实应用的首帧主题由 Go 侧按配置文件生成（见 early_theme.go），
   这里记一份只是为了在没有后端的预览环境里也能复现同样的时序。
   -------------------------------------------------------------------------- */
export const SEED_STORAGE_KEY = "music-player.cover-seed.v1";

function rememberSeed() {
  try {
    localStorage.setItem(
      SEED_STORAGE_KEY,
      JSON.stringify({
        seed: state.config.coverSeed || "",
        seed2: state.config.coverSeed2 || "",
        theme: state.config.theme || "",
      })
    );
  } catch {
    /* 隐私模式等写不进去时忽略：只影响预览 */
  }
}

/**
 * 从图片元素提取主色（浏览器预览与「主题色跟随封面」都用它）。
 *
 * 为什么不是简单平均：整张图平均下来往往是一片灰（封面里的黑边、白色标题
 * 会把颜色冲淡），取色主题就变成「看不出取了个什么色」。这里按**饱和度**
 * 加权，并跳过近乎无彩 / 过暗的像素，结果更接近人眼认定的「封面主色」。
 * 彩色像素一个都没有时（纯黑白封面）再退回普通平均，保证总有结果。
 */
export function extractCoverSeed(imgEl) {
  try {
    const canvas = document.createElement("canvas");
    const size = 32;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(imgEl, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    let wr = 0;
    let wg = 0;
    let wb = 0;
    let weight = 0;
    let ar = 0;
    let ag = 0;
    let ab = 0;
    let n = 0;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      ar += r;
      ag += g;
      ab += b;
      n += 1;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max < 26) continue; // 几乎全黑：多半是封面边框
      const sat = max === 0 ? 0 : (max - min) / max;
      if (sat < 0.12) continue; // 近乎无彩：属于背景/文字
      // 饱和度越高越能代表「主色」；再按亮度轻微加权，偏亮的更显眼
      const w = sat * sat * (0.35 + max / 255);
      wr += r * w;
      wg += g * w;
      wb += b * w;
      weight += w;
    }

    const pick = weight > 0 ? [wr / weight, wg / weight, wb / weight] : n > 0 ? [ar / n, ag / n, ab / n] : null;
    if (!pick) return null;
    return `rgb(${pick.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(", ")})`;
  } catch {
    return null; // 跨域或 data URL 限制时静默失败
  }
}

export { rootVar };
