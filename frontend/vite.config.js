/* ==========================================================================
   vite.config.js — 前端构建/开发服务器配置
   --------------------------------------------------------------------------
   为什么是 Vite：源码仍然是原生 ESM（没有框架、没有 JSX/TS），
   但工程上需要真正的 dev server（HMR）、依赖解析（npm workspaces 里的
   @musicplayer/player-skins）、语法降级与产物哈希。

   两个「非标准」的地方需要插件补齐：
     1. `/bindings/*` —— wails3 generate bindings 的产物。
        它们是运行时才 import 的（bridge.js 用 /* @vite-ignore *\/ 的变量说明符），
        所以要由 dev server 直接映射到 frontend/bindings；构建时再由
        tools/build-frontend.mjs 原样拷进 dist。
     2. `/wails/runtime.js` —— 打包后的应用由 Wails 框架提供；
        浏览器预览（npm run dev / preview）下必须给一个桩，
        让生成的绑定代码 import 成功、随后在 bridge.js 里降级成 mock。
   ========================================================================== */

import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)); // frontend/
const repoRoot = path.resolve(here, "..");
const srcDir = path.join(here, "src");
const bindingsDir = path.join(here, "bindings");
const distDir = path.join(here, "dist");

/** 预览用的 Wails 运行时桩（与 tools/dev-server.js 里保持同一份语义） */
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

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

/** 只服务 bindings 目录下的文件，并挡住路径穿越 */
function serveBinding(req, res, next) {
  const raw = String(req.url || "");
  const query = raw.indexOf("?");
  const pathname = decodeURIComponent(query >= 0 ? raw.slice(0, query) : raw);
  if (!pathname.startsWith("/bindings/")) return next();

  const rel = path.normalize(pathname.replace(/^\/bindings\/?/, "")).replace(/^([/\\])+/, "");
  const full = path.join(bindingsDir, rel);
  if (!full.startsWith(bindingsDir)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.statusCode = 404;
    res.end(`404 Not Found: ${pathname}（先跑 wails3 generate bindings -b -i）`);
    return;
  }
  res.setHeader("Content-Type", MIME[path.extname(full).toLowerCase()] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(full).pipe(res);
}

function wailsRuntimeShim() {
  const install = (server) => {
    server.middlewares.use((req, res, next) => {
      const raw = String(req.url || "");
      if (raw === "/wails/runtime.js" || raw.startsWith("/wails/runtime.js?")) {
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(RUNTIME_SHIM);
        return;
      }
      serveBinding(req, res, next);
    });
  };
  return {
    name: "musicplayer:wails-preview-shim",
    configureServer: install,
    configurePreviewServer: install,
  };
}

export default defineConfig({
  root: srcDir,
  base: "/",
  // 没有额外的原样拷贝目录：绑定与内置主题/皮肤由 tools/build-frontend.mjs 收尾
  publicDir: false,
  plugins: [wailsRuntimeShim()],
  resolve: {
    alias: {
      // 皮肤包以工作区包名引入；显式再给一条别名，保证在未跑 npm install 时也能解析
      "@musicplayer/player-skins": path.join(here, "packages", "player-skins", "src", "index.js"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    host: "127.0.0.1",
    fs: {
      // 皮肤包在 frontend/src 之外（frontend/packages），必须放行工作区根目录
      allow: [repoRoot],
    },
  },
  preview: {
    port: 4173,
    strictPort: false,
    host: "127.0.0.1",
  },
  build: {
    outDir: distDir,
    emptyOutDir: true,
    // 三个入口：
    //   index.html     主界面
    //   lyrics.html    桌面歌词窗口（独立透明页面，见 desktop_lyrics.go）
    //   wallpaper.html 桌面背景歌词窗口（铺在桌面图标之下的壁纸层，见 desktop_wallpaper.go）
    // 后两张页面刻意都不复用 index.html：那个页面会连带加载整套外壳与曲库初始化，
    // 对一个「只显示一行字」的透明小窗、和一张「会唱歌的壁纸」来说既慢又容易
    // 露出不该有的底色 —— 更重要的是，那正是需求里担心的「双份资源」。
    rollupOptions: {
      input: {
        index: path.join(srcDir, "index.html"),
        lyrics: path.join(srcDir, "lyrics.html"),
        wallpaper: path.join(srcDir, "wallpaper.html"),
      },
    },
    // WebView2 / Edge 版本足够新，可以放心用现代语法，省掉一堆降级辅助代码
    target: "chrome120",
    assetsDir: "assets",
    // 两个入口共用一份 CSS 产物（两个 HTML 的 <link> 指向同一个 style-*.css）。
    // 代价：任何「只服务于某张页面」的样式表都会同时作用到另一张页面上。
    // 所以页面级样式里的全局选择器（html / body / :root）必须自带作用域 ——
    // 例：desktoplyrics.css 的整窗透明规则锁在 html.dl-window 下，否则那条
    // background:transparent!important 会把主界面 body 的 --bg-window 打穿。
    cssCodeSplit: false,
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 900,
  },
});
