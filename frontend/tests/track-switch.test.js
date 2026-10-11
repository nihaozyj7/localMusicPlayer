/* ==========================================================================
   track-switch.test.js — 切歌时进度条不能横跳
   --------------------------------------------------------------------------
   用户报的现象：「切换到下一首的时候，当前歌曲会继续播放一会儿，下一首要过
   一会儿才会被播放，而且进度条也有问题，会反复横跳一下」。

   「下一首要过一会儿」是后端的账（切歌间隔把新歌压着不出声，见
   services_player_test.go 的第 12 组用例）；本文件锁的是**前端**这半：

     t0  用户点下一首 → store 把 state.position 清零、currentId 换成新歌；
     t1  新歌的 playerLoad 还在跑（要等一次 IPC 往返与锁）；
     t2  但 audio.js 里的 `anchor` 还是**旧歌**的 —— 后端每 500ms
         推一次锚点（anchorIntervalMs），外推也仍在按旧锚点算位置；
     t3  这些旧位置被写回 store，于是进度条的表现是
         「清零 → 跳回旧位置 → 再清零 → …」的横跳。

     还有一处更隐蔽的伤害：那些旧位置会经 noteProgress 写进
     「记忆播放进度」——刚播的新歌会带着旧歌的位置被记下来，下次打开
     直接从中间开始。

   修法（见 audio.js）：加一个 switchPending 闸门，
     · loadSong 一进门就置位（必须早于任何 await）；
     · 置位期间 applyAnchor 直接丢弃、extrapolate 不推进；
     · 新歌装载完成后**先**解除再 applyAnchor（那条锚点必须收下），
       这也是全链路唯一一次解除；
     · 装载失败、以及「没有当前歌曲」的卸载路径都要解除 ——
       否则界面会永远冻结在「加载中」。

   本文件用**同一套时序**的精简模型复现这台状态机（audio.js 依赖 DOM，
   无法在 node:test 里直接 import）。改 audio.js 里那段逻辑时这里要跟着改 ——
   对不上就说明规则被动了。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const audioSrc = readFileSync(join(root, "frontend", "src", "js", "audio.js"), "utf8");

/**
 * 去掉行注释后的源码。
 *
 * ★ 这一层是必需的：这些用例断言的是「源码里有某一句判定」，而
 * `// if (switchPending) return;` 这种**被注释掉的**代码同样能匹配上
 * `\/if \(switchPending\) return;/` —— 于是把修复注释掉，测试照样是绿的。
 * 去掉注释再匹配，断言才真的指向可执行代码。
 *
 * 只处理整行 `//` 注释：本仓库的代码里没有把 `//` 放在字符串中间再
 * 需要被当成代码的写法，所以这个近似足够，而且不会误伤 URL（`https://`
 * 出现在引号里时会被一起去掉，但那些行与本文件断言的语句无关）。
 */
function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => line.replace(/^\s*\/\/.*$/, ""))
    .join("\n");
}

const audioCode = stripLineComments(audioSrc);

/* --------------------------------------------------------------------------
   1. 一份与 audio.js 对齐的状态机模型
   --------------------------------------------------------------------------
   只保留与本问题相关的字段：开关、锚点、以及「写进 store 的位置」。
   -------------------------------------------------------------------------- */

function makeSwitchMachine() {
  return {
    /** 与 audio.js 的 switchPending 同名同义 */
    switchPending: false,
    /** 当前生效的锚点（切歌期间它还是旧歌的） */
    anchor: null,
    /** store 里的位置（store playSong 会把它清零） */
    position: 0,
    /** 「记忆播放进度」记下来的值 */
    progress: null,
    /** 前端希望装载的歌 / 后端确实装载的歌 */
    loadedFor: null,
    backendSongId: null,

    /** 与 audio.js 的 currentSong()/playSong 对齐：切歌时位置清零 */
    switchTo(songId) {
      this.loadedFor = songId;
      this.position = 0;
      this.progress = null;
    },

    /** 与 audio.js 的 loadSong 对齐：一进门就置位（见那里的注释） */
    beginLoad(songId) {
      this.loadedFor = songId;
      this.anchor = null;
      this.position = 0;
      this.switchPending = true;
    },

    /** 与 audio.js 的 applyAnchor 对齐 */
    applyAnchor(payload) {
      if (this.switchPending) return false; // 丢弃：这一定是旧歌的
      this.anchor = { positionMs: payload.positionMs, at: 0 };
      this.position = payload.positionMs;
      this.progress = payload.positionMs;
      return true;
    },

    /** 与 audio.js 的 extrapolate 对齐 */
    extrapolate(elapsedMs) {
      if (!this.anchor) return;
      if (this.switchPending) return; // 不推进
      this.position = this.anchor.positionMs + elapsedMs;
      this.progress = this.position;
    },

    /** 与 audio.js 的 loadSong 尾部对齐：先解除开关，再收下新歌的锚点 */
    finishLoad(payload) {
      this.backendSongId = this.loadedFor;
      this.switchPending = false;
      this.applyAnchor(payload);
    },

    /** 与 audio.js 的 loadSong catch 对齐 */
    failLoad() {
      this.loadedFor = null;
      this.backendSongId = null;
      this.switchPending = false;
    },

    /** 与 audio.js 的 unloadCurrent 对齐 */
    unload() {
      this.switchPending = false;
      this.loadedFor = null;
      this.backendSongId = null;
      this.anchor = null;
    },
  };
}

/* --------------------------------------------------------------------------
   2. 横跳本身：切歌途中旧锚点不得把位置写回去
   -------------------------------------------------------------------------- */

test("切歌途中：旧歌的锚点必须被丢弃，不能把进度条拽回旧位置", () => {
  const m = makeSwitchMachine();

  // 旧歌放到 3 分 20 秒
  m.anchor = { positionMs: 200000, at: 0 };
  m.position = 200000;

  // 用户点下一首
  m.switchTo("B");
  m.beginLoad("B");
  assert.equal(m.position, 0, "切歌瞬间位置应当是 0");

  // 后端 tick 送上来的**旧歌**锚点（后端要到 playerLoad 返回才换成 B）
  const accepted = m.applyAnchor({ positionMs: 200500 });
  assert.equal(accepted, false, "切歌途中的锚点必须被丢弃");
  assert.equal(m.position, 0, "丢弃之后位置必须仍是 0 —— 这正是「横跳」的那一跳");
});

test("切歌途中：外推也不能推进（它用的还是旧锚点）", () => {
  const m = makeSwitchMachine();
  m.anchor = { positionMs: 200000, at: 0 };

  m.switchTo("B");
  m.beginLoad("B");

  m.extrapolate(250);
  m.extrapolate(500);
  m.extrapolate(750);
  assert.equal(m.position, 0, "外推在切歌途中必须停摆，否则进度条会自己往前走旧歌的位置");
});

test("切歌途中：不得污染「记忆播放进度」", () => {
  // 这是横跳之外的第二重伤害，而且用户不一定会立刻发现：
  // 新歌会带着旧歌的位置被记下来，下次打开直接从中间开始。
  const m = makeSwitchMachine();
  m.anchor = { positionMs: 180000, at: 0 };

  m.switchTo("B");
  m.beginLoad("B");
  m.applyAnchor({ positionMs: 180500 });

  assert.equal(m.progress, null, "切歌途中不能记进度 —— 那记的是上一首的位置");
});

/* --------------------------------------------------------------------------
   3. 闸门必须能关掉：否则界面永远冻结在「加载中」
   -------------------------------------------------------------------------- */

test("装载完成：先解除闸门，再收下新歌的锚点", () => {
  const m = makeSwitchMachine();
  m.anchor = { positionMs: 200000, at: 0 };
  m.switchTo("B");
  m.beginLoad("B");

  m.finishLoad({ positionMs: 0 });

  assert.equal(m.switchPending, false, "装载完成后必须解除闸门（否则进度条永远不动）");
  assert.equal(m.position, 0, "解除之后新歌的锚点要能收下");
  assert.equal(m.backendSongId, "B", "后端装载的歌要更新为新歌");
});

test("装载完成后的锚点必须生效（顺序反了就会被自己的闸门吃掉）", () => {
  // 真实 bug 形态：若先 applyAnchor 再解除闸门，那条新歌锚点会被
  // 「切歌途中」的判定丢弃 —— 进度条要一直等到后端下一个 tick 才恢复，
  // 表现是「切完歌进度条静止半秒」。
  const m = makeSwitchMachine();
  m.beginLoad("B");
  m.switchPending = true;
  // 先 apply 再解除 = 错误顺序
  const wrong = m.applyAnchor({ positionMs: 1200 });
  assert.equal(wrong, false, "顺序反了的话，新歌的锚点会被丢掉（复现这个错误形态）");

  const ok = makeSwitchMachine();
  ok.beginLoad("B");
  ok.finishLoad({ positionMs: 1200 });
  assert.equal(ok.position, 1200, "正确顺序下新歌的位置必须落地");
});

test("装载失败：闸门也要解除（熔断 / 暂停中点坏歌时不会再装载）", () => {
  const m = makeSwitchMachine();
  m.beginLoad("B");
  m.failLoad();

  assert.equal(m.switchPending, false, "失败不解除的话，界面会永远停在加载态");
  // 解除之后，同一首歌上后续的锚点仍然要能进来
  assert.equal(m.applyAnchor({ positionMs: 0 }), true);
});

test("卸载（清空队列 / 停止）：闸门必须解除", () => {
  const m = makeSwitchMachine();
  m.beginLoad("B");
  m.unload();
  assert.equal(m.switchPending, false, "卸载后仍置位的话，下次播放会一直显示加载中");
});

/* --------------------------------------------------------------------------
   4. 源码级不变量：上面这套规则必须真的写在 audio.js 里
   --------------------------------------------------------------------------
   模型再准也只是模型。这一组直接盯源码，防止「模型对了、实现变了」。
   -------------------------------------------------------------------------- */

test("audio.js：applyAnchor 与 extrapolate 都要看 switchPending", () => {
  const applyStart = audioCode.indexOf("function applyAnchor(payload) {");
  assert.ok(applyStart > 0, "audio.js 里没有找到 applyAnchor");
  const applyBody = audioCode.slice(applyStart, audioCode.indexOf("\n}\n", applyStart));
  assert.match(applyBody, /if \(switchPending\) return;/, "applyAnchor 必须在切歌途中丢弃锚点");

  const extrapolateStart = audioCode.indexOf("function extrapolate() {");
  assert.ok(extrapolateStart > 0, "audio.js 里没有找到 extrapolate");
  const extrapolateBody = audioCode.slice(extrapolateStart, audioCode.indexOf("\n}\n", extrapolateStart));
  assert.match(
    extrapolateBody,
    /if \(switchPending\) return;/,
    "extrapolate 必须在切歌途中停摆（否则会按旧锚点继续推进）"
  );
});

test("audio.js：loadSong 置位必须早于第一次 await", () => {
  const start = audioCode.indexOf("async function loadSong(song) {");
  assert.ok(start > 0, "audio.js 里没有找到 loadSong");
  const body = audioCode.slice(start, audioCode.indexOf("\nasync function syncPlayState", start));

  const setIdx = body.indexOf("switchPending = true;");
  const firstAwaitIdx = body.indexOf("await ");
  assert.ok(setIdx > 0, "loadSong 里没有置位 switchPending");
  assert.ok(firstAwaitIdx > 0, "loadSong 里没有 await？（结构变了，请更新本用例）");
  assert.ok(
    setIdx < firstAwaitIdx,
    "switchPending 必须在第一次 await **之前**置位 —— 否则那次 IPC 往返期间" + "旧歌的锚点会先到，进度条又会被拽回去"
  );
});

test("audio.js：装载完成时必须先解除闸门再 applyAnchor", () => {
  const start = audioCode.indexOf("async function loadSong(song) {");
  const end = audioCode.indexOf("\nasync function syncPlayState", start);
  assert.ok(start > 0 && end > start, "audio.js 里没有找到 loadSong");
  const body = audioCode.slice(start, end);

  const clearIdx = body.indexOf("switchPending = false;");
  const applyIdx = body.indexOf("applyAnchor(st)");
  assert.ok(clearIdx > 0, "装载完成的分支里没有解除闸门");
  assert.ok(applyIdx > 0, "装载完成的分支里没有 applyAnchor(st)");
  assert.ok(clearIdx < applyIdx, "必须先 switchPending = false 再 applyAnchor(st)，顺序反了新歌的锚点会被丢掉");
});

test("audio.js：所有「不再切歌了」的出口都要解除闸门", () => {
  // 出口一共三个：装载成功、装载失败、卸载。少一个就会留下永久加载态。
  const occurrences = audioCode.match(/switchPending = false;/g) || [];
  assert.ok(
    occurrences.length >= 3,
    `解除闸门的地方只找到 ${occurrences.length} 处，期望至少 3 处` +
      "（装载成功 / 装载失败 / 卸载）—— 少一处就会有路径永远停在「加载中」"
  );

  const unloadStart = audioCode.indexOf("async function unloadCurrent() {");
  assert.ok(unloadStart > 0, "audio.js 里没有找到 unloadCurrent");
  const unloadBody = audioCode.slice(unloadStart, audioCode.indexOf("\n}\n", unloadStart));
  assert.match(unloadBody, /switchPending = false;/, "unloadCurrent 必须解除闸门");
  // 卸载必须先落状态再调后端：反过来会留下「引擎还在响、界面说已停」的洞
  //（syncAudio 见到 loadedFor === null 就直接返回，不会再发 playerUnload）。
  assert.ok(
    unloadBody.indexOf("switchPending = false") < unloadBody.indexOf("await backend.playerUnload()"),
    "unloadCurrent 必须先把本地记账清掉再 await playerUnload"
  );
});

test("audio.js：手动切歌要先取消后端的切歌间隔", () => {
  // 间隔是「自动接下一首」的停顿；手动点的一下必须是即时的。
  const start = audioCode.indexOf("async function loadSong(song) {");
  const body = audioCode.slice(start, audioCode.indexOf("\nasync function syncPlayState", start));
  assert.match(body, /await backend\.playerCancelGap\(\);/, "loadSong 必须先取消挂着的切歌间隔");
});

test("bridge.js：playerCancelGap 必须接上后端方法", () => {
  const bridgeSrc = readFileSync(join(root, "frontend", "src", "js", "bridge.js"), "utf8");
  // 这是手写的字符串键：拼错不会有构建错误，只会在运行时变成
  // 「playerCancelGap is not a function」（见 bridge.js 顶部的契约自检说明）。
  assert.match(
    bridgeSrc,
    /playerCancelGap:\s*\(\)\s*=>\s*call\(bindings\?\.Player\?\.CancelTrackGap\)/,
    "bridge 的 playerCancelGap 必须指向 Player.CancelTrackGap"
  );

  // 绑定层（以及 dist 里那份副本）都要有这个方法
  for (const rel of [
    ["frontend", "bindings", "localmusicplayer", "playerservice.js"],
    ["frontend", "dist", "bindings", "localmusicplayer", "playerservice.js"],
  ]) {
    const bindingSrc = readFileSync(join(root, ...rel), "utf8");
    assert.match(
      bindingSrc,
      /export function CancelTrackGap\(\)/,
      `${rel.join("/")} 里缺少 CancelTrackGap —— 前端调用会拿到 undefined`
    );
  }
});

test("playerbar.js：切歌途中不画旧进度", () => {
  const barSrc = readFileSync(join(root, "frontend", "src", "js", "ui", "playerbar.js"), "utf8");
  const start = barSrc.indexOf("paintProgress() {");
  assert.ok(start > 0, "playerbar.js 里没有找到 paintProgress");
  const body = barSrc.slice(start, barSrc.indexOf("\n  firstUpdated()", start));
  assert.match(body, /switchingTrack\(\)/, "paintProgress 必须处理「切歌中」这一态");
  assert.match(body, /set\(0,\s*\{\s*silent:\s*true\s*\}\)/, "切歌途中进度条应当归零（silent 写入，避免触发回调）");
  assert.match(body, /setDisabled\(true\)/, "切歌途中进度条应当禁用");
});
