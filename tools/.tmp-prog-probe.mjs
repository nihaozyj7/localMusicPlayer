import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
const edge = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe","C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find(p=>fs.existsSync(p));
const PORT = 9365; const BASE = "http://127.0.0.1:5173/";
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
function get(path){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(d));}).on("error",rej);});}
const child = spawn(edge,["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--window-size=1440,900",`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\mp-probe-v`,"about:blank"],{stdio:"ignore"});
let target=null; for(let i=0;i<80;i++){await sleep(250);try{const l=JSON.parse(await get("/json/list"));target=l.find(t=>t.type==="page");if(target)break;}catch{}}
const ws=new WebSocket(target.webSocketDebuggerUrl); const pend=new Map(); let id=0;
const send=(m,p={})=>new Promise(r=>{id++;pend.set(id,r);ws.send(JSON.stringify({id,method:m,params:p}));});
ws.addEventListener("message",ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
await new Promise(r=>ws.addEventListener("open",r));
await send("Runtime.enable"); await send("Page.enable");
const evalx=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r?.exceptionDetails)return{__error:r.exceptionDetails.exception?.description||r.exceptionDetails.text};return r?.result?.value;};
await send("Page.navigate",{url:`${BASE}?probe=1&view=player&pv=arcanum&playing=1`});
await sleep(2600);
const res = await evalx(`(async () => {
  const line = document.querySelector('.ar-line[data-state="active"]');
  const u = [...line.querySelectorAll('.ar-unit')].find(x=>x.dataset.enterMode==='dissolve') || line.querySelector('.ar-unit');
  const a = u.getAnimations().find(an=>an.animationName);
  a.pause();
  const t = a.effect.getTiming();
  const out = {name:a.animationName, mode:u.dataset.enterMode, timing:{delay:t.delay,dur:t.duration,fill:t.fill}, ix:getComputedStyle(u).getPropertyValue('--ar-ix').trim()};
  out.rows = [];
  for (const ms of [0, 100, 200, 300, 400, t.duration]) {
    a.currentTime = ms;
    await new Promise(r=>requestAnimationFrame(r));
    const cs = getComputedStyle(u);
    const ct = a.effect.getComputedTiming();
    const r2 = u.getBoundingClientRect();
    out.rows.push({ms, progress:+(ct.progress??-1).toFixed(3), opacity:cs.opacity, transform:cs.transform, x:Math.round(r2.x), y:Math.round(r2.y)});
  }
  return out;
})()`);
console.log(JSON.stringify(res,null,2));
ws.close(); child.kill(); process.exit(0);
