/* ==========================================================================
   rubbing/skin.js — 第三方样式「拓印」
   --------------------------------------------------------------------------
   一句话：**歌词是用这张封面的像素堆出来的。**
   当前这句歌词被离屏渲染成掩码 → 在笔画上抽一万来个目标点 → 每个粒子从
   封面的**同一个相对位置**取色 → 弹簧把它们磁吸到笔画上。唱到第 k 个字素
   时，属于它的粒子才被强吸引（未唱到的只是淡淡的灰尘）。

   极限轴：**图像数据化 + 粒子物理**。设计规格见
   plugins/style/pending-designs.md 02。

   与宿主的分工（契约 v3）：
     · 数据只从 ctx 拿，动作只走 ctx.actions；本包零裸包名 import；
     · 整窗背景层的内容是本包填的（容器是宿主的），卸载时自己清空并隐藏；
     · 歌词：本包自己的离屏渲染 + 粒子；字素切分走 ctx.sdk.splitGraphemes
       （必须与宿主同一份切法，否则 words 下标对不上）；
     · 宿主壳配色只有一条合法通道：清单 colors + ctx.actions.reportBackdrop()。

   ★ 子模块必须 `await import()` 并透传入口的 ?t= token
     `/skins/` 逐文件鉴权；ES 模块解析相对说明符会丢掉 query，静态 import
     会去请求没有 token 的 `/skins/rubbing/lib/*.js` → 403。浏览器预览没有
     query，透传空串，退化成普通相对导入。

   ★ 性能纪律（本款是六款里唯一"每帧画上万个图元"的）
     · 粒子状态全在定长类型化数组里（SoA），运行期零分配、零 new；
     · 画布绘制按 **色桶 × 亮度档** 分批（18 次 fillStyle + N 次 fillRect），
       绝不逐粒子上色（那会变成每帧上万次字符串拼接）；
     · 自己量每帧的画布耗时（EMA），连续两帧超预算就退档
       （lod 0→3：粒子数 ×1 / ×0.66 / ×0.45 / ×0.30，后两档同时半分辨率）
       —— 这是探针 P5「4K + dpr2 的填充率会不会顶到上限」的答案；
     · 只有一条 rAF；暂停 6 秒停帧（暂停期间是**重力落地**，不是冻结）；
       performance 档按清单 budgetFps 限帧；animations:false / 减少动效时
       粒子瞬移到目标，只画一帧。
   ========================================================================== */

const Q = new URL(import.meta.url).search;
const load = (file) => import(`./lib/${file}${Q}`);

const palette = await load("palette.js");
const glyph = await load("glyph.js");
const field = await load("field.js");

/** 暂停后停帧的时长（宿主约定，见 docs/37） */
const IDLE_STOP_MS = 6000;
/** 画面比声音略慢一点，避免"字先亮、声后到" */
const VISUAL_LAG_MS = 70;
/** 清单 performance.budgetFps 的同源值 */
const BUDGET_FPS = 45;
/** 封面采样画布（色板与粒子取色都从这张来；96 以上收益很小） */
const COVER_N = 64;
/** 字形掩码分辨率（越高目标点越细，代价只是一次性的一次离屏渲染） */
const MASK_W = 560;
const MASK_H = 180;
/** 颜色桶数（LUT 取样点）与亮度档数 */
const BUCKETS = 6;
const LEVELS = 3;
/** 目标点缓存的条数（一句一条；前后句来回跳时不重算） */
const CACHE_MAX = 8;
/** 下一句提前算好的提前量 */
const PREFETCH_MS = 240;

const FONT_STACK = '"Segoe UI", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';

const SHELL = `
  <div class="rb">
    <canvas class="rb__canvas" aria-hidden="true"></canvas>
    <div class="rb__dust" aria-hidden="true"></div>
    <div class="rb__empty"></div>
    <div class="rb__hud">
      <div class="rb__title"></div>
      <div class="rb__sub">
        <span class="rb__artist"></span>
        <span class="rb__badge"></span>
        <span class="rb__tc">00:00</span>
      </div>
      <div class="rb__ticks" aria-hidden="true"></div>
    </div>
  </div>`;

const BG_SHELL = `
  <div class="rbbg">
    <img class="rbbg__img" alt="" />
    <div class="rbbg__veil" aria-hidden="true"></div>
    <div class="rbbg__grain" aria-hidden="true"></div>
  </div>`;

const TICKS = 48;

/** 当前实例（换样式会先 destroy 再 mount） */
let S = null;

function nowMs() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

export default {
  id: "rubbing",
  name: "拓印",

  mount(ctx) {
    const { html } = ctx.sdk;
    const rb = ctx.root;
    rb.innerHTML = SHELL;

    const elRoot = rb.querySelector(".rb");
    const elCanvas = rb.querySelector(".rb__canvas");
    const elDust = rb.querySelector(".rb__dust");
    const elEmpty = rb.querySelector(".rb__empty");
    const elTitle = rb.querySelector(".rb__title");
    // ★ 只写 .rb__artist：写整行的 textContent 会把时间码与角标一起抹掉
    const elArtist = rb.querySelector(".rb__artist");
    const elBadge = rb.querySelector(".rb__badge");
    const elTc = rb.querySelector(".rb__tc");
    const elTicks = rb.querySelector(".rb__ticks");

    // 整窗背景层：容器由宿主给，内容本包填
    const bgRoot = ctx.backgroundRoot || null;
    if (bgRoot) {
      bgRoot.innerHTML = BG_SHELL;
      bgRoot.hidden = false;
    }
    const bgImg = bgRoot ? bgRoot.querySelector(".rbbg__img") : null;

    /* ---------------------------------------------------------------------
       状态（update / destroy 都只碰 st）
       --------------------------------------------------------------------- */
    const st = {
      alive: true,
      raf: 0,
      last: 0,
      lastFrame: 0,
      lastActive: nowMs(),
      idle: false,
      animations: true,
      interactive: true,
      performanceMode: false,
      budgetFps: BUDGET_FPS,
      budgetMs: field.paintBudgetMs(BUDGET_FPS),
      // 自适应降级
      lod: 0,
      paintAvg: -1,
      slowStreak: 0,
      startedAt: nowMs(),
      // 尺寸
      dpr: 1,
      rw: 0,
      rh: 0,
      rect: { x: 0, y: 0, w: 0, h: 0 },
      // 歌词
      lines: [],
      lineIndex: -1,
      text: "",
      graphemes: [],
      levels: new Float32Array(1),
      uniformLine: false,
      // 粒子
      pool: null,
      count: 0,
      px: null,
      groupOf: null,
      buckets: null,
      pass: null,
      // 封面
      coverSrc: "",
      coverKey: "",
      pal: null,
      coverData: null,
      // 离屏
      off: null,
      off2d: null,
      g2d: null,
      passColors: [],
      pointer: { x: 0, y: 0, active: false },
      // 计时器
      scatterTimer: 0,
      backdropTimer: 0,
      backdropPending: null,
      prefetchTimer: 0,
      lastTc: "",
      lastTick: -1,
      lastLit: "",
      emptyText: "@@",
      cache: new Map(),
      rng: glyph.mulberry32(0x5eed1234),
    };

    const opts = () => ctx.options?.() || {};
    const media = () => ctx.media?.() || {};
    const song = () => ctx.track?.() || html.EMPTY_TRACK || {};
    const lyrics = () => media().lyrics || {};
    const env = () => ctx.env?.() || { width: 0, height: 0, dpr: 1, reducedMotion: false };

    /** 只写变化过的自定义属性（每帧写 5 个变量也是白花的） */
    const vars = new Map();
    function setVar(name, value) {
      const v = String(value);
      if (vars.get(name) === v) return;
      vars.set(name, v);
      elRoot.style.setProperty(name, v);
    }

    /* ---------------------------------------------------------------------
       时钟：位置 + 墙钟外推（进度补丁 4Hz 且位置被量化到 250ms，
       不外推的话字是一跳一跳亮的）
       --------------------------------------------------------------------- */
    const clock = {
      pos: 0,
      at: nowMs(),
      playing: true,
      maxExtrapolate: 1200,
      set(pos, playing, now) {
        this.pos = Number(pos) || 0;
        this.playing = playing !== false;
        this.at = Number(now) || nowMs();
      },
      value(now) {
        const t = Number(now) || nowMs();
        if (!this.playing) return this.pos;
        const dt = Math.min(Math.max(0, t - this.at), this.maxExtrapolate);
        return this.pos + dt;
      },
    };

    /* ---------------------------------------------------------------------
       尺寸 / 画布
       --------------------------------------------------------------------- */
    function resizeCanvas() {
      const e = env();
      const rectCss = elCanvas.getBoundingClientRect?.() || { width: 0, height: 0 };
      const w = Math.max(1, Math.round(rectCss.width || e.width || 1));
      const h = Math.max(1, Math.round(rectCss.height || e.height || 1));
      const dpr = Math.max(1, Math.min(2, Number(e.dpr) || 1)) * field.lodResolution(st.lod);
      const scale = Math.max(0.5, dpr);
      st.dpr = scale;
      st.rw = w;
      st.rh = h;
      const bw = Math.max(1, Math.round(w * scale));
      const bh = Math.max(1, Math.round(h * scale));
      if (elCanvas.width !== bw || elCanvas.height !== bh) {
        elCanvas.width = bw;
        elCanvas.height = bh;
      }
      // 字形带：上方让开标题栏 + HUD，下方让开 HUD 与进度刻度
      const padTop = Math.round(h * 0.3);
      const padBottom = Math.round(h * 0.26);
      st.rect = {
        x: Math.round(w * 0.06),
        y: padTop,
        w: Math.max(40, Math.round(w * 0.88)),
        h: Math.max(24, h - padTop - padBottom),
      };
      st.g2d = elCanvas.getContext("2d", { alpha: true });
      st.paintAvg = -1;
      st.slowStreak = 0;
    }

    /** 粒子数：按面积 × dpr 自适应，并按 lod 降级 */
    function particleTarget() {
      const base = field.countForArea(st.rw * st.rh, st.dpr, {
        performanceMode: st.performanceMode,
      });
      return Math.max(600, Math.round(base * field.lodFactor(st.lod)));
    }

    function ensurePool() {
      const want = particleTarget();
      if (!st.pool || st.pool.cap < want) {
        st.pool = field.createPool(Math.max(want, field.MAX_PARTICLES));
        st.pass = new Int32Array(st.pool.cap);
        st.px = new Float32Array(st.pool.cap * 2);
        st.groupOf = new Uint8Array(st.pool.cap);
        st.buckets = new Int32Array(st.pool.cap);
        st.count = field.seedPool(st.pool, want, st.rng, st.rect);
      } else {
        st.count = Math.min(want, st.pool.cap);
        if (st.count > st.pool.count) {
          field.seedDust(st.pool, st.pool.count, st.count, st.rng, st.rect);
          st.pool.count = st.count;
        }
      }
      st.count = want;
      return st.count;
    }

    /* ---------------------------------------------------------------------
       封面 → 色板
       --------------------------------------------------------------------- */
    function applyPalette(pal) {
      st.pal = pal;
      // ★ 选字色的依据必须是"实际画出来的底"，不是封面本身：
      //   整窗背景是 .rbbg__img（blur + brightness(.46)）叠 .rbbg__veil 暗纱，
      //   再亮的封面压完也是近黑。拿未压暗的封面主色选色，会在亮封面下选出
      //   "深色字"压在近黑底上（~1.1:1）—— 宿主壳与 HUD 一起看不见。
      //   换算与理由见 palette.js#backdropUnderCover。
      const backdrop = palette.backdropUnderCover(pal.dominant);
      setVar("--rb-bg", palette.toHex(backdrop));
      setVar("--rb-accent", palette.toHex(pal.accent));
      // 壳文字色：在亮/暗两套里挑**对比度更高**的那套（底可能是近黑也可能是
      // 被用户自定义的暗纱抬亮的颜色，只按"亮不亮"二分会在临界值上挑错）
      const light = [242, 236, 224];
      const dark = [18, 16, 14];
      const fg =
        palette.contrastWith(backdrop, light) >= palette.contrastWith(backdrop, dark) ? light : dark;
      setVar("--rb-fg", palette.toHex(fg));
      buildPassColors();
      st.backdropPending = {
        bg: palette.toHex(backdrop),
        fg: palette.toHex(fg),
        // ★ accent 必须一起报：宿主壳的进度条 / 音量条 / 播放键 / 播放模式按钮
        //   走的是 --accent 家族（见宿主 tokens.css「强调色家族」）。不报的话它们
        //   会永远停在清单里那个静态专色上 —— 与当前封面、与画面里用 --rb-accent
        //   画出来的东西都不是一个色，看起来就是"别的控件是另一个颜色"。
        accent: palette.toHex(pal.accent),
      };
      if (st.backdropTimer) return; // ≥300ms 防抖：轮播/连换封面不会打爆 IPC
      st.backdropTimer = setTimeout(() => {
        st.backdropTimer = 0;
        const payload = st.backdropPending;
        st.backdropPending = null;
        if (payload && st.alive) ctx.actions?.reportBackdrop?.(payload);
      }, 400);
    }

    /** 18 个批次的填充色：6 个色桶 × 3 个亮度档，全部预拼好字符串 */
    function buildPassColors() {
      const lum = st.pal ? st.pal.lut : [[13, 12, 11], [232, 226, 214]];
      const cols = new Array(BUCKETS * LEVELS);
      for (let b = 0; b < BUCKETS; b += 1) {
        const base = palette.lutAt(lum, 0.12 + (b / (BUCKETS - 1)) * 0.8);
        for (let lv = 0; lv < LEVELS; lv += 1) {
          let c = base;
          let a = 0.34;
          if (lv === 1) {
            a = 0.72;
          } else if (lv === 2) {
            c = palette.mix(base, [255, 246, 232], 0.34);
            a = 0.95;
          } else {
            c = palette.mix(base, [18, 16, 14], 0.45);
          }
          cols[b * LEVELS + lv] = `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
        }
      }
      st.passColors = cols;
    }

    /** 封面 → 采样画布 → 色板（每首歌只做一次） */
    async function loadCover(src) {
      if (!src || src === st.coverKey) return;
      st.coverKey = src;
      try {
        const c = document.createElement("canvas");
        c.width = COVER_N;
        c.height = COVER_N;
        const g = c.getContext("2d", { willReadFrequently: true });
        if (!g) return;
        const img = new Image();
        img.decoding = "async";
        await new Promise((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error("cover"));
          img.src = src;
        });
        if (!st.alive) return;
        g.drawImage(img, 0, 0, COVER_N, COVER_N);
        const data = g.getImageData(0, 0, COVER_N, COVER_N).data;
        st.coverData = data;
        applyPalette(palette.paletteFrom(data, COVER_N, COVER_N, { fallback: { dark: [13, 12, 11], light: [232, 226, 214], accent: [185, 163, 126] } }));
        // 换封面 = 整幅画换色 → 重新给目标点上色
        if (st.text) {
          st.cache.clear();
          computeTargets(st.text, st.graphemes, { force: true });
        }
      } catch {
        st.coverData = null;
        applyPalette(
          palette.paletteFrom(null, COVER_N, COVER_N, { fallback: { dark: [13, 12, 11], light: [232, 226, 214], accent: [185, 163, 126] } })
        );
      }
    }

    /* ---------------------------------------------------------------------
       文字 → 目标点
       --------------------------------------------------------------------- */
    function ensureOffscreen() {
      if (st.off) return;
      st.off = document.createElement("canvas");
      st.off.width = MASK_W;
      st.off.height = MASK_H;
      st.off2d = st.off.getContext("2d", { willReadFrequently: true });
    }

    /** 把一行文字画进离屏画布并抽出目标点（一次性，带缓存） */
    function computeTargets(text, graphemes, { force = false } = {}) {
      const count = st.count || particleTarget();
      const key = `${text}|${count}|${st.rect.w}x${st.rect.h}|${st.coverKey ? "c" : "d"}`;
      const hit = st.cache.get(key);
      if (hit && !force) {
        applyTargets(hit, count);
        return hit;
      }
      ensureOffscreen();
      const g = st.off2d;
      if (!g || !text) return null;
      g.clearRect(0, 0, MASK_W, MASK_H);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#fff";
      let size = Math.min(MASK_H * 0.74, 132);
      g.font = `600 ${size}px ${FONT_STACK}`;
      const w0 = g.measureText(text).width || 1;
      if (w0 > MASK_W * 0.96) {
        size = Math.max(11, size * ((MASK_W * 0.96) / w0));
        g.font = `600 ${size}px ${FONT_STACK}`;
      }
      g.fillText(text, MASK_W / 2, MASK_H / 2);
      const data = g.getImageData(0, 0, MASK_W, MASK_H).data;
      const cov = glyph.coverageFromAlpha(data, MASK_W, MASK_H, { alphaMin: 40, dilate: 1 });
      const stats = glyph.maskStats(cov.mask, MASK_W, MASK_H);
      const idx = glyph.inkIndex(cov.mask);
      const norm = glyph.pickTargets(idx, { w: MASK_W, h: MASK_H }, count, st.rng, st.px);
      const pts = glyph.fitPoints(norm, count, st.rect, stats, st.px);
      const groupOf = glyph.groupByX(norm, count, Math.max(1, graphemes.length));
      const buckets = new Int32Array(count);
      const cd = st.coverData;
      for (let k = 0; k < count; k += 1) {
        let lum = 0.55;
        if (cd) {
          const u = Math.min(COVER_N - 1, Math.max(0, Math.floor(norm[k * 2] * COVER_N)));
          const v = Math.min(COVER_N - 1, Math.max(0, Math.floor(norm[k * 2 + 1] * COVER_N)));
          const i = (v * COVER_N + u) * 4;
          lum = palette.luma([cd[i], cd[i + 1], cd[i + 2]]);
        }
        buckets[k] = Math.max(0, Math.min(BUCKETS - 1, Math.floor(lum * BUCKETS)));
      }
      const entry = { pts: Float32Array.from(pts), groupOf, buckets, stats, size };
      if (st.cache.size >= CACHE_MAX) st.cache.delete(st.cache.keys().next().value);
      st.cache.set(key, entry);
      applyTargets(entry, count);
      return entry;
    }

    /** 目标点写进粒子池 + 按"封面同位像素"的亮度上色 */
    function applyTargets(entry, count) {
      if (!entry || !st.pool) return;
      for (let i = 0; i < count; i += 1) {
        const k = i % (entry.pts.length >> 1);
        st.px[i * 2] = entry.pts[k * 2];
        st.px[i * 2 + 1] = entry.pts[k * 2 + 1];
        st.groupOf[i] = entry.groupOf[k];
        st.buckets[i] = entry.buckets[k];
      }
      field.assignTargets(st.pool, count, st.px, st.groupOf, { colors: st.buckets });
      field.markLit(st.pool, count, glyph.litGroups(lyricsLine()?.words, st.graphemes.length, clock.value(nowMs())));
    }

    const lyricsLine = () => (st.lineIndex >= 0 ? st.lines[st.lineIndex] : null);

    /** 歌词行 + 空态（无歌 / 无歌词 / 加载中 / 匹配失败都要有明确画面） */
    function syncLines({ force = false } = {}) {
      const ly = lyrics() || {};
      const lines = Array.isArray(ly.lines) ? ly.lines : [];
      if (force || lines.length !== st.lines.length) {
        st.lines = lines;
        st.lineIndex = -1;
        st.cache.clear();
      }
      const has = !!(song().id && lines.length) && opts().showLyrics !== false;
      const text = has || opts().showLyrics === false ? "" : song().id ? html.lyricsEmptyText?.(ly) || "" : html.lyricsEmptyText?.({ status: "none" }) || "";
      if (text !== st.emptyText) {
        st.emptyText = text;
        elEmpty.textContent = text;
      }
      elEmpty.hidden = has || !text;
      elDust.hidden = !has;
      elCanvas.hidden = !has;
      elRoot.dataset.empty = has ? "0" : "1";
      if (!has) {
        st.text = "";
        st.graphemes = [];
        st.lineIndex = -1;
        elDust.textContent = "";
        if (st.pool) {
          // 空态：整池退化成"灰尘"，画面上仍然有沙（不是白屏）
          for (let i = 0; i < st.count; i += 1) {
            st.pool.g[i] = -1;
            st.pool.lit[i] = 0;
          }
        }
      }
      return has;
    }

    /** 当前行使粒子"散一次"，再用新材料聚拢（切句的动作） */
    function scatterLine() {
      const c = st.count || particleTarget();
      field.scatter(st.pool, c, st.rng, field.PHYS.scatter);
      setVar("--rb-flux", "1");
      if (st.scatterTimer) clearTimeout(st.scatterTimer);
      st.scatterTimer = setTimeout(() => {
        st.scatterTimer = 0;
        if (st.alive) setVar("--rb-flux", "0");
      }, 420);
    }

    function setActiveLine(index, { animate = true } = {}) {
      const line = st.lines[index];
      const text = String(line?.text || "");
      const graphemes = text ? ctx.sdk.splitGraphemes(text) : [];
      const changed = text !== st.text;
      st.lineIndex = index;
      st.text = text;
      st.graphemes = graphemes;
      st.uniformLine = !(Array.isArray(line?.words) && line.words.length === graphemes.length);
      st.levels = new Float32Array(Math.max(1, graphemes.length));
      elDust.textContent = text;
      if (!st.pool) ensurePool();
      if (text) computeTargets(text, graphemes);
      if (changed && animate && st.animations) scatterLine();
      // 下一句提前算好，切句时就不必在同一帧里做离屏渲染
      if (st.prefetchTimer) clearTimeout(st.prefetchTimer);
      const next = st.lines[index + 1];
      if (next?.text) {
        st.prefetchTimer = setTimeout(() => {
          st.prefetchTimer = 0;
          if (st.alive) computeTargets(String(next.text), ctx.sdk.splitGraphemes(String(next.text)));
        }, PREFETCH_MS);
      }
    }

    /* ---------------------------------------------------------------------
       HUD
       --------------------------------------------------------------------- */
    function paintSong() {
      const s = song();
      elTitle.textContent = String(s.title || "");
      elArtist.textContent = [s.artist, s.album].filter(Boolean).join(" · ");
      elBadge.textContent = s.kind === "online" ? "试听" : "";
      elBadge.hidden = s.kind !== "online";
      st.duration = Number(s.duration) || 0;
      const cover = media().cover || "";
      if (bgImg) html.setCoverImage(bgImg, cover, ctx.defaultCover);
      if (cover !== st.coverSrc) {
        st.coverSrc = cover;
        loadCover(cover);
      }
    }

    function paintTimecode(pos, now) {
      const tc = `${field.timecode(pos)} / ${field.timecode(st.duration || (ctx.playback?.() || {}).duration || 0)}`;
      if (tc !== st.lastTc) {
        st.lastTc = tc;
        elTc.textContent = tc;
      }
      const ratio = st.duration > 0 ? Math.max(0, Math.min(1, pos / st.duration)) : 0;
      const lit = Math.round(ratio * TICKS);
      if (lit !== st.lastTick) {
        st.lastTick = lit;
        for (let i = 0; i < elTicks.childElementCount; i += 1) {
          const on = i < lit ? "1" : "0";
          const el = elTicks.children[i];
          if (el.dataset.on !== on) el.dataset.on = on;
        }
      }
      setVar("--rb-lit", ratio.toFixed(3));
    }

    /* ---------------------------------------------------------------------
       绘制
       --------------------------------------------------------------------- */
    function drawFrame() {
      const g = st.g2d;
      if (!g || !st.pool) return;
      const t0 = nowMs();
      const s = st.dpr;
      g.setTransform(s, 0, 0, s, 0, 0);
      g.clearRect(0, 0, st.rw, st.rh);
      const n = st.count;
      const pool = st.pool;
      const levels = st.levels;
      const uniform = st.uniformLine;
      const passes = BUCKETS * LEVELS;
      // 每个粒子的批次：色桶 × 亮度档（未唱到 = 0 档）
      for (let i = 0; i < n; i += 1) {
        const gidx = pool.g[i];
        let lv = 0;
        if (pool.lit[i]) {
          const l = uniform ? 1 : levels[gidx] || 0;
          lv = l >= 0.72 ? 2 : l >= 0.18 ? 1 : 0;
        }
        st.pass[i] = pool.c[i] * LEVELS + lv;
      }
      for (let p = 0; p < passes; p += 1) {
        g.fillStyle = st.passColors[p] || "rgba(200,200,200,.5)";
        for (let i = 0; i < n; i += 1) {
          if (st.pass[i] !== p) continue;
          const r = pool.r[i];
          g.fillRect(pool.x[i] - r * 0.5, pool.y[i] - r * 0.5, r, r);
        }
      }
      // 自适应降级：量自己这一帧画了多久
      const dt = nowMs() - t0;
      st.paintAvg = field.ema(st.paintAvg, dt, 0.25);
      if (st.paintAvg > st.budgetMs) st.slowStreak += 1;
      else st.slowStreak = 0;
      const lod = field.nextLod(st.lod, st.paintAvg, st.budgetMs, st.slowStreak, nowMs() - st.startedAt);
      if (lod !== st.lod) {
        st.lod = lod;
        elRoot.dataset.lod = String(lod);
        resizeCanvas();
        st.count = particleTarget();
        if (!st.animations) snapToTargets();
      }
    }

    /** animations:false / 减少动效：粒子瞬移到目标，只画这一帧 */
    function snapToTargets() {
      if (!st.pool) return;
      updateProgress(Math.max(0, clock.value(nowMs()) - VISUAL_LAG_MS));
      for (let i = 0; i < st.count; i += 1) {
        st.pool.x[i] = st.pool.tx[i];
        st.pool.y[i] = st.pool.ty[i];
        st.pool.vx[i] = 0;
        st.pool.vy[i] = 0;
      }
      drawFrame();
    }

    /* ---------------------------------------------------------------------
       帧循环：一条 rAF / 暂停 6 秒停帧 / performance 档限帧
       --------------------------------------------------------------------- */
    function frame() {
      st.raf = 0;
      if (!st.alive || st.idle) return;
      const now = nowMs();
      const budget = 1000 / st.budgetFps;
      // ★ 限帧闸门要用**独立的时间戳**判断：拿 st.last（上一帧的时间）去算 dtMs
      //   会让第一次限帧就把闸门永久卡死（st.last 一直是 0 → dtMs 恒为 16 < 预算）。
      if (st.performanceMode && st.lastFrame && now - st.lastFrame < budget) {
        st.raf = requestAnimationFrame(frame);
        return;
      }
      const dtMs = st.lastFrame ? now - st.lastFrame : 16;
      st.lastFrame = now;
      st.last = now;
      const pos = Math.max(0, clock.value(now) - VISUAL_LAG_MS);
      stepWorld(pos, dtMs / 1000);
      drawFrame();
      if (st.animations === false) return;
      if (!clock.playing && field.idleExpired(st.lastActive, now, IDLE_STOP_MS)) {
        st.idle = true;
        elRoot.dataset.idle = "1";
        return;
      }
      st.raf = requestAnimationFrame(frame);
    }

    /** 逐字进度：档位 + 该亮的字素 + 自检用的可观测属性（只在变化时写 DOM） */
    function updateProgress(pos) {
      const g = st.graphemes.length;
      const cur = lyricsLine();
      if (g <= 0) return;
      if (st.uniformLine) {
        // 没有字级歌词（或下标对不上）：整行一起亮
        for (let i = 0; i < g; i += 1) st.levels[i] = 1;
        field.markLit(st.pool, st.count, g);
        setLit(g, g);
        return;
      }
      const lv = glyph.glyphLevels(cur?.words, g, pos, {
        lineEnd: nextLineTime(st.lines, st.lineIndex),
      });
      let changed = false;
      for (let i = 0; i < g; i += 1) {
        if (Math.abs((st.levels[i] || 0) - lv[i]) > 0.02) changed = true;
        st.levels[i] = lv[i];
      }
      const lit = glyph.litGroups(cur?.words, g, pos);
      field.markLit(st.pool, st.count, lit);
      if (changed) setVar("--rb-progress", lv[g - 1].toFixed(2));
      setLit(lit, g);
    }

    /** data-lit / data-glyphs：自检与排查用的可观测读数（值不变就不写） */
    function setLit(lit, total) {
      const v = `${lit}/${total}`;
      if (st.lastLit !== v) {
        st.lastLit = v;
        elRoot.dataset.lit = String(lit);
        elRoot.dataset.glyphs = String(total);
      }
    }

    /** 一帧的世界推进：找当前行 → 逐字档 → 物理 */
    function stepWorld(pos, dt) {
      const line = lineIndexAt(st.lines, pos);
      if (line !== st.lineIndex) setActiveLine(line);
      const cur = lyricsLine();
      if (cur && st.lineIndex >= 0 && elRoot.dataset.line !== String(st.lineIndex)) {
        elRoot.dataset.line = String(st.lineIndex);
      }
      updateProgress(pos);
      const bass = bassOf();
      setVar("--rb-turb", bass.toFixed(3));
      if (st.pointer.active && st.interactive) {
        field.applyMagnet(st.pool, st.count, {
          x: st.pointer.x,
          y: st.pointer.y,
          radius: 74,
          strength: 6200,
        });
      }
      field.step(st.pool, st.count, dt, {
        bass,
        paused: !clock.playing,
        floor: st.rh - 6,
      });
      paintTimecode(pos, nowMs());
    }

    const spectrum = () => {
      try {
        // ★ 契约 v3：ctx.spectrum() 给的是快照 `{bands, at}`，不是裸数组
        //   （写漏 .bands 会静默拿到一个对象，所有频段读数恒为 0）
        return ctx.spectrum?.() || null;
      } catch {
        return null;
      }
    };

    /** 低频能量（0..1）—— 湍流的驱动量 */
    function bassOf() {
      const snap = spectrum();
      const bands = snap?.bands;
      if (!bands || !bands.length) return 0;
      return field.avgRange(bands, 0, 12);
    }

    function requestPaint() {
      // 任何一次宿主推送都能把循环拉起来（S6）
      wake();
    }

    function stop() {
      if (st.raf) cancelAnimationFrame(st.raf);
      st.raf = 0;
      st.last = 0;
      st.lastFrame = 0;
    }

    function wake() {
      st.lastActive = nowMs();
      st.idle = false;
      if (st.animations === false) {
        if (st.pool) snapToTargets();
        return;
      }
      if (!st.raf && st.alive) st.raf = requestAnimationFrame(frame);
    }

    /* ---------------------------------------------------------------------
       环境（动画开关 / 性能档 / 交互）
       --------------------------------------------------------------------- */
    function applyEnv() {
      const o = opts();
      const e = env();
      st.animations = o.animations !== false && e.reducedMotion !== true;
      st.interactive = o.interactive !== false;
      st.performanceMode = o.performanceMode === "performance";
      st.budgetFps = st.performanceMode ? BUDGET_FPS : 120;
      st.budgetMs = field.paintBudgetMs(BUDGET_FPS);
      elRoot.dataset.static = st.animations ? "0" : "1";
      elRoot.dataset.perf = st.performanceMode ? "1" : "0";
      elRoot.dataset.interactive = st.interactive ? "1" : "0";
      resizeCanvas();
      ensurePool();
      if (!st.animations) snapToTargets();
      else wake();
    }

    /* ---------------------------------------------------------------------
       交互：指针磁铁（interactive:false 时完全没有）
       --------------------------------------------------------------------- */
    const onMove = (ev) => {
      if (!st.interactive) return;
      const r = elCanvas.getBoundingClientRect();
      st.pointer.x = ev.clientX - r.left;
      st.pointer.y = ev.clientY - r.top;
      st.pointer.active = true;
    };
    const onLeave = () => {
      st.pointer.active = false;
    };
    const onClick = (ev) => {
      if (!st.interactive) return;
      const line = lyricsLine();
      if (!line) return;
      const r = elCanvas.getBoundingClientRect();
      const band = st.rect;
      const y = ev.clientY - r.top;
      if (y < band.y - 24 || y > band.y + band.h + 24) return; // 只在字形带上响应
      ctx.actions?.seek?.(Number(line.time) || 0);
    };

    elCanvas.addEventListener("pointermove", onMove);
    elCanvas.addEventListener("pointerleave", onLeave);
    elCanvas.addEventListener("click", onClick);

    /* ---------------------------------------------------------------------
       首帧
       --------------------------------------------------------------------- */
    // 进度刻度
    for (let i = 0; i < TICKS; i += 1) {
      const tick = document.createElement("span");
      tick.className = "rb__tick";
      tick.dataset.on = "0";
      elTicks.appendChild(tick);
    }
    buildPassColors();
    applyEnv();
    elRoot.dataset.lod = "0";
    st.lines = Array.isArray(lyrics().lines) ? lyrics().lines : [];
    st.lineIndex = -1;
    syncLines({ force: true });
    paintSong();
    const pb0 = ctx.playback?.() || {};
    clock.set(pb0.position || 0, pb0.playing !== false, nowMs());
    st.duration = Number(song().duration) || Number(pb0.duration) || 0;
    setActiveLine(lineIndexAt(st.lines, clock.value(nowMs())), { animate: false });
    paintTimecode(Math.max(0, clock.value(nowMs()) - VISUAL_LAG_MS), nowMs());
    if (st.animations) wake();
    else snapToTargets();

    S = {
      ctx,
      st,
      elRoot,
      elCanvas,
      elDust,
      elEmpty,
      elTicks,
      bgRoot,
      clock,
      opts,
      lyrics,
      song,
      onMove,
      onLeave,
      onClick,
      applyEnv,
      paintSong,
      syncLines,
      requestPaint,
      stop,
      wake,
      setActiveLine,
      snapToTargets,
    };
  },

  update(ctx, patch) {
    if (!S || !S.st.alive) return;
    const type = patch?.type;

    switch (type) {
      case "mount":
        S.applyEnv();
        S.paintSong();
        S.syncLines({ force: true });
        S.wake();
        break;

      case "song": {
        const pb = ctx.playback?.() || {};
        S.clock.set(pb.position || 0, pb.playing !== false, nowMs());
        S.st.duration = Number((ctx.track?.() || {}).duration) || Number(pb.duration) || 0;
        S.paintSong();
        S.syncLines({ force: true });
        S.wake();
        break;
      }

      case "media":
        S.paintSong();
        S.syncLines();
        S.wake();
        break;

      case "lyrics":
        // 歌词换了：目标点缓存作废，行号强制重算
        S.syncLines({ force: true });
        S.wake();
        break;

      case "progress":
        S.clock.set(patch.position, patch.playing, nowMs());
        S.st.lastActive = nowMs();
        if (patch.playing !== false) S.st.idle = false;
        S.wake();
        break;

      case "state": {
        const pb = ctx.playback?.() || {};
        S.clock.set(pb.position, pb.playing, nowMs());
        S.wake();
        break;
      }

      case "options":
        S.applyEnv();
        S.syncLines();
        S.wake();
        break;

      case "resize":
        S.applyEnv();
        S.wake();
        break;

      case "visibility":
        if (patch.foreground === false) S.stop();
        else S.wake();
        break;

      case "close":
        S.stop();
        if (S.bgRoot) S.bgRoot.hidden = true;
        break;

      case "theme":
      case "chrome":
        S.wake();
        break;

      default:
        S.wake();
    }
  },

  /**
   * 卸载：宿主只清自己的挂载点，**整窗背景层的容器不清** ——
   * 必须自己把它恢复成"空且隐藏"，否则会留下孤儿背景图盖住界面。
   */
  destroy(ctx) {
    if (!S) return;
    const { st, elRoot, elCanvas, bgRoot, onMove, onLeave, onClick } = S;
    st.alive = false;
    if (st.raf) cancelAnimationFrame(st.raf);
    if (st.scatterTimer) clearTimeout(st.scatterTimer);
    if (st.backdropTimer) clearTimeout(st.backdropTimer);
    if (st.prefetchTimer) clearTimeout(st.prefetchTimer);
    st.raf = 0;
    elCanvas.removeEventListener("pointermove", onMove);
    elCanvas.removeEventListener("pointerleave", onLeave);
    elCanvas.removeEventListener("click", onClick);
    st.cache.clear();
    st.pool = null;
    st.pass = null;
    st.px = null;
    st.groupOf = null;
    st.buckets = null;
    st.coverData = null;
    st.off = null;
    st.off2d = null;
    st.g2d = null;
    st.passColors = [];
    elRoot.removeAttribute("style");
    elRoot.innerHTML = "";
    if (bgRoot) {
      bgRoot.innerHTML = "";
      bgRoot.hidden = true;
    }
    if (ctx?.root) ctx.root.innerHTML = "";
    S = null;
  },
};

/** 行号：最后一条 time ≤ pos 的行（lines 已按时间升序）。 */
function lineIndexAt(lines, pos) {
  const list = Array.isArray(lines) ? lines : [];
  let found = -1;
  for (let i = 0; i < list.length; i += 1) {
    if ((Number(list[i]?.time) || 0) <= pos) found = i;
    else break;
  }
  return found < 0 && list.length ? 0 : found;
}

/** 下一行的起始时间（末字时长的上限） */
function nextLineTime(lines, index) {
  const list = Array.isArray(lines) ? lines : [];
  const t = Number(list[index + 1]?.time);
  return Number.isFinite(t) && t > 0 ? t : Infinity;
}
