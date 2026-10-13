/* ==========================================================================
   online-cache-cleanup-button.test.js — 设置里的「清理未引用的缓存」按钮
   --------------------------------------------------------------------------
   需求（用户原话）：「在线歌曲的缓存定期清理，改为在设置中添加一个缓存清理的
   按钮，这个按钮点击后会清理掉播放器中没有引用的缓存歌曲，比如还在播放列表
   的歌曲」。

   要点在「没有引用」四个字上：
     · 谁是「有引用」由**后端**判定（歌单 / 「我喜欢」在配置里，播放队列由
       online-cache.js 推过去，正在播放的那首由播放器自报）—— 前端不许再实现
       一遍这套判据，否则两处一定会分叉；
     · 回执必须说出「保留了几个还在引用里的」：用户点清理最想确认的就是
       「我收藏的没被删」。

   这里守住：回执文案（纯函数）、按钮的 id / data-act 契约（自检脚本按它查）、
   动作真的接到了后端、以及前端没有自己重写引用判据。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { cleanupResultText, onlineCacheSummaryText, queueOnlineIDs } from "../src/js/online-cache.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => readFileSync(join(root, ...p), "utf8");
const cacheSrc = read("frontend", "src", "js", "online-cache.js");
const settingsSrc = read("frontend", "src", "js", "settings.js");
const viewSrc = read("frontend", "src", "js", "ui", "settings-view.js");
const bridgeSrc = read("frontend", "src", "js", "bridge.js");

/* --------------------------------------------------------------------------
   1. 回执文案
   -------------------------------------------------------------------------- */

test("清理回执：删了几个、回收多少、保留了几个还在引用里的", () => {
  const text = cleanupResultText({ deleted: 3, bytes: 5 * 1024 * 1024, kept: 2 });
  assert.match(text, /已清理 3 个/);
  assert.match(text, /5\.0 MB/);
  assert.match(text, /保留 2 个还在播放列表 \/ 歌单 \/ 喜欢里的/, "必须说出保留了什么 —— 用户怕的就是清掉收藏的");
});

test("回执：一个都没删时说「没有可清理的」，而不是「已清理 0 个」", () => {
  const text = cleanupResultText({ deleted: 0, bytes: 0, kept: 4 });
  assert.match(text, /没有可清理/);
  assert.match(text, /4 个都还在引用中/);
  assert.doesNotMatch(text, /已清理 0 个/);
});

test("回执：没有引用时也不硬塞一句「保留 0 个」", () => {
  const text = cleanupResultText({ deleted: 2, bytes: 1024, kept: 0 });
  assert.doesNotMatch(text, /保留/);
});

test("回执：后端说没启用清理器时如实转达，不假装成功", () => {
  assert.match(cleanupResultText({ deleted: 0, skipped: "清理器未启用" }), /未清理：清理器未启用/);
});

test("缓存占用文案：还没拿到快照时说「正在读取…」", () => {
  assert.equal(onlineCacheSummaryText(null), "正在读取…");
  assert.equal(
    onlineCacheSummaryText({ stats: { count: 12, bytes: 3 * 1024 * 1024 } }),
    "已缓存 12 个试听文件，共 3.0 MB"
  );
});

/* --------------------------------------------------------------------------
   2. 引用判据只有后端一份（前端不重复实现）
   -------------------------------------------------------------------------- */

test("前端不许自己判断「歌单里的不能删」——只推队列、只按后端回执说话", () => {
  // 前端确实要推队列（队列只在前端），但歌单 / 收藏 / 正在播放的判定必须留在后端
  assert.doesNotMatch(cacheSrc, /state\.likedIds/, "「我喜欢」的引用集合在后端配置里，前端不该再算一遍");
  assert.doesNotMatch(cacheSrc, /state\.playlists/, "歌单同上");
  assert.match(cacheSrc, /backend\.onlineCleanupCache\(\)/, "清理必须走后端，前端删不了临时目录里的文件");
  assert.match(cacheSrc, /backend\.onlineCacheStats\(\)/, "占用要从后端读（统计口径与清理器必须同源）");
});

test("队列引用仍然由前端推（后端读不到 state.queue）", () => {
  assert.deepEqual(queueOnlineIDs([{ id: "bili:BV1" }, "bili:BV1", "C:\\a.mp3", "bili:"]), ["bili:BV1"]);
});

/* --------------------------------------------------------------------------
   3. 按钮契约与接线
   -------------------------------------------------------------------------- */

test("设置界面：按钮存在，且说明了会保留什么", () => {
  assert.match(viewSrc, /id="online-cache-block"/, "自检脚本/测试按这个 id 找它");
  assert.match(viewSrc, /data-act="online-cache-cleanup"/, "按钮的 data-act 是动作表的路由键");
  assert.match(viewSrc, /清理未引用的缓存/);
  assert.match(viewSrc, /还在播放列表、歌单或「我喜欢」里的会保留/, "必须在按钮旁写清保留规则，否则用户不敢点");
  assert.match(viewSrc, /onlineCacheSummaryText\(/, "要显示当前占用");
  assert.match(viewSrc, /onlineCacheSnapshot\(\)\.rev/, "占用是异步回来的，版本号必须进依赖数组，否则刷新后界面不动");
});

test("动作表把按钮接到后端，并刷新占用显示", () => {
  assert.match(settingsSrc, /case "online-cache-cleanup":\s*\n\s*await cleanupUnreferencedCache\(\);/);
  assert.match(
    settingsSrc,
    /import \{ refreshOnlineCacheStats, cleanupUnreferencedCache \} from "\.\/online-cache\.js";/
  );
  assert.match(settingsSrc, /void refreshOnlineCacheStats\(\)/, "打开设置层时要拉一次占用");
});

test("bridge：两个调用都指向 OnlineService 的对应方法", () => {
  assert.match(bridgeSrc, /onlineCleanupCache: \(\) => call\(bindings\?\.Online\?\.CleanupCache\)/);
  assert.match(bridgeSrc, /onlineCacheStats: \(\) => call\(bindings\?\.Online\?\.CacheStats\)/);
});

test("浏览器预览下点按钮只提示、不报错", () => {
  assert.match(cacheSrc, /if \(!isWails\(\)\) \{\s*\n\s*toast\("浏览器预览无法清理缓存"/);
});
