// @ts-check
/* ==========================================================================
   spectrum.js — 频谱的「采样 → 缓存 → 按读取刷新」机制（拉取式）
   --------------------------------------------------------------------------
   契约 v3 的频谱是**插件主动拉**（ctx.spectrum()），不是宿主 30Hz 硬推。
   这个模块只做三件事：

     1. 固定分辨率：**128 段对数分桶全谱**（0..1），一次采样给全谱，
        插件要 16 段还是 64 段自己切 —— 分辨率不再由调用方逐次决定，
        缓存也不会因为"换段数"作废（v2 的 spectrumBands !== n 就是这么来的）。
     2. 缓存**最近一次采样**：spectrumSnapshot() 同步返回 `{bands, at}`，
        插件在自己的 rAF 里直接读，不用等、不用对齐补丁帧。
     3. **读门控**：只有真的被读到（且距上次刷新 ≥33ms）才异步向后端要新样本；
        插件不读 = 完全不采样（声明了却从不读的插件，开销为零）。

   注意"缓存"的语义：缓存的是**最新一次采样的结果**（30Hz 刷新），不是
   "采一次用很久" —— 频谱的价值就是新鲜。真正的 FFT 每次都对最新音频窗跑
   （Go 侧 internal/audioplay/spectrum.go），这里缓存的是它的一份快照。

   为什么这个模块只依赖 bridge：桌面背景歌词窗口也用它（那边没有 store 图，
   不能 import audio.js）。主窗口若走 Web Audio 回退路径，由 audio.js 包一层。
   ========================================================================== */

import { backend, isWails } from "./bridge.js";

/** 固定全谱段数（对数分桶，幂次与 Go 侧 BucketExponent 一致）。 */
export const SPECTRUM_BANDS = 128;

/** 采样节流：~30Hz。读得再勤，后端最多每 33ms 被要一次。 */
const REFRESH_MS = 1000 / 30;

/** @type {Float32Array|null} 最近一次采样（只读约定：插件不要改它） */
let cache = null;
/** 最近一次成功采样的时刻（performance.now()），插件据此判断新鲜度 */
let cacheAt = 0;
let lastKick = 0;
let inflight = false;

/** 向后端拉一次新样本并覆盖缓存（fire-and-forget，由 snapshot 节流触发）。 */
async function pull() {
  try {
    const res = await backend.playerSpectrum(SPECTRUM_BANDS);
    const arr = res?.bands;
    if (!arr || !arr.length) {
      // 还没攒够一窗样本 / 引擎没起来：清空，让调用方拿到 null 而不是陈旧谱
      cache = null;
      return;
    }
    if (!cache || cache.length !== arr.length) cache = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i += 1) cache[i] = arr[i];
    cacheAt = performance.now();
  } catch {
    // 预览模式 / 后端不可用：保持 null（插件按"当前没有频谱"处理）
  }
}

/**
 * 拉取式频谱快照。
 *
 * 调用本身就是"门控"：被读到才可能刷新，所以插件按自己的帧率读即可 ——
 * 读得比 30Hz 密只会拿到同一份缓存（`at` 会告诉你它有多新），
 * 不读就一次 IPC 都不发。
 *
 * @returns {{bands: Float32Array, at: number}|null}
 *   null = 还没有可用样本（刚开播的第一帧、后端未就绪、或预览模式）。
 */
export function spectrumSnapshot() {
  if (!isWails()) return cache ? { bands: cache, at: cacheAt } : null;
  const t = performance.now();
  if (t - lastKick >= REFRESH_MS && !inflight) {
    lastKick = t;
    inflight = true;
    pull().finally(() => {
      inflight = false;
    });
  }
  return cache ? { bands: cache, at: cacheAt } : null;
}
