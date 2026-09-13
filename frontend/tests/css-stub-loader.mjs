/* ==========================================================================
   css-stub-loader.mjs — 让 Node 的测试运行器能 import 皮肤包
   --------------------------------------------------------------------------
   皮肤包里 `import "./skins/classic.css"` 是 Vite 的能力（打包器负责把 CSS
   抽成样式表）。Node 原生 ESM 遇到 .css 会直接抛 ERR_UNKNOWN_FILE_EXTENSION，
   于是「皮肤包能不能在真实运行时里被注册」这件事就没法用 node --test 覆盖。

   这里注册一个极小的 load 钩子：把 .css 换成空模块。
   生产构建完全不经过它（Vite 有自己的 CSS 处理），测试里也不需要真的样式 ——
   样式是否生效由无头浏览器自检（tools/check-player-host.mjs）负责。
   ========================================================================== */

export async function load(url, context, next) {
  if (url.endsWith(".css")) {
    return { format: "module", shortCircuit: true, source: "export default {};" };
  }
  return next(url, context);
}
