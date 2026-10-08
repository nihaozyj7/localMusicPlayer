/* ==========================================================================
   skinhost.js — 样式插件宿主运行时（契约 v3）
   --------------------------------------------------------------------------
   两个舞台共用这一份实现：
     · 主窗口详情页      （interactive: true，壳层消费 --chrome-*）
     · 桌面背景歌词窗口  （interactive: false，动作是空实现）

   以前这两处各写了一份 ctx / 监听表 / push（第二份还残留着 v2 已删除的
   ctx.audio），契约一改就要改两遍 —— 而且已经漏了一处。收在这里之后，
   "插件看到的世界"只有一份定义。

   职责边界（刻意很窄）：
     · 造 ctx（数据从 source 拿、零件从 SDK 拿、动作从 source.actions 拿）；
     · 挂载 / 卸载 / 推送 / 退订，并把插件抛出的异常隔离在宿主之外；
     · 应用配色契约（清单 colors → --chrome-*），并在不合适的时候清掉。
   它**不管**数据从哪来、也不管宿主壳长什么样 —— 那是调用方的事。
   ========================================================================== */

import { createSdk, deriveChrome, applyChromeVars, clearChromeVars } from "@localmusicplayer/player-skins";

/** 插件连续抛错到这个数，就在控制台喊一声（避免"每次都静默吞掉"） */
const ERROR_STREAK_LIMIT = 5;

/**
 * @typedef {Object} SkinHostOptions
 * @property {HTMLElement} root 插件挂载点（ctx.root）
 * @property {HTMLElement|null} backgroundRoot 整窗背景层容器（可为 null）
 * @property {HTMLElement|null} view 打 data-skin / data-theme / data-skin-background 的元素
 * @property {HTMLElement|null} app 宿主壳根元素（--chrome-* 写在这里）
 * @property {Object} source 数据与动作的来源（两个窗口各自提供）
 * @property {() => object} source.playback
 * @property {() => object} source.media
 * @property {() => object} source.options
 * @property {() => object} source.env
 * @property {object} source.actions
 * @property {string} source.defaultCover
 * @property {(active:boolean, skin:object|null) => void} [onChromeApplied] 壳层配色变化后的回调（诊断/测试用）
 */

/**
 * 造一个宿主运行时。
 * @param {SkinHostOptions} opts
 */
export function createSkinHost(opts) {
  const root = opts.root;
  const view = opts.view || null;
  const app = opts.app || null;
  const source = opts.source;
  const sdk = createSdk();

  /** @type {Map<string, Set<(patch:any)=>void>>} */
  const listeners = new Map();
  /** @type {import("@localmusicplayer/player-skins").PlayerSkin|null} */
  let skin = null;
  let mountedId = null;
  let ctx = null;
  let errorStreak = 0;
  let chromeActive = false;

  function makeCtx() {
    return {
      root,
      backgroundRoot: opts.backgroundRoot,
      // ★ 契约 v3：不给 ctx.push（那是宿主内部的东西，挂在插件对象上等于
      //   让插件能伪造补丁）。宿主自己通过 host.push() 推送。
      sdk,
      defaultCover: source.defaultCover,
      get themeId() {
        return document.documentElement.dataset.theme || "";
      },
      get mode() {
        return document.documentElement.dataset.mode === "light" ? "light" : "dark";
      },
      get interactive() {
        return source.options().interactive !== false;
      },
      playback: () => source.playback(),
      media: () => source.media(),
      track: () => source.media().song,
      lyrics: () => source.media().lyrics,
      covers: () => {
        const m = source.media();
        return { list: m.covers, index: m.coverIndex, current: m.cover };
      },
      options: () => source.options(),
      env: () => source.env(),
      actions: source.actions,
      on(type, fn) {
        if (typeof fn !== "function") return () => {};
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
        return () => listeners.get(type)?.delete(fn);
      },
    };
  }

  /** 一次更新同时交给 skin.update 与 ctx.on 订阅者（异常互不连坐） */
  function push(patch) {
    if (!skin || !ctx) return;
    try {
      skin.update?.(ctx, patch);
      errorStreak = 0;
    } catch (err) {
      errorStreak += 1;
      console.warn(`[skins] ${mountedId} 处理 ${patch.type} 更新失败`, err);
      if (errorStreak === ERROR_STREAK_LIMIT) {
        console.error(
          `[skins] ${mountedId} 连续 ${ERROR_STREAK_LIMIT} 次更新抛错；宿主会继续推，但这套样式很可能已经显示异常`
        );
      }
    }
    for (const [type, set] of listeners) {
      if (type !== patch.type && type !== "*") continue;
      for (const fn of set) {
        try {
          fn(patch);
        } catch (err) {
          console.warn(`[skins] ${type} 订阅回调失败`, err);
        }
      }
    }
  }

  /**
   * 应用配色契约：把清单里的 colors 变成宿主壳层变量。
   *
   * 变量写在 `<html>` 上（不是 #app）：播放队列 / 选项 / 定时 / 歌词工作台
   * 这些浮层是 `#app` 之外的 fixed 元素，写在 #app 上它们继承不到。
   *
   * 只有"详情页在前台 + 已挂载插件"时才有意义 —— 关掉之后必须干净地清掉，
   * 否则下一次打开别的界面会带着上一个插件的颜色。
   */
  function applyChrome(active) {
    chromeActive = Boolean(active) && Boolean(app);
    const rootEl = document.documentElement;
    if (!chromeActive || !skin) {
      clearChromeVars(rootEl);
      opts.onChromeApplied?.(false, null);
      return false;
    }
    const derived = skin.chrome || deriveChrome(skin.colors);
    if (derived.theme || !Object.keys(derived.vars || {}).length) {
      // 声明了 theme（或什么都没声明）：宿主壳直接用主题配色 —— 这正是
      // "缺失时降级使用主题配色"那条定案，不许留下半套变量。
      clearChromeVars(rootEl);
      opts.onChromeApplied?.(false, skin);
      return false;
    }
    applyChromeVars(rootEl, derived);
    opts.onChromeApplied?.(true, skin);
    return true;
  }

  /**
   * 挂载一个插件。
   *
   * @param {import("@localmusicplayer/player-skins").PlayerSkin} next
   * @param {{mountPatch?:object}} [init]
   */
  function mount(next, init = {}) {
    unmount();
    skin = next;
    mountedId = next.id;
    errorStreak = 0;

    if (view) {
      // data-skin 是插件 CSS 的作用域钩子（宿主注入的 @scope 也用它）
      view.dataset.skin = next.id;
      // data-theme 是"详情页色彩域"开关（宿主自己读它决定要不要用 --chrome-*）
      view.dataset.theme = next.id;
      // 整窗背景型样式：宿主壳要退成半透明（v2 里这是靠样式 id 写死的，
      // v3 改由 capabilities.background 驱动 —— 任何插件声明了都生效）
      view.dataset.skinBackground = next.background ? "yes" : "no";
    }
    if (app) app.dataset.skinBackground = next.background ? "yes" : "no";
    if (opts.backgroundRoot) opts.backgroundRoot.dataset.skin = next.id;

    ctx = makeCtx();
    try {
      next.mount(ctx);
    } catch (err) {
      console.error(`[skins] ${next.id} 挂载失败`, err);
      root.innerHTML = `<div class="skin-error">样式「${esc(next.name)}」加载失败：${esc(
        err?.message ?? err
      )}</div>`;
      return false;
    }
    // 挂载后立刻推一次全量快照：插件不需要自己再拉一遍
    push({ type: "mount", ...source.media(), ...source.playback(), options: source.options() });
    void init;
    return true;
  }

  /** 卸载当前插件（先推 close/destroy，再 destroy，最后清 DOM 与记账） */
  function unmount() {
    if (!skin) return;
    push({ type: "close" });
    push({ type: "destroy" });
    try {
      skin.destroy?.(ctx);
    } catch (err) {
      console.warn(`[skins] ${mountedId} 卸载失败`, err);
    }
    root.innerHTML = "";
    for (const set of listeners.values()) set.clear();
    skin = null;
    ctx = null;
    mountedId = null;
    errorStreak = 0;
    clearChromeVars(app);
  }

  return {
    sdk,
    push,
    mount,
    unmount,
    applyChrome,
    get skin() {
      return skin;
    },
    get mountedId() {
      return mountedId;
    },
    get ctx() {
      return ctx;
    },
    get chromeActive() {
      return chromeActive;
    },
  };
}

/** 与 playerhost 里同一份转义（避免把插件名/错误信息当 HTML 插进去） */
function esc(v) {
  return String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}
