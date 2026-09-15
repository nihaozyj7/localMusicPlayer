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
import { EMPTY_TRACK, setCoverImage, subtitleOf } from "../html.js";
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

/**
 * 手绘背景装饰（植物 / 房屋 / 小动物）。
 *
 * 为什么用内联 SVG 而不是继续堆 CSS 方块：树、屋顶、猫和兔子都需要
 * 「不规则的线」才像手绘，div + border-radius 画出来的东西一眼就是几何图形，
 * 和这个样式的马克笔/网点纸语言不搭。SVG 里全部走描边（fill: none），
 * 颜色只认 --an-ink，所以深浅色主题下都会跟着纸色一起变。
 *
 * 构图刻意压在下缘：它是背景的第二层（山丘之上、主体之下），
 * 不能抢封面。viewBox 固定 1440×360，用 xMidYMax slice 铺满，宽窗口裁两边。
 */
const VILLAGE_SVG =
  '<svg class="an-veg" viewBox="0 0 1440 360" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">' +
  // 地面草丛（唯一带填充的一层：让景物「站」在地上）
  '<g class="an-veg__grass">' +
  '<ellipse cx="210" cy="330" rx="180" ry="26"></ellipse>' +
  '<ellipse cx="1240" cy="338" rx="200" ry="28"></ellipse>' +
  '<ellipse cx="700" cy="344" rx="230" ry="26"></ellipse>' +
  "</g>" +
  '<g class="an-veg__ink" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">' +
  // 阔叶树（左）
  '<g class="an-veg__tree an-veg__tree--a">' +
  '<path d="M152 332c-4-26-3-48 2-70"></path>' +
  '<path d="M92 272c0-32 26-56 60-56s58 24 58 56-26 50-60 50-58-18-58-50z"></path>' +
  '<path d="M122 248c10-16 30-24 50-19"></path>' +
  "</g>" +
  // 松树（右）
  '<g class="an-veg__tree an-veg__tree--b">' +
  '<path d="M1288 338c-2-22 0-42 4-60"></path>' +
  '<path d="M1290 182l54 82h-108z"></path>' +
  '<path d="M1290 236l44 70h-88z"></path>' +
  "</g>" +
  // 小房子（左）：墙 / 屋顶 / 门 / 窗 / 烟囱
  '<g class="an-veg__house">' +
  '<path d="M300 322v-74h134v74"></path>' +
  '<path d="M282 250l85-56 85 56"></path>' +
  '<path d="M404 198v-36h20v50"></path>' +
  '<path d="M342 322v-42h42v42"></path>' +
  '<path d="M312 266h30v26h-30z"></path>' +
  '<path d="M312 279h30M327 266v26"></path>' +
  '<circle cx="356" cy="302" r="2.6" fill="currentColor" stroke="none"></circle>' +
  "</g>" +
  // 小房子（右，更小）
  '<g class="an-veg__house">' +
  '<path d="M1032 332v-58h98v58"></path>' +
  '<path d="M1020 276l61-42 61 42"></path>' +
  '<path d="M1094 236v-28h14v40"></path>' +
  '<path d="M1062 332v-34h32v34"></path>' +
  '<path d="M1042 288h20v18h-20z"></path>' +
  "</g>" +
  // 篱笆
  '<g class="an-veg__fence">' +
  '<path d="M700 330v-32M724 330v-34M748 330v-32M772 330v-34"></path>' +
  '<path d="M692 310l88-4M692 322l88-4"></path>' +
  "</g>" +
  // 草丛（线稿）
  '<path d="M520 330c0-16 6-28 14-34M536 330c2-18 10-30 20-34M552 330c4-14 12-22 22-26"></path>' +
  '<path d="M884 336c0-14 6-24 12-30M898 336c2-16 8-26 18-30"></path>' +
  // 猫（坐着，尾巴翘起）
  '<g class="an-veg__pet">' +
  '<path d="M604 330c-12 0-20-9-20-20s9-19 21-19 20 8 20 19-9 20-21 20z"></path>' +
  '<path d="M590 296l-5-16 14 7M618 294l7-16 3 16"></path>' +
  '<path d="M626 318c14-3 22-14 20-26"></path>' +
  "</g>" +
  // 兔子
  '<g class="an-veg__pet">' +
  '<path d="M842 336c-12 0-21-9-21-20s9-19 21-19 21 8 21 19-9 20-21 20z"></path>' +
  '<path d="M828 298c-7-11-7-24-3-33M844 296c-2-13 3-26 9-32"></path>' +
  '<circle cx="856" cy="312" r="2.4" fill="currentColor" stroke="none"></circle>' +
  "</g>" +
  // 小鸟（三个「v」）
  '<g class="an-veg__birds">' +
  '<path d="M660 122c8-11 17-11 25 0M685 122c8-11 17-11 25 0"></path>' +
  '<path d="M768 86c7-10 15-10 22 0M790 86c7-10 15-10 22 0"></path>' +
  '<path d="M524 160c6-9 13-9 19 0M543 160c6-9 13-9 19 0"></path>' +
  "</g>" +
  "</g>" +
  // 炊烟
  '<g class="an-veg__smoke">' +
  '<circle cx="420" cy="184" r="7"></circle>' +
  '<circle cx="430" cy="164" r="9"></circle>' +
  '<circle cx="422" cy="142" r="11"></circle>' +
  "</g>" +
  "</svg>";

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
        // 注意外面这层容器不能省：手绘村落的定位 / 视差（.an-bg__village）
        // 挂在它身上。直接把 <svg> 塞进 .an-bg 会让它铺满整窗，
        // viewBox 被放大到 2.5 倍，树和鸟都会变成糊在边上的巨大线条。
        '<div class="an-bg__village">' +
        VILLAGE_SVG +
        "</div>" +
        '<div class="an-bg__petals">' +
        buildPetals(12) +
        "</div>" +
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

    /* 运镜：分层视差 + 机位切换（见 fx-camera.js 顶部说明）。
       幅度必须够大才看得见 —— 第一版 11px/0.55° 在居中构图上等于静止。 */
    const camera = createCamera(cam, {
      ampX: 88,
      ampY: 54,
      rot: 3.6,
      zoom: 0.055,
      speed: 1.05,
      seed: 11,
      shotMin: 9,
      shotMax: 15,
    });
    // 歌词跟着镜头动，但幅度只有主体的一半 → 与封面之间产生视差
    camera.addLayer(lyricsHost, { depth: 0.6, scale: false });
    if (bg) {
      // 远景动得少、近景动得多；只挑自身没有 CSS transform 动画的容器
      /** @type {Array<[string, number]>} 选择器 + 视差深度 */
      const camLayers = [
        [".an-bg__paper", 0.14],
        [".an-bg__hills", 0.26],
        [".an-bg__clouds", 0.55],
        // 手绘村落：比云近、比网点远，跟着镜头做中等幅度的视差
        [".an-bg__village", 0.66],
        [".an-bg__tone", 0.85],
        [".an-bg__petals", 1.5],
      ];
      for (const [sel, depth] of camLayers) {
        camera.addLayer(/** @type {HTMLElement|null} */ (bg.querySelector(sel)), { depth });
      }
    }
    const lyrics = createFxLyrics(lyricsHost, {
      onSeek: (ms) => ctx.actions.seek(ms),
      interactive,
    });

    /** 分镜格「啪」地一下推进（WAAPI：不触发同步重排）
     *
     *  只做缩放，**不带角度变化**：分镜格本身是歪的（CSS 上的 rotate(-1.4deg)），
     *  关键帧里写别的角度会让它先摆正再歪回去 —— 那就是「摇摆」的观感。
     *  这里每个关键帧都把角度钉在静止角上，纯粹是一次推进。 */
    function pop() {
      if (typeof panel?.animate !== "function") return;
      if (ctx.options().animations === false) return;
      panel.animate(
        [
          { transform: "scale(0.94) rotate(-1.4deg)", filter: "saturate(1.35) brightness(1.08)" },
          { transform: "scale(1.035) rotate(-1.4deg)" },
          { transform: "scale(1) rotate(-1.4deg)", filter: "none" },
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

      /* 当前显示的是哪首歌。宿主在挂载后会补推一次 song（内容就是当前这首歌），
         靠它区分「真的换歌了」和「只是补推」，避免一打开详情页就播推进动画。 */
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
    // 这里（以及整个皮肤里）都**不用** camera.pulse()：那个「换镜脉冲」会把所有
    // 相机层沿 X 推最多 150px 再弹回来，看着就是整屏向右摆一下。进场时它和分镜
    // 推进的 pop() 打架，切歌时又和歌词翻页抢注意力，所以整条弧线直接不要了。
    const m = ctx.media();
    lyrics.setLines(m.lyrics.lines, { emptyText: emptyTextFor(m.lyrics) });
    lyrics.setPosition(ctx.playback().position, { immediate: true });
  },

  update(ctx, patch) {
    if (!inst) return;
    switch (patch.type) {
      case "mount":
      case "song": {
        // 换歌判定要在 paintSong() **之前**取（它会更新 inst.songId）。
        // 打开详情页时宿主也会补推一次 song（内容就是当前这首歌），
        // 那种「没换歌」的补推不该播分镜推进动画。
        const songChanged = Boolean(patch.type === "song" && String(ctx.media().song?.id ?? "") !== inst.songId);
        inst.paintSong();
        const m = ctx.media();
        inst.lyrics.setLines(m.lyrics.lines, { emptyText: emptyTextFor(m.lyrics) });
        inst.lyrics.setPosition(ctx.playback().position, { immediate: true });
        // 只播分镜格自己的 pop（面板小幅缩放，位置不动），不推相机。
        if (songChanged) inst.pop();
        inst.playing = Boolean(ctx.playback().playing);
        inst.panel.dataset.playing = inst.playing ? "true" : "false";
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
