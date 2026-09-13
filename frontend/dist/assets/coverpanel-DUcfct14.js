import{s,t as A,c as P,i as o,a as E,n as L,b as N}from"./index-C1Zres4M.js";import{backend as u,isWails as k}from"./bridge-CiGPKscV.js";let H=!1,i=null,v=null,l=null,d=[],n=new Set,b=null,w=!1;function B(){if(!H){if(H=!0,i=document.getElementById("cover-layer"),!i)throw new Error("缺少 #cover-layer 容器");v=i.querySelector("#cover-layer-body"),i.addEventListener("click",e=>{if(e.target.closest("[data-cover-close]")||e.target===i){z();return}const t=e.target.closest("[data-set-act]");if(t){const c=Number(t.closest("[data-set-index]")?.dataset.setIndex);t.dataset.setAct==="use"&&W(c),t.dataset.setAct==="remove"&&J(c);return}const r=e.target.closest("[data-cover-act]")?.dataset.coverAct;r&&(r==="search"&&O(),r==="url"&&U(),r==="reset"&&X(),r==="toggle"&&R(Number(e.target.closest("[data-cover-idx]")?.dataset.coverIdx)),r==="select-all"&&D(),r==="apply"&&Q(),r==="carousel"&&K(),r==="embed"&&V(),r==="open-cache"&&u.coverOpenCacheDir("covers"))}),i.addEventListener("keydown",e=>{if(e.key!=="Escape")return;const t=i.querySelector("#cover-keyword");if(t&&document.activeElement===t&&t.value.trim()){t.value="";return}z()})}}function ee(e){B(),l=e,d=[],n=new Set,b=s.coverSets.get(e)||null;const t=s.songs.find(r=>r.id===e);if(!t){A("这首歌不在本地曲库里，无法更换封面",{tone:"warning"});return}I(t),i.hidden=!1,requestAnimationFrame(()=>i.setAttribute("data-state","opened")),F(),j()}async function j(){if(!(s.coverProviders?.length||!k()))try{const e=await u.coverProviders();Array.isArray(e?.providers)&&e.providers.length&&(s.coverProviders=e.providers)}catch{}}function T(){const e=s.coverProviders||[];return e.length?e.join(" / "):"iTunes / 网易云 / QQ 音乐 / Deezer / MusicBrainz"}function z(){i&&(i.setAttribute("data-state","closed"),setTimeout(()=>{i.getAttribute("data-state")==="closed"&&(i.hidden=!0)},200))}async function F(){if(!(!k()||!l))try{const e=await u.coverList(l);e&&Array.isArray(e.items)&&(b=e,E(l,e),C(),_(),L())}catch(e){a(`读取现有封面失败：${e?.message??e}`)}}function I(e){const t=P(e);v.innerHTML=`
    <div class="cover-panel">
      <div class="cover-panel__current">
        <div class="cover-panel__frame" id="cover-current-frame">
          ${t?`<img src="${h(t)}" alt="${h(e.title)} 原始封面" />`:`<span class="cover-panel__none">${o("music")}</span>`}
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
            aria-pressed="false">${o("tag")}<span>写入歌曲文件</span></button>
          <button class="btn btn--sm" type="button" data-cover-act="carousel" id="cover-carousel-btn"
            aria-pressed="false">${o("slideshow")}<span>轮播</span></button>
        </div>
        <div class="cover-set" id="cover-set"></div>
      </div>

      <div class="cover-panel__section">
        <div class="cover-panel__search">
          <input class="field" id="cover-keyword" type="text" placeholder="输入关键词（歌名 / 歌手 / 专辑都可以）"
            autocomplete="off" spellcheck="false" aria-label="封面搜索关键词"
            value="${h(e.title||"")}" />
          <button class="btn btn--primary btn--sm" type="button" data-cover-act="search"
            ${w?"disabled":""}>${o("search")}<span>联网搜索</span></button>
        </div>
        <div class="cover-panel__hint">
          下载来的文件常常没有标签，标题是从文件名推出来的，直接搜不容易命中；
          在这里填一个更准确的关键词会准很多。搜索结果可以多选，再点「应用」。
        </div>
      </div>

      <div class="cover-panel__status" id="cover-status"></div>
      <div class="cover-panel__grid" id="cover-grid"></div>
      <div class="cover-panel__selectbar" id="cover-selectbar" hidden></div>

      <div class="cover-panel__url">
        <input class="field" id="cover-url" type="text" placeholder="或粘贴一个图片地址（https://…）"
          autocomplete="off" spellcheck="false" aria-label="图片地址" />
        <button class="btn btn--sm" type="button" data-cover-act="url">${o("file")}<span>使用这个地址</span></button>
      </div>

      <div class="cover-panel__foot">
        <button class="btn btn--sm btn--danger" type="button" data-cover-act="reset">
          ${o("refresh")}<span>恢复原始封面</span>
        </button>
        <button class="btn btn--sm" type="button" data-cover-act="open-cache">
          ${o("folder")}<span>打开缓存目录</span>
        </button>
      </div>
    </div>`,C(),_(),S()}function a(e){const t=v?.querySelector("#cover-status");t&&(t.textContent=e||"")}function C(){const e=v?.querySelector("#cover-set");if(!e)return;const t=b?.items||[],r=b?.embedded||[],c=Number(b?.active)||0;if(!t.length&&!r.length){e.innerHTML='<div class="cover-set__empty">还没有换过封面，这首歌现在用的是文件自带的封面。</div>';return}const p=t.map((m,g)=>`
      <div class="cover-set__item" data-set-index="${g}" data-active="${g===c}">
        <img src="${h(m.preview)}" alt="" />
        ${g===c?'<span class="cover-set__badge">当前</span>':""}
        <div class="cover-set__ops">
          <button class="btn btn--xs" type="button" data-set-act="use" ${g===c?"disabled":""}>
            ${o("check")}<span>设为当前</span>
          </button>
          <button class="btn btn--xs btn--danger" type="button" data-set-act="remove">
            ${o("trash")}<span>删除</span>
          </button>
        </div>
      </div>`).join(""),f=r.map(()=>`
      <div class="cover-set__item cover-set__item--embedded" data-embedded="1">
        <img src="" alt="" />
        <span class="cover-set__badge cover-set__badge--ghost">文件内嵌</span>
        <div class="cover-set__ops">
          <button class="btn btn--xs" type="button" data-set-act="use">
            ${o("plus")}<span>收进缓存</span>
          </button>
        </div>
      </div>`).join("");e.innerHTML=p+f,e.querySelectorAll("[data-embedded='1']").forEach((m,g)=>{const M=r[g],x=m.querySelector("img");x&&M?.preview&&(x.src=M.preview),m.querySelector("[data-set-act='use']")?.addEventListener("click",()=>G(M))})}function _(){const e=v?.querySelector("#cover-carousel-btn");e&&e.setAttribute("aria-pressed",String(s.config.coverCarousel===!0));const t=v?.querySelector("#cover-embed-btn");t&&(t.setAttribute("aria-pressed",String(s.config.embedMeta===!0)),t.dataset.tip=s.config.embedMeta?"关闭后封面只存在缓存目录里":"打开后封面会写进歌曲文件本身（会修改音乐文件）")}function S(){const e=v?.querySelector("#cover-grid");if(e){if(!d.length){e.innerHTML="",q();return}e.innerHTML=d.map((t,r)=>{const c=n.has(r);return`
      <button class="cover-card" type="button" role="checkbox" aria-checked="${c}"
        data-cover-act="toggle" data-cover-idx="${r}" data-selected="${c}">
        <img src="${h(t.preview)}" alt="" loading="lazy" />
        <span class="cover-card__check">${o("check")}</span>
        <span class="cover-card__meta">
          <span class="cover-card__provider">${y(t.provider||"来源")}</span>
          <span class="cover-card__score">${t.width&&t.height?`${t.width}×${t.height}`:`匹配度 ${Number(t.score)||0}`}</span>
        </span>
      </button>`}).join(""),q()}}function q(){const e=v?.querySelector("#cover-selectbar");if(e){if(!d.length){e.hidden=!0,e.innerHTML="";return}e.hidden=!1,e.innerHTML=`
    <span class="cover-panel__selectinfo">已选 ${n.size} / ${d.length} 张</span>
    <span class="u-spacer"></span>
    <button class="btn btn--sm" type="button" data-cover-act="select-all">
      ${o("check")}<span>${n.size===d.length?"取消全选":"全选"}</span>
    </button>
    <button class="btn btn--primary btn--sm" type="button" data-cover-act="apply"
      ${n.size?"":"disabled"}>
      ${o("plus")}<span>应用${n.size?`（${n.size}）`:""}</span>
    </button>`}}function R(e){if(!Number.isFinite(e))return;n.has(e)?n.delete(e):n.add(e);const t=v?.querySelector(`[data-cover-idx="${e}"]`);if(t){const r=n.has(e);t.dataset.selected=String(r),t.setAttribute("aria-checked",String(r))}q()}function D(){n.size===d.length?n.clear():d.forEach((e,t)=>n.add(t)),S()}async function O(){if(w)return;if(!k()){a("浏览器预览下没有联网封面后端，请在应用里试");return}w=!0,d=[],n=new Set,S();const e=(v?.querySelector("#cover-keyword")?.value||"").trim();a(e?`正在按「${e}」同时查询多个来源（${T()}）…`:`正在同时查询多个来源（${T()}）…`);try{const t=e?{keyword:e}:{},r=await u.coverLookupSongAll(l,t),c=Array.isArray(r)?r.filter(p=>p?.ok&&p.preview):[];if(c.length){d=c,c.forEach((f,m)=>n.add(m));const p=[...new Set(c.map(f=>f.provider).filter(Boolean))];a(`找到 ${c.length} 张（来源：${p.join(" / ")||"未知"}），勾选后点「应用」`)}else{const p=Array.isArray(r)?r.find(f=>f?.message)?.message:"";a(p||"没有找到匹配的封面（也可能是匹配到的都是空白图，已自动丢弃）")}}catch(t){a(`搜索失败：${t?.message??t}`)}finally{w=!1,S()}}async function Q(){const e=[...n].sort((t,r)=>t-r).map(t=>d[t]?.preview).filter(Boolean);if(!e.length){a("先勾选至少一张封面");return}await $(()=>u.coverAddMany(l,e,s.config.embedMeta===!0))}async function U(){const t=(v?.querySelector("#cover-url")?.value||"").trim();if(!t){a("请先填写图片地址");return}a("正在下载图片…");try{const r=await u.coverFetchURL(t);if(!r?.ok||!r.preview){a(r?.message||"这张图片取不到");return}await $(()=>u.coverAdd(l,t,r.preview,s.config.embedMeta===!0))}catch(r){a(`取图失败：${r?.message??r}`)}}async function W(e){Number.isFinite(e)&&await $(()=>u.coverSetActive(l,e))}async function G(e){e?.preview&&await $(()=>u.coverAdd(l,"",e.preview,s.config.embedMeta===!0))}async function J(e){Number.isFinite(e)&&await $(()=>u.coverRemove(l,e))}async function $(e){if(!k()){a("浏览器预览下没有封面后端，请在应用里试");return}a("正在保存…");try{const t=await e();t&&Array.isArray(t.items)&&(b=t,E(l,t),C(),_(),L()),a(t?.message||"已更新封面"),A(t?.message||"封面已更新",{tone:"success",duration:1800})}catch(t){a(`保存失败：${t?.message??t}`)}}function K(){s.config.coverCarousel=!s.config.coverCarousel,_(),N(),A(s.config.coverCarousel?`已开启封面轮播（每 ${Number(s.config.coverCarouselInterval)||10} 秒换一张）`:"已关闭封面轮播",{duration:1600})}function V(){s.config.embedMeta=!s.config.embedMeta,_(),N(),A(s.config.embedMeta?"之后的封面会写进歌曲文件本身":"封面只保存在缓存目录（不改动音乐文件）",{duration:2200})}async function X(){a("正在清空…");try{const e=await u.coverReset(l);b={items:[],embedded:b?.embedded||[],active:0},E(l,null),C(),L(),a(e?.note||"已恢复原始封面")}catch(e){a(`恢复失败：${e?.message??e}`)}}function y(e){return String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}function h(e){return y(e)}export{z as closeCoverPanel,ee as openCoverPanel};
