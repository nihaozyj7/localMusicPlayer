/* ==========================================================================
   sort.test.js — 列表排序（升序 / 降序）的回归测试
   --------------------------------------------------------------------------
   需求（用户原话）：「列表的排序功能也修改一下，让其支持升序降序，
   并且不要使用下拉框，可以使用一个小悬浮面板效果会好一点」。

   这一组测试盯住三件事：
     1. **方向真的生效**：同一个字段切换 asc / desc 必须得到相反的顺序。
        这是这次改动最容易出错的地方 —— SORTERS 里有的比较函数本身
        已经写成「降序」（比如 addedAt 是 b - a），方向是个**乘数**，
        两者叠加时必须仍然符合用户对「升序/降序」的直觉。
     2. **默认方向合理**：换字段时不该让用户自己再翻一次
        （时间类默认降序、文本类默认升序）。
     3. **不就地改数组**：排序必须返回新数组，否则会把曲库/队列本身排乱。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

import {
  SORTERS,
  SORT_FIELDS,
  computeSorted,
  defaultSortDir,
  normalizeSortDir,
  sortDirLabel,
  sortField,
} from "../src/js/store.js";

/** 造一首歌（只带排序会用到的字段） */
function song(over = {}) {
  return {
    id: over.id || "s1",
    title: over.title ?? "标题",
    artist: over.artist ?? "歌手",
    album: over.album ?? "专辑",
    ext: over.ext ?? "mp3",
    size: over.size ?? 5_000_000,
    duration: over.duration ?? 200_000,
    playCount: over.playCount ?? 0,
    addedAt: over.addedAt ?? 1_000,
  };
}

/** 按指定字段/方向排序并返回 id 序列 */
function ids(list, key, dir) {
  return computeSorted(list, { key, dir }).map((s) => s.id);
}

/* --------------------------------------------------------------------------
   1. 方向生效：同一字段 asc / desc 必须相反
   -------------------------------------------------------------------------- */

test("computeSorted：每个字段的升序与降序互为逆序", () => {
  // 每个字段都给出**互不相同**的值：若某个字段的值全部相同，排序结果就只由
  // 稳定性（原始顺序）决定，升序与降序会得到同一个序列 —— 那样这条断言
  // 就测不出方向是否真的生效了（ext 曾经因此漏过）。
  const list = [
    song({
      id: "a",
      title: "Bravo",
      artist: "Zed",
      album: "Two",
      ext: "mp3",
      duration: 300_000,
      size: 900,
      playCount: 5,
      addedAt: 300,
    }),
    song({
      id: "b",
      title: "alpha",
      artist: "Amy",
      album: "One",
      ext: "flac",
      duration: 100_000,
      size: 100,
      playCount: 50,
      addedAt: 100,
    }),
    song({
      id: "c",
      title: "Charlie",
      artist: "Mike",
      album: "Three",
      ext: "wav",
      duration: 200_000,
      size: 500,
      playCount: 9,
      addedAt: 200,
    }),
  ];

  for (const key of Object.keys(SORTERS)) {
    const asc = ids(list, key, "asc");
    const desc = ids(list, key, "desc");
    assert.deepEqual(desc, [...asc].reverse(), `字段 ${key} 的降序应当是升序的逆序`);
  }
});

test("computeSorted：数值字段的升降序语义正确（时长）", () => {
  const list = [
    song({ id: "long", duration: 300_000 }),
    song({ id: "short", duration: 60_000 }),
    song({ id: "mid", duration: 180_000 }),
  ];
  // 升序 = 从短到长
  assert.deepEqual(ids(list, "duration", "asc"), ["short", "mid", "long"]);
  // 降序 = 从长到短
  assert.deepEqual(ids(list, "duration", "desc"), ["long", "mid", "short"]);
});

test("computeSorted：文本字段的升降序语义正确（标题）", () => {
  const list = [song({ id: "c", title: "Cherry" }), song({ id: "a", title: "Apple" }), song({ id: "b", title: "Banana" })];
  assert.deepEqual(ids(list, "title", "asc"), ["a", "b", "c"]);
  assert.deepEqual(ids(list, "title", "desc"), ["c", "b", "a"]);
});

// 这一条是本次改动最关键的回归点：
// addedAt 的比较函数本身是 `b - a`（天然降序），方向再乘上去之后，
// 必须保证 desc 真的等于「最近的在前」。
test("computeSorted：addedAt 的降序 = 最近添加在前", () => {
  const list = [
    song({ id: "old", addedAt: 100 }),
    song({ id: "new", addedAt: 300 }),
    song({ id: "mid", addedAt: 200 }),
  ];
  assert.deepEqual(ids(list, "addedAt", "desc"), ["new", "mid", "old"]);
  assert.deepEqual(ids(list, "addedAt", "asc"), ["old", "mid", "new"]);
});

test("computeSorted：playCount 的降序 = 播放次数最多在前", () => {
  const list = [song({ id: "few", playCount: 1 }), song({ id: "many", playCount: 99 }), song({ id: "some", playCount: 10 })];
  assert.deepEqual(ids(list, "playCount", "desc"), ["many", "some", "few"]);
  assert.deepEqual(ids(list, "playCount", "asc"), ["few", "some", "many"]);
});

/* --------------------------------------------------------------------------
   2. 安全性：不就地改数组、非法输入不炸
   -------------------------------------------------------------------------- */

test("computeSorted：不就地修改传入的数组", () => {
  const list = [song({ id: "b", title: "B" }), song({ id: "a", title: "A" })];
  const before = list.map((s) => s.id);
  computeSorted(list, { key: "title", dir: "asc" });
  assert.deepEqual(
    list.map((s) => s.id),
    before,
    "排序不该把调用方的数组（曲库 / 队列本身）就地排乱"
  );
});

test("computeSorted：认不出的字段原样返回", () => {
  const list = [song({ id: "b" }), song({ id: "a" })];
  assert.deepEqual(computeSorted(list, { key: "nope", dir: "asc" }), list);
});

test("computeSorted：空列表与单元素列表不报错", () => {
  assert.deepEqual(computeSorted([], { key: "title", dir: "asc" }), []);
  const one = [song({ id: "only" })];
  assert.deepEqual(computeSorted(one, { key: "title", dir: "desc" }).map((s) => s.id), ["only"]);
});

// 比较函数返回 0 的项必须保持原有相对顺序（Array.sort 的稳定性），
// 否则「同一天导入的一批歌」会莫名其妙地换来换去。
test("computeSorted：同值元素保持原有相对顺序（稳定排序）", () => {
  const list = [
    song({ id: "first", addedAt: 100 }),
    song({ id: "second", addedAt: 100 }),
    song({ id: "third", addedAt: 100 }),
  ];
  assert.deepEqual(ids(list, "addedAt", "asc"), ["first", "second", "third"]);
  assert.deepEqual(ids(list, "addedAt", "desc"), ["first", "second", "third"]);
});

test("computeSorted：缺失字段不会抛异常", () => {
  const list = [{ id: "x" }, { id: "y", title: "Y" }];
  assert.doesNotThrow(() => computeSorted(list, { key: "title", dir: "asc" }));
});

/* --------------------------------------------------------------------------
   3. 默认方向
   -------------------------------------------------------------------------- */

test("defaultSortDir：时间类字段默认降序，其余默认升序", () => {
  // 用户点开排序，最想先看到的是「最近的」「最多的」
  assert.equal(defaultSortDir("addedAt"), "desc");
  assert.equal(defaultSortDir("playCount"), "desc");
  // 文本与量值默认从小到大 / A→Z
  assert.equal(defaultSortDir("title"), "asc");
  assert.equal(defaultSortDir("artist"), "asc");
  assert.equal(defaultSortDir("album"), "asc");
  assert.equal(defaultSortDir("duration"), "asc");
  assert.equal(defaultSortDir("size"), "asc");
  // 认不出的字段落回升序（而不是抛异常）
  assert.equal(defaultSortDir("nope"), "asc");
});

test("normalizeSortDir：只接受 asc / desc，其余落回升序", () => {
  assert.equal(normalizeSortDir("desc"), "desc");
  assert.equal(normalizeSortDir("asc"), "asc");
  assert.equal(normalizeSortDir("DESC"), "asc", "大小写不做猜测，非法值一律落回 asc");
  assert.equal(normalizeSortDir(""), "asc");
  assert.equal(normalizeSortDir(undefined), "asc");
  assert.equal(normalizeSortDir(null), "asc");
  assert.equal(normalizeSortDir(1), "asc");
});

test("sortDirLabel：方向的中文名", () => {
  assert.equal(sortDirLabel("desc"), "降序");
  assert.equal(sortDirLabel("asc"), "升序");
  assert.equal(sortDirLabel(undefined), "升序");
});

/* --------------------------------------------------------------------------
   4. 字段定义（悬浮面板的数据来源）
   -------------------------------------------------------------------------- */

test("SORT_FIELDS：每一项都有对应的比较函数", () => {
  for (const f of SORT_FIELDS) {
    assert.ok(SORTERS[f.key], `字段 ${f.key} 必须在 SORTERS 里有实现`);
    assert.equal(typeof f.label, "string");
    assert.ok(f.label.length > 0, `字段 ${f.key} 必须有展示名`);
  }
});

test("SORT_FIELDS：需求里提到的 7 个字段都在", () => {
  const keys = SORT_FIELDS.map((f) => f.key);
  for (const want of ["addedAt", "title", "artist", "album", "duration", "size", "playCount"]) {
    assert.ok(keys.includes(want), `排序字段应当包含 ${want}`);
  }
});

test("SORT_FIELDS：字段 key 不重复（面板里的单选才有意义）", () => {
  const keys = SORT_FIELDS.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("sortField：按 key 取定义，认不出时返回 undefined", () => {
  assert.equal(sortField("title")?.label, "标题");
  assert.equal(sortField("addedAt")?.label, "添加时间");
  assert.equal(sortField("nope"), undefined);
});

/* --------------------------------------------------------------------------
   5. 排序字段覆盖：默认排序不改变「队列顺序由拖拽决定」的约定
   -------------------------------------------------------------------------- */

test("SORTERS：每个比较函数都返回数字", () => {
  const a = song({ id: "a" });
  const b = song({ id: "b" });
  for (const [key, cmp] of Object.entries(SORTERS)) {
    const r = cmp(a, b);
    assert.equal(typeof r, "number", `字段 ${key} 的比较函数应当返回数字`);
    assert.ok(Number.isFinite(r), `字段 ${key} 的比较结果应当是有限数`);
  }
});
