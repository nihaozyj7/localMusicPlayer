/* ==========================================================================
   rubbing/skin.js — 第三方样式「拓印」
   --------------------------------------------------------------------------
   一句话：**在纸上先压出一行灰字，再用这张封面的彩色颗粒一粒一粒把它填满。**

   与上一版的区别（都是按实际观感反馈改的）：

     · **灰字底层**：整句歌词先以灰色 fillText 画在画布上（位置与字号由
       glyph.baseGeometry 给出 —— 和粒子目标点**共用同一个掩码、同一次
       fitPoints 缩放**），所以字一直都在、一眼就能读出来；
     · **逐粒填充**：粒子的位置是**歌曲位置的纯函数**（`field.step`），
       每一粒有自己的 `inkAt`（何时起飞）与 `fly`（飞多久）。唱到哪，哪里的
       灰字就被彩色颗粒盖住 —— 逐字、逐行是"填"出来的，不是"聚"出来的；
     · **跟得上节奏**：单粒落定时间 ≤ fly（默认 150~240ms），且 `inkAt` 落在
       "字素窗口 − fly"之内，所以一个字唱完时它的粒子**一定已经全部落定**；
       旧版弹簧的时间常数约 2.5s，永远在半路；
     · **看得清**：粒子颜色不再按封面亮度取灰阶（暗封面会取到一团深灰），
       而是取封面色相并拉进可见的饱和度/明度带（`palette.vividRamp`），
       同一句话天然是多色的；
     · **真的填满**：落定的颗粒半径 ×1.85（`field.GRAIN`）—— 粒子数按舞台面积算，
       一句话的笔画面积是它的二十倍，颗粒不放大就只能盖住 30%，那是"撒彩砂"；
     · **点击不再跳进度**：界面上只有当前这一句，跳转没有意义 —— 已移除。

   极限轴：**图像数据化 + 粒子物理**。设计规格见
   plugins/style/pending-designs.md 02。

   与宿主的分工（契约 v3）：
     · 数据只从 ctx 拿，动作只走 ctx.actions；本包零裸包名 import；
     · 整窗背景层的内容是本包填的（容器是宿主的），卸载时自己清空并隐藏；
     · 字素切分走 ctx.sdk.splitGraphemes（必须与宿主同一份切法，
       否则 words 下标对不上）；
     · 宿主壳配色只有一条合法通道：清单 colors + ctx.actions.reportBackdrop()。

   ★ 子模块必须 `await import()` 并透传入口的 ?t= token
     `/skins/` 逐文件鉴权；ES 模块解析相对说明符会丢掉 query，静态 import
     会去请求没有 token 的 `/skins/rubbing/lib/*.js` → 403。浏览器预览没有
     query，透传空串，退化成普通相对导入。

   ★ 性能纪律（本款是七款里唯一"每帧画上万个图元"的）
     · 粒子状态全在定长类型化数组里（SoA），运行期零分配、零 new；
     · 画布绘制按 **色桶 × 状态档** 分批（6 × 3 = 18 次 fillStyle + N 次 fillRect），
       绝不逐粒子上色；
     · 灰字底层是每帧一次 fillText（比再画一万个点便宜得多，且永远清晰）；
     · 自己量每帧的画布耗时（EMA），连续两帧超预算就退档
       （lod 0→3：粒子数 ×1 / ×0.66 / ×0.45 / ×0.30，后两档同时半分辨率）；
     · 只有一条 rAF；暂停 6 秒停帧（暂停期间灰尘继续下沉，不是冻结）；
       performance 档按清单 budgetFps 限帧；animations:false / 减少动效时
       粒子直接落在目标上，只画一帧。
   ========================================================================== */

const Q = new URL(import.meta.url).search;
const load = (file) => import(`./lib/${file}${Q}`);

const palette = await load("palette.js");
const glyph = await load("glyph.js");
const field = await load("field.js");

/** 暂停后停帧的时长（宿主约定，见 docs/37） */
const IDLE_STOP_MS = 6000;
/**
 * 填充的**提前量**：让颗粒比声音早一点点落定。
 * 落定本身还要 fly（150~240ms），两者相抵之后画面与歌声基本同时到。
 */
const FILL_LEAD_MS = 90;
/** 清单 performance.budgetFps 的同源值 */
const BUDGET_FPS = 45;
/** 封面采样画布（色板与粒子取色都从这张来；96 以上收益很小） */
const COVER_N = 64;
/** 字形掩码尺寸：跟随字形带，缩放到差不多 1:1 —— 灰字清晰、目标点也细 */
const MASK_MIN_W = 420;
const MASK_MAX_W = 1280;
const MASK_MIN_H = 150;
const MASK_MAX_H = 460;
/** 掩码字号占掩码高度的比例（再宽的句子会自动缩到掩码宽度的 96%） */
const MASK_FONT_RATIO = 0.78;
/** 颜色桶数（vividRamp 的档数）与状态档数（灰尘/飞行/落定） */
const BUCKETS = 6;
const LEVELS = field.LEVELS;
/** 灰字底层的底色不透明度（在近黑底上约 4:1，100px 以上的字足够读） */
const BASE_ALPHA = 0.52;
/** 目标点缓存的条数（一句一条；前后句来回跳时不重算） */
const CACHE_MAX = 8;
/** 下一句提前算好的提前量 */
const PREFETCH_MS = 240;
/** 切句时的画面淡入时长（用指数趋近，与帧率无关） */
const FADE_RATE = 11;

const FONT_STACK = '"Segoe UI", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';

const SHELL = `
  <div class="rb">
    <canvas class="rb__canvas" aria-hidden="true"></canvas>
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

/** 空歌词列表的**稳定引用**（用它做 `===` 判断才不会每次推送都重算行号） */
const EMPTY_LINES = Object.freeze([]);

/** 当前实例（换样式会先 destroy 再 mount） */
let S = null;

function nowMs() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function clamp(v, a, b) {
  const n = Number(v);
  if (!Number.isFinite(n)) return a;
  return n < a ? a : n > b ? b : n;
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
      words: null,
      uniformLine: true,
      spans: { start: new Float32Array(0), end: new Float32Array(0), uniform: true },
      base: null,
      baseColor: "#e8e2d6",
      hasLyrics: false,
      pos: 0,
      bass: 0,
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
      // 离屏掩码
      off: null,
      off2d: null,
      offW: 0,
      offH: 0,
      passRgb: null,
      passColors: [],
      fadeDrawn: -1,
      fade: 1,
      sink: 0,
      pointer: { x: 0, y: 0, active: false },
      // 计时器
      burstTimer: 0,
      backdropTimer: 0,
      backdropPending: null,
      prefetchTimer: 0,
      lastTc: "",
      lastTick: -1,
      lastLit: "",
      lastBase: "",
      lastFill: -1,
      emptyText: "@@",
      cache: new Map(),
      rng: glyph.mulberry32(0x5eed1234),
    };

    const opts = () => ctx.options?.() || {};
    const media = () => ctx.media?.() || {};
    const song = () => ctx.track?.() || html.EMPTY_TRACK || {};
    const lyrics = () => media().lyrics || {};
    const env = () => ctx.env?.() || { width: 0, height: 0, dpr: 1, reducedMotion: false };
    const lyricsLine = () => (st.lineIndex >= 0 ? st.lines[st.lineIndex] : null);

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
       不外推的话填充是一跳一跳的）
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
      // 壳文字色 / 灰字底层色：在亮/暗两套里挑**对比度更高**的那套
      const light = [242, 236, 224];
      const dark = [18, 16, 14];
      const fg =
        palette.contrastWith(backdrop, light) >= palette.contrastWith(backdrop, dark) ? light : dark;
      setVar("--rb-fg", palette.toHex(fg));
      st.baseColor = palette.toHex(fg);
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

    /**
     * 18 个批次的填充色：6 个色桶 × 3 个状态档（灰尘 / 飞行 / 落定）。
     *
     * ★ 颜色只由**色桶**决定（多色沙来自封面的色相），亮度与不透明度只由
     *   **状态档**决定 —— 旧版按封面亮度取灰阶，暗封面会取到一团看不清的深灰。
     */
    function buildPassColors() {
      const ramp = st.pal?.ramp?.length ? st.pal.ramp : palette.PIGMENTS;
      const rgb = new Array(BUCKETS * LEVELS);
      for (let b = 0; b < BUCKETS; b += 1) {
        const base = ramp[b % ramp.length] || [200, 200, 200];
        // 灰尘：压暗、压淡（它是"纸上的沙"，不该盖住灰字）
        rgb[b * LEVELS + field.LEVEL_DUST] = [...palette.mix(base, [12, 11, 10], 0.68), 0.18];
        // 飞行中：本色
        rgb[b * LEVELS + field.LEVEL_FLY] = [...base, 0.8];
        // 落定：稍微提亮（字要立起来）
        rgb[b * LEVELS + field.LEVEL_INK] = [...palette.mix(base, [255, 248, 236], 0.3), 1];
      }
      st.passRgb = rgb;
      st.fadeDrawn = -1;
      applyPassFade();
    }

    /** 切句淡入：把 18 条 rgba 字符串按当前 fade 重拼（只在 fade 变化时做） */
    function applyPassFade() {
      const f = st.fade;
      const out = new Array(st.passRgb.length);
      for (let i = 0; i < st.passRgb.length; i += 1) {
        const c = st.passRgb[i];
        out[i] = `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${(c[3] * f).toFixed(3)})`;
      }
      st.passColors = out;
      st.fadeDrawn = f;
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
        applyPalette(
          palette.paletteFrom(data, COVER_N, COVER_N, {
            buckets: BUCKETS,
            fallback: { dark: [13, 12, 11], light: [232, 226, 214], accent: [185, 163, 126] },
          })
        );
        // 换封面 = 整幅画换色 → 重新给目标点上色
        if (st.text) {
          st.cache.clear();
          computeTargets(st.text, st.graphemes, { force: true });
        }
      } catch {
        st.coverData = null;
        applyPalette(
          palette.paletteFrom(null, COVER_N, COVER_N, {
            buckets: BUCKETS,
            fallback: { dark: [13, 12, 11], light: [232, 226, 214], accent: [185, 163, 126] },
          })
        );
      }
    }

    /* ---------------------------------------------------------------------
       文字 → 目标点（几何）
       --------------------------------------------------------------------- */
    /** 掩码尺寸跟随字形带：缩放比接近 1 → 灰字清晰、目标点也细 */
    function maskDims() {
      return {
        w: Math.round(clamp(st.rect.w, MASK_MIN_W, MASK_MAX_W)),
        h: Math.round(clamp(st.rect.h * 0.9, MASK_MIN_H, MASK_MAX_H)),
      };
    }

    function ensureOffscreen(w, h) {
      if (st.off && st.offW === w && st.offH === h) return;
      st.off = document.createElement("canvas");
      st.off.width = w;
      st.off.height = h;
      st.offW = w;
      st.offH = h;
      st.off2d = st.off.getContext("2d", { willReadFrequently: true });
    }

    /**
     * 把一行文字画进离屏画布并抽出目标点（一次性，带缓存）。
     *
     * @param {string} text
     * @param {number} graphemes 该行的字素数（决定按 x 切几段）
     * @param {{force?:boolean, apply?:boolean}} [opts] apply:false 只填缓存、
     *   不动粒子池 —— 预取下一句时必须这样，否则粒子会提前 240ms 跑到下一句的字形上
     */
    function computeTargets(text, graphemes, { force = false, apply = true } = {}) {
      const count = st.count || particleTarget();
      const key = `${text}|${count}|${st.rect.w}x${st.rect.h}|${st.coverKey ? "c" : "d"}`;
      let entry = force ? null : st.cache.get(key);
      if (!entry) {
        entry = buildEntry(text, graphemes, count);
        if (entry) {
          if (st.cache.size >= CACHE_MAX) st.cache.delete(st.cache.keys().next().value);
          st.cache.set(key, entry);
        }
      }
      if (!entry) return null;
      // ★ 几何与时刻表**必须一起换**：applyGeometry 会重写 pool.g / st.groupOf，
      //   而"哪一粒属于哪个字、什么时候起飞"是读 st.groupOf 算出来的。只换几何
      //   不重排时刻表，粒子就会按**旧的随机分组**去飞 —— 表现是每个字都有几粒
      //   提前落定、整行一起亮，逐字效果静默失效（曾经就是这样：换封面时重新
      //   建了 entry，却只调了 applyGeometry）。
      if (apply) {
        applyGeometry(entry, count);
        applyInk();
      }
      return entry;
    }

    /* ---------------------------------------------------------------------
       工具
       --------------------------------------------------------------------- */

    /** FNV-1a 32 位：把字符串变成稳定的随机种子（同输入永远同输出） */
    function hashSeed(s) {
      let h = 2166136261;
      for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }

    /** 离屏渲染 → 掩码 → 目标点 / 分组 / 色桶 / 灰字几何 */
    function buildEntry(text, graphemes, count) {
      // ★ graphemes 可能是字素数组（splitGraphemes 的返回），也可能是个数。
      //   直接把数组喂进 Math.max / 数学运算会得到 NaN，而 NaN 写进 Uint8Array
      //   会全变成 0 —— 表现是"整行在一个窗口里填完"，逐字效果静默消失。
      const gn = Array.isArray(graphemes) ? graphemes.length : Math.round(Number(graphemes) || 0);
      const md = maskDims();
      ensureOffscreen(md.w, md.h);
      const g = st.off2d;
      if (!g || !text) return null;
      // ★ 这一"层"的全部随机性都来自按 (文本, 粒子数, 掩码尺寸) 派生的**确定性**
      //   随机流：换封面会重建 entry（色桶要从新封面取色），如果这里用每次都往前
      //   走的全局 rng，重建后目标点会整体换一套 —— 封面加载完那一下画面会跳。
      const rnd = glyph.mulberry32(hashSeed(`${text}|${count}|${md.w}x${md.h}`));
      g.clearRect(0, 0, md.w, md.h);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#fff";
      let size = Math.min(md.h * MASK_FONT_RATIO, 240);
      g.font = `600 ${size}px ${FONT_STACK}`;
      const w0 = g.measureText(text).width || 1;
      if (w0 > md.w * 0.96) {
        size = Math.max(11, size * ((md.w * 0.96) / w0));
        g.font = `600 ${size}px ${FONT_STACK}`;
      }
      g.fillText(text, md.w / 2, md.h / 2);
      const data = g.getImageData(0, 0, md.w, md.h).data;
      const cov = glyph.coverageFromAlpha(data, md.w, md.h, { alphaMin: glyph.INK_ALPHA, dilate: 1 });
      const stats = glyph.maskStats(cov.mask, md.w, md.h);
      const idx = glyph.inkIndex(cov.mask);
      const norm = glyph.pickTargets(idx, { w: md.w, h: md.h }, count, rnd, st.px);
      // ★ 这三个都必须在 fitPoints 之前做完：fitPoints 会**原地**把 st.px
      //   从归一化坐标改写成舞台像素坐标（norm 是它的视图）。
      const groupOf = glyph.groupByX(norm, count, Math.max(1, gn));
      // 每粒色桶：封面同位像素的色相 → 最近的彩色档；缺失/灰阶 → 随机
      const ramp = st.pal?.ramp?.length ? st.pal.ramp : palette.PIGMENTS;
      const buckets = new Int32Array(count);
      const cd = st.coverData;
      for (let k = 0; k < count; k += 1) {
        let px = null;
        if (cd) {
          const u = Math.min(COVER_N - 1, Math.max(0, Math.floor(norm[k * 2] * COVER_N)));
          const v = Math.min(COVER_N - 1, Math.max(0, Math.floor(norm[k * 2 + 1] * COVER_N)));
          const i = (v * COVER_N + u) * 4;
          px = [cd[i], cd[i + 1], cd[i + 2]];
        }
        buckets[k] = palette.bucketForPixel(ramp, px, rnd);
      }
      const pts = glyph.fitPoints(norm, count, st.rect, stats, st.px);
      const base = glyph.baseGeometry(stats, st.rect, { w: md.w, h: md.h }, size);
      base.alpha = BASE_ALPHA;
      return { pts: Float32Array.from(pts), groupOf, buckets, stats, size, base };
    }

    /** 目标点写进粒子池 + 记下灰字几何 */
    function applyGeometry(entry, count) {
      st.base = entry.base;
      setBaseAttr(entry.base);
      if (!st.pool) return;
      for (let i = 0; i < count; i += 1) {
        const k = i % (entry.pts.length >> 1);
        st.px[i * 2] = entry.pts[k * 2];
        st.px[i * 2 + 1] = entry.pts[k * 2 + 1];
        st.groupOf[i] = entry.groupOf[k];
        st.buckets[i] = entry.buckets[k];
      }
      field.assignTargets(st.pool, count, st.px, st.groupOf, { colors: st.buckets });
    }

    /** 逐粒填充时刻表（依赖当前这句的 words，换句才重排） */
    function applyInk() {
      const g = st.graphemes.length;
      st.spans = glyph.charSpans(st.uniformLine ? null : st.words, g, {
        lineStart: Number(lyricsLine()?.time) || 0,
        lineEnd: nextLineTime(st.lines, st.lineIndex),
      });
      if (!st.pool) return;
      if (!g) {
        field.clearFill(st.pool, st.count);
        return;
      }
      // 时刻表也用确定性随机流：几何没变时重排的结果与上次逐粒相同，
      // 于是"重新算一遍"永远不会有副作用（换封面 / 改尺寸都能安全重入）。
      const rnd = glyph.mulberry32(hashSeed(`ink|${st.text}|${g}|${st.count}`));
      glyph.inkSchedule(st.groupOf, st.count, st.spans, rnd, st.pool.inkAt, st.pool.fly, {
        flyMs: 150,
        flyJitterMs: 90,
        minWindowMs: glyph.MIN_WINDOW_MS,
        leadMs: FILL_LEAD_MS,
      });
    }

    /** 尺寸 / 粒子数变了：目标点与时刻表都得按新几何重算（computeTargets 会一起换） */
    function refreshGeometry() {
      if (!st.text) {
        st.base = null;
        setBaseAttr(null);
        return;
      }
      computeTargets(st.text, st.graphemes);
    }

    /**
     * 把灰字底层的几何挂到 dataset 上（自检与排查用）。
     * ★ 这是这一款唯一"读得出来"的东西：灰字是画在画布里的，
     *   没有 DOM 文本层可以查，所以必须自己报出来。
     */
    function setBaseAttr(base) {
      const v = base
        ? `${Math.round(base.x)},${Math.round(base.y)},${Math.round(base.fontSize)}`
        : "";
      if (st.lastBase === v) return;
      st.lastBase = v;
      if (v) elRoot.dataset.base = v;
      else delete elRoot.dataset.base;
    }

    /** 歌词行 + 空态（无歌 / 无歌词 / 加载中 / 匹配失败都要有明确画面） */
    function syncLines({ force = false } = {}) {
      const ly = lyrics() || {};
      const lines = Array.isArray(ly.lines) ? ly.lines : EMPTY_LINES;
      if (force || lines !== st.lines) {
        st.lines = lines;
        st.lineIndex = -1;
        if (force) st.cache.clear();
      }
      const has = !!(song().id && lines.length) && opts().showLyrics !== false;
      const text = has
        ? ""
        : opts().showLyrics === false
          ? ""
          : song().id
            ? html.lyricsEmptyText?.(ly) || ""
            : html.lyricsEmptyText?.({ status: "none" }) || "";
      if (text !== st.emptyText) {
        st.emptyText = text;
        elEmpty.textContent = text;
      }
      elEmpty.hidden = has || !text;
      elCanvas.hidden = !has;
      elRoot.dataset.empty = has ? "0" : "1";
      // ★ 只有"真的有歌词要显示"时才让帧循环跟踪行号 ——
      //   否则 showLyrics:false 时帧循环会在下一帧把行重新选回来、把灰字又画出来
      st.hasLyrics = has;
      if (!has) {
        st.text = "";
        st.graphemes = [];
        st.words = null;
        st.uniformLine = true;
        st.lineIndex = -1;
        st.base = null;
        setBaseAttr(null);
        if (st.pool) field.clearFill(st.pool, st.count);
      }
      return has;
    }

    /** 当前行使灰尘"散一次"，再用新目标重新排布（切句的动作） */
    function burstLine() {
      const c = st.count || particleTarget();
      field.burst(st.pool, c, st.rng, 300);
      setVar("--rb-flux", "1");
      if (st.burstTimer) clearTimeout(st.burstTimer);
      st.burstTimer = setTimeout(() => {
        st.burstTimer = 0;
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
      st.words = Array.isArray(line?.words) ? line.words.map((v) => Number(v) || 0) : null;
      st.uniformLine = !(st.words && st.words.length === graphemes.length);
      if (!st.pool) ensurePool();
      if (text) computeTargets(text, graphemes);
      else {
        st.base = null;
        setBaseAttr(null);
        applyInk(); // 没有文字：把整池退回成沙（computeTargets 没被调用，得自己来）
      }
      if (changed && animate && st.animations) {
        st.fade = 0.25;
        burstLine();
      }
      elRoot.dataset.glyphs = String(graphemes.length);
      elRoot.dataset.line = String(index);
      // 下一句提前离屏渲染好（**只填缓存**，不动粒子池）
      if (st.prefetchTimer) clearTimeout(st.prefetchTimer);
      const next = st.lines[index + 1];
      if (next?.text) {
        st.prefetchTimer = setTimeout(() => {
          st.prefetchTimer = 0;
          if (!st.alive || !st.text) return;
          const nt = String(next.text);
          computeTargets(nt, ctx.sdk.splitGraphemes(nt), { apply: false });
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
      const fade = st.fade;
      // ── 1) 灰字底层 ────────────────────────────────────────────────
      // 位置/字号与粒子目标点同源（glyph.baseGeometry），所以粒子一定落在字上。
      // 它一直画着：**没被填到的部分就是灰的、但仍然读得清**。
      if (st.base && st.base.alpha > 0.01) {
        g.globalAlpha = st.base.alpha * fade;
        g.fillStyle = st.baseColor;
        g.font = `600 ${st.base.fontSize}px ${FONT_STACK}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(st.text, st.base.x, st.base.y);
        g.globalAlpha = 1;
      }
      // ── 2) 彩色颗粒 ────────────────────────────────────────────────
      const pos = st.pos;
      let inked = 0;
      for (let i = 0; i < n; i += 1) {
        const e = pool.ev[i];
        if (e >= 1) inked += 1;
        st.pass[i] = pool.c[i] * LEVELS + (e <= 0 ? field.LEVEL_DUST : e >= 1 ? field.LEVEL_INK : field.LEVEL_FLY);
      }
      setFill(inked, n);
      const passes = BUCKETS * LEVELS;
      for (let p = 0; p < passes; p += 1) {
        // 批次号 = 色桶 × 档数 + 档位，所以 p % LEVELS 就是档位（见 field.GRAIN）
        const gain = field.GRAIN[p % LEVELS];
        g.fillStyle = st.passColors[p] || "rgba(200,200,200,.5)";
        for (let i = 0; i < n; i += 1) {
          if (st.pass[i] !== p) continue;
          const r =
            pool.r[i] * gain * (1 + field.LAND_FLASH * field.landFlash(pos, pool.inkAt[i], pool.fly[i]));
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
        refreshGeometry();
        if (!st.animations) snapToTargets();
      }
    }

    /** animations:false / 减少动效：粒子正好落在目标上，只画这一帧 */
    function snapToTargets() {
      if (!st.pool) return;
      const pos = Math.max(0, clock.value(nowMs()) + FILL_LEAD_MS);
      st.pos = pos;
      // ★ 静态档（关动效）不读频谱：它一帧就画完了，读频谱等于白叫一次宿主
      //   （自检用"频谱调用次数"当"画了几帧"，静态档必须是 0 才不会误报）
      st.bass = 0;
      updateProgress(pos);
      field.restJitter(st.pool, st.count);
      field.step(st.pool, st.count, 1 / 60, {
        pos,
        bass: 0,
        paused: !clock.playing,
        sink: clock.playing ? 0 : 1,
        floor: st.rh - 6,
        turbulence: false,
      });
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
      const dt = dtMs / 1000;
      st.lastFrame = now;
      st.last = now;
      const playing = clock.playing;
      st.sink = field.sinkStep(st.sink, !playing, dt);
      // 填充用"歌曲位置 + 提前量"，与墙钟外推同一口径
      const pos = Math.max(0, clock.value(now) + FILL_LEAD_MS);
      st.pos = pos;
      st.bass = bassOf();
      // 当前句：换行是**唯一**会重算目标点/时刻表的入口
      if (st.hasLyrics) {
        const idx = lineIndexAt(st.lines, pos);
        if (idx !== st.lineIndex) setActiveLine(idx);
      }
      updateProgress(pos);
      if (st.pointer.active && st.interactive) {
        field.applyMagnet(st.pool, st.count, {
          x: st.pointer.x,
          y: st.pointer.y,
          radius: 74,
          strength: 6200,
        });
      }
      field.step(st.pool, st.count, dt, {
        pos,
        bass: st.bass,
        paused: !playing,
        sink: st.sink,
        floor: st.rh - 6,
      });
      // 切句淡入（指数趋近，与帧率无关）
      if (st.fade < 1) {
        st.fade = Math.min(1, st.fade + (1 - st.fade) * (1 - Math.exp(-FADE_RATE * dt)));
        if (1 - st.fade < 0.01) st.fade = 1;
      }
      if (Math.abs(st.fade - st.fadeDrawn) > 0.03) applyPassFade();
      drawFrame();
      if (st.animations === false) return;
      if (!playing && field.idleExpired(st.lastActive, now, IDLE_STOP_MS)) {
        st.idle = true;
        elRoot.dataset.idle = "1";
        return;
      }
      st.raf = requestAnimationFrame(frame);
    }

    /** 逐粒填充进度 + 自检用的可观测读数（只在变化时写 DOM） */
    function updateProgress(pos) {
      const g = st.graphemes.length;
      if (g <= 0) return;
      const lit = st.uniformLine ? g : glyph.litGroups(st.words, g, pos);
      setLit(lit, g);
      setVar("--rb-turb", (st.bass || 0).toFixed(3));
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

    /**
     * data-fill：**已经填到位的粒子比例**（0..1，千分之一分档才写 DOM）。
     *
     * 为什么要有这个读数：像素数不能当"填充进度"用 —— 刚落定的粒子会闪一下
     * （落地的半径放大 LAND_FLASH 倍），像素数会随闪光起落，"逐粒填充"就被
     * 闪光的噪声盖住了。这个比例是严格单调的：`ev = ease((pos-inkAt)/fly)`
     * 对每个粒子都随 pos 非减。
     */
    function setFill(inked, total) {
      const v = total > 0 ? Math.round((inked / total) * 1000) : 0;
      if (st.lastFill === v) return;
      st.lastFill = v;
      elRoot.dataset.fill = (v / 1000).toFixed(3);
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
      // 任何一次宿主推送都能把循环拉起来
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
      refreshGeometry();
      if (!st.animations) snapToTargets();
      else wake();
    }

    /* ---------------------------------------------------------------------
       交互：指针磁铁（interactive:false 时完全没有）
       ★ 这里**没有**点击跳进度：界面上只有当前这一句，跳转没有意义。
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

    elCanvas.addEventListener("pointermove", onMove);
    elCanvas.addEventListener("pointerleave", onLeave);

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
    applyPalette(
      palette.paletteFrom(null, COVER_N, COVER_N, {
        buckets: BUCKETS,
        fallback: { dark: [13, 12, 11], light: [232, 226, 214], accent: [185, 163, 126] },
      })
    );
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
    paintTimecode(Math.max(0, clock.value(nowMs()) + FILL_LEAD_MS), nowMs());
    if (st.animations) wake();
    else snapToTargets();

    S = {
      ctx,
      st,
      elRoot,
      elCanvas,
      elEmpty,
      elTicks,
      bgRoot,
      clock,
      opts,
      lyrics,
      song,
      onMove,
      onLeave,
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
    const { st, elRoot, elCanvas, bgRoot, onMove, onLeave } = S;
    st.alive = false;
    if (st.raf) cancelAnimationFrame(st.raf);
    if (st.burstTimer) clearTimeout(st.burstTimer);
    if (st.backdropTimer) clearTimeout(st.backdropTimer);
    if (st.prefetchTimer) clearTimeout(st.prefetchTimer);
    st.raf = 0;
    elCanvas.removeEventListener("pointermove", onMove);
    elCanvas.removeEventListener("pointerleave", onLeave);
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
    st.passRgb = null;
    st.passColors = [];
    st.base = null;
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
