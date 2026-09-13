/* ==========================================================================
   check-density-columns.mjs — 列表密度 + 表头列显隐自检（无头浏览器 / 预览数据）
   --------------------------------------------------------------------------
   盯两件容易「看着对、其实漏了」的事：

   1. **列表密度必须对所有列表生效。**
      密度规则挂在根元素（:root[data-density]）而不是 .tracks 上，因为
      底部播放列表面板 / 选项面板 / 搜索弹层都在 #app **之外**。
      只写在 .tracks 上时，本地歌曲会变、底栏队列面板纹丝不动 —— 实测到的问题。
      所以这里同时量「曲目行高」和「底栏队列项内边距/封面尺寸」。

   2. **表头的列显隐菜单。**
      隐藏列必须是「列宽归零 + 单元格裁剪」，**不能** display:none：
      网格项一旦被拿掉，后面的单元格会整体前移一格（时长跑进 0 宽的专辑列里），
      表头与数据行各错各的。所以这里断言：列数不变、该列宽度为 0、
      表头与数据行的左边界、时长列 x 坐标完全一致。

   用法：node tools/check-density-columns.mjs [--port 5173]
   ========================================================================== */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) {
  console.error("找不到 Edge");
  process.exit(2);
}

const PORT = 9481;
const BASE = `http://127.0.0.1:${arg("port", "5173")}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const get = (p) =>
  new Promise((res, rej) =>
    http
      .get({ host: "127.0.0.1", port: PORT, path: p }, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => res(d));
      })
      .on("error", rej)
  );

const child = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--window-size=1416,900",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\mp-edge-density`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

let target = null;
for (let i = 0; i < 80 && !target; i += 1) {
  await sleep(250);
  try {
    target = JSON.parse(await get("/json/list")).find((t) => t.type === "page");
  } catch {
    /* 等 DevTools */
  }
}
if (!target) {
  console.error("连不上 Edge DevTools");
  child.kill();
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const consoleErrors = [];
let id = 0;
const send = (m, p = {}) =>
  new Promise((r) => {
    id += 1;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method: m, params: p }));
  });
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result ?? {});
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.exceptionThrown") {
    consoleErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  }
});
await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");
await send("Page.enable");

const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

// 预览参数会被 persist() 写进 localStorage，每次导航前先清一次，
// 否则上一轮的密度会串到下一轮（对照测量就废了）。
const goto = async (query) => {
  await send("Page.navigate", { url: BASE + query });
  await sleep(400);
  await evalJs("localStorage.clear(); true");
  await send("Page.navigate", { url: BASE + query });
  await sleep(1600);
};

const MEASURE = `(() => {
  const row = document.querySelector(".tracks__body .track");
  const head = document.querySelector(".tracks__head");
  const album = document.querySelector(".tracks__body .track__album");
  const timeCell = document.querySelector(".tracks__body .track__time");
  const timeHead = document.querySelector(".tracks__head .tracks__sort[data-sort='duration']");
  const qItem = document.querySelector("#queue-panel-body .queue-item");
  const x = (n) => (n ? Math.round(n.getBoundingClientRect().left) : null);
  const w = (n) => (n ? Math.round(n.getBoundingClientRect().width) : null);
  const cols = (n) => (n ? getComputedStyle(n).gridTemplateColumns.split(" ").length : 0);
  const cs = getComputedStyle(document.documentElement);
  return {
    rootDensity: document.documentElement.dataset.density || null,
    tracksDensity: document.querySelector(".tracks")?.dataset.density ?? null,
    albumAttr: document.querySelector(".tracks")?.dataset.album ?? null,
    tokenCompact: cs.getPropertyValue("--row-h-compact").trim(),
    rowH: row ? Math.round(row.getBoundingClientRect().height) : null,
    rowCover: row ? getComputedStyle(row.querySelector(".track__cover")).getPropertyValue("--size-cover-sm").trim() : null,
    qItemH: qItem ? Math.round(qItem.getBoundingClientRect().height) : null,
    qPadTop: qItem ? getComputedStyle(qItem).paddingTop : null,
    qCover: qItem ? getComputedStyle(qItem.querySelector(".queue-item__cover")).width : null,
    headCols: cols(head),
    rowCols: cols(row),
    albumW: w(album),
    albumOverflow: album ? getComputedStyle(album).overflow : null,
    headX: x(head),
    rowX: x(row),
    timeX: x(timeCell),
    timeHeadX: x(timeHead),
  };
})()`;

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ ok, name });
  console.log(`[${ok ? "OK " : "!! "}] ${name}${detail ? "  — " + detail : ""}`);
};

/* ---------- 1) 紧凑密度：三个视图 + 底栏队列面板一起变 ---------- */
console.log("— 列表密度 —");
const viewCases = [
  ["本地歌曲", "?probe=1&density=compact"],
  ["播放列表", "?probe=1&density=compact&tab=queue"],
  ["歌单", "?probe=1&density=compact&tab=playlist"],
];
let compact = null;
for (const [name, q] of viewCases) {
  await goto(q);
  await evalJs(`document.getElementById("btn-playlist")?.click()`);
  await sleep(350);
  const m = await evalJs(MEASURE);
  if (!compact) compact = m;
  check(
    `紧凑 · ${name}：曲目行高 ${m.rowH}px / 底栏队列项 ${m.qItemH}px`,
    m.rowH === 44 && m.qItemH < 52 && m.qPadTop === "4px" && m.qCover === "26px",
    `pad=${m.qPadTop} cover=${m.qCover} root=${m.rootDensity} tracks=${m.tracksDensity}`
  );
}

// 对照：标准密度必须明显更松（证明紧凑真的在起作用，而不是两者本来一样）
await goto("?probe=1");
await evalJs(`document.getElementById("btn-playlist")?.click()`);
await sleep(350);
const cozy = await evalJs(MEASURE);
check(
  `标准密度更松：曲目行高 ${cozy.rowH}px / 底栏队列项 ${cozy.qItemH}px`,
  cozy.rowH > compact.rowH && cozy.qItemH > compact.qItemH && cozy.qCover === "32px",
  `pad=${cozy.qPadTop} cover=${cozy.qCover}`
);
check("密度令牌与 CSS 一致（--row-h-compact = 44px）", compact.tokenCompact === "44px", compact.tokenCompact);

/* ---------- 2) 表头右侧菜单 → 隐藏专辑列 ---------- */
console.log("\n— 表头列显隐 —");
await goto("?probe=1");
const before = await evalJs(MEASURE);
check(
  "默认显示专辑列",
  before.albumAttr === "on" && before.albumW > 0,
  `attr=${before.albumAttr} w=${before.albumW}`
);

// 在表头上右键 → 菜单应当出现
await evalJs(`(() => {
  const head = document.querySelector(".tracks__head");
  const r = head.getBoundingClientRect();
  head.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + 10 }));
  return true;
})()`);
await sleep(300);
const menuItems = await evalJs(`Array.from(document.querySelectorAll("#menu .menu__item")).map((b) => b.dataset.id)`);
check("表头右键弹出列菜单", Array.isArray(menuItems) && menuItems.includes("col-album"), JSON.stringify(menuItems));

await evalJs(`document.querySelector('#menu .menu__item[data-id="col-album"]')?.click()`);
await sleep(500);
const after = await evalJs(MEASURE);
check("点一下「专辑」后该列消失", after.albumAttr === "off" && after.albumW === 0, `w=${after.albumW}`);
check(
  "隐藏后列数不变（没有把网格项拿掉）",
  after.headCols === before.headCols && after.rowCols === before.rowCols,
  `表头 ${before.headCols}→${after.headCols} / 行 ${before.rowCols}→${after.rowCols}`
);
check(
  "隐藏后表头与数据行仍然对齐",
  after.headX === after.rowX && after.timeHeadX === after.timeX,
  `head=${after.headX} row=${after.rowX} timeHead=${after.timeHeadX} time=${after.timeX}`
);
check("隐藏后内容被裁剪（没有溢出到相邻列）", after.albumOverflow === "hidden", String(after.albumOverflow));

// 关闭菜单再刷新一次：状态存进配置，应当能恢复
await evalJs(`document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); true`);
await sleep(200);
await send("Page.navigate", { url: BASE + "?probe=1" });
await sleep(1600);
const persisted = await evalJs(MEASURE);
check(
  "刷新后仍然是隐藏状态（落进配置）",
  persisted.albumAttr === "off" && persisted.albumW === 0,
  `attr=${persisted.albumAttr}`
);

// 预览参数对照 + 恢复默认列
await goto("?probe=1&album=off");
const urlOff = await evalJs(MEASURE);
check("?album=off 与菜单结果一致", urlOff.albumAttr === "off" && urlOff.albumW === 0, `w=${urlOff.albumW}`);

await evalJs(`(() => {
  const head = document.querySelector(".tracks__head");
  const r = head.getBoundingClientRect();
  head.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + 10 }));
  return true;
})()`);
await sleep(250);
await evalJs(`document.querySelector('#menu .menu__item[data-id="col-reset"]')?.click()`);
await sleep(450);
const reset = await evalJs(MEASURE);
check(
  "「恢复默认列」把专辑列放回来",
  reset.albumAttr === "on" && reset.albumW > 0,
  `attr=${reset.albumAttr} w=${reset.albumW}`
);

check("整轮没有控制台异常", consoleErrors.length === 0, consoleErrors.join(" | "));

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length ? "失败" : "全部通过"}（${results.length - failed.length}/${results.length} 项）`);
ws.close();
child.kill();
process.exit(failed.length ? 1 : 0);
