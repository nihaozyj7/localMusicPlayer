/* ==========================================================================
   probe-audio.mjs — 对某个播放地址做细粒度媒体事件追踪
   --------------------------------------------------------------------------
   用途：当 <audio> 行为异常（卡住 / 拿到时长但不出声）时，
   打印完整事件序列与 readyState/networkState/net error，定位到具体阶段。

   用法：
     $env:MP_AUDIO_URL="http://127.0.0.1:PORT/audio/ID?t=TOKEN"
     node tools/probe-audio.mjs
   ========================================================================== */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].find(existsSync);

const URL_ = process.env.MP_AUDIO_URL;
const CROSS = process.env.MP_CROSSORIGIN ?? "anonymous";
const SECONDS = Number(process.env.MP_SECONDS || 12);
if (!URL_) {
  console.error("需要 MP_AUDIO_URL");
  process.exit(1);
}

const page = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
const url = ${JSON.stringify(URL_)};
const cross = ${JSON.stringify(CROSS)};
const el = new Audio();
if (cross) el.crossOrigin = cross;
el.preload = "metadata";

let last = performance.now();
function log(ev, extra) {
  const now = performance.now();
  console.log("EV " + JSON.stringify({
    t: Math.round(now),
    dt: Math.round(now - last),
    ev: ev,
    rs: el.readyState,
    ns: el.networkState,
    ct: Number(el.currentTime.toFixed(2)),
    dur: Number.isFinite(el.duration) ? Number(el.duration.toFixed(2)) : null,
    buf: el.buffered.length ? Number(el.buffered.end(el.buffered.length - 1).toFixed(2)) : 0,
    ...(extra || {}),
  }));
  last = now;
}

for (const ev of ["loadstart","progress","suspend","abort","error","emptied","stalled","loadedmetadata",
                  "loadeddata","canplay","canplaythrough","playing","waiting","play","pause","seeking",
                  "seeked","timeupdate","durationchange","ratechange","volumechange","ended"]) {
  el.addEventListener(ev, () => log(ev, ev === "error" ? { code: el.error && el.error.code, msg: el.error && el.error.message } : undefined));
}

console.log("URL " + url.replace(/t=.*/, "t=***"));
log("init");
el.src = url;
el.load();

setTimeout(() => {
  console.log("--- 3 秒后尝试播放 ---");
  log("play:call");
  el.play().then(() => log("play:resolved")).catch((e) => log("play:rejected", { msg: String(e && e.message || e) }));
}, 3000);

setTimeout(() => {
  log("final");
  console.log("PROBE_DONE");
}, ${SECONDS * 1000});
</script></body></html>`;

const PORT = 5198;
const CDP = 9334;

const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(page);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
console.log(`页面: http://127.0.0.1:${PORT}/   追踪 ${SECONDS} 秒…\n`);

const profile = mkdtempSync(path.join(tmpdir(), "mp-probe-"));
const edge = spawn(EDGE, [
  "--headless=new",
  `--remote-debugging-port=${CDP}`,
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--disable-extensions",
  "--autoplay-policy=no-user-gesture-required",
  `http://127.0.0.1:${PORT}/`,
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target = null;
for (let i = 0; i < 40 && !target; i += 1) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
    target = list.find((x) => x.type === "page" && x.webSocketDebuggerUrl);
  } catch {
    /* not ready */
  }
  if (!target) await sleep(250);
}
if (!target) {
  console.error("无法连接调试端口");
  edge.kill();
  server.close();
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const lines = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
  if (m.method === "Runtime.consoleAPICalled") {
    const text = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
    lines.push(text);
    if (text.startsWith("EV ")) {
      const o = JSON.parse(text.slice(3));
      console.log(`  +${String(o.dt).padStart(5)}ms  ${o.ev.padEnd(17)} rs=${o.rs} ns=${o.ns} t=${o.ct} dur=${o.dur} buf=${o.buf}${o.code ? ` code=${o.code}` : ""}${o.msg ? ` ${o.msg}` : ""}`);
    } else {
      console.log(text);
    }
  }
});
function send(method, params = {}) {
  id += 1;
  const myId = id;
  return new Promise((resolve) => {
    pending.set(myId, resolve);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}
await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");

await sleep((SECONDS + 3) * 1000);

ws.close();
edge.kill();
server.close();
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  /* 忽略 */
}
process.exit(0);
