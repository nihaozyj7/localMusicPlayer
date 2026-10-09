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
const { ROLE_NAMES, buildWorld, pickTransition } = await load("layout.js");
const { createCamera } = await load("camera.js");
const { KIND, createPool } = await load("particles.js");
const { createRenderer } = await load("render.js");
const { clamp, mulberry32, smoothTo, TAU } = await load("util.js");

/** 舞台 DOM */
const SHELL = `
  <div class="mc">
    <canvas class="mc__canvas" aria-hidden="true"></canvas>
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

/** 打击检测的手感：通量阈值 / 冷却 / 涟漪半径 */
const BEAT = { threshold: 0.14, cooldown: 0.34, rippleR: NODE.radius * 1.1 };

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

      // —— 世界状态 ——
      activeIdx: -1,
      /** 渲染用的高亮节点下标（没有歌词时恒为 0：阵心那颗待机节点） */
      activeNode: -1,
      hoverIdx: -1,
      lyricsKey: "",
      flightFor: -1,
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
    S.idleSince = S.now;

    paintBackground(ctx);
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
        if (Number.isFinite(patch.duration)) S.duration = Number(patch.duration);
        if (typeof patch.playing === "boolean") S.playing = patch.playing;
        if (Number.isFinite(patch.lyricIndex)) S.lyricIndex = patch.lyricIndex;
        noteActivity();
        break;
      case "state":
        S.playing = Boolean(patch.playing);
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
        break;
      }
      case "theme":
        paintBackground(ctx);
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

  S.world = buildWorld(l.lines);
  S.activeIdx = -1; // 强制下一次 syncIndex 重新落位
  S.flightFor = -1;
  S.pools.world.clear();
  reflowText();
  S.activeNode = resolveActiveNode(S.lyricIndex);

  const node = S.world.nodes[S.activeNode >= 0 ? S.activeNode : 0];
  if (node) {
    S.camCtl.snapTo(node.x, node.y, S.renderer.nodeZoom(node, sizeOf().W || 1280));
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
 * 宿主给的歌词行号 → 渲染用的节点下标。
 *   · 有歌词：行号能对上节点就是它；还没唱到第一句 → -1（视野里没有高亮节点）
 *   · 没歌词：恒为 0 —— 阵心那颗待机节点就是全部舞台
 */
function resolveActiveNode(idx) {
  if (!S.world.nodes.length) return -1;
  if (!hasLyricLines()) return 0;
  return idx >= 0 && S.world.nodes[idx] ? idx : -1;
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

/** 换歌词 / 改字号之后，把节点上的文字布局全部作废 */
function reflowText() {
  if (!S) return;
  for (const n of S.world.nodes) n.layout = null;
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
  if (!root) return;
  if (!root.querySelector(".mc-bg")) root.innerHTML = BG_SHELL;
  root.hidden = false; // 容器的 hidden 归皮肤管；进出场是宿主的 data-state
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

  // —— 128 段全谱 → 派生量（没在播放时输入为 0，全部平滑值自然衰减）——
  const snap = S.ctx.spectrum();
  S.analyser.update(snap ? snap.bands : null, dt);
  const sp = S.analyser.out;

  // —— 世界状态 ——
  syncIndex(now);
  S.camCtl.update(dt, now);
  advanceStates(now);

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
    activeIdx: S.activeNode,
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
   节点状态机：idle → approaching → active → passing → idle
   ========================================================================== */

/**
 * 高亮行变化 → 起飞 + 状态切换（时序见设计稿第六节）：
 *   T=0    上一个节点 → passing（文字碎成粒子，沿镜头飞行方向飘散）
 *   T=0    镜头开始飞向下一节点；下一节点 → approaching（外环加速、文字汇聚）
 *   T=飞到  下一节点 → active（文字聚合完成）
 */
function syncIndex(now) {
  const idx = S.lyricIndex;
  if (idx === S.activeIdx) return;
  const prevIdx = S.activeIdx;
  const prev = prevIdx >= 0 ? S.world.nodes[prevIdx] : null;
  const next = idx >= 0 ? S.world.nodes[idx] : null;
  S.activeIdx = idx;
  S.activeNode = resolveActiveNode(idx);

  if (prev && (prev.state === "active" || prev.state === "approaching")) {
    const dir = next ? dirOf(prev, next) : { x: 1, y: 0 };
    prev.state = "passing";
    prev.stateAt = now;
    S.windX = dir.x * NODE.shatterDrift;
    S.shatterDriftX = dir.x * NODE.shatterDrift;
    shatter(prev, dir);
  }
  // 视野里只留一个 passing 做景深；上一轮没唱到的归位
  for (const n of S.world.nodes) {
    if (n.state === "passing" && n !== prev) n.state = "idle";
    if (n.state === "approaching" && n !== next) n.state = "idle";
  }

  const target = next || S.world.nodes[0] || null;
  if (!target) {
    S.camCtl.setTarget(0, 0, 0.62);
    S.flightFor = -1;
    return;
  }
  const zoom = S.renderer.nodeZoom(target, sizeOf().W || 1280);
  let type = "pan";

  if (prevIdx < 0) {
    // 第一次落位（挂载 / 歌词重建）：机位已经 snap 在这里，不再演一段
    S.camCtl.setTarget(target.x, target.y, zoom);
  } else {
    type = pickTransition(S.world.nodes, prevIdx, idx);
    S.camCtl.flyTo({ x: target.x, y: target.y, zoom }, type, now);
  }

  if (next) {
    const dur = prevIdx < 0 ? NODE.assembleSec : TRANSITIONS[type].dur;
    next.state = "approaching";
    next.stateAt = now;
    // 文字汇聚时长跟着运镜走：远跳转时先看见字在远处聚，落地刚好成型
    next.assembleDur = Math.max(NODE.assembleSec, dur * 0.9);
    S.flightFor = idx;
  } else {
    S.flightFor = -1;
  }
}

/** 推进状态：到达 → active；碎裂结束 → idle */
function advanceStates(now) {
  const flying = Boolean(S.camCtl.cam.flight);
  for (const n of S.world.nodes) {
    if (n.state === "approaching") {
      const dur = n.assembleDur || NODE.assembleSec;
      if (!flying && S.flightFor === n.i && now - n.stateAt >= dur) n.state = "active";
    } else if (n.state === "passing" && now - n.stateAt > 1.6) {
      n.state = "idle";
      n.stateAt = now;
    }
  }
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

  // 打击检测（flux 超阈值 + 冷却）→ 涟漪 + 灵光爆发
  if (active && beatFire(sp, now, BEAT.threshold, BEAT.cooldown)) {
    world.spawn({
      kind: KIND.RIPPLE,
      x: active.x,
      y: active.y,
      life: 1.15,
      size: BEAT.rippleR,
      hue: 200 + sp.centroid * 40,
      sat: 85,
      light: 72,
    });
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

function currentNode() {
  if (!S) return null;
  return S.activeNode >= 0 ? S.world.nodes[S.activeNode] || null : null;
}

/* ==========================================================================
   HUD（曲名 / 段落 / 空态 / 提示）—— 只在值变化时写 DOM
   ========================================================================== */

function updateHud() {
  const node = S.activeNode >= 0 ? S.world.nodes[S.activeNode] : null;
  const section = node ? S.world.sections[node.section] : null;
  setText("section", section ? section.name : ROLE_NAMES.solo);
  setText("empty", S.emptyText);

  const hovering = S.hoverIdx >= 0 && S.world.nodes[S.hoverIdx]?.line;
  setText("hint", hovering ? "点击进入这句" : "");
}
