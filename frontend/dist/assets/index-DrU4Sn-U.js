const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/base-CTww9QTQ.js","assets/bridge-CJipA69-.js"])))=>i.map(i=>d[i]);
import{i as $,b as m,d as Fo,f as D,g as Ct,o as K,h as pi,D as ga,j as mt,k as Ve,u as An,l as Da,n as zo,p as Wo,q as Uo}from"./bridge-CJipA69-.js";import{j as Ho,E as _t,s as i,c as x,t as u,a as wn,e as hs,r as Us,f as fr,g as ve,d as ae,M as be,A as F,h as f,b as p,k as jo,p as ft,l as ze,o as hn,m as ne,n as Vo,q as Go,u as Ko,v as Yo,w as Xo,L as Un,x as Ne,y as $t,z as hr,B as mr,C as Je,D as mn,F as Qo,$ as ms,G as Ze,H as Hs,I as $n,J as js,K as Jo,N as Zo,O as el,P as dt,Q as gn,R as gs,S as gr,T as Ot,U as vs,V as vr,W as va,X as tl,Y as fi,Z as nl,_ as br,a0 as kn,a1 as yr,a2 as al,a3 as sl,a4 as il,a5 as rl,a6 as bs,a7 as ys,a8 as ol,a9 as _r,aa as an,ab as ll,ac as cl,ad as dl,ae as ul,af as pl,ag as wr,ah as fl}from"./base-CTww9QTQ.js";import{r as Sn,a as Lt,f as Vs,p as _s,l as hl,u as ml,b as Qt,s as gl,c as ws,m as vl,d as hi}from"./index-Dxs4dFmt.js";const bl="modulepreload",yl=function(t){return"/"+t},mi={},ht=function(e,n,a){let s=Promise.resolve();if(n&&n.length>0){let c=function(d){return Promise.all(d.map(g=>Promise.resolve(g).then(h=>({status:"fulfilled",value:h}),h=>({status:"rejected",reason:h}))))};document.getElementsByTagName("link");const o=document.querySelector("meta[property=csp-nonce]"),l=o?.nonce||o?.getAttribute("nonce");s=c(n.map(d=>{if(d=yl(d),d in mi)return;mi[d]=!0;const g=d.endsWith(".css"),h=g?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${d}"]${h}`))return;const y=document.createElement("link");if(y.rel=g?"stylesheet":bl,g||(y.as="script"),y.crossOrigin="",y.href=d,l&&y.setAttribute("nonce",l),document.head.appendChild(y),g)return new Promise((S,k)=>{y.addEventListener("load",S),y.addEventListener("error",()=>k(new Error(`Unable to preload CSS for ${d}`)))})}))}function r(o){const l=new Event("vite:preloadError",{cancelable:!0});if(l.payload=o,window.dispatchEvent(l),!l.defaultPrevented)throw o}return s.then(o=>{for(const l of o||[])l.status==="rejected"&&r(l.reason);return e().catch(r)})};const _l={CHILD:2},Gs=t=>(...e)=>({_$litDirective$:t,values:e});let Ks=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,n,a){this._$Ct=e,this._$AM=n,this._$Ci=a}_$AS(e,n){return this.update(e,n)}update(e,n){return this.render(...n)}};const{I:wl}=Ho,gi=t=>t,vi=()=>document.createComment(""),Vt=(t,e,n)=>{const a=t._$AA.parentNode,s=e===void 0?t._$AB:e._$AA;if(n===void 0){const r=a.insertBefore(vi(),s),o=a.insertBefore(vi(),s);n=new wl(r,o,t,t.options)}else{const r=n._$AB.nextSibling,o=n._$AM,l=o!==t;if(l){let c;n._$AQ?.(t),n._$AM=t,n._$AP!==void 0&&(c=t._$AU)!==o._$AU&&n._$AP(c)}if(r!==s||l){let c=n._$AA;for(;c!==r;){const d=gi(c).nextSibling;gi(a).insertBefore(c,s),c=d}}}return n},at=(t,e,n=t)=>(t._$AI(e,n),t),$l={},$r=(t,e=$l)=>t._$AH=e,kl=t=>t._$AH,Aa=t=>{t._$AR(),t._$AA.remove()};const bi=(t,e,n)=>{const a=new Map;for(let s=e;s<=n;s++)a.set(t[s],s);return a},Me=Gs(class extends Ks{constructor(t){if(super(t),t.type!==_l.CHILD)throw Error("repeat() can only be used in text expressions")}dt(t,e,n){let a;n===void 0?n=e:e!==void 0&&(a=e);const s=[],r=[];let o=0;for(const l of t)s[o]=a?a(l,o):o,r[o]=n(l,o),o++;return{values:r,keys:s}}render(t,e,n){return this.dt(t,e,n).values}update(t,[e,n,a]){const s=kl(t),{values:r,keys:o}=this.dt(e,n,a);if(!Array.isArray(s))return this.ut=o,r;const l=this.ut??=[],c=[];let d,g,h=0,y=s.length-1,S=0,k=r.length-1;for(;h<=y&&S<=k;)if(s[h]===null)h++;else if(s[y]===null)y--;else if(l[h]===o[S])c[S]=at(s[h],r[S]),h++,S++;else if(l[y]===o[k])c[k]=at(s[y],r[k]),y--,k--;else if(l[h]===o[k])c[k]=at(s[h],r[k]),Vt(t,c[k+1],s[h]),h++,k--;else if(l[y]===o[S])c[S]=at(s[y],r[S]),Vt(t,s[h],s[y]),y--,S++;else if(d===void 0&&(d=bi(o,S,k),g=bi(l,h,y)),d.has(l[h]))if(d.has(l[y])){const _=g.get(o[S]),P=_!==void 0?s[_]:null;if(P===null){const z=Vt(t,s[h]);at(z,r[S]),c[S]=z}else c[S]=at(P,r[S]),Vt(t,s[h],P),s[_]=null;S++}else Aa(s[y]),y--;else Aa(s[h]),h++;for(;S<=k;){const _=Vt(t,c[k+1]);at(_,r[S]),c[S++]=_}for(;h<=y;){const _=s[h++];_!==null&&Aa(_)}return this.ut=o,$r(t,c),_t}}),Sl=[{id:"dark-minimal",name:"深色 · 黑白极简",mode:"dark",builtin:!0,swatch:["#08080a","#1b1b1f","#3a3a42","#f4f4f6","#ff4d6d"]},{id:"light-minimal",name:"浅色 · 黑白极简",mode:"light",builtin:!0,swatch:["#f2f2f4","#ffffff","#d8d8dd","#14141a","#e8384f"]},{id:"cover-dark",name:"封面取色 · 深色",mode:"dark",builtin:!0,swatch:["#0b0b12","#2a2a31","#6b6b76","#f7f7fa","#ff4d6d"]}],te=Sl.slice();let kr=0;function xl(){return kr}function ba(){return te}function ea(t){return te.find(e=>e.id===t)||te[0]}async function ya(){if(!$())return te;try{const t=await m.listThemes();if(!Array.isArray(t)||!t.length)return te;for(const e of t){if(!e?.id)continue;const n=await m.loadTheme(e.id);typeof n=="string"&&n.trim()&&El(e.id,n)}Cl(t)}catch(t){console.warn("[theme] 主题目录扫描失败",t)}return te}function Cl(t){const e=[],n=new Set;for(const a of t){if(!a?.id||n.has(a.id))continue;n.add(a.id);const s={id:a.id,name:a.name||a.id,mode:a.mode||"dark",swatch:Array.isArray(a.swatch)?a.swatch:[],builtin:!!a.builtin},r=te.find(o=>o.id===a.id);r?(Object.assign(r,s),e.push(r)):e.push(s)}for(const a of te)e.includes(a)||Us(`theme-file-${a.id}`,"");return te.length=0,te.push(...e),kr+=1,te}async function Tl(t){return await m.deleteTheme(t),await ya(),{removed:!te.some(n=>n.id===t),themeIds:te.map(n=>n.id)}}function El(t,e){Us(`theme-file-${t}`,e)}const Il=["--seed","--seed-2","--bg-app","--bg-window"],Dl=["--seed","--seed-2"];function Al(t){return document.documentElement.style.getPropertyValue(t).trim()?String(document.documentElement.style.getPropertyValue(t)):null}function Ml(){const t=document.documentElement,e={};for(const n of Dl){const a=Al(n);a&&(e[n]=a)}for(const n of Il)t.style.removeProperty(n);return e}const Hn="cover-dark";function vn(t){return!!t&&!Fo(t)}let yi=null,Ma=null,Pa=null;async function Pe(t){const e=document.documentElement,n=window.matchMedia("(prefers-color-scheme: dark)").matches,a=Ml();a["--seed"]&&(Ma=a["--seed"]),a["--seed-2"]&&(Pa=a["--seed-2"]);let s=t.theme||"dark-minimal";if(t.themeMode==="system"){const h=n?"dark":"light",y=te.find(S=>S.mode===h&&S.id!=="cover-dark");y&&(s=y.id)}else if(te.find(h=>h.id===s)?.mode!==t.themeMode){const h=te.find(y=>y.mode===t.themeMode&&y.id!=="cover-dark");h&&(s=h.id)}e.dataset.theme=s,e.dataset.mode=te.find(h=>h.id===s)?.mode||t.themeMode||"dark",t.theme=s;const r=_i(t,s),o=_i(t,s,!0),l=t.accentFromCover!==!1;(t.accentFromCover===!1||yi!==null&&s!==Hn)&&(Ma=null,Pa=null);const d=r??(l?Ma:null),g=o??Pa??d;return wn({"--glass-blur":t.glassBlurCustom?`${t.glassBlur}px`:null,"--dur":hs(t),"--seed":d,"--seed-2":g}),yi=d&&s===Hn?Hn:null,Rl(),Ol(),t.glassAlphaCustom&&Ys(t.glassAlpha),s}function _i(t,e,n=!1){return!t||t.accentFromCover!==!0||e!=="cover-dark"?null:Rt(n?t.coverSeed2:t.coverSeed)||null}async function Pl(){const e=ea(i.config.theme)?.mode==="light"?"dark":"light";i.config.themeMode=e,await Pe(i.config),x(),u(e==="dark"?"已切换到深色主题":"已切换到浅色主题",{duration:1500})}let gt=null;function jn(t){return gt||(gt=document.createElement("div"),gt.style.cssText="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;",document.body.appendChild(gt)),gt.style.backgroundColor=t,getComputedStyle(gt).backgroundColor}function Oa(t,e){const n=Math.max(0,Math.min(1,e)),a=String(t),s=a.match(/rgba?\(([^)]+)\)/);if(s){const o=s[1].split(/[,/]/).map(g=>parseFloat(g.trim())),[l,c,d]=o;if([l,c,d].every(g=>Number.isFinite(g)))return`rgba(${Math.round(l)}, ${Math.round(c)}, ${Math.round(d)}, ${n})`}const r=a.match(/color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);if(r){const[o,l,c]=r.slice(1,4).map(d=>Math.round(parseFloat(d)*255));if([o,l,c].every(d=>Number.isFinite(d)))return`rgba(${o}, ${l}, ${c}, ${n})`}return null}function $s(){const t=String(jn("var(--glass-bg)")),e=t.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/),n=t.match(/\/\s*([\d.]+)\s*\)/),a=parseFloat(e&&e[1]||n&&n[1]||"");return Number.isFinite(a)?Math.round(a*100):62}let Jt=null;function Ol(){Jt=null}function Ll(){return Jt||(wn({"--glass-bg":null,"--glass-bg-strong":null,"--glass-bg-weak":null}),Jt={bg:jn("var(--glass-bg)"),strong:jn("var(--glass-bg-strong)"),weak:jn("var(--glass-bg-weak)")},Jt)}function Ys(t){const e=Math.max(0,Math.min(1,(Number(t)||0)/100)),n=Ll();wn({"--glass-bg":Oa(n.bg,e),"--glass-bg-strong":Oa(n.strong,Math.min(1,e+.18)),"--glass-bg-weak":Oa(n.weak,Math.max(0,e-.22))})}function Rl(){const t=document.body;t&&(t.dataset.styleEpoch=String((Number(t.dataset.styleEpoch)||0)+1))}function ks(){const t=getComputedStyle(document.documentElement).getPropertyValue("--glass-blur"),e=parseFloat(t);return Number.isFinite(e)?e:22}function Rt(t){const e=String(t??"").trim();if(!e)return"";const n=e.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);if(n){let s=n[1].toLowerCase();return s.length===3&&(s=s[0]+s[0]+s[1]+s[1]+s[2]+s[2]),`#${s}`}const a=e.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);if(a){const s=r=>Math.max(0,Math.min(255,Math.round(Number(r)))).toString(16).padStart(2,"0");return`#${s(a[1])}${s(a[2])}${s(a[3])}`}return""}let wi="";function Nl(t){const e=document.documentElement.dataset.theme||"",n=typeof t=="string"?t.trim():"",a=e===Hn?n:"";a!==wi&&(wi=a,wn({"--cover-bg":a?`url("${a.replace(/["\\]/g,"\\$&")}")`:null}))}function ql(t,e){const n=Rt(t),a=Rt(e)||n;return n?(wn({"--seed":n,"--seed-2":a}),i.config.coverSeed!==n||i.config.coverSeed2!==a?(i.config.coverSeed=n,i.config.coverSeed2=a,Fl(),!0):!1):!1}const Bl="music-player.cover-seed.v1";function Fl(){try{localStorage.setItem(Bl,JSON.stringify({seed:i.config.coverSeed||"",seed2:i.config.coverSeed2||"",theme:i.config.theme||""}))}catch{}}function $i(t){try{const e=document.createElement("canvas"),n=32;e.width=n,e.height=n;const a=e.getContext("2d",{willReadFrequently:!0});a.drawImage(t,0,0,n,n);const{data:s}=a.getImageData(0,0,n,n);let r=0,o=0,l=0,c=0,d=0,g=0,h=0,y=0;for(let k=0;k<s.length;k+=4){if(s[k+3]<8)continue;const _=s[k],P=s[k+1],z=s[k+2];d+=_,g+=P,h+=z,y+=1;const N=Math.max(_,P,z),re=Math.min(_,P,z);if(N<26)continue;const Q=N===0?0:(N-re)/N;if(Q<.12)continue;const ye=Q*Q*(.35+N/255);r+=_*ye,o+=P*ye,l+=z*ye,c+=ye}const S=c>0?[r/c,o/c,l/c]:y>0?[d/y,g/y,h/y]:null;return S?`rgb(${S.map(k=>Math.round(Math.max(0,Math.min(255,k)))).join(", ")})`:null}catch{return null}}function La(){i.query="",x()}function Tt(t,e=null){if(i.settingsOpen&&ta(),t==="settings"){Sr();return}i.view=t,i.playlistId=t==="playlist"?e:null,i.playerOpen=!1,i.query="",i.playlistSelecting=!1,i.selectedIds=new Set,i.queueOpen=!1,x()}function Sr(t=null){i.settingsOpen=!0,t&&(i.settingsSection=t),x()}function ta(){i.settingsOpen=!1,x()}function zl(t=null){i.settingsOpen?ta():Sr(t)}function xr(){return i.settingsOpen===!0}function Wl(){i.settingsOpen&&(i.settingsRev=(i.settingsRev||0)+1,x(),ve())}async function bn({manual:t=!1}={}){if(!i.scanning){i.scanText="正在扫描音乐文件夹…",x();try{const e=await fr({silent:!t});e&&u(`扫描完成：保留 ${D(e.kept)} 首${e.excluded?`，过滤 ${D(e.excluded)} 个`:""}${e.added?`，新增 ${D(e.added)}`:""}${e.removed?`，移除 ${D(e.removed)}`:""}`,{tone:"success",duration:3600})}finally{i.scanning=!1,x()}}}const Cr="music-player.search.history.v1",Ul=20;function Ra(){try{const t=localStorage.getItem(Cr),e=t?JSON.parse(t):[];return Array.isArray(e)?e.filter(n=>typeof n=="string"&&n.trim()):[]}catch{return[]}}function Na(t){try{localStorage.setItem(Cr,JSON.stringify(t.slice(0,Ul)))}catch{}}const R={keyword:"",seq:0,results:[],query:"",loading:!1,message:"",rev:0};function Te(){R.rev+=1,ve()}class Hl extends be{static deps=e=>[e.searchOpen,R.rev];get panelEl(){return this.querySelector("#search-overlay")}updated(){const e=this.panelEl;if(e){if(i.searchOpen){this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden&&(e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{i.searchOpen&&(e.dataset.state="opened")}),requestAnimationFrame(()=>{const n=this.querySelector("#search-input");n?.focus(),n?.select()}));return}e.hidden||(e.dataset.state="closed",this._closeTimer||(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!i.searchOpen&&e&&(e.hidden=!0)},260)))}}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),super.disconnectedCallback()}render(){const e=R,n=Ra(),a=!!e.keyword.trim();return p`
      <section
        class="search-overlay"
        id="search-overlay"
        data-state="closed"
        hidden
        aria-label="搜索"
        @click=${s=>this.onClick(s)}
        @keydown=${s=>this.onKey(s)}
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
                @input=${s=>{R.keyword=s.target.value,Te()}}
                @keydown=${s=>{s.key==="Enter"&&(s.preventDefault(),this.submitSearch()),s.key==="Escape"&&(s.preventDefault(),R.keyword.trim()?this.clearSearch({focus:!0}):Vn())}}
              />
              <button
                class="search-overlay__clear"
                id="search-clear"
                type="button"
                data-tip="清空搜索"
                aria-label="清空搜索"
                ?hidden=${!a}
                @click=${()=>this.clearSearch({focus:!0})}
              >
                ${f("close")}
              </button>
            </div>
            <button
              class="search-overlay__close"
              type="button"
              data-search-close
              data-tip="关闭（结果会保留）"
              aria-label="关闭搜索"
              @click=${()=>Vn()}
            >
              ${f("close")}
            </button>
          </div>

          <div class="search-overlay__history" id="search-history" ?hidden=${a||!n.length}>
            ${!a&&n.length?p`
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
                      ${n.map(s=>p`
                          <span class="search-overlay__history-chip" data-history-keyword=${s}>
                            <button
                              type="button"
                              class="search-overlay__history-key"
                              data-history-act="use"
                              @click=${()=>this.useHistory(s)}
                            >
                              ${s}
                            </button>
                            <button
                              type="button"
                              class="search-overlay__history-del"
                              data-history-act="del"
                              aria-label="删除「${s}」"
                              @click=${()=>this.removeHistory(s)}
                            >
                              ${f("close")}
                            </button>
                          </span>
                        `)}
                    </div>
                  `:F}
          </div>

          <div class="search-overlay__head">
            <span class="search-overlay__headline" id="search-headline">${this.headline()}</span>
          </div>
          <div class="search-overlay__body" id="search-body">${this.bodyContent()}</div>
        </div>
      </section>
    `}headline(){const e=R;return e.loading?"搜索中…":e.query?`在线「${e.query}」${D(e.results.length)} 个结果`:""}bodyContent(){const e=R;return e.loading?p`<div class="search-overlay__loading">
        <span class="search-overlay__spinner"></span>正在搜索「${e.keyword.trim()}」…
      </div>`:e.message?this.empty(e.message):e.results.length?Me(e.results,n=>n.id,n=>p`
        <div
          class="search-row"
          data-search-id=${n.id}
          data-search-online="1"
          role="button"
          tabindex="0"
          @click=${()=>qa(n.id)}
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
              @click=${a=>{a.stopPropagation(),qa(n.id)}}
            >
              ${f("play")}<span>试听</span>
            </button>
            <button
              class="btn btn--sm"
              type="button"
              data-search-act="download"
              data-id=${n.id}
              @click=${a=>{a.stopPropagation(),Gl(n)}}
            >
              ${f("file")}<span>下载</span>
            </button>
          </span>
        </div>
      `):this.empty(e.query?"没有搜到在线歌曲，换个关键词试试":"输入关键词后按回车搜索在线歌曲")}empty(e){return p`<div class="search-overlay__empty">${f("search")}<span>${e}</span></div>`}onClick(e){(e.target.closest("[data-search-close]")||e.target===this.panelEl)&&Vn()}onKey(e){if(e.key!=="Enter"&&e.key!==" ")return;const n=e.target.closest?.("[data-search-id]");n&&(e.preventDefault(),qa(n.dataset.searchId))}addHistory(e){const n=(e||"").trim();if(!n)return;const a=Ra().filter(s=>s!==n);a.unshift(n),Na(a),Te()}removeHistory(e){Na(Ra().filter(n=>n!==e)),Te()}clearHistory(){Na([]),Te()}useHistory(e){R.keyword=e,Te(),this.submitSearch()}submitSearch(){const e=(R.keyword||"").trim();if(!e){this.clearSearch({focus:!0});return}this.addHistory(e),this.runOnlineSearch(e)}clearSearch({focus:e=!1}={}){R.keyword="",R.results=[],R.query="",R.message="",R.loading=!1,R.seq+=1,Te(),e&&requestAnimationFrame(()=>this.querySelector("#search-input")?.focus())}async runOnlineSearch(e){R.query="",R.results=[],R.message="",R.loading=!0,Te();const n=++R.seq;if(!$()){R.loading=!1,R.message="浏览器预览下没有在线搜索后端，请在应用里试",Te();return}try{const a=await m.onlineSearch(e,1,24);if(n!==R.seq)return;R.results=Array.isArray(a)?a:[],R.query=e,R.loading=!1,Te()}catch(a){if(n!==R.seq)return;R.results=[],R.query=e,R.loading=!1,R.message=`在线搜索失败：${a?.message??a}`,Te()}}}ae("mp-search-overlay",Hl);function jl(t){!i.searchOpen?Tr():Vn()}function Tr(){i.searchOpen=!0,x()}function Vn(){i.searchOpen=!1,x()}function Vl(){document.addEventListener("keydown",t=>{!(t.ctrlKey||t.metaKey)||t.key.toLowerCase()!=="f"||(t.preventDefault(),Tr())})}function qa(t){const e=R.results.find(r=>r.id===t);if(!e)return;const n=jo({id:e.id,title:e.title||"未命名",artist:e.artist||"未知",album:e.album||"在线",ext:e.ext||"m4a",duration:e.duration||0,size:0,sampleRate:0,bitrate:0,addedAt:Date.now(),playCount:0,path:"",cover:"",coverUrl:e.coverUrl||"",streamUrl:e.streamUrl||"",downloadUrl:e.downloadUrl||"",bvid:e.bvid||"",online:!0}),a=i.queue.includes(n.id)?i.queue.slice():[...i.queue,n.id],s=a.indexOf(n.id);ft(a,s,{type:"online",id:null}),u(`已加入播放列表并开始试听：${n.title}`,{tone:"success",duration:2200})}async function Gl(t){if(!$()){u("浏览器预览无法下载",{tone:"warning"});return}try{const e=await m.downloadStart(t.bvid||String(t.id).replace(/^bili:/,""),t.title||"",t.duration||0);if(!e?.started){u(e?.reason==="already-running"?"这首歌正在下载中":"无法开始下载",{tone:"warning"});return}u(`开始下载到 ${e.dir}`,{duration:2600})}catch(e){u(`下载失败：${e?.message??e}`,{tone:"error",duration:6e3})}}let Be=[],na=!1,Er=0,Ba=0;function Et(){Er+=1,ve()}function sn(){const t=Be.filter(e=>e?.state==="running").length;return{tasks:Be,running:t,revision:Er,open:na,visible:Be.length>0,badge:t>0?String(t):""}}function Ir(t){na=typeof t=="boolean"?t:!na,Et()}function Kl(){Ir(!1)}async function Yl(){if(!$()){Be=Be.filter(t=>t?.state==="running"),Et();return}try{const t=await m.downloadClearFinished();Ss(t)}catch(t){u(`清除失败：${t?.message??t}`,{tone:"error"})}}function Xl(){const t=Be.find(e=>e?.dir)?.dir||"";m.downloadOpenDir(t).catch(e=>u(`打开目录失败：${e?.message??e}`,{tone:"error"}))}function Ql(t){const e=Be.find(a=>a.id===t),n=e?.path||e?.dir;n&&m.downloadOpenDir(n).catch(a=>u(`打开失败：${a?.message??a}`,{tone:"error"}))}function Ss(t){!t||!Array.isArray(t.tasks)||(Be=t.tasks,Et())}async function Jl(){if(K("download:tasks",e=>{Ba+=1,Ss(e)}),!$()){if(Zl()){Et(),na=!0,Et();return}Et();return}const t=Ba;try{const e=await m.downloadTasks();Ba===t&&Ss(e)}catch(e){console.info("[downloads] 拉取下载任务失败",e?.message??e)}}function Zl(){return $()||new URLSearchParams(location.search).get("downloads")!=="1"?!1:(Be=[{id:"preview-1",bvid:"BV1xx411c7mD",title:"晴天 - 周杰伦",state:"running",done:231e4,total:47e5,dir:"C:\\Users\\Me\\Music\\downloads"},{id:"preview-2",bvid:"BV1yy411c7mE",title:"孤勇者 - 陈奕迅",state:"done",done:39e5,total:39e5,path:"C:\\Users\\Me\\Music\\downloads\\孤勇者 - 陈奕迅.m4a",dir:"C:\\Users\\Me\\Music\\downloads"},{id:"preview-3",bvid:"BV1zz411c7mF",title:"一首标题很长很长、长到面板里必须被省略号截断的测试歌曲",state:"failed",done:12e4,total:5e6,message:"下载到的内容为空",dir:"C:\\Users\\Me\\Music\\downloads"}],!0)}class ec extends be{static deps=()=>{const n=ea(i.config.theme)?.mode!=="light",a=sn();return[n,i.config.themeMode,i.searchOpen,a.visible,a.badge]};render(){const n=ea(i.config.theme)?.mode!=="light",a=sn();return p`
      <header class="titlebar" id="titlebar">
        <div class="titlebar__brand">
          <svg class="titlebar__logo"><use href="#i-music"></use></svg>
          <span>LMPlayer</span>
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
            @click=${()=>jl()}
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
            ?hidden=${!a.visible}
            @click=${()=>Ir()}
          >
            ${f("download")}
            <span class="titlebar__badge" id="download-badge" ?hidden=${!a.badge}>${a.badge}</span>
          </button>
          <button
            class="titlebar__btn"
            id="btn-theme-toggle"
            type="button"
            data-tip=${n?"切换到浅色":"切换到深色"}
            aria-label="切换深浅色"
            @click=${()=>Pl()}
          >
            ${f(n?"sun":"moon")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-settings"
            type="button"
            data-tip="设置"
            aria-label="设置"
            @click=${()=>zl()}
          >
            ${f("settings")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-win-min"
            type="button"
            aria-label="最小化"
            @click=${()=>Fa("min")}
          >
            ${f("minimize")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-win-max"
            type="button"
            aria-label="最大化"
            @click=${()=>Fa("max")}
          >
            ${f("maximize")}
          </button>
          <button
            class="titlebar__btn titlebar__btn--close"
            id="btn-win-close"
            type="button"
            aria-label="关闭"
            @click=${()=>Fa("close")}
          >
            ${f("close")}
          </button>
        </div>
      </header>
    `}}function Fa(t){if(!$()){t==="close"&&window.close();return}t==="min"?m.windowMinimize():t==="max"?m.windowToggleMaximize():m.windowClose()}ae("mp-titlebar",ec);function tc(t,e,n){return(e=ic(e))in t?Object.defineProperty(t,e,{value:n,enumerable:!0,configurable:!0,writable:!0}):t[e]=n,t}function We(){return We=Object.assign?Object.assign.bind():function(t){for(var e=1;e<arguments.length;e++){var n=arguments[e];for(var a in n)({}).hasOwnProperty.call(n,a)&&(t[a]=n[a])}return t},We.apply(null,arguments)}function ki(t,e){var n=Object.keys(t);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(t);e&&(a=a.filter(function(s){return Object.getOwnPropertyDescriptor(t,s).enumerable})),n.push.apply(n,a)}return n}function Oe(t){for(var e=1;e<arguments.length;e++){var n=arguments[e]!=null?arguments[e]:{};e%2?ki(Object(n),!0).forEach(function(a){tc(t,a,n[a])}):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(n)):ki(Object(n)).forEach(function(a){Object.defineProperty(t,a,Object.getOwnPropertyDescriptor(n,a))})}return t}function nc(t,e){if(t==null)return{};var n,a,s=ac(t,e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(t);for(a=0;a<r.length;a++)n=r[a],e.indexOf(n)===-1&&{}.propertyIsEnumerable.call(t,n)&&(s[n]=t[n])}return s}function ac(t,e){if(t==null)return{};var n={};for(var a in t)if({}.hasOwnProperty.call(t,a)){if(e.indexOf(a)!==-1)continue;n[a]=t[a]}return n}function sc(t,e){if(typeof t!="object"||!t)return t;var n=t[Symbol.toPrimitive];if(n!==void 0){var a=n.call(t,e);if(typeof a!="object")return a;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(t)}function ic(t){var e=sc(t,"string");return typeof e=="symbol"?e:e+""}function xs(t){"@babel/helpers - typeof";return xs=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(e){return typeof e}:function(e){return e&&typeof Symbol=="function"&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},xs(t)}var rc="1.15.7";function Fe(t){if(typeof window<"u"&&window.navigator)return!!navigator.userAgent.match(t)}var Ue=Fe(/(?:Trident.*rv[ :]?11\.|msie|iemobile|Windows Phone)/i),xn=Fe(/Edge/i),Si=Fe(/firefox/i),rn=Fe(/safari/i)&&!Fe(/chrome/i)&&!Fe(/android/i),Xs=Fe(/iP(ad|od|hone)/i),Dr=Fe(/chrome/i)&&Fe(/android/i),Ar={capture:!1,passive:!1};function M(t,e,n){t.addEventListener(e,n,!Ue&&Ar)}function A(t,e,n){t.removeEventListener(e,n,!Ue&&Ar)}function aa(t,e){if(e){if(e[0]===">"&&(e=e.substring(1)),t)try{if(t.matches)return t.matches(e);if(t.msMatchesSelector)return t.msMatchesSelector(e);if(t.webkitMatchesSelector)return t.webkitMatchesSelector(e)}catch{return!1}return!1}}function Mr(t){return t.host&&t!==document&&t.host.nodeType&&t.host!==t?t.host:t.parentNode}function ke(t,e,n,a){if(t){n=n||document;do{if(e!=null&&(e[0]===">"?t.parentNode===n&&aa(t,e):aa(t,e))||a&&t===n)return t;if(t===n)break}while(t=Mr(t))}return null}var xi=/\s+/g;function he(t,e,n){if(t&&e)if(t.classList)t.classList[n?"add":"remove"](e);else{var a=(" "+t.className+" ").replace(xi," ").replace(" "+e+" "," ");t.className=(a+(n?" "+e:"")).replace(xi," ")}}function T(t,e,n){var a=t&&t.style;if(a){if(n===void 0)return document.defaultView&&document.defaultView.getComputedStyle?n=document.defaultView.getComputedStyle(t,""):t.currentStyle&&(n=t.currentStyle),e===void 0?n:n[e];!(e in a)&&e.indexOf("webkit")===-1&&(e="-webkit-"+e),a[e]=n+(typeof n=="string"?"":"px")}}function It(t,e){var n="";if(typeof t=="string")n=t;else do{var a=T(t,"transform");a&&a!=="none"&&(n=a+" "+n)}while(!e&&(t=t.parentNode));var s=window.DOMMatrix||window.WebKitCSSMatrix||window.CSSMatrix||window.MSCSSMatrix;return s&&new s(n)}function Pr(t,e,n){if(t){var a=t.getElementsByTagName(e),s=0,r=a.length;if(n)for(;s<r;s++)n(a[s],s);return a}return[]}function Ae(){var t=document.scrollingElement;return t||document.documentElement}function G(t,e,n,a,s){if(!(!t.getBoundingClientRect&&t!==window)){var r,o,l,c,d,g,h;if(t!==window&&t.parentNode&&t!==Ae()?(r=t.getBoundingClientRect(),o=r.top,l=r.left,c=r.bottom,d=r.right,g=r.height,h=r.width):(o=0,l=0,c=window.innerHeight,d=window.innerWidth,g=window.innerHeight,h=window.innerWidth),(e||n)&&t!==window&&(s=s||t.parentNode,!Ue))do if(s&&s.getBoundingClientRect&&(T(s,"transform")!=="none"||n&&T(s,"position")!=="static")){var y=s.getBoundingClientRect();o-=y.top+parseInt(T(s,"border-top-width")),l-=y.left+parseInt(T(s,"border-left-width")),c=o+r.height,d=l+r.width;break}while(s=s.parentNode);if(a&&t!==window){var S=It(s||t),k=S&&S.a,_=S&&S.d;S&&(o/=_,l/=k,h/=k,g/=_,c=o+g,d=l+h)}return{top:o,left:l,bottom:c,right:d,width:h,height:g}}}function Ci(t,e,n){for(var a=Qe(t,!0),s=G(t)[e];a;){var r=G(a)[n],o=void 0;if(o=s>=r,!o)return a;if(a===Ae())break;a=Qe(a,!1)}return!1}function Nt(t,e,n,a){for(var s=0,r=0,o=t.children;r<o.length;){if(o[r].style.display!=="none"&&o[r]!==C.ghost&&(a||o[r]!==C.dragged)&&ke(o[r],n.draggable,t,!1)){if(s===e)return o[r];s++}r++}return null}function Qs(t,e){for(var n=t.lastElementChild;n&&(n===C.ghost||T(n,"display")==="none"||e&&!aa(n,e));)n=n.previousElementSibling;return n||null}function _e(t,e){var n=0;if(!t||!t.parentNode)return-1;for(;t=t.previousElementSibling;)t.nodeName.toUpperCase()!=="TEMPLATE"&&t!==C.clone&&(!e||aa(t,e))&&n++;return n}function Ti(t){var e=0,n=0,a=Ae();if(t)do{var s=It(t),r=s.a,o=s.d;e+=t.scrollLeft*r,n+=t.scrollTop*o}while(t!==a&&(t=t.parentNode));return[e,n]}function oc(t,e){for(var n in t)if(t.hasOwnProperty(n)){for(var a in e)if(e.hasOwnProperty(a)&&e[a]===t[n][a])return Number(n)}return-1}function Qe(t,e){if(!t||!t.getBoundingClientRect)return Ae();var n=t,a=!1;do if(n.clientWidth<n.scrollWidth||n.clientHeight<n.scrollHeight){var s=T(n);if(n.clientWidth<n.scrollWidth&&(s.overflowX=="auto"||s.overflowX=="scroll")||n.clientHeight<n.scrollHeight&&(s.overflowY=="auto"||s.overflowY=="scroll")){if(!n.getBoundingClientRect||n===document.body)return Ae();if(a||e)return n;a=!0}}while(n=n.parentNode);return Ae()}function lc(t,e){if(t&&e)for(var n in e)e.hasOwnProperty(n)&&(t[n]=e[n]);return t}function za(t,e){return Math.round(t.top)===Math.round(e.top)&&Math.round(t.left)===Math.round(e.left)&&Math.round(t.height)===Math.round(e.height)&&Math.round(t.width)===Math.round(e.width)}var on;function Or(t,e){return function(){if(!on){var n=arguments,a=this;n.length===1?t.call(a,n[0]):t.apply(a,n),on=setTimeout(function(){on=void 0},e)}}}function cc(){clearTimeout(on),on=void 0}function Lr(t,e,n){t.scrollLeft+=e,t.scrollTop+=n}function Rr(t){var e=window.Polymer,n=window.jQuery||window.Zepto;return e&&e.dom?e.dom(t).cloneNode(!0):n?n(t).clone(!0)[0]:t.cloneNode(!0)}function Nr(t,e,n){var a={};return Array.from(t.children).forEach(function(s){var r,o,l,c;if(!(!ke(s,e.draggable,t,!1)||s.animated||s===n)){var d=G(s);a.left=Math.min((r=a.left)!==null&&r!==void 0?r:1/0,d.left),a.top=Math.min((o=a.top)!==null&&o!==void 0?o:1/0,d.top),a.right=Math.max((l=a.right)!==null&&l!==void 0?l:-1/0,d.right),a.bottom=Math.max((c=a.bottom)!==null&&c!==void 0?c:-1/0,d.bottom)}}),a.width=a.right-a.left,a.height=a.bottom-a.top,a.x=a.left,a.y=a.top,a}var pe="Sortable"+new Date().getTime();function dc(){var t=[],e;return{captureAnimationState:function(){if(t=[],!!this.options.animation){var a=[].slice.call(this.el.children);a.forEach(function(s){if(!(T(s,"display")==="none"||s===C.ghost)){t.push({target:s,rect:G(s)});var r=Oe({},t[t.length-1].rect);if(s.thisAnimationDuration){var o=It(s,!0);o&&(r.top-=o.f,r.left-=o.e)}s.fromRect=r}})}},addAnimationState:function(a){t.push(a)},removeAnimationState:function(a){t.splice(oc(t,{target:a}),1)},animateAll:function(a){var s=this;if(!this.options.animation){clearTimeout(e),typeof a=="function"&&a();return}var r=!1,o=0;t.forEach(function(l){var c=0,d=l.target,g=d.fromRect,h=G(d),y=d.prevFromRect,S=d.prevToRect,k=l.rect,_=It(d,!0);_&&(h.top-=_.f,h.left-=_.e),d.toRect=h,d.thisAnimationDuration&&za(y,h)&&!za(g,h)&&(k.top-h.top)/(k.left-h.left)===(g.top-h.top)/(g.left-h.left)&&(c=pc(k,y,S,s.options)),za(h,g)||(d.prevFromRect=g,d.prevToRect=h,c||(c=s.options.animation),s.animate(d,k,h,c)),c&&(r=!0,o=Math.max(o,c),clearTimeout(d.animationResetTimer),d.animationResetTimer=setTimeout(function(){d.animationTime=0,d.prevFromRect=null,d.fromRect=null,d.prevToRect=null,d.thisAnimationDuration=null},c),d.thisAnimationDuration=c)}),clearTimeout(e),r?e=setTimeout(function(){typeof a=="function"&&a()},o):typeof a=="function"&&a(),t=[]},animate:function(a,s,r,o){if(o){T(a,"transition",""),T(a,"transform","");var l=It(this.el),c=l&&l.a,d=l&&l.d,g=(s.left-r.left)/(c||1),h=(s.top-r.top)/(d||1);a.animatingX=!!g,a.animatingY=!!h,T(a,"transform","translate3d("+g+"px,"+h+"px,0)"),this.forRepaintDummy=uc(a),T(a,"transition","transform "+o+"ms"+(this.options.easing?" "+this.options.easing:"")),T(a,"transform","translate3d(0,0,0)"),typeof a.animated=="number"&&clearTimeout(a.animated),a.animated=setTimeout(function(){T(a,"transition",""),T(a,"transform",""),a.animated=!1,a.animatingX=!1,a.animatingY=!1},o)}}}}function uc(t){return t.offsetWidth}function pc(t,e,n,a){return Math.sqrt(Math.pow(e.top-t.top,2)+Math.pow(e.left-t.left,2))/Math.sqrt(Math.pow(e.top-n.top,2)+Math.pow(e.left-n.left,2))*a.animation}var vt=[],Wa={initializeByDefault:!0},Cn={mount:function(e){for(var n in Wa)Wa.hasOwnProperty(n)&&!(n in e)&&(e[n]=Wa[n]);vt.forEach(function(a){if(a.pluginName===e.pluginName)throw"Sortable: Cannot mount plugin ".concat(e.pluginName," more than once")}),vt.push(e)},pluginEvent:function(e,n,a){var s=this;this.eventCanceled=!1,a.cancel=function(){s.eventCanceled=!0};var r=e+"Global";vt.forEach(function(o){n[o.pluginName]&&(n[o.pluginName][r]&&n[o.pluginName][r](Oe({sortable:n},a)),n.options[o.pluginName]&&n[o.pluginName][e]&&n[o.pluginName][e](Oe({sortable:n},a)))})},initializePlugins:function(e,n,a,s){vt.forEach(function(l){var c=l.pluginName;if(!(!e.options[c]&&!l.initializeByDefault)){var d=new l(e,n,e.options);d.sortable=e,d.options=e.options,e[c]=d,We(a,d.defaults)}});for(var r in e.options)if(e.options.hasOwnProperty(r)){var o=this.modifyOption(e,r,e.options[r]);typeof o<"u"&&(e.options[r]=o)}},getEventProperties:function(e,n){var a={};return vt.forEach(function(s){typeof s.eventProperties=="function"&&We(a,s.eventProperties.call(n[s.pluginName],e))}),a},modifyOption:function(e,n,a){var s;return vt.forEach(function(r){e[r.pluginName]&&r.optionListeners&&typeof r.optionListeners[n]=="function"&&(s=r.optionListeners[n].call(e[r.pluginName],a))}),s}};function fc(t){var e=t.sortable,n=t.rootEl,a=t.name,s=t.targetEl,r=t.cloneEl,o=t.toEl,l=t.fromEl,c=t.oldIndex,d=t.newIndex,g=t.oldDraggableIndex,h=t.newDraggableIndex,y=t.originalEvent,S=t.putSortable,k=t.extraEventProperties;if(e=e||n&&n[pe],!!e){var _,P=e.options,z="on"+a.charAt(0).toUpperCase()+a.substr(1);window.CustomEvent&&!Ue&&!xn?_=new CustomEvent(a,{bubbles:!0,cancelable:!0}):(_=document.createEvent("Event"),_.initEvent(a,!0,!0)),_.to=o||n,_.from=l||n,_.item=s||n,_.clone=r,_.oldIndex=c,_.newIndex=d,_.oldDraggableIndex=g,_.newDraggableIndex=h,_.originalEvent=y,_.pullMode=S?S.lastPutMode:void 0;var N=Oe(Oe({},k),Cn.getEventProperties(a,e));for(var re in N)_[re]=N[re];n&&n.dispatchEvent(_),P[z]&&P[z].call(e,_)}}var hc=["evt"],ue=function(e,n){var a=arguments.length>2&&arguments[2]!==void 0?arguments[2]:{},s=a.evt,r=nc(a,hc);Cn.pluginEvent.bind(C)(e,n,Oe({dragEl:b,parentEl:H,ghostEl:I,rootEl:W,nextEl:ot,lastDownEl:Gn,cloneEl:U,cloneHidden:Xe,dragStarted:Zt,putSortable:ee,activeSortable:C.active,originalEvent:s,oldIndex:kt,oldDraggableIndex:ln,newIndex:me,newDraggableIndex:Ge,hideGhostForTarget:zr,unhideGhostForTarget:Wr,cloneNowHidden:function(){Xe=!0},cloneNowShown:function(){Xe=!1},dispatchSortableEvent:function(l){oe({sortable:n,name:l,originalEvent:s})}},r))};function oe(t){fc(Oe({putSortable:ee,cloneEl:U,targetEl:b,rootEl:W,oldIndex:kt,oldDraggableIndex:ln,newIndex:me,newDraggableIndex:Ge},t))}var b,H,I,W,ot,Gn,U,Xe,kt,me,ln,Ge,Mn,ee,wt=!1,sa=!1,ia=[],st,$e,Ua,Ha,Ei,Ii,Zt,bt,cn,dn=!1,Pn=!1,Kn,se,ja=[],Cs=!1,ra=[],_a=typeof document<"u",On=Xs,Di=xn||Ue?"cssFloat":"float",mc=_a&&!Dr&&!Xs&&"draggable"in document.createElement("div"),qr=(function(){if(_a){if(Ue)return!1;var t=document.createElement("x");return t.style.cssText="pointer-events:auto",t.style.pointerEvents==="auto"}})(),Br=function(e,n){var a=T(e),s=parseInt(a.width)-parseInt(a.paddingLeft)-parseInt(a.paddingRight)-parseInt(a.borderLeftWidth)-parseInt(a.borderRightWidth),r=Nt(e,0,n),o=Nt(e,1,n),l=r&&T(r),c=o&&T(o),d=l&&parseInt(l.marginLeft)+parseInt(l.marginRight)+G(r).width,g=c&&parseInt(c.marginLeft)+parseInt(c.marginRight)+G(o).width;if(a.display==="flex")return a.flexDirection==="column"||a.flexDirection==="column-reverse"?"vertical":"horizontal";if(a.display==="grid")return a.gridTemplateColumns.split(" ").length<=1?"vertical":"horizontal";if(r&&l.float&&l.float!=="none"){var h=l.float==="left"?"left":"right";return o&&(c.clear==="both"||c.clear===h)?"vertical":"horizontal"}return r&&(l.display==="block"||l.display==="flex"||l.display==="table"||l.display==="grid"||d>=s&&a[Di]==="none"||o&&a[Di]==="none"&&d+g>s)?"vertical":"horizontal"},gc=function(e,n,a){var s=a?e.left:e.top,r=a?e.right:e.bottom,o=a?e.width:e.height,l=a?n.left:n.top,c=a?n.right:n.bottom,d=a?n.width:n.height;return s===l||r===c||s+o/2===l+d/2},vc=function(e,n){var a;return ia.some(function(s){var r=s[pe].options.emptyInsertThreshold;if(!(!r||Qs(s))){var o=G(s),l=e>=o.left-r&&e<=o.right+r,c=n>=o.top-r&&n<=o.bottom+r;if(l&&c)return a=s}}),a},Fr=function(e){function n(r,o){return function(l,c,d,g){var h=l.options.group.name&&c.options.group.name&&l.options.group.name===c.options.group.name;if(r==null&&(o||h))return!0;if(r==null||r===!1)return!1;if(o&&r==="clone")return r;if(typeof r=="function")return n(r(l,c,d,g),o)(l,c,d,g);var y=(o?l:c).options.group.name;return r===!0||typeof r=="string"&&r===y||r.join&&r.indexOf(y)>-1}}var a={},s=e.group;(!s||xs(s)!="object")&&(s={name:s}),a.name=s.name,a.checkPull=n(s.pull,!0),a.checkPut=n(s.put),a.revertClone=s.revertClone,e.group=a},zr=function(){!qr&&I&&T(I,"display","none")},Wr=function(){!qr&&I&&T(I,"display","")};_a&&!Dr&&document.addEventListener("click",function(t){if(sa)return t.preventDefault(),t.stopPropagation&&t.stopPropagation(),t.stopImmediatePropagation&&t.stopImmediatePropagation(),sa=!1,!1},!0);var it=function(e){if(b){e=e.touches?e.touches[0]:e;var n=vc(e.clientX,e.clientY);if(n){var a={};for(var s in e)e.hasOwnProperty(s)&&(a[s]=e[s]);a.target=a.rootEl=n,a.preventDefault=void 0,a.stopPropagation=void 0,n[pe]._onDragOver(a)}}},bc=function(e){b&&b.parentNode[pe]._isOutsideThisEl(e.target)};function C(t,e){if(!(t&&t.nodeType&&t.nodeType===1))throw"Sortable: `el` must be an HTMLElement, not ".concat({}.toString.call(t));this.el=t,this.options=e=We({},e),t[pe]=this;var n={group:null,sort:!0,disabled:!1,store:null,handle:null,draggable:/^[uo]l$/i.test(t.nodeName)?">li":">*",swapThreshold:1,invertSwap:!1,invertedSwapThreshold:null,removeCloneOnHide:!0,direction:function(){return Br(t,this.options)},ghostClass:"sortable-ghost",chosenClass:"sortable-chosen",dragClass:"sortable-drag",ignore:"a, img",filter:null,preventOnFilter:!0,animation:0,easing:null,setData:function(o,l){o.setData("Text",l.textContent)},dropBubble:!1,dragoverBubble:!1,dataIdAttr:"data-id",delay:0,delayOnTouchOnly:!1,touchStartThreshold:(Number.parseInt?Number:window).parseInt(window.devicePixelRatio,10)||1,forceFallback:!1,fallbackClass:"sortable-fallback",fallbackOnBody:!1,fallbackTolerance:0,fallbackOffset:{x:0,y:0},supportPointer:C.supportPointer!==!1&&"PointerEvent"in window&&(!rn||Xs),emptyInsertThreshold:5};Cn.initializePlugins(this,t,n);for(var a in n)!(a in e)&&(e[a]=n[a]);Fr(e);for(var s in this)s.charAt(0)==="_"&&typeof this[s]=="function"&&(this[s]=this[s].bind(this));this.nativeDraggable=e.forceFallback?!1:mc,this.nativeDraggable&&(this.options.touchStartThreshold=1),e.supportPointer?M(t,"pointerdown",this._onTapStart):(M(t,"mousedown",this._onTapStart),M(t,"touchstart",this._onTapStart)),this.nativeDraggable&&(M(t,"dragover",this),M(t,"dragenter",this)),ia.push(this.el),e.store&&e.store.get&&this.sort(e.store.get(this)||[]),We(this,dc())}C.prototype={constructor:C,_isOutsideThisEl:function(e){!this.el.contains(e)&&e!==this.el&&(bt=null)},_getDirection:function(e,n){return typeof this.options.direction=="function"?this.options.direction.call(this,e,n,b):this.options.direction},_onTapStart:function(e){if(e.cancelable){var n=this,a=this.el,s=this.options,r=s.preventOnFilter,o=e.type,l=e.touches&&e.touches[0]||e.pointerType&&e.pointerType==="touch"&&e,c=(l||e).target,d=e.target.shadowRoot&&(e.path&&e.path[0]||e.composedPath&&e.composedPath()[0])||c,g=s.filter;if(Cc(a),!b&&!(/mousedown|pointerdown/.test(o)&&e.button!==0||s.disabled)&&!d.isContentEditable&&!(!this.nativeDraggable&&rn&&c&&c.tagName.toUpperCase()==="SELECT")&&(c=ke(c,s.draggable,a,!1),!(c&&c.animated)&&Gn!==c)){if(kt=_e(c),ln=_e(c,s.draggable),typeof g=="function"){if(g.call(this,e,c,this)){oe({sortable:n,rootEl:d,name:"filter",targetEl:c,toEl:a,fromEl:a}),ue("filter",n,{evt:e}),r&&e.preventDefault();return}}else if(g&&(g=g.split(",").some(function(h){if(h=ke(d,h.trim(),a,!1),h)return oe({sortable:n,rootEl:h,name:"filter",targetEl:c,fromEl:a,toEl:a}),ue("filter",n,{evt:e}),!0}),g)){r&&e.preventDefault();return}s.handle&&!ke(d,s.handle,a,!1)||this._prepareDragStart(e,l,c)}}},_prepareDragStart:function(e,n,a){var s=this,r=s.el,o=s.options,l=r.ownerDocument,c;if(a&&!b&&a.parentNode===r){var d=G(a);if(W=r,b=a,H=b.parentNode,ot=b.nextSibling,Gn=a,Mn=o.group,C.dragged=b,st={target:b,clientX:(n||e).clientX,clientY:(n||e).clientY},Ei=st.clientX-d.left,Ii=st.clientY-d.top,this._lastX=(n||e).clientX,this._lastY=(n||e).clientY,b.style["will-change"]="all",c=function(){if(ue("delayEnded",s,{evt:e}),C.eventCanceled){s._onDrop();return}s._disableDelayedDragEvents(),!Si&&s.nativeDraggable&&(b.draggable=!0),s._triggerDragStart(e,n),oe({sortable:s,name:"choose",originalEvent:e}),he(b,o.chosenClass,!0)},o.ignore.split(",").forEach(function(g){Pr(b,g.trim(),Va)}),M(l,"dragover",it),M(l,"mousemove",it),M(l,"touchmove",it),o.supportPointer?(M(l,"pointerup",s._onDrop),!this.nativeDraggable&&M(l,"pointercancel",s._onDrop)):(M(l,"mouseup",s._onDrop),M(l,"touchend",s._onDrop),M(l,"touchcancel",s._onDrop)),Si&&this.nativeDraggable&&(this.options.touchStartThreshold=4,b.draggable=!0),ue("delayStart",this,{evt:e}),o.delay&&(!o.delayOnTouchOnly||n)&&(!this.nativeDraggable||!(xn||Ue))){if(C.eventCanceled){this._onDrop();return}o.supportPointer?(M(l,"pointerup",s._disableDelayedDrag),M(l,"pointercancel",s._disableDelayedDrag)):(M(l,"mouseup",s._disableDelayedDrag),M(l,"touchend",s._disableDelayedDrag),M(l,"touchcancel",s._disableDelayedDrag)),M(l,"mousemove",s._delayedDragTouchMoveHandler),M(l,"touchmove",s._delayedDragTouchMoveHandler),o.supportPointer&&M(l,"pointermove",s._delayedDragTouchMoveHandler),s._dragStartTimer=setTimeout(c,o.delay)}else c()}},_delayedDragTouchMoveHandler:function(e){var n=e.touches?e.touches[0]:e;Math.max(Math.abs(n.clientX-this._lastX),Math.abs(n.clientY-this._lastY))>=Math.floor(this.options.touchStartThreshold/(this.nativeDraggable&&window.devicePixelRatio||1))&&this._disableDelayedDrag()},_disableDelayedDrag:function(){b&&Va(b),clearTimeout(this._dragStartTimer),this._disableDelayedDragEvents()},_disableDelayedDragEvents:function(){var e=this.el.ownerDocument;A(e,"mouseup",this._disableDelayedDrag),A(e,"touchend",this._disableDelayedDrag),A(e,"touchcancel",this._disableDelayedDrag),A(e,"pointerup",this._disableDelayedDrag),A(e,"pointercancel",this._disableDelayedDrag),A(e,"mousemove",this._delayedDragTouchMoveHandler),A(e,"touchmove",this._delayedDragTouchMoveHandler),A(e,"pointermove",this._delayedDragTouchMoveHandler)},_triggerDragStart:function(e,n){n=n||e.pointerType=="touch"&&e,!this.nativeDraggable||n?this.options.supportPointer?M(document,"pointermove",this._onTouchMove):n?M(document,"touchmove",this._onTouchMove):M(document,"mousemove",this._onTouchMove):(M(b,"dragend",this),M(W,"dragstart",this._onDragStart));try{document.selection?Yn(function(){document.selection.empty()}):window.getSelection().removeAllRanges()}catch{}},_dragStarted:function(e,n){if(wt=!1,W&&b){ue("dragStarted",this,{evt:n}),this.nativeDraggable&&M(document,"dragover",bc);var a=this.options;!e&&he(b,a.dragClass,!1),he(b,a.ghostClass,!0),C.active=this,e&&this._appendGhost(),oe({sortable:this,name:"start",originalEvent:n})}else this._nulling()},_emulateDragOver:function(){if($e){this._lastX=$e.clientX,this._lastY=$e.clientY,zr();for(var e=document.elementFromPoint($e.clientX,$e.clientY),n=e;e&&e.shadowRoot&&(e=e.shadowRoot.elementFromPoint($e.clientX,$e.clientY),e!==n);)n=e;if(b.parentNode[pe]._isOutsideThisEl(e),n)do{if(n[pe]){var a=void 0;if(a=n[pe]._onDragOver({clientX:$e.clientX,clientY:$e.clientY,target:e,rootEl:n}),a&&!this.options.dragoverBubble)break}e=n}while(n=Mr(n));Wr()}},_onTouchMove:function(e){if(st){var n=this.options,a=n.fallbackTolerance,s=n.fallbackOffset,r=e.touches?e.touches[0]:e,o=I&&It(I,!0),l=I&&o&&o.a,c=I&&o&&o.d,d=On&&se&&Ti(se),g=(r.clientX-st.clientX+s.x)/(l||1)+(d?d[0]-ja[0]:0)/(l||1),h=(r.clientY-st.clientY+s.y)/(c||1)+(d?d[1]-ja[1]:0)/(c||1);if(!C.active&&!wt){if(a&&Math.max(Math.abs(r.clientX-this._lastX),Math.abs(r.clientY-this._lastY))<a)return;this._onDragStart(e,!0)}if(I){o?(o.e+=g-(Ua||0),o.f+=h-(Ha||0)):o={a:1,b:0,c:0,d:1,e:g,f:h};var y="matrix(".concat(o.a,",").concat(o.b,",").concat(o.c,",").concat(o.d,",").concat(o.e,",").concat(o.f,")");T(I,"webkitTransform",y),T(I,"mozTransform",y),T(I,"msTransform",y),T(I,"transform",y),Ua=g,Ha=h,$e=r}e.cancelable&&e.preventDefault()}},_appendGhost:function(){if(!I){var e=this.options.fallbackOnBody?document.body:W,n=G(b,!0,On,!0,e),a=this.options;if(On){for(se=e;T(se,"position")==="static"&&T(se,"transform")==="none"&&se!==document;)se=se.parentNode;se!==document.body&&se!==document.documentElement?(se===document&&(se=Ae()),n.top+=se.scrollTop,n.left+=se.scrollLeft):se=Ae(),ja=Ti(se)}I=b.cloneNode(!0),he(I,a.ghostClass,!1),he(I,a.fallbackClass,!0),he(I,a.dragClass,!0),T(I,"transition",""),T(I,"transform",""),T(I,"box-sizing","border-box"),T(I,"margin",0),T(I,"top",n.top),T(I,"left",n.left),T(I,"width",n.width),T(I,"height",n.height),T(I,"opacity","0.8"),T(I,"position",On?"absolute":"fixed"),T(I,"zIndex","100000"),T(I,"pointerEvents","none"),C.ghost=I,e.appendChild(I),T(I,"transform-origin",Ei/parseInt(I.style.width)*100+"% "+Ii/parseInt(I.style.height)*100+"%")}},_onDragStart:function(e,n){var a=this,s=e.dataTransfer,r=a.options;if(ue("dragStart",this,{evt:e}),C.eventCanceled){this._onDrop();return}ue("setupClone",this),C.eventCanceled||(U=Rr(b),U.removeAttribute("id"),U.draggable=!1,U.style["will-change"]="",this._hideClone(),he(U,this.options.chosenClass,!1),C.clone=U),a.cloneId=Yn(function(){ue("clone",a),!C.eventCanceled&&(a.options.removeCloneOnHide||W.insertBefore(U,b),a._hideClone(),oe({sortable:a,name:"clone"}))}),!n&&he(b,r.dragClass,!0),n?(sa=!0,a._loopId=setInterval(a._emulateDragOver,50)):(A(document,"mouseup",a._onDrop),A(document,"touchend",a._onDrop),A(document,"touchcancel",a._onDrop),s&&(s.effectAllowed="move",r.setData&&r.setData.call(a,s,b)),M(document,"drop",a),T(b,"transform","translateZ(0)")),wt=!0,a._dragStartId=Yn(a._dragStarted.bind(a,n,e)),M(document,"selectstart",a),Zt=!0,window.getSelection().removeAllRanges(),rn&&T(document.body,"user-select","none")},_onDragOver:function(e){var n=this.el,a=e.target,s,r,o,l=this.options,c=l.group,d=C.active,g=Mn===c,h=l.sort,y=ee||d,S,k=this,_=!1;if(Cs)return;function P(jt,qo){ue(jt,k,Oe({evt:e,isOwner:g,axis:S?"vertical":"horizontal",revert:o,dragRect:s,targetRect:r,canSort:h,fromSortable:y,target:a,completed:N,onMove:function(ui,Bo){return Ln(W,n,b,s,ui,G(ui),e,Bo)},changed:re},qo))}function z(){P("dragOverAnimationCapture"),k.captureAnimationState(),k!==y&&y.captureAnimationState()}function N(jt){return P("dragOverCompleted",{insertion:jt}),jt&&(g?d._hideClone():d._showClone(k),k!==y&&(he(b,ee?ee.options.ghostClass:d.options.ghostClass,!1),he(b,l.ghostClass,!0)),ee!==k&&k!==C.active?ee=k:k===C.active&&ee&&(ee=null),y===k&&(k._ignoreWhileAnimating=a),k.animateAll(function(){P("dragOverAnimationComplete"),k._ignoreWhileAnimating=null}),k!==y&&(y.animateAll(),y._ignoreWhileAnimating=null)),(a===b&&!b.animated||a===n&&!a.animated)&&(bt=null),!l.dragoverBubble&&!e.rootEl&&a!==document&&(b.parentNode[pe]._isOutsideThisEl(e.target),!jt&&it(e)),!l.dragoverBubble&&e.stopPropagation&&e.stopPropagation(),_=!0}function re(){me=_e(b),Ge=_e(b,l.draggable),oe({sortable:k,name:"change",toEl:n,newIndex:me,newDraggableIndex:Ge,originalEvent:e})}if(e.preventDefault!==void 0&&e.cancelable&&e.preventDefault(),a=ke(a,l.draggable,n,!0),P("dragOver"),C.eventCanceled)return _;if(b.contains(e.target)||a.animated&&a.animatingX&&a.animatingY||k._ignoreWhileAnimating===a)return N(!1);if(sa=!1,d&&!l.disabled&&(g?h||(o=H!==W):ee===this||(this.lastPutMode=Mn.checkPull(this,d,b,e))&&c.checkPut(this,d,b,e))){if(S=this._getDirection(e,a)==="vertical",s=G(b),P("dragOverValid"),C.eventCanceled)return _;if(o)return H=W,z(),this._hideClone(),P("revert"),C.eventCanceled||(ot?W.insertBefore(b,ot):W.appendChild(b)),N(!0);var Q=Qs(n,l.draggable);if(!Q||$c(e,S,this)&&!Q.animated){if(Q===b)return N(!1);if(Q&&n===e.target&&(a=Q),a&&(r=G(a)),Ln(W,n,b,s,a,r,e,!!a)!==!1)return z(),Q&&Q.nextSibling?n.insertBefore(b,Q.nextSibling):n.appendChild(b),H=n,re(),N(!0)}else if(Q&&wc(e,S,this)){var ye=Nt(n,0,l,!0);if(ye===b)return N(!1);if(a=ye,r=G(a),Ln(W,n,b,s,a,r,e,!1)!==!1)return z(),n.insertBefore(b,ye),H=n,re(),N(!0)}else if(a.parentNode===n){r=G(a);var Ce=0,tt,zt=b.parentNode!==n,fe=!gc(b.animated&&b.toRect||s,a.animated&&a.toRect||r,S),Wt=S?"top":"left",He=Ci(a,"top","top")||Ci(b,"top","top"),Ut=He?He.scrollTop:void 0;bt!==a&&(tt=r[Wt],dn=!1,Pn=!fe&&l.invertSwap||zt),Ce=kc(e,a,r,S,fe?1:l.swapThreshold,l.invertedSwapThreshold==null?l.swapThreshold:l.invertedSwapThreshold,Pn,bt===a);var Le;if(Ce!==0){var nt=_e(b);do nt-=Ce,Le=H.children[nt];while(Le&&(T(Le,"display")==="none"||Le===I))}if(Ce===0||Le===a)return N(!1);bt=a,cn=Ce;var Ht=a.nextElementSibling,je=!1;je=Ce===1;var Dn=Ln(W,n,b,s,a,r,e,je);if(Dn!==!1)return(Dn===1||Dn===-1)&&(je=Dn===1),Cs=!0,setTimeout(_c,30),z(),je&&!Ht?n.appendChild(b):a.parentNode.insertBefore(b,je?Ht:a),He&&Lr(He,0,Ut-He.scrollTop),H=b.parentNode,tt!==void 0&&!Pn&&(Kn=Math.abs(tt-G(a)[Wt])),re(),N(!0)}if(n.contains(b))return N(!1)}return!1},_ignoreWhileAnimating:null,_offMoveEvents:function(){A(document,"mousemove",this._onTouchMove),A(document,"touchmove",this._onTouchMove),A(document,"pointermove",this._onTouchMove),A(document,"dragover",it),A(document,"mousemove",it),A(document,"touchmove",it)},_offUpEvents:function(){var e=this.el.ownerDocument;A(e,"mouseup",this._onDrop),A(e,"touchend",this._onDrop),A(e,"pointerup",this._onDrop),A(e,"pointercancel",this._onDrop),A(e,"touchcancel",this._onDrop),A(document,"selectstart",this)},_onDrop:function(e){var n=this.el,a=this.options;if(me=_e(b),Ge=_e(b,a.draggable),ue("drop",this,{evt:e}),H=b&&b.parentNode,me=_e(b),Ge=_e(b,a.draggable),C.eventCanceled){this._nulling();return}wt=!1,Pn=!1,dn=!1,clearInterval(this._loopId),clearTimeout(this._dragStartTimer),Ts(this.cloneId),Ts(this._dragStartId),this.nativeDraggable&&(A(document,"drop",this),A(n,"dragstart",this._onDragStart)),this._offMoveEvents(),this._offUpEvents(),rn&&T(document.body,"user-select",""),T(b,"transform",""),e&&(Zt&&(e.cancelable&&e.preventDefault(),!a.dropBubble&&e.stopPropagation()),I&&I.parentNode&&I.parentNode.removeChild(I),(W===H||ee&&ee.lastPutMode!=="clone")&&U&&U.parentNode&&U.parentNode.removeChild(U),b&&(this.nativeDraggable&&A(b,"dragend",this),Va(b),b.style["will-change"]="",Zt&&!wt&&he(b,ee?ee.options.ghostClass:this.options.ghostClass,!1),he(b,this.options.chosenClass,!1),oe({sortable:this,name:"unchoose",toEl:H,newIndex:null,newDraggableIndex:null,originalEvent:e}),W!==H?(me>=0&&(oe({rootEl:H,name:"add",toEl:H,fromEl:W,originalEvent:e}),oe({sortable:this,name:"remove",toEl:H,originalEvent:e}),oe({rootEl:H,name:"sort",toEl:H,fromEl:W,originalEvent:e}),oe({sortable:this,name:"sort",toEl:H,originalEvent:e})),ee&&ee.save()):me!==kt&&me>=0&&(oe({sortable:this,name:"update",toEl:H,originalEvent:e}),oe({sortable:this,name:"sort",toEl:H,originalEvent:e})),C.active&&((me==null||me===-1)&&(me=kt,Ge=ln),oe({sortable:this,name:"end",toEl:H,originalEvent:e}),this.save()))),this._nulling()},_nulling:function(){ue("nulling",this),W=b=H=I=ot=U=Gn=Xe=st=$e=Zt=me=Ge=kt=ln=bt=cn=ee=Mn=C.dragged=C.ghost=C.clone=C.active=null;var e=this.el;ra.forEach(function(n){e.contains(n)&&(n.checked=!0)}),ra.length=Ua=Ha=0},handleEvent:function(e){switch(e.type){case"drop":case"dragend":this._onDrop(e);break;case"dragenter":case"dragover":b&&(this._onDragOver(e),yc(e));break;case"selectstart":e.preventDefault();break}},toArray:function(){for(var e=[],n,a=this.el.children,s=0,r=a.length,o=this.options;s<r;s++)n=a[s],ke(n,o.draggable,this.el,!1)&&e.push(n.getAttribute(o.dataIdAttr)||xc(n));return e},sort:function(e,n){var a={},s=this.el;this.toArray().forEach(function(r,o){var l=s.children[o];ke(l,this.options.draggable,s,!1)&&(a[r]=l)},this),n&&this.captureAnimationState(),e.forEach(function(r){a[r]&&(s.removeChild(a[r]),s.appendChild(a[r]))}),n&&this.animateAll()},save:function(){var e=this.options.store;e&&e.set&&e.set(this)},closest:function(e,n){return ke(e,n||this.options.draggable,this.el,!1)},option:function(e,n){var a=this.options;if(n===void 0)return a[e];var s=Cn.modifyOption(this,e,n);typeof s<"u"?a[e]=s:a[e]=n,e==="group"&&Fr(a)},destroy:function(){ue("destroy",this);var e=this.el;e[pe]=null,A(e,"mousedown",this._onTapStart),A(e,"touchstart",this._onTapStart),A(e,"pointerdown",this._onTapStart),this.nativeDraggable&&(A(e,"dragover",this),A(e,"dragenter",this)),Array.prototype.forEach.call(e.querySelectorAll("[draggable]"),function(n){n.removeAttribute("draggable")}),this._onDrop(),this._disableDelayedDragEvents(),ia.splice(ia.indexOf(this.el),1),this.el=e=null},_hideClone:function(){if(!Xe){if(ue("hideClone",this),C.eventCanceled)return;T(U,"display","none"),this.options.removeCloneOnHide&&U.parentNode&&U.parentNode.removeChild(U),Xe=!0}},_showClone:function(e){if(e.lastPutMode!=="clone"){this._hideClone();return}if(Xe){if(ue("showClone",this),C.eventCanceled)return;b.parentNode==W&&!this.options.group.revertClone?W.insertBefore(U,b):ot?W.insertBefore(U,ot):W.appendChild(U),this.options.group.revertClone&&this.animate(b,U),T(U,"display",""),Xe=!1}}};function yc(t){t.dataTransfer&&(t.dataTransfer.dropEffect="move"),t.cancelable&&t.preventDefault()}function Ln(t,e,n,a,s,r,o,l){var c,d=t[pe],g=d.options.onMove,h;return window.CustomEvent&&!Ue&&!xn?c=new CustomEvent("move",{bubbles:!0,cancelable:!0}):(c=document.createEvent("Event"),c.initEvent("move",!0,!0)),c.to=e,c.from=t,c.dragged=n,c.draggedRect=a,c.related=s||e,c.relatedRect=r||G(e),c.willInsertAfter=l,c.originalEvent=o,t.dispatchEvent(c),g&&(h=g.call(d,c,o)),h}function Va(t){t.draggable=!1}function _c(){Cs=!1}function wc(t,e,n){var a=G(Nt(n.el,0,n.options,!0)),s=Nr(n.el,n.options,I),r=10;return e?t.clientX<s.left-r||t.clientY<a.top&&t.clientX<a.right:t.clientY<s.top-r||t.clientY<a.bottom&&t.clientX<a.left}function $c(t,e,n){var a=G(Qs(n.el,n.options.draggable)),s=Nr(n.el,n.options,I),r=10;return e?t.clientX>s.right+r||t.clientY>a.bottom&&t.clientX>a.left:t.clientY>s.bottom+r||t.clientX>a.right&&t.clientY>a.top}function kc(t,e,n,a,s,r,o,l){var c=a?t.clientY:t.clientX,d=a?n.height:n.width,g=a?n.top:n.left,h=a?n.bottom:n.right,y=!1;if(!o){if(l&&Kn<d*s){if(!dn&&(cn===1?c>g+d*r/2:c<h-d*r/2)&&(dn=!0),dn)y=!0;else if(cn===1?c<g+Kn:c>h-Kn)return-cn}else if(c>g+d*(1-s)/2&&c<h-d*(1-s)/2)return Sc(e)}return y=y||o,y&&(c<g+d*r/2||c>h-d*r/2)?c>g+d/2?1:-1:0}function Sc(t){return _e(b)<_e(t)?1:-1}function xc(t){for(var e=t.tagName+t.className+t.src+t.href+t.textContent,n=e.length,a=0;n--;)a+=e.charCodeAt(n);return a.toString(36)}function Cc(t){ra.length=0;for(var e=t.getElementsByTagName("input"),n=e.length;n--;){var a=e[n];a.checked&&ra.push(a)}}function Yn(t){return setTimeout(t,0)}function Ts(t){return clearTimeout(t)}_a&&M(document,"touchmove",function(t){(C.active||wt)&&t.cancelable&&t.preventDefault()});C.utils={on:M,off:A,css:T,find:Pr,is:function(e,n){return!!ke(e,n,e,!1)},extend:lc,throttle:Or,closest:ke,toggleClass:he,clone:Rr,index:_e,nextTick:Yn,cancelNextTick:Ts,detectDirection:Br,getChild:Nt,expando:pe};C.get=function(t){return t[pe]};C.mount=function(){for(var t=arguments.length,e=new Array(t),n=0;n<t;n++)e[n]=arguments[n];e[0].constructor===Array&&(e=e[0]),e.forEach(function(a){if(!a.prototype||!a.prototype.constructor)throw"Sortable: Mounted plugin must be a constructor function, not ".concat({}.toString.call(a));a.utils&&(C.utils=Oe(Oe({},C.utils),a.utils)),Cn.mount(a)})};C.create=function(t,e){return new C(t,e)};C.version=rc;var j=[],en,Es,Is=!1,Ga,Ka,oa,tn;function Tc(){function t(){this.defaults={scroll:!0,forceAutoScrollFallback:!1,scrollSensitivity:30,scrollSpeed:10,bubbleScroll:!0};for(var e in this)e.charAt(0)==="_"&&typeof this[e]=="function"&&(this[e]=this[e].bind(this))}return t.prototype={dragStarted:function(n){var a=n.originalEvent;this.sortable.nativeDraggable?M(document,"dragover",this._handleAutoScroll):this.options.supportPointer?M(document,"pointermove",this._handleFallbackAutoScroll):a.touches?M(document,"touchmove",this._handleFallbackAutoScroll):M(document,"mousemove",this._handleFallbackAutoScroll)},dragOverCompleted:function(n){var a=n.originalEvent;!this.options.dragOverBubble&&!a.rootEl&&this._handleAutoScroll(a)},drop:function(){this.sortable.nativeDraggable?A(document,"dragover",this._handleAutoScroll):(A(document,"pointermove",this._handleFallbackAutoScroll),A(document,"touchmove",this._handleFallbackAutoScroll),A(document,"mousemove",this._handleFallbackAutoScroll)),Ai(),Xn(),cc()},nulling:function(){oa=Es=en=Is=tn=Ga=Ka=null,j.length=0},_handleFallbackAutoScroll:function(n){this._handleAutoScroll(n,!0)},_handleAutoScroll:function(n,a){var s=this,r=(n.touches?n.touches[0]:n).clientX,o=(n.touches?n.touches[0]:n).clientY,l=document.elementFromPoint(r,o);if(oa=n,a||this.options.forceAutoScrollFallback||xn||Ue||rn){Ya(n,this.options,l,a);var c=Qe(l,!0);Is&&(!tn||r!==Ga||o!==Ka)&&(tn&&Ai(),tn=setInterval(function(){var d=Qe(document.elementFromPoint(r,o),!0);d!==c&&(c=d,Xn()),Ya(n,s.options,d,a)},10),Ga=r,Ka=o)}else{if(!this.options.bubbleScroll||Qe(l,!0)===Ae()){Xn();return}Ya(n,this.options,Qe(l,!1),!1)}}},We(t,{pluginName:"scroll",initializeByDefault:!0})}function Xn(){j.forEach(function(t){clearInterval(t.pid)}),j=[]}function Ai(){clearInterval(tn)}var Ya=Or(function(t,e,n,a){if(e.scroll){var s=(t.touches?t.touches[0]:t).clientX,r=(t.touches?t.touches[0]:t).clientY,o=e.scrollSensitivity,l=e.scrollSpeed,c=Ae(),d=!1,g;Es!==n&&(Es=n,Xn(),en=e.scroll,g=e.scrollFn,en===!0&&(en=Qe(n,!0)));var h=0,y=en;do{var S=y,k=G(S),_=k.top,P=k.bottom,z=k.left,N=k.right,re=k.width,Q=k.height,ye=void 0,Ce=void 0,tt=S.scrollWidth,zt=S.scrollHeight,fe=T(S),Wt=S.scrollLeft,He=S.scrollTop;S===c?(ye=re<tt&&(fe.overflowX==="auto"||fe.overflowX==="scroll"||fe.overflowX==="visible"),Ce=Q<zt&&(fe.overflowY==="auto"||fe.overflowY==="scroll"||fe.overflowY==="visible")):(ye=re<tt&&(fe.overflowX==="auto"||fe.overflowX==="scroll"),Ce=Q<zt&&(fe.overflowY==="auto"||fe.overflowY==="scroll"));var Ut=ye&&(Math.abs(N-s)<=o&&Wt+re<tt)-(Math.abs(z-s)<=o&&!!Wt),Le=Ce&&(Math.abs(P-r)<=o&&He+Q<zt)-(Math.abs(_-r)<=o&&!!He);if(!j[h])for(var nt=0;nt<=h;nt++)j[nt]||(j[nt]={});(j[h].vx!=Ut||j[h].vy!=Le||j[h].el!==S)&&(j[h].el=S,j[h].vx=Ut,j[h].vy=Le,clearInterval(j[h].pid),(Ut!=0||Le!=0)&&(d=!0,j[h].pid=setInterval(function(){a&&this.layer===0&&C.active._onTouchMove(oa);var Ht=j[this.layer].vy?j[this.layer].vy*l:0,je=j[this.layer].vx?j[this.layer].vx*l:0;typeof g=="function"&&g.call(C.dragged.parentNode[pe],je,Ht,t,oa,j[this.layer].el)!=="continue"||Lr(j[this.layer].el,je,Ht)}.bind({layer:h}),24))),h++}while(e.bubbleScroll&&y!==c&&(y=Qe(y,!1)));Is=d}},30),Ur=function(e){var n=e.originalEvent,a=e.putSortable,s=e.dragEl,r=e.activeSortable,o=e.dispatchSortableEvent,l=e.hideGhostForTarget,c=e.unhideGhostForTarget;if(n){var d=a||r;l();var g=n.changedTouches&&n.changedTouches.length?n.changedTouches[0]:n,h=document.elementFromPoint(g.clientX,g.clientY);c(),d&&!d.el.contains(h)&&(o("spill"),this.onSpill({dragEl:s,putSortable:a}))}};function Js(){}Js.prototype={startIndex:null,dragStart:function(e){var n=e.oldDraggableIndex;this.startIndex=n},onSpill:function(e){var n=e.dragEl,a=e.putSortable;this.sortable.captureAnimationState(),a&&a.captureAnimationState();var s=Nt(this.sortable.el,this.startIndex,this.options);s?this.sortable.el.insertBefore(n,s):this.sortable.el.appendChild(n),this.sortable.animateAll(),a&&a.animateAll()},drop:Ur};We(Js,{pluginName:"revertOnSpill"});function Zs(){}Zs.prototype={onSpill:function(e){var n=e.dragEl,a=e.putSortable,s=a||this.sortable;s.captureAnimationState(),n.parentNode&&n.parentNode.removeChild(n),s.animateAll()},drop:Ur};We(Zs,{pluginName:"removeOnSpill"});C.mount(new Tc);C.mount(Zs,Js);class Ec extends be{static properties={playlistId:{type:String}};constructor(){super(),this.playlistId="",this._query=""}deps(){return[i.playlistVersion,i.songs,this.playlistId,this._query]}get already(){const e=i.playlists.find(n=>n.id===this.playlistId);return new Set(e?.songIds||[])}get filtered(){const e=this._query.trim().toLowerCase();return e?i.songs.filter(n=>`${n.title} ${n.artist} ${n.album}`.toLowerCase().includes(e)):i.songs}render(){const e=this.already,n=this.filtered,a=i.songs.filter(s=>!e.has(s.id)).length;return p`
      <input
        class="input"
        id="addsongs-filter"
        type="text"
        placeholder="筛选歌曲（标题 / 歌手 / 专辑）"
        autocomplete="off"
        spellcheck="false"
        .value=${this._query}
        @input=${s=>{this._query=s.target.value,this.requestUpdate()}}
        @keydown=${s=>{s.key==="Enter"&&(s.preventDefault(),s.stopPropagation())}}
      />
      <div class="addsongs__head">
        <span id="addsongs-count">
          ${this._query.trim()?`匹配 ${D(n.length)} 首`:`共 ${D(i.songs.length)} 首 · 其中 ${D(a)} 首尚未加入`}
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
        ${n.length?Me(n,s=>s.id,s=>{const r=e.has(s.id);return p`
                    <label class="addsongs__row">
                      <input type="checkbox" data-song-check=${s.id} ?checked=${r} ?disabled=${r} />
                      <span class="addsongs__text">
                        <span class="addsongs__title u-ellipsis">${s.title}</span>
                        <span class="addsongs__sub u-ellipsis">${s.artist}${s.album?` · ${s.album}`:""}</span>
                      </span>
                      ${r?p`<span class="addsongs__tag">已在歌单</span>`:F}
                    </label>
                  `}):p`<div class="addsongs__empty">没有匹配的歌曲</div>`}
      </div>
    `}setAll(e){for(const n of this.querySelectorAll("[data-song-check]:not(:disabled)"))n.checked=e}}ae("mp-add-songs",Ec);function Hr(t){ne({title:"新建歌单",desc:"歌单名称可以随时修改。",body:p`<input class="input" data-field="name" type="text" placeholder="例如：深夜循环" maxlength="40" />`,okText:"创建",onOk:e=>{const n=String(e.name||"").trim();if(!n)return"请输入歌单名称";if(i.playlists.some(s=>s.name===n))return"已存在同名歌单";const a=Go(n);return t?.(a),u(`已创建歌单「${n}」`,{tone:"success"}),!0}})}function Ic(t,e){const n=ze(t);!n||n.locked||ne({title:"重命名歌单",body:p`<input class="input" data-field="name" type="text" .value=${n.name} maxlength="40" />`,okText:"保存",onOk:a=>{const s=String(a.name||"").trim();return s?(Yo(t,s),!0):"名称不能为空"}})}function Dc(t,e){const n=ze(t);!n||n.locked||ne({title:`删除歌单「${n.name}」？`,desc:"只会删除歌单本身，本地音乐文件不会被删除。",okText:"删除",danger:!0,onOk:()=>(Ko(t),e?.(),u("歌单已删除"),!0)})}function la(t,e){const n=ze(t);if(!n)return;const a=Vo(t,e);a?u(`已添加 ${a} 首到「${n.name}」`,{tone:"success"}):u("所选歌曲已在该歌单中")}function Ac(t){const e=ze(t);if(!e)return;if(!i.songs.length){u("本地曲库还是空的，先扫描音乐文件夹吧",{tone:"warning"});return}const n=new Set(e.songIds);ne({title:`添加歌曲到「${e.name}」`,desc:"勾选要加入的歌曲；已经在歌单里的会保持选中。",body:p`<mp-add-songs .playlistId=${t}></mp-add-songs>`,okText:"加入歌单",onOk:(a,s)=>{const o=[...s.querySelectorAll("[data-song-check]:checked")].map(l=>l.dataset.songCheck).filter(l=>!n.has(l));return o.length?(la(t,o),!0):"没有选中新的歌曲"}})}function Ds(t,e){const n=ze(t);if(!n)return;const a=[{id:"play",label:"播放这个歌单",icon:"play"},{id:"queue",label:"加入播放列表",icon:"queue"},{id:"sep1",kind:"sep"}];n.locked||(a.push({id:"rename",label:"重命名",icon:"edit"}),a.push({id:"delete",label:"删除歌单",icon:"trash",danger:!0}),a.push({id:"sep2",kind:"sep"}));const s=e.getBoundingClientRect();hn({x:s.left,y:s.bottom+6,align:"right",items:a,onPick:async r=>{switch(r){case"play":Mc(n);break;case"queue":{(await ht(()=>import("./base-CTww9QTQ.js").then(l=>l.ai),__vite__mapDeps([0,1]))).appendToQueue(n.songIds),u(`已把 ${D(n.songIds.length)} 首加入播放列表`,{tone:"success"});break}case"rename":Ic(n.id);break;case"delete":Dc(n.id,()=>Tt("library"));break}}})}function Mc(t){ht(async()=>{const{playContext:e}=await import("./base-CTww9QTQ.js").then(n=>n.ai);return{playContext:e}},__vite__mapDeps([0,1])).then(({playContext:e})=>{e(t.songIds.slice(),0,{type:"playlist",id:t.id})})}let Mi=0;class Pc extends be{static deps=e=>[e.view,e.playlistId,e.playlistVersion,e.songs.length,e.queue.length];firstUpdated(){this.bindDrag()}bindDrag(){const e=this.querySelector("#playlist-nav");!e||this._sortable||(this._sortable=C.create(e,{draggable:".navitem",filter:'[data-locked="true"]',animation:0,ghostClass:"is-dragging",onEnd:n=>this.onDragEnd(n)}))}onDragEnd(e){Mi=Date.now();const n=e.oldIndex,a=e.newIndex;if(n==null||a==null||n===a)return;const s=e.from,r=Array.from(s.children).filter(o=>o!==e.item);s.insertBefore(e.item,r[n]??null),Xo(n-1,a-1),u("已调整歌单顺序",{duration:1400})}onSidebarClick(e){if(Date.now()-Mi<260)return;const n=e.target.closest('[data-act="pl-more"]');if(n){e.stopPropagation(),Ds(n.dataset.id,n);return}const a=e.target.closest("[data-nav]");if(!a)return;const s=a.dataset.nav;s==="playlist"?Tt("playlist",a.dataset.playlist):Tt(s)}render(){const e=i.playlists.filter(s=>s.id!==Un),a=[ze(Un),...e].filter(Boolean);return p`
      <aside
        class="sidebar"
        id="sidebar"
        @click=${s=>this.onSidebarClick(s)}
        @contextmenu=${s=>{const r=s.target.closest('[data-nav="playlist"]');r&&(s.preventDefault(),Ds(r.dataset.playlist,r))}}
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
                <span class="navitem__badge" id="badge-library">${D(i.songs.length)}</span>
              </span>
            </button>
            <button class="navitem" type="button" data-nav="queue" aria-selected=${String(i.view==="queue")}>
              ${f("queue","navitem__icon")}
              <span class="navitem__text">播放列表</span>
              <span class="navitem__tail">
                <span class="navitem__badge" id="badge-queue">${D(i.queue.length)}</span>
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
                @click=${()=>Hr(s=>s&&Tt("playlist",s.id))}
              >
                ${f("plus")}
              </button>
            </div>
            <div id="playlist-nav">
              ${Me(a,s=>s.id,s=>this.playlistItem(s))}
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
        ${f(e.id===Un?"heart":"playlist","navitem__icon")}
        <span class="navitem__text">${e.name}</span>
        <span class="navitem__tail">
          <span class="navitem__badge">${D(e.songIds.length)}</span>
          <span class="navitem__more" data-act="pl-more" data-id=${e.id} role="button" aria-label="${e.name}操作"
            >${f("more")}</span
          >
        </span>
      </button>
    `}}ae("mp-sidebar",Pc);const Oc=Gs(class extends Ks{constructor(){super(...arguments),this.key=F}render(t,e){return this.key=t,e}update(t,[e,n]){return e!==this.key&&($r(t),this.key=e),n}}),ei=[{id:"auto",label:"自动识别（按接口地址与模型名判断）",hint:"识别不出时按 OpenAI 兼容接口处理"},{id:"openai",label:"OpenAI（GPT-5 系列 / o 系列）",hint:"o 系列无法完全关闭思考，只能降到最低档"},{id:"deepseek",label:"DeepSeek（deepseek-chat / reasoner）",hint:"思考模式下 temperature 会被忽略"},{id:"anthropic",label:"Anthropic Claude",hint:"开启思考时 temperature 必须为 1，程序会自动去掉它"},{id:"gemini",label:"Google Gemini",hint:"Pro 系列无法关闭思考"},{id:"qwen",label:"阿里通义千问 Qwen",hint:"仅「混合思考」模型可关闭；部分开源模型只支持流式"},{id:"glm",label:"智谱 GLM",hint:"GLM-5.3 系列传 disabled 会报错"},{id:"kimi",label:"月之暗面 Kimi",hint:"kimi-k3 / k2.7-code 始终思考，传 thinking 会报错"},{id:"minimax",label:"MiniMax",hint:"官方未提供关闭思考的参数，只能保持默认"},{id:"xai",label:"xAI Grok",hint:"reasoning_effort=none 可真正关闭"},{id:"openrouter",label:"OpenRouter（统一网关）",hint:"统一 reasoning 字段；标记 mandatory 的模型不接受关闭"},{id:"siliconflow",label:"SiliconFlow（硅基流动）",hint:"R1 类纯推理模型无法关闭"},{id:"ollama",label:"Ollama（本地，OpenAI 兼容）",hint:"本地兼容层用 reasoning_effort；GPT-OSS 无法完全关闭"}];function Lc(t){return ei.find(e=>e.id===t)?.label||t||"自动识别"}function jr(t){return ei.find(e=>e.id===t)?.hint||""}const Vr=["off","auto","mica","acrylic","tabbed"],Pi={off:"关闭（不透明窗口）",auto:"自动（系统决定）",mica:"云母（Mica）",acrylic:"亚克力（Acrylic）",tabbed:"标签页（Tabbed）"};function Qn(t){return Pi[t]||Pi.off}function Rc(t){const e=document.documentElement;!t||t==="off"?delete e.dataset.backdrop:e.dataset.backdrop=t}async function Nc(){let t=null;if($())try{t=await m.backdrop()}catch(e){console.warn("[backdrop] 读取窗口材质状态失败",e)}return t?t.preview=!1:t={configured:i.config.nativeBackdrop||"off",active:"off",supported:!1,os:"",restartRequired:!1,preview:!$()},i.backdropState=t,Rc(t.active),t}let ie=!1,Oi=!1,Xa="",qe=null,St=0,Dt=null,ce=null,ca=-1,da=0,Qa=null;const Ja=[];let le=null,Jn=!1,Ie=null,De=null,Li=null,Ke=null,xt=null,qt=null;const At="idle",Mt="loading";let Se=At,lt=null,ct=!1,Za=0,As=0;const Ri=1500,qc=12e3;async function Bc(){if(Oi)return ie;if(Oi=!0,!$())return!1;try{const t=await m.playerAvailable();ie=t?.available===!0,Xa=t?.reason||"",ie||console.warn("[audio] 后端音频不可用，回退到 <audio> 播放：",Xa||"未知原因")}catch(t){ie=!1,Xa=t?.message||String(t),console.warn("[audio] 探测后端音频失败，回退到 <audio> 播放",t)}return ie}Qo(()=>{if(ie&&i.currentId)return!0;const t=document.getElementById("audio-engine");return!!(t&&t.src)});function Fc(){$()&&(Ja.push(K("player:state",t=>{t&&Gr(t)})),Ja.push(K("player:error",t=>{if(!t)return;const n=Je()?.title||t.songId||"当前歌曲";u(`无法播放：${n}（${t.reason||"未知原因"}）`,{tone:"error",duration:5e3})})),Ja.push(K("player:ended",()=>{Yr()})),Qa&&clearInterval(Qa),Qa=setInterval(zc,250))}function Gr(t){const e=Number(t.durationMs)||0,n=Number(t.positionMs)||0;ce={positionMs:n,atMs:Number(t.atMs)||0,durationMs:e,playing:t.playing===!0,at:performance.now()};let a=!1;e>0&&i.duration!==e&&(i.duration=e,a=!0),i.playing!==ce.playing&&(i.playing=ce.playing,a=!0),Kr(n,!0),a?x():Ne()}function zc(){if(!ce||!ie||!i.currentId)return;let t=ce.positionMs;ce.playing&&(t=ce.positionMs+(performance.now()-ce.at)),ce.durationMs>0&&(t=Math.min(t,ce.durationMs)),Kr(t,!1)}function Kr(t,e){if(!Number.isFinite(t)||t<0)return;const n=Math.round(t);!e&&Math.round(n/250)===Math.round(ca/250)||(ca=n,i.position=n,hr(n),i.config.resumeProgress===!0&&performance.now()-da>5e3&&(da=performance.now(),mr()),Ne())}function Yr(){if(i.sleepTimer?.type==="after-song"){mn(!0);return}if(i.playMode==="loop-one"){jc(0);return}mn(!0)}async function Wc(){if(!$())return;if(!ie){await Xc();return}const t=Je();if(!t){if(qe!==null){qe=null,ce=null;try{await m.playerUnload()}catch{}}return}if(qe!==t.id){await Uc(t);return}Hc()}async function Uc(t){qe=t.id;const e=++St;ce=null,ca=-1;try{const n=await m.playerLoad(t.id);if(e!==St)return;n?.durationMs>0&&(i.duration=n.durationMs);const a=Zr(t);a>0&&await m.playerSeek(a),await wa(),await $a(t.id),i.playing&&await m.playerPlay();const s=await m.playerState();e===St&&s&&Gr(s)}catch(n){if(e!==St)return;qe=null,u(`无法播放：${n?.message??"装载失败"}`,{tone:"error",duration:5e3})}}async function Hc(){try{i.playing?await m.playerPlay():await m.playerPause()}catch(t){console.warn("[audio] 同步播放状态失败",t)}}async function jc(t){if(ie)try{await m.playerSeek(t),await m.playerPlay()}catch(e){console.warn("[audio] 重新起播失败",e)}}function ti(){const t=i.config.loudnessMode||"off";let e=0;t!=="off"&&i.currentId&&(e=i.loudnessGains?.[i.currentId]??0);const n=10**(e/20);return(i.muted?0:i.volume)*n}function Ms(){if(!ie){Sa();return}wa()}async function wa(){try{await m.playerSetVolume(i.volume??1,i.muted===!0)}catch(t){console.warn("[audio] 同步音量失败",t)}}async function $a(t){const e=i.config.loudnessMode||"off";let n=0;e!=="off"&&t&&(n=i.loudnessGains?.[t]??0);try{await m.playerSetLoudness(n)}catch(a){console.warn("[audio] 同步响度补偿失败",a)}}function yn(){if(!ie){Jc();return}const t=ti();t!==qt&&(qt=t,wa(),$a(i.currentId))}function ua(t){$t(t),Vc(t)}function Vc(t){if(!$())return;const e=Math.max(0,Math.min(t,i.duration||0));if(ce&&(ce={...ce,positionMs:e,at:performance.now()}),ca=e,!ie){Zc(t);return}m.playerSeek(e).catch(n=>{console.warn("[audio] 跳转失败",n)})}let Ye=null,Xr=0;function ni(t=32){if(!ie)return ed(t);const e=Math.max(1,Math.min(128,Math.floor(t)||32));return!Ye||Xr!==e?null:Ye}async function Qr(t=32){if(!ie)return null;const e=Math.max(1,Math.min(128,Math.floor(t)||32));try{const a=(await m.playerSpectrum(e))?.bands;if(!a||!a.length)return Ye=null,null;(!Ye||Ye.length!==a.length)&&(Ye=new Float32Array(a.length),Xr=e);for(let s=0;s<a.length;s+=1)Ye[s]=a[s];return Ye}catch{return null}}const Rn=new Map;async function Jr(t){const e=i.config.loudnessMode||"off";if(e==="off"||!$()||!t)return;if(i.loudnessGains?.[t]!==void 0){ie&&$a(t);return}if(Rn.has(t))return Rn.get(t);const n=(async()=>{try{const a=i.config.loudnessTarget??-16,s=await m.loudnessLookup(t,a);if(s?.measured){Ni(t,s.gainDB);return}if(e==="album")return;const r=await m.loudnessMeasure(t,a);r?.measured&&Ni(t,r.gainDB??Gc(r,a))}catch(a){console.warn("[audio] 响度补偿获取失败",a)}finally{Rn.delete(t)}})();return Rn.set(t,n),n}function Gc(t,e){if(!t?.integrated)return 0;let n=e-t.integrated;if(t.truePeak){const a=-1-t.truePeak;n>a&&(n=a)}return n>24&&(n=24),n<-24&&(n=-24),Math.round(n*100)/100}function Ni(t,e){i.loudnessGains||(i.loudnessGains={}),i.loudnessGains[t]=e,t===i.currentId&&(ie?($a(t),wa()):Sa()),Ne()}async function Kc(){const t=i.config.loudnessTarget??-16;if(i.loudnessGains={},yn(),Ne(),!!$())try{await m.loudnessInvalidateTarget(t)}catch(e){console.warn("[loudness] 失效旧补偿失败",e)}}async function ka(){if(!$())return;const t=i.config.loudnessMode||"off";if(t==="off"){i.loudnessGains={},yn();return}const e=i.config.loudnessTarget??-16;try{const n=t==="album"?await m.loudnessAlbumGains(e):await m.loudnessGainMap(e);i.loudnessGains=n||{},yn(),Ne(),t==="track"&&i.currentId&&Jr(i.currentId)}catch(n){console.warn("[loudness] 拉取补偿增益失败",n)}}async function un(){if(!$())return null;try{const t=await m.loudnessState();return t&&(i.loudnessState=t),t}catch{return null}}function Zr(t){const e=Number(i.pendingResumeMs)||0;if(i.pendingResumeMs=0,!e||i.config.resumeProgress!==!0)return 0;const n=t?.duration||i.duration||0;return n&&e>=n-3e3?0:e}function eo(){return le||(le=document.getElementById("audio-engine"),le||(le=document.createElement("audio"),le.id="audio-engine",le.preload="auto",le.hidden=!0,document.body.appendChild(le)),le.crossOrigin="anonymous",Yc(le),le)}function Yc(t){t.dataset.bound!=="1"&&(t.dataset.bound="1",t.addEventListener("loadedmetadata",()=>{if(Number.isFinite(t.duration)&&t.duration>0&&(i.duration=t.duration*1e3,Ne(),x()),Dt!=null){const e=Dt;Dt=null;try{t.currentTime=Math.max(0,Math.min(e,i.duration||0)/1e3)}catch{}}to(t)}),t.addEventListener("timeupdate",()=>{document.getElementById("progress")?.dataset.dragging!=="true"&&(i.position=t.currentTime*1e3,hr(i.position),i.config.resumeProgress===!0&&performance.now()-da>5e3&&(da=performance.now(),mr()),Ne())}),t.addEventListener("play",()=>{Se!==Mt&&(ct=!1,i.playing=!0,Ie?.state==="suspended"&&Ie.resume().catch(()=>{}),Ne())}),t.addEventListener("pause",()=>{if(ct){ct=!1;return}if(Se===Mt||t.ended)return;const e=Number.isFinite(t.duration)&&t.duration>0?t.duration*1e3:i.duration||0;e&&(Number.isFinite(t.currentTime)?t.currentTime*1e3:i.position)>=e-300||Za&&performance.now()-Za<Ri||(i.playing=!1,Ne())}),t.addEventListener("ended",()=>{Za=performance.now(),Yr()}),t.addEventListener("error",()=>{Se=At,ct=!1;const e=Je();if(!e||As&&performance.now()-As<Ri||!t.error||!t.error.code)return;const n=t.error?.code;u(`${n===4?"格式无法播放（解码失败）":n===3?"音频数据损坏":n===2?"网络中断":"音频加载失败"}：${e.title}`,{tone:"error",duration:4e3})}))}async function Xc(){const t=eo(),e=Je();if(!e){qe!==null&&(t.pause(),t.removeAttribute("src"),t.load(),qe=null,Se=At);return}if(qe!==e.id){qe=e.id,Se=Mt,ct=!1,lt&&clearTimeout(lt),lt=setTimeout(()=>{lt=null,Se===Mt&&to(le)},qc);const n=++St;let a=null;try{a=e.streamUrl||await m.mediaUrl(e.id)}catch(s){Se=At,u(`无法播放：${s?.message??"取播放地址失败"}`,{tone:"error",duration:5e3});return}if(n!==St)return;if(!a){Se=At;return}Dt=Zr(e),t.src=a,As=performance.now(),t.load(),Qc(t),Sa(),e.online||Jr(e.id),i.playing&&t.paused&&t.play().catch(s=>{const r=s?.name||"";r==="AbortError"||r==="NotAllowedError"||console.warn("[audio] 播放失败",s)});return}Se!==Mt&&(i.playing&&t.paused?t.play().catch(()=>{}):!i.playing&&!t.paused&&(ct=!0,t.pause()))}function to(t){if(lt&&(clearTimeout(lt),lt=null),Se!==Mt)return;Se=At;const e=t||le;e&&(i.playing&&e.paused?e.play().catch(()=>{}):!i.playing&&!e.paused&&(ct=!0,e.pause()))}function Qc(t){if(Jn)return!1;if(Ie&&De)return!0;const e=window.AudioContext||window.webkitAudioContext;if(!e)return Jn=!0,!1;try{Ie=new e,De=Ie.createGain(),De.gain.value=1,Li=Ie.createMediaElementSource(t),Li.connect(De),De.connect(Ie.destination);try{Ke=Ie.createAnalyser(),Ke.fftSize=512,Ke.smoothingTimeConstant=.76,xt=new Uint8Array(Ke.frequencyBinCount),De.connect(Ke)}catch{Ke=null,xt=null}return qt=null,!0}catch(n){return console.warn("[audio] Web Audio 链路建立失败，退回元素音量",n),Jn=!0,!1}}function Sa(){const t=le,e=ti();if(Ie&&De&&!Jn){const n=Ie.currentTime;try{De.gain.cancelScheduledValues(n),De.gain.setTargetAtTime(e,n,.015)}catch{De.gain.value=e}t&&(t.volume=1),qt=e;return}t&&(t.volume=Math.max(0,Math.min(1,e))),qt=e}function Jc(){ti()!==qt&&Sa()}function Zc(t){const e=eo();if(!e.src){Dt=t;return}const n=Math.max(0,Math.min(t,i.duration||0))/1e3;try{e.currentTime=n}catch{Dt=t}}function ed(t=32){if(!Ke||!xt)return null;Ke.getByteFrequencyData(xt);const e=Math.max(1,Math.min(128,Math.floor(t)||32)),n=new Float32Array(e),a=xt.length;for(let s=0;s<e;s+=1){const r=Math.floor(a*(s/e)**1.7),o=Math.min(a,Math.max(r+1,Math.floor(a*((s+1)/e)**1.7)));let l=0;for(let c=r;c<o;c+=1)l+=xt[c];n[s]=l/((o-r)*255)}return n}let Ps="";function Tn(){return i.config.showDesktopLyrics===!0}async function qi(t,{force:e=!1}={}){const n=!!t,a=Tn()!==n;if(i.config.showDesktopLyrics=n,Ps="",!a&&!e)return ve(),{ok:!0,enabled:n,unchanged:!0};if(!$())return xa({enabled:n}),{ok:!0,preview:!0,enabled:n};try{const s=await m.desktopLyrics(n);return n&&s?.ok===!1&&(i.config.showDesktopLyrics=!1,ve()),s}catch(s){return console.warn("[desktop-lyrics] 打开/关闭桌面歌词失败",s),i.config.showDesktopLyrics=!1,ve(),{ok:!1,enabled:n,error:String(s?.message??s)}}}function td({text:t="",playing:e=!1,fontSize:n=26}={}){if(!Tn())return;const a=[t,e?1:0,Math.round(n)].join("|");if(a!==Ps){if(Ps=a,!$()){xa({text:t,playing:e});return}m.updateDesktopLyrics({text:t,playing:e,fontSize:n}).catch(s=>{console.warn("[desktop-lyrics] 同步歌词失败",s?.message??s)})}}function xa({text:t="",playing:e=!1,enabled:n=null}={}){const a=n===null?Tn():!!n,s=!$()&&a&&e&&!!t;i.floatingLyrics={show:s,text:t},ve()}function nd(){return Math.round(Hs()*1.3)}const ad="/skins/",sd={loading:"歌词匹配中…",matching:"歌词匹配中…",failed:"歌词匹配失败",none:"暂无歌词"};let ge=new Map;const Os=new Set,es=new Set;function id(t,e){if(!t?.id)return;const n=ge.get(t.id)||{lines:[],text:"",source:"none"};n.status!==e&&(ge.set(t.id,{...n,status:e}),O.lyricsStatus=null,de()?.id===t.id&&X({type:"lyrics",...xe()}))}function de(){return Ze(i.currentId)}function Bi(){const t=i.config.lyricsSources;return!Array.isArray(t)||!t.length?!0:t.includes("online")}async function no(t){if(!t)return{lines:[],text:"",source:"none",status:"none"};if(ge.has(t.id))return ge.get(t.id);let e="",n="none";if(ge.set(t.id,{lines:[],text:"",source:"none",status:"loading"}),$()){const s=await m.loadLyrics(t.id);s&&typeof s=="object"&&typeof s.lrc=="string"?(e=s.lrc,n=s.source||"backend"):typeof s=="string"&&(e=s,n="backend"),!e&&Bi()&&(id(t,"matching"),e=await rd(t),e&&(n="online"))}if(!e){if($()){const r=Bi()?"failed":"none",o={lines:[],text:"",source:"none",status:r};return ge.set(t.id,o),o}const s=i.songs.findIndex(r=>r.id===t.id);e=s===0?Jo:s===1?Zo:od(t),n="preview"}const a={lines:_s(e),text:e,source:n,status:"ok"};return ge.set(t.id,a),a}async function rd(t){if(Os.has(t.id))return"";Os.add(t.id);try{if(t.online){const n=await m.onlineLyrics(t.title||"",t.artist||"",t.duration||0),a=typeof n?.lrc=="string"?n.lrc:"";return a?(m.lyricsSave(t.id,a,n?.source||"online",!1).catch(()=>{}),a):""}const e=await m.lyricsAutoMatch(t.id);return typeof e?.lrc=="string"?e.lrc:""}catch(e){return console.warn("[lyrics] 在线自动匹配失败",e),""}}function od(t){const e=[];for(let n=12;n<Math.max(60,Math.floor((t.duration||18e4)/1e3)-10);n+=9)e.push(`[00:${String(n).padStart(2,"0")}.00]（${t.title} · 暂无歌词文件，接入后端后可读取 .lrc 或内嵌歌词）`);return e.join(`
`)}const Ls=new Map;function Pt(t){return Ls.get(t)||0}function ut(t,e){if(!t)return 0;const n=Math.round(Number(e)||0);return n?Ls.set(t,n):Ls.delete(t),O.lyricsText=null,w.ctx&&de()?.id===t&&X({type:"lyrics",...xe()}),n}let Nn={songId:"",offset:0,lines:[]};function ai(t){const n=(t?ge.get(t.id):null)?.lines||[],a=Pt(t?.id);if(!a||!n.length)return n;if(Nn.songId===t.id&&Nn.offset===a)return Nn.lines;const s=n.map(r=>({time:r.time+a,text:r.text}));return Nn={songId:t.id,offset:a,lines:s},s}function we(t){const e=t?Ze(t):de(),n=e?ge.get(e.id):null;return{song:e||null,songId:e?.id||"",text:n?.text||"",source:n?.source||"none",status:n?.status||(n?.lines?.length?"ok":"none"),lines:n?.lines||[]}}function Fi(t){switch(t){case"embedded":return"内嵌歌词";case"lrc-file":return"同目录 .lrc";case"cache":return"歌词缓存";case"online":return"在线自动匹配";case"manual":return"手动编辑";case"preview":return"预览数据";default:return"暂无"}}async function pa(){const t=de();if(!(!t||ge.has(t.id)||es.has(t.id))){es.add(t.id);try{await no(t)}finally{es.delete(t.id)}}}function ld(){const t=de();if(!t)return"";const e=ai(t);if(!e.length)return"";const n=Vs(e,i.position);return n>=0?e[n].text:""}function cd(){const t={prev:"",text:"",next:""},e=de();if(!e)return t;const n=ai(e);if(!n.length)return t;const a=Vs(n,i.position);return a<0?t:{prev:n[a-1]?.text||"",text:n[a].text||"",next:n[a+1]?.text||""}}async function ts(t,e,n="online",a={}){if(!t||!e)return!1;ge.set(t,{lines:_s(e),text:e,source:n,status:"ok"}),Os.add(t),O.lyricsText=null,O.lyricsStatus=null;let s=null;if(!a.transient&&$()){const r=a.embed??i.config.embedMeta===!0;try{const o=await m.lyricsSave(t,e,n,r);s=o||null;const l=typeof o?.lrc=="string"&&o.lrc?o.lrc:e;l!==e&&(ge.set(t,{lines:_s(l),text:l,source:n,status:"ok"}),O.lyricsText=null,O.lyricsStatus=null)}catch(o){console.warn("[lyrics] 写入缓存失败",o)}}return w.ctx&&de()?.id===t&&X({type:"lyrics",...xe()}),s||{ok:!0}}const Rs=[],ns=new Set;let Zn=null;async function si(){return Zn||(Zn=ud()),Zn}async function dd(){try{await si()}catch(t){console.warn("[skins] 启动扫描样式失败",t)}return Lt()}async function ud(){if(!$())return Lt();try{const t=await m.listSkins(),e=Array.isArray(t)?t:[];let n="";try{n=String(await m.skinsToken()||"")}catch(r){console.warn("[skins] 读取皮肤访问令牌失败",r)}const a=n?`?t=${encodeURIComponent(n)}`:"";Rs.length=0;const s=new Set;for(const r of e){if(!r?.id||!r?.module)continue;const o=`${ad}${encodeURIComponent(r.id)}/`;try{await hl({id:r.id,name:r.name,module:o+String(r.module).replace(/^\/+/,"")+a,styles:(Array.isArray(r.styles)?r.styles:[]).map(l=>o+String(l).replace(/^\/+/,"")+a)}),ns.add(r.id),s.add(r.id)}catch(l){Rs.push({id:r.id,reason:l?.message??String(l)}),console.warn(`[skins] 样式「${r.id}」加载失败：`,l)}}for(const r of[...ns])s.has(r)||(ns.delete(r),ml(r))}catch(t){console.warn("[skins] 皮肤目录扫描失败",t)}return Lt()}async function ii(){Zn=null,await si(),fd()}async function pd(t){await m.deleteSkin(t),await ii();const e=Lt().some(n=>n.id===t);return!e&&(i.pvMode===t||i.config.playerViewMode===t)&&_n(Sn("").skin?.id||""),{removed:!e,skinIds:Lt().map(n=>n.id)}}function ao(){return Rs.slice()}let so=0;function io(){return so}function fd(){so+=1,ve()}const w={view:null,stage:null,backgroundRoot:null,skin:null,ctx:null,mountedId:null,closeTimer:null,resizeObserver:null,themeObserver:null,carouselTimer:null,carouselIndex:0,carouselLastAdvance:0,carouselSongId:null},O={songId:null,cover:null,lyricsText:null,lyricsStatus:null,options:null,playing:null,themeId:null};function Ca(){return{position:i.position,duration:i.duration,playing:i.playing,volume:i.volume,muted:i.muted}}function ri(t){if(!t)return[ga];const e=i.coverSets.get(t.id)?.items,n=Array.isArray(e)?e.map(a=>a.preview).filter(Boolean):[];return n.length?n:[mt(t)]}function oi(t){const e=t?ge.get(t.id):null,n=ai(t),a=e?.status||(n.length?"ok":"none");return{lines:n,text:e?.text||"",source:e?.source||"none",status:a,statusText:n.length?"":sd[a]||"暂无歌词",index:Vs(n,i.position)}}function hd(t){return t?{id:t.id??"",title:t.title||"",artist:t.artist||"",album:t.album||"",duration:t.duration||0}:null}function xe(){const t=de(),e=ri(t),n=Ve(w.carouselIndex,0,Math.max(0,e.length-1));return{song:hd(t),cover:e[n]||ga,covers:e,coverIndex:n,lyrics:oi(t)}}function Ta(){return{showLyrics:i.config.showLyrics!==!1,lyricsFontSize:i.config.lyricsFontSize,animations:i.config.animations!==!1,coverCarousel:i.config.coverCarousel===!0,coverCarouselInterval:lo().seconds,interactive:!0}}function md(){return xe()}function ro(){return Ca()}function gd(t={}){return{...Ta(),...t}}function vd(){const t=new Map,e={root:w.stage,backgroundRoot:w.backgroundRoot,spectrum:ni,defaultCover:ga,get themeId(){return document.documentElement.dataset.theme||""},get mode(){return document.documentElement.dataset.mode==="light"?"light":"dark"},playback:Ca,media:xe,options:Ta,actions:{seek(n){ua(n),co({force:!0})},togglePlay:$n,next:()=>mn(!1),prev:()=>js(),openFolder(){const n=de();n?.path&&m.revealInExplorer(n.path)},openCoverPanel(){const n=de();!n||n.online||ht(()=>Promise.resolve().then(()=>di),void 0).then(a=>a.openCoverPanel(n.id))}},on(n,a){return typeof a!="function"?()=>{}:(t.has(n)||t.set(n,new Set),t.get(n).add(a),()=>t.get(n)?.delete(a))},push(n){try{w.skin?.update?.(e,n)}catch(a){console.warn(`[skins] ${w.mountedId} 处理 ${n.type} 更新失败`,a)}for(const[a,s]of t)if(!(a!==n.type&&a!=="*"))for(const r of s)try{r(n)}catch(o){console.warn(`[skins] ${a} 订阅回调失败`,o)}}};return e}function X(t){w.ctx?.push(t)}function bd(t){const{skin:e,fellBack:n}=Sn(t);if(!e)return;n&&console.warn(`[skins] 样式「${t}」不存在，已回退到「${e.name}」`),oo(),w.skin=e,w.mountedId=e.id,w.stage.innerHTML="",w.view.dataset.skin=e.id,w.view.dataset.theme=e.id,w.view.dataset.skinBackground=e.background?"yes":"no",document.getElementById("app")?.setAttribute("data-mode",e.id),i.pvMode=e.id;const a=vd();w.ctx=a;try{e.mount(a)}catch(s){console.error(`[skins] ${e.id} 挂载失败`,s),w.stage.innerHTML=`<div class="skin-error">样式「${pi(e.name)}」加载失败：${pi(s?.message??s)}</div>`;return}Bt(),a.push({type:"mount",...xe(),...Ca(),options:Ta()}),yd(),Ns("closed")}function Ns(t){const e=w.backgroundRoot;e&&(e.dataset.state=t)}function oo(){if(w.skin){X({type:"close"}),X({type:"destroy"});try{w.skin.destroy?.(w.ctx)}catch(t){console.warn(`[skins] ${w.mountedId} 卸载失败`,t)}w.stage.innerHTML="",w.skin=null,w.ctx=null,w.mountedId=null,w.resizeObserver&&(w.resizeObserver.disconnect(),w.resizeObserver=null),w.carouselTimer&&(clearInterval(w.carouselTimer),w.carouselTimer=null)}}function yd(){w.resizeObserver||typeof ResizeObserver!="function"||(w.resizeObserver=new ResizeObserver(()=>{const t=w.stage.getBoundingClientRect();X({type:"resize",width:Math.round(t.width),height:Math.round(t.height)})}),w.resizeObserver.observe(w.stage,{box:"border-box"}))}function lo(){const t=Number(i.config.coverCarouselInterval),e=Number.isFinite(t)&&t>0?Math.max(2,t):10;return{enabled:i.config.coverCarousel===!0,seconds:e,intervalMs:e*1e3}}function _d(){const t=de();w.carouselSongId!==(t?.id??null)&&(w.carouselSongId=t?.id??null,w.carouselIndex=i.coverSets.get(t?.id)?.active??0,w.carouselLastAdvance=Date.now());const{enabled:e,intervalMs:n}=lo(),a=ri(t);!e||!i.playerOpen||!i.playing||a.length<2||Date.now()-w.carouselLastAdvance<n||(w.carouselLastAdvance=Date.now(),w.carouselIndex=(w.carouselIndex+1)%a.length,X({type:"media",...xe()}))}function wd(){w.carouselTimer||(w.carouselTimer=setInterval(_d,1e3))}function $d(){const t=ri(de());return t.length<2?!1:(w.carouselIndex=(w.carouselIndex+1)%t.length,w.carouselLastAdvance=Date.now(),X({type:"media",...xe()}),!0)}function zi(){O.cover=null,w.ctx&&X({type:"media",...xe()})}function as(t={}){const e=xe(),n=t.type==="song"||t.type==="lyrics"||t.type==="media",a=e.cover!==O.cover||e.song?.id!==O.songId;O.cover=e.cover,!(!a&&!n)&&X({...t,...e})}function Wi(){const t=Ta(),e=JSON.stringify(t);e!==O.options&&(O.options=e,X({type:"options",options:t}))}const Ui=[["--bg-app","--pv-bg"],["--text-1","--pv-text"],["--text-2","--pv-text-2"],["--text-3","--pv-text-3"],["--accent","--pv-accent"],["--surface-1","--pv-surface-1"],["--surface-2","--pv-surface-2"],["--surface-3","--pv-surface-3"],["--surface-hover","--pv-surface-hover"],["--surface-active","--pv-surface-active"],["--glass-bg-strong","--pv-glass-strong"],["--glass-bg","--pv-glass-weak"],["--glass-border","--pv-glass-border"],["--divider","--pv-divider"],["--border-2","--pv-border-2"]];function Bt(){const t=w.view||ms("#playerview"),e=!!t?.dataset.theme&&!!i.playerOpen,n=document.querySelectorAll('[data-surface-owner="playerview"]');if(!e){for(const r of n){for(const[,o]of Ui)r.style.removeProperty(o);r.removeAttribute("data-theme")}return!1}const a=getComputedStyle(t),s=Ui.map(([r,o])=>[o,a.getPropertyValue(r).trim()]);for(const r of n){for(const[o,l]of s)r.style.getPropertyValue(o)!==l&&r.style.setProperty(o,l);r.dataset.theme!==t.dataset.theme&&(r.dataset.theme=t.dataset.theme)}return!0}async function kd(){if(!w.view){if(w.view=ms("#playerview"),w.stage=ms("#playerview-stage"),w.backgroundRoot=document.getElementById("skin-background"),!w.view||!w.stage)return;Ed(),wd()}const t=w.view,e=de();if(!!!i.playerOpen){t.dataset.state!=="closed"&&(t.dataset.state="closed",Bt(),Ns("closed"),w.closeTimer&&clearTimeout(w.closeTimer),w.closeTimer=setTimeout(()=>{w.closeTimer=null,!i.playerOpen&&(t.hidden=!0,oo(),fa())},nd()+20));return}w.closeTimer&&(clearTimeout(w.closeTimer),w.closeTimer=null),t.hidden=!1,await si();const a=i.pvMode||i.config.playerViewMode||"",s=w.mountedId!==a;if(s&&(bd(a),fa()),(t.dataset.state!=="opened"||s)&&(t.offsetHeight,t.dataset.state="opened",Ns("opened"),Bt()),!w.skin)return;if(O.songId!==(e?.id??null)){O.songId=e?.id??null,O.cover=null,O.lyricsText=null,w.carouselSongId=e?.id??null,w.carouselIndex=i.coverSets.get(e?.id)?.active??0,as({type:"song"});const o=e?.id??null,l=await no(e);if((de()?.id??null)!==o)return;O.lyricsText=l.text,O.lyricsStatus=l.status||"",as({type:"lyrics"}),Wi();return}as();const r=oi(e);(r.text!==O.lyricsText||r.status!==O.lyricsStatus)&&(O.lyricsText=r.text,O.lyricsStatus=r.status,X({type:"lyrics",...xe()})),Wi(),co()}function fa(){O.songId=null,O.cover=null,O.lyricsText=null,O.lyricsStatus=null,O.options=null,O.playing=null}function co({force:t=!1}={}){if(!i.playerOpen||!w.skin)return;const e=Ca();(O.playing!==e.playing||t)&&(O.playing=e.playing,X({type:"state",...e})),X({type:"progress",...e,lyricIndex:oi(de()).index}),Td(e.playing)}const Sd=30,xd=32;let Gt=0,Kt=!1;function Cd(){const t=w.skin?.spectrum;if(!t)return 0;const e=Number(t);return!Number.isFinite(e)||e<=0?xd:Math.max(1,Math.min(256,Math.round(e)))}function Td(t){const e=t===!0?Cd():0;if(!e){if(Gt=0,!Kt)return;Kt=!1,X({type:"spectrum",bands:null});return}const n=typeof performance<"u"&&performance.now?performance.now():Date.now();if(Gt&&n-Gt<1e3/Sd)return;Qr(e);const a=ni(e);if(!a){if(!Kt)return;Gt=0,Kt=!1,X({type:"spectrum",bands:null});return}Gt=n,Kt=!0,X({type:"spectrum",bands:Array.from(a,s=>Math.round(s*1e3)/1e3)})}function Ed(){w.themeObserver||(O.themeId=document.documentElement.dataset.theme||"",w.themeObserver=new MutationObserver(()=>{const t=document.documentElement.dataset.theme||"",e=document.documentElement.dataset.mode||"dark";t!==O.themeId&&(O.themeId=t,X({type:"theme",themeId:t,mode:e}))}),w.themeObserver.observe(document.documentElement,{attributes:!0,attributeFilter:["data-theme","data-mode"]}))}function _n(t){const{skin:e,fellBack:n}=Sn(t);e&&(i.pvMode=e.id,i.config.playerViewMode=e.id,fa(),x(),n&&console.warn(`[skins] 样式「${t}」不可用，已切换到「${e.name}」`))}function uo(){i.playerOpen=!0,i.pvMode=Sn(i.config.playerViewMode||"").skin?.id||i.pvMode,fa(),x()}function Ea(){i.playerOpen=!1,x()}function qs(){i.playerOpen?Ea():uo()}function ha(){return Lt().map(t=>({id:t.id,name:t.name,icon:t.icon||"disc",builtin:t.builtin!==!1,source:t.source||""}))}function En(){return i.config.showDesktopWallpaper===!0}function ss(){ve()}async function Id(){if(!$())return!0;let t=!0,e="";try{const n=await m.desktopWallpaperState();t=n?.supported!==!1,e=n?.reason||""}catch(n){return console.info("[desktop-wallpaper] 能力探测失败",n?.message??n),!0}return t?!0:(i.desktopWallpaperSupport={supported:!1,reason:e||"当前系统不支持桌面背景歌词"},ve(),!1)}async function Hi(t,{force:e=!1}={}){const n=!!t,a=En()!==n;if(i.config.showDesktopWallpaper=n,ss(),!a&&!e)return{ok:!0,enabled:n,unchanged:!0};if(!$())return n?(Bs(),{ok:!0,preview:!0,enabled:n}):(xa({enabled:!1}),{ok:!0,preview:!0,enabled:n});try{const s=await m.desktopWallpaper(n);return n&&s?.ok===!1?(i.config.showDesktopWallpaper=!1,ss(),x()):n&&(Dd(),Bs()),s}catch(s){return console.warn("[desktop-wallpaper] 打开/关闭桌面背景歌词失败",s),i.config.showDesktopWallpaper=!1,ss(),x(),{ok:!1,enabled:n,error:String(s?.message??s)}}}const E={setup:"",songId:"\0",cover:"\0",lyricsText:"\0",lyricsStatus:"\0",options:"",playing:null,volume:null,muted:null,duration:-1,lyricIndex:-2,position:-1,progressAt:0,progressPlaying:null};function Dd(){E.setup="",E.songId="\0",E.cover="\0",E.lyricsText="\0",E.options="",E.playing=null,E.volume=null,E.muted=null,E.duration=-1,E.lyricIndex=-2,E.position=-1,E.progressAt=0,E.progressPlaying=null}function Ad(){const t=[],e=Rd();e.signature!==E.setup&&(E.setup=e.signature,t.push({type:"theme",skinId:e.skinId,themeId:e.theme,theme:e.theme,mode:e.mode,density:e.density,tokens:e.tokens}));const n=md(),a=ro(),s=gd({interactive:!1}),r=n.song?.id??"";r!==E.songId?(E.songId=r,E.cover=n.cover,E.lyricsText=n.lyrics.text,E.lyricIndex=n.lyrics.index,E.duration=a.duration,E.progressPlaying=a.playing,E.progressAt=ji(),t.push({type:"song",song:n.song,cover:n.cover,covers:n.covers,coverIndex:n.coverIndex,lyrics:n.lyrics})):(n.cover!==E.cover&&(E.cover=n.cover,t.push({type:"media",cover:n.cover,covers:n.covers,coverIndex:n.coverIndex})),(n.lyrics.text!==E.lyricsText||n.lyrics.status!==E.lyricsStatus)&&(E.lyricsText=n.lyrics.text,E.lyricsStatus=n.lyrics.status,E.lyricIndex=n.lyrics.index,t.push({type:"lyrics",lyrics:n.lyrics})));const o=JSON.stringify(s);o!==E.options&&(E.options=o,t.push({type:"options",options:s})),(a.playing!==E.playing||a.volume!==E.volume||a.muted!==E.muted)&&(E.playing=a.playing,E.volume=a.volume,E.muted=a.muted,t.push({type:"state",playing:a.playing,volume:a.volume,muted:a.muted}));const l=ji(),c=Ld(l,a.playing);return c&&t.push(c),(a.position!==E.position||n.lyrics.index!==E.lyricIndex||a.duration!==E.duration||a.playing!==E.progressPlaying)&&(E.position=a.position,E.lyricIndex=n.lyrics.index,E.duration=a.duration,E.progressPlaying=a.playing,E.progressAt=l,t.push({type:"progress",position:a.position,duration:a.duration,playing:a.playing,lyricIndex:n.lyrics.index})),t}function ji(){return typeof performance<"u"&&performance.now?performance.now():Date.now()}const Md=40,Pd=32;let Yt=0,Xt=!1;function Od(){const t=i.pvMode||i.config.playerViewMode||"";try{const e=Sn(t).skin?.spectrum;if(!e)return 0;const n=Number(e);return!Number.isFinite(n)||n<=0?Pd:Math.max(1,Math.min(256,Math.round(n)))}catch{return 0}}function Ld(t,e){const n=En()&&e===!0?Od():0;if(!n)return Yt=0,Xt?(Xt=!1,{type:"spectrum",bands:null}):null;if(Yt&&t-Yt<Md)return null;Qr(n);const a=ni(n);return a?(Yt=t,Xt=!0,{type:"spectrum",bands:Array.from(a,s=>Math.round(s*100)/100)}):Xt?(Yt=0,Xt=!1,{type:"spectrum",bands:null}):null}function Bs(){if(En()){if(!$()){const t=cd();xa({text:t.text,playing:ro().playing});return}for(const t of Ad())m.updateDesktopWallpaper(t).catch(e=>{console.warn("[desktop-wallpaper] 同步背景歌词失败",e?.message??e)})}}function Rd(){const t=qd(),e=i.pvMode||i.config.playerViewMode||"",n=document.documentElement.dataset.theme||"",a=document.documentElement.dataset.mode||"dark",s=document.documentElement.dataset.density||"";return{skinId:e,theme:n,mode:a,density:s,tokens:t.values,signature:[e,n,a,s,t.signature].join("|")}}function Nd(){const t=i.config||{};return[document.documentElement.dataset.theme||"",document.documentElement.dataset.mode||"",document.documentElement.dataset.density||"",t.glassBlurCustom?t.glassBlur:"",t.glassAlphaCustom?t.glassAlpha:"",t.accentFromCover?1:0,t.coverSeed||"",t.coverSeed2||"",t.animations===!1?0:1,t.animationsSpeed||"",t.lyricsFontSize,t.listDensity||""].join("|")}let Vi="\0",Gi={};function qd(){const t=Nd();return t!==Vi&&(Vi=t,Gi=Bd()),{signature:t,values:Gi}}function Bd(){const t=new Set(Object.keys(el()));for(const a of document.styleSheets){let s=null;try{s=a.cssRules}catch{continue}po(s,t,0)}const e=getComputedStyle(document.documentElement),n={};for(const a of t){const s=e.getPropertyValue(a).trim();!s||/[;{}]/.test(s)||(n[a]=s)}return n}function po(t,e,n){if(!(!t||n>3))for(const a of t){if(a.style)for(const s of a.style)s.startsWith("--")&&e.add(s);a.cssRules&&po(a.cssRules,e,n+1)}}const Y=Object.freeze({off:"off",lyrics:"lyrics",wallpaper:"wallpaper"});function Fd(){return i.config.showDesktopWallpaper===!0?Y.wallpaper:i.config.showDesktopLyrics===!0?Y.lyrics:Y.off}async function fo(t){const e=zd(t),n=Fd();if(e===n)return{ok:!0,mode:e,unchanged:!0};const a=await Ki(e);return a?.ok!==!1?{ok:!0,...a,mode:e}:n!==Y.off&&(await Ki(n))?.ok!==!1?{ok:!1,...a,mode:n,restored:!0}:{ok:!1,...a,mode:Y.off}}async function Ki(t){return t!==Y.lyrics&&await qi(!1),t!==Y.wallpaper&&await Hi(!1),t===Y.lyrics?qi(!0):t===Y.wallpaper?Hi(!0):{ok:!0}}function zd(t){return t===Y.lyrics?Y.lyrics:t===Y.wallpaper?Y.wallpaper:Y.off}const Wd=[{value:"play",label:"播放"},{value:"play-list",label:"播放当前列表"},{value:"next",label:"下一首播放"}],Ud=[{value:"system",label:"跟随系统"},{value:"round",label:"标准"},{value:"small",label:"小圆角"},{value:"square",label:"直角"}],Hd=[{value:"compact",label:"紧凑"},{value:"cozy",label:"标准"},{value:"roomy",label:"宽松"}],jd=[{value:"fast",label:"快速 0.25s"},{value:"medium",label:"适中 0.5s"},{value:"slow",label:"缓慢 0.75s"}],Vd={embedded:"内嵌歌词","lrc-file":"同目录 .lrc",cache:"歌词缓存",online:"在线自动匹配"};function Gd(){const e=(Array.isArray(i.config.lyricsSources)?i.config.lyricsSources:[]).map(n=>Vd[n]||n);return e.length?e.join(" → "):"（未配置）"}function li(){const t=i.coverCache;if(!t)return"正在读取…";const e=((t.bytes||0)/1024/1024).toFixed(1);return`已缓存 ${D(t.covers||0)} 张封面、${D(t.lyrics||0)} 份歌词，共 ${e} MB`}function ho(){const t=i.coverCache||{};return(Number(t.covers)||0)+(Number(t.lyrics)||0)}function Kd(){const t="默认关闭：封面与歌词都只放在缓存目录里。开启后下载 / 更换封面时会把它们写进文件标签，这样把文件拷到别的播放器上也能看到封面与歌词（m4a / flac 支持，mp3 等格式会明确跳过）";return i.coverCache?ho()===0?`${t}。当前缓存里还没有封面或歌词可写`:`${t}。缓存里已经有 ${li()}`:t}function Yd(){return`这个开关只对之后下载或更换的封面生效；已经存在缓存里的封面与歌词（${li()}）可以用下面的按钮一次性写进歌曲文件。mp3 / wav 等暂不支持写标签的格式会被跳过，不会动你的文件。`}function Yi(){const t=ba(),e=[];for(const a of t)for(const s of a.swatch||[])e.includes(s)||e.push(s);const n=e.map((a,s)=>`[data-swatch="${s}"]{background:${a}}`).join(`
`);return Us("swatch-styles",n),a=>(a.swatch||[]).map(s=>e.indexOf(s))}function Xd(t){if(!t?.dir)return`（浏览器预览模式读不到本机目录，以下是源码仓库里的参考文件）
1. 接口唯一定义（含 JSDoc 类型）：frontend/packages/player-skins/src/contract.js
2. 内置三款实现（结构可参考）：frontend/packages/player-skins/src/skins/classic.js、immersive.js、minimal.js
3. 可直接复制改名的最小示例包：数据目录下的 player-skins/_template/（skin.js / skin.css / skin.json）
4. 说明文档：frontend/packages/player-skins/README.md`;const e=["本机真实路径如下。如果你能读文件，请先打开它们当范例；如果读不到（例如纯聊天环境），请让使用者把下面第 2 条的文件内容贴给你，再开始写。",`1. 样式（皮肤）目录 —— 第三方样式包都放在这里，扫描只认它下面的一层子目录：${t.dir}`];t.example?e.push(`2. 示例样式包（完整可运行的 skin.js / skin.css / skin.json，复制改名就是一份新样式）：${t.example}`):e.push("2. 示例样式包：本机没有找到 _template 目录，请只按本规格的接口定义写。"),t.current?e.push(`3. 当前正在使用的样式包（最贴近现状的参考）：${t.current}`):e.push(`3. 当前正在使用的是内置样式（${t.currentId||"classic / immersive / minimal"}）：它的源码打包在程序里，磁盘上没有对应目录，请以第 2 条的示例包为准。`);const n=Array.isArray(t.packs)?t.packs:[];if(n.length){e.push("4. 该目录里已有的第三方样式包（可以直接读它们的入口与样式）：");for(const a of n){const s=[a.module,...Array.isArray(a.styles)?a.styles:[]].filter(Boolean);e.push(`   · ${a.name||a.id}（id: ${a.id}）：${s.join("、")||a.dir}`)}}else e.push("4. 该目录里目前还没有第三方样式包 —— 你写的这个会是第一个。");return e.push("5. 宿主只加载 apiVersion 为 1 的样式，本程序用的就是这个版本。"),e.join(`
`)}function Qd(t){if(!t?.dir)return`（浏览器预览模式读不到本机目录，以下是源码仓库里的参考文件）
1. 令牌默认值与注释：frontend/src/styles/tokens.css、frontend/src/styles/themes/_template.css
2. 内置主题（可直接对照写法）：frontend/src/styles/themes/dark-minimal.css、light-minimal.css、cover-dark.css
3. 扫描与指令解析实现：internal/theme/theme.go`;const e=["本机真实路径如下。如果你能读文件，请先打开它们当范例；如果读不到（例如纯聊天环境），请让使用者把下面第 2 条的文件内容贴给你，再开始写。",`1. 主题目录 —— 用户主题都放在这里，只扫一层、不递归；文件名默认就是主题 id，显示名由 @theme-name 决定：${t.dir}`];t.currentFile?e.push(`2. 当前正在使用的主题：${t.currentName||t.currentId}（id: ${t.currentId}）→ 文件：${t.currentFile}`):e.push("2. 当前主题的文件没找到，请以第 3 条列出的文件为准。");const n=Array.isArray(t.files)?t.files:[];if(n.length){e.push("3. 主题目录里已有的主题文件（都是合法示例，可直接对照写法）：");for(const a of n)e.push(`   · ${a.file}（${a.name||a.id}，id: ${a.id}，模式 ${a.mode}，${a.builtin?"内置":"用户导入"}）`)}else e.push("3. 主题目录里暂时没有 .css 文件。");return e.join(`
`)}function Jd(t=null){return`请为「本地音乐播放器」（Go + WebView2 的 Windows 桌面应用）产出一个第三方「播放界面样式（皮肤）」包。这个包会被应用直接扫描并加载，因此必须严格满足下面的规格。

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
  apiVersion: 2,                // 必需，且必须正好等于 2；其它值会被直接跳过
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
1. 不要 import 应用内部模块（store / bridge / utils / playerhost / @localmusicplayer/player-skins 等）；数据只从 ctx 拿，动作只走 ctx.actions；不要直接操作音频元素或应用状态。
2. 不要轮询：禁止用 setInterval 或定时 setTimeout 反复拉数据（动画、防抖、一次性延时除外）。
3. 歌词高亮用 ctx.media().lyrics.index 与 lines，不要自己解析 LRC 文本。
4. 动效要尊重 ctx.options().animations（为 false 时不要做位移动效）；时长与缓动优先用 --dur / --ease。
5. destroy(ctx) 里清掉定时器、事件监听、ResizeObserver 与大对象引用；切换样式会先 destroy 再 mount，两个方法都可能被多次调用。
6. 不要往 window / document 上挂全局变量或样式，不要改 document.documentElement 上的 data-* 属性。
7. 不要发网络请求（CSP 也会拦），不要用 eval / new Function。

【六、交付前自检清单】
1. 目录名 = id = skin.js 里的 id = CSS 选择器里的 data-skin 值；
2. skin.js 有 export default，且包含 apiVersion: 2、id、name、mount；
3. 每条 CSS 选择器都在 .playerview[data-skin="<样式id>"] 作用域内；
4. 没有裸包名 import、没有 fetch、没有 setInterval 轮询、没有全局选择器、没有 !important；
5. 换歌、歌词装载、进度更新、深浅色切换、窗口缩放、切走再切回都不会报错，也不留残余节点或监听。

【七、参考资料】
${Xd(t)}

【八、输出格式】
1. 先写清目录名与文件清单；
2. 再逐个文件输出完整代码，每个文件单独一个代码块，并在代码块第一行用注释标明文件名；
3. 不要省略、不要用省略号占位、不要留 __SKIN_ID__ 之类的占位符，代码要能直接运行。

【九、风格】
本提示词只约定产物必须满足的规则、格式、环境与参考，不规定也不暗示视觉风格；具体样式（布局、配色、动效、气质）由使用者自行构思。
请以使用者随附的风格说明为准；若使用者没有给出，先向使用者确认，不要自行假设。

【风格要求 · 由使用者自行填写（本行只是占位，本提示词不提供任何风格建议）】
`}function Zd(t=null){return`请为「本地音乐播放器」（Go + WebView2 的 Windows 桌面应用）产出一个「外观主题」CSS 文件。

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
${Qd(t)}

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
`}function mo({copyKey:t,importKind:e,importLabel:n}){return p` <div class="card__actions">
    <button class="btn btn--sm btn--primary" type="button" data-copy-prompt=${t}>
      <svg aria-hidden="true"><use href="#i-file"></use></svg><span>复制提示词</span>
    </button>
    <button class="btn btn--sm" type="button" data-import=${e}>
      <svg aria-hidden="true"><use href="#i-folder"></use></svg><span>${n}</span>
    </button>
  </div>`}async function eu(){if(!$())return null;try{const t=document.documentElement.dataset.theme||i.config.theme||"";return await m.themeReference(t)||null}catch(t){return console.warn("[settings] 读取主题参考资料失败",t),null}}async function tu(){if(!$())return null;try{const t=i.pvMode||i.config.playerViewMode||"";return await m.skinReference(t)||null}catch(t){return console.warn("[settings] 读取样式参考资料失败",t),null}}async function nu(t){const n=t==="theme"?Zd(await eu()):Jd(await tu());try{await navigator.clipboard.writeText(n),u("提示词已复制，粘贴给 AI 即可",{tone:"success",duration:2e3});return}catch{}const a=document.createElement("textarea");a.value=n,a.setAttribute("readonly",""),a.style.cssText="position:fixed;left:-9999px;top:0;opacity:0;",document.body.appendChild(a),a.select();let s=!1;try{s=document.execCommand("copy")}catch{s=!1}a.remove(),u(s?"提示词已复制，粘贴给 AI 即可":"复制失败，请手动复制",{tone:s?"success":"warning",duration:2600})}async function au(t,e={}){const n=t==="theme";if(!$()){u("浏览器预览模式无法导入，请手动把文件放进目录",{tone:"warning",duration:3600});return}const a=u(n?"正在导入主题…":"正在导入样式包…",{duration:0});try{const s=n?await m.importTheme():await m.importSkin();if(a.close(),s?.cancelled)return;const r=n?Array.isArray(s?.imported)?s.imported:[]:s?.id?[s.id]:[],o=Array.isArray(s?.skipped)?s.skipped:[];n?(await ya(),e.commit?.(),e.render?.()):(await ii(),e.render?.());let l=n?r.length?`已导入 ${r.length} 个主题：${r.join("、")}`:"没有导入任何主题":r.length?`已导入样式「${r[0]}」`:"没有导入任何样式";o.length&&(l+=`；另有 ${o.length} 个文件被跳过`),u(l,{tone:r.length?o.length?"warning":"success":"warning",duration:4600}),o.length&&ne({title:"部分文件没有导入",body:p`<div class="setting__hint setting__hint--steps">
          ${o.map((c,d)=>p`${d?p`<br />`:F}${c}`)}
        </div>`,okText:"知道了",cancelText:"关闭",onOk:()=>!0})}catch(s){a.close(),u(`导入失败：${s?.message??s}`,{tone:"error",duration:6e3})}}function go(t,e={}){t.addEventListener("click",n=>{const a=n.target.closest("[data-copy-prompt]");if(a){nu(a.dataset.copyPrompt);return}const s=n.target.closest("[data-import]");s&&au(s.dataset.import,e)})}function su(t={}){const e=p` <div class="setting__hint setting__hint--steps">
      · 点「复制提示词」把它粘贴给
      AI：提示词里只有产物的目录结构、接口契约与硬性规则，不含任何风格建议，风格请在末尾那条「风格要求」里自己补一句，它会直接产出一个样式包目录；<br />
      · 提示词里的「参考资料」会自动带上本机的真实路径（样式目录、示例包 _template、当前样式包），AI
      能读文件就会直接照着写；<br />
      · 生成好后回到这里点「导入样式包」，选中那个目录即可（目录里必须有 skin.js）；<br />
      · 也可以手动放进「样式目录/&lt;样式id&gt;/」，回来点「重新扫描样式」。
    </div>
    ${mo({copyKey:"skin",importKind:"skin",importLabel:"导入样式包…"})}
    <div class="setting__hint">
      接口的唯一定义在 frontend/packages/player-skins/src/contract.js；样式目录里也有现成的 _template
      示例可以直接复制改名。
    </div>`,{root:n}=ne({title:"用 AI 创建播放界面样式",body:e,okText:"知道了",cancelText:"关闭",onOk:()=>!0});go(n,t)}function iu(t={}){const e=p` <div class="setting__hint setting__hint--steps">
      · 点「复制提示词」把它粘贴给
      AI：提示词里只有文件格式、令牌清单与校验规则，不含任何配色建议，风格请在末尾那条「风格要求」里自己补一句，它会产出一个主题
      CSS；<br />
      · 提示词里的「参考资料」会自动带上本机的真实路径（主题目录、当前主题文件、目录里已有的主题 CSS），AI
      能读文件就会直接照着写；<br />
      · 生成好后回到这里点「导入主题」，选中放着那个 CSS 的文件夹即可；<br />
      · 也可以手动放进主题文件夹（上面有「打开主题文件夹」按钮），回来点「重新扫描主题」。
    </div>
    ${mo({copyKey:"theme",importKind:"theme",importLabel:"导入主题…"})}
    <div class="setting__hint setting__hint--steps">
      主题只声明颜色，不需要写组件样式，因此换主题不会破坏布局：<br />
      · 选择器写 <b>:root[data-theme="你的文件名"]</b>，与文件名一致最省事；<br />
      · 只改你想要的颜色，其余保持默认即可；<br />
      · 没写到的颜色会自动沿用默认主题，缺失也不会弄坏布局。
    </div>`,{root:n}=ne({title:"添加自定义主题",body:e,okText:"知道了",cancelText:"关闭",onOk:()=>!0});go(n,t)}async function ru(t,e,n){if(!$()){u("浏览器预览模式下不能移除，请手动删除主题文件",{tone:"warning",duration:3600});return}const a=u("正在移除主题…",{duration:0});try{const s=await Tl(t);if(a.close(),!s.removed){u(`没有移除「${e}」`,{tone:"warning"});return}await Pe(i.config),n.commit?.(),n.render?.(),u(`已移除主题「${e}」`,{tone:"success"})}catch(s){a.close(),u(`移除失败：${s?.message??s}`,{tone:"error",duration:6e3})}}function ou(t,e){const n=t.dataset.id,a=t.dataset.name||n;ne({title:`移除主题「${a}」？`,desc:"会删除这个主题对应的样式文件。内置主题不能移除。",okText:"移除",danger:!0,onOk:async()=>(await ru(n,a,e),!0)})}async function lu(t,e,n){if(!$()){u("浏览器预览模式下不能移除，请手动删除样式目录",{tone:"warning",duration:3600});return}const a=u("正在移除样式…",{duration:0});try{const s=await pd(t);if(a.close(),!s.removed){u(`没有移除「${e}」`,{tone:"warning"});return}n.commit?.(),n.render?.(),u(`已移除样式「${e}」`,{tone:"success"})}catch(s){a.close(),u(`移除失败：${s?.message??s}`,{tone:"error",duration:6e3})}}function cu(t,e){const n=t.dataset.id,a=t.dataset.name||n;ne({title:`移除样式「${a}」？`,desc:"会把样式目录里对应的整个文件夹删掉（里面只有这个样式的文件，不含歌曲）。",okText:"移除",danger:!0,onOk:async()=>(await lu(n,a,e),!0)})}async function ma(t,e={}){const n=t.dataset.act,a=t.dataset.id;switch(n){case"about-open-url":{const s=String(t.dataset.url||"").trim();if(!s)return;if(!$()){try{await navigator.clipboard.writeText(s),u("预览模式没有系统浏览器：链接已复制",{duration:2600})}catch{u(s,{duration:5200})}return}try{await m.openExternalUrl(s)}catch(r){u(`打开链接失败：${r?.message??r}`,{tone:"error",duration:5e3})}return}case"reset-desktop-lyrics-pos":{if(!$()){u("浏览器预览模式下没有独立歌词窗口",{duration:2200});return}try{const s=await m.desktopLyricsResetPos();s&&s.applied===!1?u("已清掉位置记忆；下次打开桌面歌词会用默认位置",{tone:"success",duration:2600}):u("桌面歌词已移回默认位置",{tone:"success",duration:2e3})}catch(s){u(`重置失败：${s?.message??s}`,{tone:"error",duration:5e3})}return}case"ai-field":{const s=t.dataset.key;if(!s)return;const r=t.value;if(s==="aiApiKey"&&r===(i.config?.aiApiKey??""))return;i.config[s]=r,e.commit?.();return}case"add-folder":{if($()){let r=null;try{r=await m.addFolder("")}catch(o){u(`系统目录选择器不可用：${o?.message??o}`,{tone:"warning",duration:5e3}),r=null}if(r===null){const o=await Ji({manual:!0});if(!o)return;try{r=await m.addFolder(o)}catch(l){u(`添加失败：${l?.message??l}`,{tone:"error",duration:6e3});return}}if(r?.cancelled)return;if(r?.duplicated){u(`该文件夹已在曲库中：${r.path}`,{tone:"warning"});return}r?.folder?(i.folders=[...i.folders.filter(o=>o.id!==r.folder.id),r.folder],e.commit?.(),u(`已添加并开始扫描：${r.folder.path}`,{tone:"success"})):u("添加文件夹失败，请重试",{tone:"error",duration:6e3});return}const s=await Ji();if(!s)return;i.folders.push({id:An("folder"),path:s,trackCount:0,status:"ok",watching:i.config.watchFolders,addedAt:Date.now()}),e.commit?.(),u(`已添加文件夹：${s}`,{tone:"success"}),e.rescan?.();break}case"remove-folder":{const s=i.folders.find(r=>r.id===a);if(!s)return;ne({title:"移除音乐文件夹？",desc:`${s.path}
仅从曲库中移除，不会删除任何本地文件。`,okText:"移除",danger:!0,onOk:async()=>($()&&await m.removeFolder(a),i.folders=i.folders.filter(r=>r.id!==a),e.commit?.(),u("已移除文件夹"),e.rescan?.({manual:!1}),!0)});break}case"scan-now":e.rescan?.({manual:!0});break;case"rescan-folder":u("正在重新扫描该文件夹…"),e.rescan?.({manual:!0});break;case"rule-add":i.filterRules.push({id:An("rule"),type:"regex",op:"match",value:"",scope:"exclude",enabled:!0}),e.commit?.();break;case"rule-del":i.filterRules=i.filterRules.filter(s=>s.id!==a),e.commit?.(),e.refreshRules?.();break;case"rule-toggle":{const s=i.filterRules.find(r=>r.id===a);s&&(s.enabled=!s.enabled),e.commit?.(),e.refreshRules?.();break}case"rule-scope":{const s=i.filterRules.find(r=>r.id===a);s&&(s.scope=t.dataset.scope),e.commit?.(),e.refreshRules?.();break}case"preset-small":i.filterRules.push({id:An("rule"),type:"size",op:"lt",value:"10240",unit:"B",scope:"exclude",enabled:!0}),e.commit?.(),e.refreshRules?.(),u("已添加：排除小于 10KB 的文件",{tone:"success"});break;case"preset-mp4":i.filterRules.push({id:An("rule"),type:"regex",op:"match",value:"\\.mp4$",scope:"exclude",enabled:!0}),e.commit?.(),e.refreshRules?.(),u("已添加：排除 .mp4 文件",{tone:"success"});break;case"theme-pick":{const r=ba().find(o=>o.id===a);if(!r)return;i.config.theme=r.id,i.config.themeMode=r.mode,await Pe(i.config),e.commit?.(),e.render?.(),u(`已切换到主题「${r.name}」`,{tone:"success",duration:1600});break}case"open-theme-dir":{if(!$()){u("主题目录：frontend/src/styles/themes/",{duration:3200});break}try{const s=await m.themeDir();await m.revealThemeDir(),u(s?`已打开主题目录：${s}`:"已打开主题目录",{duration:3200})}catch(s){u(`打开主题目录失败：${s?.message??s}`,{tone:"error",duration:5e3})}break}case"theme-help":iu(e);break;case"theme-remove":ou(t,e);break;case"reload-themes":if($()){const s=await m.reloadThemes();await ya(),await Pe(i.config),e.commit?.(),u(`已重新扫描到 ${s?.length??0} 个主题`,{tone:"success"})}else u("浏览器预览模式下仅内置主题可用",{tone:"warning"});break;case"skin-pick":{const s=ha().find(r=>r.id===a);if(!s)return;_n(s.id),e.commit?.(),e.render?.(),u(`播放界面已切换到「${s.name}」`,{tone:"success",duration:1600});break}case"open-skin-dir":{if(!$()){u("样式目录：frontend/packages/player-skins/",{duration:3200});break}try{const s=await m.skinDir();await m.revealSkinDir(),u(s?`已打开样式目录：${s}`:"已打开样式目录",{duration:3200})}catch(s){u(`打开样式目录失败：${s?.message??s}`,{tone:"error",duration:5e3})}break}case"reload-skins":try{$()&&await m.reloadSkins(),await ii(),_n(i.pvMode||i.config.playerViewMode||""),e.render?.();const s=ha().length,r=ao();u(r.length?`已扫描到 ${s} 个样式，${r.length} 个加载失败`:`已扫描到 ${s} 个样式`,{tone:r.length?"warning":"success"})}catch(s){u(`重新扫描失败：${s?.message??s}`,{tone:"error"})}break;case"skin-help":su(e);break;case"skin-remove":cu(t,e);break;case"ai-vendor":{const s=String(t.value||"auto");if(s===(i.config.aiVendor||"auto"))break;i.config.aiVendor=s,e.commit?.(),e.render?.();const r=jr(s);u(`模型类型已设为「${Lc(s)}」${r?"："+r:""}`,{duration:3600});break}case"backdrop-mode":{const s=Vr.includes(t.value)?t.value:"off";if(s===(i.config.nativeBackdrop||"off"))break;i.config.nativeBackdrop=s,e.commit?.(),e.render?.(),u(s==="off"?"已关闭窗口原生材质，重启应用后生效":`已选择「${Qn(s)}」，重启应用后生效`,{tone:"success",duration:3200});break}case"backdrop-restart":{if(!$()){u("浏览器预览无法重启应用",{tone:"warning"});break}u("正在重启应用…",{duration:2e3});try{await m.restartApp()}catch(s){u(`重启失败：${s?.message??s}`,{tone:"error",duration:6e3})}break}case"loudness-refresh":{if(!$())return;await ka();const s=await un();e.commit?.(),u(`已重新获取响度数据（已测量 ${s?.measured??0} 首）`,{tone:"success"});break}case"loudness-clear":{if(!$())return;ne({title:"清除响度测量数据？",desc:"只会删除测量缓存，不会动你的音乐文件。清除后再次启用响度均衡会重新测量。",okText:"清除",danger:!0,onOk:async()=>(await m.loudnessClear(),i.loudnessGains={},await un(),e.commit?.(),e.render?.(),u("已清除响度测量数据",{tone:"success"}),!0)});break}case"loudness-target":{const s=Number(t.value),r=i.config.loudnessTarget;if(s===r)break;i.config.loudnessTarget=s,e.commit?.(),await Kc(),await un(),e.render?.(),u("目标响度已切换，响度数据将重新计算",{tone:"success",duration:3200});break}case"download-dir-pick":{if(!$()){u("浏览器预览无法调用系统目录选择器",{tone:"warning"});break}try{const s=await m.downloadPickDir();if(s?.cancelled)break;await Xi(s,e)}catch(s){u(`无法更改下载位置：${s?.message??s}`,{tone:"error",duration:6e3})}break}case"download-dir-open":{if(!$())break;try{await m.downloadOpenDir(i.config.downloadDir||"")}catch(s){u(`打开失败：${s?.message??s}`,{tone:"error",duration:5e3})}break}case"download-dir-reset":{if(!$())break;try{const s=await m.downloadSetDir("");if(s?.cancelled)break;const r=s?.next?s:await m.downloadSetDir("");await Xi(r,e)}catch(s){u(`恢复默认失败：${s?.message??s}`,{tone:"error",duration:6e3})}break}case"cache-open-covers":case"cache-open-lyrics":{if(!$())break;try{await m.coverOpenCacheDir(n==="cache-open-covers"?"covers":"lyrics")}catch(s){u(`打开缓存目录失败：${s?.message??s}`,{tone:"error",duration:5e3})}break}case"cover-refresh":{if(!$())break;try{const s=await m.coverClearCache();i.coverCache=await m.coverCacheStats(),await bo(),e.commit?.(),e.render?.(),u(`已清空缓存（封面 ${s?.covers??0} 张、歌词 ${s?.lyrics??0} 份）`,{tone:"success"})}catch(s){u(`清空失败：${s?.message??s}`,{tone:"error",duration:5e3})}break}case"embed-cache-write":await vo({ctx:e,force:!0});break}}async function vo({ctx:t={},force:e=!1}={}){if(!$()){e&&u("写入歌曲文件需要后端支持，浏览器预览不可用",{tone:"warning"});return}for(let s=0;s<20&&!i.coverCache;s++)await new Promise(r=>setTimeout(r,100));if(!i.coverCache&&e)try{i.coverCache=await m.coverCacheStats()}catch{}if(ho()===0){e?u(i.coverCache?"缓存里还没有封面或歌词，暂时没有可写入的内容":"暂时读不到缓存统计，请稍后再试",{duration:3400}):i.coverCache&&u("已开启：以后下载 / 更换封面时会把封面与歌词写进歌曲文件",{duration:3600});return}const n=Number(i.coverCache?.covers)||0,a=Number(i.coverCache?.lyrics)||0;ne({title:"要把已有的缓存写进歌曲文件吗？",body:p` <div class="setting__hint">
        缓存目录里已经有 <b>${D(n)}</b> 张封面、<b>${D(a)}</b> 份歌词。
        它们现在只放在缓存目录里；写进歌曲文件之后，把文件拷到别的播放器上也能看到。
      </div>
      <div class="setting__hint">
        写入只会在原文件的标签里做最小插入 / 替换（m4a 的 covr 与 ©lyr、FLAC 的 PICTURE 与 LYRICS），
        不动音频数据；mp3、wav、ogg 等格式会被跳过。这一步无法撤销，但不会影响播放。
      </div>`,okText:"写入文件",cancelText:"暂不写入",onOk:async()=>(await du(t),!0)})}async function du(t={}){const e=u("正在把缓存写入歌曲文件…",{duration:0}),n=K("meta:embed-progress",a=>{const s=Number(a?.done)||0,r=Number(a?.total)||0,o=a?.title?" · "+a.title:"";e.update(r?"正在写入歌曲文件 "+s+"/"+r+o:"正在把缓存写入歌曲文件…")});try{const a=await m.coverWriteCacheToFiles(),s=Number(a?.written)||0,r=Number(a?.skipped)||0,o=Number(a?.failed)||0,l=Number(a?.total)||0;if(e.close(),!l){u("缓存里还没有封面或歌词，暂时没有可写入的内容",{duration:3200});return}let c=`已写入 ${D(s)} 首`;a?.covers&&(c+=`（封面 ${D(a.covers)}）`),a?.lyrics&&(c+=`（歌词 ${D(a.lyrics)}）`),r&&(c+=`，跳过 ${D(r)} 首`),o&&(c+=`，失败 ${D(o)} 首`),u(c,{tone:o?"warning":r?"info":"success",duration:5200});const d=Array.isArray(a?.reasons)?a.reasons:[];d.length&&ne({title:o?"部分歌曲没能写入":"部分歌曲已跳过",body:p`<div class="setting__hint setting__hint--steps">
          ${d.map((g,h)=>p`${h?p`<br />`:F}${g}`)}
        </div>`,okText:"知道了",cancelText:"关闭",onOk:()=>!0}),i.coverCache=await m.coverCacheStats(),t.commit?.(),t.render?.()}catch(a){e.close(),u(`写入失败：${a?.message??a}`,{tone:"error",duration:6e3})}finally{n()}}async function Xi(t,e){if(!t||t.cancelled)return;const n=t.next;if(!n)return;if(t.same){u("这已经是当前的下载目录",{duration:2200});return}const a=Number(t.count)||0,s=((Number(t.bytes)||0)/1024/1024).toFixed(1),r=Number(t.nextCount)||0;if(a===0){await is(n,!1,e);return}const o=p` <div class="setting__hint">
      当前下载目录里有 <b>${D(a)}</b> 首歌曲（约 ${s} MB）。 要一并搬到新目录吗？
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
    ${r?p`<div class="setting__hint">新目录里已经有 ${D(r)} 首歌曲，同名的不会被覆盖。</div>`:F}
    <div class="setting__hint">不迁移的话，旧目录里的歌曲会留在原地；新目录会成为新的默认保存位置。</div>`;ne({title:"更改下载位置",body:o,okText:"迁移并更改",cancelText:"不迁移，只更改位置",onOk:async()=>(await is(n,!0,e),!0),onCancel:async()=>{await is(n,!1,e)}})}async function is(t,e,n){try{const a=await m.downloadApplyDir(t,e);if(a?.dir&&(i.config.downloadDir=a.dir),n.commit?.(),n.render?.(),!e){u(`下载位置已改为：${a?.dir||t}`,{tone:"success",duration:3200});return}const s=Number(a?.migrated)||0,r=Number(a?.skipped)||0,o=Array.isArray(a?.failed)?a.failed:[];let l=`已迁移 ${D(s)} 首`;r&&(l+=`，跳过 ${D(r)} 首（新目录已有同名文件）`),o.length&&(l+=`，${D(o.length)} 首失败`),u(`${l}；新位置：${a?.dir||t}`,{tone:o.length?"warning":"success",duration:4200})}catch(a){u(`更改下载位置失败：${a?.message??a}`,{tone:"error",duration:6e3})}}async function bo(){if(!$())return i.coverProviders=[],i.coverBreaker={},null;try{const t=await m.coverProviders();return i.coverProviders=Array.isArray(t?.providers)?t.providers:[],i.coverBreaker=t?.breaker&&typeof t.breaker=="object"?t.breaker:{},t}catch{return i.coverProviders=[],i.coverBreaker={},null}}let Qi=!1;function uu(){if(Qi)return;Qi=!0;const t=$()?m.coverCacheStats().then(e=>(i.coverCache=e,e)).catch(()=>null):Promise.resolve(null);Promise.all([bo(),t]).then(()=>{ve()})}function Ji({manual:t=!1}={}){return new Promise(e=>{ne({title:"添加音乐文件夹",desc:t?"系统目录选择器没能打开，请直接粘贴文件夹完整路径。":"浏览器预览模式下无法调用系统目录选择器，请手动输入路径。",body:p`<input class="input" data-field="path" type="text" placeholder="D:\\Music" />`,okText:"添加",onOk:n=>{const a=String(n.path||"").trim();return a?(e(a),!0):"请输入路径"}})})}function pu(t,e={}){const n=t.dataset.toggle;if(n){const s=t.getAttribute("aria-checked")!=="true";return n==="showDesktopLyrics"||n==="showDesktopWallpaper"?(fo(n==="showDesktopLyrics"?s?"lyrics":"off":s?"wallpaper":"off").then(o=>{o.ok===!1&&u(`打不开：${o.reason||o.error||"未知原因"}`,{tone:"warning",duration:3200}),e.commit?.()}),e.commit?.(),!0):(t.setAttribute("aria-checked",String(s)),n in i.config&&(i.config[n]=s,n==="animations"&&dt("--dur",hs(i.config)),n==="minimizeToTray"&&$()&&m.minimizeToTray(s).catch(r=>{console.warn("[settings] 同步托盘开关失败",r)}),n==="watchFolders"&&(i.folders.forEach(r=>r.watching=s),$()&&m.setWatchers(s).catch(r=>{console.warn("[settings] 切换实时监听失败",r)}))),e.commit?.(),n==="embedMeta"&&s&&vo(),!0)}const a=t.closest("[data-segment]")?.dataset.segment;if(a){const s=t.dataset.value;if(t.parentElement.querySelectorAll(".segmented__btn").forEach(r=>{r.setAttribute("aria-pressed",String(r===t))}),a==="themeMode"){i.config.themeMode=s;const r=ba(),o=window.matchMedia("(prefers-color-scheme: dark)").matches,l=s==="system"?o?"dark":"light":s,c=r.find(d=>d.mode===l&&d.id!=="cover-dark")||r[0];i.config.theme=c.id,Pe(i.config)}else if(a in i.config){const r=["lyricsLines","scanConcurrency"];i.config[a]=r.includes(a)?Number(s):s,a==="lyricsLines"&&dt("--lyric-pad",`${50-Number(s)*4}%`),a==="animationsSpeed"&&dt("--dur",hs(i.config)),a==="loudnessMode"&&ka(),a==="windowCorners"&&$()&&m.setWindowCorners(s).catch(o=>{console.warn("[settings] 设置窗口圆角失败",o)})}return e.commit?.(),!0}return!1}function fu(t,{silent:e=!1}={}){const n=t?.dataset?.id;if(!n)return;const a=i.config.rowClickAction||"next";if(a==="play"){gs(n);return}if(a==="play-list"){const s=i.visibleSongs.map(r=>r.id);ft(s,Number(t.dataset.index),gn());return}gr(n),e||u("已设为下一首播放",{tone:"success",duration:1500})}const rs=[{id:"album",label:"专辑",icon:"album",isOn:()=>i.config.showAlbumColumn!==!1,set:t=>{i.config.showAlbumColumn=t}}];function hu(t,e){const n=[{kind:"label",label:"显示的列"}];for(const a of rs)n.push({id:`col-${a.id}`,label:a.label,icon:a.icon,checked:a.isOn()});n.push({kind:"sep"}),n.push({id:"col-reset",label:"恢复默认列",icon:"refresh"}),hn({x:t,y:e,items:n,onPick:a=>{if(a==="col-reset"){for(const o of rs)o.set(!0);x(),u("已恢复默认列",{duration:1400});return}const s=rs.find(o=>`col-${o.id}`===a);if(!s)return;const r=!s.isOn();s.set(r),x(),u(r?`已显示「${s.label}」列`:`已隐藏「${s.label}」列`,{duration:1400})}})}function Zi(t,e,n=null){const a=Ze(e);if(!a)return;const s=!!a.online,r=Ot(e),o=i.queue.includes(e),l=[{id:"play",label:"播放",icon:"play"},{id:"play-next",label:"下一首播放",icon:"arrow-right"},{id:"sep1",kind:"sep"},{id:"queue-add",label:o?"从播放列表移除":"加入播放列表",icon:"queue"},{id:"like",label:r?"取消喜欢":"加入我喜欢",icon:"heart"},{id:"add-to",label:"加入歌单…",icon:"plus"}];if(s||l.push({id:"cover",label:"更换封面…",icon:"image"}),i.view==="queue")l.push({id:"sep2",kind:"sep"}),l.push({id:"remove-here",label:"从播放列表移除",icon:"trash",danger:!0});else if(i.view==="playlist"&&i.playlistId){const d=ze(i.playlistId);d&&!d.locked&&(l.push({id:"sep2",kind:"sep"}),l.push({id:"remove-here",label:`从「${d.name}」移除`,icon:"trash",danger:!0}))}s||(l.push({id:"sep3",kind:"sep"}),l.push({id:"reveal",label:"在文件夹中显示",icon:"folder"}));const c=d=>{switch(d){case"play":{const g=i.visibleSongs.map(y=>y.id),h=g.indexOf(e);h<0?ft([e],0,{type:"online",id:null}):ft(g,h,gn());break}case"cover":ht(()=>Promise.resolve().then(()=>di),void 0).then(g=>g.openCoverPanel(e));break;case"play-next":gr(e),u("已设为下一首播放",{tone:"success",duration:1500});break;case"queue-add":o?(vs(e),u("已从播放列表移除")):(tl([e]),u("已加入播放列表",{tone:"success",duration:1500}));break;case"like":va(e),u(r?"已从「我喜欢」移除":"已加入「我喜欢」",{tone:r?"info":"success",duration:1500});break;case"add-to":mu(e);break;case"remove-here":i.view==="queue"?(vs(e),u("已从播放列表移除")):i.playlistId&&(vr(i.playlistId,[e]),u("已从歌单移除"));break;case"reveal":ht(()=>import("./bridge-CJipA69-.js").then(g=>g.r),[]).then(async g=>{try{await g.backend.revealInExplorer(a.path),u("已在文件夹中显示",{duration:1800})}catch(h){u(`无法在文件夹中显示：${h?.message??h}`,{tone:"error",duration:4e3})}});break}};if(n)hn({x:n.x,y:n.y,items:l,onPick:c});else{const d=t.getBoundingClientRect();hn({x:d.left,y:d.bottom+6,items:l,onPick:c,align:"right"})}}function mu(t){const e=i.playlists,{root:n}=ne({title:"加入歌单",body:p`
      <div class="setting__hint">点击歌单即可把这首歌加进去。</div>
      <div class="u-row u-wrap">
        ${e.map(a=>p` <button class="btn btn--sm" type="button" data-pl=${a.id}>
              <svg aria-hidden="true"><use href="#i-${a.id===Un?"heart":"playlist"}"></use></svg>
              <span>${a.name}</span>
            </button>`)}
      </div>
    `,okText:"完成",cancelText:"关闭",onOk:()=>!0});n.addEventListener("click",a=>{const s=a.target.closest("[data-pl]");s&&la(s.dataset.pl,[t])})}const gu=1500;function vu(t){t&&(t.classList.remove("is-located"),t.offsetWidth,t.classList.add("is-located"),window.setTimeout(()=>t.classList.remove("is-located"),gu))}function yo(t){if(t){try{t.scrollIntoView({block:"nearest",inline:"nearest"})}catch{bu(t)}vu(t)}}function bu(t){const e=t.closest(".content-body, .queue-panel__body");if(!e)return;const n=t.getBoundingClientRect(),a=e.getBoundingClientRect(),s=e.classList.contains("content-body")?50:8,r=a.top+s;n.top<r?e.scrollTop-=r-n.top:n.bottom>a.bottom&&(e.scrollTop+=n.bottom-a.bottom)}function yu(t){const e=i.currentId;if(!e)return null;const n=t.querySelector(`.track[data-id="${CSS.escape(e)}"]`);return n?{el:n}:null}function _u(){const t=i.currentId;return t&&document.querySelector("#queue-panel-body")?.querySelector(`.queue-item[data-queue-id="${CSS.escape(t)}"]`)||null}function wu({notify:t=!0}={}){if(!i.currentId)return t&&u("当前没有正在播放的歌曲",{tone:"info",duration:1600}),!1;const e=document.getElementById("content-body"),n=e?yu(e):null;return n?(yo(n.el),!0):(t&&u("当前播放的歌曲不在这个列表里",{tone:"info",duration:2200}),!1)}function _o({notify:t=!0}={}){if(!i.queue.length)return t&&u("播放列表是空的",{tone:"info",duration:1600}),!1;const e=_u();return e?(yo(e),!0):(t&&u("当前播放的歌曲不在播放列表里",{tone:"info",duration:2200}),!1)}let wo=0;function $o(){wo=Date.now()}function ko(){return Date.now()-wo<260}function $u(t=!1){const e=i.visibleSongs.map(n=>n.id);if(e.length){if(t)for(let n=e.length-1;n>0;n-=1){const a=Math.floor(Math.random()*(n+1));[e[n],e[a]]=[e[a],e[n]]}ft(e,0,gn()),u(t?"已随机播放":`开始播放 ${D(e.length)} 首`,{duration:1600})}}const ku={library:"本地歌曲",queue:"播放列表",playlist:"歌单"},er={commit:x,rescan:()=>bn({manual:!0})};class Su extends be{static deps=e=>[e.view,e.playlistId,e.playlistVersion,e.query,e.visibleVersion,e.visibleSongs.length,e.sortKey,e.sortDir,e.songs.length,e.folders.length,e.scanning,e.playlistSelecting,e.selectedIds,e.lastScan?.at??0,e.config.listDensity];render(){const e=i.view,n=e==="playlist"?ze(i.playlistId):null;return p`
      <main class="main" id="main">
        <div
          class="content-header"
          id="content-header"
          @click=${a=>this.onHeaderClick(a)}
          @change=${a=>this.onHeaderChange(a)}
        >
          <div class="content-header__titles">
            <h1 class="content-header__title" id="content-title">
              ${e==="playlist"&&n?n.name:ku[e]||"本地歌曲"}
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
                  @input=${a=>{i.query=a.target.value,x()}}
                  @keydown=${a=>{a.key==="Escape"&&(a.preventDefault(),La(),a.target.blur())}}
                />
                <button
                  class="content-filter__clear"
                  id="content-filter-clear"
                  type="button"
                  aria-label="清空筛选"
                  ?hidden=${i.query.length===0}
                  @click=${()=>{La(),this.querySelector("#content-filter-input")?.focus()}}
                >
                  ${f("close")}
                </button>
              </div>
              <span class="content-filter__count" id="content-filter-count">
                ${i.query.trim()?`匹配 ${D(i.visibleSongs.length)} 首`:""}
              </span>
            </div>
            <div class="content-header__tools" id="content-tools">${this.toolbar()}</div>
          </div>
        </div>
        <div class="content-body" id="content-body">${this.body()}</div>
      </main>
    `}subtitle(e,n){const a=i.visibleSongs,s=a.reduce((r,o)=>r+o.duration,0);if(e==="library"){const r=i.lastScan;return`${D(a.length)} 首 · 共 ${Da(s)} · ${D(i.folders.filter(o=>o.id!=="auto_downloads").length)} 个文件夹${r&&r.excluded?` · 已过滤 ${D(r.excluded)} 个文件`:""}`}if(e==="queue"){const r=i.currentId?a.findIndex(o=>o.id===i.currentId):-1;return`${D(a.length)} 首 · 共 ${Da(s)}${r>=0?` · 正在播放第 ${r+1} 首`:""}`}return e==="playlist"&&n?`${D(n.songIds.length)} 首 · 共 ${Da(s)} · ${n.locked?"默认歌单（不可删除）":"自定义歌单"}`:e==="playlist"?"歌单不存在":""}toolbar(){const e=i.view,n=p`<button class="btn btn--primary" type="button" data-tool="play-all">
      ${f("play")}<span>播放全部</span>
    </button>`,a=p`<button
      class="btn btn--icon"
      type="button"
      data-tool="locate"
      data-tip="定位到当前播放"
      aria-label="定位到当前播放"
    >
      ${f("disc")}
    </button>`,s=p`
      <div class="select">
        <select class="select__field" id="select-sort" aria-label="排序方式">
          ${[["addedAt","添加时间"],["title","标题"],["artist","歌手"],["album","专辑"],["duration","时长"],["size","文件大小"],["playCount","播放次数"]].map(([r,o])=>p`<option value=${r} ?selected=${i.sortKey===r}>${o}</option>`)}
        </select>
        ${f("chevron-down","select__icon")}
      </div>
    `;if(e==="queue")return p`
        <button class="btn" type="button" data-tool="queue-clear">${f("trash")}<span>清空列表</span></button>
        ${n}${a}
      `;if(e==="playlist"){if(i.playlistSelecting){const r=i.selectedIds.size,o=i.visibleSongs.length>0&&i.visibleSongs.every(l=>i.selectedIds.has(l.id));return p`
          <span class="toolbar__selinfo">已选 ${D(r)} 首</span>
          <button class="btn btn--sm" type="button" data-tool="sel-all">
            ${f("check")}<span>${o?"取消全选":"全选"}</span>
          </button>
          <button class="btn btn--sm btn--danger" type="button" data-tool="sel-remove" ?disabled=${!r}>
            ${f("trash")}<span>移除所选</span>
          </button>
          <button class="btn btn--sm btn--primary" type="button" data-tool="pl-select">
            ${f("close")}<span>完成</span>
          </button>
        `}return p`
        ${s}${n}
        <button class="btn" type="button" data-tool="pl-select">${f("check")}<span>多选</span></button>
        <button class="btn" type="button" data-tool="pl-add">${f("plus")}<span>添加</span></button>
        ${a}
        <button class="btn btn--icon" type="button" data-tool="pl-more" data-tip="歌单操作">${f("more")}</button>
      `}return p`
      <button class="btn" type="button" data-tool="rescan">${f("refresh")}<span>重新扫描</span></button>
      ${s}${n}${a}
    `}body(){const e=i.view;if(!i.visibleSongs.length){const n=i.query.trim()?"search":e==="library"?"library":e==="queue"?"queue":"playlist";return this.empty(n)}return Oc(`${e}|${i.playlistId??""}`,p`<div class="page"><mp-track-table></mp-track-table></div>`)}empty(e){const n={library:{icon:"music",title:"曲库还没有歌曲",desc:"在设置里添加本地音乐文件夹，程序会自动扫描并监听这些文件夹的变化。",ok:"添加音乐文件夹",act:"add-folder"},queue:{icon:"queue",title:"播放列表是空的",desc:"从「本地歌曲」或任意歌单里选择歌曲加入播放列表。",ok:"去本地歌曲",act:"goto-library"},playlist:{icon:"playlist",title:"这个歌单还没有歌曲",desc:"在「本地歌曲」里点击每首歌后面的爱心或更多菜单，把歌曲加进来。",ok:"去本地歌曲",act:"goto-library"},search:{icon:"search",title:"没有找到匹配的歌曲",desc:"换个关键词试试，或清空搜索框。",ok:"清空搜索",act:"clear-search"}},a=n[e]||n.library;return p`
      <div class="empty" data-empty=${e}>
        <svg class="empty__art" aria-hidden="true"><use href="#i-${a.icon}"></use></svg>
        <div class="empty__title">${a.title}</div>
        ${a.desc?p`<div class="empty__desc">${a.desc}</div>`:F}
        ${a.ok?p`<div class="empty__actions">
                <button class="btn btn--primary" type="button" data-empty-act=${a.act}>${a.ok}</button>
              </div>`:F}
      </div>
    `}async onHeaderClick(e){const n=e.target.closest("[data-empty-act]")?.dataset.emptyAct;if(n){n==="add-folder"?await ma({dataset:{act:"add-folder"}},er):n==="goto-library"?Tt("library"):n==="clear-search"&&La();return}const a=e.target.closest("[data-tool]")?.dataset.tool;a&&await this.handleTool(a)}onHeaderChange(e){e.target.id==="select-sort"&&(i.sortKey=e.target.value,x())}async handleTool(e){switch(e){case"rescan":bn({manual:!0});break;case"add-folder":await ma({dataset:{act:"add-folder"}},er);break;case"play-all":$u(!1);break;case"locate":wu();break;case"queue-clear":br(),u("播放列表已清空");break;case"pl-select":fi(!i.playlistSelecting);break;case"pl-add":i.playlistId&&Ac(i.playlistId);break;case"sel-all":{const n=i.visibleSongs.length>0&&i.visibleSongs.every(a=>i.selectedIds.has(a.id));nl(n?[]:i.visibleSongs.map(a=>a.id));break}case"sel-remove":{const n=[...i.selectedIds];if(!n.length)break;const a=ze(i.playlistId),s=vr(i.playlistId,n);fi(!1),u(`已从「${a?.name??"歌单"}」移除 ${D(s)} 首`,{tone:"success"});break}case"pl-more":Ds(i.playlistId,this.querySelector('#content-header [data-tool="pl-more"]'));break}}}ae("mp-content",Su);const xu=Gs(class extends Ks{render(){return _t}update(t,[e]){const n=t.element;if(!n)return _t;sl(n);const a=e||ga;if(n.getAttribute("src")===a)return _t;if(a.startsWith("data:"))return n.src=a,_t;n.__coverWant=a;const s=new Image;s.decoding="async";const r=()=>{n.__coverWant===a&&(n.src=a)};return s.addEventListener("load",r),s.addEventListener("error",r),s.src=a,_t}}),ci=t=>xu(t);class Cu extends be{static deps=e=>[e.view,e.playlistId,e.visibleVersion,e.sortKey,e.sortDir,e.config.listDensity,e.config.showAlbumColumn,e.playlistSelecting,e.selectedIds,e.currentId,e.playing,e.likedIds,kn(),e.visibleSongs.length];get mode(){return i.view==="queue"?"playlist":"library"}get selecting(){return i.view==="playlist"&&i.playlistSelecting}updated(){i.view==="queue"?this.bindQueueSort():this._sortable&&(this._sortable.destroy(),this._sortable=null)}disconnectedCallback(){this._sortable?.destroy(),this._sortable=null,super.disconnectedCallback()}bindQueueSort(){const e=this.querySelector(".tracks__body");e&&(this._sortable&&this._sortable.el===e||(this._sortable?.destroy(),this._sortable=C.create(e,{handle:"[data-handle]",draggable:".track",animation:0,ghostClass:"is-dragging",chosenClass:"is-dragging",onEnd:n=>{$o();const a=n.oldIndex,s=n.newIndex;if(a==null||s==null||a===s)return;const r=n.from,o=Array.from(r.children).filter(l=>l!==n.item);r.insertBefore(n.item,o[a]??null),yr(a,s),u("已调整播放顺序 · 播放模式已切回列表循环",{duration:1800})}})))}render(){const e=this.mode,n=i.visibleSongs;return p`
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
          ${Me(n,a=>a.id,(a,s)=>this.rowTemplate(a,s,e))}
        </div>
      </div>
    `}headTemplate(e){const n=e!=="playlist",a=(s,r,o="")=>{if(!n)return p`<div class="tracks__sort ${o}" data-static="1">${r}</div>`;const l=["tracks__sort",o,i.sortKey===s&&i.sortDir==="asc"?"is-asc":""].filter(Boolean).join(" ");return p`<button
        class=${l}
        type="button"
        data-sort=${s}
        data-dir=${i.sortKey===s?i.sortDir:F}
      >
        ${r}${f("chevron-down")}
      </button>`};return p`
      <div class="tracks__head" data-mode=${e}>
        <div class="col-handle"></div>
        <div class="col-index">#</div>
        <div class="col-cover"></div>
        ${a("title","标题")} ${a("album","专辑","col-album")} ${a("duration","时长")}
        <div class="col-heart" title="我喜欢">${f("heart")}</div>
        <div class="col-more"></div>
      </div>
    `}rowTemplate(e,n,a){const s=this.selecting,r=e.id===i.currentId,o=Ot(e.id),l=s&&i.selectedIds.has(e.id);return p`
      <div
        class="track"
        data-id=${e.id}
        data-index=${n}
        data-selectable=${s?"1":"0"}
        aria-selected=${String(l)}
        aria-current=${String(r)}
        data-playing=${r&&i.playing?"true":"false"}
      >
        ${a==="playlist"?p`<div class="track__handle" data-handle="1" title="拖动排序">${f("grip")}</div>`:p`<div class="col-handle"></div>`}
        <div class="track__index">${this.indexCell(e,n,s)}</div>
        <div class="track__cover">
          <img src=${ci(mt(e))} alt="" loading="lazy" draggable="false" />
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
        >
          ${f("heart")}
        </button>
        <button class="track__more" type="button" data-act="more" aria-label="更多操作" aria-expanded="false">
          ${f("more")}
        </button>
      </div>
    `}indexCell(e,n,a){if(a){const s=i.selectedIds.has(e.id);return p`<span class="track__check" role="checkbox" aria-checked=${String(s)}>${f("check")}</span>`}return p`
      <span class="track__num u-num">${n+1}</span>
      <div class="track__bars"><span></span><span></span><span></span><span></span></div>
      <button class="track__play" type="button" data-act="play" aria-label="播放 ${e.title}">
        ${f("play")}
      </button>
    `}onClick(e){if(ko())return;const n=e.target.closest(".track");if(n&&i.view==="playlist"&&i.playlistSelecting){e.preventDefault(),al(n.dataset.id);return}const a=e.target.closest("[data-sort]");if(a){const l=a.dataset.sort;i.sortKey===l?i.sortDir=i.sortDir==="asc"?"desc":"asc":(i.sortKey=l,i.sortDir=l==="addedAt"?"desc":"asc"),x();return}const s=e.target.closest("[data-act]");if(!s){const l=e.target.closest(".track");l&&fu(l,{silent:!1});return}const r=s.closest(".track"),o=r?.dataset.id;if(o)switch(s.dataset.act){case"play":{const l=i.visibleSongs.map(c=>c.id);ft(l,Number(r.dataset.index),gn());break}case"like":{va(o);const l=Ot(o);u(l?"已加入「我喜欢」":"已从「我喜欢」移除",{tone:l?"success":"info",duration:1500});break}case"more":Zi(s,o);break}}onDblClick(e){if(i.view==="playlist"&&i.playlistSelecting)return;const n=e.target.closest(".track");if(!n)return;const a=i.visibleSongs.map(s=>s.id);ft(a,Number(n.dataset.index),gn()),i.playerOpen=!0,i.pvMode=i.config.playerViewMode,x()}onContextMenu(e){if(e.target.closest(".tracks__head")){e.preventDefault(),hu(e.clientX,e.clientY);return}const a=e.target.closest(".track");a&&(e.preventDefault(),Zi(null,a.dataset.id,{x:e.clientX,y:e.clientY}))}}ae("mp-track-table",Cu);class Tu extends be{static deps=e=>[e.playerOpen,e.pvMode,e.currentId,e.playing,e.position,e.duration,e.config.showLyrics,e.config.coverCarousel,e.config.coverCarouselInterval,kn(),io()];updated(){kd()}render(){const e=Je(),a=this.coverList(e).length>1,s=i.config.coverCarousel===!0&&a,r=!e||!!e.online,o=ha();return p`
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
          <button class="playerview__back" id="btn-player-back" type="button" @click=${()=>Ea()}>
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
              aria-pressed=${String(s)}
              ?disabled=${!a}
              data-tip=${this.carouselTip(a,s)}
              aria-label="封面轮播"
              @click=${()=>this.toggleCarousel()}
            >
              ${f("slideshow")}
            </button>
          </div>
          <div class="viewmode" id="playerview-mode" role="group" aria-label="播放界面样式">
            ${Me(o,l=>l.id,l=>p`
                <button
                  class="viewmode__btn"
                  type="button"
                  data-pv-skin=${l.id}
                  data-pv-mode=${l.id}
                  aria-pressed=${String(i.pvMode===l.id)}
                  data-tip=${l.name||l.id}
                  aria-label=${l.name||l.id}
                  @click=${()=>_n(l.id)}
                >
                  ${f(l.icon||"disc")}
                </button>
              `)}
          </div>
        </div>
        <div
          class="playerview__stage"
          id="playerview-stage"
          @click=${l=>{l.target.closest(".disc__label, .disc__platter")&&$d()}}
        ></div>
      </section>
    `}coverList(e){if(!e)return[];const n=i.coverSets.get(e.id)?.items;return Array.isArray(n)?n.filter(a=>a?.preview):[]}carouselTip(e,n){if(!e)return"这首歌只有一张封面";const a=Number(i.config.coverCarouselInterval)||10;return n?"关闭封面轮播":`开启封面轮播（每 ${a} 秒换一张）`}openCoverPanel(e){!e||e.online||ht(()=>Promise.resolve().then(()=>di),void 0).then(n=>n.openCoverPanel(e.id))}toggleCarousel(){i.config.coverCarousel=!i.config.coverCarousel,x(),u(i.config.coverCarousel?`已开启封面轮播（每 ${Number(i.config.coverCarouselInterval)||10} 秒换一张）`:"已关闭封面轮播",{duration:1600})}}ae("mp-playerview",Tu);function pt(t,e={}){const n=e.min??0,a=e.max??1,s=e.step??.001;let r=Ve(e.value??n,n,a),o=!1;const l=t.querySelector(".slider__fill"),c=t.querySelector(".slider__buffer"),d=t.querySelector(".slider__thumb"),g=t.querySelector(".slider__bubble");function h(){const _=a===n?0:(r-n)/(a-n)*100;l&&(l.style.transform=`scaleX(${_/100})`),d&&(d.style.left=`${_}%`),g&&e.format&&(g.textContent=e.format(r)),t.setAttribute("aria-valuenow",String(Math.round(_)))}function y(_){const P=t.getBoundingClientRect();if(P.width<=0)return r;const z=Ve((_.clientX-P.left)/P.width,0,1),N=n+z*(a-n),re=Math.round(N/s)*s;return Ve(Number(re.toFixed(6)),n,a)}function S(_){if(!g)return;const P=t.getBoundingClientRect(),z=Ve(_.clientX-P.left,0,P.width);g.style.left=`${z}px`}t.addEventListener("pointerdown",_=>{t.dataset.disabled!=="true"&&(_.preventDefault(),o=!0,t.dataset.dragging="true",t.setPointerCapture?.(_.pointerId),r=y(_),h(),S(_),e.onChange?.(r))}),t.addEventListener("pointermove",_=>{S(_),o&&(r=y(_),h(),e.onChange?.(r))});const k=_=>{o&&(o=!1,t.dataset.dragging="false",t.releasePointerCapture?.(_.pointerId),e.onCommit?.(r))};return t.addEventListener("pointerup",k),t.addEventListener("pointercancel",k),t.addEventListener("keydown",_=>{if(t.dataset.disabled==="true")return;const P=(a-n)/10,z=s*10;let N=r;switch(_.key){case"ArrowRight":case"ArrowUp":N=r+z;break;case"ArrowLeft":case"ArrowDown":N=r-z;break;case"PageUp":N=r+P;break;case"PageDown":N=r-P;break;case"Home":N=n;break;case"End":N=a;break;default:return}_.preventDefault(),r=Ve(Number(N.toFixed(6)),n,a),h(),e.onChange?.(r),e.onCommit?.(r)}),h(),{get value(){return r},set(_,{silent:P=!1}={}){const z=Ve(_,n,a);z===r&&!P||(r=z,h(),P||e.onChange?.(r))},setDisabled(_){t.dataset.disabled=_?"true":"false"},setBuffer(_){c&&(c.style.transform=`scaleX(${Ve(_,0,100)/100})`)},text(_=r){return e.format?e.format(_):String(_)},paint:h}}const Eu={itunes:"iTunes",netease:"网易云音乐",qq:"QQ 音乐",deezer:"Deezer",musicbrainz:"MusicBrainz",kugou:"酷狗音乐",kuwo:"酷我音乐",migu:"咪咕音乐"};function Fs(t){const e=String(t||"").trim().toLowerCase();return Eu[e]||String(t||"")}function So(t,e=""){const n=Array.isArray(t)?t.filter(Boolean):[];return n.length?n.map(a=>Fs(a)).join(" / "):e}const Iu="../bindings/localmusicplayer/index.js";let qn=null;async function os(){if(qn)return qn;try{const t=await import(Iu);qn=t&&t.OnlineService?t.OnlineService:null}catch(t){console.info("[online] backend unavailable",t)}return qn}const Du=new Set(["m4a","mp4","m4b","alac","aac","flac"]);let V="online";const v={songId:"",title:"",lines:[],cursor:0,undo:[],dirty:!1,kept:0,stale:!1};class Au extends be{static deps=e=>[e.lyricsOpen,e.currentId,e.position,e.playing,V,xo,i.config.embedMeta];constructor(){super(),this._draftText="",this._pendingText=null,this._nowIndex=-1,this._onlineMessage="",this._candidates=[],this._searching=!1,this._onlineKeyword="",this._draftTimer=null,this._lastNowPaint=0,this._lastScrolledNow=-1,this._lastScrolledCursor=-1,this._followHold=0,this._followAutoUntil=0,this._lastOnlineHint="在线歌词来源"}onConnected(){this._onKeyDownCapture=e=>this.onPanelKeyDown(e),document.addEventListener("keydown",this._onKeyDownCapture,!0)}onDisconnected(){document.removeEventListener("keydown",this._onKeyDownCapture,!0),this._draftTimer&&clearTimeout(this._draftTimer)}get open(){return i.lyricsOpen===!0}get panelEl(){return this.querySelector("#lyrics-panel")}updated(){const e=this.panelEl;if(e){if(this.open&&e.hidden&&Bt(),e.hidden=!this.open,e.dataset.open=this.open?"true":"false",this._pendingText!==null){const n=this.querySelector("[data-editor-text]");n&&(n.value=this._pendingText),this._pendingText=null}this.open&&(V==="nudge"&&this.paintNudgeFollow(),V==="edit"&&this.paintEditorFollow())}}refreshAll(){this._refreshHeader(),pa().then(()=>{this._refreshHeader(),V==="online"&&this.refreshOnlineHint(),V==="edit"&&this.ensureDraft().then(()=>this.forceUpdate())})}_refreshHeader(){B()}render(){const e=we(),n=e.song;return p`
      <section
        class="lyricspanel"
        id="lyrics-panel"
        role="dialog"
        aria-label="歌词工作台"
        data-surface-owner="playerview"
        data-open=${this.open?"true":"false"}
        data-tab=${V}
        hidden
        @click=${a=>this.onClick(a)}
        @input=${a=>this.onInput(a)}
      >
        <header class="lyricspanel__head">
          <img class="lyricspanel__cover" data-song-cover alt="" src=${n?mt(n):F} />
          <div class="lyricspanel__meta">
            <div class="lyricspanel__title" data-song-title>${n?n.title||"未命名":"未在播放"}</div>
            <div class="lyricspanel__sub">
              <span
                class="lyricspanel__badge${e.text?"":" is-empty"}"
                data-song-source
                data-src=${e.source}
              >
                ${e.status==="matching"||e.status==="loading"?"歌词匹配中…":e.status==="failed"?"歌词匹配失败":Fi(e.source)}
              </span>
              <span class="lyricspanel__artist" data-song-artist>${n&&n.artist||""}</span>
            </div>
          </div>
          <button
            class="lyricspanel__close"
            type="button"
            data-act="close"
            aria-label="关闭"
            @click=${()=>zs()}
          >
            ${f("close")}
          </button>
        </header>

        <nav class="lyricspanel__tabs" role="tablist">
          ${["online","nudge","edit"].map(a=>p`
              <button
                class="lyricspanel__tab${V===a?" is-active":""}"
                type="button"
                role="tab"
                data-tab=${a}
                aria-selected=${String(V===a)}
                @click=${()=>Ou(a)}
              >
                ${a==="online"?"在线匹配":a==="nudge"?"微调":"手动编辑"}
              </button>
            `)}
        </nav>

        ${this.noticeTemplate(e)}
        <div class="lyricspanel__body">
          ${this.open?p`${this.onlinePane()} ${this.nudgePane(e)} ${this.editPane()}`:F}
        </div>
      </section>
    `}noticeTemplate(e){const n=V==="nudge"||V==="edit",a=e.source==="embedded"||e.source==="lrc-file";if(!n||!a)return F;const s=Fi(e.source),r=Lu(e.song),o=Du.has(r);return p`
      <div class="lyricspanel__notice" data-notice>
        <div class="lyricspanel__notice-text" data-notice-text>
          ${o?p`这首歌的歌词来自「${s}」，它的优先级高于歌词缓存：只保存到缓存的话，下次打开仍会显示旧歌词。建议同时写入歌曲文件。`:p`这首歌的歌词来自「${s}」，它的优先级高于歌词缓存；而 ${r?"."+r:"该格式"}
                不支持写入歌词标签，所以本次改动只在<b>本次运行内</b>生效（重启后会变回旧歌词）。`}
        </div>
        ${o?p`<label class="lyricspanel__notice-opt" data-notice-opt>
                <input type="checkbox" data-embed-toggle checked />
                <span>同时写入歌曲文件（否则下次打开仍显示旧歌词）</span>
              </label>`:F}
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
          <button class="btn btn--primary" type="button" data-act="lyrics-search" @click=${()=>this.searchLyrics()}>
            搜索
          </button>
        </div>
        <div class="lyricspanel__hint" data-online-hint>${this._lastOnlineHint}</div>
        <div class="lyricspanel__list" data-online-results>
          ${this._searching?"搜索中…":this._onlineMessage?this._onlineMessage:this._candidates.length?Me(this._candidates,(e,n)=>`${e.provider||""}-${e.id||n}`,(e,n)=>p`
                        <div class="candidate">
                          <div class="candidate__main">
                            <div class="candidate__title">
                              ${(e.title||"未命名")+" - "+(e.artist||"未知")}
                            </div>
                            <div class="candidate__sub">
                              ${(e.provider||"")+" · score "+(e.score||0)+" · "+Ct(e.duration)}
                            </div>
                          </div>
                          <button
                            class="btn btn--sm btn--primary"
                            type="button"
                            data-act="use-lyric"
                            data-i=${n}
                            @click=${()=>this.applyCandidate(n)}
                          >
                            使用
                          </button>
                        </div>
                      `):"搜索结果会显示在这里，点击「使用」应用歌词"}
        </div>
      </section>
    `}nudgePane(e){const n=e.songId?Pt(e.songId):0,a=n<0?e.lines.filter(r=>r.time+n<0).length:0,s={lower:-1e4,upper:1e4};return p`
      <section class="lyricspanel__pane" data-pane="nudge" ?hidden=${V!=="nudge"}>
        <div class="nudge__readout">
          <span class="lyricspanel__hint">当前偏移</span>
          <b class="nudge__value" data-nudge-value>${(n>0?"+":"")+(n/1e3).toFixed(2)} 秒</b>
          <span class="nudge__dirty" data-nudge-dirty ?hidden=${n===0}>● 未应用</span>
          <span class="lyricspanel__hint" data-nudge-clamp ?hidden=${a===0}>
            ${a?`有 ${a} 行会被压到 0:00（已经不能再往前）`:""}
          </span>
        </div>
        <div class="nudge__block">
          <div class="lyricspanel__hint">听感校准：一边听一边点，改的是歌词出现的时间</div>
          <div class="nudge__feel">
            <button class="btn" type="button" data-act="nudge-feel" data-delta="500" @click=${()=>cs(500)}>
              歌词比声音<b>快</b>（出现太早）→ 整体延后 0.5s
            </button>
            <button class="btn" type="button" data-act="nudge-feel" data-delta="-500" @click=${()=>cs(-500)}>
              歌词比声音<b>慢</b>（出现太晚）→ 整体提前 0.5s
            </button>
          </div>
        </div>
        <div class="nudge__block">
          <div class="lyricspanel__hint">精细调整（50ms 一档）</div>
          <div class="nudge__steps">
            ${[-1e3,-500,-100,100,500,1e3].map(r=>p`<button
                  class="btn btn--sm"
                  type="button"
                  data-act="nudge-step"
                  data-delta=${r}
                  @click=${()=>cs(r)}
                >
                  ${r>0?"+":"−"}${(Math.abs(r)/1e3).toFixed(1)}
                </button>`)}
          </div>
          <input
            class="nudge__range"
            type="range"
            min=${String(s.lower)}
            max=${String(s.upper)}
            step="50"
            .value=${String(n)}
            ?disabled=${!e.text}
            data-act="nudge-range"
            aria-label="整体偏移（毫秒）"
            @input=${r=>ar(Number(r.target.value))}
          />
        </div>
        <div class="nudge__block nudge__block--grow">
          <div class="lyricspanel__hint">预览（点一行会跳到那一句）</div>
          <div class="lyricspanel__list" data-nudge-preview @scroll=${()=>this.onFollowScroll()}>
            ${this.nudgePreview(e,n)}
          </div>
        </div>
        <div class="lyricspanel__foot">
          <button class="btn btn--sm" type="button" data-act="nudge-reset" @click=${()=>Ru()}>
            ${F}重置
          </button>
          <span class="lyricspanel__hint">微调不会自动保存</span>
          <button class="btn btn--primary" type="button" data-act="nudge-apply" @click=${()=>this.applyNudge()}>
            应用到歌词
          </button>
        </div>
      </section>
    `}nudgePreview(e,n){if(!e.text)return"这首歌还没有歌词。可以先用「在线匹配」找一份，或者切到「手动编辑」自己贴一份。";const a=e.lines,s=nr(a,n),r=Math.max(0,s-5),o=Math.min(a.length,s+6),l=[];for(let c=r;c<o;c+=1){const d=a[c],g=Math.max(0,d.time+n);l.push(p`
        <div
          class="nudge__line${c===s?" is-active":""}"
          data-act="nudge-seek"
          data-ms=${g}
          @click=${()=>$t(g)}
        >
          <span class="nudge__time">${Qt(d.time+n).slice(1,-1)}</span>
          <span class="nudge__text">${d.text}</span>
        </div>
      `)}return l}paintNudgeFollow(){if(V!=="nudge")return;const e=this.querySelector("[data-nudge-preview]");if(!e)return;const n=we();if(!n.lines.length)return;const a=n.songId?Pt(n.songId):0,s=nr(n.lines,a),r=e.querySelectorAll(".nudge__line");if(!r.length)return;const o=Number(r[0].dataset.index??-1);if(o<0)return;if(s<o||s>=o+r.length){B();return}const l=s-o;r.forEach((c,d)=>c.classList.toggle("is-active",d===l)),this.followScroll(e,r[l])}editPane(){const e=v.lines.filter(o=>typeof o.time=="number").length,n=To(),a=v.lines.length-e,s=n?`草稿属于《${Ze(v.songId)?.title||"上一首"}》`:a>0&&e>0?`还有 ${a} 行没有时间`:"",r=n?"已切歌，草稿仍属于上一首":v.kept>0?`已沿用 ${v.kept} 行原有时间`:v.dirty?"未保存":"";return p`
      <section class="lyricspanel__pane" data-pane="edit" ?hidden=${V!=="edit"}>
        <div class="editor__source">
          <div class="lyricspanel__row lyricspanel__row--between">
            <span class="lyricspanel__hint">歌词文本：粘贴纯文本即可（带时间标签也能识别）</span>
            <span class="lyricspanel__row-actions">
              <button class="btn btn--sm" type="button" data-act="editor-load" @click=${()=>Fu()}>
                载入当前歌词
              </button>
              <button class="btn btn--sm" type="button" data-act="editor-clear-times" @click=${()=>Bu()}>
                清空全部时间
              </button>
              <button class="btn btn--sm" type="button" data-act="editor-clear" @click=${()=>zu()}>
                清空文本
              </button>
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
          <button
            class="btn btn--icon"
            type="button"
            data-act="editor-play"
            data-tip="播放 / 暂停"
            @click=${()=>Hu()}
          >
            ${f(i.playing?"pause":"play")}
          </button>
          <button
            class="btn btn--sm"
            type="button"
            data-act="editor-back"
            @click=${()=>$t(Math.max(0,i.position-5e3))}
          >
            −5s
          </button>
          <button class="btn btn--sm" type="button" data-act="editor-fwd" @click=${()=>$t(i.position+5e3)}>
            +5s
          </button>
          <span class="editor__clock" data-editor-clock>${Qt(i.position).slice(1,-1)}</span>
          <span class="editor__spacer"></span>
          <span class="lyricspanel__hint" data-editor-progress>已打轴 ${e} / ${v.lines.length}</span>
        </div>

        <button class="editor__tap" type="button" data-act="editor-tap" @click=${()=>ds()}>
          <span class="editor__tap-main">打轴并下一行</span>
          <span class="editor__tap-hint"><kbd>空格</kbd> 或点这里</span>
        </button>

        <div class="editor__tools">
          <button class="btn btn--sm" type="button" data-act="editor-undo" @click=${()=>Nu()}>撤销</button>
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
          <span class="lyricspanel__hint" data-editor-save-hint>${s}</span>
          <button class="btn btn--primary" type="button" data-act="editor-save" @click=${()=>this.saveDraft()}>
            保存并应用
          </button>
        </div>
      </section>
    `}draftList(){return v.lines.length?Me(v.lines,(e,n)=>n,(e,n)=>{const a=typeof e.time=="number",s=["drow"];return n===v.cursor&&s.push("is-cursor"),a||s.push("is-untimed"),n===this._nowIndex&&s.push("is-now"),p`
          <div class=${s.join(" ")} data-act="editor-cursor" data-i=${n} @click=${()=>Ws(n)}>
            <span class="drow__no">${n+1}</span>
            <button
              class="drow__time"
              type="button"
              data-act="edit-seek"
              data-i=${n}
              data-tip="跳到这一句"
              @click=${r=>{r.stopPropagation(),Wu(n)}}
            >
              ${a?Qt(e.time).slice(1,-1):"未打轴"}
            </button>
            <span class="drow__text">${e.text}</span>
            <button
              class="drow__clear"
              type="button"
              data-act="edit-clear"
              data-i=${n}
              aria-label="清除这一行的时间"
              ?hidden=${!a}
              @click=${r=>{r.stopPropagation(),qu(n)}}
            >
              ${f("close")}
            </button>
          </div>
        `}):p`<div class="editor__empty">还没有歌词文本。把歌词粘到上面的文本框里，或点「载入当前歌词」。</div>`}onClick(e){const n=e.target.closest("[data-act], [data-tab]");if(!n||!this.contains(n))return;const a=n.dataset.act,s=Number(n.dataset.i);switch(a){case"close":zs();return;case"nudge-seek":$t(Number(n.dataset.ms));return;case"editor-cursor":Ws(s);return;case"editor-tap":ds();return}}onInput(e){const n=e.target;if(n.matches("[data-editor-text]")){this.scheduleDraftSettle();return}n.matches('[data-act="nudge-range"]')&&ar(Number(n.value))}onPanelKeyDown(e){if(!this.open||V!=="edit"||e.key!==" "||e.ctrlKey||e.metaKey||e.altKey)return;const n=e.target;n&&(n.tagName==="TEXTAREA"||n.tagName==="INPUT")||this.contains(n)&&(e.preventDefault(),e.stopPropagation(),ds())}onFollowScroll(){Date.now()<this._followAutoUntil||(this._followHold=Date.now()+4e3)}followScroll(e,n,a=!1){if(!e||!n||!a&&Date.now()<this._followHold)return;const s=e.getBoundingClientRect(),r=n.getBoundingClientRect(),o=Math.max(0,e.scrollTop+(r.top-s.top)-(e.clientHeight-r.height)/2);Math.abs(e.scrollTop-o)<2||(this._followAutoUntil=Date.now()+700,e.scrollTo({top:o,behavior:"smooth"}))}prefillOnlineKeyword(){const e=ls();if(!e)return;const n=[e.title,e.artist].filter(Boolean).join(" ").trim();!n||n===this._onlineKeyword||(this._onlineKeyword=n,B())}async refreshOnlineHint(){const e=await os();if(e)try{const n=await e.LyricsProviders?.(),a=Array.isArray(n?.providers)?n.providers:[];a.length&&(this._lastOnlineHint="在线歌词来源："+So(a),B())}catch{}}async searchLyrics(){const e=(this._onlineKeyword||"").trim();if(!e){u("请输入歌词搜索关键词",{duration:1500});return}const n=await os();if(!n){u("在线歌词服务暂不可用，请稍后再试",{tone:"error"});return}const a=ls();this._searching=!0,this._onlineMessage="",B();try{const s=await n.SearchLyrics(e,a?a.title:"",a?a.artist:"",a?a.duration:0);this._candidates=Array.isArray(s)?s:[],this._onlineMessage=this._candidates.length?"":"没有找到候选歌词"}catch(s){this._candidates=[],this._onlineMessage="搜索失败："+(s.message||s)}finally{this._searching=!1,B()}}async applyCandidate(e){const n=this._candidates[e];if(!n)return;const a=ls();if(!a){u("请先播放一首歌曲",{tone:"warning"});return}const s=await os();if(!s){u("在线歌词服务暂不可用，请稍后再试",{tone:"error"});return}try{const r=await s.FetchLyrics(n.provider,n.id);if(!r||!r.lrc){u("没有取到歌词",{tone:"warning"});return}const o=await ts(a.id,r.lrc,r.source||"online",{embed:i.config.embedMeta===!0});ut(a.id,0),v.songId="",u(o?.note||"歌词已应用并保存",{tone:"success",duration:2e3}),B()}catch(r){u("获取歌词失败："+(r.message||r),{tone:"error"})}}async applyNudge(){const e=we();if(!e.songId){u("请先播放一首歌曲",{tone:"warning"});return}const n=Pt(e.songId);if(!n){u("当前没有需要应用的调整",{duration:1800});return}if(!e.text){u("这首歌还没有歌词",{tone:"warning"});return}const a=gl(e.text,n),s=await ts(e.songId,a,"edit:offset",{embed:tr(e,this)});s!==!1&&(ut(e.songId,0),B(),u(s?.note||"已应用并保存",{tone:"success",duration:2600}))}async ensureDraft(e=!1){const n=we();!e&&v.songId===n.songId&&v.lines.length||(v.songId=n.songId,v.title=n.song?.title||"",v.lines=n.text?ws(n.text):[],v.cursor=0,v.undo=[],v.dirty=!1,v.kept=0,v.stale=!1,this._nowIndex=-1,this._lastScrolledNow=-1,this._lastScrolledCursor=-1,this._followHold=0,this._followAutoUntil=0,this._pendingText=n.text||"",B())}scheduleDraftSettle(){this._draftTimer&&clearTimeout(this._draftTimer),this._draftTimer=setTimeout(()=>{this._draftTimer=null,this.syncDraftFromText()},300)}syncDraftFromText(){const e=this.querySelector("[data-editor-text]");if(!e)return;const n=ws(e.value),a=vl(v.lines,n),s=a.filter((r,o)=>typeof r.time=="number"&&!(n[o]&&typeof n[o].time=="number")).length;Ft(),v.lines=a,v.cursor>=a.length&&(v.cursor=Math.max(0,a.length-1)),v.dirty=!0,v.kept=s,B()}serializeDraftText(){return v.lines.map(e=>typeof e.time=="number"?Qt(e.time)+e.text:e.text).join(`
`)}setDraftText(e){this._pendingText=e,B()}async saveDraft(){const e=we(v.songId);if(!e.songId){u("还没有可保存的内容：先播放一首歌再编辑",{tone:"warning"});return}const n=v.lines.filter(c=>typeof c.time=="number"&&Number.isFinite(c.time));if(!n.length){u("至少要先给一行打上时间",{tone:"warning"});return}const a=v.lines.length-n.length;let s=!1,r=-1/0;for(const c of v.lines)if(typeof c.time=="number"){if(c.time<r){s=!0;break}r=c.time}if(a||s){const c=p`
        ${a?p`<div class="lyricspanel__hint">
                还有 <b>${a}</b> 行没有时间：LRC 里没有时间标签的行会被忽略，保存后这些行不会显示。
              </div>`:F}
        ${s?p`<div class="lyricspanel__hint">时间不是升序，播放时高亮可能会跳来跳去。</div>`:F}
      `;if(!await ju({title:a?"还有歌词没有打轴":"时间不是升序",body:c,okText:"继续保存",cancelText:"返回编辑"}))return}const o=hi(v.lines),l=await ts(e.songId,o,"manual",{embed:tr(e,this)});l!==!1&&(ut(e.songId,0),v.undo=[],v.dirty=!1,v.songId=e.songId,B(),u(l?.note||"歌词已保存",{tone:"success",duration:2600}))}async copyLrc(){const e=hi(v.lines);if(!e){u("还没有可复制的歌词",{duration:1800});return}try{await navigator.clipboard.writeText(e),u("LRC 已复制到剪贴板",{tone:"success"})}catch{const n=document.createElement("textarea");n.value=e,n.style.cssText="position:fixed;left:-9999px;top:0;",document.body.appendChild(n),n.select();let a=!1;try{a=document.execCommand("copy")}catch{a=!1}n.remove(),u(a?"LRC 已复制到剪贴板":"复制失败，请手动选中文本",{tone:a?"success":"warning"})}}paintNowRow(){const e=performance.now();if(e-this._lastNowPaint<200)return;this._lastNowPaint=e;let n=-1;for(let a=0;a<v.lines.length;a+=1){const s=v.lines[a].time;typeof s=="number"&&s<=i.position&&(n=a)}n!==this._nowIndex&&(this._nowIndex=n,B())}paintEditorFollow(){this.paintNowRow(),this.scrollDraftRows()}scrollDraftRows(){const e=this.querySelector("[data-editor-list]");if(e){if(v.cursor!==this._lastScrolledCursor){const n=e.querySelector(`[data-i="${v.cursor}"]`);n&&(this._lastScrolledCursor=v.cursor,this.followScroll(e,n,!0))}if(this._nowIndex!==this._lastScrolledNow){const n=e.querySelector(`[data-i="${this._nowIndex}"]`);n&&this._nowIndex>=0&&(this._lastScrolledNow=this._nowIndex,this.followScroll(e,n))}}}}ae("mp-lyrics-panel",Au);let xo=0;function B(){xo+=1,ve()}const et=()=>document.querySelector("mp-lyrics-panel");function Mu(t){i.lyricsOpen=!0,Bt(),B();const e=et();e&&(e._refreshHeader(),e.prefillOnlineKeyword(),pa().then(()=>{e._pendingText=we().text||"",V==="edit"&&e.ensureDraft(!0),V==="online"&&e.refreshOnlineHint(),B()}))}function zs(){i.lyricsOpen=!1;const t=we();t.songId&&Pt(t.songId)&&(ut(t.songId,0),u("未应用的微调已丢弃",{duration:1800})),B()}function Pu(t){i.lyricsOpen?zs():Mu()}function Ou(t){V=t==="nudge"||t==="edit"?t:"online";const e=et();e&&(V==="edit"&&e.ensureDraft().then(()=>B()),V==="online"&&e.refreshOnlineHint?.()),B()}function ls(){return Ze(i.currentId)||null}function Lu(t){return String(t?.ext||"").replace(/^\./,"").toLowerCase()}function tr(t,e){const n=e?.querySelector("[data-embed-toggle]"),a=e?.querySelector("[data-notice-opt]");return(t.source==="embedded"||t.source==="lrc-file")&&a&&n?!!n.checked:i.config.embedMeta===!0}function nr(t,e){let n=-1;for(let a=0;a<t.length&&t[a].time+e<=i.position;a+=1)n=a;return n}function Co(){return{lower:-1e4,upper:1e4}}function cs(t){const e=we();if(!e.songId){u("请先播放一首歌曲",{tone:"warning"});return}if(!e.text){u("这首歌还没有歌词，先去在线匹配或手动编辑",{tone:"warning",duration:2600});return}const n=Co(),a=Math.max(n.lower,Math.min(n.upper,Pt(e.songId)+t));ut(e.songId,a),B()}function ar(t){const e=we();if(!e.songId||!e.text)return;const n=Co(),a=Math.max(n.lower,Math.min(n.upper,Math.round(Number(t)||0)));ut(e.songId,a),B()}function Ru(){const t=we();t.songId&&(ut(t.songId,0),B())}function Ft(){v.undo.push({lines:v.lines.map(t=>({...t})),cursor:v.cursor}),v.undo.length>50&&v.undo.shift()}function Nu(){const t=v.undo.pop();if(!t){u("没有可撤销的操作",{duration:1500});return}v.lines=t.lines,v.cursor=Math.min(t.cursor,Math.max(0,t.lines.length-1)),v.dirty=!0,et()?.setDraftText(Ia()),B()}function Ia(){return v.lines.map(t=>typeof t.time=="number"?Qt(t.time)+t.text:t.text).join(`
`)}function sr(t){if(!v.lines.length)return;const e=Math.max(0,Math.min(v.lines.length-1,v.cursor+t));e!==v.cursor&&(v.cursor=e,B())}function Ws(t){!Number.isFinite(t)||t<0||t>=v.lines.length||t===v.cursor||(v.cursor=t,B())}function ds(){if(!v.lines.length){u("先把歌词粘到上面的文本框里",{tone:"warning",duration:2200});return}if(To()){u("已切歌：先决定这份草稿怎么办（保存它，或点「载入当前歌词」重来）",{tone:"warning",duration:4200});return}const t=v.lines[v.cursor];t&&(Ft(),t.time=Math.round(i.position/10)*10,v.dirty=!0,v.cursor<v.lines.length-1&&(v.cursor+=1),et()?.setDraftText(Ia()),B())}function qu(t){const e=v.lines[t];!e||typeof e.time!="number"||(Ft(),e.time=null,v.dirty=!0,et()?.setDraftText(Ia()),B())}function Bu(){v.lines.length&&(Ft(),v.lines.forEach(t=>{t.time=null}),v.cursor=0,v.dirty=!0,et()?.setDraftText(Ia()),u("已清空全部时间，可以重新打轴",{duration:2e3}),B())}function Fu(){const t=we();if(!t.text){u("这首歌还没有歌词可载入",{duration:2e3});return}Ft(),v.lines=ws(t.text),v.cursor=0,v.dirty=!0,v.songId=t.songId,v.title=t.song?.title||"",et()?.setDraftText(t.text),u("已载入当前歌词，可以逐行修正时间",{duration:2200}),B()}function zu(){Ft(),v.lines=[],v.cursor=0,v.dirty=!0,et()?.setDraftText(""),B()}function Wu(t){const e=v.lines[t];if(!e)return;let n=e.time;if(typeof n!="number"){for(let a=t-1;a>=0;a-=1)if(typeof v.lines[a].time=="number"){n=v.lines[a].time;break}}if(typeof n!="number"){u("这一行还没有时间，无法跳转",{duration:1600});return}$t(n),Ws(t)}function To(){return!!v.songId&&we().songId!==v.songId&&Uu()}function Uu(){return v.lines.some(t=>typeof t.time=="number")}function Hu(){$n()}function ju({title:t,body:e,okText:n,cancelText:a}){return new Promise(s=>{let r=!1;const o=l=>{r||(r=!0,s(l))};ne({title:t,body:e,okText:n,cancelText:a,onOk:()=>(o(!0),!0),onCancel:()=>(o(!1),!0)})})}const us={sequence:{icon:"repeat",label:"列表循环"},"loop-all":{icon:"repeat",label:"列表循环"},"loop-one":{icon:"repeat-one",label:"单曲循环"},shuffle:{icon:"shuffle",label:"随机播放"}};function Eo(t){const e=typeof t=="boolean"?t:!i.queueOpen;i.queueOpen=e,e&&(i.optionsOpen=!1),x()}function Io(t){const e=typeof t=="boolean"?t:!i.optionsOpen;i.optionsOpen=e,e&&(i.queueOpen=!1),x()}function Do(t){const e=typeof t=="boolean"?t:!i.sleepOpen;i.sleepOpen=e,x()}function Ao(){return Po(i.config.showDesktopLyrics?Y.off:Y.lyrics,{on:"已开启桌面歌词",off:"已关闭桌面歌词"})}function Mo(){return Po(i.config.showDesktopWallpaper?Y.off:Y.wallpaper,{on:"已开启桌面背景歌词",off:"已关闭桌面背景歌词"})}async function Po(t,{on:e,off:n}){const a=await fo(t);return x(),a.ok!==!1?(u(t===Y.off?n:e,{duration:1400}),a):(u(`打不开：${a.reason||a.error||"未知原因"}`,{tone:"warning",duration:3200}),a.restored&&u("已保留原来的桌面歌词设置",{duration:1800}),a)}function Vu(t){const e=Math.round(Number(t)||0);if(e<=0){Oo("已取消定时停止");return}i.sleepTimer={type:"duration",until:Date.now()+e*6e4,minutes:e},x(),u(`${e} 分钟后停止播放`,{duration:1800})}function Oo(t){i.sleepTimer=null,x(),u(t,{duration:1400})}function Gu(t){i.config.sleepAfterSong=!!t,x(),u(i.config.sleepAfterSong?"已开启：倒计时结束后等当前歌曲播完再停":"已关闭：倒计时结束后立即停止",{duration:2200})}function Ku(){const t=i.sleepTimer;if(!(t?.type!=="duration"||Date.now()<t.until)){if(i.config.sleepAfterSong===!0&&i.playing&&i.currentId){i.sleepTimer={type:"after-song"},x(),u("定时到点：等这首播完就停",{duration:2400});return}i.sleepTimer=null,i.playing?$n():x(),u("已按定时停止播放",{duration:1800})}}class Yu extends be{static deps=e=>[e.currentId,e.playing,e.duration,e.volume,e.muted,e.playMode,e.likedIds,e.queue.length,e.queueOpen,e.optionsOpen,e.sleepOpen,e.sleepTimer,e.config.showDesktopLyrics,e.config.showDesktopWallpaper,e.config.autoStartDesktopWallpaper,e.desktopWallpaperSupport,e.lyricsOpen,kn()];constructor(){super(),this._progress=null,this._volume=null,this._tick=null}onConnected(){this._tick=setInterval(()=>{i.sleepTimer&&this.requestUpdate()},1e3)}onDisconnected(){this._tick&&clearInterval(this._tick),this._tick=null}firstUpdated(){const e=this.querySelector("#progress");this._progress=pt(e,{min:0,max:1e3,step:1,value:0,format:n=>Ct(n/1e3*(i.duration||0)),onChange:n=>{i.duration&&(i.position=n/1e3*i.duration,this.requestUpdate())},onCommit:n=>{i.duration&&ua(n/1e3*i.duration)}}),this._volume=pt(this.querySelector("#volume"),{min:0,max:1,step:.01,value:i.volume,format:n=>`${Math.round(n*100)}`,onChange:n=>{bs(n),Ms(),this.requestUpdate()}})}updated(){const e=Math.round(i.position),n=Math.round(i.duration||0),a=this.querySelector("#time-current");if(a){const l=Ct(i.position);a.textContent!==l&&(a.textContent=l)}const s=this.querySelector("#progress");s&&s.dataset.dragging!=="true"&&n>0&&this._progress?.set(e/n*1e3,{silent:!0}),this._progress?.setDisabled(n<=0);const r=i.muted?0:i.volume,o=this.querySelector("#volume");o&&o.dataset.dragging!=="true"&&this._volume?.set(r,{silent:!0}),Ku()}render(){const e=Je(),n=i.currentId?Ot(i.currentId):!1,a=us[i.playMode]||us.sequence,s=i.muted?0:i.volume,r=s===0?"volume-mute":s<.5?"volume-low":"volume-high",o=e?mt(e):"",l=i.sleepTimer,c=l?.type==="duration"?Math.max(1,Math.ceil((l.until-Date.now())/6e4)):0;return p`
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
              @click=${()=>qs()}
            >
              <img id="bar-cover-img" alt=${e?`${e.title} 封面`:""} src=${ci(o)} />
              <svg class="playerbar__cover-icon"><use href="#i-expand"></use></svg>
            </button>
            <div class="playerbar__meta" id="bar-meta" data-tip="播放详情页" @click=${()=>qs()}>
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
              @click=${d=>this.openAddToPlaylistMenu(d.currentTarget)}
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
                @click=${()=>js()}
              >
                ${f("prev")}
              </button>
              <button
                class="transport__btn transport__btn--main"
                id="btn-play"
                type="button"
                data-tip=${i.playing?"暂停":"播放"}
                aria-label=${i.playing?"暂停":"播放"}
                @click=${()=>$n()}
              >
                <svg id="icon-play"><use href="#i-${i.playing?"pause":"play"}"></use></svg>
              </button>
              <button
                class="transport__btn"
                id="btn-next"
                type="button"
                data-tip="下一曲"
                aria-label="下一曲"
                @click=${()=>mn(!1)}
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
                @click=${()=>{il(),Ms()}}
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
              data-tip=${a.label}
              aria-label=${a.label}
              @click=${()=>{rl(),u((us[i.playMode]||a).label,{duration:1400})}}
            >
              <svg id="icon-mode"><use href="#i-${a.icon}"></use></svg>
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
              @click=${()=>Pu()}
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
              @click=${()=>Ao()}
            >
              ${f("desktop-lyrics")}
            </button>
            <button
              class="mode-btn"
              id="btn-desktop-wallpaper"
              type="button"
              aria-pressed=${String(!!i.config.showDesktopWallpaper)}
              ?disabled=${i.desktopWallpaperSupport?.supported===!1}
              aria-disabled=${i.desktopWallpaperSupport?.supported===!1?"true":F}
              data-tip=${i.desktopWallpaperSupport?.supported===!1?i.desktopWallpaperSupport.reason:i.config.autoStartDesktopWallpaper===!1?"桌面背景歌词（未开启「启动时自动启用」，重启后不会自动出现）":"桌面背景歌词"}
              aria-label="桌面背景歌词"
              @click=${()=>Mo()}
            >
              ${f("desktop-wallpaper")}
            </button>
            <button
              class="mode-btn"
              id="btn-sleep"
              type="button"
              aria-pressed=${String(!!l)}
              data-tip=${this.sleepTip(l)}
              aria-label="定时停止"
              @click=${()=>Do()}
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
              @click=${()=>Io()}
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
              @click=${()=>{Xu()}}
            >
              ${f("playlist")}
              <span class="mode-btn__badge" id="queue-count"
                >${i.queue.length===0?"":i.queue.length>99?"99+":String(i.queue.length)}</span
              >
            </button>
          </div>
        </div>
      </footer>
    `}sleepTip(e){return e?.type==="duration"?`定时停止 · 剩余 ${Math.max(0,Math.round((e.until-Date.now())/1e3))} 秒`:e?.type==="after-song"?"定时停止 · 播完当前歌曲":"定时停止"}onLike(){if(!i.currentId)return;va(i.currentId);const e=Ot(i.currentId);u(e?"已加入「我喜欢」":"已从「我喜欢」移除",{tone:e?"success":"info",duration:1500})}openAddToPlaylistMenu(e){const n=Je();if(!n){u("还没有正在播放的歌曲",{duration:1600});return}const a=[];for(const s of i.playlists.filter(r=>!r.locked))a.push({id:s.id,label:s.name,icon:s.id==="liked"?"heart":"playlist",checked:s.songIds.includes(n.id)});a.length||a.push({id:"__none",label:"还没有可用的歌单",disabled:!0}),a.push({id:"__sep",kind:"sep"}),a.push({id:"__new",label:"新建歌单…",icon:"plus"}),hn({anchor:e,x:0,y:0,align:"right",items:a,onPick:async s=>{if(!(s==="__none"||s==="__sep")){if(s==="__new"){Hr(r=>{r&&la(r.id,[n.id])});return}la(s,[n.id])}}})}}function Xu(){const t=i.queueOpen;Eo(),!t&&i.currentId&&requestAnimationFrame(()=>_o({notify:!1}))}ae("mp-playerbar",Yu);class In extends be{get open(){return!1}get panelEl(){return null}updated(){const e=this.panelEl;if(e){if(this.open){this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden?(Bt(),e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{this.open&&(e.dataset.state="opened")})):e.dataset.state!=="opened"&&(e.dataset.state="opened");return}e.hidden||(e.dataset.state="closed",!this._closeTimer&&(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!this.open&&e&&(e.hidden=!0)},Hs()+40)))}}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),this._closeTimer=null,super.disconnectedCallback()}bindDismiss(e){const n=s=>{const r=this.panelEl;!r||r.hidden||r.contains(s.target)||s.target.closest?.(e)||this.close()},a=s=>{if(s.key!=="Escape")return;const r=this.panelEl;r&&!r.hidden&&this.close()};document.addEventListener("pointerdown",n),document.addEventListener("keydown",a),this._undismiss=()=>{document.removeEventListener("pointerdown",n),document.removeEventListener("keydown",a)}}close(){}}class Qu extends In{static deps=e=>[e.queueOpen,e.queue,e.currentId,e.playing,kn()];get open(){return!!i.queueOpen}get panelEl(){return this.querySelector("#queue-panel")}close(){Eo(!1)}firstUpdated(){this.bindDismiss("#btn-playlist"),this.bindDrag()}updated(){super.updated(),this.bindDrag()}bindDrag(){const e=this.querySelector("#queue-panel-body");e&&(this._sortable&&this._sortable.el===e||(this._sortable?.destroy(),this._sortable=C.create(e,{draggable:".queue-item",animation:0,ghostClass:"is-dragging",onEnd:n=>{$o();const a=n.oldIndex,s=n.newIndex;if(a==null||s==null||a===s)return;const r=n.from,o=Array.from(r.children).filter(l=>l!==n.item);r.insertBefore(n.item,o[a]??null),yr(a,s),u("已调整播放顺序 · 播放模式已切回列表循环",{duration:1600})}})))}disconnectedCallback(){this._sortable?.destroy(),this._sortable=null,this._undismiss?.(),super.disconnectedCallback()}render(){const e=i.queueOpen?i.queue.map(n=>Ze(n)).filter(Boolean):[];return p`
      <section
        class="queue-panel"
        id="queue-panel"
        hidden
        data-state="closed"
        data-surface-owner="playerview"
        aria-label="播放列表"
      >
        <div class="queue-panel__head">
          <span class="queue-panel__title">播放列表</span>
          <span class="u-spacer"></span>
          <span class="queue-panel__count" id="queue-panel-count">${e.length} 首</span>
          <button
            class="queue-panel__btn"
            id="queue-locate"
            type="button"
            data-tip="定位到当前播放"
            aria-label="定位到当前播放"
            @click=${()=>_o()}
          >
            ${f("disc")}
          </button>
          <button
            class="queue-panel__btn"
            id="queue-clear"
            type="button"
            data-tip="清空列表"
            aria-label="清空列表"
            @click=${()=>{br(),u("播放列表已清空")}}
          >
            ${f("trash")}
          </button>
          <button
            class="queue-panel__btn"
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
          @click=${n=>this.onClick(n)}
          @keydown=${n=>this.onKey(n)}
        >
          ${e.length?Me(e,n=>n.id,n=>this.item(n)):p`<div class="queue-panel__empty">播放列表是空的<br />从曲库把歌曲加进来</div>`}
        </div>
      </section>
    `}item(e){const n=i.queue.indexOf(e.id),a=e.id===i.currentId;return p`
      <div
        class="queue-item"
        data-queue-id=${e.id}
        aria-current=${String(a)}
        role="button"
        tabindex="0"
        draggable="true"
      >
        <span class="queue-item__index">${a&&i.playing?f("play"):n+1}</span>
        <span class="queue-item__cover"><img src=${ci(mt(e))} alt="" loading="lazy" /></span>
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
    `}onClick(e){if(ko())return;const n=e.target.closest("[data-queue-del]");if(n){e.stopPropagation(),vs(n.dataset.queueDel);return}const a=e.target.closest("[data-queue-id]");a&&gs(a.dataset.queueId)}onKey(e){if(e.key!=="Enter"&&e.key!==" ")return;const n=e.target.closest?.("[data-queue-id]");n&&(e.preventDefault(),gs(n.dataset.queueId))}}ae("mp-queue-panel",Qu);class Ju extends In{static deps=e=>[e.optionsOpen,e.config.lyricsFontSize,e.config.glassAlpha,e.config.glassBlur,e.config.glassBlurCustom,e.config.showDesktopLyrics,e.config.showDesktopWallpaper];get open(){return!!i.optionsOpen}get panelEl(){return this.querySelector("#options-panel")}close(){Io(!1)}firstUpdated(){this.bindDismiss("#btn-options"),this._sliders={size:pt(this.querySelector("#opt-lyric-size"),{min:12,max:26,step:1,value:i.config.lyricsFontSize,format:e=>`${Math.round(e)}px`,onChange:e=>{i.config.lyricsFontSize=e,dt("--lyric-size",`${e}px`),this.requestUpdate()},onCommit:()=>x()}),alpha:pt(this.querySelector("#opt-alpha"),{min:20,max:95,step:1,value:i.config.glassAlphaCustom?i.config.glassAlpha:$s(),format:e=>`${Math.round(e)}%`,onChange:e=>{i.config.glassAlpha=e,i.config.glassAlphaCustom=!0,Ys(e),this.requestUpdate()},onCommit:()=>x()}),blur:pt(this.querySelector("#opt-blur"),{min:0,max:48,step:1,value:i.config.glassBlurCustom?i.config.glassBlur:ks(),format:e=>`${Math.round(e)}px`,onChange:e=>{i.config.glassBlur=e,i.config.glassBlurCustom=!0,dt("--glass-blur",`${e}px`),this.requestUpdate()},onCommit:()=>x()})}}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}render(){const e=Math.round(i.config.lyricsFontSize),n=Math.round(i.config.glassAlphaCustom?i.config.glassAlpha:$s()),a=Math.round(i.config.glassBlurCustom?i.config.glassBlur:ks());return p`
      <section
        class="options-panel"
        id="options-panel"
        hidden
        data-state="closed"
        data-surface-owner="playerview"
        aria-label="播放选项"
      >
        <div class="options-panel__head">
          <span class="options-panel__title">播放选项</span>
          <span class="u-spacer"></span>
          <button
            class="options-panel__btn"
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
              @click=${()=>Ao()}
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
              @click=${()=>Mo()}
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
              <span class="rangeslider__value" id="opt-blur-val">${a}px</span>
            </div>
          </div>
        </div>
      </section>
    `}}ae("mp-options-panel",Ju);class Zu extends In{static deps=e=>[e.sleepOpen,e.sleepTimer,e.config.sleepAfterSong,e.playing,e.currentId];get open(){return!!i.sleepOpen}get panelEl(){return this.querySelector("#sleep-panel")}close(){Do(!1)}constructor(){super(),this._tick=null,this._pendingMinutes=null}onConnected(){this._tick=setInterval(()=>{i.sleepOpen&&i.sleepTimer&&this.requestUpdate()},1e3)}onDisconnected(){this._tick&&clearInterval(this._tick),this._tick=null}firstUpdated(){this.bindDismiss("#btn-sleep"),this._slider=pt(this.querySelector("#sleep-slider"),{min:0,max:300,step:1,value:0,format:e=>`${Math.round(e)} 分钟`,onChange:e=>{this._pendingMinutes=Math.round(e),this.requestUpdate()},onCommit:e=>{this._pendingMinutes=null,Vu(e)}})}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}updated(){super.updated();const e=i.sleepTimer,n=this.querySelector("#sleep-slider");if(e?.type==="duration"){const a=Math.max(0,e.until-Date.now());n?.dataset.dragging!=="true"&&this._slider?.set(Math.max(0,Math.round(a/6e4)),{silent:!0})}else n?.dataset.dragging!=="true"&&this._slider?.set(0,{silent:!0})}render(){const e=i.sleepTimer,n=ep(e,this._pendingMinutes);return p`
      <section
        class="sleep-panel"
        id="sleep-panel"
        hidden
        data-state="closed"
        data-surface-owner="playerview"
        aria-label="定时停止"
      >
        <div class="sleep-panel__head">
          <svg class="sleep-panel__icon" aria-hidden="true"><use href="#i-clock"></use></svg>
          <span class="sleep-panel__title">定时停止</span>
          <span class="u-spacer"></span>
          <button
            class="options-panel__btn"
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
              @click=${()=>Gu(!i.config.sleepAfterSong)}
            ></button>
          </div>
          <div class="sleep-panel__row">
            <button
              class="btn btn--sm"
              type="button"
              data-sleep-act="off"
              @click=${()=>Oo("已取消定时停止")}
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
    `}}function ep(t,e){if(typeof e=="number")return e<=0?{value:"未开启",sub:"拖到 0 即取消"}:{value:`${e} 分钟`,sub:"松手开始倒计时"};if(t?.type==="after-song")return{value:"等待本首播完",sub:"倒计时已结束，这首播完就暂停"};if(t?.type==="duration"){const n=Math.max(0,t.until-Date.now());return{value:`剩余 ${tp(n)}`,sub:`共 ${t.minutes} 分钟`}}return{value:"未开启",sub:"拖动滑块设置时长"}}function tp(t){const e=Math.max(0,Math.round(t/1e3)),n=Math.floor(e/3600),a=Math.floor(e%3600/60),s=e%60;return n>0?`${n} 小时 ${String(a).padStart(2,"0")} 分`:`${String(a).padStart(2,"0")}:${String(s).padStart(2,"0")}`}ae("mp-sleep-panel",Zu);class np extends In{static deps=()=>{const e=sn();return[e.open,e.revision]};get open(){return sn().open}get panelEl(){return this.querySelector("#download-panel")}close(){Kl()}firstUpdated(){this.bindDismiss("#btn-downloads")}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}render(){const{tasks:e,running:n}=sn(),a=e.some(s=>s?.state!=="running");return p`
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
            @click=${()=>Xl()}
          >
            ${f("folder")}
          </button>
          <button
            class="download-panel__btn"
            id="download-clear"
            type="button"
            data-tip="清除已完成"
            aria-label="清除已完成"
            ?disabled=${!a}
            @click=${()=>Yl()}
          >
            ${f("trash")}
          </button>
          <button
            class="download-panel__btn"
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
          ${e.length?Me(e,s=>s.id,s=>this.item(s)):p`<div class="download-panel__empty">还没有下载任务</div>`}
        </div>
      </section>
    `}item(e){const n=e.state==="running"?"running":e.state==="failed"?"failed":"done",a=Number(e.total)||0,s=Number(e.done)||0,r=a>0?Math.min(100,Math.round(s/a*100)):0,o=Math.max(0,Math.min(100,Math.round(r/5)*5)),l=n==="running";let c=`${r}%`;n==="done"?c="已完成":n==="failed"?c="失败":a<=0&&(c="下载中");let d;return l?d=a>0?`${Bn(s)} / ${Bn(a)}`:Bn(s):n==="done"?d=`${Bn(s||a)} · ${e.path?ap(e.path):e.dir||""}`:d=e.message||"下载失败",p`
      <div
        class="download-item"
        data-state=${n}
        data-download-id=${e.id}
        role=${n==="done"?"button":F}
        tabindex=${n==="done"?"0":F}
        data-tip=${n==="done"?"在文件夹中显示":F}
        @click=${()=>Ql(e.id)}
      >
        <div class="download-item__title">${e.title||e.bvid||"未命名"}</div>
        <div class="download-item__state">${c}</div>
        <div class="download-item__bar" ?hidden=${!l} data-unknown=${a>0?"false":"true"}>
          <div class="download-item__fill" data-value=${o}></div>
        </div>
        <div class="download-item__meta${n==="failed"?" download-item__meta--error":""}">${d}</div>
      </div>
    `}}ae("mp-download-panel",np);function Bn(t){const e=Number(t)||0;if(e<=0)return"0 B";const n=["B","KB","MB","GB"];let a=0,s=e;for(;s>=1024&&a<n.length-1;)s/=1024,a+=1;return`${s>=10||a===0?Math.round(s):s.toFixed(1)} ${n[a]}`}function ap(t){const e=String(t||""),n=Math.max(e.lastIndexOf("\\"),e.lastIndexOf("/"));return n>=0?e.slice(n+1):e}class sp extends In{static deps=()=>[q.open,q.songId,q.rev,kn(),i.config.coverCarousel,i.config.embedMeta];get open(){return q.open}get panelEl(){return this.querySelector("#cover-layer")}close(){nn()}render(){const e=this.song();return p`
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
              class="cover-layer__close"
              type="button"
              data-cover-close
              aria-label="关闭封面管理"
              @click=${()=>nn()}
            >
              ${f("close")}
            </button>
          </div>
          <div class="cover-layer__body" id="cover-layer-body">${e&&this.open?this.panel(e):F}</div>
        </div>
      </div>
    `}song(){const e=q.songId;return e&&i.songs.find(n=>n.id===e)||null}panel(e){const n=q,a=zo(e);return p`
      <div class="cover-panel">
        <div class="cover-panel__current">
          <div class="cover-panel__frame" id="cover-current-frame">
            ${a?p`<img src=${a} alt=${e.title} 原始封面 />`:p`<span class="cover-panel__none">${f("music")}</span>`}
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
              @input=${s=>{q.keyword=s.target.value}}
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
          ${n.candidates.length?this.selectbar():F}
        </div>

        <div class="cover-panel__foot">
          <button
            class="btn btn--sm"
            type="button"
            data-cover-act="open-cache"
            @click=${()=>m.coverOpenCacheDir("covers")}
          >
            ${f("folder")}<span>打开缓存目录</span>
          </button>
        </div>
      </div>
    `}setItems(){const e=q,n=e.currentSet?.items||[],a=e.currentSet?.embedded||[],s=Number(e.currentSet?.active)||0;return!n.length&&!a.length?p`<div class="cover-set__empty">还没有换过封面，这首歌现在用的是文件自带的封面。</div>`:p`
      ${n.map((r,o)=>p`
          <div class="cover-set__item" data-set-index=${o} data-active=${String(o===s)}>
            <img src=${r.preview} alt="" />
            ${o===s?p`<span class="cover-set__badge">当前</span>`:F}
            <div class="cover-set__ops">
              <button class="btn btn--xs" type="button" data-set-act="use" ?disabled=${o===s}>
                ${f("check")}<span>设为当前</span>
              </button>
              <button class="btn btn--xs btn--danger" type="button" data-set-act="remove">
                ${f("trash")}<span>删除</span>
              </button>
            </div>
          </div>
        `)}
      ${a.map(r=>p`
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
    `}cards(){const e=q;return Me(e.candidates,n=>n.preview,(n,a)=>{const s=e.selected.has(n);return p`
          <button
            class="cover-card"
            type="button"
            role="checkbox"
            aria-checked=${String(s)}
            data-cover-act="toggle"
            data-cover-idx=${a}
            data-selected=${String(s)}
            @click=${()=>this.toggleCandidate(a)}
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
        `})}selectbar(){const e=q,n=e.selected.size===e.candidates.length;return p`
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
    `}onClick(e){if(e.target.closest("[data-cover-close]")||e.target===this.panelEl){nn();return}const n=e.target.closest("[data-set-act]");if(n){const a=Number(n.closest("[data-set-index]")?.dataset.setIndex);n.dataset.setAct==="use"&&this.useExisting(a),n.dataset.setAct==="remove"&&this.removeExisting(a)}}onKey(e){if(e.key!=="Escape")return;const n=this.querySelector("#cover-keyword");if(n&&document.activeElement===n&&n.value.trim()){q.keyword="",n.value="";return}nn()}toggleCandidate(e){const n=q.candidates[e];n&&(q.selected.has(n)?q.selected.delete(n):q.selected.add(n),Re())}selectAll(){const e=q;e.selected.size===e.candidates.length?e.selected.clear():e.candidates.forEach(n=>e.selected.add(n)),Re()}async runSearch(){const e=q;if(e.busy)return;if(!$()){J("浏览器预览下没有联网封面后端，请在应用里试");return}e.busy=!0;const n=e.candidates.filter(s=>s.local);e.candidates=[...n],e.selected=new Set(n),Re();const a=(this.querySelector("#cover-keyword")?.value||"").trim();J(a?`正在按「${a}」同时查询多个来源（${ir()}）…`:`正在同时查询多个来源（${ir()}）…`);try{const s=a?{keyword:a}:{},r=await m.coverLookupSongAll(e.songId,s),o=Array.isArray(r)?r.filter(l=>l?.ok&&l.preview):[];if(o.length){e.candidates=[...n,...o.map(c=>({...c,local:!1}))];const l=[...new Set(o.map(c=>c.provider).filter(Boolean))];J(`找到 ${o.length} 张（来源：${l.join(" / ")||"未知"}），勾选后点「应用」`)}else{e.candidates=[...n];const l=Array.isArray(r)?r.find(c=>c?.message)?.message:"";J(l||"没有找到匹配的封面（也可能是匹配到的都是空白图，已自动丢弃）")}}catch(s){J(`搜索失败：${s?.message??s}`)}finally{e.busy=!1,Re()}}async pickLocal(){const e=q;if(!$()){J("浏览器预览下没有系统文件选择器，请在应用里试");return}J("正在读取图片…");try{const n=await m.coverPickLocal();if(!n||n.cancelled){J("");return}if(!n.ok||!n.preview){J(n?.message||"这张图片没法用作封面");return}const a={preview:n.preview,provider:n.provider||"本地图片",source:n.source||"",width:n.width,height:n.height,local:!0};e.candidates.unshift(a),e.selected.add(a),Re(),J(`已加入本地图片${n.source?`（${n.source}）`:""}，确认后点「应用」`)}catch(n){J(`选择图片失败：${n?.message??n}`)}}async applySelected(){const e=q.candidates.filter(n=>q.selected.has(n)).map(n=>n.preview).filter(Boolean);if(!e.length){J("先勾选至少一张封面");return}await this.writeCovers(()=>m.coverAddMany(q.songId,e,i.config.embedMeta===!0))}async useExisting(e){Number.isFinite(e)&&await this.writeCovers(()=>m.coverSetActive(q.songId,e))}async useEmbedded(e){e?.preview&&await this.writeCovers(()=>m.coverAdd(q.songId,"",e.preview,i.config.embedMeta===!0))}async removeExisting(e){Number.isFinite(e)&&await this.writeCovers(()=>m.coverRemove(q.songId,e))}async writeCovers(e){const n=q;if(!$()){J("浏览器预览下没有封面后端，请在应用里试");return}J("正在保存…");try{const a=await e();a&&Array.isArray(a.items)&&(n.currentSet=a,ys(n.songId,a)),J(a?.message||"已更新封面"),zi(),u(a?.message||"封面已更新",{tone:"success",duration:1800})}catch(a){J(`保存失败：${a?.message??a}`)}}toggleCarousel(){i.config.coverCarousel=!i.config.coverCarousel,x(),u(i.config.coverCarousel?`已开启封面轮播（每 ${Number(i.config.coverCarouselInterval)||10} 秒换一张）`:"已关闭封面轮播",{duration:1600})}toggleEmbed(){i.config.embedMeta=!i.config.embedMeta,x(),u(i.config.embedMeta?"之后的封面会写进歌曲文件本身":"封面只保存在缓存目录（不改动音乐文件）",{duration:2200})}async refreshSet(){const e=q;if(!(!$()||!e.songId))try{const n=await m.coverList(e.songId);n&&Array.isArray(n.items)&&(e.currentSet=n,ys(e.songId,n),zi())}catch(n){J(`读取现有封面失败：${n?.message??n}`)}}}ae("mp-cover-layer",sp);const q={open:!1,songId:"",candidates:[],selected:new Set,currentSet:null,busy:!1,status:"",keyword:"",rev:0};function Re(){q.rev+=1,ve()}function J(t){q.status=t||"",Re()}const ip=()=>document.querySelector("mp-cover-layer");function ir(){return So(i.coverProviders,"iTunes / 网易云 / QQ 音乐 / Deezer / MusicBrainz")}function rp(t){if(!i.songs.find(a=>a.id===t)){u("这首歌不在本地曲库里，无法更换封面",{tone:"warning"});return}Object.assign(q,{open:!0,songId:t,candidates:[],selected:new Set,currentSet:i.coverSets.get(t)||null,status:"",keyword:""}),Re(),ip()?.refreshSet(),op()}function nn(){q.open=!1,Re()}async function op(){if(!(i.coverProviders?.length||!$()))try{const t=await m.coverProviders();Array.isArray(t?.providers)&&t.providers.length&&(i.coverProviders=t.providers,Re())}catch{}}const rr="本地音乐播放器",lp="localMusicPlayer",cp="LMPlayer",dp="本地曲库 + 在线试听的桌面音乐播放器",up="0.1.0",pp="Apache-2.0",fp="Copyright 2026 The localMusicPlayer Authors",ps="https://github.com/nihaozyj7/localMusicPlayer",hp=[{id:"home",label:"项目主页",icon:"external",url:ps},{id:"issues",label:"问题反馈",icon:"external",url:`${ps}/issues`},{id:"releases",label:"更新日志",icon:"external",url:`${ps}/releases`},{id:"license",label:"Apache-2.0 协议全文",icon:"scale",url:"https://www.apache.org/licenses/LICENSE-2.0"}],mp=[{name:"Go",version:"1.25",role:"后端：目录扫描、标签解析、音频 HTTP 服务、响度测量、在线接口聚合",url:"https://go.dev/"},{name:"Wails",version:"v3（beta.14）",role:"桌面外壳：Go ↔ WebView 桥、无边框窗口、托盘、单实例、系统文件对话框",url:"https://v3.wails.io/"},{name:"WebView2",version:"系统自带",role:"界面渲染引擎（Windows）；应用不内嵌浏览器内核，因此安装包很小",url:"https://developer.microsoft.com/microsoft-edge/webview2/"},{name:"Lit",version:"3",role:"前端视图层：设置、曲目表、各弹层都是增量更新的自定义元素",url:"https://lit.dev/"},{name:"原生 ES Module + Vite",version:"7",role:"界面代码本身是可直接阅读的 JS，Vite 只做依赖解析与产物打包",url:"https://vite.dev/"},{name:"npm workspaces",version:"—",role:"单仓多包：应用壳 + 播放界面样式包（frontend/packages/player-skins）",url:"https://docs.npmjs.com/cli/using-npm/workspaces"},{name:"ffmpeg",version:"8.1.2（自行编译的精简版）",role:"解码 WebView 放不了的格式、转码为 PCM/WAV、loudnorm 响度测量",url:"https://ffmpeg.org/"},{name:"ESLint / Prettier / TypeScript",version:"9 / 3 / 5",role:"代码检查与类型检查（JSDoc + checkJs，逐个文件收紧）",url:"https://eslint.org/"}],gp=[{name:"Wails",version:"v3.0.0-beta.14",license:"MIT",role:"桌面外壳与 Go↔JS 桥",url:"https://github.com/wailsapp/wails"},{name:"dhowden/tag",version:"2024-04-17",license:"BSD-2-Clause",role:"mp3 / m4a / flac / ogg 标签解析",url:"https://github.com/dhowden/tag"},{name:"fsnotify/fsnotify",version:"1.9.0",license:"BSD-3-Clause",role:"音乐文件夹的实时监听",url:"https://github.com/fsnotify/fsnotify"},{name:"Lit",version:"3.3.3",license:"BSD-3-Clause",role:"前端视图层",url:"https://github.com/lit/lit"},{name:"SortableJS",version:"1.15.7",license:"MIT",role:"播放队列与歌单的拖拽排序",url:"https://github.com/SortableJS/Sortable"}],vp=[{name:"coder/websocket",version:"1.8.14",license:"ISC",role:"Wails 的 WebSocket 传输",url:"https://github.com/coder/websocket"},{name:"go-ole/go-ole",version:"1.3.0",license:"MIT",role:"Windows COM 绑定",url:"https://github.com/go-ole/go-ole"},{name:"godbus/dbus/v5",version:"5.2.2",license:"BSD-2-Clause",role:"Linux 桌面集成",url:"https://github.com/godbus/dbus"},{name:"jchv/go-winloader",version:"2025-04-06",license:"ISC",role:"Windows 依赖加载",url:"https://github.com/jchv/go-winloader"},{name:"adrg/xdg",version:"0.5.3",license:"MIT",role:"跨平台标准目录",url:"https://github.com/adrg/xdg"},{name:"mattn/go-colorable",version:"0.1.14",license:"MIT",role:"Windows 控制台彩色输出",url:"https://github.com/mattn/go-colorable"},{name:"mattn/go-isatty",version:"0.0.20",license:"MIT",role:"判断 stdout 是否为终端",url:"https://github.com/mattn/go-isatty"},{name:"golang.org/x/sys",version:"0.46.0",license:"BSD-3-Clause",role:"Go 官方系统调用扩展",url:"https://pkg.go.dev/golang.org/x/sys"}],bp=[{name:"FFmpeg",version:"8.1.2",license:"LGPL-2.1-or-later",role:"由本项目用 build/ffmpeg/build-minimal.sh 从官方源码自行编译的精简版（约 5.6MB），只保留音频解码 / 转码 / loudnorm，未启用 GPL 组件",url:"https://ffmpeg.org/legal.html"}],yp=[{label:"本项目",value:"Apache License 2.0",tone:"ok",desc:"可自由使用、修改、分发（含商用），需保留版权与许可声明，并附带变更说明。仓库根目录的 LICENSE 是完整协议文本。"},{label:"内嵌 FFmpeg",value:"LGPL-2.1-or-later",tone:"note",desc:"以独立可执行文件形式随应用解包到数据目录，用户可以直接替换；本应用未修改 FFmpeg 源码。详见 internal/ffmpeg/bin/FFMPEG-LICENSE.txt。"},{label:"第三方库",value:"MIT / BSD / ISC",tone:"note",desc:"均为宽松许可证，允许在 Apache-2.0 项目中使用；完整清单与版本见下方表格。"}],_p=[{name:"LRCLIB",role:"歌词（无需鉴权的开放歌词库）",url:"https://lrclib.net/"},{name:"网易云音乐",role:"歌词 / 封面备选来源",url:"https://music.163.com/"},{name:"QQ 音乐",role:"歌词 / 封面备选来源",url:"https://y.qq.com/"},{name:"iTunes Search API",role:"封面（Apple 官方公开接口）",url:"https://performance-partners.apple.com/search-api"},{name:"Deezer",role:"封面备选来源",url:"https://developers.deezer.com/api"},{name:"MusicBrainz",role:"封面（配合 Cover Art Archive）",url:"https://musicbrainz.org/"},{name:"哔哩哔哩",role:"在线试听与下载（公开 Web 接口）",url:"https://www.bilibili.com/"}],wp=[{title:"开源社区",body:"Go、Wails、Lit、Vite、FFmpeg 以及上面列出的每一个库 —— 没有它们，这个播放器不会存在。"},{title:"FFmpeg 项目",body:"让「放不出来的格式」有了统一的解法；EBU R128 响度测量也建立在它的 loudnorm 滤镜之上。"},{title:"数据服务提供方",body:"LRCLIB、网易云音乐、QQ 音乐、Apple、Deezer、MusicBrainz、哔哩哔哩 提供了歌词与封面等公开数据。本项目的调用均来自官方或公开接口，版权归各自权利人所有。"},{title:"每一位反馈者",body:"界面细节、格式兼容性、性能问题的每一条反馈都直接变成了代码里的修复。"}],$p=["本软件只做本地音乐的整理与播放，不提供、不存储、不分发任何音乐内容。","在线搜索 / 试听 / 下载依赖第三方公开接口，其可用性与内容均由对应平台决定。","自动匹配的封面与歌词来自公开曲库，不保证与歌曲完全对应，请自行核对后再写回文件。"];function kp(t){const e=String(t?.version||"").trim();return!e||e==="—"?String(t?.name||""):`${t.name} ${e}`}function Sp(){return[...gp.map(t=>({...t,kind:"运行时"})),...vp.map(t=>({...t,kind:"随 Wails 引入"}))]}function xp(t){const e=new Map;for(const n of t)e.set(n.license,(e.get(n.license)||0)+1);return[...e.entries()].sort((n,a)=>a[1]-n[1]||n[0].localeCompare(a[0])).map(([n,a])=>({license:n,count:a}))}const yt=[{id:"library",label:"曲库"},{id:"appearance",label:"外观"},{id:"player",label:"播放器"},{id:"data",label:"数据"},{id:"ai",label:"AI"},{id:"other",label:"其他"},{id:"about",label:"关于"}],Cp=[{value:-14,label:"较响（流媒体常见）"},{value:-16,label:"推荐（默认）"},{value:-18,label:"温和"},{value:-23,label:"广播级"}],Tp=[{value:"off",label:"关闭"},{value:"track",label:"逐曲均衡"},{value:"album",label:"同专辑统一"}];function L({label:t,hint:e,control:n}){return p` <div class="setting">
    <div class="setting__main">
      <div class="setting__label">${t}</div>
      ${e?p`<div class="setting__hint">${e}</div>`:F}
    </div>
    <div class="setting__control">${n}</div>
  </div>`}function Z(t,e,n){return p`<button
    class="switch"
    type="button"
    role="switch"
    aria-checked=${String(!!e)}
    data-toggle=${t}
    aria-label=${n}
  ></button>`}function Ee(t,e,n){return p` <div class="segmented" data-segment=${t}>
    ${e.map(a=>p`<button
          class="segmented__btn"
          type="button"
          data-value=${a.value}
          aria-pressed=${String(String(a.value)===String(n))}
        >
          ${a.label}
        </button>`)}
  </div>`}function Ep(t){const e=t.aiVendor||"auto",n=jr(e),a="开启后模型会先推理再给结论，响应更慢；关闭则直接作答";return e==="auto"?a+"；自动识别："+(n||"按接口地址与模型名判断厂商"):n?a+"；该厂商："+n:a}function Fn(t,e,n){return p` <div class="rangeslider">
    <div class="slider" id=${t} role="slider" tabindex="0" aria-label=${n} data-slider=${e}>
      <div class="slider__rail"><div class="slider__fill"></div></div>
      <div class="slider__thumb"></div>
      <div class="slider__bubble"></div>
    </div>
    <!-- 数值由滑杆自己写（见 sliderOptions 的 onChange）：同一个节点只允许一个写入方 -->
    <span class="rangeslider__value"></span>
  </div>`}class Ip extends be{static deps=e=>[e.settingsOpen,e.settingsRev,e.settingsSection,e.view,e.folders,e.filterRules,e.songs,e.allSongsRaw,e.lastScan?.at??0,e.scanning,xl(),io(),e.config,e.coverProviders,e.coverBreaker,e.coverCache,e.loudnessState,e.ffmpegState,e.backdropState];constructor(){super(),this._activeSection=yt[0].id,this._navPausedUntil=0,this._navResumeTimer=null,this._sliders=new WeakMap}get open(){return xr()}get panelEl(){return this.querySelector("#settings-layer")}updated(){const e=this.panelEl;if(e){if(this.open){if(this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden){e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{this.open&&(e.dataset.state="opened")});const n=this.querySelector(".settings-layer__body");n&&(n.scrollTop=0)}this.bindSliders(),uu();return}e.hidden||(e.dataset.state="closed",!this._closeTimer&&(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!this.open&&e&&(e.hidden=!0)},Hs()+40)))}}onConnected(){this._onScrollCapture=e=>this.onScroll(e),this.addEventListener("scroll",this._onScrollCapture,!0)}onDisconnected(){this._onScrollCapture&&(this.removeEventListener("scroll",this._onScrollCapture,!0),this._onScrollCapture=null),this._navResumeTimer&&clearTimeout(this._navResumeTimer),this._navResumeTimer=null}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),this._closeTimer=null,super.disconnectedCallback()}render(){return Yi(),p`
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
              class="settings-layer__close"
              type="button"
              data-settings-close
              aria-label="关闭设置"
              @click=${()=>ta()}
            >
              ${f("close")}
            </button>
          </div>
          <div class="settings-layer__body">
            <div class="settings">
              <div class="settings__nav" role="tablist">
                ${yt.map(e=>p`<button
                      class="settings__nav-item"
                      type="button"
                      role="tab"
                      data-goto=${e.id}
                      aria-selected=${String(e.id===this._activeSection)}
                    >
                      ${e.label}
                    </button>`)}
              </div>
              ${this.foldersCard()} ${this.rulesCard()} ${this.themeCard()} ${this.playerCard()}
              ${this.playbackCard()} ${this.lyricsCard()} ${this.loudnessCard()} ${this.onlineCard()} ${this.aiCard()}
              ${this.systemCard()} ${this.aboutCard()} ${this.techCard()}
              ${this.libsCard()} ${this.licenseCard()} ${this.creditsCard()}
            </div>
          </div>
        </div>
      </section>
    `}foldersCard(){const e=i.folders.length?i.folders.map(n=>{const a=n.status==="ok"?p`<span class="chip chip--ok"
                  ><i class="chip__dot"></i>${n.watching?"监听中":"已停止监听"}</span
                >`:n.status==="missing"?p`<span class="chip chip--error"><i class="chip__dot"></i>路径不存在</span>`:p`<span class="chip chip--warn"><i class="chip__dot"></i>无访问权限</span>`,s=i.songs.filter(r=>r.path.startsWith(n.path)).length;return p` <div class="pathrow" data-folder=${n.id}>
            <svg class="pathrow__icon" aria-hidden="true"><use href="#i-folder"></use></svg>
            <div class="pathrow__main">
              <div class="pathrow__path u-selectable" title=${n.path}>${n.path}</div>
              <div class="pathrow__meta">${a}<span>${D(s)} 首</span></div>
            </div>
            <button class="btn btn--ghost btn--sm" type="button" data-act="rescan-folder" data-id=${n.id}>
              ${f("refresh")}<span>重新扫描</span>
            </button>
            <button
              class="btn btn--ghost btn--sm"
              type="button"
              data-act="remove-folder"
              data-id=${n.id}
              aria-label="移除文件夹"
            >
              ${f("trash")}
            </button>
          </div>`}):p`<div class="setting__hint">还没有添加音乐文件夹。</div>`;return p` <section class="card" id="sec-folders" data-section="library">
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
        ${e}
        <div class="setting setting--group-start">
          <div class="setting__main">
            <div class="setting__label">启动时自动扫描</div>
            <div class="setting__hint">应用启动后在后台增量扫描一次</div>
          </div>
          <div class="setting__control">
            ${Z("autoScanOnStart",i.config.autoScanOnStart,"启动时自动扫描")}
          </div>
        </div>
        ${L({label:"实时监听文件夹变化",hint:"新增、删除、重命名文件后自动更新曲库（需要后端文件监听）",control:Z("watchFolders",i.config.watchFolders,"实时监听")})}
        ${L({label:"元数据并发读取",hint:"同时解析的音频文件数量，机械硬盘建议调低",control:Ee("scanConcurrency",[2,4,8].map(n=>({value:String(n),label:`${n}`})),String(i.config.scanConcurrency))})}
      </div>
      <div class="card__foot">
        <span>支持格式：mp3 · flac · wav · m4a · ogg · aac（ape / wma 需转码）</span>
        <span class="u-num">${D(i.folders.length)} 个文件夹</span>
      </div>
    </section>`}ruleRow(e){const n=e.type==="regex"&&e.value&&!ol(e.value);return p` <div class="rule" data-rule=${e.id} data-enabled=${String(e.enabled)}>
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
        ${e.type==="size"?[["lt","小于"],["lte","小于等于"],["gt","大于"],["gte","大于等于"],["eq","等于"]].map(([a,s])=>p`<option value=${a} ?selected=${e.op===a}>${s}</option>`):p`<option value="match" ?selected=${e.op==="match"}>匹配</option>`}
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
    </div>`}rulesCard(){const{kept:e,excluded:n,total:a}=_r(i.allSongsRaw,i.filterRules);return p` <section class="card" id="sec-filters" data-section="library">
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
        ${i.filterRules.length?i.filterRules.map(s=>this.ruleRow(s)):p`<div class="setting__hint">还没有规则。下面的预置规则可以一键添加。</div>`}
        <div class="rule__preview">
          当前规则下：共扫描 <b>${D(a)}</b> 个文件，保留 <b>${D(e.length)}</b> 首，过滤掉
          <b>${D(n)}</b> 个
        </div>
      </div>
      <div class="card__foot">
        <span>「排除」优先于「仅包含」；支持正则表达式（忽略大小写）</span>
        <span>大小单位在数值后填写，默认字节</span>
      </div>
    </section>`}themeCard(){const e=ba(),n=Yi(),a=window.matchMedia("(prefers-color-scheme: dark)").matches;return p` <section class="card" id="sec-appearance" data-section="appearance">
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
        ${e.map(s=>{const r=i.config.theme===s.id;return p` <div class="themecard" data-active=${String(r)}>
            <!-- 卡片本体是一个 button：点它换主题。
                     删除按钮必须放在它**外面**（HTML 不允许 button 套 button）。 -->
            <button
              class="themecard__pick"
              type="button"
              data-act="theme-pick"
              data-id=${s.id}
              aria-pressed=${String(r)}
              aria-label=${`使用主题 ${s.name}`}
            >
              <span class="themecard__swatch">${n(s).map(o=>p`<i data-swatch=${o}></i>`)}</span>
              <span class="themecard__name">${s.name}</span>
              <span class="themecard__id">${s.id}.css</span>
            </button>
            ${s.builtin?p`<span class="themecard__badge">内置</span>`:p`<button
                    class="carddel"
                    type="button"
                    data-act="theme-remove"
                    data-id=${s.id}
                    data-name=${s.name}
                    data-tip="移除主题"
                    aria-label=${`移除主题 ${s.name}`}
                  >
                    ${f("trash")}<span>移除</span>
                  </button>`}
          </div>`})}
        <button class="themes__add" type="button" data-act="theme-help">
          ${f("plus")}
          <span>添加自定义主题</span>
          <span class="u-num u-fs-xs">用 AI 写一个，或导入现成的 CSS</span>
        </button>
      </div>
      <div class="card__body">
        ${L({label:"深浅色模式",hint:`当前系统偏好：${a?"深色":"浅色"}`,control:Ee("themeMode",[{value:"dark",label:"深色"},{value:"light",label:"浅色"},{value:"system",label:"跟随系统"}],i.config.themeMode)})}
        ${L({label:"毛玻璃模糊强度",hint:"控制面板背后内容的模糊程度",control:Fn("set-blur","glassBlur","模糊强度")})}
        ${L({label:"面板不透明度",hint:"面板背景的透明程度，数值越大越透",control:Fn("set-alpha","glassAlpha","不透明度")})}
        ${L({label:"界面动画",hint:"关闭后取消过渡与旋转动画，低性能设备更流畅",control:Z("animations",i.config.animations,"界面动画")})}
        ${L({label:"过渡速度",hint:"弹出层、菜单、面板的进出动画时长；默认快速 0.25 秒",control:Ee("animationsSpeed",jd,i.config.animationsSpeed||"fast")})}
        ${L({label:"主题色跟随封面",hint:"从当前封面提取主色调，作为界面主题色",control:Z("accentFromCover",i.config.accentFromCover,"主题色跟随封面")})}
        ${L({label:"显示专辑列",hint:"窄窗口下会自动隐藏该列",control:Z("showAlbumColumn",i.config.showAlbumColumn,"显示专辑列")})}
        ${L({label:"列表密度",hint:"对「本地歌曲」「播放列表」「歌单」三个列表同时生效",control:Ee("listDensity",Hd,i.config.listDensity||"cozy")})}
      </div>
    </section>`}systemCard(){return p` <section class="card" id="sec-system" data-section="other">
      <div class="card__head">
        <div class="card__icon">${f("options")}</div>
        <div class="card__titles">
          <div class="card__title">窗口与系统</div>
          <div class="card__desc">窗口材质、圆角与关闭行为；这些设置与系统能力相关，部分改动需要重启应用</div>
        </div>
      </div>
      <div class="card__body">
        ${L({label:"窗口原生材质",hint:"用系统原生的半透明材质当窗口底色（桌面壁纸会透出来）。Windows 11 较新版本效果最完整，旧版本会自动降级。改动后需要重启应用",control:p` <div class="select">
            <select class="select__field" data-act="backdrop-mode" aria-label="窗口原生材质">
              ${Vr.map(e=>p`<option value=${e} ?selected=${(i.config.nativeBackdrop||"off")===e}>
                    ${Qn(e)}
                  </option>`)}
            </select>
            <svg class="select__icon"><use href="#i-chevron-down"></use></svg>
          </div>`})}
        ${this.backdropNote()}
        ${L({label:"窗口圆角",hint:"主窗口四角的圆角幅度。圆角由系统绘制，只有这几档（仅 Windows 11 有效）",control:Ee("windowCorners",Ud,i.config.windowCorners||"system")})}
        ${L({label:"关闭时最小化到托盘",hint:"打开后点关闭按钮只把窗口收进系统托盘（任务栏右下角），音乐照常播放；要真正退出请用托盘图标的右键菜单",control:Z("minimizeToTray",i.config.minimizeToTray,"关闭时最小化到托盘")})}
      </div>
    </section>`}backdropNote(){const e=i.backdropState||{},n=e.active||"off",a=i.config.nativeBackdrop||"off",s=a!==n,r=[];return e.preview?r.push("浏览器预览里没有原生窗口，材质只在打包后的应用里能看到。"):(r.push(p`窗口当前生效：<b>${Qn(n)}</b>`),!e.supported&&a!=="off"&&r.push("当前系统不支持原生材质，会退化为普通的背景模糊。"),s&&r.push(p`已保存为 <b>${Qn(a)}</b>，重启应用后生效。`)),p` <div class="setting setting--stack">
      <div class="setting__hint">${r.map((o,l)=>p`${l?p`<br />`:F}${o}`)}</div>
      ${s&&!e.preview?p`<div class="card__actions">
              <button class="btn btn--sm" type="button" data-act="backdrop-restart">
                ${f("refresh")}<span>立即重启应用</span>
              </button>
            </div>`:F}
    </div>`}playerCard(){const e=ha(),n=ao();return p` <section class="card" id="sec-player" data-section="appearance">
      <div class="card__head">
        <div class="card__icon">${f("disc")}</div>
        <div class="card__titles">
          <div class="card__title">播放界面样式</div>
          <div class="card__desc">
            内置 ${e.filter(a=>a.builtin).length} 款样式；把第三方样式包放进样式目录即可使用
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
        ${e.map(a=>{const s=i.config.playerViewMode===a.id;return p` <div class="skincard" data-active=${String(s)}>
            <button
              class="skincard__pick"
              type="button"
              data-act="skin-pick"
              data-id=${a.id}
              aria-pressed=${String(s)}
              aria-label=${`使用样式 ${a.name}`}
            >
              <span class="skincard__icon">${f(a.icon||"disc")}</span>
              <span class="skincard__name">${a.name}</span>
              <span class="skincard__id">${a.id}</span>
            </button>
            ${a.builtin?F:p`<span class="skincard__badge">第三方</span>
                    <button
                      class="carddel"
                      type="button"
                      data-act="skin-remove"
                      data-id=${a.id}
                      data-name=${a.name}
                      data-tip="移除样式"
                      aria-label=${`移除样式 ${a.name}`}
                    >
                      ${f("trash")}<span>移除</span>
                    </button>`}
          </div>`})}
        <button class="themes__add" type="button" data-act="skin-help">
          ${f("plus")}
          <span>自定义样式</span>
          <span class="u-num u-fs-xs">用 AI 帮你写一个</span>
        </button>
      </div>
      ${n.length?p`<div class="card__body">
              ${n.map(a=>p` <div class="setting">
                    <div class="setting__main">
                      <div class="setting__label">样式「${a.id}」加载失败</div>
                      <div class="setting__hint">${a.reason}</div>
                    </div>
                  </div>`)}
            </div>`:F}
      <div class="card__body">
        ${L({label:"封面轮播",hint:"一首歌有多张封面时，播放详情页按下面的间隔轮换显示（不影响列表缩略图）",control:Z("coverCarousel",i.config.coverCarousel===!0,"封面轮播")})}
        ${L({label:"轮播间隔",hint:"每隔多少秒切换一张",control:Fn("set-carousel","coverCarouselInterval","轮播间隔")})}
      </div>
    </section>`}playbackCard(){return p` <section class="card" id="sec-playback" data-section="player">
      <div class="card__head">
        <div class="card__icon">${f("headphones")}</div>
        <div class="card__titles">
          <div class="card__title">播放</div>
          <div class="card__desc">播放模式、随机方式与单击歌曲时的行为</div>
        </div>
      </div>
      <div class="card__body">
        ${L({label:"默认播放模式",hint:"点击底栏循环按钮可随时切换",control:Ee("playMode",[{value:"sequence",label:"列表循环"},{value:"loop-one",label:"单曲循环"},{value:"shuffle",label:"随机"}],i.config.playMode==="loop-all"?"sequence":i.config.playMode)})}
        ${L({label:"随机播放方式",hint:"随机播放会先打乱当前播放列表，再按打乱后的顺序播放",control:Ee("shuffleMode",[{value:"reshuffle",label:"播完重新打乱"},{value:"once",label:"只打乱一次"}],i.config.shuffleMode||"reshuffle")})}
        ${L({label:"记忆音量",hint:"记住上次的音量，下次启动时恢复",control:Z("rememberVolume",i.config.rememberVolume!==!1,"记忆音量")})}
        ${L({label:"保留歌曲播放进度",hint:"记住每首歌上次播到哪儿；退出后重新打开会回到那个位置。只恢复进度条，不会自动开始播放",control:Z("resumeProgress",i.config.resumeProgress===!0,"保留歌曲播放进度")})}
        ${L({label:"单击歌曲时的行为",hint:p`双击始终是「立即播放这一首」，此设置只影响单击。<br />
            播放：立刻播放这首歌，并加入播放列表；<br />
            播放当前列表：用当前整个列表替换播放队列，从这首歌开始播；<br />
            下一首播放：插到当前歌曲后面，下一次「下一曲」时播放。`,control:Ee("rowClickAction",Wd,i.config.rowClickAction||"next")})}
      </div>
    </section>`}lyricsCard(){return p` <section class="card" id="sec-lyrics" data-section="player">
      <div class="card__head">
        <div class="card__icon">${f("lyrics")}</div>
        <div class="card__titles">
          <div class="card__title">歌词</div>
          <div class="card__desc">歌词来源优先级与显示效果</div>
        </div>
      </div>
      <div class="card__body">
        ${L({label:"歌词来源优先级",hint:"内嵌歌词 → 同目录 .lrc → 歌词缓存 → 在线自动匹配；本地读不到时会自动联网匹配并存入缓存",control:p`<span class="chip"><i class="chip__dot"></i>${Gd()}</span>`})}
        ${L({label:"显示歌词",hint:"关闭后播放界面只显示封面",control:Z("showLyrics",i.config.showLyrics,"显示歌词")})}
        ${L({label:"桌面歌词",hint:"在桌面上显示一行置顶歌词（独立透明窗口，可拖动；底栏「桌面歌词」按钮同效）。位置会被记住；换显示器后如果位置不对，可以在这里重置",control:p` ${Z("showDesktopLyrics",i.config.showDesktopLyrics,"桌面歌词")}
            <button
              class="btn btn--ghost btn--sm"
              type="button"
              data-act="reset-desktop-lyrics-pos"
              data-tip="把桌面歌词窗口移回默认位置并清掉记忆"
            >
              重置位置
            </button>`})}
        ${L({label:"桌面背景歌词",hint:"把播放界面的背景铺满桌面、垫在桌面图标之下，歌词跟着画在上面（与「桌面歌词」二选一；仅 Windows）",control:Z("showDesktopWallpaper",i.config.showDesktopWallpaper,"桌面背景歌词")})}
        ${L({label:"启动时自动启用桌面背景歌词",hint:"开启后，只要退出时背景歌词是开着的，下次启动就会自动恢复；关闭则背景歌词只在本次启动生效，重启后不再自动出现（仍可在这里手动打开）",control:Z("autoStartDesktopWallpaper",i.config.autoStartDesktopWallpaper,"启动时自动启用桌面背景歌词")})}
        ${L({label:"歌词字号",hint:"歌词文字大小，当前播放的那一行会略微放大",control:Fn("set-lyric-size","lyricsFontSize","歌词字号")})}
        ${L({label:"居中高亮行数",hint:"当前行上下各显示的行数",control:Ee("lyricsLines",[3,5,7,9].map(e=>({value:String(e),label:String(e)})),String(i.config.lyricsLines))})}
      </div>
    </section>`}loudnessCard(){const e=i.config,n=i.loudnessState||{},a=n.measured??0,s=n.missing??Math.max(0,i.songs.length-a),r=n.total??i.songs.length,o=n.available!==!1,c=(i.ffmpegState||{}).describe||n.describe||"检测中…";return p` <section class="card" id="sec-loudness" data-section="player">
      <div class="card__head">
        <h2 class="card__title">${f("scale")}<span>响度均衡</span></h2>
        <p class="card__desc">
          让不同来源的歌曲音量听起来一样大。播放到哪首就测哪首，测好后自动记住，下次播放直接用；改动目标响度后会自动重新计算。
        </p>
      </div>

      <div class="setting">
        <div class="setting__label">
          <span>均衡模式</span>
          <small class="u-fs-xs u-dim"
            >逐曲：每首歌都调到相同响度；同专辑：整张专辑用同一次调整，保留专辑内部的强弱对比</small
          >
        </div>
        <div class="setting__control">${Ee("loudnessMode",Tp,e.loudnessMode||"off")}</div>
      </div>

      <div class="setting">
        <div class="setting__label">
          <span>目标响度</span>
          <small class="u-fs-xs u-dim">数值越小整体越轻，推荐用默认档。改动后会自动重新计算</small>
        </div>
        <div class="setting__control">
          <div class="select">
            <select class="select__field" data-act="loudness-target" aria-label="目标响度">
              ${Cp.map(d=>p`<option value=${d.value} ?selected=${Number(e.loudnessTarget)===d.value}>
                    ${d.label}
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
          当前设置下已算好 <b>${a}</b> / ${r}
          首${s?p`，其余 <b>${D(s)}</b> 首会在播放时计算`:"（全部已算好）"}<br />
          响度来源：<b>${o?c:"不可用"}</b>
        </div>
      </div>
    </section>`}onlineCard(){const e=i.config.downloadDir||"（默认：系统音乐目录 / downloads）",n=i.coverProviders||[],a=i.coverBreaker||{},s=n.length?n.map(r=>a[r]?`${Fs(r)}（暂时不可用）`:Fs(r)).join(" · "):"正在读取…";return p` <section class="card" id="sec-online" data-section="data">
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

        ${L({label:"联网获取封面",hint:`在线搜索到的歌曲会自动去公开曲库匹配封面：${s}`,control:Z("onlineCover",i.config.onlineCover!==!1,"联网获取封面")})}
        ${L({label:"把封面/歌词写进歌曲文件",hint:Kd(),control:Z("embedMeta",i.config.embedMeta===!0,"写进歌曲文件")})}

        <div class="setting setting--stack">
          <div class="setting__main">
            <div class="setting__label">把已有缓存补写进文件</div>
            <div class="setting__hint">${Yd()}</div>
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
            <div class="setting__hint">封面与歌词的缓存位置；${li()}</div>
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
      </div>
      <div class="card__foot">
        <span>封面来自公开曲库（iTunes / 网易云 / Deezer / MusicBrainz），匹配结果不保证完全准确</span>
        <button class="btn btn--sm" type="button" data-act="cover-refresh">
          ${f("refresh")}<span>清空封面与歌词缓存</span>
        </button>
      </div>
    </section>`}aiCard(){const e=i.config||{},n=!!e.aiApiKeySet||!!String(e.aiApiKey||"").trim(),a=!!(String(e.aiBaseUrl||"").trim()&&n),s=(r,o,l,c,d="text")=>p` <div class="setting setting--stack">
        <div class="setting__main">
          <div class="setting__label">${r}</div>
          <div class="setting__hint">${o}</div>
        </div>
        <input
          class="input"
          type=${d}
          data-act="ai-field"
          data-key=${l}
          .value=${l==="aiApiKey"?"":e[l]||""}
          placeholder=${l==="aiApiKey"&&n?"已保存（留空则保持不变，输入新值可替换）":c}
          autocomplete="off"
          spellcheck="false"
        />
      </div>`;return p` <section class="card" id="sec-ai" data-section="ai">
      <div class="card__head">
        <div class="card__icon">${f("settings")}</div>
        <div class="card__titles">
          <div class="card__title">AI 相关</div>
          <div class="card__desc">自动匹配歌词 / 封面时，用 AI 从文件名中还原歌曲信息</div>
        </div>
      </div>
      <div class="card__body">
        ${s("接口地址（Base URL）","OpenAI 兼容接口，例如 https://api.openai.com/v1","aiBaseUrl","https://api.openai.com/v1")}
        ${s("API Key","只写入本地配置，不会发往该接口以外的任何地方","aiApiKey","sk-...","password")}
        ${s("模型 ID","例如 gpt-4o-mini、deepseek-chat；留空默认 gpt-4o-mini","aiModelId","gpt-4o-mini")}
        ${L({label:"模型类型",hint:"不同厂商对思考模式的支持方式不同，选错会导致这个开关不生效；选「自动识别」可自动判断",control:p` <select class="select__field" data-act="ai-vendor" aria-label="模型类型">
            ${ei.map(r=>p`<option value=${r.id} ?selected=${r.id===(e.aiVendor||"auto")}>${r.label}</option>`)}
          </select>`})}
        ${L({label:"启用思考模式",hint:Ep(e),control:Z("aiThinking",!!e.aiThinking,"启用思考模式")})}
        ${L({label:"自动匹配歌词时使用 AI 清洗元数据",hint:"自动匹配歌词前先用 AI 从文件名里还原真实的标题 / 歌手。AI 一次调用可能要十几秒，关掉后只做本地整理：匹配更快，但文件名不规范时命中率会低一些",control:Z("aiLyricsClean",i.config.aiLyricsClean!==!1,"自动匹配歌词时使用 AI 清洗元数据")})}
        <div class="setting__hint">
          ${a?"已配置：自动匹配封面时，会先把文件名与现有元数据交给 AI 清洗，再去匹配。":"尚未配置：填入 Base URL 与 API Key 后自动启用。"}
        </div>
      </div>
    </section>`}aboutCard(){const e=i.appVersion||up,n=i.lastScan,a=i.songs.reduce((r,o)=>r+o.duration,0),s=i.songs.reduce((r,o)=>r+o.size,0);return p` <section class="card" id="sec-about" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("info")}</div>
        <div class="card__titles">
          <div class="card__title">关于 ${rr}</div>
          <div class="card__desc">${dp}</div>
        </div>
      </div>
      <div class="card__body">
        <div class="about-hero">
          <div class="about-hero__main">
            <div class="about-hero__title">
              <span class="about-hero__name">${rr}</span>
              <span class="about-hero__version">v${e}</span>
              <span class="chip chip--ok"><i class="chip__dot"></i>${pp}</span>
            </div>
            <div class="about-hero__meta">${cp} · ${lp}</div>
            <div class="about-hero__meta">${fp}</div>
          </div>
          <div class="about-hero__links">
            ${hp.map(r=>p`<button
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
          <div class="kv__v">${D(i.allSongsRaw.length)} 个</div>
          <div class="kv__k">过滤后歌曲</div>
          <div class="kv__v">${D(i.songs.length)} 首</div>
          <div class="kv__k">被规则过滤</div>
          <div class="kv__v">${D(n?.excluded??0)} 个</div>
          <div class="kv__k">总时长</div>
          <div class="kv__v">${Math.floor(a/36e5)} 小时 ${Math.floor(a%36e5/6e4)} 分</div>
          <div class="kv__k">占用空间</div>
          <div class="kv__v">${Wo(s)}</div>
          <div class="kv__k">上次扫描</div>
          <div class="kv__v">${n?new Date(n.at).toLocaleString("zh-CN"):"—"}</div>
          <div class="kv__k">缓存目录</div>
          <div class="kv__v">${i.config.cacheDir}</div>
        </div>
      </div>
      <div class="card__foot">
        <span>版本号来自后端常量（services_app.go#appVersion），与安装包元数据同源</span>
      </div>
    </section>`}techCard(){return p` <section class="card" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("bolt")}</div>
        <div class="card__titles">
          <div class="card__title">技术栈</div>
          <div class="card__desc">这个播放器由哪些技术搭起来</div>
        </div>
      </div>
      <div class="card__body">
        ${mp.map(e=>p` <div class="about-row">
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
    </section>`}libsCard(){const e=Sp(),n=xp(e).map(a=>`${a.license} × ${a.count}`).join(" · ");return p` <section class="card" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("options")}</div>
        <div class="card__titles">
          <div class="card__title">开源依赖</div>
          <div class="card__desc">随程序一起分发的第三方库；点名字可以打开它的仓库</div>
        </div>
      </div>
      <div class="card__body">
        <div class="libtable">
          <div class="libtable__head">
            <span>库 / 版本</span><span>许可证</span><span>用途</span>
          </div>
          ${e.map(a=>p` <div class="libtable__row">
              <div class="libtable__cell libtable__cell--name">
                <button class="linkbtn" type="button" data-act="about-open-url" data-url=${a.url} title=${a.url}>
                  <span>${a.name}</span>${f("external")}
                </button>
                <span class="libtable__version">${a.version}</span>
              </div>
              <div class="libtable__cell"><span class="tagchip">${a.license}</span></div>
              <div class="libtable__cell libtable__cell--role">
                <span class="libtable__kind">${a.kind}</span>${a.role}
              </div>
            </div>`)}
        </div>
        ${bp.map(a=>p` <div class="about-note">
            <div class="about-note__title">
              <span>${kp(a)}</span><span class="tagchip tagchip--warn">${a.license}</span>
            </div>
            <div class="about-note__body">${a.role}</div>
            <button class="linkbtn" type="button" data-act="about-open-url" data-url=${a.url} title=${a.url}>
              <span>FFmpeg 许可说明</span>${f("external")}
            </button>
          </div>`)}
      </div>
      <div class="card__foot">
        <span>${n}</span>
      </div>
    </section>`}licenseCard(){return p` <section class="card" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("scale")}</div>
        <div class="card__titles">
          <div class="card__title">开源协议</div>
          <div class="card__desc">你可以对这份代码做什么</div>
        </div>
      </div>
      <div class="card__body">
        ${yp.map(e=>p` <div class="about-note">
            <div class="about-note__title">
              <span>${e.label}</span>
              <span class=${e.tone==="ok"?"tagchip tagchip--ok":"tagchip"}>${e.value}</span>
            </div>
            <div class="about-note__body">${e.desc}</div>
          </div>`)}
      </div>
      <div class="card__foot">
        <span>第三方许可证的完整文本随仓库分发（见 THIRD-PARTY-NOTICES.md）</span>
        <button class="btn btn--sm" type="button" data-act="about-open-url" data-url="https://www.apache.org/licenses/LICENSE-2.0">
          ${f("external")}<span>阅读 Apache-2.0</span>
        </button>
      </div>
    </section>`}creditsCard(){return p` <section class="card" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("heart")}</div>
        <div class="card__titles">
          <div class="card__title">参考与致谢</div>
          <div class="card__desc">在线能力所依赖的公开数据来源，以及要感谢的人</div>
        </div>
      </div>
      <div class="card__body">
        <div class="about-subtitle">在线数据来源</div>
        ${_p.map(e=>p` <div class="about-row">
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
        ${wp.map(e=>p` <div class="about-note">
            <div class="about-note__title"><span>${e.title}</span></div>
            <div class="about-note__body">${e.body}</div>
          </div>`)}
      </div>
      <div class="card__foot card__foot--stack">
        ${$p.map(e=>p`<span>· ${e}</span>`)}
      </div>
    </section>`}async onClick(e){if(e.target.closest("[data-settings-close]")||e.target===this.panelEl){ta();return}const n=e.target.closest("[data-goto]")?.dataset.goto;if(n){this.scrollToSection(n);return}const a=e.target.closest("[data-toggle],[data-segment] .segmented__btn");if(a){pu(a,{commit:x})&&an(),this.requestUpdate();return}const s=e.target.closest("[data-act]");s&&(await ma(s,{commit:x,render:()=>{i.settingsRev=(i.settingsRev||0)+1,x()},rescan:()=>bn({manual:!0})}),an())}async onChange(e){if(e.target.dataset.act)try{await ma(e.target,{commit:x,render:()=>{i.settingsRev=(i.settingsRev||0)+1,x()},rescan:()=>bn({manual:!0})}),an(),this.requestUpdate()}catch(a){console.error("[settings] 处理下拉框失败",a),u(`设置未生效：${a?.message??a}`,{tone:"error",duration:5e3})}}onInput(e){if(e.target.dataset.act!=="rule-value")return;const n=i.filterRules.find(a=>a.id===e.target.dataset.id);n&&(n.value=e.target.value,x(),this.requestUpdate())}onScroll(e){const n=e.target;if(!n.classList?.contains("settings-layer__body"))return;if(this._navPausedUntil){this.deferNavResume();return}const a=n.getBoundingClientRect().top+80;let s=yt[0].id;for(const r of yt){const o=this.querySelector(`[data-section="${r.id}"]`);o&&o.getBoundingClientRect().top<=a&&(s=r.id)}n.scrollHeight>n.clientHeight+2&&n.scrollTop+n.clientHeight>=n.scrollHeight-2&&(s=yt[yt.length-1].id),s!==this._activeSection&&(this._activeSection=s,this.paintNav())}paintNav(){for(const e of this.querySelectorAll(".settings__nav-item"))e.setAttribute("aria-selected",String(e.dataset.goto===this._activeSection))}deferNavResume(){clearTimeout(this._navResumeTimer),this._navResumeTimer=setTimeout(()=>{this._navResumeTimer=null,this._navPausedUntil=0},140)}scrollToSection(e){const n=this.querySelector(`[data-section="${e}"]`),a=this.querySelector(".settings-layer__body");if(!n||!a)return;this._activeSection=e,this.paintNav(),this._navPausedUntil=1,this.deferNavResume();const s=this.querySelector(".settings__nav"),r=s?s.offsetHeight:0,o=n.getBoundingClientRect().top-a.getBoundingClientRect().top,l=Math.max(0,a.scrollTop+o-r-8);a.scrollTo({top:l,behavior:"smooth"})}bindSliders(){for(const e of this.querySelectorAll("[data-slider]")){const n=e.dataset.slider;if(!n)continue;let a=this._sliders.get(e);if(!a){a=pt(e,this.sliderOptions(e,n)),this._sliders.set(e,a);const s=e.parentElement.querySelector(".rangeslider__value");s&&(s.textContent=a.text(this.sliderValue(n)))}a.set(this.sliderValue(n),{silent:!0})}}sliderOptions(e,n){const a=n==="glassBlur",s=n==="glassAlpha",r=n==="coverCarouselInterval",o=r?2:n==="lyricsFontSize"?12:a?0:s?20:0,l=r?60:n==="lyricsFontSize"?26:a?48:s?95:100,c=r?" 秒":a?"px":s?"%":"px";return{min:o,max:l,step:1,value:this.sliderValue(n),format:d=>`${Math.round(d)}${c}`,onChange:d=>{i.config[n]=d;const g=e.parentElement.querySelector(".rangeslider__value");g&&(g.textContent=`${Math.round(d)}${c}`),a&&(i.config.glassBlurCustom=!0,dt("--glass-blur",`${d}px`)),s&&(i.config.glassAlphaCustom=!0,Ys(d)),n==="lyricsFontSize"&&dt("--lyric-size",`${d}px`)},onCommit:()=>x()}}sliderValue(e){return e==="glassBlur"?i.config.glassBlurCustom?i.config.glassBlur:ks():e==="glassAlpha"?i.config.glassAlphaCustom?i.config.glassAlpha:$s():i.config[e]??0}}ae("mp-settings-layer",Ip);class Dp extends be{static deps=e=>[e.floatingLyrics?.show,e.floatingLyrics?.text];render(){const e=i.floatingLyrics||{show:!1,text:""};return p`
      <div class="desktop-lyrics" id="desktop-lyrics" ?hidden=${!e.show} aria-hidden="true">
        <div class="desktop-lyrics__line" id="desktop-lyrics-line">${e.text}</div>
      </div>
    `}}ae("mp-floating-lyrics",Dp);class Ap extends be{static deps=e=>[e.playerOpen,e.scanning,e.scanText,e.config.listDensity];updated(){const e=document.documentElement,n=i.config.listDensity||"cozy";e.dataset.density!==n&&(e.dataset.density=n)}render(){return p`
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
    `}}ae("mp-app",Ap);let pn="";const fs=new Map,zn=new Map;function Mp(){const t=new Image;return t.decoding="async",t.alt="",t}function Pp(t){return!i.config.accentFromCover||!vn(t)?!1:t!==pn}function Lo(t){if(!vn(t))return Promise.resolve("");if(fs.has(t))return Promise.resolve(fs.get(t));if(zn.has(t))return zn.get(t);const e=new Promise(n=>{const a=o=>{fs.set(t,o),zn.delete(t),n(o)},s=document.getElementById("bar-cover-img");if(s&&s.getAttribute("src")===t&&s.complete&&s.naturalWidth>0){a(Rt($i(s)));return}const r=Mp();r.addEventListener("load",()=>a(vn(t)?Rt($i(r)):"")),r.addEventListener("error",()=>a("")),r.src=t});return zn.set(t,e),e}async function Ro(t){t&&ql(t,t)&&(await an(),await Pe(i.config))}async function Op(){if(!i.config.accentFromCover||Rt(i.config.coverSeed))return;const t=i.currentId?Ze(i.currentId):null,e=t?mt(t):"";e&&(pn=e,await Ro(await Lo(e)))}function Lp(t){if(!i.config.accentFromCover){pn="";return}if(t){if(!vn(t)){pn=t;return}Pp(t)&&(pn=t,Lo(t).then(Ro))}}function Rp(t){Nl(vn(t)?t:"")}let or="";function Np(t){return[i.currentId??"",i.playing?1:0,Math.round((i.position||0)/250),i.duration||0,i.volume,i.muted?1:0,i.config.loudnessMode||"off",Tn()?1:0,En()?1:0,Math.round(Number(i.config.lyricsFontSize)||16),t].join("|")}function lr(){const t=i.currentId?Ze(i.currentId):null,e=t?mt(t):"",n=Np(e);n!==or&&(or=n,Wc(),yn(),Tn()&&(i.playing&&pa(),td({text:i.playing?ld():"",playing:!!i.playing,fontSize:Math.round((Number(i.config.lyricsFontSize)||16)*1.5)})),En()&&(i.playing&&pa(),Bs()),Lp(e),Rp(e))}function qp(){ll(lr),lr()}const fn=document.getElementById("boot-splash"),Wn=document.getElementById("boot-splash__frame");function cr(){fn&&(fn.dataset.hasframe="1")}Wn&&(Wn.complete?Wn.naturalWidth>0&&cr():Wn.addEventListener("load",cr,{once:!0}));let dr=!1;function Bp(){dr||(dr=!0,fetch("/boot/reveal",{cache:"no-store",keepalive:!0}).catch(()=>{}),m.windowReady().catch(()=>{}))}let ur=!1;function No(){ur||!fn||(ur=!0,fn.dataset.hide="1",setTimeout(()=>fn.remove(),400))}Bp();setTimeout(No,12e3);const rt=new Map;async function Fp(){await ya(),await Op(),await Pe(i.config),window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",async()=>{i.config.themeMode==="system"&&(await Pe(i.config),x())})}async function zp(){if($())try{const t=await m.coverCachedSets();if(!t||typeof t!="object")return;wr(t);const e=Object.keys(t).length;e&&console.info(`[cover] 已从缓存回填 ${e} 首歌的封面（含多封面）`)}catch(t){console.info("[cover] 封面缓存回填跳过",t?.message??t)}}function Wp(){document.addEventListener("keydown",t=>{const e=t.target.tagName,n=e==="INPUT"||e==="TEXTAREA"||e==="SELECT"||t.target.isContentEditable;if(t.key==="Escape"){if(document.getElementById("modal-backdrop")?.hidden===!1)return;fl(),i.playerOpen&&Ea();return}if(!n)switch(t.key){case" ":t.preventDefault(),$n();break;case"ArrowRight":t.ctrlKey||t.metaKey?mn(!1):ua(i.position+5e3);break;case"ArrowLeft":t.ctrlKey||t.metaKey?js():ua(i.position-5e3);break;case"ArrowUp":t.preventDefault(),bs(i.volume+.05);break;case"ArrowDown":t.preventDefault(),bs(i.volume-.05);break;case"l":case"L":i.currentId&&va(i.currentId);break;case"p":case"P":qs();break;case"f":case"F":Up();break}})}async function Up(){if($()){const t=!document.fullscreenElement;await m.windowSetFullscreen(t);return}document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen().catch(()=>{})}function Hp(){K("scan:start",()=>{i.scanning=!0,i.scanText="正在扫描音乐文件夹…",x()}),K("scan:progress",t=>{t&&(t.phase==="walk"?i.scanText="正在遍历音乐文件夹…":t.total&&(i.scanText=`正在读取元数据 ${t.current} / ${t.total}`),x())}),K("scan:done",async t=>{i.scanning=!1;const e=await m.songs();if(Array.isArray(e)){const a=new Set(i.songs.map(l=>l.id));i.allSongsRaw=e;const{kept:s,excluded:r}=_r(e,i.filterRules);i.songs=s;const o=new Set(s.map(l=>l.id));i.lastScan={at:Date.now(),found:e.length,kept:s.length,excluded:r,added:s.filter(l=>!a.has(l.id)).length,removed:[...a].filter(l=>!o.has(l)).length}}const n=await m.folders();Array.isArray(n)&&(i.folders=n),x(),t?.added&&!t?.firstRun&&u(`文件夹变化：新增 ${t.added} 首`,{tone:"success"})}),K("scan:failed",t=>{i.scanning=!1,x(),u(`扫描失败：${t?.message??"未知错误"}`,{tone:"error",duration:5e3})}),K("theme:changed",t=>{i.config.theme=t,Pe(i.config),x()}),K("player:state",t=>{t&&(typeof t.position=="number"&&(i.position=t.position),typeof t.duration=="number"&&(i.duration=t.duration),typeof t.playing=="boolean"&&(i.playing=t.playing))}),K("cover:changed",async t=>{const e=String(t?.id||"");try{if(!e){const a=await m.coverCachedSets();a&&typeof a=="object"&&wr(a);return}const n=await m.coverList(e);n&&Array.isArray(n.items)&&ys(e,n)}catch(n){console.info("[cover] 同步封面失败",n?.message??n)}}),K("loudness:progress",t=>{t&&(i.loudnessState={...i.loudnessState||{},...t,running:!0},x())}),K("loudness:done",async t=>{i.loudnessState={...i.loudnessState||{},running:!1},x();const e=t?.failed??0;u(e?`响度测量完成：成功 ${t?.done-e} 首，失败 ${e} 首`:`响度测量完成：共 ${t?.done??0} 首`,{tone:e?"warning":"success",duration:4e3}),await un(),await ka()}),K("loudness:failed",t=>{i.loudnessState={...i.loudnessState||{},running:!1},x(),u(`响度测量失败：${t?.message??"未知错误"}`,{tone:"error",duration:6e3})}),K("ffmpeg:ready",t=>{t&&(i.ffmpegState=t,x(),console.info(`[ffmpeg] ${t.available?t.describe:"不可用"}`))}),K("download:progress",t=>{if(!t?.bvid)return;const e=t.title||t.bvid,n=Number(t.total)||0,a=Number(t.done)||0,s=n>0?Math.round(a/n*100):0,r=n>0?`下载中 ${s}% · ${e}`:`下载中 ${e}`;rt.has(t.bvid)?rt.get(t.bvid).update(r):rt.set(t.bvid,u(r,{duration:0}))}),K("download:done",t=>{const e=rt.get(t?.bvid);rt.delete(t?.bvid);const n=`已下载：${t?.title||t?.bvid} → ${t?.path||t?.dir||""}`;e?e.update(n,"success"):u(n,{tone:"success",duration:5e3}),setTimeout(()=>e?.close(),4e3)}),K("download:failed",t=>{const e=rt.get(t?.bvid);rt.delete(t?.bvid);const n=`下载失败：${t?.message??"未知错误"}`;e?e.update(n,"error"):u(n,{tone:"error",duration:6e3}),setTimeout(()=>e?.close(),6e3)})}function pr(){const t=new URLSearchParams(location.search);if(!t.toString())return;const e=t.get("theme");if(e){i.config.theme=e;const o=ea(e);o?.mode&&(i.config.themeMode=o.mode)}const n=t.get("tab");n==="settings"?i.settingsOpen=!0:n==="queue"?i.view="queue":n==="playlist"&&(i.view="playlist",i.playlistId=t.get("pl")||i.playlists[1]?.id||null);const a=t.get("pv");a&&(i.pvMode=a,i.config.playerViewMode=a),t.get("view")==="player"&&(i.playerOpen=!0),t.get("playing")==="1"&&(i.playing=!0,i.position=Number(t.get("pos")||62e3)),t.get("scan")==="1"&&(i.scanning=!0,setTimeout(()=>{i.scanning=!1,x()},8e3)),t.get("query")&&(i.query=t.get("query"));const s=Number(t.get("songs"));if(!$()&&Number.isFinite(s)&&s>i.songs.length){const o=i.songs.slice(),l=o.slice();for(;l.length<s;){const c=l.length,d=o[c%o.length];l.push({...d,id:`bench_${c}`,path:`C:/bench/${c}.${d.ext||"mp3"}`})}i.songs=l,i.allSongsRaw=l.slice(),x()}const r=t.get("density");r&&["compact","cozy","roomy"].includes(r)&&(i.config.listDensity=r),t.get("album")==="off"&&(i.config.showAlbumColumn=!1)}async function jp(){await dl(),pr();const t=zp();if(await Fp(),dd().then(()=>{xr()&&Wl()}),await Nc(),ul(),Vl(),await Jl(),Id(),Wp(),Hp(),pr(),await Bc(),Fc(),qp(),await t,await Pe(i.config),Ms(),requestAnimationFrame(()=>requestAnimationFrame(No)),await un(),await ka(),pl(),Uo(),window.addEventListener("beforeunload",()=>{an()}),document.body.dataset.ready="true",fetch("/boot/booted",{cache:"no-store",keepalive:!0}).catch(()=>{}),new URLSearchParams(location.search).get("probe")==="1"){const{runProbe:e}=await ht(async()=>{const{runProbe:n}=await import("./probe-BTvxc-Wt.js");return{runProbe:n}},[]);setTimeout(()=>{const n=e();window.__probeReport=n,console.info("[probe]",n)},600)}$()||console.info(`%c浏览器预览模式%c
当前使用假数据渲染界面。接入 Go + Wails3 后端后，同名前端的 store/bridge 会自动改走后端方法。`,"background:#fff;color:#000;padding:2px 6px;border-radius:4px;font-weight:700","color:#888")}jp().catch(t=>{console.error("[app] 启动失败",t),u(`启动失败：${t.message}`,{tone:"error",duration:6e3})});window.addEventListener("unhandledrejection",t=>{const e=t.reason,n=e?.message||String(e||"未知错误");/no backend|preview:/i.test(n)||(console.error("[app] 未处理的异步错误",e),u(n.length>120?`${n.slice(0,120)}…`:n,{tone:"error",duration:6e3}))});window.addEventListener("error",t=>{t.message&&console.error("[app] 运行时错误",t.error||t.message)});window.__app={state:i,commit:x,navigate:Tt,openPlayer:uo,closePlayer:Ea,rescan:fr,doRescan:bn,currentSong:Je,isLiked:Ot,nextIndex:cl,setPlayerViewMode:_n,applyGainForSong:yn};const di=Object.freeze(Object.defineProperty({__proto__:null,closeCoverPanel:nn,openCoverPanel:rp},Symbol.toStringTag,{value:"Module"}));
