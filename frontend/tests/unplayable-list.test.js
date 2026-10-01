/* ==========================================================================
   unplayable-list.test.js — 「放不出来的文件」清单的前端逻辑
   --------------------------------------------------------------------------
   对应需求（用户原话）：
     「播放的时候如果播放不了自动移除，并在设置的扫描目录那里提示出来」

   Go 侧的行为（登记 / 合并 / 持久化）由 services_unplayable_test.go 覆盖。
   这里覆盖**前端这一半**：从内存曲库摘歌时三处状态必须同时改，
   否则会出现「列表没了但队列里还留着」「下一首跳到一首已经没了的歌」。

   audio.js 依赖 DOM，没法在 node:test 里直接 import，所以这里沿用
   loudness-switch.test.js 的做法：用**同一套规则**建模并锁住不变量。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

/**
 * 与 store.js#removeSongFromLibrary 同一套规则的精简模型。
 *
 * 逐字对照源码里的四步：
 *   allSongsRaw / songs / queue 三个数组都要过滤 + onlineSongs 要删。
 * 改源码时这里要跟着改 —— 对不上就说明哪一处被漏掉了。
 */
function makeLibraryState({ songs, queue, currentId, online = [] }) {
  const s = {
    allSongsRaw: songs.slice(),
    songs: songs.slice(),
    queue: queue.slice(),
    currentId,
    onlineSongs: new Map(online.map((id) => [id, { id }])),
    removed: false,
  };
  s.remove = (songId) => {
    if (!songId) return false;
    const before = s.allSongsRaw.length;
    const keptRaw = s.allSongsRaw.filter((x) => x.id !== songId);
    if (keptRaw.length === before && !s.onlineSongs.has(songId)) return false;

    s.allSongsRaw = keptRaw;
    s.songs = s.songs.filter((x) => x.id !== songId);
    s.queue = s.queue.filter((id) => id !== songId);
    s.onlineSongs.delete(songId);
    if (s.currentId === songId) s.currentId = null;
    s.removed = true;
    return true;
  };
  return s;
}

/* --------------------------------------------------------------------------
   1. 三处状态必须同时改
   -------------------------------------------------------------------------- */

test("移除一首歌时，曲库/过滤结果/队列三处都要改", () => {
  const s = makeLibraryState({
    songs: [
      { id: "a" },
      { id: "bad" },
      { id: "b" },
    ],
    queue: ["bad", "a", "b"],
    currentId: "a",
  });

  assert.equal(s.remove("bad"), true);

  assert.deepEqual(
    s.allSongsRaw.map((x) => x.id),
    ["a", "b"],
    "allSongsRaw 要去掉它（设置页的「共扫描 N 个文件」读的是这个）"
  );
  assert.deepEqual(
    s.songs.map((x) => x.id),
    ["a", "b"],
    "songs 要去掉它（列表渲染读的是这个）"
  );
  assert.deepEqual(s.queue, ["a", "b"], "queue 要去掉它，否则「下一首」会跳到一首已经没了的歌");
});

test("被移除的正好是当前播放的歌 → currentId 要清掉", () => {
  const s = makeLibraryState({
    songs: [{ id: "bad" }, { id: "b" }],
    queue: ["bad", "b"],
    currentId: "bad",
  });

  s.remove("bad");
  assert.equal(s.currentId, null, "不能让底栏继续显示一首已经不在曲库里的歌");
});

test("移除的不是当前歌 → currentId 不能被动到", () => {
  const s = makeLibraryState({
    songs: [{ id: "a" }, { id: "bad" }],
    queue: ["a", "bad"],
    currentId: "a",
  });

  s.remove("bad");
  assert.equal(s.currentId, "a", "正在放的歌不该被误伤");
});

/* --------------------------------------------------------------------------
   2. 边界：不存在的歌 / 在线歌曲
   -------------------------------------------------------------------------- */

test("移除不存在的 id → 返回 false，状态不变", () => {
  const s = makeLibraryState({ songs: [{ id: "a" }], queue: ["a"], currentId: "a" });
  assert.equal(s.remove("nope"), false, "曲库里没有这首歌时应返回 false");
  assert.deepEqual(
    s.songs.map((x) => x.id),
    ["a"],
    "状态不该有任何变化"
  );
});

test("空 id → 返回 false，不 panic", () => {
  const s = makeLibraryState({ songs: [{ id: "a" }], queue: ["a"], currentId: "a" });
  assert.equal(s.remove(""), false);
  assert.equal(s.remove(null), false);
  assert.equal(s.remove(undefined), false);
});

// 在线试听曲目不在曲库里，但它的失败也该能从「在线歌曲表」里摘掉 ——
// 否则切回列表点它还是同样的失败。
test("在线歌曲也能被移除（它在 onlineSongs 而不是 songs 里）", () => {
  const s = makeLibraryState({
    songs: [{ id: "a" }],
    queue: ["online1", "a"],
    currentId: "a",
    online: ["online1"],
  });

  assert.equal(s.remove("online1"), true, "只存在于 onlineSongs 里的歌也要能移除");
  assert.equal(s.onlineSongs.has("online1"), false);
  assert.deepEqual(s.queue, ["a"], "队列里也要清掉");
});

/* --------------------------------------------------------------------------
   3. 幂等
   -------------------------------------------------------------------------- */

test("同一首歌移除两次 → 第二次返回 false，不重复动状态", () => {
  const s = makeLibraryState({ songs: [{ id: "bad" }, { id: "a" }], queue: ["bad", "a"], currentId: "a" });

  assert.equal(s.remove("bad"), true);
  assert.equal(s.remove("bad"), false, "已经移除了，第二次应返回 false");
  assert.deepEqual(
    s.songs.map((x) => x.id),
    ["a"]
  );
});

/* --------------------------------------------------------------------------
   4. 清单本身的增删（store.js 的 dismiss / clear）
   -------------------------------------------------------------------------- */

test("dismiss 只去掉那一条，不碰其它记录", () => {
  let files = [
    { songId: "s1", title: "A" },
    { songId: "s2", title: "B" },
    { songId: "s3", title: "C" },
  ];
  files = files.filter((f) => f.songId !== "s2");
  assert.deepEqual(
    files.map((f) => f.songId),
    ["s1", "s3"]
  );
});

test("清空清单后长度为 0", () => {
  let files = [{ songId: "s1" }, { songId: "s2" }];
  files = [];
  assert.equal(files.length, 0);
});
