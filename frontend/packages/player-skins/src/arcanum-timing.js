// @ts-check
/* ==========================================================================
   arcanum-timing.js — 「星阵咏唱」的时间轴与舞台剧本（纯计算，零 DOM）
   --------------------------------------------------------------------------
   这个模块回答三个问题，全部是纯函数，所以可以单测、也可以被别的样式复用：

     1. **每个字什么时候出现、出现多久？**
        宿主只给整行歌词（{ time, text }），没有逐字时间。这里按「字素权重」
        把行时长分配到每个字素上（CJK 满权、拉丁 0.62、标点 0.45、空白 0.35），
        并保证每个字素至少 MIN_UNIT_MS —— 否则逗号会和后一个字一起入场，
        把 endTime 也一起拖走（folia 的 tempera README 专门写过这个坑）。

     2. **这一句属于哪个段落？**（主歌 / 预副歌 / 副歌 / 桥段 / 尾奏）
        判据全部来自歌词本身，不依赖任何外部标记：
          · 同一句文本第二次出现 → 副歌（副歌就是会重复的那几句）；
          · 它前面 1~2 句 → 预副歌；
          · 与上一句的间隔超过中位间隔的 2.2 倍 → 桥段 / 间奏（乐句被拉开）；
          · 歌曲最后 12% → 尾奏。
        这样同一首歌每次打开都是同一套剧本（确定性），不需要用户配置。

     3. **这一句在舞台上怎么摆、每个字用哪种魔法入场？**
        planLine() 用「行号 + 文本」当种子生成一套确定性布局：节点位置、倾斜、
        每个字素的散落偏移与入场方式。同一首歌永远同一套（不会每次切歌都换一张
        构图），不同句之间又足够不同。
   ========================================================================== */

import { splitGraphemes } from "./fx-lyrics.js";

/** 每个字素最短占用的时间（ms）。低于它的字素（标点、空白）会向邻居借时间。 */
export const MIN_UNIT_MS = 90;

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
 * 把一行文本铺成一条逐字素时间轴。
 *
 * @param {string} text 行文本
 * @param {number} startMs 行起始（宿主给的 time）
 * @param {number} endMs 行结束（下一行的 time；没有下一行时由调用方给一个估计值）
 * @returns {Array<{ ch: string, time: number, dur: number }>}
 */
export function buildGraphemeTimeline(text, startMs, endMs) {
  const chars = splitGraphemes(text);
  const n = chars.length;
  if (!n) return [];
  const span = Math.max(240, Number(endMs) - Number(startMs) || 0);
  const weights = chars.map(unitWeight);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;

  /** @type {number[]} */
  const durs = weights.map((w) => (span * w) / sum);

  // 保证最短时长：把低于 MIN_UNIT_MS 的抬上来，多出来的时间从「当前最长」的那几个
  // 字素里按比例扣回（两轮足够收敛；不做更复杂的求解是因为这里不需要精确）。
  for (let pass = 0; pass < 2; pass += 1) {
    let deficit = 0;
    let longest = 0;
    for (let i = 0; i < n; i += 1) {
      if (durs[i] < MIN_UNIT_MS) {
        deficit += MIN_UNIT_MS - durs[i];
        durs[i] = MIN_UNIT_MS;
      } else if (durs[i] > longest) {
        longest = durs[i];
      }
    }
    if (deficit <= 0 || longest <= 0) break;
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
  let cursor = Number(startMs) || 0;
  for (let i = 0; i < n; i += 1) {
    out.push({ ch: chars[i], time: cursor, dur: durs[i] });
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

  // 间隔统计只取「正间隔」的中位数，异常间隔（拖进度条 / 缺行）不会带偏
  const gaps = [];
  for (let i = 1; i < src.length; i += 1) {
    const g = Number(src[i].time) - Number(src[i - 1].time);
    if (g > 0) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;

  // 计数：同一句出现第二次就是副歌
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
    // 长间隔 = 乐句被拉开：桥段 / 间奏
    const stretched = median > 0 && gap > median * 2.2 && gap > 3600;
    if (pos >= 0.88) out[i] = "outro";
    else if (stretched) out[i] = "bridge";
    else if (isRepeat(i)) out[i] = "chorus";
    else out[i] = "verse";
  }

  // 副歌前面 1~2 句 → 预副歌（情绪爬升段）
  for (let i = 0; i < n; i += 1) {
    if (out[i] !== "verse") continue;
    if (out[i + 1] === "chorus" || out[i + 2] === "chorus") out[i] = "pre";
  }

  // 最后一行如果是副歌就让它继续唱完，不硬切成尾奏
  if (n > 3 && out[n - 1] === "chorus") out[n - 1] = "chorus";
  return out;
}

/** 取某个字素这一行里使用的入场方式 / 层级（供 CSS 与自检读取） */
export function tierOf(ch, keyChance, roll) {
  const c = String(ch ?? "");
  if (!c || RE_SPACE.test(c)) return "link";
  if (RE_PUNCT.test(c)) return "link";
  if (RE_CJK.test(c)) return roll < keyChance * 2 ? "key" : "main";
  const len = c.length;
  if (len >= 2 || /[0-9]/.test(c)) return roll < keyChance ? "key" : "main";
  return roll < keyChance * 0.6 ? "key" : "main";
}

/**
 * 为一行歌词生成舞台计划（纯数据）。
 *
 * 坐标采用**归一化舞台坐标**：x/y 都是视口宽/高的比例（0 = 正中，
 * 0.12 = 向右 12% 视口宽）。皮肤拿它乘上自己的容器尺寸即可 ——
 * 这样主窗口（1280×820）与桌面背景（2560×1440）上是同一套构图比例。
 *
 * @param {{time:number,text:string}} line
 * @param {number} index 行号
 * @param {string} section 段落 id
 * @param {(i:number)=>number} endAtMs 取第 i 行的结束时间（通常是下一行的 time）
 */
export function planLine(line, index, section, endAtMs) {
  const program = SECTION_PROGRAMS[section] || SECTION_PROGRAMS.verse;
  const text = String(line?.text ?? "");
  const start = Number(line?.time) || 0;
  const end = Math.max(start + 600, Number(endAtMs?.(index)) || start + 3200);
  const rnd = mulberry32(hashStr(index + ":" + text));
  const seed2 = mulberry32(hashStr(text + "@" + (index & 7)));

  // —— 节点：整句在舞台上的落点 ——
  // 节点偏移刻意收得比较小：镜头只会把节点"拽向"焦点（lean ≈ 0.6），
  // 偏移太大时当前句会跑到画面边上，读起来就不是"焦点附近"了。
  const side = hashStr(text) & 1 ? 1 : -1;
  const nodeX = side * (0.03 + rnd() * 0.08) * program.spread;
  const nodeY = (rnd() - 0.5) * 0.13 * program.spread;
  const nodeR = (rnd() - 0.5) * 4.2;
  const nodeS = program.sizeScale * (0.98 + rnd() * 0.05);

  // —— 逐字素：时间 + 层级 + 入场方式 + 散落偏移 ——
  const timeline = buildGraphemeTimeline(text, start, end);
  const count = timeline.length;
  const half = Math.max(0, (count - 1) / 2);
  const units = timeline.map((u, i) => {
    const roll = seed2();
    const tier = tierOf(u.ch, program.keyChance, roll);
    const mode = program.modes[Math.min(program.modes.length - 1, Math.floor(seed2() * program.modes.length))];
    const wave = Math.sin((i - half) * 0.74) * program.waveY;
    const baseScale = tier === "key" ? 1.42 : tier === "link" ? 0.74 : 1;
    return {
      ch: u.ch,
      time: u.time,
      dur: u.dur,
      tier,
      mode,
      // dx/dy 用 em：会跟着字号（以及窗口适配倍数）一起缩放，不需要 JS 换算
      dx: (seed2() - 0.5) * 0.22,
      dy: wave + (seed2() - 0.5) * program.jitterY,
      dr: (seed2() - 0.5) * program.jitterR,
      ds: baseScale * (0.94 + seed2() * 0.1),
      delayMs: Math.max(0, Math.round(u.time - start)),
      durMs: Math.round(Math.max(300, Math.min(900, u.dur * 2.6 + 220))),
    };
  });

  return {
    index,
    section,
    start,
    end,
    text,
    node: { x: nodeX, y: nodeY, r: nodeR, s: nodeS },
    program,
    units,
    /** 这一句的中心点（视口比例），镜头就用它当目标 */
    focus: { x: nodeX, y: nodeY },
  };
}

/**
 * 交汇点：算出「镜头现在该看哪一句」。
 *
 * 规则来自需求：「最新歌词节点，提前 0.2~0.3 秒开始移动」。
 * 所以只要播放位置进入了下一句开始前的 lookahead 窗口，就把焦点交给下一句 ——
 * 镜头先动，字再出现，观感上是「镜头领着观众的视线」而不是被字拽着跑。
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
