import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
const EDGE = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe","C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find((p) => fs.existsSync(p));
const PORT = 9394, BASE = "http://127.0.0.1:5173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (p) => new Promise((res, rej) => { http.get({ host: "127.0.0.1", port: PORT, path: p }, (r) => { let d=""; r.on("data",(c)=>(d+=c)); r.on("end",()=>res(d)); }).on("error", rej); });
const child = spawn(EDGE, ["--headless=new","--disable-gpu","--no-first-run","--window-size=1440,900",`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\mp-edge-shot3`,"about:blank"], { stdio: "ignore" });
let t=null;
for(let i=0;i<80;i+=1){ await sleep(250); try{const l=JSON.parse(await get("/json/list")); t=l.find(x=>x.type==="page"); if(t)break;}catch{} }
const ws=new WebSocket(t.webSocketDebuggerUrl);
const pend=new Map(); let id=0;
const send=(m,p={})=>new Promise(res=>{id+=1;pend.set(id,res);ws.send(JSON.stringify({id,method:m,params:p}));});
ws.addEventListener("message",ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
await new Promise(r=>ws.addEventListener("open",r));
await send("Runtime.enable"); await send("Page.enable");
await send("Page.navigate",{url:`${BASE}?probe=1&view=player&pv=arcanum&playing=1`});
await sleep(8000);
for (let i=0;i<2;i+=1){ const s=await send("Page.captureScreenshot",{format:"png"}); fs.writeFileSync(`docs/arc-${i+1}.png`, Buffer.from(s.data,"base64")); await sleep(1200); }
console.log("saved");
ws.close(); child.kill();
