/* ==========================================================================
   dom.js — DOM 小工具、菜单 / 弹窗 / Toast
   ========================================================================== */

import { esc, uid } from "./utils.js";

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
    document.removeEventListener("pointerdown", onDocDown, true);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onScroll);
    m.hidden = true;
    m.innerHTML = "";
    menuCloser = null;
  };
}

export function closeMenu() {
  menuCloser?.();
}

/* --------------------------------------------------------------------------
   弹窗
   -------------------------------------------------------------------------- */
const backdrop = () => document.getElementById("modal-backdrop");

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
  bd.hidden = false;

  const modal = bd.querySelector(".modal");
  const errEl = bd.querySelector("#modal-error");
  const firstInput = modal.querySelector("input, select, textarea");
  setTimeout(() => firstInput?.focus({ preventScroll: true }), 30);

  const close = () => {
    bd.hidden = true;
    bd.innerHTML = "";
    document.removeEventListener("keydown", onKey);
    bd.onclick = null;
  };

  const collect = () => {
    const out = {};
    modal.querySelectorAll("[data-field]").forEach((n) => {
      out[n.dataset.field] = n.type === "checkbox" ? n.checked : n.value;
    });
    return out;
  };

  const submit = () => {
    const res = opts.onOk?.(collect(), modal);
    if (res === false) return;
    if (typeof res === "string") {
      errEl.textContent = res;
      errEl.classList.remove("u-hidden");
      return;
    }
    close();
  };

  const onKey = (e) => {
    if (e.key === "Escape") close();
    if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      submit();
    }
  };

  bd.onclick = (e) => {
    if (e.target === bd) close();
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "cancel") close();
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
      setTimeout(() => node.remove(), 220);
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
