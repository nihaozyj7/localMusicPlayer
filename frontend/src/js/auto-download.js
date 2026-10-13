/* ==========================================================================
   auto-download.js — 收藏 / 加入歌单时，给「只有试听缓存」的在线歌曲补一份本地文件
   --------------------------------------------------------------------------
   需求（用户原话）：「用户如果点击播放列表中的，没有下载的缓存歌曲为"我喜欢"或者
   加入歌单的操作时，自动将歌曲下载到本地」。

   为什么这件事必须做：在线歌曲的试听缓存是**可丢弃的派生数据**（在
   `%TEMP%\LocalMusicPlayer\online\`，会被空闲清理、临时目录清理、换机弄没），
   而「我喜欢」/ 歌单是用户明确的长期意图。收藏一首只有缓存的歌，等于收藏了
   一个随时会失效的引用 —— 过几天点开就是「找不到文件」。收藏这一下，
   正好是把那份意图落成真实文件的时机。

   # 判据（为什么不是「收藏就下载」）
   三个条件同时成立才下载，缺一不可：
     ① 开关开着（`config.autoDownloadOnCollect`，默认开）；
     ② 这首歌是**在线曲目**（`bili:` 前缀 / bvid）—— 本地歌本来就有文件；
     ③ 它在试听缓存里**确实存在**（台账 `cache[bvid].exists`），且**还没有下载**过
        （台账 `downloads[bvid].exists` 为假）。
   ③ 的两半都很重要：只有缓存过的东西才符合需求里「没有下载的**缓存**歌曲」；
   而 `exists` 由后端当场 stat，用户把下载目录里那份删了之后这里会重新下一次
   （与搜索结果页的「已下载」标注同一套判据，见 ui/search.js#isDownloadedSource）。

   # 为什么查台账是异步的也照做
   点爱心是立刻要看到反馈的动作（`state.likedIds` 当场就变了），下载只是后续补
   一份文件。所以这里 fire-and-forget：查台账 → 需要就 `downloadStart`，
   失败只记日志、不打扰用户（收藏本身已经成功了）。
   ========================================================================== */

import { backend, isWails } from "./bridge.js";
import { state } from "./store.js";
import { setCollectHook } from "./store.js";
import { toast } from "./ui/overlays.js";

/** 已经发起过的 bvid（本次运行内）：同一首被反复收藏 / 加多个歌单时只下一次 */
const started = new Set();

/**
 * 从一首歌里取出 bvid（纯函数）。
 *
 * 在线曲目的 id 形如 `bili:BV1xx411c7mD`，搜索结果里另外带 `bvid` 字段；
 * 两者取其一。取不到（本地曲目、id 无效）返回空串。
 */
export function bvidOf(song) {
  const direct = typeof song?.bvid === "string" ? song.bvid.trim() : "";
  if (direct) return direct;
  const id = typeof song?.id === "string" ? song.id : "";
  if (!id.startsWith("bili:")) return "";
  const rest = id.slice("bili:".length).trim();
  return rest;
}

/**
 * 要不要为这首歌补一份本地文件（纯函数，单测直接盯它）。
 *
 * `cached` / `downloaded` 都来自后端台账（各自的 `exists === true`）。
 * 返回一个原因串便于测试与日志：
 *   "ok"           → 该下载
 *   "disabled"     → 开关关着
 *   "local"        → 本地曲目
 *   "not-cached"   → 没试听过（没有缓存），不属于「没有下载的缓存歌曲」
 *   "downloaded"   → 本地已经有了（用户可能正在听的就是它）
 */
export function collectDownloadReason(song, cached, downloaded, enabled = true) {
  if (!enabled) return "disabled";
  if (!bvidOf(song)) return "local";
  if (downloaded === true) return "downloaded";
  if (cached !== true) return "not-cached";
  return "ok";
}

/** 读一份来源索引快照；失败时返回空对象（等于「什么都不知道」）。 */
async function sourceIndex() {
  try {
    const idx = await backend.onlineSourceIndex();
    return { downloads: idx?.downloads || {}, cache: idx?.cache || {} };
  } catch (err) {
    console.warn("[auto-download] 读取在线来源索引失败", err);
    return { downloads: {}, cache: {} };
  }
}

/**
 * 收藏 / 加歌单之后的补下载。
 *
 * 幂等：同一个 bvid 在一次运行里只会真正发起一次（`started`）。
 * 注意失败不改任何状态 —— 收藏已经成功了，下载只是尽力而为。
 */
export async function autoDownloadOnCollect(song, reason = "collect") {
  if (!isWails()) return false; // 浏览器预览没有后端，也没有下载
  const bvid = bvidOf(song);
  if (!bvid) return false;
  if (started.has(bvid)) return false;

  const enabled = state.config?.autoDownloadOnCollect !== false;
  const idx = await sourceIndex();
  const verdict = collectDownloadReason(
    song,
    idx.cache?.[bvid]?.exists === true,
    idx.downloads?.[bvid]?.exists === true,
    enabled
  );
  if (verdict !== "ok") return false;

  // 先占位再发请求：连点两下爱心 / 同时加进两个歌单不会重复发起
  started.add(bvid);
  try {
    const res = await backend.downloadStart(bvid, song.title || "", song.duration || 0);
    if (!res?.started) {
      // 已经在下载中：不是错误，也不要重复提示
      if (res?.reason !== "already-running") started.delete(bvid);
      return false;
    }
    const what = reason === "like" ? "收藏" : "加入歌单";
    toast(`已${what}，同时在后台下载一份到本地`, { duration: 3200 });
    return true;
  } catch (err) {
    started.delete(bvid);
    console.warn("[auto-download] 自动下载失败（收藏本身已生效）", err);
    return false;
  }
}

/**
 * 装上收藏钩子（main.js 调用一次）。
 *
 * 用钩子而不是让 store.js 直接 import 这个模块：store 是底层状态模块，
 * 它不该知道网络与下载的存在（同 setUserPlayProbe 的理由）。
 */
export function installCollectAutoDownload() {
  setCollectHook((song, reason) => {
    // 不 await：钩子是同步调用的（store 正在处理点击），补下载在后台跑
    autoDownloadOnCollect(song, reason).catch(() => {});
  });
}
