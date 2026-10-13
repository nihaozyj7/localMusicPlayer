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
import { requestAppUpdate } from "./ui/base.js";
import { toast } from "./ui/overlays.js";

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

/* --------------------------------------------------------------------------
   试听缓存的统计与「清理未引用缓存」按钮
   --------------------------------------------------------------------------
   需求（用户原话）：「在线歌曲的缓存定期清理，改为在设置中添加一个缓存清理的
   按钮，这个按钮点击后会清理掉播放器中没有引用的缓存歌曲，比如还在播放列表
   的歌曲」。

   谁是「有引用」由**后端**判定（歌单与「我喜欢」在配置里、播放队列由本模块
   推过去、正在播放的那首由播放器自报），前端一个字都不重复实现 ——
   前端只负责「按下按钮 → 把回执说出来」。
   -------------------------------------------------------------------------- */

/** 最近一次读到的缓存占用（后端 CacheStats 的快照） */
let stats = null;
/** 数据版本号：设置层把它放进依赖数组（非 store 数据的响应式入口） */
let statsRev = 0;

export function onlineCacheSnapshot() {
  return { stats, rev: statsRev };
}

/**
 * 读一次试听缓存占用（打开设置层时调用；失败静默）。
 *
 * 失败不该弹错误：设置页少一行「已缓存 N 个」不影响任何功能，
 * 而弹一个「读取缓存失败」只会让用户以为播放器坏了。
 */
export async function refreshOnlineCacheStats() {
  if (!isWails()) return null;
  try {
    const s = await backend.onlineCacheStats();
    stats = s && typeof s === "object" ? s : null;
    statsRev += 1;
    requestAppUpdate();
    return stats;
  } catch (err) {
    console.warn("[online-cache] 读取试听缓存占用失败", err);
    return null;
  }
}

/** 缓存的占用文案（供设置界面显示；纯函数） */
export function onlineCacheSummaryText(snapshot) {
  const s = snapshot?.stats;
  if (!s) return "正在读取…";
  const mb = ((Number(s.bytes) || 0) / 1024 / 1024).toFixed(1);
  return `已缓存 ${Number(s.count) || 0} 个试听文件，共 ${mb} MB`;
}

/** 把一次清理的回执说成一句人话（纯函数，单测盯它） */
export function cleanupResultText(res) {
  if (!res) return "清理失败";
  if (res.skipped) return `未清理：${res.skipped}`;
  const deleted = Number(res.deleted) || 0;
  const mb = ((Number(res.bytes) || 0) / 1024 / 1024).toFixed(1);
  const kept = Number(res.kept) || 0;
  const keptText = kept > 0 ? `，保留 ${kept} 个还在播放列表 / 歌单 / 喜欢里的` : "";
  if (deleted === 0) return `没有可清理的试听缓存${kept > 0 ? `（${kept} 个都还在引用中）` : ""}`;
  return `已清理 ${deleted} 个未引用的试听缓存（${mb} MB）${keptText}`;
}

/**
 * 「清理未引用缓存」按钮的动作。
 *
 * 不弹确认框：这个动作**只删没被引用的派生数据**（试听缓存本来就在临时目录，
 * 后端还做了引用保护），加一道确认只会让常用的清理变得啰嗦。
 */
export async function cleanupUnreferencedCache() {
  if (!isWails()) {
    toast("浏览器预览无法清理缓存", { tone: "warning" });
    return null;
  }
  const busy = toast("正在清理未引用的试听缓存…", { duration: 0 });
  try {
    const res = await backend.onlineCleanupCache();
    await refreshOnlineCacheStats();
    toast(cleanupResultText(res), { duration: 4200 });
    return res;
  } catch (err) {
    toast(`清理失败：${err?.message ?? err}`, { tone: "error", duration: 6000 });
    return null;
  } finally {
    busy?.close?.();
  }
}
