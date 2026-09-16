/* ==========================================================================
   backdrop.js — 窗口原生材质（Windows 11 的 Mica / Acrylic / Tabbed）
   --------------------------------------------------------------------------
   背景材质由系统 DWM 画在窗口背后。Go 侧只能在**创建窗口时**通过结构体选项
   指定（WebviewWindowOptions.BackgroundType + Windows.BackdropType），
   运行期没有接口可改，所以这里的职责是：

     1. 问后端「窗口现在真正生效的材质是什么」，据此给 <html> 写 data-backdrop
        —— 页面只在窗口真的带材质时才让出底色（见 base.css）；
     2. 让设置界面能说清「改了但要重启才生效」。

   为什么不让页面直接按配置里的值变透明：那样一旦配置和窗口对不上（刚改完
   还没重启），页面就会变成透到窗口底色（近黑）的一块，观感反而更差。
   ========================================================================== */

import { backend, isWails } from "./bridge.js";
import { state } from "./store.js";

/** 与 Go 侧 bootstrap.BackdropModes 保持一致 */
export const BACKDROP_MODES = ["off", "auto", "mica", "acrylic", "tabbed"];

const BACKDROP_LABELS = {
  off: "关闭（不透明窗口）",
  auto: "自动（系统决定）",
  mica: "云母（Mica）",
  acrylic: "亚克力（Acrylic）",
  tabbed: "标签页（Tabbed）",
};

export function backdropLabel(mode) {
  return BACKDROP_LABELS[mode] || BACKDROP_LABELS.off;
}

/** 把材质状态写到 <html data-backdrop>；off 时移除属性 */
function paintBackdrop(mode) {
  const html = document.documentElement;
  if (!mode || mode === "off") delete html.dataset.backdrop;
  else html.dataset.backdrop = mode;
}

/**
 * 读取窗口真实的材质状态。浏览器预览（没有 Wails 窗口）下返回一份
 * 「不支持」的占位数据，界面据此给出解释而不是报错。
 */
export async function refreshBackdropState() {
  let info = null;
  if (isWails()) {
    try {
      info = await backend.backdrop();
    } catch (err) {
      console.warn("[backdrop] 读取窗口材质状态失败", err);
    }
  }

  if (!info) {
    info = {
      configured: state.config.nativeBackdrop || "off",
      active: "off",
      supported: false,
      os: "",
      restartRequired: false,
      preview: !isWails(),
    };
  } else {
    info.preview = false;
  }

  state.backdropState = info;
  paintBackdrop(info.active);
  return info;
}
