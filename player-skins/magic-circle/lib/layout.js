/* ==========================================================================
   magic-circle/lib/layout.js — 歌词 → 世界坐标（节点排布）
   --------------------------------------------------------------------------
   做三件事：
     1. 把歌词行切成若干「段」（主歌 / 预副歌 / 副歌 / 桥段 / 尾奏）；
     2. 按段的半径带把每行钉到世界坐标上（段内螺旋推进，段间大跳）；
     3. 给每个节点标一个**入场运镜**（pan / arc / zoomOut / rotate / pass），
        具体走哪条由镜头在换段时读 node.entry 决定。

   ★ 想给某首歌手调位置：改 config.js 的 LAYOUT.nodes（见那里的示例）。
   ========================================================================== */

// 子模块依赖同样要透传 token（原因见 skin.js 顶部那段说明）
const Q = new URL(import.meta.url).search;
const { LAYOUT, TRANSITIONS } = await import(`./config.js${Q}`);
const { clamp, lerp } = await import(`./util.js${Q}`);

const DEG = Math.PI / 180;

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
 * 把歌词行切成段。
 *
 * 两条规则同时生效：
 *   · 相邻两行间隔 ≥ sectionGapSec 秒 → 必须在这里断（乐句之间真正的留白）；
 *   · 一段最多 maxSectionLines 行   → 即使没有留白也定期换段，
 *     这样镜头才会周期性地「向外飞一段」，而不是整首歌慢慢挪。
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
 * 给每个段分配角色。
 *
 * · 非末段按 roleCycle 循环（主歌 → 预副歌 → 副歌 → 回到主歌…），
 *   半径带因此会周期性地「向外扩 → 收回来」，与歌曲的呼吸一致；
 * · 由 ≥ bridgeGapSec 的大留白带出来的段是**孤立桥段**（放一颗远离主图的孤星）；
 *   最后一段不吃这条（尾声要回阵心，不该飞到地图外头去）；
 * · 段数够多时，最后一段改判为尾奏：半径一路收到阵心。
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
  // 入场运镜：
  //   · 桥段一律拉远俯瞰（跨段大跳）；
  //   · 副歌第一句绕目标公转入场（高潮句的仪式感）；
  //   · 全曲**最后一个副歌**的开头用「穿越式」—— 唯一一次白闪爆点；
  //   · 尾奏开头拉远俯瞰（回阵心是大跳转）。
  sections.forEach((sec, si) => {
    if (sec.role === "bridge") sec.entry = "zoomOut";
    else if (sec.role === "outro") sec.entry = "zoomOut";
    else if (sec.role === "chorus") sec.entry = si === lastChorus && lastChorus > 0 ? "pass" : "rotate";
    else sec.entry = "";
    sec.name = ROLE_NAMES[sec.role] || sec.role;
  });
}

/**
 * 生成世界（节点 + 段）。
 *
 * @param {Array<{time:number,text:string}>} lines 已解析的歌词行
 * @returns {{nodes: Array, sections: Array}}
 */
export function buildWorld(lines) {
  const rows = (Array.isArray(lines) ? lines : []).filter(
    (l) => l && typeof l.time === "number" && String(l.text ?? "").trim() !== ""
  );

  // 没有歌词：整个世界只剩阵心一颗节点（画待机阵 + 空态文案）
  if (!rows.length) {
    const sections = [{ from: 0, to: 1, role: "solo", name: ROLE_NAMES.solo, entry: "" }];
    return {
      sections,
      nodes: [makeNode(0, 0, 0, 0, "solo", 0, null, "")],
    };
  }

  // ★ 手调模式：config 里给了 nodes 就完全听它的
  if (Array.isArray(LAYOUT.nodes) && LAYOUT.nodes.length) {
    return handPlaced(rows, LAYOUT.nodes);
  }

  const sections = splitSections(rows);
  assignRoles(sections);

  const nodes = [];
  let angle = -Math.PI / 2; // 从正上方开始
  sections.forEach((sec, si) => {
    const band = LAYOUT.bands[sec.role] || LAYOUT.bands.verse;
    const count = sec.to - sec.from;
    if (si > 0) angle += LAYOUT.sectionJumpDeg * DEG;
    const stepDeg = sec.role === "bridge" ? LAYOUT.angleStepDeg * 0.5 : LAYOUT.angleStepDeg;
    const step = stepDeg * DEG;
    for (let j = sec.from; j < sec.to; j += 1) {
      const f = count > 1 ? (j - sec.from) / (count - 1) : 0.5;
      const radius = lerp(band[0], band[1], f);
      const isLast = j === rows.length - 1;
      const x = isLast && LAYOUT.returnToCenter ? 0 : Math.cos(angle) * radius;
      const y = isLast && LAYOUT.returnToCenter ? 0 : Math.sin(angle) * radius;
      const role = isLast && LAYOUT.returnToCenter ? "center" : sec.role;
      const entry = isLast && LAYOUT.returnToCenter ? "zoomOut" : j === sec.from ? sec.entry : "";
      nodes.push(makeNode(j, x, y, si, role, j - sec.from, rows[j], entry));
      angle += step;
    }
  });

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
 * 选一个入场运镜（节点自己的 entry 优先，其次按距离）。
 *
 * @param {Array} nodes
 * @param {number} fromIdx
 * @param {number} toIdx
 * @returns {string} pan | arc | zoomOut | rotate | pass
 */
export function pickTransition(nodes, fromIdx, toIdx) {
  const a = nodes[fromIdx];
  const b = nodes[toIdx];
  if (!b) return "pan";
  if (b.entry) return TRANSITIONS[b.entry] ? b.entry : "pan";
  if (b.role === "bridge" || b.role === "center") return "zoomOut";
  if (!a) return "zoomOut";
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (d <= TRANSITIONS.panMax) return "pan";
  if (d <= TRANSITIONS.arcMax) return "arc";
  return "zoomOut";
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
