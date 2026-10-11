/* ==========================================================================
   css-visual-tokens.test.js — 视觉值只能住在令牌里
   --------------------------------------------------------------------------
   守的是「主题承担视觉效果、组件 CSS 只承担布局」这条分工（见 styles/tokens.css
   的文件头与 docs/19 §设计约束 4）。它很容易被悄悄破坏，而且破坏之后**没有
   任何报错**：往 .btn 里写一句 background: rgba(0,0,0,.5)，界面看起来只是
   「有点不对」；真正的问题是主题再也改不动那一处 —— 用户复制一份主题改了
   --surface-1，界面却只有一部分跟着变，而且要看选择器特异性才知道为什么。

   三个断言：
     1. 除 tokens.css 与 themes/*.css 外，任何 CSS 文件都不许出现颜色字面量、
        硬编码滤镜（blur/brightness/saturate/…）与不引用令牌的 box-shadow。
        自定义属性**声明行**（--x: …，含跨行续行）是唯一的例外 ——
        那是「值住在这里」的地方，桌面歌词窗口的 --dl-* 就是这种情况。
     2. 组件里 var(--x) 引用到的每个令牌都必须在某个 CSS 文件里定义过，
        或在下面那份「运行时由 JS 写入」的白名单里。写错一个名字不会报错，
        只会静默拿到空值（真实案例：--warn 并不存在，写的是 --warning，
        于是一直在用那句硬编码兜底色）。
     3. tokens.css 里「视觉层」那几组令牌必须同样出现在 themes/_template.css，
        否则用户复制模板时看不到这些旋钮，等于白做。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const stylesRoot = join(here, "..", "src", "styles");

/** 收集 styles/ 下所有 CSS（含组件、主题；排除目录不再单独判断） */
function walkCss(dir = stylesRoot) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkCss(full));
    else if (name.endsWith(".css")) out.push(full);
  }
  return out;
}

/** 统一成正斜杠，报错信息在两套平台看起来一致 */
function rel(full) {
  return relative(stylesRoot, full).split("\\").join("/");
}

/** 去掉块注释：注释里会引用 #i-xxx / #skin-background 这类选择器，不能当颜色 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

const files = walkCss();

/** 允许出现视觉字面量的文件：令牌清单本身与主题 */
function isVisualHome(relativePath) {
  return relativePath === "tokens.css" || relativePath.startsWith("themes/");
}

/** 视觉函数调用：把 `blur(var(--x))` 这种「参数本身就是令牌」的调用挖掉，
    剩下还有调用的才是硬编码（`filter: blur(var(--a)) brightness(0.5)` 必须被抓到）。 */
const FILTER_FN = /(?:blur|brightness|saturate|contrast|grayscale|sepia|drop-shadow)/;
const FILTER_FN_WITH_VAR = new RegExp(`\\b${FILTER_FN.source}\\(\\s*var\\([^()]*\\)\\s*\\)`, "g");

const LITERAL_RULES = [
  {
    what: "颜色字面量",
    test: (line) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(?:oklch|oklab|lch|lab|hwb)\(/.test(line),
    fix: "改用 var(--…)（颜色一律来自 tokens.css / themes/*.css）",
  },
  {
    what: "硬编码滤镜",
    test: (line) => new RegExp(`\\b${FILTER_FN.source}\\(`).test(line.replace(FILTER_FN_WITH_VAR, "")),
    fix: "改用 var(--panel-blur) / var(--cover-blur) / var(--slider-idle-filter) 这类令牌",
  },
  {
    what: "不引用令牌的 box-shadow",
    test: (line) => {
      const m = /box-shadow\s*:\s*([^;]*)/.exec(line);
      const value = m ? m[1].trim() : "";
      if (!value) return false;
      // 只要值里引用了令牌（或本身就是 none / transparent）就算合规：
      // box-shadow: inset 0 2px 0 var(--accent) 是「用主题色画的插入线」
      return !/var\(|\bnone\b|\btransparent\b|\binherit\b/.test(value);
    },
    fix: "改用 var(--panel-shadow) / var(--neu-*) / var(--focus-ring) 这类令牌",
  },
];

test("非主题 CSS 里不出现视觉字面量（颜色 / 滤镜 / 裸阴影）", () => {
  const bad = [];
  for (const full of files) {
    const path = rel(full);
    if (isVisualHome(path)) continue;
    const lines = stripComments(readFileSync(full, "utf8")).split("\n");
    // 自定义属性声明可以跨行（值里有逗号换行），声明期间整段都算「值的落点」
    let inTokenDecl = false;
    lines.forEach((line, index) => {
      const startsToken = /^\s*--[A-Za-z0-9_-]+\s*:/.test(line);
      if (startsToken) inTokenDecl = true;
      const skipped = inTokenDecl;
      if (line.includes(";")) inTokenDecl = false;
      if (skipped) return;
      for (const rule of LITERAL_RULES) {
        if (rule.test(line)) {
          bad.push(`${path}:${index + 1} [${rule.what}] ${line.trim()}\n      → ${rule.fix}`);
        }
      }
    });
  }
  assert.deepEqual(bad, [], "组件 CSS 只写布局；视觉效果必须走令牌，否则主题改不动它：\n  " + bad.join("\n  "));
});

/**
 * 由 JS 在运行时写入的令牌（写进行内样式或带 !important 的 :root 规则），
 * 因此不会出现在任何 CSS 文件里。新增时请在这里补一行并注明写入方。
 * 键名不带 `--`。
 */
const RUNTIME_TOKENS = new Set([
  "chrome-bg", // player-skins/colors.js → skinhost.applyChrome
  "chrome-bg-soft",
  "chrome-border",
  "chrome-fg",
  "chrome-fg-dim",
  "chrome-hover",
  "chrome-active",
  "cover-bg", // theme.js（当前封面地址）
  "seed", // theme.js（封面取色）
  "seed-2",
  "dl-size", // ui/desktop-lyrics.js（桌面歌词字号）
  "dl-ease", // 桌面歌词窗口（行切换缓动）
  "skin-icon", // 皮肤图标 URL，组件内联传参
  "hit-pad-x", // .u-hit 的可选覆盖，未给时回落到 --hit-pad
  "hit-pad-y",
]);

test("组件引用的令牌都有定义（或在运行时白名单里）", () => {
  const defined = new Set();
  const usedInComponents = new Map(); // name → "file:line"

  for (const full of files) {
    const path = rel(full);
    const raw = stripComments(readFileSync(full, "utf8"));
    for (const m of raw.matchAll(/--([A-Za-z0-9_-]+)\s*:/g)) defined.add(m[1]);
    if (isVisualHome(path)) continue;
    const lines = raw.split("\n");
    lines.forEach((line, index) => {
      for (const m of line.matchAll(/var\(\s*--([A-Za-z0-9_-]+)/g)) {
        if (!usedInComponents.has(m[1])) usedInComponents.set(m[1], `${path}:${index + 1}`);
      }
    });
  }

  const unknown = [...usedInComponents]
    .filter(([name]) => !defined.has(name) && !RUNTIME_TOKENS.has(name))
    .map(([name, where]) => `${where} → var(--${name})`);
  assert.deepEqual(
    unknown,
    [],
    "引用了不存在的令牌（会静默拿到空值，等于没写这条声明）：\n  " + unknown.join("\n  ")
  );
});

test("主题模板把「视觉层」的旋钮列全了", () => {
  const tokens = stripComments(readFileSync(join(stylesRoot, "tokens.css"), "utf8"));
  const template = stripComments(readFileSync(join(stylesRoot, "themes", "_template.css"), "utf8"));

  // 视觉层的命名前缀：遮罩 / 封面虚化 / 小浮层 / 视觉强度 / 定位描边 / 零散阴影与滤镜
  const visualNames = new Set();
  for (const m of tokens.matchAll(/--([A-Za-z0-9_-]+)\s*:/g)) {
    const name = m[1];
    if (/^(?:scrim|cover|op)-/.test(name) || /^(?:veil|scan|popover)-blur$/.test(name)) {
      visualNames.add(name);
    }
  }
  for (const name of [
    "thumb-shadow",
    "accent-hover-filter",
    "slider-idle-filter",
    "locate-dur",
    "locate-ring",
    "locate-ring-mid",
  ]) {
    visualNames.add(name);
  }

  const missing = [...visualNames].filter((name) => !new RegExp(`--${name}\\s*:`).test(template));
  assert.deepEqual(
    missing,
    [],
    "复制 _template.css 改主题的人看不到这些旋钮（等于白建了令牌）：\n  --" + missing.join("\n  --")
  );
});
