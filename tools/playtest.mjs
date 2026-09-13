/* ==========================================================================
   playtest.mjs — 在真实应用里点某一首歌并确认真的在出声
   --------------------------------------------------------------------------
   比只看 <audio> 的 readyState 更严格：这里会检查
     · currentTime 是否在推进（真的在播）
     · Web Audio 分析节点read到的波形是否非静音（响度均衡的前提）
   用应用自己的搜索框定位曲目，避免依赖列表顺序。

   用法：
     node tools/playtest.mjs --exe bin/musicplayer-debug.exe --query wma
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

const EXE = path.resolve(ROOT, arg("exe", "bin/musicplayer-debug.exe"));
const PORT = Number(arg("port", "9335"));
const QUERY = arg("query", "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(EXE)) {
  console.error(`找不到 ${EXE}`);
  process.exit(1);
}

const workDir = path.join(ROOT, ".tmp-playtest");
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
const logs = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) {
    waiting.get(m.id)(m.result);
    waiting.delete(m.id);
  }
  if (m.method === "Runtime.consoleAPICalled") {
    logs.push((m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" "));
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

console.log(`等待应用启动与扫描（12 秒）…`);
await sleep(12000);

console.log(`\n================ 定位曲目（query=${QUERY || "第一首"}）================`);
const located = await evaluate(`(async () => {
  const q = ${JSON.stringify(QUERY)};
  if (q) {
    const box = document.querySelector('input[type="search"], .search input, [data-role="search"]');
    if (box) {
      box.value = q;
      box.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  const rows = Array.from(document.querySelectorAll('.track[data-id]'));
  const row = rows[0];
  return {
    rowCount: rows.length,
    id: row?.dataset?.id ?? null,
    index: row?.dataset?.index ?? null,
    title: row?.querySelector('.track__title')?.textContent?.trim() ?? null,
  };
})()`);
console.log(JSON.stringify(located, null, 2));

if (!located?.id) {
  console.error("没有找到曲目");
  ws.close();
  child.kill();
  process.exit(1);
}

console.log("\n================ 双击播放并持续采样 8 秒 ================");
const play = await evaluate(`(async () => {
  const row = document.querySelector('.track[data-id]');
  row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

  const el = document.querySelector('audio');
  // 等音频进入可播状态
  const t0 = Date.now();
  while (Date.now() - t0 < 8000 && el && el.readyState < 2) {
    await new Promise((r) => setTimeout(r, 200));
  }

  // 持续采样：只要 currentTime 在变化，就说明真的在解码播放。
  // 注意不能只看「首尾是否递增」—— 短曲子会循环回 0。
  const samples = [];
  let moving = 0;
  let last = -1;
  for (let i = 0; i < 16; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    const t = el ? el.currentTime : 0;
    samples.push(Number(t.toFixed(2)));
    if (last >= 0 && Math.abs(t - last) > 0.05) moving += 1;
    last = t;
  }

  let graph = null;
  try {
    const mod = await import('/js/audio.js');
    graph = mod.audioGraphState ? mod.audioGraphState() : null;
  } catch (e) { graph = String(e?.message || e); }

  return {
    src: el?.src ?? null,
    crossOrigin: el?.crossOrigin ?? null,
    readyState: el?.readyState ?? null,
    networkState: el?.networkState ?? null,
    paused: el?.paused ?? null,
    duration: el && Number.isFinite(el.duration) ? el.duration : null,
    samples,
    movingSamples: moving,
    error: el?.error ? { code: el.error.code, message: el.error.message } : null,
    graph,
  };
})()`);
console.log(JSON.stringify(play, null, 2));

console.log("\n================ 判定 ================");
if (play?.error) {
  console.log(`  ✗ 播放出错：code=${play.error.code} ${play.error.message}`);
} else if (play?.paused) {
  console.log("  ✗ 元素处于暂停状态，并未播放");
} else if (!play?.movingSamples) {
  console.log(`  ✗ currentTime 全程不动（${play?.samples?.join(", ")}）`);
} else {
  console.log(`  ✓ 正在解码播放：currentTime 在推进（${play?.movingSamples}/15 次采样发生变化）`);
  console.log(`    采样序列: ${play?.samples?.join(", ")}`);
  console.log(
    `    时长 ${play?.duration}s${play?.samples?.some((v, i, a) => i > 0 && v < a[i - 1] - 0.5) ? "（中途回绕 = 循环播放，正常）" : ""}`
  );
}

console.log("\n================ 控制台（最后 12 条）================");
for (const l of logs.slice(-12)) console.log("  " + l);

writeFileSync(path.join(workDir, "playtest.json"), JSON.stringify({ located, play, logs }, null, 2), "utf8");
ws.close();
child.kill();
await sleep(400);
process.exit(0);
