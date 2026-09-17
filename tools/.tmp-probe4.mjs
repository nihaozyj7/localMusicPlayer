/* 临时探针：anime 的封面/标题/歌词换行 + arcanum 现状 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9383;
const BASE = "http://127.0.0.1:5173/";
const OUT = "C:\\Users\\Easecat\\Desktop\\项目合集\\音乐播放器\\.tmp-shots";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const get = (p) => new Promise((res, rej) => { http.get({ host: "127.0.0.1", port: PORT, path: p }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(d)); }).on("error", rej); });
const child = spawn(EDGE, ["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--disable-extensions","--disable-background-networking","--disable-sync","--window-size=1440,900","--remote-debugging-port="+PORT,"--user-data-dir="+process.env.TEMP+"\\mp-edge-probe4","about:blank"], { stdio: "ignore" });
let target = null;
for (let i = 0; i < 80; i += 1) { await sleep(250); try { const l = JSON.parse(await get("/json/list")); target = l.find((t) => t.type === "page"); if (target) break; } catch (e) {} }
if (!target) { child.kill(); process.exit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map(); let id = 0;
const send = (m, p = {}) => new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method: m, params: p })); });
const errors = [];
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; } if (m.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(m.params.exceptionDetails).slice(0,200)); if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push((m.params.args||[]).map((a)=>a.value??a.description??"").join(" ")); });
await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable"); await send("Page.enable");
const evaluate = async (e) => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r?.exceptionDetails) return { __error: r.exceptionDetails.exception?.description || r.exceptionDetails.text }; return r?.result?.value; };
const shot = async (n) => { const r = await send("Page.captureScreenshot", { format: "png" }); if (r?.data) fs.writeFileSync(OUT + "\\" + n + ".png", Buffer.from(r.data, "base64")); return Boolean(r?.data); };

await send("Page.navigate", { url: BASE + "?probe=1&view=player&pv=anime&playing=1" });
await sleep(3200);
const ANIME = [
  "(() => {",
  '  const q = (s) => document.querySelector(s);',
  '  const stage = q(".playerview__stage");',
  '  const cam = q(".an-cam");',
  '  const scene = q(".an-scene");',
  '  const panel = q(".an-panel");',
  '  const meta = q(".an-meta");',
  '  const lyrics = q(".an-lyrics");',
  '  const inner = q(".an-lyrics .fxl__inner");',
  '  const lines = [...document.querySelectorAll(".an-lyrics .fxl__line")];',
  '  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };',
  '  const wrap = lines.map((el) => {',
  '    const cs = getComputedStyle(el);',
  '    const rects = el.getClientRects().length;',
  '    return { state: el.dataset.state, text: (el.dataset.text || el.textContent || "").slice(0, 16), w: Math.round(el.getBoundingClientRect().width), sw: el.scrollWidth, cw: el.clientWidth, size: cs.fontSize, measure: getComputedStyle(inner).maxWidth, rects };',
  '  });',
  '  return {',
  '    stage: rect(stage), cam: rect(cam), scene: rect(scene), panel: rect(panel), meta: rect(meta), lyrics: rect(lyrics), inner: rect(inner),',
  '    sceneDisplay: scene ? getComputedStyle(scene).display : "",',
  '    lines: wrap,',
  '    sun: rect(q(".an-bg__sun")), speed: rect(q(".an-bg__speed")),',
  '  };',
  "})()",
].join("\n");
console.log("ANIME:", JSON.stringify(await evaluate(ANIME)));
await shot("probe-anime");
await send("Page.navigate", { url: BASE + "?probe=1&view=player&pv=arcanum&playing=1" });
await sleep(2600);
await shot("probe-arcanum");
console.log("errors:", JSON.stringify(errors.slice(0, 5)));
ws.close(); child.kill();
