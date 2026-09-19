import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
const edge = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe","C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find(p=>fs.existsSync(p));
const PORT = 9362; const BASE = "http://127.0.0.1:5173/";
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
function get(path){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(d));}).on("error",rej);});}
const child = spawn(edge,["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--window-size=1440,900",`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\mp-probe-y`,"about:blank"],{stdio:"ignore"});
let target=null; for(let i=0;i<80;i++){await sleep(250);try{const l=JSON.parse(await get("/json/list"));target=l.find(t=>t.type==="page");if(target)break;}catch{}}
const ws=new WebSocket(target.webSocketDebuggerUrl); const pend=new Map(); let id=0;
const send=(m,p={})=>new Promise(r=>{id++;pend.set(id,r);ws.send(JSON.stringify({id,method:m,params:p}));});
ws.addEventListener("message",ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
await new Promise(r=>ws.addEventListener("open",r));
await send("Runtime.enable"); await send("Page.enable");
const evalx=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r?.exceptionDetails)return{__error:r.exceptionDetails.exception?.description||r.exceptionDetails.text};return r?.result?.value;};
await send("Page.navigate",{url:`${BASE}?probe=1&view=player&pv=arcanum&playing=1`});
await sleep(2600);
// 暂停所有动画，把指定 unit 的入场动画定格在某个比例
const sample = await evalx(`(() => {
  const line = document.querySelector('.ar-line[data-state="active"]');
  const u = line.querySelectorAll('.ar-unit')[3]; // 挑一个远起点的
  const a = u.getAnimations().find(x=>x.animationName && x.animationName.startsWith('ar-'));
  const out = {name: a && a.animationName, key: u.dataset.enterMode, ix: getComputedStyle(u).getPropertyValue('--ar-ix').trim(), iy: getComputedStyle(u).getPropertyValue('--ar-iy').trim()};
  a.pause();
  const dur = a.effect.getTiming().duration;
  const frames = [];
  for (const f of [0,0.15,0.3,0.5,0.75,1]) {
    a.currentTime = dur*f;
    const cs = getComputedStyle(u);
    const r = u.getBoundingClientRect();
    frames.push({p:f, opacity:cs.opacity, tx:Math.round(r.x), ty:Math.round(r.y), transform: cs.transform.slice(0,60)});
  }
  out.frames = frames;
  return out;
})()`);
console.log(JSON.stringify(sample,null,2));
ws.close(); child.kill(); process.exit(0);
