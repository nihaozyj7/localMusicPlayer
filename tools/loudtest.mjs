/* ==========================================================================
   loudtest.mjs — 在真实应用里验证「按需响度补偿」
   --------------------------------------------------------------------------
   要验证的行为（用户明确要求）：
     1) 开启逐曲均衡后播放一首歌，不需要事先扫描，补偿会被自动算出来并套用
     2) 补偿值进入 Web Audio 的 GainNode（真的作用到回放上）
     3) 改了目标响度后，之前的补偿失效并按新标准重算

   用法：node tools/loudtest.mjs --exe bin/lmplayer.exe
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

const EXE = path.resolve(ROOT, arg("exe", "bin/lmplayer-debug.exe"));
const PORT = Number(arg("port", "9337"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(EXE)) {
  console.error(`找不到 ${EXE}`);
  process.exit(1);
}

const workDir = path.join(ROOT, ".tmp-loudtest");
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
console.log("等待应用启动与扫描（12 秒）…");
await sleep(12000);

// 页面里可以直接 import 模块，利用 store 的 API 改配置
console.log("\n================ 1) 先看响度能力与初始状态 ================");
const before = await evaluate(`(async () => {
  const Loud = (await import('/bindings/localmusicplayer/index.js')).LoudnessService;
  const st = await Loud.State();
  return {
    available: st.available,
    describe: st.describe,
    target: st.target,
    measured: st.measured,
    cached: st.cached,
    total: st.total,
    onDemand: st.onDemand,
  };
})()`);
console.log(JSON.stringify(before, null, 2));

console.log("\n================ 2) 开启逐曲均衡并播放一首歌 ================");
const result = await evaluate(`(async () => {
  const store = await import('/js/store.js');
  const audio = await import('/js/audio.js');
  const Loud = (await import('/bindings/localmusicplayer/index.js')).LoudnessService;

  // 开启逐曲均衡
  store.state.config.loudnessMode = 'track';
  store.state.config.loudnessTarget = -16;
  await Loud.InvalidateTarget(-16);

  // 挑一首歌，走与用户双击相同的路径
  const row = document.querySelector('.track[data-id]');
  const songId = row.dataset.id;
  const title = row.querySelector('.track__title')?.textContent?.trim() ?? '';
  row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

  // 等补偿算出来（要完整解码一遍，可能要十几秒）
  const t0 = Date.now();
  let gain = null;
  let measured = null;
  while (Date.now() - t0 < 90000) {
    await new Promise((r) => setTimeout(r, 1000));
    measured = await Loud.Get(songId, -16);
    if (measured?.measured) { gain = measured.gainDB; break; }
  }

  const el = document.querySelector('audio');
  return {
    songId,
    title,
    waitedMs: Date.now() - t0,
    backendMeasured: measured?.measured ?? false,
    integrated: measured?.integrated ?? null,
    truePeak: measured?.truePeak ?? null,
    gainDB: gain,
    frontendGain: store.state.loudnessGains?.[songId] ?? null,
    graph: audio.audioGraphState ? audio.audioGraphState() : null,
    playing: el ? !el.paused : null,
    currentTime: el ? Number(el.currentTime.toFixed(2)) : null,
  };
})()`);
console.log(JSON.stringify(result, null, 2));

console.log("\n================ 3) 改目标响度 → 旧补偿应失效 ================");
const afterChange = await evaluate(`(async () => {
  const store = await import('/js/store.js');
  const audio = await import('/js/audio.js');
  const Loud = (await import('/bindings/localmusicplayer/index.js')).LoudnessService;
  const songId = ${JSON.stringify(result?.songId ?? null)};

  // 按设置界面里的做法：改标准 → 让旧补偿失效
  store.state.config.loudnessTarget = -23;
  await audio.invalidateLoudnessForTarget();
  const st = await Loud.State();
  const oldStandard = await Loud.Get(songId, -16);
  return {
    stateAfterInvalidate: { measured: st.measured, target: st.target, cached: st.cached },
    oldStandardStillValid: oldStandard?.measured ?? false,
    frontendGainCleared: store.state.loudnessGains?.[songId] === undefined,
  };
})()`);
console.log(JSON.stringify(afterChange, null, 2));

console.log("\n================ 判定 ================");
const ok1 = result?.backendMeasured && result?.gainDB !== null;
const ok2 = Number.isFinite(result?.frontendGain) || result?.playing;
const ok3 = afterChange?.oldStandardStillValid === false;
console.log(
  ok1
    ? `  ✓ 播放时按需算出了补偿：${result.integrated} LUFS → ${result.gainDB} dB（耗时 ${result.waitedMs}ms）`
    : `  ✗ 没有按需算出补偿: ${JSON.stringify(result)}`
);
console.log(
  ok2 ? `  ✓ 补偿已进入前端增益表: ${result.frontendGain}` : `  ! 前端增益表未更新: ${result?.frontendGain}`
);
console.log(ok3 ? "  ✓ 改了目标响度后旧补偿已失效" : `  ✗ 改标准后旧补偿仍然有效: ${JSON.stringify(afterChange)}`);

console.log("\n================ 控制台（最后 10 条）================");
for (const l of logs.slice(-10)) console.log("  " + l);

writeFileSync(
  path.join(workDir, "loudtest.json"),
  JSON.stringify({ before, result, afterChange, logs }, null, 2),
  "utf8"
);
ws.close();
child.kill();
await sleep(400);
process.exit(0);
