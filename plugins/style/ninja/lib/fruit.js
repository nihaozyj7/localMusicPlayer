/* ==========================================================================
   ninja/lib/fruit.js — 「水果忍者」的程序化水果（几何 + 剖面绘制）
   --------------------------------------------------------------------------
   这一款**不带任何图片素材**：每颗水果、每片剖面、每根果皮条纹都是现场画的。
   这么做的理由不是炫技，是**体积与可分发性**：

     · 一张像样的水果贴图（还带切开的两半 = 每个品种两张）base64 进插件包就是
       几百 KB 起，而第三方样式是要从仓库里逐个文件下载安装的；
     · 屏幕上的水果半径只有 14~30px，位图在这个尺寸下反而比矢量糊；
     · 颜色要跟着封面走（`palette.tintKind` 只偏 22% 色相）—— 位图就得重新调色，
       程序化只需换两个颜色。

   品种表 `KINDS` 里每一条都是**果皮/果肉/籽**三层数据 + 一个形态标记，绘制函数
   只认这份数据，所以加一个品种不用碰绘制代码。

   纯几何/绘制，无 DOM（只吃一个 2D context）。`g` 由调用方给，便于单测里塞假 context
   只跑几何路径（不需要真画布）。
   ========================================================================== */

export const TAU = Math.PI * 2;

/**
 * 品种表。
 * `shape`：round 圆 / oval 椭圆 / pear 苹果形（上窄下圆）。
 * `mark`：rind 上的花纹 —— stripe 西瓜纹 / dimple 橙皮点 / fuzz 猕猴桃绒毛 / scale 火龙果鳞 / none。
 * `cut`：剖面里的结构 —— segment 瓣膜（柑橘类）/ core 果心 / plain 实心。
 */
export const KINDS = Object.freeze([
  {
    id: "watermelon",
    name: "西瓜",
    shape: "round",
    mark: "stripe",
    cut: "plain",
    rindA: [88, 168, 82],
    rindB: [26, 78, 38],
    fleshA: [236, 78, 92],
    fleshB: [255, 146, 156],
    seed: [34, 26, 20],
    seeds: 7,
    thickness: 0.17,
  },
  {
    id: "orange",
    name: "橙",
    shape: "round",
    mark: "dimple",
    cut: "segment",
    rindA: [244, 158, 52],
    rindB: [186, 92, 18],
    fleshA: [252, 176, 62],
    fleshB: [255, 216, 126],
    seed: [250, 240, 206],
    seeds: 0,
    thickness: 0.15,
  },
  {
    id: "apple",
    name: "苹果",
    shape: "pear",
    mark: "none",
    cut: "core",
    rindA: [216, 62, 62],
    rindB: [138, 22, 34],
    fleshA: [246, 236, 206],
    fleshB: [255, 250, 232],
    seed: [92, 62, 32],
    seeds: 3,
    thickness: 0.08,
    stem: true,
  },
  {
    id: "lemon",
    name: "柠檬",
    shape: "oval",
    mark: "none",
    cut: "segment",
    rindA: [240, 216, 78],
    rindB: [172, 152, 28],
    fleshA: [250, 240, 148],
    fleshB: [255, 252, 200],
    seed: [246, 240, 200],
    seeds: 2,
    thickness: 0.12,
  },
  {
    id: "kiwi",
    name: "奇异果",
    shape: "oval",
    mark: "fuzz",
    cut: "segment",
    rindA: [136, 104, 62],
    rindB: [74, 52, 28],
    fleshA: [146, 194, 82],
    fleshB: [206, 232, 140],
    seed: [30, 26, 20],
    seeds: 14,
    thickness: 0.08,
  },
  {
    id: "dragon",
    name: "火龙果",
    shape: "oval",
    mark: "scale",
    cut: "plain",
    rindA: [222, 62, 104],
    rindB: [140, 24, 62],
    fleshA: [246, 244, 246],
    fleshB: [255, 255, 255],
    seed: [26, 22, 26],
    seeds: 18,
    thickness: 0.13,
  },
  {
    id: "blueberry",
    name: "蓝莓",
    shape: "round",
    mark: "none",
    cut: "plain",
    rindA: [86, 98, 186],
    rindB: [34, 40, 104],
    fleshA: [138, 116, 190],
    fleshB: [196, 178, 228],
    seed: [232, 226, 246],
    seeds: 4,
    thickness: 0.14,
    crown: true,
  },
  {
    id: "peach",
    name: "桃",
    shape: "round",
    mark: "fuzz",
    cut: "core",
    rindA: [244, 158, 126],
    rindB: [188, 84, 76],
    fleshA: [252, 196, 158],
    fleshB: [255, 234, 210],
    seed: [122, 74, 44],
    seeds: 1,
    thickness: 0.09,
    stem: true,
  },
]);

export function kindOf(i) {
  const n = KINDS.length;
  const k = Math.round(Number(i) || 0) % n;
  return KINDS[k < 0 ? k + n : k];
}

/** 形态的长短轴比例（round 圆、oval 竖长、pear 略扁但上窄） */
export function silhouette(kind) {
  switch (kind?.shape) {
    case "oval":
      return { rx: 0.84, ry: 1.14 };
    case "pear":
      return { rx: 1, ry: 1.06 };
    default:
      return { rx: 1, ry: 1 };
  }
}

/**
 * 一字素一枚水果该多大：跟着**字素步距**走（这样一排水果与一排字对齐），
 * 大约"比那个字宽一点"（0.62 × 步距），再夹在 13~30px 之间。
 *
 * 上限很重要：水果是抛起来再切开的，一排里同时在场的最多两三枚 —— 半径一旦
 * 超过半个步距，一排水果就会糊成一片、"唱到哪个字切哪枚"就看不出来了。
 */
export function radiusFor(glyphW, stageH, { min = 13, max = 30 } = {}) {
  const w = Number(glyphW) > 0 ? Number(glyphW) : 20;
  const h = Number(stageH) > 0 ? Number(stageH) : 700;
  const byGlyph = w * 0.62;
  const byStage = h * 0.04;
  return Math.max(min, Math.min(max, Math.min(byGlyph, byStage)));
}

/**
 * 给一行字素分配品种：确定性的，且**相邻两枚一定不同**（一排全是西瓜很假）。
 * 用 hash 而不是 Math.random：同一句话换封面/改尺寸后重算，品种不会跳。
 */
export function assignKinds(count, seed, hash) {
  const n = Math.max(0, Math.round(Number(count) || 0));
  const out = new Uint8Array(n);
  let h = (Number(seed) >>> 0) || 1;
  for (let i = 0; i < n; i += 1) {
    // xorshift32：不依赖外部随机流，纯函数
    h ^= h << 13;
    h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    let k = h % KINDS.length;
    if (i > 0 && k === out[i - 1]) k = (k + 1 + (h % (KINDS.length - 1))) % KINDS.length;
    out[i] = k;
  }
  if (typeof hash === "function" && n > 1) {
    // 允许调用方再掺一道种子（同文本同结果，不同文本不同排布）
    const j = hash % n;
    const tmp = out[0];
    out[0] = out[j];
    out[j] = tmp;
  }
  return out;
}

/* --------------------------------------------------------------------------
   颜色
   -------------------------------------------------------------------------- */

export function css(rgb, a = 1) {
  const c = Array.isArray(rgb) ? rgb : [0, 0, 0];
  const f = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
  return `rgba(${f(c[0])},${f(c[1])},${f(c[2])},${Math.max(0, Math.min(1, Number(a))).toFixed(3)})`;
}

export function shade(rgb, k) {
  const c = Array.isArray(rgb) ? rgb : [0, 0, 0];
  const f = Number(k) || 0;
  const t = (v) => (f >= 0 ? v + (255 - v) * f : v * (1 + f));
  return [t(c[0]), t(c[1]), t(c[2])];
}

/**
 * 一个品种在当前果盘里的实际颜色（由 palette 注入色相偏移函数）。
 * `tint` 就是 palette.tintKind：把封面色相偏进来，但保留品种的明度与结构。
 */
export function kindColorsFor(kind, tint) {
  const t = typeof tint === "function" ? tint : (c) => c;
  return {
    rindA: t(kind.rindA),
    rindB: t(kind.rindB),
    fleshA: t(kind.fleshA),
    fleshB: t(kind.fleshB),
    seed: t(kind.seed),
    thickness: kind.thickness,
    mark: kind.mark,
    cut: kind.cut,
    shape: kind.shape,
    seeds: kind.seeds,
    stem: !!kind.stem,
    crown: !!kind.crown,
  };
}

/* --------------------------------------------------------------------------
   路径
   -------------------------------------------------------------------------- */

/** 果体路径（pear 用贝塞尔，其余用椭圆）—— 调用方负责 beginPath 之外的一切 */
export function bodyPath(g, rx, ry, shape) {
  if (shape === "pear") {
    g.beginPath();
    g.moveTo(0, -ry * 0.94);
    g.bezierCurveTo(rx * 0.6, -ry * 0.96, rx * 0.99, -ry * 0.34, rx * 0.97, ry * 0.18);
    g.bezierCurveTo(rx * 0.95, ry * 0.74, rx * 0.52, ry, 0, ry);
    g.bezierCurveTo(-rx * 0.52, ry, -rx * 0.95, ry * 0.74, -rx * 0.97, ry * 0.18);
    g.bezierCurveTo(-rx * 0.99, -ry * 0.34, -rx * 0.6, -ry * 0.96, 0, -ry * 0.94);
    g.closePath();
    return;
  }
  g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, 0, TAU);
}

/* --------------------------------------------------------------------------
   整颗水果
   -------------------------------------------------------------------------- */

/**
 * @param {CanvasRenderingContext2D} g
 * @param {{x:number,y:number,rx:number,ry:number,rot?:number,alpha?:number,colors:object,spin?:number}} spec
 */
export function paintFruit(g, spec) {
  const { x, y, rx, ry, colors } = spec;
  const alpha = spec.alpha == null ? 1 : Math.max(0, Math.min(1, spec.alpha));
  if (alpha <= 0.01 || !(rx > 0) || !(ry > 0)) return;
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  if (spec.rot) g.rotate(spec.rot);

  // 1) 果体：径向渐变（左上受光）
  const grad = g.createRadialGradient(-rx * 0.34, -ry * 0.42, Math.min(rx, ry) * 0.12, 0, 0, Math.max(rx, ry) * 1.22);
  grad.addColorStop(0, css(shade(colors.rindA, 0.16)));
  grad.addColorStop(0.55, css(colors.rindA));
  grad.addColorStop(1, css(colors.rindB));
  bodyPath(g, rx, ry, colors.shape);
  g.fillStyle = grad;
  g.fill();

  // 2) 花纹（裁在果体里）
  if (colors.mark !== "none") {
    g.save();
    bodyPath(g, rx, ry, colors.shape);
    g.clip();
    if (colors.mark === "stripe") {
      g.strokeStyle = css(shade(colors.rindB, -0.28), 0.85);
      g.lineWidth = Math.max(1.2, rx * 0.15);
      g.lineCap = "round";
      for (let i = -2; i <= 2; i += 1) {
        const x0 = i * rx * 0.46;
        g.beginPath();
        g.moveTo(x0 * 0.55, -ry * 1.02);
        g.quadraticCurveTo(x0 * 2.1, 0, x0 * 0.55, ry * 1.02);
        g.stroke();
      }
    } else if (colors.mark === "dimple") {
      g.fillStyle = css(shade(colors.rindB, -0.2), 0.3);
      for (let i = 0; i < 26; i += 1) {
        const a = (i / 26) * TAU * 1.7;
        const rr = (0.28 + ((i * 37) % 10) / 14) * Math.min(rx, ry);
        const px = Math.cos(a) * rr * 0.92;
        const py = Math.sin(a) * rr;
        g.beginPath();
        g.arc(px, py, Math.max(0.6, rx * 0.055), 0, TAU);
        g.fill();
      }
    } else if (colors.mark === "fuzz") {
      g.strokeStyle = css(colors.fleshB, 0.22);
      g.lineWidth = Math.max(0.8, rx * 0.05);
      for (let i = 0; i < 30; i += 1) {
        const a = (i / 30) * TAU;
        const rr = Math.min(rx, ry);
        g.beginPath();
        g.moveTo(Math.cos(a) * rr * 0.82, Math.sin(a) * rr * 0.82);
        g.lineTo(Math.cos(a) * rr * 1.06, Math.sin(a) * rr * 1.06);
        g.stroke();
      }
    } else if (colors.mark === "scale") {
      g.fillStyle = css(shade(colors.rindB, 0.1), 0.55);
      for (let i = 0; i < 5; i += 1) {
        const a = -0.9 + i * 0.62;
        const px = Math.cos(a) * rx * 0.72;
        const py = Math.sin(a) * ry * 0.7;
        g.beginPath();
        g.ellipse(px, py, rx * 0.2, ry * 0.1, a, 0, TAU);
        g.fill();
      }
    }
    g.restore();
  }

  // 3) 底部内阴影 + 左上高光（把"球"的体积做出来）
  const low = g.createRadialGradient(rx * 0.42, ry * 0.52, Math.min(rx, ry) * 0.1, 0, 0, Math.max(rx, ry) * 1.1);
  low.addColorStop(0, css(colors.rindB, 0.5));
  low.addColorStop(1, css(colors.rindB, 0));
  bodyPath(g, rx, ry, colors.shape);
  g.fillStyle = low;
  g.fill();

  const hi = g.createRadialGradient(-rx * 0.36, -ry * 0.44, 0, -rx * 0.36, -ry * 0.44, Math.max(rx, ry) * 0.6);
  hi.addColorStop(0, "rgba(255,255,255,0.42)");
  hi.addColorStop(0.6, "rgba(255,255,255,0.08)");
  hi.addColorStop(1, "rgba(255,255,255,0)");
  g.beginPath();
  g.ellipse(-rx * 0.34, -ry * 0.42, rx * 0.4, ry * 0.32, -0.5, 0, TAU);
  g.fillStyle = hi;
  g.fill();

  // 4) 果梗与叶（苹果 / 桃）· 花萼（蓝莓）
  if (colors.stem) {
    g.strokeStyle = css([104, 72, 40]);
    g.lineWidth = Math.max(1, rx * 0.11);
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(0, -ry * 0.9);
    g.quadraticCurveTo(rx * 0.1, -ry * 1.16, rx * 0.02, -ry * 1.32);
    g.stroke();
    g.beginPath();
    g.ellipse(rx * 0.34, -ry * 1.16, rx * 0.3, ry * 0.13, -0.42, 0, TAU);
    g.fillStyle = css([74, 132, 62], 0.95);
    g.fill();
  }
  if (colors.crown) {
    g.fillStyle = css(shade(colors.rindB, -0.1), 0.9);
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI / 2 + (i - 2) * 0.34;
      g.beginPath();
      g.ellipse(Math.cos(a) * rx * 0.24, -ry * 0.86 + Math.sin(a) * ry * 0.1, rx * 0.1, ry * 0.16, a, 0, TAU);
      g.fill();
    }
  }

  // 5) 轮廓（贴一圈暗边，压在浅底上才有边界）
  g.strokeStyle = css(colors.rindB, 0.5);
  g.lineWidth = Math.max(1, Math.min(rx, ry) * 0.07);
  bodyPath(g, rx, ry, colors.shape);
  g.stroke();

  g.restore();
}

/* --------------------------------------------------------------------------
   切开的两半
   -------------------------------------------------------------------------- */

/**
 * 半颗水果（看到的是剖面）。
 *
 * `side` = -1 / +1 决定保留哪一半（局部坐标系里沿 y 切），`cutFlash` 是刚切开
 * 那一下的高光（0..1，由 skin.js 按切开后的时间给）。
 *
 * @param {CanvasRenderingContext2D} g
 * @param {{x:number,y:number,rx:number,ry:number,rot:number,side:number,alpha?:number,colors:object,cutFlash?:number}} spec
 */
export function paintHalf(g, spec) {
  const { x, y, rx, ry, colors } = spec;
  const alpha = spec.alpha == null ? 1 : Math.max(0, Math.min(1, spec.alpha));
  if (alpha <= 0.01 || !(rx > 0) || !(ry > 0)) return;
  const side = spec.side < 0 ? -1 : 1;
  const thick = Math.max(0.06, Math.min(0.3, Number(colors.thickness) || 0.12));

  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  g.rotate(spec.rot || 0);
  // 只留一半（局部 y 的某一侧）
  g.beginPath();
  g.rect(-rx * 1.3, side < 0 ? -ry * 1.35 : 0, rx * 2.6, ry * 1.35);
  g.clip();

  // 1) 果皮（整椭圆），随后用内缩椭圆盖上果肉 —— 于是曲边那圈自然成了果皮厚度
  bodyPath(g, rx, ry, colors.shape);
  g.fillStyle = css(colors.rindB);
  g.fill();

  // 2) 果肉（内缩；受光中心偏上）
  const frx = rx * (1 - thick);
  const fry = ry * (1 - thick);
  const fg = g.createRadialGradient(-frx * 0.18, -fry * 0.24, Math.min(frx, fry) * 0.1, 0, 0, Math.max(frx, fry) * 1.15);
  fg.addColorStop(0, css(shade(colors.fleshB, 0.1)));
  fg.addColorStop(0.6, css(colors.fleshA));
  fg.addColorStop(1, css(colors.fleshB));
  bodyPath(g, frx, fry, colors.shape);
  g.fillStyle = fg;
  g.fill();

  // 3) 剖面结构
  if (colors.cut === "segment") {
    g.strokeStyle = css(shade(colors.fleshB, 0.12), 0.75);
    g.lineWidth = Math.max(0.8, rx * 0.06);
    const nSeg = 8;
    for (let i = 0; i <= nSeg; i += 1) {
      const a = -Math.PI / 2 + (i / nSeg) * Math.PI;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * frx * 0.94, Math.sin(a) * fry * 0.94);
      g.stroke();
    }
    g.beginPath();
    g.ellipse(0, 0, frx * 0.14, fry * 0.14, 0, 0, TAU);
    g.fillStyle = css(shade(colors.fleshB, 0.2), 0.9);
    g.fill();
  } else if (colors.cut === "core") {
    g.beginPath();
    g.ellipse(0, fry * 0.06, frx * 0.2, fry * 0.26, 0, 0, TAU);
    g.fillStyle = css(shade(colors.fleshA, -0.08), 0.8);
    g.fill();
  }

  // 4) 籽（沿剖面外圈散布）
  if (colors.seeds > 0) {
    g.fillStyle = css(colors.seed, 0.92);
    for (let i = 0; i < colors.seeds; i += 1) {
      const a = Math.PI * (0.12 + (i / Math.max(1, colors.seeds - 1)) * 0.76);
      const rr = 0.52 + ((i * 29) % 5) / 14;
      const px = Math.cos(a) * frx * rr;
      const py = Math.sin(a) * fry * rr;
      g.save();
      g.translate(px, py);
      g.rotate(a);
      g.beginPath();
      g.ellipse(0, 0, Math.max(0.9, rx * 0.09), Math.max(0.6, ry * 0.055), 0, 0, TAU);
      g.fill();
      g.restore();
    }
  }

  // 5) 切面：沿局部 x 轴的一道亮边 + 刚切开那一下的白热
  g.strokeStyle = css(shade(colors.fleshB, 0.34), 0.5);
  g.lineWidth = Math.max(1, rx * 0.07);
  g.beginPath();
  g.moveTo(-rx, 0);
  g.lineTo(rx, 0);
  g.stroke();
  const flash = Math.max(0, Math.min(1, Number(spec.cutFlash) || 0));
  if (flash > 0.02) {
    g.strokeStyle = `rgba(255,252,240,${(flash * 0.85).toFixed(3)})`;
    g.lineWidth = Math.max(1.4, rx * 0.16);
    g.beginPath();
    g.moveTo(-rx, 0);
    g.lineTo(rx, 0);
    g.stroke();
  }

  // 6) 果皮外缘的暗边（把两半从深木案板上"拎"出来）
  g.strokeStyle = css(shade(colors.rindB, -0.25), 0.55);
  g.lineWidth = Math.max(1, Math.min(rx, ry) * 0.07);
  bodyPath(g, rx, ry, colors.shape);
  g.stroke();

  g.restore();
}

/* --------------------------------------------------------------------------
   炸弹与刀光
   -------------------------------------------------------------------------- */

/**
 * 炸弹：球体 + 顶盖 + 引线 + 火星。
 * `fuse` 0..1 是"引线烧到哪了"，火星就在那个位置（换行/爆炸前一直在烧）。
 */
export function paintBomb(g, spec) {
  const { x, y, r } = spec;
  const alpha = spec.alpha == null ? 1 : Math.max(0, Math.min(1, spec.alpha));
  if (alpha <= 0.01 || !(r > 0)) return;
  const fuse = Math.max(0, Math.min(1, Number(spec.fuse) || 0));
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  if (spec.rot) g.rotate(spec.rot);

  // 引线（先画，压在球体下面）
  const tipX = r * 0.52;
  const tipY = -r * 1.9;
  g.strokeStyle = "rgba(214,196,158,0.9)";
  g.lineWidth = Math.max(1.2, r * 0.11);
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(0, -r * 0.92);
  g.quadraticCurveTo(r * 0.62, -r * 1.4, tipX, tipY);
  g.stroke();
  // 烧掉的那一段：用底色盖掉（案板色由 skin.js 通过 clip 之外的方式处理 —— 这里只压暗）
  if (fuse > 0.02) {
    g.strokeStyle = `rgba(24,14,8,${(0.85 * Math.min(1, fuse * 1.6)).toFixed(3)})`;
    g.lineWidth = Math.max(1.2, r * 0.11);
    g.beginPath();
    g.moveTo(0, -r * 0.92);
    const t = Math.min(0.98, fuse);
    g.quadraticCurveTo(r * 0.62 * t, -r * (0.92 + 0.48 * t), r * 0.62 * t * 0.84, -r * (0.92 + 0.98 * t));
    g.stroke();
  }

  // 球体
  const body = g.createRadialGradient(-r * 0.34, -r * 0.4, r * 0.1, 0, 0, r * 1.2);
  body.addColorStop(0, "#5a5a64");
  body.addColorStop(0.5, "#2c2c33");
  body.addColorStop(1, "#08080b");
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fillStyle = body;
  g.fill();

  // 高光
  g.beginPath();
  g.ellipse(-r * 0.36, -r * 0.42, r * 0.34, r * 0.24, -0.5, 0, TAU);
  g.fillStyle = "rgba(255,255,255,0.34)";
  g.fill();

  // 顶盖
  g.fillStyle = "#1b1b20";
  g.beginPath();
  g.ellipse(0, -r * 0.86, r * 0.34, r * 0.2, 0, 0, TAU);
  g.fill();
  g.strokeStyle = "rgba(180,180,190,0.35)";
  g.lineWidth = Math.max(1, r * 0.05);
  g.stroke();

  // 火星（在引线烧到的地方）
  const fx = r * 0.62 * Math.min(0.98, fuse) * 0.84;
  const fy = -r * (0.92 + 0.98 * Math.min(0.98, fuse));
  const glow = g.createRadialGradient(fx, fy, 0, fx, fy, r * 0.9);
  glow.addColorStop(0, "rgba(255,244,196,0.95)");
  glow.addColorStop(0.35, "rgba(255,166,64,0.6)");
  glow.addColorStop(1, "rgba(255,120,40,0)");
  g.beginPath();
  g.arc(fx, fy, r * 0.9, 0, TAU);
  g.fillStyle = glow;
  g.fill();
  g.beginPath();
  g.arc(fx, fy, Math.max(0.9, r * 0.16), 0, TAU);
  g.fillStyle = "rgba(255,252,238,0.95)";
  g.fill();

  // 轮廓
  g.strokeStyle = "rgba(0,0,0,0.5)";
  g.lineWidth = Math.max(1, r * 0.07);
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.stroke();
  g.restore();
}

/**
 * 一刀：中间白、外圈虚的锥形刀光。
 * 三层不同宽度与不透明度 —— 一层直线看起来像 UI 元素，不像刀。
 */
export function paintSlash(g, spec) {
  const { x1, y1, x2, y2 } = spec;
  const w = Math.max(1.5, Number(spec.w) || 6);
  const alpha = spec.alpha == null ? 1 : Math.max(0, Math.min(1, spec.alpha));
  if (alpha <= 0.01) return;
  const tint = spec.tint || [255, 255, 255];
  g.save();
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.strokeStyle = css(tint, 0.1 * alpha);
  g.lineWidth = w * 2.6;
  g.stroke();
  g.strokeStyle = css(tint, 0.42 * alpha);
  g.lineWidth = w;
  g.stroke();
  g.strokeStyle = `rgba(255,255,255,${(0.95 * alpha).toFixed(3)})`;
  g.lineWidth = Math.max(1, w * 0.34);
  g.stroke();
  g.restore();
}

/** 指针刀痕：一条从新到旧逐渐变细变淡的折线（最多 ~16 段） */
export function paintTrail(g, pts, { tint = [255, 255, 255], width = 7, alpha = 1 } = {}) {
  const n = Array.isArray(pts) ? pts.length : 0;
  if (n < 4) return;
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  const segs = n / 2 - 1;
  for (let i = 0; i < segs; i += 1) {
    const k = (i + 1) / segs; // 越新越粗
    const a = alpha * k * k;
    if (a < 0.02) continue;
    const x1 = pts[i * 2];
    const y1 = pts[i * 2 + 1];
    const x2 = pts[i * 2 + 2];
    const y2 = pts[i * 2 + 3];
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokeStyle = css(tint, 0.16 * a);
    g.lineWidth = width * (0.5 + k) * 2.2;
    g.stroke();
    g.strokeStyle = css(tint, 0.5 * a);
    g.lineWidth = width * (0.35 + k * 0.9);
    g.stroke();
    g.strokeStyle = `rgba(255,255,255,${(0.9 * a).toFixed(3)})`;
    g.lineWidth = Math.max(1, width * (0.12 + k * 0.3));
    g.stroke();
  }
  g.restore();
}

/** 一次爆炸：白色核心 + 暖色环（炸弹开花用） */
export function paintBurst(g, spec) {
  const { x, y, r } = spec;
  const k = Math.max(0, Math.min(1, Number(spec.k) || 0));
  if (k <= 0.01 || !(r > 0)) return;
  const ease = 1 - (1 - k) * (1 - k);
  const rad = r * (0.35 + ease * 2.4);
  const a = 1 - k;
  const glow = g.createRadialGradient(x, y, 0, x, y, rad);
  glow.addColorStop(0, `rgba(255,252,238,${(0.95 * a).toFixed(3)})`);
  glow.addColorStop(0.4, `rgba(255,190,84,${(0.55 * a).toFixed(3)})`);
  glow.addColorStop(1, "rgba(255,120,40,0)");
  g.save();
  g.beginPath();
  g.arc(x, y, rad, 0, TAU);
  g.fillStyle = glow;
  g.fill();
  g.restore();
}
