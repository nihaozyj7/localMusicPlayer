/* ==========================================================================
   css-usage.mjs — CSS 自定义属性（--var）定义/使用统计（审查用）
   找出：定义了但从未被任何 var() 引用的自定义属性（死变量）。
   ========================================================================== */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const rel = path.join(dir, e.name).replace(/\\/g, "/");
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(css|js|html)$/.test(e.name)) out.push(rel);
  }
  return out;
}

const dirs = [
  "frontend/src/styles",
  "frontend/src/js",
  "frontend/packages/player-skins/src",
  "frontend/src",
  "internal/theme/builtin",
  "internal/skins/template",
];

const files = [...new Set(dirs.flatMap((d) => walk(d)))];

// 定义：--name: value   （在 CSS 里以 -- 开头且后跟冒号）
const DEF_RE = /(^|[;{\s])(--[A-Za-z0-9_-]+)\s*:/g;
// 使用：var(--name)
const USE_RE = /var\(\s*(--[A-Za-z0-9_-]+)/g;
// JS 里也可能 setProperty("--name", ...) / --name 出现在模板串
const JS_DEF_RE = /["'`](--[A-Za-z0-9_-]+)["'`]/g;
const JS_SET_RE = /setProperty\(\s*["'`](--[A-Za-z0-9_-]+)["'`]/g;

const defs = new Map(); // var -> Set(files)
const uses = new Map(); // var -> count

for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  if (f.endsWith(".css")) {
    DEF_RE.lastIndex = 0;
    let m;
    while ((m = DEF_RE.exec(src))) {
      if (!defs.has(m[2])) defs.set(m[2], new Set());
      defs.get(m[2]).add(f);
    }
  }
  for (const re of [USE_RE, JS_SET_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) uses.set(m[1], (uses.get(m[1]) || 0) + 1);
  }
  if (!f.endsWith(".css")) {
    JS_DEF_RE.lastIndex = 0;
    let m;
    while ((m = JS_DEF_RE.exec(src))) {
      if (!defs.has(m[1])) defs.set(m[1], new Set());
      defs.get(m[1]).add(f + " (JS)");
    }
  }
}

const dead = [...defs.keys()].filter((v) => !uses.has(v)).sort();
const used = [...defs.keys()].filter((v) => uses.has(v));

console.log("=".repeat(78));
console.log("CSS 自定义属性统计");
console.log("=".repeat(78));
console.log(`扫描 ${files.length} 个文件；定义 ${defs.size} 个变量；被 var() 引用 ${used.length} 个`);
console.log(`\n### 定义了但从未被 var()/setProperty 引用 (${dead.length})`);
for (const v of dead) {
  console.log(`  ${v}`);
  console.log(`        定义处: ${[...defs.get(v)].join(", ")}`);
}
