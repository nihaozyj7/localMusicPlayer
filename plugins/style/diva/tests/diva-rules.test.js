/* ==========================================================================
   diva/tests/diva-rules.test.js — 样式包的「契约纪律」静态扫描（lead 维护）
   --------------------------------------------------------------------------
   这一份不测画面，只钉住那些改一眼看不出来、坏了却很难查的东西：
     · 包结构 / 清单字段 / 图标 / 主题令牌完整性；
     · 契约 v3 的硬约束：零裸包名 import、不碰 window / documentElement、
       不发网络请求、不 eval、不用 setInterval、CSS 不越权（:root / body /
       !important / 作用域前缀 / @keyframes）；
     · 入口的 ?t= 透传（/skins/ 逐文件鉴权，静态 import 会 403）；
     · 观测用的 data-* 与自检脚本对得上。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const ROOT = path.resolve(PKG, "..", "..", "..");
const read = (rel) => readFileSync(path.join(PKG, rel), "utf8");

const MANIFEST = JSON.parse(read("skin.json"));
const ENTRY = read("skin.js");
const CSS_RAW = read("skin.css");
// 注释里会解释「宿主包成 @layer/@scope(.playerview[data-skin=…])」这类事实，
// 静态扫描只看**真正会生效的声明**，注释先剥掉。
const CSS = CSS_RAW.replace(/\/\*[\s\S]*?\*\//g, "");
const LIB_FILES = ["lib/config.js", "lib/util.js", "lib/diva.js", "lib/stage.js", "lib/spectrum.js", "lib/lyrics.js", "lib/hud.js", "lib/palette.js"];

const exists = (rel) => existsSync(path.join(PKG, rel));

/* -------------------------------------------------------------------------- */
test("包结构齐全（S1）：清单 / 入口 / 样式 / 图标 / 模块 / 自有测试 / README", () => {
  for (const rel of [
    "skin.json",
    "skin.js",
    "skin.css",
    "assets/icon.svg",
    "README.md",
    ...LIB_FILES,
    "tests/diva-rules.test.js",
    "tests/diva-check.mjs",
  ]) {
    assert.ok(exists(rel), `缺少文件：${rel}`);
  }
  assert.ok(statSync(path.join(PKG, "assets/icon.svg")).size > 100, "图标太小，可能是空文件");
});

test("清单字段合法（S5）：id 与目录一致、apiVersion 3.0、order ≥ 200、三色齐全", () => {
  assert.equal(MANIFEST.id, path.basename(PKG));
  assert.equal(MANIFEST.apiVersion, "3.0");
  assert.match(MANIFEST.version, /^\d+\.\d+\.\d+$/);
  assert.ok(Number(MANIFEST.order) >= 200, "第三方样式 order 必须 ≥ 200");
  assert.equal(MANIFEST.capabilities.spectrum, true);
  assert.equal(MANIFEST.capabilities.background, true);
  assert.equal(MANIFEST.capabilities.interactive, true);
  assert.equal(MANIFEST.entry, "skin.js");
  assert.deepEqual(MANIFEST.styles, ["skin.css"]);
  assert.equal(MANIFEST.icon.file, "assets/icon.svg");
  for (const key of ["bg", "fg", "accent"]) {
    assert.match(MANIFEST.colors[key], /^#[0-9a-f]{6}$/i, `colors.${key} 必须是 6 位 hex`);
  }
  // 清单的 budgetFps 与 config.js 必须一致（两处数字各写各的会静默分叉）
  const cfg = read("lib/config.js");
  const m = /budgetFps:\s*(\d+)/.exec(cfg);
  assert.ok(m, "config.js 里没有 budgetFps");
  assert.equal(Number(m[1]), Number(MANIFEST.performance.budgetFps));
});

test("图标是单色线稿（宿主用 mask + currentColor 上色）", () => {
  const svg = read("assets/icon.svg");
  assert.match(svg, /viewBox="0 0 24 24"/);
  assert.match(svg, /stroke="currentColor"/);
  assert.doesNotMatch(svg, /<image|url\(|base64/i, "图标里不能嵌位图");
});

/* -------------------------------------------------------------------------- */
test("零裸包名 import：只允许包内相对路径 + entry 的 lib 子模块", () => {
  const files = ["skin.js", ...LIB_FILES];
  for (const rel of files) {
    const src = read(rel);
    const specs = [...src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
    for (const spec of specs) {
      assert.ok(
        spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("./lib/"),
        `${rel}: 非法 import "${spec}"（插件零裸包名/宿主 import）`
      );
    }
  }
});

test("入口用 await import() + ?t= 透传（/skins/ 逐文件鉴权）", () => {
  assert.match(ENTRY, /new URL\(import\.meta\.url\)\.search/, "entry 必须读取 import.meta.url 的 query");
  assert.match(ENTRY, /await\s+load\(/, "子模块必须通过透传 query 的 load() 加载");
  // 静态 import 会丢掉 query → 403；入口里除注释外不应有静态 import
  const staticImports = [...ENTRY.matchAll(/^\s*import\s+[^("]/gm)];
  assert.equal(staticImports.length, 0, "entry 里出现了静态 import（会丢 ?t= token）");
});

test("契约硬边界（S4）：lib 不碰 window / documentElement / fetch / eval / setInterval", () => {
  for (const rel of ["skin.js", ...LIB_FILES]) {
    const src = read(rel);
    // 允许 document.createElement（画布离屏缓存），但禁止拿 documentElement / 整窗对象
    assert.doesNotMatch(src, /\bwindow\./, `${rel}: 出现了 window.*`);
    assert.doesNotMatch(src, /document\.documentElement/, `${rel}: 出现了 document.documentElement`);
    assert.doesNotMatch(src, /\bfetch\s*\(/, `${rel}: 出现了 fetch()`);
    assert.doesNotMatch(src, /XMLHttpRequest/, `${rel}: 出现了 XMLHttpRequest`);
    assert.doesNotMatch(src, /\beval\s*\(/, `${rel}: 出现了 eval()`);
    assert.doesNotMatch(src, /\bsetInterval\s*\(/, `${rel}: 动画不许用 setInterval`);
    assert.doesNotMatch(src, /new\s+Function\s*\(/, `${rel}: 出现了 new Function()`);
    assert.doesNotMatch(src, /Math\.random\s*\(/, `${rel}: 画面必须确定性（用 mulberry32）`);
    assert.doesNotMatch(src, /mode:\s*["'](?:no-cors|cors)["']/, `${rel}: 不应发跨域请求`);
  }
});

test("只有 entry 持有 rAF：lib 里不许再开帧循环", () => {
  assert.match(ENTRY, /requestAnimationFrame/);
  for (const rel of LIB_FILES) {
    if (rel === "lib/util.js") continue;
    assert.doesNotMatch(read(rel), /requestAnimationFrame/, `${rel}: lib 里出现了 requestAnimationFrame（应只由 entry 驱动）`);
  }
});

test("性能红线：全包不许 shadowBlur / 全屏 filter / 位图素材", () => {
  for (const rel of ["skin.js", ...LIB_FILES]) {
    const src = read(rel);
    assert.doesNotMatch(src, /shadowBlur\s*=/, `${rel}: 不许用 shadowBlur（全屏光晕是帧率杀手）`);
    assert.doesNotMatch(src, /\.filter\s*=\s*["']blur/, `${rel}: 不许给画布挂 filter`);
  }
  for (const rel of LIB_FILES) {
    const src = read(rel);
    assert.doesNotMatch(src, /\.(png|jpe?g|webp|gif|woff2?|ttf|otf)["']/i, `${rel}: 不应引用图片/字体素材（人物与舞台全程序化绘制）`);
  }
});

test("frame 快照字段与 entry 契约一致（stage/diva 只读这些）", () => {
  const src = read("skin.js");
  for (const field of [
    "w",
    "h",
    "dpr",
    "t",
    "dt",
    "now",
    "layout",
    "playing",
    "pos",
    "duration",
    "progress",
    "lyricIndex",
    "reduced",
    "perf",
    "palette",
    "spec",
    "beat",
    "energy",
  ]) {
    assert.ok(new RegExp(`\\b${field}\\s*:`).test(src) || src.includes(`f.${field}`), `entry 没有填 frame.${field}`);
  }
  assert.match(src, /st\.stage\.drawBack\(/);
  assert.match(src, /st\.diva\.draw\(/);
  assert.match(src, /st\.stage\.drawFront\(/);
});

/* -------------------------------------------------------------------------- */
test("CSS 不越权（S4）：无 :root / html / body / * / !important / 作用域前缀 / @keyframes", () => {
  assert.doesNotMatch(CSS, /:root\b/, "CSS 里不许写 :root");  assert.doesNotMatch(CSS, /(^|[\s,}])html[\s,{:.]/m, "CSS 里不许写 html");
  assert.doesNotMatch(CSS, /(^|[\s,}])body[\s,{:.]/m, "CSS 里不许写 body");
  assert.doesNotMatch(CSS, /!important/, "CSS 里不许写 !important");
  assert.doesNotMatch(CSS, /@keyframes/i, "本包不使用 @keyframes（@scope 下的键帧不可靠，节奏由 JS 驱动）");
  assert.doesNotMatch(CSS, /\.playerview\[data-skin=/, "选择器相对舞台根写，不要带 .playerview 前缀");
  assert.doesNotMatch(CSS, /\.skin-bg\[data-skin=/, "选择器相对舞台根写，不要带 .skin-bg 前缀");
  assert.match(CSS, /^:scope\s*\{/m, "舞台自身必须用 :scope（伪类）声明兜底");
});

test("安全区（S11）：HUD 与歌词的 padding 用 --skin-inset-*，且窄窗覆盖也带过去", () => {
  const insets = [...CSS.matchAll(/--skin-inset-(top|bottom)/g)].map((m) => m[1]);
  assert.ok(insets.includes("top") && insets.includes("bottom"), "CSS 没有让开宿主壳");
  // 每一处覆盖**外框容器** padding 的窄窗规则都必须继续带安全区；
  // 徽章 / 时间码这类容器内部的 padding 不承担安全区，允许单独收。
  const SAFE_OWNERS = /\.dv-hud\b(?!__)|\.dv__lyrics\b|\.dv-lrc\b|\.dv__hint\b|\.dv__frame\b/;
  for (const m of CSS.matchAll(/([^{}]*data-dv-(?:narrow|tiny)[^{}]*)\{([^}]*)\}/g)) {
    const selector = m[1];
    const block = m[2];
    if (!/padding\s*:/.test(block)) continue;
    if (!SAFE_OWNERS.test(selector)) continue;
    assert.match(block, /var\(--skin-inset-(top|bottom)/, `窄窗规则吃掉了安全区：${selector.trim()}`);
  }
  // lyrics 容器底部内边距必须让开底栏
  assert.match(CSS, /\.dv__lyrics\s*\{[^}]*padding:[^;]*var\(--skin-inset-bottom/);
});

test("主题令牌完整：holo-diva.css 覆盖 _template.css 的全部视觉令牌", () => {
  const themePath = path.join(ROOT, "plugins", "theme", "holo-diva.css");
  assert.ok(existsSync(themePath), "缺少 plugins/theme/holo-diva.css");
  const theme = readFileSync(themePath, "utf8");
  const template = readFileSync(path.join(ROOT, "frontend", "src", "styles", "themes", "_template.css"), "utf8");
  const LAYOUT_TOKENS = new Set([
    "--h-titlebar",
    "--w-sidebar",
    "--h-playerbar",
    "--h-header",
    "--row-h",
    "--row-h-compact",
  ]);
  const tokens = new Set([...template.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]));
  assert.ok(tokens.size > 60, "模板令牌解析失败");
  const missing = [...tokens].filter((t) => !theme.includes(t) && !LAYOUT_TOKENS.has(t));
  assert.deepEqual(missing, [], `主题缺令牌：${missing.join(", ")}`);
  assert.match(theme, /:root\[data-theme="holo-diva"\]/);
  assert.match(theme, /@theme-name\s+\S+/);
  assert.match(theme, /@theme-mode\s+dark/);
  assert.match(theme, /@theme-swatch\s+(#[0-9a-f]{6}\s*){5}/i);
});

/* -------------------------------------------------------------------------- */
test("自检脚本约定：diva-check.mjs 自带静态服务 + 假宿主，不依赖项目源码", () => {
  const check = read("tests/diva-check.mjs");
  assert.match(check, /createServer/, "check 脚本必须自带静态服务");
  assert.match(check, /diva/, "check 脚本必须指向 diva 皮肤");
  assert.doesNotMatch(check, /frontend\/src\/js\/store\.js/, "check 脚本不许 import 宿主 store（会拿到空实例）");
  assert.doesNotMatch(check, /from "\.\.\/\.\.\/\.\.\/tools\//, "check 脚本不要跨目录依赖项目 tools");
});

test("观测约定：data-dv-* 与 README 里写的一致", () => {
  const readme = read("README.md");
  for (const attr of ["data-dv-ready", "data-dv-frames", "data-dv-idle", "data-dv-spec", "data-dv-anim"]) {
    assert.ok(ENTRY.includes(attr) || CSS.includes(attr), `entry/CSS 没有写 ${attr}`);
    assert.ok(readme.includes(attr), `README 没有记录 ${attr}（自检要按它断言）`);
  }
});
