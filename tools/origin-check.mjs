/* ==========================================================================
   origin-check.mjs — 定位 WebView2/Chromium 的「URL safety check」拒绝条件
   --------------------------------------------------------------------------
   背景：应用页面在 http://wails.localhost，音频服务在 http://127.0.0.1:port。
   实测真实应用里 <audio> 直接报：
     MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check
   这是 Chromium 的私有网络访问（Private Network Access / 地址空间）保护。

   本脚本用「一个页面源 + 多个音频地址」的矩阵，找出到底哪种组合被允许。
   页面源可以指定成 wails.localhost 风格，复现真实条件。

   用法：
     node tools/origin-check.mjs
   ========================================================================== */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].find(existsSync);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- 一个最简音频服务：给 CORS 头，返回一小段 WAV ---- */
function makeWav(seconds = 1) {
  const rate = 44100;
  const frames = rate * seconds;
  const data = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i += 1) {
    const v = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000);
    data.writeInt16LE(v, i * 4);
    data.writeInt16LE(v, i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const WAV = makeWav(1);

const audioServer = createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "audio/wav",
    "Content-Length": String(WAV.length),
    "Access-Control-Allow-Origin": req.headers.origin || "*",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range",
    "Accept-Ranges": "bytes",
    Vary: "Origin",
  });
  res.end(WAV);
});
await new Promise((r) => audioServer.listen(0, "127.0.0.1", r));
const audioPort = audioServer.address().port;

/* ---- 页面服务：分别用 127.0.0.1 与 wails.localhost 两种「页面源」----
   注意：这里用 Host 头区分，让同一个监听既能当 127.0.0.1 也能当 wails.localhost。
   wails.localhost 需要能解析到 127.0.0.1（Chromium 对 *.localhost 有内建解析）。 */
let currentPage = "";
const pageServer = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(currentPage);
});
await new Promise((r) => pageServer.listen(0, "127.0.0.1", r));
const pagePort = pageServer.address().port;

const audioUrlIp = `http://127.0.0.1:${audioPort}/tone.wav`;
const audioUrlLocalhost = `http://localhost:${audioPort}/tone.wav`;

const CASES = [
  { label: "页面 127.0.0.1 → 音频 127.0.0.1（同源）", origin: "ip", audio: audioUrlIp },
  { label: "页面 127.0.0.1 → 音频 localhost（跨源）", origin: "ip", audio: audioUrlLocalhost },
  { label: "页面 wails.localhost → 音频 127.0.0.1（真实条件）", origin: "wails", audio: audioUrlIp },
  { label: "页面 wails.localhost → 音频 localhost", origin: "wails", audio: audioUrlLocalhost },
];

const pageFor = (audioUrl) => `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
const url = ${JSON.stringify(audioUrl)};
const out = { url: url };
async function run() {
  // fetch（跨源需要 CORS）
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-99' } });
    out.fetch = { ok: res.ok, status: res.status, type: res.type, len: (await res.arrayBuffer()).byteLength };
  } catch (e) { out.fetch = { error: String(e && e.message || e) }; }

  // <audio> + crossorigin=anonymous（Web Audio 需要）
  out.audioAnon = await new Promise((resolve) => {
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    const done = (o) => { clearTimeout(t); resolve(o); };
    const t = setTimeout(() => done({ outcome: 'timeout', rs: el.readyState }), 6000);
    el.addEventListener('loadedmetadata', () => done({ outcome: 'ok', duration: el.duration }));
    el.addEventListener('error', () => done({ outcome: 'error', code: el.error && el.error.code, msg: el.error && el.error.message }));
    el.src = url; el.load();
  });

  // <audio> 不加 crossorigin（只关心能否出声）
  out.audioPlain = await new Promise((resolve) => {
    const el = new Audio();
    el.preload = 'auto';
    const done = (o) => { clearTimeout(t); resolve(o); };
    const t = setTimeout(() => done({ outcome: 'timeout', rs: el.readyState }), 6000);
    el.addEventListener('loadedmetadata', () => done({ outcome: 'ok', duration: el.duration }));
    el.addEventListener('error', () => done({ outcome: 'error', code: el.error && el.error.code, msg: el.error && el.error.message }));
    el.src = url; el.load();
  });

  console.log('RESULT ' + JSON.stringify(out));
}
run();
</script></body></html>`;

console.log(`音频服务: ${audioUrlIp}`);
console.log(`页面服务: 127.0.0.1:${pagePort} / wails.localhost:${pagePort}\n`);

for (const c of CASES) {
  currentPage = pageFor(c.audio);
  const host = c.origin === "wails" ? `wails.localhost:${pagePort}` : `127.0.0.1:${pagePort}`;
  const pageUrl = `http://${host}/`;
  const profile = mkdtempSync(path.join(tmpdir(), "mp-oc-"));
  const cdp = 9400 + Math.floor(Math.random() * 200);

  const edge = spawn(
    EDGE,
    [
      "--headless=new",
      `--remote-debugging-port=${cdp}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--disable-extensions",
      "--autoplay-policy=no-user-gesture-required",
      pageUrl,
    ],
    { stdio: "ignore", env: { ...process.env, NO_PROXY: "localhost,127.0.0.1" } }
  );

  let target = null;
  for (let i = 0; i < 40 && !target; i += 1) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${cdp}/json/list`)).json();
      target = list.find((x) => x.type === "page" && x.webSocketDebuggerUrl);
    } catch {
      /* 还没起来 */
    }
  }
  if (!target) {
    console.log(`【${c.label}】无法连接调试端口，跳过\n`);
    edge.kill();
    continue;
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let result = null;
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === "Runtime.consoleAPICalled") {
      const text = (m.params.args || []).map((a) => a.value ?? "").join(" ");
      if (text.startsWith("RESULT ")) result = JSON.parse(text.slice(7));
    }
  });
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result);
      pending.delete(m.id);
    }
  });
  const send = (method) => {
    id += 1;
    const i = id;
    return new Promise((res) => {
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method }));
    });
  };
  await send("Runtime.enable");

  for (let i = 0; i < 30 && !result; i += 1) await sleep(500);

  console.log(`【${c.label}】`);
  console.log("  " + (result ? JSON.stringify(result) : "（页面无结果）"));
  console.log();

  ws.close();
  edge.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
  await sleep(300);
}

audioServer.close();
pageServer.close();
process.exit(0);
