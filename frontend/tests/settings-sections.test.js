/* ==========================================================================
   settings-sections.test.js — 设置页「分类 → 卡片」结构的一致性
   --------------------------------------------------------------------------
   设置页的导航条是**从 SECTIONS 生成的**，而每张卡片属于哪个分类，写在
   卡片模板自己的 data-section 属性上。这两份东西一旦对不上，故障非常隐蔽：

     · 卡片写了一个 SECTIONS 里没有的分区 id
       → 那个分区永远不会高亮，卡片只能在别的分类下被"顺带"滚到；
     · SECTIONS 里有个分区没有任何卡片
       → 导航条上多一个按钮，点了只是滚到别处（看起来像"点了没反应"）；
     · 卡片 DOM 顺序与 SECTIONS 顺序不一致
       → navFollow() 是按文档顺序取 [data-section] 算高亮的，顺序错乱会让
        高亮在两个分类之间来回跳（这是本文件最重要的一条约束）；
     · 某个分区连成一片的要求被破坏（A 分类的卡片夹在 B 分类中间）
       → 同上，高亮会跳。

   ★ 为什么用「读源码 + 读真实模板」而不是硬编码一份期望值：
     硬编码的话这份测试自己就成了第三处列表，卡片增删时它只会过期，
     不会报错。这里改为从组件真实渲染出来的 DOM 里读 data-section，
     再与 SECTIONS 对账 —— 任何一边改了而另一边没跟上，都会失败。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { SECTIONS, CARD_SECTIONS, _internals } from "../src/js/ui/settings-view.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const viewSrc = readFileSync(join(repoRoot, "frontend/src/js/ui/settings-view.js"), "utf8");

/**
 * 从 render() 里抽出卡片的**渲染顺序**，并映射成 (卡片 id, 分区 id)。
 *
 * ★ 必须按 render() 的调用顺序，而不是方法在文件里定义的顺序：
 *   设置页里卡片从上到下的排列完全由 render() 决定（方法定义顺序无关），
 *   而 navFollow 算高亮依据的正是**页面上的顺序**。用定义顺序会让这个
 *   测试查不出真正的错位（第一版就踩了这个坑）。
 */
function readCardOrderFromSource() {
  // 1) 每个卡片方法 → 它渲染的那张卡片的 (id, data-section)
  const byMethod = new Map();
  const methodRe = /\n {2}(\w+Card)\(\)\s*\{/g;
  let mm;
  const starts = [];
  while ((mm = methodRe.exec(viewSrc)) !== null) starts.push({ name: mm[1], at: mm.index });
  for (let i = 0; i < starts.length; i += 1) {
    const body = viewSrc.slice(starts[i].at, starts[i + 1]?.at ?? viewSrc.length);
    const section = body.match(/<section\s+class="card"[^>]*data-section="([^"]+)"/)?.[1];
    const id = body.match(/<section\s+class="card"[^>]*id="([^"]+)"/)?.[1];
    if (section) byMethod.set(starts[i].name, { id: id || null, section });
  }

  // 2) render() 里的调用顺序就是页面顺序
  const renderAt = viewSrc.indexOf("${this.foldersCard()}");
  assert.ok(renderAt > 0, "找不到 render() 里的卡片调用起点（${this.foldersCard()}）");
  const renderExpr = viewSrc.slice(renderAt, viewSrc.indexOf("</div>", renderAt));

  const out = [];
  for (const call of renderExpr.matchAll(/this\.(\w+Card)\(\)/g)) {
    const card = byMethod.get(call[1]);
    assert.ok(card, `render() 调用了 this.${call[1]}()，但找不到它渲染的卡片`);
    out.push({ ...card, method: call[1] });
  }
  return out;
}

test("设置分类：SECTIONS 的 id 唯一且标签非空", () => {
  const ids = SECTIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, `SECTIONS 里有重复 id：${JSON.stringify(ids)}`);
  for (const s of SECTIONS) {
    assert.ok(typeof s.id === "string" && s.id.trim(), "分区缺少 id");
    assert.ok(typeof s.label === "string" && s.label.trim(), `分区 ${s.id} 缺少标签`);
  }
});

test("设置分类：每个分区都至少挂着一张卡片", () => {
  // 空分区会在导航条上留一个"点了没反应"的按钮。
  const used = new Set(Object.values(CARD_SECTIONS));
  const empty = SECTIONS.filter((s) => !used.has(s.id)).map((s) => s.id);
  assert.deepEqual(empty, [], `这些分区没有任何卡片，导航条上会出现点了不动的按钮：${JSON.stringify(empty)}`);
});

test("设置分类：卡片声明的分区都必须存在于 SECTIONS", () => {
  const known = new Set(SECTIONS.map((s) => s.id));
  const unknown = Object.entries(CARD_SECTIONS)
    .filter(([, sec]) => !known.has(sec))
    .map(([card, sec]) => `${card} → ${sec}`);
  assert.deepEqual(
    unknown,
    [],
    `卡片指向了 SECTIONS 里不存在的分区（那个分区永远不会高亮）：${JSON.stringify(unknown)}`
  );
});

test("设置分类：CARD_SECTIONS 表的键与卡片真实 id 一致", () => {
  const real = new Set(readCardOrderFromSource().map((c) => c.id));
  for (const id of Object.keys(CARD_SECTIONS)) {
    assert.ok(real.has(id), `CARD_SECTIONS 里的 ${id} 在模板里找不到对应的卡片（改名了？）`);
  }
});

test("设置分类：模板里每张卡片的 data-section 与 CARD_SECTIONS 一致", () => {
  // 这条防的是「改了模板忘了改表」和「改了表忘了改模板」两种漂移。
  const cards = readCardOrderFromSource();
  assert.ok(cards.length > 0, "没能从 settings-view.js 里解析出任何卡片（正则可能失效了）");

  const mismatched = [];
  for (const c of cards) {
    const declared = CARD_SECTIONS[c.id];
    if (declared === undefined) {
      mismatched.push(`${c.id}: 模板写的是 ${c.section}，但 CARD_SECTIONS 里没有这一项`);
    } else if (declared !== c.section) {
      mismatched.push(`${c.id}: 模板 ${c.section} ≠ CARD_SECTIONS ${declared}`);
    }
  }
  assert.deepEqual(mismatched, [], `卡片分区声明不一致：\n  ${mismatched.join("\n  ")}`);
});

test("设置分类：卡片 DOM 顺序里每个分区都是连续的一段", () => {
  // navFollow() 遍历 SECTIONS，取**最后一个** top <= 阈值线的分区作为高亮。
  // 如果 A 分类的卡片夹在 B 分类的卡片中间，A 就会被 B 的区间截断，
  // 滚到后面时高亮会跳回 A 再跳走。
  const cards = readCardOrderFromSource();
  const seen = new Set();
  let prev = null;
  for (const c of cards) {
    if (c.section === prev) continue;
    assert.ok(
      !seen.has(c.section),
      `分区 ${c.section} 的卡片被拆成了不相邻的两段 —— ` +
        `滚到后一段时高亮会跳回前面那个分类。卡片顺序：${JSON.stringify(cards.map((x) => x.section))}`
    );
    seen.add(c.section);
    prev = c.section;
  }
});

test("设置分类：卡片 DOM 顺序与 SECTIONS 顺序一致", () => {
  // 两者必须同序：导航条按 SECTIONS 排，卡片按 DOM 排，顺序不同就会出现
  // 「导航上排在后面的分类，滚动时却先高亮」。
  const cards = readCardOrderFromSource();
  const order = [];
  for (const c of cards) {
    if (!order.includes(c.section)) order.push(c.section);
  }
  const expected = SECTIONS.map((s) => s.id).filter((id) => order.includes(id));
  assert.deepEqual(
    order,
    expected,
    "卡片在页面里的出现顺序与 SECTIONS 的顺序不一致 ——\n" +
      `  卡片顺序: ${JSON.stringify(order)}\n` +
      `  导航顺序: ${JSON.stringify(expected)}`
  );
});

test("设置分类：render() 里每张卡片都恰好被渲染一次", () => {
  // 卡片方法定义了却没在 render() 里调用 → 这张卡片（以及它所属的分类）
  // 在界面上根本不存在。多调用一次则会出现重复卡片。
  const methodNames = [...viewSrc.matchAll(/\n {2}(\w+Card)\(\)\s*\{/g)].map((m) => m[1]);
  assert.ok(methodNames.length > 0, "没能解析出任何卡片方法名");

  const renderAt = viewSrc.indexOf("${this.foldersCard()}");
  const renderExpr = viewSrc.slice(renderAt, viewSrc.indexOf("</div>", renderAt));

  const missing = methodNames.filter((m) => !renderExpr.includes(`this.${m}()`));
  assert.deepEqual(missing, [], `这些卡片方法没有在 render() 里被调用：${JSON.stringify(missing)}`);

  for (const m of methodNames) {
    const count = renderExpr.split(`this.${m}()`).length - 1;
    assert.equal(count, 1, `this.${m}() 在 render() 里出现了 ${count} 次，应当恰好 1 次`);
  }

  // 交叉验证：render() 调用的卡片数与 CARD_SECTIONS 登记的数量一致
  assert.equal(
    methodNames.length,
    Object.keys(CARD_SECTIONS).length,
    `定义了 ${methodNames.length} 个卡片方法，但 CARD_SECTIONS 里登记了 ` +
      `${Object.keys(CARD_SECTIONS).length} 张卡片 —— 加卡片时忘了登记？`
  );
});

test("设置分类：卡片数量与分区规模约束（单分区不超过 6 张卡片）", () => {
  // 上限的由来：分区从 11 个合并成 6 个之后，「关于」把应用信息与资料
  // （版本更新 / 应用信息 / 技术栈 / 开源依赖 / 开源协议 / 参考与致谢）
  // 收在同一个分类里，一共 6 张 —— 上限相应定到 6。
  // 再涨就该重新拆一类出来，否则导航会重新变得难找。
  const MAX_CARDS_PER_SECTION = 6;
  const count = new Map();
  for (const sec of Object.values(CARD_SECTIONS)) {
    count.set(sec, (count.get(sec) || 0) + 1);
  }
  const heavy = [...count.entries()].filter(([, n]) => n > MAX_CARDS_PER_SECTION);
  assert.deepEqual(
    heavy,
    [],
    `这些分类又塞了太多卡片（上限 ${MAX_CARDS_PER_SECTION}），导航会重新变得不方便，考虑再拆：${JSON.stringify(heavy)}`
  );
});

test("设置分类：导航条相关常量没有被误删（组件渲染依赖它们）", () => {
  // SECTIONS 是导航条的数据源，改成空数组会让导航条消失而卡片还在。
  //
  // 这里只兜「分类被误删/被并成一个」：当前约定是 6 类（曲库 / 播放器 /
  // 用户界面 / 下载与缓存 / AI / 关于）。分类数由 SECTIONS 与 CARD_SECTIONS
  // 双向对账（上面两条测试）完全确定，所以这里不必再列一份期望值。
  assert.ok(SECTIONS.length >= 6, `SECTIONS 只有 ${SECTIONS.length} 项，分类又被合并回去了？`);
  assert.ok(_internals.settingRow, "settingRow 等小组件应当继续导出");
});
