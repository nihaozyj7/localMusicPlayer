/* ==========================================================================
   diva/lib/hud.js — 顶部全息 HUD（LIVE / PAUSED / STANDBY + 曲目 + 时间码）
   --------------------------------------------------------------------------
   结构固定：
     · 左边：状态徽章（data-state=live|paused|standby）+ 曲名 / 歌手（在线试听带标记）；
     · 右边：舞台标签（HOLOGRAM STAGE / 128 BAND）+ 秒级时间码 `mm:ss / mm:ss`。

   ★ 本模块**不建任何计时器**：时间码由 entry 的帧循环顺手喂 `tick(pos, dur, playing)`。
     宿主的帧率是 45~60Hz，而时间码只显示到秒 —— 所以这里把格式化的结果缓存起来，
     只有秒数真的变了才写 DOM（否则每帧两次 textContent，白热 CPU）。

   ★ 省略号不在这里做：曲名 / 歌手的 `white-space: nowrap + text-overflow: ellipsis`
     在 skin.css 里。JS 只负责把完整文本放进去，并把全文挂到 title 属性上（悬停可看）。
   ========================================================================== */

const Q = new URL(import.meta.url).search;
const { UI } = await import(`./config.js${Q}`);
const { formatTime } = await import(`./util.js${Q}`);

/** 在线试听标记的固定文案。 */
export const ONLINE_KIND = "在线试听";

/** 毫秒 → `mm:ss`（HUD 时间码；负数 / 非法值按 0）。 */
export function timeText(ms) {
  return formatTime(ms);
}

/** 在线试听的角标文案：没有曲目时不显示。 */
export function kindOf(track, meta = {}) {
  return track && meta.online ? ONLINE_KIND : "";
}

function cleanText(value) {
  return String(value ?? "").trim();
}

/** 曲名：空则退到「未在播放」。 */
function titleOf(track) {
  return cleanText(track?.title) || UI.emptyTrack;
}

/** 歌手：空则用专辑，再空用空串（不要留一个孤零零的分隔点）。 */
function artistOf(track) {
  return cleanText(track?.artist) || cleanText(track?.album) || "";
}

/**
 * 纯函数：曲目 + 播放态 → HUD 的四个显示值。
 *
 * 三态规则：
 *   · live    —— 有曲目、播放器就绪、正在播放；
 *   · paused  —— 有曲目、播放器就绪、暂停；
 *   · standby —— 没有曲目 / 播放器还没就绪（loading 阶段不该显示 PAUSED）。
 *
 * @param {{title?:string, artist?:string, album?:string}|null|undefined} track
 * @param {{ playing?: boolean, ready?: boolean }} [meta]
 * @returns {{ state: "live"|"paused"|"standby", label: string, title: string, artist: string }}
 */
export function describeTrack(track, meta = {}) {
  const playing = meta.playing === true;
  const ready = meta.ready !== false;
  if (!track || !ready) {
    return {
      state: "standby",
      label: UI.standby,
      title: track ? titleOf(track) : UI.emptyTrack,
      artist: track ? artistOf(track) : "",
    };
  }
  return {
    state: playing ? "live" : "paused",
    label: playing ? UI.live : UI.paused,
    title: titleOf(track),
    artist: artistOf(track),
  };
}

/**
 * 创建 HUD。
 *
 * @param {HTMLElement|null} container entry 给的 `.dv__hud` 容器
 * @returns {{ setTrack: Function, setEmpty: Function, tick: Function, destroy: Function }}
 */
export function createHud(container) {
  if (!container) {
    return { setTrack() {}, setEmpty() {}, tick() {}, destroy() {} };
  }

  const hud = createEl("div", "dv-hud");

  const left = createEl("div", "dv-hud__left");
  const badge = createEl("div", "dv-hud__badge");
  badge.dataset.state = "standby";
  badge.appendChild(createEl("span", "dv-hud__dot"));
  const badgeText = createEl("span", "dv-hud__badgeText");
  badgeText.textContent = UI.standby;
  badge.appendChild(badgeText);

  const metaBox = createEl("div", "dv-hud__meta");
  const titleEl = createEl("div", "dv-hud__title");
  const kindEl = createEl("span", "dv-hud__kind");
  kindEl.textContent = ONLINE_KIND;
  kindEl.hidden = true;
  const artistEl = createEl("div", "dv-hud__artist");
  metaBox.appendChild(titleEl);
  metaBox.appendChild(kindEl);
  metaBox.appendChild(artistEl);

  left.appendChild(badge);
  left.appendChild(metaBox);

  const right = createEl("div", "dv-hud__right");
  const stage = createEl("div", "dv-hud__stage");
  stage.appendChild(createEl("span", "dv-hud__stageDot"));
  stage.appendChild(createEl("span", "dv-hud__stageLabel", UI.stageLabel));
  stage.appendChild(createEl("span", "dv-hud__band", UI.bandLabel));
  const timeBox = createEl("div", "dv-hud__time");
  const curEl = createEl("span", "dv-hud__cur", timeText(0));
  const slashEl = createEl("span", "dv-hud__slash", "/");
  const durEl = createEl("span", "dv-hud__dur", timeText(0));
  timeBox.appendChild(curEl);
  timeBox.appendChild(slashEl);
  timeBox.appendChild(durEl);

  right.appendChild(stage);
  right.appendChild(timeBox);
  hud.appendChild(left);
  hud.appendChild(right);
  container.appendChild(hud);

  /* —— 状态 —— */
  /** @type {{title?:string, artist?:string, album?:string}|null} */
  let track = null;
  let online = false;
  let playing = false;
  let empty = false;
  let destroyed = false;

  /* —— 秒级时间码缓存：只有格式化结果变了才写 DOM —— */
  let lastCur = "";
  let lastDur = "";

  function createEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function displayState() {
    if (empty || !track) {
      return { state: "standby", label: UI.standby, title: UI.emptyTrack, artist: "" };
    }
    return describeTrack(track, { playing, ready: true });
  }

  function paintState() {
    if (destroyed) return;
    const desc = displayState();
    if (badge.dataset.state !== desc.state) badge.dataset.state = desc.state;
    if (badgeText.textContent !== desc.label) badgeText.textContent = desc.label;
    if (titleEl.textContent !== desc.title) {
      titleEl.textContent = desc.title;
      titleEl.setAttribute("title", desc.title);
    }
    if (artistEl.textContent !== desc.artist) {
      artistEl.textContent = desc.artist;
      artistEl.setAttribute("title", desc.artist);
    }
    const kind = empty ? "" : kindOf(track, { online });
    if (kind) {
      if (kindEl.hidden) kindEl.hidden = false;
    } else if (!kindEl.hidden) {
      kindEl.hidden = true;
    }
  }

  /**
   * 换曲。`online=true` 时在曲名旁显示「在线试听」角标（文本固定）。
   * @param {{title?:string, artist?:string, album?:string}|null|undefined} next
   * @param {{ online?: boolean }} [meta]
   */
  function setTrack(next, meta = {}) {
    if (destroyed) return;
    track = next || null;
    online = meta.online === true;
    paintState();
  }

  /** 无歌态（standby + 未在播放）。 */
  function setEmpty(next) {
    if (destroyed) return;
    empty = next === true;
    paintState();
  }

  /**
   * 时间码 + 播放态。entry 每帧调用，但这里只在秒数变化 / 状态变化时写 DOM。
   * @param {number} positionMs
   * @param {number} durationMs
   * @param {boolean} isPlaying
   */
  function tick(positionMs, durationMs, isPlaying) {
    if (destroyed) return;
    const nextPlaying = isPlaying === true;
    if (nextPlaying !== playing) {
      playing = nextPlaying;
      paintState();
    }
    const cur = timeText(positionMs);
    if (cur !== lastCur) {
      lastCur = cur;
      curEl.textContent = cur;
    }
    const dur = timeText(durationMs);
    if (dur !== lastDur) {
      lastDur = dur;
      durEl.textContent = dur;
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (hud.parentNode) hud.parentNode.removeChild(hud);
    track = null;
  }

  return { setTrack, setEmpty, tick, destroy };
}
