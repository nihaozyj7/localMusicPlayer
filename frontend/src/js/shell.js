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

export const VIEW_TITLES = {
  library: "本地歌曲",
  queue: "播放列表",
  playlist: "歌单",
};

/** 清空本地筛选（空态里的「清空筛选」按钮用） */
export function clearLocalFilter() {
  state.query = "";
  commit();
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
  state.view = view;
  state.playlistId = view === "playlist" ? playlistId : null;
  state.playerOpen = false;
  // 切视图时清掉本地筛选与歌单多选：否则会出现「切到歌单还被上一页的关键词
  // 过滤着」「多选模式下换了另一个歌单」这类错位状态。
  state.query = "";
  state.playlistSelecting = false;
  state.selectedIds = new Set();
  // 换视图时把播放列表面板收起来，避免它孤零零浮在主界面上。
  state.queueOpen = false;
  commit();
}

/* --------------------------------------------------------------------------
   设置层：状态驱动的开合
   -------------------------------------------------------------------------- */
/** 设置层当前高亮的分区（组件用它滚到对应卡片） */
export function currentSettingsSection() {
  return state.settingsSection || "library";
}

export function setSettingsSection(id) {
  state.settingsSection = id;
}

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
