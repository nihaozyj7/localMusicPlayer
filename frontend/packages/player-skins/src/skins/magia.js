/* ==========================================================================
   skin.js — 播放界面样式「魔法阵 · 手绘次元」（id: magia）
   --------------------------------------------------------------------------
   这是一个**第三方样式包**：浏览器直接 import 的原生 ES module，
   没有打包器、没有 npm 依赖、不发任何网络请求。

   它做四件事：
     1. 整窗手绘动画背景（ctx.backgroundRoot）：手绘线条的天空 / 月亮 /
        城市天际线 / 云带 + 透视网格 + 巨大魔法阵 + Canvas 粒子 + 扫描线；
     2. 播放详情页舞台（ctx.root）：唱片 + 魔法阵 + HUD 取景框 + 曲目信息；
     3. 逐字 / 逐词歌词：每个字的字号不同、错峰入场，并按行内进度逐个点亮，
        点某一行歌词即跳到该行时间（唯一的鼠标功能）；
     4. 运镜：完全由时间驱动（自主漂移 + 换行脉冲 + 换歌切镜），不跟随鼠标。

   界面里**没有自己的进度条**：进度数据只用来驱动歌词的行内点亮与自动居中，
   进度条由应用底栏那一套负责。鼠标悬停 / 按下也不产生任何动效。

   数据全部来自 ctx（media / playback / options），动作全部走 ctx.actions，
   不 import 应用内部模块、不碰 <audio>、不轮询（只在 rAF 里推进动画）。
   ========================================================================== */

import { defineSkin } from "../contract.js";
import "./magia.css";

const ID = "magia";

/* ==========================================================================
   0. 小工具
   ========================================================================== */

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/** 确定性随机数：同一份种子每次生成同样的手绘图形，不会每次挂载都换一张画 */
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

/** 字符串散列：给「同一个字在别处也长一样」提供稳定的随机源 */
function hashStr(s) {
  let h = 2166136261;
  const str = String(s || "");
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function parseRgb(str) {
  if (!str) return null;
  const m = /rgba?\(([^)]+)\)/i.exec(String(str));
  if (!m) return null;
  const parts = m[1]
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length < 3 || !parts.slice(0, 3).every((n) => Number.isFinite(n))) return null;
  return [clamp(parts[0], 0, 255), clamp(parts[1], 0, 255), clamp(parts[2], 0, 255)];
}

/**
 * 把任意 CSS 颜色字符串解析成 [r,g,b]。
 * 主题令牌派生的颜色可能是 color-mix() / oklab() / color(srgb …)，
 * 直接正则解析会漏 —— 所以先借 canvas 的 fillStyle 让浏览器自己归一化。
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

/** 从宿主容器上读出主题派生出来的粒子配色 */
function readPalette(host, canvas) {
  const fallback = [
    [224, 224, 232],
    [214, 156, 196],
    [186, 156, 226],
  ];
  if (!host || typeof document === "undefined") return fallback;
  const g = canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  const probe = document.createElement("span");
  probe.className = "mg-probe";
  probe.setAttribute("aria-hidden", "true");
  host.appendChild(probe);
  const out = [];
  const names = ["--mg-a1", "--mg-a2", "--mg-a3"];
  for (let i = 0; i < names.length; i += 1) {
    let raw = "";
    try {
      probe.style.color = `var(${names[i]})`;
      raw = window.getComputedStyle(probe).color;
    } catch (err) {
      raw = "";
    }
    out.push(parseCssColor(raw, g) || fallback[i]);
  }
  probe.remove();
  return out;
}

/* ==========================================================================
   1. 手绘 SVG 工具
   --------------------------------------------------------------------------
   「手绘感」不是靠 SVG 滤镜（feTurbulence + feDisplacementMap 在整窗尺寸上
   每帧都要重算，代价很高），而是把每个点先抖一下再连成折线 ——
   线条天然带毛边，且是静态路径，旋转/缩放都走合成器。
   ========================================================================== */

function toPath(pts) {
  if (!pts || !pts.length) return "";
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i += 1) d += `L${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
  return d;
}

/** 沿折线加密重采样 + 法线方向抖动 */
function jitter(pts, rnd, amp) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const x1 = pts[i][0];
    const y1 = pts[i][1];
    const x2 = pts[i + 1][0];
    const y2 = pts[i + 1][1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const steps = Math.max(1, Math.round(len / 30));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const k = (rnd() * 2 - 1) * amp;
      out.push([x1 + dx * t + nx * k, y1 + dy * t + ny * k]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function roughLine(pts, rnd, amp) {
  return toPath(jitter(pts, rnd, amp));
}

/** 手绘圆：半径带轻微起伏的闭合折线 */
function wobbleCircle(cx, cy, r, rnd, amp, seg) {
  const n = seg || 72;
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const rr = r + (rnd() * 2 - 1) * amp;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return toPath(pts);
}

/** 手绘矩形：四个角各抖一下 */
function rectRough(rnd, x, y, w, h, amp) {
  const j = (px, py) => [px + (rnd() * 2 - 1) * amp, py + (rnd() * 2 - 1) * amp];
  return toPath([j(x, y), j(x + w, y), j(x + w, y + h), j(x, y + h), j(x, y)]);
}

/** n 角星（spikes=3 时是三角形，spikes=7 时是七芒星） */
function starPath(cx, cy, outer, inner, spikes) {
  const pts = [];
  const rot = -Math.PI / 2;
  for (let i = 0; i < spikes * 2; i += 1) {
    const r = i % 2 ? inner : outer;
    const a = rot + (i * Math.PI) / spikes;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  pts.push(pts[0]);
  return toPath(pts);
}

/** 四角闪光 */
function sparkle(cx, cy, r) {
  const k = r * 0.17;
  return (
    `M${cx.toFixed(2)} ${(cy - r).toFixed(2)}` +
    `Q${(cx + k).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)}` +
    `Q${(cx + k).toFixed(2)} ${(cy + k).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)}` +
    `Q${(cx - k).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)}` +
    `Q${(cx - k).toFixed(2)} ${(cy - k).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)}Z`
  );
}

/* ==========================================================================
   2. 背景美术：二次元手绘动画风
   ========================================================================== */

function skyline(rnd, baseY, minH, maxH, withWindows) {
  let x = -60;
  let out = "";
  let guard = 0;
  while (x < 1680 && guard < 90) {
    guard += 1;
    const w = 34 + rnd() * 92;
    const h = minH + rnd() * (maxH - minH);
    out += `<path class="mg-art__tower" d="${rectRough(rnd, x, baseY - h, w, h, 2.2)}"/>`;
    if (h > maxH * 0.7 && rnd() > 0.42) {
      const ax = x + w * (0.22 + rnd() * 0.56);
      out += `<path class="mg-art__antenna" d="${roughLine(
        [
          [ax, baseY - h],
          [ax, baseY - h - (16 + rnd() * 34)],
        ],
        rnd,
        1.1
      )}"/>`;
    }
    if (withWindows) {
      const cols = Math.max(1, Math.floor(w / 24));
      const rows = Math.max(1, Math.floor(h / 36));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          if (rnd() > 0.78) {
            const wx = x + 9 + (c * (w - 20)) / cols;
            const wy = baseY - h + 14 + (r * (h - 26)) / rows;
            const delay = (-rnd() * 5.4).toFixed(2);
            out += `<rect class="mg-art__win" x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="${(
              4 + rnd() * 5
            ).toFixed(1)}" height="${(5 + rnd() * 4).toFixed(1)}" rx="0.6" style="animation-delay:${delay}s"/>`;
          }
        }
      }
    }
    x += w + 4 + rnd() * 18;
  }
  return out;
}

/** 横梁：中间微垂、两端上翘的手绘闭合形状 */
function beamPath(rnd, x0, x1, y, thick, sag) {
  const top = [];
  const bot = [];
  const steps = 8;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const drop = Math.sin(Math.PI * t) * sag;
    top.push([x, y + drop]);
    bot.push([x, y + drop + thick]);
  }
  bot.reverse();
  return `${toPath(jitter([...top, ...bot], rnd, 1.2))}Z`;
}

/* 鸟居：二次元场景里最好认的一个剪影，两根立柱 + 笠木 + 贯 */
function toriiPath(rnd, x, baseY, w, h) {
  const postW = w * 0.078;
  const topY = baseY - h;
  let s = "";
  s += `<path class="mg-art__post" d="${rectRough(rnd, x, topY + h * 0.07, postW, h * 0.93, 1.6)}"/>`;
  s += `<path class="mg-art__post" d="${rectRough(rnd, x + w - postW, topY + h * 0.07, postW, h * 0.93, 1.6)}"/>`;
  s += `<path class="mg-art__torii" d="${beamPath(rnd, x - w * 0.16, x + w * 1.16, topY, h * 0.082, h * 0.034)}"/>`;
  s += `<path class="mg-art__torii" d="${beamPath(rnd, x - w * 0.05, x + w * 1.05, topY + h * 0.26, h * 0.062, h * 0.014)}"/>`;
  return s;
}

/* 飘落的花瓣：纯 CSS 逐个元素动，不用定时器 */
function buildPetals(count) {
  const rnd = mulberry32(0x1f3d5b79);
  let out = "";
  for (let i = 0; i < count; i += 1) {
    const x = (i / count) * 100 + rnd() * 6;
    const dur = 11 + rnd() * 12;
    const delay = -rnd() * dur;
    const scale = 0.7 + rnd() * 0.9;
    const sway = (rnd() * 2 - 1) * 14;
    const spin = 420 + rnd() * 620;
    out += `<span class="mg-petal" style="--x:${x.toFixed(1)}%;--t:${dur.toFixed(1)}s;--d:${delay.toFixed(
      1
    )}s;--s:${scale.toFixed(2)};--px:${sway.toFixed(1)}vw;--pr:${spin.toFixed(0)}deg"></span>`;
  }
  return out;
}

function buildBackdrop(uid) {
  const rnd = mulberry32(0x51ed270b);
  const W = 1600;
  const H = 900;
  let out = "";

  /* —— 月亮（摆在最右侧，不压住歌词栏）—— */
  const mx = 1312;
  const my = 178;
  const mr = 118;
  out += `<path class="mg-art__moonloom" d="${wobbleCircle(mx, my, mr * 1.34, rnd, 7, 84)}"/>`;
  out += `<path class="mg-art__moon" d="${wobbleCircle(mx, my, mr, rnd, 3.2, 84)}"/>`;
  for (let i = 0; i < 4; i += 1) {
    const a = rnd() * Math.PI * 2;
    const d = 30 + rnd() * (mr - 58);
    out += `<path class="mg-art__crater" d="${wobbleCircle(
      mx + Math.cos(a) * d,
      my + Math.sin(a) * d,
      9 + rnd() * 22,
      rnd,
      1.3,
      36
    )}"/>`;
  }

  /* —— 远山 —— */
  const ridge = (baseY, amp, step, cls) => {
    const pts = [];
    for (let x = -80; x <= W + 80; x += step) {
      const y =
        baseY +
        Math.sin(x * 0.0027) * amp +
        Math.sin(x * 0.0071 + 1.7) * amp * 0.42 +
        (rnd() * 2 - 1) * amp * 0.16;
      pts.push([x, y]);
    }
    return `<path class="${cls}" d="${toPath(jitter(pts, rnd, 2.1))}L${W + 80} ${H + 40}L-80 ${H + 40}Z"/>`;
  };
  out += ridge(508, 62, 40, "mg-art__ridge mg-art__ridge--far");
  out += ridge(586, 44, 34, "mg-art__ridge mg-art__ridge--near");

  /* —— 云带 —— */
  const cloud = (y, thick, x0, x1) => {
    const top = [];
    const bot = [];
    const steps = Math.max(6, Math.round((x1 - x0) / 42));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const bell = Math.pow(Math.sin(Math.PI * t), 0.7);
      top.push([x, y - bell * thick * (0.5 + rnd() * 0.85)]);
      bot.push([x, y + bell * thick * (0.18 + rnd() * 0.42)]);
    }
    bot.reverse();
    return `${toPath([...top, ...bot])}Z`;
  };
  out += `<path class="mg-art__cloud" d="${cloud(198, 54, -40, 620)}"/>`;
  out += `<path class="mg-art__cloud" d="${cloud(296, 38, 420, 1220)}"/>`;
  out += `<path class="mg-art__cloud" d="${cloud(402, 46, 60, 900)}"/>`;
  out += `<path class="mg-art__cloud" d="${cloud(556, 30, 900, 1660)}"/>`;

  /* —— 城市天际线（矩形 + 天线 + 会眨的窗）—— */
  out += skyline(rnd, 642, 46, 150, false);
  out += skyline(rnd, 706, 30, 108, true);

  /* —— 中景的鸟居剪影（二次元场景的固定班底）—— */
  out += toriiPath(rnd, 622, 802, 258, 302);

  /* —— 笔触 / 速度线 —— */
  for (let i = 0; i < 18; i += 1) {
    const x = rnd() * W;
    const y = rnd() * H;
    const len = 120 + rnd() * 420;
    const ang = ((-25 + rnd() * 13) * Math.PI) / 180;
    const thick = 1.4 + rnd() * 5.5;
    const dx = Math.cos(ang) * len;
    const dy = Math.sin(ang) * len;
    const nx = -Math.sin(ang) * thick * 0.5;
    const ny = Math.cos(ang) * thick * 0.5;
    out += `<path class="mg-art__brush" d="${toPath(
      jitter(
        [
          [x + nx, y + ny],
          [x + dx + nx * 0.25, y + dy + ny * 0.25],
          [x + dx - nx * 0.25, y + dy - ny * 0.25],
          [x - nx, y - ny],
          [x + nx, y + ny],
        ],
        rnd,
        1.1
      )
    )}Z"/>`;
  }

  /* —— 闪光 —— */
  for (let i = 0; i < 30; i += 1) {
    const x = 40 + rnd() * (W - 80);
    const y = 30 + rnd() * (H - 90);
    const delay = (-rnd() * 4.2).toFixed(2);
    out += `<path class="mg-art__spark" d="${sparkle(x, y, 4 + rnd() * 13)}" style="animation-delay:${delay}s"/>`;
  }

  /* —— 半调网点面板（漫画网点纸）—— */
  const defs = `<defs><pattern id="${uid}-dots" width="8" height="8" patternUnits="userSpaceOnUse"><circle class="mg-art__dot" cx="2" cy="2" r="1.35"/></pattern></defs>`;
  out += `<path class="mg-art__tone" d="${rectRough(rnd, 96, 104, 236, 172, 7)}" fill="url(#${uid}-dots)"/>`;
  out += `<path class="mg-art__tone" d="${rectRough(rnd, 1320, 592, 210, 150, 7)}" fill="url(#${uid}-dots)"/>`;

  /* —— 手绘外框 + 两道地平线 —— */
  out += `<path class="mg-art__frame" d="${rectRough(rnd, 46, 40, W - 92, H - 80, 5)}"/>`;
  out += `<path class="mg-art__frame2" d="${rectRough(rnd, 58, 52, W - 116, H - 104, 4)}"/>`;
  out += `<path class="mg-art__band" d="${roughLine([[-40, 806], [W + 40, 792]], rnd, 2.4)}"/>`;
  out += `<path class="mg-art__band" d="${roughLine([[-40, 832], [W + 40, 818]], rnd, 2.4)}"/>`;

  return `<svg class="mg-art" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${defs}${out}</svg>`;
}

/* ==========================================================================
   3. 魔法阵
   ========================================================================== */

/** 12 个「符文」笔画，画在 7.4 × 9 的小方框里（不依赖任何字体，保证能渲染） */
const RUNE_GLYPHS = [
  "M1 1L1 9M1 3.4L6.4 1",
  "M6.4 1L1 9M1 1L6.4 9M1 9L6.4 9",
  "M1 1L1 9L6.4 9L6.4 1",
  "M1 4.2L6.4 1M1 4.2L6.4 7.6M1 4.2L6.4 4.2",
  "M1 1L1 9M1 5L6.4 1M1 5L6.4 9",
  "M3.6 1L1 9M3.6 1L6.4 9",
  "M1 9L1 1L6.4 4.2L1 7.4",
  "M1 1L6.4 1M1 5L6.4 5M1 9L6.4 9",
  "M6.4 1L1 5L6.4 9",
  "M1 1L1 9M6.4 1L6.4 9M1 5L6.4 5",
  "M1 1L6.4 4.2L1 7.4L6.4 9",
  "M3.6 1L3.6 9M1 4L6.4 4",
];

function buildSigil() {
  const rnd = mulberry32(0x2f9a1c7d);
  const C = 100;

  /* —— 外圈：双环 + 刻度 + 符文环 —— */
  let a = `<path class="mg-sig__line mg-sig__line--strong" d="${wobbleCircle(C, C, 94, rnd, 0.7, 96)}"/>`;
  a += `<path class="mg-sig__line mg-sig__line--faint" d="${wobbleCircle(C, C, 89, rnd, 0.6, 96)}"/>`;
  let ticks = "";
  for (let i = 0; i < 60; i += 1) {
    const ang = (i / 60) * Math.PI * 2;
    const long = i % 5 === 0;
    const r1 = long ? 82 : 85.5;
    const r2 = 88.5;
    ticks += `M${(C + Math.cos(ang) * r1).toFixed(2)} ${(C + Math.sin(ang) * r1).toFixed(2)}L${(
      C +
      Math.cos(ang) * r2
    ).toFixed(2)} ${(C + Math.sin(ang) * r2).toFixed(2)}`;
  }
  a += `<path class="mg-sig__line" d="${ticks}"/>`;
  let runes = "";
  for (let i = 0; i < 12; i += 1) {
    const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const x = C + Math.cos(ang) * 72;
    const y = C + Math.sin(ang) * 72;
    const deg = (ang * 180) / Math.PI + 90;
    runes += `<path class="mg-sig__rune" transform="translate(${x.toFixed(2)} ${y.toFixed(
      2
    )}) rotate(${deg.toFixed(1)}) translate(-3.7 -4.5)" d="${RUNE_GLYPHS[i]}"/>`;
  }
  a += runes;
  a += `<path class="mg-sig__line mg-sig__line--faint" d="${wobbleCircle(C, C, 64, rnd, 0.6, 72)}"/>`;

  /* —— 中圈：七芒星 + 三角 + 细环 —— */
  let b = `<path class="mg-sig__star" d="${starPath(C, C, 58, 26, 7)}"/>`;
  b += `<path class="mg-sig__line" d="${starPath(C, C, 44, 44, 3)}"/>`;
  b += `<path class="mg-sig__line mg-sig__line--faint" d="${wobbleCircle(C, C, 52, rnd, 0.5, 60)}"/>`;

  /* —— 内核：辐射线 + 星核 —— */
  let c = "";
  let spokes = "";
  for (let i = 0; i < 24; i += 1) {
    const ang = (i / 24) * Math.PI * 2;
    const r1 = i % 2 === 0 ? 20 : 28;
    const r2 = i % 2 === 0 ? 38 : 40;
    spokes += `M${(C + Math.cos(ang) * r1).toFixed(2)} ${(C + Math.sin(ang) * r1).toFixed(2)}L${(
      C +
      Math.cos(ang) * r2
    ).toFixed(2)} ${(C + Math.sin(ang) * r2).toFixed(2)}`;
  }
  c += `<path class="mg-sig__line" d="${spokes}"/>`;
  c += `<path class="mg-sig__line mg-sig__line--strong" d="${wobbleCircle(C, C, 30, rnd, 0.5, 48)}"/>`;
  c += `<path class="mg-sig__core" d="${starPath(C, C, 15, 5.2, 4)}"/>`;
  c += `<path class="mg-sig__core" d="${wobbleCircle(C, C, 5.2, rnd, 0.35, 24)}"/>`;

  return `<svg class="mg-sig" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
    <g class="mg-sig__spin mg-sig__spin--a">${a}</g>
    <g class="mg-sig__spin mg-sig__spin--b">${b}</g>
    <g class="mg-sig__spin mg-sig__spin--c">${c}</g>
  </svg>`;
}

/* ==========================================================================
   4. Canvas 粒子
   --------------------------------------------------------------------------
   三种粒子：上升的光点、缓慢旋转的符文轮廓、斜切而过的光条（矩形与线条）。
   光点用离屏精灵 + globalCompositeOperation="lighter" 画，避免每帧新建渐变。
   没有 2D 上下文（例如无 canvas 的环境）时整个模块降级成空操作。
   ========================================================================== */

function createParticles(canvas, host) {
  const g = canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  const rnd = mulberry32(0x77aa11);
  const state = {
    w: 0,
    h: 0,
    dpr: 1,
    list: [],
    colors: [],
    sprites: [],
    ready: false,
  };

  function makeSprite(rgb) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g2 = typeof c.getContext === "function" ? c.getContext("2d") : null;
    if (!g2) return null;
    const grad = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`);
    grad.addColorStop(0.32, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.4)`);
    grad.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    g2.fillStyle = grad;
    g2.fillRect(0, 0, 64, 64);
    return c;
  }

  function setColors(colors) {
    state.colors = colors.slice();
    state.sprites = state.colors.map(makeSprite);
    state.ready = state.sprites.some(Boolean);
  }

  function resize() {
    if (!g || !canvas) return;
    const w = Math.max(0, Math.round(canvas.clientWidth || (host ? host.clientWidth : 0) || 0));
    const h = Math.max(0, Math.round(canvas.clientHeight || (host ? host.clientHeight : 0) || 0));
    const dpr = Math.min(2, Math.max(1, (typeof window !== "undefined" && window.devicePixelRatio) || 1));
    if (w === state.w && h === state.h && dpr === state.dpr) return;
    state.w = w;
    state.h = h;
    state.dpr = dpr;
    if (w < 8 || h < 8) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawn(initial) {
    if (state.w < 8 || state.h < 8) return null;
    const roll = rnd();
    const kind = roll < 0.58 ? "mote" : roll < 0.85 ? "rune" : "streak";
    const p = {
      kind,
      x: rnd() * state.w,
      y: 0,
      vx: 0,
      vy: 0,
      r: 1,
      rot: 0,
      vr: 0,
      len: 0,
      life: 0,
      max: 1,
      ci: 0,
    };
    if (kind === "mote") {
      p.x = rnd() * state.w;
      p.y = initial ? rnd() * state.h : state.h + 12;
      p.r = 0.9 + rnd() * 2.6;
      p.vy = -(6 + rnd() * 26);
      p.vx = (rnd() * 2 - 1) * 10;
      p.max = 6 + rnd() * 9;
      p.ci = rnd() < 0.62 ? 0 : 1;
    } else if (kind === "rune") {
      p.y = initial ? rnd() * state.h : state.h + 20;
      p.r = 5 + rnd() * 8;
      p.vy = -(4 + rnd() * 14);
      p.vx = (rnd() * 2 - 1) * 8;
      p.vr = (rnd() * 2 - 1) * 40;
      p.rot = rnd() * Math.PI * 2;
      p.max = 8 + rnd() * 10;
      p.ci = 1;
    } else {
      p.x = state.w + 40 + rnd() * 120;
      p.y = rnd() * state.h;
      p.vy = 40 + rnd() * 150;
      p.vx = -(60 + rnd() * 220);
      p.len = 26 + rnd() * 80;
      p.max = 1.6 + rnd() * 2.2;
      p.ci = rnd() < 0.5 ? 0 : 2;
    }
    p.life = initial ? rnd() * p.max : 0;
    state.list.push(p);
    return p;
  }

  /** 换歌时喷一大团；每记节拍喷一小撮（count 默认 22） */
  function burst(count) {
    const target = clamp(Math.round((state.w * state.h) / 24000), 18, 96);
    const room = Math.max(0, Math.round(target * 1.5) - state.list.length);
    const n = Math.min(Number.isFinite(count) ? count : 22, room);
    for (let i = 0; i < n; i += 1) spawn(false);
  }

  function frame(dt, opts) {
    if (!g || !state.ready || state.w < 8 || state.h < 8) return;
    const live = Boolean(opts && opts.live);
    const s = live ? dt / 1000 : 0;
    const ox = opts ? -(opts.camX || 0) * 0.55 : 0;
    const oy = opts ? -(opts.camY || 0) * 0.45 : 0;
    const target = clamp(Math.round((state.w * state.h) / 24000), 18, 96);
    while (state.list.length < target) {
      if (!spawn(state.list.length === 0)) break;
    }

    g.clearRect(0, 0, state.w, state.h);
    g.globalCompositeOperation = "lighter";
    const list = state.list;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const p = list[i];
      p.life += s;
      if (p.life >= p.max) {
        list.splice(i, 1);
        continue;
      }
      const t = clamp(p.life / p.max, 0, 1);
      const fade = Math.sin(Math.PI * t);
      p.x += p.vx * s;
      p.y += p.vy * s;
      const x = p.x + ox;
      const y = p.y + oy;
      const rgb = state.colors[p.ci] || state.colors[0] || [224, 224, 232];

      if (p.kind === "mote") {
        const spr = state.sprites[p.ci];
        if (!spr) continue;
        const r = p.r * (0.7 + fade * 0.8);
        g.globalAlpha = clamp(0.18 + fade * 0.6, 0, 1);
        g.drawImage(spr, x - r * 4, y - r * 4, r * 8, r * 8);
      } else if (p.kind === "rune") {
        p.rot += p.vr * s;
        g.globalAlpha = clamp(fade * 0.42, 0, 1);
        g.strokeStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        g.lineWidth = 1;
        g.beginPath();
        for (let k = 0; k < 6; k += 1) {
          const a = p.rot + (k / 6) * Math.PI * 2;
          const rr = k % 2 === 0 ? p.r : p.r * 0.62;
          const px = x + Math.cos(a) * rr;
          const py = y + Math.sin(a) * rr;
          if (k === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        g.stroke();
      } else {
        g.globalAlpha = clamp(fade * 0.5, 0, 1);
        g.strokeStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        g.lineWidth = 1.1;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - p.len, y + p.len * 0.32);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }

  function destroy() {
    state.list.length = 0;
    state.sprites.length = 0;
    state.colors.length = 0;
    state.ready = false;
    if (g && state.w >= 8 && state.h >= 8) g.clearRect(0, 0, state.w, state.h);
  }

  return { setColors, resize, frame, burst, destroy, get ready() { return state.ready; } };
}

/* ==========================================================================
   5. 歌词：逐字 / 逐词入场 + 行内进度点亮 + 平滑跟随
   ========================================================================== */

/** 把一行拆成「单位」：中日韩逐字，拉丁按词，空白与标点跟随前一个单位 */
function splitUnits(text) {
  const isCjk = (ch) => {
    const c = ch.codePointAt(0);
    return (
      (c >= 0x3040 && c <= 0x30ff) ||
      (c >= 0x3400 && c <= 0x4dbf) ||
      (c >= 0x4e00 && c <= 0x9fff) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xac00 && c <= 0xd7af)
    );
  };
  const isWord = (ch) => /[0-9A-Za-z\u00c0-\u024f'’-]/.test(ch);
  const units = [];
  let cur = "";
  let wordMode = false;
  for (const ch of String(text || "")) {
    if (isCjk(ch)) {
      if (cur) {
        units.push(cur);
        cur = "";
      }
      units.push(ch);
      wordMode = false;
    } else if (isWord(ch)) {
      if (wordMode) {
        cur += ch;
      } else {
        if (cur) units.push(cur);
        cur = ch;
        wordMode = true;
      }
    } else {
      if (units.length) units[units.length - 1] += ch;
      else cur += ch;
      if (cur) {
        units.push(cur);
        cur = "";
      }
      wordMode = false;
    }
  }
  if (cur) units.push(cur);
  return units.filter((u) => u.length > 0);
}

function createLyrics(host, handlers) {
  const scroll = document.createElement("div");
  scroll.className = "mg-lyrics__scroll";
  const inner = document.createElement("div");
  inner.className = "mg-lyrics__inner";
  scroll.appendChild(inner);
  host.appendChild(scroll);

  let lines = [];
  let rows = [];
  let active = -1;
  let activeRow = null;
  let userUntil = 0;
  let target = 0;
  let needMeasure = false;
  let isEmpty = false;

  const markUser = () => {
    userUntil = Date.now() + 1400;
  };

  function onClick(e) {
    const el = e.target && e.target.closest ? e.target.closest(".mg-line") : null;
    if (!el) return;
    const t = Number(el.dataset.time);
    if (Number.isFinite(t)) handlers.onSeek(t);
  }

  function onKeydown(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = e.target && e.target.closest ? e.target.closest(".mg-line") : null;
    if (!el) return;
    e.preventDefault();
    const t = Number(el.dataset.time);
    if (Number.isFinite(t)) handlers.onSeek(t);
  }

  scroll.addEventListener("wheel", markUser, { passive: true });
  scroll.addEventListener("touchmove", markUser, { passive: true });
  scroll.addEventListener("pointerdown", markUser, { passive: true });
  scroll.addEventListener("click", onClick);
  scroll.addEventListener("keydown", onKeydown);

  function setLines(next, meta) {
    lines = (Array.isArray(next) ? next : []).filter((l) => l && typeof l.text === "string");
    rows = [];
    active = -1;
    activeRow = null;
    target = 0;
    needMeasure = false;
    inner.innerHTML = "";

    if (!lines.length) {
      isEmpty = true;
      const box = document.createElement("div");
      box.className = "mg-empty";
      const glyph = document.createElement("span");
      glyph.className = "mg-empty__glyph";
      glyph.textContent = "✦";
      const text = document.createElement("span");
      text.className = "mg-empty__text";
      text.textContent = (meta && meta.emptyText) || "暂无歌词";
      box.appendChild(glyph);
      box.appendChild(text);
      inner.appendChild(box);
      scroll.scrollTop = 0;
      return;
    }

    isEmpty = false;
    const frag = document.createDocumentFragment();
    rows = lines.map((line) => {
      const el = document.createElement("div");
      el.className = "mg-line";
      el.dataset.state = "idle";
      el.dataset.time = String(Math.max(0, Math.round(line.time) || 0));
      if (!String(line.text).trim()) el.dataset.kind = "interlude";
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "-1");
      const plain = document.createElement("span");
      plain.className = "mg-line__plain";
      plain.textContent = line.text || "♪";
      el.appendChild(plain);
      frag.appendChild(el);
      return { el, plain, text: line.text || "", texts: null, units: null, plan: null };
    });
    inner.appendChild(frag);
    scroll.scrollTop = 0;
  }

  /** 这一行的时间规划：先定「什么时候唱完」，入场延迟也从它推导。
      只唱本行时长的 62%，剩下的 38% 让整句亮着——
      否则行内进度会一路顶到最后，最后一个字还没渲染下一句就来了。 */
  function plan(row) {
    const idx = active;
    const line = lines[idx];
    const start = Math.max(0, line ? line.time : 0);
    const nextTime = lines[idx + 1] ? lines[idx + 1].time : 0;
    const available = nextTime > start ? nextTime - start : 4200;
    const sung = clamp(available * 0.62, 380, 4200);
    const weights = row.texts.map((t) => Math.max(1, String(t).trim().length || 1));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    const segs = weights.map((w) => {
      const s = start + (acc / total) * sung;
      acc += w;
      return [s, start + (acc / total) * sung];
    });
    return { start, available, sung, segs };
  }

  /** 生成这一行的「字」：字号由字符哈希决定，入场时刻贴着它自己要唱的那一刻 */
  function makeUnits(row, p) {
    // 整行的入场必须在本行结束前收尾：动画 420ms + 60ms 余量。
    // 遇到抢拍级别的短句（一行不到 1 秒）时，靠它把延迟整体压下来，
    // 保证最后一个字一定来得及渲染。
    const budget = clamp(p.available - 480, 0, 2600);
    return row.texts.map((u, k) => {
      const span = document.createElement("span");
      span.className = "mg-unit";
      span.textContent = u;
      span.dataset.hold = "wait";
      const hash = (hashStr(u) % 1000) / 1000;
      const wave = 0.5 + 0.5 * Math.sin(k * 1.31 + hash * 3.1);
      const scale = clamp(0.84 + hash * 0.3 + wave * 0.24, 0.8, 1.42);
      span.style.setProperty("--mg-s", scale.toFixed(3));
      // 在自己被唱到之前 150ms 起跳（动画 420ms），
      // 于是每个字都是「刚亮出来就被唱到」，长句短句都不会漏字
      const appear = clamp(p.segs[k][0] - p.start - 150, 0, budget);
      span.style.setProperty("--mg-d", String(Math.round(appear)));
      return span;
    });
  }

  function build(row) {
    if (!row.texts) row.texts = splitUnits(row.text);
    if (!row.plan) row.plan = plan(row);
    if (!row.units) row.units = makeUnits(row, row.plan);
    row.el.textContent = "";
    const frag = document.createDocumentFragment();
    for (const u of row.units) {
      u.dataset.hold = "wait";
      frag.appendChild(u);
    }
    row.el.appendChild(frag);
  }

  function strip(row) {
    if (!row.units) return;
    const plain = document.createElement("span");
    plain.className = "mg-line__plain";
    plain.textContent = row.text || "♪";
    row.el.textContent = "";
    row.el.appendChild(plain);
    row.plain = plain;
  }

  function setActive(index, force) {
    if (isEmpty) return;
    const idx = Number.isFinite(index) ? clamp(Math.round(index), -1, rows.length - 1) : -1;
    if (idx === active && !force) return;
    const prev = active;
    active = idx;
    if (prev >= 0 && rows[prev] && prev !== idx) strip(rows[prev]);
    for (let k = 0; k < rows.length; k += 1) {
      const row = rows[k];
      const want = k === idx ? "active" : idx >= 0 && k < idx ? "past" : "idle";
      if (row.el.dataset.state !== want) row.el.dataset.state = want;
      const tab = k === idx ? "0" : "-1";
      if (row.el.getAttribute("tabindex") !== tab) row.el.setAttribute("tabindex", tab);
    }
    if (idx >= 0 && rows[idx]) {
      build(rows[idx]);
      activeRow = rows[idx];
    } else {
      activeRow = null;
    }
    needMeasure = true;
  }

  /** 按播放位置点亮每个字：已唱 / 正在唱 / 未唱 */
  function paint(position) {
    const row = activeRow;
    if (!row || !row.units || !row.units.length || !row.plan) return;
    const segs = row.plan.segs;
    for (let k = 0; k < row.units.length; k += 1) {
      const seg = segs[k];
      const hold = position >= seg[1] ? "done" : position >= seg[0] ? "now" : "wait";
      const el = row.units[k];
      if (el.dataset.hold !== hold) el.dataset.hold = hold;
    }
  }

  function measure() {
    needMeasure = false;
    if (active < 0 || !rows[active]) {
      target = 0;
      return;
    }
    const el = rows[active].el;
    const top = el.offsetTop - (scroll.clientHeight - el.offsetHeight) / 2;
    const max = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    target = clamp(top, 0, max);
  }

  /** 每帧推进：用户正在翻歌词时让位，停手 1.4 秒后自动接管 */
  function follow() {
    if (isEmpty || !rows.length) return;
    if (needMeasure) measure();
    if (Date.now() < userUntil) return;
    const cur = scroll.scrollTop;
    const diff = target - cur;
    if (Math.abs(diff) < 0.5) {
      if (diff !== 0) scroll.scrollTop = target;
      return;
    }
    scroll.scrollTop = cur + diff * 0.15;
  }

  function destroy() {
    scroll.removeEventListener("wheel", markUser);
    scroll.removeEventListener("touchmove", markUser);
    scroll.removeEventListener("pointerdown", markUser);
    scroll.removeEventListener("click", onClick);
    scroll.removeEventListener("keydown", onKeydown);
    inner.innerHTML = "";
    rows = [];
    lines = [];
    activeRow = null;
    if (scroll.parentNode) scroll.parentNode.removeChild(scroll);
  }

  return {
    element: scroll,
    setLines,
    setActive,
    paint,
    follow,
    destroy,
    /** 给「节奏引擎」用：拿歌词行的起始时间估曲速 */
    get lines() {
      return lines;
    },
    markMeasure() {
      needMeasure = true;
    },
  };
}

/* ==========================================================================
   6. 皮肤本体
   ========================================================================== */

const SHELL_HTML = `
  <div class="mg-shell" data-playing="false" data-anim="on">
    <div class="mg-hud" aria-hidden="true">
      <span class="mg-hud__corner mg-hud__corner--tl"></span>
      <span class="mg-hud__corner mg-hud__corner--tr"></span>
      <span class="mg-hud__corner mg-hud__corner--bl"></span>
      <span class="mg-hud__corner mg-hud__corner--br"></span>
      <span class="mg-hud__rail mg-hud__rail--l"></span>
      <span class="mg-hud__rail mg-hud__rail--r"></span>
      <span class="mg-hud__edge mg-hud__edge--t"></span>
      <span class="mg-hud__edge mg-hud__edge--b"></span>
    </div>
    <div class="mg-flash" aria-hidden="true"></div>
    <div class="mg-grid">
      <section class="mg-scene">
        <div class="mg-meta">
          <span class="mg-meta__kicker">NOW PLAYING</span>
          <div class="mg-meta__title"></div>
          <span class="mg-meta__rule" aria-hidden="true"></span>
          <div class="mg-meta__artist"></div>
          <div class="mg-eq" aria-hidden="true">
            <span class="mg-eq__bar"></span>
            <span class="mg-eq__bar"></span>
            <span class="mg-eq__bar"></span>
            <span class="mg-eq__bar"></span>
            <span class="mg-eq__bar"></span>
          </div>
        </div>
        <div class="mg-camera">
          <div class="mg-scene__halo" aria-hidden="true"></div>
          <div class="mg-scene__beam" aria-hidden="true"></div>
          <div class="mg-scene__floor" aria-hidden="true"></div>
          <div class="mg-scene__floorline" aria-hidden="true"></div>
          <div class="mg-ring" aria-hidden="true"></div>
          <button class="mg-disc" type="button" aria-label="更换封面">
            <span class="mg-disc__aura" aria-hidden="true"></span>
            <span class="mg-disc__artwrap">
              <img class="mg-disc__art" alt="" />
            </span>
            <span class="mg-disc__rim" aria-hidden="true"></span>
            <span class="mg-disc__pin" aria-hidden="true"></span>
          </button>
        </div>
      </section>
      <section class="mg-lyrics">
        <span class="mg-lyrics__spine" aria-hidden="true"><span class="mg-lyrics__spine-mark"></span></span>
      </section>
    </div>
  </div>`;

/* ==========================================================================
   5b. 节奏引擎：用歌曲自己的时间轴推节拍，不猜、不采样音频
   --------------------------------------------------------------------------
   不去碰 <audio>、不做频谱分析（那要 WebAudio + 网络/权限，且规范禁止），
   而是用两样现成的、跟音乐严格同步的数据来推：
     1. 宿主每帧推来的 progress.position —— 一个不会漂移的播放时钟；
     2. 歌词每一行的起始时间 —— 歌词行头几乎总落在乐句的重拍上。
   于是：行头处重设节拍原点（每句必然踩一记），行与行的间隔除以整数拍数
   得到「一拍多长」，多行平滑出稳定 tempo；两拍之间再用位置的相位算出
   一条 1→0 的衰减包络，写成 --mg-beat 驱动整个界面。
   ========================================================================== */
const BEAT_MIN = 300;
const BEAT_MAX = 1000;

function beatState() {
  return { ms: 500, anchor: 0, last: -1, prev: 0, kick: 0 };
}

/** 换行时学一次曲速：把「上一行到这一行」的间隔拆成整数拍 */
function learnTempo(position) {
  if (!inst) return;
  const b = inst.beat;
  const lines = inst.lyrics.lines;
  const idx = inst.lyricIndex;
  if (!lines || idx <= 0 || !lines[idx] || !lines[idx - 1]) return;
  const interval = Number(lines[idx].time) - Number(lines[idx - 1].time);
  if (!(interval >= 800 && interval <= 16000)) return;
  const beats = clamp(Math.round(interval / b.ms), 2, 32);
  const candidate = interval / beats;
  if (candidate < BEAT_MIN || candidate > BEAT_MAX) return;
  // 平滑，避免某一行的异常间隔把节奏带跑
  b.ms = clamp(b.ms * 0.55 + candidate * 0.45, BEAT_MIN, BEAT_MAX);
  // 行头重新对拍：每一句歌词都会踩到一记重拍
  b.anchor = Number(lines[idx].time);
  b.last = -1;
  if (position > 0) b.prev = position;
}

/** 每帧更新节拍相位；播放暂停或界面动画关闭时包络自然衰减到 0 */
function stepBeat(s) {
  const b = inst.beat;
  if (inst.anim && inst.playing && inst.position > 0) {
    if (Math.abs(inst.position - b.prev) > b.ms * 6) {
      // 拖动进度条跳了很远，重新对拍
      b.anchor = inst.position;
      b.last = -1;
    }
    const k = Math.floor((inst.position - b.anchor) / b.ms);
    if (k !== b.last) {
      if (b.last >= 0 && k > b.last) {
        inst.pulse = Math.max(inst.pulse, 0.55);
        inst.particles.burst(3);
      }
      b.last = k;
    }
    const frac = (inst.position - b.anchor) / b.ms - k;
    b.kick = Math.pow(clamp(1 - frac, 0, 1), 2.2);
  } else {
    b.kick *= Math.exp(-s / 0.3);
    if (b.kick < 0.002) b.kick = 0;
  }
  b.prev = inst.position;
  return b.kick;
}

function emptyTextFor(lyrics) {
  const source = lyrics && lyrics.source;
  if (source === "online") return "在线匹配没有结果";
  if (source === "none" || !source) return "这首歌还没有歌词";
  return "暂无歌词";
}

let inst = null;
let uidSeq = 0;

/** 只在值真的变了才写 CSS 变量：每帧无脑写十几个变量会白白触发样式失效 */
function putVars(el, prev, vars) {
  for (const key in vars) {
    const value = vars[key];
    if (prev[key] === value) continue;
    prev[key] = value;
    el.style.setProperty(key, value);
  }
}

function stopLoop(target) {
  if (!target) return;
  if (target.raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(target.raf);
  target.raf = 0;
  target.last = 0;
}

function startLoop() {
  if (!inst || inst.raf) return;
  if (typeof requestAnimationFrame !== "function") return;
  inst.last = 0;
  inst.raf = requestAnimationFrame(step);
}

function step(now) {
  if (!inst) return;
  inst.raf = requestAnimationFrame(step);
  const dt = inst.last ? Math.min(50, now - inst.last) : 16;
  inst.last = now;
  const s = dt / 1000;
  const t = now / 1000;
  const refs = inst.refs;

  /* 脉冲衰减（换歌一次「切镜」、换行一次小脉冲） */
  inst.pulse *= Math.exp(-s / 0.26);
  inst.cut *= Math.exp(-s / 0.22);
  if (inst.pulse < 0.002) inst.pulse = 0;
  if (inst.cut < 0.002) inst.cut = 0;

  /* 节拍：用播放位置在当前拍的相位算一条 1→0 的衰减包络 */
  const beat = stepBeat(s);

  /* 运镜：自主漂移 + 节拍弹跳 + 脉冲（不跟随鼠标） */
  const drift = inst.anim ? 1 : 0;
  const camX = drift * (Math.sin(t * 0.23) * 14 + Math.sin(t * 0.071 + 1.2) * 22);
  const camY = drift * (Math.cos(t * 0.19) * 10 + Math.cos(t * 0.053 + 0.7) * 15);
  const camR = drift * (Math.sin(t * 0.11) * 0.6 + inst.cut * 2.4 + beat * 0.42);
  const camZ =
    1 +
    drift * Math.sin(t * 0.13) * 0.014 +
    inst.pulse * 0.035 +
    inst.cut * 0.05 +
    beat * 0.022;

  const vars = {
    "--mg-cam-x": camX.toFixed(2),
    "--mg-cam-y": camY.toFixed(2),
    "--mg-cam-z": camZ.toFixed(4),
    "--mg-cam-r": camR.toFixed(3),
    "--mg-pulse": inst.pulse.toFixed(3),
    "--mg-cut": inst.cut.toFixed(3),
    "--mg-beat": beat.toFixed(3),
    "--mg-beat-ms": inst.beat.ms.toFixed(0),
  };
  putVars(refs.shell, inst.shellVars, vars);
  if (inst.bg) putVars(inst.bg, inst.bgVars, vars);

  /* 歌词：行内进度 + 平滑跟随 */
  inst.lyrics.paint(inst.position);
  inst.lyrics.follow();

  /* 粒子 */
  inst.particles.frame(dt, {
    camX,
    camY,
    pulse: inst.pulse,
    live: inst.anim && !inst.closed,
  });
}

function setCover(ctx, src) {
  if (!inst) return;
  const next = src || ctx.defaultCover;
  if (inst.cover === next) return;
  inst.cover = next;
  inst.refs.art.src = next;
}

function paintSong(ctx) {
  if (!inst) return;
  const media = ctx.media();
  const song = media.song || null;
  const title = song && song.title ? String(song.title) : "未在播放";
  const artist = [song && song.artist, song && song.album].filter(Boolean).join("  ·  ");
  inst.refs.title.textContent = title;
  inst.refs.title.setAttribute("title", title);
  const sub = artist || (song ? "未知歌手" : "从曲库里挑一首开始");
  inst.refs.artist.textContent = sub;
  inst.refs.artist.setAttribute("title", sub);
  inst.refs.art.alt = song && song.title ? `${song.title} 封面` : "";
  setCover(ctx, media.cover);
}

/** 记录播放位置：只用于歌词的行内点亮与自动居中，界面里不再画进度条 */
function applyPlayback(pb) {
  if (!inst) return;
  inst.position = Number.isFinite(pb.position) && pb.position > 0 ? pb.position : 0;
}

function refreshPalette(ctx) {
  if (!inst) return;
  inst.particles.setColors(readPalette(inst.bg, inst.canvas));
  if (inst.refs.artLayer) {
    inst.refs.artLayer.dataset.blend = ctx.mode === "light" ? "plain" : "screen";
  }
  inst.particles.resize();
}

function applyOptions(ctx) {
  if (!inst) return;
  const o = ctx.options() || {};
  inst.anim = o.animations !== false;
  const size = clamp(Number(o.lyricsFontSize) || 16, 12, 40);
  const value = inst.anim ? "1" : "0";
  inst.refs.shell.style.setProperty("--mg-lyric-size", `${size}px`);
  inst.refs.shell.style.setProperty("--mg-anim", value);
  inst.refs.shell.dataset.anim = inst.anim ? "on" : "off";
  if (inst.bg) {
    inst.bg.style.setProperty("--mg-anim", value);
    inst.bg.dataset.anim = inst.anim ? "on" : "off";
  }
  if (inst.refs.artLayer) {
    inst.refs.artLayer.dataset.blend = ctx.mode === "light" ? "plain" : "screen";
  }
}

export default defineSkin({
  apiVersion: 1,
  id: ID,
  name: "魔法阵 · 手绘次元",
  icon: "bolt",
  order: 80,
  description: "手绘次元背景 + 旋转魔法阵，逐字歌词与运镜动效",
  background: true,

  mount(ctx) {
    uidSeq += 1;
    const uid = `mg${uidSeq}`;

    /* —— 整窗背景层（背景层在 .playerview 之外，位置由宿主决定）—— */
    const bgRoot = ctx.backgroundRoot || null;
    if (bgRoot) {
      bgRoot.innerHTML = `
        <div class="mg-bg" data-anim="on">
          <div class="mg-bg__sky"></div>
          <div class="mg-bg__art">${buildBackdrop(uid)}</div>
          <div class="mg-bg__grid"></div>
          <div class="mg-bg__rays"></div>
          <div class="mg-bg__sigil">${buildSigil()}</div>
          <canvas class="mg-bg__particles"></canvas>
          <div class="mg-bg__streaks"></div>
          <div class="mg-bg__veil"></div>
          <div class="mg-bg__petals">${buildPetals(14)}</div>
          <div class="mg-bg__flash"></div>
        </div>`;
      bgRoot.hidden = false;
    }
    const bg = bgRoot ? bgRoot.querySelector(".mg-bg") : null;

    /* —— 舞台 —— */
    ctx.root.innerHTML = SHELL_HTML;
    const shell = ctx.root.querySelector(".mg-shell");
    const ring = ctx.root.querySelector(".mg-ring");
    if (ring) ring.innerHTML = buildSigil();

    const refs = {
      shell,
      hud: ctx.root.querySelector(".mg-hud"),
      title: ctx.root.querySelector(".mg-meta__title"),
      artist: ctx.root.querySelector(".mg-meta__artist"),
      art: ctx.root.querySelector(".mg-disc__art"),
      disc: ctx.root.querySelector(".mg-disc"),
      artLayer: bg ? bg.querySelector(".mg-bg__art") : null,
    };

    const lyrics = createLyrics(ctx.root.querySelector(".mg-lyrics"), {
      onSeek(ms) {
        ctx.actions.seek(ms);
      },
    });

    const canvas = bg ? bg.querySelector(".mg-bg__particles") : null;
    const particles = createParticles(canvas, bg);

    inst = {
      ctx,
      uid,
      bgRoot,
      bg,
      canvas,
      refs,
      lyrics,
      particles,
      cover: "",
      position: 0,
      lyricIndex: -2,
      playing: false,
      anim: true,
      closed: false,
      pulse: 0,
      cut: 0,
      beat: beatState(),
      raf: 0,
      last: 0,
      observer: null,
      offFns: [],
      shellVars: {},
      bgVars: {},
    };

    /* —— 交互：一律走 ctx.actions，不碰应用状态、不碰 <audio> —— */
    if (refs.art) {
      const onArtError = () => {
        if (refs.art.src !== ctx.defaultCover) refs.art.src = ctx.defaultCover;
      };
      refs.art.addEventListener("error", onArtError);
      inst.offFns.push(() => refs.art.removeEventListener("error", onArtError));
    }

    if (refs.disc) {
      const onDisc = () => ctx.actions.openCoverPanel();
      refs.disc.addEventListener("click", onDisc);
      inst.offFns.push(() => refs.disc.removeEventListener("click", onDisc));
    }

    /* 指针视差已经去掉：界面的动效不再跟随鼠标，只保留自己的漂移与脉冲。
       唯一保留的鼠标功能是「点歌词跳进度」（在 createLyrics 里）。 */

    /* 整窗尺寸变化：只为了让画布跟上，不读任何数据 */
    if (bg && typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(() => {
        if (inst) inst.particles.resize();
      });
      ro.observe(bg);
      inst.observer = ro;
    }

    /* —— 首次铺数据：宿主随后还会推一次 mount 全量快照 —— */
    applyOptions(ctx);
    refreshPalette(ctx);
    paintSong(ctx);
    const media = ctx.media();
    lyrics.setLines(media.lyrics.lines, { emptyText: emptyTextFor(media.lyrics) });
    lyrics.setActive(media.lyrics.index, true);
    inst.lyricIndex = media.lyrics.index;
    applyPlayback(ctx.playback());
    learnTempo(inst.position);
    inst.playing = Boolean(ctx.playback().playing);
    shell.dataset.playing = inst.playing ? "true" : "false";
    particles.resize();
    startLoop();
  },

  update(ctx, patch) {
    if (!inst) return;
    const type = patch && patch.type;

    // 详情页收起：先把整窗背景收掉，并停掉动画循环（宿主随后会 destroy）
    if (type === "close") {
      inst.closed = true;
      if (inst.bgRoot) inst.bgRoot.hidden = true;
      stopLoop(inst);
      return;
    }
    if (type === "destroy") return;

    // 重新打开（或任何后续更新）：把背景与循环恢复回来
    if (inst.closed) {
      inst.closed = false;
      startLoop();
    }
    if (inst.bgRoot && inst.bgRoot.hidden) inst.bgRoot.hidden = false;

    switch (type) {
      case "mount": {
        applyOptions(ctx);
        paintSong(ctx);
        const media = ctx.media();
        inst.lyrics.setLines(media.lyrics.lines, { emptyText: emptyTextFor(media.lyrics) });
        inst.lyrics.setActive(media.lyrics.index, true);
        inst.lyricIndex = media.lyrics.index;
        const pb = ctx.playback();
        applyPlayback(pb);
        inst.playing = Boolean(pb.playing);
        inst.refs.shell.dataset.playing = inst.playing ? "true" : "false";
        refreshPalette(ctx);
        learnTempo(inst.position);
        break;
      }
      case "song": {
        const media = ctx.media();
        paintSong(ctx);
        inst.lyrics.setLines(media.lyrics.lines, { emptyText: emptyTextFor(media.lyrics) });
        inst.lyrics.setActive(media.lyrics.index, true);
        inst.lyricIndex = media.lyrics.index;
        // 换歌了：曲速要重新学，别把上一首的节奏带过来
        inst.beat = beatState();
        inst.particles.burst();
        inst.cut = 1;
        inst.pulse = 1;
        break;
      }
      case "media":
        setCover(ctx, typeof patch.cover === "string" ? patch.cover : ctx.media().cover);
        inst.pulse = Math.max(inst.pulse, 0.7);
        break;
      case "lyrics": {
        const media = ctx.media();
        inst.lyrics.setLines(media.lyrics.lines, { emptyText: emptyTextFor(media.lyrics) });
        inst.lyrics.setActive(media.lyrics.index, true);
        inst.lyricIndex = media.lyrics.index;
        break;
      }
      case "progress": {
        applyPlayback(patch);
        const idx = Number.isFinite(patch.lyricIndex) ? patch.lyricIndex : ctx.media().lyrics.index;
        if (idx !== inst.lyricIndex) {
          inst.lyricIndex = idx;
          inst.lyrics.setActive(idx);
          if (idx >= 0) inst.pulse = Math.max(inst.pulse, 0.85);
          learnTempo(inst.position);
        }
        break;
      }
      case "state":
        applyPlayback(patch);
        inst.playing = Boolean(patch.playing);
        inst.refs.shell.dataset.playing = inst.playing ? "true" : "false";
        inst.pulse = Math.max(inst.pulse, 0.6);
        break;
      case "options":
        applyOptions(ctx);
        break;
      case "theme":
        refreshPalette(ctx);
        break;
      case "resize":
        if (Number(patch.width) > 0) {
          inst.particles.resize();
          inst.lyrics.markMeasure();
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

    stopLoop(cur);
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
    cur.lyrics.destroy();
    cur.particles.destroy();
    cur.refs = null;
    cur.bg = null;
    cur.canvas = null;
    cur.cover = "";
    cur.shellVars = {};
    cur.bgVars = {};

    if (cur.bgRoot) {
      cur.bgRoot.hidden = true;
      cur.bgRoot.innerHTML = "";
    }
    ctx.root.innerHTML = "";
  },
});
