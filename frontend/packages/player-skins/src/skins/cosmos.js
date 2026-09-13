// @ts-check
/* ==========================================================================
   cosmos.js — 内置样式「深邃宇宙」（id: cosmos）
   --------------------------------------------------------------------------
   视觉语言：**深空摄影**。
     · 整窗背景：Canvas 星场（三层景深 + 透视投影，切歌时来一次跃迁拉伸）、
       漂移星云、一颗带环行星、地平线辉光、彗星；
     · 舞台：封面被当成一颗「有大气层的行星」——外圈是呼吸光晕，赤道上是
       一条用 conic-gradient + mask 做的轨道环，行星下方是轨道投影；
     · 运镜：相机幅度比其它样式大（轨道漂移 + 呼吸推拉），换歌时向纵深推一次；
     · 文字：逐字从纵深「浮出」（大模糊 → 清晰），当前行带星尘扫光，
       已唱的字渐变成星蓝；远处行有景深模糊（distance falloff）。

   星场为什么用 Canvas：几百个 DOM 元素各自做动画会把合成层塞爆；
   Canvas 一层就够，而且「跃迁拉伸」这种沿速度方向拉长的效果在 DOM 里
   做不出来。dpr 封顶 1.5（folia 的 textureBudget 思路：视觉差异极小，像素减半）。
   ========================================================================== */

import { defineSkin } from "../contract.js";
import { createFxLyrics } from "../fx-lyrics.js";
import { createCamera } from "../fx-camera.js";
import { setCoverImage, subtitleOf } from "../html.js";
import "./cosmos.css";

let inst = null;

/**
 * 透视星场：三层景深，z 越小越远。
 * 星点向观察者漂移（z 增大），越过 1 就在远端重生 —— 这是「在星海里前进」。
 */
function createStarfield(canvas, host) {
  const g = canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let stars = [];
  let warp = 0;
  let raf = 0;
  let last = 0;
  let running = false;
  let enabled = true;

  // 确定性随机：同一份种子每次挂载都是同一片星空
  let seed = 0x2545f491;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  function spawn(initial) {
    return {
      a: rnd() * Math.PI * 2,
      r: 0.12 + rnd() * 0.9, // 极坐标半径（0..1，归一化到屏幕短边）
      z: initial ? 0.05 + rnd() * 0.95 : 0.05,
      v: 0.06 + rnd() * 0.24,
      hue: rnd(),
    };
  }

  function resize() {
    if (!g) return;
    const cw = Math.max(0, Math.round(canvas.clientWidth || host?.clientWidth || 0));
    const ch = Math.max(0, Math.round(canvas.clientHeight || host?.clientHeight || 0));
    const nextDpr = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
    if (cw === w && ch === h && nextDpr === dpr) return;
    w = cw;
    h = ch;
    dpr = nextDpr;
    if (w < 8 || h < 8) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.round(Math.min(320, Math.max(90, (w * h) / 9000)));
    stars = Array.from({ length: target }, () => spawn(true));
  }

  function draw(dt) {
    if (!g || w < 8 || h < 8) return;
    g.clearRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.52;
    const unit = Math.min(w, h);
    const speed = 1 + warp * 9;

    for (let i = 0; i < stars.length; i += 1) {
      const s = stars[i];
      s.z += s.v * dt * 0.055 * speed;
      if (s.z >= 1) {
        stars[i] = spawn(false);
        continue;
      }
      const k = 1 / s.z;
      const x = cx + Math.cos(s.a) * s.r * unit * k;
      const y = cy + Math.sin(s.a) * s.r * unit * k * 0.72;
      if (x < -40 || x > w + 40 || y < -40 || y > h + 40) {
        stars[i] = spawn(false);
        continue;
      }
      const size = Math.max(0.5, (1 - s.z) * 2.3 * (0.6 + s.v));
      const depth = Math.min(1, (1 - s.z) * 1.6);
      // 速度拉伸：跃迁时沿运动方向画成短线
      const stretch = 1 + warp * 34 * (1 - s.z);
      const alpha = 0.22 + depth * 0.78;
      const col = s.hue > 0.86 ? "255,214,170" : s.hue > 0.68 ? "186,214,255" : "240,244,255";
      g.strokeStyle = "rgba(" + col + "," + alpha.toFixed(3) + ")";
      g.lineWidth = size;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(cx + (x - cx) * (1 - stretch * 0.04), cy + (y - cy) * (1 - stretch * 0.04));
      g.stroke();
    }
  }

  function loop(now) {
    raf = 0;
    if (!running) return;
    const dt = last ? Math.min(48, now - last) : 16;
    last = now;
    if (warp > 0) warp = Math.max(0, warp - dt / 1100);
    if (enabled) draw(dt);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (raf || !running) return;
    last = 0;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  return {
    resize,
    start() {
      running = true;
      start();
    },
    stop() {
      running = false;
      stop();
    },
    warp(strength = 1) {
      warp = Math.min(1.4, warp + strength);
    },
    setEnabled(on) {
      enabled = Boolean(on);
      if (!enabled) {
        stop();
        if (g) g.clearRect(0, 0, w, h);
      } else {
        start();
      }
    },
    destroy() {
      running = false;
      stop();
      stars = [];
    },
  };
}

const skin = defineSkin({
  apiVersion: 1,
  id: "cosmos",
  name: "深邃宇宙",
  icon: "cosmos",
  order: 50,
  description: "透视星场 + 轨道行星，纵深运镜与星尘歌词",
  background: true,

  mount(ctx) {
    const interactive = ctx.options().interactive !== false;
    const pick = (sel) => /** @type {HTMLElement} */ (ctx.root.querySelector(sel));

    const bgRoot = ctx.backgroundRoot;
    if (bgRoot) {
      bgRoot.innerHTML =
        '<div class="co-bg" data-anim="on">' +
        '<div class="co-bg__deep"></div>' +
        '<div class="co-bg__nebula"><span></span><span></span><span></span></div>' +
        '<canvas class="co-bg__stars"></canvas>' +
        '<div class="co-bg__comet"></div>' +
        '<div class="co-bg__planet"><span class="co-bg__ring"></span></div>' +
        '<div class="co-bg__glow"></div>' +
        '<div class="co-bg__vignette"></div>' +
        "</div>";
      bgRoot.hidden = false;
    }
    const bg = bgRoot ? /** @type {HTMLElement} */ (bgRoot.querySelector(".co-bg")) : null;
    const canvas = bg ? /** @type {HTMLCanvasElement} */ (bg.querySelector(".co-bg__stars")) : null;
    const field = createStarfield(canvas, bg);

    ctx.root.innerHTML =
      '<div class="co-cam">' +
      '<div class="co-stage" data-anim="on">' +
      '<div class="co-orb">' +
      '<span class="co-orb__halo"></span>' +
      '<span class="co-orb__ring"></span>' +
      '<span class="co-orb__ring co-orb__ring--b"></span>' +
      '<div class="co-orb__artwrap"><img class="co-art" alt="" /></div>' +
      '<span class="co-orb__sheen"></span>' +
      "</div>" +
      '<div class="co-meta">' +
      '<div class="co-meta__kicker">DEEP FIELD</div>' +
      '<div class="co-meta__title"></div>' +
      '<div class="co-meta__artist"></div>' +
      '<div class="co-meta__signal"><span></span><span></span><span></span><span></span></div>' +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="co-lyrics" data-anim="on"></div>';

    const cam = pick(".co-cam");
    const orb = pick(".co-orb");
    const art = /** @type {HTMLImageElement} */ (pick(".co-art"));
    const title = pick(".co-meta__title");
    const artist = pick(".co-meta__artist");
    const lyricsHost = pick(".co-lyrics");

    /* 运镜：宇宙是「慢而大」的 —— 幅度大、速度慢、旋转小，更像漂移而不是手摇 */
    const camera = createCamera(cam, {
      ampX: 74,
      ampY: 60,
      rot: 2.4,
      zoom: 0.075,
      base: 1.02,
      speed: 0.6,
      seed: 23,
      shotMin: 15,
      shotMax: 26,
    });
    camera.addLayer(lyricsHost, { depth: 0.55, scale: false });
    if (bg) {
      /** @type {Array<[string, number]>} 选择器 + 视差深度 */
      const camLayers = [
        [".co-bg__deep", 0.1],
        [".co-bg__stars", 0.4],
        [".co-bg__nebula", 0.55],
        [".co-bg__planet", 0.85],
      ];
      for (const [sel, depth] of camLayers) {
        camera.addLayer(/** @type {HTMLElement|null} */ (bg.querySelector(sel)), { depth });
      }
    }
    const lyrics = createFxLyrics(lyricsHost, {
      onSeek: (ms) => ctx.actions.seek(ms),
      interactive,
    });

    /** 换歌：跃迁一次 + 轨道行星「重新捕获」的一次脉冲 */
    function warp() {
      field.warp(1);
      if (typeof orb?.animate !== "function") return;
      if (ctx.options().animations === false) return;
      orb.animate(
        [
          { transform: "scale(0.86)", filter: "blur(6px) brightness(1.8)" },
          { transform: "scale(1.04)", filter: "blur(0) brightness(1.25)" },
          { transform: "scale(1)", filter: "none" },
        ],
        { duration: 900, easing: "cubic-bezier(.16,1,.3,1)" }
      );
    }

    inst = {
      ctx,
      camera,
      lyrics,
      field,
      bg,
      canvas,
      art,
      title,
      artist,
      orb,
      warp,
      observer: null,
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
        for (const el of [pick(".co-stage"), lyricsHost, bg]) {
          if (!el) continue;
          el.dataset.anim = on ? "on" : "off";
          el.style.setProperty("--co-lsize", size + "px");
        }
        camera.setEnabled(on);
        field.setEnabled(on);
      },
    };

    inst.paintSong();
    inst.paintOptions();
    field.resize();
    field.start();

    if (bg && typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(() => field.resize());
      ro.observe(bg);
      inst.observer = ro;
    }

    camera.pulse(0.55, 1.6);
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
          inst.camera.pulse(1.2, 1.7);
          inst.warp();
        }
        inst.playing = Boolean(ctx.playback().playing);
        break;
      }
      case "media":
        inst.paintCover();
        inst.camera.pulse(0.6, 1.2);
        inst.field.warp(0.5);
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
        inst.field.warp(0.35);
        break;
      case "options":
        inst.paintOptions();
        break;
      case "resize":
        inst.field.resize();
        inst.lyrics.markMeasure();
        break;
      case "close":
        inst.field.stop();
        if (inst.bg) inst.bg.dataset.anim = "off";
        break;
      default:
        break;
    }
  },

  destroy() {
    if (!inst) return;
    const cur = inst;
    inst = null;
    cur.camera.destroy();
    cur.lyrics.destroy();
    cur.field.destroy();
    if (cur.observer) cur.observer.disconnect();
    if (cur.bg) cur.bg.dataset.anim = "off";
  },
});

function emptyTextFor(lyrics) {
  if (lyrics?.source === "online") return "在线匹配没有结果";
  return "暂无歌词";
}

export default skin;
