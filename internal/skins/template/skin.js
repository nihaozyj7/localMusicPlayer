/* ==========================================================================
   示例样式 — 插件入口（契约 v3）
   --------------------------------------------------------------------------
   宿主（播放器主程序）负责**数据与环境**：播放进度、当前曲目、封面集合、歌词
   （含联网匹配与缓存）、设置项、主题、窗口尺寸、实时频谱采样，以及一套可复用的
   渲染 SDK。有变化时它会主动调用 update() / ctx.on() 推给你。
   你负责**呈现与交互**：往 ctx.root 里建 DOM、往 ctx.backgroundRoot 里画背景。

   ★ 三条硬规则（v3）：
     1. **零 import**：不要 import 应用的任何模块（store / utils / bridge），
        也不要用相对路径去够别人目录里的文件。公共零件从 ctx.sdk 拿。
     2. **不用自己写 CSS 作用域前缀**：宿主会把你的 CSS 包成
        `@layer skin { @scope (<你的舞台>) { … } }`，也就是说你写不到
        标题栏 / 底栏 / 浮层，也不需要担心污染别的界面。
     3. **配色靠清单里的 colors 声明**：宿主用你给的 bg / fg 决定自己控件栏的
        配色并保证对比度。想跟随宿主主题就写 `"colors": { "theme": true }`。

   你拿到的 ctx：
     ctx.root            挂载点（宿主已清空，往这里写 DOM）
     ctx.backgroundRoot  整窗背景层容器（清单里声明 capabilities.background 才有）
     ctx.media()         { song, cover, covers, coverIndex, lyrics } 快照
     ctx.track()         { id, title, artist, album, duration, kind }
     ctx.lyrics()        { lines, index, status, statusText, source, text }
     ctx.covers()        { list, index, current }
     ctx.playback()      { position, duration, playing, volume, muted }
     ctx.options()       { showLyrics, lyricsFontSize, animations, coverCarousel, …, interactive }
     ctx.env()           { themeId, mode, width, height, dpr, reducedMotion, foreground }
     ctx.sdk             可复用零件：createLyricsView / createBackgroundLayer / parseLrc / html / util …
     ctx.actions         受控动作：seek / seekBy / seekRatio / togglePlay / next / prev /
                         toggleLike / openFolder / openCoverPanel / openLyricsPanel / reportBackdrop
     ctx.on(type, fn)    订阅某类更新（返回退订函数）
     ctx.defaultCover    封面加载失败时的兜底图
   ========================================================================== */

// 说明：这里**故意不 import 任何东西**（见上面第 1 条）。
export default {
  id: "__SKIN_ID__",

  /** 建 DOM。只会被调用一次（切换样式时会先 destroy 再 mount）。 */
  mount(ctx) {
    const { html } = ctx.sdk;

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

    this.html = html;
    this.refs = {
      cover: ctx.root.querySelector(".demo__cover"),
      title: ctx.root.querySelector(".demo__title"),
      sub: ctx.root.querySelector(".demo__sub"),
    };

    // 交互：一律通过 ctx.actions，不要自己碰音频元素（那是宿主内部实现）
    this.onClick = (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "prev") ctx.actions.prev();
      if (act === "next") ctx.actions.next();
      if (act === "toggle") ctx.actions.togglePlay();
    };
    ctx.root.querySelector(".demo__actions").addEventListener("click", this.onClick);

    // 想要现成的滚动歌词就挂这个零件（它自己处理高亮 / 点击跳转 / 空态文案）
    this.lyrics = ctx.sdk.createLyricsView(ctx.root.querySelector(".demo__lyrics"), {
      onSeek: (ms) => ctx.actions.seek(ms),
      interactive: ctx.options().interactive !== false,
    });

    this.paint(ctx);
  },

  /**
   * 宿主推来的更新。
   *
   * patch.type 取值：mount / song / media / lyrics / progress / state / spectrum /
   * options / theme / resize / visibility / chrome / close / destroy。
   * 只处理你关心的那几种即可 —— 高频的 progress 每次都全量重排会很浪费。
   */
  update(ctx, patch) {
    if (!this.refs) return;
    switch (patch.type) {
      case "mount":
      case "song":
      case "media":
        this.paint(ctx);
        break;
      case "lyrics": {
        const l = ctx.lyrics();
        this.lyrics.setLines(l.lines, { emptyText: this.html.lyricsEmptyText(l) });
        break;
      }
      case "progress":
        this.lyrics.setPosition(patch.position);
        break;
      default:
        break;
    }
  },

  /** 清掉定时器 / 事件监听 / 大对象引用（宿主会紧接着 mount 另一个样式）。 */
  destroy(ctx) {
    this.lyrics?.destroy();
    this.lyrics = null;
    this.refs = null;
    ctx.root.innerHTML = "";
  },

  /** 自己写的小工具（不是接口的一部分，随便改名） */
  paint(ctx) {
    if (!this.refs) return;
    const m = ctx.media();
    const song = m.song;
    this.refs.title.textContent = song ? song.title : "未在播放";
    this.refs.sub.textContent = song
      ? this.html.subtitleOf(song.artist, song.album)
      : "";
    this.html.setCoverImage(this.refs.cover, m.cover, ctx.defaultCover);
    const l = m.lyrics;
    this.lyrics?.setLines(l.lines, { emptyText: this.html.lyricsEmptyText(l) });
  },
};
