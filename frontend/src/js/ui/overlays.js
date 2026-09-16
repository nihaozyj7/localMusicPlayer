/* ==========================================================================
   ui/overlays.js — 浮层菜单 / 弹窗 / Toast / Tooltip（Lit 渲染）
   --------------------------------------------------------------------------
   这一层保留了原来的**命令式 API**（openMenu / openModal / toast），
   因为它们是从业务逻辑里被随手调用的（右键菜单、确认框、进度提示），
   套成「组件 + 属性」反而会把每个调用点都改成响应式。

   渲染本身交给 Lit：菜单项、弹窗、Toast 列表全部是 lit-html 模板，
   增量更新（toast 文案刷新只改一个文本节点，不再重建节点）。
   容器是三个常驻单例节点（#menu / #modal-backdrop / #toasts），
   与迁移前 index.html 里的静态节点保持一致 —— 自检脚本按这些 id 查询。

   注意：这里用 lit 的**同步 render()**（而不是 LitElement 的异步更新），
   因为调用方依赖「openModal 返回后 .modal 已经在 DOM 里」这个同步语义
   （例如加入歌单的复选框要立刻按 data-field 收集）。
   ========================================================================== */

import { render, html, nothing, svg } from "lit";
import { animationFastMs, animationMs } from "../runtime-tokens.js";
import { DEFAULT_COVER, esc, uid } from "../utils.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** svg + use（给业务逻辑里少量还需要字符串的场合留一个转义安全的入口） */
export function icon(name, cls = "") {
  return html`<svg class=${cls || nothing} aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

/* --------------------------------------------------------------------------
   常驻浮层容器（与迁移前 index.html 的结构一致）
   -------------------------------------------------------------------------- */
function ensureContainer(id, className, extra = {}) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.className = className;
    for (const [k, v] of Object.entries(extra)) el.setAttribute(k, v);
    document.body.appendChild(el);
  }
  return el;
}

const menuEl = () => ensureContainer("menu", "menu", { hidden: "", role: "menu" });
const backdropEl = () => ensureContainer("modal-backdrop", "modal-backdrop", { hidden: "" });
const toastsEl = () => ensureContainer("toasts", "toasts", { "aria-live": "polite" });

/* --------------------------------------------------------------------------
   浮层菜单
   -------------------------------------------------------------------------- */
/** 关闭动画的收尾定时器（关闭是「先播动画再真的 hidden」） */
let menuCloseTimer = null;
/** 关-开快速交替时的序号：过期的收尾回调不许把新菜单藏起来 */
let menuSeq = 0;
let menuCloser = null;

/**
 * 打开浮层菜单
 * @param {{x:number,y:number,items:Array,anchor?:HTMLElement,onPick?:(id:string)=>void,align?:"left"|"right"}} opts
 * items: { id, label, icon, kind:'item'|'sep'|'label', danger?, checked?, disabled?, hint? }
 */
export function openMenu({ x, y, items, anchor, onPick, align = "left" }) {
  const m = menuEl();
  const seq = ++menuSeq;
  if (menuCloseTimer) {
    clearTimeout(menuCloseTimer);
    menuCloseTimer = null;
  }

  const onPickItem = (id) => {
    closeMenu();
    onPick?.(id);
  };

  render(
    items.map((it) => {
      if (it.kind === "sep") return html`<div class="menu__sep"></div>`;
      if (it.kind === "label") return html`<div class="menu__label">${it.label}</div>`;
      const check = it.checked !== undefined ? icon("check", "menu__check") : null;
      return html` <button
        class=${it.danger ? "menu__item menu__item--danger" : "menu__item"}
        type="button"
        role="menuitem"
        data-id=${it.id}
        ?disabled=${Boolean(it.disabled)}
        aria-checked=${it.checked !== undefined ? String(it.checked) : nothing}
        @click=${() => {
          if (it.disabled) return;
          onPickItem(it.id);
        }}
      >
        ${it.icon ? icon(it.icon) : nothing}<span>${it.label}</span>
        ${check || (it.hint ? html`<span class="u-num u-dim">${it.hint}</span>` : nothing)}
      </button>`;
    }),
    m
  );

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
      render(nothing, m);
    }, animationFastMs() + 20);
  };
}

export function closeMenu() {
  menuCloser?.();
}

/* --------------------------------------------------------------------------
   弹窗
   -------------------------------------------------------------------------- */
let modalCloseTimer = null;
let modalSeq = 0;

/**
 * 打开弹窗
 * @param {{title:string, desc?:string, body?:unknown, okText?:string, cancelText?:string,
 *          danger?:boolean, onOk?:(values:object, root:HTMLElement)=>boolean|string|void|Promise<boolean|string|void>,
 *          onCancel?:(root:HTMLElement)=>boolean|void|Promise<boolean|void>}} opts
 */
export function openModal(opts) {
  const bd = backdropEl();
  const okId = uid("ok");
  if (modalCloseTimer) {
    clearTimeout(modalCloseTimer);
    modalCloseTimer = null;
  }
  const seq = ++modalSeq;
  let closing = false;

  const close = () => {
    if (closing) return;
    closing = true;
    document.removeEventListener("keydown", onKey);
    // 先播淡出动画，再真的清空 —— 否则弹窗是「瞬间消失」的
    bd.dataset.state = "closed";
    if (modalCloseTimer) clearTimeout(modalCloseTimer);
    modalCloseTimer = setTimeout(() => {
      modalCloseTimer = null;
      if (seq !== modalSeq) return;
      bd.hidden = true;
      render(nothing, bd);
    }, animationMs() + 20);
  };

  const cancel = async () => {
    const root = bd.querySelector(".modal");
    const res = await opts.onCancel?.(root);
    if (res === false) return;
    close();
  };

  const collect = (modal) => {
    const out = {};
    modal.querySelectorAll("[data-field]").forEach((n) => {
      out[n.dataset.field] = n.type === "checkbox" ? n.checked : n.value;
    });
    return out;
  };

  const submit = async () => {
    const modal = bd.querySelector(".modal");
    const res = await opts.onOk?.(collect(modal), modal);
    if (res === false) return;
    if (typeof res === "string") {
      const errEl = bd.querySelector("#modal-error");
      if (errEl) {
        errEl.textContent = res;
        errEl.classList.remove("u-hidden");
      }
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

  render(
    html`
      <div class="modal" role="dialog" aria-modal="true" aria-label=${opts.title}>
        <div class="modal__head">${opts.title}</div>
        ${opts.desc ? html`<div class="modal__desc">${opts.desc}</div>` : nothing}
        <div class="modal__body">${opts.body ?? nothing}</div>
        <div class="modal__error u-hidden" id="modal-error"></div>
        <div class="modal__foot">
          <button class="btn btn--ghost" type="button" @click=${cancel}>${opts.cancelText || "取消"}</button>
          <button
            class=${opts.danger ? "btn btn--danger" : "btn btn--primary"}
            type="button"
            id=${okId}
            @click=${submit}
          >
            ${opts.okText || "确定"}
          </button>
        </div>
      </div>
    `,
    bd
  );

  bd.dataset.state = "";
  bd.hidden = false;
  requestAnimationFrame(() => {
    if (seq !== modalSeq) return;
    bd.dataset.state = "open";
  });

  const modal = bd.querySelector(".modal");
  // 点遮罩空白处 = 取消
  bd.onclick = (e) => {
    if (e.target === bd) cancel();
  };
  const firstInput = modal.querySelector("input, select, textarea");
  setTimeout(() => firstInput?.focus({ preventScroll: true }), 30);
  document.addEventListener("keydown", onKey);

  return { close, root: modal };
}

/* --------------------------------------------------------------------------
   Toast
   -------------------------------------------------------------------------- */
/** 当前所有 toast（渲染用） */
let toastItems = [];

function paintToasts() {
  render(
    toastItems.map(
      (t) =>
        html` <div class="toast ${t.leaving ? "is-leaving" : ""}" data-tone=${t.tone}>
          <span class="toast__dot"></span>
          ${t.icon ? icon(t.icon) : nothing}
          <span>${t.message}</span>
        </div>`
    ),
    toastsEl()
  );
}

export function toast(message, { tone = "info", duration = 2800, icon: ic = null } = {}) {
  const item = { id: uid("toast"), message, tone, icon: ic, leaving: false };
  toastItems = [...toastItems, item];
  paintToasts();

  let leaveTimer = null;
  const schedule = (ms) => {
    if (leaveTimer) clearTimeout(leaveTimer);
    if (ms > 0) leaveTimer = setTimeout(() => dismiss(), ms);
  };
  const dismiss = () => {
    const found = toastItems.find((x) => x.id === item.id);
    if (!found || found.leaving) return;
    found.leaving = true;
    paintToasts();
    setTimeout(() => {
      toastItems = toastItems.filter((x) => x.id !== item.id);
      paintToasts();
    }, animationMs() + 20);
  };

  schedule(duration);

  return {
    update(text, nextTone = tone) {
      item.message = text;
      item.tone = nextTone;
      paintToasts();
    },
    close() {
      dismiss();
    },
  };
}

/* --------------------------------------------------------------------------
   其它小工具
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
 * 用「当前 src 是不是已经是默认封面」做判据，避免默认封面本身失败时无限递归。
 */
function isDefaultCoverSrc(img) {
  return img.currentSrc === DEFAULT_COVER || img.src === DEFAULT_COVER || img.getAttribute("src") === DEFAULT_COVER;
}

export function bindCoverFallback(img) {
  if (!img || img.dataset.coverFallback === "1") return;
  img.dataset.coverFallback = "1";
  img.addEventListener(
    "error",
    () => {
      if (isDefaultCoverSrc(img)) return;
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

/* --------------------------------------------------------------------------
   数据集变化的显式广播（皮肤注册表 / 下载任务等 Lit 之外的来源）
   -------------------------------------------------------------------------- */
export { requestAppUpdate } from "./base.js";

/** 供业务逻辑里还需要字符串转义的地方使用 */
export { esc, svg };
