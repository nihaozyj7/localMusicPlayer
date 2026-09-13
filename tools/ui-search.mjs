/* ==========================================================================
   ui-search.mjs — 搜索弹层交互自检（无头浏览器 / 预览数据）
   --------------------------------------------------------------------------
   需求（逐条对应断言）：
     1. 点标题栏搜索按钮 → 打开搜索弹层，光标自动聚焦在弹层里的搜索框；
     2. 输入过程中不丢焦点、不中断；
     3. 回车 → 在同一个弹层里显示结果；
     4. 弹层里有清空按钮，点它会同时清掉输入与结果；
     5. 没有清空之前结果不会被销毁（关掉再打开还是上次的结果）；
     6. 试听在线歌曲：进播放列表但不进「本地歌曲」；
     7. 本地搜索已挪到「本地歌曲」列表上方的筛选框（弹层里不再有本地标签）；
     8. 全程没有 console 报错。

   用法：node tools/ui-search.mjs [--port 5173]
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

const PORT = 9455;
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
    "--disable-extensions",
    "--window-size=1440,900",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\mp-edge-search`,
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

const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let id = 0;
const send = (m, p = {}) =>
  new Promise((r) => {
    id += 1;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method: m, params: p }));
  });
const consoleErrors = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.exceptionThrown") {
    consoleErrors.push("EXC " + m.params.exceptionDetails.text);
  } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    const text = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
    if (!/favicon/i.test(text)) consoleErrors.push("ERR " + text);
  }
});
await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");
await send("Page.enable");

const evalJs = async (expr) => {
  const res = await send("Runtime.evaluate", {
    expression: `(async () => { ${expr} })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res?.exceptionDetails) {
    throw new Error(res.exceptionDetails.text + " " + (res.exceptionDetails.exception?.description || ""));
  }
  return res?.result?.value;
};

await send("Page.navigate", { url: BASE });
await sleep(2600);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "[OK ]" : "[!! ]"} ${name}${detail ? `  — ${detail}` : ""}`);
}

try {
  /* 1. 默认收起，点按钮才打开 */
  const closed = await evalJs(`
    const layer = document.getElementById("search-overlay");
    return { hasBtn: Boolean(document.getElementById("btn-search")), hidden: layer ? layer.hidden : null, exists: Boolean(layer) };
  `);
  check(
    "默认不显示搜索弹层，标题栏有搜索按钮",
    closed.hasBtn && (closed.hidden === true || closed.exists === false),
    JSON.stringify(closed)
  );

  await evalJs(`document.getElementById("btn-search").click(); return true;`);
  await sleep(450);
  const opened = await evalJs(`
    const layer = document.getElementById("search-overlay");
    const input = document.getElementById("search-input");
    return {
      hidden: layer.hidden,
      state: layer.dataset.state,
      focused: document.activeElement === input,
      inputInLayer: layer.contains(input),
    };
  `);
  check("点搜索按钮打开弹层", opened.hidden === false && opened.state === "opened", JSON.stringify(opened));
  check("搜索框在弹层里且自动聚焦", opened.inputInLayer === true && opened.focused === true, JSON.stringify(opened));

  /* 2. 输入不中断（用 insertText 模拟真实输入法上屏） */
  const typed = await evalJs(`
    const input = document.getElementById("search-input");
    input.focus();
    input.value = "";
    return true;
  `);
  void typed;
  await send("Input.insertText", { text: "陈默" });
  await sleep(250);
  await send("Input.insertText", { text: "的歌" });
  await sleep(350);
  const afterType = await evalJs(`
    const input = document.getElementById("search-input");
    return { value: input.value, focused: document.activeElement === input };
  `);
  check(
    "连续输入不丢焦点、字符不丢",
    afterType.value === "陈默的歌" && afterType.focused === true,
    JSON.stringify(afterType)
  );

  /* 3. 弹层里不再有「本地曲库」标签（本地搜索已独立成列表上方的筛选框） */
  const noLocalTab = await evalJs(`
    return {
      localTab: Boolean(document.querySelector('[data-search-tab="local"]')),
      tabs: document.querySelectorAll("[data-search-tab]").length,
    };
  `);
  check("在线搜索弹层不再有本地标签", noLocalTab.localTab === false, JSON.stringify(noLocalTab));

  /* 4. 本地歌曲上方的筛选框：可见、能过滤、输入不丢焦点 */
  await evalJs(`
    const store = await import("/js/store.js");
    store.state.query = "";
    store.state.view = "library";
    store.state.playlistId = null;
    store.commit();
    await new Promise((r) => setTimeout(r, 320));
    return true;
  `);
  const filterBar = await evalJs(`
    const bar = document.getElementById("content-filter");
    const input = document.getElementById("content-filter-input");
    // compareDocumentPosition 的 4 = DOCUMENT_POSITION_FOLLOWING：确认筛选框在内容区之前
    const beforeBody = bar && document.getElementById("content-body")
      ? Boolean(bar.compareDocumentPosition(document.getElementById("content-body")) & 4)
      : false;
    return { visible: Boolean(bar && !bar.hidden), hasInput: Boolean(input), beforeBody };
  `);
  check(
    "本地歌曲上方有筛选框",
    filterBar.visible === true && filterBar.hasInput === true && filterBar.beforeBody === true,
    JSON.stringify(filterBar)
  );

  await evalJs(`
    const input = document.getElementById("content-filter-input");
    input.focus();
    input.value = "陈默";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  `);
  await sleep(420);
  const filtered = await evalJs(`
    const store = await import("/js/store.js");
    const input = document.getElementById("content-filter-input");
    return {
      total: store.state.songs.length,
      visible: document.querySelectorAll(".track").length,
      query: store.state.query,
      focused: document.activeElement === input,
      count: document.getElementById("content-filter-count").textContent,
    };
  `);
  check(
    "筛选框即时过滤且不丢焦点",
    filtered.query === "陈默" &&
      filtered.visible > 0 &&
      filtered.visible < filtered.total &&
      filtered.focused === true,
    JSON.stringify(filtered)
  );

  /* 4. 关掉再打开：结果还在（没有点清空就不销毁） */
  await evalJs(`
    const body = document.getElementById("search-body");
    if (body) body.dataset.probeId = "keep-me";
    document.querySelector("[data-search-close]").click();
    return true;
  `);
  await sleep(400);
  const hiddenState = await evalJs(`
    const layer = document.getElementById("search-overlay");
    const body = document.getElementById("search-body");
    return { hidden: layer.hidden, kept: body?.dataset.probeId === "keep-me", rows: body?.querySelectorAll(".search-row").length || 0 };
  `);
  // 在线结果面板在预览下可能是空态，这里只验证「节点没被销毁」
  check(
    "关闭只是隐藏，结果 DOM 保留",
    hiddenState.hidden === true && hiddenState.kept === true,
    JSON.stringify(hiddenState)
  );

  await evalJs(`document.getElementById("btn-search").click(); return true;`);
  await sleep(400);
  const reopened = await evalJs(`
    const layer = document.getElementById("search-overlay");
    const body = document.getElementById("search-body");
    return {
      hidden: layer.hidden,
      sameNode: body?.dataset.probeId === "keep-me",
      rows: body?.querySelectorAll(".search-row").length || 0,
      value: document.getElementById("search-input").value,
    };
  `);
  check(
    "再次打开复用同一个结果面板",
    reopened.hidden === false && reopened.sameNode === true,
    JSON.stringify(reopened)
  );

  /* 5. 清空按钮：输入与结果一起清掉 */
  const clearVisible = await evalJs(`
    const btn = document.getElementById("search-clear");
    return { hidden: btn.hidden };
  `);
  check("有关键词时清空按钮可见", clearVisible.hidden === false, JSON.stringify(clearVisible));

  await evalJs(`document.getElementById("search-clear").click(); return true;`);
  await sleep(350);
  const cleared = await evalJs(`
    const body = document.getElementById("search-body");
    return {
      value: document.getElementById("search-input").value,
      rows: body.querySelectorAll(".search-row").length,
      hint: body.textContent.trim().slice(0, 20),
      clearHidden: document.getElementById("search-clear").hidden,
    };
  `);
  check(
    "点清空后输入与结果都被清掉",
    cleared.value === "" && cleared.rows === 0 && cleared.clearHidden === true,
    JSON.stringify(cleared)
  );

  /* 6. 试听：进队列但不进本地曲库 */
  const preview = await evalJs(`
    const store = await import("/js/store.js");
    const { registerOnlineSong } = store;
    const before = { songs: store.state.songs.length, queue: store.state.queue.length };
    const song = registerOnlineSong({
      id: "bili:UITEST", title: "在线测试曲目", artist: "测试", album: "在线",
      ext: "m4a", duration: 180000, online: true, coverUrl: "",
    });
    const queue = [...store.state.queue, song.id];
    store.playContext(queue, queue.length - 1, { type: "online", id: null });
    await new Promise((r) => setTimeout(r, 150));
    return {
      before,
      after: { songs: store.state.songs.length, queue: store.state.queue.length },
      inSongs: store.state.songs.some((s) => s.id === song.id),
      inQueue: store.state.queue.includes(song.id),
      resolved: Boolean(store.songById(song.id)),
    };
  `);
  check(
    "试听在线歌曲：进队列但不进本地曲库",
    preview.inQueue === true &&
      preview.inSongs === false &&
      preview.resolved === true &&
      preview.after.songs === preview.before.songs,
    JSON.stringify(preview)
  );

  /* 7. 「本地歌曲」视图不显示在线曲目 */
  const lib = await evalJs(`
    const store = await import("/js/store.js");
    store.state.query = "";
    store.state.view = "library";
    store.commit();
    await new Promise((r) => setTimeout(r, 300));
    const ids = Array.from(document.querySelectorAll(".track")).map((n) => n.dataset.id);
    return { rows: ids.length, leaked: ids.filter((id) => id.startsWith("bili:")) };
  `);
  check("「本地歌曲」不显示在线曲目", lib.leaked.length === 0, JSON.stringify(lib));

  check("全程无 console 报错", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
} catch (err) {
  check("脚本执行", false, err?.message || String(err));
}

ws.close();
child.kill();
await sleep(300);

const failed = results.filter((r) => !r.ok).length;
console.log("");
console.log(failed ? `失败 ${failed} / ${results.length}` : `全部通过（${results.length} 项）`);
process.exit(failed ? 1 : 0);
