/* ==========================================================================
   media-key-ready.test.js — 媒体键的就绪握手（N-12）必须两端都接上

   缺陷（第六轮审查 N-12，低）：后端的全局热键在 ApplicationStarted 就注册好了，
   而前端要等界面装配到 media-keys.js#startMediaKeys 那一行才挂得上监听。
   这段时间里 emitter **早就注入过了**（装配区一行 setEmitter），于是 dispatch 的
   旧判据 `emit != nil` 成立 → 事件发出去没人听，退化到引擎的那条路走不到，
   用户在这一秒里按 ⏯ 毫无反应。

   修法（两端缺一不可）：
     · Go 侧：判据换成「前端有没有报到」（MediaKeyService#FrontendReady），
       未报到时退化到直接操作引擎 —— 行为测试在 services_mediakey_test.go
       （TestMediaKeyDispatchFallsBackBeforeFrontendReady）；
     · 前端侧：挂上监听**之后**调一次 backend.mediaKeysReady()，并且经
       bridge.js 的映射打到生成的绑定上。

   这个文件守的是前端这一侧的三段接线 + 生成物里的入口。它们全是**字符串键**
   （bridge.js 手写映射、bindings 生成物），断掉不会有任何构建错误，只会静默变回
   「启动那一秒按 ⏯ 没反应」—— 正是本条目要修的现象。
   ========================================================================== */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

/**
 * 去掉注释再扫描：说明「不要这么写」的注释里往往**正好**含有那个写法。
 * 本次反证就踩了这个坑 —— 把报到调用整段注释掉时，源码断言照样通过，
 * 因为 `indexOf` 命中的是注释里那一行（`no-fire-and-forget.test.js` 里
 * 记着同一个教训）。块注释替换成等量空白以保住换行与行号。
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("media-keys.js：订阅挂上之后必须向后端报到（顺序不能反）", () => {
  const src = stripComments(read("frontend/src/js/media-keys.js"));

  const sub = src.indexOf('unsubscribe = on("media:key"');
  const ready = src.indexOf("backend.mediaKeysReady()");
  assert.ok(sub > 0, "media-keys.js 里找不到 media:key 的订阅语句");
  assert.ok(
    ready > 0,
    "startMediaKeys 没有调 backend.mediaKeysReady() —— 后端永远以为前端没就绪，媒体键会一直走引擎兜底"
  );
  assert.ok(sub < ready, "报到必须在**订阅之后**：先报到后挂监听的话，报到到订阅之间那几毫秒仍会丢键");

  // 后端没起来（浏览器预览 / 旧版 Go）时不许变成没人接的 promise
  const tail = src.slice(ready, ready + 320);
  assert.ok(
    /catch\(/.test(tail),
    "报到调用没有 .catch —— 后端缺席时会留下 Uncaught (in promise)（仓库门禁 no-fire-and-forget.test.js 盯的就是这类写法）"
  );
});

test("bridge.js：mediaKeysReady 必须打到 MediaKeys.FrontendReady", () => {
  const src = stripComments(read("frontend/src/js/bridge.js"));

  assert.ok(
    src.includes("mediaKeysReady: () => call(bindings?.MediaKeys?.FrontendReady)"),
    "bridge.js 里没有把 mediaKeysReady 映射到 MediaKeys.FrontendReady（漏了这行，报到永远静默失败）"
  );
  assert.ok(
    src.includes("MediaKeys: mod.MediaKeyService"),
    "bridge.js 的绑定映射里缺少 MediaKeys: mod.MediaKeyService（键名必须与 index.js 的导出名一致）"
  );
});

test("生成的绑定里确实有这个入口（重生成绑定后接线不能断）", () => {
  const svc = read("frontend/bindings/localmusicplayer/mediakeyservice.js");
  const index = read("frontend/bindings/localmusicplayer/index.js");

  assert.ok(
    /export function FrontendReady\(/.test(svc),
    "mediakeyservice.js 里没有 FrontendReady —— Go 侧没导出，或绑定没重新生成（wails3 generate bindings -b -i -clean=true）"
  );
  assert.ok(index.includes("MediaKeyService"), "bindings/index.js 没有导出 MediaKeyService —— bridge.js 拿不到它");
});

test("浏览器预览（没有 Wails 后端）下 startMediaKeys 不抛异常、也不留未处理的 promise", async () => {
  // 预览 / 后端缺席时 backend.mediaKeysReady() 走 call() 的「未连接」分支返回 null，
  // 于是 Promise.resolve(null).catch(...) 什么都不做 —— 报到这条新调用**不能**
  // 变成「预览下启动即抛」。这里只桩掉 window 的订阅接口，真的把模块跑一遍。
  const listeners = new Map();
  globalThis.window = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
    dispatchEvent: () => true,
  };
  const mod = await import("../src/js/media-keys.js");

  assert.doesNotThrow(() => mod.startMediaKeys(), "startMediaKeys 在无后端时抛异常了");
  assert.ok(
    listeners.has("dsh:media:key"),
    "没有挂上 dsh:media:key 监听（浏览器预览分支）—— 预览里按媒体键不会有反应"
  );
  // 等报到调用的 catch 链跑完：若有未处理的 reject，node:test 会把它算作失败
  await new Promise((resolve) => setTimeout(resolve, 20));

  mod.stopMediaKeys();
  assert.ok(!listeners.has("dsh:media:key"), "stopMediaKeys 没摘掉监听");
});

test("Go 侧判据以「前端报到」为准，而不是「有没有 emitter」", () => {
  const src = read("services_mediakey.go");

  assert.ok(
    src.includes("if emit != nil && ready {"),
    "dispatch 的判据不是「前端已报到 + 有 emitter」—— 只看 emit 的话，窗口期的事件会发给空气"
  );
  assert.ok(
    /if emit != nil && ready \{[\s\S]*?\n\t\}[\s\S]*?onToggle\(\)/.test(src),
    "未就绪时没有退化到 onToggle —— 那段窗口的按键会被静默吞掉"
  );
});
