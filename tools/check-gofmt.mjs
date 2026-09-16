/* ==========================================================================
   check-gofmt.mjs — gofmt 门禁
   --------------------------------------------------------------------------
   为什么需要它：`go vet` **不检查格式**，所以仓库里长期有 6 个文件未格式化
   （含 internal/meta/meta.go 这种扫描热路径上的生产代码）却一路绿灯。
   前端早有 prettier --check 门禁，后端此前一个都没有。

   用法：node tools/check-gofmt.mjs
   退出码：0 = 全部合规；1 = 有文件需要 gofmt -w
   ========================================================================== */

import { execFileSync } from "node:child_process";

let out = "";
try {
  out = execFileSync("gofmt", ["-l", "."], { encoding: "utf8" });
} catch (err) {
  console.error("[check-gofmt] 无法执行 gofmt（Go 工具链是否在 PATH 上？）:", err?.message ?? err);
  process.exit(1);
}

// node_modules 里 flatted 自带的 Go 源码不是本仓库的代码，不纳入检查
const bad = out
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter((s) => s && !s.includes("node_modules"));

if (bad.length) {
  console.error("[check-gofmt] 以下文件未格式化，请运行 gofmt -w <file>：");
  for (const f of bad) console.error("  " + f);
  process.exit(1);
}

console.log("[check-gofmt] OK");
