const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/base-JvEIBNk2.js","assets/bridge-B2s8uzRH.js"])))=>i.map(i=>d[i]);
import{d as Sl,i as $,b,f as E,o as U,e as Mt,w as xl,g as kt,D as Cs,h as ht,u as Nn,j as Fs,k as Br,l as Cl,r as Tl,n as tn,p as Il}from"./bridge-B2s8uzRH.js";import{j as El,E as It,s as i,c as k,t as u,a as Tn,e as Ta,r as Ts,f as Fr,g as fe,d as ee,M as me,A as x,h as f,b as c,k as Al,p as wt,o as K,l as We,m as Ft,n as Dl,q as Ml,u as ni,v as Pl,w as Ol,x as Ll,L as Xn,y as Ur,z as In,B as Rl,C as Fe,D as Ve,F as Ke,G as Ut,H as Hr,I as zr,J as Nl,K as ql,N as Bl,O as Gt,$ as Ai,P as si,Q as Fl,R as Ul,S as st,T as _t,U as ai,V as Hl,W as zl,X as Wl,Y as Wr,Z as Kl,_ as us,a0 as jl,a1 as Vl,a2 as Gl,a3 as Pt,a4 as Yl,a5 as Xl,a6 as Ql,a7 as kn,a8 as Ia,a9 as Kr,aa as Ea,ab as jr,ac as Jl,ad as Vr,ae as Di,af as Zl,ag as ec,ah as tc,ai as nc,aj as Mi,ak as sc,al as Gr,am as En,an as ac,ao as Yr,ap as ic,aq as rc,ar as oc,as as lc,at as cc,au as dc,av as Aa,aw as uc,ax as Da,ay as Xr,az as pc,aA as fc,aB as hc,aC as mc,aD as Pi,aE as Oi,aF as bc,aG as vc,aH as gc,aI as _c,aJ as yc,aK as wc,aL as $c,aM as Us,aN as kc,aO as Sc,aP as xc,aQ as Cc,aR as Tc,aS as Ic,aT as Ec,aU as Ac,aV as Dc,aW as Mc,aX as pn,aY as Pc,aZ as Oc,a_ as Lc,a$ as Rc,b0 as Nc,b1 as qc,b2 as Qr,b3 as Bc,b4 as Fc,b5 as Uc}from"./base-JvEIBNk2.js";import{s as Hc,S as zc,f as Qn,a as Jn,b as Wc,p as Li,m as Kc,d as Ri,e as ps,g as Sn,h as jc,l as Vc,n as Gc,i as Yc,u as Xc,r as Is,c as Qc,j as Es,k as Jc,w as Zc,o as ed}from"./skinhost-lb8Kfv9S.js";const td="modulepreload",nd=function(t){return"/"+t},Ni={},$t=function(e,n,s){let a=Promise.resolve();if(n&&n.length>0){let d=function(p){return Promise.all(p.map(m=>Promise.resolve(m).then(h=>({status:"fulfilled",value:h}),h=>({status:"rejected",reason:h}))))};document.getElementsByTagName("link");const o=document.querySelector("meta[property=csp-nonce]"),l=o?.nonce||o?.getAttribute("nonce");a=d(n.map(p=>{if(p=nd(p),p in Ni)return;Ni[p]=!0;const m=p.endsWith(".css"),h=m?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${p}"]${h}`))return;const g=document.createElement("link");if(g.rel=m?"stylesheet":td,m||(g.as="script"),g.crossOrigin="",g.href=p,l&&g.setAttribute("nonce",l),document.head.appendChild(g),m)return new Promise((S,v)=>{g.addEventListener("load",S),g.addEventListener("error",()=>v(new Error(`Unable to preload CSS for ${p}`)))})}))}function r(o){const l=new Event("vite:preloadError",{cancelable:!0});if(l.payload=o,window.dispatchEvent(l),!l.defaultPrevented)throw o}return a.then(o=>{for(const l of o||[])l.status==="rejected"&&r(l.reason);return e().catch(r)})};const sd={CHILD:2},ii=t=>(...e)=>({_$litDirective$:t,values:e});let ri=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,n,s){this._$Ct=e,this._$AM=n,this._$Ci=s}_$AS(e,n){return this.update(e,n)}update(e,n){return this.render(...n)}};const{I:ad}=El,qi=t=>t,Bi=()=>document.createComment(""),nn=(t,e,n)=>{const s=t._$AA.parentNode,a=e===void 0?t._$AB:e._$AA;if(n===void 0){const r=s.insertBefore(Bi(),a),o=s.insertBefore(Bi(),a);n=new ad(r,o,t,t.options)}else{const r=n._$AB.nextSibling,o=n._$AM,l=o!==t;if(l){let d;n._$AQ?.(t),n._$AM=t,n._$AP!==void 0&&(d=t._$AU)!==o._$AU&&n._$AP(d)}if(r!==a||l){let d=n._$AA;for(;d!==r;){const p=qi(d).nextSibling;qi(s).insertBefore(d,a),d=p}}}return n},dt=(t,e,n=t)=>(t._$AI(e,n),t),id={},Jr=(t,e=id)=>t._$AH=e,rd=t=>t._$AH,Hs=t=>{t._$AR(),t._$AA.remove()};const Fi=(t,e,n)=>{const s=new Map;for(let a=e;a<=n;a++)s.set(t[a],a);return s},Se=ii(class extends ri{constructor(t){if(super(t),t.type!==sd.CHILD)throw Error("repeat() can only be used in text expressions")}dt(t,e,n){let s;n===void 0?n=e:e!==void 0&&(s=e);const a=[],r=[];let o=0;for(const l of t)a[o]=s?s(l,o):o,r[o]=n(l,o),o++;return{values:r,keys:a}}render(t,e,n){return this.dt(t,e,n).values}update(t,[e,n,s]){const a=rd(t),{values:r,keys:o}=this.dt(e,n,s);if(!Array.isArray(a))return this.ut=o,r;const l=this.ut??=[],d=[];let p,m,h=0,g=a.length-1,S=0,v=r.length-1;for(;h<=g&&S<=v;)if(a[h]===null)h++;else if(a[g]===null)g--;else if(l[h]===o[S])d[S]=dt(a[h],r[S]),h++,S++;else if(l[g]===o[v])d[v]=dt(a[g],r[v]),g--,v--;else if(l[h]===o[v])d[v]=dt(a[h],r[v]),nn(t,d[v+1],a[h]),h++,v--;else if(l[g]===o[S])d[S]=dt(a[g],r[S]),nn(t,a[h],a[g]),g--,S++;else if(p===void 0&&(p=Fi(o,S,v),m=Fi(l,h,g)),p.has(l[h]))if(p.has(l[g])){const C=m.get(o[S]),q=C!==void 0?a[C]:null;if(q===null){const F=nn(t,a[h]);dt(F,r[S]),d[S]=F}else d[S]=dt(q,r[S]),nn(t,a[h],q),a[C]=null;S++}else Hs(a[g]),g--;else Hs(a[h]),h++;for(;S<=v;){const C=nn(t,d[v+1]);dt(C,r[S]),d[S++]=C}for(;h<=g;){const C=a[h++];C!==null&&Hs(C)}return this.ut=o,Jr(t,d),It}}),fs=14,hs=72,od=16;function oi(t){const e=Math.round(Number(t));return!Number.isFinite(e)||e<=0?`${od}px`:`${Math.min(hs,Math.max(fs,e))}px`}const ld=[{id:"flat-dark",name:"简约深色",mode:"dark",builtin:!0,swatch:["#101113","#1b1d21","#3b4048","#e6e8eb","#8b9bb4"]},{id:"flat-light",name:"简约浅色",mode:"light",builtin:!0,swatch:["#f5f6f7","#ffffff","#d7dae0","#1a1c20","#43536b"]},{id:"cover-dark",name:"封面取色 · 深色",mode:"dark",builtin:!0,swatch:["#0b0b12","#2a2a31","#6b6b76","#f7f7fa","#ff4d6d"]}],ae=ld.slice();let Zr=0;function cd(){return Zr}function Yt(){return ae}function Ma(t){return ae.find(e=>e.id===t)||ae[0]}async function An(){if(!$())return ae;try{const t=await b.listThemes();if(!Array.isArray(t)||!t.length)return ae;for(const e of t){if(!e?.id)continue;const n=await b.loadTheme(e.id);typeof n=="string"&&n.trim()&&pd(e.id,n)}dd(t)}catch(t){console.warn("[theme] 主题目录扫描失败",t)}return ae}function dd(t){const e=[],n=new Set;for(const s of t){if(!s?.id||n.has(s.id))continue;n.add(s.id);const a={id:s.id,name:s.name||s.id,mode:s.mode||"dark",swatch:Array.isArray(s.swatch)?s.swatch:[],builtin:!!s.builtin},r=ae.find(o=>o.id===s.id);r?(Object.assign(r,a),e.push(r)):e.push(a)}for(const s of ae)e.includes(s)||Ts(`theme-file-${s.id}`,"");return ae.length=0,ae.push(...e),Zr+=1,ae}async function ud(t){return await b.deleteTheme(t),await An(),{removed:!ae.some(n=>n.id===t),themeIds:ae.map(n=>n.id)}}function pd(t,e){Ts(`theme-file-${t}`,e)}const fd=["--seed","--seed-2","--bg-app","--bg-window"],hd=["--seed","--seed-2"];function md(t){return document.documentElement.style.getPropertyValue(t).trim()?String(document.documentElement.style.getPropertyValue(t)):null}function bd(){const t=document.documentElement,e={};for(const n of hd){const s=md(n);s&&(e[n]=s)}for(const n of fd)t.style.removeProperty(n);return e}const Zn="cover-dark";function xn(t){return!!t&&!Sl(t)}let Ui=null,zs=null,Ws=null;async function Re(t){const e=document.documentElement,n=window.matchMedia("(prefers-color-scheme: dark)").matches,s=bd();s["--seed"]&&(zs=s["--seed"]),s["--seed-2"]&&(Ws=s["--seed-2"]);let a=t.theme||"flat-dark";if(t.themeMode==="system"){const h=n?"dark":"light",g=ae.find(S=>S.mode===h&&S.id!=="cover-dark");g&&(a=g.id)}else if(ae.find(h=>h.id===a)?.mode!==t.themeMode){const h=ae.find(g=>g.mode===t.themeMode&&g.id!=="cover-dark");h&&(a=h.id)}e.dataset.theme=a,e.dataset.mode=ae.find(h=>h.id===a)?.mode||t.themeMode||"dark",t.theme=a;const r=Hi(t,a),o=Hi(t,a,!0),l=t.accentFromCover!==!1;(t.accentFromCover===!1||Ui!==null&&a!==Zn)&&(zs=null,Ws=null);const p=r??(l?zs:null),m=o??Ws??p;return Tn({"--glass-blur":t.glassBlurCustom?`${t.glassBlur}px`:null,"--dur":Ta(t),"--lyric-size":oi(t.lyricsFontSize),"--seed":p,"--seed-2":m}),Ui=p&&a===Zn?Zn:null,yd(),gd(),t.glassAlphaCustom&&li(t.glassAlpha),a}function Hi(t,e,n=!1){return!t||t.accentFromCover!==!0||e!=="cover-dark"?null:Ht(n?t.coverSeed2:t.coverSeed)||null}function Pa(t=i.config.theme){const e=Yt();if(!e.length)return null;const n=e.findIndex(s=>s.id===t);return e[(n+1)%e.length]}async function vd(){const t=Pa();t&&(i.config.theme=t.id,i.config.themeMode=t.mode,await Re(i.config),k(),u(`已切换到主题「${t.name}」`,{duration:1500}))}let St=null;function es(t){return St||(St=document.createElement("div"),St.style.cssText="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;",document.body.appendChild(St)),St.style.backgroundColor=t,getComputedStyle(St).backgroundColor}function Ks(t,e){const n=Math.max(0,Math.min(1,e)),s=String(t),a=s.match(/rgba?\(([^)]+)\)/);if(a){const o=a[1].split(/[,/]/).map(m=>parseFloat(m.trim())),[l,d,p]=o;if([l,d,p].every(m=>Number.isFinite(m)))return`rgba(${Math.round(l)}, ${Math.round(d)}, ${Math.round(p)}, ${n})`}const r=s.match(/color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);if(r){const[o,l,d]=r.slice(1,4).map(p=>Math.round(parseFloat(p)*255));if([o,l,d].every(p=>Number.isFinite(p)))return`rgba(${o}, ${l}, ${d}, ${n})`}return null}function Oa(){const t=String(es("var(--glass-bg)")),e=t.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/),n=t.match(/\/\s*([\d.]+)\s*\)/),s=parseFloat(e&&e[1]||n&&n[1]||"");return Number.isFinite(s)?Math.round(s*100):62}let on=null;function gd(){on=null}function _d(){return on||(Tn({"--glass-bg":null,"--glass-bg-strong":null,"--glass-bg-weak":null}),on={bg:es("var(--glass-bg)"),strong:es("var(--glass-bg-strong)"),weak:es("var(--glass-bg-weak)")},on)}function li(t){const e=Math.max(0,Math.min(1,(Number(t)||0)/100)),n=_d();Tn({"--glass-bg":Ks(n.bg,e),"--glass-bg-strong":Ks(n.strong,Math.min(1,e+.18)),"--glass-bg-weak":Ks(n.weak,Math.max(0,e-.22))})}function yd(){const t=document.body;t&&(t.dataset.styleEpoch=String((Number(t.dataset.styleEpoch)||0)+1))}function wd(){const t=getComputedStyle(document.documentElement).getPropertyValue("--glass-blur"),e=parseFloat(t);return Number.isFinite(e)?e:22}function Ht(t){const e=String(t??"").trim();if(!e)return"";const n=e.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);if(n){let a=n[1].toLowerCase();return a.length===3&&(a=a[0]+a[0]+a[1]+a[1]+a[2]+a[2]),`#${a}`}const s=e.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);if(s){const a=r=>Math.max(0,Math.min(255,Math.round(Number(r)))).toString(16).padStart(2,"0");return`#${a(s[1])}${a(s[2])}${a(s[3])}`}return""}let zi="";function $d(t){const e=document.documentElement.dataset.theme||"",n=typeof t=="string"?t.trim():"",s=e===Zn?n:"";s!==zi&&(zi=s,Tn({"--cover-bg":s?`url("${s.replace(/["\\]/g,"\\$&")}")`:null}))}function kd(t,e){const n=Ht(t),s=Ht(e)||n;return n?(Tn({"--seed":n,"--seed-2":s}),i.config.coverSeed!==n||i.config.coverSeed2!==s?(i.config.coverSeed=n,i.config.coverSeed2=s,xd(),!0):!1):!1}const Sd="music-player.cover-seed.v1";function xd(){try{localStorage.setItem(Sd,JSON.stringify({seed:i.config.coverSeed||"",seed2:i.config.coverSeed2||"",theme:i.config.theme||""}))}catch{}}function Wi(t){try{const e=document.createElement("canvas"),n=32;e.width=n,e.height=n;const s=e.getContext("2d",{willReadFrequently:!0});s.drawImage(t,0,0,n,n);const{data:a}=s.getImageData(0,0,n,n);let r=0,o=0,l=0,d=0,p=0,m=0,h=0,g=0;for(let v=0;v<a.length;v+=4){if(a[v+3]<8)continue;const C=a[v],q=a[v+1],F=a[v+2];p+=C,m+=q,h+=F,g+=1;const z=Math.max(C,q,F),be=Math.min(C,q,F);if(z<26)continue;const te=z===0?0:(z-be)/z;if(te<.12)continue;const ye=te*te*(.35+z/255);r+=C*ye,o+=q*ye,l+=F*ye,d+=ye}const S=d>0?[r/d,o/d,l/d]:g>0?[p/g,m/g,h/g]:null;return S?`rgb(${S.map(v=>Math.round(Math.max(0,Math.min(255,v)))).join(", ")})`:null}catch{return null}}function js(){i.query="",k()}function Ot(t,e=null){if(i.settingsOpen&&ms(),t==="settings"){eo();return}i.view=t,i.playlistId=t==="playlist"?e:null,i.playerOpen=!1,i.query="",i.playlistSelecting=!1,i.selectedIds=new Set,i.queueOpen=!1,k()}function eo(t=null){i.settingsOpen=!0,t&&(i.settingsSection=t),k()}function ms(){i.settingsOpen=!1,k()}function Cd(t=null){i.settingsOpen?ms():eo(t)}function to(){return i.settingsOpen===!0}function Td(){i.settingsOpen&&(i.settingsRev=(i.settingsRev||0)+1,k(),fe())}async function Cn({manual:t=!1}={}){if(!i.scanning){i.scanText="正在扫描音乐文件夹…",k();try{const e=await Fr({silent:!t});e&&u(`扫描完成：保留 ${E(e.kept)} 首${e.excluded?`，过滤 ${E(e.excluded)} 个`:""}${e.added?`，新增 ${E(e.added)}`:""}${e.removed?`，移除 ${E(e.removed)}`:""}`,{tone:"success",duration:3600})}finally{i.scanning=!1,k()}}}const no="music-player.search.history.v1",Id=20;function Vs(){try{const t=localStorage.getItem(no),e=t?JSON.parse(t):[];return Array.isArray(e)?e.filter(n=>typeof n=="string"&&n.trim()):[]}catch{return[]}}function Gs(t){try{localStorage.setItem(no,JSON.stringify(t.slice(0,Id)))}catch{}}const L={keyword:"",seq:0,results:[],query:"",loading:!1,message:"",rev:0,sources:{}};function Te(){L.rev+=1,fe()}async function ci(){if($())try{const e=(await b.onlineSourceIndex())?.downloads;L.sources=e&&typeof e=="object"?e:{},Te()}catch(t){console.warn("[search] 读取在线来源索引失败（不影响搜索与试听）",t)}}function Ed(t){const e=t?.bvid||String(t?.id||"").replace(/^bili:/,"");if(!e)return null;const n=L.sources[e];return Ad(n)?n:null}function Ad(t){return!!(t&&t.exists===!0)}class Dd extends me{static deps=e=>[e.searchOpen,L.rev];get panelEl(){return this.querySelector("#search-overlay")}updated(){const e=this.panelEl;if(e){if(i.searchOpen){this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden&&(e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{i.searchOpen&&(e.dataset.state="opened")}),requestAnimationFrame(()=>{const n=this.querySelector("#search-input");n?.focus(),n?.select()}));return}e.hidden||(e.dataset.state="closed",this._closeTimer||(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!i.searchOpen&&e&&(e.hidden=!0)},260)))}}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),super.disconnectedCallback()}render(){const e=L,n=Vs(),s=!!e.keyword.trim(),a=this.headline();return c`
      <section
        class="search-overlay"
        id="search-overlay"
        data-state="closed"
        hidden
        aria-label="搜索"
        @click=${r=>this.onClick(r)}
        @keydown=${r=>this.onKey(r)}
      >
        <div class="search-overlay__panel" role="dialog" aria-modal="true" aria-label="在线搜索">
          <div class="search-overlay__head">
            <span class="search-overlay__title">在线搜索</span>
            <span class="u-spacer"></span>
            <button
              class="search-overlay__close u-hit"
              type="button"
              data-search-close
              data-tip="关闭（结果会保留）"
              aria-label="关闭搜索"
              @click=${()=>ts()}
            >
              ${f("close")}
            </button>
          </div>

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
                @input=${r=>{L.keyword=r.target.value,Te()}}
                @keydown=${r=>{r.key==="Enter"&&(r.preventDefault(),this.submitSearch()),r.key==="Escape"&&(r.preventDefault(),L.keyword.trim()?this.clearSearch({focus:!0}):ts())}}
              />
              <button
                class="search-overlay__clear u-hit"
                id="search-clear"
                type="button"
                data-tip="清空搜索"
                aria-label="清空搜索"
                ?hidden=${!s}
                @click=${()=>this.clearSearch({focus:!0})}
              >
                ${f("close")}
              </button>
            </div>
          </div>

          <div class="search-overlay__history" id="search-history" ?hidden=${s||!n.length}>
            ${!s&&n.length?c`
                    <div class="search-overlay__history-title">
                      <span>搜索历史</span>
                      <button
                        type="button"
                        class="search-overlay__history-clear"
                        data-history-act="clear"
                        @click=${()=>this.clearHistory()}
                      >
                        清空
                      </button>
                    </div>
                    <div class="search-overlay__history-list">
                      ${n.map(r=>c`
                          <span class="search-overlay__history-chip" data-history-keyword=${r}>
                            <button
                              type="button"
                              class="search-overlay__history-key"
                              data-history-act="use"
                              @click=${()=>this.useHistory(r)}
                            >
                              ${r}
                            </button>
                            <button
                              type="button"
                              class="search-overlay__history-del"
                              data-history-act="del"
                              aria-label="删除「${r}」"
                              @click=${()=>this.removeHistory(r)}
                            >
                              ${f("close")}
                            </button>
                          </span>
                        `)}
                    </div>
                  `:x}
          </div>

          <div class="search-overlay__status" ?hidden=${!a}>
            <span class="search-overlay__headline" id="search-headline">${a}</span>
          </div>
          <div class="search-overlay__body" id="search-body">${this.bodyContent()}</div>
        </div>
      </section>
    `}headline(){const e=L;return e.loading?"搜索中…":e.query?`在线「${e.query}」${E(e.results.length)} 个结果`:""}bodyContent(){const e=L;return e.loading?c`<div class="search-overlay__loading">
        <span class="search-overlay__spinner"></span>正在搜索「${e.keyword.trim()}」…
      </div>`:e.message?this.empty(e.message):e.results.length?Se(e.results,n=>n.id,n=>{const s=Ed(n);return c`
          <div
            class="search-row"
            data-search-id=${n.id}
            data-search-online="1"
            data-downloaded=${s?"1":"0"}
            role="button"
            tabindex="0"
            @click=${()=>Ys(n.id)}
          >
            <span class="search-row__cover">
              ${n.coverUrl?c`<img src=${n.coverUrl} alt="" loading="lazy" />`:c`<span class="search-row__cover-fallback">${f("music")}</span>`}
            </span>
            <span class="search-row__main">
              <span class="search-row__title">${n.title||"未命名"}</span>
              <span class="search-row__sub">${n.artist||"未知"} · ${Mt(n.duration)}</span>
            </span>
            ${s?c`<span class="search-row__badge" data-tip=${s.dir?`已下载到 ${s.dir}`:"已下载"}
                    >已下载</span
                  >`:x}
            <span class="search-row__actions">
              <button
                class="btn btn--sm btn--primary"
                type="button"
                data-search-act="preview"
                data-id=${n.id}
                @click=${a=>{a.stopPropagation(),Ys(n.id)}}
              >
                ${f("play")}<span>试听</span>
              </button>
              <button
                class="btn btn--sm"
                type="button"
                data-search-act="download"
                data-id=${n.id}
                @click=${a=>{a.stopPropagation(),Nd(n)}}
              >
                ${f("file")}<span>${s?"再下载":"下载"}</span>
              </button>
            </span>
          </div>
        `}):this.empty(e.query?"没有搜到在线歌曲，换个关键词试试":"输入关键词后按回车搜索在线歌曲")}empty(e){return c`<div class="search-overlay__empty">${f("search")}<span>${e}</span></div>`}onClick(e){(e.target.closest("[data-search-close]")||e.target===this.panelEl)&&ts()}onKey(e){if(e.key!=="Enter"&&e.key!==" ")return;const n=e.target.closest?.("[data-search-id]");n&&(e.preventDefault(),Ys(n.dataset.searchId))}addHistory(e){const n=(e||"").trim();if(!n)return;const s=Vs().filter(a=>a!==n);s.unshift(n),Gs(s),Te()}removeHistory(e){Gs(Vs().filter(n=>n!==e)),Te()}clearHistory(){Gs([]),Te()}useHistory(e){L.keyword=e,Te(),this.submitSearch()}submitSearch(){const e=(L.keyword||"").trim();if(!e){this.clearSearch({focus:!0});return}this.addHistory(e),this.runOnlineSearch(e)}clearSearch({focus:e=!1}={}){L.keyword="",L.results=[],L.query="",L.message="",L.loading=!1,L.seq+=1,Te(),e&&requestAnimationFrame(()=>this.querySelector("#search-input")?.focus())}async runOnlineSearch(e){L.query="",L.results=[],L.message="",L.loading=!0,Te();const n=++L.seq;if(!$()){L.loading=!1,L.message="浏览器预览下没有在线搜索后端，请在应用里试",Te();return}try{const s=await b.onlineSearch(e,1,24);if(n!==L.seq)return;L.results=Array.isArray(s)?s:[],L.query=e,L.loading=!1,Te(),ci()}catch(s){if(n!==L.seq)return;L.results=[],L.query=e,L.loading=!1,L.message=`在线搜索失败：${s?.message??s}`,Te()}}}ee("mp-search-overlay",Dd);function Md(t){!i.searchOpen?so():ts()}function so(){i.searchOpen=!0,k(),ci()}function ts(){i.searchOpen=!1,k()}function Pd(){document.addEventListener("keydown",t=>{!(t.ctrlKey||t.metaKey)||t.key.toLowerCase()!=="f"||(t.preventDefault(),so())}),U("download:done",()=>{ci()})}function Ys(t){const e=L.results.find(r=>r.id===t);if(!e)return;const n=Al({id:e.id,title:e.title||"未命名",artist:e.artist||"未知",album:e.album||"在线",ext:e.ext||"m4a",duration:e.duration||0,size:0,sampleRate:0,bitrate:0,addedAt:Date.now(),playCount:0,path:"",cover:"",coverUrl:e.coverUrl||"",streamUrl:e.streamUrl||"",downloadUrl:e.downloadUrl||"",bvid:e.bvid||"",online:!0}),s=i.queue.includes(n.id)?i.queue.slice():[...i.queue,n.id],a=s.indexOf(n.id);wt(s,a,{type:"online",id:null}),u(`已加入播放列表并开始试听：${n.title}`,{tone:"success",duration:2200})}const ao="music-player.download.notice.v1";function Od(){try{return localStorage.getItem(ao)==="1"}catch{return!1}}function Ld(){try{localStorage.setItem(ao,"1")}catch{}}function Rd(t){return new Promise(e=>{K({title:"下载前请确认",desc:`即将把《${t.title||"未命名"}》的音频保存到你的下载目录。`,body:c`
        <div class="about-note">
          <div class="about-note__body">· 下载内容来自第三方平台，版权归原作者与权利人所有。</div>
          <div class="about-note__body">· 仅限个人学习、欣赏使用，请勿传播、二次分发或用于商业用途。</div>
          <div class="about-note__body">· 各平台对其内容的使用另有服务条款，请一并遵守。</div>
        </div>
        <label class="setting__hint"><input type="checkbox" data-field="dontAsk" /> 不再提示</label>
      `,okText:"我已知晓，开始下载",onOk:n=>(n.dontAsk&&Ld(),e(!0),!0),onCancel:()=>{e(!1)}})})}async function Nd(t){if(!$()){u("浏览器预览无法下载",{tone:"warning"});return}if(!(!Od()&&!await Rd(t)))try{const e=await b.downloadStart(t.bvid||String(t.id).replace(/^bili:/,""),t.title||"",t.duration||0);if(!e?.started){u(e?.reason==="already-running"?"这首歌正在下载中":"无法开始下载",{tone:"warning"});return}u(`开始下载到 ${e.dir}`,{duration:2600})}catch(e){u(`下载失败：${e?.message??e}`,{tone:"error",duration:6e3})}}let Ue=[],bs=!1,io=0,Xs=0;function Lt(){io+=1,fe()}function fn(){const t=Ue.filter(e=>e?.state==="running").length;return{tasks:Ue,running:t,revision:io,open:bs,visible:Ue.length>0,badge:t>0?String(t):""}}function ro(t){bs=typeof t=="boolean"?t:!bs,Lt()}function qd(){ro(!1)}async function Bd(){if(!$()){Ue=Ue.filter(t=>t?.state==="running"),Lt();return}try{const t=await b.downloadClearFinished();La(t)}catch(t){u(`清除失败：${t?.message??t}`,{tone:"error"})}}function Fd(){const t=Ue.find(e=>e?.dir)?.dir||"";b.downloadOpenDir(t).catch(e=>u(`打开目录失败：${e?.message??e}`,{tone:"error"}))}function Ud(t){const e=Ue.find(s=>s.id===t),n=e?.path||e?.dir;n&&b.downloadOpenDir(n).catch(s=>u(`打开失败：${s?.message??s}`,{tone:"error"}))}function La(t){!t||!Array.isArray(t.tasks)||(Ue=t.tasks,Lt())}async function Hd(){if(U("download:tasks",e=>{Xs+=1,La(e)}),!$()){if(zd()){Lt(),bs=!0,Lt();return}Lt();return}const t=Xs;try{const e=await b.downloadTasks();Xs===t&&La(e)}catch(e){console.info("[downloads] 拉取下载任务失败",e?.message??e)}}function zd(){return $()||new URLSearchParams(location.search).get("downloads")!=="1"?!1:(Ue=[{id:"preview-1",bvid:"BV1xx411c7mD",title:"晴天 - 周杰伦",state:"running",done:231e4,total:47e5,dir:"C:\\Users\\Me\\Music\\downloads"},{id:"preview-2",bvid:"BV1yy411c7mE",title:"孤勇者 - 陈奕迅",state:"done",done:39e5,total:39e5,path:"C:\\Users\\Me\\Music\\downloads\\孤勇者 - 陈奕迅.m4a",dir:"C:\\Users\\Me\\Music\\downloads"},{id:"preview-3",bvid:"BV1zz411c7mF",title:"一首标题很长很长、长到面板里必须被省略号截断的测试歌曲",state:"failed",done:12e4,total:5e6,message:"下载到的内容为空",dir:"C:\\Users\\Me\\Music\\downloads"}],!0)}class Wd extends me{static deps=()=>{const n=Ma(i.config.theme)?.mode!=="light",s=fn();return[n,i.config.themeMode,i.config.theme,Pa(i.config.theme)?.id,i.searchOpen,s.visible,s.badge]};render(){const n=Ma(i.config.theme)?.mode!=="light",s=fn(),a=Pa(i.config.theme);return c`
      <header class="titlebar" id="titlebar">
        <div class="titlebar__brand">
          <svg class="titlebar__logo"><use href="#i-music"></use></svg>
          <span>LMPlayer</span>
        </div>
        <div class="titlebar__drag"></div>
        <div class="titlebar__actions">
          <button
            class="titlebar__btn"
            id="btn-search"
            type="button"
            data-tip="搜索（Ctrl+F）"
            aria-label="搜索"
            aria-pressed=${String(i.searchOpen)}
            @click=${()=>Md()}
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
            @click=${()=>ro()}
          >
            ${f("download")}
            <span class="titlebar__badge" id="download-badge" ?hidden=${!s.badge}>${s.badge}</span>
          </button>
          <button
            class="titlebar__btn"
            id="btn-theme-toggle"
            type="button"
            data-tip=${a?`下一个主题：${a.name}`:"切换主题"}
            aria-label="切换主题（按设置里的列表循环）"
            @click=${()=>vd()}
          >
            ${f(n?"sun":"moon")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-settings"
            type="button"
            data-tip="设置"
            aria-label="设置"
            @click=${()=>Cd()}
          >
            ${f("settings")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-win-min"
            type="button"
            aria-label="最小化"
            @click=${()=>Qs("min")}
          >
            ${f("minimize")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-win-max"
            type="button"
            aria-label="最大化"
            @click=${()=>Qs("max")}
          >
            ${f("maximize")}
          </button>
          <button
            class="titlebar__btn titlebar__btn--close"
            id="btn-win-close"
            type="button"
            aria-label="关闭"
            @click=${()=>Qs("close")}
          >
            ${f("close")}
          </button>
        </div>
      </header>
    `}}function Qs(t){if(!$()){t==="close"&&window.close();return}t==="min"?b.windowMinimize():t==="max"?b.windowToggleMaximize():b.windowClose()}ee("mp-titlebar",Wd);function Kd(t,e,n){return(e=Yd(e))in t?Object.defineProperty(t,e,{value:n,enumerable:!0,configurable:!0,writable:!0}):t[e]=n,t}function je(){return je=Object.assign?Object.assign.bind():function(t){for(var e=1;e<arguments.length;e++){var n=arguments[e];for(var s in n)({}).hasOwnProperty.call(n,s)&&(t[s]=n[s])}return t},je.apply(null,arguments)}function Ki(t,e){var n=Object.keys(t);if(Object.getOwnPropertySymbols){var s=Object.getOwnPropertySymbols(t);e&&(s=s.filter(function(a){return Object.getOwnPropertyDescriptor(t,a).enumerable})),n.push.apply(n,s)}return n}function Ne(t){for(var e=1;e<arguments.length;e++){var n=arguments[e]!=null?arguments[e]:{};e%2?Ki(Object(n),!0).forEach(function(s){Kd(t,s,n[s])}):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(n)):Ki(Object(n)).forEach(function(s){Object.defineProperty(t,s,Object.getOwnPropertyDescriptor(n,s))})}return t}function jd(t,e){if(t==null)return{};var n,s,a=Vd(t,e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(t);for(s=0;s<r.length;s++)n=r[s],e.indexOf(n)===-1&&{}.propertyIsEnumerable.call(t,n)&&(a[n]=t[n])}return a}function Vd(t,e){if(t==null)return{};var n={};for(var s in t)if({}.hasOwnProperty.call(t,s)){if(e.indexOf(s)!==-1)continue;n[s]=t[s]}return n}function Gd(t,e){if(typeof t!="object"||!t)return t;var n=t[Symbol.toPrimitive];if(n!==void 0){var s=n.call(t,e);if(typeof s!="object")return s;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(t)}function Yd(t){var e=Gd(t,"string");return typeof e=="symbol"?e:e+""}function Ra(t){"@babel/helpers - typeof";return Ra=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(e){return typeof e}:function(e){return e&&typeof Symbol=="function"&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},Ra(t)}var Xd="1.15.7";function He(t){if(typeof window<"u"&&window.navigator)return!!navigator.userAgent.match(t)}var Ge=He(/(?:Trident.*rv[ :]?11\.|msie|iemobile|Windows Phone)/i),Dn=He(/Edge/i),ji=He(/firefox/i),hn=He(/safari/i)&&!He(/chrome/i)&&!He(/android/i),di=He(/iP(ad|od|hone)/i),oo=He(/chrome/i)&&He(/android/i),lo={capture:!1,passive:!1};function R(t,e,n){t.addEventListener(e,n,!Ge&&lo)}function O(t,e,n){t.removeEventListener(e,n,!Ge&&lo)}function vs(t,e){if(e){if(e[0]===">"&&(e=e.substring(1)),t)try{if(t.matches)return t.matches(e);if(t.msMatchesSelector)return t.msMatchesSelector(e);if(t.webkitMatchesSelector)return t.webkitMatchesSelector(e)}catch{return!1}return!1}}function co(t){return t.host&&t!==document&&t.host.nodeType&&t.host!==t?t.host:t.parentNode}function Ie(t,e,n,s){if(t){n=n||document;do{if(e!=null&&(e[0]===">"?t.parentNode===n&&vs(t,e):vs(t,e))||s&&t===n)return t;if(t===n)break}while(t=co(t))}return null}var Vi=/\s+/g;function ge(t,e,n){if(t&&e)if(t.classList)t.classList[n?"add":"remove"](e);else{var s=(" "+t.className+" ").replace(Vi," ").replace(" "+e+" "," ");t.className=(s+(n?" "+e:"")).replace(Vi," ")}}function I(t,e,n){var s=t&&t.style;if(s){if(n===void 0)return document.defaultView&&document.defaultView.getComputedStyle?n=document.defaultView.getComputedStyle(t,""):t.currentStyle&&(n=t.currentStyle),e===void 0?n:n[e];!(e in s)&&e.indexOf("webkit")===-1&&(e="-webkit-"+e),s[e]=n+(typeof n=="string"?"":"px")}}function Rt(t,e){var n="";if(typeof t=="string")n=t;else do{var s=I(t,"transform");s&&s!=="none"&&(n=s+" "+n)}while(!e&&(t=t.parentNode));var a=window.DOMMatrix||window.WebKitCSSMatrix||window.CSSMatrix||window.MSCSSMatrix;return a&&new a(n)}function uo(t,e,n){if(t){var s=t.getElementsByTagName(e),a=0,r=s.length;if(n)for(;a<r;a++)n(s[a],a);return s}return[]}function Le(){var t=document.scrollingElement;return t||document.documentElement}function X(t,e,n,s,a){if(!(!t.getBoundingClientRect&&t!==window)){var r,o,l,d,p,m,h;if(t!==window&&t.parentNode&&t!==Le()?(r=t.getBoundingClientRect(),o=r.top,l=r.left,d=r.bottom,p=r.right,m=r.height,h=r.width):(o=0,l=0,d=window.innerHeight,p=window.innerWidth,m=window.innerHeight,h=window.innerWidth),(e||n)&&t!==window&&(a=a||t.parentNode,!Ge))do if(a&&a.getBoundingClientRect&&(I(a,"transform")!=="none"||n&&I(a,"position")!=="static")){var g=a.getBoundingClientRect();o-=g.top+parseInt(I(a,"border-top-width")),l-=g.left+parseInt(I(a,"border-left-width")),d=o+r.height,p=l+r.width;break}while(a=a.parentNode);if(s&&t!==window){var S=Rt(a||t),v=S&&S.a,C=S&&S.d;S&&(o/=C,l/=v,h/=v,m/=C,d=o+m,p=l+h)}return{top:o,left:l,bottom:d,right:p,width:h,height:m}}}function Gi(t,e,n){for(var s=tt(t,!0),a=X(t)[e];s;){var r=X(s)[n],o=void 0;if(o=a>=r,!o)return s;if(s===Le())break;s=tt(s,!1)}return!1}function zt(t,e,n,s){for(var a=0,r=0,o=t.children;r<o.length;){if(o[r].style.display!=="none"&&o[r]!==T.ghost&&(s||o[r]!==T.dragged)&&Ie(o[r],n.draggable,t,!1)){if(a===e)return o[r];a++}r++}return null}function ui(t,e){for(var n=t.lastElementChild;n&&(n===T.ghost||I(n,"display")==="none"||e&&!vs(n,e));)n=n.previousElementSibling;return n||null}function we(t,e){var n=0;if(!t||!t.parentNode)return-1;for(;t=t.previousElementSibling;)t.nodeName.toUpperCase()!=="TEMPLATE"&&t!==T.clone&&(!e||vs(t,e))&&n++;return n}function Yi(t){var e=0,n=0,s=Le();if(t)do{var a=Rt(t),r=a.a,o=a.d;e+=t.scrollLeft*r,n+=t.scrollTop*o}while(t!==s&&(t=t.parentNode));return[e,n]}function Qd(t,e){for(var n in t)if(t.hasOwnProperty(n)){for(var s in e)if(e.hasOwnProperty(s)&&e[s]===t[n][s])return Number(n)}return-1}function tt(t,e){if(!t||!t.getBoundingClientRect)return Le();var n=t,s=!1;do if(n.clientWidth<n.scrollWidth||n.clientHeight<n.scrollHeight){var a=I(n);if(n.clientWidth<n.scrollWidth&&(a.overflowX=="auto"||a.overflowX=="scroll")||n.clientHeight<n.scrollHeight&&(a.overflowY=="auto"||a.overflowY=="scroll")){if(!n.getBoundingClientRect||n===document.body)return Le();if(s||e)return n;s=!0}}while(n=n.parentNode);return Le()}function Jd(t,e){if(t&&e)for(var n in e)e.hasOwnProperty(n)&&(t[n]=e[n]);return t}function Js(t,e){return Math.round(t.top)===Math.round(e.top)&&Math.round(t.left)===Math.round(e.left)&&Math.round(t.height)===Math.round(e.height)&&Math.round(t.width)===Math.round(e.width)}var mn;function po(t,e){return function(){if(!mn){var n=arguments,s=this;n.length===1?t.call(s,n[0]):t.apply(s,n),mn=setTimeout(function(){mn=void 0},e)}}}function Zd(){clearTimeout(mn),mn=void 0}function fo(t,e,n){t.scrollLeft+=e,t.scrollTop+=n}function ho(t){var e=window.Polymer,n=window.jQuery||window.Zepto;return e&&e.dom?e.dom(t).cloneNode(!0):n?n(t).clone(!0)[0]:t.cloneNode(!0)}function mo(t,e,n){var s={};return Array.from(t.children).forEach(function(a){var r,o,l,d;if(!(!Ie(a,e.draggable,t,!1)||a.animated||a===n)){var p=X(a);s.left=Math.min((r=s.left)!==null&&r!==void 0?r:1/0,p.left),s.top=Math.min((o=s.top)!==null&&o!==void 0?o:1/0,p.top),s.right=Math.max((l=s.right)!==null&&l!==void 0?l:-1/0,p.right),s.bottom=Math.max((d=s.bottom)!==null&&d!==void 0?d:-1/0,p.bottom)}}),s.width=s.right-s.left,s.height=s.bottom-s.top,s.x=s.left,s.y=s.top,s}var ue="Sortable"+new Date().getTime();function eu(){var t=[],e;return{captureAnimationState:function(){if(t=[],!!this.options.animation){var s=[].slice.call(this.el.children);s.forEach(function(a){if(!(I(a,"display")==="none"||a===T.ghost)){t.push({target:a,rect:X(a)});var r=Ne({},t[t.length-1].rect);if(a.thisAnimationDuration){var o=Rt(a,!0);o&&(r.top-=o.f,r.left-=o.e)}a.fromRect=r}})}},addAnimationState:function(s){t.push(s)},removeAnimationState:function(s){t.splice(Qd(t,{target:s}),1)},animateAll:function(s){var a=this;if(!this.options.animation){clearTimeout(e),typeof s=="function"&&s();return}var r=!1,o=0;t.forEach(function(l){var d=0,p=l.target,m=p.fromRect,h=X(p),g=p.prevFromRect,S=p.prevToRect,v=l.rect,C=Rt(p,!0);C&&(h.top-=C.f,h.left-=C.e),p.toRect=h,p.thisAnimationDuration&&Js(g,h)&&!Js(m,h)&&(v.top-h.top)/(v.left-h.left)===(m.top-h.top)/(m.left-h.left)&&(d=nu(v,g,S,a.options)),Js(h,m)||(p.prevFromRect=m,p.prevToRect=h,d||(d=a.options.animation),a.animate(p,v,h,d)),d&&(r=!0,o=Math.max(o,d),clearTimeout(p.animationResetTimer),p.animationResetTimer=setTimeout(function(){p.animationTime=0,p.prevFromRect=null,p.fromRect=null,p.prevToRect=null,p.thisAnimationDuration=null},d),p.thisAnimationDuration=d)}),clearTimeout(e),r?e=setTimeout(function(){typeof s=="function"&&s()},o):typeof s=="function"&&s(),t=[]},animate:function(s,a,r,o){if(o){I(s,"transition",""),I(s,"transform","");var l=Rt(this.el),d=l&&l.a,p=l&&l.d,m=(a.left-r.left)/(d||1),h=(a.top-r.top)/(p||1);s.animatingX=!!m,s.animatingY=!!h,I(s,"transform","translate3d("+m+"px,"+h+"px,0)"),this.forRepaintDummy=tu(s),I(s,"transition","transform "+o+"ms"+(this.options.easing?" "+this.options.easing:"")),I(s,"transform","translate3d(0,0,0)"),typeof s.animated=="number"&&clearTimeout(s.animated),s.animated=setTimeout(function(){I(s,"transition",""),I(s,"transform",""),s.animated=!1,s.animatingX=!1,s.animatingY=!1},o)}}}}function tu(t){return t.offsetWidth}function nu(t,e,n,s){return Math.sqrt(Math.pow(e.top-t.top,2)+Math.pow(e.left-t.left,2))/Math.sqrt(Math.pow(e.top-n.top,2)+Math.pow(e.left-n.left,2))*s.animation}var xt=[],Zs={initializeByDefault:!0},Mn={mount:function(e){for(var n in Zs)Zs.hasOwnProperty(n)&&!(n in e)&&(e[n]=Zs[n]);xt.forEach(function(s){if(s.pluginName===e.pluginName)throw"Sortable: Cannot mount plugin ".concat(e.pluginName," more than once")}),xt.push(e)},pluginEvent:function(e,n,s){var a=this;this.eventCanceled=!1,s.cancel=function(){a.eventCanceled=!0};var r=e+"Global";xt.forEach(function(o){n[o.pluginName]&&(n[o.pluginName][r]&&n[o.pluginName][r](Ne({sortable:n},s)),n.options[o.pluginName]&&n[o.pluginName][e]&&n[o.pluginName][e](Ne({sortable:n},s)))})},initializePlugins:function(e,n,s,a){xt.forEach(function(l){var d=l.pluginName;if(!(!e.options[d]&&!l.initializeByDefault)){var p=new l(e,n,e.options);p.sortable=e,p.options=e.options,e[d]=p,je(s,p.defaults)}});for(var r in e.options)if(e.options.hasOwnProperty(r)){var o=this.modifyOption(e,r,e.options[r]);typeof o<"u"&&(e.options[r]=o)}},getEventProperties:function(e,n){var s={};return xt.forEach(function(a){typeof a.eventProperties=="function"&&je(s,a.eventProperties.call(n[a.pluginName],e))}),s},modifyOption:function(e,n,s){var a;return xt.forEach(function(r){e[r.pluginName]&&r.optionListeners&&typeof r.optionListeners[n]=="function"&&(a=r.optionListeners[n].call(e[r.pluginName],s))}),a}};function su(t){var e=t.sortable,n=t.rootEl,s=t.name,a=t.targetEl,r=t.cloneEl,o=t.toEl,l=t.fromEl,d=t.oldIndex,p=t.newIndex,m=t.oldDraggableIndex,h=t.newDraggableIndex,g=t.originalEvent,S=t.putSortable,v=t.extraEventProperties;if(e=e||n&&n[ue],!!e){var C,q=e.options,F="on"+s.charAt(0).toUpperCase()+s.substr(1);window.CustomEvent&&!Ge&&!Dn?C=new CustomEvent(s,{bubbles:!0,cancelable:!0}):(C=document.createEvent("Event"),C.initEvent(s,!0,!0)),C.to=o||n,C.from=l||n,C.item=a||n,C.clone=r,C.oldIndex=d,C.newIndex=p,C.oldDraggableIndex=m,C.newDraggableIndex=h,C.originalEvent=g,C.pullMode=S?S.lastPutMode:void 0;var z=Ne(Ne({},v),Mn.getEventProperties(s,e));for(var be in z)C[be]=z[be];n&&n.dispatchEvent(C),q[F]&&q[F].call(e,C)}}var au=["evt"],de=function(e,n){var s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:{},a=s.evt,r=jd(s,au);Mn.pluginEvent.bind(T)(e,n,Ne({dragEl:y,parentEl:j,ghostEl:A,rootEl:H,nextEl:mt,lastDownEl:ns,cloneEl:W,cloneHidden:Ze,dragStarted:ln,putSortable:se,activeSortable:T.active,originalEvent:a,oldIndex:At,oldDraggableIndex:bn,newIndex:_e,newDraggableIndex:Qe,hideGhostForTarget:_o,unhideGhostForTarget:yo,cloneNowHidden:function(){Ze=!0},cloneNowShown:function(){Ze=!1},dispatchSortableEvent:function(l){le({sortable:n,name:l,originalEvent:a})}},r))};function le(t){su(Ne({putSortable:se,cloneEl:W,targetEl:y,rootEl:H,oldIndex:At,oldDraggableIndex:bn,newIndex:_e,newDraggableIndex:Qe},t))}var y,j,A,H,mt,ns,W,Ze,At,_e,bn,Qe,qn,se,Et=!1,gs=!1,_s=[],ut,xe,ea,ta,Xi,Qi,ln,Ct,vn,gn=!1,Bn=!1,ss,re,na=[],Na=!1,ys=[],As=typeof document<"u",Fn=di,Ji=Dn||Ge?"cssFloat":"float",iu=As&&!oo&&!di&&"draggable"in document.createElement("div"),bo=(function(){if(As){if(Ge)return!1;var t=document.createElement("x");return t.style.cssText="pointer-events:auto",t.style.pointerEvents==="auto"}})(),vo=function(e,n){var s=I(e),a=parseInt(s.width)-parseInt(s.paddingLeft)-parseInt(s.paddingRight)-parseInt(s.borderLeftWidth)-parseInt(s.borderRightWidth),r=zt(e,0,n),o=zt(e,1,n),l=r&&I(r),d=o&&I(o),p=l&&parseInt(l.marginLeft)+parseInt(l.marginRight)+X(r).width,m=d&&parseInt(d.marginLeft)+parseInt(d.marginRight)+X(o).width;if(s.display==="flex")return s.flexDirection==="column"||s.flexDirection==="column-reverse"?"vertical":"horizontal";if(s.display==="grid")return s.gridTemplateColumns.split(" ").length<=1?"vertical":"horizontal";if(r&&l.float&&l.float!=="none"){var h=l.float==="left"?"left":"right";return o&&(d.clear==="both"||d.clear===h)?"vertical":"horizontal"}return r&&(l.display==="block"||l.display==="flex"||l.display==="table"||l.display==="grid"||p>=a&&s[Ji]==="none"||o&&s[Ji]==="none"&&p+m>a)?"vertical":"horizontal"},ru=function(e,n,s){var a=s?e.left:e.top,r=s?e.right:e.bottom,o=s?e.width:e.height,l=s?n.left:n.top,d=s?n.right:n.bottom,p=s?n.width:n.height;return a===l||r===d||a+o/2===l+p/2},ou=function(e,n){var s;return _s.some(function(a){var r=a[ue].options.emptyInsertThreshold;if(!(!r||ui(a))){var o=X(a),l=e>=o.left-r&&e<=o.right+r,d=n>=o.top-r&&n<=o.bottom+r;if(l&&d)return s=a}}),s},go=function(e){function n(r,o){return function(l,d,p,m){var h=l.options.group.name&&d.options.group.name&&l.options.group.name===d.options.group.name;if(r==null&&(o||h))return!0;if(r==null||r===!1)return!1;if(o&&r==="clone")return r;if(typeof r=="function")return n(r(l,d,p,m),o)(l,d,p,m);var g=(o?l:d).options.group.name;return r===!0||typeof r=="string"&&r===g||r.join&&r.indexOf(g)>-1}}var s={},a=e.group;(!a||Ra(a)!="object")&&(a={name:a}),s.name=a.name,s.checkPull=n(a.pull,!0),s.checkPut=n(a.put),s.revertClone=a.revertClone,e.group=s},_o=function(){!bo&&A&&I(A,"display","none")},yo=function(){!bo&&A&&I(A,"display","")};As&&!oo&&document.addEventListener("click",function(t){if(gs)return t.preventDefault(),t.stopPropagation&&t.stopPropagation(),t.stopImmediatePropagation&&t.stopImmediatePropagation(),gs=!1,!1},!0);var pt=function(e){if(y){e=e.touches?e.touches[0]:e;var n=ou(e.clientX,e.clientY);if(n){var s={};for(var a in e)e.hasOwnProperty(a)&&(s[a]=e[a]);s.target=s.rootEl=n,s.preventDefault=void 0,s.stopPropagation=void 0,n[ue]._onDragOver(s)}}},lu=function(e){y&&y.parentNode[ue]._isOutsideThisEl(e.target)};function T(t,e){if(!(t&&t.nodeType&&t.nodeType===1))throw"Sortable: `el` must be an HTMLElement, not ".concat({}.toString.call(t));this.el=t,this.options=e=je({},e),t[ue]=this;var n={group:null,sort:!0,disabled:!1,store:null,handle:null,draggable:/^[uo]l$/i.test(t.nodeName)?">li":">*",swapThreshold:1,invertSwap:!1,invertedSwapThreshold:null,removeCloneOnHide:!0,direction:function(){return vo(t,this.options)},ghostClass:"sortable-ghost",chosenClass:"sortable-chosen",dragClass:"sortable-drag",ignore:"a, img",filter:null,preventOnFilter:!0,animation:0,easing:null,setData:function(o,l){o.setData("Text",l.textContent)},dropBubble:!1,dragoverBubble:!1,dataIdAttr:"data-id",delay:0,delayOnTouchOnly:!1,touchStartThreshold:(Number.parseInt?Number:window).parseInt(window.devicePixelRatio,10)||1,forceFallback:!1,fallbackClass:"sortable-fallback",fallbackOnBody:!1,fallbackTolerance:0,fallbackOffset:{x:0,y:0},supportPointer:T.supportPointer!==!1&&"PointerEvent"in window&&(!hn||di),emptyInsertThreshold:5};Mn.initializePlugins(this,t,n);for(var s in n)!(s in e)&&(e[s]=n[s]);go(e);for(var a in this)a.charAt(0)==="_"&&typeof this[a]=="function"&&(this[a]=this[a].bind(this));this.nativeDraggable=e.forceFallback?!1:iu,this.nativeDraggable&&(this.options.touchStartThreshold=1),e.supportPointer?R(t,"pointerdown",this._onTapStart):(R(t,"mousedown",this._onTapStart),R(t,"touchstart",this._onTapStart)),this.nativeDraggable&&(R(t,"dragover",this),R(t,"dragenter",this)),_s.push(this.el),e.store&&e.store.get&&this.sort(e.store.get(this)||[]),je(this,eu())}T.prototype={constructor:T,_isOutsideThisEl:function(e){!this.el.contains(e)&&e!==this.el&&(Ct=null)},_getDirection:function(e,n){return typeof this.options.direction=="function"?this.options.direction.call(this,e,n,y):this.options.direction},_onTapStart:function(e){if(e.cancelable){var n=this,s=this.el,a=this.options,r=a.preventOnFilter,o=e.type,l=e.touches&&e.touches[0]||e.pointerType&&e.pointerType==="touch"&&e,d=(l||e).target,p=e.target.shadowRoot&&(e.path&&e.path[0]||e.composedPath&&e.composedPath()[0])||d,m=a.filter;if(bu(s),!y&&!(/mousedown|pointerdown/.test(o)&&e.button!==0||a.disabled)&&!p.isContentEditable&&!(!this.nativeDraggable&&hn&&d&&d.tagName.toUpperCase()==="SELECT")&&(d=Ie(d,a.draggable,s,!1),!(d&&d.animated)&&ns!==d)){if(At=we(d),bn=we(d,a.draggable),typeof m=="function"){if(m.call(this,e,d,this)){le({sortable:n,rootEl:p,name:"filter",targetEl:d,toEl:s,fromEl:s}),de("filter",n,{evt:e}),r&&e.preventDefault();return}}else if(m&&(m=m.split(",").some(function(h){if(h=Ie(p,h.trim(),s,!1),h)return le({sortable:n,rootEl:h,name:"filter",targetEl:d,fromEl:s,toEl:s}),de("filter",n,{evt:e}),!0}),m)){r&&e.preventDefault();return}a.handle&&!Ie(p,a.handle,s,!1)||this._prepareDragStart(e,l,d)}}},_prepareDragStart:function(e,n,s){var a=this,r=a.el,o=a.options,l=r.ownerDocument,d;if(s&&!y&&s.parentNode===r){var p=X(s);if(H=r,y=s,j=y.parentNode,mt=y.nextSibling,ns=s,qn=o.group,T.dragged=y,ut={target:y,clientX:(n||e).clientX,clientY:(n||e).clientY},Xi=ut.clientX-p.left,Qi=ut.clientY-p.top,this._lastX=(n||e).clientX,this._lastY=(n||e).clientY,y.style["will-change"]="all",d=function(){if(de("delayEnded",a,{evt:e}),T.eventCanceled){a._onDrop();return}a._disableDelayedDragEvents(),!ji&&a.nativeDraggable&&(y.draggable=!0),a._triggerDragStart(e,n),le({sortable:a,name:"choose",originalEvent:e}),ge(y,o.chosenClass,!0)},o.ignore.split(",").forEach(function(m){uo(y,m.trim(),sa)}),R(l,"dragover",pt),R(l,"mousemove",pt),R(l,"touchmove",pt),o.supportPointer?(R(l,"pointerup",a._onDrop),!this.nativeDraggable&&R(l,"pointercancel",a._onDrop)):(R(l,"mouseup",a._onDrop),R(l,"touchend",a._onDrop),R(l,"touchcancel",a._onDrop)),ji&&this.nativeDraggable&&(this.options.touchStartThreshold=4,y.draggable=!0),de("delayStart",this,{evt:e}),o.delay&&(!o.delayOnTouchOnly||n)&&(!this.nativeDraggable||!(Dn||Ge))){if(T.eventCanceled){this._onDrop();return}o.supportPointer?(R(l,"pointerup",a._disableDelayedDrag),R(l,"pointercancel",a._disableDelayedDrag)):(R(l,"mouseup",a._disableDelayedDrag),R(l,"touchend",a._disableDelayedDrag),R(l,"touchcancel",a._disableDelayedDrag)),R(l,"mousemove",a._delayedDragTouchMoveHandler),R(l,"touchmove",a._delayedDragTouchMoveHandler),o.supportPointer&&R(l,"pointermove",a._delayedDragTouchMoveHandler),a._dragStartTimer=setTimeout(d,o.delay)}else d()}},_delayedDragTouchMoveHandler:function(e){var n=e.touches?e.touches[0]:e;Math.max(Math.abs(n.clientX-this._lastX),Math.abs(n.clientY-this._lastY))>=Math.floor(this.options.touchStartThreshold/(this.nativeDraggable&&window.devicePixelRatio||1))&&this._disableDelayedDrag()},_disableDelayedDrag:function(){y&&sa(y),clearTimeout(this._dragStartTimer),this._disableDelayedDragEvents()},_disableDelayedDragEvents:function(){var e=this.el.ownerDocument;O(e,"mouseup",this._disableDelayedDrag),O(e,"touchend",this._disableDelayedDrag),O(e,"touchcancel",this._disableDelayedDrag),O(e,"pointerup",this._disableDelayedDrag),O(e,"pointercancel",this._disableDelayedDrag),O(e,"mousemove",this._delayedDragTouchMoveHandler),O(e,"touchmove",this._delayedDragTouchMoveHandler),O(e,"pointermove",this._delayedDragTouchMoveHandler)},_triggerDragStart:function(e,n){n=n||e.pointerType=="touch"&&e,!this.nativeDraggable||n?this.options.supportPointer?R(document,"pointermove",this._onTouchMove):n?R(document,"touchmove",this._onTouchMove):R(document,"mousemove",this._onTouchMove):(R(y,"dragend",this),R(H,"dragstart",this._onDragStart));try{document.selection?as(function(){document.selection.empty()}):window.getSelection().removeAllRanges()}catch{}},_dragStarted:function(e,n){if(Et=!1,H&&y){de("dragStarted",this,{evt:n}),this.nativeDraggable&&R(document,"dragover",lu);var s=this.options;!e&&ge(y,s.dragClass,!1),ge(y,s.ghostClass,!0),T.active=this,e&&this._appendGhost(),le({sortable:this,name:"start",originalEvent:n})}else this._nulling()},_emulateDragOver:function(){if(xe){this._lastX=xe.clientX,this._lastY=xe.clientY,_o();for(var e=document.elementFromPoint(xe.clientX,xe.clientY),n=e;e&&e.shadowRoot&&(e=e.shadowRoot.elementFromPoint(xe.clientX,xe.clientY),e!==n);)n=e;if(y.parentNode[ue]._isOutsideThisEl(e),n)do{if(n[ue]){var s=void 0;if(s=n[ue]._onDragOver({clientX:xe.clientX,clientY:xe.clientY,target:e,rootEl:n}),s&&!this.options.dragoverBubble)break}e=n}while(n=co(n));yo()}},_onTouchMove:function(e){if(ut){var n=this.options,s=n.fallbackTolerance,a=n.fallbackOffset,r=e.touches?e.touches[0]:e,o=A&&Rt(A,!0),l=A&&o&&o.a,d=A&&o&&o.d,p=Fn&&re&&Yi(re),m=(r.clientX-ut.clientX+a.x)/(l||1)+(p?p[0]-na[0]:0)/(l||1),h=(r.clientY-ut.clientY+a.y)/(d||1)+(p?p[1]-na[1]:0)/(d||1);if(!T.active&&!Et){if(s&&Math.max(Math.abs(r.clientX-this._lastX),Math.abs(r.clientY-this._lastY))<s)return;this._onDragStart(e,!0)}if(A){o?(o.e+=m-(ea||0),o.f+=h-(ta||0)):o={a:1,b:0,c:0,d:1,e:m,f:h};var g="matrix(".concat(o.a,",").concat(o.b,",").concat(o.c,",").concat(o.d,",").concat(o.e,",").concat(o.f,")");I(A,"webkitTransform",g),I(A,"mozTransform",g),I(A,"msTransform",g),I(A,"transform",g),ea=m,ta=h,xe=r}e.cancelable&&e.preventDefault()}},_appendGhost:function(){if(!A){var e=this.options.fallbackOnBody?document.body:H,n=X(y,!0,Fn,!0,e),s=this.options;if(Fn){for(re=e;I(re,"position")==="static"&&I(re,"transform")==="none"&&re!==document;)re=re.parentNode;re!==document.body&&re!==document.documentElement?(re===document&&(re=Le()),n.top+=re.scrollTop,n.left+=re.scrollLeft):re=Le(),na=Yi(re)}A=y.cloneNode(!0),ge(A,s.ghostClass,!1),ge(A,s.fallbackClass,!0),ge(A,s.dragClass,!0),I(A,"transition",""),I(A,"transform",""),I(A,"box-sizing","border-box"),I(A,"margin",0),I(A,"top",n.top),I(A,"left",n.left),I(A,"width",n.width),I(A,"height",n.height),I(A,"opacity","0.8"),I(A,"position",Fn?"absolute":"fixed"),I(A,"zIndex","100000"),I(A,"pointerEvents","none"),T.ghost=A,e.appendChild(A),I(A,"transform-origin",Xi/parseInt(A.style.width)*100+"% "+Qi/parseInt(A.style.height)*100+"%")}},_onDragStart:function(e,n){var s=this,a=e.dataTransfer,r=s.options;if(de("dragStart",this,{evt:e}),T.eventCanceled){this._onDrop();return}de("setupClone",this),T.eventCanceled||(W=ho(y),W.removeAttribute("id"),W.draggable=!1,W.style["will-change"]="",this._hideClone(),ge(W,this.options.chosenClass,!1),T.clone=W),s.cloneId=as(function(){de("clone",s),!T.eventCanceled&&(s.options.removeCloneOnHide||H.insertBefore(W,y),s._hideClone(),le({sortable:s,name:"clone"}))}),!n&&ge(y,r.dragClass,!0),n?(gs=!0,s._loopId=setInterval(s._emulateDragOver,50)):(O(document,"mouseup",s._onDrop),O(document,"touchend",s._onDrop),O(document,"touchcancel",s._onDrop),a&&(a.effectAllowed="move",r.setData&&r.setData.call(s,a,y)),R(document,"drop",s),I(y,"transform","translateZ(0)")),Et=!0,s._dragStartId=as(s._dragStarted.bind(s,n,e)),R(document,"selectstart",s),ln=!0,window.getSelection().removeAllRanges(),hn&&I(document.body,"user-select","none")},_onDragOver:function(e){var n=this.el,s=e.target,a,r,o,l=this.options,d=l.group,p=T.active,m=qn===d,h=l.sort,g=se||p,S,v=this,C=!1;if(Na)return;function q(en,$l){de(en,v,Ne({evt:e,isOwner:m,axis:S?"vertical":"horizontal",revert:o,dragRect:a,targetRect:r,canSort:h,fromSortable:g,target:s,completed:z,onMove:function(Ei,kl){return Un(H,n,y,a,Ei,X(Ei),e,kl)},changed:be},$l))}function F(){q("dragOverAnimationCapture"),v.captureAnimationState(),v!==g&&g.captureAnimationState()}function z(en){return q("dragOverCompleted",{insertion:en}),en&&(m?p._hideClone():p._showClone(v),v!==g&&(ge(y,se?se.options.ghostClass:p.options.ghostClass,!1),ge(y,l.ghostClass,!0)),se!==v&&v!==T.active?se=v:v===T.active&&se&&(se=null),g===v&&(v._ignoreWhileAnimating=s),v.animateAll(function(){q("dragOverAnimationComplete"),v._ignoreWhileAnimating=null}),v!==g&&(g.animateAll(),g._ignoreWhileAnimating=null)),(s===y&&!y.animated||s===n&&!s.animated)&&(Ct=null),!l.dragoverBubble&&!e.rootEl&&s!==document&&(y.parentNode[ue]._isOutsideThisEl(e.target),!en&&pt(e)),!l.dragoverBubble&&e.stopPropagation&&e.stopPropagation(),C=!0}function be(){_e=we(y),Qe=we(y,l.draggable),le({sortable:v,name:"change",toEl:n,newIndex:_e,newDraggableIndex:Qe,originalEvent:e})}if(e.preventDefault!==void 0&&e.cancelable&&e.preventDefault(),s=Ie(s,l.draggable,n,!0),q("dragOver"),T.eventCanceled)return C;if(y.contains(e.target)||s.animated&&s.animatingX&&s.animatingY||v._ignoreWhileAnimating===s)return z(!1);if(gs=!1,p&&!l.disabled&&(m?h||(o=j!==H):se===this||(this.lastPutMode=qn.checkPull(this,p,y,e))&&d.checkPut(this,p,y,e))){if(S=this._getDirection(e,s)==="vertical",a=X(y),q("dragOverValid"),T.eventCanceled)return C;if(o)return j=H,F(),this._hideClone(),q("revert"),T.eventCanceled||(mt?H.insertBefore(y,mt):H.appendChild(y)),z(!0);var te=ui(n,l.draggable);if(!te||pu(e,S,this)&&!te.animated){if(te===y)return z(!1);if(te&&n===e.target&&(s=te),s&&(r=X(s)),Un(H,n,y,a,s,r,e,!!s)!==!1)return F(),te&&te.nextSibling?n.insertBefore(y,te.nextSibling):n.appendChild(y),j=n,be(),z(!0)}else if(te&&uu(e,S,this)){var ye=zt(n,0,l,!0);if(ye===y)return z(!1);if(s=ye,r=X(s),Un(H,n,y,a,s,r,e,!1)!==!1)return F(),n.insertBefore(y,ye),j=n,be(),z(!0)}else if(s.parentNode===n){r=X(s);var Me=0,lt,Xt=y.parentNode!==n,ve=!ru(y.animated&&y.toRect||a,s.animated&&s.toRect||r,S),Qt=S?"top":"left",Ye=Gi(s,"top","top")||Gi(y,"top","top"),Jt=Ye?Ye.scrollTop:void 0;Ct!==s&&(lt=r[Qt],gn=!1,Bn=!ve&&l.invertSwap||Xt),Me=fu(e,s,r,S,ve?1:l.swapThreshold,l.invertedSwapThreshold==null?l.swapThreshold:l.invertedSwapThreshold,Bn,Ct===s);var qe;if(Me!==0){var ct=we(y);do ct-=Me,qe=j.children[ct];while(qe&&(I(qe,"display")==="none"||qe===A))}if(Me===0||qe===s)return z(!1);Ct=s,vn=Me;var Zt=s.nextElementSibling,Xe=!1;Xe=Me===1;var Rn=Un(H,n,y,a,s,r,e,Xe);if(Rn!==!1)return(Rn===1||Rn===-1)&&(Xe=Rn===1),Na=!0,setTimeout(du,30),F(),Xe&&!Zt?n.appendChild(y):s.parentNode.insertBefore(y,Xe?Zt:s),Ye&&fo(Ye,0,Jt-Ye.scrollTop),j=y.parentNode,lt!==void 0&&!Bn&&(ss=Math.abs(lt-X(s)[Qt])),be(),z(!0)}if(n.contains(y))return z(!1)}return!1},_ignoreWhileAnimating:null,_offMoveEvents:function(){O(document,"mousemove",this._onTouchMove),O(document,"touchmove",this._onTouchMove),O(document,"pointermove",this._onTouchMove),O(document,"dragover",pt),O(document,"mousemove",pt),O(document,"touchmove",pt)},_offUpEvents:function(){var e=this.el.ownerDocument;O(e,"mouseup",this._onDrop),O(e,"touchend",this._onDrop),O(e,"pointerup",this._onDrop),O(e,"pointercancel",this._onDrop),O(e,"touchcancel",this._onDrop),O(document,"selectstart",this)},_onDrop:function(e){var n=this.el,s=this.options;if(_e=we(y),Qe=we(y,s.draggable),de("drop",this,{evt:e}),j=y&&y.parentNode,_e=we(y),Qe=we(y,s.draggable),T.eventCanceled){this._nulling();return}Et=!1,Bn=!1,gn=!1,clearInterval(this._loopId),clearTimeout(this._dragStartTimer),qa(this.cloneId),qa(this._dragStartId),this.nativeDraggable&&(O(document,"drop",this),O(n,"dragstart",this._onDragStart)),this._offMoveEvents(),this._offUpEvents(),hn&&I(document.body,"user-select",""),I(y,"transform",""),e&&(ln&&(e.cancelable&&e.preventDefault(),!s.dropBubble&&e.stopPropagation()),A&&A.parentNode&&A.parentNode.removeChild(A),(H===j||se&&se.lastPutMode!=="clone")&&W&&W.parentNode&&W.parentNode.removeChild(W),y&&(this.nativeDraggable&&O(y,"dragend",this),sa(y),y.style["will-change"]="",ln&&!Et&&ge(y,se?se.options.ghostClass:this.options.ghostClass,!1),ge(y,this.options.chosenClass,!1),le({sortable:this,name:"unchoose",toEl:j,newIndex:null,newDraggableIndex:null,originalEvent:e}),H!==j?(_e>=0&&(le({rootEl:j,name:"add",toEl:j,fromEl:H,originalEvent:e}),le({sortable:this,name:"remove",toEl:j,originalEvent:e}),le({rootEl:j,name:"sort",toEl:j,fromEl:H,originalEvent:e}),le({sortable:this,name:"sort",toEl:j,originalEvent:e})),se&&se.save()):_e!==At&&_e>=0&&(le({sortable:this,name:"update",toEl:j,originalEvent:e}),le({sortable:this,name:"sort",toEl:j,originalEvent:e})),T.active&&((_e==null||_e===-1)&&(_e=At,Qe=bn),le({sortable:this,name:"end",toEl:j,originalEvent:e}),this.save()))),this._nulling()},_nulling:function(){de("nulling",this),H=y=j=A=mt=W=ns=Ze=ut=xe=ln=_e=Qe=At=bn=Ct=vn=se=qn=T.dragged=T.ghost=T.clone=T.active=null;var e=this.el;ys.forEach(function(n){e.contains(n)&&(n.checked=!0)}),ys.length=ea=ta=0},handleEvent:function(e){switch(e.type){case"drop":case"dragend":this._onDrop(e);break;case"dragenter":case"dragover":y&&(this._onDragOver(e),cu(e));break;case"selectstart":e.preventDefault();break}},toArray:function(){for(var e=[],n,s=this.el.children,a=0,r=s.length,o=this.options;a<r;a++)n=s[a],Ie(n,o.draggable,this.el,!1)&&e.push(n.getAttribute(o.dataIdAttr)||mu(n));return e},sort:function(e,n){var s={},a=this.el;this.toArray().forEach(function(r,o){var l=a.children[o];Ie(l,this.options.draggable,a,!1)&&(s[r]=l)},this),n&&this.captureAnimationState(),e.forEach(function(r){s[r]&&(a.removeChild(s[r]),a.appendChild(s[r]))}),n&&this.animateAll()},save:function(){var e=this.options.store;e&&e.set&&e.set(this)},closest:function(e,n){return Ie(e,n||this.options.draggable,this.el,!1)},option:function(e,n){var s=this.options;if(n===void 0)return s[e];var a=Mn.modifyOption(this,e,n);typeof a<"u"?s[e]=a:s[e]=n,e==="group"&&go(s)},destroy:function(){de("destroy",this);var e=this.el;e[ue]=null,O(e,"mousedown",this._onTapStart),O(e,"touchstart",this._onTapStart),O(e,"pointerdown",this._onTapStart),this.nativeDraggable&&(O(e,"dragover",this),O(e,"dragenter",this)),Array.prototype.forEach.call(e.querySelectorAll("[draggable]"),function(n){n.removeAttribute("draggable")}),this._onDrop(),this._disableDelayedDragEvents(),_s.splice(_s.indexOf(this.el),1),this.el=e=null},_hideClone:function(){if(!Ze){if(de("hideClone",this),T.eventCanceled)return;I(W,"display","none"),this.options.removeCloneOnHide&&W.parentNode&&W.parentNode.removeChild(W),Ze=!0}},_showClone:function(e){if(e.lastPutMode!=="clone"){this._hideClone();return}if(Ze){if(de("showClone",this),T.eventCanceled)return;y.parentNode==H&&!this.options.group.revertClone?H.insertBefore(W,y):mt?H.insertBefore(W,mt):H.appendChild(W),this.options.group.revertClone&&this.animate(y,W),I(W,"display",""),Ze=!1}}};function cu(t){t.dataTransfer&&(t.dataTransfer.dropEffect="move"),t.cancelable&&t.preventDefault()}function Un(t,e,n,s,a,r,o,l){var d,p=t[ue],m=p.options.onMove,h;return window.CustomEvent&&!Ge&&!Dn?d=new CustomEvent("move",{bubbles:!0,cancelable:!0}):(d=document.createEvent("Event"),d.initEvent("move",!0,!0)),d.to=e,d.from=t,d.dragged=n,d.draggedRect=s,d.related=a||e,d.relatedRect=r||X(e),d.willInsertAfter=l,d.originalEvent=o,t.dispatchEvent(d),m&&(h=m.call(p,d,o)),h}function sa(t){t.draggable=!1}function du(){Na=!1}function uu(t,e,n){var s=X(zt(n.el,0,n.options,!0)),a=mo(n.el,n.options,A),r=10;return e?t.clientX<a.left-r||t.clientY<s.top&&t.clientX<s.right:t.clientY<a.top-r||t.clientY<s.bottom&&t.clientX<s.left}function pu(t,e,n){var s=X(ui(n.el,n.options.draggable)),a=mo(n.el,n.options,A),r=10;return e?t.clientX>a.right+r||t.clientY>s.bottom&&t.clientX>s.left:t.clientY>a.bottom+r||t.clientX>s.right&&t.clientY>s.top}function fu(t,e,n,s,a,r,o,l){var d=s?t.clientY:t.clientX,p=s?n.height:n.width,m=s?n.top:n.left,h=s?n.bottom:n.right,g=!1;if(!o){if(l&&ss<p*a){if(!gn&&(vn===1?d>m+p*r/2:d<h-p*r/2)&&(gn=!0),gn)g=!0;else if(vn===1?d<m+ss:d>h-ss)return-vn}else if(d>m+p*(1-a)/2&&d<h-p*(1-a)/2)return hu(e)}return g=g||o,g&&(d<m+p*r/2||d>h-p*r/2)?d>m+p/2?1:-1:0}function hu(t){return we(y)<we(t)?1:-1}function mu(t){for(var e=t.tagName+t.className+t.src+t.href+t.textContent,n=e.length,s=0;n--;)s+=e.charCodeAt(n);return s.toString(36)}function bu(t){ys.length=0;for(var e=t.getElementsByTagName("input"),n=e.length;n--;){var s=e[n];s.checked&&ys.push(s)}}function as(t){return setTimeout(t,0)}function qa(t){return clearTimeout(t)}As&&R(document,"touchmove",function(t){(T.active||Et)&&t.cancelable&&t.preventDefault()});T.utils={on:R,off:O,css:I,find:uo,is:function(e,n){return!!Ie(e,n,e,!1)},extend:Jd,throttle:po,closest:Ie,toggleClass:ge,clone:ho,index:we,nextTick:as,cancelNextTick:qa,detectDirection:vo,getChild:zt,expando:ue};T.get=function(t){return t[ue]};T.mount=function(){for(var t=arguments.length,e=new Array(t),n=0;n<t;n++)e[n]=arguments[n];e[0].constructor===Array&&(e=e[0]),e.forEach(function(s){if(!s.prototype||!s.prototype.constructor)throw"Sortable: Mounted plugin must be a constructor function, not ".concat({}.toString.call(s));s.utils&&(T.utils=Ne(Ne({},T.utils),s.utils)),Mn.mount(s)})};T.create=function(t,e){return new T(t,e)};T.version=Xd;var G=[],cn,Ba,Fa=!1,aa,ia,ws,dn;function vu(){function t(){this.defaults={scroll:!0,forceAutoScrollFallback:!1,scrollSensitivity:30,scrollSpeed:10,bubbleScroll:!0};for(var e in this)e.charAt(0)==="_"&&typeof this[e]=="function"&&(this[e]=this[e].bind(this))}return t.prototype={dragStarted:function(n){var s=n.originalEvent;this.sortable.nativeDraggable?R(document,"dragover",this._handleAutoScroll):this.options.supportPointer?R(document,"pointermove",this._handleFallbackAutoScroll):s.touches?R(document,"touchmove",this._handleFallbackAutoScroll):R(document,"mousemove",this._handleFallbackAutoScroll)},dragOverCompleted:function(n){var s=n.originalEvent;!this.options.dragOverBubble&&!s.rootEl&&this._handleAutoScroll(s)},drop:function(){this.sortable.nativeDraggable?O(document,"dragover",this._handleAutoScroll):(O(document,"pointermove",this._handleFallbackAutoScroll),O(document,"touchmove",this._handleFallbackAutoScroll),O(document,"mousemove",this._handleFallbackAutoScroll)),Zi(),is(),Zd()},nulling:function(){ws=Ba=cn=Fa=dn=aa=ia=null,G.length=0},_handleFallbackAutoScroll:function(n){this._handleAutoScroll(n,!0)},_handleAutoScroll:function(n,s){var a=this,r=(n.touches?n.touches[0]:n).clientX,o=(n.touches?n.touches[0]:n).clientY,l=document.elementFromPoint(r,o);if(ws=n,s||this.options.forceAutoScrollFallback||Dn||Ge||hn){ra(n,this.options,l,s);var d=tt(l,!0);Fa&&(!dn||r!==aa||o!==ia)&&(dn&&Zi(),dn=setInterval(function(){var p=tt(document.elementFromPoint(r,o),!0);p!==d&&(d=p,is()),ra(n,a.options,p,s)},10),aa=r,ia=o)}else{if(!this.options.bubbleScroll||tt(l,!0)===Le()){is();return}ra(n,this.options,tt(l,!1),!1)}}},je(t,{pluginName:"scroll",initializeByDefault:!0})}function is(){G.forEach(function(t){clearInterval(t.pid)}),G=[]}function Zi(){clearInterval(dn)}var ra=po(function(t,e,n,s){if(e.scroll){var a=(t.touches?t.touches[0]:t).clientX,r=(t.touches?t.touches[0]:t).clientY,o=e.scrollSensitivity,l=e.scrollSpeed,d=Le(),p=!1,m;Ba!==n&&(Ba=n,is(),cn=e.scroll,m=e.scrollFn,cn===!0&&(cn=tt(n,!0)));var h=0,g=cn;do{var S=g,v=X(S),C=v.top,q=v.bottom,F=v.left,z=v.right,be=v.width,te=v.height,ye=void 0,Me=void 0,lt=S.scrollWidth,Xt=S.scrollHeight,ve=I(S),Qt=S.scrollLeft,Ye=S.scrollTop;S===d?(ye=be<lt&&(ve.overflowX==="auto"||ve.overflowX==="scroll"||ve.overflowX==="visible"),Me=te<Xt&&(ve.overflowY==="auto"||ve.overflowY==="scroll"||ve.overflowY==="visible")):(ye=be<lt&&(ve.overflowX==="auto"||ve.overflowX==="scroll"),Me=te<Xt&&(ve.overflowY==="auto"||ve.overflowY==="scroll"));var Jt=ye&&(Math.abs(z-a)<=o&&Qt+be<lt)-(Math.abs(F-a)<=o&&!!Qt),qe=Me&&(Math.abs(q-r)<=o&&Ye+te<Xt)-(Math.abs(C-r)<=o&&!!Ye);if(!G[h])for(var ct=0;ct<=h;ct++)G[ct]||(G[ct]={});(G[h].vx!=Jt||G[h].vy!=qe||G[h].el!==S)&&(G[h].el=S,G[h].vx=Jt,G[h].vy=qe,clearInterval(G[h].pid),(Jt!=0||qe!=0)&&(p=!0,G[h].pid=setInterval(function(){s&&this.layer===0&&T.active._onTouchMove(ws);var Zt=G[this.layer].vy?G[this.layer].vy*l:0,Xe=G[this.layer].vx?G[this.layer].vx*l:0;typeof m=="function"&&m.call(T.dragged.parentNode[ue],Xe,Zt,t,ws,G[this.layer].el)!=="continue"||fo(G[this.layer].el,Xe,Zt)}.bind({layer:h}),24))),h++}while(e.bubbleScroll&&g!==d&&(g=tt(g,!1)));Fa=p}},30),wo=function(e){var n=e.originalEvent,s=e.putSortable,a=e.dragEl,r=e.activeSortable,o=e.dispatchSortableEvent,l=e.hideGhostForTarget,d=e.unhideGhostForTarget;if(n){var p=s||r;l();var m=n.changedTouches&&n.changedTouches.length?n.changedTouches[0]:n,h=document.elementFromPoint(m.clientX,m.clientY);d(),p&&!p.el.contains(h)&&(o("spill"),this.onSpill({dragEl:a,putSortable:s}))}};function pi(){}pi.prototype={startIndex:null,dragStart:function(e){var n=e.oldDraggableIndex;this.startIndex=n},onSpill:function(e){var n=e.dragEl,s=e.putSortable;this.sortable.captureAnimationState(),s&&s.captureAnimationState();var a=zt(this.sortable.el,this.startIndex,this.options);a?this.sortable.el.insertBefore(n,a):this.sortable.el.appendChild(n),this.sortable.animateAll(),s&&s.animateAll()},drop:wo};je(pi,{pluginName:"revertOnSpill"});function fi(){}fi.prototype={onSpill:function(e){var n=e.dragEl,s=e.putSortable,a=s||this.sortable;a.captureAnimationState(),n.parentNode&&n.parentNode.removeChild(n),a.animateAll()},drop:wo};je(fi,{pluginName:"removeOnSpill"});T.mount(new vu);T.mount(fi,pi);class gu extends me{static properties={playlistId:{type:String}};constructor(){super(),this.playlistId="",this._query=""}deps(){return[i.playlistVersion,i.songs,this.playlistId,this._query]}get already(){const e=i.playlists.find(n=>n.id===this.playlistId);return new Set(e?.songIds||[])}get filtered(){const e=this._query.trim().toLowerCase();return e?i.songs.filter(n=>`${n.title} ${n.artist} ${n.album}`.toLowerCase().includes(e)):i.songs}render(){const e=this.already,n=this.filtered,s=i.songs.filter(a=>!e.has(a.id)).length;return c`
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
          ${this._query.trim()?`匹配 ${E(n.length)} 首`:`共 ${E(i.songs.length)} 首 · 其中 ${E(s)} 首尚未加入`}
        </span>
        <span class="addsongs__actions">
          <button class="btn btn--sm" type="button" data-addsongs="none" @click=${()=>this.setAll(!1)}>
            清空选择
          </button>
          <button class="btn btn--sm" type="button" data-addsongs="all" @click=${()=>this.setAll(!0)}>
            全选
          </button>
        </span>
      </div>
      <div class="addsongs" id="addsongs-list">
        ${n.length?Se(n,a=>a.id,a=>{const r=e.has(a.id);return c`
                    <label class="addsongs__row">
                      <input type="checkbox" data-song-check=${a.id} ?checked=${r} ?disabled=${r} />
                      <span class="addsongs__text">
                        <span class="addsongs__title u-ellipsis">${a.title}</span>
                        <span class="addsongs__sub u-ellipsis">${a.artist}${a.album?` · ${a.album}`:""}</span>
                      </span>
                      ${r?c`<span class="addsongs__tag">已在歌单</span>`:x}
                    </label>
                  `}):c`<div class="addsongs__empty">没有匹配的歌曲</div>`}
      </div>
    `}setAll(e){for(const n of this.querySelectorAll("[data-song-check]:not(:disabled)"))n.checked=e}}ee("mp-add-songs",gu);function $o(t){K({title:"新建歌单",desc:"歌单名称可以随时修改。",body:c`<input class="input" data-field="name" type="text" placeholder="例如：深夜循环" maxlength="40" />`,okText:"创建",onOk:async e=>{const n=String(e.name||"").trim();if(!n)return"请输入歌单名称";if(i.playlists.some(a=>a.name===n))return"已存在同名歌单";const s=await Ml(n);return s?(t?.(s),u(`已创建歌单「${n}」`,{tone:"success"}),!0):"新建歌单失败，请查看提示"}})}function _u(t,e){const n=We(t);!n||n.locked||K({title:"重命名歌单",body:c`<input class="input" data-field="name" type="text" .value=${n.name} maxlength="40" />`,okText:"保存",onOk:s=>{const a=String(s.name||"").trim();return a?(Ol(t,a),!0):"名称不能为空"}})}function yu(t,e){const n=We(t);!n||n.locked||K({title:`删除歌单「${n.name}」？`,desc:"只会删除歌单本身，本地音乐文件不会被删除。",okText:"删除",danger:!0,onOk:()=>(Pl(t),e?.(),u("歌单已删除"),!0)})}function $s(t,e){const n=We(t);if(!n)return;const s=Dl(t,e);s?u(`已添加 ${s} 首到「${n.name}」`,{tone:"success"}):u("所选歌曲已在该歌单中")}function wu(t){const e=We(t);if(!e)return;if(!i.songs.length){u("本地曲库还是空的，先扫描音乐文件夹吧",{tone:"warning"});return}const n=new Set(e.songIds);K({title:`添加歌曲到「${e.name}」`,desc:"勾选要加入的歌曲；已经在歌单里的会保持选中。",body:c`<mp-add-songs .playlistId=${t}></mp-add-songs>`,okText:"加入歌单",onOk:(s,a)=>{const o=[...a.querySelectorAll("[data-song-check]:checked")].map(l=>l.dataset.songCheck).filter(l=>!n.has(l));return o.length?($s(t,o),!0):"没有选中新的歌曲"}})}function er(t,e){const n=We(t);if(!n)return;const s=[{id:"play",label:"播放这个歌单",icon:"play"},{id:"queue",label:"加入播放列表",icon:"queue"},{id:"sep1",kind:"sep"}];n.locked||(s.push({id:"rename",label:"重命名",icon:"edit"}),s.push({id:"delete",label:"删除歌单",icon:"trash",danger:!0}));const a=e.getBoundingClientRect();Ft({x:a.left,y:a.bottom+6,align:"right",items:s,onPick:async r=>{switch(r){case"play":$u(n);break;case"queue":{const o=ni(n);if(!o.length){u(`「${n.name}」里没有可播放的歌曲`,{tone:"warning"});break}(await $t(()=>import("./base-JvEIBNk2.js").then(d=>d.b6),__vite__mapDeps([0,1]))).appendToQueue(o),u(`已把 ${E(o.length)} 首加入播放列表`,{tone:"success"});break}case"rename":_u(n.id);break;case"delete":yu(n.id,()=>Ot("library"));break}}})}function $u(t){const e=ni(t);if(!e.length){u(`「${t.name}」里没有可播放的歌曲`,{tone:"warning"});return}$t(async()=>{const{playContext:n}=await import("./base-JvEIBNk2.js").then(s=>s.b6);return{playContext:n}},__vite__mapDeps([0,1])).then(({playContext:n})=>{n(e,0,{type:"playlist",id:t.id})})}let tr=0;class ku extends me{static deps=e=>[e.view,e.playlistId,e.playlistVersion,e.songs,e.queue,e.onlineSongs.size];firstUpdated(){this.bindDrag()}bindDrag(){const e=this.querySelector("#playlist-nav");!e||this._sortable||(this._sortable=T.create(e,{draggable:".navitem",filter:'[data-locked="true"]',animation:0,ghostClass:"is-dragging",onEnd:n=>this.onDragEnd(n)}))}onDragEnd(e){tr=Date.now();const n=e.oldIndex,s=e.newIndex;if(n==null||s==null||n===s)return;const a=e.from,r=Array.from(a.children).filter(o=>o!==e.item);a.insertBefore(e.item,r[n]??null),Ll(n-1,s-1),u("已调整歌单顺序",{duration:1400})}onSidebarClick(e){if(Date.now()-tr<260)return;const n=e.target.closest('[data-act="pl-more"]');if(n){e.stopPropagation(),er(n.dataset.id,n);return}const s=e.target.closest("[data-nav]");if(!s)return;const a=s.dataset.nav;a==="playlist"?Ot("playlist",s.dataset.playlist):Ot(a)}render(){const e=i.playlists.filter(a=>a.id!==Xn),s=[We(Xn),...e].filter(Boolean);return c`
      <aside
        class="sidebar"
        id="sidebar"
        @click=${a=>this.onSidebarClick(a)}
        @contextmenu=${a=>{const r=a.target.closest('[data-nav="playlist"]');r&&(a.preventDefault(),er(r.dataset.playlist,r))}}
      >
        <div class="sidebar__scroll">
          <nav class="sidebar__group" aria-label="曲库">
            <div class="sidebar__label">曲库</div>
            <button
              class="navitem"
              type="button"
              data-nav="library"
              aria-selected=${String(i.view==="library")}
            >
              ${f("music","navitem__icon")}
              <span class="navitem__text">本地歌曲</span>
              <span class="navitem__tail">
                <span class="navitem__badge" id="badge-library">${E(i.songs.length)}</span>
              </span>
            </button>
            <button class="navitem" type="button" data-nav="queue" aria-selected=${String(i.view==="queue")}>
              ${f("queue","navitem__icon")}
              <span class="navitem__text">播放列表</span>
              <span class="navitem__tail">
                <span class="navitem__badge" id="badge-queue"
                  >${E(Ur(i.queue).length)}</span
                >
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
                @click=${()=>$o(a=>a&&Ot("playlist",a.id))}
              >
                ${f("plus")}
              </button>
            </div>
            <div id="playlist-nav">
              ${Se(s,a=>a.id,a=>this.playlistItem(a))}
            </div>
          </nav>
        </div>
      </aside>
    `}playlistItem(e){const n=i.view==="playlist"&&i.playlistId===e.id;return c`
      <button
        class="navitem"
        type="button"
        data-nav="playlist"
        data-playlist=${e.id}
        data-locked=${String(!!e.locked)}
        draggable=${e.locked?"false":"true"}
        aria-selected=${String(n)}
      >
        ${f(e.id===Xn?"heart":"playlist","navitem__icon")}
        <span class="navitem__text">${e.name}</span>
        <span class="navitem__tail">
          <span class="navitem__badge">${E(ni(e).length)}</span>
          <span class="navitem__more" data-act="pl-more" data-id=${e.id} role="button" aria-label="${e.name}操作"
            >${f("more")}</span
          >
        </span>
      </button>
    `}}ee("mp-sidebar",ku);const Su=ii(class extends ri{constructor(){super(...arguments),this.key=x}render(t,e){return this.key=t,e}update(t,[e,n]){return e!==this.key&&(Jr(t),this.key=e),n}}),hi=[{id:"auto",label:"自动识别（按接口地址与模型名判断）",hint:"识别不出时按 OpenAI 兼容接口处理"},{id:"openai",label:"OpenAI（GPT-5 系列 / o 系列）",hint:"o 系列无法完全关闭思考，只能降到最低档"},{id:"deepseek",label:"DeepSeek（deepseek-chat / reasoner）",hint:"思考模式下 temperature 会被忽略"},{id:"anthropic",label:"Anthropic Claude",hint:"开启思考时 temperature 必须为 1，程序会自动去掉它"},{id:"gemini",label:"Google Gemini",hint:"Pro 系列无法关闭思考"},{id:"qwen",label:"阿里通义千问 Qwen",hint:"仅「混合思考」模型可关闭；部分开源模型只支持流式"},{id:"glm",label:"智谱 GLM",hint:"GLM-5.3 系列传 disabled 会报错"},{id:"kimi",label:"月之暗面 Kimi",hint:"kimi-k3 / k2.7-code 始终思考，传 thinking 会报错"},{id:"minimax",label:"MiniMax",hint:"官方未提供关闭思考的参数，只能保持默认"},{id:"xai",label:"xAI Grok",hint:"reasoning_effort=none 可真正关闭"},{id:"openrouter",label:"OpenRouter（统一网关）",hint:"统一 reasoning 字段；标记 mandatory 的模型不接受关闭"},{id:"siliconflow",label:"SiliconFlow（硅基流动）",hint:"R1 类纯推理模型无法关闭"},{id:"ollama",label:"Ollama（本地，OpenAI 兼容）",hint:"本地兼容层用 reasoning_effort；GPT-OSS 无法完全关闭"}];function xu(t){return hi.find(e=>e.id===t)?.label||t||"自动识别"}function ko(t){return hi.find(e=>e.id===t)?.hint||""}const So=[{key:"aiLyricsClean",label:"匹配歌词前用 AI 清洗元数据",when:"每次自动匹配歌词之前（本地标签匹配不到、要联网找歌词时）",detail:"AI 从文件名还原真实的标题 / 歌手，再拿它去匹配；一次调用可能要十几秒"},{key:"aiDownloadTag",label:"下载完成后用 AI 整理元数据",when:"每次下载结束之后，在后台进行（含从试听缓存复制的那条路径）",detail:"AI 还原标题 / 歌手 / 专辑，并**写回歌曲文件的标签**（m4a / flac），不可撤销"}];function xo(t={}){return So.map(e=>({...e,on:t?.[e.key]!==!1}))}function Cu(t={}){return xo(t).some(e=>e.on)}function Tu(t){const e=So.find(n=>n.key===t);return e?t==="aiDownloadTag"?`已开启「${e.label}」：${e.when}会把文件名与现有标签交给 AI，并写回文件标签（不可撤销）；随时可在设置里关掉`:`已开启「${e.label}」：${e.when}会先等一次 AI 调用（可能十几秒）；随时可在设置里关掉`:""}function Iu(t){if(!Array.isArray(t))return[];const e=new Set,n=[];for(const s of t){const a=typeof s=="string"?s:s?.id;typeof a!="string"||!a.startsWith("bili:")||a.length<=5||e.has(a)||(e.add(a),n.push(a))}return n}function Eu(){if(!$())return;let t=null;const e=()=>{const n=Iu(i.queue),s=n.join(`
`);s!==t&&(t=s,b.onlineProtectIDs(n).catch(a=>{console.warn("[online-cache] 上报播放队列引用失败（只影响空闲清理的保守程度）",a)}))};In(e),e()}let Ua=null,Co=0;function nr(){return{stats:Ua,rev:Co}}async function To(){if(!$())return null;try{const t=await b.onlineCacheStats();return Ua=t&&typeof t=="object"?t:null,Co+=1,fe(),Ua}catch(t){return console.warn("[online-cache] 读取试听缓存占用失败",t),null}}function Au(t){const e=t?.stats;if(!e)return"正在读取…";const n=((Number(e.bytes)||0)/1024/1024).toFixed(1);return`已缓存 ${Number(e.count)||0} 个试听文件，共 ${n} MB`}function Du(t){if(!t)return"清理失败";if(t.skipped)return`未清理：${t.skipped}`;const e=Number(t.deleted)||0,n=((Number(t.bytes)||0)/1024/1024).toFixed(1),s=Number(t.kept)||0,a=s>0?`，保留 ${s} 个还在播放列表 / 歌单 / 喜欢里的`:"";return e===0?`没有可清理的试听缓存${s>0?`（${s} 个都还在引用中）`:""}`:`已清理 ${e} 个未引用的试听缓存（${n} MB）${a}`}async function Mu(){if(!$())return u("浏览器预览无法清理缓存",{tone:"warning"}),null;const t=u("正在清理未引用的试听缓存…",{duration:0});try{const e=await b.onlineCleanupCache();return await To(),u(Du(e),{duration:4200}),e}catch(e){return u(`清理失败：${e?.message??e}`,{tone:"error",duration:6e3}),null}finally{t?.close?.()}}let ie=!1,sr=!1,oa="",oe=null,ar=0,Ae=null,et=0,at=null,Nt=null,V=null,it=-1,ks=0,la=null,nt=!1;const ca=[];let ze=null,_n=0;const ir=5;let ce=null,rs=!1,Pe=null,Oe=null,rr=null,Je=null,Dt=null,rt=null;const qt="idle",bt="loading";let $e=qt,vt=null,gt=!1,da=0,Ha=0;const or=1500,Pu=12e3;async function Ou(){if(sr)return ie;if(sr=!0,!$())return!1;try{const t=await b.playerAvailable();ie=t?.available===!0,oa=t?.reason||"",ie||console.warn("[audio] 后端音频不可用，回退到 <audio> 播放：",oa||"未知原因")}catch(t){ie=!1,oa=t?.message||String(t),console.warn("[audio] 探测后端音频失败，回退到 <audio> 播放",t)}return ie}ql(()=>{if(ie&&i.currentId)return!0;const t=document.getElementById("audio-engine");return!!(t&&t.src)});Bl(t=>Fu(t));function Lu(){$()&&(ca.push(U("player:state",t=>{t&&Io(t)})),ca.push(U("player:error",t=>{t&&Ds(t.songId||i.currentId,t.reason,"backend")})),ca.push(U("player:ended",()=>{Ao()})),la&&clearInterval(la),la=setInterval(Ru,250))}function Io(t){if(nt)return;const e=Number(t.durationMs)||0,n=Number(t.positionMs)||0;V={positionMs:n,atMs:Number(t.atMs)||0,durationMs:e,playing:t.playing===!0,at:performance.now()},at=V.playing;let s=!1;e>0&&i.duration!==e&&(i.duration=e,s=!0),i.playing!==V.playing&&(i.playing=V.playing,s=!0),Eo(n,!0),s?k():Fe()}function Ru(){if(!V||!ie||!i.currentId||nt)return;let t=V.positionMs;V.playing&&(t=V.positionMs+(performance.now()-V.at)),V.durationMs>0&&(t=Math.min(t,V.durationMs)),Eo(t,!1)}function Eo(t,e){if(!Number.isFinite(t)||t<0)return;const n=Math.round(t);!e&&Math.round(n/250)===Math.round(it/250)||(it=n,i.position=n,Hr(n),i.config.resumeProgress===!0&&performance.now()-ks>5e3&&(ks=performance.now(),zr()),Fe())}function Ao(){if(i.sleepTimer?.type==="after-song"){Ut(!0);return}if(i.playMode==="loop-one"){Yu(0);return}Ut(!0)}async function mi(){if(ie)try{await b.playerSetPlaybackOptions(i.config.skipSilenceHead===!0,i.config.skipSilenceTail===!0,Number(i.config.trackGapSeconds)||0)}catch(t){console.warn("[audio] 同步跳过静音/切歌间隔失败",t)}}async function Do(){if(!ie)return;const t=i.config.effectPreset||"off";try{const e=await b.playerSetEffect(t);e&&typeof e.preset=="string"&&e.preset!==t&&(console.warn(`[audio] 音效档位 ${t} 非法，后端收敛为 ${e.preset}`),i.config.effectPreset=e.preset,k?.())}catch(e){console.warn("[audio] 同步音效档位失败",e)}}let Nu=null;function Ds(t,e,n="unknown"){const s=t?Ve(t)||Ke():Ke(),a=s?.id||t||null,r=s?.title||a||"当前歌曲",o=String(e||"").trim()||"未知原因";if(a&&a===ze){console.warn(`[audio] 忽略重复的播放失败报告（${n}）：${r}`);return}a&&(ze=a),console.warn(`[audio] 播放失败（${n}）：${r} —— ${o}`),Bu(s,o),Ae===a&&(Ae=null),oe===a&&(oe=null),V=null,at=null,_n+=1;const l=_n>=ir,d=!l&&i.playing&&i.sleepTimer?.type!=="after-song"&&i.playMode!=="loop-one";if(l){i.playing=!1,k(),ze=null,_n=0,u(`连续 ${ir} 首都无法播放（${o}），已停止自动跳过`,{tone:"error",duration:8e3});return}if(u(`无法播放：${r}（${o}）${d?"，已跳到下一首":""}`,{tone:"error",duration:5e3}),!d){i.playing&&(i.playing=!1,k());return}Ut(!0)}function qu(){_n=0,ze=null}function Bu(t,e){if(!(!$()||!t?.id)&&!t.online)try{b.unplayableReport(t.id,String(e||""),t.path||"").then(()=>{Nl(t.id)}).catch(n=>{console.warn("[audio] 登记「放不出来」失败（不影响播放）",n)})}catch(n){console.warn("[audio] 登记「放不出来」失败（不影响播放）",n)}}function Fu(t){(!t||t===ze)&&(ze=null,_n=0)}function Mo(){return i.playNonce===ar?!1:(ar=i.playNonce,!0)}async function Uu(){if(!$())return;if(!ie){await tp();return}const t=Ke();if(!t){oe!==null&&await Hu();return}if(Mo()&&oe===t.id&&(oe=null,Ae=null,at=null,V=null,it=-1),oe!==t.id){if(t.id===ze)return;await ju(t);return}Gu()}async function Hu(){et++,nt=!1,oe=null,Ae=null,at=null,V=null,it=-1;try{await b.playerUnload()}catch{}}const zu=420*1e3;function Wu(t){return t?.isTimeout===!0}function Ku(t,e={}){const n=typeof e.commit=="function"?e.commit:k,s=typeof e.toast=="function"?e.toast:u,a=t?.title||t?.id||"当前歌曲";oe=null,Ae=null,V=null,it=-1,nt=!1,t?.id&&(ze=t.id),i.playing=!1,console.warn("[audio] 装载超时（播放引擎无响应，未登记为「放不出来」）：",a,e.reason||""),n(),s(`播放引擎无响应：${a}（不是文件损坏；可稍后重试）`,{tone:"error",duration:8e3})}async function ju(t){oe=t.id;const e=++et;V=null,it=-1,nt=!0;try{await b.playerCancelGap()}catch{}if(e===et){rt=null,await Ss(null);try{const n=await xl(b.playerLoad(t.id),zu,"Player.Load");if(e!==et||n?.superseded)return;qu(),Ae=t.id,n?.durationMs>0&&(i.duration=n.durationMs),Nu={headMs:Number(n?.skippedHeadMs)||0,tailMs:Number(n?.skippedTailMs)||0};const s=Lo(t);s>0&&await b.playerSeek(s),await Ss(t.id),await bi(),rt=Oo(),gi(t.id),i.playing&&await b.playerPlay(),at=!!i.playing;const a=await b.playerState();if(e!==et)return;nt=!1,a&&Io(a)}catch(n){if(e!==et)return;if(Wu(n)){Ku(t,{reason:n?.message});return}oe=null,Ae=null,nt=!1,Ds(t.id,n?.message??"装载失败","load")}}}function Vu(){return nt}async function Gu(){const t=!!i.playing;if(at!==t)try{t?await b.playerPlay():await b.playerPause(),at=t}catch(e){console.warn("[audio] 同步播放状态失败",e)}}async function Yu(t){if(!ie)return;const e=Math.max(0,t);V&&(V={...V,positionMs:e,at:performance.now()}),it=-1;try{await b.playerSeek(e),await b.playerPlay(),at=!0}catch(n){console.warn("[audio] 重新起播失败",n)}}function Po(){const e=10**(vi(i.currentId)/20);return(i.muted?0:i.volume)*e}function Oo(){const e=10**(vi(Ae)/20);return(i.muted?0:i.volume)*e}function za(){if(!ie){Ps();return}bi()}async function bi(){try{await b.playerSetVolume(i.volume??1,i.muted===!0)}catch(t){console.warn("[audio] 同步音量失败",t)}}function vi(t){if((i.config.loudnessMode||"off")==="off"||!t)return 0;const n=i.loudnessGains?.[t];return Number.isFinite(n)?n:0}async function Ss(t){const e=vi(t);try{await b.playerSetLoudness(e)}catch(n){console.warn("[audio] 同步响度补偿失败",n)}}function Wt(){if(!ie){sp();return}const t=Oo();t!==rt&&(rt=t,bi(),Ss(Ae))}function Ee(t){Rl(t),Xu(t)}function Xu(t){if(!$())return;const e=Math.max(0,Math.min(t,i.duration||0));if(V&&(V={...V,positionMs:e,at:performance.now()}),it=e,!ie){ap(t);return}b.playerSeek(e).catch(n=>{console.warn("[audio] 跳转失败",n)})}function Qu(){if(!ie){const t=ip(zc);return t?{bands:t,at:performance.now()}:null}return Hc()}const Hn=new Map;async function gi(t){const e=i.config.loudnessMode||"off";if(e==="off"||!$()||!t)return;if(i.loudnessGains?.[t]!==void 0){ie&&Ae===t&&Ss(t);return}if(Hn.has(t))return Hn.get(t);const n=(async()=>{try{const s=i.config.loudnessTarget??-16,a=await b.loudnessLookup(t,s);if(a?.measured){lr(t,a.gainDB);return}if(e==="album")return;const r=await b.loudnessMeasure(t,s);r?.measured&&lr(t,r.gainDB??Ju(r,s))}catch(s){console.warn("[audio] 响度补偿获取失败",s)}finally{Hn.delete(t)}})();return Hn.set(t,n),n}function Ju(t,e){if(!t?.integrated)return 0;let n=e-t.integrated;if(t.truePeak){const s=-1-t.truePeak;n>s&&(n=s)}return n>24&&(n=24),n<-24&&(n=-24),Math.round(n*100)/100}function lr(t,e){i.loudnessGains||(i.loudnessGains={}),i.loudnessGains[t]=e,t===Ae&&(ie?Wt():Ps()),Fe()}async function Zu(){const t=i.config.loudnessTarget??-16;if(i.loudnessGains={},Wt(),Fe(),!!$())try{await b.loudnessInvalidateTarget(t)}catch(e){console.warn("[loudness] 失效旧补偿失败",e)}}async function Ms(){if(!$())return;const t=i.config.loudnessMode||"off";if(t==="off"){i.loudnessGains={},Wt();return}const e=i.config.loudnessTarget??-16;try{const n=t==="album"?await b.loudnessAlbumGains(e):await b.loudnessGainMap(e);i.loudnessGains=n||{},Wt(),Fe(),t==="track"&&i.currentId&&gi(i.currentId)}catch(n){console.warn("[loudness] 拉取补偿增益失败",n)}}async function yn(){if(!$())return null;try{const t=await b.loudnessState();return t&&(i.loudnessState=t),t}catch{return null}}function Lo(t){const e=Number(i.pendingResumeMs)||0;if(i.pendingResumeMs=0,!e||i.config.resumeProgress!==!0)return 0;const n=t?.duration||i.duration||0;return n&&e>=n-3e3?0:e}function Ro(){return ce||(ce=document.getElementById("audio-engine"),ce||(ce=document.createElement("audio"),ce.id="audio-engine",ce.preload="auto",ce.hidden=!0,document.body.appendChild(ce)),ce.crossOrigin="anonymous",ep(ce),ce)}function ep(t){t.dataset.bound!=="1"&&(t.dataset.bound="1",t.addEventListener("loadedmetadata",()=>{if(Number.isFinite(t.duration)&&t.duration>0&&(i.duration=t.duration*1e3,Fe(),k()),Nt!=null){const e=Nt;Nt=null;try{t.currentTime=Math.max(0,Math.min(e,i.duration||0)/1e3)}catch{}}No(t)}),t.addEventListener("timeupdate",()=>{document.getElementById("progress")?.dataset.dragging!=="true"&&(i.position=t.currentTime*1e3,Hr(i.position),i.config.resumeProgress===!0&&performance.now()-ks>5e3&&(ks=performance.now(),zr()),Fe())}),t.addEventListener("play",()=>{$e!==bt&&(gt=!1,i.playing=!0,Pe?.state==="suspended"&&Pe.resume().catch(()=>{}),Fe())}),t.addEventListener("pause",()=>{if(gt){gt=!1;return}if($e===bt||t.ended)return;const e=Number.isFinite(t.duration)&&t.duration>0?t.duration*1e3:i.duration||0;e&&(Number.isFinite(t.currentTime)?t.currentTime*1e3:i.position)>=e-300||da&&performance.now()-da<or||(i.playing=!1,Fe())}),t.addEventListener("ended",()=>{da=performance.now(),Ao()}),t.addEventListener("error",()=>{$e=qt,gt=!1;const e=Ke();if(!e||Ha&&performance.now()-Ha<or||!t.error||!t.error.code)return;const n=t.error?.code,s=n===4?"格式无法播放（解码失败）":n===3?"音频数据损坏":n===2?"网络中断":"音频加载失败";Ds(e.id,s,"legacy")}))}async function tp(){const t=Ro(),e=Ke();if(!e){oe!==null&&(t.pause(),t.removeAttribute("src"),t.load(),oe=null,$e=qt);return}if(Mo()&&oe===e.id&&$e!==bt)try{t.currentTime=0}catch{}if(oe!==e.id){if(e.id===ze)return;oe=e.id,$e=bt,gt=!1,vt&&clearTimeout(vt),vt=setTimeout(()=>{vt=null,$e===bt&&No(ce)},Pu);const n=++et;let s=null;try{s=e.streamUrl||await b.mediaUrl(e.id)}catch(a){$e=qt,oe=null,Ds(e.id,a?.message??"取播放地址失败","legacy-url");return}if(n!==et)return;if(!s){$e=qt;return}Nt=Lo(e),t.src=s,Ha=performance.now(),t.load(),np(t),Ps(),gi(e.id),i.playing&&t.paused&&t.play().catch(a=>{const r=a?.name||"";r==="AbortError"||r==="NotAllowedError"||console.warn("[audio] 播放失败",a)});return}$e!==bt&&(i.playing&&t.paused?t.play().catch(()=>{}):!i.playing&&!t.paused&&(gt=!0,t.pause()))}function No(t){if(vt&&(clearTimeout(vt),vt=null),$e!==bt)return;$e=qt;const e=t||ce;e&&(i.playing&&e.paused?e.play().catch(()=>{}):!i.playing&&!e.paused&&(gt=!0,e.pause()))}function np(t){if(rs)return!1;if(Pe&&Oe)return!0;const e=window.AudioContext||window.webkitAudioContext;if(!e)return rs=!0,!1;try{Pe=new e,Oe=Pe.createGain(),Oe.gain.value=1,rr=Pe.createMediaElementSource(t),rr.connect(Oe),Oe.connect(Pe.destination);try{Je=Pe.createAnalyser(),Je.fftSize=512,Je.smoothingTimeConstant=.76,Dt=new Uint8Array(Je.frequencyBinCount),Oe.connect(Je)}catch{Je=null,Dt=null}return rt=null,!0}catch(n){return console.warn("[audio] Web Audio 链路建立失败，退回元素音量",n),rs=!0,!1}}function Ps(){const t=ce,e=Po();if(Pe&&Oe&&!rs){const n=Pe.currentTime;try{Oe.gain.cancelScheduledValues(n),Oe.gain.setTargetAtTime(e,n,.015)}catch{Oe.gain.value=e}t&&(t.volume=1),rt=e;return}t&&(t.volume=Math.max(0,Math.min(1,e))),rt=e}function sp(){Po()!==rt&&Ps()}function ap(t){const e=Ro();if(!e.src){Nt=t;return}const n=Math.max(0,Math.min(t,i.duration||0))/1e3;try{e.currentTime=n}catch{Nt=t}}function ip(t=32){if(!Je||!Dt)return null;Je.getByteFrequencyData(Dt);const e=Math.max(1,Math.min(128,Math.floor(t)||32)),n=new Float32Array(e),s=Dt.length;for(let a=0;a<e;a+=1){const r=Math.floor(s*(a/e)**1.7),o=Math.min(s,Math.max(r+1,Math.floor(s*((a+1)/e)**1.7)));let l=0;for(let d=r;d<o;d+=1)l+=Dt[d];n[a]=l/((o-r)*255)}return n}const rp={itunes:"iTunes",netease:"网易云音乐",qq:"QQ 音乐",deezer:"Deezer",musicbrainz:"MusicBrainz",lrclib:"LRCLIB",kugou:"酷狗音乐",kuwo:"酷我音乐",migu:"咪咕音乐"},op=["itunes","netease","qq","deezer","musicbrainz"];function Wa(t){const e=String(t||"").trim().toLowerCase();return rp[e]||String(t||"")}function _i(t,e=""){const n=Array.isArray(t)?t.filter(Boolean):[];return n.length?n.map(s=>Wa(s)).join(" / "):e}function qo(){return _i(op)}const lp="../bindings/localmusicplayer/index.js";let zn=null;async function ua(){if(zn)return zn;try{const t=await import(lp);zn=t&&t.OnlineService?t.OnlineService:null}catch(t){console.info("[online] backend unavailable",t)}return zn}const cp=new Set(["m4a","mp4","m4b","alac","aac","flac"]);let Y="online";function pa(t,e){const n=String(t?.note||"").trim()||e;u(n,{tone:"success",duration:Math.min(6500,1800+n.length*55)})}const _={songId:"",title:"",lines:[],cursor:0,undo:[],dirty:!1,kept:0,stale:!1};class dp extends me{static deps=e=>[e.lyricsOpen,e.currentId,e.playing,Y,Bo,i.config.embedMeta];constructor(){super(),this._nowIndex=-1,this._onlineError="",this._searched=!1,this._candidates=[],this._searching=!1,this._onlineKeyword="",this._lastNowPaint=0,this._lastNudgeActive=-1,this._lastScrolledNow=-1,this._lastScrolledCursor=-1,this._followHold=0,this._followAutoUntil=0,this._lastOnlineHint="在线歌词来源",this._formats=new Map,this._searchSeq=0,this._appliedKey="",this._appliedTimer=null}onConnected(){this._onKeyDownCapture=e=>this.onPanelKeyDown(e),document.addEventListener("keydown",this._onKeyDownCapture,!0),this._unsubscribers.push(In(()=>{this.open&&(Y==="nudge"?this.paintNudgeFollow():Y==="edit"&&this.paintEditorFollow())}))}onDisconnected(){document.removeEventListener("keydown",this._onKeyDownCapture,!0),clearTimeout(this._appliedTimer)}get open(){return i.lyricsOpen===!0}get panelEl(){return this.querySelector("#lyrics-panel")}updated(){const e=this.panelEl;e&&(e.hidden=!this.open,e.dataset.open=this.open?"true":"false",this.open&&(Y==="nudge"&&this.paintNudgeFollow(),Y==="edit"&&this.paintEditorFollow()))}_refreshHeader(){N()}render(){const e=ke(),n=e.song,s=e.lines.some(a=>Array.isArray(a.words)&&a.words.length>0);return c`
      <section
        class="lyricspanel"
        id="lyrics-panel"
        role="dialog"
        aria-label="歌词工作台"
        data-open=${this.open?"true":"false"}
        data-tab=${Y}
        hidden
        @click=${a=>this.onClick(a)}
        @input=${a=>this.onInput(a)}
      >
        <header class="lyricspanel__head">
          <img class="lyricspanel__cover" data-song-cover alt="" src=${n?kt(n):x} />
          <div class="lyricspanel__meta">
            <div class="lyricspanel__title" data-song-title>${n?n.title||"未命名":"未在播放"}</div>
            <div class="lyricspanel__sub">
              <span
                class="lyricspanel__badge${e.text?"":" is-empty"}"
                data-song-source
                data-src=${e.source}
              >
                ${e.status==="matching"||e.status==="loading"?"歌词匹配中…":e.status==="failed"?"歌词匹配失败":`${mr(e.source)}${s?" · 逐字":""}`}
              </span>
              <span class="lyricspanel__artist" data-song-artist>${n&&n.artist||""}</span>
            </div>
          </div>
          <button
            class="lyricspanel__close u-hit"
            type="button"
            data-act="close"
            aria-label="关闭"
            @click=${()=>Ka()}
          >
            ${f("close")}
          </button>
        </header>

        <nav class="lyricspanel__tabs" role="tablist">
          ${["online","nudge","edit"].map(a=>c`
              <button
                class="lyricspanel__tab${Y===a?" is-active":""}"
                type="button"
                role="tab"
                data-tab=${a}
                aria-selected=${String(Y===a)}
                @click=${()=>sn(a)}
              >
                ${a==="online"?"在线匹配":a==="nudge"?"微调":"手动编辑"}
              </button>
            `)}
        </nav>

        ${this.noticeTemplate(e)}
        <div class="lyricspanel__body">
          ${this.open?c`${this.onlinePane()} ${this.nudgePane(e)} ${this.editPane()}`:x}
        </div>
      </section>
    `}noticeTemplate(e){const n=Y==="nudge"||Y==="edit",s=e.source==="embedded"||e.source==="lrc-file";if(!n||!s)return x;const a=mr(e.source),r=pp(e.song),o=cp.has(r);return c`
      <div class="lyricspanel__notice" data-notice>
        ${o?c`<label class="lyricspanel__notice-opt" data-notice-opt>
                <input type="checkbox" data-embed-toggle checked />
                <span
                  class="lyricspanel__notice-opt-text"
                  data-tip="这首歌的歌词来自「${a}」，优先级高于歌词缓存：只存缓存的话，下次打开会显示回旧歌词。勾上则同时写进歌曲文件本身（会改动音乐文件）。"
                >
                  同时写入歌曲文件<span class="lyricspanel__notice-opt-badge" aria-hidden="true">!</span>
                </span>
              </label>`:c`<span class="lyricspanel__notice-badge" aria-hidden="true">!</span>
                <div class="lyricspanel__notice-text" data-notice-text>
                  这首歌的歌词来自「${a}」，优先级高于歌词缓存；${r?"."+r:"该格式"}
                  不能写入歌词标签，所以本次改动<b>只在本次运行内</b>生效，重启后会变回旧歌词。
                </div>`}
      </div>
    `}onlinePane(){return c`
      <section class="lyricspanel__pane" data-pane="online" ?hidden=${Y!=="online"}>
        <div class="lyricspanel__row">
          <input
            class="lyricspanel__input"
            data-online-input
            placeholder="输入歌词搜索关键词"
            .value=${this._onlineKeyword}
            @input=${e=>{this._onlineKeyword=e.target.value}}
            @keydown=${e=>{e.key==="Enter"&&this.searchLyrics()}}
          />
          <button
            class="btn btn--primary"
            type="button"
            data-act="lyrics-search"
            ?disabled=${this._searching}
            @click=${()=>this.searchLyrics()}
          >
            ${this._searching?"搜索中":"搜索"}
          </button>
        </div>
        <div class="lyricspanel__hint" data-online-hint>${this._lastOnlineHint}</div>
        <div class="lyricspanel__list" data-online-results>${this.onlineResults()}</div>
      </section>
    `}onlineResults(){if(this._searching)return c`
        <div class="lyricspanel__state" data-online-state="searching">
          <span class="lyricspanel__spinner"></span>
          <div class="lyricspanel__state-title">正在搜索歌词</div>
          <div class="lyricspanel__state-desc">正在已启用的在线歌词来源里查找候选…</div>
        </div>
      `;if(this._onlineError)return c`
        <div class="lyricspanel__state lyricspanel__state--error" data-online-state="error">
          ${f("warning")}
          <div class="lyricspanel__state-title">搜索失败</div>
          <div class="lyricspanel__state-desc">
            在线歌词来源没有响应。检查网络后重试，或者切到「手动编辑」自己贴一份。
          </div>
          <div class="lyricspanel__state-detail">${this._onlineError}</div>
          <div class="lyricspanel__state-actions">
            <button class="btn btn--sm" type="button" data-act="lyrics-search" @click=${()=>this.searchLyrics()}>
              重试
            </button>
            <button class="btn btn--sm" type="button" @click=${()=>sn("edit")}>手动编辑歌词</button>
          </div>
        </div>
      `;if(this._candidates.length)return Se(this._candidates,(e,n)=>`${e.provider||""}-${e.id||n}`,(e,n)=>{const s=!!this._appliedKey&&this._appliedKey===Wn(e);return c`
            <div class="candidate ${s?"candidate--applied":""}" data-applied=${s?"1":x}>
              <div class="candidate__main">
                <div class="candidate__title">${(e.title||"未命名")+" - "+(e.artist||"未知")}</div>
                <div class="candidate__sub">
                  ${this.formatChip(e)}
                  ${(e.provider||"")+" · score "+(e.score||0)+" · "+Mt(e.duration)}
                </div>
              </div>
              <button
                class="btn btn--sm ${s?"btn--applied":"btn--primary"}"
                type="button"
                data-act="use-lyric"
                data-i=${n}
                @click=${()=>this.applyCandidate(n)}
              >
                ${s?c`${f("check")}<span>已应用</span>`:"使用"}
              </button>
            </div>
          `});if(this._searched){const e=an()?.title||"",n=!!e&&e!==this._onlineKeyword;return c`
        <div class="lyricspanel__state" data-online-state="empty">
          ${f("lyrics")}
          <div class="lyricspanel__state-title">没有找到候选歌词</div>
          <div class="lyricspanel__state-desc">换个更短的关键词通常更有效（只留歌名、去掉括号里的后缀）。</div>
          <div class="lyricspanel__state-actions">
            ${n?c`<button class="btn btn--sm" type="button" @click=${()=>this.retryWithTitle()}>
                    只用歌名重搜
                  </button>`:x}
            <button class="btn btn--sm" type="button" @click=${()=>sn("edit")}>手动编辑歌词</button>
          </div>
        </div>
      `}return c`
      <div class="lyricspanel__state" data-online-state="idle">
        ${f("search")}
        <div class="lyricspanel__state-title">还没有开始搜索</div>
        <div class="lyricspanel__state-desc">搜索框里已经填好了当前歌曲，点「搜索」或按回车就能在线匹配歌词。</div>
        <div class="lyricspanel__state-actions">
          <button
            class="btn btn--sm btn--primary"
            type="button"
            data-act="lyrics-search"
            @click=${()=>this.searchLyrics()}
          >
            搜索歌词
          </button>
        </div>
      </div>
    `}async retryWithTitle(){const e=an()?.title?.trim();e&&(this._onlineKeyword=e,N(),await this.searchLyrics())}nudgePane(e){const n=e.songId?Bt(e.songId):0,s=n<0?e.lines.filter(r=>r.time+n<0).length:0,a=yi();return c`
      <section class="lyricspanel__pane lyricspanel__pane--nudge" data-pane="nudge" ?hidden=${Y!=="nudge"}>
        <div class="nudge__bar">
          <span class="nudge__label">偏移</span>
          <b class="nudge__value" data-nudge-value>${(n>0?"+":"")+(n/1e3).toFixed(2)} 秒</b>
          <span class="nudge__dirty" data-nudge-dirty ?hidden=${n===0}>未应用</span>
          <span class="nudge__warn" data-nudge-clamp ?hidden=${s===0}>
            ${s?`有 ${s} 行被压到 0:00`:""}
          </span>
          <span class="nudge__spacer"></span>
          <div class="nudge__steps">
            ${[-1e3,-500,-100,100,500,1e3].map(r=>c`<button
                  class="btn btn--sm"
                  type="button"
                  data-act="nudge-step"
                  data-delta=${r}
                  @click=${()=>fa(r)}
                >
                  ${r>0?"+":"−"}${(Math.abs(r)/1e3).toFixed(1)}
                </button>`)}
          </div>
        </div>
        <div class="nudge__bar">
          <button
            class="btn btn--sm nudge__feel"
            type="button"
            data-act="nudge-feel"
            data-delta="500"
            data-tip="歌词出现得太早：整体往后挪 0.5 秒"
            @click=${()=>fa(500)}
          >
            歌词快了 ${f("arrow-right")} 延后 0.5s
          </button>
          <button
            class="btn btn--sm nudge__feel"
            type="button"
            data-act="nudge-feel"
            data-delta="-500"
            data-tip="歌词出现得太晚：整体往前挪 0.5 秒"
            @click=${()=>fa(-500)}
          >
            歌词慢了 ${f("arrow-left")} 提前 0.5s
          </button>
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
            @input=${r=>ur(Number(r.target.value))}
          />
        </div>
        <div class="lyricspanel__list nudge__preview" data-nudge-preview @scroll=${()=>this.onFollowScroll()}>
          ${this.nudgePreview(e,n)}
        </div>
        <div class="lyricspanel__foot">
          <button class="btn btn--sm" type="button" data-act="nudge-reset" @click=${()=>fp()}>重置</button>
          <button
            class="btn btn--sm"
            type="button"
            data-act="nudge-guide"
            data-tip="微调介绍与使用指引"
            @click=${()=>hp()}
          >
            ${f("info")}说明
          </button>
          <span class="nudge__spacer"></span>
          <button class="btn btn--primary" type="button" data-act="nudge-apply" @click=${()=>this.applyNudge()}>
            应用到歌词
          </button>
        </div>
      </section>
    `}nudgePreview(e,n){if(!e.text)return c`
        <div class="lyricspanel__state">
          ${f("lyrics")}
          <div class="lyricspanel__state-title">这首歌还没有歌词</div>
          <div class="lyricspanel__state-desc">先用「在线匹配」找一份，或者切到「手动编辑」自己贴一份。</div>
          <div class="lyricspanel__state-actions">
            <button class="btn btn--sm" type="button" @click=${()=>sn("online")}>去在线匹配</button>
            <button class="btn btn--sm" type="button" @click=${()=>sn("edit")}>去手动编辑</button>
          </div>
        </div>
      `;const s=e.lines,a=dr(s,n);return Se(s,(r,o)=>o,(r,o)=>{const l=Math.max(0,r.time+n);return c`
          <div
            class="nudge__line${o===a?" is-active":""}"
            data-act="nudge-seek"
            data-ms=${l}
            data-index=${o}
          >
            <span class="nudge__time">${Qn(l).slice(1,-1)}</span>
            <span class="nudge__text">${Jn(r)}</span>
          </div>
        `})}paintNudgeFollow(){if(Y!=="nudge")return;const e=this.querySelector("[data-nudge-preview]");if(!e)return;const n=ke();if(!n.lines.length)return;const s=this._nudgeBox!==e;this._nudgeBox=e;const a=n.songId?Bt(n.songId):0,r=dr(n.lines,a);if(!s&&r===this._lastNudgeActive)return;this._lastNudgeActive=r;const o=e.querySelectorAll(".nudge__line");if(!o.length)return;let l=null;o.forEach(d=>{const p=Number(d.dataset.index)===r;d.classList.toggle("is-active",p),p&&(l=d)}),l&&this.followScroll(e,l,s)}editPane(){const e=_.lines.filter(o=>typeof o.time=="number").length,n=Ho(),s=_.lines.length-e,a=n?`草稿属于《${Ve(_.songId)?.title||"上一首"}》`:s>0&&e>0?`还有 ${s} 行没有时间`:"",r=n?"已切歌，草稿仍属于上一首":_.kept>0?`已沿用 ${_.kept} 行原有时间`:_.dirty?"未保存":"";return c`
      <section class="lyricspanel__pane" data-pane="edit" ?hidden=${Y!=="edit"}>
        <div class="editor__source">
          <button
            class="btn btn--sm"
            type="button"
            data-act="editor-text-open"
            data-tip="粘贴 / 修改歌词文本"
            @click=${()=>_p()}
          >
            ${f("edit")}编辑歌词文本
          </button>
          <span class="lyricspanel__hint" data-editor-source>
            ${_.lines.length?`共 ${_.lines.length} 行`:"还没有歌词文本"}
          </span>
          <span class="editor__spacer"></span>
          <button class="btn btn--sm" type="button" data-act="editor-clear-times" @click=${()=>gp()}>
            清空全部时间
          </button>
        </div>

        <div class="editor__transport">
          <button
            class="btn btn--icon"
            type="button"
            data-act="editor-play"
            data-tip="播放 / 暂停"
            @click=${()=>$p()}
          >
            ${f(i.playing?"pause":"play")}
          </button>
          <button
            class="btn btn--sm"
            type="button"
            data-act="editor-back"
            @click=${()=>Ee(Math.max(0,i.position-5e3))}
          >
            −5s
          </button>
          <button
            class="btn btn--sm"
            type="button"
            data-act="editor-fwd"
            @click=${()=>Ee(i.position+5e3)}
          >
            +5s
          </button>
          <span class="editor__clock" data-editor-clock>${Qn(i.position).slice(1,-1)}</span>
          <span class="editor__spacer"></span>
          <span class="lyricspanel__hint" data-editor-progress>已打轴 ${e} / ${_.lines.length}</span>
        </div>

        <button class="editor__tap" type="button" data-act="editor-tap" @click=${()=>ha()}>
          <span class="editor__tap-main">打轴并下一行</span>
          <span class="editor__tap-hint"><kbd>空格</kbd> 或点这里</span>
        </button>

        <div class="editor__tools">
          <button class="btn btn--sm" type="button" data-act="editor-undo" @click=${()=>mp()}>撤销</button>
          <button class="btn btn--sm" type="button" data-act="editor-prev" @click=${()=>pr(-1)}>
            上一行
          </button>
          <button class="btn btn--sm" type="button" data-act="editor-next" @click=${()=>pr(1)}>
            下一行
          </button>
          <span class="lyricspanel__hint" data-editor-tip>${r}</span>
        </div>

        <div class="editor__list" data-editor-list @scroll=${()=>this.onFollowScroll()}>${this.draftList()}</div>

        <div class="lyricspanel__foot">
          <button class="btn btn--sm" type="button" data-act="editor-copy" @click=${()=>this.copyLrc()}>
            复制 LRC
          </button>
          <span class="lyricspanel__hint" data-editor-save-hint>${a}</span>
          <button class="btn btn--primary" type="button" data-act="editor-save" @click=${()=>this.saveDraft()}>
            保存并应用
          </button>
        </div>
      </section>
    `}draftList(){return _.lines.length?Se(_.lines,(e,n)=>n,(e,n)=>{const s=typeof e.time=="number",a=["drow"];return n===_.cursor&&a.push("is-cursor"),s||a.push("is-untimed"),n===this._nowIndex&&a.push("is-now"),c`
          <div class=${a.join(" ")} data-act="editor-cursor" data-i=${n}>
            <span class="drow__no">${n+1}</span>
            <button
              class="drow__time"
              type="button"
              data-act="edit-seek"
              data-i=${n}
              data-tip="跳到这一句"
              @click=${r=>{r.stopPropagation(),yp(n)}}
            >
              ${s?Qn(e.time).slice(1,-1):"未打轴"}
            </button>
            <span class="drow__text">${e.text}</span>
            <button
              class="drow__clear"
              type="button"
              data-act="edit-clear"
              data-i=${n}
              aria-label="清除这一行的时间"
              ?hidden=${!s}
              @click=${r=>{r.stopPropagation(),vp(n)}}
            >
              ${f("close")}
            </button>
          </div>
        `}):c`<div class="editor__empty">
        还没有歌词文本。点上面的「编辑歌词文本」粘贴一份，或载入这首歌已有的歌词。
      </div>`}onClick(e){const n=e.target.closest("[data-act], [data-tab]");if(!n||!this.contains(n))return;const s=n.dataset.act,a=Number(n.dataset.i);switch(s){case"close":Ka();return;case"nudge-seek":Ee(Number(n.dataset.ms));return;case"editor-cursor":bp(a);return;case"editor-tap":ha();return}}onInput(e){const n=e.target;n.matches('[data-act="nudge-range"]')&&ur(Number(n.value))}onPanelKeyDown(e){if(!this.open||Y!=="edit"||e.key!==" "||e.ctrlKey||e.metaKey||e.altKey)return;const n=e.target;n&&(n.tagName==="TEXTAREA"||n.tagName==="INPUT")||this.contains(n)&&(e.preventDefault(),e.stopPropagation(),ha())}onFollowScroll(){Date.now()<this._followAutoUntil||(this._followHold=Date.now()+4e3)}followScroll(e,n,s=!1){if(!e||!n||!s&&Date.now()<this._followHold)return;const a=e.getBoundingClientRect(),r=n.getBoundingClientRect(),o=Math.max(0,e.scrollTop+(r.top-a.top)-(e.clientHeight-r.height)/2);Math.abs(e.scrollTop-o)<2||(this._followAutoUntil=Date.now()+700,e.scrollTo({top:o,behavior:"smooth"}))}prefillOnlineKeyword(){const e=an();if(!e)return;const n=[e.title,e.artist].filter(Boolean).join(" ").trim();!n||n===this._onlineKeyword||(this._onlineKeyword=n,N())}async refreshOnlineHint(){const e=await ua();if(e)try{const n=await e.LyricsProviders?.(),s=Array.isArray(n?.providers)?n.providers:[];s.length&&(this._lastOnlineHint="在线歌词来源："+_i(s),N())}catch{}}formatChip(e){const n=this._formats.get(Wn(e));return n==="word"?c`<span class="candidate__format candidate__format--word" title="带逐字时间轴，播放时按字点亮"
        >逐字</span
      >`:n==="line"?c`<span class="candidate__format" title="只有整行时间轴">逐行</span>`:n==="fail"?c`<span class="candidate__format candidate__format--pending" title="这条取不到歌词内容">未知</span>`:c`<span class="candidate__format candidate__format--pending">检测中…</span>`}async probeFormats(e,n){if(!e?.ProbeLyricsFormat||!this._candidates.length)return;const s=[...this._candidates].sort((a,r)=>+(a?.provider==="netease")-+(r?.provider==="netease"));for(const a of s){if(n!==this._searchSeq)return;const r=Wn(a);if(!(!r||this._formats.has(r))){try{const o=await e.ProbeLyricsFormat(a.provider,a.id);this._formats.set(r,o?.format==="word"?"word":"line")}catch{this._formats.set(r,"fail")}N()}}}async searchLyrics(){const e=(this._onlineKeyword||"").trim();if(!e){u("请输入歌词搜索关键词",{duration:1500});return}const n=await ua();if(!n){this._candidates=[],this._formats=new Map,this._onlineError="在线歌词服务不可用（需要应用后端）",this._searched=!0,N();return}const s=an();this._searching=!0,this._onlineError="",N();try{const a=await n.SearchLyrics(e,s?s.title:"",s?s.artist:"",s?s.duration:0);this._candidates=Array.isArray(a)?a:[],this._formats=new Map,this._searchSeq+=1}catch(a){this._candidates=[],this._formats=new Map,this._onlineError=String(a?.message||a)}finally{this._searching=!1,this._searched=!0,N()}this.probeFormats(n,this._searchSeq)}async applyCandidate(e){const n=this._candidates[e];if(!n)return;const s=an();if(!s){u("请先播放一首歌曲",{tone:"warning"});return}const a=await ua();if(!a){u("在线歌词服务暂不可用，请稍后再试",{tone:"error"});return}try{const r=await a.FetchLyrics(n.provider,n.id);if(!r||!r.lrc){u("没有取到歌词",{tone:"warning"});return}const o=await va(s.id,r.lrc,r.source||"online",{embed:i.config.embedMeta===!0});yt(s.id,0),_.songId="",pa(o,"歌词已应用并保存"),this.markApplied(Wn(n)),N()}catch(r){u("获取歌词失败："+(r.message||r),{tone:"error"})}}markApplied(e){e&&(this._appliedKey=e,N(),clearTimeout(this._appliedTimer),this._appliedTimer=setTimeout(()=>{this._appliedKey===e&&(this._appliedKey="",N())},2600))}async applyNudge(){const e=ke();if(!e.songId){u("请先播放一首歌曲",{tone:"warning"});return}const n=Bt(e.songId);if(!n){u("当前没有需要应用的调整",{duration:1800});return}if(!e.text){u("这首歌还没有歌词",{tone:"warning"});return}const s=Wc(e.text,n),a=await va(e.songId,s,"edit:offset",{embed:cr(e,this)});a!==!1&&(yt(e.songId,0),N(),pa(a,"已应用并保存"))}async ensureDraft(e=!1){const n=ke();!e&&_.songId===n.songId&&_.lines.length||(_.songId=n.songId,_.title=n.song?.title||"",_.lines=n.text?Li(n.text):[],_.cursor=0,_.undo=[],_.dirty=!1,_.kept=0,_.stale=!1,this._nowIndex=-1,this._lastScrolledNow=-1,this._lastScrolledCursor=-1,this._followHold=0,this._followAutoUntil=0,N())}applyDraftText(e){const n=Li(e||""),s=Kc(_.lines,n);if(!s.length)return u("文本是空的，没有可应用的歌词",{duration:1800}),!1;const a=s.filter((r,o)=>typeof r.time=="number"&&!(n[o]&&typeof n[o].time=="number")).length;return Os(),_.lines=s,_.cursor>=s.length&&(_.cursor=Math.max(0,s.length-1)),_.dirty=!0,_.kept=a,_.songId||(_.songId=ke().songId),this._nowIndex=-1,this._lastScrolledNow=-1,this._lastScrolledCursor=-1,N(),u(a?`已应用文本，沿用了 ${a} 行原有时间`:"已应用文本",{duration:2e3}),!0}setDraftText(e){const n=document.querySelector("#modal-backdrop [data-editor-text]");n&&(n.value=e),N()}async saveDraft(){const e=ke(_.songId);if(!e.songId){u("还没有可保存的内容：先播放一首歌再编辑",{tone:"warning"});return}const n=_.lines.filter(d=>typeof d.time=="number"&&Number.isFinite(d.time));if(!n.length){u("至少要先给一行打上时间",{tone:"warning"});return}const s=_.lines.length-n.length;let a=!1,r=-1/0;for(const d of _.lines)if(typeof d.time=="number"){if(d.time<r){a=!0;break}r=d.time}if(s||a){const d=c`
        ${s?c`<div class="lyricspanel__hint">
                还有 <b>${s}</b> 行没有时间：LRC 里没有时间标签的行会被忽略，保存后这些行不会显示。
              </div>`:x}
        ${a?c`<div class="lyricspanel__hint">时间不是升序，播放时高亮可能会跳来跳去。</div>`:x}
      `;if(!await kp({title:s?"还有歌词没有打轴":"时间不是升序",body:d,okText:"继续保存",cancelText:"返回编辑"}))return}const o=Ri(_.lines),l=await va(e.songId,o,"manual",{embed:cr(e,this)});l!==!1&&(yt(e.songId,0),_.undo=[],_.dirty=!1,_.songId=e.songId,N(),pa(l,"歌词已保存"))}async copyLrc(){const e=Ri(_.lines);if(!e){u("还没有可复制的歌词",{duration:1800});return}try{await navigator.clipboard.writeText(e),u("LRC 已复制到剪贴板",{tone:"success"})}catch{const n=document.createElement("textarea");n.value=e,n.style.cssText="position:fixed;left:-9999px;top:0;",document.body.appendChild(n),n.select();let s=!1;try{s=document.execCommand("copy")}catch{s=!1}n.remove(),u(s?"LRC 已复制到剪贴板":"复制失败，请手动选中文本",{tone:s?"success":"warning"})}}paintNowRow(){const e=performance.now();if(e-this._lastNowPaint<200)return;this._lastNowPaint=e;let n=-1;for(let s=0;s<_.lines.length;s+=1){const a=_.lines[s].time;typeof a=="number"&&a<=i.position&&(n=s)}n!==this._nowIndex&&(this._nowIndex=n,N())}paintEditorFollow(){this.paintNowRow(),this.scrollDraftRows()}scrollDraftRows(){const e=this.querySelector("[data-editor-list]");if(e){if(_.cursor!==this._lastScrolledCursor){const n=e.querySelector(`[data-i="${_.cursor}"]`);n&&(this._lastScrolledCursor=_.cursor,this.followScroll(e,n,!0))}if(this._nowIndex!==this._lastScrolledNow){const n=e.querySelector(`[data-i="${this._nowIndex}"]`);n&&this._nowIndex>=0&&(this._lastScrolledNow=this._nowIndex,this.followScroll(e,n))}}}}ee("mp-lyrics-panel",dp);let Bo=0;function N(){Bo+=1,fe()}const ot=()=>document.querySelector("mp-lyrics-panel");function Wn(t){return!t||!t.provider||!t.id?"":`${t.provider}:${t.id}`}function up(t){i.lyricsOpen=!0,N();const e=ot();e&&(e._refreshHeader(),e.prefillOnlineKeyword(),Ga().then(()=>{Y==="edit"&&e.ensureDraft(!0),Y==="online"&&e.refreshOnlineHint(),N()}))}function Ka(){i.lyricsOpen=!1;const t=ke();t.songId&&Bt(t.songId)&&(yt(t.songId,0),u("未应用的微调已丢弃",{duration:1800})),N()}function Fo(t){i.lyricsOpen?Ka():up()}function sn(t){Y=t==="nudge"||t==="edit"?t:"online";const e=ot();e&&(Y==="edit"&&e.ensureDraft().then(()=>N()),Y==="online"&&e.refreshOnlineHint?.()),N()}function an(){return Ve(i.currentId)||null}function pp(t){return String(t?.ext||"").replace(/^\./,"").toLowerCase()}function cr(t,e){const n=e?.querySelector("[data-embed-toggle]"),s=e?.querySelector("[data-notice-opt]");return(t.source==="embedded"||t.source==="lrc-file")&&s&&n?!!n.checked:i.config.embedMeta===!0}function dr(t,e){let n=-1;for(let s=0;s<t.length&&t[s].time+e<=i.position;s+=1)n=s;return n}function yi(){return{lower:-1e4,upper:1e4}}function fa(t){const e=ke();if(!e.songId){u("请先播放一首歌曲",{tone:"warning"});return}if(!e.text){u("这首歌还没有歌词，先去在线匹配或手动编辑",{tone:"warning",duration:2600});return}const n=yi(),s=Math.max(n.lower,Math.min(n.upper,Bt(e.songId)+t));yt(e.songId,s),N()}function ur(t){const e=ke();if(!e.songId||!e.text)return;const n=yi(),s=Math.max(n.lower,Math.min(n.upper,Math.round(Number(t)||0)));yt(e.songId,s),N()}function fp(){const t=ke();t.songId&&(yt(t.songId,0),N())}function hp(){K({title:"歌词微调：介绍与指引",body:c`
      <div class="lguide">
        <section class="lguide__sec">
          <h4 class="lguide__title">微调在改什么</h4>
          <p class="lguide__text">
            把整首歌的歌词时间轴一起平移，<b>不改歌词文字</b>。适合「整首歌都偏早或都偏晚」的情况：
            歌词来源的时间轴本来就不准，或者蓝牙 / 外放有明显的出声延迟。
          </p>
        </section>
        <section class="lguide__sec">
          <h4 class="lguide__title">怎么判断该往哪边调</h4>
          <p class="lguide__text">听副歌的第一句，看是歌词先出来还是人声先出来：</p>
          <div class="lguide__kv">
            <span class="lguide__k">歌词先出现</span><span>歌词快了 → 点「歌词快了 → 延后 0.5s」</span>
          </div>
          <div class="lguide__kv">
            <span class="lguide__k">歌词后出现</span><span>歌词慢了 → 点「歌词慢了 → 提前 0.5s」</span>
          </div>
        </section>
        <section class="lguide__sec">
          <h4 class="lguide__title">界面上的数字</h4>
          <div class="lguide__kv"><span class="lguide__k">+0.50 秒</span><span>整体延后，歌词出现得更晚</span></div>
          <div class="lguide__kv"><span class="lguide__k">−0.50 秒</span><span>整体提前，歌词出现得更早</span></div>
          <p class="lguide__text">
            6 个按钮是常用档位（±0.1 / ±0.5 / ±1.0 秒），下面是连续滑条，范围 ±10 秒。
            负偏移时靠近开头的那几行会被压到 0:00，界面会提示有几行受影响。
          </p>
        </section>
        <section class="lguide__sec">
          <h4 class="lguide__title">预览区怎么用</h4>
          <p class="lguide__text">
            高亮的那一行就是当前唱到的那句，它会跟着播放实时前进 —— 调整偏移后盯着它，
            就能看出歌词是变早了还是变晚了。点任意一行会跳到那一句，方便反复对比。
          </p>
        </section>
        <section class="lguide__sec">
          <h4 class="lguide__title">微调还是手动编辑</h4>
          <p class="lguide__text">
            只有少数几句对不上（某句没打轴、某句错位）用「手动编辑」逐行修正；
            整首歌统一偏移才用微调。两者都改不了「来源优先级」—— 如果这首歌的歌词来自内嵌歌词或同目录
            .lrc，界面会提示要不要同时写入歌曲文件。
          </p>
        </section>
        <section class="lguide__sec">
          <h4 class="lguide__title">什么时候真的写进去</h4>
          <p class="lguide__text">
            点「应用到歌词」才会保存：先写歌词缓存，设置允许时同时写入歌曲文件。
            直接关掉面板会丢弃未应用的调整，歌词回到原样。
          </p>
        </section>
      </div>
    `,okText:"知道了"}).root.classList.add("modal--wide","modal--scroll","modal--single")}function Os(){_.undo.push({lines:_.lines.map(t=>({...t})),cursor:_.cursor}),_.undo.length>50&&_.undo.shift()}function mp(){const t=_.undo.pop();if(!t){u("没有可撤销的操作",{duration:1500});return}_.lines=t.lines,_.cursor=Math.min(t.cursor,Math.max(0,t.lines.length-1)),_.dirty=!0,ot()?.setDraftText(Pn()),N()}function Pn(){return _.lines.map(t=>typeof t.time=="number"?Qn(t.time)+t.text:t.text).join(`
`)}function pr(t){if(!_.lines.length)return;const e=Math.max(0,Math.min(_.lines.length-1,_.cursor+t));e!==_.cursor&&(_.cursor=e,N())}function Uo(t){!Number.isFinite(t)||t<0||t>=_.lines.length||t===_.cursor||(_.cursor=t,N())}function bp(t){Uo(t);const e=_.lines[t];e&&typeof e.time=="number"&&Ee(e.time);const n=ot();n&&(n._followHold=Date.now()+4e3)}function ha(){if(!_.lines.length){u("先点「编辑歌词文本」把歌词贴进来",{tone:"warning",duration:2600});return}if(Ho()){u("已切歌：先决定这份草稿怎么办（保存它，或点「载入当前歌词」重来）",{tone:"warning",duration:4200});return}const t=_.lines[_.cursor];t&&(Os(),t.time=Math.round(i.position/10)*10,_.dirty=!0,_.cursor<_.lines.length-1&&(_.cursor+=1),ot()?.setDraftText(Pn()),N())}function vp(t){const e=_.lines[t];!e||typeof e.time!="number"||(Os(),e.time=null,_.dirty=!0,ot()?.setDraftText(Pn()),N())}function gp(){_.lines.length&&(Os(),_.lines.forEach(t=>{t.time=null}),_.cursor=0,_.dirty=!0,ot()?.setDraftText(Pn()),u("已清空全部时间，可以重新打轴",{duration:2e3}),N())}function _p(){const t=ke(),e=_.lines.length?Pn():t.text||"",n=K({title:"编辑歌词文本",desc:"一行一句，纯文本即可；已经打过轴的行会带上 [mm:ss.xx] 时间标签。改完点「应用文本」回到打轴列表。",body:c`
      <div class="lyricspanel__row lyricspanel__row--between">
        <span class="lyricspanel__hint">共 ${_.lines.length} 行</span>
        <span class="lyricspanel__row-actions">
          <button
            class="btn btn--sm"
            type="button"
            data-act="modal-load"
            @click=${a=>fr(a,t.text||"")}
          >
            载入当前歌词
          </button>
          <button class="btn btn--sm" type="button" data-act="modal-clear" @click=${a=>fr(a,"")}>
            清空文本
          </button>
        </span>
      </div>
      <textarea
        class="editor__text editor__text--modal"
        data-editor-text
        spellcheck="false"
        placeholder="第一句&#10;第二句&#10;第三句&#10;…"
      ></textarea>
    `,okText:"应用文本",cancelText:"取消",onOk:(a,r)=>{const o=r.querySelector("[data-editor-text]");return ot()?.applyDraftText(o?o.value:"")!==!1}});n.root.classList.add("modal--wide","modal--scroll");const s=n.root.querySelector("[data-editor-text]");s&&(s.value=e)}function fr(t,e){const s=t.target.closest(".modal")?.querySelector("[data-editor-text]");s&&(s.value=e,s.focus())}function yp(t){const e=_.lines[t];if(!e)return;let n=e.time;if(typeof n!="number"){for(let s=t-1;s>=0;s-=1)if(typeof _.lines[s].time=="number"){n=_.lines[s].time;break}}if(typeof n!="number"){u("这一行还没有时间，无法跳转",{duration:1600});return}Ee(n),Uo(t)}function Ho(){return!!_.songId&&ke().songId!==_.songId&&wp()}function wp(){return _.lines.some(t=>typeof t.time=="number")}function $p(){Gt()}function kp({title:t,body:e,okText:n,cancelText:s}){return new Promise(a=>{let r=!1;const o=l=>{r||(r=!0,a(l))};K({title:t,body:e,okText:n,cancelText:s,onOk:()=>(o(!0),!0),onCancel:()=>(o(!1),!0)})})}function Sp(){return Math.round(si()*1.3)}const hr="/skins/",xp={loading:"歌词匹配中…",matching:"歌词匹配中…",failed:"歌词匹配失败",none:"暂无歌词"},wi=300;class zo extends Map{constructor(e,n){super(n),this.max=e}set(e,n){for(super.has(e)&&super.delete(e),super.set(e,n);this.size>this.max;){const s=super.keys().next();if(s.done)break;super.delete(s.value)}return this}touch(e){if(!super.has(e))return;const n=super.get(e);return this.set(e,n),n}}class Cp extends Set{constructor(e,n){super(n),this.max=e}add(e){if(super.has(e))return this;for(super.add(e);this.size>this.max;){const n=super.values().next();if(n.done)break;super.delete(n.value)}return this}}const pe=new zo(wi),ja=new Cp(wi),ma=new Set;function Tp(t,e){if(!t?.id)return;const n=pe.get(t.id)||{lines:[],text:"",source:"none"};n.status!==e&&(pe.set(t.id,{...n,status:e}),M.lyricsStatus=null,Z()?.id===t.id&&he({type:"lyrics",...De()}))}function Z(){return Ve(i.currentId)}function ba(){const t=i.config.lyricsSources;return!Array.isArray(t)||!t.length?!0:t.includes("online")}async function Wo(t){if(!t)return{lines:[],text:"",source:"none",status:"none"};if(pe.has(t.id))return pe.get(t.id);let e="",n="none",s=!1;if(pe.set(t.id,{lines:[],text:"",source:"none",status:"loading"}),$()){const r=await b.loadLyrics(t.id);r&&typeof r=="object"&&typeof r.lrc=="string"?(e=r.lrc,n=r.source||"backend"):typeof r=="string"&&(e=r,n="backend"),s=!!e,!e&&ba()&&(Tp(t,"matching"),e=await Ep(t),e&&(n="online"))}if(!e){if($()){const o=ba()?"failed":"none",l={lines:[],text:"",source:"none",status:o};return pe.set(t.id,l),l}const r=i.songs.findIndex(o=>o.id===t.id);e=r===0?Fl:r===1?Ul:Ap(t),n="preview"}const a={lines:ps(e),text:e,source:n,status:"ok"};return pe.set(t.id,a),$()&&s&&ba()&&!Ko(a)&&Ip(t),a}function Ko(t){return!!t?.lines?.some(e=>Array.isArray(e.words)&&e.words.length)}async function Ip(t){try{const e=await b.lyricsUpgradeWord(t.id),n=typeof e?.lrc=="string"?e.lrc:"";if(!n)return;const s={lines:ps(n),text:n,source:e?.source||"online",status:"ok"};if(!Ko(s))return;pe.set(t.id,s),M.lyricsText=null,Z()?.id===t.id&&he({type:"lyrics",...De()})}catch(e){console.warn("[lyrics] 逐字歌词升级失败",e)}}async function Ep(t){if(ja.has(t.id))return"";ja.add(t.id);try{if(t.online){const n=await b.onlineLyrics(t.title||"",t.artist||"",t.duration||0),s=typeof n?.lrc=="string"?n.lrc:"";return s?(b.lyricsSave(t.id,s,n?.source||"online",!1).catch(()=>{}),s):""}const e=await b.lyricsAutoMatch(t.id);return typeof e?.lrc=="string"?e.lrc:""}catch(e){return console.warn("[lyrics] 在线自动匹配失败",e),""}}function Ap(t){const e=[];for(let n=12;n<Math.max(60,Math.floor((t.duration||18e4)/1e3)-10);n+=9)e.push(`[00:${String(n).padStart(2,"0")}.00]（${t.title} · 暂无歌词文件，接入后端后可读取 .lrc 或内嵌歌词）`);return e.join(`
`)}const Va=new zo(wi);function Bt(t){return Va.get(t)||0}function yt(t,e){if(!t)return 0;const n=Math.round(Number(e)||0);return n?Va.set(t,n):Va.delete(t),M.lyricsText=null,w.skinHost&&Z()?.id===t&&he({type:"lyrics",...De()}),n}let Kn={songId:"",offset:0,lines:[]};function Ls(t){const n=(t?pe.get(t.id):null)?.lines||[],s=Bt(t?.id);if(!s||!n.length)return n;if(Kn.songId===t.id&&Kn.offset===s)return Kn.lines;const a=n.map(r=>{const o={time:r.time+s,text:r.text};return r.trans&&(o.trans=r.trans),r.words&&(o.words=r.words.map(l=>l+s)),o});return Kn={songId:t.id,offset:s,lines:a},a}function ke(t){const e=t?Ve(t):Z(),n=e?pe.get(e.id):null;return{song:e||null,songId:e?.id||"",text:n?.text||"",source:n?.source||"none",status:n?.status||(n?.lines?.length?"ok":"none"),lines:n?.lines||[]}}function mr(t){switch(t){case"embedded":return"内嵌歌词";case"lrc-file":return"同目录 .lrc";case"cache":return"歌词缓存";case"online":return"在线自动匹配";case"manual":return"手动编辑";case"preview":return"预览数据";default:return"暂无"}}async function Ga(){const t=Z();if(!(!t||pe.has(t.id)||ma.has(t.id))){ma.add(t.id);try{await Wo(t)}finally{ma.delete(t.id)}}}function Dp(){const t={text:"",chars:[],trans:[],words:[],wordEnds:[]},e=Z();if(!e)return t;const n=Ls(e);if(!n.length)return t;const s=Es(n,i.position);if(s<0)return t;const a=n[s],r=String(a.text??""),o=Array.isArray(a.words)&&a.words.length?a.words:[],l=o.length?Jc(r):[],d=l.length===o.length;return{text:r,chars:d?l:[],trans:Array.isArray(a.trans)?a.trans.filter(Boolean):[],words:d?o:[],wordEnds:d?Zc(o,n[s+1]?.time):[]}}function Mp(){const t={prev:"",text:"",next:""},e=Z();if(!e)return t;const n=Ls(e);if(!n.length)return t;const s=Es(n,i.position);return s<0?t:{prev:Jn(n[s-1])||"",text:Jn(n[s])||"",next:Jn(n[s+1])||""}}async function va(t,e,n="online",s={}){if(!t||!e)return!1;pe.set(t,{lines:ps(e),text:e,source:n,status:"ok"}),ja.add(t),M.lyricsText=null,M.lyricsStatus=null;let a=null;if(!s.transient&&$()){const r=s.embed??i.config.embedMeta===!0;try{const o=await b.lyricsSave(t,e,n,r);a=o||null;const l=typeof o?.lrc=="string"&&o.lrc?o.lrc:e;l!==e&&(pe.set(t,{lines:ps(l),text:l,source:n,status:"ok"}),M.lyricsText=null,M.lyricsStatus=null)}catch(o){console.warn("[lyrics] 写入缓存失败",o)}}return w.skinHost&&Z()?.id===t&&he({type:"lyrics",...De()}),a||{ok:!0}}const Ya=[],ga=new Set;let os=null;async function $i(){return os||(os=Lp()),os}async function Pp(){try{await $i()}catch(t){console.warn("[skins] 启动扫描样式失败",t)}return Yo(),Sn()}async function Op(){if($()){const t=await b.listSkins();let e="";try{e=String(await b.skinsToken()||"")}catch(n){console.warn("[skins] 读取皮肤访问令牌失败",n)}return{items:Array.isArray(t)?t:[],base:n=>`${hr}${encodeURIComponent(n)}/`,suffix:e?`?t=${encodeURIComponent(e)}`:""}}try{const t=await fetch("/preview-skins/__list.json",{cache:"no-store"});if(!t.ok)throw new Error(`HTTP ${t.status}`);const e=await t.json();return{items:Array.isArray(e)?e:[],base:n=>`/preview-skins/${encodeURIComponent(n)}/`,suffix:""}}catch(t){return console.warn("[skins] 预览模式读取样式清单失败",t),{items:[],base:e=>`${hr}${encodeURIComponent(e)}/`,suffix:""}}}async function Lp(){try{const{items:t,base:e,suffix:n}=await Op();Ya.length=0;const s=new Set;jc();for(const a of t){if(!a?.id||!a?.module||!a?.manifest)continue;const r=e(a.id),o=d=>r+String(d).replace(/^\/+/,"")+n,l=a.manifest?.icon?.file;try{await Vc({manifest:a.manifest,moduleUrl:o(a.module),cssUrls:(Array.isArray(a.styles)?a.styles:[]).map(o),iconUrl:l?o(l):"",builtin:a.builtin===!0,source:a.source||""}),a.builtin===!0?Gc(Yc(a.id)):ga.add(a.id),s.add(a.id)}catch(d){Ya.push({id:a.id,reason:d?.message??String(d)}),console.warn(`[skins] 样式「${a.id}」加载失败：`,d)}}for(const a of[...ga])s.has(a)||(ga.delete(a),Xc(a))}catch(t){console.warn("[skins] 皮肤目录扫描失败",t)}return Sn()}async function Rs(){os=null,await $i(),Yo()}async function Rp(t){await b.deleteSkin(t),await Rs();const e=Sn().some(n=>n.id===t);return!e&&(i.pvMode===t||i.config.playerViewMode===t)&&Kt(Is("").skin?.id||""),{removed:!e,skinIds:Sn().map(n=>n.id)}}function jo(){return Ya.slice()}let Vo=0;function Go(){return Vo}function Yo(){Vo+=1,fe()}const w={view:null,stage:null,backgroundRoot:null,skinHost:null,get skin(){return w.skinHost?.skin||null},get mountedId(){return w.skinHost?.mountedId||null},closeTimer:null,resizeObserver:null,themeObserver:null,carouselTimer:null,carouselIndex:0,carouselLastAdvance:0,carouselSongId:null},M={songId:null,cover:null,lyricsText:null,lyricsStatus:null,options:null,playing:null,themeId:null};function ki(){return{position:i.position,duration:i.duration,playing:i.playing,volume:i.volume,muted:i.muted}}function Si(t){if(!t)return[Cs];const e=i.coverSets.get(t.id)?.items,n=Array.isArray(e)?e.map(s=>s.preview).filter(Boolean):[];return n.length?n:[kt(t)]}function Np(t){return t?Es(Ls(t),i.position):-1}function Xo(t){const e=t?pe.get(t.id):null,n=Ls(t),s=e?.status||(n.length?"ok":"none");return{lines:n,text:e?.text||"",source:e?.source||"none",status:s,statusText:n.length?"":xp[s]||"暂无歌词",index:Es(n,i.position)}}function qp(t){return t?{id:t.id??"",title:t.title||"",artist:t.artist||"",album:t.album||"",duration:t.duration||0,kind:t.online?"online":"local"}:null}function De(){const t=Z(),e=Si(t),n=ht(w.carouselIndex,0,Math.max(0,e.length-1));return{song:qp(t),cover:e[n]||Cs,covers:e,coverIndex:n,lyrics:Xo(t)}}function xi(){return{showLyrics:i.config.showLyrics!==!1,lyricsFontSize:i.config.lyricsFontSize,animations:i.config.animations!==!1,coverCarousel:i.config.coverCarousel===!0,coverCarouselInterval:Jo().seconds,interactive:!0,performanceMode:i.config.skinPerformanceMode==="performance"?"performance":"smooth"}}function Bp(){return De()}function Qo(){return ki()}function Fp(t={}){return{...xi(),...t}}function Up(){return w.skinHost||(w.skinHost=Qc({root:w.stage,backgroundRoot:w.backgroundRoot,view:w.view,app:document.getElementById("app"),source:{playback:ki,media:De,options:xi,env:Hp,defaultCover:Cs,spectrum:()=>i.playing?Qu():null,actions:{seek(t){Ee(t),ls({force:!0})},seekBy(t){Ee(Math.max(0,Number(i.position||0)+Number(t||0))),ls({force:!0})},seekRatio(t){const e=Math.max(0,Math.min(1,Number(t)||0));i.duration&&(Ee(e*i.duration),ls({force:!0}))},togglePlay:Gt,next:()=>Ut(!1),prev:()=>ai(),toggleLike(){const t=Z();t&&_t(t.id)},like(){const t=Z();t&&!st(t.id)&&_t(t.id)},unlike(){const t=Z();t&&st(t.id)&&_t(t.id)},openFolder(){const t=Z();t?.path&&b.revealInExplorer(t.path).catch(()=>{})},openCoverPanel(){const t=Z();!t||t.online||$t(()=>Promise.resolve().then(()=>Ii),[]).then(e=>e.openCoverPanel(t.id))},openLyricsPanel(){Fo()},reportBackdrop(t){const e=w.skin;!e||!t||typeof t!="object"||(e.colors={...e.colors,...t},e.chrome=ed(e.colors),w.skinHost?.applyChrome(i.playerOpen&&!w.view?.hidden))}}}})),w.skinHost}function Hp(){const t=w.stage?.getBoundingClientRect?.()||{width:0,height:0};return{themeId:document.documentElement.dataset.theme||"",mode:document.documentElement.dataset.mode==="light"?"light":"dark",width:Math.round(t.width||0),height:Math.round(t.height||0),dpr:Number(window.devicePixelRatio)||1,reducedMotion:!!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,foreground:!!i.playerOpen&&!w.view?.hidden}}function he(t){w.skinHost?.push(t)}function zp(t){const{skin:e,fellBack:n}=Is(t);e&&(n&&console.warn(`[skins] 样式「${t}」不存在，已回退到「${e.name}」`),i.pvMode=e.id,document.getElementById("app")?.setAttribute("data-mode",e.id),Up().mount(e),w.skinHost.applyChrome(i.playerOpen&&!w.view?.hidden),Kp(),Xa("closed"))}function Xa(t){const e=w.backgroundRoot;e&&(e.dataset.state=t)}function Wp(){w.skin&&(w.skinHost?.unmount(),w.resizeObserver&&(w.resizeObserver.disconnect(),w.resizeObserver=null),w.carouselTimer&&(clearInterval(w.carouselTimer),w.carouselTimer=null))}function Kp(){w.resizeObserver||typeof ResizeObserver!="function"||(w.resizeObserver=new ResizeObserver(()=>{const t=w.stage.getBoundingClientRect();he({type:"resize",width:Math.round(t.width),height:Math.round(t.height)})}),w.resizeObserver.observe(w.stage,{box:"border-box"}))}function Jo(){const t=Number(i.config.coverCarouselInterval),e=Number.isFinite(t)&&t>0?Math.max(2,t):10;return{enabled:i.config.coverCarousel===!0,seconds:e,intervalMs:e*1e3}}function jp(){const t=Z();w.carouselSongId!==(t?.id??null)&&(w.carouselSongId=t?.id??null,w.carouselIndex=i.coverSets.get(t?.id)?.active??0,w.carouselLastAdvance=Date.now());const{enabled:e,intervalMs:n}=Jo(),s=Si(t);!e||!i.playerOpen||!i.playing||s.length<2||Date.now()-w.carouselLastAdvance<n||(w.carouselLastAdvance=Date.now(),w.carouselIndex=(w.carouselIndex+1)%s.length,he({type:"media",...De()}))}function Vp(){w.carouselTimer||(w.carouselTimer=setInterval(jp,1e3))}function Gp(){const t=Si(Z());return t.length<2?!1:(w.carouselIndex=(w.carouselIndex+1)%t.length,w.carouselLastAdvance=Date.now(),he({type:"media",...De()}),!0)}function br(){M.cover=null,w.skinHost&&he({type:"media",...De()})}function _a(t={},e=t.type==="song"||t.type==="lyrics"||t.type==="media"){const n=De(),s=n.cover!==M.cover||n.song?.id!==M.songId;M.cover=n.cover,!(!s&&!e)&&he({...t,...n})}function vr(){const t=xi();M.options&&M.options.showLyrics===t.showLyrics&&M.options.lyricsFontSize===t.lyricsFontSize&&M.options.animations===t.animations&&M.options.coverCarousel===t.coverCarousel&&M.options.coverCarouselInterval===t.coverCarouselInterval&&M.options.interactive===t.interactive&&M.options.performanceMode===t.performanceMode||(M.options=t,he({type:"options",options:t}))}function gr(){const t=!!i.playerOpen&&!!w.view?.dataset.theme;return w.skinHost?.applyChrome(t)??!1}async function _r(){if(!w.view){if(w.view=Ai("#playerview"),w.stage=Ai("#playerview-stage"),w.backgroundRoot=document.getElementById("skin-background"),!w.view||!w.stage)return;Yp(),Vp()}const t=w.view,e=Z();if(!!!i.playerOpen){t.dataset.state!=="closed"&&(t.dataset.state="closed",gr(),Xa("closed"),w.closeTimer&&clearTimeout(w.closeTimer),w.closeTimer=setTimeout(()=>{w.closeTimer=null,!i.playerOpen&&(t.hidden=!0,Wp(),xs())},Sp()+20));return}w.closeTimer&&(clearTimeout(w.closeTimer),w.closeTimer=null),t.hidden=!1,await $i();const s=i.pvMode||i.config.playerViewMode||"",a=w.mountedId!==s;if(a&&(zp(s),xs()),(t.dataset.state!=="opened"||a)&&(t.offsetHeight,t.dataset.state="opened",Xa("opened"),gr()),!w.skin)return;if(M.songId!==(e?.id??null)){M.songId=e?.id??null,M.cover=null,M.lyricsText=null,w.carouselSongId=e?.id??null,w.carouselIndex=i.coverSets.get(e?.id)?.active??0,_a({type:"song"});const o=e?.id??null,l=await Wo(e);if((Z()?.id??null)!==o)return;M.lyricsText=l.text,M.lyricsStatus=l.status||"",_a({type:"lyrics"}),vr();return}_a({type:"media"},!1);const r=Xo(e);(r.text!==M.lyricsText||r.status!==M.lyricsStatus)&&(M.lyricsText=r.text,M.lyricsStatus=r.status,he({type:"lyrics",...De()})),vr(),ls()}function xs(){M.songId=null,M.cover=null,M.lyricsText=null,M.lyricsStatus=null,M.options=null,M.playing=null}function ls({force:t=!1,lyricIndex:e}={}){if(!i.playerOpen||!w.skin)return;const n=ki();(M.playing!==n.playing||t)&&(M.playing=n.playing,he({type:"state",...n}));const s=typeof e=="number"?e:Np(Z());he({type:"progress",...n,lyricIndex:s})}function Yp(){w.themeObserver||(M.themeId=document.documentElement.dataset.theme||"",w.themeObserver=new MutationObserver(()=>{const t=document.documentElement.dataset.theme||"",e=document.documentElement.dataset.mode||"dark";t!==M.themeId&&(M.themeId=t,he({type:"theme",themeId:t,mode:e}))}),w.themeObserver.observe(document.documentElement,{attributes:!0,attributeFilter:["data-theme","data-mode"]}))}function Kt(t){const{skin:e,fellBack:n}=Is(t);e&&(i.pvMode=e.id,i.config.playerViewMode=e.id,xs(),k(),n&&console.warn(`[skins] 样式「${t}」不可用，已切换到「${e.name}」`))}function Zo(){i.playerOpen=!0,i.pvMode=Is(i.config.playerViewMode||"").skin?.id||i.pvMode,xs(),k()}function Ns(){i.playerOpen=!1,k()}function Qa(){i.playerOpen?Ns():Zo()}function jt(){return Sn().map(t=>({id:t.id,name:t.name,icon:t.icon||"disc",iconUrl:t.iconUrl||"",builtin:t.builtin===!0,source:t.source||"",version:t.version||"",author:t.author||"",description:t.description||"",colorsMissing:Array.isArray(t.colorsMissing)?t.colorsMissing.slice():[],chrome:t.chrome||null,background:t.background===!0,spectrum:t.spectrum||!1}))}const Xp=/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,Qp=/^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/]+\)$/i;function yr(t){const e=String(t??"").trim();return Xp.test(e)||Qp.test(e)?e:""}function Jp(t){const e=[];for(const n of t)for(const s of n?.swatch||[]){const a=yr(s);a&&!e.includes(a)&&e.push(a)}return Ts("packstore-swatches",e.map((n,s)=>`[data-packswatch="${s}"]{background:${n}}`).join(`
`)),n=>(n?.swatch||[]).map(yr).filter(Boolean).map(s=>e.indexOf(s))}class Zp extends me{static deps(){return[]}constructor(){super(),this.kind="theme",this.localBody=x,this.onChanged=null,this._tab="local",this._status="idle",this._items=[],this._swatchIndex=()=>[],this._cached=!1,this._stale="",this._error="",this._busy="",this._source={source:"",default:"",channel:""},this._editing=!1,this._draft=""}open(e){this.kind=e.kind==="style"?"style":"theme",this.localBody=e.localBody??x,this.onChanged=e.onChanged??null,this._tab="local",this._status="idle"}get _kindLabel(){return this.kind==="style"?"样式包":"主题"}_ensureRepo(){this._status==="idle"&&(this._loadSource(),this.load(!1))}get _canEditSource(){return this._status==="ok"||this._status==="error"}async _loadSource(){try{const e=await b.packSource();e&&(this._source={source:String(e.source||""),default:String(e.default||""),channel:String(e.channel||""),problem:String(e.problem||"")},this._draft=this._source.source,this.requestUpdate())}catch(e){console.warn("[packstore] 读取插件仓库地址失败",e)}}async load(e){this._status="loading",this._error="",this.requestUpdate(),this._loadSource();try{const n=await b.packCatalog(this.kind,e===!0);if(!n){this._status="preview",this.requestUpdate();return}this._items=Array.isArray(n.items)?n.items:[],this._swatchIndex=Jp(this._items),this._cached=n.cached===!0,this._stale=String(n.staleReason||""),this._status="ok"}catch(n){this._error=n?.message||String(n),this._cached=!1,this._stale="",this._status="error"}this.requestUpdate()}_installedIds(){const e=this.kind==="style"?jt():Yt();return new Set(e.map(n=>n.id))}_localVersion(e){if(this.kind!=="style")return"";const n=jt().find(s=>s.id===e);return String(n?.version||"")}async install(e){if(this._busy)return;const n=String(e?.id||"");if(!n)return;this._busy=n,this.requestUpdate();const s=u(`正在安装「${e.name||n}」…`,{duration:0});try{const a=await b.packInstall(this.kind,n);s.close(),await this._refreshLocal();const r=e.name||n,o=Array.isArray(a?.backups)?a.backups.length:0;u(`已安装「${r}」${o?`（有 ${o} 个原文件备份成了 .bak）`:""}`,{tone:"success",duration:4200})}catch(a){s.close(),u(`安装失败：${a?.message??a}`,{tone:"error",duration:6e3})}this._busy="",this.requestUpdate()}async _refreshLocal(){try{this.kind==="style"?await Rs():await An()}catch(e){console.warn("[packstore] 重扫本机插件失败（安装结果不受影响）",e)}this.onChanged?.()}_startEdit(){this._editing=!0,this._draft=this._source.source,this.requestUpdate(),this.updateComplete.then(()=>this.$(".packsrc__input")?.focus())}_onSrcInput(e){this._draft=String(e.target.value??"")}_cancelEdit(){this._editing=!1,this.requestUpdate()}_onSrcKey(e){if(e.key==="Enter"){e.preventDefault(),e.stopPropagation(),this._saveSource();return}e.key==="Escape"&&(e.stopPropagation(),this._editing=!1,this.requestUpdate())}async _saveSource(){const e=this._draft.trim();try{const n=await b.packSetSource(e);n&&(this._source={source:String(n.source||""),default:String(n.default||""),channel:String(n.channel||""),problem:String(n.problem||"")}),this._editing=!1,this.requestUpdate(),this._source.problem?u(this._source.problem,{tone:"error",duration:7e3}):u(`插件仓库已指向 ${this._source.source}`,{tone:"success",duration:3600}),this._items=[],this._status="loading",this.load(!0)}catch(n){u(`保存失败：${n?.message??n}`,{tone:"error",duration:6e3})}}render(){return c` <div class="packdlg">
      <div class="packtabs" role="tablist">
        ${this._tabButton("local","从本地导入")} ${this._tabButton("repo","从仓库获取")}
      </div>
      ${this._tab==="repo"?this._repoPanel():this.localBody}
    </div>`}_tabButton(e,n){const s=this._tab===e;return c`<button
      class="packtab"
      type="button"
      role="tab"
      data-tab=${e}
      data-active=${String(s)}
      aria-selected=${String(s)}
      @click=${()=>{this._tab=e,e==="repo"&&this._ensureRepo(),this.requestUpdate()}}
    >
      ${n}
    </button>`}_repoPanel(){return c`
      <div class="packsrc">
        <span class="packsrc__label">来源</span>
        ${this._editing?c`<input
                  class="input packsrc__input"
                  type="text"
                  .value=${this._draft}
                  placeholder="https://raw.githubusercontent.com/<owner>/<repo>/<branch>/plugins"
                  @input=${e=>this._onSrcInput(e)}
                  @keydown=${e=>this._onSrcKey(e)}
                />
                <button class="btn btn--sm btn--primary" type="button" @click=${()=>this._saveSource()}>
                  保存
                </button>
                <button class="btn btn--sm" type="button" @click=${()=>this._cancelEdit()}>取消</button>`:c`<span class="packsrc__url" title=${this._source.source}
                  >${this._source.source||"（默认地址）"}</span
                >
                ${this._canEditSource?c`<button class="btn btn--sm" type="button" @click=${()=>this._startEdit()}>修改</button>`:x}`}
        <button
          class="btn btn--sm"
          type="button"
          ?disabled=${this._status==="loading"}
          @click=${()=>this.load(!0)}
        >
          ${f("refresh")}<span>刷新</span>
        </button>
      </div>

      ${this._source.problem?c`<div class="packnote" data-tone="warn" role="alert">
              ${this._source.problem}（明文 http 取回的脚本会在同源页面里执行，链路上任何一跳都能改写它）
            </div>`:x}
      ${this._status==="preview"?c`<div class="packnote" data-tone="warn">
              拿不到仓库清单：没有后端（浏览器预览），或者后端还没就绪。请在播放器里打开这个面板，或点「刷新」重试。
            </div>`:x}
      ${this._cached?c`<div class="packnote" data-tone="warn">
              <b>这是本机缓存的清单</b>，刚才没能连上仓库：${this._stale}
            </div>`:x}
      ${this._status==="error"?c`<div class="packnote" data-tone="error">获取清单失败：${this._error}</div>`:x}
      ${this._status==="loading"?c`<div class="packnote">正在获取清单…</div>`:x}
      ${this._status==="ok"?this._list():x}
    `}_list(){if(!this._items.length)return c`<div class="packnote">仓库里还没有${this._kindLabel}。</div>`;const e=this._installedIds();return c` <div class="packlist">${this._items.map(n=>this._item(n,e))}</div>`}_item(e,n){const s=String(e?.id||""),a=n.has(s),r=a?this._localVersion(s):"",o=String(e?.version||""),l=a&&o&&r&&o!==r,d=this._busy===s,p=!a||l,m=Array.isArray(e?.files)?e.files.length:0;return c` <div class="packitem">
      <div class="packitem__main">
        <div class="packitem__name">
          <span>${e?.name||s}</span>
          ${o?c`<span class="packitem__ver">v${o}</span>`:x}
          ${a?c`<span class="packitem__badge">已安装</span>`:x}
        </div>
        <div class="packitem__meta">
          ${e?.author?c`<span>${e.author}</span>`:x}
          <span>${m} 个文件</span>
          ${e?.mode==="light"||e?.mode==="dark"?c`<span>${e.mode==="light"?"浅色":"深色"}</span>`:x}
        </div>
        ${e?.description?c`<div class="packitem__desc">${e.description}</div>`:x}
        <div class="packitem__swatch">${this._swatchIndex(e).map(h=>c`<i data-packswatch=${h}></i>`)}</div>
      </div>
      <div class="packitem__side">
        <button
          class=${p?"btn btn--sm btn--primary":"btn btn--sm"}
          type="button"
          data-id=${s}
          ?disabled=${d||!!this._busy}
          @click=${()=>this.install(e)}
        >
          ${d?"安装中…":l?"更新":a?"重新安装":"安装"}
        </button>
      </div>
    </div>`}}ee("mp-pack-store",Zp);function el(t){const e=K({title:t.title,body:c`<mp-pack-store></mp-pack-store>`,okText:"关闭",onOk:()=>!0});return e.root.classList.add("modal--wide","modal--scroll","modal--single"),e.root.querySelector("mp-pack-store")?.open({kind:t.kind,localBody:t.localBody,onChanged:t.onChanged}),e}const ef=[{value:"play",label:"播放"},{value:"play-list",label:"播放当前列表"},{value:"next",label:"下一首播放"}],tf=[{value:"system",label:"跟随系统"},{value:"round",label:"标准"},{value:"small",label:"小圆角"},{value:"square",label:"直角"}],nf=[{value:"compact",label:"紧凑"},{value:"cozy",label:"标准"},{value:"roomy",label:"宽松"}],sf=[{value:"fast",label:"快速 0.25s"},{value:"medium",label:"适中 0.5s"},{value:"slow",label:"缓慢 0.75s"}],af=[{value:"smooth",label:"流畅优先"},{value:"performance",label:"性能优先"}],rf={embedded:"内嵌歌词","lrc-file":"同目录 .lrc",cache:"歌词缓存",online:"在线自动匹配"};function of(){const e=(Array.isArray(i.config.lyricsSources)?i.config.lyricsSources:[]).map(n=>rf[n]||n);return e.length?e.join(" → "):"（未配置）"}function Ci(){const t=i.coverCache;if(!t)return"正在读取…";const e=((t.bytes||0)/1024/1024).toFixed(1);return`已缓存 ${E(t.covers||0)} 张封面、${E(t.lyrics||0)} 份歌词，共 ${e} MB`}function tl(){const t=i.coverCache||{};return(Number(t.covers)||0)+(Number(t.lyrics)||0)}function lf(){const t="默认关闭：封面与歌词都只放在缓存目录里。开启后下载 / 更换封面时会把它们写进文件标签，这样把文件拷到别的播放器上也能看到封面与歌词（m4a / flac 支持，mp3 等格式会明确跳过）";return i.coverCache?tl()===0?`${t}。当前缓存里还没有封面或歌词可写`:`${t}。缓存里已经有 ${Ci()}`:t}function cf(){return`这个开关只对之后下载或更换的封面生效；已经存在缓存里的封面与歌词（${Ci()}）可以用下面的按钮一次性写进歌曲文件。mp3 / wav 等暂不支持写标签的格式会被跳过，不会动你的文件。`}function wr(){const t=Yt(),e=[];for(const s of t)for(const a of s.swatch||[])e.includes(a)||e.push(a);const n=e.map((s,a)=>`[data-swatch="${a}"]{background:${s}}`).join(`
`);return Ts("swatch-styles",n),s=>(s.swatch||[]).map(a=>e.indexOf(a))}function df(t){if(!t?.dir)return`（浏览器预览模式读不到本机目录，以下是源码仓库里的参考文件）
1. 接口唯一定义（含 JSDoc 类型与完整字段说明）：frontend/packages/player-skins/src/contract.js
2. 内置样式包（结构与写法可直接参考，内置与第三方现在同构）：internal/skins/resources/player-skins/classic/、immersive/
3. 可直接复制改名的最小示例包：internal/skins/template/（skin.json / skin.js / skin.css / assets/）
4. 说明文档：frontend/packages/player-skins/README.md 与 internal/skins/template/皮肤说明.md`;const e=["本机真实路径如下。如果你能读文件，请先打开它们当范例；如果读不到（例如纯聊天环境），请让使用者把下面第 2 条的文件内容贴给你，再开始写。",`1. 样式（皮肤）目录 —— 第三方样式包都放在这里，扫描只认它下面的一层子目录：${t.dir}`];t.example?e.push(`2. 示例样式包（完整可运行的 skin.js / skin.css / skin.json，复制改名就是一份新样式）：${t.example}`):e.push("2. 示例样式包：本机没有找到 _template 目录，请只按本规格的接口定义写。"),t.current?e.push(`3. 当前正在使用的样式包（最贴近现状的参考）：${t.current}`):e.push(`3. 当前正在使用的是内置样式（${t.currentId||"classic / immersive"}）：它的文件内嵌在程序里，磁盘上没有对应目录，请以第 2 条的示例包为准。`);const n=Array.isArray(t.packs)?t.packs:[];if(n.length){e.push("4. 该目录里已有的第三方样式包（可以直接读它们的入口与样式）：");for(const s of n){const a=[s.module,...Array.isArray(s.styles)?s.styles:[]].filter(Boolean);e.push(`   · ${s.name||s.id}（id: ${s.id}）：${a.join("、")||s.dir}`)}}else e.push("4. 该目录里目前还没有第三方样式包 —— 你写的这个会是第一个。");return e.push('5. 清单里 apiVersion 必须是 "3.0"（major 不同会被直接拒绝；minor 可以比宿主旧）。'),e.join(`
`)}function uf(t){if(!t?.dir)return`（浏览器预览模式读不到本机目录，以下是源码仓库里的参考文件）
1. 令牌默认值与注释：frontend/src/styles/tokens.css、frontend/src/styles/themes/_template.css
2. 内置主题（可直接对照写法）：frontend/src/styles/themes/flat-dark.css、flat-light.css、cover-dark.css
3. 扫描与指令解析实现：internal/theme/theme.go`;const e=["本机真实路径如下。如果你能读文件，请先打开它们当范例；如果读不到（例如纯聊天环境），请让使用者把下面第 2 条的文件内容贴给你，再开始写。",`1. 主题目录 —— 用户主题都放在这里，只扫一层、不递归；文件名默认就是主题 id，显示名由 @theme-name 决定：${t.dir}`];t.currentFile?e.push(`2. 当前正在使用的主题：${t.currentName||t.currentId}（id: ${t.currentId}）→ 文件：${t.currentFile}`):e.push("2. 当前主题的文件没找到，请以第 3 条列出的文件为准。");const n=Array.isArray(t.files)?t.files:[];if(n.length){e.push("3. 主题目录里已有的主题文件（都是合法示例，可直接对照写法）：");for(const s of n)e.push(`   · ${s.file}（${s.name||s.id}，id: ${s.id}，模式 ${s.mode}，${s.builtin?"内置":"用户导入"}）`)}else e.push("3. 主题目录里暂时没有 .css 文件。");return e.join(`
`)}function pf(t=null){return`请为「本地音乐播放器」（Go + WebView2 的 Windows 桌面应用）产出一个第三方「播放界面样式（插件）」包。这个包会被应用直接扫描并加载，因此必须严格满足下面的规格。

本说明只约定「产物必须满足哪些规则、格式、环境与参考」，不规定也不暗示视觉风格；风格由使用者自行构思。

【一、交付物与目录结构】
输出一个自包含目录，目录名就是样式 id（建议小写字母、数字、短横线，例如 aurora；不能以 _ 或 . 开头，不要用空格与中文）：
  <样式id>/
    skin.json    必需，清单（元数据 + 能力声明 + 配色声明）
    skin.js      必需，入口 ES module（清单里的 entry 默认就是 skin.js）
    skin.css     必需，样式表（清单里的 styles 写它）
    assets/      可选，自带图标与贴图（icon.file 之类都相对包目录引用）
    lib/         可选，自带的私有模块（只允许包内相对 import）
清单示例（字段按需增减，apiVersion 必须写 "3.0"）：
{
  "id": "aurora",
  "name": "显示名",
  "version": "1.0.0",
  "apiVersion": "3.0",
  "author": "…",
  "description": "一句话说明",
  "entry": "skin.js",
  "styles": ["skin.css"],
  "icon": { "file": "assets/icon.svg" },
  "order": 200,
  "capabilities": { "spectrum": true, "background": false, "interactive": true },
  "colors": { "bg": "#0b1020", "fg": "#f2f4ff", "accent": "#7aa2ff" },
  "performance": { "budgetFps": 45 }
}
规则：
1. colors 必填，二选一：{"bg":…,"fg":…} 或 {"theme":true}（跟随宿主主题）。宿主用它决定**自己的控件栏与浮层**配色并做对比度兜底：bg 是壳的底色（只画舞台的样式，宿主会把标题栏/底栏/舞台底色一并换成它），fg 是壳上的文字色，可选 accent 是壳里"被强调"的地方（播放/暂停图标、进度条与音量条的填充、选中块）的专色，不给就用 fg。缺了不报错，但设置页会在你的样式卡片上显示一个警告图标，且宿主把控件栏整块降级成主题配色（只声明了一半也算 —— 不会"上一半"）。
2. colors 里能用纯 hex / rgb() / hsl() / oklch() / color-mix()；不要放 var(--…) 这种宿主令牌（宿主无法据此算对比度）。
3. capabilities.spectrum = true 表示"我要用实时频谱"（写 true 即可，段数固定由宿主给 128 段全谱，你要几根柱子自己切）；不声明就一次都收不到（ctx.spectrum() 返回 null，且宿主一次都不采样）。数据是**拉取式**的：真的调 ctx.spectrum() 才采样，不调就零开销。capabilities.background = true 表示你要整窗背景层（ctx.backgroundRoot），宿主会据此把标题栏/底栏/侧边栏退成半透明。capabilities.interactive 默认 true；false 表示你可能被挂到"只能看"的舞台（桌面背景歌词窗口）。
4. entry 与 styles 必须是本目录内的相对路径，不能含 .. 或写绝对路径。
5. 目录里可放子目录与静态资源（.js .mjs .css .json .png .jpg .jpeg .webp .gif .svg .woff .woff2）；以 _ 或 . 开头的文件与目录不会被提供，请避开。
6. 不要依赖打包器、npm 包、CDN、外链字体或图片；产物必须能直接放进目录就运行。

【二、运行环境】
1. 原生 ES module，浏览器直接 import，没有打包与转译：skin.js 必须 export default 一个插件对象（宿主也接受名为 skin 的具名导出）。**不要** import 任何应用模块（不许 import defineSkin 之类，也不许 import store / utils / @localmusicplayer/player-skins）；公共零件从 ctx.sdk 拿（见【三】）。
2. 页面 CSP：script-src 'self'；style-src 'self' 'unsafe-inline'；img-src 'self' data: blob: file:；media-src 'self' blob: file:。因此：
   · 不能加载任何外部资源（远程 JS / CSS / 字体 / 图片 / 接口请求都会被拦截）；
   · 不能 import CSS（浏览器原生不支持），skin.css 由宿主按清单插入；
   · 可以相对路径 import **本包内**的 .js（lib/ 下的私有模块），图片与字体也用相对路径引用。
3. 内核是现代 Chromium（WebView2）：@layer / @scope / color-mix() / oklch() / :has() / CSS 嵌套都可用。
4. 插件只在「播放详情页」的舞台里生效：宿主把清单里的 CSS 包成
     @layer skin { @scope (.playerview[data-skin="<样式id>"], .skin-bg[data-skin="<样式id>"]) { …你的 CSS… } }
   所以**你的选择器是相对舞台根写的**（见【四】）；ctx.root 就是那个舞台，整窗背景层容器是 ctx.backgroundRoot。
5. 深浅色主题、强调色、毛玻璃强度等由应用的主题令牌决定，插件应跟随，不要写死。

【三、接口契约（必须严格遵守）】
export default {
  id: "<样式id>",               // 可选；写了就必须与清单 id 一致
  mount(ctx) {},                // 必需，函数
  update(ctx, patch) {},        // 可选
  destroy(ctx) {}               // 可选
};
1. 元数据（name / version / order / icon / colors / capabilities）全部写在 skin.json 里，不要在 skin.js 里重复写；写在模块里且与清单冲突会直接加载失败（id、apiVersion 两处不一致就报错）。
2. 缺 mount（或 mount 不是函数）会导致加载失败，控制台会给出原因。

ctx 是插件唯一的入口（只读，直接改它不会生效）：
- ctx.root            挂载点（宿主已清空，往这里写 DOM）
- ctx.backgroundRoot  整窗背景层容器（清单声明 capabilities.background 才有内容）
- ctx.track()         返回 { id, title, artist, album, duration, kind }
                      · kind 是 "local" | "online"（只标记来源，不暴露 URL）
- ctx.media()         返回 { song, cover, covers, coverIndex, lyrics }（聚合快照）
                      · song：当前曲目（可能为 null），即 track() 那一份
                      · cover：当前封面（data URL 或同源 URL）；covers：全部封面（至少一张）；coverIndex：轮播下标
                      · lyrics：{ lines: [{ time, text, trans?, words? }], text, source, index, status, statusText }
                        （trans = 同一时间戳上的其它语言行：多语言歌词在解析时已折叠成一行，
                         第一行是 text、其余进 trans —— 要么一起画，要么用 sdk.lyricDisplayText 拼成一行；
                         words = 字级（逐字）时间轴，每个**字素**一个起始毫秒，与 sdk.splitGraphemes(text)
                         一一对应 —— 行级歌词没有这个键）
- ctx.lyrics()        同上歌词那一份；ctx.covers() 同上封面那一份
- ctx.playback()      返回 { position, duration, playing, volume, muted }，时间单位毫秒
- ctx.options()       返回 { showLyrics, lyricsFontSize, animations, coverCarousel, coverCarouselInterval, interactive, performanceMode }
- ctx.env()           返回 { themeId, mode, width, height, dpr, reducedMotion, foreground }
- ctx.spectrum()      实时频谱（**拉取式**）：返回 { bands: Float32Array(128 段对数全谱, 0..1), at: 采样时刻 } 或 null；
                      调用本身就是采样门控（不调就不采，节流 ~30Hz）；null = 没在播放 / 刚开播 / 没声明 capabilities.spectrum
- ctx.sdk             复用零件：createLyricsView / createFxLyrics / createCamera / createBackgroundLayer / applyFit / fitScale / marqueeText / parseLrc / splitGraphemes / findLyricIndex / formatLrcTime / lyricDisplayText / html / util
- ctx.actions         受控动作：seek(ms) / seekBy(ms) / seekRatio(0~1) / togglePlay / next / prev / toggleLike / like / unlike / openFolder / openCoverPanel / openLyricsPanel / reportBackdrop({bg,fg})
- ctx.on(type, fn)    订阅宿主推送，返回取消订阅的函数
- ctx.defaultCover    封面兜底图（内联 SVG data URL），封面加载失败时用它
- ctx.themeId / ctx.mode（getter）

宿主推送：update(ctx, patch) 与 ctx.on() 收到同一份 patch，patch.type 取值：
mount（挂载后立即一次，带全量快照）/ song（换歌）/ media（封面变化或轮播切图）/ lyrics（歌词装载完成或匹配状态变化）/ progress（播放进度，约 4Hz —— 位置按 250ms 一档量化，插件要自己在帧循环里插值）/ state（播放、暂停、音量）/ options / theme / resize / visibility（详情页开关，据此停帧）/ close / destroy。
没有 spectrum 补丁：实时频谱是**拉取式**（ctx.spectrum()，见上），推的那套已删除。
patch 只带与该类型相关的字段；不确定时用 ctx.track() / ctx.lyrics() / ctx.playback() 现取快照（推送之后快照与载荷一定一致）。

【四、CSS 约定】
1. 选择器**相对舞台根**写，不要自己再加 .playerview[data-skin="<样式id>"] 前缀（宿主已经包了 @scope，加了反而可能匹配不到）：
   · 舞台里面的元素 → 直接写：.demo { … }、.playerview__stage { … }
   · 舞台**自身**   → 用 :scope { … }
2. 不要写 :root / html / body / * 级别或裸标签选择器，不要用 !important 去覆盖别人的规则。
3. 你的 CSS 在 @layer skin 里，**压不过**宿主壳的规则；也**碰不到**宿主 UI（标题栏、底栏、侧边栏、播放队列等都不在作用域内）。想影响宿主控件的观感只有一条路：在清单 colors 里声明配色（宿主会保证对比度）。
4. 可以直接使用主题令牌，深浅色会自动跟随：
   --accent / --accent-weak / --accent-text / --accent-contrast / --text-1 / --text-2 / --text-3 / --text-inverse / --surface-1 / --surface-2 / --surface-3 / --surface-hover / --surface-active / --glass-bg / --glass-bg-strong / --glass-blur / --glass-saturate / --glass-border / --border-1 / --border-2 / --divider / --r-sm / --r-md / --r-lg / --r-xl / --dur / --ease / --lyric-size
   （其中 --lyric-size 是**用户设置**「歌词字号」：宿主写在 :root 上，歌词零件已经
    读它。样式包想改字号就在自己的作用域里覆盖它；但**不要**为了"固定一个好看的
    字号"而无条件写死 —— 那等于替用户关掉了这个设置。相关旋钮还有
    --lyric-size-active（当前行字号）与 --lyric-dim（非当前行压暗程度），
    都按使用点兜底读取，写在 :scope 上即可生效。）
5. 不要改布局令牌（--h-titlebar / --w-sidebar / --h-playerbar / --h-header / --row-h / --row-h-compact），改了会破坏固定布局。
6. 需要私有变量时定义在自己的作用域里（:scope { --my-…: … }），不要写到 :root。

【五、行为约束】
1. 不要 import 应用内部模块（store / bridge / utils / playerhost / @localmusicplayer/player-skins 等）；数据只从 ctx 拿，动作只走 ctx.actions；不要直接操作音频元素或应用状态。
2. 不要轮询：禁止用 setInterval 或定时 setTimeout 反复拉数据（动画、防抖、一次性延时除外）。
3. 歌词高亮优先用 ctx.sdk.createLyricsView（或 ctx.lyrics().index 与 lines），不要自己解析 LRC 文本。
   行上带 words 就是字级（逐字）歌词，上面两个渲染零件会自己按字点亮；再把
   setPosition(pos, { playing })（或 setPlaying(playing)）也喂上，逐字高亮才会在两次
   250ms 进度推送之间平滑推进，否则是 4Hz 的阶梯值。
4. 动效要尊重 ctx.options().animations（false 时不要做位移动效）与时长与缓动令牌；要停掉帧循环就认 patch.type === "close"（紧接着一定会来一次 destroy），不要去等"visibility"这类宿主根本不推的补丁 —— 完整的类型清单见 contract.js 的 PATCH_TYPES。
5. destroy(ctx) 里清掉定时器、事件监听、ResizeObserver 与大对象引用；切换插件会先 destroy 再 mount，两个方法都可能被多次调用。
6. 不要往 window / document 上挂全局变量或样式，不要改 document.documentElement 上的 data-* 属性。
7. 不要发网络请求（CSP 也会拦），不要用 eval / new Function。
8. 用到实时频谱就必须在清单 capabilities.spectrum 里声明 true；没声明就别调 ctx.spectrum()（返回 null 并在控制台提醒一次）。频谱是拉取式的：在你自己的帧循环/更新里现取即可，不要指望宿主推给你。
9. 自绘封面取色类效果算出的配色，用 ctx.actions.reportBackdrop({bg, fg}) 回报给宿主（宿主据此重算控件栏配色），不要自己去改宿主 DOM。

【六、交付前自检清单】
1. 目录名 = skin.json 的 id = skin.js 里的 id（若写了）；
2. skin.json 有 apiVersion "3.0"，有 entry/styles，且 colors 是 bg/fg 或 theme:true 二选一；
3. skin.js 是 export default 插件对象，零裸包名 import，有 mount；
4. CSS 选择器是相对舞台根写的（舞台自身用 :scope），没有加 .playerview[data-skin=…] 前缀；
5. 没有 fetch、没有 setInterval 轮询、没有全局选择器、没有 !important、没有碰宿主 UI 的选择器；
6. 换歌、歌词装载、进度更新、深浅色切换、窗口缩放、切走再切回都不会报错，也不留残余节点或监听；
7. 声明了 spectrum 才调 ctx.spectrum()（拉取式，不调不采样）；用了背景层才声明 background。

【七、参考资料】
${df(t)}

【八、输出格式】
1. 先写清目录名与文件清单；
2. 再逐个文件输出完整代码，每个文件单独一个代码块，并在代码块第一行用注释标明文件名；
3. 不要省略、不要用省略号占位、不要留 __SKIN_ID__ 之类的占位符，代码要能直接运行。

【九、风格】
本提示词只约定产物必须满足的规则、格式、环境与参考，不规定也不暗示视觉风格；具体样式（布局、配色、动效、气质）由使用者自行构思。
请以使用者随附的风格说明为准；若使用者没有给出，先向使用者确认，不要自行假设。

【风格要求 · 由使用者自行填写（本行只是占位，本提示词不提供任何风格建议）】
`}function ff(t=null){return`请为「本地音乐播放器」（Go + WebView2 的 Windows 桌面应用）产出一个「外观主题」CSS 文件。

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
4. 不要覆盖 --bg-window（它由 tokens.css 从 --bg-app 派生）。
5. 颜色要有明确层级和足够对比度：--text-1 对 --bg-app 与 --surface-1 的正文对比度应不低于 4.5:1，--text-2 / --text-3 仍要可读。
6. 深浅模式要自洽：写 dark 就整套按深色给值，写 light 就整套按浅色给值，不要一半深一半浅。
7. 文件必须自包含、可离线：不引用任何外部资源，不含 JS。
8. 可以只覆盖一部分令牌，其余回退默认；但 --bg-app / --text-1 / --accent / --accent-text / --accent-contrast 这几项建议一起给，免得强调色与文字色互相打架。

【四、可声明的令牌（参考清单，按需覆盖）】
- 表面：--bg-app（窗口底色）、--bg-canvas（背景渐变 / 纹理）、--surface-1 / --surface-2 / --surface-3 / --surface-hover / --surface-active
- 毛玻璃：--glass-bg / --glass-bg-strong / --glass-bg-weak / --glass-blur（0 表示关闭毛玻璃）/ --glass-saturate / --glass-border / --glass-highlight / --glass-shadow
- 拟态阴影：--neu-raised（浮起）/ --neu-raised-sm（小浮起）/ --neu-inset（凹陷）/ --neu-pressed（按下）/ --neu-knob（滑块）/ --neu-accent（强调色实底按钮）/ --neu-under（仅外投影）/ --neu-edge-bottom / --neu-edge-top（区域边缘分层）
- 文字：--text-1 / --text-2 / --text-3 / --text-inverse
- 描边：--border-1 / --border-2 / --divider / --focus-ring
- 强调色：--accent / --accent-weak / --accent-weak-hover / --accent-text / --accent-contrast
- 状态色：--heart / --heart-off / --danger / --success / --warning
- 播放页：--immersive-veil / --vinyl（唱片底纹）
- 遮罩与小浮层：--scrim-bg / --scrim-blur（设置 / 封面 / 搜索那几层的全屏遮罩）/ --scrim-tint（遮罩内的次级条）/ --veil-blur（弹窗背后那层轻遮罩）/ --scan-blur / --popover-blur（tip、滑条气泡）
- 封面虚化（只有「封面取色」类主题用得上）：--cover-blur / --cover-blur-strong / --cover-saturate / --cover-brightness / --cover-veil（压在封面上的渐变压暗，保证文字读得清）
- 零散阴影与滤镜：--thumb-shadow（滑条手柄）/ --accent-hover-filter（强调色按钮悬停的加深）/ --slider-idle-filter（底栏进度条未聚焦时的压暗，写 none 即关闭）
- 视觉强度：--op-strong / --op-icon / --op-dim / --op-soft / --op-hint / --op-half / --op-disabled（不可用控件）/ --op-dragging（拖拽中的行）/ --op-ghost（整窗背景型样式下宿主壳让位）
- 落点提示：--locate-dur / --locate-ring / --locate-ring-mid（「定位到当前播放」的描边呼吸）
- 圆角与动效：--r-sm / --r-md / --r-lg / --r-xl / --dur / --ease
完整默认值见 frontend/src/styles/tokens.css 与现成示例 frontend/src/styles/themes/_template.css。

【五、参考资料】
${uf(t)}

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
`}function nl({copyKey:t,importKind:e,importLabel:n}){return c` <div class="card__actions">
    <button class="btn btn--sm btn--primary" type="button" data-copy-prompt=${t}>
      <svg aria-hidden="true"><use href="#i-file"></use></svg><span>复制提示词</span>
    </button>
    <button class="btn btn--sm" type="button" data-import=${e}>
      <svg aria-hidden="true"><use href="#i-folder"></use></svg><span>${n}</span>
    </button>
  </div>`}async function hf(){if(!$())return null;try{const t=document.documentElement.dataset.theme||i.config.theme||"";return await b.themeReference(t)||null}catch(t){return console.warn("[settings] 读取主题参考资料失败",t),null}}async function mf(){if(!$())return null;try{const t=i.pvMode||i.config.playerViewMode||"";return await b.skinReference(t)||null}catch(t){return console.warn("[settings] 读取样式参考资料失败",t),null}}async function bf(t){const n=t==="theme"?ff(await hf()):pf(await mf());try{await navigator.clipboard.writeText(n),u("提示词已复制，粘贴给 AI 即可",{tone:"success",duration:2e3});return}catch{}const s=document.createElement("textarea");s.value=n,s.setAttribute("readonly",""),s.style.cssText="position:fixed;left:-9999px;top:0;opacity:0;",document.body.appendChild(s),s.select();let a=!1;try{a=document.execCommand("copy")}catch{a=!1}s.remove(),u(a?"提示词已复制，粘贴给 AI 即可":"复制失败，请手动复制",{tone:a?"success":"warning",duration:2600})}async function vf(t,e={}){const n=t==="theme";if(!$()){u("浏览器预览模式无法导入，请手动把文件放进目录",{tone:"warning",duration:3600});return}const s=u(n?"正在导入主题…":"正在导入样式包…",{duration:0});try{const a=n?await b.importTheme():await b.importSkin();if(s.close(),a?.cancelled)return;const r=n?Array.isArray(a?.imported)?a.imported:[]:a?.id?[a.id]:[],o=Array.isArray(a?.skipped)?a.skipped:[];n?(await An(),e.commit?.(),e.render?.()):(await Rs(),e.render?.());let l=n?r.length?`已导入 ${r.length} 个主题：${r.join("、")}`:"没有导入任何主题":r.length?`已导入样式「${r[0]}」`:"没有导入任何样式";o.length&&(l+=`；另有 ${o.length} 个文件被跳过`),u(l,{tone:r.length?o.length?"warning":"success":"warning",duration:4600}),o.length&&K({title:"部分文件没有导入",body:c`<div class="setting__hint setting__hint--steps">
          ${o.map((d,p)=>c`${p?c`<br />`:x}${d}`)}
        </div>`,okText:"知道了",cancelText:"关闭",onOk:()=>!0})}catch(a){s.close(),u(`导入失败：${a?.message??a}`,{tone:"error",duration:6e3})}}function sl(t,e={}){t.addEventListener("click",n=>{const s=n.target.closest("[data-copy-prompt]");if(s){bf(s.dataset.copyPrompt);return}const a=n.target.closest("[data-import]");a&&vf(a.dataset.import,e)})}function gf(t={}){const e=c` <div class="setting__hint setting__hint--steps">
      · 点「复制提示词」把它粘贴给
      AI：提示词里只有产物的目录结构、接口契约与硬性规则，不含任何风格建议，风格请在末尾那条「风格要求」里自己补一句，它会直接产出一个样式包目录；<br />
      · 提示词里的「参考资料」会自动带上本机的真实路径（样式目录、示例包 _template、当前样式包），AI
      能读文件就会直接照着写；<br />
      · 生成好后回到这里点「导入样式包」，选中那个目录即可（目录里必须有 skin.js）；<br />
      · 也可以手动放进「样式目录/&lt;样式id&gt;/」，回来点「重新扫描样式」。
    </div>
    ${nl({copyKey:"skin",importKind:"skin",importLabel:"导入样式包…"})}
    <div class="setting__hint">
      接口的唯一定义在 frontend/packages/player-skins/src/contract.js；样式目录里也有现成的 _template
      示例可以直接复制改名。
    </div>`,{root:n}=el({kind:"style",title:"添加播放界面样式",localBody:e,onChanged:()=>{t.commit?.(),t.render?.()}});sl(n,t)}function _f(t={}){const e=c` <div class="setting__hint setting__hint--steps">
      · 点「复制提示词」把它粘贴给
      AI：提示词里只有文件格式、令牌清单与校验规则，不含任何配色建议，风格请在末尾那条「风格要求」里自己补一句，它会产出一个主题
      CSS；<br />
      · 提示词里的「参考资料」会自动带上本机的真实路径（主题目录、当前主题文件、目录里已有的主题 CSS），AI
      能读文件就会直接照着写；<br />
      · 生成好后回到这里点「导入主题」，选中放着那个 CSS 的文件夹即可；<br />
      · 也可以手动放进主题文件夹（上面有「打开主题文件夹」按钮），回来点「重新扫描主题」。
    </div>
    ${nl({copyKey:"theme",importKind:"theme",importLabel:"导入主题…"})}
    <div class="setting__hint setting__hint--steps">
      主题只声明颜色，不需要写组件样式，因此换主题不会破坏布局：<br />
      · 选择器写 <b>:root[data-theme="你的文件名"]</b>，与文件名一致最省事；<br />
      · 只改你想要的颜色，其余保持默认即可；<br />
      · 没写到的颜色会自动沿用默认主题，缺失也不会弄坏布局。
    </div>`,{root:n}=el({kind:"theme",title:"添加自定义主题",localBody:e,onChanged:()=>{t.commit?.(),t.render?.()}});sl(n,t)}async function yf(t,e,n){if(!$()){u("浏览器预览模式下不能移除，请手动删除主题文件",{tone:"warning",duration:3600});return}const s=u("正在移除主题…",{duration:0});try{const a=await ud(t);if(s.close(),!a.removed){u(`没有移除「${e}」`,{tone:"warning"});return}await Re(i.config),n.commit?.(),n.render?.(),u(`已移除主题「${e}」`,{tone:"success"})}catch(a){s.close(),u(`移除失败：${a?.message??a}`,{tone:"error",duration:6e3})}}function wf(t,e){const n=t.dataset.id,s=t.dataset.name||n;K({title:`移除主题「${s}」？`,desc:"会删除这个主题对应的样式文件。内置主题不能移除。",okText:"移除",danger:!0,onOk:async()=>(await yf(n,s,e),!0)})}async function $f(t,e,n){if(!$()){u("浏览器预览模式下不能移除，请手动删除样式目录",{tone:"warning",duration:3600});return}const s=u("正在移除样式…",{duration:0});try{const a=await Rp(t);if(s.close(),!a.removed){u(`没有移除「${e}」`,{tone:"warning"});return}n.commit?.(),n.render?.(),u(`已移除样式「${e}」`,{tone:"success"})}catch(a){s.close(),u(`移除失败：${a?.message??a}`,{tone:"error",duration:6e3})}}function kf(t,e){const n=t.dataset.id,s=t.dataset.name||n;K({title:`移除样式「${s}」？`,desc:"会把样式目录里对应的整个文件夹删掉（里面只有这个样式的文件，不含歌曲）。",okText:"移除",danger:!0,onOk:async()=>(await $f(n,s,e),!0)})}async function Ja(t,e={}){const n=t.dataset.act,s=t.dataset.id;switch(n){case"about-open-url":{const a=String(t.dataset.url||"").trim();if(!a)return;if(!$()){try{await navigator.clipboard.writeText(a),u("预览模式没有系统浏览器：链接已复制",{duration:2600})}catch{u(a,{duration:5200})}return}try{await b.openExternalUrl(a)}catch(r){u(`打开链接失败：${r?.message??r}`,{tone:"error",duration:5e3})}return}case"update-check":{if(!$()){u("浏览器预览模式无法联网检查更新",{tone:"warning",duration:3200});return}u("正在检查更新…",{duration:2200});try{const a=await Ql({force:!0});if(!a)return;a.error?u(`检查失败：${a.error}`,{tone:"error",duration:7e3}):a.hasUpdate&&!a.assetAvailable?u(`有新版本 ${a.latest}，但没有当前平台的安装包`,{tone:"warning",duration:6e3}):a.hasUpdate?u(`发现新版本 ${a.latest}`,{tone:"success",duration:4e3}):u(`已是最新版本（v${a.current}）`,{tone:"success",duration:3e3})}catch(a){u(`检查失败：${a?.message??a}`,{tone:"error",duration:6e3})}return}case"update-download":{if(!$()){u("浏览器预览模式无法下载更新",{tone:"warning",duration:3200});return}Xl().catch(a=>{u(`下载失败：${a?.message??a}`,{tone:"error",duration:7e3})});return}case"update-cancel":{const a=await Vl();u(a?"已取消下载":"当前没有正在进行的下载",{duration:2600});return}case"update-install":{if(!$()){u("浏览器预览模式无法安装更新",{tone:"warning",duration:3200});return}const a=i.update?.pending;if(!a){u("还没有下载好可安装的更新",{tone:"warning",duration:3200});return}const r=!a.verified;K({title:r?"安装未校验的更新包？":"安装更新并重启？",desc:`即将安装 ${a.name}。程序会先退出，由引导脚本替换文件后自动重启。`+(a.verified?"安装包已通过 SHA-256 校验。":`注意：没有取到可用的 SHA-256 校验值${a.mirrorId?`（来源通道：${us(a.mirrorId).name}）`:""}，无法确认它与官方发布的是同一份文件。建议取消后改用「直连 GitHub」重新下载，或到发布页手动下载。`),body:r?c`<label class="setting__hint">
              <input type="checkbox" data-field="confirmUnverified" />
              我确认这个安装包没有被校验过，并自行承担风险
            </label>`:x,danger:r,okText:r?"仍然安装并重启":"安装并重启",onOk:async o=>r&&!o.confirmUnverified?"请先勾选上面的确认项":await Yl()?(u("正在安装更新，程序即将重启…",{duration:4e3}),!0):(u(`安装失败：${i.update?.error||"未知原因"}`,{tone:"error",duration:7e3}),!1)});return}case"update-skip":{const a=String(t.dataset.version||"");await jl(a),u(a?`已跳过 ${a}，之后再提示更新的版本`:"已取消跳过，将重新提示该版本",{duration:3600});return}case"update-open-dir":{if(!$()){u("浏览器预览模式没有文件管理器",{tone:"warning",duration:3e3});return}try{await b.updateOpenDir()}catch(a){u(`打开更新目录失败：${a?.message??a}`,{tone:"error",duration:5e3})}return}case"update-channel":{const a=String(t.value||"auto");await Kl(a);const r=us(a).name;u(`下载通道已设为「${r}」`,{duration:3e3});return}case"reset-main-window-geometry":{if(!$()){u("浏览器预览模式下没有独立窗口",{duration:2200});return}try{const a=await b.mainWindowResetGeometry();a&&a.ok===!1?u(`重置失败：${a.reason||"未知原因"}`,{tone:"error",duration:5e3}):u("窗口已移回屏幕中央并恢复默认大小",{tone:"success",duration:2400})}catch(a){u(`重置失败：${a?.message??a}`,{tone:"error",duration:5e3})}return}case"ai-field":{const a=t.dataset.key;if(!a)return;const r=t.value;if(a==="aiApiKey"&&r===(i.config?.aiApiKey??""))return;const o=Sr();i.config[a]=r,e.commit?.(),!o&&Sr()&&await Tf();return}case"add-folder":{if($()){let r=null;try{r=await b.addFolder("")}catch(o){u(`添加文件夹失败：${o?.message??o}`,{tone:"error",duration:6e3});return}if(r?.cancelled)return;if(r?.duplicated){u(`该文件夹已在曲库中：${r.path}`,{tone:"warning"});return}r?.folder?(i.folders=[...i.folders.filter(o=>o.id!==r.folder.id),r.folder],e.commit?.(),u(`已添加并开始扫描：${r.folder.path}`,{tone:"success"})):u("添加文件夹失败，请重试",{tone:"error",duration:6e3});return}const a=await If();if(!a)return;i.folders.push({id:Nn("folder"),path:a,trackCount:0,status:"ok",watching:i.config.watchFolders,addedAt:Date.now()}),e.commit?.(),u(`已添加文件夹：${a}`,{tone:"success"}),e.rescan?.();break}case"remove-folder":{const a=i.folders.find(r=>r.id===s);if(!a)return;K({title:"移除音乐文件夹？",desc:`${a.path}
仅从曲库中移除，不会删除任何本地文件。`,okText:"移除",danger:!0,onOk:async()=>($()&&await b.removeFolder(s),i.folders=i.folders.filter(r=>r.id!==s),e.commit?.(),u("已移除文件夹"),e.rescan?.({manual:!1}),!0)});break}case"scan-now":e.rescan?.({manual:!0});break;case"rescan-folder":u("正在重新扫描该文件夹…"),e.rescan?.({manual:!0});break;case"unplayable-toggle":Wr();break;case"unplayable-dismiss":await Wl(s);break;case"unplayable-restore":{const a=(i.unplayableFiles||[]).find(r=>r.songId===s);K({title:"重新扫描并放回曲库？",desc:`将清掉「${a?.title||s}」的失败记录，并重新扫描音乐文件夹。
如果文件确实已经修好，它就会回到曲库里。`,okText:"重新扫描",onOk:async()=>(await zl(s),u("已重新扫描",{tone:"success"}),!0)});break}case"unplayable-clear":{const a=(i.unplayableFiles||[]).length;if(!a)break;K({title:`清空这 ${E(a)} 条记录？`,desc:"只清掉这张清单，不会改动任何文件，也不会让它们回到曲库。",okText:"清空",danger:!0,onOk:async()=>{const r=await Hl();return u(`已清空 ${E(r)} 条记录`),!0}});break}case"rule-add":i.filterRules.push({id:Nn("rule"),type:"regex",op:"match",value:"",scope:"exclude",enabled:!0}),e.commit?.();break;case"rule-del":i.filterRules=i.filterRules.filter(a=>a.id!==s),e.commit?.(),e.refreshRules?.();break;case"rule-toggle":{const a=i.filterRules.find(r=>r.id===s);a&&(a.enabled=!a.enabled),e.commit?.(),e.refreshRules?.();break}case"rule-scope":{const a=i.filterRules.find(r=>r.id===s);a&&(a.scope=t.dataset.scope),e.commit?.(),e.refreshRules?.();break}case"rule-type":{const a=i.filterRules.find(r=>r.id===s);if(a){a.type=t.value==="regex"?"regex":"size";const r=["lt","lte","gt","gte","eq"];a.type==="regex"?a.op="match":r.includes(a.op)||(a.op="lt"),a.type==="size"&&!a.unit&&(a.unit="B")}e.commit?.(),e.refreshRules?.();break}case"rule-op":{const a=i.filterRules.find(r=>r.id===s);a&&(a.op=t.value),e.commit?.(),e.refreshRules?.();break}case"preset-small":i.filterRules.push({id:Nn("rule"),type:"size",op:"lt",value:"10240",unit:"B",scope:"exclude",enabled:!0}),e.commit?.(),e.refreshRules?.(),u("已添加：排除小于 10KB 的文件",{tone:"success"});break;case"preset-mp4":i.filterRules.push({id:Nn("rule"),type:"regex",op:"match",value:"\\.mp4$",scope:"exclude",enabled:!0}),e.commit?.(),e.refreshRules?.(),u("已添加：排除 .mp4 文件",{tone:"success"});break;case"theme-pick":{const r=Yt().find(o=>o.id===s);if(!r)return;i.config.theme=r.id,i.config.themeMode=r.mode,await Re(i.config),e.commit?.(),e.render?.(),u(`已切换到主题「${r.name}」`,{tone:"success",duration:1600});break}case"open-theme-dir":{if(!$()){u("主题目录：frontend/src/styles/themes/",{duration:3200});break}try{const a=await b.themeDir();await b.revealThemeDir(),u(a?`已打开主题目录：${a}`:"已打开主题目录",{duration:3200})}catch(a){u(`打开主题目录失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"theme-help":_f(e);break;case"theme-remove":wf(t,e);break;case"reload-themes":if($()){const a=await b.reloadThemes();await An(),await Re(i.config),e.commit?.(),u(`已重新扫描到 ${a?.length??0} 个主题`,{tone:"success"})}else u("浏览器预览模式下仅内置主题可用",{tone:"warning"});break;case"skin-pick":{const a=jt().find(r=>r.id===s);if(!a)return;Kt(a.id),e.commit?.(),e.render?.(),u(`播放界面已切换到「${a.name}」`,{tone:"success",duration:1600});break}case"open-skin-dir":{if(!$()){u("样式目录：frontend/packages/player-skins/",{duration:3200});break}try{const a=await b.skinDir();await b.revealSkinDir(),u(a?`已打开样式目录：${a}`:"已打开样式目录",{duration:3200})}catch(a){u(`打开样式目录失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"reload-skins":try{$()&&await b.reloadSkins(),await Rs(),Kt(i.pvMode||i.config.playerViewMode||""),e.render?.();const a=jt().length,r=jo();u(r.length?`已扫描到 ${a} 个样式，${r.length} 个加载失败`:`已扫描到 ${a} 个样式`,{tone:r.length?"warning":"success"})}catch(a){u(`重新扫描失败：${a?.message??a}`,{tone:"error"})}break;case"skin-help":gf(e);break;case"skin-remove":kf(t,e);break;case"ai-vendor":{const a=String(t.value||"auto");if(a===(i.config.aiVendor||"auto"))break;i.config.aiVendor=a,e.commit?.(),e.render?.();const r=ko(a);u(`模型类型已设为「${xu(a)}」${r?"："+r:""}`,{duration:3600});break}case"loudness-refresh":{if(!$())return;await Ms();const a=await yn();e.commit?.(),u(`已重新获取响度数据（已测量 ${a?.measured??0} 首）`,{tone:"success"});break}case"loudness-clear":{if(!$())return;K({title:"清除响度测量数据？",desc:"只会删除测量缓存，不会动你的音乐文件。清除后再次启用响度均衡会重新测量。",okText:"清除",danger:!0,onOk:async()=>(await b.loudnessClear(),i.loudnessGains={},await yn(),e.commit?.(),e.render?.(),u("已清除响度测量数据",{tone:"success"}),!0)});break}case"loudness-target":{const a=Number(t.value),r=i.config.loudnessTarget;if(a===r)break;i.config.loudnessTarget=a,e.commit?.(),await Zu(),await yn(),e.render?.(),u("目标响度已切换，响度数据将重新计算",{tone:"success",duration:3200});break}case"download-dir-pick":{if(!$()){u("浏览器预览无法调用系统目录选择器",{tone:"warning"});break}try{const a=await b.downloadPickDir();if(a?.cancelled)break;await $r(a,e)}catch(a){u(`无法更改下载位置：${a?.message??a}`,{tone:"error",duration:6e3})}break}case"download-dir-open":{if(!$())break;try{await b.downloadOpenDir(i.config.downloadDir||"")}catch(a){u(`打开失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"download-dir-reset":{if(!$())break;try{const a=await b.downloadSetDir("");if(a?.cancelled)break;const r=a?.next?a:await b.downloadSetDir("");await $r(r,e)}catch(a){u(`恢复默认失败：${a?.message??a}`,{tone:"error",duration:6e3})}break}case"cache-open-covers":case"cache-open-lyrics":{if(!$())break;try{await b.coverOpenCacheDir(n==="cache-open-covers"?"covers":"lyrics")}catch(a){u(`打开缓存目录失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"cover-refresh":{if(!$())break;try{const a=await b.coverClearCache();i.coverCache=await b.coverCacheStats(),await il(),e.commit?.(),e.render?.(),u(`已清空缓存（封面 ${a?.covers??0} 张、歌词 ${a?.lyrics??0} 份）`,{tone:"success"})}catch(a){u(`清空失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"online-cache-cleanup":await Mu(),e.render?.();break;case"embed-cache-write":await al({ctx:e,force:!0});break}}async function al({ctx:t={},force:e=!1}={}){if(!$()){e&&u("写入歌曲文件需要后端支持，浏览器预览不可用",{tone:"warning"});return}for(let a=0;a<20&&!i.coverCache;a++)await new Promise(r=>setTimeout(r,100));if(!i.coverCache&&e)try{i.coverCache=await b.coverCacheStats()}catch{}if(tl()===0){e?u(i.coverCache?"缓存里还没有封面或歌词，暂时没有可写入的内容":"暂时读不到缓存统计，请稍后再试",{duration:3400}):i.coverCache&&u("已开启：以后下载 / 更换封面时会把封面与歌词写进歌曲文件",{duration:3600});return}const n=Number(i.coverCache?.covers)||0,s=Number(i.coverCache?.lyrics)||0;K({title:"要把已有的缓存写进歌曲文件吗？",body:c` <div class="setting__hint">
        缓存目录里已经有 <b>${E(n)}</b> 张封面、<b>${E(s)}</b> 份歌词。
        它们现在只放在缓存目录里；写进歌曲文件之后，把文件拷到别的播放器上也能看到。
      </div>
      <div class="setting__hint">
        写入只会在原文件的标签里做最小插入 / 替换（m4a 的 covr 与 ©lyr、FLAC 的 PICTURE 与 LYRICS），
        不动音频数据；mp3、wav、ogg 等格式会被跳过。这一步无法撤销，但不会影响播放。
      </div>`,okText:"写入文件",cancelText:"暂不写入",onOk:async()=>(await Sf(t),!0)})}async function Sf(t={}){const e=u("正在把缓存写入歌曲文件…",{duration:0}),n=U("meta:embed-progress",s=>{const a=Number(s?.done)||0,r=Number(s?.total)||0,o=s?.title?" · "+s.title:"";e.update(r?"正在写入歌曲文件 "+a+"/"+r+o:"正在把缓存写入歌曲文件…")});try{const s=await b.coverWriteCacheToFiles(),a=Number(s?.written)||0,r=Number(s?.skipped)||0,o=Number(s?.failed)||0,l=Number(s?.total)||0;if(e.close(),!l){u("缓存里还没有封面或歌词，暂时没有可写入的内容",{duration:3200});return}let d=`已写入 ${E(a)} 首`;s?.covers&&(d+=`（封面 ${E(s.covers)}）`),s?.lyrics&&(d+=`（歌词 ${E(s.lyrics)}）`),r&&(d+=`，跳过 ${E(r)} 首`),o&&(d+=`，失败 ${E(o)} 首`),u(d,{tone:o?"warning":r?"info":"success",duration:5200});const p=Array.isArray(s?.reasons)?s.reasons:[];p.length&&K({title:o?"部分歌曲没能写入":"部分歌曲已跳过",body:c`<div class="setting__hint setting__hint--steps">
          ${p.map((m,h)=>c`${h?c`<br />`:x}${m}`)}
        </div>`,okText:"知道了",cancelText:"关闭",onOk:()=>!0}),i.coverCache=await b.coverCacheStats(),t.commit?.(),t.render?.()}catch(s){e.close(),u(`写入失败：${s?.message??s}`,{tone:"error",duration:6e3})}finally{n()}}async function $r(t,e){if(!t||t.cancelled)return;const n=t.next;if(!n)return;if(t.same){u("这已经是当前的下载目录",{duration:2200});return}const s=Number(t.count)||0,a=((Number(t.bytes)||0)/1024/1024).toFixed(1),r=Number(t.nextCount)||0;if(s===0){await ya(n,!1,e);return}const o=c` <div class="setting__hint">
      当前下载目录里有 <b>${E(s)}</b> 首歌曲（约 ${a} MB）。 要一并搬到新目录吗？
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
    ${r?c`<div class="setting__hint">新目录里已经有 ${E(r)} 首歌曲，同名的不会被覆盖。</div>`:x}
    <div class="setting__hint">不迁移的话，旧目录里的歌曲会留在原地；新目录会成为新的默认保存位置。</div>`;K({title:"更改下载位置",body:o,okText:"迁移并更改",cancelText:"不迁移，只更改位置",onOk:async()=>(await ya(n,!0,e),!0),onCancel:async()=>{await ya(n,!1,e)}})}async function ya(t,e,n){try{const s=await b.downloadApplyDir(t,e);if(s?.dir&&(i.config.downloadDir=s.dir),n.commit?.(),n.render?.(),!e){u(`下载位置已改为：${s?.dir||t}`,{tone:"success",duration:3200});return}const a=Number(s?.migrated)||0,r=Number(s?.skipped)||0,o=Array.isArray(s?.failed)?s.failed:[];let l=`已迁移 ${E(a)} 首`;r&&(l+=`，跳过 ${E(r)} 首（新目录已有同名文件）`),o.length&&(l+=`，${E(o.length)} 首失败`),u(`${l}；新位置：${s?.dir||t}`,{tone:o.length?"warning":"success",duration:4200})}catch(s){u(`更改下载位置失败：${s?.message??s}`,{tone:"error",duration:6e3})}}async function il(){if(!$())return i.coverProviders=[],i.coverBreaker={},null;try{const t=await b.coverProviders();return i.coverProviders=Array.isArray(t?.providers)?t.providers:[],i.coverBreaker=t?.breaker&&typeof t.breaker=="object"?t.breaker:{},t}catch{return i.coverProviders=[],i.coverBreaker={},null}}let kr=!1;function xf(){if(kr)return;kr=!0;const t=$()?b.coverCacheStats().then(e=>(i.coverCache=e,e)).catch(()=>null):Promise.resolve(null);Promise.all([il(),t]).then(()=>{To(),fe()})}function Sr(){const t=i.config||{},e=!!t.aiApiKeySet||!!String(t.aiApiKey||"").trim();return!!(String(t.aiBaseUrl||"").trim()&&e)}const rl="music-player.ai.notice.v1";function Cf(){try{return localStorage.getItem(rl)==="1"}catch{return!1}}async function Tf(){return Cf()?!1:new Promise(t=>{const e=()=>{try{localStorage.setItem(rl,"1")}catch{}t(!0)};K({title:"启用 AI 前请确认",desc:`歌曲信息会发往你填写的接口地址，而不是本机：${String(i.config?.aiBaseUrl||"").trim()}`,body:c`
        <div class="about-note">
          <div class="about-note__body">
            · 发送的内容：歌曲标题、歌手、专辑、时长，以及文件名（只有文件名，不含完整路径）。
          </div>
          <div class="about-note__body">· 不发：曲库列表、播放记录、文件路径、任何设备标识。</div>
          <div class="about-note__body">· 接口地址通常在境外：请自行确认该服务的隐私政策与数据处理方式。</div>
          <div class="about-note__body">· 随时可关：清空 Base URL / API Key，或关掉 AI 的两个开关。</div>
        </div>
      `,okText:"我已知晓，启用 AI",cancelText:"稍后再说",onOk:()=>(e(),!0),onCancel:()=>{t(!1)}})})}function If(){return new Promise(t=>{K({title:"添加音乐文件夹",desc:"浏览器预览模式下无法调用系统目录选择器，请手动输入路径。",body:c`<input class="input" data-field="path" type="text" placeholder="D:\\Music" />`,okText:"添加",onOk:e=>{const n=String(e.path||"").trim();return n?(t(n),!0):"请输入路径"}})})}function Ef(t,e={}){const n=t.dataset.toggle;if(n){const a=t.getAttribute("aria-checked")!=="true";if(t.setAttribute("aria-checked",String(a)),n==="updateCheckOnStart")return Gl(a).then(()=>e.commit?.()).catch(r=>{console.warn("[settings] 设置自动检查失败",r)}),!0;if(n in i.config){if(i.config[n]=a,a&&(n==="aiLyricsClean"||n==="aiDownloadTag")){const r=Tu(n);r&&u(r,{tone:"warning",duration:8e3})}n==="animations"&&Pt("--dur",Ta(i.config)),(n==="skipSilenceHead"||n==="skipSilenceTail")&&mi(),n==="minimizeToTray"&&$()&&b.minimizeToTray(a).catch(r=>{console.warn("[settings] 同步托盘开关失败",r)}),n==="watchFolders"&&(i.folders.forEach(r=>r.watching=a),$()&&b.setWatchers(a).catch(r=>{console.warn("[settings] 切换实时监听失败",r)}))}return e.commit?.(),n==="embedMeta"&&a&&al(),!0}const s=t.closest("[data-segment]")?.dataset.segment;if(s){const a=t.dataset.value;if(t.parentElement.querySelectorAll(".segmented__btn").forEach(r=>{r.setAttribute("aria-pressed",String(r===t))}),s==="themeMode"){i.config.themeMode=a;const r=Yt(),o=window.matchMedia("(prefers-color-scheme: dark)").matches,l=a==="system"?o?"dark":"light":a,d=r.find(p=>p.mode===l&&p.id!=="cover-dark")||r[0];i.config.theme=d.id,Re(i.config)}else if(s in i.config){const r=["lyricsLines","scanConcurrency"];i.config[s]=r.includes(s)?Number(a):a,s==="lyricsLines"&&Pt("--lyric-pad",`${50-Number(a)*4}%`),s==="animationsSpeed"&&Pt("--dur",Ta(i.config)),s==="loudnessMode"&&Ms(),s==="windowCorners"&&$()&&b.setWindowCorners(a).catch(o=>{console.warn("[settings] 设置窗口圆角失败",o)})}return e.commit?.(),!0}return!1}function Af(t,{silent:e=!1}={}){const n=t?.dataset?.id;if(!n)return;const s=i.config.rowClickAction||"play";if(s==="play"){Ia(n);return}if(s==="play-list"){const a=i.visibleSongs.map(r=>r.id);wt(a,Number(t.dataset.index),kn());return}Kr(n),e||u("已设为下一首播放",{tone:"success",duration:1500})}const wa=[{id:"album",label:"专辑",icon:"album",isOn:()=>i.config.showAlbumColumn!==!1,set:t=>{i.config.showAlbumColumn=t}}];function Df(t,e){const n=[{kind:"label",label:"显示的列"}];for(const s of wa)n.push({id:`col-${s.id}`,label:s.label,icon:s.icon,checked:s.isOn()});n.push({kind:"sep"}),n.push({id:"col-reset",label:"恢复默认列",icon:"refresh"}),Ft({x:t,y:e,items:n,onPick:s=>{if(s==="col-reset"){for(const o of wa)o.set(!0);k(),u("已恢复默认列",{duration:1400});return}const a=wa.find(o=>`col-${o.id}`===s);if(!a)return;const r=!a.isOn();a.set(r),k(),u(r?`已显示「${a.label}」列`:`已隐藏「${a.label}」列`,{duration:1400})}})}function xr(t,e,n=null){const s=Ve(e);if(!s)return;const a=!!s.online,r=st(e),o=i.queue.includes(e),l=[{id:"play",label:"播放",icon:"play"},{id:"play-next",label:"下一首播放",icon:"arrow-right"},{id:"sep1",kind:"sep"},{id:"queue-add",label:o?"从播放列表移除":"加入播放列表",icon:"queue"},{id:"like",label:r?"取消喜欢":"加入我喜欢",icon:"heart"},{id:"add-to",label:"加入歌单…",icon:"plus"}];if(a||l.push({id:"cover",label:"更换封面…",icon:"image"}),i.view==="queue")l.push({id:"sep2",kind:"sep"}),l.push({id:"remove-here",label:"从播放列表移除",icon:"trash",danger:!0});else if(i.view==="playlist"&&i.playlistId){const p=We(i.playlistId);p&&!p.locked&&(l.push({id:"sep2",kind:"sep"}),l.push({id:"remove-here",label:`从「${p.name}」移除`,icon:"trash",danger:!0}))}a||(l.push({id:"sep3",kind:"sep"}),l.push({id:"reveal",label:"在文件夹中显示",icon:"folder"}));const d=p=>{switch(p){case"play":{const m=i.visibleSongs.map(g=>g.id),h=m.indexOf(e);h<0?wt([e],0,{type:"online",id:null}):wt(m,h,kn());break}case"cover":$t(()=>Promise.resolve().then(()=>Ii),void 0).then(m=>m.openCoverPanel(e));break;case"play-next":Kr(e),u("已设为下一首播放",{tone:"success",duration:1500});break;case"queue-add":o?(Ea(e),u("已从播放列表移除")):(Jl([e]),u("已加入播放列表",{tone:"success",duration:1500}));break;case"like":_t(e),u(r?"已从「我喜欢」移除":"已加入「我喜欢」",{tone:r?"info":"success",duration:1500});break;case"add-to":Mf(e);break;case"remove-here":i.view==="queue"?(Ea(e),u("已从播放列表移除")):i.playlistId&&(jr(i.playlistId,[e]),u("已从歌单移除"));break;case"reveal":$t(()=>import("./bridge-B2s8uzRH.js").then(m=>m.q),[]).then(async m=>{try{await m.backend.revealInExplorer(s.path),u("已在文件夹中显示",{duration:1800})}catch(h){u(`无法在文件夹中显示：${h?.message??h}`,{tone:"error",duration:4e3})}});break}};if(n)Ft({x:n.x,y:n.y,items:l,onPick:d});else{const p=t.getBoundingClientRect();Ft({x:p.left,y:p.bottom+6,items:l,onPick:d,align:"right"})}}function Mf(t){const e=i.playlists,{root:n}=K({title:"加入歌单",body:c`
      <div class="setting__hint">点击歌单即可把这首歌加进去。</div>
      <div class="u-row u-wrap">
        ${e.map(s=>c` <button class="btn btn--sm" type="button" data-pl=${s.id}>
              <svg aria-hidden="true"><use href="#i-${s.id===Xn?"heart":"playlist"}"></use></svg>
              <span>${s.name}</span>
            </button>`)}
      </div>
    `,okText:"完成",cancelText:"关闭",onOk:()=>!0});n.addEventListener("click",s=>{const a=s.target.closest("[data-pl]");a&&$s(a.dataset.pl,[t])})}const Pf=1500,Of=140,Lf=800,Cr=new WeakMap,$a=new WeakMap;function Rf(t){t&&(clearTimeout(Cr.get(t)),t.classList.remove("is-located"),t.offsetWidth,t.classList.add("is-located"),Cr.set(t,window.setTimeout(()=>t.classList.remove("is-located"),Pf)))}function cs(t){if(!t)return;const e=($a.get(t)??0)+1;$a.set(t,e);try{t.scrollIntoView({block:"nearest",inline:"nearest"})}catch{Nf(t)}Bf(t,()=>{$a.get(t)!==e||!t.isConnected||Rf(t)})}function Nf(t){const e=t.closest(".content-body, .queue-panel__body");if(!e)return;const n=t.getBoundingClientRect(),s=e.getBoundingClientRect(),a=e.classList.contains("content-body")?50:8,r=s.top+a;n.top<r?e.scrollTop-=r-n.top:n.bottom>s.bottom&&(e.scrollTop+=n.bottom-s.bottom)}function qf(t){let e=t.parentElement;for(;e&&e!==document.documentElement;){const{overflowY:n}=getComputedStyle(e);if(n==="auto"||n==="scroll"||n==="overlay")return e;e=e.parentElement}return null}function Bf(t,e){const n=qf(t);if(!n){requestAnimationFrame(e);return}let s=!1,a=0,r=0,o=n.scrollTop,l=n.scrollLeft,d=performance.now();const p=()=>{s||(s=!0,cancelAnimationFrame(a),clearTimeout(r),n.removeEventListener("scrollend",p),e())},m=()=>{const h=n.scrollTop,g=n.scrollLeft;if((h!==o||g!==l)&&(o=h,l=g,d=performance.now()),performance.now()-d>=Of){p();return}a=requestAnimationFrame(m)};n.addEventListener("scrollend",p),a=requestAnimationFrame(m),r=window.setTimeout(p,Lf)}function ka(t){const e=i.currentId;if(!e)return null;const n=t.querySelector(`.track[data-id="${CSS.escape(e)}"]`);return n?{el:n}:null}function Ff(){const t=i.currentId;return t&&document.querySelector("#queue-panel-body")?.querySelector(`.queue-item[data-queue-id="${CSS.escape(t)}"]`)||null}function Uf({notify:t=!0}={}){if(!i.currentId)return t&&u("当前没有正在播放的歌曲",{tone:"info",duration:1600}),!1;const e=document.getElementById("content-body"),n=e?ka(e):null;if(n)return cs(n.el),!0;const s=e?.querySelector("mp-track-table");if(s?.revealRow?.(i.currentId)){const a=()=>{const r=e?ka(e):null;if(r){cs(r.el);return}requestAnimationFrame(()=>{const o=e?ka(e):null;o&&cs(o.el)})};return typeof s.updateComplete?.then=="function"?s.updateComplete.then(a):requestAnimationFrame(a),!0}return t&&u("当前播放的歌曲不在这个列表里",{tone:"info",duration:2200}),!1}function ol({notify:t=!0}={}){if(!i.queue.length)return t&&u("播放列表是空的",{tone:"info",duration:1600}),!1;const e=Ff();return e?(cs(e),!0):(t&&u("当前播放的歌曲不在播放列表里",{tone:"info",duration:2200}),!1)}let ll=0;function cl(){ll=Date.now()}function dl(){return Date.now()-ll<260}function Hf(t=!1){const e=i.visibleSongs.map(n=>n.id);if(e.length){if(t)for(let n=e.length-1;n>0;n-=1){const s=Math.floor(Math.random()*(n+1));[e[n],e[s]]=[e[s],e[n]]}wt(e,0,kn()),u(t?"已随机播放":`开始播放 ${E(e.length)} 首`,{duration:1600})}}const zf={library:"本地歌曲",queue:"播放列表",playlist:"歌单"},Wf=120;function Kf(){let t=null;const e=()=>{t!==null&&(clearTimeout(t),t=null,k())},n=()=>{t!==null&&clearTimeout(t),t=setTimeout(e,Wf)};return n.flush=e,n}const jf={commit:k,rescan:()=>Cn({manual:!0})};class Vf extends me{static deps=e=>[e.view,e.playlistId,e.playlistVersion,e.query,e.visibleVersion,e.visibleSongs.length,e.sortKey,e.sortDir,e.songs.length,e.folders.length,e.scanning,e.playlistSelecting,e.selectedIds,e.lastScan?.at??0,e.config.listDensity];constructor(){super(),this._commitFilter=Kf()}onDisconnected(){this._commitFilter?.flush?.()}render(){const e=i.view,n=e==="playlist"?We(i.playlistId):null;return c`
      <main class="main" id="main" @click=${s=>this.onMainClick(s)}>
        <div class="content-header" id="content-header" @click=${s=>this.onHeaderClick(s)}>
          <div class="content-header__titles">
            <h1 class="content-header__title" id="content-title">
              ${e==="playlist"&&n?n.name:zf[e]||"本地歌曲"}
            </h1>
            <p class="content-header__subtitle" id="content-subtitle" data-scanning=${String(i.scanning)}>
              ${this.subtitle(e,n)}
            </p>
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
                  @input=${s=>{i.query=s.target.value,this._commitFilter()}}
                  @keydown=${s=>{s.key==="Escape"&&(s.preventDefault(),js(),s.target.blur())}}
                />
                <button
                  class="content-filter__clear u-hit"
                  id="content-filter-clear"
                  type="button"
                  aria-label="清空筛选"
                  ?hidden=${i.query.length===0}
                  @click=${()=>{js(),this.querySelector("#content-filter-input")?.focus()}}
                >
                  ${f("close")}
                </button>
              </div>
              <span class="content-filter__count" id="content-filter-count">
                ${i.query.trim()?`匹配 ${E(i.visibleSongs.length)} 首`:""}
              </span>
            </div>
            <div class="content-header__tools" id="content-tools">${this.toolbar()}</div>
          </div>
        </div>
        <div class="content-body" id="content-body">${this.body()}</div>
      </main>
    `}subtitle(e,n){const s=i.visibleSongs,a=s.reduce((r,o)=>r+o.duration,0);if(e==="library"){const r=i.lastScan;return`${E(s.length)} 首 · 共 ${Fs(a)} · ${E(Vr().length)} 个文件夹${r&&r.excluded?` · 已过滤 ${E(r.excluded)} 个文件`:""}`}if(e==="queue"){const r=i.currentId?s.findIndex(o=>o.id===i.currentId):-1;return`${E(s.length)} 首 · 共 ${Fs(a)}${r>=0?` · 正在播放第 ${r+1} 首`:""}`}return e==="playlist"&&n?`${E(s.length)} 首 · 共 ${Fs(a)} · ${n.locked?"默认歌单（不可删除）":"自定义歌单"}`:e==="playlist"?"歌单不存在":""}toolbar(){const e=i.view,n=c`<button class="btn btn--primary" type="button" data-tool="play-all">
      ${f("play")}<span>播放全部</span>
    </button>`,s=c`<button
      class="btn btn--icon"
      type="button"
      data-tool="locate"
      data-tip="定位到当前播放"
      aria-label="定位到当前播放"
    >
      ${f("disc")}
    </button>`,a=Di(i.sortKey),r=c`
      <button
        class="btn btn--sort"
        type="button"
        data-tool="sort"
        data-dir=${i.sortDir}
        data-tip="排序方式"
        aria-haspopup="menu"
        aria-label="排序方式：${a?.label??"添加时间"}，${Zl(i.sortDir)}"
      >
        ${f("sort")}
        <span>${a?.label??"添加时间"}</span>
        <span class="btn__dir" aria-hidden="true"
          >${f(i.sortDir==="desc"?"chevron-down":"chevron-up")}</span
        >
      </button>
    `;if(e==="queue")return c`
        <button class="btn" type="button" data-tool="queue-clear">${f("trash")}<span>清空列表</span></button>
        ${n}${s}
      `;if(e==="playlist"){if(i.playlistSelecting){const o=i.selectedIds.size,l=i.visibleSongs.length>0&&i.visibleSongs.every(d=>i.selectedIds.has(d.id));return c`
          <span class="toolbar__selinfo">已选 ${E(o)} 首</span>
          <button class="btn btn--sm" type="button" data-tool="sel-all">
            ${f("check")}<span>${l?"取消全选":"全选"}</span>
          </button>
          <button class="btn btn--sm btn--danger" type="button" data-tool="sel-remove" ?disabled=${!o}>
            ${f("trash")}<span>移除所选</span>
          </button>
          <button class="btn btn--sm btn--primary" type="button" data-tool="pl-select">
            ${f("close")}<span>完成</span>
          </button>
        `}return c`
        ${r}${n}
        <button class="btn" type="button" data-tool="pl-select">${f("check")}<span>多选</span></button>
        <button class="btn" type="button" data-tool="pl-add">${f("plus")}<span>添加</span></button>
        ${s}
      `}return c`
      <button class="btn" type="button" data-tool="rescan">${f("refresh")}<span>重新扫描</span></button>
      ${r}${n}${s}
    `}body(){const e=i.view;if(!i.visibleSongs.length){const n=i.query.trim()?"search":e==="library"?"library":e==="queue"?"queue":"playlist";return this.empty(n)}return Su(`${e}|${i.playlistId??""}`,c`<div class="page"><mp-track-table></mp-track-table></div>`)}empty(e){const n={library:{icon:"music",title:"曲库还没有歌曲",desc:"在设置里添加本地音乐文件夹，程序会自动扫描并监听这些文件夹的变化。",ok:"添加音乐文件夹",act:"add-folder"},queue:{icon:"queue",title:"播放列表是空的",desc:"从「本地歌曲」或任意歌单里选择歌曲加入播放列表。",ok:"去本地歌曲",act:"goto-library"},playlist:{icon:"playlist",title:"这个歌单还没有歌曲",desc:"在「本地歌曲」里点击每首歌后面的爱心或更多菜单，把歌曲加进来。",ok:"去本地歌曲",act:"goto-library"},search:{icon:"search",title:"没有找到匹配的歌曲",desc:"换个关键词试试，或清空搜索框。",ok:"清空搜索",act:"clear-search"}},s=n[e]||n.library;return c`
      <div class="empty" data-empty=${e}>
        <svg class="empty__art" aria-hidden="true"><use href="#i-${s.icon}"></use></svg>
        <div class="empty__title">${s.title}</div>
        ${s.desc?c`<div class="empty__desc">${s.desc}</div>`:x}
        ${s.ok?c`<div class="empty__actions">
                <button class="btn btn--primary" type="button" data-empty-act=${s.act}>${s.ok}</button>
              </div>`:x}
      </div>
    `}async onMainClick(e){const n=e.target.closest("[data-empty-act]")?.dataset.emptyAct;n&&(n==="add-folder"?await Ja({dataset:{act:"add-folder"}},jf):n==="goto-library"?Ot("library"):n==="clear-search"&&js())}async onHeaderClick(e){const n=e.target.closest("[data-tool]")?.dataset.tool;n&&await this.handleTool(n)}openSortMenu(){const e=this.querySelector('[data-tool="sort"]'),n=[{id:"hdr-field",kind:"label",label:"排序方式"},...ec.map(s=>({id:`field:${s.key}`,label:s.label,checked:s.key===i.sortKey})),{id:"sep-dir",kind:"sep"},{id:"hdr-dir",kind:"label",label:"排列顺序"},{id:"dir:asc",label:"升序",checked:i.sortDir==="asc"},{id:"dir:desc",label:"降序",checked:i.sortDir==="desc"}];Ft({anchor:e,align:"left",items:n,onPick:s=>{if(s.startsWith("field:")){const a=s.slice(6);if(a===i.sortKey){u(`已经按「${Di(a)?.label??a}」排序`,{duration:1400});return}tc(a);return}if(s.startsWith("dir:")){const a=s.slice(4);if(a===i.sortDir)return;nc(a)}}})}async handleTool(e){switch(e){case"rescan":Cn({manual:!0});break;case"sort":this.openSortMenu();break;case"play-all":Hf(!1);break;case"locate":Uf();break;case"queue-clear":Gr(),u("播放列表已清空");break;case"pl-select":Mi(!i.playlistSelecting);break;case"pl-add":i.playlistId&&wu(i.playlistId);break;case"sel-all":{const n=i.visibleSongs.length>0&&i.visibleSongs.every(s=>i.selectedIds.has(s.id));sc(n?[]:i.visibleSongs.map(s=>s.id));break}case"sel-remove":{const n=[...i.selectedIds];if(!n.length)break;const s=We(i.playlistId),a=jr(i.playlistId,n);Mi(!1),u(`已从「${s?.name??"歌单"}」移除 ${E(a)} 首`,{tone:"success"});break}}}}ee("mp-content",Vf);const Gf=ii(class extends ri{render(){return It}update(t,[e]){const n=t.element;if(!n)return It;lc(n);const s=e||Cs;if(n.getAttribute("src")===s)return It;if(s.startsWith("data:"))return n.src=s,It;n.__coverWant=s;const a=new Image;a.decoding="async";const r=()=>{n.__coverWant===s&&(n.src=s)};return a.addEventListener("load",r),a.addEventListener("error",r),a.src=s,It}}),Ti=t=>Gf(t),Yf=300,Xf=8,ul=56;function Qf(t,e,n,s,a=Xf){const r=Math.max(0,Math.floor(Number(t))||0),o=Number(s)>0?Number(s):ul,l=Math.max(0,Math.floor(Number(a))||0),d=Math.max(0,Number(e)||0),p=Math.max(0,Number(n)||0),m=Math.max(1,Math.ceil(p/o)+l*2+1);let h=Math.min(r,Math.max(0,Math.floor(d/o)-l)),g=Math.min(r,h+m);return r>0&&g<=h&&(g=r,h=Math.max(0,r-m)),{start:h,end:g,padTop:h*o,padBottom:Math.max(0,(r-g)*o),rowH:o}}function Jf(t,e){return t==="library"&&(Math.floor(Number(e))||0)>Yf}class Zf extends me{static deps=e=>[e.view,e.playlistId,e.visibleVersion,e.sortKey,e.sortDir,e.config.listDensity,e.config.showAlbumColumn,e.playlistSelecting,e.selectedIds,e.currentId,e.playing,e.likedIds,En(),e.visibleSongs.length,ac()];get mode(){return i.view==="queue"?"playlist":"library"}get selecting(){return i.view==="playlist"&&i.playlistSelecting}constructor(){super(),this._rowH=0,this._scroller=null,this._scrollRaf=0,this._resizeBound=!1,this._onScroll=()=>this.scheduleWindowUpdate(),this._onResize=()=>this.scheduleWindowUpdate()}onConnected(){this._resizeBound||(window.addEventListener("resize",this._onResize),this._resizeBound=!0)}scheduleWindowUpdate(){this._scrollRaf||(this._scrollRaf=requestAnimationFrame(()=>{this._scrollRaf=0,this.windowing()&&this.requestUpdate()}))}updated(){i.view==="queue"?this.bindQueueSort():this._sortable&&(this._sortable.destroy(),this._sortable=null),this.syncWindowState()}disconnectedCallback(){this._scrollRaf&&cancelAnimationFrame(this._scrollRaf),this._scrollRaf=0,this._resizeBound&&(window.removeEventListener("resize",this._onResize),this._resizeBound=!1),this._scroller?.removeEventListener("scroll",this._onScroll),this._scroller=null,this._sortable?.destroy(),this._sortable=null,super.disconnectedCallback()}windowing(){return Jf(this.mode,i.visibleSongs.length)}syncScroller(){const e=this.closest(".content-body");e!==this._scroller&&(this._scroller?.removeEventListener("scroll",this._onScroll),this._scroller=e,e?.addEventListener("scroll",this._onScroll,{passive:!0}))}syncWindowState(){this.syncScroller();const e=this.querySelector(".track");if(!e)return;const n=e.getBoundingClientRect().height;!(n>0)||Math.abs(n-this._rowH)<=.5||(this._rowH=n,this.windowing()&&this.requestUpdate())}rowHeight(){if(this._rowH>0)return this._rowH;const e=getComputedStyle(this.querySelector(".tracks")||this),n=a=>{const r=parseFloat(e.getPropertyValue(a));return Number.isFinite(r)&&r>0?r:0},s=n("--row-h")||ul;return i.config.listDensity==="compact"?n("--row-h-compact")||44:i.config.listDensity==="roomy"?s+12:s}headHeight(){return this.querySelector(".tracks__head")?.getBoundingClientRect().height||0}scrolledPx(){const e=this._scroller,n=this.querySelector(".tracks__body");if(!e||!n)return 0;const s=e.getBoundingClientRect(),a=n.getBoundingClientRect();return Math.max(0,s.top+this.headHeight()-a.top)}viewportH(){const e=this._scroller;return e?Math.max(0,e.clientHeight-this.headHeight()):Math.max(0,window.innerHeight*.6)}windowRange(){return this.windowing()?Qf(i.visibleSongs.length,this.scrolledPx(),this.viewportH(),this.rowHeight()):null}revealRow(e){const n=i.visibleSongs.findIndex(g=>g.id===e);if(n<0)return!1;if(!this.windowing())return!0;const s=this._scroller,a=this.querySelector(".tracks__body");if(!s||!a)return!0;const r=this.rowHeight(),o=this.headHeight(),l=s.getBoundingClientRect(),p=a.getBoundingClientRect().top-l.top+s.scrollTop,m=Math.max(1,Math.floor(Math.max(0,s.clientHeight-o)/r)),h=Math.max(0,p+Math.max(0,n-Math.floor(m/2))*r-o);return typeof s.scrollTo=="function"?s.scrollTo({top:h,behavior:"instant"}):s.scrollTop=h,this.requestUpdate(),!0}bindQueueSort(){const e=this.querySelector(".tracks__body");e&&(this._sortable&&this._sortable.el===e||(this._sortable?.destroy(),this._sortable=T.create(e,{handle:"[data-handle]",draggable:".track",animation:0,ghostClass:"is-dragging",chosenClass:"is-dragging",onEnd:n=>{cl();const s=n.oldIndex,a=n.newIndex;if(s==null||a==null||s===a)return;const r=n.from,o=Array.from(r.children).filter(l=>l!==n.item);r.insertBefore(n.item,o[s]??null),Yr(s,a),u("已调整播放顺序 · 播放模式已切回列表循环",{duration:1800})}})))}render(){const e=this.mode,n=i.visibleSongs,s=this.windowRange();return c`
      <!-- 事件委托挂在 .tracks 上（范围含表头）：排序按钮在 .tracks__head 里，
           只挂 .tracks__body 的话点表头排序会没有反应。 -->
      <div
        class="tracks"
        data-mode=${e}
        data-density=${i.config.listDensity||"cozy"}
        data-album=${i.config.showAlbumColumn===!1?"off":"on"}
        @click=${a=>this.onClick(a)}
        @dblclick=${a=>this.onDblClick(a)}
        @contextmenu=${a=>this.onContextMenu(a)}
      >
        ${this.headTemplate(e)}
        <div class="tracks__body">
          ${s?c`<div
                    class="tracks__pad"
                    data-pad="top"
                    style=${"height:"+s.padTop+"px"}
                    aria-hidden="true"
                  ></div>
                  ${Se(n.slice(s.start,s.end),a=>a.id,(a,r)=>this.rowTemplate(a,s.start+r,e))}
                  <div
                    class="tracks__pad"
                    data-pad="bottom"
                    style=${"height:"+s.padBottom+"px"}
                    aria-hidden="true"
                  ></div>`:Se(n,a=>a.id,(a,r)=>this.rowTemplate(a,r,e))}
        </div>
      </div>
    `}headTemplate(e){const n=e!=="playlist",s=(a,r,o="")=>{if(!n)return c`<div class="tracks__sort ${o}" data-static="1">${r}</div>`;const l=["tracks__sort",o,i.sortKey===a&&i.sortDir==="asc"?"is-asc":""].filter(Boolean).join(" ");return c`<button
        class=${l}
        type="button"
        data-sort=${a}
        data-dir=${i.sortKey===a?i.sortDir:x}
      >
        ${r}${f("chevron-down")}
      </button>`};return c`
      <div class="tracks__head" data-mode=${e}>
        <div class="col-handle"></div>
        <div class="col-index">#</div>
        <div class="col-cover"></div>
        ${s("title","标题")} ${s("album","专辑","col-album")} ${s("duration","时长")}
        <div class="col-heart" title="我喜欢">${f("heart")}</div>
        <div class="col-more"></div>
      </div>
    `}rowTemplate(e,n,s){const a=this.selecting,r=e.id===i.currentId,o=st(e.id),l=a&&i.selectedIds.has(e.id);return c`
      <div
        class="track"
        data-id=${e.id}
        data-index=${n}
        data-selectable=${a?"1":"0"}
        aria-selected=${String(l)}
        aria-current=${String(r)}
        data-playing=${r&&i.playing?"true":"false"}
      >
        ${s==="playlist"?c`<div class="track__handle" data-handle="1" title="拖动排序">${f("grip")}</div>`:c`<div class="col-handle"></div>`}
        <div class="track__index">${this.indexCell(e,n,a)}</div>
        <div class="track__cover">
          <img src=${Ti(kt(e))} alt="" loading="lazy" draggable="false" />
        </div>
        <div class="track__main">
          <div class="track__title" data-new=${ic(e.id)?"1":x}>${e.title}</div>
          <div class="track__sub">
            <span class="track__artist">${e.artist}</span>
            <span class="track__tag">${e.ext}</span>
          </div>
        </div>
        <div class="track__album u-ellipsis">${e.album}</div>
        <div class="track__time">${Mt(e.duration)}</div>
        <button
          class="track__heart"
          type="button"
          data-act="like"
          aria-pressed=${String(o)}
          aria-label="加入我喜欢"
          data-tip=${o?"取消喜欢":"加入我喜欢"}
        >
          ${f("heart")}
        </button>
        <button class="track__more" type="button" data-act="more" aria-label="更多操作" aria-expanded="false">
          ${f("more")}
        </button>
      </div>
    `}indexCell(e,n,s){if(s){const a=i.selectedIds.has(e.id);return c`<span class="track__check" role="checkbox" aria-checked=${String(a)}>${f("check")}</span>`}return c`
      <span class="track__num u-num">${n+1}</span>
      <div class="track__bars"><span></span><span></span><span></span><span></span></div>
      <button class="track__play" type="button" data-act="play" aria-label="播放 ${e.title}">
        ${f("play")}
      </button>
    `}onClick(e){if(dl())return;const n=e.target.closest(".track");if(n&&i.view==="playlist"&&i.playlistSelecting){e.preventDefault(),rc(n.dataset.id);return}const s=e.target.closest("[data-sort]");if(s){oc(s.dataset.sort);return}const a=e.target.closest("[data-act]");if(!a){const l=e.target.closest(".track");l&&Af(l,{silent:!1});return}const r=a.closest(".track"),o=r?.dataset.id;if(o)switch(a.dataset.act){case"play":{const l=i.visibleSongs.map(d=>d.id);wt(l,Number(r.dataset.index),kn());break}case"like":{_t(o);const l=st(o);u(l?"已加入「我喜欢」":"已从「我喜欢」移除",{tone:l?"success":"info",duration:1500});break}case"more":xr(a,o);break}}onDblClick(e){if(i.view==="playlist"&&i.playlistSelecting)return;const n=e.target.closest(".track");if(!n)return;const s=i.visibleSongs.map(a=>a.id);wt(s,Number(n.dataset.index),kn()),i.playerOpen=!0,i.pvMode=i.config.playerViewMode,k()}onContextMenu(e){if(e.target.closest(".tracks__head")){e.preventDefault(),Df(e.clientX,e.clientY);return}const s=e.target.closest(".track");s&&(e.preventDefault(),xr(null,s.dataset.id,{x:e.clientX,y:e.clientY}))}}ee("mp-track-table",Zf);class eh extends me{static deps=e=>[e.playerOpen,e.pvMode,e.currentId,e.playing,e.duration,e.config.showLyrics,e.config.coverCarousel,e.config.coverCarouselInterval,En(),Go()];onConnected(){this._unsubscribers.push(In(()=>_r()))}updated(){_r()}render(){const e=Ke(),s=this.coverList(e).length>1,a=i.config.coverCarousel===!0&&s,r=!e||!!e.online,o=jt();return c`
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
          <button class="playerview__back" id="btn-player-back" type="button" @click=${()=>Ns()}>
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
            >
              ${f("image")}
            </button>
            <button
              class="viewmode__btn"
              id="btn-cover-carousel"
              type="button"
              aria-pressed=${String(a)}
              ?disabled=${!s}
              data-tip=${this.carouselTip(s,a)}
              aria-label="封面轮播"
              @click=${()=>this.toggleCarousel()}
            >
              ${f("slideshow")}
            </button>
          </div>
          <div class="viewmode" id="playerview-mode" role="group" aria-label="播放界面样式">
            ${Se(o,l=>l.id,l=>c`
                <button
                  class="viewmode__btn"
                  type="button"
                  data-pv-skin=${l.id}
                  data-pv-mode=${l.id}
                  aria-pressed=${String(i.pvMode===l.id)}
                  data-tip=${l.name||l.id}
                  aria-label=${l.name||l.id}
                  @click=${()=>Kt(l.id)}
                >
                  ${this.skinIcon(l)}
                </button>
              `)}
          </div>
        </div>
        <div
          class="playerview__stage"
          id="playerview-stage"
          @click=${l=>{l.target.closest(".disc__label, .disc__platter")&&Gp()}}
        ></div>
      </section>
    `}skinIcon(e){return e.iconUrl?c`<i class="skin-icon" style=${`--skin-icon:${Br(e.iconUrl)}`}></i>`:f(e.icon||"disc")}coverList(e){if(!e)return[];const n=i.coverSets.get(e.id)?.items;return Array.isArray(n)?n.filter(s=>s?.preview):[]}carouselTip(e,n){if(!e)return"这首歌只有一张封面";const s=Number(i.config.coverCarouselInterval)||10;return n?"关闭封面轮播":`开启封面轮播（每 ${s} 秒换一张）`}openCoverPanel(e){!e||e.online||$t(()=>Promise.resolve().then(()=>Ii),void 0).then(n=>n.openCoverPanel(e.id))}toggleCarousel(){i.config.coverCarousel=!i.config.coverCarousel,k(),u(i.config.coverCarousel?`已开启封面轮播（每 ${Number(i.config.coverCarouselInterval)||10} 秒换一张）`:"已关闭封面轮播",{duration:1600})}}ee("mp-playerview",eh);function Vt(t,e={}){const n=e.min??0,s=e.max??1,a=e.step??.001;let r=ht(e.value??n,n,s),o=!1;const l=t.querySelector(".slider__fill"),d=t.querySelector(".slider__thumb"),p=t.querySelector(".slider__bubble");t.setAttribute("aria-valuemin",String(n)),t.setAttribute("aria-valuemax",String(s));function m(){const v=s===n?0:(r-n)/(s-n)*100;l&&(l.style.transform=`scaleX(${v/100})`),d&&(d.style.left=`${v}%`),p&&e.format&&(p.textContent=e.format(r)),t.setAttribute("aria-valuenow",String(Math.round(v)))}function h(v){const C=t.getBoundingClientRect();if(C.width<=0)return r;const q=ht((v.clientX-C.left)/C.width,0,1),F=n+q*(s-n),z=Math.round(F/a)*a;return ht(Number(z.toFixed(6)),n,s)}function g(v){if(!p)return;const C=t.getBoundingClientRect(),q=ht(v.clientX-C.left,0,C.width);p.style.left=`${q}px`}t.addEventListener("pointerdown",v=>{t.dataset.disabled!=="true"&&(v.preventDefault(),o=!0,t.dataset.dragging="true",t.setPointerCapture?.(v.pointerId),r=h(v),m(),g(v),e.onChange?.(r))}),t.addEventListener("pointermove",v=>{g(v),o&&(r=h(v),m(),e.onChange?.(r))});const S=v=>{o&&(o=!1,t.dataset.dragging="false",t.releasePointerCapture?.(v.pointerId),e.onCommit?.(r))};return t.addEventListener("pointerup",S),t.addEventListener("pointercancel",S),t.addEventListener("keydown",v=>{if(t.dataset.disabled==="true")return;const C=(s-n)/10,q=a*10;let F=r;switch(v.key){case"ArrowRight":case"ArrowUp":F=r+q;break;case"ArrowLeft":case"ArrowDown":F=r-q;break;case"PageUp":F=r+C;break;case"PageDown":F=r-C;break;case"Home":F=n;break;case"End":F=s;break;default:return}v.preventDefault(),r=ht(Number(F.toFixed(6)),n,s),m(),e.onChange?.(r),e.onCommit?.(r)}),m(),{get value(){return r},set(v,{silent:C=!1}={}){const q=ht(v,n,s);q===r&&!C||(r=q,m(),C||e.onChange?.(r))},setDisabled(v){t.dataset.disabled=v?"true":"false"},text(v=r){return e.format?e.format(v):String(v)},paint:m}}const Sa={sequence:{icon:"repeat",label:"列表循环"},"loop-all":{icon:"repeat",label:"列表循环"},"loop-one":{icon:"repeat-one",label:"单曲循环"},shuffle:{icon:"shuffle",label:"随机播放"}};function pl(t){const e=typeof t=="boolean"?t:!i.queueOpen;i.queueOpen=e,e&&(i.optionsOpen=!1),k()}function fl(t){const e=typeof t=="boolean"?t:!i.optionsOpen;i.optionsOpen=e,e&&(i.queueOpen=!1),k()}function hl(t){const e=typeof t=="boolean"?t:!i.sleepOpen;i.sleepOpen=e,k()}function th(t){const e=Math.round(Number(t)||0);if(e<=0){ml("已取消定时停止");return}i.sleepTimer={type:"duration",until:Date.now()+e*6e4,minutes:e},k(),u(`${e} 分钟后停止播放`,{duration:1800})}function ml(t){i.sleepTimer=null,k(),u(t,{duration:1400})}function nh(t){i.config.sleepAfterSong=!!t,k(),u(i.config.sleepAfterSong?"已开启：倒计时结束后等当前歌曲播完再停":"已关闭：倒计时结束后立即停止",{duration:2200})}function sh(){const t=i.sleepTimer;if(!(t?.type!=="duration"||Date.now()<t.until)){if(i.config.sleepAfterSong===!0&&i.playing&&i.currentId){i.sleepTimer={type:"after-song"},k(),u("定时到点：等这首播完就停",{duration:2400});return}i.sleepTimer=null,i.playing?Gt():k(),u("已按定时停止播放",{duration:1800})}}class ah extends me{static deps=e=>[e.currentId,e.playing,e.duration,e.volume,e.muted,e.playMode,e.likedIds,e.queue,e.songs,e.onlineSongs.size,e.queueOpen,e.optionsOpen,e.sleepOpen,e.sleepTimer,e.lyricsOpen,En()];constructor(){super(),this._progress=null,this._volume=null,this._tick=null}onConnected(){this._tick=setInterval(()=>{i.sleepTimer&&this.requestUpdate()},1e3),this._unsubscribers.push(In(()=>{this.isConnected&&this.paintProgress()}))}onDisconnected(){this._tick&&clearInterval(this._tick),this._tick=null}paintProgress(){if(Vu()){const r=this.querySelector("#time-current");r&&r.textContent!=="--:--"&&(r.textContent="--:--"),this._progress?.set(0,{silent:!0}),this._progress?.setDisabled(!0);return}const e=Math.round(i.position),n=Math.round(i.duration||0),s=this.querySelector("#time-current");if(s){const r=Mt(i.position);s.textContent!==r&&(s.textContent=r)}const a=this.querySelector("#progress");a&&a.dataset.dragging!=="true"&&n>0&&this._progress?.set(e/n*1e3,{silent:!0}),this._progress?.setDisabled(n<=0)}firstUpdated(){const e=this.querySelector("#progress");this._progress=Vt(e,{min:0,max:1e3,step:1,value:0,format:n=>Mt(n/1e3*(i.duration||0)),onChange:n=>{i.duration&&(i.position=n/1e3*i.duration,this.requestUpdate())},onCommit:n=>{i.duration&&Ee(n/1e3*i.duration)}}),this._volume=Vt(this.querySelector("#volume"),{min:0,max:1,step:.01,value:i.volume,format:n=>`${Math.round(n*100)}`,onChange:n=>{Aa(n),za(),this.requestUpdate()}})}updated(){this.paintProgress();const e=i.muted?0:i.volume,n=this.querySelector("#volume");n&&n.dataset.dragging!=="true"&&this._volume?.set(e,{silent:!0}),sh()}render(){const e=Ke(),n=i.currentId?st(i.currentId):!1,s=Sa[i.playMode]||Sa.sequence,a=i.muted?0:i.volume,r=a===0?"volume-mute":a<.5?"volume-low":"volume-high",o=e?kt(e):"",l=i.sleepTimer,d=l?.type==="duration"?Math.max(1,Math.ceil((l.until-Date.now())/6e4)):0,p=Ur(i.queue).length;return c`
      <footer class="playerbar" id="playerbar">
        <div class="playerbar__progress">
          <!-- #time-current 的文本由 updated() 直接写入，这里刻意不绑定（见那里的说明） -->
          <span class="progress__time" id="time-current"></span>
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
              <div class="slider__fill" id="progress-fill"></div>
            </div>
            <div class="slider__thumb"></div>
            <div class="slider__bubble" id="progress-bubble"></div>
          </div>
          <span class="progress__time progress__time--total" id="time-total">${Mt(i.duration)}</span>
        </div>

        <div class="playerbar__row">
          <div class="playerbar__now">
            <button
              class="playerbar__cover"
              id="bar-cover"
              type="button"
              data-tip="播放详情页"
              aria-label="播放详情页"
              @click=${()=>Qa()}
            >
              <img id="bar-cover-img" alt=${e?`${e.title} 封面`:""} src=${Ti(o)} />
              <svg class="playerbar__cover-icon"><use href="#i-expand"></use></svg>
            </button>
            <div class="playerbar__meta" id="bar-meta" data-tip="播放详情页" @click=${()=>Qa()}>
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
            >
              ${f("heart")}
            </button>
            <button
              class="playerbar__heart playerbar__add"
              id="bar-add"
              type="button"
              data-tip="添加到歌单"
              aria-label="添加到歌单"
              ?disabled=${!e}
              @click=${m=>this.openAddToPlaylistMenu(m.currentTarget)}
            >
              ${f("playlist-plus")}
            </button>
          </div>

          <div class="playerbar__center">
            <div class="transport">
              <button
                class="transport__btn"
                id="btn-prev"
                type="button"
                data-tip="上一曲"
                aria-label="上一曲"
                @click=${()=>ai()}
              >
                ${f("prev")}
              </button>
              <button
                class="transport__btn transport__btn--main"
                id="btn-play"
                type="button"
                data-tip=${i.playing?"暂停":"播放"}
                aria-label=${i.playing?"暂停":"播放"}
                @click=${()=>Gt()}
              >
                <svg id="icon-play"><use href="#i-${i.playing?"pause":"play"}"></use></svg>
              </button>
              <button
                class="transport__btn"
                id="btn-next"
                type="button"
                data-tip="下一曲"
                aria-label="下一曲"
                @click=${()=>Ut(!1)}
              >
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
                @click=${()=>{cc(),za()}}
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
              @click=${()=>{dc(),u((Sa[i.playMode]||s).label,{duration:1400})}}
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
              @click=${()=>Fo()}
            >
              ${f("lyric-match")}
            </button>
            <button
              class="mode-btn"
              id="btn-sleep"
              type="button"
              aria-pressed=${String(!!l)}
              data-tip=${this.sleepTip(l)}
              aria-label="定时停止"
              @click=${()=>hl()}
            >
              ${f("clock")}
              <span class="mode-btn__badge" id="sleep-count" ?hidden=${!d}>${d}</span>
            </button>
            <button
              class="mode-btn"
              id="btn-options"
              type="button"
              aria-pressed=${String(!!i.optionsOpen)}
              data-tip="选项"
              aria-label="选项"
              @click=${()=>fl()}
            >
              ${f("options")}
            </button>
            <button
              class="mode-btn"
              id="btn-playlist"
              type="button"
              aria-pressed=${String(!!i.queueOpen)}
              data-tip="播放列表"
              aria-label="播放列表"
              @click=${()=>{ih()}}
            >
              ${f("playlist")}
              <span class="mode-btn__badge" id="queue-count"
                >${p===0?"":p>99?"99+":String(p)}</span
              >
            </button>
          </div>
        </div>
      </footer>
    `}sleepTip(e){return e?.type==="duration"?`定时停止 · 剩余 ${Math.max(0,Math.round((e.until-Date.now())/1e3))} 秒`:e?.type==="after-song"?"定时停止 · 播完当前歌曲":"定时停止"}onLike(){if(!i.currentId)return;_t(i.currentId);const e=st(i.currentId);u(e?"已加入「我喜欢」":"已从「我喜欢」移除",{tone:e?"success":"info",duration:1500})}openAddToPlaylistMenu(e){const n=Ke();if(!n){u("还没有正在播放的歌曲",{duration:1600});return}const s=[];for(const a of i.playlists.filter(r=>!r.locked))s.push({id:a.id,label:a.name,icon:a.id==="liked"?"heart":"playlist",checked:a.songIds.includes(n.id)});s.length||s.push({id:"__none",label:"还没有可用的歌单",disabled:!0}),s.push({id:"__sep",kind:"sep"}),s.push({id:"__new",label:"新建歌单…",icon:"plus"}),Ft({anchor:e,x:0,y:0,align:"right",items:s,onPick:async a=>{if(!(a==="__none"||a==="__sep")){if(a==="__new"){$o(r=>{r&&$s(r.id,[n.id])});return}$s(a,[n.id])}}})}}function ih(){const t=i.queueOpen;pl(),!t&&i.currentId&&rh(()=>ol({notify:!1}))}function rh(t){let e=null,n=!1,s=0;const a=()=>{n||(n=!0,clearTimeout(s),e?.removeEventListener("transitionend",r),i.queueOpen&&t())},r=o=>{o.target===e&&a()};requestAnimationFrame(()=>{if(e=document.getElementById("queue-panel"),!e||e.hidden){a();return}e.addEventListener("transitionend",r),s=window.setTimeout(a,oh(e)+80)})}function oh(t){let e=0;for(const n of getComputedStyle(t).transitionDuration.split(",")){const s=n.trim(),a=parseFloat(s);Number.isFinite(a)&&(e=Math.max(e,s.endsWith("ms")?a:a*1e3))}return e}ee("mp-playerbar",ah);let Za="";function On(){return i.config.showDesktopLyrics===!0}async function Tr(t,{force:e=!1}={}){const n=!!t,s=On()!==n;if(i.config.showDesktopLyrics=n,Za="",!s&&!e)return fe(),{ok:!0,enabled:n,unchanged:!0};if(!$())return qs({enabled:n}),{ok:!0,preview:!0,enabled:n};try{const a=await b.desktopLyrics(n);return n&&a?.ok===!1&&(i.config.showDesktopLyrics=!1,fe()),a}catch(a){return console.warn("[desktop-lyrics] 打开/关闭桌面歌词失败",a),i.config.showDesktopLyrics=!1,fe(),{ok:!1,enabled:n,error:String(a?.message??a)}}}function lh({text:t="",trans:e=[],chars:n=[],words:s=[],wordEnds:a=[],posMs:r=0,atMs:o=0,playing:l=!1,fontSize:d=26}={}){if(!On())return;const p=Array.isArray(s)&&s.length>1,m=[t,l?1:0,Math.round(d),p?s.join(","):"",p?Math.round(r/250):""].join("|");if(m!==Za){if(Za=m,!$()){qs({text:t,playing:l});return}b.updateDesktopLyrics({text:t,trans:e,chars:p?n:[],words:p?s:[],wordEnds:p?a:[],posMs:Math.round(r),atMs:Math.round(o),playing:l,fontSize:d}).catch(h=>{console.warn("[desktop-lyrics] 同步歌词失败",h?.message??h)})}}function qs({text:t="",playing:e=!1,enabled:n=null}={}){const s=n===null?On():!!n,a=!$()&&s&&e&&!!t;i.floatingLyrics={show:a,text:t},fe()}function Bs(){return i.config.showDesktopWallpaper===!0}function xa(){fe()}async function ch(){if(!$())return!0;let t=!0,e="";try{const n=await b.desktopWallpaperState();t=n?.supported!==!1,e=n?.reason||""}catch(n){return console.info("[desktop-wallpaper] 能力探测失败",n?.message??n),!0}return t?!0:(i.desktopWallpaperSupport={supported:!1,reason:e||"当前系统不支持桌面背景歌词"},fe(),!1)}async function Ir(t,{force:e=!1}={}){const n=!!t,s=Bs()!==n;if(i.config.showDesktopWallpaper=n,xa(),!s&&!e)return{ok:!0,enabled:n,unchanged:!0};if(!$())return n?(ei(),{ok:!0,preview:!0,enabled:n}):(qs({enabled:!1}),{ok:!0,preview:!0,enabled:n});try{const a=await b.desktopWallpaper(n);return n&&a?.ok===!1?(i.config.showDesktopWallpaper=!1,xa(),k()):n&&(dh(),ei()),a}catch(a){return console.warn("[desktop-wallpaper] 打开/关闭桌面背景歌词失败",a),i.config.showDesktopWallpaper=!1,xa(),k(),{ok:!1,enabled:n,error:String(a?.message??a)}}}const D={setup:"",songId:"\0",cover:"\0",lyricsText:"\0",lyricsStatus:"\0",options:"",playing:null,volume:null,muted:null,duration:-1,lyricIndex:-2,position:-1,progressPlaying:null};function dh(){D.setup="",D.songId="\0",D.cover="\0",D.lyricsText="\0",D.options="",D.playing=null,D.volume=null,D.muted=null,D.duration=-1,D.lyricIndex=-2,D.position=-1,D.progressPlaying=null}function uh(){const t=[],e=ph();e.signature!==D.setup&&(D.setup=e.signature,t.push({type:"theme",skinId:e.skinId,themeId:e.theme,theme:e.theme,mode:e.mode,density:e.density,tokens:e.tokens}));const n=Bp(),s=Qo(),a=Fp({interactive:!1}),r=n.song?.id??"";r!==D.songId?(D.songId=r,D.cover=n.cover,D.lyricsText=n.lyrics.text,D.lyricIndex=n.lyrics.index,D.duration=s.duration,D.progressPlaying=s.playing,t.push({type:"song",song:n.song,cover:n.cover,covers:n.covers,coverIndex:n.coverIndex,lyrics:n.lyrics})):(n.cover!==D.cover&&(D.cover=n.cover,t.push({type:"media",cover:n.cover,covers:n.covers,coverIndex:n.coverIndex})),(n.lyrics.text!==D.lyricsText||n.lyrics.status!==D.lyricsStatus)&&(D.lyricsText=n.lyrics.text,D.lyricsStatus=n.lyrics.status,D.lyricIndex=n.lyrics.index,t.push({type:"lyrics",lyrics:n.lyrics})));const o=JSON.stringify(a);return o!==D.options&&(D.options=o,t.push({type:"options",options:a})),(s.playing!==D.playing||s.volume!==D.volume||s.muted!==D.muted)&&(D.playing=s.playing,D.volume=s.volume,D.muted=s.muted,t.push({type:"state",playing:s.playing,volume:s.volume,muted:s.muted})),(s.position!==D.position||n.lyrics.index!==D.lyricIndex||s.duration!==D.duration||s.playing!==D.progressPlaying)&&(D.position=s.position,D.lyricIndex=n.lyrics.index,D.duration=s.duration,D.progressPlaying=s.playing,t.push({type:"progress",position:s.position,duration:s.duration,playing:s.playing,lyricIndex:n.lyrics.index})),t}function ei(){if(Bs()){if(!$()){const t=Mp();qs({text:t.text,playing:Qo().playing});return}for(const t of uh())b.updateDesktopWallpaper(t).catch(e=>{console.warn("[desktop-wallpaper] 同步背景歌词失败",e?.message??e)})}}function ph(){const t=hh(),e=i.pvMode||i.config.playerViewMode||"",n=document.documentElement.dataset.theme||"",s=document.documentElement.dataset.mode||"dark",a=document.documentElement.dataset.density||"";return{skinId:e,theme:n,mode:s,density:a,tokens:t.values,signature:[e,n,s,a,t.signature].join("|")}}function fh(){const t=i.config||{};return[document.documentElement.dataset.theme||"",document.documentElement.dataset.mode||"",document.documentElement.dataset.density||"",t.glassBlurCustom?t.glassBlur:"",t.glassAlphaCustom?t.glassAlpha:"",t.accentFromCover?1:0,t.coverSeed||"",t.coverSeed2||"",t.animations===!1?0:1,t.animationsSpeed||"",t.lyricsFontSize,t.listDensity||""].join("|")}let Er="\0",Ar={};function hh(){const t=fh();return t!==Er&&(Er=t,Ar=mh()),{signature:t,values:Ar}}function mh(){const t=new Set(Object.keys(uc()));for(const s of document.styleSheets){let a=null;try{a=s.cssRules}catch{continue}bl(a,t,0)}const e=getComputedStyle(document.documentElement),n={};for(const s of t){const a=e.getPropertyValue(s).trim();!a||/[;{}]/.test(a)||(n[s]=a)}return n}function bl(t,e,n){if(!(!t||n>3))for(const s of t){if(s.style)for(const a of s.style)a.startsWith("--")&&e.add(a);s.cssRules&&bl(s.cssRules,e,n+1)}}const Q=Object.freeze({off:"off",lyrics:"lyrics",wallpaper:"wallpaper"});function ti(){return i.config.showDesktopWallpaper===!0?Q.wallpaper:i.config.showDesktopLyrics===!0?Q.lyrics:Q.off}async function bh(t){const e=vh(t),n=ti();if(e===n)return{ok:!0,mode:e,unchanged:!0};const s=await Dr(e);return s?.ok!==!1?{ok:!0,...s,mode:e}:n!==Q.off&&(await Dr(n))?.ok!==!1?{ok:!1,...s,mode:n,restored:!0}:{ok:!1,...s,mode:Q.off}}async function Dr(t){return t!==Q.lyrics&&await Tr(!1),t!==Q.wallpaper&&await Ir(!1),t===Q.lyrics?Tr(!0):t===Q.wallpaper?Ir(!0):{ok:!0}}function vh(t){return t===Q.lyrics?Q.lyrics:t===Q.wallpaper?Q.wallpaper:Q.off}const gh=[{value:"off",label:"关闭"},{value:"vocal",label:"清澈人声"},{value:"bass",label:"低音增强"},{value:"surround",label:"3D 环绕"}],vl=[{id:"opt-desktop-off",value:Q.off,label:"关闭",tip:"不在桌面上显示歌词"},{id:"opt-desktop-lyrics",value:Q.lyrics,label:"悬浮",tip:"在桌面上显示一行置顶歌词（独立透明窗口，整块都能拖动；鼠标移入可调样式与字号）"},{id:"opt-desktop-wallpaper",value:Q.wallpaper,label:"背景",tip:"把播放界面的背景铺满桌面、垫在桌面图标之下，歌词跟着画在上面（仅 Windows）"}];async function _h(t){const e=await bh(t);k();const n=vl.find(s=>s.value===t)?.label||"";return e.ok!==!1?(u(t===Q.off?"已关闭桌面歌词":`桌面歌词：${n}`,{duration:1400}),e):(u(`打不开：${e.reason||e.error||"未知原因"}`,{tone:"warning",duration:3200}),e.restored&&u("已保留原来的桌面歌词设置",{duration:1800}),e)}class Ln extends me{get open(){return!1}get panelEl(){return null}updated(){const e=this.panelEl;if(e){if(this.open){this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden?(e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{this.open&&(e.dataset.state="opened")})):e.dataset.state!=="opened"&&(e.dataset.state="opened");return}e.hidden||(e.dataset.state="closed",!this._closeTimer&&(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!this.open&&e&&(e.hidden=!0)},si()+40)))}}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),this._closeTimer=null,super.disconnectedCallback()}bindDismiss(e){const n=a=>{const r=this.panelEl;!r||r.hidden||r.contains(a.target)||a.target.closest?.(e)||this.close()},s=a=>{if(a.key!=="Escape")return;const r=this.panelEl;r&&!r.hidden&&this.close()};document.addEventListener("pointerdown",n),document.addEventListener("keydown",s),this._undismiss=()=>{document.removeEventListener("pointerdown",n),document.removeEventListener("keydown",s)}}close(){}}class yh extends Ln{static deps=e=>[e.queueOpen,e.queue,e.currentId,e.playing,En()];get open(){return!!i.queueOpen}get panelEl(){return this.querySelector("#queue-panel")}close(){pl(!1)}firstUpdated(){this.bindDismiss("#btn-playlist"),this.bindDrag()}updated(){super.updated(),this.bindDrag()}bindDrag(){const e=this.querySelector("#queue-panel-body");e&&(this._sortable&&this._sortable.el===e||(this._sortable?.destroy(),this._sortable=T.create(e,{draggable:".queue-item",animation:0,ghostClass:"is-dragging",onEnd:n=>{cl();const s=n.oldIndex,a=n.newIndex;if(s==null||a==null||s===a)return;const r=n.from,o=Array.from(r.children).filter(l=>l!==n.item);r.insertBefore(n.item,o[s]??null),Yr(s,a),u("已调整播放顺序 · 播放模式已切回列表循环",{duration:1600})}})))}disconnectedCallback(){this._sortable?.destroy(),this._sortable=null,this._undismiss?.(),super.disconnectedCallback()}render(){const e=i.queueOpen?i.queue.map(s=>Ve(s)).filter(Boolean):[],n=new Map;if(i.queueOpen)for(let s=0;s<i.queue.length;s+=1)n.set(i.queue[s],s);return c`
      <section class="queue-panel" id="queue-panel" hidden data-state="closed" aria-label="播放列表">
        <div class="queue-panel__head">
          <span class="queue-panel__title">播放列表</span>
          <span class="u-spacer"></span>
          <span class="queue-panel__count" id="queue-panel-count">${e.length} 首</span>
          <button
            class="queue-panel__btn u-hit"
            id="queue-locate"
            type="button"
            data-tip="定位到当前播放"
            aria-label="定位到当前播放"
            @click=${()=>ol()}
          >
            ${f("disc")}
          </button>
          <button
            class="queue-panel__btn u-hit"
            id="queue-clear"
            type="button"
            data-tip="清空列表"
            aria-label="清空列表"
            @click=${()=>{Gr(),u("播放列表已清空")}}
          >
            ${f("trash")}
          </button>
          <button
            class="queue-panel__btn u-hit"
            id="queue-close"
            type="button"
            data-tip="关闭"
            aria-label="关闭播放列表"
            @click=${()=>this.close()}
          >
            ${f("close")}
          </button>
        </div>
        <div
          class="queue-panel__body"
          id="queue-panel-body"
          @click=${s=>this.onClick(s)}
          @keydown=${s=>this.onKey(s)}
        >
          ${e.length?Se(e,s=>s.id,s=>this.item(s,n.get(s.id)??-1)):c`<div class="queue-panel__empty">播放列表是空的<br />从曲库把歌曲加进来</div>`}
        </div>
      </section>
    `}item(e,n){const s=e.id===i.currentId;return c`
      <div
        class="queue-item"
        data-queue-id=${e.id}
        aria-current=${String(s)}
        role="button"
        tabindex="0"
        draggable="true"
      >
        <span class="queue-item__index">${s&&i.playing?f("play"):n+1}</span>
        <span class="queue-item__cover"><img src=${Ti(kt(e))} alt="" loading="lazy" /></span>
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
        >
          ${f("close")}
        </button>
      </div>
    `}onClick(e){if(dl())return;const n=e.target.closest("[data-queue-del]");if(n){e.stopPropagation(),Ea(n.dataset.queueDel);return}const s=e.target.closest("[data-queue-id]");s&&Ia(s.dataset.queueId)}onKey(e){if(e.key!=="Enter"&&e.key!==" ")return;const n=e.target.closest?.("[data-queue-id]");n&&(e.preventDefault(),Ia(n.dataset.queueId))}}ee("mp-queue-panel",yh);class wh extends Ln{static deps=e=>[e.optionsOpen,e.config.lyricsFontSize,e.config.glassAlpha,e.config.glassAlphaCustom,e.config.effectPreset,e.config.showLyrics,e.config.showDesktopLyrics,e.config.showDesktopWallpaper];get open(){return!!i.optionsOpen}get panelEl(){return this.querySelector("#options-panel")}close(){fl(!1)}firstUpdated(){this.bindDismiss("#btn-options"),this._sliders={size:Vt(this.querySelector("#opt-lyric-size"),{min:fs,max:hs,step:1,value:i.config.lyricsFontSize,format:e=>`${Math.round(e)}px`,onChange:e=>{i.config.lyricsFontSize=e,Pt("--lyric-size",oi(e)),this.requestUpdate()},onCommit:()=>k()}),alpha:Vt(this.querySelector("#opt-alpha"),{min:20,max:95,step:1,value:i.config.glassAlphaCustom?i.config.glassAlpha:Oa(),format:e=>`${Math.round(e)}%`,onChange:e=>{i.config.glassAlpha=e,i.config.glassAlphaCustom=!0,li(e),this.requestUpdate()},onCommit:()=>k()})}}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}render(){const e=Math.round(i.config.lyricsFontSize),n=Math.round(i.config.glassAlphaCustom?i.config.glassAlpha:Oa()),s=ti();return c`
      <section class="options-panel" id="options-panel" hidden data-state="closed" aria-label="播放选项">
        <div class="options-panel__head">
          <svg class="options-panel__icon" aria-hidden="true"><use href="#i-options"></use></svg>
          <span class="options-panel__title">播放选项</span>
          <span class="u-spacer"></span>
          <button
            class="options-panel__btn u-hit"
            id="options-close"
            type="button"
            data-tip="关闭"
            aria-label="关闭选项"
            @click=${()=>this.close()}
          >
            ${f("close")}
          </button>
        </div>
        <div class="options-panel__body" id="options-panel-body">
          <div class="opt" data-opt="lyric-size">
            <div class="opt__head">
              <span class="opt__icon">${f("text-size")}</span>
              <span class="opt__label">歌词字号</span>
              <span class="opt__value" id="opt-lyric-size-val">${e}px</span>
            </div>
            <div class="opt__control">
              <span class="opt__range">${fs}</span>
              <div class="slider" id="opt-lyric-size" role="slider" tabindex="0" aria-label="歌词字号">
                <div class="slider__rail"><div class="slider__fill"></div></div>
                <div class="slider__thumb"></div>
                <div class="slider__bubble"></div>
              </div>
              <span class="opt__range">${hs}</span>
            </div>
          </div>
          <div class="opt" data-opt="show-lyrics">
            <div class="opt__head">
              <span class="opt__icon">${f("lyrics")}</span>
              <span class="opt__label">显示歌词</span>
              <span class="u-spacer"></span>
              <button
                class="switch"
                type="button"
                role="switch"
                id="opt-show-lyrics"
                aria-checked=${String(i.config.showLyrics!==!1)}
                aria-label="显示歌词"
                @click=${()=>this.toggleShowLyrics()}
              ></button>
            </div>
          </div>
          <div class="opt" data-opt="desktop">
            <div class="opt__head">
              <span class="opt__icon">${f("desktop-lyrics")}</span>
              <span class="opt__label">桌面歌词</span>
            </div>
            <div class="opt__control">
              <div class="segmented" role="radiogroup" aria-label="桌面歌词">
                ${vl.map(a=>c`<button
                      class="segmented__btn"
                      type="button"
                      role="radio"
                      id=${a.id}
                      data-mode=${a.value}
                      aria-checked=${String(a.value===s)}
                      ?disabled=${a.value===Q.wallpaper&&i.desktopWallpaperSupport?.supported===!1}
                      data-tip=${a.value===Q.wallpaper&&i.desktopWallpaperSupport?.supported===!1?i.desktopWallpaperSupport.reason:a.tip}
                      @click=${()=>this.pickDesktopMode(a)}
                    >
                      ${a.label}
                    </button>`)}
              </div>
            </div>
          </div>
          <div class="opt" data-opt="effect">
            <div class="opt__head">
              <span class="opt__icon">${f("eq")}</span>
              <span class="opt__label">音效</span>
            </div>
            <div class="opt__control">
              <div class="segmented segmented--wrap" data-segment="effectPreset">
                ${gh.map(a=>c`<button
                      class="segmented__btn"
                      type="button"
                      data-value=${a.value}
                      aria-pressed=${String(a.value===(i.config.effectPreset||"off"))}
                      @click=${()=>this.pickEffect(a.value)}
                    >
                      ${a.label}
                    </button>`)}
              </div>
            </div>
          </div>
          <div class="opt" data-opt="alpha">
            <div class="opt__head">
              <span class="opt__icon">${f("opacity")}</span>
              <span class="opt__label">背景不透明度</span>
              <span class="opt__value" id="opt-alpha-val">${n}%</span>
            </div>
            <div class="opt__control">
              <span class="opt__swatch" aria-hidden="true"></span>
              <div class="slider" id="opt-alpha" role="slider" tabindex="0" aria-label="背景不透明度">
                <div class="slider__rail"><div class="slider__fill"></div></div>
                <div class="slider__thumb"></div>
                <div class="slider__bubble"></div>
              </div>
              <span class="opt__swatch opt__swatch--solid" aria-hidden="true"></span>
            </div>
          </div>
        </div>
      </section>
    `}pickDesktopMode(e){e.value!==ti()&&_h(e.value)}toggleShowLyrics(){i.config.showLyrics=i.config.showLyrics===!1,k()}pickEffect(e){e!==(i.config.effectPreset||"off")&&(i.config.effectPreset=e,Do(),k())}}ee("mp-options-panel",wh);class $h extends Ln{static deps=e=>[e.sleepOpen,e.sleepTimer,e.config.sleepAfterSong,e.playing,e.currentId];get open(){return!!i.sleepOpen}get panelEl(){return this.querySelector("#sleep-panel")}close(){hl(!1)}constructor(){super(),this._tick=null,this._pendingMinutes=null}onConnected(){this._tick=setInterval(()=>{i.sleepOpen&&i.sleepTimer&&this.requestUpdate()},1e3)}onDisconnected(){this._tick&&clearInterval(this._tick),this._tick=null}firstUpdated(){this.bindDismiss("#btn-sleep"),this._slider=Vt(this.querySelector("#sleep-slider"),{min:0,max:300,step:1,value:0,format:e=>`${Math.round(e)} 分钟`,onChange:e=>{this._pendingMinutes=Math.round(e),this.requestUpdate()},onCommit:e=>{this._pendingMinutes=null,th(e)}})}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}updated(){super.updated();const e=i.sleepTimer,n=this.querySelector("#sleep-slider");if(e?.type==="duration"){const s=Math.max(0,e.until-Date.now());n?.dataset.dragging!=="true"&&this._slider?.set(Math.max(0,Math.round(s/6e4)),{silent:!0})}else n?.dataset.dragging!=="true"&&this._slider?.set(0,{silent:!0})}render(){const e=i.sleepTimer,n=kh(e,this._pendingMinutes);return c`
      <section class="sleep-panel" id="sleep-panel" hidden data-state="closed" aria-label="定时停止">
        <div class="sleep-panel__head">
          <svg class="sleep-panel__icon" aria-hidden="true"><use href="#i-clock"></use></svg>
          <span class="sleep-panel__title">定时停止</span>
          <span class="u-spacer"></span>
          <button
            class="options-panel__btn u-hit"
            id="sleep-close"
            type="button"
            data-tip="关闭"
            aria-label="关闭定时停止"
            @click=${()=>this.close()}
          >
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
              @click=${()=>nh(!i.config.sleepAfterSong)}
            ></button>
          </div>
          <div class="sleep-panel__row">
            <button
              class="btn btn--sm"
              type="button"
              data-sleep-act="off"
              @click=${()=>ml("已取消定时停止")}
            >
              ${f("close")}<span>取消定时</span>
            </button>
          </div>
          <div class="sleep-panel__hint">
            「歌曲播放完成后停止」打开时，倒计时到点如果这首还没播完，会等它播完再停 （不会在歌曲中途打断）。拖到 0
            分钟即取消定时；设置从松手那一刻开始倒计时。
          </div>
        </div>
      </section>
    `}}function kh(t,e){if(typeof e=="number")return e<=0?{value:"未开启",sub:"拖到 0 即取消"}:{value:`${e} 分钟`,sub:"松手开始倒计时"};if(t?.type==="after-song")return{value:"等待本首播完",sub:"倒计时已结束，这首播完就暂停"};if(t?.type==="duration"){const n=Math.max(0,t.until-Date.now());return{value:`剩余 ${Sh(n)}`,sub:`共 ${t.minutes} 分钟`}}return{value:"未开启",sub:"拖动滑块设置时长"}}function Sh(t){const e=Math.max(0,Math.round(t/1e3)),n=Math.floor(e/3600),s=Math.floor(e%3600/60),a=e%60;return n>0?`${n} 小时 ${String(s).padStart(2,"0")} 分`:`${String(s).padStart(2,"0")}:${String(a).padStart(2,"0")}`}ee("mp-sleep-panel",$h);class xh extends Ln{static deps=()=>{const e=fn();return[e.open,e.revision]};get open(){return fn().open}get panelEl(){return this.querySelector("#download-panel")}close(){qd()}firstUpdated(){this.bindDismiss("#btn-downloads")}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}render(){const{tasks:e,running:n}=fn(),s=e.some(a=>a?.state!=="running");return c`
      <section class="download-panel" id="download-panel" hidden data-state="closed" aria-label="下载任务">
        <div class="download-panel__head">
          <svg class="download-panel__icon" aria-hidden="true"><use href="#i-download"></use></svg>
          <span class="download-panel__title">下载任务</span>
          <span class="download-panel__count" id="download-panel-count">
            ${n?`${n} 个下载中`:`共 ${e.length} 个`}
          </span>
          <button
            class="download-panel__btn"
            id="download-open-dir"
            type="button"
            data-tip="打开下载目录"
            aria-label="打开下载目录"
            @click=${()=>Fd()}
          >
            ${f("folder")}
          </button>
          <button
            class="download-panel__btn u-hit"
            id="download-clear"
            type="button"
            data-tip="清除已完成"
            aria-label="清除已完成"
            ?disabled=${!s}
            @click=${()=>Bd()}
          >
            ${f("trash")}
          </button>
          <button
            class="download-panel__btn u-hit"
            id="download-close"
            type="button"
            data-tip="关闭"
            aria-label="关闭下载任务面板"
            @click=${()=>this.close()}
          >
            ${f("close")}
          </button>
        </div>
        <div class="download-panel__body" id="download-panel-body">
          ${e.length?Se(e,a=>a.id,a=>this.item(a)):c`<div class="download-panel__empty">还没有下载任务</div>`}
        </div>
      </section>
    `}item(e){const n=e.state==="running"?"running":e.state==="failed"?"failed":"done",s=Number(e.total)||0,a=Number(e.done)||0,r=s>0?Math.min(100,Math.round(a/s*100)):0,o=Math.max(0,Math.min(100,Math.round(r/5)*5)),l=n==="running";let d=`${r}%`;n==="done"?d="已完成":n==="failed"?d="失败":s<=0&&(d="下载中");let p;return l?p=s>0?`${jn(a)} / ${jn(s)}`:jn(a):n==="done"?p=`${jn(a||s)} · ${e.path?Ch(e.path):e.dir||""}`:p=e.message||"下载失败",c`
      <div
        class="download-item"
        data-state=${n}
        data-download-id=${e.id}
        role=${n==="done"?"button":x}
        tabindex=${n==="done"?"0":x}
        data-tip=${n==="done"?"在文件夹中显示":x}
        @click=${()=>Ud(e.id)}
      >
        <div class="download-item__title">${e.title||e.bvid||"未命名"}</div>
        <div class="download-item__state">${d}</div>
        <div class="download-item__bar" ?hidden=${!l} data-unknown=${s>0?"false":"true"}>
          <div class="download-item__fill" data-value=${o}></div>
        </div>
        <div class="download-item__meta${n==="failed"?" download-item__meta--error":""}">${p}</div>
      </div>
    `}}ee("mp-download-panel",xh);function jn(t){const e=Number(t)||0;if(e<=0)return"0 B";const n=["B","KB","MB","GB"];let s=0,a=e;for(;a>=1024&&s<n.length-1;)a/=1024,s+=1;return`${a>=10||s===0?Math.round(a):a.toFixed(1)} ${n[s]}`}function Ch(t){const e=String(t||""),n=Math.max(e.lastIndexOf("\\"),e.lastIndexOf("/"));return n>=0?e.slice(n+1):e}class Th extends Ln{static deps=()=>[B.open,B.songId,B.rev,En(),i.config.coverCarousel,i.config.embedMeta];get open(){return B.open}get panelEl(){return this.querySelector("#cover-layer")}close(){un()}render(){const e=this.song();return c`
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
            <button
              class="cover-layer__close u-hit"
              type="button"
              data-cover-close
              aria-label="关闭封面管理"
              @click=${()=>un()}
            >
              ${f("close")}
            </button>
          </div>
          <div class="cover-layer__body" id="cover-layer-body">${e&&this.open?this.panel(e):x}</div>
        </div>
      </div>
    `}song(){const e=B.songId;return e&&i.songs.find(n=>n.id===e)||null}panel(e){const n=B,s=Cl(e);return c`
      <div class="cover-panel">
        <div class="cover-panel__current">
          <div class="cover-panel__frame" id="cover-current-frame">
            ${s?c`<img src=${s} alt=${e.title} 原始封面 />`:c`<span class="cover-panel__none">${f("music")}</span>`}
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
            >
              ${f("tag")}<span>写入歌曲文件</span>
            </button>
            <button
              class="btn btn--sm"
              type="button"
              data-cover-act="carousel"
              id="cover-carousel-btn"
              aria-pressed=${String(i.config.coverCarousel===!0)}
              @click=${()=>this.toggleCarousel()}
            >
              ${f("slideshow")}<span>轮播</span>
            </button>
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
              @input=${a=>{B.keyword=a.target.value}}
            />
            <button
              class="btn btn--primary btn--sm"
              type="button"
              data-cover-act="search"
              ?disabled=${n.busy}
              @click=${()=>this.runSearch()}
            >
              ${f("search")}<span>联网搜索</span>
            </button>
            <button class="btn btn--sm" type="button" data-cover-act="local" @click=${()=>this.pickLocal()}>
              ${f("image")}<span>选择本地图片</span>
            </button>
          </div>
          <div class="cover-panel__hint">
            下载来的文件常常没有标签，标题是从文件名推出来的，直接搜不容易命中；
            在这里填一个更准确的关键词会准很多。也可以直接选一张本地图片 ——
            两种结果都会出现在下面：联网搜索默认不勾选，本地图片默认已勾选， 确认后点「应用」。
          </div>
        </div>

        <div class="cover-panel__status" id="cover-status">${n.status}</div>
        <div class="cover-panel__grid" id="cover-grid">${this.cards()}</div>
        <div class="cover-panel__selectbar" id="cover-selectbar" ?hidden=${!n.candidates.length}>
          ${n.candidates.length?this.selectbar():x}
        </div>

        <div class="cover-panel__foot">
          <button class="btn btn--sm" type="button" data-cover-act="open-cache" @click=${()=>this.openCacheDir()}>
            ${f("folder")}<span>打开缓存目录</span>
          </button>
        </div>
      </div>
    `}setItems(){const e=B,n=e.currentSet?.items||[],s=e.currentSet?.embedded||[],a=Number(e.currentSet?.active)||0;return!n.length&&!s.length?c`<div class="cover-set__empty">还没有换过封面，这首歌现在用的是文件自带的封面。</div>`:c`
      ${n.map((r,o)=>c`
          <div class="cover-set__item" data-set-index=${o} data-active=${String(o===a)}>
            <img src=${r.preview} alt="" />
            ${o===a?c`<span class="cover-set__badge">当前</span>`:x}
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
      ${s.map(r=>c`
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
    `}cards(){const e=B;return Se(e.candidates,n=>n.preview,(n,s)=>{const a=e.selected.has(n);return c`
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
        `})}selectbar(){const e=B,n=e.selected.size===e.candidates.length;return c`
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
    `}onClick(e){if(e.target.closest("[data-cover-close]")||e.target===this.panelEl){un();return}const n=e.target.closest("[data-set-act]");if(n){const s=Number(n.closest("[data-set-index]")?.dataset.setIndex);n.dataset.setAct==="use"&&this.useExisting(s),n.dataset.setAct==="remove"&&this.removeExisting(s)}}onKey(e){if(e.key!=="Escape")return;const n=this.querySelector("#cover-keyword");if(n&&document.activeElement===n&&n.value.trim()){B.keyword="",n.value="";return}un()}toggleCandidate(e){const n=B.candidates[e];n&&(B.selected.has(n)?B.selected.delete(n):B.selected.add(n),Be())}selectAll(){const e=B;e.selected.size===e.candidates.length?e.selected.clear():e.candidates.forEach(n=>e.selected.add(n)),Be()}async runSearch(){const e=B;if(e.busy)return;if(!$()){ne("浏览器预览下没有联网封面后端，请在应用里试");return}e.busy=!0;const n=e.candidates.filter(a=>a.local);e.candidates=[...n],e.selected=new Set(n),Be();const s=(this.querySelector("#cover-keyword")?.value||"").trim();ne(s?`正在按「${s}」同时查询多个来源（${Mr()}）…`:`正在同时查询多个来源（${Mr()}）…`);try{const a=s?{keyword:s}:{},r=await b.coverLookupSongAll(e.songId,a),o=Array.isArray(r)?r.filter(l=>l?.ok&&l.preview):[];if(o.length){e.candidates=[...n,...o.map(d=>({...d,local:!1}))];const l=[...new Set(o.map(d=>d.provider).filter(Boolean))];ne(`找到 ${o.length} 张（来源：${l.join(" / ")||"未知"}），勾选后点「应用」`)}else{e.candidates=[...n];const l=Array.isArray(r)?r.find(d=>d?.message)?.message:"";ne(l||"没有找到匹配的封面（也可能是匹配到的都是空白图，已自动丢弃）")}}catch(a){ne(`搜索失败：${a?.message??a}`)}finally{e.busy=!1,Be()}}async pickLocal(){const e=B;if(!$()){ne("浏览器预览下没有系统文件选择器，请在应用里试");return}ne("正在读取图片…");try{const n=await b.coverPickLocal();if(!n||n.cancelled){ne("");return}if(!n.ok||!n.preview){ne(n?.message||"这张图片没法用作封面");return}const s={preview:n.preview,provider:n.provider||"本地图片",source:n.source||"",width:n.width,height:n.height,local:!0};e.candidates.unshift(s),e.selected.add(s),Be(),ne(`已加入本地图片${n.source?`（${n.source}）`:""}，确认后点「应用」`)}catch(n){ne(`选择图片失败：${n?.message??n}`)}}async applySelected(){const e=B.candidates.filter(n=>B.selected.has(n)).map(n=>n.preview).filter(Boolean);if(!e.length){ne("先勾选至少一张封面");return}await this.writeCovers(()=>b.coverAddMany(B.songId,e,i.config.embedMeta===!0))}async useExisting(e){Number.isFinite(e)&&await this.writeCovers(()=>b.coverSetActive(B.songId,e))}async useEmbedded(e){e?.preview&&await this.writeCovers(()=>b.coverAdd(B.songId,"",e.preview,i.config.embedMeta===!0))}async removeExisting(e){Number.isFinite(e)&&await this.writeCovers(()=>b.coverRemove(B.songId,e))}async openCacheDir(){try{await b.coverOpenCacheDir("covers")}catch(e){u(`打开缓存目录失败：${e?.message??e}`,{tone:"error",duration:5e3})}}async writeCovers(e){const n=B;if(!$()){ne("浏览器预览下没有封面后端，请在应用里试");return}ne("正在保存…");try{const s=await e();s&&Array.isArray(s.items)&&(n.currentSet=s,Da(n.songId,s)),ne(s?.message||"已更新封面"),br(),u(s?.message||"封面已更新",{tone:"success",duration:1800})}catch(s){ne(`保存失败：${s?.message??s}`)}}toggleCarousel(){i.config.coverCarousel=!i.config.coverCarousel,k(),u(i.config.coverCarousel?`已开启封面轮播（每 ${Number(i.config.coverCarouselInterval)||10} 秒换一张）`:"已关闭封面轮播",{duration:1600})}toggleEmbed(){i.config.embedMeta=!i.config.embedMeta,k(),u(i.config.embedMeta?"之后的封面会写进歌曲文件本身":"封面只保存在缓存目录（不改动音乐文件）",{duration:2200})}async refreshSet(){const e=B;if(!(!$()||!e.songId))try{const n=await b.coverList(e.songId);n&&Array.isArray(n.items)&&(e.currentSet=n,Da(e.songId,n),br())}catch(n){ne(`读取现有封面失败：${n?.message??n}`)}}}ee("mp-cover-layer",Th);const B={open:!1,songId:"",candidates:[],selected:new Set,currentSet:null,busy:!1,status:"",keyword:"",rev:0};function Be(){B.rev+=1,fe()}function ne(t){B.status=t||"",Be()}const Ih=()=>document.querySelector("mp-cover-layer");function Mr(){return _i(i.coverProviders,qo())}function Eh(t){if(!i.songs.find(s=>s.id===t)){u("这首歌不在本地曲库里，无法更换封面",{tone:"warning"});return}Object.assign(B,{open:!0,songId:t,candidates:[],selected:new Set,currentSet:i.coverSets.get(t)||null,status:"",keyword:""}),Be(),Ih()?.refreshSet(),Ah()}function un(){B.open=!1,Be()}async function Ah(){if(!(i.coverProviders?.length||!$()))try{const t=await b.coverProviders();Array.isArray(t?.providers)&&t.providers.length&&(i.coverProviders=t.providers,Be())}catch{}}const Tt=[{id:"library",label:"曲库"},{id:"player",label:"播放器"},{id:"ui",label:"用户界面"},{id:"data",label:"下载与缓存"},{id:"ai",label:"AI"},{id:"about",label:"关于"}],Dh=[{value:-14,label:"较响（流媒体常见）"},{value:-16,label:"推荐（默认）"},{value:-18,label:"温和"},{value:-23,label:"广播级"}],Mh=[{value:"off",label:"关闭"},{value:"track",label:"逐曲均衡"},{value:"album",label:"同专辑统一"}];function P({label:t,hint:e,control:n}){return c` <div class="setting">
    <div class="setting__main">
      <div class="setting__label">${t}</div>
      ${e?c`<div class="setting__hint">${e}</div>`:x}
    </div>
    <div class="setting__control">${n}</div>
  </div>`}function J(t,e,n){return c`<button
    class="switch"
    type="button"
    role="switch"
    aria-checked=${String(!!e)}
    data-toggle=${t}
    aria-label=${n}
  ></button>`}function Ce(t,e,n){return c` <div class="segmented" data-segment=${t}>
    ${e.map(s=>c`<button
          class="segmented__btn"
          type="button"
          data-value=${s.value}
          aria-pressed=${String(String(s.value)===String(n))}
        >
          ${s.label}
        </button>`)}
  </div>`}function Ph(t){const e=t.aiVendor||"auto",n=ko(e),s="开启后模型会先推理再给结论，响应更慢；关闭则直接作答";return e==="auto"?s+"；自动识别："+(n||"按接口地址与模型名判断厂商"):n?s+"；该厂商："+n:s}function rn(t,e,n){return c` <div class="rangeslider">
    <div class="slider" id=${t} role="slider" tabindex="0" aria-label=${n} data-slider=${e}>
      <div class="slider__rail"><div class="slider__fill"></div></div>
      <div class="slider__thumb"></div>
      <div class="slider__bubble"></div>
    </div>
    <!-- 数值由滑杆自己写（见 sliderOptions 的 onChange）：同一个节点只允许一个写入方 -->
    <span class="rangeslider__value"></span>
  </div>`}function Oh(t){const e=Number(t);i.config.trackGapSeconds=Number.isFinite(e)?e:1,mi()}function Lh(t,e){if(t===e)return!0;if(!t||!e||t.length!==e.length)return!1;for(let n=0;n<t.length;n+=1)if(t[n]!==e[n])return!1;return!0}class Rh extends me{static deps=e=>[e.settingsOpen,e.settingsRev,e.settingsSection,e.view,e.folders,e.filterRules,e.songs,e.allSongsRaw,e.lastScan?.at??0,e.scanning,cd(),Go(),e.config,e.coverProviders,e.coverBreaker,e.coverCache,nr().rev,e.loudnessState,e.ffmpegState,e.updateRev];constructor(){super(),this._activeSection=Tt[0].id,this._navPausedUntil=0,this._navResumeTimer=null,this._sliders=new WeakMap,this._derivedKey=null,this._derived=null,this._throttledNavFollow=Tl(e=>this.navFollow(e))}settingsDerived(){const e=[i.songs,i.allSongsRaw,i.folders,i.filterRules,i.songs.length,i.allSongsRaw.length];if(this._derivedKey&&Lh(this._derivedKey,e))return this._derived;const n=new Map;for(const o of i.folders){let l=0;for(const d of i.songs)d.path.startsWith(o.path)&&(l+=1);n.set(o.id,l)}const s=Xr(i.allSongsRaw,i.filterRules);let a=0,r=0;for(const o of i.songs)a+=o.duration,r+=o.size;return this._derivedKey=e,this._derived={perFolder:n,rules:s,totalDuration:a,totalBytes:r},this._derived}get open(){return to()}get panelEl(){return this.querySelector("#settings-layer")}updated(){const e=this.panelEl;if(e){if(this.open){if(this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden){e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{this.open&&(e.dataset.state="opened")});const n=this.querySelector(".settings-layer__body");n&&(n.scrollTop=0)}this.bindSliders(),xf();return}e.hidden||(e.dataset.state="closed",!this._closeTimer&&(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!this.open&&e&&(e.hidden=!0)},si()+40)))}}onConnected(){this._onScrollCapture=e=>this.onScroll(e),this.addEventListener("scroll",this._onScrollCapture,!0)}onDisconnected(){this._onScrollCapture&&(this.removeEventListener("scroll",this._onScrollCapture,!0),this._onScrollCapture=null),this._navResumeTimer&&clearTimeout(this._navResumeTimer),this._navResumeTimer=null}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),this._closeTimer=null,super.disconnectedCallback()}render(){return wr(),c`
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
            <button
              class="settings-layer__close u-hit"
              type="button"
              data-settings-close
              aria-label="关闭设置"
              @click=${()=>ms()}
            >
              ${f("close")}
            </button>
          </div>
          <div class="settings-layer__body">
            <div class="settings">
              <div class="settings__nav" role="tablist">
                ${Tt.map(e=>c`<button
                      class="settings__nav-item"
                      type="button"
                      role="tab"
                      data-goto=${e.id}
                      aria-selected=${String(e.id===this._activeSection)}
                    >
                      ${e.label}
                    </button>`)}
              </div>
              <!--
                卡片顺序 = 导航条顺序（SECTIONS 的顺序），同一分类的卡片必须连成一段。
                navFollow() 是按文档顺序取 [data-section] 算高亮的，所以顺序不能随意调：
                某个分类的卡片被别的分类夹断，滚到后一段时高亮就会跳回去。

                分类内部按「常用的靠前」排：
                  · 用户界面 —— 主题（常换）在最前，接着是播放界面样式（装完基本不动）、
                                歌曲列表，最后是窗口与系统（一次设定基本不再动）；
                  · 关于 —— 版本更新在前，应用信息与资料（看过一次就够）在后。
              -->
              ${this.foldersCard()} ${this.rulesCard()} ${this.playbackCard()} ${this.lyricsCard()}
              ${this.loudnessCard()} ${this.themeCard()} ${this.playerCard()} ${this.listCard()} ${this.systemCard()}
              ${this.onlineCard()} ${this.aiCard()} ${this.updateCard()} ${this.aboutCard()} ${this.techCard()}
              ${this.libsCard()} ${this.licenseCard()} ${this.creditsCard()}
            </div>
          </div>
        </div>
      </section>
    `}foldersCard(){const e=this.settingsDerived(),n=Vr(),s=n.length?n.map(a=>{const r=a.status==="ok"?c`<span class="chip chip--ok"
                  ><i class="chip__dot"></i>${a.watching?"监听中":"已停止监听"}</span
                >`:a.status==="missing"?c`<span class="chip chip--error"><i class="chip__dot"></i>路径不存在</span>`:a.status==="denied"?c`<span class="chip chip--warn"><i class="chip__dot"></i>无访问权限</span>`:a.status==="partial"?c`<span class="chip chip--warn"><i class="chip__dot"></i>部分子目录读不到</span>`:a.status==="error"?c`<span class="chip chip--error"><i class="chip__dot"></i>扫描出错</span>`:c`<span class="chip chip--warn"><i class="chip__dot"></i>状态未知</span>`,o=e.perFolder.get(a.id)??0;return c` <div class="pathrow" data-folder=${a.id}>
            <svg class="pathrow__icon" aria-hidden="true"><use href="#i-folder"></use></svg>
            <div class="pathrow__main">
              <div class="pathrow__path u-selectable" title=${a.path}>${a.path}</div>
              <div class="pathrow__meta">${r}<span>${E(o)} 首</span></div>
            </div>
            <button class="btn btn--ghost btn--sm" type="button" data-act="rescan-folder" data-id=${a.id}>
              ${f("refresh")}<span>重新扫描</span>
            </button>
            <button
              class="btn btn--ghost btn--sm"
              type="button"
              data-act="remove-folder"
              data-id=${a.id}
              aria-label="移除文件夹"
            >
              ${f("trash")}
            </button>
          </div>`}):c`<div class="setting__hint">还没有添加音乐文件夹。</div>`;return c` <section class="card" id="sec-folders" data-section="library">
      <div class="card__head">
        <div class="card__icon">${f("folder")}</div>
        <div class="card__titles">
          <div class="card__title">音乐文件夹</div>
          <div class="card__desc">添加本地音乐目录，程序会扫描并实时监听其中的变化</div>
        </div>
        <div class="card__actions">
          <button class="btn" type="button" data-act="scan-now">${f("refresh")}<span>重新扫描</span></button>
          <button class="btn btn--primary" type="button" data-act="add-folder">
            ${f("folder-plus")}<span>添加文件夹</span>
          </button>
        </div>
      </div>
      <div class="card__body">
        ${s}
        <div class="setting setting--group-start">
          <div class="setting__main">
            <div class="setting__label">启动时自动扫描</div>
            <div class="setting__hint">应用启动后在后台增量扫描一次</div>
          </div>
          <div class="setting__control">
            ${J("autoScanOnStart",i.config.autoScanOnStart,"启动时自动扫描")}
          </div>
        </div>
        ${P({label:"实时监听文件夹变化",hint:"新增、删除、重命名文件后自动更新曲库（需要后端文件监听）",control:J("watchFolders",i.config.watchFolders,"实时监听")})}
        ${P({label:"元数据并发读取",hint:"同时解析的音频文件数量，机械硬盘建议调低",control:Ce("scanConcurrency",[2,4,8].map(a=>({value:String(a),label:`${a}`})),String(i.config.scanConcurrency))})}
      </div>
      <div class="card__foot">
        <span>支持格式：mp3 · flac · wav · m4a · ogg · aac（ape / wma 需转码）</span>
        <span class="u-num">${E(n.length)} 个文件夹</span>
      </div>
      ${this.unplayableSection()}
    </section>`}unplayableSection(){const e=i.unplayableFiles||[],n=e.length,s=!i.unplayableLoaded,a=i.unplayableOpen===!0;return!n&&!s?c` <div class="unplayable unplayable--empty">
        <span class="unplayable__ok">${f("check")}</span>
        <span>没有发现放不出来的文件</span>
        <span class="unplayable__hint">播放时若某个文件解不出来，会自动记录到这里</span>
      </div>`:c` <div class="unplayable">
      <button
        class="unplayable__head"
        type="button"
        data-act="unplayable-toggle"
        aria-expanded=${String(a)}
        ?disabled=${s}
      >
        <span class="unplayable__icon">${f("info")}</span>
        <span class="unplayable__label">
          ${s?c`正在读取清单…`:c`发现 <b>${E(n)}</b> 个无法播放的文件`}
        </span>
        ${s?x:c`<span class="unplayable__cta">${a?"收起":"查看是哪些文件"}</span>`}
        ${s?x:c`<span class="unplayable__chev" data-open=${String(a)}
                >${f(a?"chevron-down":"chevron-right")}</span
              >`}
      </button>
      ${a&&n?this.unplayableList(e):x}
    </div>`}unplayableList(e){return c` <div class="unplayable__body">
      <div class="unplayable__rows">
        ${e.map(n=>{const s=n.path?n.path:n.songId||"";return c` <div class="unplayable__row">
            <div class="unplayable__main">
              <div class="unplayable__title" title=${n.title||""}>${n.title||n.songId||"（未知文件）"}</div>
              <div class="unplayable__sub">
                ${n.artist?c`<span>${n.artist}</span>`:x}
                ${n.ext?c`<span class="unplayable__tag">.${n.ext}</span>`:x}
                ${n.attempts>1?c`<span>失败 ${E(n.attempts)} 次</span>`:x}
                ${n.at?c`<span>${new Date(n.at).toLocaleString("zh-CN")}</span>`:x}
              </div>
              <!-- 路径可选中复制：用户要拿它去文件管理器里找 / 重新下载 -->
              <div class="unplayable__path u-selectable" title=${s}>${s}</div>
              <div class="unplayable__reason" title=${n.reason||""}>${n.reason||"未知原因"}</div>
            </div>
            <div class="unplayable__acts">
              <button
                class="btn btn--ghost btn--sm"
                type="button"
                data-act="unplayable-restore"
                data-id=${n.songId}
                data-tip="文件已修好，重新扫描并放回曲库"
              >
                ${f("refresh")}<span>已修好</span>
              </button>
              <button
                class="btn btn--ghost btn--sm"
                type="button"
                data-act="unplayable-dismiss"
                data-id=${n.songId}
                data-tip="只从清单里去掉这条记录"
              >
                ${f("check")}<span>忽略</span>
              </button>
            </div>
          </div>`})}
      </div>
      <div class="unplayable__foot">
        <span>
          这些文件在播放时解不出来，已从曲库移除（<b>磁盘文件没有被删除</b>）。
          修好文件后点「已修好」重新扫描即可回到曲库。
        </span>
        <button class="btn btn--ghost btn--sm" type="button" data-act="unplayable-clear">
          ${f("trash")}<span>清空清单</span>
        </button>
      </div>
    </div>`}ruleRow(e){const n=e.type==="regex"&&e.value&&!pc(e.value);return c` <div class="rule" data-rule=${e.id} data-enabled=${String(e.enabled)}>
      <button
        class="switch"
        type="button"
        role="switch"
        aria-checked=${String(e.enabled)}
        data-act="rule-toggle"
        data-id=${e.id}
        aria-label="启用规则"
      ></button>
      <select class="rule__field" data-act="rule-type" data-id=${e.id}>
        <option value="size" ?selected=${e.type==="size"}>按文件大小</option>
        <option value="regex" ?selected=${e.type==="regex"}>按正则表达式</option>
      </select>
      <select class="rule__op" data-act="rule-op" data-id=${e.id}>
        ${e.type==="size"?[["lt","小于"],["lte","小于等于"],["gt","大于"],["gte","大于等于"],["eq","等于"]].map(([s,a])=>c`<option value=${s} ?selected=${e.op===s}>${a}</option>`):c`<option value="match" ?selected=${e.op==="match"}>匹配</option>`}
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
        <button
          class="rule__scope-btn"
          type="button"
          data-act="rule-scope"
          data-id=${e.id}
          data-scope="exclude"
          aria-pressed=${String(e.scope==="exclude")}
        >
          排除
        </button>
        <button
          class="rule__scope-btn"
          type="button"
          data-act="rule-scope"
          data-id=${e.id}
          data-scope="include"
          aria-pressed=${String(e.scope==="include")}
        >
          仅包含
        </button>
      </div>
      <button class="rule__del" type="button" data-act="rule-del" data-id=${e.id} aria-label="删除规则">
        ${f("trash")}
      </button>
    </div>`}rulesCard(){const{kept:e,excluded:n,total:s}=this.settingsDerived().rules;return c` <section class="card" id="sec-filters" data-section="library">
      <div class="card__head">
        <div class="card__icon">${f("filter")}</div>
        <div class="card__titles">
          <div class="card__title">过滤规则</div>
          <div class="card__desc">按文件大小或正则表达式排除不需要的文件，规则可开关、可组合</div>
        </div>
        <div class="card__actions">
          <button class="btn btn--sm" type="button" data-act="preset-small">
            ${f("plus")}<span>排除 &lt;10KB</span>
          </button>
          <button class="btn btn--sm" type="button" data-act="preset-mp4">
            ${f("plus")}<span>排除 *.mp4</span>
          </button>
          <button class="btn btn--primary btn--sm" type="button" data-act="rule-add">
            ${f("plus")}<span>新增规则</span>
          </button>
        </div>
      </div>
      <div class="card__body">
        ${i.filterRules.length?i.filterRules.map(a=>this.ruleRow(a)):c`<div class="setting__hint">还没有规则。下面的预置规则可以一键添加。</div>`}
        <div class="rule__preview">
          当前规则下：共扫描 <b>${E(s)}</b> 个文件，保留 <b>${E(e.length)}</b> 首，过滤掉
          <b>${E(n)}</b> 个
        </div>
      </div>
      <div class="card__foot">
        <span>「排除」优先于「仅包含」；支持正则表达式（忽略大小写）</span>
        <span>大小单位在数值后填写，默认字节</span>
      </div>
    </section>`}themeCard(){const e=Yt(),n=wr(),s=window.matchMedia("(prefers-color-scheme: dark)").matches;return c` <section class="card" id="sec-appearance" data-section="ui">
      <div class="card__head">
        <div class="card__icon">${f("palette")}</div>
        <div class="card__titles">
          <div class="card__title">外观</div>
          <div class="card__desc">主题以独立 CSS 文件存在，把文件放进主题目录即可自动出现</div>
        </div>
        <div class="card__actions">
          <button class="btn btn--sm" type="button" data-act="reload-themes">
            ${f("refresh")}<span>重新扫描</span>
          </button>
          <button class="btn btn--sm" type="button" data-act="open-theme-dir">
            ${f("folder")}<span>打开主题文件夹</span>
          </button>
        </div>
      </div>
      <div class="themes">
        ${e.map(a=>{const r=i.config.theme===a.id;return c` <div class="themecard" data-active=${String(r)}>
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
              <span class="themecard__swatch">${n(a).map(o=>c`<i data-swatch=${o}></i>`)}</span>
              <span class="themecard__name">${a.name}</span>
              <span class="themecard__id">${a.id}.css</span>
            </button>
            ${a.builtin?c`<span class="themecard__badge">内置</span>`:c`<button
                    class="carddel"
                    type="button"
                    data-act="theme-remove"
                    data-id=${a.id}
                    data-name=${a.name}
                    data-tip="移除主题"
                    aria-label=${`移除主题 ${a.name}`}
                  >
                    ${f("trash")}<span>移除</span>
                  </button>`}
          </div>`})}
        <button class="themes__add" type="button" data-act="theme-help">
          ${f("plus")}
          <span>添加自定义主题</span>
          <span class="u-num u-fs-xs">导入本地文件，也可以从仓库获取或让 AI 写一个</span>
        </button>
      </div>
      <div class="card__body">
        ${P({label:"深浅色模式",hint:`当前系统偏好：${s?"深色":"浅色"}`,control:Ce("themeMode",[{value:"dark",label:"深色"},{value:"light",label:"浅色"},{value:"system",label:"跟随系统"}],i.config.themeMode)})}
        ${P({label:"毛玻璃模糊强度",hint:"控制面板背后内容的模糊程度",control:rn("set-blur","glassBlur","模糊强度")})}
        ${P({label:"面板不透明度",hint:"面板背景的透明程度，数值越大越透",control:rn("set-alpha","glassAlpha","不透明度")})}
        ${P({label:"界面动画",hint:"关闭后取消过渡与旋转动画，低性能设备更流畅",control:J("animations",i.config.animations,"界面动画")})}
        ${P({label:"过渡速度",hint:"弹出层、菜单、面板的进出动画时长；默认快速 0.25 秒",control:Ce("animationsSpeed",sf,i.config.animationsSpeed||"fast")})}
        ${P({label:"背景动效（播放界面）",hint:"只影响播放详情页里样式绘制的背景动画。「流畅优先」跟随屏幕刷新率（高刷屏更顺滑）；「性能优先」限制帧率并让暂停后的画面停住，更省电。其他界面（设置、曲库列表）始终满帧，不受此项影响。",control:Ce("skinPerformanceMode",af,i.config.skinPerformanceMode||"smooth")})}
        ${P({label:"主题色跟随封面",hint:"从当前封面提取主色调，作为界面主题色",control:J("accentFromCover",i.config.accentFromCover,"主题色跟随封面")})}
      </div>
    </section>`}listCard(){return c` <section class="card" id="sec-list" data-section="ui">
      <div class="card__head">
        <div class="card__icon">${f("density")}</div>
        <div class="card__titles">
          <div class="card__title">歌曲列表</div>
          <div class="card__desc">列表显示哪些列、每行多高</div>
        </div>
      </div>
      <div class="card__body">
        ${P({label:"显示专辑列",hint:"窄窗口下会自动隐藏该列",control:J("showAlbumColumn",i.config.showAlbumColumn,"显示专辑列")})}
        ${P({label:"列表密度",hint:"对「本地歌曲」「播放列表」「歌单」三个列表同时生效",control:Ce("listDensity",nf,i.config.listDensity||"cozy")})}
      </div>
    </section>`}systemCard(){return c` <section class="card" id="sec-system" data-section="ui">
      <div class="card__head">
        <div class="card__icon">${f("options")}</div>
        <div class="card__titles">
          <div class="card__title">窗口与系统</div>
          <div class="card__desc">圆角与关闭行为；这些设置与系统能力相关</div>
        </div>
      </div>
      <div class="card__body">
        ${P({label:"窗口圆角",hint:"主窗口四角的圆角幅度。圆角由系统绘制，只有这几档（仅 Windows 11 有效）",control:Ce("windowCorners",tf,i.config.windowCorners||"system")})}
        ${P({label:"关闭时最小化到托盘",hint:"打开后点关闭按钮只把窗口收进系统托盘（任务栏右下角），音乐照常播放；要真正退出请用托盘图标的右键菜单",control:J("minimizeToTray",i.config.minimizeToTray,"关闭时最小化到托盘")})}
        ${P({label:"记忆窗口位置与大小",hint:"退出时记住主窗口的位置、尺寸和最大化状态，下次打开回到原处。换显示器或改分辨率后如果窗口跑到屏幕外，会自动回到居中默认大小；也可以在这里手动重置",control:c`<button
            class="btn btn--ghost btn--sm"
            type="button"
            data-act="reset-main-window-geometry"
            data-tip="把主窗口移回屏幕中央并恢复默认大小"
          >
            重置窗口位置
          </button>`})}
      </div>
    </section>`}playerCard(){const e=jt(),n=jo();return c` <section class="card" id="sec-player" data-section="ui">
      <div class="card__head">
        <div class="card__icon">${f("disc")}</div>
        <div class="card__titles">
          <div class="card__title">播放界面样式</div>
          <div class="card__desc">
            内置 ${e.filter(s=>s.builtin).length} 款样式；把第三方样式包放进样式目录即可使用
          </div>
        </div>
        <div class="card__actions">
          <button class="btn btn--sm" type="button" data-act="reload-skins">
            ${f("refresh")}<span>重新扫描</span>
          </button>
          <button class="btn btn--sm" type="button" data-act="open-skin-dir">
            ${f("folder")}<span>打开样式目录</span>
          </button>
        </div>
      </div>
      <div class="themes">
        ${e.map(s=>{const a=i.config.playerViewMode===s.id,r=Array.isArray(s.colorsMissing)?s.colorsMissing:[],o=s.chrome||null,l=!o||o.theme===!0,d=l?null:o.preview,p=r.length?`未声明配色（缺 ${r.join(" / ")}）：宿主已用主题配色兜底`:l?"跟随宿主主题配色":o.contrast?`底色 / 前景 · 对比度 ${o.contrast}:1${o.corrected?"（宿主已自动纠正到可读）":""}`:"已声明配色",m=r.length?`清单里的配色不完整（${r.join(" / ")}）：宿主控件栏已降级使用主题配色。建议在 skin.json 的 colors 里补上 bg / fg`:"";return c` <div class="skincard" data-active=${String(a)}>
            <button
              class="skincard__pick"
              type="button"
              data-act="skin-pick"
              data-id=${s.id}
              aria-pressed=${String(a)}
              aria-label=${`使用样式 ${s.name}`}
            >
              <span class="skincard__icon">${this.skinIcon(s)}</span>
              <span class="skincard__name">${s.name}</span>
              <span class="skincard__id">${s.id}</span>
              <span class="skincard__colors" data-tip=${p} aria-label=${p}>
                <i
                  class="skincard__swatch"
                  style=${d?.bg?`background:${d.bg}`:"background:var(--surface-2)"}
                ></i>
                <i
                  class="skincard__swatch skincard__swatch--fg"
                  style=${d?.fg?`background:${d.fg}`:"background:var(--text-1)"}
                ></i>
              </span>
              ${r.length?c`<span class="skincard__warn" data-tip=${m} aria-label=${m}
                      >${f("warning")}</span
                    >`:x}
            </button>
            ${s.builtin?x:c`<span class="skincard__badge">第三方</span>
                    <button
                      class="carddel"
                      type="button"
                      data-act="skin-remove"
                      data-id=${s.id}
                      data-name=${s.name}
                      data-tip="移除样式"
                      aria-label=${`移除样式 ${s.name}`}
                    >
                      ${f("trash")}<span>移除</span>
                    </button>`}
          </div>`})}
        <button class="themes__add" type="button" data-act="skin-help">
          ${f("plus")}
          <span>自定义样式</span>
          <span class="u-num u-fs-xs">导入本地文件，也可以从仓库获取或让 AI 写一个</span>
        </button>
      </div>
      ${n.length?c`<div class="card__body">
              ${n.map(s=>c` <div class="setting">
                    <div class="setting__main">
                      <div class="setting__label">样式「${s.id}」加载失败</div>
                      <div class="setting__hint">${s.reason}</div>
                    </div>
                  </div>`)}
            </div>`:x}
      <div class="card__body">
        ${P({label:"封面轮播",hint:"一首歌有多张封面时，播放详情页按下面的间隔轮换显示（不影响列表缩略图）",control:J("coverCarousel",i.config.coverCarousel===!0,"封面轮播")})}
        ${P({label:"轮播间隔",hint:"每隔多少秒切换一张",control:rn("set-carousel","coverCarouselInterval","轮播间隔")})}
      </div>
    </section>`}skinIcon(e){return e.iconUrl?c`<i class="skin-icon" style=${`--skin-icon:${Br(e.iconUrl)}`}></i>`:f(e.icon||"disc")}playbackCard(){return c` <section class="card" id="sec-playback" data-section="player">
      <div class="card__head">
        <div class="card__icon">${f("headphones")}</div>
        <div class="card__titles">
          <div class="card__title">播放</div>
          <div class="card__desc">播放模式、随机方式与单击歌曲时的行为</div>
        </div>
      </div>
      <div class="card__body">
        ${P({label:"默认播放模式",hint:"点击底栏循环按钮可随时切换",control:Ce("playMode",[{value:"sequence",label:"列表循环"},{value:"loop-one",label:"单曲循环"},{value:"shuffle",label:"随机"}],i.config.playMode==="loop-all"?"sequence":i.config.playMode)})}
        ${P({label:"随机播放方式",hint:"随机播放会先打乱当前播放列表，再按打乱后的顺序播放",control:Ce("shuffleMode",[{value:"reshuffle",label:"播完重新打乱"},{value:"once",label:"只打乱一次"}],i.config.shuffleMode||"reshuffle")})}
        ${P({label:"记忆音量",hint:"记住上次的音量，下次启动时恢复",control:J("rememberVolume",i.config.rememberVolume!==!1,"记忆音量")})}
        ${P({label:"保留歌曲播放进度",hint:"记住每首歌上次播到哪儿；退出后重新打开会回到那个位置。只恢复进度条，不会自动开始播放",control:J("resumeProgress",i.config.resumeProgress===!0,"保留歌曲播放进度")})}
        ${P({label:"跳过开头无声片段",hint:c`开头有一段空白时，播放会自动从出声处开始，不必干等（现场录音与转录文件常见）。<br />
            只跳过开头连续 0.2 秒以上的静音，乐句之间的短暂停顿不会被误伤。<br />
            <span class="u-dim">歌曲长度与进度条仍按原曲显示，歌词与播放进度不会因此错位。</span>`,control:J("skipSilenceHead",i.config.skipSilenceHead===!0,"跳过开头无声片段")})}
        ${P({label:"跳过结尾无声片段",hint:c`结尾拖着一长段空白时，播到最后一个声音就结束，紧接着切下一首（CD 抓轨与整轨转录常见）。<br />
            <span class="u-dim">歌曲长度仍按原曲显示；进度条会在原曲的静音起点处停住。</span>`,control:J("skipSilenceTail",i.config.skipSilenceTail===!0,"跳过结尾无声片段")})}
        ${P({label:"切歌间隔",hint:"自动切到下一首时中间留出的停顿。手动点「下一首」不受影响（那是即时的操作）；调到 0 表示紧接着播",control:rn("set-track-gap","trackGapSeconds","切歌间隔")})}
        ${P({label:"单击歌曲时的行为",hint:c`双击始终是「立即播放这一首」，此设置只影响单击。<br />
            播放：立刻播放这首歌，并加入播放列表；<br />
            播放当前列表：用当前整个列表替换播放队列，从这首歌开始播；<br />
            下一首播放：插到当前歌曲后面，下一次「下一曲」时播放。`,control:Ce("rowClickAction",ef,i.config.rowClickAction||"play")})}
      </div>
    </section>`}lyricsCard(){return c` <section class="card" id="sec-lyrics" data-section="player">
      <div class="card__head">
        <div class="card__icon">${f("lyrics")}</div>
        <div class="card__titles">
          <div class="card__title">歌词</div>
          <div class="card__desc">歌词来源优先级与显示效果</div>
        </div>
      </div>
      <div class="card__body">
        ${P({label:"歌词来源优先级",hint:"内嵌歌词 → 同目录 .lrc → 歌词缓存 → 在线自动匹配；本地读不到时会自动联网匹配并存入缓存",control:c`<span class="chip"><i class="chip__dot"></i>${of()}</span>`})}
        ${P({label:"歌词字号",hint:"歌词文字大小，当前播放的那一行会略微放大（底栏「选项」里也能调）",control:rn("set-lyric-size","lyricsFontSize","歌词字号")})}
        ${P({label:"居中高亮行数",hint:"当前行上下各显示的行数",control:Ce("lyricsLines",[3,5,7,9].map(e=>({value:String(e),label:String(e)})),String(i.config.lyricsLines))})}
      </div>
    </section>`}loudnessCard(){const e=i.config,n=i.loudnessState||{},s=n.measured??0,a=n.missing??Math.max(0,i.songs.length-s),r=n.total??i.songs.length,o=n.available!==!1,d=(i.ffmpegState||{}).describe||n.describe||"检测中…";return c` <section class="card" id="sec-loudness" data-section="player">
      <div class="card__head">
        <div class="card__icon">${f("scale")}</div>
        <div class="card__titles">
          <div class="card__title">响度均衡</div>
          <div class="card__desc">
            让不同来源的歌曲音量听起来一样大。播放到哪首就测哪首，测好后自动记住，下次播放直接用；改动目标响度后会自动重新计算。
          </div>
        </div>
      </div>

      <div class="setting">
        <div class="setting__label">
          <span>均衡模式</span>
          <small class="u-fs-xs u-dim"
            >逐曲：每首歌都调到相同响度；同专辑：整张专辑用同一次调整，保留专辑内部的强弱对比</small
          >
        </div>
        <div class="setting__control">${Ce("loudnessMode",Mh,e.loudnessMode||"off")}</div>
      </div>

      <div class="setting">
        <div class="setting__label">
          <span>目标响度</span>
          <small class="u-fs-xs u-dim">数值越小整体越轻，推荐用默认档。改动后会自动重新计算</small>
        </div>
        <div class="setting__control">
          <div class="select">
            <select class="select__field" data-act="loudness-target" aria-label="目标响度">
              ${Dh.map(p=>c`<option value=${p.value} ?selected=${Number(e.loudnessTarget)===p.value}>
                    ${p.label}
                  </option>`)}
            </select>
            ${f("chevron-down","select__icon")}
          </div>
        </div>
      </div>

      <div class="setting">
        <div class="setting__label">
          <span>真峰值保护</span>
          <small class="u-fs-xs u-dim">音量抬高时自动限制幅度，避免声音破音</small>
        </div>
        <div class="setting__control">
          <button
            class="switch"
            type="button"
            role="switch"
            data-toggle="loudnessLimit"
            aria-checked=${String(!!e.loudnessLimit)}
          >
            <span class="switch__thumb"></span>
          </button>
        </div>
      </div>

      <div class="setting setting--stack">
        <div class="card__actions">
          <button class="btn btn--sm" type="button" data-act="loudness-refresh">
            ${f("refresh")}<span>重新获取响度数据</span>
          </button>
          <button class="btn btn--sm btn--danger" type="button" data-act="loudness-clear">
            ${f("trash")}<span>清除测量数据</span>
          </button>
        </div>

        <div class="setting__hint">
          当前设置下已算好 <b>${s}</b> / ${r}
          首${a?c`，其余 <b>${E(a)}</b> 首会在播放时计算`:"（全部已算好）"}<br />
          响度来源：<b>${o?d:"不可用"}</b>
        </div>
      </div>
    </section>`}onlineCard(){const e=i.config.downloadDir||"（默认：系统音乐目录 / downloads）",n=i.coverProviders||[],s=i.coverBreaker||{},a=n.length?n.map(r=>s[r]?`${Wa(r)}（暂时不可用）`:Wa(r)).join(" · "):"正在读取…";return c` <section class="card" id="sec-online" data-section="data">
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
              这个目录会作为曲库的扫描根自动生效，下载完的歌直接出现在「本地歌曲」里， 不需要手动添加文件夹
            </div>
          </div>
          <div class="pathrow">
            <svg class="pathrow__icon" aria-hidden="true"><use href="#i-folder"></use></svg>
            <div class="pathrow__main">
              <div class="pathrow__path u-selectable" title=${e}>${e}</div>
            </div>
            <button class="btn btn--sm" type="button" data-act="download-dir-pick">
              ${f("folder")}<span>更改</span>
            </button>
            <button class="btn btn--ghost btn--sm" type="button" data-act="download-dir-open">
              ${f("expand")}<span>打开</span>
            </button>
            <button
              class="btn btn--ghost btn--sm"
              type="button"
              data-act="download-dir-reset"
              data-tip="恢复默认（系统音乐目录 / downloads）"
            >
              ${f("refresh")}
            </button>
          </div>
        </div>

        ${P({label:"收藏时自动下载到本地",hint:"把只有试听缓存的在线歌曲加进「我喜欢」或某个歌单时，自动保存一份到下载目录。试听缓存放在临时目录里（会被清理、也可能被系统清掉），收藏却是长期意图 —— 不补这一份，收藏夹里会混进一批过几天就打不开的歌。已经下载过或正在下载的不会重复下载",control:J("autoDownloadOnCollect",i.config.autoDownloadOnCollect!==!1,"收藏时自动下载到本地")})}
        ${P({label:"联网获取封面",hint:`在线搜索到的歌曲会自动去公开曲库匹配封面：${a}`,control:J("onlineCover",i.config.onlineCover!==!1,"联网获取封面")})}
        ${P({label:"优先使用逐字歌词",hint:"逐字（卡拉OK）歌词来自 QQ 音乐 QRC / 酷狗 KRC 这两种第三方私有编码，本程序只做兼容性解析以便显示逐字时间轴。关掉后只用行级来源（LRCLIB / 网易云等），歌词仍然可用，只是没有逐字高亮。",control:J("onlineWordLyrics",i.config.onlineWordLyrics!==!1,"优先使用逐字歌词")})}
        ${P({label:"把封面/歌词写进歌曲文件",hint:lf(),control:J("embedMeta",i.config.embedMeta===!0,"写进歌曲文件")})}

        <div class="setting setting--stack">
          <div class="setting__main">
            <div class="setting__label">把已有缓存补写进文件</div>
            <div class="setting__hint">${cf()}</div>
          </div>
          <div class="card__actions">
            <button class="btn btn--sm" type="button" data-act="embed-cache-write">
              ${f("tag")}<span>写入缓存到文件</span>
            </button>
          </div>
        </div>

        <div class="setting setting--stack">
          <div class="setting__main">
            <div class="setting__label">缓存目录</div>
            <div class="setting__hint">封面与歌词的缓存位置；${Ci()}</div>
          </div>
          <div class="pathrow">
            <svg class="pathrow__icon" aria-hidden="true"><use href="#i-folder"></use></svg>
            <div class="pathrow__main">
              <div class="pathrow__path u-selectable" data-role="cache-dir" title=${i.coverCache?.dir||""}>
                ${i.coverCache?.dir||"（连接后显示）"}
              </div>
            </div>
            <button class="btn btn--sm" type="button" data-act="cache-open-covers">
              ${f("image")}<span>封面</span>
            </button>
            <button class="btn btn--ghost btn--sm" type="button" data-act="cache-open-lyrics">
              ${f("lyrics")}<span>歌词</span>
            </button>
          </div>
        </div>

        <!-- 试听缓存清理：在线歌曲只为试听下载的那份音频（临时目录里的派生数据）。
             需求原话是「清理掉播放器中没有引用的缓存歌曲，比如还在播放列表的歌曲」，
             所以这里必须把「什么会被保留」写在按钮旁边 —— 否则用户不敢点。 -->
        <div class="setting setting--stack" id="online-cache-block">
          <div class="setting__main">
            <div class="setting__label">试听缓存</div>
            <div class="setting__hint">
              在线歌曲只为试听下载的那一份音频（在临时目录里，不是下载目录里的文件）。清理只删<b>没有被引用</b>的：还在播放列表、歌单或「我喜欢」里的会保留，正在播放的那首也保留。当前
              ${Au(nr())}
            </div>
          </div>
          <div class="card__actions">
            <button class="btn btn--sm" type="button" data-act="online-cache-cleanup">
              ${f("refresh")}<span>清理未引用的缓存</span>
            </button>
          </div>
        </div>

        <!-- 联网与隐私：让用户不读源码也能知道「什么时候联网 / 连到哪 / 怎么关」。
             清单本体在 about-info.js（NETWORK_USAGE / PRIVACY_NOTES），
             改默认开关时要同步那一份。 -->
        <div class="about-subtitle">联网与隐私</div>
        <div class="about-note">
          <div class="about-note__title"><span>会联网的功能</span></div>
          ${fc.map(r=>c`<div class="about-note__body">· ${r.what} → ${r.where}（${r.when}；关闭方式：${r.off}）</div>`)}
        </div>
        <div class="about-note">
          <div class="about-note__title"><span>什么留在本机</span></div>
          ${hc.map(r=>c`<div class="about-note__body">· ${r}</div>`)}
        </div>
        <div class="about-note">
          <div class="about-note__title"><span>下载内容的使用范围</span></div>
          ${mc.map(r=>c`<div class="about-note__body">· ${r}</div>`)}
        </div>
      </div>
      <div class="card__foot">
        <span>封面来自公开曲库（${qo()}），匹配结果不保证完全准确</span>
        <button class="btn btn--sm" type="button" data-act="cover-refresh">
          ${f("refresh")}<span>清空封面与歌词缓存</span>
        </button>
      </div>
    </section>`}aiCard(){const e=i.config||{},n=!!e.aiApiKeySet||!!String(e.aiApiKey||"").trim(),s=!!(String(e.aiBaseUrl||"").trim()&&n),a=String(e.aiBaseUrlProblem||"").trim(),r=(o,l,d,p,m="text")=>c` <div class="setting setting--stack">
        <div class="setting__main">
          <div class="setting__label">${o}</div>
          <div class="setting__hint">${l}</div>
        </div>
        <input
          class="input"
          type=${m}
          data-act="ai-field"
          data-key=${d}
          .value=${d==="aiApiKey"?"":e[d]||""}
          placeholder=${d==="aiApiKey"&&n?"已保存（留空则保持不变，输入新值可替换）":p}
          autocomplete="off"
          spellcheck="false"
        />
      </div>`;return c` <section class="card" id="sec-ai" data-section="ai">
      <div class="card__head">
        <div class="card__icon">${f("settings")}</div>
        <div class="card__titles">
          <div class="card__title">AI 相关</div>
          <div class="card__desc">自动匹配歌词 / 封面时，用 AI 从文件名中还原歌曲信息</div>
        </div>
      </div>
      <div class="card__body">
        ${r("接口地址（Base URL）","OpenAI 兼容接口，例如 https://api.openai.com/v1","aiBaseUrl","https://api.openai.com/v1")}
        ${a?c`<div class="setting__warn" role="alert">
                <span>这个接口地址不会被使用：${a}</span>
                <span class="setting__warn-sub"
                  >本机模型服务（LM Studio / Ollama）请填 http://127.0.0.1:端口；其它地址必须是 https://，且不要用
                  IP。地址不合规时程序不会把 API Key 发出去。</span
                >
              </div>`:null}
        ${r("API Key","只写入本地配置，不会发往该接口以外的任何地方","aiApiKey","sk-...","password")}
        ${r("模型 ID","例如 gpt-4o-mini、deepseek-chat；留空默认 gpt-4o-mini","aiModelId","gpt-4o-mini")}
        ${P({label:"模型类型",hint:"不同厂商对思考模式的支持方式不同，选错会导致这个开关不生效；选「自动识别」可自动判断",control:c` <select class="select__field" data-act="ai-vendor" aria-label="模型类型">
            ${hi.map(o=>c`<option value=${o.id} ?selected=${o.id===(e.aiVendor||"auto")}>${o.label}</option>`)}
          </select>`})}
        ${P({label:"启用思考模式",hint:Ph(e),control:J("aiThinking",!!e.aiThinking,"启用思考模式")})}
        <!-- AI 自动化提示：这两个开关的效果都发生在用户看不见的时候
             （下载结束后台改写标签 / 匹配歌词前多等一次 AI），所以必须在设置里
             把「会自动做什么、什么时候做、现在开着没有」摆出来。
             清单本体在 ai-automation.js（唯一一份，与开启时的提醒共用）。 -->
        <div class="about-note" id="ai-automation-note">
          <div class="about-note__title"><span>AI 自动化（不用你点，它自己会跑）</span></div>
          ${xo(e).map(o=>c`<div class="about-note__body">
                · <strong>${o.label}</strong>：${o.when} —— 当前<b>${o.on?"已开启":"已关闭"}</b>（${o.detail}）
              </div>`)}
          <div class="about-note__body">
            ${Cu(e)?"开着的时候，播放器会在后台自己调用你填的那个接口（会消耗你的额度）。关掉对应的开关即立刻停止，已写进文件的标签不会因此回滚。":"两项都关着：AI 只在你手动触发时（例如详情页的「AI 清洗」）才会运行。"}
          </div>
        </div>
        ${P({label:"自动匹配歌词时使用 AI 清洗元数据",hint:"自动匹配歌词前先用 AI 从文件名里还原真实的标题 / 歌手。AI 一次调用可能要十几秒，关掉后只做本地整理：匹配更快，但文件名不规范时命中率会低一些",control:J("aiLyricsClean",i.config.aiLyricsClean!==!1,"自动匹配歌词时使用 AI 清洗元数据")})}
        ${P({label:"下载歌曲时用 AI 整理元数据",hint:"下载完成（直接下载或从试听缓存搬运）后，在后台把文件名与现有信息交给 AI，还原出真实的标题 / 歌手 / 专辑并写回歌曲文件。整理在下载结束后才发生，不会拖慢下载；写回会改写文件标签且不可撤销，只在 AI 给出非空字段时才写。支持 m4a / flac，其它格式只更新曲库",control:J("aiDownloadTag",i.config.aiDownloadTag!==!1,"下载歌曲时用 AI 整理元数据")})}
        <!-- 发送内容的常驻说明：横幅式的「首次确认」只在第一次弹（见 settings.js#confirmAIFirstUse），
             真正要能随时查到的是这一段。 -->
        <div class="about-note">
          <div class="about-note__title"><span>AI 会收到什么</span></div>
          <div class="about-note__body">
            · 发送：歌曲的标题 / 歌手 / 专辑 / 时长，以及文件名（只有文件名，不含完整路径）。
          </div>
          <div class="about-note__body">· 不发：曲库列表、播放记录、文件路径与任何设备标识。</div>
          <div class="about-note__body">
            · 接口地址由你自己填写，通常在境外；请自行确认该服务的隐私政策与数据处理方式。
          </div>
          <div class="about-note__body">· 随时可关：清空 Base URL / API Key，或关掉下面两个使用 AI 的开关。</div>
        </div>
        <div class="setting__hint">
          ${s?"已配置：自动匹配封面时，会先把文件名与现有元数据交给 AI 清洗，再去匹配。":"尚未配置：填入 Base URL 与 API Key 后自动启用。"}
        </div>
      </div>
    </section>`}aboutCard(){const e=i.appVersion||Pi,n=i.lastScan,{totalDuration:s,totalBytes:a}=this.settingsDerived();return c` <section class="card" id="sec-about" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("info")}</div>
        <div class="card__titles">
          <div class="card__title">关于 ${Oi}</div>
          <div class="card__desc">${bc}</div>
        </div>
      </div>
      <div class="card__body">
        <div class="about-hero">
          <div class="about-hero__main">
            <div class="about-hero__title">
              <span class="about-hero__name">${Oi}</span>
              <span class="about-hero__version">v${e}</span>
              <span class="chip chip--ok"><i class="chip__dot"></i>${vc}</span>
            </div>
            <div class="about-hero__meta">${gc} · ${_c}</div>
            <div class="about-hero__meta">${yc}</div>
          </div>
          <div class="about-hero__links">
            ${wc.map(r=>c`<button
                  class="btn btn--sm"
                  type="button"
                  data-act="about-open-url"
                  data-url=${r.url}
                  title=${r.url}
                >
                  ${f(r.icon)}<span>${r.label}</span>
                </button>`)}
          </div>
        </div>
        <div class="setting__hint">
          界面与后端都在本机运行：曲库、封面、歌词缓存在你自己的磁盘上；只有在你主动搜索 / 匹配 / 下载时才会联网。
        </div>
        <div class="kv">
          <div class="kv__k">曲库文件</div>
          <div class="kv__v">${E(i.allSongsRaw.length)} 个</div>
          <div class="kv__k">过滤后歌曲</div>
          <div class="kv__v">${E(i.songs.length)} 首</div>
          <div class="kv__k">被规则过滤</div>
          <div class="kv__v">${E(n?.excluded??0)} 个</div>
          <div class="kv__k">总时长</div>
          <div class="kv__v">${Math.floor(s/36e5)} 小时 ${Math.floor(s%36e5/6e4)} 分</div>
          <div class="kv__k">占用空间</div>
          <div class="kv__v">${tn(a)}</div>
          <div class="kv__k">上次扫描</div>
          <div class="kv__v">${n?new Date(n.at).toLocaleString("zh-CN"):"—"}</div>
          <div class="kv__k">缓存目录</div>
          <div class="kv__v">${i.config.cacheDir}</div>
        </div>
      </div>
      <div class="card__foot">
        <span>版本号来自后端常量（services_app.go#appVersion），与安装包元数据同源</span>
      </div>
    </section>`}updateCard(){const e=i.update||{},n=e.check,s=n?.current||i.appVersion||Pi,a=n?.latest||"",r=us(e.channel),o=e.pending,l=e.progress;return c` <section class="card" data-section="about" id="sec-update">
      <div class="card__head">
        <div class="card__icon">${f("refresh")}</div>
        <div class="card__titles">
          <div class="card__title">版本更新</div>
          <div class="card__desc">从 GitHub Releases 检测新版本；网络不好时可走加速代理下载</div>
        </div>
        <span class="u-spacer"></span>
        <span class="chip ${a?"chip--ok":""}"><i class="chip__dot"></i>当前 v${s}</span>
      </div>
      <div class="card__body">
        ${this.updateStatusBlock({check:n,current:s,latest:a,pending:o,progress:l})}
        ${e.error&&!n?.error?c`<div class="setting__hint" style="color:var(--danger,#e5484d)">${e.error}</div>`:x}
        ${l?this.updateProgressBlock(l,n):x}
        ${o?this.updatePendingBlock(o):x}
        ${n?.notes&&n.hasUpdate?this.updateNotesBlock(n):x}

        <div class="setting">
          <div class="setting__main">
            <div class="setting__label">下载通道</div>
            <div class="setting__hint">
              下载安装包时使用。选「自动」会先试直连，失败后自动换下一个代理 ——
              当前：${r.name}${r.note?`（${r.note}）`:""}
            </div>
          </div>
          <div class="setting__control">
            <select class="select" data-act="update-channel" aria-label="下载通道">
              ${kc.map(d=>c`<option value=${d.id} ?selected=${d.id===(e.channel||"auto")}>${d.name}</option>`)}
            </select>
          </div>
        </div>

        ${P({label:"启动时自动检查更新",hint:"只在发现新版本时提示；检查失败不会打扰你（可以随时点上面的「检查更新」）",control:J("updateCheckOnStart",e.checkOnStart!==!1,"启动时自动检查更新")})}

        <div class="setting">
          <div class="setting__main">
            <div class="setting__label">仓库</div>
            <div class="setting__hint">${$c}</div>
          </div>
          <div class="setting__control">
            <button
              class="btn btn--ghost btn--sm"
              type="button"
              data-act="about-open-url"
              data-url=${Us}
            >
              ${f("external")}<span>全部版本</span>
            </button>
            <button class="btn btn--ghost btn--sm" type="button" data-act="update-open-dir">
              ${f("folder")}<span>更新目录</span>
            </button>
          </div>
        </div>
      </div>
      <div class="card__foot">
        <span>安装时会退出当前程序，由引导脚本替换文件并自动重启；配置与曲库不受影响</span>
      </div>
    </section>`}updateStatusBlock({check:e,current:n,latest:s,pending:a,progress:r}){const o=i.update||{};if(o.checking)return c` <div class="about-note">
        <div class="about-note__title"><span>正在检查…</span></div>
        <div class="about-note__body">正在向 GitHub 查询最新版本。</div>
        <button class="btn btn--sm" type="button" disabled>${f("refresh")}<span>检查中</span></button>
      </div>`;if(!e)return c` <div class="about-note">
        <div class="about-note__title"><span>尚未检查</span></div>
        <div class="about-note__body">点右边的按钮查询有没有新版本。检查只读取版本信息，不会下载任何东西。</div>
        <button class="btn btn--sm" type="button" data-act="update-check">
          ${f("refresh")}<span>检查更新</span>
        </button>
      </div>`;if(e.error)return c` <div class="about-note">
        <div class="about-note__title">
          <span style="color:var(--danger,#e5484d)">检查失败</span>
        </div>
        <div class="about-note__body">${e.error}</div>
        <button class="btn btn--sm" type="button" data-act="update-check">${f("refresh")}<span>重试</span></button>
      </div>`;if(e.hasUpdate)return e.assetAvailable?c` <div class="about-note">
        <div class="about-note__title">
          <span>发现新版本 ${s}</span>
          <span class="chip chip--ok"><i class="chip__dot"></i>${a?"已下载，可以安装":r?"正在下载":"可以更新"}</span>
          ${e.prerelease?c`<span class="chip chip--warn"><i class="chip__dot"></i>预发布</span>`:x}
        </div>
        <div class="about-note__body">
          ${e.assetName} · ${e.assetSizeText||"体积未知"}
          ${e.publishedAt?` · 发布于 ${new Date(e.publishedAt).toLocaleDateString("zh-CN")}`:""}
        </div>
        <div class="setting__control">
          ${r?c`<button class="btn btn--sm" type="button" data-act="update-cancel">
                  ${f("close")}<span>取消下载</span>
                </button>`:a?c`<button class="btn btn--sm" type="button" data-act="update-install">
                    ${f("refresh")}<span>立即安装并重启</span>
                  </button>`:c`<button class="btn btn--sm" type="button" data-act="update-download">
                    ${f("download")}<span>下载更新</span>
                  </button>`}
          <button
            class="btn btn--ghost btn--sm"
            type="button"
            data-act="about-open-url"
            data-url=${e.releaseUrl||Us}
          >
            ${f("external")}<span>说明</span>
          </button>
          <button class="btn btn--ghost btn--sm" type="button" data-act="update-skip" data-version=${s}>
            <span>跳过此版本</span>
          </button>
        </div>
      </div>`:c` <div class="about-note">
          <div class="about-note__title">
            <span style="color:var(--warn,#d29922)">新版本 ${s} 没有提供当前平台的安装包</span>
          </div>
          <div class="about-note__body">
            可以到发布页面看看有没有其它形式的分发包，或稍后再试（发行流程可能在补充资产）。
          </div>
          <button
            class="btn btn--sm"
            type="button"
            data-act="about-open-url"
            data-url=${e.releaseUrl||Us}
          >
            ${f("external")}<span>去发布页面</span>
          </button>
        </div>`;const l=o.skippedVersion&&s&&o.skippedVersion===s;return c` <div class="about-note">
      <div class="about-note__title">
        <span>已是最新版本（v${n}）</span>
        ${l?c`<span class="chip chip--warn"><i class="chip__dot"></i>已跳过 ${s}</span>`:x}
      </div>
      <div class="about-note__body">
        ${e.checkedAt?`上次检查：${new Date(e.checkedAt).toLocaleString("zh-CN")}`:""}
      </div>
      ${l?c`<button class="btn btn--sm" type="button" data-act="update-skip" data-version="">
              ${f("refresh")}<span>不再跳过</span>
            </button>`:x}
      <button class="btn btn--ghost btn--sm" type="button" data-act="update-check">
        ${f("refresh")}<span>重新检查</span>
      </button>
    </div>`}updateProgressBlock(e,n){const s=Number(e.total)||0,a=Number(e.done)||0,r=typeof e.percent=="number"&&e.percent>=0?e.percent:s>0?Math.round(a/s*100):0,o=!s&&r===0;return c` <div class="about-note">
      <div class="about-note__title">
        <span>${e.message||"正在下载…"}</span>
        ${e.mirrorName?c`<span class="chip"><i class="chip__dot"></i>${e.mirrorName}</span>`:x}
        ${e.attempt>1?c`<span class="chip chip--warn">第 ${e.attempt} 次尝试</span>`:x}
      </div>
      <div
        class="progress"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${o?0:r}
        style="height:6px;border-radius:3px;background:var(--surface-2,#2a2a2e);overflow:hidden"
      >
        <div
          style="height:100%;background:var(--accent,#4c8dff);transition:width .2s ease;width:${o?100:r}%;opacity:${o?.35:1}"
        ></div>
      </div>
      <div class="about-note__body">
        ${o?"正在连接…":s>0?`${r}% · ${tn(a)} / ${tn(s)}${e.speedText?` · ${e.speedText}`:""}`:tn(a)}
        ${n?.assetSizeText?c` <span>（共 ${n.assetSizeText}）</span>`:x}
      </div>
    </div>`}updatePendingBlock(e){return c` <div class="about-note">
      <div class="about-note__title">
        <span>更新包已就绪</span>
        ${e.verified?c`<span class="chip chip--ok"><i class="chip__dot"></i>SHA-256 已校验</span>`:c`<span class="chip chip--warn"><i class="chip__dot"></i>未能校验</span>`}
      </div>
      <div class="about-note__body">
        ${e.name} · ${tn(e.bytes||0)}
        ${e.mirrorId?` · 来自 ${us(e.mirrorId).name}`:""}
      </div>
      ${e.verified?x:c`<div class="setting__hint">这一版没有找到可用的 SHA-256 校验值，安装前请自行确认来源可信。</div>`}
      <div class="setting__control">
        <button class="btn btn--sm" type="button" data-act="update-install">
          ${f("refresh")}<span>立即安装并重启</span>
        </button>
        <button class="btn btn--ghost btn--sm" type="button" data-act="update-check">
          <span>重新检查</span>
        </button>
      </div>
    </div>`}updateNotesBlock(e){const s=String(e.notes||"").trim(),a=s.length>1200?`${s.slice(0,1200)}…`:s;return a?c` <details class="about-note">
      <summary class="about-note__title" style="cursor:pointer">更新说明</summary>
      <div class="about-note__body" style="white-space:pre-wrap">${a}</div>
    </details>`:x}techCard(){return c` <section class="card" id="sec-tech" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("bolt")}</div>
        <div class="card__titles">
          <div class="card__title">技术栈</div>
          <div class="card__desc">这个播放器由哪些技术搭起来</div>
        </div>
      </div>
      <div class="card__body">
        ${Sc.map(e=>c` <div class="about-row">
              <div class="about-row__main">
                <div class="about-row__title">
                  <button class="linkbtn" type="button" data-act="about-open-url" data-url=${e.url} title=${e.url}>
                    <span>${e.name}</span>${f("external")}
                  </button>
                  <span class="about-row__version">${e.version}</span>
                </div>
                <div class="about-row__desc">${e.role}</div>
              </div>
            </div>`)}
      </div>
      <div class="card__foot">
        <span>界面代码是无需构建即可阅读的原生 ESM；需要类型的地方用 JSDoc + tsc 检查</span>
      </div>
    </section>`}libsCard(){const e=xc(),n=Cc(e).map(s=>`${s.license} × ${s.count}`).join(" · ");return c` <section class="card" id="sec-libs" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("options")}</div>
        <div class="card__titles">
          <div class="card__title">开源依赖</div>
          <div class="card__desc">随程序一起分发的第三方库；点名字可以打开它的仓库</div>
        </div>
      </div>
      <div class="card__body">
        <div class="libtable">
          <div class="libtable__head"><span>库 / 版本</span><span>许可证</span><span>用途</span></div>
          ${e.map(s=>c` <div class="libtable__row">
                <div class="libtable__cell libtable__cell--name">
                  <button class="linkbtn" type="button" data-act="about-open-url" data-url=${s.url} title=${s.url}>
                    <span>${s.name}</span>${f("external")}
                  </button>
                  <span class="libtable__version">${s.version}</span>
                </div>
                <div class="libtable__cell"><span class="tagchip">${s.license}</span></div>
                <div class="libtable__cell libtable__cell--role">
                  <span class="libtable__kind">${s.kind}</span>${s.role}
                </div>
              </div>`)}
        </div>
        ${Tc.map(s=>c` <div class="about-note">
              <div class="about-note__title">
                <span>${Ic(s)}</span><span class="tagchip tagchip--warn">${s.license}</span>
              </div>
              <div class="about-note__body">${s.role}</div>
              <button class="linkbtn" type="button" data-act="about-open-url" data-url=${s.url} title=${s.url}>
                <span>FFmpeg 许可说明</span>${f("external")}
              </button>
            </div>`)}
      </div>
      <div class="card__foot">
        <span>${n}</span>
      </div>
    </section>`}licenseCard(){return c` <section class="card" id="sec-license" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("scale")}</div>
        <div class="card__titles">
          <div class="card__title">开源协议</div>
          <div class="card__desc">你可以对这份代码做什么</div>
        </div>
      </div>
      <div class="card__body">
        ${Ec.map(e=>c` <div class="about-note">
              <div class="about-note__title">
                <span>${e.label}</span>
                <span class=${e.tone==="ok"?"tagchip tagchip--ok":"tagchip"}>${e.value}</span>
              </div>
              <div class="about-note__body">${e.desc}</div>
            </div>`)}
      </div>
      <div class="card__foot">
        <span>第三方许可证的完整文本随仓库分发（见 THIRD-PARTY-NOTICES.md）</span>
        <button
          class="btn btn--sm"
          type="button"
          data-act="about-open-url"
          data-url="https://www.apache.org/licenses/LICENSE-2.0"
        >
          ${f("external")}<span>阅读 Apache-2.0</span>
        </button>
      </div>
    </section>`}creditsCard(){return c` <section class="card" id="sec-credits" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("heart")}</div>
        <div class="card__titles">
          <div class="card__title">参考与致谢</div>
          <div class="card__desc">在线能力所依赖的公开数据来源，以及要感谢的人</div>
        </div>
      </div>
      <div class="card__body">
        <div class="about-subtitle">在线数据来源</div>
        ${Ac.map(e=>c` <div class="about-row">
              <div class="about-row__main">
                <div class="about-row__title">
                  <button class="linkbtn" type="button" data-act="about-open-url" data-url=${e.url} title=${e.url}>
                    <span>${e.name}</span>${f("external")}
                  </button>
                </div>
                <div class="about-row__desc">${e.role}</div>
              </div>
            </div>`)}
        <div class="about-subtitle about-subtitle--gap">致谢</div>
        ${Dc.map(e=>c` <div class="about-note">
              <div class="about-note__title"><span>${e.title}</span></div>
              <div class="about-note__body">${e.body}</div>
            </div>`)}
      </div>
      <div class="card__foot card__foot--stack">${Mc.map(e=>c`<span>· ${e}</span>`)}</div>
    </section>`}async onClick(e){if(e.target.closest("[data-settings-close]")||e.target===this.panelEl){ms();return}const n=e.target.closest("[data-goto]")?.dataset.goto;if(n){this.scrollToSection(n);return}const s=e.target.closest("[data-toggle],[data-segment] .segmented__btn");if(s){Ef(s,{commit:k})&&pn(),this.requestUpdate();return}const a=e.target.closest("[data-act]");a&&(await Ja(a,{commit:k,render:()=>{i.settingsRev=(i.settingsRev||0)+1,k()},rescan:()=>Cn({manual:!0})}),pn())}async onChange(e){if(e.target.dataset.act)try{await Ja(e.target,{commit:k,render:()=>{i.settingsRev=(i.settingsRev||0)+1,k()},rescan:()=>Cn({manual:!0})}),pn(),this.requestUpdate()}catch(s){console.error("[settings] 处理下拉框失败",s),u(`设置未生效：${s?.message??s}`,{tone:"error",duration:5e3})}}onInput(e){if(e.target.dataset.act!=="rule-value")return;const n=i.filterRules.find(s=>s.id===e.target.dataset.id);n&&(n.value=e.target.value,k(),this.requestUpdate())}onScroll(e){const n=e.target;if(n.classList?.contains("settings-layer__body")){if(this._navPausedUntil){this.deferNavResume();return}this._throttledNavFollow(n)}}navFollow(e){if(this._navPausedUntil)return;const n=e.getBoundingClientRect().top+80;let s=Tt[0].id;for(const a of Tt){const r=this.querySelector(`[data-section="${a.id}"]`);r&&r.getBoundingClientRect().top<=n&&(s=a.id)}e.scrollHeight>e.clientHeight+2&&e.scrollTop+e.clientHeight>=e.scrollHeight-2&&(s=Tt[Tt.length-1].id),s!==this._activeSection&&(this._activeSection=s,this.paintNav())}paintNav(){for(const e of this.querySelectorAll(".settings__nav-item"))e.setAttribute("aria-selected",String(e.dataset.goto===this._activeSection))}deferNavResume(){clearTimeout(this._navResumeTimer),this._navResumeTimer=setTimeout(()=>{this._navResumeTimer=null,this._navPausedUntil=0},140)}scrollToSection(e){const n=this.querySelector(`[data-section="${e}"]`),s=this.querySelector(".settings-layer__body");if(!n||!s)return;this._activeSection=e,this.paintNav(),this._navPausedUntil=1,this.deferNavResume();const a=this.querySelector(".settings__nav"),r=a?a.offsetHeight:0,o=n.getBoundingClientRect().top-s.getBoundingClientRect().top,l=Math.max(0,s.scrollTop+o-r-8);s.scrollTo({top:l,behavior:"smooth"})}bindSliders(){for(const e of this.querySelectorAll("[data-slider]")){const n=e.dataset.slider;if(!n)continue;let s=this._sliders.get(e);if(!s){s=Vt(e,this.sliderOptions(e,n)),this._sliders.set(e,s);const a=e.parentElement.querySelector(".rangeslider__value");a&&(a.textContent=s.text(this.sliderValue(n)))}s.set(this.sliderValue(n),{silent:!0})}}sliderOptions(e,n){const s=n==="glassBlur",a=n==="glassAlpha",r=n==="coverCarouselInterval",o=n==="trackGapSeconds",l=n==="lyricsFontSize",d=o?0:r?2:l?fs:s?0:a?20:0,p=o?10:r?60:l?hs:s?48:a?95:100,m=r||o?" 秒":s?"px":a?"%":"px",h=o?.1:1,g=o?1:0,S=v=>`${v.toFixed(g)}${m}`;return{min:d,max:p,step:h,value:this.sliderValue(n),format:S,onChange:v=>{i.config[n]=o?Math.round(v*10)/10:v;const C=e.parentElement.querySelector(".rangeslider__value");C&&(C.textContent=S(v)),s&&(i.config.glassBlurCustom=!0,Pt("--glass-blur",`${v}px`)),a&&(i.config.glassAlphaCustom=!0,li(v)),n==="lyricsFontSize"&&Pt("--lyric-size",oi(v)),o&&Oh(i.config[n])},onCommit:()=>k()}}sliderValue(e){if(e==="glassBlur")return i.config.glassBlurCustom?i.config.glassBlur:wd();if(e==="glassAlpha")return i.config.glassAlphaCustom?i.config.glassAlpha:Oa();if(e==="trackGapSeconds"){const n=Number(i.config.trackGapSeconds);return Number.isFinite(n)?n:1}return i.config[e]??0}}ee("mp-settings-layer",Rh);class Nh extends me{static deps=e=>[e.floatingLyrics?.show,e.floatingLyrics?.text];render(){const e=i.floatingLyrics||{show:!1,text:""};return c`
      <div class="desktop-lyrics" id="desktop-lyrics" ?hidden=${!e.show} aria-hidden="true">
        <div class="desktop-lyrics__line" id="desktop-lyrics-line">${e.text}</div>
      </div>
    `}}ee("mp-floating-lyrics",Nh);class qh extends me{static deps=e=>[e.playerOpen,e.scanning,e.scanText,e.config.listDensity];updated(){const e=document.documentElement,n=i.config.listDensity||"cozy";e.dataset.density!==n&&(e.dataset.density=n)}render(){return c`
      <div class="app-bg" id="app-bg" aria-hidden="true"></div>

      <div class="app" id="app" data-view=${i.playerOpen?"player":"library"} data-mode="">
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
    `}}ee("mp-app",qh);let wn="";const Bh=200;class Fh extends Map{set(e,n){for(super.has(e)&&super.delete(e),super.set(e,n);this.size>Bh;){const s=super.keys().next();if(s.done)break;super.delete(s.value)}return this}}const Ca=new Fh,Vn=new Map;function Uh(){const t=new Image;return t.decoding="async",t.alt="",t}function Hh(t){return!i.config.accentFromCover||!xn(t)?!1:t!==wn}function gl(t){if(!xn(t))return Promise.resolve("");if(Ca.has(t))return Promise.resolve(Ca.get(t));if(Vn.has(t))return Vn.get(t);const e=new Promise(n=>{const s=o=>{Ca.set(t,o),Vn.delete(t),n(o)},a=document.getElementById("bar-cover-img");if(a&&a.getAttribute("src")===t&&a.complete&&a.naturalWidth>0){s(Ht(Wi(a)));return}const r=Uh();r.addEventListener("load",()=>s(xn(t)?Ht(Wi(r)):"")),r.addEventListener("error",()=>s("")),r.src=t});return Vn.set(t,e),e}async function _l(t){t&&kd(t,t)&&(await pn(),await Re(i.config))}async function zh(){if(!i.config.accentFromCover||Ht(i.config.coverSeed))return;const t=i.currentId?Ve(i.currentId):null,e=t?kt(t):"";e&&(wn=e,await _l(await gl(e)))}function Wh(t){if(!i.config.accentFromCover){wn="";return}if(t){if(!xn(t)){wn=t;return}Hh(t)&&(wn=t,gl(t).then(_l))}}function Kh(t){$d(xn(t)?t:"")}const Gn=new Set;function yl(t){const e=typeof t?.bvid=="string"?t.bvid.trim():"";if(e)return e;const n=typeof t?.id=="string"?t.id:"";return n.startsWith("bili:")?n.slice(5).trim():""}function jh(t,e,n,s=!0){return s?yl(t)?n===!0?"downloaded":e!==!0?"not-cached":"ok":"local":"disabled"}async function Vh(){try{const t=await b.onlineSourceIndex();return{downloads:t?.downloads||{},cache:t?.cache||{}}}catch(t){return console.warn("[auto-download] 读取在线来源索引失败",t),{downloads:{},cache:{}}}}async function Gh(t,e="collect"){if(!$())return!1;const n=yl(t);if(!n||Gn.has(n))return!1;const s=i.config?.autoDownloadOnCollect!==!1,a=await Vh();if(jh(t,a.cache?.[n]?.exists===!0,a.downloads?.[n]?.exists===!0,s)!=="ok")return!1;Gn.add(n);try{const o=await b.downloadStart(n,t.title||"",t.duration||0);return o?.started?(u(`已${e==="like"?"收藏":"加入歌单"}，同时在后台下载一份到本地`,{duration:3200}),!0):(o?.reason!=="already-running"&&Gn.delete(n),!1)}catch(o){return Gn.delete(n),console.warn("[auto-download] 自动下载失败（收藏本身已生效）",o),!1}}function Yh(){Pc((t,e)=>{Gh(t,e).catch(()=>{})})}let Pr="";function Xh(t){return[i.currentId??"",i.playing?1:0,Math.round((i.position||0)/250),i.duration||0,i.volume,i.muted?1:0,i.config.loudnessMode||"off",On()?1:0,Bs()?1:0,Math.round(Number(i.config.lyricsFontSize)||16),t].join("|")}function Or(){const t=i.currentId?Ve(i.currentId):null,e=t?kt(t):"",n=Xh(e);if(n!==Pr){if(Pr=n,Uu(),Wt(),On()){i.playing&&Ga();const s=i.playing?Dp():null;lh({text:s?s.text:"",trans:s?s.trans:[],chars:s?s.chars:[],words:s?s.words:[],wordEnds:s?s.wordEnds:[],posMs:Math.round(i.position||0),atMs:Date.now(),playing:!!i.playing,fontSize:Math.round((Number(i.config.lyricsFontSize)||16)*1.5)})}Bs()&&(i.playing&&Ga(),ei()),Wh(e),Kh(e)}}function Qh(){In(Or),Or()}let ds=null;function Jh(){Zh(),ds=U("media:key",t=>{t?.action==="toggle"&&Gt()}),Promise.resolve(b.mediaKeysReady()).catch(t=>{console.warn("[media-keys] 向后端报到失败（媒体键在此之前按引擎兜底处理）",t)})}function Zh(){if(ds){try{ds()}catch{}ds=null}}const $n=document.getElementById("boot-splash"),Yn=document.getElementById("boot-splash__frame");function Lr(){$n&&($n.dataset.hasframe="1")}Yn&&(Yn.complete?Yn.naturalWidth>0&&Lr():Yn.addEventListener("load",Lr,{once:!0}));let Rr=!1;function em(){Rr||(Rr=!0,fetch("/boot/reveal",{cache:"no-store",keepalive:!0}).catch(()=>{}),b.windowReady().catch(()=>{}))}let Nr=!1;function wl(){Nr||!$n||(Nr=!0,$n.dataset.hide="1",setTimeout(()=>$n.remove(),400))}em();setTimeout(wl,12e3);const ft=new Map;async function tm(){await An(),await zh(),await Re(i.config),window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",async()=>{i.config.themeMode==="system"&&(await Re(i.config),k())})}async function nm(){if($())try{const t=await b.coverCachedSets();if(!t||typeof t!="object")return;Qr(t);const e=Object.keys(t).length;e&&console.info(`[cover] 已从缓存回填 ${e} 首歌的封面（含多封面）`)}catch(t){console.info("[cover] 封面缓存回填跳过",t?.message??t)}}function sm(){document.addEventListener("keydown",t=>{const e=t.target.tagName,n=e==="INPUT"||e==="TEXTAREA"||e==="SELECT"||t.target.isContentEditable;if(t.key==="Escape"){if(document.getElementById("modal-backdrop")?.hidden===!1)return;Bc(),i.playerOpen&&Ns();return}if(!n)switch(t.key){case" ":t.preventDefault(),Gt();break;case"ArrowRight":t.ctrlKey||t.metaKey?Ut(!1):Ee(i.position+5e3);break;case"ArrowLeft":t.ctrlKey||t.metaKey?ai():Ee(i.position-5e3);break;case"ArrowUp":t.preventDefault(),Aa(i.volume+.05);break;case"ArrowDown":t.preventDefault(),Aa(i.volume-.05);break;case"l":case"L":i.currentId&&_t(i.currentId);break;case"p":case"P":Qa();break;case"f":case"F":am();break}})}async function am(){if($()){const t=!document.fullscreenElement;await b.windowSetFullscreen(t);return}document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen().catch(()=>{})}function im(){U("scan:start",()=>{i.scanning=!0,i.scanText="正在扫描音乐文件夹…",k()}),U("scan:progress",t=>{t&&(t.phase==="walk"?i.scanText="正在遍历音乐文件夹…":t.total&&(i.scanText=`正在读取元数据 ${t.current} / ${t.total}`),k())}),U("scan:done",async t=>{i.scanning=!1;const e=await b.songs();if(Array.isArray(e)){const s=new Set(i.songs.map(l=>l.id));i.allSongsRaw=e;const{kept:a,excluded:r}=Xr(e,i.filterRules);i.songs=a;const o=new Set(a.map(l=>l.id));i.lastScan={at:Date.now(),found:e.length,kept:a.length,excluded:r,added:a.filter(l=>!s.has(l.id)).length,removed:[...s].filter(l=>!o.has(l)).length}}const n=await b.folders();Array.isArray(n)&&(i.folders=n),k(),t?.added&&!t?.firstRun&&u(`文件夹变化：新增 ${t.added} 首`,{tone:"success"})}),U("scan:failed",t=>{i.scanning=!1,k(),u(`扫描失败：${t?.message??"未知错误"}`,{tone:"error",duration:5e3})}),U("library:unplayable",t=>{if(!t)return;Fc().catch(()=>{});const e=t.title||t.songId||"这首歌";u(`无法播放：${e}（已记入「音乐文件夹」清单）`,{tone:"error",duration:6e3}),Wr(!0)}),U("theme:changed",t=>{i.config.theme=t,Re(i.config),k()}),U("cover:changed",async t=>{const e=String(t?.id||"");try{if(!e){const s=await b.coverCachedSets();s&&typeof s=="object"&&Qr(s);return}const n=await b.coverList(e);n&&Array.isArray(n.items)&&Da(e,n)}catch(n){console.info("[cover] 同步封面失败",n?.message??n)}}),U("loudness:progress",t=>{t&&(i.loudnessState={...i.loudnessState||{},...t,running:!0},k())}),U("loudness:done",async t=>{i.loudnessState={...i.loudnessState||{},running:!1},k();const e=t?.failed??0;u(e?`响度测量完成：成功 ${t?.done-e} 首，失败 ${e} 首`:`响度测量完成：共 ${t?.done??0} 首`,{tone:e?"warning":"success",duration:4e3}),await yn(),await Ms()}),U("loudness:failed",t=>{i.loudnessState={...i.loudnessState||{},running:!1},k(),u(`响度测量失败：${t?.message??"未知错误"}`,{tone:"error",duration:6e3})}),U("ffmpeg:ready",t=>{t&&(i.ffmpegState=t,k(),console.info(`[ffmpeg] ${t.available?t.describe:"不可用"}`))}),U("download:progress",t=>{if(!t?.bvid)return;const e=t.title||t.bvid,n=Number(t.total)||0,s=Number(t.done)||0,a=n>0?Math.round(s/n*100):0,r=n>0?`下载中 ${a}% · ${e}`:`下载中 ${e}`;ft.has(t.bvid)?ft.get(t.bvid).update(r):ft.set(t.bvid,u(r,{duration:0}))}),U("download:done",t=>{const e=ft.get(t?.bvid);ft.delete(t?.bvid);const n=`已下载：${t?.title||t?.bvid} → ${t?.path||t?.dir||""}`;e?e.update(n,"success"):u(n,{tone:"success",duration:5e3}),setTimeout(()=>e?.close(),4e3),Uc(t?.path)}),U("download:failed",t=>{const e=ft.get(t?.bvid);ft.delete(t?.bvid);const n=`下载失败：${t?.message??"未知错误"}`;e?e.update(n,"error"):u(n,{tone:"error",duration:6e3}),setTimeout(()=>e?.close(),6e3)}),U("update:checked",t=>{t&&(i.update.check=t,i.update.checking=!1,i.update.error=t.error||"",k(),t.hasUpdate&&t.assetAvailable&&u(`发现新版本 ${t.latest}，可在「设置 → 关于」中更新`,{tone:"success",duration:6e3}))}),U("update:progress",t=>{t&&(i.update.progress={...i.update.progress||{},...t},k())}),U("update:downloaded",t=>{t&&(i.update.progress=null,i.update.pending={name:t.name,path:t.path,bytes:t.bytes,verified:t.verified,mirrorId:t.mirrorId},k(),u(`更新包已下载（${t.verified?"已校验":"未校验"}）：${t.name}`,{tone:t.verified?"success":"warning",duration:5e3}))}),U("update:failed",t=>{i.update.progress=null,i.update.error=t?.message||"下载失败",k()}),U("update:installing",t=>{i.update.progress=null,k(),u(`正在安装 ${t?.name||"更新"} 并重启…`,{duration:4e3})})}function qr(){const t=new URLSearchParams(location.search);if(!t.toString())return;const e=t.get("theme");if(e){i.config.theme=e;const o=Ma(e);o?.mode&&(i.config.themeMode=o.mode)}const n=t.get("tab");n==="settings"?i.settingsOpen=!0:n==="queue"?i.view="queue":n==="playlist"&&(i.view="playlist",i.playlistId=t.get("pl")||i.playlists[1]?.id||null);const s=t.get("pv");s&&(i.pvMode=s,i.config.playerViewMode=s),t.get("view")==="player"&&(i.playerOpen=!0),t.get("playing")==="1"&&(i.playing=!0,i.position=Number(t.get("pos")||62e3)),t.get("scan")==="1"&&(i.scanning=!0,setTimeout(()=>{i.scanning=!1,k()},8e3)),t.get("query")&&(i.query=t.get("query"));const a=Number(t.get("songs"));if(!$()&&Number.isFinite(a)&&a>i.songs.length){const o=i.songs.slice(),l=o.slice();for(;l.length<a;){const d=l.length,p=o[d%o.length];l.push({...p,id:`bench_${d}`,path:`C:/bench/${d}.${p.ext||"mp3"}`})}i.songs=l,i.allSongsRaw=l.slice(),k()}const r=t.get("density");r&&["compact","cozy","roomy"].includes(r)&&(i.config.listDensity=r),t.get("album")==="off"&&(i.config.showAlbumColumn=!1)}async function rm(){await Lc(),qr();const t=nm();if(await tm(),Pp().then(()=>{Kt(i.config.playerViewMode||""),to()&&Td()}),Rc(),Pd(),await Hd(),Eu(),Yh(),ch(),sm(),im(),qr(),await Ou(),Lu(),mi(),Do(),Jh(),Qh(),await t,await Re(i.config),za(),requestAnimationFrame(()=>requestAnimationFrame(wl)),await yn(),await Ms(),Nc().catch(()=>{}),qc(),Il(),window.addEventListener("beforeunload",()=>{pn()}),document.body.dataset.ready="true",fetch("/boot/booted",{cache:"no-store",keepalive:!0}).catch(()=>{}),new URLSearchParams(location.search).get("probe")==="1"){const{runProbe:e}=await $t(async()=>{const{runProbe:n}=await import("./probe-B9RoGxta.js");return{runProbe:n}},[]);setTimeout(()=>{const n=e();window.__probeReport=n,console.info("[probe]",n)},600)}$()||console.info(`%c浏览器预览模式%c
当前使用假数据渲染界面。接入 Go + Wails3 后端后，同名前端的 store/bridge 会自动改走后端方法。`,"background:#fff;color:#000;padding:2px 6px;border-radius:4px;font-weight:700","color:#888")}rm().catch(t=>{console.error("[app] 启动失败",t),u(`启动失败：${t.message}`,{tone:"error",duration:6e3})});window.addEventListener("unhandledrejection",t=>{const e=t.reason,n=e?.message||String(e||"未知错误");/no backend|preview:/i.test(n)||(console.error("[app] 未处理的异步错误",e),u(n.length>120?`${n.slice(0,120)}…`:n,{tone:"error",duration:6e3}))});window.addEventListener("error",t=>{t.message&&console.error("[app] 运行时错误",t.error||t.message)});window.__app={state:i,commit:k,navigate:Ot,openPlayer:Zo,closePlayer:Ns,rescan:Fr,doRescan:Cn,currentSong:Ke,isLiked:st,nextIndex:Oc,setPlayerViewMode:Kt,applyGainForSong:Wt,skinsToken:()=>b.skinsToken(),sourceIndex:()=>b.onlineSourceIndex(),protectIDs:t=>b.onlineProtectIDs(t),cleanupCache:()=>b.onlineCleanupCache(),searchState:L};const Ii=Object.freeze(Object.defineProperty({__proto__:null,closeCoverPanel:un,openCoverPanel:Eh},Symbol.toStringTag,{value:"Module"}));
