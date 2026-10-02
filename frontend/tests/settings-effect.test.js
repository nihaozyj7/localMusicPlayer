/* ==========================================================================
   settings-effect.test.js — 音效档位表在前后端之间的一致性
   --------------------------------------------------------------------------
   音效档位这个名字存在**三处**：

     1. Go: internal/audioplay/effects.go  的 EffectPresets（业务真相）
     2. Go: internal/bootstrap/config.go   的 EffectPresets（持久化校验）
     3. JS: settings-view.js               的 EFFECT_PRESETS（界面按钮）

   1 与 2 的一致性由 internal/bootstrap/config_effect_test.go 守住。
   这个文件守的是 1 与 3 —— 也就是"界面画的按钮"和"后端认的档位"。

   ★ 为什么必须测：漂移的症状非常隐蔽。
     · 前端多了一个后端不认的档位 → 点了没反应（后端静默收敛成 off），
       界面还会把按钮标成"选中"，看起来完全正常；
     · 前端少了一个后端认的档位 → 那个音效存进配置后，
       重新打开设置界面时**没有任何按钮是选中的**，用户以为设置丢了；
     · 顺序不同 → 按钮排列与文档/预期不符。
     三种都很难靠肉眼在界面上发现。

   做法：直接读 Go 源码里的档位列表（而不是硬编码一份"期望值"）——
   硬编码的话这个测试自己就成了第四处列表，问题只是被搬了个地方。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { _internals } from "../src/js/ui/settings-view.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

/**
 * 从 Go 源码里抽出一个 `var X = []T{...}` 的元素（按出现顺序）。
 *
 * 两种字面量都要支持，因为两处 Go 列表的写法不同：
 *   · audioplay 用**命名常量**：`EffectOff, EffectVocal, ...`
 *     —— 常量名对应的字符串值要再去 const 块里查；
 *   · bootstrap 用**字符串字面量**：`"off", "vocal", ...`
 *
 * 用解析源码而不是自己维护一份期望列表：见文件头的说明 ——
 * 硬编码期望值会让测试本身成为新的漂移点。
 */
function readGoStringList(relPath, varName) {
  const src = readFileSync(join(repoRoot, relPath), "utf8");

  // ★ 用「找开括号 → 配平到对应的闭括号」而不是正则的懒惰匹配：
  // 两处 Go 列表的排版不同（audioplay 换行、bootstrap 单行），
  // 懒惰匹配 `{...}` 在单行版本上会越过列表本身、一路吃到后面
  // 某个函数的 `}`，于是把函数体里的标识符也当成档位项
  //（实测就是这样把 NormalizeEffectPreset 当成了档位名）。
  const declRe = new RegExp(`var\\s+${varName}\\s*=\\s*\\[\\]\\w+\\s*\\{`);
  const decl = src.match(declRe);
  assert.ok(decl, `在 ${relPath} 里找不到 var ${varName} = []...{（变量改名了？）`);

  const open = decl.index + decl[0].length - 1;
  let depth = 0;
  let close = -1;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  assert.ok(close > open, `在 ${relPath} 里没能为 ${varName} 找到配对的闭括号`);

  const body = src.slice(open + 1, close);

  // 名字引用必须能查到对应常量：建一张「常量名 → 字符串值」的表。
  // 只扫形如 `Name EffectPreset = "value"` 的声明。
  const constTable = new Map();
  const constRe = /(\w+)\s+EffectPreset\s*=\s*"([^"]+)"/g;
  let c;
  while ((c = constRe.exec(src)) !== null) {
    constTable.set(c[1], c[2]);
  }

  const out = [];
  // 逐个 token：字符串字面量直接取，标识符则查常量表
  const tokenRe = /"([^"]+)"|([A-Za-z_]\w*)/g;
  let t;
  while ((t = tokenRe.exec(body)) !== null) {
    if (t[1] !== undefined) {
      out.push(t[1]);
      continue;
    }
    const name = t[2];
    if (constTable.has(name)) {
      out.push(constTable.get(name));
      continue;
    }
    // 常量表里查不到标识符 → 说明它不是档位常量，多半是类型名或写错了。
    // 静默跳过会在"新增档位忘了加 const"时给出一个**看起来通过**的
    // 断言（少了一项但两边都少），所以这里直接失败。
    throw new Error(
      `${relPath} 的 ${varName} 里出现无法解析的标识符 ${name} —— ` +
        `它既不是字符串字面量，也不在 "X EffectPreset = ..." 的常量表里`
    );
  }
  return out;
}

test("音效档位：JS 的按钮表与 Go 的业务表逐项一致", () => {
  const goPresets = readGoStringList("internal/audioplay/effects.go", "EffectPresets");
  const jsPresets = _internals.EFFECT_PRESETS.map((p) => p.value);

  assert.ok(goPresets.length > 0, "没能从 Go 源码里解析出档位（正则可能失效了）");
  assert.deepEqual(
    jsPresets,
    goPresets,
    "前端音效按钮与后端档位不一致（值或顺序）——\n" +
      `  JS: ${JSON.stringify(jsPresets)}\n` +
      `  Go: ${JSON.stringify(goPresets)}`
  );
});

test("音效档位：JS 的按钮表与 bootstrap 的持久化校验表一致", () => {
  const cfgPresets = readGoStringList("internal/bootstrap/config.go", "EffectPresets");
  const jsPresets = _internals.EFFECT_PRESETS.map((p) => p.value);

  assert.ok(cfgPresets.length > 0, "没能从 bootstrap 源码里解析出档位");
  assert.deepEqual(
    jsPresets,
    cfgPresets,
    "前端音效按钮与配置层校验表不一致 ——\n" +
      `  JS:  ${JSON.stringify(jsPresets)}\n` +
      `  Go:  ${JSON.stringify(cfgPresets)}`
  );
});

test("音效档位：每个档位都有非空的中文标签", () => {
  for (const p of _internals.EFFECT_PRESETS) {
    assert.ok(typeof p.value === "string" && p.value, "档位缺少 value");
    assert.ok(typeof p.label === "string" && p.label.trim(), `档位 ${p.value} 缺少标签`);
  }
});

test("音效档位：默认档位是 off 且排在第一个", () => {
  // 默认必须在第一位：分段控件的选中态从 state.config 推导，
  // 而配置缺失时（新装 / 旧版本升级）会取第一个作为兜底显示。
  // 默认档位若不是 off，用户会看到"某个音效被选中"但实际没生效。
  assert.equal(_internals.EFFECT_PRESETS[0].value, "off");
});

test("音效档位：除 off 外每个档位都有说明文案", () => {
  // 说明文案是"用户点之前能知道会发生什么"的唯一途径，
  // 尤其是"3D 环绕"这种各家做法差别很大的名字。
  for (const p of _internals.EFFECT_PRESETS) {
    if (p.value === "off") continue;
    const desc = _internals.EFFECT_DESCRIPTIONS[p.value];
    assert.ok(desc, `档位 ${p.value} 没有说明文案`);
    assert.ok(desc.label && desc.text, `档位 ${p.value} 的说明不完整`);
  }
});

test("音效档位：没有多余的说明文案（防止留着已删除档位的残留）", () => {
  const values = new Set(_internals.EFFECT_PRESETS.map((p) => p.value));
  for (const key of Object.keys(_internals.EFFECT_DESCRIPTIONS)) {
    assert.ok(values.has(key), `说明文案里的 ${key} 不是一个合法档位（档位被删了但文案没删？）`);
  }
});

test("音效档位：store 的默认配置与档位表一致", async () => {
  const { DEFAULT_CONFIG } = await import("../src/js/store.js");
  const values = _internals.EFFECT_PRESETS.map((p) => p.value);

  assert.ok(
    values.includes(DEFAULT_CONFIG.effectPreset),
    `DEFAULT_CONFIG.effectPreset = ${DEFAULT_CONFIG.effectPreset} 不是合法档位`
  );
  assert.equal(DEFAULT_CONFIG.effectPreset, "off", "默认音效必须是关闭（改动音频的处理要用户明确开启）");
});
