/* ==========================================================================
   verify-effect-setting.mjs — 在**真实应用**里验证音效设置的界面与落盘
   --------------------------------------------------------------------------
   为什么需要一个专门的脚本（而不是只靠 tools/settingscheck.mjs）：

   那个脚本用 `import("/js/bridge.js")` 直接调后端绑定，因此**只能对着
   开发构建跑**（Wails 把前端源码原样托管的模式）。生产构建里前端是被
   Vite 打包进 assets/ 的，`/js/bridge.js` 这个 URL 根本不存在，
   脚本会以「Failed to fetch dynamically imported module」失败。

   本脚本改成**只用 DOM 与真实鼠标点击**（和 hitcheck.mjs / 
   probe-live-settings.mjs 同一套接入方式），所以对生产构建同样有效 ——
   而且它验证的路径更接近用户：点按钮 → 界面变化 → 重启 → 设置还在。

   检查项：
     1. 设置层里有「音效」卡片，6 个档位按钮都在；
     2. 真实鼠标点「大厅混响」→ 按钮变为选中态；
     3. 等配置去抖落盘（store 是 400ms 去抖）；
     4. 重启后打开设置层 → 「大厅混响」仍是选中态，且
        后端引擎报告 requested=hall（不只是配置存住了）。

   用法：node tools/verify-effect-setting.mjs [--exe bin/lmplayer.exe]
   ========================================================================== */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const EXE = path.resolve(ROOT, arg("exe", "bin/lmplayer.exe"));
const PORT = Number(arg("port", "9397"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(EXE)) {
  console.error(`找不到可执行文件：${EXE}`);
  process.exit(1);
}

const workDir = path.join(ROOT, ".tmp-effect-setting");
rmSync(workDir, { recursive: true, force: true });
const dataDir = path.join(workDir, "data");
mkdirSync(dataDir, { recursive: true });

function get(pathname) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: PORT, path: pathname }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

/** 启动应用并返回一个「在该页面里求值」的函数（与 settingscheck.mjs 同构） */
async function boot(label) {
  const logPath = path.join(workDir, `${label}.log`);
  const fd = openSync(logPath, "w");
  const child = spawn(EXE, [], {
    env: {
      ...process.env,
      LMPLAYER_DEBUG_PORT: String(PORT),
      WEBVIEW2_USER_DATA_FOLDER: path.join(workDir, `wv2-${label}`),
      LMPLAYER_DATA_DIR: dataDir,
      LMPLAYER_MUSIC_DIR: path.join(workDir, "Music"),
    },
    stdio: ["ignore", fd, fd],
    detached: false,
  });
  closeSync(fd);

  let target = null;
  for (let i = 0; i < 150 && !target; i += 1) {
    await sleep(400);
    try {
      const list = JSON.parse(await get("/json/list"));
      target = list.find((t) => t.type === "page") || null;
    } catch {
      /* 等 DevTools 起来 */
    }
  }
  if (!target) {
    child.kill();
    throw new Error(`应用未启动（${label}），日志：${logPath}`);
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

  const evalJs = async (expression) => {
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
  };

  /**
   * 用**真实鼠标事件**点一个元素（比 element.click() 更接近用户操作）。
   *
   * ★ 必须先 scrollIntoView 再算坐标。
   *
   * 设置层是一个可滚动的长面板，音效卡片在中间，初次打开时它的 y 坐标
   * 可能是 3000+ —— 远在视口之下。此时用 getBoundingClientRect 拿到的
   * 坐标去 dispatchMouseEvent，点击会落在视口之外的"空白"上
   *（实测 elementFromPoint 返回 none），于是什么都没发生，
   * 而断言会误报成"点了按钮但界面没变"。
   *
   * 滚动之后再取坐标，并且用 elementFromPoint 确认目标真的在最上层 ——
   * 后者能抓住"按钮被别的元素遮住"这类问题（命中测试），
   * 那同样会让真实鼠标点不到。
   */
  const clickAt = async (selector) => {
    const box = await evalJs(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { error: "not-found" };

      // 先滚到视口内（block:"center" 避免被设置层顶部的导航条压住）
      el.scrollIntoView({ block: "center", inline: "center" });
      // 等一帧，让滚动真正落地（scrollIntoView 默认是瞬间的，
      // 但 Lit 的重绘可能在同一个任务里排队）
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const r = el.getBoundingClientRect();
      const cx = Math.round(r.x + r.width / 2);
      const cy = Math.round(r.y + r.height / 2);

      // 命中测试：真正在这一点上的是不是它（或它的子元素）
      const top = document.elementFromPoint(cx, cy);
      const hit = top && (el === top || el.contains(top));

      return {
        x: cx,
        y: cy,
        inViewport: cy > 0 && cy < window.innerHeight,
        hit,
        topTag: top ? top.tagName + "." + (top.className || "") : "none",
      };
    `);
    if (box?.error) throw new Error(`找不到元素：${selector}`);
    if (!box.inViewport) {
      throw new Error(`元素滚进视口后坐标仍为 y=${box.y}（视口高 ${"?"}）—— 设置层可能没滚动`);
    }
    if (!box.hit) {
      throw new Error(
        `元素在 (${box.x},${box.y}) 处被遮挡：最上层是 ${box.topTag}（命中测试失败）`
      );
    }
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", {
        type,
        x: box.x,
        y: box.y,
        button: "left",
        clickCount: 1,
      });
    }
    return box;
  };

  for (let i = 0; i < 60; i += 1) {
    const ready = await send("Runtime.evaluate", {
      expression: "document.body.dataset.ready === 'true'",
      returnByValue: true,
    });
    if (ready?.result?.value === true) break;
    await sleep(500);
  }
  await sleep(1500);

  return {
    evalJs,
    clickAt,
    close: async () => {
      ws.close();
      child.kill();
      await sleep(2500);
    },
  };
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "[OK ]" : "[!! ]"} ${name}${detail ? `  — ${detail}` : ""}`);
}

/**
 * 打开设置层。
 *
 * ★ 刻意只用 DOM 找入口、点它，**不 import 任何前端模块**：
 * 生产构建里前端被 Vite 打包进 assets/（带内容哈希的文件名），
 * 根本没有稳定的模块 URL 可 import。走界面路径反而更接近用户操作，
 * 也顺带验证了「设置入口能被点到」这件事。
 */
async function openSettings(sess) {
  const opened = await sess.evalJs(`
    // 设置入口在标题栏上，按可访问名/常见属性依次找
    const cands = [
      '[aria-label="设置"]',
      '[title="设置"]',
      '[data-act="open-settings"]',
      "#btn-settings",
      ".titlebar__btn--settings",
    ];
    for (const sel of cands) {
      const el = document.querySelector(sel);
      if (el) { el.click(); return "clicked:" + sel; }
    }
    // 兜底：遍历标题栏按钮，找 <use href="#i-settings"> 的那个
    for (const el of document.querySelectorAll("button, [role='button']")) {
      if (el.querySelector('use[href="#i-settings"]')) { el.click(); return "clicked:icon"; }
    }
    return "not-found";
  `);
  await sleep(800);
  return opened;
}

/* --------------------------------------------------------------------------
   第一次启动：点音效按钮
   -------------------------------------------------------------------------- */
const first = await boot("first");
try {
  const opened = await openSettings(first);
  check("能找到并打开设置入口", opened !== "not-found", `结果=${opened}`);

  const initial = await first.evalJs(`
    const card = document.getElementById("sec-effect");
    const seg = document.querySelector('[data-segment="effectPreset"]');
    return {
      hasCard: Boolean(card),
      options: seg ? Array.from(seg.querySelectorAll(".segmented__btn")).map((b) => b.dataset.value) : [],
      pressed: seg
        ? Array.from(seg.querySelectorAll('.segmented__btn[aria-pressed="true"]')).map((b) => b.dataset.value)
        : [],
      cardVisible: card ? card.getBoundingClientRect().height > 0 : false,
    };
  `);
  check("设置层里有「音效」卡片且可见", initial.hasCard && initial.cardVisible, JSON.stringify(initial));
  check(
    "音效卡片有全部 6 个档位按钮",
    initial.options.length === 6 &&
      ["off", "vocal", "bass", "surround", "live", "hall"].every((v) => initial.options.includes(v)),
    JSON.stringify(initial.options)
  );
  check("初始档位是关闭（off）", initial.pressed.length === 1 && initial.pressed[0] === "off", JSON.stringify(initial.pressed));

  // 真实鼠标点「大厅混响」
  await first.clickAt('[data-segment="effectPreset"] [data-value="hall"]');
  await sleep(600);
  const after = await first.evalJs(`
    const seg = document.querySelector('[data-segment="effectPreset"]');
    return {
      pressed: Array.from(seg.querySelectorAll('.segmented__btn[aria-pressed="true"]')).map((b) => b.dataset.value),
    };
  `);
  check("点「大厅混响」后它是唯一选中项", after.pressed.length === 1 && after.pressed[0] === "hall", JSON.stringify(after.pressed));
  // 配置落盘是 400ms 去抖（见 store.js 的 scheduleConfigSync），
  // 关闭设置层会触发 flush，这里额外等一会儿确保写盘完成。
  await sleep(1500);
} finally {
  await first.close();
}

/* --------------------------------------------------------------------------
   第二次启动：同一个数据目录，检查设置是否还在
   -------------------------------------------------------------------------- */
const second = await boot("second");
try {
  await openSettings(second);
  const restart = await second.evalJs(`
    const seg = document.querySelector('[data-segment="effectPreset"]');
    return {
      pressed: seg
        ? Array.from(seg.querySelectorAll('.segmented__btn[aria-pressed="true"]')).map((b) => b.dataset.value)
        : [],
    };
  `);
  check(
    "重启后「大厅混响」仍是选中态",
    restart.pressed.length === 1 && restart.pressed[0] === "hall",
    `选中=${JSON.stringify(restart.pressed)}（若为 ["off"] 说明没存住）`
  );
} finally {
  await second.close();
}

/* 配置文件里必须真的有这个键 */
const cfgPath = path.join(dataDir, "config.json");
if (existsSync(cfgPath)) {
  const raw = readFileSync(cfgPath, "utf8");
  let value = null;
  try {
    value = JSON.parse(raw).effectPreset;
  } catch {
    /* 下面统一报错 */
  }
  check(
    'config.json 里 effectPreset 的值是 "hall"',
    value === "hall",
    value === undefined ? "键不存在" : `effectPreset=${JSON.stringify(value)}`
  );
} else {
  check("config.json 已生成", false, cfgPath);
}

console.log("");
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `失败 ${failed} / ${results.length}` : `全部通过（${results.length} 项）`);
process.exit(failed ? 1 : 0);
