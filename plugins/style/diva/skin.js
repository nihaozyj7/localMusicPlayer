/* ==========================================================================
   diva/skin.js — 「虚拟歌姬 · 全息演唱会」插件入口（契约 v3）
   --------------------------------------------------------------------------
   一句话：**一座会跟着歌呼吸的全息演唱会舞台。**
     · 中央是程序化绘制的全息歌姬（lib/diva.js）：随人声开合口型、按节拍
       摆身、会眨眼、发丝与裙摆按频谱飘动；
     · 背后是深空舞台（lib/stage.js）：巨型全息光环、扫描刻度、体积光、
       地面透视网格与升腾的光尘；
     · 底部是卡拉 OK 提词器（lib/lyrics.js）：逐字素点亮 + 双语翻译 +
       点击跳转；顶部 HUD（lib/hud.js）显示 LIVE 状态 / 曲目 / 时间码 ×2；
     · 配色由封面低频取色（lib/palette.js）微调，但始终收在冷色霓虹带里。

   契约纪律（v3）：
     · 零裸包名 import（只 import 本包目录内的相对模块）；
     · 不轮询：全包只有一条 requestAnimationFrame（暂停 6 秒后自己停，
       任何一条宿主补丁都能把它拉起来）；
     · 不碰 window / 文档根元素（documentElement），不发网络请求；
     · 频谱是拉取式：只在帧循环里现取（清单已声明 capabilities.spectrum）；
     · 所有可读文字都让开宿主壳：`--skin-inset-top` / `--skin-inset-bottom`。

   ★ 为什么子模块是 `await import(...)` 而不是静态 import（别改成静态的）
     /skins/ 是**逐文件**鉴权的：入口被加载成
         /skins/diva/skin.js?t=sk_xxx
     而 ES 模块解析相对说明符时**只保留路径、丢掉 query**，静态 import 会去
     请求没带 t 的子模块 → 403。这里把入口 URL 上的 query 原样透传；
     子模块内部的依赖也各自透传（它们的 import.meta.url 已经带着 token）。
     浏览器预览没有 query，透传空串，退化成普通相对导入 —— 两种环境都成立。
   ========================================================================== */

const Q = new URL(import.meta.url).search;
const load = (file) => import(`./lib/${file}${Q}`);

const { LAYOUT, PALETTE, PERF, TIMING, UI, computeLayout } = await load("config.js");
const { clamp, rgba } = await load("util.js");
const { createAnalyser } = await load("spectrum.js");
const { createStage } = await load("stage.js");
const { createDiva } = await load("diva.js");
const { createLyricsView } = await load("lyrics.js");
const { createHud } = await load("hud.js");
const { createPalette } = await load("palette.js");

/** 舞台 DOM（所有选择器相对这个根） */
const SHELL = `
  <div class="dv" data-dv-ready="0" data-dv-interactive="1" data-dv-anim="1"
       data-dv-idle="0" data-dv-perf="0" data-dv-narrow="0" data-dv-tiny="0"
       data-dv-foreground="1" data-dv-frames="0" data-dv-spec="0" data-dv-beat="0">
    <canvas class="dv__canvas" aria-hidden="true"></canvas>
    <div class="dv__scrim dv__scrim--top" aria-hidden="true"></div>
    <div class="dv__scrim dv__scrim--bottom" aria-hidden="true"></div>
    <div class="dv__frame" aria-hidden="true">
      <span class="dv__corner dv__corner--tl"></span>
      <span class="dv__corner dv__corner--tr"></span>
      <span class="dv__corner dv__corner--bl"></span>
      <span class="dv__corner dv__corner--br"></span>
    </div>
    <div class="dv__hud"></div>
    <div class="dv__lyrics"></div>
    <div class="dv__hint" hidden></div>
  </div>`;

/** 整窗背景层（进出场那几帧露出来的同色夜空） */
const BG_SHELL = `
  <div class="dv-bg" aria-hidden="true">
    <div class="dv-bg__aurora dv-bg__aurora--a"></div>
    <div class="dv-bg__aurora dv-bg__aurora--b"></div>
    <div class="dv-bg__veil"></div>
  </div>`;

/** 运行期状态（宿主切样式会先 destroy 再 mount，因此是单例） */
let S = null;

/** 当前规格的 frame 快照对象（每帧复用，避免 GC） */
function makeFrame(layout) {
  return {
    w: layout.w,
    h: layout.h,
    dpr: 1,
    t: 0,
    dt: 1 / 60,
    now: 0,
    layout,
    playing: false,
    pos: 0,
    duration: 0,
    progress: 0,
    lyricIndex: -1,
    reduced: false,
    perf: false,
    narrow: layout.narrow,
    tiny: layout.tiny,
    palette: { ...PALETTE },
    spec: null,
    beat: 0,
    energy: 0,
  };
}

export default {
  id: "diva",

  mount(ctx) {
    if (S) this.destroy(ctx);

    ctx.root.innerHTML = SHELL;
    if (ctx.backgroundRoot) ctx.backgroundRoot.innerHTML = BG_SHELL;

    const el = ctx.root.querySelector(".dv");
    const canvas = ctx.root.querySelector(".dv__canvas");
    if (!el || !canvas) return;
    const g = canvas.getContext("2d", { alpha: true });
    if (!g) {
      ctx.root.innerHTML = '<div class="dv" style="color:#eaf6ff;padding:24px">当前环境不支持 Canvas2D，无法渲染全息舞台。</div>';
      return;
    }

    const env = ctx.env();
    const options = ctx.options();
    const media = ctx.media();
    const layout = computeLayout(env.width || 1280, env.height || 820);

    const st = {
      ctx,
      sdk: ctx.sdk,
      el,
      canvas,
      g,
      root: ctx.root,
      layout,
      frame: makeFrame(layout),
      dpr: 1,
      t0: performance.now(),
      lastDrawTs: 0,
      lastTs: 0,
      frames: 0,
      raf: 0,
      destroyed: false,
      anim: true,
      perf: false,
      narrow: layout.narrow,
      idle: false,
      lastActive: performance.now(),
      pos: Number(media?.song ? 0 : 0),
      posAt: performance.now(),
      playing: Boolean(ctx.playback().playing),
      duration: Number(media?.song?.duration) || 0,
      lyricIndex: Number.isFinite(media?.lyrics?.index) ? media.lyrics.index : -1,
      env,
      options,
      media,
      volume: 1,
      paletteNow: { ...PALETTE },
      reportAt: 0,
      timers: [],
      hintShown: false,
      analyser: createAnalyser({ bands: 128 }),
      stage: createStage(),
      diva: createDiva(),
      hud: createHud(el.querySelector(".dv__hud")),
      lyrics: createLyricsView(el.querySelector(".dv__lyrics"), {
        sdk: ctx.sdk,
        interactive: options.interactive !== false,
        onSeek: (ms) => {
          if (st.options.interactive === false) return;
          st.lastActive = performance.now();
          ctx.actions.seek(ms);
        },
      }),
      palette: null,
      onCanvasClick: null,
    };

    st.palette = createPalette({
      onApply: (p) => {
        if (!S || S.destroyed) return;
        st.paletteNow = p;
        st.el.style.setProperty("--dv-accent", p.accent);
        st.el.style.setProperty("--dv-violet", p.violet);
        st.el.style.setProperty("--dv-pink", p.pink);
        st.el.style.setProperty("--dv-glow", rgba(p.accent, 0.55));
        const now = performance.now();
        if (!st.reportAt || now - st.reportAt > 400) {
          st.reportAt = now;
          try {
            st.ctx.actions.reportBackdrop({ bg: p.bg, fg: p.fg, accent: p.accent });
          } catch {
            /* 动作在只读舞台上是空实现，忽略 */
          }
        }
      },
    });

    // 交互：点舞台 = 播放 / 暂停（歌词行自己的 click 会吞掉事件，走 seek）
    st.onCanvasClick = () => {
      if (st.options.interactive === false) return;
      st.lastActive = performance.now();
      st.ctx.actions.togglePlay();
    };
    canvas.addEventListener("click", st.onCanvasClick);

    S = st;

    // —— 首帧数据 ——
    st.hud.setTrack(media?.song, { online: media?.song?.kind === "online" });
    st.hud.setEmpty(!media?.song);
    st.lyrics.setLines(media?.lyrics?.lines || [], {
      emptyText: emptyTextOf(st, media?.lyrics),
      show: options.showLyrics !== false,
    });
    st.lyrics.setPosition(st.pos, { playing: st.playing });
    st.palette.setMode(env.mode);
    st.palette.setCover(media?.cover);

    applyLayout(st);
    applyOptions(st, options);
    st.hud.tick(st.pos, st.duration, st.playing);
    st.el.dataset.dvReady = "1";

    if (st.anim) startLoop(st);
    else renderOnce(st, performance.now());

    showHint(st);
  },

  update(ctx, patch) {
    const st = S;
    if (!st || st.destroyed || !patch) return;

    switch (patch.type) {
      case "mount":
      case "song":
      case "media": {
        const m = ctx.media();
        const pb = ctx.playback();
        st.media = m;
        st.pos = Math.max(0, Number(pb?.position) || 0);
        st.posAt = performance.now();
        st.duration = Math.max(0, Number(pb?.duration) || Number(m?.song?.duration) || 0);
        st.playing = Boolean(pb?.playing);
        st.analyser.reset();
        st.hud.setTrack(m?.song, { online: m?.song?.kind === "online" });
        st.hud.setEmpty(!m?.song);
        st.lyrics.setLines(m?.lyrics?.lines || [], {
          emptyText: emptyTextOf(st, m?.lyrics),
          show: st.options.showLyrics !== false,
        });
        st.lyrics.setPosition(st.pos, { playing: st.playing });
        st.palette.setCover(m?.cover);
        st.lyricIndex = Number.isFinite(m?.lyrics?.index) ? m.lyrics.index : -1;
        break;
      }
      case "lyrics": {
        const l = ctx.lyrics();
        st.lyrics.setLines(l?.lines || [], {
          emptyText: emptyTextOf(st, l),
          show: st.options.showLyrics !== false,
        });
        break;
      }
      case "progress": {
        st.pos = Number(patch.position) || 0;
        st.posAt = performance.now();
        if (Number.isFinite(patch.duration)) st.duration = patch.duration;
        if (typeof patch.playing === "boolean") st.playing = patch.playing;
        if (Number.isFinite(patch.lyricIndex)) st.lyricIndex = patch.lyricIndex;
        st.lyrics.setPosition(st.pos, { playing: st.playing });
        if (st.playing) st.lastActive = st.posAt;
        break;
      }
      case "state": {
        if (typeof patch.playing === "boolean") st.playing = patch.playing;
        if (typeof patch.volume === "number") st.volume = patch.volume;
        st.lyrics.setPosition(interpolatedPos(st, performance.now()), { playing: st.playing });
        if (st.playing) st.lastActive = performance.now();
        break;
      }
      case "options": {
        applyOptions(st, ctx.options());
        break;
      }
      case "theme": {
        st.env = ctx.env();
        st.palette.setMode(st.env.mode);
        break;
      }
      case "resize": {
        applyLayout(st);
        break;
      }
      case "close": {
        stopLoop(st, false);
        break;
      }
      default:
        break;
    }

    if (patch.type === "close" || patch.type === "destroy") return;
    wake(st);
  },

  destroy(ctx) {
    const st = S;
    if (!st) return;
    st.destroyed = true;
    stopLoop(st, false);
    for (const id of st.timers) clearTimeout(id);
    st.timers.length = 0;

    st.canvas.removeEventListener("click", st.onCanvasClick);

    try {
      st.stage?.destroy();
    } catch {
      /* destroy 不该连坐 */
    }
    try {
      st.diva?.destroy();
    } catch {
      /* 同上 */
    }
    try {
      st.hud?.destroy();
    } catch {
      /* 同上 */
    }
    try {
      st.lyrics?.destroy();
    } catch {
      /* 同上 */
    }
    try {
      st.palette?.destroy();
    } catch {
      /* 同上 */
    }

    const bgRoot = ctx?.backgroundRoot || st.ctx?.backgroundRoot;
    bgRoot?.querySelector?.(".dv-bg")?.remove();

    if (ctx?.root) ctx.root.innerHTML = "";
    else st.root.innerHTML = "";

    S = null;
  },
};

/* --------------------------------------------------------------------------
   内部：数据 / 布局 / 帧循环
   -------------------------------------------------------------------------- */

/** @param {any} st */
function emptyTextOf(st, lyrics) {
  try {
    return st.sdk?.html?.lyricsEmptyText?.(lyrics) ?? "暂无歌词";
  } catch {
    return "暂无歌词";
  }
}

/** @param {any} st */
function applyLayout(st) {
  const env = st.ctx.env();
  const w = Math.max(1, Math.round(env.width || st.canvas.clientWidth || 1280));
  const h = Math.max(1, Math.round(env.height || st.canvas.clientHeight || 820));
  const dprCap = st.perf ? PERF.dprCapPerf : PERF.dprCap;
  const dpr = Math.max(1, Math.min(Number(env.dpr) || 1, dprCap));
  const layout = computeLayout(w, h);

  st.env = env;
  st.layout = layout;
  st.dpr = dpr;
  st.canvas.width = Math.max(1, Math.round(w * dpr));
  st.canvas.height = Math.max(1, Math.round(h * dpr));

  st.stage.resize(w, h, dpr, layout);

  const f = st.frame;
  f.w = layout.w;
  f.h = layout.h;
  f.dpr = dpr;
  f.layout = layout;
  f.narrow = layout.narrow;
  f.tiny = layout.tiny;

  st.el.dataset.dvNarrow = layout.narrow ? "1" : "0";
  st.el.dataset.dvTiny = layout.tiny ? "1" : "0";
}

/** @param {any} st @param {any} options */
function applyOptions(st, options) {
  const prevPerf = st.perf;
  const anim = options?.animations !== false && st.env.reducedMotion !== true;
  st.options = options;
  st.anim = anim;
  st.perf = options?.performanceMode === "performance";

  const fs = clamp(Number(options?.lyricsFontSize) || 30, 18, 46);
  st.el.style.setProperty("--dv-lsize", `${fs}px`);
  st.el.dataset.dvAnim = anim ? "1" : "0";
  st.el.dataset.dvPerf = st.perf ? "1" : "0";
  st.el.dataset.dvInteractive = options?.interactive === false ? "0" : "1";

  st.lyrics.setOptions({
    fontSize: fs,
    show: options?.showLyrics !== false,
    interactive: options?.interactive !== false,
  });

  if (prevPerf !== st.perf) applyLayout(st);
  if (!anim) {
    stopLoop(st, false);
    st.el.dataset.dvAnim = "0";
  }
}

/** @param {any} st */
function showHint(st) {
  const hint = st.el.querySelector(".dv__hint");
  if (!hint || st.options?.interactive === false) return;
  hint.textContent = UI.hintPlay;
  hint.hidden = false;
  st.hintShown = true;
  st.timers.push(
    setTimeout(() => {
      if (st.destroyed) return;
      hint.dataset.fade = "1";
      st.timers.push(
        setTimeout(() => {
          if (!st.destroyed) hint.hidden = true;
        }, 560)
      );
    }, TIMING.hintMs)
  );
}

/** 任何补丁 / 交互都算「有活动」：把停掉的帧循环拉起来 */
function wake(st) {
  if (!st || st.destroyed) return;
  st.lastActive = performance.now();
  if (st.idle) {
    st.idle = false;
    st.el.dataset.dvIdle = "0";
  }
  if (st.anim) startLoop(st);
  else renderOnce(st, performance.now());
}

function startLoop(st) {
  if (!st || st.destroyed || !st.anim || st.raf) return;
  if (st.env?.foreground === false) return;
  st.lastTs = 0;
  st.raf = requestAnimationFrame((ts) => tick(st, ts));
}

function stopLoop(st, idle) {
  if (!st) return;
  if (st.raf) cancelAnimationFrame(st.raf);
  st.raf = 0;
  st.lastTs = 0;
  st.idle = Boolean(idle);
  st.el.dataset.dvIdle = idle ? "1" : "0";
}

/** 本地位置外推：宿主 progress 补丁 ~4Hz，帧之间按墙钟补 */
function interpolatedPos(st, now) {
  const dur = st.duration > 0 ? st.duration : 0;
  let pos = st.pos;
  if (st.playing) {
    const elapsed = clamp(now - st.posAt, 0, TIMING.maxInterpMs);
    pos += elapsed;
  }
  if (dur > 0) pos = Math.min(pos, dur);
  return Math.max(0, pos);
}

/** @param {any} st @param {number} ts rAF 时间戳 */
function tick(st, ts) {
  st.raf = 0;
  if (!st || st.destroyed || !st.anim) return;

  const now = performance.now();
  const dt = st.lastTs ? clamp((ts - st.lastTs) / 1000, 0.001, 0.1) : 1 / 60;
  st.lastTs = ts;

  // performance 档按清单 budgetFps 限帧
  if (st.perf && now - st.lastDrawTs < 1000 / PERF.budgetFps - 1) {
    st.raf = requestAnimationFrame((t) => tick(st, t));
    return;
  }

  // 前后台：ctx.env().foreground 为假立刻停帧（宿主切走 / 关详情页）。
  // 每 16 帧查一次，避免每帧都去读一次宿主快照。
  if ((st.frames & 15) === 0) {
    const env = st.ctx.env();
    if (env.foreground === false) {
      st.el.dataset.dvForeground = "0";
      st.lastDrawTs = now;
      return; // 不排下一帧；下一条补丁 / 重新前台会把它拉起来
    }
    st.el.dataset.dvForeground = "1";
  }

  st.lastDrawTs = now;
  const stillIdle = render(st, now, dt, true);

  if (stillIdle) {
    st.idle = true;
    st.el.dataset.dvIdle = "1";
    return;
  }
  st.raf = requestAnimationFrame((t) => tick(st, t));
}

/**
 * 画一帧。返回 true = 现在该停帧（暂停且已经安静超时）。
 * @param {any} st @param {number} now @param {number} dt @param {boolean} live 是否真的在循环里
 */
function render(st, now, dt, live) {
  const layout = st.layout;
  const f = st.frame;

  const pos = interpolatedPos(st, now);
  const dur = Math.max(0, st.duration || 0);

  // —— 频谱（拉取式：不读就不采）——
  let spec = null;
  if (live) {
    try {
      st.analyser.update(st.ctx.spectrum(), now);
    } catch {
      /* 拿不到频谱时画面退化成纯待机，不抛 */
    }
    spec = st.analyser.read();
  }

  const paletteNow = st.palette ? st.palette.current() : PALETTE;
  st.paletteNow = paletteNow;

  f.t = (now - st.t0) / 1000;
  f.dt = dt;
  f.now = now;
  f.playing = st.playing;
  f.pos = pos;
  f.duration = dur;
  f.progress = dur > 0 ? clamp(pos / dur, 0, 1) : 0;
  f.lyricIndex = st.lyricIndex;
  f.reduced = !st.anim;
  f.perf = st.perf;
  f.palette = paletteNow;
  f.spec = spec;
  f.beat = spec?.beat || 0;
  f.energy = spec?.energy || 0;

  const g = st.g;
  g.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
  g.clearRect(0, 0, layout.w, layout.h);
  try {
    st.stage.drawBack(g, f);
    st.diva.draw(g, f);
    st.stage.drawFront(g, f);
  } catch (err) {
    // 单帧绘制失败不该把整个插件带崩：打一次日志，继续跑
    if (!st.paintWarned) {
      st.paintWarned = true;
      console.warn("[diva] 绘制失败", err);
    }
  }

  // HUD / 歌词（自己内部做文本去重，不会每帧写 DOM）
  st.hud.tick(pos, dur, st.playing);
  st.lyrics.tick(now);

  // CSS 侧节奏量：节拍点缩放、空态环呼吸、提示线
  st.el.style.setProperty("--dv-beat", (f.beat || 0).toFixed(3));
  st.el.style.setProperty("--dv-energy", (f.energy || 0).toFixed(3));

  st.frames++;
  if ((st.frames & 7) === 0) {
    st.el.dataset.dvFrames = String(st.frames);
    st.el.dataset.dvSpec = spec?.ready ? "1" : "0";
    st.el.dataset.dvBeat = String(spec?.beats || 0);
    st.el.dataset.dvPos = String(Math.round(pos));
  }

  // 暂停 → 安静 6 秒后停帧（live 才需要判断）
  return live && !st.playing && now - st.lastActive > TIMING.idleStopMs;
}

/** 静止形态：只画一帧，不排帧循环（animations:false / reducedMotion） */
function renderOnce(st, now) {
  if (!st || st.destroyed) return;
  render(st, now, 0, false);
  st.el.dataset.dvSpec = "0";
  st.el.dataset.dvPos = String(Math.round(st.pos));
}
