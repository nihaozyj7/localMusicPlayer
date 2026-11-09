/* ==========================================================================
   shell.js — 导航与设置层命令（渲染已交给 Lit 组件）
   --------------------------------------------------------------------------
   迁移前这个文件同时管「渲染」（renderSidebar/renderHeader/renderContent）
   和「命令」（navigate / openSettings / doRescan）。迁移后渲染归组件，
   这里只留**命令**：所有调用方（快捷键、工具条、自检脚本）拿到的 API 不变。

   设置层现在是状态驱动的：state.settingsOpen 是唯一真源，
   <mp-settings-layer>（ui/settings-view.js）照着它渲染。
   因此不再有「先解除 hidden 再翻 data-state」这类手工时序 ——
   进出场动画由组件内部按同一个 data-state 机制处理。
   ========================================================================== */

import { commit, rescan, state } from "./store.js";
import { requestAppUpdate } from "./ui/overlays.js";
import { toast } from "./ui/overlays.js";
import { fmtCount } from "./utils.js";

/** 清空本地筛选（空态里的「清空筛选」按钮用） */
export function clearLocalFilter() {
  state.query = "";
  commit();
}

/* --------------------------------------------------------------------------
   列表切换动画（View Transitions API）
   --------------------------------------------------------------------------
   只在 navigate() 这一处用：切视图 / 切歌单是**整页换内容**，值得一段过渡；
   筛选、排序、勾选这些 commit 都不该带动画（会让输入手感变粘）。

   三种情况直接同步落地（行为与旧代码完全一致，只是没有过渡动画）：
     · 运行环境没有 startViewTransition（老 WebView2、部分浏览器预览）；
     · 用户开了「减少动态效果」（系统 setreduce motion）；
     · 上一次切换还没播完 —— 此时再开一个新过渡会把它打断，被跳过的那次
       更新回调有可能不执行，点击就会「点一下没反应」。所以这一下直接落地。
   -------------------------------------------------------------------------- */
let listTransition = null;

function withListTransition(mutate) {
  const doc = typeof document === "undefined" ? null : document;
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (!doc?.startViewTransition || reduced || listTransition) {
    mutate();
    return;
  }
  const transition = doc.startViewTransition(async () => {
    mutate();
    // Lit 的更新在微任务里落地，等一个宏任务（setTimeout 0）就够。
    // ★ 这里**不能**用 requestAnimationFrame 等帧：更新回调期间浏览器为了
    // 不让人看到中间态会暂停渲染，rAF 拿不到回调 → 回调 promise 永不 resolve，
    // 过渡卡在「待开始」，transition.ready 也不会 resolve。实测（Edge headless）
    // 就是这么挂住的：动画一次都不播，而且后续切换全被 listTransition 拦掉。
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  listTransition = transition;
  const done = () => {
    listTransition = null;
  };
  transition.finished.then(done, done);
}

/**
 * 导航到某个视图。
 *
 * 设置是弹出层而不是视图：任何导航都先把设置收起来（与原实现一致）。
 */
export function navigate(view, playlistId = null) {
  if (state.settingsOpen) closeSettings();
  if (view === "settings") {
    openSettings();
    return;
  }
  withListTransition(() => {
    state.view = view;
    state.playlistId = view === "playlist" ? playlistId : null;
    state.playerOpen = false;
    // 切视图时清掉本地筛选与歌单多选：否则会出现「切到歌单还被上一页的关键词
    // 过滤着」「多选模式下换了另一个歌单」这类错位状态。
    state.query = "";
    state.playlistSelecting = false;
    state.selectedIds = new Set();
    state.queueOpen = false;
    commit();
  });
}

/* --------------------------------------------------------------------------
   设置层：状态驱动的开合
   -------------------------------------------------------------------------- */
export function openSettings(section = null) {
  state.settingsOpen = true;
  if (section) state.settingsSection = section;
  commit();
}

export function closeSettings() {
  state.settingsOpen = false;
  commit();
}

export function toggleSettings(section = null) {
  if (state.settingsOpen) closeSettings();
  else openSettings(section);
}

export function settingsLayerOpen() {
  return state.settingsOpen === true;
}

/**
 * 重绘设置层内容，并保持「用户正在看的位置」。
 *
 * 迁移前这里要手工存 scrollTop、记住当前分区、记住焦点元素再补回去 ——
 * 因为整个设置界面是 innerHTML 重建的。现在组件只做增量更新，
 * DOM 节点（含滚动容器与输入框）原地复用，滚动与焦点天然还在。
 */
export function refreshSettingsLayer() {
  if (!state.settingsOpen) return;
  state.settingsRev = (state.settingsRev || 0) + 1;
  commit();
  requestAppUpdate();
}

/* --------------------------------------------------------------------------
   扫描
   -------------------------------------------------------------------------- */
export async function doRescan({ manual = false } = {}) {
  if (state.scanning) return;
  // scanning 的置位由 store.rescan 负责（它在返回前会复位）。
  // 这里**不能**先设成 true：rescan 开头有「已有扫描在跑就直接返回」的并发守卫，
  // 先置位会让守卫命中、扫描根本不会启动 —— 这就是「手动扫描没反应」的原因。
  state.scanText = "正在扫描音乐文件夹…";
  commit();
  try {
    const result = await rescan({ silent: !manual });
    if (result) {
      toast(
        `扫描完成：保留 ${fmtCount(result.kept)} 首${result.excluded ? `，过滤 ${fmtCount(result.excluded)} 个` : ""}${
          result.added ? `，新增 ${fmtCount(result.added)}` : ""
        }${result.removed ? `，移除 ${fmtCount(result.removed)}` : ""}`,
        { tone: "success", duration: 3600 }
      );
    }
  } finally {
    state.scanning = false;
    commit();
  }
}
