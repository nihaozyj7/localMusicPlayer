import{s as c,t as A,i as l,a as H,n as T,b as N,c as P}from"./index-4HX4Dni1.js";import{backend as p,isWails as $}from"./bridge-DJbaeMnw.js";import{z as B}from"./index-DWcH4Ob_.js";let L=!1,i=null,v=null,u=null,o=[],n=new Set,g=null,S=!1;function j(){if(!L){if(L=!0,i=document.getElementById("cover-layer"),!i)throw new Error("缺少 #cover-layer 容器");v=i.querySelector("#cover-layer-body"),i.addEventListener("click",e=>{if(e.target.closest("[data-cover-close]")||e.target===i){z();return}const t=e.target.closest("[data-set-act]");if(t){const a=Number(t.closest("[data-set-index]")?.dataset.setIndex);t.dataset.setAct==="use"&&J(a),t.dataset.setAct==="remove"&&U(a);return}const r=e.target.closest("[data-cover-act]")?.dataset.coverAct;r&&(r==="search"&&R(),r==="local"&&W(),r==="toggle"&&O(Number(e.target.closest("[data-cover-idx]")?.dataset.coverIdx)),r==="select-all"&&Q(),r==="apply"&&G(),r==="carousel"&&V(),r==="embed"&&X(),r==="open-cache"&&p.coverOpenCacheDir("covers"))}),i.addEventListener("keydown",e=>{if(e.key!=="Escape")return;const t=i.querySelector("#cover-keyword");if(t&&document.activeElement===t&&t.value.trim()){t.value="";return}z()})}}function te(e){j(),u=e,o=[],n=new Set,g=c.coverSets.get(e)||null;const t=c.songs.find(r=>r.id===e);if(!t){A("这首歌不在本地曲库里，无法更换封面",{tone:"warning"});return}D(t),i.hidden=!1,requestAnimationFrame(()=>i.setAttribute("data-state","opened")),F(),I()}async function I(){if(!(c.coverProviders?.length||!$()))try{const e=await p.coverProviders();Array.isArray(e?.providers)&&e.providers.length&&(c.coverProviders=e.providers)}catch{}}function E(){const e=c.coverProviders||[];return e.length?e.join(" / "):"iTunes / 网易云 / QQ 音乐 / Deezer / MusicBrainz"}function z(){i&&(i.setAttribute("data-state","closed"),setTimeout(()=>{i.getAttribute("data-state")==="closed"&&(i.hidden=!0)},N()+40))}async function F(){if(!(!$()||!u))try{const e=await p.coverList(u);e&&Array.isArray(e.items)&&(g=e,H(u,e),q(),w(),T())}catch(e){s(`读取现有封面失败：${e?.message??e}`)}}function D(e){const t=B(e);v.innerHTML=`
    <div class="cover-panel">
      <div class="cover-panel__current">
        <div class="cover-panel__frame" id="cover-current-frame">
          ${t?`<img src="${h(t)}" alt="${h(e.title)} 原始封面" />`:`<span class="cover-panel__none">${l("music")}</span>`}
        </div>
        <div class="cover-panel__meta">
          <div class="cover-panel__title">${y(e.title)}</div>
          <div class="cover-panel__sub">${y(e.artist)}${e.album?` · ${y(e.album)}`:""}</div>
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
          <button class="btn btn--sm" type="button" data-cover-act="embed" id="cover-embed-btn"
            aria-pressed="false">${l("tag")}<span>写入歌曲文件</span></button>
          <button class="btn btn--sm" type="button" data-cover-act="carousel" id="cover-carousel-btn"
            aria-pressed="false">${l("slideshow")}<span>轮播</span></button>
        </div>
        <div class="cover-set" id="cover-set"></div>
      </div>

      <div class="cover-panel__section">
        <div class="cover-panel__search">
          <input class="field" id="cover-keyword" type="text" placeholder="输入关键词（歌名 / 歌手 / 专辑都可以）"
            autocomplete="off" spellcheck="false" aria-label="封面搜索关键词"
            value="${h(e.title||"")}" />
          <button class="btn btn--primary btn--sm" type="button" data-cover-act="search"
            ${S?"disabled":""}>${l("search")}<span>联网搜索</span></button>
          <button class="btn btn--sm" type="button" data-cover-act="local">
            ${l("image")}<span>选择本地图片</span>
          </button>
        </div>
        <div class="cover-panel__hint">
          下载来的文件常常没有标签，标题是从文件名推出来的，直接搜不容易命中；
          在这里填一个更准确的关键词会准很多。也可以直接选一张本地图片 ——
          两种结果都会出现在下面：联网搜索默认不勾选，本地图片默认已勾选，
          确认后点「应用」。
        </div>
      </div>

      <div class="cover-panel__status" id="cover-status"></div>
      <div class="cover-panel__grid" id="cover-grid"></div>
      <div class="cover-panel__selectbar" id="cover-selectbar" hidden></div>

      <div class="cover-panel__foot">
        <button class="btn btn--sm" type="button" data-cover-act="open-cache">
          ${l("folder")}<span>打开缓存目录</span>
        </button>
      </div>
    </div>`,q(),w(),_()}function s(e){const t=v?.querySelector("#cover-status");t&&(t.textContent=e||"")}function q(){const e=v?.querySelector("#cover-set");if(!e)return;const t=g?.items||[],r=g?.embedded||[],a=Number(g?.active)||0;if(!t.length&&!r.length){e.innerHTML='<div class="cover-set__empty">还没有换过封面，这首歌现在用的是文件自带的封面。</div>';return}const b=t.map((d,m)=>`
      <div class="cover-set__item" data-set-index="${m}" data-active="${m===a}">
        <img src="${h(d.preview)}" alt="" />
        ${m===a?'<span class="cover-set__badge">当前</span>':""}
        <div class="cover-set__ops">
          <button class="btn btn--xs" type="button" data-set-act="use" ${m===a?"disabled":""}>
            ${l("check")}<span>设为当前</span>
          </button>
          <button class="btn btn--xs btn--danger" type="button" data-set-act="remove">
            ${l("trash")}<span>删除</span>
          </button>
        </div>
      </div>`).join(""),f=r.map(()=>`
      <div class="cover-set__item cover-set__item--embedded" data-embedded="1">
        <img src="" alt="" />
        <span class="cover-set__badge cover-set__badge--ghost">文件内嵌</span>
        <div class="cover-set__ops">
          <button class="btn btn--xs" type="button" data-set-act="use">
            ${l("plus")}<span>收进缓存</span>
          </button>
        </div>
      </div>`).join("");e.innerHTML=b+f,e.querySelectorAll("[data-embedded='1']").forEach((d,m)=>{const M=r[m],x=d.querySelector("img");x&&M?.preview&&(x.src=M.preview),d.querySelector("[data-set-act='use']")?.addEventListener("click",()=>K(M))})}function w(){const e=v?.querySelector("#cover-carousel-btn");e&&e.setAttribute("aria-pressed",String(c.config.coverCarousel===!0));const t=v?.querySelector("#cover-embed-btn");t&&(t.setAttribute("aria-pressed",String(c.config.embedMeta===!0)),t.dataset.tip=c.config.embedMeta?"关闭后封面只存在缓存目录里":"打开后封面会写进歌曲文件本身（会修改音乐文件）")}function _(){const e=v?.querySelector("#cover-grid");if(e){if(!o.length){e.innerHTML="",C();return}e.innerHTML=o.map((t,r)=>{const a=n.has(t);return`
      <button class="cover-card" type="button" role="checkbox" aria-checked="${a}"
        data-cover-act="toggle" data-cover-idx="${r}" data-selected="${a}">
        <img src="${h(t.preview)}" alt="" loading="lazy" />
        <span class="cover-card__check">${l("check")}</span>
        <span class="cover-card__meta">
          <span class="cover-card__provider">${y(t.provider||"来源")}</span>
          <span class="cover-card__score">${t.width&&t.height?`${t.width}×${t.height}`:`匹配度 ${Number(t.score)||0}`}</span>
        </span>
      </button>`}).join(""),C()}}function C(){const e=v?.querySelector("#cover-selectbar");if(e){if(!o.length){e.hidden=!0,e.innerHTML="";return}e.hidden=!1,e.innerHTML=`
    <span class="cover-panel__selectinfo">已选 ${n.size} / ${o.length} 张</span>
    <span class="u-spacer"></span>
    <button class="btn btn--sm" type="button" data-cover-act="select-all">
      ${l("check")}<span>${n.size===o.length?"取消全选":"全选"}</span>
    </button>
    <button class="btn btn--primary btn--sm" type="button" data-cover-act="apply"
      ${n.size?"":"disabled"}>
      ${l("plus")}<span>应用${n.size?`（${n.size}）`:""}</span>
    </button>`}}function O(e){const t=o[e];if(!t)return;n.has(t)?n.delete(t):n.add(t);const r=v?.querySelector(`[data-cover-idx="${e}"]`);if(r){const a=n.has(t);r.dataset.selected=String(a),r.setAttribute("aria-checked",String(a))}C()}function Q(){n.size===o.length?n.clear():o.forEach(e=>n.add(e)),_()}async function R(){if(S)return;if(!$()){s("浏览器预览下没有联网封面后端，请在应用里试");return}S=!0;const e=o.filter(r=>r.local);o=[...e],n=new Set(e),_();const t=(v?.querySelector("#cover-keyword")?.value||"").trim();s(t?`正在按「${t}」同时查询多个来源（${E()}）…`:`正在同时查询多个来源（${E()}）…`);try{const r=t?{keyword:t}:{},a=await p.coverLookupSongAll(u,r),b=Array.isArray(a)?a.filter(f=>f?.ok&&f.preview):[];if(b.length){o=[...e,...b.map(d=>({...d,local:!1}))];const f=[...new Set(b.map(d=>d.provider).filter(Boolean))];s(`找到 ${b.length} 张（来源：${f.join(" / ")||"未知"}），勾选后点「应用」`)}else{o=[...e];const f=Array.isArray(a)?a.find(d=>d?.message)?.message:"";s(f||"没有找到匹配的封面（也可能是匹配到的都是空白图，已自动丢弃）")}}catch(r){s(`搜索失败：${r?.message??r}`)}finally{S=!1,_()}}async function W(){if(!$()){s("浏览器预览下没有系统文件选择器，请在应用里试");return}s("正在读取图片…");try{const e=await p.coverPickLocal();if(!e||e.cancelled){s("");return}if(!e.ok||!e.preview){s(e?.message||"这张图片没法用作封面");return}const t={preview:e.preview,provider:e.provider||"本地图片",source:e.source||"",width:e.width,height:e.height,local:!0};o.unshift(t),n.add(t),_(),s(`已加入本地图片${e.source?`（${e.source}）`:""}，确认后点「应用」`)}catch(e){s(`选择图片失败：${e?.message??e}`)}}async function G(){const e=o.filter(t=>n.has(t)).map(t=>t.preview).filter(Boolean);if(!e.length){s("先勾选至少一张封面");return}await k(()=>p.coverAddMany(u,e,c.config.embedMeta===!0))}async function J(e){Number.isFinite(e)&&await k(()=>p.coverSetActive(u,e))}async function K(e){e?.preview&&await k(()=>p.coverAdd(u,"",e.preview,c.config.embedMeta===!0))}async function U(e){Number.isFinite(e)&&await k(()=>p.coverRemove(u,e))}async function k(e){if(!$()){s("浏览器预览下没有封面后端，请在应用里试");return}s("正在保存…");try{const t=await e();t&&Array.isArray(t.items)&&(g=t,H(u,t),q(),w(),T()),s(t?.message||"已更新封面"),A(t?.message||"封面已更新",{tone:"success",duration:1800})}catch(t){s(`保存失败：${t?.message??t}`)}}function V(){c.config.coverCarousel=!c.config.coverCarousel,w(),P(),A(c.config.coverCarousel?`已开启封面轮播（每 ${Number(c.config.coverCarouselInterval)||10} 秒换一张）`:"已关闭封面轮播",{duration:1600})}function X(){c.config.embedMeta=!c.config.embedMeta,w(),P(),A(c.config.embedMeta?"之后的封面会写进歌曲文件本身":"封面只保存在缓存目录（不改动音乐文件）",{duration:2200})}function y(e){return String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}function h(e){return y(e)}export{z as closeCoverPanel,te as openCoverPanel};
