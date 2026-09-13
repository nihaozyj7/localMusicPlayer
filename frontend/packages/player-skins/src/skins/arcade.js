// @ts-check
/* ==========================================================================
   arcade.js — 内置样式「游戏风」（id: arcade）
   --------------------------------------------------------------------------
   视觉语言：**街机 / 8-bit**。
     · 整窗背景：合成波网格地平线、带横条的大太阳、浮动像素块、扫描线、
       方格抖动（dither）带；
     · 舞台：封面装在一台「游戏卡带 / 街机框体」里（像素化渲染），
       旁边是 PLAYER 1 名牌、生命条、经验条与分数 —— 这些不是装饰：
       经验条跟着真实播放进度走，连击数与分数跟着歌词行推进；
     · 运镜：屏幕轻微手抖 + 行号变化时的一次小震屏，换歌时来一次大震屏；
     · 文字：对话盒式逐字从下方滑入 + 打字机步进（steps 缓动），
       当前行末尾有闪烁光标，已唱的字变绿，正在唱的字是一块高亮方块。

   为什么「分数 / 连击」跟歌词走：街机风格的核心是「一直在计分」。
   把它们接到真实进度上，界面就真的在响应，而不是挂一排假 HUD。
   ========================================================================== */

import { defineSkin } from "../contract.js";
import { createFxLyrics } from "../fx-lyrics.js";
import { createCamera } from "../fx-camera.js";
import { setCoverImage, subtitleOf } from "../html.js";
import "./arcade.css";

let inst = null;

const MAX_HP = 5;

function buildPixels(count) {
  let seed = 0x27d4eb2f;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let out = "";
  for (let i = 0; i < count; i += 1) {
    const x = (rnd() * 100).toFixed(1);
    const y = (rnd() * 100).toFixed(1);
    const size = (5 + Math.floor(rnd() * 4) * 5).toFixed(0);
    const durNum = 11 + rnd() * 16;
    const dur = durNum.toFixed(1);
    const delay = (-rnd() * durNum).toFixed(1);
    const hue = rnd() > 0.5 ? "a" : "b";
    out +=
      '<span class="ag-pixel ag-pixel--' +
      hue +
      '" style="--x:' +
      x +
      "%;--y:" +
      y +
      "%;--s:" +
      size +
      "px;--t:" +
      dur +
      "s;--d:" +
      delay +
      's"></span>';
  }
  return out;
}

const skin = defineSkin({
  apiVersion: 1,
  id: "arcade",
  name: "游戏风",
  icon: "game",
  order: 70,
  description: "街机框体 + 计分 HUD，对话盒式逐字打字与震屏",
  background: true,

  mount(ctx) {
    const interactive = ctx.options().interactive !== false;
    const pick = (sel) => /** @type {HTMLElement} */ (ctx.root.querySelector(sel));

    const bgRoot = ctx.backgroundRoot;
    if (bgRoot) {
      bgRoot.innerHTML =
        '<div class="ag-bg" data-anim="on">' +
        '<div class="ag-bg__void"></div>' +
        '<div class="ag-bg__sun"></div>' +
        '<div class="ag-bg__grid"></div>' +
        '<div class="ag-bg__pixels">' +
        buildPixels(18) +
        "</div>" +
        '<div class="ag-bg__dither"></div>' +
        '<div class="ag-bg__scan"></div>' +
        "</div>";
      bgRoot.hidden = false;
    }
    const bg = bgRoot ? /** @type {HTMLElement} */ (bgRoot.querySelector(".ag-bg")) : null;

    ctx.root.innerHTML =
      '<div class="ag-cam">' +
      '<div class="ag-stage" data-anim="on">' +
      '<div class="ag-cab">' +
      '<div class="ag-cab__shell">' +
      '<div class="ag-cab__screen"><img class="ag-art" alt="" /><span class="ag-cab__scan"></span></div>' +
      '<div class="ag-cab__hud">' +
      '<div class="ag-hud__row"><span class="ag-hud__label">HP</span>' +
      '<span class="ag-hp"></span></div>' +
      '<div class="ag-hud__row"><span class="ag-hud__label">XP</span>' +
      '<span class="ag-xp"><i></i></span></div>' +
      "</div>" +
      "</div>" +
      '<span class="ag-cab__badge">1P</span>' +
      "</div>" +
      '<div class="ag-meta">' +
      '<div class="ag-meta__plate">PLAYER 1</div>' +
      '<div class="ag-meta__title"></div>' +
      '<div class="ag-meta__artist"></div>' +
      '<div class="ag-score"><span class="ag-score__label">SCORE</span>' +
      '<span class="ag-score__value">000000</span>' +
      '<span class="ag-combo">COMBO 0</span></div>' +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="ag-lyrics" data-anim="on"></div>';

    const cam = pick(".ag-cam");
    const cab = pick(".ag-cab");
    const stage = pick(".ag-stage");
    const art = /** @type {HTMLImageElement} */ (pick(".ag-art"));
    const title = pick(".ag-meta__title");
    const artist = pick(".ag-meta__artist");
    const hp = pick(".ag-hp");
    const xp = pick(".ag-xp i");
    const scoreEl = pick(".ag-score__value");
    const comboEl = pick(".ag-combo");
    const lyricsHost = pick(".ag-lyrics");

    /* 运镜：街机要「格子感」，所以幅度中等、旋转很小（旋转多了像素网格就糊） */
    const camera = createCamera(cam, {
      ampX: 64,
      ampY: 42,
      rot: 2.0,
      zoom: 0.045,
      base: 1.008,
      speed: 1.25,
      seed: 51,
      shotMin: 8,
      shotMax: 14,
      maxFps: 60,
    });
    camera.addLayer(lyricsHost, { depth: 0.58, scale: false });
    if (bg) {
      /** @type {Array<[string, number]>} 选择器 + 视差深度 */
      const camLayers = [
        [".ag-bg__void", 0.1],
        [".ag-bg__sun", 0.22],
        [".ag-bg__pixels", 1.3],
      ];
      for (const [sel, depth] of camLayers) {
        camera.addLayer(/** @type {HTMLElement|null} */ (bg.querySelector(sel)), { depth });
      }
    }
    const lyrics = createFxLyrics(lyricsHost, {
      onSeek: (ms) => ctx.actions.seek(ms),
      interactive,
    });

    // 生命条：每格一个方块，纯 DOM（数量少，切换成本可忽略）
    if (hp) {
      hp.innerHTML = Array.from({ length: MAX_HP }, () => "<i></i>").join("");
    }

    let score = 0;
    let combo = 0;
    let lastLine = -1;

    function fmtScore(n) {
      return String(Math.min(999999, Math.max(0, Math.floor(n)))).padStart(6, "0");
    }

    /** 行号推进：连击 +1 与分数上涨；换歌由 resetScore 清零 */
    function advance(idx) {
      if (idx < 0 || idx === lastLine) return;
      if (lastLine >= 0) combo = Math.min(999, combo + 1);
      lastLine = idx;
      score += 100 + combo * 25;
      if (scoreEl) scoreEl.textContent = fmtScore(score);
      if (comboEl) {
        comboEl.textContent = "COMBO " + combo;
        comboEl.dataset.hot = combo >= 5 ? "true" : "false";
      }
      if (ctx.options().animations !== false && typeof comboEl?.animate === "function" && combo > 1) {
        comboEl.animate(
          [
            { transform: "scale(1.35)", filter: "brightness(1.6)" },
            { transform: "scale(1)", filter: "none" },
          ],
          { duration: 260, easing: "cubic-bezier(.2,1.6,.4,1)" }
        );
      }
      // 行推进的小震屏
      shake(0.35);
    }

    function resetScore() {
      score = 0;
      combo = 0;
      lastLine = -1;
      if (scoreEl) scoreEl.textContent = fmtScore(0);
      if (comboEl) {
        comboEl.textContent = "COMBO 0";
        comboEl.dataset.hot = "false";
      }
    }

    function shake(strength) {
      if (ctx.options().animations === false) return;
      if (typeof stage?.animate !== "function") return;
      const s = 3.5 * strength;
      stage.animate(
        [
          { transform: "translate3d(0,0,0)" },
          { transform: "translate3d(" + -s + "px," + s * 0.5 + "px,0)" },
          { transform: "translate3d(" + s * 0.8 + "px," + -s * 0.4 + "px,0)" },
          { transform: "translate3d(0,0,0)" },
        ],
        { duration: 180 + 120 * strength, easing: "steps(3, end)" }
      );
      if (strength >= 0.8 && typeof cab?.animate === "function") {
        cab.animate([{ filter: "brightness(1.9) saturate(1.4)" }, { filter: "none" }], {
          duration: 320,
          easing: "steps(2, end)",
        });
      }
    }

    function paintProgress(position, duration) {
      const d = Number(duration) > 0 ? Number(duration) : 0;
      const p = Math.max(0, Number(position) || 0);
      const ratio = d > 0 ? Math.min(1, p / d) : 0;
      if (xp) xp.style.transform = "scaleX(" + ratio.toFixed(4) + ")";
      if (hp) {
        const alive = Math.max(1, Math.round(MAX_HP * (1 - ratio)) || 1);
        const cells = /** @type {HTMLElement[]} */ (Array.from(hp.children));
        for (let i = 0; i < cells.length; i += 1) {
          cells[i].dataset.on = i < alive ? "true" : "false";
        }
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
      cab,
      advance,
      resetScore,
      shake,
      paintProgress,
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
        for (const el of [stage, lyricsHost, bg]) {
          if (!el) continue;
          el.dataset.anim = on ? "on" : "off";
          el.style.setProperty("--ag-lsize", size + "px");
        }
        camera.setEnabled(on);
      },
    };

    inst.paintSong();
    inst.paintOptions();
    resetScore();
    paintProgress(ctx.playback().position, ctx.playback().duration);
    camera.pulse(0.7, 1.1);
    const m = ctx.media();
    lyrics.setLines(m.lyrics.lines, { emptyText: emptyTextFor(m.lyrics) });
    lyrics.setPosition(ctx.playback().position, { immediate: true });
    if (m.lyrics.index >= 0) advance(m.lyrics.index);
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
          inst.resetScore();
          inst.camera.pulse(1, 1.2);
          inst.shake(1);
        }
        const idx = m.lyrics.index;
        if (idx >= 0) inst.advance(idx);
        inst.playing = Boolean(ctx.playback().playing);
        inst.cab.dataset.playing = inst.playing ? "true" : "false";
        const pb = ctx.playback();
        inst.paintProgress(pb.position, pb.duration);
        break;
      }
      case "media":
        inst.paintCover();
        inst.camera.pulse(0.5, 0.9);
        inst.shake(0.5);
        break;
      case "lyrics": {
        const m = ctx.media();
        inst.lyrics.setLines(m.lyrics.lines, { emptyText: emptyTextFor(m.lyrics) });
        inst.lyrics.setPosition(ctx.playback().position, { immediate: true });
        if (m.lyrics.index >= 0) inst.advance(m.lyrics.index);
        break;
      }
      case "progress":
        inst.lyrics.setPosition(patch.position);
        inst.advance(patch.lyricIndex ?? ctx.media().lyrics.index);
        inst.paintProgress(patch.position, patch.duration);
        break;
      case "state":
        inst.playing = Boolean(patch.playing);
        inst.cab.dataset.playing = inst.playing ? "true" : "false";
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
