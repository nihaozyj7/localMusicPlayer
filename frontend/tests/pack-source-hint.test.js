/* ==========================================================================
   pack-source-hint.test.js — 「插件仓库地址不被接受」必须让用户看得见
   --------------------------------------------------------------------------
   对应审查报告第 41 条（中危：packSource 允许明文 http）。

   这个地址取回的是 `index.json` + 一个个 **JS 文件**，装完之后在同源页面里
   执行（AGENTS.md §4.3b / docs/42 §8.4）；清单里的 sha256 是随清单一起来的
   （自证），挡不住链路上的改写。所以明文的 http（非本机回环）必须拒绝。

   与 AI 接口地址那一处（ai-base-url-hint.test.js）同一套路：
     · 规则只有一份 → Go 的 internal/bootstrap（parseSecureEndpoint / PackSourceProblem）；
     · 非法地址**落回默认地址**，并给出原因；
     · 界面把原因显示出来 + 用错误色 toast，否则现象是「改完地址又变回默认了，
       用户以为是自己没保存成功」，只会反复重试。

   用源码断言（packstore.js 是 Lit 组件，要 DOM）：这几条接线断掉的表现是
   「提示永远不出现」，不会报错。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const goConfig = read("internal/bootstrap/config.go");
const goPacks = read("services_packs.go");
const src = read("frontend/src/js/ui/packstore.js");

test("Go：明文 http 落回默认地址，并给出原因", () => {
  // 旧实现是「只看协议前缀」，那一版会把 http://evil.example/plugins 原样收下
  assert.ok(
    !/strings\.HasPrefix\(clean, "https:\/\/"\)\s*&&\s*!strings\.HasPrefix\(clean, "http:\/\/"\)/.test(goConfig),
    "NormalizePackSource 又退回了「只看协议前缀」—— 明文 http 会被原样接受"
  );
  const body = goConfig.slice(goConfig.indexOf("func NormalizePackSource"));
  assert.match(
    body.slice(0, 1500),
    /parseSecureEndpoint\(clean\)/,
    "NormalizePackSource 没有走共用的安全地址判据（parseSecureEndpoint）"
  );
  assert.match(
    goConfig,
    /func PackSourceProblem\(v string\) string \{/,
    "缺少 PackSourceProblem —— 地址被落回默认时没人能说明原因"
  );
  assert.match(
    goPacks,
    /"problem":\s*bootstrap\.PackSourceProblem\(cfg\.PackSource\)/,
    "PackService.Source 没有把 problem 交给前端"
  );
});

test("包管理器面板会显示这个原因", () => {
  assert.match(
    src,
    /problem: String\(res\.problem \|\| ""\)/,
    "_loadSource / _saveSource 没有取回后端算好的 problem"
  );
  assert.match(
    src,
    /this\._source\.problem\s*\n?\s*\?\s*html`<div class="packnote" data-tone="warn" role="alert">/,
    "面板没有在 problem 非空时渲染警告块（或丢了 data-tone / role=alert）"
  );
  // 保存失败必须用错误色，而不是「已指向默认地址」的成功提示
  const save = src.slice(src.indexOf("async _saveSource()"));
  assert.match(
    save.slice(0, 1200),
    /if \(this\._source\.problem\)[\s\S]{0,160}tone: "error"/,
    "地址被拒时仍然报「已指向 …」成功提示，用户会以为保存成功了"
  );
});
