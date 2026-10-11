/* ==========================================================================
   magic-circle/lib/camera.js — 摄像机（跟随 + 五种运镜 + 镜头呼吸）
   --------------------------------------------------------------------------
   歌词节点是**钉死在世界里**的固定物体，镜头飞过去，它自然变大变清晰 ——
   节点自己一帧都不用动。所以整个「舞台感」都在这个文件里：

     · 平时：向目标点做带惯性的 lerp（0.06/帧 → 约 0.7 秒到位）；
     · 换句：按距离与段角色选一条运镜（pan / arc / zoomOut / rotate / pass），
             转场时长 = 运镜时长，两者是同一件事；
     · 常驻：极小幅度的呼吸（sin 微动，15 秒一个来回），消除“数字静止感”。
       ★ 曾经还有一层「低频驱动的微震」（bass 每帧随机抖），已按使用者要求
         **整体移除**：它是每帧 ±几像素的随机跳，正在唱的那句歌词会跟着糊，
         认字优先于氛围。想恢复的话，把设计稿第五节那三行（按 bass 算 amp、
         对 x/y 各加一个 (Math.random()-0.5)*amp）放回 view() 即可。
   ========================================================================== */

// 子模块依赖同样要透传 token（原因见 skin.js 顶部那段说明）
const Q = new URL(import.meta.url).search;
const { TRANSITIONS } = await import(`./config.js${Q}`);
const { clamp, easeInCubic, easeInOutCubic, easeInOutQuint, easeOutBack, easeOutCubic, lerp, quadAt } = await import(
  `./util.js${Q}`
);

/** 镜头跟随的靠近系数（60fps 下每帧 0.06 ≈ 0.7 秒到位） */
const FOLLOW_ALPHA = 0.06;

export function createCamera() {
  const cam = {
    x: 0,
    y: 0,
    z: 0.62,
    rot: 0,
    /** 目标（跟随用） */
    tx: 0,
    ty: 0,
    tz: 0.62,
    trot: 0,
    /** 当前运镜（null = 平稳跟随） */
    flight: null,
    /**
     * 「拉远俯瞰」时的目标缩放。
     * 不写死 0.3：那要看舞台有多宽 —— 目标是让 R=5600 的整张底阵进画面，
     * 宽屏上算出来大概是 0.12；由 skin.js 在尺寸变化时更新。
     */
    overviewZ: 0.12,
  };

  /** 直接落位（挂载首帧 / 换歌重建世界时用，避免从 0,0 飞过来） */
  function snapTo(x, y, z) {
    cam.x = x;
    cam.y = y;
    cam.z = z;
    cam.tx = x;
    cam.ty = y;
    cam.tz = z;
    cam.rot = 0;
    cam.trot = 0;
    cam.flight = null;
  }

  function setTarget(x, y, z) {
    cam.tx = x;
    cam.ty = y;
    cam.tz = z;
  }

  /**
   * 起飞。
   *
   * @param {{x:number,y:number,zoom:number}} to 目标机位
   * @param {string} type pan | dash | arc | zoomOut | rotate | pass
   * @param {number} now 当前秒
   * @param {number} [durOverride] 转场时长（秒）。**提前量落位时用它**：
   *   飞行时间 = 歌词开口前提前量，于是唱到的时候镜头已经停稳。
   */
  function flyTo(to, type, now, durOverride) {
    const kind = TRANSITIONS[type] ? type : "pan";
    const from = { x: cam.x, y: cam.y, z: cam.z };
    const target = { x: to.x, y: to.y, z: to.zoom };
    setTarget(target.x, target.y, target.z);

    // 本来就在目标上：不用演一遍（任何运镜都一样）
    if (Math.hypot(target.x - from.x, target.y - from.y) < 1 && Math.abs(target.z - from.z) < 0.01) {
      cam.flight = null;
      return;
    }

    let ctrl = null;
    if (kind === "arc") ctrl = arcControl(from, target);
    cam.flight = {
      type: kind,
      from,
      to: target,
      ctrl,
      t0: now,
      dur: Number.isFinite(durOverride) && durOverride > 0 ? durOverride : TRANSITIONS[kind].dur,
      dir: target.x >= from.x ? 1 : -1,
    };
  }

  /**
   * 弧线的控制点：中点先往世界中心收一点（让弧“绕着阵”走），
   * 再叠一个垂直分量（保证不会退化成直线）。
   */
  function arcControl(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const toward = Math.hypot(mx, my);
    const pull = toward > 400 ? Math.min(0.2, 1200 / toward) : 0;
    const scale = Math.min(1, len / 2400);
    return {
      x: mx + (-dy / len) * len * 0.24 * scale + (toward > 400 ? -mx : 0) * pull,
      y: my + (dx / len) * len * 0.24 * scale + (toward > 400 ? -my : 0) * pull,
    };
  }

  /** 采样一条运镜（p ∈ 0..1） */
  function sample(f, p) {
    const { from, to } = f;
    switch (f.type) {
      case "arc": {
        const e = easeInOutQuint(p);
        const pt = quadAt(from, f.ctrl, to, e);
        // 飞行途中先缩后放（0.8× → 1.0×）
        return {
          x: pt.x,
          y: pt.y,
          z: lerp(from.z, to.z, e) * (1 - 0.2 * Math.sin(Math.PI * p)),
          rot: 0,
        };
      }
      case "dash": {
        // 短间隔专用：**不拉远**，直着冲过去 —— 前 70% 加速、后 30% 刹住，
        // 途中加一点点推镜 punch 与两度侧倾，快但不“平”。
        const e = p < 0.7 ? lerp(0, 0.87, easeInCubic(p / 0.7)) : lerp(0.87, 1, easeOutCubic((p - 0.7) / 0.3));
        return {
          x: lerp(from.x, to.x, e),
          y: lerp(from.y, to.y, e),
          z: lerp(from.z, to.z, e) * (1 + 0.07 * Math.sin(Math.PI * p)),
          rot: 0.035 * Math.sin(Math.PI * p) * f.dir,
        };
      }
      case "zoomOut": {
        // 三段：拉到俯瞰（整张底阵进画面）→ 平移到目标上方 → 压回目标缩放
        const pullBack = Math.max(0.05, Math.min(0.3, cam.overviewZ || 0.12));
        if (p < 0.35) {
          const q = easeOutCubic(p / 0.35);
          return { x: from.x, y: from.y, z: lerp(from.z, pullBack, q), rot: 0 };
        }
        if (p < 0.62) {
          const q = easeInOutCubic((p - 0.35) / 0.27);
          return { x: lerp(from.x, to.x, q), y: lerp(from.y, to.y, q), z: pullBack, rot: 0 };
        }
        const q = easeInCubic((p - 0.62) / 0.38);
        return { x: to.x, y: to.y, z: lerp(pullBack, to.z, q), rot: 0 };
      }
      case "rotate": {
        // 绕目标公转 50°，半径同时收到 0（螺旋切入），带一点回弹
        const rx = from.x - to.x;
        const ry = from.y - to.y;
        const r = Math.hypot(rx, ry);
        if (r < 60) return { x: to.x, y: to.y, z: lerp(from.z, to.z, easeOutCubic(p)), rot: 0 };
        const ang = Math.atan2(ry, rx) + ((f.dir * (50 * Math.PI)) / 180) * easeOutBack(p);
        const rr = r * (1 - easeInOutCubic(p));
        return {
          x: to.x + Math.cos(ang) * rr,
          y: to.y + Math.sin(ang) * rr,
          z: lerp(from.z, to.z, easeOutCubic(p)),
          rot: Math.sin(Math.PI * p) * 0.05 * f.dir,
        };
      }
      case "pass": {
        // 前 0.7 冲进去、后 0.3 刹住（中途由 skin.js 叠白闪）
        const e = p < 0.7 ? lerp(0, 0.88, easeInCubic(p / 0.7)) : lerp(0.88, 1, easeOutCubic((p - 0.7) / 0.3));
        return { x: lerp(from.x, to.x, e), y: lerp(from.y, to.y, e), z: lerp(from.z, to.z, e), rot: 0 };
      }
      case "pan":
      default: {
        const e = easeInOutCubic(p);
        return {
          x: lerp(from.x, to.x, e),
          y: lerp(from.y, to.y, e),
          z: lerp(from.z, to.z, e) * (1 - 0.05 * Math.sin(Math.PI * p)),
          rot: 0,
        };
      }
    }
  }

  /** 推进一帧 */
  function update(dt, now) {
    const f = cam.flight;
    if (f) {
      const p = clamp((now - f.t0) / f.dur, 0, 1);
      const s = sample(f, p);
      cam.x = s.x;
      cam.y = s.y;
      cam.z = s.z;
      cam.rot = s.rot;
      if (p >= 1) cam.flight = null;
      return;
    }
    // 平稳跟随：与帧率无关的 0.06/帧 lerp
    const k = 1 - Math.pow(1 - FOLLOW_ALPHA, Math.max(dt, 0) / 16.6667);
    cam.x += (cam.tx - cam.x) * k;
    cam.y += (cam.ty - cam.y) * k;
    cam.z += (cam.tz - cam.z) * k;
    cam.rot += (cam.trot - cam.rot) * k;
  }

  /**
   * 取**实际绘制**用的机位（在跟随结果上叠一层极慢的呼吸）。
   *
   * 只有平滑的 sin 位移，没有随机抖动 —— 随机抖会让 active 节点上的歌词
   * 每帧挪位，字还没看清就糊了（低频微震已按使用者要求移除，见文件头）。
   *
   * @param {number} now 秒
   * @param {{anim:boolean}} o anim=false（关动效 / 减少动效）时完全静止
   */
  function view(now, o) {
    let x = cam.x;
    let y = cam.y;
    let z = cam.z;
    if (o.anim) {
      x += Math.sin(now * 0.4) * 8;
      y += Math.cos(now * 0.3) * 6;
      z *= 1 + Math.sin(now * 0.5) * 0.004;
    }
    return { x, y, z, rot: cam.rot };
  }

  /** 当前运镜进度（无运镜返回 null）；白闪 / 连接光路 / 飞行特效都读它 */
  function progress(now) {
    const f = cam.flight;
    if (!f) return null;
    return { type: f.type, p: clamp((now - f.t0) / f.dur, 0, 1), from: f.from, to: f.to, ctrl: f.ctrl };
  }

  /** 穿越式的白闪强度（0..1） */
  function flash(now) {
    const pr = progress(now);
    if (!pr || pr.type !== "pass") return 0;
    const d = Math.abs(pr.p - TRANSITIONS.flashPeak);
    if (d >= TRANSITIONS.flashWidth) return 0;
    return Math.pow(1 - d / TRANSITIONS.flashWidth, 1.6);
  }

  return { cam, snapTo, setTarget, flyTo, update, view, progress, flash };
}
