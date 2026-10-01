/* ==========================================================================
   verify-playback-failure.mjs — 在真实应用里验证「放不出来的歌」的行为
   --------------------------------------------------------------------------
   验证两条用户可见的行为（对应 audio.js#handlePlaybackFailure）：
     1. 放不出来的歌**只弹一条**错误提示（不是疯狂刷屏）；
     2. 自动跳到下一首，播放继续。

   做法：直接把一首已知损坏的文件放进曲库（用户曲库里那首 clm/*.m4a 的
   AAC 流是坏的，ffmpeg 解不出来），点它，然后数 toast 数量并看 currentId
   有没有变成下一首。

   用法：node tools/verify-playback-failure.mjs --exe bin/lmplayer-debug.exe
   ========================================================================== */

import { spawn } from "node:child_process";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const EXE = path.resolve(ROOT, arg("exe", "bin/lmplayer-debug.exe"));
const PORT = Number(arg("port", "9401"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(EXE)) {
  console.error(`找不到 ${EXE}（先跑 wails3 task build）`);
  process.exit(1);
}

// 把用户那首损坏的 m4a 拷进曲库目录：文件名带「坏文件」便于定位
const MUSIC = path.join(os.homedir(), "Music");
const BROKEN_SRC = path.join(MUSIC, "clm", "当你孤单你会想起谁-clm.m4a");
const BROKEN = path.join(MUSIC, "zz-broken-playback-test.m4a");
if (existsSync(BROKEN_SRC)) {
  copyFileSync(BROKEN_SRC, BROKEN);
  console.log(`已放入测试用坏文件：${BROKEN}`);
} else if (!existsSync(BROKEN)) {
  console.error(`找不到源坏文件 ${BROKEN_SRC}，请手动放一个无法解码的音频到 ${BROKEN}`);
  process.exit(1);
}

const workDir = path.join(ROOT, ".tmp-verify-failure");
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
console.log("等待应用启动与扫描（15 秒）…");
await sleep(15000);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
};

console.log("\n[1] 扫描到坏文件并播放它");
const played = await evaluate(`(async () => {
  // 打包后的产物是哈希文件名的 chunk，不能 import('/js/shell.js')。
  // 用 main.js 暴露的 window.__app（里面有 state / currentSong / navigate）。
  const app = window.__app;
  if (!app) return { error: 'window.__app 不存在（main.js 没挂上？）' };
  try { app.navigate('all'); } catch {}
  await new Promise((r) => setTimeout(r, 1200));

  const row = Array.from(document.querySelectorAll('.track[data-id]'))
    .find((el) => (el.textContent || '').includes('zz-broken-playback-test'));
  if (!row) return { error: '曲库里没有找到测试坏文件（没扫到？）' };

  const songId = row.dataset.id;
  const before = app.state.currentId;

  // 播放它，然后持续 12 秒观察：toast 数量 + currentId 是否变化
  row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

  const samples = [];
  for (let i = 0; i < 24; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    samples.push({
      toasts: document.querySelectorAll('.toast').length,
      currentId: app.state.currentId,
      playing: app.state.playing,
    });
  }
  return {
    songId,
    before,
    maxToasts: Math.max(...samples.map((s) => s.toasts)),
    lastToasts: samples.at(-1).toasts,
    finalId: samples.at(-1).currentId,
    finalPlaying: samples.at(-1).playing,
    movedAway: samples.at(-1).currentId !== songId,
    idChanges: [...new Set(samples.map((s) => s.currentId))].length,
    // 把出现过的 id 顺序记下来，便于判断是不是「跳了一首就停住」
    sequence: [...new Set(samples.map((s) => s.currentId))],
  };
})()`);
console.log("   " + JSON.stringify(played));

if (played?.error) {
  check("找到并播放测试坏文件", false, played.error);
} else {
  check("找到并播放测试坏文件", true, `id=${played.songId}`);
  // 关键断言：toast 不能刷屏（同时存在的提示应当只有寥寥几条）
  check(
    "错误提示没有刷屏（同时存在 ≤ 3 条）",
    played.maxToasts <= 3,
    `峰值 ${played.maxToasts} 条，结束时 ${played.lastToasts} 条`
  );
  // 关键断言：自动跳到下一首
  check("自动切换到下一首", played.movedAway === true, `currentId ${played.songId} → ${played.finalId}`);
  // 不该无限连跳（一首坏文件只跳一次）
  check(
    "没有无限连跳（currentId 变化次数有限）",
    played.idChanges <= 3,
    `出现过的 currentId 数量：${played.idChanges}`
  );
}

console.log("\n================ 汇总 ================");
const failed = results.filter((r) => !r.pass);
console.log(`  ${results.length - failed.length}/${results.length} 项通过`);
for (const f of failed) console.log(`  ✗ ${f.name} — ${f.detail}`);

console.log("\n控制台（最后 15 条）:");
for (const l of logs.slice(-15)) console.log("  " + l);

writeFileSync(path.join(workDir, "verify.json"), JSON.stringify({ played, results, logs }, null, 2), "utf8");
ws.close();
child.kill();
await sleep(400);
process.exit(failed.length ? 1 : 0);
