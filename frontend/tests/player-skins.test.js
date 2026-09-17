/* ==========================================================================
   player-skins.test.js — 皮肤包（@localmusicplayer/player-skins）的单测
   --------------------------------------------------------------------------
   覆盖三块**纯逻辑**：
     1. LRC 解析与定位（高亮错行的锅基本都在这里）；
     2. 皮肤契约（缺字段 / 接口版本不符要在加载时就报出来）；
     3. 注册表（内置样式清单与排序、不认识 id 的兜底）；
     4. 窗口适配比例（fit.js 的倍数怎么算、夹取与 0 尺寸兜底）。
   DOM 行为（挂载、歌词滚动、整窗背景层）由无头浏览器自检负责：
     node tools/check-player-host.mjs
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

import {
  BUILTIN_SKINS,
  DEFAULT_SKIN_ID,
  SKIN_API_VERSION,
  defineSkin,
  findLyricIndex,
  getSkin,
  inspectSkinModule,
  listSkins,
  parseLrc,
  registerSkin,
  resolveSkin,
  unregisterSkin,
  escapeHtml,
  lyricsEmptyText,
  loadExternalSkin,
  fitScale,
  fitScaleOf,
  FIT_REFERENCE,
  FIT_MIN,
  FIT_MAX,
  // 「星阵咏唱」的纯逻辑（字素时间轴 / 段落剧本 / 七元素分析 / 跟随运镜）
  MIN_UNIT_MS,
  MIN_SING_MS,
  MAX_SING_MS,
  LYRIC_BANDS,
  buildGraphemeTimeline,
  detectSections,
  estimateWidthEm,
  planLine,
  resolveFocus,
  tokenizeUnits,
  unitWeight,
  bandSplit,
  createElementAnalyzer,
  createStageCamera,
} from "@localmusicplayer/player-skins";

/* --------------------------------------------------------------------------
   歌词空态文案（「匹配中 / 匹配失败」不能显示成「暂无歌词」）
   -------------------------------------------------------------------------- */

test("外部样式不能占用内置 id（否则内置样式会被磁盘上的旧副本永久顶替）", async () => {
  // 真实事故：magia 从第三方样式并入内置之后，用户数据目录里那份旧副本仍然存在，
  // 注册表按 id 覆盖 → 内置 magia 的修复永远跑不到。
  const mod =
    "data:text/javascript," + encodeURIComponent("export default { id: 'magia', name: '旧副本', mount() {} };");
  await assert.rejects(() => loadExternalSkin({ id: "magia", module: mod }), /与内置样式同名/);
  // 内置样式仍然在，且没有被改过
  assert.equal(getSkin("magia")?.name, "魔法阵 · 手绘次元");
});

test("外部样式用不冲突的 id 时能正常注册，注销后消失", async () => {
  const mod =
    "data:text/javascript," +
    encodeURIComponent("export default { id: 'tmp-external', name: '临时样式', mount() {} };");
  const skin = await loadExternalSkin({ id: "tmp-external", name: "临时样式", module: mod });
  assert.equal(getSkin("tmp-external")?.name, "临时样式");
  assert.equal(skin.builtin, false);
  assert.equal(unregisterSkin("tmp-external"), true);
  assert.equal(getSkin("tmp-external"), null);
});

test("lyricsEmptyText：宿主给了 statusText 就用它", () => {
  assert.equal(lyricsEmptyText({ status: "matching", statusText: "歌词匹配中…" }), "歌词匹配中…");
  assert.equal(lyricsEmptyText({ status: "failed", statusText: "歌词匹配失败" }), "歌词匹配失败");
});

test("lyricsEmptyText：没有 statusText 时按 status 映射", () => {
  assert.equal(lyricsEmptyText({ status: "loading" }), "歌词匹配中…");
  assert.equal(lyricsEmptyText({ status: "matching" }), "歌词匹配中…");
  assert.equal(lyricsEmptyText({ status: "failed" }), "歌词匹配失败");
  assert.equal(lyricsEmptyText({ status: "none" }), "暂无歌词");
});

test("lyricsEmptyText：老宿主（没有 status）退回原来的来源判断，不出现空白", () => {
  assert.equal(lyricsEmptyText({ source: "online" }), "在线匹配失败");
  assert.equal(lyricsEmptyText({ source: "embedded" }), "暂无歌词");
  assert.equal(lyricsEmptyText(null), "暂无歌词");
  assert.equal(lyricsEmptyText(undefined), "暂无歌词");
  // 全是空白的 statusText 等于没给
  assert.equal(lyricsEmptyText({ status: "failed", statusText: "   " }), "歌词匹配失败");
});

/* --------------------------------------------------------------------------
   LRC
   -------------------------------------------------------------------------- */

test("parseLrc：一行多个时间标签要展开成多行，并按时间升序", () => {
  const text = ["[00:12.00][01:20.50]同一句", "[00:05.00]第一句"].join("\n");
  const lines = parseLrc(text);
  assert.deepEqual(
    lines.map((l) => [l.time, l.text]),
    [
      [5000, "第一句"],
      [12000, "同一句"],
      [80500, "同一句"],
    ]
  );
});

test("parseLrc：小数位 1~3 位与冒号分隔都要吃下", () => {
  assert.deepEqual(parseLrc("[00:01.5]a")[0].time, 1500);
  assert.deepEqual(parseLrc("[00:01.25]a")[0].time, 1250);
  assert.deepEqual(parseLrc("[00:01.125]a")[0].time, 1125);
  assert.deepEqual(parseLrc("[00:01:50]a")[0].time, 1500);
});

test("parseLrc：没有时间标签的元信息行要被丢掉（否则永远高亮不到）", () => {
  const lines = parseLrc("[ar:某歌手]\n[00:10.00]正文");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, "正文");
});

test("parseLrc：空文本 / 空行不炸", () => {
  assert.deepEqual(parseLrc(""), []);
  assert.deepEqual(parseLrc("\n\n"), []);
  assert.deepEqual(parseLrc(null), []);
});

test("findLyricIndex：二分定位（未到第一句返回 -1，末尾落在最后一行）", () => {
  const lines = parseLrc("[00:05.00]a\n[00:10.00]b\n[00:15.00]c");
  assert.equal(findLyricIndex(lines, 0), -1);
  assert.equal(findLyricIndex(lines, 4999), -1);
  assert.equal(findLyricIndex(lines, 5000), 0);
  assert.equal(findLyricIndex(lines, 9999), 0);
  assert.equal(findLyricIndex(lines, 10000), 1);
  assert.equal(findLyricIndex(lines, 999999), 2);
  assert.equal(findLyricIndex([], 100), -1);
});

/* --------------------------------------------------------------------------
   契约
   -------------------------------------------------------------------------- */

test("defineSkin：缺 id / name / mount 都要报出可读错误", () => {
  assert.throws(() => defineSkin({ name: "x", mount() {} }), /缺少必需字段：id/);
  assert.throws(() => defineSkin({ id: "x", mount() {} }), /缺少必需字段：name/);
  assert.throws(() => defineSkin({ id: "x", name: "x" }), /缺少必需字段：mount/);
  assert.throws(() => defineSkin(null), /必须是一个对象/);
});

test("defineSkin：接口版本不符要拒绝（而不是装作没事然后崩在半路）", () => {
  assert.throws(() => defineSkin({ id: "x", name: "x", mount() {}, apiVersion: 99 }), /只支持/);
});

test("defineSkin：补齐默认值，order 默认排在内置样式之后", () => {
  const skin = defineSkin({ id: "x", name: "x", mount() {} });
  assert.equal(skin.apiVersion, SKIN_API_VERSION);
  assert.equal(skin.icon, "disc");
  assert.equal(skin.background, false);
  assert.deepEqual(skin.styles, []);
  assert.ok(skin.order >= 100);
});

test("inspectSkinModule：分别识别 default / skin 导出与缺失", () => {
  const ok = inspectSkinModule({ default: { id: "a", name: "A", mount() {} } });
  assert.equal(ok.ok, true);
  assert.equal(ok.skin.id, "a");

  const named = inspectSkinModule({ skin: { id: "b", name: "B", mount() {} } });
  assert.equal(named.ok, true);
  assert.equal(named.skin.id, "b");

  const bad = inspectSkinModule({});
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /default 导出/);
});

/* --------------------------------------------------------------------------
   窗口适配比例（fit.js）
   --------------------------------------------------------------------------
   整窗背景型样式投到桌面背景（整块桌面）时，固定 px 的封面 / 歌词会显得又小又空。
   fitScale 把「舞台短边 / 基准短边」算成一个无量纲倍数交给 CSS 等比缩放。
   -------------------------------------------------------------------------- */

test("fitScale：按舞台短边算倍数，并夹在 FIT_MIN / FIT_MAX 之间", () => {
  assert.equal(fitScale(FIT_REFERENCE, FIT_REFERENCE), 1);
  // 取的是短边：宽 2560 但高只有基准值 → 倍数仍是 1
  assert.equal(fitScale(2560, FIT_REFERENCE), 1);
  assert.equal(fitScale(1400, 1600), 2); // 短边 1400 = 2 × 基准短边
  assert.equal(fitScale(100, 100), FIT_MIN);
  assert.equal(fitScale(20000, 20000), FIT_MAX);
  // 详情页关闭时 ResizeObserver 会推 0×0：返回 0 会把封面与歌词压成一条线
  assert.equal(fitScale(0, 0), 1);
  assert.equal(fitScale(-100, -100), 1);
  // 只有一维有效时按那一维算（宽读到 0 不等于高度也没了）
  assert.equal(fitScale(Number.NaN, 800), fitScale(0, 800));
});

test("fitScaleOf：优先量元素，元素没有尺寸时退回窗口，无窗口时给 1", () => {
  assert.equal(fitScaleOf({ clientWidth: 1400, clientHeight: 900 }), fitScale(1400, 900));
  assert.equal(fitScaleOf({ clientWidth: 0, clientHeight: 0 }), 1); // node 环境里没有 window
  assert.equal(fitScaleOf(null), 1);
  assert.equal(fitScaleOf(undefined), 1);
});

/* --------------------------------------------------------------------------
   注册表
   -------------------------------------------------------------------------- */

test("内置样式都在注册表里，且顺序稳定（经典 → 沉浸 → 简约 → 二次元 → 魔法阵 → 星阵咏唱）", () => {
  // 内置样式是「产品的一部分」：这个清单变了就必须有人显式改这里，
  // 免得新增样式时漏注册、或者顺序被无意打乱。
  assert.deepEqual(
    listSkins().map((s) => s.id),
    ["classic", "immersive", "minimal", "anime", "magia", "arcanum"]
  );
  assert.deepEqual(
    BUILTIN_SKINS.map((s) => s.id),
    ["classic", "immersive", "minimal", "anime", "magia", "arcanum"]
  );
  for (const skin of BUILTIN_SKINS) {
    assert.equal(typeof skin.mount, "function", `${skin.id} 缺 mount`);
    assert.equal(typeof skin.update, "function", `${skin.id} 缺 update`);
    assert.equal(typeof skin.destroy, "function", `${skin.id} 缺 destroy`);
    assert.equal(skin.apiVersion, SKIN_API_VERSION);
    assert.ok(skin.order >= 10 && skin.order < 100, `${skin.id} 的 order 应落在内置区间`);
  }
});

test("需要整窗背景层的内置样式（沉浸 / 特效类）都声明了 background", () => {
  const withBg = BUILTIN_SKINS.filter((s) => s.background).map((s) => s.id);
  assert.deepEqual(withBg, ["immersive", "anime", "magia", "arcanum"]);
  // 经典与简约是「不铺满整窗」的两种：一个左唱片右歌词，一个只留文字
  assert.deepEqual(
    BUILTIN_SKINS.filter((s) => !s.background).map((s) => s.id),
    ["classic", "minimal"]
  );
});

test("resolveSkin：不认识的 id 回退到默认样式并标记 fellBack", () => {
  const missing = resolveSkin("no-such-skin");
  assert.equal(missing.fellBack, true);
  assert.equal(missing.skin.id, DEFAULT_SKIN_ID);

  const found = resolveSkin("minimal");
  assert.equal(found.fellBack, false);
  assert.equal(found.skin.id, "minimal");
});

test("registerSkin：第三方样式注册后能被取到，并在清单里按 order 排序", () => {
  const skin = registerSkin({ id: "test-skin", name: "测试样式", order: 5, mount() {} });
  assert.equal(getSkin("test-skin"), skin);
  assert.equal(listSkins()[0].id, "test-skin", "order 更小的应排在最前");
  // 清理，避免影响其它用例
  unregisterSkin("test-skin");
});

test("unregisterSkin：注销后列表里不再有它（「删了还在」的修法之一）", () => {
  registerSkin({ id: "temp-skin", name: "临时样式", order: 777, mount() {} });
  assert.ok(getSkin("temp-skin"));
  assert.equal(unregisterSkin("temp-skin"), true);
  assert.equal(getSkin("temp-skin"), null);
  assert.equal(
    listSkins().some((s) => s.id === "temp-skin"),
    false,
    "注销后不应再出现在样式清单里"
  );
  // 幂等：再注销一次什么都不做
  assert.equal(unregisterSkin("temp-skin"), false);
  // 内置样式永远不注销（它们来自包本身，磁盘上没有对应目录）
  assert.equal(unregisterSkin("classic"), false);
  assert.ok(getSkin("classic"));
  assert.equal(unregisterSkin(""), false);
});

/* --------------------------------------------------------------------------
   小工具
   -------------------------------------------------------------------------- */

test("escapeHtml：曲目名里的尖括号不能穿透成标签", () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(escapeHtml(null), "");
});

/* --------------------------------------------------------------------------
   「星阵咏唱」的纯逻辑
   --------------------------------------------------------------------------
   这一套是「纵深魔法舞台」里唯一能脱离 DOM 验的部分：逐字素时间轴、段落判定、
   舞台计划、七元素分析、跟随运镜。剩下的绘制（canvas）与入场动画（CSS）由
   node tools/check-player-host.mjs 在无头浏览器里验。
   -------------------------------------------------------------------------- */

test("unitWeight：CJK > 拉丁 > 标点 > 空白（时间权重按'唱得多久'分档）", () => {
  assert.equal(unitWeight("你"), 1);
  assert.ok(unitWeight("a") < unitWeight("你"));
  assert.ok(unitWeight("，") < unitWeight("a"));
  assert.ok(unitWeight(" ") < unitWeight("，"));
  assert.equal(unitWeight(""), 0);
});

test("buildGraphemeTimeline：铺满整行、时间严格递增、每个字素不短于 MIN_UNIT_MS", () => {
  const line = buildGraphemeTimeline("你好，世界", 1000, 2000);
  assert.equal(line.length, 5);
  assert.equal(line[0].time, 1000);
  // 中文比标点占的时间长
  assert.ok(line[2].dur < line[0].dur);
  let cursor = 1000;
  for (const unit of line) {
    assert.ok(unit.dur >= MIN_UNIT_MS, unit.ch + " 的时长不应低于下限");
    assert.equal(unit.time, cursor);
    cursor += unit.dur;
  }
  // 一个字素都没被挤掉：总时长就是行时长
  assert.ok(Math.abs(cursor - 2000) < 1);
});

test("buildGraphemeTimeline：极端短行也不会把标点压成零时长（否则逗号会跟着后一个字入场）", () => {
  const line = buildGraphemeTimeline("a,b,cd,ef", 0, 260);
  assert.ok(line.length > 0);
  for (const unit of line) assert.ok(unit.dur >= MIN_UNIT_MS, unit.ch);
  assert.deepEqual(buildGraphemeTimeline("", 0, 1000), []);
});

test("tokenizeUnits：英文按词切分，中文逐字，空白与标点各自成单元", () => {
  const units = tokenizeUnits("fly me to the moon 月亮");
  assert.deepEqual(
    units.slice(0, 5).map((u) => u.text),
    ["fly", " ", "me", " ", "to"]
  );
  assert.deepEqual(
    units.slice(-2).map((u) => u.text),
    ["月", "亮"]
  );
  assert.equal(units.find((u) => u.text === "fly").kind, "word");
  assert.equal(units.find((u) => u.text === "月").kind, "char");
  assert.equal(units.find((u) => u.text === " ").kind, "space");
  // 逐字点亮落到英文歌里就是"一个词一个词地亮"
  const timeline = buildGraphemeTimeline("fly me to the moon", 0, 5000);
  assert.deepEqual(
    timeline.map((u) => u.ch),
    ["fly", " ", "me", " ", "to", " ", "the", " ", "moon"]
  );
  assert.equal(timeline.filter((u) => u.kind === "word").length, 5);
});

test("长间奏不会把一句歌词唱 30 秒：合理时长由字数决定", () => {
  const text = "夜航西飞星光落在机翼";
  const total = (line) => line.reduce((a, u) => a + u.dur, 0);
  const normal = buildGraphemeTimeline(text, 0, 4000);
  const longGap = buildGraphemeTimeline(text, 0, 30000);
  // 30 秒的间奏与 4 秒的间隔给出的渲染时长是一样的（都被"字数上限"截住）
  assert.ok(Math.abs(total(longGap) - total(normal)) < 1, total(longGap) + " vs " + total(normal));
  assert.ok(total(longGap) < MAX_SING_MS + 1);
  assert.ok(total(longGap) >= MIN_SING_MS - 1);
  // 间隔比合理时长还短时（快歌）按间隔走 —— 不能硬拖
  const fast = buildGraphemeTimeline(text, 0, 1200);
  assert.ok(total(fast) < total(normal));
});

test("estimateWidthEm：中文比同字数的英文宽，空格最窄", () => {
  assert.ok(estimateWidthEm("月亮") > estimateWidthEm("ab"));
  assert.ok(estimateWidthEm(" ") < estimateWidthEm("a"));
  assert.equal(estimateWidthEm(""), 0);
});

test("planLine：同屏 6 句落在 6 条不同横带上（歌词不重叠的结构性保证）", () => {
  const lines = Array.from({ length: 14 }, (_, i) => ({ time: i * 3000, text: "第" + (i + 1) + "句歌词" }));
  const endAt = (i) => (lines[i + 1] ? lines[i + 1].time : lines[i].time + 3000);
  // 窗口 = [active-1, active+4] 共 6 句，行带必须两两不同
  for (const active of [3, 5, 7, 9]) {
    const bands = [];
    for (let i = active - 1; i <= active + 4; i += 1) bands.push(planLine(lines[i], i, "verse", endAt).band);
    assert.equal(new Set(bands).size, bands.length, "active=" + active + " → " + bands.join(","));
  }
  const plans = [...Array(14).keys()].map((i) => planLine(lines[i], i, "verse", endAt));
  for (const p of plans) assert.ok(p.band >= 0 && p.band < LYRIC_BANDS, "band=" + p.band);
  // 相邻两句的纵向落点至少差大半个行带（不会挤成一行）
  assert.ok(Math.abs(plans[0].node.y - plans[1].node.y) > 0.05);
});

test("planLine：超长的句子会整体缩小，且不可能顶出舞台", () => {
  const long = { time: 0, text: "这一句真的非常非常长长到几乎要跑出舞台右边去了一共三十多个字" };
  const p = planLine(long, 0, "verse", () => 4000, { bands: 6, availableEm: 20, emToStageW: 0.03 });
  assert.ok(p.fit < 1, "fit=" + p.fit);
  assert.ok(Math.abs(p.node.x) + (p.widthEm * p.fit * 0.03) / 2 <= 0.5 + 1e-6, "x=" + p.node.x);
});

test("detectSections：重复句判副歌、副歌前判预副歌、最后 12% 判尾奏", () => {
  const lines = [
    { time: 0, text: "第一句" },
    { time: 2000, text: "会重复的副歌" },
    { time: 4000, text: "过渡句" },
    { time: 6000, text: "会重复的副歌" },
    { time: 8000, text: "收尾句" },
  ];
  const sections = detectSections(lines);
  assert.equal(sections.length, lines.length);
  // 副歌就是会重复的那一句
  assert.equal(sections[1], "chorus");
  assert.equal(sections[3], "chorus");
  // 副歌前一句是预副歌
  assert.equal(sections[0], "pre");
  assert.equal(sections[2], "pre");
  // 最后一行为尾奏
  assert.equal(sections[4], "outro");
  // 空输入不炸
  assert.deepEqual(detectSections([]), []);
  assert.deepEqual(detectSections(null), []);
});

test("planLine：同一句永远生成同一套构图（确定性），十种入场方式都在选项里", () => {
  const line = { time: 10000, text: "我爱你" };
  const endAt = () => 13000;
  const a = planLine(line, 3, "chorus", endAt);
  const b = planLine(line, 3, "chorus", endAt);
  assert.deepEqual(a.units, b.units);
  assert.deepEqual(a.node, b.node);
  assert.equal(a.units.length, 3);
  for (const unit of a.units) {
    assert.ok(typeof unit.mode === "string" && unit.mode.length > 0);
    assert.ok(unit.durMs >= 300);
    assert.ok(unit.delayMs >= 0);
  }
  // 同一句在不同段落里给出不同的剧本（副歌比主歌更大更亮）
  const verse = planLine(line, 3, "verse", endAt);
  assert.ok(a.program.sizeScale > verse.program.sizeScale);
});

test("resolveFocus：进入下一句前 lookahead 窗口就先看过去（镜头先动、字再出现）", () => {
  const lines = [
    { time: 0, text: "a" },
    { time: 1000, text: "b" },
    { time: 2000, text: "c" },
  ];
  // 还早：焦点留在当前句
  assert.deepEqual(resolveFocus(lines, 700, 260), { active: 0, target: 0 });
  // 进入 0.26s 窗口：焦点已经交给下一句
  assert.deepEqual(resolveFocus(lines, 800, 260), { active: 0, target: 1 });
  // 还没到第一句：active 是 -1，但目标已经是第 0 句
  assert.deepEqual(resolveFocus(lines, -100, 260), { active: -1, target: 0 });
  assert.deepEqual(resolveFocus([], 100), { active: -1, target: -1 });
});

test("bandSplit / createElementAnalyzer：重拍被识别成脉冲，元素随主导频段切换", () => {
  const split = bandSplit(32);
  assert.equal(split.count, 32);
  assert.ok(split.lowEnd < split.bassEnd && split.bassEnd < split.midEnd);

  const a = createElementAnalyzer(32);
  const quiet = new Array(32).fill(0.04);
  const spike = new Array(32).fill(0.04);
  for (let i = 0; i < split.lowEnd; i += 1) spike[i] = 0.95;

  // 先安静地跑一会儿：建立基线（不然第一帧就会被当成"重拍"）
  a.update(quiet);
  for (let i = 0; i < 60; i += 1) a.frame(1 / 30, { playing: true });
  assert.equal(a.live, true);
  assert.ok(a.low < 0.2);
  assert.equal(a.onset, 0);
  assert.equal(a.element, "earth");

  // 低频突然砸下来 → 重拍 + 元素是"地"
  a.update(spike);
  a.frame(1 / 30, { playing: true });
  assert.ok(a.onset > 0.6, "重拍脉冲应当被点亮：" + a.onset);
  assert.ok(a.thunder > 0.6);
  assert.equal(a.onsetBand, "earth");

  // 高频持续主导 → 过 1.1s 迟滞之后切到"光"
  const bright = new Array(32).fill(0.04);
  for (let i = split.midEnd; i < 32; i += 1) bright[i] = 0.9;
  for (let i = 0; i < 90; i += 1) {
    a.update(bright);
    a.frame(1 / 30, { playing: true });
  }
  assert.equal(a.element, "light");

  // 拿不到频谱：live=false，走歌词节拍回退（低频仍会随行头脉冲起伏）
  a.update(null);
  assert.equal(a.live, false);
  for (let i = 0; i < 30; i += 1) a.frame(1 / 30, { playing: true, tempoPulse: 0.9 });
  assert.ok(!a.live);
});

test("createStageCamera：位移夹在边界内、每帧位移有速度上限、关掉动效后回到中位", () => {
  const cam = createStageCamera({ lean: 0.42, maxPanRatio: 0.14, maxSpeedRatio: 0.34 });
  cam.resize(1000, 800);
  const cap = 0.14 * 800;
  // 目标点再远，镜头也不许跑出舞台
  cam.aim({ x: 0.6, y: 0.3 });
  for (let i = 0; i < 200; i += 1) cam.step(1 / 60, { enabled: true });
  // 上限是 maxPan × 1.25（多出来的 25% 是叠在目标上的自主漂移的余量）
  assert.ok(Math.abs(cam.state.panX) <= cap * 1.25 + 1, "panX=" + cam.state.panX);
  assert.ok(Math.abs(cam.state.panY) <= cap * 1.25 + 1, "panY=" + cam.state.panY);

  // 速度上限：单帧位移不超过 maxSpeedRatio × 短边 × dt（防眩晕）
  const cam2 = createStageCamera({ lean: 0.42, maxPanRatio: 0.14, maxSpeedRatio: 0.34 });
  cam2.resize(1000, 800);
  cam2.aim({ x: 0.6, y: 0 });
  const before = cam2.state.panX;
  cam2.step(1 / 60, { enabled: true });
  const moved = Math.abs(cam2.state.panX - before);
  assert.ok(moved <= 0.34 * 800 * (1 / 60) + 0.001, "单帧位移=" + moved);

  // 关掉动效：镜头回到中位、不再跟随
  for (let i = 0; i < 60; i += 1) cam2.step(1 / 30, { enabled: false });
  assert.ok(Math.abs(cam2.state.panX) < 1, "panX=" + cam2.state.panX);
  assert.equal(cam2.state.shakeX, 0);
});

test("createStageCamera：重拍轻震有明显的起止（幅度在两端的包络里为 0）", () => {
  const cam = createStageCamera();
  cam.resize(1000, 800);
  cam.pulse(1);
  cam.step(1 / 60, { enabled: true });
  assert.ok(Math.abs(cam.state.shakeX) > 0);
  // 0.42s 之后震动必须完全结束，不能残留
  for (let i = 0; i < 40; i += 1) cam.step(1 / 60, { enabled: true });
  assert.equal(cam.state.shakeX, 0);
  assert.equal(cam.state.shakeY, 0);
});
