/* ==========================================================================
   online-cache.test.js — 播放队列引用上报（空闲清理的输入之一）
   --------------------------------------------------------------------------
   需求（用户原话）：「对于没有被播放列表和歌单引用的歌曲，在空闲时间可能会
   触发清理」。

   歌单在后端配置里，后端自己读得到；**播放列表（队列）只在前端**，所以这一份
   引用必须由前端推给后端。推错的两个方向都有代价：

     · 推多了（把本地曲目也当成在线曲目）：后端白建一堆用不上的引用，
       而且「本地曲目」的 id 与在线 id 长得不一样，混进去只会污染集合；
     · 推少了（漏掉队列里的在线歌）：空闲清理会把它当成「没人引用」，
       闲置够久就删掉 —— 用户下次从队列点它要重新下载一遍。

   这里盯的是 `queueOnlineIDs` 这个纯函数（挑哪些 id、去重、顺序稳定）。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { queueOnlineIDs } from "../src/js/online-cache.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

test("queueOnlineIDs：只挑 bili: 前缀的在线歌曲", () => {
  const queue = [
    { id: "bili:BV1xx411c7mD", title: "在线歌" },
    { id: "D:\\Music\\a.flac", title: "本地歌" },
    { id: "liked", title: "不是歌曲" },
    { id: "bili:BV1yy411c7mE", title: "又一在线歌" },
  ];
  assert.deepEqual(queueOnlineIDs(queue), ["bili:BV1xx411c7mD", "bili:BV1yy411c7mE"]);
});

test("queueOnlineIDs：去重且顺序稳定（同一首出现两次）", () => {
  const queue = [{ id: "bili:BVa" }, { id: "bili:BVb" }, { id: "bili:BVa" }];
  assert.deepEqual(queueOnlineIDs(queue), ["bili:BVa", "bili:BVb"]);
  // 同样的队列必须给出同样的字符串（模块里靠它做「没变就不推」）
  assert.equal(queueOnlineIDs(queue).join("\n"), queueOnlineIDs(queue).join("\n"));
});

test("queueOnlineIDs：空 / 异常输入不抛异常", () => {
  assert.deepEqual(queueOnlineIDs([]), []);
  assert.deepEqual(queueOnlineIDs(undefined), []);
  assert.deepEqual(queueOnlineIDs(null), []);
  assert.deepEqual(queueOnlineIDs([null, {}, { id: 42 }, { id: "" }]), []);
  // 字符串元素也算（队列里存的是歌曲对象，但历史快照里出现过裸 id）
  assert.deepEqual(queueOnlineIDs(["bili:BVz"]), ["bili:BVz"]);
});

test("queueOnlineIDs：不接受只有前缀、没有 id 的假在线曲目", () => {
  // "bili:" 后面是空的 —— 后端 onlineBVID 也会判成无效，这里同样不该推
  assert.deepEqual(queueOnlineIDs([{ id: "bili:" }]), []);
});

test("上报：订阅 store，且队列没变时不重复推", () => {
  const src = read("frontend/src/js/online-cache.js");
  assert.match(src, /subscribe\(push\)/, "要订阅 store 才能跟着队列变化");
  assert.match(src, /if \(key === lastKey\) return;/, "队列没变就不能重复推（进度广播很频繁）");
  assert.match(src, /backend\.onlineProtectIDs\(ids\)/, "最终要推给后端");
  // 失败只降级，绝不打断播放链路
  assert.match(src, /\.catch\(/, "推送失败必须被吞掉");
});

test("bridge：ProtectIDs / CleanupCache 都映射到生成的绑定", () => {
  const bridge = read("frontend/src/js/bridge.js");
  assert.match(bridge, /onlineProtectIDs: \(ids\) => call\(bindings\?\.Online\?\.ProtectIDs, ids\)/);
  assert.match(bridge, /onlineCleanupCache: \(\) => call\(bindings\?\.Online\?\.CleanupCache\)/);

  const binding = read("frontend/bindings/localmusicplayer/onlineservice.js");
  assert.match(binding, /export function ProtectIDs\(ids\)/);
  assert.match(binding, /export function CleanupCache\(\)/);
  assert.match(binding, /\$Call\.ByID\(\d+, ids\)/, "带参数的方法要有数值方法 id");
});

test("main.js 会启用上报（漏了这一步 = 队列引用永远传不到后端）", () => {
  const main = read("frontend/src/js/main.js");
  assert.match(main, /import \{ initOnlineCacheSync \} from "\.\/online-cache\.js"/);
  assert.match(main, /initOnlineCacheSync\(\);/, "装配阶段必须调用它");
});
