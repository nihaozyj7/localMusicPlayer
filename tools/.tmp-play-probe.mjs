import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
const edge = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe","C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find(p=>fs.existsSync(p));
const PORT = 9364; const BASE = "http://127.0.0.1:5173/";
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
function get(path){return new Promise((res,rej)=>{http.get({host:"127.0.0.1",port:PORT,path},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(d));}).on("error",rej);});}
const child = spawn(edge,["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--window-size=1440,900",`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.env.TEMP}\\mp-probe-w`,"about:blank"],{stdio:"ignore"});
let target=null; for(let i=0;i<80;i++){await sleep(250);try{const l=JSON.parse(await get("/json/list"));target=l.find(t=>t.type==="page");if(target)break;}catch{}}
const ws=new WebSocket(target.webSocketDebuggerUrl); const pend=new Map(); let id=0;
const send=(m,p={})=>new Promise(r=>{id++;pend.set(id,r);ws.send(JSON.stringify({id,method:m,params:p}));});
ws.addEventListener("message",ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
await new Promise(r=>ws.addEventListener("open",r));
await send("Runtime.enable"); await send("Page.enable");
const evalx=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r?.exceptionDetails)return{__error:r.exceptionDetails.exception?.description||r.exceptionDetails.text};return r?.result?.value;};
await send("Page.navigate",{url:`${BASE}?probe=1&view=player&pv=arcanum&playing=1`});
await sleep(2600);
// 让页面自己强制重播当前句的入场，然后连续采样 6 个 unit 的 opacity/位置
const res = await evalx(`(async () => {
  const line = document.querySelector('.ar-line[data-state="active"]');
  const units = [...line.querySelectorAll('.ar-unit')].slice(0,6);
  // 重置：切走再切回来触发重播
  const samples = [];
  function snap(tag){
    samples.push({tag, us: units.map(u=>{const cs=getComputedStyle(u);const r=u.getBoundingClientRect();return {mode:u.dataset.enterMode,op:+cs.opacity, x:Math.round(r.x)};})});
  }
  // 用 WAAPI 精确控制：把每个 unit 的动画重头播，并在若干时间点采样
  const anims = units.map(u=>u.getAnimations().find(a=>a.animationName&&a.animationName.startsWith('ar-')));
  const dur = 843;
  const result = {modes: units.map(u=>u.dataset.enterMode)};
  result.frames = [];
  // 先取消所有再重播
  anims.forEach(a=>{ if(a){ a.cancel(); }});
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const anims2 = units.map(u=>u.getAnimations().find(a=>a.animationName&&a.animationName.startsWith('ar-')));
  for (const f of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    anims2.forEach(a=>{ if(a){ a.pause(); a.currentTime = 843*f; }});
    await new Promise(r=>requestAnimationFrame(r));
    result.frames.push({f, us: units.map(u=>{const cs=getComputedStyle(u);const r=u.getBoundingClientRect();return {op:+(+cs.opacity).toFixed(2), x:Math.round(r.x)};})});
  }
  return result;
})()`);
console.log(JSON.stringify(res,null,2));
ws.close(); child.kill(); process.exit(0);
