/* ==========================================================================
   dev-server.js — 零依赖静态服务器（仅用于界面预览，不参与打包）
   用法：node tools/dev-server.js [port]
   默认端口 5173，静态根目录 frontend/src
   另外：
     · /bindings/* 映射到 frontend/bindings（wails3 generate bindings 产物）
     · /wails/runtime.js 在预览下返回一个最小 shim，让生成代码能 import 成功
       （真正的 Wails 应用会由框架自己提供 /wails/runtime.js）
   ========================================================================== */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const url = require("node:url");

const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const ROOT = path.resolve(__dirname, "..", "frontend", "src");
const BINDINGS = path.resolve(__dirname, "..", "frontend", "bindings");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".ts": "text/javascript; charset=utf-8",
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

/* 预览用的 Wails 运行时桩：所有调用都 reject，代表“没有 Go 后端”。
   bridge.js 捕获到之后会自动降级为 mock 数据。 */
const RUNTIME_SHIM = `// 预览专用桩：没有 Go 后端
export class CancellablePromise extends Promise {
  cancel() {}
  cancelOn() { return this; }
}
export const Call = {
  ByID() { return Promise.reject(new Error("preview: no backend")); },
  ByName() { return Promise.reject(new Error("preview: no backend")); },
  ByIDAsync() { return Promise.reject(new Error("preview: no backend")); },
};
export const Events = {
  On() { return () => {}; },
  Off() {},
  Emit() {},
  Once() { return () => {}; },
};
export const WML = { Enable() {}, OpenURL() {} };
export const Flags = { Get() { return null; } };
export const Browser = { OpenURL() {} };
export const Window = { SetTitle() {} };
export default { Call, Events, WML, Flags, CancellablePromise };
`;

function serveFile(res, file, rel) {
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end(`404 Not Found: ${rel}`);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  let rel = decodeURIComponent(parsed.pathname);

  // 预览用的 Wails 运行时桩
  if (rel === "/wails/runtime.js") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
    res.end(RUNTIME_SHIM);
    return;
  }

  // 生成绑定的静态映射
  if (rel.startsWith("/bindings/")) {
    const target = path.join(BINDINGS, path.normalize(rel.replace(/^\/bindings\/?/, "")).replace(/^([/\\])+/, ""));
    if (!target.startsWith(BINDINGS)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    serveFile(res, target, rel);
    return;
  }

  if (rel === "/" || rel === "") rel = "/index.html";
  const full = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ""));
  if (!full.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  serveFile(res, full, rel);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`UI 预览已启动: http://127.0.0.1:${PORT}/`);
  console.log(`静态根目录: ${ROOT}`);
  console.log(`绑定目录:   ${BINDINGS}${fs.existsSync(BINDINGS) ? "" : "（不存在，运行 wails3 generate bindings -b -i 生成）"}`);
});
