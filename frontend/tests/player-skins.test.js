/* ==========================================================================
   player-skins.test.js — 皮肤包（@musicplayer/player-skins）的单测
   --------------------------------------------------------------------------
   覆盖三块**纯逻辑**：
     1. LRC 解析与定位（高亮错行的锅基本都在这里）；
     2. 皮肤契约（缺字段 / 接口版本不符要在加载时就报出来）；
     3. 注册表（内置样式清单与排序、不认识 id 的兜底）。
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
} from "@musicplayer/player-skins";

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
   注册表
   -------------------------------------------------------------------------- */

test("内置样式都在注册表里，且顺序稳定（经典 → 沉浸 → 简约 → 四个特效 → 魔法阵）", () => {
  // 内置样式是「产品的一部分」：这个清单变了就必须有人显式改这里，
  // 免得新增样式时漏注册、或者顺序被无意打乱。
  assert.deepEqual(
    listSkins().map((s) => s.id),
    ["classic", "immersive", "minimal", "anime", "cosmos", "wasteland", "arcade", "magia"]
  );
  assert.deepEqual(
    BUILTIN_SKINS.map((s) => s.id),
    ["classic", "immersive", "minimal", "anime", "cosmos", "wasteland", "arcade", "magia"]
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
  assert.deepEqual(withBg, ["immersive", "anime", "cosmos", "wasteland", "arcade", "magia"]);
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
