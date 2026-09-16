// @ts-check
/* ==========================================================================
   stage.js — 内置样式「舞台 · 文字 PV」（id: stage）
   --------------------------------------------------------------------------
   设计取向：**以文字为主体的排版型样式**。

   与已有的六个样式的构图对照（README 要求「构图必须各不相同」）：
     · classic   左唱片 / 右歌词            —— 信息最全的两栏
     · immersive 封面虚化铺满 / 居中歌词     —— 一整张背景图
     · minimal   无封面 / 居中歌词          —— 只有文字
     · anime     分镜格左 / 歌词右          —— 手绘漫画
     · arcade    机台居中 / 底部对话框       —— 街机
     · magia     魔法阵左 / 歌词右          —— 手绘夜景
     · stage     满幅大字占主体，封面退成右下角一张**贴纸**；
                 构图每三行在四个「机位」间切换一次（左对齐 / 居中 / 右倾 / 俯视），
                 背景是网纹纸 + 几何网格 + 频谱条 —— 没有第二个「封面栏」。

   手法参考（不是照搬代码）：folia-major 的 visualizer 目录里，
   tempera（凝彩）的「编译期分镜」与 sonnet/partita 的「字级排版 + 逐字点亮」
   是本样式的主要来源：
     · 分镜：把「第几行歌词」映射成一个**确定性的**镜头序列（本文件 setShot），
       而不是每行随机 —— 同一首歌每次播放构图一致，长句短句都不会错位；
     · 逐字：直接复用本包的 createFxLyrics（字素入场 + 卡拉OK点亮）；
     · 运镜：复用本包的 createCamera（分层视差 + 机位切换 + 手持微动），
       并且**只写 transform**、只在可见时跑、帧率上限 60。
   这些都是纯 DOM/CSS/Canvas2D 能表达的部分；folia 里依赖 PixiJS / R3F /
   pretext 的模式（sonnet / diorama / cappella 等）刻意没有引入 ——
   它们对渲染栈的要求与本项目的「零运行时依赖」前提冲突。

   契约遵守：所有数据来自 ctx，动作走 ctx.actions；
   interactive:false（桌面背景歌词窗口）时不做任何可点/可聚焦的东西；
   animations:false 时停掉相机与入场动画。
   ========================================================================== */

import { defineSkin } from "../contract.js";
import { createFxLyrics } from "../fx-lyrics.js";
import { createCamera } from "../fx-camera.js";
import { createBackgroundLayer } from "../background-layer.js";
import { EMPTY_TRACK, lyricsEmptyText, setCoverImage, subtitleOf } from "../html.js";
import "./stage.css";

/** 机位数量（与 stage.css 里的 [data-shot="n"] 一一对应） */
const SHOT_COUNT = 4;
/** 每几行换一次分镜。取 3：比「每行都换」稳，又比「整首不变」有节奏 */
const LINES_PER_SHOT = 3;
/** 频谱条数量（与 defineSkin 的 spectrum 保持一致） */
const BAR_COUNT = 24;

let inst = null;

const skin = defineSkin({
  apiVersion: 1,
  id: "stage",
  name: "舞台",
  icon: "slideshow",
  order: 50,
  description: "字级文字 PV：满幅大字 + 分镜切换 + 网纹背景",
  background: true,
  spectrum: BAR_COUNT,

  mount(ctx) {
    ctx.root.innerHTML = `
      <div class="st" data-shot="0" data-anim="on">
        <div class="st__cam">
          <div class="st__grid"></div>
          <div class="st__glow"></div>
          <div class="st__ghost" id="st-ghost"></div>
        </div>
        <div class="st__stage">
          <div class="st__meta">
            <div class="st__title" id="st-title"></div>
            <div class="st__artist" id="st-artist"></div>
          </div>
          <div class="st__lines pv-lyrics-host" id="st-lines"></div>
          <div class="st__sticker">
            <img id="st-cover" alt="" draggable="false" />
          </div>
        </div>
        <div class="st__bars" id="st-bars" aria-hidden="true"></div>
      </div>`;

    const shell = /** @type {HTMLElement} */ (ctx.root.querySelector(".st"));
    /** querySelector 的类型收窄：模板是我们自己写的，这些节点必然存在 */
    const pick = (sel) => /** @type {HTMLElement} */ (shell.querySelector(sel));
    const camHost = pick(".st__cam");
    const glow = pick(".st__glow");
    const active = ctx.options().interactive !== false;

    // 频谱条：一次性建好，之后只改高度（不重建 DOM）
    const barsHost = pick("#st-bars");
    const bars = [];
    for (let i = 0; i < BAR_COUNT; i += 1) {
      const b = document.createElement("span");
      barsHost.appendChild(b);
      bars.push(b);
    }

    const lyrics = createFxLyrics(pick("#st-lines"), {
      onSeek: (ms) => ctx.actions.seek(ms),
      interactive: active,
    });

    // 整窗背景：封面重度虚化 + 压暗，只当「舞台的远景」用。
    // 换歌 / 轮播时才 setImage，不在帧循环里动它。
    const background = createBackgroundLayer(ctx.backgroundRoot);
    // 远景只是「虚化底色」：模糊半径刻意压到 46px。更大的半径在整窗尺寸上
    // 属于纯填充率开销（实测 78px → 46px 的观感差别很小）。
    background.setStyle({ blur: 46, brightness: 0.46, scale: 1.16 });

    // 相机只带「渐变光晕」与「巨大标题」两层：**网纹不进相机**。
    // 网纹是三层平铺渐变、面积覆盖整窗，跟着相机做缩放会迫使浏览器每帧
    // 重新栅格化这一整层（实测是本样式最贵的一笔）。让它静止，构图差异
    // 交给文字层与光晕层，肉眼几乎看不出差别。
    const camera = createCamera(camHost, { maxFps: 60, seed: 5, shotMin: 11, shotMax: 18 });
    camera.addLayer(glow, { depth: 0.62 });
    camera.addLayer(pick(".st__ghost"), { depth: 0.24 });

    inst = {
      ctx,
      shell,
      lyrics,
      camera,
      background,
      bars,
      shot: -1,
      lineIndex: -2,
      sweepEl: null,
      sweepPct: -999,
      anim: ctx.options().animations !== false,
      title: pick("#st-title"),
      artist: pick("#st-artist"),
      ghost: pick("#st-ghost"),
      cover: /** @type {HTMLImageElement} */ (pick("#st-cover")),

      /** 分镜：由「第几行」推出来，纯函数、可复现 */
      setShot(shot) {
        const next = ((shot % SHOT_COUNT) + SHOT_COUNT) % SHOT_COUNT;
        if (next === this.shot) return;
        this.shot = next;
        shell.dataset.shot = String(next);
      },

      paintSong() {
        const m = ctx.media();
        const song = m.song || EMPTY_TRACK;
        const title = song.title || "未在播放";
        this.title.textContent = title;
        this.ghost.textContent = title;
        this.artist.textContent = subtitleOf(song.artist, song.album);
        setCoverImage(this.cover, m.cover, ctx.defaultCover);
        this.background.setImage(m.cover);
        // 换歌回到第一个机位，并给相机一次「切镜」脉冲
        this.setShot(0);
        this.camera.pulse(0.9, 1.3);
      },

      paintOptions() {
        const o = ctx.options();
        this.anim = o.animations !== false;
        shell.dataset.anim = this.anim ? "on" : "off";
        shell.style.setProperty("--st-lyric-size", `${Number(o.lyricsFontSize) || 16}px`);
        this.camera.setEnabled(this.anim);
      },

      /**
       * 逐字扫光：把「行内进度」写成一个自定义属性，由 CSS 用
       * mask-image 把第二层文字擦出来。
       *
       * 这是 folia 的 MonetWordSweep / PendoloSweepLine 的纯 CSS 版
       * （双层文字 + background-clip: text + mask 扫过），没有 canvas、
       * 不需要逐字测量宽度。代价控制有两条：
       *   · 自定义属性只写在**当前这一行**的元素上 —— 写在 shell 上会让
       *     整棵子树（上千个字素 span）每帧重算样式，这正是 magia 卡顿的成因；
       *   · 百分比变化小于 1 时不写（每帧都写等于每帧一次样式失效）。
       */
      paintSweep(progress) {
        const el = this.sweepEl?.isConnected
          ? this.sweepEl
          : this.shell.querySelector('.fxl__line[data-state="active"]');
        if (!el) {
          this.sweepEl = null;
          return;
        }
        if (el !== this.sweepEl) {
          this.sweepEl = el;
          this.sweepPct = -999;
        }
        const pct = Math.round(clamp01(progress) * 118 - 8);
        if (pct === this.sweepPct) return;
        this.sweepPct = pct;
        el.style.setProperty("--st-sweep", `${pct}%`);
      },

      paintBands(bands) {
        if (!Array.isArray(bands) || !bands.length) {
          for (const b of this.bars) if (b.style.transform) b.style.transform = "";
          return;
        }
        for (let i = 0; i < this.bars.length; i += 1) {
          // 取对数分布：低频密集、高频稀疏，视觉上更像电平柱
          const idx = Math.min(bands.length - 1, Math.floor((i / this.bars.length) ** 1.6 * bands.length));
          const v = clamp01(Number(bands[idx]) || 0);
          const b = this.bars[i];
          const t = `scaleY(${(0.08 + v * 0.92).toFixed(3)})`;
          if (b.__t !== t) {
            b.__t = t;
            b.style.transform = t;
          }
        }
      },
    };

    inst.paintSong();
    inst.paintOptions();
    background.setEnabled(true);
    const m = ctx.media();
    lyrics.setLines(m.lyrics.lines, { emptyText: lyricsEmptyText(m.lyrics) });
  },

  update(ctx, patch) {
    if (!inst) return;
    switch (patch.type) {
      case "song": {
        const m = ctx.media();
        inst.paintSong();
        inst.lyrics.setLines(m.lyrics.lines, { emptyText: lyricsEmptyText(m.lyrics) });
        inst.lyrics.setPosition(ctx.playback().position, { immediate: true });
        inst.setShot(0);
        break;
      }
      case "media":
        inst.paintSong();
        break;
      case "lyrics": {
        const m = ctx.media();
        inst.lyrics.setLines(m.lyrics.lines, { emptyText: lyricsEmptyText(m.lyrics) });
        inst.lyrics.setPosition(ctx.playback().position, { immediate: true });
        break;
      }
      case "progress": {
        inst.lyrics.setPosition(patch.position);
        // 分镜跟着「当前行」走：行号是真源，所以拖动进度条 / seek 之后
        // 构图也会立刻回到正确的那一格，不需要另存状态。
        const idx = inst.lyrics.activeIndex;
        if (idx !== inst.lineIndex) {
          inst.lineIndex = idx;
          if (idx >= 0) inst.setShot(Math.floor(idx / LINES_PER_SHOT));
        }
        if (idx >= 0) {
          const lines = inst.lyrics.lines;
          const start = lines[idx]?.time ?? 0;
          const end = lines[idx + 1]?.time ?? start + 4000;
          inst.paintSweep((patch.position - start) / Math.max(1, end - start));
        }
        break;
      }
      case "spectrum":
        inst.paintBands(patch.bands);
        break;
      case "state":
        if (!patch.playing) inst.paintBands(null);
        break;
      case "options":
        inst.paintOptions();
        break;
      case "resize":
        inst.lyrics.markMeasure();
        break;
      case "close":
        // 详情页收起：整窗背景与相机一起停下，别让它们在曲库界面上继续跑
        inst.camera.setEnabled(false);
        inst.paintBands(null);
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
    cur.background.destroy();
    if (cur.shell) cur.shell.dataset.anim = "off";
  },
});

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export default skin;
