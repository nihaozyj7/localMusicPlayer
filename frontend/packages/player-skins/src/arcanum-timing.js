// @ts-check
/* ==========================================================================
   arcanum-timing.js — 「星阵咏唱」的时间轴与舞台剧本（纯计算，零 DOM）
   --------------------------------------------------------------------------
   这个模块回答四个问题，全部是纯函数，所以可以单测、也可以被别的样式复用：

     1. **每个字/词什么时候出现、出现多久？**
        宿主只给整行歌词（{ time, text }），没有逐字时间。
          · 分词：中文逐字，**英文按词**（一个单词一个单元，"fly me to the moon"
            是 5 个词而不是 14 个字母 —— 逐字母弹出的英文读起来是碎纸机）；
          · 时长：按「字素权重」把**合理的演唱时长**分配到每个单元上
            （CJK 满权、拉丁 0.62、标点 0.45、空白 0.35）；
          · **合理时长由字数决定，不是由到下一句的间隔决定**：
            中间隔了 30 秒间奏时，"一句歌词唱 30 秒"显然不对，所以
            span = min(到下一句的间隔, 字数 × PER_UNIT_MS)。
            唱完就停在那里等下一句（长音/间奏由法阵与粒子负责，不是硬拖文字）。
          · 每个单元至少 MIN_UNIT_MS —— 否则逗号会和后一个字一起入场。

     2. **这一句属于哪个段落？**（主歌 / 预副歌 / 副歌 / 桥段 / 尾奏）
        判据全部来自歌词本身：重复句 → 副歌；副歌前 1~2 句 → 预副歌；
        与上一句的间隔超过中位间隔的 2.2 倍 → 桥段 / 间奏；最后 12% → 尾奏。

     3. **这一句摆在舞台的哪一个位置？**
        ★ **先算"占位矩形"，再解"互不相交"**（两段式，见 layoutLineBoxes）：
          · 行带只给**垂直顺序**（第 index 行落在第 index % LYRIC_BANDS 条横带上，
            于是"下一句在下一行"的阅读顺序天然成立）；
          · 水平落点不靠抖动，而是**按各自的真实宽度**求出来的 —— 行是
            text-align:left 的，宽度不同还都居中摆，长句就会横着扫到短句身上；
          · 最后用 solver 把相交的矩形互相推开（垂直为主、水平为辅），
            并夹在舞台边缘与两块**角落留白**之外。
        汉字与拉丁字母的宽度在这里按**真实比例**估（见 unitWidthEm），不是
        "一个字 = 1em、一个字母 = 0.56em" 那种拍脑袋的近似 —— 后者估不准
        长度，占位矩形就会误判，重排反而把两行推到一起。

     4. **每个字用哪种魔法入场？** 用「行号 + 文本」当种子生成确定性布局，
        同一首歌永远同一套（不会每次切歌都换一张构图）。
   ========================================================================== */

import { splitGraphemes } from "./fx-lyrics.js";

/** 每个单元最短占用的时间（ms）。低于它的单元（标点、空白）会向邻居借时间。 */
export const MIN_UNIT_MS = 90;
/** 一个"权重单位"合理唱多久（ms）：CJK 一个字 ≈ 240ms ≈ 4 字/秒 */
export const PER_UNIT_MS = 240;
/** 一句歌词的合理演唱时长的上下限（ms） */
export const MIN_SING_MS = 900;
export const MAX_SING_MS = 9000;
/** 歌词字号相对用户设置的倍数（CSS 里读 --ar-lmul，两边必须一致） */
export const FONT_MUL = 1.8;
/** 行高倍数（与 CSS 的 line-height 一致）：估算"这一行占多高" */
export const LINE_HEIGHT = 1.25;
/** 每个字素之间的字距（em）：占位矩形的宽度估算要比字面略宽一点 */
export const TRACKING_EM = 0.04;
/** 状态宽高比：占位矩形的高度要从"舞台宽度"换算回"舞台高度" */
export const STAGE_ASPECT = 1.78;

/** 歌词行带：同屏最多显示这么多行（相邻行天然错开，见 planLine） */
export const LYRIC_BANDS = 6;
/** 行带占舞台高度的范围（比例）：0.15 → 0.64 */
export const BAND_TOP = 0.15;
export const BAND_BOTTOM = 0.64;

/**
 * 两块「角落留白」（比例，舞台坐标）：左上角的曲目信息 HUD 与右上角的段落名。
 * 求解器会把歌词矩形推出这两块 —— 否则长句子会顶到曲名上。
 * 舞台比例按 .ar-hud 的定位换算：left/top = 26px * --ar-fit + 安全区，
 * 尺寸按窄窗口下的 max-width: 68% 放宽一点再夹到一半。
 */
export const CORNER_HUD = { w: 0.42, h: 0.2 };
export const CORNER_SECTION = { w: 0.2, h: 0.1 };

/** 十种入场方式（对应 arcanum.css 里的十个 @keyframes）。 */
export const ENTRANCE_MODES = [
  "summon", // 召唤式：从法阵中心升起光柱，字由粒子凝聚而成
  "appear", // 凭空式：从大到小收拢，像从空气里显形
  "write", // 书写式：从左侧横向展开，光笔逐笔写出来
  "fall", // 坠落式：从上方落下，落地弹一下
  "rise", // 升腾式：从下方升起，像气泡 / 灵魂
  "slash", // 斜切式：从左上飞来，带旋转与残影的观感
  "spiral", // 螺旋式：绕着中心转几圈再定格
  "mirror", // 镜像式：从法阵倒影里翻上来
  "unseal", // 解封式：从符文 / 卡页里展开
  "burst", // 爆裂式：鼓点上炸开再聚成一个字
];

/** 段落剧本：每个段落一套视觉参数（皮肤只读这些，不写死视觉常量）。 */
/*
 * ★ jitterY / waveY / jitterR 是"每个字自己抖多少"：它们让散落的咒语看起来
 *   自然，但也直接决定"换句时抖不抖"。这一版整体压小了一档（0.18/0.05/5 →
 *   0.12/0.035/3）：需求是"上下句切换平滑过去即可"，散落感留着，抖动收掉。
 */
export const SECTION_PROGRAMS = {
  verse: {
    label: "主歌",
    arrayAlpha: 0.34,
    spin: 0.5,
    particles: 0.5,
    sizeScale: 0.92,
    spread: 0.8,
    jitterY: 0.12,
    waveY: 0.035,
    jitterR: 3,
    camZoom: 0,
    camSpeed: 0.85,
    keyChance: 0.18,
    hue: 0,
    modes: ["appear", "write", "rise", "summon"],
  },
  pre: {
    label: "预副歌",
    arrayAlpha: 0.5,
    spin: 0.95,
    particles: 0.78,
    sizeScale: 1,
    spread: 1.05,
    jitterY: 0.15,
    waveY: 0.045,
    jitterR: 4,
    camZoom: 0.02,
    camSpeed: 1,
    keyChance: 0.24,
    hue: 10,
    modes: ["write", "rise", "slash", "spiral", "appear"],
  },
  chorus: {
    label: "副歌",
    arrayAlpha: 0.8,
    spin: 1.4,
    particles: 1.15,
    sizeScale: 1.16,
    spread: 1.15,
    jitterY: 0.2,
    waveY: 0.06,
    jitterR: 5,
    camZoom: -0.045,
    camSpeed: 1.3,
    keyChance: 0.36,
    hue: 0,
    modes: ["summon", "burst", "fall", "slash", "spiral"],
  },
  bridge: {
    label: "桥段",
    arrayAlpha: 0.62,
    spin: 0.4,
    particles: 0.85,
    sizeScale: 1.02,
    spread: 1.2,
    jitterY: 0.17,
    waveY: 0.05,
    jitterR: 4,
    camZoom: 0.035,
    camSpeed: 0.9,
    keyChance: 0.28,
    hue: 34,
    modes: ["mirror", "unseal", "spiral", "appear", "rise"],
  },
  outro: {
    label: "尾奏",
    arrayAlpha: 0.2,
    spin: 0.18,
    particles: 0.35,
    sizeScale: 0.9,
    spread: 0.7,
    jitterY: 0.11,
    waveY: 0.03,
    jitterR: 2,
    camZoom: 0.05,
    camSpeed: 0.55,
    keyChance: 0.12,
    hue: -18,
    modes: ["appear", "rise", "write"],
  },
};

/** 32 位 FNV-1a：给「同一句话永远同一套构图」提供稳定种子 */
export function hashStr(s) {
  let h = 2166136261;
  const str = String(s ?? "");
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 确定性伪随机（mulberry32）：同一颗种子永远给出同一串数 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RE_SPACE = /\s/;
const RE_PUNCT = /[\u3000-\u303f\uff00-\uffef,.!?;:'"()<>~_—/\\|-]/;
const RE_CJK = /[\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
const RE_LATIN = /[0-9A-Za-z]/;
/** 可以连成一个"单词"的字符：拉丁 / 希腊 / 西里尔字母、数字、撇号与连字符 */
const RE_WORDCHAR = /[0-9A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff'\u2019-]/;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** 一个字素占多少「时间权重」（不是宽度，是它被唱/读出来的相对时长） */
export function unitWeight(ch) {
  const c = String(ch ?? "");
  if (!c) return 0;
  if (RE_SPACE.test(c)) return 0.35;
  if (RE_PUNCT.test(c)) return 0.45;
  if (RE_CJK.test(c)) return 1;
  if (RE_LATIN.test(c)) return 0.62;
  return 0.8;
}

/**
 * 拉丁字素的**真实**宽度（em，相对于 font-size 的 advance width）。
 * 表里没有的字符退回 fallback（西里尔 / 希腊 / 其它）。
 *
 * ★ 为什么不能"一个字母 0.56em"：那个近似在全是 i / l 的词上高估 30%、
 * 在全是 W / M 的词上低估 30%。这个宽度后面要拿去算**占位矩形**，
 * 估不准就会误判重叠 —— 该推开的没推开，不该动的被推到一起。
 * 字体度量随字体有 ±10% 的出入，所以最后还留了一个安全余量（见 boxWEm）。
 */
const LATIN_ADVANCE = {
  i: 0.26, j: 0.26, l: 0.26, f: 0.32, t: 0.35, r: 0.38, I: 0.3,
  "!": 0.3, "'": 0.22, ".": 0.27, ",": 0.27, ":": 0.27, ";": 0.27, "|": 0.26,
  m: 0.86, w: 0.76, M: 0.86, W: 0.96,
  "1": 0.5, "0": 0.56,
};
export const LATIN_ADVANCE_FALLBACK = 0.55;

/** 一个拉丁字素占多宽（em） */
export function latinAdvanceEm(ch) {
  const direct = LATIN_ADVANCE[ch];
  if (direct != null) return direct;
  const lower = ch.toLowerCase();
  const lowerHit = LATIN_ADVANCE[lower];
  if (lowerHit != null) return lowerHit;
  // 西里尔 / 希腊 / 拉丁扩展一律按 0.55 走，偏差可以接受
  return LATIN_ADVANCE_FALLBACK;
}

/**
 * 一个字素大概占多宽（em）。用来：
 *   · 估出这一行会不会顶到舞台边上（超了就整体缩小一点，而不是让它出画）；
 *   · 算这一行的**占位矩形**，再据此求"互不相交"的落点（见 layoutLineBoxes）。
 *
 * ★ 这是**字面宽度**（排版格子），不含任何缩放/倾斜 —— 要算"画出来会不会
 *   压到邻居"，用 charSlotEm()。
 */
export function charWidthEm(ch) {
  const c = String(ch ?? "");
  if (!c) return 0;
  if (RE_SPACE.test(c)) return 0.3;
  if (RE_CJK.test(c)) return 1;
  if (RE_LATIN.test(c)) return latinAdvanceEm(c);
  if (RE_PUNCT.test(c)) return 0.45;
  return 0.7;
}

/**
 * 一个字素**画出来**占多宽（em）—— 也就是它的排版格子要留多宽。
 *
 * ★ 为什么格子要比字面宽：字素的最终观感是
 *     transform: translate(dx, dy) rotate(dr) scale(ds)
 *   而 transform **不参与布局** —— 格子仍是字面的宽。于是被放大 1.3 倍的字
 *   画出来比自己的格子宽 30%，必然盖住邻居（实测相邻汉字横向重叠 0.8~8px、
 *   纵向重叠 28px，一整句 53 处）。这里把"画多大"补进格子，布局与绘制才对齐。
 *
 * 倾斜还要再算一次外接盒：宽 w、高 h 的矩形转 θ 之后宽变成
 * w·|cosθ| + h·|sinθ|。行虽不再整体倾斜，但单个字素仍有 ±jitterR/2 度。
 *
 * @param {string} ch 字素
 * @param {number} scale 绘制时用的缩放（--ar-ds）
 * @param {number} [rotateDeg] 绘制时用的旋转（--ar-dr）
 * @param {number} [lineEm] 该行字号占几个 em（算旋转外接盒要用高度）
 */
export function charSlotEm(ch, scale, rotateDeg = 0, lineEm = LINE_HEIGHT) {
  const base = charWidthEm(ch);
  const s = Math.max(0.05, Number(scale) || 1);
  const rad = (Math.abs(Number(rotateDeg) || 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  // 缩放后的字面 + 旋转带来的额外外接宽度
  return (base * cos + lineEm * sin) * s;
}

/**
 * 入场动画里，一个字素最大的放大倍数与倾角（相对它落定时的 --ar-ds）。
 *
 * ★ 为什么占位要按**动画峰值**算而不是按落定值：--ar-ds 是"停稳之后"的大小，
 *   但入场那几百毫秒里字素会被动画再放大一截（ar-appear 起始 1.28×、
 *   ar-burst 峰值 1.26×…）。只按落定值留格子的话，动画中途仍然会压到邻居
 *   身上（实测：入场的一两百毫秒里，相邻字素横向重叠 0.6~8.4px）。
 *   动画是瞬时的，但"叠一下"也一样难看，所以格子按峰值留。
 *
 * 每一条都对应 arcanum.css 里同名 @keyframes 的最大 scale / rotate。
 * 改动画时必须同步改这里（两边的数字是同一件事）。
 */
export const ENTRANCE_PEAK = {
  summon: { scale: 1.08, rotate: 6 },
  appear: { scale: 1.28, rotate: 0 },
  write: { scale: 1.06, rotate: 0 },
  fall: { scale: 1.18, rotate: 3 },
  rise: { scale: 0.55, rotate: 9 },
  slash: { scale: 0.72, rotate: 24 },
  spiral: { scale: 1.1, rotate: 42 },
  mirror: { scale: 0.78, rotate: 0 },
  unseal: { scale: 1.16, rotate: 14 },
  burst: { scale: 1.26, rotate: 20 },
};
/** 兜底峰值：将来新加入场方式忘了登记时，按这个留（宁可多留一点） */
export const ENTRANCE_PEAK_FALLBACK = { scale: 1.3, rotate: 24 };

/**
 * 一个字素为了"画出来不越出格子"，两侧各要多占多少（em，em 相对字号）。
 *
 * 字素画成 translate(dx,dy) rotate(r) scale(s)，dx 还会把它整体推出去一点。
 * 格子（.ar-unit 的盒）只按字面排，所以要补上：
 *
 *     画的宽度 ≤ 字面宽 × s × (|cos r| + 高度/字面宽 × |sin r|)
 *     多出来的部分平摊到两侧 → 单侧 =（画的宽度 − 字面宽）/ 2
 *     dx 是纯平移，整段一起挪，两侧各留 |dx| 就够
 *
 * 缩小（s < 1）不会侵占邻居，返回 0。
 *
 * @param {string} ch 字素
 * @param {number} scale 落定时的缩放（--ar-ds）
 * @param {number} [rotateDeg] 落定时的旋转（--ar-dr）
 * @param {number} [shiftEm] 落定时的横向偏移（--ar-dx，em）
 * @param {string} [mode] 入场方式：占位按它的**峰值**再放宽（见 ENTRANCE_PEAK）
 */
export function unitPadEm(ch, scale, rotateDeg = 0, shiftEm = 0, mode) {
  const base = Math.max(0.05, charWidthEm(ch));
  // mode 缺省时不套兜底峰值：调用方（自检 / 单测）可能只想问"落定后要多宽"。
  // 真正绘制的那条路径永远会传 mode（见单元构建），兜底只对"没登记的新方式"生效。
  const peak = mode ? ENTRANCE_PEAK[mode] || ENTRANCE_PEAK_FALLBACK : { scale: 1, rotate: 0 };
  // 动画峰值与落定值取大的那个：放大幅度用乘法叠加（动画是在 --ar-ds 之上再缩放的）
  const s = Math.max(0.05, Number(scale) || 1) * Math.max(1, peak.scale);
  const rot = Math.abs(Number(rotateDeg) || 0) + Math.max(0, peak.rotate);
  const rad = (rot * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  // 旋转后的外接宽度（用行高当字素高度）
  const painted = (base * cos + LINE_HEIGHT * sin) * s;
  const grow = Math.max(0, painted - base) / 2;
  return grow + Math.abs(Number(shiftEm) || 0);
}

/**
 * 一行字素按"最大槽宽"排布时的总宽（em）。
 *
 * 为什么用**最大值**而不是逐个相加：每个字素的格子宽度会撑开它自己那个
 * flex item，所以整行实际宽度 = Σ(每个字素的格子宽)；而 .ar-unit 是
 * inline-block，格子宽 = 字面宽（transform 不改变它）。要保证"画出来的字
 * 不越出这一行的占位矩形"，就得让**每个**格子都至少能容纳它自己画出来的
 * 外接盒 —— 于是统一按这一行里最大的那个放大倍数去算每个格子。
 */
export function estimateSlotWidthEm(units) {
  const list = Array.isArray(units) ? units : [];
  if (!list.length) return 0;
  let w = 0;
  for (const u of list) {
    const ch = (u && u.ch) || "";
    // 排版格子宽 = 字面宽 + 两侧 padding（padding 由 unitPadEm 给出，
    // 与 CSS 里写进去的 --ar-pad 是同一个数）
    const pad =
      u && Number.isFinite(u.pad) ? u.pad : unitPadEm(ch, u && u.ds, u && u.dr, u && u.dx, u && u.mode);
    w += charWidthEm(ch) + pad * 2 + TRACKING_EM;
  }
  return w;
}

export function estimateWidthEm(text) {
  const chars = splitGraphemes(String(text ?? ""));
  let w = 0;
  for (const ch of chars) w += charWidthEm(ch) + TRACKING_EM;
  return w;
}

/* ==========================================================================
   占位矩形与「互不相交」求解
   --------------------------------------------------------------------------
   一句歌词在渲染之前，先按它自己的宽度算一个矩形（舞台比例坐标）。
   有了矩形就能在**渲染之前**回答两个问题：
     · 这一句会不会顶出舞台 / 压到角落里那两块 HUD？
     · 同屏的几句之间会不会压在一起？
   答案不对就重排一次，而不是等 DOM 出来之后靠肉眼发现"叠在一起了"。

   ★ 两套坐标，只在这个文件里换算，外面一律以 node 为准：

     · **node 坐标**（plan.node.x / node.y）—— 皮肤每帧写进 CSS 变量的那套。
       x 以舞台正中为 0（±0.5 = 舞台左右边），y 以**画面 40% 高**为 0。
     · **视口比例**（占位矩形 box）—— 0~1、左上角为原点，写起来最不容易错，
       所以求解器只用这一套。两套之间只差一个 (0.5, 0.4) 的平移
       （见 lineBox / boxToNode）。

   行元素是 text-align:left 的、再整体 translate(-50%) 居中，所以矩形中心
   **就是**这一句的落点；求解器改的是矩形，改完再换算回 node。
   ========================================================================== */

/**
 * @typedef {{x:number,y:number,w:number,h:number}} StageBox
 */

/**
 * 一句话的占位矩形，**视口比例坐标**（0~1，左上角为原点）。
 *
 * ★ 两个轴必须换算到同一把尺子上。emToStageW 是"1em 占舞台宽度的多少"
 *   （典型值 0.01 —— 16px 字号配 1600px 宽的舞台），于是：
 *     宽 = 宽度em × 缩放 × emToStageW                → 视口宽的比例
 *     高 = 缩放 × 行高em × emToStageW ÷ 1.78          → 视口高的比例
 *   那个 1.78 是把"宽的倍数"折成"高的比例"（舞台按 16:9 算）。
 *   早先写成 ÷ emToStageW，等于把 1/0.01 = 100 又乘了一遍：每一行的 h 都顶到
 *   0.5 的上限，求解器以为整屏每一行都上下重叠，把构图推得乱七八糟。
 */
export function lineHeightRatio(scale, emToStageW, jitterEm = 0) {
  const em = Math.max(0.001, emToStageW);
  /**
   * 一行**落定之后**占多高（em，相对字号）。
   *
   * ★ 为什么不是 CSS 的 line-height（1.25em）：.ar-unit 是 inline-block，
   *   它的盒子高度按**字面**算，行高不参与 —— 实测一行只有约 1em 高。
   * ★ 为什么还要加 jitter：每个字素带 --ar-dy 的纵向散落，实测幅度约 ±0.14em，
   *   所以整行实际比"一个字"高出一截（实测：far 13.5px、next 15.3px、
   *   near 22.6px、active 31px，字号 23.6px）。
   * ★ 为什么不按入场动画中途的盒子算：ar-appear 的起始帧是 scale(1.85)，
   *   动画中途整行能有 140px 高。那是**瞬时**的，拿它去求解会让每次都重排；
   *   要保证的是"停在那里别叠"。
   */
  const heightEm = scale * (1.02 + Math.min(0.5, Math.max(0, jitterEm)) + 0.16);
  // ★ emToStageW（= em）量的是"1em 占视口**宽**的多少"，而这里要的是视口**高**
  //   的比例：1em 的高度 = em × 视口宽 ÷ 视口高 = em × ASPECT。
  //   早先写成 ÷ ASPECT，等于把比例又压小了 3 倍多 —— 盒子比真实文字矮太多，
  //   求解器于是以为"每行都隔得远"，重叠全漏判。
  return clamp(heightEm * em * STAGE_ASPECT, 0.012, 0.5);
}

/**
 * @param {number} nodeX 行的 node.x（-0.5 ~ 0.5，0 = 舞台正中）
 * @param {number} nodeY 行的 node.y（相对 40% 焦点的比例，0 = 画面 40% 高）
 */
export function lineBox(nodeX, nodeY, widthEm, scale, emToStageW, jitterEm = 0) {
  const w = Math.max(0.02, widthEm * scale * emToStageW);
  return { x: nodeX + 0.5, y: nodeY + 0.4, w, h: lineHeightRatio(scale, emToStageW, jitterEm) };
}

/** 视口比例 → node 坐标（落点写回 plan 时用） */
export function boxToNode(box) {
  return { x: box.x - 0.5, y: box.y - 0.4 };
}

/**
 * 两个矩形是否相交，pad 是"擦着边也算相交"的余量（两份半透明文字只要挨上，
 * 看起来就已经叠在一起了）。
 *
 * ★ 两边的判定必须都用同一个"已含余量"的半宽/半高：
 *     命中 ⇔ |ax-bx| < (aw + bw) / 2 + pad
 *   早先写成 |ax-bx| × 2 < (aw + bw) + pad × 2，等价于把 pad 也乘了个 2 之后
 *   又混进了"和"里 —— pad 稍微一大，两个八竿子打不着的矩形也会被判成相交，
 *   求解器于是把整屏推得乱七八糟。
 */
export function boxesOverlap(a, b, pad = 0) {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad
  );
}

/** 相交的深度（> 0 才是真的压在一起） */
export function overlapDepth(a, b) {
  const dx = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
  const dy = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
  return dx > 0 && dy > 0 ? Math.min(dx, dy) : 0;
}

/**
 * 把相交的矩形互相推开，返回新的中心点。
 *
 * 纪律：
 *   · **垂直为主、水平为辅**：两句的垂直重叠尽量靠上下让开解决，水平只做
 *     一半的修正 —— 否则会看到歌词横着乱窜，反而不像"散落的咒语"；
 *   · 往外推的方向取"当前偏移更小的那一侧"，让结果尽量贴近原始落点；
 *   · 迭代收敛：越界就夹回来，夹回来若又相交，下一轮继续推。
 *
 * @param {Array<{x:number,y:number,w:number,h:number}>} items 会被就地修改（视口比例坐标）
 * @param {Partial<{top:number,bottom:number,edgeX:number,iterations:number,pad:number}>} [bounds]
 */
export function solveOverlaps(items, bounds) {
  /** @type {any} */
  const b = bounds || {};
  const top = Number.isFinite(b.top) ? b.top : 0.14;
  const bottom = Number.isFinite(b.bottom) ? b.bottom : 0.66;
  const edgeX = Number.isFinite(b.edgeX) ? b.edgeX : 0.47;
  const pad = Number.isFinite(b.pad) ? b.pad : 0.014;
  const iterations = Math.max(1, Math.round(b.iterations || 24));
  const list = Array.isArray(items) ? items : [];
  // 坐标是**视口比例**（0~1，左上角为原点）：x 夹在 [w/2, 1 - w/2]，
  // y 夹在 [top, bottom]。★ 这里左右对称的 lim = edgeX - w/2 是错的 ——
  // edgeX 是"离舞台中线的最大距离"，在 0~1 坐标里等价于 [0.5-edgeX, 0.5+edgeX]。
  const clampX = (it) => {
    const lim = Math.max(0, edgeX - it.w / 2);
    it.x = clamp(it.x, 0.5 - lim, 0.5 + lim);
  };
  const clampY = (it) => {
    const lim = Math.max(0, (bottom - top) / 2 - it.h / 2);
    const mid = (top + bottom) / 2;
    it.y = clamp(it.y, mid - lim, mid + lim);
  };
  for (const it of list) {
    clampX(it);
    clampY(it);
  }
  /** 两个矩形相交时，谁让得多：越窄的让得越多（短句给长句腾地方） */
  const share = (a, c) => {
    const total = Math.max(1e-6, a.w + c.w);
    return [c.w / total, a.w / total];
  };
  for (let pass = 0; pass < iterations; pass += 1) {
    let moved = 0;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const c = list[j];
        if (!boxesOverlap(a, c, pad)) continue;
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const needX = (a.w + c.w) / 2 + pad - Math.abs(dx);
        const needY = (a.h + c.h) / 2 + pad - Math.abs(dy);
        const sx = dx >= 0 ? 1 : -1;
        const sy = dy !== 0 ? (dy > 0 ? 1 : -1) : i % 2 === 0 ? 1 : -1;
        const [wa, wc] = share(a, c);
        a.y -= sy * needY * wa;
        c.y += sy * needY * wc;
        // 水平只做一半的修正：否则歌词会横着乱窜，不像"散落的咒语"
        a.x -= (sx * needX * wa) / 2;
        c.x += (sx * needX * wc) / 2;
        clampX(a);
        clampX(c);
        clampY(a);
        clampY(c);
        moved += 1;
      }
    }
    if (!moved) break;
  }
  return list;
}

/**
 * 一句话的落点：先把角落留白与舞台边缘让出来，再让它们互相推开。
 *
 * 坐标一律是**视口比例**（0~1，左上角为原点），与 planLine 的 node 坐标
 * 之间只差一个 (0.5, 0.4) 的平移（见 lineBox / boxToNode）。
 *
 * ★ 就地修改传入的那些矩形对象（不复制）—— 调用方随后要拿同一批对象把答案
 *   写回 plan.node，改副本等于白算。
 *
 * @param {Array<{index:number,x:number,y:number,w:number,h:number}>} lines
 * @param {Partial<{top:number,bottom:number,edgeX:number,corners:Array<{x:number,y:number,w:number,h:number}>}>} [bounds]
 */
export function layoutLineBoxes(lines, bounds) {
  /** @type {any} */
  const b = bounds || {};
  const top = Number.isFinite(b.top) ? b.top : 0.14;
  const bottom = Number.isFinite(b.bottom) ? b.bottom : 0.66;
  const edgeX = Number.isFinite(b.edgeX) ? b.edgeX : 0.47;
  const corners = Array.isArray(b.corners) ? b.corners : [];
  const src = Array.isArray(lines) ? lines : [];
  // ★ 就地改调用方传进来的那些矩形（不复制）：planLines 随后要拿同一批对象
  //   把答案写回 plan.node。早先在这里 map 出一批副本，改的全是副本 ——
  //   求解"成功"了，但调用方看到的还是原始落点，等于白算。
  const items = src.filter((line) => line && typeof line === "object");
  for (const it of items) {
    if (!Number.isFinite(it.w)) it.w = 0.02;
    if (!Number.isFinite(it.h)) it.h = 0.04;
    if (!Number.isFinite(it.x)) it.x = 0;
    if (!Number.isFinite(it.y)) it.y = 0;
  }
  // 1. 夹回行带与舞台边缘（后面所有让位都要复用它俩）
  const clampY = (it) => {
    it.y = clamp(it.y, top + it.h / 2, bottom - it.h / 2);
  };
  const clampX = (it) => {
    const lim = Math.max(0, edgeX - it.w / 2);
    it.x = clamp(it.x, 0.5 - lim, 0.5 + lim);
  };
  const PAD = 0.02;
  /**
   * 把一个矩形推出某块角落留白：**先往下让，让不动再横着让**。
   *
   * 为什么先试垂直：HUD 贴在画面顶部，往下让一格就解决了；横着让要挪小半个
   * 舞台宽，看起来是"这句话莫名其妙跑到边上去了"。
   * 为什么还得有水平那一手：行带的第一条正好落在画面顶部时，往下让会被
   * clampY 顶回行带上沿 —— 光靠垂直永远出不来，只能横着绕开。长句从曲名
   * 位置上横穿过去，正是需求里说的"渲染之后文字叠在一起"。
   *
   * @returns {boolean} 是否真的动过（收敛判断用）
   */
  const escape = (it, c) => {
    if (!c || !boxesOverlap(it, c, PAD)) return false;
    // ★ 直接算出"贴着留白下沿"的目标 y，而不是"当前 y 加上差值"：
    //   后者再被 clampY 一夹就少走一截，"刚好差一点"于是永远逃不出来。
    const below = c.y + (it.h + c.h) / 2 + PAD;
    const above = c.y - (it.h + c.h) / 2 - PAD;
    const wantY = below <= bottom - it.h / 2 ? below : above;
    it.y = clamp(wantY, top + it.h / 2, bottom - it.h / 2);
    if (!boxesOverlap(it, c, PAD)) return true;
    // 垂直怎么都让不开（留白比整条行带还高）→ 横着挪到留白的另一侧
    const right = c.x + (it.w + c.w) / 2 + PAD;
    const left = c.x - (it.w + c.w) / 2 - PAD;
    it.x = it.x >= c.x ? right : left;
    clampX(it);
    return true;
  };

  // 2. 把"躲角落"和"互相推开"交替跑到收敛为止（最多 4 轮）。
  //    ★ 只跑一遍是不够的：躲角落会把行往下推，推下去就和下一条行带撞上；
  //      修完这一对，新的相交又可能出现。两三个来回就能收敛。
  for (const it of items) {
    clampY(it);
    clampX(it);
  }
  for (let round = 0; round < 4; round += 1) {
    let touched = false;
    for (const it of items) {
      for (const c of corners) if (escape(it, c)) touched = true;
    }
    solveOverlaps(items, { top, bottom, edgeX, pad: PAD / 2 });
    if (!touched) break;
  }
  const out = new Map();
  for (const it of items) out.set(it.index, it);
  return out;
}

/**
 * 把一行文本切成「咒语单元」。
 *
 * ★ 英文按**词**：连续的可连字符号攒成一个单元（"moon" 是一个单元），
 *   于是逐字点亮在英文歌里就是"一个词一个词地亮"，而不是一个字母一个字母。
 *   中文/日文/韩文仍然逐字，空白与标点各自一个单元（保留原位，排版不会走样）。
 *
 * @param {string} text
 * @returns {Array<{ text: string, weight: number, kind: "word"|"char"|"space"|"punct" }>}
 */
export function tokenizeUnits(text) {
  const chars = splitGraphemes(text);
  /** @type {Array<{ text: string, weight: number, kind: "word"|"char"|"space"|"punct" }>} */
  const out = [];
  let buf = "";
  let weight = 0;
  const flush = () => {
    if (!buf) return;
    out.push({ text: buf, weight, kind: "word" });
    buf = "";
    weight = 0;
  };
  for (const ch of chars) {
    if (RE_CJK.test(ch)) {
      flush();
      out.push({ text: ch, weight: 1, kind: "char" });
    } else if (RE_SPACE.test(ch)) {
      flush();
      out.push({ text: ch, weight: 0.35, kind: "space" });
    } else if (RE_WORDCHAR.test(ch)) {
      buf += ch;
      weight += unitWeight(ch);
    } else {
      flush();
      out.push({ text: ch, weight: 0.45, kind: "punct" });
    }
  }
  flush();
  return out;
}

/**
 * 把一行文本铺成一条逐单元时间轴。
 *
 * @param {string} text 行文本
 * @param {number} startMs 行起始（宿主给的 time）
 * @param {number} endMs 行结束（下一行的 time；没有下一行时由调用方给一个估计值）
 * @returns {Array<{ ch: string, kind: string, time: number, dur: number }>}
 */
export function buildGraphemeTimeline(text, startMs, endMs) {
  const units = tokenizeUnits(text);
  const n = units.length;
  if (!n) return [];
  const start = Number(startMs) || 0;
  // 到下一句的间隔（下限 240ms：极短的间奏不让它变成 0 时长）
  const gap = Math.max(240, (Number(endMs) || 0) - start);
  const totalWeight = units.reduce((a, u) => a + u.weight, 0) || 1;
  // 合理演唱时长由字数决定 —— 中间有 30 秒间奏时不会"一句唱 30 秒"
  const natural = clamp(totalWeight * PER_UNIT_MS, MIN_SING_MS, MAX_SING_MS);
  const span = Math.min(gap, natural);

  /** @type {number[]} */
  const durs = units.map((u) => (span * u.weight) / totalWeight);

  // 保证最短时长：把低于 MIN_UNIT_MS 的抬上来，多出来的时间从"最长的那几个"
  // 里按比例扣回（两轮足够收敛；这里不需要精确求解）。
  for (let pass = 0; pass < 2; pass += 1) {
    let deficit = 0;
    let stretched = false;
    for (let i = 0; i < n; i += 1) {
      if (durs[i] < MIN_UNIT_MS) {
        deficit += MIN_UNIT_MS - durs[i];
        durs[i] = MIN_UNIT_MS;
        stretched = true;
      }
    }
    if (!stretched || deficit <= 0) break;
    let pool = 0;
    for (let i = 0; i < n; i += 1) if (durs[i] > MIN_UNIT_MS) pool += durs[i] - MIN_UNIT_MS;
    if (pool <= 0) break;
    const take = Math.min(deficit, pool);
    for (let i = 0; i < n; i += 1) {
      if (durs[i] <= MIN_UNIT_MS) continue;
      durs[i] -= ((durs[i] - MIN_UNIT_MS) / pool) * take;
    }
  }

  const out = [];
  let cursor = start;
  for (let i = 0; i < n; i += 1) {
    out.push({ ch: units[i].text, kind: units[i].kind, time: cursor, dur: durs[i] });
    cursor += durs[i];
  }
  return out;
}

/** 去标点、去空白的比较键（判断「这句是不是副歌里重复的那句」） */
export function lineTextKey(text) {
  return String(text ?? "")
    .replace(/[\s\u3000]/g, "")
    .replace(/[\u3000-\u303f\uff00-\uffef,.!?;:'"()<>~_—/\\|-]/g, "")
    .toLowerCase();
}

/**
 * 给每一行判定段落，返回与传入 lines 等长的数组。
 *
 * @param {Array<{time:number,text:string}>} lines
 * @returns {string[]} 每行的段落 id（verse / pre / chorus / bridge / outro）
 */
export function detectSections(lines) {
  const src = Array.isArray(lines) ? lines : [];
  const out = new Array(src.length).fill("verse");
  if (!src.length) return out;

  const gaps = [];
  for (let i = 1; i < src.length; i += 1) {
    const g = Number(src[i].time) - Number(src[i - 1].time);
    if (g > 0) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;

  const seen = new Map();
  for (const line of src) {
    const key = lineTextKey(line?.text);
    if (!key) continue;
    seen.set(key, (seen.get(key) || 0) + 1);
  }

  const n = src.length;
  const isRepeat = (i) => {
    const key = lineTextKey(src[i]?.text);
    return key.length >= 2 && (seen.get(key) || 0) > 1;
  };

  for (let i = 0; i < n; i += 1) {
    const pos = n > 1 ? i / (n - 1) : 0;
    const gap = i > 0 ? Number(src[i].time) - Number(src[i - 1].time) : 0;
    const stretched = median > 0 && gap > median * 2.2 && gap > 3600;
    if (pos >= 0.88) out[i] = "outro";
    else if (stretched) out[i] = "bridge";
    else if (isRepeat(i)) out[i] = "chorus";
    else out[i] = "verse";
  }

  for (let i = 0; i < n; i += 1) {
    if (out[i] !== "verse") continue;
    if (out[i + 1] === "chorus" || out[i + 2] === "chorus") out[i] = "pre";
  }
  return out;
}

/** 单元层级：关键词大、亮、近；连接词小、暗、远 */
export function tierOf(kind, text, keyChance, roll) {
  if (kind === "space" || kind === "punct") return "link";
  if (kind === "char") return roll < keyChance * 2 ? "key" : "main";
  // 英文单词：长词当关键词（"forever" 比 "to" 重要）
  const len = String(text ?? "").length;
  if (len >= 6) return "key";
  if (len <= 2) return "link";
  return roll < keyChance ? "key" : "main";
}

/**
 * 为一行歌词生成舞台计划（纯数据）。
 *
 * 坐标是**归一化舞台坐标**：x/y 都是视口宽/高的比例（0 = 正中）。
 * 皮肤拿它乘上自己的容器尺寸即可 —— 主窗口与桌面背景上是同一套构图比例。
 *
 * @param {{time:number,text:string}} line
 * @param {number} index 行号
 * @param {string} section 段落 id
 * @param {(i:number)=>number} endAtMs 取第 i 行的结束时间（通常是下一行的 time）
 * @param {{bands?:number, top?:number, bottom?:number, availableEm?:number, emToStageW?:number}} [layout]
 */
export function planLine(line, index, section, endAtMs, layout) {
  const opt = layout || {};
  const program = SECTION_PROGRAMS[section] || SECTION_PROGRAMS.verse;
  /** @type {string} */
  const text = String(line?.text ?? "");
  const start = Number(line?.time) || 0;
  const end = Math.max(start + 600, Number(endAtMs?.(index)) || start + 3200);
  const rnd = mulberry32(hashStr(index + ":" + text));
  const seed2 = mulberry32(hashStr(text + "@" + (index & 7)));

  // —— 行带：只决定**垂直顺序**（第 index 行落在第 index % bands 条横带上）；
  //    真正的"不重叠"由 planLines() 拿占位矩形解出来（见文件头第 3 条）——
  //    别的行可以引用这一句（当前句会被后面几行引用），所以这里给的 y 必须是
  //    **与窗口无关**的，否则同一句在计划缓存里会出现两套 y。
  const bands = Math.max(2, Math.round(opt.bands || LYRIC_BANDS));
  const band = ((index % bands) + bands) % bands;
  const top = typeof opt.top === "number" ? opt.top : BAND_TOP;
  const bottom = typeof opt.bottom === "number" ? opt.bottom : BAND_BOTTOM;
  const step = (bottom - top) / (bands - 1);
  const bandCenter = top + band * step;
  // node.y 是相对画面焦点（40% 高度）的比例（舞台坐标：0 = 正中）
  const nodeY = bandCenter - 0.4;

  // —— 宽度估算 ——
  //     ★ 两个宽度，别混：
  //       textWidthEm = 字面宽度，用来决定"整句要不要缩小才不出画"；
  //       slotWidthEm = **画出来**的宽度（字素被 scale/rotate 放大之后），
  //                     用来决定占位矩形与行内格子的分配。
  //       transform 不参与布局，所以只按字面算的话，放大的字必然盖住邻居。
  const textWidthEm = estimateWidthEm(text) || 1;
  const availableEm = Math.max(6, Number(opt.availableEm) || 40);
  // 1.04 是安全余量：字体度量与经验表有 ±10% 的出入，宁可略微缩一点。
  const fit = clamp((availableEm / textWidthEm) * 1.04, 0.42, 1);
  const emToStageW = Number(opt.emToStageW) || 0.02;

  // 水平落点：在"不出画"的范围内左右散开（spread 大的段落散得更开）
  const side = hashStr(text) & 1 ? 1 : -1;
  const wantX = side * (0.04 + rnd() * 0.18) * program.spread;
  // ★ 不倾斜：行一斜，垂直外接盒会变成 w·sinθ + h·cosθ（行很宽时大得离谱），
  //   把"不重叠"的保证和"歌词看清"的体验一起弄丢。倾斜交给每个字素
  //   （--ar-dr）与入场动画，整句保持水平。
  const nodeR = 0;
  const nodeS = program.sizeScale * fit * (0.98 + rnd() * 0.05);

  // —— 逐单元：时间 + 层级 + 入场方式 + 散落偏移 ——
  //    （放在宽度估算之前：占位矩形要用字素最终的缩放去算"画多宽"）
  const timeline = buildGraphemeTimeline(text, start, end);
  const count = timeline.length;
  const half = Math.max(0, (count - 1) / 2);
  const units = timeline.map((u, i) => {
    const roll = seed2();
    const tier = tierOf(u.kind, u.ch, program.keyChance, roll);
    const mode = program.modes[Math.min(program.modes.length - 1, Math.floor(seed2() * program.modes.length))];
    const wave = Math.sin((i - half) * 0.74) * program.waveY;
    // 英文的"关键词"放大要克制：一个单词放大后是往**两侧**长出去的，
    // 1.34 倍会把后面的空格吃掉，读起来就是"Rooftoprain"。中文逐字放大没这个问题
    // （字面本身有侧边空隙），所以两种粒度用两套倍数。
    // ★ 这里的缩放是**画上去的**（transform: scale），不参与布局 —— 一个字素
    //   被放大到 1.34 倍时，它画出来比自己的排版格子宽 34%，于是必然压到邻居
    //   身上（实测：相邻汉字横向重叠 0.8~8px、纵向重叠 28px，整行 53 处）。
    //   所以这一档必须**同时**给出"画多大"，让 planLine 把格子按最大的那个
    //   字素一起放大（见 charSlotEm）—— 布局与绘制用同一个数，才不会溢出去。
    const keyScale = u.kind === "word" ? 1.1 : 1.3;
    const baseScale = tier === "key" ? keyScale : tier === "link" ? (u.kind === "word" ? 0.94 : 0.8) : 1;
    // 空格单元保持中性：它是词与词之间的呼吸，不参与散落 / 放大 / 倾斜
    const isSpace = u.kind === "space";
    const ds = isSpace ? 1 : baseScale * (0.95 + seed2() * 0.08);
    const dr = isSpace ? 0 : (seed2() - 0.5) * program.jitterR;
    // 横向散落从 ±0.1em 收到 ±0.06em：太大就是"每个字在乱窜"
    const dx = isSpace ? 0 : (seed2() - 0.5) * 0.12;
    return {
      ch: u.ch,
      kind: u.kind,
      time: u.time,
      dur: u.dur,
      tier,
      mode,
      // dx/dy 用 em：会跟着字号（以及窗口适配倍数）一起缩放，不需要 JS 换算
      dx,
      dy: isSpace ? 0 : wave + (seed2() - 0.5) * program.jitterY * 0.5,
      dr,
      ds,
      // 字面 + 倾斜外接盒之外要多占多少（em，单侧）—— 交给 CSS 的 padding
      // 空格只是词与词的呼吸，不放大也不倾斜 —— 不需要补格子
      pad: isSpace ? 0 : unitPadEm(u.ch, ds, dr, dx, mode),
      delayMs: Math.max(0, Math.round(u.time - start)),
      durMs: Math.round(Math.max(300, Math.min(900, u.dur * 2.6 + 220))),
    };
  });

  // 首次落点：按自己的宽度在"不出画"的范围内散开（还没有和其它行求解）。
  // ★ 宽度用 **slotWidthEm**（画出来的宽度，含字素缩放）而不是字面的宽度：
  //   字素被 scale 放大后画得比排版格子宽，只按字面算就会漏判重叠。
  // jitterY / waveY 会让每个字上下散开，盒高也要把它们算进去。
  const slotWidthEm = estimateSlotWidthEm(units) || textWidthEm;
  const spreadEm = program.jitterY * 0.5 + program.waveY;
  const box = lineBox(0, nodeY, slotWidthEm, nodeS, emToStageW, spreadEm);
  const nodeX = clamp(wantX, -(0.47 - box.w / 2), 0.47 - box.w / 2);
  // node 与 box 是同一件事的两套坐标，这里同步写回（求解器之后只动 box → node）
  box.x = nodeX + 0.5;

  return {
    index,
    section,
    band,
    start,
    end,
    text,
    fit,
    widthEm: textWidthEm,
    /** 画出来的宽度（含字素缩放）：占位矩形与行内格子都按它分配 */
    slotWidthEm,
    /** 字素的纵向散落幅度（em）：planLines 直接复用，不重算 */
    spreadEm,
    node: { x: nodeX, y: nodeY, r: nodeR, s: nodeS },
    program,
    units,
    /** 占位矩形（**视口比例**坐标）：重排与自检都用它判断"会不会叠在一起" */
    box,
    /** 这一句的中心点（视口比例），镜头就用它当目标 */
    focus: { x: nodeX, y: nodeY },
  };
}

/**
 * 一排行的舞台计划，已经**解过重叠**（这就是"渲染之前先判断"的那一步）。
 *
 * 输入除了行本身，还有两块信息：
 *   · 角落里那两块 HUD 的留白（舞台比例）—— 歌词不许压到曲名 / 段落名上；
 *   · 已经"唱完并封印到外环"的行 —— 它们虽然淡出了，但两个都不透明的矩形
 *     压在一起还是看得见的，所以一并发给求解器。
 *
 * 求解的结果按 index 写回 node / focus / box：
 *   1. 躲角落；2. 互相推开；3. 夹回舞台边缘。
 * 视觉一致性由"短句让长句"保证 —— 两个矩形相交时，窄的那个让得多，
 * 于是歌曲常见的"一句长一句短"不会出现长句来回横跳。
 *
 * ★ 坐标一律是**视口比例**（0~1），求解出的落点再换算回 node 坐标写进
 *   plan.node —— 两套坐标只在这一个函数里碰面。
 *
 * @param {Array<any>} lines 行计划（planLine 的返回值）
 * @param {Partial<{top:number,bottom:number,emToStageW:number,edgeX:number,corners:Array<{x:number,y:number,w:number,h:number}>,blocked:Array<{x:number,y:number,w:number,h:number}>}>} [layout]
 * @returns {Map<number,{x:number,y:number,w:number,h:number}>} 视口比例坐标
 */
export function planLines(lines, layout) {
  /** @type {any} */
  const opt = layout || {};
  /** @type {any[]} */
  const src = Array.isArray(lines) ? lines : [];
  const emToStageW = Number(opt.emToStageW) || 0.02;
  const items = [];
  const plans = [];
  for (const line of src) {
    if (!line) continue;
    const text = String(line.text ?? "");
    // ★ 宽度、字号倍数、散落幅度**全部复用 planLine 算好的那一份**，这里一个都
    //   不重算。理由：重算就会漂 —— 比如这里再乘一次 program.sizeScale，
    //   得到的矩形比 planLine 首次落点宽 20%，求解结果就会突然跳一下。
    //   plan 是唯一的事实来源，planLines 只负责"挪位置"。
    const widthEm = Number(line.slotWidthEm) || estimateWidthEm(text) || 1;
    const nodeS = Math.max(0.2, Number(line.node && line.node.s) || 1);
    // ★ 起点用这一句**原本的行带 y**（planLine 已经按 index % bands 算好）——
    //   这里写死 0 的话，全屏的行会一起挤在画面 40% 高那条线上，求解器再努力
    //   也只是把它们上下摊开，最初那套"下一句在下一行"的阅读顺序就没了。
    const nodeY = Number(line.node && line.node.y) || 0;
    const program0 = line.program || SECTION_PROGRAMS.verse;
    const spreadEm =
      Number.isFinite(line.spreadEm) && line.spreadEm >= 0
        ? line.spreadEm
        : program0.jitterY * 0.5 + program0.waveY;
    const box = lineBox(0, nodeY, widthEm, nodeS, emToStageW, spreadEm);
    // 散开的水平落点（在"不出画"的范围里）：spread 大的段落散得更开
    const side = hashStr(text) & 1 ? 1 : -1;
    const program = line.program || SECTION_PROGRAMS.verse;
    const halfW = Math.min(0.47, box.w / 2);
    const wantX = clamp(
      side * (0.04 + ((hashStr("x" + text) % 1000) / 1000) * 0.18) * program.spread,
      -(0.47 - halfW),
      0.47 - halfW
    );
    const item = {
      index: line.index,
      x: wantX + 0.5,
      y: box.y,
      w: box.w,
      h: box.h,
    };
    items.push(item);
    plans.push({ line, item });
  }
  // 已封印到外环的行：也当成占位矩形（它们还在画面里，只是很淡）
  for (const blocked of Array.isArray(opt.blocked) ? opt.blocked : []) {
    if (blocked) items.push({ index: -1, x: blocked.x, y: blocked.y, w: blocked.w, h: blocked.h });
  }
  // ★ 默认值必须是**视口比例**的那一套（0.14 / 0.66）。早先残留着舞台坐标的
  //   -0.26 / 0.26：那会让 top > bottom，clampY 的上下界整个反过来，
  //   躲角落那一步推导出的位移全被"夹"回原点 —— 长句就永远压着曲名不放。
  layoutLineBoxes(items, {
    top: Number.isFinite(opt.top) ? opt.top : 0.14,
    bottom: Number.isFinite(opt.bottom) ? opt.bottom : 0.66,
    edgeX: Number.isFinite(opt.edgeX) ? opt.edgeX : 0.47,
    corners: opt.corners,
  });
  const out = new Map();
  for (const p of plans) {
    const node = boxToNode(p.item);
    p.line.node.x = node.x;
    p.line.node.y = node.y;
    p.line.focus.x = node.x;
    p.line.focus.y = node.y;
    p.line.box = { x: p.item.x, y: p.item.y, w: p.item.w, h: p.item.h };
    out.set(p.line.index, p.line.box);
  }
  return out;
}

/* ==========================================================================
   法阵外圈的那圈波纹：把整条频谱摊到圆周上
   --------------------------------------------------------------------------
   需求原文：「魔法阵周围有一圈波纹线条随着旋律而起伏 —— 起伏要看得出来」。
   这里解决的是**怎么让起伏大得起来**，绘制在 arcanum-scene.js 里。

   两个关键点：

     · **不转圈**。波纹由旋律驱动，那就让"波峰"停在原地上下起伏；整体旋转
       只会让眼睛去追一圈在跑的东西，反而看不出哪里在起伏（旋转留给法阵自己
       的同心圆环，它们本来就该转）。

     · **按频率轴映射，不是镜像**。早先的映射是 |2k-1|（左右各摊一遍频谱），
       于是正对低频的地方一条大鼓包、正对高频的地方一条小鼓包 —— 而且低频那
       一大块把周围的采样点全盖住了，画出来更像"一边鼓起来了"而不是"在起伏"。
       现在把圆周切成 3 段（0°~120° / 120°~240° / 240°~360°），每段各自从头
       到尾铺一遍整条频谱，而且**首尾都落在最安静的两头**，接缝天然平滑，
       看起来就是绕圈的三条声浪。

   幅度谱 → 位移：位移 = 半径 × 幅度 × 强度 ×（0.34 + 0.66 × …）
   "强度"取全曲能量（energy）与歌词重拍（tempoPulse）—— 安静段落波纹贴近
   基线，副歌一到整圈明显起伏，这就是"看得出来"的那一档。
   ========================================================================== */

/** 圆周上铺几遍频谱（见文件头：「三段」） */
export const WAVE_SEGMENTS = 3;
/** 波纹采样点：越少越平、越多越细；72 在整窗与桌面背景上都够细腻 */
export const WAVE_POINTS = 72;
/**
 * 起伏增益：径向位移 = 半径 × 幅度 × WAVE_GAIN × 强度。
 * ★ 这个数就是"起伏看不看得出来"的总开关：0.09 时最大位移只有半径的 9%
 * （约 20px，和一条线宽差不多，等于没有）；0.3 时满幅有半径的 30%，
 * 安静段落也有 10% 左右的持续起伏。
 */
export const WAVE_GAIN = 0.42;

/**
 * 圆周上第 i 个采样点对应频谱里的哪一个下标（把整条频谱按频率轴铺开）。
 * @param {number} i 采样点序号
 * @param {number} n 采样点总数
 * @param {number} bandCount 频谱段数
 */
export function waveBandIndex(i, n, bandCount) {
  const count = Math.max(1, Math.round(bandCount || 1));
  const total = Math.max(1, Math.round(n || 1));
  const k = (((i % total) + total) % total) / total;
  // 段内位置（0~1）→ 频谱下标：0 与 1 都落在"安静的两头"，接缝处不会有断崖
  const seg = (k * WAVE_SEGMENTS) % 1;
  return Math.min(count - 1, Math.max(0, Math.round(seg * (count - 1))));
}

/**
 * 推进一格波形（快起慢落 = 像"声浪"而不是"抖动"）。
 * @param {Float32Array|number[]} wave 会被就地修改
 * @param {number} i 采样点序号
 * @param {number} target 目标值（频谱幅度或回退波形）
 * @param {number} [up] 上升速率
 * @param {number} [down] 下降速率
 */
export function stepWaveValue(wave, i, target, up = 0.5, down = 0.12) {
  const want = clamp(Number(target) || 0, 0, 1);
  const prev = Number(wave[i]) || 0;
  wave[i] = prev + (want - prev) * (want > prev ? up : down);
  return wave[i];
}

/**
 * 拿不到频谱时的回退波形（没有 WebAudio 的宿主里，波纹仍然随句子起伏）。
 * 形状是三条低频声波 —— 与真频谱的"低频高、高频低"同一个量级。
 * @param {number} i 采样点序号
 * @param {number} n 采样点总数
 * @param {number} t 秒
 */
export function fallbackWave(i, n, t) {
  const k = (((i % n) + n) % n) / Math.max(1, n);
  return 0.26 + 0.24 * Math.sin(k * WAVE_SEGMENTS * Math.PI * 2 + t * 1.1);
}

/**
 * 这一帧每个采样点的目标幅度（0~1）。抽出来是为了让绘制与自检用同一套。
 * @param {object} s 帧状态（同 scene.frame 的入参）
 * @param {number} i 采样点序号
 * @param {number} n 采样点总数
 * @param {number} t 秒
 */
export function ringWaveTarget(s, i, n, t) {
  const bands = s && s.bands && s.bands.length ? s.bands : null;
  if (bands && s.bandsLive) {
    return clamp(Number(bands[waveBandIndex(i, n, bands.length)]) || 0, 0, 1);
  }
  const beat = clamp(Number(s && s.tempoPulse) || 0, 0, 1);
  return clamp(fallbackWave(i, n, t) + beat * 0.3, 0, 1);
}

/**
 * 波纹的起伏强度（0~1）：全曲能量 + 歌词重拍的合成。
 * @param {object} s 帧状态
 */
export function ringWaveIntensity(s) {
  const energy = clamp(Number(s && s.energy) || 0, 0, 1);
  const beat = clamp(Number(s && s.tempoPulse) || 0, 0, 1);
  // ★ 给一个 0.45 的**底**：安静段落也留着近一半的起伏幅度。
  //   早先从 0 起算，安静处振幅只有 R 的 10%（约 28px），和一条线宽差不多，
  //   看起来就是"这圈线几乎不动"—— 而需求要的是"起伏看得出来"。
  return clamp(0.45 + energy * 0.55 + beat * 0.25, 0, 1);
}

/**
 * 算出「镜头现在该看哪一句」。
 *
 * 规则来自需求：「最新歌词节点，提前 0.2~0.3 秒开始移动」。
 * 所以只要播放位置进入了下一句开始前的 lookahead 窗口，就把焦点交给下一句 ——
 * 镜头先动，字再出现。
 *
 * @param {Array<{time:number,text:string}>} lines
 * @param {number} positionMs
 * @param {number} [leadMs]
 * @returns {{ active:number, target:number }}
 */
export function resolveFocus(lines, positionMs, leadMs = 260) {
  const n = Array.isArray(lines) ? lines.length : 0;
  if (!n) return { active: -1, target: -1 };
  const pos = Number(positionMs) || 0;
  let active = -1;
  for (let i = 0; i < n; i += 1) {
    if (Number(lines[i].time) <= pos) active = i;
    else break;
  }
  const next = active + 1;
  if (next < n && Number(lines[next].time) - pos <= leadMs) {
    return { active, target: next };
  }
  return { active, target: active };
}
