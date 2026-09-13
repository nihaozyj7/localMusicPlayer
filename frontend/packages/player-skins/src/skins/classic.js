// @ts-check
/* ==========================================================================
   classic.js — 内置样式「经典」：左唱片 + 右歌词
   --------------------------------------------------------------------------
   皮肤接口的参考实现，第三方皮肤想写自己的样式时照着这个抄即可：
     mount(ctx)   往 ctx.root 里搭 DOM
     update(...)  处理宿主推来的增量（换歌 / 封面 / 歌词 / 进度 / 状态）
     destroy()    清理自己创建的东西（歌词视图、定时器）
   所有数据都从 ctx 拿，皮肤不 import 宿主的任何模块。
   ========================================================================== */

import { defineSkin } from "../contract.js";
import { createLyricsView } from "../lyrics-view.js";
import { escapeHtml, setCoverImage, subtitleOf } from "../html.js";
import "./classic.css";

/** 当前挂载实例（同一时刻只会有一个 classic 实例） */
let inst = null;

const skin = defineSkin({
  apiVersion: 1,
  id: "classic",
  name: "经典",
  icon: "disc",
  order: 10,
  description: "左唱片右歌词，信息最完整",
  background: false,

  mount(ctx) {
    ctx.root.innerHTML = `
      <div class="disc" id="pv-disc" data-spinning="${ctx.playback().playing ? "true" : "false"}">
        <div class="disc__shadow"></div>
        <div class="disc__platter">
          <div class="disc__label">
            <img id="pv-disc-cover" src="${escapeHtml(ctx.media().cover)}" alt="" />
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
    });

    inst = {
      ctx,
      lyrics,
      disc: ctx.root.querySelector("#pv-disc"),
      cover: ctx.root.querySelector("#pv-disc-cover"),
      title: ctx.root.querySelector("#pv-title"),
      artist: ctx.root.querySelector("#pv-artist"),
      album: ctx.root.querySelector("#pv-album"),

      paintSong() {
        const m = ctx.media();
        const s = m.song || {};
        this.title.textContent = s.title || "未在播放";
        this.artist.textContent = subtitleOf(s.artist, "");
        // 专辑单独一行：为空时整行隐藏，避免留下一行空白
        this.album.textContent = s.album || "";
        this.album.hidden = !s.album;
        setCoverImage(this.cover, m.cover, ctx.defaultCover);
      },

      paintCover() {
        setCoverImage(this.cover, ctx.media().cover, ctx.defaultCover);
      },

      paintSpin() {
        this.disc.dataset.spinning = String(Boolean(ctx.playback().playing));
      },
    };

    inst.paintSong();
    const m = ctx.media();
    inst.lyrics.setLines(m.lyrics.lines, { emptyText: emptyTextFor(m.lyrics) });
  },

  update(ctx, patch) {
    if (!inst) return;
    switch (patch.type) {
      case "song": {
        inst.paintSong();
        const m = ctx.media();
        inst.lyrics.setLines(m.lyrics.lines, { emptyText: emptyTextFor(m.lyrics) });
        inst.paintSpin();
        inst.lyrics.setPosition(ctx.playback().position, { immediate: true });
        break;
      }
      case "media":
        inst.paintCover();
        break;
      case "lyrics": {
        const m = ctx.media();
        inst.lyrics.setLines(m.lyrics.lines, { emptyText: emptyTextFor(m.lyrics) });
        inst.lyrics.setPosition(ctx.playback().position, { immediate: true });
        break;
      }
      case "progress":
        // 让包里的渲染器自己按进度算行号：宿主只推进度，避免两处各算一遍
        inst.lyrics.setPosition(patch.position);
        break;
      case "state":
        inst.paintSpin();
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

/** 空态文案带上歌词来源，用户能一眼看出「是没找到」还是「还没联网匹配」 */
function emptyTextFor(lyrics) {
  if (lyrics?.source === "online") return "在线匹配没有结果";
  return "暂无歌词";
}

export default skin;
