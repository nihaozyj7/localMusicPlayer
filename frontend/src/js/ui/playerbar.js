/* ==========================================================================
   ui/playerbar.js — 底部常驻播放控件
   --------------------------------------------------------------------------
   迁移前后对比：
     迁移前 paintPlayerBar() 在**每一帧**做 20 多次 querySelector，
     再用 lastPainted 逐字段比较（pos/dur/playing/volume/mode/liked/queueLen…），
     还顺手在里面调用 checkSleepTimer()、renderQueuePanel()。

     迁移后：组件的 deps() 声明「底栏真正依赖的字段」，Lit 只更新变化的 part。
     每个 id 只出现一次（在模板里），不存在「谁负责更新它」的隐性分工。
   ========================================================================== */

import { MpElement, define, html, nothing, icon } from "./base.js";
import { coverSrc } from "./track-table.js";
import { toast, openMenu } from "./overlays.js";
import { createSlider } from "../slider.js";
import { applyVolume, seekTo } from "../audio.js";
import { addSongsTo, promptNewPlaylist } from "../playlists.js";
import { toggleLyricsPanel } from "../lyrics-panel.js";
import { togglePlayer } from "../playerhost.js";
import { locateCurrentQueueItem } from "../tracks.js";
import { commit,
  currentSong,
  cyclePlayMode,
  isLiked,
  playNext,
  playPrev,
  playlistById,
  setVolume,
  state,
  toggleLike,
  toggleMute,
  togglePlay,
} from "../store.js";
import { coverVersion } from "../store.js";
import {
  MODE_META,
  checkSleepTimer,
  toggleDesktopLyrics,
  toggleDesktopWallpaper,
  toggleOptionsPanel,
  toggleQueuePanel,
  toggleSleepPanel,
} from "../playerbar.js";
import { coverOf, fmtTime } from "../utils.js";

class MpPlayerbar extends MpElement {
  static deps = (s) => [
    s.currentId,
    s.playing,
    s.position,
    s.duration,
    s.volume,
    s.muted,
    s.playMode,
    s.likedIds,
    s.queue.length,
    s.queueOpen,
    s.optionsOpen,
    s.sleepOpen,
    s.sleepTimer,
    s.config.showDesktopLyrics,
    s.config.showDesktopWallpaper,
    s.desktopWallpaperSupport,
    s.lyricsOpen,
    coverVersion(),
  ];

  constructor() {
    super();
    this._progress = null;
    this._volume = null;
    this._tick = null;
  }

  onConnected() {
    // 定时停止需要一个「即使界面完全静止也会走」的时钟。
    // 以前它挂在每帧的 paintPlayerBar 上（界面静止时其实不会走），
    // 这里改成 1 秒一跳，只在真的有定时器时才做一次轻量更新。
    this._tick = setInterval(() => {
      if (!state.sleepTimer) return;
      this.requestUpdate();
    }, 1000);
  }

  onDisconnected() {
    if (this._tick) clearInterval(this._tick);
    this._tick = null;
  }

  firstUpdated() {
    const progress = this.querySelector("#progress");
    this._progress = createSlider(progress, {
      min: 0,
      max: 1000,
      step: 1,
      value: 0,
      format: (v) => fmtTime((v / 1000) * (state.duration || 0)),
      onChange: (v) => {
        if (!state.duration) return;
        // 拖动中只改临时的播放位置并重绘（左侧时间由 Lit 渲染）。
        // ★ 这里**不能**直接写 #time-current.textContent：那是模板里的文本节点，
        //   外部改写会把 Lit 的标记节点冲掉（会抛 "Cannot set properties of null"）。
        state.position = (v / 1000) * state.duration;
        this.requestUpdate();
      },
      onCommit: (v) => {
        if (!state.duration) return;
        seekTo((v / 1000) * state.duration);
      },
    });

    this._volume = createSlider(this.querySelector("#volume"), {
      min: 0,
      max: 1,
      step: 0.01,
      value: state.volume,
      format: (v) => `${Math.round(v * 100)}`,
      onChange: (v) => {
        setVolume(v);
        applyVolume();
        this.requestUpdate();
      },
    });
  }

  updated() {
    // 进度条：拖动中不抢位置（用户的手指优先）
    const pos = Math.round(state.position);
    const dur = Math.round(state.duration || 0);
    const bar = this.querySelector("#progress");
    if (bar && bar.dataset.dragging !== "true" && dur > 0) {
      this._progress?.set((pos / dur) * 1000, { silent: true });
    }
    this._progress?.setDisabled(dur <= 0);

    // 音量：静音时滑块落到 0
    const effective = state.muted ? 0 : state.volume;
    const vol = this.querySelector("#volume");
    if (vol && vol.dataset.dragging !== "true") {
      this._volume?.set(effective, { silent: true });
    }

    // 到点就停
    checkSleepTimer();
  }

  render() {
    const song = currentSong();
    const liked = state.currentId ? isLiked(state.currentId) : false;
    const mode = MODE_META[state.playMode] || MODE_META.sequence;
    const effectiveVolume = state.muted ? 0 : state.volume;
    const volumeIcon = effectiveVolume === 0 ? "volume-mute" : effectiveVolume < 0.5 ? "volume-low" : "volume-high";
    const cover = song ? coverOf(song) : "";
    const timer = state.sleepTimer;
    const sleepMinutes = timer?.type === "duration" ? Math.max(1, Math.ceil((timer.until - Date.now()) / 60000)) : 0;

    return html`
      <footer class="playerbar" id="playerbar">
        <div class="playerbar__progress">
          <span class="progress__time" id="time-current">${fmtTime(state.position)}</span>
          <div
            class="slider"
            id="progress"
            role="slider"
            tabindex="0"
            aria-label="播放进度"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="0"
            data-disabled="false"
          >
            <!-- 注意：.slider 内部（轨道 / 滑块 / 气泡）由 slider.js 直接写样式与文本，
                 所以这里**不能**给它们挂 Lit 绑定 —— 两方都写同一个节点会让
                 Lit 的标记节点被 textContent 覆盖掉（Lit 会报 "Cannot set properties
                 of null"）。气泡里的时间由 createSlider 的 format 负责。 -->
            <div class="slider__rail">
              <div class="slider__buffer" id="progress-buffer"></div>
              <div class="slider__fill" id="progress-fill"></div>
            </div>
            <div class="slider__thumb"></div>
            <div class="slider__bubble" id="progress-bubble"></div>
          </div>
          <span class="progress__time progress__time--total" id="time-total">${fmtTime(state.duration)}</span>
        </div>

        <div class="playerbar__row">
          <div class="playerbar__now">
            <button
              class="playerbar__cover"
              id="bar-cover"
              type="button"
              data-tip="播放详情页"
              aria-label="播放详情页"
              @click=${() => togglePlayer()}
            >
              <img id="bar-cover-img" alt=${song ? `${song.title} 封面` : ""} src=${coverSrc(cover)} />
              <svg class="playerbar__cover-icon"><use href="#i-expand"></use></svg>
            </button>
            <div class="playerbar__meta" id="bar-meta" data-tip="播放详情页" @click=${() => togglePlayer()}>
              <span class="playerbar__title" id="bar-title">${song ? song.title : "未在播放"}</span>
              <span class="playerbar__sub" id="bar-sub">
                ${song ? `${song.artist} · ${song.album}` : "选择一首歌曲开始"}
              </span>
            </div>
            <button
              class="playerbar__heart"
              id="bar-heart"
              type="button"
              aria-pressed=${String(liked)}
              data-tip=${liked ? "取消喜欢" : "加入我喜欢"}
              aria-label="加入我喜欢"
              @click=${() => this.onLike()}
            >${icon("heart")}</button>
            <button
              class="playerbar__heart playerbar__add"
              id="bar-add"
              type="button"
              data-tip="添加到歌单"
              aria-label="添加到歌单"
              ?disabled=${!song}
              @click=${(e) => this.openAddToPlaylistMenu(e.currentTarget)}
            >${icon("playlist-plus")}</button>
          </div>

          <div class="playerbar__center">
            <div class="transport">
              <button class="transport__btn" id="btn-prev" type="button" data-tip="上一曲" aria-label="上一曲" @click=${() => playPrev()}>
                ${icon("prev")}
              </button>
              <button
                class="transport__btn transport__btn--main"
                id="btn-play"
                type="button"
                data-tip=${state.playing ? "暂停" : "播放"}
                aria-label=${state.playing ? "暂停" : "播放"}
                @click=${() => togglePlay()}
              >
                <svg id="icon-play"><use href="#i-${state.playing ? "pause" : "play"}"></use></svg>
              </button>
              <button class="transport__btn" id="btn-next" type="button" data-tip="下一曲" aria-label="下一曲" @click=${() => playNext(false)}>
                ${icon("next")}
              </button>
            </div>
          </div>

          <div class="playerbar__tools">
            <div class="volume">
              <button
                class="volume__btn"
                id="btn-mute"
                type="button"
                data-tip=${state.muted ? "取消静音" : "静音"}
                aria-label=${state.muted ? "取消静音" : "静音"}
                @click=${() => {
                  toggleMute();
                  applyVolume();
                }}
              >
                <svg id="icon-volume"><use href="#i-${volumeIcon}"></use></svg>
              </button>
              <div
                class="slider volume__slider"
                id="volume"
                role="slider"
                tabindex="0"
                aria-label="音量"
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <div class="slider__rail">
                  <div class="slider__fill" id="volume-fill"></div>
                </div>
                <div class="slider__thumb"></div>
                <div class="slider__bubble" id="volume-bubble"></div>
              </div>
            </div>
            <button
              class="mode-btn"
              id="btn-mode"
              type="button"
              data-mode=${state.playMode}
              data-tip=${mode.label}
              aria-label=${mode.label}
              @click=${() => {
                cyclePlayMode();
                toast((MODE_META[state.playMode] || mode).label, { duration: 1400 });
              }}
            >
              <svg id="icon-mode"><use href="#i-${mode.icon}"></use></svg>
              <span class="mode-btn__badge">1</span>
            </button>
            <button
              class="mode-btn"
              id="btn-lyrics"
              type="button"
              data-tip="歌词"
              aria-label="歌词"
              aria-expanded=${String(Boolean(state.lyricsOpen))}
              aria-haspopup="dialog"
              @click=${() => toggleLyricsPanel()}
            >
              ${icon("lyric-match")}
            </button>
            <button
              class="mode-btn"
              id="btn-desktop-lyrics"
              type="button"
              aria-pressed=${String(Boolean(state.config.showDesktopLyrics))}
              data-tip="桌面歌词"
              aria-label="桌面歌词"
              @click=${() => toggleDesktopLyrics()}
            >${icon("desktop-lyrics")}</button>
            <button
              class="mode-btn"
              id="btn-desktop-wallpaper"
              type="button"
              aria-pressed=${String(Boolean(state.config.showDesktopWallpaper))}
              ?disabled=${state.desktopWallpaperSupport?.supported === false}
              aria-disabled=${state.desktopWallpaperSupport?.supported === false ? "true" : nothing}
              data-tip=${state.desktopWallpaperSupport?.supported === false
                ? state.desktopWallpaperSupport.reason
                : "桌面背景歌词"}
              aria-label="桌面背景歌词"
              @click=${() => toggleDesktopWallpaper()}
            >${icon("desktop-wallpaper")}</button>
            <button
              class="mode-btn"
              id="btn-sleep"
              type="button"
              aria-pressed=${String(Boolean(timer))}
              data-tip=${this.sleepTip(timer)}
              aria-label="定时停止"
              @click=${() => toggleSleepPanel()}
            >
              ${icon("clock")}
              <span class="mode-btn__badge" id="sleep-count" ?hidden=${!sleepMinutes}>${sleepMinutes}</span>
            </button>
            <button
              class="mode-btn"
              id="btn-options"
              type="button"
              aria-pressed=${String(Boolean(state.optionsOpen))}
              data-tip="选项"
              aria-label="选项"
              @click=${() => toggleOptionsPanel()}
            >${icon("options")}</button>
            <button
              class="mode-btn"
              id="btn-playlist"
              type="button"
              aria-pressed=${String(Boolean(state.queueOpen))}
              data-tip="播放列表"
              aria-label="播放列表"
              @click=${() => {
                locateAndToggleQueue();
              }}
            >
              ${icon("playlist")}
              <span class="mode-btn__badge" id="queue-count">${state.queue.length === 0 ? "" : state.queue.length > 99 ? "99+" : String(state.queue.length)}</span>
            </button>
          </div>
        </div>
      </footer>
    `;
  }

  sleepTip(timer) {
    if (timer?.type === "duration") return `定时停止 · 剩余 ${Math.max(0, Math.round((timer.until - Date.now()) / 1000))} 秒`;
    if (timer?.type === "after-song") return "定时停止 · 播完当前歌曲";
    return "定时停止";
  }

  onLike() {
    if (!state.currentId) return;
    toggleLike(state.currentId);
    const liked = isLiked(state.currentId);
    toast(liked ? "已加入「我喜欢」" : "已从「我喜欢」移除", {
      tone: liked ? "success" : "info",
      duration: 1500,
    });
  }

  /**
   * 「添加到歌单」菜单：把当前播放的这首歌加入任意歌单。
   * 没有正在播放的歌曲时直接提示，不弹空菜单。
   */
  openAddToPlaylistMenu(anchor) {
    const song = currentSong();
    if (!song) {
      toast("还没有正在播放的歌曲", { duration: 1600 });
      return;
    }
    const items = [];
    for (const p of state.playlists.filter((x) => !x.locked)) {
      items.push({
        id: p.id,
        label: p.name,
        icon: p.id === "liked" ? "heart" : "playlist",
        checked: p.songIds.includes(song.id),
      });
    }
    if (!items.length) items.push({ id: "__none", label: "还没有可用的歌单", disabled: true });
    items.push({ id: "__sep", kind: "sep" });
    items.push({ id: "__new", label: "新建歌单…", icon: "plus" });

    openMenu({
      anchor,
      x: 0,
      y: 0,
      align: "right",
      items,
      onPick: async (id) => {
        if (id === "__none" || id === "__sep") return;
        if (id === "__new") {
          promptNewPlaylist((pl) => {
            if (pl) addSongsTo(pl.id, [song.id]);
          });
          return;
        }
        addSongsTo(id, [song.id]);
      },
    });
  }
}

/**
 * 播放列表按钮：第一次点开时顺手把当前播放项滚到眼前。
 *
 * 迁移前按钮只做开合，「定位到当前播放」是面板标题栏上另一个按钮；
 * 这里保持不变（按钮语义不能顺手扩大），仅当面板已打开时再次点击才收起。
 */
function locateAndToggleQueue() {
  const wasOpen = state.queueOpen;
  toggleQueuePanel();
  if (!wasOpen && state.currentId) {
    // 面板刚展开，等它渲染完再滚动定位
    requestAnimationFrame(() => locateCurrentQueueItem({ notify: false }));
  }
}

define("mp-playerbar", MpPlayerbar);

export const _internals = { commit, playlistById, coverVersion, nothing };
