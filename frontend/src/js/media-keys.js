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

import { backend, on } from "./bridge.js";
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

  // ★ 订阅挂上之后**必须**向后端报到一次（第六轮审查 N-12）。
  //
  // 后端的全局热键在 ApplicationStarted 就注册好了，而这里要等界面装配到本行
  // 才挂得上监听 —— 中间那一段（冷启动约一秒）按下的 ⏯ 以前会被后端当成
  // 「前端在线」发成事件，但没人听，于是白按一下。报到之后后端才把按键交给
  // 前端 togglePlay；在此之前它退化到直接操作引擎（那段窗口里按键照样生效）。
  //
  // 必须 .catch：后端没起来（浏览器预览、旧版 Go 进程）时不能变成没人接的
  // promise —— 仓库门禁 no-fire-and-forget.test.js 盯的就是这类写法。
  // call() 在后端未连接时返回 null，因此链式 catch 前先包一层 Promise 判断。
  Promise.resolve(backend.mediaKeysReady()).catch((err) => {
    console.warn("[media-keys] 向后端报到失败（媒体键在此之前按引擎兜底处理）", err);
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
