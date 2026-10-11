#!/usr/bin/env node
/* ==========================================================================
   build-index.mjs — 生成 plugins/theme/index.json 与 plugins/style/index.json
   --------------------------------------------------------------------------
   这两个 index.json 是**客户端「从仓库获取」唯一的数据源**：播放器只读它们，
   不读目录结构（它连 plugins/ 这个目录都看不到，那是仓库里的东西）。

   用法：node plugins/build-index.mjs
         node plugins/build-index.mjs --check    只校验，不写盘（清单过期就非零退出）

   为什么不手工维护：
     · 光 magic-circle 一个样式包就有 12 个文件，手写清单漏一个就是「装完起不来」；
     · 改名 / 加文件后忘了同步，客户端会拉到一个 404 —— 这类失配没有任何提示，
       只有用户装不上时才暴露。生成脚本 + --check 让它在提交前就红。

   产物是**确定性的**（条目按 id 排序、不写生成时间戳），所以重复执行不会产生
   diff —— 否则每次跑都改一行时间，反而让人不再看这份 diff。
   ========================================================================== */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve, basename, posix } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const KINDS = [
  { kind: "theme", dir: join(HERE, "theme") },
  { kind: "style", dir: join(HERE, "style") },
];

/* —— 哪些东西不进清单 ——
   清单 = 「用户安装时会拿到的东西」，不是「仓库里有什么」。
   tests/ 是开发者自检（客户端装了也不会跑，只是白占带宽）；
   *.bak / index.json 是本地状态与清单自身。 */
const SKIP_DIRS = new Set(["tests", "node_modules", ".git", "__pycache__", ".idea", ".vscode"]);
const SKIP_FILES = new Set(["index.json", ".DS_Store", "Thumbs.db", "desktop.ini"]);
const SKIP_EXT = new Set([".bak", ".log", ".tmp", ".orig", ".rej"]);

const SPEC = 1;

/* --------------------------------------------------------------------------
   小工具
   -------------------------------------------------------------------------- */

/** 目录树里所有入清单的文件，路径统一用 `/` 分隔且**相对 kind 根**
    （theme → `glass-dark.css`；style → `magic-circle/skin.js`）。

    统一成「相对 kind 根」是为了让下载 URL 只有一条拼法：
    `<base>/<kind>/<path>` —— 不用按 kind 分支，客户端侧也少一处出错的地方。 */
function collectFiles(root, prefix = "") {
  const out = [];
  for (const name of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${name.name}` : name.name;
    if (name.isDirectory()) {
      if (SKIP_DIRS.has(name.name)) continue;
      out.push(...collectFiles(root, rel));
      continue;
    }
    if (!name.isFile()) continue;
    if (SKIP_FILES.has(name.name)) continue;
    if (SKIP_EXT.has(rel.slice(rel.lastIndexOf(".")).toLowerCase())) continue;
    out.push(rel);
  }
  return out;
}

/** 读一个文件并算出清单需要的三元组 */
function describe(root, rel) {
  const buf = readFileSync(join(root, ...rel.split("/")));
  return {
    path: rel,
    size: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
}

/** 取主题 CSS 头部的 `@theme-xxx <值>` 指令；没有就返回空串 */
function directive(css, name) {
  const m = new RegExp(`@${name}\\s+([^\\r\\n*]+)`).exec(css);
  return m ? m[1].trim() : "";
}

/* --------------------------------------------------------------------------
   主题：一条目 = 一个 CSS 文件
   -------------------------------------------------------------------------- */
function themeItems() {
  const root = join(HERE, "theme");
  const items = [];
  for (const name of readdirSync(root).sort()) {
    if (!name.endsWith(".css")) continue;
    const css = readFileSync(join(root, name), "utf8");
    // id 取选择器里的 data-theme（与程序扫描主题的规则一致），缺失时退回文件名
    const sel = /:root\[data-theme=["']([^"']+)["']\]/.exec(css);
    const id = sel ? sel[1] : basename(name, ".css");
    const swatch = directive(css, "theme-swatch")
      .split(/\s+/)
      .filter((c) => c.startsWith("#"));
    items.push({
      id,
      name: directive(css, "theme-name") || id,
      version: directive(css, "theme-version") || "0.0.0",
      author: directive(css, "theme-author") || "",
      description: directive(css, "theme-desc") || "",
      mode: (directive(css, "theme-mode") || "").toLowerCase() || "dark",
      swatch,
      files: [describe(root, name)],
    });
  }
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

/* --------------------------------------------------------------------------
   样式包：一条目 = 一个子目录（必须自带 skin.json）
   -------------------------------------------------------------------------- */
function styleItems() {
  const root = join(HERE, "style");
  const items = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    const manifestPath = join(root, entry.name, "skin.json");
    if (!existsSync(manifestPath)) continue; // 不是样式包（比如只放了 README）
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (err) {
      throw new Error(`plugins/style/${entry.name}/skin.json 不是合法 JSON：${err.message}`);
    }
    const id = String(manifest.id || entry.name);
    const colors = manifest.colors || {};
    items.push({
      id,
      dir: entry.name,
      name: manifest.name || id,
      version: manifest.version || "0.0.0",
      author: manifest.author || "",
      description: manifest.description || "",
      apiVersion: manifest.apiVersion || "",
      // 样式包的「色板」就是清单 colors 里的三个值（宿主读同一组值做对比度校验）
      swatch: [colors.bg, colors.fg, colors.accent].filter((c) => typeof c === "string" && c),
      files: collectFiles(join(root, entry.name))
        .sort()
        .map((rel) => describe(join(root, entry.name), rel))
        // 路径统一加上包目录前缀，与主题保持同一条 URL 规则
        .map((f) => ({ ...f, path: posix.join(entry.name, f.path) })),
    });
  }
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

/* --------------------------------------------------------------------------
   主流程
   -------------------------------------------------------------------------- */
const checkOnly = process.argv.includes("--check");
let stale = 0;

for (const { kind, dir } of KINDS) {
  const items = kind === "theme" ? themeItems() : styleItems();
  const doc = { spec: SPEC, kind, items };
  const text = JSON.stringify(doc, null, 2) + "\n";
  const target = join(dir, "index.json");
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";

  const fileCount = items.reduce((n, it) => n + it.files.length, 0);
  if (current === text) {
    console.log(`✓ plugins/${kind}/index.json 已是最新（${items.length} 个条目 / ${fileCount} 个文件）`);
    continue;
  }
  if (checkOnly) {
    stale += 1;
    console.error(`✗ plugins/${kind}/index.json 过期，请跑 node plugins/build-index.mjs`);
    continue;
  }
  writeFileSync(target, text, "utf8");
  console.log(`✎ plugins/${kind}/index.json 已更新（${items.length} 个条目 / ${fileCount} 个文件）`);
}

if (stale) {
  console.error("\n清单过期：客户端会拉到不存在的文件或旧版本。");
  process.exit(1);
}
