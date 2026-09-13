/* ==========================================================================
   lrc-edit.test.js — LRC 编辑工具的纯逻辑单测
   --------------------------------------------------------------------------
   覆盖歌词工作台的三个关键算法：
     1. 时间标签序列化 / 格式化（格式错了整份歌词就废了）；
     2. 整体平移（微调 tab）；
     3. 重新解析文本时保留已打轴的时间（手动编辑 tab 最容易回归的地方）。
   DOM 部分由无头浏览器自检负责。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

import {
  formatLrcTime,
  lrcTimeRange,
  mergeDraftTimes,
  parseLyricDraft,
  serializeLrc,
  shiftLrc,
} from "@musicplayer/player-skins";

test("formatLrcTime：百分秒、补零、负数与非 60.00 进位", () => {
  assert.equal(formatLrcTime(0), "[00:00.00]");
  assert.equal(formatLrcTime(83450), "[01:23.45]");
  assert.equal(formatLrcTime(1234), "[00:01.23]");
  assert.equal(formatLrcTime(-500), "[00:00.00]", "负数要钳到 0（负时间标签不是合法 LRC）");
  // 59.999s 必须进到下一分钟的 00.00，而不是 "60.00"
  assert.equal(formatLrcTime(59999), "[01:00.00]");
  assert.equal(formatLrcTime(59990), "[00:59.99]");
});

test("parseLyricDraft：保留未打轴的行，多标签展开", () => {
  const draft = parseLyricDraft(["第一句", "[00:10.00]第二句", "[00:20.00][00:30.00]副歌", "", "  "].join("\n"));
  assert.deepEqual(draft, [
    { time: null, text: "第一句" },
    { time: 10000, text: "第二句" },
    { time: 20000, text: "副歌" },
    { time: 30000, text: "副歌" },
  ]);
});

test("serializeLrc：按时间升序、丢掉未打轴的行", () => {
  const text = serializeLrc([
    { time: 30000, text: "第三句" },
    { time: null, text: "还没打轴" },
    { time: 10000, text: "第一句" },
  ]);
  assert.equal(text, "[00:10.00]第一句\n[00:30.00]第三句");
});

test("shiftLrc：整体平移（一行多标签也逐个平移），无标签行原样保留", () => {
  const src = ["[00:10.00]A", "[00:20.00][00:30.00]B", "作词：某人"].join("\n");
  assert.equal(shiftLrc(src, 500), ["[00:10.50]A", "[00:20.50][00:30.50]B", "作词：某人"].join("\n"));
  assert.equal(shiftLrc(src, -10000), ["[00:00.00]A", "[00:10.00][00:20.00]B", "作词：某人"].join("\n"));
  assert.equal(shiftLrc(src, 0), src, "偏移为 0 时必须原样返回");
});

test("lrcTimeRange：给微调面板算上下限", () => {
  assert.deepEqual(lrcTimeRange("[00:10.00]A\n[00:30.00]B"), { min: 10000, max: 30000, count: 2 });
  assert.deepEqual(lrcTimeRange("没有时间标签"), { min: 0, max: 0, count: 0 });
});

test("mergeDraftTimes：改错别字不丢时间（同下标优先）", () => {
  const prev = [
    { time: 10000, text: "第一句" },
    { time: 20000, text: "第二句" },
    { time: 30000, text: "第三句" },
  ];
  const next = parseLyricDraft("第一句\n第二局\n第三句"); // 第二句改了字
  const merged = mergeDraftTimes(prev, next);
  assert.deepEqual(
    merged.map((l) => l.time),
    [10000, 20000, 30000],
    "只改了第二行的字，三行的时间都该保住"
  );
  assert.equal(merged[1].text, "第二局");
});

test("mergeDraftTimes：插入一行，后面的时间整体跟着走", () => {
  const prev = [
    { time: 10000, text: "A" },
    { time: 20000, text: "B" },
  ];
  const next = parseLyricDraft("A\n新插入\nB");
  const merged = mergeDraftTimes(prev, next);
  assert.deepEqual(merged.map((l) => l.time), [10000, null, 20000]);
});

test("mergeDraftTimes：删除一行，剩下的时间各自归位", () => {
  const prev = [
    { time: 10000, text: "A" },
    { time: 20000, text: "B" },
    { time: 30000, text: "C" },
  ];
  const next = parseLyricDraft("A\nC");
  const merged = mergeDraftTimes(prev, next);
  assert.deepEqual(merged.map((l) => l.time), [10000, 30000]);
});

test("mergeDraftTimes：重复行（副歌）不会两行抢同一个时间", () => {
  const prev = parseLyricDraft("[00:10.00]副歌\n[00:20.00]主歌\n[00:30.00]副歌");
  const next = parseLyricDraft("副歌\n主歌\n副歌");
  const merged = mergeDraftTimes(prev, next);
  assert.deepEqual(merged.map((l) => l.time), [10000, 20000, 30000]);
});

test("mergeDraftTimes：文本里新写的时间标签优先于旧时间", () => {
  const prev = [{ time: 10000, text: "A" }];
  const next = parseLyricDraft("[00:55.00]A");
  const merged = mergeDraftTimes(prev, next);
  assert.deepEqual(merged, [{ time: 55000, text: "A" }]);
});

test("round-trip：建行 → 序列化 → 再建行，时间与文本都不漂", () => {
  const text = "[00:10.00]第一句\n[01:23.45]第二句";
  const once = serializeLrc(parseLyricDraft(text));
  const twice = serializeLrc(parseLyricDraft(once));
  assert.equal(once, text);
  assert.equal(twice, text);
});
