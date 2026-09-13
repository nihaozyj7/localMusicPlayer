// @ts-check
/* ==========================================================================
   anime.js — 内置样式「二次元手绘」（id: anime）
   --------------------------------------------------------------------------
   视觉语言：**漫画分镜 / 网点纸 / 马克笔**。
     · 整窗背景：纸纹 + 分层色块（天空、太阳、云、山丘）+ 半调网点 +
       放射速度线 + 飘落花瓣 + 手绘双线外框；
     · 舞台：一张「分镜格」里贴着手绘边框的封面（顶角两片和纸胶带），
       下方是标记笔写的信息条 + 五格音柱；
     · 运镜：相机做很轻的手摇呼吸，切歌时给一次「分镜推进」的换镜脉冲；
     · 文字：逐字弹跳入场（缩放 X / Y 不一致，落地会回弹），当前行带
       马克笔扫光 + 一道会自己画出来的下划线，正在唱的字逐个点亮。

   与「魔法阵 · 手绘次元」的区别（两个都是手绘，但语言不同）：
   那个是夜景 + 魔法阵 + 逐字发光；这个是白天 + 漫画分镜 + 马克笔涂色。
   ========================================================================== */

import { defineSkin } from "../contract.js";
import { createFxLyrics } from "../fx-lyrics.js";
import { createCamera } from "../fx-camera.js";
import { setCoverImage, subtitleOf } from "../html.js";
import "./anime.css";

let inst = null;

/** 飘落花瓣：纯 CSS 元素动画，确定性随机（固定种子，挂载多次构图一致） */
function buildPetals(count) {
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let out = "";
  for (let i = 0; i < count; i += 1) {
    const x = (i / count) * 100 + rnd() * 5;
    const dur = 12 + rnd() * 12;
    const delay = -rnd() * dur;
    const scale = (0.7 + rnd() * 0.9).toFixed(2);
    const sway = ((rnd() * 2 - 1) * 12).toFixed(1);
    const spin = (360 + rnd() * 540).toFixed(0);
    out +=
      '<span class="an-petal" style="--x:' +
      x.toFixed(1) +
      "%;--t:" +
      dur.toFixed(1) +
      "s;--d:" +
      delay.toFixed(1) +
      "s;--s:" +
      scale +
      ";--px:" +
      sway +
      "vw;--pr:" +
      spin +
      'deg"></span>';
  }
  return out;
}

const skin = defineSkin({
  apiVersion: 1,
  id: "anime",
  name: "二次元手绘",
  icon: "anime",
  order: 40,
  description: "漫画分镜 + 网点纸，逐字弹跳与马克笔扫光",
  background: true,

  mount(ctx) {
    const interactive = ctx.options().interactive !== false;
    // 模板就在下面，选择器一定命中；这里把 Element 收窄成 HTMLElement / HTMLImageElement
    const pick = (sel) => /** @type {HTMLElement} */ (ctx.root.querySelector(sel));

    /* —— 整窗背景层（容器由宿主提供，位置在 .playerview 之外）—— */
    const bgRoot = ctx.backgroundRoot;
    if (bgRoot) {
      bgRoot.innerHTML =
        '<div class="an-bg" data-anim="on">' +
        '<div class="an-bg__paper"></div>' +
        '<div class="an-bg__sun"></div>' +
        '<div class="an-bg__clouds"><span></span><span></span><span></span></div>' +
        '<div class="an-bg__hills"></div>' +
        '<div class="an-bg__tone"></div>' +
        '<div class="an-bg__speed"></div>' +
        '<div class="an-bg__petals">' +
        buildPetals(12) +
        "</div>" +
        '<div class="an-bg__frame"></div>' +
        "</div>";
      bgRoot.hidden = false;
    }
    const bg = bgRoot ? /** @type {HTMLElement} */ (bgRoot.querySelector(".an-bg")) : null;

    /* —— 舞台：相机容器 > 分镜格 —— */
    ctx.root.innerHTML =
      '<div class="an-cam">' +
      '<div class="an-stage" data-anim="on">' +
      '<div class="an-scene">' +
      '<div class="an-panel">' +
      '<div class="an-panel__art"><img class="an-art" alt="" /></div>' +
      '<span class="an-panel__tape an-panel__tape--l"></span>' +
      '<span class="an-panel__tape an-panel__tape--r"></span>' +
      '<span class="an-panel__spark an-panel__spark--a"></span>' +
      '<span class="an-panel__spark an-panel__spark--b"></span>' +
      "</div>" +
      '<div class="an-meta">' +
      '<div class="an-meta__kicker">NOW DRAWING</div>' +
      '<div class="an-meta__title"></div>' +
      '<div class="an-meta__rule"></div>' +
      '<div class="an-meta__artist"></div>' +
      '<div class="an-eq"><span></span><span></span><span></span><span></span><span></span></div>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="an-lyrics" data-anim="on"></div>';

    const cam = pick(".an-cam");
    const stage = pick(".an-stage");
    const panel = pick(".an-panel");
    const art = /** @type {HTMLImageElement} */ (pick(".an-art"));
    const title = pick(".an-meta__title");
    const artist = pick(".an-meta__artist");
    const lyricsHost = pick(".an-lyrics");

    const camera = createCamera(cam, { ampX: 11, ampY: 8, rot: 0.55, zoom: 0.028, speed: 1.05, seed: 11 });
    const lyrics = createFxLyrics(lyricsHost, {
      onSeek: (ms) => ctx.actions.seek(ms),
      interactive,
    });

    /** 分镜格「啪」地一下推进（WAAPI：不触发同步重排） */
    function pop() {
      if (typeof panel?.animate !== "function") return;
      if (ctx.options().animations === false) return;
      panel.animate(
        [
          { transform: "scale(0.94) rotate(-1.1deg)", filter: "saturate(1.35) brightness(1.08)" },
          { transform: "scale(1.035) rotate(0.5deg)" },
          { transform: "scale(1) rotate(0deg)", filter: "none" },
        ],
        { duration: 620, easing: "cubic-bezier(.16,1,.3,1)" }
      );
      if (typeof stage?.animate === "function") {
        stage.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 520, easing: "ease-out" });
      }
    }

    inst = {
      ctx,
      camera,
      lyrics,
      bg,
      art,
      title,
      artist,
      panel,
      playing: false,
      pop,

      paintSong() {
        const m = ctx.media();
        const s = m.song || {};
        title.textContent = s.title || "未在播放";
        artist.textContent = subtitleOf(s.artist, s.album);
        setCoverImage(art, m.cover, ctx.defaultCover);
      },

      paintCover() {
        setCoverImage(art, ctx.media().cover, ctx.defaultCover);
      },

      paintOptions() {
        const o = ctx.options();
        const on = o.animations !== false;
        const size = Math.max(12, Math.min(40, Number(o.lyricsFontSize) || 16));
        const shell = pick(".an-stage");
        const lg = pick(".an-lyrics");
        for (const el of [shell, lg, bg]) {
          if (!el) continue;
          el.dataset.anim = on ? "on" : "off";
          el.style.setProperty("--an-anim", on ? "1" : "0");
          el.style.setProperty("--an-lsize", size + "px");
        }
        camera.setEnabled(on);
      },
    };

    inst.paintSong();
    inst.paintOptions();
    camera.pulse(0.85, 1.1);
    const m = ctx.media();
    lyrics.setLines(m.lyrics.lines, { emptyText: emptyTextFor(m.lyrics) });
    lyrics.setPosition(ctx.playback().position, { immediate: true });
  },

  update(ctx, patch) {
    if (!inst) return;
    switch (patch.type) {
      case "mount":
      case "song": {
        inst.paintSong();
        const m = ctx.media();
        inst.lyrics.setLines(m.lyrics.lines, { emptyText: emptyTextFor(m.lyrics) });
        inst.lyrics.setPosition(ctx.playback().position, { immediate: true });
        if (patch.type === "song") {
          inst.camera.pulse(1, 1.2);
          inst.pop();
        } else {
          inst.camera.pulse(0.7, 1.0);
        }
        inst.playing = Boolean(ctx.playback().playing);
        inst.panel.dataset.playing = inst.playing ? "true" : "false";
        break;
      }
      case "media":
        inst.paintCover();
        inst.camera.pulse(0.7, 0.9);
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
      case "state":
        inst.playing = Boolean(patch.playing);
        inst.panel.dataset.playing = inst.playing ? "true" : "false";
        break;
      case "options":
        inst.paintOptions();
        break;
      case "resize":
        inst.lyrics.markMeasure();
        break;
      case "close":
        if (inst.bg) inst.bg.dataset.anim = "off";
        break;
      default:
        break;
    }
  },

  destroy() {
    if (!inst) return;
    inst.camera.destroy();
    inst.lyrics.destroy();
    if (inst.bg) inst.bg.dataset.anim = "off";
    inst = null;
  },
});

function emptyTextFor(lyrics) {
  if (lyrics?.source === "online") return "在线匹配没有结果";
  return "暂无歌词";
}

export default skin;
