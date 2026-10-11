const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/base-CoiS-1tI.js","assets/bridge-D1JdJUg2.js"])))=>i.map(i=>d[i]);
import{i as k,b as v,d as Zo,f as E,g as At,o as U,h as wt,D as ba,j as dt,u as On,k as Ma,l as el,r as tl,n as Zt,p as nl}from"./bridge-D1JdJUg2.js";import{j as al,E as Ct,s as i,c as $,t as u,a as Cn,e as vs,r as Gs,f as Er,g as ve,d as ie,M as ge,A,h as f,b as d,k as sl,p as gt,l as He,o as Bt,m as W,n as il,q as rl,u as ol,v as ll,w as cl,L as Vn,x as dl,y as Be,z as We,B as ze,C as Ft,D as Ir,F as Ar,G as ul,H as pl,I as fl,J as ga,K as Gt,$ as wi,N as Ks,O as hl,P as ml,Q as tt,R as mt,S as Ys,T as vl,U as bl,V as gl,W as Dr,X as yl,Y as bs,Z as _l,_ as wl,a0 as $l,a1 as Dt,a2 as kl,a3 as Sl,a4 as xl,a5 as $n,a6 as gs,a7 as Mr,a8 as ys,a9 as Pr,aa as Cl,ab as $i,ac as Tl,ad as El,ae as Il,af as Al,ag as ki,ah as Dl,ai as Or,aj as Tn,ak as Lr,al as Ml,am as Pl,an as Ol,ao as Ll,ap as Rl,aq as _s,ar as Nl,as as ws,at as Rr,au as ql,av as Si,aw as xi,ax as Bl,ay as Fl,az as Ul,aA as Hl,aB as zl,aC as jl,aD as Vl,aE as Pa,aF as Wl,aG as Gl,aH as Kl,aI as Yl,aJ as Xl,aK as Ql,aL as Jl,aM as Zl,aN as ec,aO as tc,aP as dn,aQ as nc,aR as ac,aS as sc,aT as ic,aU as rc,aV as Nr,aW as oc,aX as lc}from"./base-CoiS-1tI.js";import{s as cc,S as dc,f as Wn,a as un,b as uc,p as Ci,m as pc,d as Ti,e as $s,r as ya,g as kn,h as fc,l as hc,n as mc,i as vc,u as bc,c as gc,j as _a,k as yc}from"./skinhost-DQk_e0Y_.js";const _c="modulepreload",wc=function(t){return"/"+t},Ei={},yt=function(e,n,a){let s=Promise.resolve();if(n&&n.length>0){let c=function(p){return Promise.all(p.map(m=>Promise.resolve(m).then(h=>({status:"fulfilled",value:h}),h=>({status:"rejected",reason:h}))))};document.getElementsByTagName("link");const o=document.querySelector("meta[property=csp-nonce]"),l=o?.nonce||o?.getAttribute("nonce");s=c(n.map(p=>{if(p=wc(p),p in Ei)return;Ei[p]=!0;const m=p.endsWith(".css"),h=m?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${p}"]${h}`))return;const _=document.createElement("link");if(_.rel=m?"stylesheet":_c,m||(_.as="script"),_.crossOrigin="",_.href=p,l&&_.setAttribute("nonce",l),document.head.appendChild(_),m)return new Promise((S,b)=>{_.addEventListener("load",S),_.addEventListener("error",()=>b(new Error(`Unable to preload CSS for ${p}`)))})}))}function r(o){const l=new Event("vite:preloadError",{cancelable:!0});if(l.payload=o,window.dispatchEvent(l),!l.defaultPrevented)throw o}return s.then(o=>{for(const l of o||[])l.status==="rejected"&&r(l.reason);return e().catch(r)})};const $c={CHILD:2},Xs=t=>(...e)=>({_$litDirective$:t,values:e});let Qs=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,n,a){this._$Ct=e,this._$AM=n,this._$Ci=a}_$AS(e,n){return this.update(e,n)}update(e,n){return this.render(...n)}};const{I:kc}=al,Ii=t=>t,Ai=()=>document.createComment(""),en=(t,e,n)=>{const a=t._$AA.parentNode,s=e===void 0?t._$AB:e._$AA;if(n===void 0){const r=a.insertBefore(Ai(),s),o=a.insertBefore(Ai(),s);n=new kc(r,o,t,t.options)}else{const r=n._$AB.nextSibling,o=n._$AM,l=o!==t;if(l){let c;n._$AQ?.(t),n._$AM=t,n._$AP!==void 0&&(c=t._$AU)!==o._$AU&&n._$AP(c)}if(r!==s||l){let c=n._$AA;for(;c!==r;){const p=Ii(c).nextSibling;Ii(a).insertBefore(c,s),c=p}}}return n},rt=(t,e,n=t)=>(t._$AI(e,n),t),Sc={},qr=(t,e=Sc)=>t._$AH=e,xc=t=>t._$AH,Oa=t=>{t._$AR(),t._$AA.remove()};const Di=(t,e,n)=>{const a=new Map;for(let s=e;s<=n;s++)a.set(t[s],s);return a},Te=Xs(class extends Qs{constructor(t){if(super(t),t.type!==$c.CHILD)throw Error("repeat() can only be used in text expressions")}dt(t,e,n){let a;n===void 0?n=e:e!==void 0&&(a=e);const s=[],r=[];let o=0;for(const l of t)s[o]=a?a(l,o):o,r[o]=n(l,o),o++;return{values:r,keys:s}}render(t,e,n){return this.dt(t,e,n).values}update(t,[e,n,a]){const s=xc(t),{values:r,keys:o}=this.dt(e,n,a);if(!Array.isArray(s))return this.ut=o,r;const l=this.ut??=[],c=[];let p,m,h=0,_=s.length-1,S=0,b=r.length-1;for(;h<=_&&S<=b;)if(s[h]===null)h++;else if(s[_]===null)_--;else if(l[h]===o[S])c[S]=rt(s[h],r[S]),h++,S++;else if(l[_]===o[b])c[b]=rt(s[_],r[b]),_--,b--;else if(l[h]===o[b])c[b]=rt(s[h],r[b]),en(t,c[b+1],s[h]),h++,b--;else if(l[_]===o[S])c[S]=rt(s[_],r[S]),en(t,s[h],s[_]),_--,S++;else if(p===void 0&&(p=Di(o,S,b),m=Di(l,h,_)),p.has(l[h]))if(p.has(l[_])){const x=m.get(o[S]),N=x!==void 0?s[x]:null;if(N===null){const F=en(t,s[h]);rt(F,r[S]),c[S]=F}else c[S]=rt(N,r[S]),en(t,s[h],N),s[x]=null;S++}else Oa(s[_]),_--;else Oa(s[h]),h++;for(;S<=b;){const x=en(t,c[b+1]);rt(x,r[S]),c[S++]=x}for(;h<=_;){const x=s[h++];x!==null&&Oa(x)}return this.ut=o,qr(t,c),Ct}}),Cc=[{id:"flat-dark",name:"简约深色",mode:"dark",builtin:!0,swatch:["#101113","#1b1d21","#3b4048","#e6e8eb","#8b9bb4"]},{id:"flat-light",name:"简约浅色",mode:"light",builtin:!0,swatch:["#f5f6f7","#ffffff","#d7dae0","#1a1c20","#43536b"]},{id:"cover-dark",name:"封面取色 · 深色",mode:"dark",builtin:!0,swatch:["#0b0b12","#2a2a31","#6b6b76","#f7f7fa","#ff4d6d"]}],ae=Cc.slice();let Br=0;function Tc(){return Br}function wa(){return ae}function sa(t){return ae.find(e=>e.id===t)||ae[0]}async function $a(){if(!k())return ae;try{const t=await v.listThemes();if(!Array.isArray(t)||!t.length)return ae;for(const e of t){if(!e?.id)continue;const n=await v.loadTheme(e.id);typeof n=="string"&&n.trim()&&Ac(e.id,n)}Ec(t)}catch(t){console.warn("[theme] 主题目录扫描失败",t)}return ae}function Ec(t){const e=[],n=new Set;for(const a of t){if(!a?.id||n.has(a.id))continue;n.add(a.id);const s={id:a.id,name:a.name||a.id,mode:a.mode||"dark",swatch:Array.isArray(a.swatch)?a.swatch:[],builtin:!!a.builtin},r=ae.find(o=>o.id===a.id);r?(Object.assign(r,s),e.push(r)):e.push(s)}for(const a of ae)e.includes(a)||Gs(`theme-file-${a.id}`,"");return ae.length=0,ae.push(...e),Br+=1,ae}async function Ic(t){return await v.deleteTheme(t),await $a(),{removed:!ae.some(n=>n.id===t),themeIds:ae.map(n=>n.id)}}function Ac(t,e){Gs(`theme-file-${t}`,e)}const Dc=["--seed","--seed-2","--bg-app","--bg-window"],Mc=["--seed","--seed-2"];function Pc(t){return document.documentElement.style.getPropertyValue(t).trim()?String(document.documentElement.style.getPropertyValue(t)):null}function Oc(){const t=document.documentElement,e={};for(const n of Mc){const a=Pc(n);a&&(e[n]=a)}for(const n of Dc)t.style.removeProperty(n);return e}const Gn="cover-dark";function Sn(t){return!!t&&!Zo(t)}let Mi=null,La=null,Ra=null;async function Oe(t){const e=document.documentElement,n=window.matchMedia("(prefers-color-scheme: dark)").matches,a=Oc();a["--seed"]&&(La=a["--seed"]),a["--seed-2"]&&(Ra=a["--seed-2"]);let s=t.theme||"flat-dark";if(t.themeMode==="system"){const h=n?"dark":"light",_=ae.find(S=>S.mode===h&&S.id!=="cover-dark");_&&(s=_.id)}else if(ae.find(h=>h.id===s)?.mode!==t.themeMode){const h=ae.find(_=>_.mode===t.themeMode&&_.id!=="cover-dark");h&&(s=h.id)}e.dataset.theme=s,e.dataset.mode=ae.find(h=>h.id===s)?.mode||t.themeMode||"dark",t.theme=s;const r=Pi(t,s),o=Pi(t,s,!0),l=t.accentFromCover!==!1;(t.accentFromCover===!1||Mi!==null&&s!==Gn)&&(La=null,Ra=null);const p=r??(l?La:null),m=o??Ra??p;return Cn({"--glass-blur":t.glassBlurCustom?`${t.glassBlur}px`:null,"--dur":vs(t),"--seed":p,"--seed-2":m}),Mi=p&&s===Gn?Gn:null,qc(),Rc(),t.glassAlphaCustom&&Js(t.glassAlpha),s}function Pi(t,e,n=!1){return!t||t.accentFromCover!==!0||e!=="cover-dark"?null:Ut(n?t.coverSeed2:t.coverSeed)||null}async function Lc(){const e=sa(i.config.theme)?.mode==="light"?"dark":"light";i.config.themeMode=e,await Oe(i.config),$(),u(e==="dark"?"已切换到深色主题":"已切换到浅色主题",{duration:1500})}let $t=null;function Kn(t){return $t||($t=document.createElement("div"),$t.style.cssText="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;",document.body.appendChild($t)),$t.style.backgroundColor=t,getComputedStyle($t).backgroundColor}function Na(t,e){const n=Math.max(0,Math.min(1,e)),a=String(t),s=a.match(/rgba?\(([^)]+)\)/);if(s){const o=s[1].split(/[,/]/).map(m=>parseFloat(m.trim())),[l,c,p]=o;if([l,c,p].every(m=>Number.isFinite(m)))return`rgba(${Math.round(l)}, ${Math.round(c)}, ${Math.round(p)}, ${n})`}const r=a.match(/color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);if(r){const[o,l,c]=r.slice(1,4).map(p=>Math.round(parseFloat(p)*255));if([o,l,c].every(p=>Number.isFinite(p)))return`rgba(${o}, ${l}, ${c}, ${n})`}return null}function ks(){const t=String(Kn("var(--glass-bg)")),e=t.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/),n=t.match(/\/\s*([\d.]+)\s*\)/),a=parseFloat(e&&e[1]||n&&n[1]||"");return Number.isFinite(a)?Math.round(a*100):62}let sn=null;function Rc(){sn=null}function Nc(){return sn||(Cn({"--glass-bg":null,"--glass-bg-strong":null,"--glass-bg-weak":null}),sn={bg:Kn("var(--glass-bg)"),strong:Kn("var(--glass-bg-strong)"),weak:Kn("var(--glass-bg-weak)")},sn)}function Js(t){const e=Math.max(0,Math.min(1,(Number(t)||0)/100)),n=Nc();Cn({"--glass-bg":Na(n.bg,e),"--glass-bg-strong":Na(n.strong,Math.min(1,e+.18)),"--glass-bg-weak":Na(n.weak,Math.max(0,e-.22))})}function qc(){const t=document.body;t&&(t.dataset.styleEpoch=String((Number(t.dataset.styleEpoch)||0)+1))}function Bc(){const t=getComputedStyle(document.documentElement).getPropertyValue("--glass-blur"),e=parseFloat(t);return Number.isFinite(e)?e:22}function Ut(t){const e=String(t??"").trim();if(!e)return"";const n=e.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);if(n){let s=n[1].toLowerCase();return s.length===3&&(s=s[0]+s[0]+s[1]+s[1]+s[2]+s[2]),`#${s}`}const a=e.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);if(a){const s=r=>Math.max(0,Math.min(255,Math.round(Number(r)))).toString(16).padStart(2,"0");return`#${s(a[1])}${s(a[2])}${s(a[3])}`}return""}let Oi="";function Fc(t){const e=document.documentElement.dataset.theme||"",n=typeof t=="string"?t.trim():"",a=e===Gn?n:"";a!==Oi&&(Oi=a,Cn({"--cover-bg":a?`url("${a.replace(/["\\]/g,"\\$&")}")`:null}))}function Uc(t,e){const n=Ut(t),a=Ut(e)||n;return n?(Cn({"--seed":n,"--seed-2":a}),i.config.coverSeed!==n||i.config.coverSeed2!==a?(i.config.coverSeed=n,i.config.coverSeed2=a,zc(),!0):!1):!1}const Hc="music-player.cover-seed.v1";function zc(){try{localStorage.setItem(Hc,JSON.stringify({seed:i.config.coverSeed||"",seed2:i.config.coverSeed2||"",theme:i.config.theme||""}))}catch{}}function Li(t){try{const e=document.createElement("canvas"),n=32;e.width=n,e.height=n;const a=e.getContext("2d",{willReadFrequently:!0});a.drawImage(t,0,0,n,n);const{data:s}=a.getImageData(0,0,n,n);let r=0,o=0,l=0,c=0,p=0,m=0,h=0,_=0;for(let b=0;b<s.length;b+=4){if(s[b+3]<8)continue;const x=s[b],N=s[b+1],F=s[b+2];p+=x,m+=N,h+=F,_+=1;const z=Math.max(x,N,F),ue=Math.min(x,N,F);if(z<26)continue;const Z=z===0?0:(z-ue)/z;if(Z<.12)continue;const ye=Z*Z*(.35+z/255);r+=x*ye,o+=N*ye,l+=F*ye,c+=ye}const S=c>0?[r/c,o/c,l/c]:_>0?[p/_,m/_,h/_]:null;return S?`rgb(${S.map(b=>Math.round(Math.max(0,Math.min(255,b)))).join(", ")})`:null}catch{return null}}function qa(){i.query="",$()}function Mt(t,e=null){if(i.settingsOpen&&ia(),t==="settings"){Fr();return}i.view=t,i.playlistId=t==="playlist"?e:null,i.playerOpen=!1,i.query="",i.playlistSelecting=!1,i.selectedIds=new Set,i.queueOpen=!1,$()}function Fr(t=null){i.settingsOpen=!0,t&&(i.settingsSection=t),$()}function ia(){i.settingsOpen=!1,$()}function jc(t=null){i.settingsOpen?ia():Fr(t)}function Ur(){return i.settingsOpen===!0}function Vc(){i.settingsOpen&&(i.settingsRev=(i.settingsRev||0)+1,$(),ve())}async function xn({manual:t=!1}={}){if(!i.scanning){i.scanText="正在扫描音乐文件夹…",$();try{const e=await Er({silent:!t});e&&u(`扫描完成：保留 ${E(e.kept)} 首${e.excluded?`，过滤 ${E(e.excluded)} 个`:""}${e.added?`，新增 ${E(e.added)}`:""}${e.removed?`，移除 ${E(e.removed)}`:""}`,{tone:"success",duration:3600})}finally{i.scanning=!1,$()}}}const Hr="music-player.search.history.v1",Wc=20;function Ba(){try{const t=localStorage.getItem(Hr),e=t?JSON.parse(t):[];return Array.isArray(e)?e.filter(n=>typeof n=="string"&&n.trim()):[]}catch{return[]}}function Fa(t){try{localStorage.setItem(Hr,JSON.stringify(t.slice(0,Wc)))}catch{}}const R={keyword:"",seq:0,results:[],query:"",loading:!1,message:"",rev:0};function Ae(){R.rev+=1,ve()}class Gc extends ge{static deps=e=>[e.searchOpen,R.rev];get panelEl(){return this.querySelector("#search-overlay")}updated(){const e=this.panelEl;if(e){if(i.searchOpen){this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden&&(e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{i.searchOpen&&(e.dataset.state="opened")}),requestAnimationFrame(()=>{const n=this.querySelector("#search-input");n?.focus(),n?.select()}));return}e.hidden||(e.dataset.state="closed",this._closeTimer||(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!i.searchOpen&&e&&(e.hidden=!0)},260)))}}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),super.disconnectedCallback()}render(){const e=R,n=Ba(),a=!!e.keyword.trim(),s=this.headline();return d`
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
              @click=${()=>Yn()}
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
                @input=${r=>{R.keyword=r.target.value,Ae()}}
                @keydown=${r=>{r.key==="Enter"&&(r.preventDefault(),this.submitSearch()),r.key==="Escape"&&(r.preventDefault(),R.keyword.trim()?this.clearSearch({focus:!0}):Yn())}}
              />
              <button
                class="search-overlay__clear u-hit"
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
          </div>

          <div class="search-overlay__history" id="search-history" ?hidden=${a||!n.length}>
            ${!a&&n.length?d`
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
                      ${n.map(r=>d`
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
                  `:A}
          </div>

          <div class="search-overlay__status" ?hidden=${!s}>
            <span class="search-overlay__headline" id="search-headline">${s}</span>
          </div>
          <div class="search-overlay__body" id="search-body">${this.bodyContent()}</div>
        </div>
      </section>
    `}headline(){const e=R;return e.loading?"搜索中…":e.query?`在线「${e.query}」${E(e.results.length)} 个结果`:""}bodyContent(){const e=R;return e.loading?d`<div class="search-overlay__loading">
        <span class="search-overlay__spinner"></span>正在搜索「${e.keyword.trim()}」…
      </div>`:e.message?this.empty(e.message):e.results.length?Te(e.results,n=>n.id,n=>d`
        <div
          class="search-row"
          data-search-id=${n.id}
          data-search-online="1"
          role="button"
          tabindex="0"
          @click=${()=>Ua(n.id)}
        >
          <span class="search-row__cover">
            ${n.coverUrl?d`<img src=${n.coverUrl} alt="" loading="lazy" />`:d`<span class="search-row__cover-fallback">${f("music")}</span>`}
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
              @click=${a=>{a.stopPropagation(),Ua(n.id)}}
            >
              ${f("play")}<span>试听</span>
            </button>
            <button
              class="btn btn--sm"
              type="button"
              data-search-act="download"
              data-id=${n.id}
              @click=${a=>{a.stopPropagation(),Xc(n)}}
            >
              ${f("file")}<span>下载</span>
            </button>
          </span>
        </div>
      `):this.empty(e.query?"没有搜到在线歌曲，换个关键词试试":"输入关键词后按回车搜索在线歌曲")}empty(e){return d`<div class="search-overlay__empty">${f("search")}<span>${e}</span></div>`}onClick(e){(e.target.closest("[data-search-close]")||e.target===this.panelEl)&&Yn()}onKey(e){if(e.key!=="Enter"&&e.key!==" ")return;const n=e.target.closest?.("[data-search-id]");n&&(e.preventDefault(),Ua(n.dataset.searchId))}addHistory(e){const n=(e||"").trim();if(!n)return;const a=Ba().filter(s=>s!==n);a.unshift(n),Fa(a),Ae()}removeHistory(e){Fa(Ba().filter(n=>n!==e)),Ae()}clearHistory(){Fa([]),Ae()}useHistory(e){R.keyword=e,Ae(),this.submitSearch()}submitSearch(){const e=(R.keyword||"").trim();if(!e){this.clearSearch({focus:!0});return}this.addHistory(e),this.runOnlineSearch(e)}clearSearch({focus:e=!1}={}){R.keyword="",R.results=[],R.query="",R.message="",R.loading=!1,R.seq+=1,Ae(),e&&requestAnimationFrame(()=>this.querySelector("#search-input")?.focus())}async runOnlineSearch(e){R.query="",R.results=[],R.message="",R.loading=!0,Ae();const n=++R.seq;if(!k()){R.loading=!1,R.message="浏览器预览下没有在线搜索后端，请在应用里试",Ae();return}try{const a=await v.onlineSearch(e,1,24);if(n!==R.seq)return;R.results=Array.isArray(a)?a:[],R.query=e,R.loading=!1,Ae()}catch(a){if(n!==R.seq)return;R.results=[],R.query=e,R.loading=!1,R.message=`在线搜索失败：${a?.message??a}`,Ae()}}}ie("mp-search-overlay",Gc);function Kc(t){!i.searchOpen?zr():Yn()}function zr(){i.searchOpen=!0,$()}function Yn(){i.searchOpen=!1,$()}function Yc(){document.addEventListener("keydown",t=>{!(t.ctrlKey||t.metaKey)||t.key.toLowerCase()!=="f"||(t.preventDefault(),zr())})}function Ua(t){const e=R.results.find(r=>r.id===t);if(!e)return;const n=sl({id:e.id,title:e.title||"未命名",artist:e.artist||"未知",album:e.album||"在线",ext:e.ext||"m4a",duration:e.duration||0,size:0,sampleRate:0,bitrate:0,addedAt:Date.now(),playCount:0,path:"",cover:"",coverUrl:e.coverUrl||"",streamUrl:e.streamUrl||"",downloadUrl:e.downloadUrl||"",bvid:e.bvid||"",online:!0}),a=i.queue.includes(n.id)?i.queue.slice():[...i.queue,n.id],s=a.indexOf(n.id);gt(a,s,{type:"online",id:null}),u(`已加入播放列表并开始试听：${n.title}`,{tone:"success",duration:2200})}async function Xc(t){if(!k()){u("浏览器预览无法下载",{tone:"warning"});return}try{const e=await v.downloadStart(t.bvid||String(t.id).replace(/^bili:/,""),t.title||"",t.duration||0);if(!e?.started){u(e?.reason==="already-running"?"这首歌正在下载中":"无法开始下载",{tone:"warning"});return}u(`开始下载到 ${e.dir}`,{duration:2600})}catch(e){u(`下载失败：${e?.message??e}`,{tone:"error",duration:6e3})}}let Fe=[],ra=!1,jr=0,Ha=0;function Pt(){jr+=1,ve()}function pn(){const t=Fe.filter(e=>e?.state==="running").length;return{tasks:Fe,running:t,revision:jr,open:ra,visible:Fe.length>0,badge:t>0?String(t):""}}function Vr(t){ra=typeof t=="boolean"?t:!ra,Pt()}function Qc(){Vr(!1)}async function Jc(){if(!k()){Fe=Fe.filter(t=>t?.state==="running"),Pt();return}try{const t=await v.downloadClearFinished();Ss(t)}catch(t){u(`清除失败：${t?.message??t}`,{tone:"error"})}}function Zc(){const t=Fe.find(e=>e?.dir)?.dir||"";v.downloadOpenDir(t).catch(e=>u(`打开目录失败：${e?.message??e}`,{tone:"error"}))}function ed(t){const e=Fe.find(a=>a.id===t),n=e?.path||e?.dir;n&&v.downloadOpenDir(n).catch(a=>u(`打开失败：${a?.message??a}`,{tone:"error"}))}function Ss(t){!t||!Array.isArray(t.tasks)||(Fe=t.tasks,Pt())}async function td(){if(U("download:tasks",e=>{Ha+=1,Ss(e)}),!k()){if(nd()){Pt(),ra=!0,Pt();return}Pt();return}const t=Ha;try{const e=await v.downloadTasks();Ha===t&&Ss(e)}catch(e){console.info("[downloads] 拉取下载任务失败",e?.message??e)}}function nd(){return k()||new URLSearchParams(location.search).get("downloads")!=="1"?!1:(Fe=[{id:"preview-1",bvid:"BV1xx411c7mD",title:"晴天 - 周杰伦",state:"running",done:231e4,total:47e5,dir:"C:\\Users\\Me\\Music\\downloads"},{id:"preview-2",bvid:"BV1yy411c7mE",title:"孤勇者 - 陈奕迅",state:"done",done:39e5,total:39e5,path:"C:\\Users\\Me\\Music\\downloads\\孤勇者 - 陈奕迅.m4a",dir:"C:\\Users\\Me\\Music\\downloads"},{id:"preview-3",bvid:"BV1zz411c7mF",title:"一首标题很长很长、长到面板里必须被省略号截断的测试歌曲",state:"failed",done:12e4,total:5e6,message:"下载到的内容为空",dir:"C:\\Users\\Me\\Music\\downloads"}],!0)}class ad extends ge{static deps=()=>{const n=sa(i.config.theme)?.mode!=="light",a=pn();return[n,i.config.themeMode,i.searchOpen,a.visible,a.badge]};render(){const n=sa(i.config.theme)?.mode!=="light",a=pn();return d`
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
            @click=${()=>Kc()}
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
            @click=${()=>Vr()}
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
            @click=${()=>Lc()}
          >
            ${f(n?"sun":"moon")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-settings"
            type="button"
            data-tip="设置"
            aria-label="设置"
            @click=${()=>jc()}
          >
            ${f("settings")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-win-min"
            type="button"
            aria-label="最小化"
            @click=${()=>za("min")}
          >
            ${f("minimize")}
          </button>
          <button
            class="titlebar__btn"
            id="btn-win-max"
            type="button"
            aria-label="最大化"
            @click=${()=>za("max")}
          >
            ${f("maximize")}
          </button>
          <button
            class="titlebar__btn titlebar__btn--close"
            id="btn-win-close"
            type="button"
            aria-label="关闭"
            @click=${()=>za("close")}
          >
            ${f("close")}
          </button>
        </div>
      </header>
    `}}function za(t){if(!k()){t==="close"&&window.close();return}t==="min"?v.windowMinimize():t==="max"?v.windowToggleMaximize():v.windowClose()}ie("mp-titlebar",ad);function sd(t,e,n){return(e=ld(e))in t?Object.defineProperty(t,e,{value:n,enumerable:!0,configurable:!0,writable:!0}):t[e]=n,t}function je(){return je=Object.assign?Object.assign.bind():function(t){for(var e=1;e<arguments.length;e++){var n=arguments[e];for(var a in n)({}).hasOwnProperty.call(n,a)&&(t[a]=n[a])}return t},je.apply(null,arguments)}function Ri(t,e){var n=Object.keys(t);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(t);e&&(a=a.filter(function(s){return Object.getOwnPropertyDescriptor(t,s).enumerable})),n.push.apply(n,a)}return n}function Le(t){for(var e=1;e<arguments.length;e++){var n=arguments[e]!=null?arguments[e]:{};e%2?Ri(Object(n),!0).forEach(function(a){sd(t,a,n[a])}):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(n)):Ri(Object(n)).forEach(function(a){Object.defineProperty(t,a,Object.getOwnPropertyDescriptor(n,a))})}return t}function id(t,e){if(t==null)return{};var n,a,s=rd(t,e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(t);for(a=0;a<r.length;a++)n=r[a],e.indexOf(n)===-1&&{}.propertyIsEnumerable.call(t,n)&&(s[n]=t[n])}return s}function rd(t,e){if(t==null)return{};var n={};for(var a in t)if({}.hasOwnProperty.call(t,a)){if(e.indexOf(a)!==-1)continue;n[a]=t[a]}return n}function od(t,e){if(typeof t!="object"||!t)return t;var n=t[Symbol.toPrimitive];if(n!==void 0){var a=n.call(t,e);if(typeof a!="object")return a;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(t)}function ld(t){var e=od(t,"string");return typeof e=="symbol"?e:e+""}function xs(t){"@babel/helpers - typeof";return xs=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(e){return typeof e}:function(e){return e&&typeof Symbol=="function"&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},xs(t)}var cd="1.15.7";function Ue(t){if(typeof window<"u"&&window.navigator)return!!navigator.userAgent.match(t)}var Ge=Ue(/(?:Trident.*rv[ :]?11\.|msie|iemobile|Windows Phone)/i),En=Ue(/Edge/i),Ni=Ue(/firefox/i),fn=Ue(/safari/i)&&!Ue(/chrome/i)&&!Ue(/android/i),Zs=Ue(/iP(ad|od|hone)/i),Wr=Ue(/chrome/i)&&Ue(/android/i),Gr={capture:!1,passive:!1};function O(t,e,n){t.addEventListener(e,n,!Ge&&Gr)}function P(t,e,n){t.removeEventListener(e,n,!Ge&&Gr)}function oa(t,e){if(e){if(e[0]===">"&&(e=e.substring(1)),t)try{if(t.matches)return t.matches(e);if(t.msMatchesSelector)return t.msMatchesSelector(e);if(t.webkitMatchesSelector)return t.webkitMatchesSelector(e)}catch{return!1}return!1}}function Kr(t){return t.host&&t!==document&&t.host.nodeType&&t.host!==t?t.host:t.parentNode}function xe(t,e,n,a){if(t){n=n||document;do{if(e!=null&&(e[0]===">"?t.parentNode===n&&oa(t,e):oa(t,e))||a&&t===n)return t;if(t===n)break}while(t=Kr(t))}return null}var qi=/\s+/g;function fe(t,e,n){if(t&&e)if(t.classList)t.classList[n?"add":"remove"](e);else{var a=(" "+t.className+" ").replace(qi," ").replace(" "+e+" "," ");t.className=(a+(n?" "+e:"")).replace(qi," ")}}function T(t,e,n){var a=t&&t.style;if(a){if(n===void 0)return document.defaultView&&document.defaultView.getComputedStyle?n=document.defaultView.getComputedStyle(t,""):t.currentStyle&&(n=t.currentStyle),e===void 0?n:n[e];!(e in a)&&e.indexOf("webkit")===-1&&(e="-webkit-"+e),a[e]=n+(typeof n=="string"?"":"px")}}function Ot(t,e){var n="";if(typeof t=="string")n=t;else do{var a=T(t,"transform");a&&a!=="none"&&(n=a+" "+n)}while(!e&&(t=t.parentNode));var s=window.DOMMatrix||window.WebKitCSSMatrix||window.CSSMatrix||window.MSCSSMatrix;return s&&new s(n)}function Yr(t,e,n){if(t){var a=t.getElementsByTagName(e),s=0,r=a.length;if(n)for(;s<r;s++)n(a[s],s);return a}return[]}function Pe(){var t=document.scrollingElement;return t||document.documentElement}function Y(t,e,n,a,s){if(!(!t.getBoundingClientRect&&t!==window)){var r,o,l,c,p,m,h;if(t!==window&&t.parentNode&&t!==Pe()?(r=t.getBoundingClientRect(),o=r.top,l=r.left,c=r.bottom,p=r.right,m=r.height,h=r.width):(o=0,l=0,c=window.innerHeight,p=window.innerWidth,m=window.innerHeight,h=window.innerWidth),(e||n)&&t!==window&&(s=s||t.parentNode,!Ge))do if(s&&s.getBoundingClientRect&&(T(s,"transform")!=="none"||n&&T(s,"position")!=="static")){var _=s.getBoundingClientRect();o-=_.top+parseInt(T(s,"border-top-width")),l-=_.left+parseInt(T(s,"border-left-width")),c=o+r.height,p=l+r.width;break}while(s=s.parentNode);if(a&&t!==window){var S=Ot(s||t),b=S&&S.a,x=S&&S.d;S&&(o/=x,l/=b,h/=b,m/=x,c=o+m,p=l+h)}return{top:o,left:l,bottom:c,right:p,width:h,height:m}}}function Bi(t,e,n){for(var a=Ze(t,!0),s=Y(t)[e];a;){var r=Y(a)[n],o=void 0;if(o=s>=r,!o)return a;if(a===Pe())break;a=Ze(a,!1)}return!1}function Ht(t,e,n,a){for(var s=0,r=0,o=t.children;r<o.length;){if(o[r].style.display!=="none"&&o[r]!==C.ghost&&(a||o[r]!==C.dragged)&&xe(o[r],n.draggable,t,!1)){if(s===e)return o[r];s++}r++}return null}function ei(t,e){for(var n=t.lastElementChild;n&&(n===C.ghost||T(n,"display")==="none"||e&&!oa(n,e));)n=n.previousElementSibling;return n||null}function _e(t,e){var n=0;if(!t||!t.parentNode)return-1;for(;t=t.previousElementSibling;)t.nodeName.toUpperCase()!=="TEMPLATE"&&t!==C.clone&&(!e||oa(t,e))&&n++;return n}function Fi(t){var e=0,n=0,a=Pe();if(t)do{var s=Ot(t),r=s.a,o=s.d;e+=t.scrollLeft*r,n+=t.scrollTop*o}while(t!==a&&(t=t.parentNode));return[e,n]}function dd(t,e){for(var n in t)if(t.hasOwnProperty(n)){for(var a in e)if(e.hasOwnProperty(a)&&e[a]===t[n][a])return Number(n)}return-1}function Ze(t,e){if(!t||!t.getBoundingClientRect)return Pe();var n=t,a=!1;do if(n.clientWidth<n.scrollWidth||n.clientHeight<n.scrollHeight){var s=T(n);if(n.clientWidth<n.scrollWidth&&(s.overflowX=="auto"||s.overflowX=="scroll")||n.clientHeight<n.scrollHeight&&(s.overflowY=="auto"||s.overflowY=="scroll")){if(!n.getBoundingClientRect||n===document.body)return Pe();if(a||e)return n;a=!0}}while(n=n.parentNode);return Pe()}function ud(t,e){if(t&&e)for(var n in e)e.hasOwnProperty(n)&&(t[n]=e[n]);return t}function ja(t,e){return Math.round(t.top)===Math.round(e.top)&&Math.round(t.left)===Math.round(e.left)&&Math.round(t.height)===Math.round(e.height)&&Math.round(t.width)===Math.round(e.width)}var hn;function Xr(t,e){return function(){if(!hn){var n=arguments,a=this;n.length===1?t.call(a,n[0]):t.apply(a,n),hn=setTimeout(function(){hn=void 0},e)}}}function pd(){clearTimeout(hn),hn=void 0}function Qr(t,e,n){t.scrollLeft+=e,t.scrollTop+=n}function Jr(t){var e=window.Polymer,n=window.jQuery||window.Zepto;return e&&e.dom?e.dom(t).cloneNode(!0):n?n(t).clone(!0)[0]:t.cloneNode(!0)}function Zr(t,e,n){var a={};return Array.from(t.children).forEach(function(s){var r,o,l,c;if(!(!xe(s,e.draggable,t,!1)||s.animated||s===n)){var p=Y(s);a.left=Math.min((r=a.left)!==null&&r!==void 0?r:1/0,p.left),a.top=Math.min((o=a.top)!==null&&o!==void 0?o:1/0,p.top),a.right=Math.max((l=a.right)!==null&&l!==void 0?l:-1/0,p.right),a.bottom=Math.max((c=a.bottom)!==null&&c!==void 0?c:-1/0,p.bottom)}}),a.width=a.right-a.left,a.height=a.bottom-a.top,a.x=a.left,a.y=a.top,a}var de="Sortable"+new Date().getTime();function fd(){var t=[],e;return{captureAnimationState:function(){if(t=[],!!this.options.animation){var a=[].slice.call(this.el.children);a.forEach(function(s){if(!(T(s,"display")==="none"||s===C.ghost)){t.push({target:s,rect:Y(s)});var r=Le({},t[t.length-1].rect);if(s.thisAnimationDuration){var o=Ot(s,!0);o&&(r.top-=o.f,r.left-=o.e)}s.fromRect=r}})}},addAnimationState:function(a){t.push(a)},removeAnimationState:function(a){t.splice(dd(t,{target:a}),1)},animateAll:function(a){var s=this;if(!this.options.animation){clearTimeout(e),typeof a=="function"&&a();return}var r=!1,o=0;t.forEach(function(l){var c=0,p=l.target,m=p.fromRect,h=Y(p),_=p.prevFromRect,S=p.prevToRect,b=l.rect,x=Ot(p,!0);x&&(h.top-=x.f,h.left-=x.e),p.toRect=h,p.thisAnimationDuration&&ja(_,h)&&!ja(m,h)&&(b.top-h.top)/(b.left-h.left)===(m.top-h.top)/(m.left-h.left)&&(c=md(b,_,S,s.options)),ja(h,m)||(p.prevFromRect=m,p.prevToRect=h,c||(c=s.options.animation),s.animate(p,b,h,c)),c&&(r=!0,o=Math.max(o,c),clearTimeout(p.animationResetTimer),p.animationResetTimer=setTimeout(function(){p.animationTime=0,p.prevFromRect=null,p.fromRect=null,p.prevToRect=null,p.thisAnimationDuration=null},c),p.thisAnimationDuration=c)}),clearTimeout(e),r?e=setTimeout(function(){typeof a=="function"&&a()},o):typeof a=="function"&&a(),t=[]},animate:function(a,s,r,o){if(o){T(a,"transition",""),T(a,"transform","");var l=Ot(this.el),c=l&&l.a,p=l&&l.d,m=(s.left-r.left)/(c||1),h=(s.top-r.top)/(p||1);a.animatingX=!!m,a.animatingY=!!h,T(a,"transform","translate3d("+m+"px,"+h+"px,0)"),this.forRepaintDummy=hd(a),T(a,"transition","transform "+o+"ms"+(this.options.easing?" "+this.options.easing:"")),T(a,"transform","translate3d(0,0,0)"),typeof a.animated=="number"&&clearTimeout(a.animated),a.animated=setTimeout(function(){T(a,"transition",""),T(a,"transform",""),a.animated=!1,a.animatingX=!1,a.animatingY=!1},o)}}}}function hd(t){return t.offsetWidth}function md(t,e,n,a){return Math.sqrt(Math.pow(e.top-t.top,2)+Math.pow(e.left-t.left,2))/Math.sqrt(Math.pow(e.top-n.top,2)+Math.pow(e.left-n.left,2))*a.animation}var kt=[],Va={initializeByDefault:!0},In={mount:function(e){for(var n in Va)Va.hasOwnProperty(n)&&!(n in e)&&(e[n]=Va[n]);kt.forEach(function(a){if(a.pluginName===e.pluginName)throw"Sortable: Cannot mount plugin ".concat(e.pluginName," more than once")}),kt.push(e)},pluginEvent:function(e,n,a){var s=this;this.eventCanceled=!1,a.cancel=function(){s.eventCanceled=!0};var r=e+"Global";kt.forEach(function(o){n[o.pluginName]&&(n[o.pluginName][r]&&n[o.pluginName][r](Le({sortable:n},a)),n.options[o.pluginName]&&n[o.pluginName][e]&&n[o.pluginName][e](Le({sortable:n},a)))})},initializePlugins:function(e,n,a,s){kt.forEach(function(l){var c=l.pluginName;if(!(!e.options[c]&&!l.initializeByDefault)){var p=new l(e,n,e.options);p.sortable=e,p.options=e.options,e[c]=p,je(a,p.defaults)}});for(var r in e.options)if(e.options.hasOwnProperty(r)){var o=this.modifyOption(e,r,e.options[r]);typeof o<"u"&&(e.options[r]=o)}},getEventProperties:function(e,n){var a={};return kt.forEach(function(s){typeof s.eventProperties=="function"&&je(a,s.eventProperties.call(n[s.pluginName],e))}),a},modifyOption:function(e,n,a){var s;return kt.forEach(function(r){e[r.pluginName]&&r.optionListeners&&typeof r.optionListeners[n]=="function"&&(s=r.optionListeners[n].call(e[r.pluginName],a))}),s}};function vd(t){var e=t.sortable,n=t.rootEl,a=t.name,s=t.targetEl,r=t.cloneEl,o=t.toEl,l=t.fromEl,c=t.oldIndex,p=t.newIndex,m=t.oldDraggableIndex,h=t.newDraggableIndex,_=t.originalEvent,S=t.putSortable,b=t.extraEventProperties;if(e=e||n&&n[de],!!e){var x,N=e.options,F="on"+a.charAt(0).toUpperCase()+a.substr(1);window.CustomEvent&&!Ge&&!En?x=new CustomEvent(a,{bubbles:!0,cancelable:!0}):(x=document.createEvent("Event"),x.initEvent(a,!0,!0)),x.to=o||n,x.from=l||n,x.item=s||n,x.clone=r,x.oldIndex=c,x.newIndex=p,x.oldDraggableIndex=m,x.newDraggableIndex=h,x.originalEvent=_,x.pullMode=S?S.lastPutMode:void 0;var z=Le(Le({},b),In.getEventProperties(a,e));for(var ue in z)x[ue]=z[ue];n&&n.dispatchEvent(x),N[F]&&N[F].call(e,x)}}var bd=["evt"],ce=function(e,n){var a=arguments.length>2&&arguments[2]!==void 0?arguments[2]:{},s=a.evt,r=id(a,bd);In.pluginEvent.bind(C)(e,n,Le({dragEl:y,parentEl:V,ghostEl:D,rootEl:H,nextEl:ut,lastDownEl:Xn,cloneEl:j,cloneHidden:Je,dragStarted:rn,putSortable:ne,activeSortable:C.active,originalEvent:s,oldIndex:Et,oldDraggableIndex:mn,newIndex:he,newDraggableIndex:Xe,hideGhostForTarget:ao,unhideGhostForTarget:so,cloneNowHidden:function(){Je=!0},cloneNowShown:function(){Je=!1},dispatchSortableEvent:function(l){oe({sortable:n,name:l,originalEvent:s})}},r))};function oe(t){vd(Le({putSortable:ne,cloneEl:j,targetEl:y,rootEl:H,oldIndex:Et,oldDraggableIndex:mn,newIndex:he,newDraggableIndex:Xe},t))}var y,V,D,H,ut,Xn,j,Je,Et,he,mn,Xe,Ln,ne,Tt=!1,la=!1,ca=[],ot,ke,Wa,Ga,Ui,Hi,rn,St,vn,bn=!1,Rn=!1,Qn,re,Ka=[],Cs=!1,da=[],ka=typeof document<"u",Nn=Zs,zi=En||Ge?"cssFloat":"float",gd=ka&&!Wr&&!Zs&&"draggable"in document.createElement("div"),eo=(function(){if(ka){if(Ge)return!1;var t=document.createElement("x");return t.style.cssText="pointer-events:auto",t.style.pointerEvents==="auto"}})(),to=function(e,n){var a=T(e),s=parseInt(a.width)-parseInt(a.paddingLeft)-parseInt(a.paddingRight)-parseInt(a.borderLeftWidth)-parseInt(a.borderRightWidth),r=Ht(e,0,n),o=Ht(e,1,n),l=r&&T(r),c=o&&T(o),p=l&&parseInt(l.marginLeft)+parseInt(l.marginRight)+Y(r).width,m=c&&parseInt(c.marginLeft)+parseInt(c.marginRight)+Y(o).width;if(a.display==="flex")return a.flexDirection==="column"||a.flexDirection==="column-reverse"?"vertical":"horizontal";if(a.display==="grid")return a.gridTemplateColumns.split(" ").length<=1?"vertical":"horizontal";if(r&&l.float&&l.float!=="none"){var h=l.float==="left"?"left":"right";return o&&(c.clear==="both"||c.clear===h)?"vertical":"horizontal"}return r&&(l.display==="block"||l.display==="flex"||l.display==="table"||l.display==="grid"||p>=s&&a[zi]==="none"||o&&a[zi]==="none"&&p+m>s)?"vertical":"horizontal"},yd=function(e,n,a){var s=a?e.left:e.top,r=a?e.right:e.bottom,o=a?e.width:e.height,l=a?n.left:n.top,c=a?n.right:n.bottom,p=a?n.width:n.height;return s===l||r===c||s+o/2===l+p/2},_d=function(e,n){var a;return ca.some(function(s){var r=s[de].options.emptyInsertThreshold;if(!(!r||ei(s))){var o=Y(s),l=e>=o.left-r&&e<=o.right+r,c=n>=o.top-r&&n<=o.bottom+r;if(l&&c)return a=s}}),a},no=function(e){function n(r,o){return function(l,c,p,m){var h=l.options.group.name&&c.options.group.name&&l.options.group.name===c.options.group.name;if(r==null&&(o||h))return!0;if(r==null||r===!1)return!1;if(o&&r==="clone")return r;if(typeof r=="function")return n(r(l,c,p,m),o)(l,c,p,m);var _=(o?l:c).options.group.name;return r===!0||typeof r=="string"&&r===_||r.join&&r.indexOf(_)>-1}}var a={},s=e.group;(!s||xs(s)!="object")&&(s={name:s}),a.name=s.name,a.checkPull=n(s.pull,!0),a.checkPut=n(s.put),a.revertClone=s.revertClone,e.group=a},ao=function(){!eo&&D&&T(D,"display","none")},so=function(){!eo&&D&&T(D,"display","")};ka&&!Wr&&document.addEventListener("click",function(t){if(la)return t.preventDefault(),t.stopPropagation&&t.stopPropagation(),t.stopImmediatePropagation&&t.stopImmediatePropagation(),la=!1,!1},!0);var lt=function(e){if(y){e=e.touches?e.touches[0]:e;var n=_d(e.clientX,e.clientY);if(n){var a={};for(var s in e)e.hasOwnProperty(s)&&(a[s]=e[s]);a.target=a.rootEl=n,a.preventDefault=void 0,a.stopPropagation=void 0,n[de]._onDragOver(a)}}},wd=function(e){y&&y.parentNode[de]._isOutsideThisEl(e.target)};function C(t,e){if(!(t&&t.nodeType&&t.nodeType===1))throw"Sortable: `el` must be an HTMLElement, not ".concat({}.toString.call(t));this.el=t,this.options=e=je({},e),t[de]=this;var n={group:null,sort:!0,disabled:!1,store:null,handle:null,draggable:/^[uo]l$/i.test(t.nodeName)?">li":">*",swapThreshold:1,invertSwap:!1,invertedSwapThreshold:null,removeCloneOnHide:!0,direction:function(){return to(t,this.options)},ghostClass:"sortable-ghost",chosenClass:"sortable-chosen",dragClass:"sortable-drag",ignore:"a, img",filter:null,preventOnFilter:!0,animation:0,easing:null,setData:function(o,l){o.setData("Text",l.textContent)},dropBubble:!1,dragoverBubble:!1,dataIdAttr:"data-id",delay:0,delayOnTouchOnly:!1,touchStartThreshold:(Number.parseInt?Number:window).parseInt(window.devicePixelRatio,10)||1,forceFallback:!1,fallbackClass:"sortable-fallback",fallbackOnBody:!1,fallbackTolerance:0,fallbackOffset:{x:0,y:0},supportPointer:C.supportPointer!==!1&&"PointerEvent"in window&&(!fn||Zs),emptyInsertThreshold:5};In.initializePlugins(this,t,n);for(var a in n)!(a in e)&&(e[a]=n[a]);no(e);for(var s in this)s.charAt(0)==="_"&&typeof this[s]=="function"&&(this[s]=this[s].bind(this));this.nativeDraggable=e.forceFallback?!1:gd,this.nativeDraggable&&(this.options.touchStartThreshold=1),e.supportPointer?O(t,"pointerdown",this._onTapStart):(O(t,"mousedown",this._onTapStart),O(t,"touchstart",this._onTapStart)),this.nativeDraggable&&(O(t,"dragover",this),O(t,"dragenter",this)),ca.push(this.el),e.store&&e.store.get&&this.sort(e.store.get(this)||[]),je(this,fd())}C.prototype={constructor:C,_isOutsideThisEl:function(e){!this.el.contains(e)&&e!==this.el&&(St=null)},_getDirection:function(e,n){return typeof this.options.direction=="function"?this.options.direction.call(this,e,n,y):this.options.direction},_onTapStart:function(e){if(e.cancelable){var n=this,a=this.el,s=this.options,r=s.preventOnFilter,o=e.type,l=e.touches&&e.touches[0]||e.pointerType&&e.pointerType==="touch"&&e,c=(l||e).target,p=e.target.shadowRoot&&(e.path&&e.path[0]||e.composedPath&&e.composedPath()[0])||c,m=s.filter;if(Id(a),!y&&!(/mousedown|pointerdown/.test(o)&&e.button!==0||s.disabled)&&!p.isContentEditable&&!(!this.nativeDraggable&&fn&&c&&c.tagName.toUpperCase()==="SELECT")&&(c=xe(c,s.draggable,a,!1),!(c&&c.animated)&&Xn!==c)){if(Et=_e(c),mn=_e(c,s.draggable),typeof m=="function"){if(m.call(this,e,c,this)){oe({sortable:n,rootEl:p,name:"filter",targetEl:c,toEl:a,fromEl:a}),ce("filter",n,{evt:e}),r&&e.preventDefault();return}}else if(m&&(m=m.split(",").some(function(h){if(h=xe(p,h.trim(),a,!1),h)return oe({sortable:n,rootEl:h,name:"filter",targetEl:c,fromEl:a,toEl:a}),ce("filter",n,{evt:e}),!0}),m)){r&&e.preventDefault();return}s.handle&&!xe(p,s.handle,a,!1)||this._prepareDragStart(e,l,c)}}},_prepareDragStart:function(e,n,a){var s=this,r=s.el,o=s.options,l=r.ownerDocument,c;if(a&&!y&&a.parentNode===r){var p=Y(a);if(H=r,y=a,V=y.parentNode,ut=y.nextSibling,Xn=a,Ln=o.group,C.dragged=y,ot={target:y,clientX:(n||e).clientX,clientY:(n||e).clientY},Ui=ot.clientX-p.left,Hi=ot.clientY-p.top,this._lastX=(n||e).clientX,this._lastY=(n||e).clientY,y.style["will-change"]="all",c=function(){if(ce("delayEnded",s,{evt:e}),C.eventCanceled){s._onDrop();return}s._disableDelayedDragEvents(),!Ni&&s.nativeDraggable&&(y.draggable=!0),s._triggerDragStart(e,n),oe({sortable:s,name:"choose",originalEvent:e}),fe(y,o.chosenClass,!0)},o.ignore.split(",").forEach(function(m){Yr(y,m.trim(),Ya)}),O(l,"dragover",lt),O(l,"mousemove",lt),O(l,"touchmove",lt),o.supportPointer?(O(l,"pointerup",s._onDrop),!this.nativeDraggable&&O(l,"pointercancel",s._onDrop)):(O(l,"mouseup",s._onDrop),O(l,"touchend",s._onDrop),O(l,"touchcancel",s._onDrop)),Ni&&this.nativeDraggable&&(this.options.touchStartThreshold=4,y.draggable=!0),ce("delayStart",this,{evt:e}),o.delay&&(!o.delayOnTouchOnly||n)&&(!this.nativeDraggable||!(En||Ge))){if(C.eventCanceled){this._onDrop();return}o.supportPointer?(O(l,"pointerup",s._disableDelayedDrag),O(l,"pointercancel",s._disableDelayedDrag)):(O(l,"mouseup",s._disableDelayedDrag),O(l,"touchend",s._disableDelayedDrag),O(l,"touchcancel",s._disableDelayedDrag)),O(l,"mousemove",s._delayedDragTouchMoveHandler),O(l,"touchmove",s._delayedDragTouchMoveHandler),o.supportPointer&&O(l,"pointermove",s._delayedDragTouchMoveHandler),s._dragStartTimer=setTimeout(c,o.delay)}else c()}},_delayedDragTouchMoveHandler:function(e){var n=e.touches?e.touches[0]:e;Math.max(Math.abs(n.clientX-this._lastX),Math.abs(n.clientY-this._lastY))>=Math.floor(this.options.touchStartThreshold/(this.nativeDraggable&&window.devicePixelRatio||1))&&this._disableDelayedDrag()},_disableDelayedDrag:function(){y&&Ya(y),clearTimeout(this._dragStartTimer),this._disableDelayedDragEvents()},_disableDelayedDragEvents:function(){var e=this.el.ownerDocument;P(e,"mouseup",this._disableDelayedDrag),P(e,"touchend",this._disableDelayedDrag),P(e,"touchcancel",this._disableDelayedDrag),P(e,"pointerup",this._disableDelayedDrag),P(e,"pointercancel",this._disableDelayedDrag),P(e,"mousemove",this._delayedDragTouchMoveHandler),P(e,"touchmove",this._delayedDragTouchMoveHandler),P(e,"pointermove",this._delayedDragTouchMoveHandler)},_triggerDragStart:function(e,n){n=n||e.pointerType=="touch"&&e,!this.nativeDraggable||n?this.options.supportPointer?O(document,"pointermove",this._onTouchMove):n?O(document,"touchmove",this._onTouchMove):O(document,"mousemove",this._onTouchMove):(O(y,"dragend",this),O(H,"dragstart",this._onDragStart));try{document.selection?Jn(function(){document.selection.empty()}):window.getSelection().removeAllRanges()}catch{}},_dragStarted:function(e,n){if(Tt=!1,H&&y){ce("dragStarted",this,{evt:n}),this.nativeDraggable&&O(document,"dragover",wd);var a=this.options;!e&&fe(y,a.dragClass,!1),fe(y,a.ghostClass,!0),C.active=this,e&&this._appendGhost(),oe({sortable:this,name:"start",originalEvent:n})}else this._nulling()},_emulateDragOver:function(){if(ke){this._lastX=ke.clientX,this._lastY=ke.clientY,ao();for(var e=document.elementFromPoint(ke.clientX,ke.clientY),n=e;e&&e.shadowRoot&&(e=e.shadowRoot.elementFromPoint(ke.clientX,ke.clientY),e!==n);)n=e;if(y.parentNode[de]._isOutsideThisEl(e),n)do{if(n[de]){var a=void 0;if(a=n[de]._onDragOver({clientX:ke.clientX,clientY:ke.clientY,target:e,rootEl:n}),a&&!this.options.dragoverBubble)break}e=n}while(n=Kr(n));so()}},_onTouchMove:function(e){if(ot){var n=this.options,a=n.fallbackTolerance,s=n.fallbackOffset,r=e.touches?e.touches[0]:e,o=D&&Ot(D,!0),l=D&&o&&o.a,c=D&&o&&o.d,p=Nn&&re&&Fi(re),m=(r.clientX-ot.clientX+s.x)/(l||1)+(p?p[0]-Ka[0]:0)/(l||1),h=(r.clientY-ot.clientY+s.y)/(c||1)+(p?p[1]-Ka[1]:0)/(c||1);if(!C.active&&!Tt){if(a&&Math.max(Math.abs(r.clientX-this._lastX),Math.abs(r.clientY-this._lastY))<a)return;this._onDragStart(e,!0)}if(D){o?(o.e+=m-(Wa||0),o.f+=h-(Ga||0)):o={a:1,b:0,c:0,d:1,e:m,f:h};var _="matrix(".concat(o.a,",").concat(o.b,",").concat(o.c,",").concat(o.d,",").concat(o.e,",").concat(o.f,")");T(D,"webkitTransform",_),T(D,"mozTransform",_),T(D,"msTransform",_),T(D,"transform",_),Wa=m,Ga=h,ke=r}e.cancelable&&e.preventDefault()}},_appendGhost:function(){if(!D){var e=this.options.fallbackOnBody?document.body:H,n=Y(y,!0,Nn,!0,e),a=this.options;if(Nn){for(re=e;T(re,"position")==="static"&&T(re,"transform")==="none"&&re!==document;)re=re.parentNode;re!==document.body&&re!==document.documentElement?(re===document&&(re=Pe()),n.top+=re.scrollTop,n.left+=re.scrollLeft):re=Pe(),Ka=Fi(re)}D=y.cloneNode(!0),fe(D,a.ghostClass,!1),fe(D,a.fallbackClass,!0),fe(D,a.dragClass,!0),T(D,"transition",""),T(D,"transform",""),T(D,"box-sizing","border-box"),T(D,"margin",0),T(D,"top",n.top),T(D,"left",n.left),T(D,"width",n.width),T(D,"height",n.height),T(D,"opacity","0.8"),T(D,"position",Nn?"absolute":"fixed"),T(D,"zIndex","100000"),T(D,"pointerEvents","none"),C.ghost=D,e.appendChild(D),T(D,"transform-origin",Ui/parseInt(D.style.width)*100+"% "+Hi/parseInt(D.style.height)*100+"%")}},_onDragStart:function(e,n){var a=this,s=e.dataTransfer,r=a.options;if(ce("dragStart",this,{evt:e}),C.eventCanceled){this._onDrop();return}ce("setupClone",this),C.eventCanceled||(j=Jr(y),j.removeAttribute("id"),j.draggable=!1,j.style["will-change"]="",this._hideClone(),fe(j,this.options.chosenClass,!1),C.clone=j),a.cloneId=Jn(function(){ce("clone",a),!C.eventCanceled&&(a.options.removeCloneOnHide||H.insertBefore(j,y),a._hideClone(),oe({sortable:a,name:"clone"}))}),!n&&fe(y,r.dragClass,!0),n?(la=!0,a._loopId=setInterval(a._emulateDragOver,50)):(P(document,"mouseup",a._onDrop),P(document,"touchend",a._onDrop),P(document,"touchcancel",a._onDrop),s&&(s.effectAllowed="move",r.setData&&r.setData.call(a,s,y)),O(document,"drop",a),T(y,"transform","translateZ(0)")),Tt=!0,a._dragStartId=Jn(a._dragStarted.bind(a,n,e)),O(document,"selectstart",a),rn=!0,window.getSelection().removeAllRanges(),fn&&T(document.body,"user-select","none")},_onDragOver:function(e){var n=this.el,a=e.target,s,r,o,l=this.options,c=l.group,p=C.active,m=Ln===c,h=l.sort,_=ne||p,S,b=this,x=!1;if(Cs)return;function N(Jt,Qo){ce(Jt,b,Le({evt:e,isOwner:m,axis:S?"vertical":"horizontal",revert:o,dragRect:s,targetRect:r,canSort:h,fromSortable:_,target:a,completed:z,onMove:function(_i,Jo){return qn(H,n,y,s,_i,Y(_i),e,Jo)},changed:ue},Qo))}function F(){N("dragOverAnimationCapture"),b.captureAnimationState(),b!==_&&_.captureAnimationState()}function z(Jt){return N("dragOverCompleted",{insertion:Jt}),Jt&&(m?p._hideClone():p._showClone(b),b!==_&&(fe(y,ne?ne.options.ghostClass:p.options.ghostClass,!1),fe(y,l.ghostClass,!0)),ne!==b&&b!==C.active?ne=b:b===C.active&&ne&&(ne=null),_===b&&(b._ignoreWhileAnimating=a),b.animateAll(function(){N("dragOverAnimationComplete"),b._ignoreWhileAnimating=null}),b!==_&&(_.animateAll(),_._ignoreWhileAnimating=null)),(a===y&&!y.animated||a===n&&!a.animated)&&(St=null),!l.dragoverBubble&&!e.rootEl&&a!==document&&(y.parentNode[de]._isOutsideThisEl(e.target),!Jt&&lt(e)),!l.dragoverBubble&&e.stopPropagation&&e.stopPropagation(),x=!0}function ue(){he=_e(y),Xe=_e(y,l.draggable),oe({sortable:b,name:"change",toEl:n,newIndex:he,newDraggableIndex:Xe,originalEvent:e})}if(e.preventDefault!==void 0&&e.cancelable&&e.preventDefault(),a=xe(a,l.draggable,n,!0),N("dragOver"),C.eventCanceled)return x;if(y.contains(e.target)||a.animated&&a.animatingX&&a.animatingY||b._ignoreWhileAnimating===a)return z(!1);if(la=!1,p&&!l.disabled&&(m?h||(o=V!==H):ne===this||(this.lastPutMode=Ln.checkPull(this,p,y,e))&&c.checkPut(this,p,y,e))){if(S=this._getDirection(e,a)==="vertical",s=Y(y),N("dragOverValid"),C.eventCanceled)return x;if(o)return V=H,F(),this._hideClone(),N("revert"),C.eventCanceled||(ut?H.insertBefore(y,ut):H.appendChild(y)),z(!0);var Z=ei(n,l.draggable);if(!Z||xd(e,S,this)&&!Z.animated){if(Z===y)return z(!1);if(Z&&n===e.target&&(a=Z),a&&(r=Y(a)),qn(H,n,y,s,a,r,e,!!a)!==!1)return F(),Z&&Z.nextSibling?n.insertBefore(y,Z.nextSibling):n.appendChild(y),V=n,ue(),z(!0)}else if(Z&&Sd(e,S,this)){var ye=Ht(n,0,l,!0);if(ye===y)return z(!1);if(a=ye,r=Y(a),qn(H,n,y,s,a,r,e,!1)!==!1)return F(),n.insertBefore(y,ye),V=n,ue(),z(!0)}else if(a.parentNode===n){r=Y(a);var Ie=0,st,Kt=y.parentNode!==n,pe=!yd(y.animated&&y.toRect||s,a.animated&&a.toRect||r,S),Yt=S?"top":"left",Ke=Bi(a,"top","top")||Bi(y,"top","top"),Xt=Ke?Ke.scrollTop:void 0;St!==a&&(st=r[Yt],bn=!1,Rn=!pe&&l.invertSwap||Kt),Ie=Cd(e,a,r,S,pe?1:l.swapThreshold,l.invertedSwapThreshold==null?l.swapThreshold:l.invertedSwapThreshold,Rn,St===a);var Ne;if(Ie!==0){var it=_e(y);do it-=Ie,Ne=V.children[it];while(Ne&&(T(Ne,"display")==="none"||Ne===D))}if(Ie===0||Ne===a)return z(!1);St=a,vn=Ie;var Qt=a.nextElementSibling,Ye=!1;Ye=Ie===1;var Pn=qn(H,n,y,s,a,r,e,Ye);if(Pn!==!1)return(Pn===1||Pn===-1)&&(Ye=Pn===1),Cs=!0,setTimeout(kd,30),F(),Ye&&!Qt?n.appendChild(y):a.parentNode.insertBefore(y,Ye?Qt:a),Ke&&Qr(Ke,0,Xt-Ke.scrollTop),V=y.parentNode,st!==void 0&&!Rn&&(Qn=Math.abs(st-Y(a)[Yt])),ue(),z(!0)}if(n.contains(y))return z(!1)}return!1},_ignoreWhileAnimating:null,_offMoveEvents:function(){P(document,"mousemove",this._onTouchMove),P(document,"touchmove",this._onTouchMove),P(document,"pointermove",this._onTouchMove),P(document,"dragover",lt),P(document,"mousemove",lt),P(document,"touchmove",lt)},_offUpEvents:function(){var e=this.el.ownerDocument;P(e,"mouseup",this._onDrop),P(e,"touchend",this._onDrop),P(e,"pointerup",this._onDrop),P(e,"pointercancel",this._onDrop),P(e,"touchcancel",this._onDrop),P(document,"selectstart",this)},_onDrop:function(e){var n=this.el,a=this.options;if(he=_e(y),Xe=_e(y,a.draggable),ce("drop",this,{evt:e}),V=y&&y.parentNode,he=_e(y),Xe=_e(y,a.draggable),C.eventCanceled){this._nulling();return}Tt=!1,Rn=!1,bn=!1,clearInterval(this._loopId),clearTimeout(this._dragStartTimer),Ts(this.cloneId),Ts(this._dragStartId),this.nativeDraggable&&(P(document,"drop",this),P(n,"dragstart",this._onDragStart)),this._offMoveEvents(),this._offUpEvents(),fn&&T(document.body,"user-select",""),T(y,"transform",""),e&&(rn&&(e.cancelable&&e.preventDefault(),!a.dropBubble&&e.stopPropagation()),D&&D.parentNode&&D.parentNode.removeChild(D),(H===V||ne&&ne.lastPutMode!=="clone")&&j&&j.parentNode&&j.parentNode.removeChild(j),y&&(this.nativeDraggable&&P(y,"dragend",this),Ya(y),y.style["will-change"]="",rn&&!Tt&&fe(y,ne?ne.options.ghostClass:this.options.ghostClass,!1),fe(y,this.options.chosenClass,!1),oe({sortable:this,name:"unchoose",toEl:V,newIndex:null,newDraggableIndex:null,originalEvent:e}),H!==V?(he>=0&&(oe({rootEl:V,name:"add",toEl:V,fromEl:H,originalEvent:e}),oe({sortable:this,name:"remove",toEl:V,originalEvent:e}),oe({rootEl:V,name:"sort",toEl:V,fromEl:H,originalEvent:e}),oe({sortable:this,name:"sort",toEl:V,originalEvent:e})),ne&&ne.save()):he!==Et&&he>=0&&(oe({sortable:this,name:"update",toEl:V,originalEvent:e}),oe({sortable:this,name:"sort",toEl:V,originalEvent:e})),C.active&&((he==null||he===-1)&&(he=Et,Xe=mn),oe({sortable:this,name:"end",toEl:V,originalEvent:e}),this.save()))),this._nulling()},_nulling:function(){ce("nulling",this),H=y=V=D=ut=j=Xn=Je=ot=ke=rn=he=Xe=Et=mn=St=vn=ne=Ln=C.dragged=C.ghost=C.clone=C.active=null;var e=this.el;da.forEach(function(n){e.contains(n)&&(n.checked=!0)}),da.length=Wa=Ga=0},handleEvent:function(e){switch(e.type){case"drop":case"dragend":this._onDrop(e);break;case"dragenter":case"dragover":y&&(this._onDragOver(e),$d(e));break;case"selectstart":e.preventDefault();break}},toArray:function(){for(var e=[],n,a=this.el.children,s=0,r=a.length,o=this.options;s<r;s++)n=a[s],xe(n,o.draggable,this.el,!1)&&e.push(n.getAttribute(o.dataIdAttr)||Ed(n));return e},sort:function(e,n){var a={},s=this.el;this.toArray().forEach(function(r,o){var l=s.children[o];xe(l,this.options.draggable,s,!1)&&(a[r]=l)},this),n&&this.captureAnimationState(),e.forEach(function(r){a[r]&&(s.removeChild(a[r]),s.appendChild(a[r]))}),n&&this.animateAll()},save:function(){var e=this.options.store;e&&e.set&&e.set(this)},closest:function(e,n){return xe(e,n||this.options.draggable,this.el,!1)},option:function(e,n){var a=this.options;if(n===void 0)return a[e];var s=In.modifyOption(this,e,n);typeof s<"u"?a[e]=s:a[e]=n,e==="group"&&no(a)},destroy:function(){ce("destroy",this);var e=this.el;e[de]=null,P(e,"mousedown",this._onTapStart),P(e,"touchstart",this._onTapStart),P(e,"pointerdown",this._onTapStart),this.nativeDraggable&&(P(e,"dragover",this),P(e,"dragenter",this)),Array.prototype.forEach.call(e.querySelectorAll("[draggable]"),function(n){n.removeAttribute("draggable")}),this._onDrop(),this._disableDelayedDragEvents(),ca.splice(ca.indexOf(this.el),1),this.el=e=null},_hideClone:function(){if(!Je){if(ce("hideClone",this),C.eventCanceled)return;T(j,"display","none"),this.options.removeCloneOnHide&&j.parentNode&&j.parentNode.removeChild(j),Je=!0}},_showClone:function(e){if(e.lastPutMode!=="clone"){this._hideClone();return}if(Je){if(ce("showClone",this),C.eventCanceled)return;y.parentNode==H&&!this.options.group.revertClone?H.insertBefore(j,y):ut?H.insertBefore(j,ut):H.appendChild(j),this.options.group.revertClone&&this.animate(y,j),T(j,"display",""),Je=!1}}};function $d(t){t.dataTransfer&&(t.dataTransfer.dropEffect="move"),t.cancelable&&t.preventDefault()}function qn(t,e,n,a,s,r,o,l){var c,p=t[de],m=p.options.onMove,h;return window.CustomEvent&&!Ge&&!En?c=new CustomEvent("move",{bubbles:!0,cancelable:!0}):(c=document.createEvent("Event"),c.initEvent("move",!0,!0)),c.to=e,c.from=t,c.dragged=n,c.draggedRect=a,c.related=s||e,c.relatedRect=r||Y(e),c.willInsertAfter=l,c.originalEvent=o,t.dispatchEvent(c),m&&(h=m.call(p,c,o)),h}function Ya(t){t.draggable=!1}function kd(){Cs=!1}function Sd(t,e,n){var a=Y(Ht(n.el,0,n.options,!0)),s=Zr(n.el,n.options,D),r=10;return e?t.clientX<s.left-r||t.clientY<a.top&&t.clientX<a.right:t.clientY<s.top-r||t.clientY<a.bottom&&t.clientX<a.left}function xd(t,e,n){var a=Y(ei(n.el,n.options.draggable)),s=Zr(n.el,n.options,D),r=10;return e?t.clientX>s.right+r||t.clientY>a.bottom&&t.clientX>a.left:t.clientY>s.bottom+r||t.clientX>a.right&&t.clientY>a.top}function Cd(t,e,n,a,s,r,o,l){var c=a?t.clientY:t.clientX,p=a?n.height:n.width,m=a?n.top:n.left,h=a?n.bottom:n.right,_=!1;if(!o){if(l&&Qn<p*s){if(!bn&&(vn===1?c>m+p*r/2:c<h-p*r/2)&&(bn=!0),bn)_=!0;else if(vn===1?c<m+Qn:c>h-Qn)return-vn}else if(c>m+p*(1-s)/2&&c<h-p*(1-s)/2)return Td(e)}return _=_||o,_&&(c<m+p*r/2||c>h-p*r/2)?c>m+p/2?1:-1:0}function Td(t){return _e(y)<_e(t)?1:-1}function Ed(t){for(var e=t.tagName+t.className+t.src+t.href+t.textContent,n=e.length,a=0;n--;)a+=e.charCodeAt(n);return a.toString(36)}function Id(t){da.length=0;for(var e=t.getElementsByTagName("input"),n=e.length;n--;){var a=e[n];a.checked&&da.push(a)}}function Jn(t){return setTimeout(t,0)}function Ts(t){return clearTimeout(t)}ka&&O(document,"touchmove",function(t){(C.active||Tt)&&t.cancelable&&t.preventDefault()});C.utils={on:O,off:P,css:T,find:Yr,is:function(e,n){return!!xe(e,n,e,!1)},extend:ud,throttle:Xr,closest:xe,toggleClass:fe,clone:Jr,index:_e,nextTick:Jn,cancelNextTick:Ts,detectDirection:to,getChild:Ht,expando:de};C.get=function(t){return t[de]};C.mount=function(){for(var t=arguments.length,e=new Array(t),n=0;n<t;n++)e[n]=arguments[n];e[0].constructor===Array&&(e=e[0]),e.forEach(function(a){if(!a.prototype||!a.prototype.constructor)throw"Sortable: Mounted plugin must be a constructor function, not ".concat({}.toString.call(a));a.utils&&(C.utils=Le(Le({},C.utils),a.utils)),In.mount(a)})};C.create=function(t,e){return new C(t,e)};C.version=cd;var G=[],on,Es,Is=!1,Xa,Qa,ua,ln;function Ad(){function t(){this.defaults={scroll:!0,forceAutoScrollFallback:!1,scrollSensitivity:30,scrollSpeed:10,bubbleScroll:!0};for(var e in this)e.charAt(0)==="_"&&typeof this[e]=="function"&&(this[e]=this[e].bind(this))}return t.prototype={dragStarted:function(n){var a=n.originalEvent;this.sortable.nativeDraggable?O(document,"dragover",this._handleAutoScroll):this.options.supportPointer?O(document,"pointermove",this._handleFallbackAutoScroll):a.touches?O(document,"touchmove",this._handleFallbackAutoScroll):O(document,"mousemove",this._handleFallbackAutoScroll)},dragOverCompleted:function(n){var a=n.originalEvent;!this.options.dragOverBubble&&!a.rootEl&&this._handleAutoScroll(a)},drop:function(){this.sortable.nativeDraggable?P(document,"dragover",this._handleAutoScroll):(P(document,"pointermove",this._handleFallbackAutoScroll),P(document,"touchmove",this._handleFallbackAutoScroll),P(document,"mousemove",this._handleFallbackAutoScroll)),ji(),Zn(),pd()},nulling:function(){ua=Es=on=Is=ln=Xa=Qa=null,G.length=0},_handleFallbackAutoScroll:function(n){this._handleAutoScroll(n,!0)},_handleAutoScroll:function(n,a){var s=this,r=(n.touches?n.touches[0]:n).clientX,o=(n.touches?n.touches[0]:n).clientY,l=document.elementFromPoint(r,o);if(ua=n,a||this.options.forceAutoScrollFallback||En||Ge||fn){Ja(n,this.options,l,a);var c=Ze(l,!0);Is&&(!ln||r!==Xa||o!==Qa)&&(ln&&ji(),ln=setInterval(function(){var p=Ze(document.elementFromPoint(r,o),!0);p!==c&&(c=p,Zn()),Ja(n,s.options,p,a)},10),Xa=r,Qa=o)}else{if(!this.options.bubbleScroll||Ze(l,!0)===Pe()){Zn();return}Ja(n,this.options,Ze(l,!1),!1)}}},je(t,{pluginName:"scroll",initializeByDefault:!0})}function Zn(){G.forEach(function(t){clearInterval(t.pid)}),G=[]}function ji(){clearInterval(ln)}var Ja=Xr(function(t,e,n,a){if(e.scroll){var s=(t.touches?t.touches[0]:t).clientX,r=(t.touches?t.touches[0]:t).clientY,o=e.scrollSensitivity,l=e.scrollSpeed,c=Pe(),p=!1,m;Es!==n&&(Es=n,Zn(),on=e.scroll,m=e.scrollFn,on===!0&&(on=Ze(n,!0)));var h=0,_=on;do{var S=_,b=Y(S),x=b.top,N=b.bottom,F=b.left,z=b.right,ue=b.width,Z=b.height,ye=void 0,Ie=void 0,st=S.scrollWidth,Kt=S.scrollHeight,pe=T(S),Yt=S.scrollLeft,Ke=S.scrollTop;S===c?(ye=ue<st&&(pe.overflowX==="auto"||pe.overflowX==="scroll"||pe.overflowX==="visible"),Ie=Z<Kt&&(pe.overflowY==="auto"||pe.overflowY==="scroll"||pe.overflowY==="visible")):(ye=ue<st&&(pe.overflowX==="auto"||pe.overflowX==="scroll"),Ie=Z<Kt&&(pe.overflowY==="auto"||pe.overflowY==="scroll"));var Xt=ye&&(Math.abs(z-s)<=o&&Yt+ue<st)-(Math.abs(F-s)<=o&&!!Yt),Ne=Ie&&(Math.abs(N-r)<=o&&Ke+Z<Kt)-(Math.abs(x-r)<=o&&!!Ke);if(!G[h])for(var it=0;it<=h;it++)G[it]||(G[it]={});(G[h].vx!=Xt||G[h].vy!=Ne||G[h].el!==S)&&(G[h].el=S,G[h].vx=Xt,G[h].vy=Ne,clearInterval(G[h].pid),(Xt!=0||Ne!=0)&&(p=!0,G[h].pid=setInterval(function(){a&&this.layer===0&&C.active._onTouchMove(ua);var Qt=G[this.layer].vy?G[this.layer].vy*l:0,Ye=G[this.layer].vx?G[this.layer].vx*l:0;typeof m=="function"&&m.call(C.dragged.parentNode[de],Ye,Qt,t,ua,G[this.layer].el)!=="continue"||Qr(G[this.layer].el,Ye,Qt)}.bind({layer:h}),24))),h++}while(e.bubbleScroll&&_!==c&&(_=Ze(_,!1)));Is=p}},30),io=function(e){var n=e.originalEvent,a=e.putSortable,s=e.dragEl,r=e.activeSortable,o=e.dispatchSortableEvent,l=e.hideGhostForTarget,c=e.unhideGhostForTarget;if(n){var p=a||r;l();var m=n.changedTouches&&n.changedTouches.length?n.changedTouches[0]:n,h=document.elementFromPoint(m.clientX,m.clientY);c(),p&&!p.el.contains(h)&&(o("spill"),this.onSpill({dragEl:s,putSortable:a}))}};function ti(){}ti.prototype={startIndex:null,dragStart:function(e){var n=e.oldDraggableIndex;this.startIndex=n},onSpill:function(e){var n=e.dragEl,a=e.putSortable;this.sortable.captureAnimationState(),a&&a.captureAnimationState();var s=Ht(this.sortable.el,this.startIndex,this.options);s?this.sortable.el.insertBefore(n,s):this.sortable.el.appendChild(n),this.sortable.animateAll(),a&&a.animateAll()},drop:io};je(ti,{pluginName:"revertOnSpill"});function ni(){}ni.prototype={onSpill:function(e){var n=e.dragEl,a=e.putSortable,s=a||this.sortable;s.captureAnimationState(),n.parentNode&&n.parentNode.removeChild(n),s.animateAll()},drop:io};je(ni,{pluginName:"removeOnSpill"});C.mount(new Ad);C.mount(ni,ti);class Dd extends ge{static properties={playlistId:{type:String}};constructor(){super(),this.playlistId="",this._query=""}deps(){return[i.playlistVersion,i.songs,this.playlistId,this._query]}get already(){const e=i.playlists.find(n=>n.id===this.playlistId);return new Set(e?.songIds||[])}get filtered(){const e=this._query.trim().toLowerCase();return e?i.songs.filter(n=>`${n.title} ${n.artist} ${n.album}`.toLowerCase().includes(e)):i.songs}render(){const e=this.already,n=this.filtered,a=i.songs.filter(s=>!e.has(s.id)).length;return d`
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
          ${this._query.trim()?`匹配 ${E(n.length)} 首`:`共 ${E(i.songs.length)} 首 · 其中 ${E(a)} 首尚未加入`}
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
        ${n.length?Te(n,s=>s.id,s=>{const r=e.has(s.id);return d`
                    <label class="addsongs__row">
                      <input type="checkbox" data-song-check=${s.id} ?checked=${r} ?disabled=${r} />
                      <span class="addsongs__text">
                        <span class="addsongs__title u-ellipsis">${s.title}</span>
                        <span class="addsongs__sub u-ellipsis">${s.artist}${s.album?` · ${s.album}`:""}</span>
                      </span>
                      ${r?d`<span class="addsongs__tag">已在歌单</span>`:A}
                    </label>
                  `}):d`<div class="addsongs__empty">没有匹配的歌曲</div>`}
      </div>
    `}setAll(e){for(const n of this.querySelectorAll("[data-song-check]:not(:disabled)"))n.checked=e}}ie("mp-add-songs",Dd);function ro(t){W({title:"新建歌单",desc:"歌单名称可以随时修改。",body:d`<input class="input" data-field="name" type="text" placeholder="例如：深夜循环" maxlength="40" />`,okText:"创建",onOk:async e=>{const n=String(e.name||"").trim();if(!n)return"请输入歌单名称";if(i.playlists.some(s=>s.name===n))return"已存在同名歌单";const a=await rl(n);return a?(t?.(a),u(`已创建歌单「${n}」`,{tone:"success"}),!0):"新建歌单失败，请查看提示"}})}function Md(t,e){const n=He(t);!n||n.locked||W({title:"重命名歌单",body:d`<input class="input" data-field="name" type="text" .value=${n.name} maxlength="40" />`,okText:"保存",onOk:a=>{const s=String(a.name||"").trim();return s?(ll(t,s),!0):"名称不能为空"}})}function Pd(t,e){const n=He(t);!n||n.locked||W({title:`删除歌单「${n.name}」？`,desc:"只会删除歌单本身，本地音乐文件不会被删除。",okText:"删除",danger:!0,onOk:()=>(ol(t),e?.(),u("歌单已删除"),!0)})}function pa(t,e){const n=He(t);if(!n)return;const a=il(t,e);a?u(`已添加 ${a} 首到「${n.name}」`,{tone:"success"}):u("所选歌曲已在该歌单中")}function Od(t){const e=He(t);if(!e)return;if(!i.songs.length){u("本地曲库还是空的，先扫描音乐文件夹吧",{tone:"warning"});return}const n=new Set(e.songIds);W({title:`添加歌曲到「${e.name}」`,desc:"勾选要加入的歌曲；已经在歌单里的会保持选中。",body:d`<mp-add-songs .playlistId=${t}></mp-add-songs>`,okText:"加入歌单",onOk:(a,s)=>{const o=[...s.querySelectorAll("[data-song-check]:checked")].map(l=>l.dataset.songCheck).filter(l=>!n.has(l));return o.length?(pa(t,o),!0):"没有选中新的歌曲"}})}function As(t,e){const n=He(t);if(!n)return;const a=[{id:"play",label:"播放这个歌单",icon:"play"},{id:"queue",label:"加入播放列表",icon:"queue"},{id:"sep1",kind:"sep"}];n.locked||(a.push({id:"rename",label:"重命名",icon:"edit"}),a.push({id:"delete",label:"删除歌单",icon:"trash",danger:!0}),a.push({id:"sep2",kind:"sep"}));const s=e.getBoundingClientRect();Bt({x:s.left,y:s.bottom+6,align:"right",items:a,onPick:async r=>{switch(r){case"play":Ld(n);break;case"queue":{(await yt(()=>import("./base-CoiS-1tI.js").then(l=>l.aY),__vite__mapDeps([0,1]))).appendToQueue(n.songIds),u(`已把 ${E(n.songIds.length)} 首加入播放列表`,{tone:"success"});break}case"rename":Md(n.id);break;case"delete":Pd(n.id,()=>Mt("library"));break}}})}function Ld(t){yt(async()=>{const{playContext:e}=await import("./base-CoiS-1tI.js").then(n=>n.aY);return{playContext:e}},__vite__mapDeps([0,1])).then(({playContext:e})=>{e(t.songIds.slice(),0,{type:"playlist",id:t.id})})}let Vi=0;class Rd extends ge{static deps=e=>[e.view,e.playlistId,e.playlistVersion,e.songs.length,e.queue.length];firstUpdated(){this.bindDrag()}bindDrag(){const e=this.querySelector("#playlist-nav");!e||this._sortable||(this._sortable=C.create(e,{draggable:".navitem",filter:'[data-locked="true"]',animation:0,ghostClass:"is-dragging",onEnd:n=>this.onDragEnd(n)}))}onDragEnd(e){Vi=Date.now();const n=e.oldIndex,a=e.newIndex;if(n==null||a==null||n===a)return;const s=e.from,r=Array.from(s.children).filter(o=>o!==e.item);s.insertBefore(e.item,r[n]??null),cl(n-1,a-1),u("已调整歌单顺序",{duration:1400})}onSidebarClick(e){if(Date.now()-Vi<260)return;const n=e.target.closest('[data-act="pl-more"]');if(n){e.stopPropagation(),As(n.dataset.id,n);return}const a=e.target.closest("[data-nav]");if(!a)return;const s=a.dataset.nav;s==="playlist"?Mt("playlist",a.dataset.playlist):Mt(s)}render(){const e=i.playlists.filter(s=>s.id!==Vn),a=[He(Vn),...e].filter(Boolean);return d`
      <aside
        class="sidebar"
        id="sidebar"
        @click=${s=>this.onSidebarClick(s)}
        @contextmenu=${s=>{const r=s.target.closest('[data-nav="playlist"]');r&&(s.preventDefault(),As(r.dataset.playlist,r))}}
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
                <span class="navitem__badge" id="badge-queue">${E(i.queue.length)}</span>
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
                @click=${()=>ro(s=>s&&Mt("playlist",s.id))}
              >
                ${f("plus")}
              </button>
            </div>
            <div id="playlist-nav">
              ${Te(a,s=>s.id,s=>this.playlistItem(s))}
            </div>
          </nav>
        </div>
      </aside>
    `}playlistItem(e){const n=i.view==="playlist"&&i.playlistId===e.id;return d`
      <button
        class="navitem"
        type="button"
        data-nav="playlist"
        data-playlist=${e.id}
        data-locked=${String(!!e.locked)}
        draggable=${e.locked?"false":"true"}
        aria-selected=${String(n)}
      >
        ${f(e.id===Vn?"heart":"playlist","navitem__icon")}
        <span class="navitem__text">${e.name}</span>
        <span class="navitem__tail">
          <span class="navitem__badge">${E(e.songIds.length)}</span>
          <span class="navitem__more" data-act="pl-more" data-id=${e.id} role="button" aria-label="${e.name}操作"
            >${f("more")}</span
          >
        </span>
      </button>
    `}}ie("mp-sidebar",Rd);const Nd=Xs(class extends Qs{constructor(){super(...arguments),this.key=A}render(t,e){return this.key=t,e}update(t,[e,n]){return e!==this.key&&(qr(t),this.key=e),n}}),ai=[{id:"auto",label:"自动识别（按接口地址与模型名判断）",hint:"识别不出时按 OpenAI 兼容接口处理"},{id:"openai",label:"OpenAI（GPT-5 系列 / o 系列）",hint:"o 系列无法完全关闭思考，只能降到最低档"},{id:"deepseek",label:"DeepSeek（deepseek-chat / reasoner）",hint:"思考模式下 temperature 会被忽略"},{id:"anthropic",label:"Anthropic Claude",hint:"开启思考时 temperature 必须为 1，程序会自动去掉它"},{id:"gemini",label:"Google Gemini",hint:"Pro 系列无法关闭思考"},{id:"qwen",label:"阿里通义千问 Qwen",hint:"仅「混合思考」模型可关闭；部分开源模型只支持流式"},{id:"glm",label:"智谱 GLM",hint:"GLM-5.3 系列传 disabled 会报错"},{id:"kimi",label:"月之暗面 Kimi",hint:"kimi-k3 / k2.7-code 始终思考，传 thinking 会报错"},{id:"minimax",label:"MiniMax",hint:"官方未提供关闭思考的参数，只能保持默认"},{id:"xai",label:"xAI Grok",hint:"reasoning_effort=none 可真正关闭"},{id:"openrouter",label:"OpenRouter（统一网关）",hint:"统一 reasoning 字段；标记 mandatory 的模型不接受关闭"},{id:"siliconflow",label:"SiliconFlow（硅基流动）",hint:"R1 类纯推理模型无法关闭"},{id:"ollama",label:"Ollama（本地，OpenAI 兼容）",hint:"本地兼容层用 reasoning_effort；GPT-OSS 无法完全关闭"}];function qd(t){return ai.find(e=>e.id===t)?.label||t||"自动识别"}function oo(t){return ai.find(e=>e.id===t)?.hint||""}let se=!1,Wi=!1,Za="",$e=null,Ve=null,pt=0,_t=null,Lt=null,X=null,zt=-1,fa=0,es=null,vt=!1;const ts=[];let et=null,gn=0;const Gi=5;let le=null,ea=!1,De=null,Me=null,Ki=null,Qe=null,It=null,nt=null;const Rt="idle",Nt="loading";let Ce=Rt,ft=null,ht=!1,ns=0,Ds=0;const Yi=1500,Bd=12e3;async function Fd(){if(Wi)return se;if(Wi=!0,!k())return!1;try{const t=await v.playerAvailable();se=t?.available===!0,Za=t?.reason||"",se||console.warn("[audio] 后端音频不可用，回退到 <audio> 播放：",Za||"未知原因")}catch(t){se=!1,Za=t?.message||String(t),console.warn("[audio] 探测后端音频失败，回退到 <audio> 播放",t)}return se}pl(()=>{if(se&&i.currentId)return!0;const t=document.getElementById("audio-engine");return!!(t&&t.src)});fl(t=>Wd(t));function Ud(){k()&&(ts.push(U("player:state",t=>{t&&lo(t)})),ts.push(U("player:error",t=>{t&&Sa(t.songId||i.currentId,t.reason,"backend")})),ts.push(U("player:ended",()=>{uo()})),es&&clearInterval(es),es=setInterval(Hd,250))}function lo(t){if(vt)return;const e=Number(t.durationMs)||0,n=Number(t.positionMs)||0;X={positionMs:n,atMs:Number(t.atMs)||0,durationMs:e,playing:t.playing===!0,at:performance.now()},_t=X.playing;let a=!1;e>0&&i.duration!==e&&(i.duration=e,a=!0),i.playing!==X.playing&&(i.playing=X.playing,a=!0),co(n,!0),a?$():Be()}function Hd(){if(!X||!se||!i.currentId||vt)return;let t=X.positionMs;X.playing&&(t=X.positionMs+(performance.now()-X.at)),X.durationMs>0&&(t=Math.min(t,X.durationMs)),co(t,!1)}function co(t,e){if(!Number.isFinite(t)||t<0)return;const n=Math.round(t);!e&&Math.round(n/250)===Math.round(zt/250)||(zt=n,i.position=n,Ir(n),i.config.resumeProgress===!0&&performance.now()-fa>5e3&&(fa=performance.now(),Ar()),Be())}function uo(){if(i.sleepTimer?.type==="after-song"){Ft(!0);return}if(i.playMode==="loop-one"){Jd(0);return}Ft(!0)}async function si(){if(se)try{await v.playerSetPlaybackOptions(i.config.skipSilenceHead===!0,i.config.skipSilenceTail===!0,Number(i.config.trackGapSeconds)||0)}catch(t){console.warn("[audio] 同步跳过静音/切歌间隔失败",t)}}async function ii(){if(!se)return;const t=i.config.effectPreset||"off";try{const e=await v.playerSetEffect(t);e&&typeof e.preset=="string"&&e.preset!==t&&(console.warn(`[audio] 音效档位 ${t} 非法，后端收敛为 ${e.preset}`),i.config.effectPreset=e.preset,$?.())}catch(e){console.warn("[audio] 同步音效档位失败",e)}}let zd=null;function Sa(t,e,n="unknown"){const a=t?We(t)||ze():ze(),s=a?.id||t||null,r=a?.title||s||"当前歌曲",o=String(e||"").trim()||"未知原因";if(s&&s===et){console.warn(`[audio] 忽略重复的播放失败报告（${n}）：${r}`);return}s&&(et=s),console.warn(`[audio] 播放失败（${n}）：${r} —— ${o}`),Vd(a,o),Ve===s&&(Ve=null),$e===s&&($e=null),X=null,_t=null,gn+=1;const l=gn>=Gi,c=!l&&i.playing&&i.sleepTimer?.type!=="after-song"&&i.playMode!=="loop-one";if(l){i.playing=!1,$(),et=null,gn=0,u(`连续 ${Gi} 首都无法播放（${o}），已停止自动跳过`,{tone:"error",duration:8e3});return}if(u(`无法播放：${r}（${o}）${c?"，已跳到下一首":""}`,{tone:"error",duration:5e3}),!c){i.playing&&(i.playing=!1,$());return}Ft(!0)}function jd(){gn=0,et=null}function Vd(t,e){if(!(!k()||!t?.id)&&!t.online)try{v.unplayableReport(t.id,String(e||""),t.path||"").then(()=>{ul(t.id)}).catch(n=>{console.warn("[audio] 登记「放不出来」失败（不影响播放）",n)})}catch(n){console.warn("[audio] 登记「放不出来」失败（不影响播放）",n)}}function Wd(t){(!t||t===et)&&(et=null,gn=0)}async function Gd(){if(!k())return;if(!se){await su();return}const t=ze();if(!t){$e!==null&&await Kd();return}if($e!==t.id){if(t.id===et)return;await Yd(t);return}Qd()}async function Kd(){vt=!1,$e=null,Ve=null,_t=null,X=null,zt=-1;try{await v.playerUnload()}catch{}}async function Yd(t){$e=t.id;const e=++pt;X=null,zt=-1,vt=!0;try{await v.playerCancelGap()}catch{}if(e===pt){nt=null,await ha(null);try{const n=await v.playerLoad(t.id);if(e!==pt)return;jd(),Ve=t.id,n?.durationMs>0&&(i.duration=n.durationMs),zd={headMs:Number(n?.skippedHeadMs)||0,tailMs:Number(n?.skippedTailMs)||0};const a=ho(t);a>0&&await v.playerSeek(a),await ha(t.id),await ri(),nt=fo(),li(t.id),i.playing&&await v.playerPlay(),_t=!!i.playing;const s=await v.playerState();if(e!==pt)return;vt=!1,s&&lo(s)}catch(n){if(e!==pt)return;$e=null,Ve=null,vt=!1,Sa(t.id,n?.message??"装载失败","load")}}}function Xd(){return vt}async function Qd(){const t=!!i.playing;if(_t!==t)try{t?await v.playerPlay():await v.playerPause(),_t=t}catch(e){console.warn("[audio] 同步播放状态失败",e)}}async function Jd(t){if(!se)return;const e=Math.max(0,t);X&&(X={...X,positionMs:e,at:performance.now()}),zt=-1;try{await v.playerSeek(e),await v.playerPlay(),_t=!0}catch(n){console.warn("[audio] 重新起播失败",n)}}function po(){const e=10**(oi(i.currentId)/20);return(i.muted?0:i.volume)*e}function fo(){const e=10**(oi(Ve)/20);return(i.muted?0:i.volume)*e}function Ms(){if(!se){Ca();return}ri()}async function ri(){try{await v.playerSetVolume(i.volume??1,i.muted===!0)}catch(t){console.warn("[audio] 同步音量失败",t)}}function oi(t){if((i.config.loudnessMode||"off")==="off"||!t)return 0;const n=i.loudnessGains?.[t];return Number.isFinite(n)?n:0}async function ha(t){const e=oi(t);try{await v.playerSetLoudness(e)}catch(n){console.warn("[audio] 同步响度补偿失败",n)}}function jt(){if(!se){ru();return}const t=fo();t!==nt&&(nt=t,ri(),ha(Ve))}function Ee(t){dl(t),Zd(t)}function Zd(t){if(!k())return;const e=Math.max(0,Math.min(t,i.duration||0));if(X&&(X={...X,positionMs:e,at:performance.now()}),zt=e,!se){ou(t);return}v.playerSeek(e).catch(n=>{console.warn("[audio] 跳转失败",n)})}function eu(){if(!se){const t=lu(dc);return t?{bands:t,at:performance.now()}:null}return cc()}const Bn=new Map;async function li(t){const e=i.config.loudnessMode||"off";if(e==="off"||!k()||!t)return;if(i.loudnessGains?.[t]!==void 0){se&&Ve===t&&ha(t);return}if(Bn.has(t))return Bn.get(t);const n=(async()=>{try{const a=i.config.loudnessTarget??-16,s=await v.loudnessLookup(t,a);if(s?.measured){Xi(t,s.gainDB);return}if(e==="album")return;const r=await v.loudnessMeasure(t,a);r?.measured&&Xi(t,r.gainDB??tu(r,a))}catch(a){console.warn("[audio] 响度补偿获取失败",a)}finally{Bn.delete(t)}})();return Bn.set(t,n),n}function tu(t,e){if(!t?.integrated)return 0;let n=e-t.integrated;if(t.truePeak){const a=-1-t.truePeak;n>a&&(n=a)}return n>24&&(n=24),n<-24&&(n=-24),Math.round(n*100)/100}function Xi(t,e){i.loudnessGains||(i.loudnessGains={}),i.loudnessGains[t]=e,t===Ve&&(se?jt():Ca()),Be()}async function nu(){const t=i.config.loudnessTarget??-16;if(i.loudnessGains={},jt(),Be(),!!k())try{await v.loudnessInvalidateTarget(t)}catch(e){console.warn("[loudness] 失效旧补偿失败",e)}}async function xa(){if(!k())return;const t=i.config.loudnessMode||"off";if(t==="off"){i.loudnessGains={},jt();return}const e=i.config.loudnessTarget??-16;try{const n=t==="album"?await v.loudnessAlbumGains(e):await v.loudnessGainMap(e);i.loudnessGains=n||{},jt(),Be(),t==="track"&&i.currentId&&li(i.currentId)}catch(n){console.warn("[loudness] 拉取补偿增益失败",n)}}async function yn(){if(!k())return null;try{const t=await v.loudnessState();return t&&(i.loudnessState=t),t}catch{return null}}function ho(t){const e=Number(i.pendingResumeMs)||0;if(i.pendingResumeMs=0,!e||i.config.resumeProgress!==!0)return 0;const n=t?.duration||i.duration||0;return n&&e>=n-3e3?0:e}function mo(){return le||(le=document.getElementById("audio-engine"),le||(le=document.createElement("audio"),le.id="audio-engine",le.preload="auto",le.hidden=!0,document.body.appendChild(le)),le.crossOrigin="anonymous",au(le),le)}function au(t){t.dataset.bound!=="1"&&(t.dataset.bound="1",t.addEventListener("loadedmetadata",()=>{if(Number.isFinite(t.duration)&&t.duration>0&&(i.duration=t.duration*1e3,Be(),$()),Lt!=null){const e=Lt;Lt=null;try{t.currentTime=Math.max(0,Math.min(e,i.duration||0)/1e3)}catch{}}vo(t)}),t.addEventListener("timeupdate",()=>{document.getElementById("progress")?.dataset.dragging!=="true"&&(i.position=t.currentTime*1e3,Ir(i.position),i.config.resumeProgress===!0&&performance.now()-fa>5e3&&(fa=performance.now(),Ar()),Be())}),t.addEventListener("play",()=>{Ce!==Nt&&(ht=!1,i.playing=!0,De?.state==="suspended"&&De.resume().catch(()=>{}),Be())}),t.addEventListener("pause",()=>{if(ht){ht=!1;return}if(Ce===Nt||t.ended)return;const e=Number.isFinite(t.duration)&&t.duration>0?t.duration*1e3:i.duration||0;e&&(Number.isFinite(t.currentTime)?t.currentTime*1e3:i.position)>=e-300||ns&&performance.now()-ns<Yi||(i.playing=!1,Be())}),t.addEventListener("ended",()=>{ns=performance.now(),uo()}),t.addEventListener("error",()=>{Ce=Rt,ht=!1;const e=ze();if(!e||Ds&&performance.now()-Ds<Yi||!t.error||!t.error.code)return;const n=t.error?.code,a=n===4?"格式无法播放（解码失败）":n===3?"音频数据损坏":n===2?"网络中断":"音频加载失败";Sa(e.id,a,"legacy")}))}async function su(){const t=mo(),e=ze();if(!e){$e!==null&&(t.pause(),t.removeAttribute("src"),t.load(),$e=null,Ce=Rt);return}if($e!==e.id){if(e.id===et)return;$e=e.id,Ce=Nt,ht=!1,ft&&clearTimeout(ft),ft=setTimeout(()=>{ft=null,Ce===Nt&&vo(le)},Bd);const n=++pt;let a=null;try{a=e.streamUrl||await v.mediaUrl(e.id)}catch(s){Ce=Rt,$e=null,Sa(e.id,s?.message??"取播放地址失败","legacy-url");return}if(n!==pt)return;if(!a){Ce=Rt;return}Lt=ho(e),t.src=a,Ds=performance.now(),t.load(),iu(t),Ca(),li(e.id),i.playing&&t.paused&&t.play().catch(s=>{const r=s?.name||"";r==="AbortError"||r==="NotAllowedError"||console.warn("[audio] 播放失败",s)});return}Ce!==Nt&&(i.playing&&t.paused?t.play().catch(()=>{}):!i.playing&&!t.paused&&(ht=!0,t.pause()))}function vo(t){if(ft&&(clearTimeout(ft),ft=null),Ce!==Nt)return;Ce=Rt;const e=t||le;e&&(i.playing&&e.paused?e.play().catch(()=>{}):!i.playing&&!e.paused&&(ht=!0,e.pause()))}function iu(t){if(ea)return!1;if(De&&Me)return!0;const e=window.AudioContext||window.webkitAudioContext;if(!e)return ea=!0,!1;try{De=new e,Me=De.createGain(),Me.gain.value=1,Ki=De.createMediaElementSource(t),Ki.connect(Me),Me.connect(De.destination);try{Qe=De.createAnalyser(),Qe.fftSize=512,Qe.smoothingTimeConstant=.76,It=new Uint8Array(Qe.frequencyBinCount),Me.connect(Qe)}catch{Qe=null,It=null}return nt=null,!0}catch(n){return console.warn("[audio] Web Audio 链路建立失败，退回元素音量",n),ea=!0,!1}}function Ca(){const t=le,e=po();if(De&&Me&&!ea){const n=De.currentTime;try{Me.gain.cancelScheduledValues(n),Me.gain.setTargetAtTime(e,n,.015)}catch{Me.gain.value=e}t&&(t.volume=1),nt=e;return}t&&(t.volume=Math.max(0,Math.min(1,e))),nt=e}function ru(){po()!==nt&&Ca()}function ou(t){const e=mo();if(!e.src){Lt=t;return}const n=Math.max(0,Math.min(t,i.duration||0))/1e3;try{e.currentTime=n}catch{Lt=t}}function lu(t=32){if(!Qe||!It)return null;Qe.getByteFrequencyData(It);const e=Math.max(1,Math.min(128,Math.floor(t)||32)),n=new Float32Array(e),a=It.length;for(let s=0;s<e;s+=1){const r=Math.floor(a*(s/e)**1.7),o=Math.min(a,Math.max(r+1,Math.floor(a*((s+1)/e)**1.7)));let l=0;for(let c=r;c<o;c+=1)l+=It[c];n[s]=l/((o-r)*255)}return n}const cu={itunes:"iTunes",netease:"网易云音乐",qq:"QQ 音乐",deezer:"Deezer",musicbrainz:"MusicBrainz",lrclib:"LRCLIB",kugou:"酷狗音乐",kuwo:"酷我音乐",migu:"咪咕音乐"},du=["itunes","netease","qq","deezer","musicbrainz"];function Ps(t){const e=String(t||"").trim().toLowerCase();return cu[e]||String(t||"")}function ci(t,e=""){const n=Array.isArray(t)?t.filter(Boolean):[];return n.length?n.map(a=>Ps(a)).join(" / "):e}function bo(){return ci(du)}const uu="../bindings/localmusicplayer/index.js";let Fn=null;async function as(){if(Fn)return Fn;try{const t=await import(uu);Fn=t&&t.OnlineService?t.OnlineService:null}catch(t){console.info("[online] backend unavailable",t)}return Fn}const pu=new Set(["m4a","mp4","m4b","alac","aac","flac"]);let K="online";const g={songId:"",title:"",lines:[],cursor:0,undo:[],dirty:!1,kept:0,stale:!1};class fu extends ge{static deps=e=>[e.lyricsOpen,e.currentId,e.playing,K,go,i.config.embedMeta];constructor(){super(),this._nowIndex=-1,this._onlineError="",this._searched=!1,this._candidates=[],this._searching=!1,this._onlineKeyword="",this._lastNowPaint=0,this._lastNudgeActive=-1,this._lastScrolledNow=-1,this._lastScrolledCursor=-1,this._followHold=0,this._followAutoUntil=0,this._lastOnlineHint="在线歌词来源"}onConnected(){this._onKeyDownCapture=e=>this.onPanelKeyDown(e),document.addEventListener("keydown",this._onKeyDownCapture,!0),this._unsubscribers.push(ga(()=>{this.open&&(K==="nudge"?this.paintNudgeFollow():K==="edit"&&this.paintEditorFollow())}))}onDisconnected(){document.removeEventListener("keydown",this._onKeyDownCapture,!0)}get open(){return i.lyricsOpen===!0}get panelEl(){return this.querySelector("#lyrics-panel")}updated(){const e=this.panelEl;e&&(e.hidden=!this.open,e.dataset.open=this.open?"true":"false",this.open&&(K==="nudge"&&this.paintNudgeFollow(),K==="edit"&&this.paintEditorFollow()))}_refreshHeader(){B()}render(){const e=we(),n=e.song,a=e.lines.some(s=>Array.isArray(s.words)&&s.words.length>0);return d`
      <section
        class="lyricspanel"
        id="lyrics-panel"
        role="dialog"
        aria-label="歌词工作台"
        data-open=${this.open?"true":"false"}
        data-tab=${K}
        hidden
        @click=${s=>this.onClick(s)}
        @input=${s=>this.onInput(s)}
      >
        <header class="lyricspanel__head">
          <img class="lyricspanel__cover" data-song-cover alt="" src=${n?wt(n):A} />
          <div class="lyricspanel__meta">
            <div class="lyricspanel__title" data-song-title>${n?n.title||"未命名":"未在播放"}</div>
            <div class="lyricspanel__sub">
              <span
                class="lyricspanel__badge${e.text?"":" is-empty"}"
                data-song-source
                data-src=${e.source}
              >
                ${e.status==="matching"||e.status==="loading"?"歌词匹配中…":e.status==="failed"?"歌词匹配失败":`${sr(e.source)}${a?" · 逐字":""}`}
              </span>
              <span class="lyricspanel__artist" data-song-artist>${n&&n.artist||""}</span>
            </div>
          </div>
          <button
            class="lyricspanel__close u-hit"
            type="button"
            data-act="close"
            aria-label="关闭"
            @click=${()=>Os()}
          >
            ${f("close")}
          </button>
        </header>

        <nav class="lyricspanel__tabs" role="tablist">
          ${["online","nudge","edit"].map(s=>d`
              <button
                class="lyricspanel__tab${K===s?" is-active":""}"
                type="button"
                role="tab"
                data-tab=${s}
                aria-selected=${String(K===s)}
                @click=${()=>tn(s)}
              >
                ${s==="online"?"在线匹配":s==="nudge"?"微调":"手动编辑"}
              </button>
            `)}
        </nav>

        ${this.noticeTemplate(e)}
        <div class="lyricspanel__body">
          ${this.open?d`${this.onlinePane()} ${this.nudgePane(e)} ${this.editPane()}`:A}
        </div>
      </section>
    `}noticeTemplate(e){const n=K==="nudge"||K==="edit",a=e.source==="embedded"||e.source==="lrc-file";if(!n||!a)return A;const s=sr(e.source),r=mu(e.song),o=pu.has(r);return d`
      <div class="lyricspanel__notice" data-notice>
        <div class="lyricspanel__notice-text" data-notice-text>
          ${o?d`这首歌的歌词来自「${s}」，它的优先级高于歌词缓存：只保存到缓存的话，下次打开仍会显示旧歌词。建议同时写入歌曲文件。`:d`这首歌的歌词来自「${s}」，它的优先级高于歌词缓存；而 ${r?"."+r:"该格式"}
                不支持写入歌词标签，所以本次改动只在<b>本次运行内</b>生效（重启后会变回旧歌词）。`}
        </div>
        ${o?d`<label class="lyricspanel__notice-opt" data-notice-opt>
                <input type="checkbox" data-embed-toggle checked />
                <span>同时写入歌曲文件（否则下次打开仍显示旧歌词）</span>
              </label>`:A}
      </div>
    `}onlinePane(){return d`
      <section class="lyricspanel__pane" data-pane="online" ?hidden=${K!=="online"}>
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
    `}onlineResults(){if(this._searching)return d`
        <div class="lyricspanel__state" data-online-state="searching">
          <span class="lyricspanel__spinner"></span>
          <div class="lyricspanel__state-title">正在搜索歌词</div>
          <div class="lyricspanel__state-desc">正在已启用的在线歌词来源里查找候选…</div>
        </div>
      `;if(this._onlineError)return d`
        <div class="lyricspanel__state lyricspanel__state--error" data-online-state="error">
          ${f("warning")}
          <div class="lyricspanel__state-title">搜索失败</div>
          <div class="lyricspanel__state-desc">在线歌词来源没有响应。检查网络后重试，或者切到「手动编辑」自己贴一份。</div>
          <div class="lyricspanel__state-detail">${this._onlineError}</div>
          <div class="lyricspanel__state-actions">
            <button class="btn btn--sm" type="button" data-act="lyrics-search" @click=${()=>this.searchLyrics()}>
              重试
            </button>
            <button class="btn btn--sm" type="button" @click=${()=>tn("edit")}>手动编辑歌词</button>
          </div>
        </div>
      `;if(this._candidates.length)return Te(this._candidates,(e,n)=>`${e.provider||""}-${e.id||n}`,(e,n)=>d`
          <div class="candidate">
            <div class="candidate__main">
              <div class="candidate__title">${(e.title||"未命名")+" - "+(e.artist||"未知")}</div>
              <div class="candidate__sub">
                ${(e.provider||"")+" · score "+(e.score||0)+" · "+At(e.duration)}
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
        `);if(this._searched){const e=nn()?.title||"",n=!!e&&e!==this._onlineKeyword;return d`
        <div class="lyricspanel__state" data-online-state="empty">
          ${f("lyrics")}
          <div class="lyricspanel__state-title">没有找到候选歌词</div>
          <div class="lyricspanel__state-desc">
            换个更短的关键词通常更有效（只留歌名、去掉括号里的后缀）。
          </div>
          <div class="lyricspanel__state-actions">
            ${n?d`<button class="btn btn--sm" type="button" @click=${()=>this.retryWithTitle()}>
                    只用歌名重搜
                  </button>`:A}
            <button class="btn btn--sm" type="button" @click=${()=>tn("edit")}>手动编辑歌词</button>
          </div>
        </div>
      `}return d`
      <div class="lyricspanel__state" data-online-state="idle">
        ${f("search")}
        <div class="lyricspanel__state-title">还没有开始搜索</div>
        <div class="lyricspanel__state-desc">搜索框里已经填好了当前歌曲，点「搜索」或按回车就能在线匹配歌词。</div>
        <div class="lyricspanel__state-actions">
          <button class="btn btn--sm btn--primary" type="button" data-act="lyrics-search" @click=${()=>this.searchLyrics()}>
            搜索歌词
          </button>
        </div>
      </div>
    `}async retryWithTitle(){const e=nn()?.title?.trim();e&&(this._onlineKeyword=e,B(),await this.searchLyrics())}nudgePane(e){const n=e.songId?qt(e.songId):0,a=n<0?e.lines.filter(r=>r.time+n<0).length:0,s=di();return d`
      <section class="lyricspanel__pane lyricspanel__pane--nudge" data-pane="nudge" ?hidden=${K!=="nudge"}>
        <div class="nudge__bar">
          <span class="nudge__label">偏移</span>
          <b class="nudge__value" data-nudge-value>${(n>0?"+":"")+(n/1e3).toFixed(2)} 秒</b>
          <span class="nudge__dirty" data-nudge-dirty ?hidden=${n===0}>未应用</span>
          <span class="nudge__warn" data-nudge-clamp ?hidden=${a===0}>
            ${a?`有 ${a} 行被压到 0:00`:""}
          </span>
          <span class="nudge__spacer"></span>
          <div class="nudge__steps">
            ${[-1e3,-500,-100,100,500,1e3].map(r=>d`<button
                  class="btn btn--sm"
                  type="button"
                  data-act="nudge-step"
                  data-delta=${r}
                  @click=${()=>ss(r)}
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
            @click=${()=>ss(500)}
          >
            歌词快了 ${f("arrow-right")} 延后 0.5s
          </button>
          <button
            class="btn btn--sm nudge__feel"
            type="button"
            data-act="nudge-feel"
            data-delta="-500"
            data-tip="歌词出现得太晚：整体往前挪 0.5 秒"
            @click=${()=>ss(-500)}
          >
            歌词慢了 ${f("arrow-left")} 提前 0.5s
          </button>
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
            @input=${r=>Zi(Number(r.target.value))}
          />
        </div>
        <div class="lyricspanel__list nudge__preview" data-nudge-preview @scroll=${()=>this.onFollowScroll()}>
          ${this.nudgePreview(e,n)}
        </div>
        <div class="lyricspanel__foot">
          <button class="btn btn--sm" type="button" data-act="nudge-reset" @click=${()=>vu()}>重置</button>
          <button
            class="btn btn--sm"
            type="button"
            data-act="nudge-guide"
            data-tip="微调介绍与使用指引"
            @click=${()=>bu()}
          >
            ${f("info")}说明
          </button>
          <span class="nudge__spacer"></span>
          <button class="btn btn--primary" type="button" data-act="nudge-apply" @click=${()=>this.applyNudge()}>
            应用到歌词
          </button>
        </div>
      </section>
    `}nudgePreview(e,n){if(!e.text)return d`
        <div class="lyricspanel__state">
          ${f("lyrics")}
          <div class="lyricspanel__state-title">这首歌还没有歌词</div>
          <div class="lyricspanel__state-desc">先用「在线匹配」找一份，或者切到「手动编辑」自己贴一份。</div>
          <div class="lyricspanel__state-actions">
            <button class="btn btn--sm" type="button" @click=${()=>tn("online")}>去在线匹配</button>
            <button class="btn btn--sm" type="button" @click=${()=>tn("edit")}>去手动编辑</button>
          </div>
        </div>
      `;const a=e.lines,s=Ji(a,n);return Te(a,(r,o)=>o,(r,o)=>{const l=Math.max(0,r.time+n);return d`
          <div
            class="nudge__line${o===s?" is-active":""}"
            data-act="nudge-seek"
            data-ms=${l}
            data-index=${o}
          >
            <span class="nudge__time">${Wn(l).slice(1,-1)}</span>
            <span class="nudge__text">${un(r)}</span>
          </div>
        `})}paintNudgeFollow(){if(K!=="nudge")return;const e=this.querySelector("[data-nudge-preview]");if(!e)return;const n=we();if(!n.lines.length)return;const a=this._nudgeBox!==e;this._nudgeBox=e;const s=n.songId?qt(n.songId):0,r=Ji(n.lines,s);if(!a&&r===this._lastNudgeActive)return;this._lastNudgeActive=r;const o=e.querySelectorAll(".nudge__line");if(!o.length)return;let l=null;o.forEach(c=>{const p=Number(c.dataset.index)===r;c.classList.toggle("is-active",p),p&&(l=c)}),l&&this.followScroll(e,l,a)}editPane(){const e=g.lines.filter(o=>typeof o.time=="number").length,n=wo(),a=g.lines.length-e,s=n?`草稿属于《${We(g.songId)?.title||"上一首"}》`:a>0&&e>0?`还有 ${a} 行没有时间`:"",r=n?"已切歌，草稿仍属于上一首":g.kept>0?`已沿用 ${g.kept} 行原有时间`:g.dirty?"未保存":"";return d`
      <section class="lyricspanel__pane" data-pane="edit" ?hidden=${K!=="edit"}>
        <div class="editor__source">
          <button
            class="btn btn--sm"
            type="button"
            data-act="editor-text-open"
            data-tip="粘贴 / 修改歌词文本"
            @click=${()=>$u()}
          >
            ${f("edit")}编辑歌词文本
          </button>
          <span class="lyricspanel__hint" data-editor-source>
            ${g.lines.length?`共 ${g.lines.length} 行`:"还没有歌词文本"}
          </span>
          <span class="editor__spacer"></span>
          <button class="btn btn--sm" type="button" data-act="editor-clear-times" @click=${()=>wu()}>
            清空全部时间
          </button>
        </div>

        <div class="editor__transport">
          <button
            class="btn btn--icon"
            type="button"
            data-act="editor-play"
            data-tip="播放 / 暂停"
            @click=${()=>xu()}
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
          <button class="btn btn--sm" type="button" data-act="editor-fwd" @click=${()=>Ee(i.position+5e3)}>
            +5s
          </button>
          <span class="editor__clock" data-editor-clock>${Wn(i.position).slice(1,-1)}</span>
          <span class="editor__spacer"></span>
          <span class="lyricspanel__hint" data-editor-progress>已打轴 ${e} / ${g.lines.length}</span>
        </div>

        <button class="editor__tap" type="button" data-act="editor-tap" @click=${()=>is()}>
          <span class="editor__tap-main">打轴并下一行</span>
          <span class="editor__tap-hint"><kbd>空格</kbd> 或点这里</span>
        </button>

        <div class="editor__tools">
          <button class="btn btn--sm" type="button" data-act="editor-undo" @click=${()=>gu()}>撤销</button>
          <button class="btn btn--sm" type="button" data-act="editor-prev" @click=${()=>er(-1)}>
            上一行
          </button>
          <button class="btn btn--sm" type="button" data-act="editor-next" @click=${()=>er(1)}>
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
    `}draftList(){return g.lines.length?Te(g.lines,(e,n)=>n,(e,n)=>{const a=typeof e.time=="number",s=["drow"];return n===g.cursor&&s.push("is-cursor"),a||s.push("is-untimed"),n===this._nowIndex&&s.push("is-now"),d`
          <div class=${s.join(" ")} data-act="editor-cursor" data-i=${n}>
            <span class="drow__no">${n+1}</span>
            <button
              class="drow__time"
              type="button"
              data-act="edit-seek"
              data-i=${n}
              data-tip="跳到这一句"
              @click=${r=>{r.stopPropagation(),ku(n)}}
            >
              ${a?Wn(e.time).slice(1,-1):"未打轴"}
            </button>
            <span class="drow__text">${e.text}</span>
            <button
              class="drow__clear"
              type="button"
              data-act="edit-clear"
              data-i=${n}
              aria-label="清除这一行的时间"
              ?hidden=${!a}
              @click=${r=>{r.stopPropagation(),_u(n)}}
            >
              ${f("close")}
            </button>
          </div>
        `}):d`<div class="editor__empty">还没有歌词文本。点上面的「编辑歌词文本」粘贴一份，或载入这首歌已有的歌词。</div>`}onClick(e){const n=e.target.closest("[data-act], [data-tab]");if(!n||!this.contains(n))return;const a=n.dataset.act,s=Number(n.dataset.i);switch(a){case"close":Os();return;case"nudge-seek":Ee(Number(n.dataset.ms));return;case"editor-cursor":yu(s);return;case"editor-tap":is();return}}onInput(e){const n=e.target;n.matches('[data-act="nudge-range"]')&&Zi(Number(n.value))}onPanelKeyDown(e){if(!this.open||K!=="edit"||e.key!==" "||e.ctrlKey||e.metaKey||e.altKey)return;const n=e.target;n&&(n.tagName==="TEXTAREA"||n.tagName==="INPUT")||this.contains(n)&&(e.preventDefault(),e.stopPropagation(),is())}onFollowScroll(){Date.now()<this._followAutoUntil||(this._followHold=Date.now()+4e3)}followScroll(e,n,a=!1){if(!e||!n||!a&&Date.now()<this._followHold)return;const s=e.getBoundingClientRect(),r=n.getBoundingClientRect(),o=Math.max(0,e.scrollTop+(r.top-s.top)-(e.clientHeight-r.height)/2);Math.abs(e.scrollTop-o)<2||(this._followAutoUntil=Date.now()+700,e.scrollTo({top:o,behavior:"smooth"}))}prefillOnlineKeyword(){const e=nn();if(!e)return;const n=[e.title,e.artist].filter(Boolean).join(" ").trim();!n||n===this._onlineKeyword||(this._onlineKeyword=n,B())}async refreshOnlineHint(){const e=await as();if(e)try{const n=await e.LyricsProviders?.(),a=Array.isArray(n?.providers)?n.providers:[];a.length&&(this._lastOnlineHint="在线歌词来源："+ci(a),B())}catch{}}async searchLyrics(){const e=(this._onlineKeyword||"").trim();if(!e){u("请输入歌词搜索关键词",{duration:1500});return}const n=await as();if(!n){this._candidates=[],this._onlineError="在线歌词服务不可用（需要应用后端）",this._searched=!0,B();return}const a=nn();this._searching=!0,this._onlineError="",B();try{const s=await n.SearchLyrics(e,a?a.title:"",a?a.artist:"",a?a.duration:0);this._candidates=Array.isArray(s)?s:[]}catch(s){this._candidates=[],this._onlineError=String(s?.message||s)}finally{this._searching=!1,this._searched=!0,B()}}async applyCandidate(e){const n=this._candidates[e];if(!n)return;const a=nn();if(!a){u("请先播放一首歌曲",{tone:"warning"});return}const s=await as();if(!s){u("在线歌词服务暂不可用，请稍后再试",{tone:"error"});return}try{const r=await s.FetchLyrics(n.provider,n.id);if(!r||!r.lrc){u("没有取到歌词",{tone:"warning"});return}const o=await os(a.id,r.lrc,r.source||"online",{embed:i.config.embedMeta===!0});bt(a.id,0),g.songId="",u(o?.note||"歌词已应用并保存",{tone:"success",duration:2e3}),B()}catch(r){u("获取歌词失败："+(r.message||r),{tone:"error"})}}async applyNudge(){const e=we();if(!e.songId){u("请先播放一首歌曲",{tone:"warning"});return}const n=qt(e.songId);if(!n){u("当前没有需要应用的调整",{duration:1800});return}if(!e.text){u("这首歌还没有歌词",{tone:"warning"});return}const a=uc(e.text,n),s=await os(e.songId,a,"edit:offset",{embed:Qi(e,this)});s!==!1&&(bt(e.songId,0),B(),u(s?.note||"已应用并保存",{tone:"success",duration:2600}))}async ensureDraft(e=!1){const n=we();!e&&g.songId===n.songId&&g.lines.length||(g.songId=n.songId,g.title=n.song?.title||"",g.lines=n.text?Ci(n.text):[],g.cursor=0,g.undo=[],g.dirty=!1,g.kept=0,g.stale=!1,this._nowIndex=-1,this._lastScrolledNow=-1,this._lastScrolledCursor=-1,this._followHold=0,this._followAutoUntil=0,B())}applyDraftText(e){const n=Ci(e||""),a=pc(g.lines,n);if(!a.length)return u("文本是空的，没有可应用的歌词",{duration:1800}),!1;const s=a.filter((r,o)=>typeof r.time=="number"&&!(n[o]&&typeof n[o].time=="number")).length;return Ta(),g.lines=a,g.cursor>=a.length&&(g.cursor=Math.max(0,a.length-1)),g.dirty=!0,g.kept=s,g.songId||(g.songId=we().songId),this._nowIndex=-1,this._lastScrolledNow=-1,this._lastScrolledCursor=-1,B(),u(s?`已应用文本，沿用了 ${s} 行原有时间`:"已应用文本",{duration:2e3}),!0}setDraftText(e){const n=document.querySelector("#modal-backdrop [data-editor-text]");n&&(n.value=e),B()}async saveDraft(){const e=we(g.songId);if(!e.songId){u("还没有可保存的内容：先播放一首歌再编辑",{tone:"warning"});return}const n=g.lines.filter(c=>typeof c.time=="number"&&Number.isFinite(c.time));if(!n.length){u("至少要先给一行打上时间",{tone:"warning"});return}const a=g.lines.length-n.length;let s=!1,r=-1/0;for(const c of g.lines)if(typeof c.time=="number"){if(c.time<r){s=!0;break}r=c.time}if(a||s){const c=d`
        ${a?d`<div class="lyricspanel__hint">
                还有 <b>${a}</b> 行没有时间：LRC 里没有时间标签的行会被忽略，保存后这些行不会显示。
              </div>`:A}
        ${s?d`<div class="lyricspanel__hint">时间不是升序，播放时高亮可能会跳来跳去。</div>`:A}
      `;if(!await Cu({title:a?"还有歌词没有打轴":"时间不是升序",body:c,okText:"继续保存",cancelText:"返回编辑"}))return}const o=Ti(g.lines),l=await os(e.songId,o,"manual",{embed:Qi(e,this)});l!==!1&&(bt(e.songId,0),g.undo=[],g.dirty=!1,g.songId=e.songId,B(),u(l?.note||"歌词已保存",{tone:"success",duration:2600}))}async copyLrc(){const e=Ti(g.lines);if(!e){u("还没有可复制的歌词",{duration:1800});return}try{await navigator.clipboard.writeText(e),u("LRC 已复制到剪贴板",{tone:"success"})}catch{const n=document.createElement("textarea");n.value=e,n.style.cssText="position:fixed;left:-9999px;top:0;",document.body.appendChild(n),n.select();let a=!1;try{a=document.execCommand("copy")}catch{a=!1}n.remove(),u(a?"LRC 已复制到剪贴板":"复制失败，请手动选中文本",{tone:a?"success":"warning"})}}paintNowRow(){const e=performance.now();if(e-this._lastNowPaint<200)return;this._lastNowPaint=e;let n=-1;for(let a=0;a<g.lines.length;a+=1){const s=g.lines[a].time;typeof s=="number"&&s<=i.position&&(n=a)}n!==this._nowIndex&&(this._nowIndex=n,B())}paintEditorFollow(){this.paintNowRow(),this.scrollDraftRows()}scrollDraftRows(){const e=this.querySelector("[data-editor-list]");if(e){if(g.cursor!==this._lastScrolledCursor){const n=e.querySelector(`[data-i="${g.cursor}"]`);n&&(this._lastScrolledCursor=g.cursor,this.followScroll(e,n,!0))}if(this._nowIndex!==this._lastScrolledNow){const n=e.querySelector(`[data-i="${this._nowIndex}"]`);n&&this._nowIndex>=0&&(this._lastScrolledNow=this._nowIndex,this.followScroll(e,n))}}}}ie("mp-lyrics-panel",fu);let go=0;function B(){go+=1,ve()}const at=()=>document.querySelector("mp-lyrics-panel");function hu(t){i.lyricsOpen=!0,B();const e=at();e&&(e._refreshHeader(),e.prefillOnlineKeyword(),Ns().then(()=>{K==="edit"&&e.ensureDraft(!0),K==="online"&&e.refreshOnlineHint(),B()}))}function Os(){i.lyricsOpen=!1;const t=we();t.songId&&qt(t.songId)&&(bt(t.songId,0),u("未应用的微调已丢弃",{duration:1800})),B()}function yo(t){i.lyricsOpen?Os():hu()}function tn(t){K=t==="nudge"||t==="edit"?t:"online";const e=at();e&&(K==="edit"&&e.ensureDraft().then(()=>B()),K==="online"&&e.refreshOnlineHint?.()),B()}function nn(){return We(i.currentId)||null}function mu(t){return String(t?.ext||"").replace(/^\./,"").toLowerCase()}function Qi(t,e){const n=e?.querySelector("[data-embed-toggle]"),a=e?.querySelector("[data-notice-opt]");return(t.source==="embedded"||t.source==="lrc-file")&&a&&n?!!n.checked:i.config.embedMeta===!0}function Ji(t,e){let n=-1;for(let a=0;a<t.length&&t[a].time+e<=i.position;a+=1)n=a;return n}function di(){return{lower:-1e4,upper:1e4}}function ss(t){const e=we();if(!e.songId){u("请先播放一首歌曲",{tone:"warning"});return}if(!e.text){u("这首歌还没有歌词，先去在线匹配或手动编辑",{tone:"warning",duration:2600});return}const n=di(),a=Math.max(n.lower,Math.min(n.upper,qt(e.songId)+t));bt(e.songId,a),B()}function Zi(t){const e=we();if(!e.songId||!e.text)return;const n=di(),a=Math.max(n.lower,Math.min(n.upper,Math.round(Number(t)||0)));bt(e.songId,a),B()}function vu(){const t=we();t.songId&&(bt(t.songId,0),B())}function bu(){W({title:"歌词微调：介绍与指引",body:d`
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
          <div class="lguide__kv"><span class="lguide__k">歌词先出现</span><span>歌词快了 → 点「歌词快了 → 延后 0.5s」</span></div>
          <div class="lguide__kv"><span class="lguide__k">歌词后出现</span><span>歌词慢了 → 点「歌词慢了 → 提前 0.5s」</span></div>
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
            整首歌统一偏移才用微调。两者都改不了「来源优先级」——
            如果这首歌的歌词来自内嵌歌词或同目录 .lrc，界面会提示要不要同时写入歌曲文件。
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
    `,okText:"知道了"}).root.classList.add("modal--wide","modal--scroll","modal--single")}function Ta(){g.undo.push({lines:g.lines.map(t=>({...t})),cursor:g.cursor}),g.undo.length>50&&g.undo.shift()}function gu(){const t=g.undo.pop();if(!t){u("没有可撤销的操作",{duration:1500});return}g.lines=t.lines,g.cursor=Math.min(t.cursor,Math.max(0,t.lines.length-1)),g.dirty=!0,at()?.setDraftText(An()),B()}function An(){return g.lines.map(t=>typeof t.time=="number"?Wn(t.time)+t.text:t.text).join(`
`)}function er(t){if(!g.lines.length)return;const e=Math.max(0,Math.min(g.lines.length-1,g.cursor+t));e!==g.cursor&&(g.cursor=e,B())}function _o(t){!Number.isFinite(t)||t<0||t>=g.lines.length||t===g.cursor||(g.cursor=t,B())}function yu(t){_o(t);const e=g.lines[t];e&&typeof e.time=="number"&&Ee(e.time);const n=at();n&&(n._followHold=Date.now()+4e3)}function is(){if(!g.lines.length){u("先点「编辑歌词文本」把歌词贴进来",{tone:"warning",duration:2600});return}if(wo()){u("已切歌：先决定这份草稿怎么办（保存它，或点「载入当前歌词」重来）",{tone:"warning",duration:4200});return}const t=g.lines[g.cursor];t&&(Ta(),t.time=Math.round(i.position/10)*10,g.dirty=!0,g.cursor<g.lines.length-1&&(g.cursor+=1),at()?.setDraftText(An()),B())}function _u(t){const e=g.lines[t];!e||typeof e.time!="number"||(Ta(),e.time=null,g.dirty=!0,at()?.setDraftText(An()),B())}function wu(){g.lines.length&&(Ta(),g.lines.forEach(t=>{t.time=null}),g.cursor=0,g.dirty=!0,at()?.setDraftText(An()),u("已清空全部时间，可以重新打轴",{duration:2e3}),B())}function $u(){const t=we(),e=g.lines.length?An():t.text||"",n=W({title:"编辑歌词文本",desc:"一行一句，纯文本即可；已经打过轴的行会带上 [mm:ss.xx] 时间标签。改完点「应用文本」回到打轴列表。",body:d`
      <div class="lyricspanel__row lyricspanel__row--between">
        <span class="lyricspanel__hint">共 ${g.lines.length} 行</span>
        <span class="lyricspanel__row-actions">
          <button
            class="btn btn--sm"
            type="button"
            data-act="modal-load"
            @click=${s=>tr(s,t.text||"")}
          >
            载入当前歌词
          </button>
          <button class="btn btn--sm" type="button" data-act="modal-clear" @click=${s=>tr(s,"")}>
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
    `,okText:"应用文本",cancelText:"取消",onOk:(s,r)=>{const o=r.querySelector("[data-editor-text]");return at()?.applyDraftText(o?o.value:"")!==!1}});n.root.classList.add("modal--wide","modal--scroll");const a=n.root.querySelector("[data-editor-text]");a&&(a.value=e)}function tr(t,e){const a=t.target.closest(".modal")?.querySelector("[data-editor-text]");a&&(a.value=e,a.focus())}function ku(t){const e=g.lines[t];if(!e)return;let n=e.time;if(typeof n!="number"){for(let a=t-1;a>=0;a-=1)if(typeof g.lines[a].time=="number"){n=g.lines[a].time;break}}if(typeof n!="number"){u("这一行还没有时间，无法跳转",{duration:1600});return}Ee(n),_o(t)}function wo(){return!!g.songId&&we().songId!==g.songId&&Su()}function Su(){return g.lines.some(t=>typeof t.time=="number")}function xu(){Gt()}function Cu({title:t,body:e,okText:n,cancelText:a}){return new Promise(s=>{let r=!1;const o=l=>{r||(r=!0,s(l))};W({title:t,body:e,okText:n,cancelText:a,onOk:()=>(o(!0),!0),onCancel:()=>(o(!1),!0)})})}function Tu(){return Math.round(Ks()*1.3)}const nr="/skins/",Eu={loading:"歌词匹配中…",matching:"歌词匹配中…",failed:"歌词匹配失败",none:"暂无歌词"},ui=300;class $o extends Map{constructor(e,n){super(n),this.max=e}set(e,n){for(super.has(e)&&super.delete(e),super.set(e,n);this.size>this.max;){const a=super.keys().next();if(a.done)break;super.delete(a.value)}return this}touch(e){if(!super.has(e))return;const n=super.get(e);return this.set(e,n),n}}class Iu extends Set{constructor(e,n){super(n),this.max=e}add(e){if(super.has(e))return this;for(super.add(e);this.size>this.max;){const n=super.values().next();if(n.done)break;super.delete(n.value)}return this}}const me=new $o(ui),Ls=new Iu(ui),rs=new Set;function Au(t,e){if(!t?.id)return;const n=me.get(t.id)||{lines:[],text:"",source:"none"};n.status!==e&&(me.set(t.id,{...n,status:e}),M.lyricsStatus=null,J()?.id===t.id&&be({type:"lyrics",...Re()}))}function J(){return We(i.currentId)}function ar(){const t=i.config.lyricsSources;return!Array.isArray(t)||!t.length?!0:t.includes("online")}async function ko(t){if(!t)return{lines:[],text:"",source:"none",status:"none"};if(me.has(t.id))return me.get(t.id);let e="",n="none";if(me.set(t.id,{lines:[],text:"",source:"none",status:"loading"}),k()){const s=await v.loadLyrics(t.id);s&&typeof s=="object"&&typeof s.lrc=="string"?(e=s.lrc,n=s.source||"backend"):typeof s=="string"&&(e=s,n="backend"),!e&&ar()&&(Au(t,"matching"),e=await Du(t),e&&(n="online"))}if(!e){if(k()){const r=ar()?"failed":"none",o={lines:[],text:"",source:"none",status:r};return me.set(t.id,o),o}const s=i.songs.findIndex(r=>r.id===t.id);e=s===0?hl:s===1?ml:Mu(t),n="preview"}const a={lines:$s(e),text:e,source:n,status:"ok"};return me.set(t.id,a),a}async function Du(t){if(Ls.has(t.id))return"";Ls.add(t.id);try{if(t.online){const n=await v.onlineLyrics(t.title||"",t.artist||"",t.duration||0),a=typeof n?.lrc=="string"?n.lrc:"";return a?(v.lyricsSave(t.id,a,n?.source||"online",!1).catch(()=>{}),a):""}const e=await v.lyricsAutoMatch(t.id);return typeof e?.lrc=="string"?e.lrc:""}catch(e){return console.warn("[lyrics] 在线自动匹配失败",e),""}}function Mu(t){const e=[];for(let n=12;n<Math.max(60,Math.floor((t.duration||18e4)/1e3)-10);n+=9)e.push(`[00:${String(n).padStart(2,"0")}.00]（${t.title} · 暂无歌词文件，接入后端后可读取 .lrc 或内嵌歌词）`);return e.join(`
`)}const Rs=new $o(ui);function qt(t){return Rs.get(t)||0}function bt(t,e){if(!t)return 0;const n=Math.round(Number(e)||0);return n?Rs.set(t,n):Rs.delete(t),M.lyricsText=null,w.skinHost&&J()?.id===t&&be({type:"lyrics",...Re()}),n}let Un={songId:"",offset:0,lines:[]};function Ea(t){const n=(t?me.get(t.id):null)?.lines||[],a=qt(t?.id);if(!a||!n.length)return n;if(Un.songId===t.id&&Un.offset===a)return Un.lines;const s=n.map(r=>{const o={time:r.time+a,text:r.text};return r.trans&&(o.trans=r.trans),r.words&&(o.words=r.words.map(l=>l+a)),o});return Un={songId:t.id,offset:a,lines:s},s}function we(t){const e=t?We(t):J(),n=e?me.get(e.id):null;return{song:e||null,songId:e?.id||"",text:n?.text||"",source:n?.source||"none",status:n?.status||(n?.lines?.length?"ok":"none"),lines:n?.lines||[]}}function sr(t){switch(t){case"embedded":return"内嵌歌词";case"lrc-file":return"同目录 .lrc";case"cache":return"歌词缓存";case"online":return"在线自动匹配";case"manual":return"手动编辑";case"preview":return"预览数据";default:return"暂无"}}async function Ns(){const t=J();if(!(!t||me.has(t.id)||rs.has(t.id))){rs.add(t.id);try{await ko(t)}finally{rs.delete(t.id)}}}function Pu(){const t=J();if(!t)return"";const e=Ea(t);if(!e.length)return"";const n=_a(e,i.position);return n>=0?un(e[n]):""}function Ou(){const t={prev:"",text:"",next:""},e=J();if(!e)return t;const n=Ea(e);if(!n.length)return t;const a=_a(n,i.position);return a<0?t:{prev:un(n[a-1])||"",text:un(n[a])||"",next:un(n[a+1])||""}}async function os(t,e,n="online",a={}){if(!t||!e)return!1;me.set(t,{lines:$s(e),text:e,source:n,status:"ok"}),Ls.add(t),M.lyricsText=null,M.lyricsStatus=null;let s=null;if(!a.transient&&k()){const r=a.embed??i.config.embedMeta===!0;try{const o=await v.lyricsSave(t,e,n,r);s=o||null;const l=typeof o?.lrc=="string"&&o.lrc?o.lrc:e;l!==e&&(me.set(t,{lines:$s(l),text:l,source:n,status:"ok"}),M.lyricsText=null,M.lyricsStatus=null)}catch(o){console.warn("[lyrics] 写入缓存失败",o)}}return w.skinHost&&J()?.id===t&&be({type:"lyrics",...Re()}),s||{ok:!0}}const qs=[],ls=new Set;let ta=null;async function pi(){return ta||(ta=Nu()),ta}async function Lu(){try{await pi()}catch(t){console.warn("[skins] 启动扫描样式失败",t)}return To(),kn()}async function Ru(){if(k()){const t=await v.listSkins();let e="";try{e=String(await v.skinsToken()||"")}catch(n){console.warn("[skins] 读取皮肤访问令牌失败",n)}return{items:Array.isArray(t)?t:[],base:n=>`${nr}${encodeURIComponent(n)}/`,suffix:e?`?t=${encodeURIComponent(e)}`:""}}try{const t=await fetch("/preview-skins/__list.json",{cache:"no-store"});if(!t.ok)throw new Error(`HTTP ${t.status}`);const e=await t.json();return{items:Array.isArray(e)?e:[],base:n=>`/preview-skins/${encodeURIComponent(n)}/`,suffix:""}}catch(t){return console.warn("[skins] 预览模式读取样式清单失败",t),{items:[],base:e=>`${nr}${encodeURIComponent(e)}/`,suffix:""}}}async function Nu(){try{const{items:t,base:e,suffix:n}=await Ru();qs.length=0;const a=new Set;fc();for(const s of t){if(!s?.id||!s?.module||!s?.manifest)continue;const r=e(s.id),o=c=>r+String(c).replace(/^\/+/,"")+n,l=s.manifest?.icon?.file;try{await hc({manifest:s.manifest,moduleUrl:o(s.module),cssUrls:(Array.isArray(s.styles)?s.styles:[]).map(o),iconUrl:l?o(l):"",builtin:s.builtin===!0,source:s.source||""}),s.builtin===!0?mc(vc(s.id)):ls.add(s.id),a.add(s.id)}catch(c){qs.push({id:s.id,reason:c?.message??String(c)}),console.warn(`[skins] 样式「${s.id}」加载失败：`,c)}}for(const s of[...ls])a.has(s)||(ls.delete(s),bc(s))}catch(t){console.warn("[skins] 皮肤目录扫描失败",t)}return kn()}async function fi(){ta=null,await pi(),To()}async function qu(t){await v.deleteSkin(t),await fi();const e=kn().some(n=>n.id===t);return!e&&(i.pvMode===t||i.config.playerViewMode===t)&&Vt(ya("").skin?.id||""),{removed:!e,skinIds:kn().map(n=>n.id)}}function So(){return qs.slice()}let xo=0;function Co(){return xo}function To(){xo+=1,ve()}const w={view:null,stage:null,backgroundRoot:null,skinHost:null,get skin(){return w.skinHost?.skin||null},get mountedId(){return w.skinHost?.mountedId||null},closeTimer:null,resizeObserver:null,themeObserver:null,carouselTimer:null,carouselIndex:0,carouselLastAdvance:0,carouselSongId:null},M={songId:null,cover:null,lyricsText:null,lyricsStatus:null,options:null,playing:null,themeId:null};function hi(){return{position:i.position,duration:i.duration,playing:i.playing,volume:i.volume,muted:i.muted}}function mi(t){if(!t)return[ba];const e=i.coverSets.get(t.id)?.items,n=Array.isArray(e)?e.map(a=>a.preview).filter(Boolean):[];return n.length?n:[wt(t)]}function Bu(t){return t?_a(Ea(t),i.position):-1}function Eo(t){const e=t?me.get(t.id):null,n=Ea(t),a=e?.status||(n.length?"ok":"none");return{lines:n,text:e?.text||"",source:e?.source||"none",status:a,statusText:n.length?"":Eu[a]||"暂无歌词",index:_a(n,i.position)}}function Fu(t){return t?{id:t.id??"",title:t.title||"",artist:t.artist||"",album:t.album||"",duration:t.duration||0,kind:t.online?"online":"local"}:null}function Re(){const t=J(),e=mi(t),n=dt(w.carouselIndex,0,Math.max(0,e.length-1));return{song:Fu(t),cover:e[n]||ba,covers:e,coverIndex:n,lyrics:Eo(t)}}function vi(){return{showLyrics:i.config.showLyrics!==!1,lyricsFontSize:i.config.lyricsFontSize,animations:i.config.animations!==!1,coverCarousel:i.config.coverCarousel===!0,coverCarouselInterval:Ao().seconds,interactive:!0,performanceMode:i.config.skinPerformanceMode==="performance"?"performance":"smooth"}}function Uu(){return Re()}function Io(){return hi()}function Hu(t={}){return{...vi(),...t}}function zu(){return w.skinHost||(w.skinHost=gc({root:w.stage,backgroundRoot:w.backgroundRoot,view:w.view,app:document.getElementById("app"),source:{playback:hi,media:Re,options:vi,env:ju,defaultCover:ba,spectrum:()=>i.playing?eu():null,actions:{seek(t){Ee(t),na({force:!0})},seekBy(t){Ee(Math.max(0,Number(i.position||0)+Number(t||0))),na({force:!0})},seekRatio(t){const e=Math.max(0,Math.min(1,Number(t)||0));i.duration&&(Ee(e*i.duration),na({force:!0}))},togglePlay:Gt,next:()=>Ft(!1),prev:()=>Ys(),toggleLike(){const t=J();t&&mt(t.id)},like(){const t=J();t&&!tt(t.id)&&mt(t.id)},unlike(){const t=J();t&&tt(t.id)&&mt(t.id)},openFolder(){const t=J();t?.path&&v.revealInExplorer(t.path).catch(()=>{})},openCoverPanel(){const t=J();!t||t.online||yt(()=>Promise.resolve().then(()=>yi),[]).then(e=>e.openCoverPanel(t.id))},openLyricsPanel(){yo()},reportBackdrop(t){const e=w.skin;!e||!t||typeof t!="object"||(e.colors={...e.colors,...t},e.chrome=yc(e.colors),w.skinHost?.applyChrome(i.playerOpen&&!w.view?.hidden))}}}})),w.skinHost}function ju(){const t=w.stage?.getBoundingClientRect?.()||{width:0,height:0};return{themeId:document.documentElement.dataset.theme||"",mode:document.documentElement.dataset.mode==="light"?"light":"dark",width:Math.round(t.width||0),height:Math.round(t.height||0),dpr:Number(window.devicePixelRatio)||1,reducedMotion:!!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,foreground:!!i.playerOpen&&!w.view?.hidden}}function be(t){w.skinHost?.push(t)}function Vu(t){const{skin:e,fellBack:n}=ya(t);e&&(n&&console.warn(`[skins] 样式「${t}」不存在，已回退到「${e.name}」`),i.pvMode=e.id,document.getElementById("app")?.setAttribute("data-mode",e.id),zu().mount(e),w.skinHost.applyChrome(i.playerOpen&&!w.view?.hidden),Gu(),Bs("closed"))}function Bs(t){const e=w.backgroundRoot;e&&(e.dataset.state=t)}function Wu(){w.skin&&(w.skinHost?.unmount(),w.resizeObserver&&(w.resizeObserver.disconnect(),w.resizeObserver=null),w.carouselTimer&&(clearInterval(w.carouselTimer),w.carouselTimer=null))}function Gu(){w.resizeObserver||typeof ResizeObserver!="function"||(w.resizeObserver=new ResizeObserver(()=>{const t=w.stage.getBoundingClientRect();be({type:"resize",width:Math.round(t.width),height:Math.round(t.height)})}),w.resizeObserver.observe(w.stage,{box:"border-box"}))}function Ao(){const t=Number(i.config.coverCarouselInterval),e=Number.isFinite(t)&&t>0?Math.max(2,t):10;return{enabled:i.config.coverCarousel===!0,seconds:e,intervalMs:e*1e3}}function Ku(){const t=J();w.carouselSongId!==(t?.id??null)&&(w.carouselSongId=t?.id??null,w.carouselIndex=i.coverSets.get(t?.id)?.active??0,w.carouselLastAdvance=Date.now());const{enabled:e,intervalMs:n}=Ao(),a=mi(t);!e||!i.playerOpen||!i.playing||a.length<2||Date.now()-w.carouselLastAdvance<n||(w.carouselLastAdvance=Date.now(),w.carouselIndex=(w.carouselIndex+1)%a.length,be({type:"media",...Re()}))}function Yu(){w.carouselTimer||(w.carouselTimer=setInterval(Ku,1e3))}function Xu(){const t=mi(J());return t.length<2?!1:(w.carouselIndex=(w.carouselIndex+1)%t.length,w.carouselLastAdvance=Date.now(),be({type:"media",...Re()}),!0)}function ir(){M.cover=null,w.skinHost&&be({type:"media",...Re()})}function cs(t={}){const e=Re(),n=t.type==="song"||t.type==="lyrics"||t.type==="media",a=e.cover!==M.cover||e.song?.id!==M.songId;M.cover=e.cover,!(!a&&!n)&&be({...t,...e})}function rr(){const t=vi();M.options&&M.options.showLyrics===t.showLyrics&&M.options.lyricsFontSize===t.lyricsFontSize&&M.options.animations===t.animations&&M.options.coverCarousel===t.coverCarousel&&M.options.coverCarouselInterval===t.coverCarouselInterval&&M.options.interactive===t.interactive&&M.options.performanceMode===t.performanceMode||(M.options=t,be({type:"options",options:t}))}function or(){const t=!!i.playerOpen&&!!w.view?.dataset.theme;return w.skinHost?.applyChrome(t)??!1}async function lr(){if(!w.view){if(w.view=wi("#playerview"),w.stage=wi("#playerview-stage"),w.backgroundRoot=document.getElementById("skin-background"),!w.view||!w.stage)return;Qu(),Yu()}const t=w.view,e=J();if(!!!i.playerOpen){t.dataset.state!=="closed"&&(t.dataset.state="closed",or(),Bs("closed"),w.closeTimer&&clearTimeout(w.closeTimer),w.closeTimer=setTimeout(()=>{w.closeTimer=null,!i.playerOpen&&(t.hidden=!0,Wu(),ma())},Tu()+20));return}w.closeTimer&&(clearTimeout(w.closeTimer),w.closeTimer=null),t.hidden=!1,await pi();const a=i.pvMode||i.config.playerViewMode||"",s=w.mountedId!==a;if(s&&(Vu(a),ma()),(t.dataset.state!=="opened"||s)&&(t.offsetHeight,t.dataset.state="opened",Bs("opened"),or()),!w.skin)return;if(M.songId!==(e?.id??null)){M.songId=e?.id??null,M.cover=null,M.lyricsText=null,w.carouselSongId=e?.id??null,w.carouselIndex=i.coverSets.get(e?.id)?.active??0,cs({type:"song"});const o=e?.id??null,l=await ko(e);if((J()?.id??null)!==o)return;M.lyricsText=l.text,M.lyricsStatus=l.status||"",cs({type:"lyrics"}),rr();return}cs();const r=Eo(e);(r.text!==M.lyricsText||r.status!==M.lyricsStatus)&&(M.lyricsText=r.text,M.lyricsStatus=r.status,be({type:"lyrics",...Re()})),rr(),na()}function ma(){M.songId=null,M.cover=null,M.lyricsText=null,M.lyricsStatus=null,M.options=null,M.playing=null}function na({force:t=!1,lyricIndex:e}={}){if(!i.playerOpen||!w.skin)return;const n=hi();(M.playing!==n.playing||t)&&(M.playing=n.playing,be({type:"state",...n}));const a=typeof e=="number"?e:Bu(J());be({type:"progress",...n,lyricIndex:a})}function Qu(){w.themeObserver||(M.themeId=document.documentElement.dataset.theme||"",w.themeObserver=new MutationObserver(()=>{const t=document.documentElement.dataset.theme||"",e=document.documentElement.dataset.mode||"dark";t!==M.themeId&&(M.themeId=t,be({type:"theme",themeId:t,mode:e}))}),w.themeObserver.observe(document.documentElement,{attributes:!0,attributeFilter:["data-theme","data-mode"]}))}function Vt(t){const{skin:e,fellBack:n}=ya(t);e&&(i.pvMode=e.id,i.config.playerViewMode=e.id,ma(),$(),n&&console.warn(`[skins] 样式「${t}」不可用，已切换到「${e.name}」`))}function Do(){i.playerOpen=!0,i.pvMode=ya(i.config.playerViewMode||"").skin?.id||i.pvMode,ma(),$()}function Ia(){i.playerOpen=!1,$()}function Fs(){i.playerOpen?Ia():Do()}function va(){return kn().map(t=>({id:t.id,name:t.name,icon:t.icon||"disc",iconUrl:t.iconUrl||"",builtin:t.builtin===!0,source:t.source||"",version:t.version||"",author:t.author||"",description:t.description||"",colorsMissing:Array.isArray(t.colorsMissing)?t.colorsMissing.slice():[],chrome:t.chrome||null,background:t.background===!0,spectrum:t.spectrum||!1}))}const Ju=[{value:"play",label:"播放"},{value:"play-list",label:"播放当前列表"},{value:"next",label:"下一首播放"}],Zu=[{value:"system",label:"跟随系统"},{value:"round",label:"标准"},{value:"small",label:"小圆角"},{value:"square",label:"直角"}],ep=[{value:"compact",label:"紧凑"},{value:"cozy",label:"标准"},{value:"roomy",label:"宽松"}],tp=[{value:"fast",label:"快速 0.25s"},{value:"medium",label:"适中 0.5s"},{value:"slow",label:"缓慢 0.75s"}],np=[{value:"smooth",label:"流畅优先"},{value:"performance",label:"性能优先"}],ap={embedded:"内嵌歌词","lrc-file":"同目录 .lrc",cache:"歌词缓存",online:"在线自动匹配"};function sp(){const e=(Array.isArray(i.config.lyricsSources)?i.config.lyricsSources:[]).map(n=>ap[n]||n);return e.length?e.join(" → "):"（未配置）"}function bi(){const t=i.coverCache;if(!t)return"正在读取…";const e=((t.bytes||0)/1024/1024).toFixed(1);return`已缓存 ${E(t.covers||0)} 张封面、${E(t.lyrics||0)} 份歌词，共 ${e} MB`}function Mo(){const t=i.coverCache||{};return(Number(t.covers)||0)+(Number(t.lyrics)||0)}function ip(){const t="默认关闭：封面与歌词都只放在缓存目录里。开启后下载 / 更换封面时会把它们写进文件标签，这样把文件拷到别的播放器上也能看到封面与歌词（m4a / flac 支持，mp3 等格式会明确跳过）";return i.coverCache?Mo()===0?`${t}。当前缓存里还没有封面或歌词可写`:`${t}。缓存里已经有 ${bi()}`:t}function rp(){return`这个开关只对之后下载或更换的封面生效；已经存在缓存里的封面与歌词（${bi()}）可以用下面的按钮一次性写进歌曲文件。mp3 / wav 等暂不支持写标签的格式会被跳过，不会动你的文件。`}function cr(){const t=wa(),e=[];for(const a of t)for(const s of a.swatch||[])e.includes(s)||e.push(s);const n=e.map((a,s)=>`[data-swatch="${s}"]{background:${a}}`).join(`
`);return Gs("swatch-styles",n),a=>(a.swatch||[]).map(s=>e.indexOf(s))}function op(t){if(!t?.dir)return`（浏览器预览模式读不到本机目录，以下是源码仓库里的参考文件）
1. 接口唯一定义（含 JSDoc 类型与完整字段说明）：frontend/packages/player-skins/src/contract.js
2. 内置样式包（结构与写法可直接参考，内置与第三方现在同构）：internal/skins/resources/player-skins/classic/、immersive/
3. 可直接复制改名的最小示例包：internal/skins/template/（skin.json / skin.js / skin.css / assets/）
4. 说明文档：frontend/packages/player-skins/README.md 与 internal/skins/template/皮肤说明.md`;const e=["本机真实路径如下。如果你能读文件，请先打开它们当范例；如果读不到（例如纯聊天环境），请让使用者把下面第 2 条的文件内容贴给你，再开始写。",`1. 样式（皮肤）目录 —— 第三方样式包都放在这里，扫描只认它下面的一层子目录：${t.dir}`];t.example?e.push(`2. 示例样式包（完整可运行的 skin.js / skin.css / skin.json，复制改名就是一份新样式）：${t.example}`):e.push("2. 示例样式包：本机没有找到 _template 目录，请只按本规格的接口定义写。"),t.current?e.push(`3. 当前正在使用的样式包（最贴近现状的参考）：${t.current}`):e.push(`3. 当前正在使用的是内置样式（${t.currentId||"classic / immersive"}）：它的文件内嵌在程序里，磁盘上没有对应目录，请以第 2 条的示例包为准。`);const n=Array.isArray(t.packs)?t.packs:[];if(n.length){e.push("4. 该目录里已有的第三方样式包（可以直接读它们的入口与样式）：");for(const a of n){const s=[a.module,...Array.isArray(a.styles)?a.styles:[]].filter(Boolean);e.push(`   · ${a.name||a.id}（id: ${a.id}）：${s.join("、")||a.dir}`)}}else e.push("4. 该目录里目前还没有第三方样式包 —— 你写的这个会是第一个。");return e.push('5. 清单里 apiVersion 必须是 "3.0"（major 不同会被直接拒绝；minor 可以比宿主旧）。'),e.join(`
`)}function lp(t){if(!t?.dir)return`（浏览器预览模式读不到本机目录，以下是源码仓库里的参考文件）
1. 令牌默认值与注释：frontend/src/styles/tokens.css、frontend/src/styles/themes/_template.css
2. 内置主题（可直接对照写法）：frontend/src/styles/themes/flat-dark.css、flat-light.css、cover-dark.css
3. 扫描与指令解析实现：internal/theme/theme.go`;const e=["本机真实路径如下。如果你能读文件，请先打开它们当范例；如果读不到（例如纯聊天环境），请让使用者把下面第 2 条的文件内容贴给你，再开始写。",`1. 主题目录 —— 用户主题都放在这里，只扫一层、不递归；文件名默认就是主题 id，显示名由 @theme-name 决定：${t.dir}`];t.currentFile?e.push(`2. 当前正在使用的主题：${t.currentName||t.currentId}（id: ${t.currentId}）→ 文件：${t.currentFile}`):e.push("2. 当前主题的文件没找到，请以第 3 条列出的文件为准。");const n=Array.isArray(t.files)?t.files:[];if(n.length){e.push("3. 主题目录里已有的主题文件（都是合法示例，可直接对照写法）：");for(const a of n)e.push(`   · ${a.file}（${a.name||a.id}，id: ${a.id}，模式 ${a.mode}，${a.builtin?"内置":"用户导入"}）`)}else e.push("3. 主题目录里暂时没有 .css 文件。");return e.join(`
`)}function cp(t=null){return`请为「本地音乐播放器」（Go + WebView2 的 Windows 桌面应用）产出一个第三方「播放界面样式（插件）」包。这个包会被应用直接扫描并加载，因此必须严格满足下面的规格。

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
1. colors 必填，二选一：{"bg":…,"fg":…} 或 {"theme":true}（跟随宿主主题）。宿主用它决定**自己的控件栏与浮层**配色并做对比度兜底；缺了不报错，但设置页会在你的样式卡片上显示一个警告图标，且宿主把控件栏降级成主题配色。
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
- ctx.sdk             复用零件：createLyricsView / createFxLyrics / createCamera / createBackgroundLayer / applyFit / fitScale / parseLrc / splitGraphemes / findLyricIndex / formatLrcTime / lyricDisplayText / html / util
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
5. 不要改布局令牌（--h-titlebar / --w-sidebar / --h-playerbar / --h-header / --row-h / --row-h-compact），改了会破坏固定布局。
6. 需要私有变量时定义在自己的作用域里（::scope { --my-…: … }），不要写到 :root。

【五、行为约束】
1. 不要 import 应用内部模块（store / bridge / utils / playerhost / @localmusicplayer/player-skins 等）；数据只从 ctx 拿，动作只走 ctx.actions；不要直接操作音频元素或应用状态。
2. 不要轮询：禁止用 setInterval 或定时 setTimeout 反复拉数据（动画、防抖、一次性延时除外）。
3. 歌词高亮优先用 ctx.sdk.createLyricsView（或 ctx.lyrics().index 与 lines），不要自己解析 LRC 文本。
   行上带 words 就是字级（逐字）歌词，上面两个渲染零件会自己按字点亮；再把
   setPosition(pos, { playing })（或 setPlaying(playing)）也喂上，逐字高亮才会在两次
   250ms 进度推送之间平滑推进，否则是 4Hz 的阶梯值。
4. 动效要尊重 ctx.options().animations（false 时不要做位移动效）与时长与缓动令牌；窗口收起（patch.type === "visibility" 或 close）时停掉帧循环。
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
${op(t)}

【八、输出格式】
1. 先写清目录名与文件清单；
2. 再逐个文件输出完整代码，每个文件单独一个代码块，并在代码块第一行用注释标明文件名；
3. 不要省略、不要用省略号占位、不要留 __SKIN_ID__ 之类的占位符，代码要能直接运行。

【九、风格】
本提示词只约定产物必须满足的规则、格式、环境与参考，不规定也不暗示视觉风格；具体样式（布局、配色、动效、气质）由使用者自行构思。
请以使用者随附的风格说明为准；若使用者没有给出，先向使用者确认，不要自行假设。

【风格要求 · 由使用者自行填写（本行只是占位，本提示词不提供任何风格建议）】
`}function dp(t=null){return`请为「本地音乐播放器」（Go + WebView2 的 Windows 桌面应用）产出一个「外观主题」CSS 文件。

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
${lp(t)}

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
`}function Po({copyKey:t,importKind:e,importLabel:n}){return d` <div class="card__actions">
    <button class="btn btn--sm btn--primary" type="button" data-copy-prompt=${t}>
      <svg aria-hidden="true"><use href="#i-file"></use></svg><span>复制提示词</span>
    </button>
    <button class="btn btn--sm" type="button" data-import=${e}>
      <svg aria-hidden="true"><use href="#i-folder"></use></svg><span>${n}</span>
    </button>
  </div>`}async function up(){if(!k())return null;try{const t=document.documentElement.dataset.theme||i.config.theme||"";return await v.themeReference(t)||null}catch(t){return console.warn("[settings] 读取主题参考资料失败",t),null}}async function pp(){if(!k())return null;try{const t=i.pvMode||i.config.playerViewMode||"";return await v.skinReference(t)||null}catch(t){return console.warn("[settings] 读取样式参考资料失败",t),null}}async function fp(t){const n=t==="theme"?dp(await up()):cp(await pp());try{await navigator.clipboard.writeText(n),u("提示词已复制，粘贴给 AI 即可",{tone:"success",duration:2e3});return}catch{}const a=document.createElement("textarea");a.value=n,a.setAttribute("readonly",""),a.style.cssText="position:fixed;left:-9999px;top:0;opacity:0;",document.body.appendChild(a),a.select();let s=!1;try{s=document.execCommand("copy")}catch{s=!1}a.remove(),u(s?"提示词已复制，粘贴给 AI 即可":"复制失败，请手动复制",{tone:s?"success":"warning",duration:2600})}async function hp(t,e={}){const n=t==="theme";if(!k()){u("浏览器预览模式无法导入，请手动把文件放进目录",{tone:"warning",duration:3600});return}const a=u(n?"正在导入主题…":"正在导入样式包…",{duration:0});try{const s=n?await v.importTheme():await v.importSkin();if(a.close(),s?.cancelled)return;const r=n?Array.isArray(s?.imported)?s.imported:[]:s?.id?[s.id]:[],o=Array.isArray(s?.skipped)?s.skipped:[];n?(await $a(),e.commit?.(),e.render?.()):(await fi(),e.render?.());let l=n?r.length?`已导入 ${r.length} 个主题：${r.join("、")}`:"没有导入任何主题":r.length?`已导入样式「${r[0]}」`:"没有导入任何样式";o.length&&(l+=`；另有 ${o.length} 个文件被跳过`),u(l,{tone:r.length?o.length?"warning":"success":"warning",duration:4600}),o.length&&W({title:"部分文件没有导入",body:d`<div class="setting__hint setting__hint--steps">
          ${o.map((c,p)=>d`${p?d`<br />`:A}${c}`)}
        </div>`,okText:"知道了",cancelText:"关闭",onOk:()=>!0})}catch(s){a.close(),u(`导入失败：${s?.message??s}`,{tone:"error",duration:6e3})}}function Oo(t,e={}){t.addEventListener("click",n=>{const a=n.target.closest("[data-copy-prompt]");if(a){fp(a.dataset.copyPrompt);return}const s=n.target.closest("[data-import]");s&&hp(s.dataset.import,e)})}function mp(t={}){const e=d` <div class="setting__hint setting__hint--steps">
      · 点「复制提示词」把它粘贴给
      AI：提示词里只有产物的目录结构、接口契约与硬性规则，不含任何风格建议，风格请在末尾那条「风格要求」里自己补一句，它会直接产出一个样式包目录；<br />
      · 提示词里的「参考资料」会自动带上本机的真实路径（样式目录、示例包 _template、当前样式包），AI
      能读文件就会直接照着写；<br />
      · 生成好后回到这里点「导入样式包」，选中那个目录即可（目录里必须有 skin.js）；<br />
      · 也可以手动放进「样式目录/&lt;样式id&gt;/」，回来点「重新扫描样式」。
    </div>
    ${Po({copyKey:"skin",importKind:"skin",importLabel:"导入样式包…"})}
    <div class="setting__hint">
      接口的唯一定义在 frontend/packages/player-skins/src/contract.js；样式目录里也有现成的 _template
      示例可以直接复制改名。
    </div>`,{root:n}=W({title:"用 AI 创建播放界面样式",body:e,okText:"知道了",cancelText:"关闭",onOk:()=>!0});Oo(n,t)}function vp(t={}){const e=d` <div class="setting__hint setting__hint--steps">
      · 点「复制提示词」把它粘贴给
      AI：提示词里只有文件格式、令牌清单与校验规则，不含任何配色建议，风格请在末尾那条「风格要求」里自己补一句，它会产出一个主题
      CSS；<br />
      · 提示词里的「参考资料」会自动带上本机的真实路径（主题目录、当前主题文件、目录里已有的主题 CSS），AI
      能读文件就会直接照着写；<br />
      · 生成好后回到这里点「导入主题」，选中放着那个 CSS 的文件夹即可；<br />
      · 也可以手动放进主题文件夹（上面有「打开主题文件夹」按钮），回来点「重新扫描主题」。
    </div>
    ${Po({copyKey:"theme",importKind:"theme",importLabel:"导入主题…"})}
    <div class="setting__hint setting__hint--steps">
      主题只声明颜色，不需要写组件样式，因此换主题不会破坏布局：<br />
      · 选择器写 <b>:root[data-theme="你的文件名"]</b>，与文件名一致最省事；<br />
      · 只改你想要的颜色，其余保持默认即可；<br />
      · 没写到的颜色会自动沿用默认主题，缺失也不会弄坏布局。
    </div>`,{root:n}=W({title:"添加自定义主题",body:e,okText:"知道了",cancelText:"关闭",onOk:()=>!0});Oo(n,t)}async function bp(t,e,n){if(!k()){u("浏览器预览模式下不能移除，请手动删除主题文件",{tone:"warning",duration:3600});return}const a=u("正在移除主题…",{duration:0});try{const s=await Ic(t);if(a.close(),!s.removed){u(`没有移除「${e}」`,{tone:"warning"});return}await Oe(i.config),n.commit?.(),n.render?.(),u(`已移除主题「${e}」`,{tone:"success"})}catch(s){a.close(),u(`移除失败：${s?.message??s}`,{tone:"error",duration:6e3})}}function gp(t,e){const n=t.dataset.id,a=t.dataset.name||n;W({title:`移除主题「${a}」？`,desc:"会删除这个主题对应的样式文件。内置主题不能移除。",okText:"移除",danger:!0,onOk:async()=>(await bp(n,a,e),!0)})}async function yp(t,e,n){if(!k()){u("浏览器预览模式下不能移除，请手动删除样式目录",{tone:"warning",duration:3600});return}const a=u("正在移除样式…",{duration:0});try{const s=await qu(t);if(a.close(),!s.removed){u(`没有移除「${e}」`,{tone:"warning"});return}n.commit?.(),n.render?.(),u(`已移除样式「${e}」`,{tone:"success"})}catch(s){a.close(),u(`移除失败：${s?.message??s}`,{tone:"error",duration:6e3})}}function _p(t,e){const n=t.dataset.id,a=t.dataset.name||n;W({title:`移除样式「${a}」？`,desc:"会把样式目录里对应的整个文件夹删掉（里面只有这个样式的文件，不含歌曲）。",okText:"移除",danger:!0,onOk:async()=>(await yp(n,a,e),!0)})}async function Us(t,e={}){const n=t.dataset.act,a=t.dataset.id;switch(n){case"about-open-url":{const s=String(t.dataset.url||"").trim();if(!s)return;if(!k()){try{await navigator.clipboard.writeText(s),u("预览模式没有系统浏览器：链接已复制",{duration:2600})}catch{u(s,{duration:5200})}return}try{await v.openExternalUrl(s)}catch(r){u(`打开链接失败：${r?.message??r}`,{tone:"error",duration:5e3})}return}case"update-check":{if(!k()){u("浏览器预览模式无法联网检查更新",{tone:"warning",duration:3200});return}u("正在检查更新…",{duration:2200});try{const s=await xl({force:!0});if(!s)return;s.error?u(`检查失败：${s.error}`,{tone:"error",duration:7e3}):s.hasUpdate&&!s.assetAvailable?u(`有新版本 ${s.latest}，但没有当前平台的安装包`,{tone:"warning",duration:6e3}):s.hasUpdate?u(`发现新版本 ${s.latest}`,{tone:"success",duration:4e3}):u(`已是最新版本（v${s.current}）`,{tone:"success",duration:3e3})}catch(s){u(`检查失败：${s?.message??s}`,{tone:"error",duration:6e3})}return}case"update-download":{if(!k()){u("浏览器预览模式无法下载更新",{tone:"warning",duration:3200});return}Sl().catch(s=>{u(`下载失败：${s?.message??s}`,{tone:"error",duration:7e3})});return}case"update-cancel":{const s=await wl();u(s?"已取消下载":"当前没有正在进行的下载",{duration:2600});return}case"update-install":{if(!k()){u("浏览器预览模式无法安装更新",{tone:"warning",duration:3200});return}const s=i.update?.pending;if(!s){u("还没有下载好可安装的更新",{tone:"warning",duration:3200});return}W({title:"安装更新并重启？",desc:`即将安装 ${s.name}。程序会先退出，由引导脚本替换文件后自动重启。`+(s.verified?"安装包已通过 SHA-256 校验。":"注意：这一版没有可用的校验值，请确认来源可信。"),okText:"安装并重启",onOk:async()=>await kl()?(u("正在安装更新，程序即将重启…",{duration:4e3}),!0):(u(`安装失败：${i.update?.error||"未知原因"}`,{tone:"error",duration:7e3}),!1)});return}case"update-skip":{const s=String(t.dataset.version||"");await _l(s),u(s?`已跳过 ${s}，之后再提示更新的版本`:"已取消跳过，将重新提示该版本",{duration:3600});return}case"update-open-dir":{if(!k()){u("浏览器预览模式没有文件管理器",{tone:"warning",duration:3e3});return}try{await v.updateOpenDir()}catch(s){u(`打开更新目录失败：${s?.message??s}`,{tone:"error",duration:5e3})}return}case"update-channel":{const s=String(t.value||"auto");await yl(s);const r=bs(s).name;u(`下载通道已设为「${r}」`,{duration:3e3});return}case"reset-main-window-geometry":{if(!k()){u("浏览器预览模式下没有独立窗口",{duration:2200});return}try{const s=await v.mainWindowResetGeometry();s&&s.ok===!1?u(`重置失败：${s.reason||"未知原因"}`,{tone:"error",duration:5e3}):u("窗口已移回屏幕中央并恢复默认大小",{tone:"success",duration:2400})}catch(s){u(`重置失败：${s?.message??s}`,{tone:"error",duration:5e3})}return}case"ai-field":{const s=t.dataset.key;if(!s)return;const r=t.value;if(s==="aiApiKey"&&r===(i.config?.aiApiKey??""))return;i.config[s]=r,e.commit?.();return}case"add-folder":{if(k()){let r=null;try{r=await v.addFolder("")}catch(o){u(`系统目录选择器不可用：${o?.message??o}`,{tone:"warning",duration:5e3}),r=null}if(r===null){const o=await pr({manual:!0});if(!o)return;try{r=await v.addFolder(o)}catch(l){u(`添加失败：${l?.message??l}`,{tone:"error",duration:6e3});return}}if(r?.cancelled)return;if(r?.duplicated){u(`该文件夹已在曲库中：${r.path}`,{tone:"warning"});return}r?.folder?(i.folders=[...i.folders.filter(o=>o.id!==r.folder.id),r.folder],e.commit?.(),u(`已添加并开始扫描：${r.folder.path}`,{tone:"success"})):u("添加文件夹失败，请重试",{tone:"error",duration:6e3});return}const s=await pr();if(!s)return;i.folders.push({id:On("folder"),path:s,trackCount:0,status:"ok",watching:i.config.watchFolders,addedAt:Date.now()}),e.commit?.(),u(`已添加文件夹：${s}`,{tone:"success"}),e.rescan?.();break}case"remove-folder":{const s=i.folders.find(r=>r.id===a);if(!s)return;W({title:"移除音乐文件夹？",desc:`${s.path}
仅从曲库中移除，不会删除任何本地文件。`,okText:"移除",danger:!0,onOk:async()=>(k()&&await v.removeFolder(a),i.folders=i.folders.filter(r=>r.id!==a),e.commit?.(),u("已移除文件夹"),e.rescan?.({manual:!1}),!0)});break}case"scan-now":e.rescan?.({manual:!0});break;case"rescan-folder":u("正在重新扫描该文件夹…"),e.rescan?.({manual:!0});break;case"unplayable-toggle":Dr();break;case"unplayable-dismiss":await gl(a);break;case"unplayable-restore":{const s=(i.unplayableFiles||[]).find(r=>r.songId===a);W({title:"重新扫描并放回曲库？",desc:`将清掉「${s?.title||a}」的失败记录，并重新扫描音乐文件夹。
如果文件确实已经修好，它就会回到曲库里。`,okText:"重新扫描",onOk:async()=>(await bl(a),u("已重新扫描",{tone:"success"}),!0)});break}case"unplayable-clear":{const s=(i.unplayableFiles||[]).length;if(!s)break;W({title:`清空这 ${E(s)} 条记录？`,desc:"只清掉这张清单，不会改动任何文件，也不会让它们回到曲库。",okText:"清空",danger:!0,onOk:async()=>{const r=await vl();return u(`已清空 ${E(r)} 条记录`),!0}});break}case"rule-add":i.filterRules.push({id:On("rule"),type:"regex",op:"match",value:"",scope:"exclude",enabled:!0}),e.commit?.();break;case"rule-del":i.filterRules=i.filterRules.filter(s=>s.id!==a),e.commit?.(),e.refreshRules?.();break;case"rule-toggle":{const s=i.filterRules.find(r=>r.id===a);s&&(s.enabled=!s.enabled),e.commit?.(),e.refreshRules?.();break}case"rule-scope":{const s=i.filterRules.find(r=>r.id===a);s&&(s.scope=t.dataset.scope),e.commit?.(),e.refreshRules?.();break}case"rule-type":{const s=i.filterRules.find(r=>r.id===a);if(s){s.type=t.value==="regex"?"regex":"size";const r=["lt","lte","gt","gte","eq"];s.type==="regex"?s.op="match":r.includes(s.op)||(s.op="lt"),s.type==="size"&&!s.unit&&(s.unit="B")}e.commit?.(),e.refreshRules?.();break}case"rule-op":{const s=i.filterRules.find(r=>r.id===a);s&&(s.op=t.value),e.commit?.(),e.refreshRules?.();break}case"preset-small":i.filterRules.push({id:On("rule"),type:"size",op:"lt",value:"10240",unit:"B",scope:"exclude",enabled:!0}),e.commit?.(),e.refreshRules?.(),u("已添加：排除小于 10KB 的文件",{tone:"success"});break;case"preset-mp4":i.filterRules.push({id:On("rule"),type:"regex",op:"match",value:"\\.mp4$",scope:"exclude",enabled:!0}),e.commit?.(),e.refreshRules?.(),u("已添加：排除 .mp4 文件",{tone:"success"});break;case"theme-pick":{const r=wa().find(o=>o.id===a);if(!r)return;i.config.theme=r.id,i.config.themeMode=r.mode,await Oe(i.config),e.commit?.(),e.render?.(),u(`已切换到主题「${r.name}」`,{tone:"success",duration:1600});break}case"open-theme-dir":{if(!k()){u("主题目录：frontend/src/styles/themes/",{duration:3200});break}try{const s=await v.themeDir();await v.revealThemeDir(),u(s?`已打开主题目录：${s}`:"已打开主题目录",{duration:3200})}catch(s){u(`打开主题目录失败：${s?.message??s}`,{tone:"error",duration:5e3})}break}case"theme-help":vp(e);break;case"theme-remove":gp(t,e);break;case"reload-themes":if(k()){const s=await v.reloadThemes();await $a(),await Oe(i.config),e.commit?.(),u(`已重新扫描到 ${s?.length??0} 个主题`,{tone:"success"})}else u("浏览器预览模式下仅内置主题可用",{tone:"warning"});break;case"skin-pick":{const s=va().find(r=>r.id===a);if(!s)return;Vt(s.id),e.commit?.(),e.render?.(),u(`播放界面已切换到「${s.name}」`,{tone:"success",duration:1600});break}case"open-skin-dir":{if(!k()){u("样式目录：frontend/packages/player-skins/",{duration:3200});break}try{const s=await v.skinDir();await v.revealSkinDir(),u(s?`已打开样式目录：${s}`:"已打开样式目录",{duration:3200})}catch(s){u(`打开样式目录失败：${s?.message??s}`,{tone:"error",duration:5e3})}break}case"reload-skins":try{k()&&await v.reloadSkins(),await fi(),Vt(i.pvMode||i.config.playerViewMode||""),e.render?.();const s=va().length,r=So();u(r.length?`已扫描到 ${s} 个样式，${r.length} 个加载失败`:`已扫描到 ${s} 个样式`,{tone:r.length?"warning":"success"})}catch(s){u(`重新扫描失败：${s?.message??s}`,{tone:"error"})}break;case"skin-help":mp(e);break;case"skin-remove":_p(t,e);break;case"ai-vendor":{const s=String(t.value||"auto");if(s===(i.config.aiVendor||"auto"))break;i.config.aiVendor=s,e.commit?.(),e.render?.();const r=oo(s);u(`模型类型已设为「${qd(s)}」${r?"："+r:""}`,{duration:3600});break}case"loudness-refresh":{if(!k())return;await xa();const s=await yn();e.commit?.(),u(`已重新获取响度数据（已测量 ${s?.measured??0} 首）`,{tone:"success"});break}case"loudness-clear":{if(!k())return;W({title:"清除响度测量数据？",desc:"只会删除测量缓存，不会动你的音乐文件。清除后再次启用响度均衡会重新测量。",okText:"清除",danger:!0,onOk:async()=>(await v.loudnessClear(),i.loudnessGains={},await yn(),e.commit?.(),e.render?.(),u("已清除响度测量数据",{tone:"success"}),!0)});break}case"loudness-target":{const s=Number(t.value),r=i.config.loudnessTarget;if(s===r)break;i.config.loudnessTarget=s,e.commit?.(),await nu(),await yn(),e.render?.(),u("目标响度已切换，响度数据将重新计算",{tone:"success",duration:3200});break}case"download-dir-pick":{if(!k()){u("浏览器预览无法调用系统目录选择器",{tone:"warning"});break}try{const s=await v.downloadPickDir();if(s?.cancelled)break;await dr(s,e)}catch(s){u(`无法更改下载位置：${s?.message??s}`,{tone:"error",duration:6e3})}break}case"download-dir-open":{if(!k())break;try{await v.downloadOpenDir(i.config.downloadDir||"")}catch(s){u(`打开失败：${s?.message??s}`,{tone:"error",duration:5e3})}break}case"download-dir-reset":{if(!k())break;try{const s=await v.downloadSetDir("");if(s?.cancelled)break;const r=s?.next?s:await v.downloadSetDir("");await dr(r,e)}catch(s){u(`恢复默认失败：${s?.message??s}`,{tone:"error",duration:6e3})}break}case"cache-open-covers":case"cache-open-lyrics":{if(!k())break;try{await v.coverOpenCacheDir(n==="cache-open-covers"?"covers":"lyrics")}catch(s){u(`打开缓存目录失败：${s?.message??s}`,{tone:"error",duration:5e3})}break}case"cover-refresh":{if(!k())break;try{const s=await v.coverClearCache();i.coverCache=await v.coverCacheStats(),await Ro(),e.commit?.(),e.render?.(),u(`已清空缓存（封面 ${s?.covers??0} 张、歌词 ${s?.lyrics??0} 份）`,{tone:"success"})}catch(s){u(`清空失败：${s?.message??s}`,{tone:"error",duration:5e3})}break}case"embed-cache-write":await Lo({ctx:e,force:!0});break}}async function Lo({ctx:t={},force:e=!1}={}){if(!k()){e&&u("写入歌曲文件需要后端支持，浏览器预览不可用",{tone:"warning"});return}for(let s=0;s<20&&!i.coverCache;s++)await new Promise(r=>setTimeout(r,100));if(!i.coverCache&&e)try{i.coverCache=await v.coverCacheStats()}catch{}if(Mo()===0){e?u(i.coverCache?"缓存里还没有封面或歌词，暂时没有可写入的内容":"暂时读不到缓存统计，请稍后再试",{duration:3400}):i.coverCache&&u("已开启：以后下载 / 更换封面时会把封面与歌词写进歌曲文件",{duration:3600});return}const n=Number(i.coverCache?.covers)||0,a=Number(i.coverCache?.lyrics)||0;W({title:"要把已有的缓存写进歌曲文件吗？",body:d` <div class="setting__hint">
        缓存目录里已经有 <b>${E(n)}</b> 张封面、<b>${E(a)}</b> 份歌词。
        它们现在只放在缓存目录里；写进歌曲文件之后，把文件拷到别的播放器上也能看到。
      </div>
      <div class="setting__hint">
        写入只会在原文件的标签里做最小插入 / 替换（m4a 的 covr 与 ©lyr、FLAC 的 PICTURE 与 LYRICS），
        不动音频数据；mp3、wav、ogg 等格式会被跳过。这一步无法撤销，但不会影响播放。
      </div>`,okText:"写入文件",cancelText:"暂不写入",onOk:async()=>(await wp(t),!0)})}async function wp(t={}){const e=u("正在把缓存写入歌曲文件…",{duration:0}),n=U("meta:embed-progress",a=>{const s=Number(a?.done)||0,r=Number(a?.total)||0,o=a?.title?" · "+a.title:"";e.update(r?"正在写入歌曲文件 "+s+"/"+r+o:"正在把缓存写入歌曲文件…")});try{const a=await v.coverWriteCacheToFiles(),s=Number(a?.written)||0,r=Number(a?.skipped)||0,o=Number(a?.failed)||0,l=Number(a?.total)||0;if(e.close(),!l){u("缓存里还没有封面或歌词，暂时没有可写入的内容",{duration:3200});return}let c=`已写入 ${E(s)} 首`;a?.covers&&(c+=`（封面 ${E(a.covers)}）`),a?.lyrics&&(c+=`（歌词 ${E(a.lyrics)}）`),r&&(c+=`，跳过 ${E(r)} 首`),o&&(c+=`，失败 ${E(o)} 首`),u(c,{tone:o?"warning":r?"info":"success",duration:5200});const p=Array.isArray(a?.reasons)?a.reasons:[];p.length&&W({title:o?"部分歌曲没能写入":"部分歌曲已跳过",body:d`<div class="setting__hint setting__hint--steps">
          ${p.map((m,h)=>d`${h?d`<br />`:A}${m}`)}
        </div>`,okText:"知道了",cancelText:"关闭",onOk:()=>!0}),i.coverCache=await v.coverCacheStats(),t.commit?.(),t.render?.()}catch(a){e.close(),u(`写入失败：${a?.message??a}`,{tone:"error",duration:6e3})}finally{n()}}async function dr(t,e){if(!t||t.cancelled)return;const n=t.next;if(!n)return;if(t.same){u("这已经是当前的下载目录",{duration:2200});return}const a=Number(t.count)||0,s=((Number(t.bytes)||0)/1024/1024).toFixed(1),r=Number(t.nextCount)||0;if(a===0){await ds(n,!1,e);return}const o=d` <div class="setting__hint">
      当前下载目录里有 <b>${E(a)}</b> 首歌曲（约 ${s} MB）。 要一并搬到新目录吗？
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
    ${r?d`<div class="setting__hint">新目录里已经有 ${E(r)} 首歌曲，同名的不会被覆盖。</div>`:A}
    <div class="setting__hint">不迁移的话，旧目录里的歌曲会留在原地；新目录会成为新的默认保存位置。</div>`;W({title:"更改下载位置",body:o,okText:"迁移并更改",cancelText:"不迁移，只更改位置",onOk:async()=>(await ds(n,!0,e),!0),onCancel:async()=>{await ds(n,!1,e)}})}async function ds(t,e,n){try{const a=await v.downloadApplyDir(t,e);if(a?.dir&&(i.config.downloadDir=a.dir),n.commit?.(),n.render?.(),!e){u(`下载位置已改为：${a?.dir||t}`,{tone:"success",duration:3200});return}const s=Number(a?.migrated)||0,r=Number(a?.skipped)||0,o=Array.isArray(a?.failed)?a.failed:[];let l=`已迁移 ${E(s)} 首`;r&&(l+=`，跳过 ${E(r)} 首（新目录已有同名文件）`),o.length&&(l+=`，${E(o.length)} 首失败`),u(`${l}；新位置：${a?.dir||t}`,{tone:o.length?"warning":"success",duration:4200})}catch(a){u(`更改下载位置失败：${a?.message??a}`,{tone:"error",duration:6e3})}}async function Ro(){if(!k())return i.coverProviders=[],i.coverBreaker={},null;try{const t=await v.coverProviders();return i.coverProviders=Array.isArray(t?.providers)?t.providers:[],i.coverBreaker=t?.breaker&&typeof t.breaker=="object"?t.breaker:{},t}catch{return i.coverProviders=[],i.coverBreaker={},null}}let ur=!1;function $p(){if(ur)return;ur=!0;const t=k()?v.coverCacheStats().then(e=>(i.coverCache=e,e)).catch(()=>null):Promise.resolve(null);Promise.all([Ro(),t]).then(()=>{ve()})}function pr({manual:t=!1}={}){return new Promise(e=>{W({title:"添加音乐文件夹",desc:t?"系统目录选择器没能打开，请直接粘贴文件夹完整路径。":"浏览器预览模式下无法调用系统目录选择器，请手动输入路径。",body:d`<input class="input" data-field="path" type="text" placeholder="D:\\Music" />`,okText:"添加",onOk:n=>{const a=String(n.path||"").trim();return a?(e(a),!0):"请输入路径"}})})}function kp(t,e={}){const n=t.dataset.toggle;if(n){const s=t.getAttribute("aria-checked")!=="true";return t.setAttribute("aria-checked",String(s)),n==="updateCheckOnStart"?($l(s).then(()=>e.commit?.()).catch(r=>{console.warn("[settings] 设置自动检查失败",r)}),!0):(n in i.config&&(i.config[n]=s,n==="animations"&&Dt("--dur",vs(i.config)),(n==="skipSilenceHead"||n==="skipSilenceTail")&&si(),n==="minimizeToTray"&&k()&&v.minimizeToTray(s).catch(r=>{console.warn("[settings] 同步托盘开关失败",r)}),n==="watchFolders"&&(i.folders.forEach(r=>r.watching=s),k()&&v.setWatchers(s).catch(r=>{console.warn("[settings] 切换实时监听失败",r)}))),e.commit?.(),n==="embedMeta"&&s&&Lo(),!0)}const a=t.closest("[data-segment]")?.dataset.segment;if(a){const s=t.dataset.value;if(t.parentElement.querySelectorAll(".segmented__btn").forEach(r=>{r.setAttribute("aria-pressed",String(r===t))}),a==="themeMode"){i.config.themeMode=s;const r=wa(),o=window.matchMedia("(prefers-color-scheme: dark)").matches,l=s==="system"?o?"dark":"light":s,c=r.find(p=>p.mode===l&&p.id!=="cover-dark")||r[0];i.config.theme=c.id,Oe(i.config)}else if(a in i.config){const r=["lyricsLines","scanConcurrency"];i.config[a]=r.includes(a)?Number(s):s,a==="lyricsLines"&&Dt("--lyric-pad",`${50-Number(s)*4}%`),a==="animationsSpeed"&&Dt("--dur",vs(i.config)),a==="loudnessMode"&&xa(),a==="effectPreset"&&ii(),a==="windowCorners"&&k()&&v.setWindowCorners(s).catch(o=>{console.warn("[settings] 设置窗口圆角失败",o)})}return e.commit?.(),!0}return!1}function Sp(t,{silent:e=!1}={}){const n=t?.dataset?.id;if(!n)return;const a=i.config.rowClickAction||"next";if(a==="play"){gs(n);return}if(a==="play-list"){const s=i.visibleSongs.map(r=>r.id);gt(s,Number(t.dataset.index),$n());return}Mr(n),e||u("已设为下一首播放",{tone:"success",duration:1500})}const us=[{id:"album",label:"专辑",icon:"album",isOn:()=>i.config.showAlbumColumn!==!1,set:t=>{i.config.showAlbumColumn=t}}];function xp(t,e){const n=[{kind:"label",label:"显示的列"}];for(const a of us)n.push({id:`col-${a.id}`,label:a.label,icon:a.icon,checked:a.isOn()});n.push({kind:"sep"}),n.push({id:"col-reset",label:"恢复默认列",icon:"refresh"}),Bt({x:t,y:e,items:n,onPick:a=>{if(a==="col-reset"){for(const o of us)o.set(!0);$(),u("已恢复默认列",{duration:1400});return}const s=us.find(o=>`col-${o.id}`===a);if(!s)return;const r=!s.isOn();s.set(r),$(),u(r?`已显示「${s.label}」列`:`已隐藏「${s.label}」列`,{duration:1400})}})}function fr(t,e,n=null){const a=We(e);if(!a)return;const s=!!a.online,r=tt(e),o=i.queue.includes(e),l=[{id:"play",label:"播放",icon:"play"},{id:"play-next",label:"下一首播放",icon:"arrow-right"},{id:"sep1",kind:"sep"},{id:"queue-add",label:o?"从播放列表移除":"加入播放列表",icon:"queue"},{id:"like",label:r?"取消喜欢":"加入我喜欢",icon:"heart"},{id:"add-to",label:"加入歌单…",icon:"plus"}];if(s||l.push({id:"cover",label:"更换封面…",icon:"image"}),i.view==="queue")l.push({id:"sep2",kind:"sep"}),l.push({id:"remove-here",label:"从播放列表移除",icon:"trash",danger:!0});else if(i.view==="playlist"&&i.playlistId){const p=He(i.playlistId);p&&!p.locked&&(l.push({id:"sep2",kind:"sep"}),l.push({id:"remove-here",label:`从「${p.name}」移除`,icon:"trash",danger:!0}))}s||(l.push({id:"sep3",kind:"sep"}),l.push({id:"reveal",label:"在文件夹中显示",icon:"folder"}));const c=p=>{switch(p){case"play":{const m=i.visibleSongs.map(_=>_.id),h=m.indexOf(e);h<0?gt([e],0,{type:"online",id:null}):gt(m,h,$n());break}case"cover":yt(()=>Promise.resolve().then(()=>yi),void 0).then(m=>m.openCoverPanel(e));break;case"play-next":Mr(e),u("已设为下一首播放",{tone:"success",duration:1500});break;case"queue-add":o?(ys(e),u("已从播放列表移除")):(Cl([e]),u("已加入播放列表",{tone:"success",duration:1500}));break;case"like":mt(e),u(r?"已从「我喜欢」移除":"已加入「我喜欢」",{tone:r?"info":"success",duration:1500});break;case"add-to":Cp(e);break;case"remove-here":i.view==="queue"?(ys(e),u("已从播放列表移除")):i.playlistId&&(Pr(i.playlistId,[e]),u("已从歌单移除"));break;case"reveal":yt(()=>import("./bridge-D1JdJUg2.js").then(m=>m.q),[]).then(async m=>{try{await m.backend.revealInExplorer(a.path),u("已在文件夹中显示",{duration:1800})}catch(h){u(`无法在文件夹中显示：${h?.message??h}`,{tone:"error",duration:4e3})}});break}};if(n)Bt({x:n.x,y:n.y,items:l,onPick:c});else{const p=t.getBoundingClientRect();Bt({x:p.left,y:p.bottom+6,items:l,onPick:c,align:"right"})}}function Cp(t){const e=i.playlists,{root:n}=W({title:"加入歌单",body:d`
      <div class="setting__hint">点击歌单即可把这首歌加进去。</div>
      <div class="u-row u-wrap">
        ${e.map(a=>d` <button class="btn btn--sm" type="button" data-pl=${a.id}>
              <svg aria-hidden="true"><use href="#i-${a.id===Vn?"heart":"playlist"}"></use></svg>
              <span>${a.name}</span>
            </button>`)}
      </div>
    `,okText:"完成",cancelText:"关闭",onOk:()=>!0});n.addEventListener("click",a=>{const s=a.target.closest("[data-pl]");s&&pa(s.dataset.pl,[t])})}const Tp=1500,Ep=140,Ip=800,hr=new WeakMap,ps=new WeakMap;function Ap(t){t&&(clearTimeout(hr.get(t)),t.classList.remove("is-located"),t.offsetWidth,t.classList.add("is-located"),hr.set(t,window.setTimeout(()=>t.classList.remove("is-located"),Tp)))}function No(t){if(!t)return;const e=(ps.get(t)??0)+1;ps.set(t,e);try{t.scrollIntoView({block:"nearest",inline:"nearest"})}catch{Dp(t)}Pp(t,()=>{ps.get(t)!==e||!t.isConnected||Ap(t)})}function Dp(t){const e=t.closest(".content-body, .queue-panel__body");if(!e)return;const n=t.getBoundingClientRect(),a=e.getBoundingClientRect(),s=e.classList.contains("content-body")?50:8,r=a.top+s;n.top<r?e.scrollTop-=r-n.top:n.bottom>a.bottom&&(e.scrollTop+=n.bottom-a.bottom)}function Mp(t){let e=t.parentElement;for(;e&&e!==document.documentElement;){const{overflowY:n}=getComputedStyle(e);if(n==="auto"||n==="scroll"||n==="overlay")return e;e=e.parentElement}return null}function Pp(t,e){const n=Mp(t);if(!n){requestAnimationFrame(e);return}let a=!1,s=0,r=0,o=n.scrollTop,l=n.scrollLeft,c=performance.now();const p=()=>{a||(a=!0,cancelAnimationFrame(s),clearTimeout(r),n.removeEventListener("scrollend",p),e())},m=()=>{const h=n.scrollTop,_=n.scrollLeft;if((h!==o||_!==l)&&(o=h,l=_,c=performance.now()),performance.now()-c>=Ep){p();return}s=requestAnimationFrame(m)};n.addEventListener("scrollend",p),s=requestAnimationFrame(m),r=window.setTimeout(p,Ip)}function Op(t){const e=i.currentId;if(!e)return null;const n=t.querySelector(`.track[data-id="${CSS.escape(e)}"]`);return n?{el:n}:null}function Lp(){const t=i.currentId;return t&&document.querySelector("#queue-panel-body")?.querySelector(`.queue-item[data-queue-id="${CSS.escape(t)}"]`)||null}function Rp({notify:t=!0}={}){if(!i.currentId)return t&&u("当前没有正在播放的歌曲",{tone:"info",duration:1600}),!1;const e=document.getElementById("content-body"),n=e?Op(e):null;return n?(No(n.el),!0):(t&&u("当前播放的歌曲不在这个列表里",{tone:"info",duration:2200}),!1)}function qo({notify:t=!0}={}){if(!i.queue.length)return t&&u("播放列表是空的",{tone:"info",duration:1600}),!1;const e=Lp();return e?(No(e),!0):(t&&u("当前播放的歌曲不在播放列表里",{tone:"info",duration:2200}),!1)}let Bo=0;function Fo(){Bo=Date.now()}function Uo(){return Date.now()-Bo<260}function Np(t=!1){const e=i.visibleSongs.map(n=>n.id);if(e.length){if(t)for(let n=e.length-1;n>0;n-=1){const a=Math.floor(Math.random()*(n+1));[e[n],e[a]]=[e[a],e[n]]}gt(e,0,$n()),u(t?"已随机播放":`开始播放 ${E(e.length)} 首`,{duration:1600})}}const qp={library:"本地歌曲",queue:"播放列表",playlist:"歌单"},Bp=120;function Fp(){let t=null;const e=()=>{t!==null&&(clearTimeout(t),t=null,$())},n=()=>{t!==null&&clearTimeout(t),t=setTimeout(e,Bp)};return n.flush=e,n}const Up={commit:$,rescan:()=>xn({manual:!0})};class Hp extends ge{static deps=e=>[e.view,e.playlistId,e.playlistVersion,e.query,e.visibleVersion,e.visibleSongs.length,e.sortKey,e.sortDir,e.songs.length,e.folders.length,e.scanning,e.playlistSelecting,e.selectedIds,e.lastScan?.at??0,e.config.listDensity];constructor(){super(),this._commitFilter=Fp()}onDisconnected(){this._commitFilter?.flush?.()}render(){const e=i.view,n=e==="playlist"?He(i.playlistId):null;return d`
      <main class="main" id="main">
        <div
          class="content-header"
          id="content-header"
          @click=${a=>this.onHeaderClick(a)}
        >
          <div class="content-header__titles">
            <h1 class="content-header__title" id="content-title">
              ${e==="playlist"&&n?n.name:qp[e]||"本地歌曲"}
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
                  @input=${a=>{i.query=a.target.value,this._commitFilter()}}
                  @keydown=${a=>{a.key==="Escape"&&(a.preventDefault(),qa(),a.target.blur())}}
                />
                <button
                  class="content-filter__clear u-hit"
                  id="content-filter-clear"
                  type="button"
                  aria-label="清空筛选"
                  ?hidden=${i.query.length===0}
                  @click=${()=>{qa(),this.querySelector("#content-filter-input")?.focus()}}
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
    `}subtitle(e,n){const a=i.visibleSongs,s=a.reduce((r,o)=>r+o.duration,0);if(e==="library"){const r=i.lastScan;return`${E(a.length)} 首 · 共 ${Ma(s)} · ${E(i.folders.filter(o=>o.id!=="auto_downloads").length)} 个文件夹${r&&r.excluded?` · 已过滤 ${E(r.excluded)} 个文件`:""}`}if(e==="queue"){const r=i.currentId?a.findIndex(o=>o.id===i.currentId):-1;return`${E(a.length)} 首 · 共 ${Ma(s)}${r>=0?` · 正在播放第 ${r+1} 首`:""}`}return e==="playlist"&&n?`${E(n.songIds.length)} 首 · 共 ${Ma(s)} · ${n.locked?"默认歌单（不可删除）":"自定义歌单"}`:e==="playlist"?"歌单不存在":""}toolbar(){const e=i.view,n=d`<button class="btn btn--primary" type="button" data-tool="play-all">
      ${f("play")}<span>播放全部</span>
    </button>`,a=d`<button
      class="btn btn--icon"
      type="button"
      data-tool="locate"
      data-tip="定位到当前播放"
      aria-label="定位到当前播放"
    >
      ${f("disc")}
    </button>`,s=$i(i.sortKey),r=d`
      <button
        class="btn btn--sort"
        type="button"
        data-tool="sort"
        data-dir=${i.sortDir}
        data-tip="排序方式"
        aria-haspopup="menu"
        aria-label="排序方式：${s?.label??"添加时间"}，${Tl(i.sortDir)}"
      >
        ${f("sort")}
        <span>${s?.label??"添加时间"}</span>
        <span class="btn__dir" aria-hidden="true">${f(i.sortDir==="desc"?"chevron-down":"chevron-up")}</span>
      </button>
    `;if(e==="queue")return d`
        <button class="btn" type="button" data-tool="queue-clear">${f("trash")}<span>清空列表</span></button>
        ${n}${a}
      `;if(e==="playlist"){if(i.playlistSelecting){const o=i.selectedIds.size,l=i.visibleSongs.length>0&&i.visibleSongs.every(c=>i.selectedIds.has(c.id));return d`
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
        `}return d`
        ${r}${n}
        <button class="btn" type="button" data-tool="pl-select">${f("check")}<span>多选</span></button>
        <button class="btn" type="button" data-tool="pl-add">${f("plus")}<span>添加</span></button>
        ${a}
        <button class="btn btn--icon" type="button" data-tool="pl-more" data-tip="歌单操作">${f("more")}</button>
      `}return d`
      <button class="btn" type="button" data-tool="rescan">${f("refresh")}<span>重新扫描</span></button>
      ${r}${n}${a}
    `}body(){const e=i.view;if(!i.visibleSongs.length){const n=i.query.trim()?"search":e==="library"?"library":e==="queue"?"queue":"playlist";return this.empty(n)}return Nd(`${e}|${i.playlistId??""}`,d`<div class="page"><mp-track-table></mp-track-table></div>`)}empty(e){const n={library:{icon:"music",title:"曲库还没有歌曲",desc:"在设置里添加本地音乐文件夹，程序会自动扫描并监听这些文件夹的变化。",ok:"添加音乐文件夹",act:"add-folder"},queue:{icon:"queue",title:"播放列表是空的",desc:"从「本地歌曲」或任意歌单里选择歌曲加入播放列表。",ok:"去本地歌曲",act:"goto-library"},playlist:{icon:"playlist",title:"这个歌单还没有歌曲",desc:"在「本地歌曲」里点击每首歌后面的爱心或更多菜单，把歌曲加进来。",ok:"去本地歌曲",act:"goto-library"},search:{icon:"search",title:"没有找到匹配的歌曲",desc:"换个关键词试试，或清空搜索框。",ok:"清空搜索",act:"clear-search"}},a=n[e]||n.library;return d`
      <div class="empty" data-empty=${e}>
        <svg class="empty__art" aria-hidden="true"><use href="#i-${a.icon}"></use></svg>
        <div class="empty__title">${a.title}</div>
        ${a.desc?d`<div class="empty__desc">${a.desc}</div>`:A}
        ${a.ok?d`<div class="empty__actions">
                <button class="btn btn--primary" type="button" data-empty-act=${a.act}>${a.ok}</button>
              </div>`:A}
      </div>
    `}async onHeaderClick(e){const n=e.target.closest("[data-empty-act]")?.dataset.emptyAct;if(n){n==="add-folder"?await Us({dataset:{act:"add-folder"}},Up):n==="goto-library"?Mt("library"):n==="clear-search"&&qa();return}const a=e.target.closest("[data-tool]")?.dataset.tool;a&&await this.handleTool(a)}openSortMenu(){const e=this.querySelector('[data-tool="sort"]'),n=[{id:"hdr-field",kind:"label",label:"排序方式"},...El.map(a=>({id:`field:${a.key}`,label:a.label,checked:a.key===i.sortKey})),{id:"sep-dir",kind:"sep"},{id:"hdr-dir",kind:"label",label:"排列顺序"},{id:"dir:asc",label:"升序",checked:i.sortDir==="asc"},{id:"dir:desc",label:"降序",checked:i.sortDir==="desc"}];Bt({anchor:e,align:"left",items:n,onPick:a=>{if(a.startsWith("field:")){const s=a.slice(6);if(s===i.sortKey){u(`已经按「${$i(s)?.label??s}」排序`,{duration:1400});return}Il(s);return}if(a.startsWith("dir:")){const s=a.slice(4);if(s===i.sortDir)return;Al(s)}}})}async handleTool(e){switch(e){case"rescan":xn({manual:!0});break;case"sort":this.openSortMenu();break;case"play-all":Np(!1);break;case"locate":Rp();break;case"queue-clear":Or(),u("播放列表已清空");break;case"pl-select":ki(!i.playlistSelecting);break;case"pl-add":i.playlistId&&Od(i.playlistId);break;case"sel-all":{const n=i.visibleSongs.length>0&&i.visibleSongs.every(a=>i.selectedIds.has(a.id));Dl(n?[]:i.visibleSongs.map(a=>a.id));break}case"sel-remove":{const n=[...i.selectedIds];if(!n.length)break;const a=He(i.playlistId),s=Pr(i.playlistId,n);ki(!1),u(`已从「${a?.name??"歌单"}」移除 ${E(s)} 首`,{tone:"success"});break}case"pl-more":As(i.playlistId,this.querySelector('#content-header [data-tool="pl-more"]'));break}}}ie("mp-content",Hp);const zp=Xs(class extends Qs{render(){return Ct}update(t,[e]){const n=t.element;if(!n)return Ct;Ol(n);const a=e||ba;if(n.getAttribute("src")===a)return Ct;if(a.startsWith("data:"))return n.src=a,Ct;n.__coverWant=a;const s=new Image;s.decoding="async";const r=()=>{n.__coverWant===a&&(n.src=a)};return s.addEventListener("load",r),s.addEventListener("error",r),s.src=a,Ct}}),gi=t=>zp(t);class jp extends ge{static deps=e=>[e.view,e.playlistId,e.visibleVersion,e.sortKey,e.sortDir,e.config.listDensity,e.config.showAlbumColumn,e.playlistSelecting,e.selectedIds,e.currentId,e.playing,e.likedIds,Tn(),e.visibleSongs.length];get mode(){return i.view==="queue"?"playlist":"library"}get selecting(){return i.view==="playlist"&&i.playlistSelecting}updated(){i.view==="queue"?this.bindQueueSort():this._sortable&&(this._sortable.destroy(),this._sortable=null)}disconnectedCallback(){this._sortable?.destroy(),this._sortable=null,super.disconnectedCallback()}bindQueueSort(){const e=this.querySelector(".tracks__body");e&&(this._sortable&&this._sortable.el===e||(this._sortable?.destroy(),this._sortable=C.create(e,{handle:"[data-handle]",draggable:".track",animation:0,ghostClass:"is-dragging",chosenClass:"is-dragging",onEnd:n=>{Fo();const a=n.oldIndex,s=n.newIndex;if(a==null||s==null||a===s)return;const r=n.from,o=Array.from(r.children).filter(l=>l!==n.item);r.insertBefore(n.item,o[a]??null),Lr(a,s),u("已调整播放顺序 · 播放模式已切回列表循环",{duration:1800})}})))}render(){const e=this.mode,n=i.visibleSongs;return d`
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
          ${Te(n,a=>a.id,(a,s)=>this.rowTemplate(a,s,e))}
        </div>
      </div>
    `}headTemplate(e){const n=e!=="playlist",a=(s,r,o="")=>{if(!n)return d`<div class="tracks__sort ${o}" data-static="1">${r}</div>`;const l=["tracks__sort",o,i.sortKey===s&&i.sortDir==="asc"?"is-asc":""].filter(Boolean).join(" ");return d`<button
        class=${l}
        type="button"
        data-sort=${s}
        data-dir=${i.sortKey===s?i.sortDir:A}
      >
        ${r}${f("chevron-down")}
      </button>`};return d`
      <div class="tracks__head" data-mode=${e}>
        <div class="col-handle"></div>
        <div class="col-index">#</div>
        <div class="col-cover"></div>
        ${a("title","标题")} ${a("album","专辑","col-album")} ${a("duration","时长")}
        <div class="col-heart" title="我喜欢">${f("heart")}</div>
        <div class="col-more"></div>
      </div>
    `}rowTemplate(e,n,a){const s=this.selecting,r=e.id===i.currentId,o=tt(e.id),l=s&&i.selectedIds.has(e.id);return d`
      <div
        class="track"
        data-id=${e.id}
        data-index=${n}
        data-selectable=${s?"1":"0"}
        aria-selected=${String(l)}
        aria-current=${String(r)}
        data-playing=${r&&i.playing?"true":"false"}
      >
        ${a==="playlist"?d`<div class="track__handle" data-handle="1" title="拖动排序">${f("grip")}</div>`:d`<div class="col-handle"></div>`}
        <div class="track__index">${this.indexCell(e,n,s)}</div>
        <div class="track__cover">
          <img src=${gi(wt(e))} alt="" loading="lazy" draggable="false" />
        </div>
        <div class="track__main">
          <div class="track__title">${e.title}</div>
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
    `}indexCell(e,n,a){if(a){const s=i.selectedIds.has(e.id);return d`<span class="track__check" role="checkbox" aria-checked=${String(s)}>${f("check")}</span>`}return d`
      <span class="track__num u-num">${n+1}</span>
      <div class="track__bars"><span></span><span></span><span></span><span></span></div>
      <button class="track__play" type="button" data-act="play" aria-label="播放 ${e.title}">
        ${f("play")}
      </button>
    `}onClick(e){if(Uo())return;const n=e.target.closest(".track");if(n&&i.view==="playlist"&&i.playlistSelecting){e.preventDefault(),Ml(n.dataset.id);return}const a=e.target.closest("[data-sort]");if(a){Pl(a.dataset.sort);return}const s=e.target.closest("[data-act]");if(!s){const l=e.target.closest(".track");l&&Sp(l,{silent:!1});return}const r=s.closest(".track"),o=r?.dataset.id;if(o)switch(s.dataset.act){case"play":{const l=i.visibleSongs.map(c=>c.id);gt(l,Number(r.dataset.index),$n());break}case"like":{mt(o);const l=tt(o);u(l?"已加入「我喜欢」":"已从「我喜欢」移除",{tone:l?"success":"info",duration:1500});break}case"more":fr(s,o);break}}onDblClick(e){if(i.view==="playlist"&&i.playlistSelecting)return;const n=e.target.closest(".track");if(!n)return;const a=i.visibleSongs.map(s=>s.id);gt(a,Number(n.dataset.index),$n()),i.playerOpen=!0,i.pvMode=i.config.playerViewMode,$()}onContextMenu(e){if(e.target.closest(".tracks__head")){e.preventDefault(),xp(e.clientX,e.clientY);return}const a=e.target.closest(".track");a&&(e.preventDefault(),fr(null,a.dataset.id,{x:e.clientX,y:e.clientY}))}}ie("mp-track-table",jp);class Vp extends ge{static deps=e=>[e.playerOpen,e.pvMode,e.currentId,e.playing,e.duration,e.config.showLyrics,e.config.coverCarousel,e.config.coverCarouselInterval,Tn(),Co()];onConnected(){this._unsubscribers.push(ga(()=>lr()))}updated(){lr()}render(){const e=ze(),a=this.coverList(e).length>1,s=i.config.coverCarousel===!0&&a,r=!e||!!e.online,o=va();return d`
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
          <button class="playerview__back" id="btn-player-back" type="button" @click=${()=>Ia()}>
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
            ${Te(o,l=>l.id,l=>d`
                <button
                  class="viewmode__btn"
                  type="button"
                  data-pv-skin=${l.id}
                  data-pv-mode=${l.id}
                  aria-pressed=${String(i.pvMode===l.id)}
                  data-tip=${l.name||l.id}
                  aria-label=${l.name||l.id}
                  @click=${()=>Vt(l.id)}
                >
                  ${this.skinIcon(l)}
                </button>
              `)}
          </div>
        </div>
        <div
          class="playerview__stage"
          id="playerview-stage"
          @click=${l=>{l.target.closest(".disc__label, .disc__platter")&&Xu()}}
        ></div>
      </section>
    `}skinIcon(e){return e.iconUrl?d`<i class="skin-icon" style=${`--skin-icon:url("${e.iconUrl}")`}></i>`:f(e.icon||"disc")}coverList(e){if(!e)return[];const n=i.coverSets.get(e.id)?.items;return Array.isArray(n)?n.filter(a=>a?.preview):[]}carouselTip(e,n){if(!e)return"这首歌只有一张封面";const a=Number(i.config.coverCarouselInterval)||10;return n?"关闭封面轮播":`开启封面轮播（每 ${a} 秒换一张）`}openCoverPanel(e){!e||e.online||yt(()=>Promise.resolve().then(()=>yi),void 0).then(n=>n.openCoverPanel(e.id))}toggleCarousel(){i.config.coverCarousel=!i.config.coverCarousel,$(),u(i.config.coverCarousel?`已开启封面轮播（每 ${Number(i.config.coverCarouselInterval)||10} 秒换一张）`:"已关闭封面轮播",{duration:1600})}}ie("mp-playerview",Vp);function Wt(t,e={}){const n=e.min??0,a=e.max??1,s=e.step??.001;let r=dt(e.value??n,n,a),o=!1;const l=t.querySelector(".slider__fill"),c=t.querySelector(".slider__thumb"),p=t.querySelector(".slider__bubble");t.setAttribute("aria-valuemin",String(n)),t.setAttribute("aria-valuemax",String(a));function m(){const b=a===n?0:(r-n)/(a-n)*100;l&&(l.style.transform=`scaleX(${b/100})`),c&&(c.style.left=`${b}%`),p&&e.format&&(p.textContent=e.format(r)),t.setAttribute("aria-valuenow",String(Math.round(b)))}function h(b){const x=t.getBoundingClientRect();if(x.width<=0)return r;const N=dt((b.clientX-x.left)/x.width,0,1),F=n+N*(a-n),z=Math.round(F/s)*s;return dt(Number(z.toFixed(6)),n,a)}function _(b){if(!p)return;const x=t.getBoundingClientRect(),N=dt(b.clientX-x.left,0,x.width);p.style.left=`${N}px`}t.addEventListener("pointerdown",b=>{t.dataset.disabled!=="true"&&(b.preventDefault(),o=!0,t.dataset.dragging="true",t.setPointerCapture?.(b.pointerId),r=h(b),m(),_(b),e.onChange?.(r))}),t.addEventListener("pointermove",b=>{_(b),o&&(r=h(b),m(),e.onChange?.(r))});const S=b=>{o&&(o=!1,t.dataset.dragging="false",t.releasePointerCapture?.(b.pointerId),e.onCommit?.(r))};return t.addEventListener("pointerup",S),t.addEventListener("pointercancel",S),t.addEventListener("keydown",b=>{if(t.dataset.disabled==="true")return;const x=(a-n)/10,N=s*10;let F=r;switch(b.key){case"ArrowRight":case"ArrowUp":F=r+N;break;case"ArrowLeft":case"ArrowDown":F=r-N;break;case"PageUp":F=r+x;break;case"PageDown":F=r-x;break;case"Home":F=n;break;case"End":F=a;break;default:return}b.preventDefault(),r=dt(Number(F.toFixed(6)),n,a),m(),e.onChange?.(r),e.onCommit?.(r)}),m(),{get value(){return r},set(b,{silent:x=!1}={}){const N=dt(b,n,a);N===r&&!x||(r=N,m(),x||e.onChange?.(r))},setDisabled(b){t.dataset.disabled=b?"true":"false"},text(b=r){return e.format?e.format(b):String(b)},paint:m}}const fs={sequence:{icon:"repeat",label:"列表循环"},"loop-all":{icon:"repeat",label:"列表循环"},"loop-one":{icon:"repeat-one",label:"单曲循环"},shuffle:{icon:"shuffle",label:"随机播放"}};function Ho(t){const e=typeof t=="boolean"?t:!i.queueOpen;i.queueOpen=e,e&&(i.optionsOpen=!1),$()}function zo(t){const e=typeof t=="boolean"?t:!i.optionsOpen;i.optionsOpen=e,e&&(i.queueOpen=!1),$()}function jo(t){const e=typeof t=="boolean"?t:!i.sleepOpen;i.sleepOpen=e,$()}function Wp(t){const e=Math.round(Number(t)||0);if(e<=0){Vo("已取消定时停止");return}i.sleepTimer={type:"duration",until:Date.now()+e*6e4,minutes:e},$(),u(`${e} 分钟后停止播放`,{duration:1800})}function Vo(t){i.sleepTimer=null,$(),u(t,{duration:1400})}function Gp(t){i.config.sleepAfterSong=!!t,$(),u(i.config.sleepAfterSong?"已开启：倒计时结束后等当前歌曲播完再停":"已关闭：倒计时结束后立即停止",{duration:2200})}function Kp(){const t=i.sleepTimer;if(!(t?.type!=="duration"||Date.now()<t.until)){if(i.config.sleepAfterSong===!0&&i.playing&&i.currentId){i.sleepTimer={type:"after-song"},$(),u("定时到点：等这首播完就停",{duration:2400});return}i.sleepTimer=null,i.playing?Gt():$(),u("已按定时停止播放",{duration:1800})}}class Yp extends ge{static deps=e=>[e.currentId,e.playing,e.duration,e.volume,e.muted,e.playMode,e.likedIds,e.queue.length,e.queueOpen,e.optionsOpen,e.sleepOpen,e.sleepTimer,e.lyricsOpen,Tn()];constructor(){super(),this._progress=null,this._volume=null,this._tick=null}onConnected(){this._tick=setInterval(()=>{i.sleepTimer&&this.requestUpdate()},1e3),this._unsubscribers.push(ga(()=>{this.isConnected&&this.paintProgress()}))}onDisconnected(){this._tick&&clearInterval(this._tick),this._tick=null}paintProgress(){if(Xd()){const r=this.querySelector("#time-current");r&&r.textContent!=="--:--"&&(r.textContent="--:--"),this._progress?.set(0,{silent:!0}),this._progress?.setDisabled(!0);return}const e=Math.round(i.position),n=Math.round(i.duration||0),a=this.querySelector("#time-current");if(a){const r=At(i.position);a.textContent!==r&&(a.textContent=r)}const s=this.querySelector("#progress");s&&s.dataset.dragging!=="true"&&n>0&&this._progress?.set(e/n*1e3,{silent:!0}),this._progress?.setDisabled(n<=0)}firstUpdated(){const e=this.querySelector("#progress");this._progress=Wt(e,{min:0,max:1e3,step:1,value:0,format:n=>At(n/1e3*(i.duration||0)),onChange:n=>{i.duration&&(i.position=n/1e3*i.duration,this.requestUpdate())},onCommit:n=>{i.duration&&Ee(n/1e3*i.duration)}}),this._volume=Wt(this.querySelector("#volume"),{min:0,max:1,step:.01,value:i.volume,format:n=>`${Math.round(n*100)}`,onChange:n=>{_s(n),Ms(),this.requestUpdate()}})}updated(){this.paintProgress();const e=i.muted?0:i.volume,n=this.querySelector("#volume");n&&n.dataset.dragging!=="true"&&this._volume?.set(e,{silent:!0}),Kp()}render(){const e=ze(),n=i.currentId?tt(i.currentId):!1,a=fs[i.playMode]||fs.sequence,s=i.muted?0:i.volume,r=s===0?"volume-mute":s<.5?"volume-low":"volume-high",o=e?wt(e):"",l=i.sleepTimer,c=l?.type==="duration"?Math.max(1,Math.ceil((l.until-Date.now())/6e4)):0;return d`
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
              @click=${()=>Fs()}
            >
              <img id="bar-cover-img" alt=${e?`${e.title} 封面`:""} src=${gi(o)} />
              <svg class="playerbar__cover-icon"><use href="#i-expand"></use></svg>
            </button>
            <div class="playerbar__meta" id="bar-meta" data-tip="播放详情页" @click=${()=>Fs()}>
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
                @click=${()=>Ys()}
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
                @click=${()=>{Ll(),Ms()}}
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
              @click=${()=>{Rl(),u((fs[i.playMode]||a).label,{duration:1400})}}
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
              @click=${()=>yo()}
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
              @click=${()=>jo()}
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
              @click=${()=>zo()}
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
              @click=${()=>{Xp()}}
            >
              ${f("playlist")}
              <span class="mode-btn__badge" id="queue-count"
                >${i.queue.length===0?"":i.queue.length>99?"99+":String(i.queue.length)}</span
              >
            </button>
          </div>
        </div>
      </footer>
    `}sleepTip(e){return e?.type==="duration"?`定时停止 · 剩余 ${Math.max(0,Math.round((e.until-Date.now())/1e3))} 秒`:e?.type==="after-song"?"定时停止 · 播完当前歌曲":"定时停止"}onLike(){if(!i.currentId)return;mt(i.currentId);const e=tt(i.currentId);u(e?"已加入「我喜欢」":"已从「我喜欢」移除",{tone:e?"success":"info",duration:1500})}openAddToPlaylistMenu(e){const n=ze();if(!n){u("还没有正在播放的歌曲",{duration:1600});return}const a=[];for(const s of i.playlists.filter(r=>!r.locked))a.push({id:s.id,label:s.name,icon:s.id==="liked"?"heart":"playlist",checked:s.songIds.includes(n.id)});a.length||a.push({id:"__none",label:"还没有可用的歌单",disabled:!0}),a.push({id:"__sep",kind:"sep"}),a.push({id:"__new",label:"新建歌单…",icon:"plus"}),Bt({anchor:e,x:0,y:0,align:"right",items:a,onPick:async s=>{if(!(s==="__none"||s==="__sep")){if(s==="__new"){ro(r=>{r&&pa(r.id,[n.id])});return}pa(s,[n.id])}}})}}function Xp(){const t=i.queueOpen;Ho(),!t&&i.currentId&&Qp(()=>qo({notify:!1}))}function Qp(t){let e=null,n=!1,a=0;const s=()=>{n||(n=!0,clearTimeout(a),e?.removeEventListener("transitionend",r),i.queueOpen&&t())},r=o=>{o.target===e&&s()};requestAnimationFrame(()=>{if(e=document.getElementById("queue-panel"),!e||e.hidden){s();return}e.addEventListener("transitionend",r),a=window.setTimeout(s,Jp(e)+80)})}function Jp(t){let e=0;for(const n of getComputedStyle(t).transitionDuration.split(",")){const a=n.trim(),s=parseFloat(a);Number.isFinite(s)&&(e=Math.max(e,a.endsWith("ms")?s:s*1e3))}return e}ie("mp-playerbar",Yp);let Hs="";function Dn(){return i.config.showDesktopLyrics===!0}async function mr(t,{force:e=!1}={}){const n=!!t,a=Dn()!==n;if(i.config.showDesktopLyrics=n,Hs="",!a&&!e)return ve(),{ok:!0,enabled:n,unchanged:!0};if(!k())return Aa({enabled:n}),{ok:!0,preview:!0,enabled:n};try{const s=await v.desktopLyrics(n);return n&&s?.ok===!1&&(i.config.showDesktopLyrics=!1,ve()),s}catch(s){return console.warn("[desktop-lyrics] 打开/关闭桌面歌词失败",s),i.config.showDesktopLyrics=!1,ve(),{ok:!1,enabled:n,error:String(s?.message??s)}}}function Zp({text:t="",playing:e=!1,fontSize:n=26}={}){if(!Dn())return;const a=[t,e?1:0,Math.round(n)].join("|");if(a!==Hs){if(Hs=a,!k()){Aa({text:t,playing:e});return}v.updateDesktopLyrics({text:t,playing:e,fontSize:n}).catch(s=>{console.warn("[desktop-lyrics] 同步歌词失败",s?.message??s)})}}function Aa({text:t="",playing:e=!1,enabled:n=null}={}){const a=n===null?Dn():!!n,s=!k()&&a&&e&&!!t;i.floatingLyrics={show:s,text:t},ve()}function Da(){return i.config.showDesktopWallpaper===!0}function hs(){ve()}async function ef(){if(!k())return!0;let t=!0,e="";try{const n=await v.desktopWallpaperState();t=n?.supported!==!1,e=n?.reason||""}catch(n){return console.info("[desktop-wallpaper] 能力探测失败",n?.message??n),!0}return t?!0:(i.desktopWallpaperSupport={supported:!1,reason:e||"当前系统不支持桌面背景歌词"},ve(),!1)}async function vr(t,{force:e=!1}={}){const n=!!t,a=Da()!==n;if(i.config.showDesktopWallpaper=n,hs(),!a&&!e)return{ok:!0,enabled:n,unchanged:!0};if(!k())return n?(zs(),{ok:!0,preview:!0,enabled:n}):(Aa({enabled:!1}),{ok:!0,preview:!0,enabled:n});try{const s=await v.desktopWallpaper(n);return n&&s?.ok===!1?(i.config.showDesktopWallpaper=!1,hs(),$()):n&&(tf(),zs()),s}catch(s){return console.warn("[desktop-wallpaper] 打开/关闭桌面背景歌词失败",s),i.config.showDesktopWallpaper=!1,hs(),$(),{ok:!1,enabled:n,error:String(s?.message??s)}}}const I={setup:"",songId:"\0",cover:"\0",lyricsText:"\0",lyricsStatus:"\0",options:"",playing:null,volume:null,muted:null,duration:-1,lyricIndex:-2,position:-1,progressAt:0,progressPlaying:null};function tf(){I.setup="",I.songId="\0",I.cover="\0",I.lyricsText="\0",I.options="",I.playing=null,I.volume=null,I.muted=null,I.duration=-1,I.lyricIndex=-2,I.position=-1,I.progressAt=0,I.progressPlaying=null}function nf(){const t=[],e=af();e.signature!==I.setup&&(I.setup=e.signature,t.push({type:"theme",skinId:e.skinId,themeId:e.theme,theme:e.theme,mode:e.mode,density:e.density,tokens:e.tokens}));const n=Uu(),a=Io(),s=Hu({interactive:!1}),r=n.song?.id??"";r!==I.songId?(I.songId=r,I.cover=n.cover,I.lyricsText=n.lyrics.text,I.lyricIndex=n.lyrics.index,I.duration=a.duration,I.progressPlaying=a.playing,I.progressAt=br(),t.push({type:"song",song:n.song,cover:n.cover,covers:n.covers,coverIndex:n.coverIndex,lyrics:n.lyrics})):(n.cover!==I.cover&&(I.cover=n.cover,t.push({type:"media",cover:n.cover,covers:n.covers,coverIndex:n.coverIndex})),(n.lyrics.text!==I.lyricsText||n.lyrics.status!==I.lyricsStatus)&&(I.lyricsText=n.lyrics.text,I.lyricsStatus=n.lyrics.status,I.lyricIndex=n.lyrics.index,t.push({type:"lyrics",lyrics:n.lyrics})));const o=JSON.stringify(s);o!==I.options&&(I.options=o,t.push({type:"options",options:s})),(a.playing!==I.playing||a.volume!==I.volume||a.muted!==I.muted)&&(I.playing=a.playing,I.volume=a.volume,I.muted=a.muted,t.push({type:"state",playing:a.playing,volume:a.volume,muted:a.muted}));const l=br();return(a.position!==I.position||n.lyrics.index!==I.lyricIndex||a.duration!==I.duration||a.playing!==I.progressPlaying)&&(I.position=a.position,I.lyricIndex=n.lyrics.index,I.duration=a.duration,I.progressPlaying=a.playing,I.progressAt=l,t.push({type:"progress",position:a.position,duration:a.duration,playing:a.playing,lyricIndex:n.lyrics.index})),t}function br(){return typeof performance<"u"&&performance.now?performance.now():Date.now()}function zs(){if(Da()){if(!k()){const t=Ou();Aa({text:t.text,playing:Io().playing});return}for(const t of nf())v.updateDesktopWallpaper(t).catch(e=>{console.warn("[desktop-wallpaper] 同步背景歌词失败",e?.message??e)})}}function af(){const t=rf(),e=i.pvMode||i.config.playerViewMode||"",n=document.documentElement.dataset.theme||"",a=document.documentElement.dataset.mode||"dark",s=document.documentElement.dataset.density||"";return{skinId:e,theme:n,mode:a,density:s,tokens:t.values,signature:[e,n,a,s,t.signature].join("|")}}function sf(){const t=i.config||{};return[document.documentElement.dataset.theme||"",document.documentElement.dataset.mode||"",document.documentElement.dataset.density||"",t.glassBlurCustom?t.glassBlur:"",t.glassAlphaCustom?t.glassAlpha:"",t.accentFromCover?1:0,t.coverSeed||"",t.coverSeed2||"",t.animations===!1?0:1,t.animationsSpeed||"",t.lyricsFontSize,t.listDensity||""].join("|")}let gr="\0",yr={};function rf(){const t=sf();return t!==gr&&(gr=t,yr=of()),{signature:t,values:yr}}function of(){const t=new Set(Object.keys(Nl()));for(const a of document.styleSheets){let s=null;try{s=a.cssRules}catch{continue}Wo(s,t,0)}const e=getComputedStyle(document.documentElement),n={};for(const a of t){const s=e.getPropertyValue(a).trim();!s||/[;{}]/.test(s)||(n[a]=s)}return n}function Wo(t,e,n){if(!(!t||n>3))for(const a of t){if(a.style)for(const s of a.style)s.startsWith("--")&&e.add(s);a.cssRules&&Wo(a.cssRules,e,n+1)}}const Q=Object.freeze({off:"off",lyrics:"lyrics",wallpaper:"wallpaper"});function js(){return i.config.showDesktopWallpaper===!0?Q.wallpaper:i.config.showDesktopLyrics===!0?Q.lyrics:Q.off}async function lf(t){const e=cf(t),n=js();if(e===n)return{ok:!0,mode:e,unchanged:!0};const a=await _r(e);return a?.ok!==!1?{ok:!0,...a,mode:e}:n!==Q.off&&(await _r(n))?.ok!==!1?{ok:!1,...a,mode:n,restored:!0}:{ok:!1,...a,mode:Q.off}}async function _r(t){return t!==Q.lyrics&&await mr(!1),t!==Q.wallpaper&&await vr(!1),t===Q.lyrics?mr(!0):t===Q.wallpaper?vr(!0):{ok:!0}}function cf(t){return t===Q.lyrics?Q.lyrics:t===Q.wallpaper?Q.wallpaper:Q.off}const df=[{value:"off",label:"关闭"},{value:"vocal",label:"清澈人声"},{value:"bass",label:"低音增强"},{value:"surround",label:"3D 环绕"}],Vs=14,Ws=72,Go=[{id:"opt-desktop-off",value:Q.off,label:"关闭",tip:"不在桌面上显示歌词"},{id:"opt-desktop-lyrics",value:Q.lyrics,label:"悬浮",tip:"在桌面上显示一行置顶歌词（独立透明窗口，可拖动）"},{id:"opt-desktop-wallpaper",value:Q.wallpaper,label:"背景",tip:"把播放界面的背景铺满桌面、垫在桌面图标之下，歌词跟着画在上面（仅 Windows）"}];async function uf(t){const e=await lf(t);$();const n=Go.find(a=>a.value===t)?.label||"";return e.ok!==!1?(u(t===Q.off?"已关闭桌面歌词":`桌面歌词：${n}`,{duration:1400}),e):(u(`打不开：${e.reason||e.error||"未知原因"}`,{tone:"warning",duration:3200}),e.restored&&u("已保留原来的桌面歌词设置",{duration:1800}),e)}class Mn extends ge{get open(){return!1}get panelEl(){return null}updated(){const e=this.panelEl;if(e){if(this.open){this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden?(e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{this.open&&(e.dataset.state="opened")})):e.dataset.state!=="opened"&&(e.dataset.state="opened");return}e.hidden||(e.dataset.state="closed",!this._closeTimer&&(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!this.open&&e&&(e.hidden=!0)},Ks()+40)))}}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),this._closeTimer=null,super.disconnectedCallback()}bindDismiss(e){const n=s=>{const r=this.panelEl;!r||r.hidden||r.contains(s.target)||s.target.closest?.(e)||this.close()},a=s=>{if(s.key!=="Escape")return;const r=this.panelEl;r&&!r.hidden&&this.close()};document.addEventListener("pointerdown",n),document.addEventListener("keydown",a),this._undismiss=()=>{document.removeEventListener("pointerdown",n),document.removeEventListener("keydown",a)}}close(){}}class pf extends Mn{static deps=e=>[e.queueOpen,e.queue,e.currentId,e.playing,Tn()];get open(){return!!i.queueOpen}get panelEl(){return this.querySelector("#queue-panel")}close(){Ho(!1)}firstUpdated(){this.bindDismiss("#btn-playlist"),this.bindDrag()}updated(){super.updated(),this.bindDrag()}bindDrag(){const e=this.querySelector("#queue-panel-body");e&&(this._sortable&&this._sortable.el===e||(this._sortable?.destroy(),this._sortable=C.create(e,{draggable:".queue-item",animation:0,ghostClass:"is-dragging",onEnd:n=>{Fo();const a=n.oldIndex,s=n.newIndex;if(a==null||s==null||a===s)return;const r=n.from,o=Array.from(r.children).filter(l=>l!==n.item);r.insertBefore(n.item,o[a]??null),Lr(a,s),u("已调整播放顺序 · 播放模式已切回列表循环",{duration:1600})}})))}disconnectedCallback(){this._sortable?.destroy(),this._sortable=null,this._undismiss?.(),super.disconnectedCallback()}render(){const e=i.queueOpen?i.queue.map(a=>We(a)).filter(Boolean):[],n=new Map;if(i.queueOpen)for(let a=0;a<i.queue.length;a+=1)n.set(i.queue[a],a);return d`
      <section
        class="queue-panel"
        id="queue-panel"
        hidden
        data-state="closed"
        aria-label="播放列表"
      >
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
            @click=${()=>qo()}
          >
            ${f("disc")}
          </button>
          <button
            class="queue-panel__btn u-hit"
            id="queue-clear"
            type="button"
            data-tip="清空列表"
            aria-label="清空列表"
            @click=${()=>{Or(),u("播放列表已清空")}}
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
          @click=${a=>this.onClick(a)}
          @keydown=${a=>this.onKey(a)}
        >
          ${e.length?Te(e,a=>a.id,a=>this.item(a,n.get(a.id)??-1)):d`<div class="queue-panel__empty">播放列表是空的<br />从曲库把歌曲加进来</div>`}
        </div>
      </section>
    `}item(e,n){const a=e.id===i.currentId;return d`
      <div
        class="queue-item"
        data-queue-id=${e.id}
        aria-current=${String(a)}
        role="button"
        tabindex="0"
        draggable="true"
      >
        <span class="queue-item__index">${a&&i.playing?f("play"):n+1}</span>
        <span class="queue-item__cover"><img src=${gi(wt(e))} alt="" loading="lazy" /></span>
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
    `}onClick(e){if(Uo())return;const n=e.target.closest("[data-queue-del]");if(n){e.stopPropagation(),ys(n.dataset.queueDel);return}const a=e.target.closest("[data-queue-id]");a&&gs(a.dataset.queueId)}onKey(e){if(e.key!=="Enter"&&e.key!==" ")return;const n=e.target.closest?.("[data-queue-id]");n&&(e.preventDefault(),gs(n.dataset.queueId))}}ie("mp-queue-panel",pf);class ff extends Mn{static deps=e=>[e.optionsOpen,e.config.lyricsFontSize,e.config.glassAlpha,e.config.glassAlphaCustom,e.config.effectPreset,e.config.showLyrics,e.config.showDesktopLyrics,e.config.showDesktopWallpaper];get open(){return!!i.optionsOpen}get panelEl(){return this.querySelector("#options-panel")}close(){zo(!1)}firstUpdated(){this.bindDismiss("#btn-options"),this._sliders={size:Wt(this.querySelector("#opt-lyric-size"),{min:Vs,max:Ws,step:1,value:i.config.lyricsFontSize,format:e=>`${Math.round(e)}px`,onChange:e=>{i.config.lyricsFontSize=e,Dt("--lyric-size",`${e}px`),this.requestUpdate()},onCommit:()=>$()}),alpha:Wt(this.querySelector("#opt-alpha"),{min:20,max:95,step:1,value:i.config.glassAlphaCustom?i.config.glassAlpha:ks(),format:e=>`${Math.round(e)}%`,onChange:e=>{i.config.glassAlpha=e,i.config.glassAlphaCustom=!0,Js(e),this.requestUpdate()},onCommit:()=>$()})}}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}render(){const e=Math.round(i.config.lyricsFontSize),n=Math.round(i.config.glassAlphaCustom?i.config.glassAlpha:ks()),a=js();return d`
      <section
        class="options-panel"
        id="options-panel"
        hidden
        data-state="closed"
        aria-label="播放选项"
      >
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
              <span class="opt__range">${Vs}</span>
              <div class="slider" id="opt-lyric-size" role="slider" tabindex="0" aria-label="歌词字号">
                <div class="slider__rail"><div class="slider__fill"></div></div>
                <div class="slider__thumb"></div>
                <div class="slider__bubble"></div>
              </div>
              <span class="opt__range">${Ws}</span>
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
                ${Go.map(s=>d`<button
                      class="segmented__btn"
                      type="button"
                      role="radio"
                      id=${s.id}
                      data-mode=${s.value}
                      aria-checked=${String(s.value===a)}
                      ?disabled=${s.value===Q.wallpaper&&i.desktopWallpaperSupport?.supported===!1}
                      data-tip=${s.value===Q.wallpaper&&i.desktopWallpaperSupport?.supported===!1?i.desktopWallpaperSupport.reason:s.tip}
                      @click=${()=>this.pickDesktopMode(s)}
                    >
                      ${s.label}
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
                ${df.map(s=>d`<button
                      class="segmented__btn"
                      type="button"
                      data-value=${s.value}
                      aria-pressed=${String(s.value===(i.config.effectPreset||"off"))}
                      @click=${()=>this.pickEffect(s.value)}
                    >
                      ${s.label}
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
    `}pickDesktopMode(e){e.value!==js()&&uf(e.value)}toggleShowLyrics(){i.config.showLyrics=i.config.showLyrics===!1,$()}pickEffect(e){e!==(i.config.effectPreset||"off")&&(i.config.effectPreset=e,ii(),$())}}ie("mp-options-panel",ff);class hf extends Mn{static deps=e=>[e.sleepOpen,e.sleepTimer,e.config.sleepAfterSong,e.playing,e.currentId];get open(){return!!i.sleepOpen}get panelEl(){return this.querySelector("#sleep-panel")}close(){jo(!1)}constructor(){super(),this._tick=null,this._pendingMinutes=null}onConnected(){this._tick=setInterval(()=>{i.sleepOpen&&i.sleepTimer&&this.requestUpdate()},1e3)}onDisconnected(){this._tick&&clearInterval(this._tick),this._tick=null}firstUpdated(){this.bindDismiss("#btn-sleep"),this._slider=Wt(this.querySelector("#sleep-slider"),{min:0,max:300,step:1,value:0,format:e=>`${Math.round(e)} 分钟`,onChange:e=>{this._pendingMinutes=Math.round(e),this.requestUpdate()},onCommit:e=>{this._pendingMinutes=null,Wp(e)}})}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}updated(){super.updated();const e=i.sleepTimer,n=this.querySelector("#sleep-slider");if(e?.type==="duration"){const a=Math.max(0,e.until-Date.now());n?.dataset.dragging!=="true"&&this._slider?.set(Math.max(0,Math.round(a/6e4)),{silent:!0})}else n?.dataset.dragging!=="true"&&this._slider?.set(0,{silent:!0})}render(){const e=i.sleepTimer,n=mf(e,this._pendingMinutes);return d`
      <section
        class="sleep-panel"
        id="sleep-panel"
        hidden
        data-state="closed"
        aria-label="定时停止"
      >
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
              @click=${()=>Gp(!i.config.sleepAfterSong)}
            ></button>
          </div>
          <div class="sleep-panel__row">
            <button
              class="btn btn--sm"
              type="button"
              data-sleep-act="off"
              @click=${()=>Vo("已取消定时停止")}
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
    `}}function mf(t,e){if(typeof e=="number")return e<=0?{value:"未开启",sub:"拖到 0 即取消"}:{value:`${e} 分钟`,sub:"松手开始倒计时"};if(t?.type==="after-song")return{value:"等待本首播完",sub:"倒计时已结束，这首播完就暂停"};if(t?.type==="duration"){const n=Math.max(0,t.until-Date.now());return{value:`剩余 ${vf(n)}`,sub:`共 ${t.minutes} 分钟`}}return{value:"未开启",sub:"拖动滑块设置时长"}}function vf(t){const e=Math.max(0,Math.round(t/1e3)),n=Math.floor(e/3600),a=Math.floor(e%3600/60),s=e%60;return n>0?`${n} 小时 ${String(a).padStart(2,"0")} 分`:`${String(a).padStart(2,"0")}:${String(s).padStart(2,"0")}`}ie("mp-sleep-panel",hf);class bf extends Mn{static deps=()=>{const e=pn();return[e.open,e.revision]};get open(){return pn().open}get panelEl(){return this.querySelector("#download-panel")}close(){Qc()}firstUpdated(){this.bindDismiss("#btn-downloads")}disconnectedCallback(){this._undismiss?.(),super.disconnectedCallback()}render(){const{tasks:e,running:n}=pn(),a=e.some(s=>s?.state!=="running");return d`
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
            @click=${()=>Zc()}
          >
            ${f("folder")}
          </button>
          <button
            class="download-panel__btn u-hit"
            id="download-clear"
            type="button"
            data-tip="清除已完成"
            aria-label="清除已完成"
            ?disabled=${!a}
            @click=${()=>Jc()}
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
          ${e.length?Te(e,s=>s.id,s=>this.item(s)):d`<div class="download-panel__empty">还没有下载任务</div>`}
        </div>
      </section>
    `}item(e){const n=e.state==="running"?"running":e.state==="failed"?"failed":"done",a=Number(e.total)||0,s=Number(e.done)||0,r=a>0?Math.min(100,Math.round(s/a*100)):0,o=Math.max(0,Math.min(100,Math.round(r/5)*5)),l=n==="running";let c=`${r}%`;n==="done"?c="已完成":n==="failed"?c="失败":a<=0&&(c="下载中");let p;return l?p=a>0?`${Hn(s)} / ${Hn(a)}`:Hn(s):n==="done"?p=`${Hn(s||a)} · ${e.path?gf(e.path):e.dir||""}`:p=e.message||"下载失败",d`
      <div
        class="download-item"
        data-state=${n}
        data-download-id=${e.id}
        role=${n==="done"?"button":A}
        tabindex=${n==="done"?"0":A}
        data-tip=${n==="done"?"在文件夹中显示":A}
        @click=${()=>ed(e.id)}
      >
        <div class="download-item__title">${e.title||e.bvid||"未命名"}</div>
        <div class="download-item__state">${c}</div>
        <div class="download-item__bar" ?hidden=${!l} data-unknown=${a>0?"false":"true"}>
          <div class="download-item__fill" data-value=${o}></div>
        </div>
        <div class="download-item__meta${n==="failed"?" download-item__meta--error":""}">${p}</div>
      </div>
    `}}ie("mp-download-panel",bf);function Hn(t){const e=Number(t)||0;if(e<=0)return"0 B";const n=["B","KB","MB","GB"];let a=0,s=e;for(;s>=1024&&a<n.length-1;)s/=1024,a+=1;return`${s>=10||a===0?Math.round(s):s.toFixed(1)} ${n[a]}`}function gf(t){const e=String(t||""),n=Math.max(e.lastIndexOf("\\"),e.lastIndexOf("/"));return n>=0?e.slice(n+1):e}class yf extends Mn{static deps=()=>[q.open,q.songId,q.rev,Tn(),i.config.coverCarousel,i.config.embedMeta];get open(){return q.open}get panelEl(){return this.querySelector("#cover-layer")}close(){cn()}render(){const e=this.song();return d`
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
              @click=${()=>cn()}
            >
              ${f("close")}
            </button>
          </div>
          <div class="cover-layer__body" id="cover-layer-body">${e&&this.open?this.panel(e):A}</div>
        </div>
      </div>
    `}song(){const e=q.songId;return e&&i.songs.find(n=>n.id===e)||null}panel(e){const n=q,a=el(e);return d`
      <div class="cover-panel">
        <div class="cover-panel__current">
          <div class="cover-panel__frame" id="cover-current-frame">
            ${a?d`<img src=${a} alt=${e.title} 原始封面 />`:d`<span class="cover-panel__none">${f("music")}</span>`}
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
          ${n.candidates.length?this.selectbar():A}
        </div>

        <div class="cover-panel__foot">
          <button
            class="btn btn--sm"
            type="button"
            data-cover-act="open-cache"
            @click=${()=>this.openCacheDir()}
          >
            ${f("folder")}<span>打开缓存目录</span>
          </button>
        </div>
      </div>
    `}setItems(){const e=q,n=e.currentSet?.items||[],a=e.currentSet?.embedded||[],s=Number(e.currentSet?.active)||0;return!n.length&&!a.length?d`<div class="cover-set__empty">还没有换过封面，这首歌现在用的是文件自带的封面。</div>`:d`
      ${n.map((r,o)=>d`
          <div class="cover-set__item" data-set-index=${o} data-active=${String(o===s)}>
            <img src=${r.preview} alt="" />
            ${o===s?d`<span class="cover-set__badge">当前</span>`:A}
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
      ${a.map(r=>d`
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
    `}cards(){const e=q;return Te(e.candidates,n=>n.preview,(n,a)=>{const s=e.selected.has(n);return d`
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
        `})}selectbar(){const e=q,n=e.selected.size===e.candidates.length;return d`
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
    `}onClick(e){if(e.target.closest("[data-cover-close]")||e.target===this.panelEl){cn();return}const n=e.target.closest("[data-set-act]");if(n){const a=Number(n.closest("[data-set-index]")?.dataset.setIndex);n.dataset.setAct==="use"&&this.useExisting(a),n.dataset.setAct==="remove"&&this.removeExisting(a)}}onKey(e){if(e.key!=="Escape")return;const n=this.querySelector("#cover-keyword");if(n&&document.activeElement===n&&n.value.trim()){q.keyword="",n.value="";return}cn()}toggleCandidate(e){const n=q.candidates[e];n&&(q.selected.has(n)?q.selected.delete(n):q.selected.add(n),qe())}selectAll(){const e=q;e.selected.size===e.candidates.length?e.selected.clear():e.candidates.forEach(n=>e.selected.add(n)),qe()}async runSearch(){const e=q;if(e.busy)return;if(!k()){ee("浏览器预览下没有联网封面后端，请在应用里试");return}e.busy=!0;const n=e.candidates.filter(s=>s.local);e.candidates=[...n],e.selected=new Set(n),qe();const a=(this.querySelector("#cover-keyword")?.value||"").trim();ee(a?`正在按「${a}」同时查询多个来源（${wr()}）…`:`正在同时查询多个来源（${wr()}）…`);try{const s=a?{keyword:a}:{},r=await v.coverLookupSongAll(e.songId,s),o=Array.isArray(r)?r.filter(l=>l?.ok&&l.preview):[];if(o.length){e.candidates=[...n,...o.map(c=>({...c,local:!1}))];const l=[...new Set(o.map(c=>c.provider).filter(Boolean))];ee(`找到 ${o.length} 张（来源：${l.join(" / ")||"未知"}），勾选后点「应用」`)}else{e.candidates=[...n];const l=Array.isArray(r)?r.find(c=>c?.message)?.message:"";ee(l||"没有找到匹配的封面（也可能是匹配到的都是空白图，已自动丢弃）")}}catch(s){ee(`搜索失败：${s?.message??s}`)}finally{e.busy=!1,qe()}}async pickLocal(){const e=q;if(!k()){ee("浏览器预览下没有系统文件选择器，请在应用里试");return}ee("正在读取图片…");try{const n=await v.coverPickLocal();if(!n||n.cancelled){ee("");return}if(!n.ok||!n.preview){ee(n?.message||"这张图片没法用作封面");return}const a={preview:n.preview,provider:n.provider||"本地图片",source:n.source||"",width:n.width,height:n.height,local:!0};e.candidates.unshift(a),e.selected.add(a),qe(),ee(`已加入本地图片${n.source?`（${n.source}）`:""}，确认后点「应用」`)}catch(n){ee(`选择图片失败：${n?.message??n}`)}}async applySelected(){const e=q.candidates.filter(n=>q.selected.has(n)).map(n=>n.preview).filter(Boolean);if(!e.length){ee("先勾选至少一张封面");return}await this.writeCovers(()=>v.coverAddMany(q.songId,e,i.config.embedMeta===!0))}async useExisting(e){Number.isFinite(e)&&await this.writeCovers(()=>v.coverSetActive(q.songId,e))}async useEmbedded(e){e?.preview&&await this.writeCovers(()=>v.coverAdd(q.songId,"",e.preview,i.config.embedMeta===!0))}async removeExisting(e){Number.isFinite(e)&&await this.writeCovers(()=>v.coverRemove(q.songId,e))}async openCacheDir(){try{await v.coverOpenCacheDir("covers")}catch(e){u(`打开缓存目录失败：${e?.message??e}`,{tone:"error",duration:5e3})}}async writeCovers(e){const n=q;if(!k()){ee("浏览器预览下没有封面后端，请在应用里试");return}ee("正在保存…");try{const a=await e();a&&Array.isArray(a.items)&&(n.currentSet=a,ws(n.songId,a)),ee(a?.message||"已更新封面"),ir(),u(a?.message||"封面已更新",{tone:"success",duration:1800})}catch(a){ee(`保存失败：${a?.message??a}`)}}toggleCarousel(){i.config.coverCarousel=!i.config.coverCarousel,$(),u(i.config.coverCarousel?`已开启封面轮播（每 ${Number(i.config.coverCarouselInterval)||10} 秒换一张）`:"已关闭封面轮播",{duration:1600})}toggleEmbed(){i.config.embedMeta=!i.config.embedMeta,$(),u(i.config.embedMeta?"之后的封面会写进歌曲文件本身":"封面只保存在缓存目录（不改动音乐文件）",{duration:2200})}async refreshSet(){const e=q;if(!(!k()||!e.songId))try{const n=await v.coverList(e.songId);n&&Array.isArray(n.items)&&(e.currentSet=n,ws(e.songId,n),ir())}catch(n){ee(`读取现有封面失败：${n?.message??n}`)}}}ie("mp-cover-layer",yf);const q={open:!1,songId:"",candidates:[],selected:new Set,currentSet:null,busy:!1,status:"",keyword:"",rev:0};function qe(){q.rev+=1,ve()}function ee(t){q.status=t||"",qe()}const _f=()=>document.querySelector("mp-cover-layer");function wr(){return ci(i.coverProviders,bo())}function wf(t){if(!i.songs.find(a=>a.id===t)){u("这首歌不在本地曲库里，无法更换封面",{tone:"warning"});return}Object.assign(q,{open:!0,songId:t,candidates:[],selected:new Set,currentSet:i.coverSets.get(t)||null,status:"",keyword:""}),qe(),_f()?.refreshSet(),$f()}function cn(){q.open=!1,qe()}async function $f(){if(!(i.coverProviders?.length||!k()))try{const t=await v.coverProviders();Array.isArray(t?.providers)&&t.providers.length&&(i.coverProviders=t.providers,qe())}catch{}}const xt=[{id:"library",label:"曲库"},{id:"player",label:"播放器"},{id:"ui",label:"用户界面"},{id:"data",label:"下载与缓存"},{id:"ai",label:"AI"},{id:"about",label:"关于"}],kf=[{value:-14,label:"较响（流媒体常见）"},{value:-16,label:"推荐（默认）"},{value:-18,label:"温和"},{value:-23,label:"广播级"}],Sf=[{value:"off",label:"关闭"},{value:"track",label:"逐曲均衡"},{value:"album",label:"同专辑统一"}];function L({label:t,hint:e,control:n}){return d` <div class="setting">
    <div class="setting__main">
      <div class="setting__label">${t}</div>
      ${e?d`<div class="setting__hint">${e}</div>`:A}
    </div>
    <div class="setting__control">${n}</div>
  </div>`}function te(t,e,n){return d`<button
    class="switch"
    type="button"
    role="switch"
    aria-checked=${String(!!e)}
    data-toggle=${t}
    aria-label=${n}
  ></button>`}function Se(t,e,n){return d` <div class="segmented" data-segment=${t}>
    ${e.map(a=>d`<button
          class="segmented__btn"
          type="button"
          data-value=${a.value}
          aria-pressed=${String(String(a.value)===String(n))}
        >
          ${a.label}
        </button>`)}
  </div>`}function xf(t){const e=t.aiVendor||"auto",n=oo(e),a="开启后模型会先推理再给结论，响应更慢；关闭则直接作答";return e==="auto"?a+"；自动识别："+(n||"按接口地址与模型名判断厂商"):n?a+"；该厂商："+n:a}function an(t,e,n){return d` <div class="rangeslider">
    <div class="slider" id=${t} role="slider" tabindex="0" aria-label=${n} data-slider=${e}>
      <div class="slider__rail"><div class="slider__fill"></div></div>
      <div class="slider__thumb"></div>
      <div class="slider__bubble"></div>
    </div>
    <!-- 数值由滑杆自己写（见 sliderOptions 的 onChange）：同一个节点只允许一个写入方 -->
    <span class="rangeslider__value"></span>
  </div>`}function Cf(t){const e=Number(t);i.config.trackGapSeconds=Number.isFinite(e)?e:1.5,si()}function Tf(t,e){if(t===e)return!0;if(!t||!e||t.length!==e.length)return!1;for(let n=0;n<t.length;n+=1)if(t[n]!==e[n])return!1;return!0}class Ef extends ge{static deps=e=>[e.settingsOpen,e.settingsRev,e.settingsSection,e.view,e.folders,e.filterRules,e.songs,e.allSongsRaw,e.lastScan?.at??0,e.scanning,Tc(),Co(),e.config,e.coverProviders,e.coverBreaker,e.coverCache,e.loudnessState,e.ffmpegState,e.updateRev];constructor(){super(),this._activeSection=xt[0].id,this._navPausedUntil=0,this._navResumeTimer=null,this._sliders=new WeakMap,this._derivedKey=null,this._derived=null,this._throttledNavFollow=tl(e=>this.navFollow(e))}settingsDerived(){const e=[i.songs,i.allSongsRaw,i.folders,i.filterRules,i.songs.length,i.allSongsRaw.length];if(this._derivedKey&&Tf(this._derivedKey,e))return this._derived;const n=new Map;for(const o of i.folders){let l=0;for(const c of i.songs)c.path.startsWith(o.path)&&(l+=1);n.set(o.id,l)}const a=Rr(i.allSongsRaw,i.filterRules);let s=0,r=0;for(const o of i.songs)s+=o.duration,r+=o.size;return this._derivedKey=e,this._derived={perFolder:n,rules:a,totalDuration:s,totalBytes:r},this._derived}get open(){return Ur()}get panelEl(){return this.querySelector("#settings-layer")}updated(){const e=this.panelEl;if(e){if(this.open){if(this._closeTimer&&(clearTimeout(this._closeTimer),this._closeTimer=null),e.hidden){e.hidden=!1,e.dataset.state="",requestAnimationFrame(()=>{this.open&&(e.dataset.state="opened")});const n=this.querySelector(".settings-layer__body");n&&(n.scrollTop=0)}this.bindSliders(),$p();return}e.hidden||(e.dataset.state="closed",!this._closeTimer&&(this._closeTimer=setTimeout(()=>{this._closeTimer=null,!this.open&&e&&(e.hidden=!0)},Ks()+40)))}}onConnected(){this._onScrollCapture=e=>this.onScroll(e),this.addEventListener("scroll",this._onScrollCapture,!0)}onDisconnected(){this._onScrollCapture&&(this.removeEventListener("scroll",this._onScrollCapture,!0),this._onScrollCapture=null),this._navResumeTimer&&clearTimeout(this._navResumeTimer),this._navResumeTimer=null}disconnectedCallback(){this._closeTimer&&clearTimeout(this._closeTimer),this._closeTimer=null,super.disconnectedCallback()}render(){return cr(),d`
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
              @click=${()=>ia()}
            >
              ${f("close")}
            </button>
          </div>
          <div class="settings-layer__body">
            <div class="settings">
              <div class="settings__nav" role="tablist">
                ${xt.map(e=>d`<button
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
              ${this.loudnessCard()} ${this.themeCard()} ${this.playerCard()} ${this.listCard()}
              ${this.systemCard()} ${this.onlineCard()} ${this.aiCard()} ${this.updateCard()}
              ${this.aboutCard()} ${this.techCard()} ${this.libsCard()} ${this.licenseCard()}
              ${this.creditsCard()}
            </div>
          </div>
        </div>
      </section>
    `}foldersCard(){const e=this.settingsDerived(),n=i.folders.length?i.folders.map(a=>{const s=a.status==="ok"?d`<span class="chip chip--ok"
                  ><i class="chip__dot"></i>${a.watching?"监听中":"已停止监听"}</span
                >`:a.status==="missing"?d`<span class="chip chip--error"><i class="chip__dot"></i>路径不存在</span>`:d`<span class="chip chip--warn"><i class="chip__dot"></i>无访问权限</span>`,r=e.perFolder.get(a.id)??0;return d` <div class="pathrow" data-folder=${a.id}>
            <svg class="pathrow__icon" aria-hidden="true"><use href="#i-folder"></use></svg>
            <div class="pathrow__main">
              <div class="pathrow__path u-selectable" title=${a.path}>${a.path}</div>
              <div class="pathrow__meta">${s}<span>${E(r)} 首</span></div>
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
          </div>`}):d`<div class="setting__hint">还没有添加音乐文件夹。</div>`;return d` <section class="card" id="sec-folders" data-section="library">
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
            ${te("autoScanOnStart",i.config.autoScanOnStart,"启动时自动扫描")}
          </div>
        </div>
        ${L({label:"实时监听文件夹变化",hint:"新增、删除、重命名文件后自动更新曲库（需要后端文件监听）",control:te("watchFolders",i.config.watchFolders,"实时监听")})}
        ${L({label:"元数据并发读取",hint:"同时解析的音频文件数量，机械硬盘建议调低",control:Se("scanConcurrency",[2,4,8].map(a=>({value:String(a),label:`${a}`})),String(i.config.scanConcurrency))})}
      </div>
      <div class="card__foot">
        <span>支持格式：mp3 · flac · wav · m4a · ogg · aac（ape / wma 需转码）</span>
        <span class="u-num">${E(i.folders.length)} 个文件夹</span>
      </div>
      ${this.unplayableSection()}
    </section>`}unplayableSection(){const e=i.unplayableFiles||[],n=e.length,a=!i.unplayableLoaded,s=i.unplayableOpen===!0;return!n&&!a?d` <div class="unplayable unplayable--empty">
        <span class="unplayable__ok">${f("check")}</span>
        <span>没有发现放不出来的文件</span>
        <span class="unplayable__hint">播放时若某个文件解不出来，会自动记录到这里</span>
      </div>`:d` <div class="unplayable">
      <button
        class="unplayable__head"
        type="button"
        data-act="unplayable-toggle"
        aria-expanded=${String(s)}
        ?disabled=${a}
      >
        <span class="unplayable__icon">${f("info")}</span>
        <span class="unplayable__label">
          ${a?d`正在读取清单…`:d`发现 <b>${E(n)}</b> 个无法播放的文件`}
        </span>
        ${a?A:d`<span class="unplayable__cta">${s?"收起":"查看是哪些文件"}</span>`}
        ${a?A:d`<span class="unplayable__chev" data-open=${String(s)}
              >${f(s?"chevron-down":"chevron-right")}</span
            >`}
      </button>
      ${s&&n?this.unplayableList(e):A}
    </div>`}unplayableList(e){return d` <div class="unplayable__body">
      <div class="unplayable__rows">
        ${e.map(n=>{const a=n.path?n.path:n.songId||"";return d` <div class="unplayable__row">
            <div class="unplayable__main">
              <div class="unplayable__title" title=${n.title||""}>${n.title||n.songId||"（未知文件）"}</div>
              <div class="unplayable__sub">
                ${n.artist?d`<span>${n.artist}</span>`:A}
                ${n.ext?d`<span class="unplayable__tag">.${n.ext}</span>`:A}
                ${n.attempts>1?d`<span>失败 ${E(n.attempts)} 次</span>`:A}
                ${n.at?d`<span>${new Date(n.at).toLocaleString("zh-CN")}</span>`:A}
              </div>
              <!-- 路径可选中复制：用户要拿它去文件管理器里找 / 重新下载 -->
              <div class="unplayable__path u-selectable" title=${a}>${a}</div>
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
          这些文件在播放时解不出来，已从曲库移除（<b>磁盘文件没有被删除</b>）。 修好文件后点「已修好」重新扫描即可回到曲库。
        </span>
        <button class="btn btn--ghost btn--sm" type="button" data-act="unplayable-clear">
          ${f("trash")}<span>清空清单</span>
        </button>
      </div>
    </div>`}ruleRow(e){const n=e.type==="regex"&&e.value&&!ql(e.value);return d` <div class="rule" data-rule=${e.id} data-enabled=${String(e.enabled)}>
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
        ${e.type==="size"?[["lt","小于"],["lte","小于等于"],["gt","大于"],["gte","大于等于"],["eq","等于"]].map(([a,s])=>d`<option value=${a} ?selected=${e.op===a}>${s}</option>`):d`<option value="match" ?selected=${e.op==="match"}>匹配</option>`}
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
    </div>`}rulesCard(){const{kept:e,excluded:n,total:a}=this.settingsDerived().rules;return d` <section class="card" id="sec-filters" data-section="library">
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
        ${i.filterRules.length?i.filterRules.map(s=>this.ruleRow(s)):d`<div class="setting__hint">还没有规则。下面的预置规则可以一键添加。</div>`}
        <div class="rule__preview">
          当前规则下：共扫描 <b>${E(a)}</b> 个文件，保留 <b>${E(e.length)}</b> 首，过滤掉
          <b>${E(n)}</b> 个
        </div>
      </div>
      <div class="card__foot">
        <span>「排除」优先于「仅包含」；支持正则表达式（忽略大小写）</span>
        <span>大小单位在数值后填写，默认字节</span>
      </div>
    </section>`}themeCard(){const e=wa(),n=cr(),a=window.matchMedia("(prefers-color-scheme: dark)").matches;return d` <section class="card" id="sec-appearance" data-section="ui">
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
        ${e.map(s=>{const r=i.config.theme===s.id;return d` <div class="themecard" data-active=${String(r)}>
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
              <span class="themecard__swatch">${n(s).map(o=>d`<i data-swatch=${o}></i>`)}</span>
              <span class="themecard__name">${s.name}</span>
              <span class="themecard__id">${s.id}.css</span>
            </button>
            ${s.builtin?d`<span class="themecard__badge">内置</span>`:d`<button
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
        ${L({label:"深浅色模式",hint:`当前系统偏好：${a?"深色":"浅色"}`,control:Se("themeMode",[{value:"dark",label:"深色"},{value:"light",label:"浅色"},{value:"system",label:"跟随系统"}],i.config.themeMode)})}
        ${L({label:"毛玻璃模糊强度",hint:"控制面板背后内容的模糊程度",control:an("set-blur","glassBlur","模糊强度")})}
        ${L({label:"面板不透明度",hint:"面板背景的透明程度，数值越大越透",control:an("set-alpha","glassAlpha","不透明度")})}
        ${L({label:"界面动画",hint:"关闭后取消过渡与旋转动画，低性能设备更流畅",control:te("animations",i.config.animations,"界面动画")})}
        ${L({label:"过渡速度",hint:"弹出层、菜单、面板的进出动画时长；默认快速 0.25 秒",control:Se("animationsSpeed",tp,i.config.animationsSpeed||"fast")})}
        ${L({label:"背景动效（播放界面）",hint:"只影响播放详情页里样式绘制的背景动画。「流畅优先」跟随屏幕刷新率（高刷屏更顺滑）；「性能优先」限制帧率并让暂停后的画面停住，更省电。其他界面（设置、曲库列表）始终满帧，不受此项影响。",control:Se("skinPerformanceMode",np,i.config.skinPerformanceMode||"smooth")})}
        ${L({label:"主题色跟随封面",hint:"从当前封面提取主色调，作为界面主题色",control:te("accentFromCover",i.config.accentFromCover,"主题色跟随封面")})}
      </div>
    </section>`}listCard(){return d` <section class="card" id="sec-list" data-section="ui">
      <div class="card__head">
        <div class="card__icon">${f("density")}</div>
        <div class="card__titles">
          <div class="card__title">歌曲列表</div>
          <div class="card__desc">列表显示哪些列、每行多高</div>
        </div>
      </div>
      <div class="card__body">
        ${L({label:"显示专辑列",hint:"窄窗口下会自动隐藏该列",control:te("showAlbumColumn",i.config.showAlbumColumn,"显示专辑列")})}
        ${L({label:"列表密度",hint:"对「本地歌曲」「播放列表」「歌单」三个列表同时生效",control:Se("listDensity",ep,i.config.listDensity||"cozy")})}
      </div>
    </section>`}systemCard(){return d` <section class="card" id="sec-system" data-section="ui">
      <div class="card__head">
        <div class="card__icon">${f("options")}</div>
        <div class="card__titles">
          <div class="card__title">窗口与系统</div>
          <div class="card__desc">圆角与关闭行为；这些设置与系统能力相关</div>
        </div>
      </div>
      <div class="card__body">
        ${L({label:"窗口圆角",hint:"主窗口四角的圆角幅度。圆角由系统绘制，只有这几档（仅 Windows 11 有效）",control:Se("windowCorners",Zu,i.config.windowCorners||"system")})}
        ${L({label:"关闭时最小化到托盘",hint:"打开后点关闭按钮只把窗口收进系统托盘（任务栏右下角），音乐照常播放；要真正退出请用托盘图标的右键菜单",control:te("minimizeToTray",i.config.minimizeToTray,"关闭时最小化到托盘")})}
        ${L({label:"记忆窗口位置与大小",hint:"退出时记住主窗口的位置、尺寸和最大化状态，下次打开回到原处。换显示器或改分辨率后如果窗口跑到屏幕外，会自动回到居中默认大小；也可以在这里手动重置",control:d`<button
            class="btn btn--ghost btn--sm"
            type="button"
            data-act="reset-main-window-geometry"
            data-tip="把主窗口移回屏幕中央并恢复默认大小"
          >
            重置窗口位置
          </button>`})}
      </div>
    </section>`}playerCard(){const e=va(),n=So();return d` <section class="card" id="sec-player" data-section="ui">
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
        ${e.map(a=>{const s=i.config.playerViewMode===a.id,r=Array.isArray(a.colorsMissing)?a.colorsMissing:[],o=a.chrome||null,l=!o||o.theme===!0,c=l?null:o.preview,p=r.length?`未声明配色（缺 ${r.join(" / ")}）：宿主已用主题配色兜底`:l?"跟随宿主主题配色":o.contrast?`底色 / 前景 · 对比度 ${o.contrast}:1${o.corrected?"（宿主已自动纠正到可读）":""}`:"已声明配色",m=r.length?`清单里的配色不完整（${r.join(" / ")}）：宿主控件栏已降级使用主题配色。建议在 skin.json 的 colors 里补上 bg / fg`:"";return d` <div class="skincard" data-active=${String(s)}>
            <button
              class="skincard__pick"
              type="button"
              data-act="skin-pick"
              data-id=${a.id}
              aria-pressed=${String(s)}
              aria-label=${`使用样式 ${a.name}`}
            >
              <span class="skincard__icon">${this.skinIcon(a)}</span>
              <span class="skincard__name">${a.name}</span>
              <span class="skincard__id">${a.id}</span>
              <span class="skincard__colors" data-tip=${p} aria-label=${p}>
                <i
                  class="skincard__swatch"
                  style=${c?.bg?`background:${c.bg}`:"background:var(--surface-2)"}
                ></i>
                <i
                  class="skincard__swatch skincard__swatch--fg"
                  style=${c?.fg?`background:${c.fg}`:"background:var(--text-1)"}
                ></i>
              </span>
              ${r.length?d`<span class="skincard__warn" data-tip=${m} aria-label=${m}
                    >${f("warning")}</span
                  >`:A}
            </button>
            ${a.builtin?A:d`<span class="skincard__badge">第三方</span>
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
      ${n.length?d`<div class="card__body">
              ${n.map(a=>d` <div class="setting">
                    <div class="setting__main">
                      <div class="setting__label">样式「${a.id}」加载失败</div>
                      <div class="setting__hint">${a.reason}</div>
                    </div>
                  </div>`)}
            </div>`:A}
      <div class="card__body">
        ${L({label:"封面轮播",hint:"一首歌有多张封面时，播放详情页按下面的间隔轮换显示（不影响列表缩略图）",control:te("coverCarousel",i.config.coverCarousel===!0,"封面轮播")})}
        ${L({label:"轮播间隔",hint:"每隔多少秒切换一张",control:an("set-carousel","coverCarouselInterval","轮播间隔")})}
      </div>
    </section>`}skinIcon(e){return e.iconUrl?d`<i class="skin-icon" style=${`--skin-icon:url("${e.iconUrl}")`}></i>`:f(e.icon||"disc")}playbackCard(){return d` <section class="card" id="sec-playback" data-section="player">
      <div class="card__head">
        <div class="card__icon">${f("headphones")}</div>
        <div class="card__titles">
          <div class="card__title">播放</div>
          <div class="card__desc">播放模式、随机方式与单击歌曲时的行为</div>
        </div>
      </div>
      <div class="card__body">
        ${L({label:"默认播放模式",hint:"点击底栏循环按钮可随时切换",control:Se("playMode",[{value:"sequence",label:"列表循环"},{value:"loop-one",label:"单曲循环"},{value:"shuffle",label:"随机"}],i.config.playMode==="loop-all"?"sequence":i.config.playMode)})}
        ${L({label:"随机播放方式",hint:"随机播放会先打乱当前播放列表，再按打乱后的顺序播放",control:Se("shuffleMode",[{value:"reshuffle",label:"播完重新打乱"},{value:"once",label:"只打乱一次"}],i.config.shuffleMode||"reshuffle")})}
        ${L({label:"记忆音量",hint:"记住上次的音量，下次启动时恢复",control:te("rememberVolume",i.config.rememberVolume!==!1,"记忆音量")})}
        ${L({label:"保留歌曲播放进度",hint:"记住每首歌上次播到哪儿；退出后重新打开会回到那个位置。只恢复进度条，不会自动开始播放",control:te("resumeProgress",i.config.resumeProgress===!0,"保留歌曲播放进度")})}
        ${L({label:"跳过开头无声片段",hint:d`开头有一段空白时，播放会自动从出声处开始，不必干等（现场录音与转录文件常见）。<br />
            只跳过开头连续 0.2 秒以上的静音，乐句之间的短暂停顿不会被误伤。<br />
            <span class="u-dim">歌曲长度与进度条仍按原曲显示，歌词与播放进度不会因此错位。</span>`,control:te("skipSilenceHead",i.config.skipSilenceHead===!0,"跳过开头无声片段")})}
        ${L({label:"跳过结尾无声片段",hint:d`结尾拖着一长段空白时，播到最后一个声音就结束，紧接着切下一首（CD 抓轨与整轨转录常见）。<br />
            <span class="u-dim">歌曲长度仍按原曲显示；进度条会在原曲的静音起点处停住。</span>`,control:te("skipSilenceTail",i.config.skipSilenceTail===!0,"跳过结尾无声片段")})}
        ${L({label:"切歌间隔",hint:"自动切到下一首时中间留出的停顿。手动点「下一首」不受影响（那是即时的操作）；调到 0 表示紧接着播",control:an("set-track-gap","trackGapSeconds","切歌间隔")})}
        ${L({label:"单击歌曲时的行为",hint:d`双击始终是「立即播放这一首」，此设置只影响单击。<br />
            播放：立刻播放这首歌，并加入播放列表；<br />
            播放当前列表：用当前整个列表替换播放队列，从这首歌开始播；<br />
            下一首播放：插到当前歌曲后面，下一次「下一曲」时播放。`,control:Se("rowClickAction",Ju,i.config.rowClickAction||"next")})}
      </div>
    </section>`}lyricsCard(){return d` <section class="card" id="sec-lyrics" data-section="player">
      <div class="card__head">
        <div class="card__icon">${f("lyrics")}</div>
        <div class="card__titles">
          <div class="card__title">歌词</div>
          <div class="card__desc">歌词来源优先级与显示效果</div>
        </div>
      </div>
      <div class="card__body">
        ${L({label:"歌词来源优先级",hint:"内嵌歌词 → 同目录 .lrc → 歌词缓存 → 在线自动匹配；本地读不到时会自动联网匹配并存入缓存",control:d`<span class="chip"><i class="chip__dot"></i>${sp()}</span>`})}
        ${L({label:"歌词字号",hint:"歌词文字大小，当前播放的那一行会略微放大（底栏「选项」里也能调）",control:an("set-lyric-size","lyricsFontSize","歌词字号")})}
        ${L({label:"居中高亮行数",hint:"当前行上下各显示的行数",control:Se("lyricsLines",[3,5,7,9].map(e=>({value:String(e),label:String(e)})),String(i.config.lyricsLines))})}
      </div>
    </section>`}loudnessCard(){const e=i.config,n=i.loudnessState||{},a=n.measured??0,s=n.missing??Math.max(0,i.songs.length-a),r=n.total??i.songs.length,o=n.available!==!1,c=(i.ffmpegState||{}).describe||n.describe||"检测中…";return d` <section class="card" id="sec-loudness" data-section="player">
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
        <div class="setting__control">${Se("loudnessMode",Sf,e.loudnessMode||"off")}</div>
      </div>

      <div class="setting">
        <div class="setting__label">
          <span>目标响度</span>
          <small class="u-fs-xs u-dim">数值越小整体越轻，推荐用默认档。改动后会自动重新计算</small>
        </div>
        <div class="setting__control">
          <div class="select">
            <select class="select__field" data-act="loudness-target" aria-label="目标响度">
              ${kf.map(p=>d`<option value=${p.value} ?selected=${Number(e.loudnessTarget)===p.value}>
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
          当前设置下已算好 <b>${a}</b> / ${r}
          首${s?d`，其余 <b>${E(s)}</b> 首会在播放时计算`:"（全部已算好）"}<br />
          响度来源：<b>${o?c:"不可用"}</b>
        </div>
      </div>
    </section>`}onlineCard(){const e=i.config.downloadDir||"（默认：系统音乐目录 / downloads）",n=i.coverProviders||[],a=i.coverBreaker||{},s=n.length?n.map(r=>a[r]?`${Ps(r)}（暂时不可用）`:Ps(r)).join(" · "):"正在读取…";return d` <section class="card" id="sec-online" data-section="data">
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

        ${L({label:"联网获取封面",hint:`在线搜索到的歌曲会自动去公开曲库匹配封面：${s}`,control:te("onlineCover",i.config.onlineCover!==!1,"联网获取封面")})}
        ${L({label:"把封面/歌词写进歌曲文件",hint:ip(),control:te("embedMeta",i.config.embedMeta===!0,"写进歌曲文件")})}

        <div class="setting setting--stack">
          <div class="setting__main">
            <div class="setting__label">把已有缓存补写进文件</div>
            <div class="setting__hint">${rp()}</div>
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
            <div class="setting__hint">封面与歌词的缓存位置；${bi()}</div>
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
        <span>封面来自公开曲库（${bo()}），匹配结果不保证完全准确</span>
        <button class="btn btn--sm" type="button" data-act="cover-refresh">
          ${f("refresh")}<span>清空封面与歌词缓存</span>
        </button>
      </div>
    </section>`}aiCard(){const e=i.config||{},n=!!e.aiApiKeySet||!!String(e.aiApiKey||"").trim(),a=!!(String(e.aiBaseUrl||"").trim()&&n),s=(r,o,l,c,p="text")=>d` <div class="setting setting--stack">
        <div class="setting__main">
          <div class="setting__label">${r}</div>
          <div class="setting__hint">${o}</div>
        </div>
        <input
          class="input"
          type=${p}
          data-act="ai-field"
          data-key=${l}
          .value=${l==="aiApiKey"?"":e[l]||""}
          placeholder=${l==="aiApiKey"&&n?"已保存（留空则保持不变，输入新值可替换）":c}
          autocomplete="off"
          spellcheck="false"
        />
      </div>`;return d` <section class="card" id="sec-ai" data-section="ai">
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
        ${L({label:"模型类型",hint:"不同厂商对思考模式的支持方式不同，选错会导致这个开关不生效；选「自动识别」可自动判断",control:d` <select class="select__field" data-act="ai-vendor" aria-label="模型类型">
            ${ai.map(r=>d`<option value=${r.id} ?selected=${r.id===(e.aiVendor||"auto")}>${r.label}</option>`)}
          </select>`})}
        ${L({label:"启用思考模式",hint:xf(e),control:te("aiThinking",!!e.aiThinking,"启用思考模式")})}
        ${L({label:"自动匹配歌词时使用 AI 清洗元数据",hint:"自动匹配歌词前先用 AI 从文件名里还原真实的标题 / 歌手。AI 一次调用可能要十几秒，关掉后只做本地整理：匹配更快，但文件名不规范时命中率会低一些",control:te("aiLyricsClean",i.config.aiLyricsClean!==!1,"自动匹配歌词时使用 AI 清洗元数据")})}
        ${L({label:"下载歌曲时用 AI 整理元数据",hint:"下载完成（直接下载或从试听缓存搬运）后，在后台把文件名与现有信息交给 AI，还原出真实的标题 / 歌手 / 专辑并写回歌曲文件。整理在下载结束后才发生，不会拖慢下载；写回会改写文件标签且不可撤销，只在 AI 给出非空字段时才写。支持 m4a / flac，其它格式只更新曲库",control:te("aiDownloadTag",i.config.aiDownloadTag!==!1,"下载歌曲时用 AI 整理元数据")})}
        <div class="setting__hint">
          ${a?"已配置：自动匹配封面时，会先把文件名与现有元数据交给 AI 清洗，再去匹配。":"尚未配置：填入 Base URL 与 API Key 后自动启用。"}
        </div>
      </div>
    </section>`}aboutCard(){const e=i.appVersion||Si,n=i.lastScan,{totalDuration:a,totalBytes:s}=this.settingsDerived();return d` <section class="card" id="sec-about" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("info")}</div>
        <div class="card__titles">
          <div class="card__title">关于 ${xi}</div>
          <div class="card__desc">${Bl}</div>
        </div>
      </div>
      <div class="card__body">
        <div class="about-hero">
          <div class="about-hero__main">
            <div class="about-hero__title">
              <span class="about-hero__name">${xi}</span>
              <span class="about-hero__version">v${e}</span>
              <span class="chip chip--ok"><i class="chip__dot"></i>${Fl}</span>
            </div>
            <div class="about-hero__meta">${Ul} · ${Hl}</div>
            <div class="about-hero__meta">${zl}</div>
          </div>
          <div class="about-hero__links">
            ${jl.map(r=>d`<button
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
          <div class="kv__v">${Math.floor(a/36e5)} 小时 ${Math.floor(a%36e5/6e4)} 分</div>
          <div class="kv__k">占用空间</div>
          <div class="kv__v">${Zt(s)}</div>
          <div class="kv__k">上次扫描</div>
          <div class="kv__v">${n?new Date(n.at).toLocaleString("zh-CN"):"—"}</div>
          <div class="kv__k">缓存目录</div>
          <div class="kv__v">${i.config.cacheDir}</div>
        </div>
      </div>
      <div class="card__foot">
        <span>版本号来自后端常量（services_app.go#appVersion），与安装包元数据同源</span>
      </div>
    </section>`}updateCard(){const e=i.update||{},n=e.check,a=n?.current||i.appVersion||Si,s=n?.latest||"",r=bs(e.channel),o=e.pending,l=e.progress;return d` <section class="card" data-section="about" id="sec-update">
      <div class="card__head">
        <div class="card__icon">${f("refresh")}</div>
        <div class="card__titles">
          <div class="card__title">版本更新</div>
          <div class="card__desc">从 GitHub Releases 检测新版本；网络不好时可走加速代理下载</div>
        </div>
        <span class="u-spacer"></span>
        <span class="chip ${s?"chip--ok":""}"><i class="chip__dot"></i>当前 v${a}</span>
      </div>
      <div class="card__body">
        ${this.updateStatusBlock({check:n,current:a,latest:s,pending:o,progress:l})}

        ${e.error&&!n?.error?d`<div class="setting__hint" style="color:var(--danger,#e5484d)">${e.error}</div>`:A}
        ${l?this.updateProgressBlock(l,n):A}
        ${o?this.updatePendingBlock(o):A}
        ${n?.notes&&n.hasUpdate?this.updateNotesBlock(n):A}

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
              ${Wl.map(c=>d`<option value=${c.id} ?selected=${c.id===(e.channel||"auto")}>${c.name}</option>`)}
            </select>
          </div>
        </div>

        ${L({label:"启动时自动检查更新",hint:"只在发现新版本时提示；检查失败不会打扰你（可以随时点上面的「检查更新」）",control:te("updateCheckOnStart",e.checkOnStart!==!1,"启动时自动检查更新")})}

        <div class="setting">
          <div class="setting__main">
            <div class="setting__label">仓库</div>
            <div class="setting__hint">${Vl}</div>
          </div>
          <div class="setting__control">
            <button class="btn btn--ghost btn--sm" type="button" data-act="about-open-url" data-url=${Pa}>
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
    </section>`}updateStatusBlock({check:e,current:n,latest:a,pending:s,progress:r}){const o=i.update||{};if(o.checking)return d` <div class="about-note">
        <div class="about-note__title"><span>正在检查…</span></div>
        <div class="about-note__body">正在向 GitHub 查询最新版本。</div>
        <button class="btn btn--sm" type="button" disabled>${f("refresh")}<span>检查中</span></button>
      </div>`;if(!e)return d` <div class="about-note">
        <div class="about-note__title"><span>尚未检查</span></div>
        <div class="about-note__body">
          点右边的按钮查询有没有新版本。检查只读取版本信息，不会下载任何东西。
        </div>
        <button class="btn btn--sm" type="button" data-act="update-check">${f("refresh")}<span>检查更新</span></button>
      </div>`;if(e.error)return d` <div class="about-note">
        <div class="about-note__title">
          <span style="color:var(--danger,#e5484d)">检查失败</span>
        </div>
        <div class="about-note__body">${e.error}</div>
        <button class="btn btn--sm" type="button" data-act="update-check">${f("refresh")}<span>重试</span></button>
      </div>`;if(e.hasUpdate)return e.assetAvailable?d` <div class="about-note">
        <div class="about-note__title">
          <span>发现新版本 ${a}</span>
          <span class="chip chip--ok"><i class="chip__dot"></i>${s?"已下载，可以安装":r?"正在下载":"可以更新"}</span>
          ${e.prerelease?d`<span class="chip chip--warn"><i class="chip__dot"></i>预发布</span>`:A}
        </div>
        <div class="about-note__body">
          ${e.assetName} · ${e.assetSizeText||"体积未知"}
          ${e.publishedAt?` · 发布于 ${new Date(e.publishedAt).toLocaleDateString("zh-CN")}`:""}
        </div>
        <div class="setting__control">
          ${r?d`<button class="btn btn--sm" type="button" data-act="update-cancel">
                ${f("close")}<span>取消下载</span>
              </button>`:s?d`<button class="btn btn--sm" type="button" data-act="update-install">
                  ${f("refresh")}<span>立即安装并重启</span>
                </button>`:d`<button class="btn btn--sm" type="button" data-act="update-download">
                  ${f("download")}<span>下载更新</span>
                </button>`}
          <button
            class="btn btn--ghost btn--sm"
            type="button"
            data-act="about-open-url"
            data-url=${e.releaseUrl||Pa}
          >
            ${f("external")}<span>说明</span>
          </button>
          <button class="btn btn--ghost btn--sm" type="button" data-act="update-skip" data-version=${a}>
            <span>跳过此版本</span>
          </button>
        </div>
      </div>`:d` <div class="about-note">
          <div class="about-note__title">
            <span style="color:var(--warn,#d29922)">新版本 ${a} 没有提供当前平台的安装包</span>
          </div>
          <div class="about-note__body">
            可以到发布页面看看有没有其它形式的分发包，或稍后再试（发行流程可能在补充资产）。
          </div>
          <button
            class="btn btn--sm"
            type="button"
            data-act="about-open-url"
            data-url=${e.releaseUrl||Pa}
          >
            ${f("external")}<span>去发布页面</span>
          </button>
        </div>`;const l=o.skippedVersion&&a&&o.skippedVersion===a;return d` <div class="about-note">
      <div class="about-note__title">
        <span>已是最新版本（v${n}）</span>
        ${l?d`<span class="chip chip--warn"><i class="chip__dot"></i>已跳过 ${a}</span>`:A}
      </div>
      <div class="about-note__body">
        ${e.checkedAt?`上次检查：${new Date(e.checkedAt).toLocaleString("zh-CN")}`:""}
      </div>
      ${l?d`<button class="btn btn--sm" type="button" data-act="update-skip" data-version="">
            ${f("refresh")}<span>不再跳过</span>
          </button>`:A}
      <button class="btn btn--ghost btn--sm" type="button" data-act="update-check">
        ${f("refresh")}<span>重新检查</span>
      </button>
    </div>`}updateProgressBlock(e,n){const a=Number(e.total)||0,s=Number(e.done)||0,r=typeof e.percent=="number"&&e.percent>=0?e.percent:a>0?Math.round(s/a*100):0,o=!a&&r===0;return d` <div class="about-note">
      <div class="about-note__title">
        <span>${e.message||"正在下载…"}</span>
        ${e.mirrorName?d`<span class="chip"><i class="chip__dot"></i>${e.mirrorName}</span>`:A}
        ${e.attempt>1?d`<span class="chip chip--warn">第 ${e.attempt} 次尝试</span>`:A}
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
        ${o?"正在连接…":a>0?`${r}% · ${Zt(s)} / ${Zt(a)}${e.speedText?` · ${e.speedText}`:""}`:Zt(s)}
        ${n?.assetSizeText?d` <span>（共 ${n.assetSizeText}）</span>`:A}
      </div>
    </div>`}updatePendingBlock(e){return d` <div class="about-note">
      <div class="about-note__title">
        <span>更新包已就绪</span>
        ${e.verified?d`<span class="chip chip--ok"><i class="chip__dot"></i>SHA-256 已校验</span>`:d`<span class="chip chip--warn"><i class="chip__dot"></i>未能校验</span>`}
      </div>
      <div class="about-note__body">
        ${e.name} · ${Zt(e.bytes||0)}
        ${e.mirrorId?` · 来自 ${bs(e.mirrorId).name}`:""}
      </div>
      ${e.verified?A:d`<div class="setting__hint">
            这一版没有找到可用的 SHA-256 校验值，安装前请自行确认来源可信。
          </div>`}
      <div class="setting__control">
        <button class="btn btn--sm" type="button" data-act="update-install">
          ${f("refresh")}<span>立即安装并重启</span>
        </button>
        <button class="btn btn--ghost btn--sm" type="button" data-act="update-check">
          <span>重新检查</span>
        </button>
      </div>
    </div>`}updateNotesBlock(e){const a=String(e.notes||"").trim(),s=a.length>1200?`${a.slice(0,1200)}…`:a;return s?d` <details class="about-note">
      <summary class="about-note__title" style="cursor:pointer">更新说明</summary>
      <div class="about-note__body" style="white-space:pre-wrap">${s}</div>
    </details>`:A}techCard(){return d` <section class="card" id="sec-tech" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("bolt")}</div>
        <div class="card__titles">
          <div class="card__title">技术栈</div>
          <div class="card__desc">这个播放器由哪些技术搭起来</div>
        </div>
      </div>
      <div class="card__body">
        ${Gl.map(e=>d` <div class="about-row">
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
    </section>`}libsCard(){const e=Kl(),n=Yl(e).map(a=>`${a.license} × ${a.count}`).join(" · ");return d` <section class="card" id="sec-libs" data-section="about">
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
          ${e.map(a=>d` <div class="libtable__row">
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
        ${Xl.map(a=>d` <div class="about-note">
            <div class="about-note__title">
              <span>${Ql(a)}</span><span class="tagchip tagchip--warn">${a.license}</span>
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
    </section>`}licenseCard(){return d` <section class="card" id="sec-license" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("scale")}</div>
        <div class="card__titles">
          <div class="card__title">开源协议</div>
          <div class="card__desc">你可以对这份代码做什么</div>
        </div>
      </div>
      <div class="card__body">
        ${Jl.map(e=>d` <div class="about-note">
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
    </section>`}creditsCard(){return d` <section class="card" id="sec-credits" data-section="about">
      <div class="card__head">
        <div class="card__icon">${f("heart")}</div>
        <div class="card__titles">
          <div class="card__title">参考与致谢</div>
          <div class="card__desc">在线能力所依赖的公开数据来源，以及要感谢的人</div>
        </div>
      </div>
      <div class="card__body">
        <div class="about-subtitle">在线数据来源</div>
        ${Zl.map(e=>d` <div class="about-row">
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
        ${ec.map(e=>d` <div class="about-note">
            <div class="about-note__title"><span>${e.title}</span></div>
            <div class="about-note__body">${e.body}</div>
          </div>`)}
      </div>
      <div class="card__foot card__foot--stack">
        ${tc.map(e=>d`<span>· ${e}</span>`)}
      </div>
    </section>`}async onClick(e){if(e.target.closest("[data-settings-close]")||e.target===this.panelEl){ia();return}const n=e.target.closest("[data-goto]")?.dataset.goto;if(n){this.scrollToSection(n);return}const a=e.target.closest("[data-toggle],[data-segment] .segmented__btn");if(a){kp(a,{commit:$})&&dn(),this.requestUpdate();return}const s=e.target.closest("[data-act]");s&&(await Us(s,{commit:$,render:()=>{i.settingsRev=(i.settingsRev||0)+1,$()},rescan:()=>xn({manual:!0})}),dn())}async onChange(e){if(e.target.dataset.act)try{await Us(e.target,{commit:$,render:()=>{i.settingsRev=(i.settingsRev||0)+1,$()},rescan:()=>xn({manual:!0})}),dn(),this.requestUpdate()}catch(a){console.error("[settings] 处理下拉框失败",a),u(`设置未生效：${a?.message??a}`,{tone:"error",duration:5e3})}}onInput(e){if(e.target.dataset.act!=="rule-value")return;const n=i.filterRules.find(a=>a.id===e.target.dataset.id);n&&(n.value=e.target.value,$(),this.requestUpdate())}onScroll(e){const n=e.target;if(n.classList?.contains("settings-layer__body")){if(this._navPausedUntil){this.deferNavResume();return}this._throttledNavFollow(n)}}navFollow(e){if(this._navPausedUntil)return;const n=e.getBoundingClientRect().top+80;let a=xt[0].id;for(const s of xt){const r=this.querySelector(`[data-section="${s.id}"]`);r&&r.getBoundingClientRect().top<=n&&(a=s.id)}e.scrollHeight>e.clientHeight+2&&e.scrollTop+e.clientHeight>=e.scrollHeight-2&&(a=xt[xt.length-1].id),a!==this._activeSection&&(this._activeSection=a,this.paintNav())}paintNav(){for(const e of this.querySelectorAll(".settings__nav-item"))e.setAttribute("aria-selected",String(e.dataset.goto===this._activeSection))}deferNavResume(){clearTimeout(this._navResumeTimer),this._navResumeTimer=setTimeout(()=>{this._navResumeTimer=null,this._navPausedUntil=0},140)}scrollToSection(e){const n=this.querySelector(`[data-section="${e}"]`),a=this.querySelector(".settings-layer__body");if(!n||!a)return;this._activeSection=e,this.paintNav(),this._navPausedUntil=1,this.deferNavResume();const s=this.querySelector(".settings__nav"),r=s?s.offsetHeight:0,o=n.getBoundingClientRect().top-a.getBoundingClientRect().top,l=Math.max(0,a.scrollTop+o-r-8);a.scrollTo({top:l,behavior:"smooth"})}bindSliders(){for(const e of this.querySelectorAll("[data-slider]")){const n=e.dataset.slider;if(!n)continue;let a=this._sliders.get(e);if(!a){a=Wt(e,this.sliderOptions(e,n)),this._sliders.set(e,a);const s=e.parentElement.querySelector(".rangeslider__value");s&&(s.textContent=a.text(this.sliderValue(n)))}a.set(this.sliderValue(n),{silent:!0})}}sliderOptions(e,n){const a=n==="glassBlur",s=n==="glassAlpha",r=n==="coverCarouselInterval",o=n==="trackGapSeconds",l=n==="lyricsFontSize",c=o?0:r?2:l?Vs:a?0:s?20:0,p=o?10:r?60:l?Ws:a?48:s?95:100,m=r||o?" 秒":a?"px":s?"%":"px",h=o?.1:1,_=o?1:0,S=b=>`${b.toFixed(_)}${m}`;return{min:c,max:p,step:h,value:this.sliderValue(n),format:S,onChange:b=>{i.config[n]=o?Math.round(b*10)/10:b;const x=e.parentElement.querySelector(".rangeslider__value");x&&(x.textContent=S(b)),a&&(i.config.glassBlurCustom=!0,Dt("--glass-blur",`${b}px`)),s&&(i.config.glassAlphaCustom=!0,Js(b)),n==="lyricsFontSize"&&Dt("--lyric-size",`${b}px`),o&&Cf(i.config[n])},onCommit:()=>$()}}sliderValue(e){if(e==="glassBlur")return i.config.glassBlurCustom?i.config.glassBlur:Bc();if(e==="glassAlpha")return i.config.glassAlphaCustom?i.config.glassAlpha:ks();if(e==="trackGapSeconds"){const n=Number(i.config.trackGapSeconds);return Number.isFinite(n)?n:1.5}return i.config[e]??0}}ie("mp-settings-layer",Ef);class If extends ge{static deps=e=>[e.floatingLyrics?.show,e.floatingLyrics?.text];render(){const e=i.floatingLyrics||{show:!1,text:""};return d`
      <div class="desktop-lyrics" id="desktop-lyrics" ?hidden=${!e.show} aria-hidden="true">
        <div class="desktop-lyrics__line" id="desktop-lyrics-line">${e.text}</div>
      </div>
    `}}ie("mp-floating-lyrics",If);class Af extends ge{static deps=e=>[e.playerOpen,e.scanning,e.scanText,e.config.listDensity];updated(){const e=document.documentElement,n=i.config.listDensity||"cozy";e.dataset.density!==n&&(e.dataset.density=n)}render(){return d`
      <div class="app-bg" id="app-bg" aria-hidden="true"></div>

      <div
        class="app"
        id="app"
        data-view=${i.playerOpen?"player":"library"}
        data-mode=""
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
    `}}ie("mp-app",Af);let _n="";const Df=200;class Mf extends Map{set(e,n){for(super.has(e)&&super.delete(e),super.set(e,n);this.size>Df;){const a=super.keys().next();if(a.done)break;super.delete(a.value)}return this}}const ms=new Mf,zn=new Map;function Pf(){const t=new Image;return t.decoding="async",t.alt="",t}function Of(t){return!i.config.accentFromCover||!Sn(t)?!1:t!==_n}function Ko(t){if(!Sn(t))return Promise.resolve("");if(ms.has(t))return Promise.resolve(ms.get(t));if(zn.has(t))return zn.get(t);const e=new Promise(n=>{const a=o=>{ms.set(t,o),zn.delete(t),n(o)},s=document.getElementById("bar-cover-img");if(s&&s.getAttribute("src")===t&&s.complete&&s.naturalWidth>0){a(Ut(Li(s)));return}const r=Pf();r.addEventListener("load",()=>a(Sn(t)?Ut(Li(r)):"")),r.addEventListener("error",()=>a("")),r.src=t});return zn.set(t,e),e}async function Yo(t){t&&Uc(t,t)&&(await dn(),await Oe(i.config))}async function Lf(){if(!i.config.accentFromCover||Ut(i.config.coverSeed))return;const t=i.currentId?We(i.currentId):null,e=t?wt(t):"";e&&(_n=e,await Yo(await Ko(e)))}function Rf(t){if(!i.config.accentFromCover){_n="";return}if(t){if(!Sn(t)){_n=t;return}Of(t)&&(_n=t,Ko(t).then(Yo))}}function Nf(t){Fc(Sn(t)?t:"")}let $r="";function qf(t){return[i.currentId??"",i.playing?1:0,Math.round((i.position||0)/250),i.duration||0,i.volume,i.muted?1:0,i.config.loudnessMode||"off",Dn()?1:0,Da()?1:0,Math.round(Number(i.config.lyricsFontSize)||16),t].join("|")}function kr(){const t=i.currentId?We(i.currentId):null,e=t?wt(t):"",n=qf(e);n!==$r&&($r=n,Gd(),jt(),Dn()&&(i.playing&&Ns(),Zp({text:i.playing?Pu():"",playing:!!i.playing,fontSize:Math.round((Number(i.config.lyricsFontSize)||16)*1.5)})),Da()&&(i.playing&&Ns(),zs()),Rf(e),Nf(e))}function Bf(){ga(kr),kr()}let aa=null;function Ff(){Uf(),aa=U("media:key",t=>{t?.action==="toggle"&&Gt()})}function Uf(){if(aa){try{aa()}catch{}aa=null}}const wn=document.getElementById("boot-splash"),jn=document.getElementById("boot-splash__frame");function Sr(){wn&&(wn.dataset.hasframe="1")}jn&&(jn.complete?jn.naturalWidth>0&&Sr():jn.addEventListener("load",Sr,{once:!0}));let xr=!1;function Hf(){xr||(xr=!0,fetch("/boot/reveal",{cache:"no-store",keepalive:!0}).catch(()=>{}),v.windowReady().catch(()=>{}))}let Cr=!1;function Xo(){Cr||!wn||(Cr=!0,wn.dataset.hide="1",setTimeout(()=>wn.remove(),400))}Hf();setTimeout(Xo,12e3);const ct=new Map;async function zf(){await $a(),await Lf(),await Oe(i.config),window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",async()=>{i.config.themeMode==="system"&&(await Oe(i.config),$())})}async function jf(){if(k())try{const t=await v.coverCachedSets();if(!t||typeof t!="object")return;Nr(t);const e=Object.keys(t).length;e&&console.info(`[cover] 已从缓存回填 ${e} 首歌的封面（含多封面）`)}catch(t){console.info("[cover] 封面缓存回填跳过",t?.message??t)}}function Vf(){document.addEventListener("keydown",t=>{const e=t.target.tagName,n=e==="INPUT"||e==="TEXTAREA"||e==="SELECT"||t.target.isContentEditable;if(t.key==="Escape"){if(document.getElementById("modal-backdrop")?.hidden===!1)return;oc(),i.playerOpen&&Ia();return}if(!n)switch(t.key){case" ":t.preventDefault(),Gt();break;case"ArrowRight":t.ctrlKey||t.metaKey?Ft(!1):Ee(i.position+5e3);break;case"ArrowLeft":t.ctrlKey||t.metaKey?Ys():Ee(i.position-5e3);break;case"ArrowUp":t.preventDefault(),_s(i.volume+.05);break;case"ArrowDown":t.preventDefault(),_s(i.volume-.05);break;case"l":case"L":i.currentId&&mt(i.currentId);break;case"p":case"P":Fs();break;case"f":case"F":Wf();break}})}async function Wf(){if(k()){const t=!document.fullscreenElement;await v.windowSetFullscreen(t);return}document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen().catch(()=>{})}function Gf(){U("scan:start",()=>{i.scanning=!0,i.scanText="正在扫描音乐文件夹…",$()}),U("scan:progress",t=>{t&&(t.phase==="walk"?i.scanText="正在遍历音乐文件夹…":t.total&&(i.scanText=`正在读取元数据 ${t.current} / ${t.total}`),$())}),U("scan:done",async t=>{i.scanning=!1;const e=await v.songs();if(Array.isArray(e)){const a=new Set(i.songs.map(l=>l.id));i.allSongsRaw=e;const{kept:s,excluded:r}=Rr(e,i.filterRules);i.songs=s;const o=new Set(s.map(l=>l.id));i.lastScan={at:Date.now(),found:e.length,kept:s.length,excluded:r,added:s.filter(l=>!a.has(l.id)).length,removed:[...a].filter(l=>!o.has(l)).length}}const n=await v.folders();Array.isArray(n)&&(i.folders=n),$(),t?.added&&!t?.firstRun&&u(`文件夹变化：新增 ${t.added} 首`,{tone:"success"})}),U("scan:failed",t=>{i.scanning=!1,$(),u(`扫描失败：${t?.message??"未知错误"}`,{tone:"error",duration:5e3})}),U("library:unplayable",t=>{if(!t)return;lc().catch(()=>{});const e=t.title||t.songId||"这首歌";u(`无法播放：${e}（已记入「音乐文件夹」清单）`,{tone:"error",duration:6e3}),Dr(!0)}),U("theme:changed",t=>{i.config.theme=t,Oe(i.config),$()}),U("player:state",t=>{t&&(typeof t.position=="number"&&(i.position=t.position),typeof t.duration=="number"&&(i.duration=t.duration),typeof t.playing=="boolean"&&(i.playing=t.playing))}),U("cover:changed",async t=>{const e=String(t?.id||"");try{if(!e){const a=await v.coverCachedSets();a&&typeof a=="object"&&Nr(a);return}const n=await v.coverList(e);n&&Array.isArray(n.items)&&ws(e,n)}catch(n){console.info("[cover] 同步封面失败",n?.message??n)}}),U("loudness:progress",t=>{t&&(i.loudnessState={...i.loudnessState||{},...t,running:!0},$())}),U("loudness:done",async t=>{i.loudnessState={...i.loudnessState||{},running:!1},$();const e=t?.failed??0;u(e?`响度测量完成：成功 ${t?.done-e} 首，失败 ${e} 首`:`响度测量完成：共 ${t?.done??0} 首`,{tone:e?"warning":"success",duration:4e3}),await yn(),await xa()}),U("loudness:failed",t=>{i.loudnessState={...i.loudnessState||{},running:!1},$(),u(`响度测量失败：${t?.message??"未知错误"}`,{tone:"error",duration:6e3})}),U("ffmpeg:ready",t=>{t&&(i.ffmpegState=t,$(),console.info(`[ffmpeg] ${t.available?t.describe:"不可用"}`))}),U("download:progress",t=>{if(!t?.bvid)return;const e=t.title||t.bvid,n=Number(t.total)||0,a=Number(t.done)||0,s=n>0?Math.round(a/n*100):0,r=n>0?`下载中 ${s}% · ${e}`:`下载中 ${e}`;ct.has(t.bvid)?ct.get(t.bvid).update(r):ct.set(t.bvid,u(r,{duration:0}))}),U("download:done",t=>{const e=ct.get(t?.bvid);ct.delete(t?.bvid);const n=`已下载：${t?.title||t?.bvid} → ${t?.path||t?.dir||""}`;e?e.update(n,"success"):u(n,{tone:"success",duration:5e3}),setTimeout(()=>e?.close(),4e3)}),U("download:failed",t=>{const e=ct.get(t?.bvid);ct.delete(t?.bvid);const n=`下载失败：${t?.message??"未知错误"}`;e?e.update(n,"error"):u(n,{tone:"error",duration:6e3}),setTimeout(()=>e?.close(),6e3)}),U("update:checked",t=>{t&&(i.update.check=t,i.update.checking=!1,i.update.error=t.error||"",$(),t.hasUpdate&&t.assetAvailable&&u(`发现新版本 ${t.latest}，可在「设置 → 关于」中更新`,{tone:"success",duration:6e3}))}),U("update:progress",t=>{t&&(i.update.progress={...i.update.progress||{},...t},$())}),U("update:downloaded",t=>{t&&(i.update.progress=null,i.update.pending={name:t.name,path:t.path,bytes:t.bytes,verified:t.verified,mirrorId:t.mirrorId},$(),u(`更新包已下载（${t.verified?"已校验":"未校验"}）：${t.name}`,{tone:t.verified?"success":"warning",duration:5e3}))}),U("update:failed",t=>{i.update.progress=null,i.update.error=t?.message||"下载失败",$()}),U("update:installing",t=>{i.update.progress=null,$(),u(`正在安装 ${t?.name||"更新"} 并重启…`,{duration:4e3})})}function Tr(){const t=new URLSearchParams(location.search);if(!t.toString())return;const e=t.get("theme");if(e){i.config.theme=e;const o=sa(e);o?.mode&&(i.config.themeMode=o.mode)}const n=t.get("tab");n==="settings"?i.settingsOpen=!0:n==="queue"?i.view="queue":n==="playlist"&&(i.view="playlist",i.playlistId=t.get("pl")||i.playlists[1]?.id||null);const a=t.get("pv");a&&(i.pvMode=a,i.config.playerViewMode=a),t.get("view")==="player"&&(i.playerOpen=!0),t.get("playing")==="1"&&(i.playing=!0,i.position=Number(t.get("pos")||62e3)),t.get("scan")==="1"&&(i.scanning=!0,setTimeout(()=>{i.scanning=!1,$()},8e3)),t.get("query")&&(i.query=t.get("query"));const s=Number(t.get("songs"));if(!k()&&Number.isFinite(s)&&s>i.songs.length){const o=i.songs.slice(),l=o.slice();for(;l.length<s;){const c=l.length,p=o[c%o.length];l.push({...p,id:`bench_${c}`,path:`C:/bench/${c}.${p.ext||"mp3"}`})}i.songs=l,i.allSongsRaw=l.slice(),$()}const r=t.get("density");r&&["compact","cozy","roomy"].includes(r)&&(i.config.listDensity=r),t.get("album")==="off"&&(i.config.showAlbumColumn=!1)}async function Kf(){await ac(),Tr();const t=jf();if(await zf(),Lu().then(()=>{Vt(i.config.playerViewMode||""),Ur()&&Vc()}),sc(),Yc(),await td(),ef(),Vf(),Gf(),Tr(),await Fd(),Ud(),si(),ii(),Ff(),Bf(),await t,await Oe(i.config),Ms(),requestAnimationFrame(()=>requestAnimationFrame(Xo)),await yn(),await xa(),ic().catch(()=>{}),rc(),nl(),window.addEventListener("beforeunload",()=>{dn()}),document.body.dataset.ready="true",fetch("/boot/booted",{cache:"no-store",keepalive:!0}).catch(()=>{}),new URLSearchParams(location.search).get("probe")==="1"){const{runProbe:e}=await yt(async()=>{const{runProbe:n}=await import("./probe-B9RoGxta.js");return{runProbe:n}},[]);setTimeout(()=>{const n=e();window.__probeReport=n,console.info("[probe]",n)},600)}k()||console.info(`%c浏览器预览模式%c
当前使用假数据渲染界面。接入 Go + Wails3 后端后，同名前端的 store/bridge 会自动改走后端方法。`,"background:#fff;color:#000;padding:2px 6px;border-radius:4px;font-weight:700","color:#888")}Kf().catch(t=>{console.error("[app] 启动失败",t),u(`启动失败：${t.message}`,{tone:"error",duration:6e3})});window.addEventListener("unhandledrejection",t=>{const e=t.reason,n=e?.message||String(e||"未知错误");/no backend|preview:/i.test(n)||(console.error("[app] 未处理的异步错误",e),u(n.length>120?`${n.slice(0,120)}…`:n,{tone:"error",duration:6e3}))});window.addEventListener("error",t=>{t.message&&console.error("[app] 运行时错误",t.error||t.message)});window.__app={state:i,commit:$,navigate:Mt,openPlayer:Do,closePlayer:Ia,rescan:Er,doRescan:xn,currentSong:ze,isLiked:tt,nextIndex:nc,setPlayerViewMode:Vt,applyGainForSong:jt,skinsToken:()=>v.skinsToken()};const yi=Object.freeze(Object.defineProperty({__proto__:null,closeCoverPanel:cn,openCoverPanel:wf},Symbol.toStringTag,{value:"Module"}));
