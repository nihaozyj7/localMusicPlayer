/* ==========================================================================
   playlists.js — 歌单相关业务动作（新建 / 重命名 / 删除 / 加入）
   ========================================================================== */

import {
  LIKED_ID,
  addSongsToPlaylist,
  createPlaylist,
  deletePlaylist,
  playlistById,
  renamePlaylist,
  state,
} from "./store.js";
import { openModal, toast } from "./dom.js";
import { esc, fmtCount } from "./utils.js";

export function promptNewPlaylist(onDone) {
  openModal({
    title: "新建歌单",
    desc: "歌单名称可以随时修改。",
    body: `<input class="input" data-field="name" type="text" placeholder="例如：深夜循环" maxlength="40" />`,
    okText: "创建",
    onOk: (values) => {
      const name = String(values.name || "").trim();
      if (!name) return "请输入歌单名称";
      if (state.playlists.some((p) => p.name === name)) return "已存在同名歌单";
      const pl = createPlaylist(name);
      onDone?.(pl);
      toast(`已创建歌单「${name}」`, { tone: "success" });
      return true;
    },
  });
}

export function promptRenamePlaylist(id, onDone) {
  const pl = playlistById(id);
  if (!pl || pl.locked) return;
  openModal({
    title: "重命名歌单",
    body: `<input class="input" data-field="name" type="text" value="${esc(pl.name)}" maxlength="40" />`,
    okText: "保存",
    onOk: (values) => {
      const name = String(values.name || "").trim();
      if (!name) return "名称不能为空";
      renamePlaylist(id, name);
      onDone?.(name);
      return true;
    },
  });
}

export function confirmDeletePlaylist(id, onDone) {
  const pl = playlistById(id);
  if (!pl || pl.locked) return;
  openModal({
    title: `删除歌单「${pl.name}」？`,
    desc: "只会删除歌单本身，本地音乐文件不会被删除。",
    okText: "删除",
    danger: true,
    onOk: () => {
      deletePlaylist(id);
      onDone?.();
      toast("歌单已删除");
      return true;
    },
  });
}

/** 把歌曲加入某个歌单（含「我喜欢」） */
export function addSongsTo(id, songIds) {
  const pl = playlistById(id);
  if (!pl) return;
  const added = addSongsToPlaylist(id, songIds);
  if (!added) toast("所选歌曲已在该歌单中");
  else toast(`已添加 ${added} 首到「${pl.name}」`, { tone: "success" });
}

export function likedPlaylist() {
  return playlistById(LIKED_ID);
}
/**
 * 打开「添加歌曲到歌单」弹层。
 *
 * 需求：歌单里的「添加」按钮 → 列出所有歌曲 → 勾选后加入歌单。
 * 已经在歌单里的歌显示为已选中且不可取消（避免用户误以为没加进去）。
 * 弹层里带一个筛选框：曲库动辄上千首，不给筛选根本翻不到。
 */
export function promptAddSongs(id) {
  const pl = playlistById(id);
  if (!pl) return;
  if (!state.songs.length) {
    toast("本地曲库还是空的，先扫描音乐文件夹吧", { tone: "warning" });
    return;
  }

  const already = new Set(pl.songIds);
  const body = `
    <input class="input" id="addsongs-filter" type="text" placeholder="筛选歌曲（标题 / 歌手 / 专辑）" autocomplete="off" spellcheck="false" />
    <div class="addsongs__head">
      <span id="addsongs-count"></span>
      <span class="addsongs__actions">
        <button class="btn btn--sm" type="button" data-addsongs="none">清空选择</button>
        <button class="btn btn--sm" type="button" data-addsongs="all">全选</button>
      </span>
    </div>
    <div class="addsongs" id="addsongs-list"></div>`;

  const { root } = openModal({
    title: `添加歌曲到「${pl.name}」`,
    desc: "勾选要加入的歌曲；已经在歌单里的会保持选中。",
    body,
    okText: "加入歌单",
    onOk: (_values, modal) => {
      const ids = [...modal.querySelectorAll("[data-song-check]:checked")].map(
        (n) => n.dataset.songCheck
      );
      const fresh = ids.filter((sid) => !already.has(sid));
      if (!fresh.length) return "没有选中新的歌曲";
      addSongsTo(id, fresh);
      return true;
    },
  });

  const listEl = root.querySelector("#addsongs-list");
  const filterEl = root.querySelector("#addsongs-filter");
  const countEl = root.querySelector("#addsongs-count");

  const paint = () => {
    const q = (filterEl?.value || "").trim().toLowerCase();
    const songs = state.songs.filter(
      (s) => !q || `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(q)
    );
    const free = state.songs.filter((s) => !already.has(s.id)).length;
    countEl.textContent = q
      ? `匹配 ${fmtCount(songs.length)} 首`
      : `共 ${fmtCount(state.songs.length)} 首 · 其中 ${fmtCount(free)} 首尚未加入`;
    listEl.innerHTML = songs.length
      ? songs
          .map((s) => {
            const inList = already.has(s.id);
            return `
              <label class="addsongs__row">
                <input type="checkbox" data-song-check="${s.id}" ${inList ? "checked disabled" : ""} />
                <span class="addsongs__text">
                  <span class="addsongs__title u-ellipsis">${esc(s.title)}</span>
                  <span class="addsongs__sub u-ellipsis">${esc(s.artist)}${s.album ? ` · ${esc(s.album)}` : ""}</span>
                </span>
                ${inList ? '<span class="addsongs__tag">已在歌单</span>' : ""}
              </label>`;
          })
          .join("")
      : '<div class="addsongs__empty">没有匹配的歌曲</div>';
  };

  filterEl?.addEventListener("input", paint);
  // 筛选框里按回车不应该直接提交弹层（openModal 监听的是 document 上的 keydown）
  filterEl?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
  });

  root.addEventListener("click", (e) => {
    const act = e.target.closest("[data-addsongs]")?.dataset.addsongs;
    if (!act) return;
    const boxes = [...listEl.querySelectorAll("[data-song-check]:not(:disabled)")];
    for (const box of boxes) box.checked = act === "all";
  });

  paint();
}
