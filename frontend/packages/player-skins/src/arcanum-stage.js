// @ts-check
/* ==========================================================================
   arcanum-stage.js — 「被歌词牵引的镜头」（纯数学，零 DOM）
   --------------------------------------------------------------------------
   需求原文：「摄像机跟随最新歌词，但不能乱飞」。这句话拆成五条可实现的规则，
   全部在这个文件里，且都是纯函数式的状态推进（不读 DOM、不读时间戳）：

     1. **目标点 = 最新歌词节点，提前 0.2~0.3s 开始移动**
        —— 「该看哪一句」由 arcanum-timing.resolveFocus() 决定（提前量在那里），
        本模块只负责把节点坐标换算成镜头位移。
     2. **平滑阻尼** —— 指数逼近（tau 秒），不是硬切。
     3. **边界限制** —— 位移夹在 maxPan 之内；镜头永远在法阵舞台范围内。
     4. **速度上限（防眩晕）** —— 每帧位移量再夹一次；快速连跳歌词时镜头
        也不会「唰」地飞过去。这一条是需求里明确点名的「减少动态效果」之外的
        基础保护，默认一直生效。
     5. **节奏镜头** —— 由调用方给「缩放偏置」（副歌拉远 / 长音推近）与
        pulse()（重拍轻震）；本模块只把它们叠进结果。
   ========================================================================== */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (dt, tau) => 1 - Math.exp(-Math.max(0, dt) / Math.max(0.001, tau));

/**
 * @param {object} [opts]
 * @param {number} [opts.lean] 歌词把镜头拽过去多少（0 = 镜头不动，1 = 节点完全居中）
 * @param {number} [opts.maxPanRatio] 位移上限（舞台短边的比例）
 * @param {number} [opts.followTau] 跟随的阻尼时间常数（秒）
 * @param {number} [opts.maxSpeedRatio] 速度上限（舞台短边 / 秒）
 * @param {number} [opts.driftRatio] 自主漂移幅度（舞台短边的比例）
 * @param {number} [opts.shakeRatio] 重拍轻震的最大幅度（舞台短边的比例）
 */
export function createStageCamera(opts = {}) {
  const o = {
    lean: 0.42,
    maxPanRatio: 0.14,
    followTau: 0.5,
    maxSpeedRatio: 0.34,
    driftRatio: 0.008,
    shakeRatio: 0.006,
    ...opts,
  };

  const state = {
    /** 镜头位移（px），直接写进 transform: translate3d(...) */
    panX: 0,
    panY: 0,
    /** 缩放 */
    zoom: 1,
    /** 重拍轻震的瞬时位移（px），叠加在 pan 上 */
    shakeX: 0,
    shakeY: 0,
    /** 当前关注的节点（归一化舞台坐标），自检用 */
    nodeX: 0,
    nodeY: 0,
  };

  let targetPanX = 0;
  let targetPanY = 0;
  let targetZoom = 1;
  let viewW = 1;
  let viewH = 1;
  let elapsed = 0;
  let shakeAmp = 0;
  let shakeAt = -1e9;

  const minSide = () => Math.max(1, Math.min(viewW, viewH));
  /** 目标位移的上限（"镜头不能跑出法阵舞台"） */
  const aimCap = () => o.maxPanRatio * minSide();
  /**
   * 实际位移的上限比目标上限宽一点点 —— 自主漂移是叠在目标上的慢呼吸，
   * 如果和硬上限一样高，镜头贴边时那点呼吸会被裁掉、看起来"卡在墙上"。
   */
  const panLimit = () => aimCap() * 1.25;

  /** 舞台尺寸变化：位移上限跟着变，并立刻把当前值夹回范围内 */
  function resize(w, h) {
    viewW = Math.max(1, Number(w) || 1);
    viewH = Math.max(1, Number(h) || 1);
    const cap = aimCap();
    const lim = panLimit();
    state.panX = clamp(state.panX, -lim, lim);
    state.panY = clamp(state.panY, -lim, lim);
    targetPanX = clamp(targetPanX, -cap, cap);
    targetPanY = clamp(targetPanY, -cap, cap);
  }

  /**
   * 设定「镜头该看向哪个歌词节点」。
   *
   * 节点在屏幕上的位置 = 画面焦点（50% / 40%，写在 CSS 里）+ 归一化偏移，
   * 所以要让节点靠近焦点，镜头就得往**反方向**走：pan = -lean × 偏移 × 尺寸。
   * 系数 0.42 意味着「节点只被拽到焦点方向的一半」—— 完全居中会让整个法阵
   * 被推得偏到一边，观感上反而像画面歪了。
   *
   * @param {{x:number,y:number}} node 归一化舞台坐标（0.12 = 右移 12% 视口宽）
   */
  function aim(node) {
    const nx = Number(node?.x) || 0;
    const ny = Number(node?.y) || 0;
    state.nodeX = nx;
    state.nodeY = ny;
    const cap = aimCap();
    targetPanX = clamp(-o.lean * nx * viewW, -cap, cap);
    targetPanY = clamp(-o.lean * ny * viewH * 0.7, -cap, cap);
  }

  /** 缩放目标（副歌拉远 / 长音推近等由调用方算好偏置） */
  function zoomTo(z) {
    targetZoom = clamp(Number(z) || 1, 0.9, 1.22);
  }

  /** 重拍轻震（0..1.5） */
  function pulse(strength = 1) {
    shakeAmp = Math.max(shakeAmp, clamp(strength, 0, 1.5));
    shakeAt = elapsed;
  }

  /**
   * 推进一帧。
   *
   * @param {number} dt 秒
   * @param {{ enabled?: boolean, speedScale?: number }} [ctx]
   */
  function step(dt, ctx = {}) {
    const d = clamp(dt || 0, 0, 0.1);
    elapsed += d;
    const enabled = ctx.enabled !== false;
    const speedScale = clamp(Number(ctx.speedScale) || 1, 0.2, 2);

    if (!enabled) {
      // 关掉动效 / 减少动态效果：镜头回到中位，不再跟随
      const k = approach(d, 0.4);
      state.panX += (0 - state.panX) * k;
      state.panY += (0 - state.panY) * k;
      state.zoom += (1 - state.zoom) * k;
      state.shakeX = 0;
      state.shakeY = 0;
      shakeAmp = 0;
      return state;
    }

    // 自主漂移：一条很慢的呼吸，让镜头「一直在动」而不是到位后彻底静止
    const drift = o.driftRatio * minSide();
    const lim = panLimit();
    const tx = clamp(
      targetPanX + Math.sin(elapsed * 0.17) * drift + Math.sin(elapsed * 0.061 + 1.3) * drift * 0.6,
      -lim,
      lim
    );
    const ty = clamp(
      targetPanY + Math.cos(elapsed * 0.14) * drift * 0.8 + Math.cos(elapsed * 0.047 + 0.6) * drift * 0.5,
      -lim,
      lim
    );

    // 阻尼跟随 + 速度上限：先算理想位移，再夹住它的大小
    const k = approach(d, o.followTau);
    let dx = (tx - state.panX) * k;
    let dy = (ty - state.panY) * k;
    const cap = o.maxSpeedRatio * minSide() * speedScale * d;
    const len = Math.hypot(dx, dy);
    if (len > cap && len > 0) {
      dx = (dx / len) * cap;
      dy = (dy / len) * cap;
    }
    state.panX += dx;
    state.panY += dy;
    state.zoom += (targetZoom - state.zoom) * approach(d, 0.7);

    // 重拍轻震：sin 包络，两端为 0，所以不会在震动结束时抖一下
    if (shakeAmp > 0) {
      const te = elapsed - shakeAt;
      if (te > 0.42) {
        shakeAmp = 0;
        state.shakeX = 0;
        state.shakeY = 0;
      } else if (te >= 0) {
        const env = Math.sin((te / 0.42) * Math.PI);
        const amp = shakeAmp * o.shakeRatio * minSide() * env;
        state.shakeX = amp * Math.sin(te * 62);
        state.shakeY = amp * Math.sin(te * 47 + 1.1) * 0.7;
      }
    }
    return state;
  }

  function reset() {
    state.panX = 0;
    state.panY = 0;
    state.zoom = 1;
    state.shakeX = 0;
    state.shakeY = 0;
    targetPanX = 0;
    targetPanY = 0;
    targetZoom = 1;
    shakeAmp = 0;
  }

  return { state, resize, aim, zoomTo, pulse, step, reset };
}
