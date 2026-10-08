/* ==========================================================================
   tool-api-usage.mjs — 抽取 tools/*.mjs 里通过浏览器动态 import 用到的
   frontend/src/js 模块成员，避免把「只被自检脚本使用」的导出误判为死代码。
   ========================================================================== */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const toolsDir = path.join(ROOT, "tools");

const files = fs
  .readdirSync(toolsDir)
  .filter((f) => /\.(mjs|js)$/.test(f))
  .map((f) => path.join("tools", f));

// import("/js/xxx.js")  →  绑定名
const used = new Map(); // module -> Set(member)

let raw = "";
for (const f of files) raw += "\n" + fs.readFileSync(path.join(ROOT, f), "utf8");

// 1) const { a, b } = await import("/js/m.js")
const destructureRe = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*["'`]\/js\/([\w.-]+)["'`]\s*\)/g;
let m;
while ((m = destructureRe.exec(raw))) {
  const mod = m[2];
  if (!used.has(mod)) used.set(mod, new Set());
  for (const part of m[1].split(",")) {
    const t = part.trim().split(":")[0].trim();
    if (t) used.get(mod).add(t);
  }
}

// 2) const store = await import("/js/m.js")  → 之后 store.xxx 的属性访问
const aliasRe = /(?:const|let|var)\s+([\w$]+)\s*=\s*await\s+import\(\s*["'`]\/js\/([\w.-]+)["'`]\s*\)/g;
while ((m = aliasRe.exec(raw))) {
  const alias = m[1];
  const mod = m[2];
  if (!used.has(mod)) used.set(mod, new Set());
  const propRe = new RegExp(`\\b${alias}\\.([\\w$]+)`, "g");
  let p;
  while ((p = propRe.exec(raw))) used.get(mod).add(p[1]);
}

// 3) import("/js/m.js") 后接 .then((m) => m.xxx)
const thenRe = /import\(\s*["'`]\/js\/([\w.-]+)["'`]\s*\)\.then\(\s*\(?\s*([\w$]+)\s*\)?\s*=>\s*([\w$]+)\.([\w$]+)/g;
while ((m = thenRe.exec(raw))) {
  const mod = m[1];
  if (!used.has(mod)) used.set(mod, new Set());
  used.get(mod).add(m[4]);
}

// 4) 内联字符串里的 store.xxx / module.xxx（ui-playlist 那种把整段代码当字符串塞进 CDP）
const inlineAliasRe = /(?:const|let|var)\s+([\w$]+)\s*=\s*await\s+import\(\s*["'`]\/js\/([\w.-]+)["'`]\s*\)/g;
// 已由 (2) 覆盖；这里额外扫 store. 前缀在长字符串中的用法
const stringStoreRe = /\bstore\.([\w$]+)/g;
while ((m = stringStoreRe.exec(raw))) {
  if (!used.has("store.js")) used.set("store.js", new Set());
  used.get("store.js").add(m[1]);
}

console.log("=".repeat(78));
console.log("tools/ 通过浏览器动态 import 使用的应用模块成员");
console.log("=".repeat(78));
for (const [mod, members] of [...used].sort()) {
  console.log(`\n### /js/${mod}  (${members.size})`);
  console.log("  " + [...members].sort().join(", "));
}

fs.writeFileSync(
  path.join(ROOT, ".tmp-audit", "tool-api-usage.json"),
  JSON.stringify(Object.fromEntries([...used].map(([k, v]) => [k, [...v].sort()])), null, 2),
  "utf8",
);
