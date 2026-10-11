/* ==========================================================================
   tools/check-word-lyrics.mjs — 字级（逐字）歌词自检
   --------------------------------------------------------------------------
   需求原文：「添加字级别的歌词支持，优先使用字级别的歌词格式」

   覆盖（纯逻辑部分在单测里，这里只跑**要浏览器才能验**的部分）：
     1. 经典/沉浸渲染器（lyrics-view.js）：当前行拆成 `.lyric__word` 字素，
        按时间只点亮「已经唱到的字」；非当前行保持纯文本（不给整篇拆 span）；
        行文本里不能出现 `<00:12.000>` 这类标记；
     1.5 **逐字平滑填充**：点亮不再是一字一格地跳 —— 每个字素带一个 `--w`
         （0→1）进度，CSS 用渐变文字把强调色从左扫到右。这一节量的是：
         字内部真的是**中间值**（0.5 这类）、随时间连续推进、
         并且确实是用「渐变 + 透明填充色」画出来的（而不是整字换色）；
     2. 暂停（不给 playing）时点亮位置必须严格等于进度 —— 外推只在播放中发生；
     3. 播放中：两次进度推送之间（250ms）也要自己往前推进（rAF 平滑）；
     4. 特效渲染器（fx-lyrics.js）：有 `words` 按字级点亮、没有则退回行内线性插值；
     5. 歌词工作台的来源徽标要显示「逐字」，让用户看得出字级真的被用上了；
     6. 行级歌词照旧不产生任何字素 span；全程无控制台 error；
     7. 换成沉浸式（immersive）样式后逐字点亮同样生效（两套内置样式共用 lyrics-view）；
     8. 魔法阵（magic-circle）样式：canvas 上的字同样按字素点亮（金色像素随进度
        变多），没有字级时间轴时一个金色像素都不出现、且渲染结果一像素不变
        （= 回退成逐行歌词）。纯逻辑部分在 frontend/tests/magic-circle-word.test.js。

   前置：npm run dev（5173）
   用法：node tools/check-word-lyrics.mjs [port]
   ========================================================================== */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const WEB = process.argv[2] ? String(process.argv[2]).replace(/\/$/, "") : "http://127.0.0.1:5173";
const CDP_PORT = 9478;
const W = 1440;
const H = 900;

/**
 * 魔法阵（第三方示例样式）：它的字画在 canvas 上，DOM 里查不到 ——
 * 用 Vite 的 `/@fs/` 直接 import 仓库里那份示例包（不必先拷进
 * internal/skins/resources，那是静态预览服务器的路径）。
 */
const MC_SKIN = fileURLToPath(new URL("../player-skins/magic-circle/skin.js", import.meta.url));
const MC_URL = "/@fs" + decodeURIComponent(pathToFileURL(MC_SKIN).pathname);

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
    const r = await Promise.race([send("Page.captureScreenshot", { format: "png" }), sleep(8000).then(() => null)]);
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

/** 读当前行的「逐字填充进度」与画法：`--w` 是 0..1，画法是渐变文字填充 */
const wordFillSnap = () =>
  evaluate(`
    (() => {
      const cur = document.querySelector("#pv-lyrics .lyric[aria-current='true']");
      if (!cur) return { error: "没有当前行" };
      const words = [...cur.querySelectorAll(".lyric__word")];
      const read = (el) => {
        const cs = getComputedStyle(el);
        return {
          w: Number(cs.getPropertyValue("--w")) || 0,
          fill: cs.webkitTextFillColor || cs.getPropertyValue("-webkit-text-fill-color"),
          clip: String(cs.backgroundClip || cs.getPropertyValue("background-clip") || ""),
          grad: String(cs.backgroundImage || "").includes("gradient"),
        };
      };
      return {
        total: words.length,
        fills: words.map((el) => read(el).w),
        style: words.length ? read(words[0]) : null,
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

  // 吃水线：**唱到的字**与**还没唱到的字**现在靠「渐变的两侧」而不是整块换色区分，
  // 所以要量的不是某个属性值，而是三件事：
  //   ① 画法确实是渐变文字（background-clip: text + 透明填充色）；
  //   ② 字内部出现中间值（6150ms 时第二个字应填到 0.5 左右）—— 这正是「平滑」；
  //   ③ 同一个字内随时间连续推进（0.1 → 0.4 → 0.8），不是到点才跳一下。
  await evaluate(seekExpr(6150));
  await sleep(450);
  const mid = await wordFillSnap();
  console.log("    @6150ms", JSON.stringify(mid));
  check(
    mid?.fills?.[0] === 1 && mid?.fills?.[1] > 0 && mid?.fills?.[1] < 1 && mid?.fills?.[2] === 0,
    "6150ms：第一个字已填满、第二个字填到一半、第三个字还没开始（--w 连续）",
    JSON.stringify(mid?.fills)
  );
  check(
    mid?.style?.grad === true && /transparent|rgba\(0,\s*0,\s*0,\s*0\)/.test(String(mid?.style?.fill)),
    "字是「渐变 + 透明填充色」画出来的（不是整字换色）",
    JSON.stringify(mid?.style)
  );
  check(/text/.test(String(mid?.style?.clip)), "渐变被裁进字形（background-clip: text）", mid?.style?.clip);
  await shot("classic-6150");

  const ramp = [];
  for (const ms of [6110, 6140, 6180]) {
    await evaluate(seekExpr(ms));
    await sleep(320);
    ramp.push((await wordFillSnap())?.fills?.[1]);
  }
  console.log("    同一个字内的推进:", JSON.stringify(ramp));
  check(
    ramp[0] > 0 && ramp[0] < ramp[1] && ramp[1] < ramp[2] && ramp[2] < 1,
    "同一个字内部连续推进（0.1 → 0.4 → 0.8），不是到点整字变色",
    JSON.stringify(ramp)
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
        const wOf = (i) => {
          const el = host.querySelectorAll(".lyric[aria-current='true'] .lyric__word")[i];
          return el ? Number(getComputedStyle(el).getPropertyValue("--w")) || 0 : null;
        };

        view.setPosition(6000); // 没给 playing：不许自己动
        await new Promise((r) => setTimeout(r, 120));
        const frozen = activeCount();

        view.setPosition(6000, { playing: true }); // 开始按墙钟补齐中间帧
        await new Promise((r) => setTimeout(r, 150)); // < 250ms：宿主那侧根本没推过进度
        const advanced = activeCount();

        view.setPosition(6000, { playing: false }); // 暂停：外推值要落回真实进度
        await new Promise((r) => setTimeout(r, 60));
        const paused = activeCount();

        // 平滑填充：停在某个字的**起点**时 --w 还是 0，播放 60ms 后自己走到中间值
        // （宿主这侧一次进度都没推过）—— 这就是「不等推送也连续」的那一步。
        // 只等 60ms：等太久就跨过这个字（100ms 一个字），量到的是 1 而不是中间值。
        view.setPosition(6100);
        await new Promise((r) => setTimeout(r, 80));
        const wFrozen = wOf(1);
        view.setPosition(6100, { playing: true });
        await new Promise((r) => setTimeout(r, 60));
        const wAdvanced = wOf(1);
        view.setPosition(6100, { playing: false });
        await new Promise((r) => setTimeout(r, 60));
        const wPaused = wOf(1);

        view.destroy();
        host.remove();
        return { frozen, advanced, paused, wFrozen, wAdvanced, wPaused };
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
  check(smooth?.wFrozen === 0, "停在一个字的起点时还没开始填（--w = 0）", JSON.stringify(smooth));
  check(
    (smooth?.wAdvanced ?? 0) > 0 && (smooth?.wAdvanced ?? 1) < 1,
    "播放 60ms 后这个字自己填到中间（--w 在 0..1 之间）",
    JSON.stringify(smooth)
  );
  check(smooth?.wPaused === 0, "暂停后填充落回锚点（--w 回到 0）", JSON.stringify(smooth));

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

  /* ------------------------------------------------------------------ */
  console.log("\n[7] 换到沉浸式（immersive）样式：逐字点亮同样生效");
  await send("Page.navigate", { url: `${WEB}/?view=player&pv=immersive&playing=1` });
  await sleep(4500);
  const immersive = await evaluate(`
    (async () => {
      ${bootExpr}
      const store = await app("store");
      const host = await app("playerhost");
      store.state.playing = false;
      store.commit();
      await new Promise((r) => setTimeout(r, 300));
      await host.applyOnlineLyrics(store.state.currentId, ${JSON.stringify(WORD_LRC)}, "preview");
      await new Promise((r) => setTimeout(r, 700));
      const audio = await app("audio");
      audio.seekTo(6150);
      await new Promise((r) => setTimeout(r, 600));
      const cur = document.querySelector(".lyric[aria-current='true']");
      const words = cur ? [...cur.querySelectorAll(".lyric__word")] : [];
      return {
        pv: document.querySelector(".playerview")?.dataset.skin || "",
        total: words.length,
        active: words.filter((w) => w.dataset.active === "true").length,
        text: cur ? cur.textContent : "",
        // 平滑填充在沉浸式样式下也必须在（两套内置样式共用同一份 lyrics.css）
        fills: words.map((w) => Number(getComputedStyle(w).getPropertyValue("--w")) || 0),
      };
    })()
  `);
  console.log("   ", JSON.stringify(immersive));
  check(immersive?.pv === "immersive", "已经切到沉浸式样式", String(immersive?.pv));
  check(immersive?.total === 5, "沉浸式当前行拆成 5 个字素 span", String(immersive?.total));
  check(immersive?.active === 2, "6150ms：唱到的 2 个字点亮", String(immersive?.active));
  check(
    immersive?.fills?.[1] > 0 && immersive?.fills?.[1] < 1,
    "沉浸式样式下字内部同样是连续填充（--w 中间值）",
    JSON.stringify(immersive?.fills)
  );
  check(!/<\\d\\d:/.test(immersive?.text || ""), "行文本里没有残留 <00:12.000> 标记", String(immersive?.text));

  /* ------------------------------------------------------------------ */
  console.log("\n[8] 魔法阵（magic-circle 示例样式）：画布上的逐字点亮与行级回退");
  if (!existsSync(MC_SKIN)) {
    check(false, "示例样式包 player-skins/magic-circle 存在", MC_SKIN);
  } else {
    const mc = await evaluate(`
      (async () => {
        // ★ headless 下合成器不给 BeginFrame（实测 rAF 一次都不来，document.hidden
        //   还是 false），皮肤自己的帧循环于是一帧都不跑 —— 把 rAF 换成定时器，
        //   这条循环就跟合成器无关，能稳定推进。顺带也不必靠截图断言：
        //   画布像素直接 getImageData 数出来。
        const rafOrig = window.requestAnimationFrame;
        const cafOrig = window.cancelAnimationFrame;
        let frames = 0;
        window.requestAnimationFrame = (cb) => setTimeout(() => { frames += 1; cb(performance.now()); }, 8);
        window.cancelAnimationFrame = (tid) => clearTimeout(tid);
        let root = null;
        let skin = null;
        let ctx = null;
        try {
          const urls = performance.getEntriesByType("resource").map((e) => e.name);
          const base =
            urls.find((n) => /player-skins\\/src\\/index\\.js/.test(n)) ||
            urls.find((n) => /player-skins/.test(n) && n.endsWith("index.js")) ||
            "/packages/player-skins/src/index.js";
          const pkg = await import(new URL(base, location.href).href);
          const mod = await import(/* @vite-ignore */ ${JSON.stringify(MC_URL)});

          root = document.createElement("div");
          root.style.cssText = "position:fixed;left:0;top:0;width:900px;height:600px;z-index:-1";
          document.body.appendChild(root);

          let lines = [];
          let index = -1;
          let src = "preview";
          ctx = {
            root,
            backgroundRoot: null,
            env: () => ({ width: 900, height: 600, dpr: 1, reducedMotion: false }),
            options: () => ({
              showLyrics: true,
              interactive: false,
              animations: false,
              lyricsFontSize: 16,
              performanceMode: "smooth",
            }),
            lyrics: () => ({ lines, index, source: src, text: "x", status: "ready", statusText: "" }),
            track: () => ({ title: "T", artist: "A", album: "" }),
            spectrum: () => null,
            sdk: pkg,
            actions: { seek() {} },
          };
          skin = mod.default;
          skin.mount(ctx);

          const canvas = root.querySelector(".mc__canvas");
          if (!canvas) return { error: "挂载后没有 .mc__canvas" };
          const g = canvas.getContext("2d");
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));

          /** 整幅画面的两个判据：金色像素（已唱）与亮像素（字画出来了） */
          const stats = () => {
            const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
            let warm = 0;
            let bright = 0;
            let sum = 0;
            for (let i = 0; i < d.length; i += 4) {
              if (d[i] >= 200) bright += 1;
              if (d[i] - d[i + 2] >= 30 && d[i] >= 150) warm += 1;
              sum = (sum + d[i] * 31 + d[i + 1] * 17 + d[i + 2] * 7) % 2147483647;
            }
            return { warm, bright, sum };
          };
          const setLines = (lrc, source) => {
            lines = pkg.parseLrc(lrc);
            src = source;
            index = 0;
            skin.update(ctx, { type: "lyrics" });
          };
          const at = async (ms) => {
            skin.update(ctx, { type: "progress", position: ms, lyricIndex: 0, duration: 40000, playing: false });
            await wait(400);
            return stats();
          };

          const WORD = "[00:06.00]<00:06.000>第<00:06.100>二<00:06.200>句<00:06.300>开<00:06.400>唱\\n[00:12.00]下一句";
          const PLAIN = "[00:06.00]第二句开唱\\n[00:12.00]下一句";

          setLines(WORD, "w1");
          await wait(1400);
          const wordPre = await at(5900); // 还没开口：整行压暗，一个字都不该亮
          const word0 = await at(6050); // 唱到第 1 个字
          const word2 = await at(6300); // 唱到第 4 个字
          const word4 = await at(6500); // 整句唱完
          setLines(PLAIN, "p1");
          await wait(900);
          const plain0 = await at(6050);
          const plain2 = await at(6300);
          const plain4 = await at(6500);

          return {
            frames,
            canvas: { w: canvas.width, h: canvas.height },
            wordPre,
            word0,
            word2,
            word4,
            plain0,
            plain2,
            plain4,
            // 行级歌词在不同进度下必须**一像素不变**（外推 / 点亮都不该发生）
            plainSame: plain0.sum === plain2.sum && plain2.sum === plain4.sum,
          };
        } catch (err) {
          return { error: String(err && err.message ? err.message : err) };
        } finally {
          window.requestAnimationFrame = rafOrig;
          window.cancelAnimationFrame = cafOrig;
          try {
            if (skin) skin.destroy(ctx);
          } catch {
            /* 已经拆过了 */
          }
          if (root) root.remove();
        }
      })()
    `);
    console.log("   ", JSON.stringify(mc));
    check(!mc?.error, "魔法阵能在页面里挂载并渲染", String(mc?.error || ""));
    check(mc?.frames > 0, "皮肤自己的帧循环跑起来了（rAF 已换成定时器）", `frames=${mc?.frames}`);
    check(
      mc?.wordPre && mc.wordPre.warm === 0 && mc.wordPre.bright < mc.plain0.bright,
      "还没唱到这一句：没有金色字，且未唱字被压暗",
      JSON.stringify(mc?.wordPre)
    );
    check(mc?.word0?.warm > 0, "唱到第 1 个字：金色开始出现", JSON.stringify(mc?.word0));
    check(
      mc?.word2?.warm > mc?.word0?.warm,
      "唱到第 4 个字：点亮的字更多（金色像素变多）",
      JSON.stringify(mc?.word2)
    );
    check(mc?.word4?.warm > mc?.word2?.warm, "整句唱完：整行都点亮", JSON.stringify(mc?.word4));
    check(mc?.plain0?.warm === 0, "行级歌词一个金色像素都不产生", JSON.stringify(mc?.plain0));
    check(mc?.plainSame === true, "行级歌词在不同进度下渲染完全一致（回退成逐行）", String(mc?.plainSame));
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

process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
