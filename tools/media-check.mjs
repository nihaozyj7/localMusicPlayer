/* ==========================================================================
   media-check.mjs — 用无头浏览器验证「页面跨源加载音频服务」是否可行
   --------------------------------------------------------------------------
   为什么需要它：
     打包后前端运行在 Wails 的虚拟主机上（http://wails.localhost），
     而音频服务在 http://127.0.0.1:<随机端口> —— 两者是不同源。
     <audio> 元素能否播放、Web Audio 能否分析，都取决于这里的跨源行为。
     这个脚本把两种情况都实测一遍，输出真实的失败原因。

   用法：node tools/media-check.mjs
   ========================================================================== */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].find(existsSync);

if (!EDGE) {
  console.error("找不到 Edge/Chrome");
  process.exit(1);
}

// 由外部传入：音频服务地址 + 一首歌的播放 URL（由 realcheck 提供）
const AUDIO_URL = process.env.MP_AUDIO_URL || "";
const CROSSORIGIN = process.env.MP_CROSSORIGIN || ""; // "", "anonymous", "use-credentials"
if (!AUDIO_URL) {
  console.error("请通过 MP_AUDIO_URL 传入播放地址");
  process.exit(1);
}

const PAGE_PORT = 5199;
const CDP_PORT = 9333;

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>media-check</title></head>
<body><script>
window.onerror = (m) => { console.log("PAGE_ERROR " + m); };
window.addEventListener("unhandledrejection", (e) => { console.log("PAGE_REJECT " + (e.reason && e.reason.message || e.reason)); });
const url = ${JSON.stringify(AUDIO_URL)};
const crossOrigin = ${JSON.stringify(CROSSORIGIN)};
const result = { crossOrigin: crossOrigin || "(未设置)", url: url.replace(/t=.*/, "t=***") };
const trace = [];
window.__trace = trace;
function step(s) { trace.push(s); console.log("STEP " + s); }

async function run() {
  step("start");
  // 1) fetch 探测（只取头部，避免为测试拉整首歌）
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    step("fetch:begin");
    const res = await fetch(url, { signal: ctl.signal, headers: { Range: "bytes=0-1023" } });
    clearTimeout(timer);
    step("fetch:headers");
    result.fetch = {
      status: res.status,
      type: res.type,
      contentType: res.headers.get("content-type"),
      contentRange: res.headers.get("content-range"),
      contentLength: res.headers.get("content-length"),
      acceptRanges: res.headers.get("accept-ranges"),
    };
    const buf = await res.arrayBuffer();
    step("fetch:done");
    result.fetch.bytes = buf.byteLength;
  } catch (err) {
    result.fetch = { error: String(err && err.message || err) };
  }

  // 2) <audio> 元素：只等 loadedmetadata（浏览器据此拿到时长）
  step("audio:begin");
  result.audio = await new Promise((resolve) => {
    const el = new Audio();
    if (crossOrigin) el.crossOrigin = crossOrigin;
    el.preload = "metadata";
    const done = (o) => { clearTimeout(timer); el.src = ""; resolve(o); };
    const timer = setTimeout(() => done({ outcome: "timeout", readyState: el.readyState, networkState: el.networkState }), 25000);
    el.addEventListener("loadedmetadata", () => {
      done({ outcome: "loadedmetadata", duration: el.duration, readyState: el.readyState });
    });
    el.addEventListener("error", () => {
      const e = el.error;
      done({ outcome: "error", code: e && e.code, message: e && e.message, networkState: el.networkState });
    });
    el.src = url;
    el.load();
  });
  step("audio:done");

  // 3) Web Audio 分析（响度均衡要用；跨源且无 CORS 时这里会读到 0）
  try {
    step("webaudio:begin");
    const ctx = new AudioContext();
    const el = new Audio();
    if (crossOrigin) el.crossOrigin = crossOrigin;
    el.src = url;
    const src = ctx.createMediaElementSource(el);
    const analyser = ctx.createAnalyser();
    src.connect(analyser);
    analyser.connect(ctx.destination);
    await el.play().catch((e) => { result.playError = String(e && e.message || e); });
    step("webaudio:playing");
    // 最多等 4 秒取样，够判断是不是纯静音
    const t0 = Date.now();
    let max = 0;
    while (Date.now() - t0 < 4000) {
      await new Promise((r) => setTimeout(r, 250));
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      for (const v of data) max = Math.max(max, Math.abs(v - 128));
      if (max > 0) break;
    }
    result.webAudio = {
      peakDeviation: max,
      nonSilent: max > 0,
      contextState: ctx.state,
      currentTime: el.currentTime,
      readyState: el.readyState,
      networkState: el.networkState,
    };
    el.pause();
    step("webaudio:sampled");
    // close() 在某些流式源下会一直挂着，加超时避免整个检查卡死
    await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 2000))]);
    step("webaudio:done");
  } catch (err) {
    result.webAudio = { error: String(err && err.message || err) };
  }

  document.title = "DONE";
  window.__result = result;
  console.log("MEDIA_CHECK_RESULT " + JSON.stringify(result));
}
run();
</script></body></html>`;

// 用「另一个端口」当页面源，模拟 wails.localhost 与 127.0.0.1 的跨源关系
const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(page);
});

await new Promise((r) => server.listen(PAGE_PORT, "127.0.0.1", r));
console.log(`页面地址: http://127.0.0.1:${PAGE_PORT}/   （音频源: ${AUDIO_URL.replace(/t=.*/, "t=***")}）`);

const profile = mkdtempSync(path.join(tmpdir(), "mp-mediacheck-"));
const edge = spawn(
  EDGE,
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--disable-extensions",
    "--autoplay-policy=no-user-gesture-required",
    `http://127.0.0.1:${PAGE_PORT}/`,
  ],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpTargets() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const list = await res.json();
      const t = list.find((x) => x.type === "page" && x.webSocketDebuggerUrl);
      if (t) return t;
    } catch {
      /* 还没起来 */
    }
    await sleep(250);
  }
  return null;
}

const target = await cdpTargets();
if (!target) {
  console.error("无法连接到浏览器调试端口");
  edge.kill();
  server.close();
  process.exit(1);
}

const { WebSocket } = await import("node:worker_threads").then(() => ({ WebSocket: globalThis.WebSocket }));
const ws = new WebSocket(target.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
const logs = [];

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
  if (msg.method === "Runtime.consoleAPICalled") {
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
    logs.push(text);
  }
  if (msg.method === "Runtime.exceptionThrown") {
    logs.push("EXCEPTION " + (msg.params.exceptionDetails?.text || ""));
  }
});

function send(method, params = {}) {
  msgId += 1;
  const id = msgId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");
await send("Page.enable");

// 等页面把结果打出来（转码流首次取样可能较慢，给足时间）
let found = null;
for (let i = 0; i < 140; i += 1) {
  await sleep(500);
  const line = logs.find((l) => l.startsWith("MEDIA_CHECK_RESULT"));
  if (line) {
    found = JSON.parse(line.replace("MEDIA_CHECK_RESULT ", ""));
    break;
  }
}

console.log("\n================ 结果 ================");
if (!found) {
  console.log("!! 页面没有产出结果。执行轨迹与控制台日志：");
  for (const l of logs.slice(-30)) console.log("   " + l);
} else {
  console.log(JSON.stringify(found, null, 2));
}
console.log("=====================================\n");

ws.close();
edge.kill();
server.close();
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  /* 忽略 */
}
process.exit(found ? 0 : 1);
