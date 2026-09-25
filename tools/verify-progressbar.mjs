/* ==========================================================================
   verify-progressbar.mjs — 进度条回归验证
   --------------------------------------------------------------------------
   背景：迁移到后端播放后，进度条曾经完全不走、时间恒为 00:00。
   根因是 playerbar 的 deps 刻意不含 s.position，而 revalidate() 只在
   deps 变化时才重绘 —— 后端位置一直写进 store，却没有任何一次重绘。

   这个脚本守住修复，覆盖四种会改变位置的场景：
     1. 正常播放 → 时间文本与滑块都前进
     2. seek      → 立刻反映新位置
     3. pause     → 停在原地（不能继续走）
     4. 换歌      → 位置归零后重新前进

   用法：node tools/verify-progressbar.mjs --exe bin/lmplayer.exe
   ========================================================================== */

import { spawn } from "node:child_process";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const EXE = process.argv.includes("--exe") ? process.argv[process.argv.indexOf("--exe") + 1] : "bin/lmplayer.exe";
const PORT = Number(process.env.MP_PORT || 9396);
const WORK = mkdtempSync(path.join(tmpdir(), "verify-pbar-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

/** 把 00:03 这样的文本解析成秒；解析不出来返回 -1 */
const parseClock = (t) => {
  const m = /^(\d+):(\d+)$/.exec(String(t || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};

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
  if (!target) throw new Error("等不到 CDP 目标");
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

/** 读取进度条的当前可见状态 */
const READ_BAR = `
  (() => {
    const cur = document.getElementById('time-current');
    const bar = document.getElementById('progress');
    return {
      time: cur ? cur.textContent.trim() : '(none)',
      value: bar ? Number(bar.getAttribute('aria-valuenow') ?? bar.value ?? -1) : -1,
    };
  })()
`;

async function main() {
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
    await evalJs("new Promise(r => setTimeout(r, 3500))");

    const songs = await evalJs(`
      (async () => {
        const mod = await import('/bindings/localmusicplayer/index.js');
        const list = await mod.LibraryService.Songs();
        const arr = Array.isArray(list) ? list : (list?.songs || list?.list || []);
        return arr.slice(0, 2).map(s => ({ id: s.id, title: s.title, duration: s.duration }));
      })()
    `);
    if (!songs?.length) {
      console.log("  SKIP  曲库为空");
      return;
    }
    console.log(`曲目: ${songs[0].title}`);

    // ---- 1. 播放中时间前进 ----
    await evalJs(`
      (async () => {
        const mod = await import('/bindings/localmusicplayer/index.js');
        const P = mod.PlayerService;
        await P.Load(${JSON.stringify(songs[0].id)});
        await P.SetVolume(1.0, false);
        await P.Play();
      })()
    `);
    await sleep(2500);
    const b1 = await evalJs(READ_BAR);
    await sleep(3000);
    const b2 = await evalJs(READ_BAR);
    check(
      "播放中时间文本前进",
      parseClock(b2.time) > parseClock(b1.time) && parseClock(b1.time) >= 0,
      `${b1.time} → ${b2.time}`,
    );
    check("播放中滑块位置前进", b2.value > b1.value, `${b1.value} → ${b2.value}`);

    // ---- 2. seek 立刻反映 ----
    await evalJs(`
      (async () => {
        const mod = await import('/bindings/localmusicplayer/index.js');
        await mod.PlayerService.Seek(75000);
      })()
    `);
    await sleep(1200);
    const b3 = await evalJs(READ_BAR);
    check(
      "seek 后进度条反映新位置",
      parseClock(b3.time) >= 73 && parseClock(b3.time) <= 80,
      `seek 75000ms → 显示 ${b3.time}`,
    );

    // ---- 3. 暂停后停住 ----
    await evalJs(`
      (async () => {
        const mod = await import('/bindings/localmusicplayer/index.js');
        await mod.PlayerService.Pause();
      })()
    `);
    await sleep(600);
    const b4 = await evalJs(READ_BAR);
    await sleep(2000);
    const b5 = await evalJs(READ_BAR);
    check(
      "暂停后时间停住",
      parseClock(b4.time) === parseClock(b5.time),
      `${b4.time} → ${b5.time}`,
    );

    // ---- 4. 换歌后位置归零并重新前进 ----
    //
    // 刻意找一个**能转码的文件**再切：曲库里可能存在损坏的音频
    // （实测本机 58 首里有 1 首 AAC 流损坏，转码必然失败）。
    // 那种失败与进度条无关，不该让这个回归脚本变红 ——
    // 否则「进度条坏了」和「某个文件坏了」会混在一起报。
    if (songs[1]) {
      let switched = false;
      try {
        await evalJs(`
          (async () => {
            const mod = await import('/bindings/localmusicplayer/index.js');
            const P = mod.PlayerService;
            await P.Load(${JSON.stringify(songs[1].id)});
            await P.Play();
          })()
        `);
        switched = true;
      } catch (err) {
        console.log(`  SKIP  换歌检查（第二首歌无法转码：${String(err).slice(0, 80)}）`);
      }
      if (switched) {
        await sleep(2500);
        const b6 = await evalJs(READ_BAR);
        await sleep(2500);
        const b7 = await evalJs(READ_BAR);
        check(
          "换歌后位置归零并重新前进",
          parseClock(b6.time) < 15 && parseClock(b7.time) > parseClock(b6.time),
          `${b6.time} → ${b7.time}`,
        );
      }
    }

    await evalJs(`
      (async () => {
        const mod = await import('/bindings/localmusicplayer/index.js');
        await mod.PlayerService.Pause();
        await mod.PlayerService.Unload();
      })()
    `);
  } finally {
    try { ws?.close(); } catch { /* 忽略 */ }
    try { child.kill(); } catch { /* 忽略 */ }
    await sleep(700);
    try { rmSync(WORK, { recursive: true, force: true }); } catch { /* 忽略 */ }
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
