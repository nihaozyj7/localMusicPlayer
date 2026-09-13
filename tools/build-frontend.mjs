/* ==========================================================================
   build-frontend.mjs — 构建前端产物到 frontend/dist（供 Go 的 go:embed）
   --------------------------------------------------------------------------
   工程化之后前端不再是「原样拷贝」：
     · frontend/src + frontend/packages 由 **Vite** 打包（依赖解析、语法降级、
       产物哈希），输出到 frontend/dist；
     · wails3 生成的绑定（frontend/bindings）**不参与打包**：它们是运行时
       import 的普通 ESM（bridge.js 用变量说明符 + @vite-ignore），
       这里原样拷进 dist/bindings，运行时由 asset server 提供；
     · 内置主题 CSS 同步到 internal/theme/builtin/（随二进制分发，
       首次启动写入用户主题目录）；
     · 最后统计体积，方便一眼看出产物有没有异常膨胀。

   用法：node tools/build-frontend.mjs [--skip-vite]
        （--skip-vite 只做「拷贝绑定 + 同步主题」，用于已经构建过前端的场合）
   ========================================================================== */

import { cp, mkdir, rm, readdir, readFile, writeFile, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const frontendDir = path.join(root, "frontend");
const srcDir = path.join(frontendDir, "src");
const distDir = path.join(frontendDir, "dist");
const bindingsDir = path.join(frontendDir, "bindings");
const builtinThemeDir = path.join(root, "internal", "theme", "builtin");
const skipVite = process.argv.includes("--skip-vite");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** 跑一条命令并把输出直接透传（保持 PowerShell/CI 里能看到 Vite 的日志） */
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    // stdio: "inherit" 而不是 pipe：构建日志本来就该实时可见，
    // 而且有些受限环境不允许子进程走管道。
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} 退出码 ${code}`))
    );
  });
}

async function buildWithVite() {
  if (!(await exists(path.join(root, "node_modules")))) {
    throw new Error("没找到 node_modules：先运行 `npm install`（前端已改为 Vite 工程化构建）");
  }
  // 直接用 node 跑 Vite 的 CLI 入口，而不是 spawn("npx")：
  // Windows 上 npx / npm 是 .cmd 批处理，Node 出于安全考虑拒绝直接 spawn .cmd
  // （会抛 spawn EINVAL）。绕开它的办法就是不经过 .cmd 这一层。
  const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
  if (!(await exists(viteBin))) {
    throw new Error(`找不到 Vite 可执行入口: ${viteBin}（先运行 npm install）`);
  }
  console.log("[build] vite build …");
  await run(process.execPath, [viteBin, "build"], frontendDir);
}

async function copyBindings() {
  if (!(await exists(bindingsDir))) {
    console.log("[build] 未发现 Wails 绑定（浏览器预览不需要；构建应用前请运行 wails3 generate bindings -b -i）");
    return 0;
  }
  await cp(bindingsDir, path.join(distDir, "bindings"), { recursive: true });
  console.log("[build] 已复制 Wails 绑定: frontend/bindings -> frontend/dist/bindings");
  return 1;
}

/** 内置主题随二进制分发：同步到 internal/theme/builtin/（Go 侧 go:embed） */
async function syncBuiltinThemes() {
  await rm(builtinThemeDir, { recursive: true, force: true });
  await mkdir(builtinThemeDir, { recursive: true });
  const themeDir = path.join(srcDir, "styles", "themes");
  const entries = await readdir(themeDir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".css")) continue;
    if (entry.name.startsWith("_")) continue; // 模板文件不参与分发
    const raw = await readFile(path.join(themeDir, entry.name), "utf8");
    await writeFile(path.join(builtinThemeDir, entry.name), raw, "utf8");
    count += 1;
  }
  console.log(`[build] 内置主题: ${count} 个 -> internal/theme/builtin/`);
  return count;
}

/** 统计产物体积（前端只有几百 KB，突然变成几 MB 基本就是误把 sourcemap/资源打进去了） */
async function report() {
  let fileCount = 0;
  let bytes = 0;
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else {
        fileCount += 1;
        bytes += (await readFile(full)).length;
      }
    }
  }
  await walk(distDir);
  console.log(`[build] frontend/dist: ${fileCount} 个文件, ${(bytes / 1024).toFixed(1)} KB`);
}

async function main() {
  if (!(await exists(srcDir))) {
    console.error(`[build] 找不到前端源码目录: ${srcDir}`);
    process.exit(1);
  }

  if (!skipVite) await buildWithVite();
  else console.log("[build] --skip-vite：跳过 Vite 构建，只补绑定与主题");

  if (!(await exists(distDir))) {
    console.error("[build] frontend/dist 不存在：Vite 构建可能失败了");
    process.exit(1);
  }

  await copyBindings();
  await syncBuiltinThemes();
  await report();
}

main().catch((err) => {
  console.error("[build] 失败:", err.message || err);
  process.exit(1);
});
