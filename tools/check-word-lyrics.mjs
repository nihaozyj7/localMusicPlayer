/* ==========================================================================
   tools/check-word-lyrics.mjs — 字级（逐字）歌词自检
   --------------------------------------------------------------------------
   需求原文：「添加字级别的歌词支持，优先使用字级别的歌词格式」

   覆盖（纯逻辑部分在单测里，这里只跑**要浏览器才能验**的部分）：
     1. 经典/沉浸渲染器（lyrics-view.js）：当前行拆成 `.lyric__word` 字素，
        按时间只点亮「已经唱到的字」；非当前行保持纯文本（不给整篇拆 span）；
        行文本里不能出现 `<00:12.000>` 这类标记；
     2. 暂停（不给 playing）时点亮位置必须严格等于进度 —— 外推只在播放中发生；
     3. 播放中：两次进度推送之间（250ms）也要自己往前推进（rAF 平滑）；
     4. 特效渲染器（fx-lyrics.js）：有 `words` 按字级点亮、没有则退回行内线性插值；
     5. 歌词工作台的来源徽标要显示「逐字」，让用户看得出字级真的被用上了；
     6. 行级歌词照旧不产生任何字素 span；全程无控制台 error。

   前置：npm run dev（5173）
   用法：node tools/check-word-lyrics.mjs [port]
   ========================================================================== */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const WEB = process.argv[2] ? String(process.argv[2]).replace(/\/$/, "") : "http://127.0.0.1:5173";
const CDP_PORT = 9478;
const W = 1440;
const H = 900;

/**
 * 字级歌词：每行五个字，逐字间隔 100ms（增强 LRC = 后端归一化后的形态）。
 * 100ms 的间隔是为了让「暂停时的精确点亮」与「播放中的平滑推进」都能被量出来。
 */
const WORD_LRC = [
  "[00:06.00]<00:06.000>第<00:06.100>二<00:06.200>句<00:06.300>开<00:06.400>唱",
  "[00:12.00]<00:12.000>第<00:12.100>三<00:12.200>句<00:12.300>继<00:12.400>续",
  "[00:18.00]<00:18.000>第<00:18.100>四<00:18.200>句<00:18.300>收<00:18.400>尾",
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
const OUT = join(tmpdir(), "word-lyrics-" + Date.now());
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
    const d = m.params.exceptionDetails;
    errors.push(`exception: ${d?.exception?.description || d?.text}`);
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
  if (r.result?.exceptionDetails) {
    const d = r.result.exceptionDetails;
    errors.push(`eval: ${d?.exception?.description || d.text}`);
  }
  return r.result?.result?.value;
}
async function shot(name) {
  // 截图只是给人工核对用的，**不能让自检本身挂掉**：CDP 偶发卡在
  // captureScreenshot 上时（多开的 headless 实例抢同一个端口就会这样）
  // 之前整个脚本会直接抛异常退出，真正的检查项反而没跑完。
  try {
    const r = await Promise.race([
      send("Page.captureScreenshot", { format: "png" }),
      sleep(8000).then(() => null),
    ]);
    if (!r?.result?.data) {
      console.log(`  （截图 ${name} 超时，跳过）`);
      return;
    }
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, "base64"));
  } catch (err) {
    console.log(`  （截图 ${name} 失败：${err?.message || err}）`);
  }
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

/** 页面里反复要用的「按名字 import 实际那条 URL」+ seek */
const bootExpr = `
  const urls = performance.getEntriesByType("resource").map((e) => e.name);
  const app = async (name) =>
    import(urls.find((n) => n.includes("/js/" + name + ".js")) || "/js/" + name + ".js");
`;

function seekExpr(ms) {
  return `(async () => {
    ${bootExpr}
    const audio = await app("audio");
    audio.seekTo(${Number(ms)});
    return true;
  })()`;
}

/** 读当前高亮行的字素点亮情况 */
const wordSnap = () =>
  evaluate(`
    (() => {
      const cur = document.querySelector("#pv-lyrics .lyric[aria-current='true']");
      if (!cur) return { error: "没有当前行" };
      const words = [...cur.querySelectorAll(".lyric__word")];
      const others = [...document.querySelectorAll("#pv-lyrics .lyric[aria-current='false'] .lyric__word")];
      return {
        index: Number(cur.dataset.lyricIndex),
        text: cur.textContent,
        total: words.length,
        active: words.filter((w) => w.dataset.active === "true").length,
        foreign: others.length,
      };
    })()
  `);

/** 设置播放状态（预览里由 mock ticker 每 250ms 推一次进度） */
const setPlayingExpr = (on) => `
  (async () => {
    ${bootExpr}
    const store = await app("store");
    store.state.playing = ${on ? "true" : "false"};
    store.commit();
    return store.state.playing;
  })()
`;

try {
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${WEB}/?view=player&pv=classic&playing=1` });
  await sleep(4500);

  // 先切回「暂停」：这一节要的是**严格等于进度**的点亮（外推只在播放中发生）
  await evaluate(setPlayingExpr(false));
  await sleep(300);

  /* ------------------------------------------------------------------ */
  console.log("\n[1] 注入字级歌词，经典渲染器按字点亮（暂停态，精确对时）");
  const injected = await evaluate(`
    (async () => {
      ${bootExpr}
      const store = await app("store");
      const host = await app("playerhost");
      const id = store.state.currentId;
      if (!id) return { error: "没有当前歌曲" };
      await host.applyOnlineLyrics(id, ${JSON.stringify(WORD_LRC)}, "preview");
      return { ok: true };
    })()
  `);
  check(injected?.ok, "歌词已注入（增强 LRC）", JSON.stringify(injected));
  await sleep(700);

  await evaluate(seekExpr(6000));
  await sleep(500);
  const at6000 = await wordSnap();
  console.log("    @6000ms", JSON.stringify(at6000));
  check(at6000?.total === 5, "当前行被拆成 5 个字素 span", JSON.stringify(at6000));
  check(at6000?.active === 1, "只点亮第一个字（6000ms）", JSON.stringify(at6000));
  check(at6000?.foreign === 0, "**只有当前行**拆字素，其它行仍是纯文本", JSON.stringify(at6000));
  check(
    typeof at6000?.text === "string" && !at6000.text.includes("<"),
    "行文本里没有逐字标记残留",
    String(at6000?.text)
  );
  await shot("classic-6000");

  await evaluate(seekExpr(6200));
  await sleep(500);
  const at6200 = await wordSnap();
  console.log("    @6200ms", JSON.stringify(at6200));
  check(at6200?.active === 3, "推进到第三个字（6200ms）", JSON.stringify(at6200));
  await shot("classic-6200");

  // 成色：唱到的字与还没唱到的字必须明显不同（只换颜色在「强调色接近白」
  // 的主题里看不出来，所以未唱到的字还压了透明度）
  const colors = await evaluate(`
    (() => {
      const cur = document.querySelector("#pv-lyrics .lyric[aria-current='true']");
      const words = cur ? [...cur.querySelectorAll(".lyric__word")] : [];
      const on = words.find((w) => w.dataset.active === "true");
      const off = words.find((w) => w.dataset.active !== "true");
      const info = (el) =>
        el
          ? { color: getComputedStyle(el).color, opacity: +getComputedStyle(el).opacity }
          : null;
      return { on: info(on), off: info(off) };
    })()
  `);
  console.log("    成色:", JSON.stringify(colors));
  check(
    Boolean(colors?.on && colors?.off) &&
      colors.on.color !== colors.off.color &&
      colors.on.opacity > colors.off.opacity,
    "唱到的字（亮 / 强调色）与没唱到的字（暗）成色不同",
    JSON.stringify(colors)
  );

  await evaluate(seekExpr(6400));
  await sleep(500);
  const at6400 = await wordSnap();
  check(at6400?.active === 5, "整句点亮（6400ms）", JSON.stringify(at6400));

  console.log("\n[2] 换到下一句：上一句必须还原成纯文本（不给整篇留 span）");
  await evaluate(seekExpr(12100));
  await sleep(500);
  const nextLine = await wordSnap();
  console.log("    @12100ms", JSON.stringify(nextLine));
  check(nextLine?.index === 1 && nextLine?.active === 2, "新当前行按字点亮", JSON.stringify(nextLine));
  check(nextLine?.foreign === 0, "上一句的字素已还原成纯文本", JSON.stringify(nextLine));
  await shot("classic-next-line");

  /* ------------------------------------------------------------------ */
  console.log("\n[3] 播放中：两次进度推送之间（250ms）也要自己往前推进（rAF 平滑）");
  // 用**独立实例**驱动：宿主的进度推送（预览里还有 250ms 的 mock ticker）
  // 会把「是不是自己外推的」搅浑，这里关掉宿主那一侧，只看渲染器自己。
  const smooth = await evaluate(`
    (async () => {
      try {
        ${bootExpr}
        const base =
          urls.find((n) => /player-skins\\/src\\/index\\.js/.test(n)) ||
          "/packages/player-skins/src/index.js";
        const pkg = await import(new URL(base, location.href).href);
        const host = document.createElement("div");
        host.style.cssText = "position:fixed;left:-9999px;top:0;width:700px;height:320px";
        document.body.appendChild(host);
        const view = pkg.createLyricsView(host, { interactive: false });
        view.setLines(pkg.parseLrc(${JSON.stringify(WORD_LRC)}));
        const activeCount = () =>
          host.querySelectorAll(".lyric[aria-current='true'] .lyric__word[data-active='true']").length;

        view.setPosition(6000); // 没给 playing：不许自己动
        await new Promise((r) => setTimeout(r, 120));
        const frozen = activeCount();

        view.setPosition(6000, { playing: true }); // 开始按墙钟补齐中间帧
        await new Promise((r) => setTimeout(r, 150)); // < 250ms：宿主那侧根本没推过进度
        const advanced = activeCount();

        view.setPosition(6000, { playing: false }); // 暂停：外推值要落回真实进度
        await new Promise((r) => setTimeout(r, 60));
        const paused = activeCount();

        view.destroy();
        host.remove();
        return { frozen, advanced, paused };
      } catch (err) {
        return { error: String(err && err.message ? err.message : err) };
      }
    })()
  `);
  console.log("   ", JSON.stringify(smooth));
  check(smooth && !smooth.error, "独立渲染器能跑", String(smooth?.error || ""));
  check(smooth?.frozen === 1, "暂停时不外推（停在 6000ms 的第一个字）", JSON.stringify(smooth));
  check(
    (smooth?.advanced ?? 0) > (smooth?.frozen ?? 99),
    "播放中 150ms 内自己往前点亮（不等下一次进度推送）",
    JSON.stringify(smooth)
  );
  check(smooth?.paused === 1, "暂停后外推值落回真实进度（回到第一个字）", JSON.stringify(smooth));

  /* ------------------------------------------------------------------ */
  console.log("\n[4] 歌词工作台：来源徽标显示「逐字」");
  const badge = await evaluate(`
    (async () => {
      ${bootExpr}
      const panel = await app("lyrics-panel");
      panel.toggleLyricsPanel();
      await new Promise((r) => setTimeout(r, 600));
      const el = document.querySelector(".lyricspanel__badge[data-song-source]");
      return el ? el.textContent.replace(/\\s+/g, " ").trim() : null;
    })()
  `);
  console.log("    徽标:", JSON.stringify(badge));
  check(typeof badge === "string" && badge.includes("逐字"), "徽标带上「逐字」", String(badge));

  /* ------------------------------------------------------------------ */
  console.log("\n[5] 特效渲染器 fx-lyrics：有字级按字点亮，没字级退回行内插值");
  const fx = await evaluate(`
    (async () => {
      try {
        ${bootExpr}
        const base =
          urls.find((n) => /player-skins\\/src\\/index\\.js/.test(n)) ||
          urls.find((n) => /player-skins/.test(n) && n.endsWith("index.js")) ||
          "/packages/player-skins/src/index.js";
        const pkg = await import(new URL(base, location.href).href);
        const fxMod = await import(new URL("./fx-lyrics.js", new URL(base, location.href)).href);
        const lines = pkg.parseLrc(${JSON.stringify(WORD_LRC)});
        const host = document.createElement("div");
        host.style.cssText = "position:fixed;left:-9999px;top:0;width:700px;height:320px";
        document.body.appendChild(host);
        const view = fxMod.createFxLyrics(host, { interactive: false });
        view.setLines(lines);

        const holds = (pos) => {
          view.setPosition(pos);
          const el = host.querySelector('.fxl__line[data-state="active"]');
          if (!el) return null;
          const units = [...el.querySelectorAll(".fxl__u")];
          return {
            done: units.filter((u) => u.dataset.hold === "done").length,
            now: units.filter((u) => u.dataset.hold === "now").length,
            todo: units.filter((u) => u.dataset.hold === "todo").length,
          };
        };

        const word = holds(6200); // 6000 / 6100 / 6200 已唱到
        const wordLater = holds(6400);
        // 行级（没有 words）：同样这一句退回行内线性插值
        const plain = pkg.parseLrc("[00:06.00]第二句开唱\\n[00:12.00]下一句");
        view.setLines(plain);
        view.setPosition(9000); // 行内 50%（6000→12000）→ ceil(0.5*5)=3
        const plainEl = host.querySelector('.fxl__line[data-state="active"]');
        const plainUnits = plainEl ? [...plainEl.querySelectorAll(".fxl__u")] : [];
        const plainHold = {
          done: plainUnits.filter((u) => u.dataset.hold === "done").length,
          now: plainUnits.filter((u) => u.dataset.hold === "now").length,
        };

        view.destroy();
        host.remove();
        return { base, word, wordLater, plainHold, words: lines[0]?.words || null };
      } catch (err) {
        return { error: String(err && err.message ? err.message : err) };
      }
    })()
  `);
  console.log("   ", JSON.stringify(fx));
  check(!fx?.error, "fx-lyrics 能在页面里跑起来", String(fx?.error || ""));
  check(
    Array.isArray(fx?.words) && fx.words.length === 5,
    "parseLrc 给第一句解析出 5 个逐字时间",
    JSON.stringify(fx?.words)
  );
  check(
    fx?.word && fx.word.done === 2 && fx.word.now === 1,
    "6200ms：唱到的三个字（done 2 + now 1）",
    JSON.stringify(fx?.word)
  );
  check(
    fx?.wordLater && fx.wordLater.done === 4 && fx.wordLater.now === 1,
    "6400ms：整句唱完",
    JSON.stringify(fx?.wordLater)
  );
  check(
    fx?.plainHold && fx.plainHold.done === 2 && fx.plainHold.now === 1,
    "行级歌词仍走行内线性插值（形状不变）",
    JSON.stringify(fx?.plainHold)
  );

  /* ------------------------------------------------------------------ */
  console.log("\n[6] 无逐字时间轴的歌词：渲染成纯文本行（不产生 span）");
  await evaluate(setPlayingExpr(false));
  const plainBack = await evaluate(`
    (async () => {
      ${bootExpr}
      const store = await app("store");
      const host = await app("playerhost");
      await host.applyOnlineLyrics(store.state.currentId, "[00:06.00]第二句开唱\\n[00:12.00]下一句", "preview");
      await new Promise((r) => setTimeout(r, 700));
      const audio = await app("audio");
      audio.seekTo(6000);
      await new Promise((r) => setTimeout(r, 500));
      const cur = document.querySelector("#pv-lyrics .lyric[aria-current='true']");
      return {
        words: cur ? cur.querySelectorAll(".lyric__word").length : -1,
        text: cur ? cur.textContent : "",
      };
    })()
  `);
  console.log("   ", JSON.stringify(plainBack));
  check(plainBack?.words === 0, "行级歌词不产生字素 span", String(plainBack?.words));
  check(plainBack?.text?.includes("第二句开唱"), "行级歌词照常显示", String(plainBack?.text));

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

process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
