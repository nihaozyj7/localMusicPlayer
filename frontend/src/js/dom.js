/* ==========================================================================
   dom.js — 兼容层（历史入口）
   --------------------------------------------------------------------------
   渲染与浮层实现已经搬到 ui/overlays.js（Lit）。这个文件保留下来只是因为
   少量**纯逻辑**模块（audio.js 的报错提示、playerhost.js 的查询）历史上
   从这里取工具：让它们继续按原路径 import，迁移的改动面就小一圈。

   ★ 新代码不要再从这里 import：直接在 Lit 组件里用 ui/base.js 的
     html / icon / repeat 等，或从 ui/overlays.js 取 openMenu / openModal / toast。
   ========================================================================== */

export {
  $,
  $$,
  icon,
  on,
  setBusy,
  toast,
  openMenu,
  closeMenu,
  openModal,
  initTooltips,
  bindCoverFallback,
  requestAppUpdate,
} from "./ui/overlays.js";
