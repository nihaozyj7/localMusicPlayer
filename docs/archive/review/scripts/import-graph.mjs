/* ==========================================================================
   import-graph.mjs — 前端 ESM 导入图（审查用）
   判断：哪些 .js 模块从未被任何“入口”可达地导入（真孤儿）。
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
    else if (/\.(js|mjs|html)$/.test(e.name)) out.push(rel);
  }
  return out;
}

const files = [
  ...walk("frontend/src"),
  ...walk("frontend/packages/player-skins/src"),
  ...walk("frontend/tests"),
];

const IMPORT_RE = /(?:^|[^\w])(?:import|export)\s[^;'"]*?from\s*["']([^"']+)["']/g;
const BARE_IMPORT_RE = /(?:^|[^\w])import\s*["']([^"']+)["']/g;
// 动态 import("...") —— 静态分析抓不到的话会误判成死代码，必须一并收集
const DYNAMIC_IMPORT_RE = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
// HTML <script type=module src=...>
const HTML_SRC_RE = /<script[^>]*\bsrc\s*=\s*["']([^"']+)["']/g;

const graph = new Map(); // file -> Set(imported files)

// 裸标识符 → 工作区包入口（对应 vite.config.js 的 alias）
const BARE_ALIASES = {
  "@localmusicplayer/player-skins": "frontend/packages/player-skins/src/index.js",
  "@localmusicplayer/player-skins/contract": "frontend/packages/player-skins/src/contract.js",
  "@localmusicplayer/player-skins/lyrics-view": "frontend/packages/player-skins/src/lyrics-view.js",
};

function resolve(from, spec) {
  if (BARE_ALIASES[spec]) return BARE_ALIASES[spec];
  if (!spec.startsWith(".")) return null; // 其它裸模块（node 内置等）
  let p = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  const cands = [p, p + ".js", p + ".mjs", p + "/index.js"];
  for (const c of cands) if (files.includes(c)) return c;
  return p; // 未解析到
}

for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  const set = new Set();
  for (const re of [IMPORT_RE, BARE_IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const r = resolve(f, m[1]);
      if (r) set.add(r);
    }
  }
  if (f.endsWith(".html")) {
    HTML_SRC_RE.lastIndex = 0;
    let m;
    while ((m = HTML_SRC_RE.exec(src))) {
      const r = resolve(f, m[1]);
      if (r) set.add(r);
    }
  }
  graph.set(f, set);
}

/* 入口：html 文件 + 测试文件（测试也是“使用者”） */
const entries = files.filter((f) => f.endsWith(".html") || f.startsWith("frontend/tests/"));

/* 可达性遍历 */
const reachable = new Set(entries);
const queue = [...entries];
while (queue.length) {
  const cur = queue.pop();
  for (const nxt of graph.get(cur) || []) {
    if (!reachable.has(nxt)) {
      reachable.add(nxt);
      queue.push(nxt);
    }
  }
}

const allSrc = files.filter((f) => !f.endsWith(".html"));
const orphans = allSrc.filter((f) => !reachable.has(f));

console.log("=".repeat(78));
console.log("前端 ESM 导入图 — 不可达模块（孤儿）");
console.log("=".repeat(78));
console.log(`入口: ${entries.join(", ")}`);
console.log(`模块总数: ${allSrc.length}   可达: ${allSrc.length - orphans.length}`);
console.log(`\n### 不可达模块 (${orphans.length})`);
for (const o of orphans) {
  // 谁提到过它（字符串层面）
  const mentions = [];
  for (const f of files) {
    if (f === o) continue;
    const s = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (s.includes(path.posix.basename(o))) mentions.push(f);
  }
  console.log(`  ${o}`);
  console.log(`        被文本提及: ${mentions.length ? mentions.join(", ") : "（无）"}`);
}

/* 额外：被 import 但文件不存在的悬空引用 */
console.log(`\n### 悬空导入（指向不存在的文件）`);
let any = false;
for (const [f, set] of graph) {
  for (const t of set) {
    if (!files.includes(t)) {
      console.log(`  ${f}  ->  ${t}   (不存在)`);
      any = true;
    }
  }
}
if (!any) console.log("  （无）");
