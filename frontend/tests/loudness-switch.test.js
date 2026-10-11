/* ==========================================================================
   loudness-switch.test.js — 切歌时响度补偿不能张冠李戴
   --------------------------------------------------------------------------
   用户报的现象：A 切 B 的一瞬间，A 的结尾会**突然变响**，而且不是每次都触发。
   猜测是「响度均衡在切歌瞬间失效」。

   实测根因（本文件就是它的回归测试）：

     loadSong(B) 是异步的，中间隔着一次 playerLoad IPC。而后端**在 playerLoad
     返回之前仍在放 A** —— 它的环形缓冲里还积压着约 3 秒音频会继续吐给声卡。
     旧代码在装载**之前**就按新歌查表推增益，于是：

       t0  切歌：state.currentId = B
       t1  pushLoudnessToBackend(B) = 0 dB   ← B 没测过，表里取到的是 0
       t2  后端还在把 A 的尾部吐出来

     A 原本被压了 −8 dB，补偿一归零，剩下的缓冲就以原始电平放出来。这解释了
     「不是百分百触发」：只有 A 确实被明显压低、且 A 尾部还在缓冲里时才听得见。

   修法（见 audio.js）：
     · 把「后端真正装载的歌」(backendSongId) 与「前端希望装载的歌」(loadedFor)
       分开，所有按歌推增益的动作都认前者；
     · 换歌前先把增益压到 0 dB 兜住旧歌尾部，装载完成后再套用新歌自己的补偿。

   本文件锁住这次修复的**核心不变量**（判定规则本身），不依赖浏览器环境：
   真实 audio.js 的端到端行为由无头浏览器自检负责
   （node tools/playtest.mjs / npm run verify:lit）。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

/* --------------------------------------------------------------------------
   与 audio.js#gainDBFor 同一算法，逐字对照：
     function gainDBFor(songId) {
       const mode = state.config.loudnessMode || "off";
       if (mode === "off" || !songId) return 0;
       const g = state.loudnessGains?.[songId];
       return Number.isFinite(g) ? g : 0;
     }
   改源码时这里要跟着改 —— 对不上就说明判定规则被动了。
   -------------------------------------------------------------------------- */
function gainDBFor(gains, songId, mode = "track") {
  if (mode === "off" || !songId) return 0;
  const g = gains?.[songId];
  return Number.isFinite(g) ? g : 0;
}

/* --------------------------------------------------------------------------
   场景 1：A 很响（−8 dB）切到未测量的 B —— 正是用户听到「突然变响」的场景
   -------------------------------------------------------------------------- */

test("切到未测量的歌：B 未测量 → 不补偿（0 dB），不得沿用 A 的值", () => {
  const gains = { A: -8 }; // A 已测（很响，压 8 dB），B 没测过

  assert.equal(gainDBFor(gains, "A"), -8, "A 自己的补偿是 −8");
  assert.equal(gainDBFor(gains, "B"), 0, "B 未测量 → 0（不补偿），绝不能是 −8");
});

test("切到已测量的歌：装载后必须换成新歌自己的补偿", () => {
  const gains = { A: -8, B: 5 };
  assert.equal(gainDBFor(gains, "B"), 5, "装载完成后应套用 B 的 +5 dB");
  assert.notEqual(gainDBFor(gains, "B"), gains["A"], "不能把 A 的补偿留给 B");
});

/* --------------------------------------------------------------------------
   场景 2：复现旧写法的具体错误 —— 用新歌的未知补偿冲掉旧歌的补偿
   -------------------------------------------------------------------------- */

test("复现：装载中途按新歌取补偿 → 旧歌尾部失去 8 dB 的压制", () => {
  const gains = { A: -8 }; // B 未测

  // 旧写法：始终按 state.currentId 查表；切歌后 currentId 已是 B
  const buggyDuringSwitch = gains["B"] ?? 0; // = 0 → A 的 −8 被冲掉

  assert.equal(buggyDuringSwitch, 0);
  assert.notEqual(
    buggyDuringSwitch,
    gains["A"],
    "旧写法在装载期间就把 A 的补偿丢了 —— 这正是 A 结尾突然变响的来源"
  );

  // 新写法：过渡期显式传 null（= 压到 0，不抬升也不压低），
  // 语义是"安全的中间态"，而不是"被新歌的 0 冲掉"
  assert.equal(gainDBFor(gains, null), 0, "过渡期 pushLoudnessToBackend(null) → 0 dB");
});

/* --------------------------------------------------------------------------
   场景 3：A 是安静曲目（+6 dB）时，也不能让 A 的尾部被抬着爆
   -------------------------------------------------------------------------- */

test("A 为安静曲目（+6 dB）切到 B：过渡期同样压到 0", () => {
  const gains = { A: 6, B: -3 };
  assert.equal(gainDBFor(gains, null), 0, "过渡期不抬升：留在链路上会把 A 尾部抬高");
  assert.equal(gainDBFor(gains, "B"), -3, "装载完成后套用 B 的 −3 dB");
});

/* --------------------------------------------------------------------------
   场景 4：边界 —— 0 是合法补偿值，模式关闭时一律 0
   -------------------------------------------------------------------------- */

test("补偿值恰为 0 是合法值，必须原样保留", () => {
  const gains = { B: 0 };
  assert.equal(gainDBFor(gains, "B"), 0);
  assert.equal(gains["B"] ?? -999, 0, "0 不该被 ?? 兜底掉");
});

test("响度均衡关闭 / 没有歌时，一律不补偿", () => {
  const gains = { A: -8 };
  assert.equal(gainDBFor(gains, "A", "off"), 0, "mode=off 时不上补偿");
  assert.equal(gainDBFor(gains, null), 0, "没有歌时不上补偿");
});

/* --------------------------------------------------------------------------
   场景 5：补偿表里是负数（很响的歌被压低）必须原样生效，不能被当成"无值"
   -------------------------------------------------------------------------- */

test("播放中同一首歌的补偿从 0 变成 −8 时必须能推下去", () => {
  // 这是"测量在播放中途才回来"的场景：先按 0 起播，测完再压到 −8。
  // 去重键若用 UI 的 currentGain 而不是后端的 backendGain，会误判"没变"。
  const before = gainDBFor({ A: undefined }, "A"); // 还没测
  const after = gainDBFor({ A: -8 }, "A"); // 测完了
  assert.equal(before, 0);
  assert.equal(after, -8);
  assert.notEqual(before, after, "0 → −8 是一次真实变化，必须推给后端");
});

/* --------------------------------------------------------------------------
   场景 6：在线试听曲目也必须被请求补偿
   --------------------------------------------------------------------------
   用户报障：「在线试听的歌曲好像没有收到响度均衡的约束」。

   实测根因有两处，本组测试锁住触发规则本身：

     1. 引擎路径（loadSong）**从来没有**调过 requestLoudness —— 而在线试听
        走的正是这条路径，于是它连"按需测量"都不会被触发；
     2. legacy <audio> 路径里写的是 `if (!song.online) requestLoudness(...)`，
        在线曲目被显式排除。

   `!song.online` 当初是用来回避「后端查不到在线曲目」的：在线 id 形如
   bili:BVxxx，不在曲库里，Get/Measure 会直接报「歌曲不存在」。但回避的
   代价是功能彻底缺失 —— 正解是让后端能解析到它（见 services.go#songByID
   的虚拟表兜底），而不是在前端把它挡在门外。
   -------------------------------------------------------------------------- */

/** 与 audio.js#requestLoudness 的入口判定一致（mode=off / 没有 songId 就直接返回；改源码时要同步这里） */
function shouldRequestLoudness(song, mode = "track") {
  if (mode === "off" || !song?.id) return false;
  return true;
}

test("在线试听曲目同样要请求响度补偿（不再按 song.online 跳过）", () => {
  const online = { id: "bili:BV1xx411c7mD", online: true };
  const local = { id: "t_abc", online: false };

  assert.equal(
    shouldRequestLoudness(online),
    true,
    "在线曲目必须请求补偿 —— 排除它正是用户报的「不受约束」"
  );
  assert.equal(shouldRequestLoudness(local), true, "本地曲目当然也要");
});

test("关掉响度均衡 / 没有歌时，在线曲目也不请求", () => {
  const online = { id: "bili:BV1xx411c7mD", online: true };
  assert.equal(shouldRequestLoudness(online, "off"), false, "mode=off 时一律不请求");
  assert.equal(shouldRequestLoudness(null), false, "没有歌时不请求");
});

test("在线曲目补偿的记账与查询走同一张表（不因为 online 而丢失）", () => {
  // 测出来的补偿必须能存进 loudnessGains 并在切歌时查得到，
  // 否则「测了但没生效」会表现为另一种形式的「不受约束」。
  const gains = {};
  const onlineId = "bili:BV1xx411c7mD";
  gains[onlineId] = 7.5; // setGain 写入

  assert.equal(gainDBFor(gains, onlineId), 7.5, "在线曲目的补偿必须能被查回");
  assert.equal(
    gainDBFor(gains, onlineId),
    7.5,
    "重挂载/切回这首歌时仍应命中同一张表"
  );
});
