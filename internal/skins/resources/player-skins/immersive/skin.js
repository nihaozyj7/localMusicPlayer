/* ==========================================================================
   immersive/skin.js — 内置样式「沉浸」：封面虚化铺满整窗 + 居中歌词
   --------------------------------------------------------------------------
   与 classic 的唯一结构差别：它声明了 `capabilities.background`，于是宿主会
   给它一个**整窗背景层**容器（在 `.playerview` 之外，因此 position:fixed 能
   铺满窗口），它只负责往里填图。

   注意"宿主壳跟着透明"这件事**不在这里做**：那是宿主按 `background: true`
   统一处理的（v2 里是沉浸样式自己写 `.app[data-mode="immersive"]` 去改标题栏和
   底栏 —— 那正是插件越界改宿主 UI 的样本）。
   ========================================================================== */

let inst = null;

export default {
  id: "immersive",
  name: "沉浸",

  mount(ctx) {
    const { createLyricsView, createBackgroundLayer, html } = ctx.sdk;

    ctx.root.innerHTML = `
      <div class="immersive__card">
        <div class="immersive__info">
          <div class="immersive__title" id="pv-title"></div>
          <div class="immersive__artist" id="pv-artist"></div>
        </div>
        <div class="pv-lyrics-host"></div>
      </div>`;

    const lyrics = createLyricsView(ctx.root.querySelector(".pv-lyrics-host"), {
      onSeek: (ms) => ctx.actions.seek(ms),
      onOpenFolder: () => ctx.actions.openFolder(),
      // 同 classic：宿主挂到「只能看」的地方时歌词行不做成按钮
      interactive: ctx.options().interactive !== false,
    });

    // 背景层由宿主提供容器（位置是宿主的事），渲染是这个皮肤的职责
    const background = createBackgroundLayer(ctx.backgroundRoot);
    background.setStyle({ blur: 54, brightness: 0.85, scale: 1.14 });

    inst = {
      ctx,
      html,
      lyrics,
      background,
      title: ctx.root.querySelector("#pv-title"),
      artist: ctx.root.querySelector("#pv-artist"),

      paintSong() {
        const m = ctx.media();
        const s = m.song || html.EMPTY_TRACK;
        this.title.textContent = s.title || "未在播放";
        this.artist.textContent = html.subtitleOf(s.artist, s.album);
        // 用当前生效封面当整窗背景；轮播切图时也会走到这里
        this.background.setImage(m.cover);
      },

      paintLyrics() {
        const m = ctx.media();
        this.lyrics.setLines(m.lyrics.lines, { emptyText: html.lyricsEmptyText(m.lyrics) });
      },
    };

    inst.paintSong();
    background.setEnabled(true);
    inst.paintLyrics();
  },

  update(ctx, patch) {
    if (!inst) return;
    switch (patch.type) {
      case "song": {
        inst.paintSong();
        inst.paintLyrics();
        inst.lyrics.setPosition(ctx.playback().position, { immediate: true, playing: ctx.playback().playing });
        break;
      }
      case "media":
        inst.paintSong();
        break;
      case "lyrics": {
        inst.paintLyrics();
        inst.lyrics.setPosition(ctx.playback().position, { immediate: true, playing: ctx.playback().playing });
        break;
      }
      case "progress":
        // playing 一并给它：字级（逐字）歌词要按墙钟补齐 250ms 进度之间的帧
        inst.lyrics.setPosition(patch.position, { playing: patch.playing });
        break;
      case "close":
        // 详情页收起时把整窗背景也收掉，别让它在曲库界面上继续盖着
        inst.background.setEnabled(false);
        break;
      default:
        break;
    }
  },

  destroy() {
    inst?.lyrics.destroy();
    inst?.background.destroy();
    inst = null;
  },
};
