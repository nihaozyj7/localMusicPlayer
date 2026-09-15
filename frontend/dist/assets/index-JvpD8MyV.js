const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/base-D9XwDejF.js","assets/bridge-CJD-9QGY.js"])))=>i.map(i=>d[i]);
import{d as $t,D as Ke,i as S,b as _,f as $o,g as A,h as Ct,o as se,j as oi,k as ht,l as Ue,n as Ts,q as ko,r as So,t as xo}from"./bridge-CJD-9QGY.js";import{j as Co,E as yt,D as hn,A as M,b as p,s as i,c as x,r as sr,a as he,d as te,M as me,e as f,f as To,p as ut,g as Re,h as Eo,k as Io,l as Do,m as Ao,n as Mo,L as Hn,o as it,q as kt,t as mn,u as Ot,v as Ge,w as kn,x as Na,y as Oo,z as Po,B as gn,C as ca,F as ar,G as Pt,H as da,I as ir,J as vs,K as Lo,N as li,O as qo,P as rr,Q as Sn,R as or,S as Ro,T as No,U as Bo,V as ua,W as pa,X as Fo,Y as lr,Z as an,_ as zo,$ as Uo,a0 as jo,a1 as Ho,a2 as cr}from"./base-D9XwDejF.js";import{r as xn,a as Lt,f as Ba,p as fa,S as Wo,l as Vo,u as Ko,b as Jt,s as Go,c as ha,m as Yo,d as ci}from"./index-CWAW7tVV.js";const Xo="modulepreload",Qo=function(t){return"/"+t},di={},pt=function(e,n,s){let a=Promise.resolve();if(n&&n.length>0){let c=function(d){return Promise.all(d.map(m=>Promise.resolve(m).then(h=>({status:"fulfilled",value:h}),h=>({status:"rejected",reason:h}))))};document.getElementsByTagName("link");const o=document.querySelector("meta[property=csp-nonce]"),l=o?.nonce||o?.getAttribute("nonce");a=c(n.map(d=>{if(d=Qo(d),d in di)return;di[d]=!0;const m=d.endsWith(".css"),h=m?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${d}"]${h}`))return;const g=document.createElement("link");if(g.rel=m?"stylesheet":Xo,m||(g.as="script"),g.crossOrigin="",g.href=d,l&&g.setAttribute("nonce",l),document.head.appendChild(g),m)return new Promise((y,$)=>{g.addEventListener("load",y),g.addEventListener("error",()=>$(new Error(`Unable to preload CSS for ${d}`)))})}))}function r(o){const l=new Event("vite:preloadError",{cancelable:!0});if(l.payload=o,window.dispatchEvent(l),!l.defaultPrevented)throw o}return a.then(o=>{for(const l of o||[])l.status==="rejected"&&r(l.reason);return e().catch(r)})};const Jo={CHILD:2},Fa=t=>(...e)=>({_$litDirective$:t,values:e});let za=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,n,s){this._$Ct=e,this._$AM=n,this._$Ci=s}_$AS(e,n){return this.update(e,n)}update(e,n){return this.render(...n)}};const{I:Zo}=Co,ui=t=>t,pi=()=>document.createComment(""),Kt=(t,e,n)=>{const s=t._$AA.parentNode,a=e===void 0?t._$AB:e._$AA;if(n===void 0){const r=s.insertBefore(pi(),a),o=s.insertBefore(pi(),a);n=new Zo(r,o,t,t.options)}else{const r=n._$AB.nextSibling,o=n._$AM,l=o!==t;if(l){let c;n._$AQ?.(t),n._$AM=t,n._$AP!==void 0&&(c=t._$AU)!==o._$AU&&n._$AP(c)}if(r!==a||l){let c=n._$AA;for(;c!==r;){const d=ui(c).nextSibling;ui(s).insertBefore(c,a),c=d}}}return n},Je=(t,e,n=t)=>(t._$AI(e,n),t),el={},dr=(t,e=el)=>t._$AH=e,tl=t=>t._$AH,Es=t=>{t._$AR(),t._$AA.remove()};const fi=(t,e,n)=>{const s=new Map;for(let a=e;a<=n;a++)s.set(t[a],a);return s},Ee=Fa(class extends za{constructor(t){if(super(t),t.type!==Jo.CHILD)throw Error("repeat() can only be used in text expressions")}dt(t,e,n){let s;n===void 0?n=e:e!==void 0&&(s=e);const a=[],r=[];let o=0;for(const l of t)a[o]=s?s(l,o):o,r[o]=n(l,o),o++;return{values:r,keys:a}}render(t,e,n){return this.dt(t,e,n).values}update(t,[e,n,s]){const a=tl(t),{values:r,keys:o}=this.dt(e,n,s);if(!Array.isArray(a))return this.ut=o,r;const l=this.ut??=[],c=[];let d,m,h=0,g=a.length-1,y=0,$=r.length-1;for(;h<=g&&y<=$;)if(a[h]===null)h++;else if(a[g]===null)g--;else if(l[h]===o[y])c[y]=Je(a[h],r[y]),h++,y++;else if(l[g]===o[$])c[$]=Je(a[g],r[$]),g--,$--;else if(l[h]===o[$])c[$]=Je(a[h],r[$]),Kt(t,c[$+1],a[h]),h++,$--;else if(l[g]===o[y])c[y]=Je(a[g],r[y]),Kt(t,a[h],a[g]),g--,y++;else if(d===void 0&&(d=fi(o,y,$),m=fi(l,h,g)),d.has(l[h]))if(d.has(l[g])){const w=m.get(o[y]),O=w!==void 0?a[w]:null;if(O===null){const C=Kt(t,a[h]);Je(C,r[y]),c[y]=C}else c[y]=Je(O,r[y]),Kt(t,a[h],O),a[w]=null;y++}else Es(a[g]),g--;else Es(a[h]),h++;for(;y<=$;){const w=Kt(t,c[$+1]);Je(w,r[y]),c[y++]=w}for(;h<=g;){const w=a[h++];w!==null&&Es(w)}return this.ut=o,dr(t,c),yt}}),hi="runtime-tokens",ft=new Map;function nl(){let t=document.getElementById(hi);return t||(t=document.createElement("style"),t.id=hi,document.head.appendChild(t)),t.sheet}function ur(){const t=nl();if(!t)return;for(let n=t.cssRules.length-1;n>=0;n-=1)t.deleteRule(n);if(!ft.size)return;const e=[...ft.entries()].map(([n,s])=>`${n}:${s} !important`).join(";");try{t.insertRule(`:root{${e}}`,0)}catch(n){console.warn("[runtime-tokens] 规则插入失败",n)}}function lt(t,e){e==null||e===""?ft.delete(t):ft.set(t,e),ur()}function vn(t){for(const[e,n]of Object.entries(t))n==null||n===""?ft.delete(e):ft.set(e,n);ur()}function sl(){return Object.fromEntries(ft)}const ts={fast:250,medium:500,slow:750};function ma(t){if(!t||t.animations===!1)return"0.001ms";const e=t.animationsSpeed;return!e||e==="fast"?null:`${ts[e]??ts.fast}ms`}function al(){return Math.round(Ft()*.6)}function Ft(){const t=getComputedStyle(document.documentElement).getPropertyValue("--dur").trim();if(!t)return ts.fast;const e=parseFloat(t);if(!Number.isFinite(e))return ts.fast;const n=t.endsWith("ms")?e:t.endsWith("s")?e*1e3:e;return Math.max(0,n)}function Ua(t,e){let n=document.getElementById(t);n||(n=document.createElement("style"),n.id=t,document.head.appendChild(n));const s=n.sheet;if(!s)return;for(let r=s.cssRules.length-1;r>=0;r-=1)s.deleteRule(r);if(!e)return;const a=il(e);for(const r of a)try{s.insertRule(r,s.cssRules.length)}catch(o){console.warn("[runtime-tokens] 跳过无效规则",r,o)}}function il(t){const e=[];let n=0,s="";for(const a of t)s+=a,a==="{"?n+=1:a==="}"&&(n-=1,n===0&&(e.push(s.trim()),s=""));return s.trim()&&e.push(s.trim()),e.filter(Boolean)}const mi=(t,e=document)=>e.querySelector(t);function ga(t,e=""){return p`<svg class=${e||M} aria-hidden="true"><use href="#i-${t}"></use></svg>`}function ja(t,e,n={}){let s=document.getElementById(t);if(!s){s=document.createElement("div"),s.id=t,s.className=e;for(const[a,r]of Object.entries(n))s.setAttribute(a,r);document.body.appendChild(s)}return s}const rl=()=>ja("menu","menu",{hidden:"",role:"menu"}),ol=()=>ja("modal-backdrop","modal-backdrop",{hidden:""}),ll=()=>ja("toasts","toasts",{"aria-live":"polite"});let Ze=null,Is=0,va=null;function bn({x:t,y:e,items:n,anchor:s,onPick:a,align:r="left"}){const o=rl(),l=++Is;Ze&&(clearTimeout(Ze),Ze=null);const c=C=>{Zt(),a?.(C)};hn(n.map(C=>{if(C.kind==="sep")return p`<div class="menu__sep"></div>`;if(C.kind==="label")return p`<div class="menu__label">${C.label}</div>`;const q=C.checked!==void 0?ga("check","menu__check"):null;return p`
        <button
          class=${C.danger?"menu__item menu__item--danger":"menu__item"}
          type="button"
          role="menuitem"
          data-id=${C.id}
          ?disabled=${!!C.disabled}
          aria-checked=${C.checked!==void 0?String(C.checked):M}
          @click=${()=>{C.disabled||c(C.id)}}
        >
          ${C.icon?ga(C.icon):M}<span>${C.label}</span>
          ${q||(C.hint?p`<span class="u-num u-dim">${C.hint}</span>`:M)}
        </button>`}),o),o.dataset.state="",o.hidden=!1;const d=o.getBoundingClientRect(),m=window.innerWidth,h=window.innerHeight;let g=t,y=e;if(s){const C=s.getBoundingClientRect();g=r==="right"?C.right-d.width:C.left,y=C.bottom+6,y+d.height>h-8&&(y=C.top-d.height-6)}g=Math.max(8,Math.min(g,m-d.width-8)),y=Math.max(8,Math.min(y,h-d.height-8)),o.style.left=`${g}px`,o.style.top=`${y}px`;const $=C=>{o.contains(C.target)||Zt()},w=C=>{C.key==="Escape"&&Zt()},O=()=>Zt();requestAnimationFrame(()=>{l===Is&&(o.dataset.state="open")}),setTimeout(()=>{document.addEventListener("pointerdown",$,!0),document.addEventListener("keydown",w),window.addEventListener("resize",O)},0),va=()=>{document.removeEventListener("pointerdown",$,!0),document.removeEventListener("keydown",w),window.removeEventListener("resize",O),va=null,o.dataset.state="closed",Ze&&clearTimeout(Ze),Ze=setTimeout(()=>{Ze=null,l===Is&&(o.hidden=!0,hn(M,o))},al()+20)}}function Zt(){va?.()}let et=null,Ds=0;function ee(t){const e=ol(),n=$t("ok");et&&(clearTimeout(et),et=null);const s=++Ds;let a=!1;const r=()=>{a||(a=!0,document.removeEventListener("keydown",d),e.dataset.state="closed",et&&clearTimeout(et),et=setTimeout(()=>{et=null,s===Ds&&(e.hidden=!0,hn(M,e))},Ft()+20))},o=async()=>{const g=e.querySelector(".modal");await t.onCancel?.(g)!==!1&&r()},l=g=>{const y={};return g.querySelectorAll("[data-field]").forEach($=>{y[$.dataset.field]=$.type==="checkbox"?$.checked:$.value}),y},c=async()=>{const g=e.querySelector(".modal"),y=await t.onOk?.(l(g),g);if(y!==!1){if(typeof y=="string"){const $=e.querySelector("#modal-error");$&&($.textContent=y,$.classList.remove("u-hidden"));return}r()}},d=g=>{g.key==="Escape"&&o(),g.key==="Enter"&&!g.shiftKey&&g.target.tagName!=="TEXTAREA"&&(g.preventDefault(),c())};hn(p`
      <div class="modal" role="dialog" aria-modal="true" aria-label=${t.title}>
        <div class="modal__head">${t.title}</div>
        ${t.desc?p`<div class="modal__desc">${t.desc}</div>`:M}
        <div class="modal__body">${t.body??M}</div>
        <div class="modal__error u-hidden" id="modal-error"></div>
        <div class="modal__foot">
          <button class="btn btn--ghost" type="button" @click=${o}>${t.cancelText||"取消"}</button>
          <button
            class=${t.danger?"btn btn--danger":"btn btn--primary"}
            type="button"
            id=${n}
            @click=${c}
          >
            ${t.okText||"确定"}
          </button>
        </div>
      </div>
    `,e),e.dataset.state="",e.hidden=!1,requestAnimationFrame(()=>{s===Ds&&(e.dataset.state="open")});const m=e.querySelector(".modal");e.onclick=g=>{g.target===e&&o()};const h=m.querySelector("input, select, textarea");return setTimeout(()=>h?.focus({preventScroll:!0}),30),document.addEventListener("keydown",d),{close:r,root:m}}let _t=[];function Mn(){hn(_t.map(t=>p`
        <div class="toast ${t.leaving?"is-leaving":""}" data-tone=${t.tone}>
          <span class="toast__dot"></span>
          ${t.icon?ga(t.icon):M}
          <span>${t.message}</span>
        </div>`),ll())}function u(t,{tone:e="info",duration:n=2800,icon:s=null}={}){const a={id:$t("toast"),message:t,tone:e,icon:s,leaving:!1};_t=[..._t,a],Mn();let r=null;const o=c=>{r&&clearTimeout(r),c>0&&(r=setTimeout(()=>l(),c))},l=()=>{const c=_t.find(d=>d.id===a.id);!c||c.leaving||(c.leaving=!0,Mn(),setTimeout(()=>{_t=_t.filter(d=>d.id!==a.id),Mn()},Ft()+20))};return o(n),{update(c,d=e){a.message=c,a.tone=d,Mn()},close(){l()}}}function cl(t){return t.currentSrc===Ke||t.src===Ke||t.getAttribute("src")===Ke}function dl(t){!t||t.dataset.coverFallback==="1"||(t.dataset.coverFallback="1",t.addEventListener("error",()=>{cl(t)||(t.src=Ke)},!0))}function ul(){let t=document.getElementById("app-tip");t||(t=document.createElement("div"),t.className="app-tip",t.id="app-tip",t.setAttribute("role","tooltip"),document.body.appendChild(t));let e=null;const n=()=>{const o=getComputedStyle(document.documentElement).getPropertyValue("--h-titlebar").trim(),l=parseFloat(o);return Number.isFinite(l)?l:36};function s(){if(!e)return;const o=e.getBoundingClientRect();t.style.left="0px",t.style.top="0px";const l=t.offsetWidth,c=t.offsetHeight,d=window.innerWidth,m=window.innerHeight,h=n();let g=o.left+o.width/2-l/2,y=o.top-c-6;y<h+4&&(y=o.bottom+6),g=Math.max(8,Math.min(g,d-l-8)),y=Math.max(h+4,Math.min(y,m-c-8)),t.style.left=`${g}px`,t.style.top=`${y}px`}function a(o){const l=o?.getAttribute?.("data-tip");if(!l){r();return}t.textContent=l,t.dataset.visible="true",e=o,s()}function r(){delete t.dataset.visible,e=null}document.addEventListener("mouseover",o=>{const l=o.target.closest?.("[data-tip]");l?a(l):r()}),document.addEventListener("mouseout",o=>{const l=o.target.closest?.("[data-tip]");l&&!l.contains(o.relatedTarget)&&r()}),document.addEventListener("pointerdown",r,!0),window.addEventListener("scroll",r,!0),window.addEventListener("resize",r)}const pl=[{id:"dark-minimal",name:"深色 · 黑白极简",mode:"dark",builtin:!0,swatch:["#08080a","#1b1b1f","#3a3a42","#f4f4f6","#ff4d6d"]},{id:"light-minimal",name:"浅色 · 黑白极简",mode:"light",builtin:!0,swatch:["#f2f2f4","#ffffff","#d8d8dd","#14141a","#e8384f"]},{id:"cover-dark",name:"封面取色 · 深色",mode:"dark",builtin:!0,swatch:["#0b0b12","#2a2a31","#6b6b76","#f7f7fa","#ff4d6d"]}],J=pl.slice();let pr=0;function fl(){return pr}function bs(){return J}function ns(t){return J.find(e=>e.id===t)||J[0]}async function ys(){if(!S())return J;try{const t=await _.listThemes();if(!Array.isArray(t)||!t.length)return J;for(const e of t){if(!e?.id)continue;const n=await _.loadTheme(e.id);typeof n=="string"&&n.trim()&&gl(e.id,n)}hl(t)}catch(t){console.warn("[theme] 主题目录扫描失败",t)}return J}function hl(t){const e=[],n=new Set;for(const s of t){if(!s?.id||n.has(s.id))continue;n.add(s.id);const a={id:s.id,name:s.name||s.id,mode:s.mode||"dark",swatch:Array.isArray(s.swatch)?s.swatch:[],builtin:!!s.builtin},r=J.find(o=>o.id===s.id);r?(Object.assign(r,a),e.push(r)):e.push(a)}for(const s of J)e.includes(s)||Ua(`theme-file-${s.id}`,"");return J.length=0,J.push(...e),pr+=1,J}async function ml(t){return await _.deleteTheme(t),await ys(),{removed:!J.some(n=>n.id===t),themeIds:J.map(n=>n.id)}}function gl(t,e){Ua(`theme-file-${t}`,e)}const vl=["--seed","--seed-2","--bg-app","--bg-window"],bl=["--seed","--seed-2"];function yl(t){return document.documentElement.style.getPropertyValue(t).trim()?String(document.documentElement.style.getPropertyValue(t)):null}function _l(){const t=document.documentElement,e={};for(const n of bl){const s=yl(n);s&&(e[n]=s)}for(const n of vl)t.style.removeProperty(n);return e}const Wn="cover-dark";function yn(t){return!!t&&!$o(t)}let gi=null,As=null,Ms=null;async function Ie(t){const e=document.documentElement,n=window.matchMedia("(prefers-color-scheme: dark)").matches,s=_l();s["--seed"]&&(As=s["--seed"]),s["--seed-2"]&&(Ms=s["--seed-2"]);let a=t.theme||"dark-minimal";if(t.themeMode==="system"){const h=n?"dark":"light",g=J.find(y=>y.mode===h&&y.id!=="cover-dark");g&&(a=g.id)}else if(J.find(h=>h.id===a)?.mode!==t.themeMode){const h=J.find(g=>g.mode===t.themeMode&&g.id!=="cover-dark");h&&(a=h.id)}e.dataset.theme=a,e.dataset.mode=J.find(h=>h.id===a)?.mode||t.themeMode||"dark",t.theme=a;const r=vi(t,a),o=vi(t,a,!0),l=t.accentFromCover!==!1;(t.accentFromCover===!1||gi!==null&&a!==Wn)&&(As=null,Ms=null);const d=r??(l?As:null),m=o??Ms??d;return vn({"--glass-blur":t.glassBlurCustom?`${t.glassBlur}px`:null,"--dur":ma(t),"--seed":d,"--seed-2":m}),gi=d&&a===Wn?Wn:null,$l(),t.glassAlphaCustom&&Ha(t.glassAlpha),a}function vi(t,e,n=!1){return!t||t.accentFromCover!==!0||e!=="cover-dark"?null:qt(n?t.coverSeed2:t.coverSeed)||null}async function wl(){const e=ns(i.config.theme)?.mode==="light"?"dark":"light";i.config.themeMode=e,await Ie(i.config),x(),u(e==="dark"?"已切换到深色主题":"已切换到浅色主题",{duration:1500})}let mt=null;function Vn(t){return mt||(mt=document.createElement("div"),mt.style.cssText="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;",document.body.appendChild(mt)),mt.style.backgroundColor=t,getComputedStyle(mt).backgroundColor}function Os(t,e){const n=Math.max(0,Math.min(1,e)),s=String(t),a=s.match(/rgba?\(([^)]+)\)/);if(a){const o=a[1].split(/[,/]/).map(m=>parseFloat(m.trim())),[l,c,d]=o;if([l,c,d].every(m=>Number.isFinite(m)))return`rgba(${Math.round(l)}, ${Math.round(c)}, ${Math.round(d)}, ${n})`}const r=s.match(/color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);if(r){const[o,l,c]=r.slice(1,4).map(d=>Math.round(parseFloat(d)*255));if([o,l,c].every(d=>Number.isFinite(d)))return`rgba(${o}, ${l}, ${c}, ${n})`}return null}function ba(){const t=String(Vn("var(--glass-bg)")),e=t.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/),n=t.match(/\/\s*([\d.]+)\s*\)/),s=parseFloat(e&&e[1]||n&&n[1]||"");return Number.isFinite(s)?Math.round(s*100):62}function Ha(t){const e=Math.max(0,Math.min(1,(Number(t)||0)/100));vn({"--glass-bg":null,"--glass-bg-strong":null,"--glass-bg-weak":null});const n=Vn("var(--glass-bg)"),s=Vn("var(--glass-bg-strong)"),a=Vn("var(--glass-bg-weak)");vn({"--glass-bg":Os(n,e),"--glass-bg-strong":Os(s,Math.min(1,e+.18)),"--glass-bg-weak":Os(a,Math.max(0,e-.22))})}function $l(){const t=document.body;t&&(t.dataset.styleEpoch=String((Number(t.dataset.styleEpoch)||0)+1))}function ya(){const t=getComputedStyle(document.documentElement).getPropertyValue("--glass-blur"),e=parseFloat(t);return Number.isFinite(e)?e:22}function qt(t){const e=String(t??"").trim();if(!e)return"";const n=e.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);if(n){let a=n[1].toLowerCase();return a.length===3&&(a=a[0]+a[0]+a[1]+a[1]+a[2]+a[2]),`#${a}`}const s=e.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);if(s){const a=r=>Math.max(0,Math.min(255,Math.round(Number(r)))).toString(16).padStart(2,"0");return`#${a(s[1])}${a(s[2])}${a(s[3])}`}return""}let bi="";function kl(t){const e=document.documentElement.dataset.theme||"",n=typeof t=="string"?t.trim():"",s=e===Wn?n:"";s!==bi&&(bi=s,vn({"--cover-bg":s?`url("${s.replace(/["\\]/g,"\\$&")}")`:null}))}function Sl(t,e){const n=qt(t),s=qt(e)||n;return n?(vn({"--seed":n,"--seed-2":s}),i.config.coverSeed!==n||i.config.coverSeed2!==s?(i.config.coverSeed=n,i.config.coverSeed2=s,Cl(),!0):!1):!1}const xl="music-player.cover-seed.v1";function Cl(){try{localStorage.setItem(xl,JSON.stringify({seed:i.config.coverSeed||"",seed2:i.config.coverSeed2||"",theme:i.config.theme||""}))}catch{}}function yi(t){try{const e=document.createElement("canvas"),n=32;e.width=n,e.height=n;const s=e.getContext("2d",{willReadFrequently:!0});s.drawImage(t,0,0,n,n);const{data:a}=s.getImageData(0,0,n,n);let r=0,o=0,l=0,c=0,d=0,m=0,h=0,g=0;for(let $=0;$<a.length;$+=4){if(a[$+3]<8)continue;const w=a[$],O=a[$+1],C=a[$+2];d+=w,m+=O,h+=C,g+=1;const q=Math.max(w,O,C),ae=Math.min(w,O,C);if(q<26)continue;const Y=q===0?0:(q-ae)/q;if(Y<.12)continue;const ge=Y*Y*(.35+q/255);r+=w*ge,o+=O*ge,l+=C*ge,c+=ge}const y=c>0?[r/c,o/c,l/c]:g>0?[d/g,m/g,h/g]:null;return y?`rgb(${y.map($=>Math.round(Math.max(0,Math.min(255,$)))).join(", ")})`:null}catch{return null}}function Ps(){i.query="",x()}function Tt(t,e=null){if(i.settingsOpen&&ss(),t==="settings"){fr();return}i.view=t,i.playlistId=t==="playlist"?e:null,i.playerOpen=!1,i.query="",i.playlistSelecting=!1,i.selectedIds=new Set,i.queueOpen=!1,x()}function fr(t=null){i.settingsOpen=!0,t&&(i.settingsSection=t),x()}function ss(){i.settingsOpen=!1,x()}function Tl(t=null){i.settingsOpen?ss():fr(t)}function hr(){return i.settingsOpen===!0}function El(){i.settingsOpen&&(i.settingsRev=(i.settingsRev||0)+1,x(),he())}async function _n({manual:t=!1}={}){if(!i.scanning){i.scanText="正在扫描音乐文件夹…",x();try{const e=await sr({silent:!t});e&&u(`扫描完成：保留 ${A(e.kept)} 首${e.excluded?`，过滤 ${A(e.excluded)} 个`:""}${e.added?`，新增 ${A(e.added)}`:""}${e.removed?`，移除 ${A(e.removed)}`:""}`,{tone:"success",duration:3600})}finally{i.scanning=!1,x()}}}const mr="music-player.search.history.v1",Il=20;function Ls(){try{const t=localStorage.getItem(mr),e=t?JSON.parse(t):[];return Array.isArray(e)?e.filter(n=>typeof n=="string"&&n.trim()):[]}catch{return[]}}function qs(t){try{localStorage.setItem(mr,JSON.stringify(t.slice(0,Il)))}catch{}}const R={keyword:"",seq:0,results:[],query:"",loading:!1,message:"",rev:0};function Se(){R.rev+=1,he()}class Dl extends me{static deps=e=>[e.searchOpen,R.rev];get panelEl(){return this.querySelector("#search-overlay")}updated(){const e=this.panelEl;if(e){if(i.searchOpen){this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden&&(e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{i.searchOpen&&(e.dataset.state="opened")}),requestAnimationFrame(()=>{const n=this.querySelector("#search-input");n?.focus(),n?.select()}));return}e.hidden||(e.dataset.state="closed",this._closeTimer||(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!i.searchOpen&&e&&(e.hidden=!0)},260)))}}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),super.disconnectedCallback()}render(){const e=R,n=Ls(),s=!!e.keyword.trim();return p`
      <section
        class="search-overlay"
        id="search-overlay"
        data-state="closed"
        hidden
        aria-label="搜索"
        @click=${a=>this.onClick(a)}
        @keydown=${a=>this.onKey(a)}
      >
        <div class="search-overlay__panel" role="dialog" aria-modal="true" aria-label="搜索">
          <div class="search-overlay__search">
            <div class="search-overlay__field">
              ${f("search","search-overlay__search-icon")}
              <input
                class="search-overlay__input"
                id="search-input"
                type="text"
                placeholder="输入关键词后按回车搜索"
                autocomplete="off"
                spellcheck="false"
                aria-label="搜索关键词"
                .value=${e.keyword}
                @input=${a=>{R.keyword=a.target.value,Se()}}
                @keydown=${a=>{a.key==="Enter"&&(a.preventDefault(),this.submitSearch()),a.key==="Escape"&&(a.preventDefault(),R.keyword.trim()?this.clearSearch({focus:!0}):Kn())}}
              />
              <button
                class="search-overlay__clear"
                id="search-clear"
                type="button"
                data-tip="清空搜索"
                aria-label="清空搜索"
                ?hidden=${!s}
                @click=${()=>this.clearSearch({focus:!0})}
              >${f("close")}</button>
            </div>
            <button
              class="search-overlay__close"
              type="button"
              data-search-close
              data-tip="关闭（结果会保留）"
              aria-label="关闭搜索"
              @click=${()=>Kn()}
            >${f("close")}</button>
          </div>

          <div class="search-overlay__history" id="search-history" ?hidden=${s||!n.length}>
            ${!s&&n.length?p`
                  <div class="search-overlay__history-title">
                    <span>搜索历史</span>
                    <button type="button" class="search-overlay__history-clear" data-history-act="clear" @click=${()=>this.clearHistory()}>清空</button>
                  </div>
                  <div class="search-overlay__history-list">
                    ${n.map(a=>p`
                        <span class="search-overlay__history-chip" data-history-keyword=${a}>
                          <button type="button" class="search-overlay__history-key" data-history-act="use" @click=${()=>this.useHistory(a)}>${a}</button>
                          <button
                            type="button"
                            class="search-overlay__history-del"
                            data-history-act="del"
                            aria-label="删除「${a}」"
                            @click=${()=>this.removeHistory(a)}
                          >${f("close")}</button>
                        </span>
                      `)}
                  </div>
                `:M}
          </div>

          <div class="search-overlay__head">
            <span class="search-overlay__headline" id="search-headline">${this.headline()}</span>
          </div>
          <div class="search-overlay__body" id="search-body">${this.bodyContent()}</div>
        </div>
      </section>
    `}headline(){const e=R;return e.loading?"搜索中…":e.query?`在线「${e.query}」${A(e.results.length)} 个结果`:""}bodyContent(){const e=R;return e.loading?p`<div class="search-overlay__loading"><span class="search-overlay__spinner"></span>正在搜索「${e.keyword.trim()}」…</div>`:e.message?this.empty(e.message):e.results.length?Ee(e.results,n=>n.id,n=>p`
        <div
          class="search-row"
          data-search-id=${n.id}
          data-search-online="1"
          role="button"
          tabindex="0"
          @click=${()=>Rs(n.id)}
        >
          <span class="search-row__cover">
            ${n.coverUrl?p`<img src=${n.coverUrl} alt="" loading="lazy" />`:p`<span class="search-row__cover-fallback">${f("music")}</span>`}
          </span>
          <span class="search-row__main">
            <span class="search-row__title">${n.title||"未命名"}</span>
            <span class="search-row__sub">${n.artist||"未知"} · ${Ct(n.duration)}</span>
          </span>
          <span class="search-row__actions">
            <button
              class="btn btn--sm btn--primary"
              type="button"
              data-search-act="preview"
              data-id=${n.id}
              @click=${s=>{s.stopPropagation(),Rs(n.id)}}
            >${f("play")}<span>试听</span></button>
            <button
              class="btn btn--sm"
              type="button"
              data-search-act="download"
              data-id=${n.id}
              @click=${s=>{s.stopPropagation(),Ol(n)}}
            >${f("file")}<span>下载</span></button>
          </span>
        </div>
      `):this.empty(e.query?"没有搜到在线歌曲，换个关键词试试":"输入关键词后按回车搜索在线歌曲")}empty(e){return p`<div class="search-overlay__empty">${f("search")}<span>${e}</span></div>`}onClick(e){(e.target.closest("[data-search-close]")||e.target===this.panelEl)&&Kn()}onKey(e){if(e.key!=="Enter"&&e.key!==" ")return;const n=e.target.closest?.("[data-search-id]");n&&(e.preventDefault(),Rs(n.dataset.searchId))}addHistory(e){const n=(e||"").trim();if(!n)return;const s=Ls().filter(a=>a!==n);s.unshift(n),qs(s),Se()}removeHistory(e){qs(Ls().filter(n=>n!==e)),Se()}clearHistory(){qs([]),Se()}useHistory(e){R.keyword=e,Se(),this.submitSearch()}submitSearch(){const e=(R.keyword||"").trim();if(!e){this.clearSearch({focus:!0});return}this.addHistory(e),this.runOnlineSearch(e)}clearSearch({focus:e=!1}={}){R.keyword="",R.results=[],R.query="",R.message="",R.loading=!1,R.seq+=1,Se(),e&&requestAnimationFrame(()=>this.querySelector("#search-input")?.focus())}async runOnlineSearch(e){R.query="",R.results=[],R.message="",R.loading=!0,Se();const n=++R.seq;if(!S()){R.loading=!1,R.message="浏览器预览下没有在线搜索后端，请在应用里试",Se();return}try{const s=await _.onlineSearch(e,1,24);if(n!==R.seq)return;R.results=Array.isArray(s)?s:[],R.query=e,R.loading=!1,Se()}catch(s){if(n!==R.seq)return;R.results=[],R.query=e,R.loading=!1,R.message=`在线搜索失败：${s?.message??s}`,Se()}}}te("mp-search-overlay",Dl);function Al(t){!i.searchOpen?gr():Kn()}function gr(){i.searchOpen=!0,x()}function Kn(){i.searchOpen=!1,x()}function Ml(){document.addEventListener("keydown",t=>{!(t.ctrlKey||t.metaKey)||t.key.toLowerCase()!=="f"||(t.preventDefault(),gr())})}function Rs(t){const e=R.results.find(r=>r.id===t);if(!e)return;const n=To({id:e.id,title:e.title||"未命名",artist:e.artist||"未知",album:e.album||"在线",ext:e.ext||"m4a",duration:e.duration||0,size:0,sampleRate:0,bitrate:0,addedAt:Date.now(),playCount:0,path:"",cover:"",coverUrl:e.coverUrl||"",streamUrl:e.streamUrl||"",downloadUrl:e.downloadUrl||"",bvid:e.bvid||"",online:!0}),s=i.queue.includes(n.id)?i.queue.slice():[...i.queue,n.id],a=s.indexOf(n.id);ut(s,a,{type:"online",id:null}),u(`已加入播放列表并开始试听：${n.title}`,{tone:"success",duration:2200})}async function Ol(t){if(!S()){u("浏览器预览无法下载",{tone:"warning"});return}try{const e=await _.downloadStart(t.bvid||String(t.id).replace(/^bili:/,""),t.title||"",t.duration||0);if(!e?.started){u(e?.reason==="already-running"?"这首歌正在下载中":"无法开始下载",{tone:"warning"});return}u(`开始下载到 ${e.dir}`,{duration:2600})}catch(e){u(`下载失败：${e?.message??e}`,{tone:"error",duration:6e3})}}let Le=[],as=!1,vr=0,Ns=0;function Et(){vr+=1,he()}function rn(){const t=Le.filter(e=>e?.state==="running").length;return{tasks:Le,running:t,revision:vr,open:as,visible:Le.length>0,badge:t>0?String(t):""}}function br(t){as=typeof t=="boolean"?t:!as,Et()}function Pl(){br(!1)}async function Ll(){if(!S()){Le=Le.filter(t=>t?.state==="running"),Et();return}try{const t=await _.downloadClearFinished();_a(t)}catch(t){u(`清除失败：${t?.message??t}`,{tone:"error"})}}function ql(){const t=Le.find(e=>e?.dir)?.dir||"";_.downloadOpenDir(t).catch(e=>u(`打开目录失败：${e?.message??e}`,{tone:"error"}))}function Rl(t){const e=Le.find(s=>s.id===t),n=e?.path||e?.dir;n&&_.downloadOpenDir(n).catch(s=>u(`打开失败：${s?.message??s}`,{tone:"error"}))}function _a(t){!t||!Array.isArray(t.tasks)||(Le=t.tasks,Et())}async function Nl(){if(se("download:tasks",e=>{Ns+=1,_a(e)}),!S()){if(Bl()){Et(),as=!0,Et();return}Et();return}const t=Ns;try{const e=await _.downloadTasks();Ns===t&&_a(e)}catch(e){console.info("[downloads] 拉取下载任务失败",e?.message??e)}}function Bl(){return S()||new URLSearchParams(location.search).get("downloads")!=="1"?!1:(Le=[{id:"preview-1",bvid:"BV1xx411c7mD",title:"晴天 - 周杰伦",state:"running",done:231e4,total:47e5,dir:"C:\\Users\\Me\\Music\\downloads"},{id:"preview-2",bvid:"BV1yy411c7mE",title:"孤勇者 - 陈奕迅",state:"done",done:39e5,total:39e5,path:"C:\\Users\\Me\\Music\\downloads\\孤勇者 - 陈奕迅.m4a",dir:"C:\\Users\\Me\\Music\\downloads"},{id:"preview-3",bvid:"BV1zz411c7mF",title:"一首标题很长很长、长到面板里必须被省略号截断的测试歌曲",state:"failed",done:12e4,total:5e6,message:"下载到的内容为空",dir:"C:\\Users\\Me\\Music\\downloads"}],!0)}class Fl extends me{static deps=()=>{const n=ns(i.config.theme)?.mode!=="light",s=rn();return[n,i.config.themeMode,i.searchOpen,s.visible,s.badge]};render(){const n=ns(i.config.theme)?.mode!=="light",s=rn();return p`
      <header class="titlebar" id="titlebar">
        <div class="titlebar__brand">
          <svg class="titlebar__logo"><use href="#i-music"></use></svg>
          <span>音乐播放器</span>
        </div>
        <span class="titlebar__sep"></span>
        <div class="titlebar__drag"></div>
        <div class="titlebar__actions">
          <button
            class="titlebar__btn"
            id="btn-search"
            type="button"
            data-tip="搜索（Ctrl+F）"
            aria-label="搜索"
            aria-pressed=${String(i.searchOpen)}
            @click=${()=>Al()}
          >
            ${f("search")}
          </button>
          <button
            class="titlebar__btn titlebar__btn--download"
            id="btn-downloads"
            type="button"
            data-tip="下载任务"
            aria-label="下载任务"
            aria-pressed="false"
            ?hidden=${!s.visible}
            @click=${()=>br()}
          >
            ${f("download")}
            <span class="titlebar__badge" id="download-badge" ?hidden=${!s.badge}>${s.badge}</span>
          </button>
          <button
            class="titlebar__btn"
            id="btn-theme-toggle"
            type="button"
            data-tip=${n?"切换到浅色":"切换到深色"}
            aria-label="切换深浅色"
            @click=${()=>wl()}
          >
            ${f(n?"sun":"moon")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-settings"
            type="button"
            data-tip="设置"
            aria-label="设置"
            @click=${()=>Tl()}
          >
            ${f("settings")}
          </button>
          <button class="titlebar__btn" id="btn-win-min" type="button" aria-label="最小化" @click=${()=>Bs("min")}>
            ${f("minimize")}
          </button>
          <button class="titlebar__btn" id="btn-win-max" type="button" aria-label="最大化" @click=${()=>Bs("max")}>
            ${f("maximize")}
          </button>
          <button class="titlebar__btn titlebar__btn--close" id="btn-win-close" type="button" aria-label="关闭" @click=${()=>Bs("close")}>
            ${f("close")}
          </button>
        </div>
      </header>
    `}}function Bs(t){if(!S()){t==="close"&&window.close();return}t==="min"?_.windowMinimize():t==="max"?_.windowToggleMaximize():_.windowClose()}te("mp-titlebar",Fl);function zl(t,e,n){return(e=Wl(e))in t?Object.defineProperty(t,e,{value:n,enumerable:!0,configurable:!0,writable:!0}):t[e]=n,t}function Ne(){return Ne=Object.assign?Object.assign.bind():function(t){for(var e=1;e<arguments.length;e++){var n=arguments[e];for(var s in n)({}).hasOwnProperty.call(n,s)&&(t[s]=n[s])}return t},Ne.apply(null,arguments)}function _i(t,e){var n=Object.keys(t);if(Object.getOwnPropertySymbols){var s=Object.getOwnPropertySymbols(t);e&&(s=s.filter(function(a){return Object.getOwnPropertyDescriptor(t,a).enumerable})),n.push.apply(n,s)}return n}function De(t){for(var e=1;e<arguments.length;e++){var n=arguments[e]!=null?arguments[e]:{};e%2?_i(Object(n),!0).forEach(function(s){zl(t,s,n[s])}):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(n)):_i(Object(n)).forEach(function(s){Object.defineProperty(t,s,Object.getOwnPropertyDescriptor(n,s))})}return t}function Ul(t,e){if(t==null)return{};var n,s,a=jl(t,e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(t);for(s=0;s<r.length;s++)n=r[s],e.indexOf(n)===-1&&{}.propertyIsEnumerable.call(t,n)&&(a[n]=t[n])}return a}function jl(t,e){if(t==null)return{};var n={};for(var s in t)if({}.hasOwnProperty.call(t,s)){if(e.indexOf(s)!==-1)continue;n[s]=t[s]}return n}function Hl(t,e){if(typeof t!="object"||!t)return t;var n=t[Symbol.toPrimitive];if(n!==void 0){var s=n.call(t,e);if(typeof s!="object")return s;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(t)}function Wl(t){var e=Hl(t,"string");return typeof e=="symbol"?e:e+""}function wa(t){"@babel/helpers - typeof";return wa=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(e){return typeof e}:function(e){return e&&typeof Symbol=="function"&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},wa(t)}var Vl="1.15.7";function qe(t){if(typeof window<"u"&&window.navigator)return!!navigator.userAgent.match(t)}var Be=qe(/(?:Trident.*rv[ :]?11\.|msie|iemobile|Windows Phone)/i),Cn=qe(/Edge/i),wi=qe(/firefox/i),on=qe(/safari/i)&&!qe(/chrome/i)&&!qe(/android/i),Wa=qe(/iP(ad|od|hone)/i),yr=qe(/chrome/i)&&qe(/android/i),_r={capture:!1,passive:!1};function L(t,e,n){t.addEventListener(e,n,!Be&&_r)}function P(t,e,n){t.removeEventListener(e,n,!Be&&_r)}function is(t,e){if(e){if(e[0]===">"&&(e=e.substring(1)),t)try{if(t.matches)return t.matches(e);if(t.msMatchesSelector)return t.msMatchesSelector(e);if(t.webkitMatchesSelector)return t.webkitMatchesSelector(e)}catch{return!1}return!1}}function wr(t){return t.host&&t!==document&&t.host.nodeType&&t.host!==t?t.host:t.parentNode}function we(t,e,n,s){if(t){n=n||document;do{if(e!=null&&(e[0]===">"?t.parentNode===n&&is(t,e):is(t,e))||s&&t===n)return t;if(t===n)break}while(t=wr(t))}return null}var $i=/\s+/g;function pe(t,e,n){if(t&&e)if(t.classList)t.classList[n?"add":"remove"](e);else{var s=(" "+t.className+" ").replace($i," ").replace(" "+e+" "," ");t.className=(s+(n?" "+e:"")).replace($i," ")}}function E(t,e,n){var s=t&&t.style;if(s){if(n===void 0)return document.defaultView&&document.defaultView.getComputedStyle?n=document.defaultView.getComputedStyle(t,""):t.currentStyle&&(n=t.currentStyle),e===void 0?n:n[e];!(e in s)&&e.indexOf("webkit")===-1&&(e="-webkit-"+e),s[e]=n+(typeof n=="string"?"":"px")}}function It(t,e){var n="";if(typeof t=="string")n=t;else do{var s=E(t,"transform");s&&s!=="none"&&(n=s+" "+n)}while(!e&&(t=t.parentNode));var a=window.DOMMatrix||window.WebKitCSSMatrix||window.CSSMatrix||window.MSCSSMatrix;return a&&new a(n)}function $r(t,e,n){if(t){var s=t.getElementsByTagName(e),a=0,r=s.length;if(n)for(;a<r;a++)n(s[a],a);return s}return[]}function Te(){var t=document.scrollingElement;return t||document.documentElement}function K(t,e,n,s,a){if(!(!t.getBoundingClientRect&&t!==window)){var r,o,l,c,d,m,h;if(t!==window&&t.parentNode&&t!==Te()?(r=t.getBoundingClientRect(),o=r.top,l=r.left,c=r.bottom,d=r.right,m=r.height,h=r.width):(o=0,l=0,c=window.innerHeight,d=window.innerWidth,m=window.innerHeight,h=window.innerWidth),(e||n)&&t!==window&&(a=a||t.parentNode,!Be))do if(a&&a.getBoundingClientRect&&(E(a,"transform")!=="none"||n&&E(a,"position")!=="static")){var g=a.getBoundingClientRect();o-=g.top+parseInt(E(a,"border-top-width")),l-=g.left+parseInt(E(a,"border-left-width")),c=o+r.height,d=l+r.width;break}while(a=a.parentNode);if(s&&t!==window){var y=It(a||t),$=y&&y.a,w=y&&y.d;y&&(o/=w,l/=$,h/=$,m/=w,c=o+m,d=l+h)}return{top:o,left:l,bottom:c,right:d,width:h,height:m}}}function ki(t,e,n){for(var s=Ve(t,!0),a=K(t)[e];s;){var r=K(s)[n],o=void 0;if(o=a>=r,!o)return s;if(s===Te())break;s=Ve(s,!1)}return!1}function Rt(t,e,n,s){for(var a=0,r=0,o=t.children;r<o.length;){if(o[r].style.display!=="none"&&o[r]!==T.ghost&&(s||o[r]!==T.dragged)&&we(o[r],n.draggable,t,!1)){if(a===e)return o[r];a++}r++}return null}function Va(t,e){for(var n=t.lastElementChild;n&&(n===T.ghost||E(n,"display")==="none"||e&&!is(n,e));)n=n.previousElementSibling;return n||null}function ve(t,e){var n=0;if(!t||!t.parentNode)return-1;for(;t=t.previousElementSibling;)t.nodeName.toUpperCase()!=="TEMPLATE"&&t!==T.clone&&(!e||is(t,e))&&n++;return n}function Si(t){var e=0,n=0,s=Te();if(t)do{var a=It(t),r=a.a,o=a.d;e+=t.scrollLeft*r,n+=t.scrollTop*o}while(t!==s&&(t=t.parentNode));return[e,n]}function Kl(t,e){for(var n in t)if(t.hasOwnProperty(n)){for(var s in e)if(e.hasOwnProperty(s)&&e[s]===t[n][s])return Number(n)}return-1}function Ve(t,e){if(!t||!t.getBoundingClientRect)return Te();var n=t,s=!1;do if(n.clientWidth<n.scrollWidth||n.clientHeight<n.scrollHeight){var a=E(n);if(n.clientWidth<n.scrollWidth&&(a.overflowX=="auto"||a.overflowX=="scroll")||n.clientHeight<n.scrollHeight&&(a.overflowY=="auto"||a.overflowY=="scroll")){if(!n.getBoundingClientRect||n===document.body)return Te();if(s||e)return n;s=!0}}while(n=n.parentNode);return Te()}function Gl(t,e){if(t&&e)for(var n in e)e.hasOwnProperty(n)&&(t[n]=e[n]);return t}function Fs(t,e){return Math.round(t.top)===Math.round(e.top)&&Math.round(t.left)===Math.round(e.left)&&Math.round(t.height)===Math.round(e.height)&&Math.round(t.width)===Math.round(e.width)}var ln;function kr(t,e){return function(){if(!ln){var n=arguments,s=this;n.length===1?t.call(s,n[0]):t.apply(s,n),ln=setTimeout(function(){ln=void 0},e)}}}function Yl(){clearTimeout(ln),ln=void 0}function Sr(t,e,n){t.scrollLeft+=e,t.scrollTop+=n}function xr(t){var e=window.Polymer,n=window.jQuery||window.Zepto;return e&&e.dom?e.dom(t).cloneNode(!0):n?n(t).clone(!0)[0]:t.cloneNode(!0)}function Cr(t,e,n){var s={};return Array.from(t.children).forEach(function(a){var r,o,l,c;if(!(!we(a,e.draggable,t,!1)||a.animated||a===n)){var d=K(a);s.left=Math.min((r=s.left)!==null&&r!==void 0?r:1/0,d.left),s.top=Math.min((o=s.top)!==null&&o!==void 0?o:1/0,d.top),s.right=Math.max((l=s.right)!==null&&l!==void 0?l:-1/0,d.right),s.bottom=Math.max((c=s.bottom)!==null&&c!==void 0?c:-1/0,d.bottom)}}),s.width=s.right-s.left,s.height=s.bottom-s.top,s.x=s.left,s.y=s.top,s}var ce="Sortable"+new Date().getTime();function Xl(){var t=[],e;return{captureAnimationState:function(){if(t=[],!!this.options.animation){var s=[].slice.call(this.el.children);s.forEach(function(a){if(!(E(a,"display")==="none"||a===T.ghost)){t.push({target:a,rect:K(a)});var r=De({},t[t.length-1].rect);if(a.thisAnimationDuration){var o=It(a,!0);o&&(r.top-=o.f,r.left-=o.e)}a.fromRect=r}})}},addAnimationState:function(s){t.push(s)},removeAnimationState:function(s){t.splice(Kl(t,{target:s}),1)},animateAll:function(s){var a=this;if(!this.options.animation){clearTimeout(e),typeof s=="function"&&s();return}var r=!1,o=0;t.forEach(function(l){var c=0,d=l.target,m=d.fromRect,h=K(d),g=d.prevFromRect,y=d.prevToRect,$=l.rect,w=It(d,!0);w&&(h.top-=w.f,h.left-=w.e),d.toRect=h,d.thisAnimationDuration&&Fs(g,h)&&!Fs(m,h)&&($.top-h.top)/($.left-h.left)===(m.top-h.top)/(m.left-h.left)&&(c=Jl($,g,y,a.options)),Fs(h,m)||(d.prevFromRect=m,d.prevToRect=h,c||(c=a.options.animation),a.animate(d,$,h,c)),c&&(r=!0,o=Math.max(o,c),clearTimeout(d.animationResetTimer),d.animationResetTimer=setTimeout(function(){d.animationTime=0,d.prevFromRect=null,d.fromRect=null,d.prevToRect=null,d.thisAnimationDuration=null},c),d.thisAnimationDuration=c)}),clearTimeout(e),r?e=setTimeout(function(){typeof s=="function"&&s()},o):typeof s=="function"&&s(),t=[]},animate:function(s,a,r,o){if(o){E(s,"transition",""),E(s,"transform","");var l=It(this.el),c=l&&l.a,d=l&&l.d,m=(a.left-r.left)/(c||1),h=(a.top-r.top)/(d||1);s.animatingX=!!m,s.animatingY=!!h,E(s,"transform","translate3d("+m+"px,"+h+"px,0)"),this.forRepaintDummy=Ql(s),E(s,"transition","transform "+o+"ms"+(this.options.easing?" "+this.options.easing:"")),E(s,"transform","translate3d(0,0,0)"),typeof s.animated=="number"&&clearTimeout(s.animated),s.animated=setTimeout(function(){E(s,"transition",""),E(s,"transform",""),s.animated=!1,s.animatingX=!1,s.animatingY=!1},o)}}}}function Ql(t){return t.offsetWidth}function Jl(t,e,n,s){return Math.sqrt(Math.pow(e.top-t.top,2)+Math.pow(e.left-t.left,2))/Math.sqrt(Math.pow(e.top-n.top,2)+Math.pow(e.left-n.left,2))*s.animation}var gt=[],zs={initializeByDefault:!0},Tn={mount:function(e){for(var n in zs)zs.hasOwnProperty(n)&&!(n in e)&&(e[n]=zs[n]);gt.forEach(function(s){if(s.pluginName===e.pluginName)throw"Sortable: Cannot mount plugin ".concat(e.pluginName," more than once")}),gt.push(e)},pluginEvent:function(e,n,s){var a=this;this.eventCanceled=!1,s.cancel=function(){a.eventCanceled=!0};var r=e+"Global";gt.forEach(function(o){n[o.pluginName]&&(n[o.pluginName][r]&&n[o.pluginName][r](De({sortable:n},s)),n.options[o.pluginName]&&n[o.pluginName][e]&&n[o.pluginName][e](De({sortable:n},s)))})},initializePlugins:function(e,n,s,a){gt.forEach(function(l){var c=l.pluginName;if(!(!e.options[c]&&!l.initializeByDefault)){var d=new l(e,n,e.options);d.sortable=e,d.options=e.options,e[c]=d,Ne(s,d.defaults)}});for(var r in e.options)if(e.options.hasOwnProperty(r)){var o=this.modifyOption(e,r,e.options[r]);typeof o<"u"&&(e.options[r]=o)}},getEventProperties:function(e,n){var s={};return gt.forEach(function(a){typeof a.eventProperties=="function"&&Ne(s,a.eventProperties.call(n[a.pluginName],e))}),s},modifyOption:function(e,n,s){var a;return gt.forEach(function(r){e[r.pluginName]&&r.optionListeners&&typeof r.optionListeners[n]=="function"&&(a=r.optionListeners[n].call(e[r.pluginName],s))}),a}};function Zl(t){var e=t.sortable,n=t.rootEl,s=t.name,a=t.targetEl,r=t.cloneEl,o=t.toEl,l=t.fromEl,c=t.oldIndex,d=t.newIndex,m=t.oldDraggableIndex,h=t.newDraggableIndex,g=t.originalEvent,y=t.putSortable,$=t.extraEventProperties;if(e=e||n&&n[ce],!!e){var w,O=e.options,C="on"+s.charAt(0).toUpperCase()+s.substr(1);window.CustomEvent&&!Be&&!Cn?w=new CustomEvent(s,{bubbles:!0,cancelable:!0}):(w=document.createEvent("Event"),w.initEvent(s,!0,!0)),w.to=o||n,w.from=l||n,w.item=a||n,w.clone=r,w.oldIndex=c,w.newIndex=d,w.oldDraggableIndex=m,w.newDraggableIndex=h,w.originalEvent=g,w.pullMode=y?y.lastPutMode:void 0;var q=De(De({},$),Tn.getEventProperties(s,e));for(var ae in q)w[ae]=q[ae];n&&n.dispatchEvent(w),O[C]&&O[C].call(e,w)}}var ec=["evt"],le=function(e,n){var s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:{},a=s.evt,r=Ul(s,ec);Tn.pluginEvent.bind(T)(e,n,De({dragEl:b,parentEl:H,ghostEl:D,rootEl:U,nextEl:at,lastDownEl:Gn,cloneEl:j,cloneHidden:We,dragStarted:en,putSortable:Q,activeSortable:T.active,originalEvent:a,oldIndex:St,oldDraggableIndex:cn,newIndex:fe,newDraggableIndex:je,hideGhostForTarget:Dr,unhideGhostForTarget:Ar,cloneNowHidden:function(){We=!0},cloneNowShown:function(){We=!1},dispatchSortableEvent:function(l){re({sortable:n,name:l,originalEvent:a})}},r))};function re(t){Zl(De({putSortable:Q,cloneEl:j,targetEl:b,rootEl:U,oldIndex:St,oldDraggableIndex:cn,newIndex:fe,newDraggableIndex:je},t))}var b,H,D,U,at,Gn,j,We,St,fe,cn,je,On,Q,wt=!1,rs=!1,os=[],tt,_e,Us,js,xi,Ci,en,vt,dn,un=!1,Pn=!1,Yn,ne,Hs=[],$a=!1,ls=[],_s=typeof document<"u",Ln=Wa,Ti=Cn||Be?"cssFloat":"float",tc=_s&&!yr&&!Wa&&"draggable"in document.createElement("div"),Tr=(function(){if(_s){if(Be)return!1;var t=document.createElement("x");return t.style.cssText="pointer-events:auto",t.style.pointerEvents==="auto"}})(),Er=function(e,n){var s=E(e),a=parseInt(s.width)-parseInt(s.paddingLeft)-parseInt(s.paddingRight)-parseInt(s.borderLeftWidth)-parseInt(s.borderRightWidth),r=Rt(e,0,n),o=Rt(e,1,n),l=r&&E(r),c=o&&E(o),d=l&&parseInt(l.marginLeft)+parseInt(l.marginRight)+K(r).width,m=c&&parseInt(c.marginLeft)+parseInt(c.marginRight)+K(o).width;if(s.display==="flex")return s.flexDirection==="column"||s.flexDirection==="column-reverse"?"vertical":"horizontal";if(s.display==="grid")return s.gridTemplateColumns.split(" ").length<=1?"vertical":"horizontal";if(r&&l.float&&l.float!=="none"){var h=l.float==="left"?"left":"right";return o&&(c.clear==="both"||c.clear===h)?"vertical":"horizontal"}return r&&(l.display==="block"||l.display==="flex"||l.display==="table"||l.display==="grid"||d>=a&&s[Ti]==="none"||o&&s[Ti]==="none"&&d+m>a)?"vertical":"horizontal"},nc=function(e,n,s){var a=s?e.left:e.top,r=s?e.right:e.bottom,o=s?e.width:e.height,l=s?n.left:n.top,c=s?n.right:n.bottom,d=s?n.width:n.height;return a===l||r===c||a+o/2===l+d/2},sc=function(e,n){var s;return os.some(function(a){var r=a[ce].options.emptyInsertThreshold;if(!(!r||Va(a))){var o=K(a),l=e>=o.left-r&&e<=o.right+r,c=n>=o.top-r&&n<=o.bottom+r;if(l&&c)return s=a}}),s},Ir=function(e){function n(r,o){return function(l,c,d,m){var h=l.options.group.name&&c.options.group.name&&l.options.group.name===c.options.group.name;if(r==null&&(o||h))return!0;if(r==null||r===!1)return!1;if(o&&r==="clone")return r;if(typeof r=="function")return n(r(l,c,d,m),o)(l,c,d,m);var g=(o?l:c).options.group.name;return r===!0||typeof r=="string"&&r===g||r.join&&r.indexOf(g)>-1}}var s={},a=e.group;(!a||wa(a)!="object")&&(a={name:a}),s.name=a.name,s.checkPull=n(a.pull,!0),s.checkPut=n(a.put),s.revertClone=a.revertClone,e.group=s},Dr=function(){!Tr&&D&&E(D,"display","none")},Ar=function(){!Tr&&D&&E(D,"display","")};_s&&!yr&&document.addEventListener("click",function(t){if(rs)return t.preventDefault(),t.stopPropagation&&t.stopPropagation(),t.stopImmediatePropagation&&t.stopImmediatePropagation(),rs=!1,!1},!0);var nt=function(e){if(b){e=e.touches?e.touches[0]:e;var n=sc(e.clientX,e.clientY);if(n){var s={};for(var a in e)e.hasOwnProperty(a)&&(s[a]=e[a]);s.target=s.rootEl=n,s.preventDefault=void 0,s.stopPropagation=void 0,n[ce]._onDragOver(s)}}},ac=function(e){b&&b.parentNode[ce]._isOutsideThisEl(e.target)};function T(t,e){if(!(t&&t.nodeType&&t.nodeType===1))throw"Sortable: `el` must be an HTMLElement, not ".concat({}.toString.call(t));this.el=t,this.options=e=Ne({},e),t[ce]=this;var n={group:null,sort:!0,disabled:!1,store:null,handle:null,draggable:/^[uo]l$/i.test(t.nodeName)?">li":">*",swapThreshold:1,invertSwap:!1,invertedSwapThreshold:null,removeCloneOnHide:!0,direction:function(){return Er(t,this.options)},ghostClass:"sortable-ghost",chosenClass:"sortable-chosen",dragClass:"sortable-drag",ignore:"a, img",filter:null,preventOnFilter:!0,animation:0,easing:null,setData:function(o,l){o.setData("Text",l.textContent)},dropBubble:!1,dragoverBubble:!1,dataIdAttr:"data-id",delay:0,delayOnTouchOnly:!1,touchStartThreshold:(Number.parseInt?Number:window).parseInt(window.devicePixelRatio,10)||1,forceFallback:!1,fallbackClass:"sortable-fallback",fallbackOnBody:!1,fallbackTolerance:0,fallbackOffset:{x:0,y:0},supportPointer:T.supportPointer!==!1&&"PointerEvent"in window&&(!on||Wa),emptyInsertThreshold:5};Tn.initializePlugins(this,t,n);for(var s in n)!(s in e)&&(e[s]=n[s]);Ir(e);for(var a in this)a.charAt(0)==="_"&&typeof this[a]=="function"&&(this[a]=this[a].bind(this));this.nativeDraggable=e.forceFallback?!1:tc,this.nativeDraggable&&(this.options.touchStartThreshold=1),e.supportPointer?L(t,"pointerdown",this._onTapStart):(L(t,"mousedown",this._onTapStart),L(t,"touchstart",this._onTapStart)),this.nativeDraggable&&(L(t,"dragover",this),L(t,"dragenter",this)),os.push(this.el),e.store&&e.store.get&&this.sort(e.store.get(this)||[]),Ne(this,Xl())}T.prototype={constructor:T,_isOutsideThisEl:function(e){!this.el.contains(e)&&e!==this.el&&(vt=null)},_getDirection:function(e,n){return typeof this.options.direction=="function"?this.options.direction.call(this,e,n,b):this.options.direction},_onTapStart:function(e){if(e.cancelable){var n=this,s=this.el,a=this.options,r=a.preventOnFilter,o=e.type,l=e.touches&&e.touches[0]||e.pointerType&&e.pointerType==="touch"&&e,c=(l||e).target,d=e.target.shadowRoot&&(e.path&&e.path[0]||e.composedPath&&e.composedPath()[0])||c,m=a.filter;if(pc(s),!b&&!(/mousedown|pointerdown/.test(o)&&e.button!==0||a.disabled)&&!d.isContentEditable&&!(!this.nativeDraggable&&on&&c&&c.tagName.toUpperCase()==="SELECT")&&(c=we(c,a.draggable,s,!1),!(c&&c.animated)&&Gn!==c)){if(St=ve(c),cn=ve(c,a.draggable),typeof m=="function"){if(m.call(this,e,c,this)){re({sortable:n,rootEl:d,name:"filter",targetEl:c,toEl:s,fromEl:s}),le("filter",n,{evt:e}),r&&e.preventDefault();return}}else if(m&&(m=m.split(",").some(function(h){if(h=we(d,h.trim(),s,!1),h)return re({sortable:n,rootEl:h,name:"filter",targetEl:c,fromEl:s,toEl:s}),le("filter",n,{evt:e}),!0}),m)){r&&e.preventDefault();return}a.handle&&!we(d,a.handle,s,!1)||this._prepareDragStart(e,l,c)}}},_prepareDragStart:function(e,n,s){var a=this,r=a.el,o=a.options,l=r.ownerDocument,c;if(s&&!b&&s.parentNode===r){var d=K(s);if(U=r,b=s,H=b.parentNode,at=b.nextSibling,Gn=s,On=o.group,T.dragged=b,tt={target:b,clientX:(n||e).clientX,clientY:(n||e).clientY},xi=tt.clientX-d.left,Ci=tt.clientY-d.top,this._lastX=(n||e).clientX,this._lastY=(n||e).clientY,b.style["will-change"]="all",c=function(){if(le("delayEnded",a,{evt:e}),T.eventCanceled){a._onDrop();return}a._disableDelayedDragEvents(),!wi&&a.nativeDraggable&&(b.draggable=!0),a._triggerDragStart(e,n),re({sortable:a,name:"choose",originalEvent:e}),pe(b,o.chosenClass,!0)},o.ignore.split(",").forEach(function(m){$r(b,m.trim(),Ws)}),L(l,"dragover",nt),L(l,"mousemove",nt),L(l,"touchmove",nt),o.supportPointer?(L(l,"pointerup",a._onDrop),!this.nativeDraggable&&L(l,"pointercancel",a._onDrop)):(L(l,"mouseup",a._onDrop),L(l,"touchend",a._onDrop),L(l,"touchcancel",a._onDrop)),wi&&this.nativeDraggable&&(this.options.touchStartThreshold=4,b.draggable=!0),le("delayStart",this,{evt:e}),o.delay&&(!o.delayOnTouchOnly||n)&&(!this.nativeDraggable||!(Cn||Be))){if(T.eventCanceled){this._onDrop();return}o.supportPointer?(L(l,"pointerup",a._disableDelayedDrag),L(l,"pointercancel",a._disableDelayedDrag)):(L(l,"mouseup",a._disableDelayedDrag),L(l,"touchend",a._disableDelayedDrag),L(l,"touchcancel",a._disableDelayedDrag)),L(l,"mousemove",a._delayedDragTouchMoveHandler),L(l,"touchmove",a._delayedDragTouchMoveHandler),o.supportPointer&&L(l,"pointermove",a._delayedDragTouchMoveHandler),a._dragStartTimer=setTimeout(c,o.delay)}else c()}},_delayedDragTouchMoveHandler:function(e){var n=e.touches?e.touches[0]:e;Math.max(Math.abs(n.clientX-this._lastX),Math.abs(n.clientY-this._lastY))>=Math.floor(this.options.touchStartThreshold/(this.nativeDraggable&&window.devicePixelRatio||1))&&this._disableDelayedDrag()},_disableDelayedDrag:function(){b&&Ws(b),clearTimeout(this._dragStartTimer),this._disableDelayedDragEvents()},_disableDelayedDragEvents:function(){var e=this.el.ownerDocument;P(e,"mouseup",this._disableDelayedDrag),P(e,"touchend",this._disableDelayedDrag),P(e,"touchcancel",this._disableDelayedDrag),P(e,"pointerup",this._disableDelayedDrag),P(e,"pointercancel",this._disableDelayedDrag),P(e,"mousemove",this._delayedDragTouchMoveHandler),P(e,"touchmove",this._delayedDragTouchMoveHandler),P(e,"pointermove",this._delayedDragTouchMoveHandler)},_triggerDragStart:function(e,n){n=n||e.pointerType=="touch"&&e,!this.nativeDraggable||n?this.options.supportPointer?L(document,"pointermove",this._onTouchMove):n?L(document,"touchmove",this._onTouchMove):L(document,"mousemove",this._onTouchMove):(L(b,"dragend",this),L(U,"dragstart",this._onDragStart));try{document.selection?Xn(function(){document.selection.empty()}):window.getSelection().removeAllRanges()}catch{}},_dragStarted:function(e,n){if(wt=!1,U&&b){le("dragStarted",this,{evt:n}),this.nativeDraggable&&L(document,"dragover",ac);var s=this.options;!e&&pe(b,s.dragClass,!1),pe(b,s.ghostClass,!0),T.active=this,e&&this._appendGhost(),re({sortable:this,name:"start",originalEvent:n})}else this._nulling()},_emulateDragOver:function(){if(_e){this._lastX=_e.clientX,this._lastY=_e.clientY,Dr();for(var e=document.elementFromPoint(_e.clientX,_e.clientY),n=e;e&&e.shadowRoot&&(e=e.shadowRoot.elementFromPoint(_e.clientX,_e.clientY),e!==n);)n=e;if(b.parentNode[ce]._isOutsideThisEl(e),n)do{if(n[ce]){var s=void 0;if(s=n[ce]._onDragOver({clientX:_e.clientX,clientY:_e.clientY,target:e,rootEl:n}),s&&!this.options.dragoverBubble)break}e=n}while(n=wr(n));Ar()}},_onTouchMove:function(e){if(tt){var n=this.options,s=n.fallbackTolerance,a=n.fallbackOffset,r=e.touches?e.touches[0]:e,o=D&&It(D,!0),l=D&&o&&o.a,c=D&&o&&o.d,d=Ln&&ne&&Si(ne),m=(r.clientX-tt.clientX+a.x)/(l||1)+(d?d[0]-Hs[0]:0)/(l||1),h=(r.clientY-tt.clientY+a.y)/(c||1)+(d?d[1]-Hs[1]:0)/(c||1);if(!T.active&&!wt){if(s&&Math.max(Math.abs(r.clientX-this._lastX),Math.abs(r.clientY-this._lastY))<s)return;this._onDragStart(e,!0)}if(D){o?(o.e+=m-(Us||0),o.f+=h-(js||0)):o={a:1,b:0,c:0,d:1,e:m,f:h};var g="matrix(".concat(o.a,",").concat(o.b,",").concat(o.c,",").concat(o.d,",").concat(o.e,",").concat(o.f,")");E(D,"webkitTransform",g),E(D,"mozTransform",g),E(D,"msTransform",g),E(D,"transform",g),Us=m,js=h,_e=r}e.cancelable&&e.preventDefault()}},_appendGhost:function(){if(!D){var e=this.options.fallbackOnBody?document.body:U,n=K(b,!0,Ln,!0,e),s=this.options;if(Ln){for(ne=e;E(ne,"position")==="static"&&E(ne,"transform")==="none"&&ne!==document;)ne=ne.parentNode;ne!==document.body&&ne!==document.documentElement?(ne===document&&(ne=Te()),n.top+=ne.scrollTop,n.left+=ne.scrollLeft):ne=Te(),Hs=Si(ne)}D=b.cloneNode(!0),pe(D,s.ghostClass,!1),pe(D,s.fallbackClass,!0),pe(D,s.dragClass,!0),E(D,"transition",""),E(D,"transform",""),E(D,"box-sizing","border-box"),E(D,"margin",0),E(D,"top",n.top),E(D,"left",n.left),E(D,"width",n.width),E(D,"height",n.height),E(D,"opacity","0.8"),E(D,"position",Ln?"absolute":"fixed"),E(D,"zIndex","100000"),E(D,"pointerEvents","none"),T.ghost=D,e.appendChild(D),E(D,"transform-origin",xi/parseInt(D.style.width)*100+"% "+Ci/parseInt(D.style.height)*100+"%")}},_onDragStart:function(e,n){var s=this,a=e.dataTransfer,r=s.options;if(le("dragStart",this,{evt:e}),T.eventCanceled){this._onDrop();return}le("setupClone",this),T.eventCanceled||(j=xr(b),j.removeAttribute("id"),j.draggable=!1,j.style["will-change"]="",this._hideClone(),pe(j,this.options.chosenClass,!1),T.clone=j),s.cloneId=Xn(function(){le("clone",s),!T.eventCanceled&&(s.options.removeCloneOnHide||U.insertBefore(j,b),s._hideClone(),re({sortable:s,name:"clone"}))}),!n&&pe(b,r.dragClass,!0),n?(rs=!0,s._loopId=setInterval(s._emulateDragOver,50)):(P(document,"mouseup",s._onDrop),P(document,"touchend",s._onDrop),P(document,"touchcancel",s._onDrop),a&&(a.effectAllowed="move",r.setData&&r.setData.call(s,a,b)),L(document,"drop",s),E(b,"transform","translateZ(0)")),wt=!0,s._dragStartId=Xn(s._dragStarted.bind(s,n,e)),L(document,"selectstart",s),en=!0,window.getSelection().removeAllRanges(),on&&E(document.body,"user-select","none")},_onDragOver:function(e){var n=this.el,s=e.target,a,r,o,l=this.options,c=l.group,d=T.active,m=On===c,h=l.sort,g=Q||d,y,$=this,w=!1;if($a)return;function O(Vt,_o){le(Vt,$,De({evt:e,isOwner:m,axis:y?"vertical":"horizontal",revert:o,dragRect:a,targetRect:r,canSort:h,fromSortable:g,target:s,completed:q,onMove:function(ri,wo){return qn(U,n,b,a,ri,K(ri),e,wo)},changed:ae},_o))}function C(){O("dragOverAnimationCapture"),$.captureAnimationState(),$!==g&&g.captureAnimationState()}function q(Vt){return O("dragOverCompleted",{insertion:Vt}),Vt&&(m?d._hideClone():d._showClone($),$!==g&&(pe(b,Q?Q.options.ghostClass:d.options.ghostClass,!1),pe(b,l.ghostClass,!0)),Q!==$&&$!==T.active?Q=$:$===T.active&&Q&&(Q=null),g===$&&($._ignoreWhileAnimating=s),$.animateAll(function(){O("dragOverAnimationComplete"),$._ignoreWhileAnimating=null}),$!==g&&(g.animateAll(),g._ignoreWhileAnimating=null)),(s===b&&!b.animated||s===n&&!s.animated)&&(vt=null),!l.dragoverBubble&&!e.rootEl&&s!==document&&(b.parentNode[ce]._isOutsideThisEl(e.target),!Vt&&nt(e)),!l.dragoverBubble&&e.stopPropagation&&e.stopPropagation(),w=!0}function ae(){fe=ve(b),je=ve(b,l.draggable),re({sortable:$,name:"change",toEl:n,newIndex:fe,newDraggableIndex:je,originalEvent:e})}if(e.preventDefault!==void 0&&e.cancelable&&e.preventDefault(),s=we(s,l.draggable,n,!0),O("dragOver"),T.eventCanceled)return w;if(b.contains(e.target)||s.animated&&s.animatingX&&s.animatingY||$._ignoreWhileAnimating===s)return q(!1);if(rs=!1,d&&!l.disabled&&(m?h||(o=H!==U):Q===this||(this.lastPutMode=On.checkPull(this,d,b,e))&&c.checkPut(this,d,b,e))){if(y=this._getDirection(e,s)==="vertical",a=K(b),O("dragOverValid"),T.eventCanceled)return w;if(o)return H=U,C(),this._hideClone(),O("revert"),T.eventCanceled||(at?U.insertBefore(b,at):U.appendChild(b)),q(!0);var Y=Va(n,l.draggable);if(!Y||lc(e,y,this)&&!Y.animated){if(Y===b)return q(!1);if(Y&&n===e.target&&(s=Y),s&&(r=K(s)),qn(U,n,b,a,s,r,e,!!s)!==!1)return C(),Y&&Y.nextSibling?n.insertBefore(b,Y.nextSibling):n.appendChild(b),H=n,ae(),q(!0)}else if(Y&&oc(e,y,this)){var ge=Rt(n,0,l,!0);if(ge===b)return q(!1);if(s=ge,r=K(s),qn(U,n,b,a,s,r,e,!1)!==!1)return C(),n.insertBefore(b,ge),H=n,ae(),q(!0)}else if(s.parentNode===n){r=K(s);var ke=0,Xe,Ut=b.parentNode!==n,ue=!nc(b.animated&&b.toRect||a,s.animated&&s.toRect||r,y),jt=y?"top":"left",Fe=ki(s,"top","top")||ki(b,"top","top"),Ht=Fe?Fe.scrollTop:void 0;vt!==s&&(Xe=r[jt],un=!1,Pn=!ue&&l.invertSwap||Ut),ke=cc(e,s,r,y,ue?1:l.swapThreshold,l.invertedSwapThreshold==null?l.swapThreshold:l.invertedSwapThreshold,Pn,vt===s);var Me;if(ke!==0){var Qe=ve(b);do Qe-=ke,Me=H.children[Qe];while(Me&&(E(Me,"display")==="none"||Me===D))}if(ke===0||Me===s)return q(!1);vt=s,dn=ke;var Wt=s.nextElementSibling,ze=!1;ze=ke===1;var An=qn(U,n,b,a,s,r,e,ze);if(An!==!1)return(An===1||An===-1)&&(ze=An===1),$a=!0,setTimeout(rc,30),C(),ze&&!Wt?n.appendChild(b):s.parentNode.insertBefore(b,ze?Wt:s),Fe&&Sr(Fe,0,Ht-Fe.scrollTop),H=b.parentNode,Xe!==void 0&&!Pn&&(Yn=Math.abs(Xe-K(s)[jt])),ae(),q(!0)}if(n.contains(b))return q(!1)}return!1},_ignoreWhileAnimating:null,_offMoveEvents:function(){P(document,"mousemove",this._onTouchMove),P(document,"touchmove",this._onTouchMove),P(document,"pointermove",this._onTouchMove),P(document,"dragover",nt),P(document,"mousemove",nt),P(document,"touchmove",nt)},_offUpEvents:function(){var e=this.el.ownerDocument;P(e,"mouseup",this._onDrop),P(e,"touchend",this._onDrop),P(e,"pointerup",this._onDrop),P(e,"pointercancel",this._onDrop),P(e,"touchcancel",this._onDrop),P(document,"selectstart",this)},_onDrop:function(e){var n=this.el,s=this.options;if(fe=ve(b),je=ve(b,s.draggable),le("drop",this,{evt:e}),H=b&&b.parentNode,fe=ve(b),je=ve(b,s.draggable),T.eventCanceled){this._nulling();return}wt=!1,Pn=!1,un=!1,clearInterval(this._loopId),clearTimeout(this._dragStartTimer),ka(this.cloneId),ka(this._dragStartId),this.nativeDraggable&&(P(document,"drop",this),P(n,"dragstart",this._onDragStart)),this._offMoveEvents(),this._offUpEvents(),on&&E(document.body,"user-select",""),E(b,"transform",""),e&&(en&&(e.cancelable&&e.preventDefault(),!s.dropBubble&&e.stopPropagation()),D&&D.parentNode&&D.parentNode.removeChild(D),(U===H||Q&&Q.lastPutMode!=="clone")&&j&&j.parentNode&&j.parentNode.removeChild(j),b&&(this.nativeDraggable&&P(b,"dragend",this),Ws(b),b.style["will-change"]="",en&&!wt&&pe(b,Q?Q.options.ghostClass:this.options.ghostClass,!1),pe(b,this.options.chosenClass,!1),re({sortable:this,name:"unchoose",toEl:H,newIndex:null,newDraggableIndex:null,originalEvent:e}),U!==H?(fe>=0&&(re({rootEl:H,name:"add",toEl:H,fromEl:U,originalEvent:e}),re({sortable:this,name:"remove",toEl:H,originalEvent:e}),re({rootEl:H,name:"sort",toEl:H,fromEl:U,originalEvent:e}),re({sortable:this,name:"sort",toEl:H,originalEvent:e})),Q&&Q.save()):fe!==St&&fe>=0&&(re({sortable:this,name:"update",toEl:H,originalEvent:e}),re({sortable:this,name:"sort",toEl:H,originalEvent:e})),T.active&&((fe==null||fe===-1)&&(fe=St,je=cn),re({sortable:this,name:"end",toEl:H,originalEvent:e}),this.save()))),this._nulling()},_nulling:function(){le("nulling",this),U=b=H=D=at=j=Gn=We=tt=_e=en=fe=je=St=cn=vt=dn=Q=On=T.dragged=T.ghost=T.clone=T.active=null;var e=this.el;ls.forEach(function(n){e.contains(n)&&(n.checked=!0)}),ls.length=Us=js=0},handleEvent:function(e){switch(e.type){case"drop":case"dragend":this._onDrop(e);break;case"dragenter":case"dragover":b&&(this._onDragOver(e),ic(e));break;case"selectstart":e.preventDefault();break}},toArray:function(){for(var e=[],n,s=this.el.children,a=0,r=s.length,o=this.options;a<r;a++)n=s[a],we(n,o.draggable,this.el,!1)&&e.push(n.getAttribute(o.dataIdAttr)||uc(n));return e},sort:function(e,n){var s={},a=this.el;this.toArray().forEach(function(r,o){var l=a.children[o];we(l,this.options.draggable,a,!1)&&(s[r]=l)},this),n&&this.captureAnimationState(),e.forEach(function(r){s[r]&&(a.removeChild(s[r]),a.appendChild(s[r]))}),n&&this.animateAll()},save:function(){var e=this.options.store;e&&e.set&&e.set(this)},closest:function(e,n){return we(e,n||this.options.draggable,this.el,!1)},option:function(e,n){var s=this.options;if(n===void 0)return s[e];var a=Tn.modifyOption(this,e,n);typeof a<"u"?s[e]=a:s[e]=n,e==="group"&&Ir(s)},destroy:function(){le("destroy",this);var e=this.el;e[ce]=null,P(e,"mousedown",this._onTapStart),P(e,"touchstart",this._onTapStart),P(e,"pointerdown",this._onTapStart),this.nativeDraggable&&(P(e,"dragover",this),P(e,"dragenter",this)),Array.prototype.forEach.call(e.querySelectorAll("[draggable]"),function(n){n.removeAttribute("draggable")}),this._onDrop(),this._disableDelayedDragEvents(),os.splice(os.indexOf(this.el),1),this.el=e=null},_hideClone:function(){if(!We){if(le("hideClone",this),T.eventCanceled)return;E(j,"display","none"),this.options.removeCloneOnHide&&j.parentNode&&j.parentNode.removeChild(j),We=!0}},_showClone:function(e){if(e.lastPutMode!=="clone"){this._hideClone();return}if(We){if(le("showClone",this),T.eventCanceled)return;b.parentNode==U&&!this.options.group.revertClone?U.insertBefore(j,b):at?U.insertBefore(j,at):U.appendChild(j),this.options.group.revertClone&&this.animate(b,j),E(j,"display",""),We=!1}}};function ic(t){t.dataTransfer&&(t.dataTransfer.dropEffect="move"),t.cancelable&&t.preventDefault()}function qn(t,e,n,s,a,r,o,l){var c,d=t[ce],m=d.options.onMove,h;return window.CustomEvent&&!Be&&!Cn?c=new CustomEvent("move",{bubbles:!0,cancelable:!0}):(c=document.createEvent("Event"),c.initEvent("move",!0,!0)),c.to=e,c.from=t,c.dragged=n,c.draggedRect=s,c.related=a||e,c.relatedRect=r||K(e),c.willInsertAfter=l,c.originalEvent=o,t.dispatchEvent(c),m&&(h=m.call(d,c,o)),h}function Ws(t){t.draggable=!1}function rc(){$a=!1}function oc(t,e,n){var s=K(Rt(n.el,0,n.options,!0)),a=Cr(n.el,n.options,D),r=10;return e?t.clientX<a.left-r||t.clientY<s.top&&t.clientX<s.right:t.clientY<a.top-r||t.clientY<s.bottom&&t.clientX<s.left}function lc(t,e,n){var s=K(Va(n.el,n.options.draggable)),a=Cr(n.el,n.options,D),r=10;return e?t.clientX>a.right+r||t.clientY>s.bottom&&t.clientX>s.left:t.clientY>a.bottom+r||t.clientX>s.right&&t.clientY>s.top}function cc(t,e,n,s,a,r,o,l){var c=s?t.clientY:t.clientX,d=s?n.height:n.width,m=s?n.top:n.left,h=s?n.bottom:n.right,g=!1;if(!o){if(l&&Yn<d*a){if(!un&&(dn===1?c>m+d*r/2:c<h-d*r/2)&&(un=!0),un)g=!0;else if(dn===1?c<m+Yn:c>h-Yn)return-dn}else if(c>m+d*(1-a)/2&&c<h-d*(1-a)/2)return dc(e)}return g=g||o,g&&(c<m+d*r/2||c>h-d*r/2)?c>m+d/2?1:-1:0}function dc(t){return ve(b)<ve(t)?1:-1}function uc(t){for(var e=t.tagName+t.className+t.src+t.href+t.textContent,n=e.length,s=0;n--;)s+=e.charCodeAt(n);return s.toString(36)}function pc(t){ls.length=0;for(var e=t.getElementsByTagName("input"),n=e.length;n--;){var s=e[n];s.checked&&ls.push(s)}}function Xn(t){return setTimeout(t,0)}function ka(t){return clearTimeout(t)}_s&&L(document,"touchmove",function(t){(T.active||wt)&&t.cancelable&&t.preventDefault()});T.utils={on:L,off:P,css:E,find:$r,is:function(e,n){return!!we(e,n,e,!1)},extend:Gl,throttle:kr,closest:we,toggleClass:pe,clone:xr,index:ve,nextTick:Xn,cancelNextTick:ka,detectDirection:Er,getChild:Rt,expando:ce};T.get=function(t){return t[ce]};T.mount=function(){for(var t=arguments.length,e=new Array(t),n=0;n<t;n++)e[n]=arguments[n];e[0].constructor===Array&&(e=e[0]),e.forEach(function(s){if(!s.prototype||!s.prototype.constructor)throw"Sortable: Mounted plugin must be a constructor function, not ".concat({}.toString.call(s));s.utils&&(T.utils=De(De({},T.utils),s.utils)),Tn.mount(s)})};T.create=function(t,e){return new T(t,e)};T.version=Vl;var W=[],tn,Sa,xa=!1,Vs,Ks,cs,nn;function fc(){function t(){this.defaults={scroll:!0,forceAutoScrollFallback:!1,scrollSensitivity:30,scrollSpeed:10,bubbleScroll:!0};for(var e in this)e.charAt(0)==="_"&&typeof this[e]=="function"&&(this[e]=this[e].bind(this))}return t.prototype={dragStarted:function(n){var s=n.originalEvent;this.sortable.nativeDraggable?L(document,"dragover",this._handleAutoScroll):this.options.supportPointer?L(document,"pointermove",this._handleFallbackAutoScroll):s.touches?L(document,"touchmove",this._handleFallbackAutoScroll):L(document,"mousemove",this._handleFallbackAutoScroll)},dragOverCompleted:function(n){var s=n.originalEvent;!this.options.dragOverBubble&&!s.rootEl&&this._handleAutoScroll(s)},drop:function(){this.sortable.nativeDraggable?P(document,"dragover",this._handleAutoScroll):(P(document,"pointermove",this._handleFallbackAutoScroll),P(document,"touchmove",this._handleFallbackAutoScroll),P(document,"mousemove",this._handleFallbackAutoScroll)),Ei(),Qn(),Yl()},nulling:function(){cs=Sa=tn=xa=nn=Vs=Ks=null,W.length=0},_handleFallbackAutoScroll:function(n){this._handleAutoScroll(n,!0)},_handleAutoScroll:function(n,s){var a=this,r=(n.touches?n.touches[0]:n).clientX,o=(n.touches?n.touches[0]:n).clientY,l=document.elementFromPoint(r,o);if(cs=n,s||this.options.forceAutoScrollFallback||Cn||Be||on){Gs(n,this.options,l,s);var c=Ve(l,!0);xa&&(!nn||r!==Vs||o!==Ks)&&(nn&&Ei(),nn=setInterval(function(){var d=Ve(document.elementFromPoint(r,o),!0);d!==c&&(c=d,Qn()),Gs(n,a.options,d,s)},10),Vs=r,Ks=o)}else{if(!this.options.bubbleScroll||Ve(l,!0)===Te()){Qn();return}Gs(n,this.options,Ve(l,!1),!1)}}},Ne(t,{pluginName:"scroll",initializeByDefault:!0})}function Qn(){W.forEach(function(t){clearInterval(t.pid)}),W=[]}function Ei(){clearInterval(nn)}var Gs=kr(function(t,e,n,s){if(e.scroll){var a=(t.touches?t.touches[0]:t).clientX,r=(t.touches?t.touches[0]:t).clientY,o=e.scrollSensitivity,l=e.scrollSpeed,c=Te(),d=!1,m;Sa!==n&&(Sa=n,Qn(),tn=e.scroll,m=e.scrollFn,tn===!0&&(tn=Ve(n,!0)));var h=0,g=tn;do{var y=g,$=K(y),w=$.top,O=$.bottom,C=$.left,q=$.right,ae=$.width,Y=$.height,ge=void 0,ke=void 0,Xe=y.scrollWidth,Ut=y.scrollHeight,ue=E(y),jt=y.scrollLeft,Fe=y.scrollTop;y===c?(ge=ae<Xe&&(ue.overflowX==="auto"||ue.overflowX==="scroll"||ue.overflowX==="visible"),ke=Y<Ut&&(ue.overflowY==="auto"||ue.overflowY==="scroll"||ue.overflowY==="visible")):(ge=ae<Xe&&(ue.overflowX==="auto"||ue.overflowX==="scroll"),ke=Y<Ut&&(ue.overflowY==="auto"||ue.overflowY==="scroll"));var Ht=ge&&(Math.abs(q-a)<=o&&jt+ae<Xe)-(Math.abs(C-a)<=o&&!!jt),Me=ke&&(Math.abs(O-r)<=o&&Fe+Y<Ut)-(Math.abs(w-r)<=o&&!!Fe);if(!W[h])for(var Qe=0;Qe<=h;Qe++)W[Qe]||(W[Qe]={});(W[h].vx!=Ht||W[h].vy!=Me||W[h].el!==y)&&(W[h].el=y,W[h].vx=Ht,W[h].vy=Me,clearInterval(W[h].pid),(Ht!=0||Me!=0)&&(d=!0,W[h].pid=setInterval(function(){s&&this.layer===0&&T.active._onTouchMove(cs);var Wt=W[this.layer].vy?W[this.layer].vy*l:0,ze=W[this.layer].vx?W[this.layer].vx*l:0;typeof m=="function"&&m.call(T.dragged.parentNode[ce],ze,Wt,t,cs,W[this.layer].el)!=="continue"||Sr(W[this.layer].el,ze,Wt)}.bind({layer:h}),24))),h++}while(e.bubbleScroll&&g!==c&&(g=Ve(g,!1)));xa=d}},30),Mr=function(e){var n=e.originalEvent,s=e.putSortable,a=e.dragEl,r=e.activeSortable,o=e.dispatchSortableEvent,l=e.hideGhostForTarget,c=e.unhideGhostForTarget;if(n){var d=s||r;l();var m=n.changedTouches&&n.changedTouches.length?n.changedTouches[0]:n,h=document.elementFromPoint(m.clientX,m.clientY);c(),d&&!d.el.contains(h)&&(o("spill"),this.onSpill({dragEl:a,putSortable:s}))}};function Ka(){}Ka.prototype={startIndex:null,dragStart:function(e){var n=e.oldDraggableIndex;this.startIndex=n},onSpill:function(e){var n=e.dragEl,s=e.putSortable;this.sortable.captureAnimationState(),s&&s.captureAnimationState();var a=Rt(this.sortable.el,this.startIndex,this.options);a?this.sortable.el.insertBefore(n,a):this.sortable.el.appendChild(n),this.sortable.animateAll(),s&&s.animateAll()},drop:Mr};Ne(Ka,{pluginName:"revertOnSpill"});function Ga(){}Ga.prototype={onSpill:function(e){var n=e.dragEl,s=e.putSortable,a=s||this.sortable;a.captureAnimationState(),n.parentNode&&n.parentNode.removeChild(n),a.animateAll()},drop:Mr};Ne(Ga,{pluginName:"removeOnSpill"});T.mount(new fc);T.mount(Ga,Ka);class hc extends me{static properties={playlistId:{type:String}};constructor(){super(),this.playlistId="",this._query=""}deps(){return[i.playlistVersion,i.songs,this.playlistId,this._query]}get already(){const e=i.playlists.find(n=>n.id===this.playlistId);return new Set(e?.songIds||[])}get filtered(){const e=this._query.trim().toLowerCase();return e?i.songs.filter(n=>`${n.title} ${n.artist} ${n.album}`.toLowerCase().includes(e)):i.songs}render(){const e=this.already,n=this.filtered,s=i.songs.filter(a=>!e.has(a.id)).length;return p`
      <input
        class="input"
        id="addsongs-filter"
        type="text"
        placeholder="筛选歌曲（标题 / 歌手 / 专辑）"
        autocomplete="off"
        spellcheck="false"
        .value=${this._query}
        @input=${a=>{this._query=a.target.value,this.requestUpdate()}}
        @keydown=${a=>{a.key==="Enter"&&(a.preventDefault(),a.stopPropagation())}}
      />
      <div class="addsongs__head">
        <span id="addsongs-count">
          ${this._query.trim()?`匹配 ${A(n.length)} 首`:`共 ${A(i.songs.length)} 首 · 其中 ${A(s)} 首尚未加入`}
        </span>
        <span class="addsongs__actions">
          <button class="btn btn--sm" type="button" data-addsongs="none" @click=${()=>this.setAll(!1)}>清空选择</button>
          <button class="btn btn--sm" type="button" data-addsongs="all" @click=${()=>this.setAll(!0)}>全选</button>
        </span>
      </div>
      <div class="addsongs" id="addsongs-list">
        ${n.length?Ee(n,a=>a.id,a=>{const r=e.has(a.id);return p`
                  <label class="addsongs__row">
                    <input type="checkbox" data-song-check=${a.id} ?checked=${r} ?disabled=${r} />
                    <span class="addsongs__text">
                      <span class="addsongs__title u-ellipsis">${a.title}</span>
                      <span class="addsongs__sub u-ellipsis">${a.artist}${a.album?` · ${a.album}`:""}</span>
                    </span>
                    ${r?p`<span class="addsongs__tag">已在歌单</span>`:M}
                  </label>
                `}):p`<div class="addsongs__empty">没有匹配的歌曲</div>`}
      </div>
    `}setAll(e){for(const n of this.querySelectorAll("[data-song-check]:not(:disabled)"))n.checked=e}}te("mp-add-songs",hc);function Or(t){ee({title:"新建歌单",desc:"歌单名称可以随时修改。",body:p`<input class="input" data-field="name" type="text" placeholder="例如：深夜循环" maxlength="40" />`,okText:"创建",onOk:e=>{const n=String(e.name||"").trim();if(!n)return"请输入歌单名称";if(i.playlists.some(a=>a.name===n))return"已存在同名歌单";const s=Io(n);return t?.(s),u(`已创建歌单「${n}」`,{tone:"success"}),!0}})}function mc(t,e){const n=Re(t);!n||n.locked||ee({title:"重命名歌单",body:p`<input class="input" data-field="name" type="text" .value=${n.name} maxlength="40" />`,okText:"保存",onOk:s=>{const a=String(s.name||"").trim();return a?(Ao(t,a),!0):"名称不能为空"}})}function gc(t,e){const n=Re(t);!n||n.locked||ee({title:`删除歌单「${n.name}」？`,desc:"只会删除歌单本身，本地音乐文件不会被删除。",okText:"删除",danger:!0,onOk:()=>(Do(t),e?.(),u("歌单已删除"),!0)})}function ds(t,e){const n=Re(t);if(!n)return;const s=Eo(t,e);s?u(`已添加 ${s} 首到「${n.name}」`,{tone:"success"}):u("所选歌曲已在该歌单中")}function vc(t){const e=Re(t);if(!e)return;if(!i.songs.length){u("本地曲库还是空的，先扫描音乐文件夹吧",{tone:"warning"});return}const n=new Set(e.songIds);ee({title:`添加歌曲到「${e.name}」`,desc:"勾选要加入的歌曲；已经在歌单里的会保持选中。",body:p`<mp-add-songs .playlistId=${t}></mp-add-songs>`,okText:"加入歌单",onOk:(s,a)=>{const o=[...a.querySelectorAll("[data-song-check]:checked")].map(l=>l.dataset.songCheck).filter(l=>!n.has(l));return o.length?(ds(t,o),!0):"没有选中新的歌曲"}})}function Ca(t,e){const n=Re(t);if(!n)return;const s=[{id:"play",label:"播放这个歌单",icon:"play"},{id:"queue",label:"加入播放列表",icon:"queue"},{id:"sep1",kind:"sep"}];n.locked||(s.push({id:"rename",label:"重命名",icon:"edit"}),s.push({id:"delete",label:"删除歌单",icon:"trash",danger:!0}),s.push({id:"sep2",kind:"sep"})),s.push({id:"export",label:"导出为 m3u",icon:"file"});const a=e.getBoundingClientRect();bn({x:a.left,y:a.bottom+6,align:"right",items:s,onPick:async r=>{switch(r){case"play":bc(n);break;case"queue":{(await pt(()=>import("./base-D9XwDejF.js").then(l=>l.a3),__vite__mapDeps([0,1]))).appendToQueue(n.songIds),u(`已把 ${A(n.songIds.length)} 首加入播放列表`,{tone:"success"});break}case"rename":mc(n.id);break;case"delete":gc(n.id,()=>Tt("library"));break;case"export":u("导出 m3u 需要接入后端后实现",{duration:2200});break}}})}function bc(t){pt(async()=>{const{playContext:e}=await import("./base-D9XwDejF.js").then(n=>n.a3);return{playContext:e}},__vite__mapDeps([0,1])).then(({playContext:e})=>{e(t.songIds.slice(),0,{type:"playlist",id:t.id})})}let Ii=0;class yc extends me{static deps=e=>[e.view,e.playlistId,e.playlistVersion,e.songs.length,e.queue.length];firstUpdated(){this.bindDrag()}bindDrag(){const e=this.querySelector("#playlist-nav");!e||this._sortable||(this._sortable=T.create(e,{draggable:".navitem",filter:'[data-locked="true"]',animation:0,ghostClass:"is-dragging",onEnd:n=>this.onDragEnd(n)}))}onDragEnd(e){Ii=Date.now();const n=e.oldIndex,s=e.newIndex;if(n==null||s==null||n===s)return;const a=e.from,r=Array.from(a.children).filter(o=>o!==e.item);a.insertBefore(e.item,r[n]??null),Mo(n-1,s-1),u("已调整歌单顺序",{duration:1400})}onSidebarClick(e){if(Date.now()-Ii<260)return;const n=e.target.closest('[data-act="pl-more"]');if(n){e.stopPropagation(),Ca(n.dataset.id,n);return}const s=e.target.closest("[data-nav]");if(!s)return;const a=s.dataset.nav;a==="playlist"?Tt("playlist",s.dataset.playlist):Tt(a)}render(){const e=i.playlists.filter(a=>a.id!==Hn),s=[Re(Hn),...e].filter(Boolean);return p`
      <aside
        class="sidebar"
        id="sidebar"
        @click=${a=>this.onSidebarClick(a)}
        @contextmenu=${a=>{const r=a.target.closest('[data-nav="playlist"]');r&&(a.preventDefault(),Ca(r.dataset.playlist,r))}}
      >
        <div class="sidebar__scroll">
          <nav class="sidebar__group" aria-label="曲库">
            <div class="sidebar__label">曲库</div>
            <button class="navitem" type="button" data-nav="library" aria-selected=${String(i.view==="library")}>
              ${f("music","navitem__icon")}
              <span class="navitem__text">本地歌曲</span>
              <span class="navitem__tail">
                <span class="navitem__badge" id="badge-library">${A(i.songs.length)}</span>
              </span>
            </button>
            <button class="navitem" type="button" data-nav="queue" aria-selected=${String(i.view==="queue")}>
              ${f("queue","navitem__icon")}
              <span class="navitem__text">播放列表</span>
              <span class="navitem__tail">
                <span class="navitem__badge" id="badge-queue">${A(i.queue.length)}</span>
              </span>
            </button>
          </nav>

          <nav class="sidebar__group" aria-label="歌单">
            <div class="sidebar__label">
              <span>歌单</span>
              <button
                class="sidebar__label-btn"
                id="btn-new-playlist-sm"
                type="button"
                data-tip="新建歌单"
                aria-label="新建歌单"
                @click=${()=>Or(a=>a&&Tt("playlist",a.id))}
              >
                ${f("plus")}
              </button>
            </div>
            <div id="playlist-nav">
              ${Ee(s,a=>a.id,a=>this.playlistItem(a))}
            </div>
          </nav>
        </div>
      </aside>
    `}playlistItem(e){const n=i.view==="playlist"&&i.playlistId===e.id;return p`
      <button
        class="navitem"
        type="button"
        data-nav="playlist"
        data-playlist=${e.id}
        data-locked=${String(!!e.locked)}
        draggable=${e.locked?"false":"true"}
        aria-selected=${String(n)}
      >
        ${f(e.id===Hn?"heart":"playlist","navitem__icon")}
        <span class="navitem__text">${e.name}</span>
        <span class="navitem__tail">
          <span class="navitem__badge">${A(e.songIds.length)}</span>
          <span
            class="navitem__more"
            data-act="pl-more"
            data-id=${e.id}
            role="button"
            aria-label="${e.name}操作"
          >${f("more")}</span>
        </span>
      </button>
    `}}te("mp-sidebar",yc);const _c=Fa(class extends za{constructor(){super(...arguments),this.key=M}render(t,e){return this.key=t,e}update(t,[e,n]){return e!==this.key&&(dr(t),this.key=e),n}}),Ya=[{id:"auto",label:"自动识别（按接口地址与模型名判断）",hint:"识别不出时按 OpenAI 兼容接口处理"},{id:"openai",label:"OpenAI（GPT-5 系列 / o 系列）",hint:"o 系列无法完全关闭思考，只能降到最低档"},{id:"deepseek",label:"DeepSeek（deepseek-chat / reasoner）",hint:"思考模式下 temperature 会被忽略"},{id:"anthropic",label:"Anthropic Claude",hint:"开启思考时 temperature 必须为 1，程序会自动去掉它"},{id:"gemini",label:"Google Gemini",hint:"Pro 系列无法关闭思考"},{id:"qwen",label:"阿里通义千问 Qwen",hint:"仅「混合思考」模型可关闭；部分开源模型只支持流式"},{id:"glm",label:"智谱 GLM",hint:"GLM-5.3 系列传 disabled 会报错"},{id:"kimi",label:"月之暗面 Kimi",hint:"kimi-k3 / k2.7-code 始终思考，传 thinking 会报错"},{id:"minimax",label:"MiniMax",hint:"官方未提供关闭思考的参数，只能保持默认"},{id:"xai",label:"xAI Grok",hint:"reasoning_effort=none 可真正关闭"},{id:"openrouter",label:"OpenRouter（统一网关）",hint:"统一 reasoning 字段；标记 mandatory 的模型不接受关闭"},{id:"siliconflow",label:"SiliconFlow（硅基流动）",hint:"R1 类纯推理模型无法关闭"},{id:"ollama",label:"Ollama（本地，OpenAI 兼容）",hint:"本地兼容层用 reasoning_effort；GPT-OSS 无法完全关闭"}];function wc(t){return Ya.find(e=>e.id===t)?.label||t||"自动识别"}function Pr(t){return Ya.find(e=>e.id===t)?.hint||""}const Lr=["off","auto","mica","acrylic","tabbed"],Di={off:"关闭（不透明窗口）",auto:"自动（系统决定）",mica:"Mica（Win11 材质）",acrylic:"Acrylic（亚克力）",tabbed:"Tabbed（标签页材质）"};function Jn(t){return Di[t]||Di.off}function $c(t){const e=document.documentElement;!t||t==="off"?delete e.dataset.backdrop:e.dataset.backdrop=t}async function kc(){let t=null;if(S())try{t=await _.backdrop()}catch(e){console.warn("[backdrop] 读取窗口材质状态失败",e)}return t?t.preview=!1:t={configured:i.config.nativeBackdrop||"off",active:"off",supported:!1,os:"",restartRequired:!1,preview:!S()},i.backdropState=t,$c(t.active),t}let oe=null,Rn=null,Ai=0,Dt=null,us=null,Ta=0;const qr=1500,At="idle",Nt="loading";let $e=At,rt=null,ot=!1,Ys=0;const Sc=12e3;let be=null,xe=null,Mi=null,Zn=!1,He=null,xt=null;function xc(t){if(Zn)return!1;if(be&&xe)return!0;const e=window.AudioContext||window.webkitAudioContext;if(!e)return Zn=!0,!1;try{be=new e,xe=be.createGain(),xe.gain.value=1,Mi=be.createMediaElementSource(t),Mi.connect(xe),xe.connect(be.destination);try{He=be.createAnalyser(),He.fftSize=512,He.smoothingTimeConstant=.76,xt=new Uint8Array(He.frequencyBinCount),xe.connect(He)}catch{He=null,xt=null}return us=null,!0}catch(n){return console.warn("[audio] Web Audio 链路建立失败，退回元素音量",n),Zn=!0,!1}}function Rr(){const t=i.config.loudnessMode||"off";let e=0;t!=="off"&&i.currentId&&(e=i.loudnessGains?.[i.currentId]??0);const n=10**(e/20);return(i.muted?0:i.volume)*n}function Bt(){const t=oe,e=Rr();if(be&&xe&&!Zn){const n=be.currentTime;try{xe.gain.cancelScheduledValues(n),xe.gain.setTargetAtTime(e,n,.015)}catch{xe.gain.value=e}t&&(t.volume=1),us=e;return}t&&(t.volume=Math.max(0,Math.min(1,e))),us=e}function wn(){Rr()!==us&&Bt()}function Cc(t){return t?(be?.state==="suspended"&&be.resume().catch(()=>{}),t.play().catch(e=>{Oc(e)||u(`播放失败：${e?.message??e}`,{tone:"error",duration:5e3})})):Promise.resolve()}function Ea(t){if(t){if(i.playing&&t.paused){Cc(t);return}!i.playing&&!t.paused&&(ot=!0,t.pause())}}function Tc(t){const e=Number.isFinite(t.duration)&&t.duration>0?t.duration*1e3:i.duration||0;return e?(Number.isFinite(t.currentTime)?t.currentTime*1e3:i.position)>=e-300:!1}function Ec(){$e=Nt,ot=!1,rt&&clearTimeout(rt),rt=setTimeout(()=>{rt=null,$e===Nt&&Nr(oe)},Sc)}function Nr(t){rt&&(clearTimeout(rt),rt=null),$e===Nt&&($e=At,Ea(t||oe))}function Xa(){return oe||(oe=document.getElementById("audio-engine"),oe||(oe=document.createElement("audio"),oe.id="audio-engine",oe.preload="auto",oe.hidden=!0,document.body.appendChild(oe)),oe.crossOrigin="anonymous",Dc(oe),oe)}function Ic(){try{return Xa()}catch(t){return console.warn("[audio] 音频元素不可用",t),null}}function Dc(t){t.dataset.bound!=="1"&&(t.dataset.bound="1",t.addEventListener("loadedmetadata",()=>{if(Number.isFinite(t.duration)&&t.duration>0&&(i.duration=t.duration*1e3,it(),x()),Dt!=null){const e=Dt;Dt=null;try{t.currentTime=Math.max(0,Math.min(e,i.duration||0)/1e3)}catch{}}Nr(t)}),t.addEventListener("timeupdate",()=>{document.getElementById("progress")?.dataset.dragging!=="true"&&(i.position=t.currentTime*1e3,it())}),t.addEventListener("play",()=>{$e!==Nt&&(ot=!1,i.playing=!0,be?.state==="suspended"&&be.resume().catch(()=>{}),it())}),t.addEventListener("pause",()=>{if(ot){ot=!1;return}$e!==Nt&&(t.ended||Tc(t)||Ys&&performance.now()-Ys<qr||(i.playing=!1,it()))}),t.addEventListener("ended",()=>{if(Ys=performance.now(),i.sleepTimer?.type==="after-song"){mn(!0);return}if(i.playMode==="loop-one"){t.currentTime=0,t.play().catch(()=>{});return}mn(!0)}),t.addEventListener("error",()=>{$e=At,ot=!1;const e=Ot();if(!e||Ac(t.error))return;const n=t.error?.code;u(`${n===4?"格式无法播放（解码失败）":n===3?"音频数据损坏":n===2?"网络中断":"音频加载失败"}：${e.title}`,{tone:"error",duration:4e3})}))}function Ac(t){return Ta&&performance.now()-Ta<qr?!0:!t||!t.code}async function Mc(){if(!S())return;const t=Xa(),e=Ot();if(!e){Rn!==null&&(t.pause(),t.removeAttribute("src"),t.load(),Rn=null,$e=At,ot=!1);return}if(Rn!==e.id){Rn=e.id,Ec();const n=++Ai;let s=null;try{s=e.streamUrl||await _.mediaUrl(e.id)}catch(a){$e=At,u(`无法播放：${a?.message??"取播放地址失败"}`,{tone:"error",duration:5e3});return}if(n!==Ai)return;if(!s){$e=At,u("无法播放：后端没有返回地址",{tone:"error",duration:5e3});return}Dt=0,t.src=s,Ta=performance.now(),t.load(),xc(t),Bt(),e.online||Br(e.id),Ea(t);return}$e!==Nt&&Ea(t)}function Oc(t){const e=t?.name||"";if(e==="AbortError"||e==="NotAllowedError")return!0;const n=String(t?.message||"");return/abort|interrupted by a new load|play\(\) request was interrupted/i.test(n)}const Nn=new Map;async function Br(t){const e=i.config.loudnessMode||"off";if(e==="off"||!S()||!t||i.loudnessGains?.[t]!==void 0)return;if(Nn.has(t))return Nn.get(t);const n=(async()=>{try{const s=i.config.loudnessTarget??-16,a=await _.loudnessLookup(t,s);if(a?.measured){Oi(t,a.gainDB);return}if(e==="album")return;const r=await _.loudnessMeasure(t,s);r?.measured&&Oi(t,r.gainDB??Pc(r,s))}catch(s){console.warn("[audio] 响度补偿获取失败",s)}finally{Nn.delete(t)}})();return Nn.set(t,n),n}function Pc(t,e){if(!t?.integrated)return 0;let n=e-t.integrated;if(t.truePeak){const s=-1-t.truePeak;n>s&&(n=s)}return n>24&&(n=24),n<-24&&(n=-24),Math.round(n*100)/100}function Oi(t,e){i.loudnessGains||(i.loudnessGains={}),i.loudnessGains[t]=e,t===i.currentId&&Bt(),it()}async function Lc(){const t=i.config.loudnessTarget??-16;if(i.loudnessGains={},wn(),it(),!!S())try{await _.loudnessInvalidateTarget(t)}catch(e){console.warn("[loudness] 失效旧补偿失败",e)}}async function ws(){if(!S())return;const t=i.config.loudnessMode||"off";if(t==="off"){i.loudnessGains={},wn();return}const e=i.config.loudnessTarget??-16;try{const n=t==="album"?await _.loudnessAlbumGains(e):await _.loudnessGainMap(e);i.loudnessGains=n||{},wn(),it(),t==="track"&&i.currentId&&Br(i.currentId)}catch(n){console.warn("[loudness] 拉取补偿增益失败",n)}}async function pn(){if(!S())return null;try{const t=await _.loudnessState();return t&&(i.loudnessState=t),t}catch{return null}}function ps(t){kt(t),qc(t)}function qc(t){if(!S())return;const e=Xa();if(!e.src){Dt=t;return}const n=Math.max(0,Math.min(t,i.duration||0))/1e3;try{e.currentTime=n}catch{Dt=t}}function Qa(t=32){if(!He||!xt)return null;He.getByteFrequencyData(xt);const e=Math.max(1,Math.min(128,Math.floor(t)||32)),n=new Float32Array(e),s=xt.length;for(let a=0;a<e;a+=1){const r=Math.floor(s*(a/e)**1.7),o=Math.min(s,Math.max(r+1,Math.floor(s*((a+1)/e)**1.7)));let l=0;for(let c=r;c<o;c+=1)l+=xt[c];n[a]=l/((o-r)*255)}return n}let Ia="";function En(){return i.config.showDesktopLyrics===!0}async function Pi(t,{force:e=!1}={}){const n=!!t,s=En()!==n;if(i.config.showDesktopLyrics=n,Ia="",!s&&!e)return he(),{ok:!0,enabled:n,unchanged:!0};if(!S())return $s({enabled:n}),{ok:!0,preview:!0,enabled:n};try{const a=await _.desktopLyrics(n);return n&&a?.ok===!1&&(i.config.showDesktopLyrics=!1,he()),a}catch(a){return console.warn("[desktop-lyrics] 打开/关闭桌面歌词失败",a),i.config.showDesktopLyrics=!1,he(),{ok:!1,enabled:n,error:String(a?.message??a)}}}function Rc({text:t="",playing:e=!1,fontSize:n=26}={}){if(!En())return;const s=[t,e?1:0,Math.round(n)].join("|");if(s!==Ia){if(Ia=s,!S()){$s({text:t,playing:e});return}_.updateDesktopLyrics({text:t,playing:e,fontSize:n}).catch(a=>{console.warn("[desktop-lyrics] 同步歌词失败",a?.message??a)})}}function $s({text:t="",playing:e=!1,enabled:n=null}={}){const s=n===null?En():!!n,a=!S()&&s&&e&&!!t;i.floatingLyrics={show:a,text:t},he()}function Nc(){return Math.round(Ft()*1.3)}const Bc="/skins/";let Ce=new Map;const Da=new Set,Xs=new Set;function de(){return Ge(i.currentId)}function Fc(){const t=i.config.lyricsSources;return!Array.isArray(t)||!t.length?!0:t.includes("online")}async function Fr(t){if(!t)return{lines:[],text:"",source:"none"};if(Ce.has(t.id))return Ce.get(t.id);let e="",n="none";if(S()){const a=await _.loadLyrics(t.id);a&&typeof a=="object"&&typeof a.lrc=="string"?(e=a.lrc,n=a.source||"backend"):typeof a=="string"&&(e=a,n="backend"),!e&&Fc()&&(e=await zc(t),e&&(n="online"))}if(!e){if(S()){const r={lines:[],text:"",source:"none"};return Ce.set(t.id,r),r}const a=i.songs.findIndex(r=>r.id===t.id);e=a===0?Oo:a===1?Po:Uc(t),n="preview"}const s={lines:fa(e),text:e,source:n};return Ce.set(t.id,s),s}async function zc(t){if(Da.has(t.id))return"";Da.add(t.id);try{if(t.online){const n=await _.onlineLyrics(t.title||"",t.artist||"",t.duration||0),s=typeof n?.lrc=="string"?n.lrc:"";return s?(_.lyricsSave(t.id,s,n?.source||"online",!1).catch(()=>{}),s):""}const e=await _.lyricsAutoMatch(t.id);return typeof e?.lrc=="string"?e.lrc:""}catch(e){return console.warn("[lyrics] 在线自动匹配失败",e),""}}function Uc(t){const e=[];for(let n=12;n<Math.max(60,Math.floor((t.duration||18e4)/1e3)-10);n+=9)e.push(`[00:${String(n).padStart(2,"0")}.00]（${t.title} · 暂无歌词文件，接入后端后可读取 .lrc 或内嵌歌词）`);return e.join(`
`)}const Aa=new Map;function Mt(t){return Aa.get(t)||0}function ct(t,e){if(!t)return 0;const n=Math.round(Number(e)||0);return n?Aa.set(t,n):Aa.delete(t),z.lyricsText=null,k.ctx&&de()?.id===t&&Z({type:"lyrics",...Ae()}),n}let Bn={songId:"",offset:0,lines:[]};function Ja(t){const n=(t?Ce.get(t.id):null)?.lines||[],s=Mt(t?.id);if(!s||!n.length)return n;if(Bn.songId===t.id&&Bn.offset===s)return Bn.lines;const a=n.map(r=>({time:r.time+s,text:r.text}));return Bn={songId:t.id,offset:s,lines:a},a}function ye(t){const e=t?Ge(t):de(),n=e?Ce.get(e.id):null;return{song:e||null,songId:e?.id||"",text:n?.text||"",source:n?.source||"none",lines:n?.lines||[]}}function Li(t){switch(t){case"embedded":return"音频内嵌";case"lrc-file":return"同名 .lrc 文件";case"cache":return"程序缓存";case"online":return"在线匹配";case"manual":return"手动编辑";case"preview":return"预览数据";default:return"暂无"}}async function fs(){const t=de();if(!(!t||Ce.has(t.id)||Xs.has(t.id))){Xs.add(t.id);try{await Fr(t)}finally{Xs.delete(t.id)}}}function jc(){const t=de();if(!t)return"";const e=Ja(t);if(!e.length)return"";const n=Ba(e,i.position);return n>=0?e[n].text:""}function Hc(){const t={prev:"",text:"",next:""},e=de();if(!e)return t;const n=Ja(e);if(!n.length)return t;const s=Ba(n,i.position);return s<0?t:{prev:n[s-1]?.text||"",text:n[s].text||"",next:n[s+1]?.text||""}}async function Qs(t,e,n="online",s={}){if(!t||!e)return!1;Ce.set(t,{lines:fa(e),text:e,source:n}),Da.add(t),z.lyricsText=null;let a=null;if(!s.transient&&S()){const r=s.embed??i.config.embedMeta===!0;try{const o=await _.lyricsSave(t,e,n,r);a=o||null;const l=typeof o?.lrc=="string"&&o.lrc?o.lrc:e;l!==e&&(Ce.set(t,{lines:fa(l),text:l,source:n}),z.lyricsText=null)}catch(o){console.warn("[lyrics] 写入缓存失败",o)}}return k.ctx&&de()?.id===t&&Z({type:"lyrics",...Ae()}),a||{ok:!0}}const Ma=[],Js=new Set;let es=null;async function Za(){return es||(es=Vc()),es}async function Wc(){try{await Za()}catch(t){console.warn("[skins] 启动扫描样式失败",t)}return Lt()}async function Vc(){if(!S())return Lt();try{const t=await _.listSkins(),e=Array.isArray(t)?t:[];Ma.length=0;const n=new Set;for(const s of e){if(!s?.id||!s?.module)continue;const a=`${Bc}${encodeURIComponent(s.id)}/`;try{await Vo({id:s.id,name:s.name,module:a+String(s.module).replace(/^\/+/,""),styles:(Array.isArray(s.styles)?s.styles:[]).map(r=>a+String(r).replace(/^\/+/,""))}),Js.add(s.id),n.add(s.id)}catch(r){Ma.push({id:s.id,reason:r?.message??String(r)}),console.warn(`[skins] 样式「${s.id}」加载失败：`,r)}}for(const s of[...Js])n.has(s)||(Js.delete(s),Ko(s))}catch(t){console.warn("[skins] 皮肤目录扫描失败",t)}return Lt()}async function ei(){es=null,await Za(),Gc()}async function Kc(t){await _.deleteSkin(t),await ei();const e=Lt().some(n=>n.id===t);return!e&&(i.pvMode===t||i.config.playerViewMode===t)&&$n(xn("").skin?.id||""),{removed:!e,skinIds:Lt().map(n=>n.id)}}function zr(){return Ma.slice()}let Ur=0;function jr(){return Ur}function Gc(){Ur+=1,he()}const k={view:null,stage:null,backgroundRoot:null,skin:null,ctx:null,mountedId:null,closeTimer:null,resizeObserver:null,themeObserver:null,carouselTimer:null,carouselIndex:0,carouselLastAdvance:0,carouselSongId:null},z={songId:null,cover:null,lyricsText:null,options:null,playing:null,themeId:null};function ks(){return{position:i.position,duration:i.duration,playing:i.playing,volume:i.volume,muted:i.muted}}function ti(t){if(!t)return[Ke];const e=i.coverSets.get(t.id)?.items,n=Array.isArray(e)?e.map(s=>s.preview).filter(Boolean):[];return n.length?n:[ht(t)]}function ni(t){const e=t?Ce.get(t.id):null,n=Ja(t);return{lines:n,text:e?.text||"",source:e?.source||"none",index:Ba(n,i.position)}}function Yc(t){return t?{id:t.id??"",title:t.title||"",artist:t.artist||"",album:t.album||"",duration:t.duration||0}:null}function Ae(){const t=de(),e=ti(t),n=Ue(k.carouselIndex,0,Math.max(0,e.length-1));return{song:Yc(t),cover:e[n]||Ke,covers:e,coverIndex:n,lyrics:ni(t)}}function Ss(){return{showLyrics:i.config.showLyrics!==!1,lyricsFontSize:i.config.lyricsFontSize,animations:i.config.animations!==!1,coverCarousel:i.config.coverCarousel===!0,coverCarouselInterval:Vr().seconds,interactive:!0}}function Xc(){return Ae()}function Hr(){return ks()}function Qc(t={}){return{...Ss(),...t}}function Jc(){const t=new Map,e={root:k.stage,backgroundRoot:k.backgroundRoot,audio:Ic(),spectrum:Qa,defaultCover:Ke,get themeId(){return document.documentElement.dataset.theme||""},get mode(){return document.documentElement.dataset.mode==="light"?"light":"dark"},playback:ks,media:Ae,options:Ss,actions:{seek(n){ps(n),Kr({force:!0})},togglePlay:kn,next:()=>mn(!1),prev:()=>Na(),openFolder(){const n=de();n?.path&&_.revealInExplorer(n.path)},openCoverPanel(){const n=de();!n||n.online||pt(()=>Promise.resolve().then(()=>ii),void 0).then(s=>s.openCoverPanel(n.id))}},on(n,s){return typeof s!="function"?()=>{}:(t.has(n)||t.set(n,new Set),t.get(n).add(s),()=>t.get(n)?.delete(s))},push(n){try{k.skin?.update?.(e,n)}catch(s){console.warn(`[skins] ${k.mountedId} 处理 ${n.type} 更新失败`,s)}for(const[s,a]of t)if(!(s!==n.type&&s!=="*"))for(const r of a)try{r(n)}catch(o){console.warn(`[skins] ${s} 订阅回调失败`,o)}}};return e}function Z(t){k.ctx?.push(t)}function Zc(t){const{skin:e,fellBack:n}=xn(t);if(!e)return;n&&console.warn(`[skins] 样式「${t}」不存在，已回退到「${e.name}」`),Wr(),k.skin=e,k.mountedId=e.id,k.stage.innerHTML="",k.view.dataset.skin=e.id,k.view.dataset.skinBackground=e.background?"yes":"no",document.getElementById("app")?.setAttribute("data-mode",e.id),i.pvMode=e.id;const s=Jc();k.ctx=s;try{e.mount(s)}catch(a){console.error(`[skins] ${e.id} 挂载失败`,a),k.stage.innerHTML=`<div class="skin-error">样式「${oi(e.name)}」加载失败：${oi(a?.message??a)}</div>`;return}s.push({type:"mount",...Ae(),...ks(),options:Ss()}),ed(),Oa("closed")}function Oa(t){const e=k.backgroundRoot;e&&(e.dataset.state=t)}function Wr(){if(k.skin){Z({type:"close"}),Z({type:"destroy"});try{k.skin.destroy?.(k.ctx)}catch(t){console.warn(`[skins] ${k.mountedId} 卸载失败`,t)}k.stage.innerHTML="",k.skin=null,k.ctx=null,k.mountedId=null,k.resizeObserver&&(k.resizeObserver.disconnect(),k.resizeObserver=null)}}function ed(){k.resizeObserver||typeof ResizeObserver!="function"||(k.resizeObserver=new ResizeObserver(()=>{const t=k.stage.getBoundingClientRect();Z({type:"resize",width:Math.round(t.width),height:Math.round(t.height)})}),k.resizeObserver.observe(k.stage))}function Vr(){const t=Number(i.config.coverCarouselInterval),e=Number.isFinite(t)&&t>0?Math.max(2,t):10;return{enabled:i.config.coverCarousel===!0,seconds:e,intervalMs:e*1e3}}function td(){const t=de();k.carouselSongId!==(t?.id??null)&&(k.carouselSongId=t?.id??null,k.carouselIndex=i.coverSets.get(t?.id)?.active??0,k.carouselLastAdvance=Date.now());const{enabled:e,intervalMs:n}=Vr(),s=ti(t);!e||!i.playerOpen||!i.playing||s.length<2||Date.now()-k.carouselLastAdvance<n||(k.carouselLastAdvance=Date.now(),k.carouselIndex=(k.carouselIndex+1)%s.length,Z({type:"media",...Ae()}))}function nd(){k.carouselTimer||(k.carouselTimer=setInterval(td,1e3))}function sd(){const t=ti(de());return t.length<2?!1:(k.carouselIndex=(k.carouselIndex+1)%t.length,k.carouselLastAdvance=Date.now(),Z({type:"media",...Ae()}),!0)}function qi(){z.cover=null,k.ctx&&Z({type:"media",...Ae()})}function Zs(t={}){const e=Ae(),n=t.type==="song"||t.type==="lyrics"||t.type==="media",s=e.cover!==z.cover||e.song?.id!==z.songId;z.cover=e.cover,!(!s&&!n)&&Z({...t,...e})}function Ri(){const t=Ss(),e=JSON.stringify(t);e!==z.options&&(z.options=e,Z({type:"options",options:t}))}async function ad(){if(!k.view){if(k.view=mi("#playerview"),k.stage=mi("#playerview-stage"),k.backgroundRoot=document.getElementById("skin-background"),!k.view||!k.stage)return;cd(),nd()}const t=k.view,e=de();if(!!!i.playerOpen){t.dataset.state!=="closed"&&(t.dataset.state="closed",Oa("closed"),k.closeTimer&&clearTimeout(k.closeTimer),k.closeTimer=setTimeout(()=>{k.closeTimer=null,!i.playerOpen&&(t.hidden=!0,Wr(),hs())},Nc()+20));return}k.closeTimer&&(clearTimeout(k.closeTimer),k.closeTimer=null),t.hidden=!1,await Za();const s=i.pvMode||i.config.playerViewMode||"",a=k.mountedId!==s;if(a&&(Zc(s),hs()),(t.dataset.state!=="opened"||a)&&(t.offsetHeight,t.dataset.state="opened",Oa("opened")),!k.skin)return;if(z.songId!==(e?.id??null)){z.songId=e?.id??null,z.cover=null,z.lyricsText=null,k.carouselSongId=e?.id??null,k.carouselIndex=i.coverSets.get(e?.id)?.active??0,Zs({type:"song"});const o=e?.id??null,l=await Fr(e);if((de()?.id??null)!==o)return;z.lyricsText=l.text,Zs({type:"lyrics"}),Ri();return}Zs();const r=ni(e);r.text!==z.lyricsText&&(z.lyricsText=r.text,Z({type:"lyrics",...Ae()})),Ri(),Kr()}function hs(){z.songId=null,z.cover=null,z.lyricsText=null,z.options=null,z.playing=null}function Kr({force:t=!1}={}){if(!i.playerOpen||!k.skin)return;const e=ks();(z.playing!==e.playing||t)&&(z.playing=e.playing,Z({type:"state",...e})),Z({type:"progress",...e,lyricIndex:ni(de()).index}),ld(e.playing)}const id=30,rd=32;let Gt=0,Yt=!1;function od(){const t=k.skin?.spectrum;if(!t)return 0;const e=Number(t);return!Number.isFinite(e)||e<=0?rd:Math.max(1,Math.min(256,Math.round(e)))}function ld(t){const e=t===!0?od():0;if(!e){if(Gt=0,!Yt)return;Yt=!1,Z({type:"spectrum",bands:null});return}const n=typeof performance<"u"&&performance.now?performance.now():Date.now();if(Gt&&n-Gt<1e3/id)return;const s=Qa(e);if(!s){if(!Yt)return;Gt=0,Yt=!1,Z({type:"spectrum",bands:null});return}Gt=n,Yt=!0,Z({type:"spectrum",bands:Array.from(s,a=>Math.round(a*1e3)/1e3)})}function cd(){k.themeObserver||(z.themeId=document.documentElement.dataset.theme||"",k.themeObserver=new MutationObserver(()=>{const t=document.documentElement.dataset.theme||"",e=document.documentElement.dataset.mode||"dark";t!==z.themeId&&(z.themeId=t,Z({type:"theme",themeId:t,mode:e}))}),k.themeObserver.observe(document.documentElement,{attributes:!0,attributeFilter:["data-theme","data-mode"]}))}function $n(t){const{skin:e,fellBack:n}=xn(t);e&&(i.pvMode=e.id,i.config.playerViewMode=e.id,hs(),x(),n&&console.warn(`[skins] 样式「${t}」不可用，已切换到「${e.name}」`))}function Gr(){i.playerOpen=!0,i.pvMode=xn(i.config.playerViewMode||"").skin?.id||i.pvMode,hs(),x()}function xs(){i.playerOpen=!1,x()}function Pa(){i.playerOpen?xs():Gr()}function ms(){return Lt().map(t=>({id:t.id,name:t.name,icon:t.icon||"disc",builtin:t.builtin!==!1,source:t.source||""}))}const dd=Wo;function In(){return i.config.showDesktopWallpaper===!0}function ea(){he()}async function ud(){if(!S())return!0;let t=!0,e="";try{const n=await _.desktopWallpaperState();t=n?.supported!==!1,e=n?.reason||""}catch(n){return console.info("[desktop-wallpaper] 能力探测失败",n?.message??n),!0}return t?!0:(i.desktopWallpaperSupport={supported:!1,reason:e||"当前系统不支持桌面背景歌词"},he(),!1)}async function Ni(t,{force:e=!1}={}){const n=!!t,s=In()!==n;if(i.config.showDesktopWallpaper=n,ea(),!s&&!e)return{ok:!0,enabled:n,unchanged:!0};if(!S())return n?(La(),{ok:!0,preview:!0,enabled:n}):($s({enabled:!1}),{ok:!0,preview:!0,enabled:n});try{const a=await _.desktopWallpaper(n);return n&&a?.ok===!1?(i.config.showDesktopWallpaper=!1,ea(),x()):n&&(pd(),La()),a}catch(a){return console.warn("[desktop-wallpaper] 打开/关闭桌面背景歌词失败",a),i.config.showDesktopWallpaper=!1,ea(),x(),{ok:!1,enabled:n,error:String(a?.message??a)}}}const I={setup:"",songId:"\0",cover:"\0",lyricsText:"\0",options:"",playing:null,volume:null,muted:null,duration:-1,lyricIndex:-2,position:-1,progressAt:0,progressPlaying:null};function pd(){I.setup="",I.songId="\0",I.cover="\0",I.lyricsText="\0",I.options="",I.playing=null,I.volume=null,I.muted=null,I.duration=-1,I.lyricIndex=-2,I.position=-1,I.progressAt=0,I.progressPlaying=null}function fd(){const t=[],e=bd();e.signature!==I.setup&&(I.setup=e.signature,t.push({type:"theme",skinId:e.skinId,themeId:e.theme,theme:e.theme,mode:e.mode,density:e.density,tokens:e.tokens}));const n=Xc(),s=Hr(),a=Qc({interactive:!1}),r=n.song?.id??"";r!==I.songId?(I.songId=r,I.cover=n.cover,I.lyricsText=n.lyrics.text,I.lyricIndex=n.lyrics.index,I.duration=s.duration,I.progressPlaying=s.playing,I.progressAt=Bi(),t.push({type:"song",song:n.song,cover:n.cover,covers:n.covers,coverIndex:n.coverIndex,lyrics:n.lyrics})):(n.cover!==I.cover&&(I.cover=n.cover,t.push({type:"media",cover:n.cover,covers:n.covers,coverIndex:n.coverIndex})),n.lyrics.text!==I.lyricsText&&(I.lyricsText=n.lyrics.text,I.lyricIndex=n.lyrics.index,t.push({type:"lyrics",lyrics:n.lyrics})));const o=JSON.stringify(a);o!==I.options&&(I.options=o,t.push({type:"options",options:a})),(s.playing!==I.playing||s.volume!==I.volume||s.muted!==I.muted)&&(I.playing=s.playing,I.volume=s.volume,I.muted=s.muted,t.push({type:"state",playing:s.playing,volume:s.volume,muted:s.muted}));const l=Bi(),c=vd(l,s.playing);return c&&t.push(c),(s.position!==I.position||n.lyrics.index!==I.lyricIndex||s.duration!==I.duration||s.playing!==I.progressPlaying)&&(I.position=s.position,I.lyricIndex=n.lyrics.index,I.duration=s.duration,I.progressPlaying=s.playing,I.progressAt=l,t.push({type:"progress",position:s.position,duration:s.duration,playing:s.playing,lyricIndex:n.lyrics.index})),t}function Bi(){return typeof performance<"u"&&performance.now?performance.now():Date.now()}const hd=40,md=32;let Xt=0,Qt=!1;function gd(){const t=i.pvMode||i.config.playerViewMode||"";try{const e=xn(t).skin?.spectrum;if(!e)return 0;const n=Number(e);return!Number.isFinite(n)||n<=0?md:Math.max(1,Math.min(256,Math.round(n)))}catch{return 0}}function vd(t,e){const n=In()&&e===!0?gd():0;if(!n)return Xt=0,Qt?(Qt=!1,{type:"spectrum",bands:null}):null;if(Xt&&t-Xt<hd)return null;const s=Qa(n);return s?(Xt=t,Qt=!0,{type:"spectrum",bands:Array.from(s,a=>Math.round(a*100)/100)}):Qt?(Xt=0,Qt=!1,{type:"spectrum",bands:null}):null}function La(){if(In()){if(!S()){const t=Hc();$s({text:t.text,playing:Hr().playing});return}for(const t of fd())_.updateDesktopWallpaper(t).catch(e=>{console.warn("[desktop-wallpaper] 同步背景歌词失败",e?.message??e)})}}function bd(){const t=_d(),e=i.pvMode||i.config.playerViewMode||"",n=document.documentElement.dataset.theme||"",s=document.documentElement.dataset.mode||"dark",a=document.documentElement.dataset.density||"";return{skinId:e,theme:n,mode:s,density:a,tokens:t.values,signature:[e,n,s,a,t.signature].join("|")}}function yd(){const t=i.config||{};return[document.documentElement.dataset.theme||"",document.documentElement.dataset.mode||"",document.documentElement.dataset.density||"",t.glassBlurCustom?t.glassBlur:"",t.glassAlphaCustom?t.glassAlpha:"",t.accentFromCover?1:0,t.coverSeed||"",t.coverSeed2||"",t.animations===!1?0:1,t.animationsSpeed||"",t.lyricsFontSize,t.listDensity||""].join("|")}let Fi="\0",zi={};function _d(){const t=yd();return t!==Fi&&(Fi=t,zi=wd()),{signature:t,values:zi}}function wd(){const t=new Set(Object.keys(sl()));for(const s of document.styleSheets){let a=null;try{a=s.cssRules}catch{continue}Yr(a,t,0)}const e=getComputedStyle(document.documentElement),n={};for(const s of t){const a=e.getPropertyValue(s).trim();!a||/[;{}]/.test(a)||(n[s]=a)}return n}function Yr(t,e,n){if(!(!t||n>3))for(const s of t){if(s.style)for(const a of s.style)a.startsWith("--")&&e.add(a);s.cssRules&&Yr(s.cssRules,e,n+1)}}const G=Object.freeze({off:"off",lyrics:"lyrics",wallpaper:"wallpaper"});function $d(){return i.config.showDesktopWallpaper===!0?G.wallpaper:i.config.showDesktopLyrics===!0?G.lyrics:G.off}async function Xr(t){const e=kd(t),n=$d();if(e===n)return{ok:!0,mode:e,unchanged:!0};const s=await Ui(e);return s?.ok!==!1?{ok:!0,...s,mode:e}:n!==G.off&&(await Ui(n))?.ok!==!1?{ok:!1,...s,mode:n,restored:!0}:{ok:!1,...s,mode:G.off}}async function Ui(t){return t!==G.lyrics&&await Pi(!1),t!==G.wallpaper&&await Ni(!1),t===G.lyrics?Pi(!0):t===G.wallpaper?Ni(!0):{ok:!0}}function kd(t){return t===G.lyrics?G.lyrics:t===G.wallpaper?G.wallpaper:G.off}const Sd=[{value:"play",label:"播放"},{value:"play-list",label:"播放该歌单"},{value:"next",label:"添加为一首播放"}],xd=[{value:"compact",label:"紧凑"},{value:"cozy",label:"标准"},{value:"roomy",label:"宽松"}],Cd=[{value:"fast",label:"快速 0.25s"},{value:"medium",label:"适中 0.5s"},{value:"slow",label:"缓慢 0.75s"}],Td={embedded:"内嵌歌词","lrc-file":"同目录 .lrc",cache:"歌词缓存",online:"在线自动匹配"};function Ed(){const e=(Array.isArray(i.config.lyricsSources)?i.config.lyricsSources:[]).map(n=>Td[n]||n);return e.length?e.join(" → "):"（未配置）"}function si(){const t=i.coverCache;if(!t)return"正在读取…";const e=((t.bytes||0)/1024/1024).toFixed(1);return`已缓存 ${A(t.covers||0)} 张封面、${A(t.lyrics||0)} 份歌词，共 ${e} MB`}function Qr(){const t=i.coverCache||{};return(Number(t.covers)||0)+(Number(t.lyrics)||0)}function Id(){const t="默认关闭：封面与歌词都只放在缓存目录里。开启后下载 / 更换封面时会把它们写进文件标签，这样把文件拷到别的播放器上也能看到封面与歌词（m4a / flac 支持，mp3 等格式会明确跳过）";return i.coverCache?Qr()===0?`${t}。当前缓存里还没有封面或歌词可写`:`${t}。缓存里已经有 ${si()}`:t}function Dd(){return`上面那个开关只对「之后」下载 / 更换的封面生效。缓存里已经存着的封面与歌词（${si()}）可以用这个按钮一次性写进歌曲文件；mp3 / wav 等暂不支持写标签的格式会被跳过，不会动你的文件。`}function ji(){const t=bs(),e=[];for(const s of t)for(const a of s.swatch||[])e.includes(a)||e.push(a);const n=e.map((s,a)=>`[data-swatch="${a}"]{background:${s}}`).join(`
`);return Ua("swatch-styles",n),s=>(s.swatch||[]).map(a=>e.indexOf(a))}function Ad(t){if(!t?.dir)return`（浏览器预览模式读不到本机目录，以下是源码仓库里的参考文件）
1. 接口唯一定义（含 JSDoc 类型）：frontend/packages/player-skins/src/contract.js
2. 内置三款实现（结构可参考）：frontend/packages/player-skins/src/skins/classic.js、immersive.js、minimal.js
3. 可直接复制改名的最小示例包：数据目录下的 player-skins/_template/（skin.js / skin.css / skin.json）
4. 说明文档：frontend/packages/player-skins/README.md`;const e=["本机真实路径如下。如果你能读文件，请先打开它们当范例；如果读不到（例如纯聊天环境），请让使用者把下面第 2 条的文件内容贴给你，再开始写。",`1. 样式（皮肤）目录 —— 第三方样式包都放在这里，扫描只认它下面的一层子目录：${t.dir}`];t.example?e.push(`2. 示例样式包（完整可运行的 skin.js / skin.css / skin.json，复制改名就是一份新样式）：${t.example}`):e.push("2. 示例样式包：本机没有找到 _template 目录，请只按本规格的接口定义写。"),t.current?e.push(`3. 当前正在使用的样式包（最贴近现状的参考）：${t.current}`):e.push(`3. 当前正在使用的是内置样式（${t.currentId||"classic / immersive / minimal"}）：它的源码打包在程序里，磁盘上没有对应目录，请以第 2 条的示例包为准。`);const n=Array.isArray(t.packs)?t.packs:[];if(n.length){e.push("4. 该目录里已有的第三方样式包（可以直接读它们的入口与样式）：");for(const s of n){const a=[s.module,...Array.isArray(s.styles)?s.styles:[]].filter(Boolean);e.push(`   · ${s.name||s.id}（id: ${s.id}）：${a.join("、")||s.dir}`)}}else e.push("4. 该目录里目前还没有第三方样式包 —— 你写的这个会是第一个。");return e.push("5. 宿主只加载 apiVersion 为 1 的样式，本程序用的就是这个版本。"),e.join(`
`)}function Md(t){if(!t?.dir)return`（浏览器预览模式读不到本机目录，以下是源码仓库里的参考文件）
1. 令牌默认值与注释：frontend/src/styles/tokens.css、frontend/src/styles/themes/_template.css
2. 内置主题（可直接对照写法）：frontend/src/styles/themes/dark-minimal.css、light-minimal.css、cover-dark.css
3. 扫描与指令解析实现：internal/theme/theme.go`;const e=["本机真实路径如下。如果你能读文件，请先打开它们当范例；如果读不到（例如纯聊天环境），请让使用者把下面第 2 条的文件内容贴给你，再开始写。",`1. 主题目录 —— 用户主题都放在这里，只扫一层、不递归；文件名默认就是主题 id，显示名由 @theme-name 决定：${t.dir}`];t.currentFile?e.push(`2. 当前正在使用的主题：${t.currentName||t.currentId}（id: ${t.currentId}）→ 文件：${t.currentFile}`):e.push("2. 当前主题的文件没找到，请以第 3 条列出的文件为准。");const n=Array.isArray(t.files)?t.files:[];if(n.length){e.push("3. 主题目录里已有的主题文件（都是合法示例，可直接对照写法）：");for(const s of n)e.push(`   · ${s.file}（${s.name||s.id}，id: ${s.id}，模式 ${s.mode}，${s.builtin?"内置":"用户导入"}）`)}else e.push("3. 主题目录里暂时没有 .css 文件。");return e.join(`
`)}function Od(t=null){return`请为「音乐播放器」（Go + WebView2 的 Windows 桌面应用）产出一个第三方「播放界面样式（皮肤）」包。这个包会被应用直接扫描并加载，因此必须严格满足下面的规格。

本说明只约定「产物必须满足哪些规则、格式、环境与参考」，不规定也不暗示视觉风格；风格由使用者自行构思。

【一、交付物与目录结构】
输出一个目录，目录名就是样式 id（建议小写字母、数字、短横线，例如 aurora；不能以 _ 或 . 开头，不要用空格与中文）：
  <样式id>/
    skin.js     必需，入口 ES module
    skin.css    可选，样式表
    skin.json   可选，清单：{"name":"显示名","version":"1.0.0","module":"skin.js","styles":["skin.css"]}
规则：
1. 没有 skin.json 也能工作（id、name 取目录名，入口默认 skin.js，样式取目录下全部 .css），但建议写上。
2. module 与 styles 必须是本目录内的相对路径，不能含 .. 或写成绝对路径。
3. 目录里可以放子目录与静态资源（.js .mjs .css .json .png .jpg .jpeg .webp .gif .svg .woff .woff2）；以 _ 或 . 开头的文件与目录不会被提供，请避开。
4. 不要依赖打包器、npm 包、CDN、外链字体或图片；产物必须能直接放进目录就运行。

【二、运行环境】
1. 原生 ES module，浏览器直接 import，没有打包与转译：skin.js 必须 export default 一个皮肤对象（宿主也接受名为 skin 的具名导出）。不要用需要 import 的 defineSkin(...) 之类的包装。
2. 页面 CSP：script-src 'self'；style-src 'self' 'unsafe-inline'；img-src 'self' data: blob: file:；media-src 'self' blob: file:。因此：
   · 不能加载任何外部资源（远程 JS / CSS / 字体 / 图片 / 接口请求都会被拦截）；
   · 不能 import CSS（浏览器原生不支持），skin.css 由宿主按清单自动插入；
   · 可以用相对路径 import 同目录下的其它 .js，图片与字体也用相对路径引用。
3. 内核是现代 Chromium（WebView2）：color-mix()、oklch()、:has()、CSS 嵌套等都可用。
4. 皮肤只在「播放详情页」里生效，宿主已经准备好容器：.playerview[data-skin="<样式id>"] 里的 #playerview-stage 就是 ctx.root；整窗背景层容器是 .skin-bg（在 .playerview 之外，因此 position: fixed 能铺满窗口）。
5. 深浅色主题、强调色、毛玻璃强度等都由应用的主题令牌决定，皮肤应跟随，不要写死。

【三、接口契约（必须严格遵守）】
export default {
  apiVersion: 1,                // 必需，且必须正好等于 1；其它值会被直接跳过
  id: "<样式id>",               // 必需，与目录名一致
  name: "<显示名>",             // 必需，显示在样式按钮的提示里
  icon: "disc",                 // 可选，图标 sprite id，见下
  order: 200,                   // 可选，样式按钮排序，越小越靠前（内置三款 10~30，第三方建议 >= 200）
  description: "<一句话说明>",  // 可选
  background: false,            // 可选，true 才需要整窗背景层（此时才用 ctx.backgroundRoot）
  mount(ctx) {},                // 必需，函数
  update(ctx, patch) {},        // 可选
  destroy(ctx) {}               // 可选
};
1. 缺 id / name / mount（或 mount 不是函数）都会导致加载失败，控制台会给出原因。
2. icon 取 index.html 里图标 sprite 的 id，可用值包括：disc / immersive / minimal / lyrics / lyric-match / slideshow / palette / image / music / album / headphones / play / pause / prev / next / shuffle / repeat / repeat-one / volume-high / volume-low / volume-mute / heart / download / bolt / check / sun / moon / expand / options / queue / settings / filter / trash；不确定就写 "disc"。

ctx 是皮肤唯一的入口（只读，直接改它不会生效）：
- ctx.root            你的挂载点（宿主已清空，往这里写 DOM）
- ctx.backgroundRoot  整窗背景层容器（background: true 时才用于渲染）
- ctx.audio           真实 <audio> 元素，只读：可以读 currentTime / buffered、挂事件监听；不要 play / pause / 改 src
- ctx.media()         返回 { song, cover, covers, coverIndex, lyrics }
                      · song：当前曲目对象，可能为 null，字段有 id / title / artist / album / duration / path / online 等
                      · cover：当前生效封面（data URL 或同源 URL）；covers：全部封面（轮播用，至少一张）；coverIndex：轮播下标
                      · lyrics：{ lines: [{ time, text }], text, source, index }，time 单位毫秒，index 是当前高亮行（-1 表示还没到第一句）
- ctx.playback()      返回 { position, duration, playing, volume, muted }，时间单位毫秒
- ctx.options()       返回 { showLyrics, lyricsFontSize, animations, coverCarousel, coverCarouselInterval }
- ctx.actions         只读动作：seek(ms) / togglePlay() / next() / prev() / openFolder() / openCoverPanel()
- ctx.on(type, fn)    订阅宿主推送，返回取消订阅的函数
- ctx.defaultCover    封面兜底图（内联 SVG data URL），封面加载失败时用它
- ctx.themeId         当前主题 id（getter）
- ctx.mode            当前深浅色 "dark" | "light"（getter）

宿主推送：update(ctx, patch) 与 ctx.on() 收到同一份 patch，patch.type 取值：
mount（挂载后立即推一次，带全量快照）/ song（换歌）/ media（封面变化或轮播切图）/ lyrics（歌词装载完成或更新）/ progress（播放进度，宿主已按帧节流）/ state（播放、暂停、音量变化）/ options（设置项变化）/ theme（主题或深浅色变化）/ resize（容器尺寸变化）/ close（详情页关闭）/ destroy（即将卸载，destroy 之前最后一次）。
patch 只带与该类型相关的字段；不确定时用 ctx.media() / ctx.playback() / ctx.options() 现取快照。

【四、CSS 约定】
1. skin.css 里每一条选择器都必须以 .playerview[data-skin="<样式id>"] 开头；需要影响详情页之外的外壳（标题栏、底栏）时可另加 .app[data-mode="<样式id>"]。不限定作用域会污染其它界面。
2. 不要写 :root / html / body / * 级别或裸标签选择器，不要用 !important 去覆盖别人的规则。
3. 可以直接使用主题令牌，深浅色会自动跟随：
   --accent / --accent-weak / --accent-weak-hover / --accent-text / --accent-contrast / --text-1 / --text-2 / --text-3 / --text-inverse / --surface-1 / --surface-2 / --surface-3 / --surface-hover / --surface-active / --glass-bg / --glass-bg-strong / --glass-blur / --glass-saturate / --glass-border / --border-1 / --border-2 / --divider / --r-sm / --r-md / --r-lg / --r-xl / --dur / --ease / --lyric-size
4. 不要改布局令牌（--h-titlebar / --w-sidebar / --h-playerbar / --h-header / --row-h / --row-h-compact），改了会破坏固定布局。
5. 需要私有变量时定义在自己的作用域里（例如 .playerview[data-skin="<样式id>"] 内），不要写到 :root。

【五、行为约束】
1. 不要 import 应用内部模块（store / bridge / utils / playerhost / @musicplayer/player-skins 等）；数据只从 ctx 拿，动作只走 ctx.actions；不要直接操作音频元素或应用状态。
2. 不要轮询：禁止用 setInterval 或定时 setTimeout 反复拉数据（动画、防抖、一次性延时除外）。
3. 歌词高亮用 ctx.media().lyrics.index 与 lines，不要自己解析 LRC 文本。
4. 动效要尊重 ctx.options().animations（为 false 时不要做位移动效）；时长与缓动优先用 --dur / --ease。
5. destroy(ctx) 里清掉定时器、事件监听、ResizeObserver 与大对象引用；切换样式会先 destroy 再 mount，两个方法都可能被多次调用。
6. 不要往 window / document 上挂全局变量或样式，不要改 document.documentElement 上的 data-* 属性。
7. 不要发网络请求（CSP 也会拦），不要用 eval / new Function。

【六、交付前自检清单】
1. 目录名 = id = skin.js 里的 id = CSS 选择器里的 data-skin 值；
2. skin.js 有 export default，且包含 apiVersion: 1、id、name、mount；
3. 每条 CSS 选择器都在 .playerview[data-skin="<样式id>"] 作用域内；
4. 没有裸包名 import、没有 fetch、没有 setInterval 轮询、没有全局选择器、没有 !important；
5. 换歌、歌词装载、进度更新、深浅色切换、窗口缩放、切走再切回都不会报错，也不留残余节点或监听。

【七、参考资料】
${Ad(t)}

【八、输出格式】
1. 先写清目录名与文件清单；
2. 再逐个文件输出完整代码，每个文件单独一个代码块，并在代码块第一行用注释标明文件名；
3. 不要省略、不要用省略号占位、不要留 __SKIN_ID__ 之类的占位符，代码要能直接运行。

【九、风格】
本提示词只约定产物必须满足的规则、格式、环境与参考，不规定也不暗示视觉风格；具体样式（布局、配色、动效、气质）由使用者自行构思。
请以使用者随附的风格说明为准；若使用者没有给出，先向使用者确认，不要自行假设。

【风格要求 · 由使用者自行填写（本行只是占位，本提示词不提供任何风格建议）】
`}function Pd(t=null){return`请为「音乐播放器」（Go + WebView2 的 Windows 桌面应用）产出一个「外观主题」CSS 文件。

本说明只约定「产物必须满足哪些规则、格式、环境与参考」，不规定也不暗示配色与气质；主题风格由使用者自行构思。

【一、交付物与格式】
1. 只交付 1 个 .css 文件（不要 HTML / JS / JSON，不要打包，不要 @import 外部资源）。
2. 文件名就是主题 id，建议小写字母、数字、短横线（例如 sunset）；不能以 _ 或 . 开头（会被当模板 / 隐藏文件跳过），不要用空格与中文。
3. 文件里只有一条规则，选择器固定为 :root[data-theme="<主题id>"]，与文件名一致最省事：

:root[data-theme="sunset"] {
  color-scheme: dark;
  /* 只声明你想覆盖的令牌，未声明的会自动回退到默认主题 */
}

4. 文件头可以写三行可选指令（建议写），供应用读取主题名 / 深浅模式 / 色板缩略图：

/* @theme-name 落日橘
   @theme-mode dark
   @theme-swatch #1a1020 #ff8a3d #ffd166 #fff4e6 #ff5a5f */

   · @theme-name 后跟显示名，可用中文；
   · @theme-mode 只能是 dark 或 light；
   · @theme-swatch 后跟若干（建议 5 个）代表色，第一个当底色、最后一个当强调色；
   · 不写也能用：名称取文件名，模式按文件名里的 dark / light 或 深色 / 浅色 猜（猜不到按 dark），色板从文件里的颜色字面量取前 5 个。

【二、加载与校验环境（决定哪些写法会被拒绝）】
1. 应用扫描主题目录下的 *.css，只扫一层，不支持子目录。
2. 文件名以 _ 或 . 开头的会跳过（_template.css 这类模板不参与）。
3. 文件里必须能匹配到 :root[data-theme="…"]，否则导入时会被判为「不像主题」并跳过。
4. 主题 id 取自这个选择器里的值；同 id 会互相覆盖，所以请保证 id 唯一。
5. 主题 CSS 被当作普通样式表注入页面；选中该主题时，文档根元素上会有 data-theme="<主题id>" 与 data-mode="dark|light"。
6. 页面 CSP 是 style-src 'self' 'unsafe-inline'：不能 @import 远程 CSS，不能 url() 外链网络字体或图片（同源、data: 可以用）。
7. 内核是现代 Chromium（WebView2）：color-mix()、oklch()、相对颜色、渐变、嵌套都可用，内置主题就用了 color-mix()。

【三、产物必须满足的规则】
1. 只声明设计令牌（CSS 自定义属性），不要写任何组件选择器、结构样式、@media 或关键帧。
2. 只写 :root[data-theme="<主题id>"] 这一条规则，不要用 !important，不要写 html / body / * 规则。
3. 不要改布局令牌：--h-titlebar / --w-sidebar / --h-playerbar / --h-header / --row-h / --row-h-compact，改了会破坏固定布局。
4. 不要覆盖 --bg-window（它由 tokens.css 从 --bg-app 派生）；想给「窗口原生材质（Mica / Acrylic）」叠一层底色时，改 --bg-window-material（默认全透明）。
5. 颜色要有明确层级和足够对比度：--text-1 对 --bg-app 与 --surface-1 的正文对比度应不低于 4.5:1，--text-2 / --text-3 仍要可读。
6. 深浅模式要自洽：写 dark 就整套按深色给值，写 light 就整套按浅色给值，不要一半深一半浅。
7. 文件必须自包含、可离线：不引用任何外部资源，不含 JS。
8. 可以只覆盖一部分令牌，其余回退默认；但 --bg-app / --text-1 / --accent / --accent-text / --accent-contrast 这几项建议一起给，免得强调色与文字色互相打架。

【四、可声明的令牌（参考清单，按需覆盖）】
- 表面：--bg-app（窗口底色）、--bg-canvas（背景渐变 / 纹理）、--surface-1 / --surface-2 / --surface-3 / --surface-hover / --surface-active
- 毛玻璃：--glass-bg / --glass-bg-strong / --glass-bg-weak / --glass-blur（0 表示关闭毛玻璃）/ --glass-saturate / --glass-border / --glass-highlight / --glass-shadow
- 文字：--text-1 / --text-2 / --text-3 / --text-inverse
- 描边：--border-1 / --border-2 / --divider / --focus-ring
- 强调色：--accent / --accent-weak / --accent-weak-hover / --accent-text / --accent-contrast
- 状态色：--heart / --heart-off / --danger / --success / --warning
- 播放页：--immersive-veil / --vinyl（唱片底纹）
- 圆角与动效：--r-sm / --r-md / --r-lg / --r-xl / --dur / --ease
完整默认值见 frontend/src/styles/tokens.css 与现成示例 frontend/src/styles/themes/_template.css。

【五、参考资料】
${Md(t)}

【六、交付前自检清单】
1. 只有一个 :root[data-theme="<主题id>"] 规则，且 id 与文件名一致；
2. 三行 @theme-* 指令齐备，@theme-mode 是 dark 或 light；
3. 没有组件选择器、没有布局令牌、没有 --bg-window、没有 @import / url() 外链、没有 !important；
4. 明暗层级清楚，正文对比度不低于 4.5:1。

【七、输出格式】
直接输出这个 CSS 文件的完整内容：一个代码块，第一行用注释标明文件名。不要省略、不要用省略号占位、不要附加其它文件。

【八、风格】
本提示词只约定产物必须满足的规则、格式、环境与参考，不规定也不暗示视觉风格；配色与气质由使用者自行构思。
请以使用者随附的风格说明为准；若使用者没有给出，先向使用者确认，不要自行假设。

【风格要求 · 由使用者自行填写（本行只是占位，本提示词不提供任何风格建议）】
`}function Jr({copyKey:t,importKind:e,importLabel:n}){return p`
    <div class="card__actions">
      <button class="btn btn--sm btn--primary" type="button" data-copy-prompt=${t}><svg aria-hidden="true"><use href="#i-file"></use></svg><span>复制提示词</span></button>
      <button class="btn btn--sm" type="button" data-import=${e}><svg aria-hidden="true"><use href="#i-folder"></use></svg><span>${n}</span></button>
    </div>`}async function Ld(){if(!S())return null;try{const t=document.documentElement.dataset.theme||i.config.theme||"";return await _.themeReference(t)||null}catch(t){return console.warn("[settings] 读取主题参考资料失败",t),null}}async function qd(){if(!S())return null;try{const t=i.pvMode||i.config.playerViewMode||"";return await _.skinReference(t)||null}catch(t){return console.warn("[settings] 读取样式参考资料失败",t),null}}async function Rd(t){const n=t==="theme"?Pd(await Ld()):Od(await qd());try{await navigator.clipboard.writeText(n),u("提示词已复制，粘贴给 AI 即可",{tone:"success",duration:2e3});return}catch{}const s=document.createElement("textarea");s.value=n,s.setAttribute("readonly",""),s.style.cssText="position:fixed;left:-9999px;top:0;opacity:0;",document.body.appendChild(s),s.select();let a=!1;try{a=document.execCommand("copy")}catch{a=!1}s.remove(),u(a?"提示词已复制，粘贴给 AI 即可":"复制失败，请手动复制",{tone:a?"success":"warning",duration:2600})}async function Nd(t,e={}){const n=t==="theme";if(!S()){u("浏览器预览模式无法导入，请手动把文件放进目录",{tone:"warning",duration:3600});return}const s=u(n?"正在导入主题…":"正在导入样式包…",{duration:0});try{const a=n?await _.importTheme():await _.importSkin();if(s.close(),a?.cancelled)return;const r=n?Array.isArray(a?.imported)?a.imported:[]:a?.id?[a.id]:[],o=Array.isArray(a?.skipped)?a.skipped:[];n?(await ys(),e.commit?.(),e.render?.()):(await ei(),e.render?.());let l=n?r.length?`已导入 ${r.length} 个主题：${r.join("、")}`:"没有导入任何主题":r.length?`已导入样式「${r[0]}」`:"没有导入任何样式";o.length&&(l+=`；另有 ${o.length} 个文件被跳过`),u(l,{tone:r.length?o.length?"warning":"success":"warning",duration:4600}),o.length&&ee({title:"部分文件没有导入",body:p`<div class="setting__hint setting__hint--steps">
          ${o.map((c,d)=>p`${d?p`<br />`:M}${c}`)}
        </div>`,okText:"知道了",cancelText:"关闭",onOk:()=>!0})}catch(a){s.close(),u(`导入失败：${a?.message??a}`,{tone:"error",duration:6e3})}}function Zr(t,e={}){t.addEventListener("click",n=>{const s=n.target.closest("[data-copy-prompt]");if(s){Rd(s.dataset.copyPrompt);return}const a=n.target.closest("[data-import]");a&&Nd(a.dataset.import,e)})}function Bd(t={}){const e=p`
    <div class="setting__hint setting__hint--steps">
      · 点「复制提示词」把它粘贴给 AI：提示词里只有产物的目录结构、接口契约与硬性规则，不含任何风格建议，风格请在末尾那条「风格要求」里自己补一句，它会直接产出一个样式包目录；<br />
      · 提示词里的「参考资料」会自动带上本机的真实路径（样式目录、示例包 _template、当前样式包），AI 能读文件就会直接照着写；<br />
      · 生成好后回到这里点「导入样式包」，选中那个目录即可（目录里必须有 skin.js）；<br />
      · 也可以手动放进「样式目录/&lt;样式id&gt;/」，回来点「重新扫描样式」。
    </div>
    ${Jr({copyKey:"skin",importKind:"skin",importLabel:"导入样式包…"})}
    <div class="setting__hint">接口的唯一定义在 frontend/packages/player-skins/src/contract.js；样式目录里也有现成的 _template 示例可以直接复制改名。</div>`,{root:n}=ee({title:"用 AI 创建播放界面样式",body:e,okText:"知道了",cancelText:"关闭",onOk:()=>!0});Zr(n,t)}function Fd(t={}){const e=p`
    <div class="setting__hint setting__hint--steps">
      · 点「复制提示词」把它粘贴给 AI：提示词里只有文件格式、令牌清单与校验规则，不含任何配色建议，风格请在末尾那条「风格要求」里自己补一句，它会产出一个主题 CSS；<br />
      · 提示词里的「参考资料」会自动带上本机的真实路径（主题目录、当前主题文件、目录里已有的主题 CSS），AI 能读文件就会直接照着写；<br />
      · 生成好后回到这里点「导入主题」，选中放着那个 CSS 的文件夹即可；<br />
      · 也可以手动放进主题文件夹（上面有「打开主题文件夹」按钮），回来点「重新扫描主题」。
    </div>
    ${Jr({copyKey:"theme",importKind:"theme",importLabel:"导入主题…"})}
    <div class="setting__hint setting__hint--steps">
      主题只声明设计令牌，不需要写组件样式，因此可以随便换皮肤而不会破坏布局：<br />
      · 选择器写 <b>:root[data-theme="你的文件名"]</b>，与文件名一致最省事；<br />
      · 只改你关心的令牌，例如 <b>--glass-bg</b> / <b>--accent</b> / <b>--text-1</b>；<br />
      · 未声明的令牌会自动回退到默认主题，缺失也不会写坏布局。
    </div>`,{root:n}=ee({title:"添加自定义主题",body:e,okText:"知道了",cancelText:"关闭",onOk:()=>!0});Zr(n,t)}async function zd(t,e,n){if(!S()){u("浏览器预览模式下不能移除，请手动删除主题文件",{tone:"warning",duration:3600});return}const s=u("正在移除主题…",{duration:0});try{const a=await ml(t);if(s.close(),!a.removed){u(`没有移除「${e}」`,{tone:"warning"});return}await Ie(i.config),n.commit?.(),n.render?.(),u(`已移除主题「${e}」`,{tone:"success"})}catch(a){s.close(),u(`移除失败：${a?.message??a}`,{tone:"error",duration:6e3})}}function Ud(t,e){const n=t.dataset.id,s=t.dataset.name||n;ee({title:`移除主题「${s}」？`,desc:"会删掉主题目录里对应的那个 CSS 文件。内置主题由程序在每次启动时重新生成，所以不提供移除。",okText:"移除",danger:!0,onOk:async()=>(await zd(n,s,e),!0)})}async function jd(t,e,n){if(!S()){u("浏览器预览模式下不能移除，请手动删除样式目录",{tone:"warning",duration:3600});return}const s=u("正在移除样式…",{duration:0});try{const a=await Kc(t);if(s.close(),!a.removed){u(`没有移除「${e}」`,{tone:"warning"});return}n.commit?.(),n.render?.(),u(`已移除样式「${e}」`,{tone:"success"})}catch(a){s.close(),u(`移除失败：${a?.message??a}`,{tone:"error",duration:6e3})}}function Hd(t,e){const n=t.dataset.id,s=t.dataset.name||n;ee({title:`移除样式「${s}」？`,desc:"会把样式目录里对应的整个文件夹删掉（里面只有这个样式的文件，不含歌曲）。",okText:"移除",danger:!0,onOk:async()=>(await jd(n,s,e),!0)})}async function gs(t,e={}){const n=t.dataset.act,s=t.dataset.id;switch(n){case"reset-desktop-lyrics-pos":{if(!S()){u("浏览器预览模式下没有独立歌词窗口",{duration:2200});return}try{const a=await _.resetDesktopLyricsPosition();a&&a.applied===!1?u("已清掉位置记忆；下次打开桌面歌词会用默认位置",{tone:"success",duration:2600}):u("桌面歌词已移回默认位置",{tone:"success",duration:2e3})}catch(a){u(`重置失败：${a?.message??a}`,{tone:"error",duration:5e3})}return}case"ai-field":{const a=t.dataset.key;if(!a)return;i.config[a]=t.value,e.commit?.();return}case"add-folder":{if(S()){let r=null;try{r=await _.addFolder("")}catch(o){u(`系统目录选择器不可用：${o?.message??o}`,{tone:"warning",duration:5e3}),r=null}if(r===null){const o=await Vi({manual:!0});if(!o)return;try{r=await _.addFolder(o)}catch(l){u(`添加失败：${l?.message??l}`,{tone:"error",duration:6e3});return}}if(r?.cancelled)return;if(r?.duplicated){u(`该文件夹已在曲库中：${r.path}`,{tone:"warning"});return}r?.folder?(i.folders=[...i.folders.filter(o=>o.id!==r.folder.id),r.folder],e.commit?.(),u(`已添加并开始扫描：${r.folder.path}`,{tone:"success"})):u("添加文件夹失败：后端没有返回结果",{tone:"error",duration:6e3});return}const a=await Vi();if(!a)return;i.folders.push({id:$t("folder"),path:a,trackCount:0,status:"ok",watching:i.config.watchFolders,addedAt:Date.now()}),e.commit?.(),u(`已添加文件夹：${a}`,{tone:"success"}),e.rescan?.();break}case"remove-folder":{const a=i.folders.find(r=>r.id===s);if(!a)return;ee({title:"移除音乐文件夹？",desc:`${a.path}
仅从曲库中移除，不会删除任何本地文件。`,okText:"移除",danger:!0,onOk:async()=>(S()&&await _.removeFolder(s),i.folders=i.folders.filter(r=>r.id!==s),e.commit?.(),u("已移除文件夹"),e.rescan?.({manual:!1}),!0)});break}case"scan-now":e.rescan?.({manual:!0});break;case"rescan-folder":u("正在重新扫描该文件夹…"),e.rescan?.({manual:!0});break;case"rule-add":i.filterRules.push({id:$t("rule"),type:"regex",op:"match",value:"",scope:"exclude",enabled:!0}),e.commit?.();break;case"rule-del":i.filterRules=i.filterRules.filter(a=>a.id!==s),e.commit?.(),e.refreshRules?.();break;case"rule-toggle":{const a=i.filterRules.find(r=>r.id===s);a&&(a.enabled=!a.enabled),e.commit?.(),e.refreshRules?.();break}case"rule-scope":{const a=i.filterRules.find(r=>r.id===s);a&&(a.scope=t.dataset.scope),e.commit?.(),e.refreshRules?.();break}case"preset-small":i.filterRules.push({id:$t("rule"),type:"size",op:"lt",value:"10240",unit:"B",scope:"exclude",enabled:!0}),e.commit?.(),e.refreshRules?.(),u("已添加：排除小于 10KB 的文件",{tone:"success"});break;case"preset-mp4":i.filterRules.push({id:$t("rule"),type:"regex",op:"match",value:"\\.mp4$",scope:"exclude",enabled:!0}),e.commit?.(),e.refreshRules?.(),u("已添加：排除 .mp4 文件",{tone:"success"});break;case"theme-pick":{const r=bs().find(o=>o.id===s);if(!r)return;i.config.theme=r.id,i.config.themeMode=r.mode,await Ie(i.config),e.commit?.(),e.render?.(),u(`已切换到主题「${r.name}」`,{tone:"success",duration:1600});break}case"open-theme-dir":{if(!S()){u("主题目录：frontend/src/styles/themes/",{duration:3200});break}try{const a=await _.themeDir();await _.revealThemeDir(),u(a?`已打开主题目录：${a}`:"已打开主题目录",{duration:3200})}catch(a){u(`打开主题目录失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"theme-help":Fd(e);break;case"theme-remove":Ud(t,e);break;case"reload-themes":if(S()){const a=await _.reloadThemes();await ys(),await Ie(i.config),e.commit?.(),u(`已重新扫描到 ${a?.length??0} 个主题`,{tone:"success"})}else u("浏览器预览模式下仅内置主题可用",{tone:"warning"});break;case"clear-cache":u("缓存清理需在后端实现（当前仅保存元数据缓存文件）",{tone:"warning"});break;case"skin-pick":{const a=ms().find(r=>r.id===s);if(!a)return;$n(a.id),e.commit?.(),e.render?.(),u(`播放界面已切换到「${a.name}」`,{tone:"success",duration:1600});break}case"open-skin-dir":{if(!S()){u("样式目录：frontend/packages/player-skins/",{duration:3200});break}try{const a=await _.skinDir();await _.revealSkinDir(),u(a?`已打开样式目录：${a}`:"已打开样式目录",{duration:3200})}catch(a){u(`打开样式目录失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"reload-skins":try{S()&&await _.reloadSkins(),await ei(),$n(i.pvMode||i.config.playerViewMode||""),e.render?.();const a=ms().length,r=zr();u(r.length?`已扫描到 ${a} 个样式，${r.length} 个加载失败`:`已扫描到 ${a} 个样式`,{tone:r.length?"warning":"success"})}catch(a){u(`重新扫描失败：${a?.message??a}`,{tone:"error"})}break;case"skin-help":Bd(e);break;case"skin-remove":Hd(t,e);break;case"ai-vendor":{const a=String(t.value||"auto");if(a===(i.config.aiVendor||"auto"))break;i.config.aiVendor=a,e.commit?.(),e.render?.();const r=Pr(a);u(`模型类型已设为「${wc(a)}」${r?"："+r:""}`,{duration:3600});break}case"backdrop-mode":{const a=Lr.includes(t.value)?t.value:"off";if(a===(i.config.nativeBackdrop||"off"))break;i.config.nativeBackdrop=a,e.commit?.(),e.render?.(),u(a==="off"?"已关闭窗口原生材质，重启应用后生效":`已选择「${Jn(a)}」，重启应用后生效`,{tone:"success",duration:3200});break}case"backdrop-restart":{if(!S()){u("浏览器预览无法重启应用",{tone:"warning"});break}u("正在重启应用…",{duration:2e3});try{await _.restartApp()}catch(a){u(`重启失败：${a?.message??a}`,{tone:"error",duration:6e3})}break}case"loudness-refresh":{if(!S())return;await ws();const a=await pn();e.commit?.(),u(`已重新拉取补偿（已测量 ${a?.measured??0} 首）`,{tone:"success"});break}case"loudness-clear":{if(!S())return;ee({title:"清除响度测量数据？",desc:"只会删除测量缓存，不会动你的音乐文件。清除后再次启用响度均衡会重新测量。",okText:"清除",danger:!0,onOk:async()=>(await _.loudnessClear(),i.loudnessGains={},await pn(),e.commit?.(),e.render?.(),u("已清除响度测量数据",{tone:"success"}),!0)});break}case"loudness-target":{const a=Number(t.value),r=i.config.loudnessTarget;if(a===r)break;i.config.loudnessTarget=a,e.commit?.(),await Lc(),await pn(),e.render?.(),u(`目标响度已设为 ${a} LUFS，旧补偿已失效，将按新标准重算`,{tone:"success",duration:3200});break}case"download-dir-pick":{if(!S()){u("浏览器预览无法调用系统目录选择器",{tone:"warning"});break}try{const a=await _.downloadPickDir();if(a?.cancelled)break;await Hi(a,e)}catch(a){u(`无法更改下载位置：${a?.message??a}`,{tone:"error",duration:6e3})}break}case"download-dir-open":{if(!S())break;try{await _.downloadOpenDir(i.config.downloadDir||"")}catch(a){u(`打开失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"download-dir-reset":{if(!S())break;try{const a=await _.downloadSetDir("");if(a?.cancelled)break;const r=a?.next?a:await _.downloadSetDir("");await Hi(r,e)}catch(a){u(`恢复默认失败：${a?.message??a}`,{tone:"error",duration:6e3})}break}case"cache-open-covers":case"cache-open-lyrics":{if(!S())break;try{await _.coverOpenCacheDir(n==="cache-open-covers"?"covers":"lyrics")}catch(a){u(`打开缓存目录失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"cover-refresh":{if(!S())break;try{const a=await _.coverClearCache();i.coverCache=await _.coverCacheStats(),await to(),e.commit?.(),e.render?.(),u(`已清空缓存（封面 ${a?.covers??0} 张、歌词 ${a?.lyrics??0} 份）`,{tone:"success"})}catch(a){u(`清空失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"embed-cache-write":await eo({ctx:e,force:!0});break}}async function eo({ctx:t={},force:e=!1}={}){if(!S()){e&&u("写入歌曲文件需要后端支持，浏览器预览不可用",{tone:"warning"});return}for(let a=0;a<20&&!i.coverCache;a++)await new Promise(r=>setTimeout(r,100));if(!i.coverCache&&e)try{i.coverCache=await _.coverCacheStats()}catch{}if(Qr()===0){e?u(i.coverCache?"缓存里还没有封面或歌词，暂时没有可写入的内容":"暂时读不到缓存统计，请稍后再试",{duration:3400}):i.coverCache&&u("已开启：以后下载 / 更换封面时会把封面与歌词写进歌曲文件",{duration:3600});return}const n=Number(i.coverCache?.covers)||0,s=Number(i.coverCache?.lyrics)||0;ee({title:"要把已有的缓存写进歌曲文件吗？",body:p`
      <div class="setting__hint">
        缓存目录里已经有 <b>${A(n)}</b> 张封面、<b>${A(s)}</b> 份歌词。
        它们现在只放在缓存目录里；写进歌曲文件之后，把文件拷到别的播放器上也能看到。
      </div>
      <div class="setting__hint">
        写入只会在原文件的标签里做最小插入 / 替换（m4a 的 covr 与 ©lyr、FLAC 的 PICTURE 与 LYRICS），
        不动音频数据；mp3、wav、ogg 等格式会被跳过。这一步无法撤销，但不会影响播放。
      </div>`,okText:"写入文件",cancelText:"暂不写入",onOk:async()=>(await Wd(t),!0)})}async function Wd(t={}){const e=u("正在把缓存写入歌曲文件…",{duration:0}),n=se("meta:embed-progress",s=>{const a=Number(s?.done)||0,r=Number(s?.total)||0,o=s?.title?" · "+s.title:"";e.update(r?"正在写入歌曲文件 "+a+"/"+r+o:"正在把缓存写入歌曲文件…")});try{const s=await _.coverWriteCacheToFiles(),a=Number(s?.written)||0,r=Number(s?.skipped)||0,o=Number(s?.failed)||0,l=Number(s?.total)||0;if(e.close(),!l){u("缓存里还没有封面或歌词，暂时没有可写入的内容",{duration:3200});return}let c=`已写入 ${A(a)} 首`;s?.covers&&(c+=`（封面 ${A(s.covers)}）`),s?.lyrics&&(c+=`（歌词 ${A(s.lyrics)}）`),r&&(c+=`，跳过 ${A(r)} 首`),o&&(c+=`，失败 ${A(o)} 首`),u(c,{tone:o?"warning":r?"info":"success",duration:5200});const d=Array.isArray(s?.reasons)?s.reasons:[];d.length&&ee({title:o?"部分歌曲没能写入":"部分歌曲已跳过",body:p`<div class="setting__hint setting__hint--steps">
          ${d.map((m,h)=>p`${h?p`<br />`:M}${m}`)}
        </div>`,okText:"知道了",cancelText:"关闭",onOk:()=>!0}),i.coverCache=await _.coverCacheStats(),t.commit?.(),t.render?.()}catch(s){e.close(),u(`写入失败：${s?.message??s}`,{tone:"error",duration:6e3})}finally{n()}}async function Hi(t,e){if(!t||t.cancelled)return;const n=t.next;if(!n)return;if(t.same){u("这个位置就是当前的下载目录",{duration:2200});return}const s=Number(t.count)||0,a=((Number(t.bytes)||0)/1024/1024).toFixed(1),r=Number(t.nextCount)||0;if(s===0){await ta(n,!1,e);return}const o=p`
    <div class="setting__hint">
      当前下载目录里有 <b>${A(s)}</b> 首歌曲（约 ${a} MB）。
      要一并搬到新目录吗？
    </div>
    <div class="dir-compare">
      <div class="dir-compare__row">
        <span class="dir-compare__tag">从</span>
        <span class="dir-compare__path u-selectable">${t.current||""}</span>
      </div>
      <div class="dir-compare__row">
        <span class="dir-compare__tag">到</span>
        <span class="dir-compare__path u-selectable">${n}</span>
      </div>
    </div>
    ${r?p`<div class="setting__hint">新目录里已经有 ${A(r)} 首歌曲，同名的不会被覆盖。</div>`:M}
    <div class="setting__hint">不迁移的话，旧目录里的歌曲会留在原地；新目录会成为新的默认保存位置。</div>`;ee({title:"更改下载位置",body:o,okText:"迁移并更改",cancelText:"不迁移，只更改位置",onOk:async()=>(await ta(n,!0,e),!0),onCancel:async()=>{await ta(n,!1,e)}})}async function ta(t,e,n){try{const s=await _.downloadApplyDir(t,e);if(s?.dir&&(i.config.downloadDir=s.dir),n.commit?.(),n.render?.(),!e){u(`下载位置已改为：${s?.dir||t}`,{tone:"success",duration:3200});return}const a=Number(s?.migrated)||0,r=Number(s?.skipped)||0,o=Array.isArray(s?.failed)?s.failed:[];let l=`已迁移 ${A(a)} 首`;r&&(l+=`，跳过 ${A(r)} 首（新目录已有同名文件）`),o.length&&(l+=`，${A(o.length)} 首失败`),u(`${l}；新位置：${s?.dir||t}`,{tone:o.length?"warning":"success",duration:4200})}catch(s){u(`更改下载位置失败：${s?.message??s}`,{tone:"error",duration:6e3})}}async function to(){if(!S())return i.coverProviders=[],i.coverBreaker={},null;try{const t=await _.coverProviders();return i.coverProviders=Array.isArray(t?.providers)?t.providers:[],i.coverBreaker=t?.breaker&&typeof t.breaker=="object"?t.breaker:{},t}catch{return i.coverProviders=[],i.coverBreaker={},null}}let Wi=!1;function Vd(){if(Wi)return;Wi=!0;const t=S()?_.coverCacheStats().then(e=>(i.coverCache=e,e)).catch(()=>null):Promise.resolve(null);Promise.all([to(),t]).then(()=>{he()})}function Vi({manual:t=!1}={}){return new Promise(e=>{ee({title:"添加音乐文件夹",desc:t?"系统目录选择器没能打开，请直接粘贴文件夹完整路径。":"浏览器预览模式下无法调用系统目录选择器，请手动输入路径。",body:p`<input class="input" data-field="path" type="text" placeholder="C:\\Users\\Example\\Music" />`,okText:"添加",onOk:n=>{const s=String(n.path||"").trim();return s?(e(s),!0):"请输入路径"}})})}function Kd(t,e={}){const n=t.dataset.toggle;if(n){const a=t.getAttribute("aria-checked")!=="true";return n==="showDesktopLyrics"||n==="showDesktopWallpaper"?(Xr(n==="showDesktopLyrics"?a?"lyrics":"off":a?"wallpaper":"off").then(o=>{o.ok===!1&&u(`打不开：${o.reason||o.error||"未知原因"}`,{tone:"warning",duration:3200}),e.commit?.()}),e.commit?.(),!0):(t.setAttribute("aria-checked",String(a)),n in i.config&&(i.config[n]=a,n==="animations"&&lt("--dur",ma(i.config)),n==="minimizeToTray"&&S()&&_.minimizeToTray(a).catch(r=>{console.warn("[settings] 同步托盘开关失败",r)}),n==="watchFolders"&&(i.folders.forEach(r=>r.watching=a),S()&&_.setWatchers(a).catch(r=>{console.warn("[settings] 切换实时监听失败",r)}))),e.commit?.(),n==="embedMeta"&&a&&eo(),!0)}const s=t.closest("[data-segment]")?.dataset.segment;if(s){const a=t.dataset.value;if(t.parentElement.querySelectorAll(".segmented__btn").forEach(r=>{r.setAttribute("aria-pressed",String(r===t))}),s==="themeMode"){i.config.themeMode=a;const r=bs(),o=window.matchMedia("(prefers-color-scheme: dark)").matches,l=a==="system"?o?"dark":"light":a,c=r.find(d=>d.mode===l&&d.id!=="cover-dark")||r[0];i.config.theme=c.id,Ie(i.config)}else if(s in i.config){const r=["lyricsLines","scanConcurrency"];i.config[s]=r.includes(s)?Number(a):a,s==="lyricsLines"&&lt("--lyric-pad",`${50-Number(a)*4}%`),s==="animationsSpeed"&&lt("--dur",ma(i.config)),s==="loudnessMode"&&ws()}return e.commit?.(),!0}return!1}function Gd(t,{silent:e=!1}={}){const n=t?.dataset?.id;if(!n)return;const s=i.config.rowClickAction||"next";if(s==="play"){ca(n);return}if(s==="play-list"){const a=i.visibleSongs.map(r=>r.id);ut(a,Number(t.dataset.index),gn());return}ar(n),e||u("已添加为下一首播放",{tone:"success",duration:1500})}const na=[{id:"album",label:"专辑",icon:"album",isOn:()=>i.config.showAlbumColumn!==!1,set:t=>{i.config.showAlbumColumn=t}}];function Yd(t,e){const n=[{kind:"label",label:"显示的列"}];for(const s of na)n.push({id:`col-${s.id}`,label:s.label,icon:s.icon,checked:s.isOn()});n.push({kind:"sep"}),n.push({id:"col-reset",label:"恢复默认列",icon:"refresh"}),bn({x:t,y:e,items:n,onPick:s=>{if(s==="col-reset"){for(const o of na)o.set(!0);x(),u("已恢复默认列",{duration:1400});return}const a=na.find(o=>`col-${o.id}`===s);if(!a)return;const r=!a.isOn();a.set(r),x(),u(r?`已显示「${a.label}」列`:`已隐藏「${a.label}」列`,{duration:1400})}})}function Ki(t,e,n=null){const s=Ge(e);if(!s)return;const a=!!s.online,r=Pt(e),o=i.queue.includes(e),l=[{id:"play",label:"播放",icon:"play"},{id:"play-next",label:"下一首播放",icon:"arrow-right"},{id:"sep1",kind:"sep"},{id:"queue-add",label:o?"从播放列表移除":"加入播放列表",icon:"queue"},{id:"like",label:r?"取消喜欢":"加入我喜欢",icon:"heart"},{id:"add-to",label:"加入歌单…",icon:"plus"}];if(a||l.push({id:"cover",label:"更换封面…",icon:"image"}),i.view==="queue")l.push({id:"sep2",kind:"sep"}),l.push({id:"remove-here",label:"从播放列表移除",icon:"trash",danger:!0});else if(i.view==="playlist"&&i.playlistId){const d=Re(i.playlistId);d&&!d.locked&&(l.push({id:"sep2",kind:"sep"}),l.push({id:"remove-here",label:`从「${d.name}」移除`,icon:"trash",danger:!0}))}a||(l.push({id:"sep3",kind:"sep"}),l.push({id:"reveal",label:"在文件夹中显示",icon:"folder"}));const c=d=>{switch(d){case"play":{const m=i.visibleSongs.map(g=>g.id),h=m.indexOf(e);h<0?ut([e],0,{type:"online",id:null}):ut(m,h,gn());break}case"cover":pt(()=>Promise.resolve().then(()=>ii),void 0).then(m=>m.openCoverPanel(e));break;case"play-next":ar(e),u("已设为下一首播放",{tone:"success",duration:1500});break;case"queue-add":o?(da(e),u("已从播放列表移除")):(Lo([e]),u("已加入播放列表",{tone:"success",duration:1500}));break;case"like":vs(e),u(r?"已从「我喜欢」移除":"已加入「我喜欢」",{tone:r?"info":"success",duration:1500});break;case"add-to":Xd(e);break;case"remove-here":i.view==="queue"?(da(e),u("已从播放列表移除")):i.playlistId&&(ir(i.playlistId,[e]),u("已从歌单移除"));break;case"reveal":pt(()=>import("./bridge-CJD-9QGY.js").then(m=>m.v),[]).then(m=>{m.backend.revealInExplorer(s.path),u("已在文件夹中定位（需接入后端）",{duration:1800})});break}};if(n)bn({x:n.x,y:n.y,items:l,onPick:c});else{const d=t.getBoundingClientRect();bn({x:d.left,y:d.bottom+6,items:l,onPick:c,align:"right"})}}function Xd(t){const e=i.playlists,{root:n}=ee({title:"加入歌单",body:p`
      <div class="setting__hint">点击歌单即可把这首歌加进去。</div>
      <div class="u-row u-wrap">
        ${e.map(s=>p`
            <button class="btn btn--sm" type="button" data-pl=${s.id}>
              <svg aria-hidden="true"><use href="#i-${s.id===Hn?"heart":"playlist"}"></use></svg>
              <span>${s.name}</span>
            </button>`)}
      </div>
    `,okText:"完成",cancelText:"关闭",onOk:()=>!0});n.addEventListener("click",s=>{const a=s.target.closest("[data-pl]");a&&ds(a.dataset.pl,[t])})}const Qd=1500;function Jd(t){t&&(t.classList.remove("is-located"),t.offsetWidth,t.classList.add("is-located"),window.setTimeout(()=>t.classList.remove("is-located"),Qd))}function no(t){if(t){try{t.scrollIntoView({block:"nearest",inline:"nearest"})}catch{Zd(t)}Jd(t)}}function Zd(t){const e=t.closest(".content-body, .queue-panel__body");if(!e)return;const n=t.getBoundingClientRect(),s=e.getBoundingClientRect(),a=e.classList.contains("content-body")?50:8,r=s.top+a;n.top<r?e.scrollTop-=r-n.top:n.bottom>s.bottom&&(e.scrollTop+=n.bottom-s.bottom)}function eu(t){const e=i.currentId;if(!e)return null;const n=t.querySelector(`.track[data-id="${CSS.escape(e)}"]`);return n?{el:n}:null}function tu(){const t=i.currentId;return t&&document.querySelector("#queue-panel-body")?.querySelector(`.queue-item[data-queue-id="${CSS.escape(t)}"]`)||null}function nu({notify:t=!0}={}){if(!i.currentId)return t&&u("当前没有正在播放的歌曲",{tone:"info",duration:1600}),!1;const e=document.getElementById("content-body"),n=e?eu(e):null;return n?(no(n.el),!0):(t&&u("当前播放的歌曲不在这个列表里",{tone:"info",duration:2200}),!1)}function so({notify:t=!0}={}){if(!i.queue.length)return t&&u("播放列表是空的",{tone:"info",duration:1600}),!1;const e=tu();return e?(no(e),!0):(t&&u("当前播放的歌曲不在播放列表里",{tone:"info",duration:2200}),!1)}let ao=0;function io(){ao=Date.now()}function ro(){return Date.now()-ao<260}function su(t=!1){const e=i.visibleSongs.map(n=>n.id);if(e.length){if(t)for(let n=e.length-1;n>0;n-=1){const s=Math.floor(Math.random()*(n+1));[e[n],e[s]]=[e[s],e[n]]}ut(e,0,gn()),u(t?"已随机播放":`开始播放 ${A(e.length)} 首`,{duration:1600})}}const au={library:"本地歌曲",queue:"播放列表",playlist:"歌单"},Gi={commit:x,rescan:()=>_n({manual:!0})};class iu extends me{static deps=e=>[e.view,e.playlistId,e.playlistVersion,e.query,e.visibleVersion,e.visibleSongs.length,e.sortKey,e.sortDir,e.songs.length,e.folders.length,e.scanning,e.playlistSelecting,e.selectedIds,e.lastScan?.at??0,e.config.listDensity];render(){const e=i.view,n=e==="playlist"?Re(i.playlistId):null;return p`
      <main class="main" id="main">
        <div class="content-header" id="content-header" @click=${s=>this.onHeaderClick(s)} @change=${s=>this.onHeaderChange(s)}>
          <div class="content-header__titles">
            <h1 class="content-header__title" id="content-title">
              ${e==="playlist"&&n?n.name:au[e]||"本地歌曲"}
            </h1>
            <p
              class="content-header__subtitle"
              id="content-subtitle"
              data-scanning=${String(i.scanning)}
            >${this.subtitle(e,n)}</p>
          </div>
          <div class="content-header__actions">
            <div class="content-filter" id="content-filter" ?hidden=${e!=="library"}>
              <div class="content-filter__field">
                ${f("search","content-filter__icon")}
                <input
                  class="content-filter__input"
                  id="content-filter-input"
                  type="text"
                  placeholder="筛选本地歌曲"
                  autocomplete="off"
                  spellcheck="false"
                  aria-label="筛选本地歌曲"
                  .value=${i.query}
                  @input=${s=>{i.query=s.target.value,x()}}
                  @keydown=${s=>{s.key==="Escape"&&(s.preventDefault(),Ps(),s.target.blur())}}
                />
                <button
                  class="content-filter__clear"
                  id="content-filter-clear"
                  type="button"
                  aria-label="清空筛选"
                  ?hidden=${i.query.length===0}
                  @click=${()=>{Ps(),this.querySelector("#content-filter-input")?.focus()}}
                >${f("close")}</button>
              </div>
              <span class="content-filter__count" id="content-filter-count">
                ${i.query.trim()?`匹配 ${A(i.visibleSongs.length)} 首`:""}
              </span>
            </div>
            <div class="content-header__tools" id="content-tools">${this.toolbar()}</div>
          </div>
        </div>
        <div class="content-body" id="content-body">${this.body()}</div>
      </main>
    `}subtitle(e,n){const s=i.visibleSongs,a=s.reduce((r,o)=>r+o.duration,0);if(e==="library"){const r=i.lastScan;return`${A(s.length)} 首 · 共 ${Ts(a)} · ${A(i.folders.filter(o=>o.id!=="auto_downloads").length)} 个文件夹${r&&r.excluded?` · 已过滤 ${A(r.excluded)} 个文件`:""}`}if(e==="queue"){const r=i.currentId?s.findIndex(o=>o.id===i.currentId):-1;return`${A(s.length)} 首 · 共 ${Ts(a)}${r>=0?` · 正在播放第 ${r+1} 首`:""}`}return e==="playlist"&&n?`${A(n.songIds.length)} 首 · 共 ${Ts(a)} · ${n.locked?"默认歌单（不可删除）":"自定义歌单"}`:e==="playlist"?"歌单不存在":""}toolbar(){const e=i.view,n=p`<button class="btn btn--primary" type="button" data-tool="play-all">${f("play")}<span>播放全部</span></button>`,s=p`<button class="btn btn--icon" type="button" data-tool="locate" data-tip="定位到当前播放" aria-label="定位到当前播放">${f("disc")}</button>`,a=p`
      <div class="select">
        <select class="select__field" id="select-sort" aria-label="排序方式">
          ${[["addedAt","添加时间"],["title","标题"],["artist","歌手"],["album","专辑"],["duration","时长"],["size","文件大小"],["playCount","播放次数"]].map(([r,o])=>p`<option value=${r} ?selected=${i.sortKey===r}>${o}</option>`)}
        </select>
        ${f("chevron-down","select__icon")}
      </div>
    `;if(e==="queue")return p`
        <button class="btn" type="button" data-tool="queue-clear">${f("trash")}<span>清空列表</span></button>
        ${n}${s}
      `;if(e==="playlist"){if(i.playlistSelecting){const r=i.selectedIds.size,o=i.visibleSongs.length>0&&i.visibleSongs.every(l=>i.selectedIds.has(l.id));return p`
          <span class="toolbar__selinfo">已选 ${A(r)} 首</span>
          <button class="btn btn--sm" type="button" data-tool="sel-all">${f("check")}<span>${o?"取消全选":"全选"}</span></button>
          <button class="btn btn--sm btn--danger" type="button" data-tool="sel-remove" ?disabled=${!r}>${f("trash")}<span>移除所选</span></button>
          <button class="btn btn--sm btn--primary" type="button" data-tool="pl-select">${f("close")}<span>完成</span></button>
        `}return p`
        ${a}${n}
        <button class="btn" type="button" data-tool="pl-select">${f("check")}<span>多选</span></button>
        <button class="btn" type="button" data-tool="pl-add">${f("plus")}<span>添加</span></button>
        ${s}
        <button class="btn btn--icon" type="button" data-tool="pl-more" data-tip="歌单操作">${f("more")}</button>
      `}return p`
      <button class="btn" type="button" data-tool="rescan">${f("refresh")}<span>重新扫描</span></button>
      ${a}${n}${s}
    `}body(){const e=i.view;if(!i.visibleSongs.length){const n=i.query.trim()?"search":e==="library"?"library":e==="queue"?"queue":"playlist";return this.empty(n)}return _c(`${e}|${i.playlistId??""}`,p`<div class="page"><mp-track-table></mp-track-table></div>`)}empty(e){const n={library:{icon:"music",title:"曲库还没有歌曲",desc:"在设置里添加本地音乐文件夹，程序会自动扫描并监听这些文件夹的变化。",ok:"添加音乐文件夹",act:"add-folder"},queue:{icon:"queue",title:"播放列表是空的",desc:"从「所有歌曲」或任意歌单里选择歌曲加入播放列表。",ok:"去所有歌曲",act:"goto-library"},playlist:{icon:"playlist",title:"这个歌单还没有歌曲",desc:"在「所有歌曲」里点击每首歌后面的爱心或更多菜单，把歌曲加进来。",ok:"去所有歌曲",act:"goto-library"},search:{icon:"search",title:"没有找到匹配的歌曲",desc:"换个关键词试试，或清空搜索框。",ok:"清空搜索",act:"clear-search"}},s=n[e]||n.library;return p`
      <div class="empty" data-empty=${e}>
        <svg class="empty__art" aria-hidden="true"><use href="#i-${s.icon}"></use></svg>
        <div class="empty__title">${s.title}</div>
        ${s.desc?p`<div class="empty__desc">${s.desc}</div>`:M}
        ${s.ok?p`<div class="empty__actions"><button class="btn btn--primary" type="button" data-empty-act=${s.act}>${s.ok}</button></div>`:M}
      </div>
    `}async onHeaderClick(e){const n=e.target.closest("[data-empty-act]")?.dataset.emptyAct;if(n){n==="add-folder"?await gs({dataset:{act:"add-folder"}},Gi):n==="goto-library"?Tt("library"):n==="clear-search"&&Ps();return}const s=e.target.closest("[data-tool]")?.dataset.tool;s&&await this.handleTool(s)}onHeaderChange(e){e.target.id==="select-sort"&&(i.sortKey=e.target.value,x())}async handleTool(e){switch(e){case"rescan":_n({manual:!0});break;case"add-folder":await gs({dataset:{act:"add-folder"}},Gi);break;case"play-all":su(!1);break;case"locate":nu();break;case"queue-clear":rr(),u("播放列表已清空");break;case"pl-select":li(!i.playlistSelecting);break;case"pl-add":i.playlistId&&vc(i.playlistId);break;case"sel-all":{const n=i.visibleSongs.length>0&&i.visibleSongs.every(s=>i.selectedIds.has(s.id));qo(n?[]:i.visibleSongs.map(s=>s.id));break}case"sel-remove":{const n=[...i.selectedIds];if(!n.length)break;const s=Re(i.playlistId),a=ir(i.playlistId,n);li(!1),u(`已从「${s?.name??"歌单"}」移除 ${A(a)} 首`,{tone:"success"});break}case"pl-more":Ca(i.playlistId,this.querySelector('#content-header [data-tool="pl-more"]'));break}}}te("mp-content",iu);const ru=Fa(class extends za{render(){return yt}update(t,[e]){const n=t.element;if(!n)return yt;dl(n);const s=e||Ke;if(n.getAttribute("src")===s)return yt;if(s.startsWith("data:"))return n.src=s,yt;n.__coverWant=s;const a=new Image;a.decoding="async";const r=()=>{n.__coverWant===s&&(n.src=s)};return a.addEventListener("load",r),a.addEventListener("error",r),a.src=s,yt}}),ai=t=>ru(t);class ou extends me{static deps=e=>[e.view,e.playlistId,e.visibleVersion,e.sortKey,e.sortDir,e.config.listDensity,e.config.showAlbumColumn,e.playlistSelecting,e.selectedIds,e.currentId,e.playing,e.likedIds,Sn(),e.visibleSongs.length];get mode(){return i.view==="queue"?"playlist":"library"}get selecting(){return i.view==="playlist"&&i.playlistSelecting}updated(){i.view==="queue"?this.bindQueueSort():this._sortable&&(this._sortable.destroy(),this._sortable=null)}disconnectedCallback(){this._sortable?.destroy(),this._sortable=null,super.disconnectedCallback()}bindQueueSort(){const e=this.querySelector(".tracks__body");e&&(this._sortable&&this._sortable.el===e||(this._sortable?.destroy(),this._sortable=T.create(e,{handle:"[data-handle]",draggable:".track",animation:0,ghostClass:"is-dragging",chosenClass:"is-dragging",onEnd:n=>{io();const s=n.oldIndex,a=n.newIndex;if(s==null||a==null||s===a)return;const r=n.from,o=Array.from(r.children).filter(l=>l!==n.item);r.insertBefore(n.item,o[s]??null),or(s,a),u("已调整播放顺序 · 播放模式已切回列表循环",{duration:1800})}})))}render(){const e=this.mode,n=i.visibleSongs;return p`
      <!-- 事件委托挂在 .tracks 上（范围含表头）：排序按钮在 .tracks__head 里，
           只挂 .tracks__body 的话点表头排序会没有反应。 -->
      <div
        class="tracks"
        data-mode=${e}
        data-density=${i.config.listDensity||"cozy"}
        data-album=${i.config.showAlbumColumn===!1?"off":"on"}
        @click=${s=>this.onClick(s)}
        @dblclick=${s=>this.onDblClick(s)}
        @contextmenu=${s=>this.onContextMenu(s)}
      >
        ${this.headTemplate(e)}
        <div class="tracks__body">
          ${Ee(n,s=>s.id,(s,a)=>this.rowTemplate(s,a,e))}
        </div>
      </div>
    `}headTemplate(e){const n=e!=="playlist",s=(a,r,o="")=>{if(!n)return p`<div class="tracks__sort ${o}" data-static="1">${r}</div>`;const l=["tracks__sort",o,i.sortKey===a&&i.sortDir==="asc"?"is-asc":""].filter(Boolean).join(" ");return p`<button
        class=${l}
        type="button"
        data-sort=${a}
        data-dir=${i.sortKey===a?i.sortDir:M}
      >${r}${f("chevron-down")}</button>`};return p`
      <div class="tracks__head" data-mode=${e}>
        <div class="col-handle"></div>
        <div class="col-index">#</div>
        <div class="col-cover"></div>
        ${s("title","标题")}
        ${s("album","专辑","col-album")}
        ${s("duration","时长")}
        <div class="col-heart" title="我喜欢">${f("heart")}</div>
        <div class="col-more"></div>
      </div>
    `}rowTemplate(e,n,s){const a=this.selecting,r=e.id===i.currentId,o=Pt(e.id),l=a&&i.selectedIds.has(e.id);return p`
      <div
        class="track"
        data-id=${e.id}
        data-index=${n}
        data-selectable=${a?"1":"0"}
        aria-selected=${String(l)}
        aria-current=${String(r)}
        data-playing=${r&&i.playing?"true":"false"}
      >
        ${s==="playlist"?p`<div class="track__handle" data-handle="1" title="拖动排序">${f("grip")}</div>`:p`<div class="col-handle"></div>`}
        <div class="track__index">${this.indexCell(e,n,a)}</div>
        <div class="track__cover">
          <img src=${ai(ht(e))} alt="" loading="lazy" draggable="false" />
        </div>
        <div class="track__main">
          <div class="track__title">${e.title}</div>
          <div class="track__sub">
            <span class="track__artist">${e.artist}</span>
            <span class="track__tag">${e.ext}</span>
          </div>
        </div>
        <div class="track__album u-ellipsis">${e.album}</div>
        <div class="track__time">${Ct(e.duration)}</div>
        <button
          class="track__heart"
          type="button"
          data-act="like"
          aria-pressed=${String(o)}
          aria-label="加入我喜欢"
          data-tip=${o?"取消喜欢":"加入我喜欢"}
        >${f("heart")}</button>
        <button class="track__more" type="button" data-act="more" aria-label="更多操作" aria-expanded="false">${f("more")}</button>
      </div>
    `}indexCell(e,n,s){if(s){const a=i.selectedIds.has(e.id);return p`<span class="track__check" role="checkbox" aria-checked=${String(a)}>${f("check")}</span>`}return p`
      <span class="track__num u-num">${n+1}</span>
      <div class="track__bars"><span></span><span></span><span></span><span></span></div>
      <button class="track__play" type="button" data-act="play" aria-label="播放 ${e.title}">${f("play")}</button>
    `}onClick(e){if(ro())return;const n=e.target.closest(".track");if(n&&i.view==="playlist"&&i.playlistSelecting){e.preventDefault(),Ro(n.dataset.id);return}const s=e.target.closest("[data-sort]");if(s){const l=s.dataset.sort;i.sortKey===l?i.sortDir=i.sortDir==="asc"?"desc":"asc":(i.sortKey=l,i.sortDir=l==="addedAt"?"desc":"asc"),x();return}const a=e.target.closest("[data-act]");if(!a){const l=e.target.closest(".track");l&&Gd(l,{silent:!1});return}const r=a.closest(".track"),o=r?.dataset.id;if(o)switch(a.dataset.act){case"play":{const l=i.visibleSongs.map(c=>c.id);ut(l,Number(r.dataset.index),gn());break}case"like":{vs(o);const l=Pt(o);u(l?"已加入「我喜欢」":"已从「我喜欢」移除",{tone:l?"success":"info",duration:1500});break}case"more":Ki(a,o);break}}onDblClick(e){if(i.view==="playlist"&&i.playlistSelecting)return;const n=e.target.closest(".track");if(!n)return;const s=i.visibleSongs.map(a=>a.id);ut(s,Number(n.dataset.index),gn()),i.playerOpen=!0,i.pvMode=i.config.playerViewMode,x()}onContextMenu(e){if(e.target.closest(".tracks__head")){e.preventDefault(),Yd(e.clientX,e.clientY);return}const s=e.target.closest(".track");s&&(e.preventDefault(),Ki(null,s.dataset.id,{x:e.clientX,y:e.clientY}))}}te("mp-track-table",ou);class lu extends me{static deps=e=>[e.playerOpen,e.pvMode,e.currentId,e.playing,e.position,e.duration,e.config.showLyrics,e.config.coverCarousel,e.config.coverCarouselInterval,Sn(),jr()];updated(){ad()}render(){const e=Ot(),s=this.coverList(e).length>1,a=i.config.coverCarousel===!0&&s,r=!e||!!e.online,o=ms();return p`
      <section
        class="playerview"
        id="playerview"
        hidden
        data-state="closed"
        data-skin="classic"
        data-lyrics=${i.config.showLyrics===!1?"off":"on"}
        aria-label="播放界面"
      >
        <div class="playerview__head">
          <button class="playerview__back" id="btn-player-back" type="button" @click=${()=>xs()}>
            ${f("arrow-left")}
            <span>返回</span>
          </button>
          <span class="u-spacer"></span>
          <div class="viewmode" id="playerview-cover-group" role="group" aria-label="封面">
            <button
              class="viewmode__btn"
              id="btn-player-cover"
              type="button"
              data-tip="更换封面"
              aria-label="更换封面"
              ?disabled=${r}
              @click=${()=>this.openCoverPanel(e)}
            >${f("image")}</button>
            <button
              class="viewmode__btn"
              id="btn-cover-carousel"
              type="button"
              aria-pressed=${String(a)}
              ?disabled=${!s}
              data-tip=${this.carouselTip(s,a)}
              aria-label="封面轮播"
              @click=${()=>this.toggleCarousel()}
            >${f("slideshow")}</button>
          </div>
          <div class="viewmode" id="playerview-mode" role="group" aria-label="播放界面样式">
            ${Ee(o,l=>l.id,l=>p`
                <button
                  class="viewmode__btn"
                  type="button"
                  data-pv-skin=${l.id}
                  data-pv-mode=${l.id}
                  aria-pressed=${String(i.pvMode===l.id)}
                  data-tip=${l.name||l.id}
                  aria-label=${l.name||l.id}
                  @click=${()=>$n(l.id)}
                >${f(l.icon||"disc")}</button>
              `)}
          </div>
        </div>
        <div
          class="playerview__stage"
          id="playerview-stage"
          @click=${l=>{l.target.closest(".disc__label, .disc__platter")&&sd()}}
        ></div>
      </section>
    `}coverList(e){if(!e)return[];const n=i.coverSets.get(e.id)?.items;return Array.isArray(n)?n.filter(s=>s?.preview):[]}carouselTip(e,n){if(!e)return"这首歌只有一张封面";const s=Number(i.config.coverCarouselInterval)||10;return n?"关闭封面轮播":`开启封面轮播（每 ${s} 秒换一张）`}openCoverPanel(e){!e||e.online||pt(()=>Promise.resolve().then(()=>ii),void 0).then(n=>n.openCoverPanel(e.id))}toggleCarousel(){i.config.coverCarousel=!i.config.coverCarousel,x(),u(i.config.coverCarousel?`已开启封面轮播（每 ${Number(i.config.coverCarouselInterval)||10} 秒换一张）`:"已关闭封面轮播",{duration:1600})}}te("mp-playerview",lu);function dt(t,e={}){const n=e.min??0,s=e.max??1,a=e.step??.001;let r=Ue(e.value??n,n,s),o=!1;const l=t.querySelector(".slider__fill"),c=t.querySelector(".slider__buffer"),d=t.querySelector(".slider__thumb"),m=t.querySelector(".slider__bubble");function h(){const w=s===n?0:(r-n)/(s-n)*100;l&&(l.style.width=`${w}%`),d&&(d.style.left=`${w}%`),m&&e.format&&(m.textContent=e.format(r)),t.setAttribute("aria-valuenow",String(Math.round(w)))}function g(w){const O=t.getBoundingClientRect();if(O.width<=0)return r;const C=Ue((w.clientX-O.left)/O.width,0,1),q=n+C*(s-n),ae=Math.round(q/a)*a;return Ue(Number(ae.toFixed(6)),n,s)}function y(w){if(!m)return;const O=t.getBoundingClientRect(),C=Ue(w.clientX-O.left,0,O.width);m.style.left=`${C}px`}t.addEventListener("pointerdown",w=>{t.dataset.disabled!=="true"&&(w.preventDefault(),o=!0,t.dataset.dragging="true",t.setPointerCapture?.(w.pointerId),r=g(w),h(),y(w),e.onChange?.(r))}),t.addEventListener("pointermove",w=>{y(w),o&&(r=g(w),h(),e.onChange?.(r))});const $=w=>{o&&(o=!1,t.dataset.dragging="false",t.releasePointerCapture?.(w.pointerId),e.onCommit?.(r))};return t.addEventListener("pointerup",$),t.addEventListener("pointercancel",$),t.addEventListener("keydown",w=>{if(t.dataset.disabled==="true")return;const O=(s-n)/10,C=a*10;let q=r;switch(w.key){case"ArrowRight":case"ArrowUp":q=r+C;break;case"ArrowLeft":case"ArrowDown":q=r-C;break;case"PageUp":q=r+O;break;case"PageDown":q=r-O;break;case"Home":q=n;break;case"End":q=s;break;default:return}w.preventDefault(),r=Ue(Number(q.toFixed(6)),n,s),h(),e.onChange?.(r),e.onCommit?.(r)}),h(),{get value(){return r},set(w,{silent:O=!1}={}){const C=Ue(w,n,s);C===r&&!O||(r=C,h(),O||e.onChange?.(r))},setDisabled(w){t.dataset.disabled=w?"true":"false"},setBuffer(w){c&&(c.style.width=`${Ue(w,0,100)}%`)},text(w=r){return e.format?e.format(w):String(w)},paint:h}}const cu="../bindings/musicplayer/index.js";let Fn=null;async function sa(){if(Fn)return Fn;try{const t=await import(cu);Fn=t&&t.OnlineService?t.OnlineService:null}catch(t){console.info("[online] backend unavailable",t)}return Fn}const du=new Set(["m4a","mp4","m4b","alac","aac","flac"]);let V="online";const v={songId:"",title:"",lines:[],cursor:0,undo:[],dirty:!1,kept:0,stale:!1};class uu extends me{static deps=e=>[e.lyricsOpen,e.currentId,e.position,e.playing,V,oo,i.config.embedMeta];constructor(){super(),this._draftText="",this._pendingText=null,this._nowIndex=-1,this._onlineMessage="",this._candidates=[],this._searching=!1,this._onlineKeyword="",this._draftTimer=null,this._lastNowPaint=0,this._lastScrolledNow=-1,this._lastScrolledCursor=-1,this._followHold=0,this._followAutoUntil=0,this._lastOnlineHint="在线歌词来源"}onConnected(){this._onKeyDownCapture=e=>this.onPanelKeyDown(e),document.addEventListener("keydown",this._onKeyDownCapture,!0)}onDisconnected(){document.removeEventListener("keydown",this._onKeyDownCapture,!0),this._draftTimer&&clearTimeout(this._draftTimer)}get open(){return i.lyricsOpen===!0}get panelEl(){return this.querySelector("#lyrics-panel")}updated(){const e=this.panelEl;if(e){if(e.hidden=!this.open,e.dataset.open=this.open?"true":"false",this._pendingText!==null){const n=this.querySelector("[data-editor-text]");n&&(n.value=this._pendingText),this._pendingText=null}this.open&&(V==="nudge"&&this.paintNudgeFollow(),V==="edit"&&this.paintEditorFollow())}}refreshAll(){this._refreshHeader(),fs().then(()=>{this._refreshHeader(),V==="online"&&this.refreshOnlineHint(),V==="edit"&&this.ensureDraft().then(()=>this.forceUpdate())})}_refreshHeader(){F()}render(){const e=ye(),n=e.song;return p`
      <section
        class="lyricspanel"
        id="lyrics-panel"
        role="dialog"
        aria-label="歌词工作台"
        data-open=${this.open?"true":"false"}
        data-tab=${V}
        hidden
        @click=${s=>this.onClick(s)}
        @input=${s=>this.onInput(s)}
      >
        <header class="lyricspanel__head">
          <img class="lyricspanel__cover" data-song-cover alt="" src=${n?ht(n):M} />
          <div class="lyricspanel__meta">
            <div class="lyricspanel__title" data-song-title>${n?n.title||"未命名":"未在播放"}</div>
            <div class="lyricspanel__sub">
              <span class="lyricspanel__badge${e.text?"":" is-empty"}" data-song-source data-src=${e.source}>
                ${Li(e.source)}
              </span>
              <span class="lyricspanel__artist" data-song-artist>${n&&n.artist||""}</span>
            </div>
          </div>
          <button class="lyricspanel__close" type="button" data-act="close" aria-label="关闭" @click=${()=>qa()}>${f("close")}</button>
        </header>

        <nav class="lyricspanel__tabs" role="tablist">
          ${["online","nudge","edit"].map(s=>p`
              <button
                class="lyricspanel__tab${V===s?" is-active":""}"
                type="button"
                role="tab"
                data-tab=${s}
                aria-selected=${String(V===s)}
                @click=${()=>hu(s)}
              >${s==="online"?"在线匹配":s==="nudge"?"微调":"手动编辑"}</button>
            `)}
        </nav>

        ${this.noticeTemplate(e)}
        <div class="lyricspanel__body">
          ${this.open?p`${this.onlinePane()} ${this.nudgePane(e)} ${this.editPane()}`:M}
        </div>
      </section>
    `}noticeTemplate(e){const n=V==="nudge"||V==="edit",s=e.source==="embedded"||e.source==="lrc-file";if(!n||!s)return M;const a=Li(e.source),r=mu(e.song),o=du.has(r);return p`
      <div class="lyricspanel__notice" data-notice>
        <div class="lyricspanel__notice-text" data-notice-text>
          ${o?p`这首歌的歌词来自「${a}」，它的优先级高于程序缓存：只保存到缓存的话，下次打开仍会显示旧歌词。建议同时写入歌曲文件。`:p`这首歌的歌词来自「${a}」，它的优先级高于程序缓存；而 ${r?"."+r:"该格式"} 不支持写入歌词标签，所以本次改动只在<b>本次运行内</b>生效（重启后会变回旧歌词）。`}
        </div>
        ${o?p`<label class="lyricspanel__notice-opt" data-notice-opt>
              <input type="checkbox" data-embed-toggle checked />
              <span>同时写入歌曲文件（否则下次打开仍显示旧歌词）</span>
            </label>`:M}
      </div>
    `}onlinePane(){return p`
      <section class="lyricspanel__pane" data-pane="online" ?hidden=${V!=="online"}>
        <div class="lyricspanel__row">
          <input
            class="lyricspanel__input"
            data-online-input
            placeholder="输入歌词搜索关键词"
            .value=${this._onlineKeyword}
            @input=${e=>{this._onlineKeyword=e.target.value}}
          />
          <button class="btn btn--primary" type="button" data-act="lyrics-search" @click=${()=>this.searchLyrics()}>搜索</button>
        </div>
        <div class="lyricspanel__hint" data-online-hint>${this._lastOnlineHint}</div>
        <div class="lyricspanel__list" data-online-results>
          ${this._searching?"搜索中…":this._onlineMessage?this._onlineMessage:this._candidates.length?Ee(this._candidates,(e,n)=>`${e.provider||""}-${e.id||n}`,(e,n)=>p`
                      <div class="candidate">
                        <div class="candidate__main">
                          <div class="candidate__title">${(e.title||"未命名")+" - "+(e.artist||"未知")}</div>
                          <div class="candidate__sub">
                            ${(e.provider||"")+" · score "+(e.score||0)+" · "+Ct(e.duration)}
                          </div>
                        </div>
                        <button class="btn btn--sm btn--primary" type="button" data-act="use-lyric" data-i=${n} @click=${()=>this.applyCandidate(n)}>使用</button>
                      </div>
                    `):"搜索结果会显示在这里，点击「使用」应用歌词"}
        </div>
      </section>
    `}nudgePane(e){const n=e.songId?Mt(e.songId):0,s=n<0?e.lines.filter(r=>r.time+n<0).length:0,a={lower:-1e4,upper:1e4};return p`
      <section class="lyricspanel__pane" data-pane="nudge" ?hidden=${V!=="nudge"}>
        <div class="nudge__readout">
          <span class="lyricspanel__hint">当前偏移</span>
          <b class="nudge__value" data-nudge-value>${(n>0?"+":"")+(n/1e3).toFixed(2)} 秒</b>
          <span class="nudge__dirty" data-nudge-dirty ?hidden=${n===0}>● 未应用</span>
          <span class="lyricspanel__hint" data-nudge-clamp ?hidden=${s===0}>
            ${s?`有 ${s} 行会被压到 0:00（已经不能再往前）`:""}
          </span>
        </div>
        <div class="nudge__block">
          <div class="lyricspanel__hint">听感校准：一边听一边点，改的是歌词出现的时间</div>
          <div class="nudge__feel">
            <button class="btn" type="button" data-act="nudge-feel" data-delta="500" @click=${()=>ia(500)}>
              歌词比声音<b>快</b>（出现太早）→ 整体延后 0.5s
            </button>
            <button class="btn" type="button" data-act="nudge-feel" data-delta="-500" @click=${()=>ia(-500)}>
              歌词比声音<b>慢</b>（出现太晚）→ 整体提前 0.5s
            </button>
          </div>
        </div>
        <div class="nudge__block">
          <div class="lyricspanel__hint">精细调整（50ms 一档）</div>
          <div class="nudge__steps">
            ${[-1e3,-500,-100,100,500,1e3].map(r=>p`<button class="btn btn--sm" type="button" data-act="nudge-step" data-delta=${r} @click=${()=>ia(r)}>${r>0?"+":"−"}${(Math.abs(r)/1e3).toFixed(1)}</button>`)}
          </div>
          <input
            class="nudge__range"
            type="range"
            min=${String(a.lower)}
            max=${String(a.upper)}
            step="50"
            .value=${String(n)}
            ?disabled=${!e.text}
            data-act="nudge-range"
            aria-label="整体偏移（毫秒）"
            @input=${r=>Qi(Number(r.target.value))}
          />
        </div>
        <div class="nudge__block nudge__block--grow">
          <div class="lyricspanel__hint">预览（点一行会跳到那一句）</div>
          <div class="lyricspanel__list" data-nudge-preview @scroll=${()=>this.onFollowScroll()}>
            ${this.nudgePreview(e,n)}
          </div>
        </div>
        <div class="lyricspanel__foot">
          <button class="btn btn--sm" type="button" data-act="nudge-reset" @click=${()=>gu()}>${M}重置</button>
          <span class="lyricspanel__hint">微调不会自动保存</span>
          <button class="btn btn--primary" type="button" data-act="nudge-apply" @click=${()=>this.applyNudge()}>应用到歌词</button>
        </div>
      </section>
    `}nudgePreview(e,n){if(!e.text)return"这首歌还没有歌词。可以先用「在线匹配」找一份，或者切到「手动编辑」自己贴一份。";const s=e.lines,a=Xi(s,n),r=Math.max(0,a-5),o=Math.min(s.length,a+6),l=[];for(let c=r;c<o;c+=1){const d=s[c],m=Math.max(0,d.time+n);l.push(p`
          <div
            class="nudge__line${c===a?" is-active":""}"
            data-act="nudge-seek"
            data-ms=${m}
            @click=${()=>kt(m)}
          >
            <span class="nudge__time">${Jt(d.time+n).slice(1,-1)}</span>
            <span class="nudge__text">${d.text}</span>
          </div>
        `)}return l}paintNudgeFollow(){if(V!=="nudge")return;const e=this.querySelector("[data-nudge-preview]");if(!e)return;const n=ye();if(!n.lines.length)return;const s=n.songId?Mt(n.songId):0,a=Xi(n.lines,s),r=e.querySelectorAll(".nudge__line");if(!r.length)return;const o=Number(r[0].dataset.index??-1);if(o<0)return;if(a<o||a>=o+r.length){F();return}const l=a-o;r.forEach((c,d)=>c.classList.toggle("is-active",d===l)),this.followScroll(e,r[l])}editPane(){const e=v.lines.filter(o=>typeof o.time=="number").length,n=co(),s=v.lines.length-e,a=n?`草稿属于《${Ge(v.songId)?.title||"上一首"}》`:s>0&&e>0?`还有 ${s} 行没有时间`:"",r=n?"已切歌，草稿仍属于上一首":v.kept>0?`已沿用 ${v.kept} 行原有时间`:v.dirty?"未保存":"";return p`
      <section class="lyricspanel__pane" data-pane="edit" ?hidden=${V!=="edit"}>
        <div class="editor__source">
          <div class="lyricspanel__row lyricspanel__row--between">
            <span class="lyricspanel__hint">歌词文本：粘贴纯文本即可（带时间标签也能识别）</span>
            <span class="lyricspanel__row-actions">
              <button class="btn btn--sm" type="button" data-act="editor-load" @click=${()=>_u()}>载入当前歌词</button>
              <button class="btn btn--sm" type="button" data-act="editor-clear-times" @click=${()=>yu()}>清空全部时间</button>
              <button class="btn btn--sm" type="button" data-act="editor-clear" @click=${()=>wu()}>清空文本</button>
            </span>
          </div>
          <textarea
            class="editor__text"
            data-editor-text
            spellcheck="false"
            placeholder="第一句&#10;第二句&#10;第三句&#10;…&#10;&#10;粘好之后点下面的「打轴并下一行」，一边听一边按空格"
            @input=${()=>this.scheduleDraftSettle()}
          ></textarea>
        </div>

        <div class="editor__transport">
          <button class="btn btn--icon" type="button" data-act="editor-play" data-tip="播放 / 暂停" @click=${()=>Su()}>
            ${f(i.playing?"pause":"play")}
          </button>
          <button class="btn btn--sm" type="button" data-act="editor-back" @click=${()=>kt(Math.max(0,i.position-5e3))}>−5s</button>
          <button class="btn btn--sm" type="button" data-act="editor-fwd" @click=${()=>kt(i.position+5e3)}>+5s</button>
          <span class="editor__clock" data-editor-clock>${Jt(i.position).slice(1,-1)}</span>
          <span class="editor__spacer"></span>
          <span class="lyricspanel__hint" data-editor-progress>已打轴 ${e} / ${v.lines.length}</span>
        </div>

        <button class="editor__tap" type="button" data-act="editor-tap" @click=${()=>ra()}>
          <span class="editor__tap-main">打轴并下一行</span>
          <span class="editor__tap-hint"><kbd>空格</kbd> 或点这里</span>
        </button>

        <div class="editor__tools">
          <button class="btn btn--sm" type="button" data-act="editor-undo" @click=${()=>vu()}>撤销</button>
          <button class="btn btn--sm" type="button" data-act="editor-prev" @click=${()=>Ji(-1)}>上一行</button>
          <button class="btn btn--sm" type="button" data-act="editor-next" @click=${()=>Ji(1)}>下一行</button>
          <span class="lyricspanel__hint" data-editor-tip>${r}</span>
        </div>

        <div class="editor__list" data-editor-list @scroll=${()=>this.onFollowScroll()}>
          ${this.draftList()}
        </div>

        <div class="lyricspanel__foot">
          <button class="btn btn--sm" type="button" data-act="editor-copy" @click=${()=>this.copyLrc()}>复制 LRC</button>
          <span class="lyricspanel__hint" data-editor-save-hint>${a}</span>
          <button class="btn btn--primary" type="button" data-act="editor-save" @click=${()=>this.saveDraft()}>保存并应用</button>
        </div>
      </section>
    `}draftList(){return v.lines.length?Ee(v.lines,(e,n)=>n,(e,n)=>{const s=typeof e.time=="number",a=["drow"];return n===v.cursor&&a.push("is-cursor"),s||a.push("is-untimed"),n===this._nowIndex&&a.push("is-now"),p`
          <div class=${a.join(" ")} data-act="editor-cursor" data-i=${n} @click=${()=>Ra(n)}>
            <span class="drow__no">${n+1}</span>
            <button class="drow__time" type="button" data-act="edit-seek" data-i=${n} data-tip="跳到这一句" @click=${r=>{r.stopPropagation(),$u(n)}}>
              ${s?Jt(e.time).slice(1,-1):"未打轴"}
            </button>
            <span class="drow__text">${e.text}</span>
            <button
              class="drow__clear"
              type="button"
              data-act="edit-clear"
              data-i=${n}
              aria-label="清除这一行的时间"
              ?hidden=${!s}
              @click=${r=>{r.stopPropagation(),bu(n)}}
            >${f("close")}</button>
          </div>
        `}):p`<div class="editor__empty">还没有歌词文本。把歌词粘到上面的文本框里，或点「载入当前歌词」。</div>`}onClick(e){const n=e.target.closest("[data-act], [data-tab]");if(!n||!this.contains(n))return;const s=n.dataset.act,a=Number(n.dataset.i);switch(s){case"close":qa();return;case"nudge-seek":kt(Number(n.dataset.ms));return;case"editor-cursor":Ra(a);return;case"editor-tap":ra();return}}onInput(e){const n=e.target;if(n.matches("[data-editor-text]")){this.scheduleDraftSettle();return}n.matches('[data-act="nudge-range"]')&&Qi(Number(n.value))}onPanelKeyDown(e){if(!this.open||V!=="edit"||e.key!==" "||e.ctrlKey||e.metaKey||e.altKey)return;const n=e.target;n&&(n.tagName==="TEXTAREA"||n.tagName==="INPUT")||this.contains(n)&&(e.preventDefault(),e.stopPropagation(),ra())}onFollowScroll(){Date.now()<this._followAutoUntil||(this._followHold=Date.now()+4e3)}followScroll(e,n,s=!1){if(!e||!n||!s&&Date.now()<this._followHold)return;const a=e.getBoundingClientRect(),r=n.getBoundingClientRect(),o=Math.max(0,e.scrollTop+(r.top-a.top)-(e.clientHeight-r.height)/2);Math.abs(e.scrollTop-o)<2||(this._followAutoUntil=Date.now()+700,e.scrollTo({top:o,behavior:"smooth"}))}prefillOnlineKeyword(){const e=aa();if(!e)return;const n=[e.title,e.artist].filter(Boolean).join(" ").trim();!n||n===this._onlineKeyword||(this._onlineKeyword=n,F())}async refreshOnlineHint(){const e=await sa();if(e)try{const n=await e.LyricsProviders?.(),s=Array.isArray(n?.providers)?n.providers:[];s.length&&(this._lastOnlineHint="在线歌词来源："+s.join(" / "),F())}catch{}}async searchLyrics(){const e=(this._onlineKeyword||"").trim();if(!e){u("请输入歌词搜索关键词",{duration:1500});return}const n=await sa();if(!n){u("在线歌词后端未就绪",{tone:"error"});return}const s=aa();this._searching=!0,this._onlineMessage="",F();try{const a=await n.SearchLyrics(e,s?s.title:"",s?s.artist:"",s?s.duration:0);this._candidates=Array.isArray(a)?a:[],this._onlineMessage=this._candidates.length?"":"没有找到候选歌词"}catch(a){this._candidates=[],this._onlineMessage="搜索失败："+(a.message||a)}finally{this._searching=!1,F()}}async applyCandidate(e){const n=this._candidates[e];if(!n)return;const s=aa();if(!s){u("请先播放一首歌曲",{tone:"warning"});return}const a=await sa();if(!a){u("在线歌词后端未就绪",{tone:"error"});return}try{const r=await a.FetchLyrics(n.provider,n.id);if(!r||!r.lrc){u("没有取到歌词",{tone:"warning"});return}const o=await Qs(s.id,r.lrc,r.source||"online",{embed:i.config.embedMeta===!0});ct(s.id,0),v.songId="",u(o?.note||"歌词已应用并保存",{tone:"success",duration:2e3}),F()}catch(r){u("获取歌词失败："+(r.message||r),{tone:"error"})}}async applyNudge(){const e=ye();if(!e.songId){u("请先播放一首歌曲",{tone:"warning"});return}const n=Mt(e.songId);if(!n){u("当前没有需要应用的调整",{duration:1800});return}if(!e.text){u("这首歌还没有歌词",{tone:"warning"});return}const s=Go(e.text,n),a=await Qs(e.songId,s,"edit:offset",{embed:Yi(e,this)});a!==!1&&(ct(e.songId,0),F(),u(a?.note||"已应用并保存",{tone:"success",duration:2600}))}async ensureDraft(e=!1){const n=ye();!e&&v.songId===n.songId&&v.lines.length||(v.songId=n.songId,v.title=n.song?.title||"",v.lines=n.text?ha(n.text):[],v.cursor=0,v.undo=[],v.dirty=!1,v.kept=0,v.stale=!1,this._nowIndex=-1,this._lastScrolledNow=-1,this._lastScrolledCursor=-1,this._followHold=0,this._followAutoUntil=0,this._pendingText=n.text||"",F())}scheduleDraftSettle(){this._draftTimer&&clearTimeout(this._draftTimer),this._draftTimer=setTimeout(()=>{this._draftTimer=null,this.syncDraftFromText()},300)}syncDraftFromText(){const e=this.querySelector("[data-editor-text]");if(!e)return;const n=ha(e.value),s=Yo(v.lines,n),a=s.filter((r,o)=>typeof r.time=="number"&&!(n[o]&&typeof n[o].time=="number")).length;zt(),v.lines=s,v.cursor>=s.length&&(v.cursor=Math.max(0,s.length-1)),v.dirty=!0,v.kept=a,F()}serializeDraftText(){return v.lines.map(e=>typeof e.time=="number"?Jt(e.time)+e.text:e.text).join(`
`)}setDraftText(e){this._pendingText=e,F()}async saveDraft(){const e=ye(v.songId);if(!e.songId){u("还没有可保存的内容：先播放一首歌再编辑",{tone:"warning"});return}const n=v.lines.filter(c=>typeof c.time=="number"&&Number.isFinite(c.time));if(!n.length){u("至少要先给一行打上时间",{tone:"warning"});return}const s=v.lines.length-n.length;let a=!1,r=-1/0;for(const c of v.lines)if(typeof c.time=="number"){if(c.time<r){a=!0;break}r=c.time}if(s||a){const c=p`
        ${s?p`<div class="lyricspanel__hint">还有 <b>${s}</b> 行没有时间：LRC 里没有时间标签的行会被忽略，保存后这些行不会显示。</div>`:M}
        ${a?p`<div class="lyricspanel__hint">时间不是升序，播放时高亮可能会跳来跳去。</div>`:M}
      `;if(!await xu({title:s?"还有歌词没有打轴":"时间不是升序",body:c,okText:"继续保存",cancelText:"返回编辑"}))return}const o=ci(v.lines),l=await Qs(e.songId,o,"manual",{embed:Yi(e,this)});l!==!1&&(ct(e.songId,0),v.undo=[],v.dirty=!1,v.songId=e.songId,F(),u(l?.note||"歌词已保存",{tone:"success",duration:2600}))}async copyLrc(){const e=ci(v.lines);if(!e){u("还没有可复制的歌词",{duration:1800});return}try{await navigator.clipboard.writeText(e),u("LRC 已复制到剪贴板",{tone:"success"})}catch{const n=document.createElement("textarea");n.value=e,n.style.cssText="position:fixed;left:-9999px;top:0;",document.body.appendChild(n),n.select();let s=!1;try{s=document.execCommand("copy")}catch{s=!1}n.remove(),u(s?"LRC 已复制到剪贴板":"复制失败，请手动选中文本",{tone:s?"success":"warning"})}}paintNowRow(){const e=performance.now();if(e-this._lastNowPaint<200)return;this._lastNowPaint=e;let n=-1;for(let s=0;s<v.lines.length;s+=1){const a=v.lines[s].time;typeof a=="number"&&a<=i.position&&(n=s)}n!==this._nowIndex&&(this._nowIndex=n,F())}paintEditorFollow(){this.paintNowRow(),this.scrollDraftRows()}scrollDraftRows(){const e=this.querySelector("[data-editor-list]");if(e){if(v.cursor!==this._lastScrolledCursor){const n=e.querySelector(`[data-i="${v.cursor}"]`);n&&(this._lastScrolledCursor=v.cursor,this.followScroll(e,n,!0))}if(this._nowIndex!==this._lastScrolledNow){const n=e.querySelector(`[data-i="${this._nowIndex}"]`);n&&this._nowIndex>=0&&(this._lastScrolledNow=this._nowIndex,this.followScroll(e,n))}}}}te("mp-lyrics-panel",uu);let oo=0;function F(){oo+=1,he()}const Ye=()=>document.querySelector("mp-lyrics-panel");function pu(t){i.lyricsOpen=!0,F();const e=Ye();e&&(e._refreshHeader(),e.prefillOnlineKeyword(),fs().then(()=>{e._pendingText=ye().text||"",V==="edit"&&e.ensureDraft(!0),V==="online"&&e.refreshOnlineHint(),F()}))}function qa(){i.lyricsOpen=!1;const t=ye();t.songId&&Mt(t.songId)&&(ct(t.songId,0),u("未应用的微调已丢弃",{duration:1800})),F()}function fu(t){i.lyricsOpen?qa():pu()}function hu(t){V=t==="nudge"||t==="edit"?t:"online";const e=Ye();e&&(V==="edit"&&e.ensureDraft().then(()=>F()),V==="online"&&e.refreshOnlineHint?.()),F()}function aa(){return Ge(i.currentId)||null}function mu(t){return String(t?.ext||"").replace(/^\./,"").toLowerCase()}function Yi(t,e){const n=e?.querySelector("[data-embed-toggle]"),s=e?.querySelector("[data-notice-opt]");return(t.source==="embedded"||t.source==="lrc-file")&&s&&n?!!n.checked:i.config.embedMeta===!0}function Xi(t,e){let n=-1;for(let s=0;s<t.length&&t[s].time+e<=i.position;s+=1)n=s;return n}function lo(){return{lower:-1e4,upper:1e4}}function ia(t){const e=ye();if(!e.songId){u("请先播放一首歌曲",{tone:"warning"});return}if(!e.text){u("这首歌还没有歌词，先去在线匹配或手动编辑",{tone:"warning",duration:2600});return}const n=lo(),s=Math.max(n.lower,Math.min(n.upper,Mt(e.songId)+t));ct(e.songId,s),F()}function Qi(t){const e=ye();if(!e.songId||!e.text)return;const n=lo(),s=Math.max(n.lower,Math.min(n.upper,Math.round(Number(t)||0)));ct(e.songId,s),F()}function gu(){const t=ye();t.songId&&(ct(t.songId,0),F())}function zt(){v.undo.push({lines:v.lines.map(t=>({...t})),cursor:v.cursor}),v.undo.length>50&&v.undo.shift()}function vu(){const t=v.undo.pop();if(!t){u("没有可撤销的操作",{duration:1500});return}v.lines=t.lines,v.cursor=Math.min(t.cursor,Math.max(0,t.lines.length-1)),v.dirty=!0,Ye()?.setDraftText(Cs()),F()}function Cs(){return v.lines.map(t=>typeof t.time=="number"?Jt(t.time)+t.text:t.text).join(`
`)}function Ji(t){if(!v.lines.length)return;const e=Math.max(0,Math.min(v.lines.length-1,v.cursor+t));e!==v.cursor&&(v.cursor=e,F())}function Ra(t){!Number.isFinite(t)||t<0||t>=v.lines.length||t===v.cursor||(v.cursor=t,F())}function ra(){if(!v.lines.length){u("先把歌词粘到上面的文本框里",{tone:"warning",duration:2200});return}if(co()){u("已切歌：先决定这份草稿怎么办（保存它，或点「载入当前歌词」重来）",{tone:"warning",duration:4200});return}const t=v.lines[v.cursor];t&&(zt(),t.time=Math.round(i.position/10)*10,v.dirty=!0,v.cursor<v.lines.length-1&&(v.cursor+=1),Ye()?.setDraftText(Cs()),F())}function bu(t){const e=v.lines[t];!e||typeof e.time!="number"||(zt(),e.time=null,v.dirty=!0,Ye()?.setDraftText(Cs()),F())}function yu(){v.lines.length&&(zt(),v.lines.forEach(t=>{t.time=null}),v.cursor=0,v.dirty=!0,Ye()?.setDraftText(Cs()),u("已清空全部时间，可以重新打轴",{duration:2e3}),F())}function _u(){const t=ye();if(!t.text){u("这首歌还没有歌词可载入",{duration:2e3});return}zt(),v.lines=ha(t.text),v.cursor=0,v.dirty=!0,v.songId=t.songId,v.title=t.song?.title||"",Ye()?.setDraftText(t.text),u("已载入当前歌词，可以逐行修正时间",{duration:2200}),F()}function wu(){zt(),v.lines=[],v.cursor=0,v.dirty=!0,Ye()?.setDraftText(""),F()}function $u(t){const e=v.lines[t];if(!e)return;let n=e.time;if(typeof n!="number"){for(let s=t-1;s>=0;s-=1)if(typeof v.lines[s].time=="number"){n=v.lines[s].time;break}}if(typeof n!="number"){u("这一行还没有时间，无法跳转",{duration:1600});return}kt(n),Ra(t)}function co(){return!!v.songId&&ye().songId!==v.songId&&ku()}function ku(){return v.lines.some(t=>typeof t.time=="number")}function Su(){kn()}function xu({title:t,body:e,okText:n,cancelText:s}){return new Promise(a=>{let r=!1;const o=l=>{r||(r=!0,a(l))};ee({title:t,body:e,okText:n,cancelText:s,onOk:()=>(o(!0),!0),onCancel:()=>(o(!1),!0)})})}const oa={sequence:{icon:"repeat",label:"列表循环"},"loop-all":{icon:"repeat",label:"列表循环"},"loop-one":{icon:"repeat-one",label:"单曲循环"},shuffle:{icon:"shuffle",label:"随机播放"}};function uo(t){const e=typeof t=="boolean"?t:!i.queueOpen;i.queueOpen=e,e&&(i.optionsOpen=!1),x()}function po(t){const e=typeof t=="boolean"?t:!i.optionsOpen;i.optionsOpen=e,e&&(i.queueOpen=!1),x()}function fo(t){const e=typeof t=="boolean"?t:!i.sleepOpen;i.sleepOpen=e,x()}function ho(){return go(i.config.showDesktopLyrics?G.off:G.lyrics,{on:"已开启桌面歌词",off:"已关闭桌面歌词"})}function mo(){return go(i.config.showDesktopWallpaper?G.off:G.wallpaper,{on:"已开启桌面背景歌词",off:"已关闭桌面背景歌词"})}async function go(t,{on:e,off:n}){const s=await Xr(t);return x(),s.ok!==!1?(u(t===G.off?n:e,{duration:1400}),s):(u(`打不开：${s.reason||s.error||"未知原因"}`,{tone:"warning",duration:3200}),s.restored&&u("已保留原来的桌面歌词设置",{duration:1800}),s)}function Cu(t){const e=Math.round(Number(t)||0);if(e<=0){vo("已取消定时停止");return}i.sleepTimer={type:"duration",until:Date.now()+e*6e4,minutes:e},x(),u(`${e} 分钟后停止播放`,{duration:1800})}function vo(t){i.sleepTimer=null,x(),u(t,{duration:1400})}function Tu(t){i.config.sleepAfterSong=!!t,x(),u(i.config.sleepAfterSong?"已开启：倒计时结束后等当前歌曲播完再停":"已关闭：倒计时结束后立即停止",{duration:2200})}function Eu(){const t=i.sleepTimer;if(!(t?.type!=="duration"||Date.now()<t.until)){if(i.config.sleepAfterSong===!0&&i.playing&&i.currentId){i.sleepTimer={type:"after-song"},x(),u("定时到点：等这首播完就停",{duration:2400});return}i.sleepTimer=null,i.playing?kn():x(),u("已按定时停止播放",{duration:1800})}}class Iu extends me{static deps=e=>[e.currentId,e.playing,e.position,e.duration,e.volume,e.muted,e.playMode,e.likedIds,e.queue.length,e.queueOpen,e.optionsOpen,e.sleepOpen,e.sleepTimer,e.config.showDesktopLyrics,e.config.showDesktopWallpaper,e.desktopWallpaperSupport,e.lyricsOpen,Sn()];constructor(){super(),this._progress=null,this._volume=null,this._tick=null}onConnected(){this._tick=setInterval(()=>{i.sleepTimer&&this.requestUpdate()},1e3)}onDisconnected(){this._tick&&clearInterval(this._tick),this._tick=null}firstUpdated(){const e=this.querySelector("#progress");this._progress=dt(e,{min:0,max:1e3,step:1,value:0,format:n=>Ct(n/1e3*(i.duration||0)),onChange:n=>{i.duration&&(i.position=n/1e3*i.duration,this.requestUpdate())},onCommit:n=>{i.duration&&ps(n/1e3*i.duration)}}),this._volume=dt(this.querySelector("#volume"),{min:0,max:1,step:.01,value:i.volume,format:n=>`${Math.round(n*100)}`,onChange:n=>{ua(n),Bt(),this.requestUpdate()}})}updated(){const e=Math.round(i.position),n=Math.round(i.duration||0),s=this.querySelector("#progress");s&&s.dataset.dragging!=="true"&&n>0&&this._progress?.set(e/n*1e3,{silent:!0}),this._progress?.setDisabled(n<=0);const a=i.muted?0:i.volume,r=this.querySelector("#volume");r&&r.dataset.dragging!=="true"&&this._volume?.set(a,{silent:!0}),Eu()}render(){const e=Ot(),n=i.currentId?Pt(i.currentId):!1,s=oa[i.playMode]||oa.sequence,a=i.muted?0:i.volume,r=a===0?"volume-mute":a<.5?"volume-low":"volume-high",o=e?ht(e):"",l=i.sleepTimer,c=l?.type==="duration"?Math.max(1,Math.ceil((l.until-Date.now())/6e4)):0;return p`
      <footer class="playerbar" id="playerbar">
        <div class="playerbar__progress">
          <span class="progress__time" id="time-current">${Ct(i.position)}</span>
          <div
            class="slider"
            id="progress"
            role="slider"
            tabindex="0"
            aria-label="播放进度"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="0"
            data-disabled="false"
          >
            <!-- 注意：.slider 内部（轨道 / 滑块 / 气泡）由 slider.js 直接写样式与文本，
                 所以这里**不能**给它们挂 Lit 绑定 —— 两方都写同一个节点会让
                 Lit 的标记节点被 textContent 覆盖掉（Lit 会报 "Cannot set properties
                 of null"）。气泡里的时间由 createSlider 的 format 负责。 -->
            <div class="slider__rail">
              <div class="slider__buffer" id="progress-buffer"></div>
              <div class="slider__fill" id="progress-fill"></div>
            </div>
            <div class="slider__thumb"></div>
            <div class="slider__bubble" id="progress-bubble"></div>
          </div>
          <span class="progress__time progress__time--total" id="time-total">${Ct(i.duration)}</span>
        </div>

        <div class="playerbar__row">
          <div class="playerbar__now">
            <button
              class="playerbar__cover"
              id="bar-cover"
              type="button"
              data-tip="播放详情页"
              aria-label="播放详情页"
              @click=${()=>Pa()}
            >
              <img id="bar-cover-img" alt=${e?`${e.title} 封面`:""} src=${ai(o)} />
              <svg class="playerbar__cover-icon"><use href="#i-expand"></use></svg>
            </button>
            <div class="playerbar__meta" id="bar-meta" data-tip="播放详情页" @click=${()=>Pa()}>
              <span class="playerbar__title" id="bar-title">${e?e.title:"未在播放"}</span>
              <span class="playerbar__sub" id="bar-sub">
                ${e?`${e.artist} · ${e.album}`:"选择一首歌曲开始"}
              </span>
            </div>
            <button
              class="playerbar__heart"
              id="bar-heart"
              type="button"
              aria-pressed=${String(n)}
              data-tip=${n?"取消喜欢":"加入我喜欢"}
              aria-label="加入我喜欢"
              @click=${()=>this.onLike()}
            >${f("heart")}</button>
            <button
              class="playerbar__heart playerbar__add"
              id="bar-add"
              type="button"
              data-tip="添加到歌单"
              aria-label="添加到歌单"
              ?disabled=${!e}
              @click=${d=>this.openAddToPlaylistMenu(d.currentTarget)}
            >${f("playlist-plus")}</button>
          </div>

          <div class="playerbar__center">
            <div class="transport">
              <button class="transport__btn" id="btn-prev" type="button" data-tip="上一曲" aria-label="上一曲" @click=${()=>Na()}>
                ${f("prev")}
              </button>
              <button
                class="transport__btn transport__btn--main"
                id="btn-play"
                type="button"
                data-tip=${i.playing?"暂停":"播放"}
                aria-label=${i.playing?"暂停":"播放"}
                @click=${()=>kn()}
              >
                <svg id="icon-play"><use href="#i-${i.playing?"pause":"play"}"></use></svg>
              </button>
              <button class="transport__btn" id="btn-next" type="button" data-tip="下一曲" aria-label="下一曲" @click=${()=>mn(!1)}>
                ${f("next")}
              </button>
            </div>
          </div>

          <div class="playerbar__tools">
            <div class="volume">
              <button
                class="volume__btn"
                id="btn-mute"
                type="button"
                data-tip=${i.muted?"取消静音":"静音"}
                aria-label=${i.muted?"取消静音":"静音"}
                @click=${()=>{No(),Bt()}}
              >
                <svg id="icon-volume"><use href="#i-${r}"></use></svg>
              </button>
              <div
                class="slider volume__slider"
                id="volume"
                role="slider"
                tabindex="0"
                aria-label="音量"
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <div class="slider__rail">
                  <div class="slider__fill" id="volume-fill"></div>
                </div>
                <div class="slider__thumb"></div>
                <div class="slider__bubble" id="volume-bubble"></div>
              </div>
            </div>
            <button
              class="mode-btn"
              id="btn-mode"
              type="button"
              data-mode=${i.playMode}
              data-tip=${s.label}
              aria-label=${s.label}
              @click=${()=>{Bo(),u((oa[i.playMode]||s).label,{duration:1400})}}
            >
              <svg id="icon-mode"><use href="#i-${s.icon}"></use></svg>
              <span class="mode-btn__badge">1</span>
            </button>
            <button
              class="mode-btn"
              id="btn-lyrics"
              type="button"
              data-tip="歌词"
              aria-label="歌词"
              aria-expanded=${String(!!i.lyricsOpen)}
              aria-haspopup="dialog"
              @click=${()=>fu()}
            >
              ${f("lyric-match")}
            </button>
            <button
              class="mode-btn"
              id="btn-desktop-lyrics"
              type="button"
              aria-pressed=${String(!!i.config.showDesktopLyrics)}
              data-tip="桌面歌词"
              aria-label="桌面歌词"
              @click=${()=>ho()}
            >${f("desktop-lyrics")}</button>
            <button
              class="mode-btn"
              id="btn-desktop-wallpaper"
              type="button"
              aria-pressed=${String(!!i.config.showDesktopWallpaper)}
              ?disabled=${i.desktopWallpaperSupport?.supported===!1}
              aria-disabled=${i.desktopWallpaperSupport?.supported===!1?"true":M}
              data-tip=${i.desktopWallpaperSupport?.supported===!1?i.desktopWallpaperSupport.reason:"桌面背景歌词"}
              aria-label="桌面背景歌词"
              @click=${()=>mo()}
            >${f("desktop-wallpaper")}</button>
            <button
              class="mode-btn"
              id="btn-sleep"
              type="button"
              aria-pressed=${String(!!l)}
              data-tip=${this.sleepTip(l)}
              aria-label="定时停止"
              @click=${()=>fo()}
            >
              ${f("clock")}
              <span class="mode-btn__badge" id="sleep-count" ?hidden=${!c}>${c}</span>
            </button>
            <button
              class="mode-btn"
              id="btn-options"
              type="button"
              aria-pressed=${String(!!i.optionsOpen)}
              data-tip="选项"
              aria-label="选项"
              @click=${()=>po()}
            >${f("options")}</button>
            <button
              class="mode-btn"
              id="btn-playlist"
              type="button"
              aria-pressed=${String(!!i.queueOpen)}
              data-tip="播放列表"
              aria-label="播放列表"
              @click=${()=>{Du()}}
            >
              ${f("playlist")}
              <span class="mode-btn__badge" id="queue-count">${i.queue.length===0?"":i.queue.length>99?"99+":String(i.queue.length)}</span>
            </button>
          </div>
        </div>
      </footer>
    `}sleepTip(e){return e?.type==="duration"?`定时停止 · 剩余 ${Math.max(0,Math.round((e.until-Date.now())/1e3))} 秒`:e?.type==="after-song"?"定时停止 · 播完当前歌曲":"定时停止"}onLike(){if(!i.currentId)return;vs(i.currentId);const e=Pt(i.currentId);u(e?"已加入「我喜欢」":"已从「我喜欢」移除",{tone:e?"success":"info",duration:1500})}openAddToPlaylistMenu(e){const n=Ot();if(!n){u("还没有正在播放的歌曲",{duration:1600});return}const s=[];for(const a of i.playlists.filter(r=>!r.locked))s.push({id:a.id,label:a.name,icon:a.id==="liked"?"heart":"playlist",checked:a.songIds.includes(n.id)});s.length||s.push({id:"__none",label:"还没有可用的歌单",disabled:!0}),s.push({id:"__sep",kind:"sep"}),s.push({id:"__new",label:"新建歌单…",icon:"plus"}),bn({anchor:e,x:0,y:0,align:"right",items:s,onPick:async a=>{if(!(a==="__none"||a==="__sep")){if(a==="__new"){Or(r=>{r&&ds(r.id,[n.id])});return}ds(a,[n.id])}}})}}function Du(){const t=i.queueOpen;uo(),!t&&i.currentId&&requestAnimationFrame(()=>so({notify:!1}))}te("mp-playerbar",Iu);class Dn extends me{get open(){return!1}get panelEl(){return null}updated(){const e=this.panelEl;if(e){if(this.open){this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden?(e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{this.open&&(e.dataset.state="opened")})):e.dataset.state!=="opened"&&(e.dataset.state="opened");return}e.hidden||(e.dataset.state="closed",!this._closeTimer&&(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!this.open&&e&&(e.hidden=!0)},Ft()+40)))}}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),this._closeTimer=null,super.disconnectedCallback()}bindDismiss(e){const n=a=>{const r=this.panelEl;!r||r.hidden||r.contains(a.target)||a.target.closest?.(e)||this.close()},s=a=>{if(a.key!=="Escape")return;const r=this.panelEl;r&&!r.hidden&&this.close()};document.addEventListener("pointerdown",n),document.addEventListener("keydown",s),this._undismiss=()=>{document.removeEventListener("pointerdown",n),document.removeEventListener("keydown",s)}}close(){}}class Au extends Dn{static deps=e=>[e.queueOpen,e.queue,e.currentId,e.playing,Sn()];get open(){return!!i.queueOpen}get panelEl(){return this.querySelector("#queue-panel")}close(){uo(!1)}firstUpdated(){this.bindDismiss("#btn-playlist"),this.bindDrag()}updated(){super.updated(),this.bindDrag()}bindDrag(){const e=this.querySelector("#queue-panel-body");e&&(this._sortable&&this._sortable.el===e||(this._sortable?.destroy(),this._sortable=T.create(e,{draggable:".queue-item",animation:0,ghostClass:"is-dragging",onEnd:n=>{io();const s=n.oldIndex,a=n.newIndex;if(s==null||a==null||s===a)return;const r=n.from,o=Array.from(r.children).filter(l=>l!==n.item);r.insertBefore(n.item,o[s]??null),or(s,a),u("已调整播放顺序 · 播放模式已切回列表循环",{duration:1600})}})))}disconnectedCallback(){this._sortable?.destroy(),this._sortable=null,this._undismiss?.(),super.disconnectedCallback()}render(){const e=i.queueOpen?i.queue.map(n=>Ge(n)).filter(Boolean):[];return p`
      <section class="queue-panel" id="queue-panel" hidden data-state="closed" aria-label="播放列表">
        <div class="queue-panel__head">
          <span class="queue-panel__title">播放列表</span>
          <span class="u-spacer"></span>
          <span class="queue-panel__count" id="queue-panel-count">${e.length} 首</span>
          <button class="queue-panel__btn" id="queue-locate" type="button" data-tip="定位到当前播放" aria-label="定位到当前播放" @click=${()=>so()}>
            ${f("disc")}
          </button>
          <button
            class="queue-panel__btn"
            id="queue-clear"
            type="button"
            data-tip="清空列表"
            aria-label="清空列表"
            @click=${()=>{rr(),u("播放列表已清空")}}
          >${f("trash")}</button>
          <button class="queue-panel__btn" id="queue-close" type="button" data-tip="关闭" aria-label="关闭播放列表" @click=${()=>this.close()}>
            ${f("close")}
          </button>
        </div>
        <div
          class="queue-panel__body"
          id="queue-panel-body"
          @click=${n=>this.onClick(n)}
          @keydown=${n=>this.onKey(n)}
        >
          ${e.length?Ee(e,n=>n.id,n=>this.item(n)):p`<div class="queue-panel__empty">播放列表是空的<br />从曲库把歌曲加进来吧</div>`}
        </div>
      </section>
    `}item(e){const n=i.queue.indexOf(e.id),s=e.id===i.currentId;return p`
      <div
        class="queue-item"
        data-queue-id=${e.id}
        aria-current=${String(s)}
        role="button"
        tabindex="0"
        draggable="true"
      >
        <span class="queue-item__index">${s&&i.playing?f("play"):n+1}</span>
        <span class="queue-item__cover"><img src=${ai(ht(e))} alt="" loading="lazy" /></span>
        <span class="queue-item__main">
          <span class="queue-item__title">${e.title}</span>
          <span class="queue-item__sub">${e.artist}${e.album?` · ${e.album}`:""}</span>
        </span>
        <button
          class="queue-item__del"
          type="button"
          data-queue-del=${e.id}
          data-tip="从列表移除"
          aria-label="从列表移除"
        >${f("close")}</button>
      </div>
    `}onClick(e){if(ro())return;const n=e.target.closest("[data-queue-del]");if(n){e.stopPropagation(),da(n.dataset.queueDel);return}const s=e.target.closest("[data-queue-id]");s&&ca(s.dataset.queueId)}onKey(e){if(e.key!=="Enter"&&e.key!==" ")return;const n=e.target.closest?.("[data-queue-id]");n&&(e.preventDefault(),ca(n.dataset.queueId))}}te("mp-queue-panel",Au);class Mu extends Dn{static deps=e=>[e.optionsOpen,e.config.lyricsFontSize,e.config.glassAlpha,e.config.glassBlur,e.config.glassBlurCustom,e.config.showDesktopLyrics,e.config.showDesktopWallpaper];get open(){return!!i.optionsOpen}get panelEl(){return this.querySelector("#options-panel")}close(){po(!1)}firstUpdated(){this.bindDismiss("#btn-options"),this._sliders={size:dt(this.querySelector("#opt-lyric-size"),{min:12,max:26,step:1,value:i.config.lyricsFontSize,format:e=>`${Math.round(e)}px`,onChange:e=>{i.config.lyricsFontSize=e,lt("--lyric-size",`${e}px`),this.requestUpdate()},onCommit:()=>x()}),alpha:dt(this.querySelector("#opt-alpha"),{min:20,max:95,step:1,value:i.config.glassAlphaCustom?i.config.glassAlpha:ba(),format:e=>`${Math.round(e)}%`,onChange:e=>{i.config.glassAlpha=e,i.config.glassAlphaCustom=!0,Ha(e),this.requestUpdate()},onCommit:()=>x()}),blur:dt(this.querySelector("#opt-blur"),{min:0,max:48,step:1,value:i.config.glassBlurCustom?i.config.glassBlur:ya(),format:e=>`${Math.round(e)}px`,onChange:e=>{i.config.glassBlur=e,i.config.glassBlurCustom=!0,lt("--glass-blur",`${e}px`),this.requestUpdate()},onCommit:()=>x()})}}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}render(){const e=Math.round(i.config.lyricsFontSize),n=Math.round(i.config.glassAlphaCustom?i.config.glassAlpha:ba()),s=Math.round(i.config.glassBlurCustom?i.config.glassBlur:ya());return p`
      <section class="options-panel" id="options-panel" hidden data-state="closed" aria-label="播放选项">
        <div class="options-panel__head">
          <span class="options-panel__title">播放选项</span>
          <span class="u-spacer"></span>
          <button class="options-panel__btn" id="options-close" type="button" data-tip="关闭" aria-label="关闭选项" @click=${()=>this.close()}>
            ${f("close")}
          </button>
        </div>
        <div class="options-panel__body" id="options-panel-body">
          <div class="option-row">
            <span class="option-row__label">歌词字号</span>
            <div class="rangeslider">
              <div class="slider" id="opt-lyric-size" role="slider" tabindex="0" aria-label="调节">
                <div class="slider__rail"><div class="slider__fill"></div></div>
                <div class="slider__thumb"></div>
                <div class="slider__bubble"></div>
              </div>
              <span class="rangeslider__value" id="opt-lyric-size-val">${e}px</span>
            </div>
          </div>
          <div class="option-row">
            <span class="option-row__label">桌面歌词</span>
            <button
              class="switch"
              id="opt-desktop-lyrics"
              type="button"
              role="switch"
              aria-checked=${String(!!i.config.showDesktopLyrics)}
              @click=${()=>ho()}
            ></button>
          </div>
          <div class="option-row">
            <span class="option-row__label">桌面背景歌词</span>
            <button
              class="switch"
              id="opt-desktop-wallpaper"
              type="button"
              role="switch"
              aria-checked=${String(!!i.config.showDesktopWallpaper)}
              @click=${()=>mo()}
            ></button>
          </div>
          <div class="option-row">
            <span class="option-row__label">背景不透明度</span>
            <div class="rangeslider">
              <div class="slider" id="opt-alpha" role="slider" tabindex="0" aria-label="调节">
                <div class="slider__rail"><div class="slider__fill"></div></div>
                <div class="slider__thumb"></div>
                <div class="slider__bubble"></div>
              </div>
              <span class="rangeslider__value" id="opt-alpha-val">${n}%</span>
            </div>
          </div>
          <div class="option-row">
            <span class="option-row__label">模糊程度</span>
            <div class="rangeslider">
              <div class="slider" id="opt-blur" role="slider" tabindex="0" aria-label="调节">
                <div class="slider__rail"><div class="slider__fill"></div></div>
                <div class="slider__thumb"></div>
                <div class="slider__bubble"></div>
              </div>
              <span class="rangeslider__value" id="opt-blur-val">${s}px</span>
            </div>
          </div>
        </div>
      </section>
    `}}te("mp-options-panel",Mu);class Ou extends Dn{static deps=e=>[e.sleepOpen,e.sleepTimer,e.config.sleepAfterSong,e.playing,e.currentId];get open(){return!!i.sleepOpen}get panelEl(){return this.querySelector("#sleep-panel")}close(){fo(!1)}constructor(){super(),this._tick=null,this._pendingMinutes=null}onConnected(){this._tick=setInterval(()=>{i.sleepOpen&&i.sleepTimer&&this.requestUpdate()},1e3)}onDisconnected(){this._tick&&clearInterval(this._tick),this._tick=null}firstUpdated(){this.bindDismiss("#btn-sleep"),this._slider=dt(this.querySelector("#sleep-slider"),{min:0,max:300,step:1,value:0,format:e=>`${Math.round(e)} 分钟`,onChange:e=>{this._pendingMinutes=Math.round(e),this.requestUpdate()},onCommit:e=>{this._pendingMinutes=null,Cu(e)}})}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}updated(){super.updated();const e=i.sleepTimer,n=this.querySelector("#sleep-slider");if(e?.type==="duration"){const s=Math.max(0,e.until-Date.now());n?.dataset.dragging!=="true"&&this._slider?.set(Math.max(0,Math.round(s/6e4)),{silent:!0})}else n?.dataset.dragging!=="true"&&this._slider?.set(0,{silent:!0})}render(){const e=i.sleepTimer,n=Pu(e,this._pendingMinutes);return p`
      <section class="sleep-panel" id="sleep-panel" hidden data-state="closed" aria-label="定时停止">
        <div class="sleep-panel__head">
          <svg class="sleep-panel__icon" aria-hidden="true"><use href="#i-clock"></use></svg>
          <span class="sleep-panel__title">定时停止</span>
          <span class="u-spacer"></span>
          <button class="options-panel__btn" id="sleep-close" type="button" data-tip="关闭" aria-label="关闭定时停止" @click=${()=>this.close()}>
            ${f("close")}
          </button>
        </div>
        <div class="sleep-panel__body" id="sleep-panel-body">
          <div class="sleep-panel__bar">
            <div class="sleep-panel__readout">
              <span class="sleep-panel__value" id="sleep-value">${n.value}</span>
              <span class="sleep-panel__sub" id="sleep-sub">${n.sub}</span>
            </div>
            <div
              class="slider sleep-panel__slider"
              id="sleep-slider"
              role="slider"
              tabindex="0"
              aria-label="定时停止分钟数"
              aria-valuemin="0"
              aria-valuemax="300"
              aria-valuenow="0"
            >
              <div class="slider__rail"><div class="slider__fill"></div></div>
              <div class="slider__thumb"></div>
              <div class="slider__bubble"></div>
            </div>
            <div class="sleep-panel__scale"><span>0</span><span>150</span><span>300 分钟</span></div>
          </div>
          <div class="sleep-panel__option">
            <div class="sleep-panel__option-main">
              <span class="sleep-panel__option-label">歌曲播放完成后停止</span>
              <span class="sleep-panel__option-sub">倒计时结束后不立刻停，等这首播完再停</span>
            </div>
            <button
              class="switch"
              type="button"
              role="switch"
              data-sleep-act="after-song"
              aria-checked=${String(i.config.sleepAfterSong===!0)}
              aria-label="歌曲播放完成后停止"
              @click=${()=>Tu(!i.config.sleepAfterSong)}
            ></button>
          </div>
          <div class="sleep-panel__row">
            <button class="btn btn--sm" type="button" data-sleep-act="off" @click=${()=>vo("已取消定时停止")}>
              ${f("close")}<span>取消定时</span>
            </button>
          </div>
          <div class="sleep-panel__hint">
            「歌曲播放完成后停止」打开时，倒计时到点如果这首还没播完，会等它播完再停
            （不会在副歌中间掐掉）。拖到 0 分钟即取消定时；设置从松手那一刻开始倒计时。
          </div>
        </div>
      </section>
    `}}function Pu(t,e){if(typeof e=="number")return e<=0?{value:"未开启",sub:"松手即关闭定时"}:{value:`${e} 分钟`,sub:"松手开始倒计时"};if(t?.type==="after-song")return{value:"等待本首播完",sub:"倒计时已结束，这首播完就暂停"};if(t?.type==="duration"){const n=Math.max(0,t.until-Date.now());return{value:`剩余 ${Lu(n)}`,sub:`共 ${t.minutes} 分钟`}}return{value:"未开启",sub:"拖动上面的条设置分钟数"}}function Lu(t){const e=Math.max(0,Math.round(t/1e3)),n=Math.floor(e/3600),s=Math.floor(e%3600/60),a=e%60;return n>0?`${n} 小时 ${String(s).padStart(2,"0")} 分`:`${String(s).padStart(2,"0")}:${String(a).padStart(2,"0")}`}te("mp-sleep-panel",Ou);class qu extends Dn{static deps=()=>{const e=rn();return[e.open,e.revision]};get open(){return rn().open}get panelEl(){return this.querySelector("#download-panel")}close(){Pl()}firstUpdated(){this.bindDismiss("#btn-downloads")}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}render(){const{tasks:e,running:n}=rn(),s=e.some(a=>a?.state!=="running");return p`
      <section class="download-panel" id="download-panel" hidden data-state="closed" aria-label="下载任务">
        <div class="download-panel__head">
          <svg class="download-panel__icon" aria-hidden="true"><use href="#i-download"></use></svg>
          <span class="download-panel__title">下载任务</span>
          <span class="download-panel__count" id="download-panel-count">
            ${n?`${n} 个下载中`:`共 ${e.length} 个`}
          </span>
          <button class="download-panel__btn" id="download-open-dir" type="button" data-tip="打开下载目录" aria-label="打开下载目录" @click=${()=>ql()}>
            ${f("folder")}
          </button>
          <button
            class="download-panel__btn"
            id="download-clear"
            type="button"
            data-tip="清除已完成"
            aria-label="清除已完成"
            ?disabled=${!s}
            @click=${()=>Ll()}
          >${f("trash")}</button>
          <button class="download-panel__btn" id="download-close" type="button" data-tip="关闭" aria-label="关闭下载任务面板" @click=${()=>this.close()}>
            ${f("close")}
          </button>
        </div>
        <div class="download-panel__body" id="download-panel-body">
          ${e.length?Ee(e,a=>a.id,a=>this.item(a)):p`<div class="download-panel__empty">还没有下载任务</div>`}
        </div>
      </section>
    `}item(e){const n=e.state==="running"?"running":e.state==="failed"?"failed":"done",s=Number(e.total)||0,a=Number(e.done)||0,r=s>0?Math.min(100,Math.round(a/s*100)):0,o=Math.max(0,Math.min(100,Math.round(r/5)*5)),l=n==="running";let c=`${r}%`;n==="done"?c="已完成":n==="failed"?c="失败":s<=0&&(c="下载中");let d;return l?d=s>0?`${zn(a)} / ${zn(s)}`:zn(a):n==="done"?d=`${zn(a||s)} · ${e.path?Ru(e.path):e.dir||""}`:d=e.message||"下载失败",p`
      <div
        class="download-item"
        data-state=${n}
        data-download-id=${e.id}
        role=${n==="done"?"button":M}
        tabindex=${n==="done"?"0":M}
        data-tip=${n==="done"?"在文件夹中显示":M}
        @click=${()=>Rl(e.id)}
      >
        <div class="download-item__title">${e.title||e.bvid||"未命名"}</div>
        <div class="download-item__state">${c}</div>
        <div class="download-item__bar" ?hidden=${!l} data-unknown=${s>0?"false":"true"}>
          <div class="download-item__fill" data-value=${o}></div>
        </div>
        <div class="download-item__meta${n==="failed"?" download-item__meta--error":""}">${d}</div>
      </div>
    `}}te("mp-download-panel",qu);function zn(t){const e=Number(t)||0;if(e<=0)return"0 B";const n=["B","KB","MB","GB"];let s=0,a=e;for(;a>=1024&&s<n.length-1;)a/=1024,s+=1;return`${a>=10||s===0?Math.round(a):a.toFixed(1)} ${n[s]}`}function Ru(t){const e=String(t||""),n=Math.max(e.lastIndexOf("\\"),e.lastIndexOf("/"));return n>=0?e.slice(n+1):e}class Nu extends Dn{static deps=()=>[N.open,N.songId,N.rev,Sn(),i.config.coverCarousel,i.config.embedMeta];get open(){return N.open}get panelEl(){return this.querySelector("#cover-layer")}close(){sn()}render(){const e=this.song();return p`
      <div
        class="cover-layer"
        id="cover-layer"
        data-state="closed"
        hidden
        aria-label="封面管理"
        @click=${n=>this.onClick(n)}
        @keydown=${n=>this.onKey(n)}
      >
        <div class="cover-layer__panel" role="dialog" aria-modal="true" aria-label="封面管理">
          <div class="cover-layer__head">
            <svg class="cover-layer__icon" aria-hidden="true"><use href="#i-image"></use></svg>
            <span class="cover-layer__title">封面管理</span>
            <span class="u-spacer"></span>
            <button class="cover-layer__close" type="button" data-cover-close aria-label="关闭封面管理" @click=${()=>sn()}>
              ${f("close")}
            </button>
          </div>
          <div class="cover-layer__body" id="cover-layer-body">
            ${e&&this.open?this.panel(e):M}
          </div>
        </div>
      </div>
    `}song(){const e=N.songId;return e&&i.songs.find(n=>n.id===e)||null}panel(e){const n=N,s=ko(e);return p`
      <div class="cover-panel">
        <div class="cover-panel__current">
          <div class="cover-panel__frame" id="cover-current-frame">
            ${s?p`<img src=${s} alt=${e.title} 原始封面 />`:p`<span class="cover-panel__none">${f("music")}</span>`}
          </div>
          <div class="cover-panel__meta">
            <div class="cover-panel__title">${e.title}</div>
            <div class="cover-panel__sub">${e.artist}${e.album?` · ${e.album}`:""}</div>
            <div class="cover-panel__hint">
              选中的封面会立刻写入（缓存目录 + 按下面的开关写进歌曲文件）。
              这首歌可以保存多张封面，右上角的轮播开关会让详情页按时间轮换显示。
            </div>
          </div>
        </div>

        <div class="cover-panel__section">
          <div class="cover-panel__section-head">
            <span class="cover-panel__section-title">这首歌的封面</span>
            <span class="u-spacer"></span>
            <button
              class="btn btn--sm"
              type="button"
              data-cover-act="embed"
              id="cover-embed-btn"
              aria-pressed=${String(i.config.embedMeta===!0)}
              data-tip=${i.config.embedMeta?"关闭后封面只存在缓存目录里":"打开后封面会写进歌曲文件本身（会修改音乐文件）"}
              @click=${()=>this.toggleEmbed()}
            >${f("tag")}<span>写入歌曲文件</span></button>
            <button
              class="btn btn--sm"
              type="button"
              data-cover-act="carousel"
              id="cover-carousel-btn"
              aria-pressed=${String(i.config.coverCarousel===!0)}
              @click=${()=>this.toggleCarousel()}
            >${f("slideshow")}<span>轮播</span></button>
          </div>
          <div class="cover-set" id="cover-set">${this.setItems()}</div>
        </div>

        <div class="cover-panel__section">
          <div class="cover-panel__search">
            <input
              class="field"
              id="cover-keyword"
              type="text"
              placeholder="输入关键词（歌名 / 歌手 / 专辑都可以）"
              autocomplete="off"
              spellcheck="false"
              aria-label="封面搜索关键词"
              .value=${n.keyword||e.title||""}
              @input=${a=>{N.keyword=a.target.value}}
            />
            <button class="btn btn--primary btn--sm" type="button" data-cover-act="search" ?disabled=${n.busy} @click=${()=>this.runSearch()}>
              ${f("search")}<span>联网搜索</span>
            </button>
            <button class="btn btn--sm" type="button" data-cover-act="local" @click=${()=>this.pickLocal()}>
              ${f("image")}<span>选择本地图片</span>
            </button>
          </div>
          <div class="cover-panel__hint">
            下载来的文件常常没有标签，标题是从文件名推出来的，直接搜不容易命中；
            在这里填一个更准确的关键词会准很多。也可以直接选一张本地图片 ——
            两种结果都会出现在下面：联网搜索默认不勾选，本地图片默认已勾选，
            确认后点「应用」。
          </div>
        </div>

        <div class="cover-panel__status" id="cover-status">${n.status}</div>
        <div class="cover-panel__grid" id="cover-grid">${this.cards()}</div>
        <div class="cover-panel__selectbar" id="cover-selectbar" ?hidden=${!n.candidates.length}>
          ${n.candidates.length?this.selectbar():M}
        </div>

        <div class="cover-panel__foot">
          <button class="btn btn--sm" type="button" data-cover-act="open-cache" @click=${()=>_.coverOpenCacheDir("covers")}>
            ${f("folder")}<span>打开缓存目录</span>
          </button>
        </div>
      </div>
    `}setItems(){const e=N,n=e.currentSet?.items||[],s=e.currentSet?.embedded||[],a=Number(e.currentSet?.active)||0;return!n.length&&!s.length?p`<div class="cover-set__empty">还没有换过封面，这首歌现在用的是文件自带的封面。</div>`:p`
      ${n.map((r,o)=>p`
          <div class="cover-set__item" data-set-index=${o} data-active=${String(o===a)}>
            <img src=${r.preview} alt="" />
            ${o===a?p`<span class="cover-set__badge">当前</span>`:M}
            <div class="cover-set__ops">
              <button class="btn btn--xs" type="button" data-set-act="use" ?disabled=${o===a}>
                ${f("check")}<span>设为当前</span>
              </button>
              <button class="btn btn--xs btn--danger" type="button" data-set-act="remove">
                ${f("trash")}<span>删除</span>
              </button>
            </div>
          </div>
        `)}
      ${s.map(r=>p`
          <div class="cover-set__item cover-set__item--embedded" data-embedded="1">
            <img src=${r?.preview||""} alt="" />
            <span class="cover-set__badge cover-set__badge--ghost">文件内嵌</span>
            <div class="cover-set__ops">
              <button class="btn btn--xs" type="button" data-set-act="use" @click=${()=>this.useEmbedded(r)}>
                ${f("plus")}<span>收进缓存</span>
              </button>
            </div>
          </div>
        `)}
    `}cards(){const e=N;return Ee(e.candidates,n=>n.preview,(n,s)=>{const a=e.selected.has(n);return p`
          <button
            class="cover-card"
            type="button"
            role="checkbox"
            aria-checked=${String(a)}
            data-cover-act="toggle"
            data-cover-idx=${s}
            data-selected=${String(a)}
            @click=${()=>this.toggleCandidate(s)}
          >
            <img src=${n.preview} alt="" loading="lazy" />
            <span class="cover-card__check">${f("check")}</span>
            <span class="cover-card__meta">
              <span class="cover-card__provider">${n.provider||"来源"}</span>
              <span class="cover-card__score">
                ${n.width&&n.height?`${n.width}×${n.height}`:`匹配度 ${Number(n.score)||0}`}
              </span>
            </span>
          </button>
        `})}selectbar(){const e=N,n=e.selected.size===e.candidates.length;return p`
      <span class="cover-panel__selectinfo">已选 ${e.selected.size} / ${e.candidates.length} 张</span>
      <span class="u-spacer"></span>
      <button class="btn btn--sm" type="button" data-cover-act="select-all" @click=${()=>this.selectAll()}>
        ${f("check")}<span>${n?"取消全选":"全选"}</span>
      </button>
      <button
        class="btn btn--primary btn--sm"
        type="button"
        data-cover-act="apply"
        ?disabled=${!e.selected.size}
        @click=${()=>this.applySelected()}
      >
        ${f("plus")}<span>应用${e.selected.size?`（${e.selected.size}）`:""}</span>
      </button>
    `}onClick(e){if(e.target.closest("[data-cover-close]")||e.target===this.panelEl){sn();return}const n=e.target.closest("[data-set-act]");if(n){const s=Number(n.closest("[data-set-index]")?.dataset.setIndex);n.dataset.setAct==="use"&&this.useExisting(s),n.dataset.setAct==="remove"&&this.removeExisting(s)}}onKey(e){if(e.key!=="Escape")return;const n=this.querySelector("#cover-keyword");if(n&&document.activeElement===n&&n.value.trim()){N.keyword="",n.value="";return}sn()}toggleCandidate(e){const n=N.candidates[e];n&&(N.selected.has(n)?N.selected.delete(n):N.selected.add(n),Pe())}selectAll(){const e=N;e.selected.size===e.candidates.length?e.selected.clear():e.candidates.forEach(n=>e.selected.add(n)),Pe()}async runSearch(){const e=N;if(e.busy)return;if(!S()){X("浏览器预览下没有联网封面后端，请在应用里试");return}e.busy=!0;const n=e.candidates.filter(a=>a.local);e.candidates=[...n],e.selected=new Set(n),Pe();const s=(this.querySelector("#cover-keyword")?.value||"").trim();X(s?`正在按「${s}」同时查询多个来源（${Zi()}）…`:`正在同时查询多个来源（${Zi()}）…`);try{const a=s?{keyword:s}:{},r=await _.coverLookupSongAll(e.songId,a),o=Array.isArray(r)?r.filter(l=>l?.ok&&l.preview):[];if(o.length){e.candidates=[...n,...o.map(c=>({...c,local:!1}))];const l=[...new Set(o.map(c=>c.provider).filter(Boolean))];X(`找到 ${o.length} 张（来源：${l.join(" / ")||"未知"}），勾选后点「应用」`)}else{e.candidates=[...n];const l=Array.isArray(r)?r.find(c=>c?.message)?.message:"";X(l||"没有找到匹配的封面（也可能是匹配到的都是空白图，已自动丢弃）")}}catch(a){X(`搜索失败：${a?.message??a}`)}finally{e.busy=!1,Pe()}}async pickLocal(){const e=N;if(!S()){X("浏览器预览下没有系统文件选择器，请在应用里试");return}X("正在读取图片…");try{const n=await _.coverPickLocal();if(!n||n.cancelled){X("");return}if(!n.ok||!n.preview){X(n?.message||"这张图片没法用作封面");return}const s={preview:n.preview,provider:n.provider||"本地图片",source:n.source||"",width:n.width,height:n.height,local:!0};e.candidates.unshift(s),e.selected.add(s),Pe(),X(`已加入本地图片${n.source?`（${n.source}）`:""}，确认后点「应用」`)}catch(n){X(`选择图片失败：${n?.message??n}`)}}async applySelected(){const e=N.candidates.filter(n=>N.selected.has(n)).map(n=>n.preview).filter(Boolean);if(!e.length){X("先勾选至少一张封面");return}await this.writeCovers(()=>_.coverAddMany(N.songId,e,i.config.embedMeta===!0))}async useExisting(e){Number.isFinite(e)&&await this.writeCovers(()=>_.coverSetActive(N.songId,e))}async useEmbedded(e){e?.preview&&await this.writeCovers(()=>_.coverAdd(N.songId,"",e.preview,i.config.embedMeta===!0))}async removeExisting(e){Number.isFinite(e)&&await this.writeCovers(()=>_.coverRemove(N.songId,e))}async writeCovers(e){const n=N;if(!S()){X("浏览器预览下没有封面后端，请在应用里试");return}X("正在保存…");try{const s=await e();s&&Array.isArray(s.items)&&(n.currentSet=s,pa(n.songId,s)),X(s?.message||"已更新封面"),qi(),u(s?.message||"封面已更新",{tone:"success",duration:1800})}catch(s){X(`保存失败：${s?.message??s}`)}}toggleCarousel(){i.config.coverCarousel=!i.config.coverCarousel,x(),u(i.config.coverCarousel?`已开启封面轮播（每 ${Number(i.config.coverCarouselInterval)||10} 秒换一张）`:"已关闭封面轮播",{duration:1600})}toggleEmbed(){i.config.embedMeta=!i.config.embedMeta,x(),u(i.config.embedMeta?"之后的封面会写进歌曲文件本身":"封面只保存在缓存目录（不改动音乐文件）",{duration:2200})}async refreshSet(){const e=N;if(!(!S()||!e.songId))try{const n=await _.coverList(e.songId);n&&Array.isArray(n.items)&&(e.currentSet=n,pa(e.songId,n),qi())}catch(n){X(`读取现有封面失败：${n?.message??n}`)}}}te("mp-cover-layer",Nu);const N={open:!1,songId:"",candidates:[],selected:new Set,currentSet:null,busy:!1,status:"",keyword:"",rev:0};function Pe(){N.rev+=1,he()}function X(t){N.status=t||"",Pe()}const Bu=()=>document.querySelector("mp-cover-layer");function Zi(){const t=i.coverProviders||[];return t.length?t.join(" / "):"iTunes / 网易云 / QQ 音乐 / Deezer / MusicBrainz"}function Fu(t){if(!i.songs.find(s=>s.id===t)){u("这首歌不在本地曲库里，无法更换封面",{tone:"warning"});return}Object.assign(N,{open:!0,songId:t,candidates:[],selected:new Set,currentSet:i.coverSets.get(t)||null,status:"",keyword:""}),Pe(),Bu()?.refreshSet(),zu()}function sn(){N.open=!1,Pe()}async function zu(){if(!(i.coverProviders?.length||!S()))try{const t=await _.coverProviders();Array.isArray(t?.providers)&&t.providers.length&&(i.coverProviders=t.providers,Pe())}catch{}}const bt=[{id:"library",label:"曲库"},{id:"appearance",label:"外观"},{id:"playback",label:"播放"},{id:"lyrics",label:"歌词"},{id:"loudness",label:"音频"},{id:"online",label:"在线与缓存"},{id:"ai",label:"AI 相关"},{id:"about",label:"关于"}],Uu=[{value:-14,label:"-14 LUFS · 较响（流媒体常见）"},{value:-16,label:"-16 LUFS · 推荐（默认）"},{value:-18,label:"-18 LUFS · 温和"},{value:-23,label:"-23 LUFS · 广播标准（EBU R128）"}],ju=[{value:"off",label:"关闭"},{value:"track",label:"逐曲均衡"},{value:"album",label:"同专辑统一"}];function B({label:t,hint:e,control:n}){return p`
    <div class="setting">
      <div class="setting__main">
        <div class="setting__label">${t}</div>
        ${e?p`<div class="setting__hint">${e}</div>`:M}
      </div>
      <div class="setting__control">${n}</div>
    </div>`}function ie(t,e,n){return p`<button class="switch" type="button" role="switch" aria-checked=${String(!!e)} data-toggle=${t} aria-label=${n}></button>`}function Oe(t,e,n){return p`
    <div class="segmented" data-segment=${t}>
      ${e.map(s=>p`<button class="segmented__btn" type="button" data-value=${s.value} aria-pressed=${String(String(s.value)===String(n))}>${s.label}</button>`)}
    </div>`}function Hu(t){const e=t.aiVendor||"auto",n=Pr(e),s="开启后模型会先推理再给结论，响应更慢；关闭则直接作答";return e==="auto"?s+"；自动识别："+(n||"按接口地址与模型名判断厂商"):n?s+"；该厂商："+n:s}function Un(t,e,n){return p`
    <div class="rangeslider">
      <div class="slider" id=${t} role="slider" tabindex="0" aria-label=${n} data-slider=${e}>
        <div class="slider__rail"><div class="slider__fill"></div></div>
        <div class="slider__thumb"></div>
        <div class="slider__bubble"></div>
      </div>
      <!-- 数值由滑杆自己写（见 sliderOptions 的 onChange）：同一个节点只允许一个写入方 -->
      <span class="rangeslider__value"></span>
    </div>`}class Wu extends me{static deps=e=>[e.settingsOpen,e.settingsRev,e.settingsSection,e.view,e.folders,e.filterRules,e.songs,e.allSongsRaw,e.lastScan?.at??0,e.scanning,fl(),jr(),e.config,e.coverProviders,e.coverBreaker,e.coverCache,e.loudnessState,e.ffmpegState,e.backdropState,e.volume];constructor(){super(),this._activeSection=bt[0].id,this._navPausedUntil=0,this._navResumeTimer=null,this._sliders=new WeakMap}get open(){return hr()}get panelEl(){return this.querySelector("#settings-layer")}updated(){const e=this.panelEl;if(e){if(this.open){if(this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden){e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{this.open&&(e.dataset.state="opened")});const n=this.querySelector(".settings-layer__body");n&&(n.scrollTop=0)}this.bindSliders(),Vd();return}e.hidden||(e.dataset.state="closed",!this._closeTimer&&(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!this.open&&e&&(e.hidden=!0)},Ft()+40)))}}onConnected(){this._onScrollCapture=e=>this.onScroll(e),this.addEventListener("scroll",this._onScrollCapture,!0)}onDisconnected(){this._onScrollCapture&&(this.removeEventListener("scroll",this._onScrollCapture,!0),this._onScrollCapture=null),this._navResumeTimer&&clearTimeout(this._navResumeTimer),this._navResumeTimer=null}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),this._closeTimer=null,super.disconnectedCallback()}render(){return ji(),p`
      <section
        class="settings-layer"
        id="settings-layer"
        data-state="closed"
        hidden
        aria-label="设置"
        @click=${e=>this.onClick(e)}
        @change=${e=>this.onChange(e)}
        @input=${e=>this.onInput(e)}
      >
        <div class="settings-layer__panel" role="dialog" aria-modal="true" aria-label="设置">
          <div class="settings-layer__head">
            <svg class="settings-layer__icon" aria-hidden="true"><use href="#i-settings"></use></svg>
            <span class="settings-layer__title">设置</span>
            <span class="u-spacer"></span>
            <button class="settings-layer__close" type="button" data-settings-close aria-label="关闭设置" @click=${()=>ss()}>
              ${f("close")}
            </button>
          </div>
          <div class="settings-layer__body">
            <div class="settings">
              <div class="settings__nav" role="tablist">
                ${bt.map(e=>p`<button class="settings__nav-item" type="button" role="tab" data-goto=${e.id} aria-selected=${String(e.id===this._activeSection)}>${e.label}</button>`)}
              </div>
              ${this.foldersCard()}
              ${this.rulesCard()}
              ${this.themeCard()}
              ${this.playerCard()}
              ${this.playbackCard()}
              ${this.lyricsCard()}
              ${this.loudnessCard()}
              ${this.onlineCard()}
              ${this.aiCard()}
              ${this.aboutCard()}
            </div>
          </div>
        </div>
      </section>
    `}foldersCard(){const e=i.folders.length?i.folders.map(n=>{const s=n.status==="ok"?p`<span class="chip chip--ok"><i class="chip__dot"></i>${n.watching?"监听中":"已停止监听"}</span>`:n.status==="missing"?p`<span class="chip chip--error"><i class="chip__dot"></i>路径不存在</span>`:p`<span class="chip chip--warn"><i class="chip__dot"></i>无访问权限</span>`,a=i.songs.filter(r=>r.path.startsWith(n.path)).length;return p`
            <div class="pathrow" data-folder=${n.id}>
              <svg class="pathrow__icon" aria-hidden="true"><use href="#i-folder"></use></svg>
              <div class="pathrow__main">
                <div class="pathrow__path u-selectable" title=${n.path}>${n.path}</div>
                <div class="pathrow__meta">${s}<span>${A(a)} 首</span></div>
              </div>
              <button class="btn btn--ghost btn--sm" type="button" data-act="rescan-folder" data-id=${n.id}>${f("refresh")}<span>重扫</span></button>
              <button class="btn btn--ghost btn--sm" type="button" data-act="remove-folder" data-id=${n.id} aria-label="移除文件夹">${f("trash")}</button>
            </div>`}):p`<div class="setting__hint">还没有添加音乐文件夹。</div>`;return p`
      <section class="card" id="sec-folders" data-section="library">
        <div class="card__head">
          <div class="card__icon">${f("folder")}</div>
          <div class="card__titles">
            <div class="card__title">音乐文件夹</div>
            <div class="card__desc">添加本地音乐目录，程序会扫描并实时监听其中的变化</div>
          </div>
          <div class="card__actions">
            <button class="btn" type="button" data-act="scan-now">${f("refresh")}<span>立即重新扫描</span></button>
            <button class="btn btn--primary" type="button" data-act="add-folder">${f("folder-plus")}<span>添加文件夹</span></button>
          </div>
        </div>
        <div class="card__body">
          ${e}
          <div class="setting setting--group-start">
            <div class="setting__main">
              <div class="setting__label">启动时自动扫描</div>
              <div class="setting__hint">应用启动后在后台增量扫描一次</div>
            </div>
            <div class="setting__control">${ie("autoScanOnStart",i.config.autoScanOnStart,"启动时自动扫描")}</div>
          </div>
          ${B({label:"实时监听文件夹变化",hint:"新增、删除、重命名文件后自动更新曲库（需要后端文件监听）",control:ie("watchFolders",i.config.watchFolders,"实时监听")})}
          ${B({label:"元数据并发读取",hint:"同时解析的音频文件数量，机械硬盘建议调低",control:Oe("scanConcurrency",[2,4,8].map(n=>({value:String(n),label:`${n}`})),String(i.config.scanConcurrency))})}
        </div>
        <div class="card__foot">
          <span>支持格式：mp3 · flac · wav · m4a · ogg · aac（ape / wma 需转码）</span>
          <span class="u-num">${A(i.folders.length)} 个文件夹</span>
        </div>
      </section>`}ruleRow(e){const n=e.type==="regex"&&e.value&&!Fo(e.value);return p`
      <div class="rule" data-rule=${e.id} data-enabled=${String(e.enabled)}>
        <button class="switch" type="button" role="switch" aria-checked=${String(e.enabled)} data-act="rule-toggle" data-id=${e.id} aria-label="启用规则"></button>
        <select class="rule__field" data-act="rule-type" data-id=${e.id}>
          <option value="size" ?selected=${e.type==="size"}>按文件大小</option>
          <option value="regex" ?selected=${e.type==="regex"}>按正则表达式</option>
        </select>
        <select class="rule__op" data-act="rule-op" data-id=${e.id}>
          ${e.type==="size"?[["lt","小于"],["lte","小于等于"],["gt","大于"],["gte","大于等于"],["eq","等于"]].map(([s,a])=>p`<option value=${s} ?selected=${e.op===s}>${a}</option>`):p`<option value="match" ?selected=${e.op==="match"}>匹配</option>`}
        </select>
        <input
          class="rule__value${n?" input--invalid":""}"
          type="text"
          data-act="rule-value"
          data-id=${e.id}
          .value=${e.value}
          placeholder=${e.type==="size"?"例如 10240":"例如 \\.mp4$"}
        />
        <div class="rule__scope">
          <button class="rule__scope-btn" type="button" data-act="rule-scope" data-id=${e.id} data-scope="exclude" aria-pressed=${String(e.scope==="exclude")}>排除</button>
          <button class="rule__scope-btn" type="button" data-act="rule-scope" data-id=${e.id} data-scope="include" aria-pressed=${String(e.scope==="include")}>仅包含</button>
        </div>
        <button class="rule__del" type="button" data-act="rule-del" data-id=${e.id} aria-label="删除规则">${f("trash")}</button>
      </div>`}rulesCard(){const{kept:e,excluded:n,total:s}=lr(i.allSongsRaw,i.filterRules);return p`
      <section class="card" id="sec-filters" data-section="library">
        <div class="card__head">
          <div class="card__icon">${f("filter")}</div>
          <div class="card__titles">
            <div class="card__title">过滤规则</div>
            <div class="card__desc">按文件大小或正则表达式排除不需要的文件，规则可开关、可组合</div>
          </div>
          <div class="card__actions">
            <button class="btn btn--sm" type="button" data-act="preset-small">${f("plus")}<span>排除 &lt;10KB</span></button>
            <button class="btn btn--sm" type="button" data-act="preset-mp4">${f("plus")}<span>排除 *.mp4</span></button>
            <button class="btn btn--primary btn--sm" type="button" data-act="rule-add">${f("plus")}<span>新增规则</span></button>
          </div>
        </div>
        <div class="card__body">
          ${i.filterRules.length?i.filterRules.map(a=>this.ruleRow(a)):p`<div class="setting__hint">还没有规则。下面的预置规则可以一键添加。</div>`}
          <div class="rule__preview">
            当前规则下：共扫描 <b>${A(s)}</b> 个文件，保留 <b>${A(e)}</b> 首，过滤掉 <b>${A(n)}</b> 个
          </div>
        </div>
        <div class="card__foot">
          <span>「排除」优先于「仅包含」；正则使用 JavaScript 语法（不区分大小写）</span>
          <span>大小单位在数值后填写，默认字节</span>
        </div>
      </section>`}themeCard(){const e=bs(),n=ji(),s=window.matchMedia("(prefers-color-scheme: dark)").matches;return p`
      <section class="card" id="sec-appearance" data-section="appearance">
        <div class="card__head">
          <div class="card__icon">${f("palette")}</div>
          <div class="card__titles">
            <div class="card__title">外观</div>
            <div class="card__desc">主题以独立 CSS 文件存在，把文件放进主题目录即可自动出现</div>
          </div>
          <div class="card__actions">
            <button class="btn btn--sm" type="button" data-act="reload-themes">${f("refresh")}<span>重新扫描主题</span></button>
            <button class="btn btn--sm" type="button" data-act="open-theme-dir">${f("folder")}<span>打开主题文件夹</span></button>
          </div>
        </div>
        <div class="themes">
          ${e.map(a=>{const r=i.config.theme===a.id;return p`
              <div class="themecard" data-active=${String(r)}>
                <!-- 卡片本体是一个 button：点它换主题。
                     删除按钮必须放在它**外面**（HTML 不允许 button 套 button）。 -->
                <button
                  class="themecard__pick"
                  type="button"
                  data-act="theme-pick"
                  data-id=${a.id}
                  aria-pressed=${String(r)}
                  aria-label=${`使用主题 ${a.name}`}
                >
                  <span class="themecard__swatch">${n(a).map(o=>p`<i data-swatch=${o}></i>`)}</span>
                  <span class="themecard__name">${a.name}</span>
                  <span class="themecard__id">${a.id}.css</span>
                </button>
                ${a.builtin?p`<span class="themecard__badge">内置</span>`:p`<button class="carddel" type="button" data-act="theme-remove" data-id=${a.id} data-name=${a.name} data-tip="移除主题" aria-label=${`移除主题 ${a.name}`}>${f("trash")}<span>移除</span></button>`}
              </div>`})}
          <button class="themes__add" type="button" data-act="theme-help">
            ${f("plus")}
            <span>添加自定义主题</span>
            <span class="u-num u-fs-xs">用 AI 写一个，或导入现成的 CSS</span>
          </button>
        </div>
        <div class="card__body">
          ${B({label:"深浅色模式",hint:`当前系统偏好：${s?"深色":"浅色"}`,control:Oe("themeMode",[{value:"dark",label:"深色"},{value:"light",label:"浅色"},{value:"system",label:"跟随系统"}],i.config.themeMode)})}
          ${B({label:"毛玻璃模糊强度",hint:"对应主题令牌 --glass-blur",control:Un("set-blur","glassBlur","模糊强度")})}
          ${B({label:"面板不透明度",hint:"对应主题令牌 --glass-bg 的透明度",control:Un("set-alpha","glassAlpha","不透明度")})}
          ${B({label:"窗口原生材质",hint:"用系统原生的半透明材质当窗口底色（桌面壁纸会透出来）。仅 Windows 11 Build 22621+ 有完整效果，改动需重启应用",control:p`
              <div class="select">
                <select class="select__field" data-act="backdrop-mode" aria-label="窗口原生材质">
                  ${Lr.map(a=>p`<option value=${a} ?selected=${(i.config.nativeBackdrop||"off")===a}>${Jn(a)}</option>`)}
                </select>
                <svg class="select__icon"><use href="#i-chevron-down"></use></svg>
              </div>`})}
          ${this.backdropNote()}
          ${B({label:"关闭时最小化到托盘",hint:"打开后点关闭按钮只把窗口收进系统托盘（任务栏右下角），音乐照常播放；要真正退出请用托盘图标的右键菜单",control:ie("minimizeToTray",i.config.minimizeToTray,"关闭时最小化到托盘")})}
          ${B({label:"界面动画",hint:"关闭后取消过渡与旋转动画，低性能设备更流畅",control:ie("animations",i.config.animations,"界面动画")})}
          ${B({label:"过渡速度",hint:"弹出层、菜单、面板的进出动画时长；默认快速 0.25 秒",control:Oe("animationsSpeed",Cd,i.config.animationsSpeed||"fast")})}
          ${B({label:"主题色跟随封面",hint:"从当前封面提取主色，写入 --seed 令牌（需主题支持）",control:ie("accentFromCover",i.config.accentFromCover,"主题色跟随封面")})}
          ${B({label:"显示专辑列",hint:"窄窗口下会自动隐藏该列",control:ie("showAlbumColumn",i.config.showAlbumColumn,"显示专辑列")})}
          ${B({label:"列表密度",hint:"对「本地歌曲」「播放列表」「歌单」三个列表同时生效",control:Oe("listDensity",xd,i.config.listDensity||"cozy")})}
        </div>
      </section>`}backdropNote(){const e=i.backdropState||{},n=e.active||"off",s=i.config.nativeBackdrop||"off",a=s!==n,r=[];return e.preview?r.push("浏览器预览里没有原生窗口，材质只在打包后的应用里能看到。"):(r.push(p`窗口当前生效：<b>${Jn(n)}</b>${e.os?` · ${e.os}`:""}`),!e.supported&&s!=="off"&&r.push("当前系统不支持 Mica / Acrylic（需要 Windows 11 Build 22621 或更高），会退化成普通的背景模糊。"),a&&r.push(p`已保存为 <b>${Jn(s)}</b>，重启应用后生效。`)),p`
      <div class="setting setting--stack">
        <div class="setting__hint">${r.map((o,l)=>p`${l?p`<br />`:M}${o}`)}</div>
        ${a&&!e.preview?p`<div class="card__actions">
              <button class="btn btn--sm" type="button" data-act="backdrop-restart">${f("refresh")}<span>立即重启应用</span></button>
            </div>`:M}
      </div>`}playerCard(){const e=ms(),n=zr();return p`
      <section class="card" id="sec-player" data-section="appearance">
        <div class="card__head">
          <div class="card__icon">${f("disc")}</div>
          <div class="card__titles">
            <div class="card__title">播放界面样式</div>
            <div class="card__desc">内置样式来自独立包 player-skins（接口版本 ${dd}）；把第三方样式放进样式目录即可扩展</div>
          </div>
          <div class="card__actions">
            <button class="btn btn--sm" type="button" data-act="reload-skins">${f("refresh")}<span>重新扫描样式</span></button>
            <button class="btn btn--sm" type="button" data-act="open-skin-dir">${f("folder")}<span>打开样式目录</span></button>
          </div>
        </div>
        <div class="themes">
          ${e.map(s=>{const a=i.config.playerViewMode===s.id;return p`
              <div class="skincard" data-active=${String(a)}>
                <button class="skincard__pick" type="button" data-act="skin-pick" data-id=${s.id} aria-pressed=${String(a)} aria-label=${`使用样式 ${s.name}`}>
                  <span class="skincard__icon">${f(s.icon||"disc")}</span>
                  <span class="skincard__name">${s.name}</span>
                  <span class="skincard__id">${s.id}</span>
                </button>
                ${s.builtin?M:p`<span class="skincard__badge">第三方</span>
                    <button class="carddel" type="button" data-act="skin-remove" data-id=${s.id} data-name=${s.name} data-tip="移除样式" aria-label=${`移除样式 ${s.name}`}>${f("trash")}<span>移除</span></button>`}
              </div>`})}
          <button class="themes__add" type="button" data-act="skin-help">
            ${f("plus")}
            <span>自定义样式</span>
            <span class="u-num u-fs-xs">用 AI 帮你写一个</span>
          </button>
        </div>
        ${n.length?p`<div class="card__body">
              ${n.map(s=>p`
                  <div class="setting">
                    <div class="setting__main">
                      <div class="setting__label">样式「${s.id}」加载失败</div>
                      <div class="setting__hint">${s.reason}</div>
                    </div>
                  </div>`)}
            </div>`:M}
        <div class="card__body">
          ${B({label:"封面轮播",hint:"一首歌有多张封面时，播放详情页按下面的间隔轮换显示（不影响列表缩略图）",control:ie("coverCarousel",i.config.coverCarousel===!0,"封面轮播")})}
          ${B({label:"轮播间隔",hint:"对应设置项 coverCarouselInterval（秒）",control:Un("set-carousel","coverCarouselInterval","轮播间隔")})}
        </div>
      </section>`}playbackCard(){return p`
      <section class="card" id="sec-playback" data-section="playback">
        <div class="card__head">
          <div class="card__icon">${f("headphones")}</div>
          <div class="card__titles">
            <div class="card__title">播放</div>
            <div class="card__desc">播放模式、随机方式与单击行为（界面相关的设置都在「外观」里）</div>
          </div>
        </div>
        <div class="card__body">
          ${B({label:"默认播放模式",hint:"点击底栏循环按钮可随时切换",control:Oe("playMode",[{value:"sequence",label:"列表循环"},{value:"loop-one",label:"单曲循环"},{value:"shuffle",label:"随机"}],i.config.playMode==="loop-all"?"sequence":i.config.playMode)})}
          ${B({label:"随机播放方式",hint:"随机播放会先打乱当前播放列表，再按打乱后的顺序播放",control:Oe("shuffleMode",[{value:"reshuffle",label:"播完重新打乱"},{value:"once",label:"只打乱一次"}],i.config.shuffleMode||"reshuffle")})}
          ${B({label:"记忆音量",hint:`当前音量 ${Math.round(i.volume*100)}%`,control:ie("rememberVolume",!0,"记忆音量")})}
          ${B({label:"单击歌曲时的行为",hint:"双击始终是「立即播放这一首」；这个设置只影响单击：播放＝播放它并把它加进播放列表；播放该歌单＝播放它并用当前列表替换播放列表；添加为一首播放＝插到当前歌曲后面，点了「下一曲」就播它",control:Oe("rowClickAction",Sd,i.config.rowClickAction||"next")})}
        </div>
      </section>`}lyricsCard(){return p`
      <section class="card" id="sec-lyrics" data-section="lyrics">
        <div class="card__head">
          <div class="card__icon">${f("lyrics")}</div>
          <div class="card__titles">
            <div class="card__title">歌词</div>
            <div class="card__desc">歌词来源优先级与显示效果</div>
          </div>
        </div>
        <div class="card__body">
          ${B({label:"歌词来源优先级",hint:"内嵌歌词 → 同目录 .lrc → 歌词缓存 → 在线自动匹配；本地读不到时会自动联网匹配并存入缓存",control:p`<span class="chip"><i class="chip__dot"></i>${Ed()}</span>`})}
          ${B({label:"显示歌词",hint:"关闭后播放界面只显示封面",control:ie("showLyrics",i.config.showLyrics,"显示歌词")})}
          ${B({label:"桌面歌词",hint:"在桌面上显示一行置顶歌词（独立透明窗口，可拖动；底栏「桌面歌词」按钮同效）。位置会被记住，换显示器后跑丢了可以在这里重置",control:p`
              ${ie("showDesktopLyrics",i.config.showDesktopLyrics,"桌面歌词")}
              <button class="btn btn--ghost btn--sm" type="button" data-act="reset-desktop-lyrics-pos" data-tip="把桌面歌词窗口移回默认位置并清掉记忆">重置位置</button>`})}
          ${B({label:"桌面背景歌词",hint:"把播放界面的背景铺满桌面、垫在桌面图标之下，歌词跟着画在上面（与「桌面歌词」二选一；仅 Windows）",control:ie("showDesktopWallpaper",i.config.showDesktopWallpaper,"桌面背景歌词")})}
          ${B({label:"歌词字号",hint:"对应 --lyric-size，当前行会额外放大",control:Un("set-lyric-size","lyricsFontSize","歌词字号")})}
          ${B({label:"居中高亮行数",hint:"当前行上下各显示的行数",control:Oe("lyricsLines",[3,5,7,9].map(e=>({value:String(e),label:String(e)})),String(i.config.lyricsLines))})}
        </div>
      </section>`}loudnessCard(){const e=i.config,n=i.loudnessState||{},s=n.measured??0,a=n.missing??Math.max(0,i.songs.length-s),r=n.total??i.songs.length,o=n.available!==!1,c=(i.ffmpegState||{}).describe||n.describe||"检测中…";return p`
      <section class="card" id="sec-loudness" data-section="loudness">
        <div class="card__head">
          <h2 class="card__title">${f("scale")}<span>响度均衡</span></h2>
          <p class="card__desc">
            按 EBU R128 测量整合响度（LUFS），回放时按目标响度做增益补偿，
            让不同来源的歌曲音量听起来一致。<br />
            <b>只在播放时按需测量</b>：播到哪首就测哪首，算好的补偿会缓存下来，
            之后播放零延迟；没有手动预热的入口。改了目标响度后旧补偿会自动失效并按新标准重算。
          </p>
        </div>

        <div class="setting">
          <div class="setting__label">
            <span>均衡模式</span>
            <small class="u-fs-xs u-dim">逐曲：每首歌都拉到目标响度；同专辑：整张专辑用同一个增益，保留专辑内部的强弱对比</small>
          </div>
          <div class="setting__control">${Oe("loudnessMode",ju,e.loudnessMode||"off")}</div>
        </div>

        <div class="setting">
          <div class="setting__label">
            <span>目标响度</span>
            <small class="u-fs-xs u-dim">数字越小整体越轻。推荐 -16 LUFS。改动后已缓存的补偿会失效并重算</small>
          </div>
          <div class="setting__control">
            <div class="select">
              <select class="select__field" data-act="loudness-target" aria-label="目标响度">
                ${Uu.map(d=>p`<option value=${d.value} ?selected=${Number(e.loudnessTarget)===d.value}>${d.label}</option>`)}
              </select>
              ${f("chevron-down","select__icon")}
            </div>
          </div>
        </div>

        <div class="setting">
          <div class="setting__label">
            <span>真峰值保护</span>
            <small class="u-fs-xs u-dim">抬升音量时限制增益，避免超过 -1 dBTP 造成削波失真</small>
          </div>
          <div class="setting__control">
            <button class="switch" type="button" role="switch" data-toggle="loudnessLimit" aria-checked=${String(!!e.loudnessLimit)}>
              <span class="switch__thumb"></span>
            </button>
          </div>
        </div>

        <div class="setting setting--stack">
          <div class="card__actions">
            <button class="btn btn--sm" type="button" data-act="loudness-refresh">${f("refresh")}<span>重新拉取补偿</span></button>
            <button class="btn btn--sm btn--danger" type="button" data-act="loudness-clear">${f("trash")}<span>清除测量数据</span></button>
          </div>

          <div class="setting__hint">
            当前标准下已算好 <b>${s}</b> / ${r} 首${a?p`，其余 <b>${A(a)}</b> 首会在播放时按需计算`:"（全部已算好）"}<br />
            缓存文件里另有 ${n.cached??0} 条记录（含其他标准下的旧结果，不会生效）<br />
            响度来源：<b>${o?c:"不可用"}</b>${o?"":" —— 转码与响度测量不可用"}
          </div>
        </div>
      </section>`}onlineCard(){const e=i.config.downloadDir||"（默认：系统音乐目录 / downloads）",n=i.coverProviders||[],s=i.coverBreaker||{},a=n.length?n.map(r=>s[r]?`${r}（暂时不可用）`:r).join(" · "):"尚未连接后端";return p`
      <section class="card" id="sec-online" data-section="online">
        <div class="card__head">
          <div class="card__icon">${f("music")}</div>
          <div class="card__titles">
            <div class="card__title">在线歌曲</div>
            <div class="card__desc">下载位置、封面来源与缓存。试听只加入播放列表，不会混进本地曲库</div>
          </div>
        </div>
        <div class="card__body">
          <div class="setting setting--stack">
            <div class="setting__main">
              <div class="setting__label">下载保存位置</div>
              <div class="setting__hint">
                这个目录会作为曲库的扫描根自动生效，下载完的歌直接出现在「本地歌曲」里，
                不需要手动添加文件夹
              </div>
            </div>
            <div class="pathrow">
              <svg class="pathrow__icon" aria-hidden="true"><use href="#i-folder"></use></svg>
              <div class="pathrow__main">
                <div class="pathrow__path u-selectable" title=${e}>${e}</div>
              </div>
              <button class="btn btn--sm" type="button" data-act="download-dir-pick">${f("folder")}<span>更改</span></button>
              <button class="btn btn--ghost btn--sm" type="button" data-act="download-dir-open">${f("expand")}<span>打开</span></button>
              <button class="btn btn--ghost btn--sm" type="button" data-act="download-dir-reset" data-tip="恢复默认（系统音乐目录 / downloads）">${f("refresh")}</button>
            </div>
          </div>

          ${B({label:"联网获取封面",hint:`在线搜索到的歌曲会自动去公开曲库匹配封面：${a}`,control:ie("onlineCover",i.config.onlineCover!==!1,"联网获取封面")})}

          ${B({label:"把封面/歌词写进歌曲文件",hint:Id(),control:ie("embedMeta",i.config.embedMeta===!0,"写进歌曲文件")})}

          <div class="setting setting--stack">
            <div class="setting__main">
              <div class="setting__label">把已有缓存补写进文件</div>
              <div class="setting__hint">${Dd()}</div>
            </div>
            <div class="card__actions">
              <button class="btn btn--sm" type="button" data-act="embed-cache-write">${f("tag")}<span>写入缓存到文件</span></button>
            </div>
          </div>

          <div class="setting setting--stack">
            <div class="setting__main">
              <div class="setting__label">缓存目录</div>
              <div class="setting__hint">
                封面与歌词的缓存位置；${si()}
              </div>
            </div>
            <div class="pathrow">
              <svg class="pathrow__icon" aria-hidden="true"><use href="#i-folder"></use></svg>
              <div class="pathrow__main">
                <div class="pathrow__path u-selectable" data-role="cache-dir" title=${i.coverCache?.dir||""}>${i.coverCache?.dir||"（连接后显示）"}</div>
              </div>
              <button class="btn btn--sm" type="button" data-act="cache-open-covers">${f("image")}<span>封面</span></button>
              <button class="btn btn--ghost btn--sm" type="button" data-act="cache-open-lyrics">${f("lyrics")}<span>歌词</span></button>
            </div>
          </div>
        </div>
        <div class="card__foot">
          <span>封面来自第三方公开接口（iTunes / 网易云 / Deezer / MusicBrainz），匹配不保证 100% 准确</span>
          <button class="btn btn--sm" type="button" data-act="cover-refresh">${f("refresh")}<span>清空封面缓存</span></button>
        </div>
      </section>`}aiCard(){const e=i.config||{},n=!!(String(e.aiBaseUrl||"").trim()&&String(e.aiApiKey||"").trim()),s=(a,r,o,l,c="text")=>p`
      <div class="setting setting--stack">
        <div class="setting__main">
          <div class="setting__label">${a}</div>
          <div class="setting__hint">${r}</div>
        </div>
        <input
          class="input"
          type=${c}
          data-act="ai-field"
          data-key=${o}
          .value=${e[o]||""}
          placeholder=${l}
          autocomplete="off"
          spellcheck="false"
        />
      </div>`;return p`
      <section class="card" id="sec-ai" data-section="ai">
        <div class="card__head">
          <div class="card__icon">${f("settings")}</div>
          <div class="card__titles">
            <div class="card__title">AI 相关</div>
            <div class="card__desc">自动匹配歌词 / 封面时，用 AI 从脏文件名里提取真实元数据</div>
          </div>
        </div>
        <div class="card__body">
          ${s("接口地址（Base URL）","OpenAI 兼容接口，例如 https://api.openai.com/v1","aiBaseUrl","https://api.openai.com/v1")}
          ${s("API Key","只写入本地配置，不会发往该接口以外的任何地方","aiApiKey","sk-...","password")}
          ${s("模型 ID","例如 gpt-4o-mini、deepseek-chat；留空默认 gpt-4o-mini","aiModelId","gpt-4o-mini")}
          ${B({label:"模型类型",hint:"思考模式的开关参数各家不同，必须选对厂商才会发出正确的请求体；选「自动识别」会按接口地址与模型名判断",control:p`
              <select class="select__field" data-act="ai-vendor" aria-label="模型类型">
                ${Ya.map(a=>p`<option value=${a.id} ?selected=${a.id===(e.aiVendor||"auto")}>${a.label}</option>`)}
              </select>`})}
          ${B({label:"启用思考模式",hint:Hu(e),control:ie("aiThinking",!!e.aiThinking,"启用思考模式")})}
          ${B({label:"自动匹配歌词时使用 AI 清洗元数据",hint:"自动匹配歌词前先用 AI 从文件名里还原真实的标题/歌手。AI 一次调用可能要十几秒，关掉后只做本地整形：匹配更快，但脏文件名的命中率会低一些",control:ie("aiLyricsClean",i.config.aiLyricsClean!==!1,"自动匹配歌词时使用 AI 清洗元数据")})}
          <div class="setting__hint">
            ${n?"已配置：自动匹配封面时，会先把文件名与现有元数据交给 AI 清洗，再去匹配。":"尚未配置：填入 Base URL 与 API Key 后自动启用。"}
          </div>
        </div>
      </section>`}aboutCard(){const e=i.lastScan,n=i.songs.reduce((a,r)=>a+r.duration,0),s=i.songs.reduce((a,r)=>a+r.size,0);return p`
      <section class="card" id="sec-about" data-section="about">
        <div class="card__head">
          <div class="card__icon">${f("info")}</div>
          <div class="card__titles">
            <div class="card__title">关于与数据</div>
            <div class="card__desc">曲库统计与缓存位置</div>
          </div>
        </div>
        <div class="kv">
          <div class="kv__k">曲库文件</div><div class="kv__v">${A(i.allSongsRaw.length)} 个</div>
          <div class="kv__k">过滤后歌曲</div><div class="kv__v">${A(i.songs.length)} 首</div>
          <div class="kv__k">被规则过滤</div><div class="kv__v">${A(e?.excluded??0)} 个</div>
          <div class="kv__k">总时长</div><div class="kv__v">${Math.floor(n/36e5)} 小时 ${Math.floor(n%36e5/6e4)} 分</div>
          <div class="kv__k">占用空间</div><div class="kv__v">${So(s)}</div>
          <div class="kv__k">上次扫描</div><div class="kv__v">${e?new Date(e.at).toLocaleString("zh-CN"):"—"}</div>
          <div class="kv__k">缓存目录</div><div class="kv__v">${i.config.cacheDir}</div>
          <div class="kv__k">版本</div><div class="kv__v">0.1.0（Go + Wails3 · Lit 前端）</div>
        </div>
        <div class="card__foot">
          <span>清空缓存不会删除任何本地音乐文件</span>
          <button class="btn btn--danger btn--sm" type="button" data-act="clear-cache">${f("trash")}<span>清空缓存</span></button>
        </div>
      </section>`}async onClick(e){if(e.target.closest("[data-settings-close]")||e.target===this.panelEl){ss();return}const n=e.target.closest("[data-goto]")?.dataset.goto;if(n){this.scrollToSection(n);return}const s=e.target.closest("[data-toggle],[data-segment] .segmented__btn");if(s){Kd(s,{commit:x})&&an(),this.requestUpdate();return}const a=e.target.closest("[data-act]");a&&(await gs(a,{commit:x,render:()=>{i.settingsRev=(i.settingsRev||0)+1,x()},rescan:()=>_n({manual:!0})}),an())}async onChange(e){if(e.target.dataset.act)try{await gs(e.target,{commit:x,render:()=>{i.settingsRev=(i.settingsRev||0)+1,x()},rescan:()=>_n({manual:!0})}),an(),this.requestUpdate()}catch(s){console.error("[settings] 处理下拉框失败",s),u(`设置未生效：${s?.message??s}`,{tone:"error",duration:5e3})}}onInput(e){if(e.target.dataset.act!=="rule-value")return;const n=i.filterRules.find(s=>s.id===e.target.dataset.id);n&&(n.value=e.target.value,x(),this.requestUpdate())}onScroll(e){const n=e.target;if(!n.classList?.contains("settings-layer__body"))return;if(this._navPausedUntil){this.deferNavResume();return}const s=n.getBoundingClientRect().top+80;let a=bt[0].id;for(const r of bt){const o=this.querySelector(`[data-section="${r.id}"]`);o&&o.getBoundingClientRect().top<=s&&(a=r.id)}n.scrollHeight>n.clientHeight+2&&n.scrollTop+n.clientHeight>=n.scrollHeight-2&&(a=bt[bt.length-1].id),a!==this._activeSection&&(this._activeSection=a,this.paintNav())}paintNav(){for(const e of this.querySelectorAll(".settings__nav-item"))e.setAttribute("aria-selected",String(e.dataset.goto===this._activeSection))}deferNavResume(){clearTimeout(this._navResumeTimer),this._navResumeTimer=setTimeout(()=>{this._navResumeTimer=null,this._navPausedUntil=0},140)}scrollToSection(e){const n=this.querySelector(`[data-section="${e}"]`),s=this.querySelector(".settings-layer__body");if(!n||!s)return;this._activeSection=e,this.paintNav(),this._navPausedUntil=1,this.deferNavResume();const a=this.querySelector(".settings__nav"),r=a?a.offsetHeight:0,o=n.getBoundingClientRect().top-s.getBoundingClientRect().top,l=Math.max(0,s.scrollTop+o-r-8);s.scrollTo({top:l,behavior:"smooth"})}bindSliders(){for(const e of this.querySelectorAll("[data-slider]")){const n=e.dataset.slider;if(!n)continue;let s=this._sliders.get(e);if(!s){s=dt(e,this.sliderOptions(e,n)),this._sliders.set(e,s);const a=e.parentElement.querySelector(".rangeslider__value");a&&(a.textContent=s.text(this.sliderValue(n)))}s.set(this.sliderValue(n),{silent:!0})}}sliderOptions(e,n){const s=n==="glassBlur",a=n==="glassAlpha",r=n==="coverCarouselInterval",o=r?2:n==="lyricsFontSize"?12:s?0:a?20:0,l=r?60:n==="lyricsFontSize"?26:s?48:a?95:100,c=r?" 秒":s?"px":a?"%":"px";return{min:o,max:l,step:1,value:this.sliderValue(n),format:d=>`${Math.round(d)}${c}`,onChange:d=>{i.config[n]=d;const m=e.parentElement.querySelector(".rangeslider__value");m&&(m.textContent=`${Math.round(d)}${c}`),s&&(i.config.glassBlurCustom=!0,lt("--glass-blur",`${d}px`)),a&&(i.config.glassAlphaCustom=!0,Ha(d)),n==="lyricsFontSize"&&lt("--lyric-size",`${d}px`)},onCommit:()=>x()}}sliderValue(e){return e==="glassBlur"?i.config.glassBlurCustom?i.config.glassBlur:ya():e==="glassAlpha"?i.config.glassAlphaCustom?i.config.glassAlpha:ba():i.config[e]??0}}te("mp-settings-layer",Wu);class Vu extends me{static deps=e=>[e.floatingLyrics?.show,e.floatingLyrics?.text];render(){const e=i.floatingLyrics||{show:!1,text:""};return p`
      <div class="desktop-lyrics" id="desktop-lyrics" ?hidden=${!e.show} aria-hidden="true">
        <div class="desktop-lyrics__line" id="desktop-lyrics-line">${e.text}</div>
      </div>
    `}}te("mp-floating-lyrics",Vu);class Ku extends me{static deps=e=>[e.playerOpen,e.scanning,e.scanText,e.config.listDensity];updated(){const e=document.documentElement,n=i.config.listDensity||"cozy";e.dataset.density!==n&&(e.dataset.density=n)}render(){return p`
      <div class="app-bg" id="app-bg" aria-hidden="true"></div>

      <div
        class="app"
        id="app"
        data-view=${i.playerOpen?"player":"library"}
        data-mode="classic"
        data-resolved-theme="dark-minimal"
      >
        <div class="skin-bg" id="skin-background" hidden aria-hidden="true"></div>
        <mp-titlebar></mp-titlebar>
        <mp-sidebar></mp-sidebar>
        <mp-content></mp-content>
        <mp-playerview></mp-playerview>
        <mp-playerbar></mp-playerbar>
      </div>

      <mp-queue-panel></mp-queue-panel>
      <mp-options-panel></mp-options-panel>
      <mp-sleep-panel></mp-sleep-panel>
      <mp-download-panel></mp-download-panel>
      <mp-search-overlay></mp-search-overlay>
      <mp-lyrics-panel></mp-lyrics-panel>
      <mp-cover-layer></mp-cover-layer>
      <mp-settings-layer></mp-settings-layer>
      <mp-floating-lyrics></mp-floating-lyrics>

      <div class="scanning" id="scanning" ?hidden=${!i.scanning}>
        <div class="scanning__box">
          <div class="scanning__ring"></div>
          <div class="scanning__text" id="scanning-text">${i.scanText||"正在扫描音乐文件夹…"}</div>
        </div>
      </div>
    `}}te("mp-app",Ku);let fn="";const la=new Map,jn=new Map;function Gu(){const t=new Image;return t.decoding="async",t.alt="",t}function Yu(t){return!i.config.accentFromCover||!yn(t)?!1:t!==fn}function bo(t){if(!yn(t))return Promise.resolve("");if(la.has(t))return Promise.resolve(la.get(t));if(jn.has(t))return jn.get(t);const e=new Promise(n=>{const s=o=>{la.set(t,o),jn.delete(t),n(o)},a=document.getElementById("bar-cover-img");if(a&&a.getAttribute("src")===t&&a.complete&&a.naturalWidth>0){s(qt(yi(a)));return}const r=Gu();r.addEventListener("load",()=>s(yn(t)?qt(yi(r)):"")),r.addEventListener("error",()=>s("")),r.src=t});return jn.set(t,e),e}async function yo(t){t&&Sl(t,t)&&(await an(),await Ie(i.config))}async function Xu(){if(!i.config.accentFromCover||qt(i.config.coverSeed))return;const t=i.currentId?Ge(i.currentId):null,e=t?ht(t):"";e&&(fn=e,await yo(await bo(e)))}function Qu(t){if(!i.config.accentFromCover){fn="";return}if(t){if(!yn(t)){fn=t;return}Yu(t)&&(fn=t,bo(t).then(yo))}}function Ju(t){kl(yn(t)?t:"")}let er="";function Zu(t){return[i.currentId??"",i.playing?1:0,Math.round((i.position||0)/250),i.duration||0,i.volume,i.muted?1:0,i.config.loudnessMode||"off",En()?1:0,In()?1:0,Math.round(Number(i.config.lyricsFontSize)||16),t].join("|")}function tr(){const t=i.currentId?Ge(i.currentId):null,e=t?ht(t):"",n=Zu(e);n!==er&&(er=n,Mc(),wn(),En()&&(i.playing&&fs(),Rc({text:i.playing?jc():"",playing:!!i.playing,fontSize:Math.round((Number(i.config.lyricsFontSize)||16)*1.5)})),In()&&(i.playing&&fs(),La()),Qu(e),Ju(e))}function ep(){zo(tr),tr()}const st=new Map;async function tp(){await ys(),await Xu(),await Ie(i.config),window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",async()=>{i.config.themeMode==="system"&&(await Ie(i.config),x())})}async function np(){if(S())try{const t=await _.coverCachedSets();if(!t||typeof t!="object")return;cr(t);const e=Object.keys(t).length;e&&console.info(`[cover] 已从缓存回填 ${e} 首歌的封面（含多封面）`)}catch(t){console.info("[cover] 封面缓存回填跳过",t?.message??t)}}function sp(){document.addEventListener("keydown",t=>{const e=t.target.tagName,n=e==="INPUT"||e==="TEXTAREA"||e==="SELECT"||t.target.isContentEditable;if(t.key==="Escape"){if(document.getElementById("modal-backdrop")?.hidden===!1)return;Zt(),i.playerOpen&&xs();return}if(!n)switch(t.key){case" ":t.preventDefault(),kn();break;case"ArrowRight":t.ctrlKey||t.metaKey?mn(!1):ps(i.position+5e3);break;case"ArrowLeft":t.ctrlKey||t.metaKey?Na():ps(i.position-5e3);break;case"ArrowUp":t.preventDefault(),ua(i.volume+.05);break;case"ArrowDown":t.preventDefault(),ua(i.volume-.05);break;case"l":case"L":i.currentId&&vs(i.currentId);break;case"p":case"P":Pa();break;case"f":case"F":ap();break}})}async function ap(){if(S()){const t=!document.fullscreenElement;await _.windowSetFullscreen(t);return}document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen().catch(()=>{})}function ip(){se("scan:start",()=>{i.scanning=!0,i.scanText="正在扫描音乐文件夹…",x()}),se("scan:progress",t=>{t&&(t.phase==="walk"?i.scanText="正在遍历音乐文件夹…":t.total&&(i.scanText=`正在读取元数据 ${t.current} / ${t.total}`),x())}),se("scan:done",async t=>{i.scanning=!1;const e=await _.songs();if(Array.isArray(e)){const s=new Set(i.songs.map(o=>o.id));i.allSongsRaw=e;const{kept:a,excluded:r}=lr(e,i.filterRules);i.songs=a,i.lastScan={at:Date.now(),found:e.length,kept:a.length,excluded:r,added:a.filter(o=>!s.has(o.id)).length,removed:[...s].filter(o=>!a.some(l=>l.id===o)).length}}const n=await _.folders();Array.isArray(n)&&(i.folders=n),x(),t?.added&&!t?.firstRun&&u(`文件夹变化：新增 ${t.added} 首`,{tone:"success"})}),se("scan:failed",t=>{i.scanning=!1,x(),u(`扫描失败：${t?.message??"未知错误"}`,{tone:"error",duration:5e3})}),se("theme:changed",t=>{i.config.theme=t,Ie(i.config),x()}),se("player:state",t=>{t&&(typeof t.position=="number"&&(i.position=t.position),typeof t.duration=="number"&&(i.duration=t.duration),typeof t.playing=="boolean"&&(i.playing=t.playing))}),se("cover:changed",async t=>{const e=String(t?.id||"");try{if(!e){const s=await _.coverCachedSets();s&&typeof s=="object"&&cr(s);return}const n=await _.coverList(e);n&&Array.isArray(n.items)&&pa(e,n)}catch(n){console.info("[cover] 同步封面失败",n?.message??n)}}),se("loudness:progress",t=>{t&&(i.loudnessState={...i.loudnessState||{},...t,running:!0},x())}),se("loudness:done",async t=>{i.loudnessState={...i.loudnessState||{},running:!1},x();const e=t?.failed??0;u(e?`响度测量完成：成功 ${t?.done-e} 首，失败 ${e} 首`:`响度测量完成：共 ${t?.done??0} 首`,{tone:e?"warning":"success",duration:4e3}),await pn(),await ws()}),se("loudness:failed",t=>{i.loudnessState={...i.loudnessState||{},running:!1},x(),u(`响度测量失败：${t?.message??"未知错误"}`,{tone:"error",duration:6e3})}),se("ffmpeg:ready",t=>{t&&(i.ffmpegState=t,x(),console.info(`[ffmpeg] ${t.available?t.describe:"不可用"}`))}),se("download:progress",t=>{if(!t?.bvid)return;const e=t.title||t.bvid,n=Number(t.total)||0,s=Number(t.done)||0,a=n>0?Math.round(s/n*100):0,r=n>0?`下载中 ${a}% · ${e}`:`下载中 ${e}`;st.has(t.bvid)?st.get(t.bvid).update(r):st.set(t.bvid,u(r,{duration:0}))}),se("download:done",t=>{const e=st.get(t?.bvid);st.delete(t?.bvid);const n=`已下载：${t?.title||t?.bvid} → ${t?.path||t?.dir||""}`;e?e.update(n,"success"):u(n,{tone:"success",duration:5e3}),setTimeout(()=>e?.close(),4e3)}),se("download:failed",t=>{const e=st.get(t?.bvid);st.delete(t?.bvid);const n=`下载失败：${t?.message??"未知错误"}`;e?e.update(n,"error"):u(n,{tone:"error",duration:6e3}),setTimeout(()=>e?.close(),6e3)})}function nr(){const t=new URLSearchParams(location.search);if(!t.toString())return;const e=t.get("theme");if(e){i.config.theme=e;const o=ns(e);o?.mode&&(i.config.themeMode=o.mode)}const n=t.get("tab");n==="settings"?i.settingsOpen=!0:n==="queue"?i.view="queue":n==="playlist"&&(i.view="playlist",i.playlistId=t.get("pl")||i.playlists[1]?.id||null);const s=t.get("pv");s&&(i.pvMode=s,i.config.playerViewMode=s),t.get("view")==="player"&&(i.playerOpen=!0),t.get("playing")==="1"&&(i.playing=!0,i.position=Number(t.get("pos")||62e3)),t.get("scan")==="1"&&(i.scanning=!0,setTimeout(()=>{i.scanning=!1,x()},8e3)),t.get("query")&&(i.query=t.get("query"));const a=Number(t.get("songs"));if(!S()&&Number.isFinite(a)&&a>i.songs.length){const o=i.songs.slice();for(;i.songs.length<a;){const l=i.songs.length,c=o[l%o.length];i.songs.push({...c,id:`bench_${l}`,path:`C:/bench/${l}.${c.ext||"mp3"}`})}i.allSongsRaw=i.songs.slice(),x()}const r=t.get("density");r&&["compact","cozy","roomy"].includes(r)&&(i.config.listDensity=r),t.get("album")==="off"&&(i.config.showAlbumColumn=!1)}async function rp(){await jo(),nr();const t=np();await tp(),Wc().then(()=>{hr()&&El()}),await kc(),ul(),Ml(),await Nl(),ud(),sp(),ip(),nr(),ep(),await t,await Ie(i.config),Bt();let e=!1;const n=()=>{e||(e=!0,_.windowReady().catch(()=>{}))};if(setTimeout(n,0),requestAnimationFrame(()=>requestAnimationFrame(n)),await pn(),await ws(),Ho(),xo(),window.addEventListener("beforeunload",()=>{an()}),document.body.dataset.ready="true",new URLSearchParams(location.search).get("probe")==="1"){const{runProbe:s}=await pt(async()=>{const{runProbe:a}=await import("./probe-BTvxc-Wt.js");return{runProbe:a}},[]);setTimeout(()=>{const a=s();window.__probeReport=a,console.info("[probe]",a)},600)}S()||console.info(`%c浏览器预览模式%c
当前使用假数据渲染界面。接入 Go + Wails3 后端后，同名前端的 store/bridge 会自动改走后端方法。`,"background:#fff;color:#000;padding:2px 6px;border-radius:4px;font-weight:700","color:#888")}rp().catch(t=>{console.error("[app] 启动失败",t),u(`启动失败：${t.message}`,{tone:"error",duration:6e3})});window.addEventListener("unhandledrejection",t=>{const e=t.reason,n=e?.message||String(e||"未知错误");/no backend|preview:/i.test(n)||(console.error("[app] 未处理的异步错误",e),u(n.length>120?`${n.slice(0,120)}…`:n,{tone:"error",duration:6e3}))});window.addEventListener("error",t=>{t.message&&console.error("[app] 运行时错误",t.error||t.message)});window.__app={state:i,commit:x,navigate:Tt,openPlayer:Gr,closePlayer:xs,rescan:sr,doRescan:_n,currentSong:Ot,isLiked:Pt,nextIndex:Uo,setPlayerViewMode:$n,applyGainForSong:wn};const ii=Object.freeze(Object.defineProperty({__proto__:null,closeCoverPanel:sn,openCoverPanel:Fu},Symbol.toStringTag,{value:"Module"}));
