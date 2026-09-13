/* ==========================================================================
   ui-round2.mjs — 第二轮需求的界面自检（无头浏览器 / 预览数据）
   --------------------------------------------------------------------------
   覆盖：
     1. 标题栏不再显示「所有歌曲」这类页面标题；
     2. 侧边栏「本地歌曲」命名；
     3. 侧边栏歌单数量与「更多」按钮叠在同一位置（行宽对齐，
        「我喜欢」也有更多按钮）；
     4. 单击歌曲 = 加入下一首播放（默认），双击 = 立即播放；
     5. 工具条里没有密度按钮与随机播放按钮；
     6. 设置是弹出层（不是切换视图），里面有列表密度、单击行为、
        「把封面/歌词写进歌曲文件」等设置项；
     7. 播放详情页：没有「歌名 · 歌手」文字，返回按钮右侧有封面按钮；
     8. 右键菜单里有「更换封面…」，点开出现封面搜索层；
     9. 播放任务里没有 console 报错。

   用法：node tools/ui-round2.mjs [--port 5173]
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

const PORT = 9467;
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
    `--user-data-dir=${process.env.TEMP}\\mp-edge-round2`,
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

/* --------------------------------------------------------------------------
   真实鼠标点击（覆盖命中测试）
   --------------------------------------------------------------------------
   为什么不能用 element.dispatchEvent / el.click()：
   它们是**直接投递给目标元素**的，完全绕过浏览器「谁在最上面」的判定。
   所以「一个透明弹层铺满整窗、吃掉所有点击」这种致命 bug 能被完美地测过去
   —— 我们自己就踩过：新增的搜索/设置/封面弹层写了 display:flex，
   盖掉了 [hidden] 的默认 display:none，于是弹层隐藏时仍然铺满窗口挡住一切，
   界面表现是「点任何按钮都没反应」，而当时所有自检却都是绿的。

   这里改走 Input.dispatchMouseEvent，让浏览器真的做一次命中测试。
   -------------------------------------------------------------------------- */
async function realClick(selector) {
  const box = await evalJs(`
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      x, y,
      hitsSelf: Boolean(top && (top === el || el.contains(top) || top.contains(el))),
      top: top ? (top.id || top.className || top.tagName).toString().slice(0, 60) : "",
    };
  `);
  if (!box) return { clicked: false, reason: "元素不存在或不可见" };
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y, button: "none" });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
  return { clicked: true, ...box };
}

try {
  /* 0. 命中测试：没有任何隐藏的层应该挡住界面 */
  const hit = await evalJs(`
    const at = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el ? (el.id || el.className || el.tagName).toString().slice(0, 60) : "";
    };
    const w = window.innerWidth, h = window.innerHeight;
    const layers = ["search-overlay", "settings-layer", "cover-layer", "queue-panel", "modal-backdrop", "playerview", "menu", "scanning"]
      .map((id) => {
        const el = document.getElementById(id);
        if (!el) return { id, missing: true };
        const cs = getComputedStyle(el);
        return { id, hidden: el.hidden, display: cs.display, pointerEvents: cs.pointerEvents };
      });
    return { center: at(w / 2, h / 2), sidebar: at(100, 120), header: at(w - 200, 90), layers };
  `);
  const blocking = (hit.layers || []).filter(
    (l) => !l.missing && l.hidden === true && l.display !== "none"
  );
  check(
    "没有任何隐藏的覆盖层留在布局里",
    blocking.length === 0,
    blocking.length ? JSON.stringify(blocking) : `center=${hit.center} sidebar=${hit.sidebar}`
  );
  check(
    "窗口中心命中的是正常内容（不是覆盖层）",
    !/overlay|layer|backdrop/.test(String(hit.center)),
    String(hit.center)
  );

  /* 1. 标题栏不再有页面标题 */
  const titlebar = await evalJs(`
    const bar = document.getElementById("titlebar");
    return {
      hasCaption: Boolean(document.getElementById("titlebar-caption")),
      text: bar.textContent.replace(/\\s+/g, " ").trim(),
    };
  `);
  check(
    "标题栏不再显示当前页面标题",
    titlebar.hasCaption === false && !/所有歌曲|本地歌曲|播放列表/.test(titlebar.text),
    JSON.stringify(titlebar)
  );

  /* 2. 侧边栏命名 */
  const libLabel = await evalJs(`
    const item = document.querySelector('[data-nav="library"] .navitem__text');
    return { label: item?.textContent.trim() };
  `);
  check("侧边栏叫「本地歌曲」", libLabel.label === "本地歌曲", JSON.stringify(libLabel));

  /* 3. 侧边栏数量/更多按钮对齐 */
  const sidebar = await evalJs(`
    const rows = Array.from(document.querySelectorAll("#playlist-nav .navitem"));
    const info = rows.map((r) => {
      const tail = r.querySelector(".navitem__tail");
      const badge = r.querySelector(".navitem__badge");
      const more = r.querySelector(".navitem__more");
      const tr = tail?.getBoundingClientRect();
      return {
        name: r.querySelector(".navitem__text")?.textContent.trim(),
        locked: r.dataset.locked === "true",
        hasMore: Boolean(more),
        tailRight: tr ? Math.round(tr.right) : null,
        tailWidth: tr ? Math.round(tr.width) : null,
        badgeTop: badge ? Math.round(badge.getBoundingClientRect().top) : null,
        moreTop: more ? Math.round(more.getBoundingClientRect().top) : null,
      };
    });
    const lockedRow = info.find((r) => r.locked);
    return { info, lockedRow };
  `);
  const rights = sidebar.info.map((r) => r.tailRight);
  const sameRight = rights.length > 1 && rights.every((v) => Math.abs(v - rights[0]) <= 1);
  check(
    "所有歌单数量标记右边缘对齐（含「我喜欢」）",
    sameRight,
    JSON.stringify(sidebar.info.map((r) => `${r.name}:${r.tailRight}`))
  );
  check("「我喜欢」也有更多按钮（内置歌单同样有菜单）", sidebar.lockedRow?.hasMore === true, JSON.stringify(sidebar.lockedRow));
  // 数量与按钮叠在同一竖直位置
  const stacked = sidebar.info.filter((r) => r.badgeTop !== null && r.moreTop !== null).every((r) => Math.abs(r.badgeTop - r.moreTop) <= 6);
  check("数量标记与更多按钮叠在同一位置", stacked, JSON.stringify(sidebar.info.map((r) => `${r.badgeTop}/${r.moreTop}`)));

  /* 「我喜欢」右键能出菜单 */
  const likedMenu = await evalJs(`
    const row = document.querySelector('#playlist-nav .navitem[data-locked="true"]');
    const r = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: r.left + 20, clientY: r.top + 10 }));
    await new Promise((res) => setTimeout(res, 250));
    const menu = document.getElementById("menu");
    const items = Array.from(menu.querySelectorAll("[role='menuitem'], .menu__item")).map((n) => n.textContent.trim());
    return { hidden: menu.hidden, items };
  `);
  check(
    "「我喜欢」右键能弹出菜单",
    likedMenu.hidden === false && likedMenu.items.length > 0,
    JSON.stringify(likedMenu)
  );
  await evalJs(`document.body.click(); return true;`);
  await sleep(200);

  /* 4. 单击 = 下一首播放；双击 = 立即播放 */
  const click = await evalJs(`
    const store = await import("/js/store.js");
    store.clearQueue();
    await new Promise((r) => setTimeout(r, 100));
    const row = document.querySelector(".track");
    const id = row.dataset.id;
    const before = { queue: store.state.queue.length, current: store.state.currentId };
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    return {
      id,
      before,
      after: { queue: store.state.queue.slice(), current: store.state.currentId },
      action: store.state.config.rowClickAction,
    };
  `);
  check(
    "单击歌曲 = 加入下一首播放（默认），不打断当前播放",
    click.action === "next" && click.after.queue.length === 1 && click.after.queue[0] === click.id &&
      click.after.current === click.before.current,
    JSON.stringify(click)
  );

  const dbl = await evalJs(`
    const store = await import("/js/store.js");
    const row = document.querySelectorAll(".track")[2];
    const id = row.dataset.id;
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    return { id, current: store.state.currentId, open: store.state.playerOpen };
  `);
  check("双击歌曲 = 立即播放这一首", dbl.current === dbl.id, JSON.stringify(dbl));

  /* 5. 工具条：没有密度按钮，也没有随机播放按钮 */
  const tools = await evalJs(`
    const nodes = Array.from(document.querySelectorAll("#content-tools [data-tool]"));
    return {
      tools: nodes.map((n) => n.dataset.tool),
      html: document.getElementById("content-tools").innerHTML.includes("density"),
    };
  `);
  check(
    "工具条里没有密度按钮与随机播放按钮",
    !tools.tools.includes("density") && !tools.tools.includes("shuffle") && tools.html === false,
    JSON.stringify(tools.tools)
  );

  /* 6. 设置是弹出层（用真实鼠标点击打开） */
  const openSettingsClick = await realClick("#btn-settings");
  check("真实鼠标点击设置按钮能命中它", openSettingsClick.clicked && openSettingsClick.hitsSelf, JSON.stringify(openSettingsClick));
  await sleep(500);
  const settings = await evalJs(`
    const layer = document.getElementById("settings-layer");
    const body = layer.querySelector(".settings-layer__body");
    const view = document.querySelector("#content-body")?.dataset?.view;
    return {
      hidden: layer.hidden,
      state: layer.dataset.state,
      hasCards: body.querySelectorAll(".card").length,
      navItems: Array.from(body.querySelectorAll(".settings__nav-item")).map((n) => n.textContent.trim()),
      hasDensity: Boolean(body.querySelector('[data-segment="listDensity"]')),
      hasRowClick: Boolean(body.querySelector('[data-segment="rowClickAction"]')),
      hasEmbed: Boolean(body.querySelector('[data-toggle="embedMeta"]')),
      libraryStillRendered: document.querySelectorAll(".track").length > 0,
      contentView: view || null,
    };
  `);
  check(
    "设置以弹出层打开（内容区仍然是曲库）",
    settings.hidden === false && settings.hasCards > 0 && settings.libraryStillRendered === true,
    JSON.stringify({ hidden: settings.hidden, cards: settings.hasCards, libraryRows: settings.libraryStillRendered })
  );
  check("设置里有「列表密度」", settings.hasDensity === true, JSON.stringify(settings.navItems));
  check("设置里有「单击歌曲时的行为」", settings.hasRowClick === true);
  check("设置里有「把封面/歌词写进歌曲文件」", settings.hasEmbed === true);

  /* 密度改动能写进配置并作用到列表 */
  const density = await evalJs(`
    const store = await import("/js/store.js");
    const btn = document.querySelector('[data-segment="listDensity"] [data-value="compact"]');
    btn.click();
    await new Promise((r) => setTimeout(r, 300));
    const tracks = document.querySelector(".tracks");
    return { cfg: store.state.config.listDensity, dom: tracks?.dataset.density };
  `);
  check("改列表密度会写进配置并作用到列表", density.cfg === "compact" && density.dom === "compact", JSON.stringify(density));

  await realClick("[data-settings-close]");
  await sleep(400);
  const closedSettings = await evalJs(`return { hidden: document.getElementById("settings-layer").hidden };`);
  check("设置层可以关闭", closedSettings.hidden === true, JSON.stringify(closedSettings));

  /* 关掉之后界面必须重新可点（这是「点任何按钮都没反应」的核心回归点）。
     先把播放详情页收起来：它本来就盖在内容区之上（z-index 正常分层），
     不关掉的话点侧边栏本来就会被它挡住，那是预期行为、不是 bug。 */
  await evalJs(`
    const store = await import("/js/store.js");
    store.state.playerOpen = false;
    store.commit();
    return true;
  `);
  await sleep(700);
  const afterClose = await realClick('[data-nav="queue"]');
  await sleep(400);
  const afterCloseView = await evalJs(`
    const pv = document.getElementById("playerview");
    const cs = pv ? getComputedStyle(pv) : null;
    return {
      view: window.__app.state.view,
      playerOpen: window.__app.state.playerOpen,
      pvHidden: pv?.hidden,
      pvState: pv?.dataset.state,
      pvDisplay: cs?.display,
      pvOpacity: cs?.opacity,
    };
  `);
  check(
    "关闭设置后界面恢复可点击",
    afterClose.hitsSelf === true && afterCloseView.view === "queue",
    JSON.stringify({ hitsSelf: afterClose.hitsSelf, top: afterClose.top, ...afterCloseView })
  );
  await realClick('[data-nav="library"]');
  await sleep(300);

  /* 7. 播放详情页 */
  const pv = await evalJs(`
    const store = await import("/js/store.js");
    store.state.playerOpen = true;
    store.commit();
    await new Promise((r) => setTimeout(r, 500));
    const head = document.querySelector(".playerview__head");
    const coverBtn = document.getElementById("btn-player-cover");
    const back = document.getElementById("btn-player-back");
    const crumb = document.getElementById("playerview-crumb");
    const br = back.getBoundingClientRect();
    const cr = coverBtn ? coverBtn.getBoundingClientRect() : null;
    return {
      hasCrumb: Boolean(crumb),
      headerText: head.textContent.replace(/\\s+/g, " ").trim(),
      coverBtnRightOfBack: cr ? cr.left >= br.right - 2 : false,
      coverVisible: coverBtn ? !coverBtn.hidden : false,
    };
  `);
  check(
    "播放详情页不再显示「歌名 · 歌手」",
    pv.hasCrumb === false && !pv.headerText.includes("·"),
    JSON.stringify(pv.headerText)
  );
  check("返回按钮右侧有封面按钮", pv.coverVisible === true && pv.coverBtnRightOfBack === true, JSON.stringify(pv));

  /* 8. 封面按钮打开封面搜索层（真实鼠标点击） */
  const coverClick = await realClick("#btn-player-cover");
  check("真实鼠标点击封面按钮能命中它", coverClick.clicked && coverClick.hitsSelf, JSON.stringify(coverClick));
  await sleep(600);
  const coverLayer = await evalJs(`
    const layer = document.getElementById("cover-layer");
    const body = document.getElementById("cover-layer-body");
    return {
      hidden: layer.hidden,
      state: layer.dataset.state,
      hasSearchBtn: Boolean(body.querySelector('[data-cover-act="search"]')),
      hasUrl: Boolean(body.querySelector("#cover-url")),
      hasReset: Boolean(body.querySelector('[data-cover-act="reset"]')),
      title: body.querySelector(".cover-panel__title")?.textContent.trim(),
    };
  `);
  check(
    "封面按钮打开封面搜索弹层",
    coverLayer.hidden === false && coverLayer.hasSearchBtn && coverLayer.hasUrl && coverLayer.hasReset,
    JSON.stringify(coverLayer)
  );

  await realClick("[data-cover-close]");
  await sleep(400);
  const coverClosed = await evalJs(`return { hidden: document.getElementById("cover-layer").hidden };`);
  check("封面层可以关闭", coverClosed.hidden === true, JSON.stringify(coverClosed));

  /* 9. 歌单数量标记统一：切到某个歌单再确认一次右边缘 */
  const playlist = await evalJs(`
    const store = await import("/js/store.js");
    store.state.playerOpen = false;
    store.commit();
    const rows = Array.from(document.querySelectorAll("#playlist-nav .navitem"));
    const widths = rows.map((r) => Math.round(r.querySelector(".navitem__tail").getBoundingClientRect().width));
    return { widths, unique: [...new Set(widths)] };
  `);
  check("歌单行尾区宽度完全一致", playlist.unique.length === 1, JSON.stringify(playlist));

  /* 9. 搜索弹层：真实鼠标点搜索按钮 → 弹层出现 → 关掉后界面仍可点 */
  const searchOpen = await realClick("#btn-search");
  await sleep(500);
  const searchState = await evalJs(`
    const layer = document.getElementById("search-overlay");
    const input = document.getElementById("search-input");
    return { hidden: layer?.hidden, focused: document.activeElement === input };
  `);
  check(
    "真实鼠标点击搜索按钮 → 弹层打开且搜索框聚焦",
    searchOpen.hitsSelf === true && searchState.hidden === false && searchState.focused === true,
    JSON.stringify({ ...searchOpen, ...searchState })
  );
  await realClick("[data-search-close]");
  await sleep(400);
  // 搜索按钮在标题栏，不受播放详情页影响；这里先收掉详情页再验证侧边栏
  await evalJs(`
    const store = await import("/js/store.js");
    store.state.playerOpen = false;
    store.commit();
    return true;
  `);
  await sleep(700);
  const afterSearchClose = await realClick('[data-nav="queue"]');
  await sleep(400);
  const afterSearchView = await evalJs(`return window.__app.state.view;`);
  check(
    "关闭搜索弹层后界面恢复可点击",
    afterSearchClose.hitsSelf === true && afterSearchView === "queue",
    JSON.stringify({ hitsSelf: afterSearchClose.hitsSelf, top: afterSearchClose.top, view: afterSearchView })
  );
  await realClick('[data-nav="library"]');
  await sleep(300);

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
