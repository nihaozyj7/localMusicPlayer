/* ==========================================================================
   check-skipped-tests.mjs — 「跳过数 > 0 即失败」的后端门禁
   --------------------------------------------------------------------------
   为什么需要它（审查报告第六轮 建议 12 / 第 16 条）：

     `services_player_test.go` 里有 5 处 `if !svc.Start() { t.Skip("没有可用的
     音频设备") }`，`internal/audioplay/playback_integration_test.go` 同理 ——
     CI 的容器里没有声卡，于是 **38 个编排用例在 CI 里被整批静默跳过**。
     结果是一个很危险的错觉：CI 全绿，而那批用例其实一次都没跑。

   跳过本身不是错误（真需要声卡 / 真发外网 / 需要符号链接权限的用例，
   在别的环境里必须能跳），问题是**没有人知道跳了多少、为什么跳**。
   所以这里把「跳过」变成一份必须显式登记的清单：
     · 跳过原因命中 `tools/skipped-tests-allowlist.json` 里的某一条 → 打印出来，通过；
     · 任何一条没登记的跳过 → 失败，并告诉你两个选择：
         修好它，或者去 allowlist 里补一条（写明原因）；
     · allowlist 里登记了、这次却没跳过 → 只警告（不同平台本来就跳不一样）。

   与 `go test -race` 的关系：那个门禁只保证「跑了的都过」，这个门禁负责
   「没跑的有账」。两条一起才等于「测试真的覆盖到了」。

   用法：
     node tools/check-skipped-tests.mjs            # 跑一遍并把跳过数当门禁
     node tools/check-skipped-tests.mjs --list     # 只列当前会跳过的用例
   ========================================================================== */

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const allowlistPath = join(here, "skipped-tests-allowlist.json");

const listOnly = process.argv.includes("--list");

/* --------------------------------------------------------------------------
   允许的跳过：每条都要写明「为什么这个环境下跑不了」
   -------------------------------------------------------------------------- */
let allow = [];
try {
  const raw = JSON.parse(readFileSync(allowlistPath, "utf8"));
  allow = Array.isArray(raw.allow) ? raw.allow : [];
} catch (err) {
  console.error(`[skip] 读不到 ${allowlistPath}: ${err.message}`);
  process.exit(1);
}
if (allow.length === 0) {
  console.error("[skip] allowlist 是空的 —— 那这份门禁就只是「一律失败」，请先填好允许的跳过原因");
  process.exit(1);
}
for (const entry of allow) {
  if (!entry.match || !entry.reason) {
    console.error(`[skip] allowlist 条目缺少 match 或 reason: ${JSON.stringify(entry)}`);
    process.exit(1);
  }
}

/* --------------------------------------------------------------------------
   跑一遍后端测试，把每条跳过连同它的原因收集起来
   -------------------------------------------------------------------------- */
// 包列表显式写出：`./...` 会顺着 node_modules 里的第三方 Go 源码跑进去
//（见 AGENTS.md「不要用 go test ./...」）
const goArgs = ["test", "-json", "-count=1", ".", "./internal/...", "./tools/..."];

const child = spawn("go", goArgs, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });

let buf = "";
const skipped = []; // { pkg, test, reason }
const current = new Map(); // "pkg|test" -> 最近几行输出（跳过原因就在里面）
const packageFailures = [];
let stderr = "";

function handleLine(line) {
  if (!line.startsWith("{")) return; // 构建错误等非 JSON 行
  let ev;
  try {
    ev = JSON.parse(line);
  } catch {
    return;
  }
  if (!ev.Test) return;
  const key = `${ev.Package}|${ev.Test}`;
  if (ev.Action === "output") {
    const tail = current.get(key) ?? [];
    tail.push(ev.Output.replace(/\s+$/, ""));
    // 只留最后几行：跳过原因紧挨在 skip 之前
    if (tail.length > 6) tail.shift();
    current.set(key, tail);
    return;
  }
  if (ev.Action === "skip") {
    const tail = current.get(key) ?? [];
    // go test 会在 skip 之前把 `--- SKIP: TestX (...)` 与原因打印出来；
    // 取最后一行非分隔线的内容作为原因
    const reason =
      [...tail].reverse().find((l) => l && !/^-+ (SKIP|PASS|FAIL)/.test(l) && l.trim() !== "") ?? "(没有给出原因)";
    skipped.push({ pkg: ev.Package, test: ev.Test, reason });
  }
  if (ev.Action === "fail" && !ev.Test.includes("/")) {
    packageFailures.push(`${ev.Package}::${ev.Test}`);
  }
}

child.stdout.on("data", (chunk) => {
  buf += chunk.toString("utf8");
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    handleLine(line);
  }
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

child.on("close", (code) => {
  if (buf) handleLine(buf);

  if (listOnly) {
    for (const s of skipped) console.log(`[skip] ${s.pkg} :: ${s.test} —— ${s.reason}`);
    console.log(`[skip] 共 ${skipped.length} 条跳过`);
    process.exit(0);
  }

  if (code !== 0) {
    console.error(`[skip] go test 本身没有通过（退出码 ${code}）—— 先让测试变绿再谈跳过数`);
    if (stderr.trim()) console.error(stderr.trim());
    for (const f of packageFailures) console.error(`[skip] 失败用例: ${f}`);
    process.exit(1);
  }

  const allowed = [];
  const unmatched = [];
  const usedReasons = new Set();
  const perEntry = new Map(); // match -> 命中条数
  for (const s of skipped) {
    const hit = allow.find((e) => s.reason.includes(e.match));
    if (hit) {
      usedReasons.add(hit.match);
      perEntry.set(hit.match, (perEntry.get(hit.match) ?? 0) + 1);
      allowed.push({ ...s, note: hit.reason });
    } else {
      unmatched.push(s);
    }
  }

  // 上限：登记本身不该变成「随便跳」的许可证 —— 一类跳过变多了同样是回归
  const overflow = [];
  for (const e of allow) {
    const n = perEntry.get(e.match) ?? 0;
    const max = Number.isFinite(e.max) ? e.max : Infinity;
    if (n > max) overflow.push({ entry: e, n, max });
  }

  for (const s of allowed) {
    console.log(`[skip-ok] ${s.pkg} :: ${s.test} —— ${s.reason}（已登记：${s.note}）`);
  }
  for (const e of allow) {
    if (!usedReasons.has(e.match)) {
      console.log(`[skip-note] allowlist 条目这次没命中（换平台时正常）：${e.match}`);
    }
  }

  if (overflow.length > 0) {
    console.error("");
    console.error("[skip] 某一类跳过数超过了登记的上限：");
    for (const o of overflow) {
      console.error(`  · ${o.entry.match} → 实际 ${o.n} 条，上限 ${o.max}（${o.entry.reason}）`);
    }
    console.error("跳过数增长和新增跳过一样危险：要么修好，要么调高上限并说明原因。");
    process.exit(1);
  }

  if (unmatched.length > 0) {
    console.error("");
    console.error(`[skip] 有 ${unmatched.length} 条跳过没有登记，门禁失败：`);
    for (const s of unmatched) {
      console.error(`  · ${s.pkg} :: ${s.test}`);
      console.error(`    原因: ${s.reason}`);
    }
    console.error("");
    console.error("两种选择：");
    console.error("  1. 让它在 CI 里真的跑起来（首选 —— 静默跳过等于没有这个用例）；");
    console.error("  2. 如果它确实只能在特定环境跑，就在 tools/skipped-tests-allowlist.json");
    console.error("     里补一条 match（跳过原因里的原话片段）+ reason（为什么允许）。");
    process.exit(1);
  }

  console.log(`[skip] 跳过 ${skipped.length} 条，全部已登记；用例总数门禁通过`);
});
