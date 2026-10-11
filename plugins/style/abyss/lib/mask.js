/* ==========================================================================
   深渊 abyss · lib/mask.js —— 字形遮罩（"同一份排版渲染两次"里的第二次）
   --------------------------------------------------------------------------
   本款的技术核心：DOM 上的文字是**真的文字**（矢量、可选、可点、宿主排版），
   而水面凹陷来自另一张**同字体、同字号、同坐标**的遮罩纹理 ——
   shader 拿它求梯度当法线，把液面压下去。两者对不齐，文字就会"浮"在水上。

   所以这里的做法是：不猜布局，**量**出来。
   逐文本节点用 `Range.getBoundingClientRect()` 拿到真实盒子（当前行被拆成
   逐字素 span 时，每个字素都有自己精确的盒子），按同一个字体画进遮罩画布。
   自检里用"遮罩墨迹包围盒 vs DOM 文字包围盒"的差值来断言对齐（真机实测 ≤ 2px）。
   ========================================================================== */

/* 子模块之间不许静态 import（会绕开入口的 ?t= token）：依赖由 skin.js 注入 */
/** 遮罩画布的分辨率：跟 dpr 走，但长边封在 2048（4K + dpr2 下别上传一张 8MB 的纹理） */
export function maskScaleFor(cssW, cssH, dpr, maxEdge = 2048) {
  const want = Math.max(1, Number(dpr) || 1);
  const long = Math.max(cssW, cssH) * want;
  return long > maxEdge ? (maxEdge / long) * want : want;
}

/** 量出一行里所有文本节点的盒子（相对舞台左上角，单位 CSS px） */
export function textRects(lineEl, stageEl) {
  if (!lineEl || !stageEl || typeof document === "undefined") return [];
  const s = stageEl.getBoundingClientRect();
  const out = [];
  const walk = (node) => {
    for (const child of node.childNodes || []) {
      if (child.nodeType === 3) {
        const text = child.nodeValue || "";
        if (!text.trim()) continue;
        let rect = null;
        try {
          const range = document.createRange();
          range.selectNodeContents(child);
          rect = range.getBoundingClientRect();
          range.detach?.();
        } catch {
          rect = null;
        }
        if (!rect || !rect.width) continue;
        const host = child.parentElement || lineEl;
        let font = "";
        let spacing = "";
        try {
          const cs = getComputedStyle(host);
          font = cs.font || `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          spacing = cs.letterSpacing;
        } catch {
          font = "";
        }
        out.push({
          x: rect.left - s.left,
          y: rect.top - s.top,
          w: rect.width,
          h: rect.height,
          text,
          font,
          spacing,
        });
      } else if (child.nodeType === 1) {
        const tag = child.tagName;
        if (tag === "BR") continue;
        walk(child);
      }
    }
  };
  walk(lineEl);
  return out;
}

/**
 * 把一行文字画进遮罩画布。
 * 返回 { items, w, h, box }：box 是画出来的墨迹包围盒（遮罩像素，左/上/右/下），
 * 自检拿它跟 DOM 的文本包围盒比 —— "两次排版对得上"这件事必须能被量。
 */
export function paintMask(canvas, stageEl, lineEl, dpr, opts = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const maskPlan = typeof opts.maskPlan === "function" ? opts.maskPlan : null;
  if (!maskPlan) return null;
  const cssW = Math.max(1, Number(opts.cssW) || stageEl?.clientWidth || 1);
  const cssH = Math.max(1, Number(opts.cssH) || stageEl?.clientHeight || 1);
  const scale = maskScaleFor(cssW, cssH, dpr, Number(opts.maxEdge) || 2048);
  // maskPlan 的第三个参数是"每 CSS px 多少个遮罩像素" —— 这里就是 scale 本身
  const plan = maskPlan(textRects(lineEl, stageEl), { width: cssW, height: cssH }, scale);
  canvas.width = plan.w;
  canvas.height = plan.h;

  const g = ctx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#000";
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillStyle = "#fff";
  let box = null;
  for (const it of plan.items) {
    g.font = it.font || `${Math.round(14 * plan.scale)}px sans-serif`;
    if (it.spacing && "letterSpacing" in g) {
      try {
        g.letterSpacing = it.spacing;
      } catch {
        /* 老引擎不认就算了 */
      }
    }
    const w = g.measureText(it.text).width || it.w;
    g.fillText(it.text, it.x, it.y + it.h / 2);
    const right = it.x + Math.max(w, it.w);
    const top = it.y;
    const bottom = it.y + it.h;
    box = box
      ? { l: Math.min(box.l, it.x), t: Math.min(box.t, top), r: Math.max(box.r, right), b: Math.max(box.b, bottom) }
      : { l: it.x, t: top, r: right, b: bottom };
  }
  if (box) {
    box.l = Math.round(box.l);
    box.t = Math.round(box.t);
    box.r = Math.round(box.r);
    box.b = Math.round(box.b);
    box.w = box.r - box.l;
    box.h = box.b - box.t;
  }
  return { items: plan.items.length, w: canvas.width, h: canvas.height, scale: plan.scale, box };
}

/** DOM 那一侧的文本包围盒（同一坐标系：相对舞台左上角，遮罩像素单位） */
export function domTextBox(lineEl, stageEl, scale) {
  if (!lineEl || !stageEl) return null;
  const rects = textRects(lineEl, stageEl);
  if (!rects.length) return null;
  let box = null;
  for (const r of rects) {
    const l = r.x * scale;
    const t = r.y * scale;
    const rr = (r.x + r.w) * scale;
    const b = (r.y + r.h) * scale;
    box = box
      ? { l: Math.min(box.l, l), t: Math.min(box.t, t), r: Math.max(box.r, rr), b: Math.max(box.b, b) }
      : { l, t, r: rr, b };
  }
  if (!box) return null;
  return { l: Math.round(box.l), t: Math.round(box.t), r: Math.round(box.r), b: Math.round(box.b), w: Math.round(box.r - box.l), h: Math.round(box.b - box.t) };
}
