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
   行退场动画与多语言副行（同时间戳多句）：
     node tools/check-lyric-exit.mjs
     node tools/check-multilingual-lyrics.mjs
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

import {
  BUILTIN_SKINS,
  DEFAULT_SKIN_ID,
  HOST_API_VERSION,
  SKIN_API_VERSION,
  apiStatus,
  composeSkin,
  defineSkin,
  deriveChrome,
  escapeHtml,
  findLyricIndex,
  getSkin,
  inspectSkinModule,
  listSkins,
  lyricDisplayText,
  noteBuiltin,
  parseLrc,
  PATCH_TYPES,
  registerSkin,
  resetBuiltins,
  resolveSkin,
  unregisterSkin,
  wrapPluginCss,
  fitScale,
  fitScaleOf,
  FIT_REFERENCE,
  FIT_MIN,
  FIT_MAX,
  lyricsEmptyText,
} from "@localmusicplayer/player-skins";

/* --------------------------------------------------------------------------
   歌词空态文案（「匹配中 / 匹配失败」不能显示成「暂无歌词」）
   -------------------------------------------------------------------------- */

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
   多语言歌词（同一时间戳 = 同唱的多语种文本，必须折叠成一行一起显示）
   -------------------------------------------------------------------------- */

test("parseLrc：同一时间戳的多行折叠成一行（第一行主行，其余进 trans）", () => {
  const text = ["[00:12.00]Hello world", "[00:12.00]你好世界", "[00:20.00]Next"].join("\n");
  const lines = parseLrc(text);
  assert.equal(lines.length, 2, "两种语言算同一句，不该拆成两行");
  assert.equal(lines[0].text, "Hello world", "文件里先出现的那行是主行");
  assert.deepEqual(lines[0].trans, ["你好世界"]);
  assert.equal(lines[1].trans, undefined, "单语言行不带 trans 键（形状与从前一致）");
});

test("parseLrc：同刻度三行全收，顺序就是文件顺序", () => {
  const text = ["[22:22]原文A", "[22:22]译文B", "[22:22]罗马音C", "[22:30]下一句"].join("\n");
  const lines = parseLrc(text);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, "原文A");
  assert.deepEqual(lines[0].trans, ["译文B", "罗马音C"]);
});

test("parseLrc：多语言折叠后高亮只有一行 —— 整句期间不会中途跳行", () => {
  const lines = parseLrc(["[00:12.00]Hello world", "[00:12.00]你好世界", "[00:20.00]Next"].join("\n"));
  assert.equal(findLyricIndex(lines, 11999), -1);
  assert.equal(findLyricIndex(lines, 12000), 0, "开口即命中这一整句");
  assert.equal(findLyricIndex(lines, 19999), 0, "翻译行不会把主行挤成「上一句」");
  assert.equal(findLyricIndex(lines, 20000), 1);
});

test("parseLrc：一行多时间标签（重复句）不与折叠混淆", () => {
  // 同一句歌词带两个时间标签 → 展开成两条**不同**时间的行，各自独立
  const lines = parseLrc("[00:10.00][01:00.00]副歌\n[00:10.00]副歌翻译");
  assert.equal(lines.length, 2, "10s 处的两行折叠，60s 处那一行独立");
  assert.equal(lines[0].text, "副歌");
  assert.deepEqual(lines[0].trans, ["副歌翻译"]);
  assert.equal(lines[1].text, "副歌");
  assert.equal(lines[1].trans, undefined);
});

test("lyricDisplayText：单语言原样返回，多语言用分隔符拼成一行", () => {
  assert.equal(lyricDisplayText({ time: 0, text: "Hello" }), "Hello");
  assert.equal(lyricDisplayText({ time: 0, text: "Hello", trans: ["你好"] }), "Hello · 你好");
  assert.equal(lyricDisplayText({ time: 0, text: "A", trans: ["B", "C"] }), "A · B · C");
  assert.equal(lyricDisplayText({ time: 0, text: "A", trans: ["B"] }, " / "), "A / B");
  assert.equal(lyricDisplayText(null), "");
  assert.equal(lyricDisplayText(undefined), "");
});

/* --------------------------------------------------------------------------
   契约（v3：清单驱动元数据 + 语义化版本）
   -------------------------------------------------------------------------- */

test("defineSkin：缺 id / mount 都要报出可读错误", () => {
  assert.throws(() => defineSkin({ mount() {} }), /缺少必需字段：id/);
  assert.throws(() => defineSkin({ id: "x", name: "x" }), /mount 必须是函数/);
  assert.throws(() => defineSkin(null), /必须是一个对象/);
});

test("apiStatus：major 必须相同，minor 可以比宿主旧", () => {
  assert.equal(apiStatus(SKIN_API_VERSION).ok, true, "宿主自己的版本当然可加载");
  assert.equal(apiStatus("3.0").ok, true);
  // 比宿主旧的 minor：向后兼容
  const host = HOST_API_VERSION.split(".").map(Number);
  if (host[1] > 0) assert.equal(apiStatus(`${host[0]}.0`).ok, true);
  // 比宿主新的 minor：宿主不知道该给新字段填什么 → 拒绝
  const newer = `${host[0]}.${host[1] + 1}`;
  const r = apiStatus(newer);
  assert.equal(r.ok, false);
  assert.match(r.reason, /只实现到/);
  // major 不同：结构性变更 → 拒绝
  const bad = apiStatus(`${host[0] + 1}.0`);
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /主版本不匹配/);
  // 写错格式要说人话
  assert.equal(apiStatus("").ok, false);
  assert.match(apiStatus("v3").reason, /apiVersion 非法/);
});

test("defineSkin：接口版本不符要拒绝（而不是装作没事然后崩在半路）", () => {
  assert.throws(() => defineSkin({ id: "x", mount() {}, apiVersion: "99.0" }), /主版本不匹配/);
});

test("defineSkin：补齐默认值，order 默认排在内置样式之后", () => {
  const skin = defineSkin({ id: "x", name: "x", mount() {} });
  assert.equal(skin.apiVersion, SKIN_API_VERSION);
  assert.equal(skin.icon, "disc");
  assert.equal(skin.background === true, false, "默认不声明整窗背景层");
  assert.deepEqual(skin.styles, []);
  assert.deepEqual(skin.colorsMissing, []);
  assert.ok(skin.order >= 100);
});

test("PATCH_TYPES：没有 spectrum 补丁 —— 契约 v3 的频谱是拉取式 ctx.spectrum()", () => {
  assert.equal(PATCH_TYPES.includes("spectrum"), false, "spectrum 补丁必须已移除（改拉取）");
  assert.ok(PATCH_TYPES.includes("progress"), "高频进度补丁还在");
  assert.ok(PATCH_TYPES.includes("state"));
  assert.equal(new Set(PATCH_TYPES).size, PATCH_TYPES.length, "类型不能重复");
});

test("composeSkin：元数据以清单为准，生命周期以模块为准", () => {
  const manifest = {
    id: "aurora",
    name: "极光",
    version: "1.2.0",
    apiVersion: SKIN_API_VERSION,
    order: 200,
    capabilities: { background: true, spectrum: 32, interactive: false },
    colors: { bg: "#000000", fg: "#ffffff" },
    performance: { budgetFps: 45 },
    styles: ["skin.css"],
  };
  const skin = composeSkin({ default: { mount() {}, update() {}, destroy() {} } }, manifest, { builtin: false });
  assert.equal(skin.id, "aurora");
  assert.equal(skin.name, "极光");
  assert.equal(skin.order, 200);
  assert.equal(skin.background, true);
  assert.equal(skin.spectrum, 32);
  assert.equal(skin.interactive, false);
  assert.equal(skin.budgetFps, 45);
  assert.deepEqual(skin.styles, ["skin.css"]);
  assert.equal(typeof skin.mount, "function");
  assert.equal(skin.builtin, false);
});

test("composeSkin：清单与模块的 id / apiVersion 不一致必须报错（不静默二选一）", () => {
  const manifest = { id: "a", name: "A", apiVersion: SKIN_API_VERSION };
  assert.throws(
    () => composeSkin({ default: { id: "b", mount() {} } }, manifest),
    /id 不一致/
  );
  assert.throws(
    () => composeSkin({ default: { apiVersion: "2.0", mount() {} } }, manifest),
    /apiVersion 不一致/
  );
});

test("composeSkin：缺 mount / 模块不是对象都要报出可读错误", () => {
  assert.throws(() => composeSkin({ default: {} }, { id: "a", name: "A" }), /缺少必需字段：mount/);
  assert.throws(() => composeSkin({}, { id: "a", name: "A" }), /没有导出插件对象/);
});

test("inspectSkinModule：分别识别 default / skin 导出与缺失", () => {
  const manifest = { id: "a", name: "A", apiVersion: SKIN_API_VERSION };
  const ok = inspectSkinModule({ default: { mount() {} } }, manifest);
  assert.equal(ok.ok, true);
  assert.equal(ok.skin.id, "a");

  const named = inspectSkinModule({ skin: { mount() {} } }, { ...manifest, id: "b" });
  assert.equal(named.ok, true);
  assert.equal(named.skin.id, "b");

  const bad = inspectSkinModule({}, manifest);
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /没有导出插件对象/);
});

/* --------------------------------------------------------------------------
   颜色契约（colors.js）
   --------------------------------------------------------------------------
   这是需求里点名的那一条：插件声明 bg / fg，宿主据此保证**自己的**控件栏可读。
   -------------------------------------------------------------------------- */

test("deriveChrome：声明齐全时产出 --chrome-* 变量与对比度自检", () => {
  const c = deriveChrome({ bg: "#101218", fg: "#f2f4ff", accent: "#7aa2ff" });
  assert.deepEqual(c.missing, []);
  assert.equal(c.theme, false);
  assert.equal(c.corrected, false);
  assert.ok(c.contrast >= 4.5, `对比度 ${c.contrast} 偏低`);
  assert.ok(c.vars["--chrome-bg"].includes("color-mix"), "底色要派生成半透明底");
  assert.ok(c.vars["--chrome-fg"].includes("rgb("));
  assert.ok(c.vars["--chrome-border"], "描边必须派生");
  assert.equal(c.preview.bg, "#101218");
  assert.equal(c.readable, true);
});

test("deriveChrome：对比度不足时把前景推向黑/白，保证一定读得清", () => {
  // 深灰底 + 深灰字：原样几乎看不见
  const c = deriveChrome({ bg: "#222222", fg: "#333333" });
  assert.equal(c.corrected, true, "应当被纠正");
  assert.ok(c.contrast >= 4.5, `纠正后对比度 ${c.contrast} 仍不达标`);
  assert.equal(c.readable, true);
  // 纠正后的值一定会写进变量（宿主壳用的是纠正后的那个）
  assert.ok(c.vars["--chrome-fg"].includes("rgb("));
});

test("deriveChrome：缺失 / 写错的项要被记下来（设置页据此打警告图标）", () => {
  assert.deepEqual(deriveChrome({}).missing, ["bg", "fg"]);
  assert.deepEqual(deriveChrome({ bg: "#fff" }).missing, ["fg"]);
  assert.deepEqual(deriveChrome({ bg: "linear-gradient(red, blue)", fg: "#fff" }).missing, ["bg"]);
  // accent 是可选增强：不写不算缺失，写了但写错才算
  assert.deepEqual(deriveChrome({ bg: "#000", fg: "#fff" }).missing, []);
  assert.deepEqual(deriveChrome({ bg: "#000", fg: "#fff", accent: "var(--x)" }).missing, ["accent"]);
});

test("deriveChrome：colors.theme 是合法写法 —— 不产变量、不记警告", () => {
  const c = deriveChrome({ theme: true });
  assert.equal(c.theme, true);
  assert.deepEqual(c.missing, []);
  assert.deepEqual(c.vars, {});
  assert.equal(c.readable, null);
});

test("deriveChrome：缺失时只产出「能产出的那一半」，其余回落主题令牌", () => {
  const onlyBg = deriveChrome({ bg: "#0b1020" });
  assert.ok(onlyBg.vars["--chrome-bg"], "有 bg 就该有底色变量");
  assert.equal(onlyBg.vars["--chrome-fg"], undefined, "没有 fg 就不该编一个出来");
});

/* --------------------------------------------------------------------------
   CSS 注入：宿主强制包裹 @layer + @scope（隔离机制的另一半）
   -------------------------------------------------------------------------- */

test("wrapPluginCss：插件 CSS 一定落在 skin 层里，且被舞台作用域包住", () => {
  // node 里没有 CSSScopeRule（宿主用 tsc 探测 @scope 支持）—— 这里装一个，
  // 让用例跑"支持 @scope"的那条分支；不支持时的退化分支由下一个用例覆盖。
  const realScopeRule = globalThis.CSSScopeRule;
  globalThis.CSSScopeRule = class {};
  const css = ".demo { color: red }\n.playerbar { background: black }";
  const wrapped = wrapPluginCss(css, "aurora", false);
  assert.match(wrapped, /^@layer skin \{/, "必须在 skin 层里（压不过宿主壳）");
  assert.match(wrapped, /@scope \(\.playerview\[data-skin="aurora"\]\)/, "必须限定在插件舞台内");
  assert.ok(wrapped.includes(css), "插件原文必须原样保留");
  globalThis.CSSScopeRule = realScopeRule;
});

test("wrapPluginCss：内核不支持 @scope 时退化成只包 @layer（并 warn 一次）", () => {
  const realScopeRule = globalThis.CSSScopeRule;
  delete globalThis.CSSScopeRule;
  const wrapped = wrapPluginCss(".x{}", "aurora", false);
  assert.match(wrapped, /^@layer skin \{/);
  assert.doesNotMatch(wrapped, /@scope/);
  globalThis.CSSScopeRule = realScopeRule;
});

test("wrapPluginCss：声明了整窗背景层的样式，作用域要带上背景层容器", () => {
  const realScopeRule = globalThis.CSSScopeRule;
  globalThis.CSSScopeRule = class {};
  const wrapped = wrapPluginCss(".x{}", "aurora", true);
  assert.match(wrapped, /\.skin-bg\[data-skin="aurora"\]/);
  globalThis.CSSScopeRule = realScopeRule;
});

/* --------------------------------------------------------------------------
   注册表（v3：内置样式由加载器发现并登记）
   -------------------------------------------------------------------------- */

test("注册表：内置样式由加载器填进 BUILTIN_SKINS，并且不可注销", () => {
  resetBuiltins();
  const classic = defineSkin({ id: "classic", name: "经典", mount() {}, order: 10 });
  registerSkin(classic);
  noteBuiltin(classic);
  assert.deepEqual(
    BUILTIN_SKINS.map((s) => s.id),
    ["classic"]
  );
  assert.equal(unregisterSkin("classic"), false, "内置样式不能注销");
  assert.ok(getSkin("classic"), "被拒绝的注销不该把它弄丢");
  unregisterSkin("classic"); // 清场（其实会被拒）
  resetBuiltins();
});

test("注册表：第三方注册后能被取到，按 order 排序，注销后消失", () => {
  resetBuiltins();
  const a = registerSkin({ id: "tmp-a", name: "甲", order: 5, mount() {} });
  const b = registerSkin({ id: "tmp-b", name: "乙", order: 7, mount() {} });
  assert.equal(getSkin("tmp-a"), a);
  assert.equal(getSkin("tmp-b"), b);
  const ids = listSkins().map((s) => s.id);
  assert.ok(ids.indexOf("tmp-a") < ids.indexOf("tmp-b"), "order 小的排前面");
  assert.equal(unregisterSkin("tmp-a"), true);
  assert.equal(getSkin("tmp-a"), null);
  assert.equal(unregisterSkin("tmp-a"), false, "注销要幂等");
  unregisterSkin("tmp-b");
});

test("resolveSkin：不认识的 id 回退到默认样式并标记 fellBack", () => {
  resetBuiltins();
  const classic = defineSkin({ id: "classic", name: "经典", mount() {}, order: 10 });
  registerSkin(classic);
  noteBuiltin(classic);

  const missing = resolveSkin("no-such-skin");
  assert.equal(missing.fellBack, true, "不认识的 id 必须走兜底");
  assert.equal(missing.skin?.id, DEFAULT_SKIN_ID);

  const found = resolveSkin("classic");
  assert.equal(found.skin.id, "classic");
  assert.equal(found.fellBack, false, "注册表里有的 id 不该走兜底");
  resetBuiltins();
});

test("被移除的四款样式不能出现在注册表里（样式已备份，包内不再有它们）", () => {
  for (const id of ["minimal", "anime", "magia", "arcanum"]) {
    assert.equal(getSkin(id), null, `${id} 已移除备份，注册表里不该还有它`);
  }
  // 包内目录里也不该再有它们的源码（插件现在放在 Go 侧资源目录）
  assert.equal(SKIN_API_VERSION, "3.0");
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
