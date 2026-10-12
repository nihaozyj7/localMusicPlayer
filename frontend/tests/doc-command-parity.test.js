/* ==========================================================================
   doc-command-parity.test.js — 文档里写的 `npm run X` 必须真的存在

   守的是一类「文档承诺了、代码里没有」的缺陷：命令写错一个字母、脚本被改名、
   或者干脆从来没建出来 —— 读者照着敲一条 `npm run dev:static` 却拿到
   `npm error Missing script`，然后开始怀疑是不是自己环境有问题。

   真实案例（第六轮审查 §4.2 与登记项 70）：`AGENTS.md` / `README.md` /
   `docs/19-开发说明.md` 三处都把 `npm run dev:static` 写成「无头自检请用这个」，
   而 `package.json` 里**没有这个脚本**（静态预览只能敲
   `node tools/dev-server.js 5173`，或者绕到 Taskfile 的 `dev:frontend:static`）。
   这不是「文档不够详细」，而是文档把一条**不存在的命令**推给了每一个新来的读者。

   扫描范围只含「现在仍然成立」的文档：根目录的 `AGENTS.md` / `README.md`、
   `plugins/README.md`、`docs/*.md`（**不含** `docs/archive/` —— 那里的历史报告
   描述的是过期快照，本来就不保证命令还在）、皮肤包说明。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

/** 文档里出现的 `npm run <name>`。 */
const NPM_RUN = /npm run ([A-Za-z][\w:-]*)/g;

function docFiles() {
  const docsDir = join(root, "docs");
  const topLevel = readdirSync(docsDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join("docs", name));
  return [
    "AGENTS.md",
    "README.md",
    "plugins/README.md",
    join("internal", "skins", "template", "皮肤说明.md"),
    ...topLevel,
  ];
}

test("文档里的 npm run <script> 都能在 package.json 里找到", () => {
  const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts ?? {};
  const missing = [];
  for (const rel of docFiles()) {
    const text = readFileSync(join(root, rel), "utf8");
    for (const m of text.matchAll(NPM_RUN)) {
      if (!Object.hasOwn(scripts, m[1])) missing.push(`${rel}: npm run ${m[1]}`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `以下命令在文档里写着、但 package.json 的 scripts 里没有：\n  ${missing.join("\n  ")}`
  );
});

// ★ 反向（每个 script 都必须被文档提到）**故意不做**：CI、发布与一次性工具脚本
//   有权只出现在各自的位置，强制互相引用只会催生「为了过门禁而补的废话文档」。
