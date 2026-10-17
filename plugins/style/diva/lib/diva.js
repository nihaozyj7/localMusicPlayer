/* ==========================================================================
   diva/lib/diva.js — 「星轨歌姬」程序化人物：姿态 / 五官 / 发丝 / 全息后期
   --------------------------------------------------------------------------
   一句话：**把人画成一张会动的插画，而不是一堆色块。**

   一、坐标口径（与 config.js 的说明一致）
     单位空间：脚底为原点 (0,0)，人物高 1000，向上为 -y。
     draw() 只做一次 save / translate(cx, baseY) / scale(divaH / 1000)，
     结尾 restore；人物内部所有几何都用这套"毫米级"常量写死在 SK 里，
     所以改比例只需要改 SK，不用碰舞台像素。

   二、分层（自下而上，像素前 → 后）
       ① 光台        脚下的全息光盘（环 + 刻度，节拍时轻微胀缩）
       ② 背后长发    大轮廓 + 内侧阴影 + 逐股发丝（按 hairPhase 波动）
       ③ 裙摆后层    深紫外裙 + 中景膜 + 地面波浪
       ④ 腿 / 脚     冷白肤色，透过半透明裙料隐约可见
       ⑤ 裙摆前层    高腰主裙 + 膜层 + 发光缝线 + 裙摆波浪
       ⑥ 躯干        薄纱胸衣（呼吸时肩线 ±4、胸廓 ±3）、腰封、星辉胸针
       ⑦ 手臂 / 手   右手（画面左侧）举麦到嘴边；左手自然垂摆
       ⑧ 颈部 / 脸   冷白肤色，下颌与锁骨有冷紫阴影
       ⑨ 刘海/侧发   前发层次（碎发尖 + 侧发束 + 胸前的两缕发丝）
       ⑩ 五官        双眼（含虹膜/瞳孔/高光/睫毛）、眉、鼻尖、口型、腮红
       ⑪ 头戴耳机    头梁 + 耳罩 + 细支麦杆
       ⑫ 手持麦克风  金属柄 + 网罩 + 发光环
       ⑬ 全息后期    轮廓边缘光 / 极淡扫描线 / 轻微 RGB 色散 / 节拍 glitch / 星尘
     禁止：图片素材、整屏模糊、每帧造巨型渐变、非确定性随机。

   三、动画（全部确定性：同一帧对象 → 同一姿态）
     computePose(f) 是纯函数，给出 11 个姿态量（语义见下面的 POSE_KEYS）。
     频谱量只在 playing 时生效（暂停 → 口型/重心/亮度平滑回到 0）；
     reduced = true 时直接返回静态姿态，画面完整但不眨眼、不摆、不动。
     createDiva 内部再对"口型 / 重心 / 高频发梢 / 节拍脉冲"做帧率无关的
     attack·release 平滑，让动作像呼吸而不是阶跃。

   四、性能
     单帧"绘制调用"（fill / stroke / fillRect 等真正落笔的调用）约 150 次，
     smooth 档 < 170，performance 档 < 120；路径点（moveTo / lineTo 等）
     不算绘制调用。所有颜色字符串按调色板缓存，渐变每换一次配色才重建。
     save / restore 严格配平，draw 结束时 context 回到进来时的状态。
   ========================================================================== */

// 子模块依赖同样要透传 token（原因见 skin.js 顶部那段说明）
const Q = new URL(import.meta.url).search;
const { PALETTE, TIMING } = await import(`./config.js${Q}`);
const { clamp, clamp01, smoothTo, rgba, mixHex, mulberry32, TAU } = await import(`./util.js${Q}`);

/** 单位空间里的人物高度（脚底 = 0，头顶 = -DIVA_UNIT） */
export const DIVA_UNIT = 1000;

/** computePose 的输出字段（测试与文档共用，顺序即语义） */
export const POSE_KEYS = Object.freeze([
  "breath", // 0..1   呼吸量（0.5 = 中性；渲染成肩线 ±4 / 胸廓 ±3）
  "sway", //   °      身体左右摆动（待机 ±1.5°，低频再叠 ≤0.35°）
  "headTilt", // °     头部倾斜（待机 ±1.7°，人声再叠 ≤0.9°）
  "headBob", // 单位   头部上下浮动（负 = 抬起；人声让头微仰）
  "mouth", //  0..1   口型张开度
  "blink", //  0..1   闭眼程度（0 = 睁开，1 = 闭合）
  "hairPhase", // 弧度 发丝波动相位（reduced 时为 0）
  "armLift", // 0..1  手臂抬举量（0.5 = 中性）
  "glow", //   0..1   全息亮度（节拍 + 能量）
  "pulse", //  0..1   节拍脉冲（尖锐、快衰减）
  "eyeOpen", // 0..1  睁眼度（= 1 - blink，单独给出方便直接画）
]);

const DEG = Math.PI / 180;

/* --------------------------------------------------------------------------
   骨架常量（单位空间）
   --------------------------------------------------------------------------
   头身比 1:7：头顶 -1000 → 下颌 -856，头部高 144 ≈ 1000 / 7。
   肩宽 92×2 ≈ 1.7 个头宽，腰 56×2，裙摆半径 198（到地面）。
   -------------------------------------------------------------------------- */
const SK = {
  crownY: -1000,
  headTop: -996,
  chinY: -854,
  headPivotY: -816,
  neckTop: -884,
  neckBase: -814,
  neckHalf: 15,
  shoulderY: -806,
  shoulderX: 92,
  bustY: -752,
  waistY: -648,
  waistX: 56,
  hipY: -582,
  hemY: -18,
  eyeY: -918,
  browY: -944,
  noseY: -898,
  mouthY: -874,
  legX: 31,
  kneeY: -300,
  ankleY: -44,
};

/** 眼睛的几何（半宽 / 内眼角 / 上睑高 / 下睑低），左右共用 */
const EYE = { halfW: 19, innerW: 11, up: 11.2, lo: 6.8, cx: 23.5 };

/** 全息配色的骨相：无论封面取到什么强调色，皮肤与发底都收在冷白 / 银紫里 */
const SKIN_HEX = "#eef3ff";

/* --------------------------------------------------------------------------
   确定性眨眼时间表
   --------------------------------------------------------------------------
   用 mulberry32 从固定种子派生「每次眨眼的间隔」（2.4~6.4s），再缓存成
   升序时间点。缓存是**确定性的前缀**：先查到 60s 还是先查到 6s，
   前 6s 的眨眼时刻完全一致，所以 computePose 仍然是 f 的纯函数。
   -------------------------------------------------------------------------- */
const BLINK_SEED = 0x9e3779b9;
const blinkSchedule = { seed: -1, starts: [], nextAt: 0, rand: null, filledTo: -1 };

function resetBlinkSchedule(seed) {
  blinkSchedule.seed = seed >>> 0;
  blinkSchedule.starts = [];
  blinkSchedule.filledTo = -1;
  blinkSchedule.rand = mulberry32(blinkSchedule.seed);
  // ★ 首次间隔必须在重置时**只抽一次**：如果拖到"列表还空着"的每次查询里重抽，
  //   结果就会依赖查询节奏（同一时刻先查 6s 还是先查 60s 会得到不同时间表）。
  blinkSchedule.nextAt = TIMING.blinkMinMs + blinkSchedule.rand() * (TIMING.blinkMaxMs - TIMING.blinkMinMs);
}

/**
 * 保证时间表已经覆盖到 t（毫秒）。惰性追加，不重建；
 * 时间表是**确定性的前缀**，与查询节奏无关。
 * 上限 24h：性能计时器不会有比这更长的一次会话，超过的部分按最后一档间隔续。
 * @param {number} until
 * @param {number} [seed]
 */
function ensureBlinkSchedule(until, seed = BLINK_SEED) {
  if (blinkSchedule.seed !== (seed >>> 0)) resetBlinkSchedule(seed);
  const cap = 24 * 3600 * 1000;
  const goal = Math.min(Math.max(0, until), cap);
  if (goal <= blinkSchedule.filledTo) return;

  const min = TIMING.blinkMinMs;
  const span = Math.max(1, TIMING.blinkMaxMs - TIMING.blinkMinMs);
  let guard = 0;
  while (blinkSchedule.nextAt <= goal && guard < 100000) {
    blinkSchedule.starts.push(blinkSchedule.nextAt);
    blinkSchedule.nextAt += min + blinkSchedule.rand() * span;
    guard += 1;
  }
  blinkSchedule.filledTo = goal;
}

/**
 * t 时刻的闭眼程度（0 = 完全睁开，1 = 完全闭合）。
 *
 * 单次眨眼用 sin(πu) 收口：起点 0、中点 1、终点 0，时长恰好是 TIMING.blinkMs，
 * 所以「时长 ≈ 140ms」是可验证的，而不是靠采样凑出来的。
 *
 * @param {number} nowMs 时间轴（与 computePose 的 f.now 同口径）
 * @param {number} [seed] 可选的派生种子（同一实例可以有自己的眨眼节奏）
 * @returns {number} 0..1
 */
export function blinkAt(nowMs, seed = BLINK_SEED) {
  if (!Number.isFinite(nowMs) || nowMs <= 0) return 0;
  ensureBlinkSchedule(nowMs + 1, seed);
  const starts = blinkSchedule.starts;
  if (starts.length === 0) return 0;

  // 二分找「最后一次不晚于 now 的眨眼起点」
  let lo = 0;
  let hi = starts.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= nowMs) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx < 0) return 0;
  const u = (nowMs - starts[idx]) / TIMING.blinkMs;
  if (!(u >= 0 && u < 1)) return 0;
  return Math.sin(Math.PI * u);
}

/* --------------------------------------------------------------------------
   姿态：computePose(f) —— 纯函数，同输入永远同输出
   -------------------------------------------------------------------------- */

/** 把任意输入夹成有限数（-0 归一成 0，便于 deepEqual 断言） */
function finite(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n === 0 ? 0 : n;
}

function num01(v) {
  return clamp01(finite(v, 0));
}

/** 频谱快照 → 视口内的驱动量；ready 为 false / 没有快照时全 0 */
const ZERO_SPEC = Object.freeze({ ready: false, low: 0, mid: 0, high: 0, vocal: 0, energy: 0, beat: 0 });

function specOf(spec) {
  if (!spec || typeof spec !== "object") return ZERO_SPEC;
  if (spec.ready === false) return ZERO_SPEC;
  return {
    ready: true,
    low: num01(spec.low),
    mid: num01(spec.mid),
    high: num01(spec.high),
    vocal: num01(spec.vocal),
    energy: num01(spec.energy),
    beat: num01(spec.beat),
  };
}

/** 频谱驱动量（播放中才生效；暂停时即使快照里还有残值也要收掉） */
function driveOf(f, spec) {
  const playing = f.playing === true;
  if (!playing || !spec.ready) return ZERO_SPEC;
  return spec;
}

/**
 * 唱句张开度：安静段落闭着嘴（口型 > 0 只在真的有人声时出现）。
 * 用 smoothstep 把低音量压掉，避免每帧都在"微微张嘴"。
 */
function mouthCurve(vocal) {
  const v = clamp01((vocal - 0.04) * 1.18);
  return v * v * (3 - 2 * v);
}

/**
 * 计算一帧的姿态。纯函数：不读状态、不写状态、不抛异常。
 *
 * @param {any} f 入口传的冻结帧对象（可能缺字段，按 0 处理）
 * @returns {{breath:number, sway:number, headTilt:number, headBob:number, mouth:number,
 *            blink:number, hairPhase:number, armLift:number, glow:number,
 *            pulse:number, eyeOpen:number}}
 */
export function computePose(f) {
  const fr = f && typeof f === "object" ? f : {};

  // reduced：画面成立但完全静止 —— 所有位移量精确为 0（不是"很小"）
  if (fr.reduced === true) {
    return {
      breath: 0,
      sway: 0,
      headTilt: 0,
      headBob: 0,
      mouth: 0,
      blink: 0,
      hairPhase: 0,
      armLift: 0.5,
      glow: 0.3,
      pulse: 0,
      eyeOpen: 1,
    };
  }

  const t = finite(fr.t, 0);
  const spec = specOf(fr.spec);
  const drive = driveOf(fr, spec);
  const low = clamp01(finite(drive.low, 0));
  const vocal = clamp01(finite(drive.vocal, 0));
  const high = clamp01(finite(drive.high, 0));
  const energy = clamp01(finite(drive.energy, 0));
  const beat = clamp01(finite(fr.beat, drive.beat));
  const now = finite(fr.now, t * 1000);

  // —— 待机：呼吸 / 摆身 / 头部微倾与浮动（正弦，确定性）——
  const breath = 0.5 + 0.5 * Math.sin((TAU * t) / 4.6);
  const sway =
    Math.sin((TAU * t) / 6.4) * 1.15 + Math.sin((TAU * t) / 3.1 + 1.2) * 0.35 + low * 0.35;
  const headTilt = Math.sin((TAU * t) / 5.1 + 0.6) * 1.7 + vocal * 0.9;
  // headBob 走"负 = 抬"：人声越大头越微仰；待机时只有 ±1.6 的浮动
  const headBob = Math.sin((TAU * t) / 3.7) * 1.6 - vocal * 3.6;

  // 发丝相位：高频越多，波动越快（reduced 已在上方返回 0）
  const hairPhase = (TAU * t * (0.8 + high * 0.9)) / 3.4;

  // 手臂：待机轻抬 + 人声带一点"举麦"的幅度
  const armLift = clamp01(0.42 + Math.sin((TAU * t) / 4.2 + 0.4) * 0.18 + vocal * 0.34);

  const glow = clamp01(0.2 + energy * 0.4 + beat * 0.5);
  const pulse = clamp01(beat);
  const mouth = fr.playing === true ? mouthCurve(vocal) : 0;

  const blink = blinkAt(now);
  const eyeOpen = clamp01(1 - blink);

  return {
    breath: finite(breath),
    sway: finite(sway),
    headTilt: finite(headTilt),
    headBob: finite(headBob),
    mouth: finite(mouth),
    blink: finite(blink),
    hairPhase: finite(hairPhase),
    armLift: finite(armLift),
    glow: finite(glow),
    pulse: finite(pulse),
    eyeOpen: finite(eyeOpen),
  };
}

/* --------------------------------------------------------------------------
   调色板 → 颜色字符串（按调色板缓存；换封面配色才重建）
   -------------------------------------------------------------------------- */

const HEX_RE = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** 合法 hex 就用，否则退回兜底色 */
function pickHex(v, fallback) {
  return typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim() : fallback;
}

/* --------------------------------------------------------------------------
   路径构造函数（只写路径，不落笔；fill / stroke 由外面决定）
   --------------------------------------------------------------------------
   分层纪律：**每一缕头发、每一层裙摆都是独立闭合路径** —— 不是一整块形状
   叠渐变。这样才读得出"发丝"和"多层薄纱"，也是"像插画"而不是"色块"的关键。
   -------------------------------------------------------------------------- */

/** 背后长发的大轮廓（只是"发量底"，发束会在下缘戳出去，所以下摆收得高） */
function backHairPath(g) {
  g.moveTo(0, -1018);
  g.bezierCurveTo(40, -1018, 66, -1002, 48, -978);
  g.bezierCurveTo(82, -940, 94, -860, 98, -780);
  g.bezierCurveTo(106, -680, 110, -600, 104, -552);
  g.quadraticCurveTo(98, -516, 84, -542);
  g.quadraticCurveTo(66, -506, 48, -544);
  g.quadraticCurveTo(28, -508, 10, -546);
  g.quadraticCurveTo(-10, -510, -28, -548);
  g.quadraticCurveTo(-48, -506, -66, -544);
  g.quadraticCurveTo(-84, -510, -98, -540);
  g.quadraticCurveTo(-106, -524, -102, -562);
  g.bezierCurveTo(-108, -640, -104, -720, -98, -780);
  g.bezierCurveTo(-94, -860, -82, -940, -48, -978);
  g.bezierCurveTo(-66, -1002, -40, -1018, 0, -1018);
  g.closePath();
}

/**
 * 一缕后发：根部 (rx,ry) 宽 w，锥形收到发梢 (tx,ty)，带一点 S 弯。
 * 逐缕之间的相位差由调用方算进 tx / ty，所以每缕的摆幅不完全一样。
 */
function hairStrandPath(g, rx, ry, tx, ty, w) {
  const d = tx >= rx ? 1 : -1;
  g.moveTo(rx - w * 0.55, ry);
  g.bezierCurveTo(rx - w * 0.5 - d * 8, ry + 200, tx - w * 0.62, ty - 150, tx, ty);
  g.bezierCurveTo(tx + w * 0.16, ty - 140, rx + w * 0.52, ry + 180, rx + w * 0.55, ry);
  g.closePath();
}

/** 一片刘海：从额顶 (x0,y0) 斜落到发尖 (x1,y1)，根宽 w */
function bangLockPath(g, x0, y0, x1, y1, w) {
  g.moveTo(x0 - w * 0.5, y0);
  g.bezierCurveTo(x0 - w * 0.62, y0 + 30, x1 - w * 0.42, y1 - 26, x1, y1);
  g.bezierCurveTo(x1 + w * 0.12, y1 - 26, x0 + w * 0.6, y0 + 26, x0 + w * 0.5, y0);
  g.closePath();
}

/**
 * 侧发束（前层，框住脸）。
 * @param {number} s 1 = 画面右侧，-1 = 画面左侧
 */
function sideLockPath(g, s) {
  g.moveTo(s * 42, -972);
  g.bezierCurveTo(s * 58, -928, s * 62, -858, s * 56, -798);
  g.bezierCurveTo(s * 52, -756, s * 54, -720, s * 50, -696);
  g.bezierCurveTo(s * 41, -724, s * 37, -760, s * 38, -796);
  g.bezierCurveTo(s * 40, -862, s * 33, -930, s * 30, -968);
  g.closePath();
}

/** 脸：额顶 → 颊 → 尖下颌（五官落在脸的下 2/3，别铺满整张脸） */
function facePath(g) {
  g.moveTo(0, SK.headTop);
  g.bezierCurveTo(24, -996, 42, -982, 47, -956);
  g.bezierCurveTo(52, -930, 48, -900, 38, -880);
  g.bezierCurveTo(28, -864, 14, -856, 0, SK.chinY);
  g.bezierCurveTo(-14, -856, -28, -864, -38, -880);
  g.bezierCurveTo(-48, -900, -52, -930, -47, -956);
  g.bezierCurveTo(-42, -982, -24, -996, 0, -996);
  g.closePath();
}

/** 通用裙摆层：腰半宽 / 下摆半宽 / 腰高 / 下摆高 / 下摆波浪 */
function skirtLayerPath(g, waistHalf, hemHalf, topY, hemY, w) {
  g.moveTo(-waistHalf, topY);
  g.bezierCurveTo(-waistHalf - 28, topY + 170, -hemHalf + 36, hemY - 44, -hemHalf, hemY + w[0]);
  g.quadraticCurveTo(-hemHalf * 0.45, hemY + 14 + w[1], 0, hemY + 4);
  g.quadraticCurveTo(hemHalf * 0.45, hemY - 4 + w[2], hemHalf, hemY + w[2]);
  g.bezierCurveTo(hemHalf - 36, hemY - 44, waistHalf + 28, topY + 170, waistHalf, topY);
  g.quadraticCurveTo(0, topY + 7, -waistHalf, topY);
  g.closePath();
}

/** 后裙摆（最外层，压到地面） */
function skirtBackPath(g, w) {
  skirtLayerPath(g, 58, 206, -646, SK.hemY + 2, w);
}

/** 前裙摆（高腰主裙，比后层窄，能看见后层的膜与外轮廓） */
function skirtFrontPath(g, w) {
  skirtLayerPath(g, 46, 168, -632, SK.hemY - 2, w);
}

/** 胸衣：肩点 → 腋下 → 收腰 → 心形领口 */
function bodicePath(g, b) {
  const sy = SK.shoulderY - b * 4;
  const wx = SK.waistX + b * 1.5;
  g.moveTo(-SK.shoulderX, sy);
  g.bezierCurveTo(-88, sy + 18, -80, sy + 32, -78, sy + 44);
  g.bezierCurveTo(-72, -716, -62, -676, -wx, SK.waistY);
  g.quadraticCurveTo(0, SK.waistY + 5, wx, SK.waistY);
  g.bezierCurveTo(62, -676, 72, -716, 78, sy + 44);
  g.bezierCurveTo(80, sy + 26, 88, sy + 12, SK.shoulderX, sy);
  // 心形领口：两瓣中间下凹，露出锁骨与一点点胸口
  g.quadraticCurveTo(64, sy + 14, 40, sy + 26);
  g.quadraticCurveTo(12, sy + 40, 0, sy + 32);
  g.quadraticCurveTo(-12, sy + 40, -40, sy + 26);
  g.quadraticCurveTo(-64, sy + 14, -SK.shoulderX, sy);
  g.closePath();
}

/** 腰封（胸衣和裙摆之间那条收腰的带子） */
function waistBandPath(g) {
  g.moveTo(-58, SK.waistY - 18);
  g.quadraticCurveTo(0, SK.waistY - 10, 58, SK.waistY - 18);
  g.lineTo(55, SK.waistY + 2);
  g.quadraticCurveTo(0, SK.waistY + 10, -55, SK.waistY + 2);
  g.closePath();
}

/** 一条腿（含脚踝收束），cx 是腿中心线 */
function legPath(g, cx) {
  g.moveTo(cx - 26, -600);
  g.bezierCurveTo(cx - 27, -520, cx - 19, -390, cx - 18, SK.kneeY);
  g.bezierCurveTo(cx - 17, -220, cx - 14, -120, cx - 12, -52);
  g.quadraticCurveTo(cx - 6, -42, cx + 8, -46);
  g.bezierCurveTo(cx + 11, -120, cx + 13, -220, cx + 16, SK.kneeY);
  g.bezierCurveTo(cx + 19, -390, cx + 27, -520, cx + 26, -600);
  g.closePath();
}

/** 扫描线裁剪用的整体剪影（裙摆 → 躯干 → 头发，一个闭合区域） */
function bodySilhouettePath(g) {
  g.moveTo(-198, -14);
  g.bezierCurveTo(-152, -230, -120, -400, -84, -560);
  g.bezierCurveTo(-76, -700, -66, -782, -48, -818);
  g.bezierCurveTo(-62, -902, -56, -968, 0, -1014);
  g.bezierCurveTo(56, -968, 62, -902, 48, -818);
  g.bezierCurveTo(66, -782, 76, -700, 84, -560);
  g.bezierCurveTo(120, -400, 152, -230, 198, -14);
  g.quadraticCurveTo(0, 30, -198, -14);
  g.closePath();
}

/* --------------------------------------------------------------------------
   createDiva —— 一次挂载一个实例
   -------------------------------------------------------------------------- */

/**
 * 创建人物绘制器。
 *
 * 契约：`{ draw(g, f), destroy() }`。
 * draw 内部只用 f 里冻结的字段，不读全局、不碰 DOM、不排帧。
 *
 * @param {{blinkSeed?: number}} [opts]
 */
export function createDiva(opts = {}) {
  /** 渲染态：只放"需要跨帧平滑"的量，全部是数字 */
  const state = {
    init: false,
    mouth: 0,
    weight: 0,
    hairAmp: 0,
    pulse: 0,
    glow: 0,
    armLift: 0.5,
  };
  const blinkSeed = Number.isFinite(opts.blinkSeed) ? Number(opts.blinkSeed) >>> 0 : BLINK_SEED;

  /** 调色板缓存 */
  let lookKey = "";
  let lookCtx = null;
  let C = null;
  let G = null;

  /** 每帧复用的姿态对象（避免 GC） */
  const P = {
    breath: 0.5,
    sway: 0,
    headTilt: 0,
    headBob: 0,
    mouth: 0,
    blink: 0,
    hairPhase: 0,
    armLift: 0.5,
    glow: 0,
    pulse: 0,
    eyeOpen: 1,
    weight: 0,
    hairAmp: 0,
  };

  let destroyed = false;

  /* ---------- 调色板 / 渐变 ---------- */

  function ensureLook(g, palette) {
    const pal = palette && typeof palette === "object" ? palette : PALETTE;
    const accent = pickHex(pal.accent, PALETTE.accent);
    const cyan = pickHex(pal.cyan, PALETTE.cyan);
    const violet = pickHex(pal.violet, PALETTE.violet);
    const pink = pickHex(pal.pink, PALETTE.pink);
    const fg = pickHex(pal.fg, PALETTE.fg);
    const key = [accent, cyan, violet, pink, fg].join("|");
    if (key === lookKey && lookCtx === g) return;

    lookKey = key;
    lookCtx = g;

    const shadow = mixHex("#b8c2e6", violet, 0.34);
    const hairCool = mixHex("#cfc2ff", cyan, 0.18);
    C = {
      // —— 皮肤（冷白，带一点点紫调阴影）——
      skin: rgba(SKIN_HEX, 0.98),
      skinSoft: rgba(mixHex(SKIN_HEX, cyan, 0.08), 0.96),
      skinGhost: rgba(SKIN_HEX, 0.42),
      skinShade: rgba(shadow, 0.5),
      skinLine: rgba(shadow, 0.7),
      skinDeep: rgba(mixHex(violet, "#2a2350", 0.55), 0.55),
      // —— 头发：根银白 → 中段淡紫 → 发梢青）——
      hairRoot: rgba(mixHex("#f7f4ff", violet, 0.1), 0.98),
      hairBack: rgba(mixHex("#b4a4ec", violet, 0.3), 0.95),
      hairBackDeep: rgba(mixHex("#6a5ab4", violet, 0.4), 0.78),
      hairMid: rgba(hairCool, 0.94),
      hairMixed: rgba(mixHex("#9b8ce4", violet, 0.42), 0.93),
      hairLight: rgba("#f8f5ff", 0.96),
      hairTip: rgba(mixHex(cyan, "#dcfbff", 0.25), 0.92),
      hairTipSoft: rgba(cyan, 0.5),
      hairShadow: rgba("#463a80", 0.55),
      hairline: rgba(mixHex("#382a6c", violet, 0.45), 0.42),
      hairStrand: rgba("#ffffff", 0.6),
      hairStrandDim: rgba(mixHex("#d6cbff", violet, 0.3), 0.55),
      hairEdge: rgba(mixHex(cyan, "#ffffff", 0.3), 0.62),
      // —— 礼服：深紫 → 青，多层半透明 ——
      dressDeep: rgba(mixHex(violet, "#191040", 0.55), 0.95),
      dressBody: rgba(mixHex(violet, "#241a58", 0.35), 0.92),
      dressFilm: rgba(cyan, 0.2),
      dressFilm2: rgba(violet, 0.28),
      dressLight: rgba(mixHex(cyan, "#ffffff", 0.5), 0.35),
      dressCyan: rgba(mixHex(cyan, "#e6fdff", 0.28), 0.5),
      seam: rgba(accent, 0.68),
      seamSoft: rgba(cyan, 0.52),
      seamFaint: rgba(accent, 0.26),
      gem: rgba(mixHex(cyan, "#ffffff", 0.55), 0.95),
      // —— 面部 ——
      eyeWhite: rgba("#f4f8ff", 0.95),
      eyeShadow: rgba(mixHex(violet, "#1a1430", 0.5), 0.3),
      iris: rgba(mixHex(cyan, "#a8f8ff", 0.35), 0.97),
      irisDeep: rgba(mixHex(violet, "#12183e", 0.4), 0.92),
      pupil: rgba("#120e28", 0.95),
      lash: rgba("#1e1634", 0.92),
      lashSoft: rgba(mixHex(shadow, violet, 0.5), 0.55),
      crease: rgba(mixHex(shadow, violet, 0.45), 0.45),
      brow: rgba(mixHex("#4a3970", violet, 0.4), 0.9),
      lip: rgba(mixHex(pink, "#a85678", 0.4), 0.92),
      lipLight: rgba(mixHex(pink, "#e88aa8", 0.35), 0.9),
      lipDark: rgba(mixHex(violet, "#3a1024", 0.55), 0.75),
      mouthIn: rgba("#2a0e20", 0.9),
      teeth: rgba("#fff6fa", 0.82),
      blush: rgba(pink, 0.2),
      // —— 耳机 / 麦克风（深色金属 + 青边）——
      metal: rgba("#20264a", 0.96),
      metalEdge: rgba(accent, 0.62),
      cupGlow: rgba(accent, 0.34),
      cupDark: rgba("#111634", 0.95),
      micBody: rgba("#181c34", 0.97),
      micEdge: rgba(mixHex(cyan, "#ffffff", 0.45), 0.72),
      micGrille: rgba(mixHex(cyan, violet, 0.35), 0.8),
      // —— 全息后期 ——
      rimCyan: rgba(mixHex(cyan, "#ffffff", 0.3), 0.55),
      rimViolet: rgba(mixHex(violet, "#e0d0ff", 0.25), 0.5),
      rimSoft: rgba(accent, 0.3),
      holo: rgba(accent, 0.1),
      scan: rgba(cyan, 0.12),
      scanBright: rgba(mixHex(cyan, "#ffffff", 0.5), 0.22),
      chromaWarm: rgba(mixHex(pink, "#ff2d55", 0.4), 0.4),
      chromaCool: rgba(mixHex(cyan, "#00ffd0", 0.35), 0.4),
      glitch: rgba(accent, 0.2),
      spark: rgba("#ffffff", 0.92),
      dust: rgba(mixHex(cyan, "#ffffff", 0.35), 0.7),
      // —— 光台 / 接触光 ——
      platOuter: rgba(accent, 0.12),
      platMid: rgba(accent, 0.2),
      platInner: rgba(accent, 0.32),
      platRing: rgba(accent, 0.5),
      platTick: rgba(accent, 0.4),
      contact: rgba(accent, 0.32),
      contactCore: rgba(mixHex(cyan, "#ffffff", 0.55), 0.55),
    };

    G = {
      hair: g.createLinearGradient(0, -1020, 0, -300),
      hairDeep: g.createLinearGradient(0, -1020, 0, -330),
      dress: g.createLinearGradient(0, -860, 0, -6),
    };
    // 发（亮部）：银白（根）→ 淡紫（中）→ 青（梢）
    G.hair.addColorStop(0, rgba(mixHex("#faf7ff", cyan, 0.08), 0.98));
    G.hair.addColorStop(0.34, rgba(mixHex("#d8ccff", violet, 0.32), 0.97));
    G.hair.addColorStop(0.66, rgba(mixHex("#aa9cf0", violet, 0.5), 0.94));
    G.hair.addColorStop(0.86, rgba(mixHex(cyan, violet, 0.45), 0.9));
    G.hair.addColorStop(1, rgba(mixHex(cyan, "#e8fdff", 0.2), 0.86));
    // 发（暗部 / 发量底）：深紫罗兰 → 紫 → 青梢。亮发束画在它上面才"分开"
    G.hairDeep.addColorStop(0, rgba(mixHex(violet, "#241a52", 0.45), 0.97));
    G.hairDeep.addColorStop(0.4, rgba(mixHex(violet, "#2e2266", 0.3), 0.97));
    G.hairDeep.addColorStop(0.72, rgba(mixHex(violet, "#3a2c80", 0.2), 0.96));
    G.hairDeep.addColorStop(0.92, rgba(mixHex(cyan, violet, 0.55), 0.9));
    G.hairDeep.addColorStop(1, rgba(mixHex(cyan, "#8ff4ff", 0.35), 0.88));
    // 礼服：深紫（上）→ 紫青（中）→ 青（下摆）
    G.dress.addColorStop(0, rgba(mixHex(violet, "#120c34", 0.5), 0.96));
    G.dress.addColorStop(0.38, rgba(mixHex(violet, "#281c66", 0.3), 0.94));
    G.dress.addColorStop(0.72, rgba(mixHex(violet, cyan, 0.55), 0.9));
    G.dress.addColorStop(0.92, rgba(mixHex(cyan, "#bff6ff", 0.25), 0.88));
    G.dress.addColorStop(1, rgba(mixHex(cyan, "#eaffff", 0.4), 0.9));
  }

  /* ---------- 跨帧平滑 ---------- */

  function updatePose(f, raw) {
    if (!Number.isFinite(P.breath)) P.breath = 0.5;
    const dt = clamp(Number(f.dt) || 0, 0, 0.1);
    const drive = driveOf(f, specOf(f.spec));

    // 姿态的"正弦待机"部分不需要平滑；需要平滑的是频谱驱动量
    P.breath = raw.breath;
    P.sway = raw.sway;
    P.headTilt = raw.headTilt;
    P.headBob = raw.headBob;
    P.hairPhase = raw.hairPhase;
    P.eyeOpen = raw.eyeOpen;
    P.blink = raw.blink;
    P.mouth = raw.mouth;
    P.glow = raw.glow;
    P.pulse = raw.pulse;

    if (f.reduced === true) {
      // 静止档：所有会动的量一次性归零，之后每帧完全一样
      state.init = true;
      state.mouth = 0;
      state.weight = 0;
      state.hairAmp = 0;
      state.pulse = 0;
      state.glow = 0;
      state.armLift = 0.5;
    } else if (!state.init || dt === 0) {
      state.init = true;
      state.mouth = raw.mouth;
      state.weight = clamp01(drive.low);
      state.hairAmp = clamp01(drive.high);
      state.pulse = raw.pulse;
      state.glow = raw.glow;
      state.armLift = raw.armLift;
    } else {
      state.mouth = smoothTo(state.mouth, raw.mouth, dt, raw.mouth > state.mouth ? TIMING.mouthAttack : TIMING.mouthRelease);
      state.weight = smoothTo(state.weight, clamp01(drive.low), dt, 6);
      state.hairAmp = smoothTo(state.hairAmp, clamp01(drive.high), dt, 4);
      // 节拍脉冲：起音立刻到位，释放按 3.2/s 衰减（比能量更"脆"）
      state.pulse = Math.max(clamp01(raw.pulse), state.pulse - dt * 3.2);
      state.glow = smoothTo(state.glow, raw.glow, dt, 8);
      state.armLift = smoothTo(state.armLift, raw.armLift, dt, 5);
    }

    if (f.reduced === true) {
      P.mouth = 0;
      P.weight = 0;
      P.hairAmp = 0;
      P.pulse = 0;
      P.glow = 0.3;
      P.armLift = 0.5;
    } else {
      P.mouth = state.mouth;
      P.weight = state.weight;
      P.hairAmp = state.hairAmp;
      P.pulse = state.pulse;
      P.glow = state.glow;
      P.armLift = state.armLift;
    }
    P.energy = clamp01(finite(f.energy, drive.energy));
  }

  /* ---------- 一帧 ---------- */

  function draw(g, f) {
    if (destroyed || !g || !f) return;
    const layout = f.layout;
    if (!layout || typeof layout !== "object") return;
    const divaH = finite(layout.divaH, 0);
    if (!(divaH > 0)) return;

    const cx = finite(layout.cx, 0);
    const baseY = finite(layout.baseY, 0);
    const raw = computePose(f);
    if (blinkSeed !== BLINK_SEED && f.reduced !== true) {
      const b = blinkAt(finite(f.now, 0), blinkSeed);
      raw.blink = b;
      raw.eyeOpen = clamp01(1 - b);
    }
    updatePose(f, raw);
    ensureLook(g, f.palette);

    const t = finite(f.t, 0);
    const K = {
      g,
      f,
      t,
      C,
      G,
      P,
      perf: f.reduced !== true && f.perf === true,
      tiny: f.tiny === true,
      wave: {
        phase: P.hairPhase,
        amp: 2.2 + P.hairAmp * 7 + P.weight * 1.6,
        hem: 2 + P.weight * 4 + P.pulse * 2.5,
      },
      sway: [P.sway + P.weight * 0.5],
    };
    // 裙摆波浪的三个采样（左 / 中 / 右），确定性来自 hairPhase
    const wp = K.wave.phase * 0.82;
    K.hemWave = [
      Math.sin(wp) * K.wave.hem,
      Math.sin(wp + 1.25) * K.wave.hem * 0.8,
      Math.sin(wp + 2.4) * K.wave.hem,
    ];

    g.save();
    g.translate(cx, baseY);
    const s = divaH / DIVA_UNIT;
    g.scale(s, s);

    // 光台不跟着人物转（脚是"踩"在上面的）
    drawPlatform(K);

    // 人物整体：脚底为轴的轻微摆动 + 低频重心起伏
    g.save();
    g.translate(0, P.weight * 7);
    g.rotate(K.sway[0] * DEG);

    drawBackHair(K);
    drawSkirtBack(K);
    drawLegs(K);
    drawSkirtFront(K);
    drawTorso(K);
    drawChestStrands(K);
    drawArms(K);
    drawNeck(K);
    drawHead(K);

    // 麦克风压在脸/颈前，握麦的手指压在麦克风前（有"抓住"的前后关系）
    drawMic(K);
    drawGrip(K);
    g.restore();

    drawHolo(K);

    g.restore();
  }

  function destroy() {
    destroyed = true;
    state.init = false;
    lookKey = "";
    lookCtx = null;
    C = null;
    G = null;
  }

  return { draw, destroy };
}

/* ==========================================================================
   以下全部是"画"的部分。每个函数只接收 K（一次 draw 的上下文包），
   不读模块级可变状态 —— 两个实例同时画也不会互相串色。
   ========================================================================== */

function fillShape(K, build, paint) {
  const g = K.g;
  g.beginPath();
  build(g);
  g.fillStyle = paint;
  g.fill();
}

function strokeShape(K, build, paint, width) {
  const g = K.g;
  g.beginPath();
  build(g);
  g.strokeStyle = paint;
  g.lineWidth = width;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.stroke();
}

function line(K, x0, y0, x1, y1) {
  const g = K.g;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

function ellipseFill(K, cx, cy, rx, ry, paint, rot = 0) {
  const g = K.g;
  g.beginPath();
  g.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  g.fillStyle = paint;
  g.fill();
}

function ellipseStroke(K, cx, cy, rx, ry, paint, width, rot = 0) {
  const g = K.g;
  g.beginPath();
  g.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  g.strokeStyle = paint;
  g.lineWidth = width;
  g.stroke();
}

/** 四芒星宝石：一个填充 + 一个高光点 */
function gem(K, x, y, r, C) {
  fillShape(
    K,
    (p) => {
      p.moveTo(x, y - r * 2.2);
      p.lineTo(x + r * 0.7, y);
      p.lineTo(x, y + r * 2.2);
      p.lineTo(x - r * 0.7, y);
      p.closePath();
    },
    C.gem
  );
  ellipseFill(K, x, y, r * 0.34, r * 0.34, C.rimCyan);
}

/* --------------------------------------------------------------------------
   ① 光台 + 接触光：脚下全息光盘，人物是"踩"在光上的
   -------------------------------------------------------------------------- */
function drawPlatform(K) {
  const C = K.C;
  const P = K.P;
  const g = K.g;
  const grow = 1 + P.pulse * 0.04;
  const rx = 178 * grow;
  const ry = 30 * grow;

  ellipseFill(K, 0, 0, rx, ry, C.platOuter);
  ellipseFill(K, 0, -2, 124 * grow, 22 * grow, C.platMid);
  ellipseFill(K, 0, -3, 64 * grow, 12 * grow, C.platInner);
  ellipseStroke(K, 0, 0, rx, ry, C.platRing, 1.6);
  ellipseStroke(K, 0, -2, 122 * grow, 21 * grow, C.platTick, 1);

  // 接触光：脚底最亮的一小圈，让人物与地面"焊"在一起
  ellipseFill(K, 0, 2, 96, 15, C.contact);
  ellipseFill(K, 0, 0, 54, 9, C.contactCore);

  // 环上的刻度：只有前半圈朝向观众，像舞台定位灯
  const n = K.perf ? 4 : 10;
  g.beginPath();
  for (let i = 0; i < n; i += 1) {
    const a = Math.PI * (0.14 + (i / Math.max(1, n - 1)) * 0.72);
    const c = Math.cos(a);
    const sn = Math.sin(a);
    g.moveTo(c * (rx + 4), sn * (ry + 4));
    g.lineTo(c * (rx + 14), sn * (ry + 8));
  }
  g.strokeStyle = C.platTick;
  g.lineWidth = 2;
  g.lineCap = "round";
  g.stroke();
}

/* --------------------------------------------------------------------------
   ② 背后长发：底色轮廓 + 9 缕独立发束（锥形收尖、彼此有缝）+ 逐缕高光
   -------------------------------------------------------------------------- */
function drawBackHair(K) {
  const C = K.C;
  const g = K.g;
  const phase = K.wave.phase;
  const amp = K.wave.amp;

  // 发量底：深紫罗兰（不是一整片亮色）—— 亮发束画在它上面，才读得出"一缕一缕"
  fillShape(K, backHairPath, K.G.hairDeep);

  // 内侧阴影：两肩之间一条窄带，给后发"体积"
  fillShape(
    K,
    (p) => {
      p.moveTo(-34, -956);
      p.bezierCurveTo(-46, -844, -42, -720, -32, -610);
      p.quadraticCurveTo(0, -570, 32, -610);
      p.bezierCurveTo(42, -720, 46, -844, 34, -956);
      p.quadraticCurveTo(0, -938, -34, -956);
      p.closePath();
    },
    C.hairBackDeep
  );

  // —— 9 缕独立长发（性能档 5 缕）：亮银白 / 淡紫 / 中紫交替，发梢戳出底色 ——
  const n = K.perf ? 5 : 9;
  for (let i = 0; i < n; i += 1) {
    const k = n === 1 ? 0 : i / (n - 1);
    const spread = k * 2 - 1; // -1..1
    const swing = Math.sin(phase + i * 1.15) * amp * (0.5 + 0.9 * Math.abs(spread));
    const rootX = spread * 44;
    const tipX = spread * 116 + swing;
    const tipY = -356 - ((i * 7) % 3) * 26 - Math.abs(spread) * 8;
    const w = 18 + (1 - Math.abs(spread)) * 10;
    const paint = i % 3 === 0 ? C.hairLight : i % 3 === 1 ? C.hairRoot : C.hairMid;
    const strand = (p) => hairStrandPath(p, rootX, -956, tipX, tipY, w);
    fillShape(K, strand, paint);
    // 深色描边：发束之间才有"缝"，而不是一整块布
    strokeShape(K, strand, C.hairShadow, 1.2);

    // 每缕一条更亮的发丝高光（顺着头发的走向）
    g.beginPath();
    g.moveTo(rootX + (tipX - rootX) * 0.08, -946);
    g.bezierCurveTo(rootX + (tipX - rootX) * 0.1, -820, tipX - (tipX - rootX) * 0.12, tipY + 150, tipX + 1.5, tipY + 6);
    g.strokeStyle = C.hairStrand;
    g.lineWidth = 1.8;
    g.lineCap = "round";
    g.stroke();
  }

  // 发梢的青光：只挑 4 束点一下，避免每束都亮成一样
  const tips = K.perf ? 2 : 4;
  for (let i = 0; i < tips; i += 1) {
    const k = tips === 1 ? 0 : i / (tips - 1);
    const spread = k * 2 - 1;
    const tipX = spread * 116 + Math.sin(phase + i * 1.9) * amp * 0.6;
    const tipY = -356 - ((i * 7) % 3) * 26;
    g.beginPath();
    g.moveTo(tipX - 2, tipY + 48);
    g.quadraticCurveTo(tipX + 1, tipY + 22, tipX, tipY + 2);
    g.strokeStyle = C.hairTip;
    g.lineWidth = 2.8;
    g.lineCap = "round";
    g.stroke();
  }

  // 后发外缘的发光边：只描"肩以上"那一段（左青右紫），
  // 下段留给发束自己的明暗 —— 否则一整条弧会把头发读成"面纱"。
  strokeShape(
    K,
    (p) => {
      p.moveTo(-98, -780);
      p.bezierCurveTo(-94, -860, -82, -940, -48, -978);
    },
    C.rimCyan,
    1.6
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(98, -780);
      p.bezierCurveTo(94, -860, 82, -940, 48, -978);
    },
    C.rimViolet,
    1.6
  );
}

/* --------------------------------------------------------------------------
   ③ 裙摆后层：深紫外裙 + 中景膜 + 外扩褶皱
   -------------------------------------------------------------------------- */
function drawSkirtBack(K) {
  const C = K.C;
  const g = K.g;
  const hem = K.hemWave;

  // 最外层：深紫底 + 紫→青渐变
  fillShape(K, (p) => skirtBackPath(p, hem), C.dressDeep);
  fillShape(K, (p) => skirtBackPath(p, hem), K.G.dress);

  // 外扩褶皱：从腰到摆的三道弧
  for (let i = 0; i < 3; i += 1) {
    const s = i === 1 ? 1 : -1;
    const x0 = s * (20 + i * 12);
    const x1 = s * (96 + i * 46);
    g.beginPath();
    g.moveTo(x0, -630);
    g.bezierCurveTo(x0 + s * 24, -430, x1 - s * 16, -180, x1, SK.hemY + 4);
    g.strokeStyle = C.seamFaint;
    g.lineWidth = 1.5;
    g.lineCap = "round";
    g.stroke();
  }

  // 中景膜层：比最外层窄一圈，能看见两层裙摆的边缘
  fillShape(K, (p) => skirtLayerPath(p, 54, 192, -640, SK.hemY - 2, hem), C.dressFilm2);
  strokeShape(K, (p) => skirtLayerPath(p, 54, 192, -640, SK.hemY - 2, hem), C.seamSoft, 1.6);
}

/* --------------------------------------------------------------------------
   ④ 腿 / 脚：透过半透明裙料隐约可见，脚踝以下是全息短靴
   -------------------------------------------------------------------------- */
function drawLegs(K) {
  const C = K.C;

  fillShape(K, (g) => legPath(g, -SK.legX), C.skinGhost);
  fillShape(K, (g) => legPath(g, SK.legX), C.skinGhost);

  // 膝盖内侧的一点冷调高光，避免两条腿糊成一根柱子
  strokeShape(
    K,
    (g) => {
      g.moveTo(-SK.legX + 6, -336);
      g.quadraticCurveTo(-SK.legX + 2, -304, -SK.legX + 4, -272);
    },
    C.skinSoft,
    3
  );
  strokeShape(
    K,
    (g) => {
      g.moveTo(SK.legX + 6, -336);
      g.quadraticCurveTo(SK.legX + 2, -304, SK.legX + 4, -272);
    },
    C.skinSoft,
    3
  );

  // 全息短靴：踩在光台上，鞋底一条青色光边
  for (const s of [-1, 1]) {
    const cx = s * (SK.legX + 10);
    ellipseFill(K, cx, -15, 34, 15, C.metal, s * -0.14);
    ellipseFill(K, cx + s * 10, -22, 16, 8, C.cupGlow, s * -0.14);
    strokeShape(
      K,
      (p) => {
        p.moveTo(cx - 30, -8);
        p.quadraticCurveTo(cx, -2, cx + 30, -8);
      },
      C.metalEdge,
      2
    );
  }
}

/* --------------------------------------------------------------------------
   ⑤ 裙摆前层：主裙 + 膜 + 开衩 + 竖向发光缝线 + 下摆渐变亮边
   -------------------------------------------------------------------------- */
function drawSkirtFront(K) {
  const C = K.C;
  const g = K.g;
  const P = K.P;
  const hem = K.hemWave;

  // 主裙：紫→青渐变，再叠一层更实的紫，保证不是"一片青"
  fillShape(K, (p) => skirtFrontPath(p, hem), K.G.dress);
  fillShape(K, (p) => skirtFrontPath(p, hem), C.dressFilm);
  fillShape(K, (p) => skirtLayerPath(p, 40, 138, -620, SK.hemY - 10, hem), C.dressFilm2);

  // 三层裙摆的分界：横向弧形阴影 + 亮边，读得出"一层压一层"
  for (const [ty, w] of [
    [-436, 132],
    [-256, 154],
  ]) {
    strokeShape(
      K,
      (p) => {
        p.moveTo(-w * 0.96, ty - 26);
        p.quadraticCurveTo(0, ty + 12, w * 0.96, ty - 26);
      },
      C.dressDeep,
      2.6
    );
    strokeShape(
      K,
      (p) => {
        p.moveTo(-w * 0.9, ty - 16);
        p.quadraticCurveTo(0, ty + 22, w * 0.9, ty - 16);
      },
      C.seamFaint,
      1.2
    );
  }

  // 两侧轮廓：暗紫压边 + 外侧的亮边，让裙摆有柱状体积而不是平涂
  strokeShape(
    K,
    (p) => {
      p.moveTo(-46, -628);
      p.bezierCurveTo(-96, -500, -140, -260, -166, SK.hemY);
    },
    C.dressDeep,
    2.4
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(46, -628);
      p.bezierCurveTo(96, -500, 140, -260, 166, SK.hemY);
    },
    C.dressDeep,
    2.4
  );

  // 右侧开衩：一道深色开口 + 两侧发光边（裙摆不再是一个封闭的圆锥）
  fillShape(
    K,
    (p) => {
      p.moveTo(20, -250);
      p.quadraticCurveTo(34, -130, 44, SK.hemY - 4);
      p.quadraticCurveTo(56, -130, 40, -252);
      p.closePath();
    },
    C.skinDeep
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(20, -250);
      p.quadraticCurveTo(34, -130, 44, SK.hemY - 4);
    },
    C.seamSoft,
    1.4
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(40, -252);
      p.quadraticCurveTo(56, -130, 44, SK.hemY - 4);
    },
    C.seamFaint,
    1.2
  );

  // 竖向发光缝线：7 道，顺着裙摆波浪摆（确定性）
  const pleats = K.perf ? 4 : 7;
  for (let i = 0; i < pleats; i += 1) {
    const k = (i + 0.5) / pleats;
    const x0 = -38 + k * 76;
    const x1 = -140 + k * 280;
    const sway = Math.sin(K.wave.phase * 0.82 + i * 1.07) * (1.6 + P.weight * 2.2);
    g.beginPath();
    g.moveTo(x0 * 0.7, -624);
    g.bezierCurveTo(x0 * 1.5 + sway, -430, x1 * 0.92 + sway, -170, x1 + sway, SK.hemY + 2);
    g.strokeStyle = i % 2 === 0 ? C.seamSoft : C.seamFaint;
    g.lineWidth = i % 2 === 0 ? 1.8 : 1.2;
    g.lineCap = "round";
    g.stroke();
  }

  // 下摆：青色主边 + 内侧一道紫边，是全幅画里最"全息"的两条线
  strokeShape(K, (p) => skirtFrontPath(p, hem), C.seam, 2.2);
  strokeShape(K, (p) => skirtLayerPath(p, 44, 158, -628, SK.hemY - 7, hem), C.rimViolet, 1.4);

  // 腰线
  strokeShape(
    K,
    (p) => {
      p.moveTo(-46, -632);
      p.quadraticCurveTo(0, -623, 46, -632);
    },
    C.seamSoft,
    1.5
  );
}

/* --------------------------------------------------------------------------
   ⑥ 躯干：心形领口胸衣 + 腰封 + 星辉胸针 + 全息肩带
   -------------------------------------------------------------------------- */
function drawTorso(K) {
  const C = K.C;
  const g = K.g;
  const b = K.P.breath - 0.5; // -0.5..0.5
  const sy = SK.shoulderY - b * 4;

  // 胸衣：紫→青渐变 + 青紫膜
  fillShape(K, (p) => bodicePath(p, b), K.G.dress);
  fillShape(K, (p) => bodicePath(p, b), C.dressFilm2);

  // 左侧受光：肩到腰一道冷白高光（光从左上打来）
  strokeShape(
    K,
    (p) => {
      p.moveTo(-84, sy + 12);
      p.quadraticCurveTo(-70, -740, -58, SK.waistY - 4);
    },
    C.dressLight,
    5
  );

  // 胸廓受光弧（呼吸时跟着肩线一起抬）
  strokeShape(
    K,
    (p) => {
      p.moveTo(-62, sy + 30);
      p.quadraticCurveTo(-38, sy + 20, -14, sy + 34);
    },
    C.dressLight,
    4
  );
  // 胸下两道阴影：把胸衣从"一块布"变成"有结构"
  strokeShape(
    K,
    (p) => {
      p.moveTo(-58, -736);
      p.quadraticCurveTo(-30, -726, -8, -734);
    },
    C.dressDeep,
    3
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(58, -736);
      p.quadraticCurveTo(30, -726, 8, -734);
    },
    C.dressDeep,
    3
  );

  // 心形领口的青色缝线
  strokeShape(K, (p) => bodicePath(p, b), C.seam, 1.8);

  // 肩上的全息光带：从领口斜上肩，两条发光细带
  for (const s of [-1, 1]) {
    strokeShape(
      K,
      (p) => {
        p.moveTo(s * 34, sy + 30);
        p.quadraticCurveTo(s * 64, sy + 18, s * 84, sy + 2);
      },
      C.seamSoft,
      1.6
    );
  }

  // 侧缝
  strokeShape(
    K,
    (p) => {
      p.moveTo(-78, sy + 44);
      p.bezierCurveTo(-70, -712, -62, -678, -SK.waistX, SK.waistY - 4);
    },
    C.seamFaint,
    1.3
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(78, sy + 44);
      p.bezierCurveTo(70, -712, 62, -678, SK.waistX, SK.waistY - 4);
    },
    C.seamFaint,
    1.3
  );

  // 腰封 + 两条亮边
  fillShape(K, waistBandPath, C.dressDeep);
  strokeShape(K, waistBandPath, C.seam, 1.5);
  strokeShape(
    K,
    (p) => {
      p.moveTo(-56, SK.waistY - 12);
      p.quadraticCurveTo(0, SK.waistY - 5, 56, SK.waistY - 12);
    },
    C.seamSoft,
    1.2
  );

  // 胸针（领口）+ 腰封宝石
  gem(K, 0, sy + 34, 4.4 + K.P.pulse * 1.4, C);
  gem(K, 0, SK.waistY - 8, 3.2 + K.P.pulse * 1.0, C);
}

/* --------------------------------------------------------------------------
   胸前两缕发丝：压在后发之上、手臂之前，制造前后层次
   -------------------------------------------------------------------------- */
function drawChestStrands(K) {
  const C = K.C;
  const g = K.g;
  const swing = Math.sin(K.wave.phase + 0.7) * K.wave.amp * 0.6;

  for (const side of [-1, 1]) {
    // 一缕亮发 + 一道暗边 + 一道高光：细而清楚，不像两条"背带"
    g.beginPath();
    g.moveTo(side * 66, -872);
    g.bezierCurveTo(side * (76 + swing), -820, side * (74 + swing * 1.3), -758, side * (66 + swing), -726);
    g.strokeStyle = C.hairMid;
    g.lineWidth = 3.4;
    g.lineCap = "round";
    g.stroke();

    g.beginPath();
    g.moveTo(side * 68, -870);
    g.bezierCurveTo(side * (78 + swing), -818, side * (76 + swing * 1.3), -760, side * (68 + swing), -728);
    g.strokeStyle = C.hairShadow;
    g.lineWidth = 1.1;
    g.lineCap = "round";
    g.stroke();

    g.beginPath();
    g.moveTo(side * 64, -864);
    g.bezierCurveTo(side * (71 + swing), -816, side * (69 + swing * 1.2), -770, side * (63 + swing), -738);
    g.strokeStyle = C.hairStrandDim;
    g.lineWidth = 1.2;
    g.lineCap = "round";
    g.stroke();
  }
}

/* --------------------------------------------------------------------------
   ⑦ 手臂：举麦臂（画面左）/ 垂摆臂（画面右）+ 发光臂环 + 腕环
   -------------------------------------------------------------------------- */
function drawArms(K) {
  const C = K.C;
  const g = K.g;
  const lift = K.P.armLift - 0.5; // -0.5..0.5

  // —— 举麦的手臂（画面左侧，角色的右手）——
  fillShape(
    K,
    (p) => {
      p.moveTo(-86, -810);
      p.bezierCurveTo(-101, -804, -114, -762, -120, -728);
      p.quadraticCurveTo(-122, -714, -114, -708);
      p.bezierCurveTo(-104, -704, -98, -708, -96, -716);
      p.bezierCurveTo(-90, -754, -78, -788, -70, -802);
      p.closePath();
    },
    C.skin
  );
  fillShape(
    K,
    (p) => {
      p.moveTo(-116, -710);
      p.bezierCurveTo(-110, -752, -100, -804, -80, -844);
      p.quadraticCurveTo(-74, -852, -64, -846);
      p.bezierCurveTo(-74, -808, -88, -760, -102, -710);
      p.closePath();
    },
    C.skin
  );
  // 手臂内侧阴影 + 外侧青色轮廓光
  strokeShape(
    K,
    (p) => {
      p.moveTo(-100, -716);
      p.bezierCurveTo(-92, -756, -82, -792, -76, -828);
    },
    C.skinShade,
    2
  );
  // 肘窝的折痕：手臂才不是一根管子
  strokeShape(
    K,
    (p) => {
      p.moveTo(-113, -714);
      p.quadraticCurveTo(-106, -706, -97, -714);
    },
    C.skinShade,
    1.6
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(-120, -726);
      p.bezierCurveTo(-112, -762, -100, -800, -84, -834);
    },
    C.rimCyan,
    1.6
  );
  // 全息臂环（两道）
  strokeShape(
    K,
    (p) => {
      p.moveTo(-108, -784);
      p.quadraticCurveTo(-99, -788, -90, -782);
    },
    C.seamSoft,
    2.4
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(-106, -774);
      p.quadraticCurveTo(-97, -778, -89, -772);
    },
    C.seamFaint,
    1.4
  );
  // 腕环
  strokeShape(
    K,
    (p) => {
      p.moveTo(-78, -848);
      p.quadraticCurveTo(-70, -846, -63, -840);
    },
    C.metalEdge,
    2.2
  );

  // —— 垂摆的手臂（画面右侧，角色的左手）——
  fillShape(
    K,
    (p) => {
      p.moveTo(86, -810);
      p.bezierCurveTo(102, -804, 114, -772, 118, -740);
      p.quadraticCurveTo(120, -722, 114, -714);
      p.bezierCurveTo(106, -708, 100, -712, 98, -720);
      p.bezierCurveTo(94, -756, 84, -786, 72, -802);
      p.closePath();
    },
    C.skin
  );
  fillShape(
    K,
    (p) => {
      p.moveTo(114, -716);
      p.bezierCurveTo(120, -688, 126, -650, 129, -618);
      p.quadraticCurveTo(131, -604, 122, -600);
      p.bezierCurveTo(114, -622, 110, -664, 104, -708);
      p.closePath();
    },
    C.skin
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(100, -716);
      p.bezierCurveTo(108, -680, 114, -644, 118, -610);
    },
    C.skinShade,
    2
  );
  // 肘窝折痕
  strokeShape(
    K,
    (p) => {
      p.moveTo(111, -714);
      p.quadraticCurveTo(117, -706, 125, -712);
    },
    C.skinShade,
    1.6
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(118, -744);
      p.bezierCurveTo(122, -710, 126, -664, 128, -620);
    },
    C.rimViolet,
    1.6
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(108, -790);
      p.quadraticCurveTo(115, -786, 121, -780);
    },
    C.seamSoft,
    2.2
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(110, -780);
      p.quadraticCurveTo(117, -776, 122, -770);
    },
    C.seamFaint,
    1.4
  );

  // 垂下那只手：手掌 + 两根手指的暗示
  const hx = 126 + lift * 4;
  const hy = -592 - lift * 6;
  ellipseFill(K, hx, hy, 12, 17, C.skin, 0.18);
  // 指缝三道 + 拇指一道：手要读成"手"，不是一坨
  for (let i = 0; i < 3; i += 1) {
    strokeShape(
      K,
      (p) => {
        p.moveTo(hx - 7, hy - 6 + i * 6);
        p.quadraticCurveTo(hx, hy - 2 + i * 6, hx + 7, hy - 6 + i * 6);
      },
      C.skinShade,
      1.2
    );
  }
  strokeShape(
    K,
    (p) => {
      p.moveTo(hx + 5, hy + 8);
      p.quadraticCurveTo(hx + 10, hy + 4, hx + 9, hy - 3);
    },
    C.skinShade,
    1.4
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(114, -614);
      p.quadraticCurveTo(122, -610, 128, -616);
    },
    C.metalEdge,
    2
  );
}

/* --------------------------------------------------------------------------
   ⑧ 颈部：下颌投影 + 锁骨 + 肩头高光（让头不"浮"在身体上）
   -------------------------------------------------------------------------- */
function drawNeck(K) {
  const C = K.C;
  const g = K.g;

  fillShape(
    K,
    (p) => {
      p.moveTo(-29, -882);
      p.bezierCurveTo(-26, -862, -25, -838, -24, -820);
      p.quadraticCurveTo(-32, -810, -48, -804);
      p.lineTo(48, -804);
      p.quadraticCurveTo(32, -810, 24, -820);
      p.bezierCurveTo(25, -838, 26, -862, 29, -882);
      p.closePath();
    },
    C.skin
  );

  // 下颌投影
  strokeShape(
    K,
    (p) => {
      p.moveTo(-24, -874);
      p.quadraticCurveTo(0, -862, 24, -874);
    },
    C.skinShade,
    5
  );
  // 颈部两侧的暗面：鼻梁阴影的一贯方向
  strokeShape(
    K,
    (p) => {
      p.moveTo(24, -876);
      p.quadraticCurveTo(27, -848, 26, -824);
    },
    C.skinShade,
    2.2
  );

  // 锁骨：两条很轻的弧 + 肩头受光
  strokeShape(
    K,
    (p) => {
      p.moveTo(-36, -808);
      p.quadraticCurveTo(-18, -800, -4, -806);
    },
    C.skinLine,
    1.4
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(36, -808);
      p.quadraticCurveTo(18, -800, 4, -806);
    },
    C.skinLine,
    1.4
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(-88, -812);
      p.quadraticCurveTo(-76, -818, -64, -814);
    },
    C.skinSoft,
    4
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(88, -812);
      p.quadraticCurveTo(76, -818, 64, -814);
    },
    C.skinSoft,
    3
  );
}

/* --------------------------------------------------------------------------
   ⑨⑩⑪ 头部：脸 / 刘海 / 侧发 / 五官 / 耳机（整组跟着头倾与浮动）
   -------------------------------------------------------------------------- */
function drawHead(K) {
  const g = K.g;
  const P = K.P;
  g.save();
  g.translate(0, P.headBob);
  g.translate(0, SK.headPivotY);
  g.rotate(P.headTilt * DEG - P.sway * 0.35 * DEG);
  g.translate(0, -SK.headPivotY);

  drawFaceBase(K);
  drawBangs(K);
  drawSideLocks(K);
  drawFeatureEyes(K);
  drawFeatureBrows(K);
  drawFeatureNoseMouth(K);
  drawHeadset(K);

  g.restore();
}

function drawFaceBase(K) {
  const C = K.C;

  fillShape(K, facePath, C.skin);

  // 刘海投在额头上的阴影：把脸从"一块白"压出层次（两层：大面积淡 + 发际线深）
  fillShape(
    K,
    (p) => {
      p.moveTo(-52, -982);
      p.quadraticCurveTo(0, -970, 52, -982);
      p.quadraticCurveTo(50, -950, 44, -934);
      p.quadraticCurveTo(0, -926, -44, -934);
      p.quadraticCurveTo(-50, -950, -52, -982);
      p.closePath();
    },
    C.eyeShadow
  );
  fillShape(
    K,
    (p) => {
      p.moveTo(-50, -968);
      p.quadraticCurveTo(0, -958, 50, -968);
      p.quadraticCurveTo(46, -946, 38, -936);
      p.quadraticCurveTo(0, -930, -38, -936);
      p.quadraticCurveTo(-46, -946, -50, -968);
      p.closePath();
    },
    C.hairline
  );

  // 受光在左上：右下颊与下颌压一层冷紫
  fillShape(
    K,
    (p) => {
      p.moveTo(15, -962);
      p.bezierCurveTo(40, -950, 50, -922, 46, -894);
      p.bezierCurveTo(42, -872, 24, -860, 4, -856);
      p.bezierCurveTo(24, -870, 35, -886, 37, -906);
      p.bezierCurveTo(41, -932, 31, -952, 15, -962);
      p.closePath();
    },
    C.skinShade
  );

  // 左颊受光 + 鼻梁高光 + 下巴高光
  strokeShape(
    K,
    (p) => {
      p.moveTo(-40, -918);
      p.quadraticCurveTo(-30, -900, -18, -892);
    },
    C.skinSoft,
    5
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(-20, -980);
      p.quadraticCurveTo(-10, -950, -4, -922);
    },
    C.skinSoft,
    2.4
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(-9, -866);
      p.quadraticCurveTo(0, -859, 9, -866);
    },
    C.skinSoft,
    2.2
  );
  // 脸缘一圈极细的描边，把脸和头发分开
  strokeShape(K, facePath, C.skinLine, 0.8);
}

function drawBangs(K) {
  const C = K.C;
  const g = K.g;

  // 头顶发帽：中紫底（和冷白脸拉开对比），给刘海一个"根"
  const cap = (p) => {
    p.moveTo(-56, -946);
    p.bezierCurveTo(-62, -988, -28, -1012, 0, -1012);
    p.bezierCurveTo(28, -1012, 62, -988, 56, -946);
    p.quadraticCurveTo(0, -930, -56, -946);
    p.closePath();
  };
  fillShape(K, cap, C.hairMid);
  strokeShape(K, cap, C.hairShadow, 1.2);

  // 7 片分开的碎刘海：每片是独立的尖，覆盖额头但露出眼睛
  const locks = [
    [-50, -58, -940, 16],
    [-38, -45, -954, 18],
    [-22, -28, -948, 18],
    [-6, -10, -956, 17],
    [10, 16, -948, 18],
    [26, 33, -954, 18],
    [42, 51, -940, 15],
  ];
  for (let i = 0; i < locks.length; i += 1) {
    const [x0, x1, tipY, w] = locks[i];
    const lock = (p) => bangLockPath(p, x0, -1008, x1, tipY, w);
    const paint = i % 2 === 0 ? C.hairRoot : C.hairLight;
    fillShape(K, lock, paint);
    if (!K.perf) {
      // 每片自己的暗边：发片之间才有"缝"，而不是一整块白布
      strokeShape(K, lock, C.hairShadow, 1.2);
      // 每片一条亮高光
      g.beginPath();
      g.moveTo(x0 * 0.8 + 4, -992);
      g.quadraticCurveTo((x0 + x1) / 2 + 4, (tipY - 992) * 0.5, x1 + 2, tipY + 12);
      g.strokeStyle = C.hairStrand;
      g.lineWidth = 1.3;
      g.lineCap = "round";
      g.stroke();
    }
  }

  // 中分线与三组挑染高光
  strokeShape(
    K,
    (p) => {
      p.moveTo(-1, -1010);
      p.quadraticCurveTo(-5, -986, -4, -962);
    },
    C.hairStrandDim,
    1.6
  );
  const glints = [
    [-42, -988, -36, -954],
    [0, -1000, 10, -958],
    [34, -986, 30, -950],
  ];
  for (const [x0, y0, x1, y1] of glints) {
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo((x0 + x1) / 2 - 4, (y0 + y1) / 2, x1, y1);
    g.strokeStyle = C.hairStrand;
    g.lineWidth = 2;
    g.lineCap = "round";
    g.stroke();
  }
}

function drawSideLocks(K) {
  const C = K.C;
  const g = K.g;
  const swing = Math.sin(K.wave.phase + 0.4) * K.wave.amp * 0.5;

  for (const side of [-1, 1]) {
    g.save();
    g.translate(swing * side, 0);
    const lock = (p) => sideLockPath(p, side);
    fillShape(K, lock, C.hairRoot);
    if (!K.perf) strokeShape(K, lock, C.hairShadow, 1.3);
    // 侧发内的明暗两条：亮银高光 + 发梢的青，让发束有圆柱感
    strokeShape(
      K,
      (p) => {
        p.moveTo(side * 38, -940);
        p.bezierCurveTo(side * 48, -890, side * 49, -830, side * 45, -780);
      },
      C.hairStrand,
      1.8
    );
    strokeShape(
      K,
      (p) => {
        p.moveTo(side * 34, -918);
        p.bezierCurveTo(side * 41, -870, side * 42, -820, side * 40, -770);
      },
      C.hairTip,
      1.4
    );
    // 贴着脸的那道暗边：把脸和侧发分开
    strokeShape(
      K,
      (p) => {
        p.moveTo(side * 31, -952);
        p.bezierCurveTo(side * 35, -900, side * 35, -850, side * 33, -800);
      },
      C.hairShadow,
      1.6
    );
    g.restore();
  }
}

function drawFeatureEyes(K) {
  const C = K.C;
  const g = K.g;
  const open = clamp01(K.P.eyeOpen);

  for (const side of [-1, 1]) {
    const cx = side * EYE.cx;
    const cy = SK.eyeY;
    const iX = cx - side * EYE.innerW;
    const oX = cx + side * EYE.halfW;
    const up = EYE.up * open + 0.5;
    const lo = EYE.lo * open + 0.4;

    // 眼窝淡影：让眼白在冷白脸上"跳"出来
    if (open > 0.25) {
      ellipseFill(K, cx, cy + 1, 18, 11.5, C.eyeShadow);
    }

    // 眼白
    if (open > 0.12) {
      g.beginPath();
      g.moveTo(iX, cy + 1);
      g.quadraticCurveTo(cx - side * 2, cy - up, oX, cy - 0.4);
      g.quadraticCurveTo(cx + side * 2, cy + lo, iX, cy + 1);
      g.closePath();
      g.fillStyle = C.eyeWhite;
      g.fill();

      // 虹膜（外青 / 内深紫）→ 瞳孔 → 发光环 → 两点高光
      const irisR = 9.8;
      ellipseFill(K, cx - side * 1.2, cy + 0.4, irisR * 0.84, irisR * 0.98 * open + 0.5, C.iris);
      ellipseFill(K, cx - side * 1.2, cy + 2.2 * open, irisR * 0.58, irisR * 0.62 * open + 0.4, C.irisDeep);
      ellipseFill(K, cx - side * 1.2, cy + 0.8 * open, 3.5, 3.9 * open + 0.4, C.pupil);
      if (open > 0.32) {
        ellipseStroke(K, cx - side * 1.2, cy + 0.6, irisR * 0.86, irisR * 0.98 * open + 0.5, C.hairTip, 0.9);
      }
      ellipseFill(K, cx - side * 4.6, cy - 3.4 * open, 3.1, 3.1 * open + 0.5, C.skinSoft);
      ellipseFill(K, cx + side * 2.6, cy + 2.4 * open, 1.5, 1.5 * open + 0.3, C.eyeWhite);
    }

    // 上睫毛：眼型主线条（闭眼时它就是"合上的眼"）
    g.beginPath();
    g.moveTo(iX, cy + 1);
    g.quadraticCurveTo(cx - side * 2, cy - up, oX, cy - 0.4);
    g.strokeStyle = C.lash;
    g.lineWidth = 2.8 + 0.9 * open;
    g.lineCap = "round";
    g.stroke();

    // 外眼角上挑
    g.beginPath();
    g.moveTo(oX, cy - 0.4);
    g.quadraticCurveTo(oX + side * 3.4, cy - 2.6, oX + side * 5, cy - 5);
    g.strokeStyle = C.lash;
    g.lineWidth = 1.8;
    g.lineCap = "round";
    g.stroke();

    // 下睫毛：只在睁眼时画一小段
    if (open > 0.3) {
      g.beginPath();
      g.moveTo(cx + side * 2, cy + lo);
      g.quadraticCurveTo(oX - side * 4, cy + lo * 0.6, oX - side * 1, cy + 0.4);
      g.strokeStyle = C.lashSoft;
      g.lineWidth = 1.1;
      g.lineCap = "round";
      g.stroke();
    }

    // 双眼皮褶
    if (open > 0.3) {
      g.beginPath();
      g.moveTo(iX + side * 3, cy - up - 2.6);
      g.quadraticCurveTo(cx, cy - up - 5.6, oX - side * 1, cy - 2.4 - up * 0.4);
      g.strokeStyle = C.crease;
      g.lineWidth = 1.3;
      g.lineCap = "round";
      g.stroke();
    }
  }
}

function drawFeatureBrows(K) {
  const C = K.C;
  const g = K.g;
  const raise = K.P.mouth * 1.8 - K.P.blink * 1.2;

  for (const side of [-1, 1]) {
    const cx = side * EYE.cx;
    const y = SK.browY - raise;
    g.beginPath();
    g.moveTo(cx - side * 15, y + 3);
    g.quadraticCurveTo(cx + side * 1, y - 5.4, cx + side * 16, y - 1);
    g.strokeStyle = C.brow;
    g.lineWidth = 3.8;
    g.lineCap = "round";
    g.stroke();
    // 眉尾稍微压细一点，不要像两条黑杠
    g.beginPath();
    g.moveTo(cx + side * 8, y - 3.4);
    g.quadraticCurveTo(cx + side * 13, y - 2.4, cx + side * 17, y - 0.4);
    g.strokeStyle = C.brow;
    g.lineWidth = 1.6;
    g.lineCap = "round";
    g.stroke();
  }
}

function drawFeatureNoseMouth(K) {
  const C = K.C;
  const g = K.g;
  const m = clamp01(K.P.mouth);

  // 鼻：侧影 + 鼻尖阴影 + 鼻头一点高光
  g.beginPath();
  g.moveTo(-3.4, -924);
  g.quadraticCurveTo(-1, -908, 2.6, SK.noseY);
  g.strokeStyle = C.skinLine;
  g.lineWidth = 1.6;
  g.lineCap = "round";
  g.stroke();
  ellipseFill(K, 4.6, SK.noseY + 1.6, 2.8, 1.8, C.skinShade);
  ellipseFill(K, 0.6, SK.noseY - 2.2, 2.2, 1.4, C.skinSoft);

  // 嘴：内腔 → 齿列 → 上唇 → 下唇 → 高光 → 下唇阴影
  const my = SK.mouthY;
  const openY = m * 8;
  if (m > 0.05) {
    ellipseFill(K, 0, my + 1.4 + openY * 0.45, 8.4, 1.8 + openY * 0.62, C.mouthIn);
    if (m > 0.28) {
      strokeShape(
        K,
        (p) => {
          p.moveTo(-6, my - 0.2 + openY * 0.12);
          p.quadraticCurveTo(0, my - 2 + openY * 0.12, 6, my - 0.2 + openY * 0.12);
        },
        C.teeth,
        1.8
      );
    }
  }

  // 上唇（带唇珠）
  fillShape(
    K,
    (p) => {
      p.moveTo(-12, my);
      p.quadraticCurveTo(-6, my - 5, 0, my - 2.8);
      p.quadraticCurveTo(6, my - 5, 12, my);
      p.quadraticCurveTo(0, my - 1.4 + openY * 0.2, -12, my);
      p.closePath();
    },
    C.lip
  );

  // 下唇：随张口度下移、变厚
  fillShape(
    K,
    (p) => {
      p.moveTo(-11.5, my + 0.3);
      p.quadraticCurveTo(0, my + 6 + openY * 0.5, 11.5, my + 0.3);
      p.quadraticCurveTo(0, my + 1.8, -11.5, my + 0.3);
      p.closePath();
    },
    C.lipLight
  );

  // 唇线 + 下唇反光
  strokeShape(
    K,
    (p) => {
      p.moveTo(-12, my);
      p.quadraticCurveTo(0, my - 1.4 + openY * 0.2, 12, my);
    },
    C.lipDark,
    1.1
  );
  strokeShape(
    K,
    (p) => {
      p.moveTo(-4.8, my + 4.4 + openY * 0.3);
      p.quadraticCurveTo(0, my + 5.6 + openY * 0.3, 4.8, my + 4.4 + openY * 0.3);
    },
    C.teeth,
    1.2
  );
  ellipseFill(K, 0, my + 8.2, 5.6, 1.6, C.skinShade);

  // 腮红：两团极淡的粉 + 两道斜向的冷光
  ellipseFill(K, -36, -902, 13, 6.4, C.blush);
  ellipseFill(K, 36, -902, 13, 6.4, C.blush);
  if (!K.perf) {
    strokeShape(
      K,
      (p) => {
        p.moveTo(-42, -898);
        p.lineTo(-34, -906);
      },
      C.blush,
      1.6
    );
    strokeShape(
      K,
      (p) => {
        p.moveTo(42, -898);
        p.lineTo(34, -906);
      },
      C.blush,
      1.6
    );
  }
}

function drawHeadset(K) {
  const C = K.C;
  const g = K.g;

  // 头梁：压在刘海之上；深金属 + 青色细边
  g.beginPath();
  g.moveTo(-54, -952);
  g.bezierCurveTo(-57, -990, -26, -1016, 0, -1016);
  g.bezierCurveTo(26, -1016, 57, -990, 54, -952);
  g.strokeStyle = C.metal;
  g.lineWidth = 8;
  g.lineCap = "round";
  g.stroke();

  g.beginPath();
  g.moveTo(-52, -953);
  g.bezierCurveTo(-55, -988, -26, -1013, 0, -1013);
  g.bezierCurveTo(26, -1013, 55, -988, 52, -953);
  g.strokeStyle = C.metalEdge;
  g.lineWidth = 1.8;
  g.lineCap = "round";
  g.stroke();

  // 耳罩：深色外壳 + 发光的青色内圈 + 一个亮心
  for (const side of [-1, 1]) {
    const cx = side * 57;
    ellipseFill(K, cx, -928, 12, 20, C.metal);
    ellipseFill(K, cx, -928, 8.6, 16.4, C.cupDark);
    ellipseStroke(K, cx, -928, 8.2, 15.8, C.metalEdge, 1.6);
    ellipseFill(K, cx, -928, 4.6, 10, C.cupGlow);
    ellipseFill(K, cx, -940, 2.2, 2.2, C.rimCyan);
  }

  // 细支麦克风：从右耳罩伸向嘴角前方
  g.beginPath();
  g.moveTo(54, -916);
  g.bezierCurveTo(64, -898, 42, -882, 17, -891);
  g.strokeStyle = C.metal;
  g.lineWidth = 2.8;
  g.lineCap = "round";
  g.stroke();
  g.beginPath();
  g.moveTo(54, -916);
  g.bezierCurveTo(63, -899, 42, -884, 18, -892);
  g.strokeStyle = C.metalEdge;
  g.lineWidth = 1;
  g.lineCap = "round";
  g.stroke();
  ellipseFill(K, 14, -893, 3.8, 4.8, C.micBody, -0.35);
  ellipseFill(K, 14, -893, 1.8, 2.4, C.micEdge, -0.35);

  // 耳罩下的小吊坠：全息宝石
  for (const side of [-1, 1]) {
    const cx = side * 57;
    fillShape(
      K,
      (p) => {
        p.moveTo(cx, -904);
        p.lineTo(cx + 3.6, -896);
        p.lineTo(cx, -888);
        p.lineTo(cx - 3.6, -896);
        p.closePath();
      },
      C.hairTip
    );
  }
}

/* --------------------------------------------------------------------------
   ⑫ 手持麦克风 + 握麦的手（手指压在麦克风上，有"抓住"的前后关系）
   -------------------------------------------------------------------------- */
function drawMic(K) {
  const C = K.C;
  const g = K.g;

  // 手柄：从手心斜向嘴边
  g.beginPath();
  g.moveTo(-64, -842);
  g.lineTo(-30, -884);
  g.strokeStyle = C.micBody;
  g.lineWidth = 12;
  g.lineCap = "round";
  g.stroke();

  g.beginPath();
  g.moveTo(-62, -844);
  g.lineTo(-32, -882);
  g.strokeStyle = C.micEdge;
  g.lineWidth = 2.4;
  g.lineCap = "round";
  g.stroke();

  // 网罩：斜椭圆 + 三道格栅 + 发光环 + 顶部高光（别做成"放大镜"）
  ellipseFill(K, -25, -891, 11, 14.5, C.micBody, -0.42);
  strokeShape(
    K,
    (p) => {
      p.ellipse(-25, -891, 8.6, 11.8, -0.42, 0, TAU);
    },
    C.micGrille,
    1.4
  );
  for (let i = 0; i < 3; i += 1) {
    const oy = -6 + i * 5;
    g.beginPath();
    g.moveTo(-33, -889 + oy);
    g.lineTo(-17, -897 + oy);
    g.strokeStyle = C.micGrille;
    g.lineWidth = 1.1;
    g.lineCap = "round";
    g.stroke();
  }
  ellipseFill(K, -22, -896, 3.2, 4.2, C.rimCyan, -0.42);
}

function drawGrip(K) {
  const C = K.C;
  const g = K.g;

  // 手掌
  ellipseFill(K, -64, -842, 13, 16, C.skin, 0.42);

  // 三根手指绕过手柄
  for (let i = 0; i < 3; i += 1) {
    g.beginPath();
    g.moveTo(-72 + i * 2, -838 + i * 6);
    g.quadraticCurveTo(-64 + i * 2, -842 + i * 6, -55 + i * 2, -837 + i * 6);
    g.strokeStyle = C.skin;
    g.lineWidth = 4.6;
    g.lineCap = "round";
    g.stroke();
  }
  // 拇指
  g.beginPath();
  g.moveTo(-57, -856);
  g.quadraticCurveTo(-50, -850, -52, -839);
  g.strokeStyle = C.skin;
  g.lineWidth = 4.4;
  g.lineCap = "round";
  g.stroke();
  // 指缝阴影
  g.beginPath();
  g.moveTo(-70, -834);
  g.quadraticCurveTo(-62, -836, -56, -832);
  g.strokeStyle = C.skinShade;
  g.lineWidth = 1.2;
  g.lineCap = "round";
  g.stroke();
}

/* --------------------------------------------------------------------------
   ⑬ 全息后期：轮廓光 / 扫描线 / RGB 色散 / 节拍 glitch / 星尘
   -------------------------------------------------------------------------- */
function drawHolo(K) {
  const C = K.C;
  const g = K.g;
  const P = K.P;
  const t = K.t;
  const frozen = K.f.reduced === true;

  // 1) 极淡扫描线：clip 到人物剪影，横向细线缓慢向上流动
  g.save();
  g.beginPath();
  bodySilhouettePath(g);
  g.clip();
  const lines = K.perf ? 6 : 13;
  const scroll = frozen ? 0 : (t * 30) % 78;
  g.globalAlpha = 0.45 + P.glow * 0.45;
  g.strokeStyle = C.scan;
  g.lineWidth = 1.1;
  g.beginPath();
  for (let i = 0; i < lines; i += 1) {
    const y = -1010 + ((i * 78 + scroll) % 1010);
    g.moveTo(-200, y);
    g.lineTo(200, y);
  }
  g.stroke();
  // 一条更亮的扫描带（比细线快一点）
  const sweep = frozen ? 500 : -1010 + ((t * 96) % 1010);
  g.strokeStyle = C.scanBright;
  g.lineWidth = 2.2;
  g.globalAlpha = 0.45 + P.glow * 0.5;
  g.beginPath();
  g.moveTo(-200, sweep);
  g.lineTo(200, sweep);
  g.stroke();
  g.globalAlpha = 1;
  g.restore();

  // 2) 轮廓光：左青右紫 —— 只描裙摆外轮廓（给头发整圈描边会读成"面纱"）
  strokeShape(K, (p) => skirtLayerPath(p, 58, 206, -646, SK.hemY + 2, K.hemWave), C.rimSoft, 1.4);

  // 3) 轻微 RGB 色散：只做在裙摆主轮廓上，1~2 单位错位
  g.save();
  g.translate(-2.4, 0);
  strokeShape(K, (p) => skirtFrontPath(p, K.hemWave), C.chromaWarm, 1.1);
  strokeShape(K, (p) => skirtLayerPath(p, 58, 206, -646, SK.hemY + 2, K.hemWave), C.chromaWarm, 1);
  g.restore();
  g.save();
  g.translate(2.2, 0);
  strokeShape(K, (p) => skirtFrontPath(p, K.hemWave), C.chromaCool, 1.1);
  strokeShape(K, (p) => skirtLayerPath(p, 58, 206, -646, SK.hemY + 2, K.hemWave), C.chromaCool, 1);
  g.restore();

  // 4) 节拍 glitch：只有强脉冲才出现，几道错位亮条（克制）
  if (!K.perf && P.pulse > 0.42) {
    const seed = Math.floor(t * 9) * 7 + Math.round(P.pulse * 13);
    const slices = 2 + Math.floor(rand01(seed) * 2);
    g.save();
    g.beginPath();
    bodySilhouettePath(g);
    g.clip();
    g.globalAlpha = 0.4 + P.pulse * 0.5;
    g.fillStyle = C.glitch;
    for (let i = 0; i < slices; i += 1) {
      const jy = -960 + rand01(seed + i * 31) * 880;
      const w = 60 + rand01(seed + i * 17) * 140;
      const h = 1.8 + rand01(seed + i * 11) * 3.2;
      g.fillRect(-w, jy, w * 2, h);
    }
    g.globalAlpha = 1;
    g.restore();
    // 一次很轻的外轮廓抖动
    const dx = (rand01(seed + 97) - 0.5) * 4;
    g.save();
    g.translate(dx, 0);
    strokeShape(K, (p) => skirtBackPath(p, K.hemWave), C.glitch, 1.6);
    g.restore();
  }

  // 5) 星尘：能量高时在人物周围升起几粒确定性小星（带一点闪烁）
  if (!K.perf && P.glow > 0.3) {
    const count = K.tiny ? 4 : 7;
    for (let i = 0; i < count; i += 1) {
      const seed = i * 131 + 7;
      const a = rand01(seed) * TAU + t * (0.12 + rand01(seed + 1) * 0.2);
      const r = 120 + rand01(seed + 2) * 130;
      const x = Math.cos(a) * r;
      const y = -100 + Math.sin(a) * r - 380;
      const size = 1.6 + rand01(seed + 3) * 2.6;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.6 + i * 1.7));
      g.globalAlpha = clamp01(P.glow * tw);
      g.fillStyle = C.dust;
      g.beginPath();
      g.moveTo(x, y - size * 2.2);
      g.lineTo(x + size, y);
      g.lineTo(x, y + size * 2.2);
      g.lineTo(x - size, y);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  }
}

/** 32 位整数哈希 → 0..1（确定性抖动，禁止真随机的替代品） */
function rand01(n) {
  let h = (Number(n) | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}
