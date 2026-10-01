/* ==========================================================================
   verify-unplayable.mjs — 验证「放不出来的文件」完整闭环
   --------------------------------------------------------------------------
   验证用户在设置页能看到的那条链路：
     播放坏文件 → 弹一条提示 → 自动跳下一首 → 从曲库移除
       → 设置 →「音乐文件夹」里出现「发现 N 个无法播放的文件」
       → 点开能看到是哪个文件 + 失败原因

   用法：node tools/verify-unplayable.mjs --exe bin/lmplayer-verify.exe
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

const EXE = path.resolve(ROOT, arg("exe", "bin/lmplayer-verify.exe"));
const PORT = Number(arg("port", "9411"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(EXE)) {
  console.error(`找不到 ${EXE}`);
  process.exit(1);
}

const MUSIC = path.join(os.homedir(), "Music");
const BROKEN_SRC = path.join(MUSIC, "clm", "当你孤单你会想起谁-clm.m4a");
const BROKEN = path.join(MUSIC, "zz-unplayable-test.m4a");
if (existsSync(BROKEN_SRC)) {
  copyFileSync(BROKEN_SRC, BROKEN);
  console.log(`已放入测试用坏文件：${BROKEN}`);
} else if (!existsSync(BROKEN)) {
  console.error(`找不到源坏文件 ${BROKEN_SRC}`);
  process.exit(1);
}

const workDir = path.join(ROOT, ".tmp-verify-unplayable");
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
console.log("等待应用启动与扫描（16 秒）…");
await sleep(16000);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
};

console.log("\n[1] 播放坏文件 → 应提示一次并自动跳下一首");
const played = await evaluate(`(async () => {
  const app = window.__app;
  if (!app) return { error: 'window.__app 不存在' };
  try { app.navigate('all'); } catch {}
  await new Promise((r) => setTimeout(r, 1200));

  const row = Array.from(document.querySelectorAll('.track[data-id]'))
    .find((el) => (el.textContent || '').includes('zz-unplayable-test'));
  if (!row) return { error: '曲库里没有找到测试坏文件' };

  const songId = row.dataset.id;
  row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

  const samples = [];
  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    samples.push({
      toasts: document.querySelectorAll('.toast').length,
      currentId: app.state.currentId,
      songs: app.state.allSongsRaw.length,
      unplayable: (app.state.unplayableFiles || []).length,
    });
  }
  return {
    songId,
    maxToasts: Math.max(...samples.map((s) => s.toasts)),
    finalId: samples.at(-1).currentId,
    movedAway: samples.at(-1).currentId !== songId,
    unplayableCount: samples.at(-1).unplayable,
    // 这首歌还在曲库列表里吗（应当已经不在）
    stillInLibrary: app.state.allSongsRaw.some((s) => s.id === songId),
  };
})()`);
console.log("   " + JSON.stringify(played));

if (played?.error) {
  check("找到并播放测试坏文件", false, played.error);
} else {
  check("提示没有刷屏（同时 ≤ 3 条）", played.maxToasts <= 3, `峰值 ${played.maxToasts} 条`);
  check("自动跳到下一首", played.movedAway === true, `${played.songId} → ${played.finalId}`);
  check("已从内存曲库移除", played.stillInLibrary === false, `stillInLibrary=${played.stillInLibrary}`);
  check("清单里出现了这条记录", played.unplayableCount >= 1, `${played.unplayableCount} 条`);
}

console.log("\n[2] 设置页「音乐文件夹」里能看到并展开");
const ui = await evaluate(`(async () => {
  const app = window.__app;
  // 打开设置并切到「音乐文件夹」分区
  const shell = await import('/assets/index-CVVSMGSb.js').catch(() => null);
  // 拿不到模块就直接操作 DOM：点侧栏里的设置按钮
  const settingsBtn = document.querySelector('[data-go="settings"], [data-act="open-settings"], #btn-settings');
  if (settingsBtn) settingsBtn.click();
  await new Promise((r) => setTimeout(r, 900));

  // 找清单折叠头
  const head = document.querySelector('[data-act="unplayable-toggle"]');
  const summaryBefore = head ? head.textContent.replace(/\\s+/g, ' ').trim() : null;
  if (head) {
    head.click();
    await new Promise((r) => setTimeout(r, 500));
  }
  const row = document.querySelector('.unplayable__row');
  const title = row?.querySelector('.unplayable__title')?.textContent?.trim() ?? null;
  const reason = row?.querySelector('.unplayable__reason')?.textContent?.trim() ?? null;
  const filePath = row?.querySelector('.unplayable__path')?.textContent?.trim() ?? null;
  return {
    hasHead: Boolean(head),
    summaryBefore,
    rowCount: document.querySelectorAll('.unplayable__row').length,
    title, reason, filePath,
    hasRestore: Boolean(document.querySelector('[data-act="unplayable-restore"]')),
    hasDismiss: Boolean(document.querySelector('[data-act="unplayable-dismiss"]')),
    hasClear: Boolean(document.querySelector('[data-act="unplayable-clear"]')),
  };
})()`);
console.log("   " + JSON.stringify(ui, null, 1));

check("设置里出现「发现 N 个无法播放的文件」", ui?.hasHead === true, ui?.summaryBefore || "");
check("点开能看到具体文件", (ui?.rowCount ?? 0) >= 1, `${ui?.rowCount} 行`);
check("显示了文件名", Boolean(ui?.title), ui?.title || "");
check("显示了失败原因", Boolean(ui?.reason), (ui?.reason || "").slice(0, 70));
check("显示了文件路径", Boolean(ui?.filePath), (ui?.filePath || "").slice(0, 60));
check("有「已修好」与「忽略」按钮", ui?.hasRestore === true && ui?.hasDismiss === true);
check("有「清空清单」按钮", ui?.hasClear === true);

console.log("\n================ 汇总 ================");
const failed = results.filter((r) => !r.pass);
console.log(`  ${results.length - failed.length}/${results.length} 项通过`);
for (const f of failed) console.log(`  ✗ ${f.name} — ${f.detail}`);

console.log("\n控制台（最后 12 条）:");
for (const l of logs.slice(-12)) console.log("  " + l);

writeFileSync(path.join(workDir, "verify.json"), JSON.stringify({ played, ui, results, logs }, null, 2), "utf8");
ws.close();
child.kill();
await sleep(400);
process.exit(failed.length ? 1 : 0);
