/* ==========================================================================
   slider.js — 通用拖动条（进度 / 音量 / 设置里的强度调节共用）
   ========================================================================== */

import { clamp } from "./utils.js";

/**
 * 把 .slider 元素变成可拖动的滑杆
 * @param {HTMLElement} root  .slider 元素
 * @param {{min?:number,max?:number,step?:number,value?:number,
 *          onChange:(value:number)=>void,
 *          onCommit?:(value:number)=>void,
 *          format?:(value:number)=>string}} opts
 */
export function createSlider(root, opts = {}) {
  const min = opts.min ?? 0;
  const max = opts.max ?? 1;
  const step = opts.step ?? 0.001;
  let value = clamp(opts.value ?? min, min, max);
  let dragging = false;

  const fillEl = root.querySelector(".slider__fill");
  const bufferEl = root.querySelector(".slider__buffer");
  const thumbEl = root.querySelector(".slider__thumb");
  const bubbleEl = root.querySelector(".slider__bubble");

  // ★ aria-valuemin / aria-valuemax 必须由**这里**写，而且写的是**真实取值范围**。
  //
  // 之前只有 paint() 在写 aria-valuenow，而它写的是**百分比**（0~100）：
  // 对音量恰好等于取值范围所以看起来没问题，对进度（0..duration）、
  // 歌词字号（14..72）、定时分钟数（0..300）全都是错的 —— 屏幕阅读器读到的
  // 数值没有意义（见 docs/05-BUG审查报告.md 的同一条）。
  //
  // 量程是**构造时**就定死的（滑条不支持运行期改量程），所以放在这里写一次，
  // 不必每帧重写。aria-valuenow 的百分比问题属于另一个更深的语义问题
  // （要改成真实值就得同时改所有调用方的读法），不在本次改动范围内。
  root.setAttribute("aria-valuemin", String(min));
  root.setAttribute("aria-valuemax", String(max));

  function paint() {
    const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
    // 填充用 transform: scaleX()（可合成），不用 width（布局属性 + 会重启过渡，
    // 而进度条每个 store tick 都重画一次）。缩略图仍用 left：它是百分比定位，
    // 要换算成 transform 得先量父元素宽度，那恰好就是我们要避免的那次布局。
    // 用具体属性而不是自定义属性：CSP style-src 'self' 会拦截
    // el.style.setProperty("--x", …) 这种 CSSOM 写自定义属性的写法。
    if (fillEl) fillEl.style.transform = `scaleX(${pct / 100})`;
    if (thumbEl) thumbEl.style.left = `${pct}%`;
    if (bubbleEl && opts.format) bubbleEl.textContent = opts.format(value);
    root.setAttribute("aria-valuenow", String(Math.round(pct)));
  }

  function valueFromEvent(e) {
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0) return value;
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const raw = min + ratio * (max - min);
    const snapped = Math.round(raw / step) * step;
    return clamp(Number(snapped.toFixed(6)), min, max);
  }

  function moveBubble(e) {
    if (!bubbleEl) return;
    const rect = root.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, rect.width);
    bubbleEl.style.left = `${x}px`;
  }

  root.addEventListener("pointerdown", (e) => {
    if (root.dataset.disabled === "true") return;
    e.preventDefault();
    dragging = true;
    root.dataset.dragging = "true";
    root.setPointerCapture?.(e.pointerId);
    value = valueFromEvent(e);
    paint();
    moveBubble(e);
    opts.onChange?.(value);
  });

  root.addEventListener("pointermove", (e) => {
    moveBubble(e);
    if (!dragging) return;
    value = valueFromEvent(e);
    paint();
    opts.onChange?.(value);
  });

  const finish = (e) => {
    if (!dragging) return;
    dragging = false;
    root.dataset.dragging = "false";
    root.releasePointerCapture?.(e.pointerId);
    opts.onCommit?.(value);
  };

  root.addEventListener("pointerup", finish);
  root.addEventListener("pointercancel", finish);

  root.addEventListener("keydown", (e) => {
    if (root.dataset.disabled === "true") return;
    const big = (max - min) / 10;
    const small = step * 10;
    let next = value;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = value + small;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = value - small;
        break;
      case "PageUp":
        next = value + big;
        break;
      case "PageDown":
        next = value - big;
        break;
      case "Home":
        next = min;
        break;
      case "End":
        next = max;
        break;
      default:
        return;
    }
    e.preventDefault();
    value = clamp(Number(next.toFixed(6)), min, max);
    paint();
    opts.onChange?.(value);
    opts.onCommit?.(value);
  });

  paint();

  return {
    get value() {
      return value;
    },
    set(next, { silent = false } = {}) {
      const v = clamp(next, min, max);
      if (v === value && !silent) return;
      value = v;
      paint();
      if (!silent) opts.onChange?.(value);
    },
    setDisabled(disabled) {
      root.dataset.disabled = disabled ? "true" : "false";
    },
    setBuffer(pct) {
      if (bufferEl) bufferEl.style.transform = `scaleX(${clamp(pct, 0, 100) / 100})`;
    },
    /** 该值对应的展示文本（与气泡里的一致，供外部标签复用） */
    text(next = value) {
      return opts.format ? opts.format(next) : String(next);
    },
    paint,
  };
}
