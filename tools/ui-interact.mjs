/* ==========================================================================
   ui-interact.mjs — 真实交互自检（CDP 驱动，跑无头 Edge）
   --------------------------------------------------------------------------
   静态截图与布局探针只能看"某一帧长什么样"，本脚本负责验证"点下去会发生
   什么"，覆盖本次改动的关键路径：

     1. 点击底栏封面 → 打开播放详情页；再点一次 → 关闭（同一个按钮来回切）
     2. 播放详情页进出时侧边栏宽度不能变化（旧实现会闪一下）
     3. 歌词区能滚动、能自动定位到当前行、能点击跳转
     4. 沉浸模式下整窗背景层铺满、歌词区没有卡片边框
     5. 标题栏设置按钮能打开设置弹层
     6. 底栏「播放列表」按钮能开/关队列面板，且能点歌切歌
     7. 全程不能有 console 错误 / 未捕获异常

   用法：node tools/ui-interact.mjs [baseURL]
   退出码：0 = 全部通过，1 = 有失败
   ========================================================================== */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) {
  console.error("找不到 Microsoft Edge");
  process.exit(2);
}

const PORT = Number(process.env.CDP_PORT || 9444);
const BASE = process.argv[2] || "http://127.0.0.1:5173/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: PORT, path }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

/* --------------------------------------------------------------------------
   CDP 会话
   -------------------------------------------------------------------------- */
const child = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-component-extensions-with-background-pages",
    "--disable-background-networking",
    "--disable-sync",
    "--window-size=1440,900",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\mp-edge-interact`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

let target = null;
for (let i = 0; i < 80 && !target; i += 1) {
  await sleep(250);
  try {
    const list = JSON.parse(await get("/json/list"));
    target = list.find((t) => t.type === "page") || null;
  } catch {
    /* 等 DevTools 起来 */
  }
}
if (!target) {
  console.error("无法连接 DevTools");
  child.kill();
  process.exit(2);
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
await send("Log.enable");
await send("Page.enable");

const consoleErrors = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    consoleErrors.push(`EXCEPTION ${d.text} ${d.exception?.description || ""}`);
  } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    consoleErrors.push(`CONSOLE ${(msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ")}`);
  } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    const t = msg.params.entry.text || "";
    const url = msg.params.entry.url || "";
    // favicon 是浏览器自己请求的，与页面无关
    if (!/favicon/i.test(t) && !/favicon/i.test(url)) consoleErrors.push(`LOG ${t} [${url}]`);
  }
});

/** 在页面里求值（支持 await / 动态 import，返回 JSON 值） */
async function evalJs(expression) {
  const res = await send("Runtime.evaluate", {
    expression: `(async () => { ${expression} })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res?.exceptionDetails) {
    throw new Error(
      `页面求值异常: ${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description || ""}`
    );
  }
  return res?.result?.value;
}

/* --------------------------------------------------------------------------
   断言
   -------------------------------------------------------------------------- */
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "[OK ]" : "[!! ]"} ${name}${detail ? `  — ${detail}` : ""}`);
}

async function navigate(url) {
  await send("Page.navigate", { url });
  await sleep(2600);
}

/* --------------------------------------------------------------------------
   场景
   -------------------------------------------------------------------------- */
try {
  /* ---- 0：先确认「页面里动态 import 到的 store」就是应用自己在用的那一份 ----
     本脚本多处用 `import("./js/store.js")` 读/改状态。在**零依赖静态服务器**
     （node tools/dev-server.js）下模块 URL 就是 /js/store.js，拿到的是同一个实例；
     但 Vite 会给模块 URL 加查询串，`import("/js/store.js")` 会**再建一个空实例**，
     于是断言全部读到 songs=0、currentId=null —— 看起来像功能坏了，其实是量错了对象。
     这里用「动态 import 到的歌曲数 vs 页面真实渲染的行数」提前把这种情况挡住。 */
  await navigate(`${BASE}?playing=1`);
  const inst = await evalJs(`
    const { state } = await import("./js/store.js");
    return { songs: state.songs.length, rows: document.querySelectorAll(".track").length };
  `);
  if (inst.songs === 0 && inst.rows > 0) {
    console.error(
      `[环境错误] 页面里的 store 与应用不是同一个实例（动态 import 读到 ${inst.songs} 首，页面渲染了 ${inst.rows} 行）。\n` +
        `           本脚本要对着零依赖静态服务器跑：node tools/dev-server.js 5173\n` +
        `           再执行：node tools/ui-interact.mjs http://127.0.0.1:5173/`
    );
    process.exit(2);
  }

  /* ---- 1/2：封面按钮切换详情页，侧边栏不跳变 ---- */
  const before = await evalJs(`
    const s = document.querySelector(".sidebar").getBoundingClientRect();
    return { w: Math.round(s.width), pvHidden: document.getElementById("playerview").hidden };
  `);
  check("初始状态：详情页关闭", before.pvHidden === true && before.w > 100, `sidebar=${before.w}px`);

  /* ---- 1.5：底栏结构（进度条在上 / 控制行在下）与按钮到位 ---- */
  const bar = await evalJs(`
    const rect = (sel) => { const n = document.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; };
    const b = rect(".playerbar");
    return {
      bar: b,
      progress: rect(".playerbar__progress"),
      row: rect(".playerbar__row"),
      now: rect(".playerbar__now"),
      center: rect(".playerbar__center"),
      tools: rect(".playerbar__tools"),
      hasHeart: Boolean(document.getElementById("bar-heart")),
      hasAdd: Boolean(document.getElementById("bar-add")),
      hasQueue: Boolean(document.getElementById("btn-playlist")),
      hasMode: Boolean(document.getElementById("btn-mode")),
      hasLyricsMatch: Boolean(document.getElementById("btn-lyrics-match")),
      hasDesktopLyrics: Boolean(document.getElementById("btn-desktop-lyrics")),
      hasVolume: Boolean(document.getElementById("volume")),
      coverSrc: document.getElementById("bar-cover-img").getAttribute("src") || "",
    };
  `);
  check(
    "底栏：进度条独占上排、控制行在下排且不重叠",
    bar.progress && bar.row && bar.progress.y + bar.progress.h <= bar.row.y + 2,
    `progress=${bar.progress?.y}+${bar.progress?.h} row=${bar.row?.y}`
  );
  check(
    "底栏：曲目信息 / 传输控制 / 右侧工具三段互不重叠",
    bar.now && bar.center && bar.tools && bar.now.right <= bar.center.x + 1 && bar.center.right <= bar.tools.x + 1,
    `now→${bar.now?.right} center=${bar.center?.x}..${bar.center?.right} tools=${bar.tools?.x}`
  );
  check(
    "底栏按钮齐全：喜欢 / 添加到歌单 / 音量 / 播放顺序 / 手动匹配歌词 / 桌面歌词 / 播放列表",
    bar.hasHeart &&
      bar.hasAdd &&
      bar.hasVolume &&
      bar.hasMode &&
      bar.hasLyricsMatch &&
      bar.hasDesktopLyrics &&
      bar.hasQueue,
    ""
  );
  check(
    "底栏封面初始就有图（不是空 src）",
    bar.coverSrc.length > 0 && !/^\\s*$/.test(bar.coverSrc),
    bar.coverSrc.slice(0, 48)
  );

  /* ---- 1.6：喜欢 / 添加到歌单 两个按钮真的能用 ---- */
  // 先暂停：预览模式的模拟时钟会自己往前跑并切歌，不然断言会被"正好换歌"打断
  await evalJs(`
    const { togglePlay, state } = await import("./js/store.js");
    if (state.playing) togglePlay();
    await new Promise((r) => setTimeout(r, 200));
    return 1;
  `);
  const likeResult = await evalJs(`
    const { isLiked, state } = await import("./js/store.js");
    const id = state.currentId;
    const before = isLiked(id);
    const playingBefore = state.playing;
    document.getElementById("bar-heart").click();
    const after = isLiked(id);
    const pressed = document.getElementById("bar-heart").getAttribute("aria-pressed");
    return { id, sameTrack: state.currentId === id, playingBefore, playingAfter: state.playing, before, after, pressed };
  `);
  check(
    "底栏爱心按钮切换「我喜欢」",
    likeResult.before !== likeResult.after && likeResult.pressed === String(likeResult.after),
    JSON.stringify(likeResult)
  );
  await evalJs(`document.getElementById("bar-heart").click(); return 1;`);

  const addResult = await evalJs(`
    const id = window.__app.state.currentId;
    document.getElementById("bar-add").click();
    const menu = document.getElementById("menu");
    const labels = [...menu.querySelectorAll(".menu__item")].map((b) => b.dataset.id);
    return { hidden: menu.hidden, labels };
  `);
  check(
    "底栏「添加到歌单」弹出歌单菜单",
    addResult.hidden === false && addResult.labels.length > 0,
    addResult.labels.join(",")
  );
  await evalJs(`document.getElementById("menu").hidden = true; return 1;`);

  /* ---- 1.7：清空队列后封面不应变回破碎图标 ---- */
  const emptyCover = await evalJs(`
    const { clearQueue } = await import("./js/store.js");
    clearQueue();
    await new Promise((r) => setTimeout(r, 400));
    const img = document.getElementById("bar-cover-img");
    return { src: img.getAttribute("src") || "(none)", title: document.getElementById("bar-title").textContent };
  `);
  check(
    "无正在播放时封面不留空 src（不会出现破碎图标）",
    emptyCover.src === "(none)" || emptyCover.src.length > 10,
    `${emptyCover.src.slice(0, 40)} title=${emptyCover.title}`
  );
  await navigate(`${BASE}?playing=1`);

  await evalJs(`document.getElementById("bar-cover").click(); return 1;`);
  await sleep(700);
  const opened = await evalJs(`
    const pv = document.getElementById("playerview");
    const s = document.querySelector(".sidebar");
    const r = pv.getBoundingClientRect();
    const cs = getComputedStyle(document.documentElement);
    return {
      hidden: pv.hidden,
      state: pv.dataset.state,
      opacity: getComputedStyle(pv).opacity,
      transform: getComputedStyle(pv).transform,
      sidebarOpacity: getComputedStyle(s).opacity,
      sidebarW: Math.round(s.getBoundingClientRect().width),
      pvTop: Math.round(r.top),
      pvBottom: Math.round(r.bottom),
      pvLeft: Math.round(r.left),
      pvRight: Math.round(r.right),
      appView: document.getElementById("app").dataset.view,
      expectTop: parseFloat(cs.getPropertyValue("--h-titlebar")),
      expectBottom: window.innerHeight - parseFloat(cs.getPropertyValue("--h-playerbar")),
      vw: window.innerWidth,
    };
  `);
  check(
    "点击封面 → 打开详情页",
    opened.hidden === false && opened.state === "opened" && Number(opened.opacity) > 0.95,
    `opacity=${opened.opacity} transform=${opened.transform}`
  );
  check(
    "详情页铺满整个窗口（标题栏之下、底栏之上，左右到边）",
    opened.pvTop === opened.expectTop &&
      opened.pvBottom === opened.expectBottom &&
      opened.pvLeft === 0 &&
      opened.pvRight === opened.vw,
    `top=${opened.pvTop}/${opened.expectTop} bottom=${opened.pvBottom}/${opened.expectBottom} left=${opened.pvLeft} right=${opened.pvRight}/${opened.vw}`
  );
  check(
    "详情页打开时侧边栏只是淡出，宽度不变（不闪、不重排）",
    opened.sidebarW === before.w && Number(opened.sidebarOpacity) < 0.05,
    `${before.w}px → ${opened.sidebarW}px opacity=${opened.sidebarOpacity}`
  );

  await evalJs(`document.getElementById("bar-cover").click(); return 1;`);
  await sleep(700);
  const closed = await evalJs(`
    const pv = document.getElementById("playerview");
    return {
      hidden: pv.hidden,
      state: pv.dataset.state,
      appView: document.getElementById("app").dataset.view,
      sidebarOpacity: getComputedStyle(document.querySelector(".sidebar")).opacity,
    };
  `);
  check(
    "再点一次封面 → 关闭详情页且侧边栏恢复",
    closed.hidden === true && closed.state === "closed" && Number(closed.sidebarOpacity) > 0.95,
    `view=${closed.appView} sidebar=${closed.sidebarOpacity}`
  );

  /* ---- 3：歌词滚动 / 定位 / 点击跳转 ---- */
  await evalJs(`document.getElementById("bar-cover").click(); return 1;`);
  await sleep(900);
  const lyr = await evalJs(`
    const sc = document.querySelector("#pv-lyrics .lyrics__scroll");
    const active = sc.querySelector('.lyric[aria-current="true"]');
    return {
      scrollHeight: sc.scrollHeight,
      clientHeight: sc.clientHeight,
      scrollTop: Math.round(sc.scrollTop),
      activeIndex: active ? Number(active.dataset.lyricIndex) : -1,
      activeText: active ? active.textContent.trim().slice(0, 20) : "",
    };
  `);
  check(
    "歌词区可滚动且已定位到当前行",
    lyr.scrollHeight > lyr.clientHeight && lyr.activeIndex >= 0 && lyr.scrollTop > 0,
    `scrollTop=${lyr.scrollTop} active=#${lyr.activeIndex} "${lyr.activeText}"`
  );

  // 用户手动滚动：滚上去后 1.2s 内不应被自动滚动拽回
  const wheel = await evalJs(`
    const { togglePlay, state } = await import("./js/store.js");
    if (state.playing) togglePlay();
    await new Promise((r) => setTimeout(r, 200));
    const sc = document.querySelector("#pv-lyrics .lyrics__scroll");
    sc.scrollTop = Math.max(0, sc.scrollTop - 180);
    sc.dispatchEvent(new WheelEvent("wheel", { deltaY: -180, bubbles: true }));
    return { after: Math.round(sc.scrollTop) };
  `);
  await sleep(500);
  const held = await evalJs(`
    const sc = document.querySelector("#pv-lyrics .lyrics__scroll");
    return Math.round(sc.scrollTop);
  `);
  check(
    "鼠标/滚轮滚动时不被自动滚动抢走",
    Math.abs(held - wheel.after) < 40,
    `after=${wheel.after} 500ms 后=${held}`
  );
  await evalJs(`
    const { togglePlay, state } = await import("./js/store.js");
    if (!state.playing) togglePlay();
    return 1;
  `);

  // 点歌词跳转
  const seeked = await evalJs(`
    const sc = document.querySelector("#pv-lyrics .lyrics__scroll");
    const line = sc.querySelector('.lyric[data-lyric-index="3"]');
    const t = Number(line.dataset.time);
    line.click();
    return { t, position: Math.round(window.__app.state.position) };
  `);
  check(
    "点击歌词行 → 跳转到对应时间",
    Math.abs(seeked.position - seeked.t) < 1200,
    `t=${seeked.t} pos=${seeked.position}`
  );

  /* ---- 4：沉浸样式 ----
     注意：样式 id 现在挂在 data-pv-skin 上（data-pv-mode 作为兼容属性保留），
     整窗背景层的 id 也从 #immersive-bg 改成了宿主统一的 #skin-background。 */
  await evalJs(`document.querySelector('[data-pv-skin="immersive"]').click(); return 1;`);
  await sleep(900);
  const imm = await evalJs(`
    const bg = document.getElementById("skin-background");
    const r = bg.getBoundingClientRect();
    const card = document.querySelector(".immersive__card");
    const cs = getComputedStyle(card);
    const bar = getComputedStyle(document.querySelector(".playerbar")).backgroundColor;
    const tb = getComputedStyle(document.querySelector(".titlebar")).backgroundColor;
    const sc = document.querySelector("#pv-lyrics .lyrics__scroll");
    return {
      hidden: bg.hidden,
      w: Math.round(r.width),
      h: Math.round(r.height),
      vw: window.innerWidth,
      vh: window.innerHeight,
      border: cs.borderTopWidth,
      cardBg: cs.backgroundColor,
      shadow: cs.boxShadow,
      barBg: bar,
      tbBg: tb,
      scrollable: sc.scrollHeight > sc.clientHeight,
    };
  `);
  check(
    "沉浸模式：整窗背景层铺满",
    imm.hidden === false && imm.w >= imm.vw - 1 && imm.h >= imm.vh - 1,
    `${imm.w}x${imm.h} vs ${imm.vw}x${imm.vh}`
  );
  check(
    "沉浸模式：歌词区没有卡片边框/底色/阴影",
    imm.border === "0px" && imm.cardBg === "rgba(0, 0, 0, 0)" && imm.shadow === "none",
    `border=${imm.border} bg=${imm.cardBg}`
  );
  check(
    "沉浸模式：标题栏与播放控件都不自铺底色",
    imm.barBg === "rgba(0, 0, 0, 0)" && imm.tbBg === "rgba(0, 0, 0, 0)",
    `bar=${imm.barBg} titlebar=${imm.tbBg}`
  );
  check("沉浸模式：歌词区依然可滚动", imm.scrollable === true, "");

  /* ---- 5：标题栏设置按钮 ----
     设置现在是**弹出层**（不再切换 state.view），所以断言的是「层被打开
     且里面有设置内容」，而不是「view === 'settings'」。 */
  await evalJs(`document.querySelector('[data-pv-skin="classic"]').click(); return 1;`);
  await sleep(300);
  await evalJs(`
    document.getElementById("btn-settings").click();
    return 1;
  `);
  await sleep(600);
  const settingsView = await evalJs(`
    const layer = document.getElementById("settings-layer");
    return {
      view: window.__app.state.view,
      layerOpen: layer ? !layer.hidden : false,
      hasSettingsBody: Boolean(layer?.querySelector(".settings")),
      sidebarFoot: Boolean(document.querySelector(".sidebar__foot")),
    };
  `);
  check(
    "标题栏设置按钮 → 打开设置弹层",
    settingsView.layerOpen === true && settingsView.hasSettingsBody === true,
    `layerOpen=${settingsView.layerOpen} view=${settingsView.view}`
  );
  check("侧边栏底部已不再有新建歌单/设置入口", settingsView.sidebarFoot === false, "");
  await evalJs(`document.querySelector("[data-settings-close]").click(); return 1;`);

  /* ---- 6：播放列表面板 ---- */
  await sleep(500);
  await evalJs(`document.getElementById("btn-playlist").click(); return 1;`);
  await sleep(600);
  const queue = await evalJs(`
    const p = document.getElementById("queue-panel");
    const items = p.querySelectorAll(".queue-item").length;
    return {
      hidden: p.hidden,
      state: p.dataset.state,
      items,
      pressed: document.getElementById("btn-playlist").getAttribute("aria-pressed"),
      badge: document.getElementById("queue-count").textContent,
    };
  `);
  check(
    "底栏「播放列表」按钮 → 浮出队列面板",
    queue.hidden === false && queue.items > 0 && queue.pressed === "true",
    `items=${queue.items} badge=${queue.badge}`
  );

  const switched = await evalJs(`
    const items = document.querySelectorAll(".queue-item");
    const beforeId = window.__app.state.currentId;
    const targetId = items[2].dataset.queueId;
    items[2].click();
    return { beforeId, targetId, afterId: window.__app.state.currentId, playing: window.__app.state.playing };
  `);
  await sleep(500);
  check(
    "点击队列项 → 切歌",
    switched.afterId === switched.targetId && switched.playing === true,
    `${switched.beforeId} → ${switched.afterId}`
  );

  await evalJs(`document.getElementById("queue-close").click(); return 1;`);
  await sleep(600);
  const queueClosed = await evalJs(`
    const p = document.getElementById("queue-panel");
    return { hidden: p.hidden, state: p.dataset.state };
  `);
  check("队列面板可关闭", queueClosed.hidden === true && queueClosed.state === "closed", "");
} catch (err) {
  check("执行交互场景", false, String(err && err.message ? err.message : err));
}

/* --------------------------------------------------------------------------
   结果
   -------------------------------------------------------------------------- */
check("全程无 console 错误 / 未捕获异常", consoleErrors.length === 0, consoleErrors.slice(0, 4).join(" | "));

ws.close();
child.kill();

const failed = results.filter((r) => !r.ok).length;
console.log("");
console.log(failed ? `交互自检失败：${failed} / ${results.length}` : `交互自检全部通过（${results.length} 项）`);
process.exit(failed ? 1 : 0);
