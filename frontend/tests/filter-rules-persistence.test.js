/* ==========================================================================
   filter-rules-persistence.test.js — 过滤规则必须真的推给后端并留在 config.json

   第六轮审查 §4.6「过滤规则双真源」（中危）：
     · 规则的真源在设置页编辑的是 `state.filterRules`，而**后端扫描时**才真正生效
       （`internal/filter` + `library.Scan` 里的 `filter.Apply`）；
     · 但 `filterRules` 原先**不在** `SYNCED_KEYS` 里 —— 规则只写进 localStorage 快照，
       永远到不了 `%APPDATA%\LocalMusicPlayer\config.json`；
     · 而启动水合（`hydrateFromBackend`）用的又是**后端那份**（默认规则，非空），
       于是用户改完规则 → 重启 → 被后端旧值盖回去。界面显示一套、扫描按另一套执行。

   修法：`filterRules` 进 `SYNCED_KEYS`，并且补丁里的值取 `state.filterRules` 而不是
   `state.config.filterRules`（后者只是水合时灌进来的镜像：`rule-del` 会把数组整个
   换掉，镜像立刻过期 —— 从镜像取值会把「删掉一条规则」推成旧规则）。

   为什么用「跑纯函数」而不是源码正则：补丁构造在 N-14 里抽成了纯函数
   `buildConfigPatch(state)`，所以这几条断言是**真的在跑**实现，而不是拿正则去猜它
   （仓库里 `player-options.test.js` / `skip-silence.test.js` 只能做源码断言，
   理由是那条路径要真后端；这里不需要了）。
   ========================================================================== */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildConfigPatch, noteMaskedApiKey } from "../src/js/store.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** 造一份最小 state（只放 buildConfigPatch 会读的字段）。 */
function makeState(overrides = {}) {
  return {
    config: { theme: "flat-dark", animations: true, rememberVolume: true },
    filterRules: [],
    playMode: "order",
    volume: 0.6,
    muted: false,
    ...overrides,
  };
}

const rule = (id, value) => ({
  id,
  type: "regex",
  op: "match",
  value,
  scope: "exclude",
  enabled: true,
});

test("过滤规则会被推给后端（否则永远进不了 config.json）", () => {
  const rules = [rule("rule-1", "\\.wav$")];
  const patch = buildConfigPatch(makeState({ filterRules: rules }));

  assert.ok("filterRules" in patch, "补丁里没有 filterRules —— 规则没有推给后端");
  assert.deepEqual(patch.filterRules, rules);
});

test("清空所有规则同样要推（空数组是有效值，不是「没有这个键」）", () => {
  const patch = buildConfigPatch(makeState({ filterRules: [] }));

  assert.ok("filterRules" in patch, "空规则列表被当成「不用推」—— 删完规则重启又回来了");
  assert.deepEqual(patch.filterRules, []);
});

test("★ 以 state.filterRules 为准，不取过期的 state.config 镜像", () => {
  // 复现 `rule-del`：数组被整个换掉，而水合时灌进来的 config 镜像还指着旧数组
  const stale = [rule("rule-old", "\\.mp4$")];
  const state = makeState({
    config: { theme: "flat-dark", rememberVolume: true, filterRules: stale },
    filterRules: [],
  });

  const patch = buildConfigPatch(state);
  assert.deepEqual(
    patch.filterRules,
    [],
    "推送的是过期的 config 镜像 —— 用户删掉的规则会被写回 config.json，表现是「删了又回来」"
  );
  assert.notEqual(patch.filterRules, stale, "推送的必须是 state.filterRules 本身");
});

test("没有规则字段时退化成空数组，而不是 undefined", () => {
  const state = makeState();
  delete state.filterRules;
  const patch = buildConfigPatch(state);
  assert.deepEqual(patch.filterRules, []);
});

test("后端回传的密钥占位串仍然不会被推回去（原有兜底不许被改坏）", () => {
  // 判据是「与后端这次回传的那个串比较」（N-15 之后），所以先按水合那样记下它
  noteMaskedApiKey({ aiApiKeySet: true, aiApiKey: "sk-••••••••" });
  const state = makeState({
    config: {
      theme: "flat-dark",
      rememberVolume: true,
      aiApiKey: "sk-••••••••",
      aiApiKeySet: true,
    },
  });
  const patch = buildConfigPatch(state);
  assert.ok(!("aiApiKey" in patch), "密钥占位串被推回后端了 —— 会把真密钥覆盖成占位串");
});

// 同一条路径上的第二个缺陷（用户替换已配好的密钥时新值被丢掉）已在 N-15 修掉，
// 它的用例在 `frontend/tests/api-key-replace.test.js`（那个文件专门盯密钥兜底）。

/* ---------------------------------------------------------------- 接线守卫 */

test("SYNCED_KEYS 里有 filterRules，且 flushConfigSync 走 buildConfigPatch", () => {
  const src = readFileSync(join(root, "frontend/src/js/store.js"), "utf8");
  const start = src.indexOf("const SYNCED_KEYS = [");
  assert.ok(start > 0, "store.js 里找不到 SYNCED_KEYS");
  const list = src.slice(start, src.indexOf("];", start));
  assert.ok(
    list.includes('"filterRules"'),
    "SYNCED_KEYS 缺少 filterRules —— 该设置无法落盘（用户改完规则重启即失效）"
  );

  // 补丁构造只能在 buildConfigPatch 里有**一处**：以前它内联在 flushConfigSync 里，
  // 于是「值从哪来」既没法测、也没人看得出镜像会过期。
  const flush = src.slice(src.indexOf("export async function flushConfigSync"));
  const body = flush.slice(0, flush.indexOf("\n}"));
  assert.ok(
    body.includes("buildConfigPatch(state)"),
    "flushConfigSync 没有用 buildConfigPatch —— 补丁构造又被内联回去了"
  );
  assert.ok(
    !body.includes("for (const key of SYNCED_KEYS)"),
    "flushConfigSync 里又出现了 SYNCED_KEYS 的循环 —— 两处构造补丁必然走岔"
  );
});
