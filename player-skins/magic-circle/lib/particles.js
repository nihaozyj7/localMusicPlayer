/* ==========================================================================
   magic-circle/lib/particles.js — 双层粒子池（世界粒子 + 屏幕粒子）
   --------------------------------------------------------------------------
   · 世界粒子：坐标在世界里，跟着镜头缩放。文字碎裂 / 节点灵光 / 涟漪 /
     星尘都在这一层 —— 它们会因为镜头飞远而变小，景深感就是这么来的；
   · 屏幕粒子：坐标在屏幕里，大小固定、全屏漂浮（氛围 + 抒情段的光羽）。

   实现要点：**一次预分配，运行期不 new 对象**。
   字段全部摊在 Float32Array 上（不是对象数组），死亡的槽位回收进 free 栈，
   一整首歌跑下来 GC 压力接近零。
   ========================================================================== */

/** 粒子类型（决定 update 里的运动规律与 render 里的画法）
 *  ★ 没有 RIPPLE 了：那种「从中心往外扩的白色线条波纹」按使用者要求去掉了
 *    （打节点、落地两处都停发），落点 / 打击反馈改用灵光与光点。 */
export const KIND = {
  SHARD: 0, // 符文碎片（文字碎裂）
  MOTE: 1, // 灵光（从节点中心升起）
  DUST: 2, // 星尘（世界空间缓慢漂移）
  FEATHER: 4, // 光羽（屏幕空间，从画面上方飘落）
  SPARK: 5, // 屏幕空间的闪点
};

/**
 * 造一个粒子池。
 *
 * @param {number} cap 容量（预分配，见 config.POOL）
 * @param {"world"|"screen"} space 世界层还是屏幕层
 */
export function createPool(cap, space) {
  const pool = {
    space,
    cap,
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    vx: new Float32Array(cap),
    vy: new Float32Array(cap),
    life: new Float32Array(cap),
    max: new Float32Array(cap),
    size: new Float32Array(cap),
    hue: new Float32Array(cap),
    sat: new Float32Array(cap),
    light: new Float32Array(cap),
    rot: new Float32Array(cap),
    spin: new Float32Array(cap),
    kind: new Uint8Array(cap),
    alive: new Uint8Array(cap),
    free: new Int32Array(cap),
    freeTop: cap,
    live: 0,
  };
  for (let i = 0; i < cap; i += 1) pool.free[i] = cap - 1 - i;

  /**
   * 放一个粒子（池满时静默丢弃 —— 宁可少几颗，也不要为了“都要”去扩容）。
   *
   * @param {object} p
   * @returns {boolean} 是否成功放进去
   */
  function spawn(p) {
    if (pool.freeTop <= 0) return false;
    const i = pool.free[pool.freeTop - 1];
    pool.freeTop -= 1;
    pool.alive[i] = 1;
    pool.live += 1;
    pool.x[i] = p.x || 0;
    pool.y[i] = p.y || 0;
    pool.vx[i] = p.vx || 0;
    pool.vy[i] = p.vy || 0;
    pool.life[i] = p.life || 1;
    pool.max[i] = p.life || 1;
    pool.size[i] = p.size || 3;
    pool.hue[i] = p.hue ?? 210;
    pool.sat[i] = p.sat ?? 70;
    pool.light[i] = p.light ?? 65;
    pool.rot[i] = p.rot || 0;
    pool.spin[i] = p.spin || 0;
    pool.kind[i] = p.kind ?? KIND.DUST;
    return true;
  }

  function kill(i) {
    if (!pool.alive[i]) return;
    pool.alive[i] = 0;
    pool.live -= 1;
    if (pool.freeTop < cap) {
      pool.free[pool.freeTop] = i;
      pool.freeTop += 1;
    }
  }

  /**
   * 推进一帧。
   *
   * @param {number} dt 毫秒
   * @param {{now:number, windX?:number}} o windX = 文字碎裂沿“镜头飞行方向”的漂移
   */
  function update(dt, o) {
    const s = dt / 1000;
    const dragK = Math.pow(0.94, dt / 16.6667);
    const wind = o.windX || 0;
    for (let i = 0; i < cap; i += 1) {
      if (!pool.alive[i]) continue;
      pool.life[i] -= s;
      if (pool.life[i] <= 0) {
        kill(i);
        continue;
      }
      const kind = pool.kind[i];

      if (kind === KIND.SHARD) {
        pool.vx[i] = (pool.vx[i] + wind * s) * dragK;
        pool.vy[i] = (pool.vy[i] + 90 * s) * dragK;
      } else if (kind === KIND.MOTE) {
        pool.vx[i] *= dragK;
        pool.vy[i] = pool.vy[i] * dragK - 34 * s;
      } else if (kind === KIND.FEATHER) {
        pool.vy[i] = Math.min(pool.vy[i] + 34 * s, 46);
        pool.vx[i] += Math.sin(o.now * 1.6 + pool.x[i] * 0.01) * 6 * s;
      } else if (kind === KIND.SPARK) {
        pool.vx[i] *= dragK;
        pool.vy[i] *= dragK;
      }

      pool.x[i] += pool.vx[i] * s;
      pool.y[i] += pool.vy[i] * s;
      pool.rot[i] += pool.spin[i] * s;
    }
  }

  /** 清空（换歌重建世界时用） */
  function clear() {
    for (let i = 0; i < cap; i += 1) pool.alive[i] = 0;
    pool.freeTop = cap;
    for (let i = 0; i < cap; i += 1) pool.free[i] = cap - 1 - i;
    pool.live = 0;
  }

  return { pool, spawn, clear, update };
}
