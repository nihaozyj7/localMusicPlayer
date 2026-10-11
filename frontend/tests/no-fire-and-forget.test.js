/* ==========================================================================
   no-fire-and-forget.test.js — 后端调用不许「没人接的 promise」
   --------------------------------------------------------------------------
   守的是一类反复出现、但每次都很隐蔽的写法：

     @click=${() => backend.xxx()}          ← 模板里直接 fire-and-forget
     if (song?.path) backend.yyy(song.path) ← 语句位置直接 fire-and-forget

   这类调用一旦 reject（目录被删、无权限、文件已不在、盘符掉线），**用户什么都
   看不到** —— 界面上像是什么都没发生，控制台里只有一条
   `Uncaught (in promise)`。而仓库的无头自检脚本（tools/cdp-check.js 等）
   正是按「控制台有没有报错」判失败的，所以这类写法还会污染自检结果。

   真实案例（本次修的）：
     · 封面面板「打开缓存目录」是裸调用，而设置页里**同一个动作**是有
       toast 的 —— 同一个功能两处表现不一致，用户以为按钮坏了；
     · 皮肤宿主的「在文件夹中显示」是裸调用，而曲目表的同名动作
       （tracks.js）是 await + 成功/失败提示。

   正确写法只有两种：`await` + try/catch（配 toast），或 `.catch(...)`。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..", "src");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

/**
 * 去掉注释再扫描：说明「不要这么写」的注释里往往**正好**含有那个写法
 * （本次就踩了：openCacheDir 的注释里引用了旧的 @click 写法，守卫立刻误报）。
 * 不处理字符串里的 //，这些文件的输入足够简单。
 */
function stripComments(src) {
  return src
    // 块注释要保留其中的换行（换成等量的空格），否则报出来的行号会整体偏移，
    // 把人指到错误的行上 —— 本来就是为了让人一眼找到问题所在。
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("模板事件处理器里不许直接调用后端", () => {
  // Lit 的 @click=${() => ...} 不会 await 返回值，也没有任何地方能接住拒绝。
  const bad = [];
  const re = /@(?:click|change|input|submit|keydown)=\$\{\(\)\s*=>\s*backend\.([A-Za-z]+)/g;
  for (const file of walk(srcRoot)) {
    const src = stripComments(readFileSync(file, "utf8"));
    for (const m of src.matchAll(re)) {
      const line = src.slice(0, m.index).split("\n").length;
      bad.push(`${file.slice(srcRoot.length + 1)}:${line} → backend.${m[1]}()`);
    }
  }
  assert.deepEqual(
    bad,
    [],
    "模板里直接调用后端会让失败无声无息（只有控制台的 Uncaught in promise）；" +
      `请改成方法 + await/try-catch 或 .catch()：\n  ${bad.join("\n  ")}`
  );
});

test("皮肤宿主的「在文件夹中显示」必须接住拒绝", () => {
  // 这条是上面规则的特例：它不在模板里（是皮肤 action），所以上面那条抓不到。
  // 文件已被删除时后端会 reject，未处理的拒绝会污染控制台与自检结果。
  const src = readFileSync(join(srcRoot, "js", "playerhost.js"), "utf8");
  const at = src.indexOf("openFolder()");
  assert.ok(at > 0, "playerhost.js 里找不到 openFolder（改名了？）");
  const body = src.slice(at, at + 900);
  assert.ok(
    /revealInExplorer\([^)]*\)\s*\.\s*catch\(/.test(body),
    "openFolder 里的 revealInExplorer 必须 .catch()：文件已不在时后端会 reject，" +
      "未处理的拒绝会让用户什么提示都没有、控制台却报错"
  );
});

test("设置页与封面面板的「打开缓存目录」都要给失败提示", () => {
  // 同一个后端动作在两个界面里必须有一致的失败反馈。
  const settings = readFileSync(join(srcRoot, "js", "settings.js"), "utf8");
  assert.ok(
    /coverOpenCacheDir[\s\S]{0,200}?catch/.test(settings),
    "设置页的打开缓存目录应当 try/catch + toast"
  );
  const cover = readFileSync(join(srcRoot, "js", "ui", "cover.js"), "utf8");
  assert.ok(
    /async openCacheDir\(\)[\s\S]{0,400}?catch/.test(cover),
    "封面面板的打开缓存目录应当 try/catch + toast（与设置页保持一致）"
  );
});
