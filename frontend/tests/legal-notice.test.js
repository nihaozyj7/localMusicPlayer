/* ==========================================================================
   legal-notice.test.js — 对外告知（版权提示 / 联网与隐私 / 二次确认）的守卫
   --------------------------------------------------------------------------
   这些内容有一个共同特点：**删掉它，程序照样跑，测试也不会红**。
   而它们是 docs/43（在线服务法律风险审查）里成本最低、收益最直接的那几条整改：

     · 下载入口必须经过版权提示（H1）；
     · 「联网与隐私」清单要覆盖代码里真实的每一个联网出口，且能指向关闭开关（M3）；
     · 未校验的更新包必须**二次确认**（M5）；
     · AI 首次启用必须告知「发什么、发到哪」（M2）；
     · 「优先使用逐字歌词」这个开关必须真的三处同步、且渲染在设置里（H2）。

   所以这里既做**结构断言**（清单本身非空、字段齐全），也做**源码断言**
   （提示确实被接在那条路径上）—— 与 no-fire-and-forget.test.js 同一套思路。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { DISCLAIMER, DOWNLOAD_SCOPE, NETWORK_USAGE, PRIVACY_NOTES } from "../src/js/about-info.js";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..", "src", "js");

const read = (rel) => readFileSync(join(srcRoot, rel), "utf8");

/* --------------------------------------------------------------------------
   1. 联网与隐私清单
   -------------------------------------------------------------------------- */

test("联网清单：每条都要写清「做什么 / 连到哪 / 什么时候 / 怎么关」", () => {
  assert.ok(NETWORK_USAGE.length >= 5, `联网清单只有 ${NETWORK_USAGE.length} 条，疑似漏了`);
  for (const u of NETWORK_USAGE) {
    for (const field of ["what", "where", "when", "off"]) {
      assert.ok(
        String(u[field] || "").trim().length > 3,
        `联网清单「${u.what || "?"}」缺少 ${field} —— 只写「可能会联网」等于没写`
      );
    }
  }
});

test("联网清单：代码里真正会联网的出站目标一个都不能漏", () => {
  // 每一条都对应代码里的一个出站模块（见 docs/43 的 §1 数据流向表）。
  // 漏一条 = 用户按清单关掉了所有开关，程序却仍在往那个域名发请求。
  const required = [
    "api.bilibili.com", // services_online.go / internal/bilibili
    "lrclib.net", // internal/lyricsfetch
    "music.163.com", // 歌词 + 封面
    "qq.com", // 歌词 + 封面
    "kugou.com", // 歌词
    "itunes.apple.com", // 封面
    "deezer.com", // 封面
    "musicbrainz.org", // 封面
    "api.github.com", // 更新检查
  ];
  const all = NETWORK_USAGE.map((u) => `${u.where}`).join(" ");
  const missing = required.filter((host) => !all.includes(host));
  assert.deepEqual(missing, [], `联网清单里没有提到这些会联网的目标：${JSON.stringify(missing)}`);
});

test("隐私说明：要如实说明「只发文件名、不发完整路径」", () => {
  // 这一条必须与实现一致：ai_tags.go / services.go 传的是 filepath.Base(path)。
  // 哪天实现改成发整条路径了，这里会红 —— 那时该改的是**文案**，不是测试。
  assert.ok(PRIVACY_NOTES.length >= 3, "隐私说明太少");
  const all = PRIVACY_NOTES.join("\n");
  assert.ok(all.includes("不含完整路径"), "必须写明 AI 只收到文件名（与实现一致）");
  assert.ok(all.includes("不会上传") || all.includes("只存在本机"), "必须说明数据留在本机");
  assert.ok(all.includes("打码"), "必须说明 API Key 不会原样回到界面");
});

/* --------------------------------------------------------------------------
   2. 免责声明
   -------------------------------------------------------------------------- */

test("免责声明：必须包含下载使用范围那一组（两处共用同一份文本）", () => {
  assert.ok(DOWNLOAD_SCOPE.length >= 2, "下载使用范围至少要覆盖「版权归属 + 个人使用」");
  for (const line of DOWNLOAD_SCOPE) {
    assert.ok(
      DISCLAIMER.includes(line),
      "DISCLAIMER 必须原样包含 DOWNLOAD_SCOPE 的每一条 —— 关于页与在线卡片不能各说一套"
    );
  }
  const all = DISCLAIMER.join("\n");
  assert.ok(all.includes("个人学习与欣赏"), "必须写明仅限个人使用");
  assert.ok(all.includes("QRC") && all.includes("KRC"), "必须说明逐字歌词来自第三方私有编码");
});

/* --------------------------------------------------------------------------
   3. 下载入口：先提示再下载
   -------------------------------------------------------------------------- */

test("下载入口必须先过版权提示，再调后端下载", () => {
  const src = read("ui/search.js");
  const start = src.indexOf("async function downloadOnline");
  assert.ok(start > 0, "search.js 里找不到 downloadOnline（改名了？）");
  const body = src.slice(start, start + 900);

  const noticeAt = body.indexOf("confirmDownloadNotice");
  const callAt = body.indexOf("backend.downloadStart");
  assert.ok(noticeAt > 0, "downloadOnline 没有接版权提示 —— 下载是整条链路上唯一的告知点");
  assert.ok(callAt > 0, "downloadOnline 里找不到 backend.downloadStart（实现变了？）");
  assert.ok(noticeAt < callAt, "提示必须发生在真正发起下载之前");
  assert.ok(
    /downloadNoticeAccepted\(\)/.test(body),
    "必须尊重「不再提示」—— 每次下载都弹窗会被当成噪音，用户会条件反射地点确定"
  );
});

/* --------------------------------------------------------------------------
   4. 更新安装：未校验要二次确认
   -------------------------------------------------------------------------- */

test("未校验的更新包必须二次确认（勾选后才允许安装）", () => {
  const src = read("settings.js");
  const at = src.indexOf('case "update-install"');
  assert.ok(at > 0, "settings.js 里找不到 update-install 分支");
  const body = src.slice(at, at + 2200);

  assert.ok(body.includes("unverified"), "没有区分「已校验 / 未校验」两种情况");
  assert.ok(body.includes("confirmUnverified"), "未校验时必须要求用户显式勾选确认项");
  assert.ok(
    /if \(unverified && !values\.confirmUnverified\) return/.test(body),
    "没勾选时必须拦住安装（返回错误文案），而不是照样装下去"
  );
  assert.ok(body.includes("SHA-256"), "提示里应当说明缺的是 SHA-256 校验值");
});

/* --------------------------------------------------------------------------
   5. AI：首次启用告知
   -------------------------------------------------------------------------- */

test("AI 首次配置完成时要告知「发什么、发到哪」", () => {
  const settings = read("settings.js");
  assert.ok(/function confirmAIFirstUse\(/.test(settings), "缺少 AI 首次启用的确认弹窗");
  assert.ok(
    /!wasConfigured && aiConfigured\(\)/.test(settings),
    "确认只应发生在「从没配到配好」的那一次，不能每次改字段都弹"
  );
  const at = settings.indexOf("function confirmAIFirstUse");
  const body = settings.slice(at, at + 1800);
  assert.ok(body.includes("不含完整路径"), "必须说明只发文件名");
  assert.ok(body.includes("境外"), "必须提醒接口地址通常在境外");

  // 常驻说明（弹过一次之后就靠它了）
  const view = read("ui/settings-view.js");
  assert.ok(view.includes("AI 会收到什么"), "AI 卡片里必须有常驻的「会发送什么」说明");
});

/* --------------------------------------------------------------------------
   6. 逐字歌词开关：三处同步 + 渲染出来
   -------------------------------------------------------------------------- */

test("「优先使用逐字歌词」开关：前端状态层与 SYNCED_KEYS 都要有", () => {
  const store = read("store.js");
  assert.ok(/onlineWordLyrics: true/.test(store), "initialState 里缺少 onlineWordLyrics 默认值");
  const at = store.indexOf("const SYNCED_KEYS = [");
  const body = store.slice(at, store.indexOf("];", at));
  assert.ok(body.includes('"onlineWordLyrics"'), "SYNCED_KEYS 里缺少 onlineWordLyrics（漏了会静默丢弃）");

  const view = read("ui/settings-view.js");
  assert.ok(view.includes('switchControl("onlineWordLyrics"'), "开关必须真的渲染在设置里，否则用户无法关掉它");
});

test("联网与隐私清单必须渲染在设置界面里（不能只躺在 about-info.js）", () => {
  const view = read("ui/settings-view.js");
  assert.ok(view.includes("NETWORK_USAGE.map"), "在线卡片没有渲染 NETWORK_USAGE");
  assert.ok(view.includes("PRIVACY_NOTES.map"), "在线卡片没有渲染 PRIVACY_NOTES");
  assert.ok(view.includes("DOWNLOAD_SCOPE.map"), "在线卡片没有渲染下载使用范围");
  // 关于页也要能看到同一份清单（用户最先去的地方）
  assert.ok(/DISCLAIMER\.map/.test(view), "关于页没有渲染 DISCLAIMER");
});
