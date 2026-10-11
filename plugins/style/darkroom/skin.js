/* ==========================================================================
   darkroom/skin.js — 第三方样式「暗房」
   --------------------------------------------------------------------------
   一句话：**整块舞台是一张正在显影的胶片。**
   halation 高光溢出、色差、颗粒、扫描线、快门开合，全部由 CSS 叠层完成；
   JS 每帧只写三个数字（--dr-bloom / --dr-grain / --dr-hal），其余交给合成器。

   极限轴：**后期 / 光** —— 不用 WebGL、不用 canvas 绘制，把"封面 + 歌词"
   冲洗成一张胶片。设计规格见 plugins/style/pending-designs.md 01。

   与宿主的分工（契约 v3）：
     · 数据只从 ctx 拿，动作只走 ctx.actions；本包零裸包名 import；
     · 整窗背景层：容器是宿主的（ctx.backgroundRoot），**内容是本包填的**
       —— 因此不依赖宿主 background-layer.js 的骨架样式；
     · 歌词：本包自己渲染（不用 sdk.createFxLyrics）—— 这样"逐字点亮"与
       "色差 / halation"都长在自己的 DOM 上，也不用依赖宿主的骨架样式表；
     · 想影响宿主壳（标题栏 / 底栏）的观感只有一条合法通道：
       清单 colors（静态兜底）+ ctx.actions.reportBackdrop()（随封面动态上报）。

   ★ 子模块为什么用 `await import()` 而不是静态 import
     `/skins/` 是逐文件鉴权的：入口被加载成 `/skins/darkroom/skin.js?t=sk_xxx`，
     而 ES 模块解析相对说明符时**只保留路径、丢掉 query**，写静态 import 会去
     请求没带 token 的 `/skins/darkroom/lib/color.js` → 403，报错还挂在入口上。
     这里把入口 URL 上的 query 原样透传给子模块。浏览器预览没有 query，
     透传的是空串，退化成普通相对导入 —— 两种环境都成立。

   ★ 性能纪律（docs/36 实测：全屏大半径模糊是每帧最贵的操作之一）
     · filter 只在两处设一次（背景层大图、bloom 层），运行期**只动
       opacity / transform**，绝不逐帧改 filter/blur 值；
     · 只有一条 rAF；暂停 6 秒后停帧；performance 档按清单 budgetFps 限帧；
     · animations:false 或 prefers-reduced-motion 时**完全不跑帧循环**
       （只画一帧静态画面），画面依然完整。
   ========================================================================== */

const Q = new URL(import.meta.url).search;
const load = (file) => import(`./lib/${file}${Q}`);

const color = await load("color.js");
const film = await load("film.js");
const timing = await load("lyric-timing.js");

/** 暂停后停帧的时长（宿主约定，见 docs/37：两个帧率档都生效） */
const IDLE_STOP_MS = 6000;
/** 文字比声音略慢一点（胶片质感）。规格里的"延迟补偿"就是这一行 */
const VISUAL_LAG_MS = 80;
/** 逐字点亮的量化档数：写 DOM 的次数由此降一个数量级，平滑交给 CSS 过渡 */
const G_STEPS = 8;
/** 清单 performance.budgetFps 的同源值（performance 档用） */
const BUDGET_FPS = 30;

/** 舞台骨架（选择器相对舞台根，宿主会整体包进 @layer skin + @scope） */
const SHELL = `
  <div class="dr">
    <div class="dr__bloom" aria-hidden="true"></div>
    <div class="dr__ly" role="list"><div class="dr__list"></div></div>
    <div class="dr__empty"></div>
    <div class="dr__hud">
      <div class="dr__title"></div>
      <div class="dr__sub"><span class="dr__tc">00:00</span><span class="dr__roll"></span></div>
    </div>
    <div class="dr__frame" aria-hidden="true"></div>
    <div class="dr__scan" aria-hidden="true"></div>
    <div class="dr__grain" aria-hidden="true"></div>
    <div class="dr__vig" aria-hidden="true"></div>
    <div class="dr__gate dr__gate--top" aria-hidden="true"></div>
    <div class="dr__gate dr__gate--bottom" aria-hidden="true"></div>
  </div>`;

/** 整窗背景层的内容（容器由宿主提供并定位，见 skin.css 的 .drbg 段） */
const BG_SHELL = `
  <div class="drbg">
    <img class="drbg__img" alt="" />
    <div class="drbg__veil" aria-hidden="true"></div>
  </div>`;

/** 当前实例（换样式会先 destroy 再 mount，因此是单例） */
let S = null;

function nowMs() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

export default {
  id: "darkroom",
  name: "暗房",

  mount(ctx) {
    const { html } = ctx.sdk;
    const dr = ctx.root;
    dr.innerHTML = SHELL;

    const elRoot = dr.querySelector(".dr");
    const elBloom = dr.querySelector(".dr__bloom");
    const elLy = dr.querySelector(".dr__ly");
    const elList = dr.querySelector(".dr__list");
    const elEmpty = dr.querySelector(".dr__empty");
    const elTitle = dr.querySelector(".dr__title");
    const elSub = dr.querySelector(".dr__sub");
    const elTc = dr.querySelector(".dr__tc");
    const elRoll = dr.querySelector(".dr__roll");

    /** 所有可变状态都挂在这里：update() / destroy() 都只碰它 */
    const st = {
      alive: true,
      raf: 0,
      last: 0,
      lastActive: nowMs(),
      idle: false,
      animations: true,
      interactive: true,
      // 歌词
      lines: [],
      lineEls: [],
      spans: [],
      wordAligned: [],
      gCache: [],
      activeIndex: -1,
      lastLyH: -1,
      // 视觉量
      vars: new Map(),
      bloom: 0.16,
      grain: 0.18,
      hal: 0,
      tcText: "",
      // 频谱
      specSeen: false,
      lastOnsetAt: -1e9,
      // 封面取色
      sampleSrc: "",
      backdropTimer: 0,
      backdropPending: null,
      shutterTimer: 0,
    };

    // 整窗背景层：容器归宿主，内容归本样式（因此不依赖宿主 background-layer.js 的骨架样式）
    const bgRoot = ctx.backgroundRoot || null;
    let bgImg = null;
    if (bgRoot) {
      bgRoot.innerHTML = BG_SHELL;
      bgImg = bgRoot.querySelector(".drbg__img");
      if (bgImg) {
        bgImg.onload = () => {
          if (st.alive) bgImg.dataset.ready = "1";
        };
      }
    }

    const clock = timing.createClock({ maxExtrapolateMs: 1200 });
    const fluxWin = film.createFluxWindow(48);
    const specPrev = new Float32Array(128);
    const specCur = new Float32Array(128);

    const opts = () => ctx.options() || {};
    const env = () => ctx.env() || {};
    const media = () => ctx.media() || {};

    /** 字素切分：必须与宿主 words 的下标用**同一份切法** */
    function split(text) {
      const s = String(text ?? "");
      try {
        const r = ctx.sdk.splitGraphemes(s);
        return Array.isArray(r) ? r : Array.from(s);
      } catch {
        return Array.from(s);
      }
    }

    /** 只写变化过的 CSS 变量（每帧 setProperty 也要省着用） */
    function setVar(name, value) {
      const v = String(value);
      if (st.vars.get(name) === v) return;
      st.vars.set(name, v);
      elRoot.style.setProperty(name, v);
    }

    /* ---------------------------------------------------------------------
       环境与设置
       --------------------------------------------------------------------- */

    function applyEnv() {
      const o = opts();
      const e = env();

      const wasInteractive = st.interactive;
      st.animations = o.animations !== false && e.reducedMotion !== true;
      st.interactive = o.interactive !== false;

      if (st.animations) elRoot.removeAttribute("data-static");
      else elRoot.dataset.static = "1";

      // performance 档：颗粒层动画停下（静态图），这是规格里的降级项之一
      if (o.performanceMode === "performance") elRoot.dataset.perf = "1";
      else elRoot.removeAttribute("data-perf");

      if (st.interactive) elRoot.dataset.interactive = "1";
      else elRoot.removeAttribute("data-interactive");

      // 宿主设置里的歌词字号：本样式必须尊重（不能自己另开一套）
      const fs = Number(o.lyricsFontSize);
      if (Number.isFinite(fs) && fs > 0) setVar("--dr-fs", `${Math.round(fs)}px`);

      if (st.interactive !== wasInteractive) buildLyrics();
    }

    /* ---------------------------------------------------------------------
       封面 → 背景层 / bloom 层 / 宿主壳配色
       --------------------------------------------------------------------- */

    function paintSong() {
      const m = media();
      const song = m.song || html.EMPTY_TRACK;
      const src = m.cover || ctx.defaultCover || "";

      elTitle.textContent = song.title || "未在播放";
      elSub.textContent = html.subtitleOf(song.artist, song.album);
      elRoll.textContent = song.kind === "online" ? "试听" : `片号 ${rollLabel(song.id)}`;

      // bloom 层用 background-image（只在这一层设 filter，运行期只动 opacity/transform）
      elBloom.style.backgroundImage = film.cssUrl(src);
      // 背景层的大图：走宿主的兜底逻辑（加载失败退回默认封面）
      if (bgImg) html.setCoverImage(bgImg, src, ctx.defaultCover);
      if (bgRoot) bgRoot.hidden = false;

      sampleCover(src);
    }

    /** 把曲目 id 稳定地映射成一个"片号"：同一首歌永远是同一个号 */
    function rollLabel(id) {
      const s = String(id || "");
      let h = 2166136261;
      for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return String((h >>> 0) % 10000).padStart(4, "0");
    }

    /**
     * 每首歌只采一次封面（data URL 重新解码很贵）。
     * 采样失败（无封面 / 图坏了）时保持默认配色，不报错、不重试。
     */
    async function sampleCover(src) {
      if (!src || src === st.sampleSrc) return;
      st.sampleSrc = src;
      try {
        const img = new Image();
        img.decoding = "async";
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = () => rej(new Error("cover load failed"));
          img.src = src;
        });
        const c = document.createElement("canvas");
        c.width = 96;
        c.height = 96;
        const g = c.getContext("2d", { willReadFrequently: true });
        if (!g) return;
        g.drawImage(img, 0, 0, 96, 96);
        const data = g.getImageData(0, 0, 96, 96).data;
        if (!st.alive) return;
        const sample = color.samplePixels(data, { step: 2 });
        applyPalette(color.backdropFromSample(sample, color.DARKROOM_PALETTE));
      } catch {
        /* 取不到封面：保持默认配色 */
      }
    }

    function applyPalette(pal) {
      setVar("--dr-accent", pal.accent);
      st.backdropPending = { bg: pal.bg, fg: pal.fg };
      if (st.backdropTimer) return; // ≥300ms 防抖：轮播/连续换图不会打爆 IPC
      st.backdropTimer = setTimeout(() => {
        st.backdropTimer = 0;
        const payload = st.backdropPending;
        st.backdropPending = null;
        if (payload && st.alive) ctx.actions?.reportBackdrop?.(payload);
      }, 400);
    }

    /* ---------------------------------------------------------------------
       歌词
       --------------------------------------------------------------------- */

    function buildLyrics() {
      const ly = media().lyrics || {};
      const lines = Array.isArray(ly.lines) ? ly.lines : [];
      const showLyrics = opts().showLyrics !== false;

      st.lines = lines;
      st.lineEls = [];
      st.spans = [];
      st.wordAligned = [];
      st.gCache = [];
      st.activeIndex = -1;
      elList.innerHTML = "";

      if (!lines.length || !showLyrics) {
        elLy.hidden = true;
        if (!lines.length) {
          elEmpty.textContent = html.lyricsEmptyText(ly);
          elEmpty.hidden = false;
        } else {
          elEmpty.hidden = true;
        }
        setVar("--dr-shift", "0px");
        return;
      }

      elLy.hidden = false;
      elEmpty.hidden = true;

      const frag = document.createDocumentFragment();
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] || {};
        const { main, trans } = timing.displayText(line);
        const glyphs = split(main);

        const row = document.createElement("div");
        row.className = "dr__line";
        row.dataset.index = String(i);
        row.dataset.state = "todo";
        row.dataset.time = String(Number(line.time) || 0);

        const textEl = document.createElement("span");
        textEl.className = "dr__text";
        for (let k = 0; k < glyphs.length; k += 1) {
          const g = document.createElement("span");
          g.className = "dr__g";
          g.textContent = glyphs[k];
          textEl.appendChild(g);
        }
        row.appendChild(textEl);
        if (trans) {
          const t = document.createElement("span");
          t.className = "dr__trans";
          t.textContent = trans;
          row.appendChild(t);
        }
        if (st.interactive) {
          row.tabIndex = 0;
          row.setAttribute("role", "button");
          row.setAttribute("aria-label", `${main || "间奏"}（跳到这一句）`);
        }

        const units = Array.from(textEl.querySelectorAll(".dr__g"));
        st.lineEls.push(row);
        st.spans.push(units);
        // words 数量与字素数不一致时**不逐字**（下标会串位，宁可退回逐行）
        const wc = Array.isArray(line.words) ? line.words.length : 0;
        st.wordAligned.push(wc > 0 && wc === units.length);
        st.gCache.push(new Float32Array(units.length).fill(-1));
        frag.appendChild(row);
      }
      elList.appendChild(frag);

      st.lastLyH = -1;
      syncShift();
      paintPosition(Math.max(0, clock.at(nowMs()) - VISUAL_LAG_MS), nowMs());
    }

    /** 把当前行挪到可视区中央（位移交给 CSS 过渡，只写一个变量） */
    function syncShift() {
      const idx = st.activeIndex;
      const row = idx >= 0 ? st.lineEls[idx] : null;
      if (!row || elLy.hidden) {
        setVar("--dr-shift", "0px");
        return;
      }
      const h = elLy.clientHeight || 0;
      setVar("--dr-shift", `${Math.round(h / 2 - (row.offsetTop + row.offsetHeight / 2))}px`);
    }

    function setActive(idx) {
      const prev = st.activeIndex;
      st.activeIndex = idx;
      for (let i = 0; i < st.lineEls.length; i += 1) {
        const state = i === idx ? "active" : i < idx ? "past" : "todo";
        if (st.lineEls[i].dataset.state !== state) st.lineEls[i].dataset.state = state;
      }
      // -1 = "未写过"，强制重画这两行（来回 seek 时状态才对）
      if (idx >= 0 && st.gCache[idx]) st.gCache[idx].fill(-1);
      if (prev >= 0 && prev !== idx && st.gCache[prev]) st.gCache[prev].fill(-1);
      syncShift();
    }

    function paintPosition(pos, t) {
      const idx = timing.lineIndexAt(st.lines, pos);
      if (idx !== st.activeIndex) setActive(idx);
      if (idx >= 0) paintGlyphs(idx, pos);
      const tc = film.timecode(pos);
      if (tc !== st.tcText) {
        st.tcText = tc;
        elTc.textContent = tc;
      }
      void t;
    }

    function paintGlyphs(idx, pos) {
      const units = st.spans[idx];
      const cache = st.gCache[idx];
      if (!units || !units.length || !cache) return;
      const line = st.lines[idx] || {};
      const src = st.wordAligned[idx] ? line : { time: line.time, text: line.text };
      const prog = timing.graphemeProgress(units.length, src, st.lines[idx + 1] || null, pos, G_STEPS);
      for (let k = 0; k < units.length; k += 1) {
        const v = prog[k];
        if (cache[k] === v) continue;
        cache[k] = v;
        units[k].style.setProperty("--g", String(v));
      }
    }

    /* ---------------------------------------------------------------------
       帧循环
       --------------------------------------------------------------------- */

    function budgetMs() {
      const pb = ctx.playback() || {};
      const mode = opts().performanceMode === "performance" ? "performance" : "smooth";
      return film.frameBudgetMs(mode, pb.playing !== false, BUDGET_FPS, 20);
    }

    function schedule() {
      if (!st.alive || st.raf) return;
      st.raf = requestAnimationFrame(tick);
    }

    function tick(t) {
      st.raf = 0;
      if (!st.alive) return;
      const minFrame = budgetMs();
      if (minFrame > 0 && st.last && t - st.last < minFrame - 1) {
        schedule();
        return;
      }
      if (film.idleExpired(t, st.lastActive, IDLE_STOP_MS)) {
        enterIdle();
        return;
      }
      paint(t);
      schedule();
    }

    function enterIdle() {
      st.idle = true;
      elRoot.dataset.idle = "1";
      if (st.raf) {
        cancelAnimationFrame(st.raf);
        st.raf = 0;
      }
    }

    /** 唤醒：任何一条宿主补丁都会把循环拉起来（停帧不是"死掉"） */
    function wake() {
      st.idle = false;
      elRoot.removeAttribute("data-idle");
      // 播放中刷新"最后活跃时刻"：否则从后台回来时会被上一轮的 6 秒判定
      // 直接按回停帧状态（tick 的停帧判断在 paint 之前）
      const pb = ctx.playback() || {};
      if (pb.playing !== false) st.lastActive = nowMs();
      if (st.animations) schedule();
    }

    function paint(t) {
      const dt = film.clampDt(t - (st.last || t - 16));
      st.last = t;

      const pb = ctx.playback() || {};
      if (pb.playing) st.lastActive = t;

      // 画面自身布局变化（详情页刚打开时舞台高度为 0）自愈
      if (!elLy.hidden) {
        const h = elLy.clientHeight;
        if (h !== st.lastLyH) {
          st.lastLyH = h;
          syncShift();
        }
      }

      // —— 频谱 → 三个视觉量 ——
      let targetBloom = 0.16;
      let targetGrain = 0.18;
      const spec = typeof ctx.spectrum === "function" ? ctx.spectrum() : null;
      if (spec && spec.bands && spec.bands.length) {
        const n = Math.min(specCur.length, spec.bands.length);
        for (let i = 0; i < n; i += 1) specCur[i] = Number(spec.bands[i]) || 0;
        if (st.specSeen) {
          const flux = film.fluxOf(specPrev, specCur);
          const th = fluxWin.threshold(1.6);
          if (film.shouldOnset({ flux, threshold: th, lastOnsetAt: st.lastOnsetAt, now: t, cooldownMs: 260 })) {
            st.lastOnsetAt = t;
            st.hal = Math.min(1, st.hal + 0.9);
          }
          fluxWin.push(flux);
        }
        specPrev.set(specCur);
        st.specSeen = true;
        const sum = film.bandSummary(specCur);
        targetBloom = sum.low;
        targetGrain = sum.high;
      }

      st.bloom = film.approach(st.bloom, targetBloom, dt, 380);
      st.grain = film.approach(st.grain, targetGrain, dt, 520);
      st.hal = film.approach(st.hal, 0, dt, 260);

      setVar("--dr-bloom", film.fmt3(st.bloom));
      setVar("--dr-grain", film.fmt3(st.grain));
      setVar("--dr-hal", film.fmt3(st.hal));

      // —— 歌词：视觉比声音慢一点点 ——
      paintPosition(Math.max(0, clock.at(t) - VISUAL_LAG_MS), t);
    }

    /** 静止形态：只画一帧（不进帧循环） */
    function paintOnce() {
      if (!st.alive) return;
      paint(nowMs());
    }

    function requestPaint() {
      if (!st.alive) return;
      if (!st.animations) {
        paintOnce();
        return;
      }
      wake();
    }

    function stop() {
      if (st.raf) {
        cancelAnimationFrame(st.raf);
        st.raf = 0;
      }
      st.idle = true;
      elRoot.dataset.idle = "1";
    }

    /** 换歌：快门闭合 → 换图 → 打开（唯一的"转场"） */
    function shutter() {
      if (st.shutterTimer) {
        clearTimeout(st.shutterTimer);
        st.shutterTimer = 0;
      }
      if (!st.animations) {
        elRoot.dataset.shutter = "open";
        return;
      }
      elRoot.dataset.shutter = "shut";
      st.shutterTimer = setTimeout(() => {
        st.shutterTimer = 0;
        if (st.alive) elRoot.dataset.shutter = "open";
      }, 140);
    }

    /* ---------------------------------------------------------------------
       交互
       --------------------------------------------------------------------- */

    const onListClick = (ev) => {
      if (!st.interactive) return;
      const row = ev.target?.closest?.(".dr__line");
      if (!row || !elList.contains(row)) return;
      ctx.actions?.seek?.(Number(row.dataset.time) || 0);
    };

    const onListKey = (ev) => {
      if (!st.interactive) return;
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const row = ev.target?.closest?.(".dr__line");
      if (!row) return;
      ev.preventDefault();
      ctx.actions?.seek?.(Number(row.dataset.time) || 0);
    };

    elList.addEventListener("click", onListClick);
    elList.addEventListener("keydown", onListKey);

    /* ---------------------------------------------------------------------
       首帧
       --------------------------------------------------------------------- */

    applyEnv();
    elRoot.dataset.shutter = "open";
    paintSong();
    const pb0 = ctx.playback() || {};
    clock.set(pb0.position || 0, pb0.playing !== false, nowMs());
    buildLyrics();
    requestPaint();

    S = {
      ctx,
      st,
      elRoot,
      elList,
      bgRoot,
      clock,
      onListClick,
      onListKey,
      applyEnv,
      paintSong,
      buildLyrics,
      syncShift,
      requestPaint,
      stop,
      shutter,
      wake,
    };
  },

  update(ctx, patch) {
    if (!S || !S.st.alive) return;
    const st = S.st;
    const type = patch?.type;

    switch (type) {
      case "mount":
        S.applyEnv();
        S.paintSong();
        S.buildLyrics();
        S.wake();
        break;

      case "song": {
        const pb = ctx.playback() || {};
        S.clock.set(pb.position || 0, pb.playing !== false, nowMs());
        S.shutter();
        S.paintSong();
        S.buildLyrics();
        S.wake();
        break;
      }

      case "media":
        S.paintSong();
        S.wake();
        break;

      case "lyrics":
        S.buildLyrics();
        S.wake();
        break;

      case "progress":
        S.clock.set(patch.position, patch.playing, nowMs());
        S.requestPaint();
        break;

      case "state": {
        const pb = ctx.playback() || {};
        S.clock.set(pb.position, pb.playing, nowMs());
        S.requestPaint();
        break;
      }

      case "options":
        S.applyEnv();
        S.syncShift();
        S.requestPaint();
        break;

      case "resize":
        st.lastLyH = -1;
        S.syncShift();
        S.requestPaint();
        break;

      case "visibility":
        if (patch.foreground === false) S.stop();
        else S.wake();
        break;

      case "close":
        S.stop();
        if (S.bgRoot) S.bgRoot.hidden = true;
        break;

      case "chrome":
      case "theme":
        S.requestPaint();
        break;

      default:
        S.requestPaint();
    }
  },

  /**
   * 卸载。宿主只会清自己的挂载点（ctx.root），**整窗背景层的容器不清**
   * —— 所以这里必须自己把背景层恢复成"空且隐藏"，否则换样式后会留下一张
   * 孤儿背景图盖在界面上（背景层是 fixed 的，肉眼表现为"界面糊了一层"）。
   */
  destroy(ctx) {
    if (!S) return;
    const { st, elRoot, elList, bgRoot, onListClick, onListKey } = S;
    st.alive = false;
    if (st.raf) cancelAnimationFrame(st.raf);
    if (st.shutterTimer) clearTimeout(st.shutterTimer);
    if (st.backdropTimer) clearTimeout(st.backdropTimer);
    st.raf = 0;
    st.shutterTimer = 0;
    st.backdropTimer = 0;
    elList.removeEventListener("click", onListClick);
    elList.removeEventListener("keydown", onListKey);
    st.lines = [];
    st.lineEls = [];
    st.spans = [];
    st.gCache = [];
    st.vars.clear();
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
