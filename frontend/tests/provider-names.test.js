/* ==========================================================================
   provider-names.test.js — 第三方来源 id ↔ 界面显示名
   --------------------------------------------------------------------------
   守的是一个**已经在线上出现过**的问题：

     后端 lyricsfetch 的来源 id 里有 lrclib，而前端的显示名表里没有它。
     providerName() 对未知 id 是「原样返回」，于是界面上直接显示了内部标识：

         在线歌词来源：lrclib / 网易云音乐 / QQ 音乐

   这类漂移很隐蔽：功能完全正常，只是把英文内部标识漏给了用户，
   而且只在「刚好用到那个来源」时出现（不跑在线歌词匹配就永远看不到）。

   做法与 settings-effect.test.js 一致：**读 Go 源码**取出真实在用的 id 列表，
   而不是在这里硬编码一份「期望值」—— 硬编码的话这个测试自己就变成了
   愿意漂移的那一份拷贝。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  COVER_PROVIDERS,
  LYRICS_PROVIDERS,
  providerFallbackLabel,
  providerListLabel,
  providerName,
} from "../src/js/provider-names.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

/** 从某个 Go 包的源码里取出所有 `Name() string { return "xxx" }` 的 id */
function providerIDsFromGo(pkgDir) {
  const dir = join(repoRoot, "internal", pkgDir);
  const ids = new Set();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".go") || name.endsWith("_test.go")) continue;
    const src = readFileSync(join(dir, name), "utf8");
    const re = /func \([^)]*\) Name\(\) string \{ return "([a-z0-9]+)" \}/g;
    for (const m of src.matchAll(re)) ids.add(m[1]);
  }
  assert.ok(ids.size > 0, `没有从 internal/${pkgDir} 解析到任何来源 id —— 解析逻辑可能失效了`);
  return ids;
}

test("Go 侧封面来源都要有中文显示名", () => {
  const goIDs = providerIDsFromGo("coverfetch");
  for (const id of goIDs) {
    assert.notEqual(
      providerName(id),
      id,
      `封面来源 ${id} 没有显示名（界面会直接显示内部标识；请补 provider-names.js 的 PROVIDER_NAMES）`,
    );
    assert.ok(
      COVER_PROVIDERS.includes(id),
      `封面来源 ${id} 不在 COVER_PROVIDERS 里（兜底文案会漏掉它）`,
    );
  }
});

test("Go 侧歌词来源都要有中文显示名", () => {
  const goIDs = providerIDsFromGo("lyricsfetch");
  for (const id of goIDs) {
    // ★ lrclib 就是从这里漏掉的
    assert.notEqual(
      providerName(id),
      id,
      `歌词来源 ${id} 没有显示名（用户会在「在线歌词来源」里看到内部标识）`,
    );
    assert.ok(
      LYRICS_PROVIDERS.includes(id),
      `歌词来源 ${id} 不在 LYRICS_PROVIDERS 里`,
    );
  }
});

test("分组清单里的每一项都真的有显示名", () => {
  for (const id of [...COVER_PROVIDERS, ...LYRICS_PROVIDERS]) {
    assert.notEqual(providerName(id), id, `来源 ${id} 在清单里但没有显示名`);
  }
});

test("兜底文案从同一张表派生，不会各写一份", () => {
  const label = providerFallbackLabel();
  assert.equal(label, providerListLabel(COVER_PROVIDERS));
  for (const id of COVER_PROVIDERS) {
    assert.ok(label.includes(providerName(id)), `兜底文案漏了 ${providerName(id)}：${label}`);
  }
  // 歌词来源不该混进封面兜底文案里
  assert.ok(!label.includes("LRCLIB"), `封面来源兜底文案里混进了歌词来源：${label}`);
});

test("分组清单不能反过来漏掉 Go 里真实存在的来源", () => {
  // 与上面两条相反的方向：Go 侧**移除**了一个来源（或分组清单写错一个字），
  // 兜底文案与免责声明里就会多出一个已经不用的名字。
  for (const id of providerIDsFromGo("coverfetch")) {
    assert.ok(COVER_PROVIDERS.includes(id), `COVER_PROVIDERS 少了 ${id}`);
  }
  for (const id of providerIDsFromGo("lyricsfetch")) {
    assert.ok(LYRICS_PROVIDERS.includes(id), `LYRICS_PROVIDERS 少了 ${id}`);
  }
});

test("界面文案里不许再手写来源清单", () => {
  // 这句免责声明曾经是同一份枚举的第 5 份拷贝，而且**漏了 QQ 音乐**
  //（coverfetch 有 5 个来源，句子里只列了 4 个）—— 用户看到的说明与实际
  // 联网行为不一致。现在它由 providerFallbackLabel() 派生。
  // 这里守住「不许再手写」：一旦有人把字面量写回去就红。
  const src = readFileSync(
    join(repoRoot, "frontend", "src", "js", "ui", "settings-view.js"),
    "utf8"
  );
  const line = src.split("\n").find((l) => l.includes("封面来自公开曲库"));
  assert.ok(line, "找不到「封面来自公开曲库」这句文案（改名了？）");
  assert.ok(
    line.includes("providerFallbackLabel()"),
    `这句文案应当由来源表派生，实际是：${line.trim()}`
  );
  for (const name of ["iTunes", "Deezer", "MusicBrainz", "网易云"]) {
    assert.ok(!line.includes(name), `文案里还硬写着来源名「${name}」：${line.trim()}`);
  }
});

test("未知来源原样返回（不显示空白）", () => {
  assert.equal(providerName("some-new-provider"), "some-new-provider");
  assert.equal(providerName(""), "");
  assert.equal(providerName(null), "");
  // 大小写与空白要容错（后端 id 都是小写，但别在这里埋雷）
  assert.equal(providerName("  iTunes "), "iTunes");
});

test("列表为空时用兜底", () => {
  assert.equal(providerListLabel([], "fallback"), "fallback");
  assert.equal(providerListLabel(null, "fallback"), "fallback");
  assert.equal(providerListLabel(["qq"]), "QQ 音乐");
});
