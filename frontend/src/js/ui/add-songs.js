/* ==========================================================================
   ui/add-songs.js — 「添加歌曲到歌单」的勾选列表（弹窗内容）
   --------------------------------------------------------------------------
   迁移前它是一段 innerHTML 模板 + 一个 paint() 闭包（playlists.js）。
   列表动辄上千首，筛选时每敲一个字都要重建整段 HTML；
   现在筛选只重跑一次模板 diff。
   ========================================================================== */

import { MpElement, define, html, nothing, repeat } from "./base.js";
import { state } from "../store.js";
import { fmtCount } from "../utils.js";

class MpAddSongs extends MpElement {
  static properties = { playlistId: { type: String } };

  constructor() {
    super();
    this.playlistId = "";
    this._query = "";
  }

  deps() {
    return [state.playlistVersion, state.songs, this.playlistId, this._query];
  }

  /** 已经在歌单里的 id 集合 */
  get already() {
    const pl = state.playlists.find((p) => p.id === this.playlistId);
    return new Set(pl?.songIds || []);
  }

  get filtered() {
    const q = this._query.trim().toLowerCase();
    if (!q) return state.songs;
    return state.songs.filter((s) => `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(q));
  }

  render() {
    const already = this.already;
    const songs = this.filtered;
    const free = state.songs.filter((s) => !already.has(s.id)).length;
    return html`
      <input
        class="input"
        id="addsongs-filter"
        type="text"
        placeholder="筛选歌曲（标题 / 歌手 / 专辑）"
        autocomplete="off"
        spellcheck="false"
        .value=${this._query}
        @input=${(e) => {
          this._query = e.target.value;
          this.requestUpdate();
        }}
        @keydown=${(e) => {
          // 筛选框里按回车不应该直接提交弹层（openModal 监听的是 document 上的 keydown）
          if (e.key !== "Enter") return;
          e.preventDefault();
          e.stopPropagation();
        }}
      />
      <div class="addsongs__head">
        <span id="addsongs-count">
          ${this._query.trim()
            ? `匹配 ${fmtCount(songs.length)} 首`
            : `共 ${fmtCount(state.songs.length)} 首 · 其中 ${fmtCount(free)} 首尚未加入`}
        </span>
        <span class="addsongs__actions">
          <button class="btn btn--sm" type="button" data-addsongs="none" @click=${() => this.setAll(false)}>清空选择</button>
          <button class="btn btn--sm" type="button" data-addsongs="all" @click=${() => this.setAll(true)}>全选</button>
        </span>
      </div>
      <div class="addsongs" id="addsongs-list">
        ${songs.length
          ? repeat(
              songs,
              (s) => s.id,
              (s) => {
                const inList = already.has(s.id);
                return html`
                  <label class="addsongs__row">
                    <input type="checkbox" data-song-check=${s.id} ?checked=${inList} ?disabled=${inList} />
                    <span class="addsongs__text">
                      <span class="addsongs__title u-ellipsis">${s.title}</span>
                      <span class="addsongs__sub u-ellipsis">${s.artist}${s.album ? ` · ${s.album}` : ""}</span>
                    </span>
                    ${inList ? html`<span class="addsongs__tag">已在歌单</span>` : nothing}
                  </label>
                `;
              }
            )
          : html`<div class="addsongs__empty">没有匹配的歌曲</div>`}
      </div>
    `;
  }

  setAll(checked) {
    for (const box of this.querySelectorAll("[data-song-check]:not(:disabled)")) {
      box.checked = checked;
    }
  }
}

define("mp-add-songs", MpAddSongs);
