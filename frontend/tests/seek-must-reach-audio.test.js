/* ==========================================================================
   seek-must-reach-audio.test.js — 跳转必须同时作用到播放链路
   --------------------------------------------------------------------------
   用户报的现象：「微调界面点歌词，进度条跳一下又跳回去」。

   根因是两层调用被当成了一个：

     store.js#seek(ms)      只改 state.position + emit("player:seek")，
                            而那个事件**一个订阅者都没有**；
     audio.js#seekAudio(ms) 真正让后端跳转，并且把本地锚点前移 ——
                            不前移的话，下一次位置外推（后端每 500ms 推锚点）
                            就会按**旧位置**把 state.position 覆盖回去。

   两者合起来才是 audio.js#seekTo(ms)。只调 store.seek 的跳转必然是
   「进度条动一下 → 下一次进度通知按真实播放位置重算 → 弹回原处」，
   听感上就是「点了没反应」。

   修法：界面里所有跳转（微调预览点行、编辑页点行、编辑页 −5s/+5s）一律
   走 audio.js#seekTo。

   audio.js 依赖 DOM，没法在 node:test 里直接 import，所以这里用**源码扫描**
   把它守住（与 no-fire-and-forget.test.js 同一套路）：
     · 除 audio.js，谁都不许从 store.js 里 import `seek`；
     · 除 audio.js / store.js，谁的源码里都不许出现 `seek(...)` 调用。
   皮肤契约里的 ctx.actions.seek（playerhost.js）、预览桩
   （desktop-wallpaper-window.js）都是**方法定义**而不是调用，扫描里放过。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..", "src");

/** 允许直接碰 store.seek 的文件：store 自己定义它，audio 用它拼出 seekTo */
const ALLOWED = new Set(["js/store.js", "js/audio.js"]);

const rel = (file) => relative(srcRoot, file).split(sep).join("/");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

/** 去掉注释再扫描：解释这条规则的注释里正好会写出被禁的写法 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("除 audio.js 外，没有模块从 store.js 取 seek", () => {
  const bad = [];
  const re = /import\s*\{[^}]*\bseek\b[^}]*\}\s*from\s*["'][^"']*store\.js["']/;
  for (const file of walk(srcRoot)) {
    const name = rel(file);
    if (ALLOWED.has(name)) continue;
    if (re.test(stripComments(readFileSync(file, "utf8")))) bad.push(name);
  }
  assert.deepEqual(
    bad,
    [],
    "store.seek 只改状态、不会真的跳转（进度条会弹回原处）；" +
      `请改用 audio.js#seekTo：\n  ${bad.join("\n  ")}`
  );
});

test("除 audio.js 外，源码里没有裸的 seek(...) 调用", () => {
  const bad = [];
  // 只认两种危险写法：语句位置 seek(...); 与模板箭头 () => seek(...
  // 方法定义 seek(ms) { / seek() {}, 不匹配（契约里的 ctx.actions.seek 就是这种）
  const patterns = [/(?<![.\w])seek\s*\([^;{}]*\)\s*;/g, /=>\s*seek\s*\(/g];
  for (const file of walk(srcRoot)) {
    const name = rel(file);
    if (ALLOWED.has(name)) continue;
    const src = stripComments(readFileSync(file, "utf8"));
    for (const re of patterns) {
      for (const m of src.matchAll(re)) {
        const line = src.slice(0, m.index).split("\n").length;
        bad.push(`${name}:${line} → ${m[0].trim()}`);
      }
    }
  }
  assert.deepEqual(
    bad,
    [],
    "跳转要用 audio.js#seekTo（seek + seekAudio）；" +
      `只调 store.seek 的跳转会被下一次进度通知拉回去：\n  ${bad.join("\n  ")}`
  );
});
