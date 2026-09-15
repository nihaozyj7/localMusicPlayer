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
import { EMPTY_TRACK, setCoverImage, subtitleOf } from "../html.js";
import "./arcade.css";

let inst = null;

const MAX_HP = 5;

/** 后方像素电平柱的数量（频谱会被聚合成这么多段） */
const BAR_COUNT = 30;

/** 底部「像素电平柱」：每根柱子是一列离散方块，高度由宿主推来的频谱帧驱动（见 paintSpectrum） */
function buildBars(count) {
  let out = "";
  for (let i = 0; i < count; i += 1) {
    out += '<span class="ag-bar ag-bar--' + (i % 3) + '" style="--i:' + i + '"></span>';
  }
  return out;
}

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
  // 底部那排像素电平柱要跟着旋律动。这里声明的是**需要多少段频谱**：
  // 宿主（详情页宿主 / 桌面背景歌词宿主）据此采样并推 spectrum 补丁过来，
  // 皮肤自己不去碰音频图（见 contract.js 的 PATCH_TYPES）。
  spectrum: BAR_COUNT,

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
        '<div class="ag-bg__bars" data-live="false">' +
        buildBars(BAR_COUNT) +
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

    /* —— 随旋律律动的后方方块 ——
       需求：「后方渲染的方块结合旋律做出炫酷效果」。做法是把底部那排像素电平柱
       接到真实频谱上。

       ★ 采样在**宿主**里做（audio.js 分接 AnalyserNode），这里只负责把推来的
         一帧画上去 —— 皮肤不碰 AudioContext、不自己跑 rAF、也不管窗口可见性。
         理由是「谁有数据谁去采」：详情页的宿主有 <audio>，桌面背景歌词窗口没有；
         让皮肤自己采的话，同一份样式得写两套（一套能采、一套等着别人喂）。
         现在两边都是 push，皮肤只有这一条渲染路径。

       为什么用 clip-path 而不是 height/scale：
         · height 每帧写会触发布局；scaleY 会把柱子里的方块拉成长条，丢掉像素感。
         · clip-path 只做合成，方块本身不动，只是「从下往上亮起来」——
           正好是 8-bit 音谱的样子。
       拿不到频谱（还没播、或宿主这一帧没推）时退回 CSS 待机起伏。 */
    const barsHost = bg ? /** @type {HTMLElement|null} */ (bg.querySelector(".ag-bg__bars")) : null;
    const bars = /** @type {HTMLElement[]} */ (barsHost ? Array.from(barsHost.querySelectorAll(".ag-bar")) : []);

    /**
     * 画一帧电平柱。bands 是宿主采好的频谱（0..1，段数由皮肤声明的 spectrum 决定）；
     * null / 空数组 = 没有旋律，退回待机起伏。
     * @param {number[]|null|undefined} bands
     */
    function paintSpectrum(bands) {
      if (!bg) return;
      const data = Array.isArray(bands) && bands.length ? bands : null;
      if (!data) {
        if (barsHost) barsHost.dataset.live = "false";
        bg.style.setProperty("--ag-bass", "0");
        return;
      }
      if (barsHost) barsHost.dataset.live = "true";
      let bass = 0;
      const bassBands = Math.min(4, data.length);
      for (let i = 0; i < bars.length; i += 1) {
        // 段数对不上时按比例取样（宿主一般照声明推，这里只是兜底）
        const raw = data.length === bars.length
          ? data[i]
          : data[Math.min(data.length - 1, Math.floor((i / bars.length) * data.length))];
        const v = Math.max(0, Math.min(1, Number(raw) || 0));
        // 幂次略小于 1：小音量也看得出在跳，大音量不会一直顶满
        bars[i].style.setProperty("--h", (0.05 + Math.pow(v, 0.85) * 0.95).toFixed(3));
      }
      for (let i = 0; i < bassBands; i += 1) {
        bass += Math.max(0, Math.min(1, Number(data[i]) || 0));
      }
      bg.style.setProperty("--ag-bass", (bass / (bassBands || 1)).toFixed(3));
    }

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
      paintSpectrum,
      playing: false,

      /* 当前显示的是哪首歌。宿主在挂载后会补推一次 song（内容就是当前这首歌），
         靠它区分「真的换歌了」和「只是补推」，避免一打开详情页就震屏。 */
      songId: "",

      paintSong() {
        const m = ctx.media();
        const s = m.song || EMPTY_TRACK;
        title.textContent = s.title || "未在播放";
        artist.textContent = subtitleOf(s.artist, s.album);
        inst.songId = String(s.id ?? "");
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
        // 关掉动画时把柱子按回待机（宿主之后推的帧会再点亮它）
        if (!on) paintSpectrum(null);
      },
    };

    inst.paintSong();
    inst.paintOptions();
    resetScore();
    paintProgress(ctx.playback().position, ctx.playback().duration);
    // 刻意**不**在进场时 pulse：换镜脉冲会把整屏向右推一大段再弹回来，
    // 刚打开详情页时那一下「整体向右摆」比任何入场动效都晕。
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
        // 换歌判定要在 paintSong() 之前取（它会更新 inst.songId）。
        // 打开详情页时宿主也会补推一次 song（内容是当前这首歌，id 没变），
        // 那种「没换歌」的补推不该重置分数、更不该震屏。
        const songChanged = Boolean(patch.type === "song" && String(ctx.media().song?.id ?? "") !== inst.songId);
        inst.paintSong();
        const m = ctx.media();
        inst.lyrics.setLines(m.lyrics.lines, { emptyText: emptyTextFor(m.lyrics) });
        inst.lyrics.setPosition(ctx.playback().position, { immediate: true });
        // 只重置计分 + 机台小幅震屏（3.5px，steps 步进），不推相机：
        // camera.pulse() 会把整屏向右推 150px 再弹回来，那个「摇摆」整条弧线都不要。
        if (songChanged) {
          inst.resetScore();
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
      case "spectrum":
        // 宿主采好的一帧频谱（bands:null = 停止）。皮肤只负责画。
        inst.paintSpectrum(patch.bands);
        break;
      case "options":
        inst.paintOptions();
        break;
      case "resize":
        inst.lyrics.markMeasure();
        break;
      case "close":
        if (inst.bg) inst.bg.dataset.anim = "off";
        inst.paintSpectrum(null);
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
