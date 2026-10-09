/* ==========================================================================
   tools/check-lyric-exit.mjs — 歌词「行退场」自检
   --------------------------------------------------------------------------
   需求原文：「给歌词添加一个退场动画，目前直接消失观感不好」
   （用户选定的场景：**每句唱完时**）

   覆盖：
     1. 经典/沉浸渲染器（lyrics-view.js）：上一句当前行退下来时挂 data-exit，
        CSS 播 lyric-exit；**只有真当过当前行的那一行**会退场（seek 直接跳过
        一整段行时，中间那些不该集体退场）；
     2. 特效渲染器（fx-lyrics.js）：同样的语义，动画是 fxl-exit；
     3. 重新成为当前行 → data-exit 被摘掉（下一次退场能重播）；
     4. 魔法阵样式：切到它、连唱两句，抓两张截图供人工核对「碎裂飘散」。

   前置：npm run dev（5173）；魔法阵那份要拷进 internal/skins/resources/
   用法：node tools/check-lyric-exit.mjs [port]
   ========================================================================== */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const WEB = process.argv[2] ? String(process.argv[2]).replace(/\/$/, "") : "http://127.0.0.1:5173";
const CDP_PORT = 9477;
const W = 1440;
const H = 900;

const LRC = [
  "[00:00.00]第一句 开场",
  "[00:12.00]第二句 换我唱",
  "[00:20.00]第三句 轮到我",
  "[00:28.00]第四句 收尾",
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
const OUT = join(tmpdir(), "lyric-exit-" + Date.now());
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
    }, 25000);
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

/* --------------------------------------------------------------------------
   [0] 魔法阵样式（画布渲染，DOM 里查不到文字）：退场判据本体
   画布上的字只能截图给人工看，但“什么时候该退场”这条判据是纯函数，直接打它。
   -------------------------------------------------------------------------- */
console.log("\n[0] 魔法阵：上一句该不该退场（onSing 用的判据）");
const mcPath = join(process.cwd(), "player-skins", "magic-circle", "skin.js");
if (!existsSync(mcPath)) {
  console.log("  SKIP 仓库里没有 player-skins/magic-circle");
} else {
  let judge = null;
  try {
    judge = (await import(pathToFileURL(mcPath).href)).shouldLeave;
  } catch (err) {
    console.log("  加载 skin.js 出错:", err?.message || err);
  }
  if (typeof judge !== "function") {
    check(false, "skin.js 导出了 shouldLeave", String(judge));
  } else {
    check(judge(0, 1) === true, "正常推进 0→1 要退场（以前写成 prev > sing，恒 false）");
    check(judge(3, 1) === true, "往回 seek 3→1 也要退场");
    check(judge(-1, 0) === false, "第一句（prev = -1）不退场");
    check(judge(2, 2) === false, "没换行就不退场");
  }
}

/**
 * seek 到指定毫秒。**必须用页面实际那条 audio URL**：Vite HMR 会给源文件加
 * `?t=` 时间戳，裸路径 import 到的是第二份模块实例，seek 会打在没接线的那份上。
 *
 * @param {number} ms
 */
function seekExpr(ms) {
  return `(async () => {
    const urls = performance.getEntriesByType("resource").map((e) => e.name);
    const url = urls.find((n) => n.includes("/js/audio.js")) || "/js/audio.js";
    const audio = await import(url);
    audio.seekTo(${Number(ms)});
    return true;
  })()`;
}

try {
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${WEB}/?view=player&pv=classic&playing=1` });
  await sleep(4500);

  console.log("\n[1] 经典渲染器：上一句当前行退场");
  await evaluate(`
    (async () => {
      // 必须 import 页面实际用的那条 URL：Vite HMR 会加 ?t= 时间戳，裸路径会拿到
      // 第二份模块实例（它的 lyricsCache / skinHost 是空的，注入看起来成功实则无效）
      const urls = performance.getEntriesByType("resource").map((e) => e.name);
      const app = async (name) =>
        import(urls.find((n) => n.includes("/js/" + name + ".js")) || "/js/" + name + ".js");
      const store = await app("store");
      const host = await app("playerhost");
      const audio = await app("audio");
      const id = store.state.currentId;
      if (!id) return { error: "没有当前歌曲" };
      await host.applyOnlineLyrics(id, ${JSON.stringify(LRC)}, "preview");
      audio.seekTo(3000); // 第 1 句
      return 1;
    })()
  `);
  await sleep(900);

  const snap = async () =>
    await evaluate(`
      (() => {
        const rows = [...document.querySelectorAll("#pv-lyrics .lyric")];
        return rows.map((el) => {
          const cs = getComputedStyle(el);
          return {
            i: Number(el.dataset.lyricIndex),
            t: Number(el.dataset.time),
            current: el.getAttribute("aria-current") === "true",
            exit: el.dataset.exit || "",
            anim: cs.animationName,
            opacity: +(+cs.opacity).toFixed(2),
          };
        });
      })()
    `);

  console.log("\n[1] 起点：记下当前行、清掉历史退场状态，制造一个干净的对照");
  const before = await snap();
  const cur0 = (before || []).find((r) => r.current);
  console.log(`    共 ${before?.length} 行，当前 i=${cur0?.i} t=${cur0?.t}`);
  check(
    Array.isArray(before) && before.length > 2 && cur0,
    "歌词在位且有高亮行",
    JSON.stringify(before?.slice(0, 3))
  );
  await evaluate(
    `document.querySelectorAll("#pv-lyrics .lyric[data-exit]").forEach((el) => el.removeAttribute("data-exit"))`
  );
  const target = (before || []).filter((r) => r.i > (cur0?.i ?? 0)).slice(-1)[0] || (before || []).slice(-1)[0];
  check(target && cur0 && target.i > cur0.i, "能找到一个更靠后的行用来跳", JSON.stringify(target));

  console.log("\n[2] 跳到后面的行：只有上一句当前行会退场");
  await evaluate(seekExpr(Number(target?.t || 0)));
  await sleep(200); // 抓在退场动画（--dur × 1.4 ≈ 350ms）的中段
  const jumped = await snap();
  const left = jumped?.find((r) => r.i === cur0?.i);
  const arrived = jumped?.find((r) => r.current);
  const others = (jumped || []).filter((r) => r.exit === "1" && r.i !== cur0?.i);
  console.log("    上一句:", JSON.stringify(left), "当前:", JSON.stringify(arrived), "其它带退场的:", others.length);
  check(left?.exit === "1", "上一句当前行挂上了 data-exit", JSON.stringify(left));
  check(left?.anim === "lyric-exit", "退场动画真的在播（animation-name = lyric-exit）", String(left?.anim));
  check(left && left.opacity > 0.35, "退场中还没沉到底（播到一半）", String(left?.opacity));
  check(arrived && arrived.exit === "" && arrived.i !== cur0?.i, "新当前行自己不带退场状态", JSON.stringify(arrived));
  check(others.length === 0, "**只有**上一句退场（没当过当前行的那些行不动）", JSON.stringify(others));

  console.log("\n[3] 跳回原处：重新成为当前行要把 data-exit 摘掉（下次才能重播）");
  await evaluate(seekExpr(Number(cur0?.t || 0)));
  await sleep(400);
  const back = await snap();
  const backCur = back?.find((r) => r.current);
  const backLeft = back?.find((r) => r.i === arrived?.i);
  console.log("    回到:", JSON.stringify(backCur), "刚交棒的那句:", JSON.stringify(backLeft));
  check(backCur?.i === cur0?.i && backCur?.exit === "", "原来的那句重新高亮且干净", JSON.stringify(backCur));
  check(backLeft?.exit === "1", "刚交棒的那句仍在退场状态（没被误清）", JSON.stringify(backLeft));

  console.log("\n[4] 特效渲染器 fx-lyrics");
  const fx = await evaluate(`
    (async () => {
      const urls = performance.getEntriesByType("resource").map((e) => e.name);
      const base =
        urls.find((n) => /player-skins\\/src\\/index\\.js/.test(n)) ||
        "/packages/player-skins/src/index.js";
      const mod = await import(new URL("./fx-lyrics.js", new URL(base, location.href)).href);
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;left:-9999px;top:0;width:700px;height:320px";
      document.body.appendChild(host);
      const view = mod.createFxLyrics(host, { interactive: false });
      const lines = [
        { time: 0, text: "一行" },
        { time: 5000, text: "二行" },
        { time: 9000, text: "三行" },
      ];
      view.setLines(lines);
      view.setActive(0);
      await new Promise((r) => setTimeout(r, 60));
      view.setActive(1);
      await new Promise((r) => setTimeout(r, 60));
      const els = [...host.querySelectorAll(".fxl__line")];
      const out = els.map((el) => ({
        state: el.dataset.state || "",
        exit: el.dataset.exit || "",
        current: el.getAttribute("aria-current") === "true",
        anim: getComputedStyle(el).animationName,
      }));
      // 第 0 句要先成当前行才谈得上退场：现在它是 exit，第 1 句是 active
      view.setActive(2);
      await new Promise((r) => setTimeout(r, 60));
      const els2 = [...host.querySelectorAll(".fxl__line")].map((el) => ({
        exit: el.dataset.exit || "",
        current: el.getAttribute("aria-current") === "true",
      }));
      const res = { out, els2 };
      view.destroy();
      host.remove();
      return res;
    })()
  `);
  console.log("   ", JSON.stringify(fx));
  check(!fx?.error, "fx-lyrics 能起来", String(fx?.error || ""));
  check(
    fx?.out?.[0]?.exit === "1" && fx?.out?.[0]?.anim === "fxl-exit",
    "第 1 行退场且动画是 fxl-exit",
    JSON.stringify(fx?.out?.[0])
  );
  check(
    fx?.out?.[1]?.current === true && fx?.out?.[1]?.exit === "",
    "第 2 行接棒、自己不带退场",
    JSON.stringify(fx?.out?.[1])
  );
  check(fx?.out?.[2]?.exit === "", "第 3 行没当过当前行 → 不退场", JSON.stringify(fx?.out?.[2]));
  check(fx?.els2?.[1]?.exit === "1", "第 2 行交棒后也退场", JSON.stringify(fx?.els2));

  console.log("\n[5] 魔法阵样式：连唱两句（截图供人工核对碎裂退场）");
  // 行信息要在**切样式之前**读：魔法阵是画布渲染，没有 #pv-lyrics 这个 DOM
  const plan = await evaluate(`
    (() => {
      const rows = [...document.querySelectorAll("#pv-lyrics .lyric")].map((el) => ({
        i: Number(el.dataset.lyricIndex),
        t: Number(el.dataset.time),
        current: el.getAttribute("aria-current") === "true",
      }));
      const cur = rows.find((r) => r.current) || rows[0];
      const next = rows.find((r) => cur && r.i === cur.i + 1) || rows[1] || null;
      return cur && next ? { cur, next } : { error: "找不到可用的两句", n: rows.length };
    })()
  `);
  const mc = await evaluate(`
    (async () => {
      const btn = document.querySelector('[data-pv-skin="magic-circle"]');
      if (!btn) return { skipped: true };
      btn.click();
      await new Promise((r) => setTimeout(r, 1500));
      return { skipped: false, skin: document.getElementById("playerview")?.dataset.skin };
    })()
  `);
  if (mc?.skipped) {
    console.log("  SKIP 仓库预览里没有 magic-circle");
  } else if (plan?.error) {
    check(false, "魔法阵：准备切句", JSON.stringify(plan));
  } else {
    await evaluate(seekExpr(Math.max(0, Number(plan.next.t) - 700)));
    await sleep(620); // 位置 ≈ next.t - 80：这一句还亮着
    await shot("mc-before");
    await sleep(360); // 位置 ≈ next.t + 280：上一句正在碎裂 / 飘散
    await shot("mc-exit");
    await sleep(1700);
    await shot("mc-settled");
    console.log("   ", JSON.stringify({ ...mc, plan }), "→ 三张截图（开口前 / 退场中 / 落定）");
    check(mc.skin === "magic-circle", "切到魔法阵样式", String(mc.skin));
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  console.log(errors.length ? `—— 控制台报错 ${errors.length} 条 ——` : "—— 控制台无 error ——");
  for (const e of [...new Set(errors.map((x) => x.split("\n")[0]))].slice(0, 20)) console.log(" ", e);
  console.log("截图目录:", OUT);
} finally {
  try {
    ws.close();
  } catch {
    /* 已关 */
  }
  edge.kill();
}
