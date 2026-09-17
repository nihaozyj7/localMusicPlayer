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
        ★ **按"行带"分配**：第 index 行固定落在第 (index % LYRIC_BANDS) 条横带上。
        这是"歌词不重叠"的**结构性保证** —— 只要同屏显示的行数 ≤ 行带数，
        相邻两句就不可能落在同一条带里（也就不可能压在一起），
        而"下一句在下一行"的阅读顺序天然成立。带内再做一点水平/垂直抖动，
        看起来仍然是散落在空中的咒语，而不是一张表格。

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

/** 歌词行带：同屏最多显示这么多行（= 不可能重叠） */
export const LYRIC_BANDS = 6;
/** 行带占舞台高度的范围（比例）：0.15 → 0.66 */
export const BAND_TOP = 0.15;
export const BAND_BOTTOM = 0.66;

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
export const SECTION_PROGRAMS = {
  verse: {
    label: "主歌",
    arrayAlpha: 0.34,
    spin: 0.5,
    particles: 0.5,
    sizeScale: 0.92,
    spread: 0.8,
    jitterY: 0.18,
    waveY: 0.05,
    jitterR: 5,
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
    jitterY: 0.22,
    waveY: 0.07,
    jitterR: 7,
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
    jitterY: 0.3,
    waveY: 0.1,
    jitterR: 9,
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
    jitterY: 0.26,
    waveY: 0.08,
    jitterR: 8,
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
    jitterY: 0.16,
    waveY: 0.04,
    jitterR: 4,
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
export function mulberry32(seed) {
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
 * 大概占多宽（em）。用来：
 *   · 估出这一行会不会顶到舞台边上（超了就整体缩小一点，而不是让它出画）；
 *   · 行带内计算水平落点。
 * 数值是经验值（比 font-size:1em 略小，因为字面通常有侧边空隙）。
 */
export function charWidthEm(ch) {
  const c = String(ch ?? "");
  if (!c) return 0;
  if (RE_SPACE.test(c)) return 0.32;
  if (RE_CJK.test(c)) return 1;
  if (RE_PUNCT.test(c)) return 0.5;
  if (RE_LATIN.test(c)) return 0.56;
  return 0.7;
}

export function estimateWidthEm(text) {
  const chars = splitGraphemes(text);
  let w = 0;
  for (const ch of chars) w += charWidthEm(ch);
  return w;
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
  const text = String(line?.text ?? "");
  const start = Number(line?.time) || 0;
  const end = Math.max(start + 600, Number(endAtMs?.(index)) || start + 3200);
  const rnd = mulberry32(hashStr(index + ":" + text));
  const seed2 = mulberry32(hashStr(text + "@" + (index & 7)));

  // —— 行带：这是"不重叠"的结构性保证（见文件头第 3 条）——
  const bands = Math.max(2, Math.round(opt.bands || LYRIC_BANDS));
  const band = ((index % bands) + bands) % bands;
  const top = typeof opt.top === "number" ? opt.top : BAND_TOP;
  const bottom = typeof opt.bottom === "number" ? opt.bottom : BAND_BOTTOM;
  const step = (bottom - top) / (bands - 1);
  const bandCenter = top + band * step;
  // node.y 是相对画面焦点（40% 高度）的比例
  const nodeY = bandCenter - 0.4 + (rnd() - 0.5) * step * 0.22;

  // —— 宽度估算 → 超宽的句子整体缩一点，并且不许顶出画 ——
  const widthEm = estimateWidthEm(text) || 1;
  const availableEm = Math.max(6, Number(opt.availableEm) || 40);
  const fit = clamp(availableEm / widthEm, 0.42, 1);
  const emToStageW = Number(opt.emToStageW) || 0.02;
  const halfW = Math.min(0.46, (widthEm * fit * emToStageW) / 2);

  const side = hashStr(text) & 1 ? 1 : -1;
  const wantX = side * (0.02 + rnd() * 0.12) * program.spread;
  const nodeX = clamp(wantX, -0.5 + halfW, 0.5 - halfW);
  const nodeR = (rnd() - 0.5) * 3.4;
  const nodeS = program.sizeScale * fit * (0.98 + rnd() * 0.05);

  // —— 逐单元：时间 + 层级 + 入场方式 + 散落偏移 ——
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
    const keyScale = u.kind === "word" ? 1.1 : 1.34;
    const baseScale = tier === "key" ? keyScale : tier === "link" ? (u.kind === "word" ? 0.94 : 0.78) : 1;
    // 空格单元保持中性：它是词与词之间的呼吸，不参与散落 / 放大 / 倾斜
    const isSpace = u.kind === "space";
    return {
      ch: u.ch,
      kind: u.kind,
      time: u.time,
      dur: u.dur,
      tier,
      mode,
      // dx/dy 用 em：会跟着字号（以及窗口适配倍数）一起缩放，不需要 JS 换算
      dx: isSpace ? 0 : (seed2() - 0.5) * 0.2,
      dy: isSpace ? 0 : wave + (seed2() - 0.5) * program.jitterY * 0.5,
      dr: isSpace ? 0 : (seed2() - 0.5) * program.jitterR,
      ds: isSpace ? 1 : baseScale * (0.95 + seed2() * 0.08),
      delayMs: Math.max(0, Math.round(u.time - start)),
      durMs: Math.round(Math.max(300, Math.min(900, u.dur * 2.6 + 220))),
    };
  });

  return {
    index,
    section,
    band,
    start,
    end,
    text,
    fit,
    widthEm,
    node: { x: nodeX, y: nodeY, r: nodeR, s: nodeS },
    program,
    units,
    /** 这一句的中心点（视口比例），镜头就用它当目标 */
    focus: { x: nodeX, y: nodeY },
  };
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
