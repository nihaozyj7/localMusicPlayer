/* ==========================================================================
   serve-preview-skins.mjs — 内置样式的「清单 + 文件」服务（开发/验收专用）
   --------------------------------------------------------------------------
   为什么需要它：契约 v3 起**内置样式是 Go 侧的只读资源**（internal/skins/
   resources/player-skins），不在前端包里 —— 任何没有 Go 后端的场景（浏览器
   预览、工具自带的静态服务器）都会"一个样式都看不到"。

   这个模块把 `internal/skins` 的扫描与清单归一化**镜像**成一份 Node 实现，
   供两个没有 Go 的宿主共用：
     · frontend/vite.config.js      浏览器预览（npm run dev / preview）
     · tools/verify-wallpaper-first-frame.mjs  验收用的假后端

   ⚠ 与 internal/skins/skins.go 的 Reload / normalizeManifest 字段形状必须
   同形（改一边要改另一边）—— 真机永远走 Go，这份只是影子。
   ========================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
export const SKINS_DIR = path.join(REPO_ROOT, "internal", "skins", "resources", "player-skins");

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

/** 与 skins.go#normalizeManifest 同形的默认值补齐 */
function previewManifest(raw, id) {
  const m = raw && typeof raw === "object" ? raw : {};
  const rel = (v) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s && !s.includes("..") && !s.startsWith("/") ? s : "";
  };
  return {
    ...m,
    id: m.id || id,
    name: m.name || id,
    version: m.version || "",
    apiVersion: m.apiVersion || "3.0", // 老清单没写版本 → 按当前契约处理（同 Go）
    author: m.author || "",
    description: m.description || "",
    entry: rel(m.entry || m.module) || "skin.js",
    styles: Array.isArray(m.styles) ? m.styles.map(rel).filter(Boolean) : [],
  };
}

/** 扫内置样式目录，返回与 Go `SkinService.List()` 同形的数组 */
export function listPreviewSkins() {
  const out = [];
  let names = [];
  try {
    names = fs
      .readdirSync(SKINS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort();
  } catch {
    return out;
  }
  for (const id of names) {
    const dir = path.join(SKINS_DIR, id);
    let raw = null;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(dir, "skin.json"), "utf8"));
    } catch {
      /* 坏清单 → 按没有清单处理（同 Go） */
    }
    const manifest = previewManifest(raw, id);
    if (!fs.existsSync(path.join(dir, manifest.entry))) continue; // 没入口就不算样式包
    let styles = manifest.styles.filter((s) => fs.existsSync(path.join(dir, s)));
    if (!manifest.styles.length) {
      try {
        styles = fs
          .readdirSync(dir)
          .filter((f) => f.toLowerCase().endsWith(".css") && !f.startsWith("."))
          .sort();
      } catch {
        styles = [];
      }
      manifest.styles = styles;
    }
    out.push({
      id,
      name: manifest.name,
      version: manifest.version,
      module: manifest.entry,
      styles,
      builtin: true,
      source: "builtin",
      manifest,
    });
  }
  return out;
}

/**
 * 处理一个样式资源请求（返回 true = 已写响应，调用方直接 return）。
 *
 * 认两个前缀（都是"没有 Go 的场景"专用，真机的 /skins/ 由 Go 带 token 服务）：
 *   /preview-skins/__list.json   → 清单（与 Go List() 同形）
 *   /preview-skins/<id>/<file>   → 样式文件
 *   /skins/<id>/<file>           → 同上（某些假后端按真机 URL 形状取文件）
 *
 * @param {string} pathname **已解码**的 URL 路径（调用方 decodeURIComponent 过）
 * @param {import("node:http").ServerResponse} res
 * @returns {boolean}
 */
export function servePreviewSkins(pathname, res) {
  const m = /^\/(?:preview-skins|skins)\/(.*)$/.exec(pathname);
  if (!m) return false;

  // 归一化后仍在样式根目录里才放行（挡 ../ 与绝对路径替换）
  const rel = path.normalize(m[1]).replace(/^([/\\])+/, "");
  const full = path.join(SKINS_DIR, rel);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || !full.startsWith(SKINS_DIR + path.sep)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return true;
  }

  if (rel === "__list.json") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(listPreviewSkins()));
    return true;
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.statusCode = 404;
    res.end("404 Not Found");
    return true;
  }
  res.setHeader("Content-Type", MIME[path.extname(full).toLowerCase()] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  res.end(fs.readFileSync(full));
  return true;
}
