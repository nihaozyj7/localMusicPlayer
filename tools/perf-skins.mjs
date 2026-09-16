/* ==========================================================================
   perf-skins.mjs — 量「播放详情页每个样式」的实际帧节奏（对着真机跑）
   --------------------------------------------------------------------------
   为什么要有这个工具：用户报「打开后滚动/播放界面卡卡的，帧率跟不上显示器」。
   这类问题**读代码只能猜**（嫌疑一大把：每帧写 scrollTop、每帧改一堆 CSS 变量、
   Canvas 粒子、backdrop-filter…）。必须先有数字，才能说清是谁的锅。

   实测结论（2026-09，100Hz 档屏幕，58 首曲库）：
     classic / immersive / minimal   平均帧间隔 9.6~9.7ms（跟满刷新率）
     anime 12.4ms · arcade 10.9ms    偶发 20ms 毛刺（换行时的滚动跳变）
     magia 23.0ms（≈43fps）          明显掉帧 —— 用 --profile 可以定位到
                                     magia 的歌词跟随函数占了 45% 的 CPU 采样
   也就是说「卡」是**样式自己的每帧工作量**造成的，不是 WebView2 的问题。

   用法（先让应用带调试端口起来）：
     $env:LMPLAYER_DEBUG_PORT = "9333"
     .\bin\lmplayer.exe
     node tools/perf-skins.mjs                 # 逐个样式量帧间隔
     node tools/perf-skins.mjs --profile        # 再对每个样式采一份 CPU profile
     node tools/perf-skins.mjs --port 9334 --skins classic,magia
   ========================================================================== */

const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const PORT = Number(argOf("port", process.env.DBG_PORT || "9333"));
const FRAMES = Number(argOf("frames", "150"));
const PROFILE = args.includes("--profile");
const ONLY = String(argOf("skins", ""))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target = null;
for (let i = 0; i < 150; i += 1) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === "page" && String(t.url).startsWith("http"));
    if (target) break;
  } catch {
    /* 还没起来 */
  }
  await sleep(200);
}
if (!target) {
  console.error(`连不上 CDP（127.0.0.1:${PORT}）。先设置 LMPLAYER_DEBUG_PORT 再启动应用。`);
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || "页面里抛出异常");
  return res.result.value;
}
await send("Runtime.enable");

/** 等曲库渲染出来 */
for (let i = 0; i < 80; i += 1) {
  const n = await evaluate("document.querySelectorAll('.track').length");
  if (n > 5) break;
  await sleep(500);
}
// 打开播放详情页（双击第一首）
await evaluate("document.querySelector('.track')?.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
await sleep(2500);

const rafSample = (n) => `(async () => {
  const frames = [];
  let last = performance.now();
  await new Promise((resolve) => {
    let k = 0;
    function tick(now) {
      frames.push(now - last);
      last = now;
      if (++k >= ${n}) resolve();
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  frames.shift();
  const s = frames.slice().sort((a, b) => a - b);
  const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
  return {
    mean: +mean.toFixed(2),
    p50: +s[Math.floor(s.length * 0.5)].toFixed(2),
    p95: +s[Math.floor(s.length * 0.95)].toFixed(2),
    max: +Math.max(...frames).toFixed(2),
    fps: +(1000 / mean).toFixed(1),
    jank: frames.filter((f) => f > 25).length,
  };
})()`;

async function profile(ms) {
  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: 200 });
  await send("Profiler.start");
  await sleep(ms);
  const { profile: prof } = await send("Profiler.stop");
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const total = prof.samples.length || 1;
  for (const id of prof.samples) {
    const n = byId.get(id);
    if (!n) continue;
    const f = n.callFrame;
    const key = `${f.functionName || "(anonymous)"} @ ${String(f.url || "").split("/").pop()}:${f.lineNumber}`;
    self.set(key, (self.get(key) || 0) + 1);
  }
  return [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => ({ fn: k, pct: +((v / total) * 100).toFixed(1) }));
}

const all = JSON.parse(await evaluate("JSON.stringify([...document.querySelectorAll('[data-pv-skin]')].map(b=>b.dataset.pvSkin))"));
const skins = ONLY.length ? all.filter((s) => ONLY.includes(s)) : all;
console.log(`${skins.length} 个样式，每个采样 ${FRAMES} 帧\n`);
const table = [];
for (const id of skins) {
  await evaluate(`document.querySelector('[data-pv-skin="${id}"]')?.click()`);
  await sleep(1600);
  const row = await evaluate(rafSample(FRAMES));
  let prof = null;
  if (PROFILE) prof = await profile(3000);
  table.push({ skin: id, ...row, top: prof });
  console.log(
    `${id.padEnd(10)} mean=${String(row.mean).padStart(6)}ms  p95=${String(row.p95).padStart(6)}ms  max=${String(row.max).padStart(6)}ms  fps=${String(row.fps).padStart(5)}  >25ms=${row.jank}`
  );
  if (prof) for (const p of prof) console.log(`             ${String(p.pct).padStart(5)}%  ${p.fn}`);
}
console.log("\n完整结果：");
console.log(JSON.stringify(table, null, 2));
ws.close();
process.exit(0);
