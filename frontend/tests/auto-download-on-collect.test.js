/* ==========================================================================
   auto-download-on-collect.test.js — 收藏「只有试听缓存」的在线歌曲时补一份本地文件
   --------------------------------------------------------------------------
   需求（用户原话）：「用户如果点击播放列表中的，没有下载的缓存歌曲为"我喜欢"
   或者加入歌单的操作时，自动将歌曲下载到本地」。

   这里守住四件事：
     1. 判据（纯函数 collectDownloadReason）：只有「在线 + 有缓存 + 没下载 + 开关开」
        才下载 —— 本地歌 / 没试听过的 / 已经有的都不该悄悄产生流量；
     2. bvid 抽取（bvidOf）：`bili:` 前缀与 bvid 字段两条路，取不到就别下；
     3. store 侧真的会通知钩子：收藏（新增时）与加入歌单（新增的那几首）各一次，
        取消收藏 / 重复添加**不**通知；
     4. 装配：main.js 真的装了这个钩子，设置里有开关、配置键三处同步。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { bvidOf, collectDownloadReason } from "../src/js/auto-download.js";
import { addSongsToPlaylist, createPlaylist, setCollectHook, state, toggleLike } from "../src/js/store.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => readFileSync(join(root, ...p), "utf8");
const mainSrc = read("frontend", "src", "js", "main.js");
const viewSrc = read("frontend", "src", "js", "ui", "settings-view.js");
const storeSrc = read("frontend", "src", "js", "store.js");
const goConfig = read("internal", "bootstrap", "config.go");
const goPatch = read("services.go");

/* --------------------------------------------------------------------------
   1. bvid 抽取
   -------------------------------------------------------------------------- */

test("bvidOf：搜索结果带 bvid，在线曲目 id 是 bili: 前缀", () => {
  assert.equal(bvidOf({ bvid: "BV1xx411c7mD" }), "BV1xx411c7mD");
  assert.equal(bvidOf({ id: "bili:BV1xx411c7mD" }), "BV1xx411c7mD");
  assert.equal(bvidOf({ id: "C:\\Music\\a.mp3" }), "", "本地曲目没有 bvid");
  assert.equal(bvidOf({ id: "bili:" }), "", "空 bvid 不算在线曲目（后端也会拒掉这类 id）");
  assert.equal(bvidOf(null), "");
});

test("bvidOf：bvid 字段优先于 id（搜索结果两者都有时）", () => {
  assert.equal(bvidOf({ bvid: "BVreal", id: "bili:BVother" }), "BVreal");
});

/* --------------------------------------------------------------------------
   2. 判据
   -------------------------------------------------------------------------- */

test("该下载：在线 + 有试听缓存 + 没下载过 + 开关开", () => {
  const song = { id: "bili:BV1xx411c7mD", title: "晴天" };
  assert.equal(collectDownloadReason(song, true, false, true), "ok");
});

test("开关关着 → 不下载（用户明确关过，不能悄悄花流量）", () => {
  const song = { id: "bili:BV1xx411c7mD" };
  assert.equal(collectDownloadReason(song, true, false, false), "disabled");
});

test("本地曲目 → 不下载（本来就有文件）", () => {
  assert.equal(collectDownloadReason({ id: "C:\\Music\\a.mp3" }, true, false, true), "local");
});

test("没试听过（没有缓存）→ 不下载：需求限定的是「没有下载的**缓存**歌曲」", () => {
  const song = { id: "bili:BV1xx411c7mD" };
  assert.equal(collectDownloadReason(song, false, false, true), "not-cached");
});

test("已经下载过 → 不下载（哪怕缓存也在）", () => {
  const song = { id: "bili:BV1xx411c7mD" };
  assert.equal(collectDownloadReason(song, true, true, true), "downloaded");
});

test("台账说 false / undefined 时都按「没有」处理（宁可多下一次，也不能漏）", () => {
  const song = { id: "bili:BV1xx411c7mD" };
  assert.equal(collectDownloadReason(song, true, undefined, true), "ok");
  assert.equal(collectDownloadReason(song, undefined, false, true), "not-cached");
});

/* --------------------------------------------------------------------------
   3. store 侧的通知（真实调用，不是源码匹配）
   -------------------------------------------------------------------------- */

const SONG = "bili:BVhook0001";
state.onlineSongs.set(SONG, { id: SONG, bvid: "BVhook0001", title: "钩子测试" });

test("收藏一首在线歌 → 钩子收到一次（reason=like）", () => {
  const calls = [];
  setCollectHook((song, reason) => calls.push([song.id, reason]));
  try {
    const liked = state.likedIds.has(SONG);
    toggleLike(SONG);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [SONG, "like"]);
    assert.equal(state.likedIds.has(SONG), !liked, "收藏状态本身也要真的变了");
    toggleLike(SONG); // 复原
  } finally {
    setCollectHook(null);
  }
});

test("取消收藏**不**通知钩子（那不该触发任何下载）", () => {
  const calls = [];
  setCollectHook((song, reason) => calls.push([song.id, reason]));
  try {
    toggleLike(SONG); // 先收藏（这次会通知）
    calls.length = 0;
    toggleLike(SONG); // 取消收藏
    assert.equal(calls.length, 0, "取消收藏不该补下载");
  } finally {
    setCollectHook(null);
  }
});

test("加入歌单：只通知**这次真的加进去**的那些", async () => {
  const calls = [];
  setCollectHook((song, reason) => calls.push([song.id, reason]));
  try {
    // createPlaylist 是异步的（真实后端下 id 由后端生成，见 store.js 的说明）
    const pl = await createPlaylist("钩子测试歌单");
    assert.ok(pl?.id, "测试需要能建歌单（拿到 id）");
    addSongsToPlaylist(pl.id, [SONG]);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [SONG, "playlist"]);
    calls.length = 0;
    addSongsToPlaylist(pl.id, [SONG]); // 重复添加
    assert.equal(calls.length, 0, "重复添加同一首不该再触发一次下载");
  } finally {
    setCollectHook(null);
  }
});
test("钩子抛异常不能影响收藏本身（store 必须吞掉）", () => {
  setCollectHook(() => {
    throw new Error("钩子炸了");
  });
  try {
    toggleLike(SONG);
    assert.equal(state.likedIds.has(SONG), true, "钩子出错也要收藏成功");
    toggleLike(SONG);
  } finally {
    setCollectHook(null);
  }
});

/* --------------------------------------------------------------------------
   4. 装配与配置键
   -------------------------------------------------------------------------- */

test("main.js 装配了钩子；store 侧只提供 setCollectHook（分层）", () => {
  assert.match(mainSrc, /import \{ installCollectAutoDownload \} from "\.\/auto-download\.js";/);
  assert.match(mainSrc, /installCollectAutoDownload\(\);/, "装了但没调用 = 功能不存在");
  assert.match(storeSrc, /export function setCollectHook\(/);
  assert.doesNotMatch(
    storeSrc,
    /from "\.\/auto-download\.js"/,
    "store 是底层状态模块，不能反过来 import 下载模块（同 setUserPlayProbe 的分层）"
  );
});

test("设置里有开关，且配置键三处同步（Go 字段 / applyPatch / SYNCED_KEYS）", () => {
  assert.match(
    viewSrc,
    /"autoDownloadOnCollect",\s*\n\s*state\.config\.autoDownloadOnCollect !== false/,
    "开关要按「只有显式 false 才算关」渲染（与 bootstrap 的默认值一致）"
  );
  assert.match(goConfig, /AutoDownloadOnCollect bool `json:"autoDownloadOnCollect"`/);
  assert.match(goPatch, /case "autoDownloadOnCollect":/);
  assert.match(storeSrc, /"autoDownloadOnCollect",/, "漏进 SYNCED_KEYS 就会「改了设置、重启就没了」");
});

test("自动下载失败只记日志，不弹错误（收藏本身已经成功了）", () => {
  const src = read("frontend", "src", "js", "auto-download.js");
  assert.match(src, /console\.warn\("\[auto-download\] 自动下载失败（收藏本身已生效）"/);
});
