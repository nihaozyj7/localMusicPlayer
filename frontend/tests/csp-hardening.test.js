/* ==========================================================================
   csp-hardening.test.js — 页面 CSP 的机械守卫

   对应第六轮审查 §2.5（登记项 16 的第一条）。要点不是「有没有写 CSP」，
   而是四条**容易悄悄改回去**的具体约束：

     1. `connect-src` 里不许出现裸 `ws:` —— 裸方案名 = 允许连任意目标的
        WebSocket。同源页面里跑着第三方样式包的 JS，而 fetch / img 都被
        `'self'` 锁死，于是它是唯一的数据外发通道。同源的 HMR 由 `'self'`
        覆盖（CSP3 对 ws:/wss: 按同主机同端口匹配）。
     2. `object-src 'none'` / `base-uri 'self'` / `form-action 'none'` 三件套
        必须在位（不加载插件对象、不靠 <base>、没有表单）。
     3. `frame-ancestors` **不许**写进 <meta>：它只认响应头，写在 meta 里会被
        浏览器忽略（控制台还会报警告）。它由 Go 侧 HTML 响应头提供。
     4. 于是在制品（`frontend/dist/*.html`）里也必须看不到 `ws:`。

   三份页面都要查：主界面之外还有两个独立窗口页（桌面歌词 / 桌面背景歌词），
   它们同样是同源执行环境。
   ========================================================================== */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(here, "..");
const srcDir = path.join(frontendDir, "src");

/** 三份页面 + 它们各自的 CSP 常量。 */
const PAGES = ["index.html", "lyrics.html", "wallpaper.html"];

/** 取出一份页面里的 CSP meta（含 content 值）。 */
function cspOf(file) {
  const html = readFileSync(path.join(srcDir, file), "utf8");
  const m = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/);
  assert.ok(m, `${file} 里找不到 Content-Security-Policy 元标签`);
  return { html, content: m[1] };
}

test("页面 CSP：connect-src 不许有裸 ws:，且补齐三件套", () => {
  for (const file of PAGES) {
    const { content } = cspOf(file);

    assert.ok(content.includes("connect-src 'self'"), `${file}: connect-src 必须正好是 'self'`);
    // 裸 ws:（或 wss:）—— 允许任意目标。这是这条守卫的正题。
    assert.ok(
      !/connect-src[^;]*\bwss?:/i.test(content),
      `${file}: connect-src 里出现了裸 ws:/wss:（等于允许任意目标的 WebSocket 外连）`
    );
    for (const directive of ["object-src 'none'", "base-uri 'self'", "form-action 'none'"]) {
      assert.ok(content.includes(directive), `${file}: CSP 缺少 ${directive}`);
    }
  }
});

test("frame-ancestors 不进 <meta>（它只认响应头）", () => {
  for (const file of PAGES) {
    const { html, content } = cspOf(file);
    assert.ok(
      !content.includes("frame-ancestors"),
      `${file}: frame-ancestors 写在 <meta> 里会被浏览器忽略，必须由 Go 侧响应头提供`
    );
    assert.ok(html.includes("frame-ancestors"), `${file}: 应当有一条注释说明 frame-ancestors 为什么不在 meta 里`);
  }

  // 另一半（「Go 侧确实给 HTML 响应加了这个头」）由 Go 的**行为**用例兜着：
  // `document_csp_test.go#TestSetDocumentCSPHeaderOnlyForDocuments` —— 它量的是
  // 哪些路径带上了头，而不是「main.go 里有没有那句话」（后者只要把代码注释掉
  // 就会假通过，本条的第一次反证正是踩到这个坑）。
});

test("构建产物里的 CSP 同样不含 ws:", () => {
  const built = path.join(frontendDir, "dist", "index.html");
  if (!existsSync(built)) {
    // dist 是入库产物；缺失说明还没构建过。不算失败，但要有痕迹。
    console.warn("[csp] frontend/dist/index.html 不存在，跳过制品检查");
    return;
  }
  const html = readFileSync(built, "utf8");
  const m = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/);
  assert.ok(m, "dist/index.html 里找不到 CSP 元标签");
  assert.ok(
    !/connect-src[^;]*\bwss?:/i.test(m[1]),
    "dist/index.html 的 connect-src 仍有裸 ws:（源码改了但没重建产物？）"
  );
});
