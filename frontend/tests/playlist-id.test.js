/* ==========================================================================
   playlist-id.test.js — 歌单 id 必须在前后端之间对齐
   --------------------------------------------------------------------------
   守的是一个**静默丢失用户数据**的 bug：

     前端新建歌单时自己造 id（uid("pl")），后端 Create 又生成另一个
     （bootstrap.RandomID("pl")）。之后前端带自己的 id 调 AddSongs，
     后端匹配不到这个歌单 —— 旧实现返回 (0, nil)，不报错也不加歌。
     界面显示「已添加 5 首到『新歌单』」，config.json 里一首都没有：
     重启后新歌单是空的，日志里没有任何线索。

   为什么是**源码断言**而不是行为测试：bridge.js 的 `active`（是否连上后端）
   是模块私有变量，没有测试钩子；而真实 bindings 会 import `/wails/runtime.js`
   （绝对路径，Node 里必然失败）。本仓库对「跨语言接线」一律用这种断言
   （见 track-switch.test.js / update.test.js 对 bridge.js 的检查）。
   后端那一侧的行为由 services_playlist_test.go 真正跑起来验证。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

/** 截出一个顶层导出函数的函数体（按大括号配对，够用且不引依赖） */
function functionBody(src, signature) {
  const at = src.indexOf(signature);
  assert.ok(at >= 0, `源码里找不到 ${signature}`);
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  assert.fail(`${signature} 的大括号没有配对`);
}

test("store.js：createPlaylist 必须等后端返回 id 再入库", () => {
  const src = read("frontend/src/js/store.js");
  const body = functionBody(src, "export async function createPlaylist");

  const awaitAt = body.indexOf("await backend.createPlaylist(");
  assert.ok(awaitAt >= 0, "createPlaylist 没有 await 后端的 createPlaylist（id 会对不上）");

  // 必须采用后端返回的 id，而不是只用自己造的那个
  assert.match(body, /created\?\.id/, "createPlaylist 没有采用后端返回的 id");
  assert.match(body, /id = created\.id/, "createPlaylist 没有把后端 id 赋给新歌单");

  // 入库必须发生在 await 之后：先入库再换 id 会留下一段「后端不知道」的窗口期，
  // 这期间的加歌调用全部无效。
  const insertAt = body.indexOf("state.playlists = [...state.playlists, pl]");
  assert.ok(insertAt > awaitAt, "createPlaylist 在拿到后端 id 之前就入库了");
});

test("store.js：movePlaylist 必须把新顺序同步到后端", () => {
  const src = read("frontend/src/js/store.js");
  const body = functionBody(src, "export function movePlaylist");
  assert.match(body, /backend\.reorderPlaylists\(from, to\)/, "movePlaylist 没有同步后端（拖拽重排重启就丢）");
  assert.match(body, /syncToBackend\(/, "movePlaylist 的后端调用没有走 syncToBackend（失败会静默）");
});

test("store.js：歌单内拖拽排序的后端调用不能是 fire-and-forget", () => {
  const src = read("frontend/src/js/store.js");
  const body = functionBody(src, "export function reorderQueue");
  assert.match(body, /syncToBackend\([^)]*reorderPlaylist/, "reorderQueue 的后端调用没有走 syncToBackend");
});

test("bridge.js：重排歌单的绑定必须接上", () => {
  const src = read("frontend/src/js/bridge.js");
  for (const method of ["reorderPlaylist", "reorderPlaylists"]) {
    assert.ok(src.includes(`${method}:`), `bridge.js 缺少 ${method} 的接线`);
  }
  assert.match(src, /Playlist\?\.ReorderPlaylists/, "reorderPlaylists 没有接到 PlaylistService.ReorderPlaylists");
});

test("playlists.js：新建歌单弹层必须 await createPlaylist", () => {
  const src = read("frontend/src/js/playlists.js");
  assert.match(src, /const pl = await createPlaylist\(name\)/, "弹层没有 await createPlaylist（拿到的是 Promise）");
  assert.match(src, /if \(!pl\) return /, "弹层没有处理「后端创建失败」的分支");
});

test("services.go：歌单 id 匹配不到时必须报错，不能返回 (0, nil)", () => {
  const src = read("services.go");
  for (const signature of [
    "func (s *PlaylistService) AddSongs(",
    "func (s *PlaylistService) RemoveSongs(",
    "func (s *PlaylistService) Reorder(",
  ]) {
    const body = functionBody(src, signature);
    assert.match(
      body,
      /歌单不存在/,
      `${signature.slice(0, 45)}…) 没有对「id 匹配不到」返回错误 —— 前端会把静默无操作当成成功`,
    );
    assert.match(body, /found/, `${signature.slice(0, 45)}…) 没有记录「是否命中歌单」`);
  }
});
