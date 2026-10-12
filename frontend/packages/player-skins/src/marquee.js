// @ts-check
/* ==========================================================================
   marquee.js — 标题「单行 + 放不下时横向跑马灯」（`ctx.sdk.marqueeText`）
   --------------------------------------------------------------------------
   需求原文：「歌词区域里面，歌曲的标题太长会占据多行内容，帮我改成单行不换行，
   超出区域使用横向跑马灯滚动」。

   为什么由宿主提供、而不是皮肤各写一遍：
     · 皮肤是**零 import** 的（契约 v3），跨皮肤复制一份测量代码必然走样；
     · 「文本到底有没有超出盒子」只能**量**出来（CSS 判不了），而且要在换歌、
       窗口缩放、面板变宽之后重量 —— 这套「观察 + 重量」的生命周期宿主收口最省事。

   皮肤侧的用法只有一行（顺序无所谓：先建 class 后设文本都行）：

     const title = ctx.root.querySelector("#pv-title");
     ctx.sdk.marqueeText(title, song.title || "未在播放");

   它做的事：
     · 元素加上宿主骨架样式 `.mp-marquee`（见 marquee.css）：单行 + 溢出裁剪；
     · 文本包一层 `.mp-marquee__text`，放不下时给它挂上动画（`data-marquee="on"`），
       放得下就只居中显示，一点都不动；
     · 量出来的两个值写成**元素自己的**自定义属性：`--mp-marquee-shift`（要滚多远）
       与 `--mp-marquee-dur`（滚多久）。按固定速度算，所以长标题不会滚得飞快 ——
       这两个值是逐元素量出来的，只能挂元素上，不走 setRuntimeToken 那套全局令牌。
   ========================================================================== */

/** 横向滚动速度（px/s） */
const SPEED = 42;
/** 往返两端各停顿的比例（与 marquee.css 的关键帧百分比一致） */
const HOLD_RATIO = 0.1;
/** 少于这么多像素不算「放不下」：亚像素误差不该让标题抖起来 */
const SLACK_PX = 1;

/**
 * 取（或第一次建立）元素的跑马灯状态。状态挂在元素上：皮肤销毁时元素一起没，
 * ResizeObserver 随之失效，不需要皮肤再记一个 destroy。
 * @param {HTMLElement} el
 */
function stateOf(el) {
  const host = /** @type {any} */ (el);
  if (host.__mpMarquee) return host.__mpMarquee;

  // 已有的内层 span 就**沿用**（插件自己画的 DOM / 模板渲染的 span 都算），
  // 别再 replaceChildren —— 那会把调用方的节点引用弄成孤儿
  const adopted = /** @type {HTMLElement|null} */ (el.querySelector(":scope > .mp-marquee__text"));
  let text = adopted;
  if (!text) {
    text = document.createElement("span");
    text.className = "mp-marquee__text";
    el.replaceChildren(text);
  }
  el.classList.add("mp-marquee");

  const st = { text, value: /** @type {string|null} */ (null), ro: /** @type {any} */ (null) };
  host.__mpMarquee = st;

  // 元素尺寸变了要重量：窗口缩放、详情页进出场、歌词区宽度变化都会碰到
  if (typeof ResizeObserver === "function") {
    st.ro = new ResizeObserver(() => measure(el, st));
    st.ro.observe(el);
  }
  return st;
}

/**
 * 量一次：按「文本宽度 - 盒子宽度」决定滚不滚、滚多远、滚多久。
 * @param {HTMLElement} el
 * @param {{text: HTMLElement, value: string|null}} st
 */
function measure(el, st) {
  const box = el.clientWidth;
  // offsetWidth / scrollWidth 都不含 transform，所以正在滚动时量也准
  const wide = Math.max(st.text.scrollWidth, st.text.offsetWidth);
  const shift = wide - box;

  if (box <= 0 || shift <= SLACK_PX) {
    // 放得下（或还没挂上尺寸）：保持静态居中，别白滚
    el.removeAttribute("data-marquee");
    el.style.removeProperty("--mp-marquee-shift");
    el.style.removeProperty("--mp-marquee-dur");
    return;
  }

  // 关键帧里两端各有 10% 的停顿，所以「滚动段」的时长要反推回总时长
  const total = shift / SPEED / (1 - HOLD_RATIO * 2);
  el.style.setProperty("--mp-marquee-shift", `-${Math.round(shift)}px`);
  el.style.setProperty("--mp-marquee-dur", `${total.toFixed(2)}s`);
  el.setAttribute("data-marquee", "on");
}

/**
 * 让一个元素单行显示标题：放不下时横向来回滚动。
 *
 * 幂等：同一首歌重复调用不会重建 DOM，也不会重启动画（值没变就不重量）。
 *
 * @param {HTMLElement|null|undefined} el 标题元素（皮肤自己的那个）
 * @param {string|number|null|undefined} value 标题文本
 * @returns {void}
 */
export function marqueeText(el, value) {
  if (!el) return;
  const st = stateOf(el);
  const next = value == null ? "" : String(value);
  if (st.value !== next) {
    st.value = next;
    st.text.textContent = next;
  }
  measure(el, st);
}
