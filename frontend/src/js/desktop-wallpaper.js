/* ==========================================================================
   desktop-wallpaper.js — 主窗口侧的桌面背景歌词
   --------------------------------------------------------------------------
   桌面背景歌词 = 开一个铺满桌面、垫在桌面图标之下的窗口，里面挂载**当前正在
   用的那个播放界面样式**（见 Go 侧 desktop_wallpaper.go 与
   wallpaper.html / desktop-wallpaper-window.js）。

     主窗口（这里）                          桌面背景歌词窗口
       │ 皮肤契约的 patch（换歌 / 封面 / 歌词   │
       │ / 进度 / 设置 / 主题 / 令牌）          │
       ├── WindowService.UpdateDesktopWallpaper ┤
       │        （Go 侧按顶层 key 合并 + 广播）  │
       └──── app.Event.Emit("desktop:wallpaper") ──► 交给同一个皮肤渲染

   本模块只做一件事：**把详情页那套数据按皮肤契约推过去**。快照本身直接来自
   playerhost.js（那是详情页的宿主，数据本来就归它管），这里不重新算一遍 ——
   两处各算一次，迟早会出现「桌面上显示的是上一首」。

   ★ 关于「双份资源」——这是这个模块存在的另一半理由。
   需求最初问的就是「投两个界面会不会费两遍资源」。答案是会（已确认按双份渲染
   来做，视觉优先），但可以把「贵的那部分」全部去掉：

     1. **只在内容真的变了才推**：本模块每帧被调用，但内部逐项比对，
        内容不变时一次 IPC 都不发，那边也就一次 DOM 都不用写。
     2. **重的东西只在变的时候带一次**：封面 data URL、封面集合、上百行歌词、
        整套主题令牌，都挂在「换了才带」的那条增量上；高频的进度增量只有
        四个数字，靠值比对去重（暂停时 position 不动，自然不发）。
     3. **另一边没有任何循环**：那个页面里没有 rAF、没有定时器、没有轮询，
        动画全部由皮肤自己驱动，宿主只在收到增量时写一次 DOM；连频谱也是
        宿主采样 + 推送（见 ⑧），那个窗口一帧都不自己采。
     4. **两个桌面模式互斥**（desktop-mode.js）：任意时刻至多一个额外窗口。
     5. **后端只回 {"ok":true}**：不把合并后的全量当返回值回吐（那样每秒会把
        封面 data URL 重新序列化一遍送回前端）。

   ★ 进度**不能**限流。
   我原来把它压到 1Hz，理由是「进度只用来算该高亮哪一行」—— 那只对内置样式
   成立。magia 这类第三方样式是逐帧拿 position 现算节拍包络（镜头弹跳、放射光
   与魔法阵亮度、粒子爆发）与逐字歌词行内进度的，而它那边没有 <audio>，自己
   没法把位置往前推。1Hz 的位置喂给逐帧动画 = 每秒跳一次的节拍，镜头、光束、
   魔法阵全在抖。现在与主窗口推给自家皮肤的节奏一致：每帧。

   预览模式（浏览器、没有 Go 后端）下开不出第二个窗口，降级成主窗口内那条
   悬浮歌词条，保证预览界面仍然能演示这个功能。
   ========================================================================== */

import { backend, isWails } from "./bridge.js";
import { commit, state } from "./store.js";
import { spectrum } from "./audio.js";
import { paintFloatingLyricBar } from "./desktop-lyrics.js";
import { requestAppUpdate } from "./ui/base.js";
import { getRuntimeTokens } from "./runtime-tokens.js";
import { resolveSkin } from "@musicplayer/player-skins";
import {
  currentLyricWindow,
  currentMediaSnapshot,
  currentOptionsSnapshot,
  currentPlaybackSnapshot,
} from "./playerhost.js";

/** 桌面背景歌词是否开启（配置项，主窗口与背景窗口共用）。 */
export function desktopWallpaperEnabled() {
  return state.config.showDesktopWallpaper === true;
}

/**
 * 通知界面「桌面背景歌词的可用 / 开关状态变了」。
 *
 * 迁移前这里直接改 #btn-desktop-wallpaper / #opt-desktop-wallpaper 的属性，
 * 现在只广播一次，由 Lit 组件按 state.config 与 state.desktopWallpaperSupport 渲染。
 */
export function syncDesktopWallpaperButtons() {
  requestAppUpdate();
}

/**
 * 探一次「当前系统支不支持把窗口垫到桌面图标之下」，不支持就把入口禁掉。
 *
 * 这个能力依赖 Windows 资源管理器的桌面窗口结构，别的平台没有。
 * 与其让用户点了没反应，不如一开始就把按钮置灰并说明原因。
 */
export async function probeDesktopWallpaperSupport() {
  if (!isWails()) return true;
  let supported = true;
  let reason = "";
  try {
    const snapshot = await backend.desktopWallpaperState();
    supported = snapshot?.supported !== false;
    reason = snapshot?.reason || "";
  } catch (err) {
    console.info("[desktop-wallpaper] 能力探测失败", err?.message ?? err);
    return true; // 探测失败不当成「不支持」：宁可让用户试一次
  }
  if (supported) return true;

  // 支持能力写进 state：按钮的 disabled / 提示语由组件渲染
  state.desktopWallpaperSupport = {
    supported: false,
    reason: reason || "当前系统不支持桌面背景歌词",
  };
  requestAppUpdate();
  return false;
}

/**
 * 打开/关闭桌面背景歌词窗口。返回后端的执行结果（预览模式返回 {preview:true}）。
 *
 * 与 applyDesktopLyrics 一样是**单向**的：单选关系由
 * desktop-mode.js#applyDesktopMode 统一协调。
 *
 * @param {boolean} on
 * @param {{force?: boolean}} [opts]
 */
export async function applyDesktopWallpaper(on, { force = false } = {}) {
  const enabled = Boolean(on);
  const changed = desktopWallpaperEnabled() !== enabled;
  state.config.showDesktopWallpaper = enabled;

  syncDesktopWallpaperButtons();

  if (!changed && !force) return { ok: true, enabled, unchanged: true };

  if (!isWails()) {
    if (!enabled) {
      paintFloatingLyricBar({ enabled: false });
      return { ok: true, preview: true, enabled };
    }
    pushDesktopWallpaper();
    return { ok: true, preview: true, enabled };
  }

  try {
    const res = await backend.desktopWallpaper(enabled);
    if (enabled && res?.ok === false) {
      // 后端没开成（找不到壁纸层等）：回滚配置，别让按钮显示「已开启」
      state.config.showDesktopWallpaper = false;
      syncDesktopWallpaperButtons();
      commit();
    } else if (enabled) {
      // 刚开的窗口还是空的，立刻把当前画面推一次（不用等下一次换歌）。
      // 窗口那边加载完成后还会自己拉一次全量，两条路任意一条通了都不会空着。
      resetDesktopWallpaperSync();
      pushDesktopWallpaper();
    }
    return res;
  } catch (err) {
    console.warn("[desktop-wallpaper] 打开/关闭桌面背景歌词失败", err);
    state.config.showDesktopWallpaper = false;
    syncDesktopWallpaperButtons();
    commit();
    return { ok: false, enabled, error: String(err?.message ?? err) };
  }
}

/* --------------------------------------------------------------------------
   推送
   --------------------------------------------------------------------------
   每帧被调用一次，内部逐项比对后可能推 0 条或多条增量。
   多条并存时**分开推**而不是合成一条：皮肤契约的 update(ctx, patch) 一次只认
   一个 type，合成会把「同时换了歌又改了设置」这种情况下的其中一半丢掉。
   分开推的代价只是一次很小的 IPC（字段本来就少）。
   -------------------------------------------------------------------------- */

/** 上次推过的内容。`"\u0000"` 是「还没推过」的哨兵（不能和真实空串混淆）。 */
const last = {
  setup: "",
  songId: "\u0000",
  cover: "\u0000",
  lyricsText: "\u0000",
  options: "",
  playing: null,
  volume: null,
  muted: null,
  duration: -1,
  lyricIndex: -2,
  position: -1,
  progressAt: 0,
  progressPlaying: null,
};

/** 窗口（重）开时清掉去重状态，保证第一帧一定把全量推过去 */
function resetDesktopWallpaperSync() {
  last.setup = "";
  last.songId = "\u0000";
  last.cover = "\u0000";
  last.lyricsText = "\u0000";
  last.options = "";
  last.playing = null;
  last.volume = null;
  last.muted = null;
  last.duration = -1;
  last.lyricIndex = -2;
  last.position = -1;
  last.progressAt = 0;
  last.progressPlaying = null;
}

/** 算出一批增量（可能为空数组）。抽出来是为了让 pushDesktopWallpaper 保持三行。 */
function collectWallpaperPatches() {
  const patches = [];

  // —— ① 样式 / 主题 / 令牌 ——
  //
  // 这三个一起构成「皮肤看到的外观」，任何一项变了都要通知过去，所以合成一条
  // theme 增量（契约里 theme 的语义就是「主题/深浅色变化」）。为什么连 skinId
  // 也带在这条里：换样式同样属于外观变化，接收方看到 skinId 变了就重挂皮肤。
  //
  // 令牌必须一起带：第三方样式的整窗背景层常从主题令牌派生颜色，少推一次的表现
  // 是「桌面上是上一个主题的配色」。
  const setup = setupSnapshot();
  if (setup.signature !== last.setup) {
    last.setup = setup.signature;
    patches.push({
      type: "theme",
      skinId: setup.skinId,
      themeId: setup.theme,
      theme: setup.theme,
      mode: setup.mode,
      density: setup.density,
      tokens: setup.tokens,
    });
  }

  const media = currentMediaSnapshot();
  const playback = currentPlaybackSnapshot();
  const options = currentOptionsSnapshot({ interactive: false });
  const songId = media.song?.id ?? "";

  // —— ② 换歌：一条带全量（曲目 + 封面集合 + 已解析歌词），皮肤据此整体重画 ——
  if (songId !== last.songId) {
    last.songId = songId;
    last.cover = media.cover;
    last.lyricsText = media.lyrics.text;
    last.lyricIndex = media.lyrics.index;
    last.duration = playback.duration;
    last.progressPlaying = playback.playing;
    last.progressAt = now();
    patches.push({
      type: "song",
      song: media.song,
      cover: media.cover,
      covers: media.covers,
      coverIndex: media.coverIndex,
      lyrics: media.lyrics,
    });
  } else {
    // —— ③ 封面换了 / 轮播切图 ——
    if (media.cover !== last.cover) {
      last.cover = media.cover;
      patches.push({
        type: "media",
        cover: media.cover,
        covers: media.covers,
        coverIndex: media.coverIndex,
      });
    }
    // —— ④ 歌词装载完成（在线匹配回来的、或者换歌之后异步补上的）——
    if (media.lyrics.text !== last.lyricsText) {
      last.lyricsText = media.lyrics.text;
      last.lyricIndex = media.lyrics.index;
      patches.push({ type: "lyrics", lyrics: media.lyrics });
    }
  }

  // —— ⑤ 显示设置（含 showLyrics 与歌词字号）——
  const optionsSignature = JSON.stringify(options);
  if (optionsSignature !== last.options) {
    last.options = optionsSignature;
    patches.push({ type: "options", options });
  }

  // —— ⑥ 播放状态 ——
  if (
    playback.playing !== last.playing ||
    playback.volume !== last.volume ||
    playback.muted !== last.muted
  ) {
    last.playing = playback.playing;
    last.volume = playback.volume;
    last.muted = playback.muted;
    patches.push({
      type: "state",
      playing: playback.playing,
      volume: playback.volume,
      muted: playback.muted,
    });
  }

  // —— ⑦ 进度 ——
  //
  // ★ 这条**不能限流**，必须跟着主窗口每帧推。
  //
  // 我原来按「进度只是用来算该高亮哪一行」把它压到 1Hz，那是按内置样式的用法
  // 推的。第三方样式不是这么用的：magia 的节拍包络（镜头弹跳、放射光与魔法阵的
  // 亮度、粒子爆发）和逐字歌词的行内进度都是拿这个 position 现算的 ——
  // 它那边没有 <audio>，自己没法把位置往前推。1Hz 的位置喂给逐帧动画，结果是
  // 每 1 秒才跳一次的节拍：镜头、光束、魔法阵全在抖，正是「投影到桌面效果特别差」
  // 的主因之一。
  //
  // 数据量很小（四个数），主窗口推给自家皮肤也是每帧一次，这里没有理由更省。
  // 暂停时 position 不动，下面的比对会自然把它挡掉，不会空转。
  const at = now();

  // —— ⑧ 频谱：给「会跟着旋律动」的样式 ——
  //
  // 这是唯一一条**按固定频率采样**的增量（其余都靠值比对去重）：波形每帧都在变，
  // 逐帧比对没有意义，而去重后的结果就是「一直推」。所以按 ~25Hz 推，
  // 并且只在「桌面背景歌词开着 + 正在播放 + 当前样式声明了 spectrum」时才推。
  //
  // 那个窗口里没有 <audio>、也没有音频图（它自己算不出频谱），所以数据只能由
  // 主窗口送过去 —— 游戏风的像素电平柱就是靠这一条动起来的。
  const spec = spectrumPatch(at, playback.playing);
  if (spec) patches.push(spec);

  const due =
    playback.position !== last.position ||
    media.lyrics.index !== last.lyricIndex ||
    playback.duration !== last.duration ||
    playback.playing !== last.progressPlaying;
  if (due) {
    last.position = playback.position;
    last.lyricIndex = media.lyrics.index;
    last.duration = playback.duration;
    last.progressPlaying = playback.playing;
    last.progressAt = at;
    patches.push({
      type: "progress",
      position: playback.position,
      duration: playback.duration,
      playing: playback.playing,
      lyricIndex: media.lyrics.index,
    });
  }

  return patches;
}

function now() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

/* --------------------------------------------------------------------------
   频谱：为什么单开一条「按频率推」的增量
   --------------------------------------------------------------------------
   桌面背景歌词窗口里挂的是同一个皮肤，但它没有播放器、没有音频图。采样统一在
   主程序里做（audio.js 的 AnalyserNode），这里只负责把采到的帧送过去 ——
   详情页那边由 playerhost.js 直接推给皮肤，这边推给另一个窗口。
   没有这一条，游戏风的像素电平柱投到桌面上就是一排匀速起伏的死方块。

   采样频率取 25Hz 而不是主窗口的每帧：电平柱是像素方块的离散高度，
   25Hz 已经看不出台阶，而 IPC 量只有逐帧推送的 40%。
   停止播放（或换到不需要频谱的样式）时补推一帧 bands:null，
   让对面回到皮肤自己的待机起伏，而不是冻在最后一帧上。
   -------------------------------------------------------------------------- */

/** 两次频谱推送之间的最小间隔（ms）。40ms ≈ 25Hz。 */
const SPECTRUM_INTERVAL = 40;
/** 样式只声明 spectrum: true（没说段数）时用的默认段数。 */
const SPECTRUM_DEFAULT_BANDS = 32;

/** 上一次推频谱的时刻；0 表示「当前没在推」。 */
let lastSpectrumAt = 0;
/** 对面窗口当前是否处在「有频谱」的状态（用来只推一次停止帧）。 */
let spectrumLive = false;

/** 对面那个样式要多少段频谱（皮肤自己在 defineSkin 里声明）；0 = 不需要。 */
function skinSpectrumBands() {
  const id = state.pvMode || state.config.playerViewMode || "";
  try {
    // 注意 resolveSkin() 返回的是 { skin, fellBack } 而不是皮肤本身 ——
    // 写成 resolveSkin(id)?.spectrum 恒为 undefined（踩过一次：频谱一直不推）。
    const flag = resolveSkin(id).skin?.spectrum;
    if (!flag) return 0;
    const n = Number(flag);
    if (!Number.isFinite(n) || n <= 0) return SPECTRUM_DEFAULT_BANDS;
    return Math.max(1, Math.min(256, Math.round(n)));
  } catch {
    return 0;
  }
}

/**
 * 需要时产出一条 spectrum 增量，否则返回 null。
 * @param {number} at 当前时刻（now()）
 * @param {boolean} playing 是否正在播放
 */
function spectrumPatch(at, playing) {
  const bands = desktopWallpaperEnabled() && playing === true ? skinSpectrumBands() : 0;

  if (!bands) {
    lastSpectrumAt = 0;
    if (!spectrumLive) return null;
    spectrumLive = false;
    return { type: "spectrum", bands: null };
  }

  if (lastSpectrumAt && at - lastSpectrumAt < SPECTRUM_INTERVAL) return null;

  const data = spectrum(bands);
  if (!data) {
    // 音频图还没建起来（还没真正播过第一首）：一直不推，等它可用
    if (!spectrumLive) return null;
    lastSpectrumAt = 0;
    spectrumLive = false;
    return { type: "spectrum", bands: null };
  }

  lastSpectrumAt = at;
  spectrumLive = true;
  // Float32Array 直接进 JSON 会变成 {"0":0.1,"1":…} 这种对象，必须转成普通数组；
  // 两位小数够画电平柱，体积也小一个数量级。
  return { type: "spectrum", bands: Array.from(data, (v) => Math.round(v * 100) / 100) };
}

/**
 * 主窗口每次 tick 调用：把当前画面推给背景歌词窗口。
 * 内容没变时一次 IPC 都不发。
 */
export function pushDesktopWallpaper() {
  if (!desktopWallpaperEnabled()) return;

  if (!isWails()) {
    // 预览：没有第二个窗口，降级成主窗口内那条悬浮歌词
    const line = currentLyricWindow();
    paintFloatingLyricBar({ text: line.text, playing: currentPlaybackSnapshot().playing });
    return;
  }

  for (const patch of collectWallpaperPatches()) {
    backend.updateDesktopWallpaper(patch).catch((err) => {
      console.warn("[desktop-wallpaper] 同步背景歌词失败", err?.message ?? err);
    });
  }
}

/* --------------------------------------------------------------------------
   样式 / 主题 / 令牌快照
   -------------------------------------------------------------------------- */

/**
 * 当前样式 + 主题 + 令牌。
 *
 * skinId 的取值与 playerhost 完全一致（state.pvMode 优先，其次是配置），
 * 空串交给那边的 resolveSkin 兜底成默认样式。
 */
function setupSnapshot() {
  const tokens = themeTokens();
  const skinId = state.pvMode || state.config.playerViewMode || "";
  const theme = document.documentElement.dataset.theme || "";
  const mode = document.documentElement.dataset.mode || "dark";
  const density = document.documentElement.dataset.density || "";
  return {
    skinId,
    theme,
    mode,
    density,
    tokens: tokens.values,
    signature: [skinId, theme, mode, density, tokens.signature].join("|"),
  };
}

/* --------------------------------------------------------------------------
   主题令牌镜像
   --------------------------------------------------------------------------
   桌面上的皮肤要和窗口里那个长得一模一样，靠的是同一套设计令牌。令牌散在三处：
   tokens.css 的 :root、主题文件里的 :root[data-theme=…]、以及运行时的
   setRuntimeToken（毛玻璃、过渡时长、封面种子色、歌词字号…）。

   做法是**全量镜像**：先把「当前文档里出现过的所有自定义属性名」扫出来，再逐个
   读它们的计算值推过去。为什么不维护一份手写清单 —— 用户主题和第三方样式都能
   定义新令牌，清单一定会漏；漏掉的表现是「桌面上某个颜色和窗口里不一样」，
   极难排查，而全量镜像没有这个失败模式。
   -------------------------------------------------------------------------- */

/** 令牌只在这些「廉价可读」的东西变化时才需要重扫（扫描样式表不便宜） */
function tokenSignature() {
  const c = state.config || {};
  return [
    document.documentElement.dataset.theme || "",
    document.documentElement.dataset.mode || "",
    document.documentElement.dataset.density || "",
    c.glassBlurCustom ? c.glassBlur : "",
    c.glassAlphaCustom ? c.glassAlpha : "",
    c.accentFromCover ? 1 : 0,
    c.coverSeed || "",
    c.coverSeed2 || "",
    c.animations === false ? 0 : 1,
    c.animationsSpeed || "",
    c.lyricsFontSize,
    c.listDensity || "",
  ].join("|");
}

let cachedTokenSignature = "\u0000";
let cachedTokens = {};

/** @returns {{signature: string, values: Record<string,string>}} */
function themeTokens() {
  const signature = tokenSignature();
  if (signature !== cachedTokenSignature) {
    cachedTokenSignature = signature;
    cachedTokens = collectThemeTokens();
  }
  return { signature, values: cachedTokens };
}

/**
 * 把当前文档里所有自定义属性的**计算值**收集成一张表。
 *
 * 值必须读计算值而不是规则里的原文：令牌之间有引用（--dur-fast: calc(var(--dur) * .6)），
 * 只搬原文的话，桌面那边还得自己重放一遍变量链——搬计算值就一次到位。
 * 读不出值的（例如只写在 @media 里而当前不生效）直接跳过。
 */
function collectThemeTokens() {
  const names = new Set(Object.keys(getRuntimeTokens()));

  for (const sheet of document.styleSheets) {
    let rules = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // 跨域样式表读不到，跳过（本地构建不会有）
    }
    collectTokenNames(rules, names, 0);
  }

  const computed = getComputedStyle(document.documentElement);
  const out = {};
  for (const name of names) {
    const value = computed.getPropertyValue(name).trim();
    // 值里带分号或花括号的没法安全地拼进一条 CSS 规则；现实中不存在，跳过即可
    if (!value || /[;{}]/.test(value)) continue;
    out[name] = value;
  }
  return out;
}

/** 递归收自定义属性名（@media / @supports 里还有一层规则） */
function collectTokenNames(rules, names, depth) {
  if (!rules || depth > 3) return;
  for (const rule of rules) {
    if (rule.style) {
      for (const prop of rule.style) {
        if (prop.startsWith("--")) names.add(prop);
      }
    }
    if (rule.cssRules) collectTokenNames(rule.cssRules, names, depth + 1);
  }
}
