/* ==========================================================================
   loudprobe.mjs — 定位「按需响度没算出来」卡在哪一环
   --------------------------------------------------------------------------
   分步验证，每一步单独报结果，避免「一个 Get 返回 false」看不出原因：
     1) 前端 dist 里是否含最新修复
     2) 直接调后端 Measure（绕过前端逻辑）能否算出
     3) 前端 requestLoudness 的各个提前 return 条件实际取值
   ========================================================================== */
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const EXE = path.resolve(ROOT, process.argv.includes("--exe") ? process.argv[process.argv.indexOf("--exe") + 1] : "bin/musicplayer.exe");
const PORT = Number(process.env.MP_PORT || 9381);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- 1) dist 是否含修复 ---- */
const distAudio = readFileSync(path.join(ROOT, "frontend/dist/js/audio.js"), "utf8");
console.log("[1] frontend/dist/js/audio.js 是否含最新修复");
console.log(`     refreshLoudnessGains 里带按需补测: ${distAudio.includes("requestLoudness(state.currentId)")}`);
console.log(`     文件大小: ${distAudio.length}`);

const workDir = path.join(ROOT, `.tmp-loudprobe-${PORT}`);
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
  } catch { /* wait */ }
}
if (!target) { console.error("无法接入"); child.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const waiting = new Map();
const logs = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result); waiting.delete(m.id); }
  if (m.method === "Runtime.consoleAPICalled") logs.push((m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" "));
});
const send = (method, params = {}) => { id += 1; const i = id; return new Promise((r) => { waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }); };
async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res?.exceptionDetails) return { __error: res.exceptionDetails.text + " " + (res.exceptionDetails.exception?.description || "") };
  return res?.result?.value;
}

await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");
console.log("\n等待启动…");
await sleep(11000);

/* ---- 2) 直接调后端 Measure，绕过前端一切逻辑 ---- */
console.log("\n[2] 直接调后端 LoudnessService.Measure（绕过前端）");
const direct = await evaluate(`(async () => {
  const shell = await import('/js/shell.js');
  try { shell.navigate('all'); } catch {}
  await new Promise((r) => setTimeout(r, 1000));
  const store = await import('/js/store.js');
  const Loud = (await import('/bindings/musicplayer/index.js')).LoudnessService;

  const row = document.querySelector('.track[data-id]');
  const songId = row?.dataset?.id;
  const st = await Loud.State();
  const t0 = Date.now();
  let res = null, err = null;
  try { res = await Loud.Measure(songId, -16); } catch (e) { err = String(e?.message || e); }
  return {
    songId, stateBefore: { available: st.available, describe: st.describe, target: st.target, cached: st.cached },
    elapsedMs: Date.now() - t0, err,
    result: res ? { measured: res.measured, integrated: res.integrated, truePeak: res.truePeak, gainDB: res.gainDB } : null,
    currentId: store.state.currentId ?? null,
  };
})()`);
console.log(JSON.stringify(direct, null, 2));

/* ---- 3) 前端 requestLoudness 的提前返回条件 ---- */
console.log("\n[3] requestLoudness 的各个前置条件实际取值");
const cond = await evaluate(`(async () => {
  const store = await import('/js/store.js');
  const bridge = await import('/js/bridge.js');
  const audio = await import('/js/audio.js');
  const songId = store.state.currentId;
  return {
    hasCurrentId: Boolean(songId),
    currentId: songId ?? null,
    loudnessMode: store.state.config.loudnessMode ?? null,
    loudnessTarget: store.state.config.loudnessTarget ?? null,
    isWails: typeof bridge.isWails === 'function' ? bridge.isWails() : 'no isWails export',
    existingGain: songId ? (store.state.loudnessGains?.[songId] ?? 'undefined') : 'no song',
    requestLoudnessIsFn: typeof audio.requestLoudness === 'function',
  };
})()`);
console.log(JSON.stringify(cond, null, 2));

/* ---- 4) 真正走前端提交流程 ---- */
console.log("\n[4] 模拟用户操作：开逐曲均衡（触发 refreshLoudnessGains）");
const flow = await evaluate(`(async () => {
  const store = await import('/js/store.js');
  const audio = await import('/js/audio.js');
  const Loud = (await import('/bindings/musicplayer/index.js')).LoudnessService;
  const songId = store.state.currentId;
  if (!songId) return { error: '没有正在播放的歌' };

  store.state.config.loudnessMode = 'track';
  store.state.config.loudnessTarget = -16;
  const t0 = Date.now();
  await audio.refreshLoudnessGains();       // 用户点分段控件走的就是这里
  const afterRefresh = Date.now() - t0;
  // 等后台按需测量落地
  let m = null;
  while (Date.now() - t0 < 60000) {
    await new Promise((r) => setTimeout(r, 1000));
    m = await Loud.Get(songId, -16);
    if (m?.measured) break;
  }
  return {
    refreshMs: afterRefresh,
    measured: m?.measured ?? false,
    integrated: m?.integrated ?? null,
    gainDB: m?.gainDB ?? null,
    frontendGain: store.state.loudnessGains?.[songId] ?? null,
  };
})()`);
console.log(JSON.stringify(flow, null, 2));

console.log("\n[5] 控制台最后 12 条");
for (const l of logs.slice(-12)) console.log("  " + l);

ws.close(); child.kill(); await sleep(300); process.exit(0);
