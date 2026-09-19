import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
const edge = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe","C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find(p=>fs.existsSync(p));
const PORT = 9363; const BASE = "http://127.0.0.1:5173/";
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
function get(path){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(d));}).on("error",rej);});}
const child = spawn(edge,["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--window-size=1440,900",`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\mp-probe-z`,"about:blank"],{stdio:"ignore"});
let target=null; for(let i=0;i<80;i++){await sleep(250);try{const l=JSON.parse(await get("/json/list"));target=l.find(t=>t.type==="page");if(target)break;}catch{}}
const ws=new WebSocket(target.webSocketDebuggerUrl); const pend=new Map(); let id=0;
const send=(m,p={})=>new Promise(r=>{id++;pend.set(id,r);ws.send(JSON.stringify({id,method:m,params:p}));});
ws.addEventListener("message",ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
await new Promise(r=>ws.addEventListener("open",r));
await send("Runtime.enable"); await send("Page.enable");
const evalx=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r?.exceptionDetails)return{__error:r.exceptionDetails.exception?.description||r.exceptionDetails.text};return r?.result?.value;};
await send("Page.navigate",{url:`${BASE}?probe=1&view=player&pv=arcanum&playing=1`});
await sleep(2600);
const css = await evalx(`(() => {
  const out = {};
  for (const ss of document.styleSheets) {
    let rules; try { rules = ss.cssRules; } catch(e){ continue; }
    if(!rules) continue;
    for (const r of rules) {
      if (r.type === CSSRule.KEYFRAMES_RULE && (r.name==='ar-transmit'||r.name==='ar-summon')) {
        out[r.name] = [...r.cssRules].map(k=>({key:k.keyText, style:k.style.cssText}));
      }
    }
  }
  // 也给一下 active unit 上所有动画的来源
  const line = document.querySelector('.ar-line[data-state="active"]');
  const u = line.querySelector('.ar-unit');
  const cs = getComputedStyle(u);
  out._computed = { animationName: cs.animationName, animationFillMode: cs.animationFillMode, animationTiming: cs.animationTimingFunction, animationDuration: cs.animationDuration, opacity: cs.opacity };
  return out;
})()`);
console.log(JSON.stringify(css,null,2));
ws.close(); child.kill(); process.exit(0);
