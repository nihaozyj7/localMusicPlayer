/* ==========================================================================
   magic-circle/skin.js — 魔法阵歌词舞台 · 世界地图 + 运镜版（插件入口）
   --------------------------------------------------------------------------
   一句话：**歌词是世界里的固定物体，镜头飞过去看它。**
     · 世界 12000×12000，一张贯穿全图的巨型底阵当“地基”；
     · 每句歌词钉在一个世界坐标上（见 lib/layout.js，可手调）；
     · 摄像机按「当前高亮节点」插值移动，换句 = 运镜 = 转场（见 lib/camera.js）；
     · 全部动效只有一个输入：ctx.spectrum() 给的 128 段对数全谱
       （见 lib/spectrum.js：三套平滑 + 峰值保持 + 质心 + 通量）。

   契约纪律（v3）：
     · 零裸包名 import（只 import 本包目录内的相对模块）；
     · 不轮询：只有一条 requestAnimationFrame 帧循环（暂停 9 秒后自己停，
       任何一条宿主补丁都会把它拉起来）；
     · 不碰 window / document.documentElement，不发网络请求；
     · 频谱是拉取式：在自己的帧循环里现取（清单已声明 capabilities.spectrum）。

   ★ 为什么子模块是 `await import(...)` 而不是静态 import（别改成静态的）
     /skins/ 是**逐文件**鉴权的：入口被加载成
         /skins/magic-circle/skin.js?t=sk_xxx
     而 ES 模块解析相对说明符时**只保留路径、丢掉 query**，于是写
         import { … } from "./lib/config.js"
     实际会去请求 /skins/magic-circle/lib/config.js（没带 t）→ 403，
     表现为「Failed to fetch dynamically imported module」，而且报错挂在
     **入口**上，极难定位（内置两款都是单文件，所以一直没暴露）。
     这里把入口 URL 上的 query 原样透传给子模块；子模块内部的依赖也各
     自透传（它们的 import.meta.url 已经带着 token）。浏览器预览没有 query，
     透传的是空串，退化成普通相对导入 —— 两种环境都成立。
     （宿主侧的根因修复见 internal/skins：带 token 的响应下发 Path=/skins 的
      cookie，之后子资源凭 cookie 放行；那需要重新编译才生效，这份是
      **现在就能用**的那一半。）
   ========================================================================== */

const Q = new URL(import.meta.url).search;
const load = (file) => import(`./lib/${file}${Q}`);

const { NODE, PERF, POOL, TRANSITIONS, WORLD } = await load("config.js");
const { createAnalyser, beatFire } = await load("spectrum.js");
const { ROLE_NAMES, buildWorld, pickTransition, gapSecBetween, leadFor, indexOfTime, focusAt } =
  await load("layout.js");
const { createCamera } = await load("camera.js");
const { KIND, createPool } = await load("particles.js");
const { createRenderer } = await load("render.js");
const { clamp, mulberry32, smoothTo, TAU } = await load("util.js");

/** 舞台 DOM */
const SHELL = `
  <div class="mc">
    <canvas class="mc__canvas" aria-hidden="true"></canvas>
    <div class="mc__vig" aria-hidden="true"></div>
    <div class="mc__hud">
      <div class="mc__top">
        <div class="mc__track">
          <span class="mc__title"></span>
          <span class="mc__artist"></span>
        </div>
        <div class="mc__section"></div>
      </div>
      <div class="mc__empty"></div>
      <div class="mc__hint"></div>
    </div>
  </div>`;

/** 整窗背景层 DOM（清单声明了 capabilities.background 才有容器） */
const BG_SHELL = `
  <div class="mc-bg">
    <div class="mc-bg__nebula mc-bg__nebula--a"></div>
    <div class="mc-bg__nebula mc-bg__nebula--b"></div>
    <div class="mc-bg__veil"></div>
  </div>`;

/** 打击检测的手感：通量阈值 / 冷却 */
const BEAT = { threshold: 0.14, cooldown: 0.34 };

/** @type {object|null} 运行期状态（换样式会先 destroy 再 mount，因此是单例） */
let S = null;

export default {
  id: "magic-circle",

  mount(ctx) {
    ctx.root.innerHTML = SHELL;

    const canvas = ctx.root.querySelector(".mc__canvas");
    const renderer = createRenderer(canvas);
    const camCtl = createCamera();
    const analyser = createAnalyser(128);
    const world = createPool(POOL.world, "world");
    const screen = createPool(POOL.screen, "screen");

    S = {
      ctx,
      canvas,
      renderer,
      camCtl,
      analyser,
      pools: { world, screen },
      world: { nodes: [], sections: [] },
      refs: {
        title: ctx.root.querySelector(".mc__title"),
        artist: ctx.root.querySelector(".mc__artist"),
        section: ctx.root.querySelector(".mc__section"),
        empty: ctx.root.querySelector(".mc__empty"),
        hint: ctx.root.querySelector(".mc__hint"),
      },
      hud: { title: "", artist: "", section: "", empty: "", hint: "" },

      // —— 播放数据（只在宿主补丁里更新，帧循环里不查快照）——
      lyricIndex: -1,
      position: 0,
      /** 最后一次 progress 补丁的时刻（秒）：位置要在本地按 playing 外推 */
      posAt: 0,
      duration: 0,
      playing: false,
      emptyText: "暂无歌词",

      // —— 显示选项 ——
      showLyrics: true,
      anim: true,
      reduced: false,
      interactive: true,
      perfMode: "smooth",
      budgetFps: PERF.budgetFps,
      textScale: 1,

      // —— 帧循环 ——
      raf: 0,
      lastTs: 0,
      now: 0,
      idleSince: 0,
      stopped: false,

      // —— 世界状态（双索引，见 syncStage 的说明）——
      /** 镜头要落的地方（比歌词开口**早一个提前量**就切过去） */
      focusIdx: -1,
      /** 宿主说正在唱的那一句 */
      singIdx: -1,
      hoverIdx: -1,
      lyricsKey: "",
      /** 上一帧是否还在飞行（用来抓“刚落地”那一刻撒涟漪） */
      hadFlight: false,
      /** 整窗背景画好了没（容器可能还没布局，画不上就下帧再试） */
      bgPainted: false,
      windX: 0,
      shatterDriftX: 0,
      // 粒子生成的分数累加器（速率按“每秒几个”给，逐帧攒余数）
      acc: { mote: 0, dust: 0, feather: 0, sdust: 0, rnd: mulberry32(0x1234abc) },
    };

    // 尺寸：优先宿主给的环境快照；拿不到（背景窗口挂载时还没布局）就等 resize 补丁
    const env = ctx.env() || {};
    S.reduced = Boolean(env.reducedMotion);
    S.interactive = ctx.options().interactive !== false;
    renderer.resize(env.width || 0, env.height || 0, env.dpr || 1);
    syncOverview();

    // rAF 时间戳与 performance.now() 同源，机位/状态的时间轴从挂载那一刻起算
    S.now = performance.now() / 1000;
    S.posAt = S.now; // 位置外推的时钟起点（首帧起就在同一条时间轴上）
    S.idleSince = S.now;

    S.bgPainted = paintBackground(ctx);
    syncOptions(ctx);
    syncLyrics(ctx);
    syncTrack(ctx);

    if (S.interactive) bindPointer(ctx);
    startLoop();
  },

  update(ctx, patch) {
    if (!S) return;
    const type = patch && patch.type;
    switch (type) {
      case "mount":
      case "song":
        syncTrack(ctx);
        syncLyrics(ctx);
        syncOptions(ctx);
        break;
      case "media":
        syncTrack(ctx);
        break;
      case "lyrics":
        syncLyrics(ctx);
        break;
      case "progress":
        S.position = Number(patch.position) || 0;
        // 补丁 250ms 才来一次：记下时刻，帧循环里按 playing 把位置外推
        S.posAt = performance.now() / 1000;
        if (Number.isFinite(patch.duration)) S.duration = Number(patch.duration);
        if (typeof patch.playing === "boolean") S.playing = patch.playing;
        if (Number.isFinite(patch.lyricIndex)) S.lyricIndex = patch.lyricIndex;
        noteActivity();
        break;
      case "state":
        S.playing = Boolean(patch.playing);
        S.posAt = performance.now() / 1000;
        noteActivity();
        break;
      case "options":
        syncOptions(ctx);
        break;
      case "resize": {
        const env = ctx.env() || {};
        S.renderer.resize(Number(patch.width) || 0, Number(patch.height) || 0, env.dpr || 1);
        syncOverview();
        reflowText(); // 舞台宽度变了 → 文字占屏比例要重算
        // 窗口尺寸变了 → 整窗背景也重画一次（容器还没布局就等下一帧重试）
        S.bgPainted = paintBackground(ctx);
        break;
      }
      case "theme":
        S.bgPainted = paintBackground(ctx);
        break;
      case "close":
        stopLoop();
        return;
      default:
        break;
    }
    startLoop();
  },

  destroy(ctx) {
    stopLoop();
    if (S) {
      if (S.offPointer) S.offPointer();
      S.pools.world.clear();
      S.pools.screen.clear();
      S.world = { nodes: [], sections: [] };
      S.refs = null;
      S.ctx = null;
    }
    ctx.root.innerHTML = "";
    if (ctx.backgroundRoot) {
      ctx.backgroundRoot.hidden = true;
      ctx.backgroundRoot.innerHTML = "";
      ctx.backgroundRoot.removeAttribute("style");
    }
    S = null;
  },
};

/* ==========================================================================
   快照同步（只在宿主补丁里跑；帧循环里一个快照都不查）
   ========================================================================== */

/** 曲目信息 → HUD */
function syncTrack(ctx) {
  const song = ctx.track();
  setText("title", song && song.title ? String(song.title) : "未在播放");
  setText("artist", song ? [song.artist, song.album].filter(Boolean).join("  ·  ") : "从曲库里挑一首开始");
}

/** 歌词 → 世界（歌词换了就重建节点，机位立刻落到当前那一句） */
function syncLyrics(ctx) {
  const l = ctx.lyrics();
  S.lyricIndex = Number.isFinite(l.index) ? l.index : -1;
  S.emptyText = l.lines.length ? "" : l.statusText || "暂无歌词";

  const key = `${l.source}|${l.text.length}|${l.lines.length}|${l.status}`;
  if (key === S.lyricsKey) return;
  S.lyricsKey = key;

  S.world = buildWorld(withDisplayText(ctx, l.lines));
  // 没歌词：焦点恒为阵心那颗（syncLyrics 已把它点亮，别让 onFocus 又把它按回去）
  S.focusIdx = hasLyricLines() ? -1 : 0;
  S.singIdx = -1;
  S.hadFlight = false;
  S.pools.world.clear();
  reflowText();

  // 机位直接落到「当前该在的那一句」上（重建世界不该看到镜头飞一遍）
  const est = estimatePos(S.now);
  const node = S.world.nodes[hasLyricLines() ? indexOfTime(S.world.nodes, est) : 0];
  if (node) {
    const zoom = S.renderer.nodeZoom(node, sizeOf().W || 1280);
    node.targetZoom = zoom;
    S.camCtl.snapTo(node.x, node.y, zoom);
    // 没有歌词的世界：阵心那颗节点就是舞台本身，直接亮着
    // （按 idle 画的话整屏只剩一圈 0.15 亮度的淡环，像没加载出来）
    if (!hasLyricLines()) {
      node.state = "active";
      node.stateAt = S.now;
      node.assembleDur = NODE.assembleSec;
    }
  } else {
    S.camCtl.snapTo(0, 0, 0.62);
  }
}

/** 这个世界里有没有“带歌词的节点” */
function hasLyricLines() {
  return S.world.nodes.some((n) => Boolean(n.line));
}

/**
 * 多语言歌词 → 画布上的一行字。
 *
 * 同一时间戳的多行（原唱 + 翻译 / 罗马音）在宿主解析时已经折叠成
 * `{ text, trans[] }`（见包里 lrc.js 的 parseLrc）。歌词区那种「主行 + 副行」
 * 的两行排版在画布上没有对应物，所以这里把副行用分隔符拼进主行 —— 两种语言
 * 必须一起出现，否则只画第一行就等于把翻译丢了。
 *
 * 优先用 ctx.sdk.lyricDisplayText（与宿主、其它样式同一份实现），
 * 老宿主没有这个零件时退回本地拼接。
 *
 * 以**命名导出**暴露一份，是为了让自检能直接打它（画布上的文字没法从 DOM 查，
 * 见 tools/check-multilingual-lyrics.mjs）—— 宿主的 composeSkin 只认 default，
 * 多一个具名导出不影响加载。
 *
 * @param {object} ctx
 * @param {Array<{time:number,text:string,trans?:string[]}>} lines
 */
export function withDisplayText(ctx, lines) {
  const join = ctx?.sdk?.lyricDisplayText;
  return lines.map((line) => {
    if (!line.trans || !line.trans.length) return line;
    const text = typeof join === "function" ? join(line) : [line.text, ...line.trans].join(" · ");
    return { ...line, text };
  });
}

/** 显示设置 → 帧率档位 / 动效开关 / 文字字号 */
function syncOptions(ctx) {
  const o = ctx.options();
  S.showLyrics = o.showLyrics !== false;
  S.interactive = o.interactive !== false;
  S.perfMode = o.performanceMode === "performance" ? "performance" : "smooth";
  const budget = Number(o.budgetFps);
  S.budgetFps = Number.isFinite(budget) && budget > 15 ? budget : PERF.budgetFps;
  S.reduced = Boolean((S.ctx.env() || {}).reducedMotion);
  // “关闭动效”= 不做位移动效（呼吸 / 自转 / 呼吸缩放全停），频谱仍然直驱刻度
  S.anim = o.animations !== false && !S.reduced;
  // 设置里的歌词字号 → 世界字号缩放（16px 记作 1.0）
  const scale = clamp((Number(o.lyricsFontSize) || 16) / 16, 0.75, 1.7);
  if (scale !== S.textScale) {
    S.textScale = scale;
    S.renderer.setTextScale(scale);
    reflowText();
  }
}

/** 换歌词 / 改字号之后，把节点上的文字布局与预渲染位图全部作废 */
function reflowText() {
  if (!S) return;
  for (const n of S.world.nodes) {
    n.layout = null;
    n.glyphs = null;
  }
}

function setText(key, value) {
  const el = S.refs && S.refs[key];
  if (!el || S.hud[key] === value) return;
  S.hud[key] = value;
  el.textContent = value;
}

/* ==========================================================================
   整窗背景层（容器归宿主，内容归皮肤）
   ========================================================================== */

function paintBackground(ctx) {
  const root = ctx.backgroundRoot;
  if (!root) return false;
  if (!root.querySelector(".mc-bg")) root.innerHTML = BG_SHELL;
  root.hidden = false; // 容器的 hidden 归皮肤管；进出场是宿主的 data-state
  // 整窗夜空全部由 CSS 渐变给出（见 skin.css 的 .mc-bg）。这里以前还画一张
  // backdrop canvas（夜空 + 星域 + 巨型底阵）—— 舞台铺满整窗之后它被完全盖住，
  // 却仍要占一整张全窗口位图（dpr1 5MB / dpr1.5 12MB），所以去掉。
  return true;
}

/* ==========================================================================
   交互（点节点 = 跳到那句歌词）
   ========================================================================== */

function bindPointer(ctx) {
  const canvas = S.canvas;
  const move = (e) => {
    if (!S) return;
    const r = canvas.getBoundingClientRect();
    const idx = S.renderer.hitTest(hitState(), e.clientX - r.left, e.clientY - r.top);
    if (idx === S.hoverIdx) return;
    S.hoverIdx = idx;
    canvas.style.cursor = idx >= 0 && S.world.nodes[idx]?.line ? "pointer" : "default";
  };
  const leave = () => {
    if (S) S.hoverIdx = -1;
  };
  const down = (e) => {
    if (!S) return;
    const r = canvas.getBoundingClientRect();
    const idx = S.renderer.hitTest(hitState(), e.clientX - r.left, e.clientY - r.top);
    const node = idx >= 0 ? S.world.nodes[idx] : null;
    if (!node || !node.line) return;
    // LRC 行的 time **就是毫秒**（契约 SkinLyrics.lines），不要再乘 1000
    ctx.actions.seek(Math.max(0, Number(node.line.time) || 0));
    noteActivity();
  };
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerleave", leave);
  canvas.addEventListener("pointerdown", down);
  S.offPointer = () => {
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerleave", leave);
    canvas.removeEventListener("pointerdown", down);
  };
}

/** 命中测试只需要机位与世界，给它一份最小状态即可 */
function hitState() {
  return { view: S.camCtl.view(S.now, { anim: false }), world: S.world };
}

/* ==========================================================================
   帧循环
   ========================================================================== */

function startLoop() {
  if (!S || S.raf) return;
  S.stopped = false;
  S.lastTs = 0;
  S.raf = requestAnimationFrame(frame);
}

function stopLoop() {
  if (!S || !S.raf) return;
  cancelAnimationFrame(S.raf);
  S.raf = 0;
}

/** 每帧允许的最小间隔（毫秒）；0 = 不限 */
function minFrame() {
  if (!S.playing) return 1000 / PERF.idleFps;
  if (S.perfMode !== "performance") return 0;
  return 1000 / Math.max(15, S.budgetFps);
}

function shouldStop(now) {
  if (S.playing || S.camCtl.cam.flight) return false;
  if (S.pools.world.pool.live > 0 && now - S.idleSince < 4) return false;
  return (now - S.idleSince) * 1000 > PERF.idleStopMs;
}

/** 任何一条宿主补丁都算“有人在动”，把停掉的帧循环拉起来 */
function noteActivity() {
  if (!S) return;
  S.idleSince = S.now || performance.now() / 1000;
  startLoop();
}

function sizeOf() {
  return S.renderer.size();
}

/**
 * 「拉远俯瞰」要拉到多远：让整张底阵（R=5600）进画面。
 * 写死 0.3 在宽屏上只能看到半张阵，所以按舞台宽度反算。
 */
function syncOverview() {
  const w = sizeOf().W || 1280;
  S.camCtl.cam.overviewZ = Math.max(0.06, Math.min(0.3, (w * 0.92) / (WORLD.R * 2)));
}

/** 画布还没拿到尺寸时（背景窗口刚挂载）现量一次 */
function ensureSize() {
  const cur = sizeOf();
  if (cur.W >= 2 && cur.H >= 2) return;
  const r = S.ctx.root.getBoundingClientRect();
  if (r.width >= 2 && r.height >= 2) {
    const env = S.ctx.env() || {};
    S.renderer.resize(r.width, r.height, env.dpr || 1);
    syncOverview();
  }
}

function frame(ts) {
  if (!S) return;
  S.raf = requestAnimationFrame(frame);

  const gap = minFrame();
  if (S.lastTs && gap > 0 && ts - S.lastTs < gap - 0.6) return;
  const dt = S.lastTs ? Math.min(80, ts - S.lastTs) : 16.7;
  S.lastTs = ts;
  const now = ts / 1000;
  S.now = now;

  ensureSize();
  if (!S.bgPainted) S.bgPainted = paintBackground(S.ctx); // 容器布局好之前画不上，补一帧

  // —— 128 段全谱 → 派生量（没在播放时输入为 0，全部平滑值自然衰减）——
  const snap = S.ctx.spectrum();
  S.analyser.update(snap ? snap.bands : null, dt);
  const sp = S.analyser.out;

  // —— 世界状态：提前量落位（focus） + 演唱状态（sing）——
  syncStage(now);
  S.camCtl.update(dt, now);
  syncArrival();

  // —— 粒子 ——
  spawnParticles(dt, now, sp);
  S.pools.world.update(dt, { now, windX: S.windX });
  S.pools.screen.update(dt, { now, windX: 0 });

  // —— 绘制 ——
  S.renderer.draw({
    now,
    dt,
    view: S.camCtl.view(now, { anim: S.anim }),
    spec: sp,
    world: S.world,
    focusIdx: S.focusIdx,
    singIdx: S.singIdx,
    hoverIdx: S.hoverIdx,
    flight: S.camCtl.progress(now),
    flash: S.camCtl.flash(now),
    anim: S.anim,
    showLyrics: S.showLyrics,
    worldPool: S.pools.world.pool,
    screenPool: S.pools.screen.pool,
    shatterDriftX: S.shatterDriftX,
    baseBright: 1,
  });

  updateHud();

  // 悬停亮度插值（把命中检测与绘制解耦）
  for (const n of S.world.nodes) {
    const want = n.i === S.hoverIdx ? 1 : 0;
    if (n.hover || want) n.hover = smoothTo(n.hover || 0, want, 0.25, dt);
  }

  if (shouldStop(now)) stopLoop();
}

/* ==========================================================================
   节点状态机（**双索引**：focus 抢跑，sing 跟宿主）
   --------------------------------------------------------------------------
     focusIdx  镜头要落的地方 —— 比这一句开口**早一个提前量**就切过去：
               节点 → approaching（外环加速、文字汇聚、位图这时就预渲染好）
     singIdx   宿主说正在唱的那句 —— 它开口时节点 → active（全亮），
               被下一句取代时 → passing（文字碎成粒子）

   于是「唱到的时候镜头已经停稳、字也拼完了」。这正是这次改动的核心：
   短间隔（2~3 秒一句）如果等开口才起飞，词都在飞了还没到，
   动画就“跟不上速度”；把起飞时间提前到开口之前，矛盾就没有了。
   ========================================================================== */

/** 本地估算播放位置（宿主补丁 250ms 才来一次，直接用会一顿一顿） */
function estimatePos(now) {
  if (!S.playing) return S.position;
  const dt = now - S.posAt;
  // 时钟没对齐（刚挂载 / 补丁断了）就不外推 —— 否则一个 0 时刻会让位置飞到天边
  if (!(dt > 0) || dt > 4) return S.position;
  return S.position + dt * 1000;
}

/** 每帧跑一次：focus/sing 有变化就切换状态与运镜 */
function syncStage(now) {
  const est = estimatePos(now);
  const focus = focusAt(S.world.nodes, est);
  const sing = hasLyricLines() ? S.lyricIndex : -1;

  if (focus !== S.focusIdx) onFocus(focus, now);
  if (sing !== S.singIdx) onSing(sing, now);

  // 兜底归位：既不在焦点、也不是正在唱的那句，就不该继续亮着（字形也一并释放）
  const hasLyric = hasLyricLines();
  for (const n of S.world.nodes) {
    // ★ 一律走 leaveNode（→ passing）：直接 state = "idle" 会让整行 alpha 瞬间归零，
    //   表现就是“唱完字啪一下没掉”。passing 会先用 shatterSec 把字淡出飘散。
    if (n.state === "approaching" && n.i !== S.focusIdx) leaveNode(n, now, null, { burst: false });
    if (n.state === "active" && hasLyric && n.i !== S.singIdx) leaveNode(n, now, null, { burst: true });
    if (n.state === "idle" && n.glyphs && n.i !== S.focusIdx && n.i !== S.singIdx) n.glyphs = null;
  }
  advanceStates(now);
}

/**
 * 让节点走**退场**：state → passing（drawText 的 scatter 会把字淡出、往飞行方向
 * 漂走，同时撒一把符文碎片），1.6s 后由 advanceStates 收回 idle 并释放字形。
 *
 * 「每句唱完」的退场只走这里 —— 以前兜底分支写的是 `state = "idle"`，
 * 而 idle 的 assemble 恒为 0、整行 alpha 归零，于是每句结束都是直接消失。
 *
 * @param {{state?:string,stateAt?:number}|null} node
 * @param {number} now
 * @param {{x:number,y:number}|null} dir 飘散方向；null 表示不改风向
 * @param {{burst?:boolean}} [opts] burst = false 时只淡出、不撒粒子
 */
function leaveNode(node, now, dir, opts = {}) {
  if (!node) return;
  if (node.state === "passing" || node.state === "idle") return;
  node.state = "passing";
  node.stateAt = now;
  if (dir) {
    S.windX = dir.x * NODE.shatterDrift;
    S.shatterDriftX = S.windX;
  }
  if (opts.burst !== false && S.anim) shatter(node, dir || { x: 1, y: 0 });
}

/** 焦点变了 → 起飞 + 该节点开始拼字 */
function onFocus(next, now) {
  const nodes = S.world.nodes;
  const prevIdx = S.focusIdx;
  S.focusIdx = next;

  const prevNode = prevIdx >= 0 ? nodes[prevIdx] : null;
  if (prevNode && prevNode.state === "approaching" && prevIdx !== S.singIdx) {
    // 镜头还没落地就被下一句抢走：淡出即可，不必撒粒子（字本来就只拼了一半）
    leaveNode(prevNode, now, null, { burst: false });
  }

  const node = next >= 0 ? nodes[next] : null;
  if (!node) {
    S.camCtl.setTarget(0, 0, 0.62);
    return;
  }

  const zoom = S.renderer.nodeZoom(node, sizeOf().W || 1280);
  node.targetZoom = zoom;
  // ★ 提前把这句排好版、渲染成位图：镜头还在路上，字已经准备好了
  S.renderer.prewarm(node, zoom);

  const type = prevIdx < 0 ? "pan" : pickTransition(nodes, prevIdx, next);
  const adjacent = next === prevIdx + 1 && next > prevIdx;
  const gap = gapSecBetween(nodes, prevIdx, next);
  // 逐句推进：**转场时长 = 提前量**，飞完刚好是开口那一刻
  const dur = prevIdx < 0 ? NODE.assembleSec : adjacent ? leadFor(gap) : TRANSITIONS[type].dur;

  if (prevIdx < 0) {
    // 第一次落位（挂载 / 歌词重建）：机位已经 snap 在这里，不再演一段
    S.camCtl.setTarget(node.x, node.y, zoom);
  } else {
    S.camCtl.flyTo({ x: node.x, y: node.y, zoom }, type, now, dur);
  }

  node.state = "approaching";
  node.stateAt = now;
  // 文字汇聚时长跟着提前量走：镜头落地那一刻字正好拼完
  node.assembleDur = Math.max(0.25, adjacent ? dur : Math.min(dur, 1));
}

/**
 * 这一句换了之后，上一句是不是该退场。
 *
 * 以**命名导出**暴露，是为了让自检能直接打这条判据 —— 画布上的文字没法从 DOM
 * 查（见 tools/check-lyric-exit.mjs）。宿主的 composeSkin 只认 default，
 * 多一个具名导出不影响加载。
 *
 * ★ 关键就在 **!==**：正常播放时下一句的下标比上一句**大**（prev < sing）。
 *   这里以前写的是 `prev > sing`，等于只有“往回 seek”才会退场 —— 平时每句结束
 *   都掉进 syncStage 的兜底分支被直接抹成 idle，表现就是“唱完字啪一下没了”。
 *
 * @param {number} prevIdx 上一句的下标（-1 = 还没唱过）
 * @param {number} singIdx 这一句的下标（-1 = 当前不在唱）
 * @returns {boolean}
 */
export function shouldLeave(prevIdx, singIdx) {
  return prevIdx >= 0 && prevIdx !== singIdx;
}

/** 宿主的高亮行变了 → 上一句退场、这一句全亮 */
function onSing(sing, now) {
  const nodes = S.world.nodes;
  const prevIdx = S.singIdx;
  S.singIdx = sing;
  const prevNode = prevIdx >= 0 ? nodes[prevIdx] : null;

  if (!hasLyricLines()) {
    // 歌词被清空 / 换成纯音乐：正在唱的那句也要体面地退场（否则它会一直亮着）
    leaveNode(prevNode, now, null, { burst: true });
    return;
  }

  const node = sing >= 0 ? nodes[sing] : null;

  // 上一句唱完 → passing：文字碎成粒子，沿镜头飞行方向飘散
  if (prevNode && shouldLeave(prevIdx, sing) && (prevNode.state === "active" || prevNode.state === "approaching")) {
    const dir = node ? dirOf(prevNode, node) : { x: 1, y: 0 };
    leaveNode(prevNode, now, dir, { burst: true });
  }

  // 这一句开口 → active（seek 直接跳过来的节点 stateAt 可能是 0，
  // 文字聚合按 since 算出来 >1，等于立刻成型 —— 正是想要的）
  if (node) node.state = "active";
}

/** 推进状态：碎裂结束 → idle（顺带把预渲染的字形释放掉） */
function advanceStates(now) {
  for (const n of S.world.nodes) {
    if (n.state === "passing" && now - n.stateAt > 1.6) {
      n.state = "idle";
      n.stateAt = now;
      n.glyphs = null;
    }
  }
}

/** 刚刚落地 → 在目标节点上撒一把灵光（“聚焦”的落点反馈）
 *  ★ 不再撒涟漪：那种「从中心往外扩的白色线条波纹」按使用者要求去掉了，
 *    落点感交给下面这些会亮一下的光点。 */
function syncArrival() {
  const flying = Boolean(S.camCtl.cam.flight);
  if (S.hadFlight && !flying && S.anim) {
    const node = S.world.nodes[S.focusIdx];
    if (node) {
      const rnd = S.acc.rnd;
      for (let i = 0; i < 14; i += 1) {
        const a = rnd() * TAU;
        const r = NODE.radius * (0.5 + rnd() * 0.6);
        const speed = 60 + rnd() * 120;
        S.pools.world.spawn({
          kind: KIND.MOTE,
          x: node.x + Math.cos(a) * r,
          y: node.y + Math.sin(a) * r,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed - 30,
          life: 1.1 + rnd() * 1.2,
          size: 3 + rnd() * 5,
          hue: 198 + rnd() * 40,
          sat: 82,
          light: 76,
        });
      }
    }
  }
  S.hadFlight = flying;
}

function dirOf(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** 文字碎裂：按字撒符文碎片（世界空间，跟着镜头一起缩放） */
function shatter(node, dir) {
  const pts = S.renderer.textPoints(node);
  if (!pts.length) return;
  const pool = S.pools.world;
  const rnd = S.acc.rnd;
  const step = Math.max(1, Math.ceil(pts.length / 48));
  const speed = NODE.shatterDrift * 0.9;
  const hue = 210 + (rnd() - 0.5) * 40;
  for (let k = 0; k < pts.length; k += step) {
    for (let j = 0; j < 3; j += 1) {
      const spread = (rnd() - 0.5) * 1.6;
      pool.spawn({
        kind: KIND.SHARD,
        x: node.x + pts[k].x,
        y: node.y + pts[k].y,
        vx: (dir.x + spread * 0.35) * speed * (0.6 + rnd() * 0.8),
        vy: (dir.y + (rnd() - 0.5) * 1.2) * speed * (0.6 + rnd() * 0.8),
        life: 1.1 + rnd() * 1.4,
        size: 7 + rnd() * 12,
        hue,
        sat: 78,
        light: 70,
        rot: rnd() * TAU,
        spin: (rnd() - 0.5) * 6,
      });
    }
  }
}

/* ==========================================================================
   粒子生成（全部由频段驱动）
   ========================================================================== */

function spawnParticles(dt, now, sp) {
  const active = currentNode();
  const rnd = S.acc.rnd;
  const sec = dt / 1000;
  const world = S.pools.world;
  const screen = S.pools.screen;
  const size = sizeOf();
  const w = size.W || 1280;
  const h = size.H || 800;

  if (!S.anim) return;

  // 打击检测（flux 超阈值 + 冷却）→ 一圈灵光爆发
  // ★ 不撒涟漪了：白色扩散波纹按使用者要求去掉（见 syncArrival 的说明）
  if (active && beatFire(sp, now, BEAT.threshold, BEAT.cooldown)) {
    const burst = 10 + Math.round(sp.flux * 26);
    for (let i = 0; i < burst; i += 1) {
      const a = rnd() * TAU;
      const r = NODE.radius * (0.4 + rnd() * 0.7);
      spawnMote(world, active.x + Math.cos(a) * r, active.y + Math.sin(a) * r, a, sp, rnd, 1.6);
    }
  }

  // 灵光：high 频段越高，节点中心升起的光点越多（约 4~64 个/秒）
  if (active) {
    S.acc.mote += (sp.high * 60 + 4) * sec;
    while (S.acc.mote >= 1) {
      S.acc.mote -= 1;
      const a = rnd() * TAU;
      const r = NODE.radius * (0.3 + rnd() * 0.8);
      spawnMote(world, active.x + Math.cos(a) * r, active.y + Math.sin(a) * r, a, sp, rnd, 1);
    }
  }

  // 世界星尘：镜头附近常驻（视差 0.9，镜头飞远时跟着变小）
  S.acc.dust += 14 * sec;
  const cam = S.camCtl.view(now, { anim: false });
  while (S.acc.dust >= 1 && world.pool.live < POOL.world * 0.7) {
    S.acc.dust -= 1;
    const a = rnd() * TAU;
    const r = 400 + rnd() * 4200;
    world.spawn({
      kind: KIND.DUST,
      x: cam.x + Math.cos(a) * r,
      y: cam.y + Math.sin(a) * r,
      vx: (rnd() - 0.5) * 26,
      vy: (rnd() - 0.5) * 26,
      life: 6 + rnd() * 8,
      size: 2 + rnd() * 4,
      hue: 205 + rnd() * 34,
      sat: 60,
      light: 74,
    });
  }

  // 光羽：抒情段（总能量低）从画面上方飘落
  if (sp.live && sp.total < 0.14) {
    S.acc.feather += 9 * sec;
    while (S.acc.feather >= 1) {
      S.acc.feather -= 1;
      screen.spawn({
        kind: KIND.FEATHER,
        x: rnd() * w,
        y: -20,
        vx: (rnd() - 0.5) * 18,
        vy: 16 + rnd() * 18,
        life: 4 + rnd() * 4,
        size: 10 + rnd() * 26,
        hue: 214 + rnd() * 26,
        sat: 70,
        light: 80,
      });
    }
  }

  // 屏幕氛围尘：全屏缓慢漂浮、与镜头无关（两层叠加才有景深）
  S.acc.sdust += 6 * sec;
  while (S.acc.sdust >= 1 && screen.pool.live < POOL.screen * 0.7) {
    S.acc.sdust -= 1;
    screen.spawn({
      kind: KIND.SPARK,
      x: rnd() * w,
      y: rnd() * h,
      vx: (rnd() - 0.5) * 10,
      vy: (rnd() - 0.5) * 10,
      life: 5 + rnd() * 7,
      size: 1.5 + rnd() * 3,
      hue: 210 + rnd() * 40,
      sat: 55,
      light: 78,
    });
  }
}

function spawnMote(pool, x, y, angle, sp, rnd, boost) {
  const speed = 40 + sp.bass * 260 * boost;
  pool.spawn({
    kind: KIND.MOTE,
    x,
    y,
    vx: Math.cos(angle) * speed * 0.4,
    vy: Math.sin(angle) * speed * 0.4 - 30,
    life: 1.4 + rnd() * 1.8,
    size: 3 + rnd() * 6,
    hue: 196 + sp.centroid * 46 + (rnd() - 0.5) * 20,
    sat: 80,
    light: 74,
  });
}

/** 舞台的“主角”下标：正在唱的那句优先；还没开口（抢跑期间）就用镜头对准的那句 */
function heroIdx() {
  if (!S) return -1;
  return S.singIdx >= 0 ? S.singIdx : S.focusIdx;
}

function currentNode() {
  const i = heroIdx();
  return i >= 0 ? S.world.nodes[i] || null : null;
}

/* ==========================================================================
   HUD（曲名 / 段落 / 空态 / 提示）—— 只在值变化时写 DOM
   ========================================================================== */

function updateHud() {
  const i = heroIdx();
  const node = i >= 0 ? S.world.nodes[i] : null;
  const section = node ? S.world.sections[node.section] : null;
  setText("section", section ? section.name : ROLE_NAMES.solo);
  setText("empty", S.emptyText);

  const hovering = S.hoverIdx >= 0 && S.world.nodes[S.hoverIdx]?.line;
  setText("hint", hovering ? "点击进入这句" : "");
}
