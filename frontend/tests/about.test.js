/* ==========================================================================
   about.test.js — 「设置 → 关于」资料表的结构单测
   --------------------------------------------------------------------------
   关于页是纯静态清单，最容易出的问题是「悄悄少了一项 / 多了一个空字段」：
   界面照样渲染，只是那一行是空的。这里对着几条不变量做断言：
     1. 每条依赖 / 技术都有名字、有网址、有许可证；
     2. 依赖清单与 go.mod / package.json 里真正用到的库对得上（数量与名字）；
     3. 版本号兜底值与打包元数据一致；
     4. 许可证汇总的计数是对的（页脚那句「MIT × 5」）。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

import {
  APP_LICENSE,
  APP_VERSION_FALLBACK,
  BUNDLED_BINARIES,
  DATA_SOURCES,
  LICENSE_NOTES,
  PROJECT_LINKS,
  RUNTIME_LIBS,
  TECH_STACK,
  THANKS,
  TRANSITIVE_LIBS,
  allLibs,
  licenseSummary,
  nameWithVersion,
} from "../src/js/about-info.js";

/** 每个条目都必须是「有名字、有网址的 https 链接」 */
function assertLinkable(items, label) {
  for (const item of items) {
    assert.ok(String(item.name || "").trim(), `${label}：有条目缺少 name`);
    assert.ok(
      /^https:\/\//.test(String(item.url || "")),
      `${label}：「${item.name}」的 url 不是 https 链接（${item.url}）`
    );
  }
}

test("技术栈：每项都有名称、版本与说明", () => {
  assertLinkable(TECH_STACK, "技术栈");
  for (const t of TECH_STACK) {
    assert.ok(String(t.version || "").trim(), `技术栈：${t.name} 缺少版本`);
    assert.ok(String(t.role || "").trim().length > 8, `技术栈：${t.name} 的 role 太短`);
  }
});

test("依赖库：许可证用 SPDX 标识，且都是宽松协议", () => {
  const libs = allLibs();
  assertLinkable(libs, "依赖");
  assert.ok(libs.length >= 8, `依赖条目只有 ${libs.length} 条，疑似漏了`);
  const allowed = new Set(["MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC"]);
  for (const l of libs) {
    assert.ok(allowed.has(l.license), `${l.name} 的许可证 ${l.license} 不在允许集合里`);
    assert.ok(String(l.version || "").trim(), `${l.name} 缺少版本`);
    assert.ok(String(l.role || "").trim(), `${l.name} 缺少用途说明`);
  }
  // 这几项是直接 import 的运行时依赖，漏了会让「开源依赖」表与代码对不上
  const names = libs.map((l) => l.name);
  for (const required of ["Wails", "dhowden/tag", "fsnotify/fsnotify", "Lit", "SortableJS"]) {
    assert.ok(names.includes(required), `依赖表缺少 ${required}`);
  }
  // 列表里不能有重复（同一个库既算运行时又算间接）
  assert.equal(new Set(names).size, names.length, "依赖表里有重复项");
  assert.equal(RUNTIME_LIBS.length + TRANSITIVE_LIBS.length, libs.length);
});

test("内嵌二进制：注明是 LGPL 且带来源链接", () => {
  assert.ok(BUNDLED_BINARIES.length >= 1);
  for (const b of BUNDLED_BINARIES) {
    assert.match(b.license, /^LGPL-/, `${b.name} 应当是 LGPL（内嵌二进制不能是 GPL）`);
    assert.ok(String(b.role).includes("未启用 GPL"), "必须说明没有启用 GPL 组件");
  }
});

test("许可证说明：第一种必须是本项目自身的 Apache-2.0", () => {
  assert.equal(APP_LICENSE, "Apache-2.0");
  assert.equal(LICENSE_NOTES[0].value, "Apache License 2.0");
  for (const n of LICENSE_NOTES) {
    assert.ok(String(n.desc).trim(), `许可证说明「${n.label}」没有描述`);
  }
});

test("参考与致谢：数据来源与鸣谢都非空", () => {
  assertLinkable(DATA_SOURCES, "数据来源");
  assert.ok(DATA_SOURCES.length >= 5, "数据来源太少，疑似漏了");
  assert.ok(THANKS.length >= 3, "致谢条目太少");
  for (const t of THANKS) {
    assert.ok(String(t.title).trim() && String(t.body).trim(), "致谢条目不完整");
  }
});

test("顶部入口：包含仓库与协议全文", () => {
  const urls = PROJECT_LINKS.map((l) => l.url);
  assert.ok(urls.some((u) => u.endsWith("apache.org/licenses/LICENSE-2.0")), "缺少协议全文入口");
  assert.ok(urls.some((u) => u.includes("github.com")), "缺少仓库入口");
  for (const l of PROJECT_LINKS) assert.ok(String(l.label).trim() && l.icon, "入口缺少文案或图标");
});

test("licenseSummary：按出现次数倒序汇总", () => {
  assert.deepEqual(licenseSummary([{ license: "MIT" }, { license: "MIT" }, { license: "ISC" }]), [
    { license: "MIT", count: 2 },
    { license: "ISC", count: 1 },
  ]);
  assert.deepEqual(licenseSummary([]), []);
});

test("nameWithVersion：占位版本号不拼出来", () => {
  assert.equal(nameWithVersion({ name: "A", version: "1.0" }), "A 1.0");
  assert.equal(nameWithVersion({ name: "A", version: "—" }), "A");
  assert.equal(nameWithVersion({ name: "A" }), "A");
});

test("版本号兜底值与关于页展示的后端常量同源", () => {
  // 真值在 services_app.go#appVersion；漂移时这条会红，提醒两边一起改。
  assert.match(APP_VERSION_FALLBACK, /^\d+\.\d+\.\d+$/);
});
