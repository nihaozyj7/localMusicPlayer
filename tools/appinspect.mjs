/* ==========================================================================
   appinspect.mjs — 接入真实应用（WebView2）查看页面里的实际状态
   --------------------------------------------------------------------------
   为什么需要它：有些问题只在应用内复现（Wails 虚拟主机 wails.localhost 的
   同源策略、WebView2 的解码能力等），外部无头浏览器测不出来。
   这个脚本启动真实 exe，通过 WebView2 的远程调试端口读取页面里的报错、
   <audio> 的实际 src / networkState / error，以及网络请求记录。

   用法：
     node tools/appinspect.mjs
     node tools/appinspect.mjs --exe bin/lmplayer.exe --port 9333 --wait 20000
   ========================================================================== */

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const EXE = path.resolve(ROOT, arg("exe", "bin/lmplayer.exe"));
const PORT = Number(arg("port", "9333"));
const WAIT = Number(arg("wait", "18000"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(EXE)) {
  console.error(`找不到可执行文件：${EXE}`);
  process.exit(1);
}

// WebView2 需要独立的用户数据目录，避免与已运行实例冲突
const workDir = path.join(ROOT, ".tmp-appinspect");
mkdirSync(workDir, { recursive: true });

console.log(`启动应用：${EXE}`);
console.log(`远程调试端口：${PORT}\n`);

// 应用的日志量很大，全部写文件，别把检查结果冲掉
const logPath = path.join(workDir, "app.log");
const logFd = openSync(logPath, "w");

const child = spawn(EXE, [], {
  env: {
    ...process.env,
    LMPLAYER_DEBUG_PORT: String(PORT),
    // WebView2 独立数据目录，避免「已在运行」导致调试端口不生效
    WEBVIEW2_USER_DATA_FOLDER: path.join(workDir, "wv2"),
  },
  stdio: ["ignore", logFd, logFd],
  detached: false,
});
closeSync(logFd); // 交给子进程持有，父进程这份可以关掉

let target = null;
for (let i = 0; i < 60 && !target; i += 1) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((x) => x.type === "page" && x.webSocketDebuggerUrl);
  } catch {
    /* 还没起来 */
  }
}

if (!target) {
  console.error("无法连上 WebView2 调试端口。可能原因：");
  console.error("  · 应用启动失败（看上面的输出）");
  console.error("  · 已有实例在运行，占用了同一个 WebView2 用户数据目录");
  child.kill();
  process.exit(1);
}

console.log(`已接入页面：${target.url}\n`);

const ws = new WebSocket(target.webSocketDebuggerUrl);
ws.addEventListener("error", (e) => {
  console.error("WebSocket 出错：", e.message || e.type || e);
});
let msgId = 0;
const waiting = new Map();
const consoleLines = [];
const exceptions = [];

ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) {
    waiting.get(m.id)(m.result);
    waiting.delete(m.id);
  }
  if (m.method === "Runtime.consoleAPICalled") {
    const text = (m.params.args || []).map((a) => a.value ?? a.description ?? a.type ?? "").join(" ");
    consoleLines.push(text);
  }
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    exceptions.push(`${d.text} ${d.exception?.description || ""} @${d.url || ""}:${d.lineNumber}`);
  }
});

function send(method, params = {}) {
  msgId += 1;
  const id = msgId;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");
await send("Log.enable").catch(() => {});
// 等页面把曲库解析完（扫描是后台进行的）
console.log(`等待 ${WAIT / 1000} 秒让应用完成启动与扫描…\n`);
await sleep(WAIT);

/** 在页面里求值，返回结构化结果 */
async function evaluate(expression) {
  const res = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (res?.exceptionDetails) {
    return { __error: res.exceptionDetails.text + " " + (res.exceptionDetails.exception?.description || "") };
  }
  return res?.result?.value;
}

console.log("================ 页面环境 ================");
const env = await evaluate(`(() => ({
  href: location.href,
  origin: location.origin,
  ua: navigator.userAgent.slice(0, 120),
  songRows: document.querySelectorAll('.track[data-id]').length,
  firstSongId: document.querySelector('.track[data-id]')?.dataset?.id ?? null,
}))()`);
console.log(JSON.stringify(env, null, 2));

console.log("\n================ 绑定可用性 ================");
const bindingInfo = await evaluate(`(async () => {
  const out = {};
  try {
    const mod = await import('/bindings/localmusicplayer/index.js');
    out.exports = Object.keys(mod);
    const Media = mod.MediaService || mod.Media;
    out.mediaExports = Media ? Object.keys(Media) : null;
    out.urlType = typeof (Media && Media.URL);
    if (Media && Media.URL) {
      const id = document.querySelector('.track[data-id]')?.dataset?.id;
      out.songId = id;
      out.url = await Media.URL(id);
    }
  } catch (e) {
    out.error = String(e && (e.stack || e.message) || e);
  }
  return out;
})()`);
console.log(JSON.stringify(bindingInfo, null, 2));

console.log("\n================ 用 fetch 验证该地址（页面同源策略下）================");
if (bindingInfo?.url) {
  const probe = await evaluate(`(async () => {
    const url = ${JSON.stringify(bindingInfo.url)};
    try {
      const res = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
      const buf = await res.arrayBuffer();
      return {
        ok: res.ok, status: res.status, type: res.type,
        contentType: res.headers.get('content-type'),
        contentRange: res.headers.get('content-range'),
        allowOrigin: res.headers.get('access-control-allow-origin'),
        bytes: buf.byteLength,
        head: Array.from(new Uint8Array(buf).slice(0, 12)).map((b) => b.toString(16).padStart(2, '0')).join(' '),
      };
    } catch (e) {
      return { error: String(e && e.message || e) };
    }
  })()`);
  console.log(JSON.stringify(probe, null, 2));
}

console.log("\n================ <audio> 元素（点击第一首之前）================");
const audioBefore = await evaluate(`(() => {
  const els = Array.from(document.querySelectorAll('audio'));
  return {
    count: els.length,
    elements: els.map((el) => ({
      src: el.src || '(空)', crossOrigin: el.crossOrigin,
      readyState: el.readyState, networkState: el.networkState,
    })),
  };
})()`);
console.log(JSON.stringify(audioBefore, null, 2));

console.log("\n================ 模拟用户双击第一首（真实播放路径）================");
const clickResult = await evaluate(`(async () => {
  const row = document.querySelector('.track[data-id]');
  if (!row) return { error: '页面里没有歌曲行' };
  const id = row.dataset.id;
  const title = row.querySelector('.track__title')?.textContent?.trim() ?? '';

  // 列表是双击播放（与用户操作一致）
  row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

  // 等到 audio 元素拿到 src，最多 10 秒
  const t0 = Date.now();
  let el = null;
  while (Date.now() - t0 < 10000) {
    await new Promise((r) => setTimeout(r, 250));
    el = document.querySelector('audio');
    if (el && el.src) break;
  }
  await new Promise((r) => setTimeout(r, 5000));
  el = document.querySelector('audio');
  return {
    clickedId: id,
    title: title,
    hasAudioEl: Boolean(el),
    src: el ? (el.src || '(空)') : null,
    currentSrc: el ? (el.currentSrc || '(空)') : null,
    crossOrigin: el ? el.crossOrigin : null,
    readyState: el ? el.readyState : null,
    networkState: el ? el.networkState : null,
    paused: el ? el.paused : null,
    duration: el && Number.isFinite(el.duration) ? el.duration : null,
    currentTime: el ? el.currentTime : null,
    error: el && el.error ? { code: el.error.code, message: el.error.message } : null,
    audioCtx: (() => { try { return window.__dshGraph || null; } catch { return null; } })(),
  };
})()`);
console.log(JSON.stringify(clickResult, null, 2));

console.log("\n================ 控制台输出（最后 30 条）================");
for (const l of consoleLines.slice(-30)) console.log("  " + l);

if (exceptions.length) {
  console.log("\n================ 未捕获异常 ================");
  for (const e of exceptions.slice(-10)) console.log("  " + e);
}

// 落盘一份，方便留档
const dump = { env, bindingInfo, audioBefore, clickResult, consoleLines, exceptions };
writeFileSync(path.join(workDir, "dump.json"), JSON.stringify(dump, null, 2), "utf8");
console.log(`\n完整结果已写入 ${path.join(workDir, "dump.json")}`);

ws.close();
child.kill();
await sleep(500);
process.exit(0);
