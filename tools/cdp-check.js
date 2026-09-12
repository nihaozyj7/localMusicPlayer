/* ==========================================================================
   cdp-check.js — 用 CDP 打开页面，收集 console 错误并读取界面自检报告
   --------------------------------------------------------------------------
   用法：
     node tools/cdp-check.js                       # 跑全部内置场景
     node tools/cdp-check.js "<url>"               # 只跑单个 URL
   退出码：0 = 全部通过；1 = 存在错误或自检失败
   ========================================================================== */

const { spawn } = require("node:child_process");
const http = require("node:http");

const EDGE_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const fs = require("node:fs");
const edge = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
if (!edge) {
  console.error("找不到 Microsoft Edge");
  process.exit(2);
}

const PORT = 9333;
const BASE = process.env.PROBE_BASE || "http://127.0.0.1:5173/";

const SCENARIOS = [
  { name: "主界面 · 深色", url: "?probe=1" },
  { name: "主界面 · 浅色", url: "?probe=1&theme=light-minimal" },
  { name: "播放列表视图", url: "?probe=1&tab=queue" },
  { name: "歌单视图", url: "?probe=1&tab=playlist" },
  { name: "设置界面", url: "?probe=1&tab=settings" },
  { name: "播放界面 · 经典", url: "?probe=1&view=player&pv=classic&playing=1" },
  { name: "播放界面 · 沉浸", url: "?probe=1&view=player&pv=immersive&playing=1" },
  { name: "播放界面 · 简约", url: "?probe=1&view=player&pv=minimal&playing=1" },
  { name: "封面取色主题 · 沉浸", url: "?probe=1&theme=cover-dark&view=player&pv=immersive&playing=1" },
  { name: "搜索过滤", url: "?probe=1&query=%E9%99%88%E9%BB%98" },
  { name: "扫描中遮罩", url: "?probe=1&scan=1" },
  { name: "设置 · 过滤规则", url: "?probe=1&tab=settings&sec=filters" },
  { name: "设置 · 响度均衡", url: "?probe=1&tab=settings&sec=loudness" },
  { name: "设置 · 歌词", url: "?probe=1&tab=settings&sec=lyrics" },
];

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

/** 用 CDP 加载一个 URL，返回 { errors, probe } */
async function checkUrl(pageWs, send, url) {
  const events = [];
  const onMessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === "Runtime.consoleAPICalled") {
      if (msg.params.type === "error") {
        events.push((msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" "));
      } else if (msg.params.type === "warning") {
        events.push("WARN " + (msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" "));
      }
    } else if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      events.push(`EXCEPTION ${d.text} ${d.exception?.description || ""} @${d.url || ""}:${d.lineNumber}`);
    } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      const e = msg.params.entry;
      if (!/favicon/.test(e.text || "")) {
        const where = e.url || (e.stackTrace?.callFrames || []).map((f) => `${f.url}:${f.lineNumber}`).join("<");
        events.push(`LOG ${e.text} [${where}]`);
      }
    }
  };
  pageWs.addEventListener("message", onMessage);

  await send("Page.navigate", { url });
  await sleep(2200);

  const probe = await send("Runtime.evaluate", {
    expression: "document.getElementById('probe-report')?.textContent || ''",
    returnByValue: true,
  });

  // 诊断：列出页面上残留的行内 style（CSP 违规取证）
  const inline = await send("Runtime.evaluate", {
    expression: `Array.from(document.querySelectorAll('[style]')).slice(0, 12)
      .map(n => n.tagName + '.' + (n.className && typeof n.className === 'string' ? n.className : '') + ' => ' + n.getAttribute('style')).join(' || ')`,
    returnByValue: true,
  });

  pageWs.removeEventListener("message", onMessage);
  const keep = (e) => !/favicon/.test(e) && !/chrome-extension:\/\//.test(e);
  return {
    errors: events.filter((e) => !e.startsWith("WARN")).filter(keep),
    warnings: events.filter((e) => e.startsWith("WARN")).filter(keep),
    probe: probe?.result?.value || "",
    inline: inline?.result?.value || "",
  };
}

async function main() {
  const single = process.argv[2];
  const scenarios = single ? [{ name: "single", url: single }] : SCENARIOS;

  const child = spawn(
    edge,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      // 关掉 Edge 自带扩展/服务，避免它们的 content script 污染 console（例如注入行内样式）
      "--disable-extensions",
      "--disable-component-extensions-with-background-pages",
      "--disable-background-networking",
      "--disable-sync",
      "--disable-features=msEdgeSidebarV2,msEdgeShoppingAssistant,msEdgeIdentityFeature,msUndersideButton,msEdgeReadAloud,msEdgePdfDownloadButton",
      "--window-size=1440,900",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${process.env.TEMP}\\mp-edge-cdp`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let target = null;
  for (let i = 0; i < 80; i += 1) {
    await sleep(250);
    try {
      const list = JSON.parse(await get("/json/list"));
      target = list.find((t) => t.type === "page");
      if (target) break;
    } catch {
      /* 等待 DevTools 起来 */
    }
  }
  if (!target) {
    console.error("无法连接 DevTools");
    child.kill();
    process.exit(2);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      id += 1;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
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

  let failed = 0;
  for (const s of scenarios) {
    const url = s.url.startsWith("http") ? s.url : BASE + s.url;
    const { errors, warnings, probe, inline } = await checkUrl(ws, send, url);
    let report = null;
    try {
      report = probe ? JSON.parse(probe) : null;
    } catch {
      report = null;
    }

    const probeOk = report ? report.ok : false;
    const ok = errors.length === 0 && probeOk;
    if (!ok) failed += 1;

    console.log(`${ok ? "[OK ]" : "[!! ]"} ${s.name}`);
    if (errors.length) for (const e of errors) console.log(`        ERR ${e.slice(0, 620)}`);
    for (const w of warnings) console.log(`        WARN ${w.slice(0, 200)}`);
    if (inline) console.log(`        行内样式残留: ${inline}`);
    if (!report) console.log("        (没有自检报告：页面可能未加载完或抛异常)");
    else {
      console.log(
        `        theme=${report.theme} viewport=${report.viewport.vw}x${report.viewport.vh} rows=${report.info.trackRows} backdrop=${report.info.backdropFilter}`
      );
      for (const issue of report.issues) console.log(`        - ${issue}`);
    }
  }

  ws.close();
  child.kill();
  console.log("");
  console.log(failed ? `失败 ${failed} / ${scenarios.length}` : `全部通过（${scenarios.length} 个场景）`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("cdp-check 异常:", err);
  process.exit(2);
});
