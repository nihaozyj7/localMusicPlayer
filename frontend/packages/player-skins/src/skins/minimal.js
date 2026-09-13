// @ts-check
/* ==========================================================================
   minimal.js — 内置样式「简约」：无封面，居中歌词
   ========================================================================== */

import { defineSkin } from "../contract.js";
import { createLyricsView } from "../lyrics-view.js";
import "./minimal.css";

let inst = null;

const skin = defineSkin({
  apiVersion: 1,
  id: "minimal",
  name: "简约",
  icon: "minimal",
  order: 30,
  description: "只留文字，歌词独占视觉重心",
  background: false,

  mount(ctx) {
    ctx.root.innerHTML = `
      <div class="minimal__inner">
        <div class="minimal__info">
          <div class="minimal__title" id="pv-title"></div>
          <div class="minimal__artist" id="pv-artist"></div>
        </div>
        <div class="pv-lyrics-host"></div>
      </div>`;

    const lyrics = createLyricsView(ctx.root.querySelector(".pv-lyrics-host"), {
      onSeek: (ms) => ctx.actions.seek(ms),
      onOpenFolder: () => ctx.actions.openFolder(),
      // 同 classic：宿主挂到「只能看」的地方时歌词行不做成按钮
      interactive: ctx.options().interactive !== false,
    });

    inst = {
      ctx,
      lyrics,
      title: ctx.root.querySelector("#pv-title"),
      artist: ctx.root.querySelector("#pv-artist"),

      paintSong() {
        const s = ctx.media().song || {};
        this.title.textContent = s.title || "未在播放";
        this.artist.textContent = s.artist || "—";
      },
    };

    inst.paintSong();
    const m = ctx.media();
    lyrics.setLines(m.lyrics.lines, { emptyText: emptyTextFor(m.lyrics) });
  },

  update(ctx, patch) {
    if (!inst) return;
    switch (patch.type) {
      case "song": {
        inst.paintSong();
        const m = ctx.media();
        inst.lyrics.setLines(m.lyrics.lines, { emptyText: emptyTextFor(m.lyrics) });
        inst.lyrics.setPosition(ctx.playback().position, { immediate: true });
        break;
      }
      case "lyrics": {
        const m = ctx.media();
        inst.lyrics.setLines(m.lyrics.lines, { emptyText: emptyTextFor(m.lyrics) });
        inst.lyrics.setPosition(ctx.playback().position, { immediate: true });
        break;
      }
      case "progress":
        inst.lyrics.setPosition(patch.position);
        break;
      default:
        break;
    }
  },

  destroy() {
    inst?.lyrics.destroy();
    inst = null;
  },
});

function emptyTextFor(lyrics) {
  if (lyrics?.source === "online") return "在线匹配没有结果";
  return "暂无歌词";
}

export default skin;
