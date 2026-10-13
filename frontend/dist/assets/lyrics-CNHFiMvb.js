import{c as S,o as m,b as w}from"./bridge-DhkHXGRf.js";import{d as b,i as z,b as l,A as c}from"./base-BcS_UeiT.js";const g=700;function v(i,t,s){const e=t-i;if(!(e>0))return s>=i?1:0;const r=(s-i)/e;return r<=0?0:r>=1?1:Math.round(r*100)/100}const p="music-player.desktop-lyrics.style.v1",_=[{id:"classic",label:"经典描边"},{id:"outline",label:"纯描边"},{id:"shadow",label:"柔和投影"},{id:"glow",label:"霓虹发光"},{id:"gradient",label:"渐变色"}],u=new Set(_.map(i=>i.id));function $(){try{const i=localStorage.getItem(p);return u.has(i)?i:"classic"}catch{return"classic"}}const a="music-player.desktop-lyrics.size.v1",f=18,y=64,n=26;function o(i){const t=Math.round(Number(i));return Number.isFinite(t)?Math.min(y,Math.max(f,t)):n}function A(){try{const i=localStorage.getItem(a);return i===null||i===""?null:o(i)}catch{return null}}class M extends z{createRenderRoot(){return this}constructor(){super(),this.text="",this.playing=!1,this.remoteSize=n,this.sizeOverride=A(),this.fontSize=this.sizeOverride??n,this.styleId=$(),this.tip="桌面歌词 · 播放歌曲后逐行显示（鼠标移入可调样式与字号，拖动可移动）",this.tipHidden=!1,this._lastText=null,this.chars=[],this.words=[],this.wordEnds=[],this.trans=[],this.posMs=0,this.atMs=0,this._wordsOn=!1,this._wordNodes=null,this._fills=null,this._raf=0}connectedCallback(){super.connectedCallback(),this.boot()}updated(){const t=this.querySelector("#dl-line");t&&(this._wordNodes=null,this._fills=null,this.text!==this._lastText&&(this._lastText=this.text,t.removeAttribute("data-fresh"),t.offsetWidth,this.text&&t.setAttribute("data-fresh","1")),this._syncSmooth())}_syncSmooth(){if(!(this._wordsOn&&this.playing&&typeof requestAnimationFrame=="function")){this._stopSmooth(),this._paint(this.posMs);return}this._raf||(this._raf=requestAnimationFrame(this._tick))}_stopSmooth(){this._raf&&(cancelAnimationFrame(this._raf),this._raf=0)}_tick=()=>{this._raf=0;const t=Date.now()-this.atMs;this._paint(t>g?this.posMs:this.posMs+Math.max(0,t)),this._raf=requestAnimationFrame(this._tick)};_paint(t){if(!this._wordsOn)return;const s=this._wordNodes||(this._wordNodes=[...this.querySelectorAll(".dl__word")]);(!this._fills||this._fills.length!==s.length)&&(this._fills=new Array(s.length).fill(-1));for(let e=0;e<s.length;e+=1){const r=v(this.words[e],this.wordEnds[e],t);this._fills[e]!==r&&(this._fills[e]=r,s[e].style.setProperty("--w",String(r)))}}async boot(){if(!await S()){this.tip="预览模式：桌面歌词窗口需要应用后端",this.requestUpdate();return}this._offLyrics=m("desktop:lyrics",s=>this.render2(s));try{this.render2(await w.desktopLyricsReady())}catch(s){console.info("[desktop-lyrics] 初始状态读取失败",s?.message??s)}}disconnectedCallback(){super.disconnectedCallback(),this._stopSmooth(),this._offLyrics&&(this._offLyrics(),this._offLyrics=null)}render2(t){if(!t||typeof t!="object")return;const s=o(t.fontSize),e=String(t.text||"").trim(),r=Array.isArray(t.words)?t.words.map(Number):[],d=Array.isArray(t.wordEnds)?t.wordEnds.map(Number):[],h=Array.isArray(t.chars)?t.chars.map(String):[];this._wordsOn=r.length>1&&r.length===h.length&&d.length===r.length,this.remoteSize=s,this.fontSize=this.sizeOverride??s,this.text=e,this.playing=!!t.playing,this.chars=this._wordsOn?h:[],this.words=this._wordsOn?r:[],this.wordEnds=this._wordsOn?d:[],this.trans=Array.isArray(t.trans)?t.trans.filter(Boolean).map(String):[],this.posMs=Math.round(Number(t.posMs)||0),this.atMs=Math.round(Number(t.atMs)||0),e&&(this.tipHidden=!0),this.requestUpdate(),this._applySize()}_applySize(){this.style.setProperty("--dl-size",`${this.fontSize}px`)}setSize(t){this.sizeOverride=o(t);try{localStorage.setItem(a,String(this.sizeOverride))}catch{}this.fontSize=this.sizeOverride,this._applySize(),this.requestUpdate()}followRemoteSize(){this.sizeOverride=null;try{localStorage.removeItem(a)}catch{}this.fontSize=this.remoteSize,this._applySize(),this.requestUpdate()}setStyle(t){const s=u.has(t)?t:"classic";this.styleId=s;try{localStorage.setItem(p,s)}catch{}this.requestUpdate()}render(){const t=this._wordsOn?l`${this.chars.map((s,e)=>l`<span class="dl__word" data-i=${e}>${s}</span>`)}`:this.text;return l`
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
              ${_.map(s=>l`<option value=${s.id} ?selected=${s.id===this.styleId}>${s.label}</option>`)}
            </select>
          </div>
          <span class="dl__bar-sep" aria-hidden="true"></span>
          <label class="dl__bar-label" for="dl-size">字号</label>
          <div class="dl__size-wrap">
            <input
              class="dl__size"
              id="dl-size"
              type="range"
              min=${f}
              max=${y}
              step="1"
              aria-label="桌面歌词字号"
              .value=${String(this.fontSize)}
              @input=${s=>this.setSize(s.target.value)}
            />
            <span class="dl__size-val" id="dl-size-val">${this.fontSize}</span>
            ${this.sizeOverride===null?c:l`<button
                    class="dl__size-reset"
                    id="dl-size-reset"
                    type="button"
                    title="恢复为跟随设置里的歌词字号"
                    aria-label="恢复为跟随设置里的歌词字号"
                    @click=${()=>this.followRemoteSize()}
                  >
                    ↺
                  </button>`}
          </div>
        </div>
        <p class="dl__line" id="dl-line">${t}</p>
        ${this.trans.length?l`<p class="dl__trans" id="dl-trans">${this.trans.join(" · ")}</p>`:c}
        <p class="dl__tip" id="dl-tip" ?hidden=${this.tipHidden}>${this.tip}</p>
      </div>
    `}}b("mp-desktop-lyrics",M);
