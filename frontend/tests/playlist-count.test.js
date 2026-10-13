/* ==========================================================================
   playlist-count.test.js — 歌单 / 队列的「数量标记」必须等于列表里真正显示的首数
   --------------------------------------------------------------------------
   守的是一个**计数与列表对不上**的 bug（用户实际反馈）：

     「我喜欢」徽标写 19 个，点进去只有 14 首。

   根因：歌单存的是歌曲 id，而曲库是扫描出来的。文件被删掉 / 移走之后，
   那些 id 作为「失效引用」留在 config.json 的 likedIds 里（实测用户机器上
   19 个 likedIds 只有 14 个文件还在）。列表渲染本来就会把失效引用过滤掉
   （见 store.js#currentSongList），但徽标与头部副标题直接读 `songIds.length`
   —— 那是**存档里的引用数**，不是用户能看到/听到的歌数。

   为什么不能靠「顺手清理存档里的失效 id」来修：把外接盘/网络盘拔掉时曲库
   暂时为空，清理会把用户的收藏**永久删掉**；而失效引用本身是无害的（文件
   回来，收藏就还在）。所以修的是**计数口径**：显示多少，就数多少。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { commit, playlistSongIds, resolvableSongIds, state } from "../src/js/store.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

/** 造一首歌（只带计数会碰到的字段） */
const song = (id) => ({ id, title: id, artist: "", album: "", ext: "mp3", duration: 1000 });

/** 把 store 摆成一个确定的起点（每个用例都自己铺一遍，避免互相串） */
function seed({ songs = [], queue = [], online = [] } = {}) {
  state.songs = songs.map(song);
  state.queue = queue.slice();
  state.onlineSongs = new Map(online.map((id) => [id, { id }]));
  state.playlists = [];
  state.view = "library";
  state.playlistId = null;
  state.query = "";
  // persist: false —— 用例里不碰 localStorage；recalcVisible 照常跑（songIndex 就绪）
  commit(undefined, { persist: false });
}

/* --------------------------------------------------------------------------
   核心场景：19 个收藏引用 / 只有 14 个文件
   -------------------------------------------------------------------------- */

test("playlistSongIds：失效引用不计入数量（19 个收藏 → 14 首）", () => {
  const all = Array.from({ length: 19 }, (_, i) => `t_${i}`);
  seed({ songs: all.slice(0, 14) });

  const liked = { id: "liked", name: "我喜欢", locked: true, builtin: true, songIds: all.slice() };

  assert.equal(playlistSongIds(liked).length, 14, "徽标会拿到 19 —— 失效引用被算进去了");
  assert.deepEqual(playlistSongIds(liked), all.slice(0, 14), "顺序必须与歌单里的顺序一致");
});

test("playlistSongIds：曲库还没走完 commit 也不能算错（索引落后时的兜底）", () => {
  // 直接改 state.songs 而不 commit：模拟「后端刚灌完曲库、这一帧还没重算」
  state.songs = [song("a"), song("b")];
  state.onlineSongs = new Map();

  assert.deepEqual(resolvableSongIds(["a", "ghost", "b"]), ["a", "b"]);
});

test("playlistSongIds：在线试听曲目算「存在」（它在队列/歌单里能放）", () => {
  seed({ songs: ["local"], online: ["online_1"] });

  const pl = { id: "pl1", name: "混着放", songIds: ["local", "online_1", "ghost"] };
  assert.deepEqual(playlistSongIds(pl), ["local", "online_1"]);
});

test("playlistSongIds：空歌单 / 缺字段不崩", () => {
  seed({ songs: ["a"] });
  assert.deepEqual(playlistSongIds({ id: "x", songIds: [] }), []);
  assert.deepEqual(playlistSongIds(null), []);
});

/* --------------------------------------------------------------------------
   与列表**同口径**：徽标数 === 该视图的行数
   -------------------------------------------------------------------------- */

test("队列徽标数 === 队列视图的行数（失效 id 不算）", () => {
  seed({ songs: ["a", "b"], queue: ["a", "ghost", "b"] });
  state.view = "queue";
  commit(undefined, { persist: false });

  assert.equal(state.visibleSongs.length, 2, "队列视图本来就过滤掉了 ghost");
  assert.equal(resolvableSongIds(state.queue).length, state.visibleSongs.length, "徽标与列表必须同数");
});

test("歌单徽标数 === 歌单视图的行数（失效 id 不算）", () => {
  seed({ songs: ["a", "b"] });
  const liked = { id: "liked", name: "我喜欢", locked: true, builtin: true, songIds: ["a", "ghost"] };
  state.playlists = [liked];
  state.view = "playlist";
  state.playlistId = "liked";
  commit(undefined, { persist: false });

  assert.equal(state.visibleSongs.length, 1);
  assert.equal(playlistSongIds(liked).length, state.visibleSongs.length);
});

/* --------------------------------------------------------------------------
   界面接线（源码断言）：这些地方曾经直接读 length
   -------------------------------------------------------------------------- */

test("侧边栏：歌单徽标按「真正存在的首数」渲染，不再读 songIds.length", () => {
  const src = read("frontend/src/js/ui/sidebar.js");
  assert.match(src, /fmtCount\(playlistSongIds\(pl\)\.length\)/, "「我喜欢」/歌单徽标没有走 playlistSongIds");
  assert.doesNotMatch(src, /fmtCount\(pl\.songIds\.length\)/, "徽标又退回了存档引用数（列表 14、徽标 19 会复现）");
  assert.match(src, /fmtCount\(resolvableSongIds\(state\.queue\)\.length\)/, "播放列表徽标没有走 resolvableSongIds");
});

test("内容区：歌单副标题的首数取列表长度（与上面累计的时长同一口径）", () => {
  const src = read("frontend/src/js/ui/content.js");
  assert.doesNotMatch(src, /fmtCount\(pl\.songIds\.length\)/, "副标题又用存档引用数报首数了");
  assert.match(src, /fmtCount\(songs\.length\)\} 首 · 共/, "歌单副标题没有改用 songs.length");
});

test("playlists.js：播放 / 加入播放列表不得把失效引用塞进队列", () => {
  const src = read("frontend/src/js/playlists.js");
  assert.doesNotMatch(src, /appendToQueue\(pl\.songIds\)/, "「加入播放列表」还在直接塞 songIds");
  assert.doesNotMatch(src, /playContext\(pl\.songIds/, "「播放这个歌单」还在直接塞 songIds");
  assert.match(src, /const ids = playlistSongIds\(pl\)/, "两处动作没有改用 playlistSongIds");
});

test("底栏：队列徽标按「真正能播的首数」渲染", () => {
  const src = read("frontend/src/js/ui/playerbar.js");
  assert.match(src, /resolvableSongIds\(state\.queue\)\.length/, "底栏队列徽标没有走 resolvableSongIds");
  assert.doesNotMatch(
    src,
    /state\.queue\.length > 99 \? "99\+" : String\(state\.queue\.length\)/,
    "底栏队列徽标又读成了队列数组长度"
  );
});
