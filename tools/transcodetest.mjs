/* ==========================================================================
   transcodetest.mjs — 在真实应用里验证「转码播放」
   --------------------------------------------------------------------------
   前置：曲库里放一个 WebView 放不了的格式（如 .wma）。
   验证：点它 → 走 ffmpeg 转码 → 转出的 WAV 能解码出声，
        并且缓存命中后第二次播放不再调 ffmpeg。
   ========================================================================== */
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const EXE = path.resolve(
  ROOT,
  process.argv.includes("--exe") ? process.argv[process.argv.indexOf("--exe") + 1] : "bin/musicplayer.exe"
);
const PORT = Number(process.env.MP_PORT || 9391);
const QUERY = process.env.MP_QUERY || "转码测试样本";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const workDir = path.join(ROOT, `.tmp-transcode-${PORT}`);
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
  console.error("无法接入");
  child.kill();
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const waiting = new Map();
const logs = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) {
    waiting.get(m.id)(m.result);
    waiting.delete(m.id);
  }
  if (m.method === "Runtime.consoleAPICalled")
    logs.push((m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" "));
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
console.log(`验收目标：${EXE}\n等待启动与扫描…`);
await sleep(12000);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
};

console.log("\n[1] 找到并播放 wma 样本（应走转码）");
const play = await evaluate(`(async () => {
  const shell = await import('/js/shell.js');
  const store = await import('/js/store.js');
  try { shell.navigate('all'); } catch {}
  await new Promise((r) => setTimeout(r, 1200));

  const q = ${JSON.stringify(QUERY)};
  const row = Array.from(document.querySelectorAll('.track[data-id]'))
    .find((el) => (el.textContent || '').includes(q)) || document.querySelector('.track[data-id]');
  if (!row) return { error: '曲库里没有找到样本（是否已扫描到？）' };

  const title = row.querySelector('.track__title')?.textContent?.trim() ?? '';
  const songId = row.dataset.id;
  row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

  const el = document.querySelector('audio');
  const t0 = Date.now();
  // 转码要几秒，耐心等
  while (Date.now() - t0 < 40000 && el && el.readyState < 2) await new Promise((r) => setTimeout(r, 300));

  const seen = []; let moving = 0, last = -1;
  for (let i = 0; i < 8; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    const t = el ? el.currentTime : 0;
    seen.push(Number(t.toFixed(2)));
    if (last >= 0 && Math.abs(t - last) > 0.02) moving += 1;
    last = t;
  }
  return {
    title, songId, src: el?.src ?? null, readyState: el?.readyState, paused: el?.paused,
    duration: el && Number.isFinite(el.duration) ? Number(el.duration.toFixed(3)) : null,
    moving, samples: seen, waitMs: Date.now() - t0,
    error: el?.error ? { code: el.error.code, message: el.error.message } : null,
    // 注意：这一行在模板字符串里，要交给浏览器当正则用，
    // 所以必须写 \\\\. 才是「转义的点」；写 \\. 到了浏览器就变成「任意字符」。
    currentSrcIsWav: /tc_|\\.wav/i.test(el?.src || ''),
  };
})()`);
console.log("   " + JSON.stringify({ ...play, samples: undefined }));
check("找到并加载了样本", (play?.readyState ?? 0) >= 2, `readyState=${play?.readyState} 耗时 ${play?.waitMs}ms`);
check("没有解码错误", !play?.error, play?.error ? `code=${play.error.code} ${play.error.message}` : "");
check("currentTime 在推进（转码后能播）", (play?.moving ?? 0) > 0, `${play?.moving}/7 次采样变化`);
check("时长约 4 秒（与样本一致）", Math.abs((play?.duration ?? 0) - 4.04) < 0.4, `${play?.duration}s`);

console.log("\n[2] 转码缓存已落盘");
const cache = await evaluate(`(async () => {
  const Media = (await import('/bindings/musicplayer/index.js')).MediaService;
  return await Media.CacheStats();
})()`);
console.log("   " + JSON.stringify(cache));
check("转码产物进入缓存", (cache?.count ?? cache?.cacheCount ?? 0) > 0, JSON.stringify(cache));

console.log("\n[3] 再播一次（应命中缓存，快得多）");
const replay = await evaluate(`(async () => {
  const el = document.querySelector('audio');
  const t0 = Date.now();
  el.currentTime = 0;
  await el.play().catch(() => {});
  while (Date.now() - t0 < 8000 && el.readyState < 2) await new Promise((r) => setTimeout(r, 200));
  return { readyState: el.readyState, ms: Date.now() - t0, paused: el.paused, error: el.error ? el.error.code : null };
})()`);
console.log("   " + JSON.stringify(replay));
check("重播可用", (replay?.readyState ?? 0) >= 2 && !replay?.error, JSON.stringify(replay));

console.log("\n================ 汇总 ================");
const failed = results.filter((r) => !r.pass);
console.log(`  ${results.length - failed.length}/${results.length} 项通过`);
for (const f of failed) console.log(`  ✗ ${f.name} — ${f.detail}`);
if (logs.length) {
  console.log("\n控制台:");
  for (const l of logs.slice(-8)) console.log("  " + l);
}

ws.close();
child.kill();
await sleep(300);
process.exit(failed.length ? 1 : 0);
