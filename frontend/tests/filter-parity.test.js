/* ==========================================================================
   filter-parity.test.js — 过滤规则「空值」语义的两端一致性
   --------------------------------------------------------------------------
   对应 Go 侧 internal/filter/empty_rule_parity_test.go（两张表逐字对应，
   改一边请改两边）。两端不一致的症状很隐蔽：**界面里看起来一切正常，
   后端却按另一套规则决定「哪些歌能播」**。

   这里钉住的是一个曾经真的会发生的缺陷：
   空 pattern 如果直接交给 regexp.Compile，得到的是「匹配一切」的正则，
   一条 value 为空、scope=exclude 的启用规则就会把整个曲库过滤干净，
   而且 Scan 返回 err=nil —— 用户看到「曲库空了」却没有任何报错。
   而设置页点「添加规则」新建的正则规则 value 就是空串
   （settings.js#rule-add），所以这个状态点一下就能到达。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

import { applyRules, matchRules } from "../src/js/store.js";

/** 与 Go 侧 paritySong() 同形状 */
function song() {
  return {
    id: "s1",
    path: "D:/Music/a.mp3",
    title: "标题",
    artist: "歌手",
    album: "专辑",
    ext: "mp3",
    size: 5000,
    duration: 1000,
  };
}

const rule = (over = {}) => ({
  id: over.id || "r1",
  type: over.type || "regex",
  op: over.op || "match",
  value: over.value ?? "",
  unit: over.unit || "B",
  scope: over.scope || "exclude",
  enabled: over.enabled ?? true,
});

test("空值规则的判定与 Go 侧逐条一致", () => {
  const cases = [
    { name: "空正则 + exclude → 规则失效，歌保留", rule: rule({ id: "r1" }), excluded: false },
    {
      name: "空正则 + include → 全部排除（include-miss）",
      rule: rule({ id: "r2", scope: "include" }),
      excluded: true,
    },
    {
      name: "纯空白正则 + exclude → 匹配不到东西，而不是「匹配一切」",
      rule: rule({ id: "r3", value: "   " }),
      excluded: false,
    },
    { name: "非法正则 + exclude → 规则失效", rule: rule({ id: "r4", value: "([a" }), excluded: false },
    {
      name: "空 size + lt + exclude → 规则失效",
      rule: rule({ id: "r5", type: "size", op: "lt", value: "" }),
      excluded: false,
    },
  ];

  for (const c of cases) {
    const s = song();
    const res = applyRules([s], [c.rule]);
    assert.equal(res.excluded === 1, c.excluded, `${c.name}：excluded=${res.excluded}，期望 ${c.excluded ? 1 : 0}`);
    const single = matchRules(s, [c.rule]);
    assert.equal(single.excluded, c.excluded, `${c.name}：matchRules 与 applyRules 判定不一致`);
  }
});

test("空正则规则不让曲库变空（默认规则 + 一条刚添加的空规则）", () => {
  const rules = [
    // 与 Go 侧 bootstrap.DefaultConfig 的默认规则同形
    rule({ id: "rule_size", type: "size", op: "lt", value: "10240", unit: "B" }),
    rule({ id: "rule_mp4", value: "\\.mp4$" }),
    // 用户点「添加规则」后立即产生的空规则
    rule({ id: "rule_new", value: "" }),
  ];
  const songs = [
    { ...song(), id: "a", path: "D:/Music/a.flac", ext: "flac", size: 30 << 20 },
    { ...song(), id: "b", path: "D:/Music/b.mp3", ext: "mp3", size: 8 << 20 },
    { ...song(), id: "c", path: "D:/Music/c.wav", ext: "wav", size: 40 << 20 },
  ];

  const res = applyRules(songs, rules);
  assert.equal(res.kept.length, songs.length, `空正则规则不该筛掉任何歌（kept=${res.kept.length}）`);
  assert.equal(res.excluded, 0);
});
