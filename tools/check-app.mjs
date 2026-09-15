/* ==========================================================================
   check-app.mjs — 在**真实应用**（Go 后端 + WebView2）里验证本次改造
   --------------------------------------------------------------------------
   为什么还需要它：浏览器预览（tools/cdp-check.js、tools/check-player-host.mjs）
   验不了这几件事：
     · 皮肤包在真实 CSP（script-src 'self'）下能不能 import 成功；
     · /skins/ 这条同源托管路由真的通不通（中间件挂载、MIME、no-store）；
     · Wails 生成的新绑定（Cover.List/AddMany、Skins.*）在运行时是否真的存在；
     · 多封面在真实后端（缓存目录 + 文件内嵌）下取回来的形状对不对。
   这些都只有在 exe 里跑才作数。

   用法：
     node tools/check-app.mjs                       # 使用 bin/musicplayer.exe
     node tools/check-app.mjs --exe bin/musicplayer.exe --port 9355 --wait 15000
   退出码 0 = 全部通过。
   ========================================================================== */

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const EXE = path.resolve(ROOT, arg("exe", "bin/musicplayer.exe"));
const PORT = Number(arg("port", "9355"));
const WAIT = Number(arg("wait", "12000"));
// 可选：把数据目录也指到临时目录，避免与「用户正在用的那个实例」抢同一份配置/缓存
const DATA = arg("data", "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(EXE)) {
  console.error(`找不到可执行文件：${EXE}\n先运行：wails3 task build`);
  process.exit(2);
}

const workDir = path.join(ROOT, ".tmp-checkapp");
mkdirSync(workDir, { recursive: true });
const logFd = openSync(path.join(workDir, "app.log"), "w");

console.log(`启动应用：${EXE}`);
const child = spawn(EXE, [], {
  env: {
    ...process.env,
    MUSICPLAYER_DEBUG_PORT: String(PORT),
    WEBVIEW2_USER_DATA_FOLDER: path.join(workDir, "wv2"),
    ...(DATA ? { MUSICPLAYER_DATA_DIR: path.resolve(ROOT, DATA) } : {}),
  },
  stdio: ["ignore", logFd, logFd],
});
closeSync(logFd);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "[OK ]" : "[!! ]"} ${name}${detail ? `  → ${detail}` : ""}`);
}

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
if (!target) {
  console.error("无法连上 WebView2 调试端口（看 .tmp-checkapp/app.log）");
  child.kill();
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let msgId = 0;
const waiting = new Map();
const errors = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) {
    waiting.get(m.id)(m.result);
    waiting.delete(m.id);
    return;
  }
  if (m.method === "Runtime.exceptionThrown") {
    errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    errors.push((m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" "));
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    msgId += 1;
    waiting.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");
await send("Log.enable").catch(() => {});

const evaluate = async (expression) => {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res?.exceptionDetails) {
    return { __error: res.exceptionDetails.exception?.description || res.exceptionDetails.text };
  }
  return res?.result?.value;
};

console.log(`等待 ${WAIT / 1000} 秒让应用完成启动与扫描…\n`);
await sleep(WAIT);

/* ---- 1：皮肤包在真实 CSP 下加载成功（三个内置样式都在按钮组里）---- */
const skins = await evaluate(`(async () => {
  // 样式按钮组挂在播放详情页的头部，而详情页只有打开时才会填充 —— 先打开它。
  // __app.openPlayer 是 main.js 特意暴露给调试用的入口（见文件末尾）。
  window.__app?.openPlayer?.();
  await new Promise((r) => setTimeout(r, 700));
  document.querySelector('[data-pv-skin="immersive"]')?.click();
  await new Promise((r) => setTimeout(r, 500));
  const pv = document.getElementById("playerview");
  const bg = document.getElementById("skin-background");
  return {
    open: pv?.dataset.state,
    buttons: [...document.querySelectorAll("#playerview-mode [data-pv-skin]")].map((b) => b.dataset.pvSkin),
    skin: pv?.dataset.skin,
    bgExists: Boolean(bg),
    hasCard: Boolean(document.querySelector(".immersive__card")),
  };
})()`);
check(
  "真实应用里皮肤包加载正常（样式按钮组齐 + 沉浸舞台换掉了）",
  Array.isArray(skins?.buttons) &&
    // 内置样式清单：变了就必须显式改这里，免得新增样式时漏注册
    skins.buttons.slice(0, 8).join(",") ===
      "classic,immersive,minimal,anime,arcade,magia" &&
    skins.skin === "immersive" &&
    skins.hasCard &&
    skins.bgExists,
  JSON.stringify(skins)
);

/* ---- 2：/skins/ 同源托管真的通（含 MIME 与 no-store）---- */
const route = await evaluate(`(async () => {
  const out = {};
  const j = await fetch("/skins/_template/skin.js");
  out.jsStatus = j.status;
  out.jsType = j.headers.get("content-type") || "";
  out.noStore = j.headers.get("cache-control") || "";
  out.bodyHasExport = (await j.text()).includes("export default");
  out.traversal = (await fetch("/skins/../main.go")).status;
  out.dotfile = (await fetch("/skins/.git/config")).status;
  out.post = (await fetch("/skins/_template/skin.js", { method: "POST" })).status;
  return out;
})()`);
check(
  "示例样式随应用落盘，并且 /skins/ 能同源取到（MIME + no-store）",
  route?.jsStatus === 200 &&
    /text\/javascript/.test(route.jsType) &&
    route.noStore.includes("no-store") &&
    route.bodyHasExport === true,
  JSON.stringify(route)
);
check(
  "/skins/ 挡住了目录穿越、隐藏文件与非 GET 请求",
  route?.traversal === 404 && route?.dotfile === 404 && route?.post === 405,
  `traversal=${route?.traversal} dotfile=${route?.dotfile} post=${route?.post}`
);

/* ---- 3：新绑定在运行时存在（Cover 多封面 API + Skins）---- */
const api = await evaluate(`(async () => {
  const mod = await import("/bindings/musicplayer/index.js");
  const names = (obj) => (obj ? Object.keys(obj).filter((k) => typeof obj[k] === "function").sort() : []);
  return {
    cover: names(mod.CoverService),
    skins: names(mod.SkinService),
    hasSkinsHandler: typeof fetch === "function",
  };
})()`);
check(
  "Cover 绑定已生成多封面接口（AddMany / SetActive / CachedSets）",
  ["AddMany", "SetActive", "CachedSets", "List"].every((n) => api?.cover?.includes(n)),
  JSON.stringify(api?.cover)
);
check(
  "Skins 绑定存在（List / Reload / Dir / RevealDir）",
  ["List", "Reload", "Dir", "RevealDir"].every((n) => api?.skins?.includes(n)),
  JSON.stringify(api?.skins)
);

/* ---- 4：真实后端返回的封面集合形状正确 ---- */
const coverShape = await evaluate(`(async () => {
  const mod = await import("/bindings/musicplayer/index.js");
  const songs = await mod.LibraryService.Songs({});
  const list = Array.isArray(songs) ? songs : songs?.songs || [];
  const song = list.find((s) => s && !s.online) || list[0];
  if (!song) return { empty: true, count: 0 };
  const set = await mod.CoverService.List(song.id);
  return {
    empty: false,
    songId: song.id,
    keys: Object.keys(set || {}).sort(),
    items: Array.isArray(set?.items) ? set.items.length : -1,
    embedded: Array.isArray(set?.embedded) ? set.embedded.length : -1,
    hasCarousel: Object.prototype.hasOwnProperty.call(set || {}, "carousel"),
  };
})()`);
check(
  "Cover.List 返回 {items, embedded, active}，且不再带每首歌的轮播开关",
  coverShape?.empty === true ||
    (["active", "embedded", "id", "items"].every((k) => coverShape?.keys?.includes(k)) &&
      coverShape.hasCarousel === false),
  JSON.stringify(coverShape)
);

/* ---- 5：轮播是全局设置（config 里有这两个键）---- */
const cfg = await evaluate(`(async () => {
  const mod = await import("/bindings/musicplayer/index.js");
  const c = await mod.ConfigService.Get();
  return { carousel: c?.coverCarousel, interval: c?.coverCarouselInterval };
})()`);
check(
  "全局配置里有 coverCarousel / coverCarouselInterval",
  cfg?.carousel === false && Number(cfg?.interval) >= 2,
  JSON.stringify(cfg)
);

/* ---- 6：定时停止的 0~300 滑条 + 列表选中同步 ---- */
const ui = await evaluate(`(async () => {
  // 回到主界面
  document.getElementById("btn-player-back")?.click();
  await new Promise((r) => setTimeout(r, 400));
  document.getElementById("btn-sleep")?.click();
  await new Promise((r) => setTimeout(r, 300));
  const slider = document.getElementById("sleep-slider");
  const raw = slider ? { min: slider.getAttribute("aria-valuemin"), max: slider.getAttribute("aria-valuemax") } : null;
  const rows = [...document.querySelectorAll(".track")];
  const cur = window.__app.state.currentId;
  const next = rows.find((r) => r.dataset.id !== cur)?.dataset.id || null;
  if (next) {
    window.__app.state.currentId = next;
    window.__app.commit();
    await new Promise((r) => setTimeout(r, 300));
  }
  return {
    sleep: raw,
    rowCount: rows.length,
    currentId: window.__app.state.currentId,
    next,
    marked: document.querySelectorAll('.track[aria-current="true"]').length,
    markedId: document.querySelector('.track[aria-current="true"]')?.dataset.id || null,
  };
})()`);
check("定时停止滑条量程是 0~300", ui?.sleep?.min === "0" && ui?.sleep?.max === "300", JSON.stringify(ui?.sleep));
// 曲库只有 1 首时，「切到另一行」这件事没法验（预览下的 40 行场景由
// tools/check-player-host.mjs 覆盖），这里只断言「高亮唯一且等于当前播放」。
check(
  "曲目列表高亮唯一，且就是当前播放那一行",
  ui?.rowCount === 0 ||
    (ui?.marked === 1 && (!ui?.next || ui?.markedId === ui?.next) && ui?.markedId === ui?.currentId),
  JSON.stringify({ rows: ui?.rowCount, marked: ui?.marked, current: ui?.currentId, markedId: ui?.markedId })
);

check("真实应用里没有 console 报错 / 未捕获异常", errors.length === 0, errors.slice(0, 2).join(" | "));

try {
  ws.close();
} catch {
  /* 忽略 */
}
child.kill();

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(failed.length ? `失败 ${failed.length} / ${results.length}` : `全部通过（${results.length} 项）`);
process.exit(failed.length ? 1 : 0);
