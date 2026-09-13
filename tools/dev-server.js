/* ==========================================================================
   dev-server.js — 零依赖静态服务器（仅用于界面预览，不参与打包）
   用法：node tools/dev-server.js [port]
   默认端口 5173，静态根目录 frontend/src
   另外：
     · /bindings/* 映射到 frontend/bindings（wails3 generate bindings 产物）
     · /packages/* 映射到 frontend/packages（工作区里的独立包，如播放界面皮肤）
     · 给 index.html 注入一张 import map，让浏览器能解析工作区包名
       （`@musicplayer/player-skins`）；正式开发/构建请用 `npm run dev`（Vite），
       这里保留只是为了「没装 node_modules 也能看界面」。
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
const PACKAGES = path.resolve(__dirname, "..", "frontend", "packages");

/** 工作区包 → 浏览器可取的 URL（与 frontend/package.json 的依赖名保持一致） */
const BARE_SPECIFIERS = [
  ["@musicplayer/player-skins/contract", "/packages/player-skins/src/contract.js"],
  ["@musicplayer/player-skins", "/packages/player-skins/src/index.js"],
];

/**
 * 让源码能被「浏览器原生 ESM」直接跑起来 —— 这个服务器没有打包器，两件事必须自己做：
 *
 * 1. **裸包名换成同源路径**：`import "@musicplayer/player-skins"` 浏览器不认识。
 *    本来该用 import map，但 import map 是内联脚本，会被页面 CSP
 *    （`script-src 'self'`）拦掉 —— 实测拦掉后模块解析失败、界面全白。
 *    直接改写说明符最稳，也不用放宽 CSP。
 * 2. **摘掉 `import "./x.css"`**：Vite 会把它抽成样式表，而浏览器原生 ESM 不能
 *    import CSS（会抛 MIME 类型错误，整个模块图挂掉）。这里摘掉后用 <link> 引入。
 */
function rewriteForBrowser(source) {
  const out = [];
  for (const line of source.split("\n")) {
    if (/^\s*import\s+["'].+\.css["'];?\s*$/.test(line)) continue;
    let next = line;
    for (const [bare, target] of BARE_SPECIFIERS) {
      next = next.split(`"${bare}"`).join(`"${target}"`).split(`'${bare}'`).join(`"${target}"`);
    }
    out.push(next);
  }
  return out.join("\n");
}

/** 工作区包里所有的 CSS（被摘掉的 import 要用 <link> 补回来） */
function collectPackageCss(dir, base, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collectPackageCss(full, base, acc);
    else if (e.name.toLowerCase().endsWith(".css")) {
      acc.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return acc;
}

const PACKAGE_CSS = collectPackageCss(PACKAGES, PACKAGES);
const PACKAGE_CSS_LINKS = PACKAGE_CSS.map((rel) => `<link rel="stylesheet" href="/packages/${rel}" />`).join(
  "\n    "
);

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
    // HTML 与 JS 要做改写（见 rewriteForBrowser），单独读出来处理；其它文件直接流式返回
    if (ext === ".html") {
      let html = fs.readFileSync(file, "utf8");
      // 用带标记的注释判断是否已注入过（不要用文件路径当特征 ——
      // index.html 的注释里本来就会出现 "packages/player-skins" 这样的字样）
      if (!html.includes("data-package-css") && PACKAGE_CSS_LINKS) {
        html = html.replace("</head>", `<!-- data-package-css -->\n    ${PACKAGE_CSS_LINKS}\n  </head>`);
      }
      res.writeHead(200, { "Content-Type": MIME[ext], "Cache-Control": "no-store" });
      res.end(html);
      return;
    }
    if (ext === ".js" || ext === ".mjs") {
      res.writeHead(200, { "Content-Type": MIME[ext], "Cache-Control": "no-store" });
      res.end(rewriteForBrowser(fs.readFileSync(file, "utf8")));
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(file).pipe(res);
  });
}

/** 把某个前缀的 URL 映射到磁盘目录，并挡住路径穿越 */
function serveMapped(res, baseDir, rel, prefix, label) {
  const target = path.join(baseDir, path.normalize(rel.replace(prefix, "")).replace(/^([/\\])+/, ""));
  if (!target.startsWith(baseDir)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (!fs.existsSync(target)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end(`404 Not Found: ${label}${rel}`);
    return;
  }
  serveFile(res, target, rel);
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
    serveMapped(res, BINDINGS, rel, /^\/bindings\/?/, "bindings");
    return;
  }

  // 工作区包（播放界面皮肤等）
  if (rel.startsWith("/packages/")) {
    serveMapped(res, PACKAGES, rel, /^\/packages\/?/, "packages");
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
  console.log(
    `绑定目录:   ${BINDINGS}${fs.existsSync(BINDINGS) ? "" : "（不存在，运行 wails3 generate bindings -b -i 生成）"}`
  );
  console.log(`工作区包:   ${PACKAGES}${fs.existsSync(PACKAGES) ? "" : "（不存在）"}`);
  console.log("提示：正式开发请用 npm run dev（Vite，带 HMR 与依赖解析）");
});
