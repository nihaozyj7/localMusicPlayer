/* ==========================================================================
   check-settings-nav.mjs — 设置导航条在各窗口宽度下的布局自检
   --------------------------------------------------------------------------
   分类几经拆分合并（现在是 6 个：曲库 / 播放器 / 用户界面 / 下载与缓存 /
   AI / 关于），导航条始终是布局风险最高的地方：
     · 换行 → 导航条变成两三行，把卡片整体挤下去（所以改成了横向滚动）；
     · 溢出 → 横向滚动容器里 justify-content:center 会把两端推到可视区外
              且滚不到，最后几个分类（「关于」）点不到。

   这个脚本在若干个窗口宽度下打开设置层，量四件事：
     1. 导航条高度是否恒定一行（不超过单行高度 + 余量）；
     2. 每个导航按钮是否都能滚进可视区（scrollLeft 能覆盖它的位置）；
     3. 点最后一个分类（关于）能否真的跳过去并高亮；
     4. 卡片宽度有没有被导航条的滚动区域带歪。

   用与 shot-lit.mjs 相同的「静态服务 + headless Edge + CDP」方式起环境，
   不需要后端。用法：node tools/check-settings-nav.mjs
   ========================================================================== */

import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { join, dirname, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(root, "frontend", "dist");
const BINDINGS = join(root, "frontend", "bindings");
const PORT = 4902;
const CDP_PORT = 9348;

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) {
  console.error("找不到 msedge.exe");
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const RUNTIME_SHIM = `export class CancellablePromise extends Promise { cancel(){} cancelOn(){return this} }
export const Call = { ByID(){return Promise.reject(new Error("preview: no backend"))}, ByName(){return Promise.reject(new Error("preview: no backend"))}, ByAsync(){return Promise.reject(new Error("preview: no backend"))} };
export const Events = { On(){return ()=>{}}, Off(){}, Emit(){return Promise.resolve()} };
export default { Call, Events };`;

const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/wails/runtime.js") {
    res.writeHead(200, { "Content-Type": MIME[".js"] });
    return res.end(RUNTIME_SHIM);
  }
  if (p === "/early-theme.js") {
    res.writeHead(404);
    return res.end("// no backend");
  }
  const f = p.startsWith("/bindings/")
    ? join(BINDINGS, p.slice("/bindings/".length))
    : join(DIST, p === "/" ? "index.html" : p.replace(/^\//, ""));
  if (!existsSync(f) || statSync(f).isDirectory()) {
    res.writeHead(404);
    return res.end("404");
  }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const prof = join(tmpdir(), "lit-nav-" + Date.now());
mkdirSync(prof, { recursive: true });
const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${prof}`,
    `--remote-debugging-port=${CDP_PORT}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let version = null;
for (let i = 0; i < 60; i += 1) {
  await sleep(500);
  try {
    version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
    break;
  } catch {
    /* 还没起来 */
  }
}
if (!version) {
  edge.kill();
  server.close();
  process.exit(1);
}
const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
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
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.result?.exceptionDetails) {
    throw new Error(r.result.exceptionDetails.exception?.description || "eval failed");
  }
  return r.result?.result?.value;
}

await send("Page.enable");
await send("Runtime.enable");

const fail = [];
function check(name, ok, detail) {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fail.push(name);
}

for (const width of [1440, 1280, 1120, 1040, 1000]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 820,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
  await sleep(1400);

  const r = await evaluate(`(async () => {
    document.querySelector("#btn-settings").click();
    await new Promise(r => setTimeout(r, 500));
    const layer = document.querySelector("#settings-layer");
    const nav = layer.querySelector(".settings__nav");
    const items = [...nav.querySelectorAll(".settings__nav-item")];
    const card = layer.querySelector(".card");

    // 每个按钮相对滚动容器左边缘的位置
    const navBox = nav.getBoundingClientRect();
    const reach = items.map(b => {
      const box = b.getBoundingClientRect();
      return { label: b.textContent.trim(), left: box.left - navBox.left, w: box.width };
    });

    // 单行高度：按钮高 30 + 上下 padding（--sp-1 = 4px 各一）
    const singleLine = 30 + 8 + 2; // 边框
    const scrollable = nav.scrollWidth - nav.clientWidth > 1;

    // 能不能滚到最后一个
    nav.scrollLeft = nav.scrollWidth;
    await new Promise(r => setTimeout(r, 60));
    const lastBox = items[items.length - 1].getBoundingClientRect();
    const lastVisible = lastBox.left >= navBox.left - 1 && lastBox.right <= navBox.right + 1;
    nav.scrollLeft = 0;
    await new Promise(r => setTimeout(r, 60));

    return {
      count: items.length,
      labels: items.map(b => b.textContent.trim()),
      navH: Math.round(nav.getBoundingClientRect().height),
      singleLine,
      scrollable,
      overflow: Math.round(nav.scrollWidth - nav.clientWidth),
      lastVisible,
      lastLabel: items[items.length - 1].textContent.trim(),
      cardW: Math.round(card.getBoundingClientRect().width),
      bodyW: Math.round(layer.querySelector(".settings-layer__body").getBoundingClientRect().width),
      reach,
    };
  })()`);

  console.log(
    `\n[${width}px] ${r.count} 个分类，导航高 ${r.navH}px（单行上限 ${r.singleLine}px），溢出 ${r.overflow}px`
  );
  console.log(`        ${r.labels.join(" / ")}`);
  check(`${width}px 导航条保持单行`, r.navH <= r.singleLine, `高度 ${r.navH}px`);
  check(`${width}px 最后一个分类能滚进可视区`, r.lastVisible, `最后一项「${r.lastLabel}」`);
  // 6 类 = 曲库 / 播放器 / 用户界面 / 下载与缓存 / AI / 关于（见 settings-view.js 的 SECTIONS）
  check(`${width}px 6 个分类全部渲染`, r.count === 6, `实际 ${r.count}`);
  check(`${width}px 卡片宽度没有被导航条带歪`, r.cardW > 0 && r.cardW <= r.bodyW, `${r.cardW}/${r.bodyW}`);
}

/* 点最后一个分类：能不能真的跳过去 */
await send("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 820,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
await sleep(1400);
const jump = await evaluate(`(async () => {
  const layer = document.querySelector("#settings-layer");
  if (layer.hidden) { document.querySelector("#btn-settings").click(); await new Promise(r => setTimeout(r, 500)); }
  // ★ 取导航条上的**最后一项**而不是写死分区 id：分类几经合并，id 会变，
  //   但「最后一个分类能不能点得到」这条检查的意图不变。
  const items = [...layer.querySelectorAll(".settings__nav-item")];
  const btn = items[items.length - 1];
  if (!btn) return { __error: "导航条上一个分类都没有" };
  const lastName = btn.dataset.goto;
  const lastLabel = btn.textContent.trim();
  btn.click();
  // ★ 等到高亮真的落在最后一个分类为止，而不是睡一个固定时长：平滑滚动的时长
  //   取决于距离（这个分类在最底下，距离最长），写死 1.3s 会读到中间态
  //   （实测约 1.4s 才到位），于是把正常行为误判成失败。
  const comp = document.querySelector("mp-settings-layer");
  for (let i = 0; i < 40 && comp._activeSection !== lastName; i += 1) {
    await new Promise(r => setTimeout(r, 100));
  }
  await new Promise(r => setTimeout(r, 150));
  const active = layer.querySelector('.settings__nav-item[aria-selected="true"]')?.dataset.goto;
  const body = layer.querySelector(".settings-layer__body");
  const target = layer.querySelector('[data-section="' + lastName + '"]');
  const navH = layer.querySelector(".settings__nav").offsetHeight;
  const topGap = target.getBoundingClientRect().top - body.getBoundingClientRect().top;
  return { lastName, lastLabel, active, topGap: Math.round(topGap), navH, scrollTop: Math.round(body.scrollTop) };
})()`);
console.log(`\n[跳转] 点「${jump.lastLabel}」→ 高亮 ${jump.active}，目标卡片顶距 ${jump.topGap}px（导航高 ${jump.navH}px）`);
check("点最后一个分类能正确高亮", jump.active === jump.lastName, `实际 ${jump.active}`);
check("跳转后目标卡片没被导航条挡住", jump.topGap >= jump.navH - 1, `顶距 ${jump.topGap}px vs 导航 ${jump.navH}px`);

/* 最小窗口宽度（主窗口允许缩到 1000×680）下导航条一定会溢出 —— 单独确认
   横向滚动确实能覆盖到最后一个分类，这是这次改造要防的主要回归。 */
await send("Emulation.setDeviceMetricsOverride", {
  width: 1000,
  height: 680,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
await sleep(1400);
const tight = await evaluate(`(async () => {
  document.querySelector("#btn-settings").click();
  await new Promise(r => setTimeout(r, 500));
  const layer = document.querySelector("#settings-layer");
  const nav = layer.querySelector(".settings__nav");
  const items = [...nav.querySelectorAll(".settings__nav-item")];
  const navBox = nav.getBoundingClientRect();
  const overflow = Math.round(nav.scrollWidth - nav.clientWidth);
  // 滚到最右，确认最后一个按钮完整可见
  nav.scrollLeft = nav.scrollWidth;
  await new Promise(r => setTimeout(r, 80));
  const lb = items[items.length - 1].getBoundingClientRect();
  const lastFullyVisible = lb.left >= navBox.left - 1 && lb.right <= navBox.right + 1;
  // 滚到最左，确认第一个按钮也没被推出去
  nav.scrollLeft = 0;
  await new Promise(r => setTimeout(r, 80));
  const fb = items[0].getBoundingClientRect();
  const firstFullyVisible = fb.left >= navBox.left - 1 && fb.right <= navBox.right + 1;
  return { overflow, lastFullyVisible, firstFullyVisible, count: items.length, navH: nav.offsetHeight };
})()`);
console.log(`\n[1000×680 最小窗口] 溢出 ${tight.overflow}px，导航高 ${tight.navH}px`);
check("最小窗口下导航条仍然单行", tight.navH <= 40, `高度 ${tight.navH}px`);
check("最小窗口下横向滚动能滚到最后一个分类", tight.lastFullyVisible, `溢出 ${tight.overflow}px`);
check("最小窗口下第一个分类仍然完整可见（居中没把它推出可视区）", tight.firstFullyVisible);

ws.close();
edge.kill();
server.close();
console.log(`\n${fail.length ? `✖ ${fail.length} 项失败：${fail.join("; ")}` : "✔ 全部通过"}`);
process.exit(fail.length ? 1 : 0);
