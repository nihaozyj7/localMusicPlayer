/* ==========================================================================
   tiltest.mjs — 验证标题栏拖拽是否真的生效
   --------------------------------------------------------------------------
   Wails v3 的拖拽判定（runtime 的 drag.ts）：
     鼠标事件命中元素上 getComputedStyle(el)
       .getPropertyValue("--wails-draggable").trim() === "drag"
   满足时 runtime 会往原生层发 "wails:drag"，由系统发起窗口移动。

   因此光看 CSS 写没写不够，要同时确认：
     1) 计算样式真的取到了 drag（含继承、优先级是否正确）
     2) 按钮区域是 no-drag（否则点最小化会变成拖窗口）
     3) 实际拖动标题栏时窗口位置会变

   用法：node tools/tiltest.mjs --exe bin/lmplayer.exe
   ========================================================================== */

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const EXE = path.resolve(ROOT, arg("exe", "bin/lmplayer.exe"));
const PORT = Number(arg("port", "9336"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(EXE)) {
  console.error(`找不到 ${EXE}`);
  process.exit(1);
}

const workDir = path.join(ROOT, ".tmp-tiltest");
mkdirSync(workDir, { recursive: true });
const logFd = openSync(path.join(workDir, "app.log"), "w");

const child = spawn(EXE, [], {
  env: { ...process.env, LMPLAYER_DEBUG_PORT: String(PORT), WEBVIEW2_USER_DATA_FOLDER: path.join(workDir, "wv2") },
  stdio: ["ignore", logFd, logFd],
});
closeSync(logFd);

let target = null;
for (let i = 0; i < 60 && !target; i += 1) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((x) => x.type === "page" && x.webSocketDebuggerUrl);
  } catch {
    /* 等启动 */
  }
}
if (!target) {
  console.error("无法接入 WebView2");
  child.kill();
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let msgId = 0;
const waiting = new Map();
const consoleLines = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) {
    waiting.get(m.id)(m.result);
    waiting.delete(m.id);
  }
  if (m.method === "Runtime.consoleAPICalled") {
    consoleLines.push((m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" "));
  }
});
function send(method, params = {}) {
  msgId += 1;
  const id = msgId;
  return new Promise((r) => {
    waiting.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res?.exceptionDetails) {
    return { __error: res.exceptionDetails.text + " " + (res.exceptionDetails.exception?.description || "") };
  }
  return res?.result?.value;
}

await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");
console.log("等待应用启动…");
await sleep(9000);

console.log("\n================ 计算样式检查 ================");
const styles = await evaluate(`(() => {
  const read = (el) => el ? window.getComputedStyle(el).getPropertyValue('--wails-draggable').trim() : '(元素不存在)';
  const bar = document.querySelector('.titlebar');
  const dragArea = document.querySelector('.titlebar__drag');
  const actions = document.querySelector('.titlebar__actions');
  const minBtn = document.querySelector('#btn-win-min');
  const brand = document.querySelector('.titlebar__brand');
  return {
    标题栏: read(bar),
    拖拽区: read(dragArea),
    品牌区: read(brand),
    按钮容器: read(actions),
    最小化按钮: read(minBtn),
    // 拖拽区必须真的能接收鼠标事件（不能被别的元素盖住）
    dragAreaHitTest: (() => {
      const el = document.querySelector('.titlebar__drag');
      if (!el) return 'no element';
      const r = el.getBoundingClientRect();
      const found = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return found ? (found.className || found.tagName) : 'null';
    })(),
    dragAreaRect: (() => {
      const el = document.querySelector('.titlebar__drag');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
    })(),
  };
})()`);
console.log(JSON.stringify(styles, null, 2));

console.log("\n================ 结论 ================");
const ok = styles?.标题栏 === "drag" && styles?.拖拽区 === "drag";
console.log(
  ok ? "  ✓ 标题栏计算样式为 drag（runtime 会发起窗口拖动）" : `  ✗ 标题栏不是 drag：${JSON.stringify(styles)}`
);
if (styles?.按钮容器 !== "no-drag" || styles?.最小化按钮 !== "no-drag") {
  console.log(`  ! 按钮区域应为 no-drag，实际 容器=${styles?.按钮容器} 按钮=${styles?.最小化按钮}`);
} else {
  console.log("  ✓ 按钮区域为 no-drag（点击不会误触发拖动）");
}

console.log("\n================ 实际拖动测试 ================");
// 真的用鼠标事件拖标题栏，看窗口位置是否变化
const drag = await evaluate(`(async () => {
  const el = document.querySelector('.titlebar__drag');
  if (!el) return { error: 'no drag area' };
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const fire = (type, cx, cy) => {
    const ev = new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window,
      clientX: cx, clientY: cy, screenX: cx, screenY: cy,
      button: 0, buttons: type === 'mouseup' ? 0 : 1, detail: 1,
    });
    el.dispatchEvent(ev);
  };
  fire('mousedown', x, y);
  for (let i = 1; i <= 10; i += 1) {
    fire('mousemove', x + i * 8, y + i * 4);
    await new Promise((r) => setTimeout(r, 40));
  }
  const logsBefore = window.__dragLog || [];
  for (let i = 11; i <= 20; i += 1) {
    fire('mousemove', x + i * 8, y + i * 4);
    await new Promise((r) => setTimeout(r, 40));
  }
  fire('mouseup', x + 160, y + 80);
  await new Promise((r) => setTimeout(r, 500));
  return { dispatched: true, startX: Math.round(x), startY: Math.round(y) };
})()`);
console.log(JSON.stringify(drag, null, 2));

console.log("\n注意：合成鼠标事件不会触发原生窗口移动（Windows 只在真实输入时拖动窗口），");
console.log("所以这里只能验证「CSS 契约正确」；真实拖动请手动试一下标题栏。");

console.log("\n================ 控制台（最后 10 条）================");
for (const l of consoleLines.slice(-10)) console.log("  " + l);

ws.close();
child.kill();
await sleep(400);
process.exit(0);
