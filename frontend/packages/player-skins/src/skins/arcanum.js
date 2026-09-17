// @ts-check
/* ==========================================================================
   arcanum.js — 播放界面样式「星阵咏唱」（id: arcanum）
   --------------------------------------------------------------------------
   需求原文（这一版要推翻的东西）：「左封面右歌词」→「一个会运镜的魔法舞台，
   歌词是咒语，法阵是乐器，封面是法器」。落到实现上是四句话：

     · **歌词 = 咒语**：没有滚动列表。当前句被拆成字素散落在舞台空间里，
       每个字按自己的时间轴、用自己的「入场魔法」出现（十种方式见 CSS）；
       关键词大而亮，连接词小而暗。唱完的句子飞向法阵外环、缩成一枚符文淡出。
     · **法阵 = 乐器**：法阵画在 canvas 上，由频谱驱动的「奥术七元素」控制 ——
       低频震底座与裂纹、贝斯泛涟漪、中频起风线、高频亮星座、重拍炸脉冲环、
       长音立光柱、停顿落暗雾。
     · **镜头 = 观众视线**：镜头跟着最新歌词节点走（提前 0.26s 起步），
       有阻尼、有边界、有速度上限；副歌拉远、长音推近、重拍轻震。
     · **封面 = 法器**：不再是左栏里的一张图，而是法阵中心的水晶核心，
       点它就是「更换封面」。

   为什么舞台在 ctx.root、只有「深空底色」放在整窗背景层：
   整窗背景层（.skin-bg）是 `pointer-events: none` 的装饰层，而这一版要求
   歌词与法器都能交互 —— 交互元素必须落在 ctx.root（详情页舞台，它本身就是
   `position: fixed; inset: 标题栏下方 → 底栏上方`，横向铺满整窗）。
   背景层只留一层 CSS 深空渐变，这样标题栏与底栏后面也是星空，观感是「一整块
   深空」，而不是「中间一块画布」。

   分工与纪律（与其它内置样式一致，见 README）：
     · 数据、动作全部走 ctx（不 import 应用内部模块、不碰 <audio> 状态）；
     · 频谱由宿主采样后推来（defineSkin 里声明 spectrum: 32），皮肤不碰 AudioContext；
     · 每帧只写 CSS 变量与 transform，**绝不触发 Lit 的响应式更新**；
     · 页面不可见 / 暂停久了 / 用户关掉动画 → 停 rAF，只留一帧静态画面。
   ========================================================================== */

import { defineSkin } from "../contract.js";
import { EMPTY_TRACK, lyricsEmptyText, setCoverImage, subtitleOf } from "../html.js";
import { applyFit } from "../fit.js";
import { prefersReducedMotion } from "../fx-camera.js";
import { ELEMENT_NAME, createElementAnalyzer } from "../arcanum-audio.js";
import { createStageCamera } from "../arcanum-stage.js";
import {
  BAND_BOTTOM,
  BAND_TOP,
  FONT_MUL,
  LYRIC_BANDS,
  SECTION_PROGRAMS,
  detectSections,
  hashStr,
  planLine,
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
 * ★ BACK + FWD + 1 必须 ≤ LYRIC_BANDS（6）：每句话固定落在第 (index % 6) 条
 * 横行带上，同屏显示的行数不超过行带数时，"任意两句都不可能落在同一条带上"
 * —— 这就是"歌词永远不重叠"的结构性保证（见 arcanum-timing.js 文件头）。
 * 前面只留 1 句：上一句正在飞向法阵外环，留 1 句够它飞完。
 */
const BACK = 1;
const FWD = 4;

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

/** 整窗背景层：只有一层 CSS 深空（静态星星 + 两层雾），不做任何动画循环 */
const VOID_HTML =
  '<div class="ar-void" aria-hidden="true">' +
  '<div class="ar-void__sky"></div>' +
  '<div class="ar-void__stars"></div>' +
  '<div class="ar-void__fog"></div>' +
  '<div class="ar-void__vignette"></div>' +
  "</div>";

/** 舞台：法阵画布 / 法器 / 咒语符文 / 前景粒子 / HUD */
const SHELL_HTML =
  '<div class="ar-stage" data-anim="on" data-passive="0" data-clear="0" data-lyrics="on" data-section="verse">' +
  '<canvas class="ar-scene" aria-hidden="true"></canvas>' +
  '<div class="ar-core">' +
  '<span class="ar-core__ring"></span>' +
  '<span class="ar-core__artwrap"><img class="ar-core__art" alt="" /></span>' +
  '<span class="ar-core__pin"></span>' +
  "</div>" +
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
 * 舞台布局参数（交给纯逻辑模块算行带与宽度适配）。
 *
 * 字号与窗口尺寸都会影响"这一句占多宽、会不会顶到边上"，所以它必须在
 * 字号变化与窗口尺寸变化时重算 —— 重算之后计划缓存整个作废（见 rebuildLines）。
 */
function layoutConfig() {
  const fit = inst.fitScale || 1;
  const fontPx = Math.max(6, (inst.lyricSize || 16) * FONT_MUL * fit);
  const W = Math.max(160, inst.stageW || 160);
  return {
    bands: LYRIC_BANDS,
    top: BAND_TOP,
    bottom: BAND_BOTTOM,
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
    span.style.setProperty("--ar-d", u.delayMs + "ms");
    span.style.setProperty("--ar-du", u.durMs + "ms");
    frag.appendChild(span);
  }
  el.appendChild(frag);
  applyNodeVars(el, plan.node.x * 100, plan.node.y * 100, plan.node.r, plan.node.s);
  return el;
}

function setLineState(el, index, activeIndex) {
  const plan = planFor(index);
  if (!plan) return;
  const ahead = index - activeIndex;
  let state = "far";
  if (ahead === 0) state = "active";
  else if (ahead < 0) state = "past";
  else if (ahead === 1) state = "near";
  else if (ahead <= 3) state = "next";

  if (el.dataset.state !== state) {
    el.dataset.state = state;
    // 同一句再次成为当前句时（拖进度条来回）要重放入场动画：
    // CSS 只认 [data-state="active"]，状态一变选择器重新匹配、动画自然重放
    if (state === "active") el.dataset.enter = String(Number(el.dataset.enter || 0) + 1);
  }

  if (state === "past") {
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
  const emphasis = state === "active" ? 1 : state === "near" ? 0.74 : state === "next" ? 0.62 : 0.52;
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
 * 计划里烘了"占多宽、落在哪条带的哪一段"，不重算的话窗口一改大小，
 * 长句子就会顶到边上（甚至出画）。
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
  setCoverImage(inst.refs.art, media.cover, inst.ctx.defaultCover);
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

function onSectionChange(next) {
  if (!inst) return;
  if (next === "bridge") {
    // 桥段：法阵碎裂重组
    inst.scene.event("shatter");
    inst.dust.burst(10);
  } else if (next === "chorus") {
    inst.scene.event("flash");
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
    if (inst.anim) inst.scene.event("flash");
  }

  // —— 镜头：先定「该看哪一句」（带提前量），再推进 ——
  if (inst.showLyrics && inst.lines.length) {
    const focus = resolveFocus(inst.lines, inst.position, LEAD_MS);
    const plan = planFor(focus.target);
    if (plan) cam.aim(plan.node);
    if (focus.active >= 0 && focus.active !== inst.lastFocusLine) {
      inst.lastFocusLine = focus.active;
      inst.tempoPulse = 1;
      if (inst.anim) cam.pulse(inst.section === "chorus" ? 0.85 : 0.5);
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

    const refs = {
      shell,
      void: bgRoot ? /** @type {HTMLElement|null} */ (bgRoot.querySelector(".ar-void")) : null,
      scene: pick(".ar-scene"),
      dust: pick(".ar-dust"),
      runes: pick(".ar-runes"),
      core: pick(".ar-core"),
      art: /** @type {HTMLImageElement} */ (pick(".ar-core__art")),
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
      followTau: 0.48,
      maxSpeedRatio: 0.42,
      driftRatio: 0.009,
      shakeRatio: 0.007,
    });

    inst = {
      ctx,
      bgRoot,
      shell,
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
      raf: 0,
      last: 0,
      idleSince: nowMs(),
      observer: null,
      offFns: [],
    };

    /* —— 交互：一律走 ctx.actions —— */
    if (interactive) {
      refs.core.setAttribute("role", "button");
      refs.core.setAttribute("tabindex", "0");
      refs.core.setAttribute("aria-label", "更换封面");
      const onCore = () => ctx.actions.openCoverPanel();
      refs.core.addEventListener("click", onCore);
      const onCoreKey = (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        ctx.actions.openCoverPanel();
      };
      refs.core.addEventListener("keydown", onCoreKey);
      inst.offFns.push(() => refs.core.removeEventListener("click", onCore));
      inst.offFns.push(() => refs.core.removeEventListener("keydown", onCoreKey));

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
    } else {
      refs.core.setAttribute("aria-hidden", "true");
      refs.core.setAttribute("tabindex", "-1");
    }

    /* —— 窗口适配比例（见 fit.js）：整窗背景投到桌面时会等比放大 —— */
    inst.fitScale = applyFit(shell, "--ar-fit");

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
        inst.fitScale = applyFit(shell, "--ar-fit");
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
        inst.scene.event("flash");
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
