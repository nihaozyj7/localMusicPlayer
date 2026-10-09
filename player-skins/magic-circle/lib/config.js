/* ==========================================================================
   magic-circle/lib/config.js — 全部可调参数（每首歌只改这一个文件即可）
   --------------------------------------------------------------------------
   设计约定：
     · 世界是固定大小的一张地图，歌词节点钉死在世界坐标上，镜头飞过去看它们；
     · 节点位置**默认按算法生成**（按歌词分段 + 螺旋外扩），但整份参数都暴露在
       这里 —— 想给某首歌手调路径，把 LAYOUT.nodes 换成自己的数组就行
       （见文件末尾的 NODES 示例）；
     · 所有数值单位都是「世界单位」（1 世界单位 = zoom 1 时的 1 屏幕像素）。
   ========================================================================== */

/** 世界大小与巨型底阵（贯穿全图的地基） */
export const WORLD = {
  /** 底阵半径：整张地图的“地基”就画在以原点为圆心、这个半径的圆内 */
  R: 5600,
  /** 同心环（底阵的骨架；节点落点尽量靠近环与辐条的交点） */
  RINGS: [900, 1800, 2700, 3600, 4500, 5600],
  /** 径向辐条数量（每 15° 一条） */
  SPOKES: 24,
  /** 星域的散布半径（比世界大一圈，保证拉远时画面四角不空） */
  STAR_R: 9400,
};

/** 歌词节点（每个节点 = 一个独立的小舞台） */
export const NODE = {
  /** 基座阵半径 */
  radius: 260,
  /** 外环刻度：长度 = tickMin + spec[i] * tickSpan */
  tickMin: 30,
  tickSpan: 220,
  /** 镜像层（i 与 127-i 对称）→ 一圈 256 根刻度 */
  mirrorTicks: true,
  /** 中环符文数量（midHi 频段逐个点亮） */
  runes: 12,
  /** 歌词文字的世界字号（过长时按 maxTextWidth 等比缩小） */
  fontSize: 110,
  /** 一行歌词最多占多少世界单位（超过就缩字号，而不是缩镜头） */
  maxTextWidth: 3200,
  /** 文字聚合成型 / 碎裂的时长（秒） */
  assembleSec: 0.8,
  shatterSec: 0.42,
  /** 文字碎裂后沿“镜头飞行方向”飘散的力度 */
  shatterDrift: 420,
};

/**
 * 节点排布策略（歌词 → 世界坐标）
 *
 * 分段：相邻两行歌词间隔 ≥ sectionGapSec 秒就切成新的一段
 *       （段 = 主歌 / 预副歌 / 副歌 / 桥段 / 尾奏）。
 *       完全没有大间隔时按 maxSectionLines 行一段切开，
 *       这样镜头每唱几句就会“向外飞一段”。
 */
export const LAYOUT = {
  /** ★ 手调数组：给了就完全按它排（lyric 可省略，按 index 对应第几行） */
  nodes: null,

  /** 歌词间隔超过这个秒数 → 分段 */
  sectionGapSec: 6,
  /** 没有大间隔时，每几行算一段（决定“向外飞”的节奏） */
  maxSectionLines: 5,
  /** 间隔超过这个秒数 → 这段是「孤立的桥段」（放一颗远离主图的孤星） */
  bridgeGapSec: 13,
  /** 同一段内相邻节点的角度步进（°）。越小镜头越像绕圈慢移 */
  angleStepDeg: 58,
  /** 进入新一段时，起始角度相对上一段末尾再跳多少（°） */
  sectionJumpDeg: 96,
  /** 各段的半径带（主歌内圈 → 副歌外圈，镜头一路向外飞） */
  bands: {
    verse: [1200, 2000],
    pre: [2350, 2950],
    chorus: [3300, 4500],
    bridge: [6100, 6100],
    outro: [2600, 300],
    center: [0, 0],
  },
  /** 段角色循环（最后一段强制以「回到阵心」收尾） */
  roleCycle: ["verse", "pre", "chorus"],
  /** 每种角色的默认镜头缩放（实际 zoom 还会按歌词长度微调，见 render） */
  zoomByRole: {
    verse: 1.0,
    pre: 0.95,
    chorus: 1.15,
    bridge: 0.82,
    outro: 0.7,
    center: 0.62,
    solo: 0.62,
  },
  /** 歌词最后一句永远落回阵心 (0,0)：整趟旅程“飞回中心”收束 */
  returnToCenter: true,
};

/** 运镜类型与时长（秒）—— 转场就是运镜，两者是同一件事 */
export const TRANSITIONS = {
  /** A · 短距离平移：直线 lerp + zoom 微调 */
  pan: { dur: 0.7 },
  /** B · 弧线飞行：二次贝塞尔 + zoom 先缩后放 */
  arc: { dur: 1.25 },
  /** C · 拉远俯瞰 → 平移 → 拉近（大跳转，能看到整张巨型底阵） */
  zoomOut: { dur: 1.9 },
  /** D · 旋转入场：绕目标公转 + 拉近（副歌第一句） */
  rotate: { dur: 0.9 },
  /** E · 穿越式：直接穿过旧节点，中途白闪（情绪爆点） */
  pass: { dur: 1.0 },
  /** 距离阈值（世界单位）：决定 A / B / C 怎么选 */
  panMax: 1600,
  arcMax: 4200,
  /** 穿越式的白闪强度与窗口（相对进度 0..1） */
  flashPeak: 0.5,
  flashWidth: 0.12,
};

/** 各层的视差系数（1 = 世界固定，<1 = 跟镜头走得慢 → 远景） */
export const PARALLAX = {
  stars: 0.2,
  base: 0.5,
  paths: 1,
  nodes: 1,
  worldParticles: 0.9,
};

/** 配色（频谱质心会在 baseHue 上再偏移 ±hueSwing） */
export const PALETTE = {
  bg0: "#04060d",
  bg1: "#070c1a",
  /** 低频（暖）→ 高频（冷）的色相区间，刻度环按 i 在这条区间里取色 */
  hueLow: 26,
  hueHigh: 206,
  sat: 74,
  light: 62,
  /** 频谱质心带来的整体色相偏移（±20°） */
  hueSwing: 20,
  /** 歌词文字颜色 */
  text: "rgba(236, 240, 255, 0.96)",
  textDim: "rgba(180, 196, 255, 0.55)",
  line: "rgba(122, 162, 255, 0.5)",
};

/** 性能档位 */
export const PERF = {
  /** 暂停（且没有转场在跑）时降到这个帧率 */
  idleFps: 20,
  /** 暂停多久之后彻底停帧（有补丁进来会立刻恢复） */
  idleStopMs: 9000,
  /** performance 档的默认帧率上限（清单 performance.budgetFps 优先） */
  budgetFps: 45,
  /** zoom 小于它时只画轮廓（LOD，拉远俯瞰用） */
  detailZoom: 0.2,
  /** 同屏最多画几个节点（按与镜头距离排序后再截断） */
  maxNodes: 14,
};

/** 粒子池容量（预分配，运行期不再 new 对象） */
export const POOL = {
  world: 1600,
  screen: 420,
};

/**
 * 交互：点节点 = 跳到那句歌词（interactive:false 的舞台自动忽略）。
 * 悬停半径按基座阵的这个倍数算。
 */
export const INTERACT = {
  hitScale: 1.15,
};

/* --------------------------------------------------------------------------
   手调示例：把 LAYOUT.nodes 换成下面这样的数组，就会完全按它排
   （transition 省略时按距离自动选 pan / arc / zoomOut）：

   export const HAND_PLACED = [
     { x:   900, y: -600, zoom: 1.0, lyric: "第一句歌词", transition: "pan" },
     { x:  1400, y:   200, zoom: 1.0, lyric: "第二句歌词", transition: "pan" },
     { x: -2800, y:     0, zoom: 1.2, lyric: "副歌第一句", transition: "zoomOut" },
     { x:  5800, y:  5800, zoom: 0.8, lyric: "桥段歌词",   transition: "zoomOut" },
     { x:     0, y:     0, zoom: 0.6, lyric: "最后一句",   transition: "zoomOut" },
   ];
   -------------------------------------------------------------------------- */
