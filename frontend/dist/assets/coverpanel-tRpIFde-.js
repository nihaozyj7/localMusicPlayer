import{s as c,t as A,b as v,c as N,i as o,a as q,n as E,d as H,e as L}from"./index-CaHB6NmG.js";let z=!1,i=null,u=null,l=null,d=[],r=new Set,b=null,w=!1;function B(){if(!z){if(z=!0,i=document.getElementById("cover-layer"),!i)throw new Error("缺少 #cover-layer 容器");u=i.querySelector("#cover-layer-body"),i.addEventListener("click",e=>{if(e.target.closest("[data-cover-close]")||e.target===i){T();return}const t=e.target.closest("[data-set-act]");if(t){const n=Number(t.closest("[data-set-index]")?.dataset.setIndex);t.dataset.setAct==="use"&&U(n),t.dataset.setAct==="remove"&&G(n);return}const a=e.target.closest("[data-cover-act]")?.dataset.coverAct;a&&(a==="search"&&D(),a==="url"&&P(),a==="reset"&&Q(),a==="toggle"&&R(Number(e.target.closest("[data-cover-idx]")?.dataset.coverIdx)),a==="select-all"&&j(),a==="apply"&&O(),a==="carousel"&&J(),a==="embed"&&K(),a==="open-cache"&&v.coverOpenCacheDir("covers"))}),i.addEventListener("keydown",e=>{if(e.key!=="Escape")return;const t=i.querySelector("#cover-keyword");if(t&&document.activeElement===t&&t.value.trim()){t.value="";return}T()})}}function X(e){B(),l=e,d=[],r=new Set,b=c.coverSets.get(e)||null;const t=c.songs.find(a=>a.id===e);if(!t){A("这首歌不在本地曲库里，无法更换封面",{tone:"warning"});return}I(t),i.hidden=!1,requestAnimationFrame(()=>i.setAttribute("data-state","opened")),F()}function T(){i&&(i.setAttribute("data-state","closed"),setTimeout(()=>{i.getAttribute("data-state")==="closed"&&(i.hidden=!0)},200))}async function F(){if(!(!L()||!l))try{const e=await v.coverList(l);e&&Array.isArray(e.items)&&(b=e,q(l,e),k(),_(),E())}catch(e){s(`读取现有封面失败：${e?.message??e}`)}}function I(e){const t=N(e);u.innerHTML=`
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
    </div>`,k(),_(),S()}function s(e){const t=u?.querySelector("#cover-status");t&&(t.textContent=e||"")}function k(){const e=u?.querySelector("#cover-set");if(!e)return;const t=b?.items||[],a=b?.embedded||[],n=Number(b?.active)||0;if(!t.length&&!a.length){e.innerHTML='<div class="cover-set__empty">还没有换过封面，这首歌现在用的是文件自带的封面。</div>';return}const p=t.map((m,g)=>`
      <div class="cover-set__item" data-set-index="${g}" data-active="${g===n}">
        <img src="${h(m.preview)}" alt="" />
        ${g===n?'<span class="cover-set__badge">当前</span>':""}
        <div class="cover-set__ops">
          <button class="btn btn--xs" type="button" data-set-act="use" ${g===n?"disabled":""}>
            ${o("check")}<span>设为当前</span>
          </button>
          <button class="btn btn--xs btn--danger" type="button" data-set-act="remove">
            ${o("trash")}<span>删除</span>
          </button>
        </div>
      </div>`).join(""),f=a.map(()=>`
      <div class="cover-set__item cover-set__item--embedded" data-embedded="1">
        <img src="" alt="" />
        <span class="cover-set__badge cover-set__badge--ghost">文件内嵌</span>
        <div class="cover-set__ops">
          <button class="btn btn--xs" type="button" data-set-act="use">
            ${o("plus")}<span>收进缓存</span>
          </button>
        </div>
      </div>`).join("");e.innerHTML=p+f,e.querySelectorAll("[data-embedded='1']").forEach((m,g)=>{const M=a[g],x=m.querySelector("img");x&&M?.preview&&(x.src=M.preview),m.querySelector("[data-set-act='use']")?.addEventListener("click",()=>W(M))})}function _(){const e=u?.querySelector("#cover-carousel-btn");e&&e.setAttribute("aria-pressed",String(c.config.coverCarousel===!0));const t=u?.querySelector("#cover-embed-btn");t&&(t.setAttribute("aria-pressed",String(c.config.embedMeta===!0)),t.dataset.tip=c.config.embedMeta?"关闭后封面只存在缓存目录里":"打开后封面会写进歌曲文件本身（会修改音乐文件）")}function S(){const e=u?.querySelector("#cover-grid");if(e){if(!d.length){e.innerHTML="",C();return}e.innerHTML=d.map((t,a)=>{const n=r.has(a);return`
      <button class="cover-card" type="button" role="checkbox" aria-checked="${n}"
        data-cover-act="toggle" data-cover-idx="${a}" data-selected="${n}">
        <img src="${h(t.preview)}" alt="" loading="lazy" />
        <span class="cover-card__check">${o("check")}</span>
        <span class="cover-card__meta">
          <span class="cover-card__provider">${y(t.provider||"来源")}</span>
          <span class="cover-card__score">${t.width&&t.height?`${t.width}×${t.height}`:`匹配度 ${Number(t.score)||0}`}</span>
        </span>
      </button>`}).join(""),C()}}function C(){const e=u?.querySelector("#cover-selectbar");if(e){if(!d.length){e.hidden=!0,e.innerHTML="";return}e.hidden=!1,e.innerHTML=`
    <span class="cover-panel__selectinfo">已选 ${r.size} / ${d.length} 张</span>
    <span class="u-spacer"></span>
    <button class="btn btn--sm" type="button" data-cover-act="select-all">
      ${o("check")}<span>${r.size===d.length?"取消全选":"全选"}</span>
    </button>
    <button class="btn btn--primary btn--sm" type="button" data-cover-act="apply"
      ${r.size?"":"disabled"}>
      ${o("plus")}<span>应用${r.size?`（${r.size}）`:""}</span>
    </button>`}}function R(e){if(!Number.isFinite(e))return;r.has(e)?r.delete(e):r.add(e);const t=u?.querySelector(`[data-cover-idx="${e}"]`);if(t){const a=r.has(e);t.dataset.selected=String(a),t.setAttribute("aria-checked",String(a))}C()}function j(){r.size===d.length?r.clear():d.forEach((e,t)=>r.add(t)),S()}async function D(){if(w)return;if(!L()){s("浏览器预览下没有联网封面后端，请在应用里试");return}w=!0,d=[],r=new Set,S();const e=(u?.querySelector("#cover-keyword")?.value||"").trim();s(e?`正在按「${e}」同时查询多个来源（iTunes / 网易云 / Deezer / MusicBrainz）…`:"正在同时查询多个来源（iTunes / 网易云 / Deezer / MusicBrainz）…");try{const t=e?{keyword:e}:{},a=await v.coverLookupSongAll(l,t),n=Array.isArray(a)?a.filter(p=>p?.ok&&p.preview):[];if(n.length){d=n,n.forEach((f,m)=>r.add(m));const p=[...new Set(n.map(f=>f.provider).filter(Boolean))];s(`找到 ${n.length} 张（来源：${p.join(" / ")||"未知"}），勾选后点「应用」`)}else{const p=Array.isArray(a)?a.find(f=>f?.message)?.message:"";s(p||"没有找到匹配的封面（也可能是匹配到的都是空白图，已自动丢弃）")}}catch(t){s(`搜索失败：${t?.message??t}`)}finally{w=!1,S()}}async function O(){const e=[...r].sort((t,a)=>t-a).map(t=>d[t]?.preview).filter(Boolean);if(!e.length){s("先勾选至少一张封面");return}await $(()=>v.coverAddMany(l,e,c.config.embedMeta===!0))}async function P(){const t=(u?.querySelector("#cover-url")?.value||"").trim();if(!t){s("请先填写图片地址");return}s("正在下载图片…");try{const a=await v.coverFetchURL(t);if(!a?.ok||!a.preview){s(a?.message||"这张图片取不到");return}await $(()=>v.coverAdd(l,t,a.preview,c.config.embedMeta===!0))}catch(a){s(`取图失败：${a?.message??a}`)}}async function U(e){Number.isFinite(e)&&await $(()=>v.coverSetActive(l,e))}async function W(e){e?.preview&&await $(()=>v.coverAdd(l,"",e.preview,c.config.embedMeta===!0))}async function G(e){Number.isFinite(e)&&await $(()=>v.coverRemove(l,e))}async function $(e){if(!L()){s("浏览器预览下没有封面后端，请在应用里试");return}s("正在保存…");try{const t=await e();t&&Array.isArray(t.items)&&(b=t,q(l,t),k(),_(),E()),s(t?.message||"已更新封面"),A(t?.message||"封面已更新",{tone:"success",duration:1800})}catch(t){s(`保存失败：${t?.message??t}`)}}function J(){c.config.coverCarousel=!c.config.coverCarousel,_(),H(),A(c.config.coverCarousel?`已开启封面轮播（每 ${Number(c.config.coverCarouselInterval)||10} 秒换一张）`:"已关闭封面轮播",{duration:1600})}function K(){c.config.embedMeta=!c.config.embedMeta,_(),H(),A(c.config.embedMeta?"之后的封面会写进歌曲文件本身":"封面只保存在缓存目录（不改动音乐文件）",{duration:2200})}async function Q(){s("正在清空…");try{const e=await v.coverReset(l);b={items:[],embedded:b?.embedded||[],active:0},q(l,null),k(),E(),s(e?.note||"已恢复原始封面")}catch(e){s(`恢复失败：${e?.message??e}`)}}function y(e){return String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}function h(e){return y(e)}export{T as closeCoverPanel,X as openCoverPanel};
