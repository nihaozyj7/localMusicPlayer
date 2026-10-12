/* ==========================================================================
   api-key-replace.test.js — 用户换密钥必须能换掉，后端回传的占位串必须推不回去

   第六轮审查 N-15（中危，修 N-14 抽出纯函数时测出来的）：
     推送配置补丁时有一道兜底：「不把后端回传的打码占位串推回去」—— 否则
     「改一次别的设置」会顺手把真密钥覆盖成打码串。可它的判据是**猜**的：
     `keyPlaceholderOf(config)` 在「aiApiKeySet 为真 + aiApiKey 非空」时返回
     `config.aiApiKey` 本身，而用户输入新密钥后这个字段**就是新密钥** → 两值相等
     → 新密钥被 delete 掉，永远写不进 config.json。
     症状：输入框失焦后提示「已保存」，后端仍在用旧密钥 —— 用户在界面上无法轮换密钥
     （实测：buildConfigPatch({config:{aiApiKey:"sk-new-key",aiApiKeySet:true}}) 的补丁里
     没有 aiApiKey）。

   修法：把「这次后端回传的那个串」**记下来**（`noteMaskedApiKey`，水合与快照恢复两处
   都要记），只有与它逐字相同才丢弃。猜法换成比较真值之后，两个方向都对了：
     · 用户输入的新密钥 ≠ 记下的占位串 → 推（能换密钥、能删密钥）；
     · 没动过密钥时 state 里那个值**就是**记下的占位串 → 不推（守住原来的兜底）。
   ========================================================================== */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildConfigPatch, noteMaskedApiKey } from "../src/js/store.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// 后端 maskSecret 的产物长这样（前端不许硬编码它，所以用例里也用「任意打码串」）。
const MASK = "sk-••••••••1234";

/** 造一份最小 state（只放 buildConfigPatch 会读的字段）。 */
function makeState(configOverrides = {}) {
  return {
    config: { theme: "flat-dark", rememberVolume: true, ...configOverrides },
    filterRules: [],
    playMode: "order",
    volume: 0.6,
    muted: false,
  };
}

/** 模拟「后端这次回传了这个占位串」 */
function arm(mask = MASK) {
  noteMaskedApiKey({ aiApiKeySet: mask !== null, aiApiKey: mask === null ? "" : mask });
}

test("★ 用户输入的新密钥必须被推给后端（否则密钥根本换不掉）", () => {
  arm();
  const patch = buildConfigPatch(makeState({ aiApiKey: "sk-new-key", aiApiKeySet: true }));

  assert.equal(
    patch.aiApiKey,
    "sk-new-key",
    "输入的新密钥被当成后端占位串丢掉了 —— 界面显示已保存，后端还在用旧密钥"
  );
});

test("没动过密钥时，后端回传的占位串照旧不会被推回去（原兜底不许被改坏）", () => {
  arm();
  const patch = buildConfigPatch(makeState({ aiApiKey: MASK, aiApiKeySet: true }));

  assert.ok(!("aiApiKey" in patch), "把打码占位串推回后端了 —— 会把真密钥覆盖成占位串");
});

test("清空密钥（空串）照旧会被推 —— 这是「删除密钥」的有效操作", () => {
  arm();
  const patch = buildConfigPatch(makeState({ aiApiKey: "", aiApiKeySet: true }));

  assert.equal(patch.aiApiKey, "", "清空密钥没有被推给后端 —— 用户删不掉已配的密钥");
});

test("从没配过密钥（后端没有打码串可记）时，输入的值照样能推", () => {
  arm(null);
  const patch = buildConfigPatch(makeState({ aiApiKey: "sk-first-key" }));
  assert.equal(patch.aiApiKey, "sk-first-key");
});

test("连着换两次密钥，第二次也要能推（比较的是后端那个串，不是上一次的自己）", () => {
  arm();
  const first = buildConfigPatch(makeState({ aiApiKey: "sk-second", aiApiKeySet: true }));
  assert.equal(first.aiApiKey, "sk-second");

  // 第一次推送成功后 state 里仍是明文新密钥；用户再换一次，不能被「上一次的值」挡住
  const second = buildConfigPatch(makeState({ aiApiKey: "sk-third", aiApiKeySet: true }));
  assert.equal(second.aiApiKey, "sk-third");
});

test("真正的占位串在「换了密钥之后」也不会被误判成用户输入（方向不能反过来）", () => {
  arm("sk-••••AAAA");
  const patch = buildConfigPatch(makeState({ aiApiKey: "sk-••••BBBB", aiApiKeySet: true }));
  assert.equal(
    patch.aiApiKey,
    "sk-••••BBBB",
    "只该拦「后端这次回传的那个串」，别的打码形态是用户输入或另一台机器的值，应当照推"
  );
});

/* ---------------------------------------------------------------- 接线守卫 */

test("接线：不许再用「猜占位串」的旧判据，两个水合点都要记下真值", () => {
  const src = readFileSync(join(root, "frontend/src/js/store.js"), "utf8");

  assert.ok(
    !src.includes("keyPlaceholderOf"),
    "store.js 里又出现了 keyPlaceholderOf 那种猜测式判据 —— 它会把用户新输入的密钥一起丢掉"
  );
  assert.ok(
    src.includes("patch.aiApiKey === backendMaskedApiKey"),
    "buildConfigPatch 的密钥兜底没有与「后端这次回传的串」比较"
  );
  // 水合（后端）与快照恢复（localStorage）两处都要记：漏一处就会拿着上一次的串比较
  assert.ok(src.includes("noteMaskedApiKey(cfg)"), "hydrateFromBackend 没有记下后端这次回传的密钥占位串");
  assert.ok(
    src.includes("noteMaskedApiKey(saved.config)"),
    "applyPersisted 没有记下快照里的密钥占位串 —— 启动早期那次同步可能把它推回后端"
  );
});
