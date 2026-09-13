/* ==========================================================================
   settingscheck.mjs — 设置项「真的写进磁盘、重启还在」的验证
   --------------------------------------------------------------------------
   用户报过的 bug：设置 → 响度均衡 → 逐曲均衡，重启后又变回「关闭」。
   根因是前端推的 loudnessMode / loudnessTarget / loudnessLimit 三个键
   没有落到后端配置里。这类问题只有「真的重启一次」才能证伪，所以本脚本：

     1. 启动应用 → 通过后端接口写入设置
     2. 关掉应用，重新启动（同一个数据目录）
     3. 检查设置是否还在，以及配置文件里是否真的有这几个键

   用法：node tools/settingscheck.mjs [--exe bin/musicplayer.exe] [--port 9388]
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

const EXE = path.resolve(ROOT, arg("exe", "bin/musicplayer.exe"));
const PORT = Number(arg("port", "9388"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(EXE)) {
  console.error(`找不到可执行文件：${EXE}`);
  process.exit(1);
}

const workDir = path.join(ROOT, ".tmp-settingscheck");
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

/** 启动应用并返回一个「在该页面里求值」的函数 */
async function boot(label) {
  const logPath = path.join(workDir, `${label}.log`);
  const fd = openSync(logPath, "w");
  const child = spawn(EXE, [], {
    env: {
      ...process.env,
      MUSICPLAYER_DEBUG_PORT: String(PORT),
      WEBVIEW2_USER_DATA_FOLDER: path.join(workDir, `wv2-${label}`),
      MUSICPLAYER_DATA_DIR: dataDir,
      MUSICPLAYER_MUSIC_DIR: path.join(workDir, "Music"),
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
      throw new Error(`页面求值异常: ${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description || ""}`);
    }
    return res?.result?.value;
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

/* --------------------------------------------------------------------------
   第一次启动：写入设置
   -------------------------------------------------------------------------- */
const first = await boot("first");
try {
  const written = await first.evalJs(`
    const { backend } = await import("/js/bridge.js");
    const cfg = await backend.setConfig({
      loudnessMode: "track",
      loudnessTarget: -14,
      loudnessLimit: false,
      onlineCover: false,
    });
    return {
      mode: cfg?.loudnessMode,
      target: cfg?.loudnessTarget,
      limit: cfg?.loudnessLimit,
      onlineCover: cfg?.onlineCover,
      downloadDir: cfg?.downloadDir || "",
      rowClick: cfg?.rowClickAction,
      density: cfg?.listDensity,
      embedMeta: cfg?.embedMeta,
    };
  `);
  check("写入响度设置后后端立即返回新值", written.mode === "track" && written.target === -14 && written.limit === false, JSON.stringify(written));
  check("下载目录有默认值（系统音乐目录 / downloads）", /downloads$/i.test(written.downloadDir), written.downloadDir);

  // 新增的交互/在线设置也一起写进去（重启后一起验证）
  await first.evalJs(`
    const { backend } = await import("/js/bridge.js");
    await backend.setConfig({ rowClickAction: "append", listDensity: "roomy", embedMeta: true });
    return true;
  `);

  // 前端设置界面也要反映出来（避免「后端存了但界面还是旧值」）
  await first.evalJs(`
    const store = await import("/js/store.js");
    const cfg = await (await import("/js/bridge.js")).backend.getConfig();
    Object.assign(store.state.config, cfg);
    store.state.view = "settings";
    store.commit();
    return true;
  `);
  await sleep(300);
  // 设置现在是弹出层，不是视图
  await first.evalJs(`
    const shell = await import("/js/shell.js");
    shell.openSettings();
    return true;
  `);
  await sleep(600);
  const ui = await first.evalJs(`
    const btn = document.querySelector('[data-segment="loudnessMode"] [data-value="track"]');
    const layer = document.getElementById("settings-layer");
    return {
      exists: Boolean(btn),
      pressed: btn?.getAttribute("aria-pressed"),
      layerOpen: layer ? !layer.hidden : false,
      sections: Array.from(document.querySelectorAll(".settings__nav-item")).map((n) => n.textContent.trim()),
      hasOnlineCard: Boolean(document.getElementById("sec-online")),
      hasDensity: Boolean(document.querySelector('[data-segment="listDensity"] [data-value="roomy"]')),
      hasRowClick: Boolean(document.querySelector('[data-segment="rowClickAction"] [data-value="append"]')),
      hasEmbed: document.querySelector('[data-toggle="embedMeta"]')?.getAttribute("aria-checked"),
    };
  `);
  check("设置界面「逐曲均衡」按钮存在且为选中态", ui.exists && ui.pressed === "true", JSON.stringify(ui));
  check("设置界面有「在线歌曲」分区", ui.hasOnlineCard === true, JSON.stringify(ui.sections));
  check("设置以弹出层形式打开", ui.layerOpen === true, JSON.stringify({ layerOpen: ui.layerOpen }));
  check("新增设置项回显正确（单击行为/密度/写回文件）", ui.hasDensity && ui.hasRowClick && ui.hasEmbed === "true", JSON.stringify(ui));
} finally {
  await first.close();
}

/* --------------------------------------------------------------------------
   第二次启动：同一个数据目录，检查设置是否还在
   -------------------------------------------------------------------------- */
const second = await boot("second");
try {
  const after = await second.evalJs(`
    const { backend } = await import("/js/bridge.js");
    const cfg = await backend.getConfig();
    return {
      mode: cfg?.loudnessMode,
      target: cfg?.loudnessTarget,
      limit: cfg?.loudnessLimit,
      onlineCover: cfg?.onlineCover,
      rowClick: cfg?.rowClickAction,
      density: cfg?.listDensity,
      embedMeta: cfg?.embedMeta,
    };
  `);
  check(
    "重启后响度均衡模式仍是「逐曲均衡」",
    after.mode === "track",
    `loudnessMode=${JSON.stringify(after.mode)}（修复前这里会是 "off"）`
  );
  check("重启后目标响度仍是 -14", after.target === -14, `loudnessTarget=${after.target}`);
  check("重启后真峰值保护仍是关闭", after.limit === false, `loudnessLimit=${after.limit}`);
  check("重启后在线封面开关仍是关闭", after.onlineCover === false, `onlineCover=${after.onlineCover}`);
  check(
    "重启后单击行为/列表密度/写回文件都还在",
    after.rowClick === "append" && after.density === "roomy" && after.embedMeta === true,
    JSON.stringify({ rowClick: after.rowClick, density: after.density, embedMeta: after.embedMeta })
  );
} finally {
  await second.close();
}

/* 配置文件里必须真的有这几个键 */
const cfgPath = path.join(dataDir, "config.json");
if (existsSync(cfgPath)) {
  const raw = readFileSync(cfgPath, "utf8");
  const missing = [
    "loudnessMode",
    "loudnessTarget",
    "loudnessLimit",
    "downloadDir",
    "onlineCover",
    "embedMeta",
    "rowClickAction",
    "listDensity",
  ].filter((k) => !raw.includes(`"${k}"`));
  check("config.json 里写入了全部设置键", missing.length === 0, missing.length ? `缺少 ${missing.join(", ")}` : cfgPath);
} else {
  check("config.json 已生成", false, cfgPath);
}

console.log("");
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `失败 ${failed} / ${results.length}` : `全部通过（${results.length} 项）`);
process.exit(failed ? 1 : 0);
