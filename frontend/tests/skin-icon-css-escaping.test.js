/* ==========================================================================
   skin-icon-css-escaping.test.js — 样式包图标地址的 CSS 注入守卫

   对应第六轮审查 §2.7「皮肤 `icon.file` 未编码即写进 inline style」。

   数据流：`skin.json` 的 `icon.file`（第三方样式包提供）
        → playerhost.js 拼成 `/skins/<id>/<file>?t=…`
        → `ui/playerview.js#skinIcon` / `ui/settings-view.js#skinIcon`
        → 写成元素 style 属性里的 `--skin-icon:url("…")`

   注入点就是最后一步：地址里出现 `")` 就能闭合字符串，把后面的内容变成
   新的 CSS 声明。修法是 `utils.js#cssUrl`（CSS 字符串转义）+ 两个组件都改用它。

   这里同时守住两件事：
     1. `cssUrl` 本身的转义行为（可执行的单元断言）；
     2. 两个组件**确实**用了它 —— 渲染需要浏览器，所以这一半读源码文本
        （与 no-dead-events.test.js 同一个套路）。
   ========================================================================== */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cssUrl } from "../src/js/utils.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, "..", "src", "js");

/** 数出没有被 `\` 转义的双引号个数。 */
function unescapedQuotes(s) {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] !== '"') continue;
    let backslashes = 0;
    for (let j = i - 1; j >= 0 && s[j] === "\\"; j -= 1) backslashes += 1;
    if (backslashes % 2 === 0) n += 1;
  }
  return n;
}

test("cssUrl：正常地址原样包进 url()", () => {
  assert.equal(cssUrl("/skins/classic/assets/icon.svg?t=abc"), 'url("/skins/classic/assets/icon.svg?t=abc")');
  assert.equal(cssUrl(""), 'url("")');
});

test("cssUrl：转义双引号与反斜杠", () => {
  assert.equal(cssUrl('a"b'), 'url("a\\"b")');
  assert.equal(cssUrl("a\\b"), 'url("a\\\\b")');
  // 反斜杠在前、引号在后时不能互相抵消（`a\"` → `a\\\"`）
  assert.equal(cssUrl('a\\"b'), 'url("a\\\\\\"b")');
});

test("cssUrl：控制字符（含换行）不进入 CSS 字符串", () => {
  assert.equal(cssUrl("a\nb"), 'url("a b")');
  assert.equal(cssUrl("a\r\nb"), 'url("a  b")');
  assert.equal(cssUrl("a\u0000b"), 'url("a b")');
  assert.ok(!cssUrl("a\nb").includes("\n"), "结果里不能有裸换行");
});

test("cssUrl：清单里的注入串闭不出字符串", () => {
  // 典型的 CSS 注入尝试：先闭合 url("…")，再追加自己的声明。
  const evil = 'x") ; background:url(http://evil.example/p.png); /*';
  const out = cssUrl(evil);

  // 整个值里只有最外层那两个（未转义的）引号 —— 注入串里的引号都被转义了。
  assert.equal(unescapedQuotes(out), 2, `引号没有被完全转义：${out}`);
  assert.ok(out.startsWith('url("x\\"'), `前缀不对：${out}`);
  // 转义后的 `"` 不再闭合字符串，所以后面那段只能是字符串内容。
  assert.ok(out.includes('\\") ; background'), `可疑的输出：${out}`);
});

test("两个 skinIcon 都必须用 cssUrl 拼 --skin-icon", () => {
  for (const rel of ["ui/playerview.js", "ui/settings-view.js"]) {
    const src = readFileSync(path.join(srcDir, rel), "utf8");
    assert.match(src, /--skin-icon:\$\{cssUrl\(/, `${rel}: --skin-icon 必须用 cssUrl(...) 拼，不能直接插地址`);
    // 反面：`url("${…}")` 这种旧写法不许再出现（它就是这条审查的缺陷）。
    assert.ok(!/url\("\$\{/.test(src), `${rel}: 仍在用 url("\${…}") 直接插第三方地址`);
    assert.ok(
      /import \{[^}]*\bcssUrl\b[^}]*\} from "\.\.\/utils\.js"/.test(src),
      `${rel}: 没有从 utils.js 导入 cssUrl`
    );
  }
});
