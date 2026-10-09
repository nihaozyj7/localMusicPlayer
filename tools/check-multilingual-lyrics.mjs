/* ==========================================================================
   tools/check-multilingual-lyrics.mjs — 多语言歌词（同一时间戳多行）的自检
   --------------------------------------------------------------------------
   需求原文：「[22:22] xxx\n[22:22] dwad 这种明显是多语言，应该一起显示才对」。

   覆盖三条真实链路（无头 Edge + CDP，跑在 Vite 预览上）：
     1. 详情页歌词区（包里的 createLyricsView）：主行 + `.lyric__trans` 副行
        在**同一条**里，且只有这一条拿到高亮 —— 不会「原文暗掉、只剩译文亮」；
     2. 特效渲染器（createFxLyrics，给第三方样式用）：同样出副行，
        逐字单元仍只来自主行；
     3. 桌面歌词 / 悬浮歌词条那一行文本（playerhost#currentLyricLine）：
        两种语言用分隔符拼在一起。

   另外断言「歌词工作台的行没被折叠」走的是纯单测（frontend/tests/lrc-edit.test.js），
   这里不再重复。

   前置：npm run dev（5173）
   用法：node tools/check-multilingual-lyrics.mjs [port]
   ========================================================================== */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const WEB = process.argv[2] ? String(process.argv[2]).replace(/\/$/, "") : "http://127.0.0.1:5173";
const CDP_PORT = 9465;
const W = 1440;
const H = 900;

/** 一份「同时间戳多语种」的歌词：12s 两种语言，21.6s 三种语言 */
const LRC = [
  "[00:00.00]夜航西飞",
  "[00:12.00]云层之下 是没有尽头的黑",
  "[00:12.00]Beneath the clouds there is endless night",
  "[00:21.60]仪表盘的微光 替我数着心跳",
  "[00:21.60]The panel glow keeps count of my heartbeat",
  "[00:21.60]計器盤の灯りが心臓を数える",
  "[00:29.10]我把那年夏天 折成一张登机牌",
].join("\n");

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) {
  console.error("找不到 msedge.exe");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(tmpdir(), "ml-lyrics-" + Date.now());
mkdirSync(OUT, { recursive: true });
const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--user-data-dir=${join(OUT, "profile")}`,
    `--remote-debugging-port=${CDP_PORT}`,
    `--window-size=${W},${H}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

let version = null;
for (let i = 0; i < 60; i += 1) {
  await sleep(500);
  try {
    version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
    break;
  } catch {
    /* 还没起来 */
  }
}
if (!version) {
  console.error("CDP 起不来");
  edge.kill();
  process.exit(1);
}

const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await Promise.race([
  new Promise((r) => (ws.onopen = r)),
  sleep(8000).then(() => {
    throw new Error("CDP WebSocket 连不上");
  }),
]);

let msgId = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.exceptionThrown") {
    errors.push(`exception: ${m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text}`);
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    const text = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
    if (text && !/404/.test(text)) errors.push(`error: ${text}`);
  }
};
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP 超时：${method}`));
    }, 20000);
    pending.set(id, (m) => {
      clearTimeout(timer);
      resolve(m);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) errors.push(`eval: ${r.result.exceptionDetails.text}`);
  return r.result?.result?.value;
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, "base64"));
}

let pass = 0;
let fail = 0;
function check(ok, label, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  OK   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}  ${detail}`);
  }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* --------------------------------------------------------------------------
   [0] 魔法阵样式：画布上没有 DOM 副行可查，直接打它的拼接函数
   -------------------------------------------------------------------------- */
console.log("\n[0] 魔法阵样式（画布渲染）：副行拼进这一行的文本");
const mcPath = join(process.cwd(), "player-skins", "magic-circle", "skin.js");
if (!existsSync(mcPath)) {
  console.log("  SKIP 仓库里没有 player-skins/magic-circle");
} else {
  let mc;
  try {
    const mod = await import(pathToFileURL(mcPath).href);
    const joinLine = mod.withDisplayText;
    if (typeof joinLine !== "function") throw new Error("skin.js 没有导出 withDisplayText");
    const viaSdk = joinLine({ sdk: { lyricDisplayText: (l) => [l.text, ...(l.trans || [])].join(" · ") } }, [
      { time: 0, text: "Hello", trans: ["你好"] },
      { time: 1, text: "Solo" },
    ]);
    const fallback = joinLine({ sdk: {} }, [{ time: 0, text: "A", trans: ["B"] }]);
    mc = {
      count: viaSdk.length,
      joined: viaSdk[0]?.text,
      solo: viaSdk[1]?.text,
      fallback: fallback[0]?.text,
      keptTime: viaSdk[0]?.time,
    };
  } catch (err) {
    mc = { error: String(err?.message || err) };
  }
  console.log("   ", JSON.stringify(mc));
  check(!mc.error, "能加载样式入口", JSON.stringify(mc.error || ""));
  check(mc.count === 2, "行数不变（只改文本，不改时间轴）", String(mc.count));
  check(mc.joined === "Hello · 你好", "有副行 → 拼成一行", String(mc.joined));
  check(
    mc.solo === "Solo" && mc.keptTime === 0,
    "没副行 → 原样返回，时间不动",
    JSON.stringify([mc.solo, mc.keptTime])
  );
  check(mc.fallback === "A · B", "老宿主没有 sdk 零件时退回本地拼接", String(mc.fallback));
}

try {
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${WEB}/?view=player&pv=classic&playing=1` });
  await sleep(4500);

  console.log("\n[1] 详情页歌词区：多语言折叠成一条（主行 + 副行）");
  const page1 = await evaluate(`
    (async () => {
      // 必须 import **页面实际用的那一条 URL**：Vite HMR 会给源文件加 ?t= 时间戳，
      // 用裸路径再 import 一次会得到第二份模块实例 —— 它的 lyricsCache / skinHost
      // 都是空的，注入看起来成功、实则什么都没发生（实测踩过）。
      const app = async (name) => {
        const urls = performance.getEntriesByType("resource").map((e) => e.name);
        return import(urls.find((n) => n.includes("/js/" + name + ".js")) || "/js/" + name + ".js");
      };
      const store = await app("store");
      const host = await app("playerhost");
      const audio = await app("audio");
      const id = store.state.currentId;
      if (!id) return { error: "没有当前歌曲" };
      // 预置歌词的“自动匹配”可能在我们注入**之后**才落地、把注入的歌词盖掉，
      // 所以反复注入并确认真的渲染成 4 行，再在同一段求值里读数据（不吃时序）
      let n = 0;
      for (let k = 0; k < 8; k += 1) {
        await host.applyOnlineLyrics(id, ${JSON.stringify(LRC)}, "preview");
        await new Promise((r) => setTimeout(r, 250));
        n = document.querySelectorAll("#pv-lyrics .lyric").length;
        if (n === 4) break;
      }
      if (n !== 4) return { error: "注入没生效（渲染了 " + n + " 行，预置歌词盖掉了它）" };
      audio.seekTo(12500);
      await new Promise((r) => setTimeout(r, 700));
      const scroll = document.querySelector("#pv-lyrics .lyrics__scroll");
      if (!scroll) return { error: "找不到歌词区" };
      const rows = [...scroll.querySelectorAll(".lyric")].map((el) => ({
        time: Number(el.dataset.time),
        current: el.getAttribute("aria-current") === "true",
        main: [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim(),
        trans: [...el.querySelectorAll(".lyric__trans")].map((n) => n.textContent),
      }));
      const transEl = scroll.querySelector(".lyric__trans");
      const cs = transEl ? getComputedStyle(transEl) : null;
      const mainEl = scroll.querySelector(".lyric");
      return {
        skin: document.getElementById("playerview")?.dataset.skin || null,
        rows,
        transStyle: cs ? { display: cs.display, fontSize: parseFloat(cs.fontSize) } : null,
        mainFontSize: mainEl ? parseFloat(getComputedStyle(mainEl).fontSize) : 0,
        line: host.currentLyricLine(),
        win: host.currentLyricWindow(),
      };
    })()
  `);
  console.log("   ", JSON.stringify(page1));

  check(!page1.error, "注入多语言歌词成功", JSON.stringify(page1.error || ""));
  check(page1.rows?.length === 4, "四句（同一时间戳的算一句）", String(page1.rows?.length));
  check(
    page1.rows &&
      eq(page1.rows[1].main, "云层之下 是没有尽头的黑") &&
      eq(page1.rows[1].trans, ["Beneath the clouds there is endless night"]),
    "12s：原文在主行、译文在副行",
    JSON.stringify(page1.rows?.[1])
  );
  check(
    page1.rows && page1.rows[2].trans?.length === 2 && page1.rows[2].main.startsWith("仪表盘"),
    "21.6s：三种语言全在同一条里（主行 + 2 条副行）",
    JSON.stringify(page1.rows?.[2])
  );
  const activeRows = (page1.rows || []).filter((r) => r.current);
  check(activeRows.length === 1, "整句期间只有一条高亮（不会自己跟自己抢）", String(activeRows.length));
  check(
    activeRows.length === 1 && activeRows[0].time === 12000 && activeRows[0].trans.length === 1,
    "高亮的那条**同时带着**两种语言",
    JSON.stringify(activeRows[0])
  );
  check(
    page1.transStyle?.display === "block",
    "副行是块级（真的排在下面，不是接在后面）",
    JSON.stringify(page1.transStyle)
  );
  check(
    page1.transStyle && page1.mainFontSize > 0 && page1.transStyle.fontSize < page1.mainFontSize,
    "副行字号更小（有主次之分）",
    JSON.stringify({ trans: page1.transStyle?.fontSize, main: page1.mainFontSize })
  );
  check(
    typeof page1.line === "string" && page1.line.includes("云层之下") && page1.line.includes("Beneath the clouds"),
    "桌面歌词那一行文本把两种语言拼在一起",
    String(page1.line)
  );
  check(
    typeof page1.win?.text === "string" && page1.win.text.includes("云层之下") && page1.win.text.includes("Beneath"),
    "三行窗口（背景歌词用）同样是拼好的",
    JSON.stringify(page1.win)
  );

  console.log("\n[2] 特效渲染器 createFxLyrics（第三方样式用同一条链路）");
  const fx = await evaluate(`
    (async () => {
      const urls = performance.getEntriesByType("resource").map((e) => e.name);
      const base =
        urls.find((n) => /player-skins\\/src\\/index\\.js/.test(n)) ||
        urls.find((n) => /player-skins\\/src\\/.+\\.js$/.test(n)) ||
        "/packages/player-skins/src/index.js";
      let mod;
      try {
        mod = await import(new URL("./fx-lyrics.js", new URL(base, location.href)).href);
      } catch (err) {
        return { error: "import fx-lyrics 失败: " + err.message, base };
      }
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;left:-9999px;top:0;width:640px;height:320px";
      document.body.appendChild(host);
      const view = mod.createFxLyrics(host, { interactive: false });
      view.setLines([
        { time: 0, text: "Hello", trans: ["你好"] },
        { time: 5000, text: "Next" },
      ]);
      view.setPosition(1000);
      const line = host.querySelector(".fxl__line");
      const res = {
        lines: host.querySelectorAll(".fxl__line").length,
        trans: [...host.querySelectorAll(".fxl__trans")].map((n) => n.textContent),
        active: line?.getAttribute("aria-current"),
        units: line ? line.querySelectorAll(".fxl__u").length : 0,
        secondHasTrans: Boolean(host.querySelectorAll(".fxl__line")[1]?.querySelector(".fxl__trans")),
      };
      view.destroy();
      host.remove();
      return res;
    })()
  `);
  console.log("   ", JSON.stringify(fx));
  check(!fx.error, "能拿到特效渲染器", JSON.stringify(fx.error || ""));
  check(fx.lines === 2, "两条时间轴各一条行", String(fx.lines));
  check(eq(fx.trans, ["你好"]), "副行渲染出来了", JSON.stringify(fx.trans));
  check(fx.active === "true" && fx.units === 5, "高亮与逐字单元仍按主行算（Hello 5 个单元）", JSON.stringify(fx));
  check(fx.secondHasTrans === false, "单语言行不长副行", JSON.stringify(fx.secondHasTrans));

  console.log("\n[3] 切到沉浸样式再切回（重挂后仍然折叠）");
  const back = await evaluate(`
    (async () => {
      const btn = document.querySelector('[data-pv-skin="immersive"]');
      if (!btn) return { skipped: true };
      btn.click();
      await new Promise((r) => setTimeout(r, 1500));
      // 与 [1] 同理：换样式后重新注入，并确认渲染出来的是我们那份（4 行）
      const urls = performance.getEntriesByType("resource").map((e) => e.name);
      const app = async (name) =>
        import(urls.find((n) => n.includes("/js/" + name + ".js")) || "/js/" + name + ".js");
      const store = await app("store");
      const host = await app("playerhost");
      const id = store.state.currentId;
      let n = 0;
      for (let k = 0; k < 8; k += 1) {
        await host.applyOnlineLyrics(id, ${JSON.stringify(LRC)}, "preview");
        await new Promise((delay) => setTimeout(delay, 250));
        n = document.querySelectorAll("#pv-lyrics .lyric").length;
        if (n === 4) break;
      }
      const scroll = document.querySelector("#pv-lyrics .lyrics__scroll");
      const rows = scroll ? [...scroll.querySelectorAll(".lyric")].length : 0;
      const withTrans = scroll ? [...scroll.querySelectorAll(".lyric__trans")].length : 0;
      const classic = document.querySelector('[data-pv-skin="classic"]');
      classic?.click();
      await new Promise((r) => setTimeout(r, 1200));
      return {
        skipped: false,
        injected: n,
        rows,
        withTrans,
        skin: document.getElementById("playerview")?.dataset.skin,
      };
    })()
  `);
  console.log("   ", JSON.stringify(back));
  if (back.skipped) {
    console.log("  SKIP 没有内置样式按钮（跳过）");
  } else {
    check(
      back.injected === 4 && back.rows === 4 && back.withTrans === 3,
      "沉浸样式同样是 4 条 / 3 条副行",
      JSON.stringify(back)
    );
    check(back.skin === "classic", "能切回来", String(back.skin));
  }

  await shot("ml-lyrics");

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  console.log(errors.length ? `—— 控制台报错 ${errors.length} 条 ——` : "—— 控制台无 error ——");
  for (const e of [...new Set(errors.map((x) => x.split("\n")[0]))].slice(0, 20)) console.log(" ", e);
  console.log("截图:", join(OUT, "ml-lyrics.png"));
} finally {
  try {
    ws.close();
  } catch {
    /* 已关 */
  }
  edge.kill();
}
