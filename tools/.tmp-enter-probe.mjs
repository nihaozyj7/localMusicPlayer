import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";

const edge = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe","C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find(p=>fs.existsSync(p));
const PORT = 9361;
const BASE = process.env.PROBE_BASE || "http://127.0.0.1:5173/";
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
function get(path){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(d));}).on("error",rej);});}
const child = spawn(edge,["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--window-size=1440,900",`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\mp-probe-x`,"about:blank"],{stdio:"ignore"});
let target=null;
for(let i=0;i<80;i++){await sleep(250);try{const l=JSON.parse(await get("/json/list"));target=l.find(t=>t.type==="page");if(target)break;}catch{}}
const ws=new WebSocket(target.webSocketDebuggerUrl);
const pend=new Map();let id=0;
const send=(m,p={})=>new Promise(r=>{id++;pend.set(id,r);ws.send(JSON.stringify({id,method:m,params:p}));});
ws.addEventListener("message",ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
await new Promise(r=>ws.addEventListener("open",r));
await send("Runtime.enable");await send("Page.enable");
const evalx=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r?.exceptionDetails)return{__error:r.exceptionDetails.exception?.description||r.exceptionDetails.text};return r?.result?.value;};
await send("Page.navigate",{url:`${BASE}?probe=1&view=player&pv=arcanum&playing=1`});
await sleep(2600);
const info = await evalx(`(() => {
  const line = document.querySelector('.ar-line[data-state="active"]');
  if(!line) return {none:true};
  const units = [...line.querySelectorAll('.ar-unit')];
  const u = units[0];
  const cs = getComputedStyle(u);
  const inline = u.getAttribute('style')||'';
  const anims = (u.getAnimations?u.getAnimations():[]).map(a=>({name:a.animationName||a.id,delay:a.effect&&a.effect.getTiming?a.effect.getTiming().delay:'',dur:a.effect&&a.effect.getTiming?a.effect.getTiming().duration:'',play:a.playState,cur:a.currentTime}));
  return {
    enterMode: u.dataset.enterMode,
    dataMode: u.dataset.mode,
    arIx: cs.getPropertyValue('--ar-ix').trim(),
    arIy: cs.getPropertyValue('--ar-iy').trim(),
    arIs: cs.getPropertyValue('--ar-is').trim(),
    arIr: cs.getPropertyValue('--ar-ir').trim(),
    inlineHasIx: inline.includes('--ar-ix'),
    animName: cs.animationName,
    animDelay: cs.animationDelay,
    animDur: cs.animationDuration,
    anims,
    allEnterModes: units.map(x=>x.dataset.enterMode),
    rect: (()=>{const r=u.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};})()
  };
})()`);
console.log(JSON.stringify(info,null,2));
ws.close();child.kill();
process.exit(0);
