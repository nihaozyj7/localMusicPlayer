/* ==========================================================================
   ui/playerview.js — 播放详情页外壳 + 样式按钮组
   --------------------------------------------------------------------------
   皮肤包（@localmusicplayer/player-skins）**不参与迁移**：它靠契约挂载到
   #playerview-stage / #skin-background 上，宿主 playerhost.js 负责喂数据。

   本组件只负责「宿主的外壳」：
     · .playerview 元素与舞台容器（id 与迁移前完全一致，皮肤按 id 拿不到就废）
     · 头部按钮：返回 / 更换封面 / 封面轮播 / 播放界面样式（样式按钮组以前是
       innerHTML 重建的，现在是 keyed repeat）
     · 每帧把进度推给皮肤（调 playerhost#renderPlayerView，与原 tick 同频）
   ========================================================================== */

import { MpElement, define, html, nothing, repeat, icon } from "./base.js";
import { toast } from "./overlays.js";
import { commit, currentSong, state, subscribe } from "../store.js";
import { coverVersion } from "../store.js";
import {
  availableSkins,
  closePlayer,
  nextCover,
  renderPlayerView,
  setPlayerViewMode,
  skinRegistryVersion,
} from "../playerhost.js";

class MpPlayerview extends MpElement {
  // ★ deps 里**刻意没有** s.position（与 ui/playerbar.js / ui/lyrics.js 同一理由）。
  //
  // 这个组件整个模板只是「外壳」：头部按钮、返回、样式按钮组、舞台容器 ——
  // 没有一处内容随播放进度变化。而 s.position 每 250ms 变一次，把它放进 deps
  // 的代价是外壳模板（含对皮肤按钮组的 repeat()）每秒重跑 4 次。
  //
  // 皮肤确实需要按进度推数据，但那件事由下面的 subscribe（_pushSkin）负责，
  // 与「外壳要不要重绘」是两件不相干的事 —— 原来把两者绑在一起了。
  static deps = (s) => [
    s.playerOpen,
    s.pvMode,
    s.currentId,
    s.playing,
    s.duration,
    s.config.showLyrics,
    s.config.coverCarousel,
    s.config.coverCarouselInterval,
    coverVersion(),
    skinRegistryVersion(),
  ];

  onConnected() {
    // 把进度推给皮肤。放在 store 订阅里而不是 updated()：
    // updated() 是「外壳重绘」的钩子，用它顺带做推送会让两者互相拖累。
    // renderPlayerView 内部有 host.skin / playerOpen 的早退，空跑很便宜。
    this._unsubscribers.push(subscribe(() => renderPlayerView()));
  }

  updated() {
    // 外壳自身重绘时也要推一次（换皮肤、开关详情页、换封面等都会走到这里）。
    // 与上面的 subscribe 重复调用是安全的：renderPlayerView 内部按快照去重。
    renderPlayerView();
  }

  render() {
    const song = currentSong();
    const covers = this.coverList(song);
    const carouselUsable = covers.length > 1;
    const carouselOn = state.config.coverCarousel === true && carouselUsable;
    const coverDisabled = !song || Boolean(song.online);
    const skins = availableSkins();

    return html`
      <section
        class="playerview"
        id="playerview"
        hidden
        data-state="closed"
        data-skin="classic"
        data-lyrics=${state.config.showLyrics === false ? "off" : "on"}
        aria-label="播放界面"
      >
        <div class="playerview__head">
          <button class="playerview__back" id="btn-player-back" type="button" @click=${() => closePlayer()}>
            ${icon("arrow-left")}
            <span>返回</span>
          </button>
          <span class="u-spacer"></span>
          <div class="viewmode" id="playerview-cover-group" role="group" aria-label="封面">
            <button
              class="viewmode__btn"
              id="btn-player-cover"
              type="button"
              data-tip="更换封面"
              aria-label="更换封面"
              ?disabled=${coverDisabled}
              @click=${() => this.openCoverPanel(song)}
            >
              ${icon("image")}
            </button>
            <button
              class="viewmode__btn"
              id="btn-cover-carousel"
              type="button"
              aria-pressed=${String(carouselOn)}
              ?disabled=${!carouselUsable}
              data-tip=${this.carouselTip(carouselUsable, carouselOn)}
              aria-label="封面轮播"
              @click=${() => this.toggleCarousel()}
            >
              ${icon("slideshow")}
            </button>
          </div>
          <div class="viewmode" id="playerview-mode" role="group" aria-label="播放界面样式">
            ${repeat(
              skins,
              (skin) => skin.id,
              (skin) => html`
                <button
                  class="viewmode__btn"
                  type="button"
                  data-pv-skin=${skin.id}
                  data-pv-mode=${skin.id}
                  aria-pressed=${String(state.pvMode === skin.id)}
                  data-tip=${skin.name || skin.id}
                  aria-label=${skin.name || skin.id}
                  @click=${() => setPlayerViewMode(skin.id)}
                >
                  ${icon(skin.icon || "disc")}
                </button>
              `
            )}
          </div>
        </div>
        <div
          class="playerview__stage"
          id="playerview-stage"
          @click=${(e) => {
            // 点播放详情页上的封面：多封面时手动切下一张
            if (!e.target.closest(".disc__label, .disc__platter")) return;
            nextCover();
          }}
        ></div>
      </section>
    `;
  }

  coverList(song) {
    if (!song) return [];
    const items = state.coverSets.get(song.id)?.items;
    return Array.isArray(items) ? items.filter((i) => i?.preview) : [];
  }

  carouselTip(usable, on) {
    if (!usable) return "这首歌只有一张封面";
    const seconds = Number(state.config.coverCarouselInterval) || 10;
    return on ? "关闭封面轮播" : `开启封面轮播（每 ${seconds} 秒换一张）`;
  }

  openCoverPanel(song) {
    if (!song || song.online) return;
    import("../coverpanel.js").then((m) => m.openCoverPanel(song.id));
  }

  /**
   * 开关封面轮播。
   *
   * 轮播是全局设置（详情页显示哪一张），但「这首歌有几张封面」是逐曲的：
   * 只有一张时按钮会被置灰，所以这里不必额外判断。
   */
  toggleCarousel() {
    state.config.coverCarousel = !state.config.coverCarousel;
    commit();
    toast(
      state.config.coverCarousel
        ? `已开启封面轮播（每 ${Number(state.config.coverCarouselInterval) || 10} 秒换一张）`
        : "已关闭封面轮播",
      { duration: 1600 }
    );
  }
}

define("mp-playerview", MpPlayerview);

export const _internals = { nothing };
