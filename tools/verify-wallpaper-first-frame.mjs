/* ==========================================================================
   verify-wallpaper-first-frame.mjs — 桌面背景歌词「启动时黑一下」的验证
   --------------------------------------------------------------------------
   修复思路：窗口先用 DWM 遮罩「显示但看不见」地把首帧渲染出来，页面确认
   这一帧已经交给合成器之后，Go 侧才挂进桌面壁纸层 + 摘遮罩
   （Go 侧 desktop_wallpaper.go#ensureDesktopWallpaper / MarkDesktopWallpaperPainted，
   Windows 侧 desktop_wallpaper_windows.go#armDesktopWallpaperOffscreen）。
   黑屏的成因就是「露面」与「画好」之间那段时间：页面自己的底色是深色，
   而皮肤要等主窗口把曲目/封面/歌词/主题推过来才画得出东西。

   本脚本验证**页面这一半**的判据：什么时候算「画好了」。
   注意「画好了」还包含**两帧 rAF**（afterPaint）—— 所以下面每条断言前的等待
   都在 300ms 以上，而不是原来那样 120ms。
   它用一个假的 /wails/runtime.js 把后端接上，然后：
     1. 只推样式（theme）→ 皮肤挂上了，但还没有媒体快照 → 不许显示；
     2. 再推媒体（song）    → 皮肤 + 数据都到位 → 必须通知显示（且只通知一次）；
     3. 之后再来增量        → 不许重复通知（幂等）；
     4. 换一个顺序（先 song 后 theme）→ 结论必须一样；
     5. 曲库为空（song 是 null）→ 也算合法画面，必须通知。

   用法：node tools/verify-wallpaper-first-frame.mjs   （需先 npm run build）
   ========================================================================== */

import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(root, "frontend", "dist");
const PORT = 4997;
const CDP_PORT = 9341;
const W = 1280;
const H = 800;

if (!existsSync(join(DIST, "wallpaper.html"))) {
  console.error("frontend/dist 不存在，先跑 npm run build");
  process.exit(1);
}

/** 从生成的绑定里取出两个方法的调用 ID（stub 靠它分辨谁是谁） */
function bindingId(file, fnName) {
  const src = readFileSync(join(DIST, "bindings", "localmusicplayer", file), "utf8");
  const m = new RegExp(`export function ${fnName}\\(\\)\\s*\\{\\s*return \\$Call\\.ByID\\((\\d+)\\)`).exec(src);
  if (!m) throw new Error(`绑定里找不到 ${fnName}`);
  return m[1];
}
const READY_ID = bindingId("windowservice.js", "MarkDesktopWallpaperReady");
const PAINTED_ID = bindingId("windowservice.js", "MarkDesktopWallpaperPainted");

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) {
  console.error("找不到 msedge.exe");
  process.exit(1);
}

/** 假的后端运行时：记录调用、可被测试驱动地派发事件 */
const RUNTIME_STUB = `
export class CancellablePromise extends Promise { cancel() {} cancelOn() { return this; } }
const st = (window.__stub = { calls: [], painted: 0, handlers: {}, readyPayload: {} });
const READY = ${READY_ID};
const PAINTED = ${PAINTED_ID};
export const Call = {
  ByID(id) {
    st.calls.push(id);
    if (id === READY) return Promise.resolve(st.readyPayload || {});
    if (id === PAINTED) { st.painted += 1; return Promise.resolve({ ok: true }); }
    return Promise.resolve({});
  },
  ByName() { return Promise.resolve({}); },
  ByIDAsync() { return Promise.resolve({}); },
  ByNameAsync() { return Promise.resolve({}); },
};
export const Events = {
  On(name, cb) { (st.handlers[name] = st.handlers[name] || []).push(cb); return () => {}; },
  Off() {}, Emit() {}, Once() { return () => {}; },
};
export const WML = { Enable() {}, OpenURL() {} };
export const Flags = { Get() { return null; } };
export const Browser = { OpenURL() {} };
export const Window = { SetTitle() {} };
export default { Call, Events, WML, Flags, CancellablePromise };
`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/wails/runtime.js") {
    res.writeHead(200, { "Content-Type": MIME[".js"], "Cache-Control": "no-store" });
    return res.end(RUNTIME_STUB);
  }
  const f = join(DIST, (p === "/" ? "/index.html" : p).replace(/^\//, ""));
  if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) {
    res.writeHead(404);
    return res.end("404 " + p);
  }
  res.writeHead(200, { "Content-Type": MIME[extname(f).toLowerCase()] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const prof = join(tmpdir(), "wf-profile-" + Date.now());
mkdirSync(prof, { recursive: true });
const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    `--user-data-dir=${prof}`,
    `--remote-debugging-port=${CDP_PORT}`,
    `--window-size=${W},${H}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function done(code) {
  try {
    edge.kill();
    server.close();
  } catch {
    /* ignore */
  }
  process.exit(code);
}

let version = null;
for (let i = 0; i < 60 && !version; i++) {
  await sleep(500);
  try {
    version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
  } catch {
    /* 还没起来 */
  }
}
if (!version) {
  console.error("CDP 端点未就绪");
  done(1);
}
console.log("浏览器:", version.Browser);

const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
if (!page) {
  console.error("没有 page target");
  done(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  const res = r.result;
  if (res?.exceptionDetails)
    return { __error: res.exceptionDetails.exception?.description || res.exceptionDetails.text };
  return res?.result?.value;
}

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

const SONG = {
  id: "t_demo",
  title: "验证曲目",
  artist: "测试歌手",
  album: "测试专辑",
  ext: "flac",
  duration: 200000,
};
const THEME = { type: "theme", skinId: "classic", theme: "dark-minimal", mode: "dark", density: "cozy", tokens: {} };
const SONG_PATCH = {
  type: "song",
  song: SONG,
  cover: "",
  covers: [],
  coverIndex: 0,
  lyrics: { lines: [], text: "", source: "none", index: -1 },
};

/** 重新加载页面，等 boot 跑完 */
async function load(payload) {
  await evaluate(`(() => { window.__stubPayload = null; })()`);
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/wallpaper.html` });
  await sleep(400);
  await evaluate(`(() => { if (window.__stub) window.__stub.readyPayload = ${JSON.stringify(payload)}; })()`);
  await sleep(1200);
}
const painted = () => evaluate("window.__stub ? window.__stub.painted : -1");
const emit = (patch) =>
  evaluate(`(() => {
    const hs = (window.__stub && window.__stub.handlers["desktop:wallpaper"]) || [];
    for (const h of hs) h({ data: ${JSON.stringify(patch)} });
    return hs.length;
  })()`);

const results = [];
const check = (name, ok) => {
  results.push([name, !!ok]);
  console.log(`${ok ? "ok  " : "FAIL"} - ${name}`);
};

/* ---- 场景 1：先样式、后媒体 ---- */
await load({});
check("初始为空快照时不显示（没有皮肤也没有数据）", (await painted()) === 0);
check("事件订阅已建立", (await emit(THEME)) > 0);
check("只挂上皮肤（还没有媒体）时不显示", (await painted()) === 0);
await emit(SONG_PATCH);
await sleep(300);
check("皮肤 + 媒体都到位 → 立刻通知显示", (await painted()) === 1);
await emit({ type: "progress", position: 1000, duration: 200000, playing: true, lyricIndex: 0 });
await sleep(300);
check("之后的增量不重复通知（幂等）", (await painted()) === 1);
const mounted = await evaluate(
  `(() => { const v = document.getElementById("wp-playerview");
     return { skin: v.dataset.skin, hidden: v.hidden, appMode: document.getElementById("wp-app").dataset.mode }; })()`
);
check("皮肤真的挂上了（data-skin=classic）", mounted.skin === "classic");
check("皮肤容器已撤掉 hidden", mounted.hidden === false);
check("整窗背景层的 mode 钩子已打上", mounted.appMode === "classic");

/* ---- 场景 2：先媒体、后样式（IPC 顺序不保证）---- */
await load({});
await emit(SONG_PATCH);
await sleep(300);
check("只有媒体、还没有样式时不显示", (await painted()) === 0);
await emit(THEME);
await sleep(300);
check("样式随后到位 → 通知显示", (await painted()) === 1);

/* ---- 场景 3：曲库为空（song 是 null）也算合法画面 ---- */
await load({});
await emit(THEME);
await sleep(80);
await emit({
  type: "song",
  song: null,
  cover: "",
  covers: [],
  coverIndex: 0,
  lyrics: { lines: [], text: "", source: "none", index: -1 },
});
await sleep(300);
check("song 为 null（曲库为空）也要显示，不能永远不出现", (await painted()) === 1);

ws.close();

const bad = results.filter(([, ok]) => !ok).length;
console.log(bad ? `\n${bad} 项未通过` : "\n全部通过：桌面背景歌词窗口只在「皮肤 + 数据都到位」后才显示。");
done(bad ? 1 : 0);
