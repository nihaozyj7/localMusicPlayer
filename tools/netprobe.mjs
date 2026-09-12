/* ==========================================================================
   netprobe.mjs — 在真实应用里抓网络层证据，判断音频请求是否真的发出去了
   --------------------------------------------------------------------------
   应用里 <audio> 报 "Media load rejected by URL safety check"。
   CDP 的 Network 域能区分两种可能：
     · 请求从未出现在 Network 事件里 → 被浏览器内部策略在发起前拦掉
     · 请求发出但响应被丢弃        → 看响应头/状态定位
   同时打印 WebView2 版本与运行时特性开关，便于比对可用解法。

   用法：node tools/netprobe.mjs
   ========================================================================== */

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const EXE = path.resolve(ROOT, process.argv.includes("--exe")
  ? process.argv[process.argv.indexOf("--exe") + 1]
  : "bin/musicplayer-debug.exe");
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const workDir = path.join(ROOT, ".tmp-netprobe");
mkdirSync(workDir, { recursive: true });

const logFd = openSync(path.join(workDir, "app.log"), "w");
const child = spawn(EXE, [], {
  env: { ...process.env, MUSICPLAYER_DEBUG_PORT: String(PORT), WEBVIEW2_USER_DATA_FOLDER: path.join(workDir, "wv2") },
  stdio: ["ignore", logFd, logFd],
});
closeSync(logFd);

let target = null;
for (let i = 0; i < 60 && !target; i += 1) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((x) => x.type === "page" && x.webSocketDebuggerUrl);
  } catch { /* 等启动 */ }
}
if (!target) {
  console.error("无法接入 WebView2");
  child.kill();
  process.exit(1);
}

const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
console.log("================ WebView2 版本 ================");
console.log(JSON.stringify(version, null, 2));

const ws = new WebSocket(target.webSocketDebuggerUrl);
let msgId = 0;
const waiting = new Map();
const netEvents = [];
const consoleLines = [];

ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result); waiting.delete(m.id); }
  if (m.method === "Runtime.consoleAPICalled") {
    consoleLines.push((m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" "));
  }
  if (m.method?.startsWith("Network.")) {
    const p = m.params || {};
    netEvents.push({
      method: m.method,
      url: p.request?.url || p.response?.url || "",
      status: p.response?.status,
      type: p.type,
      error: p.errorText,
      blocked: p.blockedReason,
      cors: p.corsErrorStatus,
      headers: p.response?.headers,
    });
  }
});

function send(method, params = {}) {
  msgId += 1;
  const id = msgId;
  return new Promise((resolve) => { waiting.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
}

await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");
await send("Network.enable", { maxTotalBufferSize: 10_000_000, maxResourceBufferSize: 5_000_000 });

console.log(`\n已接入：${target.url}，等待扫描完成…`);
await sleep(12000);

/** 取一首歌的地址并在页面里试播，同时观察网络事件 */
const probe = await send("Runtime.evaluate", {
  expression: `(async () => {
    const out = {};
    const Media = (await import('/bindings/musicplayer/index.js')).MediaService;
    const id = document.querySelector('.track[data-id]')?.dataset?.id;
    out.songId = id;
    out.url = await Media.URL(id);
    out.mediaState = await Media.State();

    // 直接用 <audio> 加载（与播放器同路径）
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    out.audioResult = await new Promise((resolve) => {
      const t = setTimeout(() => resolve({ outcome: 'timeout', rs: el.readyState, ns: el.networkState }), 9000);
      el.addEventListener('loadedmetadata', () => { clearTimeout(t); resolve({ outcome: 'ok', duration: el.duration }); });
      el.addEventListener('error', () => { clearTimeout(t); resolve({ outcome: 'error', code: el.error?.code, msg: el.error?.message, ns: el.networkState }); });
      el.src = out.url; el.load();
    });

    // 对照：fetch 同一地址
    try {
      const res = await fetch(out.url, { headers: { Range: 'bytes=0-99' } });
      out.fetchResult = { ok: res.ok, status: res.status, type: res.type, ct: res.headers.get('content-type') };
    } catch (e) { out.fetchResult = { error: String(e?.message || e) }; }

    // 对照：XMLHttpRequest
    out.xhrResult = await new Promise((resolve) => {
      const x = new XMLHttpRequest();
      x.open('GET', out.url);
      x.onload = () => resolve({ status: x.status, len: x.response?.byteLength ?? x.responseText?.length });
      x.onerror = () => resolve({ error: 'xhr error' });
      try { x.send(); } catch (e) { resolve({ error: String(e?.message || e) }); }
    });

    return out;
  })()`,
  awaitPromise: true,
  returnByValue: true,
});
console.log("\n================ 页面内探测结果 ================");
console.log(JSON.stringify(probe?.result?.value ?? probe, null, 2));

console.log("\n================ 网络事件（音频相关）================");
const audioNet = netEvents.filter((e) => /audio|127\.0\.0\.1|wails\.localhost/.test(e.url || ""));
if (!audioNet.length) {
  console.log("  (没有任何针对音频地址的网络事件 —— 请求在发起前就被拦掉了)");
} else {
  for (const e of audioNet.slice(-25)) {
    console.log(`  ${e.method} ${e.url}`);
    if (e.status) console.log(`      status=${e.status} type=${e.type}`);
    if (e.error) console.log(`      error=${e.error}`);
    if (e.blocked) console.log(`      blockedReason=${e.blocked}`);
    if (e.cors) console.log(`      corsError=${JSON.stringify(e.cors)}`);
  }
}

console.log("\n================ 全部网络事件方法统计 ================");
const counts = {};
for (const e of netEvents) counts[e.method] = (counts[e.method] || 0) + 1;
console.log(JSON.stringify(counts, null, 2));

console.log("\n================ 控制台（最后 10 条）================");
for (const l of consoleLines.slice(-10)) console.log("  " + l);

writeFileSync(path.join(workDir, "netprobe.json"), JSON.stringify({ version, probe: probe?.result?.value, netEvents, consoleLines }, null, 2), "utf8");
console.log(`\n完整结果: ${path.join(workDir, "netprobe.json")}`);

ws.close();
child.kill();
await sleep(400);
process.exit(0);
