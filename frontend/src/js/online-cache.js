/* ==========================================================================
   online-cache.js — 把播放队列里的在线歌曲报给后端
   --------------------------------------------------------------------------
   为什么需要这个模块（需求原话）：「在线歌曲的缓存定期清理，对于没有被
   播放列表和歌单引用的歌曲，在空闲时间可能会触发清理」。

   「歌单」在后端配置里（`bootstrap.Config.Playlists` / `LikedIDs`），后端自己
   读得到；**「播放列表」（= 播放队列）只在前端** —— 它是 `state.queue`，
   随快照写进 localStorage。后端看不见它，也就不可能知道「这首还在队列里」。

   所以清理的引用集合必须由前端补上这一份：队列变化时把其中的在线歌曲 id
   推给 `backend.onlineProtectIDs`（Go 侧 `OnlineService.ProtectIDs`），
   空闲清理再把它们排除在删除之外。

   与「当前正在播放的那首」的区别：那首由后端自己保护（`PlayerService.State`
   的 songId 直接进保护集合），不依赖这条推送 —— 推送晚一拍也不会误删。
   ========================================================================== */

import { backend, isWails } from "./bridge.js";
import { state, subscribe } from "./store.js";

/**
 * 从播放队列里挑出需要保护的在线歌曲 id。
 *
 * 纯函数，单测直接盯它。规则：
 *   · 只认 `bili:` 前缀且**后面确有 id** 的条目 —— 本地曲目的缓存不由试听缓存管，
 *     推过去只会让后端白建一堆用不上的引用；而 `bili:`（前缀后为空）是无效 id，
 *     后端的 `onlineBVID` 也会拒掉它（两端判据必须一致，见 loudness_service_test.go）。
 *   · 去重（队列里同一首可能出现多次）；
 *   · 顺序稳定（后端的集合语义不看顺序，但稳定的字符串便于这里做「没变就不推」）。
 */
export function queueOnlineIDs(queue) {
  if (!Array.isArray(queue)) return [];
  const seen = new Set();
  const out = [];
  for (const item of queue) {
    const id = typeof item === "string" ? item : item?.id;
    if (typeof id !== "string" || !id.startsWith("bili:") || id.length <= "bili:".length) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * 订阅队列变化并推送。
 *
 * ★ 为什么用 subscribe + 「没变就不推」：subscribe 的回调会跟着**每一次**
 * notify 跑（播放进度每 200ms 就广播一次）。不比对就推的话，后端每秒会收到
 * 好几次同样的列表 —— 白占桥调用，而且都在主线程上。
 */
export function initOnlineCacheSync() {
  if (!isWails()) return; // 浏览器降级预览没有后端，也没什么可保护的

  let lastKey = null;

  const push = () => {
    const ids = queueOnlineIDs(state.queue);
    const key = ids.join("\n");
    if (key === lastKey) return;
    lastKey = key;
    // 失败只降级、不打断：这只影响「空闲清理能不能认出队列里的歌」，
    // 认不出最多是那首歌的缓存被删掉、下次试听重新下载一遍。
    backend.onlineProtectIDs(ids).catch((err) => {
      console.warn("[online-cache] 上报播放队列引用失败（只影响空闲清理的保守程度）", err);
    });
  };

  subscribe(push);
  push(); // 启动时先推一次：队列可能来自上次的 localStorage 快照
}
