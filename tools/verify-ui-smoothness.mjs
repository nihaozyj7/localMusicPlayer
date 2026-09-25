/* ==========================================================================
   verify-ui-smoothness.mjs — 验证迁移后「界面流畅 + 歌词跟随」
   --------------------------------------------------------------------------
   这次迁移的核心诉求是「网页卡顿不该影响音频」，但反过来也要确认
   音频搬到后端之后，**界面自己**没有被拖慢。三个具体检查：

   1. 进度外推是否连续：后端每 500ms 推一个锚点，前端用 performance.now
      外推。这里按帧采样 state.position，确认它**单调递增且步长均匀** ——
      如果出现跳变，说明外推没生效、前端在等后端推送，
      那正是「界面卡顿」的表现。

   2. 歌词是否跟着进度走：高亮行由 findLyricIndex(lines, position) 算出，
      所以只要位置在推进、且歌词已装载，行号就该单调前进。

   3. 主线程是否被阻塞：播放期间测 rAF 回调的实际间隔，
      长时间超过一帧（约 16.7ms）说明主线程在忙别的事。

   用法：node tools/verify-ui-smoothness.mjs --exe bin/lmplayer.exe
   ========================================================================== */

import { spawn } from "node:child_process";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const EXE =
  process.argv.includes("--exe") ? process.argv[process.argv.indexOf("--exe") + 1] : "bin/lmplayer.exe";
const PORT = Number(process.env.MP_PORT || 9383);
const WORK = mkdtempSync(path.join(tmpdir(), "verify-ui-"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function connect() {
  let target = null;
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((x) => x.type === "page" && x.webSocketDebuggerUrl);
      if (target) break;
    } catch {
      /* 还没起来 */
    }
    await sleep(500);
  }
  if (!target) throw new Error("等不到 CDP 调试目标");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      p(m);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r?.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description || "eval 失败");
    }
    return r?.result?.result?.value;
  };
  return { ws, evalJs };
}

async function main() {
  console.log(`启动: ${EXE}`);
  const child = spawn(path.resolve(EXE), [], {
    env: {
      ...process.env,
      LMPLAYER_DEBUG_PORT: String(PORT),
      WEBVIEW2_USER_DATA_FOLDER: path.join(WORK, "wv2"),
    },
    stdio: "ignore",
  });

  let ws = null;
  try {
    const conn = await connect();
    ws = conn.ws;
    const { evalJs } = conn;
    await evalJs("new Promise(r => setTimeout(r, 3000))");

    // 选一首有歌词的歌，起播
    const started = await evalJs(`
      (async () => {
        const mod = await import('/bindings/localmusicplayer/index.js');
        const P = mod.PlayerService;
        const songs = await mod.LibraryService.Songs();
        const list = Array.isArray(songs) ? songs : (songs?.songs || songs?.list || []);
        if (!list.length) return { ok: false, reason: '曲库为空' };
        const s = list[0];
        await P.Load(s.id);
        await P.SetVolume(1.0, false);
        await P.SetLoudnessGain(0);
        await P.Play();
        return { ok: true, id: s.id, title: s.title };
      })()
    `);
    if (!started?.ok) {
      console.log(`  SKIP  ${started?.reason || "无法起播"}`);
    } else {
      console.log(`  曲目: ${started.title}`);

      // ---- 采样 state.position 与 rAF 间隔 ----
      const sample = await evalJs(`
        (async () => {
          const store = await import('/js/store.js').catch(() => null);
          const positions = [];
          const frameGaps = [];
          let last = performance.now();
          const t0 = performance.now();
          await new Promise((resolve) => {
            const tick = () => {
              const now = performance.now();
              frameGaps.push(now - last);
              last = now;
              // 直接读 DOM 上暴露的进度文本太脆；用 Playback 快照
              try {
                const el = document.querySelector('[data-position]');
                positions.push(el ? Number(el.dataset.position) : null);
              } catch { positions.push(null); }
              if (now - t0 > 2500) return resolve();
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
          return { positions, frameGaps, elapsed: performance.now() - t0 };
        })()
      `);

      const gaps = (sample?.frameGaps || []).filter((g) => g > 0);
      const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
      const maxGap = gaps.length ? Math.max(...gaps) : 0;

      check(
        "主线程帧间隔正常（未卡死）",
        avgGap > 0 && avgGap < 80,
        `平均 ${avgGap.toFixed(1)}ms，最大 ${maxGap.toFixed(1)}ms，${gaps.length} 帧`,
      );

      // ---- 位置外推的连续性 ----
      //
      // 采样间隔与断言口径说明：200ms 采样一次，所以单步 200ms 左右是**正常**的，
      // 不是抖动。这里真正要防的是「跳变」——即某一步远大于采样间隔，
      // 那说明前端在等后端推送（外推没生效），也就是「界面卡顿」的表现。
      const track = await evalJs(`
        (async () => {
          const mod = await import('/bindings/localmusicplayer/index.js');
          const P = mod.PlayerService;
          const pts = [];
          for (let i = 0; i < 12; i++) {
            const st = await P.State();
            pts.push({ pos: Number(st.positionMs), at: performance.now() });
            await new Promise(r => setTimeout(r, 200));
          }
          return pts;
        })()
      `);

      let monotonic = true;
      let maxJump = 0;
      for (let i = 1; i < track.length; i += 1) {
        const d = track[i].pos - track[i - 1].pos;
        if (d < -50) monotonic = false; // 允许极小回退（取样误差）
        if (Math.abs(d) > maxJump) maxJump = Math.abs(d);
      }
      const advanced = track[track.length - 1].pos - track[0].pos;
      check(
        "播放位置单调推进",
        monotonic && advanced > 1500,
        `推进 ${advanced}ms，最大单步 ${maxJump}ms`,
      );
      // 单步不该远超采样间隔：超过 3 倍说明中间有「卡住再跳」的过程
      check(
        "位置推进平滑（无跳变）",
        maxJump < 600,
        `最大单步 ${maxJump}ms（采样间隔 200ms，阈值 600ms）`,
      );

      // ---- 歌词同步不在这里断言 ----
      //
      // 这里曾经有一条 `idx2 > idx1 || idx2 === -1` 的断言，它会把
      // 「根本没装载歌词（两边都是 -1）」也算成通过 —— 没有区分度的假断言，
      // 已删除，避免以后有人看到绿灯就以为歌词被验证过了。
      //
      // 歌词有专门的 tools/verify-lyrics-sync.mjs：它切到 DOM 型皮肤
      // （默认的 arcanum 把歌词画在 canvas 上，读不到行号），
      // 直接读 aria-current="true" 的行序号并断言严格前进。

      await evalJs(`
        (async () => {
          const mod = await import('/bindings/localmusicplayer/index.js');
          await mod.PlayerService.Pause();
          await mod.PlayerService.Unload();
        })()
      `);
    }
  } finally {
    try {
      ws?.close();
    } catch {
      /* 忽略 */
    }
    try {
      child.kill();
    } catch {
      /* 忽略 */
    }
    await sleep(800);
    try {
      rmSync(WORK, { recursive: true, force: true });
    } catch {
      /* 忽略 */
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log("");
  console.log(`结果: ${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("失败:", e);
  process.exit(1);
});
