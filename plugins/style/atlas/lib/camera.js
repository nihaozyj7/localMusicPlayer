/* ==========================================================================
   camera.js — 摄像机（**纯逻辑，无 DOM、无 canvas**）
   --------------------------------------------------------------------------
   世界是 em 单位的铅字盘（见 pack.js），屏幕是 CSS px。摄像机只有三个数：

       cx, cy —— 世界坐标里"看哪儿"（em）
       k      —— 缩放倍率（1 = 用户设置的歌词字号）

   变换（正反两向都有，命中测试靠反投影）：

       screen.x = view.cx + (world.x − cx) × emPx × k
       screen.y = view.cy + (world.y − cy) × emPx × k

   ★ emPx 来自 `options.lyricsFontSize`（宿主下发的用户设置），k 只做"取景倍率"。
     两者绝不混写：用户拖字号滑杆时世界不动、只换 emPx（连装箱都不用重算）。

   摄像机行为（README / 设计稿 §5）：
     · **跟随**：临界阻尼趋近目标（τ ≈ 220ms），永不过冲；
     · **切镜**：目标离得太远（> 1.6 个视口）就 cut —— 装箱会把时间相邻的两句
       放到世界两头，长距离平移会让画面糊成一片；
     · **不死贴脸**：k 由"整条带子塞进视口"决定并夹在 [kMin, kMax]，屏幕上
       永远留着上下文 —— 否则密集装箱这件辛苦事对观众完全不可见；
     · **横向生命感**：当前条不在世界正中时，取景稍微偏向它那一侧（≤6% 视口宽），
       免得永远正正中中一条直线；
     · **微滚转**：纵向移动速度越快，画面越轻微倾斜（≤1.2°），静止归零。
   ========================================================================== */

/** 阻尼时间常数（ms）：越大越"重"。 */
export const EASE_TAU = 220;
/** 缩放用的时间常数（比平移慢一点，切换时不至于像镜头拉风箱）。 */
export const EASE_TAU_K = 320;
/** 超过这么多倍视口距离就切镜。 */
export const CUT_VIEWPORTS = 1.6;
/** 缩放夹取：太小看不见字，太大只剩一行。 */
export const K_MIN = 0.4;
/**
 * 缩放上限。取景用的是 **cover**（铺满画面）而不是 contain：
 * 盘子宽 = 2×最长条，本来就很窄，若按"整块都塞进来"取景，画面两侧会空掉一大半
 * （实测只占 73% 宽），密集装箱这件辛苦事就白做了。
 */
export const K_MAX = 3.2;
/** 当前条"抬起"时的取景补正（±6%）。 */
export const EMPH_ZOOM = 0.06;
/** 横向偏向的最大比例（视口宽）。 */
export const BIAS_MAX = 0.06;
/** 微滚转上限（度）。 */
export const ROLL_MAX_DEG = 1.2;

/** @typedef {{cx:number, cy:number, k:number}} Cam */

/**
 * 造一个摄像机（放在世界的原点、倍率 1）。
 * @param {Partial<Cam>} [init]
 * @returns {Cam}
 */
export function createCamera(init = {}) {
  return {
    cx: Number.isFinite(init.cx) ? Number(init.cx) : 0,
    cy: Number.isFinite(init.cy) ? Number(init.cy) : 0,
    k: Number.isFinite(init.k) ? Number(init.k) : 1,
  };
}

/**
 * 视口（屏幕坐标）。`left/top/w/h` 是**安全区矩形**（已让开宿主壳），
 * `emPx` = 用户设置的歌词字号（px/em）。
 *
 * @typedef {{left:number, top:number, w:number, h:number, emPx:number}} View
 */

/**
 * @param {{left:number, top:number, w:number, h:number, emPx:number}} o
 * @returns {View}
 */
export function makeView(o) {
  const w = Math.max(1, Number(o.w) || 1);
  const h = Math.max(1, Number(o.h) || 1);
  return {
    left: Number(o.left) || 0,
    top: Number(o.top) || 0,
    w,
    h,
    emPx: Math.max(4, Number(o.emPx) || 16),
  };
}

/** 视口中心（屏幕 px）。当前条落在高度 55% 处 —— 比正中间稳，也给下方留出前瞻。 */
export function viewFocus(view) {
  return { x: view.left + view.w / 2, y: view.top + view.h * 0.55 };
}

/**
 * 世界 → 屏幕。
 * @param {Cam} cam @param {View} view @param {{x:number,y:number}} p
 */
export function worldToScreen(cam, view, p) {
  const s = view.emPx * cam.k;
  const f = viewFocus(view);
  return { x: f.x + (p.x - cam.cx) * s, y: f.y + (p.y - cam.cy) * s };
}

/**
 * 屏幕 → 世界（命中测试、滚轮预览都用它）。
 * @param {Cam} cam @param {View} view @param {{x:number,y:number}} p
 */
export function screenToWorld(cam, view, p) {
  const s = view.emPx * cam.k;
  const f = viewFocus(view);
  return { x: cam.cx + (p.x - f.x) / s, y: cam.cy + (p.y - f.y) / s };
}

/** 当前视口覆盖的世界矩形（剔除用）。 */
export function viewportWorldRect(cam, view) {
  const a = screenToWorld(cam, view, { x: view.left - 8, y: view.top - 8 });
  const b = screenToWorld(cam, view, { x: view.left + view.w + 8, y: view.top + view.h + 8 });
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
}

/**
 * 取景倍率：**让盘子铺满画面**（cover 而不是 contain）。
 *
 * 世界的宽永远是 `2 × 最长条`（很窄），高则是任意长。所以：
 *   · 长歌（世界又窄又长）⇒ 宽度定倍率，纵向一屏装不下的部分靠摄像机巡游；
 *   · 短歌（世界又宽又扁）⇒ 高度定倍率，横向裁掉一部分，反正镜头跟着当前条走。
 * 两条合起来就是 `max(fitW, fitH)`。
 *
 * @param {number} worldW em
 * @param {number} worldH em（缺省当作"无限长"，退化成按宽度取景）
 * @param {View} view
 * @returns {number}
 */
export function framingScale(worldW, worldH, view) {
  const w = Math.max(0.001, worldW) * view.emPx;
  const fitW = (view.w * 0.96) / w;
  const h = Number.isFinite(worldH) && worldH > 0 ? worldH * view.emPx : Infinity;
  const fitH = Number.isFinite(h) ? (view.h * 0.96) / h : 0;
  return Math.max(K_MIN, Math.min(K_MAX, Math.max(fitW, fitH)));
}

/**
 * 只按宽度取景（还没唱到第一句、以及自检里"整宽"那一档用）。
 * @param {number} worldW em
 * @param {View} view
 * @returns {number}
 */
export function fitWidthScale(worldW, view) {
  const w = Math.max(0.001, worldW);
  const raw = (view.w * 0.96) / (w * view.emPx);
  return Math.max(K_MIN, Math.min(K_MAX, raw));
}

/**
 * 算目标机位：当前条居中 + 横向偏向 + 抬起补正。
 *
 * @param {{x:number,y:number,w:number,h:number}} rect 当前条的世界矩形（em）
 * @param {View} view
 * @param {{worldW:number, worldH?:number, lift?:number, scale?:number}} opts
 *   `lift` ∈ [0,1]：当前条"亮起来"的程度（0 = 静止，1 = 完全抬起）
 * @returns {Cam}
 */
export function cameraTarget(rect, view, opts) {
  const worldW = Math.max(0.001, Number(opts.worldW) || 1);
  const worldH = Number(opts.worldH);
  const lift = Math.max(0, Math.min(1, Number(opts.lift) || 0));
  const scale = Number.isFinite(opts.scale) ? Number(opts.scale) : 1;
  const kBase = framingScale(worldW, worldH, view);
  const k = Math.max(K_MIN, Math.min(K_MAX, kBase * (1 + EMPH_ZOOM * lift) * scale));
  const s = view.emPx * k;
  const cx0 = rect.x + rect.w / 2;
  const cy0 = rect.y + rect.h / 2;
  /* 横向偏向只在"宽度本来就被裁掉"时才做：宽度正好铺满时再偏就会露出一条空边 */
  const fitW = (view.w * 0.96) / (worldW * view.emPx);
  const fitH = Number.isFinite(worldH) && worldH > 0 ? (view.h * 0.96) / (worldH * view.emPx) : 0;
  let cx = cx0;
  if (fitH > fitW) {
    const norm = Math.max(-1, Math.min(1, (cx0 - worldW / 2) / (worldW / 2)));
    cx = cx0 + norm * BIAS_MAX * (view.w / s);
  }
  return { cx, cy: cy0, k };
}

/**
 * 从现在到目标，是"平移"还是"切镜"。
 * @param {Cam} cam @param {Cam} target @param {View} view
 * @returns {"pan"|"cut"}
 */
export function planMove(cam, target, view) {
  const s = view.emPx * Math.max(0.001, cam.k);
  const dx = (target.cx - cam.cx) * s;
  const dy = (target.cy - cam.cy) * s;
  const d = Math.hypot(dx, dy);
  const span = Math.min(view.w, view.h);
  return d > span * CUT_VIEWPORTS ? "cut" : "pan";
}

/**
 * 一个量的临界阻尼趋近（永不过冲）。
 * @param {number} from @param {number} to @param {number} dtMs @param {number} tau
 */
export function easeValue(from, to, dtMs, tau) {
  const t = Math.max(0, Number(dtMs) || 0);
  const tauMs = Math.max(1, Number(tau) || EASE_TAU);
  const next = to + (from - to) * Math.exp(-t / tauMs);
  return Math.abs(next - to) < 1e-4 ? to : next;
}

/**
 * 推进摄像机一帧。
 * @param {Cam} cam 会被就地改写
 * @param {Cam} target
 * @param {number} dtMs
 * @param {{cut?:boolean, tau?:number, tauK?:number}} [opts]
 * @returns {{moved:boolean, roll:number}} roll = 微滚转角（度）
 */
export function stepCamera(cam, target, dtMs, opts = {}) {
  const before = { cx: cam.cx, cy: cam.cy, k: cam.k };
  if (opts.cut) {
    cam.cx = target.cx;
    cam.cy = target.cy;
    cam.k = target.k;
  } else {
    cam.cx = easeValue(cam.cx, target.cx, dtMs, opts.tau ?? EASE_TAU);
    cam.cy = easeValue(cam.cy, target.cy, dtMs, opts.tau ?? EASE_TAU);
    cam.k = easeValue(cam.k, target.k, dtMs, opts.tauK ?? EASE_TAU_K);
  }
  const dt = Math.max(1, Number(dtMs) || 16);
  const vy = ((cam.cy - before.cy) * 1000) / dt; // em/s
  return {
    moved:
      Math.abs(cam.cx - before.cx) > 1e-5 ||
      Math.abs(cam.cy - before.cy) > 1e-5 ||
      Math.abs(cam.k - before.k) > 1e-5,
    roll: rollDeg(vy),
  };
}

/**
 * 纵向速度 → 微滚转角（度）。静止时正好 0。
 * @param {number} vyEmPerSec
 * @returns {number}
 */
export function rollDeg(vyEmPerSec) {
  const v = Number(vyEmPerSec) || 0;
  const deg = Math.atan2(v, 26) * (180 / Math.PI) * 0.42;
  return Math.max(-ROLL_MAX_DEG, Math.min(ROLL_MAX_DEG, deg));
}

/**
 * 拉远到"整块铅字盘全在画面里"（间奏与曲末用）。
 *
 * ★ 视口焦点在高度 55% 处（当前条偏上一点更好看），所以直接拿世界正中当机位
 *   会让全貌**沉下去 5%**：角点会掉出安全区。这里把机位往上抬回来，让"世界正中"
 *   落在视口的几何中心。
 * @param {number} worldW em @param {number} worldH em @param {View} view
 * @returns {Cam}
 */
export function wholeWorldTarget(worldW, worldH, view) {
  const w = Math.max(0.001, worldW) * view.emPx;
  const h = Math.max(0.001, worldH) * view.emPx;
  const k = Math.max(0.02, Math.min((view.w * 0.94) / w, (view.h * 0.94) / h));
  const s = view.emPx * k;
  const f = viewFocus(view);
  const dyPx = f.y - (view.top + view.h / 2);
  return { cx: worldW / 2, cy: worldH / 2 + dyPx / s, k };
}

/**
 * 相邻两句之间的"航线"（时间顺序的折线）。装箱把顺序打散了，
 * 这条线是观众唯一能看见"歌怎么走"的地方。
 *
 * @param {Array<{x:number,y:number}>} route 每根条的中心（时间顺序）
 * @param {number} from 起始行
 * @param {number} to 结束行（含）
 * @returns {Array<{from:number, to:number}>} 线段（按行号）
 */
export function routeSegments(route, from, to) {
  const out = [];
  if (!Array.isArray(route) || route.length < 2) return out;
  const a = Math.max(0, Math.min(route.length - 1, from | 0));
  const b = Math.max(0, Math.min(route.length - 1, to | 0));
  for (let i = a; i < b; i += 1) out.push({ from: i, to: i + 1 });
  return out;
}

/**
 * 航线段该有多亮：以当前行为界，越远越淡（3 句以内"预告"，让目光先走过去）。
 * @param {number} segFrom 线段起始行
 * @param {number} current 当前行
 * @returns {number} 0..1
 */
export function routeAlpha(segFrom, current) {
  if (current < 0) return 0.1;
  const d = segFrom - current;
  if (d < 0) return 0.16; // 唱过的：余温
  if (d === 0) return 0.55; // 当前 → 下一句
  if (d === 1) return 0.3;
  if (d === 2) return 0.15;
  return 0.07;
}
