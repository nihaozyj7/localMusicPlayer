/* ==========================================================================
   dev-server.js — 零依赖静态服务器（仅用于界面预览，不参与打包）
   用法：node tools/dev-server.js [port]
   默认端口 5173，静态根目录 frontend/src
   另外：
     · /bindings/* 映射到 frontend/bindings（wails3 generate bindings 产物）
     · /packages/* 映射到 frontend/packages（工作区里的独立包，如播放界面皮肤）
     · 给 index.html 注入一张 import map，让浏览器能解析工作区包名
       （`@localmusicplayer/player-skins`）；正式开发/构建请用 `npm run dev`（Vite），
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
const NODE_MODULES = path.resolve(__dirname, "..", "node_modules");

/** 工作区包 → 浏览器可取的 URL（与 frontend/package.json 的依赖名保持一致） */
const BARE_SPECIFIERS = [
  ["@localmusicplayer/player-skins/contract", "/packages/player-skins/src/contract.js"],
  ["@localmusicplayer/player-skins", "/packages/player-skins/src/index.js"],
  // 第三方包（拖拽排序 SortableJS）：它的入口在 package.json 的 "module" 里，
  // 不在默认的目录解析路径上，所以单独写一条。
  // 其余第三方包由下面的 applyVendor 统一改写成 /vendor/<包名>/<子路径>。
  ["sortablejs", "/vendor/sortablejs/modular/sortable.esm.js"],
];

/**
 * 允许从 /vendor/ 读取的 npm 包（固定白名单，不接受任意路径）。
 *
 * ★ 这里曾经只有一条写死的 sortablejs → /vendor/sortablejs.js 映射，
 * 所以**迁移到 Lit 之后零依赖静态预览整个坏掉了**：页面里
 * `import { LitElement } from "lit"` 解析不了，模块图直接挂掉、界面全白，
 * 而 README 与 docs/19 还写着「跑自检脚本请用静态预览」（于是 10 多个
 * headless 自检脚本全部失效，却没人发现 —— 因为它们各自只看退出码）。
 *
 * 现在改成「按包名白名单从 node_modules 直接取」：`lit` / `lit/directives/repeat.js`
 * 这类子路径都能落到真实文件上，加新依赖时只需要往白名单里补一个顶层包名。
 */
const VENDOR_PACKAGES = ["lit", "lit-html", "lit-element", "@lit/reactive-element", "sortablejs"];

/** 该裸包名是否在白名单里（@scope/name 取两段，其余取一段） */
function vendorAllowed(spec) {
  const parts = String(spec).split("/");
  const top = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  return VENDOR_PACKAGES.includes(top);
}

/**
 * 把 /vendor/<pkgpath> 解析成 node_modules 里的真实文件；解析不到返回 null。
 *
 * 需要处理三种情况：直接是文件、是目录（补 index.js）、少了 .js 后缀
 * （lit 的 exports 会把 "lit/directives/repeat.js" 映射到同名文件，
 * 但有些包写成 "pkg/foo" 而磁盘上是 foo.js）。
 */
function resolveVendor(pkgPath) {
  if (!vendorAllowed(pkgPath)) return null;
  const rel = pkgPath.replace(/^([/\\])+/, "");
  const base = path.join(NODE_MODULES, rel);
  if (!base.startsWith(NODE_MODULES)) return null;
  const isFile = (p) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isFile();
    } catch {
      return false;
    }
  };
  for (const c of [base, base + ".js", base + ".mjs", path.join(base, "index.js")]) {
    if (isFile(c)) return c;
  }
  // 包根（形如 /vendor/lit-html）：入口不在 index.js 上，必须看 package.json。
  // lit-html 的入口是 lit-html.js、@lit/reactive-element 是 reactive-element.js ——
  // 只猜 index.js 会让这两个包永远 404，进而让整个模块图挂掉。
  const pkgFile = path.join(base, "package.json");
  if (!isFile(pkgFile)) return null;
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
  } catch {
    return null;
  }
  const entry = pickPackageEntry(pkg);
  if (!entry) return null;
  const full = path.join(base, entry);
  if (isFile(full)) return full;
  if (isFile(full + ".js")) return full + ".js";
  return null;
}

/**
 * 从 package.json 里挑出「浏览器直接可用的 ESM 入口」。
 *
 * 顺序刻意是 exports["."] → module → main：exports 是新包的权威声明，
 * module 是打包器约定，main 是最后的兜底（可能是 CJS）。
 * 递归时优先 default / import，避开 node / development 这类条件分支。
 */
function pickPackageEntry(pkg) {
  const pick = (e) => {
    if (!e) return "";
    if (typeof e === "string") return e;
    for (const key of ["browser", "import", "module", "default"]) {
      const v = e[key];
      if (typeof v === "string") return v;
      if (v && typeof v === "object") {
        const inner = pick(v);
        if (inner) return inner;
      }
    }
    return "";
  };
  const root = pkg.exports && (pkg.exports["."] || (typeof pkg.exports === "string" ? pkg.exports : null));
  return pick(root) || pkg.module || pkg.main || "";
}

/**
 * 让源码能被「浏览器原生 ESM」直接跑起来 —— 这个服务器没有打包器，两件事必须自己做：
 *
 * 1. **裸包名换成同源路径**：`import "@localmusicplayer/player-skins"` 浏览器不认识。
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
    out.push(applyVendor(next));
  }
  return out.join("\n");
}

/**
 * 把第三方裸包名改写成 /vendor/ 同源路径。
 *
 * 覆盖三种写法：`from "lit"`、`import("lit")`、`import "lit";`。
 * 只处理白名单里的包，其它裸名（工作区包在上面已经换过）原样留着 ——
 * 这样一旦有新依赖忘了进白名单，浏览器会报「Failed to resolve module
 * specifier」，比静默换成 404 好排查。
 */
function applyVendor(line) {
  const toVendor = (spec) => {
    const top = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    return vendorAllowed(top) ? `/vendor/${spec}` : spec;
  };
  // 一条正则覆盖全部写法：`from "lit"` / `export * from "lit"` / `import "lit"` /
  // `import("lit")`。注意 npm 上 lit 的入口是**压缩过**的
  // `import"@lit/reactive-element";import"lit-html";` —— 引号前可能一个空格都没有，
  // 所以这里不能要求 \s+（早期写成 \s+ 时这两个包名一直解析不了）。
  return line.replace(/(\bfrom|\bimport)\s*\(?\s*(["'])([^"']+)\2/g, (m, pre, q, spec) => {
    const next = toVendor(spec);
    if (next === spec) return m;
    return `${pre}${m.slice(pre.length).replace(spec, next)}`;
  });
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

  // 第三方依赖（零依赖预览用，按包名白名单从 node_modules 取）
  if (rel.startsWith("/vendor/")) {
    const file = resolveVendor(rel.slice("/vendor/".length));
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end(`404 Not Found: ${rel}`);
      return;
    }
    // ★ 必须重定向到**真实文件**的 URL，不能直接把内容当作 `/vendor/<包名>` 返回。
    // 浏览器是用「模块 URL 所在目录」去解析相对 import 的：
    //   @lit/reactive-element 的入口是 reactive-element.js，里面有
    //   `import "./css-tag.js"`；若模块 URL 停在 /vendor/@lit/reactive-element，
    //   相对路径会被解析成 /vendor/@lit/css-tag.js（少了一层），404、
    //   整个模块图挂掉、界面全白。重定向之后 URL 就是真实路径，相对解析自然正确。
    const urlPath = path.relative(NODE_MODULES, file).split(path.sep).join("/");
    const canonical = `/vendor/${urlPath}`;
    if (canonical !== rel) {
      res.writeHead(302, { Location: canonical, "Cache-Control": "no-store" }).end();
      return;
    }
    serveFile(res, file, rel);
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
