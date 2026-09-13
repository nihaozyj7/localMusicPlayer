/* ==========================================================================
   ui-narrow.mjs — 窄窗口（最小尺寸 1000×680）布局自检
   --------------------------------------------------------------------------
   播放控件在 1000px 宽时要放下：封面/曲目信息 + 传输控制 + 音量 + 四个图标。
   这里用 CDP 把视口固定成 1000×680，逐个检查关键区域是否重叠、是否溢出。
   用法：node tools/ui-narrow.mjs [baseURL]
   ========================================================================== */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) {
  console.error("找不到 Microsoft Edge");
  process.exit(2);
}

const PORT = Number(process.env.CDP_PORT || 9455);
const BASE = process.argv[2] || "http://127.0.0.1:5173/";
const WIDTHS = [1440, 1280, 1120, 1040, 1000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: PORT, path }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

const child = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\mp-edge-narrow`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

let target = null;
for (let i = 0; i < 80 && !target; i += 1) {
  await sleep(250);
  try {
    const list = JSON.parse(await get("/json/list"));
    target = list.find((t) => t.type === "page") || null;
  } catch {
    /* 等 DevTools */
  }
}
if (!target) {
  console.error("无法连接 DevTools");
  child.kill();
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let msgId = 0;
const send = (method, params = {}) =>
  new Promise((resolve) => {
    msgId += 1;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
});
await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");
await send("Page.enable");

async function evalJs(expression) {
  const res = await send("Runtime.evaluate", {
    expression: `(async () => { ${expression} })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res?.exceptionDetails) throw new Error(res.exceptionDetails.text);
  return res?.result?.value;
}

const failures = [];

for (const w of WIDTHS) {
  const h = w <= 1040 ? 680 : 820;
  await send("Emulation.setDeviceMetricsOverride", {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: `${BASE}?playing=1` });
  await sleep(2200);

  const m = await evalJs(`
    const r = (sel) => { const n = document.querySelector(sel); if (!n) return null; const b = n.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) }; };
    const bar = r(".playerbar");
    const now = r(".playerbar__now");
    const center = r(".playerbar__center");
    const tools = r(".playerbar__tools");
    const prog = r(".playerbar__progress");
    const row = r(".playerbar__row");
    const vol = r(".volume__slider");
    const icon = r("#btn-play");
    return {
      vw: window.innerWidth,
      docScrollW: document.documentElement.scrollWidth,
      titlebarH: r(".titlebar")?.h,
      barH: bar?.h,
      barBottom: bar?.bottom,
      overlapNowCenter: now && center ? now.right - center.x : null,
      overlapCenterTools: center && tools ? center.right - tools.x : null,
      progRowOverlap: prog && row ? prog.bottom - row.y : null,
      rowInsideBar: bar && row ? bar.bottom - row.bottom : null,
      toolsRightOverflow: tools ? tools.right - window.innerWidth : null,
      nowWidth: now?.w,
      centerWidth: center?.w,
      toolsWidth: tools?.w,
      volumeVisible: vol ? vol.w > 0 : false,
      // 传输控制（中间块）相对窗口的实际偏移：0 = 严格居中
      centerOffset: icon ? Math.round((icon.x + icon.w / 2) - window.innerWidth / 2) : null,
    };
  `);

  const issues = [];
  if (m.docScrollW > m.vw + 1) issues.push(`横向溢出 ${m.docScrollW} > ${m.vw}`);
  if (m.overlapNowCenter > 1) issues.push(`曲目信息与传输控制重叠 ${m.overlapNowCenter}px`);
  if (m.overlapCenterTools > 1) issues.push(`传输控制与右侧工具重叠 ${m.overlapCenterTools}px`);
  if (m.progRowOverlap > 2) issues.push(`进度条与控制行重叠 ${m.progRowOverlap}px`);
  if (m.rowInsideBar < -1) issues.push(`控制行溢出播放控件 ${-m.rowInsideBar}px`);
  if (m.toolsRightOverflow > 1) issues.push(`右侧工具超出视口 ${m.toolsRightOverflow}px`);
  if (m.centerOffset === null || Math.abs(m.centerOffset) > 1) {
    issues.push(`传输控制未居中，偏离窗口中心 ${m.centerOffset}px`);
  }

  const label = `${w}x${h}`;
  if (issues.length) {
    failures.push(label);
    console.log(`[!! ] ${label}  ${issues.join(" | ")}`);
  } else {
    console.log(
      `[OK ] ${label}  bar=${m.barH}px now=${m.nowWidth} center=${m.centerWidth}(偏移 ${m.centerOffset}px) tools=${m.toolsWidth} volume=${m.volumeVisible ? "显示" : "收起"}`
    );
  }
}

ws.close();
child.kill();
console.log("");
console.log(
  failures.length ? `窄窗口自检失败：${failures.join(", ")}` : `窄窗口自检全部通过（${WIDTHS.length} 档宽度）`
);
process.exit(failures.length ? 1 : 0);
