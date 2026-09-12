/* ==========================================================================
   dev-server.js — 零依赖静态服务器（仅用于界面预览，不参与打包）
   用法：node tools/dev-server.js [port]
   默认端口 5173，根目录为 frontend/src
   ========================================================================== */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const url = require("node:url");

const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const ROOT = path.resolve(__dirname, "..", "frontend", "src");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  let rel = decodeURIComponent(parsed.pathname);
  if (rel === "/" || rel === "") rel = "/index.html";

  const full = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ""));
  if (!full.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.stat(full, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end(`404 Not Found: ${rel}`);
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(full).pipe(res);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`UI 预览已启动: http://127.0.0.1:${PORT}/`);
  console.log(`静态根目录: ${ROOT}`);
});
