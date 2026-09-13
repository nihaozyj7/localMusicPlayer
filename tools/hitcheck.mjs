/* ==========================================================================
   hitcheck.mjs — 找出「点击任何按钮都没反应」的元凶
   --------------------------------------------------------------------------
   做法：打开真实应用，用 document.elementFromPoint 检查窗口中心与各个
   已知按钮位置上「真正接住事件的是谁」，再对所有覆盖层报告
   hidden / display / z-index / pointer-events。
   ========================================================================== */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const EXE = path.resolve(ROOT, arg("exe", "bin/musicplayer.exe"));
const PORT = Number(arg("port", "9391"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EXE, [], {
  env: {
    ...process.env,
    MUSICPLAYER_DEBUG_PORT: String(PORT),
    WEBVIEW2_USER_DATA_FOLDER: path.join(ROOT, ".tmp-hitcheck", "wv2"),
    MUSICPLAYER_DATA_DIR: path.join(ROOT, ".tmp-hitcheck", "data"),
    MUSICPLAYER_MUSIC_DIR: path.join(ROOT, ".tmp-hitcheck", "Music"),
  },
  stdio: "ignore",
});

const get = (p) =>
  new Promise((res, rej) =>
    http
      .get({ host: "127.0.0.1", port: PORT, path: p }, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => res(d));
      })
      .on("error", rej)
  );

let target = null;
for (let i = 0; i < 120 && !target; i += 1) {
  await sleep(400);
  try {
    target = JSON.parse(await get("/json/list")).find((t) => t.type === "page");
  } catch {
    /* 等 DevTools */
  }
}
if (!target) {
  console.error("无法连接调试端口");
  child.kill();
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let id = 0;
const send = (m, p = {}) =>
  new Promise((r) => {
    id += 1;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method: m, params: p }));
  });
const errors = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.exceptionThrown") {
    errors.push(
      "EXC " + m.params.exceptionDetails.text + " " + (m.params.exceptionDetails.exception?.description || "")
    );
  } else if (m.method === "Runtime.consoleAPICalled") {
    const text = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
    if (m.params.type === "error" && !/favicon/i.test(text)) errors.push("ERR " + text);
  }
});
await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");

const evalJs = async (expr) => {
  const res = await send("Runtime.evaluate", {
    expression: `(async () => { ${expr} })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res?.exceptionDetails) {
    return { __error: res.exceptionDetails.text + " " + (res.exceptionDetails.exception?.description || "") };
  }
  return res?.result?.value;
};

await send("Runtime.enable");
for (let i = 0; i < 60; i += 1) {
  const ready = await send("Runtime.evaluate", {
    expression: "document.body.dataset.ready === 'true'",
    returnByValue: true,
  });
  if (ready?.result?.value === true) break;
  await sleep(500);
}
await sleep(2000);

console.log("=== 应用就绪，开始体检 ===\n");

const report = await evalJs(`
  const info = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      cls: (el.className || "").toString().slice(0, 60),
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      pointerEvents: cs.pointerEvents,
      zIndex: cs.zIndex,
      position: cs.position,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      hidden: el.hidden,
    };
  };
  const at = (x, y) => info(document.elementFromPoint(x, y));
  const w = window.innerWidth, h = window.innerHeight;
  return {
    viewport: [w, h],
    center: at(w / 2, h / 2),
    sideTop: at(100, 120),
    contentMid: at(w / 2, 400),
    toolsArea: at(w - 200, 90),
    ready: document.body.dataset.ready,
    // 所有可能盖住页面的层
    layers: [
      ["search-overlay", document.getElementById("search-overlay")],
      ["settings-layer", document.getElementById("settings-layer")],
      ["cover-layer", document.getElementById("cover-layer")],
      ["queue-panel", document.getElementById("queue-panel")],
      ["modal-backdrop", document.getElementById("modal-backdrop")],
      ["playerview", document.getElementById("playerview")],
      ["toasts", document.getElementById("toasts")],
      ["scanning", document.getElementById("scanning")],
      ["menu", document.getElementById("menu")],
    ].map(([name, el]) => ({ name, ...(info(el) || { missing: true }) })),
  };
`);

console.log("viewport:", JSON.stringify(report.viewport));
console.log("中心点命中:", JSON.stringify(report.center));
console.log("侧边栏命中:", JSON.stringify(report.sideTop));
console.log("内容区命中:", JSON.stringify(report.contentMid));
console.log("工具条命中:", JSON.stringify(report.toolsArea));
console.log("");
console.log("覆盖层状态:");
for (const l of report.layers) {
  console.log("  " + JSON.stringify(l));
}
console.log("");
console.log("运行时报错:", errors.length ? errors.join("\n") : "无");

/* 真点一下侧边栏的「播放列表」，看状态有没有变化 */
const before = await evalJs(`return window.__app.state.view;`);
const navBox = await evalJs(`
  const el = document.querySelector('[data-nav="queue"]');
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { x, y, hitsSelf: Boolean(top && (top === el || el.contains(top))), top: top ? (top.className || top.tagName).toString().slice(0, 40) : "" };
`);
if (navBox?.x) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: navBox.x, y: navBox.y, button: "none" });
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: navBox.x,
    y: navBox.y,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: navBox.x,
    y: navBox.y,
    button: "left",
    clickCount: 1,
  });
}
await sleep(500);
const after = await evalJs(`return window.__app.state.view;`);
console.log("");
console.log(`真实鼠标点击「播放列表」：命中自身=${navBox?.hitsSelf} top=${navBox?.top}`);
console.log(`  视图变化：${before} → ${after} ${after === "queue" ? "✅ 可交互" : "❌ 仍被挡住"}`);

/* 再验一次：打开设置 → 关闭 → 界面仍可点 */
const settingsBox = await evalJs(`
  const el = document.getElementById("btn-settings");
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
`);
if (settingsBox?.x) {
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: settingsBox.x,
    y: settingsBox.y,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: settingsBox.x,
    y: settingsBox.y,
    button: "left",
    clickCount: 1,
  });
}
await sleep(600);
const opened = await evalJs(`const l = document.getElementById("settings-layer"); return l ? !l.hidden : false;`);
console.log(`真实鼠标点击设置按钮 → 设置层打开=${opened} ${opened ? "✅" : "❌"}`);

const closeBox = await evalJs(`
  const el = document.querySelector("[data-settings-close]");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
`);
if (closeBox?.x) {
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: closeBox.x,
    y: closeBox.y,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: closeBox.x,
    y: closeBox.y,
    button: "left",
    clickCount: 1,
  });
}
await sleep(500);
const closed = await evalJs(`
  const l = document.getElementById("settings-layer");
  return l ? l.hidden : null;
`);
console.log(`真实鼠标点击关闭 → 设置层隐藏=${closed} ${closed ? "✅" : "❌"}`);

ws.close();
child.kill();
