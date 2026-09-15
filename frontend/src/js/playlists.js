/* ==========================================================================
   playlists.js — 歌单业务动作（新建 / 重命名 / 删除 / 加入 / 菜单）
   --------------------------------------------------------------------------
   迁移点：弹窗内容从 HTML 字符串改成 Lit 模板（`html``…``），
   不再有字符串拼接与 esc()。「添加歌曲」的勾选列表抽成
   <mp-add-songs>（见 ui/add-songs.js），筛选不再重建整段 HTML。

   另外：歌单菜单（播放 / 加入播放列表 / 重命名 / 删除 / 导出）从 shell.js
   挪到这里 —— 它是歌单的业务动作，侧边栏与内容区工具条都要用。
   ========================================================================== */

import { html } from "lit";
import {
  LIKED_ID,
  addSongsToPlaylist,
  createPlaylist,
  deletePlaylist,
  playlistById,
  renamePlaylist,
  state,
} from "./store.js";
import { openMenu, openModal, toast } from "./ui/overlays.js";
import { navigate } from "./shell.js";
import { fmtCount } from "./utils.js";
// 只为注册自定义元素（弹窗体里要用 <mp-add-songs>）
import "./ui/add-songs.js";

export function promptNewPlaylist(onDone) {
  openModal({
    title: "新建歌单",
    desc: "歌单名称可以随时修改。",
    body: html`<input class="input" data-field="name" type="text" placeholder="例如：深夜循环" maxlength="40" />`,
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
    body: html`<input class="input" data-field="name" type="text" .value=${pl.name} maxlength="40" />`,
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
 */
export function promptAddSongs(id) {
  const pl = playlistById(id);
  if (!pl) return;
  if (!state.songs.length) {
    toast("本地曲库还是空的，先扫描音乐文件夹吧", { tone: "warning" });
    return;
  }

  const already = new Set(pl.songIds);
  openModal({
    title: `添加歌曲到「${pl.name}」`,
    desc: "勾选要加入的歌曲；已经在歌单里的会保持选中。",
    body: html`<mp-add-songs .playlistId=${id}></mp-add-songs>`,
    okText: "加入歌单",
    onOk: (_values, modal) => {
      const ids = [...modal.querySelectorAll("[data-song-check]:checked")].map((n) => n.dataset.songCheck);
      const fresh = ids.filter((sid) => !already.has(sid));
      if (!fresh.length) return "没有选中新的歌曲";
      addSongsTo(id, fresh);
      return true;
    },
  });
}

/* --------------------------------------------------------------------------
   歌单菜单
   -------------------------------------------------------------------------- */
export function openPlaylistMenu(id, anchor) {
  const pl = playlistById(id);
  if (!pl) return;
  const items = [
    { id: "play", label: "播放这个歌单", icon: "play" },
    { id: "queue", label: "加入播放列表", icon: "queue" },
    { id: "sep1", kind: "sep" },
  ];
  // 「我喜欢」也是歌单，只是内置的：它照样有菜单，只是没有重命名/删除。
  if (!pl.locked) {
    items.push({ id: "rename", label: "重命名", icon: "edit" });
    items.push({ id: "delete", label: "删除歌单", icon: "trash", danger: true });
    items.push({ id: "sep2", kind: "sep" });
  }
  items.push({ id: "export", label: "导出为 m3u", icon: "file" });

  const rect = anchor.getBoundingClientRect();
  openMenu({
    x: rect.left,
    y: rect.bottom + 6,
    align: "right",
    items,
    onPick: async (action) => {
      switch (action) {
        case "play":
          playPlaylist(pl);
          break;
        case "queue": {
          const m = await import("./store.js");
          m.appendToQueue(pl.songIds);
          toast(`已把 ${fmtCount(pl.songIds.length)} 首加入播放列表`, { tone: "success" });
          break;
        }
        case "rename":
          promptRenamePlaylist(pl.id);
          break;
        case "delete":
          confirmDeletePlaylist(pl.id, () => navigate("library"));
          break;
        case "export":
          toast("导出 m3u 需要接入后端后实现", { duration: 2200 });
          break;
        default:
          break;
      }
    },
  });
}

function playPlaylist(pl) {
  import("./store.js").then(({ playContext }) => {
    playContext(pl.songIds.slice(), 0, { type: "playlist", id: pl.id });
  });
}
