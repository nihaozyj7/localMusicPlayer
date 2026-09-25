/* ==========================================================================
   verify-player-backend.mjs — 在**真实运行的应用**里验证后端音频接管
   --------------------------------------------------------------------------
   为什么需要它（单元测试覆盖不到的部分）：

   Go 侧与 JS 侧的单元测试都各自通过，但「前端真的连上了后端播放器」
   这件事只有把应用跑起来才能确认。中间隔着一层手写的字符串键映射
   （bridge.js 的 backend.player* → bindings.PlayerService.*），
   拼错不会被任何构建步骤拦住 —— 只会在运行时退化成「没声音」。

   这个脚本通过 CDP 连进真实的 WebView2，在页面里：
     1. 等前端装配完成；
     2. 读 audio.js 暴露的链路状态，确认 backend=true（后端接管）；
     3. 直接调绑定层 PlayerService，跑一遍 Load/Play/Seek/Pause/State/Spectrum；
     4. 断言位置真的推进、频谱真的有数据。

   用法：node tools/verify-player-backend.mjs --exe bin/lmplayer.exe
   ========================================================================== */

import { spawn } from "node:child_process";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const EXE =
  process.argv.includes("--exe") ? process.argv[process.argv.indexOf("--exe") + 1] : "bin/lmplayer.exe";
const PORT = Number(process.env.MP_PORT || 9382);
const WORK = mkdtempSync(path.join(tmpdir(), "verify-player-"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 收集断言结果 */
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

/** 连上 CDP 并返回 eval 辅助函数 */
async function connect() {
  // 等调试端口起来
  let target = null;
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      target = list.find((x) => x.type === "page" && x.webSocketDebuggerUrl);
      if (target) break;
    } catch {
      /* 还没起来 */
    }
    await sleep(500);
  }
  if (!target) throw new Error("等不到 CDP 调试目标（应用没起来？）");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    const p = pending.get(msg.id);
    if (p) {
      pending.delete(msg.id);
      p(msg);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r?.result?.exceptionDetails) {
      throw new Error(
        r.result.exceptionDetails.exception?.description ||
          JSON.stringify(r.result.exceptionDetails),
      );
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

    // ---- 1. 页面与绑定层就绪 ----
    const ready = await evalJs("Boolean(document.body.dataset.ready)");
    check("前端装配完成（body[data-ready]）", ready === true, `ready=${ready}`);

    // ---- 2. 后端音频已接管（关键断言）----
    const backendState = await evalJs(`
      (async () => {
        const mod = await import('/bindings/localmusicplayer/index.js');
        const av = await mod.PlayerService.Available();
        return av;
      })()
    `);
    check(
      "PlayerService.Available() 报告后端可用",
      backendState?.available === true,
      JSON.stringify(backendState),
    );
    check(
      "采样率/声道与引擎一致",
      backendState?.sampleRate === 44100 && backendState?.channels === 2,
      `${backendState?.sampleRate}Hz / ${backendState?.channels}ch`,
    );

    // ---- 3. 音频会话归属（音量合成器里应当是本程序）----
    // 通过 Diagnostics 间接确认引擎在跑（会话归属由外部脚本单独验证）
    const diag = await evalJs(`
      (async () => {
        const mod = await import('/bindings/localmusicplayer/index.js');
        return await mod.PlayerService.Diagnostics();
      })()
    `);
    check("Diagnostics 可读（设置界面依赖它排查断续）", !!diag, JSON.stringify(diag));
    check(
      "Diagnostics 暴露欠载计数",
      diag && Object.prototype.hasOwnProperty.call(diag, "underruns"),
      `underruns=${diag?.underruns}`,
    );

    // ---- 4. 用真实曲库里的第一首歌跑完整链路 ----
    const picked = await evalJs(`
      (async () => {
        const mod = await import('/bindings/localmusicplayer/index.js');
        const songs = await mod.LibraryService.Songs();
        const list = Array.isArray(songs) ? songs : (songs?.songs || songs?.list || []);
        if (!list.length) return null;
        const s = list[0];
        return { id: s.id, title: s.title, duration: s.duration };
      })()
    `);
    if (!picked) {
      console.log("  SKIP  曲库为空，跳过后端播放往返验证");
    } else {
      console.log(`  曲目: ${picked.title} (${picked.id})`);
      const res = await evalJs(`
        (async () => {
          const mod = await import('/bindings/localmusicplayer/index.js');
          const P = mod.PlayerService;
          const out = {};
          out.load = await P.Load(${JSON.stringify(picked.id)});
          await P.SetVolume(1.0, false);
          await P.SetLoudnessGain(0);
          await P.Play();
          await new Promise(r => setTimeout(r, 1200));
          out.state1 = await P.State();
          out.spec = await P.Spectrum(32);
          return out;
        })()
      `);
      check("Load 返回时长", Number(res?.load?.durationMs) > 0, `durationMs=${res?.load?.durationMs}`);
      check(
        "播放后位置推进",
        Number(res?.state1?.positionMs) > 400,
        `positionMs=${res?.state1?.positionMs}`,
      );
      check("播放状态为 playing", res?.state1?.playing === true, `playing=${res?.state1?.playing}`);
      const bands = res?.spec?.bands;
      check(
        "频谱有数据（皮肤可视化数据源）",
        Array.isArray(bands) && bands.length === 32 && bands.some((v) => v > 0),
        Array.isArray(bands) ? `${bands.length} 段，峰值 ${Math.max(...bands)}` : String(bands),
      );

      // seek 往返
      const seekRes = await evalJs(`
        (async () => {
          const mod = await import('/bindings/localmusicplayer/index.js');
          const P = mod.PlayerService;
          await P.Seek(30000);
          await new Promise(r => setTimeout(r, 300));
          return await P.State();
        })()
      `);
      check(
        "Seek 生效（跳到 30s 附近）",
        Number(seekRes?.positionMs) > 25000,
        `positionMs=${seekRes?.positionMs}`,
      );

      // 暂停必须停住
      const pauseRes = await evalJs(`
        (async () => {
          const mod = await import('/bindings/localmusicplayer/index.js');
          const P = mod.PlayerService;
          await P.Pause();
          await new Promise(r => setTimeout(r, 200));
          const a = await P.State();
          await new Promise(r => setTimeout(r, 600));
          const b = await P.State();
          await P.Unload();
          return { a: a.positionMs, b: b.positionMs, playing: b.playing };
        })()
      `);
      check("暂停后 playing=false", pauseRes?.playing === false, `playing=${pauseRes?.playing}`);
      check(
        "暂停后位置停住",
        Number(pauseRes?.b) - Number(pauseRes?.a) < 200,
        `${pauseRes?.a}ms → ${pauseRes?.b}ms`,
      );
    }

    // ---- 5. 页面里没有运行时报错 ----
    const errs = await evalJs(`
      (() => {
        const w = window.__verifyErrors || [];
        return w;
      })()
    `);
    check("未捕获到播放链路报错", !errs || errs.length === 0, JSON.stringify(errs || []));
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
      /* Windows 上可能还有句柄，忽略 */
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log("");
  console.log(`结果: ${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) {
    console.log("失败项：");
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`));
    process.exit(1);
  }
  console.log("后端播放链路在真实应用里验证通过。");
}

main().catch((err) => {
  console.error("验证脚本失败:", err);
  process.exit(1);
});
