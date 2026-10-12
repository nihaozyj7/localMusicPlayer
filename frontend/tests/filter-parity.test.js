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

/* ==========================================================================
   size 规则的阈值语义（第六轮审查 N-1）
   --------------------------------------------------------------------------
   表逐条对应 Go 侧 internal/filter/empty_rule_parity_test.go 的
   TestSizeRuleThresholdParity（改一边请改两边）。

   钉住的是：**空值 / 非法值 / 负数 / 越界 = 这条规则不生效**，而不是「阈值 0」。
   修复前的行为：`value: ""` + `op: "gt"` 被解析成 0，于是「size > 0」把
   **所有非空文件**都排除 —— 同一份配置在后端只是「规则不生效」，
   设置页预览与真实扫描因此给出相反结果（这份表里带 ★ 的两行就是它）。
   ========================================================================== */

test("size 规则的阈值语义与 Go 侧逐条一致", () => {
  const DEFAULT_SIZE = 5000; // 与 Go 侧 defaultSize 相同
  const cases = [
    // ★ 缺陷本体
    { name: "空值 + gt + exclude → 规则失效，歌保留", v: "", op: "gt", excluded: false },
    { name: "空值 + lt + exclude → 规则失效，歌保留", v: "", op: "lt", excluded: false },
    { name: "空值 + eq + exclude → 规则失效，歌保留", v: "", op: "eq", excluded: false },
    {
      name: "空值 + gt + include → 一条都命中不了（include-miss）",
      v: "",
      op: "gt",
      scope: "include",
      excluded: true,
    },
    { name: "字母 + gt + exclude → 不生效", v: "abc", op: "gt", excluded: false },
    { name: "只有小数点 + gt + exclude → 不生效", v: ".", op: "gt", excluded: false },
    { name: "连字符 + gt + exclude → 不生效", v: "--", op: "gt", excluded: false },
    { name: "负值 + gt + exclude → 不生效", v: "-5", op: "gt", excluded: false },
    {
      name: "负值 + lt + include → 不生效且 include 落空",
      v: "-5",
      op: "lt",
      scope: "include",
      excluded: true,
    },
    {
      name: "超出 int64 + gt + exclude → 不生效",
      v: "99999999999999999999999999",
      op: "gt",
      excluded: false,
    },
    { name: "0 + gt + exclude → 0 是合法阈值，非空文件被排除", v: "0", op: "gt", excluded: true },
    { name: "0 + lt + exclude → 没有文件小于 0 字节", v: "0", op: "lt", excluded: false },
    { name: "1KB + gt + exclude → 5000 > 1024", v: "1", unit: "KB", op: "gt", excluded: true },
    { name: "5MB + lt + exclude → 5000 < 5242880", v: "5", unit: "MB", op: "lt", excluded: true },
    { name: "1GB + lt + exclude → 5000 < 1073741824", v: "1", unit: "GB", op: "lt", excluded: true },
    {
      name: "1.1KB + eq + exclude（size=1126）→ 截断后相等",
      v: "1.1",
      unit: "KB",
      op: "eq",
      size: 1126,
      excluded: true,
    },
    {
      name: "1.1KB + eq + exclude（size=1127）→ 截断后不等",
      v: "1.1",
      unit: "KB",
      op: "eq",
      size: 1127,
      excluded: false,
    },
    {
      name: "1kb + gt + exclude（小写单位）→ 5000 > 1024",
      v: "1",
      unit: "kb",
      op: "gt",
      excluded: true,
    },
    {
      name: "1,5KB + lt + exclude（逗号被清洗 → 15KB）",
      v: "1,5",
      unit: "KB",
      op: "lt",
      excluded: true,
    },
  ];

  for (const c of cases) {
    const size = c.size ?? DEFAULT_SIZE;
    const s = { ...song(), size };
    const r = rule({ id: "r", type: "size", op: c.op, value: c.v, unit: c.unit ?? "B", scope: c.scope });
    const res = applyRules([s], [r]);
    assert.equal(
      res.excluded === 1,
      c.excluded,
      `${c.name}：applyRules 判定 excluded=${res.excluded}，期望 ${c.excluded ? 1 : 0}`
    );
    const single = matchRules(s, [r]);
    assert.equal(single.excluded, c.excluded, `${c.name}：matchRules 与 applyRules 判定不一致`);
  }
});
