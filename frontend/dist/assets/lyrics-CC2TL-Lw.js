import{c as n,o as c,b as o}from"./bridge-CJD-9QGY.js";import{d as h,i as p,b as l}from"./base-DT2k5XGZ.js";const a="music-player.desktop-lyrics.style.v1",d=[{id:"classic",label:"经典描边"},{id:"outline",label:"纯描边"},{id:"shadow",label:"柔和投影"},{id:"glow",label:"霓虹发光"},{id:"gradient",label:"渐变色"}],r=new Set(d.map(s=>s.id));function y(){try{const s=localStorage.getItem(a);return r.has(s)?s:"classic"}catch{return"classic"}}class u extends p{createRenderRoot(){return this}constructor(){super(),this.text="",this.playing=!1,this.fontSize=26,this.styleId=y(),this.tip="桌面歌词 · 播放歌曲后逐行显示（鼠标移入可选择样式，拖动可移动）",this.tipHidden=!1,this._lastText=null}connectedCallback(){super.connectedCallback(),this.boot()}updated(){const t=this.querySelector("#dl-line");t&&this.text!==this._lastText&&(this._lastText=this.text,t.removeAttribute("data-fresh"),t.offsetWidth,this.text&&t.setAttribute("data-fresh","1"))}async boot(){if(!await n()){this.tip="预览模式：桌面歌词窗口需要应用后端",this.requestUpdate();return}c("desktop:lyrics",e=>this.render2(e));try{this.render2(await o.desktopLyricsReady())}catch(e){console.info("[desktop-lyrics] 初始状态读取失败",e?.message??e)}}render2(t){if(!t||typeof t!="object")return;const e=Math.max(12,Math.min(64,Number(t.fontSize)||26)),i=String(t.text||"").trim();this.fontSize=e,this.text=i,this.playing=!!t.playing,i&&(this.tipHidden=!0),this.requestUpdate(),this.style.setProperty("--dl-size",e+"px")}setStyle(t){const e=r.has(t)?t:"classic";this.styleId=e;try{localStorage.setItem(a,e)}catch{}this.requestUpdate()}render(){return l`
      <div class="dl" id="dl" data-state=${this.text?this.playing?"singing":"paused":"idle"} data-style=${this.styleId}>
        <!-- 悬浮控制栏：鼠标移入窗口时才出现（"常规窗口"形态）。
             不悬浮时整块（含窗口背景）完全透明，不会在桌面上留下半透明色块。 -->
        <div class="dl__bar" id="dl-bar">
          <label class="dl__bar-label" for="dl-style">桌面歌词样式</label>
          <div class="dl__select-wrap">
            <select
              class="dl__select"
              id="dl-style"
              aria-label="桌面歌词样式"
              .value=${this.styleId}
              @change=${t=>this.setStyle(t.target.value)}
            >
              ${d.map(t=>l`<option value=${t.id} ?selected=${t.id===this.styleId}>${t.label}</option>`)}
            </select>
          </div>
        </div>
        <p class="dl__line" id="dl-line">${this.text}</p>
        <p class="dl__tip" id="dl-tip" ?hidden=${this.tipHidden}>${this.tip}</p>
      </div>
    `}}h("mp-desktop-lyrics",u);
