/* ==========================================================================
   store-pure.test.js — store.js 纯函数回归测试
   --------------------------------------------------------------------------
   为什么补这一组：store.js 是前端最大的模块（1,800+ 行），承担「曲库过滤 /
   排序 / 配置归一」这些**纯粹、可判定**的逻辑，而它此前是 0 测试覆盖
   （frontend/tests 只测了 about-info、lrc 工具与 player-skins 的纯函数）。
   过滤规则算错不会崩，只会「静默少几首歌」——正是最需要测试兜住的一类逻辑。

   本文件只碰纯函数，不 import 任何 DOM / 后端依赖，可以在 node:test 里直接跑。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

import { applyRules, compileRegex, filterByQuery, matchRules } from "../src/js/store.js";

/** 造一首歌（只带规则会用到的字段） */
function song(over = {}) {
  return {
    id: over.id || "s1",
    path: over.path || "D:/Music/a.mp3",
    title: over.title || "标题",
    artist: over.artist || "歌手",
    album: over.album || "专辑",
    ext: over.ext || "mp3",
    size: over.size ?? 5_000_000,
    duration: over.duration ?? 200_000,
  };
}

const rule = (over = {}) => ({
  id: over.id || "r1",
  type: over.type || "size",
  op: over.op || "lt",
  value: over.value ?? "10240",
  unit: over.unit || "B",
  scope: over.scope || "exclude",
  enabled: over.enabled ?? true,
});

/* --------------------------------------------------------------------------
   过滤语义：排除优先于仅包含
   -------------------------------------------------------------------------- */

test("applyRules：没有规则时全部保留，excluded 为 0", () => {
  const songs = [song({ id: "a" }), song({ id: "b" })];
  const { kept, excluded, total } = applyRules(songs, []);
  assert.equal(kept.length, 2);
  assert.equal(excluded, 0);
  assert.equal(total, 2);
});

test("applyRules：size/lt + exclude 命中即剔除（按字节）", () => {
  const songs = [song({ id: "small", size: 5_000 }), song({ id: "big", size: 8_000_000 })];
  const { kept, excluded } = applyRules(songs, [rule({ type: "size", op: "lt", value: "10240" })]);
  assert.deepEqual(
    kept.map((s) => s.id),
    ["big"]
  );
  assert.equal(excluded, 1);
});

test("applyRules：禁用的规则不生效", () => {
  const songs = [song({ id: "small", size: 5_000 })];
  const { kept, excluded } = applyRules(songs, [rule({ enabled: false })]);
  assert.equal(kept.length, 1);
  assert.equal(excluded, 0);
});

test("applyRules：正则同时匹配完整路径与文件名", () => {
  const songs = [
    song({ id: "p", path: "D:/Music/Album/track.mp4" }),
    song({ id: "n", path: "D:/Music/Album/track.mp3" }),
  ];
  const { kept } = applyRules(songs, [
    rule({ type: "regex", op: "match", value: "\\.mp4$", scope: "exclude" }),
  ]);
  assert.deepEqual(
    kept.map((s) => s.id),
    ["n"]
  );
});

test("applyRules：include 只有命中才保留（未命中全部剔除）", () => {
  const songs = [
    song({ id: "flac", ext: "flac", path: "D:/M/a.flac" }),
    song({ id: "mp3", ext: "mp3", path: "D:/M/a.mp3" }),
  ];
  const { kept, excluded } = applyRules(songs, [
    rule({ type: "regex", op: "match", value: "\\.flac$", scope: "include" }),
  ]);
  assert.deepEqual(
    kept.map((s) => s.id),
    ["flac"]
  );
  assert.equal(excluded, 1);
});

test("applyRules：exclude 优先于 include（同时命中时被排除）", () => {
  // 一条 include 允许 .flac，一条 exclude 排除 _tmp 目录下的文件
  const songs = [
    song({ id: "good", ext: "flac", path: "D:/M/a.flac" }),
    song({ id: "tmp", ext: "flac", path: "D:/M/_tmp/a.flac" }),
  ];
  const { kept } = applyRules(songs, [
    rule({ id: "inc", type: "regex", op: "match", value: "\\.flac$", scope: "include" }),
    rule({ id: "exc", type: "regex", op: "match", value: "_tmp", scope: "exclude" }),
  ]);
  assert.deepEqual(
    kept.map((s) => s.id),
    ["good"]
  );
});

test("applyRules：总数字段等于输入长度（设置页预览用）", () => {
  const songs = Array.from({ length: 44 }, (_, i) => song({ id: `s${i}` }));
  const { total, kept, excluded } = applyRules(songs, []);
  assert.equal(total, 44);
  assert.equal(kept.length, 44);
  assert.equal(excluded, 0);
  // kept 必须是数组：设置页模板会读 kept.length，为 undefined 会渲染成 NaN
  assert.ok(Array.isArray(kept));
  assert.equal(typeof kept.length, "number");
  assert.ok(Number.isFinite(kept.length));
});

/* --------------------------------------------------------------------------
   单位换算
   -------------------------------------------------------------------------- */

test("applyRules：size 单位 KB/MB/GB 会换算成字节", () => {
  const s = song({ id: "x", size: 2_000_000 });
  // 10 KB = 10240 B，2MB > 10240 → 保留
  assert.equal(applyRules([s], [rule({ value: "10", unit: "KB" })]).kept.length, 1);
  // 10 MB = 10485760 B，2MB < 10MB → 排除
  assert.equal(applyRules([s], [rule({ value: "10", unit: "MB" })]).kept.length, 0);
  // 1 GB → 排除
  assert.equal(applyRules([s], [rule({ value: "1", unit: "GB" })]).kept.length, 0);
});

test("applyRules：非法 size 值不误删（Number.isFinite 保护）", () => {
  // 空值会让 normalizeSize 得到 NaN；匹配阶段必须跳过这条规则而不是全剔除
  const songs = [song({ id: "a" }), song({ id: "b" })];
  const { kept, excluded } = applyRules(songs, [rule({ type: "size", value: "" })]);
  assert.equal(kept.length, 2, "非法数值的规则应当被忽略，不能把整个曲库清空");
  assert.equal(excluded, 0);
});

/* --------------------------------------------------------------------------
   正则编译
   -------------------------------------------------------------------------- */

test("compileRegex：非法正则返回 null 而不是抛异常", () => {
  assert.equal(compileRegex("([unclosed"), null);
  assert.equal(compileRegex(""), null);
  assert.ok(compileRegex("^a") instanceof RegExp);
});

test("compileRegex：默认忽略大小写（与 Go 侧 filter.Match 一致）", () => {
  const re = compileRegex("abc");
  assert.ok(re.test("ABC"));
});

test("applyRules：非法正则的规则被跳过，不影响其它歌", () => {
  const songs = [song({ id: "a" }), song({ id: "b" })];
  const { kept } = applyRules(songs, [rule({ type: "regex", value: "([bad" })]);
  assert.equal(kept.length, 2);
});

/* --------------------------------------------------------------------------
   matchRules（单首便捷入口）
   -------------------------------------------------------------------------- */

test("matchRules：返回 {excluded, reason}，命中时带规则 id", () => {
  const r = rule({ id: "sizerule", type: "size", op: "lt", value: "999999999" });
  const hit = matchRules(song({ size: 1_000 }), [r]);
  assert.equal(hit.excluded, true);
  assert.equal(hit.reason, "sizerule");

  const miss = matchRules(song({ size: 999_999_999_999 }), [r]);
  assert.equal(miss.excluded, false);
  assert.equal(miss.reason, null);
});

test("matchRules：include 未命中时 reason 是 include-miss", () => {
  const r = rule({ type: "regex", op: "match", value: "\\.flac$", scope: "include" });
  const res = matchRules(song({ path: "D:/M/a.mp3" }), [r]);
  assert.equal(res.excluded, true);
  assert.equal(res.reason, "include-miss");
});

/* --------------------------------------------------------------------------
   边界：空曲库 / 大曲库
   -------------------------------------------------------------------------- */

test("applyRules：空曲库不崩且返回 0", () => {
  const { kept, excluded, total } = applyRules([], [rule()]);
  assert.equal(kept.length, 0);
  assert.equal(excluded, 0);
  assert.equal(total, 0);
});

test("applyRules：1 万首规模下结果稳定（含 Unicode 路径）", () => {
  const songs = Array.from({ length: 10_000 }, (_, i) =>
    song({ id: `s${i}`, path: `D:/音乐库/专辑${i % 50}/曲目-${i}.mp3`, size: i % 2 ? 1_000 : 9_000_000 })
  );
  const { kept, excluded, total } = applyRules(songs, [
    rule({ type: "size", op: "lt", value: "10240", scope: "exclude" }),
  ]);
  assert.equal(total, 10_000);
  assert.equal(kept.length + excluded, 10_000);
  assert.equal(excluded, 5_000);
});

/* --------------------------------------------------------------------------
   filterByQuery —— 曲库筛选框的匹配语义
   --------------------------------------------------------------------------
   为什么必须钉住：这个函数在性能优化里被改成「小写拼接串 + 一次 includes」
   （原来是 4 次 toLowerCase + 4 次 includes）。索引化最容易出的错是
   **跨界误命中**（["ab","c"] 与 ["a","bc"] 被当成同一个串），
   而这类错误表现为「多出几首不该出现的歌」，不会崩、不会报错 ——
   正是最需要回归测试兜住的一类。
   -------------------------------------------------------------------------- */

const hay = (over = {}) => ({
  id: over.id || "s1",
  title: over.title ?? "",
  artist: over.artist ?? "",
  album: over.album ?? "",
  ext: over.ext ?? "",
});

test("filterByQuery：空查询返回原列表（同一引用）", () => {
  const list = [hay({ id: "a", title: "abc" })];
  assert.equal(filterByQuery(list, ""), list);
  assert.equal(filterByQuery(list, "   "), list);
  assert.equal(filterByQuery(list, null), list);
});

test("filterByQuery：命中 title/artist/album/ext 任一项即保留", () => {
  const list = [
    hay({ id: "t", title: "夜航西飞" }),
    hay({ id: "a", artist: "某歌手" }),
    hay({ id: "b", album: "专辑名" }),
    hay({ id: "e", ext: "flac" }),
    hay({ id: "n", title: "无关" }),
  ];
  assert.deepEqual(filterByQuery(list, "夜航").map((s) => s.id), ["t"]);
  assert.deepEqual(filterByQuery(list, "某歌手").map((s) => s.id), ["a"]);
  assert.deepEqual(filterByQuery(list, "专辑名").map((s) => s.id), ["b"]);
  assert.deepEqual(filterByQuery(list, "flac").map((s) => s.id), ["e"]);
});

test("filterByQuery：大小写不敏感（查询与数据两侧）", () => {
  const list = [hay({ id: "x", title: "TEST" }), hay({ id: "y", title: "test" })];
  assert.deepEqual(filterByQuery(list, "test").map((s) => s.id), ["x", "y"]);
  assert.deepEqual(filterByQuery(list, "TeSt").map((s) => s.id), ["x", "y"]);
});

test("filterByQuery：不跨界误命中（分隔符生效）", () => {
  // 这两首在「无分隔符拼接」下都会变成 "abc"，用 "bc" 查会两首都命中。
  // 正确语义：title 命中任一字段即算，两首本来就都该命中 —— 所以换一个
  // 只有跨界才能命中的查询来钉住分隔符。
  const list = [hay({ id: "1", title: "ab", artist: "c" }), hay({ id: "2", title: "a", artist: "bc" })];
  // "ab" + "c" 跨界拼成 "abc"：查 "bc" 时，第 1 首的 title "ab" 不含、artist "c" 不含 ⇒ 不该命中
  assert.deepEqual(filterByQuery(list, "bc").map((s) => s.id), ["2"]);
  assert.deepEqual(filterByQuery(list, "abc").map((s) => s.id), []);
});

test("filterByQuery：查询串含分隔符时退回逐字段比较（不误命中全部）", () => {
  const list = [hay({ id: "1", title: "abc" }), hay({ id: "2", title: "xyz" })];
  // \0 出现在索引拼接处，走索引会让 includes("\0") 命中所有歌曲。
  assert.deepEqual(filterByQuery(list, "\u0000").map((s) => s.id), []);
});

test("filterByQuery：查询词首尾空格被 trim", () => {
  const list = [hay({ id: "1", title: "abc" })];
  assert.deepEqual(filterByQuery(list, "  abc  ").map((s) => s.id), ["1"]);
});

test("filterByQuery：索引按曲库引用失效（换一批歌后结果正确）", () => {
  const first = [hay({ id: "1", title: "aaa" })];
  assert.deepEqual(filterByQuery(first, "aaa").map((s) => s.id), ["1"]);
  // 整体替换（store 的约定），旧索引必须失效
  const second = [hay({ id: "2", title: "bbb" })];
  assert.deepEqual(filterByQuery(second, "aaa").map((s) => s.id), []);
  assert.deepEqual(filterByQuery(second, "bbb").map((s) => s.id), ["2"]);
});

test("filterByQuery：1 万首规模结果与逐字段实现一致", () => {
  const songs = Array.from({ length: 10_000 }, (_, i) =>
    hay({ id: `s${i}`, title: `歌曲标题${i}`, artist: `歌手${i % 200}`, album: `专辑${i % 500}`, ext: "flac" })
  );
  const naive = (list, q) => {
    const query = q.trim().toLowerCase();
    return list.filter(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        s.artist.toLowerCase().includes(query) ||
        s.album.toLowerCase().includes(query) ||
        s.ext.toLowerCase().includes(query)
    );
  };
  for (const q of ["歌3", "歌手7", "专辑42", "flac", "zzz", "FLAC"]) {
    assert.deepEqual(
      filterByQuery(songs, q).map((s) => s.id),
      naive(songs, q).map((s) => s.id),
      `查询 ${q} 的索引实现与逐字段实现结果不一致`
    );
  }
});
