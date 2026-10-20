// @ts-check
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

   你拿到的 ctx（字段全貌见同目录的 types.js，编辑器里会有补全）：
     ctx.root            挂载点（宿主已清空，往这里写 DOM）
     ctx.backgroundRoot  整窗背景层容器（清单里声明 capabilities.background 才有）
     ctx.media()         { song, cover, covers, coverIndex, lyrics } 快照
     ctx.track()         { id, title, artist, album, duration, kind }
     ctx.lyrics()        { lines, index, status, statusText, source, text }
     ctx.covers()        { list, index, current }
     ctx.playback()      { position, duration, playing, volume, muted }
     ctx.options()       { showLyrics, lyricsFontSize, animations, coverCarousel, …, interactive }
     ctx.env()           { themeId, mode, width, height, dpr, reducedMotion, foreground }
     ctx.sdk             可复用零件：createLyricsView / createFxLyrics / createBackgroundLayer /
                         steadyPosition / marqueeText / parseLrc / html / util …
     ctx.actions         受控动作：seek / seekBy / seekRatio / togglePlay / next / prev /
                         toggleLike / openFolder / openCoverPanel / openLyricsPanel / reportBackdrop
     ctx.on(type, fn)    订阅某类更新（返回退订函数）
     ctx.defaultCover    封面加载失败时的兜底图

   ★ 这份文件里的 JSDoc 类型来自 ./types.js（只给编辑器看，运行期不加载）。
     想开严格检查就把 `// @ts-check` 留在第一行；不需要就删掉它，注释仍有补全作用。
   ========================================================================== */

/**
 * 模板自己的运行时状态。**不用 `this` 挂状态**：用模块级 state 对象，
 * 这样 // @ts-check 能检查到每个字段，插件被卸载时也只需要把 state 置空。
 * @typedef {Object} DemoState
 * @property {import("./types.js").SkinContext} ctx
 * @property {import("./types.js").LyricsView} lyrics
 * @property {HTMLImageElement} cover
 * @property {HTMLElement} title
 * @property {HTMLElement} sub
 */

/** @type {DemoState|null} */
let state = null;

/** @type {import("./types.js").SkinModule} */
const skin = {
  id: "__SKIN_ID__",

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

    // 想要现成的滚动歌词就挂这个零件（它自己处理高亮 / 点击跳转 / 空态文案 /
    // 逐字平滑填充 —— 连位置防回退也在里面，不需要你自己夹）。
    const lyrics = ctx.sdk.createLyricsView(ctx.root.querySelector(".demo__lyrics"), {
      onSeek: (ms) => ctx.actions.seek(ms),
      onOpenFolder: () => ctx.actions.openFolder(),
      interactive: ctx.options().interactive !== false,
    });

    state = {
      ctx,
      lyrics,
      cover: /** @type {HTMLImageElement} */ (ctx.root.querySelector(".demo__cover")),
      title: /** @type {HTMLElement} */ (ctx.root.querySelector(".demo__title")),
      sub: /** @type {HTMLElement} */ (ctx.root.querySelector(".demo__sub")),
    };

    // 交互：一律通过 ctx.actions，不要自己碰音频元素（那是宿主内部实现）
    ctx.root.querySelector(".demo__actions")?.addEventListener("click", (e) => {
      const act = e.target instanceof Element ? e.target.closest("[data-act]")?.getAttribute("data-act") : "";
      if (act === "prev") ctx.actions.prev();
      if (act === "next") ctx.actions.next();
      if (act === "toggle") ctx.actions.togglePlay();
    });

    paint(ctx);
    paintLyrics(ctx);
  },

  /**
   * 宿主推来的更新。
   *
   * patch.type 取值：mount / song / media / lyrics / progress / state /
   * options / theme / resize / close / destroy（清单见 contract.js 的
   * PATCH_TYPES —— 与宿主实际推的类型有机械对账测试，别照抄旧文档）。
   * 只处理你关心的那几种即可 —— 高频的 progress 每次都全量重排会很浪费。
   *
   * @param {import("./types.js").SkinContext} ctx
   * @param {import("./types.js").SkinPatch} patch
   */
  update(ctx, patch) {
    if (!state) return;
    switch (patch.type) {
      case "mount":
      case "song":
        paint(ctx);
        paintLyrics(ctx);
        state.lyrics.setPosition(ctx.playback().position, { immediate: true, playing: ctx.playback().playing });
        break;
      case "media":
        paint(ctx);
        break;
      case "lyrics":
        paintLyrics(ctx);
        state.lyrics.setPosition(ctx.playback().position, { immediate: true, playing: ctx.playback().playing });
        break;
      case "progress":
        // playing 一并给它：字级（逐字）歌词要按墙钟补齐 250ms 进度之间的帧。
        // position 已经过宿主单调化；零件内部还会再夹一次（position.js#steadyPosition）。
        state.lyrics.setPosition(patch.position ?? 0, { playing: patch.playing === true });
        break;
      case "state":
        state.lyrics.setPlaying(patch.playing === true);
        break;
      default:
        break;
    }
  },

  /** 清掉定时器 / 事件监听 / 大对象引用（宿主会紧接着 mount 另一个样式） */
  destroy(ctx) {
    state?.lyrics.destroy();
    state = null;
    ctx.root.innerHTML = "";
  },
};

export default skin;

/* --------------------------------------------------------------------------
   自己的小工具（不是接口的一部分，随便改名 / 拆到 lib/ 里）
   -------------------------------------------------------------------------- */

/**
 * 曲名 / 歌手 / 封面。
 * @param {import("./types.js").SkinContext} ctx
 */
function paint(ctx) {
  if (!state) return;
  const m = ctx.media();
  const song = m.song;
  state.title.textContent = song ? song.title : "未在播放";
  state.sub.textContent = song ? [song.artist, song.album].filter(Boolean).join(" · ") : "";
  ctx.sdk.html.setCoverImage(state.cover, m.cover, ctx.defaultCover);
}

/**
 * 歌词内容。`emptyText` 交给零件里的统一实现（"匹配中 / 匹配失败 / 暂无歌词"）。
 * @param {import("./types.js").SkinContext} ctx
 */
function paintLyrics(ctx) {
  if (!state) return;
  const lyrics = ctx.lyrics();
  state.lyrics.setLines(lyrics.lines, { emptyText: ctx.sdk.html.lyricsEmptyText(lyrics) });
}
