/* ==========================================================================
   search-downloaded-badge.test.js — 搜索结果里的「已下载」标注
   --------------------------------------------------------------------------
   需求（用户原话）：「在搜索结果页中标注已下载（标注之前，再判断一下这个
   已下载的歌曲是否存在，比如是否被用户删除）」。

   这条要求有三个容易做错的点，逐个盯：
     1. **判据是「文件现在还在」**，不是「曾经下载过」。用户删掉下载目录里
        那份之后，标注必须消失（后端每次读台账都会 stat 一遍）。
     2. **宁可少标，不可标错**：exists 字段缺失、类型不对（"true"）、
        整条记录不存在 —— 一律按「没下载」处理。
     3. **不能自己记「下载过」**：前端的来源快照只能来自后端，
        并且在「打开弹层 / 搜索完成 / 下载完成」三个时刻重新问一遍。

   后端那一半（台账读写、存在性判定、Cleanup 引用判定）由 Go 侧用例守着：
   internal/onlinesource/onlinesource_test.go 与 online_playback_test.go。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isDownloadedSource } from "../src/js/ui/search.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

/* --------------------------------------------------------------------------
   1. 判据：只认 exists === true
   -------------------------------------------------------------------------- */

test("isDownloadedSource：文件还在才算已下载", () => {
  assert.equal(isDownloadedSource({ exists: true, dir: "D:\\Music" }), true);
});

test("isDownloadedSource：文件被用户删掉（exists=false）不算已下载", () => {
  // 台账里还有这条记录，但文件已经不在磁盘上 —— 绝不能标「已下载」
  assert.equal(isDownloadedSource({ exists: false, path: "D:\\Music\\a.m4a" }), false);
});

test("isDownloadedSource：字段缺失 / 类型不对 / 记录不存在都不算", () => {
  assert.equal(isDownloadedSource(undefined), false, "记录不存在");
  assert.equal(isDownloadedSource(null), false);
  assert.equal(isDownloadedSource({}), false, "没有 exists 字段");
  assert.equal(isDownloadedSource({ exists: "true" }), false, "字符串 true 不算：只有后端说真才是真");
  assert.equal(isDownloadedSource({ exists: 1 }), false);
});

/* --------------------------------------------------------------------------
   2. 渲染：标注只跟着判据走，且下载按钮会换成「再下载」
   -------------------------------------------------------------------------- */

test("搜索结果行：只有 done 为真时才渲染「已下载」标注", () => {
  const src = read("frontend/src/js/ui/search.js");

  assert.match(src, /const done = downloadedInfo\(song\);/, "每行都要先问一遍是否已下载");
  assert.match(src, /class="search-row__badge"/, "标注本身要有稳定的类名（自检脚本/主题按它查询）");
  // 条件渲染：done 为假时必须是 nothing，而不是画一个空标签（空标签会有内边距、
  // 把行高撑开，且 screen reader 会读到一个没有内容的元素）
  assert.match(src, /\?\s*html`<span\s+class="search-row__badge"[\s\S]*?: nothing/, "未下载时不能渲染空标注");

  // 数据属性：无头自检要能按「这一行有没有标注」断言
  assert.match(src, /data-downloaded=\$\{done \? "1" : "0"\}/, "行上要带 data-downloaded 便于自检");

  // 已下载时按钮文案变成「再下载」（避免用户以为必须再下一次）
  assert.match(src, /\$\{done \? "再下载" : "下载"\}/, "已下载的按钮文案要变");
});

test("样式：标注走令牌，不写死颜色", () => {
  const css = read("frontend/src/styles/components/searchpanel.css");
  const block = css.slice(css.indexOf(".search-row__badge"));
  const rule = block.slice(0, block.indexOf("}"));
  assert.match(rule, /color:\s*var\(--success\)/, "颜色必须走令牌（视觉归主题）");
  assert.match(rule, /background:\s*var\(--accent-weak\)/);
  assert.doesNotMatch(rule, /#[0-9a-fA-F]{3,8}/, "不该出现字面量颜色");
});

/* --------------------------------------------------------------------------
   3. 数据来源：三个时刻重新问后端，前端不自己记「下载过」
   -------------------------------------------------------------------------- */

test("来源索引来自后端，且不缓存「已下载」这个结论", () => {
  const src = read("frontend/src/js/ui/search.js");

  // 唯一的数据来源：后端返回的 downloads 映射
  assert.match(src, /await backend\.onlineSourceIndex\(\)/, "必须向后端要来源索引");
  assert.match(src, /searchState\.sources = downloads && typeof downloads === "object"/);

  // 前端自己**不能**写「已下载」这个结论（只有后端 stat 过才有资格下结论）
  assert.doesNotMatch(src, /sources\[[^\]]+\]\s*=\s*\{[^}]*exists:\s*true/, "不许前端自己造 exists:true");

  // 三个刷新时刻：打开弹层 / 搜索完成 / 下载完成
  const openIdx = src.indexOf("export function openOverlay()");
  assert.ok(openIdx >= 0, "找不到 openOverlay");
  assert.match(src.slice(openIdx, openIdx + 400), /refreshSources\(\)/, "打开弹层时应当刷新来源");

  const searchIdx = src.indexOf("async runOnlineSearch(keyword)");
  assert.ok(searchIdx >= 0, "找不到 runOnlineSearch");
  assert.match(src.slice(searchIdx, searchIdx + 1200), /refreshSources\(\)/, "搜索完成后应当刷新来源");

  assert.match(src, /on\("download:done"/, "下载完成要立刻补标注（不用等用户重新搜索）");
});

test("bridge：来源索引映射到生成的 SourceIndex 绑定", () => {
  const bridge = read("frontend/src/js/bridge.js");
  assert.match(bridge, /onlineSourceIndex: \(\) => call\(bindings\?\.Online\?\.SourceIndex\)/);
  assert.match(bridge, /Online: mod\.OnlineService/, "Online 名称必须映射到 OnlineService 模块");

  const binding = read("frontend/bindings/localmusicplayer/onlineservice.js");
  assert.match(binding, /export function SourceIndex\(\)/, "绑定里必须有 SourceIndex（改完 Go 要重新生成绑定）");
  assert.match(binding, /\$Call\.ByID\(\d+\)/, "绑定调用走数值方法 id");
});
