// @ts-check
/* ==========================================================================
   wasteland.js — 内置样式「科幻末世」（id: wasteland）
   --------------------------------------------------------------------------
   视觉语言：**废墟控制台 / 故障艺术**。
     · 整窗背景：破败天际线剪影、透视网格地面、雷达扫描、飘浮尘埃、
       危险警示条、静态扫描线 + 一条周期性下扫的亮带、故障色块；
     · 舞台：一台老式监视器（CRT）——封面是它的画面，外面套着机壳、
       四角取景括号、红色录制点与一条状态读数；
     · 运镜：相机手抖幅度最大（手持感），换歌时推近 + 一次故障抖动；
     · 文字：等宽字，逐字「解码」闪入，当前行做 RGB 分离抖动，
       已唱的字变琥珀，正在唱的那个字反色（黑字压在琥珀块上）。

   与其它样式的区别：这个样式的信息层刻意做成「设备读数」，所以舞台里
   除了曲目信息还有一行状态条（信号 / 时间码），不是纯装饰。
   ========================================================================== */

import { defineSkin } from "../contract.js";
import { createFxLyrics } from "../fx-lyrics.js";
import { createCamera } from "../fx-camera.js";
import { setCoverImage, subtitleOf } from "../html.js";
import "./wasteland.css";

let inst = null;

/** 浮尘：确定性随机，纯 CSS 动画 */
function buildDust(count) {
  let seed = 0x1b873593;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let out = "";
  for (let i = 0; i < count; i += 1) {
    const x = (rnd() * 100).toFixed(1);
    const y = (rnd() * 100).toFixed(1);
    const durNum = 9 + rnd() * 16;
    const dur = durNum.toFixed(1);
    const delay = (-rnd() * durNum).toFixed(1);
    const size = (1 + rnd() * 2.4).toFixed(2);
    const drift = ((rnd() * 2 - 1) * 40).toFixed(0);
    out +=
      '<span class="wa-dust" style="--x:' +
      x +
      "%;--y:" +
      y +
      "%;--t:" +
      dur +
      "s;--d:" +
      delay +
      "s;--s:" +
      size +
      "px;--dx:" +
      drift +
      'px"></span>';
  }
  return out;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

const skin = defineSkin({
  apiVersion: 1,
  id: "wasteland",
  name: "科幻末世",
  icon: "wasteland",
  order: 60,
  description: "废墟控制台与故障艺术，等宽文字解码动效",
  background: true,

  mount(ctx) {
    const interactive = ctx.options().interactive !== false;
    const pick = (sel) => /** @type {HTMLElement} */ (ctx.root.querySelector(sel));

    const bgRoot = ctx.backgroundRoot;
    if (bgRoot) {
      bgRoot.innerHTML =
        '<div class="wa-bg" data-anim="on">' +
        '<div class="wa-bg__base"></div>' +
        '<div class="wa-bg__sun"></div>' +
        '<div class="wa-bg__skyline"></div>' +
        '<div class="wa-bg__grid"></div>' +
        '<div class="wa-bg__radar"></div>' +
        '<div class="wa-bg__dust">' +
        buildDust(26) +
        "</div>" +
        '<div class="wa-bg__hazard wa-bg__hazard--t"></div>' +
        '<div class="wa-bg__hazard wa-bg__hazard--b"></div>' +
        '<div class="wa-bg__scan"></div>' +
        '<div class="wa-bg__beam"></div>' +
        '<div class="wa-bg__glitch"></div>' +
        "</div>";
      bgRoot.hidden = false;
    }
    const bg = bgRoot ? /** @type {HTMLElement} */ (bgRoot.querySelector(".wa-bg")) : null;

    ctx.root.innerHTML =
      '<div class="wa-cam">' +
      '<div class="wa-stage" data-anim="on">' +
      '<div class="wa-console">' +
      '<div class="wa-console__case">' +
      '<div class="wa-console__screen"><img class="wa-art" alt="" /><span class="wa-console__scan"></span></div>' +
      '<div class="wa-console__meta">' +
      '<span class="wa-console__dot"></span><span class="wa-console__rec">REC</span>' +
      '<span class="wa-console__code"></span>' +
      "</div>" +
      "</div>" +
      '<span class="wa-console__br wa-console__br--tl"></span>' +
      '<span class="wa-console__br wa-console__br--tr"></span>' +
      '<span class="wa-console__br wa-console__br--bl"></span>' +
      '<span class="wa-console__br wa-console__br--br"></span>' +
      "</div>" +
      '<div class="wa-meta">' +
      '<div class="wa-meta__kicker">// SALVAGE RADIO</div>' +
      '<div class="wa-meta__title"></div>' +
      '<div class="wa-meta__artist"></div>' +
      '<div class="wa-meta__status"><span class="wa-meta__label">SIGNAL</span>' +
      '<span class="wa-bar"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
      '<span class="wa-meta__pct">78%</span></div>' +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="wa-lyrics" data-anim="on"></div>';

    const cam = pick(".wa-cam");
    const consoleEl = pick(".wa-console");
    const art = /** @type {HTMLImageElement} */ (pick(".wa-art"));
    const title = pick(".wa-meta__title");
    const artist = pick(".wa-meta__artist");
    const code = pick(".wa-console__code");
    const pct = pick(".wa-meta__pct");
    const lyricsHost = pick(".wa-lyrics");

    const camera = createCamera(cam, { ampX: 9, ampY: 8, rot: 0.95, zoom: 0.03, speed: 1.35, seed: 37, maxFps: 60 });
    const lyrics = createFxLyrics(lyricsHost, {
      onSeek: (ms) => ctx.actions.seek(ms),
      interactive,
    });

    /** 故障抖动：换歌 / 手动换封面时来一次（WAAPI，同一时刻只跑一条） */
    let glitchAnims = [];
    function glitch(strength = 1) {
      if (ctx.options().animations === false) return;
      if (bg && typeof bg.animate === "function") {
        bg.animate(
          [
            { filter: "none" },
            { filter: "saturate(2.4) contrast(1.6) hue-rotate(8deg)" },
            { filter: "none" },
            { filter: "saturate(1.8) contrast(1.2)" },
            { filter: "none" },
          ],
          { duration: 460 * strength, easing: "steps(2, end)" }
        );
      }
      if (typeof consoleEl?.animate !== "function") return;
      for (const a of glitchAnims) a.cancel();
      glitchAnims = [
        consoleEl.animate(
          [
            { transform: "translate3d(0,0,0)" },
            { transform: "translate3d(-4px,1px,0) skewX(-0.6deg)" },
            { transform: "translate3d(5px,-2px,0)" },
            { transform: "translate3d(-2px,0,0)" },
            { transform: "translate3d(0,0,0)" },
          ],
          { duration: 380 * strength, easing: "steps(3, end)" }
        ),
      ];
      const screen = pick(".wa-console__screen");
      if (screen && typeof screen.animate === "function") {
        glitchAnims.push(
          screen.animate(
            [
              { clipPath: "inset(0 0 0 0)", transform: "translateX(0)" },
              { clipPath: "inset(18% 0 32% 0)", transform: "translateX(-3%)" },
              { clipPath: "inset(58% 0 6% 0)", transform: "translateX(3%)" },
              { clipPath: "inset(0 0 0 0)", transform: "translateX(0)" },
            ],
            { duration: 320 * strength, easing: "steps(4, end)" }
          )
        );
      }
    }

    /** 状态读数：时间码 + 信号百分比（随播放进度缓慢变化，制造「在跑」的感觉） */
    function paintReadout(position, duration) {
      const d = Number(duration) > 0 ? Number(duration) : 0;
      const p = Math.max(0, Number(position) || 0);
      const totalSec = d > 0 ? Math.floor(d / 1000) : 0;
      const cur = totalSec > 0 ? Math.floor(p / 1000) : Math.floor(p / 1000);
      if (code)
        code.textContent =
          pad2(Math.floor(cur / 60)) +
          ":" +
          pad2(cur % 60) +
          (totalSec ? " / " + pad2(Math.floor(totalSec / 60)) + ":" + pad2(totalSec % 60) : "");
      const prog = d > 0 ? Math.min(1, p / d) : 0;
      if (pct) pct.textContent = pad2(Math.round(38 + prog * 58)) + "%";
    }

    inst = {
      ctx,
      camera,
      lyrics,
      bg,
      art,
      title,
      artist,
      consoleEl,
      glitch,
      paintReadout,
      playing: false,

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
        for (const el of [pick(".wa-stage"), lyricsHost, bg]) {
          if (!el) continue;
          el.dataset.anim = on ? "on" : "off";
          el.style.setProperty("--wa-lsize", size + "px");
        }
        camera.setEnabled(on);
      },
    };

    inst.paintSong();
    inst.paintOptions();
    paintReadout(ctx.playback().position, ctx.playback().duration);
    camera.pulse(0.5, 1.1);
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
          inst.camera.pulse(1.15, 1.15);
          inst.glitch(1);
          const pb = ctx.playback();
          inst.paintReadout(pb.position, pb.duration);
        }
        inst.playing = Boolean(ctx.playback().playing);
        inst.consoleEl.dataset.playing = inst.playing ? "true" : "false";
        break;
      }
      case "media":
        inst.paintCover();
        inst.camera.pulse(0.55, 0.9);
        inst.glitch(0.7);
        break;
      case "lyrics": {
        const m = ctx.media();
        inst.lyrics.setLines(m.lyrics.lines, { emptyText: emptyTextFor(m.lyrics) });
        inst.lyrics.setPosition(ctx.playback().position, { immediate: true });
        break;
      }
      case "progress":
        inst.lyrics.setPosition(patch.position);
        inst.paintReadout(patch.position, patch.duration);
        break;
      case "state":
        inst.playing = Boolean(patch.playing);
        inst.consoleEl.dataset.playing = inst.playing ? "true" : "false";
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
