/* ==========================================================================
   ninja/skin.js — 第三方样式「水果忍者」
   --------------------------------------------------------------------------
   一句话：**当前这句歌词的每个字都是一枚被抛起来的水果；唱到哪个字，
   一道刀光就把那枚水果劈成两半，果汁顺着案板渗开、把那个字染亮。**

   为什么这么映射（这是这一款唯一真正的设计决定）：

     · 契约里**唯一的高精度时间源**是 `lyrics.lines[].words`（每个字素一个起始
       毫秒，与 `sdk.splitGraphemes` 一一对应）。水果忍者的"切"正好需要一个
       一击即中的时刻 —— 于是「顶点时刻 == 切开时刻 == 该字起唱」，
       整条链只有一个时间输入（位置是纯函数），拖进度条也不会错位。
     · 抛物线在**顶点处速度为 0**：水果被抛到位、刀同时到，读起来才是"切"，
       而不是"扫过去"。切开之后两半沿刀口法线分离、重力下坠，
       果汁正好落在下面那个字上。
     · **歌词始终是 DOM 文本**（不是画在 canvas 上的）：字要一直读得清 ——
       未唱到的是"果皮拓印在案板上的凹痕"（对比度由 palette.unlitOf 兜住），
       唱到的部分由一层沿 X 推进的果汁渐变 `background-clip: text` 染亮。
       文字在 canvas 之上（z-index），果汁粒子从字**背后**落下 —— 可读性优先。

   极限轴：**程序化实体 + 斩击物理**（不带任何图片素材）。设计规格见
   plugins/style/pending-designs.md 08。

   与宿主的分工（契约 v3）：
     · 数据只从 ctx 拿，动作只走 ctx.actions（这一款只用 reportBackdrop ——
       见下"为什么没有 seek"）；本包零裸包名 import；
     · 整窗背景层的内容是本包填的（容器是宿主的），卸载时自己清空并隐藏；
     · 字素切分走 ctx.sdk.splitGraphemes（必须与宿主同一份切法，否则 words 下标对不上）；
     · 宿主壳配色只有一条合法通道：清单 colors + ctx.actions.reportBackdrop()。

   ★ 为什么**没有** `ctx.actions.seek`：指针在这个舞台上是**刀**（划过水果会
     提前把它劈开），把点击同时绑成"跳进度"会让每次挥刀都可能误跳
     （rubbing 的先例也是"去掉 seek"，用户已确认）。要跳进度请用宿主的进度条。

   ★ 子模块必须 `await import()` 并透传入口的 ?t= token
     `/skins/` 逐文件鉴权；ES 模块解析相对说明符会丢掉 query，静态 import
     会去请求没有 token 的 `/skins/ninja/lib/*.js` → 403。浏览器预览没有 query，
     透传空串，退化成普通相对导入。lib 之间**也不许**互相 import（同理会丢 token
     并二次加载），依赖一律当参数注入。

   ★ 帧循环纪律：只有一条 `requestAnimationFrame`；暂停 6 秒停帧；
     `env().foreground === false` 停帧（宿主**不推** visibility 补丁，所以是现取
     env，不是等补丁）；`animations:false` / `reducedMotion` 一帧都不起
     （补丁来了画一帧静态画面）；`performanceMode === "performance"` 按清单
     budgetFps 限帧。

   ★ 视觉坑（都是本项目别的样式用真机代价换来的，这里直接照做）：
     · 自定义属性在 `getComputedStyle` 里拿到的是**原样 token 流**
       （`--skin-inset-top` 是 `calc(36px + 52px)`），**不许 parseFloat** ——
       所以安全区一律由 CSS 结构化地让开（`.nj__field` 的 top/bottom 就是两条
       带子的内沿，HUD 两排也各自让开），JS 只用 `getBoundingClientRect`
       量位置来对齐画布。
     · `ctx.spectrum()` 给的是 `{bands, at}` 快照，不是裸数组。
     · `performanceMode` 是**字符串** `"smooth" | "performance"`，不能 Boolean()。
     · 要给人读的东西（歌词 / HUD / 连击 / 分数）**不许画进 --skin-inset-* 两条
       带子里**；装饰（水果 / 果汁 / 刀光 / 炸弹）不受限。
   ========================================================================== */

const Q = new URL(import.meta.url).search;
const load = (file) => import(`./lib/${file}${Q}`);

const util = await load("util.js");
const palette = await load("palette.js");
const timeline = await load("timeline.js");
const fruit = await load("fruit.js");
const juice = await load("juice.js");

/** 暂停后停帧的时长（宿主约定，见 docs/37） */
const IDLE_STOP_MS = 6000;
/** 清单 performance.budgetFps 的同源值 */
const BUDGET_FPS = 45;
/** 果汁池与两半池的容量（定长，运行期零分配） */
const JUICE_CAP = 1400;
const HALF_CAP = 48;
/** 一刀的果汁粒数（基准）与高频亮时追加的细沫 */
const JUICE_PER_CUT = 34;
const JUICE_MIST = 26;
/**
 * 只有落在这个窗口内的"到点"才算**现场切**的一刀（防拖进度条刷汁刷分）。
 *
 * 为什么是 560ms 而不是几十毫秒：`progress` 补丁是 4Hz 且位置被**量化到 250ms**，
 * 所以一帧之内的位置推进本来就可能到 250~500ms。窗口开得太小，正常播放时
 * 每几刀就会有一次被误判成"跳过来的"——表现是"水果切开了却没有果汁、也不加连击"，
 * 而且完全不报错。真正要挡的是**拖进度条**，那件事由下面的 SEEK_JUMP_MS 判。
 */
const LIVE_CUT_MS = 560;
/** 一帧之内位置跳超过它就当成"跳转"（拖进度条 / 长卡顿之后恢复）：只静默登记 */
const SEEK_JUMP_MS = 520;
/** 刀光与指针刀痕的存活时长 */
const SLASH_MS = 190;
const TRAIL_MS = 150;
/** 指针刀痕最多存几个点（一个点 = 2 个数） */
const TRAIL_POINTS = 18;
/**
 * 换句的**提前量**：下一句的 DOM 与水果要提前进场。
 *
 * 为什么必须提前：水果的飞行时长是 560ms（顶点 == 该字起唱），而一句的第一个字
 * 就是在这句的 `time` 上起唱 —— 如果等 `pos >= line.time` 才换句，第一个字的水果
 * 只剩 0ms 可飞（直接在顶点弹出来），"抛上来"这件事就整个看不见了。
 * 760ms = 飞行 560 + 切开延迟 40 + 余量，保证第一枚水果能完整飞完全程。
 * 往前换句只在**这一句唱完**之后才允许（否则上一句的字会提前消失）。
 */
const LINE_LEAD_MS = 760;
/** "划过"的判定余量：水果中心到刀痕线段的距离小于 半径 + 这个值 */
const TRAIL_HIT_PAD = 7;
/** 爆炸白闪时长 */
const FLASH_MS = 140;
/**
 * 果汁印在案板上的痕迹：**这一款唯一的"永久"东西**。
 *
 * 两个作用：① 一首歌下来案板会被染满（这是"在哪一句切过"的视觉记录）；
 * ② 画布在暂停 / 间奏里不再是空的 —— 水果、两半、汁都是"一瞬"的，
 *    没有印痕的话暂停时整块画布就是透明的（自检里量到过：窄窗/重开时 any=0）。
 */
const STAINT_LIFE_MS = 26000;
const MAX_STAINS = 44;
/** 封面采样画布 */
const COVER_N = 64;
/** 果盘倾向封面的比例（只偏 22%：偏多了西瓜就不是西瓜了） */
const TINT_SHIFT = 0.22;

const SHELL = `
  <div class="nj">
    <canvas class="nj__fx" aria-hidden="true"></canvas>
    <div class="nj__field">
      <div class="nj__lyric" aria-hidden="true"></div>
    </div>
    <div class="nj__hud">
      <div class="nj__hud-top">
        <span class="nj__title"></span>
        <span class="nj__badge">试听</span>
      </div>
      <div class="nj__hud-bottom">
        <span class="nj__hint">划过水果也能劈开它</span>
        <span class="nj__tc">00:00</span>
      </div>
    </div>
    <div class="nj__chips">
      <img class="nj__disc" alt="" />
      <span class="nj__score">0</span>
      <span class="nj__combo"><b class="nj__combo-n">0</b><i class="nj__combo-t">连击</i></span>
    </div>
    <div class="nj__empty"></div>
    <div class="nj__poster">
      <div class="nj__poster-title"></div>
      <div class="nj__poster-sub"></div>
    </div>
  </div>`;

const BG_SHELL = `
  <div class="njbg">
    <div class="njbg__wood" aria-hidden="true"></div>
    <div class="njbg__bamboo" aria-hidden="true"></div>
    <div class="njbg__glow" aria-hidden="true"></div>
    <div class="njbg__vig" aria-hidden="true"></div>
  </div>`;

/** 空歌词列表的**稳定引用**（用它做 `===` 判断才不会每次推送都重算方案） */
const EMPTY_LINES = Object.freeze([]);

/** 当前实例（换样式会先 destroy 再 mount） */
let S = null;

function nowMs() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

/* ==========================================================================
   mount
   ========================================================================== */
export default {
  id: "ninja",
  name: "水果忍者",

  mount(ctx) {
    const { html } = ctx.sdk;
    const stage = ctx.root;
    stage.innerHTML = SHELL;

    const elRoot = stage.querySelector(".nj");
    const elCanvas = stage.querySelector(".nj__fx");
    const elField = stage.querySelector(".nj__field");
    const elLyric = stage.querySelector(".nj__lyric");
    const elTitle = stage.querySelector(".nj__title");
    const elBadge = stage.querySelector(".nj__badge");
    const elTc = stage.querySelector(".nj__tc");
    const elDisc = stage.querySelector(".nj__disc");
    const elScore = stage.querySelector(".nj__score");
    const elCombo = stage.querySelector(".nj__combo");
    const elComboN = stage.querySelector(".nj__combo-n");
    const elEmpty = stage.querySelector(".nj__empty");
    const elPoster = stage.querySelector(".nj__poster");
    const elPosterTitle = stage.querySelector(".nj__poster-title");
    const elPosterSub = stage.querySelector(".nj__poster-sub");

    // 整窗背景层：容器由宿主给，内容本包填（卸载要自己收干净）
    const bgRoot = ctx.backgroundRoot || null;
    if (bgRoot) {
      bgRoot.innerHTML = BG_SHELL;
      bgRoot.hidden = false;
    }

    /* ---------------------------------------------------------------------
       状态（update / destroy 都只碰 st）
       --------------------------------------------------------------------- */
    const st = {
      ctx,
      alive: true,
      raf: 0,
      lastTick: 0,
      lastActive: nowMs(),
      idle: false,
      drew: 0,
      // 环境
      animations: true,
      interactive: true,
      performanceMode: false,
      foreground: true,
      narrow: false,
      hasLyrics: false,
      duration: 0,
      // 尺寸与几何
      dpr: 1,
      w: 0,
      h: 0,
      fieldTop: 0,
      lineY: 0,
      lineH: 0,
      groundY: 0,
      apexY: 0,
      floorY: 0,
      fs: 24,
      // 歌词与方案
      lines: [],
      lineIndex: -2,
      plan: null,
      kinds: null,
      seats: [],
      glyphX: new Float32Array(0),
      glyphY: new Float32Array(0),
      glyphEls: [],
      fills: new Float32Array(0),
      lastLit: -1,
      lastGlyphAttr: -1,
      lastFruits: -1,
      // 调色
      bowl: null,
      kindColors: [],
      inkRgb: [247, 236, 216],
      unlitRgb: [160, 150, 134],
      // 时钟与读数
      clock: timeline.createClock({ maxExtrapolate: 1200 }),
      combo: timeline.createCombo(),
      pos: 0,
      bass: 0,
      high: 0,
      flux: 0,
      fluxPeak: 0,
      fluxAvg: 0,
      // 特效（定长，不随帧增长）
      slashes: [],
      bursts: [],
      stains: [],
      carryBomb: null,
      activeBomb: null,
      flash: 0,
      flashAt: -1e9,
      trail: new Float64Array(TRAIL_POINTS * 2),
      trailAt: new Float64Array(TRAIL_POINTS),
      trailArr: new Array(TRAIL_POINTS * 2).fill(0),
      trailN: 0,
      // 池（定长、零分配）
      juicePool: juice.createJuicePool(JUICE_CAP),
      halfPool: juice.createHalfPool(HALF_CAP),
      rng: util.mulberry32(0x5eed1a7e),
      // 自适应降级
      lod: 0,
      paintAvg: -1,
      slowStreak: 0,
      startedAt: nowMs(),
      // 计时器与缓存
      backdropTimer: 0,
      backdropPending: null,
      coverKey: "",
      lastTc: "",
      lastScore: -1,
      lastComboShown: -1,
      lastCuts: -1,
      emptyText: "@@",
      vars: new Map(),
    };

    const opts = () => ctx.options?.() || {};
    const env = () => ctx.env?.() || { width: 0, height: 0, dpr: 1, reducedMotion: false };
    const media = () => ctx.media?.() || {};
    const song = () => ctx.track?.() || html.EMPTY_TRACK || {};
    const lyrics = () => media().lyrics || {};

    /** 只写变化过的自定义属性（每帧写一堆变量也是白花的） */
    function setVar(name, value) {
      const v = String(value);
      if (st.vars.get(name) === v) return;
      st.vars.set(name, v);
      elRoot.style.setProperty(name, v);
    }

    /** 只写变化过的 data-* 读数（自检与 CSS 都读它） */
    const attrCache = new Map();
    function setAttr(name, value) {
      const v = String(value);
      if (attrCache.get(name) === v) return;
      attrCache.set(name, v);
      elRoot.dataset[name] = v;
    }

    const g2d = elCanvas.getContext("2d", { alpha: true });

    /* ---------------------------------------------------------------------
       调色：封面 → 果盘
       --------------------------------------------------------------------- */
    function applyBowl(bowl) {
      st.bowl = bowl;
      const boardRgb = bowl.board;
      const ink = palette.inkOnBoard(boardRgb, bowl.fg, { min: 4.5 });
      const unlit = palette.unlitOf(ink.rgb, boardRgb, 0.42, 4.2);
      st.inkRgb = ink.rgb;
      st.unlitRgb = unlit.rgb;
      setVar("--nj-board", palette.toHex(boardRgb));
      setVar("--nj-fg", palette.toHex(ink.rgb));
      setVar("--nj-unlit", palette.toHex(unlit.rgb));
      setVar("--nj-juice", palette.toHex(bowl.juice));
      // 字用的果汁色比画布上的浅一档：深色封面下，原始果汁色（尤其蓝紫）写在
      // 木案板上只有 ~2.9:1 —— 艳是艳了，读不清。见 skin.css 的注释。
      setVar("--nj-juice-txt", palette.toHex(palette.mix(bowl.juice, [255, 246, 214], 0.4)));
      setVar("--nj-juice-2", palette.toHex(palette.mix(bowl.juice, [255, 246, 214], 0.62)));
      // 果盘：每个品种在这个色相下的实际颜色（绘制时直接查表，不在帧里算）
      const tint = (c) => palette.tintKind(c, bowl.hue, { gray: bowl.gray, shift: TINT_SHIFT });
      st.kindColors = fruit.KINDS.map((k) => fruit.kindColorsFor(k, tint));
      recolorSeats();
      st.backdropPending = {
        bg: palette.toHex(bowl.bg),
        fg: palette.toHex(ink.rgb),
        accent: palette.toHex(bowl.juice),
      };
      if (st.backdropTimer) return; // ≥300ms 防抖：轮播/连换封面不会打爆 IPC
      st.backdropTimer = setTimeout(() => {
        st.backdropTimer = 0;
        const payload = st.backdropPending;
        st.backdropPending = null;
        if (payload && st.alive) ctx.actions?.reportBackdrop?.(payload);
      }, 400);
    }

    function recolorSeats() {
      for (let k = 0; k < st.seats.length; k += 1) {
        const seat = st.seats[k];
        if (seat) seat.colors = st.kindColors[st.kinds?.[k]] || st.kindColors[0];
      }
    }

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
        applyBowl(palette.bowlFromCover(data, COVER_N, COVER_N));
      } catch {
        applyBowl(palette.bowlFromCover(null, 0, 0));
      }
      if (!st.animations) paintOnce();
    }

    /* ---------------------------------------------------------------------
       尺寸与几何
       --------------------------------------------------------------------- */
    function resize() {
      const e = env();
      const crect = elCanvas.getBoundingClientRect?.() || { width: 0, height: 0 };
      const w = Math.max(1, Math.round(crect.width || e.width || 1));
      const h = Math.max(1, Math.round(crect.height || e.height || 1));
      // dpr 按降级档收（后两档半分辨率；画布重设 = 一次清屏，所以档位本身是迟滞的）
      st.dpr = Math.max(0.5, Math.max(1, Math.min(2, Number(e.dpr) || 1)) * util.lodResolution(st.lod));
      st.w = w;
      st.h = h;
      const bw = Math.max(1, Math.round(w * st.dpr));
      const bh = Math.max(1, Math.round(h * st.dpr));
      if (elCanvas.width !== bw || elCanvas.height !== bh) {
        elCanvas.width = bw;
        elCanvas.height = bh;
      }
      st.narrow = w < 900;
      setAttr("narrow", st.narrow ? "1" : "0");
      setAttr("dpr", String(Math.round(Number(e.dpr) || 1)));
      st.paintAvg = -1;
      st.slowStreak = 0;
      relayout();
    }

    /**
     * 版面：把一行放不下时缩一档，然后量出字带与逐字素中心。
     *
     * ★ 安全区**不在这里算**：`.nj__field` 的 top/bottom 就是宿主两条 chrome
     *   带子的内沿（CSS 里 `calc(var(--skin-inset-*, 0px) + Npx)`），所以字一定
     *   在安全区里；这里只量它的屏幕位置，用来把画布上的水果对齐到字上。
     */
    function relayout() {
      if (!st.glyphEls.length || !st.hasLyrics) {
        measureField();
        return;
      }
      fitLine();
      measureField();
      updateSeatRadius();
    }

    function measureField() {
      const crect = elCanvas.getBoundingClientRect?.() || { left: 0, top: 0 };
      const frect = elField.getBoundingClientRect?.() || { top: 0, bottom: 0 };
      const lrect = elLyric.getBoundingClientRect?.() || { top: 0, height: 0 };
      const fs = parseFloat(getComputedStyle(elLyric).fontSize) || 24;
      st.fs = fs;
      st.fieldTop = Math.max(0, frect.top - crect.top);
      st.lineH = Math.max(1, lrect.height || fs * 1.4);
      st.lineY = st.hasLyrics ? lrect.top - crect.top + st.lineH / 2 : st.h * 0.62;
      // 抛掷基线在舞台下方（水果从案板外飞进来）；顶点在字带上方一点 ——
      // 顶点就是这个字起唱的那一刻，所以"刀到"与"唱到"是同一帧。
      st.groundY = st.h + Math.max(36, st.h * 0.06);
      st.apexY = st.lineY - Math.max(fs * 1.5, st.lineH * 0.9);
      /**
       * ★ 物理地板 = **安全区的下沿**（量出来的，不是猜的）：两半与果汁要落在
       *   宿主底栏**上面**那块看得见的案板上。以前写的是 `h - 6`，结果果汁与两半
       *   全落在底栏背后（用户根本看不见）——"切开"这件事的收尾就整个丢了。
       *   也不许 parseFloat `--skin-inset-bottom`（它在 computed style 里是原样
       *   token 流，见 README 第 7 节），所以直接用歌词带容器的底边。
       */
      const bottom = (frect.bottom || st.h) - crect.top;
      st.floorY = Math.max(st.lineY + st.lineH, Math.min(st.h - 12, bottom - 6));
      setVar("--nj-fs", `${fs.toFixed(2)}px`);
      measureGlyphs(crect);
    }

    function measureGlyphs(crect) {
      const n = st.glyphEls.length;
      if (st.glyphX.length < n) {
        st.glyphX = new Float32Array(n);
        st.glyphY = new Float32Array(n);
      }
      const left = crect?.left || 0;
      const top = crect?.top || 0;
      for (let k = 0; k < n; k += 1) {
        const r = st.glyphEls[k].getBoundingClientRect();
        st.glyphX[k] = Math.round(r.left + r.width / 2 - left);
        st.glyphY[k] = Math.round(r.top + r.height / 2 - top);
      }
    }

    /**
     * 一行放不下就整体缩一档；放得下就按这一款的**版面倍率**放大。
     *
     * ★ 只写 `--nj-scale`（乘数），**绝不写 `--lyric-size`** —— 宿主下发的用户
     *   字号必须仍然有效：用户拖大字，整行跟着变大；一行放不下才由我们等比缩回来。
     *   倍率本身是"这一款的版面"（按舞台高度算），不是把用户的值抄成常量。
     * ★ 每次先归 1 再量：`getBoundingClientRect` 量到的是**当前倍率下**的宽度，
     *   直接拿它算新倍率会一次比一次小（越缩越小直到贴到下限）。
     */
    function fitLine() {
      const base = Math.max(1.05, Math.min(1.45, 0.85 + st.h / 1600));
      setVar("--nj-scale", "1");
      let total = 0;
      for (const el of st.glyphEls) total += el.getBoundingClientRect().width;
      const avail = elLyric.clientWidth || st.w * 0.9;
      const fit = total > 0 ? avail / total : 1;
      const scale = Math.max(0.44, Math.min(base, fit * 0.98));
      setVar("--nj-scale", scale.toFixed(4));
    }

    /** 一字素一枚水果该多大：按字素步距与字号定，再夹在 12~30px */
    function updateSeatRadius() {
      const n = st.glyphEls.length;
      if (!n) return;
      const gap = n > 1 ? Math.abs(st.glyphX[1] - st.glyphX[0]) : 0;
      const per = gap > 2 ? gap : Math.max(14, st.fs * 0.86);
      const base = fruit.radiusFor(per, st.h);
      for (let k = 0; k < n; k += 1) {
        if (st.seats[k]) st.seats[k].rad = st.performanceMode ? base * 0.94 : base;
      }
    }

    /* ---------------------------------------------------------------------
       歌词：DOM 一行字 + 一行方案
       --------------------------------------------------------------------- */
    function syncLines({ force = false } = {}) {
      const ly = lyrics() || {};
      const lines = Array.isArray(ly.lines) ? ly.lines : EMPTY_LINES;
      if (force || lines !== st.lines) {
        st.lines = lines;
        st.lineIndex = -2;
        if (force) st.plan = null;
      }
      const hasSong = !!song().id && lines.length > 0;
      const showLyrics = opts().showLyrics !== false;
      const poster = hasSong && !showLyrics;
      const has = hasSong && showLyrics;
      const text = has
        ? ""
        : hasSong
          ? ""
          : song().id
            ? html.lyricsEmptyText?.(ly) || ""
            : html.lyricsEmptyText?.({ status: "none" }) || "";
      if (text !== st.emptyText) {
        st.emptyText = text;
        elEmpty.textContent = text;
      }
      setAttr("empty", has || poster ? "0" : "1");
      setAttr("poster", poster ? "1" : "0");
      setAttr("showlyrics", showLyrics ? "1" : "0");
      elEmpty.hidden = has || poster || !text;
      elPoster.hidden = !poster;
      elField.hidden = !has;
      st.hasLyrics = has;
      if (!has) {
        st.plan = null;
        st.lineIndex = -2;
        st.glyphEls = [];
        st.seats = [];
        st.kinds = null;
        st.glyphX = new Float32Array(0);
        st.glyphY = new Float32Array(0);
        st.fills = new Float32Array(0);
        elLyric.textContent = "";
        juice.clearJuice(st.juicePool);
        juice.clearHalves(st.halfPool);
        st.slashes.length = 0;
        st.bursts.length = 0;
        st.stains.length = 0;
        st.carryBomb = null;
        st.activeBomb = null;
        setAttr("stains", "0");
        st.lastLit = -1;
        st.lastGlyphAttr = -1;
        setAttr("glyphs", "0");
        setAttr("lit", "0");
        setAttr("fruits", "0");
        setAttr("bomb", "0");
      }
      return has;
    }

    /** 换句：重建 DOM 与座位（这是唯一会重建水果的入口） */
    function setLine(index, { silent = false } = {}) {
      const line = st.lines[index];
      const text = String(line?.text || "");
      const chars = text ? timeline.graphemesOf(text, ctx.sdk.splitGraphemes) : [];
      const next = st.lines[index + 1] || null;
      // 旧那一句的炸弹如果还没炸，就**接力**带过来（见 activeBomb）：
      // 换句提前量是 760ms，而炸弹正好在下一句的开口时刻炸 —— 不接力的话，
      // 那条引线会在爆炸前 760ms 连同整句一起被替换掉，boom 永远不发生。
      const prevBomb = st.plan?.bomb;
      st.carryBomb = prevBomb && !prevBomb.fired && prevBomb.detonateAt >= st.pos - 1 ? prevBomb : null;
      st.lineIndex = index;
      st.plan = text ? timeline.planLine(line, next, { chars, text }) : null;
      st.kinds = text
        ? fruit.assignKinds(
            chars.length,
            util.hashSeed(`${text}|${Math.round(Number(line?.time) || 0)}`),
            chars.length
          )
        : null;
      // DOM：一字素一个 span（整行一起换，不做增量 diff —— 一行只有几十个节点）
      elLyric.textContent = "";
      const frag = document.createDocumentFragment();
      st.glyphEls = [];
      for (let k = 0; k < chars.length; k += 1) {
        const span = document.createElement("span");
        span.className = "nj__g";
        span.textContent = chars[k];
        // ★ `--g` 一开始就写 0：不写的话这个自定义属性在 DOM 上**不存在**，
        //   任何读它的人（自检 / 排查 / 别的工具）拿到的是空串而不是"还没唱"。
        span.style.setProperty("--g", "0");
        frag.appendChild(span);
        st.glyphEls.push(span);
      }
      elLyric.appendChild(frag);
      st.fills = new Float32Array(chars.length);
      st.seats = [];
      for (let k = 0; k < chars.length; k += 1) {
        const th = st.plan.throws[k];
        const rnd = util.mulberry32(util.hashSeed(`${text}|${k}|${st.kinds[k]}`));
        st.seats.push({
          kind: st.kinds[k],
          colors: st.kindColors[st.kinds[k]] || st.kindColors[0],
          scale: fruit.silhouette(fruit.kindOf(st.kinds[k])),
          drift: (rnd() - 0.5) * Math.min(160, Math.max(70, st.w * 0.13)),
          spin0: rnd() * Math.PI,
          spinSpan: 1.4 + rnd() * 1.7,
          cutAngle: (k % 2 ? 1 : -1) * (0.3 + rnd() * 0.3),
          cut: false,
          cutAt: 0,
          byPointer: false,
          rad: 18,
          tossAt: th.tossAt,
          slashAt: th.slashAt,
          fillAt: th.fillAt,
        });
      }
      relayout();
      st.lastLit = -1;
      st.lastGlyphAttr = -1;
      st.lastFruits = -1;
      if (!silent) st.slashes.length = 0; // 刀光是"那一瞬"的东西，换句必须撤掉
      setAttr("glyphs", String(chars.length));
      setAttr("lit", "0");
      setAttr("line", String(index));
      return st.plan;
    }

    /**
     * 当前该演哪一句（换句带提前量）。
     * 往回跳（拖进度条）立刻生效；往前跳必须等这一句唱完。
     */
    function activeLineIndex(pos) {
      const want = timeline.lineIndexAt(st.lines, pos + LINE_LEAD_MS);
      if (want <= st.lineIndex) return want;
      const done = !st.plan || pos >= st.plan.lineEnd - 40;
      return done ? want : st.lineIndex;
    }

    /** 正在演的那枚炸弹：接力过来的负责到**炸完**（含烟花的余韵），之后才交给当前句的 */
    function activeBomb(pos) {
      const carry = st.carryBomb;
      if (carry && pos <= carry.detonateAt + 520) return carry;
      if (carry) st.carryBomb = null;
      return st.plan?.bomb || null;
    }

    /* ---------------------------------------------------------------------
       切开（唯一的"事件"入口）
       --------------------------------------------------------------------- */
    function flightY(k, at) {
      const seat = st.seats[k];
      const span = Math.max(1, seat.slashAt - seat.tossAt);
      const q = util.clamp01((at - seat.tossAt) / span);
      return st.groundY - (st.groundY - st.apexY) * util.arcRise(q);
    }

    function flightX(k, at) {
      const seat = st.seats[k];
      const span = Math.max(1, seat.slashAt - seat.tossAt);
      const q = util.clamp01((at - seat.tossAt) / span);
      return st.glyphX[k] + seat.drift * (1 - q);
    }

    /**
     * 切一枚水果。
     *
     * @param {number} k 字素下标
     * @param {number} at 切开时刻（现场切 = 到点那一刻；静默登记 = slashAt）
     * @param {{live?:boolean, angle?:number, byPointer?:boolean}} [o]
     */
    function cutSeat(k, at, o = {}) {
      const seat = st.seats[k];
      if (!seat || seat.cut) return false;
      const live = o.live !== false;
      const x = flightX(k, at);
      const y = flightY(k, at);
      const rad = seat.rad;
      const rx = rad * seat.scale.rx;
      const ry = rad * seat.scale.ry;
      const cutAngle = o.angle == null ? seat.cutAngle : o.angle;
      seat.cut = true;
      seat.cutAt = at;
      seat.byPointer = !!o.byPointer;
      // 静默登记（拖进度条跳过来的）不生成任何特效：只把状态标成已切
      if (!live) return true;
      // 两半进池：沿刀口法线分离（位置/角度由 juice.stepHalves 积分）
      juice.cutHalves(st.halfPool, {
        x,
        y,
        rx,
        ry,
        cutAngle,
        kind: seat.kind,
        born: at,
        speed: juice.PHYS.cutImpulse * (o.byPointer ? 1.15 : 1),
      });
      // 果汁：两股（沿两个法线方向）+ 一点细沫；高频亮时沫更多
      const nx = Math.sin(cutAngle);
      const ny = -Math.cos(cutAngle);
      const budget = st.performanceMode ? 0.5 : util.lodFactor(st.lod);
      const n = Math.max(8, Math.round(JUICE_PER_CUT * budget));
      const buckets = [0, 1, 2, 3, 4, 5];
      for (const side of [-1, 1]) {
        juice.splat(st.juicePool, {
          x,
          y,
          dirX: nx * side,
          dirY: ny * side,
          spread: 1.15,
          n,
          speed: 250 + st.bass * 130,
          rMin: 1 + rad * 0.05,
          rMax: 2.6 + rad * 0.14,
          ttl: 0.9,
          buckets,
          rand: st.rng,
        });
      }
      const mist = Math.round(JUICE_MIST * budget * (0.4 + st.high));
      if (mist > 2) {
        juice.splat(st.juicePool, {
          x,
          y,
          dirX: 0,
          dirY: -1,
          spread: 2.6,
          n: mist,
          speed: 130,
          rMin: 0.7,
          rMax: 1.7,
          ttl: 0.7,
          buckets,
          rand: st.rng,
        });
      }
      st.slashes.push({
        x,
        y,
        angle: cutAngle,
        len: rad * 3.1,
        at,
        w: 5 + st.bass * 4 + rad * 0.12,
      });
      if (st.slashes.length > 10) st.slashes.shift();
      // 果汁在案板上留个印子（沿着果汁落下去的方向偏一点）
      st.stains.push({
        x: Math.max(8, Math.min(st.w - 8, x + nx * rad * 1.6 + (st.rng() - 0.5) * rad * 2)),
        y: Math.max(st.lineY, st.floorY - 4 + (st.rng() - 0.5) * 10),
        rx: rad * (0.5 + st.rng() * 0.7),
        ry: rad * (0.16 + st.rng() * 0.22),
        rot: (st.rng() - 0.5) * 0.5,
        bucket: (st.rng() * 6) | 0,
        at,
      });
      if (st.stains.length > MAX_STAINS) st.stains.shift();
      setAttr("stains", String(st.stains.length));
      // ★ 只有歌驱动的切开进连击：指针提前劈开只爆果汁，不改读数
      if (!o.byPointer) st.combo.pushAt(at);
      return true;
    }

    /**
     * 把"切开的登记"对齐到当前位置。
     *
     * ★ 这里必须分开两个字：**现场切**（这一刻真的到点 → 喷果汁、加连击、出刀光）
     *   与**静默登记**（拖进度条跳过来的、卡了一帧之后补上的 → 只标状态）。
     *   混在一起的话，拖一次进度条就会喷掉几百粒果汁、连击直接飙到几十。
     */
    function syncCuts(pos, { silent = false } = {}) {
      if (!st.plan) return;
      for (let k = 0; k < st.seats.length; k += 1) {
        const seat = st.seats[k];
        if (seat.cut || pos < seat.slashAt) continue;
        const live = !silent && pos - seat.slashAt <= LIVE_CUT_MS;
        cutSeat(k, seat.slashAt, { live });
      }
    }

    /* ---------------------------------------------------------------------
       指针：刀
       --------------------------------------------------------------------- */
    function pushTrail(x, y, now) {
      const n = Math.min(TRAIL_POINTS, st.trailN + 1);
      for (let i = n - 1; i > 0; i -= 1) {
        st.trail[i * 2] = st.trail[(i - 1) * 2];
        st.trail[i * 2 + 1] = st.trail[(i - 1) * 2 + 1];
        st.trailAt[i] = st.trailAt[i - 1];
      }
      st.trail[0] = x;
      st.trail[1] = y;
      st.trailAt[0] = now;
      st.trailN = n;
    }

    /** 指针刀痕的最后一段扫过哪些水果（划过去 = 提前劈开；字仍然按歌曲时刻染亮） */
    function sliceByPointer(pos) {
      if (st.trailN < 2 || !st.plan) return;
      const x1 = st.trail[2];
      const y1 = st.trail[3];
      const x2 = st.trail[0];
      const y2 = st.trail[1];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      if (len2 < 9) return;
      const angle = Math.atan2(dy, dx);
      for (let k = 0; k < st.seats.length; k += 1) {
        const seat = st.seats[k];
        if (seat.cut || pos < seat.tossAt - 80 || pos > seat.slashAt) continue;
        const cx = flightX(k, pos);
        const cy = flightY(k, pos);
        const t = util.clamp01(((cx - x1) * dx + (cy - y1) * dy) / len2);
        const dist = Math.hypot(cx - (x1 + dx * t), cy - (y1 + dy * t));
        if (dist <= seat.rad * 1.15 + TRAIL_HIT_PAD) {
          cutSeat(k, pos, { live: true, angle, byPointer: true });
        }
      }
    }

    const onPointerMove = (ev) => {
      if (!st.interactive) return;
      const r = elCanvas.getBoundingClientRect();
      pushTrail(ev.clientX - r.left, ev.clientY - r.top, nowMs());
    };
    const onPointerLeave = () => {
      st.trailN = 0;
    };

    elCanvas.addEventListener("pointermove", onPointerMove);
    elCanvas.addEventListener("pointerleave", onPointerLeave);

    /* ---------------------------------------------------------------------
       HUD
       --------------------------------------------------------------------- */
    function paintSong() {
      const s = song();
      const title = String(s.title || "");
      if (typeof ctx.sdk.marqueeText === "function") ctx.sdk.marqueeText(elTitle, title);
      else elTitle.textContent = title;
      elBadge.hidden = s.kind !== "online";
      elPosterTitle.textContent = title;
      elPosterSub.textContent = [s.artist, s.album].filter(Boolean).join(" · ");
      st.duration = Number(s.duration) || 0;
      const cover = media().cover || "";
      if (cover && elDisc && typeof html.setCoverImage === "function") {
        elDisc.hidden = false;
        html.setCoverImage(elDisc, cover, ctx.defaultCover);
      } else if (elDisc) {
        elDisc.hidden = true;
      }
      if (cover && cover !== st.coverKey) loadCover(cover);
      else if (!cover && st.coverKey) {
        // 换成一首**没有封面**的歌：必须把果盘退回清单配色，
        // 否则会留着上一首的封面色（"这首歌的果盘"就不再是这首歌的了）。
        st.coverKey = "";
        applyBowl(palette.bowlFromCover(null, 0, 0));
      }
    }

    function paintTimecode(pos) {
      const total = st.duration || Number((ctx.playback?.() || {}).duration) || 0;
      const tc = `${util.timecode(pos)} / ${util.timecode(total)}`;
      if (tc !== st.lastTc) {
        st.lastTc = tc;
        elTc.textContent = tc;
      }
    }

    function paintChips() {
      const v = st.combo.value(st.pos);
      if (v.score !== st.lastScore) {
        st.lastScore = v.score;
        elScore.textContent = util.group3(v.score);
        setAttr("score", String(v.score));
      }
      const shown = v.combo >= 3 ? v.combo : 0;
      if (shown !== st.lastComboShown) {
        st.lastComboShown = shown;
        setAttr("combo", String(shown));
        if (shown) {
          elComboN.textContent = String(shown);
          elCombo.hidden = false;
        } else {
          elCombo.hidden = true;
        }
      }
      // ★ 切开的**总数**单独记账：它不能在连击变化时才写（那样"当前切了几刀"
      //   这个读数会一直是 0），也不能用 score 反推（连击加倍不是线性的）。
      if (v.cuts !== st.lastCuts) {
        st.lastCuts = v.cuts;
        setAttr("cuts", String(v.cuts));
      }
      setVar("--nj-pulse", (0.25 + st.bass * 0.75).toFixed(3));
    }

    /* ---------------------------------------------------------------------
       绘制
       --------------------------------------------------------------------- */
    /** 6 个色桶的实际颜色（都是果汁色往暖白提亮：越靠后的桶越亮） */
    function bucketColors() {
      const j = st.bowl?.juice || [226, 84, 58];
      const out = [];
      for (let b = 0; b < juice.BUCKETS; b += 1) {
        out.push(palette.toHex(palette.mix(j, [255, 246, 214], 0.06 + (b / (juice.BUCKETS - 1)) * 0.5)));
      }
      return out;
    }

    function paintFrame(pos) {
      const g = g2d;
      if (!g) return;
      const t0 = nowMs();
      const s = st.dpr;
      // 低频震屏：只震画布内容，**不震文字**（震字会毁掉可读性）
      const amp = st.bass * 2.4 + st.flash * 7;
      const sx = amp > 0.05 ? Math.sin(pos / 37) * amp : 0;
      const sy = amp > 0.05 ? Math.cos(pos / 29) * amp * 0.7 : 0;
      g.setTransform(s, 0, 0, s, sx * s, sy * s);
      g.clearRect(-14, -14, st.w + 28, st.h + 28);

      // ── 0) 案板上的果汁印（最旧的一层，永远最先画）──────────────────
      const colors = bucketColors();
      if (st.stains.length) {
        g.save();
        for (let i = 0; i < st.stains.length; i += 1) {
          const sn = st.stains[i];
          const age = pos - sn.at;
          if (age < 0) continue;
          const fade = Math.max(0.05, 1 - age / STAINT_LIFE_MS);
          g.globalAlpha = 0.34 * fade;
          g.fillStyle = colors[sn.bucket] || colors[0];
          g.beginPath();
          g.ellipse(sn.x, sn.y, sn.rx, sn.ry, sn.rot, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
      }

      // ── 1) 还没切、正在飞的水果 ─────────────────────────────────────
      if (st.plan) {
        for (let k = 0; k < st.seats.length; k += 1) {
          const seat = st.seats[k];
          if (seat.cut || pos < seat.tossAt) continue;
          const span = Math.max(1, seat.slashAt - seat.tossAt);
          const q = util.clamp01((pos - seat.tossAt) / span);
          if (q >= 1) continue;
          fruit.paintFruit(g, {
            x: flightX(k, pos),
            y: flightY(k, pos),
            rx: seat.rad * seat.scale.rx,
            ry: seat.rad * seat.scale.ry,
            rot: seat.spin0 + q * seat.spinSpan,
            colors: seat.colors,
          });
        }
      }

      // ── 2) 切开的两半（刚体，读池子）────────────────────────────────
      const halfLife = timeline.HALF_LIFE_MS;
      for (let i = 0; i < st.halfPool.n; i += 1) {
        const age = pos - st.halfPool.born[i];
        if (age < 0 || age > halfLife) continue;
        const alpha = age > halfLife - 420 ? Math.max(0, (halfLife - age) / 420) : 1;
        fruit.paintHalf(g, {
          x: st.halfPool.x[i],
          y: st.halfPool.y[i],
          rx: st.halfPool.rx[i],
          ry: st.halfPool.ry[i],
          rot: st.halfPool.rot[i],
          side: st.halfPool.side[i],
          colors: st.kindColors[st.halfPool.kind[i]] || st.kindColors[0],
          alpha,
          cutFlash: Math.max(0, 1 - age / 170),
        });
      }

      // ── 3) 果汁（按 6 个色桶分批：每帧最多 6 次 fillStyle）──────────
      g.save();
      for (let b = 0; b < juice.BUCKETS; b += 1) {
        g.fillStyle = colors[b];
        for (let i = 0; i < st.juicePool.n; i += 1) {
          if (st.juicePool.bucket[i] !== b) continue;
          const life = st.juicePool.life[i] / Math.max(0.001, st.juicePool.ttl[i]);
          g.globalAlpha = life > 0.7 ? 1 : Math.max(0.08, life / 0.7);
          g.beginPath();
          g.arc(st.juicePool.x[i], st.juicePool.y[i], st.juicePool.r[i] * (0.6 + life * 0.7), 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();

      // ── 4) 刀光 ────────────────────────────────────────────────────
      for (let i = st.slashes.length - 1; i >= 0; i -= 1) {
        const sl = st.slashes[i];
        const age = pos - sl.at;
        if (age < 0 || age > SLASH_MS) {
          st.slashes.splice(i, 1);
          continue;
        }
        const k = 1 - age / SLASH_MS;
        const spread = sl.len * (1.05 + (1 - k) * 0.5);
        fruit.paintSlash(g, {
          x1: sl.x - Math.cos(sl.angle) * spread,
          y1: sl.y - Math.sin(sl.angle) * spread,
          x2: sl.x + Math.cos(sl.angle) * spread,
          y2: sl.y + Math.sin(sl.angle) * spread,
          w: sl.w * (0.7 + k * 0.6),
          alpha: k,
        });
      }

      // ── 5) 指针刀痕（过期点直接丢掉；静止后自然消失）────────────────
      const wall = nowMs();
      let live = st.trailN;
      while (live > 0 && wall - st.trailAt[live - 1] > TRAIL_MS) live -= 1;
      st.trailN = live;
      if (st.interactive && live >= 2) {
        for (let i = 0; i < live * 2; i += 1) st.trailArr[i] = st.trail[i];
        fruit.paintTrail(g, st.trailArr.slice(0, live * 2), {
          tint: palette.mix(st.bowl?.juice || [255, 255, 255], [255, 255, 255], 0.5),
          width: 7 + st.bass * 3,
          alpha: Math.min(1, 0.55 + st.flux * 0.9),
        });
      }

      // ── 6) 炸弹与爆炸 ──────────────────────────────────────────────
      const bomb = activeBomb(pos);
      st.activeBomb = bomb;
      setAttr("bomb", bomb ? "1" : "0");
      if (bomb && pos >= bomb.riseAt) {
        const bx = st.w * 0.5;
        const by = st.fieldTop + (st.lineY - st.fieldTop) * 0.34;
        const riseQ = util.clamp01((pos - bomb.riseAt) / Math.max(1, bomb.apexAt - bomb.riseAt));
        const fromY = st.h + 40;
        const y = fromY - (fromY - by) * util.arcRise(riseQ) + (riseQ >= 1 ? Math.sin(pos / 320) * 3 : 0);
        const fuse = util.clamp01((pos - bomb.riseAt) / Math.max(1, bomb.detonateAt - bomb.riseAt));
        setAttr("bombfuse", fuse.toFixed(2));
        if (pos < bomb.detonateAt) {
          fruit.paintBomb(g, {
            x: bx,
            y,
            r: Math.max(11, st.fs * 0.62),
            rot: Math.sin(pos / 520) * 0.12,
            fuse,
          });
        }
      }
      if (bomb && pos >= bomb.detonateAt && !bomb.fired) {
        bomb.fired = true;
        const bx = st.w * 0.5;
        const by = st.fieldTop + (st.lineY - st.fieldTop) * 0.34;
        st.bursts.push({ x: bx, y: by, r: Math.max(16, st.fs * 0.9), at: bomb.detonateAt });
        st.flash = 1;
        st.flashAt = bomb.detonateAt;
        juice.splat(st.juicePool, {
          x: bx,
          y: by,
          dirX: 0,
          dirY: -1,
          spread: Math.PI * 2,
          n: st.performanceMode ? 80 : 170,
          speed: 420,
          rMin: 1.2,
          rMax: 3.6,
          ttl: 1.25,
          buckets: [0, 1, 2, 3, 4, 5],
          rand: st.rng,
        });
      }
      for (let i = st.bursts.length - 1; i >= 0; i -= 1) {
        const bu = st.bursts[i];
        const age = pos - bu.at;
        if (age < 0 || age > 460) {
          st.bursts.splice(i, 1);
          continue;
        }
        fruit.paintBurst(g, { x: bu.x, y: bu.y, r: bu.r, k: age / 460 });
      }
      if (st.flash > 0) {
        const age = pos - st.flashAt;
        st.flash = age >= 0 && age <= FLASH_MS ? 1 - age / FLASH_MS : 0;
        if (st.flash > 0.01) {
          g.save();
          g.fillStyle = `rgba(255,246,214,${(st.flash * 0.16).toFixed(3)})`;
          g.fillRect(0, 0, st.w, st.h);
          g.restore();
        }
      }

      st.drew += 1;
      setAttr("draws", String(st.drew));
      const inFlight = countInFlight(pos);
      if (inFlight !== st.lastFruits) {
        st.lastFruits = inFlight;
        setAttr("fruits", String(inFlight));
      }

      // 自适应降级：量自己这一帧画了多久（连续两帧超预算才退一档，8 秒后不再退）
      const dt = nowMs() - t0;
      const budgetMs = util.paintBudgetMs(st.performanceMode ? st.budgetFps : 60);
      st.paintAvg = util.ema(st.paintAvg, dt, 0.25);
      if (st.paintAvg > budgetMs) st.slowStreak += 1;
      else st.slowStreak = 0;
      const lod = util.nextLod(st.lod, st.paintAvg, budgetMs, st.slowStreak, nowMs() - st.startedAt);
      if (lod !== st.lod) {
        st.lod = lod;
        setAttr("lod", String(lod));
        resize();
      }
    }

    function countInFlight(pos) {
      let n = 0;
      for (let k = 0; k < st.seats.length; k += 1) {
        const seat = st.seats[k];
        if (!seat.cut && pos >= seat.tossAt && pos < seat.slashAt) n += 1;
      }
      return n;
    }

    /** 关动效档的静态画面：一排水果停在案板上（"还没抛起来"），字交给 DOM */
    function paintStill() {
      const g = g2d;
      if (!g) return;
      g.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      g.clearRect(0, 0, st.w, st.h);
      const n = Math.min(5, st.seats.length);
      const baseY = st.floorY - 2;
      for (let i = 0; i < n; i += 1) {
        const seat = st.seats[i];
        const rad = Math.max(10, seat.rad * 0.9);
        fruit.paintFruit(g, {
          x: st.w * (0.5 + (i - (n - 1) / 2) * 0.11),
          y: baseY - rad * 0.9,
          rx: rad * seat.scale.rx,
          ry: rad * seat.scale.ry,
          rot: seat.spin0,
          colors: seat.colors,
        });
      }
      st.drew += 1;
      setAttr("draws", String(st.drew));
      const inFlight = 0;
      setAttr("fruits", String(inFlight));
      st.lastFruits = inFlight;
    }

    /* ---------------------------------------------------------------------
       逐字染色（DOM）：果汁沿 X 渗开把字染亮
       --------------------------------------------------------------------- */
    function updateFills(pos) {
      const plan = st.plan;
      if (!plan) return;
      let lit = 0;
      for (let k = 0; k < plan.count; k += 1) {
        const q = util.fillProgress(plan.starts[k], pos, timeline.FILL_MS, 32);
        if (q >= 1) lit += 1;
        if (q !== st.fills[k]) {
          st.fills[k] = q;
          st.glyphEls[k].style.setProperty("--g", String(q));
        }
      }
      if (lit !== st.lastLit) {
        st.lastLit = lit;
        setAttr("lit", String(lit));
      }
      const n = plan.count;
      if (n !== st.lastGlyphAttr) {
        st.lastGlyphAttr = n;
        setAttr("glyphs", String(n));
      }
    }

    /* ---------------------------------------------------------------------
       频谱（拉取式：不读 = 宿主一次都不采样）
       --------------------------------------------------------------------- */
    let prevBands = null;
    function readSpectrum() {
      let snap = null;
      try {
        snap = ctx.spectrum?.() || null;
      } catch {
        snap = null;
      }
      // ★ 契约 v3：给的是快照 {bands, at}，不是裸数组
      const bands = snap?.bands || null;
      st.bass = util.avgRange(bands, 0, 12);
      st.high = util.avgRange(bands, 96, 128);
      if (bands && bands.length) {
        if (!prevBands || prevBands.length !== bands.length) prevBands = new Float32Array(bands.length);
        const flux = util.fluxOf(prevBands, bands);
        prevBands.set(bands);
        st.fluxPeak = Math.max(flux, st.fluxPeak * 0.94);
        st.fluxAvg = util.ema(st.fluxAvg, flux, 0.08);
        const thr = Math.max(0.002, st.fluxPeak * 0.35, st.fluxAvg * 1.8);
        st.flux = flux > thr ? Math.min(1, flux / Math.max(1e-4, thr * 2)) : 0;
      } else {
        st.flux = 0;
      }
      setVar("--nj-shake", (st.bass * 1.6).toFixed(2));
      setVar("--nj-flux", st.flux.toFixed(3));
    }

    /* ---------------------------------------------------------------------
       帧循环：一条 rAF / 暂停 6 秒停帧 / 后台停帧 / performance 档限帧
       --------------------------------------------------------------------- */
    function tick() {
      st.raf = 0;
      if (!st.alive || st.idle) return;
      const wall = nowMs();
      if (!st.foreground) {
        stopFrames();
        return;
      }
      if (!st.clock.playing && util.idleExpired(st.lastActive, wall, IDLE_STOP_MS)) {
        // 暂停 6 秒：把最后一帧留在屏上，然后彻底停帧
        renderFrame(wall);
        stopFrames();
        return;
      }
      if (!util.dueForFrame(st.lastTick, wall, util.frameBudgetMs(st.performanceMode, st.clock.playing, st.budgetFps))) {
        st.raf = requestAnimationFrame(() => tick(st));
        return;
      }
      renderFrame(wall);
      st.raf = requestAnimationFrame(() => tick(st));
    }

    function renderFrame(wall) {
      const dtMs = st.lastTick ? Math.min(64, Math.max(1, wall - st.lastTick)) : 16;
      st.lastTick = wall;
      const dt = dtMs / 1000;
      const pos = Math.max(0, st.clock.value(wall));
      const jumped = Math.abs(pos - st.pos) > SEEK_JUMP_MS;
      st.pos = pos;

      if (st.hasLyrics) {
        const idx = activeLineIndex(pos);
        if (idx !== st.lineIndex) {
          setLine(idx);
          syncCuts(pos, { silent: true }); // 换句时这一句里已经唱过的字全部静默登记
        } else {
          syncCuts(pos, { silent: jumped });
        }
      }
      readSpectrum();
      updateFills(pos);
      paintChips();
      paintTimecode(pos);

      if (st.interactive && st.trailN >= 2) sliceByPointer(pos);
      juice.stepJuice(st.juicePool, dt, { floor: st.floorY });
      juice.stepHalves(st.halfPool, dt, {
        floor: st.floorY + 4,
        now: pos,
        lifeMs: timeline.HALF_LIFE_MS,
      });
      paintFrame(pos);
    }

    /** 静态画一帧（关动效档 / 空闲停帧前）：不起帧、不推进物理 */
    function paintOnce() {
      if (!st.alive) return;
      const wall = nowMs();
      st.lastTick = wall;
      const pos = Math.max(0, st.clock.value(wall));
      st.pos = pos;
      if (st.hasLyrics) {
        const idx = activeLineIndex(pos);
        if (idx !== st.lineIndex) setLine(idx);
        syncCuts(pos, { silent: true });
      }
      updateFills(pos);
      paintChips();
      paintTimecode(pos);
      paintStill();
    }

    /* ---------------------------------------------------------------------
       环境（动画 / 性能档 / 交互 / 前景）
       --------------------------------------------------------------------- */
    function applyEnv() {
      const o = opts();
      const e = env();
      st.animations = o.animations !== false && e.reducedMotion !== true;
      st.interactive = o.interactive !== false;
      st.performanceMode = o.performanceMode === "performance"; // ★ 字符串口径
      st.budgetFps = st.performanceMode ? BUDGET_FPS : 120;
      st.foreground = e.foreground !== false;
      setAttr("animations", st.animations ? "1" : "0");
      setAttr("perf", st.performanceMode ? "1" : "0");
      setAttr("interactive", st.interactive ? "1" : "0");
      setAttr("playing", st.clock.playing ? "1" : "0");
      resize();
      if (!st.animations) {
        haltFrames();
        paintOnce();
      } else if (!st.foreground) {
        stopFrames();
      } else {
        wake();
      }
    }

    function stopFrames() {
      if (st.raf) cancelAnimationFrame(st.raf);
      st.raf = 0;
      st.idle = true;
      setAttr("idle", "1");
    }

    /** 掐掉帧链但**不**标记 idle（关动效档用：画面静态，但不是"暂停空转"） */
    function haltFrames() {
      if (st.raf) cancelAnimationFrame(st.raf);
      st.raf = 0;
    }

    function wake() {
      st.lastActive = nowMs();
      if (st.idle) {
        st.idle = false;
        setAttr("idle", "0");
      }
      if (!st.animations) return; // 关动效档：一帧都不起（补丁来了画一帧）
      if (!st.foreground) return;
      if (!st.raf && st.alive) st.raf = requestAnimationFrame(() => tick(st));
    }

    /* ---------------------------------------------------------------------
       首帧
       --------------------------------------------------------------------- */
    // 自带图标的地址只能由 JS 取（CSS 里的相对 url() 是相对**文档**解析的，不是
    // 相对本包），而且必须透传 ?t= token：/skins/ 是逐文件鉴权的。
    try {
      setVar("--nj-icon", `url("${new URL(`./assets/icon.svg${Q}`, import.meta.url).href}")`);
    } catch {
      /* 取不到地址就算了：空态少一枚图标，不影响其它任何东西 */
    }
    applyBowl(palette.bowlFromCover(null, 0, 0));
    setAttr("lod", "0");
    applyEnv();
    st.lines = Array.isArray(lyrics().lines) ? lyrics().lines : EMPTY_LINES;
    st.lineIndex = -2;
    syncLines({ force: true });
    paintSong();
    const pb0 = ctx.playback?.() || {};
    st.clock.set(pb0.position || 0, pb0.playing !== false, nowMs());
    st.pos = Math.max(0, Number(pb0.position) || 0);
    if (st.hasLyrics) setLine(timeline.lineIndexAt(st.lines, st.pos), { silent: true });
    syncCuts(st.pos, { silent: true });
    updateFills(st.pos);
    paintChips();
    paintTimecode(st.pos);
    setAttr("line", String(st.lineIndex));
    if (st.animations) wake();
    else paintOnce();

    S = {
      st,
      elRoot,
      elCanvas,
      elField,
      elLyric,
      bgRoot,
      onPointerMove,
      onPointerLeave,
      applyEnv,
      paintSong,
      syncLines,
      setLine,
      resize,
      relayout,
      wake,
      stopFrames,
      haltFrames,
      paintOnce,
      setVar,
      setAttr,
    };
  },

  /* ========================================================================
     update：宿主推来的增量
     ======================================================================== */
  update(ctx, patch) {
    if (!S || !S.st.alive) return;
    const st = S.st;
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
        st.clock.set(pb.position || 0, pb.playing !== false, nowMs());
        st.duration = Number((ctx.track?.() || {}).duration) || Number(pb.duration) || 0;
        st.combo.reset();
        st.lastScore = -1;
        st.lastComboShown = -1;
        st.flash = 0;
        // 换歌 = 换一块案板：上一首留下的果汁印不该跟着走
        st.stains.length = 0;
        S.setAttr("stains", "0");
        S.paintSong();
        S.syncLines({ force: true });
        st.lineIndex = -2;
        st.pos = Math.max(0, Number(pb.position) || 0);
        if (st.hasLyrics) S.setLine(timeline.lineIndexAt(st.lines, st.pos), { silent: true });
        if (!st.animations) S.paintOnce();
        else S.wake();
        break;
      }

      case "media":
        S.paintSong();
        S.syncLines();
        S.wake();
        break;

      case "lyrics":
        S.syncLines({ force: true });
        S.wake();
        break;

      case "progress": {
        st.clock.set(patch.position, patch.playing, nowMs());
        st.lastActive = nowMs();
        st.foreground = ctx.env?.().foreground !== false;
        if (st.idle) {
          st.idle = false;
          S.setAttr("idle", "0");
        }
        if (!st.animations) S.paintOnce();
        else S.wake();
        break;
      }

      case "state": {
        const pb = ctx.playback?.() || {};
        st.clock.set(pb.position, pb.playing, nowMs());
        st.lastActive = nowMs();
        S.setAttr("playing", st.clock.playing ? "1" : "0");
        if (!st.animations) S.paintOnce();
        else S.wake();
        break;
      }

      case "options":
        S.applyEnv();
        S.syncLines();
        S.relayout();
        if (!st.animations) S.paintOnce();
        else S.wake();
        break;

      case "theme":
        S.wake();
        break;

      case "resize":
        S.resize();
        if (!st.animations) S.paintOnce();
        else S.wake();
        break;

      case "close":
        S.stopFrames();
        if (S.bgRoot) S.bgRoot.hidden = true;
        break;

      default:
        // destroy 之前宿主还会推最后一次 destroy —— 那时不做事，等 destroy()
        if (type !== "destroy") S.wake();
    }
  },

  /* ========================================================================
     destroy：宿主只清自己的挂载点，**整窗背景层的容器不清**
     ======================================================================== */
  destroy(ctx) {
    if (!S) return;
    const { st, elRoot, elCanvas, bgRoot, onPointerMove, onPointerLeave } = S;
    st.alive = false;
    if (st.raf) cancelAnimationFrame(st.raf);
    st.raf = 0;
    if (st.backdropTimer) clearTimeout(st.backdropTimer);
    st.backdropTimer = 0;
    elCanvas.removeEventListener("pointermove", onPointerMove);
    elCanvas.removeEventListener("pointerleave", onPointerLeave);
    juice.clearJuice(st.juicePool);
    juice.clearHalves(st.halfPool);
    st.juicePool = null;
    st.halfPool = null;
    st.slashes = [];
    st.bursts = [];
    st.stains = [];
    st.seats = [];
    st.glyphEls = [];
    st.kinds = null;
    st.plan = null;
    st.kindColors = [];
    st.vars.clear();
    st.glyphX = new Float32Array(0);
    st.glyphY = new Float32Array(0);
    st.fills = new Float32Array(0);
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

/* ==========================================================================
   自检脚本用的内部探针（宿主不会碰；契约里没有这一项，只是本包的测试窗口）
   ========================================================================== */
export function __probe() {
  const st = S?.st;
  if (!st) return null;
  let inFlight = 0;
  let cuts = 0;
  let pointerCuts = 0;
  const seats = [];
  for (let k = 0; k < st.seats.length; k += 1) {
    const seat = st.seats[k];
    if (!seat) continue;
    if (seat.cut) cuts += 1;
    else if (st.pos >= seat.tossAt && st.pos < seat.slashAt) inFlight += 1;
    if (seat.cut && seat.byPointer) pointerCuts += 1;
    // 自检要能瞄准"这一枚水果现在到底在哪"（指针是刀，必须真的划到它）
    const span = Math.max(1, seat.slashAt - seat.tossAt);
    const q = Math.min(1, Math.max(0, (st.pos - seat.tossAt) / span));
    seats.push({
      k,
      kind: seat.kind,
      rad: seat.rad,
      cut: seat.cut,
      byPointer: seat.byPointer,
      flying: !seat.cut && st.pos >= seat.tossAt && st.pos < seat.slashAt,
      tossAt: seat.tossAt,
      slashAt: seat.slashAt,
      fillAt: seat.fillAt,
      x: st.glyphX[k] + seat.drift * (1 - q),
      y: st.groundY - (st.groundY - st.apexY) * util.arcRise(q),
    });
  }
  return {
    pos: st.pos,
    lineIndex: st.lineIndex,
    count: st.plan?.count || 0,
    synth: st.plan ? st.plan.synth : null,
    starts: st.plan ? st.plan.starts.slice() : [],
    throws: st.plan ? st.plan.throws.map((t) => ({ tossAt: t.tossAt, slashAt: t.slashAt })) : [],
    lit: st.lastLit,
    fills: Array.from(st.fills),
    texts: st.glyphEls.map((el) => el.textContent),
    fillsAttr: st.glyphEls.map((el) => el.style.getPropertyValue("--g")),
    inFlight,
    cuts,
    pointerCuts,
    seats,
    juice: st.juicePool ? st.juicePool.n : 0,
    halves: st.halfPool ? st.halfPool.n : 0,
    halfSpread: st.halfPool ? juice.halvesSpread(st.halfPool) : 0,
    juiceCentroid: st.juicePool ? juice.juiceCentroid(st.juicePool) : null,
    combo: st.combo.value(st.pos),
    bomb: st.activeBomb
      ? {
          riseAt: st.activeBomb.riseAt,
          apexAt: st.activeBomb.apexAt,
          detonateAt: st.activeBomb.detonateAt,
          fired: !!st.activeBomb.fired,
          carry: st.carryBomb === st.activeBomb,
        }
      : null,
    bursts: st.bursts.length,
    slashes: st.slashes.length,
    stains: st.stains.length,
    geometry: {
      w: st.w,
      h: st.h,
      dpr: st.dpr,
      fieldTop: st.fieldTop,
      lineY: st.lineY,
      lineH: st.lineH,
      groundY: st.groundY,
      apexY: st.apexY,
      floorY: st.floorY,
      fs: st.fs,
      glyphX: Array.from(st.glyphX),
      glyphY: Array.from(st.glyphY),
    },
    bowl: st.bowl
      ? {
          gray: st.bowl.gray,
          source: st.bowl.source,
          hue: st.bowl.hue,
          bgHex: st.bowl.bgHex,
          fgHex: st.bowl.fgHex,
          juiceHex: st.bowl.juiceHex,
          boardHex: palette.toHex(st.bowl.board),
        }
      : null,
    contrast: st.bowl
      ? {
          ink: palette.contrastRatio(st.bowl.board, st.inkRgb),
          unlit: palette.contrastRatio(st.bowl.board, st.unlitRgb),
          juice: palette.contrastRatio(st.bowl.board, st.bowl.juice),
        }
      : null,
    inkHex: palette.toHex(st.inkRgb),
    unlitHex: palette.toHex(st.unlitRgb),
    boardHex: st.bowl ? palette.toHex(st.bowl.board) : "#000000",
    attrs: { ...S.elRoot.dataset },
    drew: st.drew,
    idle: st.idle,
    lod: st.lod,
    animations: st.animations,
    interactive: st.interactive,
    performance: st.performanceMode,
    foreground: st.foreground,
    narrow: st.narrow,
    bass: st.bass,
    high: st.high,
    flux: st.flux,
    duration: st.duration,
    kinds: st.kinds ? Array.from(st.kinds) : [],
  };
}
