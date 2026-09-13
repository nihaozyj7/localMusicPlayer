/* ==========================================================================
   dom.js — DOM 小工具、菜单 / 弹窗 / Toast
   ========================================================================== */

import { DEFAULT_COVER, esc, uid } from "./utils.js";
import { animationFastMs, animationMs } from "./runtime-tokens.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** 生成 <svg><use href="#icon"/></svg> */
export function icon(name, cls = "") {
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

/** 由 HTML 字符串创建元素 */
export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** 设置 innerHTML（自动 trim，避免多余空白节点） */
export function html(node, markup) {
  node.innerHTML = markup;
  return node;
}

/* --------------------------------------------------------------------------
   浮层菜单
   -------------------------------------------------------------------------- */
const menuEl = () => document.getElementById("menu");

let menuCloser = null;
/** 关闭动画的收尾定时器（关闭是「先播动画再真的 hidden」） */
let menuCloseTimer = null;
/** 关-开快速交替时的序号：过期的收尾回调不许把新菜单藏起来 */
let menuSeq = 0;

// 菜单退出等的是 CSS 里的 --dur-fast（= --dur × 0.6，见 tokens.css）。
// 以前这里是写死的 140ms，但「过渡速度」变成用户可调之后，写死就会在
// 0.35s / 0.5s 档把菜单的淡出切掉 —— 所以在真正关闭时才读一次 --dur。

/**
 * 打开浮层菜单
 * @param {{x:number,y:number,items:Array,anchor?:HTMLElement}} opts
 * items: { id, label, icon, kind:'item'|'sep'|'label', danger?, checked?, disabled?, hint? }
 */
export function openMenu({ x, y, items, anchor, onPick, align = "left" }) {
  const m = menuEl();
  m.innerHTML = items
    .map((it) => {
      if (it.kind === "sep") return `<div class="menu__sep"></div>`;
      if (it.kind === "label") return `<div class="menu__label">${esc(it.label)}</div>`;
      const cls = `menu__item${it.danger ? " menu__item--danger" : ""}`;
      const extra = [
        it.disabled ? "disabled" : "",
        it.checked !== undefined ? `aria-checked="${it.checked}"` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const check = it.checked !== undefined ? icon("check", "menu__check") : "";
      const trailing = check || (it.hint ? `<span class="u-num u-dim">${esc(it.hint)}</span>` : "");
      return `<button class="${cls}" type="button" role="menuitem" data-id="${esc(it.id)}" ${extra}>
        ${it.icon ? icon(it.icon) : ""}<span>${esc(it.label)}</span>${trailing}
      </button>`;
    })
    .join("");

  // 上一次「关闭后的收尾」可能还没跑：取消掉，否则它会把这次的菜单藏起来
  if (menuCloseTimer) {
    clearTimeout(menuCloseTimer);
    menuCloseTimer = null;
  }
  const seq = ++menuSeq;
  m.dataset.state = "";
  m.hidden = false;
  // 先显示再量尺寸，避免越界
  const rect = m.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x;
  let top = y;
  if (anchor) {
    const a = anchor.getBoundingClientRect();
    left = align === "right" ? a.right - rect.width : a.left;
    top = a.bottom + 6;
    if (top + rect.height > vh - 8) top = a.top - rect.height - 6;
  }
  left = Math.max(8, Math.min(left, vw - rect.width - 8));
  top = Math.max(8, Math.min(top, vh - rect.height - 8));
  m.style.left = `${left}px`;
  m.style.top = `${top}px`;

  const onDocDown = (e) => {
    if (m.contains(e.target)) return;
    closeMenu();
  };
  const onKey = (e) => {
    if (e.key === "Escape") closeMenu();
  };
  const onScroll = () => closeMenu();

  // 下一帧再进 open：display:none → 块级 与 opacity 0 → 1 在同一帧里
  // 浏览器只会看到「最终态」，过渡不会触发（菜单会直接闪现）。
  requestAnimationFrame(() => {
    if (seq !== menuSeq) return;
    m.dataset.state = "open";
  });

  setTimeout(() => {
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
  }, 0);

  m.onclick = (e) => {
    const btn = e.target.closest(".menu__item");
    if (!btn || btn.hasAttribute("disabled")) return;
    const id = btn.dataset.id;
    closeMenu();
    onPick?.(id);
  };

  menuCloser = () => {
    // 监听器立刻摘掉（否则关闭动画期间点在菜单外还会再触发一次 close），
    // 但 DOM 要等动画播完再收 —— 这就是「菜单淡出」而不是「啪一下没了」。
    document.removeEventListener("pointerdown", onDocDown, true);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onScroll);
    menuCloser = null;
    m.dataset.state = "closed";
    if (menuCloseTimer) clearTimeout(menuCloseTimer);
    menuCloseTimer = setTimeout(() => {
      menuCloseTimer = null;
      if (seq !== menuSeq) return;
      m.hidden = true;
      m.innerHTML = "";
    }, animationFastMs() + 20);
  };
}

export function closeMenu() {
  menuCloser?.();
}

/* --------------------------------------------------------------------------
   弹窗
   -------------------------------------------------------------------------- */
const backdrop = () => document.getElementById("modal-backdrop");

/** 弹窗关闭动画的收尾定时器与序号（时长同样跟 --dur 走） */
let modalCloseTimer = null;
let modalSeq = 0;

/**
 * 打开弹窗
 * @param {{title:string, desc?:string, body?:string, okText?:string, cancelText?:string,
 *          danger?:boolean, onOk?:(values:object, root:HTMLElement)=>boolean|void}} opts
 */
export function openModal(opts) {
  const bd = backdrop();
  const okId = uid("ok");
  bd.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(opts.title)}">
      <div class="modal__head">${esc(opts.title)}</div>
      ${opts.desc ? `<div class="modal__desc">${esc(opts.desc)}</div>` : ""}
      <div class="modal__body">${opts.body || ""}</div>
      <div class="modal__error u-hidden" id="modal-error"></div>
      <div class="modal__foot">
        <button class="btn btn--ghost" type="button" data-act="cancel">${esc(opts.cancelText || "取消")}</button>
        <button class="btn ${opts.danger ? "btn--danger" : "btn--primary"}" type="button" data-act="ok" id="${okId}">
          ${esc(opts.okText || "确定")}
        </button>
      </div>
    </div>`;
  if (modalCloseTimer) {
    clearTimeout(modalCloseTimer);
    modalCloseTimer = null;
  }
  const seq = ++modalSeq;
  bd.dataset.state = "";
  bd.hidden = false;
  requestAnimationFrame(() => {
    if (seq !== modalSeq) return;
    bd.dataset.state = "open";
  });

  const modal = bd.querySelector(".modal");
  const errEl = bd.querySelector("#modal-error");
  const firstInput = modal.querySelector("input, select, textarea");
  setTimeout(() => firstInput?.focus({ preventScroll: true }), 30);

  // 关闭要幂等：弹窗现在有 220ms 的淡出，这期间再按一次 Esc / 回车
  // 不能重复执行 onOk（例如「新建歌单」会被建两遍）。
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    document.removeEventListener("keydown", onKey);
    bd.onclick = null;
    // 先播淡出动画，再真的清空 —— 否则弹窗是「瞬间消失」的
    bd.dataset.state = "closed";
    if (modalCloseTimer) clearTimeout(modalCloseTimer);
    modalCloseTimer = setTimeout(() => {
      modalCloseTimer = null;
      if (seq !== modalSeq) return;
      bd.hidden = true;
      bd.innerHTML = "";
    }, animationMs() + 20);
  };

  // 取消按钮可能不只是「关掉」：例如改下载目录时，「不迁移」也是一个有效选择。
  // 所以给 onCancel 一个机会先做事，返回 false 才阻止关闭。
  const cancel = async () => {
    const res = await opts.onCancel?.(bd.querySelector(".modal"));
    if (res === false) return;
    close();
  };

  const collect = () => {
    const out = {};
    modal.querySelectorAll("[data-field]").forEach((n) => {
      out[n.dataset.field] = n.type === "checkbox" ? n.checked : n.value;
    });
    return out;
  };

  // onOk 允许是异步的（例如「迁移并更改下载位置」要等后端搬完文件再关弹窗）。
  // 返回 false 表示拒绝关闭，返回字符串表示在弹窗里显示错误。
  const submit = async () => {
    const res = await opts.onOk?.(collect(), modal);
    if (res === false) return;
    if (typeof res === "string") {
      errEl.textContent = res;
      errEl.classList.remove("u-hidden");
      return;
    }
    close();
  };

  const onKey = (e) => {
    if (e.key === "Escape") cancel();
    if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      submit();
    }
  };

  bd.onclick = (e) => {
    if (e.target === bd) cancel();
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "cancel") cancel();
    if (act === "ok") submit();
  };
  document.addEventListener("keydown", onKey);

  return { close, root: modal };
}

/* --------------------------------------------------------------------------
   Toast
   -------------------------------------------------------------------------- */
export function toast(message, { tone = "info", duration = 2800, icon: ic = null } = {}) {
  const box = document.getElementById("toasts");
  const node = el(`<div class="toast" data-tone="${tone}">
    <span class="toast__dot"></span>
    ${ic ? icon(ic) : ""}
    <span>${esc(message)}</span>
  </div>`);
  box.appendChild(node);
  if (duration > 0) {
    setTimeout(() => {
      node.classList.add("is-leaving");
      setTimeout(() => node.remove(), animationMs() + 20);
    }, duration);
  }
  return {
    update(text, nextTone = tone) {
      node.dataset.tone = nextTone;
      node.querySelector("span:last-child").textContent = text;
    },
    close() {
      node.remove();
    },
  };
}

/* --------------------------------------------------------------------------
   其它
   -------------------------------------------------------------------------- */
export function setBusy(btn, busy) {
  if (!btn) return;
  btn.classList.toggle("is-busy", Boolean(busy));
  btn.disabled = Boolean(busy);
}

export function on(root, event, selector, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}

/**
 * 给 img 挂上「加载失败 → 换成默认封面」的兜底。
 *
 * 后端没解析到内嵌封面、或封面地址失效时，<img> 会渲染浏览器的破碎图标。
 * 这里捕获 error（图片的 error 事件不冒泡，必须用捕获阶段）并替换 src，
 * 用 dataset 标记防止默认封面本身再失败时无限递归。
 */
export function bindCoverFallback(img) {
  if (!img || img.dataset.coverFallback === "1") return;
  img.dataset.coverFallback = "1";
  img.addEventListener(
    "error",
    () => {
      if (img.dataset.coverFallbackDone === "1") return;
      img.dataset.coverFallbackDone = "1";
      img.src = DEFAULT_COVER;
    },
    true
  );
}

/* --------------------------------------------------------------------------
   全局 Tooltip：把 data-tip 提示提到 body 顶层，避免被 overflow 裁剪或超出视口。
   -------------------------------------------------------------------------- */
export function initTooltips() {
  let tip = document.getElementById("app-tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "app-tip";
    tip.id = "app-tip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
  }

  let current = null;

  const titlebarFromRoot = () => {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--h-titlebar").trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 36;
  };

  function position() {
    if (!current) return;
    const r = current.getBoundingClientRect();
    // 先放到右上角让 offsetWidth/Height 可量，再按可视区夹取
    tip.style.left = "0px";
    tip.style.top = "0px";
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topBar = titlebarFromRoot();

    let left = r.left + r.width / 2 - tw / 2;
    let top = r.top - th - 6;
    if (top < topBar + 4) top = r.bottom + 6; // 上方放不下就放到下方
    left = Math.max(8, Math.min(left, vw - tw - 8));
    top = Math.max(topBar + 4, Math.min(top, vh - th - 8));
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function show(target) {
    const text = target?.getAttribute?.("data-tip");
    if (!text) {
      hide();
      return;
    }
    tip.textContent = text;
    tip.dataset.visible = "true";
    current = target;
    position();
  }

  function hide() {
    delete tip.dataset.visible;
    current = null;
  }

  document.addEventListener("mouseover", (e) => {
    const t = e.target.closest?.("[data-tip]");
    if (t) show(t);
    else hide();
  });

  document.addEventListener("mouseout", (e) => {
    const t = e.target.closest?.("[data-tip]");
    if (t && !t.contains(e.relatedTarget)) hide();
  });

  document.addEventListener("pointerdown", hide, true);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}
