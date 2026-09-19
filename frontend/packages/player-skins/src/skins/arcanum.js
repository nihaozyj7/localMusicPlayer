// @ts-check
/* ==========================================================================
   arcanum.js — 播放界面样式「星阵咏唱」（id: arcanum）
   --------------------------------------------------------------------------
   需求原文（这一版要推翻的东西）：「左封面右歌词」→「一个会运镜的魔法舞台，
   歌词是咒语，法阵是乐器，封面是背景」。落到实现上是四句话：

     · **歌词 = 咒语**：没有滚动列表。当前句被拆成字素散落在舞台空间里，
       每个字按自己的时间轴、用自己的「入场魔法」出现（十种方式见 CSS）；
       关键词大而亮，连接词小而暗。唱完的句子飞向法阵外环、缩成一枚符文淡出。
     · **法阵 = 乐器**：法阵画在 canvas 上，由频谱驱动的「奥术七元素」控制 ——
       低频震底座与裂纹、贝斯泛涟漪、中频起风线、高频亮星座、重拍炸脉冲环、
       长音立光柱、停顿落暗雾。
     · **镜头 = 观众视线**：镜头跟着最新歌词节点走（提前 0.26s 起步），
       有阻尼、有边界、有速度上限；副歌拉远、长音推近、重拍轻震。
     · **封面 = 整窗模糊背景**：封面不再占舞台里的任何一块位置
       （早先那版是"法阵中心的圆形水晶"），而是压在最底下的一层大半径模糊底图。
       它既然是背景就不再是控件 —— "更换封面"由详情页头部那颗按钮负责。

   ★ 舞台铺满整窗，但内容只放安全区：
   法阵画布与粒子一直画到标题栏、详情页头部、底栏后面（观感是「一整块深空」，
   而不是「中间一块画布」）；歌词与 HUD 这些内容则一律限制在安全区内 ——
   上下两块 chrome 有自己的交互（返回 / 样式 / 传输控件），不能被歌词压住。
   安全区是从 .playerview 的盒子与头部高度量出来的（见 measureSafeArea），
   所以主窗口与桌面背景歌词窗口（那里没有标题栏 / 底栏）会自动得到不同的值。
   封面只是整窗背景层里的一张模糊底图，不需要交互，因此不必落在 ctx.root。

   分工与纪律（与其它内置样式一致，见 README）：
     · 数据、动作全部走 ctx（不 import 应用内部模块、不碰 <audio> 状态）；
     · 频谱由宿主采样后推来（defineSkin 里声明 spectrum: 32），皮肤不碰 AudioContext；
     · 每帧只写 CSS 变量与 transform，**绝不触发 Lit 的响应式更新**；
     · 页面不可见 / 暂停久了 / 用户关掉动画 → 停 rAF，只留一帧静态画面。
   ========================================================================== */

import { defineSkin } from "../contract.js";
import { EMPTY_TRACK, lyricsEmptyText, setCoverImage, subtitleOf } from "../html.js";
import { fitScale } from "../fit.js";
import { prefersReducedMotion } from "../fx-camera.js";
import { ELEMENT_NAME, createElementAnalyzer } from "../arcanum-audio.js";
import { createStageCamera } from "../arcanum-stage.js";
import {
  BAND_BOTTOM,
  BAND_TOP,
  CORNER_HUD,
  CORNER_SECTION,
  FONT_MUL,
  LYRIC_BANDS,
  SECTION_PROGRAMS,
  detectSections,
  estimateWidthEm,
  hashStr,
  lineBox,
  planLine,
  planLines,
  resolveFocus,
} from "../arcanum-timing.js";
import { createDust, createScene } from "../arcanum-scene.js";
import "./arcanum.css";

const ID = "arcanum";

/* --------------------------------------------------------------------------
   帧率与生命周期预算
   --------------------------------------------------------------------------
   画布在「整窗背景」（桌面 2560×1440）上也要跑，所以帧率分三档：
     播放中 45fps（法阵转得很慢，45 与 60 肉眼无差别，但省掉四分之一的合成）
     暂停中 22fps（只有粒子在飘、法阵在慢慢变暗）
     暂停超过 6 秒 → 画完最后一帧彻底停下（用户的电脑不该为一张静止画面转风扇）
   歌词的入场动画是 CSS 动画，走合成器，不受这个帧率影响。
   -------------------------------------------------------------------------- */
const FPS_PLAYING = 45;
const FPS_IDLE = 22;
const IDLE_STOP_MS = 6000;
/** 镜头提前量：下一句开始前多久就开始移动（需求给的是 0.2~0.3s） */
const LEAD_MS = 260;
/**
 * 歌词窗口。
 *
 * ★ BACK + FWD + 1 ≤ LYRIC_BANDS（6）：每句话固定落在第 (index % 6) 条横行带上。
 * 但"落在不同的带里"只是**垂直顺序**的保证 —— 行与行到底会不会压在一起，
 * 由布局求解器拿**占位矩形**算出来（见 relayoutWindow）：
 *   1. 每句按自己的宽度算矩形（arcanum-timing.js#lineBox）；
 *   2. 先把压在角落 HUD 上的矩形推下去；
 *   3. 再把互相相交的矩形推开（垂直为主、水平为辅）；
 *   4. 最后夹回舞台边缘。
 * 这一切都发生在**写 DOM 之前** —— 渲染之后再发现叠在一起就晚了。
 * 前面只留 1 句：上一句正在飞向法阵外环，留 1 句够它飞完。
 */
const BACK = 1;
const FWD = 4;
/* 求解时给相邻矩形留的余量由 arcanum-timing.js 的求解器自己管（PAD =
   0.02 视口比例）：两份半透明文字只要挨上，肉眼就已经觉得"叠在一起"了，
   所以那里宁可多让一点。 */

/* ==========================================================================
   小工具
   ========================================================================== */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (dt, tau) => 1 - Math.exp(-Math.max(0, dt) / Math.max(0.001, tau));

function parseRgb(str) {
  const m = /rgba?(([^)]+))/i.exec(String(str || ""));
  if (!m) return null;
  const parts = m[1]
    .split(/[,s/]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length < 3 || !parts.slice(0, 3).every((n) => Number.isFinite(n))) return null;
  return [clamp(parts[0], 0, 255), clamp(parts[1], 0, 255), clamp(parts[2], 0, 255)];
}

/**
 * 把任意 CSS 颜色解析成 [r,g,b]。
 * 主题令牌派生出来的颜色可能是 color-mix() / oklab() / color(srgb …)，
 * 正则解析会漏 —— 所以先借 canvas 的 fillStyle 让浏览器自己归一化。
 */
function parseCssColor(str, g) {
  if (!str) return null;
  if (g) {
    try {
      g.fillStyle = "#000000";
      g.fillStyle = str;
      const norm = String(g.fillStyle);
      const hex = /^#([0-9a-f]{6})$/i.exec(norm);
      if (hex) {
        const n = parseInt(hex[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
      const short = /^#([0-9a-f]{3})$/i.exec(norm);
      if (short) {
        const s = short[1];
        return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16)];
      }
      const rgb = parseRgb(norm);
      if (rgb) return rgb;
    } catch (err) {
      /* 忽略：退回字符串解析 */
    }
  }
  return parseRgb(str);
}

/** 从容器上读出本样式自己的调色板（CSS 里定义，主题变化时自动跟着变） */
function readPalette(host, canvas, names, fallback) {
  if (!host || typeof document === "undefined") return fallback.map((c) => c.slice());
  const g = canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  const probe = document.createElement("span");
  probe.className = "ar-probe";
  probe.setAttribute("aria-hidden", "true");
  host.appendChild(probe);
  const out = [];
  for (let i = 0; i < names.length; i += 1) {
    let raw = "";
    try {
      probe.style.color = "var(" + names[i] + ")";
      raw = window.getComputedStyle(probe).color;
    } catch (err) {
      raw = "";
    }
    out.push(parseCssColor(raw, g) || (fallback[i] || [200, 200, 220]).slice());
  }
  probe.remove();
  return out;
}

/** 只在值真的变了才写 CSS 变量（每帧无脑写十几个变量会白白触发样式失效） */
function putVars(el, prev, vars) {
  for (const key in vars) {
    const value = vars[key];
    if (prev[key] === value) continue;
    prev[key] = value;
    el.style.setProperty(key, value);
  }
}

/* ==========================================================================
   模板
   ========================================================================== */

/** 整窗背景层：模糊封面 + 一层 CSS 深空（静态星星 + 两层雾），不做任何动画循环 */
const VOID_HTML =
  '<div class="ar-void" aria-hidden="true">' +
  // 封面不再是"法阵中心的圆形水晶"，而是这一层整窗模糊底图（见 p5 注释）
  '<img class="ar-void__cover" alt="" />' +
  '<div class="ar-void__sky"></div>' +
  '<div class="ar-void__stars"></div>' +
  '<div class="ar-void__fog"></div>' +
  '<div class="ar-void__vignette"></div>' +
  "</div>";

/** 舞台：法阵画布 / 咒语符文 / 前景粒子 / HUD（圆形封面已移除，见文件头） */
const SHELL_HTML =
  '<div class="ar-stage" data-anim="on" data-passive="0" data-clear="0" data-lyrics="on" data-section="verse">' +
  '<canvas class="ar-scene" aria-hidden="true"></canvas>' +
  '<div class="ar-runes"></div>' +
  '<canvas class="ar-dust" aria-hidden="true"></canvas>' +
  '<div class="ar-hud">' +
  '<div class="ar-hud__meta">' +
  '<span class="ar-hud__kicker">SPELL STAGE</span>' +
  '<div class="ar-hud__title"></div>' +
  '<div class="ar-hud__artist"></div>' +
  "</div>" +
  '<div class="ar-hud__el" aria-hidden="true">' +
  '<span class="ar-hud__el-dot"></span>' +
  '<span class="ar-hud__el-name">地</span>' +
  '<span class="ar-hud__bars"><i></i><i></i><i></i><i></i></span>' +
  "</div>" +
  '<div class="ar-hud__section"></div>' +
  "</div>" +
  "</div>";

/* ==========================================================================
   模块级实例（同一时刻只会挂载一个样式，与其它内置样式一致）
   ========================================================================== */

let inst = null;

function schedule() {
  if (!inst || inst.raf) return;
  if (typeof requestAnimationFrame !== "function") return;
  inst.raf = requestAnimationFrame(step);
}

function stopLoop() {
  if (!inst) return;
  if (inst.raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(inst.raf);
  inst.raf = 0;
  inst.last = 0;
}

function nowMs() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

/** 画一帧静态画面（动画关闭 / 暂停静止 / 挂载首帧都用它） */
function paintOnce() {
  if (!inst) return;
  paint(nowMs(), 1 / 30);
}

/* --------------------------------------------------------------------------
   安全区与适配倍数
   --------------------------------------------------------------------------
   舞台铺满整窗之后，"整窗"与"能放交互内容的地方"就不再是同一个矩形了：

     整窗    = 标题栏 + 详情页头部 + 中间舞台 + 底栏（法阵一直画到边）
     安全区  = 扣掉标题栏 / 头部 / 底栏之后剩下的中间那块

   歌词与 HUD 全部只允许出现在安全区里。这里量的就是安全区的上下留白，
   量法刻意只用几何信息（.playerview 的盒子 + .playerview__head 的高度），
   于是主窗口（有标题栏 / 底栏）与桌面背景歌词窗口（两者都没有）都自动正确，
   皮肤不需要知道"我现在被挂在哪个窗口里"。
   -------------------------------------------------------------------------- */
function measureSafeArea() {
  if (!inst) return;
  const pv = inst.pvEl;
  if (!pv) {
    inst.safeTop = 0;
    inst.safeBottom = 0;
  } else {
    // ★ 用 offsetTop / offsetHeight 而不是 getBoundingClientRect：
    //   详情页进出场时 .playerview 上有 translateY(38px)，挂载那一刻量到的
    //   rect 会把这 38px 算进安全区（舞台随之被顶上去、底部露出一条缝）。
    //   offset* 是布局值，不受 transform 影响。
    const headH = inst.headEl ? inst.headEl.offsetHeight : 0;
    const docH =
      (typeof document !== "undefined" && document.documentElement.clientHeight) ||
      (typeof window !== "undefined" ? window.innerHeight : 0) ||
      inst.stageH;
    const top = pv.offsetTop + headH;
    const bottomPx = pv.offsetTop + pv.offsetHeight;
    inst.safeTop = Math.max(0, Math.round(top));
    inst.safeBottom = Math.max(0, Math.round(docH - bottomPx));
  }
  // 同一个值给 CSS：.ar-stage 的负 inset（把舞台撑到整窗）与 .ar-hud 的定位都读它
  inst.shell.style.setProperty("--ar-safe-top", inst.safeTop + "px");
  inst.shell.style.setProperty("--ar-safe-bottom", inst.safeBottom + "px");
  // 也给画布：法阵要摆进安全区正中，并按安全区短边求半径（见 scene.rebuild）
  inst.scene.setSafeArea(inst.safeTop, inst.safeBottom);
}

/**
 * 窗口适配倍数（见 fit.js）：按**安全区**短边算，写到 --ar-fit。
 * 舞台铺满整窗只是把画布画到边上，构图的设计尺寸仍然跟安全区走，
 * 这样同一套设计值不会因为"上下多了标题栏 / 底栏"而整体放大或缩小。
 */
function applyStageFit() {
  if (!inst) return 1;
  const safeH = Math.max(1, inst.stageH - inst.safeTop - inst.safeBottom);
  const scale = fitScale(inst.stageW, safeH);
  inst.fitScale = scale;
  inst.shell.style.setProperty("--ar-fit", scale.toFixed(4));
  return scale;
}

/* --------------------------------------------------------------------------
   歌词计划
   -------------------------------------------------------------------------- */

function nextLineTime(index) {
  if (!inst) return 0;
  const cur = inst.lines[index];
  if (!cur) return 0;
  const next = inst.lines[index + 1];
  return next ? Number(next.time) : Number(cur.time) + 4200;
}

/**
 * 角落留白（舞台比例坐标）：左上角的曲目信息、右上角的段落名。
 * 它们与歌词同时出现在画面上，长句子扫过去就会压住曲名 —— 求解器要把歌词
 * 推出这两块之外。坐标由 CSS 里的定位换算而来（.ar-hud__meta 在安全区左上，
 * .ar-hud__section 在右上角），舞台比例 = (px - 舞台中心) / 舞台边长。
 */
function cornerBoxes() {
  // ★ 返回的是**视口比例**坐标（0~1，左上角为原点）—— 与 planLines 的
  //   求解器同一套坐标，算出来的矩形直接就能互相比较
  const W = Math.max(160, inst.stageW || 160);
  const H = Math.max(160, inst.stageH || 160);
  const fit = inst.fitScale || 1;
  // 舞台的左上角 = (0, 0)；HUD 的内边距是 26px * fit（见 arcanum.css §9），
  // 上边还要让开安全区（标题栏 + 详情页头部）
  const left = 26 * fit;
  const top = Math.min(Math.max(0, inst.safeTop || 0), H * 0.4) + 16 * fit;
  const metaH = 58 * fit;
  return [
    // 左上：SPELL STAGE + 曲名 + 艺术家（max-width 52%~68% 舞台宽）
    {
      x: (left + (CORNER_HUD.w * W) / 2) / W,
      y: (top + metaH / 2) / H,
      w: CORNER_HUD.w,
      h: metaH / H,
    },
    // 右上：段落名（letter-spacing 很宽，按 0.2 舞台宽算）
    {
      x: (W - left - (CORNER_SECTION.w * W) / 2) / W,
      y: (top + (CORNER_SECTION.h * H) / 2) / H,
      w: CORNER_SECTION.w,
      h: CORNER_SECTION.h,
    },
  ];
}

/**
 * 舞台布局参数（交给纯逻辑模块算行带与宽度适配）。
 *
 * 字号与窗口尺寸都会影响"这一句占多宽、会不会顶到边上"，所以它必须在
 * 字号变化与窗口尺寸变化时重算 —— 重算之后计划缓存整个作废（见 rebuildLines）。
 *
 * ★ 行带比例必须落在**安全区**里，而不是整个舞台：
 *   舞台现在铺满整窗（法阵一直画到标题栏与底栏后面），但歌词是交互内容，
 *   不许进标题栏 / 详情页头部 / 底栏这三块 —— 那里有返回、样式、传输控件，
 *   歌词飘进去只会互相抢。所以 BAND_TOP / BAND_BOTTOM 这两个"舞台比例"
 *   改成"安全区比例"，再换算回舞台坐标（相机用的也是这套舞台坐标）。
 */
function layoutConfig() {
  const fit = inst.fitScale || 1;
  const fontPx = Math.max(6, (inst.lyricSize || 16) * FONT_MUL * fit);
  const W = Math.max(160, inst.stageW || 160);
  const H = Math.max(160, inst.stageH || 160);
  const safeTop = Math.min(Math.max(0, inst.safeTop || 0), H * 0.4);
  const safeBottom = Math.min(Math.max(0, inst.safeBottom || 0), H * 0.4);
  const safeH = Math.max(1, H - safeTop - safeBottom);
  return {
    bands: LYRIC_BANDS,
    // 安全区比例 → 舞台比例（nodeY 是相对 40% 焦点的偏移，见 arcanum-timing.js）
    top: (safeTop + BAND_TOP * safeH) / H,
    bottom: (safeTop + BAND_BOTTOM * safeH) / H,
    // 可用宽度按 86% 舞台宽算（两侧各留 7% 余量）
    availableEm: Math.max(8, (W * 0.86) / fontPx),
    emToStageW: fontPx / W,
  };
}

/** 取（并按需生成）一行的舞台计划；缓存超出上限就清掉离当前太远的 */
function planFor(index) {
  if (!inst) return null;
  if (!Number.isFinite(index) || index < 0 || index >= inst.lines.length) return null;
  const cached = inst.plans.get(index);
  if (cached) return cached;
  const plan = planLine(inst.lines[index], index, inst.sections[index] || "verse", nextLineTime, layoutConfig());
  inst.plans.set(index, plan);
  if (inst.plans.size > 40) {
    for (const key of [...inst.plans.keys()]) {
      if (Math.abs(key - index) > 10) inst.plans.delete(key);
    }
  }
  return plan;
}

/* --------------------------------------------------------------------------
   布局求解：在**写 DOM 之前**把"会不会叠在一起"算清楚
   --------------------------------------------------------------------------
   需求原文：「渲染之前，可以将文字模拟一个矩形判断他们是否会有重叠的情况，
   防止渲染之后文字叠在一起很难看」。

   所以顺序永远是「先算、再写」：
     1. 收集这一屏要出现的每一行 —— 窗口里还没唱完的行，**加上**已经封印到
        法阵外环上的历史行（它们是 0.34 倍大小的符文，但仍然是看得见的一块，
        而且正好落在法阵外圈那一带，长句子飞过去就会压上）；
     2. 每行按自己的宽度算占位矩形（arcanum-timing.js#lineBox），
        宽度的估算与 planLine 同源，不会"计划说 5em、实际排出来 7em"；
     3. 把角落 HUD 与舞台边缘之外的部分交给求解器；
     4. 求解器就地改 node.x / node.y，之后才轮到 syncWindow 写 CSS 变量。

   求解是**幂等且确定性**的：同一组输入永远得到同一组落点，所以窗口
   （active-1 ~ active+4）滑动时，已经排好的行不会突然跳一下 —— 跳的只有
   新进窗口的那一行。
   -------------------------------------------------------------------------- */

/**
 * 已经封印到外环上的行的落点 → 占位矩形（视口比例坐标）。
 * 用的是和 setLineState 完全一样的公式，所以"算出来的位置"就是"画出来的位置"。
 */
function sealedBox(index) {
  const seal = sealPoint(index);
  if (!seal) return null;
  const plan = planFor(index);
  const text = plan ? plan.text : String((inst.lines[index] && inst.lines[index].text) || "");
  // sealPoint 给的是"相对 (50%, 40%) 的百分比"，正是 node 坐标
  return lineBox(seal.x / 100, seal.y / 100, estimateWidthEm(text) || 1, seal.s, emToStageWidth());
}

/**
 * "1em 等于舞台宽度的多少倍"：占位矩形的宽度 = 宽度em × 缩放倍数 × 这个数。
 *
 * ★ 与 layoutConfig 里那个 emToStageW 必须**一模一样**（CSS 里
 *   .ar-runes 的 font-size = --ar-lsize × --ar-lmul × --ar-fit），
 *   否则"算出来的矩形"和"排出来的文字"对不上：宽估小了就漏判重叠，
 *   估大了就把本来放得下的句子推开。两份字号只此一处，改要一起改。
 */
function emToStageWidth() {
  const W = Math.max(160, inst.stageW || 160);
  const fontPx = Math.max(6, (inst.lyricSize || 16) * FONT_MUL * (inst.fitScale || 1));
  return fontPx / W;
}

/**
 * 行带在**视口比例**坐标里的上下边界（求解器据此把歌词夹在安全区内）。
 * layoutConfig 给的 top / bottom 是"安全区比例"，这里换算到整窗比例。
 */
function bandBounds() {
  const cfg = layoutConfig();
  return { top: cfg.top, bottom: cfg.bottom };
}

/**
 * 重排当前窗口里的行（就地改 node / box）。**必须在写 DOM 之前调用。**
 *
 * 参与求解的有两类矩形：
 *   · 窗口里还"散落在空中"的行（todo / active / near / next / far）；
 *   · 刚刚唱完、正在飞向法阵外环的行 —— 它们一路上会横穿好几条行带，
 *     不把它们算进去，飞行途中就会短暂地和邻句压在一起（这是实测出来的
 *     一条：动画看着像两句叠了一下）。
 * 已经飞到位、缩成符文的行只留一个很小的矩形（它们在外环上，本来就不占
 * 中央这块舞台，但长句子扫过去仍然要躲开）。
 */
function relayoutWindow(activeIndex) {
  if (!inst) return;
  const min = activeIndex - BACK;
  const max = activeIndex + FWD;
  const rows = [];
  const blocked = [];
  for (const [i, el] of inst.lineEls) {
    const plan = planFor(i);
    if (!plan) continue;
    if (i >= min && i <= max) {
      // 窗口内的行：封印中的也算进来（尺寸按 0.34 倍的符文算）
      if (el.dataset.state === "past") blocked.push(sealedBox(i));
      else rows.push(plan);
      continue;
    }
    // 窗口外、但还没滑出 DOM 的行（BACK 只留 1 句，这里通常也就 1 条）
    // —— 它们本来就在画面上，得挡住新来的行
    if (el.dataset.state === "past") blocked.push(sealedBox(i));
    else blocked.push(plan.box);
  }
  const bounds = bandBounds();
  const cfg = layoutConfig();
  planLines(rows, {
    top: bounds.top,
    bottom: bounds.bottom,
    edgeX: 0.47,
    emToStageW: cfg.emToStageW,
    corners: cornerBoxes(),
    blocked,
  });
}

/**
 * 法阵外环上的落点（归一化到 cqw / cqh 的百分比）。
 * 唱完的句子就飞到这里，缩成一枚刻在环上的符文。
 */
function sealPoint(index) {
  const W = inst.stageW;
  const H = inst.stageH;
  if (!(W > 8 && H > 8)) return null;
  const ring = 0.3 * Math.min(W, H) * 1.14;
  // 黄金角：相邻两句不会落在环上的同一个位置
  const angle = index * 2.399963 + ((hashStr(inst.lines[index] ? inst.lines[index].text : "") % 100) / 100) * 0.6;
  const px = W / 2 + Math.cos(angle) * ring;
  const py = H * 0.58 + Math.sin(angle) * ring * 0.62;
  return {
    // 行元素的基准点在 (50%, 40%)，所以这里要减掉基准点
    x: ((px - W / 2) / W) * 100,
    y: ((py - H * 0.4) / H) * 100,
    // 倾角夹在 ±24°：早先直接用黄金角换算（index 8 就转到 55°）会横七竖八，
    // 而且旋转后的外接盒很大，飞行途中容易和相邻行带的矩形相交
    r: (((angle * 180) / Math.PI) % 48) - 24,
    s: 0.34,
  };
}

/* --------------------------------------------------------------------------
   DOM：一行歌词 = 一串「咒语单元」
   -------------------------------------------------------------------------- */

function applyNodeVars(el, x, y, r, s) {
  el.style.setProperty("--ar-nx", Number(x).toFixed(3));
  el.style.setProperty("--ar-ny", Number(y).toFixed(3));
  el.style.setProperty("--ar-nr", Number(r).toFixed(2));
  el.style.setProperty("--ar-ns", Number(s).toFixed(3));
}

/* --------------------------------------------------------------------------
   唱完时的「飞行档案」：从原落点位移到法阵外环
   --------------------------------------------------------------------------
   需求：上/下一句切换时，歌词**不要直接消失**，而是从原来的地方位移到目标
   位置；并且位移方式要随机一点——可以"直接出现在目标位置"（瞬移），也可以
   "花比较长的时间慢慢飘过去"，甚至"跳跃/绕一小段弧线过去"。

   这段位移的**时长 / 缓动 / 轨迹形状**（淡出写在关键帧里、跟着飞行一起走）：
     · teleport   瞬移：直接出现在外环上（原来是唯一一种，现在只是其中一种，
                    靠极短位移 + 淡出看起来像"闪现"）；
      quick      0.55s：利落的一步到位；
      drift      1.4~2.3s：慢慢飘过去，这段时间里一直看得见；
      leap       1.1s：先抬高再落到位（带垂直弧线的"跳"）；
      overshoot  0.95s：冲过头一点点再回弹到位；
      spiral     1.9s：带一点旋转地绕过去。
   时长/缓动/轨迹全部由变量驱动，CSS 只做解释执行；淡出速度随飞行时长走。

   ★ 随机源用行自己的文本做种子（hash），所以**同一句永远抽到同一份档案** 
     拖进度条来回、窗口重建时不会"这次是瞬移、下次是慢飘"地抖。
   -------------------------------------------------------------------------- */
/* 六种档案：name 交给 CSS 挑对应的 animation，dur/ease 是节奏，arc/spin 是轨迹 */
const FLIGHT_PROFILES = [
  { name: "teleport", durMs: 1, ease: "linear", arc: 0, spin: 0 },
  { name: "quick", durMs: 520, ease: "cubic-bezier(0.22, 0.61, 0.36, 1)", arc: 0, spin: 0 },
  { name: "drift", durMs: 1500, ease: "cubic-bezier(0.37, 0, 0.63, 1)", arc: 6, spin: 0 },
  { name: "drift-long", durMs: 2300, ease: "cubic-bezier(0.45, 0.05, 0.55, 0.95)", arc: 10, spin: 0 },
  { name: "leap", durMs: 1100, ease: "cubic-bezier(0.34, 1.56, 0.64, 1)", arc: 16, spin: 0 },
  { name: "overshoot", durMs: 950, ease: "cubic-bezier(0.34, 1.4, 0.64, 1)", arc: 0, spin: 0 },
  { name: "spiral", durMs: 1900, ease: "cubic-bezier(0.5, 0, 0.5, 1)", arc: 12, spin: 26 },
];

/** 用文本做种子抽一份稳定的飞行档案（同一句永远同一份） */
function flightProfile(text, index) {
  if (!inst) return FLIGHT_PROFILES[2];
  // 给每个 (index, text) 算一个稳定的散列，再映射到档案数组
  const seed = (hashStr(String(text || "")) + index * 2654435761) >>> 0;
  return FLIGHT_PROFILES[seed % FLIGHT_PROFILES.length];
}

/** 把飞行档案写成行元素上的 CSS 变量（唱完 .ar-line[data-state="past"] 时读它） */
function applyFlightVars(el, profile) {
  //  先快照**此刻**已渲染的落点（--ar-nx/ny/nr/ns），存成飞行的起点 --ar-fpx/...。
  //   下面 setLineState 紧接着会把 --ar-nx 改成外环的封印落点，若不先快照，
  //   关键帧的 from 就只能从 0 起步、变成"从舞台中心飞出去"而不是"从字原本
  //   所在的地方飞出去"。
  const cs = el.style;
  const from = (name, fallback) => {
    const v = cs.getPropertyValue(name);
    return String(v || fallback).trim() || fallback;
  };
  cs.setProperty("--ar-fpx", from("--ar-nx", "0"));
  cs.setProperty("--ar-fpy", from("--ar-ny", "0"));
  cs.setProperty("--ar-fpr", from("--ar-nr", "0"));
  cs.setProperty("--ar-fps", from("--ar-ns", "1"));
  el.style.setProperty("--ar-fly-dur", profile.durMs + "ms");
  el.style.setProperty("--ar-fly-ease", profile.ease);
  el.style.setProperty("--ar-fly-arc", profile.arc.toFixed(2));
  el.style.setProperty("--ar-fly-spin", profile.spin.toFixed(2));
  el.dataset.fly = profile.name;
}

/* --------------------------------------------------------------------------
   入场起点（"从**哪里**入场并位移到已经算好的目标位置"）
   --------------------------------------------------------------------------
   目标位置（--ar-rest = --ar-dx/dy/dr/ds）在切句时就已经被布局求解器算好了。
   这里为每个字素再抽一份"入场档案"：它从**哪个起点**出发、用**哪种方式**
   （闪现 / 传送 / 渐变 / 溶解 / 变幻 / 跳跃……）位移到那个目标位置。

   起点写成 --ar-ix / --ar-iy（相对目标位置的偏移，em，会跟着字号缩放），
   幅度比原来的"0.85em 微移"大得多（2~7em，方向随机），这样"从别处入场"
   才看得出来；原来的十种入场形态（summon / fall / slash …）改为读这些变量，
   于是同一套魔法有了千变万化的来向。

   ★ 用 (文本, 行号, 字素序号) 做种子：同一句的同一个字每次入场方式与来向
     都稳定，拖进度条来回不会"这次从左飞、下次从下飞"地抖。
   -------------------------------------------------------------------------- */

/** 新增的几种入场方式：与 arcanum-timing.js 的十种并存，按概率抽用 */
const EXTRA_ENTER_MODES = ["transmit", "dissolve", "blink", "hop", "warp"];

/** [0,1) 伪随机：用字素身份做种子，稳定可复现 */
function unitSeed(text, index, i, salt) {
  const h = hashStr(String(text || "") + ":" + index + ":" + i + ":" + salt);
  return (h % 100000) / 100000;
}

/** 为一个字素抽入场起点与方式，写回它的 CSS 变量与 data 属性 */
function applyEnterVars(span, unit, text, index, i) {
  const rnd = (salt) => unitSeed(text, index, i, salt);
  // 方向：全向随机（0~2π），但整体偏"从舞台外围涌进来"
  const ang = rnd("ang") * Math.PI * 2;
  // 距离分两档：近场微动（约 1/5 概率）与远场入场（大多数）
  const far = rnd("far") < 0.78;
  const dist = far ? 1.8 + rnd("dist") * 3.4 : 0.5 + rnd("dist") * 1.1;
  const ix = Math.cos(ang) * dist;
  const iy = Math.sin(ang) * dist * 0.7; // 纵向略收，避免整句被拉得太高
  // 起点缩放：闪现/传送类接近 1（几乎不缩放），其余随机放大或缩小
  const scaleRoll = rnd("s");
  const is = 0.35 + scaleRoll * 1.15; // 0.35 ~ 1.5
  const ir = (rnd("r") - 0.5) * 40; // ±20°
  span.style.setProperty("--ar-ix", ix.toFixed(3) + "em");
  span.style.setProperty("--ar-iy", iy.toFixed(3) + "em");
  span.style.setProperty("--ar-is", is.toFixed(3));
  span.style.setProperty("--ar-ir", ir.toFixed(2) + "deg");
  // 入场方式：约 45% 概率用新增的花样，其余用段落给的原方式（十种魔法）
  const useExtra = rnd("mode") < 0.45;
  span.dataset.enterMode = useExtra
    ? EXTRA_ENTER_MODES[Math.min(EXTRA_ENTER_MODES.length - 1, Math.floor(rnd("mode2") * EXTRA_ENTER_MODES.length))]
    : unit.mode;
}

function createLineEl(index) {
  const plan = planFor(index);
  if (!plan) return null;
  const line = inst.lines[index];
  const el = document.createElement(inst.interactive ? "button" : "div");
  el.className = "ar-line";
  if (inst.interactive) el.setAttribute("type", "button");
  el.dataset.index = String(index);
  el.dataset.time = String(line.time);
  el.dataset.section = plan.section;
  // 行带编号：自检脚本用它验证"同屏没有两行落在同一条带上"
  el.dataset.band = String(plan.band);
  el.dataset.state = "todo";
  el.dataset.enter = "0";

  // 落点已经由 relayoutWindow 解好（node.x / node.y 就是占位矩形的中心）
  const frag = document.createDocumentFragment();
  for (let i = 0; i < plan.units.length; i += 1) {
    const u = plan.units[i];
    const span = document.createElement("span");
    span.className = "ar-unit";
    // textContent 而不是 innerHTML：歌词来自文件标签 / 在线匹配，
    // 天生带尖括号也不会穿透成标签（比手动转义更不容易漏）
    span.textContent = u.ch;
    span.dataset.mode = u.mode;
    span.dataset.tier = u.tier;
    // 单元种类：char（中/日/韩逐字）| word（英文一个单词一个单元）| space | punct
    span.dataset.kind = u.kind || "char";
    span.dataset.hold = "todo";
    span.style.setProperty("--ar-dx", u.dx.toFixed(3) + "em");
    span.style.setProperty("--ar-dy", u.dy.toFixed(3) + "em");
    span.style.setProperty("--ar-dr", u.dr.toFixed(2) + "deg");
    span.style.setProperty("--ar-ds", u.ds.toFixed(3));
    // ★ "画多大"与"占多大"用同一个数：--ar-ds 放大出来的那一圈，靠 --ar-pad
    //   在排版里补回来（transform 不参与布局）。不补的话相邻字素必然叠上。
    span.style.setProperty("--ar-pad", (Number(u.pad) || 0).toFixed(3) + "em");
    span.style.setProperty("--ar-d", u.delayMs + "ms");
    span.style.setProperty("--ar-du", u.durMs + "ms");
    // 抽入场起点与方式：从"某个起点"变幻位移到上面那套已经算好的目标位置
    applyEnterVars(span, u, line.text, index, i);
    frag.appendChild(span);
  }
  el.appendChild(frag);
  applyNodeVars(el, plan.node.x * 100, plan.node.y * 100, plan.node.r, plan.node.s);
  return el;
}

function setLineState(el, index, activeIndex) {
  const plan = planFor(index);
  if (!plan) return;
  const previous = el.dataset.state;
  const ahead = index - activeIndex;
  let state = "far";
  if (ahead === 0) state = "active";
  else if (ahead < 0) state = "past";
  else if (ahead === 1) state = "near";
  else if (ahead <= 3) state = "next";

  if (previous !== state) {
    el.dataset.state = state;
    // 同一句再次成为当前句时（拖进度条来回）要重放入场动画：
    // CSS 只认 [data-state="active"]，状态一变选择器重新匹配、动画自然重放
    if (state === "active") el.dataset.enter = String(Number(el.dataset.enter || 0) + 1);
  }

  if (state === "past") {
    // 唱完  飞向法阵外环：抽一份「飞行档案」写进 CSS 变量（时长/缓动/轨迹/
    // 淡出节奏都随它变），CSS 照着它决定这段位移怎么走。只在**刚变成 past 的
    // 那一次**抽（看之前的状态），否则每次 setLineState 都重新抽一份、
    // 会把正在飞的动画抖断。
    if (previous !== "past") {
      applyFlightVars(el, flightProfile(plan.text, index));
    }
    // 历史行冻结在"已唱"上：它们不再参与逐字点亮，颜色也不该停在"正在唱"
    for (const unit of el.children) if (unit.dataset.hold !== "done") unit.dataset.hold = "done";
    const seal = sealPoint(index);
    if (seal) {
      applyNodeVars(el, seal.x, seal.y, seal.r, seal.s);
      el.dataset.sealed = "1";
      return;
    }
  }
  // 越靠后越小：当前句最大最亮，后面 4 句依次退远（景深）
  //  落点用 plan.box（求解后的占位矩形中心），**不是**重新按 node 算一遍 
  //   两者必须同源，否则"算出来不重叠"和"画出来不重叠"就是两回事了。
  const emphasis = state === "active" ? 1 : state === "near" ? 0.74 : state === "next" ? 0.62 : 0.52;
  // plan.node 已经是求解后的落点（planLines 把 box 换算回 node 再写回），
  // 这里直接用它  唯一的事实来源，不做第二次换算。
  applyNodeVars(
    el,
    plan.node.x * 100,
    plan.node.y * 100,
    state === "active" ? plan.node.r : plan.node.r * 0.45,
    plan.node.s * emphasis
  );
  if (el.dataset.sealed === "1" && state !== "past") delete el.dataset.sealed;
}

/**
 * 布局参数变了（字号 / 窗口尺寸）：把计划缓存整个作废并重建行。
 * 计划里烘了"占多宽、落在哪条带上、占位矩形多大"，不重算的话窗口一改大小，
 * 长句子就会顶到边上（甚至出画），占位矩形也会跟着失真。
 * 重建走的是 setActive(active, true) —— 它内部会先跑一次 relayoutWindow。
 */
function rebuildLines() {
  if (!inst) return;
  inst.plans = new Map();
  const active = inst.activeIndex;
  for (const el of inst.lineEls.values()) el.remove();
  inst.lineEls = new Map();
  inst.activeIndex = -2;
  setActive(active, true);
}

/**
 * 准备窗口内的行，并把状态（active / past / near / far）刷上去。
 *
 * 只渲染 [active-BACK, active+FWD] 这几行：一首 60 行的歌没必要在 DOM 里放
 * 60 个绝对定位的句子（每句还有几十个字素）。旧句子的「飞向法阵」是一段 CSS
 * 过渡 + 动画，元素被复用，所以过渡不会因为重建 DOM 而中断。
 *
 * ★ 窗口宽度（6 行）≤ 行带数（6）：未唱到的几句被**铺开**在各条横带上
 * （而不是堆在同一个位置），到点了再依次亮起来。
 * 真正的"不重叠"由 setActive 里先跑的那次 relayoutWindow 保证 ——
 * 它在建 DOM 之前就把这一屏的落点解好了。
 */
function syncWindow(activeIndex) {
  if (!inst) return;
  const min = activeIndex - BACK;
  const max = activeIndex + FWD;

  for (const [i, el] of [...inst.lineEls]) {
    if (i >= min && i <= max) continue;
    if (inst.interactive && el === document.activeElement) el.blur();
    el.remove();
    inst.lineEls.delete(i);
  }
  for (let i = min; i <= max; i += 1) {
    if (i < 0 || i >= inst.lines.length) continue;
    if (inst.lineEls.has(i)) continue;
    const el = createLineEl(i);
    if (!el) continue;
    inst.lineEls.set(i, el);
    inst.refs.runes.appendChild(el);
    setLineState(el, i, activeIndex);
  }
}

function setActive(activeIndex, force) {
  if (!inst) return;
  if (!force && inst.activeIndex === activeIndex) return;
  inst.activeIndex = activeIndex;
  inst.holdCount = -1;
  // ★ 顺序：先把这一屏的落点解出来（含"和已封印到外环的历史行会不会撞"），
  //   再建 DOM / 写 CSS 变量。反过来做的话，第一帧就已经叠在一起了。
  relayoutWindow(activeIndex);
  syncWindow(activeIndex);
  for (const [i, el] of inst.lineEls) setLineState(el, i, activeIndex);
  const plan = activeIndex >= 0 ? planFor(activeIndex) : null;
  inst.refs.hudSection.textContent = plan ? plan.program.label : "";
  inst.shell.dataset.section = plan ? plan.section : "verse";
}

/** 逐字点亮（卡拉OK）：只改当前行，历史行在换行时一次性冻结 */
function paintHold(activeIndex, position) {
  if (!inst || activeIndex < 0) return;
  const el = inst.lineEls.get(activeIndex);
  const plan = planFor(activeIndex);
  if (!el || !plan) return;
  const nodes = el.children;
  let hold = 0;
  for (let i = 0; i < plan.units.length; i += 1) {
    if (plan.units[i].time <= position) hold = i + 1;
    else break;
  }
  if (hold === inst.holdCount) return;
  inst.holdCount = hold;
  for (let i = 0; i < nodes.length; i += 1) {
    const want = i < hold - 1 ? "done" : i === hold - 1 ? "now" : "todo";
    if (nodes[i].dataset.hold !== want) nodes[i].dataset.hold = want;
  }
}

/* --------------------------------------------------------------------------
   数据 → DOM
   -------------------------------------------------------------------------- */

function paintSong() {
  if (!inst) return;
  const media = inst.ctx.media();
  const song = media.song || EMPTY_TRACK;
  const title = song.title || "未在播放";
  const artist = subtitleOf(song.artist, song.album);
  inst.refs.title.textContent = title;
  inst.refs.title.setAttribute("title", title);
  inst.refs.artist.textContent = artist;
  // 封面只出现在整窗背景层（模糊底图），舞台里不再有圆形封面
  setCoverImage(inst.refs.voidCover, media.cover, inst.ctx.defaultCover);
}

function lyricsSignature(lines) {
  let sig = String(lines.length);
  for (let i = 0; i < lines.length; i += 1) {
    sig += "|" + (lines[i] ? lines[i].time : "") + "@";
  }
  sig += "#" + hashStr(lines.map((l) => (l ? l.text : "")).join("|#|"));
  return sig;
}

function setLyrics(lines) {
  if (!inst) return;
  const next = Array.isArray(lines) ? lines : [];
  const sig = lyricsSignature(next);
  if (sig === inst.lyricsSig) return;
  inst.lyricsSig = sig;
  inst.lines = next;
  inst.sections = detectSections(next);
  inst.plans = new Map();
  for (const el of inst.lineEls.values()) el.remove();
  inst.lineEls = new Map();
  inst.activeIndex = -2;
  inst.holdCount = -1;
  inst.lastFocusLine = -1;

  const existing = inst.refs.runes.querySelector(".ar-empty");
  if (!next.length) {
    if (!existing) {
      const box = document.createElement("div");
      box.className = "ar-empty";
      inst.refs.runes.appendChild(box);
    }
    inst.refs.runes.querySelector(".ar-empty").textContent = lyricsEmptyText(inst.ctx.media().lyrics);
    inst.refs.hudSection.textContent = "";
  } else if (existing) {
    existing.remove();
  }
}

function applyOptions() {
  if (!inst) return;
  const o = inst.ctx.options() || {};
  const anim = o.animations !== false && !prefersReducedMotion();
  const size = clamp(Number(o.lyricsFontSize) || 16, 12, 40);
  const interactive = o.interactive !== false;
  const showLyrics = o.showLyrics !== false;

  inst.anim = anim;
  inst.interactive = interactive;
  inst.showLyrics = showLyrics;
  inst.shell.dataset.anim = anim ? "on" : "off";
  inst.shell.dataset.clear = anim ? "0" : "1";
  inst.shell.dataset.passive = interactive ? "0" : "1";
  inst.shell.dataset.lyrics = showLyrics ? "on" : "off";
  inst.shell.style.setProperty("--ar-lsize", size + "px");
  // 字号倍数只写一次（JS 与 CSS 必须一致：布局估算用的就是 FONT_MUL）
  inst.shell.style.setProperty("--ar-lmul", String(FONT_MUL));

  // 字号变了 → 每句的宽度与行带落点都要重算
  if (inst.lyricSize !== size) {
    inst.lyricSize = size;
    rebuildLines();
  }

  if (!anim) {
    stopLoop();
    // 静止画面仍然要画一帧：法阵 / 星空是 canvas，不会自己出现
    paintOnce();
  } else if (!inst.raf && !inst.closed) {
    inst.settled = false;
    inst.idleSince = nowMs();
    schedule();
  }
}

function refreshPalette() {
  if (!inst) return;
  const accent = readPalette(
    inst.shell,
    inst.refs.scene,
    ["--ar-a1", "--ar-a2", "--ar-a3"],
    [
      [150, 190, 255],
      [120, 140, 235],
      [255, 226, 160],
    ]
  );
  const bg = readPalette(
    inst.shell,
    inst.refs.scene,
    ["--ar-b1", "--ar-b2"],
    [
      [10, 12, 26],
      [4, 5, 12],
    ]
  );
  inst.scene.setPalette(accent, bg);
  inst.dust.setPalette(accent);
}

/* ==========================================================================
   每帧
   ========================================================================== */

/**
 * 段落切换时的法阵反应。
 *
 * ★ 这里不再触发 "flash" / "shatter"：它们会**从法阵中心扩散出一个圈**，
 *   而那个圈会横穿整个舞台 —— 歌词正是从中心往外铺的，于是每次段落切换
 *   （以及换色时的每一次元素切换）都有一道扩散环从歌词身上扫过去，看起来
 *   就是"文字闪了一下 / 中间冒了个圈"。留白交给粒子（dust.burst）就够了：
 *   它只在空间里加光点，不会盖住任何一块文字。
 */
function onSectionChange(next) {
  if (!inst) return;
  if (next === "bridge") {
    // 桥段：法阵碎裂重组（涟漪留在法阵内部，不到处乱跑）
    inst.scene.event("shatter");
    inst.dust.burst(10);
  } else if (next === "chorus") {
    // 副歌：光尘变密，法阵整体提亮（提亮由段落剧本给，不需要白闪）
    inst.dust.burst(6);
  } else if (next === "outro") {
    // 尾奏：法阵慢慢停，只剩光尘
    inst.scene.event("dissolve");
  }
}

function paint(now, dt) {
  if (!inst) return;
  const refs = inst.refs;
  const A = inst.analyser;
  const cam = inst.cam;

  // 歌词节拍回退：换行时踩一记，然后 1→0 衰减（拿不到频谱时的唯一节拍源）
  inst.tempoPulse *= Math.exp(-dt / 0.24);
  if (inst.tempoPulse < 0.002) inst.tempoPulse = 0;
  A.frame(dt, { playing: inst.playing, tempoPulse: inst.tempoPulse });

  // —— 段落：当前句属于哪个段落，决定法阵亮度 / 转速 / 粒子密度 / 镜头 ——
  const sec = inst.activeIndex >= 0 ? inst.sections[inst.activeIndex] || "verse" : "verse";
  if (sec !== inst.section) {
    inst.section = sec;
    onSectionChange(sec);
  }
  const P = SECTION_PROGRAMS[inst.section] || SECTION_PROGRAMS.verse;
  const k = approach(dt, 1.35);
  inst.prog.alpha += (P.arrayAlpha * (0.75 + A.energy * 0.5) - inst.prog.alpha) * k;
  inst.prog.spin += (P.spin * (0.85 + A.energy * 0.5) - inst.prog.spin) * k;
  inst.prog.particles += (P.particles - inst.prog.particles) * k;
  inst.prog.camZoom += (P.camZoom - inst.prog.camZoom) * k;
  inst.prog.camSpeed += (P.camSpeed - inst.prog.camSpeed) * 0.6;

  // —— 元素切换 → 法阵换色 / 换符文图案 ——
  const hue = A.hue() + P.hue * 0.5;
  inst.scene.setHue(hue);
  inst.dust.setHue(hue);
  if (A.elementSwitched) {
    inst.scene.setPattern(hashStr(A.element + ":" + inst.activeIndex + ":" + inst.section));
    refs.elName.textContent = ELEMENT_NAME[A.element] || "地";
    // 换元素只换符文图案与色相（法阵整体换氛围），不再闪一下 —— 见 onSectionChange
  }

  // —— 镜头：先定「该看哪一句」（带提前量），再推进 ——
  //   ★ 换句时**不再抖一下**：需求是"上下句切换平滑过去即可"。
  //     早先每换一句都调 cam.pulse()（重拍轻震），而来电/换行本来就频繁，
  //     于是每句开头镜头都"哆嗦"一下 —— 那不是节奏感，是干扰。
  //     震动现在只由真正的重拍驱动（见下面的 onset 分支），换句只留节拍脉冲
  //     （tempoPulse 驱动的是法阵波纹与 HUD 辉光，不动镜头）。
  // 镜头轻震只由**真正的重拍**驱动：低频起音（onset）且要够强才震，
  // 幅度也压得很低（0.5 以内）。这样"换句"本身完全不会引起抖动，
  // 只有音乐里确实有大鼓点时才轻轻一颤 —— 平滑是第一位的。
  if (inst.anim && A.onset > 0.72 && inst.playing) cam.pulse(0.45);

  if (inst.showLyrics && inst.lines.length) {
    const focus = resolveFocus(inst.lines, inst.position, LEAD_MS);
    const plan = planFor(focus.target);
    if (plan) cam.aim(plan.node);
    if (focus.active >= 0 && focus.active !== inst.lastFocusLine) {
      inst.lastFocusLine = focus.active;
      inst.tempoPulse = 1;
    }
  }
  cam.zoomTo(1 + inst.prog.camZoom + A.arcane * 0.03 - A.voidLevel * 0.012);
  cam.step(dt, { enabled: inst.anim, speedScale: inst.prog.camSpeed * (inst.playing ? 1 : 0.35) });

  const cs = cam.state;
  const camX = cs.panX + cs.shakeX;
  const camY = cs.panY + cs.shakeY;

  // —— 画布（远景在整窗背景层里，这里只画中景法阵与前景粒子）——
  const st = {
    low: A.low,
    bass: A.bass,
    mid: A.mid,
    high: A.high,
    energy: A.energy,
    onset: A.onset,
    thunder: A.thunder,
    arcane: A.arcane,
    voidLevel: A.voidLevel,
    spin: inst.prog.spin,
    alpha: inst.prog.alpha,
    camX,
    camY,
    zoom: cs.zoom,
    playing: inst.playing,
    // 法阵外圈那圈波纹线要的是**整条频谱的形状**，不是几个分组能量
    bands: A.bands,
    bandsLive: A.bandsLive,
    tempoPulse: inst.tempoPulse,
  };
  const t = now / 1000;
  inst.scene.frame(t, dt, st);
  inst.dust.frame(t, dt, Object.assign({}, st, { density: inst.prog.particles }));

  // 远景（整窗背景层）：只做最小的视差位移，让「深空」比法阵动得少
  if (refs.void) {
    refs.void.style.transform =
      "translate3d(" + (camX * 0.18).toFixed(2) + "px, " + (camY * 0.18).toFixed(2) + "px, 0) scale(1.04)";
  }
  // 歌词层：镜头位移 + 缩放（transform-origin 在 CSS 里钉在焦点上）
  refs.runes.style.transform =
    "translate3d(" + camX.toFixed(2) + "px, " + camY.toFixed(2) + "px, 0) scale(" + cs.zoom.toFixed(4) + ")";

  // —— HUD：四根元素电平条（低频 / 贝斯 / 中频 / 高频）——
  putVars(refs.eq, inst.eqVars, {
    "--ar-eq0": clamp(A.low, 0.1, 1).toFixed(3),
    "--ar-eq1": clamp(A.bass, 0.1, 1).toFixed(3),
    "--ar-eq2": clamp(A.mid, 0.1, 1).toFixed(3),
    "--ar-eq3": clamp(A.high, 0.1, 1).toFixed(3),
    "--ar-glow": clamp(A.thunder * 0.8 + A.onset * 0.4, 0, 1).toFixed(3),
  });

  // —— 歌词进度（逐字点亮）——
  paintHold(inst.activeIndex, inst.position);
}

function step(now) {
  if (!inst) return;
  inst.raf = 0;
  if (inst.closed) return;

  const playing = inst.playing && inst.anim;
  const minFrame = 1000 / (playing ? FPS_PLAYING : FPS_IDLE);
  if (!inst.last) inst.last = now - 1000 / 30;
  const since = now - inst.last;
  if (since < minFrame - 1) {
    schedule();
    return;
  }
  const dt = Math.min(0.1, since / 1000);
  inst.last = now;
  paint(now, dt);

  // 暂停久了就停下来：画完最后一帧，不再占用 rAF
  if (!inst.playing && now - inst.idleSince > IDLE_STOP_MS) {
    inst.settled = true;
    stopLoop();
    return;
  }
  schedule();
}

function onVisibility() {
  if (!inst) return;
  if (document.hidden) {
    stopLoop();
  } else if (inst.anim && !inst.closed) {
    inst.settled = false;
    inst.idleSince = nowMs();
    schedule();
  }
}

/* ==========================================================================
   皮肤定义
   ========================================================================== */

export default defineSkin({
  apiVersion: 1,
  id: ID,
  name: "星阵咏唱",
  icon: "arcanum",
  order: 90,
  description: "纵深魔法舞台：法阵是乐器、歌词是咒语，镜头被歌词牵引",
  background: true,
  // 只要 32 段（与 audio.js#spectrum 的对数分桶一致）；宿主采样后推过来
  spectrum: 32,

  mount(ctx) {
    const interactive = ctx.options().interactive !== false;

    /* —— 整窗背景层：只有一层 CSS 深空（标题栏与底栏后面也是星空）—— */
    const bgRoot = ctx.backgroundRoot;
    if (bgRoot) {
      bgRoot.innerHTML = VOID_HTML;
      bgRoot.hidden = false;
    }

    /* —— 舞台（可交互的那一层）—— */
    ctx.root.innerHTML = SHELL_HTML;
    const shell = /** @type {HTMLElement|null} */ (ctx.root.querySelector(".ar-stage"));
    if (!shell) return;
    // 模板就在上面，选择器一定命中：把 Element 收窄成 HTMLElement
    const pick = (sel) => /** @type {HTMLElement} */ (shell.querySelector(sel));

    // 详情页外壳：安全区（标题栏 + 头部 / 底栏）要从它身上量，见 measureSafeArea()
    const pvEl = /** @type {HTMLElement|null} */ (shell.closest(".playerview"));

    const refs = {
      shell,
      void: bgRoot ? /** @type {HTMLElement|null} */ (bgRoot.querySelector(".ar-void")) : null,
      voidCover: /** @type {HTMLImageElement|null} */ (bgRoot ? bgRoot.querySelector(".ar-void__cover") : null),
      scene: pick(".ar-scene"),
      dust: pick(".ar-dust"),
      runes: pick(".ar-runes"),
      title: pick(".ar-hud__title"),
      artist: pick(".ar-hud__artist"),
      eq: pick(".ar-hud__bars"),
      elName: pick(".ar-hud__el-name"),
      hudSection: pick(".ar-hud__section"),
    };

    const rect = shell.getBoundingClientRect();
    const scene = createScene(/** @type {HTMLCanvasElement|null} */ (refs.scene));
    const dust = createDust(/** @type {HTMLCanvasElement|null} */ (refs.dust));
    const cam = createStageCamera({
      // lean 越大，当前句越靠近焦点（0.62 = 拽到焦点方向的六成）
      lean: 0.62,
      // 位移上限按舞台短边算：不要太野，但也不能小到"看不出在运镜"
      maxPanRatio: 0.19,
      // ★ 阻尼放长、速度上限压低：换句时镜头是**平滑滑过去**而不是"跟着跳"。
      //   0.48 → 0.85 让过渡更柔；速度上限 0.42 → 0.30 保证再快的连句也不甩镜头。
      followTau: 0.85,
      maxSpeedRatio: 0.3,
      // 自主漂移压到很小：它是"镜头一直在呼吸"的那一点点，不该看得出来在晃
      driftRatio: 0.004,
      // 轻震幅度再压一档（0.007 → 0.0035）：重拍时轻轻一颤就够了
      shakeRatio: 0.0035,
    });

    inst = {
      ctx,
      bgRoot,
      shell,
      // 外壳与头部：只用来量"安全区"（标题栏 + 头部 / 底栏），不参与渲染
      pvEl,
      headEl: /** @type {HTMLElement|null} */ (pvEl ? pvEl.querySelector(".playerview__head") : null),
      refs,
      scene,
      dust,
      cam,
      analyser: createElementAnalyzer(32),
      lines: [],
      sections: [],
      plans: new Map(),
      lineEls: new Map(),
      lyricsSig: "",
      activeIndex: -2,
      lastFocusLine: -1,
      holdCount: -1,
      position: 0,
      playing: false,
      anim: true,
      interactive,
      showLyrics: true,
      closed: false,
      settled: false,
      section: "verse",
      prog: { alpha: 0.3, spin: 0.5, particles: 0.5, camZoom: 0, camSpeed: 0.85 },
      eqVars: {},
      tempoPulse: 0,
      /** 用户设置的歌词字号（px）与窗口适配倍数：行带布局要用它们估宽度 */
      lyricSize: 0,
      fitScale: 1,
      stageW: Math.max(1, rect.width),
      stageH: Math.max(1, rect.height),
      /** 安全区上下留白（px，舞台坐标）：歌词行带 / HUD 不许越过它们 */
      safeTop: 0,
      safeBottom: 0,
      raf: 0,
      last: 0,
      idleSince: nowMs(),
      observer: null,
      offFns: [],
    };

    /* —— 交互：一律走 ctx.actions ——
       ★ 舞台里已经没有"圆形封面"这个可点元素了：封面改成整窗模糊背景之后，
       它是**背景**不是控件。更换封面仍然走详情页头部那颗按钮
       （#btn-player-cover，宿主自己的 UI），皮肤不必再复刻一份入口。 */
    if (interactive) {
      const onRunesClick = (e) => {
        const el = e.target && e.target.closest ? e.target.closest(".ar-line") : null;
        if (!el) return;
        const ms = Number(el.dataset.time);
        if (Number.isFinite(ms)) ctx.actions.seek(ms);
      };
      refs.runes.addEventListener("click", onRunesClick);
      inst.offFns.push(() => refs.runes.removeEventListener("click", onRunesClick));

      /* 键盘：Enter / 空格跳到聚焦的那句。
         ★ 不自己做 roving tabindex —— 只渲染当前句前后共 6 行（见 syncWindow），
         所以整页的 tab 停留点最多 6 个；这和「每一行都是 tab stop」的老实现
         （60 行的歌 = 60 个停留点）不是一回事。 */
      const onRunesKey = (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const el = e.target && e.target.closest ? e.target.closest(".ar-line") : null;
        if (!el) return;
        e.preventDefault();
        const ms = Number(el.dataset.time);
        if (Number.isFinite(ms)) ctx.actions.seek(ms);
      };
      refs.runes.addEventListener("keydown", onRunesKey);
      inst.offFns.push(() => refs.runes.removeEventListener("keydown", onRunesKey));
    }

    /* —— 安全区 + 窗口适配比例 ——
       安全区 = 详情页外壳里"被 chrome 占住的那两块"（上：标题栏 + 头部，
       下：底栏）。它是从 .playerview 的盒子与头部高度量出来的，所以主窗口
       与桌面背景歌词窗口（没有标题栏 / 底栏）都自动得到正确的值。
       适配倍数按安全区短边算（而不是整窗）：舞台虽然铺满整窗，构图的"设计
       尺寸"仍然以安全区为基准，否则同一套设计值会因为窗口变高而整体放大。 */
    measureSafeArea();
    applyStageFit();

    /* —— 尺寸变化：画布跟上 + 歌词行带 / 落点重算 —— */
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(() => {
        if (!inst) return;
        const r = shell.getBoundingClientRect();
        const grew = Math.abs(r.width - inst.stageW) > 8 || Math.abs(r.height - inst.stageH) > 8;
        inst.stageW = Math.max(1, r.width);
        inst.stageH = Math.max(1, r.height);
        cam.resize(inst.stageW, inst.stageH);
        scene.resize();
        dust.resize();
        // 安全区跟着窗口一起变（底栏在窄窗口下会换高度），先量再算适配倍数
        measureSafeArea();
        applyStageFit();
        // 舞台尺寸变了 → 每句的宽度适配与行带落点都要重算（不清缓存会长句子出画）
        if (grew) rebuildLines();
        else
          for (const [i, el] of inst.lineEls) if (el.dataset.state === "past") setLineState(el, i, inst.activeIndex);
        if (!inst.anim) paintOnce();
      });
      ro.observe(shell);
      inst.observer = ro;
    }

    document.addEventListener("visibilitychange", onVisibility);

    cam.resize(inst.stageW, inst.stageH);
    refreshPalette();
    scene.resize();
    dust.resize();
    paintSong();
    applyOptions();

    const media = ctx.media();
    setLyrics(media.lyrics.lines);
    setActive(media.lyrics.index, true);
    inst.position = Number(ctx.playback().position) || 0;
    inst.playing = Boolean(ctx.playback().playing);
    paintOnce();
    if (inst.anim) schedule();
  },

  update(ctx, patch) {
    if (!inst) return;
    const type = patch && patch.type;

    if (type === "close") {
      inst.closed = true;
      stopLoop();
      return;
    }
    if (type === "destroy") return;

    if (inst.closed) {
      inst.closed = false;
      if (inst.anim && !inst.raf) {
        inst.last = 0;
        schedule();
      }
    }
    if (inst.bgRoot && inst.bgRoot.hidden) inst.bgRoot.hidden = false;
    // 任何更新都算「活跃」：暂停静止后收到推送就要重新动起来
    inst.settled = false;
    inst.idleSince = nowMs();
    if (inst.anim && !inst.raf) {
      inst.last = 0;
      schedule();
    }

    switch (type) {
      case "mount": {
        applyOptions();
        paintSong();
        const media = ctx.media();
        setLyrics(media.lyrics.lines);
        setActive(media.lyrics.index, true);
        inst.position = Number(ctx.playback().position) || 0;
        inst.playing = Boolean(ctx.playback().playing);
        refreshPalette();
        break;
      }
      case "song": {
        const media = ctx.media();
        paintSong();
        setLyrics(media.lyrics.lines);
        setActive(media.lyrics.index, true);
        inst.position = 0;
        inst.lastFocusLine = -1;
        inst.cam.reset();
        inst.section = "verse";
        inst.prog = { alpha: 0.3, spin: 0.5, particles: 0.5, camZoom: 0, camSpeed: 0.85 };
        // 换歌只撒一把光尘：早先还会 scene.event("flash") 从中心推一个亮环，
        // 那正是"有时候从中间扩散一个圈圈闪一下"的来源之一
        inst.dust.burst(14);
        break;
      }
      case "media":
        paintSong();
        break;
      case "lyrics": {
        const media = ctx.media();
        setLyrics(media.lyrics.lines);
        setActive(media.lyrics.index, true);
        break;
      }
      case "progress": {
        inst.position = Number.isFinite(patch.position) && patch.position > 0 ? patch.position : 0;
        const idx = Number.isFinite(patch.lyricIndex) ? patch.lyricIndex : ctx.media().lyrics.index;
        if (idx !== inst.activeIndex) setActive(idx);
        inst.playing = Boolean(patch.playing);
        break;
      }
      case "state":
        inst.playing = Boolean(patch.playing);
        inst.idleSince = nowMs();
        break;
      case "spectrum":
        inst.analyser.update(patch.bands);
        break;
      case "options":
        applyOptions();
        break;
      case "theme":
        refreshPalette();
        break;
      case "resize":
        if (Number(patch.width) > 0) {
          inst.stageW = Math.max(1, Number(patch.width));
          inst.stageH = Math.max(1, Number(patch.height) || inst.stageH);
          inst.cam.resize(inst.stageW, inst.stageH);
          inst.scene.resize();
          inst.dust.resize();
          measureSafeArea();
          applyStageFit();
          rebuildLines();
        }
        break;
      default:
        break;
    }
  },

  destroy(ctx) {
    if (!inst) return;
    const cur = inst;
    inst = null;

    stopLoop();
    document.removeEventListener("visibilitychange", onVisibility);
    for (const off of cur.offFns) {
      try {
        off();
      } catch (err) {
        /* 忽略：清理阶段不应该再抛错打断宿主 */
      }
    }
    cur.offFns = [];
    if (cur.observer) cur.observer.disconnect();
    cur.observer = null;
    cur.scene.destroy();
    cur.dust.destroy();
    cur.lineEls.clear();
    cur.plans.clear();
    if (cur.bgRoot) {
      cur.bgRoot.hidden = true;
      cur.bgRoot.innerHTML = "";
    }
    ctx.root.innerHTML = "";
  },
});
