/* ==========================================================================
   media-keys.js — 键盘媒体键（⏯ 播放/暂停）的前端侧
   --------------------------------------------------------------------------
   Go 侧用系统级全局热键接管了键盘上的播放/暂停键（见 services_mediakey.go），
   按一下就往这里发一个 `media:key` 事件。

   --------------------------------------------------------------------------
   为什么后端不直接按，非要绕一圈让前端来按

   播放的「意图」存在前端的 store 里（state.playing），后端引擎是从动的。
   后端推回来的位置锚点又会被 audio.js#applyAnchor 当成唯一真源去覆盖
   state.playing —— 所以如果后端自己按了引擎，前端下一次收到锚点就会
   把状态改回来，体感就是「按一下弹回去」。

   因此后端只负责「转达用户按了这个键」，真正改状态统一走 frontend 的
   togglePlay：它本来就处理好了「没歌时先起播」「有歌时切换」「推回后端」
   这些分支，媒体键没有任何理由再实现一套。

   --------------------------------------------------------------------------
   为什么这条链路在后台也能用

   热键是 Go 侧 RegisterHotKey 注册的，与 WebView2 是否前台无关。
   而 WebView2 在窗口最小化/失焦时**不会销毁页面**，事件依然能送达并执行。
   （真正会被挂起的是页面渲染，而 togglePlay 只改状态、不做布局。）
   ========================================================================== */

import { on } from "./bridge.js";
import { togglePlay } from "./store.js";

/** 取消订阅函数（热重载/退出时清掉） */
let unsubscribe = null;

/**
 * 开始响应媒体键。启动时调用一次。
 *
 * 幂等：重复调用只会重挂一次订阅，不会叠加（否则按一下会跳两下）。
 */
export function startMediaKeys() {
  stopMediaKeys();
  unsubscribe = on("media:key", (payload) => {
    // action 由后端下发，目前只有 "toggle"。
    // 用 switch 而不是 if，是为了以后加 next/prev 时不用再改结构。
    switch (payload?.action) {
      case "toggle":
        togglePlay();
        break;
      default:
        // 后端加了新动作而这个版本的前端还不认识：忽略而不是抛错，
        // 避免键位演进时旧前端直接报错。
        break;
    }
  });
}

/** 停止响应媒体键 */
export function stopMediaKeys() {
  if (unsubscribe) {
    try {
      unsubscribe();
    } catch {
      /* 忽略 */
    }
    unsubscribe = null;
  }
}
