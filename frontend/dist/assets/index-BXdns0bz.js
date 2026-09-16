const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/base-CKcVTdc-.js","assets/bridge-BT7w5HFT.js"])))=>i.map(i=>d[i]);
import{i as k,b,f as yo,g as D,h as _t,o as ae,j as Za,D as ds,k as dt,l as We,u as xn,n as ws,q as _o,r as wo,t as $o}from"./bridge-BT7w5HFT.js";import{j as ko,E as mt,s as i,c as x,t as u,a as mn,e as na,r as Da,f as Zi,g as he,d as te,M as me,A as B,h as f,b as p,k as So,p as lt,l as Ne,o as ln,m as ee,n as xo,q as Co,u as To,v as Eo,w as Io,L as qn,x as nt,y as vt,z as Do,B as Ao,C as cn,D as Tt,$ as ei,F as Ge,G as Aa,H as gn,I as Ma,J as Mo,K as Po,N as Oo,O as it,P as dn,Q as sa,R as er,S as Et,T as aa,U as tr,V as us,W as Lo,X as ti,Y as Ro,Z as nr,_ as vn,a0 as sr,a1 as No,a2 as qo,a3 as Bo,a4 as Fo,a5 as ia,a6 as ra,a7 as zo,a8 as ar,a9 as Qt,aa as Wo,ab as Ho,ac as Uo,ad as jo,ae as Vo,af as ir,ag as Go}from"./base-CKcVTdc-.js";import{r as bn,a as It,f as Pa,p as oa,l as Ko,u as Yo,b as jt,s as Xo,c as la,m as Qo,d as ni}from"./index-Dt_8HLcT.js";const Jo="modulepreload",Zo=function(t){return"/"+t},si={},ct=function(e,n,s){let a=Promise.resolve();if(n&&n.length>0){let c=function(d){return Promise.all(d.map(m=>Promise.resolve(m).then(h=>({status:"fulfilled",value:h}),h=>({status:"rejected",reason:h}))))};document.getElementsByTagName("link");const o=document.querySelector("meta[property=csp-nonce]"),l=o?.nonce||o?.getAttribute("nonce");a=c(n.map(d=>{if(d=Zo(d),d in si)return;si[d]=!0;const m=d.endsWith(".css"),h=m?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${d}"]${h}`))return;const y=document.createElement("link");if(y.rel=m?"stylesheet":Jo,m||(y.as="script"),y.crossOrigin="",y.href=d,l&&y.setAttribute("nonce",l),document.head.appendChild(y),m)return new Promise((S,$)=>{y.addEventListener("load",S),y.addEventListener("error",()=>$(new Error(`Unable to preload CSS for ${d}`)))})}))}function r(o){const l=new Event("vite:preloadError",{cancelable:!0});if(l.payload=o,window.dispatchEvent(l),!l.defaultPrevented)throw o}return a.then(o=>{for(const l of o||[])l.status==="rejected"&&r(l.reason);return e().catch(r)})};const el={CHILD:2},Oa=t=>(...e)=>({_$litDirective$:t,values:e});let La=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,n,s){this._$Ct=e,this._$AM=n,this._$Ci=s}_$AS(e,n){return this.update(e,n)}update(e,n){return this.render(...n)}};const{I:tl}=ko,ai=t=>t,ii=()=>document.createComment(""),Ft=(t,e,n)=>{const s=t._$AA.parentNode,a=e===void 0?t._$AB:e._$AA;if(n===void 0){const r=s.insertBefore(ii(),a),o=s.insertBefore(ii(),a);n=new tl(r,o,t,t.options)}else{const r=n._$AB.nextSibling,o=n._$AM,l=o!==t;if(l){let c;n._$AQ?.(t),n._$AM=t,n._$AP!==void 0&&(c=t._$AU)!==o._$AU&&n._$AP(c)}if(r!==a||l){let c=n._$AA;for(;c!==r;){const d=ai(c).nextSibling;ai(s).insertBefore(c,a),c=d}}}return n},Qe=(t,e,n=t)=>(t._$AI(e,n),t),nl={},rr=(t,e=nl)=>t._$AH=e,sl=t=>t._$AH,$s=t=>{t._$AR(),t._$AA.remove()};const ri=(t,e,n)=>{const s=new Map;for(let a=e;a<=n;a++)s.set(t[a],a);return s},Ie=Oa(class extends La{constructor(t){if(super(t),t.type!==el.CHILD)throw Error("repeat() can only be used in text expressions")}dt(t,e,n){let s;n===void 0?n=e:e!==void 0&&(s=e);const a=[],r=[];let o=0;for(const l of t)a[o]=s?s(l,o):o,r[o]=n(l,o),o++;return{values:r,keys:a}}render(t,e,n){return this.dt(t,e,n).values}update(t,[e,n,s]){const a=sl(t),{values:r,keys:o}=this.dt(e,n,s);if(!Array.isArray(a))return this.ut=o,r;const l=this.ut??=[],c=[];let d,m,h=0,y=a.length-1,S=0,$=r.length-1;for(;h<=y&&S<=$;)if(a[h]===null)h++;else if(a[y]===null)y--;else if(l[h]===o[S])c[S]=Qe(a[h],r[S]),h++,S++;else if(l[y]===o[$])c[$]=Qe(a[y],r[$]),y--,$--;else if(l[h]===o[$])c[$]=Qe(a[h],r[$]),Ft(t,c[$+1],a[h]),h++,$--;else if(l[y]===o[S])c[S]=Qe(a[y],r[S]),Ft(t,a[h],a[y]),y--,S++;else if(d===void 0&&(d=ri(o,S,$),m=ri(l,h,y)),d.has(l[h]))if(d.has(l[y])){const _=m.get(o[S]),P=_!==void 0?a[_]:null;if(P===null){const F=Ft(t,a[h]);Qe(F,r[S]),c[S]=F}else c[S]=Qe(P,r[S]),Ft(t,a[h],P),a[_]=null;S++}else $s(a[y]),y--;else $s(a[h]),h++;for(;S<=$;){const _=Ft(t,c[$+1]);Qe(_,r[S]),c[S++]=_}for(;h<=y;){const _=a[h++];_!==null&&$s(_)}return this.ut=o,rr(t,c),mt}}),al=[{id:"dark-minimal",name:"深色 · 黑白极简",mode:"dark",builtin:!0,swatch:["#08080a","#1b1b1f","#3a3a42","#f4f4f6","#ff4d6d"]},{id:"light-minimal",name:"浅色 · 黑白极简",mode:"light",builtin:!0,swatch:["#f2f2f4","#ffffff","#d8d8dd","#14141a","#e8384f"]},{id:"cover-dark",name:"封面取色 · 深色",mode:"dark",builtin:!0,swatch:["#0b0b12","#2a2a31","#6b6b76","#f7f7fa","#ff4d6d"]}],J=al.slice();let or=0;function il(){return or}function ps(){return J}function Yn(t){return J.find(e=>e.id===t)||J[0]}async function fs(){if(!k())return J;try{const t=await b.listThemes();if(!Array.isArray(t)||!t.length)return J;for(const e of t){if(!e?.id)continue;const n=await b.loadTheme(e.id);typeof n=="string"&&n.trim()&&ll(e.id,n)}rl(t)}catch(t){console.warn("[theme] 主题目录扫描失败",t)}return J}function rl(t){const e=[],n=new Set;for(const s of t){if(!s?.id||n.has(s.id))continue;n.add(s.id);const a={id:s.id,name:s.name||s.id,mode:s.mode||"dark",swatch:Array.isArray(s.swatch)?s.swatch:[],builtin:!!s.builtin},r=J.find(o=>o.id===s.id);r?(Object.assign(r,a),e.push(r)):e.push(a)}for(const s of J)e.includes(s)||Da(`theme-file-${s.id}`,"");return J.length=0,J.push(...e),or+=1,J}async function ol(t){return await b.deleteTheme(t),await fs(),{removed:!J.some(n=>n.id===t),themeIds:J.map(n=>n.id)}}function ll(t,e){Da(`theme-file-${t}`,e)}const cl=["--seed","--seed-2","--bg-app","--bg-window"],dl=["--seed","--seed-2"];function ul(t){return document.documentElement.style.getPropertyValue(t).trim()?String(document.documentElement.style.getPropertyValue(t)):null}function pl(){const t=document.documentElement,e={};for(const n of dl){const s=ul(n);s&&(e[n]=s)}for(const n of cl)t.style.removeProperty(n);return e}const Bn="cover-dark";function un(t){return!!t&&!yo(t)}let oi=null,ks=null,Ss=null;async function De(t){const e=document.documentElement,n=window.matchMedia("(prefers-color-scheme: dark)").matches,s=pl();s["--seed"]&&(ks=s["--seed"]),s["--seed-2"]&&(Ss=s["--seed-2"]);let a=t.theme||"dark-minimal";if(t.themeMode==="system"){const h=n?"dark":"light",y=J.find(S=>S.mode===h&&S.id!=="cover-dark");y&&(a=y.id)}else if(J.find(h=>h.id===a)?.mode!==t.themeMode){const h=J.find(y=>y.mode===t.themeMode&&y.id!=="cover-dark");h&&(a=h.id)}e.dataset.theme=a,e.dataset.mode=J.find(h=>h.id===a)?.mode||t.themeMode||"dark",t.theme=a;const r=li(t,a),o=li(t,a,!0),l=t.accentFromCover!==!1;(t.accentFromCover===!1||oi!==null&&a!==Bn)&&(ks=null,Ss=null);const d=r??(l?ks:null),m=o??Ss??d;return mn({"--glass-blur":t.glassBlurCustom?`${t.glassBlur}px`:null,"--dur":na(t),"--seed":d,"--seed-2":m}),oi=d&&a===Bn?Bn:null,gl(),hl(),t.glassAlphaCustom&&Ra(t.glassAlpha),a}function li(t,e,n=!1){return!t||t.accentFromCover!==!0||e!=="cover-dark"?null:Dt(n?t.coverSeed2:t.coverSeed)||null}async function fl(){const e=Yn(i.config.theme)?.mode==="light"?"dark":"light";i.config.themeMode=e,await De(i.config),x(),u(e==="dark"?"已切换到深色主题":"已切换到浅色主题",{duration:1500})}let ut=null;function Fn(t){return ut||(ut=document.createElement("div"),ut.style.cssText="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;",document.body.appendChild(ut)),ut.style.backgroundColor=t,getComputedStyle(ut).backgroundColor}function xs(t,e){const n=Math.max(0,Math.min(1,e)),s=String(t),a=s.match(/rgba?\(([^)]+)\)/);if(a){const o=a[1].split(/[,/]/).map(m=>parseFloat(m.trim())),[l,c,d]=o;if([l,c,d].every(m=>Number.isFinite(m)))return`rgba(${Math.round(l)}, ${Math.round(c)}, ${Math.round(d)}, ${n})`}const r=s.match(/color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);if(r){const[o,l,c]=r.slice(1,4).map(d=>Math.round(parseFloat(d)*255));if([o,l,c].every(d=>Number.isFinite(d)))return`rgba(${o}, ${l}, ${c}, ${n})`}return null}function ca(){const t=String(Fn("var(--glass-bg)")),e=t.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/),n=t.match(/\/\s*([\d.]+)\s*\)/),s=parseFloat(e&&e[1]||n&&n[1]||"");return Number.isFinite(s)?Math.round(s*100):62}let Vt=null;function hl(){Vt=null}function ml(){return Vt||(mn({"--glass-bg":null,"--glass-bg-strong":null,"--glass-bg-weak":null}),Vt={bg:Fn("var(--glass-bg)"),strong:Fn("var(--glass-bg-strong)"),weak:Fn("var(--glass-bg-weak)")},Vt)}function Ra(t){const e=Math.max(0,Math.min(1,(Number(t)||0)/100)),n=ml();mn({"--glass-bg":xs(n.bg,e),"--glass-bg-strong":xs(n.strong,Math.min(1,e+.18)),"--glass-bg-weak":xs(n.weak,Math.max(0,e-.22))})}function gl(){const t=document.body;t&&(t.dataset.styleEpoch=String((Number(t.dataset.styleEpoch)||0)+1))}function da(){const t=getComputedStyle(document.documentElement).getPropertyValue("--glass-blur"),e=parseFloat(t);return Number.isFinite(e)?e:22}function Dt(t){const e=String(t??"").trim();if(!e)return"";const n=e.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);if(n){let a=n[1].toLowerCase();return a.length===3&&(a=a[0]+a[0]+a[1]+a[1]+a[2]+a[2]),`#${a}`}const s=e.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);if(s){const a=r=>Math.max(0,Math.min(255,Math.round(Number(r)))).toString(16).padStart(2,"0");return`#${a(s[1])}${a(s[2])}${a(s[3])}`}return""}let ci="";function vl(t){const e=document.documentElement.dataset.theme||"",n=typeof t=="string"?t.trim():"",s=e===Bn?n:"";s!==ci&&(ci=s,mn({"--cover-bg":s?`url("${s.replace(/["\\]/g,"\\$&")}")`:null}))}function bl(t,e){const n=Dt(t),s=Dt(e)||n;return n?(mn({"--seed":n,"--seed-2":s}),i.config.coverSeed!==n||i.config.coverSeed2!==s?(i.config.coverSeed=n,i.config.coverSeed2=s,_l(),!0):!1):!1}const yl="music-player.cover-seed.v1";function _l(){try{localStorage.setItem(yl,JSON.stringify({seed:i.config.coverSeed||"",seed2:i.config.coverSeed2||"",theme:i.config.theme||""}))}catch{}}function di(t){try{const e=document.createElement("canvas"),n=32;e.width=n,e.height=n;const s=e.getContext("2d",{willReadFrequently:!0});s.drawImage(t,0,0,n,n);const{data:a}=s.getImageData(0,0,n,n);let r=0,o=0,l=0,c=0,d=0,m=0,h=0,y=0;for(let $=0;$<a.length;$+=4){if(a[$+3]<8)continue;const _=a[$],P=a[$+1],F=a[$+2];d+=_,m+=P,h+=F,y+=1;const L=Math.max(_,P,F),ie=Math.min(_,P,F);if(L<26)continue;const Y=L===0?0:(L-ie)/L;if(Y<.12)continue;const ge=Y*Y*(.35+L/255);r+=_*ge,o+=P*ge,l+=F*ge,c+=ge}const S=c>0?[r/c,o/c,l/c]:y>0?[d/y,m/y,h/y]:null;return S?`rgb(${S.map($=>Math.round(Math.max(0,Math.min(255,$)))).join(", ")})`:null}catch{return null}}function Cs(){i.query="",x()}function wt(t,e=null){if(i.settingsOpen&&Xn(),t==="settings"){lr();return}i.view=t,i.playlistId=t==="playlist"?e:null,i.playerOpen=!1,i.query="",i.playlistSelecting=!1,i.selectedIds=new Set,i.queueOpen=!1,x()}function lr(t=null){i.settingsOpen=!0,t&&(i.settingsSection=t),x()}function Xn(){i.settingsOpen=!1,x()}function wl(t=null){i.settingsOpen?Xn():lr(t)}function cr(){return i.settingsOpen===!0}function $l(){i.settingsOpen&&(i.settingsRev=(i.settingsRev||0)+1,x(),he())}async function pn({manual:t=!1}={}){if(!i.scanning){i.scanText="正在扫描音乐文件夹…",x();try{const e=await Zi({silent:!t});e&&u(`扫描完成：保留 ${D(e.kept)} 首${e.excluded?`，过滤 ${D(e.excluded)} 个`:""}${e.added?`，新增 ${D(e.added)}`:""}${e.removed?`，移除 ${D(e.removed)}`:""}`,{tone:"success",duration:3600})}finally{i.scanning=!1,x()}}}const dr="music-player.search.history.v1",kl=20;function Ts(){try{const t=localStorage.getItem(dr),e=t?JSON.parse(t):[];return Array.isArray(e)?e.filter(n=>typeof n=="string"&&n.trim()):[]}catch{return[]}}function Es(t){try{localStorage.setItem(dr,JSON.stringify(t.slice(0,kl)))}catch{}}const O={keyword:"",seq:0,results:[],query:"",loading:!1,message:"",rev:0};function Se(){O.rev+=1,he()}class Sl extends me{static deps=e=>[e.searchOpen,O.rev];get panelEl(){return this.querySelector("#search-overlay")}updated(){const e=this.panelEl;if(e){if(i.searchOpen){this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden&&(e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{i.searchOpen&&(e.dataset.state="opened")}),requestAnimationFrame(()=>{const n=this.querySelector("#search-input");n?.focus(),n?.select()}));return}e.hidden||(e.dataset.state="closed",this._closeTimer||(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!i.searchOpen&&e&&(e.hidden=!0)},260)))}}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),super.disconnectedCallback()}render(){const e=O,n=Ts(),s=!!e.keyword.trim();return p`
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
                @input=${a=>{O.keyword=a.target.value,Se()}}
                @keydown=${a=>{a.key==="Enter"&&(a.preventDefault(),this.submitSearch()),a.key==="Escape"&&(a.preventDefault(),O.keyword.trim()?this.clearSearch({focus:!0}):zn())}}
              />
              <button
                class="search-overlay__clear"
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
            <button
              class="search-overlay__close"
              type="button"
              data-search-close
              data-tip="关闭（结果会保留）"
              aria-label="关闭搜索"
              @click=${()=>zn()}
            >
              ${f("close")}
            </button>
          </div>

          <div class="search-overlay__history" id="search-history" ?hidden=${s||!n.length}>
            ${!s&&n.length?p`
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
                      ${n.map(a=>p`
                          <span class="search-overlay__history-chip" data-history-keyword=${a}>
                            <button
                              type="button"
                              class="search-overlay__history-key"
                              data-history-act="use"
                              @click=${()=>this.useHistory(a)}
                            >
                              ${a}
                            </button>
                            <button
                              type="button"
                              class="search-overlay__history-del"
                              data-history-act="del"
                              aria-label="删除「${a}」"
                              @click=${()=>this.removeHistory(a)}
                            >
                              ${f("close")}
                            </button>
                          </span>
                        `)}
                    </div>
                  `:B}
          </div>

          <div class="search-overlay__head">
            <span class="search-overlay__headline" id="search-headline">${this.headline()}</span>
          </div>
          <div class="search-overlay__body" id="search-body">${this.bodyContent()}</div>
        </div>
      </section>
    `}headline(){const e=O;return e.loading?"搜索中…":e.query?`在线「${e.query}」${D(e.results.length)} 个结果`:""}bodyContent(){const e=O;return e.loading?p`<div class="search-overlay__loading">
        <span class="search-overlay__spinner"></span>正在搜索「${e.keyword.trim()}」…
      </div>`:e.message?this.empty(e.message):e.results.length?Ie(e.results,n=>n.id,n=>p`
        <div
          class="search-row"
          data-search-id=${n.id}
          data-search-online="1"
          role="button"
          tabindex="0"
          @click=${()=>Is(n.id)}
        >
          <span class="search-row__cover">
            ${n.coverUrl?p`<img src=${n.coverUrl} alt="" loading="lazy" />`:p`<span class="search-row__cover-fallback">${f("music")}</span>`}
          </span>
          <span class="search-row__main">
            <span class="search-row__title">${n.title||"未命名"}</span>
            <span class="search-row__sub">${n.artist||"未知"} · ${_t(n.duration)}</span>
          </span>
          <span class="search-row__actions">
            <button
              class="btn btn--sm btn--primary"
              type="button"
              data-search-act="preview"
              data-id=${n.id}
              @click=${s=>{s.stopPropagation(),Is(n.id)}}
            >
              ${f("play")}<span>试听</span>
            </button>
            <button
              class="btn btn--sm"
              type="button"
              data-search-act="download"
              data-id=${n.id}
              @click=${s=>{s.stopPropagation(),Tl(n)}}
            >
              ${f("file")}<span>下载</span>
            </button>
          </span>
        </div>
      `):this.empty(e.query?"没有搜到在线歌曲，换个关键词试试":"输入关键词后按回车搜索在线歌曲")}empty(e){return p`<div class="search-overlay__empty">${f("search")}<span>${e}</span></div>`}onClick(e){(e.target.closest("[data-search-close]")||e.target===this.panelEl)&&zn()}onKey(e){if(e.key!=="Enter"&&e.key!==" ")return;const n=e.target.closest?.("[data-search-id]");n&&(e.preventDefault(),Is(n.dataset.searchId))}addHistory(e){const n=(e||"").trim();if(!n)return;const s=Ts().filter(a=>a!==n);s.unshift(n),Es(s),Se()}removeHistory(e){Es(Ts().filter(n=>n!==e)),Se()}clearHistory(){Es([]),Se()}useHistory(e){O.keyword=e,Se(),this.submitSearch()}submitSearch(){const e=(O.keyword||"").trim();if(!e){this.clearSearch({focus:!0});return}this.addHistory(e),this.runOnlineSearch(e)}clearSearch({focus:e=!1}={}){O.keyword="",O.results=[],O.query="",O.message="",O.loading=!1,O.seq+=1,Se(),e&&requestAnimationFrame(()=>this.querySelector("#search-input")?.focus())}async runOnlineSearch(e){O.query="",O.results=[],O.message="",O.loading=!0,Se();const n=++O.seq;if(!k()){O.loading=!1,O.message="浏览器预览下没有在线搜索后端，请在应用里试",Se();return}try{const s=await b.onlineSearch(e,1,24);if(n!==O.seq)return;O.results=Array.isArray(s)?s:[],O.query=e,O.loading=!1,Se()}catch(s){if(n!==O.seq)return;O.results=[],O.query=e,O.loading=!1,O.message=`在线搜索失败：${s?.message??s}`,Se()}}}te("mp-search-overlay",Sl);function xl(t){!i.searchOpen?ur():zn()}function ur(){i.searchOpen=!0,x()}function zn(){i.searchOpen=!1,x()}function Cl(){document.addEventListener("keydown",t=>{!(t.ctrlKey||t.metaKey)||t.key.toLowerCase()!=="f"||(t.preventDefault(),ur())})}function Is(t){const e=O.results.find(r=>r.id===t);if(!e)return;const n=So({id:e.id,title:e.title||"未命名",artist:e.artist||"未知",album:e.album||"在线",ext:e.ext||"m4a",duration:e.duration||0,size:0,sampleRate:0,bitrate:0,addedAt:Date.now(),playCount:0,path:"",cover:"",coverUrl:e.coverUrl||"",streamUrl:e.streamUrl||"",downloadUrl:e.downloadUrl||"",bvid:e.bvid||"",online:!0}),s=i.queue.includes(n.id)?i.queue.slice():[...i.queue,n.id],a=s.indexOf(n.id);lt(s,a,{type:"online",id:null}),u(`已加入播放列表并开始试听：${n.title}`,{tone:"success",duration:2200})}async function Tl(t){if(!k()){u("浏览器预览无法下载",{tone:"warning"});return}try{const e=await b.downloadStart(t.bvid||String(t.id).replace(/^bili:/,""),t.title||"",t.duration||0);if(!e?.started){u(e?.reason==="already-running"?"这首歌正在下载中":"无法开始下载",{tone:"warning"});return}u(`开始下载到 ${e.dir}`,{duration:2600})}catch(e){u(`下载失败：${e?.message??e}`,{tone:"error",duration:6e3})}}let Le=[],Qn=!1,pr=0,Ds=0;function $t(){pr+=1,he()}function Jt(){const t=Le.filter(e=>e?.state==="running").length;return{tasks:Le,running:t,revision:pr,open:Qn,visible:Le.length>0,badge:t>0?String(t):""}}function fr(t){Qn=typeof t=="boolean"?t:!Qn,$t()}function El(){fr(!1)}async function Il(){if(!k()){Le=Le.filter(t=>t?.state==="running"),$t();return}try{const t=await b.downloadClearFinished();ua(t)}catch(t){u(`清除失败：${t?.message??t}`,{tone:"error"})}}function Dl(){const t=Le.find(e=>e?.dir)?.dir||"";b.downloadOpenDir(t).catch(e=>u(`打开目录失败：${e?.message??e}`,{tone:"error"}))}function Al(t){const e=Le.find(s=>s.id===t),n=e?.path||e?.dir;n&&b.downloadOpenDir(n).catch(s=>u(`打开失败：${s?.message??s}`,{tone:"error"}))}function ua(t){!t||!Array.isArray(t.tasks)||(Le=t.tasks,$t())}async function Ml(){if(ae("download:tasks",e=>{Ds+=1,ua(e)}),!k()){if(Pl()){$t(),Qn=!0,$t();return}$t();return}const t=Ds;try{const e=await b.downloadTasks();Ds===t&&ua(e)}catch(e){console.info("[downloads] 拉取下载任务失败",e?.message??e)}}function Pl(){return k()||new URLSearchParams(location.search).get("downloads")!=="1"?!1:(Le=[{id:"preview-1",bvid:"BV1xx411c7mD",title:"晴天 - 周杰伦",state:"running",done:231e4,total:47e5,dir:"C:\\Users\\Me\\Music\\downloads"},{id:"preview-2",bvid:"BV1yy411c7mE",title:"孤勇者 - 陈奕迅",state:"done",done:39e5,total:39e5,path:"C:\\Users\\Me\\Music\\downloads\\孤勇者 - 陈奕迅.m4a",dir:"C:\\Users\\Me\\Music\\downloads"},{id:"preview-3",bvid:"BV1zz411c7mF",title:"一首标题很长很长、长到面板里必须被省略号截断的测试歌曲",state:"failed",done:12e4,total:5e6,message:"下载到的内容为空",dir:"C:\\Users\\Me\\Music\\downloads"}],!0)}class Ol extends me{static deps=()=>{const n=Yn(i.config.theme)?.mode!=="light",s=Jt();return[n,i.config.themeMode,i.searchOpen,s.visible,s.badge]};render(){const n=Yn(i.config.theme)?.mode!=="light",s=Jt();return p`
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
            @click=${()=>xl()}
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
            @click=${()=>fr()}
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
            @click=${()=>fl()}
          >
            ${f(n?"sun":"moon")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-settings"
            type="button"
            data-tip="设置"
            aria-label="设置"
            @click=${()=>wl()}
          >
            ${f("settings")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-win-min"
            type="button"
            aria-label="最小化"
            @click=${()=>As("min")}
          >
            ${f("minimize")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-win-max"
            type="button"
            aria-label="最大化"
            @click=${()=>As("max")}
          >
            ${f("maximize")}
          </button>
          <button
            class="titlebar__btn titlebar__btn--close"
            id="btn-win-close"
            type="button"
            aria-label="关闭"
            @click=${()=>As("close")}
          >
            ${f("close")}
          </button>
        </div>
      </header>
    `}}function As(t){if(!k()){t==="close"&&window.close();return}t==="min"?b.windowMinimize():t==="max"?b.windowToggleMaximize():b.windowClose()}te("mp-titlebar",Ol);function Ll(t,e,n){return(e=Bl(e))in t?Object.defineProperty(t,e,{value:n,enumerable:!0,configurable:!0,writable:!0}):t[e]=n,t}function qe(){return qe=Object.assign?Object.assign.bind():function(t){for(var e=1;e<arguments.length;e++){var n=arguments[e];for(var s in n)({}).hasOwnProperty.call(n,s)&&(t[s]=n[s])}return t},qe.apply(null,arguments)}function ui(t,e){var n=Object.keys(t);if(Object.getOwnPropertySymbols){var s=Object.getOwnPropertySymbols(t);e&&(s=s.filter(function(a){return Object.getOwnPropertyDescriptor(t,a).enumerable})),n.push.apply(n,s)}return n}function Ae(t){for(var e=1;e<arguments.length;e++){var n=arguments[e]!=null?arguments[e]:{};e%2?ui(Object(n),!0).forEach(function(s){Ll(t,s,n[s])}):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(n)):ui(Object(n)).forEach(function(s){Object.defineProperty(t,s,Object.getOwnPropertyDescriptor(n,s))})}return t}function Rl(t,e){if(t==null)return{};var n,s,a=Nl(t,e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(t);for(s=0;s<r.length;s++)n=r[s],e.indexOf(n)===-1&&{}.propertyIsEnumerable.call(t,n)&&(a[n]=t[n])}return a}function Nl(t,e){if(t==null)return{};var n={};for(var s in t)if({}.hasOwnProperty.call(t,s)){if(e.indexOf(s)!==-1)continue;n[s]=t[s]}return n}function ql(t,e){if(typeof t!="object"||!t)return t;var n=t[Symbol.toPrimitive];if(n!==void 0){var s=n.call(t,e);if(typeof s!="object")return s;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(t)}function Bl(t){var e=ql(t,"string");return typeof e=="symbol"?e:e+""}function pa(t){"@babel/helpers - typeof";return pa=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(e){return typeof e}:function(e){return e&&typeof Symbol=="function"&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},pa(t)}var Fl="1.15.7";function Re(t){if(typeof window<"u"&&window.navigator)return!!navigator.userAgent.match(t)}var Be=Re(/(?:Trident.*rv[ :]?11\.|msie|iemobile|Windows Phone)/i),yn=Re(/Edge/i),pi=Re(/firefox/i),Zt=Re(/safari/i)&&!Re(/chrome/i)&&!Re(/android/i),Na=Re(/iP(ad|od|hone)/i),hr=Re(/chrome/i)&&Re(/android/i),mr={capture:!1,passive:!1};function M(t,e,n){t.addEventListener(e,n,!Be&&mr)}function A(t,e,n){t.removeEventListener(e,n,!Be&&mr)}function Jn(t,e){if(e){if(e[0]===">"&&(e=e.substring(1)),t)try{if(t.matches)return t.matches(e);if(t.msMatchesSelector)return t.msMatchesSelector(e);if(t.webkitMatchesSelector)return t.webkitMatchesSelector(e)}catch{return!1}return!1}}function gr(t){return t.host&&t!==document&&t.host.nodeType&&t.host!==t?t.host:t.parentNode}function we(t,e,n,s){if(t){n=n||document;do{if(e!=null&&(e[0]===">"?t.parentNode===n&&Jn(t,e):Jn(t,e))||s&&t===n)return t;if(t===n)break}while(t=gr(t))}return null}var fi=/\s+/g;function pe(t,e,n){if(t&&e)if(t.classList)t.classList[n?"add":"remove"](e);else{var s=(" "+t.className+" ").replace(fi," ").replace(" "+e+" "," ");t.className=(s+(n?" "+e:"")).replace(fi," ")}}function T(t,e,n){var s=t&&t.style;if(s){if(n===void 0)return document.defaultView&&document.defaultView.getComputedStyle?n=document.defaultView.getComputedStyle(t,""):t.currentStyle&&(n=t.currentStyle),e===void 0?n:n[e];!(e in s)&&e.indexOf("webkit")===-1&&(e="-webkit-"+e),s[e]=n+(typeof n=="string"?"":"px")}}function kt(t,e){var n="";if(typeof t=="string")n=t;else do{var s=T(t,"transform");s&&s!=="none"&&(n=s+" "+n)}while(!e&&(t=t.parentNode));var a=window.DOMMatrix||window.WebKitCSSMatrix||window.CSSMatrix||window.MSCSSMatrix;return a&&new a(n)}function vr(t,e,n){if(t){var s=t.getElementsByTagName(e),a=0,r=s.length;if(n)for(;a<r;a++)n(s[a],a);return s}return[]}function Ee(){var t=document.scrollingElement;return t||document.documentElement}function G(t,e,n,s,a){if(!(!t.getBoundingClientRect&&t!==window)){var r,o,l,c,d,m,h;if(t!==window&&t.parentNode&&t!==Ee()?(r=t.getBoundingClientRect(),o=r.top,l=r.left,c=r.bottom,d=r.right,m=r.height,h=r.width):(o=0,l=0,c=window.innerHeight,d=window.innerWidth,m=window.innerHeight,h=window.innerWidth),(e||n)&&t!==window&&(a=a||t.parentNode,!Be))do if(a&&a.getBoundingClientRect&&(T(a,"transform")!=="none"||n&&T(a,"position")!=="static")){var y=a.getBoundingClientRect();o-=y.top+parseInt(T(a,"border-top-width")),l-=y.left+parseInt(T(a,"border-left-width")),c=o+r.height,d=l+r.width;break}while(a=a.parentNode);if(s&&t!==window){var S=kt(a||t),$=S&&S.a,_=S&&S.d;S&&(o/=_,l/=$,h/=$,m/=_,c=o+m,d=l+h)}return{top:o,left:l,bottom:c,right:d,width:h,height:m}}}function hi(t,e,n){for(var s=Ve(t,!0),a=G(t)[e];s;){var r=G(s)[n],o=void 0;if(o=a>=r,!o)return s;if(s===Ee())break;s=Ve(s,!1)}return!1}function At(t,e,n,s){for(var a=0,r=0,o=t.children;r<o.length;){if(o[r].style.display!=="none"&&o[r]!==C.ghost&&(s||o[r]!==C.dragged)&&we(o[r],n.draggable,t,!1)){if(a===e)return o[r];a++}r++}return null}function qa(t,e){for(var n=t.lastElementChild;n&&(n===C.ghost||T(n,"display")==="none"||e&&!Jn(n,e));)n=n.previousElementSibling;return n||null}function ve(t,e){var n=0;if(!t||!t.parentNode)return-1;for(;t=t.previousElementSibling;)t.nodeName.toUpperCase()!=="TEMPLATE"&&t!==C.clone&&(!e||Jn(t,e))&&n++;return n}function mi(t){var e=0,n=0,s=Ee();if(t)do{var a=kt(t),r=a.a,o=a.d;e+=t.scrollLeft*r,n+=t.scrollTop*o}while(t!==s&&(t=t.parentNode));return[e,n]}function zl(t,e){for(var n in t)if(t.hasOwnProperty(n)){for(var s in e)if(e.hasOwnProperty(s)&&e[s]===t[n][s])return Number(n)}return-1}function Ve(t,e){if(!t||!t.getBoundingClientRect)return Ee();var n=t,s=!1;do if(n.clientWidth<n.scrollWidth||n.clientHeight<n.scrollHeight){var a=T(n);if(n.clientWidth<n.scrollWidth&&(a.overflowX=="auto"||a.overflowX=="scroll")||n.clientHeight<n.scrollHeight&&(a.overflowY=="auto"||a.overflowY=="scroll")){if(!n.getBoundingClientRect||n===document.body)return Ee();if(s||e)return n;s=!0}}while(n=n.parentNode);return Ee()}function Wl(t,e){if(t&&e)for(var n in e)e.hasOwnProperty(n)&&(t[n]=e[n]);return t}function Ms(t,e){return Math.round(t.top)===Math.round(e.top)&&Math.round(t.left)===Math.round(e.left)&&Math.round(t.height)===Math.round(e.height)&&Math.round(t.width)===Math.round(e.width)}var en;function br(t,e){return function(){if(!en){var n=arguments,s=this;n.length===1?t.call(s,n[0]):t.apply(s,n),en=setTimeout(function(){en=void 0},e)}}}function Hl(){clearTimeout(en),en=void 0}function yr(t,e,n){t.scrollLeft+=e,t.scrollTop+=n}function _r(t){var e=window.Polymer,n=window.jQuery||window.Zepto;return e&&e.dom?e.dom(t).cloneNode(!0):n?n(t).clone(!0)[0]:t.cloneNode(!0)}function wr(t,e,n){var s={};return Array.from(t.children).forEach(function(a){var r,o,l,c;if(!(!we(a,e.draggable,t,!1)||a.animated||a===n)){var d=G(a);s.left=Math.min((r=s.left)!==null&&r!==void 0?r:1/0,d.left),s.top=Math.min((o=s.top)!==null&&o!==void 0?o:1/0,d.top),s.right=Math.max((l=s.right)!==null&&l!==void 0?l:-1/0,d.right),s.bottom=Math.max((c=s.bottom)!==null&&c!==void 0?c:-1/0,d.bottom)}}),s.width=s.right-s.left,s.height=s.bottom-s.top,s.x=s.left,s.y=s.top,s}var ce="Sortable"+new Date().getTime();function Ul(){var t=[],e;return{captureAnimationState:function(){if(t=[],!!this.options.animation){var s=[].slice.call(this.el.children);s.forEach(function(a){if(!(T(a,"display")==="none"||a===C.ghost)){t.push({target:a,rect:G(a)});var r=Ae({},t[t.length-1].rect);if(a.thisAnimationDuration){var o=kt(a,!0);o&&(r.top-=o.f,r.left-=o.e)}a.fromRect=r}})}},addAnimationState:function(s){t.push(s)},removeAnimationState:function(s){t.splice(zl(t,{target:s}),1)},animateAll:function(s){var a=this;if(!this.options.animation){clearTimeout(e),typeof s=="function"&&s();return}var r=!1,o=0;t.forEach(function(l){var c=0,d=l.target,m=d.fromRect,h=G(d),y=d.prevFromRect,S=d.prevToRect,$=l.rect,_=kt(d,!0);_&&(h.top-=_.f,h.left-=_.e),d.toRect=h,d.thisAnimationDuration&&Ms(y,h)&&!Ms(m,h)&&($.top-h.top)/($.left-h.left)===(m.top-h.top)/(m.left-h.left)&&(c=Vl($,y,S,a.options)),Ms(h,m)||(d.prevFromRect=m,d.prevToRect=h,c||(c=a.options.animation),a.animate(d,$,h,c)),c&&(r=!0,o=Math.max(o,c),clearTimeout(d.animationResetTimer),d.animationResetTimer=setTimeout(function(){d.animationTime=0,d.prevFromRect=null,d.fromRect=null,d.prevToRect=null,d.thisAnimationDuration=null},c),d.thisAnimationDuration=c)}),clearTimeout(e),r?e=setTimeout(function(){typeof s=="function"&&s()},o):typeof s=="function"&&s(),t=[]},animate:function(s,a,r,o){if(o){T(s,"transition",""),T(s,"transform","");var l=kt(this.el),c=l&&l.a,d=l&&l.d,m=(a.left-r.left)/(c||1),h=(a.top-r.top)/(d||1);s.animatingX=!!m,s.animatingY=!!h,T(s,"transform","translate3d("+m+"px,"+h+"px,0)"),this.forRepaintDummy=jl(s),T(s,"transition","transform "+o+"ms"+(this.options.easing?" "+this.options.easing:"")),T(s,"transform","translate3d(0,0,0)"),typeof s.animated=="number"&&clearTimeout(s.animated),s.animated=setTimeout(function(){T(s,"transition",""),T(s,"transform",""),s.animated=!1,s.animatingX=!1,s.animatingY=!1},o)}}}}function jl(t){return t.offsetWidth}function Vl(t,e,n,s){return Math.sqrt(Math.pow(e.top-t.top,2)+Math.pow(e.left-t.left,2))/Math.sqrt(Math.pow(e.top-n.top,2)+Math.pow(e.left-n.left,2))*s.animation}var pt=[],Ps={initializeByDefault:!0},_n={mount:function(e){for(var n in Ps)Ps.hasOwnProperty(n)&&!(n in e)&&(e[n]=Ps[n]);pt.forEach(function(s){if(s.pluginName===e.pluginName)throw"Sortable: Cannot mount plugin ".concat(e.pluginName," more than once")}),pt.push(e)},pluginEvent:function(e,n,s){var a=this;this.eventCanceled=!1,s.cancel=function(){a.eventCanceled=!0};var r=e+"Global";pt.forEach(function(o){n[o.pluginName]&&(n[o.pluginName][r]&&n[o.pluginName][r](Ae({sortable:n},s)),n.options[o.pluginName]&&n[o.pluginName][e]&&n[o.pluginName][e](Ae({sortable:n},s)))})},initializePlugins:function(e,n,s,a){pt.forEach(function(l){var c=l.pluginName;if(!(!e.options[c]&&!l.initializeByDefault)){var d=new l(e,n,e.options);d.sortable=e,d.options=e.options,e[c]=d,qe(s,d.defaults)}});for(var r in e.options)if(e.options.hasOwnProperty(r)){var o=this.modifyOption(e,r,e.options[r]);typeof o<"u"&&(e.options[r]=o)}},getEventProperties:function(e,n){var s={};return pt.forEach(function(a){typeof a.eventProperties=="function"&&qe(s,a.eventProperties.call(n[a.pluginName],e))}),s},modifyOption:function(e,n,s){var a;return pt.forEach(function(r){e[r.pluginName]&&r.optionListeners&&typeof r.optionListeners[n]=="function"&&(a=r.optionListeners[n].call(e[r.pluginName],s))}),a}};function Gl(t){var e=t.sortable,n=t.rootEl,s=t.name,a=t.targetEl,r=t.cloneEl,o=t.toEl,l=t.fromEl,c=t.oldIndex,d=t.newIndex,m=t.oldDraggableIndex,h=t.newDraggableIndex,y=t.originalEvent,S=t.putSortable,$=t.extraEventProperties;if(e=e||n&&n[ce],!!e){var _,P=e.options,F="on"+s.charAt(0).toUpperCase()+s.substr(1);window.CustomEvent&&!Be&&!yn?_=new CustomEvent(s,{bubbles:!0,cancelable:!0}):(_=document.createEvent("Event"),_.initEvent(s,!0,!0)),_.to=o||n,_.from=l||n,_.item=a||n,_.clone=r,_.oldIndex=c,_.newIndex=d,_.oldDraggableIndex=m,_.newDraggableIndex=h,_.originalEvent=y,_.pullMode=S?S.lastPutMode:void 0;var L=Ae(Ae({},$),_n.getEventProperties(s,e));for(var ie in L)_[ie]=L[ie];n&&n.dispatchEvent(_),P[F]&&P[F].call(e,_)}}var Kl=["evt"],le=function(e,n){var s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:{},a=s.evt,r=Rl(s,Kl);_n.pluginEvent.bind(C)(e,n,Ae({dragEl:v,parentEl:U,ghostEl:I,rootEl:W,nextEl:tt,lastDownEl:Wn,cloneEl:H,cloneHidden:je,dragStarted:Gt,putSortable:Q,activeSortable:C.active,originalEvent:a,oldIndex:bt,oldDraggableIndex:tn,newIndex:fe,newDraggableIndex:He,hideGhostForTarget:xr,unhideGhostForTarget:Cr,cloneNowHidden:function(){je=!0},cloneNowShown:function(){je=!1},dispatchSortableEvent:function(l){re({sortable:n,name:l,originalEvent:a})}},r))};function re(t){Gl(Ae({putSortable:Q,cloneEl:H,targetEl:v,rootEl:W,oldIndex:bt,oldDraggableIndex:tn,newIndex:fe,newDraggableIndex:He},t))}var v,U,I,W,tt,Wn,H,je,bt,fe,tn,He,Cn,Q,gt=!1,Zn=!1,es=[],Je,_e,Os,Ls,gi,vi,Gt,ft,nn,sn=!1,Tn=!1,Hn,ne,Rs=[],fa=!1,ts=[],hs=typeof document<"u",En=Na,bi=yn||Be?"cssFloat":"float",Yl=hs&&!hr&&!Na&&"draggable"in document.createElement("div"),$r=(function(){if(hs){if(Be)return!1;var t=document.createElement("x");return t.style.cssText="pointer-events:auto",t.style.pointerEvents==="auto"}})(),kr=function(e,n){var s=T(e),a=parseInt(s.width)-parseInt(s.paddingLeft)-parseInt(s.paddingRight)-parseInt(s.borderLeftWidth)-parseInt(s.borderRightWidth),r=At(e,0,n),o=At(e,1,n),l=r&&T(r),c=o&&T(o),d=l&&parseInt(l.marginLeft)+parseInt(l.marginRight)+G(r).width,m=c&&parseInt(c.marginLeft)+parseInt(c.marginRight)+G(o).width;if(s.display==="flex")return s.flexDirection==="column"||s.flexDirection==="column-reverse"?"vertical":"horizontal";if(s.display==="grid")return s.gridTemplateColumns.split(" ").length<=1?"vertical":"horizontal";if(r&&l.float&&l.float!=="none"){var h=l.float==="left"?"left":"right";return o&&(c.clear==="both"||c.clear===h)?"vertical":"horizontal"}return r&&(l.display==="block"||l.display==="flex"||l.display==="table"||l.display==="grid"||d>=a&&s[bi]==="none"||o&&s[bi]==="none"&&d+m>a)?"vertical":"horizontal"},Xl=function(e,n,s){var a=s?e.left:e.top,r=s?e.right:e.bottom,o=s?e.width:e.height,l=s?n.left:n.top,c=s?n.right:n.bottom,d=s?n.width:n.height;return a===l||r===c||a+o/2===l+d/2},Ql=function(e,n){var s;return es.some(function(a){var r=a[ce].options.emptyInsertThreshold;if(!(!r||qa(a))){var o=G(a),l=e>=o.left-r&&e<=o.right+r,c=n>=o.top-r&&n<=o.bottom+r;if(l&&c)return s=a}}),s},Sr=function(e){function n(r,o){return function(l,c,d,m){var h=l.options.group.name&&c.options.group.name&&l.options.group.name===c.options.group.name;if(r==null&&(o||h))return!0;if(r==null||r===!1)return!1;if(o&&r==="clone")return r;if(typeof r=="function")return n(r(l,c,d,m),o)(l,c,d,m);var y=(o?l:c).options.group.name;return r===!0||typeof r=="string"&&r===y||r.join&&r.indexOf(y)>-1}}var s={},a=e.group;(!a||pa(a)!="object")&&(a={name:a}),s.name=a.name,s.checkPull=n(a.pull,!0),s.checkPut=n(a.put),s.revertClone=a.revertClone,e.group=s},xr=function(){!$r&&I&&T(I,"display","none")},Cr=function(){!$r&&I&&T(I,"display","")};hs&&!hr&&document.addEventListener("click",function(t){if(Zn)return t.preventDefault(),t.stopPropagation&&t.stopPropagation(),t.stopImmediatePropagation&&t.stopImmediatePropagation(),Zn=!1,!1},!0);var Ze=function(e){if(v){e=e.touches?e.touches[0]:e;var n=Ql(e.clientX,e.clientY);if(n){var s={};for(var a in e)e.hasOwnProperty(a)&&(s[a]=e[a]);s.target=s.rootEl=n,s.preventDefault=void 0,s.stopPropagation=void 0,n[ce]._onDragOver(s)}}},Jl=function(e){v&&v.parentNode[ce]._isOutsideThisEl(e.target)};function C(t,e){if(!(t&&t.nodeType&&t.nodeType===1))throw"Sortable: `el` must be an HTMLElement, not ".concat({}.toString.call(t));this.el=t,this.options=e=qe({},e),t[ce]=this;var n={group:null,sort:!0,disabled:!1,store:null,handle:null,draggable:/^[uo]l$/i.test(t.nodeName)?">li":">*",swapThreshold:1,invertSwap:!1,invertedSwapThreshold:null,removeCloneOnHide:!0,direction:function(){return kr(t,this.options)},ghostClass:"sortable-ghost",chosenClass:"sortable-chosen",dragClass:"sortable-drag",ignore:"a, img",filter:null,preventOnFilter:!0,animation:0,easing:null,setData:function(o,l){o.setData("Text",l.textContent)},dropBubble:!1,dragoverBubble:!1,dataIdAttr:"data-id",delay:0,delayOnTouchOnly:!1,touchStartThreshold:(Number.parseInt?Number:window).parseInt(window.devicePixelRatio,10)||1,forceFallback:!1,fallbackClass:"sortable-fallback",fallbackOnBody:!1,fallbackTolerance:0,fallbackOffset:{x:0,y:0},supportPointer:C.supportPointer!==!1&&"PointerEvent"in window&&(!Zt||Na),emptyInsertThreshold:5};_n.initializePlugins(this,t,n);for(var s in n)!(s in e)&&(e[s]=n[s]);Sr(e);for(var a in this)a.charAt(0)==="_"&&typeof this[a]=="function"&&(this[a]=this[a].bind(this));this.nativeDraggable=e.forceFallback?!1:Yl,this.nativeDraggable&&(this.options.touchStartThreshold=1),e.supportPointer?M(t,"pointerdown",this._onTapStart):(M(t,"mousedown",this._onTapStart),M(t,"touchstart",this._onTapStart)),this.nativeDraggable&&(M(t,"dragover",this),M(t,"dragenter",this)),es.push(this.el),e.store&&e.store.get&&this.sort(e.store.get(this)||[]),qe(this,Ul())}C.prototype={constructor:C,_isOutsideThisEl:function(e){!this.el.contains(e)&&e!==this.el&&(ft=null)},_getDirection:function(e,n){return typeof this.options.direction=="function"?this.options.direction.call(this,e,n,v):this.options.direction},_onTapStart:function(e){if(e.cancelable){var n=this,s=this.el,a=this.options,r=a.preventOnFilter,o=e.type,l=e.touches&&e.touches[0]||e.pointerType&&e.pointerType==="touch"&&e,c=(l||e).target,d=e.target.shadowRoot&&(e.path&&e.path[0]||e.composedPath&&e.composedPath()[0])||c,m=a.filter;if(rc(s),!v&&!(/mousedown|pointerdown/.test(o)&&e.button!==0||a.disabled)&&!d.isContentEditable&&!(!this.nativeDraggable&&Zt&&c&&c.tagName.toUpperCase()==="SELECT")&&(c=we(c,a.draggable,s,!1),!(c&&c.animated)&&Wn!==c)){if(bt=ve(c),tn=ve(c,a.draggable),typeof m=="function"){if(m.call(this,e,c,this)){re({sortable:n,rootEl:d,name:"filter",targetEl:c,toEl:s,fromEl:s}),le("filter",n,{evt:e}),r&&e.preventDefault();return}}else if(m&&(m=m.split(",").some(function(h){if(h=we(d,h.trim(),s,!1),h)return re({sortable:n,rootEl:h,name:"filter",targetEl:c,fromEl:s,toEl:s}),le("filter",n,{evt:e}),!0}),m)){r&&e.preventDefault();return}a.handle&&!we(d,a.handle,s,!1)||this._prepareDragStart(e,l,c)}}},_prepareDragStart:function(e,n,s){var a=this,r=a.el,o=a.options,l=r.ownerDocument,c;if(s&&!v&&s.parentNode===r){var d=G(s);if(W=r,v=s,U=v.parentNode,tt=v.nextSibling,Wn=s,Cn=o.group,C.dragged=v,Je={target:v,clientX:(n||e).clientX,clientY:(n||e).clientY},gi=Je.clientX-d.left,vi=Je.clientY-d.top,this._lastX=(n||e).clientX,this._lastY=(n||e).clientY,v.style["will-change"]="all",c=function(){if(le("delayEnded",a,{evt:e}),C.eventCanceled){a._onDrop();return}a._disableDelayedDragEvents(),!pi&&a.nativeDraggable&&(v.draggable=!0),a._triggerDragStart(e,n),re({sortable:a,name:"choose",originalEvent:e}),pe(v,o.chosenClass,!0)},o.ignore.split(",").forEach(function(m){vr(v,m.trim(),Ns)}),M(l,"dragover",Ze),M(l,"mousemove",Ze),M(l,"touchmove",Ze),o.supportPointer?(M(l,"pointerup",a._onDrop),!this.nativeDraggable&&M(l,"pointercancel",a._onDrop)):(M(l,"mouseup",a._onDrop),M(l,"touchend",a._onDrop),M(l,"touchcancel",a._onDrop)),pi&&this.nativeDraggable&&(this.options.touchStartThreshold=4,v.draggable=!0),le("delayStart",this,{evt:e}),o.delay&&(!o.delayOnTouchOnly||n)&&(!this.nativeDraggable||!(yn||Be))){if(C.eventCanceled){this._onDrop();return}o.supportPointer?(M(l,"pointerup",a._disableDelayedDrag),M(l,"pointercancel",a._disableDelayedDrag)):(M(l,"mouseup",a._disableDelayedDrag),M(l,"touchend",a._disableDelayedDrag),M(l,"touchcancel",a._disableDelayedDrag)),M(l,"mousemove",a._delayedDragTouchMoveHandler),M(l,"touchmove",a._delayedDragTouchMoveHandler),o.supportPointer&&M(l,"pointermove",a._delayedDragTouchMoveHandler),a._dragStartTimer=setTimeout(c,o.delay)}else c()}},_delayedDragTouchMoveHandler:function(e){var n=e.touches?e.touches[0]:e;Math.max(Math.abs(n.clientX-this._lastX),Math.abs(n.clientY-this._lastY))>=Math.floor(this.options.touchStartThreshold/(this.nativeDraggable&&window.devicePixelRatio||1))&&this._disableDelayedDrag()},_disableDelayedDrag:function(){v&&Ns(v),clearTimeout(this._dragStartTimer),this._disableDelayedDragEvents()},_disableDelayedDragEvents:function(){var e=this.el.ownerDocument;A(e,"mouseup",this._disableDelayedDrag),A(e,"touchend",this._disableDelayedDrag),A(e,"touchcancel",this._disableDelayedDrag),A(e,"pointerup",this._disableDelayedDrag),A(e,"pointercancel",this._disableDelayedDrag),A(e,"mousemove",this._delayedDragTouchMoveHandler),A(e,"touchmove",this._delayedDragTouchMoveHandler),A(e,"pointermove",this._delayedDragTouchMoveHandler)},_triggerDragStart:function(e,n){n=n||e.pointerType=="touch"&&e,!this.nativeDraggable||n?this.options.supportPointer?M(document,"pointermove",this._onTouchMove):n?M(document,"touchmove",this._onTouchMove):M(document,"mousemove",this._onTouchMove):(M(v,"dragend",this),M(W,"dragstart",this._onDragStart));try{document.selection?Un(function(){document.selection.empty()}):window.getSelection().removeAllRanges()}catch{}},_dragStarted:function(e,n){if(gt=!1,W&&v){le("dragStarted",this,{evt:n}),this.nativeDraggable&&M(document,"dragover",Jl);var s=this.options;!e&&pe(v,s.dragClass,!1),pe(v,s.ghostClass,!0),C.active=this,e&&this._appendGhost(),re({sortable:this,name:"start",originalEvent:n})}else this._nulling()},_emulateDragOver:function(){if(_e){this._lastX=_e.clientX,this._lastY=_e.clientY,xr();for(var e=document.elementFromPoint(_e.clientX,_e.clientY),n=e;e&&e.shadowRoot&&(e=e.shadowRoot.elementFromPoint(_e.clientX,_e.clientY),e!==n);)n=e;if(v.parentNode[ce]._isOutsideThisEl(e),n)do{if(n[ce]){var s=void 0;if(s=n[ce]._onDragOver({clientX:_e.clientX,clientY:_e.clientY,target:e,rootEl:n}),s&&!this.options.dragoverBubble)break}e=n}while(n=gr(n));Cr()}},_onTouchMove:function(e){if(Je){var n=this.options,s=n.fallbackTolerance,a=n.fallbackOffset,r=e.touches?e.touches[0]:e,o=I&&kt(I,!0),l=I&&o&&o.a,c=I&&o&&o.d,d=En&&ne&&mi(ne),m=(r.clientX-Je.clientX+a.x)/(l||1)+(d?d[0]-Rs[0]:0)/(l||1),h=(r.clientY-Je.clientY+a.y)/(c||1)+(d?d[1]-Rs[1]:0)/(c||1);if(!C.active&&!gt){if(s&&Math.max(Math.abs(r.clientX-this._lastX),Math.abs(r.clientY-this._lastY))<s)return;this._onDragStart(e,!0)}if(I){o?(o.e+=m-(Os||0),o.f+=h-(Ls||0)):o={a:1,b:0,c:0,d:1,e:m,f:h};var y="matrix(".concat(o.a,",").concat(o.b,",").concat(o.c,",").concat(o.d,",").concat(o.e,",").concat(o.f,")");T(I,"webkitTransform",y),T(I,"mozTransform",y),T(I,"msTransform",y),T(I,"transform",y),Os=m,Ls=h,_e=r}e.cancelable&&e.preventDefault()}},_appendGhost:function(){if(!I){var e=this.options.fallbackOnBody?document.body:W,n=G(v,!0,En,!0,e),s=this.options;if(En){for(ne=e;T(ne,"position")==="static"&&T(ne,"transform")==="none"&&ne!==document;)ne=ne.parentNode;ne!==document.body&&ne!==document.documentElement?(ne===document&&(ne=Ee()),n.top+=ne.scrollTop,n.left+=ne.scrollLeft):ne=Ee(),Rs=mi(ne)}I=v.cloneNode(!0),pe(I,s.ghostClass,!1),pe(I,s.fallbackClass,!0),pe(I,s.dragClass,!0),T(I,"transition",""),T(I,"transform",""),T(I,"box-sizing","border-box"),T(I,"margin",0),T(I,"top",n.top),T(I,"left",n.left),T(I,"width",n.width),T(I,"height",n.height),T(I,"opacity","0.8"),T(I,"position",En?"absolute":"fixed"),T(I,"zIndex","100000"),T(I,"pointerEvents","none"),C.ghost=I,e.appendChild(I),T(I,"transform-origin",gi/parseInt(I.style.width)*100+"% "+vi/parseInt(I.style.height)*100+"%")}},_onDragStart:function(e,n){var s=this,a=e.dataTransfer,r=s.options;if(le("dragStart",this,{evt:e}),C.eventCanceled){this._onDrop();return}le("setupClone",this),C.eventCanceled||(H=_r(v),H.removeAttribute("id"),H.draggable=!1,H.style["will-change"]="",this._hideClone(),pe(H,this.options.chosenClass,!1),C.clone=H),s.cloneId=Un(function(){le("clone",s),!C.eventCanceled&&(s.options.removeCloneOnHide||W.insertBefore(H,v),s._hideClone(),re({sortable:s,name:"clone"}))}),!n&&pe(v,r.dragClass,!0),n?(Zn=!0,s._loopId=setInterval(s._emulateDragOver,50)):(A(document,"mouseup",s._onDrop),A(document,"touchend",s._onDrop),A(document,"touchcancel",s._onDrop),a&&(a.effectAllowed="move",r.setData&&r.setData.call(s,a,v)),M(document,"drop",s),T(v,"transform","translateZ(0)")),gt=!0,s._dragStartId=Un(s._dragStarted.bind(s,n,e)),M(document,"selectstart",s),Gt=!0,window.getSelection().removeAllRanges(),Zt&&T(document.body,"user-select","none")},_onDragOver:function(e){var n=this.el,s=e.target,a,r,o,l=this.options,c=l.group,d=C.active,m=Cn===c,h=l.sort,y=Q||d,S,$=this,_=!1;if(fa)return;function P(Bt,vo){le(Bt,$,Ae({evt:e,isOwner:m,axis:S?"vertical":"horizontal",revert:o,dragRect:a,targetRect:r,canSort:h,fromSortable:y,target:s,completed:L,onMove:function(Ja,bo){return In(W,n,v,a,Ja,G(Ja),e,bo)},changed:ie},vo))}function F(){P("dragOverAnimationCapture"),$.captureAnimationState(),$!==y&&y.captureAnimationState()}function L(Bt){return P("dragOverCompleted",{insertion:Bt}),Bt&&(m?d._hideClone():d._showClone($),$!==y&&(pe(v,Q?Q.options.ghostClass:d.options.ghostClass,!1),pe(v,l.ghostClass,!0)),Q!==$&&$!==C.active?Q=$:$===C.active&&Q&&(Q=null),y===$&&($._ignoreWhileAnimating=s),$.animateAll(function(){P("dragOverAnimationComplete"),$._ignoreWhileAnimating=null}),$!==y&&(y.animateAll(),y._ignoreWhileAnimating=null)),(s===v&&!v.animated||s===n&&!s.animated)&&(ft=null),!l.dragoverBubble&&!e.rootEl&&s!==document&&(v.parentNode[ce]._isOutsideThisEl(e.target),!Bt&&Ze(e)),!l.dragoverBubble&&e.stopPropagation&&e.stopPropagation(),_=!0}function ie(){fe=ve(v),He=ve(v,l.draggable),re({sortable:$,name:"change",toEl:n,newIndex:fe,newDraggableIndex:He,originalEvent:e})}if(e.preventDefault!==void 0&&e.cancelable&&e.preventDefault(),s=we(s,l.draggable,n,!0),P("dragOver"),C.eventCanceled)return _;if(v.contains(e.target)||s.animated&&s.animatingX&&s.animatingY||$._ignoreWhileAnimating===s)return L(!1);if(Zn=!1,d&&!l.disabled&&(m?h||(o=U!==W):Q===this||(this.lastPutMode=Cn.checkPull(this,d,v,e))&&c.checkPut(this,d,v,e))){if(S=this._getDirection(e,s)==="vertical",a=G(v),P("dragOverValid"),C.eventCanceled)return _;if(o)return U=W,F(),this._hideClone(),P("revert"),C.eventCanceled||(tt?W.insertBefore(v,tt):W.appendChild(v)),L(!0);var Y=qa(n,l.draggable);if(!Y||nc(e,S,this)&&!Y.animated){if(Y===v)return L(!1);if(Y&&n===e.target&&(s=Y),s&&(r=G(s)),In(W,n,v,a,s,r,e,!!s)!==!1)return F(),Y&&Y.nextSibling?n.insertBefore(v,Y.nextSibling):n.appendChild(v),U=n,ie(),L(!0)}else if(Y&&tc(e,S,this)){var ge=At(n,0,l,!0);if(ge===v)return L(!1);if(s=ge,r=G(s),In(W,n,v,a,s,r,e,!1)!==!1)return F(),n.insertBefore(v,ge),U=n,ie(),L(!0)}else if(s.parentNode===n){r=G(s);var ke=0,Ye,Lt=v.parentNode!==n,ue=!Xl(v.animated&&v.toRect||a,s.animated&&s.toRect||r,S),Rt=S?"top":"left",Fe=hi(s,"top","top")||hi(v,"top","top"),Nt=Fe?Fe.scrollTop:void 0;ft!==s&&(Ye=r[Rt],sn=!1,Tn=!ue&&l.invertSwap||Lt),ke=sc(e,s,r,S,ue?1:l.swapThreshold,l.invertedSwapThreshold==null?l.swapThreshold:l.invertedSwapThreshold,Tn,ft===s);var Pe;if(ke!==0){var Xe=ve(v);do Xe-=ke,Pe=U.children[Xe];while(Pe&&(T(Pe,"display")==="none"||Pe===I))}if(ke===0||Pe===s)return L(!1);ft=s,nn=ke;var qt=s.nextElementSibling,ze=!1;ze=ke===1;var Sn=In(W,n,v,a,s,r,e,ze);if(Sn!==!1)return(Sn===1||Sn===-1)&&(ze=Sn===1),fa=!0,setTimeout(ec,30),F(),ze&&!qt?n.appendChild(v):s.parentNode.insertBefore(v,ze?qt:s),Fe&&yr(Fe,0,Nt-Fe.scrollTop),U=v.parentNode,Ye!==void 0&&!Tn&&(Hn=Math.abs(Ye-G(s)[Rt])),ie(),L(!0)}if(n.contains(v))return L(!1)}return!1},_ignoreWhileAnimating:null,_offMoveEvents:function(){A(document,"mousemove",this._onTouchMove),A(document,"touchmove",this._onTouchMove),A(document,"pointermove",this._onTouchMove),A(document,"dragover",Ze),A(document,"mousemove",Ze),A(document,"touchmove",Ze)},_offUpEvents:function(){var e=this.el.ownerDocument;A(e,"mouseup",this._onDrop),A(e,"touchend",this._onDrop),A(e,"pointerup",this._onDrop),A(e,"pointercancel",this._onDrop),A(e,"touchcancel",this._onDrop),A(document,"selectstart",this)},_onDrop:function(e){var n=this.el,s=this.options;if(fe=ve(v),He=ve(v,s.draggable),le("drop",this,{evt:e}),U=v&&v.parentNode,fe=ve(v),He=ve(v,s.draggable),C.eventCanceled){this._nulling();return}gt=!1,Tn=!1,sn=!1,clearInterval(this._loopId),clearTimeout(this._dragStartTimer),ha(this.cloneId),ha(this._dragStartId),this.nativeDraggable&&(A(document,"drop",this),A(n,"dragstart",this._onDragStart)),this._offMoveEvents(),this._offUpEvents(),Zt&&T(document.body,"user-select",""),T(v,"transform",""),e&&(Gt&&(e.cancelable&&e.preventDefault(),!s.dropBubble&&e.stopPropagation()),I&&I.parentNode&&I.parentNode.removeChild(I),(W===U||Q&&Q.lastPutMode!=="clone")&&H&&H.parentNode&&H.parentNode.removeChild(H),v&&(this.nativeDraggable&&A(v,"dragend",this),Ns(v),v.style["will-change"]="",Gt&&!gt&&pe(v,Q?Q.options.ghostClass:this.options.ghostClass,!1),pe(v,this.options.chosenClass,!1),re({sortable:this,name:"unchoose",toEl:U,newIndex:null,newDraggableIndex:null,originalEvent:e}),W!==U?(fe>=0&&(re({rootEl:U,name:"add",toEl:U,fromEl:W,originalEvent:e}),re({sortable:this,name:"remove",toEl:U,originalEvent:e}),re({rootEl:U,name:"sort",toEl:U,fromEl:W,originalEvent:e}),re({sortable:this,name:"sort",toEl:U,originalEvent:e})),Q&&Q.save()):fe!==bt&&fe>=0&&(re({sortable:this,name:"update",toEl:U,originalEvent:e}),re({sortable:this,name:"sort",toEl:U,originalEvent:e})),C.active&&((fe==null||fe===-1)&&(fe=bt,He=tn),re({sortable:this,name:"end",toEl:U,originalEvent:e}),this.save()))),this._nulling()},_nulling:function(){le("nulling",this),W=v=U=I=tt=H=Wn=je=Je=_e=Gt=fe=He=bt=tn=ft=nn=Q=Cn=C.dragged=C.ghost=C.clone=C.active=null;var e=this.el;ts.forEach(function(n){e.contains(n)&&(n.checked=!0)}),ts.length=Os=Ls=0},handleEvent:function(e){switch(e.type){case"drop":case"dragend":this._onDrop(e);break;case"dragenter":case"dragover":v&&(this._onDragOver(e),Zl(e));break;case"selectstart":e.preventDefault();break}},toArray:function(){for(var e=[],n,s=this.el.children,a=0,r=s.length,o=this.options;a<r;a++)n=s[a],we(n,o.draggable,this.el,!1)&&e.push(n.getAttribute(o.dataIdAttr)||ic(n));return e},sort:function(e,n){var s={},a=this.el;this.toArray().forEach(function(r,o){var l=a.children[o];we(l,this.options.draggable,a,!1)&&(s[r]=l)},this),n&&this.captureAnimationState(),e.forEach(function(r){s[r]&&(a.removeChild(s[r]),a.appendChild(s[r]))}),n&&this.animateAll()},save:function(){var e=this.options.store;e&&e.set&&e.set(this)},closest:function(e,n){return we(e,n||this.options.draggable,this.el,!1)},option:function(e,n){var s=this.options;if(n===void 0)return s[e];var a=_n.modifyOption(this,e,n);typeof a<"u"?s[e]=a:s[e]=n,e==="group"&&Sr(s)},destroy:function(){le("destroy",this);var e=this.el;e[ce]=null,A(e,"mousedown",this._onTapStart),A(e,"touchstart",this._onTapStart),A(e,"pointerdown",this._onTapStart),this.nativeDraggable&&(A(e,"dragover",this),A(e,"dragenter",this)),Array.prototype.forEach.call(e.querySelectorAll("[draggable]"),function(n){n.removeAttribute("draggable")}),this._onDrop(),this._disableDelayedDragEvents(),es.splice(es.indexOf(this.el),1),this.el=e=null},_hideClone:function(){if(!je){if(le("hideClone",this),C.eventCanceled)return;T(H,"display","none"),this.options.removeCloneOnHide&&H.parentNode&&H.parentNode.removeChild(H),je=!0}},_showClone:function(e){if(e.lastPutMode!=="clone"){this._hideClone();return}if(je){if(le("showClone",this),C.eventCanceled)return;v.parentNode==W&&!this.options.group.revertClone?W.insertBefore(H,v):tt?W.insertBefore(H,tt):W.appendChild(H),this.options.group.revertClone&&this.animate(v,H),T(H,"display",""),je=!1}}};function Zl(t){t.dataTransfer&&(t.dataTransfer.dropEffect="move"),t.cancelable&&t.preventDefault()}function In(t,e,n,s,a,r,o,l){var c,d=t[ce],m=d.options.onMove,h;return window.CustomEvent&&!Be&&!yn?c=new CustomEvent("move",{bubbles:!0,cancelable:!0}):(c=document.createEvent("Event"),c.initEvent("move",!0,!0)),c.to=e,c.from=t,c.dragged=n,c.draggedRect=s,c.related=a||e,c.relatedRect=r||G(e),c.willInsertAfter=l,c.originalEvent=o,t.dispatchEvent(c),m&&(h=m.call(d,c,o)),h}function Ns(t){t.draggable=!1}function ec(){fa=!1}function tc(t,e,n){var s=G(At(n.el,0,n.options,!0)),a=wr(n.el,n.options,I),r=10;return e?t.clientX<a.left-r||t.clientY<s.top&&t.clientX<s.right:t.clientY<a.top-r||t.clientY<s.bottom&&t.clientX<s.left}function nc(t,e,n){var s=G(qa(n.el,n.options.draggable)),a=wr(n.el,n.options,I),r=10;return e?t.clientX>a.right+r||t.clientY>s.bottom&&t.clientX>s.left:t.clientY>a.bottom+r||t.clientX>s.right&&t.clientY>s.top}function sc(t,e,n,s,a,r,o,l){var c=s?t.clientY:t.clientX,d=s?n.height:n.width,m=s?n.top:n.left,h=s?n.bottom:n.right,y=!1;if(!o){if(l&&Hn<d*a){if(!sn&&(nn===1?c>m+d*r/2:c<h-d*r/2)&&(sn=!0),sn)y=!0;else if(nn===1?c<m+Hn:c>h-Hn)return-nn}else if(c>m+d*(1-a)/2&&c<h-d*(1-a)/2)return ac(e)}return y=y||o,y&&(c<m+d*r/2||c>h-d*r/2)?c>m+d/2?1:-1:0}function ac(t){return ve(v)<ve(t)?1:-1}function ic(t){for(var e=t.tagName+t.className+t.src+t.href+t.textContent,n=e.length,s=0;n--;)s+=e.charCodeAt(n);return s.toString(36)}function rc(t){ts.length=0;for(var e=t.getElementsByTagName("input"),n=e.length;n--;){var s=e[n];s.checked&&ts.push(s)}}function Un(t){return setTimeout(t,0)}function ha(t){return clearTimeout(t)}hs&&M(document,"touchmove",function(t){(C.active||gt)&&t.cancelable&&t.preventDefault()});C.utils={on:M,off:A,css:T,find:vr,is:function(e,n){return!!we(e,n,e,!1)},extend:Wl,throttle:br,closest:we,toggleClass:pe,clone:_r,index:ve,nextTick:Un,cancelNextTick:ha,detectDirection:kr,getChild:At,expando:ce};C.get=function(t){return t[ce]};C.mount=function(){for(var t=arguments.length,e=new Array(t),n=0;n<t;n++)e[n]=arguments[n];e[0].constructor===Array&&(e=e[0]),e.forEach(function(s){if(!s.prototype||!s.prototype.constructor)throw"Sortable: Mounted plugin must be a constructor function, not ".concat({}.toString.call(s));s.utils&&(C.utils=Ae(Ae({},C.utils),s.utils)),_n.mount(s)})};C.create=function(t,e){return new C(t,e)};C.version=Fl;var j=[],Kt,ma,ga=!1,qs,Bs,ns,Yt;function oc(){function t(){this.defaults={scroll:!0,forceAutoScrollFallback:!1,scrollSensitivity:30,scrollSpeed:10,bubbleScroll:!0};for(var e in this)e.charAt(0)==="_"&&typeof this[e]=="function"&&(this[e]=this[e].bind(this))}return t.prototype={dragStarted:function(n){var s=n.originalEvent;this.sortable.nativeDraggable?M(document,"dragover",this._handleAutoScroll):this.options.supportPointer?M(document,"pointermove",this._handleFallbackAutoScroll):s.touches?M(document,"touchmove",this._handleFallbackAutoScroll):M(document,"mousemove",this._handleFallbackAutoScroll)},dragOverCompleted:function(n){var s=n.originalEvent;!this.options.dragOverBubble&&!s.rootEl&&this._handleAutoScroll(s)},drop:function(){this.sortable.nativeDraggable?A(document,"dragover",this._handleAutoScroll):(A(document,"pointermove",this._handleFallbackAutoScroll),A(document,"touchmove",this._handleFallbackAutoScroll),A(document,"mousemove",this._handleFallbackAutoScroll)),yi(),jn(),Hl()},nulling:function(){ns=ma=Kt=ga=Yt=qs=Bs=null,j.length=0},_handleFallbackAutoScroll:function(n){this._handleAutoScroll(n,!0)},_handleAutoScroll:function(n,s){var a=this,r=(n.touches?n.touches[0]:n).clientX,o=(n.touches?n.touches[0]:n).clientY,l=document.elementFromPoint(r,o);if(ns=n,s||this.options.forceAutoScrollFallback||yn||Be||Zt){Fs(n,this.options,l,s);var c=Ve(l,!0);ga&&(!Yt||r!==qs||o!==Bs)&&(Yt&&yi(),Yt=setInterval(function(){var d=Ve(document.elementFromPoint(r,o),!0);d!==c&&(c=d,jn()),Fs(n,a.options,d,s)},10),qs=r,Bs=o)}else{if(!this.options.bubbleScroll||Ve(l,!0)===Ee()){jn();return}Fs(n,this.options,Ve(l,!1),!1)}}},qe(t,{pluginName:"scroll",initializeByDefault:!0})}function jn(){j.forEach(function(t){clearInterval(t.pid)}),j=[]}function yi(){clearInterval(Yt)}var Fs=br(function(t,e,n,s){if(e.scroll){var a=(t.touches?t.touches[0]:t).clientX,r=(t.touches?t.touches[0]:t).clientY,o=e.scrollSensitivity,l=e.scrollSpeed,c=Ee(),d=!1,m;ma!==n&&(ma=n,jn(),Kt=e.scroll,m=e.scrollFn,Kt===!0&&(Kt=Ve(n,!0)));var h=0,y=Kt;do{var S=y,$=G(S),_=$.top,P=$.bottom,F=$.left,L=$.right,ie=$.width,Y=$.height,ge=void 0,ke=void 0,Ye=S.scrollWidth,Lt=S.scrollHeight,ue=T(S),Rt=S.scrollLeft,Fe=S.scrollTop;S===c?(ge=ie<Ye&&(ue.overflowX==="auto"||ue.overflowX==="scroll"||ue.overflowX==="visible"),ke=Y<Lt&&(ue.overflowY==="auto"||ue.overflowY==="scroll"||ue.overflowY==="visible")):(ge=ie<Ye&&(ue.overflowX==="auto"||ue.overflowX==="scroll"),ke=Y<Lt&&(ue.overflowY==="auto"||ue.overflowY==="scroll"));var Nt=ge&&(Math.abs(L-a)<=o&&Rt+ie<Ye)-(Math.abs(F-a)<=o&&!!Rt),Pe=ke&&(Math.abs(P-r)<=o&&Fe+Y<Lt)-(Math.abs(_-r)<=o&&!!Fe);if(!j[h])for(var Xe=0;Xe<=h;Xe++)j[Xe]||(j[Xe]={});(j[h].vx!=Nt||j[h].vy!=Pe||j[h].el!==S)&&(j[h].el=S,j[h].vx=Nt,j[h].vy=Pe,clearInterval(j[h].pid),(Nt!=0||Pe!=0)&&(d=!0,j[h].pid=setInterval(function(){s&&this.layer===0&&C.active._onTouchMove(ns);var qt=j[this.layer].vy?j[this.layer].vy*l:0,ze=j[this.layer].vx?j[this.layer].vx*l:0;typeof m=="function"&&m.call(C.dragged.parentNode[ce],ze,qt,t,ns,j[this.layer].el)!=="continue"||yr(j[this.layer].el,ze,qt)}.bind({layer:h}),24))),h++}while(e.bubbleScroll&&y!==c&&(y=Ve(y,!1)));ga=d}},30),Tr=function(e){var n=e.originalEvent,s=e.putSortable,a=e.dragEl,r=e.activeSortable,o=e.dispatchSortableEvent,l=e.hideGhostForTarget,c=e.unhideGhostForTarget;if(n){var d=s||r;l();var m=n.changedTouches&&n.changedTouches.length?n.changedTouches[0]:n,h=document.elementFromPoint(m.clientX,m.clientY);c(),d&&!d.el.contains(h)&&(o("spill"),this.onSpill({dragEl:a,putSortable:s}))}};function Ba(){}Ba.prototype={startIndex:null,dragStart:function(e){var n=e.oldDraggableIndex;this.startIndex=n},onSpill:function(e){var n=e.dragEl,s=e.putSortable;this.sortable.captureAnimationState(),s&&s.captureAnimationState();var a=At(this.sortable.el,this.startIndex,this.options);a?this.sortable.el.insertBefore(n,a):this.sortable.el.appendChild(n),this.sortable.animateAll(),s&&s.animateAll()},drop:Tr};qe(Ba,{pluginName:"revertOnSpill"});function Fa(){}Fa.prototype={onSpill:function(e){var n=e.dragEl,s=e.putSortable,a=s||this.sortable;a.captureAnimationState(),n.parentNode&&n.parentNode.removeChild(n),a.animateAll()},drop:Tr};qe(Fa,{pluginName:"removeOnSpill"});C.mount(new oc);C.mount(Fa,Ba);class lc extends me{static properties={playlistId:{type:String}};constructor(){super(),this.playlistId="",this._query=""}deps(){return[i.playlistVersion,i.songs,this.playlistId,this._query]}get already(){const e=i.playlists.find(n=>n.id===this.playlistId);return new Set(e?.songIds||[])}get filtered(){const e=this._query.trim().toLowerCase();return e?i.songs.filter(n=>`${n.title} ${n.artist} ${n.album}`.toLowerCase().includes(e)):i.songs}render(){const e=this.already,n=this.filtered,s=i.songs.filter(a=>!e.has(a.id)).length;return p`
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
          ${this._query.trim()?`匹配 ${D(n.length)} 首`:`共 ${D(i.songs.length)} 首 · 其中 ${D(s)} 首尚未加入`}
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
        ${n.length?Ie(n,a=>a.id,a=>{const r=e.has(a.id);return p`
                    <label class="addsongs__row">
                      <input type="checkbox" data-song-check=${a.id} ?checked=${r} ?disabled=${r} />
                      <span class="addsongs__text">
                        <span class="addsongs__title u-ellipsis">${a.title}</span>
                        <span class="addsongs__sub u-ellipsis">${a.artist}${a.album?` · ${a.album}`:""}</span>
                      </span>
                      ${r?p`<span class="addsongs__tag">已在歌单</span>`:B}
                    </label>
                  `}):p`<div class="addsongs__empty">没有匹配的歌曲</div>`}
      </div>
    `}setAll(e){for(const n of this.querySelectorAll("[data-song-check]:not(:disabled)"))n.checked=e}}te("mp-add-songs",lc);function Er(t){ee({title:"新建歌单",desc:"歌单名称可以随时修改。",body:p`<input class="input" data-field="name" type="text" placeholder="例如：深夜循环" maxlength="40" />`,okText:"创建",onOk:e=>{const n=String(e.name||"").trim();if(!n)return"请输入歌单名称";if(i.playlists.some(a=>a.name===n))return"已存在同名歌单";const s=Co(n);return t?.(s),u(`已创建歌单「${n}」`,{tone:"success"}),!0}})}function cc(t,e){const n=Ne(t);!n||n.locked||ee({title:"重命名歌单",body:p`<input class="input" data-field="name" type="text" .value=${n.name} maxlength="40" />`,okText:"保存",onOk:s=>{const a=String(s.name||"").trim();return a?(Eo(t,a),!0):"名称不能为空"}})}function dc(t,e){const n=Ne(t);!n||n.locked||ee({title:`删除歌单「${n.name}」？`,desc:"只会删除歌单本身，本地音乐文件不会被删除。",okText:"删除",danger:!0,onOk:()=>(To(t),e?.(),u("歌单已删除"),!0)})}function ss(t,e){const n=Ne(t);if(!n)return;const s=xo(t,e);s?u(`已添加 ${s} 首到「${n.name}」`,{tone:"success"}):u("所选歌曲已在该歌单中")}function uc(t){const e=Ne(t);if(!e)return;if(!i.songs.length){u("本地曲库还是空的，先扫描音乐文件夹吧",{tone:"warning"});return}const n=new Set(e.songIds);ee({title:`添加歌曲到「${e.name}」`,desc:"勾选要加入的歌曲；已经在歌单里的会保持选中。",body:p`<mp-add-songs .playlistId=${t}></mp-add-songs>`,okText:"加入歌单",onOk:(s,a)=>{const o=[...a.querySelectorAll("[data-song-check]:checked")].map(l=>l.dataset.songCheck).filter(l=>!n.has(l));return o.length?(ss(t,o),!0):"没有选中新的歌曲"}})}function va(t,e){const n=Ne(t);if(!n)return;const s=[{id:"play",label:"播放这个歌单",icon:"play"},{id:"queue",label:"加入播放列表",icon:"queue"},{id:"sep1",kind:"sep"}];n.locked||(s.push({id:"rename",label:"重命名",icon:"edit"}),s.push({id:"delete",label:"删除歌单",icon:"trash",danger:!0}),s.push({id:"sep2",kind:"sep"}));const a=e.getBoundingClientRect();ln({x:a.left,y:a.bottom+6,align:"right",items:s,onPick:async r=>{switch(r){case"play":pc(n);break;case"queue":{(await ct(()=>import("./base-CKcVTdc-.js").then(l=>l.ah),__vite__mapDeps([0,1]))).appendToQueue(n.songIds),u(`已把 ${D(n.songIds.length)} 首加入播放列表`,{tone:"success"});break}case"rename":cc(n.id);break;case"delete":dc(n.id,()=>wt("library"));break}}})}function pc(t){ct(async()=>{const{playContext:e}=await import("./base-CKcVTdc-.js").then(n=>n.ah);return{playContext:e}},__vite__mapDeps([0,1])).then(({playContext:e})=>{e(t.songIds.slice(),0,{type:"playlist",id:t.id})})}let _i=0;class fc extends me{static deps=e=>[e.view,e.playlistId,e.playlistVersion,e.songs.length,e.queue.length];firstUpdated(){this.bindDrag()}bindDrag(){const e=this.querySelector("#playlist-nav");!e||this._sortable||(this._sortable=C.create(e,{draggable:".navitem",filter:'[data-locked="true"]',animation:0,ghostClass:"is-dragging",onEnd:n=>this.onDragEnd(n)}))}onDragEnd(e){_i=Date.now();const n=e.oldIndex,s=e.newIndex;if(n==null||s==null||n===s)return;const a=e.from,r=Array.from(a.children).filter(o=>o!==e.item);a.insertBefore(e.item,r[n]??null),Io(n-1,s-1),u("已调整歌单顺序",{duration:1400})}onSidebarClick(e){if(Date.now()-_i<260)return;const n=e.target.closest('[data-act="pl-more"]');if(n){e.stopPropagation(),va(n.dataset.id,n);return}const s=e.target.closest("[data-nav]");if(!s)return;const a=s.dataset.nav;a==="playlist"?wt("playlist",s.dataset.playlist):wt(a)}render(){const e=i.playlists.filter(a=>a.id!==qn),s=[Ne(qn),...e].filter(Boolean);return p`
      <aside
        class="sidebar"
        id="sidebar"
        @click=${a=>this.onSidebarClick(a)}
        @contextmenu=${a=>{const r=a.target.closest('[data-nav="playlist"]');r&&(a.preventDefault(),va(r.dataset.playlist,r))}}
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
                @click=${()=>Er(a=>a&&wt("playlist",a.id))}
              >
                ${f("plus")}
              </button>
            </div>
            <div id="playlist-nav">
              ${Ie(s,a=>a.id,a=>this.playlistItem(a))}
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
        ${f(e.id===qn?"heart":"playlist","navitem__icon")}
        <span class="navitem__text">${e.name}</span>
        <span class="navitem__tail">
          <span class="navitem__badge">${D(e.songIds.length)}</span>
          <span class="navitem__more" data-act="pl-more" data-id=${e.id} role="button" aria-label="${e.name}操作"
            >${f("more")}</span
          >
        </span>
      </button>
    `}}te("mp-sidebar",fc);const hc=Oa(class extends La{constructor(){super(...arguments),this.key=B}render(t,e){return this.key=t,e}update(t,[e,n]){return e!==this.key&&(rr(t),this.key=e),n}}),za=[{id:"auto",label:"自动识别（按接口地址与模型名判断）",hint:"识别不出时按 OpenAI 兼容接口处理"},{id:"openai",label:"OpenAI（GPT-5 系列 / o 系列）",hint:"o 系列无法完全关闭思考，只能降到最低档"},{id:"deepseek",label:"DeepSeek（deepseek-chat / reasoner）",hint:"思考模式下 temperature 会被忽略"},{id:"anthropic",label:"Anthropic Claude",hint:"开启思考时 temperature 必须为 1，程序会自动去掉它"},{id:"gemini",label:"Google Gemini",hint:"Pro 系列无法关闭思考"},{id:"qwen",label:"阿里通义千问 Qwen",hint:"仅「混合思考」模型可关闭；部分开源模型只支持流式"},{id:"glm",label:"智谱 GLM",hint:"GLM-5.3 系列传 disabled 会报错"},{id:"kimi",label:"月之暗面 Kimi",hint:"kimi-k3 / k2.7-code 始终思考，传 thinking 会报错"},{id:"minimax",label:"MiniMax",hint:"官方未提供关闭思考的参数，只能保持默认"},{id:"xai",label:"xAI Grok",hint:"reasoning_effort=none 可真正关闭"},{id:"openrouter",label:"OpenRouter（统一网关）",hint:"统一 reasoning 字段；标记 mandatory 的模型不接受关闭"},{id:"siliconflow",label:"SiliconFlow（硅基流动）",hint:"R1 类纯推理模型无法关闭"},{id:"ollama",label:"Ollama（本地，OpenAI 兼容）",hint:"本地兼容层用 reasoning_effort；GPT-OSS 无法完全关闭"}];function mc(t){return za.find(e=>e.id===t)?.label||t||"自动识别"}function Ir(t){return za.find(e=>e.id===t)?.hint||""}const Dr=["off","auto","mica","acrylic","tabbed"],wi={off:"关闭（不透明窗口）",auto:"自动（系统决定）",mica:"云母（Mica）",acrylic:"亚克力（Acrylic）",tabbed:"标签页（Tabbed）"};function Vn(t){return wi[t]||wi.off}function gc(t){const e=document.documentElement;!t||t==="off"?delete e.dataset.backdrop:e.dataset.backdrop=t}async function vc(){let t=null;if(k())try{t=await b.backdrop()}catch(e){console.warn("[backdrop] 读取窗口材质状态失败",e)}return t?t.preview=!1:t={configured:i.config.nativeBackdrop||"off",active:"off",supported:!1,os:"",restartRequired:!1,preview:!k()},i.backdropState=t,gc(t.active),t}let oe=null,Dn=null,$i=0,St=null,as=null,ba=0,ki=0;const Ar=1500,xt="idle",Mt="loading";let $e=xt,st=null,at=!1,zs=0;const bc=12e3;let be=null,Ce=null,Si=null,Gn=!1,Ue=null,yt=null;function yc(t){if(Gn)return!1;if(be&&Ce)return!0;const e=window.AudioContext||window.webkitAudioContext;if(!e)return Gn=!0,!1;try{be=new e,Ce=be.createGain(),Ce.gain.value=1,Si=be.createMediaElementSource(t),Si.connect(Ce),Ce.connect(be.destination);try{Ue=be.createAnalyser(),Ue.fftSize=512,Ue.smoothingTimeConstant=.76,yt=new Uint8Array(Ue.frequencyBinCount),Ce.connect(Ue)}catch{Ue=null,yt=null}return as=null,!0}catch(n){return console.warn("[audio] Web Audio 链路建立失败，退回元素音量",n),Gn=!0,!1}}function Mr(){const t=i.config.loudnessMode||"off";let e=0;t!=="off"&&i.currentId&&(e=i.loudnessGains?.[i.currentId]??0);const n=10**(e/20);return(i.muted?0:i.volume)*n}function Pt(){const t=oe,e=Mr();if(be&&Ce&&!Gn){const n=be.currentTime;try{Ce.gain.cancelScheduledValues(n),Ce.gain.setTargetAtTime(e,n,.015)}catch{Ce.gain.value=e}t&&(t.volume=1),as=e;return}t&&(t.volume=Math.max(0,Math.min(1,e))),as=e}function fn(){Mr()!==as&&Pt()}function _c(t){return t?(be?.state==="suspended"&&be.resume().catch(()=>{}),t.play().catch(e=>{Ec(e)||u(`播放失败：${e?.message??e}`,{tone:"error",duration:5e3})})):Promise.resolve()}function ya(t){if(t){if(i.playing&&t.paused){_c(t);return}!i.playing&&!t.paused&&(at=!0,t.pause())}}function wc(t){const e=Number.isFinite(t.duration)&&t.duration>0?t.duration*1e3:i.duration||0;return e?(Number.isFinite(t.currentTime)?t.currentTime*1e3:i.position)>=e-300:!1}function $c(){$e=Mt,at=!1,st&&clearTimeout(st),st=setTimeout(()=>{st=null,$e===Mt&&Pr(oe)},bc)}function Pr(t){st&&(clearTimeout(st),st=null),$e===Mt&&($e=xt,ya(t||oe))}function Wa(){return oe||(oe=document.getElementById("audio-engine"),oe||(oe=document.createElement("audio"),oe.id="audio-engine",oe.preload="auto",oe.hidden=!0,document.body.appendChild(oe)),oe.crossOrigin="anonymous",Sc(oe),oe)}function kc(){try{return Wa()}catch(t){return console.warn("[audio] 音频元素不可用",t),null}}function Sc(t){t.dataset.bound!=="1"&&(t.dataset.bound="1",t.addEventListener("loadedmetadata",()=>{if(Number.isFinite(t.duration)&&t.duration>0&&(i.duration=t.duration*1e3,nt(),x()),St!=null){const e=St;St=null;try{t.currentTime=Math.max(0,Math.min(e,i.duration||0)/1e3)}catch{}}Pr(t)}),t.addEventListener("timeupdate",()=>{document.getElementById("progress")?.dataset.dragging!=="true"&&(i.position=t.currentTime*1e3,Do(i.position),i.config.resumeProgress===!0&&performance.now()-ki>5e3&&(ki=performance.now(),Ao()),nt())}),t.addEventListener("play",()=>{$e!==Mt&&(at=!1,i.playing=!0,be?.state==="suspended"&&be.resume().catch(()=>{}),nt())}),t.addEventListener("pause",()=>{if(at){at=!1;return}$e!==Mt&&(t.ended||wc(t)||zs&&performance.now()-zs<Ar||(i.playing=!1,nt()))}),t.addEventListener("ended",()=>{if(zs=performance.now(),i.sleepTimer?.type==="after-song"){cn(!0);return}if(i.playMode==="loop-one"){t.currentTime=0,t.play().catch(()=>{});return}cn(!0)}),t.addEventListener("error",()=>{$e=xt,at=!1;const e=Tt();if(!e||Cc(t.error))return;const n=t.error?.code;u(`${n===4?"格式无法播放（解码失败）":n===3?"音频数据损坏":n===2?"网络中断":"音频加载失败"}：${e.title}`,{tone:"error",duration:4e3})}))}function xc(t){const e=Number(i.pendingResumeMs)||0;if(i.pendingResumeMs=0,!e||i.config.resumeProgress!==!0)return 0;const n=t?.duration||i.duration||0;return n&&e>=n-3e3?0:e}function Cc(t){return ba&&performance.now()-ba<Ar?!0:!t||!t.code}async function Tc(){if(!k())return;const t=Wa(),e=Tt();if(!e){Dn!==null&&(t.pause(),t.removeAttribute("src"),t.load(),Dn=null,$e=xt,at=!1);return}if(Dn!==e.id){Dn=e.id,$c();const n=++$i;let s=null;try{s=e.streamUrl||await b.mediaUrl(e.id)}catch(a){$e=xt,u(`无法播放：${a?.message??"取播放地址失败"}`,{tone:"error",duration:5e3});return}if(n!==$i)return;if(!s){$e=xt,u("无法播放：没有取到可播放的地址",{tone:"error",duration:5e3});return}St=xc(e),t.src=s,ba=performance.now(),t.load(),yc(t),Pt(),e.online||Or(e.id),ya(t);return}$e!==Mt&&ya(t)}function Ec(t){const e=t?.name||"";if(e==="AbortError"||e==="NotAllowedError")return!0;const n=String(t?.message||"");return/abort|interrupted by a new load|play\(\) request was interrupted/i.test(n)}const An=new Map;async function Or(t){const e=i.config.loudnessMode||"off";if(e==="off"||!k()||!t||i.loudnessGains?.[t]!==void 0)return;if(An.has(t))return An.get(t);const n=(async()=>{try{const s=i.config.loudnessTarget??-16,a=await b.loudnessLookup(t,s);if(a?.measured){xi(t,a.gainDB);return}if(e==="album")return;const r=await b.loudnessMeasure(t,s);r?.measured&&xi(t,r.gainDB??Ic(r,s))}catch(s){console.warn("[audio] 响度补偿获取失败",s)}finally{An.delete(t)}})();return An.set(t,n),n}function Ic(t,e){if(!t?.integrated)return 0;let n=e-t.integrated;if(t.truePeak){const s=-1-t.truePeak;n>s&&(n=s)}return n>24&&(n=24),n<-24&&(n=-24),Math.round(n*100)/100}function xi(t,e){i.loudnessGains||(i.loudnessGains={}),i.loudnessGains[t]=e,t===i.currentId&&Pt(),nt()}async function Dc(){const t=i.config.loudnessTarget??-16;if(i.loudnessGains={},fn(),nt(),!!k())try{await b.loudnessInvalidateTarget(t)}catch(e){console.warn("[loudness] 失效旧补偿失败",e)}}async function ms(){if(!k())return;const t=i.config.loudnessMode||"off";if(t==="off"){i.loudnessGains={},fn();return}const e=i.config.loudnessTarget??-16;try{const n=t==="album"?await b.loudnessAlbumGains(e):await b.loudnessGainMap(e);i.loudnessGains=n||{},fn(),nt(),t==="track"&&i.currentId&&Or(i.currentId)}catch(n){console.warn("[loudness] 拉取补偿增益失败",n)}}async function an(){if(!k())return null;try{const t=await b.loudnessState();return t&&(i.loudnessState=t),t}catch{return null}}function is(t){vt(t),Ac(t)}function Ac(t){if(!k())return;const e=Wa();if(!e.src){St=t;return}const n=Math.max(0,Math.min(t,i.duration||0))/1e3;try{e.currentTime=n}catch{St=t}}function Ha(t=32){if(!Ue||!yt)return null;Ue.getByteFrequencyData(yt);const e=Math.max(1,Math.min(128,Math.floor(t)||32)),n=new Float32Array(e),s=yt.length;for(let a=0;a<e;a+=1){const r=Math.floor(s*(a/e)**1.7),o=Math.min(s,Math.max(r+1,Math.floor(s*((a+1)/e)**1.7)));let l=0;for(let c=r;c<o;c+=1)l+=yt[c];n[a]=l/((o-r)*255)}return n}let _a="";function wn(){return i.config.showDesktopLyrics===!0}async function Ci(t,{force:e=!1}={}){const n=!!t,s=wn()!==n;if(i.config.showDesktopLyrics=n,_a="",!s&&!e)return he(),{ok:!0,enabled:n,unchanged:!0};if(!k())return gs({enabled:n}),{ok:!0,preview:!0,enabled:n};try{const a=await b.desktopLyrics(n);return n&&a?.ok===!1&&(i.config.showDesktopLyrics=!1,he()),a}catch(a){return console.warn("[desktop-lyrics] 打开/关闭桌面歌词失败",a),i.config.showDesktopLyrics=!1,he(),{ok:!1,enabled:n,error:String(a?.message??a)}}}function Mc({text:t="",playing:e=!1,fontSize:n=26}={}){if(!wn())return;const s=[t,e?1:0,Math.round(n)].join("|");if(s!==_a){if(_a=s,!k()){gs({text:t,playing:e});return}b.updateDesktopLyrics({text:t,playing:e,fontSize:n}).catch(a=>{console.warn("[desktop-lyrics] 同步歌词失败",a?.message??a)})}}function gs({text:t="",playing:e=!1,enabled:n=null}={}){const s=n===null?wn():!!n,a=!k()&&s&&e&&!!t;i.floatingLyrics={show:a,text:t},he()}function Pc(){return Math.round(Aa()*1.3)}const Oc="/skins/";let Te=new Map;const wa=new Set,Ws=new Set;function de(){return Ge(i.currentId)}function Lc(){const t=i.config.lyricsSources;return!Array.isArray(t)||!t.length?!0:t.includes("online")}async function Lr(t){if(!t)return{lines:[],text:"",source:"none"};if(Te.has(t.id))return Te.get(t.id);let e="",n="none";if(k()){const a=await b.loadLyrics(t.id);a&&typeof a=="object"&&typeof a.lrc=="string"?(e=a.lrc,n=a.source||"backend"):typeof a=="string"&&(e=a,n="backend"),!e&&Lc()&&(e=await Rc(t),e&&(n="online"))}if(!e){if(k()){const r={lines:[],text:"",source:"none"};return Te.set(t.id,r),r}const a=i.songs.findIndex(r=>r.id===t.id);e=a===0?Mo:a===1?Po:Nc(t),n="preview"}const s={lines:oa(e),text:e,source:n};return Te.set(t.id,s),s}async function Rc(t){if(wa.has(t.id))return"";wa.add(t.id);try{if(t.online){const n=await b.onlineLyrics(t.title||"",t.artist||"",t.duration||0),s=typeof n?.lrc=="string"?n.lrc:"";return s?(b.lyricsSave(t.id,s,n?.source||"online",!1).catch(()=>{}),s):""}const e=await b.lyricsAutoMatch(t.id);return typeof e?.lrc=="string"?e.lrc:""}catch(e){return console.warn("[lyrics] 在线自动匹配失败",e),""}}function Nc(t){const e=[];for(let n=12;n<Math.max(60,Math.floor((t.duration||18e4)/1e3)-10);n+=9)e.push(`[00:${String(n).padStart(2,"0")}.00]（${t.title} · 暂无歌词文件，接入后端后可读取 .lrc 或内嵌歌词）`);return e.join(`
`)}const $a=new Map;function Ct(t){return $a.get(t)||0}function rt(t,e){if(!t)return 0;const n=Math.round(Number(e)||0);return n?$a.set(t,n):$a.delete(t),z.lyricsText=null,w.ctx&&de()?.id===t&&Z({type:"lyrics",...Me()}),n}let Mn={songId:"",offset:0,lines:[]};function Ua(t){const n=(t?Te.get(t.id):null)?.lines||[],s=Ct(t?.id);if(!s||!n.length)return n;if(Mn.songId===t.id&&Mn.offset===s)return Mn.lines;const a=n.map(r=>({time:r.time+s,text:r.text}));return Mn={songId:t.id,offset:s,lines:a},a}function ye(t){const e=t?Ge(t):de(),n=e?Te.get(e.id):null;return{song:e||null,songId:e?.id||"",text:n?.text||"",source:n?.source||"none",lines:n?.lines||[]}}function Ti(t){switch(t){case"embedded":return"内嵌歌词";case"lrc-file":return"同目录 .lrc";case"cache":return"歌词缓存";case"online":return"在线自动匹配";case"manual":return"手动编辑";case"preview":return"预览数据";default:return"暂无"}}async function rs(){const t=de();if(!(!t||Te.has(t.id)||Ws.has(t.id))){Ws.add(t.id);try{await Lr(t)}finally{Ws.delete(t.id)}}}function qc(){const t=de();if(!t)return"";const e=Ua(t);if(!e.length)return"";const n=Pa(e,i.position);return n>=0?e[n].text:""}function Bc(){const t={prev:"",text:"",next:""},e=de();if(!e)return t;const n=Ua(e);if(!n.length)return t;const s=Pa(n,i.position);return s<0?t:{prev:n[s-1]?.text||"",text:n[s].text||"",next:n[s+1]?.text||""}}async function Hs(t,e,n="online",s={}){if(!t||!e)return!1;Te.set(t,{lines:oa(e),text:e,source:n}),wa.add(t),z.lyricsText=null;let a=null;if(!s.transient&&k()){const r=s.embed??i.config.embedMeta===!0;try{const o=await b.lyricsSave(t,e,n,r);a=o||null;const l=typeof o?.lrc=="string"&&o.lrc?o.lrc:e;l!==e&&(Te.set(t,{lines:oa(l),text:l,source:n}),z.lyricsText=null)}catch(o){console.warn("[lyrics] 写入缓存失败",o)}}return w.ctx&&de()?.id===t&&Z({type:"lyrics",...Me()}),a||{ok:!0}}const ka=[],Us=new Set;let Kn=null;async function ja(){return Kn||(Kn=zc()),Kn}async function Fc(){try{await ja()}catch(t){console.warn("[skins] 启动扫描样式失败",t)}return It()}async function zc(){if(!k())return It();try{const t=await b.listSkins(),e=Array.isArray(t)?t:[];ka.length=0;const n=new Set;for(const s of e){if(!s?.id||!s?.module)continue;const a=`${Oc}${encodeURIComponent(s.id)}/`;try{await Ko({id:s.id,name:s.name,module:a+String(s.module).replace(/^\/+/,""),styles:(Array.isArray(s.styles)?s.styles:[]).map(r=>a+String(r).replace(/^\/+/,""))}),Us.add(s.id),n.add(s.id)}catch(r){ka.push({id:s.id,reason:r?.message??String(r)}),console.warn(`[skins] 样式「${s.id}」加载失败：`,r)}}for(const s of[...Us])n.has(s)||(Us.delete(s),Yo(s))}catch(t){console.warn("[skins] 皮肤目录扫描失败",t)}return It()}async function Va(){Kn=null,await ja(),Hc()}async function Wc(t){await b.deleteSkin(t),await Va();const e=It().some(n=>n.id===t);return!e&&(i.pvMode===t||i.config.playerViewMode===t)&&hn(bn("").skin?.id||""),{removed:!e,skinIds:It().map(n=>n.id)}}function Rr(){return ka.slice()}let Nr=0;function qr(){return Nr}function Hc(){Nr+=1,he()}const w={view:null,stage:null,backgroundRoot:null,skin:null,ctx:null,mountedId:null,closeTimer:null,resizeObserver:null,themeObserver:null,carouselTimer:null,carouselIndex:0,carouselLastAdvance:0,carouselSongId:null},z={songId:null,cover:null,lyricsText:null,options:null,playing:null,themeId:null};function vs(){return{position:i.position,duration:i.duration,playing:i.playing,volume:i.volume,muted:i.muted}}function Ga(t){if(!t)return[ds];const e=i.coverSets.get(t.id)?.items,n=Array.isArray(e)?e.map(s=>s.preview).filter(Boolean):[];return n.length?n:[dt(t)]}function Ka(t){const e=t?Te.get(t.id):null,n=Ua(t);return{lines:n,text:e?.text||"",source:e?.source||"none",index:Pa(n,i.position)}}function Uc(t){return t?{id:t.id??"",title:t.title||"",artist:t.artist||"",album:t.album||"",duration:t.duration||0}:null}function Me(){const t=de(),e=Ga(t),n=We(w.carouselIndex,0,Math.max(0,e.length-1));return{song:Uc(t),cover:e[n]||ds,covers:e,coverIndex:n,lyrics:Ka(t)}}function bs(){return{showLyrics:i.config.showLyrics!==!1,lyricsFontSize:i.config.lyricsFontSize,animations:i.config.animations!==!1,coverCarousel:i.config.coverCarousel===!0,coverCarouselInterval:zr().seconds,interactive:!0}}function jc(){return Me()}function Br(){return vs()}function Vc(t={}){return{...bs(),...t}}function Gc(){const t=new Map,e={root:w.stage,backgroundRoot:w.backgroundRoot,audio:kc(),spectrum:Ha,defaultCover:ds,get themeId(){return document.documentElement.dataset.theme||""},get mode(){return document.documentElement.dataset.mode==="light"?"light":"dark"},playback:vs,media:Me,options:bs,actions:{seek(n){is(n),Wr({force:!0})},togglePlay:gn,next:()=>cn(!1),prev:()=>Ma(),openFolder(){const n=de();n?.path&&b.revealInExplorer(n.path)},openCoverPanel(){const n=de();!n||n.online||ct(()=>Promise.resolve().then(()=>Qa),void 0).then(s=>s.openCoverPanel(n.id))}},on(n,s){return typeof s!="function"?()=>{}:(t.has(n)||t.set(n,new Set),t.get(n).add(s),()=>t.get(n)?.delete(s))},push(n){try{w.skin?.update?.(e,n)}catch(s){console.warn(`[skins] ${w.mountedId} 处理 ${n.type} 更新失败`,s)}for(const[s,a]of t)if(!(s!==n.type&&s!=="*"))for(const r of a)try{r(n)}catch(o){console.warn(`[skins] ${s} 订阅回调失败`,o)}}};return e}function Z(t){w.ctx?.push(t)}function Kc(t){const{skin:e,fellBack:n}=bn(t);if(!e)return;n&&console.warn(`[skins] 样式「${t}」不存在，已回退到「${e.name}」`),Fr(),w.skin=e,w.mountedId=e.id,w.stage.innerHTML="",w.view.dataset.skin=e.id,w.view.dataset.skinBackground=e.background?"yes":"no",document.getElementById("app")?.setAttribute("data-mode",e.id),i.pvMode=e.id;const s=Gc();w.ctx=s;try{e.mount(s)}catch(a){console.error(`[skins] ${e.id} 挂载失败`,a),w.stage.innerHTML=`<div class="skin-error">样式「${Za(e.name)}」加载失败：${Za(a?.message??a)}</div>`;return}s.push({type:"mount",...Me(),...vs(),options:bs()}),Yc(),Sa("closed")}function Sa(t){const e=w.backgroundRoot;e&&(e.dataset.state=t)}function Fr(){if(w.skin){Z({type:"close"}),Z({type:"destroy"});try{w.skin.destroy?.(w.ctx)}catch(t){console.warn(`[skins] ${w.mountedId} 卸载失败`,t)}w.stage.innerHTML="",w.skin=null,w.ctx=null,w.mountedId=null,w.resizeObserver&&(w.resizeObserver.disconnect(),w.resizeObserver=null)}}function Yc(){w.resizeObserver||typeof ResizeObserver!="function"||(w.resizeObserver=new ResizeObserver(()=>{const t=w.stage.getBoundingClientRect();Z({type:"resize",width:Math.round(t.width),height:Math.round(t.height)})}),w.resizeObserver.observe(w.stage))}function zr(){const t=Number(i.config.coverCarouselInterval),e=Number.isFinite(t)&&t>0?Math.max(2,t):10;return{enabled:i.config.coverCarousel===!0,seconds:e,intervalMs:e*1e3}}function Xc(){const t=de();w.carouselSongId!==(t?.id??null)&&(w.carouselSongId=t?.id??null,w.carouselIndex=i.coverSets.get(t?.id)?.active??0,w.carouselLastAdvance=Date.now());const{enabled:e,intervalMs:n}=zr(),s=Ga(t);!e||!i.playerOpen||!i.playing||s.length<2||Date.now()-w.carouselLastAdvance<n||(w.carouselLastAdvance=Date.now(),w.carouselIndex=(w.carouselIndex+1)%s.length,Z({type:"media",...Me()}))}function Qc(){w.carouselTimer||(w.carouselTimer=setInterval(Xc,1e3))}function Jc(){const t=Ga(de());return t.length<2?!1:(w.carouselIndex=(w.carouselIndex+1)%t.length,w.carouselLastAdvance=Date.now(),Z({type:"media",...Me()}),!0)}function Ei(){z.cover=null,w.ctx&&Z({type:"media",...Me()})}function js(t={}){const e=Me(),n=t.type==="song"||t.type==="lyrics"||t.type==="media",s=e.cover!==z.cover||e.song?.id!==z.songId;z.cover=e.cover,!(!s&&!n)&&Z({...t,...e})}function Ii(){const t=bs(),e=JSON.stringify(t);e!==z.options&&(z.options=e,Z({type:"options",options:t}))}async function Zc(){if(!w.view){if(w.view=ei("#playerview"),w.stage=ei("#playerview-stage"),w.backgroundRoot=document.getElementById("skin-background"),!w.view||!w.stage)return;ad(),Qc()}const t=w.view,e=de();if(!!!i.playerOpen){t.dataset.state!=="closed"&&(t.dataset.state="closed",Sa("closed"),w.closeTimer&&clearTimeout(w.closeTimer),w.closeTimer=setTimeout(()=>{w.closeTimer=null,!i.playerOpen&&(t.hidden=!0,Fr(),os())},Pc()+20));return}w.closeTimer&&(clearTimeout(w.closeTimer),w.closeTimer=null),t.hidden=!1,await ja();const s=i.pvMode||i.config.playerViewMode||"",a=w.mountedId!==s;if(a&&(Kc(s),os()),(t.dataset.state!=="opened"||a)&&(t.offsetHeight,t.dataset.state="opened",Sa("opened")),!w.skin)return;if(z.songId!==(e?.id??null)){z.songId=e?.id??null,z.cover=null,z.lyricsText=null,w.carouselSongId=e?.id??null,w.carouselIndex=i.coverSets.get(e?.id)?.active??0,js({type:"song"});const o=e?.id??null,l=await Lr(e);if((de()?.id??null)!==o)return;z.lyricsText=l.text,js({type:"lyrics"}),Ii();return}js();const r=Ka(e);r.text!==z.lyricsText&&(z.lyricsText=r.text,Z({type:"lyrics",...Me()})),Ii(),Wr()}function os(){z.songId=null,z.cover=null,z.lyricsText=null,z.options=null,z.playing=null}function Wr({force:t=!1}={}){if(!i.playerOpen||!w.skin)return;const e=vs();(z.playing!==e.playing||t)&&(z.playing=e.playing,Z({type:"state",...e})),Z({type:"progress",...e,lyricIndex:Ka(de()).index}),sd(e.playing)}const ed=30,td=32;let zt=0,Wt=!1;function nd(){const t=w.skin?.spectrum;if(!t)return 0;const e=Number(t);return!Number.isFinite(e)||e<=0?td:Math.max(1,Math.min(256,Math.round(e)))}function sd(t){const e=t===!0?nd():0;if(!e){if(zt=0,!Wt)return;Wt=!1,Z({type:"spectrum",bands:null});return}const n=typeof performance<"u"&&performance.now?performance.now():Date.now();if(zt&&n-zt<1e3/ed)return;const s=Ha(e);if(!s){if(!Wt)return;zt=0,Wt=!1,Z({type:"spectrum",bands:null});return}zt=n,Wt=!0,Z({type:"spectrum",bands:Array.from(s,a=>Math.round(a*1e3)/1e3)})}function ad(){w.themeObserver||(z.themeId=document.documentElement.dataset.theme||"",w.themeObserver=new MutationObserver(()=>{const t=document.documentElement.dataset.theme||"",e=document.documentElement.dataset.mode||"dark";t!==z.themeId&&(z.themeId=t,Z({type:"theme",themeId:t,mode:e}))}),w.themeObserver.observe(document.documentElement,{attributes:!0,attributeFilter:["data-theme","data-mode"]}))}function hn(t){const{skin:e,fellBack:n}=bn(t);e&&(i.pvMode=e.id,i.config.playerViewMode=e.id,os(),x(),n&&console.warn(`[skins] 样式「${t}」不可用，已切换到「${e.name}」`))}function Hr(){i.playerOpen=!0,i.pvMode=bn(i.config.playerViewMode||"").skin?.id||i.pvMode,os(),x()}function ys(){i.playerOpen=!1,x()}function xa(){i.playerOpen?ys():Hr()}function ls(){return It().map(t=>({id:t.id,name:t.name,icon:t.icon||"disc",builtin:t.builtin!==!1,source:t.source||""}))}function $n(){return i.config.showDesktopWallpaper===!0}function Vs(){he()}async function id(){if(!k())return!0;let t=!0,e="";try{const n=await b.desktopWallpaperState();t=n?.supported!==!1,e=n?.reason||""}catch(n){return console.info("[desktop-wallpaper] 能力探测失败",n?.message??n),!0}return t?!0:(i.desktopWallpaperSupport={supported:!1,reason:e||"当前系统不支持桌面背景歌词"},he(),!1)}async function Di(t,{force:e=!1}={}){const n=!!t,s=$n()!==n;if(i.config.showDesktopWallpaper=n,Vs(),!s&&!e)return{ok:!0,enabled:n,unchanged:!0};if(!k())return n?(Ca(),{ok:!0,preview:!0,enabled:n}):(gs({enabled:!1}),{ok:!0,preview:!0,enabled:n});try{const a=await b.desktopWallpaper(n);return n&&a?.ok===!1?(i.config.showDesktopWallpaper=!1,Vs(),x()):n&&(rd(),Ca()),a}catch(a){return console.warn("[desktop-wallpaper] 打开/关闭桌面背景歌词失败",a),i.config.showDesktopWallpaper=!1,Vs(),x(),{ok:!1,enabled:n,error:String(a?.message??a)}}}const E={setup:"",songId:"\0",cover:"\0",lyricsText:"\0",options:"",playing:null,volume:null,muted:null,duration:-1,lyricIndex:-2,position:-1,progressAt:0,progressPlaying:null};function rd(){E.setup="",E.songId="\0",E.cover="\0",E.lyricsText="\0",E.options="",E.playing=null,E.volume=null,E.muted=null,E.duration=-1,E.lyricIndex=-2,E.position=-1,E.progressAt=0,E.progressPlaying=null}function od(){const t=[],e=pd();e.signature!==E.setup&&(E.setup=e.signature,t.push({type:"theme",skinId:e.skinId,themeId:e.theme,theme:e.theme,mode:e.mode,density:e.density,tokens:e.tokens}));const n=jc(),s=Br(),a=Vc({interactive:!1}),r=n.song?.id??"";r!==E.songId?(E.songId=r,E.cover=n.cover,E.lyricsText=n.lyrics.text,E.lyricIndex=n.lyrics.index,E.duration=s.duration,E.progressPlaying=s.playing,E.progressAt=Ai(),t.push({type:"song",song:n.song,cover:n.cover,covers:n.covers,coverIndex:n.coverIndex,lyrics:n.lyrics})):(n.cover!==E.cover&&(E.cover=n.cover,t.push({type:"media",cover:n.cover,covers:n.covers,coverIndex:n.coverIndex})),n.lyrics.text!==E.lyricsText&&(E.lyricsText=n.lyrics.text,E.lyricIndex=n.lyrics.index,t.push({type:"lyrics",lyrics:n.lyrics})));const o=JSON.stringify(a);o!==E.options&&(E.options=o,t.push({type:"options",options:a})),(s.playing!==E.playing||s.volume!==E.volume||s.muted!==E.muted)&&(E.playing=s.playing,E.volume=s.volume,E.muted=s.muted,t.push({type:"state",playing:s.playing,volume:s.volume,muted:s.muted}));const l=Ai(),c=ud(l,s.playing);return c&&t.push(c),(s.position!==E.position||n.lyrics.index!==E.lyricIndex||s.duration!==E.duration||s.playing!==E.progressPlaying)&&(E.position=s.position,E.lyricIndex=n.lyrics.index,E.duration=s.duration,E.progressPlaying=s.playing,E.progressAt=l,t.push({type:"progress",position:s.position,duration:s.duration,playing:s.playing,lyricIndex:n.lyrics.index})),t}function Ai(){return typeof performance<"u"&&performance.now?performance.now():Date.now()}const ld=40,cd=32;let Ht=0,Ut=!1;function dd(){const t=i.pvMode||i.config.playerViewMode||"";try{const e=bn(t).skin?.spectrum;if(!e)return 0;const n=Number(e);return!Number.isFinite(n)||n<=0?cd:Math.max(1,Math.min(256,Math.round(n)))}catch{return 0}}function ud(t,e){const n=$n()&&e===!0?dd():0;if(!n)return Ht=0,Ut?(Ut=!1,{type:"spectrum",bands:null}):null;if(Ht&&t-Ht<ld)return null;const s=Ha(n);return s?(Ht=t,Ut=!0,{type:"spectrum",bands:Array.from(s,a=>Math.round(a*100)/100)}):Ut?(Ht=0,Ut=!1,{type:"spectrum",bands:null}):null}function Ca(){if($n()){if(!k()){const t=Bc();gs({text:t.text,playing:Br().playing});return}for(const t of od())b.updateDesktopWallpaper(t).catch(e=>{console.warn("[desktop-wallpaper] 同步背景歌词失败",e?.message??e)})}}function pd(){const t=hd(),e=i.pvMode||i.config.playerViewMode||"",n=document.documentElement.dataset.theme||"",s=document.documentElement.dataset.mode||"dark",a=document.documentElement.dataset.density||"";return{skinId:e,theme:n,mode:s,density:a,tokens:t.values,signature:[e,n,s,a,t.signature].join("|")}}function fd(){const t=i.config||{};return[document.documentElement.dataset.theme||"",document.documentElement.dataset.mode||"",document.documentElement.dataset.density||"",t.glassBlurCustom?t.glassBlur:"",t.glassAlphaCustom?t.glassAlpha:"",t.accentFromCover?1:0,t.coverSeed||"",t.coverSeed2||"",t.animations===!1?0:1,t.animationsSpeed||"",t.lyricsFontSize,t.listDensity||""].join("|")}let Mi="\0",Pi={};function hd(){const t=fd();return t!==Mi&&(Mi=t,Pi=md()),{signature:t,values:Pi}}function md(){const t=new Set(Object.keys(Oo()));for(const s of document.styleSheets){let a=null;try{a=s.cssRules}catch{continue}Ur(a,t,0)}const e=getComputedStyle(document.documentElement),n={};for(const s of t){const a=e.getPropertyValue(s).trim();!a||/[;{}]/.test(a)||(n[s]=a)}return n}function Ur(t,e,n){if(!(!t||n>3))for(const s of t){if(s.style)for(const a of s.style)a.startsWith("--")&&e.add(a);s.cssRules&&Ur(s.cssRules,e,n+1)}}const K=Object.freeze({off:"off",lyrics:"lyrics",wallpaper:"wallpaper"});function gd(){return i.config.showDesktopWallpaper===!0?K.wallpaper:i.config.showDesktopLyrics===!0?K.lyrics:K.off}async function jr(t){const e=vd(t),n=gd();if(e===n)return{ok:!0,mode:e,unchanged:!0};const s=await Oi(e);return s?.ok!==!1?{ok:!0,...s,mode:e}:n!==K.off&&(await Oi(n))?.ok!==!1?{ok:!1,...s,mode:n,restored:!0}:{ok:!1,...s,mode:K.off}}async function Oi(t){return t!==K.lyrics&&await Ci(!1),t!==K.wallpaper&&await Di(!1),t===K.lyrics?Ci(!0):t===K.wallpaper?Di(!0):{ok:!0}}function vd(t){return t===K.lyrics?K.lyrics:t===K.wallpaper?K.wallpaper:K.off}const bd=[{value:"play",label:"播放"},{value:"play-list",label:"播放当前列表"},{value:"next",label:"下一首播放"}],yd=[{value:"system",label:"跟随系统"},{value:"round",label:"标准"},{value:"small",label:"小圆角"},{value:"square",label:"直角"}],_d=[{value:"compact",label:"紧凑"},{value:"cozy",label:"标准"},{value:"roomy",label:"宽松"}],wd=[{value:"fast",label:"快速 0.25s"},{value:"medium",label:"适中 0.5s"},{value:"slow",label:"缓慢 0.75s"}],$d={embedded:"内嵌歌词","lrc-file":"同目录 .lrc",cache:"歌词缓存",online:"在线自动匹配"};function kd(){const e=(Array.isArray(i.config.lyricsSources)?i.config.lyricsSources:[]).map(n=>$d[n]||n);return e.length?e.join(" → "):"（未配置）"}function Ya(){const t=i.coverCache;if(!t)return"正在读取…";const e=((t.bytes||0)/1024/1024).toFixed(1);return`已缓存 ${D(t.covers||0)} 张封面、${D(t.lyrics||0)} 份歌词，共 ${e} MB`}function Vr(){const t=i.coverCache||{};return(Number(t.covers)||0)+(Number(t.lyrics)||0)}function Sd(){const t="默认关闭：封面与歌词都只放在缓存目录里。开启后下载 / 更换封面时会把它们写进文件标签，这样把文件拷到别的播放器上也能看到封面与歌词（m4a / flac 支持，mp3 等格式会明确跳过）";return i.coverCache?Vr()===0?`${t}。当前缓存里还没有封面或歌词可写`:`${t}。缓存里已经有 ${Ya()}`:t}function xd(){return`这个开关只对之后下载或更换的封面生效；已经存在缓存里的封面与歌词（${Ya()}）可以用下面的按钮一次性写进歌曲文件。mp3 / wav 等暂不支持写标签的格式会被跳过，不会动你的文件。`}function Li(){const t=ps(),e=[];for(const s of t)for(const a of s.swatch||[])e.includes(a)||e.push(a);const n=e.map((s,a)=>`[data-swatch="${a}"]{background:${s}}`).join(`
`);return Da("swatch-styles",n),s=>(s.swatch||[]).map(a=>e.indexOf(a))}function Cd(t){if(!t?.dir)return`（浏览器预览模式读不到本机目录，以下是源码仓库里的参考文件）
1. 接口唯一定义（含 JSDoc 类型）：frontend/packages/player-skins/src/contract.js
2. 内置三款实现（结构可参考）：frontend/packages/player-skins/src/skins/classic.js、immersive.js、minimal.js
3. 可直接复制改名的最小示例包：数据目录下的 player-skins/_template/（skin.js / skin.css / skin.json）
4. 说明文档：frontend/packages/player-skins/README.md`;const e=["本机真实路径如下。如果你能读文件，请先打开它们当范例；如果读不到（例如纯聊天环境），请让使用者把下面第 2 条的文件内容贴给你，再开始写。",`1. 样式（皮肤）目录 —— 第三方样式包都放在这里，扫描只认它下面的一层子目录：${t.dir}`];t.example?e.push(`2. 示例样式包（完整可运行的 skin.js / skin.css / skin.json，复制改名就是一份新样式）：${t.example}`):e.push("2. 示例样式包：本机没有找到 _template 目录，请只按本规格的接口定义写。"),t.current?e.push(`3. 当前正在使用的样式包（最贴近现状的参考）：${t.current}`):e.push(`3. 当前正在使用的是内置样式（${t.currentId||"classic / immersive / minimal"}）：它的源码打包在程序里，磁盘上没有对应目录，请以第 2 条的示例包为准。`);const n=Array.isArray(t.packs)?t.packs:[];if(n.length){e.push("4. 该目录里已有的第三方样式包（可以直接读它们的入口与样式）：");for(const s of n){const a=[s.module,...Array.isArray(s.styles)?s.styles:[]].filter(Boolean);e.push(`   · ${s.name||s.id}（id: ${s.id}）：${a.join("、")||s.dir}`)}}else e.push("4. 该目录里目前还没有第三方样式包 —— 你写的这个会是第一个。");return e.push("5. 宿主只加载 apiVersion 为 1 的样式，本程序用的就是这个版本。"),e.join(`
`)}function Td(t){if(!t?.dir)return`（浏览器预览模式读不到本机目录，以下是源码仓库里的参考文件）
1. 令牌默认值与注释：frontend/src/styles/tokens.css、frontend/src/styles/themes/_template.css
2. 内置主题（可直接对照写法）：frontend/src/styles/themes/dark-minimal.css、light-minimal.css、cover-dark.css
3. 扫描与指令解析实现：internal/theme/theme.go`;const e=["本机真实路径如下。如果你能读文件，请先打开它们当范例；如果读不到（例如纯聊天环境），请让使用者把下面第 2 条的文件内容贴给你，再开始写。",`1. 主题目录 —— 用户主题都放在这里，只扫一层、不递归；文件名默认就是主题 id，显示名由 @theme-name 决定：${t.dir}`];t.currentFile?e.push(`2. 当前正在使用的主题：${t.currentName||t.currentId}（id: ${t.currentId}）→ 文件：${t.currentFile}`):e.push("2. 当前主题的文件没找到，请以第 3 条列出的文件为准。");const n=Array.isArray(t.files)?t.files:[];if(n.length){e.push("3. 主题目录里已有的主题文件（都是合法示例，可直接对照写法）：");for(const s of n)e.push(`   · ${s.file}（${s.name||s.id}，id: ${s.id}，模式 ${s.mode}，${s.builtin?"内置":"用户导入"}）`)}else e.push("3. 主题目录里暂时没有 .css 文件。");return e.join(`
`)}function Ed(t=null){return`请为「音乐播放器」（Go + WebView2 的 Windows 桌面应用）产出一个第三方「播放界面样式（皮肤）」包。这个包会被应用直接扫描并加载，因此必须严格满足下面的规格。

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
${Cd(t)}

【八、输出格式】
1. 先写清目录名与文件清单；
2. 再逐个文件输出完整代码，每个文件单独一个代码块，并在代码块第一行用注释标明文件名；
3. 不要省略、不要用省略号占位、不要留 __SKIN_ID__ 之类的占位符，代码要能直接运行。

【九、风格】
本提示词只约定产物必须满足的规则、格式、环境与参考，不规定也不暗示视觉风格；具体样式（布局、配色、动效、气质）由使用者自行构思。
请以使用者随附的风格说明为准；若使用者没有给出，先向使用者确认，不要自行假设。

【风格要求 · 由使用者自行填写（本行只是占位，本提示词不提供任何风格建议）】
`}function Id(t=null){return`请为「音乐播放器」（Go + WebView2 的 Windows 桌面应用）产出一个「外观主题」CSS 文件。

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
${Td(t)}

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
`}function Gr({copyKey:t,importKind:e,importLabel:n}){return p` <div class="card__actions">
    <button class="btn btn--sm btn--primary" type="button" data-copy-prompt=${t}>
      <svg aria-hidden="true"><use href="#i-file"></use></svg><span>复制提示词</span>
    </button>
    <button class="btn btn--sm" type="button" data-import=${e}>
      <svg aria-hidden="true"><use href="#i-folder"></use></svg><span>${n}</span>
    </button>
  </div>`}async function Dd(){if(!k())return null;try{const t=document.documentElement.dataset.theme||i.config.theme||"";return await b.themeReference(t)||null}catch(t){return console.warn("[settings] 读取主题参考资料失败",t),null}}async function Ad(){if(!k())return null;try{const t=i.pvMode||i.config.playerViewMode||"";return await b.skinReference(t)||null}catch(t){return console.warn("[settings] 读取样式参考资料失败",t),null}}async function Md(t){const n=t==="theme"?Id(await Dd()):Ed(await Ad());try{await navigator.clipboard.writeText(n),u("提示词已复制，粘贴给 AI 即可",{tone:"success",duration:2e3});return}catch{}const s=document.createElement("textarea");s.value=n,s.setAttribute("readonly",""),s.style.cssText="position:fixed;left:-9999px;top:0;opacity:0;",document.body.appendChild(s),s.select();let a=!1;try{a=document.execCommand("copy")}catch{a=!1}s.remove(),u(a?"提示词已复制，粘贴给 AI 即可":"复制失败，请手动复制",{tone:a?"success":"warning",duration:2600})}async function Pd(t,e={}){const n=t==="theme";if(!k()){u("浏览器预览模式无法导入，请手动把文件放进目录",{tone:"warning",duration:3600});return}const s=u(n?"正在导入主题…":"正在导入样式包…",{duration:0});try{const a=n?await b.importTheme():await b.importSkin();if(s.close(),a?.cancelled)return;const r=n?Array.isArray(a?.imported)?a.imported:[]:a?.id?[a.id]:[],o=Array.isArray(a?.skipped)?a.skipped:[];n?(await fs(),e.commit?.(),e.render?.()):(await Va(),e.render?.());let l=n?r.length?`已导入 ${r.length} 个主题：${r.join("、")}`:"没有导入任何主题":r.length?`已导入样式「${r[0]}」`:"没有导入任何样式";o.length&&(l+=`；另有 ${o.length} 个文件被跳过`),u(l,{tone:r.length?o.length?"warning":"success":"warning",duration:4600}),o.length&&ee({title:"部分文件没有导入",body:p`<div class="setting__hint setting__hint--steps">
          ${o.map((c,d)=>p`${d?p`<br />`:B}${c}`)}
        </div>`,okText:"知道了",cancelText:"关闭",onOk:()=>!0})}catch(a){s.close(),u(`导入失败：${a?.message??a}`,{tone:"error",duration:6e3})}}function Kr(t,e={}){t.addEventListener("click",n=>{const s=n.target.closest("[data-copy-prompt]");if(s){Md(s.dataset.copyPrompt);return}const a=n.target.closest("[data-import]");a&&Pd(a.dataset.import,e)})}function Od(t={}){const e=p` <div class="setting__hint setting__hint--steps">
      · 点「复制提示词」把它粘贴给
      AI：提示词里只有产物的目录结构、接口契约与硬性规则，不含任何风格建议，风格请在末尾那条「风格要求」里自己补一句，它会直接产出一个样式包目录；<br />
      · 提示词里的「参考资料」会自动带上本机的真实路径（样式目录、示例包 _template、当前样式包），AI
      能读文件就会直接照着写；<br />
      · 生成好后回到这里点「导入样式包」，选中那个目录即可（目录里必须有 skin.js）；<br />
      · 也可以手动放进「样式目录/&lt;样式id&gt;/」，回来点「重新扫描样式」。
    </div>
    ${Gr({copyKey:"skin",importKind:"skin",importLabel:"导入样式包…"})}
    <div class="setting__hint">
      接口的唯一定义在 frontend/packages/player-skins/src/contract.js；样式目录里也有现成的 _template
      示例可以直接复制改名。
    </div>`,{root:n}=ee({title:"用 AI 创建播放界面样式",body:e,okText:"知道了",cancelText:"关闭",onOk:()=>!0});Kr(n,t)}function Ld(t={}){const e=p` <div class="setting__hint setting__hint--steps">
      · 点「复制提示词」把它粘贴给
      AI：提示词里只有文件格式、令牌清单与校验规则，不含任何配色建议，风格请在末尾那条「风格要求」里自己补一句，它会产出一个主题
      CSS；<br />
      · 提示词里的「参考资料」会自动带上本机的真实路径（主题目录、当前主题文件、目录里已有的主题 CSS），AI
      能读文件就会直接照着写；<br />
      · 生成好后回到这里点「导入主题」，选中放着那个 CSS 的文件夹即可；<br />
      · 也可以手动放进主题文件夹（上面有「打开主题文件夹」按钮），回来点「重新扫描主题」。
    </div>
    ${Gr({copyKey:"theme",importKind:"theme",importLabel:"导入主题…"})}
    <div class="setting__hint setting__hint--steps">
      主题只声明颜色，不需要写组件样式，因此换主题不会破坏布局：<br />
      · 选择器写 <b>:root[data-theme="你的文件名"]</b>，与文件名一致最省事；<br />
      · 只改你想要的颜色，其余保持默认即可；<br />
      · 没写到的颜色会自动沿用默认主题，缺失也不会弄坏布局。
    </div>`,{root:n}=ee({title:"添加自定义主题",body:e,okText:"知道了",cancelText:"关闭",onOk:()=>!0});Kr(n,t)}async function Rd(t,e,n){if(!k()){u("浏览器预览模式下不能移除，请手动删除主题文件",{tone:"warning",duration:3600});return}const s=u("正在移除主题…",{duration:0});try{const a=await ol(t);if(s.close(),!a.removed){u(`没有移除「${e}」`,{tone:"warning"});return}await De(i.config),n.commit?.(),n.render?.(),u(`已移除主题「${e}」`,{tone:"success"})}catch(a){s.close(),u(`移除失败：${a?.message??a}`,{tone:"error",duration:6e3})}}function Nd(t,e){const n=t.dataset.id,s=t.dataset.name||n;ee({title:`移除主题「${s}」？`,desc:"会删除这个主题对应的样式文件。内置主题不能移除。",okText:"移除",danger:!0,onOk:async()=>(await Rd(n,s,e),!0)})}async function qd(t,e,n){if(!k()){u("浏览器预览模式下不能移除，请手动删除样式目录",{tone:"warning",duration:3600});return}const s=u("正在移除样式…",{duration:0});try{const a=await Wc(t);if(s.close(),!a.removed){u(`没有移除「${e}」`,{tone:"warning"});return}n.commit?.(),n.render?.(),u(`已移除样式「${e}」`,{tone:"success"})}catch(a){s.close(),u(`移除失败：${a?.message??a}`,{tone:"error",duration:6e3})}}function Bd(t,e){const n=t.dataset.id,s=t.dataset.name||n;ee({title:`移除样式「${s}」？`,desc:"会把样式目录里对应的整个文件夹删掉（里面只有这个样式的文件，不含歌曲）。",okText:"移除",danger:!0,onOk:async()=>(await qd(n,s,e),!0)})}async function cs(t,e={}){const n=t.dataset.act,s=t.dataset.id;switch(n){case"about-open-url":{const a=String(t.dataset.url||"").trim();if(!a)return;if(!k()){try{await navigator.clipboard.writeText(a),u("预览模式没有系统浏览器：链接已复制",{duration:2600})}catch{u(a,{duration:5200})}return}try{await b.openExternalUrl(a)}catch(r){u(`打开链接失败：${r?.message??r}`,{tone:"error",duration:5e3})}return}case"reset-desktop-lyrics-pos":{if(!k()){u("浏览器预览模式下没有独立歌词窗口",{duration:2200});return}try{const a=await b.desktopLyricsResetPos();a&&a.applied===!1?u("已清掉位置记忆；下次打开桌面歌词会用默认位置",{tone:"success",duration:2600}):u("桌面歌词已移回默认位置",{tone:"success",duration:2e3})}catch(a){u(`重置失败：${a?.message??a}`,{tone:"error",duration:5e3})}return}case"ai-field":{const a=t.dataset.key;if(!a)return;i.config[a]=t.value,e.commit?.();return}case"add-folder":{if(k()){let r=null;try{r=await b.addFolder("")}catch(o){u(`系统目录选择器不可用：${o?.message??o}`,{tone:"warning",duration:5e3}),r=null}if(r===null){const o=await qi({manual:!0});if(!o)return;try{r=await b.addFolder(o)}catch(l){u(`添加失败：${l?.message??l}`,{tone:"error",duration:6e3});return}}if(r?.cancelled)return;if(r?.duplicated){u(`该文件夹已在曲库中：${r.path}`,{tone:"warning"});return}r?.folder?(i.folders=[...i.folders.filter(o=>o.id!==r.folder.id),r.folder],e.commit?.(),u(`已添加并开始扫描：${r.folder.path}`,{tone:"success"})):u("添加文件夹失败，请重试",{tone:"error",duration:6e3});return}const a=await qi();if(!a)return;i.folders.push({id:xn("folder"),path:a,trackCount:0,status:"ok",watching:i.config.watchFolders,addedAt:Date.now()}),e.commit?.(),u(`已添加文件夹：${a}`,{tone:"success"}),e.rescan?.();break}case"remove-folder":{const a=i.folders.find(r=>r.id===s);if(!a)return;ee({title:"移除音乐文件夹？",desc:`${a.path}
仅从曲库中移除，不会删除任何本地文件。`,okText:"移除",danger:!0,onOk:async()=>(k()&&await b.removeFolder(s),i.folders=i.folders.filter(r=>r.id!==s),e.commit?.(),u("已移除文件夹"),e.rescan?.({manual:!1}),!0)});break}case"scan-now":e.rescan?.({manual:!0});break;case"rescan-folder":u("正在重新扫描该文件夹…"),e.rescan?.({manual:!0});break;case"rule-add":i.filterRules.push({id:xn("rule"),type:"regex",op:"match",value:"",scope:"exclude",enabled:!0}),e.commit?.();break;case"rule-del":i.filterRules=i.filterRules.filter(a=>a.id!==s),e.commit?.(),e.refreshRules?.();break;case"rule-toggle":{const a=i.filterRules.find(r=>r.id===s);a&&(a.enabled=!a.enabled),e.commit?.(),e.refreshRules?.();break}case"rule-scope":{const a=i.filterRules.find(r=>r.id===s);a&&(a.scope=t.dataset.scope),e.commit?.(),e.refreshRules?.();break}case"preset-small":i.filterRules.push({id:xn("rule"),type:"size",op:"lt",value:"10240",unit:"B",scope:"exclude",enabled:!0}),e.commit?.(),e.refreshRules?.(),u("已添加：排除小于 10KB 的文件",{tone:"success"});break;case"preset-mp4":i.filterRules.push({id:xn("rule"),type:"regex",op:"match",value:"\\.mp4$",scope:"exclude",enabled:!0}),e.commit?.(),e.refreshRules?.(),u("已添加：排除 .mp4 文件",{tone:"success"});break;case"theme-pick":{const r=ps().find(o=>o.id===s);if(!r)return;i.config.theme=r.id,i.config.themeMode=r.mode,await De(i.config),e.commit?.(),e.render?.(),u(`已切换到主题「${r.name}」`,{tone:"success",duration:1600});break}case"open-theme-dir":{if(!k()){u("主题目录：frontend/src/styles/themes/",{duration:3200});break}try{const a=await b.themeDir();await b.revealThemeDir(),u(a?`已打开主题目录：${a}`:"已打开主题目录",{duration:3200})}catch(a){u(`打开主题目录失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"theme-help":Ld(e);break;case"theme-remove":Nd(t,e);break;case"reload-themes":if(k()){const a=await b.reloadThemes();await fs(),await De(i.config),e.commit?.(),u(`已重新扫描到 ${a?.length??0} 个主题`,{tone:"success"})}else u("浏览器预览模式下仅内置主题可用",{tone:"warning"});break;case"skin-pick":{const a=ls().find(r=>r.id===s);if(!a)return;hn(a.id),e.commit?.(),e.render?.(),u(`播放界面已切换到「${a.name}」`,{tone:"success",duration:1600});break}case"open-skin-dir":{if(!k()){u("样式目录：frontend/packages/player-skins/",{duration:3200});break}try{const a=await b.skinDir();await b.revealSkinDir(),u(a?`已打开样式目录：${a}`:"已打开样式目录",{duration:3200})}catch(a){u(`打开样式目录失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"reload-skins":try{k()&&await b.reloadSkins(),await Va(),hn(i.pvMode||i.config.playerViewMode||""),e.render?.();const a=ls().length,r=Rr();u(r.length?`已扫描到 ${a} 个样式，${r.length} 个加载失败`:`已扫描到 ${a} 个样式`,{tone:r.length?"warning":"success"})}catch(a){u(`重新扫描失败：${a?.message??a}`,{tone:"error"})}break;case"skin-help":Od(e);break;case"skin-remove":Bd(t,e);break;case"ai-vendor":{const a=String(t.value||"auto");if(a===(i.config.aiVendor||"auto"))break;i.config.aiVendor=a,e.commit?.(),e.render?.();const r=Ir(a);u(`模型类型已设为「${mc(a)}」${r?"："+r:""}`,{duration:3600});break}case"backdrop-mode":{const a=Dr.includes(t.value)?t.value:"off";if(a===(i.config.nativeBackdrop||"off"))break;i.config.nativeBackdrop=a,e.commit?.(),e.render?.(),u(a==="off"?"已关闭窗口原生材质，重启应用后生效":`已选择「${Vn(a)}」，重启应用后生效`,{tone:"success",duration:3200});break}case"backdrop-restart":{if(!k()){u("浏览器预览无法重启应用",{tone:"warning"});break}u("正在重启应用…",{duration:2e3});try{await b.restartApp()}catch(a){u(`重启失败：${a?.message??a}`,{tone:"error",duration:6e3})}break}case"loudness-refresh":{if(!k())return;await ms();const a=await an();e.commit?.(),u(`已重新获取响度数据（已测量 ${a?.measured??0} 首）`,{tone:"success"});break}case"loudness-clear":{if(!k())return;ee({title:"清除响度测量数据？",desc:"只会删除测量缓存，不会动你的音乐文件。清除后再次启用响度均衡会重新测量。",okText:"清除",danger:!0,onOk:async()=>(await b.loudnessClear(),i.loudnessGains={},await an(),e.commit?.(),e.render?.(),u("已清除响度测量数据",{tone:"success"}),!0)});break}case"loudness-target":{const a=Number(t.value),r=i.config.loudnessTarget;if(a===r)break;i.config.loudnessTarget=a,e.commit?.(),await Dc(),await an(),e.render?.(),u("目标响度已切换，响度数据将重新计算",{tone:"success",duration:3200});break}case"download-dir-pick":{if(!k()){u("浏览器预览无法调用系统目录选择器",{tone:"warning"});break}try{const a=await b.downloadPickDir();if(a?.cancelled)break;await Ri(a,e)}catch(a){u(`无法更改下载位置：${a?.message??a}`,{tone:"error",duration:6e3})}break}case"download-dir-open":{if(!k())break;try{await b.downloadOpenDir(i.config.downloadDir||"")}catch(a){u(`打开失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"download-dir-reset":{if(!k())break;try{const a=await b.downloadSetDir("");if(a?.cancelled)break;const r=a?.next?a:await b.downloadSetDir("");await Ri(r,e)}catch(a){u(`恢复默认失败：${a?.message??a}`,{tone:"error",duration:6e3})}break}case"cache-open-covers":case"cache-open-lyrics":{if(!k())break;try{await b.coverOpenCacheDir(n==="cache-open-covers"?"covers":"lyrics")}catch(a){u(`打开缓存目录失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"cover-refresh":{if(!k())break;try{const a=await b.coverClearCache();i.coverCache=await b.coverCacheStats(),await Xr(),e.commit?.(),e.render?.(),u(`已清空缓存（封面 ${a?.covers??0} 张、歌词 ${a?.lyrics??0} 份）`,{tone:"success"})}catch(a){u(`清空失败：${a?.message??a}`,{tone:"error",duration:5e3})}break}case"embed-cache-write":await Yr({ctx:e,force:!0});break}}async function Yr({ctx:t={},force:e=!1}={}){if(!k()){e&&u("写入歌曲文件需要后端支持，浏览器预览不可用",{tone:"warning"});return}for(let a=0;a<20&&!i.coverCache;a++)await new Promise(r=>setTimeout(r,100));if(!i.coverCache&&e)try{i.coverCache=await b.coverCacheStats()}catch{}if(Vr()===0){e?u(i.coverCache?"缓存里还没有封面或歌词，暂时没有可写入的内容":"暂时读不到缓存统计，请稍后再试",{duration:3400}):i.coverCache&&u("已开启：以后下载 / 更换封面时会把封面与歌词写进歌曲文件",{duration:3600});return}const n=Number(i.coverCache?.covers)||0,s=Number(i.coverCache?.lyrics)||0;ee({title:"要把已有的缓存写进歌曲文件吗？",body:p` <div class="setting__hint">
        缓存目录里已经有 <b>${D(n)}</b> 张封面、<b>${D(s)}</b> 份歌词。
        它们现在只放在缓存目录里；写进歌曲文件之后，把文件拷到别的播放器上也能看到。
      </div>
      <div class="setting__hint">
        写入只会在原文件的标签里做最小插入 / 替换（m4a 的 covr 与 ©lyr、FLAC 的 PICTURE 与 LYRICS），
        不动音频数据；mp3、wav、ogg 等格式会被跳过。这一步无法撤销，但不会影响播放。
      </div>`,okText:"写入文件",cancelText:"暂不写入",onOk:async()=>(await Fd(t),!0)})}async function Fd(t={}){const e=u("正在把缓存写入歌曲文件…",{duration:0}),n=ae("meta:embed-progress",s=>{const a=Number(s?.done)||0,r=Number(s?.total)||0,o=s?.title?" · "+s.title:"";e.update(r?"正在写入歌曲文件 "+a+"/"+r+o:"正在把缓存写入歌曲文件…")});try{const s=await b.coverWriteCacheToFiles(),a=Number(s?.written)||0,r=Number(s?.skipped)||0,o=Number(s?.failed)||0,l=Number(s?.total)||0;if(e.close(),!l){u("缓存里还没有封面或歌词，暂时没有可写入的内容",{duration:3200});return}let c=`已写入 ${D(a)} 首`;s?.covers&&(c+=`（封面 ${D(s.covers)}）`),s?.lyrics&&(c+=`（歌词 ${D(s.lyrics)}）`),r&&(c+=`，跳过 ${D(r)} 首`),o&&(c+=`，失败 ${D(o)} 首`),u(c,{tone:o?"warning":r?"info":"success",duration:5200});const d=Array.isArray(s?.reasons)?s.reasons:[];d.length&&ee({title:o?"部分歌曲没能写入":"部分歌曲已跳过",body:p`<div class="setting__hint setting__hint--steps">
          ${d.map((m,h)=>p`${h?p`<br />`:B}${m}`)}
        </div>`,okText:"知道了",cancelText:"关闭",onOk:()=>!0}),i.coverCache=await b.coverCacheStats(),t.commit?.(),t.render?.()}catch(s){e.close(),u(`写入失败：${s?.message??s}`,{tone:"error",duration:6e3})}finally{n()}}async function Ri(t,e){if(!t||t.cancelled)return;const n=t.next;if(!n)return;if(t.same){u("这已经是当前的下载目录",{duration:2200});return}const s=Number(t.count)||0,a=((Number(t.bytes)||0)/1024/1024).toFixed(1),r=Number(t.nextCount)||0;if(s===0){await Gs(n,!1,e);return}const o=p` <div class="setting__hint">
      当前下载目录里有 <b>${D(s)}</b> 首歌曲（约 ${a} MB）。 要一并搬到新目录吗？
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
    ${r?p`<div class="setting__hint">新目录里已经有 ${D(r)} 首歌曲，同名的不会被覆盖。</div>`:B}
    <div class="setting__hint">不迁移的话，旧目录里的歌曲会留在原地；新目录会成为新的默认保存位置。</div>`;ee({title:"更改下载位置",body:o,okText:"迁移并更改",cancelText:"不迁移，只更改位置",onOk:async()=>(await Gs(n,!0,e),!0),onCancel:async()=>{await Gs(n,!1,e)}})}async function Gs(t,e,n){try{const s=await b.downloadApplyDir(t,e);if(s?.dir&&(i.config.downloadDir=s.dir),n.commit?.(),n.render?.(),!e){u(`下载位置已改为：${s?.dir||t}`,{tone:"success",duration:3200});return}const a=Number(s?.migrated)||0,r=Number(s?.skipped)||0,o=Array.isArray(s?.failed)?s.failed:[];let l=`已迁移 ${D(a)} 首`;r&&(l+=`，跳过 ${D(r)} 首（新目录已有同名文件）`),o.length&&(l+=`，${D(o.length)} 首失败`),u(`${l}；新位置：${s?.dir||t}`,{tone:o.length?"warning":"success",duration:4200})}catch(s){u(`更改下载位置失败：${s?.message??s}`,{tone:"error",duration:6e3})}}async function Xr(){if(!k())return i.coverProviders=[],i.coverBreaker={},null;try{const t=await b.coverProviders();return i.coverProviders=Array.isArray(t?.providers)?t.providers:[],i.coverBreaker=t?.breaker&&typeof t.breaker=="object"?t.breaker:{},t}catch{return i.coverProviders=[],i.coverBreaker={},null}}let Ni=!1;function zd(){if(Ni)return;Ni=!0;const t=k()?b.coverCacheStats().then(e=>(i.coverCache=e,e)).catch(()=>null):Promise.resolve(null);Promise.all([Xr(),t]).then(()=>{he()})}function qi({manual:t=!1}={}){return new Promise(e=>{ee({title:"添加音乐文件夹",desc:t?"系统目录选择器没能打开，请直接粘贴文件夹完整路径。":"浏览器预览模式下无法调用系统目录选择器，请手动输入路径。",body:p`<input class="input" data-field="path" type="text" placeholder="D:\\Music" />`,okText:"添加",onOk:n=>{const s=String(n.path||"").trim();return s?(e(s),!0):"请输入路径"}})})}function Wd(t,e={}){const n=t.dataset.toggle;if(n){const a=t.getAttribute("aria-checked")!=="true";return n==="showDesktopLyrics"||n==="showDesktopWallpaper"?(jr(n==="showDesktopLyrics"?a?"lyrics":"off":a?"wallpaper":"off").then(o=>{o.ok===!1&&u(`打不开：${o.reason||o.error||"未知原因"}`,{tone:"warning",duration:3200}),e.commit?.()}),e.commit?.(),!0):(t.setAttribute("aria-checked",String(a)),n in i.config&&(i.config[n]=a,n==="animations"&&it("--dur",na(i.config)),n==="minimizeToTray"&&k()&&b.minimizeToTray(a).catch(r=>{console.warn("[settings] 同步托盘开关失败",r)}),n==="watchFolders"&&(i.folders.forEach(r=>r.watching=a),k()&&b.setWatchers(a).catch(r=>{console.warn("[settings] 切换实时监听失败",r)}))),e.commit?.(),n==="embedMeta"&&a&&Yr(),!0)}const s=t.closest("[data-segment]")?.dataset.segment;if(s){const a=t.dataset.value;if(t.parentElement.querySelectorAll(".segmented__btn").forEach(r=>{r.setAttribute("aria-pressed",String(r===t))}),s==="themeMode"){i.config.themeMode=a;const r=ps(),o=window.matchMedia("(prefers-color-scheme: dark)").matches,l=a==="system"?o?"dark":"light":a,c=r.find(d=>d.mode===l&&d.id!=="cover-dark")||r[0];i.config.theme=c.id,De(i.config)}else if(s in i.config){const r=["lyricsLines","scanConcurrency"];i.config[s]=r.includes(s)?Number(a):a,s==="lyricsLines"&&it("--lyric-pad",`${50-Number(a)*4}%`),s==="animationsSpeed"&&it("--dur",na(i.config)),s==="loudnessMode"&&ms(),s==="windowCorners"&&k()&&b.setWindowCorners(a).catch(o=>{console.warn("[settings] 设置窗口圆角失败",o)})}return e.commit?.(),!0}return!1}function Hd(t,{silent:e=!1}={}){const n=t?.dataset?.id;if(!n)return;const s=i.config.rowClickAction||"next";if(s==="play"){sa(n);return}if(s==="play-list"){const a=i.visibleSongs.map(r=>r.id);lt(a,Number(t.dataset.index),dn());return}er(n),e||u("已设为下一首播放",{tone:"success",duration:1500})}const Ks=[{id:"album",label:"专辑",icon:"album",isOn:()=>i.config.showAlbumColumn!==!1,set:t=>{i.config.showAlbumColumn=t}}];function Ud(t,e){const n=[{kind:"label",label:"显示的列"}];for(const s of Ks)n.push({id:`col-${s.id}`,label:s.label,icon:s.icon,checked:s.isOn()});n.push({kind:"sep"}),n.push({id:"col-reset",label:"恢复默认列",icon:"refresh"}),ln({x:t,y:e,items:n,onPick:s=>{if(s==="col-reset"){for(const o of Ks)o.set(!0);x(),u("已恢复默认列",{duration:1400});return}const a=Ks.find(o=>`col-${o.id}`===s);if(!a)return;const r=!a.isOn();a.set(r),x(),u(r?`已显示「${a.label}」列`:`已隐藏「${a.label}」列`,{duration:1400})}})}function Bi(t,e,n=null){const s=Ge(e);if(!s)return;const a=!!s.online,r=Et(e),o=i.queue.includes(e),l=[{id:"play",label:"播放",icon:"play"},{id:"play-next",label:"下一首播放",icon:"arrow-right"},{id:"sep1",kind:"sep"},{id:"queue-add",label:o?"从播放列表移除":"加入播放列表",icon:"queue"},{id:"like",label:r?"取消喜欢":"加入我喜欢",icon:"heart"},{id:"add-to",label:"加入歌单…",icon:"plus"}];if(a||l.push({id:"cover",label:"更换封面…",icon:"image"}),i.view==="queue")l.push({id:"sep2",kind:"sep"}),l.push({id:"remove-here",label:"从播放列表移除",icon:"trash",danger:!0});else if(i.view==="playlist"&&i.playlistId){const d=Ne(i.playlistId);d&&!d.locked&&(l.push({id:"sep2",kind:"sep"}),l.push({id:"remove-here",label:`从「${d.name}」移除`,icon:"trash",danger:!0}))}a||(l.push({id:"sep3",kind:"sep"}),l.push({id:"reveal",label:"在文件夹中显示",icon:"folder"}));const c=d=>{switch(d){case"play":{const m=i.visibleSongs.map(y=>y.id),h=m.indexOf(e);h<0?lt([e],0,{type:"online",id:null}):lt(m,h,dn());break}case"cover":ct(()=>Promise.resolve().then(()=>Qa),void 0).then(m=>m.openCoverPanel(e));break;case"play-next":er(e),u("已设为下一首播放",{tone:"success",duration:1500});break;case"queue-add":o?(aa(e),u("已从播放列表移除")):(Lo([e]),u("已加入播放列表",{tone:"success",duration:1500}));break;case"like":us(e),u(r?"已从「我喜欢」移除":"已加入「我喜欢」",{tone:r?"info":"success",duration:1500});break;case"add-to":jd(e);break;case"remove-here":i.view==="queue"?(aa(e),u("已从播放列表移除")):i.playlistId&&(tr(i.playlistId,[e]),u("已从歌单移除"));break;case"reveal":ct(()=>import("./bridge-BT7w5HFT.js").then(m=>m.v),[]).then(async m=>{try{await m.backend.revealInExplorer(s.path),u("已在文件夹中显示",{duration:1800})}catch(h){u(`无法在文件夹中显示：${h?.message??h}`,{tone:"error",duration:4e3})}});break}};if(n)ln({x:n.x,y:n.y,items:l,onPick:c});else{const d=t.getBoundingClientRect();ln({x:d.left,y:d.bottom+6,items:l,onPick:c,align:"right"})}}function jd(t){const e=i.playlists,{root:n}=ee({title:"加入歌单",body:p`
      <div class="setting__hint">点击歌单即可把这首歌加进去。</div>
      <div class="u-row u-wrap">
        ${e.map(s=>p` <button class="btn btn--sm" type="button" data-pl=${s.id}>
              <svg aria-hidden="true"><use href="#i-${s.id===qn?"heart":"playlist"}"></use></svg>
              <span>${s.name}</span>
            </button>`)}
      </div>
    `,okText:"完成",cancelText:"关闭",onOk:()=>!0});n.addEventListener("click",s=>{const a=s.target.closest("[data-pl]");a&&ss(a.dataset.pl,[t])})}const Vd=1500;function Gd(t){t&&(t.classList.remove("is-located"),t.offsetWidth,t.classList.add("is-located"),window.setTimeout(()=>t.classList.remove("is-located"),Vd))}function Qr(t){if(t){try{t.scrollIntoView({block:"nearest",inline:"nearest"})}catch{Kd(t)}Gd(t)}}function Kd(t){const e=t.closest(".content-body, .queue-panel__body");if(!e)return;const n=t.getBoundingClientRect(),s=e.getBoundingClientRect(),a=e.classList.contains("content-body")?50:8,r=s.top+a;n.top<r?e.scrollTop-=r-n.top:n.bottom>s.bottom&&(e.scrollTop+=n.bottom-s.bottom)}function Yd(t){const e=i.currentId;if(!e)return null;const n=t.querySelector(`.track[data-id="${CSS.escape(e)}"]`);return n?{el:n}:null}function Xd(){const t=i.currentId;return t&&document.querySelector("#queue-panel-body")?.querySelector(`.queue-item[data-queue-id="${CSS.escape(t)}"]`)||null}function Qd({notify:t=!0}={}){if(!i.currentId)return t&&u("当前没有正在播放的歌曲",{tone:"info",duration:1600}),!1;const e=document.getElementById("content-body"),n=e?Yd(e):null;return n?(Qr(n.el),!0):(t&&u("当前播放的歌曲不在这个列表里",{tone:"info",duration:2200}),!1)}function Jr({notify:t=!0}={}){if(!i.queue.length)return t&&u("播放列表是空的",{tone:"info",duration:1600}),!1;const e=Xd();return e?(Qr(e),!0):(t&&u("当前播放的歌曲不在播放列表里",{tone:"info",duration:2200}),!1)}let Zr=0;function eo(){Zr=Date.now()}function to(){return Date.now()-Zr<260}function Jd(t=!1){const e=i.visibleSongs.map(n=>n.id);if(e.length){if(t)for(let n=e.length-1;n>0;n-=1){const s=Math.floor(Math.random()*(n+1));[e[n],e[s]]=[e[s],e[n]]}lt(e,0,dn()),u(t?"已随机播放":`开始播放 ${D(e.length)} 首`,{duration:1600})}}const Zd={library:"本地歌曲",queue:"播放列表",playlist:"歌单"},Fi={commit:x,rescan:()=>pn({manual:!0})};class eu extends me{static deps=e=>[e.view,e.playlistId,e.playlistVersion,e.query,e.visibleVersion,e.visibleSongs.length,e.sortKey,e.sortDir,e.songs.length,e.folders.length,e.scanning,e.playlistSelecting,e.selectedIds,e.lastScan?.at??0,e.config.listDensity];render(){const e=i.view,n=e==="playlist"?Ne(i.playlistId):null;return p`
      <main class="main" id="main">
        <div
          class="content-header"
          id="content-header"
          @click=${s=>this.onHeaderClick(s)}
          @change=${s=>this.onHeaderChange(s)}
        >
          <div class="content-header__titles">
            <h1 class="content-header__title" id="content-title">
              ${e==="playlist"&&n?n.name:Zd[e]||"本地歌曲"}
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
                  @input=${s=>{i.query=s.target.value,x()}}
                  @keydown=${s=>{s.key==="Escape"&&(s.preventDefault(),Cs(),s.target.blur())}}
                />
                <button
                  class="content-filter__clear"
                  id="content-filter-clear"
                  type="button"
                  aria-label="清空筛选"
                  ?hidden=${i.query.length===0}
                  @click=${()=>{Cs(),this.querySelector("#content-filter-input")?.focus()}}
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
    `}subtitle(e,n){const s=i.visibleSongs,a=s.reduce((r,o)=>r+o.duration,0);if(e==="library"){const r=i.lastScan;return`${D(s.length)} 首 · 共 ${ws(a)} · ${D(i.folders.filter(o=>o.id!=="auto_downloads").length)} 个文件夹${r&&r.excluded?` · 已过滤 ${D(r.excluded)} 个文件`:""}`}if(e==="queue"){const r=i.currentId?s.findIndex(o=>o.id===i.currentId):-1;return`${D(s.length)} 首 · 共 ${ws(a)}${r>=0?` · 正在播放第 ${r+1} 首`:""}`}return e==="playlist"&&n?`${D(n.songIds.length)} 首 · 共 ${ws(a)} · ${n.locked?"默认歌单（不可删除）":"自定义歌单"}`:e==="playlist"?"歌单不存在":""}toolbar(){const e=i.view,n=p`<button class="btn btn--primary" type="button" data-tool="play-all">
      ${f("play")}<span>播放全部</span>
    </button>`,s=p`<button
      class="btn btn--icon"
      type="button"
      data-tool="locate"
      data-tip="定位到当前播放"
      aria-label="定位到当前播放"
    >
      ${f("disc")}
    </button>`,a=p`
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
        ${a}${n}
        <button class="btn" type="button" data-tool="pl-select">${f("check")}<span>多选</span></button>
        <button class="btn" type="button" data-tool="pl-add">${f("plus")}<span>添加</span></button>
        ${s}
        <button class="btn btn--icon" type="button" data-tool="pl-more" data-tip="歌单操作">${f("more")}</button>
      `}return p`
      <button class="btn" type="button" data-tool="rescan">${f("refresh")}<span>重新扫描</span></button>
      ${a}${n}${s}
    `}body(){const e=i.view;if(!i.visibleSongs.length){const n=i.query.trim()?"search":e==="library"?"library":e==="queue"?"queue":"playlist";return this.empty(n)}return hc(`${e}|${i.playlistId??""}`,p`<div class="page"><mp-track-table></mp-track-table></div>`)}empty(e){const n={library:{icon:"music",title:"曲库还没有歌曲",desc:"在设置里添加本地音乐文件夹，程序会自动扫描并监听这些文件夹的变化。",ok:"添加音乐文件夹",act:"add-folder"},queue:{icon:"queue",title:"播放列表是空的",desc:"从「本地歌曲」或任意歌单里选择歌曲加入播放列表。",ok:"去本地歌曲",act:"goto-library"},playlist:{icon:"playlist",title:"这个歌单还没有歌曲",desc:"在「本地歌曲」里点击每首歌后面的爱心或更多菜单，把歌曲加进来。",ok:"去本地歌曲",act:"goto-library"},search:{icon:"search",title:"没有找到匹配的歌曲",desc:"换个关键词试试，或清空搜索框。",ok:"清空搜索",act:"clear-search"}},s=n[e]||n.library;return p`
      <div class="empty" data-empty=${e}>
        <svg class="empty__art" aria-hidden="true"><use href="#i-${s.icon}"></use></svg>
        <div class="empty__title">${s.title}</div>
        ${s.desc?p`<div class="empty__desc">${s.desc}</div>`:B}
        ${s.ok?p`<div class="empty__actions">
                <button class="btn btn--primary" type="button" data-empty-act=${s.act}>${s.ok}</button>
              </div>`:B}
      </div>
    `}async onHeaderClick(e){const n=e.target.closest("[data-empty-act]")?.dataset.emptyAct;if(n){n==="add-folder"?await cs({dataset:{act:"add-folder"}},Fi):n==="goto-library"?wt("library"):n==="clear-search"&&Cs();return}const s=e.target.closest("[data-tool]")?.dataset.tool;s&&await this.handleTool(s)}onHeaderChange(e){e.target.id==="select-sort"&&(i.sortKey=e.target.value,x())}async handleTool(e){switch(e){case"rescan":pn({manual:!0});break;case"add-folder":await cs({dataset:{act:"add-folder"}},Fi);break;case"play-all":Jd(!1);break;case"locate":Qd();break;case"queue-clear":nr(),u("播放列表已清空");break;case"pl-select":ti(!i.playlistSelecting);break;case"pl-add":i.playlistId&&uc(i.playlistId);break;case"sel-all":{const n=i.visibleSongs.length>0&&i.visibleSongs.every(s=>i.selectedIds.has(s.id));Ro(n?[]:i.visibleSongs.map(s=>s.id));break}case"sel-remove":{const n=[...i.selectedIds];if(!n.length)break;const s=Ne(i.playlistId),a=tr(i.playlistId,n);ti(!1),u(`已从「${s?.name??"歌单"}」移除 ${D(a)} 首`,{tone:"success"});break}case"pl-more":va(i.playlistId,this.querySelector('#content-header [data-tool="pl-more"]'));break}}}te("mp-content",eu);const tu=Oa(class extends La{render(){return mt}update(t,[e]){const n=t.element;if(!n)return mt;qo(n);const s=e||ds;if(n.getAttribute("src")===s)return mt;if(s.startsWith("data:"))return n.src=s,mt;n.__coverWant=s;const a=new Image;a.decoding="async";const r=()=>{n.__coverWant===s&&(n.src=s)};return a.addEventListener("load",r),a.addEventListener("error",r),a.src=s,mt}}),Xa=t=>tu(t);class nu extends me{static deps=e=>[e.view,e.playlistId,e.visibleVersion,e.sortKey,e.sortDir,e.config.listDensity,e.config.showAlbumColumn,e.playlistSelecting,e.selectedIds,e.currentId,e.playing,e.likedIds,vn(),e.visibleSongs.length];get mode(){return i.view==="queue"?"playlist":"library"}get selecting(){return i.view==="playlist"&&i.playlistSelecting}updated(){i.view==="queue"?this.bindQueueSort():this._sortable&&(this._sortable.destroy(),this._sortable=null)}disconnectedCallback(){this._sortable?.destroy(),this._sortable=null,super.disconnectedCallback()}bindQueueSort(){const e=this.querySelector(".tracks__body");e&&(this._sortable&&this._sortable.el===e||(this._sortable?.destroy(),this._sortable=C.create(e,{handle:"[data-handle]",draggable:".track",animation:0,ghostClass:"is-dragging",chosenClass:"is-dragging",onEnd:n=>{eo();const s=n.oldIndex,a=n.newIndex;if(s==null||a==null||s===a)return;const r=n.from,o=Array.from(r.children).filter(l=>l!==n.item);r.insertBefore(n.item,o[s]??null),sr(s,a),u("已调整播放顺序 · 播放模式已切回列表循环",{duration:1800})}})))}render(){const e=this.mode,n=i.visibleSongs;return p`
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
          ${Ie(n,s=>s.id,(s,a)=>this.rowTemplate(s,a,e))}
        </div>
      </div>
    `}headTemplate(e){const n=e!=="playlist",s=(a,r,o="")=>{if(!n)return p`<div class="tracks__sort ${o}" data-static="1">${r}</div>`;const l=["tracks__sort",o,i.sortKey===a&&i.sortDir==="asc"?"is-asc":""].filter(Boolean).join(" ");return p`<button
        class=${l}
        type="button"
        data-sort=${a}
        data-dir=${i.sortKey===a?i.sortDir:B}
      >
        ${r}${f("chevron-down")}
      </button>`};return p`
      <div class="tracks__head" data-mode=${e}>
        <div class="col-handle"></div>
        <div class="col-index">#</div>
        <div class="col-cover"></div>
        ${s("title","标题")} ${s("album","专辑","col-album")} ${s("duration","时长")}
        <div class="col-heart" title="我喜欢">${f("heart")}</div>
        <div class="col-more"></div>
      </div>
    `}rowTemplate(e,n,s){const a=this.selecting,r=e.id===i.currentId,o=Et(e.id),l=a&&i.selectedIds.has(e.id);return p`
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
          <img src=${Xa(dt(e))} alt="" loading="lazy" draggable="false" />
        </div>
        <div class="track__main">
          <div class="track__title">${e.title}</div>
          <div class="track__sub">
            <span class="track__artist">${e.artist}</span>
            <span class="track__tag">${e.ext}</span>
          </div>
        </div>
        <div class="track__album u-ellipsis">${e.album}</div>
        <div class="track__time">${_t(e.duration)}</div>
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
    `}indexCell(e,n,s){if(s){const a=i.selectedIds.has(e.id);return p`<span class="track__check" role="checkbox" aria-checked=${String(a)}>${f("check")}</span>`}return p`
      <span class="track__num u-num">${n+1}</span>
      <div class="track__bars"><span></span><span></span><span></span><span></span></div>
      <button class="track__play" type="button" data-act="play" aria-label="播放 ${e.title}">
        ${f("play")}
      </button>
    `}onClick(e){if(to())return;const n=e.target.closest(".track");if(n&&i.view==="playlist"&&i.playlistSelecting){e.preventDefault(),No(n.dataset.id);return}const s=e.target.closest("[data-sort]");if(s){const l=s.dataset.sort;i.sortKey===l?i.sortDir=i.sortDir==="asc"?"desc":"asc":(i.sortKey=l,i.sortDir=l==="addedAt"?"desc":"asc"),x();return}const a=e.target.closest("[data-act]");if(!a){const l=e.target.closest(".track");l&&Hd(l,{silent:!1});return}const r=a.closest(".track"),o=r?.dataset.id;if(o)switch(a.dataset.act){case"play":{const l=i.visibleSongs.map(c=>c.id);lt(l,Number(r.dataset.index),dn());break}case"like":{us(o);const l=Et(o);u(l?"已加入「我喜欢」":"已从「我喜欢」移除",{tone:l?"success":"info",duration:1500});break}case"more":Bi(a,o);break}}onDblClick(e){if(i.view==="playlist"&&i.playlistSelecting)return;const n=e.target.closest(".track");if(!n)return;const s=i.visibleSongs.map(a=>a.id);lt(s,Number(n.dataset.index),dn()),i.playerOpen=!0,i.pvMode=i.config.playerViewMode,x()}onContextMenu(e){if(e.target.closest(".tracks__head")){e.preventDefault(),Ud(e.clientX,e.clientY);return}const s=e.target.closest(".track");s&&(e.preventDefault(),Bi(null,s.dataset.id,{x:e.clientX,y:e.clientY}))}}te("mp-track-table",nu);class su extends me{static deps=e=>[e.playerOpen,e.pvMode,e.currentId,e.playing,e.position,e.duration,e.config.showLyrics,e.config.coverCarousel,e.config.coverCarouselInterval,vn(),qr()];updated(){Zc()}render(){const e=Tt(),s=this.coverList(e).length>1,a=i.config.coverCarousel===!0&&s,r=!e||!!e.online,o=ls();return p`
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
          <button class="playerview__back" id="btn-player-back" type="button" @click=${()=>ys()}>
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
            ${Ie(o,l=>l.id,l=>p`
                <button
                  class="viewmode__btn"
                  type="button"
                  data-pv-skin=${l.id}
                  data-pv-mode=${l.id}
                  aria-pressed=${String(i.pvMode===l.id)}
                  data-tip=${l.name||l.id}
                  aria-label=${l.name||l.id}
                  @click=${()=>hn(l.id)}
                >
                  ${f(l.icon||"disc")}
                </button>
              `)}
          </div>
        </div>
        <div
          class="playerview__stage"
          id="playerview-stage"
          @click=${l=>{l.target.closest(".disc__label, .disc__platter")&&Jc()}}
        ></div>
      </section>
    `}coverList(e){if(!e)return[];const n=i.coverSets.get(e.id)?.items;return Array.isArray(n)?n.filter(s=>s?.preview):[]}carouselTip(e,n){if(!e)return"这首歌只有一张封面";const s=Number(i.config.coverCarouselInterval)||10;return n?"关闭封面轮播":`开启封面轮播（每 ${s} 秒换一张）`}openCoverPanel(e){!e||e.online||ct(()=>Promise.resolve().then(()=>Qa),void 0).then(n=>n.openCoverPanel(e.id))}toggleCarousel(){i.config.coverCarousel=!i.config.coverCarousel,x(),u(i.config.coverCarousel?`已开启封面轮播（每 ${Number(i.config.coverCarouselInterval)||10} 秒换一张）`:"已关闭封面轮播",{duration:1600})}}te("mp-playerview",su);function ot(t,e={}){const n=e.min??0,s=e.max??1,a=e.step??.001;let r=We(e.value??n,n,s),o=!1;const l=t.querySelector(".slider__fill"),c=t.querySelector(".slider__buffer"),d=t.querySelector(".slider__thumb"),m=t.querySelector(".slider__bubble");function h(){const _=s===n?0:(r-n)/(s-n)*100;l&&(l.style.transform=`scaleX(${_/100})`),d&&(d.style.left=`${_}%`),m&&e.format&&(m.textContent=e.format(r)),t.setAttribute("aria-valuenow",String(Math.round(_)))}function y(_){const P=t.getBoundingClientRect();if(P.width<=0)return r;const F=We((_.clientX-P.left)/P.width,0,1),L=n+F*(s-n),ie=Math.round(L/a)*a;return We(Number(ie.toFixed(6)),n,s)}function S(_){if(!m)return;const P=t.getBoundingClientRect(),F=We(_.clientX-P.left,0,P.width);m.style.left=`${F}px`}t.addEventListener("pointerdown",_=>{t.dataset.disabled!=="true"&&(_.preventDefault(),o=!0,t.dataset.dragging="true",t.setPointerCapture?.(_.pointerId),r=y(_),h(),S(_),e.onChange?.(r))}),t.addEventListener("pointermove",_=>{S(_),o&&(r=y(_),h(),e.onChange?.(r))});const $=_=>{o&&(o=!1,t.dataset.dragging="false",t.releasePointerCapture?.(_.pointerId),e.onCommit?.(r))};return t.addEventListener("pointerup",$),t.addEventListener("pointercancel",$),t.addEventListener("keydown",_=>{if(t.dataset.disabled==="true")return;const P=(s-n)/10,F=a*10;let L=r;switch(_.key){case"ArrowRight":case"ArrowUp":L=r+F;break;case"ArrowLeft":case"ArrowDown":L=r-F;break;case"PageUp":L=r+P;break;case"PageDown":L=r-P;break;case"Home":L=n;break;case"End":L=s;break;default:return}_.preventDefault(),r=We(Number(L.toFixed(6)),n,s),h(),e.onChange?.(r),e.onCommit?.(r)}),h(),{get value(){return r},set(_,{silent:P=!1}={}){const F=We(_,n,s);F===r&&!P||(r=F,h(),P||e.onChange?.(r))},setDisabled(_){t.dataset.disabled=_?"true":"false"},setBuffer(_){c&&(c.style.transform=`scaleX(${We(_,0,100)/100})`)},text(_=r){return e.format?e.format(_):String(_)},paint:h}}const au={itunes:"iTunes",netease:"网易云音乐",qq:"QQ 音乐",deezer:"Deezer",musicbrainz:"MusicBrainz",kugou:"酷狗音乐",kuwo:"酷我音乐",migu:"咪咕音乐"};function Ta(t){const e=String(t||"").trim().toLowerCase();return au[e]||String(t||"")}function no(t,e=""){const n=Array.isArray(t)?t.filter(Boolean):[];return n.length?n.map(s=>Ta(s)).join(" / "):e}const iu="../bindings/musicplayer/index.js";let Pn=null;async function Ys(){if(Pn)return Pn;try{const t=await import(iu);Pn=t&&t.OnlineService?t.OnlineService:null}catch(t){console.info("[online] backend unavailable",t)}return Pn}const ru=new Set(["m4a","mp4","m4b","alac","aac","flac"]);let V="online";const g={songId:"",title:"",lines:[],cursor:0,undo:[],dirty:!1,kept:0,stale:!1};class ou extends me{static deps=e=>[e.lyricsOpen,e.currentId,e.position,e.playing,V,so,i.config.embedMeta];constructor(){super(),this._draftText="",this._pendingText=null,this._nowIndex=-1,this._onlineMessage="",this._candidates=[],this._searching=!1,this._onlineKeyword="",this._draftTimer=null,this._lastNowPaint=0,this._lastScrolledNow=-1,this._lastScrolledCursor=-1,this._followHold=0,this._followAutoUntil=0,this._lastOnlineHint="在线歌词来源"}onConnected(){this._onKeyDownCapture=e=>this.onPanelKeyDown(e),document.addEventListener("keydown",this._onKeyDownCapture,!0)}onDisconnected(){document.removeEventListener("keydown",this._onKeyDownCapture,!0),this._draftTimer&&clearTimeout(this._draftTimer)}get open(){return i.lyricsOpen===!0}get panelEl(){return this.querySelector("#lyrics-panel")}updated(){const e=this.panelEl;if(e){if(e.hidden=!this.open,e.dataset.open=this.open?"true":"false",this._pendingText!==null){const n=this.querySelector("[data-editor-text]");n&&(n.value=this._pendingText),this._pendingText=null}this.open&&(V==="nudge"&&this.paintNudgeFollow(),V==="edit"&&this.paintEditorFollow())}}refreshAll(){this._refreshHeader(),rs().then(()=>{this._refreshHeader(),V==="online"&&this.refreshOnlineHint(),V==="edit"&&this.ensureDraft().then(()=>this.forceUpdate())})}_refreshHeader(){q()}render(){const e=ye(),n=e.song;return p`
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
          <img class="lyricspanel__cover" data-song-cover alt="" src=${n?dt(n):B} />
          <div class="lyricspanel__meta">
            <div class="lyricspanel__title" data-song-title>${n?n.title||"未命名":"未在播放"}</div>
            <div class="lyricspanel__sub">
              <span
                class="lyricspanel__badge${e.text?"":" is-empty"}"
                data-song-source
                data-src=${e.source}
              >
                ${Ti(e.source)}
              </span>
              <span class="lyricspanel__artist" data-song-artist>${n&&n.artist||""}</span>
            </div>
          </div>
          <button
            class="lyricspanel__close"
            type="button"
            data-act="close"
            aria-label="关闭"
            @click=${()=>Ea()}
          >
            ${f("close")}
          </button>
        </header>

        <nav class="lyricspanel__tabs" role="tablist">
          ${["online","nudge","edit"].map(s=>p`
              <button
                class="lyricspanel__tab${V===s?" is-active":""}"
                type="button"
                role="tab"
                data-tab=${s}
                aria-selected=${String(V===s)}
                @click=${()=>du(s)}
              >
                ${s==="online"?"在线匹配":s==="nudge"?"微调":"手动编辑"}
              </button>
            `)}
        </nav>

        ${this.noticeTemplate(e)}
        <div class="lyricspanel__body">
          ${this.open?p`${this.onlinePane()} ${this.nudgePane(e)} ${this.editPane()}`:B}
        </div>
      </section>
    `}noticeTemplate(e){const n=V==="nudge"||V==="edit",s=e.source==="embedded"||e.source==="lrc-file";if(!n||!s)return B;const a=Ti(e.source),r=uu(e.song),o=ru.has(r);return p`
      <div class="lyricspanel__notice" data-notice>
        <div class="lyricspanel__notice-text" data-notice-text>
          ${o?p`这首歌的歌词来自「${a}」，它的优先级高于歌词缓存：只保存到缓存的话，下次打开仍会显示旧歌词。建议同时写入歌曲文件。`:p`这首歌的歌词来自「${a}」，它的优先级高于歌词缓存；而 ${r?"."+r:"该格式"}
                不支持写入歌词标签，所以本次改动只在<b>本次运行内</b>生效（重启后会变回旧歌词）。`}
        </div>
        ${o?p`<label class="lyricspanel__notice-opt" data-notice-opt>
                <input type="checkbox" data-embed-toggle checked />
                <span>同时写入歌曲文件（否则下次打开仍显示旧歌词）</span>
              </label>`:B}
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
          ${this._searching?"搜索中…":this._onlineMessage?this._onlineMessage:this._candidates.length?Ie(this._candidates,(e,n)=>`${e.provider||""}-${e.id||n}`,(e,n)=>p`
                        <div class="candidate">
                          <div class="candidate__main">
                            <div class="candidate__title">
                              ${(e.title||"未命名")+" - "+(e.artist||"未知")}
                            </div>
                            <div class="candidate__sub">
                              ${(e.provider||"")+" · score "+(e.score||0)+" · "+_t(e.duration)}
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
    `}nudgePane(e){const n=e.songId?Ct(e.songId):0,s=n<0?e.lines.filter(r=>r.time+n<0).length:0,a={lower:-1e4,upper:1e4};return p`
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
            <button class="btn" type="button" data-act="nudge-feel" data-delta="500" @click=${()=>Qs(500)}>
              歌词比声音<b>快</b>（出现太早）→ 整体延后 0.5s
            </button>
            <button class="btn" type="button" data-act="nudge-feel" data-delta="-500" @click=${()=>Qs(-500)}>
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
                  @click=${()=>Qs(r)}
                >
                  ${r>0?"+":"−"}${(Math.abs(r)/1e3).toFixed(1)}
                </button>`)}
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
            @input=${r=>Hi(Number(r.target.value))}
          />
        </div>
        <div class="nudge__block nudge__block--grow">
          <div class="lyricspanel__hint">预览（点一行会跳到那一句）</div>
          <div class="lyricspanel__list" data-nudge-preview @scroll=${()=>this.onFollowScroll()}>
            ${this.nudgePreview(e,n)}
          </div>
        </div>
        <div class="lyricspanel__foot">
          <button class="btn btn--sm" type="button" data-act="nudge-reset" @click=${()=>pu()}>
            ${B}重置
          </button>
          <span class="lyricspanel__hint">微调不会自动保存</span>
          <button class="btn btn--primary" type="button" data-act="nudge-apply" @click=${()=>this.applyNudge()}>
            应用到歌词
          </button>
        </div>
      </section>
    `}nudgePreview(e,n){if(!e.text)return"这首歌还没有歌词。可以先用「在线匹配」找一份，或者切到「手动编辑」自己贴一份。";const s=e.lines,a=Wi(s,n),r=Math.max(0,a-5),o=Math.min(s.length,a+6),l=[];for(let c=r;c<o;c+=1){const d=s[c],m=Math.max(0,d.time+n);l.push(p`
        <div
          class="nudge__line${c===a?" is-active":""}"
          data-act="nudge-seek"
          data-ms=${m}
          @click=${()=>vt(m)}
        >
          <span class="nudge__time">${jt(d.time+n).slice(1,-1)}</span>
          <span class="nudge__text">${d.text}</span>
        </div>
      `)}return l}paintNudgeFollow(){if(V!=="nudge")return;const e=this.querySelector("[data-nudge-preview]");if(!e)return;const n=ye();if(!n.lines.length)return;const s=n.songId?Ct(n.songId):0,a=Wi(n.lines,s),r=e.querySelectorAll(".nudge__line");if(!r.length)return;const o=Number(r[0].dataset.index??-1);if(o<0)return;if(a<o||a>=o+r.length){q();return}const l=a-o;r.forEach((c,d)=>c.classList.toggle("is-active",d===l)),this.followScroll(e,r[l])}editPane(){const e=g.lines.filter(o=>typeof o.time=="number").length,n=io(),s=g.lines.length-e,a=n?`草稿属于《${Ge(g.songId)?.title||"上一首"}》`:s>0&&e>0?`还有 ${s} 行没有时间`:"",r=n?"已切歌，草稿仍属于上一首":g.kept>0?`已沿用 ${g.kept} 行原有时间`:g.dirty?"未保存":"";return p`
      <section class="lyricspanel__pane" data-pane="edit" ?hidden=${V!=="edit"}>
        <div class="editor__source">
          <div class="lyricspanel__row lyricspanel__row--between">
            <span class="lyricspanel__hint">歌词文本：粘贴纯文本即可（带时间标签也能识别）</span>
            <span class="lyricspanel__row-actions">
              <button class="btn btn--sm" type="button" data-act="editor-load" @click=${()=>gu()}>
                载入当前歌词
              </button>
              <button class="btn btn--sm" type="button" data-act="editor-clear-times" @click=${()=>mu()}>
                清空全部时间
              </button>
              <button class="btn btn--sm" type="button" data-act="editor-clear" @click=${()=>vu()}>
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
            @click=${()=>_u()}
          >
            ${f(i.playing?"pause":"play")}
          </button>
          <button
            class="btn btn--sm"
            type="button"
            data-act="editor-back"
            @click=${()=>vt(Math.max(0,i.position-5e3))}
          >
            −5s
          </button>
          <button class="btn btn--sm" type="button" data-act="editor-fwd" @click=${()=>vt(i.position+5e3)}>
            +5s
          </button>
          <span class="editor__clock" data-editor-clock>${jt(i.position).slice(1,-1)}</span>
          <span class="editor__spacer"></span>
          <span class="lyricspanel__hint" data-editor-progress>已打轴 ${e} / ${g.lines.length}</span>
        </div>

        <button class="editor__tap" type="button" data-act="editor-tap" @click=${()=>Js()}>
          <span class="editor__tap-main">打轴并下一行</span>
          <span class="editor__tap-hint"><kbd>空格</kbd> 或点这里</span>
        </button>

        <div class="editor__tools">
          <button class="btn btn--sm" type="button" data-act="editor-undo" @click=${()=>fu()}>撤销</button>
          <button class="btn btn--sm" type="button" data-act="editor-prev" @click=${()=>Ui(-1)}>
            上一行
          </button>
          <button class="btn btn--sm" type="button" data-act="editor-next" @click=${()=>Ui(1)}>
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
    `}draftList(){return g.lines.length?Ie(g.lines,(e,n)=>n,(e,n)=>{const s=typeof e.time=="number",a=["drow"];return n===g.cursor&&a.push("is-cursor"),s||a.push("is-untimed"),n===this._nowIndex&&a.push("is-now"),p`
          <div class=${a.join(" ")} data-act="editor-cursor" data-i=${n} @click=${()=>Ia(n)}>
            <span class="drow__no">${n+1}</span>
            <button
              class="drow__time"
              type="button"
              data-act="edit-seek"
              data-i=${n}
              data-tip="跳到这一句"
              @click=${r=>{r.stopPropagation(),bu(n)}}
            >
              ${s?jt(e.time).slice(1,-1):"未打轴"}
            </button>
            <span class="drow__text">${e.text}</span>
            <button
              class="drow__clear"
              type="button"
              data-act="edit-clear"
              data-i=${n}
              aria-label="清除这一行的时间"
              ?hidden=${!s}
              @click=${r=>{r.stopPropagation(),hu(n)}}
            >
              ${f("close")}
            </button>
          </div>
        `}):p`<div class="editor__empty">还没有歌词文本。把歌词粘到上面的文本框里，或点「载入当前歌词」。</div>`}onClick(e){const n=e.target.closest("[data-act], [data-tab]");if(!n||!this.contains(n))return;const s=n.dataset.act,a=Number(n.dataset.i);switch(s){case"close":Ea();return;case"nudge-seek":vt(Number(n.dataset.ms));return;case"editor-cursor":Ia(a);return;case"editor-tap":Js();return}}onInput(e){const n=e.target;if(n.matches("[data-editor-text]")){this.scheduleDraftSettle();return}n.matches('[data-act="nudge-range"]')&&Hi(Number(n.value))}onPanelKeyDown(e){if(!this.open||V!=="edit"||e.key!==" "||e.ctrlKey||e.metaKey||e.altKey)return;const n=e.target;n&&(n.tagName==="TEXTAREA"||n.tagName==="INPUT")||this.contains(n)&&(e.preventDefault(),e.stopPropagation(),Js())}onFollowScroll(){Date.now()<this._followAutoUntil||(this._followHold=Date.now()+4e3)}followScroll(e,n,s=!1){if(!e||!n||!s&&Date.now()<this._followHold)return;const a=e.getBoundingClientRect(),r=n.getBoundingClientRect(),o=Math.max(0,e.scrollTop+(r.top-a.top)-(e.clientHeight-r.height)/2);Math.abs(e.scrollTop-o)<2||(this._followAutoUntil=Date.now()+700,e.scrollTo({top:o,behavior:"smooth"}))}prefillOnlineKeyword(){const e=Xs();if(!e)return;const n=[e.title,e.artist].filter(Boolean).join(" ").trim();!n||n===this._onlineKeyword||(this._onlineKeyword=n,q())}async refreshOnlineHint(){const e=await Ys();if(e)try{const n=await e.LyricsProviders?.(),s=Array.isArray(n?.providers)?n.providers:[];s.length&&(this._lastOnlineHint="在线歌词来源："+no(s),q())}catch{}}async searchLyrics(){const e=(this._onlineKeyword||"").trim();if(!e){u("请输入歌词搜索关键词",{duration:1500});return}const n=await Ys();if(!n){u("在线歌词服务暂不可用，请稍后再试",{tone:"error"});return}const s=Xs();this._searching=!0,this._onlineMessage="",q();try{const a=await n.SearchLyrics(e,s?s.title:"",s?s.artist:"",s?s.duration:0);this._candidates=Array.isArray(a)?a:[],this._onlineMessage=this._candidates.length?"":"没有找到候选歌词"}catch(a){this._candidates=[],this._onlineMessage="搜索失败："+(a.message||a)}finally{this._searching=!1,q()}}async applyCandidate(e){const n=this._candidates[e];if(!n)return;const s=Xs();if(!s){u("请先播放一首歌曲",{tone:"warning"});return}const a=await Ys();if(!a){u("在线歌词服务暂不可用，请稍后再试",{tone:"error"});return}try{const r=await a.FetchLyrics(n.provider,n.id);if(!r||!r.lrc){u("没有取到歌词",{tone:"warning"});return}const o=await Hs(s.id,r.lrc,r.source||"online",{embed:i.config.embedMeta===!0});rt(s.id,0),g.songId="",u(o?.note||"歌词已应用并保存",{tone:"success",duration:2e3}),q()}catch(r){u("获取歌词失败："+(r.message||r),{tone:"error"})}}async applyNudge(){const e=ye();if(!e.songId){u("请先播放一首歌曲",{tone:"warning"});return}const n=Ct(e.songId);if(!n){u("当前没有需要应用的调整",{duration:1800});return}if(!e.text){u("这首歌还没有歌词",{tone:"warning"});return}const s=Xo(e.text,n),a=await Hs(e.songId,s,"edit:offset",{embed:zi(e,this)});a!==!1&&(rt(e.songId,0),q(),u(a?.note||"已应用并保存",{tone:"success",duration:2600}))}async ensureDraft(e=!1){const n=ye();!e&&g.songId===n.songId&&g.lines.length||(g.songId=n.songId,g.title=n.song?.title||"",g.lines=n.text?la(n.text):[],g.cursor=0,g.undo=[],g.dirty=!1,g.kept=0,g.stale=!1,this._nowIndex=-1,this._lastScrolledNow=-1,this._lastScrolledCursor=-1,this._followHold=0,this._followAutoUntil=0,this._pendingText=n.text||"",q())}scheduleDraftSettle(){this._draftTimer&&clearTimeout(this._draftTimer),this._draftTimer=setTimeout(()=>{this._draftTimer=null,this.syncDraftFromText()},300)}syncDraftFromText(){const e=this.querySelector("[data-editor-text]");if(!e)return;const n=la(e.value),s=Qo(g.lines,n),a=s.filter((r,o)=>typeof r.time=="number"&&!(n[o]&&typeof n[o].time=="number")).length;Ot(),g.lines=s,g.cursor>=s.length&&(g.cursor=Math.max(0,s.length-1)),g.dirty=!0,g.kept=a,q()}serializeDraftText(){return g.lines.map(e=>typeof e.time=="number"?jt(e.time)+e.text:e.text).join(`
`)}setDraftText(e){this._pendingText=e,q()}async saveDraft(){const e=ye(g.songId);if(!e.songId){u("还没有可保存的内容：先播放一首歌再编辑",{tone:"warning"});return}const n=g.lines.filter(c=>typeof c.time=="number"&&Number.isFinite(c.time));if(!n.length){u("至少要先给一行打上时间",{tone:"warning"});return}const s=g.lines.length-n.length;let a=!1,r=-1/0;for(const c of g.lines)if(typeof c.time=="number"){if(c.time<r){a=!0;break}r=c.time}if(s||a){const c=p`
        ${s?p`<div class="lyricspanel__hint">
                还有 <b>${s}</b> 行没有时间：LRC 里没有时间标签的行会被忽略，保存后这些行不会显示。
              </div>`:B}
        ${a?p`<div class="lyricspanel__hint">时间不是升序，播放时高亮可能会跳来跳去。</div>`:B}
      `;if(!await wu({title:s?"还有歌词没有打轴":"时间不是升序",body:c,okText:"继续保存",cancelText:"返回编辑"}))return}const o=ni(g.lines),l=await Hs(e.songId,o,"manual",{embed:zi(e,this)});l!==!1&&(rt(e.songId,0),g.undo=[],g.dirty=!1,g.songId=e.songId,q(),u(l?.note||"歌词已保存",{tone:"success",duration:2600}))}async copyLrc(){const e=ni(g.lines);if(!e){u("还没有可复制的歌词",{duration:1800});return}try{await navigator.clipboard.writeText(e),u("LRC 已复制到剪贴板",{tone:"success"})}catch{const n=document.createElement("textarea");n.value=e,n.style.cssText="position:fixed;left:-9999px;top:0;",document.body.appendChild(n),n.select();let s=!1;try{s=document.execCommand("copy")}catch{s=!1}n.remove(),u(s?"LRC 已复制到剪贴板":"复制失败，请手动选中文本",{tone:s?"success":"warning"})}}paintNowRow(){const e=performance.now();if(e-this._lastNowPaint<200)return;this._lastNowPaint=e;let n=-1;for(let s=0;s<g.lines.length;s+=1){const a=g.lines[s].time;typeof a=="number"&&a<=i.position&&(n=s)}n!==this._nowIndex&&(this._nowIndex=n,q())}paintEditorFollow(){this.paintNowRow(),this.scrollDraftRows()}scrollDraftRows(){const e=this.querySelector("[data-editor-list]");if(e){if(g.cursor!==this._lastScrolledCursor){const n=e.querySelector(`[data-i="${g.cursor}"]`);n&&(this._lastScrolledCursor=g.cursor,this.followScroll(e,n,!0))}if(this._nowIndex!==this._lastScrolledNow){const n=e.querySelector(`[data-i="${this._nowIndex}"]`);n&&this._nowIndex>=0&&(this._lastScrolledNow=this._nowIndex,this.followScroll(e,n))}}}}te("mp-lyrics-panel",ou);let so=0;function q(){so+=1,he()}const Ke=()=>document.querySelector("mp-lyrics-panel");function lu(t){i.lyricsOpen=!0,q();const e=Ke();e&&(e._refreshHeader(),e.prefillOnlineKeyword(),rs().then(()=>{e._pendingText=ye().text||"",V==="edit"&&e.ensureDraft(!0),V==="online"&&e.refreshOnlineHint(),q()}))}function Ea(){i.lyricsOpen=!1;const t=ye();t.songId&&Ct(t.songId)&&(rt(t.songId,0),u("未应用的微调已丢弃",{duration:1800})),q()}function cu(t){i.lyricsOpen?Ea():lu()}function du(t){V=t==="nudge"||t==="edit"?t:"online";const e=Ke();e&&(V==="edit"&&e.ensureDraft().then(()=>q()),V==="online"&&e.refreshOnlineHint?.()),q()}function Xs(){return Ge(i.currentId)||null}function uu(t){return String(t?.ext||"").replace(/^\./,"").toLowerCase()}function zi(t,e){const n=e?.querySelector("[data-embed-toggle]"),s=e?.querySelector("[data-notice-opt]");return(t.source==="embedded"||t.source==="lrc-file")&&s&&n?!!n.checked:i.config.embedMeta===!0}function Wi(t,e){let n=-1;for(let s=0;s<t.length&&t[s].time+e<=i.position;s+=1)n=s;return n}function ao(){return{lower:-1e4,upper:1e4}}function Qs(t){const e=ye();if(!e.songId){u("请先播放一首歌曲",{tone:"warning"});return}if(!e.text){u("这首歌还没有歌词，先去在线匹配或手动编辑",{tone:"warning",duration:2600});return}const n=ao(),s=Math.max(n.lower,Math.min(n.upper,Ct(e.songId)+t));rt(e.songId,s),q()}function Hi(t){const e=ye();if(!e.songId||!e.text)return;const n=ao(),s=Math.max(n.lower,Math.min(n.upper,Math.round(Number(t)||0)));rt(e.songId,s),q()}function pu(){const t=ye();t.songId&&(rt(t.songId,0),q())}function Ot(){g.undo.push({lines:g.lines.map(t=>({...t})),cursor:g.cursor}),g.undo.length>50&&g.undo.shift()}function fu(){const t=g.undo.pop();if(!t){u("没有可撤销的操作",{duration:1500});return}g.lines=t.lines,g.cursor=Math.min(t.cursor,Math.max(0,t.lines.length-1)),g.dirty=!0,Ke()?.setDraftText(_s()),q()}function _s(){return g.lines.map(t=>typeof t.time=="number"?jt(t.time)+t.text:t.text).join(`
`)}function Ui(t){if(!g.lines.length)return;const e=Math.max(0,Math.min(g.lines.length-1,g.cursor+t));e!==g.cursor&&(g.cursor=e,q())}function Ia(t){!Number.isFinite(t)||t<0||t>=g.lines.length||t===g.cursor||(g.cursor=t,q())}function Js(){if(!g.lines.length){u("先把歌词粘到上面的文本框里",{tone:"warning",duration:2200});return}if(io()){u("已切歌：先决定这份草稿怎么办（保存它，或点「载入当前歌词」重来）",{tone:"warning",duration:4200});return}const t=g.lines[g.cursor];t&&(Ot(),t.time=Math.round(i.position/10)*10,g.dirty=!0,g.cursor<g.lines.length-1&&(g.cursor+=1),Ke()?.setDraftText(_s()),q())}function hu(t){const e=g.lines[t];!e||typeof e.time!="number"||(Ot(),e.time=null,g.dirty=!0,Ke()?.setDraftText(_s()),q())}function mu(){g.lines.length&&(Ot(),g.lines.forEach(t=>{t.time=null}),g.cursor=0,g.dirty=!0,Ke()?.setDraftText(_s()),u("已清空全部时间，可以重新打轴",{duration:2e3}),q())}function gu(){const t=ye();if(!t.text){u("这首歌还没有歌词可载入",{duration:2e3});return}Ot(),g.lines=la(t.text),g.cursor=0,g.dirty=!0,g.songId=t.songId,g.title=t.song?.title||"",Ke()?.setDraftText(t.text),u("已载入当前歌词，可以逐行修正时间",{duration:2200}),q()}function vu(){Ot(),g.lines=[],g.cursor=0,g.dirty=!0,Ke()?.setDraftText(""),q()}function bu(t){const e=g.lines[t];if(!e)return;let n=e.time;if(typeof n!="number"){for(let s=t-1;s>=0;s-=1)if(typeof g.lines[s].time=="number"){n=g.lines[s].time;break}}if(typeof n!="number"){u("这一行还没有时间，无法跳转",{duration:1600});return}vt(n),Ia(t)}function io(){return!!g.songId&&ye().songId!==g.songId&&yu()}function yu(){return g.lines.some(t=>typeof t.time=="number")}function _u(){gn()}function wu({title:t,body:e,okText:n,cancelText:s}){return new Promise(a=>{let r=!1;const o=l=>{r||(r=!0,a(l))};ee({title:t,body:e,okText:n,cancelText:s,onOk:()=>(o(!0),!0),onCancel:()=>(o(!1),!0)})})}const Zs={sequence:{icon:"repeat",label:"列表循环"},"loop-all":{icon:"repeat",label:"列表循环"},"loop-one":{icon:"repeat-one",label:"单曲循环"},shuffle:{icon:"shuffle",label:"随机播放"}};function ro(t){const e=typeof t=="boolean"?t:!i.queueOpen;i.queueOpen=e,e&&(i.optionsOpen=!1),x()}function oo(t){const e=typeof t=="boolean"?t:!i.optionsOpen;i.optionsOpen=e,e&&(i.queueOpen=!1),x()}function lo(t){const e=typeof t=="boolean"?t:!i.sleepOpen;i.sleepOpen=e,x()}function co(){return po(i.config.showDesktopLyrics?K.off:K.lyrics,{on:"已开启桌面歌词",off:"已关闭桌面歌词"})}function uo(){return po(i.config.showDesktopWallpaper?K.off:K.wallpaper,{on:"已开启桌面背景歌词",off:"已关闭桌面背景歌词"})}async function po(t,{on:e,off:n}){const s=await jr(t);return x(),s.ok!==!1?(u(t===K.off?n:e,{duration:1400}),s):(u(`打不开：${s.reason||s.error||"未知原因"}`,{tone:"warning",duration:3200}),s.restored&&u("已保留原来的桌面歌词设置",{duration:1800}),s)}function $u(t){const e=Math.round(Number(t)||0);if(e<=0){fo("已取消定时停止");return}i.sleepTimer={type:"duration",until:Date.now()+e*6e4,minutes:e},x(),u(`${e} 分钟后停止播放`,{duration:1800})}function fo(t){i.sleepTimer=null,x(),u(t,{duration:1400})}function ku(t){i.config.sleepAfterSong=!!t,x(),u(i.config.sleepAfterSong?"已开启：倒计时结束后等当前歌曲播完再停":"已关闭：倒计时结束后立即停止",{duration:2200})}function Su(){const t=i.sleepTimer;if(!(t?.type!=="duration"||Date.now()<t.until)){if(i.config.sleepAfterSong===!0&&i.playing&&i.currentId){i.sleepTimer={type:"after-song"},x(),u("定时到点：等这首播完就停",{duration:2400});return}i.sleepTimer=null,i.playing?gn():x(),u("已按定时停止播放",{duration:1800})}}class xu extends me{static deps=e=>[e.currentId,e.playing,e.position,e.duration,e.volume,e.muted,e.playMode,e.likedIds,e.queue.length,e.queueOpen,e.optionsOpen,e.sleepOpen,e.sleepTimer,e.config.showDesktopLyrics,e.config.showDesktopWallpaper,e.desktopWallpaperSupport,e.lyricsOpen,vn()];constructor(){super(),this._progress=null,this._volume=null,this._tick=null}onConnected(){this._tick=setInterval(()=>{i.sleepTimer&&this.requestUpdate()},1e3)}onDisconnected(){this._tick&&clearInterval(this._tick),this._tick=null}firstUpdated(){const e=this.querySelector("#progress");this._progress=ot(e,{min:0,max:1e3,step:1,value:0,format:n=>_t(n/1e3*(i.duration||0)),onChange:n=>{i.duration&&(i.position=n/1e3*i.duration,this.requestUpdate())},onCommit:n=>{i.duration&&is(n/1e3*i.duration)}}),this._volume=ot(this.querySelector("#volume"),{min:0,max:1,step:.01,value:i.volume,format:n=>`${Math.round(n*100)}`,onChange:n=>{ia(n),Pt(),this.requestUpdate()}})}updated(){const e=Math.round(i.position),n=Math.round(i.duration||0),s=this.querySelector("#progress");s&&s.dataset.dragging!=="true"&&n>0&&this._progress?.set(e/n*1e3,{silent:!0}),this._progress?.setDisabled(n<=0);const a=i.muted?0:i.volume,r=this.querySelector("#volume");r&&r.dataset.dragging!=="true"&&this._volume?.set(a,{silent:!0}),Su()}render(){const e=Tt(),n=i.currentId?Et(i.currentId):!1,s=Zs[i.playMode]||Zs.sequence,a=i.muted?0:i.volume,r=a===0?"volume-mute":a<.5?"volume-low":"volume-high",o=e?dt(e):"",l=i.sleepTimer,c=l?.type==="duration"?Math.max(1,Math.ceil((l.until-Date.now())/6e4)):0;return p`
      <footer class="playerbar" id="playerbar">
        <div class="playerbar__progress">
          <span class="progress__time" id="time-current">${_t(i.position)}</span>
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
          <span class="progress__time progress__time--total" id="time-total">${_t(i.duration)}</span>
        </div>

        <div class="playerbar__row">
          <div class="playerbar__now">
            <button
              class="playerbar__cover"
              id="bar-cover"
              type="button"
              data-tip="播放详情页"
              aria-label="播放详情页"
              @click=${()=>xa()}
            >
              <img id="bar-cover-img" alt=${e?`${e.title} 封面`:""} src=${Xa(o)} />
              <svg class="playerbar__cover-icon"><use href="#i-expand"></use></svg>
            </button>
            <div class="playerbar__meta" id="bar-meta" data-tip="播放详情页" @click=${()=>xa()}>
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
                @click=${()=>Ma()}
              >
                ${f("prev")}
              </button>
              <button
                class="transport__btn transport__btn--main"
                id="btn-play"
                type="button"
                data-tip=${i.playing?"暂停":"播放"}
                aria-label=${i.playing?"暂停":"播放"}
                @click=${()=>gn()}
              >
                <svg id="icon-play"><use href="#i-${i.playing?"pause":"play"}"></use></svg>
              </button>
              <button
                class="transport__btn"
                id="btn-next"
                type="button"
                data-tip="下一曲"
                aria-label="下一曲"
                @click=${()=>cn(!1)}
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
                @click=${()=>{Bo(),Pt()}}
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
              @click=${()=>{Fo(),u((Zs[i.playMode]||s).label,{duration:1400})}}
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
              @click=${()=>cu()}
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
              @click=${()=>co()}
            >
              ${f("desktop-lyrics")}
            </button>
            <button
              class="mode-btn"
              id="btn-desktop-wallpaper"
              type="button"
              aria-pressed=${String(!!i.config.showDesktopWallpaper)}
              ?disabled=${i.desktopWallpaperSupport?.supported===!1}
              aria-disabled=${i.desktopWallpaperSupport?.supported===!1?"true":B}
              data-tip=${i.desktopWallpaperSupport?.supported===!1?i.desktopWallpaperSupport.reason:"桌面背景歌词"}
              aria-label="桌面背景歌词"
              @click=${()=>uo()}
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
              @click=${()=>lo()}
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
              @click=${()=>oo()}
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
              @click=${()=>{Cu()}}
            >
              ${f("playlist")}
              <span class="mode-btn__badge" id="queue-count"
                >${i.queue.length===0?"":i.queue.length>99?"99+":String(i.queue.length)}</span
              >
            </button>
          </div>
        </div>
      </footer>
    `}sleepTip(e){return e?.type==="duration"?`定时停止 · 剩余 ${Math.max(0,Math.round((e.until-Date.now())/1e3))} 秒`:e?.type==="after-song"?"定时停止 · 播完当前歌曲":"定时停止"}onLike(){if(!i.currentId)return;us(i.currentId);const e=Et(i.currentId);u(e?"已加入「我喜欢」":"已从「我喜欢」移除",{tone:e?"success":"info",duration:1500})}openAddToPlaylistMenu(e){const n=Tt();if(!n){u("还没有正在播放的歌曲",{duration:1600});return}const s=[];for(const a of i.playlists.filter(r=>!r.locked))s.push({id:a.id,label:a.name,icon:a.id==="liked"?"heart":"playlist",checked:a.songIds.includes(n.id)});s.length||s.push({id:"__none",label:"还没有可用的歌单",disabled:!0}),s.push({id:"__sep",kind:"sep"}),s.push({id:"__new",label:"新建歌单…",icon:"plus"}),ln({anchor:e,x:0,y:0,align:"right",items:s,onPick:async a=>{if(!(a==="__none"||a==="__sep")){if(a==="__new"){Er(r=>{r&&ss(r.id,[n.id])});return}ss(a,[n.id])}}})}}function Cu(){const t=i.queueOpen;ro(),!t&&i.currentId&&requestAnimationFrame(()=>Jr({notify:!1}))}te("mp-playerbar",xu);class kn extends me{get open(){return!1}get panelEl(){return null}updated(){const e=this.panelEl;if(e){if(this.open){this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden?(e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{this.open&&(e.dataset.state="opened")})):e.dataset.state!=="opened"&&(e.dataset.state="opened");return}e.hidden||(e.dataset.state="closed",!this._closeTimer&&(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!this.open&&e&&(e.hidden=!0)},Aa()+40)))}}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),this._closeTimer=null,super.disconnectedCallback()}bindDismiss(e){const n=a=>{const r=this.panelEl;!r||r.hidden||r.contains(a.target)||a.target.closest?.(e)||this.close()},s=a=>{if(a.key!=="Escape")return;const r=this.panelEl;r&&!r.hidden&&this.close()};document.addEventListener("pointerdown",n),document.addEventListener("keydown",s),this._undismiss=()=>{document.removeEventListener("pointerdown",n),document.removeEventListener("keydown",s)}}close(){}}class Tu extends kn{static deps=e=>[e.queueOpen,e.queue,e.currentId,e.playing,vn()];get open(){return!!i.queueOpen}get panelEl(){return this.querySelector("#queue-panel")}close(){ro(!1)}firstUpdated(){this.bindDismiss("#btn-playlist"),this.bindDrag()}updated(){super.updated(),this.bindDrag()}bindDrag(){const e=this.querySelector("#queue-panel-body");e&&(this._sortable&&this._sortable.el===e||(this._sortable?.destroy(),this._sortable=C.create(e,{draggable:".queue-item",animation:0,ghostClass:"is-dragging",onEnd:n=>{eo();const s=n.oldIndex,a=n.newIndex;if(s==null||a==null||s===a)return;const r=n.from,o=Array.from(r.children).filter(l=>l!==n.item);r.insertBefore(n.item,o[s]??null),sr(s,a),u("已调整播放顺序 · 播放模式已切回列表循环",{duration:1600})}})))}disconnectedCallback(){this._sortable?.destroy(),this._sortable=null,this._undismiss?.(),super.disconnectedCallback()}render(){const e=i.queueOpen?i.queue.map(n=>Ge(n)).filter(Boolean):[];return p`
      <section class="queue-panel" id="queue-panel" hidden data-state="closed" aria-label="播放列表">
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
            @click=${()=>Jr()}
          >
            ${f("disc")}
          </button>
          <button
            class="queue-panel__btn"
            id="queue-clear"
            type="button"
            data-tip="清空列表"
            aria-label="清空列表"
            @click=${()=>{nr(),u("播放列表已清空")}}
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
          ${e.length?Ie(e,n=>n.id,n=>this.item(n)):p`<div class="queue-panel__empty">播放列表是空的<br />从曲库把歌曲加进来</div>`}
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
        <span class="queue-item__cover"><img src=${Xa(dt(e))} alt="" loading="lazy" /></span>
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
    `}onClick(e){if(to())return;const n=e.target.closest("[data-queue-del]");if(n){e.stopPropagation(),aa(n.dataset.queueDel);return}const s=e.target.closest("[data-queue-id]");s&&sa(s.dataset.queueId)}onKey(e){if(e.key!=="Enter"&&e.key!==" ")return;const n=e.target.closest?.("[data-queue-id]");n&&(e.preventDefault(),sa(n.dataset.queueId))}}te("mp-queue-panel",Tu);class Eu extends kn{static deps=e=>[e.optionsOpen,e.config.lyricsFontSize,e.config.glassAlpha,e.config.glassBlur,e.config.glassBlurCustom,e.config.showDesktopLyrics,e.config.showDesktopWallpaper];get open(){return!!i.optionsOpen}get panelEl(){return this.querySelector("#options-panel")}close(){oo(!1)}firstUpdated(){this.bindDismiss("#btn-options"),this._sliders={size:ot(this.querySelector("#opt-lyric-size"),{min:12,max:26,step:1,value:i.config.lyricsFontSize,format:e=>`${Math.round(e)}px`,onChange:e=>{i.config.lyricsFontSize=e,it("--lyric-size",`${e}px`),this.requestUpdate()},onCommit:()=>x()}),alpha:ot(this.querySelector("#opt-alpha"),{min:20,max:95,step:1,value:i.config.glassAlphaCustom?i.config.glassAlpha:ca(),format:e=>`${Math.round(e)}%`,onChange:e=>{i.config.glassAlpha=e,i.config.glassAlphaCustom=!0,Ra(e),this.requestUpdate()},onCommit:()=>x()}),blur:ot(this.querySelector("#opt-blur"),{min:0,max:48,step:1,value:i.config.glassBlurCustom?i.config.glassBlur:da(),format:e=>`${Math.round(e)}px`,onChange:e=>{i.config.glassBlur=e,i.config.glassBlurCustom=!0,it("--glass-blur",`${e}px`),this.requestUpdate()},onCommit:()=>x()})}}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}render(){const e=Math.round(i.config.lyricsFontSize),n=Math.round(i.config.glassAlphaCustom?i.config.glassAlpha:ca()),s=Math.round(i.config.glassBlurCustom?i.config.glassBlur:da());return p`
      <section class="options-panel" id="options-panel" hidden data-state="closed" aria-label="播放选项">
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
              @click=${()=>co()}
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
              @click=${()=>uo()}
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
    `}}te("mp-options-panel",Eu);class Iu extends kn{static deps=e=>[e.sleepOpen,e.sleepTimer,e.config.sleepAfterSong,e.playing,e.currentId];get open(){return!!i.sleepOpen}get panelEl(){return this.querySelector("#sleep-panel")}close(){lo(!1)}constructor(){super(),this._tick=null,this._pendingMinutes=null}onConnected(){this._tick=setInterval(()=>{i.sleepOpen&&i.sleepTimer&&this.requestUpdate()},1e3)}onDisconnected(){this._tick&&clearInterval(this._tick),this._tick=null}firstUpdated(){this.bindDismiss("#btn-sleep"),this._slider=ot(this.querySelector("#sleep-slider"),{min:0,max:300,step:1,value:0,format:e=>`${Math.round(e)} 分钟`,onChange:e=>{this._pendingMinutes=Math.round(e),this.requestUpdate()},onCommit:e=>{this._pendingMinutes=null,$u(e)}})}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}updated(){super.updated();const e=i.sleepTimer,n=this.querySelector("#sleep-slider");if(e?.type==="duration"){const s=Math.max(0,e.until-Date.now());n?.dataset.dragging!=="true"&&this._slider?.set(Math.max(0,Math.round(s/6e4)),{silent:!0})}else n?.dataset.dragging!=="true"&&this._slider?.set(0,{silent:!0})}render(){const e=i.sleepTimer,n=Du(e,this._pendingMinutes);return p`
      <section class="sleep-panel" id="sleep-panel" hidden data-state="closed" aria-label="定时停止">
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
              @click=${()=>ku(!i.config.sleepAfterSong)}
            ></button>
          </div>
          <div class="sleep-panel__row">
            <button
              class="btn btn--sm"
              type="button"
              data-sleep-act="off"
              @click=${()=>fo("已取消定时停止")}
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
    `}}function Du(t,e){if(typeof e=="number")return e<=0?{value:"未开启",sub:"拖到 0 即取消"}:{value:`${e} 分钟`,sub:"松手开始倒计时"};if(t?.type==="after-song")return{value:"等待本首播完",sub:"倒计时已结束，这首播完就暂停"};if(t?.type==="duration"){const n=Math.max(0,t.until-Date.now());return{value:`剩余 ${Au(n)}`,sub:`共 ${t.minutes} 分钟`}}return{value:"未开启",sub:"拖动滑块设置时长"}}function Au(t){const e=Math.max(0,Math.round(t/1e3)),n=Math.floor(e/3600),s=Math.floor(e%3600/60),a=e%60;return n>0?`${n} 小时 ${String(s).padStart(2,"0")} 分`:`${String(s).padStart(2,"0")}:${String(a).padStart(2,"0")}`}te("mp-sleep-panel",Iu);class Mu extends kn{static deps=()=>{const e=Jt();return[e.open,e.revision]};get open(){return Jt().open}get panelEl(){return this.querySelector("#download-panel")}close(){El()}firstUpdated(){this.bindDismiss("#btn-downloads")}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}render(){const{tasks:e,running:n}=Jt(),s=e.some(a=>a?.state!=="running");return p`
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
            @click=${()=>Dl()}
          >
            ${f("folder")}
          </button>
          <button
            class="download-panel__btn"
            id="download-clear"
            type="button"
            data-tip="清除已完成"
            aria-label="清除已完成"
            ?disabled=${!s}
            @click=${()=>Il()}
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
          ${e.length?Ie(e,a=>a.id,a=>this.item(a)):p`<div class="download-panel__empty">还没有下载任务</div>`}
        </div>
      </section>
    `}item(e){const n=e.state==="running"?"running":e.state==="failed"?"failed":"done",s=Number(e.total)||0,a=Number(e.done)||0,r=s>0?Math.min(100,Math.round(a/s*100)):0,o=Math.max(0,Math.min(100,Math.round(r/5)*5)),l=n==="running";let c=`${r}%`;n==="done"?c="已完成":n==="failed"?c="失败":s<=0&&(c="下载中");let d;return l?d=s>0?`${On(a)} / ${On(s)}`:On(a):n==="done"?d=`${On(a||s)} · ${e.path?Pu(e.path):e.dir||""}`:d=e.message||"下载失败",p`
      <div
        class="download-item"
        data-state=${n}
        data-download-id=${e.id}
        role=${n==="done"?"button":B}
        tabindex=${n==="done"?"0":B}
        data-tip=${n==="done"?"在文件夹中显示":B}
        @click=${()=>Al(e.id)}
      >
        <div class="download-item__title">${e.title||e.bvid||"未命名"}</div>
        <div class="download-item__state">${c}</div>
        <div class="download-item__bar" ?hidden=${!l} data-unknown=${s>0?"false":"true"}>
          <div class="download-item__fill" data-value=${o}></div>
        </div>
        <div class="download-item__meta${n==="failed"?" download-item__meta--error":""}">${d}</div>
      </div>
    `}}te("mp-download-panel",Mu);function On(t){const e=Number(t)||0;if(e<=0)return"0 B";const n=["B","KB","MB","GB"];let s=0,a=e;for(;a>=1024&&s<n.length-1;)a/=1024,s+=1;return`${a>=10||s===0?Math.round(a):a.toFixed(1)} ${n[s]}`}function Pu(t){const e=String(t||""),n=Math.max(e.lastIndexOf("\\"),e.lastIndexOf("/"));return n>=0?e.slice(n+1):e}class Ou extends kn{static deps=()=>[N.open,N.songId,N.rev,vn(),i.config.coverCarousel,i.config.embedMeta];get open(){return N.open}get panelEl(){return this.querySelector("#cover-layer")}close(){Xt()}render(){const e=this.song();return p`
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
              @click=${()=>Xt()}
            >
              ${f("close")}
            </button>
          </div>
          <div class="cover-layer__body" id="cover-layer-body">${e&&this.open?this.panel(e):B}</div>
        </div>
      </div>
    `}song(){const e=N.songId;return e&&i.songs.find(n=>n.id===e)||null}panel(e){const n=N,s=_o(e);return p`
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
              @input=${a=>{N.keyword=a.target.value}}
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
          ${n.candidates.length?this.selectbar():B}
        </div>

        <div class="cover-panel__foot">
          <button
            class="btn btn--sm"
            type="button"
            data-cover-act="open-cache"
            @click=${()=>b.coverOpenCacheDir("covers")}
          >
            ${f("folder")}<span>打开缓存目录</span>
          </button>
        </div>
      </div>
    `}setItems(){const e=N,n=e.currentSet?.items||[],s=e.currentSet?.embedded||[],a=Number(e.currentSet?.active)||0;return!n.length&&!s.length?p`<div class="cover-set__empty">还没有换过封面，这首歌现在用的是文件自带的封面。</div>`:p`
      ${n.map((r,o)=>p`
          <div class="cover-set__item" data-set-index=${o} data-active=${String(o===a)}>
            <img src=${r.preview} alt="" />
            ${o===a?p`<span class="cover-set__badge">当前</span>`:B}
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
    `}cards(){const e=N;return Ie(e.candidates,n=>n.preview,(n,s)=>{const a=e.selected.has(n);return p`
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
    `}onClick(e){if(e.target.closest("[data-cover-close]")||e.target===this.panelEl){Xt();return}const n=e.target.closest("[data-set-act]");if(n){const s=Number(n.closest("[data-set-index]")?.dataset.setIndex);n.dataset.setAct==="use"&&this.useExisting(s),n.dataset.setAct==="remove"&&this.removeExisting(s)}}onKey(e){if(e.key!=="Escape")return;const n=this.querySelector("#cover-keyword");if(n&&document.activeElement===n&&n.value.trim()){N.keyword="",n.value="";return}Xt()}toggleCandidate(e){const n=N.candidates[e];n&&(N.selected.has(n)?N.selected.delete(n):N.selected.add(n),Oe())}selectAll(){const e=N;e.selected.size===e.candidates.length?e.selected.clear():e.candidates.forEach(n=>e.selected.add(n)),Oe()}async runSearch(){const e=N;if(e.busy)return;if(!k()){X("浏览器预览下没有联网封面后端，请在应用里试");return}e.busy=!0;const n=e.candidates.filter(a=>a.local);e.candidates=[...n],e.selected=new Set(n),Oe();const s=(this.querySelector("#cover-keyword")?.value||"").trim();X(s?`正在按「${s}」同时查询多个来源（${ji()}）…`:`正在同时查询多个来源（${ji()}）…`);try{const a=s?{keyword:s}:{},r=await b.coverLookupSongAll(e.songId,a),o=Array.isArray(r)?r.filter(l=>l?.ok&&l.preview):[];if(o.length){e.candidates=[...n,...o.map(c=>({...c,local:!1}))];const l=[...new Set(o.map(c=>c.provider).filter(Boolean))];X(`找到 ${o.length} 张（来源：${l.join(" / ")||"未知"}），勾选后点「应用」`)}else{e.candidates=[...n];const l=Array.isArray(r)?r.find(c=>c?.message)?.message:"";X(l||"没有找到匹配的封面（也可能是匹配到的都是空白图，已自动丢弃）")}}catch(a){X(`搜索失败：${a?.message??a}`)}finally{e.busy=!1,Oe()}}async pickLocal(){const e=N;if(!k()){X("浏览器预览下没有系统文件选择器，请在应用里试");return}X("正在读取图片…");try{const n=await b.coverPickLocal();if(!n||n.cancelled){X("");return}if(!n.ok||!n.preview){X(n?.message||"这张图片没法用作封面");return}const s={preview:n.preview,provider:n.provider||"本地图片",source:n.source||"",width:n.width,height:n.height,local:!0};e.candidates.unshift(s),e.selected.add(s),Oe(),X(`已加入本地图片${n.source?`（${n.source}）`:""}，确认后点「应用」`)}catch(n){X(`选择图片失败：${n?.message??n}`)}}async applySelected(){const e=N.candidates.filter(n=>N.selected.has(n)).map(n=>n.preview).filter(Boolean);if(!e.length){X("先勾选至少一张封面");return}await this.writeCovers(()=>b.coverAddMany(N.songId,e,i.config.embedMeta===!0))}async useExisting(e){Number.isFinite(e)&&await this.writeCovers(()=>b.coverSetActive(N.songId,e))}async useEmbedded(e){e?.preview&&await this.writeCovers(()=>b.coverAdd(N.songId,"",e.preview,i.config.embedMeta===!0))}async removeExisting(e){Number.isFinite(e)&&await this.writeCovers(()=>b.coverRemove(N.songId,e))}async writeCovers(e){const n=N;if(!k()){X("浏览器预览下没有封面后端，请在应用里试");return}X("正在保存…");try{const s=await e();s&&Array.isArray(s.items)&&(n.currentSet=s,ra(n.songId,s)),X(s?.message||"已更新封面"),Ei(),u(s?.message||"封面已更新",{tone:"success",duration:1800})}catch(s){X(`保存失败：${s?.message??s}`)}}toggleCarousel(){i.config.coverCarousel=!i.config.coverCarousel,x(),u(i.config.coverCarousel?`已开启封面轮播（每 ${Number(i.config.coverCarouselInterval)||10} 秒换一张）`:"已关闭封面轮播",{duration:1600})}toggleEmbed(){i.config.embedMeta=!i.config.embedMeta,x(),u(i.config.embedMeta?"之后的封面会写进歌曲文件本身":"封面只保存在缓存目录（不改动音乐文件）",{duration:2200})}async refreshSet(){const e=N;if(!(!k()||!e.songId))try{const n=await b.coverList(e.songId);n&&Array.isArray(n.items)&&(e.currentSet=n,ra(e.songId,n),Ei())}catch(n){X(`读取现有封面失败：${n?.message??n}`)}}}te("mp-cover-layer",Ou);const N={open:!1,songId:"",candidates:[],selected:new Set,currentSet:null,busy:!1,status:"",keyword:"",rev:0};function Oe(){N.rev+=1,he()}function X(t){N.status=t||"",Oe()}const Lu=()=>document.querySelector("mp-cover-layer");function ji(){return no(i.coverProviders,"iTunes / 网易云 / QQ 音乐 / Deezer / MusicBrainz")}function Ru(t){if(!i.songs.find(s=>s.id===t)){u("这首歌不在本地曲库里，无法更换封面",{tone:"warning"});return}Object.assign(N,{open:!0,songId:t,candidates:[],selected:new Set,currentSet:i.coverSets.get(t)||null,status:"",keyword:""}),Oe(),Lu()?.refreshSet(),Nu()}function Xt(){N.open=!1,Oe()}async function Nu(){if(!(i.coverProviders?.length||!k()))try{const t=await b.coverProviders();Array.isArray(t?.providers)&&t.providers.length&&(i.coverProviders=t.providers,Oe())}catch{}}const Vi="音乐播放器",qu="MusicPlayer",Bu="本地曲库 + 在线试听的桌面音乐播放器",Fu="0.1.0",zu="Apache-2.0",Wu="Copyright 2026 MusicPlayer contributors",ea="https://github.com/nihaozyj7/MusicPlayer",Hu=[{id:"home",label:"项目主页",icon:"external",url:ea},{id:"issues",label:"问题反馈",icon:"external",url:`${ea}/issues`},{id:"releases",label:"更新日志",icon:"external",url:`${ea}/releases`},{id:"license",label:"Apache-2.0 协议全文",icon:"scale",url:"https://www.apache.org/licenses/LICENSE-2.0"}],Uu=[{name:"Go",version:"1.25",role:"后端：目录扫描、标签解析、音频 HTTP 服务、响度测量、在线接口聚合",url:"https://go.dev/"},{name:"Wails",version:"v3（beta.14）",role:"桌面外壳：Go ↔ WebView 桥、无边框窗口、托盘、单实例、系统文件对话框",url:"https://v3.wails.io/"},{name:"WebView2",version:"系统自带",role:"界面渲染引擎（Windows）；应用不内嵌浏览器内核，因此安装包很小",url:"https://developer.microsoft.com/microsoft-edge/webview2/"},{name:"Lit",version:"3",role:"前端视图层：设置、曲目表、各弹层都是增量更新的自定义元素",url:"https://lit.dev/"},{name:"原生 ES Module + Vite",version:"7",role:"界面代码本身是可直接阅读的 JS，Vite 只做依赖解析与产物打包",url:"https://vite.dev/"},{name:"npm workspaces",version:"—",role:"单仓多包：应用壳 + 播放界面样式包（frontend/packages/player-skins）",url:"https://docs.npmjs.com/cli/using-npm/workspaces"},{name:"ffmpeg",version:"8.1.2（自行编译的精简版）",role:"解码 WebView 放不了的格式、转码为 PCM/WAV、loudnorm 响度测量",url:"https://ffmpeg.org/"},{name:"ESLint / Prettier / TypeScript",version:"9 / 3 / 5",role:"代码检查与类型检查（JSDoc + checkJs，逐个文件收紧）",url:"https://eslint.org/"}],ju=[{name:"Wails",version:"v3.0.0-beta.14",license:"MIT",role:"桌面外壳与 Go↔JS 桥",url:"https://github.com/wailsapp/wails"},{name:"dhowden/tag",version:"2024-04-17",license:"BSD-2-Clause",role:"mp3 / m4a / flac / ogg 标签解析",url:"https://github.com/dhowden/tag"},{name:"fsnotify/fsnotify",version:"1.9.0",license:"BSD-3-Clause",role:"音乐文件夹的实时监听",url:"https://github.com/fsnotify/fsnotify"},{name:"Lit",version:"3.3.3",license:"BSD-3-Clause",role:"前端视图层",url:"https://github.com/lit/lit"},{name:"SortableJS",version:"1.15.7",license:"MIT",role:"播放队列与歌单的拖拽排序",url:"https://github.com/SortableJS/Sortable"}],Vu=[{name:"coder/websocket",version:"1.8.14",license:"ISC",role:"Wails 的 WebSocket 传输",url:"https://github.com/coder/websocket"},{name:"go-ole/go-ole",version:"1.3.0",license:"MIT",role:"Windows COM 绑定",url:"https://github.com/go-ole/go-ole"},{name:"godbus/dbus/v5",version:"5.2.2",license:"BSD-2-Clause",role:"Linux 桌面集成",url:"https://github.com/godbus/dbus"},{name:"jchv/go-winloader",version:"2025-04-06",license:"ISC",role:"Windows 依赖加载",url:"https://github.com/jchv/go-winloader"},{name:"adrg/xdg",version:"0.5.3",license:"MIT",role:"跨平台标准目录",url:"https://github.com/adrg/xdg"},{name:"mattn/go-colorable",version:"0.1.14",license:"MIT",role:"Windows 控制台彩色输出",url:"https://github.com/mattn/go-colorable"},{name:"mattn/go-isatty",version:"0.0.20",license:"MIT",role:"判断 stdout 是否为终端",url:"https://github.com/mattn/go-isatty"},{name:"golang.org/x/sys",version:"0.46.0",license:"BSD-3-Clause",role:"Go 官方系统调用扩展",url:"https://pkg.go.dev/golang.org/x/sys"}],Gu=[{name:"FFmpeg",version:"8.1.2",license:"LGPL-2.1-or-later",role:"由本项目用 build/ffmpeg/build-minimal.sh 从官方源码自行编译的精简版（约 5.6MB），只保留音频解码 / 转码 / loudnorm，未启用 GPL 组件",url:"https://ffmpeg.org/legal.html"}],Ku=[{label:"本项目",value:"Apache License 2.0",tone:"ok",desc:"可自由使用、修改、分发（含商用），需保留版权与许可声明，并附带变更说明。仓库根目录的 LICENSE 是完整协议文本。"},{label:"内嵌 FFmpeg",value:"LGPL-2.1-or-later",tone:"note",desc:"以独立可执行文件形式随应用解包到数据目录，用户可以直接替换；本应用未修改 FFmpeg 源码。详见 internal/ffmpeg/bin/FFMPEG-LICENSE.txt。"},{label:"第三方库",value:"MIT / BSD / ISC",tone:"note",desc:"均为宽松许可证，允许在 Apache-2.0 项目中使用；完整清单与版本见下方表格。"}],Yu=[{name:"LRCLIB",role:"歌词（无需鉴权的开放歌词库）",url:"https://lrclib.net/"},{name:"网易云音乐",role:"歌词 / 封面备选来源",url:"https://music.163.com/"},{name:"QQ 音乐",role:"歌词 / 封面备选来源",url:"https://y.qq.com/"},{name:"iTunes Search API",role:"封面（Apple 官方公开接口）",url:"https://performance-partners.apple.com/search-api"},{name:"Deezer",role:"封面备选来源",url:"https://developers.deezer.com/api"},{name:"MusicBrainz",role:"封面（配合 Cover Art Archive）",url:"https://musicbrainz.org/"},{name:"哔哩哔哩",role:"在线试听与下载（公开 Web 接口）",url:"https://www.bilibili.com/"}],Xu=[{title:"开源社区",body:"Go、Wails、Lit、Vite、FFmpeg 以及上面列出的每一个库 —— 没有它们，这个播放器不会存在。"},{title:"FFmpeg 项目",body:"让「放不出来的格式」有了统一的解法；EBU R128 响度测量也建立在它的 loudnorm 滤镜之上。"},{title:"数据服务提供方",body:"LRCLIB、网易云音乐、QQ 音乐、Apple、Deezer、MusicBrainz、哔哩哔哩 提供了歌词与封面等公开数据。本项目的调用均来自官方或公开接口，版权归各自权利人所有。"},{title:"每一位反馈者",body:"界面细节、格式兼容性、性能问题的每一条反馈都直接变成了代码里的修复。"}],Qu=["本软件只做本地音乐的整理与播放，不提供、不存储、不分发任何音乐内容。","在线搜索 / 试听 / 下载依赖第三方公开接口，其可用性与内容均由对应平台决定。","自动匹配的封面与歌词来自公开曲库，不保证与歌曲完全对应，请自行核对后再写回文件。"];function Ju(t){const e=String(t?.version||"").trim();return!e||e==="—"?String(t?.name||""):`${t.name} ${e}`}function Zu(){return[...ju.map(t=>({...t,kind:"运行时"})),...Vu.map(t=>({...t,kind:"随 Wails 引入"}))]}function ep(t){const e=new Map;for(const n of t)e.set(n.license,(e.get(n.license)||0)+1);return[...e.entries()].sort((n,s)=>s[1]-n[1]||n[0].localeCompare(s[0])).map(([n,s])=>({license:n,count:s}))}const ht=[{id:"library",label:"曲库"},{id:"appearance",label:"外观"},{id:"player",label:"播放器"},{id:"data",label:"数据"},{id:"ai",label:"AI"},{id:"other",label:"其他"},{id:"about",label:"关于"}],tp=[{value:-14,label:"较响（流媒体常见）"},{value:-16,label:"推荐（默认）"},{value:-18,label:"温和"},{value:-23,label:"广播级"}],np=[{value:"off",label:"关闭"},{value:"track",label:"逐曲均衡"},{value:"album",label:"同专辑统一"}];function R({label:t,hint:e,control:n}){return p` <div class="setting">
    <div class="setting__main">
      <div class="setting__label">${t}</div>
      ${e?p`<div class="setting__hint">${e}</div>`:B}
    </div>
    <div class="setting__control">${n}</div>
  </div>`}function se(t,e,n){return p`<button
    class="switch"
    type="button"
    role="switch"
    aria-checked=${String(!!e)}
    data-toggle=${t}
    aria-label=${n}
  ></button>`}function xe(t,e,n){return p` <div class="segmented" data-segment=${t}>
    ${e.map(s=>p`<button
          class="segmented__btn"
          type="button"
          data-value=${s.value}
          aria-pressed=${String(String(s.value)===String(n))}
        >
          ${s.label}
        </button>`)}
  </div>`}function sp(t){const e=t.aiVendor||"auto",n=Ir(e),s="开启后模型会先推理再给结论，响应更慢；关闭则直接作答";return e==="auto"?s+"；自动识别："+(n||"按接口地址与模型名判断厂商"):n?s+"；该厂商："+n:s}function Ln(t,e,n){return p` <div class="rangeslider">
    <div class="slider" id=${t} role="slider" tabindex="0" aria-label=${n} data-slider=${e}>
      <div class="slider__rail"><div class="slider__fill"></div></div>
      <div class="slider__thumb"></div>
      <div class="slider__bubble"></div>
    </div>
    <!-- 数值由滑杆自己写（见 sliderOptions 的 onChange）：同一个节点只允许一个写入方 -->
    <span class="rangeslider__value"></span>
  </div>`}class ap extends me{static deps=e=>[e.settingsOpen,e.settingsRev,e.settingsSection,e.view,e.folders,e.filterRules,e.songs,e.allSongsRaw,e.lastScan?.at??0,e.scanning,il(),qr(),e.config,e.coverProviders,e.coverBreaker,e.coverCache,e.loudnessState,e.ffmpegState,e.backdropState];constructor(){super(),this._activeSection=ht[0].id,this._navPausedUntil=0,this._navResumeTimer=null,this._sliders=new WeakMap}get open(){return cr()}get panelEl(){return this.querySelector("#settings-layer")}updated(){const e=this.panelEl;if(e){if(this.open){if(this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden){e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{this.open&&(e.dataset.state="opened")});const n=this.querySelector(".settings-layer__body");n&&(n.scrollTop=0)}this.bindSliders(),zd();return}e.hidden||(e.dataset.state="closed",!this._closeTimer&&(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!this.open&&e&&(e.hidden=!0)},Aa()+40)))}}onConnected(){this._onScrollCapture=e=>this.onScroll(e),this.addEventListener("scroll",this._onScrollCapture,!0)}onDisconnected(){this._onScrollCapture&&(this.removeEventListener("scroll",this._onScrollCapture,!0),this._onScrollCapture=null),this._navResumeTimer&&clearTimeout(this._navResumeTimer),this._navResumeTimer=null}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),this._closeTimer=null,super.disconnectedCallback()}render(){return Li(),p`
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
              @click=${()=>Xn()}
            >
              ${f("close")}
            </button>
          </div>
          <div class="settings-layer__body">
            <div class="settings">
              <div class="settings__nav" role="tablist">
                ${ht.map(e=>p`<button
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
    `}foldersCard(){const e=i.folders.length?i.folders.map(n=>{const s=n.status==="ok"?p`<span class="chip chip--ok"
                  ><i class="chip__dot"></i>${n.watching?"监听中":"已停止监听"}</span
                >`:n.status==="missing"?p`<span class="chip chip--error"><i class="chip__dot"></i>路径不存在</span>`:p`<span class="chip chip--warn"><i class="chip__dot"></i>无访问权限</span>`,a=i.songs.filter(r=>r.path.startsWith(n.path)).length;return p` <div class="pathrow" data-folder=${n.id}>
            <svg class="pathrow__icon" aria-hidden="true"><use href="#i-folder"></use></svg>
            <div class="pathrow__main">
              <div class="pathrow__path u-selectable" title=${n.path}>${n.path}</div>
              <div class="pathrow__meta">${s}<span>${D(a)} 首</span></div>
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
            ${se("autoScanOnStart",i.config.autoScanOnStart,"启动时自动扫描")}
          </div>
        </div>
        ${R({label:"实时监听文件夹变化",hint:"新增、删除、重命名文件后自动更新曲库（需要后端文件监听）",control:se("watchFolders",i.config.watchFolders,"实时监听")})}
        ${R({label:"元数据并发读取",hint:"同时解析的音频文件数量，机械硬盘建议调低",control:xe("scanConcurrency",[2,4,8].map(n=>({value:String(n),label:`${n}`})),String(i.config.scanConcurrency))})}
      </div>
      <div class="card__foot">
        <span>支持格式：mp3 · flac · wav · m4a · ogg · aac（ape / wma 需转码）</span>
        <span class="u-num">${D(i.folders.length)} 个文件夹</span>
      </div>
    </section>`}ruleRow(e){const n=e.type==="regex"&&e.value&&!zo(e.value);return p` <div class="rule" data-rule=${e.id} data-enabled=${String(e.enabled)}>
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
    </div>`}rulesCard(){const{kept:e,excluded:n,total:s}=ar(i.allSongsRaw,i.filterRules);return p` <section class="card" id="sec-filters" data-section="library">
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
        ${i.filterRules.length?i.filterRules.map(a=>this.ruleRow(a)):p`<div class="setting__hint">还没有规则。下面的预置规则可以一键添加。</div>`}
        <div class="rule__preview">
          当前规则下：共扫描 <b>${D(s)}</b> 个文件，保留 <b>${D(e.length)}</b> 首，过滤掉
          <b>${D(n)}</b> 个
        </div>
      </div>
      <div class="card__foot">
        <span>「排除」优先于「仅包含」；支持正则表达式（忽略大小写）</span>
        <span>大小单位在数值后填写，默认字节</span>
      </div>
    </section>`}themeCard(){const e=ps(),n=Li(),s=window.matchMedia("(prefers-color-scheme: dark)").matches;return p` <section class="card" id="sec-appearance" data-section="appearance">
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
        ${e.map(a=>{const r=i.config.theme===a.id;return p` <div class="themecard" data-active=${String(r)}>
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
            ${a.builtin?p`<span class="themecard__badge">内置</span>`:p`<button
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
          <span class="u-num u-fs-xs">用 AI 写一个，或导入现成的 CSS</span>
        </button>
      </div>
      <div class="card__body">
        ${R({label:"深浅色模式",hint:`当前系统偏好：${s?"深色":"浅色"}`,control:xe("themeMode",[{value:"dark",label:"深色"},{value:"light",label:"浅色"},{value:"system",label:"跟随系统"}],i.config.themeMode)})}
        ${R({label:"毛玻璃模糊强度",hint:"控制面板背后内容的模糊程度",control:Ln("set-blur","glassBlur","模糊强度")})}
        ${R({label:"面板不透明度",hint:"面板背景的透明程度，数值越大越透",control:Ln("set-alpha","glassAlpha","不透明度")})}
        ${R({label:"界面动画",hint:"关闭后取消过渡与旋转动画，低性能设备更流畅",control:se("animations",i.config.animations,"界面动画")})}
        ${R({label:"过渡速度",hint:"弹出层、菜单、面板的进出动画时长；默认快速 0.25 秒",control:xe("animationsSpeed",wd,i.config.animationsSpeed||"fast")})}
        ${R({label:"主题色跟随封面",hint:"从当前封面提取主色调，作为界面主题色",control:se("accentFromCover",i.config.accentFromCover,"主题色跟随封面")})}
        ${R({label:"显示专辑列",hint:"窄窗口下会自动隐藏该列",control:se("showAlbumColumn",i.config.showAlbumColumn,"显示专辑列")})}
        ${R({label:"列表密度",hint:"对「本地歌曲」「播放列表」「歌单」三个列表同时生效",control:xe("listDensity",_d,i.config.listDensity||"cozy")})}
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
        ${R({label:"窗口原生材质",hint:"用系统原生的半透明材质当窗口底色（桌面壁纸会透出来）。Windows 11 较新版本效果最完整，旧版本会自动降级。改动后需要重启应用",control:p` <div class="select">
            <select class="select__field" data-act="backdrop-mode" aria-label="窗口原生材质">
              ${Dr.map(e=>p`<option value=${e} ?selected=${(i.config.nativeBackdrop||"off")===e}>
                    ${Vn(e)}
                  </option>`)}
            </select>
            <svg class="select__icon"><use href="#i-chevron-down"></use></svg>
          </div>`})}
        ${this.backdropNote()}
        ${R({label:"窗口圆角",hint:"主窗口四角的圆角幅度。圆角由系统绘制，只有这几档（仅 Windows 11 有效）",control:xe("windowCorners",yd,i.config.windowCorners||"system")})}
        ${R({label:"关闭时最小化到托盘",hint:"打开后点关闭按钮只把窗口收进系统托盘（任务栏右下角），音乐照常播放；要真正退出请用托盘图标的右键菜单",control:se("minimizeToTray",i.config.minimizeToTray,"关闭时最小化到托盘")})}
      </div>
    </section>`}backdropNote(){const e=i.backdropState||{},n=e.active||"off",s=i.config.nativeBackdrop||"off",a=s!==n,r=[];return e.preview?r.push("浏览器预览里没有原生窗口，材质只在打包后的应用里能看到。"):(r.push(p`窗口当前生效：<b>${Vn(n)}</b>`),!e.supported&&s!=="off"&&r.push("当前系统不支持原生材质，会退化为普通的背景模糊。"),a&&r.push(p`已保存为 <b>${Vn(s)}</b>，重启应用后生效。`)),p` <div class="setting setting--stack">
      <div class="setting__hint">${r.map((o,l)=>p`${l?p`<br />`:B}${o}`)}</div>
      ${a&&!e.preview?p`<div class="card__actions">
              <button class="btn btn--sm" type="button" data-act="backdrop-restart">
                ${f("refresh")}<span>立即重启应用</span>
              </button>
            </div>`:B}
    </div>`}playerCard(){const e=ls(),n=Rr();return p` <section class="card" id="sec-player" data-section="appearance">
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
        ${e.map(s=>{const a=i.config.playerViewMode===s.id;return p` <div class="skincard" data-active=${String(a)}>
            <button
              class="skincard__pick"
              type="button"
              data-act="skin-pick"
              data-id=${s.id}
              aria-pressed=${String(a)}
              aria-label=${`使用样式 ${s.name}`}
            >
              <span class="skincard__icon">${f(s.icon||"disc")}</span>
              <span class="skincard__name">${s.name}</span>
              <span class="skincard__id">${s.id}</span>
            </button>
            ${s.builtin?B:p`<span class="skincard__badge">第三方</span>
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
          <span class="u-num u-fs-xs">用 AI 帮你写一个</span>
        </button>
      </div>
      ${n.length?p`<div class="card__body">
              ${n.map(s=>p` <div class="setting">
                    <div class="setting__main">
                      <div class="setting__label">样式「${s.id}」加载失败</div>
                      <div class="setting__hint">${s.reason}</div>
                    </div>
                  </div>`)}
            </div>`:B}
      <div class="card__body">
        ${R({label:"封面轮播",hint:"一首歌有多张封面时，播放详情页按下面的间隔轮换显示（不影响列表缩略图）",control:se("coverCarousel",i.config.coverCarousel===!0,"封面轮播")})}
        ${R({label:"轮播间隔",hint:"每隔多少秒切换一张",control:Ln("set-carousel","coverCarouselInterval","轮播间隔")})}
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
        ${R({label:"默认播放模式",hint:"点击底栏循环按钮可随时切换",control:xe("playMode",[{value:"sequence",label:"列表循环"},{value:"loop-one",label:"单曲循环"},{value:"shuffle",label:"随机"}],i.config.playMode==="loop-all"?"sequence":i.config.playMode)})}
        ${R({label:"随机播放方式",hint:"随机播放会先打乱当前播放列表，再按打乱后的顺序播放",control:xe("shuffleMode",[{value:"reshuffle",label:"播完重新打乱"},{value:"once",label:"只打乱一次"}],i.config.shuffleMode||"reshuffle")})}
        ${R({label:"记忆音量",hint:"记住上次的音量，下次启动时恢复",control:se("rememberVolume",i.config.rememberVolume!==!1,"记忆音量")})}
        ${R({label:"保留歌曲播放进度",hint:"记住每首歌上次播到哪儿；退出后重新打开会回到那个位置。只恢复进度条，不会自动开始播放",control:se("resumeProgress",i.config.resumeProgress===!0,"保留歌曲播放进度")})}
        ${R({label:"单击歌曲时的行为",hint:p`双击始终是「立即播放这一首」，此设置只影响单击。<br />
            播放：立刻播放这首歌，并加入播放列表；<br />
            播放当前列表：用当前整个列表替换播放队列，从这首歌开始播；<br />
            下一首播放：插到当前歌曲后面，下一次「下一曲」时播放。`,control:xe("rowClickAction",bd,i.config.rowClickAction||"next")})}
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
        ${R({label:"歌词来源优先级",hint:"内嵌歌词 → 同目录 .lrc → 歌词缓存 → 在线自动匹配；本地读不到时会自动联网匹配并存入缓存",control:p`<span class="chip"><i class="chip__dot"></i>${kd()}</span>`})}
        ${R({label:"显示歌词",hint:"关闭后播放界面只显示封面",control:se("showLyrics",i.config.showLyrics,"显示歌词")})}
        ${R({label:"桌面歌词",hint:"在桌面上显示一行置顶歌词（独立透明窗口，可拖动；底栏「桌面歌词」按钮同效）。位置会被记住；换显示器后如果位置不对，可以在这里重置",control:p` ${se("showDesktopLyrics",i.config.showDesktopLyrics,"桌面歌词")}
            <button
              class="btn btn--ghost btn--sm"
              type="button"
              data-act="reset-desktop-lyrics-pos"
              data-tip="把桌面歌词窗口移回默认位置并清掉记忆"
            >
              重置位置
            </button>`})}
        ${R({label:"桌面背景歌词",hint:"把播放界面的背景铺满桌面、垫在桌面图标之下，歌词跟着画在上面（与「桌面歌词」二选一；仅 Windows）",control:se("showDesktopWallpaper",i.config.showDesktopWallpaper,"桌面背景歌词")})}
        ${R({label:"歌词字号",hint:"歌词文字大小，当前播放的那一行会略微放大",control:Ln("set-lyric-size","lyricsFontSize","歌词字号")})}
        ${R({label:"居中高亮行数",hint:"当前行上下各显示的行数",control:xe("lyricsLines",[3,5,7,9].map(e=>({value:String(e),label:String(e)})),String(i.config.lyricsLines))})}
      </div>
    </section>`}loudnessCard(){const e=i.config,n=i.loudnessState||{},s=n.measured??0,a=n.missing??Math.max(0,i.songs.length-s),r=n.total??i.songs.length,o=n.available!==!1,c=(i.ffmpegState||{}).describe||n.describe||"检测中…";return p` <section class="card" id="sec-loudness" data-section="player">
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
        <div class="setting__control">${xe("loudnessMode",np,e.loudnessMode||"off")}</div>
      </div>

      <div class="setting">
        <div class="setting__label">
          <span>目标响度</span>
          <small class="u-fs-xs u-dim">数值越小整体越轻，推荐用默认档。改动后会自动重新计算</small>
        </div>
        <div class="setting__control">
          <div class="select">
            <select class="select__field" data-act="loudness-target" aria-label="目标响度">
              ${tp.map(d=>p`<option value=${d.value} ?selected=${Number(e.loudnessTarget)===d.value}>
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
          当前设置下已算好 <b>${s}</b> / ${r}
          首${a?p`，其余 <b>${D(a)}</b> 首会在播放时计算`:"（全部已算好）"}<br />
          响度来源：<b>${o?c:"不可用"}</b>
        </div>
      </div>
    </section>`}onlineCard(){const e=i.config.downloadDir||"（默认：系统音乐目录 / downloads）",n=i.coverProviders||[],s=i.coverBreaker||{},a=n.length?n.map(r=>s[r]?`${Ta(r)}（暂时不可用）`:Ta(r)).join(" · "):"正在读取…";return p` <section class="card" id="sec-online" data-section="data">
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

        ${R({label:"联网获取封面",hint:`在线搜索到的歌曲会自动去公开曲库匹配封面：${a}`,control:se("onlineCover",i.config.onlineCover!==!1,"联网获取封面")})}
        ${R({label:"把封面/歌词写进歌曲文件",hint:Sd(),control:se("embedMeta",i.config.embedMeta===!0,"写进歌曲文件")})}

        <div class="setting setting--stack">
          <div class="setting__main">
            <div class="setting__label">把已有缓存补写进文件</div>
            <div class="setting__hint">${xd()}</div>
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
            <div class="setting__hint">封面与歌词的缓存位置；${Ya()}</div>
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
    </section>`}aiCard(){const e=i.config||{},n=!!(String(e.aiBaseUrl||"").trim()&&String(e.aiApiKey||"").trim()),s=(a,r,o,l,c="text")=>p` <div class="setting setting--stack">
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
        ${R({label:"模型类型",hint:"不同厂商对思考模式的支持方式不同，选错会导致这个开关不生效；选「自动识别」可自动判断",control:p` <select class="select__field" data-act="ai-vendor" aria-label="模型类型">
            ${za.map(a=>p`<option value=${a.id} ?selected=${a.id===(e.aiVendor||"auto")}>${a.label}</option>`)}
          </select>`})}
        ${R({label:"启用思考模式",hint:sp(e),control:se("aiThinking",!!e.aiThinking,"启用思考模式")})}
        ${R({label:"自动匹配歌词时使用 AI 清洗元数据",hint:"自动匹配歌词前先用 AI 从文件名里还原真实的标题 / 歌手。AI 一次调用可能要十几秒，关掉后只做本地整理：匹配更快，但文件名不规范时命中率会低一些",control:se("aiLyricsClean",i.config.aiLyricsClean!==!1,"自动匹配歌词时使用 AI 清洗元数据")})}
        <div class="setting__hint">
          ${n?"已配置：自动匹配封面时，会先把文件名与现有元数据交给 AI 清洗，再去匹配。":"尚未配置：填入 Base URL 与 API Key 后自动启用。"}
        </div>
      </div>
    </section>`}aboutCard(){const e=i.appVersion||Fu,n=i.lastScan,s=i.songs.reduce((r,o)=>r+o.duration,0),a=i.songs.reduce((r,o)=>r+o.size,0);return p` <section class="card" id="sec-about" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("info")}</div>
        <div class="card__titles">
          <div class="card__title">关于 ${Vi}</div>
          <div class="card__desc">${Bu}</div>
        </div>
      </div>
      <div class="card__body">
        <div class="about-hero">
          <div class="about-hero__main">
            <div class="about-hero__title">
              <span class="about-hero__name">${Vi}</span>
              <span class="about-hero__version">v${e}</span>
              <span class="chip chip--ok"><i class="chip__dot"></i>${zu}</span>
            </div>
            <div class="about-hero__meta">${Wu} · ${qu}</div>
          </div>
          <div class="about-hero__links">
            ${Hu.map(r=>p`<button
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
          <div class="kv__v">${Math.floor(s/36e5)} 小时 ${Math.floor(s%36e5/6e4)} 分</div>
          <div class="kv__k">占用空间</div>
          <div class="kv__v">${wo(a)}</div>
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
        ${Uu.map(e=>p` <div class="about-row">
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
    </section>`}libsCard(){const e=Zu(),n=ep(e).map(s=>`${s.license} × ${s.count}`).join(" · ");return p` <section class="card" data-section="about">
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
          ${e.map(s=>p` <div class="libtable__row">
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
        ${Gu.map(s=>p` <div class="about-note">
            <div class="about-note__title">
              <span>${Ju(s)}</span><span class="tagchip tagchip--warn">${s.license}</span>
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
    </section>`}licenseCard(){return p` <section class="card" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("scale")}</div>
        <div class="card__titles">
          <div class="card__title">开源协议</div>
          <div class="card__desc">你可以对这份代码做什么</div>
        </div>
      </div>
      <div class="card__body">
        ${Ku.map(e=>p` <div class="about-note">
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
        ${Yu.map(e=>p` <div class="about-row">
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
        ${Xu.map(e=>p` <div class="about-note">
            <div class="about-note__title"><span>${e.title}</span></div>
            <div class="about-note__body">${e.body}</div>
          </div>`)}
      </div>
      <div class="card__foot card__foot--stack">
        ${Qu.map(e=>p`<span>· ${e}</span>`)}
      </div>
    </section>`}async onClick(e){if(e.target.closest("[data-settings-close]")||e.target===this.panelEl){Xn();return}const n=e.target.closest("[data-goto]")?.dataset.goto;if(n){this.scrollToSection(n);return}const s=e.target.closest("[data-toggle],[data-segment] .segmented__btn");if(s){Wd(s,{commit:x})&&Qt(),this.requestUpdate();return}const a=e.target.closest("[data-act]");a&&(await cs(a,{commit:x,render:()=>{i.settingsRev=(i.settingsRev||0)+1,x()},rescan:()=>pn({manual:!0})}),Qt())}async onChange(e){if(e.target.dataset.act)try{await cs(e.target,{commit:x,render:()=>{i.settingsRev=(i.settingsRev||0)+1,x()},rescan:()=>pn({manual:!0})}),Qt(),this.requestUpdate()}catch(s){console.error("[settings] 处理下拉框失败",s),u(`设置未生效：${s?.message??s}`,{tone:"error",duration:5e3})}}onInput(e){if(e.target.dataset.act!=="rule-value")return;const n=i.filterRules.find(s=>s.id===e.target.dataset.id);n&&(n.value=e.target.value,x(),this.requestUpdate())}onScroll(e){const n=e.target;if(!n.classList?.contains("settings-layer__body"))return;if(this._navPausedUntil){this.deferNavResume();return}const s=n.getBoundingClientRect().top+80;let a=ht[0].id;for(const r of ht){const o=this.querySelector(`[data-section="${r.id}"]`);o&&o.getBoundingClientRect().top<=s&&(a=r.id)}n.scrollHeight>n.clientHeight+2&&n.scrollTop+n.clientHeight>=n.scrollHeight-2&&(a=ht[ht.length-1].id),a!==this._activeSection&&(this._activeSection=a,this.paintNav())}paintNav(){for(const e of this.querySelectorAll(".settings__nav-item"))e.setAttribute("aria-selected",String(e.dataset.goto===this._activeSection))}deferNavResume(){clearTimeout(this._navResumeTimer),this._navResumeTimer=setTimeout(()=>{this._navResumeTimer=null,this._navPausedUntil=0},140)}scrollToSection(e){const n=this.querySelector(`[data-section="${e}"]`),s=this.querySelector(".settings-layer__body");if(!n||!s)return;this._activeSection=e,this.paintNav(),this._navPausedUntil=1,this.deferNavResume();const a=this.querySelector(".settings__nav"),r=a?a.offsetHeight:0,o=n.getBoundingClientRect().top-s.getBoundingClientRect().top,l=Math.max(0,s.scrollTop+o-r-8);s.scrollTo({top:l,behavior:"smooth"})}bindSliders(){for(const e of this.querySelectorAll("[data-slider]")){const n=e.dataset.slider;if(!n)continue;let s=this._sliders.get(e);if(!s){s=ot(e,this.sliderOptions(e,n)),this._sliders.set(e,s);const a=e.parentElement.querySelector(".rangeslider__value");a&&(a.textContent=s.text(this.sliderValue(n)))}s.set(this.sliderValue(n),{silent:!0})}}sliderOptions(e,n){const s=n==="glassBlur",a=n==="glassAlpha",r=n==="coverCarouselInterval",o=r?2:n==="lyricsFontSize"?12:s?0:a?20:0,l=r?60:n==="lyricsFontSize"?26:s?48:a?95:100,c=r?" 秒":s?"px":a?"%":"px";return{min:o,max:l,step:1,value:this.sliderValue(n),format:d=>`${Math.round(d)}${c}`,onChange:d=>{i.config[n]=d;const m=e.parentElement.querySelector(".rangeslider__value");m&&(m.textContent=`${Math.round(d)}${c}`),s&&(i.config.glassBlurCustom=!0,it("--glass-blur",`${d}px`)),a&&(i.config.glassAlphaCustom=!0,Ra(d)),n==="lyricsFontSize"&&it("--lyric-size",`${d}px`)},onCommit:()=>x()}}sliderValue(e){return e==="glassBlur"?i.config.glassBlurCustom?i.config.glassBlur:da():e==="glassAlpha"?i.config.glassAlphaCustom?i.config.glassAlpha:ca():i.config[e]??0}}te("mp-settings-layer",ap);class ip extends me{static deps=e=>[e.floatingLyrics?.show,e.floatingLyrics?.text];render(){const e=i.floatingLyrics||{show:!1,text:""};return p`
      <div class="desktop-lyrics" id="desktop-lyrics" ?hidden=${!e.show} aria-hidden="true">
        <div class="desktop-lyrics__line" id="desktop-lyrics-line">${e.text}</div>
      </div>
    `}}te("mp-floating-lyrics",ip);class rp extends me{static deps=e=>[e.playerOpen,e.scanning,e.scanText,e.config.listDensity];updated(){const e=document.documentElement,n=i.config.listDensity||"cozy";e.dataset.density!==n&&(e.dataset.density=n)}render(){return p`
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
    `}}te("mp-app",rp);let rn="";const ta=new Map,Rn=new Map;function op(){const t=new Image;return t.decoding="async",t.alt="",t}function lp(t){return!i.config.accentFromCover||!un(t)?!1:t!==rn}function ho(t){if(!un(t))return Promise.resolve("");if(ta.has(t))return Promise.resolve(ta.get(t));if(Rn.has(t))return Rn.get(t);const e=new Promise(n=>{const s=o=>{ta.set(t,o),Rn.delete(t),n(o)},a=document.getElementById("bar-cover-img");if(a&&a.getAttribute("src")===t&&a.complete&&a.naturalWidth>0){s(Dt(di(a)));return}const r=op();r.addEventListener("load",()=>s(un(t)?Dt(di(r)):"")),r.addEventListener("error",()=>s("")),r.src=t});return Rn.set(t,e),e}async function mo(t){t&&bl(t,t)&&(await Qt(),await De(i.config))}async function cp(){if(!i.config.accentFromCover||Dt(i.config.coverSeed))return;const t=i.currentId?Ge(i.currentId):null,e=t?dt(t):"";e&&(rn=e,await mo(await ho(e)))}function dp(t){if(!i.config.accentFromCover){rn="";return}if(t){if(!un(t)){rn=t;return}lp(t)&&(rn=t,ho(t).then(mo))}}function up(t){vl(un(t)?t:"")}let Gi="";function pp(t){return[i.currentId??"",i.playing?1:0,Math.round((i.position||0)/250),i.duration||0,i.volume,i.muted?1:0,i.config.loudnessMode||"off",wn()?1:0,$n()?1:0,Math.round(Number(i.config.lyricsFontSize)||16),t].join("|")}function Ki(){const t=i.currentId?Ge(i.currentId):null,e=t?dt(t):"",n=pp(e);n!==Gi&&(Gi=n,Tc(),fn(),wn()&&(i.playing&&rs(),Mc({text:i.playing?qc():"",playing:!!i.playing,fontSize:Math.round((Number(i.config.lyricsFontSize)||16)*1.5)})),$n()&&(i.playing&&rs(),Ca()),dp(e),up(e))}function fp(){Wo(Ki),Ki()}const on=document.getElementById("boot-splash"),Nn=document.getElementById("boot-splash__frame");function Yi(){on&&(on.dataset.hasframe="1")}Nn&&(Nn.complete?Nn.naturalWidth>0&&Yi():Nn.addEventListener("load",Yi,{once:!0}));let Xi=!1;function hp(){Xi||(Xi=!0,fetch("/boot/reveal",{cache:"no-store",keepalive:!0}).catch(()=>{}),b.windowReady().catch(()=>{}))}let Qi=!1;function go(){Qi||!on||(Qi=!0,on.dataset.hide="1",setTimeout(()=>on.remove(),400))}hp();setTimeout(go,12e3);const et=new Map;async function mp(){await fs(),await cp(),await De(i.config),window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",async()=>{i.config.themeMode==="system"&&(await De(i.config),x())})}async function gp(){if(k())try{const t=await b.coverCachedSets();if(!t||typeof t!="object")return;ir(t);const e=Object.keys(t).length;e&&console.info(`[cover] 已从缓存回填 ${e} 首歌的封面（含多封面）`)}catch(t){console.info("[cover] 封面缓存回填跳过",t?.message??t)}}function vp(){document.addEventListener("keydown",t=>{const e=t.target.tagName,n=e==="INPUT"||e==="TEXTAREA"||e==="SELECT"||t.target.isContentEditable;if(t.key==="Escape"){if(document.getElementById("modal-backdrop")?.hidden===!1)return;Go(),i.playerOpen&&ys();return}if(!n)switch(t.key){case" ":t.preventDefault(),gn();break;case"ArrowRight":t.ctrlKey||t.metaKey?cn(!1):is(i.position+5e3);break;case"ArrowLeft":t.ctrlKey||t.metaKey?Ma():is(i.position-5e3);break;case"ArrowUp":t.preventDefault(),ia(i.volume+.05);break;case"ArrowDown":t.preventDefault(),ia(i.volume-.05);break;case"l":case"L":i.currentId&&us(i.currentId);break;case"p":case"P":xa();break;case"f":case"F":bp();break}})}async function bp(){if(k()){const t=!document.fullscreenElement;await b.windowSetFullscreen(t);return}document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen().catch(()=>{})}function yp(){ae("scan:start",()=>{i.scanning=!0,i.scanText="正在扫描音乐文件夹…",x()}),ae("scan:progress",t=>{t&&(t.phase==="walk"?i.scanText="正在遍历音乐文件夹…":t.total&&(i.scanText=`正在读取元数据 ${t.current} / ${t.total}`),x())}),ae("scan:done",async t=>{i.scanning=!1;const e=await b.songs();if(Array.isArray(e)){const s=new Set(i.songs.map(l=>l.id));i.allSongsRaw=e;const{kept:a,excluded:r}=ar(e,i.filterRules);i.songs=a;const o=new Set(a.map(l=>l.id));i.lastScan={at:Date.now(),found:e.length,kept:a.length,excluded:r,added:a.filter(l=>!s.has(l.id)).length,removed:[...s].filter(l=>!o.has(l)).length}}const n=await b.folders();Array.isArray(n)&&(i.folders=n),x(),t?.added&&!t?.firstRun&&u(`文件夹变化：新增 ${t.added} 首`,{tone:"success"})}),ae("scan:failed",t=>{i.scanning=!1,x(),u(`扫描失败：${t?.message??"未知错误"}`,{tone:"error",duration:5e3})}),ae("theme:changed",t=>{i.config.theme=t,De(i.config),x()}),ae("player:state",t=>{t&&(typeof t.position=="number"&&(i.position=t.position),typeof t.duration=="number"&&(i.duration=t.duration),typeof t.playing=="boolean"&&(i.playing=t.playing))}),ae("cover:changed",async t=>{const e=String(t?.id||"");try{if(!e){const s=await b.coverCachedSets();s&&typeof s=="object"&&ir(s);return}const n=await b.coverList(e);n&&Array.isArray(n.items)&&ra(e,n)}catch(n){console.info("[cover] 同步封面失败",n?.message??n)}}),ae("loudness:progress",t=>{t&&(i.loudnessState={...i.loudnessState||{},...t,running:!0},x())}),ae("loudness:done",async t=>{i.loudnessState={...i.loudnessState||{},running:!1},x();const e=t?.failed??0;u(e?`响度测量完成：成功 ${t?.done-e} 首，失败 ${e} 首`:`响度测量完成：共 ${t?.done??0} 首`,{tone:e?"warning":"success",duration:4e3}),await an(),await ms()}),ae("loudness:failed",t=>{i.loudnessState={...i.loudnessState||{},running:!1},x(),u(`响度测量失败：${t?.message??"未知错误"}`,{tone:"error",duration:6e3})}),ae("ffmpeg:ready",t=>{t&&(i.ffmpegState=t,x(),console.info(`[ffmpeg] ${t.available?t.describe:"不可用"}`))}),ae("download:progress",t=>{if(!t?.bvid)return;const e=t.title||t.bvid,n=Number(t.total)||0,s=Number(t.done)||0,a=n>0?Math.round(s/n*100):0,r=n>0?`下载中 ${a}% · ${e}`:`下载中 ${e}`;et.has(t.bvid)?et.get(t.bvid).update(r):et.set(t.bvid,u(r,{duration:0}))}),ae("download:done",t=>{const e=et.get(t?.bvid);et.delete(t?.bvid);const n=`已下载：${t?.title||t?.bvid} → ${t?.path||t?.dir||""}`;e?e.update(n,"success"):u(n,{tone:"success",duration:5e3}),setTimeout(()=>e?.close(),4e3)}),ae("download:failed",t=>{const e=et.get(t?.bvid);et.delete(t?.bvid);const n=`下载失败：${t?.message??"未知错误"}`;e?e.update(n,"error"):u(n,{tone:"error",duration:6e3}),setTimeout(()=>e?.close(),6e3)})}function Ji(){const t=new URLSearchParams(location.search);if(!t.toString())return;const e=t.get("theme");if(e){i.config.theme=e;const o=Yn(e);o?.mode&&(i.config.themeMode=o.mode)}const n=t.get("tab");n==="settings"?i.settingsOpen=!0:n==="queue"?i.view="queue":n==="playlist"&&(i.view="playlist",i.playlistId=t.get("pl")||i.playlists[1]?.id||null);const s=t.get("pv");s&&(i.pvMode=s,i.config.playerViewMode=s),t.get("view")==="player"&&(i.playerOpen=!0),t.get("playing")==="1"&&(i.playing=!0,i.position=Number(t.get("pos")||62e3)),t.get("scan")==="1"&&(i.scanning=!0,setTimeout(()=>{i.scanning=!1,x()},8e3)),t.get("query")&&(i.query=t.get("query"));const a=Number(t.get("songs"));if(!k()&&Number.isFinite(a)&&a>i.songs.length){const o=i.songs.slice(),l=o.slice();for(;l.length<a;){const c=l.length,d=o[c%o.length];l.push({...d,id:`bench_${c}`,path:`C:/bench/${c}.${d.ext||"mp3"}`})}i.songs=l,i.allSongsRaw=l.slice(),x()}const r=t.get("density");r&&["compact","cozy","roomy"].includes(r)&&(i.config.listDensity=r),t.get("album")==="off"&&(i.config.showAlbumColumn=!1)}async function _p(){await Uo(),Ji();const t=gp();if(await mp(),Fc().then(()=>{cr()&&$l()}),await vc(),jo(),Cl(),await Ml(),id(),vp(),yp(),Ji(),fp(),await t,await De(i.config),Pt(),requestAnimationFrame(()=>requestAnimationFrame(go)),await an(),await ms(),Vo(),$o(),window.addEventListener("beforeunload",()=>{Qt()}),document.body.dataset.ready="true",new URLSearchParams(location.search).get("probe")==="1"){const{runProbe:e}=await ct(async()=>{const{runProbe:n}=await import("./probe-BTvxc-Wt.js");return{runProbe:n}},[]);setTimeout(()=>{const n=e();window.__probeReport=n,console.info("[probe]",n)},600)}k()||console.info(`%c浏览器预览模式%c
当前使用假数据渲染界面。接入 Go + Wails3 后端后，同名前端的 store/bridge 会自动改走后端方法。`,"background:#fff;color:#000;padding:2px 6px;border-radius:4px;font-weight:700","color:#888")}_p().catch(t=>{console.error("[app] 启动失败",t),u(`启动失败：${t.message}`,{tone:"error",duration:6e3})});window.addEventListener("unhandledrejection",t=>{const e=t.reason,n=e?.message||String(e||"未知错误");/no backend|preview:/i.test(n)||(console.error("[app] 未处理的异步错误",e),u(n.length>120?`${n.slice(0,120)}…`:n,{tone:"error",duration:6e3}))});window.addEventListener("error",t=>{t.message&&console.error("[app] 运行时错误",t.error||t.message)});window.__app={state:i,commit:x,navigate:wt,openPlayer:Hr,closePlayer:ys,rescan:Zi,doRescan:pn,currentSong:Tt,isLiked:Et,nextIndex:Ho,setPlayerViewMode:hn,applyGainForSong:fn};const Qa=Object.freeze(Object.defineProperty({__proto__:null,closeCoverPanel:Xt,openCoverPanel:Ru},Symbol.toStringTag,{value:"Module"}));
