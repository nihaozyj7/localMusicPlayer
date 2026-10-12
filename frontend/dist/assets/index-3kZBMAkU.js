const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/base-DgPK_ilM.js","assets/bridge-DjcT-EQ1.js"])))=>i.map(i=>d[i]);
import{d as ll,i as $,b,f as I,e as At,o as U,g as wt,D as Ss,h as ut,u as Rn,j as Bs,k as Dr,l as cl,r as dl,n as en,p as ul}from"./bridge-DjcT-EQ1.js";import{j as pl,E as Ct,s as i,c as k,t as u,a as Cn,e as xa,r as xs,f as Mr,g as ge,d as ee,M as fe,A as x,h as f,b as c,k as fl,p as gt,o as j,l as He,m as Bt,n as hl,q as ml,u as bl,v as vl,w as gl,L as Gn,x as _l,y as Be,z as Ve,B as ze,C as Ft,D as Pr,F as Or,G as yl,H as wl,I as $l,J as Cs,K as Gt,$ as ki,N as Qa,O as kl,P as Sl,Q as nt,R as mt,S as Ja,T as xl,U as Cl,V as Tl,W as Lr,X as El,Y as ls,Z as Il,_ as Al,a0 as Dl,a1 as Dt,a2 as Ml,a3 as Pl,a4 as Ol,a5 as $n,a6 as Ca,a7 as Rr,a8 as Ta,a9 as Nr,aa as Ll,ab as Si,ac as Rl,ad as Nl,ae as ql,af as Bl,ag as xi,ah as Fl,ai as qr,aj as Tn,ak as Ul,al as Br,am as Hl,an as zl,ao as Kl,ap as jl,aq as Vl,ar as Wl,as as Ea,at as Gl,au as Ia,av as Fr,aw as Yl,ax as Xl,ay as Ql,az as Jl,aA as Ci,aB as Ti,aC as Zl,aD as ec,aE as tc,aF as nc,aG as sc,aH as ac,aI as ic,aJ as Fs,aK as rc,aL as oc,aM as lc,aN as cc,aO as dc,aP as uc,aQ as pc,aR as fc,aS as hc,aT as mc,aU as un,aV as bc,aW as vc,aX as gc,aY as _c,aZ as yc,a_ as Ur,a$ as wc,b0 as $c,b1 as kc}from"./base-DgPK_ilM.js";import{s as Sc,S as xc,f as Yn,a as Xn,b as Cc,p as Ei,m as Tc,d as Ii,e as cs,g as kn,h as Ec,l as Ic,n as Ac,i as Dc,u as Mc,r as Ts,c as Pc,j as Es,k as Oc,w as Lc,o as Rc}from"./skinhost-DLTflAST.js";const Nc="modulepreload",qc=function(t){return"/"+t},Ai={},_t=function(e,n,s){let a=Promise.resolve();if(n&&n.length>0){let d=function(p){return Promise.all(p.map(m=>Promise.resolve(m).then(h=>({status:"fulfilled",value:h}),h=>({status:"rejected",reason:h}))))};document.getElementsByTagName("link");const o=document.querySelector("meta[property=csp-nonce]"),l=o?.nonce||o?.getAttribute("nonce");a=d(n.map(p=>{if(p=qc(p),p in Ai)return;Ai[p]=!0;const m=p.endsWith(".css"),h=m?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${p}"]${h}`))return;const y=document.createElement("link");if(y.rel=m?"stylesheet":Nc,m||(y.as="script"),y.crossOrigin="",y.href=p,l&&y.setAttribute("nonce",l),document.head.appendChild(y),m)return new Promise((S,v)=>{y.addEventListener("load",S),y.addEventListener("error",()=>v(new Error(`Unable to preload CSS for ${p}`)))})}))}function r(o){const l=new Event("vite:preloadError",{cancelable:!0});if(l.payload=o,window.dispatchEvent(l),!l.defaultPrevented)throw o}return a.then(o=>{for(const l of o||[])l.status==="rejected"&&r(l.reason);return e().catch(r)})};const Bc={CHILD:2},Za=t=>(...e)=>({_$litDirective$:t,values:e});let ei=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,n,s){this._$Ct=e,this._$AM=n,this._$Ci=s}_$AS(e,n){return this.update(e,n)}update(e,n){return this.render(...n)}};const{I:Fc}=pl,Di=t=>t,Mi=()=>document.createComment(""),tn=(t,e,n)=>{const s=t._$AA.parentNode,a=e===void 0?t._$AB:e._$AA;if(n===void 0){const r=s.insertBefore(Mi(),a),o=s.insertBefore(Mi(),a);n=new Fc(r,o,t,t.options)}else{const r=n._$AB.nextSibling,o=n._$AM,l=o!==t;if(l){let d;n._$AQ?.(t),n._$AM=t,n._$AP!==void 0&&(d=t._$AU)!==o._$AU&&n._$AP(d)}if(r!==a||l){let d=n._$AA;for(;d!==r;){const p=Di(d).nextSibling;Di(s).insertBefore(d,a),d=p}}}return n},ot=(t,e,n=t)=>(t._$AI(e,n),t),Uc={},Hr=(t,e=Uc)=>t._$AH=e,Hc=t=>t._$AH,Us=t=>{t._$AR(),t._$AA.remove()};const Pi=(t,e,n)=>{const s=new Map;for(let a=e;a<=n;a++)s.set(t[a],a);return s},Te=Za(class extends ei{constructor(t){if(super(t),t.type!==Bc.CHILD)throw Error("repeat() can only be used in text expressions")}dt(t,e,n){let s;n===void 0?n=e:e!==void 0&&(s=e);const a=[],r=[];let o=0;for(const l of t)a[o]=s?s(l,o):o,r[o]=n(l,o),o++;return{values:r,keys:a}}render(t,e,n){return this.dt(t,e,n).values}update(t,[e,n,s]){const a=Hc(t),{values:r,keys:o}=this.dt(e,n,s);if(!Array.isArray(a))return this.ut=o,r;const l=this.ut??=[],d=[];let p,m,h=0,y=a.length-1,S=0,v=r.length-1;for(;h<=y&&S<=v;)if(a[h]===null)h++;else if(a[y]===null)y--;else if(l[h]===o[S])d[S]=ot(a[h],r[S]),h++,S++;else if(l[y]===o[v])d[v]=ot(a[y],r[v]),y--,v--;else if(l[h]===o[v])d[v]=ot(a[h],r[v]),tn(t,d[v+1],a[h]),h++,v--;else if(l[y]===o[S])d[S]=ot(a[y],r[S]),tn(t,a[h],a[y]),y--,S++;else if(p===void 0&&(p=Pi(o,S,v),m=Pi(l,h,y)),p.has(l[h]))if(p.has(l[y])){const C=m.get(o[S]),q=C!==void 0?a[C]:null;if(q===null){const F=tn(t,a[h]);ot(F,r[S]),d[S]=F}else d[S]=ot(q,r[S]),tn(t,a[h],q),a[C]=null;S++}else Us(a[y]),y--;else Us(a[h]),h++;for(;S<=v;){const C=tn(t,d[v+1]);ot(C,r[S]),d[S++]=C}for(;h<=y;){const C=a[h++];C!==null&&Us(C)}return this.ut=o,Hr(t,d),Ct}}),ds=14,us=72,zc=16;function ti(t){const e=Math.round(Number(t));return!Number.isFinite(e)||e<=0?`${zc}px`:`${Math.min(us,Math.max(ds,e))}px`}const Kc=[{id:"flat-dark",name:"简约深色",mode:"dark",builtin:!0,swatch:["#101113","#1b1d21","#3b4048","#e6e8eb","#8b9bb4"]},{id:"flat-light",name:"简约浅色",mode:"light",builtin:!0,swatch:["#f5f6f7","#ffffff","#d7dae0","#1a1c20","#43536b"]},{id:"cover-dark",name:"封面取色 · 深色",mode:"dark",builtin:!0,swatch:["#0b0b12","#2a2a31","#6b6b76","#f7f7fa","#ff4d6d"]}],ae=Kc.slice();let zr=0;function jc(){return zr}function En(){return ae}function ps(t){return ae.find(e=>e.id===t)||ae[0]}async function In(){if(!$())return ae;try{const t=await b.listThemes();if(!Array.isArray(t)||!t.length)return ae;for(const e of t){if(!e?.id)continue;const n=await b.loadTheme(e.id);typeof n=="string"&&n.trim()&&Gc(e.id,n)}Vc(t)}catch(t){console.warn("[theme] 主题目录扫描失败",t)}return ae}function Vc(t){const e=[],n=new Set;for(const s of t){if(!s?.id||n.has(s.id))continue;n.add(s.id);const a={id:s.id,name:s.name||s.id,mode:s.mode||"dark",swatch:Array.isArray(s.swatch)?s.swatch:[],builtin:!!s.builtin},r=ae.find(o=>o.id===s.id);r?(Object.assign(r,a),e.push(r)):e.push(a)}for(const s of ae)e.includes(s)||xs(`theme-file-${s.id}`,"");return ae.length=0,ae.push(...e),zr+=1,ae}async function Wc(t){return await b.deleteTheme(t),await In(),{removed:!ae.some(n=>n.id===t),themeIds:ae.map(n=>n.id)}}function Gc(t,e){xs(`theme-file-${t}`,e)}const Yc=["--seed","--seed-2","--bg-app","--bg-window"],Xc=["--seed","--seed-2"];function Qc(t){return document.documentElement.style.getPropertyValue(t).trim()?String(document.documentElement.style.getPropertyValue(t)):null}function Jc(){const t=document.documentElement,e={};for(const n of Xc){const s=Qc(n);s&&(e[n]=s)}for(const n of Yc)t.style.removeProperty(n);return e}const Qn="cover-dark";function Sn(t){return!!t&&!ll(t)}let Oi=null,Hs=null,zs=null;async function Le(t){const e=document.documentElement,n=window.matchMedia("(prefers-color-scheme: dark)").matches,s=Jc();s["--seed"]&&(Hs=s["--seed"]),s["--seed-2"]&&(zs=s["--seed-2"]);let a=t.theme||"flat-dark";if(t.themeMode==="system"){const h=n?"dark":"light",y=ae.find(S=>S.mode===h&&S.id!=="cover-dark");y&&(a=y.id)}else if(ae.find(h=>h.id===a)?.mode!==t.themeMode){const h=ae.find(y=>y.mode===t.themeMode&&y.id!=="cover-dark");h&&(a=h.id)}e.dataset.theme=a,e.dataset.mode=ae.find(h=>h.id===a)?.mode||t.themeMode||"dark",t.theme=a;const r=Li(t,a),o=Li(t,a,!0),l=t.accentFromCover!==!1;(t.accentFromCover===!1||Oi!==null&&a!==Qn)&&(Hs=null,zs=null);const p=r??(l?Hs:null),m=o??zs??p;return Cn({"--glass-blur":t.glassBlurCustom?`${t.glassBlur}px`:null,"--dur":xa(t),"--lyric-size":ti(t.lyricsFontSize),"--seed":p,"--seed-2":m}),Oi=p&&a===Qn?Qn:null,nd(),ed(),t.glassAlphaCustom&&ni(t.glassAlpha),a}function Li(t,e,n=!1){return!t||t.accentFromCover!==!0||e!=="cover-dark"?null:Ut(n?t.coverSeed2:t.coverSeed)||null}async function Zc(){const e=ps(i.config.theme)?.mode==="light"?"dark":"light";i.config.themeMode=e,await Le(i.config),k(),u(e==="dark"?"已切换到深色主题":"已切换到浅色主题",{duration:1500})}let $t=null;function Jn(t){return $t||($t=document.createElement("div"),$t.style.cssText="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;",document.body.appendChild($t)),$t.style.backgroundColor=t,getComputedStyle($t).backgroundColor}function Ks(t,e){const n=Math.max(0,Math.min(1,e)),s=String(t),a=s.match(/rgba?\(([^)]+)\)/);if(a){const o=a[1].split(/[,/]/).map(m=>parseFloat(m.trim())),[l,d,p]=o;if([l,d,p].every(m=>Number.isFinite(m)))return`rgba(${Math.round(l)}, ${Math.round(d)}, ${Math.round(p)}, ${n})`}const r=s.match(/color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);if(r){const[o,l,d]=r.slice(1,4).map(p=>Math.round(parseFloat(p)*255));if([o,l,d].every(p=>Number.isFinite(p)))return`rgba(${o}, ${l}, ${d}, ${n})`}return null}function Aa(){const t=String(Jn("var(--glass-bg)")),e=t.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/),n=t.match(/\/\s*([\d.]+)\s*\)/),s=parseFloat(e&&e[1]||n&&n[1]||"");return Number.isFinite(s)?Math.round(s*100):62}let rn=null;function ed(){rn=null}function td(){return rn||(Cn({"--glass-bg":null,"--glass-bg-strong":null,"--glass-bg-weak":null}),rn={bg:Jn("var(--glass-bg)"),strong:Jn("var(--glass-bg-strong)"),weak:Jn("var(--glass-bg-weak)")},rn)}function ni(t){const e=Math.max(0,Math.min(1,(Number(t)||0)/100)),n=td();Cn({"--glass-bg":Ks(n.bg,e),"--glass-bg-strong":Ks(n.strong,Math.min(1,e+.18)),"--glass-bg-weak":Ks(n.weak,Math.max(0,e-.22))})}function nd(){const t=document.body;t&&(t.dataset.styleEpoch=String((Number(t.dataset.styleEpoch)||0)+1))}function sd(){const t=getComputedStyle(document.documentElement).getPropertyValue("--glass-blur"),e=parseFloat(t);return Number.isFinite(e)?e:22}function Ut(t){const e=String(t??"").trim();if(!e)return"";const n=e.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);if(n){let a=n[1].toLowerCase();return a.length===3&&(a=a[0]+a[0]+a[1]+a[1]+a[2]+a[2]),`#${a}`}const s=e.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);if(s){const a=r=>Math.max(0,Math.min(255,Math.round(Number(r)))).toString(16).padStart(2,"0");return`#${a(s[1])}${a(s[2])}${a(s[3])}`}return""}let Ri="";function ad(t){const e=document.documentElement.dataset.theme||"",n=typeof t=="string"?t.trim():"",s=e===Qn?n:"";s!==Ri&&(Ri=s,Cn({"--cover-bg":s?`url("${s.replace(/["\\]/g,"\\$&")}")`:null}))}function id(t,e){const n=Ut(t),s=Ut(e)||n;return n?(Cn({"--seed":n,"--seed-2":s}),i.config.coverSeed!==n||i.config.coverSeed2!==s?(i.config.coverSeed=n,i.config.coverSeed2=s,od(),!0):!1):!1}const rd="music-player.cover-seed.v1";function od(){try{localStorage.setItem(rd,JSON.stringify({seed:i.config.coverSeed||"",seed2:i.config.coverSeed2||"",theme:i.config.theme||""}))}catch{}}function Ni(t){try{const e=document.createElement("canvas"),n=32;e.width=n,e.height=n;const s=e.getContext("2d",{willReadFrequently:!0});s.drawImage(t,0,0,n,n);const{data:a}=s.getImageData(0,0,n,n);let r=0,o=0,l=0,d=0,p=0,m=0,h=0,y=0;for(let v=0;v<a.length;v+=4){if(a[v+3]<8)continue;const C=a[v],q=a[v+1],F=a[v+2];p+=C,m+=q,h+=F,y+=1;const z=Math.max(C,q,F),he=Math.min(C,q,F);if(z<26)continue;const te=z===0?0:(z-he)/z;if(te<.12)continue;const _e=te*te*(.35+z/255);r+=C*_e,o+=q*_e,l+=F*_e,d+=_e}const S=d>0?[r/d,o/d,l/d]:y>0?[p/y,m/y,h/y]:null;return S?`rgb(${S.map(v=>Math.round(Math.max(0,Math.min(255,v)))).join(", ")})`:null}catch{return null}}function js(){i.query="",k()}function Mt(t,e=null){if(i.settingsOpen&&fs(),t==="settings"){Kr();return}i.view=t,i.playlistId=t==="playlist"?e:null,i.playerOpen=!1,i.query="",i.playlistSelecting=!1,i.selectedIds=new Set,i.queueOpen=!1,k()}function Kr(t=null){i.settingsOpen=!0,t&&(i.settingsSection=t),k()}function fs(){i.settingsOpen=!1,k()}function ld(t=null){i.settingsOpen?fs():Kr(t)}function jr(){return i.settingsOpen===!0}function cd(){i.settingsOpen&&(i.settingsRev=(i.settingsRev||0)+1,k(),ge())}async function xn({manual:t=!1}={}){if(!i.scanning){i.scanText="正在扫描音乐文件夹…",k();try{const e=await Mr({silent:!t});e&&u(`扫描完成：保留 ${I(e.kept)} 首${e.excluded?`，过滤 ${I(e.excluded)} 个`:""}${e.added?`，新增 ${I(e.added)}`:""}${e.removed?`，移除 ${I(e.removed)}`:""}`,{tone:"success",duration:3600})}finally{i.scanning=!1,k()}}}const Vr="music-player.search.history.v1",dd=20;function Vs(){try{const t=localStorage.getItem(Vr),e=t?JSON.parse(t):[];return Array.isArray(e)?e.filter(n=>typeof n=="string"&&n.trim()):[]}catch{return[]}}function Ws(t){try{localStorage.setItem(Vr,JSON.stringify(t.slice(0,dd)))}catch{}}const R={keyword:"",seq:0,results:[],query:"",loading:!1,message:"",rev:0};function De(){R.rev+=1,ge()}class ud extends fe{static deps=e=>[e.searchOpen,R.rev];get panelEl(){return this.querySelector("#search-overlay")}updated(){const e=this.panelEl;if(e){if(i.searchOpen){this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden&&(e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{i.searchOpen&&(e.dataset.state="opened")}),requestAnimationFrame(()=>{const n=this.querySelector("#search-input");n?.focus(),n?.select()}));return}e.hidden||(e.dataset.state="closed",this._closeTimer||(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!i.searchOpen&&e&&(e.hidden=!0)},260)))}}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),super.disconnectedCallback()}render(){const e=R,n=Vs(),s=!!e.keyword.trim(),a=this.headline();return c`
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
              @click=${()=>Zn()}
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
                @input=${r=>{R.keyword=r.target.value,De()}}
                @keydown=${r=>{r.key==="Enter"&&(r.preventDefault(),this.submitSearch()),r.key==="Escape"&&(r.preventDefault(),R.keyword.trim()?this.clearSearch({focus:!0}):Zn())}}
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
    `}headline(){const e=R;return e.loading?"搜索中…":e.query?`在线「${e.query}」${I(e.results.length)} 个结果`:""}bodyContent(){const e=R;return e.loading?c`<div class="search-overlay__loading">
        <span class="search-overlay__spinner"></span>正在搜索「${e.keyword.trim()}」…
      </div>`:e.message?this.empty(e.message):e.results.length?Te(e.results,n=>n.id,n=>c`
        <div
          class="search-row"
          data-search-id=${n.id}
          data-search-online="1"
          role="button"
          tabindex="0"
          @click=${()=>Gs(n.id)}
        >
          <span class="search-row__cover">
            ${n.coverUrl?c`<img src=${n.coverUrl} alt="" loading="lazy" />`:c`<span class="search-row__cover-fallback">${f("music")}</span>`}
          </span>
          <span class="search-row__main">
            <span class="search-row__title">${n.title||"未命名"}</span>
            <span class="search-row__sub">${n.artist||"未知"} · ${At(n.duration)}</span>
          </span>
          <span class="search-row__actions">
            <button
              class="btn btn--sm btn--primary"
              type="button"
              data-search-act="preview"
              data-id=${n.id}
              @click=${s=>{s.stopPropagation(),Gs(n.id)}}
            >
              ${f("play")}<span>试听</span>
            </button>
            <button
              class="btn btn--sm"
              type="button"
              data-search-act="download"
              data-id=${n.id}
              @click=${s=>{s.stopPropagation(),vd(n)}}
            >
              ${f("file")}<span>下载</span>
            </button>
          </span>
        </div>
      `):this.empty(e.query?"没有搜到在线歌曲，换个关键词试试":"输入关键词后按回车搜索在线歌曲")}empty(e){return c`<div class="search-overlay__empty">${f("search")}<span>${e}</span></div>`}onClick(e){(e.target.closest("[data-search-close]")||e.target===this.panelEl)&&Zn()}onKey(e){if(e.key!=="Enter"&&e.key!==" ")return;const n=e.target.closest?.("[data-search-id]");n&&(e.preventDefault(),Gs(n.dataset.searchId))}addHistory(e){const n=(e||"").trim();if(!n)return;const s=Vs().filter(a=>a!==n);s.unshift(n),Ws(s),De()}removeHistory(e){Ws(Vs().filter(n=>n!==e)),De()}clearHistory(){Ws([]),De()}useHistory(e){R.keyword=e,De(),this.submitSearch()}submitSearch(){const e=(R.keyword||"").trim();if(!e){this.clearSearch({focus:!0});return}this.addHistory(e),this.runOnlineSearch(e)}clearSearch({focus:e=!1}={}){R.keyword="",R.results=[],R.query="",R.message="",R.loading=!1,R.seq+=1,De(),e&&requestAnimationFrame(()=>this.querySelector("#search-input")?.focus())}async runOnlineSearch(e){R.query="",R.results=[],R.message="",R.loading=!0,De();const n=++R.seq;if(!$()){R.loading=!1,R.message="浏览器预览下没有在线搜索后端，请在应用里试",De();return}try{const s=await b.onlineSearch(e,1,24);if(n!==R.seq)return;R.results=Array.isArray(s)?s:[],R.query=e,R.loading=!1,De()}catch(s){if(n!==R.seq)return;R.results=[],R.query=e,R.loading=!1,R.message=`在线搜索失败：${s?.message??s}`,De()}}}ee("mp-search-overlay",ud);function pd(t){!i.searchOpen?Wr():Zn()}function Wr(){i.searchOpen=!0,k()}function Zn(){i.searchOpen=!1,k()}function fd(){document.addEventListener("keydown",t=>{!(t.ctrlKey||t.metaKey)||t.key.toLowerCase()!=="f"||(t.preventDefault(),Wr())})}function Gs(t){const e=R.results.find(r=>r.id===t);if(!e)return;const n=fl({id:e.id,title:e.title||"未命名",artist:e.artist||"未知",album:e.album||"在线",ext:e.ext||"m4a",duration:e.duration||0,size:0,sampleRate:0,bitrate:0,addedAt:Date.now(),playCount:0,path:"",cover:"",coverUrl:e.coverUrl||"",streamUrl:e.streamUrl||"",downloadUrl:e.downloadUrl||"",bvid:e.bvid||"",online:!0}),s=i.queue.includes(n.id)?i.queue.slice():[...i.queue,n.id],a=s.indexOf(n.id);gt(s,a,{type:"online",id:null}),u(`已加入播放列表并开始试听：${n.title}`,{tone:"success",duration:2200})}const Gr="music-player.download.notice.v1";function hd(){try{return localStorage.getItem(Gr)==="1"}catch{return!1}}function md(){try{localStorage.setItem(Gr,"1")}catch{}}function bd(t){return new Promise(e=>{j({title:"下载前请确认",desc:`即将把《${t.title||"未命名"}》的音频保存到你的下载目录。`,body:c`
        <div class="about-note">
          <div class="about-note__body">· 下载内容来自第三方平台，版权归原作者与权利人所有。</div>
          <div class="about-note__body">· 仅限个人学习、欣赏使用，请勿传播、二次分发或用于商业用途。</div>
          <div class="about-note__body">· 各平台对其内容的使用另有服务条款，请一并遵守。</div>
        </div>
        <label class="setting__hint"><input type="checkbox" data-field="dontAsk" /> 不再提示</label>
      `,okText:"我已知晓，开始下载",onOk:n=>(n.dontAsk&&md(),e(!0),!0),onCancel:()=>{e(!1)}})})}async function vd(t){if(!$()){u("浏览器预览无法下载",{tone:"warning"});return}if(!(!hd()&&!await bd(t)))try{const e=await b.downloadStart(t.bvid||String(t.id).replace(/^bili:/,""),t.title||"",t.duration||0);if(!e?.started){u(e?.reason==="already-running"?"这首歌正在下载中":"无法开始下载",{tone:"warning"});return}u(`开始下载到 ${e.dir}`,{duration:2600})}catch(e){u(`下载失败：${e?.message??e}`,{tone:"error",duration:6e3})}}let Fe=[],hs=!1,Yr=0,Ys=0;function Pt(){Yr+=1,ge()}function pn(){const t=Fe.filter(e=>e?.state==="running").length;return{tasks:Fe,running:t,revision:Yr,open:hs,visible:Fe.length>0,badge:t>0?String(t):""}}function Xr(t){hs=typeof t=="boolean"?t:!hs,Pt()}function gd(){Xr(!1)}async function _d(){if(!$()){Fe=Fe.filter(t=>t?.state==="running"),Pt();return}try{const t=await b.downloadClearFinished();Da(t)}catch(t){u(`清除失败：${t?.message??t}`,{tone:"error"})}}function yd(){const t=Fe.find(e=>e?.dir)?.dir||"";b.downloadOpenDir(t).catch(e=>u(`打开目录失败：${e?.message??e}`,{tone:"error"}))}function wd(t){const e=Fe.find(s=>s.id===t),n=e?.path||e?.dir;n&&b.downloadOpenDir(n).catch(s=>u(`打开失败：${s?.message??s}`,{tone:"error"}))}function Da(t){!t||!Array.isArray(t.tasks)||(Fe=t.tasks,Pt())}async function $d(){if(U("download:tasks",e=>{Ys+=1,Da(e)}),!$()){if(kd()){Pt(),hs=!0,Pt();return}Pt();return}const t=Ys;try{const e=await b.downloadTasks();Ys===t&&Da(e)}catch(e){console.info("[downloads] 拉取下载任务失败",e?.message??e)}}function kd(){return $()||new URLSearchParams(location.search).get("downloads")!=="1"?!1:(Fe=[{id:"preview-1",bvid:"BV1xx411c7mD",title:"晴天 - 周杰伦",state:"running",done:231e4,total:47e5,dir:"C:\\Users\\Me\\Music\\downloads"},{id:"preview-2",bvid:"BV1yy411c7mE",title:"孤勇者 - 陈奕迅",state:"done",done:39e5,total:39e5,path:"C:\\Users\\Me\\Music\\downloads\\孤勇者 - 陈奕迅.m4a",dir:"C:\\Users\\Me\\Music\\downloads"},{id:"preview-3",bvid:"BV1zz411c7mF",title:"一首标题很长很长、长到面板里必须被省略号截断的测试歌曲",state:"failed",done:12e4,total:5e6,message:"下载到的内容为空",dir:"C:\\Users\\Me\\Music\\downloads"}],!0)}class Sd extends fe{static deps=()=>{const n=ps(i.config.theme)?.mode!=="light",s=pn();return[n,i.config.themeMode,i.searchOpen,s.visible,s.badge]};render(){const n=ps(i.config.theme)?.mode!=="light",s=pn();return c`
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
            @click=${()=>pd()}
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
            @click=${()=>Xr()}
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
            @click=${()=>Zc()}
          >
            ${f(n?"sun":"moon")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-settings"
            type="button"
            data-tip="设置"
            aria-label="设置"
            @click=${()=>ld()}
          >
            ${f("settings")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-win-min"
            type="button"
            aria-label="最小化"
            @click=${()=>Xs("min")}
          >
            ${f("minimize")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-win-max"
            type="button"
            aria-label="最大化"
            @click=${()=>Xs("max")}
          >
            ${f("maximize")}
          </button>
          <button
            class="titlebar__btn titlebar__btn--close"
            id="btn-win-close"
            type="button"
            aria-label="关闭"
            @click=${()=>Xs("close")}
          >
            ${f("close")}
          </button>
        </div>
      </header>
    `}}function Xs(t){if(!$()){t==="close"&&window.close();return}t==="min"?b.windowMinimize():t==="max"?b.windowToggleMaximize():b.windowClose()}ee("mp-titlebar",Sd);function xd(t,e,n){return(e=Id(e))in t?Object.defineProperty(t,e,{value:n,enumerable:!0,configurable:!0,writable:!0}):t[e]=n,t}function Ke(){return Ke=Object.assign?Object.assign.bind():function(t){for(var e=1;e<arguments.length;e++){var n=arguments[e];for(var s in n)({}).hasOwnProperty.call(n,s)&&(t[s]=n[s])}return t},Ke.apply(null,arguments)}function qi(t,e){var n=Object.keys(t);if(Object.getOwnPropertySymbols){var s=Object.getOwnPropertySymbols(t);e&&(s=s.filter(function(a){return Object.getOwnPropertyDescriptor(t,a).enumerable})),n.push.apply(n,s)}return n}function Re(t){for(var e=1;e<arguments.length;e++){var n=arguments[e]!=null?arguments[e]:{};e%2?qi(Object(n),!0).forEach(function(s){xd(t,s,n[s])}):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(n)):qi(Object(n)).forEach(function(s){Object.defineProperty(t,s,Object.getOwnPropertyDescriptor(n,s))})}return t}function Cd(t,e){if(t==null)return{};var n,s,a=Td(t,e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(t);for(s=0;s<r.length;s++)n=r[s],e.indexOf(n)===-1&&{}.propertyIsEnumerable.call(t,n)&&(a[n]=t[n])}return a}function Td(t,e){if(t==null)return{};var n={};for(var s in t)if({}.hasOwnProperty.call(t,s)){if(e.indexOf(s)!==-1)continue;n[s]=t[s]}return n}function Ed(t,e){if(typeof t!="object"||!t)return t;var n=t[Symbol.toPrimitive];if(n!==void 0){var s=n.call(t,e);if(typeof s!="object")return s;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(t)}function Id(t){var e=Ed(t,"string");return typeof e=="symbol"?e:e+""}function Ma(t){"@babel/helpers - typeof";return Ma=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(e){return typeof e}:function(e){return e&&typeof Symbol=="function"&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},Ma(t)}var Ad="1.15.7";function Ue(t){if(typeof window<"u"&&window.navigator)return!!navigator.userAgent.match(t)}var We=Ue(/(?:Trident.*rv[ :]?11\.|msie|iemobile|Windows Phone)/i),An=Ue(/Edge/i),Bi=Ue(/firefox/i),fn=Ue(/safari/i)&&!Ue(/chrome/i)&&!Ue(/android/i),si=Ue(/iP(ad|od|hone)/i),Qr=Ue(/chrome/i)&&Ue(/android/i),Jr={capture:!1,passive:!1};function L(t,e,n){t.addEventListener(e,n,!We&&Jr)}function P(t,e,n){t.removeEventListener(e,n,!We&&Jr)}function ms(t,e){if(e){if(e[0]===">"&&(e=e.substring(1)),t)try{if(t.matches)return t.matches(e);if(t.msMatchesSelector)return t.msMatchesSelector(e);if(t.webkitMatchesSelector)return t.webkitMatchesSelector(e)}catch{return!1}return!1}}function Zr(t){return t.host&&t!==document&&t.host.nodeType&&t.host!==t?t.host:t.parentNode}function xe(t,e,n,s){if(t){n=n||document;do{if(e!=null&&(e[0]===">"?t.parentNode===n&&ms(t,e):ms(t,e))||s&&t===n)return t;if(t===n)break}while(t=Zr(t))}return null}var Fi=/\s+/g;function be(t,e,n){if(t&&e)if(t.classList)t.classList[n?"add":"remove"](e);else{var s=(" "+t.className+" ").replace(Fi," ").replace(" "+e+" "," ");t.className=(s+(n?" "+e:"")).replace(Fi," ")}}function E(t,e,n){var s=t&&t.style;if(s){if(n===void 0)return document.defaultView&&document.defaultView.getComputedStyle?n=document.defaultView.getComputedStyle(t,""):t.currentStyle&&(n=t.currentStyle),e===void 0?n:n[e];!(e in s)&&e.indexOf("webkit")===-1&&(e="-webkit-"+e),s[e]=n+(typeof n=="string"?"":"px")}}function Ot(t,e){var n="";if(typeof t=="string")n=t;else do{var s=E(t,"transform");s&&s!=="none"&&(n=s+" "+n)}while(!e&&(t=t.parentNode));var a=window.DOMMatrix||window.WebKitCSSMatrix||window.CSSMatrix||window.MSCSSMatrix;return a&&new a(n)}function eo(t,e,n){if(t){var s=t.getElementsByTagName(e),a=0,r=s.length;if(n)for(;a<r;a++)n(s[a],a);return s}return[]}function Oe(){var t=document.scrollingElement;return t||document.documentElement}function Y(t,e,n,s,a){if(!(!t.getBoundingClientRect&&t!==window)){var r,o,l,d,p,m,h;if(t!==window&&t.parentNode&&t!==Oe()?(r=t.getBoundingClientRect(),o=r.top,l=r.left,d=r.bottom,p=r.right,m=r.height,h=r.width):(o=0,l=0,d=window.innerHeight,p=window.innerWidth,m=window.innerHeight,h=window.innerWidth),(e||n)&&t!==window&&(a=a||t.parentNode,!We))do if(a&&a.getBoundingClientRect&&(E(a,"transform")!=="none"||n&&E(a,"position")!=="static")){var y=a.getBoundingClientRect();o-=y.top+parseInt(E(a,"border-top-width")),l-=y.left+parseInt(E(a,"border-left-width")),d=o+r.height,p=l+r.width;break}while(a=a.parentNode);if(s&&t!==window){var S=Ot(a||t),v=S&&S.a,C=S&&S.d;S&&(o/=C,l/=v,h/=v,m/=C,d=o+m,p=l+h)}return{top:o,left:l,bottom:d,right:p,width:h,height:m}}}function Ui(t,e,n){for(var s=et(t,!0),a=Y(t)[e];s;){var r=Y(s)[n],o=void 0;if(o=a>=r,!o)return s;if(s===Oe())break;s=et(s,!1)}return!1}function Ht(t,e,n,s){for(var a=0,r=0,o=t.children;r<o.length;){if(o[r].style.display!=="none"&&o[r]!==T.ghost&&(s||o[r]!==T.dragged)&&xe(o[r],n.draggable,t,!1)){if(a===e)return o[r];a++}r++}return null}function ai(t,e){for(var n=t.lastElementChild;n&&(n===T.ghost||E(n,"display")==="none"||e&&!ms(n,e));)n=n.previousElementSibling;return n||null}function ye(t,e){var n=0;if(!t||!t.parentNode)return-1;for(;t=t.previousElementSibling;)t.nodeName.toUpperCase()!=="TEMPLATE"&&t!==T.clone&&(!e||ms(t,e))&&n++;return n}function Hi(t){var e=0,n=0,s=Oe();if(t)do{var a=Ot(t),r=a.a,o=a.d;e+=t.scrollLeft*r,n+=t.scrollTop*o}while(t!==s&&(t=t.parentNode));return[e,n]}function Dd(t,e){for(var n in t)if(t.hasOwnProperty(n)){for(var s in e)if(e.hasOwnProperty(s)&&e[s]===t[n][s])return Number(n)}return-1}function et(t,e){if(!t||!t.getBoundingClientRect)return Oe();var n=t,s=!1;do if(n.clientWidth<n.scrollWidth||n.clientHeight<n.scrollHeight){var a=E(n);if(n.clientWidth<n.scrollWidth&&(a.overflowX=="auto"||a.overflowX=="scroll")||n.clientHeight<n.scrollHeight&&(a.overflowY=="auto"||a.overflowY=="scroll")){if(!n.getBoundingClientRect||n===document.body)return Oe();if(s||e)return n;s=!0}}while(n=n.parentNode);return Oe()}function Md(t,e){if(t&&e)for(var n in e)e.hasOwnProperty(n)&&(t[n]=e[n]);return t}function Qs(t,e){return Math.round(t.top)===Math.round(e.top)&&Math.round(t.left)===Math.round(e.left)&&Math.round(t.height)===Math.round(e.height)&&Math.round(t.width)===Math.round(e.width)}var hn;function to(t,e){return function(){if(!hn){var n=arguments,s=this;n.length===1?t.call(s,n[0]):t.apply(s,n),hn=setTimeout(function(){hn=void 0},e)}}}function Pd(){clearTimeout(hn),hn=void 0}function no(t,e,n){t.scrollLeft+=e,t.scrollTop+=n}function so(t){var e=window.Polymer,n=window.jQuery||window.Zepto;return e&&e.dom?e.dom(t).cloneNode(!0):n?n(t).clone(!0)[0]:t.cloneNode(!0)}function ao(t,e,n){var s={};return Array.from(t.children).forEach(function(a){var r,o,l,d;if(!(!xe(a,e.draggable,t,!1)||a.animated||a===n)){var p=Y(a);s.left=Math.min((r=s.left)!==null&&r!==void 0?r:1/0,p.left),s.top=Math.min((o=s.top)!==null&&o!==void 0?o:1/0,p.top),s.right=Math.max((l=s.right)!==null&&l!==void 0?l:-1/0,p.right),s.bottom=Math.max((d=s.bottom)!==null&&d!==void 0?d:-1/0,p.bottom)}}),s.width=s.right-s.left,s.height=s.bottom-s.top,s.x=s.left,s.y=s.top,s}var de="Sortable"+new Date().getTime();function Od(){var t=[],e;return{captureAnimationState:function(){if(t=[],!!this.options.animation){var s=[].slice.call(this.el.children);s.forEach(function(a){if(!(E(a,"display")==="none"||a===T.ghost)){t.push({target:a,rect:Y(a)});var r=Re({},t[t.length-1].rect);if(a.thisAnimationDuration){var o=Ot(a,!0);o&&(r.top-=o.f,r.left-=o.e)}a.fromRect=r}})}},addAnimationState:function(s){t.push(s)},removeAnimationState:function(s){t.splice(Dd(t,{target:s}),1)},animateAll:function(s){var a=this;if(!this.options.animation){clearTimeout(e),typeof s=="function"&&s();return}var r=!1,o=0;t.forEach(function(l){var d=0,p=l.target,m=p.fromRect,h=Y(p),y=p.prevFromRect,S=p.prevToRect,v=l.rect,C=Ot(p,!0);C&&(h.top-=C.f,h.left-=C.e),p.toRect=h,p.thisAnimationDuration&&Qs(y,h)&&!Qs(m,h)&&(v.top-h.top)/(v.left-h.left)===(m.top-h.top)/(m.left-h.left)&&(d=Rd(v,y,S,a.options)),Qs(h,m)||(p.prevFromRect=m,p.prevToRect=h,d||(d=a.options.animation),a.animate(p,v,h,d)),d&&(r=!0,o=Math.max(o,d),clearTimeout(p.animationResetTimer),p.animationResetTimer=setTimeout(function(){p.animationTime=0,p.prevFromRect=null,p.fromRect=null,p.prevToRect=null,p.thisAnimationDuration=null},d),p.thisAnimationDuration=d)}),clearTimeout(e),r?e=setTimeout(function(){typeof s=="function"&&s()},o):typeof s=="function"&&s(),t=[]},animate:function(s,a,r,o){if(o){E(s,"transition",""),E(s,"transform","");var l=Ot(this.el),d=l&&l.a,p=l&&l.d,m=(a.left-r.left)/(d||1),h=(a.top-r.top)/(p||1);s.animatingX=!!m,s.animatingY=!!h,E(s,"transform","translate3d("+m+"px,"+h+"px,0)"),this.forRepaintDummy=Ld(s),E(s,"transition","transform "+o+"ms"+(this.options.easing?" "+this.options.easing:"")),E(s,"transform","translate3d(0,0,0)"),typeof s.animated=="number"&&clearTimeout(s.animated),s.animated=setTimeout(function(){E(s,"transition",""),E(s,"transform",""),s.animated=!1,s.animatingX=!1,s.animatingY=!1},o)}}}}function Ld(t){return t.offsetWidth}function Rd(t,e,n,s){return Math.sqrt(Math.pow(e.top-t.top,2)+Math.pow(e.left-t.left,2))/Math.sqrt(Math.pow(e.top-n.top,2)+Math.pow(e.left-n.left,2))*s.animation}var kt=[],Js={initializeByDefault:!0},Dn={mount:function(e){for(var n in Js)Js.hasOwnProperty(n)&&!(n in e)&&(e[n]=Js[n]);kt.forEach(function(s){if(s.pluginName===e.pluginName)throw"Sortable: Cannot mount plugin ".concat(e.pluginName," more than once")}),kt.push(e)},pluginEvent:function(e,n,s){var a=this;this.eventCanceled=!1,s.cancel=function(){a.eventCanceled=!0};var r=e+"Global";kt.forEach(function(o){n[o.pluginName]&&(n[o.pluginName][r]&&n[o.pluginName][r](Re({sortable:n},s)),n.options[o.pluginName]&&n[o.pluginName][e]&&n[o.pluginName][e](Re({sortable:n},s)))})},initializePlugins:function(e,n,s,a){kt.forEach(function(l){var d=l.pluginName;if(!(!e.options[d]&&!l.initializeByDefault)){var p=new l(e,n,e.options);p.sortable=e,p.options=e.options,e[d]=p,Ke(s,p.defaults)}});for(var r in e.options)if(e.options.hasOwnProperty(r)){var o=this.modifyOption(e,r,e.options[r]);typeof o<"u"&&(e.options[r]=o)}},getEventProperties:function(e,n){var s={};return kt.forEach(function(a){typeof a.eventProperties=="function"&&Ke(s,a.eventProperties.call(n[a.pluginName],e))}),s},modifyOption:function(e,n,s){var a;return kt.forEach(function(r){e[r.pluginName]&&r.optionListeners&&typeof r.optionListeners[n]=="function"&&(a=r.optionListeners[n].call(e[r.pluginName],s))}),a}};function Nd(t){var e=t.sortable,n=t.rootEl,s=t.name,a=t.targetEl,r=t.cloneEl,o=t.toEl,l=t.fromEl,d=t.oldIndex,p=t.newIndex,m=t.oldDraggableIndex,h=t.newDraggableIndex,y=t.originalEvent,S=t.putSortable,v=t.extraEventProperties;if(e=e||n&&n[de],!!e){var C,q=e.options,F="on"+s.charAt(0).toUpperCase()+s.substr(1);window.CustomEvent&&!We&&!An?C=new CustomEvent(s,{bubbles:!0,cancelable:!0}):(C=document.createEvent("Event"),C.initEvent(s,!0,!0)),C.to=o||n,C.from=l||n,C.item=a||n,C.clone=r,C.oldIndex=d,C.newIndex=p,C.oldDraggableIndex=m,C.newDraggableIndex=h,C.originalEvent=y,C.pullMode=S?S.lastPutMode:void 0;var z=Re(Re({},v),Dn.getEventProperties(s,e));for(var he in z)C[he]=z[he];n&&n.dispatchEvent(C),q[F]&&q[F].call(e,C)}}var qd=["evt"],ce=function(e,n){var s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:{},a=s.evt,r=Cd(s,qd);Dn.pluginEvent.bind(T)(e,n,Re({dragEl:_,parentEl:V,ghostEl:A,rootEl:H,nextEl:pt,lastDownEl:es,cloneEl:K,cloneHidden:Je,dragStarted:on,putSortable:se,activeSortable:T.active,originalEvent:a,oldIndex:Et,oldDraggableIndex:mn,newIndex:ve,newDraggableIndex:Xe,hideGhostForTarget:lo,unhideGhostForTarget:co,cloneNowHidden:function(){Je=!0},cloneNowShown:function(){Je=!1},dispatchSortableEvent:function(l){oe({sortable:n,name:l,originalEvent:a})}},r))};function oe(t){Nd(Re({putSortable:se,cloneEl:K,targetEl:_,rootEl:H,oldIndex:Et,oldDraggableIndex:mn,newIndex:ve,newDraggableIndex:Xe},t))}var _,V,A,H,pt,es,K,Je,Et,ve,mn,Xe,Nn,se,Tt=!1,bs=!1,vs=[],lt,ke,Zs,ea,zi,Ki,on,St,bn,vn=!1,qn=!1,ts,re,ta=[],Pa=!1,gs=[],Is=typeof document<"u",Bn=si,ji=An||We?"cssFloat":"float",Bd=Is&&!Qr&&!si&&"draggable"in document.createElement("div"),io=(function(){if(Is){if(We)return!1;var t=document.createElement("x");return t.style.cssText="pointer-events:auto",t.style.pointerEvents==="auto"}})(),ro=function(e,n){var s=E(e),a=parseInt(s.width)-parseInt(s.paddingLeft)-parseInt(s.paddingRight)-parseInt(s.borderLeftWidth)-parseInt(s.borderRightWidth),r=Ht(e,0,n),o=Ht(e,1,n),l=r&&E(r),d=o&&E(o),p=l&&parseInt(l.marginLeft)+parseInt(l.marginRight)+Y(r).width,m=d&&parseInt(d.marginLeft)+parseInt(d.marginRight)+Y(o).width;if(s.display==="flex")return s.flexDirection==="column"||s.flexDirection==="column-reverse"?"vertical":"horizontal";if(s.display==="grid")return s.gridTemplateColumns.split(" ").length<=1?"vertical":"horizontal";if(r&&l.float&&l.float!=="none"){var h=l.float==="left"?"left":"right";return o&&(d.clear==="both"||d.clear===h)?"vertical":"horizontal"}return r&&(l.display==="block"||l.display==="flex"||l.display==="table"||l.display==="grid"||p>=a&&s[ji]==="none"||o&&s[ji]==="none"&&p+m>a)?"vertical":"horizontal"},Fd=function(e,n,s){var a=s?e.left:e.top,r=s?e.right:e.bottom,o=s?e.width:e.height,l=s?n.left:n.top,d=s?n.right:n.bottom,p=s?n.width:n.height;return a===l||r===d||a+o/2===l+p/2},Ud=function(e,n){var s;return vs.some(function(a){var r=a[de].options.emptyInsertThreshold;if(!(!r||ai(a))){var o=Y(a),l=e>=o.left-r&&e<=o.right+r,d=n>=o.top-r&&n<=o.bottom+r;if(l&&d)return s=a}}),s},oo=function(e){function n(r,o){return function(l,d,p,m){var h=l.options.group.name&&d.options.group.name&&l.options.group.name===d.options.group.name;if(r==null&&(o||h))return!0;if(r==null||r===!1)return!1;if(o&&r==="clone")return r;if(typeof r=="function")return n(r(l,d,p,m),o)(l,d,p,m);var y=(o?l:d).options.group.name;return r===!0||typeof r=="string"&&r===y||r.join&&r.indexOf(y)>-1}}var s={},a=e.group;(!a||Ma(a)!="object")&&(a={name:a}),s.name=a.name,s.checkPull=n(a.pull,!0),s.checkPut=n(a.put),s.revertClone=a.revertClone,e.group=s},lo=function(){!io&&A&&E(A,"display","none")},co=function(){!io&&A&&E(A,"display","")};Is&&!Qr&&document.addEventListener("click",function(t){if(bs)return t.preventDefault(),t.stopPropagation&&t.stopPropagation(),t.stopImmediatePropagation&&t.stopImmediatePropagation(),bs=!1,!1},!0);var ct=function(e){if(_){e=e.touches?e.touches[0]:e;var n=Ud(e.clientX,e.clientY);if(n){var s={};for(var a in e)e.hasOwnProperty(a)&&(s[a]=e[a]);s.target=s.rootEl=n,s.preventDefault=void 0,s.stopPropagation=void 0,n[de]._onDragOver(s)}}},Hd=function(e){_&&_.parentNode[de]._isOutsideThisEl(e.target)};function T(t,e){if(!(t&&t.nodeType&&t.nodeType===1))throw"Sortable: `el` must be an HTMLElement, not ".concat({}.toString.call(t));this.el=t,this.options=e=Ke({},e),t[de]=this;var n={group:null,sort:!0,disabled:!1,store:null,handle:null,draggable:/^[uo]l$/i.test(t.nodeName)?">li":">*",swapThreshold:1,invertSwap:!1,invertedSwapThreshold:null,removeCloneOnHide:!0,direction:function(){return ro(t,this.options)},ghostClass:"sortable-ghost",chosenClass:"sortable-chosen",dragClass:"sortable-drag",ignore:"a, img",filter:null,preventOnFilter:!0,animation:0,easing:null,setData:function(o,l){o.setData("Text",l.textContent)},dropBubble:!1,dragoverBubble:!1,dataIdAttr:"data-id",delay:0,delayOnTouchOnly:!1,touchStartThreshold:(Number.parseInt?Number:window).parseInt(window.devicePixelRatio,10)||1,forceFallback:!1,fallbackClass:"sortable-fallback",fallbackOnBody:!1,fallbackTolerance:0,fallbackOffset:{x:0,y:0},supportPointer:T.supportPointer!==!1&&"PointerEvent"in window&&(!fn||si),emptyInsertThreshold:5};Dn.initializePlugins(this,t,n);for(var s in n)!(s in e)&&(e[s]=n[s]);oo(e);for(var a in this)a.charAt(0)==="_"&&typeof this[a]=="function"&&(this[a]=this[a].bind(this));this.nativeDraggable=e.forceFallback?!1:Bd,this.nativeDraggable&&(this.options.touchStartThreshold=1),e.supportPointer?L(t,"pointerdown",this._onTapStart):(L(t,"mousedown",this._onTapStart),L(t,"touchstart",this._onTapStart)),this.nativeDraggable&&(L(t,"dragover",this),L(t,"dragenter",this)),vs.push(this.el),e.store&&e.store.get&&this.sort(e.store.get(this)||[]),Ke(this,Od())}T.prototype={constructor:T,_isOutsideThisEl:function(e){!this.el.contains(e)&&e!==this.el&&(St=null)},_getDirection:function(e,n){return typeof this.options.direction=="function"?this.options.direction.call(this,e,n,_):this.options.direction},_onTapStart:function(e){if(e.cancelable){var n=this,s=this.el,a=this.options,r=a.preventOnFilter,o=e.type,l=e.touches&&e.touches[0]||e.pointerType&&e.pointerType==="touch"&&e,d=(l||e).target,p=e.target.shadowRoot&&(e.path&&e.path[0]||e.composedPath&&e.composedPath()[0])||d,m=a.filter;if(Xd(s),!_&&!(/mousedown|pointerdown/.test(o)&&e.button!==0||a.disabled)&&!p.isContentEditable&&!(!this.nativeDraggable&&fn&&d&&d.tagName.toUpperCase()==="SELECT")&&(d=xe(d,a.draggable,s,!1),!(d&&d.animated)&&es!==d)){if(Et=ye(d),mn=ye(d,a.draggable),typeof m=="function"){if(m.call(this,e,d,this)){oe({sortable:n,rootEl:p,name:"filter",targetEl:d,toEl:s,fromEl:s}),ce("filter",n,{evt:e}),r&&e.preventDefault();return}}else if(m&&(m=m.split(",").some(function(h){if(h=xe(p,h.trim(),s,!1),h)return oe({sortable:n,rootEl:h,name:"filter",targetEl:d,fromEl:s,toEl:s}),ce("filter",n,{evt:e}),!0}),m)){r&&e.preventDefault();return}a.handle&&!xe(p,a.handle,s,!1)||this._prepareDragStart(e,l,d)}}},_prepareDragStart:function(e,n,s){var a=this,r=a.el,o=a.options,l=r.ownerDocument,d;if(s&&!_&&s.parentNode===r){var p=Y(s);if(H=r,_=s,V=_.parentNode,pt=_.nextSibling,es=s,Nn=o.group,T.dragged=_,lt={target:_,clientX:(n||e).clientX,clientY:(n||e).clientY},zi=lt.clientX-p.left,Ki=lt.clientY-p.top,this._lastX=(n||e).clientX,this._lastY=(n||e).clientY,_.style["will-change"]="all",d=function(){if(ce("delayEnded",a,{evt:e}),T.eventCanceled){a._onDrop();return}a._disableDelayedDragEvents(),!Bi&&a.nativeDraggable&&(_.draggable=!0),a._triggerDragStart(e,n),oe({sortable:a,name:"choose",originalEvent:e}),be(_,o.chosenClass,!0)},o.ignore.split(",").forEach(function(m){eo(_,m.trim(),na)}),L(l,"dragover",ct),L(l,"mousemove",ct),L(l,"touchmove",ct),o.supportPointer?(L(l,"pointerup",a._onDrop),!this.nativeDraggable&&L(l,"pointercancel",a._onDrop)):(L(l,"mouseup",a._onDrop),L(l,"touchend",a._onDrop),L(l,"touchcancel",a._onDrop)),Bi&&this.nativeDraggable&&(this.options.touchStartThreshold=4,_.draggable=!0),ce("delayStart",this,{evt:e}),o.delay&&(!o.delayOnTouchOnly||n)&&(!this.nativeDraggable||!(An||We))){if(T.eventCanceled){this._onDrop();return}o.supportPointer?(L(l,"pointerup",a._disableDelayedDrag),L(l,"pointercancel",a._disableDelayedDrag)):(L(l,"mouseup",a._disableDelayedDrag),L(l,"touchend",a._disableDelayedDrag),L(l,"touchcancel",a._disableDelayedDrag)),L(l,"mousemove",a._delayedDragTouchMoveHandler),L(l,"touchmove",a._delayedDragTouchMoveHandler),o.supportPointer&&L(l,"pointermove",a._delayedDragTouchMoveHandler),a._dragStartTimer=setTimeout(d,o.delay)}else d()}},_delayedDragTouchMoveHandler:function(e){var n=e.touches?e.touches[0]:e;Math.max(Math.abs(n.clientX-this._lastX),Math.abs(n.clientY-this._lastY))>=Math.floor(this.options.touchStartThreshold/(this.nativeDraggable&&window.devicePixelRatio||1))&&this._disableDelayedDrag()},_disableDelayedDrag:function(){_&&na(_),clearTimeout(this._dragStartTimer),this._disableDelayedDragEvents()},_disableDelayedDragEvents:function(){var e=this.el.ownerDocument;P(e,"mouseup",this._disableDelayedDrag),P(e,"touchend",this._disableDelayedDrag),P(e,"touchcancel",this._disableDelayedDrag),P(e,"pointerup",this._disableDelayedDrag),P(e,"pointercancel",this._disableDelayedDrag),P(e,"mousemove",this._delayedDragTouchMoveHandler),P(e,"touchmove",this._delayedDragTouchMoveHandler),P(e,"pointermove",this._delayedDragTouchMoveHandler)},_triggerDragStart:function(e,n){n=n||e.pointerType=="touch"&&e,!this.nativeDraggable||n?this.options.supportPointer?L(document,"pointermove",this._onTouchMove):n?L(document,"touchmove",this._onTouchMove):L(document,"mousemove",this._onTouchMove):(L(_,"dragend",this),L(H,"dragstart",this._onDragStart));try{document.selection?ns(function(){document.selection.empty()}):window.getSelection().removeAllRanges()}catch{}},_dragStarted:function(e,n){if(Tt=!1,H&&_){ce("dragStarted",this,{evt:n}),this.nativeDraggable&&L(document,"dragover",Hd);var s=this.options;!e&&be(_,s.dragClass,!1),be(_,s.ghostClass,!0),T.active=this,e&&this._appendGhost(),oe({sortable:this,name:"start",originalEvent:n})}else this._nulling()},_emulateDragOver:function(){if(ke){this._lastX=ke.clientX,this._lastY=ke.clientY,lo();for(var e=document.elementFromPoint(ke.clientX,ke.clientY),n=e;e&&e.shadowRoot&&(e=e.shadowRoot.elementFromPoint(ke.clientX,ke.clientY),e!==n);)n=e;if(_.parentNode[de]._isOutsideThisEl(e),n)do{if(n[de]){var s=void 0;if(s=n[de]._onDragOver({clientX:ke.clientX,clientY:ke.clientY,target:e,rootEl:n}),s&&!this.options.dragoverBubble)break}e=n}while(n=Zr(n));co()}},_onTouchMove:function(e){if(lt){var n=this.options,s=n.fallbackTolerance,a=n.fallbackOffset,r=e.touches?e.touches[0]:e,o=A&&Ot(A,!0),l=A&&o&&o.a,d=A&&o&&o.d,p=Bn&&re&&Hi(re),m=(r.clientX-lt.clientX+a.x)/(l||1)+(p?p[0]-ta[0]:0)/(l||1),h=(r.clientY-lt.clientY+a.y)/(d||1)+(p?p[1]-ta[1]:0)/(d||1);if(!T.active&&!Tt){if(s&&Math.max(Math.abs(r.clientX-this._lastX),Math.abs(r.clientY-this._lastY))<s)return;this._onDragStart(e,!0)}if(A){o?(o.e+=m-(Zs||0),o.f+=h-(ea||0)):o={a:1,b:0,c:0,d:1,e:m,f:h};var y="matrix(".concat(o.a,",").concat(o.b,",").concat(o.c,",").concat(o.d,",").concat(o.e,",").concat(o.f,")");E(A,"webkitTransform",y),E(A,"mozTransform",y),E(A,"msTransform",y),E(A,"transform",y),Zs=m,ea=h,ke=r}e.cancelable&&e.preventDefault()}},_appendGhost:function(){if(!A){var e=this.options.fallbackOnBody?document.body:H,n=Y(_,!0,Bn,!0,e),s=this.options;if(Bn){for(re=e;E(re,"position")==="static"&&E(re,"transform")==="none"&&re!==document;)re=re.parentNode;re!==document.body&&re!==document.documentElement?(re===document&&(re=Oe()),n.top+=re.scrollTop,n.left+=re.scrollLeft):re=Oe(),ta=Hi(re)}A=_.cloneNode(!0),be(A,s.ghostClass,!1),be(A,s.fallbackClass,!0),be(A,s.dragClass,!0),E(A,"transition",""),E(A,"transform",""),E(A,"box-sizing","border-box"),E(A,"margin",0),E(A,"top",n.top),E(A,"left",n.left),E(A,"width",n.width),E(A,"height",n.height),E(A,"opacity","0.8"),E(A,"position",Bn?"absolute":"fixed"),E(A,"zIndex","100000"),E(A,"pointerEvents","none"),T.ghost=A,e.appendChild(A),E(A,"transform-origin",zi/parseInt(A.style.width)*100+"% "+Ki/parseInt(A.style.height)*100+"%")}},_onDragStart:function(e,n){var s=this,a=e.dataTransfer,r=s.options;if(ce("dragStart",this,{evt:e}),T.eventCanceled){this._onDrop();return}ce("setupClone",this),T.eventCanceled||(K=so(_),K.removeAttribute("id"),K.draggable=!1,K.style["will-change"]="",this._hideClone(),be(K,this.options.chosenClass,!1),T.clone=K),s.cloneId=ns(function(){ce("clone",s),!T.eventCanceled&&(s.options.removeCloneOnHide||H.insertBefore(K,_),s._hideClone(),oe({sortable:s,name:"clone"}))}),!n&&be(_,r.dragClass,!0),n?(bs=!0,s._loopId=setInterval(s._emulateDragOver,50)):(P(document,"mouseup",s._onDrop),P(document,"touchend",s._onDrop),P(document,"touchcancel",s._onDrop),a&&(a.effectAllowed="move",r.setData&&r.setData.call(s,a,_)),L(document,"drop",s),E(_,"transform","translateZ(0)")),Tt=!0,s._dragStartId=ns(s._dragStarted.bind(s,n,e)),L(document,"selectstart",s),on=!0,window.getSelection().removeAllRanges(),fn&&E(document.body,"user-select","none")},_onDragOver:function(e){var n=this.el,s=e.target,a,r,o,l=this.options,d=l.group,p=T.active,m=Nn===d,h=l.sort,y=se||p,S,v=this,C=!1;if(Pa)return;function q(Zt,rl){ce(Zt,v,Re({evt:e,isOwner:m,axis:S?"vertical":"horizontal",revert:o,dragRect:a,targetRect:r,canSort:h,fromSortable:y,target:s,completed:z,onMove:function($i,ol){return Fn(H,n,_,a,$i,Y($i),e,ol)},changed:he},rl))}function F(){q("dragOverAnimationCapture"),v.captureAnimationState(),v!==y&&y.captureAnimationState()}function z(Zt){return q("dragOverCompleted",{insertion:Zt}),Zt&&(m?p._hideClone():p._showClone(v),v!==y&&(be(_,se?se.options.ghostClass:p.options.ghostClass,!1),be(_,l.ghostClass,!0)),se!==v&&v!==T.active?se=v:v===T.active&&se&&(se=null),y===v&&(v._ignoreWhileAnimating=s),v.animateAll(function(){q("dragOverAnimationComplete"),v._ignoreWhileAnimating=null}),v!==y&&(y.animateAll(),y._ignoreWhileAnimating=null)),(s===_&&!_.animated||s===n&&!s.animated)&&(St=null),!l.dragoverBubble&&!e.rootEl&&s!==document&&(_.parentNode[de]._isOutsideThisEl(e.target),!Zt&&ct(e)),!l.dragoverBubble&&e.stopPropagation&&e.stopPropagation(),C=!0}function he(){ve=ye(_),Xe=ye(_,l.draggable),oe({sortable:v,name:"change",toEl:n,newIndex:ve,newDraggableIndex:Xe,originalEvent:e})}if(e.preventDefault!==void 0&&e.cancelable&&e.preventDefault(),s=xe(s,l.draggable,n,!0),q("dragOver"),T.eventCanceled)return C;if(_.contains(e.target)||s.animated&&s.animatingX&&s.animatingY||v._ignoreWhileAnimating===s)return z(!1);if(bs=!1,p&&!l.disabled&&(m?h||(o=V!==H):se===this||(this.lastPutMode=Nn.checkPull(this,p,_,e))&&d.checkPut(this,p,_,e))){if(S=this._getDirection(e,s)==="vertical",a=Y(_),q("dragOverValid"),T.eventCanceled)return C;if(o)return V=H,F(),this._hideClone(),q("revert"),T.eventCanceled||(pt?H.insertBefore(_,pt):H.appendChild(_)),z(!0);var te=ai(n,l.draggable);if(!te||Vd(e,S,this)&&!te.animated){if(te===_)return z(!1);if(te&&n===e.target&&(s=te),s&&(r=Y(s)),Fn(H,n,_,a,s,r,e,!!s)!==!1)return F(),te&&te.nextSibling?n.insertBefore(_,te.nextSibling):n.appendChild(_),V=n,he(),z(!0)}else if(te&&jd(e,S,this)){var _e=Ht(n,0,l,!0);if(_e===_)return z(!1);if(s=_e,r=Y(s),Fn(H,n,_,a,s,r,e,!1)!==!1)return F(),n.insertBefore(_,_e),V=n,he(),z(!0)}else if(s.parentNode===n){r=Y(s);var Ae=0,it,Yt=_.parentNode!==n,me=!Fd(_.animated&&_.toRect||a,s.animated&&s.toRect||r,S),Xt=S?"top":"left",Ge=Ui(s,"top","top")||Ui(_,"top","top"),Qt=Ge?Ge.scrollTop:void 0;St!==s&&(it=r[Xt],vn=!1,qn=!me&&l.invertSwap||Yt),Ae=Wd(e,s,r,S,me?1:l.swapThreshold,l.invertedSwapThreshold==null?l.swapThreshold:l.invertedSwapThreshold,qn,St===s);var Ne;if(Ae!==0){var rt=ye(_);do rt-=Ae,Ne=V.children[rt];while(Ne&&(E(Ne,"display")==="none"||Ne===A))}if(Ae===0||Ne===s)return z(!1);St=s,bn=Ae;var Jt=s.nextElementSibling,Ye=!1;Ye=Ae===1;var Ln=Fn(H,n,_,a,s,r,e,Ye);if(Ln!==!1)return(Ln===1||Ln===-1)&&(Ye=Ln===1),Pa=!0,setTimeout(Kd,30),F(),Ye&&!Jt?n.appendChild(_):s.parentNode.insertBefore(_,Ye?Jt:s),Ge&&no(Ge,0,Qt-Ge.scrollTop),V=_.parentNode,it!==void 0&&!qn&&(ts=Math.abs(it-Y(s)[Xt])),he(),z(!0)}if(n.contains(_))return z(!1)}return!1},_ignoreWhileAnimating:null,_offMoveEvents:function(){P(document,"mousemove",this._onTouchMove),P(document,"touchmove",this._onTouchMove),P(document,"pointermove",this._onTouchMove),P(document,"dragover",ct),P(document,"mousemove",ct),P(document,"touchmove",ct)},_offUpEvents:function(){var e=this.el.ownerDocument;P(e,"mouseup",this._onDrop),P(e,"touchend",this._onDrop),P(e,"pointerup",this._onDrop),P(e,"pointercancel",this._onDrop),P(e,"touchcancel",this._onDrop),P(document,"selectstart",this)},_onDrop:function(e){var n=this.el,s=this.options;if(ve=ye(_),Xe=ye(_,s.draggable),ce("drop",this,{evt:e}),V=_&&_.parentNode,ve=ye(_),Xe=ye(_,s.draggable),T.eventCanceled){this._nulling();return}Tt=!1,qn=!1,vn=!1,clearInterval(this._loopId),clearTimeout(this._dragStartTimer),Oa(this.cloneId),Oa(this._dragStartId),this.nativeDraggable&&(P(document,"drop",this),P(n,"dragstart",this._onDragStart)),this._offMoveEvents(),this._offUpEvents(),fn&&E(document.body,"user-select",""),E(_,"transform",""),e&&(on&&(e.cancelable&&e.preventDefault(),!s.dropBubble&&e.stopPropagation()),A&&A.parentNode&&A.parentNode.removeChild(A),(H===V||se&&se.lastPutMode!=="clone")&&K&&K.parentNode&&K.parentNode.removeChild(K),_&&(this.nativeDraggable&&P(_,"dragend",this),na(_),_.style["will-change"]="",on&&!Tt&&be(_,se?se.options.ghostClass:this.options.ghostClass,!1),be(_,this.options.chosenClass,!1),oe({sortable:this,name:"unchoose",toEl:V,newIndex:null,newDraggableIndex:null,originalEvent:e}),H!==V?(ve>=0&&(oe({rootEl:V,name:"add",toEl:V,fromEl:H,originalEvent:e}),oe({sortable:this,name:"remove",toEl:V,originalEvent:e}),oe({rootEl:V,name:"sort",toEl:V,fromEl:H,originalEvent:e}),oe({sortable:this,name:"sort",toEl:V,originalEvent:e})),se&&se.save()):ve!==Et&&ve>=0&&(oe({sortable:this,name:"update",toEl:V,originalEvent:e}),oe({sortable:this,name:"sort",toEl:V,originalEvent:e})),T.active&&((ve==null||ve===-1)&&(ve=Et,Xe=mn),oe({sortable:this,name:"end",toEl:V,originalEvent:e}),this.save()))),this._nulling()},_nulling:function(){ce("nulling",this),H=_=V=A=pt=K=es=Je=lt=ke=on=ve=Xe=Et=mn=St=bn=se=Nn=T.dragged=T.ghost=T.clone=T.active=null;var e=this.el;gs.forEach(function(n){e.contains(n)&&(n.checked=!0)}),gs.length=Zs=ea=0},handleEvent:function(e){switch(e.type){case"drop":case"dragend":this._onDrop(e);break;case"dragenter":case"dragover":_&&(this._onDragOver(e),zd(e));break;case"selectstart":e.preventDefault();break}},toArray:function(){for(var e=[],n,s=this.el.children,a=0,r=s.length,o=this.options;a<r;a++)n=s[a],xe(n,o.draggable,this.el,!1)&&e.push(n.getAttribute(o.dataIdAttr)||Yd(n));return e},sort:function(e,n){var s={},a=this.el;this.toArray().forEach(function(r,o){var l=a.children[o];xe(l,this.options.draggable,a,!1)&&(s[r]=l)},this),n&&this.captureAnimationState(),e.forEach(function(r){s[r]&&(a.removeChild(s[r]),a.appendChild(s[r]))}),n&&this.animateAll()},save:function(){var e=this.options.store;e&&e.set&&e.set(this)},closest:function(e,n){return xe(e,n||this.options.draggable,this.el,!1)},option:function(e,n){var s=this.options;if(n===void 0)return s[e];var a=Dn.modifyOption(this,e,n);typeof a<"u"?s[e]=a:s[e]=n,e==="group"&&oo(s)},destroy:function(){ce("destroy",this);var e=this.el;e[de]=null,P(e,"mousedown",this._onTapStart),P(e,"touchstart",this._onTapStart),P(e,"pointerdown",this._onTapStart),this.nativeDraggable&&(P(e,"dragover",this),P(e,"dragenter",this)),Array.prototype.forEach.call(e.querySelectorAll("[draggable]"),function(n){n.removeAttribute("draggable")}),this._onDrop(),this._disableDelayedDragEvents(),vs.splice(vs.indexOf(this.el),1),this.el=e=null},_hideClone:function(){if(!Je){if(ce("hideClone",this),T.eventCanceled)return;E(K,"display","none"),this.options.removeCloneOnHide&&K.parentNode&&K.parentNode.removeChild(K),Je=!0}},_showClone:function(e){if(e.lastPutMode!=="clone"){this._hideClone();return}if(Je){if(ce("showClone",this),T.eventCanceled)return;_.parentNode==H&&!this.options.group.revertClone?H.insertBefore(K,_):pt?H.insertBefore(K,pt):H.appendChild(K),this.options.group.revertClone&&this.animate(_,K),E(K,"display",""),Je=!1}}};function zd(t){t.dataTransfer&&(t.dataTransfer.dropEffect="move"),t.cancelable&&t.preventDefault()}function Fn(t,e,n,s,a,r,o,l){var d,p=t[de],m=p.options.onMove,h;return window.CustomEvent&&!We&&!An?d=new CustomEvent("move",{bubbles:!0,cancelable:!0}):(d=document.createEvent("Event"),d.initEvent("move",!0,!0)),d.to=e,d.from=t,d.dragged=n,d.draggedRect=s,d.related=a||e,d.relatedRect=r||Y(e),d.willInsertAfter=l,d.originalEvent=o,t.dispatchEvent(d),m&&(h=m.call(p,d,o)),h}function na(t){t.draggable=!1}function Kd(){Pa=!1}function jd(t,e,n){var s=Y(Ht(n.el,0,n.options,!0)),a=ao(n.el,n.options,A),r=10;return e?t.clientX<a.left-r||t.clientY<s.top&&t.clientX<s.right:t.clientY<a.top-r||t.clientY<s.bottom&&t.clientX<s.left}function Vd(t,e,n){var s=Y(ai(n.el,n.options.draggable)),a=ao(n.el,n.options,A),r=10;return e?t.clientX>a.right+r||t.clientY>s.bottom&&t.clientX>s.left:t.clientY>a.bottom+r||t.clientX>s.right&&t.clientY>s.top}function Wd(t,e,n,s,a,r,o,l){var d=s?t.clientY:t.clientX,p=s?n.height:n.width,m=s?n.top:n.left,h=s?n.bottom:n.right,y=!1;if(!o){if(l&&ts<p*a){if(!vn&&(bn===1?d>m+p*r/2:d<h-p*r/2)&&(vn=!0),vn)y=!0;else if(bn===1?d<m+ts:d>h-ts)return-bn}else if(d>m+p*(1-a)/2&&d<h-p*(1-a)/2)return Gd(e)}return y=y||o,y&&(d<m+p*r/2||d>h-p*r/2)?d>m+p/2?1:-1:0}function Gd(t){return ye(_)<ye(t)?1:-1}function Yd(t){for(var e=t.tagName+t.className+t.src+t.href+t.textContent,n=e.length,s=0;n--;)s+=e.charCodeAt(n);return s.toString(36)}function Xd(t){gs.length=0;for(var e=t.getElementsByTagName("input"),n=e.length;n--;){var s=e[n];s.checked&&gs.push(s)}}function ns(t){return setTimeout(t,0)}function Oa(t){return clearTimeout(t)}Is&&L(document,"touchmove",function(t){(T.active||Tt)&&t.cancelable&&t.preventDefault()});T.utils={on:L,off:P,css:E,find:eo,is:function(e,n){return!!xe(e,n,e,!1)},extend:Md,throttle:to,closest:xe,toggleClass:be,clone:so,index:ye,nextTick:ns,cancelNextTick:Oa,detectDirection:ro,getChild:Ht,expando:de};T.get=function(t){return t[de]};T.mount=function(){for(var t=arguments.length,e=new Array(t),n=0;n<t;n++)e[n]=arguments[n];e[0].constructor===Array&&(e=e[0]),e.forEach(function(s){if(!s.prototype||!s.prototype.constructor)throw"Sortable: Mounted plugin must be a constructor function, not ".concat({}.toString.call(s));s.utils&&(T.utils=Re(Re({},T.utils),s.utils)),Dn.mount(s)})};T.create=function(t,e){return new T(t,e)};T.version=Ad;var W=[],ln,La,Ra=!1,sa,aa,_s,cn;function Qd(){function t(){this.defaults={scroll:!0,forceAutoScrollFallback:!1,scrollSensitivity:30,scrollSpeed:10,bubbleScroll:!0};for(var e in this)e.charAt(0)==="_"&&typeof this[e]=="function"&&(this[e]=this[e].bind(this))}return t.prototype={dragStarted:function(n){var s=n.originalEvent;this.sortable.nativeDraggable?L(document,"dragover",this._handleAutoScroll):this.options.supportPointer?L(document,"pointermove",this._handleFallbackAutoScroll):s.touches?L(document,"touchmove",this._handleFallbackAutoScroll):L(document,"mousemove",this._handleFallbackAutoScroll)},dragOverCompleted:function(n){var s=n.originalEvent;!this.options.dragOverBubble&&!s.rootEl&&this._handleAutoScroll(s)},drop:function(){this.sortable.nativeDraggable?P(document,"dragover",this._handleAutoScroll):(P(document,"pointermove",this._handleFallbackAutoScroll),P(document,"touchmove",this._handleFallbackAutoScroll),P(document,"mousemove",this._handleFallbackAutoScroll)),Vi(),ss(),Pd()},nulling:function(){_s=La=ln=Ra=cn=sa=aa=null,W.length=0},_handleFallbackAutoScroll:function(n){this._handleAutoScroll(n,!0)},_handleAutoScroll:function(n,s){var a=this,r=(n.touches?n.touches[0]:n).clientX,o=(n.touches?n.touches[0]:n).clientY,l=document.elementFromPoint(r,o);if(_s=n,s||this.options.forceAutoScrollFallback||An||We||fn){ia(n,this.options,l,s);var d=et(l,!0);Ra&&(!cn||r!==sa||o!==aa)&&(cn&&Vi(),cn=setInterval(function(){var p=et(document.elementFromPoint(r,o),!0);p!==d&&(d=p,ss()),ia(n,a.options,p,s)},10),sa=r,aa=o)}else{if(!this.options.bubbleScroll||et(l,!0)===Oe()){ss();return}ia(n,this.options,et(l,!1),!1)}}},Ke(t,{pluginName:"scroll",initializeByDefault:!0})}function ss(){W.forEach(function(t){clearInterval(t.pid)}),W=[]}function Vi(){clearInterval(cn)}var ia=to(function(t,e,n,s){if(e.scroll){var a=(t.touches?t.touches[0]:t).clientX,r=(t.touches?t.touches[0]:t).clientY,o=e.scrollSensitivity,l=e.scrollSpeed,d=Oe(),p=!1,m;La!==n&&(La=n,ss(),ln=e.scroll,m=e.scrollFn,ln===!0&&(ln=et(n,!0)));var h=0,y=ln;do{var S=y,v=Y(S),C=v.top,q=v.bottom,F=v.left,z=v.right,he=v.width,te=v.height,_e=void 0,Ae=void 0,it=S.scrollWidth,Yt=S.scrollHeight,me=E(S),Xt=S.scrollLeft,Ge=S.scrollTop;S===d?(_e=he<it&&(me.overflowX==="auto"||me.overflowX==="scroll"||me.overflowX==="visible"),Ae=te<Yt&&(me.overflowY==="auto"||me.overflowY==="scroll"||me.overflowY==="visible")):(_e=he<it&&(me.overflowX==="auto"||me.overflowX==="scroll"),Ae=te<Yt&&(me.overflowY==="auto"||me.overflowY==="scroll"));var Qt=_e&&(Math.abs(z-a)<=o&&Xt+he<it)-(Math.abs(F-a)<=o&&!!Xt),Ne=Ae&&(Math.abs(q-r)<=o&&Ge+te<Yt)-(Math.abs(C-r)<=o&&!!Ge);if(!W[h])for(var rt=0;rt<=h;rt++)W[rt]||(W[rt]={});(W[h].vx!=Qt||W[h].vy!=Ne||W[h].el!==S)&&(W[h].el=S,W[h].vx=Qt,W[h].vy=Ne,clearInterval(W[h].pid),(Qt!=0||Ne!=0)&&(p=!0,W[h].pid=setInterval(function(){s&&this.layer===0&&T.active._onTouchMove(_s);var Jt=W[this.layer].vy?W[this.layer].vy*l:0,Ye=W[this.layer].vx?W[this.layer].vx*l:0;typeof m=="function"&&m.call(T.dragged.parentNode[de],Ye,Jt,t,_s,W[this.layer].el)!=="continue"||no(W[this.layer].el,Ye,Jt)}.bind({layer:h}),24))),h++}while(e.bubbleScroll&&y!==d&&(y=et(y,!1)));Ra=p}},30),uo=function(e){var n=e.originalEvent,s=e.putSortable,a=e.dragEl,r=e.activeSortable,o=e.dispatchSortableEvent,l=e.hideGhostForTarget,d=e.unhideGhostForTarget;if(n){var p=s||r;l();var m=n.changedTouches&&n.changedTouches.length?n.changedTouches[0]:n,h=document.elementFromPoint(m.clientX,m.clientY);d(),p&&!p.el.contains(h)&&(o("spill"),this.onSpill({dragEl:a,putSortable:s}))}};function ii(){}ii.prototype={startIndex:null,dragStart:function(e){var n=e.oldDraggableIndex;this.startIndex=n},onSpill:function(e){var n=e.dragEl,s=e.putSortable;this.sortable.captureAnimationState(),s&&s.captureAnimationState();var a=Ht(this.sortable.el,this.startIndex,this.options);a?this.sortable.el.insertBefore(n,a):this.sortable.el.appendChild(n),this.sortable.animateAll(),s&&s.animateAll()},drop:uo};Ke(ii,{pluginName:"revertOnSpill"});function ri(){}ri.prototype={onSpill:function(e){var n=e.dragEl,s=e.putSortable,a=s||this.sortable;a.captureAnimationState(),n.parentNode&&n.parentNode.removeChild(n),a.animateAll()},drop:uo};Ke(ri,{pluginName:"removeOnSpill"});T.mount(new Qd);T.mount(ri,ii);class Jd extends fe{static properties={playlistId:{type:String}};constructor(){super(),this.playlistId="",this._query=""}deps(){return[i.playlistVersion,i.songs,this.playlistId,this._query]}get already(){const e=i.playlists.find(n=>n.id===this.playlistId);return new Set(e?.songIds||[])}get filtered(){const e=this._query.trim().toLowerCase();return e?i.songs.filter(n=>`${n.title} ${n.artist} ${n.album}`.toLowerCase().includes(e)):i.songs}render(){const e=this.already,n=this.filtered,s=i.songs.filter(a=>!e.has(a.id)).length;return c`
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
          ${this._query.trim()?`匹配 ${I(n.length)} 首`:`共 ${I(i.songs.length)} 首 · 其中 ${I(s)} 首尚未加入`}
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
        ${n.length?Te(n,a=>a.id,a=>{const r=e.has(a.id);return c`
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
    `}setAll(e){for(const n of this.querySelectorAll("[data-song-check]:not(:disabled)"))n.checked=e}}ee("mp-add-songs",Jd);function po(t){j({title:"新建歌单",desc:"歌单名称可以随时修改。",body:c`<input class="input" data-field="name" type="text" placeholder="例如：深夜循环" maxlength="40" />`,okText:"创建",onOk:async e=>{const n=String(e.name||"").trim();if(!n)return"请输入歌单名称";if(i.playlists.some(a=>a.name===n))return"已存在同名歌单";const s=await ml(n);return s?(t?.(s),u(`已创建歌单「${n}」`,{tone:"success"}),!0):"新建歌单失败，请查看提示"}})}function Zd(t,e){const n=He(t);!n||n.locked||j({title:"重命名歌单",body:c`<input class="input" data-field="name" type="text" .value=${n.name} maxlength="40" />`,okText:"保存",onOk:s=>{const a=String(s.name||"").trim();return a?(vl(t,a),!0):"名称不能为空"}})}function eu(t,e){const n=He(t);!n||n.locked||j({title:`删除歌单「${n.name}」？`,desc:"只会删除歌单本身，本地音乐文件不会被删除。",okText:"删除",danger:!0,onOk:()=>(bl(t),e?.(),u("歌单已删除"),!0)})}function ys(t,e){const n=He(t);if(!n)return;const s=hl(t,e);s?u(`已添加 ${s} 首到「${n.name}」`,{tone:"success"}):u("所选歌曲已在该歌单中")}function tu(t){const e=He(t);if(!e)return;if(!i.songs.length){u("本地曲库还是空的，先扫描音乐文件夹吧",{tone:"warning"});return}const n=new Set(e.songIds);j({title:`添加歌曲到「${e.name}」`,desc:"勾选要加入的歌曲；已经在歌单里的会保持选中。",body:c`<mp-add-songs .playlistId=${t}></mp-add-songs>`,okText:"加入歌单",onOk:(s,a)=>{const o=[...a.querySelectorAll("[data-song-check]:checked")].map(l=>l.dataset.songCheck).filter(l=>!n.has(l));return o.length?(ys(t,o),!0):"没有选中新的歌曲"}})}function Wi(t,e){const n=He(t);if(!n)return;const s=[{id:"play",label:"播放这个歌单",icon:"play"},{id:"queue",label:"加入播放列表",icon:"queue"},{id:"sep1",kind:"sep"}];n.locked||(s.push({id:"rename",label:"重命名",icon:"edit"}),s.push({id:"delete",label:"删除歌单",icon:"trash",danger:!0}));const a=e.getBoundingClientRect();Bt({x:a.left,y:a.bottom+6,align:"right",items:s,onPick:async r=>{switch(r){case"play":nu(n);break;case"queue":{(await _t(()=>import("./base-DgPK_ilM.js").then(l=>l.b2),__vite__mapDeps([0,1]))).appendToQueue(n.songIds),u(`已把 ${I(n.songIds.length)} 首加入播放列表`,{tone:"success"});break}case"rename":Zd(n.id);break;case"delete":eu(n.id,()=>Mt("library"));break}}})}function nu(t){_t(async()=>{const{playContext:e}=await import("./base-DgPK_ilM.js").then(n=>n.b2);return{playContext:e}},__vite__mapDeps([0,1])).then(({playContext:e})=>{e(t.songIds.slice(),0,{type:"playlist",id:t.id})})}let Gi=0;class su extends fe{static deps=e=>[e.view,e.playlistId,e.playlistVersion,e.songs.length,e.queue.length];firstUpdated(){this.bindDrag()}bindDrag(){const e=this.querySelector("#playlist-nav");!e||this._sortable||(this._sortable=T.create(e,{draggable:".navitem",filter:'[data-locked="true"]',animation:0,ghostClass:"is-dragging",onEnd:n=>this.onDragEnd(n)}))}onDragEnd(e){Gi=Date.now();const n=e.oldIndex,s=e.newIndex;if(n==null||s==null||n===s)return;const a=e.from,r=Array.from(a.children).filter(o=>o!==e.item);a.insertBefore(e.item,r[n]??null),gl(n-1,s-1),u("已调整歌单顺序",{duration:1400})}onSidebarClick(e){if(Date.now()-Gi<260)return;const n=e.target.closest('[data-act="pl-more"]');if(n){e.stopPropagation(),Wi(n.dataset.id,n);return}const s=e.target.closest("[data-nav]");if(!s)return;const a=s.dataset.nav;a==="playlist"?Mt("playlist",s.dataset.playlist):Mt(a)}render(){const e=i.playlists.filter(a=>a.id!==Gn),s=[He(Gn),...e].filter(Boolean);return c`
      <aside
        class="sidebar"
        id="sidebar"
        @click=${a=>this.onSidebarClick(a)}
        @contextmenu=${a=>{const r=a.target.closest('[data-nav="playlist"]');r&&(a.preventDefault(),Wi(r.dataset.playlist,r))}}
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
                <span class="navitem__badge" id="badge-library">${I(i.songs.length)}</span>
              </span>
            </button>
            <button class="navitem" type="button" data-nav="queue" aria-selected=${String(i.view==="queue")}>
              ${f("queue","navitem__icon")}
              <span class="navitem__text">播放列表</span>
              <span class="navitem__tail">
                <span class="navitem__badge" id="badge-queue">${I(i.queue.length)}</span>
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
                @click=${()=>po(a=>a&&Mt("playlist",a.id))}
              >
                ${f("plus")}
              </button>
            </div>
            <div id="playlist-nav">
              ${Te(s,a=>a.id,a=>this.playlistItem(a))}
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
        ${f(e.id===Gn?"heart":"playlist","navitem__icon")}
        <span class="navitem__text">${e.name}</span>
        <span class="navitem__tail">
          <span class="navitem__badge">${I(e.songIds.length)}</span>
          <span class="navitem__more" data-act="pl-more" data-id=${e.id} role="button" aria-label="${e.name}操作"
            >${f("more")}</span
          >
        </span>
      </button>
    `}}ee("mp-sidebar",su);const au=Za(class extends ei{constructor(){super(...arguments),this.key=x}render(t,e){return this.key=t,e}update(t,[e,n]){return e!==this.key&&(Hr(t),this.key=e),n}}),oi=[{id:"auto",label:"自动识别（按接口地址与模型名判断）",hint:"识别不出时按 OpenAI 兼容接口处理"},{id:"openai",label:"OpenAI（GPT-5 系列 / o 系列）",hint:"o 系列无法完全关闭思考，只能降到最低档"},{id:"deepseek",label:"DeepSeek（deepseek-chat / reasoner）",hint:"思考模式下 temperature 会被忽略"},{id:"anthropic",label:"Anthropic Claude",hint:"开启思考时 temperature 必须为 1，程序会自动去掉它"},{id:"gemini",label:"Google Gemini",hint:"Pro 系列无法关闭思考"},{id:"qwen",label:"阿里通义千问 Qwen",hint:"仅「混合思考」模型可关闭；部分开源模型只支持流式"},{id:"glm",label:"智谱 GLM",hint:"GLM-5.3 系列传 disabled 会报错"},{id:"kimi",label:"月之暗面 Kimi",hint:"kimi-k3 / k2.7-code 始终思考，传 thinking 会报错"},{id:"minimax",label:"MiniMax",hint:"官方未提供关闭思考的参数，只能保持默认"},{id:"xai",label:"xAI Grok",hint:"reasoning_effort=none 可真正关闭"},{id:"openrouter",label:"OpenRouter（统一网关）",hint:"统一 reasoning 字段；标记 mandatory 的模型不接受关闭"},{id:"siliconflow",label:"SiliconFlow（硅基流动）",hint:"R1 类纯推理模型无法关闭"},{id:"ollama",label:"Ollama（本地，OpenAI 兼容）",hint:"本地兼容层用 reasoning_effort；GPT-OSS 无法完全关闭"}];function iu(t){return oi.find(e=>e.id===t)?.label||t||"自动识别"}function fo(t){return oi.find(e=>e.id===t)?.hint||""}let ie=!1,Yi=!1,ra="",$e=null,je=null,Ze=0,yt=null,Lt=null,X=null,zt=-1,ws=0,oa=null,bt=!1;const la=[];let tt=null,gn=0;const Xi=5;let le=null,as=!1,Me=null,Pe=null,Qi=null,Qe=null,It=null,st=null;const Rt="idle",Nt="loading";let Ce=Rt,ft=null,ht=!1,ca=0,Na=0;const Ji=1500,ru=12e3;async function ou(){if(Yi)return ie;if(Yi=!0,!$())return!1;try{const t=await b.playerAvailable();ie=t?.available===!0,ra=t?.reason||"",ie||console.warn("[audio] 后端音频不可用，回退到 <audio> 播放：",ra||"未知原因")}catch(t){ie=!1,ra=t?.message||String(t),console.warn("[audio] 探测后端音频失败，回退到 <audio> 播放",t)}return ie}wl(()=>{if(ie&&i.currentId)return!0;const t=document.getElementById("audio-engine");return!!(t&&t.src)});$l(t=>fu(t));function lu(){$()&&(la.push(U("player:state",t=>{t&&ho(t)})),la.push(U("player:error",t=>{t&&As(t.songId||i.currentId,t.reason,"backend")})),la.push(U("player:ended",()=>{bo()})),oa&&clearInterval(oa),oa=setInterval(cu,250))}function ho(t){if(bt)return;const e=Number(t.durationMs)||0,n=Number(t.positionMs)||0;X={positionMs:n,atMs:Number(t.atMs)||0,durationMs:e,playing:t.playing===!0,at:performance.now()},yt=X.playing;let s=!1;e>0&&i.duration!==e&&(i.duration=e,s=!0),i.playing!==X.playing&&(i.playing=X.playing,s=!0),mo(n,!0),s?k():Be()}function cu(){if(!X||!ie||!i.currentId||bt)return;let t=X.positionMs;X.playing&&(t=X.positionMs+(performance.now()-X.at)),X.durationMs>0&&(t=Math.min(t,X.durationMs)),mo(t,!1)}function mo(t,e){if(!Number.isFinite(t)||t<0)return;const n=Math.round(t);!e&&Math.round(n/250)===Math.round(zt/250)||(zt=n,i.position=n,Pr(n),i.config.resumeProgress===!0&&performance.now()-ws>5e3&&(ws=performance.now(),Or()),Be())}function bo(){if(i.sleepTimer?.type==="after-song"){Ft(!0);return}if(i.playMode==="loop-one"){_u(0);return}Ft(!0)}async function li(){if(ie)try{await b.playerSetPlaybackOptions(i.config.skipSilenceHead===!0,i.config.skipSilenceTail===!0,Number(i.config.trackGapSeconds)||0)}catch(t){console.warn("[audio] 同步跳过静音/切歌间隔失败",t)}}async function vo(){if(!ie)return;const t=i.config.effectPreset||"off";try{const e=await b.playerSetEffect(t);e&&typeof e.preset=="string"&&e.preset!==t&&(console.warn(`[audio] 音效档位 ${t} 非法，后端收敛为 ${e.preset}`),i.config.effectPreset=e.preset,k?.())}catch(e){console.warn("[audio] 同步音效档位失败",e)}}let du=null;function As(t,e,n="unknown"){const s=t?Ve(t)||ze():ze(),a=s?.id||t||null,r=s?.title||a||"当前歌曲",o=String(e||"").trim()||"未知原因";if(a&&a===tt){console.warn(`[audio] 忽略重复的播放失败报告（${n}）：${r}`);return}a&&(tt=a),console.warn(`[audio] 播放失败（${n}）：${r} —— ${o}`),pu(s,o),je===a&&(je=null),$e===a&&($e=null),X=null,yt=null,gn+=1;const l=gn>=Xi,d=!l&&i.playing&&i.sleepTimer?.type!=="after-song"&&i.playMode!=="loop-one";if(l){i.playing=!1,k(),tt=null,gn=0,u(`连续 ${Xi} 首都无法播放（${o}），已停止自动跳过`,{tone:"error",duration:8e3});return}if(u(`无法播放：${r}（${o}）${d?"，已跳到下一首":""}`,{tone:"error",duration:5e3}),!d){i.playing&&(i.playing=!1,k());return}Ft(!0)}function uu(){gn=0,tt=null}function pu(t,e){if(!(!$()||!t?.id)&&!t.online)try{b.unplayableReport(t.id,String(e||""),t.path||"").then(()=>{yl(t.id)}).catch(n=>{console.warn("[audio] 登记「放不出来」失败（不影响播放）",n)})}catch(n){console.warn("[audio] 登记「放不出来」失败（不影响播放）",n)}}function fu(t){(!t||t===tt)&&(tt=null,gn=0)}async function hu(){if(!$())return;if(!ie){await xu();return}const t=ze();if(!t){$e!==null&&await mu();return}if($e!==t.id){if(t.id===tt)return;await bu(t);return}gu()}async function mu(){Ze++,bt=!1,$e=null,je=null,yt=null,X=null,zt=-1;try{await b.playerUnload()}catch{}}async function bu(t){$e=t.id;const e=++Ze;X=null,zt=-1,bt=!0;try{await b.playerCancelGap()}catch{}if(e===Ze){st=null,await $s(null);try{const n=await b.playerLoad(t.id);if(e!==Ze||n?.superseded)return;uu(),je=t.id,n?.durationMs>0&&(i.duration=n.durationMs),du={headMs:Number(n?.skippedHeadMs)||0,tailMs:Number(n?.skippedTailMs)||0};const s=yo(t);s>0&&await b.playerSeek(s),await $s(t.id),await ci(),st=_o(),ui(t.id),i.playing&&await b.playerPlay(),yt=!!i.playing;const a=await b.playerState();if(e!==Ze)return;bt=!1,a&&ho(a)}catch(n){if(e!==Ze)return;$e=null,je=null,bt=!1,As(t.id,n?.message??"装载失败","load")}}}function vu(){return bt}async function gu(){const t=!!i.playing;if(yt!==t)try{t?await b.playerPlay():await b.playerPause(),yt=t}catch(e){console.warn("[audio] 同步播放状态失败",e)}}async function _u(t){if(!ie)return;const e=Math.max(0,t);X&&(X={...X,positionMs:e,at:performance.now()}),zt=-1;try{await b.playerSeek(e),await b.playerPlay(),yt=!0}catch(n){console.warn("[audio] 重新起播失败",n)}}function go(){const e=10**(di(i.currentId)/20);return(i.muted?0:i.volume)*e}function _o(){const e=10**(di(je)/20);return(i.muted?0:i.volume)*e}function qa(){if(!ie){Ms();return}ci()}async function ci(){try{await b.playerSetVolume(i.volume??1,i.muted===!0)}catch(t){console.warn("[audio] 同步音量失败",t)}}function di(t){if((i.config.loudnessMode||"off")==="off"||!t)return 0;const n=i.loudnessGains?.[t];return Number.isFinite(n)?n:0}async function $s(t){const e=di(t);try{await b.playerSetLoudness(e)}catch(n){console.warn("[audio] 同步响度补偿失败",n)}}function Kt(){if(!ie){Tu();return}const t=_o();t!==st&&(st=t,ci(),$s(je))}function Ee(t){_l(t),yu(t)}function yu(t){if(!$())return;const e=Math.max(0,Math.min(t,i.duration||0));if(X&&(X={...X,positionMs:e,at:performance.now()}),zt=e,!ie){Eu(t);return}b.playerSeek(e).catch(n=>{console.warn("[audio] 跳转失败",n)})}function wu(){if(!ie){const t=Iu(xc);return t?{bands:t,at:performance.now()}:null}return Sc()}const Un=new Map;async function ui(t){const e=i.config.loudnessMode||"off";if(e==="off"||!$()||!t)return;if(i.loudnessGains?.[t]!==void 0){ie&&je===t&&$s(t);return}if(Un.has(t))return Un.get(t);const n=(async()=>{try{const s=i.config.loudnessTarget??-16,a=await b.loudnessLookup(t,s);if(a?.measured){Zi(t,a.gainDB);return}if(e==="album")return;const r=await b.loudnessMeasure(t,s);r?.measured&&Zi(t,r.gainDB??$u(r,s))}catch(s){console.warn("[audio] 响度补偿获取失败",s)}finally{Un.delete(t)}})();return Un.set(t,n),n}function $u(t,e){if(!t?.integrated)return 0;let n=e-t.integrated;if(t.truePeak){const s=-1-t.truePeak;n>s&&(n=s)}return n>24&&(n=24),n<-24&&(n=-24),Math.round(n*100)/100}function Zi(t,e){i.loudnessGains||(i.loudnessGains={}),i.loudnessGains[t]=e,t===je&&(ie?Kt():Ms()),Be()}async function ku(){const t=i.config.loudnessTarget??-16;if(i.loudnessGains={},Kt(),Be(),!!$())try{await b.loudnessInvalidateTarget(t)}catch(e){console.warn("[loudness] 失效旧补偿失败",e)}}async function Ds(){if(!$())return;const t=i.config.loudnessMode||"off";if(t==="off"){i.loudnessGains={},Kt();return}const e=i.config.loudnessTarget??-16;try{const n=t==="album"?await b.loudnessAlbumGains(e):await b.loudnessGainMap(e);i.loudnessGains=n||{},Kt(),Be(),t==="track"&&i.currentId&&ui(i.currentId)}catch(n){console.warn("[loudness] 拉取补偿增益失败",n)}}async function _n(){if(!$())return null;try{const t=await b.loudnessState();return t&&(i.loudnessState=t),t}catch{return null}}function yo(t){const e=Number(i.pendingResumeMs)||0;if(i.pendingResumeMs=0,!e||i.config.resumeProgress!==!0)return 0;const n=t?.duration||i.duration||0;return n&&e>=n-3e3?0:e}function wo(){return le||(le=document.getElementById("audio-engine"),le||(le=document.createElement("audio"),le.id="audio-engine",le.preload="auto",le.hidden=!0,document.body.appendChild(le)),le.crossOrigin="anonymous",Su(le),le)}function Su(t){t.dataset.bound!=="1"&&(t.dataset.bound="1",t.addEventListener("loadedmetadata",()=>{if(Number.isFinite(t.duration)&&t.duration>0&&(i.duration=t.duration*1e3,Be(),k()),Lt!=null){const e=Lt;Lt=null;try{t.currentTime=Math.max(0,Math.min(e,i.duration||0)/1e3)}catch{}}$o(t)}),t.addEventListener("timeupdate",()=>{document.getElementById("progress")?.dataset.dragging!=="true"&&(i.position=t.currentTime*1e3,Pr(i.position),i.config.resumeProgress===!0&&performance.now()-ws>5e3&&(ws=performance.now(),Or()),Be())}),t.addEventListener("play",()=>{Ce!==Nt&&(ht=!1,i.playing=!0,Me?.state==="suspended"&&Me.resume().catch(()=>{}),Be())}),t.addEventListener("pause",()=>{if(ht){ht=!1;return}if(Ce===Nt||t.ended)return;const e=Number.isFinite(t.duration)&&t.duration>0?t.duration*1e3:i.duration||0;e&&(Number.isFinite(t.currentTime)?t.currentTime*1e3:i.position)>=e-300||ca&&performance.now()-ca<Ji||(i.playing=!1,Be())}),t.addEventListener("ended",()=>{ca=performance.now(),bo()}),t.addEventListener("error",()=>{Ce=Rt,ht=!1;const e=ze();if(!e||Na&&performance.now()-Na<Ji||!t.error||!t.error.code)return;const n=t.error?.code,s=n===4?"格式无法播放（解码失败）":n===3?"音频数据损坏":n===2?"网络中断":"音频加载失败";As(e.id,s,"legacy")}))}async function xu(){const t=wo(),e=ze();if(!e){$e!==null&&(t.pause(),t.removeAttribute("src"),t.load(),$e=null,Ce=Rt);return}if($e!==e.id){if(e.id===tt)return;$e=e.id,Ce=Nt,ht=!1,ft&&clearTimeout(ft),ft=setTimeout(()=>{ft=null,Ce===Nt&&$o(le)},ru);const n=++Ze;let s=null;try{s=e.streamUrl||await b.mediaUrl(e.id)}catch(a){Ce=Rt,$e=null,As(e.id,a?.message??"取播放地址失败","legacy-url");return}if(n!==Ze)return;if(!s){Ce=Rt;return}Lt=yo(e),t.src=s,Na=performance.now(),t.load(),Cu(t),Ms(),ui(e.id),i.playing&&t.paused&&t.play().catch(a=>{const r=a?.name||"";r==="AbortError"||r==="NotAllowedError"||console.warn("[audio] 播放失败",a)});return}Ce!==Nt&&(i.playing&&t.paused?t.play().catch(()=>{}):!i.playing&&!t.paused&&(ht=!0,t.pause()))}function $o(t){if(ft&&(clearTimeout(ft),ft=null),Ce!==Nt)return;Ce=Rt;const e=t||le;e&&(i.playing&&e.paused?e.play().catch(()=>{}):!i.playing&&!e.paused&&(ht=!0,e.pause()))}function Cu(t){if(as)return!1;if(Me&&Pe)return!0;const e=window.AudioContext||window.webkitAudioContext;if(!e)return as=!0,!1;try{Me=new e,Pe=Me.createGain(),Pe.gain.value=1,Qi=Me.createMediaElementSource(t),Qi.connect(Pe),Pe.connect(Me.destination);try{Qe=Me.createAnalyser(),Qe.fftSize=512,Qe.smoothingTimeConstant=.76,It=new Uint8Array(Qe.frequencyBinCount),Pe.connect(Qe)}catch{Qe=null,It=null}return st=null,!0}catch(n){return console.warn("[audio] Web Audio 链路建立失败，退回元素音量",n),as=!0,!1}}function Ms(){const t=le,e=go();if(Me&&Pe&&!as){const n=Me.currentTime;try{Pe.gain.cancelScheduledValues(n),Pe.gain.setTargetAtTime(e,n,.015)}catch{Pe.gain.value=e}t&&(t.volume=1),st=e;return}t&&(t.volume=Math.max(0,Math.min(1,e))),st=e}function Tu(){go()!==st&&Ms()}function Eu(t){const e=wo();if(!e.src){Lt=t;return}const n=Math.max(0,Math.min(t,i.duration||0))/1e3;try{e.currentTime=n}catch{Lt=t}}function Iu(t=32){if(!Qe||!It)return null;Qe.getByteFrequencyData(It);const e=Math.max(1,Math.min(128,Math.floor(t)||32)),n=new Float32Array(e),s=It.length;for(let a=0;a<e;a+=1){const r=Math.floor(s*(a/e)**1.7),o=Math.min(s,Math.max(r+1,Math.floor(s*((a+1)/e)**1.7)));let l=0;for(let d=r;d<o;d+=1)l+=It[d];n[a]=l/((o-r)*255)}return n}const Au={itunes:"iTunes",netease:"网易云音乐",qq:"QQ 音乐",deezer:"Deezer",musicbrainz:"MusicBrainz",lrclib:"LRCLIB",kugou:"酷狗音乐",kuwo:"酷我音乐",migu:"咪咕音乐"},Du=["itunes","netease","qq","deezer","musicbrainz"];function Ba(t){const e=String(t||"").trim().toLowerCase();return Au[e]||String(t||"")}function pi(t,e=""){const n=Array.isArray(t)?t.filter(Boolean):[];return n.length?n.map(s=>Ba(s)).join(" / "):e}function ko(){return pi(Du)}const Mu="../bindings/localmusicplayer/index.js";let Hn=null;async function da(){if(Hn)return Hn;try{const t=await import(Mu);Hn=t&&t.OnlineService?t.OnlineService:null}catch(t){console.info("[online] backend unavailable",t)}return Hn}const Pu=new Set(["m4a","mp4","m4b","alac","aac","flac"]);let G="online";function ua(t,e){const n=String(t?.note||"").trim()||e;u(n,{tone:"success",duration:Math.min(6500,1800+n.length*55)})}const g={songId:"",title:"",lines:[],cursor:0,undo:[],dirty:!1,kept:0,stale:!1};class Ou extends fe{static deps=e=>[e.lyricsOpen,e.currentId,e.playing,G,So,i.config.embedMeta];constructor(){super(),this._nowIndex=-1,this._onlineError="",this._searched=!1,this._candidates=[],this._searching=!1,this._onlineKeyword="",this._lastNowPaint=0,this._lastNudgeActive=-1,this._lastScrolledNow=-1,this._lastScrolledCursor=-1,this._followHold=0,this._followAutoUntil=0,this._lastOnlineHint="在线歌词来源",this._formats=new Map,this._searchSeq=0,this._appliedKey="",this._appliedTimer=null}onConnected(){this._onKeyDownCapture=e=>this.onPanelKeyDown(e),document.addEventListener("keydown",this._onKeyDownCapture,!0),this._unsubscribers.push(Cs(()=>{this.open&&(G==="nudge"?this.paintNudgeFollow():G==="edit"&&this.paintEditorFollow())}))}onDisconnected(){document.removeEventListener("keydown",this._onKeyDownCapture,!0),clearTimeout(this._appliedTimer)}get open(){return i.lyricsOpen===!0}get panelEl(){return this.querySelector("#lyrics-panel")}updated(){const e=this.panelEl;e&&(e.hidden=!this.open,e.dataset.open=this.open?"true":"false",this.open&&(G==="nudge"&&this.paintNudgeFollow(),G==="edit"&&this.paintEditorFollow()))}_refreshHeader(){N()}render(){const e=we(),n=e.song,s=e.lines.some(a=>Array.isArray(a.words)&&a.words.length>0);return c`
      <section
        class="lyricspanel"
        id="lyrics-panel"
        role="dialog"
        aria-label="歌词工作台"
        data-open=${this.open?"true":"false"}
        data-tab=${G}
        hidden
        @click=${a=>this.onClick(a)}
        @input=${a=>this.onInput(a)}
      >
        <header class="lyricspanel__head">
          <img class="lyricspanel__cover" data-song-cover alt="" src=${n?wt(n):x} />
          <div class="lyricspanel__meta">
            <div class="lyricspanel__title" data-song-title>${n?n.title||"未命名":"未在播放"}</div>
            <div class="lyricspanel__sub">
              <span
                class="lyricspanel__badge${e.text?"":" is-empty"}"
                data-song-source
                data-src=${e.source}
              >
                ${e.status==="matching"||e.status==="loading"?"歌词匹配中…":e.status==="failed"?"歌词匹配失败":`${rr(e.source)}${s?" · 逐字":""}`}
              </span>
              <span class="lyricspanel__artist" data-song-artist>${n&&n.artist||""}</span>
            </div>
          </div>
          <button
            class="lyricspanel__close u-hit"
            type="button"
            data-act="close"
            aria-label="关闭"
            @click=${()=>Fa()}
          >
            ${f("close")}
          </button>
        </header>

        <nav class="lyricspanel__tabs" role="tablist">
          ${["online","nudge","edit"].map(a=>c`
              <button
                class="lyricspanel__tab${G===a?" is-active":""}"
                type="button"
                role="tab"
                data-tab=${a}
                aria-selected=${String(G===a)}
                @click=${()=>nn(a)}
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
    `}noticeTemplate(e){const n=G==="nudge"||G==="edit",s=e.source==="embedded"||e.source==="lrc-file";if(!n||!s)return x;const a=rr(e.source),r=Ru(e.song),o=Pu.has(r);return c`
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
      <section class="lyricspanel__pane" data-pane="online" ?hidden=${G!=="online"}>
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
            <button class="btn btn--sm" type="button" @click=${()=>nn("edit")}>手动编辑歌词</button>
          </div>
        </div>
      `;if(this._candidates.length)return Te(this._candidates,(e,n)=>`${e.provider||""}-${e.id||n}`,(e,n)=>{const s=!!this._appliedKey&&this._appliedKey===zn(e);return c`
            <div class="candidate ${s?"candidate--applied":""}" data-applied=${s?"1":x}>
              <div class="candidate__main">
                <div class="candidate__title">${(e.title||"未命名")+" - "+(e.artist||"未知")}</div>
                <div class="candidate__sub">
                  ${this.formatChip(e)}
                  ${(e.provider||"")+" · score "+(e.score||0)+" · "+At(e.duration)}
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
          `});if(this._searched){const e=sn()?.title||"",n=!!e&&e!==this._onlineKeyword;return c`
        <div class="lyricspanel__state" data-online-state="empty">
          ${f("lyrics")}
          <div class="lyricspanel__state-title">没有找到候选歌词</div>
          <div class="lyricspanel__state-desc">换个更短的关键词通常更有效（只留歌名、去掉括号里的后缀）。</div>
          <div class="lyricspanel__state-actions">
            ${n?c`<button class="btn btn--sm" type="button" @click=${()=>this.retryWithTitle()}>
                    只用歌名重搜
                  </button>`:x}
            <button class="btn btn--sm" type="button" @click=${()=>nn("edit")}>手动编辑歌词</button>
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
    `}async retryWithTitle(){const e=sn()?.title?.trim();e&&(this._onlineKeyword=e,N(),await this.searchLyrics())}nudgePane(e){const n=e.songId?qt(e.songId):0,s=n<0?e.lines.filter(r=>r.time+n<0).length:0,a=fi();return c`
      <section class="lyricspanel__pane lyricspanel__pane--nudge" data-pane="nudge" ?hidden=${G!=="nudge"}>
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
                  @click=${()=>pa(r)}
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
            @click=${()=>pa(500)}
          >
            歌词快了 ${f("arrow-right")} 延后 0.5s
          </button>
          <button
            class="btn btn--sm nudge__feel"
            type="button"
            data-act="nudge-feel"
            data-delta="-500"
            data-tip="歌词出现得太晚：整体往前挪 0.5 秒"
            @click=${()=>pa(-500)}
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
            @input=${r=>nr(Number(r.target.value))}
          />
        </div>
        <div class="lyricspanel__list nudge__preview" data-nudge-preview @scroll=${()=>this.onFollowScroll()}>
          ${this.nudgePreview(e,n)}
        </div>
        <div class="lyricspanel__foot">
          <button class="btn btn--sm" type="button" data-act="nudge-reset" @click=${()=>Nu()}>重置</button>
          <button
            class="btn btn--sm"
            type="button"
            data-act="nudge-guide"
            data-tip="微调介绍与使用指引"
            @click=${()=>qu()}
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
            <button class="btn btn--sm" type="button" @click=${()=>nn("online")}>去在线匹配</button>
            <button class="btn btn--sm" type="button" @click=${()=>nn("edit")}>去手动编辑</button>
          </div>
        </div>
      `;const s=e.lines,a=tr(s,n);return Te(s,(r,o)=>o,(r,o)=>{const l=Math.max(0,r.time+n);return c`
          <div
            class="nudge__line${o===a?" is-active":""}"
            data-act="nudge-seek"
            data-ms=${l}
            data-index=${o}
          >
            <span class="nudge__time">${Yn(l).slice(1,-1)}</span>
            <span class="nudge__text">${Xn(r)}</span>
          </div>
        `})}paintNudgeFollow(){if(G!=="nudge")return;const e=this.querySelector("[data-nudge-preview]");if(!e)return;const n=we();if(!n.lines.length)return;const s=this._nudgeBox!==e;this._nudgeBox=e;const a=n.songId?qt(n.songId):0,r=tr(n.lines,a);if(!s&&r===this._lastNudgeActive)return;this._lastNudgeActive=r;const o=e.querySelectorAll(".nudge__line");if(!o.length)return;let l=null;o.forEach(d=>{const p=Number(d.dataset.index)===r;d.classList.toggle("is-active",p),p&&(l=d)}),l&&this.followScroll(e,l,s)}editPane(){const e=g.lines.filter(o=>typeof o.time=="number").length,n=To(),s=g.lines.length-e,a=n?`草稿属于《${Ve(g.songId)?.title||"上一首"}》`:s>0&&e>0?`还有 ${s} 行没有时间`:"",r=n?"已切歌，草稿仍属于上一首":g.kept>0?`已沿用 ${g.kept} 行原有时间`:g.dirty?"未保存":"";return c`
      <section class="lyricspanel__pane" data-pane="edit" ?hidden=${G!=="edit"}>
        <div class="editor__source">
          <button
            class="btn btn--sm"
            type="button"
            data-act="editor-text-open"
            data-tip="粘贴 / 修改歌词文本"
            @click=${()=>zu()}
          >
            ${f("edit")}编辑歌词文本
          </button>
          <span class="lyricspanel__hint" data-editor-source>
            ${g.lines.length?`共 ${g.lines.length} 行`:"还没有歌词文本"}
          </span>
          <span class="editor__spacer"></span>
          <button class="btn btn--sm" type="button" data-act="editor-clear-times" @click=${()=>Hu()}>
            清空全部时间
          </button>
        </div>

        <div class="editor__transport">
          <button
            class="btn btn--icon"
            type="button"
            data-act="editor-play"
            data-tip="播放 / 暂停"
            @click=${()=>Vu()}
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
          <span class="editor__clock" data-editor-clock>${Yn(i.position).slice(1,-1)}</span>
          <span class="editor__spacer"></span>
          <span class="lyricspanel__hint" data-editor-progress>已打轴 ${e} / ${g.lines.length}</span>
        </div>

        <button class="editor__tap" type="button" data-act="editor-tap" @click=${()=>fa()}>
          <span class="editor__tap-main">打轴并下一行</span>
          <span class="editor__tap-hint"><kbd>空格</kbd> 或点这里</span>
        </button>

        <div class="editor__tools">
          <button class="btn btn--sm" type="button" data-act="editor-undo" @click=${()=>Bu()}>撤销</button>
          <button class="btn btn--sm" type="button" data-act="editor-prev" @click=${()=>sr(-1)}>
            上一行
          </button>
          <button class="btn btn--sm" type="button" data-act="editor-next" @click=${()=>sr(1)}>
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
    `}draftList(){return g.lines.length?Te(g.lines,(e,n)=>n,(e,n)=>{const s=typeof e.time=="number",a=["drow"];return n===g.cursor&&a.push("is-cursor"),s||a.push("is-untimed"),n===this._nowIndex&&a.push("is-now"),c`
          <div class=${a.join(" ")} data-act="editor-cursor" data-i=${n}>
            <span class="drow__no">${n+1}</span>
            <button
              class="drow__time"
              type="button"
              data-act="edit-seek"
              data-i=${n}
              data-tip="跳到这一句"
              @click=${r=>{r.stopPropagation(),Ku(n)}}
            >
              ${s?Yn(e.time).slice(1,-1):"未打轴"}
            </button>
            <span class="drow__text">${e.text}</span>
            <button
              class="drow__clear"
              type="button"
              data-act="edit-clear"
              data-i=${n}
              aria-label="清除这一行的时间"
              ?hidden=${!s}
              @click=${r=>{r.stopPropagation(),Uu(n)}}
            >
              ${f("close")}
            </button>
          </div>
        `}):c`<div class="editor__empty">
        还没有歌词文本。点上面的「编辑歌词文本」粘贴一份，或载入这首歌已有的歌词。
      </div>`}onClick(e){const n=e.target.closest("[data-act], [data-tab]");if(!n||!this.contains(n))return;const s=n.dataset.act,a=Number(n.dataset.i);switch(s){case"close":Fa();return;case"nudge-seek":Ee(Number(n.dataset.ms));return;case"editor-cursor":Fu(a);return;case"editor-tap":fa();return}}onInput(e){const n=e.target;n.matches('[data-act="nudge-range"]')&&nr(Number(n.value))}onPanelKeyDown(e){if(!this.open||G!=="edit"||e.key!==" "||e.ctrlKey||e.metaKey||e.altKey)return;const n=e.target;n&&(n.tagName==="TEXTAREA"||n.tagName==="INPUT")||this.contains(n)&&(e.preventDefault(),e.stopPropagation(),fa())}onFollowScroll(){Date.now()<this._followAutoUntil||(this._followHold=Date.now()+4e3)}followScroll(e,n,s=!1){if(!e||!n||!s&&Date.now()<this._followHold)return;const a=e.getBoundingClientRect(),r=n.getBoundingClientRect(),o=Math.max(0,e.scrollTop+(r.top-a.top)-(e.clientHeight-r.height)/2);Math.abs(e.scrollTop-o)<2||(this._followAutoUntil=Date.now()+700,e.scrollTo({top:o,behavior:"smooth"}))}prefillOnlineKeyword(){const e=sn();if(!e)return;const n=[e.title,e.artist].filter(Boolean).join(" ").trim();!n||n===this._onlineKeyword||(this._onlineKeyword=n,N())}async refreshOnlineHint(){const e=await da();if(e)try{const n=await e.LyricsProviders?.(),s=Array.isArray(n?.providers)?n.providers:[];s.length&&(this._lastOnlineHint="在线歌词来源："+pi(s),N())}catch{}}formatChip(e){const n=this._formats.get(zn(e));return n==="word"?c`<span class="candidate__format candidate__format--word" title="带逐字时间轴，播放时按字点亮"
        >逐字</span
      >`:n==="line"?c`<span class="candidate__format" title="只有整行时间轴">逐行</span>`:n==="fail"?c`<span class="candidate__format candidate__format--pending" title="这条取不到歌词内容">未知</span>`:c`<span class="candidate__format candidate__format--pending">检测中…</span>`}async probeFormats(e,n){if(!e?.ProbeLyricsFormat||!this._candidates.length)return;const s=[...this._candidates].sort((a,r)=>+(a?.provider==="netease")-+(r?.provider==="netease"));for(const a of s){if(n!==this._searchSeq)return;const r=zn(a);if(!(!r||this._formats.has(r))){try{const o=await e.ProbeLyricsFormat(a.provider,a.id);this._formats.set(r,o?.format==="word"?"word":"line")}catch{this._formats.set(r,"fail")}N()}}}async searchLyrics(){const e=(this._onlineKeyword||"").trim();if(!e){u("请输入歌词搜索关键词",{duration:1500});return}const n=await da();if(!n){this._candidates=[],this._formats=new Map,this._onlineError="在线歌词服务不可用（需要应用后端）",this._searched=!0,N();return}const s=sn();this._searching=!0,this._onlineError="",N();try{const a=await n.SearchLyrics(e,s?s.title:"",s?s.artist:"",s?s.duration:0);this._candidates=Array.isArray(a)?a:[],this._formats=new Map,this._searchSeq+=1}catch(a){this._candidates=[],this._formats=new Map,this._onlineError=String(a?.message||a)}finally{this._searching=!1,this._searched=!0,N()}this.probeFormats(n,this._searchSeq)}async applyCandidate(e){const n=this._candidates[e];if(!n)return;const s=sn();if(!s){u("请先播放一首歌曲",{tone:"warning"});return}const a=await da();if(!a){u("在线歌词服务暂不可用，请稍后再试",{tone:"error"});return}try{const r=await a.FetchLyrics(n.provider,n.id);if(!r||!r.lrc){u("没有取到歌词",{tone:"warning"});return}const o=await ba(s.id,r.lrc,r.source||"online",{embed:i.config.embedMeta===!0});vt(s.id,0),g.songId="",ua(o,"歌词已应用并保存"),this.markApplied(zn(n)),N()}catch(r){u("获取歌词失败："+(r.message||r),{tone:"error"})}}markApplied(e){e&&(this._appliedKey=e,N(),clearTimeout(this._appliedTimer),this._appliedTimer=setTimeout(()=>{this._appliedKey===e&&(this._appliedKey="",N())},2600))}async applyNudge(){const e=we();if(!e.songId){u("请先播放一首歌曲",{tone:"warning"});return}const n=qt(e.songId);if(!n){u("当前没有需要应用的调整",{duration:1800});return}if(!e.text){u("这首歌还没有歌词",{tone:"warning"});return}const s=Cc(e.text,n),a=await ba(e.songId,s,"edit:offset",{embed:er(e,this)});a!==!1&&(vt(e.songId,0),N(),ua(a,"已应用并保存"))}async ensureDraft(e=!1){const n=we();!e&&g.songId===n.songId&&g.lines.length||(g.songId=n.songId,g.title=n.song?.title||"",g.lines=n.text?Ei(n.text):[],g.cursor=0,g.undo=[],g.dirty=!1,g.kept=0,g.stale=!1,this._nowIndex=-1,this._lastScrolledNow=-1,this._lastScrolledCursor=-1,this._followHold=0,this._followAutoUntil=0,N())}applyDraftText(e){const n=Ei(e||""),s=Tc(g.lines,n);if(!s.length)return u("文本是空的，没有可应用的歌词",{duration:1800}),!1;const a=s.filter((r,o)=>typeof r.time=="number"&&!(n[o]&&typeof n[o].time=="number")).length;return Ps(),g.lines=s,g.cursor>=s.length&&(g.cursor=Math.max(0,s.length-1)),g.dirty=!0,g.kept=a,g.songId||(g.songId=we().songId),this._nowIndex=-1,this._lastScrolledNow=-1,this._lastScrolledCursor=-1,N(),u(a?`已应用文本，沿用了 ${a} 行原有时间`:"已应用文本",{duration:2e3}),!0}setDraftText(e){const n=document.querySelector("#modal-backdrop [data-editor-text]");n&&(n.value=e),N()}async saveDraft(){const e=we(g.songId);if(!e.songId){u("还没有可保存的内容：先播放一首歌再编辑",{tone:"warning"});return}const n=g.lines.filter(d=>typeof d.time=="number"&&Number.isFinite(d.time));if(!n.length){u("至少要先给一行打上时间",{tone:"warning"});return}const s=g.lines.length-n.length;let a=!1,r=-1/0;for(const d of g.lines)if(typeof d.time=="number"){if(d.time<r){a=!0;break}r=d.time}if(s||a){const d=c`
        ${s?c`<div class="lyricspanel__hint">
                还有 <b>${s}</b> 行没有时间：LRC 里没有时间标签的行会被忽略，保存后这些行不会显示。
              </div>`:x}
        ${a?c`<div class="lyricspanel__hint">时间不是升序，播放时高亮可能会跳来跳去。</div>`:x}
      `;if(!await Wu({title:s?"还有歌词没有打轴":"时间不是升序",body:d,okText:"继续保存",cancelText:"返回编辑"}))return}const o=Ii(g.lines),l=await ba(e.songId,o,"manual",{embed:er(e,this)});l!==!1&&(vt(e.songId,0),g.undo=[],g.dirty=!1,g.songId=e.songId,N(),ua(l,"歌词已保存"))}async copyLrc(){const e=Ii(g.lines);if(!e){u("还没有可复制的歌词",{duration:1800});return}try{await navigator.clipboard.writeText(e),u("LRC 已复制到剪贴板",{tone:"success"})}catch{const n=document.createElement("textarea");n.value=e,n.style.cssText="position:fixed;left:-9999px;top:0;",document.body.appendChild(n),n.select();let s=!1;try{s=document.execCommand("copy")}catch{s=!1}n.remove(),u(s?"LRC 已复制到剪贴板":"复制失败，请手动选中文本",{tone:s?"success":"warning"})}}paintNowRow(){const e=performance.now();if(e-this._lastNowPaint<200)return;this._lastNowPaint=e;let n=-1;for(let s=0;s<g.lines.length;s+=1){const a=g.lines[s].time;typeof a=="number"&&a<=i.position&&(n=s)}n!==this._nowIndex&&(this._nowIndex=n,N())}paintEditorFollow(){this.paintNowRow(),this.scrollDraftRows()}scrollDraftRows(){const e=this.querySelector("[data-editor-list]");if(e){if(g.cursor!==this._lastScrolledCursor){const n=e.querySelector(`[data-i="${g.cursor}"]`);n&&(this._lastScrolledCursor=g.cursor,this.followScroll(e,n,!0))}if(this._nowIndex!==this._lastScrolledNow){const n=e.querySelector(`[data-i="${this._nowIndex}"]`);n&&this._nowIndex>=0&&(this._lastScrolledNow=this._nowIndex,this.followScroll(e,n))}}}}ee("mp-lyrics-panel",Ou);let So=0;function N(){So+=1,ge()}const at=()=>document.querySelector("mp-lyrics-panel");function zn(t){return!t||!t.provider||!t.id?"":`${t.provider}:${t.id}`}function Lu(t){i.lyricsOpen=!0,N();const e=at();e&&(e._refreshHeader(),e.prefillOnlineKeyword(),za().then(()=>{G==="edit"&&e.ensureDraft(!0),G==="online"&&e.refreshOnlineHint(),N()}))}function Fa(){i.lyricsOpen=!1;const t=we();t.songId&&qt(t.songId)&&(vt(t.songId,0),u("未应用的微调已丢弃",{duration:1800})),N()}function xo(t){i.lyricsOpen?Fa():Lu()}function nn(t){G=t==="nudge"||t==="edit"?t:"online";const e=at();e&&(G==="edit"&&e.ensureDraft().then(()=>N()),G==="online"&&e.refreshOnlineHint?.()),N()}function sn(){return Ve(i.currentId)||null}function Ru(t){return String(t?.ext||"").replace(/^\./,"").toLowerCase()}function er(t,e){const n=e?.querySelector("[data-embed-toggle]"),s=e?.querySelector("[data-notice-opt]");return(t.source==="embedded"||t.source==="lrc-file")&&s&&n?!!n.checked:i.config.embedMeta===!0}function tr(t,e){let n=-1;for(let s=0;s<t.length&&t[s].time+e<=i.position;s+=1)n=s;return n}function fi(){return{lower:-1e4,upper:1e4}}function pa(t){const e=we();if(!e.songId){u("请先播放一首歌曲",{tone:"warning"});return}if(!e.text){u("这首歌还没有歌词，先去在线匹配或手动编辑",{tone:"warning",duration:2600});return}const n=fi(),s=Math.max(n.lower,Math.min(n.upper,qt(e.songId)+t));vt(e.songId,s),N()}function nr(t){const e=we();if(!e.songId||!e.text)return;const n=fi(),s=Math.max(n.lower,Math.min(n.upper,Math.round(Number(t)||0)));vt(e.songId,s),N()}function Nu(){const t=we();t.songId&&(vt(t.songId,0),N())}function qu(){j({title:"歌词微调：介绍与指引",body:c`
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
    `,okText:"知道了"}).root.classList.add("modal--wide","modal--scroll","modal--single")}function Ps(){g.undo.push({lines:g.lines.map(t=>({...t})),cursor:g.cursor}),g.undo.length>50&&g.undo.shift()}function Bu(){const t=g.undo.pop();if(!t){u("没有可撤销的操作",{duration:1500});return}g.lines=t.lines,g.cursor=Math.min(t.cursor,Math.max(0,t.lines.length-1)),g.dirty=!0,at()?.setDraftText(Mn()),N()}function Mn(){return g.lines.map(t=>typeof t.time=="number"?Yn(t.time)+t.text:t.text).join(`
`)}function sr(t){if(!g.lines.length)return;const e=Math.max(0,Math.min(g.lines.length-1,g.cursor+t));e!==g.cursor&&(g.cursor=e,N())}function Co(t){!Number.isFinite(t)||t<0||t>=g.lines.length||t===g.cursor||(g.cursor=t,N())}function Fu(t){Co(t);const e=g.lines[t];e&&typeof e.time=="number"&&Ee(e.time);const n=at();n&&(n._followHold=Date.now()+4e3)}function fa(){if(!g.lines.length){u("先点「编辑歌词文本」把歌词贴进来",{tone:"warning",duration:2600});return}if(To()){u("已切歌：先决定这份草稿怎么办（保存它，或点「载入当前歌词」重来）",{tone:"warning",duration:4200});return}const t=g.lines[g.cursor];t&&(Ps(),t.time=Math.round(i.position/10)*10,g.dirty=!0,g.cursor<g.lines.length-1&&(g.cursor+=1),at()?.setDraftText(Mn()),N())}function Uu(t){const e=g.lines[t];!e||typeof e.time!="number"||(Ps(),e.time=null,g.dirty=!0,at()?.setDraftText(Mn()),N())}function Hu(){g.lines.length&&(Ps(),g.lines.forEach(t=>{t.time=null}),g.cursor=0,g.dirty=!0,at()?.setDraftText(Mn()),u("已清空全部时间，可以重新打轴",{duration:2e3}),N())}function zu(){const t=we(),e=g.lines.length?Mn():t.text||"",n=j({title:"编辑歌词文本",desc:"一行一句，纯文本即可；已经打过轴的行会带上 [mm:ss.xx] 时间标签。改完点「应用文本」回到打轴列表。",body:c`
      <div class="lyricspanel__row lyricspanel__row--between">
        <span class="lyricspanel__hint">共 ${g.lines.length} 行</span>
        <span class="lyricspanel__row-actions">
          <button
            class="btn btn--sm"
            type="button"
            data-act="modal-load"
            @click=${a=>ar(a,t.text||"")}
          >
            载入当前歌词
          </button>
          <button class="btn btn--sm" type="button" data-act="modal-clear" @click=${a=>ar(a,"")}>
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
    `,okText:"应用文本",cancelText:"取消",onOk:(a,r)=>{const o=r.querySelector("[data-editor-text]");return at()?.applyDraftText(o?o.value:"")!==!1}});n.root.classList.add("modal--wide","modal--scroll");const s=n.root.querySelector("[data-editor-text]");s&&(s.value=e)}function ar(t,e){const s=t.target.closest(".modal")?.querySelector("[data-editor-text]");s&&(s.value=e,s.focus())}function Ku(t){const e=g.lines[t];if(!e)return;let n=e.time;if(typeof n!="number"){for(let s=t-1;s>=0;s-=1)if(typeof g.lines[s].time=="number"){n=g.lines[s].time;break}}if(typeof n!="number"){u("这一行还没有时间，无法跳转",{duration:1600});return}Ee(n),Co(t)}function To(){return!!g.songId&&we().songId!==g.songId&&ju()}function ju(){return g.lines.some(t=>typeof t.time=="number")}function Vu(){Gt()}function Wu({title:t,body:e,okText:n,cancelText:s}){return new Promise(a=>{let r=!1;const o=l=>{r||(r=!0,a(l))};j({title:t,body:e,okText:n,cancelText:s,onOk:()=>(o(!0),!0),onCancel:()=>(o(!1),!0)})})}function Gu(){return Math.round(Qa()*1.3)}const ir="/skins/",Yu={loading:"歌词匹配中…",matching:"歌词匹配中…",failed:"歌词匹配失败",none:"暂无歌词"},hi=300;class Eo extends Map{constructor(e,n){super(n),this.max=e}set(e,n){for(super.has(e)&&super.delete(e),super.set(e,n);this.size>this.max;){const s=super.keys().next();if(s.done)break;super.delete(s.value)}return this}touch(e){if(!super.has(e))return;const n=super.get(e);return this.set(e,n),n}}class Xu extends Set{constructor(e,n){super(n),this.max=e}add(e){if(super.has(e))return this;for(super.add(e);this.size>this.max;){const n=super.values().next();if(n.done)break;super.delete(n.value)}return this}}const ue=new Eo(hi),Ua=new Xu(hi),ha=new Set;function Qu(t,e){if(!t?.id)return;const n=ue.get(t.id)||{lines:[],text:"",source:"none"};n.status!==e&&(ue.set(t.id,{...n,status:e}),M.lyricsStatus=null,J()?.id===t.id&&pe({type:"lyrics",...Ie()}))}function J(){return Ve(i.currentId)}function ma(){const t=i.config.lyricsSources;return!Array.isArray(t)||!t.length?!0:t.includes("online")}async function Io(t){if(!t)return{lines:[],text:"",source:"none",status:"none"};if(ue.has(t.id))return ue.get(t.id);let e="",n="none",s=!1;if(ue.set(t.id,{lines:[],text:"",source:"none",status:"loading"}),$()){const r=await b.loadLyrics(t.id);r&&typeof r=="object"&&typeof r.lrc=="string"?(e=r.lrc,n=r.source||"backend"):typeof r=="string"&&(e=r,n="backend"),s=!!e,!e&&ma()&&(Qu(t,"matching"),e=await Zu(t),e&&(n="online"))}if(!e){if($()){const o=ma()?"failed":"none",l={lines:[],text:"",source:"none",status:o};return ue.set(t.id,l),l}const r=i.songs.findIndex(o=>o.id===t.id);e=r===0?kl:r===1?Sl:ep(t),n="preview"}const a={lines:cs(e),text:e,source:n,status:"ok"};return ue.set(t.id,a),$()&&s&&ma()&&!Ao(a)&&Ju(t),a}function Ao(t){return!!t?.lines?.some(e=>Array.isArray(e.words)&&e.words.length)}async function Ju(t){try{const e=await b.lyricsUpgradeWord(t.id),n=typeof e?.lrc=="string"?e.lrc:"";if(!n)return;const s={lines:cs(n),text:n,source:e?.source||"online",status:"ok"};if(!Ao(s))return;ue.set(t.id,s),M.lyricsText=null,J()?.id===t.id&&pe({type:"lyrics",...Ie()})}catch(e){console.warn("[lyrics] 逐字歌词升级失败",e)}}async function Zu(t){if(Ua.has(t.id))return"";Ua.add(t.id);try{if(t.online){const n=await b.onlineLyrics(t.title||"",t.artist||"",t.duration||0),s=typeof n?.lrc=="string"?n.lrc:"";return s?(b.lyricsSave(t.id,s,n?.source||"online",!1).catch(()=>{}),s):""}const e=await b.lyricsAutoMatch(t.id);return typeof e?.lrc=="string"?e.lrc:""}catch(e){return console.warn("[lyrics] 在线自动匹配失败",e),""}}function ep(t){const e=[];for(let n=12;n<Math.max(60,Math.floor((t.duration||18e4)/1e3)-10);n+=9)e.push(`[00:${String(n).padStart(2,"0")}.00]（${t.title} · 暂无歌词文件，接入后端后可读取 .lrc 或内嵌歌词）`);return e.join(`
`)}const Ha=new Eo(hi);function qt(t){return Ha.get(t)||0}function vt(t,e){if(!t)return 0;const n=Math.round(Number(e)||0);return n?Ha.set(t,n):Ha.delete(t),M.lyricsText=null,w.skinHost&&J()?.id===t&&pe({type:"lyrics",...Ie()}),n}let Kn={songId:"",offset:0,lines:[]};function Os(t){const n=(t?ue.get(t.id):null)?.lines||[],s=qt(t?.id);if(!s||!n.length)return n;if(Kn.songId===t.id&&Kn.offset===s)return Kn.lines;const a=n.map(r=>{const o={time:r.time+s,text:r.text};return r.trans&&(o.trans=r.trans),r.words&&(o.words=r.words.map(l=>l+s)),o});return Kn={songId:t.id,offset:s,lines:a},a}function we(t){const e=t?Ve(t):J(),n=e?ue.get(e.id):null;return{song:e||null,songId:e?.id||"",text:n?.text||"",source:n?.source||"none",status:n?.status||(n?.lines?.length?"ok":"none"),lines:n?.lines||[]}}function rr(t){switch(t){case"embedded":return"内嵌歌词";case"lrc-file":return"同目录 .lrc";case"cache":return"歌词缓存";case"online":return"在线自动匹配";case"manual":return"手动编辑";case"preview":return"预览数据";default:return"暂无"}}async function za(){const t=J();if(!(!t||ue.has(t.id)||ha.has(t.id))){ha.add(t.id);try{await Io(t)}finally{ha.delete(t.id)}}}function tp(){const t={text:"",chars:[],trans:[],words:[],wordEnds:[]},e=J();if(!e)return t;const n=Os(e);if(!n.length)return t;const s=Es(n,i.position);if(s<0)return t;const a=n[s],r=String(a.text??""),o=Array.isArray(a.words)&&a.words.length?a.words:[],l=o.length?Oc(r):[],d=l.length===o.length;return{text:r,chars:d?l:[],trans:Array.isArray(a.trans)?a.trans.filter(Boolean):[],words:d?o:[],wordEnds:d?Lc(o,n[s+1]?.time):[]}}function np(){const t={prev:"",text:"",next:""},e=J();if(!e)return t;const n=Os(e);if(!n.length)return t;const s=Es(n,i.position);return s<0?t:{prev:Xn(n[s-1])||"",text:Xn(n[s])||"",next:Xn(n[s+1])||""}}async function ba(t,e,n="online",s={}){if(!t||!e)return!1;ue.set(t,{lines:cs(e),text:e,source:n,status:"ok"}),Ua.add(t),M.lyricsText=null,M.lyricsStatus=null;let a=null;if(!s.transient&&$()){const r=s.embed??i.config.embedMeta===!0;try{const o=await b.lyricsSave(t,e,n,r);a=o||null;const l=typeof o?.lrc=="string"&&o.lrc?o.lrc:e;l!==e&&(ue.set(t,{lines:cs(l),text:l,source:n,status:"ok"}),M.lyricsText=null,M.lyricsStatus=null)}catch(o){console.warn("[lyrics] 写入缓存失败",o)}}return w.skinHost&&J()?.id===t&&pe({type:"lyrics",...Ie()}),a||{ok:!0}}const Ka=[],va=new Set;let is=null;async function mi(){return is||(is=ip()),is}async function sp(){try{await mi()}catch(t){console.warn("[skins] 启动扫描样式失败",t)}return Oo(),kn()}async function ap(){if($()){const t=await b.listSkins();let e="";try{e=String(await b.skinsToken()||"")}catch(n){console.warn("[skins] 读取皮肤访问令牌失败",n)}return{items:Array.isArray(t)?t:[],base:n=>`${ir}${encodeURIComponent(n)}/`,suffix:e?`?t=${encodeURIComponent(e)}`:""}}try{const t=await fetch("/preview-skins/__list.json",{cache:"no-store"});if(!t.ok)throw new Error(`HTTP ${t.status}`);const e=await t.json();return{items:Array.isArray(e)?e:[],base:n=>`/preview-skins/${encodeURIComponent(n)}/`,suffix:""}}catch(t){return console.warn("[skins] 预览模式读取样式清单失败",t),{items:[],base:e=>`${ir}${encodeURIComponent(e)}/`,suffix:""}}}async function ip(){try{const{items:t,base:e,suffix:n}=await ap();Ka.length=0;const s=new Set;Ec();for(const a of t){if(!a?.id||!a?.module||!a?.manifest)continue;const r=e(a.id),o=d=>r+String(d).replace(/^\/+/,"")+n,l=a.manifest?.icon?.file;try{await Ic({manifest:a.manifest,moduleUrl:o(a.module),cssUrls:(Array.isArray(a.styles)?a.styles:[]).map(o),iconUrl:l?o(l):"",builtin:a.builtin===!0,source:a.source||""}),a.builtin===!0?Ac(Dc(a.id)):va.add(a.id),s.add(a.id)}catch(d){Ka.push({id:a.id,reason:d?.message??String(d)}),console.warn(`[skins] 样式「${a.id}」加载失败：`,d)}}for(const a of[...va])s.has(a)||(va.delete(a),Mc(a))}catch(t){console.warn("[skins] 皮肤目录扫描失败",t)}return kn()}async function Ls(){is=null,await mi(),Oo()}async function rp(t){await b.deleteSkin(t),await Ls();const e=kn().some(n=>n.id===t);return!e&&(i.pvMode===t||i.config.playerViewMode===t)&&jt(Ts("").skin?.id||""),{removed:!e,skinIds:kn().map(n=>n.id)}}function Do(){return Ka.slice()}let Mo=0;function Po(){return Mo}function Oo(){Mo+=1,ge()}const w={view:null,stage:null,backgroundRoot:null,skinHost:null,get skin(){return w.skinHost?.skin||null},get mountedId(){return w.skinHost?.mountedId||null},closeTimer:null,resizeObserver:null,themeObserver:null,carouselTimer:null,carouselIndex:0,carouselLastAdvance:0,carouselSongId:null},M={songId:null,cover:null,lyricsText:null,lyricsStatus:null,options:null,playing:null,themeId:null};function bi(){return{position:i.position,duration:i.duration,playing:i.playing,volume:i.volume,muted:i.muted}}function vi(t){if(!t)return[Ss];const e=i.coverSets.get(t.id)?.items,n=Array.isArray(e)?e.map(s=>s.preview).filter(Boolean):[];return n.length?n:[wt(t)]}function op(t){return t?Es(Os(t),i.position):-1}function Lo(t){const e=t?ue.get(t.id):null,n=Os(t),s=e?.status||(n.length?"ok":"none");return{lines:n,text:e?.text||"",source:e?.source||"none",status:s,statusText:n.length?"":Yu[s]||"暂无歌词",index:Es(n,i.position)}}function lp(t){return t?{id:t.id??"",title:t.title||"",artist:t.artist||"",album:t.album||"",duration:t.duration||0,kind:t.online?"online":"local"}:null}function Ie(){const t=J(),e=vi(t),n=ut(w.carouselIndex,0,Math.max(0,e.length-1));return{song:lp(t),cover:e[n]||Ss,covers:e,coverIndex:n,lyrics:Lo(t)}}function gi(){return{showLyrics:i.config.showLyrics!==!1,lyricsFontSize:i.config.lyricsFontSize,animations:i.config.animations!==!1,coverCarousel:i.config.coverCarousel===!0,coverCarouselInterval:No().seconds,interactive:!0,performanceMode:i.config.skinPerformanceMode==="performance"?"performance":"smooth"}}function cp(){return Ie()}function Ro(){return bi()}function dp(t={}){return{...gi(),...t}}function up(){return w.skinHost||(w.skinHost=Pc({root:w.stage,backgroundRoot:w.backgroundRoot,view:w.view,app:document.getElementById("app"),source:{playback:bi,media:Ie,options:gi,env:pp,defaultCover:Ss,spectrum:()=>i.playing?wu():null,actions:{seek(t){Ee(t),rs({force:!0})},seekBy(t){Ee(Math.max(0,Number(i.position||0)+Number(t||0))),rs({force:!0})},seekRatio(t){const e=Math.max(0,Math.min(1,Number(t)||0));i.duration&&(Ee(e*i.duration),rs({force:!0}))},togglePlay:Gt,next:()=>Ft(!1),prev:()=>Ja(),toggleLike(){const t=J();t&&mt(t.id)},like(){const t=J();t&&!nt(t.id)&&mt(t.id)},unlike(){const t=J();t&&nt(t.id)&&mt(t.id)},openFolder(){const t=J();t?.path&&b.revealInExplorer(t.path).catch(()=>{})},openCoverPanel(){const t=J();!t||t.online||_t(()=>Promise.resolve().then(()=>wi),[]).then(e=>e.openCoverPanel(t.id))},openLyricsPanel(){xo()},reportBackdrop(t){const e=w.skin;!e||!t||typeof t!="object"||(e.colors={...e.colors,...t},e.chrome=Rc(e.colors),w.skinHost?.applyChrome(i.playerOpen&&!w.view?.hidden))}}}})),w.skinHost}function pp(){const t=w.stage?.getBoundingClientRect?.()||{width:0,height:0};return{themeId:document.documentElement.dataset.theme||"",mode:document.documentElement.dataset.mode==="light"?"light":"dark",width:Math.round(t.width||0),height:Math.round(t.height||0),dpr:Number(window.devicePixelRatio)||1,reducedMotion:!!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,foreground:!!i.playerOpen&&!w.view?.hidden}}function pe(t){w.skinHost?.push(t)}function fp(t){const{skin:e,fellBack:n}=Ts(t);e&&(n&&console.warn(`[skins] 样式「${t}」不存在，已回退到「${e.name}」`),i.pvMode=e.id,document.getElementById("app")?.setAttribute("data-mode",e.id),up().mount(e),w.skinHost.applyChrome(i.playerOpen&&!w.view?.hidden),mp(),ja("closed"))}function ja(t){const e=w.backgroundRoot;e&&(e.dataset.state=t)}function hp(){w.skin&&(w.skinHost?.unmount(),w.resizeObserver&&(w.resizeObserver.disconnect(),w.resizeObserver=null),w.carouselTimer&&(clearInterval(w.carouselTimer),w.carouselTimer=null))}function mp(){w.resizeObserver||typeof ResizeObserver!="function"||(w.resizeObserver=new ResizeObserver(()=>{const t=w.stage.getBoundingClientRect();pe({type:"resize",width:Math.round(t.width),height:Math.round(t.height)})}),w.resizeObserver.observe(w.stage,{box:"border-box"}))}function No(){const t=Number(i.config.coverCarouselInterval),e=Number.isFinite(t)&&t>0?Math.max(2,t):10;return{enabled:i.config.coverCarousel===!0,seconds:e,intervalMs:e*1e3}}function bp(){const t=J();w.carouselSongId!==(t?.id??null)&&(w.carouselSongId=t?.id??null,w.carouselIndex=i.coverSets.get(t?.id)?.active??0,w.carouselLastAdvance=Date.now());const{enabled:e,intervalMs:n}=No(),s=vi(t);!e||!i.playerOpen||!i.playing||s.length<2||Date.now()-w.carouselLastAdvance<n||(w.carouselLastAdvance=Date.now(),w.carouselIndex=(w.carouselIndex+1)%s.length,pe({type:"media",...Ie()}))}function vp(){w.carouselTimer||(w.carouselTimer=setInterval(bp,1e3))}function gp(){const t=vi(J());return t.length<2?!1:(w.carouselIndex=(w.carouselIndex+1)%t.length,w.carouselLastAdvance=Date.now(),pe({type:"media",...Ie()}),!0)}function or(){M.cover=null,w.skinHost&&pe({type:"media",...Ie()})}function ga(t={},e=t.type==="song"||t.type==="lyrics"||t.type==="media"){const n=Ie(),s=n.cover!==M.cover||n.song?.id!==M.songId;M.cover=n.cover,!(!s&&!e)&&pe({...t,...n})}function lr(){const t=gi();M.options&&M.options.showLyrics===t.showLyrics&&M.options.lyricsFontSize===t.lyricsFontSize&&M.options.animations===t.animations&&M.options.coverCarousel===t.coverCarousel&&M.options.coverCarouselInterval===t.coverCarouselInterval&&M.options.interactive===t.interactive&&M.options.performanceMode===t.performanceMode||(M.options=t,pe({type:"options",options:t}))}function cr(){const t=!!i.playerOpen&&!!w.view?.dataset.theme;return w.skinHost?.applyChrome(t)??!1}async function dr(){if(!w.view){if(w.view=ki("#playerview"),w.stage=ki("#playerview-stage"),w.backgroundRoot=document.getElementById("skin-background"),!w.view||!w.stage)return;_p(),vp()}const t=w.view,e=J();if(!!!i.playerOpen){t.dataset.state!=="closed"&&(t.dataset.state="closed",cr(),ja("closed"),w.closeTimer&&clearTimeout(w.closeTimer),w.closeTimer=setTimeout(()=>{w.closeTimer=null,!i.playerOpen&&(t.hidden=!0,hp(),ks())},Gu()+20));return}w.closeTimer&&(clearTimeout(w.closeTimer),w.closeTimer=null),t.hidden=!1,await mi();const s=i.pvMode||i.config.playerViewMode||"",a=w.mountedId!==s;if(a&&(fp(s),ks()),(t.dataset.state!=="opened"||a)&&(t.offsetHeight,t.dataset.state="opened",ja("opened"),cr()),!w.skin)return;if(M.songId!==(e?.id??null)){M.songId=e?.id??null,M.cover=null,M.lyricsText=null,w.carouselSongId=e?.id??null,w.carouselIndex=i.coverSets.get(e?.id)?.active??0,ga({type:"song"});const o=e?.id??null,l=await Io(e);if((J()?.id??null)!==o)return;M.lyricsText=l.text,M.lyricsStatus=l.status||"",ga({type:"lyrics"}),lr();return}ga({type:"media"},!1);const r=Lo(e);(r.text!==M.lyricsText||r.status!==M.lyricsStatus)&&(M.lyricsText=r.text,M.lyricsStatus=r.status,pe({type:"lyrics",...Ie()})),lr(),rs()}function ks(){M.songId=null,M.cover=null,M.lyricsText=null,M.lyricsStatus=null,M.options=null,M.playing=null}function rs({force:t=!1,lyricIndex:e}={}){if(!i.playerOpen||!w.skin)return;const n=bi();(M.playing!==n.playing||t)&&(M.playing=n.playing,pe({type:"state",...n}));const s=typeof e=="number"?e:op(J());pe({type:"progress",...n,lyricIndex:s})}function _p(){w.themeObserver||(M.themeId=document.documentElement.dataset.theme||"",w.themeObserver=new MutationObserver(()=>{const t=document.documentElement.dataset.theme||"",e=document.documentElement.dataset.mode||"dark";t!==M.themeId&&(M.themeId=t,pe({type:"theme",themeId:t,mode:e}))}),w.themeObserver.observe(document.documentElement,{attributes:!0,attributeFilter:["data-theme","data-mode"]}))}function jt(t){const{skin:e,fellBack:n}=Ts(t);e&&(i.pvMode=e.id,i.config.playerViewMode=e.id,ks(),k(),n&&console.warn(`[skins] 样式「${t}」不可用，已切换到「${e.name}」`))}function qo(){i.playerOpen=!0,i.pvMode=Ts(i.config.playerViewMode||"").skin?.id||i.pvMode,ks(),k()}function Rs(){i.playerOpen=!1,k()}function Va(){i.playerOpen?Rs():qo()}function Vt(){return kn().map(t=>({id:t.id,name:t.name,icon:t.icon||"disc",iconUrl:t.iconUrl||"",builtin:t.builtin===!0,source:t.source||"",version:t.version||"",author:t.author||"",description:t.description||"",colorsMissing:Array.isArray(t.colorsMissing)?t.colorsMissing.slice():[],chrome:t.chrome||null,background:t.background===!0,spectrum:t.spectrum||!1}))}const yp=/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,wp=/^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/]+\)$/i;function ur(t){const e=String(t??"").trim();return yp.test(e)||wp.test(e)?e:""}function $p(t){const e=[];for(const n of t)for(const s of n?.swatch||[]){const a=ur(s);a&&!e.includes(a)&&e.push(a)}return xs("packstore-swatches",e.map((n,s)=>`[data-packswatch="${s}"]{background:${n}}`).join(`
`)),n=>(n?.swatch||[]).map(ur).filter(Boolean).map(s=>e.indexOf(s))}class kp extends fe{static deps(){return[]}constructor(){super(),this.kind="theme",this.localBody=x,this.onChanged=null,this._tab="local",this._status="idle",this._items=[],this._swatchIndex=()=>[],this._cached=!1,this._stale="",this._error="",this._busy="",this._source={source:"",default:"",channel:""},this._editing=!1,this._draft=""}open(e){this.kind=e.kind==="style"?"style":"theme",this.localBody=e.localBody??x,this.onChanged=e.onChanged??null,this._tab="local",this._status="idle"}get _kindLabel(){return this.kind==="style"?"样式包":"主题"}_ensureRepo(){this._status==="idle"&&(this._loadSource(),this.load(!1))}get _canEditSource(){return this._status==="ok"||this._status==="error"}async _loadSource(){try{const e=await b.packSource();e&&(this._source={source:String(e.source||""),default:String(e.default||""),channel:String(e.channel||""),problem:String(e.problem||"")},this._draft=this._source.source,this.requestUpdate())}catch(e){console.warn("[packstore] 读取插件仓库地址失败",e)}}async load(e){this._status="loading",this._error="",this.requestUpdate(),this._loadSource();try{const n=await b.packCatalog(this.kind,e===!0);if(!n){this._status="preview",this.requestUpdate();return}this._items=Array.isArray(n.items)?n.items:[],this._swatchIndex=$p(this._items),this._cached=n.cached===!0,this._stale=String(n.staleReason||""),this._status="ok"}catch(n){this._error=n?.message||String(n),this._cached=!1,this._stale="",this._status="error"}this.requestUpdate()}_installedIds(){const e=this.kind==="style"?Vt():En();return new Set(e.map(n=>n.id))}_localVersion(e){if(this.kind!=="style")return"";const n=Vt().find(s=>s.id===e);return String(n?.version||"")}async install(e){if(this._busy)return;const n=String(e?.id||"");if(!n)return;this._busy=n,this.requestUpdate();const s=u(`正在安装「${e.name||n}」…`,{duration:0});try{const a=await b.packInstall(this.kind,n);s.close(),await this._refreshLocal();const r=e.name||n,o=Array.isArray(a?.backups)?a.backups.length:0;u(`已安装「${r}」${o?`（有 ${o} 个原文件备份成了 .bak）`:""}`,{tone:"success",duration:4200})}catch(a){s.close(),u(`安装失败：${a?.message??a}`,{tone:"error",duration:6e3})}this._busy="",this.requestUpdate()}async _refreshLocal(){try{this.kind==="style"?await Ls():await In()}catch(e){console.warn("[packstore] 重扫本机插件失败（安装结果不受影响）",e)}this.onChanged?.()}_startEdit(){this._editing=!0,this._draft=this._source.source,this.requestUpdate(),this.updateComplete.then(()=>this.$(".packsrc__input")?.focus())}_onSrcInput(e){this._draft=String(e.target.value??"")}_cancelEdit(){this._editing=!1,this.requestUpdate()}_onSrcKey(e){if(e.key==="Enter"){e.preventDefault(),e.stopPropagation(),this._saveSource();return}e.key==="Escape"&&(e.stopPropagation(),this._editing=!1,this.requestUpdate())}async _saveSource(){const e=this._draft.trim();try{const n=await b.packSetSource(e);n&&(this._source={source:String(n.source||""),default:String(n.default||""),channel:String(n.channel||""),problem:String(n.problem||"")}),this._editing=!1,this.requestUpdate(),this._source.problem?u(this._source.problem,{tone:"error",duration:7e3}):u(`插件仓库已指向 ${this._source.source}`,{tone:"success",duration:3600}),this._items=[],this._status="loading",this.load(!0)}catch(n){u(`保存失败：${n?.message??n}`,{tone:"error",duration:6e3})}}render(){return c` <div class="packdlg">
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
    </div>`}}ee("mp-pack-store",kp);function Bo(t){const e=j({title:t.title,body:c`<mp-pack-store></mp-pack-store>`,okText:"关闭",onOk:()=>!0});return e.root.classList.add("modal--wide","modal--scroll","modal--single"),e.root.querySelector("mp-pack-store")?.open({kind:t.kind,localBody:t.localBody,onChanged:t.onChanged}),e}const Sp=[{value:"play",label:"播放"},{value:"play-list",label:"播放当前列表"},{value:"next",label:"下一首播放"}],xp=[{value:"system",label:"跟随系统"},{value:"round",label:"标准"},{value:"small",label:"小圆角"},{value:"square",label:"直角"}],Cp=[{value:"compact",label:"紧凑"},{value:"cozy",label:"标准"},{value:"roomy",label:"宽松"}],Tp=[{value:"fast",label:"快速 0.25s"},{value:"medium",label:"适中 0.5s"},{value:"slow",label:"缓慢 0.75s"}],Ep=[{value:"smooth",label:"流畅优先"},{value:"performance",label:"性能优先"}],Ip={embedded:"内嵌歌词","lrc-file":"同目录 .lrc",cache:"歌词缓存",online:"在线自动匹配"};function Ap(){const e=(Array.isArray(i.config.lyricsSources)?i.config.lyricsSources:[]).map(n=>Ip[n]||n);return e.length?e.join(" → "):"（未配置）"}function _i(){const t=i.coverCache;if(!t)return"正在读取…";const e=((t.bytes||0)/1024/1024).toFixed(1);return`已缓存 ${I(t.covers||0)} 张封面、${I(t.lyrics||0)} 份歌词，共 ${e} MB`}function Fo(){const t=i.coverCache||{};return(Number(t.covers)||0)+(Number(t.lyrics)||0)}function Dp(){const t="默认关闭：封面与歌词都只放在缓存目录里。开启后下载 / 更换封面时会把它们写进文件标签，这样把文件拷到别的播放器上也能看到封面与歌词（m4a / flac 支持，mp3 等格式会明确跳过）";return i.coverCache?Fo()===0?`${t}。当前缓存里还没有封面或歌词可写`:`${t}。缓存里已经有 ${_i()}`:t}function Mp(){return`这个开关只对之后下载或更换的封面生效；已经存在缓存里的封面与歌词（${_i()}）可以用下面的按钮一次性写进歌曲文件。mp3 / wav 等暂不支持写标签的格式会被跳过，不会动你的文件。`}function pr(){const t=En(),e=[];for(const s of t)for(const a of s.swatch||[])e.includes(a)||e.push(a);const n=e.map((s,a)=>`[data-swatch="${a}"]{background:${s}}`).join(`
`);return xs("swatch-styles",n),s=>(s.swatch||[]).map(a=>e.indexOf(a))}function Pp(t){if(!t?.dir)return`（浏览器预览模式读不到本机目录，以下是源码仓库里的参考文件）
1. 接口唯一定义（含 JSDoc 类型与完整字段说明）：frontend/packages/player-skins/src/contract.js
2. 内置样式包（结构与写法可直接参考，内置与第三方现在同构）：internal/skins/resources/player-skins/classic/、immersive/
3. 可直接复制改名的最小示例包：internal/skins/template/（skin.json / skin.js / skin.css / assets/）
4. 说明文档：frontend/packages/player-skins/README.md 与 internal/skins/template/皮肤说明.md`;const e=["本机真实路径如下。如果你能读文件，请先打开它们当范例；如果读不到（例如纯聊天环境），请让使用者把下面第 2 条的文件内容贴给你，再开始写。",`1. 样式（皮肤）目录 —— 第三方样式包都放在这里，扫描只认它下面的一层子目录：${t.dir}`];t.example?e.push(`2. 示例样式包（完整可运行的 skin.js / skin.css / skin.json，复制改名就是一份新样式）：${t.example}`):e.push("2. 示例样式包：本机没有找到 _template 目录，请只按本规格的接口定义写。"),t.current?e.push(`3. 当前正在使用的样式包（最贴近现状的参考）：${t.current}`):e.push(`3. 当前正在使用的是内置样式（${t.currentId||"classic / immersive"}）：它的文件内嵌在程序里，磁盘上没有对应目录，请以第 2 条的示例包为准。`);const n=Array.isArray(t.packs)?t.packs:[];if(n.length){e.push("4. 该目录里已有的第三方样式包（可以直接读它们的入口与样式）：");for(const s of n){const a=[s.module,...Array.isArray(s.styles)?s.styles:[]].filter(Boolean);e.push(`   · ${s.name||s.id}（id: ${s.id}）：${a.join("、")||s.dir}`)}}else e.push("4. 该目录里目前还没有第三方样式包 —— 你写的这个会是第一个。");return e.push('5. 清单里 apiVersion 必须是 "3.0"（major 不同会被直接拒绝；minor 可以比宿主旧）。'),e.join(`
`)}function Op(t){if(!t?.dir)return`（浏览器预览模式读不到本机目录，以下是源码仓库里的参考文件）
1. 令牌默认值与注释：frontend/src/styles/tokens.css、frontend/src/styles/themes/_template.css
2. 内置主题（可直接对照写法）：frontend/src/styles/themes/flat-dark.css、flat-light.css、cover-dark.css
3. 扫描与指令解析实现：internal/theme/theme.go`;const e=["本机真实路径如下。如果你能读文件，请先打开它们当范例；如果读不到（例如纯聊天环境），请让使用者把下面第 2 条的文件内容贴给你，再开始写。",`1. 主题目录 —— 用户主题都放在这里，只扫一层、不递归；文件名默认就是主题 id，显示名由 @theme-name 决定：${t.dir}`];t.currentFile?e.push(`2. 当前正在使用的主题：${t.currentName||t.currentId}（id: ${t.currentId}）→ 文件：${t.currentFile}`):e.push("2. 当前主题的文件没找到，请以第 3 条列出的文件为准。");const n=Array.isArray(t.files)?t.files:[];if(n.length){e.push("3. 主题目录里已有的主题文件（都是合法示例，可直接对照写法）：");for(const s of n)e.push(`   · ${s.file}（${s.name||s.id}，id: ${s.id}，模式 ${s.mode}，${s.builtin?"内置":"用户导入"}）`)}else e.push("3. 主题目录里暂时没有 .css 文件。");return e.join(`
`)}function Lp(t=null){return`请为「本地音乐播放器」（Go + WebView2 的 Windows 桌面应用）产出一个第三方「播放界面样式（插件）」包。这个包会被应用直接扫描并加载，因此必须严格满足下面的规格。

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
   · 舞台**自身**   → 用 ::scope { … }
2. 不要写 :root / html / body / * 级别或裸标签选择器，不要用 !important 去覆盖别人的规则。
3. 你的 CSS 在 @layer skin 里，**压不过**宿主壳的规则；也**碰不到**宿主 UI（标题栏、底栏、侧边栏、播放队列等都不在作用域内）。想影响宿主控件的观感只有一条路：在清单 colors 里声明配色（宿主会保证对比度）。
4. 可以直接使用主题令牌，深浅色会自动跟随：
   --accent / --accent-weak / --accent-text / --accent-contrast / --text-1 / --text-2 / --text-3 / --text-inverse / --surface-1 / --surface-2 / --surface-3 / --surface-hover / --surface-active / --glass-bg / --glass-bg-strong / --glass-blur / --glass-saturate / --glass-border / --border-1 / --border-2 / --divider / --r-sm / --r-md / --r-lg / --r-xl / --dur / --ease / --lyric-size
   （其中 --lyric-size 是**用户设置**「歌词字号」：宿主写在 :root 上，歌词零件已经
    读它。样式包想改字号就在自己的作用域里覆盖它；但**不要**为了"固定一个好看的
    字号"而无条件写死 —— 那等于替用户关掉了这个设置。相关旋钮还有
    --lyric-size-active（当前行字号）与 --lyric-dim（非当前行压暗程度），
    都按使用点兜底读取，写在 ::scope 上即可生效。）
5. 不要改布局令牌（--h-titlebar / --w-sidebar / --h-playerbar / --h-header / --row-h / --row-h-compact），改了会破坏固定布局。
6. 需要私有变量时定义在自己的作用域里（::scope { --my-…: … }），不要写到 :root。

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
4. CSS 选择器是相对舞台根写的（舞台自身用 ::scope），没有加 .playerview[data-skin=…] 前缀；
5. 没有 fetch、没有 setInterval 轮询、没有全局选择器、没有 !important、没有碰宿主 UI 的选择器；
6. 换歌、歌词装载、进度更新、深浅色切换、窗口缩放、切走再切回都不会报错，也不留残余节点或监听；
7. 声明了 spectrum 才调 ctx.spectrum()（拉取式，不调不采样）；用了背景层才声明 background。

【七、参考资料】
${Pp(t)}

【八、输出格式】
1. 先写清目录名与文件清单；
2. 再逐个文件输出完整代码，每个文件单独一个代码块，并在代码块第一行用注释标明文件名；
3. 不要省略、不要用省略号占位、不要留 __SKIN_ID__ 之类的占位符，代码要能直接运行。

【九、风格】
本提示词只约定产物必须满足的规则、格式、环境与参考，不规定也不暗示视觉风格；具体样式（布局、配色、动效、气质）由使用者自行构思。
请以使用者随附的风格说明为准；若使用者没有给出，先向使用者确认，不要自行假设。

【风格要求 · 由使用者自行填写（本行只是占位，本提示词不提供任何风格建议）】
`}function Rp(t=null){return`请为「本地音乐播放器」（Go + WebView2 的 Windows 桌面应用）产出一个「外观主题」CSS 文件。

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
${Op(t)}

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
`}function Uo({copyKey:t,importKind:e,importLabel:n}){return c` <div class="card__actions">
    <button class="btn btn--sm btn--primary" type="button" data-copy-prompt=${t}>
      <svg aria-hidden="true"><use href="#i-file"></use></svg><span>复制提示词</span>
    </button>
    <button class="btn btn--sm" type="button" data-import=${e}>
      <svg aria-hidden="true"><use href="#i-folder"></use></svg><span>${n}</span>
    </button>
  </div>`}async function Np(){if(!$())return null;try{const t=document.documentElement.dataset.theme||i.config.theme||"";return await b.themeReference(t)||null}catch(t){return console.warn("[settings] 读取主题参考资料失败",t),null}}async function qp(){if(!$())return null;try{const t=i.pvMode||i.config.playerViewMode||"";return await b.skinReference(t)||null}catch(t){return console.warn("[settings] 读取样式参考资料失败",t),null}}async function Bp(t){const n=t==="theme"?Rp(await Np()):Lp(await qp());try{await navigator.clipboard.writeText(n),u("提示词已复制，粘贴给 AI 即可",{tone:"success",duration:2e3});return}catch{}const s=document.createElement("textarea");s.value=n,s.setAttribute("readonly",""),s.style.cssText="position:fixed;left:-9999px;top:0;opacity:0;",document.body.appendChild(s),s.select();let a=!1;try{a=document.execCommand("copy")}catch{a=!1}s.remove(),u(a?"提示词已复制，粘贴给 AI 即可":"复制失败，请手动复制",{tone:a?"success":"warning",duration:2600})}async function Fp(t,e={}){const n=t==="theme";if(!$()){u("浏览器预览模式无法导入，请手动把文件放进目录",{tone:"warning",duration:3600});return}const s=u(n?"正在导入主题…":"正在导入样式包…",{duration:0});try{const a=n?await b.importTheme():await b.importSkin();if(s.close(),a?.cancelled)return;const r=n?Array.isArray(a?.imported)?a.imported:[]:a?.id?[a.id]:[],o=Array.isArray(a?.skipped)?a.skipped:[];n?(await In(),e.commit?.(),e.render?.()):(await Ls(),e.render?.());let l=n?r.length?`已导入 ${r.length} 个主题：${r.join("、")}`:"没有导入任何主题":r.length?`已导入样式「${r[0]}」`:"没有导入任何样式";o.length&&(l+=`；另有 ${o.length} 个文件被跳过`),u(l,{tone:r.length?o.length?"warning":"success":"warning",duration:4600}),o.length&&j({title:"部分文件没有导入",body:c`<div class="setting__hint setting__hint--steps">
          ${o.map((d,p)=>c`${p?c`<br />`:x}${d}`)}
        </div>`,okText:"知道了",cancelText:"关闭",onOk:()=>!0})}catch(a){s.close(),u(`导入失败：${a?.message??a}`,{tone:"error",duration:6e3})}}function Ho(t,e={}){t.addEventListener("click",n=>{const s=n.target.closest("[data-copy-prompt]");if(s){Bp(s.dataset.copyPrompt);return}const a=n.target.closest("[data-import]");a&&Fp(a.dataset.import,e)})}function Up(t={}){const e=c` <div class="setting__hint setting__hint--steps">
      · 点「复制提示词」把它粘贴给
      AI：提示词里只有产物的目录结构、接口契约与硬性规则，不含任何风格建议，风格请在末尾那条「风格要求」里自己补一句，它会直接产出一个样式包目录；<br />
      · 提示词里的「参考资料」会自动带上本机的真实路径（样式目录、示例包 _template、当前样式包），AI
      能读文件就会直接照着写；<br />
      · 生成好后回到这里点「导入样式包」，选中那个目录即可（目录里必须有 skin.js）；<br />
      · 也可以手动放进「样式目录/&lt;样式id&gt;/」，回来点「重新扫描样式」。
    </div>
    ${Uo({copyKey:"skin",importKind:"skin",importLabel:"导入样式包…"})}
    <div class="setting__hint">
      接口的唯一定义在 frontend/packages/player-skins/src/contract.js；样式目录里也有现成的 _template
      示例可以直接复制改名。
    </div>`,{root:n}=Bo({kind:"style",title:"添加播放界面样式",localBody:e,onChanged:()=>{t.commit?.(),t.render?.()}});Ho(n,t)}function Hp(t={}){const e=c` <div class="setting__hint setting__hint--steps">
      · 点「复制提示词」把它粘贴给
      AI：提示词里只有文件格式、令牌清单与校验规则，不含任何配色建议，风格请在末尾那条「风格要求」里自己补一句，它会产出一个主题
      CSS；<br />
      · 提示词里的「参考资料」会自动带上本机的真实路径（主题目录、当前主题文件、目录里已有的主题 CSS），AI
      能读文件就会直接照着写；<br />
      · 生成好后回到这里点「导入主题」，选中放着那个 CSS 的文件夹即可；<br />
      · 也可以手动放进主题文件夹（上面有「打开主题文件夹」按钮），回来点「重新扫描主题」。
    </div>
    ${Uo({copyKey:"theme",importKind:"theme",importLabel:"导入主题…"})}
    <div class="setting__hint setting__hint--steps">
      主题只声明颜色，不需要写组件样式，因此换主题不会破坏布局：<br />
      · 选择器写 <b>:root[data-theme="你的文件名"]</b>，与文件名一致最省事；<br />
      · 只改你想要的颜色，其余保持默认即可；<br />
      · 没写到的颜色会自动沿用默认主题，缺失也不会弄坏布局。
    </div>`,{root:n}=Bo({kind:"theme",title:"添加自定义主题",localBody:e,onChanged:()=>{t.commit?.(),t.render?.()}});Ho(n,t)}async function zp(t,e,n){if(!$()){u("浏览器预览模式下不能移除，请手动删除主题文件",{tone:"warning",duration:3600});return}const s=u("正在移除主题…",{duration:0});try{const a=await Wc(t);if(s.close(),!a.removed){u(`没有移除「${e}」`,{tone:"warning"});return}await Le(i.config),n.commit?.(),n.render?.(),u(`已移除主题「${e}」`,{tone:"success"})}catch(a){s.close(),u(`移除失败：${a?.message??a}`,{tone:"error",duration:6e3})}}function Kp(t,e){const n=t.dataset.id,s=t.dataset.name||n;j({title:`移除主题「${s}」？`,desc:"会删除这个主题对应的样式文件。内置主题不能移除。",okText:"移除",danger:!0,onOk:async()=>(await zp(n,s,e),!0)})}async function jp(t,e,n){if(!$()){u("浏览器预览模式下不能移除，请手动删除样式目录",{tone:"warning",duration:3600});return}const s=u("正在移除样式…",{duration:0});try{const a=await rp(t);if(s.close(),!a.removed){u(`没有移除「${e}」`,{tone:"warning"});return}n.commit?.(),n.render?.(),u(`已移除样式「${e}」`,{tone:"success"})}catch(a){s.close(),u(`移除失败：${a?.message??a}`,{tone:"error",duration:6e3})}}function Vp(t,e){const n=t.dataset.id,s=t.dataset.name||n;j({title:`移除样式「${s}」？`,desc:"会把样式目录里对应的整个文件夹删掉（里面只有这个样式的文件，不含歌曲）。",okText:"移除",danger:!0,onOk:async()=>(await jp(n,s,e),!0)})}async function Wa(t,e={}){const n=t.dataset.act,s=t.dataset.id;switch(n){case"about-open-url":{const a=String(t.dataset.url||"").trim();if(!a)return;if(!$()){try{await navigator.clipboard.writeText(a),u("预览模式没有系统浏览器：链接已复制",{duration:2600})}catch{u(a,{duration:5200})}return}try{await b.openExternalUrl(a)}catch(r){u(`打开链接失败：${r?.message??r}`,{tone:"error",duration:5e3})}return}case"update-check":{if(!$()){u("浏览器预览模式无法联网检查更新",{tone:"warning",duration:3200});return}u("正在检查更新…",{duration:2200});try{const a=await Ol({force:!0});if(!a)return;a.error?u(`检查失败：${a.error}`,{tone:"error",duration:7e3}):a.hasUpdate&&!a.assetAvailable?u(`有新版本 ${a.latest}，但没有当前平台的安装包`,{tone:"warning",duration:6e3}):a.hasUpdate?u(`发现新版本 ${a.latest}`,{tone:"success",duration:4e3}):u(`已是最新版本（v${a.current}）`,{tone:"success",duration:3e3})}catch(a){u(`检查失败：${a?.message??a}`,{tone:"error",duration:6e3})}return}case"update-download":{if(!$()){u("浏览器预览模式无法下载更新",{tone:"warning",duration:3200});return}Pl().catch(a=>{u(`下载失败：${a?.message??a}`,{tone:"error",duration:7e3})});return}case"update-cancel":{const a=await Al();u(a?"已取消下载":"当前没有正在进行的下载",{duration:2600});return}case"update-install":{if(!$()){u("浏览器预览模式无法安装更新",{tone:"warning",duration:3200});return}const a=i.update?.pending;if(!a){u("还没有下载好可安装的更新",{tone:"warning",duration:3200});return}const r=!a.verified;j({title:r?"安装未校验的更新包？":"安装更新并重启？",desc:`即将安装 ${a.name}。程序会先退出，由引导脚本替换文件后自动重启。`+(a.verified?"安装包已通过 SHA-256 校验。":`注意：没有取到可用的 SHA-256 校验值${a.mirrorId?`（来源通道：${ls(a.mirrorId).name}）`:""}，无法确认它与官方发布的是同一份文件。建议取消后改用「直连 GitHub」重新下载，或到发布页手动下载。`),body:r?c`<label class="setting__hint">
              <input type="checkbox" data-field="confirmUnverified" />
              我确认这个安装包没有被校验过，并自行承担风险
            </label>`:x,danger:r,okText:r?"仍然安装并重启":"安装并重启",onOk:async o=>r&&!o.confirmUnverified?"请先勾选上面的确认项":await Ml()?(u("正在安装更新，程序即将重启…",{duration:4e3}),!0):(u(`安装失败：${i.update?.error||"未知原因"}`,{tone:"error",duration:7e3}),!1)});return}case"update-skip":{const a=String(t.dataset.version||"");await Il(a),u(a?`已跳过 ${a}，之后再提示更新的版本`:"已取消跳过，将重新提示该版本",{duration:3600});return}case"update-open-dir":{if(!$()){u("浏览器预览模式没有文件管理器",{tone:"warning",duration:3e3});return}try{await b.updateOpenDir()}catch(a){u(`打开更新目录失败：${a?.message??a}`,{tone:"error",duration:5e3})}return}case"update-channel":{const a=String(t.value||"auto");await El(a);const r=ls(a).name;u(`下载通道已设为「${r}」`,{duration:3e3});return}case"reset-main-window-geometry":{if(!$()){u("浏览器预览模式下没有独立窗口",{duration:2200});return}try{const a=await b.mainWindowResetGeometry();a&&a.ok===!1?u(`重置失败：${a.reason||"未知原因"}`,{tone:"error",duration:5e3}):u("窗口已移回屏幕中央并恢复默认大小",{tone:"success",duration:2400})}catch(a){u(`重置失败：${a?.message??a}`,{tone:"error",duration:5e3})}return}case"ai-field":{const a=t.dataset.key;if(!a)return;const r=t.value;if(a==="aiApiKey"&&r===(i.config?.aiApiKey??""))return;const o=mr();i.config[a]=r,e.commit?.(),!o&&mr()&&await Xp();return}case"add-folder":{if($()){let r=null;try{r=await b.addFolder("")}catch(o){u(`系统目录选择器不可用：${o?.message??o}`,{tone:"warning",duration:5e3}),r=null}if(r===null){const o=await br({manual:!0});if(!o)return;try{r=await b.addFolder(o)}catch(l){u(`添加失败：${l?.message??l}`,{tone:"error",duration:6e3});return}}if(r?.cancelled)return;if(r?.duplicated){u(`该文件夹已在曲库中：${r.path}`,{tone:"warning"});return}r?.folder?(i.folders=[...i.folders.filter(o=>o.id!==r.folder.id),r.folder],e.commit?.(),u(`已添加并开始扫描：${r.folder.path}`,{tone:"success"})):u("添加文件夹失败，请重试",{tone:"error",duration:6e3});return}const a=await br();if(!a)return;i.folders.push({id:Rn("folder"),path:a,trackCount:0,status:"ok",watching:i.config.watchFolders,addedAt:Date.now()}),e.commit?.(),u(`已添加文件夹：${a}`,{tone:"success"}),e.rescan?.();break}case"remove-folder":{const a=i.folders.find(r=>r.id===s);if(!a)return;j({title:"移除音乐文件夹？",desc:`${a.path}
仅从曲库中移除，不会删除任何本地文件。`,okText:"移除",danger:!0,onOk:async()=>($()&&await b.removeFolder(s),i.folders=i.folders.filter(r=>r.id!==s),e.commit?.(),u("已移除文件夹"),e.rescan?.({manual:!1}),!0)});break}case"scan-now":e.rescan?.({manual:!0});break;case"rescan-folder":u("正在重新扫描该文件夹…"),e.rescan?.({manual:!0});break;case"unplayable-toggle":Lr();break;case"unplayable-dismiss":await Tl(s);break;case"unplayable-restore":{const a=(i.unplayableFiles||[]).find(r=>r.songId===s);j({title:"重新扫描并放回曲库？",desc:`将清掉「${a?.title||s}」的失败记录，并重新扫描音乐文件夹。
如果文件确实已经修好，它就会回到曲库里。`,okText:"重新扫描",onOk:async()=>(await Cl(s),u("已重新扫描",{tone:"success"}),!0)});break}case"unplayable-clear":{const a=(i.unplayableFiles||[]).length;if(!a)break;j({title:`清空这 ${I(a)} 条记录？`,desc:"只清掉这张清单，不会改动任何文件，也不会让它们回到曲库。",okText:"清空",danger:!0,onOk:async()=>{const r=await xl();return u(`已清空 ${I(r)} 条记录`),!0}});break}case"rule-add":i.filterRules.push({id:Rn("rule"),type:"regex",op:"match",value:"",scope:"exclude",enabled:!0}),e.commit?.();break;case"rule-del":i.filterRules=i.filterRules.filter(a=>a.id!==s),e.commit?.(),e.refreshRules?.();break;case"rule-toggle":{const a=i.filterRules.find(r=>r.id===s);a&&(a.enabled=!a.enabled),e.commit?.(),e.refreshRules?.();break}case"rule-scope":{const a=i.filterRules.find(r=>r.id===s);a&&(a.scope=t.dataset.scope),e.commit?.(),e.refreshRules?.();break}case"rule-type":{const a=i.filterRules.find(r=>r.id===s);if(a){a.type=t.value==="regex"?"regex":"size";const r=["lt","lte","gt","gte","eq"];a.type==="regex"?a.op="match":r.includes(a.op)||(a.op="lt"),a.type==="size"&&!a.unit&&(a.unit="B")}e.commit?.(),e.refreshRules?.();break}case"rule-op":{const a=i.filterRules.find(r=>r.id===s);a&&(a.op=t.value),e.commit?.(),e.refreshRules?.();break}case"preset-small":i.filterRules.push({id:Rn("rule"),type:"size",op:"lt",value:"10240",unit:"B",scope:"exclude",enabled:!0}),e.commit?.(),e.refreshRules?.(),u("已添加：排除小于 10KB 的文件",{tone:"success"});break;case"preset-mp4":i.filterRules.push({id:Rn("rule"),type:"regex",op:"match",value:"\\.mp4$",scope:"exclude",enabled:!0}),e.commit?.(),e.refreshRules?.(),u("已添加：排除 .mp4 文件",{tone:"success"});break;case"theme-pick":{const r=En().find(o=>o.id===s);if(!r)return;i.config.theme=r.id,i.config.themeMode=r.mode,await Le(i.config),e.commit?.(),e.render?.(),u(`已切换到主题「${r.name}」`,{tone:"success",duration:1600});break}case"open-theme-dir":{if(!$()){u("主题目录：frontend/src/styles/themes/",{duration:3200});break}try{const a=await b.themeDir();await b.revealThemeDir(),u(a?`已打开主题目录：${a}`:"已打开主题目录",{duration:3200})}catch(a){u(`打开主题目录失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"theme-help":Hp(e);break;case"theme-remove":Kp(t,e);break;case"reload-themes":if($()){const a=await b.reloadThemes();await In(),await Le(i.config),e.commit?.(),u(`已重新扫描到 ${a?.length??0} 个主题`,{tone:"success"})}else u("浏览器预览模式下仅内置主题可用",{tone:"warning"});break;case"skin-pick":{const a=Vt().find(r=>r.id===s);if(!a)return;jt(a.id),e.commit?.(),e.render?.(),u(`播放界面已切换到「${a.name}」`,{tone:"success",duration:1600});break}case"open-skin-dir":{if(!$()){u("样式目录：frontend/packages/player-skins/",{duration:3200});break}try{const a=await b.skinDir();await b.revealSkinDir(),u(a?`已打开样式目录：${a}`:"已打开样式目录",{duration:3200})}catch(a){u(`打开样式目录失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"reload-skins":try{$()&&await b.reloadSkins(),await Ls(),jt(i.pvMode||i.config.playerViewMode||""),e.render?.();const a=Vt().length,r=Do();u(r.length?`已扫描到 ${a} 个样式，${r.length} 个加载失败`:`已扫描到 ${a} 个样式`,{tone:r.length?"warning":"success"})}catch(a){u(`重新扫描失败：${a?.message??a}`,{tone:"error"})}break;case"skin-help":Up(e);break;case"skin-remove":Vp(t,e);break;case"ai-vendor":{const a=String(t.value||"auto");if(a===(i.config.aiVendor||"auto"))break;i.config.aiVendor=a,e.commit?.(),e.render?.();const r=fo(a);u(`模型类型已设为「${iu(a)}」${r?"："+r:""}`,{duration:3600});break}case"loudness-refresh":{if(!$())return;await Ds();const a=await _n();e.commit?.(),u(`已重新获取响度数据（已测量 ${a?.measured??0} 首）`,{tone:"success"});break}case"loudness-clear":{if(!$())return;j({title:"清除响度测量数据？",desc:"只会删除测量缓存，不会动你的音乐文件。清除后再次启用响度均衡会重新测量。",okText:"清除",danger:!0,onOk:async()=>(await b.loudnessClear(),i.loudnessGains={},await _n(),e.commit?.(),e.render?.(),u("已清除响度测量数据",{tone:"success"}),!0)});break}case"loudness-target":{const a=Number(t.value),r=i.config.loudnessTarget;if(a===r)break;i.config.loudnessTarget=a,e.commit?.(),await ku(),await _n(),e.render?.(),u("目标响度已切换，响度数据将重新计算",{tone:"success",duration:3200});break}case"download-dir-pick":{if(!$()){u("浏览器预览无法调用系统目录选择器",{tone:"warning"});break}try{const a=await b.downloadPickDir();if(a?.cancelled)break;await fr(a,e)}catch(a){u(`无法更改下载位置：${a?.message??a}`,{tone:"error",duration:6e3})}break}case"download-dir-open":{if(!$())break;try{await b.downloadOpenDir(i.config.downloadDir||"")}catch(a){u(`打开失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"download-dir-reset":{if(!$())break;try{const a=await b.downloadSetDir("");if(a?.cancelled)break;const r=a?.next?a:await b.downloadSetDir("");await fr(r,e)}catch(a){u(`恢复默认失败：${a?.message??a}`,{tone:"error",duration:6e3})}break}case"cache-open-covers":case"cache-open-lyrics":{if(!$())break;try{await b.coverOpenCacheDir(n==="cache-open-covers"?"covers":"lyrics")}catch(a){u(`打开缓存目录失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"cover-refresh":{if(!$())break;try{const a=await b.coverClearCache();i.coverCache=await b.coverCacheStats(),await Ko(),e.commit?.(),e.render?.(),u(`已清空缓存（封面 ${a?.covers??0} 张、歌词 ${a?.lyrics??0} 份）`,{tone:"success"})}catch(a){u(`清空失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"embed-cache-write":await zo({ctx:e,force:!0});break}}async function zo({ctx:t={},force:e=!1}={}){if(!$()){e&&u("写入歌曲文件需要后端支持，浏览器预览不可用",{tone:"warning"});return}for(let a=0;a<20&&!i.coverCache;a++)await new Promise(r=>setTimeout(r,100));if(!i.coverCache&&e)try{i.coverCache=await b.coverCacheStats()}catch{}if(Fo()===0){e?u(i.coverCache?"缓存里还没有封面或歌词，暂时没有可写入的内容":"暂时读不到缓存统计，请稍后再试",{duration:3400}):i.coverCache&&u("已开启：以后下载 / 更换封面时会把封面与歌词写进歌曲文件",{duration:3600});return}const n=Number(i.coverCache?.covers)||0,s=Number(i.coverCache?.lyrics)||0;j({title:"要把已有的缓存写进歌曲文件吗？",body:c` <div class="setting__hint">
        缓存目录里已经有 <b>${I(n)}</b> 张封面、<b>${I(s)}</b> 份歌词。
        它们现在只放在缓存目录里；写进歌曲文件之后，把文件拷到别的播放器上也能看到。
      </div>
      <div class="setting__hint">
        写入只会在原文件的标签里做最小插入 / 替换（m4a 的 covr 与 ©lyr、FLAC 的 PICTURE 与 LYRICS），
        不动音频数据；mp3、wav、ogg 等格式会被跳过。这一步无法撤销，但不会影响播放。
      </div>`,okText:"写入文件",cancelText:"暂不写入",onOk:async()=>(await Wp(t),!0)})}async function Wp(t={}){const e=u("正在把缓存写入歌曲文件…",{duration:0}),n=U("meta:embed-progress",s=>{const a=Number(s?.done)||0,r=Number(s?.total)||0,o=s?.title?" · "+s.title:"";e.update(r?"正在写入歌曲文件 "+a+"/"+r+o:"正在把缓存写入歌曲文件…")});try{const s=await b.coverWriteCacheToFiles(),a=Number(s?.written)||0,r=Number(s?.skipped)||0,o=Number(s?.failed)||0,l=Number(s?.total)||0;if(e.close(),!l){u("缓存里还没有封面或歌词，暂时没有可写入的内容",{duration:3200});return}let d=`已写入 ${I(a)} 首`;s?.covers&&(d+=`（封面 ${I(s.covers)}）`),s?.lyrics&&(d+=`（歌词 ${I(s.lyrics)}）`),r&&(d+=`，跳过 ${I(r)} 首`),o&&(d+=`，失败 ${I(o)} 首`),u(d,{tone:o?"warning":r?"info":"success",duration:5200});const p=Array.isArray(s?.reasons)?s.reasons:[];p.length&&j({title:o?"部分歌曲没能写入":"部分歌曲已跳过",body:c`<div class="setting__hint setting__hint--steps">
          ${p.map((m,h)=>c`${h?c`<br />`:x}${m}`)}
        </div>`,okText:"知道了",cancelText:"关闭",onOk:()=>!0}),i.coverCache=await b.coverCacheStats(),t.commit?.(),t.render?.()}catch(s){e.close(),u(`写入失败：${s?.message??s}`,{tone:"error",duration:6e3})}finally{n()}}async function fr(t,e){if(!t||t.cancelled)return;const n=t.next;if(!n)return;if(t.same){u("这已经是当前的下载目录",{duration:2200});return}const s=Number(t.count)||0,a=((Number(t.bytes)||0)/1024/1024).toFixed(1),r=Number(t.nextCount)||0;if(s===0){await _a(n,!1,e);return}const o=c` <div class="setting__hint">
      当前下载目录里有 <b>${I(s)}</b> 首歌曲（约 ${a} MB）。 要一并搬到新目录吗？
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
    ${r?c`<div class="setting__hint">新目录里已经有 ${I(r)} 首歌曲，同名的不会被覆盖。</div>`:x}
    <div class="setting__hint">不迁移的话，旧目录里的歌曲会留在原地；新目录会成为新的默认保存位置。</div>`;j({title:"更改下载位置",body:o,okText:"迁移并更改",cancelText:"不迁移，只更改位置",onOk:async()=>(await _a(n,!0,e),!0),onCancel:async()=>{await _a(n,!1,e)}})}async function _a(t,e,n){try{const s=await b.downloadApplyDir(t,e);if(s?.dir&&(i.config.downloadDir=s.dir),n.commit?.(),n.render?.(),!e){u(`下载位置已改为：${s?.dir||t}`,{tone:"success",duration:3200});return}const a=Number(s?.migrated)||0,r=Number(s?.skipped)||0,o=Array.isArray(s?.failed)?s.failed:[];let l=`已迁移 ${I(a)} 首`;r&&(l+=`，跳过 ${I(r)} 首（新目录已有同名文件）`),o.length&&(l+=`，${I(o.length)} 首失败`),u(`${l}；新位置：${s?.dir||t}`,{tone:o.length?"warning":"success",duration:4200})}catch(s){u(`更改下载位置失败：${s?.message??s}`,{tone:"error",duration:6e3})}}async function Ko(){if(!$())return i.coverProviders=[],i.coverBreaker={},null;try{const t=await b.coverProviders();return i.coverProviders=Array.isArray(t?.providers)?t.providers:[],i.coverBreaker=t?.breaker&&typeof t.breaker=="object"?t.breaker:{},t}catch{return i.coverProviders=[],i.coverBreaker={},null}}let hr=!1;function Gp(){if(hr)return;hr=!0;const t=$()?b.coverCacheStats().then(e=>(i.coverCache=e,e)).catch(()=>null):Promise.resolve(null);Promise.all([Ko(),t]).then(()=>{ge()})}function mr(){const t=i.config||{},e=!!t.aiApiKeySet||!!String(t.aiApiKey||"").trim();return!!(String(t.aiBaseUrl||"").trim()&&e)}const jo="music-player.ai.notice.v1";function Yp(){try{return localStorage.getItem(jo)==="1"}catch{return!1}}async function Xp(){return Yp()?!1:new Promise(t=>{const e=()=>{try{localStorage.setItem(jo,"1")}catch{}t(!0)};j({title:"启用 AI 前请确认",desc:`歌曲信息会发往你填写的接口地址，而不是本机：${String(i.config?.aiBaseUrl||"").trim()}`,body:c`
        <div class="about-note">
          <div class="about-note__body">
            · 发送的内容：歌曲标题、歌手、专辑、时长，以及文件名（只有文件名，不含完整路径）。
          </div>
          <div class="about-note__body">· 不发：曲库列表、播放记录、文件路径、任何设备标识。</div>
          <div class="about-note__body">· 接口地址通常在境外：请自行确认该服务的隐私政策与数据处理方式。</div>
          <div class="about-note__body">· 随时可关：清空 Base URL / API Key，或关掉 AI 的两个开关。</div>
        </div>
      `,okText:"我已知晓，启用 AI",cancelText:"稍后再说",onOk:()=>(e(),!0),onCancel:()=>{t(!1)}})})}function br({manual:t=!1}={}){return new Promise(e=>{j({title:"添加音乐文件夹",desc:t?"系统目录选择器没能打开，请直接粘贴文件夹完整路径。":"浏览器预览模式下无法调用系统目录选择器，请手动输入路径。",body:c`<input class="input" data-field="path" type="text" placeholder="D:\\Music" />`,okText:"添加",onOk:n=>{const s=String(n.path||"").trim();return s?(e(s),!0):"请输入路径"}})})}function Qp(t,e={}){const n=t.dataset.toggle;if(n){const a=t.getAttribute("aria-checked")!=="true";return t.setAttribute("aria-checked",String(a)),n==="updateCheckOnStart"?(Dl(a).then(()=>e.commit?.()).catch(r=>{console.warn("[settings] 设置自动检查失败",r)}),!0):(n in i.config&&(i.config[n]=a,n==="animations"&&Dt("--dur",xa(i.config)),(n==="skipSilenceHead"||n==="skipSilenceTail")&&li(),n==="minimizeToTray"&&$()&&b.minimizeToTray(a).catch(r=>{console.warn("[settings] 同步托盘开关失败",r)}),n==="watchFolders"&&(i.folders.forEach(r=>r.watching=a),$()&&b.setWatchers(a).catch(r=>{console.warn("[settings] 切换实时监听失败",r)}))),e.commit?.(),n==="embedMeta"&&a&&zo(),!0)}const s=t.closest("[data-segment]")?.dataset.segment;if(s){const a=t.dataset.value;if(t.parentElement.querySelectorAll(".segmented__btn").forEach(r=>{r.setAttribute("aria-pressed",String(r===t))}),s==="themeMode"){i.config.themeMode=a;const r=En(),o=window.matchMedia("(prefers-color-scheme: dark)").matches,l=a==="system"?o?"dark":"light":a,d=r.find(p=>p.mode===l&&p.id!=="cover-dark")||r[0];i.config.theme=d.id,Le(i.config)}else if(s in i.config){const r=["lyricsLines","scanConcurrency"];i.config[s]=r.includes(s)?Number(a):a,s==="lyricsLines"&&Dt("--lyric-pad",`${50-Number(a)*4}%`),s==="animationsSpeed"&&Dt("--dur",xa(i.config)),s==="loudnessMode"&&Ds(),s==="windowCorners"&&$()&&b.setWindowCorners(a).catch(o=>{console.warn("[settings] 设置窗口圆角失败",o)})}return e.commit?.(),!0}return!1}function Jp(t,{silent:e=!1}={}){const n=t?.dataset?.id;if(!n)return;const s=i.config.rowClickAction||"next";if(s==="play"){Ca(n);return}if(s==="play-list"){const a=i.visibleSongs.map(r=>r.id);gt(a,Number(t.dataset.index),$n());return}Rr(n),e||u("已设为下一首播放",{tone:"success",duration:1500})}const ya=[{id:"album",label:"专辑",icon:"album",isOn:()=>i.config.showAlbumColumn!==!1,set:t=>{i.config.showAlbumColumn=t}}];function Zp(t,e){const n=[{kind:"label",label:"显示的列"}];for(const s of ya)n.push({id:`col-${s.id}`,label:s.label,icon:s.icon,checked:s.isOn()});n.push({kind:"sep"}),n.push({id:"col-reset",label:"恢复默认列",icon:"refresh"}),Bt({x:t,y:e,items:n,onPick:s=>{if(s==="col-reset"){for(const o of ya)o.set(!0);k(),u("已恢复默认列",{duration:1400});return}const a=ya.find(o=>`col-${o.id}`===s);if(!a)return;const r=!a.isOn();a.set(r),k(),u(r?`已显示「${a.label}」列`:`已隐藏「${a.label}」列`,{duration:1400})}})}function vr(t,e,n=null){const s=Ve(e);if(!s)return;const a=!!s.online,r=nt(e),o=i.queue.includes(e),l=[{id:"play",label:"播放",icon:"play"},{id:"play-next",label:"下一首播放",icon:"arrow-right"},{id:"sep1",kind:"sep"},{id:"queue-add",label:o?"从播放列表移除":"加入播放列表",icon:"queue"},{id:"like",label:r?"取消喜欢":"加入我喜欢",icon:"heart"},{id:"add-to",label:"加入歌单…",icon:"plus"}];if(a||l.push({id:"cover",label:"更换封面…",icon:"image"}),i.view==="queue")l.push({id:"sep2",kind:"sep"}),l.push({id:"remove-here",label:"从播放列表移除",icon:"trash",danger:!0});else if(i.view==="playlist"&&i.playlistId){const p=He(i.playlistId);p&&!p.locked&&(l.push({id:"sep2",kind:"sep"}),l.push({id:"remove-here",label:`从「${p.name}」移除`,icon:"trash",danger:!0}))}a||(l.push({id:"sep3",kind:"sep"}),l.push({id:"reveal",label:"在文件夹中显示",icon:"folder"}));const d=p=>{switch(p){case"play":{const m=i.visibleSongs.map(y=>y.id),h=m.indexOf(e);h<0?gt([e],0,{type:"online",id:null}):gt(m,h,$n());break}case"cover":_t(()=>Promise.resolve().then(()=>wi),void 0).then(m=>m.openCoverPanel(e));break;case"play-next":Rr(e),u("已设为下一首播放",{tone:"success",duration:1500});break;case"queue-add":o?(Ta(e),u("已从播放列表移除")):(Ll([e]),u("已加入播放列表",{tone:"success",duration:1500}));break;case"like":mt(e),u(r?"已从「我喜欢」移除":"已加入「我喜欢」",{tone:r?"info":"success",duration:1500});break;case"add-to":ef(e);break;case"remove-here":i.view==="queue"?(Ta(e),u("已从播放列表移除")):i.playlistId&&(Nr(i.playlistId,[e]),u("已从歌单移除"));break;case"reveal":_t(()=>import("./bridge-DjcT-EQ1.js").then(m=>m.q),[]).then(async m=>{try{await m.backend.revealInExplorer(s.path),u("已在文件夹中显示",{duration:1800})}catch(h){u(`无法在文件夹中显示：${h?.message??h}`,{tone:"error",duration:4e3})}});break}};if(n)Bt({x:n.x,y:n.y,items:l,onPick:d});else{const p=t.getBoundingClientRect();Bt({x:p.left,y:p.bottom+6,items:l,onPick:d,align:"right"})}}function ef(t){const e=i.playlists,{root:n}=j({title:"加入歌单",body:c`
      <div class="setting__hint">点击歌单即可把这首歌加进去。</div>
      <div class="u-row u-wrap">
        ${e.map(s=>c` <button class="btn btn--sm" type="button" data-pl=${s.id}>
              <svg aria-hidden="true"><use href="#i-${s.id===Gn?"heart":"playlist"}"></use></svg>
              <span>${s.name}</span>
            </button>`)}
      </div>
    `,okText:"完成",cancelText:"关闭",onOk:()=>!0});n.addEventListener("click",s=>{const a=s.target.closest("[data-pl]");a&&ys(a.dataset.pl,[t])})}const tf=1500,nf=140,sf=800,gr=new WeakMap,wa=new WeakMap;function af(t){t&&(clearTimeout(gr.get(t)),t.classList.remove("is-located"),t.offsetWidth,t.classList.add("is-located"),gr.set(t,window.setTimeout(()=>t.classList.remove("is-located"),tf)))}function Vo(t){if(!t)return;const e=(wa.get(t)??0)+1;wa.set(t,e);try{t.scrollIntoView({block:"nearest",inline:"nearest"})}catch{rf(t)}lf(t,()=>{wa.get(t)!==e||!t.isConnected||af(t)})}function rf(t){const e=t.closest(".content-body, .queue-panel__body");if(!e)return;const n=t.getBoundingClientRect(),s=e.getBoundingClientRect(),a=e.classList.contains("content-body")?50:8,r=s.top+a;n.top<r?e.scrollTop-=r-n.top:n.bottom>s.bottom&&(e.scrollTop+=n.bottom-s.bottom)}function of(t){let e=t.parentElement;for(;e&&e!==document.documentElement;){const{overflowY:n}=getComputedStyle(e);if(n==="auto"||n==="scroll"||n==="overlay")return e;e=e.parentElement}return null}function lf(t,e){const n=of(t);if(!n){requestAnimationFrame(e);return}let s=!1,a=0,r=0,o=n.scrollTop,l=n.scrollLeft,d=performance.now();const p=()=>{s||(s=!0,cancelAnimationFrame(a),clearTimeout(r),n.removeEventListener("scrollend",p),e())},m=()=>{const h=n.scrollTop,y=n.scrollLeft;if((h!==o||y!==l)&&(o=h,l=y,d=performance.now()),performance.now()-d>=nf){p();return}a=requestAnimationFrame(m)};n.addEventListener("scrollend",p),a=requestAnimationFrame(m),r=window.setTimeout(p,sf)}function cf(t){const e=i.currentId;if(!e)return null;const n=t.querySelector(`.track[data-id="${CSS.escape(e)}"]`);return n?{el:n}:null}function df(){const t=i.currentId;return t&&document.querySelector("#queue-panel-body")?.querySelector(`.queue-item[data-queue-id="${CSS.escape(t)}"]`)||null}function uf({notify:t=!0}={}){if(!i.currentId)return t&&u("当前没有正在播放的歌曲",{tone:"info",duration:1600}),!1;const e=document.getElementById("content-body"),n=e?cf(e):null;return n?(Vo(n.el),!0):(t&&u("当前播放的歌曲不在这个列表里",{tone:"info",duration:2200}),!1)}function Wo({notify:t=!0}={}){if(!i.queue.length)return t&&u("播放列表是空的",{tone:"info",duration:1600}),!1;const e=df();return e?(Vo(e),!0):(t&&u("当前播放的歌曲不在播放列表里",{tone:"info",duration:2200}),!1)}let Go=0;function Yo(){Go=Date.now()}function Xo(){return Date.now()-Go<260}function pf(t=!1){const e=i.visibleSongs.map(n=>n.id);if(e.length){if(t)for(let n=e.length-1;n>0;n-=1){const s=Math.floor(Math.random()*(n+1));[e[n],e[s]]=[e[s],e[n]]}gt(e,0,$n()),u(t?"已随机播放":`开始播放 ${I(e.length)} 首`,{duration:1600})}}const ff={library:"本地歌曲",queue:"播放列表",playlist:"歌单"},hf=120;function mf(){let t=null;const e=()=>{t!==null&&(clearTimeout(t),t=null,k())},n=()=>{t!==null&&clearTimeout(t),t=setTimeout(e,hf)};return n.flush=e,n}const bf={commit:k,rescan:()=>xn({manual:!0})};class vf extends fe{static deps=e=>[e.view,e.playlistId,e.playlistVersion,e.query,e.visibleVersion,e.visibleSongs.length,e.sortKey,e.sortDir,e.songs.length,e.folders.length,e.scanning,e.playlistSelecting,e.selectedIds,e.lastScan?.at??0,e.config.listDensity];constructor(){super(),this._commitFilter=mf()}onDisconnected(){this._commitFilter?.flush?.()}render(){const e=i.view,n=e==="playlist"?He(i.playlistId):null;return c`
      <main class="main" id="main" @click=${s=>this.onMainClick(s)}>
        <div class="content-header" id="content-header" @click=${s=>this.onHeaderClick(s)}>
          <div class="content-header__titles">
            <h1 class="content-header__title" id="content-title">
              ${e==="playlist"&&n?n.name:ff[e]||"本地歌曲"}
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
                ${i.query.trim()?`匹配 ${I(i.visibleSongs.length)} 首`:""}
              </span>
            </div>
            <div class="content-header__tools" id="content-tools">${this.toolbar()}</div>
          </div>
        </div>
        <div class="content-body" id="content-body">${this.body()}</div>
      </main>
    `}subtitle(e,n){const s=i.visibleSongs,a=s.reduce((r,o)=>r+o.duration,0);if(e==="library"){const r=i.lastScan;return`${I(s.length)} 首 · 共 ${Bs(a)} · ${I(i.folders.filter(o=>o.id!=="auto_downloads").length)} 个文件夹${r&&r.excluded?` · 已过滤 ${I(r.excluded)} 个文件`:""}`}if(e==="queue"){const r=i.currentId?s.findIndex(o=>o.id===i.currentId):-1;return`${I(s.length)} 首 · 共 ${Bs(a)}${r>=0?` · 正在播放第 ${r+1} 首`:""}`}return e==="playlist"&&n?`${I(n.songIds.length)} 首 · 共 ${Bs(a)} · ${n.locked?"默认歌单（不可删除）":"自定义歌单"}`:e==="playlist"?"歌单不存在":""}toolbar(){const e=i.view,n=c`<button class="btn btn--primary" type="button" data-tool="play-all">
      ${f("play")}<span>播放全部</span>
    </button>`,s=c`<button
      class="btn btn--icon"
      type="button"
      data-tool="locate"
      data-tip="定位到当前播放"
      aria-label="定位到当前播放"
    >
      ${f("disc")}
    </button>`,a=Si(i.sortKey),r=c`
      <button
        class="btn btn--sort"
        type="button"
        data-tool="sort"
        data-dir=${i.sortDir}
        data-tip="排序方式"
        aria-haspopup="menu"
        aria-label="排序方式：${a?.label??"添加时间"}，${Rl(i.sortDir)}"
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
          <span class="toolbar__selinfo">已选 ${I(o)} 首</span>
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
    `}body(){const e=i.view;if(!i.visibleSongs.length){const n=i.query.trim()?"search":e==="library"?"library":e==="queue"?"queue":"playlist";return this.empty(n)}return au(`${e}|${i.playlistId??""}`,c`<div class="page"><mp-track-table></mp-track-table></div>`)}empty(e){const n={library:{icon:"music",title:"曲库还没有歌曲",desc:"在设置里添加本地音乐文件夹，程序会自动扫描并监听这些文件夹的变化。",ok:"添加音乐文件夹",act:"add-folder"},queue:{icon:"queue",title:"播放列表是空的",desc:"从「本地歌曲」或任意歌单里选择歌曲加入播放列表。",ok:"去本地歌曲",act:"goto-library"},playlist:{icon:"playlist",title:"这个歌单还没有歌曲",desc:"在「本地歌曲」里点击每首歌后面的爱心或更多菜单，把歌曲加进来。",ok:"去本地歌曲",act:"goto-library"},search:{icon:"search",title:"没有找到匹配的歌曲",desc:"换个关键词试试，或清空搜索框。",ok:"清空搜索",act:"clear-search"}},s=n[e]||n.library;return c`
      <div class="empty" data-empty=${e}>
        <svg class="empty__art" aria-hidden="true"><use href="#i-${s.icon}"></use></svg>
        <div class="empty__title">${s.title}</div>
        ${s.desc?c`<div class="empty__desc">${s.desc}</div>`:x}
        ${s.ok?c`<div class="empty__actions">
                <button class="btn btn--primary" type="button" data-empty-act=${s.act}>${s.ok}</button>
              </div>`:x}
      </div>
    `}async onMainClick(e){const n=e.target.closest("[data-empty-act]")?.dataset.emptyAct;n&&(n==="add-folder"?await Wa({dataset:{act:"add-folder"}},bf):n==="goto-library"?Mt("library"):n==="clear-search"&&js())}async onHeaderClick(e){const n=e.target.closest("[data-tool]")?.dataset.tool;n&&await this.handleTool(n)}openSortMenu(){const e=this.querySelector('[data-tool="sort"]'),n=[{id:"hdr-field",kind:"label",label:"排序方式"},...Nl.map(s=>({id:`field:${s.key}`,label:s.label,checked:s.key===i.sortKey})),{id:"sep-dir",kind:"sep"},{id:"hdr-dir",kind:"label",label:"排列顺序"},{id:"dir:asc",label:"升序",checked:i.sortDir==="asc"},{id:"dir:desc",label:"降序",checked:i.sortDir==="desc"}];Bt({anchor:e,align:"left",items:n,onPick:s=>{if(s.startsWith("field:")){const a=s.slice(6);if(a===i.sortKey){u(`已经按「${Si(a)?.label??a}」排序`,{duration:1400});return}ql(a);return}if(s.startsWith("dir:")){const a=s.slice(4);if(a===i.sortDir)return;Bl(a)}}})}async handleTool(e){switch(e){case"rescan":xn({manual:!0});break;case"sort":this.openSortMenu();break;case"play-all":pf(!1);break;case"locate":uf();break;case"queue-clear":qr(),u("播放列表已清空");break;case"pl-select":xi(!i.playlistSelecting);break;case"pl-add":i.playlistId&&tu(i.playlistId);break;case"sel-all":{const n=i.visibleSongs.length>0&&i.visibleSongs.every(s=>i.selectedIds.has(s.id));Fl(n?[]:i.visibleSongs.map(s=>s.id));break}case"sel-remove":{const n=[...i.selectedIds];if(!n.length)break;const s=He(i.playlistId),a=Nr(i.playlistId,n);xi(!1),u(`已从「${s?.name??"歌单"}」移除 ${I(a)} 首`,{tone:"success"});break}}}}ee("mp-content",vf);const gf=Za(class extends ei{render(){return Ct}update(t,[e]){const n=t.element;if(!n)return Ct;jl(n);const s=e||Ss;if(n.getAttribute("src")===s)return Ct;if(s.startsWith("data:"))return n.src=s,Ct;n.__coverWant=s;const a=new Image;a.decoding="async";const r=()=>{n.__coverWant===s&&(n.src=s)};return a.addEventListener("load",r),a.addEventListener("error",r),a.src=s,Ct}}),yi=t=>gf(t);class _f extends fe{static deps=e=>[e.view,e.playlistId,e.visibleVersion,e.sortKey,e.sortDir,e.config.listDensity,e.config.showAlbumColumn,e.playlistSelecting,e.selectedIds,e.currentId,e.playing,e.likedIds,Tn(),e.visibleSongs.length,Ul()];get mode(){return i.view==="queue"?"playlist":"library"}get selecting(){return i.view==="playlist"&&i.playlistSelecting}updated(){i.view==="queue"?this.bindQueueSort():this._sortable&&(this._sortable.destroy(),this._sortable=null)}disconnectedCallback(){this._sortable?.destroy(),this._sortable=null,super.disconnectedCallback()}bindQueueSort(){const e=this.querySelector(".tracks__body");e&&(this._sortable&&this._sortable.el===e||(this._sortable?.destroy(),this._sortable=T.create(e,{handle:"[data-handle]",draggable:".track",animation:0,ghostClass:"is-dragging",chosenClass:"is-dragging",onEnd:n=>{Yo();const s=n.oldIndex,a=n.newIndex;if(s==null||a==null||s===a)return;const r=n.from,o=Array.from(r.children).filter(l=>l!==n.item);r.insertBefore(n.item,o[s]??null),Br(s,a),u("已调整播放顺序 · 播放模式已切回列表循环",{duration:1800})}})))}render(){const e=this.mode,n=i.visibleSongs;return c`
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
          ${Te(n,s=>s.id,(s,a)=>this.rowTemplate(s,a,e))}
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
    `}rowTemplate(e,n,s){const a=this.selecting,r=e.id===i.currentId,o=nt(e.id),l=a&&i.selectedIds.has(e.id);return c`
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
          <img src=${yi(wt(e))} alt="" loading="lazy" draggable="false" />
        </div>
        <div class="track__main">
          <div class="track__title" data-new=${Hl(e.id)?"1":x}>${e.title}</div>
          <div class="track__sub">
            <span class="track__artist">${e.artist}</span>
            <span class="track__tag">${e.ext}</span>
          </div>
        </div>
        <div class="track__album u-ellipsis">${e.album}</div>
        <div class="track__time">${At(e.duration)}</div>
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
    `}onClick(e){if(Xo())return;const n=e.target.closest(".track");if(n&&i.view==="playlist"&&i.playlistSelecting){e.preventDefault(),zl(n.dataset.id);return}const s=e.target.closest("[data-sort]");if(s){Kl(s.dataset.sort);return}const a=e.target.closest("[data-act]");if(!a){const l=e.target.closest(".track");l&&Jp(l,{silent:!1});return}const r=a.closest(".track"),o=r?.dataset.id;if(o)switch(a.dataset.act){case"play":{const l=i.visibleSongs.map(d=>d.id);gt(l,Number(r.dataset.index),$n());break}case"like":{mt(o);const l=nt(o);u(l?"已加入「我喜欢」":"已从「我喜欢」移除",{tone:l?"success":"info",duration:1500});break}case"more":vr(a,o);break}}onDblClick(e){if(i.view==="playlist"&&i.playlistSelecting)return;const n=e.target.closest(".track");if(!n)return;const s=i.visibleSongs.map(a=>a.id);gt(s,Number(n.dataset.index),$n()),i.playerOpen=!0,i.pvMode=i.config.playerViewMode,k()}onContextMenu(e){if(e.target.closest(".tracks__head")){e.preventDefault(),Zp(e.clientX,e.clientY);return}const s=e.target.closest(".track");s&&(e.preventDefault(),vr(null,s.dataset.id,{x:e.clientX,y:e.clientY}))}}ee("mp-track-table",_f);class yf extends fe{static deps=e=>[e.playerOpen,e.pvMode,e.currentId,e.playing,e.duration,e.config.showLyrics,e.config.coverCarousel,e.config.coverCarouselInterval,Tn(),Po()];onConnected(){this._unsubscribers.push(Cs(()=>dr()))}updated(){dr()}render(){const e=ze(),s=this.coverList(e).length>1,a=i.config.coverCarousel===!0&&s,r=!e||!!e.online,o=Vt();return c`
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
          <button class="playerview__back" id="btn-player-back" type="button" @click=${()=>Rs()}>
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
            ${Te(o,l=>l.id,l=>c`
                <button
                  class="viewmode__btn"
                  type="button"
                  data-pv-skin=${l.id}
                  data-pv-mode=${l.id}
                  aria-pressed=${String(i.pvMode===l.id)}
                  data-tip=${l.name||l.id}
                  aria-label=${l.name||l.id}
                  @click=${()=>jt(l.id)}
                >
                  ${this.skinIcon(l)}
                </button>
              `)}
          </div>
        </div>
        <div
          class="playerview__stage"
          id="playerview-stage"
          @click=${l=>{l.target.closest(".disc__label, .disc__platter")&&gp()}}
        ></div>
      </section>
    `}skinIcon(e){return e.iconUrl?c`<i class="skin-icon" style=${`--skin-icon:${Dr(e.iconUrl)}`}></i>`:f(e.icon||"disc")}coverList(e){if(!e)return[];const n=i.coverSets.get(e.id)?.items;return Array.isArray(n)?n.filter(s=>s?.preview):[]}carouselTip(e,n){if(!e)return"这首歌只有一张封面";const s=Number(i.config.coverCarouselInterval)||10;return n?"关闭封面轮播":`开启封面轮播（每 ${s} 秒换一张）`}openCoverPanel(e){!e||e.online||_t(()=>Promise.resolve().then(()=>wi),void 0).then(n=>n.openCoverPanel(e.id))}toggleCarousel(){i.config.coverCarousel=!i.config.coverCarousel,k(),u(i.config.coverCarousel?`已开启封面轮播（每 ${Number(i.config.coverCarouselInterval)||10} 秒换一张）`:"已关闭封面轮播",{duration:1600})}}ee("mp-playerview",yf);function Wt(t,e={}){const n=e.min??0,s=e.max??1,a=e.step??.001;let r=ut(e.value??n,n,s),o=!1;const l=t.querySelector(".slider__fill"),d=t.querySelector(".slider__thumb"),p=t.querySelector(".slider__bubble");t.setAttribute("aria-valuemin",String(n)),t.setAttribute("aria-valuemax",String(s));function m(){const v=s===n?0:(r-n)/(s-n)*100;l&&(l.style.transform=`scaleX(${v/100})`),d&&(d.style.left=`${v}%`),p&&e.format&&(p.textContent=e.format(r)),t.setAttribute("aria-valuenow",String(Math.round(v)))}function h(v){const C=t.getBoundingClientRect();if(C.width<=0)return r;const q=ut((v.clientX-C.left)/C.width,0,1),F=n+q*(s-n),z=Math.round(F/a)*a;return ut(Number(z.toFixed(6)),n,s)}function y(v){if(!p)return;const C=t.getBoundingClientRect(),q=ut(v.clientX-C.left,0,C.width);p.style.left=`${q}px`}t.addEventListener("pointerdown",v=>{t.dataset.disabled!=="true"&&(v.preventDefault(),o=!0,t.dataset.dragging="true",t.setPointerCapture?.(v.pointerId),r=h(v),m(),y(v),e.onChange?.(r))}),t.addEventListener("pointermove",v=>{y(v),o&&(r=h(v),m(),e.onChange?.(r))});const S=v=>{o&&(o=!1,t.dataset.dragging="false",t.releasePointerCapture?.(v.pointerId),e.onCommit?.(r))};return t.addEventListener("pointerup",S),t.addEventListener("pointercancel",S),t.addEventListener("keydown",v=>{if(t.dataset.disabled==="true")return;const C=(s-n)/10,q=a*10;let F=r;switch(v.key){case"ArrowRight":case"ArrowUp":F=r+q;break;case"ArrowLeft":case"ArrowDown":F=r-q;break;case"PageUp":F=r+C;break;case"PageDown":F=r-C;break;case"Home":F=n;break;case"End":F=s;break;default:return}v.preventDefault(),r=ut(Number(F.toFixed(6)),n,s),m(),e.onChange?.(r),e.onCommit?.(r)}),m(),{get value(){return r},set(v,{silent:C=!1}={}){const q=ut(v,n,s);q===r&&!C||(r=q,m(),C||e.onChange?.(r))},setDisabled(v){t.dataset.disabled=v?"true":"false"},text(v=r){return e.format?e.format(v):String(v)},paint:m}}const $a={sequence:{icon:"repeat",label:"列表循环"},"loop-all":{icon:"repeat",label:"列表循环"},"loop-one":{icon:"repeat-one",label:"单曲循环"},shuffle:{icon:"shuffle",label:"随机播放"}};function Qo(t){const e=typeof t=="boolean"?t:!i.queueOpen;i.queueOpen=e,e&&(i.optionsOpen=!1),k()}function Jo(t){const e=typeof t=="boolean"?t:!i.optionsOpen;i.optionsOpen=e,e&&(i.queueOpen=!1),k()}function Zo(t){const e=typeof t=="boolean"?t:!i.sleepOpen;i.sleepOpen=e,k()}function wf(t){const e=Math.round(Number(t)||0);if(e<=0){el("已取消定时停止");return}i.sleepTimer={type:"duration",until:Date.now()+e*6e4,minutes:e},k(),u(`${e} 分钟后停止播放`,{duration:1800})}function el(t){i.sleepTimer=null,k(),u(t,{duration:1400})}function $f(t){i.config.sleepAfterSong=!!t,k(),u(i.config.sleepAfterSong?"已开启：倒计时结束后等当前歌曲播完再停":"已关闭：倒计时结束后立即停止",{duration:2200})}function kf(){const t=i.sleepTimer;if(!(t?.type!=="duration"||Date.now()<t.until)){if(i.config.sleepAfterSong===!0&&i.playing&&i.currentId){i.sleepTimer={type:"after-song"},k(),u("定时到点：等这首播完就停",{duration:2400});return}i.sleepTimer=null,i.playing?Gt():k(),u("已按定时停止播放",{duration:1800})}}class Sf extends fe{static deps=e=>[e.currentId,e.playing,e.duration,e.volume,e.muted,e.playMode,e.likedIds,e.queue.length,e.queueOpen,e.optionsOpen,e.sleepOpen,e.sleepTimer,e.lyricsOpen,Tn()];constructor(){super(),this._progress=null,this._volume=null,this._tick=null}onConnected(){this._tick=setInterval(()=>{i.sleepTimer&&this.requestUpdate()},1e3),this._unsubscribers.push(Cs(()=>{this.isConnected&&this.paintProgress()}))}onDisconnected(){this._tick&&clearInterval(this._tick),this._tick=null}paintProgress(){if(vu()){const r=this.querySelector("#time-current");r&&r.textContent!=="--:--"&&(r.textContent="--:--"),this._progress?.set(0,{silent:!0}),this._progress?.setDisabled(!0);return}const e=Math.round(i.position),n=Math.round(i.duration||0),s=this.querySelector("#time-current");if(s){const r=At(i.position);s.textContent!==r&&(s.textContent=r)}const a=this.querySelector("#progress");a&&a.dataset.dragging!=="true"&&n>0&&this._progress?.set(e/n*1e3,{silent:!0}),this._progress?.setDisabled(n<=0)}firstUpdated(){const e=this.querySelector("#progress");this._progress=Wt(e,{min:0,max:1e3,step:1,value:0,format:n=>At(n/1e3*(i.duration||0)),onChange:n=>{i.duration&&(i.position=n/1e3*i.duration,this.requestUpdate())},onCommit:n=>{i.duration&&Ee(n/1e3*i.duration)}}),this._volume=Wt(this.querySelector("#volume"),{min:0,max:1,step:.01,value:i.volume,format:n=>`${Math.round(n*100)}`,onChange:n=>{Ea(n),qa(),this.requestUpdate()}})}updated(){this.paintProgress();const e=i.muted?0:i.volume,n=this.querySelector("#volume");n&&n.dataset.dragging!=="true"&&this._volume?.set(e,{silent:!0}),kf()}render(){const e=ze(),n=i.currentId?nt(i.currentId):!1,s=$a[i.playMode]||$a.sequence,a=i.muted?0:i.volume,r=a===0?"volume-mute":a<.5?"volume-low":"volume-high",o=e?wt(e):"",l=i.sleepTimer,d=l?.type==="duration"?Math.max(1,Math.ceil((l.until-Date.now())/6e4)):0;return c`
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
          <span class="progress__time progress__time--total" id="time-total">${At(i.duration)}</span>
        </div>

        <div class="playerbar__row">
          <div class="playerbar__now">
            <button
              class="playerbar__cover"
              id="bar-cover"
              type="button"
              data-tip="播放详情页"
              aria-label="播放详情页"
              @click=${()=>Va()}
            >
              <img id="bar-cover-img" alt=${e?`${e.title} 封面`:""} src=${yi(o)} />
              <svg class="playerbar__cover-icon"><use href="#i-expand"></use></svg>
            </button>
            <div class="playerbar__meta" id="bar-meta" data-tip="播放详情页" @click=${()=>Va()}>
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
              @click=${p=>this.openAddToPlaylistMenu(p.currentTarget)}
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
                @click=${()=>Ja()}
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
                @click=${()=>Ft(!1)}
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
                @click=${()=>{Vl(),qa()}}
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
              @click=${()=>{Wl(),u(($a[i.playMode]||s).label,{duration:1400})}}
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
              @click=${()=>xo()}
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
              @click=${()=>Zo()}
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
              @click=${()=>Jo()}
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
              @click=${()=>{xf()}}
            >
              ${f("playlist")}
              <span class="mode-btn__badge" id="queue-count"
                >${i.queue.length===0?"":i.queue.length>99?"99+":String(i.queue.length)}</span
              >
            </button>
          </div>
        </div>
      </footer>
    `}sleepTip(e){return e?.type==="duration"?`定时停止 · 剩余 ${Math.max(0,Math.round((e.until-Date.now())/1e3))} 秒`:e?.type==="after-song"?"定时停止 · 播完当前歌曲":"定时停止"}onLike(){if(!i.currentId)return;mt(i.currentId);const e=nt(i.currentId);u(e?"已加入「我喜欢」":"已从「我喜欢」移除",{tone:e?"success":"info",duration:1500})}openAddToPlaylistMenu(e){const n=ze();if(!n){u("还没有正在播放的歌曲",{duration:1600});return}const s=[];for(const a of i.playlists.filter(r=>!r.locked))s.push({id:a.id,label:a.name,icon:a.id==="liked"?"heart":"playlist",checked:a.songIds.includes(n.id)});s.length||s.push({id:"__none",label:"还没有可用的歌单",disabled:!0}),s.push({id:"__sep",kind:"sep"}),s.push({id:"__new",label:"新建歌单…",icon:"plus"}),Bt({anchor:e,x:0,y:0,align:"right",items:s,onPick:async a=>{if(!(a==="__none"||a==="__sep")){if(a==="__new"){po(r=>{r&&ys(r.id,[n.id])});return}ys(a,[n.id])}}})}}function xf(){const t=i.queueOpen;Qo(),!t&&i.currentId&&Cf(()=>Wo({notify:!1}))}function Cf(t){let e=null,n=!1,s=0;const a=()=>{n||(n=!0,clearTimeout(s),e?.removeEventListener("transitionend",r),i.queueOpen&&t())},r=o=>{o.target===e&&a()};requestAnimationFrame(()=>{if(e=document.getElementById("queue-panel"),!e||e.hidden){a();return}e.addEventListener("transitionend",r),s=window.setTimeout(a,Tf(e)+80)})}function Tf(t){let e=0;for(const n of getComputedStyle(t).transitionDuration.split(",")){const s=n.trim(),a=parseFloat(s);Number.isFinite(a)&&(e=Math.max(e,s.endsWith("ms")?a:a*1e3))}return e}ee("mp-playerbar",Sf);let Ga="";function Pn(){return i.config.showDesktopLyrics===!0}async function _r(t,{force:e=!1}={}){const n=!!t,s=Pn()!==n;if(i.config.showDesktopLyrics=n,Ga="",!s&&!e)return ge(),{ok:!0,enabled:n,unchanged:!0};if(!$())return Ns({enabled:n}),{ok:!0,preview:!0,enabled:n};try{const a=await b.desktopLyrics(n);return n&&a?.ok===!1&&(i.config.showDesktopLyrics=!1,ge()),a}catch(a){return console.warn("[desktop-lyrics] 打开/关闭桌面歌词失败",a),i.config.showDesktopLyrics=!1,ge(),{ok:!1,enabled:n,error:String(a?.message??a)}}}function Ef({text:t="",trans:e=[],chars:n=[],words:s=[],wordEnds:a=[],posMs:r=0,atMs:o=0,playing:l=!1,fontSize:d=26}={}){if(!Pn())return;const p=Array.isArray(s)&&s.length>1,m=[t,l?1:0,Math.round(d),p?s.join(","):"",p?Math.round(r/250):""].join("|");if(m!==Ga){if(Ga=m,!$()){Ns({text:t,playing:l});return}b.updateDesktopLyrics({text:t,trans:e,chars:p?n:[],words:p?s:[],wordEnds:p?a:[],posMs:Math.round(r),atMs:Math.round(o),playing:l,fontSize:d}).catch(h=>{console.warn("[desktop-lyrics] 同步歌词失败",h?.message??h)})}}function Ns({text:t="",playing:e=!1,enabled:n=null}={}){const s=n===null?Pn():!!n,a=!$()&&s&&e&&!!t;i.floatingLyrics={show:a,text:t},ge()}function qs(){return i.config.showDesktopWallpaper===!0}function ka(){ge()}async function If(){if(!$())return!0;let t=!0,e="";try{const n=await b.desktopWallpaperState();t=n?.supported!==!1,e=n?.reason||""}catch(n){return console.info("[desktop-wallpaper] 能力探测失败",n?.message??n),!0}return t?!0:(i.desktopWallpaperSupport={supported:!1,reason:e||"当前系统不支持桌面背景歌词"},ge(),!1)}async function yr(t,{force:e=!1}={}){const n=!!t,s=qs()!==n;if(i.config.showDesktopWallpaper=n,ka(),!s&&!e)return{ok:!0,enabled:n,unchanged:!0};if(!$())return n?(Ya(),{ok:!0,preview:!0,enabled:n}):(Ns({enabled:!1}),{ok:!0,preview:!0,enabled:n});try{const a=await b.desktopWallpaper(n);return n&&a?.ok===!1?(i.config.showDesktopWallpaper=!1,ka(),k()):n&&(Af(),Ya()),a}catch(a){return console.warn("[desktop-wallpaper] 打开/关闭桌面背景歌词失败",a),i.config.showDesktopWallpaper=!1,ka(),k(),{ok:!1,enabled:n,error:String(a?.message??a)}}}const D={setup:"",songId:"\0",cover:"\0",lyricsText:"\0",lyricsStatus:"\0",options:"",playing:null,volume:null,muted:null,duration:-1,lyricIndex:-2,position:-1,progressPlaying:null};function Af(){D.setup="",D.songId="\0",D.cover="\0",D.lyricsText="\0",D.options="",D.playing=null,D.volume=null,D.muted=null,D.duration=-1,D.lyricIndex=-2,D.position=-1,D.progressPlaying=null}function Df(){const t=[],e=Mf();e.signature!==D.setup&&(D.setup=e.signature,t.push({type:"theme",skinId:e.skinId,themeId:e.theme,theme:e.theme,mode:e.mode,density:e.density,tokens:e.tokens}));const n=cp(),s=Ro(),a=dp({interactive:!1}),r=n.song?.id??"";r!==D.songId?(D.songId=r,D.cover=n.cover,D.lyricsText=n.lyrics.text,D.lyricIndex=n.lyrics.index,D.duration=s.duration,D.progressPlaying=s.playing,t.push({type:"song",song:n.song,cover:n.cover,covers:n.covers,coverIndex:n.coverIndex,lyrics:n.lyrics})):(n.cover!==D.cover&&(D.cover=n.cover,t.push({type:"media",cover:n.cover,covers:n.covers,coverIndex:n.coverIndex})),(n.lyrics.text!==D.lyricsText||n.lyrics.status!==D.lyricsStatus)&&(D.lyricsText=n.lyrics.text,D.lyricsStatus=n.lyrics.status,D.lyricIndex=n.lyrics.index,t.push({type:"lyrics",lyrics:n.lyrics})));const o=JSON.stringify(a);return o!==D.options&&(D.options=o,t.push({type:"options",options:a})),(s.playing!==D.playing||s.volume!==D.volume||s.muted!==D.muted)&&(D.playing=s.playing,D.volume=s.volume,D.muted=s.muted,t.push({type:"state",playing:s.playing,volume:s.volume,muted:s.muted})),(s.position!==D.position||n.lyrics.index!==D.lyricIndex||s.duration!==D.duration||s.playing!==D.progressPlaying)&&(D.position=s.position,D.lyricIndex=n.lyrics.index,D.duration=s.duration,D.progressPlaying=s.playing,t.push({type:"progress",position:s.position,duration:s.duration,playing:s.playing,lyricIndex:n.lyrics.index})),t}function Ya(){if(qs()){if(!$()){const t=np();Ns({text:t.text,playing:Ro().playing});return}for(const t of Df())b.updateDesktopWallpaper(t).catch(e=>{console.warn("[desktop-wallpaper] 同步背景歌词失败",e?.message??e)})}}function Mf(){const t=Of(),e=i.pvMode||i.config.playerViewMode||"",n=document.documentElement.dataset.theme||"",s=document.documentElement.dataset.mode||"dark",a=document.documentElement.dataset.density||"";return{skinId:e,theme:n,mode:s,density:a,tokens:t.values,signature:[e,n,s,a,t.signature].join("|")}}function Pf(){const t=i.config||{};return[document.documentElement.dataset.theme||"",document.documentElement.dataset.mode||"",document.documentElement.dataset.density||"",t.glassBlurCustom?t.glassBlur:"",t.glassAlphaCustom?t.glassAlpha:"",t.accentFromCover?1:0,t.coverSeed||"",t.coverSeed2||"",t.animations===!1?0:1,t.animationsSpeed||"",t.lyricsFontSize,t.listDensity||""].join("|")}let wr="\0",$r={};function Of(){const t=Pf();return t!==wr&&(wr=t,$r=Lf()),{signature:t,values:$r}}function Lf(){const t=new Set(Object.keys(Gl()));for(const s of document.styleSheets){let a=null;try{a=s.cssRules}catch{continue}tl(a,t,0)}const e=getComputedStyle(document.documentElement),n={};for(const s of t){const a=e.getPropertyValue(s).trim();!a||/[;{}]/.test(a)||(n[s]=a)}return n}function tl(t,e,n){if(!(!t||n>3))for(const s of t){if(s.style)for(const a of s.style)a.startsWith("--")&&e.add(a);s.cssRules&&tl(s.cssRules,e,n+1)}}const Q=Object.freeze({off:"off",lyrics:"lyrics",wallpaper:"wallpaper"});function Xa(){return i.config.showDesktopWallpaper===!0?Q.wallpaper:i.config.showDesktopLyrics===!0?Q.lyrics:Q.off}async function Rf(t){const e=Nf(t),n=Xa();if(e===n)return{ok:!0,mode:e,unchanged:!0};const s=await kr(e);return s?.ok!==!1?{ok:!0,...s,mode:e}:n!==Q.off&&(await kr(n))?.ok!==!1?{ok:!1,...s,mode:n,restored:!0}:{ok:!1,...s,mode:Q.off}}async function kr(t){return t!==Q.lyrics&&await _r(!1),t!==Q.wallpaper&&await yr(!1),t===Q.lyrics?_r(!0):t===Q.wallpaper?yr(!0):{ok:!0}}function Nf(t){return t===Q.lyrics?Q.lyrics:t===Q.wallpaper?Q.wallpaper:Q.off}const qf=[{value:"off",label:"关闭"},{value:"vocal",label:"清澈人声"},{value:"bass",label:"低音增强"},{value:"surround",label:"3D 环绕"}],nl=[{id:"opt-desktop-off",value:Q.off,label:"关闭",tip:"不在桌面上显示歌词"},{id:"opt-desktop-lyrics",value:Q.lyrics,label:"悬浮",tip:"在桌面上显示一行置顶歌词（独立透明窗口，整块都能拖动；鼠标移入可调样式与字号）"},{id:"opt-desktop-wallpaper",value:Q.wallpaper,label:"背景",tip:"把播放界面的背景铺满桌面、垫在桌面图标之下，歌词跟着画在上面（仅 Windows）"}];async function Bf(t){const e=await Rf(t);k();const n=nl.find(s=>s.value===t)?.label||"";return e.ok!==!1?(u(t===Q.off?"已关闭桌面歌词":`桌面歌词：${n}`,{duration:1400}),e):(u(`打不开：${e.reason||e.error||"未知原因"}`,{tone:"warning",duration:3200}),e.restored&&u("已保留原来的桌面歌词设置",{duration:1800}),e)}class On extends fe{get open(){return!1}get panelEl(){return null}updated(){const e=this.panelEl;if(e){if(this.open){this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden?(e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{this.open&&(e.dataset.state="opened")})):e.dataset.state!=="opened"&&(e.dataset.state="opened");return}e.hidden||(e.dataset.state="closed",!this._closeTimer&&(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!this.open&&e&&(e.hidden=!0)},Qa()+40)))}}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),this._closeTimer=null,super.disconnectedCallback()}bindDismiss(e){const n=a=>{const r=this.panelEl;!r||r.hidden||r.contains(a.target)||a.target.closest?.(e)||this.close()},s=a=>{if(a.key!=="Escape")return;const r=this.panelEl;r&&!r.hidden&&this.close()};document.addEventListener("pointerdown",n),document.addEventListener("keydown",s),this._undismiss=()=>{document.removeEventListener("pointerdown",n),document.removeEventListener("keydown",s)}}close(){}}class Ff extends On{static deps=e=>[e.queueOpen,e.queue,e.currentId,e.playing,Tn()];get open(){return!!i.queueOpen}get panelEl(){return this.querySelector("#queue-panel")}close(){Qo(!1)}firstUpdated(){this.bindDismiss("#btn-playlist"),this.bindDrag()}updated(){super.updated(),this.bindDrag()}bindDrag(){const e=this.querySelector("#queue-panel-body");e&&(this._sortable&&this._sortable.el===e||(this._sortable?.destroy(),this._sortable=T.create(e,{draggable:".queue-item",animation:0,ghostClass:"is-dragging",onEnd:n=>{Yo();const s=n.oldIndex,a=n.newIndex;if(s==null||a==null||s===a)return;const r=n.from,o=Array.from(r.children).filter(l=>l!==n.item);r.insertBefore(n.item,o[s]??null),Br(s,a),u("已调整播放顺序 · 播放模式已切回列表循环",{duration:1600})}})))}disconnectedCallback(){this._sortable?.destroy(),this._sortable=null,this._undismiss?.(),super.disconnectedCallback()}render(){const e=i.queueOpen?i.queue.map(s=>Ve(s)).filter(Boolean):[],n=new Map;if(i.queueOpen)for(let s=0;s<i.queue.length;s+=1)n.set(i.queue[s],s);return c`
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
            @click=${()=>Wo()}
          >
            ${f("disc")}
          </button>
          <button
            class="queue-panel__btn u-hit"
            id="queue-clear"
            type="button"
            data-tip="清空列表"
            aria-label="清空列表"
            @click=${()=>{qr(),u("播放列表已清空")}}
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
          ${e.length?Te(e,s=>s.id,s=>this.item(s,n.get(s.id)??-1)):c`<div class="queue-panel__empty">播放列表是空的<br />从曲库把歌曲加进来</div>`}
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
        <span class="queue-item__cover"><img src=${yi(wt(e))} alt="" loading="lazy" /></span>
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
    `}onClick(e){if(Xo())return;const n=e.target.closest("[data-queue-del]");if(n){e.stopPropagation(),Ta(n.dataset.queueDel);return}const s=e.target.closest("[data-queue-id]");s&&Ca(s.dataset.queueId)}onKey(e){if(e.key!=="Enter"&&e.key!==" ")return;const n=e.target.closest?.("[data-queue-id]");n&&(e.preventDefault(),Ca(n.dataset.queueId))}}ee("mp-queue-panel",Ff);class Uf extends On{static deps=e=>[e.optionsOpen,e.config.lyricsFontSize,e.config.glassAlpha,e.config.glassAlphaCustom,e.config.effectPreset,e.config.showLyrics,e.config.showDesktopLyrics,e.config.showDesktopWallpaper];get open(){return!!i.optionsOpen}get panelEl(){return this.querySelector("#options-panel")}close(){Jo(!1)}firstUpdated(){this.bindDismiss("#btn-options"),this._sliders={size:Wt(this.querySelector("#opt-lyric-size"),{min:ds,max:us,step:1,value:i.config.lyricsFontSize,format:e=>`${Math.round(e)}px`,onChange:e=>{i.config.lyricsFontSize=e,Dt("--lyric-size",ti(e)),this.requestUpdate()},onCommit:()=>k()}),alpha:Wt(this.querySelector("#opt-alpha"),{min:20,max:95,step:1,value:i.config.glassAlphaCustom?i.config.glassAlpha:Aa(),format:e=>`${Math.round(e)}%`,onChange:e=>{i.config.glassAlpha=e,i.config.glassAlphaCustom=!0,ni(e),this.requestUpdate()},onCommit:()=>k()})}}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}render(){const e=Math.round(i.config.lyricsFontSize),n=Math.round(i.config.glassAlphaCustom?i.config.glassAlpha:Aa()),s=Xa();return c`
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
              <span class="opt__range">${ds}</span>
              <div class="slider" id="opt-lyric-size" role="slider" tabindex="0" aria-label="歌词字号">
                <div class="slider__rail"><div class="slider__fill"></div></div>
                <div class="slider__thumb"></div>
                <div class="slider__bubble"></div>
              </div>
              <span class="opt__range">${us}</span>
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
                ${nl.map(a=>c`<button
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
                ${qf.map(a=>c`<button
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
    `}pickDesktopMode(e){e.value!==Xa()&&Bf(e.value)}toggleShowLyrics(){i.config.showLyrics=i.config.showLyrics===!1,k()}pickEffect(e){e!==(i.config.effectPreset||"off")&&(i.config.effectPreset=e,vo(),k())}}ee("mp-options-panel",Uf);class Hf extends On{static deps=e=>[e.sleepOpen,e.sleepTimer,e.config.sleepAfterSong,e.playing,e.currentId];get open(){return!!i.sleepOpen}get panelEl(){return this.querySelector("#sleep-panel")}close(){Zo(!1)}constructor(){super(),this._tick=null,this._pendingMinutes=null}onConnected(){this._tick=setInterval(()=>{i.sleepOpen&&i.sleepTimer&&this.requestUpdate()},1e3)}onDisconnected(){this._tick&&clearInterval(this._tick),this._tick=null}firstUpdated(){this.bindDismiss("#btn-sleep"),this._slider=Wt(this.querySelector("#sleep-slider"),{min:0,max:300,step:1,value:0,format:e=>`${Math.round(e)} 分钟`,onChange:e=>{this._pendingMinutes=Math.round(e),this.requestUpdate()},onCommit:e=>{this._pendingMinutes=null,wf(e)}})}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}updated(){super.updated();const e=i.sleepTimer,n=this.querySelector("#sleep-slider");if(e?.type==="duration"){const s=Math.max(0,e.until-Date.now());n?.dataset.dragging!=="true"&&this._slider?.set(Math.max(0,Math.round(s/6e4)),{silent:!0})}else n?.dataset.dragging!=="true"&&this._slider?.set(0,{silent:!0})}render(){const e=i.sleepTimer,n=zf(e,this._pendingMinutes);return c`
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
              @click=${()=>$f(!i.config.sleepAfterSong)}
            ></button>
          </div>
          <div class="sleep-panel__row">
            <button
              class="btn btn--sm"
              type="button"
              data-sleep-act="off"
              @click=${()=>el("已取消定时停止")}
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
    `}}function zf(t,e){if(typeof e=="number")return e<=0?{value:"未开启",sub:"拖到 0 即取消"}:{value:`${e} 分钟`,sub:"松手开始倒计时"};if(t?.type==="after-song")return{value:"等待本首播完",sub:"倒计时已结束，这首播完就暂停"};if(t?.type==="duration"){const n=Math.max(0,t.until-Date.now());return{value:`剩余 ${Kf(n)}`,sub:`共 ${t.minutes} 分钟`}}return{value:"未开启",sub:"拖动滑块设置时长"}}function Kf(t){const e=Math.max(0,Math.round(t/1e3)),n=Math.floor(e/3600),s=Math.floor(e%3600/60),a=e%60;return n>0?`${n} 小时 ${String(s).padStart(2,"0")} 分`:`${String(s).padStart(2,"0")}:${String(a).padStart(2,"0")}`}ee("mp-sleep-panel",Hf);class jf extends On{static deps=()=>{const e=pn();return[e.open,e.revision]};get open(){return pn().open}get panelEl(){return this.querySelector("#download-panel")}close(){gd()}firstUpdated(){this.bindDismiss("#btn-downloads")}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}render(){const{tasks:e,running:n}=pn(),s=e.some(a=>a?.state!=="running");return c`
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
            @click=${()=>yd()}
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
            @click=${()=>_d()}
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
          ${e.length?Te(e,a=>a.id,a=>this.item(a)):c`<div class="download-panel__empty">还没有下载任务</div>`}
        </div>
      </section>
    `}item(e){const n=e.state==="running"?"running":e.state==="failed"?"failed":"done",s=Number(e.total)||0,a=Number(e.done)||0,r=s>0?Math.min(100,Math.round(a/s*100)):0,o=Math.max(0,Math.min(100,Math.round(r/5)*5)),l=n==="running";let d=`${r}%`;n==="done"?d="已完成":n==="failed"?d="失败":s<=0&&(d="下载中");let p;return l?p=s>0?`${jn(a)} / ${jn(s)}`:jn(a):n==="done"?p=`${jn(a||s)} · ${e.path?Vf(e.path):e.dir||""}`:p=e.message||"下载失败",c`
      <div
        class="download-item"
        data-state=${n}
        data-download-id=${e.id}
        role=${n==="done"?"button":x}
        tabindex=${n==="done"?"0":x}
        data-tip=${n==="done"?"在文件夹中显示":x}
        @click=${()=>wd(e.id)}
      >
        <div class="download-item__title">${e.title||e.bvid||"未命名"}</div>
        <div class="download-item__state">${d}</div>
        <div class="download-item__bar" ?hidden=${!l} data-unknown=${s>0?"false":"true"}>
          <div class="download-item__fill" data-value=${o}></div>
        </div>
        <div class="download-item__meta${n==="failed"?" download-item__meta--error":""}">${p}</div>
      </div>
    `}}ee("mp-download-panel",jf);function jn(t){const e=Number(t)||0;if(e<=0)return"0 B";const n=["B","KB","MB","GB"];let s=0,a=e;for(;a>=1024&&s<n.length-1;)a/=1024,s+=1;return`${a>=10||s===0?Math.round(a):a.toFixed(1)} ${n[s]}`}function Vf(t){const e=String(t||""),n=Math.max(e.lastIndexOf("\\"),e.lastIndexOf("/"));return n>=0?e.slice(n+1):e}class Wf extends On{static deps=()=>[B.open,B.songId,B.rev,Tn(),i.config.coverCarousel,i.config.embedMeta];get open(){return B.open}get panelEl(){return this.querySelector("#cover-layer")}close(){dn()}render(){const e=this.song();return c`
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
              @click=${()=>dn()}
            >
              ${f("close")}
            </button>
          </div>
          <div class="cover-layer__body" id="cover-layer-body">${e&&this.open?this.panel(e):x}</div>
        </div>
      </div>
    `}song(){const e=B.songId;return e&&i.songs.find(n=>n.id===e)||null}panel(e){const n=B,s=cl(e);return c`
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
    `}cards(){const e=B;return Te(e.candidates,n=>n.preview,(n,s)=>{const a=e.selected.has(n);return c`
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
    `}onClick(e){if(e.target.closest("[data-cover-close]")||e.target===this.panelEl){dn();return}const n=e.target.closest("[data-set-act]");if(n){const s=Number(n.closest("[data-set-index]")?.dataset.setIndex);n.dataset.setAct==="use"&&this.useExisting(s),n.dataset.setAct==="remove"&&this.removeExisting(s)}}onKey(e){if(e.key!=="Escape")return;const n=this.querySelector("#cover-keyword");if(n&&document.activeElement===n&&n.value.trim()){B.keyword="",n.value="";return}dn()}toggleCandidate(e){const n=B.candidates[e];n&&(B.selected.has(n)?B.selected.delete(n):B.selected.add(n),qe())}selectAll(){const e=B;e.selected.size===e.candidates.length?e.selected.clear():e.candidates.forEach(n=>e.selected.add(n)),qe()}async runSearch(){const e=B;if(e.busy)return;if(!$()){ne("浏览器预览下没有联网封面后端，请在应用里试");return}e.busy=!0;const n=e.candidates.filter(a=>a.local);e.candidates=[...n],e.selected=new Set(n),qe();const s=(this.querySelector("#cover-keyword")?.value||"").trim();ne(s?`正在按「${s}」同时查询多个来源（${Sr()}）…`:`正在同时查询多个来源（${Sr()}）…`);try{const a=s?{keyword:s}:{},r=await b.coverLookupSongAll(e.songId,a),o=Array.isArray(r)?r.filter(l=>l?.ok&&l.preview):[];if(o.length){e.candidates=[...n,...o.map(d=>({...d,local:!1}))];const l=[...new Set(o.map(d=>d.provider).filter(Boolean))];ne(`找到 ${o.length} 张（来源：${l.join(" / ")||"未知"}），勾选后点「应用」`)}else{e.candidates=[...n];const l=Array.isArray(r)?r.find(d=>d?.message)?.message:"";ne(l||"没有找到匹配的封面（也可能是匹配到的都是空白图，已自动丢弃）")}}catch(a){ne(`搜索失败：${a?.message??a}`)}finally{e.busy=!1,qe()}}async pickLocal(){const e=B;if(!$()){ne("浏览器预览下没有系统文件选择器，请在应用里试");return}ne("正在读取图片…");try{const n=await b.coverPickLocal();if(!n||n.cancelled){ne("");return}if(!n.ok||!n.preview){ne(n?.message||"这张图片没法用作封面");return}const s={preview:n.preview,provider:n.provider||"本地图片",source:n.source||"",width:n.width,height:n.height,local:!0};e.candidates.unshift(s),e.selected.add(s),qe(),ne(`已加入本地图片${n.source?`（${n.source}）`:""}，确认后点「应用」`)}catch(n){ne(`选择图片失败：${n?.message??n}`)}}async applySelected(){const e=B.candidates.filter(n=>B.selected.has(n)).map(n=>n.preview).filter(Boolean);if(!e.length){ne("先勾选至少一张封面");return}await this.writeCovers(()=>b.coverAddMany(B.songId,e,i.config.embedMeta===!0))}async useExisting(e){Number.isFinite(e)&&await this.writeCovers(()=>b.coverSetActive(B.songId,e))}async useEmbedded(e){e?.preview&&await this.writeCovers(()=>b.coverAdd(B.songId,"",e.preview,i.config.embedMeta===!0))}async removeExisting(e){Number.isFinite(e)&&await this.writeCovers(()=>b.coverRemove(B.songId,e))}async openCacheDir(){try{await b.coverOpenCacheDir("covers")}catch(e){u(`打开缓存目录失败：${e?.message??e}`,{tone:"error",duration:5e3})}}async writeCovers(e){const n=B;if(!$()){ne("浏览器预览下没有封面后端，请在应用里试");return}ne("正在保存…");try{const s=await e();s&&Array.isArray(s.items)&&(n.currentSet=s,Ia(n.songId,s)),ne(s?.message||"已更新封面"),or(),u(s?.message||"封面已更新",{tone:"success",duration:1800})}catch(s){ne(`保存失败：${s?.message??s}`)}}toggleCarousel(){i.config.coverCarousel=!i.config.coverCarousel,k(),u(i.config.coverCarousel?`已开启封面轮播（每 ${Number(i.config.coverCarouselInterval)||10} 秒换一张）`:"已关闭封面轮播",{duration:1600})}toggleEmbed(){i.config.embedMeta=!i.config.embedMeta,k(),u(i.config.embedMeta?"之后的封面会写进歌曲文件本身":"封面只保存在缓存目录（不改动音乐文件）",{duration:2200})}async refreshSet(){const e=B;if(!(!$()||!e.songId))try{const n=await b.coverList(e.songId);n&&Array.isArray(n.items)&&(e.currentSet=n,Ia(e.songId,n),or())}catch(n){ne(`读取现有封面失败：${n?.message??n}`)}}}ee("mp-cover-layer",Wf);const B={open:!1,songId:"",candidates:[],selected:new Set,currentSet:null,busy:!1,status:"",keyword:"",rev:0};function qe(){B.rev+=1,ge()}function ne(t){B.status=t||"",qe()}const Gf=()=>document.querySelector("mp-cover-layer");function Sr(){return pi(i.coverProviders,ko())}function Yf(t){if(!i.songs.find(s=>s.id===t)){u("这首歌不在本地曲库里，无法更换封面",{tone:"warning"});return}Object.assign(B,{open:!0,songId:t,candidates:[],selected:new Set,currentSet:i.coverSets.get(t)||null,status:"",keyword:""}),qe(),Gf()?.refreshSet(),Xf()}function dn(){B.open=!1,qe()}async function Xf(){if(!(i.coverProviders?.length||!$()))try{const t=await b.coverProviders();Array.isArray(t?.providers)&&t.providers.length&&(i.coverProviders=t.providers,qe())}catch{}}const xt=[{id:"library",label:"曲库"},{id:"player",label:"播放器"},{id:"ui",label:"用户界面"},{id:"data",label:"下载与缓存"},{id:"ai",label:"AI"},{id:"about",label:"关于"}],Qf=[{value:-14,label:"较响（流媒体常见）"},{value:-16,label:"推荐（默认）"},{value:-18,label:"温和"},{value:-23,label:"广播级"}],Jf=[{value:"off",label:"关闭"},{value:"track",label:"逐曲均衡"},{value:"album",label:"同专辑统一"}];function O({label:t,hint:e,control:n}){return c` <div class="setting">
    <div class="setting__main">
      <div class="setting__label">${t}</div>
      ${e?c`<div class="setting__hint">${e}</div>`:x}
    </div>
    <div class="setting__control">${n}</div>
  </div>`}function Z(t,e,n){return c`<button
    class="switch"
    type="button"
    role="switch"
    aria-checked=${String(!!e)}
    data-toggle=${t}
    aria-label=${n}
  ></button>`}function Se(t,e,n){return c` <div class="segmented" data-segment=${t}>
    ${e.map(s=>c`<button
          class="segmented__btn"
          type="button"
          data-value=${s.value}
          aria-pressed=${String(String(s.value)===String(n))}
        >
          ${s.label}
        </button>`)}
  </div>`}function Zf(t){const e=t.aiVendor||"auto",n=fo(e),s="开启后模型会先推理再给结论，响应更慢；关闭则直接作答";return e==="auto"?s+"；自动识别："+(n||"按接口地址与模型名判断厂商"):n?s+"；该厂商："+n:s}function an(t,e,n){return c` <div class="rangeslider">
    <div class="slider" id=${t} role="slider" tabindex="0" aria-label=${n} data-slider=${e}>
      <div class="slider__rail"><div class="slider__fill"></div></div>
      <div class="slider__thumb"></div>
      <div class="slider__bubble"></div>
    </div>
    <!-- 数值由滑杆自己写（见 sliderOptions 的 onChange）：同一个节点只允许一个写入方 -->
    <span class="rangeslider__value"></span>
  </div>`}function eh(t){const e=Number(t);i.config.trackGapSeconds=Number.isFinite(e)?e:1.5,li()}function th(t,e){if(t===e)return!0;if(!t||!e||t.length!==e.length)return!1;for(let n=0;n<t.length;n+=1)if(t[n]!==e[n])return!1;return!0}class nh extends fe{static deps=e=>[e.settingsOpen,e.settingsRev,e.settingsSection,e.view,e.folders,e.filterRules,e.songs,e.allSongsRaw,e.lastScan?.at??0,e.scanning,jc(),Po(),e.config,e.coverProviders,e.coverBreaker,e.coverCache,e.loudnessState,e.ffmpegState,e.updateRev];constructor(){super(),this._activeSection=xt[0].id,this._navPausedUntil=0,this._navResumeTimer=null,this._sliders=new WeakMap,this._derivedKey=null,this._derived=null,this._throttledNavFollow=dl(e=>this.navFollow(e))}settingsDerived(){const e=[i.songs,i.allSongsRaw,i.folders,i.filterRules,i.songs.length,i.allSongsRaw.length];if(this._derivedKey&&th(this._derivedKey,e))return this._derived;const n=new Map;for(const o of i.folders){let l=0;for(const d of i.songs)d.path.startsWith(o.path)&&(l+=1);n.set(o.id,l)}const s=Fr(i.allSongsRaw,i.filterRules);let a=0,r=0;for(const o of i.songs)a+=o.duration,r+=o.size;return this._derivedKey=e,this._derived={perFolder:n,rules:s,totalDuration:a,totalBytes:r},this._derived}get open(){return jr()}get panelEl(){return this.querySelector("#settings-layer")}updated(){const e=this.panelEl;if(e){if(this.open){if(this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden){e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{this.open&&(e.dataset.state="opened")});const n=this.querySelector(".settings-layer__body");n&&(n.scrollTop=0)}this.bindSliders(),Gp();return}e.hidden||(e.dataset.state="closed",!this._closeTimer&&(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!this.open&&e&&(e.hidden=!0)},Qa()+40)))}}onConnected(){this._onScrollCapture=e=>this.onScroll(e),this.addEventListener("scroll",this._onScrollCapture,!0)}onDisconnected(){this._onScrollCapture&&(this.removeEventListener("scroll",this._onScrollCapture,!0),this._onScrollCapture=null),this._navResumeTimer&&clearTimeout(this._navResumeTimer),this._navResumeTimer=null}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),this._closeTimer=null,super.disconnectedCallback()}render(){return pr(),c`
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
              @click=${()=>fs()}
            >
              ${f("close")}
            </button>
          </div>
          <div class="settings-layer__body">
            <div class="settings">
              <div class="settings__nav" role="tablist">
                ${xt.map(e=>c`<button
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
    `}foldersCard(){const e=this.settingsDerived(),n=i.folders.length?i.folders.map(s=>{const a=s.status==="ok"?c`<span class="chip chip--ok"
                  ><i class="chip__dot"></i>${s.watching?"监听中":"已停止监听"}</span
                >`:s.status==="missing"?c`<span class="chip chip--error"><i class="chip__dot"></i>路径不存在</span>`:s.status==="denied"?c`<span class="chip chip--warn"><i class="chip__dot"></i>无访问权限</span>`:s.status==="partial"?c`<span class="chip chip--warn"><i class="chip__dot"></i>部分子目录读不到</span>`:s.status==="error"?c`<span class="chip chip--error"><i class="chip__dot"></i>扫描出错</span>`:c`<span class="chip chip--warn"><i class="chip__dot"></i>状态未知</span>`,r=e.perFolder.get(s.id)??0;return c` <div class="pathrow" data-folder=${s.id}>
            <svg class="pathrow__icon" aria-hidden="true"><use href="#i-folder"></use></svg>
            <div class="pathrow__main">
              <div class="pathrow__path u-selectable" title=${s.path}>${s.path}</div>
              <div class="pathrow__meta">${a}<span>${I(r)} 首</span></div>
            </div>
            <button class="btn btn--ghost btn--sm" type="button" data-act="rescan-folder" data-id=${s.id}>
              ${f("refresh")}<span>重新扫描</span>
            </button>
            <button
              class="btn btn--ghost btn--sm"
              type="button"
              data-act="remove-folder"
              data-id=${s.id}
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
        ${n}
        <div class="setting setting--group-start">
          <div class="setting__main">
            <div class="setting__label">启动时自动扫描</div>
            <div class="setting__hint">应用启动后在后台增量扫描一次</div>
          </div>
          <div class="setting__control">
            ${Z("autoScanOnStart",i.config.autoScanOnStart,"启动时自动扫描")}
          </div>
        </div>
        ${O({label:"实时监听文件夹变化",hint:"新增、删除、重命名文件后自动更新曲库（需要后端文件监听）",control:Z("watchFolders",i.config.watchFolders,"实时监听")})}
        ${O({label:"元数据并发读取",hint:"同时解析的音频文件数量，机械硬盘建议调低",control:Se("scanConcurrency",[2,4,8].map(s=>({value:String(s),label:`${s}`})),String(i.config.scanConcurrency))})}
      </div>
      <div class="card__foot">
        <span>支持格式：mp3 · flac · wav · m4a · ogg · aac（ape / wma 需转码）</span>
        <span class="u-num">${I(i.folders.length)} 个文件夹</span>
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
          ${s?c`正在读取清单…`:c`发现 <b>${I(n)}</b> 个无法播放的文件`}
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
                ${n.attempts>1?c`<span>失败 ${I(n.attempts)} 次</span>`:x}
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
    </div>`}ruleRow(e){const n=e.type==="regex"&&e.value&&!Yl(e.value);return c` <div class="rule" data-rule=${e.id} data-enabled=${String(e.enabled)}>
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
          当前规则下：共扫描 <b>${I(s)}</b> 个文件，保留 <b>${I(e.length)}</b> 首，过滤掉
          <b>${I(n)}</b> 个
        </div>
      </div>
      <div class="card__foot">
        <span>「排除」优先于「仅包含」；支持正则表达式（忽略大小写）</span>
        <span>大小单位在数值后填写，默认字节</span>
      </div>
    </section>`}themeCard(){const e=En(),n=pr(),s=window.matchMedia("(prefers-color-scheme: dark)").matches;return c` <section class="card" id="sec-appearance" data-section="ui">
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
        ${O({label:"深浅色模式",hint:`当前系统偏好：${s?"深色":"浅色"}`,control:Se("themeMode",[{value:"dark",label:"深色"},{value:"light",label:"浅色"},{value:"system",label:"跟随系统"}],i.config.themeMode)})}
        ${O({label:"毛玻璃模糊强度",hint:"控制面板背后内容的模糊程度",control:an("set-blur","glassBlur","模糊强度")})}
        ${O({label:"面板不透明度",hint:"面板背景的透明程度，数值越大越透",control:an("set-alpha","glassAlpha","不透明度")})}
        ${O({label:"界面动画",hint:"关闭后取消过渡与旋转动画，低性能设备更流畅",control:Z("animations",i.config.animations,"界面动画")})}
        ${O({label:"过渡速度",hint:"弹出层、菜单、面板的进出动画时长；默认快速 0.25 秒",control:Se("animationsSpeed",Tp,i.config.animationsSpeed||"fast")})}
        ${O({label:"背景动效（播放界面）",hint:"只影响播放详情页里样式绘制的背景动画。「流畅优先」跟随屏幕刷新率（高刷屏更顺滑）；「性能优先」限制帧率并让暂停后的画面停住，更省电。其他界面（设置、曲库列表）始终满帧，不受此项影响。",control:Se("skinPerformanceMode",Ep,i.config.skinPerformanceMode||"smooth")})}
        ${O({label:"主题色跟随封面",hint:"从当前封面提取主色调，作为界面主题色",control:Z("accentFromCover",i.config.accentFromCover,"主题色跟随封面")})}
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
        ${O({label:"显示专辑列",hint:"窄窗口下会自动隐藏该列",control:Z("showAlbumColumn",i.config.showAlbumColumn,"显示专辑列")})}
        ${O({label:"列表密度",hint:"对「本地歌曲」「播放列表」「歌单」三个列表同时生效",control:Se("listDensity",Cp,i.config.listDensity||"cozy")})}
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
        ${O({label:"窗口圆角",hint:"主窗口四角的圆角幅度。圆角由系统绘制，只有这几档（仅 Windows 11 有效）",control:Se("windowCorners",xp,i.config.windowCorners||"system")})}
        ${O({label:"关闭时最小化到托盘",hint:"打开后点关闭按钮只把窗口收进系统托盘（任务栏右下角），音乐照常播放；要真正退出请用托盘图标的右键菜单",control:Z("minimizeToTray",i.config.minimizeToTray,"关闭时最小化到托盘")})}
        ${O({label:"记忆窗口位置与大小",hint:"退出时记住主窗口的位置、尺寸和最大化状态，下次打开回到原处。换显示器或改分辨率后如果窗口跑到屏幕外，会自动回到居中默认大小；也可以在这里手动重置",control:c`<button
            class="btn btn--ghost btn--sm"
            type="button"
            data-act="reset-main-window-geometry"
            data-tip="把主窗口移回屏幕中央并恢复默认大小"
          >
            重置窗口位置
          </button>`})}
      </div>
    </section>`}playerCard(){const e=Vt(),n=Do();return c` <section class="card" id="sec-player" data-section="ui">
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
        ${O({label:"封面轮播",hint:"一首歌有多张封面时，播放详情页按下面的间隔轮换显示（不影响列表缩略图）",control:Z("coverCarousel",i.config.coverCarousel===!0,"封面轮播")})}
        ${O({label:"轮播间隔",hint:"每隔多少秒切换一张",control:an("set-carousel","coverCarouselInterval","轮播间隔")})}
      </div>
    </section>`}skinIcon(e){return e.iconUrl?c`<i class="skin-icon" style=${`--skin-icon:${Dr(e.iconUrl)}`}></i>`:f(e.icon||"disc")}playbackCard(){return c` <section class="card" id="sec-playback" data-section="player">
      <div class="card__head">
        <div class="card__icon">${f("headphones")}</div>
        <div class="card__titles">
          <div class="card__title">播放</div>
          <div class="card__desc">播放模式、随机方式与单击歌曲时的行为</div>
        </div>
      </div>
      <div class="card__body">
        ${O({label:"默认播放模式",hint:"点击底栏循环按钮可随时切换",control:Se("playMode",[{value:"sequence",label:"列表循环"},{value:"loop-one",label:"单曲循环"},{value:"shuffle",label:"随机"}],i.config.playMode==="loop-all"?"sequence":i.config.playMode)})}
        ${O({label:"随机播放方式",hint:"随机播放会先打乱当前播放列表，再按打乱后的顺序播放",control:Se("shuffleMode",[{value:"reshuffle",label:"播完重新打乱"},{value:"once",label:"只打乱一次"}],i.config.shuffleMode||"reshuffle")})}
        ${O({label:"记忆音量",hint:"记住上次的音量，下次启动时恢复",control:Z("rememberVolume",i.config.rememberVolume!==!1,"记忆音量")})}
        ${O({label:"保留歌曲播放进度",hint:"记住每首歌上次播到哪儿；退出后重新打开会回到那个位置。只恢复进度条，不会自动开始播放",control:Z("resumeProgress",i.config.resumeProgress===!0,"保留歌曲播放进度")})}
        ${O({label:"跳过开头无声片段",hint:c`开头有一段空白时，播放会自动从出声处开始，不必干等（现场录音与转录文件常见）。<br />
            只跳过开头连续 0.2 秒以上的静音，乐句之间的短暂停顿不会被误伤。<br />
            <span class="u-dim">歌曲长度与进度条仍按原曲显示，歌词与播放进度不会因此错位。</span>`,control:Z("skipSilenceHead",i.config.skipSilenceHead===!0,"跳过开头无声片段")})}
        ${O({label:"跳过结尾无声片段",hint:c`结尾拖着一长段空白时，播到最后一个声音就结束，紧接着切下一首（CD 抓轨与整轨转录常见）。<br />
            <span class="u-dim">歌曲长度仍按原曲显示；进度条会在原曲的静音起点处停住。</span>`,control:Z("skipSilenceTail",i.config.skipSilenceTail===!0,"跳过结尾无声片段")})}
        ${O({label:"切歌间隔",hint:"自动切到下一首时中间留出的停顿。手动点「下一首」不受影响（那是即时的操作）；调到 0 表示紧接着播",control:an("set-track-gap","trackGapSeconds","切歌间隔")})}
        ${O({label:"单击歌曲时的行为",hint:c`双击始终是「立即播放这一首」，此设置只影响单击。<br />
            播放：立刻播放这首歌，并加入播放列表；<br />
            播放当前列表：用当前整个列表替换播放队列，从这首歌开始播；<br />
            下一首播放：插到当前歌曲后面，下一次「下一曲」时播放。`,control:Se("rowClickAction",Sp,i.config.rowClickAction||"next")})}
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
        ${O({label:"歌词来源优先级",hint:"内嵌歌词 → 同目录 .lrc → 歌词缓存 → 在线自动匹配；本地读不到时会自动联网匹配并存入缓存",control:c`<span class="chip"><i class="chip__dot"></i>${Ap()}</span>`})}
        ${O({label:"歌词字号",hint:"歌词文字大小，当前播放的那一行会略微放大（底栏「选项」里也能调）",control:an("set-lyric-size","lyricsFontSize","歌词字号")})}
        ${O({label:"居中高亮行数",hint:"当前行上下各显示的行数",control:Se("lyricsLines",[3,5,7,9].map(e=>({value:String(e),label:String(e)})),String(i.config.lyricsLines))})}
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
        <div class="setting__control">${Se("loudnessMode",Jf,e.loudnessMode||"off")}</div>
      </div>

      <div class="setting">
        <div class="setting__label">
          <span>目标响度</span>
          <small class="u-fs-xs u-dim">数值越小整体越轻，推荐用默认档。改动后会自动重新计算</small>
        </div>
        <div class="setting__control">
          <div class="select">
            <select class="select__field" data-act="loudness-target" aria-label="目标响度">
              ${Qf.map(p=>c`<option value=${p.value} ?selected=${Number(e.loudnessTarget)===p.value}>
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
          首${a?c`，其余 <b>${I(a)}</b> 首会在播放时计算`:"（全部已算好）"}<br />
          响度来源：<b>${o?d:"不可用"}</b>
        </div>
      </div>
    </section>`}onlineCard(){const e=i.config.downloadDir||"（默认：系统音乐目录 / downloads）",n=i.coverProviders||[],s=i.coverBreaker||{},a=n.length?n.map(r=>s[r]?`${Ba(r)}（暂时不可用）`:Ba(r)).join(" · "):"正在读取…";return c` <section class="card" id="sec-online" data-section="data">
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

        ${O({label:"联网获取封面",hint:`在线搜索到的歌曲会自动去公开曲库匹配封面：${a}`,control:Z("onlineCover",i.config.onlineCover!==!1,"联网获取封面")})}
        ${O({label:"优先使用逐字歌词",hint:"逐字（卡拉OK）歌词来自 QQ 音乐 QRC / 酷狗 KRC 这两种第三方私有编码，本程序只做兼容性解析以便显示逐字时间轴。关掉后只用行级来源（LRCLIB / 网易云等），歌词仍然可用，只是没有逐字高亮。",control:Z("onlineWordLyrics",i.config.onlineWordLyrics!==!1,"优先使用逐字歌词")})}
        ${O({label:"把封面/歌词写进歌曲文件",hint:Dp(),control:Z("embedMeta",i.config.embedMeta===!0,"写进歌曲文件")})}

        <div class="setting setting--stack">
          <div class="setting__main">
            <div class="setting__label">把已有缓存补写进文件</div>
            <div class="setting__hint">${Mp()}</div>
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
            <div class="setting__hint">封面与歌词的缓存位置；${_i()}</div>
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

        <!-- 联网与隐私：让用户不读源码也能知道「什么时候联网 / 连到哪 / 怎么关」。
             清单本体在 about-info.js（NETWORK_USAGE / PRIVACY_NOTES），
             改默认开关时要同步那一份。 -->
        <div class="about-subtitle">联网与隐私</div>
        <div class="about-note">
          <div class="about-note__title"><span>会联网的功能</span></div>
          ${Xl.map(r=>c`<div class="about-note__body">· ${r.what} → ${r.where}（${r.when}；关闭方式：${r.off}）</div>`)}
        </div>
        <div class="about-note">
          <div class="about-note__title"><span>什么留在本机</span></div>
          ${Ql.map(r=>c`<div class="about-note__body">· ${r}</div>`)}
        </div>
        <div class="about-note">
          <div class="about-note__title"><span>下载内容的使用范围</span></div>
          ${Jl.map(r=>c`<div class="about-note__body">· ${r}</div>`)}
        </div>
      </div>
      <div class="card__foot">
        <span>封面来自公开曲库（${ko()}），匹配结果不保证完全准确</span>
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
        ${O({label:"模型类型",hint:"不同厂商对思考模式的支持方式不同，选错会导致这个开关不生效；选「自动识别」可自动判断",control:c` <select class="select__field" data-act="ai-vendor" aria-label="模型类型">
            ${oi.map(o=>c`<option value=${o.id} ?selected=${o.id===(e.aiVendor||"auto")}>${o.label}</option>`)}
          </select>`})}
        ${O({label:"启用思考模式",hint:Zf(e),control:Z("aiThinking",!!e.aiThinking,"启用思考模式")})}
        ${O({label:"自动匹配歌词时使用 AI 清洗元数据",hint:"自动匹配歌词前先用 AI 从文件名里还原真实的标题 / 歌手。AI 一次调用可能要十几秒，关掉后只做本地整理：匹配更快，但文件名不规范时命中率会低一些",control:Z("aiLyricsClean",i.config.aiLyricsClean!==!1,"自动匹配歌词时使用 AI 清洗元数据")})}
        ${O({label:"下载歌曲时用 AI 整理元数据",hint:"下载完成（直接下载或从试听缓存搬运）后，在后台把文件名与现有信息交给 AI，还原出真实的标题 / 歌手 / 专辑并写回歌曲文件。整理在下载结束后才发生，不会拖慢下载；写回会改写文件标签且不可撤销，只在 AI 给出非空字段时才写。支持 m4a / flac，其它格式只更新曲库",control:Z("aiDownloadTag",i.config.aiDownloadTag!==!1,"下载歌曲时用 AI 整理元数据")})}
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
    </section>`}aboutCard(){const e=i.appVersion||Ci,n=i.lastScan,{totalDuration:s,totalBytes:a}=this.settingsDerived();return c` <section class="card" id="sec-about" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("info")}</div>
        <div class="card__titles">
          <div class="card__title">关于 ${Ti}</div>
          <div class="card__desc">${Zl}</div>
        </div>
      </div>
      <div class="card__body">
        <div class="about-hero">
          <div class="about-hero__main">
            <div class="about-hero__title">
              <span class="about-hero__name">${Ti}</span>
              <span class="about-hero__version">v${e}</span>
              <span class="chip chip--ok"><i class="chip__dot"></i>${ec}</span>
            </div>
            <div class="about-hero__meta">${tc} · ${nc}</div>
            <div class="about-hero__meta">${sc}</div>
          </div>
          <div class="about-hero__links">
            ${ac.map(r=>c`<button
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
          <div class="kv__v">${I(i.allSongsRaw.length)} 个</div>
          <div class="kv__k">过滤后歌曲</div>
          <div class="kv__v">${I(i.songs.length)} 首</div>
          <div class="kv__k">被规则过滤</div>
          <div class="kv__v">${I(n?.excluded??0)} 个</div>
          <div class="kv__k">总时长</div>
          <div class="kv__v">${Math.floor(s/36e5)} 小时 ${Math.floor(s%36e5/6e4)} 分</div>
          <div class="kv__k">占用空间</div>
          <div class="kv__v">${en(a)}</div>
          <div class="kv__k">上次扫描</div>
          <div class="kv__v">${n?new Date(n.at).toLocaleString("zh-CN"):"—"}</div>
          <div class="kv__k">缓存目录</div>
          <div class="kv__v">${i.config.cacheDir}</div>
        </div>
      </div>
      <div class="card__foot">
        <span>版本号来自后端常量（services_app.go#appVersion），与安装包元数据同源</span>
      </div>
    </section>`}updateCard(){const e=i.update||{},n=e.check,s=n?.current||i.appVersion||Ci,a=n?.latest||"",r=ls(e.channel),o=e.pending,l=e.progress;return c` <section class="card" data-section="about" id="sec-update">
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
              ${rc.map(d=>c`<option value=${d.id} ?selected=${d.id===(e.channel||"auto")}>${d.name}</option>`)}
            </select>
          </div>
        </div>

        ${O({label:"启动时自动检查更新",hint:"只在发现新版本时提示；检查失败不会打扰你（可以随时点上面的「检查更新」）",control:Z("updateCheckOnStart",e.checkOnStart!==!1,"启动时自动检查更新")})}

        <div class="setting">
          <div class="setting__main">
            <div class="setting__label">仓库</div>
            <div class="setting__hint">${ic}</div>
          </div>
          <div class="setting__control">
            <button
              class="btn btn--ghost btn--sm"
              type="button"
              data-act="about-open-url"
              data-url=${Fs}
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
            data-url=${e.releaseUrl||Fs}
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
            data-url=${e.releaseUrl||Fs}
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
        ${o?"正在连接…":s>0?`${r}% · ${en(a)} / ${en(s)}${e.speedText?` · ${e.speedText}`:""}`:en(a)}
        ${n?.assetSizeText?c` <span>（共 ${n.assetSizeText}）</span>`:x}
      </div>
    </div>`}updatePendingBlock(e){return c` <div class="about-note">
      <div class="about-note__title">
        <span>更新包已就绪</span>
        ${e.verified?c`<span class="chip chip--ok"><i class="chip__dot"></i>SHA-256 已校验</span>`:c`<span class="chip chip--warn"><i class="chip__dot"></i>未能校验</span>`}
      </div>
      <div class="about-note__body">
        ${e.name} · ${en(e.bytes||0)}
        ${e.mirrorId?` · 来自 ${ls(e.mirrorId).name}`:""}
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
        ${oc.map(e=>c` <div class="about-row">
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
    </section>`}libsCard(){const e=lc(),n=cc(e).map(s=>`${s.license} × ${s.count}`).join(" · ");return c` <section class="card" id="sec-libs" data-section="about">
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
        ${dc.map(s=>c` <div class="about-note">
              <div class="about-note__title">
                <span>${uc(s)}</span><span class="tagchip tagchip--warn">${s.license}</span>
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
        ${pc.map(e=>c` <div class="about-note">
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
        ${fc.map(e=>c` <div class="about-row">
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
        ${hc.map(e=>c` <div class="about-note">
              <div class="about-note__title"><span>${e.title}</span></div>
              <div class="about-note__body">${e.body}</div>
            </div>`)}
      </div>
      <div class="card__foot card__foot--stack">${mc.map(e=>c`<span>· ${e}</span>`)}</div>
    </section>`}async onClick(e){if(e.target.closest("[data-settings-close]")||e.target===this.panelEl){fs();return}const n=e.target.closest("[data-goto]")?.dataset.goto;if(n){this.scrollToSection(n);return}const s=e.target.closest("[data-toggle],[data-segment] .segmented__btn");if(s){Qp(s,{commit:k})&&un(),this.requestUpdate();return}const a=e.target.closest("[data-act]");a&&(await Wa(a,{commit:k,render:()=>{i.settingsRev=(i.settingsRev||0)+1,k()},rescan:()=>xn({manual:!0})}),un())}async onChange(e){if(e.target.dataset.act)try{await Wa(e.target,{commit:k,render:()=>{i.settingsRev=(i.settingsRev||0)+1,k()},rescan:()=>xn({manual:!0})}),un(),this.requestUpdate()}catch(s){console.error("[settings] 处理下拉框失败",s),u(`设置未生效：${s?.message??s}`,{tone:"error",duration:5e3})}}onInput(e){if(e.target.dataset.act!=="rule-value")return;const n=i.filterRules.find(s=>s.id===e.target.dataset.id);n&&(n.value=e.target.value,k(),this.requestUpdate())}onScroll(e){const n=e.target;if(n.classList?.contains("settings-layer__body")){if(this._navPausedUntil){this.deferNavResume();return}this._throttledNavFollow(n)}}navFollow(e){if(this._navPausedUntil)return;const n=e.getBoundingClientRect().top+80;let s=xt[0].id;for(const a of xt){const r=this.querySelector(`[data-section="${a.id}"]`);r&&r.getBoundingClientRect().top<=n&&(s=a.id)}e.scrollHeight>e.clientHeight+2&&e.scrollTop+e.clientHeight>=e.scrollHeight-2&&(s=xt[xt.length-1].id),s!==this._activeSection&&(this._activeSection=s,this.paintNav())}paintNav(){for(const e of this.querySelectorAll(".settings__nav-item"))e.setAttribute("aria-selected",String(e.dataset.goto===this._activeSection))}deferNavResume(){clearTimeout(this._navResumeTimer),this._navResumeTimer=setTimeout(()=>{this._navResumeTimer=null,this._navPausedUntil=0},140)}scrollToSection(e){const n=this.querySelector(`[data-section="${e}"]`),s=this.querySelector(".settings-layer__body");if(!n||!s)return;this._activeSection=e,this.paintNav(),this._navPausedUntil=1,this.deferNavResume();const a=this.querySelector(".settings__nav"),r=a?a.offsetHeight:0,o=n.getBoundingClientRect().top-s.getBoundingClientRect().top,l=Math.max(0,s.scrollTop+o-r-8);s.scrollTo({top:l,behavior:"smooth"})}bindSliders(){for(const e of this.querySelectorAll("[data-slider]")){const n=e.dataset.slider;if(!n)continue;let s=this._sliders.get(e);if(!s){s=Wt(e,this.sliderOptions(e,n)),this._sliders.set(e,s);const a=e.parentElement.querySelector(".rangeslider__value");a&&(a.textContent=s.text(this.sliderValue(n)))}s.set(this.sliderValue(n),{silent:!0})}}sliderOptions(e,n){const s=n==="glassBlur",a=n==="glassAlpha",r=n==="coverCarouselInterval",o=n==="trackGapSeconds",l=n==="lyricsFontSize",d=o?0:r?2:l?ds:s?0:a?20:0,p=o?10:r?60:l?us:s?48:a?95:100,m=r||o?" 秒":s?"px":a?"%":"px",h=o?.1:1,y=o?1:0,S=v=>`${v.toFixed(y)}${m}`;return{min:d,max:p,step:h,value:this.sliderValue(n),format:S,onChange:v=>{i.config[n]=o?Math.round(v*10)/10:v;const C=e.parentElement.querySelector(".rangeslider__value");C&&(C.textContent=S(v)),s&&(i.config.glassBlurCustom=!0,Dt("--glass-blur",`${v}px`)),a&&(i.config.glassAlphaCustom=!0,ni(v)),n==="lyricsFontSize"&&Dt("--lyric-size",ti(v)),o&&eh(i.config[n])},onCommit:()=>k()}}sliderValue(e){if(e==="glassBlur")return i.config.glassBlurCustom?i.config.glassBlur:sd();if(e==="glassAlpha")return i.config.glassAlphaCustom?i.config.glassAlpha:Aa();if(e==="trackGapSeconds"){const n=Number(i.config.trackGapSeconds);return Number.isFinite(n)?n:1.5}return i.config[e]??0}}ee("mp-settings-layer",nh);class sh extends fe{static deps=e=>[e.floatingLyrics?.show,e.floatingLyrics?.text];render(){const e=i.floatingLyrics||{show:!1,text:""};return c`
      <div class="desktop-lyrics" id="desktop-lyrics" ?hidden=${!e.show} aria-hidden="true">
        <div class="desktop-lyrics__line" id="desktop-lyrics-line">${e.text}</div>
      </div>
    `}}ee("mp-floating-lyrics",sh);class ah extends fe{static deps=e=>[e.playerOpen,e.scanning,e.scanText,e.config.listDensity];updated(){const e=document.documentElement,n=i.config.listDensity||"cozy";e.dataset.density!==n&&(e.dataset.density=n)}render(){return c`
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
    `}}ee("mp-app",ah);let yn="";const ih=200;class rh extends Map{set(e,n){for(super.has(e)&&super.delete(e),super.set(e,n);this.size>ih;){const s=super.keys().next();if(s.done)break;super.delete(s.value)}return this}}const Sa=new rh,Vn=new Map;function oh(){const t=new Image;return t.decoding="async",t.alt="",t}function lh(t){return!i.config.accentFromCover||!Sn(t)?!1:t!==yn}function sl(t){if(!Sn(t))return Promise.resolve("");if(Sa.has(t))return Promise.resolve(Sa.get(t));if(Vn.has(t))return Vn.get(t);const e=new Promise(n=>{const s=o=>{Sa.set(t,o),Vn.delete(t),n(o)},a=document.getElementById("bar-cover-img");if(a&&a.getAttribute("src")===t&&a.complete&&a.naturalWidth>0){s(Ut(Ni(a)));return}const r=oh();r.addEventListener("load",()=>s(Sn(t)?Ut(Ni(r)):"")),r.addEventListener("error",()=>s("")),r.src=t});return Vn.set(t,e),e}async function al(t){t&&id(t,t)&&(await un(),await Le(i.config))}async function ch(){if(!i.config.accentFromCover||Ut(i.config.coverSeed))return;const t=i.currentId?Ve(i.currentId):null,e=t?wt(t):"";e&&(yn=e,await al(await sl(e)))}function dh(t){if(!i.config.accentFromCover){yn="";return}if(t){if(!Sn(t)){yn=t;return}lh(t)&&(yn=t,sl(t).then(al))}}function uh(t){ad(Sn(t)?t:"")}let xr="";function ph(t){return[i.currentId??"",i.playing?1:0,Math.round((i.position||0)/250),i.duration||0,i.volume,i.muted?1:0,i.config.loudnessMode||"off",Pn()?1:0,qs()?1:0,Math.round(Number(i.config.lyricsFontSize)||16),t].join("|")}function Cr(){const t=i.currentId?Ve(i.currentId):null,e=t?wt(t):"",n=ph(e);if(n!==xr){if(xr=n,hu(),Kt(),Pn()){i.playing&&za();const s=i.playing?tp():null;Ef({text:s?s.text:"",trans:s?s.trans:[],chars:s?s.chars:[],words:s?s.words:[],wordEnds:s?s.wordEnds:[],posMs:Math.round(i.position||0),atMs:Date.now(),playing:!!i.playing,fontSize:Math.round((Number(i.config.lyricsFontSize)||16)*1.5)})}qs()&&(i.playing&&za(),Ya()),dh(e),uh(e)}}function fh(){Cs(Cr),Cr()}let os=null;function hh(){mh(),os=U("media:key",t=>{t?.action==="toggle"&&Gt()}),Promise.resolve(b.mediaKeysReady()).catch(t=>{console.warn("[media-keys] 向后端报到失败（媒体键在此之前按引擎兜底处理）",t)})}function mh(){if(os){try{os()}catch{}os=null}}const wn=document.getElementById("boot-splash"),Wn=document.getElementById("boot-splash__frame");function Tr(){wn&&(wn.dataset.hasframe="1")}Wn&&(Wn.complete?Wn.naturalWidth>0&&Tr():Wn.addEventListener("load",Tr,{once:!0}));let Er=!1;function bh(){Er||(Er=!0,fetch("/boot/reveal",{cache:"no-store",keepalive:!0}).catch(()=>{}),b.windowReady().catch(()=>{}))}let Ir=!1;function il(){Ir||!wn||(Ir=!0,wn.dataset.hide="1",setTimeout(()=>wn.remove(),400))}bh();setTimeout(il,12e3);const dt=new Map;async function vh(){await In(),await ch(),await Le(i.config),window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",async()=>{i.config.themeMode==="system"&&(await Le(i.config),k())})}async function gh(){if($())try{const t=await b.coverCachedSets();if(!t||typeof t!="object")return;Ur(t);const e=Object.keys(t).length;e&&console.info(`[cover] 已从缓存回填 ${e} 首歌的封面（含多封面）`)}catch(t){console.info("[cover] 封面缓存回填跳过",t?.message??t)}}function _h(){document.addEventListener("keydown",t=>{const e=t.target.tagName,n=e==="INPUT"||e==="TEXTAREA"||e==="SELECT"||t.target.isContentEditable;if(t.key==="Escape"){if(document.getElementById("modal-backdrop")?.hidden===!1)return;wc(),i.playerOpen&&Rs();return}if(!n)switch(t.key){case" ":t.preventDefault(),Gt();break;case"ArrowRight":t.ctrlKey||t.metaKey?Ft(!1):Ee(i.position+5e3);break;case"ArrowLeft":t.ctrlKey||t.metaKey?Ja():Ee(i.position-5e3);break;case"ArrowUp":t.preventDefault(),Ea(i.volume+.05);break;case"ArrowDown":t.preventDefault(),Ea(i.volume-.05);break;case"l":case"L":i.currentId&&mt(i.currentId);break;case"p":case"P":Va();break;case"f":case"F":yh();break}})}async function yh(){if($()){const t=!document.fullscreenElement;await b.windowSetFullscreen(t);return}document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen().catch(()=>{})}function wh(){U("scan:start",()=>{i.scanning=!0,i.scanText="正在扫描音乐文件夹…",k()}),U("scan:progress",t=>{t&&(t.phase==="walk"?i.scanText="正在遍历音乐文件夹…":t.total&&(i.scanText=`正在读取元数据 ${t.current} / ${t.total}`),k())}),U("scan:done",async t=>{i.scanning=!1;const e=await b.songs();if(Array.isArray(e)){const s=new Set(i.songs.map(l=>l.id));i.allSongsRaw=e;const{kept:a,excluded:r}=Fr(e,i.filterRules);i.songs=a;const o=new Set(a.map(l=>l.id));i.lastScan={at:Date.now(),found:e.length,kept:a.length,excluded:r,added:a.filter(l=>!s.has(l.id)).length,removed:[...s].filter(l=>!o.has(l)).length}}const n=await b.folders();Array.isArray(n)&&(i.folders=n),k(),t?.added&&!t?.firstRun&&u(`文件夹变化：新增 ${t.added} 首`,{tone:"success"})}),U("scan:failed",t=>{i.scanning=!1,k(),u(`扫描失败：${t?.message??"未知错误"}`,{tone:"error",duration:5e3})}),U("library:unplayable",t=>{if(!t)return;$c().catch(()=>{});const e=t.title||t.songId||"这首歌";u(`无法播放：${e}（已记入「音乐文件夹」清单）`,{tone:"error",duration:6e3}),Lr(!0)}),U("theme:changed",t=>{i.config.theme=t,Le(i.config),k()}),U("player:state",t=>{t&&(typeof t.position=="number"&&(i.position=t.position),typeof t.duration=="number"&&(i.duration=t.duration),typeof t.playing=="boolean"&&(i.playing=t.playing))}),U("cover:changed",async t=>{const e=String(t?.id||"");try{if(!e){const s=await b.coverCachedSets();s&&typeof s=="object"&&Ur(s);return}const n=await b.coverList(e);n&&Array.isArray(n.items)&&Ia(e,n)}catch(n){console.info("[cover] 同步封面失败",n?.message??n)}}),U("loudness:progress",t=>{t&&(i.loudnessState={...i.loudnessState||{},...t,running:!0},k())}),U("loudness:done",async t=>{i.loudnessState={...i.loudnessState||{},running:!1},k();const e=t?.failed??0;u(e?`响度测量完成：成功 ${t?.done-e} 首，失败 ${e} 首`:`响度测量完成：共 ${t?.done??0} 首`,{tone:e?"warning":"success",duration:4e3}),await _n(),await Ds()}),U("loudness:failed",t=>{i.loudnessState={...i.loudnessState||{},running:!1},k(),u(`响度测量失败：${t?.message??"未知错误"}`,{tone:"error",duration:6e3})}),U("ffmpeg:ready",t=>{t&&(i.ffmpegState=t,k(),console.info(`[ffmpeg] ${t.available?t.describe:"不可用"}`))}),U("download:progress",t=>{if(!t?.bvid)return;const e=t.title||t.bvid,n=Number(t.total)||0,s=Number(t.done)||0,a=n>0?Math.round(s/n*100):0,r=n>0?`下载中 ${a}% · ${e}`:`下载中 ${e}`;dt.has(t.bvid)?dt.get(t.bvid).update(r):dt.set(t.bvid,u(r,{duration:0}))}),U("download:done",t=>{const e=dt.get(t?.bvid);dt.delete(t?.bvid);const n=`已下载：${t?.title||t?.bvid} → ${t?.path||t?.dir||""}`;e?e.update(n,"success"):u(n,{tone:"success",duration:5e3}),setTimeout(()=>e?.close(),4e3),kc(t?.path)}),U("download:failed",t=>{const e=dt.get(t?.bvid);dt.delete(t?.bvid);const n=`下载失败：${t?.message??"未知错误"}`;e?e.update(n,"error"):u(n,{tone:"error",duration:6e3}),setTimeout(()=>e?.close(),6e3)}),U("update:checked",t=>{t&&(i.update.check=t,i.update.checking=!1,i.update.error=t.error||"",k(),t.hasUpdate&&t.assetAvailable&&u(`发现新版本 ${t.latest}，可在「设置 → 关于」中更新`,{tone:"success",duration:6e3}))}),U("update:progress",t=>{t&&(i.update.progress={...i.update.progress||{},...t},k())}),U("update:downloaded",t=>{t&&(i.update.progress=null,i.update.pending={name:t.name,path:t.path,bytes:t.bytes,verified:t.verified,mirrorId:t.mirrorId},k(),u(`更新包已下载（${t.verified?"已校验":"未校验"}）：${t.name}`,{tone:t.verified?"success":"warning",duration:5e3}))}),U("update:failed",t=>{i.update.progress=null,i.update.error=t?.message||"下载失败",k()}),U("update:installing",t=>{i.update.progress=null,k(),u(`正在安装 ${t?.name||"更新"} 并重启…`,{duration:4e3})})}function Ar(){const t=new URLSearchParams(location.search);if(!t.toString())return;const e=t.get("theme");if(e){i.config.theme=e;const o=ps(e);o?.mode&&(i.config.themeMode=o.mode)}const n=t.get("tab");n==="settings"?i.settingsOpen=!0:n==="queue"?i.view="queue":n==="playlist"&&(i.view="playlist",i.playlistId=t.get("pl")||i.playlists[1]?.id||null);const s=t.get("pv");s&&(i.pvMode=s,i.config.playerViewMode=s),t.get("view")==="player"&&(i.playerOpen=!0),t.get("playing")==="1"&&(i.playing=!0,i.position=Number(t.get("pos")||62e3)),t.get("scan")==="1"&&(i.scanning=!0,setTimeout(()=>{i.scanning=!1,k()},8e3)),t.get("query")&&(i.query=t.get("query"));const a=Number(t.get("songs"));if(!$()&&Number.isFinite(a)&&a>i.songs.length){const o=i.songs.slice(),l=o.slice();for(;l.length<a;){const d=l.length,p=o[d%o.length];l.push({...p,id:`bench_${d}`,path:`C:/bench/${d}.${p.ext||"mp3"}`})}i.songs=l,i.allSongsRaw=l.slice(),k()}const r=t.get("density");r&&["compact","cozy","roomy"].includes(r)&&(i.config.listDensity=r),t.get("album")==="off"&&(i.config.showAlbumColumn=!1)}async function $h(){await vc(),Ar();const t=gh();if(await vh(),sp().then(()=>{jt(i.config.playerViewMode||""),jr()&&cd()}),gc(),fd(),await $d(),If(),_h(),wh(),Ar(),await ou(),lu(),li(),vo(),hh(),fh(),await t,await Le(i.config),qa(),requestAnimationFrame(()=>requestAnimationFrame(il)),await _n(),await Ds(),_c().catch(()=>{}),yc(),ul(),window.addEventListener("beforeunload",()=>{un()}),document.body.dataset.ready="true",fetch("/boot/booted",{cache:"no-store",keepalive:!0}).catch(()=>{}),new URLSearchParams(location.search).get("probe")==="1"){const{runProbe:e}=await _t(async()=>{const{runProbe:n}=await import("./probe-B9RoGxta.js");return{runProbe:n}},[]);setTimeout(()=>{const n=e();window.__probeReport=n,console.info("[probe]",n)},600)}$()||console.info(`%c浏览器预览模式%c
当前使用假数据渲染界面。接入 Go + Wails3 后端后，同名前端的 store/bridge 会自动改走后端方法。`,"background:#fff;color:#000;padding:2px 6px;border-radius:4px;font-weight:700","color:#888")}$h().catch(t=>{console.error("[app] 启动失败",t),u(`启动失败：${t.message}`,{tone:"error",duration:6e3})});window.addEventListener("unhandledrejection",t=>{const e=t.reason,n=e?.message||String(e||"未知错误");/no backend|preview:/i.test(n)||(console.error("[app] 未处理的异步错误",e),u(n.length>120?`${n.slice(0,120)}…`:n,{tone:"error",duration:6e3}))});window.addEventListener("error",t=>{t.message&&console.error("[app] 运行时错误",t.error||t.message)});window.__app={state:i,commit:k,navigate:Mt,openPlayer:qo,closePlayer:Rs,rescan:Mr,doRescan:xn,currentSong:ze,isLiked:nt,nextIndex:bc,setPlayerViewMode:jt,applyGainForSong:Kt,skinsToken:()=>b.skinsToken()};const wi=Object.freeze(Object.defineProperty({__proto__:null,closeCoverPanel:dn,openCoverPanel:Yf},Symbol.toStringTag,{value:"Module"}));
