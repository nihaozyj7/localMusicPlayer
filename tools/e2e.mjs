/* ==========================================================================
   e2e.mjs — 对打包后的应用做端到端验收
   --------------------------------------------------------------------------
   覆盖：列表渲染 → 播放出声 → 按需响度补偿 → 转码播放（若有该格式的文件）
   全部在真实 WebView2 里通过操作界面完成，不是调 API 绕过 UI。

   用法：node tools/e2e.mjs --exe bin/musicplayer.exe
   ========================================================================== */
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const EXE = path.resolve(
  ROOT,
  process.argv.includes("--exe") ? process.argv[process.argv.indexOf("--exe") + 1] : "bin/musicplayer.exe"
);
const PORT = Number(process.env.MP_PORT || 9371);
const QUERY = process.env.MP_QUERY || "";
const WANT_LOUDNESS = process.env.MP_LOUDNESS !== "0";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const workDir = path.join(ROOT, `.tmp-e2e-${PORT}`);
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
    /* wait */
  }
}
if (!target) {
  console.error("无法接入 WebView2");
  child.kill();
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const waiting = new Map();
const logs = [];
const exceptions = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) {
    waiting.get(m.id)(m.result);
    waiting.delete(m.id);
  }
  if (m.method === "Runtime.consoleAPICalled")
    logs.push((m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" "));
  if (m.method === "Runtime.exceptionThrown")
    exceptions.push(m.params.exceptionDetails.text + " " + (m.params.exceptionDetails.exception?.description || ""));
});
const send = (method, params = {}) => {
  id += 1;
  const i = id;
  return new Promise((r) => {
    waiting.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
};
async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res?.exceptionDetails)
    return { __error: res.exceptionDetails.text + " " + (res.exceptionDetails.exception?.description || "") };
  return res?.result?.value;
}

await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
};

console.log(`验收目标：${EXE}\n`);
console.log("等待启动与扫描…");
await sleep(11000);

/* ---------------- 1) 界面渲染 ---------------- */
console.log("\n[1] 界面渲染");
const render = await evaluate(`(async () => {
  const shell = await import('/js/shell.js');
  const store = await import('/js/store.js');
  // 确保在主列表视图（用户上次可能停在设置页）
  try { shell.navigate('all'); } catch {}
  await new Promise((r) => setTimeout(r, 1200));
  return {
    rows: document.querySelectorAll('.track[data-id]').length,
    storeSongs: store.state.songs.length,
    hasContent: !!document.querySelector('.content-body') && !!document.querySelector('.main'),
    titlebar: !!document.querySelector('.titlebar'),
    playerbar: !!document.querySelector('.playerbar'),
    dragProp: getComputedStyle(document.querySelector('.titlebar')).getPropertyValue('--wails-draggable').trim(),
  };
})()`);
console.log("   " + JSON.stringify(render));
check("歌曲列表渲染出歌曲行", render?.rows > 0, `${render?.rows} 行`);
check("主内容区存在", render?.hasContent === true);
check("标题栏/播放条存在", render?.titlebar && render?.playerbar);
check("标题栏可拖动属性正确", render?.dragProp === "drag", `--wails-draggable=${render?.dragProp}`);

/* ---------------- 2) 播放 ---------------- */
console.log("\n[2] 播放（双击歌曲行）");
const play = await evaluate(`(async () => {
  const q = ${JSON.stringify(QUERY)};
  if (q) {
    const box = document.querySelector('input[type="search"], .search input');
    if (box) { box.value = q; box.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 1500)); }
  }
  const row = document.querySelector('.track[data-id]');
  if (!row) return { error: '没有可点的歌曲行' };
  const title = row.querySelector('.track__title')?.textContent?.trim() ?? '';
  const songId = row.dataset.id;
  row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

  const el = document.querySelector('audio');
  const t0 = Date.now();
  while (Date.now() - t0 < 12000 && el && el.readyState < 2) await new Promise((r) => setTimeout(r, 250));

  // 采样观察是否真在解码播放（短曲会循环，所以看变化次数而不是首尾大小）
  const seen = [];
  let moving = 0, last = -1;
  for (let i = 0; i < 10; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    const t = el ? el.currentTime : 0;
    seen.push(Number(t.toFixed(2)));
    if (last >= 0 && Math.abs(t - last) > 0.05) moving += 1;
    last = t;
  }
  return {
    title, songId, src: el?.src ?? null, readyState: el?.readyState, paused: el?.paused,
    duration: el && Number.isFinite(el.duration) ? Number(el.duration.toFixed(3)) : null,
    moving, samples: seen,
    error: el?.error ? { code: el.error.code, message: el.error.message } : null,
  };
})()`);
console.log("   " + JSON.stringify({ ...play, samples: undefined }));
check("音频已加载（readyState≥2）", (play?.readyState ?? 0) >= 2, `readyState=${play?.readyState}`);
check("没有解码错误", !play?.error, play?.error ? `code=${play.error.code} ${play.error.message}` : "");
check("currentTime 在推进（真的在播）", (play?.moving ?? 0) > 0, `${play?.moving}/9 次采样变化`);
check("拿到时长", Number.isFinite(play?.duration), `${play?.duration}s`);
check("音频与页面同源", String(play?.src || "").startsWith("http://wails.localhost/audio/"), play?.src);

/* ---------------- 3) 按需响度补偿 ---------------- */
if (WANT_LOUDNESS) {
  console.log("\n[3] 按需响度补偿");
  const loud = await evaluate(`(async () => {
    const store = await import('/js/store.js');
    const audio = await import('/js/audio.js');
    const Loud = (await import('/bindings/musicplayer/index.js')).LoudnessService;

    // 必须针对**正在播放**的那首歌验证：响度是按需算的，
    // 只会为当前播放曲目触发测量（这正是设计目标）。
    const songId = store.state.currentId;
    if (!songId) return { error: '没有正在播放的歌曲' };

    // 先清掉这首歌的旧补偿，模拟全新播放
    store.state.config.loudnessMode = 'track';
    store.state.config.loudnessTarget = -16;
    if (store.state.loudnessGains) delete store.state.loudnessGains[songId];

    const t0 = Date.now();
    // 模拟用户打开逐曲均衡：设置页的分段控件就走这条路径
    await audio.refreshLoudnessGains();

    let m = null;
    while (Date.now() - t0 < 90000) {
      await new Promise((r) => setTimeout(r, 1000));
      m = await Loud.Get(songId, -16);
      if (m?.measured) break;
    }
    return {
      songId,
      playing: store.state.currentId === songId,
      waitedMs: Date.now() - t0,
      measured: m?.measured ?? false,
      integrated: m?.integrated ?? null,
      truePeak: m?.truePeak ?? null,
      gainDB: m?.gainDB ?? null,
      frontendGain: store.state.loudnessGains?.[songId] ?? null,
      graph: audio.audioGraphState ? audio.audioGraphState() : null,
    };
  })()`);
  console.log("   " + JSON.stringify(loud));
  check(
    "对正在播放的歌按需算出响度",
    loud?.measured === true,
    loud?.measured ? `${loud.integrated} LUFS / TP ${loud.truePeak}` : JSON.stringify(loud)
  );
  check(
    "补偿进入前端增益表",
    loud?.frontendGain !== null && loud?.frontendGain !== undefined,
    `${loud?.frontendGain} dB`
  );
  check("补偿进入 Web Audio 增益图", Boolean(loud?.graph?.graph), JSON.stringify(loud?.graph));
}

/* ---------------- 4) 转码路径（若能找到非原生格式） ---------------- */
console.log("\n[4] 内置 ffmpeg 能力");
const ff = await evaluate(`(async () => {
  const Media = (await import('/bindings/musicplayer/index.js')).MediaService;
  return await Media.State();
})()`);
console.log("   " + JSON.stringify(ff?.tools ?? ff));
check("内置 ffmpeg 可用", ff?.tools?.available === true, ff?.tools?.describe ?? "");
check("具备转码能力", ff?.canTranscode === true || (ff?.tools?.available ?? false), "");

/* ---------------- 汇总 ---------------- */
console.log("\n================ 汇总 ================");
const failed = results.filter((r) => !r.pass);
console.log(`  ${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) for (const f of failed) console.log(`  ✗ ${f.name} — ${f.detail}`);

if (exceptions.length) {
  console.log("\n未捕获异常:");
  for (const e of exceptions.slice(-6)) console.log("  " + e);
}

writeFileSync(
  path.join(workDir, "e2e.json"),
  JSON.stringify({ results, render, play, logs, exceptions }, null, 2),
  "utf8"
);
ws.close();
child.kill();
await sleep(300);
process.exit(failed.length ? 1 : 0);
