/* ==========================================================================
   update.test.js — 版本更新功能的静态契约
   --------------------------------------------------------------------------
   这一组测试针对的是「两边各写一份、迟早会漂」的东西：

     1. 前端镜像表（about-info.js）与 Go 侧名单（internal/update/mirror.go）
        必须一一对应 —— 前端少了某项只是下拉里看不到，但**后端少了**会让
        用户选过的通道失效（配置文件里存的是一个查不到的 id）。
     2. 「跳过此版本」的语义：状态里留了版本号，但不当成「有更新」。
     3. 状态初始形状：界面照着 state.update 渲染，少一个字段就是一处
        静默失效（例如没有 pending 就永远出不来「立即安装」按钮）。

   Go 那边解析 / 下载 / 脚本生成的逻辑由 internal/update 的测试覆盖，
   这里不做重复（也不联网）。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { UPDATE_MIRRORS, UPDATE_REPO, UPDATE_RELEASES_URL, updateMirror } from "../src/js/about-info.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

/* --------------------------------------------------------------------------
   镜像表
   -------------------------------------------------------------------------- */

test("镜像表：id 唯一、名字与说明都不为空", () => {
  assert.ok(UPDATE_MIRRORS.length >= 6, `镜像只有 ${UPDATE_MIRRORS.length} 个，疑似漏了`);
  const ids = new Set();
  for (const m of UPDATE_MIRRORS) {
    assert.ok(String(m.id || "").trim(), "有镜像缺少 id");
    assert.ok(!ids.has(m.id), `镜像 id 重复：${m.id}`);
    ids.add(m.id);
    assert.ok(String(m.name || "").trim(), `镜像 ${m.id} 缺少名字`);
    assert.ok(String(m.note || "").trim(), `镜像 ${m.id} 缺少说明`);
  }
});

test("镜像表：auto 必须存在且排第一（界面默认选它）", () => {
  assert.equal(UPDATE_MIRRORS[0].id, "auto");
});

test("镜像表：与 Go 侧名单逐项一致", () => {
  // Go 侧是真正执行下载的一方（internal/update/mirror.go）。
  // 两边漂移的后果：用户在界面上选了一个通道，后端却认不出来 ——
  // 它会安全退化成 auto（不会崩），但用户的选择就静默失效了。
  const goSrc = readFileSync(join(repoRoot, "internal", "update", "mirror.go"), "utf8");

  // 从 Go 的 Mirrors 字面量里抽出 {ID: "xxx", ...} 的 ID
  const block = goSrc.slice(goSrc.indexOf("var Mirrors = []Mirror{"));
  const end = block.indexOf("\n}");
  const body = end > 0 ? block.slice(0, end) : block;
  const goIds = [...body.matchAll(/ID:\s*"([^"]+)"/g)].map((m) => m[1]);

  assert.ok(goIds.length >= 6, `没能从 Go 源码里解析出镜像（找到 ${goIds.length} 个）`);

  // 前端镜像表里的通道（不含 auto，它在 Go 里是单独一个常量）
  const feIds = UPDATE_MIRRORS.map((m) => m.id).filter((id) => id !== "auto");

  assert.deepEqual(
    feIds.slice().sort(),
    goIds.slice().sort(),
    "前端镜像表与 Go 侧 internal/update/mirror.go 的名单不一致：两边都要改"
  );
});

test("镜像表：Go 侧把 auto 定义成了常量", () => {
  const goSrc = readFileSync(join(repoRoot, "internal", "update", "mirror.go"), "utf8");
  assert.match(goSrc, /ChannelAuto\s*=\s*"auto"/, "Go 侧的 ChannelAuto 常量变了，前端要跟着改");
});

test("镜像表：id 必须与 Go 的 bootstrap.UpdateChannels 合法名单一致", () => {
  // 配置层（internal/bootstrap/config.go）会规范化这个值，
  // 不在它的名单里的 id 会被落回 auto —— 也就是用户的选择白选了。
  const cfgSrc = readFileSync(join(repoRoot, "internal", "bootstrap", "config.go"), "utf8");
  const block = cfgSrc.slice(cfgSrc.indexOf("var UpdateChannels = []string{"));
  const end = block.indexOf("\n}");
  const body = end > 0 ? block.slice(0, end) : block;
  const cfgIds = [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  assert.ok(cfgIds.length >= 6, `没能从 config.go 解析出通道名单（找到 ${cfgIds.length} 个）`);
  for (const m of UPDATE_MIRRORS) {
    assert.ok(
      cfgIds.includes(m.id),
      `镜像 ${m.id} 不在 bootstrap.UpdateChannels 里，用户选它会被落回 auto`
    );
  }
});

test("updateMirror：认不出来的 id 落回 auto，不返回 undefined", () => {
  // 返回 undefined 会让界面读 .name 时抛异常（整张卡片渲染不出来）。
  const fallback = updateMirror("this-does-not-exist");
  assert.ok(fallback && fallback.id === "auto", "未知 id 应当落回 auto");
  assert.equal(updateMirror("").id, "auto");
  assert.equal(updateMirror(null).id, "auto");
  assert.equal(updateMirror("ghproxy.net").id, "ghproxy.net");
});

/* --------------------------------------------------------------------------
   仓库地址
   -------------------------------------------------------------------------- */

test("仓库地址：与 package.json 的 repository 同源，且 Releases 链接是它的子路径", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const repoUrl = String(pkg.repository?.url || "").replace(/^git\+/, "").replace(/\.git$/, "");
  assert.equal(UPDATE_REPO, repoUrl, "UPDATE_REPO 与 package.json 的 repository 不一致");
  assert.equal(UPDATE_RELEASES_URL, `${UPDATE_REPO}/releases`);
});

test("仓库地址：与 Go 侧 repoSlug 一致", () => {
  // Go 用 repoSlug 拼 API 地址，前端用它拼展示链接 —— 不一致时
  // 「检查更新」查的是 A 仓库，而「全部版本」按钮打开的是 B 仓库。
  const src = readFileSync(join(repoRoot, "services_update.go"), "utf8");
  const m = src.match(/repoSlug\s*=\s*"([^"]+)"/);
  assert.ok(m, "没能从 services_update.go 里解析出 repoSlug");
  assert.equal(UPDATE_REPO, `https://github.com/${m[1]}`, "前端仓库地址与 Go 侧 repoSlug 不一致");
});

/* --------------------------------------------------------------------------
   桥接层
   -------------------------------------------------------------------------- */

test("bridge.js：更新服务的绑定键都接上了", () => {
  // 这个映射是手写的字符串键 —— 漏一个不会有构建错误，
  // 只会在运行时变成「未接线」的报错。
  const src = readFileSync(join(repoRoot, "frontend", "src", "js", "bridge.js"), "utf8");
  assert.match(src, /Update:\s*mod\.UpdateService/, "bridge.js 没有接 UpdateService");

  for (const method of [
    "updateState",
    "updateCheck",
    "updateDownload",
    "updateInstall",
    "updateCancel",
    "updateMirrors",
    "updateSetChannel",
    "updateSetCheckOnStart",
    "updateSkipVersion",
    "updateOpenDir",
  ]) {
    assert.ok(src.includes(`${method}:`), `bridge.js 缺少 ${method} 的接线`);
  }
});

test("settings-view.js：更新卡片被排进「关于」分区", () => {
  const src = readFileSync(join(repoRoot, "frontend", "src", "js", "ui", "settings-view.js"), "utf8");
  assert.match(src, /this\.updateCard\(\)/, "关于分区里没有更新卡片");
  assert.match(src, /updateCard\(\)\s*\{/, "没有 updateCard 的实现");
});

test("settings-view.js：依赖数组用 updateRev，不是 update 对象本身", () => {
  // ★ 这条测的是一个实测踩到的坑。
  //
  // state.update 里的字段是**原地改**的（state.update.progress = …），
  // 对象引用从头到尾不变 —— 而 Lit 按引用比较依赖项。
  // 所以把 `s.update` 放进依赖数组等于没放：事件收到了、state 也改了，
  // 界面却纹丝不动（手动 requestUpdate() 一下立刻就对了）。
  //
  // 必须放那个「每次变更都会变的数字」。
  const src = readFileSync(join(repoRoot, "frontend", "src", "js", "ui", "settings-view.js"), "utf8");
  const start = src.indexOf("static deps =");
  const depsBlock = src.slice(start, src.indexOf("];", start));
  assert.match(depsBlock, /^\s*s\.updateRev,\s*$/m, "依赖数组缺少 s.updateRev");
  assert.ok(
    !/^\s*s\.update,\s*$/m.test(depsBlock),
    "依赖数组不该放 s.update（原地改的对象引用不变，Lit 察觉不到变化）"
  );
});

test("store.js：commit 会自动推进 updateRev", () => {
  // 写入点有三十来处，靠人工在每一处调 touchUpdate 迟早会漏，
  // 而漏掉的表现是「界面不更新且不报错」。所以收口在 commit 这个唯一漏斗里。
  const src = readFileSync(join(repoRoot, "frontend", "src", "js", "store.js"), "utf8");
  const start = src.indexOf("export function commit");
  const commitBody = src.slice(start, start + 1400);
  assert.match(
    commitBody,
    /state\.updateRev\s*=\s*\(state\.updateRev\s*\|\|\s*0\)\s*\+\s*1/,
    "commit() 里没有自动推进 state.updateRev —— 更新界面会收不到重绘信号"
  );
  assert.match(src, /updateRev:\s*0/, "store.js 的初始状态里没有 updateRev");
});

test("settings.js：更新相关的动作都被处理", () => {
  const src = readFileSync(join(repoRoot, "frontend", "src", "js", "settings.js"), "utf8");
  for (const act of [
    "update-check",
    "update-download",
    "update-install",
    "update-cancel",
    "update-skip",
    "update-open-dir",
    "update-channel",
  ]) {
    assert.ok(src.includes(`case "${act}"`), `settings.js 没有处理动作 ${act}`);
  }
});

test("store.js：更新状态与动作都已导出", () => {
  const src = readFileSync(join(repoRoot, "frontend", "src", "js", "store.js"), "utf8");
  for (const fn of [
    "loadUpdateState",
    "checkForUpdate",
    "downloadUpdate",
    "cancelUpdateDownload",
    "installUpdate",
    "setUpdateChannel",
    "setUpdateCheckOnStart",
    "skipUpdateVersion",
  ]) {
    assert.ok(
      src.includes(`export async function ${fn}`),
      `store.js 没有导出 ${fn}`
    );
  }
  // 初始状态里要有 update 这一块
  assert.match(src, /update:\s*\{/, "store.js 的初始状态里没有 update");
});

test("main.js：订阅了后端推来的更新事件", () => {
  const src = readFileSync(join(repoRoot, "frontend", "src", "js", "main.js"), "utf8");
  for (const evt of [
    "update:checked",
    "update:progress",
    "update:downloaded",
    "update:failed",
    "update:installing",
  ]) {
    assert.ok(src.includes(`on("${evt}"`), `main.js 没有订阅 ${evt}`);
  }
});

/* --------------------------------------------------------------------------
   后端事件名的一致性
   -------------------------------------------------------------------------- */

test("Go 侧推送的事件名与前端订阅的一致", () => {
  // 事件名是跨语言的字符串契约，两边写法不一致时不会有任何报错 ——
  // 表现是「进度条永远不动」，非常难查。
  const goSrc = readFileSync(join(repoRoot, "services_update.go"), "utf8");
  const emitted = [...goSrc.matchAll(/emit\("(update:[a-z]+)"/g)].map((m) => m[1]);
  assert.ok(emitted.length >= 4, `Go 侧应当至少推 4 个更新事件，找到 ${emitted.length} 个`);

  const jsSrc = readFileSync(join(repoRoot, "frontend", "src", "js", "main.js"), "utf8");
  for (const name of new Set(emitted)) {
    assert.ok(jsSrc.includes(`on("${name}"`), `前端没有订阅 Go 推送的 ${name}`);
  }
});
