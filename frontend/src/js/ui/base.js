/* ==========================================================================
   ui/base.js — Lit 组件基类与共享渲染工具
   --------------------------------------------------------------------------
   为什么用 **light DOM**（createRenderRoot 返回 this，不用 Shadow DOM）：

     这个项目的样式全部是全局 class 选择器，而且它们**是对外契约**——
     主题 CSS（styles/themes/*）、播放界面皮肤包（packages/player-skins）、
     以及 tools/*.mjs 里的无头自检脚本，都按 #id / .class 查询。
     套一层 Shadow DOM 会把这些全部挡在外面。

     所以 Lit 在这里只负责「模板 + 增量 diff」，不负责样式封装。
     宿主元素统一 display:contents（见 styles/utilities.css），不产生盒子，
     布局仍由模板里的 .app / .main / .playerbar 这些真实元素决定。

   响应式：
     组件通过静态 static deps(state) 声明自己真正依赖的**原始值数组**；
     订阅 store 后逐项 === 比较，只有变了才 requestUpdate()。
     这就是取代旧 main.js#renderKey 的那套东西 —— 但责任在组件自己身上，
     不会因为「忘了往 key 里加字段」而出现界面不更新。
   ========================================================================== */

import { LitElement, html, nothing, svg, noChange } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { live } from "lit/directives/live.js";
import { subscribe, state } from "../store.js";

export { html, nothing, svg, noChange, repeat, classMap, styleMap, ifDefined, live };

/** 生成 svg + use 引用（与旧 dom.js#icon 的产物一致） */
export function icon(name, cls = "") {
  return html`<svg class=${cls || nothing} aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

/** 逐项 === 比较两个依赖数组 */
function sameDeps(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** 已经挂载的组件；requestAppUpdate() 用它广播「非 store 的」外部状态变化 */
const mounted = new Set();

/**
 * 通知所有已挂载组件重新求值依赖。
 *
 * 用在 store 之外的变化源上（下载任务快照、皮肤注册表、歌词缓存…）：
 * 那些模块改完自己的数据后调用一次，组件在 deps() 里读对应快照即可。
 */
export function requestAppUpdate() {
  for (const el of mounted) el.revalidate();
}

export class MpElement extends LitElement {
  /** 不用 Shadow DOM：见文件头说明 */
  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this._deps = undefined;
    this._unsubscribers = [];
  }

  connectedCallback() {
    super.connectedCallback();
    mounted.add(this);
    this._unsubscribers.push(subscribe(() => this.revalidate()));
    this.onConnected?.();
  }

  disconnectedCallback() {
    mounted.delete(this);
    for (const off of this._unsubscribers) off();
    this._unsubscribers = [];
    this.onDisconnected?.();
    super.disconnectedCallback();
  }

  /** 子类覆写：返回依赖的原始值数组；返回 null 表示「每次通知都更新」 */
  deps() {
    const fn = this.constructor.deps;
    return typeof fn === "function" ? fn(state) : null;
  }

  /** store / 外部状态变化时调用 */
  revalidate() {
    const next = this.deps();
    if (next === null) {
      this.requestUpdate();
      return;
    }
    if (!sameDeps(next, this._deps)) {
      this._deps = next;
      this.requestUpdate();
    }
  }

  /** 忽略 deps，强制更新一次（内容依赖非状态数据的场景） */
  forceUpdate() {
    this._deps = undefined;
    this.requestUpdate();
  }

  /** 在 light DOM 里按选择器查询自己的渲染产物 */
  $(sel) {
    return this.querySelector(sel);
  }

  $$(sel) {
    return Array.from(this.querySelectorAll(sel));
  }
}

/**
 * 注册自定义元素（幂等）。
 * @param {string} name
 * @param {CustomElementConstructor} ctor
 */
export function define(name, ctor) {
  if (!customElements.get(name)) customElements.define(name, ctor);
}
