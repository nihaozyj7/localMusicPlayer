/* ==========================================================================
   magic-circle/lib/layout.js — 歌词 → 世界坐标（节点排布）
   --------------------------------------------------------------------------
   两条铁律（都是这次按使用者反馈改出来的）：

   1. **一句歌词 = 一个节点**，下标与 lyrics().index 严格对齐 ——
      连空文本的行也不能丢，丢一行后面的行号就全错位了。
   2. **间距由时间间隔决定**：
        step = clamp(stepMin, stepPerSec × 间隔秒, stepMax)
      两句贴得近 → 摆得近（快切跟得上唱速）；隔得久 → 才允许飞远
      （大跳转才有理由存在）。半径沿一条平滑鼓起的螺旋走，所以两节点的
      直线距离 ≈ step —— 距离是**受控**的，不会出现“唱上一句还没飞到就换下一句”。

   分段（主歌 / 预副歌 / 副歌 / 桥段 / 尾奏）只用来：
     · 在 HUD 上标当前段落；
     · 指定几处定点运镜（副歌第一句 rotate、最后一个副歌 pass）。

   ★ 想给某首歌手调位置：改 config.js 的 LAYOUT.nodes（见那里的示例）。
   ========================================================================== */

// 子模块依赖同样要透传 token（原因见 skin.js 顶部那段说明）
const Q = new URL(import.meta.url).search;
const { LAYOUT, TRANSITIONS } = await import(`./config.js${Q}`);
const { clamp } = await import(`./util.js${Q}`);

/** 段角色 → HUD 上的小标题 */
export const ROLE_NAMES = {
  verse: "主歌",
  pre: "预副歌",
  chorus: "副歌",
  bridge: "桥段",
  outro: "尾奏",
  center: "阵心",
  solo: "待机",
};

/**
 * 把歌词行切成段（只影响段落标签与定点运镜，不影响坐标）。
 *
 * 两条规则同时生效：
 *   · 相邻两行间隔 ≥ sectionGapSec 秒 → 必须在这里断（乐句之间真正的留白）；
 *   · 一段最多 maxSectionLines 行   → 没有留白也定期换段（段落标签别太长）。
 *
 * @param {Array<{time:number,text:string}>} rows
 */
function splitSections(rows) {
  const out = [];
  let start = 0;
  for (let i = 1; i <= rows.length; i += 1) {
    const atEnd = i === rows.length;
    const tooLong = i - start >= LAYOUT.maxSectionLines;
    const bigGap = i < rows.length && rows[i].time - rows[i - 1].time >= LAYOUT.sectionGapSec * 1000;
    if (!atEnd && !tooLong && !bigGap) continue;
    out.push({ from: start, to: i, gapBefore: start > 0 ? rows[start].time - rows[start - 1].time : 0 });
    start = i;
  }
  return out;
}

/**
 * 给每个段分配角色与定点运镜。
 *
 * · 非末段按 roleCycle 循环（主歌 → 预副歌 → 副歌 → 回到主歌…）；
 * · 由 ≥ bridgeGapSec 的大留白带出来的段是「孤立桥段」（最后一段不吃这条）；
 * · 段数够多时最后一段判为尾奏（HUD 标签用；坐标照样走间隔规则）。
 *
 * @param {Array} sections
 */
function assignRoles(sections) {
  const total = sections.length;
  let lastChorus = -1;
  sections.forEach((sec, si) => {
    let role = LAYOUT.roleCycle[si % LAYOUT.roleCycle.length];
    if (si > 0 && sec.gapBefore >= LAYOUT.bridgeGapSec * 1000 && si < total - 1) role = "bridge";
    if (si === total - 1 && total >= 3) role = "outro";
    sec.role = role;
    if (role === "chorus") lastChorus = si;
  });
  // 定点运镜（**只有 rotate / pass 是无条件的**；zoomOut 还要在 pickTransition
  // 里过一道「间隔 ≥ gapArc」的闸 —— 短间隔绝不做三段式俯瞰）：
  //   · 副歌第一句绕目标公转入场（高潮句的仪式感）；
  //   · 全曲最后一个副歌的开头用穿越式 —— 全曲唯一一次白闪爆点。
  sections.forEach((sec, si) => {
    if (sec.role === "chorus") sec.entry = si === lastChorus && lastChorus > 0 ? "pass" : "rotate";
    else if (sec.role === "bridge" || sec.role === "outro") sec.entry = "zoomOut";
    else sec.entry = "";
    sec.name = ROLE_NAMES[sec.role] || sec.role;
  });
}

/** 两句之间该走多远（世界单位）——整套排布的核心公式 */
function stepFor(gapSec) {
  if (gapSec >= LAYOUT.bridgeGapSec) return LAYOUT.stepBridge;
  return clamp(LAYOUT.stepPerSec * gapSec, LAYOUT.stepMin, LAYOUT.stepMax);
}

/**
 * 半径随「歌的进度」平滑鼓起：内圈起步 → 中段外扩 → **尾部加速收回阵心**。
 *
 * 这里只管“走一条好看的螺旋”，真正控制两节点距离的是下面的 step + 夹角反解。
 *
 * @param {number} p 0..1（这句歌词在整首歌里的进度）
 */
function radiusAt(p) {
  const t = clamp(p, 0, 1);
  const swell = Math.sin(Math.PI * Math.pow(t, 0.9)); // 0 → 1 → 0
  const tail = 1 - Math.pow(t, 4); // 最后 15% 开始往里收，收尾才飞得回阵心
  return (LAYOUT.radiusMin + (LAYOUT.radiusMax - LAYOUT.radiusMin) * swell) * tail;
}

/**
 * 生成世界（节点 + 段）。
 *
 * 落点算法（这次按使用者反馈重写）：
 *   1. 这一句与上一句的间隔 → step（min 820 / 每秒 430 / max 3200，长留白 4600）；
 *   2. 半径朝“进度曲线”慢慢靠，**每步最多挪 step 的 45%** ——
 *      这样半径变化永远盖不过 step，距离不会失控；
 *   3. 由三边（半径、半径、step）反解圆心角：
 *          cosΔ = (r₁² + r₂² − step²) / (2·r₁·r₂)
 *      于是**直线距离严格等于 step**（够不着时先抬半径，再退化为对侧）。
 *
 * @param {Array<{time:number,text:string}>} lines 已解析的歌词行
 * @returns {{nodes: Array, sections: Array}}
 */
export function buildWorld(lines) {
  // ★ 只过滤“没有时间的行”（那是脏数据），**不按文本是否为空过滤**：
  //   宿主的 lyrics().index 是对着原始 lines 算的，少一行就会全面错位。
  const rows = (Array.isArray(lines) ? lines : []).filter((l) => l && typeof l.time === "number");

  // 没有歌词：整个世界只剩阵心一颗节点（画待机阵 + 空态文案）
  if (!rows.length) {
    const sections = [{ from: 0, to: 1, role: "solo", name: ROLE_NAMES.solo, entry: "" }];
    return { sections, nodes: [makeNode(0, 0, 0, 0, "solo", 0, null, "")] };
  }

  // ★ 手调模式：config 里给了 nodes 就完全听它的
  if (Array.isArray(LAYOUT.nodes) && LAYOUT.nodes.length) {
    return handPlaced(rows, LAYOUT.nodes);
  }

  const sections = splitSections(rows);
  assignRoles(sections);

  const t0 = rows[0].time;
  const span = Math.max(1, rows[rows.length - 1].time - t0);

  const nodes = [];
  let angle = -Math.PI / 2; // 从正上方起步
  let radius = 0;
  let prevRadius = 0;
  let prevTime = null;
  let secAt = 0; // 当前行落在第几段（sections 有序，指针跟着走）

  for (let i = 0; i < rows.length; i += 1) {
    while (secAt + 1 < sections.length && i >= sections[secAt].to) secAt += 1;
    const sec = sections[secAt];

    const progress = clamp((rows[i].time - t0) / span, 0, 1);
    const targetR = radiusAt(progress);

    if (i === 0) {
      radius = targetR;
    } else {
      const gapSec = clamp((rows[i].time - prevTime) / 1000, 0, 120);
      const step = stepFor(gapSec);
      // 半径朝目标慢慢靠，每步最多挪 step 的 45%（距离必须由 step 说了算）
      radius = clamp(radius + clamp(targetR - radius, -step * 0.45, step * 0.45), 150, LAYOUT.radiusMax);
      // 两个下界，缺一不可：
      //   ① step − prevR：两侧加起来至少够得着（否则对侧也够不到，距离会缩水）；
      //   ② 0.78·step：防止半径比 step 的一半还小 —— 那样 cosΔ 会被夹到 −1，
      //      每步转 180°，相邻两句会在两个点上来回弹（已经踩过一次）。
      radius = Math.max(radius, step - prevRadius, step * 0.78);
      radius = Math.min(radius, LAYOUT.radiusMax);
      // 三边反解圆心角 → 直线距离严格 = step
      const cos = (prevRadius * prevRadius + radius * radius - step * step) / (2 * prevRadius * radius);
      angle += Math.acos(clamp(cos, -1, 1));
    }

    const isLast = i === rows.length - 1;
    const toCenter = isLast && LAYOUT.returnToCenter;
    const x = toCenter ? 0 : Math.cos(angle) * radius;
    const y = toCenter ? 0 : Math.sin(angle) * radius;
    const role = toCenter ? "center" : sec.role;
    // 只有段首那句带定点运镜
    const entry = toCenter ? "" : i === sec.from ? sec.entry : "";

    nodes.push(makeNode(i, x, y, secAt, role, i - sec.from, rows[i], entry));
    prevRadius = radius;
    prevTime = rows[i].time;
  }

  return { nodes, sections };
}

/** 造一个节点（状态机字段一并给全，运行期只改不建） */
function makeNode(i, x, y, section, role, posInSection, line, entry) {
  return {
    i,
    x,
    y,
    section,
    role,
    posInSection,
    entry,
    line,
    /** 角色给的默认缩放（实际 zoom 还要按歌词长度微调） */
    zoomHint: LAYOUT.zoomByRole[role] ?? 1,
    /** idle | approaching | active | passing */
    state: "idle",
    /** 进入当前状态的时刻（秒），文字聚合 / 碎裂按它推进 */
    stateAt: 0,
    /** 文字布局缓存（measure 一次，见 render.js） */
    layout: null,
    /** 预渲染出来的字形位图（按需建、闲置即弃，见 render.js） */
    glyphs: null,
    /** 这一轮镜头的目标缩放（预渲染字形要按它出图才清晰） */
    targetZoom: 0,
    /** 悬停态（鼠标移到节点上） */
    hover: 0,
  };
}

/** 手调数组 → 节点（lyric 字段可省略，按行号对齐） */
function handPlaced(rows, spec) {
  const sections = [{ from: 0, to: spec.length, role: "verse", name: ROLE_NAMES.verse, entry: "" }];
  const nodes = spec.map((p, i) => {
    const line = p.lyric != null ? { time: p.time ?? rows[i]?.time ?? 0, text: String(p.lyric) } : rows[i] || null;
    const node = makeNode(i, Number(p.x) || 0, Number(p.y) || 0, 0, p.role || "verse", i, line, p.transition || "");
    if (Number.isFinite(Number(p.zoom))) node.zoomHint = Number(p.zoom);
    return node;
  });
  return { nodes, sections };
}

/**
 * 两句之间的时间间隔（秒）。行没时间 / 反过来（脏数据）都按 0 处理。
 *
 * @param {Array} nodes
 * @param {number} fromIdx
 * @param {number} toIdx
 */
export function gapSecBetween(nodes, fromIdx, toIdx) {
  const a = nodes[fromIdx];
  const b = nodes[toIdx];
  if (!a?.line || !b?.line) return 0;
  return Math.max(0, (b.line.time - a.line.time) / 1000);
}

/**
 * 选一个入场运镜 —— **按时间间隔分档**，不按“看起来多远”：
 *
 *   d ≤ panMax            → pan    几乎原地，滑一下
 *   间隔 ≥ gapArc         → zoomOut 拉远俯瞰 → 平移 → 聚焦（**只给长间隔**）
 *   间隔 ≥ gapDash        → arc    弧线飞行
 *   否则                  → dash   快切（短间隔专用，绝不拉远）
 *
 * 定点运镜优先，但 **zoomOut 型的定点会被间隔闸拦一次** —— 段首恰好紧跟
 * 一句短间隔时不做俯瞰，改走上面的分档（这是使用者明确要的：短间隔别用
 * “放大→移动→缩小聚焦”）。
 *
 * @param {Array} nodes
 * @param {number} fromIdx
 * @param {number} toIdx
 * @returns {string} pan | dash | arc | zoomOut | rotate | pass
 */
export function pickTransition(nodes, fromIdx, toIdx) {
  const a = nodes[fromIdx];
  const b = nodes[toIdx];
  if (!b) return "pan";
  const gap = gapSecBetween(nodes, fromIdx, toIdx);
  const dist = a ? Math.hypot(b.x - a.x, b.y - a.y) : Infinity;

  if (b.entry && TRANSITIONS[b.entry]) {
    const isPullBack = b.entry === "zoomOut";
    if (!isPullBack || gap >= TRANSITIONS.gapArc) return b.entry;
  }
  if (b.role === "center" && gap >= TRANSITIONS.gapArc) return "zoomOut";
  if (!a) return gap >= TRANSITIONS.gapArc ? "zoomOut" : "arc";

  if (dist <= TRANSITIONS.panMax) return "pan";
  if (gap >= TRANSITIONS.gapArc) return "zoomOut";
  if (gap >= TRANSITIONS.gapDash) return "arc";
  return "dash";
}

/**
 * 提前量（秒）：镜头要比这句**开口早到**这么久。
 * 转场时长直接用它 —— 于是「唱到的时候镜头已经停稳、字也拼完了」。
 *
 * @param {number} gapSec 到下一句的间隔
 */
export function leadFor(gapSec) {
  return clamp(gapSec * TRANSITIONS.leadRatio, TRANSITIONS.leadMin, TRANSITIONS.leadMax);
}

/**
 * 焦点该落在哪一句 —— 「提前量抢跑」的判定（纯函数，方便单测）：
 *
 *   · 正常 = 已经唱到的那一句（与宿主 findLyricIndex 同口径）；
 *   · 一旦进入下一句的提前量窗口（下一句开口前 leadFor(gap) 秒），就抢跑：
 *     这时候镜头起飞，转场时长 = 提前量，飞完刚好是开口那一刻。
 *
 * 短间隔（2~3 秒）全靠这个才来得及：等开口才起飞，词都唱到一半还在飞。
 *
 * @param {Array} nodes
 * @param {number} estMs 估算的播放位置（ms）
 * @returns {number} -1 表示一句都还没到
 */
export function focusAt(nodes, estMs) {
  if (!nodes.length) return -1;
  if (!nodes.some((n) => Boolean(n.line))) return 0;

  const cur = indexOfTime(nodes, estMs);
  const next = nodes[cur + 1];
  if (!next || !next.line) return cur;
  const base = cur >= 0 && nodes[cur].line ? nodes[cur].line.time : 0;
  const gapSec = Math.max(0, (next.line.time - base) / 1000);
  return estMs >= next.line.time - leadFor(gapSec) * 1000 ? cur + 1 : cur;
}

/**
 * 按播放位置找“当前唱到第几句”（与宿主 findLyricIndex 同口径：
 * 最后一个 time ≤ pos 的行；一个都没到 → -1）。
 *
 * 节点按时间升序排，所以线性扫 + 提前 break 就够了。
 *
 * @param {Array} nodes
 * @param {number} posMs
 */
export function indexOfTime(nodes, posMs) {
  let k = -1;
  for (let i = 0; i < nodes.length; i += 1) {
    const t = nodes[i].line?.time;
    if (typeof t !== "number") continue;
    if (t > posMs) break;
    k = i;
  }
  return k;
}

/**
 * 文字占屏比例 → 目标 zoom（让不同长短的歌词在屏幕上一样大）。
 *
 * @param {number} textWidth 文字的世界宽度
 * @param {number} stageW 舞台宽（CSS px）
 * @param {number} hint 角色缩放（作为上下限的锚点）
 */
export function zoomForText(textWidth, stageW, hint) {
  if (!(textWidth > 0) || !(stageW > 0)) return hint;
  const target = stageW * 0.6;
  const base = clamp(target / textWidth, 0.18, 2.4);
  return clamp(base * (0.85 + hint * 0.25), 0.16, 2.6);
}
