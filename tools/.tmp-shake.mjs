import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
const EDGE = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe","C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find((p) => fs.existsSync(p));
const PORT = 9392, BASE = "http://127.0.0.1:5173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (p) => new Promise((res, rej) => { http.get({ host: "127.0.0.1", port: PORT, path: p }, (r) => { let d=""; r.on("data",(c)=>(d+=c)); r.on("end",()=>res(d)); }).on("error", rej); });
const child = spawn(EDGE, ["--headless=new","--disable-gpu","--no-first-run","--window-size=1440,900",`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\mp-edge-shake`,"about:blank"], { stdio: "ignore" });
let t=null;
for(let i=0;i<80;i+=1){ await sleep(250); try{const l=JSON.parse(await get("/json/list")); t=l.find(x=>x.type==="page"); if(t)break;}catch{} }
const ws=new WebSocket(t.webSocketDebuggerUrl);
const pend=new Map(); let id=0;
const send=(m,p={})=>new Promise(res=>{id+=1;pend.set(id,res);ws.send(JSON.stringify({id,method:m,params:p}));});
ws.addEventListener("message",ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
await new Promise(r=>ws.addEventListener("open",r));
await send("Runtime.enable"); await send("Page.enable");
const ev=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true}); if(r?.exceptionDetails) return {__error:r.exceptionDetails.exception?.description}; return r?.result?.value;};
await send("Page.navigate",{url:`${BASE}?probe=1&view=player&pv=arcanum&playing=1`});
await sleep(7000);
// 高频采样"歌词层"的 transform 与当前句的 transform，算相邻帧的位移/缩放增量
// 跟踪**同一个** .ar-line 元素从 near/next 变成 active 的整个过程，
// 看它有没有"抖"（相邻帧位移过大）以及过渡是不是平滑单调地到位
const script = [
"(async () => {",
"  const runs = [];",
"  let tracked = null, log = [];",
"  const grab = (el) => { const m = getComputedStyle(el).transform.match(/matrix\\(([^)]+)\\)/); if (!m) return null; const v = m[1].split(',').map(Number); return { sc: v[0], x: v[4], y: v[5] }; };",
"  for (let i = 0; i < 260; i += 1) {",
"    await new Promise((r) => setTimeout(r, 16));",
"    const lines = [...document.querySelectorAll('.ar-line')];",
"    // 挑一个不是 active 的当跟踪目标",
"    if (!tracked) { tracked = lines.find((l) => l.dataset.state === 'next' || l.dataset.state === 'near'); continue; }",
"    if (!tracked.isConnected) { tracked = null; log = []; continue; }",
"    const g = grab(tracked);",
"    if (g) log.push({ st: tracked.dataset.state, ...g });",
"    if (tracked.dataset.state === 'active' && log.length > 6) { runs.push(log); log = []; tracked = null; }",
"    if (log.length > 140) { log = []; tracked = null; }",
"  }",
"  const out = runs.map((run) => { const steps = []; for (let i = 1; i < run.length; i += 1) steps.push({ dx: +(run[i].x - run[i-1].x).toFixed(2), dy: +(run[i].y - run[i-1].y).toFixed(2), ds: +(run[i].sc - run[i-1].sc).toFixed(4) }); const mx = (k) => Math.max(...steps.map((s) => Math.abs(s[k]))); const act = run.findIndex((r) => r.st === 'active'); return { frames: run.length, activeAt: act, maxDx: mx('dx'), maxDy: mx('dy'), maxDS: mx('ds'), first: run[0], mid: run[Math.floor(run.length/2)], last: run[run.length-1] }; });",
"  return { transitions: runs.length, out };",
"})()",
].join("\n");
const out = await ev(script);
console.log(JSON.stringify(out,null,1));
ws.close(); child.kill();
