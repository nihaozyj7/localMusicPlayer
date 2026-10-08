/* ==========================================================================
   js-usage.mjs — 前端 ESM 导出符号使用情况静态分析（审查用，非项目产物）
   --------------------------------------------------------------------------
   做法：
     1. 扫描 frontend/src/js、frontend/packages/player-skins/src、frontend/tests
        中所有 .js，抽取每个模块的 export 声明（named / default / re-export）。
     2. 对每个导出名，在整个待审代码库中做「标识符出现」计数（词边界正则），
        再排除其自身声明行，得到“被引用次数”。
     3. 额外区分：是否被 src 引用 / 是否只被 tests 引用 / 是否零引用。
   局限（重要，报告里必须如实说明）：
     · 这是**文本级**引用统计，不是类型级 LSP 引用；同名符号会互相“借光”，
       因此 0 引用是强信号，>0 引用是弱信号，需要人工核对。
     · 动态属性访问（obj[name]）、字符串形式的调用（bindings JSON 里的方法名）
       无法被此法捕获，须单独人工排查。
   ========================================================================== */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const SCAN_DIRS = [
  "frontend/src/js",
  "frontend/packages/player-skins/src",
  "frontend/src",
  "frontend/tests",
];

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      walk(rel, out);
    } else if (e.name.endsWith(".js") || e.name.endsWith(".mjs")) {
      out.push(rel.replace(/\\/g, "/"));
    }
  }
  return out;
}

const files = [...new Set(SCAN_DIRS.flatMap((d) => walk(d)))].sort();

/* ---------- 1. 抽取导出 ---------- */

const EXPORT_RE = [
  // export function foo / export async function foo
  { kind: "function", re: /^\s*export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm },
  // export class Foo
  { kind: "class", re: /^\s*export\s+class\s+([A-Za-z_$][\w$]*)/gm },
  // export const/let/var foo
  { kind: "variable", re: /^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm },
  // export default ...
  { kind: "default", re: /^\s*export\s+default\b/gm },
];

// export { a, b as c }
const EXPORT_LIST_RE = /^\s*export\s*\{([^}]*)\}/gm;
// export * from / export { x } from
const REEXPORT_FROM_RE = /^\s*export\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/gm;

function extractExports(src) {
  const found = [];
  for (const { kind, re } of EXPORT_RE) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      found.push(kind === "default" ? { kind, name: "default" } : { kind, name: m[1] });
    }
  }
  EXPORT_LIST_RE.lastIndex = 0;
  let m;
  while ((m = EXPORT_LIST_RE.exec(src))) {
    for (const part of m[1].split(",")) {
      const t = part.trim();
      if (!t) continue;
      const asMatch = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(t);
      found.push({ kind: "list", name: asMatch ? asMatch[2] : t, local: asMatch ? asMatch[1] : t });
    }
  }
  return found;
}

/* ---------- 2. 全库词边界计数 ---------- */

const allText = new Map(); // file -> content
for (const f of files) allText.set(f, fs.readFileSync(path.join(ROOT, f), "utf8"));

const SRC_FILES = files.filter((f) => !f.startsWith("frontend/tests"));
const TEST_FILES = files.filter((f) => f.startsWith("frontend/tests"));

function countRefs(name, pool) {
  const re = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, "\\$")}(?![\\w$])`, "g");
  let n = 0;
  const where = [];
  for (const f of pool) {
    const c = allText.get(f) || "";
    const hits = (c.match(re) || []).length;
    if (hits) {
      n += hits;
      where.push(`${f}:${hits}`);
    }
  }
  return { n, where };
}

/* ---------- 3. 逐个文件输出 ---------- */

const report = [];
for (const f of files) {
  const src = allText.get(f);
  const exps = extractExports(src);
  if (!exps.length) continue;

  // 导出声明所在行号，用于从“自引用”里排除
  const lines = src.split(/\r?\n/);
  const rows = [];
  for (const e of exps) {
    const selfRe = new RegExp(`(?<![\\w$.])${(e.local || e.name).replace(/\$/g, "\\$")}(?![\\w$])`, "g");
    const selfCount = (src.match(selfRe) || []).length;
    const srcRefs = countRefs(e.name, SRC_FILES.filter((x) => x !== f));
    const tstRefs = countRefs(e.name, TEST_FILES);
    const totalOther = srcRefs.n + tstRefs.n;
    const localUses = selfCount - 1; // 减掉声明本身
    rows.push({
      name: e.name,
      kind: e.kind,
      selfFileUses: localUses,
      srcRefs: srcRefs.n,
      testRefs: tstRefs.n,
      srcWhere: srcRefs.where,
      testWhere: tstRefs.where,
      verdict:
        totalOther === 0
          ? localUses <= 0
            ? "DEAD" // 文件外零引用、文件内也只有声明
            : "FILE_LOCAL_ONLY" // 只在本文件内用；导出可能多余
          : tstRefs.n > 0 && srcRefs.n === 0
            ? "TEST_ONLY"
            : "USED",
    });
  }
  report.push({ file: f, exports: rows });
}

/* ---------- 4. 汇总打印 ---------- */

const flat = report.flatMap((r) => r.exports.map((e) => ({ ...e, file: r.file })));

function printGroup(title, list) {
  console.log(`\n### ${title}  (${list.length})`);
  for (const e of list) {
    console.log(
      `  ${e.file}  ::  ${e.name}  [${e.kind}]  src=${e.srcRefs} test=${e.testRefs} local=${e.selfFileUses}`,
    );
    if (e.srcWhere) console.log(`        src:  ${e.srcWhere.join(", ")}`);
    if (e.testWhere) console.log(`        test: ${e.testWhere.join(", ")}`);
  }
}

console.log("=".repeat(78));
console.log("前端导出符号使用情况（文本级引用统计）");
console.log("=".repeat(78));
console.log(`扫描文件数: ${files.length}  (src ${SRC_FILES.length} / tests ${TEST_FILES.length})`);
console.log(`导出符号总数: ${flat.length}`);

printGroup("A. DEAD — 全库零引用（含本文件内也未使用）", flat.filter((e) => e.verdict === "DEAD"));
printGroup("B. FILE_LOCAL_ONLY — 仅本文件内使用，导出关键字多余", flat.filter((e) => e.verdict === "FILE_LOCAL_ONLY"));
printGroup("C. TEST_ONLY — 只有单测引用，生产代码无引用", flat.filter((e) => e.verdict === "TEST_ONLY"));

fs.writeFileSync(
  path.join(ROOT, ".tmp-audit", "js-usage.json"),
  JSON.stringify(report, null, 2),
  "utf8",
);
console.log("\n[写入] .tmp-audit/js-usage.json");
