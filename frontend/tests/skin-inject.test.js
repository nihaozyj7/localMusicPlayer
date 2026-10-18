/* ==========================================================================
   skin-inject.test.js — 皮肤 CSS 注入：并发不能留下摘不掉的 <style>
   --------------------------------------------------------------------------
   审查确认的问题（P2）：injectSkinStyles 是「先 removeSkinStyles → await fetch
   → 再 append」三步。同一次会话里对同一个 skinId 有两个重叠的调用时，两次都
   通过了 remove 阶段，于是各 append 一份同名 <style>；而 styleEls 只记得最后
   一份，另一份**永远摘不掉**。真实触发路径：设置页「重新扫描样式」被点两次，
   或启动扫描还没结束就点了重扫（playerhost#reloadSkins 会把 skinsReady 置空，
   两次调用各扫一遍、每款样式各注入一次）。

   实测（CDP，真实 DOM，修复前）：并发组 10/10 命中「注入后 2 个 style，
   removeSkinStyles 后残留 1 个」；串行对照组 3/3 正常。
   修复后这两条不变量由本文件在 Node 里守住（DOM 用最小桩）。

   为什么用桩而不是浏览器：注入逻辑只用 document.head / createElement("style") /
   querySelectorAll("style[data-skin]") 这三样，桩足够；真实布局与 @scope 生效
   仍由无头自检负责（tools/check-player-host.mjs）。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

import { injectSkinStyles, removeSkinStyles, clearAllSkinStyles } from "@localmusicplayer/player-skins";

/* --------------------------------------------------------------------------
   最小 DOM 桩：只实现注入路径真正用到的那几样。
   querySelectorAll 直接把「当前挂在 head 上的 style」滤出来 —— 与真实选择器
   style[data-skin] 的语义一致。
   -------------------------------------------------------------------------- */
const attached = [];

function makeStyleEl() {
  const el = {
    tagName: "STYLE",
    dataset: {},
    textContent: "",
    /** 真实的 <style> 同时有 dataset 与 data-* 属性；生产代码用 getAttribute 读 */
    getAttribute(name) {
      return name === "data-skin" ? (el.dataset.skin ?? null) : null;
    },
    remove() {
      const i = attached.indexOf(el);
      if (i >= 0) attached.splice(i, 1);
    },
  };
  return el;
}

globalThis.document = {
  querySelectorAll(sel) {
    if (sel === "style[data-skin]") return attached.filter((el) => el.dataset?.skin !== undefined);
    return [];
  },
  createElement(tag) {
    if (tag === "style") return makeStyleEl();
    return {};
  },
  head: {
    appendChild(el) {
      attached.push(el);
      return el;
    },
  },
};

/** 装一个可控的 fetch；返回改不了的历史记录数组 */
function installFetch({ fail = false, delay = 5 } = {}) {
  const calls = [];
  globalThis.fetch = async (href) => {
    calls.push(String(href));
    await new Promise((r) => setTimeout(r, delay)); // 制造并发窗口
    if (fail) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => `/* ${href} */` };
  };
  return calls;
}

const stylesOf = (id) => attached.filter((el) => el.dataset?.skin === id);

test.beforeEach(() => {
  clearAllSkinStyles();
  attached.length = 0;
});

test("并发两次完全相同的注入 → 只有 1 个 style，且只抓一次 CSS", async () => {
  const calls = installFetch();
  await Promise.all([
    injectSkinStyles("dup", ["/skins/dup/skin.css"], { background: false }),
    injectSkinStyles("dup", ["/skins/dup/skin.css"], { background: false }),
  ]);
  assert.equal(stylesOf("dup").length, 1, "并发注入留下了重复的 <style data-skin>");
  assert.equal(calls.length, 1, "完全相同的注入请求不该抓两遍 CSS");

  removeSkinStyles("dup");
  assert.equal(stylesOf("dup").length, 0, "移除后仍有残留（正是修复前的症状）");
});

test("并发两次不同的 URL 列表（重扫时文件变了）→ 串行执行，最终仍只有 1 个 style", async () => {
  const calls = installFetch();
  await Promise.all([injectSkinStyles("rot", ["/v1/skin.css"]), injectSkinStyles("rot", ["/v2/skin.css"])]);
  assert.equal(stylesOf("rot").length, 1, "两次注入都 append 了，head 里出现同名重复");
  assert.equal(calls.length, 2, "两次不同的请求都应该发出（串行，不是合并）");
  assert.match(stylesOf("rot")[0].textContent, /v2\/skin\.css/, "后一次注入应当覆盖前一次");

  removeSkinStyles("rot");
  assert.equal(stylesOf("rot").length, 0);
});

test("removeSkinStyles 按选择器全量清理：历史残留也要摘干净", () => {
  // 模拟修复前留下的孤儿：head 里两份同名 style，styleEls 只记得一份
  const a = makeStyleEl();
  a.dataset.skin = "orphan";
  const b = makeStyleEl();
  b.dataset.skin = "orphan";
  globalThis.document.head.appendChild(a);
  globalThis.document.head.appendChild(b);
  assert.equal(stylesOf("orphan").length, 2);

  removeSkinStyles("orphan");
  assert.equal(stylesOf("orphan").length, 0, "还有同名 style 留在 head 里（会盖住新版本样式）");
});

test("clearAllSkinStyles 一次清掉所有样式的 <style>", async () => {
  installFetch();
  await injectSkinStyles("s1", ["/s1.css"]);
  await injectSkinStyles("s2", ["/s2.css"]);
  assert.equal(attached.length, 2);

  clearAllSkinStyles();
  assert.equal(attached.length, 0);
});

test("重新注入失败时旧样式仍然生效，且不留半成品", async () => {
  installFetch();
  await injectSkinStyles("keep", ["/ok.css"]);
  assert.equal(stylesOf("keep").length, 1);
  const before = stylesOf("keep")[0].textContent;

  installFetch({ fail: true });
  await assert.rejects(() => injectSkinStyles("keep", ["/broken.css"]), /读取样式表失败/);
  assert.equal(stylesOf("keep").length, 1, "失败的那次不该把已挂载样式的 CSS 摘掉");
  assert.equal(stylesOf("keep")[0].textContent, before, "旧样式被改动了");
});

test("不同 skinId 的并发注入互不干扰", async () => {
  installFetch();
  await Promise.all([injectSkinStyles("a", ["/a.css"]), injectSkinStyles("b", ["/b.css"])]);
  assert.equal(stylesOf("a").length, 1);
  assert.equal(stylesOf("b").length, 1);
  assert.equal(attached.length, 2);
});

test("空 URL 列表 = 明确清理该样式的样式表", async () => {
  installFetch();
  await injectSkinStyles("empty", ["/e.css"]);
  assert.equal(stylesOf("empty").length, 1);
  await injectSkinStyles("empty", []);
  assert.equal(stylesOf("empty").length, 0);
});
