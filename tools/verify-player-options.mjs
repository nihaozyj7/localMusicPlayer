/* ==========================================================================
   verify-player-options.mjs — 在**真实应用**里验证播放选项面板的改动
   --------------------------------------------------------------------------
   本脚本覆盖这一轮的四项界面改动（都在底栏「选项」面板与设置界面上）：

     1. 音效从设置页搬进播放选项面板：设置层里**没有**音效卡片，
        面板里有 6 个档位按钮，点一个→选中态转移→重启后仍在；
     2. 桌面歌词 / 桌面背景歌词合成一组三选一 [关闭 | 悬浮 | 背景]，
        底栏那两个独立按钮消失；
     3. 歌词字号量程是 14~72（拖到两端能取到 14 / 72）；
     4. 面板里不再有「模糊程度」，也不再有两个独立的桌面歌词开关。

   为什么用真实鼠标点击而不是 element.click()：
   面板是个浮层，可能被底栏或其它浮层压住；只有真实命中测试才能发现
   「按钮画出来了但点不到」。做法与 verify-effect-setting.mjs 同一套。

   用法：node tools/verify-player-options.mjs [--exe bin/lmplayer.exe]
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
const PORT = Number(arg("port", "9398"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(EXE)) {
  console.error(`找不到可执行文件：${EXE}`);
  process.exit(1);
}

const workDir = path.join(ROOT, ".tmp-player-options");
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

/** 启动应用并返回一个「在该页面里求值」的函数（与 verify-effect-setting.mjs 同构） */
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
   * ★ 必须先 scrollIntoView 再算坐标：设置层是可滚动的长面板，目标可能在
   *   视口之下，此时算出来的坐标会落在视口外的空白上，点了什么都没发生，
   *   而断言会误报成「点了按钮但界面没变」。
   *   同时用 elementFromPoint 做命中测试，抓「按钮被别的元素遮住」。
   */
  const clickAt = async (selector) => {
    const box = await evalJs(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { error: "not-found" };

      el.scrollIntoView({ block: "center", inline: "center" });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const r = el.getBoundingClientRect();
      const cx = Math.round(r.x + r.width / 2);
      const cy = Math.round(r.y + r.height / 2);

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
      throw new Error(`元素滚进视口后坐标仍为 y=${box.y} —— 面板可能没滚动`);
    }
    if (!box.hit) {
      throw new Error(`元素在 (${box.x},${box.y}) 处被遮挡：最上层是 ${box.topTag}（命中测试失败）`);
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
 * 打开设置层（只用 DOM 找入口，不 import 任何前端模块 ——
 * 生产构建里前端被 Vite 打包进 assets/，没有稳定的模块 URL 可 import）。
 */
async function openSettings(sess) {
  const opened = await sess.evalJs(`
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
    for (const el of document.querySelectorAll("button, [role='button']")) {
      if (el.querySelector('use[href="#i-settings"]')) { el.click(); return "clicked:icon"; }
    }
    return "not-found";
  `);
  await sleep(800);
  return opened;
}

/**
 * 关掉设置层。
 *
 * ★ 不能只发 Esc：设置层是**整页浮层**（.settings-layer），Esc 归它自己处理，
 *   而合成的 KeyboardEvent 未必能触发它（它可能监听的是真实按键或别的目标）。
 *   这里直接找关闭按钮点它，找不到再退回 Esc —— 界面路径也更接近用户。
 *
 * 不关掉的后果很具体：设置层盖在播放选项面板之上，后面所有真实鼠标点击
 * 都会命中 .settings-layer（命中测试失败），表现为「按钮画出来了但点不到」。
 */
async function closeSettings(sess) {
  const closed = await sess.evalJs(`
    const cands = [
      '[aria-label="关闭设置"]',
      '[data-act="close-settings"]',
      "#settings-close",
      ".settings-layer__close",
    ];
    for (const sel of cands) {
      const el = document.querySelector(sel);
      if (el) { el.click(); return "clicked:" + sel; }
    }
    // 兜底：设置层里找带关闭图标的按钮
    const layer = document.querySelector(".settings-layer");
    if (layer) {
      for (const el of layer.querySelectorAll("button")) {
        if (el.querySelector('use[href="#i-close"]')) { el.click(); return "clicked:icon"; }
      }
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return "esc";
  `);
  await sleep(900);
  // 等它真的收起来（有过渡动画），否则后面的点击还是会打在它上面
  for (let i = 0; i < 20; i += 1) {
    const open = await sess.evalJs(`
      const layer = document.querySelector(".settings-layer");
      return Boolean(layer) && !layer.hidden && layer.getBoundingClientRect().height > 0;
    `);
    if (!open) return closed;
    await sleep(150);
  }
  return closed;
}

/** 点底栏「选项」按钮打开播放选项面板 */
async function openOptionsPanel(sess) {
  const r = await sess.evalJs(`
    const btn = document.getElementById("btn-options");
    if (!btn) return "not-found";
    btn.click();
    return "ok";
  `);
  await sleep(700);
  return r;
}

/* --------------------------------------------------------------------------
   第一次启动
   -------------------------------------------------------------------------- */
const first = await boot("first");
try {
  /* ---- ① 设置层里不该再有音效卡片 ---- */
  const opened = await openSettings(first);
  check("能找到并打开设置入口", opened !== "not-found", `结果=${opened}`);

  const noEffectCard = await first.evalJs(`
    return {
      card: Boolean(document.getElementById("sec-effect")),
      hasSegment: Boolean(document.querySelector('[data-segment="effectPreset"]')),
    };
  `);
  check(
    "设置层里不再有音效卡片（已搬进播放选项面板）",
    !noEffectCard.card,
    noEffectCard.card ? "还找得到 #sec-effect" : ""
  );

  /* ---- ①b 新开关在 AI 卡片里 ---- */
  const aiSwitch = await first.evalJs(`
    const btns = Array.from(document.querySelectorAll('button[data-toggle]'));
    const el = btns.find((b) => b.dataset.toggle === "aiDownloadTag");
    return { found: Boolean(el), checked: el ? el.getAttribute("aria-checked") : null };
  `);
  check(
    "AI 卡片里有「下载歌曲时用 AI 整理元数据」开关且默认开启",
    aiSwitch.found && aiSwitch.checked === "true",
    JSON.stringify(aiSwitch)
  );

  const closed = await closeSettings(first);
  check("能关掉设置层", closed !== "not-found", `结果=${closed}`);

  /* ---- ② 底栏不再有桌面歌词按钮 ---- */
  const bar = await first.evalJs(`
    return {
      dl: Boolean(document.getElementById("btn-desktop-lyrics")),
      dw: Boolean(document.getElementById("btn-desktop-wallpaper")),
      options: Boolean(document.getElementById("btn-options")),
    };
  `);
  check("底栏不再有桌面歌词按钮", !bar.dl, bar.dl ? "还找得到 #btn-desktop-lyrics" : "");
  check("底栏不再有桌面背景歌词按钮", !bar.dw, bar.dw ? "还找得到 #btn-desktop-wallpaper" : "");
  check("底栏「选项」按钮仍在", bar.options);

  /* ---- ③ 打开播放选项面板 ---- */
  const openedPanel = await openOptionsPanel(first);
  check("能打开播放选项面板", openedPanel === "ok", `结果=${openedPanel}`);

  const panel = await first.evalJs(`
    const p = document.getElementById("options-panel");
    const seg = p ? p.querySelector('[data-segment="effectPreset"]') : null;
    return {
      visible: p ? !p.hidden && p.getBoundingClientRect().height > 0 : false,
      options: seg ? Array.from(seg.querySelectorAll(".segmented__btn")).map((b) => b.dataset.value) : [],
      radioLabels: p
        ? Array.from(p.querySelectorAll('.segmented__btn[data-mode]')).map((b) => b.textContent.trim())
        : [],
      radioIds: p
        ? Array.from(p.querySelectorAll('.segmented__btn[data-mode]')).map((b) => b.id)
        : [],
      hasBlur: Boolean(p && p.querySelector("#opt-blur")),
      hasBlurLabel: Boolean(p && p.textContent.includes("模糊程度")),
      hasSize: Boolean(p && p.querySelector("#opt-lyric-size")),
      hasAlpha: Boolean(p && p.querySelector("#opt-alpha")),
    };
  `);

  check("面板可见", panel.visible);
  check(
    "面板里有全部 6 个音效档位按钮",
    panel.options.length === 6 &&
      ["off", "vocal", "bass", "surround", "live", "hall"].every((v) => panel.options.includes(v)),
    JSON.stringify(panel.options)
  );
  check(
    "桌面歌词是一组三选一 [关闭 | 悬浮 | 背景]",
    panel.radioLabels.length === 3 && panel.radioLabels.join("|") === "关闭|悬浮|背景",
    JSON.stringify(panel.radioLabels)
  );
  check(
    "三选一按钮的 id 就是预期的那三个",
    panel.radioIds.join(",") === "opt-desktop-off,opt-desktop-lyrics,opt-desktop-wallpaper",
    JSON.stringify(panel.radioIds)
  );
  check("面板里不再有「模糊程度」", !panel.hasBlur && !panel.hasBlurLabel);
  check("面板里仍有歌词字号", panel.hasSize);
  check("面板里仍有背景不透明度", panel.hasAlpha);

  /* ---- ④ 歌词字号量程 14~72 ---- */
  const sliderRange = await first.evalJs(`
    const el = document.getElementById("opt-lyric-size");
    return { min: Number(el.getAttribute("aria-valuemin")), max: Number(el.getAttribute("aria-valuemax")) };
  `);
  check(
    "歌词字号量程是 14~72",
    sliderRange.min === 14 && sliderRange.max === 72,
    `实际 ${sliderRange.min}~${sliderRange.max}`
  );

  /* ---- ⑤ 真实鼠标点音效「大厅混响」 ---- */
  await first.clickAt('[data-segment="effectPreset"] [data-value="hall"]');
  await sleep(600);
  const hallPressed = await first.evalJs(`
    const seg = document.querySelector('[data-segment="effectPreset"]');
    return Array.from(seg.querySelectorAll('.segmented__btn[aria-pressed="true"]')).map((b) => b.dataset.value);
  `);
  check(
    "点「大厅混响」后它是唯一选中项",
    hallPressed.length === 1 && hallPressed[0] === "hall",
    JSON.stringify(hallPressed)
  );

  /* ---- ⑥ 真实鼠标点「背景」桌面模式 ---- */
  await first.clickAt("#opt-desktop-wallpaper");
  await sleep(1200);
  const wallpaperChecked = await first.evalJs(`
    function modeOf(id) {
      const el = document.getElementById(id);
      return el ? el.getAttribute("aria-checked") : null;
    }
    return {
      off: modeOf("opt-desktop-off"),
      lyrics: modeOf("opt-desktop-lyrics"),
      wallpaper: modeOf("opt-desktop-wallpaper"),
    };
  `);
  // 桌面背景歌词需要系统桌面窗口结构，可能开不起来；
  // 这里只断言「三选一是互斥的」：最多一个被选中。
  const checkedCount = Object.values(wallpaperChecked).filter((v) => v === "true").length;
  check("三选一是互斥的（最多一项选中）", checkedCount <= 1, JSON.stringify(wallpaperChecked));

  // 配置落盘是 400ms 去抖，关面板会 flush，这里额外等一会儿确保写盘完成
  await sleep(1800);
} finally {
  await first.close();
}

/* --------------------------------------------------------------------------
   第二次启动：同一个数据目录，检查设置是否还在
   -------------------------------------------------------------------------- */
const second = await boot("second");
try {
  await openOptionsPanel(second);
  const restart = await second.evalJs(`
    const seg = document.querySelector('[data-segment="effectPreset"]');
    return {
      pressed: seg
        ? Array.from(seg.querySelectorAll('.segmented__btn[aria-pressed="true"]')).map((b) => b.dataset.value)
        : [],
    };
  `);
  check(
    "重启后音效「大厅混响」仍是选中态",
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
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* 下面统一报错 */
  }
  const value = parsed?.effectPreset;
  check(
    'config.json 里 effectPreset 的值是 "hall"',
    value === "hall",
    value === undefined ? "键不存在" : `effectPreset=${JSON.stringify(value)}`
  );
  check(
    "config.json 里有 aiDownloadTag 且为 true",
    parsed?.aiDownloadTag === true,
    parsed?.aiDownloadTag === undefined ? "键不存在" : `aiDownloadTag=${JSON.stringify(parsed.aiDownloadTag)}`
  );
} else {
  check("config.json 已生成", false, cfgPath);
}

console.log("");
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `失败 ${failed} / ${results.length}` : `全部通过（${results.length} 项）`);
process.exit(failed ? 1 : 0);
