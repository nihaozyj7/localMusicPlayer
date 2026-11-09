/* ==========================================================================
   render-shot.mjs — 「律动方块」画布自检（无头 Edge + 假宿主 + 出图）
   --------------------------------------------------------------------------
   ★ 这个脚本属于**第三方样式包自己**，与播放器项目源码零耦合：
     · 它自己起一个只读静态服务，只把本样式包目录暴露出去；
     · 它自己在页面里搭「假宿主」（ctx 的取值函数 + actions），
       不 import 宿主的 store / playerhost / 契约包；
     · 它按宿主的做法把 skin.css 包进 `@layer skin { @scope(#stage) { … } }`
       再注入，于是 `:scope` 与安全区 `--skin-inset-*` 都是**真的**在起作用。

   验四件事（都是量出来的，不是看感觉）：
     1. 方块真的画出来了 —— 非背景像素数要多于阈值；
     2. 起伏真的跟着频谱走 —— 换一份谱，整幅像素签名必须变；
     3. 颜色真的在流动 —— 频谱不变、只让时间走，签名同样必须变；
     4. HUD 真的让开了宿主壳 —— 歌词按钮的底边必须在
        `舞台高 - --skin-inset-bottom` 上方；点一下歌词要触发一次 seek；
     5. destroy 之后画面**一像素都不变**（帧循环停干净了）。

   用法：node plugins/style/cube-matrix/tests/render-shot.mjs
   结束时打印 PNG 路径（在 %TEMP% 下，可直接打开看效果）。
   ========================================================================== */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const W = 1440;
const H = 900;
const INSET_TOP = 88;
const INSET_BOTTOM = 90;

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

/**
 * 假宿主页面。骨架与宿主真实传进来的 ctx 一致（只保留本样式会读的那几个），
 * 歌词直接构造契约形态 `{ time, text }`，不走 LRC 解析。
 */
const HARNESS = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>cube-matrix check</title>
<style>
  html, body { margin: 0; background: #05060a; overflow: hidden; }
  /* 模拟宿主舞台：铺满整窗（随视口变），两块 chrome 的高度由 --skin-inset-* 下发 */
  #stage {
    position: fixed; inset: 0;
    --skin-inset-top: ${INSET_TOP}px;
    --skin-inset-bottom: ${INSET_BOTTOM}px;
  }
</style>
</head>
<body>
<div id="stage"></div>
<script type="module">
import skin from "/skin.js";

const stage = document.getElementById("stage");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* 宿主真实下发的歌词形态：lines + index，index 指向正在唱的那一句 */
const LINES = [
  { time: 0, text: "第一句已经唱过" },
  { time: 12000, text: "方块随着节奏起伏" },
  { time: 18000, text: "颜色在紫与青之间流动" },
];
const SING_INDEX = 1;

/** 踢鼓：只推低频（k<1 时按段衰减），模拟每拍打一下 */
function beatKick(k, i) {
  if (!k || i > 30) return 0;
  return 0.4 * k * (1 - i / 30);
}

/* -------------------------------------------------------------------------
   把宿主包 CSS 的方式照搬过来：@layer skin + @scope(#stage)
   （:scope 只有真的被包进 @scope 里才指向舞台根 —— 不包就测不到）
   ------------------------------------------------------------------------- */
async function injectCss() {
  const css = await (await fetch("/skin.css")).text();
  const sheet = new CSSStyleSheet();
  sheet.replaceSync("@layer skin { @scope (#stage) { " + css + " } }");
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

/* 频谱：三种「曲风」，用来验起伏与配色真的跟着频谱走。
   ★ frozen = 谱固定 + 采样时刻固定：历史不推进，柱高必须**完全静止**
     —— 这是「画面不会自己起伏」的回归判据（早期版本加了正弦假节奏，这里会红）。 */
function makeSpectrum(mode) {
  if (mode === "idle") return null;
  const bands = new Float32Array(128);
  if (mode === "frozen") {
    for (let i = 0; i < 128; i += 1) {
      bands[i] = 0.42 + 0.3 * Math.sin(i * 0.19) + 0.24 * Math.sin(i * 0.43);
    }
    // at 照常推进（历史继续滚动），但**谱固定** → 柱子形状必须稳定；
    // 若高度里掺了与音频无关的正弦，这里就会晃起来。
    return { bands, at: performance.now() };
  }
  if (mode === "mix") {
    // 截图演示用：模拟一段流行乐的谱 —— 低频基座 + 几个随时间漂移的窄峰
    // （人声/乐器的共鸣峰）+ 踢鼓 + 镲。不能写成一条平滑正弦：那样每列高度
    // 都差不多，画面看着像称好的斜坡，看不出这是频谱。
    const t = performance.now() / 1000;
    const kick = Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.75)), 6);
    const hat = Math.pow(Math.max(0, Math.sin(t * 6.3)), 10);
    for (let i = 0; i < 128; i += 1) {
      const f = i / 127;
      const base = 0.5 * Math.pow(1 - f, 1.6) + 0.06;
      const peak1 = 0.34 * Math.pow(Math.abs(Math.sin(i * 0.105 + t * 0.9 + 0.7)), 8);
      const peak2 = 0.26 * Math.pow(Math.abs(Math.sin(i * 0.074 - t * 1.3 + 2.1)), 10);
      const peak3 = 0.22 * Math.pow(Math.abs(Math.sin(i * 0.19 + t * 2.2 + 4.2)), 6);
      const low = beatKick(kick, i);
      const high = i > 92 ? 0.22 * hat : 0;
      bands[i] = Math.max(0, Math.min(1, base + peak1 + peak2 + peak3 + low + high));
    }
    return { bands, at: performance.now() };
  }
  for (let i = 0; i < 128; i += 1) {
    if (mode === "bass") bands[i] = i < 22 ? 1 : 0.08;
    else if (mode === "highs") bands[i] = i > 84 ? 1 : 0.08;
    else bands[i] = 0.5;
  }
  return { bands, at: performance.now() };
}

function makeCtx(seekCalls) {
  const state = { mode: "idle", index: SING_INDEX };
  const ctx = {
    root: stage,
    backgroundRoot: null,
    env: () => ({
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      reducedMotion: false,
    }),
    options: () => ({ showLyrics: true, animations: true, interactive: true, lyricsFontSize: 16 }),
    lyrics: () => ({ lines: LINES, index: state.index, status: "ready", statusText: "" }),
    track: () => ({ title: "律动方块", artist: "测试艺人", album: "" }),
    playback: () => ({ position: 12000, duration: 200000, playing: true, volume: 1, muted: false }),
    spectrum: () => makeSpectrum(state.mode),
    sdk: {},
    actions: { seek: (ms) => seekCalls.push(ms) },
    on: () => () => {},
  };
  return { ctx, state };
}

async function run() {
  // headless 下合成器不给 BeginFrame（实测 rAF 一次都不来），换定时器驱动帧循环
  const rafOrig = window.requestAnimationFrame;
  const cafOrig = window.cancelAnimationFrame;
  const timers = new Set();
  let frames = 0;
  window.requestAnimationFrame = (cb) => {
    const id = setTimeout(() => {
      timers.delete(id);
      frames += 1;
      cb(performance.now());
    }, 8);
    timers.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    timers.delete(id);
    clearTimeout(id);
  };

  const seekCalls = [];
  let ctxObj = null;
  let activeCtx = null;
  const onResize = () => {
    if (activeCtx) {
      skin.update(activeCtx, { type: "resize", width: window.innerWidth, height: window.innerHeight });
    }
  };
  window.addEventListener("resize", onResize);
  try {
    await injectCss();
    // 相机 yaw 摆动会让「柱子形状根本没变」的画面也产生像素差（整体平移），
    // 测「谱固定时柱高静止」时先把它停掉；出演示图前再恢复。
    const { CAM } = await import("/lib/config.js");
    const YAW_AMP = CAM.yawAmp;
    CAM.yawAmp = 0;
    const { COLOR } = await import("/lib/config.js");
    const HUE_SPEED = COLOR.hueSpeed;
    const made = makeCtx(seekCalls);
    ctxObj = made.ctx;
    activeCtx = ctxObj;
    skin.mount(ctxObj);

    const canvas = stage.querySelector(".cm__canvas");
    if (!canvas) return { error: "挂载后没有 .cm__canvas" };
    const g = canvas.getContext("2d");

    /** 整幅画面的三个指标：非背景像素数、像素签名、平均亮度 */
    const stats = () => {
      const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
      let lit = 0;
      let sum = 0;
      let bright = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const gg = d[i + 1];
        const b = d[i + 2];
        // 背景 #05060c 左右的和约 23；柱体是彩色面，和至少上百
        if (r + gg + b > 70) lit += 1;
        sum = (sum * 31 + r * 7 + gg * 3 + b) % 2147483647;
        bright += (r + gg + b) / 3;
      }
      return { lit, sum, bright: bright / (d.length / 4) };
    };

    /**
     * 左半区 / 右半区的非背景像素数（只看柱区，避开顶部 HUD 文字）。
     * 用来验「横向就是频率轴」：低频满 → 左边起柱，高频满 → 右边起柱。
     */
    const litBySide = () => {
      const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
      const w = canvas.width;
      const y0 = Math.floor(canvas.height * 0.35);
      const y1 = Math.floor(canvas.height * 0.82);
      let left = 0;
      let right = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          if (d[i] + d[i + 1] + d[i + 2] <= 70) continue;
          if (x < w * 0.3) left += 1;
          else if (x > w * 0.7) right += 1;
        }
      }
      return { left, right };
    };

    // 1) 待机（没有频谱）：方块也要画出来
    await wait(600);
    const idle = stats();

    // 2) 低频满 → 左边（低频那一侧）被顶起来
    made.state.mode = "bass";
    await wait(700);
    const bass = stats();
    const bassSide = litBySide();

    // 3) 高频满 → 右边被顶起来
    made.state.mode = "highs";
    await wait(700);
    const highs = stats();
    const highsSide = litBySide();

    // 谱固定 + 色相冻结：柱高与颜色都不许变（形状静止的硬判据）。
    // 先等 2.6s：配色吃的是 slow 包络（时间常数 900ms），到这时 energy 早已收敛。
    made.state.mode = "frozen";
    COLOR.hueSpeed = 0;
    await wait(2600);
    const freeze1 = stats();
    const freeze1Side = litBySide();
    await wait(1300);
    const freeze2 = stats();
    const freeze2Side = litBySide();

    // 5) 只把颜色放活：签名必须变，但柱高（lit）基本不变 —— 形状跟频谱、颜色独立流动
    COLOR.hueSpeed = HUE_SPEED;
    await wait(900);
    const later = stats();

    // 5) HUD 几何 + 点歌词 seek
    const hud = stage.querySelector(".cm__hud");
    const lyric = stage.querySelector(".cm__lyric");
    const hudPadTop = parseFloat(getComputedStyle(hud).paddingTop);
    const lyricRect = lyric.getBoundingClientRect();
    const lyricText = stage.querySelector(".cm__lyric-text").textContent;
    lyric.click();
    const seekMs = seekCalls.length ? seekCalls[seekCalls.length - 1] : null;

    // 6) destroy 之后必须静止
    skin.destroy(ctxObj);
    activeCtx = null;
    const dead1 = stats();
    await wait(500);
    const dead2 = stats();

    // 7) 再挂一份「演示态」留给截图：等高度平滑到位再看，画面就是真实观感
    CAM.yawAmp = YAW_AMP;
    const demo = makeCtx([]);
    demo.state.mode = "mix";
    activeCtx = demo.ctx;
    skin.mount(demo.ctx);
    await wait(1400);
    const demoStats = stats();
    // 直接把画布内容导出成 PNG：headless 下合成器不一定出帧，
    // Page.captureScreenshot 拿到的可能是一张空白图，canvas.toDataURL 则与合成器无关。
    const demoCanvas = stage.querySelector(".cm__canvas");
    const demoPng = demoCanvas ? demoCanvas.toDataURL("image/png") : "";

    return {
      frames,
      canvas: { w: canvas.width, h: canvas.height },
      idle,
      bass,
      highs,
      bassSide,
      highsSide,
      freeze1,
      freeze2,
      freeze1Side,
      freeze2Side,
      later,
      hudPadTop,
      lyricBottom: lyricRect.bottom,
      lyricText,
      seekMs,
      dead1,
      dead2,
      demoStats,
      demoPng,
    };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  } finally {
    window.removeEventListener("resize", onResize);
    window.requestAnimationFrame = rafOrig;
    window.cancelAnimationFrame = cafOrig;
    for (const id of timers) clearTimeout(id);
    if (ctxObj) {
      try {
        skin.destroy(ctxObj);
      } catch {
        /* 已经拆过了 */
      }
    }
  }
}

window.__cm = { run };
// 给「用别的方式截图看效果」留的入口：?auto=1 自动跑一遍（只渲染演示态，不做断言）
if (new URLSearchParams(location.search).has("auto")) {
  window.__cm.run();
}
</script>
</body>
</html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/" || url.pathname === "/__harness.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(HARNESS);
    return;
  }
  // 只服务本样式包目录之内，且只读
  const file = resolve(PKG_ROOT, decodeURIComponent(url.pathname).replace(/^\/+/, ""));
  if (file !== PKG_ROOT && !file.startsWith(PKG_ROOT + sep)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  if (!existsSync(file)) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream" });
  res.end(readFileSync(file));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* 只起服务不出图：给「用别的方式（内置截图工具 / 手工开浏览器）看效果」用 */
if (process.argv.includes("--serve")) {
  console.log(`harness 已就绪：${BASE}/?auto=1   （Ctrl+C 结束）`);
  await new Promise(() => {});
}

/* ---------------------------------------------------------- 起无头 Edge -- */

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) {
  console.error("找不到 msedge.exe —— 这个自检需要本机装 Edge");
  server.close();
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(tmpdir(), `cube-matrix-check-${Date.now()}`);
mkdirSync(OUT, { recursive: true });

const CDP_PORT = 9433;
const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--disable-extensions",
    "--disable-component-extensions-with-background-pages",
    `--user-data-dir=${join(OUT, "profile")}`,
    `--remote-debugging-port=${CDP_PORT}`,
    `--window-size=${W},${H}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

let targets = null;
for (let i = 0; i < 60; i += 1) {
  await sleep(500);
  try {
    targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    if (targets.some((t) => t.type === "page")) break;
  } catch {
    /* 还没起来 */
  }
}
const page = (targets || []).find((t) => t.type === "page");
if (!page) {
  console.error("CDP 起不来");
  edge.kill();
  server.close();
  process.exit(1);
}

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
    const where = d?.url || d?.stackTrace?.callFrames?.[0]?.url || "";
    // 浏览器扩展（深色模式插件之类）的注入报错与本样式无关，忽略
    if (!/^chrome-extension:/.test(where)) {
      errors.push(`exception: ${d?.exception?.description || d?.text} @${where}`);
    }
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    const text = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
    if (text) errors.push(`error: ${text}`);
  }
};

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve_, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP 超时：${method}`));
    }, 30000);
    pending.set(id, (m) => {
      clearTimeout(timer);
      resolve_(m);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) {
    const d = r.result.exceptionDetails;
    throw new Error(d?.exception?.description || d.text);
  }
  return r.result?.result?.value;
}

/* --------------------------------------------------------------- 断言 -- */

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

const telemetry = async () => {
  const snap = await send("Page.captureScreenshot", { format: "png" });
  const data = snap.result?.data;
  return data ? Buffer.from(data, "base64") : null;
};

try {
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: BASE + "/" });
  await sleep(1200);

  const res = await evaluate("window.__cm.run()");
  if (!res || res.error) {
    console.error("假宿主里抛错：", res && res.error);
    fail += 1;
  } else {
    check(!errors.length, "控制台无报错", errors.join(" | "));
    check(res.canvas.w === W && res.canvas.h === H, "画布按舞台尺寸铺开", JSON.stringify(res.canvas));
    check(res.frames > 40, "帧循环真的在跑", `frames=${res.frames}`);

    const litFloor = W * H * 0.02;
    check(res.idle.lit > litFloor, "待机时就画出了方块（非背景像素足够多）", `lit=${res.idle.lit}`);
    check(res.bass.lit > litFloor, "低频满时有画面", `lit=${res.bass.lit}`);

    check(res.bass.sum !== res.idle.sum, "换一份谱，画面变了（起伏/配色跟着频谱）");
    check(res.highs.sum !== res.bass.sum, "低频与高频给出不同画面（高度分布真的在动）");
    check(
      res.bassSide.left > res.highsSide.left * 1.2,
      "低频满时左半区（低频一侧）起柱",
      JSON.stringify({ bass: res.bassSide, highs: res.highsSide }),
    );
    check(
      res.highsSide.right > res.bassSide.right * 1.2,
      "高频满时右半区（高频一侧）起柱 —— 横向就是频率轴",
      JSON.stringify({ bass: res.bassSide, highs: res.highsSide }),
    );
    // 谱固定 + 色相冻结：画面必须稳定（形状不自己动、颜色也不动）。
    // 余量 1% 来自配色对 slow 包络（900ms）的残余收敛；若高度里掺了与音频无关的
    // 正弦（14% 柱高摆幅），这里的漂移会是两位数百分比。
    const frozenDrift = res.freeze1.lit ? Math.abs(res.freeze1.lit - res.freeze2.lit) / res.freeze1.lit : 1;
    check(frozenDrift < 0.01, "谱固定时柱高完全静止（画面不自己起伏）", `lit 漂移 ${(frozenDrift * 100).toFixed(3)}%`);
    const ratio1 = res.freeze1Side.left / Math.max(1, res.freeze1Side.right);
    const ratio2 = res.freeze2Side.left / Math.max(1, res.freeze2Side.right);
    check(
      Math.abs(ratio1 - ratio2) < 0.003,
      "谱固定时左右分布同样静止",
      JSON.stringify({ ratio1, ratio2, a: res.freeze1Side, b: res.freeze2Side }),
    );
    // 颜色放活之后：像素签名必须变（色相在走）。
    // 不用 lit 计数来复核「形状没变」—— 亮度阈值对色相本身敏感（黄 510 / 蓝 255），
    // 形状静止这一点已由上面「色相也冻结」的两次采样钉死。
    check(res.later.sum !== res.freeze2.sum, "频谱不变、颜色继续流动（色相在走）");

    check(res.hudPadTop >= INSET_TOP, "HUD 顶部让开了标题栏 + 头部行", `paddingTop=${res.hudPadTop}`);
    check(
      res.lyricBottom <= H - INSET_BOTTOM + 1,
      "歌词底边不压播放控件栏",
      `bottom=${res.lyricBottom} 允许上限=${H - INSET_BOTTOM}`,
    );
    check(res.lyricText === "方块随着节奏起伏", "歌词显示的是当前那一句", res.lyricText);
    check(res.seekMs === 12000, "点歌词跳回本句开头", `seek=${res.seekMs}`);

    check(res.dead1.sum === res.dead2.sum && res.dead1.lit === res.dead2.lit, "destroy 之后画面一像素不变");

    // 画布本体：直接从页面导出（与合成器无关，一定拿到真实画面）
    if (res.demoPng && res.demoPng.startsWith("data:image/png;base64,")) {
      const file = join(OUT, "cube-matrix-canvas.png");
      writeFileSync(file, Buffer.from(res.demoPng.split(",")[1], "base64"));
      console.log(`\n  画布截图：${file}`);
    }

    // 整屏截图：headless 的合成器可能不出帧，拿到空白图就不落盘
    const png = await telemetry();
    if (png) {
      const file = join(OUT, "cube-matrix.png");
      writeFileSync(file, png);
      console.log(`  整屏截图：${file}`);
    }
  }
} catch (err) {
  console.error("自检失败：", (err && err.message) || err);
  fail += 1;
} finally {
  try {
    ws.close();
  } catch {
    /* ignore */
  }
  edge.kill();
  server.close();
}

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
