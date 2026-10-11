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

/**
 * 这个路径该不该纳入检查。
 *
 * ★ 必须跟着 Go 工具链自己的忽略规则走：名字以 "." 或 "_" 开头的目录与文件
 * **不是包的一部分**（这也是 `go build ./...` 从来不碰 `.tmp-neu2/` 的原因）。
 * 而 `gofmt -l .` 是**直接遍历文件系统**的 —— 不看这条规则。
 *
 * 后果（踩过）：`.gitignore` 里声明的自检临时工作区 `.tmp-*`（见 AGENTS.md 的
 * 工作纪律）里放了一个一次性探针 `.tmp-neu2/glasscheck.go`，它只是常量没对齐，
 * 就让整个 `check:go` 门禁变红，而它既不是本仓库的代码、CI 的干净检出里也不存在。
 *
 * node_modules 同理：flatted 自带的 Go 源码不是我们的代码。
 */
function isIgnored(p) {
  const segs = p.split(/[\\/]/).filter((s) => s && s !== ".");
  return segs.some((s) => s === "node_modules" || s.startsWith(".") || s.startsWith("_"));
}

const bad = out
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter((s) => s && !isIgnored(s));

if (bad.length) {
  console.error("[check-gofmt] 以下文件未格式化，请运行 gofmt -w <file>：");
  for (const f of bad) console.error("  " + f);
  process.exit(1);
}

console.log("[check-gofmt] OK");
