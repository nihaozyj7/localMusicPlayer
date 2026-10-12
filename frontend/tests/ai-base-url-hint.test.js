/* ==========================================================================
   ai-base-url-hint.test.js — 「AI 接口地址不被接受」必须让用户看得见
   --------------------------------------------------------------------------
   对应审查报告第 8 条（高危：aiBaseUrl 零校验却承载真密钥）。

   修法的分工是刻意这样切的：
     · **规则**只有一份，在 Go 侧（internal/bootstrap/config.go#NormalizeAIBaseURL）；
     · 真正的闸门在发请求那一处（services_ai.go#ExtractMeta）——地址不合法就
       一个字节都不发，密钥不出门；
     · 界面上只**显示**后端算出来的原因（派生字段 aiBaseUrlProblem）。

   为什么界面这一环也要有测试：闸门加上而界面不说明原因，用户看到的就是
   「AI 莫名不工作」—— 典型场景是把地址填成局域网模型服务的
   `http://192.168.x.x:1234`（这正是必须拒绝的：密钥会明文出网卡），
   改完设置一切照旧、没有任何提示，根本无从排查。

   与 playlist-id / skip-silence 一样用**源码断言**：settings-view.js 是 Lit
   组件（要 DOM），store.js 的同步路径要真后端；这几条接线一旦断掉，表现是
   「提示永远不出现」而不是报错，所以必须钉住。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const goConfig = read("internal/bootstrap/config.go");
const goServices = read("services.go");
const viewSrc = read("frontend/src/js/ui/settings-view.js");
const storeSrc = read("frontend/src/js/store.js");
const cssSrc = read("frontend/src/styles/components/settings.css");

/** foldersCard 那种「到下一个同级方法为止」的截取，用于只看 aiCard 的函数体 */
function aiCardBody() {
  const start = viewSrc.indexOf("aiCard() {");
  assert.ok(start > 0, "settings-view.js 里找不到 aiCard");
  const end = viewSrc.indexOf("\n  /* ", start);
  return viewSrc.slice(start, end > start ? end : start + 4000);
}

test("后端提供「地址为什么不能用」的派生字段", () => {
  assert.match(
    goConfig,
    /AIBaseURLProblem\s+string\s+`json:"aiBaseUrlProblem,omitempty"`/,
    "config.go 缺少派生字段 aiBaseUrlProblem（前端读的就是它）"
  );
  // Get() 里必须真的按规则算一遍（而不是永远空着 → 界面永远不提示）
  const getBody = goServices.slice(goServices.indexOf("func (s *ConfigService) Get()"));
  assert.match(
    getBody.slice(0, 1200),
    /NormalizeAIBaseURL\(cfg\.AIBaseURL\)[\s\S]{0,200}AIBaseURLProblem\s*=/,
    "ConfigService.Get 没有把 NormalizeAIBaseURL 的结果写进 AIBaseURLProblem"
  );
  // 派生字段不许落盘（否则配置文件里会多出一个会过期的字段）
  assert.match(goConfig, /cfg\.AIBaseURLProblem = ""/, "normalize() 必须清空派生字段，否则它会被写进 config.json");
});

test("AI 卡片会显示这个原因", () => {
  const body = aiCardBody();
  assert.match(
    body,
    /const addrProblem = String\(cfg\.aiBaseUrlProblem \|\| ""\)\.trim\(\);/,
    "aiCard 没有从 cfg.aiBaseUrlProblem 取原因 —— 用户看不到「地址为什么不能用」"
  );
  assert.match(
    body,
    /addrProblem\s*\n?\s*\?\s*html`<div class="setting__warn" role="alert">/,
    "aiCard 没有在 addrProblem 非空时渲染警告块（或丢了 role=alert）"
  );
  assert.ok(cssSrc.includes(".setting__warn"), "settings.css 缺少 .setting__warn 样式");
});

test("改完地址立刻刷新提示（不是等下次启动）", () => {
  const sync = storeSrc.slice(storeSrc.indexOf("export async function flushConfigSync"));
  const body = sync.slice(0, 3000);
  assert.match(
    body,
    /saved\.aiBaseUrlProblem/,
    "flushConfigSync 没有取回后端算好的 aiBaseUrlProblem —— 地址改坏了要等重启才提示"
  );
  assert.match(
    body,
    /saved\.aiBaseUrl\b/,
    "flushConfigSync 没有把规范化后的地址写回输入框（用户填 api.openai.com/v1 后应看到 https://…）"
  );
  assert.ok(
    /state\.updateRev = \(state\.updateRev \|\| 0\) \+ 1;[\s\S]{0,80}notify\(\);/.test(body),
    "config 是原地改的，改完必须推进 updateRev 并 notify()，否则界面不会重绘"
  );
  assert.ok(
    !/Object\.assign\(state\.config, saved\)/.test(body),
    "不要把后端返回的整包配置并回 state.config：它不含本地还没同步的键（例如 filterRules），会打回旧值"
  );
});
