// @ts-check
/* ==========================================================================
   background-layer.js — 整窗背景层
   --------------------------------------------------------------------------
   需求原文：「这个包里面提供播放详情界面的背景渲染和交互……再相关信息更新的时候
   需要（由宿主）推给背景扩展」。
   所以背景渲染属于包，但**放在 DOM 的哪个位置**是宿主的事：
   沉浸类样式的背景必须盖住标题栏与底栏，而 `.playerview` 带 transform 动效，
   其内部的 fixed 元素会被它的包含块裁住 —— 因此宿主把
   `ctx.backgroundRoot` 放在 `.app` 下（`.playerview` 之外，所有内容之下），
   皮肤用这个函数往里填内容。

   对外只有四个动作：设置图片、开关、调参、销毁。
   ========================================================================== */

/**
 * @typedef {Object} BackgroundLayer
 * @property {HTMLElement} element 背景层容器（就是传进来的 host）
 * @property {(on: boolean) => void} setEnabled 开关（关掉时整个容器 hidden）
 * @property {(src: string) => void} setImage 设置背景图（同图重复设置会跳过）
 * @property {(style?: { blur?: number, veil?: string, scale?: number, brightness?: number }) => void} setStyle
 * @property {() => void} destroy 清空内容并隐藏容器
 *
 * 进出的**过程**（滑入淡入 / 滑出淡出）不在这里，由宿主统一驱动：
 * 宿主给容器打 `data-state="opened" | "closed"`，样式在 background-layer.css 里。
 * 本文件只负责「有没有背景可显示」。
 */

/**
 * 创建（或复用）背景层。
 *
 * 注意：`.skin-bg` 这个类由**宿主写在 HTML 里**（它决定了容器在窗口里的位置与层级），
 * 本函数只负责往里填内容 / 清内容。类名不在这里增删：
 * 皮肤切换时宿主容器要一直存在（它的 hidden 状态也由这里控制），
 * 如果 destroy 时把类摘掉，下一次皮肤拿到的就是"没样式"的空盒子。
 *
 * @param {HTMLElement} host 宿主提供的容器（本函数会清空并填充它）
 * @returns {BackgroundLayer}
 */
export function createBackgroundLayer(host) {
  if (!host) throw new Error("createBackgroundLayer: 缺少宿主容器（ctx.backgroundRoot）");

  host.innerHTML = `
    <img class="skin-bg__img" alt="" />
    <div class="skin-bg__veil"></div>
    <div class="skin-bg__grain"></div>`;

  const img = /** @type {HTMLImageElement|null} */ (host.querySelector(".skin-bg__img"));
  let src = "";
  let enabled = false;

  // 封面图（data URL 或同源 URL）要解码完才能画出来。以前它就这么出现，
  // 于是「整块背景淡入完成 → 图突然砸上来」——复杂背景尤其明显。
  // 这里让图自己淡入（CSS 里本来就写好了这张图的 opacity 过渡，只是没人触发）。
  if (img) {
    img.addEventListener("load", () => {
      img.style.opacity = "1";
    });
    img.addEventListener("error", () => {
      img.style.opacity = "0";
    });
  }

  /** 容器只在「这张样式要背景」且「真的有图」时才渲染 */
  function sync() {
    host.hidden = !enabled || !src;
  }

  /** 同一张图不要重复赋值：重复写 src 会让浏览器重新解码一次大图（掉帧） */
  function setImage(next) {
    const value = next || "";
    if (value === src) return;
    src = value;
    if (img) {
      // 已经在显示上一张时先别清空，否则切歌瞬间会闪一下空白；
      // 只有「还没有任何图」时才从 0 开始淡入。
      if (!img.naturalWidth) img.style.opacity = "0";
      img.src = value;
    }
    sync();
  }

  return {
    element: host,
    /**
     * 开关背景层。关掉时整个容器 hidden —— 不这样做的话，
     * 非沉浸样式下也会平白多渲染一张模糊大图。
     */
    setEnabled(on) {
      enabled = Boolean(on);
      sync();
    },
    setImage,
    /**
     * 调整视觉参数（都是 CSS 自定义属性，主题/皮肤可以各自覆盖默认值）。
     * @param {{blur?:number, veil?:string, scale?:number, brightness?:number}} o
     */
    setStyle(o = {}) {
      if (typeof o.blur === "number") host.style.setProperty("--skin-bg-blur", `${o.blur}px`);
      if (typeof o.scale === "number") host.style.setProperty("--skin-bg-scale", String(o.scale));
      if (typeof o.brightness === "number") host.style.setProperty("--skin-bg-brightness", String(o.brightness));
      if (o.veil) host.style.setProperty("--skin-bg-veil", o.veil);
    },
    destroy() {
      host.hidden = true;
      host.innerHTML = "";
      host.removeAttribute("style");
      src = "";
      enabled = false;
    },
  };
}
