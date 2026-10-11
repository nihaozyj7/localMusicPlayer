import{c,o as _,b as p}from"./bridge-DBS9G5z_.js";import{d as f,i as u,b as n,A as y}from"./base-BhtyuJ2U.js";const w=700;function m(r,t,s){const i=t-r;if(!(i>0))return s>=r?1:0;const e=(s-r)/i;return e<=0?0:e>=1?1:Math.round(e*100)/100}const o="music-player.desktop-lyrics.style.v1",d=[{id:"classic",label:"经典描边"},{id:"outline",label:"纯描边"},{id:"shadow",label:"柔和投影"},{id:"glow",label:"霓虹发光"},{id:"gradient",label:"渐变色"}],h=new Set(d.map(r=>r.id));function b(){try{const r=localStorage.getItem(o);return h.has(r)?r:"classic"}catch{return"classic"}}class g extends u{createRenderRoot(){return this}constructor(){super(),this.text="",this.playing=!1,this.fontSize=26,this.styleId=b(),this.tip="桌面歌词 · 播放歌曲后逐行显示（鼠标移入可选择样式，拖动可移动）",this.tipHidden=!1,this._lastText=null,this.chars=[],this.words=[],this.wordEnds=[],this.trans=[],this.posMs=0,this.atMs=0,this._wordsOn=!1,this._wordNodes=null,this._fills=null,this._raf=0}connectedCallback(){super.connectedCallback(),this.boot()}updated(){const t=this.querySelector("#dl-line");t&&(this._wordNodes=null,this._fills=null,this.text!==this._lastText&&(this._lastText=this.text,t.removeAttribute("data-fresh"),t.offsetWidth,this.text&&t.setAttribute("data-fresh","1")),this._syncSmooth())}_syncSmooth(){if(!(this._wordsOn&&this.playing&&typeof requestAnimationFrame=="function")){this._stopSmooth(),this._paint(this.posMs);return}this._raf||(this._raf=requestAnimationFrame(this._tick))}_stopSmooth(){this._raf&&(cancelAnimationFrame(this._raf),this._raf=0)}_tick=()=>{this._raf=0;const t=Date.now()-this.atMs;this._paint(t>w?this.posMs:this.posMs+Math.max(0,t)),this._raf=requestAnimationFrame(this._tick)};_paint(t){if(!this._wordsOn)return;const s=this._wordNodes||(this._wordNodes=[...this.querySelectorAll(".dl__word")]);(!this._fills||this._fills.length!==s.length)&&(this._fills=new Array(s.length).fill(-1));for(let i=0;i<s.length;i+=1){const e=m(this.words[i],this.wordEnds[i],t);this._fills[i]!==e&&(this._fills[i]=e,s[i].style.setProperty("--w",String(e)))}}async boot(){if(!await c()){this.tip="预览模式：桌面歌词窗口需要应用后端",this.requestUpdate();return}this._offLyrics=_("desktop:lyrics",s=>this.render2(s));try{this.render2(await p.desktopLyricsReady())}catch(s){console.info("[desktop-lyrics] 初始状态读取失败",s?.message??s)}}disconnectedCallback(){super.disconnectedCallback(),this._stopSmooth(),this._offLyrics&&(this._offLyrics(),this._offLyrics=null)}render2(t){if(!t||typeof t!="object")return;const s=Math.max(12,Math.min(64,Number(t.fontSize)||26)),i=String(t.text||"").trim(),e=Array.isArray(t.words)?t.words.map(Number):[],l=Array.isArray(t.wordEnds)?t.wordEnds.map(Number):[],a=Array.isArray(t.chars)?t.chars.map(String):[];this._wordsOn=e.length>1&&e.length===a.length&&l.length===e.length,this.fontSize=s,this.text=i,this.playing=!!t.playing,this.chars=this._wordsOn?a:[],this.words=this._wordsOn?e:[],this.wordEnds=this._wordsOn?l:[],this.trans=Array.isArray(t.trans)?t.trans.filter(Boolean).map(String):[],this.posMs=Math.round(Number(t.posMs)||0),this.atMs=Math.round(Number(t.atMs)||0),i&&(this.tipHidden=!0),this.requestUpdate(),this.style.setProperty("--dl-size",s+"px")}setStyle(t){const s=h.has(t)?t:"classic";this.styleId=s;try{localStorage.setItem(o,s)}catch{}this.requestUpdate()}render(){const t=this._wordsOn?n`${this.chars.map((s,i)=>n`<span class="dl__word" data-i=${i}>${s}</span>`)}`:this.text;return n`
      <div
        class="dl"
        id="dl"
        data-state=${this.text?this.playing?"singing":"paused":"idle"}
        data-style=${this.styleId}
        data-words=${this._wordsOn?"1":"0"}
      >
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
              @change=${s=>this.setStyle(s.target.value)}
            >
              ${d.map(s=>n`<option value=${s.id} ?selected=${s.id===this.styleId}>${s.label}</option>`)}
            </select>
          </div>
        </div>
        <p class="dl__line" id="dl-line">${t}</p>
        ${this.trans.length?n`<p class="dl__trans" id="dl-trans">${this.trans.join(" · ")}</p>`:y}
        <p class="dl__tip" id="dl-tip" ?hidden=${this.tipHidden}>${this.tip}</p>
      </div>
    `}}f("mp-desktop-lyrics",g);
