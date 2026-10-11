/**
 * 分层相机（纯函数）：把「镜头想去哪」和「镜头现在在哪」之间的阻尼算出来。
 *
 * 为什么不用 `ctx.sdk.createCamera`：它只能驱动**一个**容器。
 * 塔有 N 层，每层的位置都必须由同一个镜头值派生 —— 所以镜头是"一个数"（层号 + 微调），
 * 每层的位置由 tower.js#cardGeometry 从它算出来。
 *
 * 阻尼用「临界阻尼弹簧」的离散形式：稳定、无过冲，且 dt 变化时不会炸。
 */

export const CAMERA = {
  /** 弹簧刚度（越大越"跟手"） */
  stiffness: 26,
  /** 速度阻尼 */
  damping: 2 * Math.sqrt(26),
  /** 单帧 dt 上限（切后台回来时会有一个巨大的 dt） */
  maxDt: 0.05,
  /** 位置死区：差得比这个还小就吸附过去（省掉无穷小的抖动量） */
  epsilon: 0.002,
};

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const round4 = (v) => Math.round(v * 10000) / 10000;

/** 新建一个镜头状态 */
export function createCamera(init = 0) {
  return { pos: init, vel: 0, target: init };
}

/** 设定目标 */
export function aim(cam, target) {
  cam.target = target;
  return cam;
}

/**
 * 推进一步。返回新的 { pos, vel, target, settled }。
 * @param {{pos:number,vel:number,target:number}} cam
 * @param {number} dt 秒
 * @param {object} [cfg] 覆盖 CAMERA
 */
export function stepCamera(cam, dt, cfg = CAMERA) {
  const h = clamp(Number.isFinite(dt) ? dt : 0, 0, cfg.maxDt);
  const k = cfg.stiffness;
  const c = cfg.damping;
  // 半隐式欧拉：先算加速度，再积分
  const acc = -k * (cam.pos - cam.target) - c * cam.vel;
  cam.vel += acc * h;
  cam.pos += cam.vel * h;
  let settled = false;
  if (Math.abs(cam.pos - cam.target) < cfg.epsilon && Math.abs(cam.vel) < cfg.epsilon) {
    cam.pos = cam.target;
    cam.vel = 0;
    settled = true;
  }
  cam.pos = round4(cam.pos);
  cam.vel = round4(cam.vel);
  return { pos: cam.pos, vel: cam.vel, target: cam.target, settled };
}

/**
 * 跳跃式设定（animations:false / performance 档 / 首次挂载）：
 * 不飞，直接到位并把速度清零。
 */
export function jump(cam, target) {
  cam.pos = target;
  cam.target = target;
  cam.vel = 0;
  return cam;
}

/**
 * 「抬头看」的段落感：行间隔越长，镜头在飞行途中会多抬一点（纵向补偿 dy）。
 * 纯装饰量，随时间衰减，不影响层号。
 * @param {number} gapMs 这两句之间的间隔
 * @param {object} [cfg] { maxDy, slowGap }
 * @returns {number} px（负值 = 镜头往下压，画面里的层往上走）
 */
export function liftForGap(gapMs, cfg = {}) {
  const maxDy = cfg.maxDy ?? 26;
  const slowGap = cfg.slowGap ?? 6000;
  if (!Number.isFinite(gapMs) || gapMs <= 0) return 0;
  const t = clamp(gapMs / slowGap, 0, 1);
  return -Math.round(maxDy * t);
}

/**
 * 塔体的呼吸：低频能量把整座塔轻轻抬一下（幅度很小，只为了让空间"活着"）。
 * @param {number} bass 0..1
 * @param {object} [cfg] { amp }
 * @returns {number} px
 */
export function breathForBass(bass, cfg = {}) {
  const amp = cfg.amp ?? 9;
  const b = Number.isFinite(bass) ? clamp(bass, 0, 1) : 0;
  return round4(b * amp);
}

/** EMA：给频谱/耗时这类噪声量做平滑（prev<=0 或非有限值 → 直接取样本） */
export function ema(prev, sample, alpha = 0.2) {
  const s = Number.isFinite(sample) ? sample : 0;
  if (!Number.isFinite(prev) || prev <= 0) return s;
  return prev + (s - prev) * clamp(alpha, 0, 1);
}
