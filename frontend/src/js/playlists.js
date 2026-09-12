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
import { esc } from "./utils.js";

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
