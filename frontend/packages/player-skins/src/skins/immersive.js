// @ts-check
/* ==========================================================================
   immersive.js — 内置样式「沉浸」：封面虚化铺满整窗 + 居中歌词
   --------------------------------------------------------------------------
   与 classic 的唯一结构差别：它需要**整窗背景层**，而背景层由宿主放在
   `.playerview` 之外（见 background-layer.js 的说明），皮肤只负责往里填图。
   ========================================================================== */

import { defineSkin } from "../contract.js";
import { createLyricsView } from "../lyrics-view.js";
import { createBackgroundLayer } from "../background-layer.js";
import { subtitleOf } from "../html.js";
import "./immersive.css";

let inst = null;

const skin = defineSkin({
  apiVersion: 1,
  id: "immersive",
  name: "沉浸",
  icon: "immersive",
  order: 20,
  description: "封面虚化铺满整窗，歌词浮在中间",
  background: true,

  mount(ctx) {
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
      lyrics,
      background,
      title: ctx.root.querySelector("#pv-title"),
      artist: ctx.root.querySelector("#pv-artist"),

      paintSong() {
        const m = ctx.media();
        const s = m.song || {};
        this.title.textContent = s.title || "未在播放";
        this.artist.textContent = subtitleOf(s.artist, s.album);
        // 用当前生效封面当整窗背景；轮播切图时也会走到这里
        this.background.setImage(m.cover);
      },
    };

    inst.paintSong();
    background.setEnabled(true);
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
      case "media":
        inst.paintSong();
        break;
      case "lyrics": {
        const m = ctx.media();
        inst.lyrics.setLines(m.lyrics.lines, { emptyText: emptyTextFor(m.lyrics) });
        inst.lyrics.setPosition(ctx.playback().position, { immediate: true });
        break;
      }
      case "progress":
        inst.lyrics.setPosition(patch.position);
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
});

function emptyTextFor(lyrics) {
  if (lyrics?.source === "online") return "在线匹配没有结果";
  return "暂无歌词";
}

export default skin;
