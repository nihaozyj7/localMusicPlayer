/* ==========================================================================
   示例样式 — 皮肤入口（一个 ES module，导出 defineSkin({...})）
   --------------------------------------------------------------------------
   宿主（播放器主程序）负责**数据**：音频元素、播放进度、当前曲目、封面集合、
   歌词、设置项、主题、窗口尺寸；有变化时它会主动调用 update() 推给你。
   你负责**呈现与交互**：往 ctx.root 里建 DOM，往 ctx.backgroundRoot 里画背景。

   你拿到的 ctx：
     ctx.root            挂载点（宿主已清空，往这里写 DOM）
     ctx.backgroundRoot  整窗背景层容器（声明 background: true 时才有内容）
     ctx.media()         { song, cover, covers, coverIndex, lyrics } 快照
     ctx.playback()      { position, duration, playing, volume, muted }
     ctx.options()       { showLyrics, lyricsFontSize, animations, coverCarousel, … }
     ctx.actions         只读动作：seek / togglePlay / next / prev / openFolder / openCoverPanel
     ctx.on(type, fn)    订阅某类更新（见 update 的 patch.type）
     ctx.defaultCover    封面加载失败时的兜底图

   ★ 不要在皮肤里 import 应用的内部模块（store / utils / bridge），
     也不要直接操作音频元素：那些都是宿主内部实现，接口只保证 ctx 这一层。
   ========================================================================== */

// 说明：这里**故意不 import 任何东西**。
// 第三方样式是浏览器直接 import 的模块，没有打包器帮你解析裸包名，
// 所以 export 一个普通对象最稳（宿主会校验必需字段并补默认值）。
// 如果你想用仓库里那套 defineSkin() 做校验，就在开发环境写成
//     import { defineSkin } from "@musicplayer/player-skins/contract";
// 并把 id 换成你自己的样式 id（目录名）。
export default {
  apiVersion: 1,
  id: "__SKIN_ID__",
  name: "示例样式",
  icon: "disc", // index.html 里图标 sprite 的 id：disc / lyrics / slideshow / palette / refresh …
  order: 200, // 排在三个内置样式之后
  description: "自己动手写的第一版",
  background: false, // 需要整窗背景层就改成 true，然后用 ctx.backgroundRoot

  /** 建 DOM。只会被调用一次（切换样式时会先 destroy 再 mount）。 */
  mount(ctx) {
    ctx.root.innerHTML = `
      <div class="demo">
        <img class="demo__cover" alt="" />
        <div class="demo__title"></div>
        <div class="demo__sub"></div>
        <div class="demo__lyrics pv-lyrics-host"></div>
        <div class="demo__actions">
          <button type="button" data-act="prev">上一首</button>
          <button type="button" data-act="toggle">播放 / 暂停</button>
          <button type="button" data-act="next">下一首</button>
        </div>
      </div>`;

    this.refs = {
      cover: ctx.root.querySelector(".demo__cover"),
      title: ctx.root.querySelector(".demo__title"),
      sub: ctx.root.querySelector(".demo__sub"),
    };

    // 封面加载失败时退回兜底图（否则会看到浏览器的破图图标）
    this.refs.cover.addEventListener("error", () => {
      if (this.refs.cover.src !== ctx.defaultCover) this.refs.cover.src = ctx.defaultCover;
    });

    // 交互：一律通过 ctx.actions，不要自己碰音频元素
    ctx.root.querySelector(".demo__actions").addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "prev") ctx.actions.prev();
      if (act === "next") ctx.actions.next();
      if (act === "toggle") ctx.actions.togglePlay();
    });

    this.paint(ctx, ctx.media());
  },

  /**
   * 宿主推来的更新。
   *
   * patch.type 取值：mount / song / media / lyrics / progress / state /
   * options / theme / resize / close / destroy。
   * 只处理你关心的那几种即可 —— 高频的 progress 每次都全量重排会很浪费。
   */
  update(ctx, patch) {
    if (patch.type === "song" || patch.type === "media" || patch.type === "mount") {
      this.paint(ctx, ctx.media());
    }
  },

  /** 清掉定时器 / 事件监听 / 大对象引用（宿主会紧接着 mount 另一个样式）。 */
  destroy(ctx) {
    ctx.root.innerHTML = "";
    this.refs = null;
  },

  /** 自己写的小工具（不是接口的一部分，随便改名） */
  paint(ctx, media) {
    if (!this.refs) return;
    const song = media.song;
    this.refs.title.textContent = song ? song.title : "未在播放";
    this.refs.sub.textContent = song ? `${song.artist || "未知歌手"} · ${song.album || "未知专辑"}` : "";
    this.refs.cover.src = media.cover || ctx.defaultCover;
    this.refs.cover.alt = song ? `${song.title} 封面` : "";
  },
};
