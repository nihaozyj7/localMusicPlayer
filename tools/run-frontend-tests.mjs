/* ==========================================================================
   run-frontend-tests.mjs — 跑前端单元测试（跨平台）
   --------------------------------------------------------------------------
   ★ 为什么需要这个文件，而不是直接在 package.json 里写 glob：

   原来的脚本是：

     node --import ./frontend/tests/register.mjs --test "frontend/tests/*.test.js"

  它在 Windows 上能跑（npm 用 cmd.exe 执行，引号里的通配符会被 Node 自己的
   内部匹配处理），但在 Linux / macOS 上**必然失败**：

     Could not find '/home/runner/work/.../frontend/tests/*.test.js'

   原因是 bash 不会展开被引号包住的通配符（这正是加引号的本意 ——
   防止 shell 提前展开、把文件列表定死在某个平台上），
   而 Node 的 `--test` 在 Node 20 上也不接受"路径片段"这种写法。
   于是一条本地全绿的测试命令，在 CI 上从来没能真正跑起来 ——
   门禁形同虚设，这比测试失败更危险。

   这里改成用 Node 自己列目录、把文件路径**显式**传给 --test：
   两种平台的 shell 都不参与展开，行为完全一致。

   ★ 用 readdir 而不是让 node 去 glob：Node 20 没有稳定的 glob API
   （fs.glob 到 Node 22 才加入且仍是实验性），而列目录 + 过滤后缀
   在 Node 18 起就是稳定的。
   ========================================================================== */

import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const testsDir = join(root, "frontend", "tests");

/** 收集测试文件（按名字排序，保证输出稳定、便于对比两次运行） */
const files = readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.js"))
  .sort()
  .map((name) => relative(root, join(testsDir, name)));

if (files.length === 0) {
  // 没有测试文件时**必须失败**，不能"零个测试、退出码 0"地静默通过 ——
  // 那会让「测试文件被误删 / 目录改名」表现成一片绿。
  console.error(`[test] 在 ${testsDir} 里没有找到任何 *.test.js —— 测试目录是不是改了？`);
  process.exit(1);
}

// 路径统一用正斜杠：Windows 的 join 会给反斜杠，而它们在部分
// 工具链里会被当成转义字符。Node 在 Windows 上接受正斜杠。
const args = [
  "--import",
  "./frontend/tests/register.mjs",
  "--test",
  ...files.map((f) => f.split("\\").join("/")),
];

const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit" });
child.on("exit", (code, signal) => {
  // 信号终止（比如 Ctrl+C）时 code 是 null，按非零退出处理，
  // 免得 CI 把"被中断"误判成"测试通过"。
  process.exit(signal ? 1 : code ?? 1);
});
