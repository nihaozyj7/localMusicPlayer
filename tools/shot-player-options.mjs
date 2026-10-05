/* ==========================================================================
   shot-player-options.mjs — 对**真实运行的应用**截取播放选项面板
   --------------------------------------------------------------------------
   与 shot-lit.mjs 的区别：那个跑的是无后端静态预览，而播放选项面板依赖
   真实配置与桌面歌词窗口（三选一首次渲染就要读 showDesktopLyrics /
   showDesktopWallpaper），静态预览里那两项恒为 false，看不到真实状态。

   这里改成：启动 bin/lmplayer.exe（带 CDP 调试端口）→ 打开选项面板 → 截图。
   产物写到 .task/shots/player-options.png。

   用法：node tools/shot-player-options.mjs [--exe bin/lmplayer.exe]
   ========================================================================== */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const EXE = path.resolve(ROOT, arg("exe", "bin/lmplayer.exe"));
const PORT = Number(arg("port", "9399"));
const OUT = path.join(ROOT, ".task", "shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(EXE)) {
  console.error(`找不到可执行文件：${EXE}`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const workDir = path.join(ROOT, ".tmp-shot-options");
rmSync(workDir, { recursive: true, force: true });
const dataDir = path.join(workDir, "data");
mkdirSync(dataDir, { recursive: true });

function get(pathname) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: PORT, path: pathname }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

const logPath = path.join(workDir, "app.log");
const fd = openSync(logPath, "w");
const child = spawn(EXE, [], {
  env: {
    ...process.env,
    LMPLAYER_DEBUG_PORT: String(PORT),
    WEBVIEW2_USER_DATA_FOLDER: path.join(workDir, "wv2"),
    LMPLAYER_DATA_DIR: dataDir,
    LMPLAYER_MUSIC_DIR: path.join(workDir, "Music"),
  },
  stdio: ["ignore", fd, fd],
});
closeSync(fd);

let target = null;
for (let i = 0; i < 150 && !target; i += 1) {
  await sleep(400);
  try {
    const list = JSON.parse(await get("/json/list"));
    target = list.find((t) => t.type === "page") || null;
  } catch {
    /* 等 DevTools 起来 */
  }
}
if (!target) {
  child.kill();
  console.error(`应用未启动，日志：${logPath}`);
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let msgId = 0;
const send = (method, params = {}) =>
  new Promise((resolve) => {
    msgId += 1;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
});
await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");

const evalJs = async (expression) => {
  const res = await send("Runtime.evaluate", {
    expression: `(async () => { ${expression} })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  return res?.result?.value;
};

for (let i = 0; i < 60; i += 1) {
  const ready = await send("Runtime.evaluate", {
    expression: "document.body.dataset.ready === 'true'",
    returnByValue: true,
  });
  if (ready?.result?.value === true) break;
  await sleep(500);
}
await sleep(1500);

// 打开播放选项面板，并停一下让开合过渡走完（否则截到的是动画中间帧）
await evalJs(`document.getElementById("btn-options")?.click();`);
await sleep(900);

/**
 * 截图。
 *
 * 默认截「播放选项面板」；带 --settings 时先关掉面板、再打开设置层滚到 AI 卡片
 * —— 这一轮新增的「下载歌曲时用 AI 整理元数据」开关也要有一张留档图。
 */
const wantSettings = process.argv.includes("--settings");
if (wantSettings) {
  await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape", bubbles:true}));`);
  await sleep(500);
  await evalJs(`document.querySelector('[aria-label="设置"]')?.click();`);
  await sleep(1200);
  await evalJs(`
    const card = document.getElementById("sec-ai");
    if (card) card.scrollIntoView({ block: "center" });
  `);
  await sleep(800);
}

const shot = await send("Page.captureScreenshot", { format: "png" });
if (shot?.data) {
  const file = path.join(OUT, wantSettings ? "settings-ai.png" : "player-options.png");
  writeFileSync(file, Buffer.from(shot.data, "base64"));
  console.log(`已截图：${file}`);
} else {
  console.error("截图失败");
}

ws.close();
child.kill();
await sleep(2000);
