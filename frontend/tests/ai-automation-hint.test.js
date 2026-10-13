/* ==========================================================================
   ai-automation-hint.test.js — 「AI 会在背后自己跑」这件事必须被说出来
   --------------------------------------------------------------------------
   需求：「对于 AI 的自动化使用，添加一个提示，比如 AI 自动整理元数据、
   自动清洗等」。

   为什么这不是可选项：aiLyricsClean 与 aiDownloadTag **默认都是开**的，
   也就是填完 Base URL + API Key 之后，播放器会在用户没盯着的时候自己调用
   AI —— 一次是匹配歌词前多等十几秒（用户会以为是卡了），另一次是下载结束后
   在后台**改写用户文件里的标签**（不可撤销）。默认开启的行为必须可见。

   这里守住三件事：
     1. 清单本身（ai-automation.js）：两项都在、状态跟着配置走、显式 false 才算关；
     2. 设置界面把清单渲染出来（含当前开 / 关与「关掉即停止」）；
     3. 用户拨开开关时有一条说清后果的提醒（而不是「已开启」三个字）。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  AI_AUTOMATIONS,
  aiAutomationActive,
  aiAutomationNotice,
  aiAutomationState,
} from "../src/js/ai-automation.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const viewSrc = readFileSync(join(root, "frontend", "src", "js", "ui", "settings-view.js"), "utf8");
const settingsSrc = readFileSync(join(root, "frontend", "src", "js", "settings.js"), "utf8");

/* --------------------------------------------------------------------------
   1. 清单：两项自动化，状态跟配置走
   -------------------------------------------------------------------------- */

test("清单覆盖两个默认开启的自动化（清洗元数据 / 整理元数据）", () => {
  const keys = AI_AUTOMATIONS.map((a) => a.key).sort();
  assert.deepEqual(keys, ["aiDownloadTag", "aiLyricsClean"]);
  for (const a of AI_AUTOMATIONS) {
    assert.ok(a.label && a.when && a.detail, `${a.key} 必须写清「叫什么 / 什么时候跑 / 具体做什么」`);
  }
});

test("状态口径与界面开关一致：只有显式 false 才算关（缺字段 = 默认开）", () => {
  const all = aiAutomationState({});
  assert.deepEqual(
    all.map((a) => a.on),
    [true, true],
    "配置缺字段时必须按默认值算「开」—— 否则提示会与开关显示相反"
  );
  assert.equal(aiAutomationActive({}), true);

  const off = aiAutomationState({ aiLyricsClean: false, aiDownloadTag: false });
  assert.deepEqual(
    off.map((a) => a.on),
    [false, false]
  );
  assert.equal(aiAutomationActive({ aiLyricsClean: false, aiDownloadTag: false }), false);
  assert.equal(
    aiAutomationActive({ aiLyricsClean: false, aiDownloadTag: true }),
    true,
    "只要还有一项开着，就还有后台 AI 调用"
  );
});

/* --------------------------------------------------------------------------
   2. 开启时的提醒：说清后果与关法
   -------------------------------------------------------------------------- */

test("打开「下载后整理」时，提醒必须点出「会写回文件标签、不可撤销」", () => {
  const text = aiAutomationNotice("aiDownloadTag");
  assert.match(text, /写回文件标签/);
  assert.match(text, /不可撤销/);
  assert.match(text, /关掉/, "必须告诉用户怎么停 —— 默认开启 + 后台改写文件，只提示「已开启」不合格");
});

test("打开「歌词清洗」时，提醒必须点出「要等一次 AI 调用」", () => {
  const text = aiAutomationNotice("aiLyricsClean");
  assert.match(text, /AI 调用/);
  assert.match(text, /关掉/);
});

test("未知开关不产生提示（避免误报）", () => {
  assert.equal(aiAutomationNotice("animals"), "");
  assert.equal(aiAutomationNotice(undefined), "");
});

/* --------------------------------------------------------------------------
   3. 源码级不变量：设置界面真的渲染它、拨开关真的提醒
   -------------------------------------------------------------------------- */

test("设置界面：AI 卡片里必须有一块「AI 自动化」提示，并列出每一项的当前状态", () => {
  assert.match(viewSrc, /id="ai-automation-note"/, "提示块要有 id（自检脚本与测试按它查）");
  assert.match(viewSrc, /aiAutomationState\(cfg\)\.map/, "每一项都要出现在界面里，而不是只写一句笼统的话");
  assert.match(viewSrc, /当前<b>\$\{a\.on \? "已开启" : "已关闭"\}<\/b>/, "必须显示当前是开还是关");
  assert.match(viewSrc, /关掉对应的开关即立刻停止/, "要说明「关掉即停止」——默认开启的行为必须给出口");
  assert.match(viewSrc, /aiAutomationActive\(cfg\)/, "两项都关时的说明要另写一句（AI 只在手动触发时运行）");
});

test("settings.js：拨开这两个开关时必须弹提醒", () => {
  const start = settingsSrc.indexOf("export function handleSettingControl(");
  assert.ok(start > 0, "settings.js 里没有 handleSettingControl");
  const body = settingsSrc.slice(start, settingsSrc.indexOf("\n}\n", start));
  assert.match(body, /toggleKey === "aiLyricsClean" \|\| toggleKey === "aiDownloadTag"/, "两个自动化开关都要覆盖");
  assert.match(body, /if \(next &&/, "只在**打开**时提醒：关掉的时候用户已经知道自己在关什么");
  assert.match(body, /aiAutomationNotice\(toggleKey\)/, "文案必须来自唯一那份清单");
  assert.match(body, /toast\(notice/, "要真的弹出来（而不是拼好字符串丢掉）");
});
