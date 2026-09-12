/* ==========================================================================
   build-frontend.mjs — 把静态前端源码同步为可嵌入的构建产物
   --------------------------------------------------------------------------
   为什么需要它：
     本项目的前端是「零构建」的原生 HTML/CSS/ES Module，没有 Vite 打包步骤。
     但 Go 的 //go:embed 需要一个确定的目录，因此这里把 frontend/src
     原样复制到 frontend/dist，并顺带：
       · 把 themes/*.css 同步到 internal/theme/builtin/（内置主题随二进制分发）
       · 复制 bindings/（wails3 generate bindings 产物）到 dist/js 可到达的位置
   用法：node tools/build-frontend.mjs
   ========================================================================== */

import { cp, mkdir, rm, readdir, readFile, writeFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "frontend", "src");
const distDir = path.join(root, "frontend", "dist");
const bindingsDir = path.join(root, "frontend", "bindings");
const builtinThemeDir = path.join(root, "internal", "theme", "builtin");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(srcDir))) {
    console.error(`[build] 找不到前端源码目录: ${srcDir}`);
    process.exit(1);
  }

  // 1) 清空并复制前端
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await cp(srcDir, distDir, { recursive: true });

  // 2) 若已生成 Wails 绑定，一并放进 dist，供 bridge.js 以相对路径导入
  if (await exists(bindingsDir)) {
    await cp(bindingsDir, path.join(distDir, "bindings"), { recursive: true });
    console.log("[build] 已复制 Wails 绑定: frontend/bindings -> frontend/dist/bindings");
  } else {
    console.log("[build] 未发现 Wails 绑定（浏览器预览不需要；构建应用前请运行 wails3 generate bindings -b -i）");
  }

  // 3) 同步内置主题 CSS（Go 侧 embed 后写入用户主题目录）
  await rm(builtinThemeDir, { recursive: true, force: true });
  await mkdir(builtinThemeDir, { recursive: true });
  const themeDir = path.join(srcDir, "styles", "themes");
  const entries = await readdir(themeDir, { withFileTypes: true });
  let themeCount = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".css")) continue;
    if (entry.name.startsWith("_")) continue; // 模板文件不参与分发
    const raw = await readFile(path.join(themeDir, entry.name), "utf8");
    await writeFile(path.join(builtinThemeDir, entry.name), raw, "utf8");
    themeCount += 1;
  }

  // 4) 统计并输出
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
  console.log(`[build] 内置主题: ${themeCount} 个 -> internal/theme/builtin/`);
}

main().catch((err) => {
  console.error("[build] 失败:", err);
  process.exit(1);
});
