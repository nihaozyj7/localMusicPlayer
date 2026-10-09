/* ==========================================================================
   classic/skin.js — 内置样式「经典」：左唱片 + 右歌词
   --------------------------------------------------------------------------
   契约 v3 的参考实现，第三方样式照着这个抄即可：
     · **零 import**：数据只从 ctx 拿，公共零件从 ctx.sdk 拿；
     · mount 里建 DOM、update 里处理增量、destroy 里清干净；
     · 不从宿主 DOM 里"捞"任何东西（宿主也不窥探插件内部结构）。
   ========================================================================== */

/** 当前挂载实例（同一时刻只会有一个 classic 实例） */
let inst = null;

export default {
  id: "classic",
  name: "经典",

  mount(ctx) {
    const { createLyricsView, html } = ctx.sdk;

    ctx.root.innerHTML = `
      <div class="disc" id="pv-disc" data-spinning="${ctx.playback().playing ? "true" : "false"}">
        <div class="disc__shadow"></div>
        <div class="disc__platter">
          <div class="disc__label">
            <img id="pv-disc-cover" src="${html.escapeHtml(ctx.media().cover)}" alt="" />
          </div>
          <div class="disc__hole"></div>
        </div>
      </div>
      <div class="classic__side">
        <div class="classic__info">
          <div class="classic__title" id="pv-title"></div>
          <div class="classic__artist" id="pv-artist"></div>
          <div class="classic__album" id="pv-album"></div>
        </div>
        <div class="pv-lyrics-host"></div>
      </div>`;

    const lyrics = createLyricsView(ctx.root.querySelector(".pv-lyrics-host"), {
      onSeek: (ms) => ctx.actions.seek(ms),
      onOpenFolder: () => ctx.actions.openFolder(),
      // 宿主可以把同一个皮肤挂到「只能看」的地方（桌面背景歌词），
      // 那种场合下歌词行不该是可点、可聚焦的按钮
      interactive: ctx.options().interactive !== false,
    });

    inst = {
      ctx,
      html,
      lyrics,
      disc: ctx.root.querySelector("#pv-disc"),
      cover: ctx.root.querySelector("#pv-disc-cover"),
      title: ctx.root.querySelector("#pv-title"),
      artist: ctx.root.querySelector("#pv-artist"),
      album: ctx.root.querySelector("#pv-album"),

      paintSong() {
        const m = ctx.media();
        const s = m.song || html.EMPTY_TRACK;
        this.title.textContent = s.title || "未在播放";
        this.artist.textContent = html.subtitleOf(s.artist, "");
        // 专辑单独一行：为空时整行隐藏，避免留下一行空白
        this.album.textContent = s.album || "";
        this.album.hidden = !s.album;
        html.setCoverImage(this.cover, m.cover, ctx.defaultCover);
      },

      paintCover() {
        const m = ctx.media();
        html.setCoverImage(this.cover, m.cover, ctx.defaultCover);
      },

      paintSpin() {
        this.disc.dataset.spinning = String(Boolean(ctx.playback().playing));
      },

      paintLyrics() {
        const m = ctx.media();
        this.lyrics.setLines(m.lyrics.lines, { emptyText: html.lyricsEmptyText(m.lyrics) });
      },
    };

    inst.paintSong();
    inst.paintLyrics();
  },

  update(ctx, patch) {
    if (!inst) return;
    switch (patch.type) {
      case "song": {
        inst.paintSong();
        inst.paintLyrics();
        inst.paintSpin();
        inst.lyrics.setPosition(ctx.playback().position, { immediate: true, playing: ctx.playback().playing });
        break;
      }
      case "media":
        inst.paintCover();
        break;
      case "lyrics": {
        inst.paintLyrics();
        inst.lyrics.setPosition(ctx.playback().position, { immediate: true, playing: ctx.playback().playing });
        break;
      }
      case "progress":
        // 让 SDK 的渲染器自己按进度算行号：宿主只推进度，避免两处各算一遍。
        // playing 一并给它：字级（逐字）歌词要按墙钟补齐 250ms 进度之间的帧。
        inst.lyrics.setPosition(patch.position, { playing: patch.playing });
        break;
      case "state":
        inst.paintSpin();
        inst.lyrics.setPlaying?.(patch.playing);
        break;
      default:
        break;
    }
  },

  destroy() {
    inst?.lyrics.destroy();
    inst = null;
  },
};
