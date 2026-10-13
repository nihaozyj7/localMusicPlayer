/* ==========================================================================
   shots.mjs — 用**真实应用**（Go + WebView2）截图，产出 docs/screenshots
   --------------------------------------------------------------------------
   为什么要它：早先的截图是拿无头 Edge 打开**浏览器预览**（假数据）拍的。
   这里改成启动 bin/lmplayer.exe、用 CDP 驱动真实界面、用 Page.captureScreenshot
   抓真实渲染结果。

   曲库用的是 FFmpeg 生成的**演示曲目**（tools/demo-library.py 产出），不涉及任何
   个人音乐文件；数据目录、下载目录、WebView2 profile 全部隔离
   （LMPLAYER_DATA_DIR / WEBVIEW2_USER_DATA_FOLDER）。脚本还会在扫描后核对
   「每一首歌都在演示曲库目录里」，混进真实文件就直接报错退出 ——
   免得别人的私人曲库被拍进要发布的截图。

   三趟：
     1) 先跑一次让后端扫描，把真实歌曲 id 读出来，写进配置（歌单 / 我喜欢）；
     2) 再启动一次，按视图逐个截图；
     3) 为「已下载」标注写一条来源台账记录 —— 台账在启动时才读进内存，
        所以必须重启一次，再搜一次、确认标注上屏、拍下最后一张。

   前置：bin/lmplayer.exe 已构建（wails3 task build）且演示曲库已生成。

   用法：node tools/shots.mjs [--out docs/screenshots] [--port 9371]
   ========================================================================== */

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXE = path.join(ROOT, "bin", "lmplayer.exe");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const OUT = path.resolve(ROOT, arg("out", "docs/screenshots"));
const PORT = Number(arg("port", "9371"));
const DATA = path.join(ROOT, ".tmp-shot-app", "data");
const LIB = path.join(ROOT, ".tmp-demo", "library");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(EXE)) throw new Error(`找不到 ${EXE}，先跑 wails3 task build`);
if (!existsSync(LIB)) throw new Error(`找不到演示曲库 ${LIB}，先跑 .tmp-make-demo.py`);

mkdirSync(OUT, { recursive: true });
mkdirSync(DATA, { recursive: true });

// 清掉上一趟留下的数据目录（配置里可能有上一趟的曲库路径 —— 这一趟必须从零开始），
// 以及上一趟为「已下载标注」造的那个下载文件（它在扫描范围内，会混进下一趟的曲库）。
for (const dir of [DATA, path.join(ROOT, ".tmp-shot-app", "downloads")]) {
  if (!dir.startsWith(path.join(ROOT, ".tmp-shot-app"))) {
    throw new Error(`目录不在预期位置，拒绝清理：${dir}`);
  }
  rmSync(dir, { recursive: true, force: true });
}
mkdirSync(DATA, { recursive: true });

// ---------------------------------------------------------------- 应用启动 ---

let child = null;
let ws = null;
let msgId = 0;
const waiting = new Map();
const pageErrors = [];

async function launch() {
  const workDir = path.join(ROOT, ".tmp-shot-app");
  const logFd = openSync(path.join(workDir, "app.log"), "a");
  child = spawn(EXE, [], {
    env: {
      ...process.env,
      LMPLAYER_DEBUG_PORT: String(PORT),
      WEBVIEW2_USER_DATA_FOLDER: path.join(workDir, "wv2"),
      LMPLAYER_DATA_DIR: DATA,
    },
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
      /* 还没起来 */
    }
  }
  if (!target) throw new Error("连不上调试端口，看 .tmp-shot-app/app.log");

  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) {
      waiting.get(m.id)(m);
      waiting.delete(m.id);
      return;
    }
    if (m.method === "Runtime.exceptionThrown") {
      pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
    }
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Runtime.enable");
  await send("Page.enable");
  await sleep(8000); // 等扫描 + 首屏装配
}

const send = (method, params = {}) =>
  new Promise((resolve) => {
    msgId += 1;
    waiting.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails) {
    throw new Error(res.result.exceptionDetails.exception?.description || "evaluate 异常");
  }
  return res.result?.result?.value;
}

async function shot(name, width = 1440, height = 900) {
  const res = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const data = res.result?.data;
  if (!data) throw new Error(`截图 ${name} 失败`);
  const file = path.join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(data, "base64"));
  const kb = Math.round(statSync(file).size / 1024);
  console.log(`[shot] ${name}.png  ${width}x${height}  ${kb} KB`);
}

function kill() {
  try {
    ws?.close();
  } catch {
    /* 忽略 */
  }
  child?.kill();
}

// ----------------------------------------------------- 第一趟：读真实歌曲 id ---

console.log("第一趟：启动应用让后端扫描演示曲库…");
// ★ 先把「只扫演示曲库」写进配置：默认下载目录（%USERPROFILE%\Music\downloads）里
// 可能有用户自己下载的真实歌曲，绝不能出现在要发布的截图里。所以下载目录也指到
// 这个隔离的数据目录下（空目录）。
const DEMO_DOWNLOADS = path.join(ROOT, ".tmp-shot-app", "downloads");
mkdirSync(DEMO_DOWNLOADS, { recursive: true });
const cfgPath = path.join(DATA, "config.json");
{
  const initial = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : {};
  initial.folders = [{ id: "demo", path: LIB, addedAt: Date.now(), watching: true, status: "ok" }];
  initial.downloadDir = DEMO_DOWNLOADS;
  // ★ 关掉一切联网匹配：否则播放界面会把**真实歌曲的在线歌词**匹配到同名的演示曲目上
  // （实测「早班地铁」这类标题会命中真歌），那既是他人的版权内容、也是错误的署名。
  // 演示曲目自带 .lrc，歌词面板用本机文件即可。
  initial.lyricsSources = ["embedded", "lrc-file", "cache"];
  initial.onlineCover = false;
  initial.onlineWordLyrics = false;
  initial.aiLyricsClean = false;
  initial.checkUpdateOnStart = false;
  writeFileSync(cfgPath, JSON.stringify(initial, null, 2));
}
await launch();
const songs = await evaluate(`window.__app.state.songs.map(s => ({ id: s.id, title: s.title, path: s.path }))`);
console.log(`扫到 ${songs.length} 首：${songs.map((s) => s.title).join(" / ")}`);
if (!songs.length) throw new Error("演示曲库没扫到歌，检查配置里的 folders");
const outsiders = songs.filter((s) => s.path && !s.path.startsWith(LIB));
if (outsiders.length) {
  throw new Error(
    `截图曲库里混进了非演示曲目（${outsiders.length} 首，例如 ${outsiders[0].path}）—— 先修好隔离再截图`
  );
}
kill();
await sleep(2500);

// 把歌单 / 我喜欢 / 播放队列写进配置（队列与收藏是前端快照，歌单在后端配置里）
const ids = songs.map((s) => s.id);
{
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  cfg.playlists = [
    { id: "pl-demo-night", name: "深夜飞行", songIds: [ids[2], ids[1], ids[0], ids[3]] },
    { id: "pl-demo-morning", name: "通勤歌单", songIds: [ids[6], ids[7], ids[8]].filter(Boolean) },
  ];
  cfg.likedIds = [ids[0], ids[4], ids[8]].filter(Boolean);
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
}
console.log("写入配置：2 个歌单 + 我喜欢 + 队列");

// ------------------------------------------------------------ 第二趟：截图 ---

console.log("第二趟：重新启动并逐个视图截图…");
pageErrors.length = 0;
await launch();

const state = (js) => evaluate(`(() => { const app = window.__app; ${js} app.commit(); })()`);

// 01 主界面（深色，默认）
await shot("01-main-dark");

// 02 主界面（浅色）
await state(`app.state.config.themeMode = "light"; app.state.config.theme = "flat-light";`);
await sleep(1200);
await shot("02-main-light");

// 03 播放队列
await state(`app.state.queue = ${JSON.stringify([ids[2], ids[1], ids[5], ids[0], ids[4]].filter(Boolean))};
  app.navigate("queue");`);
await sleep(900);
await shot("03-queue");

// 04 歌单
await state(`app.state.config.theme = "flat-dark"; app.state.config.themeMode = "dark";
  app.navigate("playlist", "pl-demo-night");`);
await sleep(1200);
await shot("04-playlist");

// 05 设置 · 曲库（音乐文件夹）
await state(`app.state.settingsOpen = true; app.state.settingsSection = "library";`);
await sleep(1200);
await shot("05-settings-folders");

// 06/07/08 播放界面：经典 / 沉浸
await state(`app.state.settingsOpen = false;
  app.state.currentId = ${JSON.stringify(ids[2])};
  app.state.playerOpen = true; app.state.pvMode = "classic";
  app.state.config.playerViewMode = "classic";
  app.state.playing = true; app.state.position = 62000;`);
await sleep(2500);
await shot("06-player-classic");

await state(`app.state.pvMode = "immersive"; app.state.config.playerViewMode = "immersive";`);
await sleep(3200); // 沉浸样式要加载背景层
await shot("07-player-immersive");

// 09 播放界面 · 浅色
await state(`app.state.config.theme = "flat-light"; app.state.config.themeMode = "light";
  app.state.pvMode = "classic"; app.state.config.playerViewMode = "classic";`);
await sleep(2600);
await shot("08-player-light");

// 10 封面取色主题 · 沉浸
await state(`app.state.config.theme = "cover-dark"; app.state.config.themeMode = "dark";
  app.state.pvMode = "immersive"; app.state.config.playerViewMode = "immersive";`);
await sleep(3200);
await shot("09-cover-dark");

// 11 窄窗口（靠视口仿真，验证响应式布局）
await state(`app.state.playerOpen = false; app.state.config.theme = "flat-dark";
  app.state.config.themeMode = "dark";`);
await send("Emulation.setDeviceMetricsOverride", {
  width: 1024,
  height: 700,
  deviceScaleFactor: 1,
  mobile: false,
});
await sleep(1500);
await shot("10-min-window", 1024, 700);
await send("Emulation.clearDeviceMetricsOverride");
await sleep(600);

// 12 在线搜索结果 + 「已下载」标注（0.2.0 的重点）
await state(`
  app.state.searchOpen = true;
  app.state.view = "library";
`);
await sleep(1500);
const keywordBox = await evaluate(`(() => {
  const input = document.querySelector("#search-input");
  if (!input) return { ok: false, why: "找不到 #search-input" };
  input.value = "夜航";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return { ok: true };
})()`);
console.log("填入关键词：", JSON.stringify(keywordBox));
await sleep(600);
// 搜索由输入框的 Enter 触发（没有 form）
const entered = await evaluate(`(() => {
  const input = document.querySelector("#search-input");
  if (!input) return { ok: false };
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  return { ok: true, keyword: window.__app.searchState.keyword };
})()`);
console.log("触发在线搜索：", JSON.stringify(entered));
let found = [];
for (let i = 0; i < 30; i += 1) {
  await sleep(1000);
  const st = await evaluate(`(() => {
    const s = window.__app.searchState;
    return { loading: s.loading, count: (s.results || []).length, message: s.message, query: s.query };
  })()`);
  if (!st.loading && (st.count || st.message || st.query)) {
    console.log("搜索结束：", JSON.stringify(st));
    break;
  }
}
found = await evaluate(
  `(window.__app.searchState.results || []).slice(0, 3).map(s => ({ id: s.id, bvid: s.bvid, title: s.title }))`
);
console.log(`搜索到 ${found?.length || 0} 条结果`, JSON.stringify(found?.[0] || null));

if (found?.length) {
  // 把第一条标成「已下载」：往**真实台账**写一条指向真实文件的记录。
  // 台账在应用启动时读进内存索引，所以写完必须**重启一次**它才看得见 ——
  // 于是这里收尾成第三趟：重启 → 重开搜索 → 等结果上屏 → 标注。
  const target = found[0];
  const demoFile = path.join(ROOT, ".tmp-shot-app", "downloads", `演示下载-${target.bvid}.m4a`);
  mkdirSync(path.dirname(demoFile), { recursive: true });
  writeFileSync(demoFile, readFileSync(path.join(LIB, "夜航", "01 起雾的跑道.m4a")));
  const ledger = path.join(DATA, "online-sources.jsonl");
  const line = JSON.stringify({
    bvid: target.bvid,
    kind: "download",
    title: target.title || "",
    artist: "",
    ext: "m4a",
    path: demoFile,
    dir: path.dirname(demoFile),
    origin: "screenshot",
    from: "cache",
    at: Date.now(),
  });
  writeFileSync(ledger, `${existsSync(ledger) ? readFileSync(ledger, "utf8") : ""}${line}\n`);
  console.log(`已把 ${target.bvid} 写进台账，重启应用让它生效…`);

  kill();
  await sleep(2500);
  await launch();
  await state(`app.state.searchOpen = true;`);
  await sleep(1500);
  let ok = 0;
  for (let attempt = 1; attempt <= 3 && !ok; attempt += 1) {
    await evaluate(`(() => {
      const input = document.querySelector("#search-input");
      if (!input) return;
      input.value = "夜航";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await sleep(600);
    await evaluate(`document.querySelector("#search-input")?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`);
    for (let i = 0; i < 25; i += 1) {
      await sleep(1000);
      const st = await evaluate(`(() => {
        const s = window.__app.searchState;
        return { n: (s.results || []).length, loading: s.loading, message: s.message };
      })()`);
      ok = st.n;
      if (ok) {
        console.log(`第三趟搜索成功（第 ${attempt} 次尝试）：${st.n} 条`);
        break;
      }
      if (!st.loading && st.message) {
        console.log(`第三趟第 ${attempt} 次尝试失败：${st.message}`);
        break;
      }
    }
  }
  await sleep(3000); // 等 refreshSources 补标注
  const badge = await evaluate(`(() => ({
    rows: document.querySelectorAll('.search-row[data-search-online="1"]').length,
    marked: [...document.querySelectorAll('.search-row[data-downloaded="1"]')].length,
    badge: document.querySelector(".search-row__badge")?.textContent?.trim() || "",
    tip: document.querySelector(".search-row__badge")?.getAttribute("data-tip") || "",
  }))()`);
  console.log("标注检查：", JSON.stringify(badge));
}
await shot("11-search-downloaded");

console.log(`页面异常 ${pageErrors.length} 条`);
if (pageErrors.length) console.log(pageErrors.slice(0, 3).join("\n"));
kill();
await sleep(1200);
process.exit(0);
