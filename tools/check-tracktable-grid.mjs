/* ==========================================================================
   check-tracktable-grid.mjs — 校验 tracktable.css 里「表头 / 数据行」网格列一致性
   --------------------------------------------------------------------------
   为什么需要它：表头与数据行的 grid-template-columns 只要有一处对不上，
   表头每个单元格就会整体错位一格（看起来像标题钻进了正文），
   而浏览器不会报任何错。本文件历史上已经因为这个问题坏过两次：
     · 同一媒体查询里对同一选择器声明了两次（后一条覆盖前一条）
     · 表头与数据行共用一条规则，但两者列数本来就该不同（行多一个封面列）
   所以这里做机械化校验：
     1. 媒体查询内不得对同一选择器重复声明 grid-template-columns
     2. 每个断点（含无媒体查询的基线）内，表头与其对应数据行的列数必须相等
   用法：node tools/check-tracktable-grid.mjs
   ========================================================================== */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = join(root, "frontend/src/styles/components/tracktable.css");
const css = readFileSync(cssPath, "utf8");

/* 逐字符扫描，拿到每条「选择器 { 声明 }」及其所处的媒体查询与行号。
   去掉注释，避免注释里的花括号干扰。
   注意：@media 自身也用花括号，但它只是「块的开始」，不是规则，
   内部的选择器规则要分别取出——解析时用 inMedia 标记区分。 */
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

const rules = [];
let buf = "";
let line = 1;
let inMedia = false;
let currentMedia = "(baseline)";
let ruleDepth = 0; // >0 表示正在某条规则的声明体内部

for (let i = 0; i < noComments.length; i++) {
  const ch = noComments[i];
  if (ch === "\n") line++;
  if (ch === "{") {
    const head = buf.trim();
    buf = "";
    if (head.startsWith("@media")) {
      // 媒体查询块开始：记住条件，内部规则稍后逐个取出
      inMedia = true;
      currentMedia = head;
      continue;
    }
    if (head.startsWith("@")) {
      // 其它 at-rule（@supports 等）：透明处理，继续往里读
      continue;
    }
    // 普通规则：读出声明体（用 ruleDepth 与块本身的花括号区分开）
    ruleDepth = 1;
    let j = i + 1;
    let decl = "";
    for (; j < noComments.length && ruleDepth > 0; j++) {
      const c = noComments[j];
      if (c === "\n") line++;
      if (c === "{") ruleDepth++;
      else if (c === "}") ruleDepth--;
      if (ruleDepth > 0) decl += c;
    }
    rules.push({ media: currentMedia, selector: head, decl, line });
    i = j - 1;
    continue;
  }
  if (ch === "}") {
    // 不在规则体内却遇到闭合花括号 → 这是 @media 块的结束
    if (inMedia && ruleDepth === 0) {
      inMedia = false;
      currentMedia = "(baseline)";
    }
    buf = "";
    continue;
  }
  buf += ch;
}

const colsOf = (decl) => {
  const m = decl.match(/grid-template-columns\s*:\s*([^;]+);/);
  if (!m) return null;
  const tokens = m[1].trim().split(/\s+/).filter(Boolean);
  // minmax(0, 1fr) 会被空格切开，重新合并
  const merged = [];
  for (let k = 0; k < tokens.length; k++) {
    if (tokens[k].startsWith("minmax(") && !tokens[k].includes(")")) {
      merged.push(tokens[k] + " " + tokens[k + 1]);
      k++;
    } else if (tokens[k] === "minmax(0,") {
      merged.push(tokens[k] + " " + tokens[k + 1]);
      k++;
    } else merged.push(tokens[k]);
  }
  return merged;
};

const gridRules = rules.filter((r) => colsOf(r.decl));
const problems = [];

/* —— 校验 1：同一断点内，同一选择器不得重复声明 —— */
/* 一条规则可能带逗号分隔的多个选择器，要逐个拆开看。 */
const splitSelectors = (sel) =>
  sel
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const seen = new Map();
for (const r of gridRules) {
  for (const one of splitSelectors(r.selector)) {
    const key = r.media + " || " + one;
    if (seen.has(key)) {
      problems.push(
        `重复声明：${r.media} 内选择器「${one}」在第 ${seen.get(key)} 行和第 ${r.line} 行各声明了一次，` +
          `后者会覆盖前者`
      );
    } else {
      seen.set(key, r.line);
    }
  }
}

/* —— 校验 2：每个断点内，表头与对应数据行的列数必须相等 ——
   做法：把断点内所有规则按「单个选择器」展开，分别收集表头与数据行，
   再按 data-mode 配对（library 配 library、playlist 配 playlist、
   无 mode 的通用选择器互相配对）。 */
const isHead = (sel) => /\.tracks__head/.test(sel);
const isRow = (sel) => /\.track\b/.test(sel) && !/__/.test(sel);
const modeOf = (sel) => {
  if (/data-mode="library"/.test(sel)) return "library";
  if (/data-mode="playlist"/.test(sel)) return "playlist";
  return "any";
};

const byMedia = new Map();
for (const r of gridRules) {
  if (!byMedia.has(r.media)) byMedia.set(r.media, []);
  byMedia.get(r.media).push(r);
}

/** 在某个断点内，取「某个选择器生效的那条规则」——即最后一条匹配的 */
function effRules(list, want) {
  const out = new Map();
  for (const r of list) {
    for (const one of splitSelectors(r.selector)) {
      const head = isHead(one);
      const row = isRow(one);
      if (want === "head" && !head) continue;
      if (want === "row" && !row) continue;
      out.set(one, r); // 后面的覆盖前面的，等价于 CSS 层叠
    }
  }
  return out;
}

/** 按模式分组：只会把**同模式**的表头与数据行配成一对。
    不能让「any」兜底去配别的模式——那会把 library 的表头配到 playlist 的行上，
    列数不同却掩盖了真正的错位（等于假绿灯）。 */
function groupByMode(entries) {
  const g = { library: [], playlist: [], any: [] };
  for (const [sel, rule] of entries) g[modeOf(sel)].push({ sel, rule });
  return g;
}

const comparisons = [];

for (const [media, list] of byMedia) {
  const heads = groupByMode(effRules(list, "head"));
  const rows = groupByMode(effRules(list, "row"));

  for (const mode of ["any", "library", "playlist"]) {
    // 同一模式内必须恰好各有一条表头规则和一条数据行规则，否则选择器写漏了
    if (heads[mode].length > 1) {
      problems.push(`${media}：模式「${mode}」有多条表头规则，无法确定生效项`);
    }
    if (!heads[mode].length) continue;

    const h = heads[mode][heads[mode].length - 1];
    if (!rows[mode].length) {
      // 只在本模式确实有数据行时才要求配对；某模式该断点不涉及则跳过
      continue;
    }
    const rowRule = rows[mode][rows[mode].length - 1];
    const hcols = colsOf(h.rule.decl);
    const rcols = colsOf(rowRule.rule.decl);
    comparisons.push({
      media,
      mode,
      headSel: h.sel,
      headCols: hcols.length,
      rowSel: rowRule.sel,
      rowCols: rcols.length,
      ok: hcols.length === rcols.length,
    });
    if (hcols.length !== rcols.length) {
      problems.push(
        `${media}｜${mode}：表头「${h.sel}」${hcols.length} 列 / 行「${rowRule.sel}」` +
          `${rcols.length} 列，表头会错位一格`
      );
    }
  }
}

/* —— 报告 —— */
console.log(`扫描 ${cssPath}`);
console.log(`共 ${gridRules.length} 条 grid-template-columns 规则，${byMedia.size} 个断点\n`);

console.log("逐条规则：");
for (const [media, list] of byMedia) {
  console.log(`  ${media}`);
  for (const r of list) {
    const sels = splitSelectors(r.selector).join(", ");
    console.log(`    L${String(r.line).padStart(4)}  ${String(colsOf(r.decl).length).padStart(2)} 列  ${sels}`);
  }
}

console.log("\n表头 ↔ 数据行 配对校验：");
for (const c of comparisons) {
  const mark = c.ok ? "✓" : "✗";
  console.log(
    `  ${mark} ${c.media}｜${c.mode.padEnd(8)} 表头 ${String(c.headCols).padStart(2)} 列` +
      `  ↔  行 ${String(c.rowCols).padStart(2)} 列`
  );
}

if (problems.length) {
  console.log(`\n✗ 发现 ${problems.length} 个问题：`);
  for (const p of problems) console.log("  · " + p);
  process.exit(1);
}
console.log("\n✓ 每个断点的表头与数据行列数一致，且无重复声明");
