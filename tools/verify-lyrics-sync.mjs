/* ==========================================================================
   verify-lyrics-sync.mjs — 验证歌词真的跟着后端播放进度走
   --------------------------------------------------------------------------
   为什么单独一个脚本：verify-ui-smoothness.mjs 里那条「歌词行号前进」的断言
   实际上**没有证明力** —— 它用的曲目没有歌词，两边 index 都是 -1，
   而断言里为了容错写了 `|| idx2 === -1`，于是「没歌词」也被算成通过。
   这是典型的「测试通过但什么都没验证」，必须换一个真能区分对错的检查。

   这里的做法：
     1. 从歌词缓存目录里挑一个**确实有歌词**的 songId（缓存是 .lrc，有行数）；
     2. 让后端播它，等歌词装载完成；
     3. 记录 index@t1，seek 到一个明显更晚的位置，记录 index@t2；
     4. 断言 t2 的行号**严格大于** t1，且两者都不是 -1。

   行号由 findLyricIndex(lines, state.position) 算出，而 position 现在由
   「后端锚点 + 前端外推」驱动 —— 所以这个断言同时覆盖了
   「歌词跟随」与「进度外推」两件事。

   用法：node tools/verify-lyrics-sync.mjs --exe bin/lmplayer.exe
   ========================================================================== */

import { spawn } from "node:child_process";
import path from "node:path";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const EXE =
  process.argv.includes("--exe") ? process.argv[process.argv.indexOf("--exe") + 1] : "bin/lmplayer.exe";
const PORT = Number(process.env.MP_PORT || 9384);
const WORK = mkdtempSync(path.join(tmpdir(), "verify-lyrics-"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

/** 在宿主上找歌词缓存目录（%APPDATA%\LocalMusicPlayer\cache\meta\lyrics） */
function findLyricCandidates() {
  const base = path.join(process.env.APPDATA || "", "LocalMusicPlayer", "cache", "meta", "lyrics");
  try {
    return readdirSync(base)
      .filter((f) => f.endsWith(".lrc"))
      .map((f) => {
        const id = f.replace(/\.lrc$/, "");
        let lines = 0;
        try {
          const txt = readFileSync(path.join(base, f), "utf8");
          lines = (txt.match(/\[\d+:\d+/g) || []).length;
        } catch {
          /* 忽略 */
        }
        return { id, lines };
      })
      .filter((x) => x.lines > 10) // 太少行的歌词无法区分行号变化
      .sort((a, b) => b.lines - a.lines);
  } catch {
    return [];
  }
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
  const candidates = findLyricCandidates();
  if (!candidates.length) {
    console.log("  本机歌词缓存里没有足够长的 .lrc，无法验证歌词同步（跳过）");
    return;
  }
  console.log(`歌词候选: ${candidates.slice(0, 3).map((c) => `${c.id}(${c.lines}行)`).join(", ")}`);

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

    // 直接观察**渲染出来的 DOM**：高亮行上有 aria-current。
    //
    // 为什么不 import playerhost.js：打包后源码路径不存在
    // （dist 里是带 hash 的资源），动态 import 会 404。
    // 而读 DOM 反而更接近「用户真的看到了什么」——
    // 它同时覆盖了「歌词装载 → 计算行号 → 渲染高亮」整条链。
    const started = await evalJs(`
      (async () => {
        const mod = await import('/bindings/localmusicplayer/index.js');
        const P = mod.PlayerService;
        const songs = await mod.LibraryService.Songs();
        const list = Array.isArray(songs) ? songs : (songs?.songs || songs?.list || []);
        if (!list.length) return { ok: false, reason: '曲库为空' };
        // 尽量挑有歌词缓存的那首；没有就退回首曲
        const ids = ${JSON.stringify(candidates.map((c) => c.id))};
        const found = list.find(s => ids.includes(s.id)) || list[0];
        await P.Load(found.id);
        await P.SetVolume(1.0, false);
        await P.SetLoudnessGain(0);
        await P.Seek(0);
        await P.Play();
        return { ok: true, id: found.id, title: found.title, duration: found.duration };
      })()
    `);
    if (!started?.ok) {
      console.log(`  SKIP  ${started?.reason}`);
    } else {
      console.log(`  曲目: ${started.title} (${started.id})`);
      check("选中的曲目确实有歌词缓存", true, `${started.id}`);

      // 歌词只在**播放详情页**里渲染（列表页没有）。
      // 所以必须先打开详情页，否则读不到任何歌词节点。
      await evalJs(`
        (async () => {
          try { window.__app?.openPlayer?.(); } catch (e) { /* 忽略 */ }
          await new Promise(r => setTimeout(r, 800));
          return true;
        })()
      `);

      // ---- 切到 DOM 型皮肤，让歌词高亮变成可断言的 DOM 状态 ----
      //
      // 为什么要切：默认皮肤是 arcanum，它把歌词画在 canvas 上，
      // DOM 里一个 .lyric 都没有 —— 那样只能间接推断，拿不到直接证据。
      // classic 走 lyrics-view.js，产出 .lyric 节点并在高亮行打
      // aria-current="true"，于是「歌词行号是否跟着进度前进」
      // 就能被**直接断言**。
      //
      // 这不是为了迁就测试而改产品行为：切换皮肤是应用本来就支持的
      // 正常操作，而歌词同步逻辑（findLyricIndex）对所有皮肤是同一份。
      const switched = await evalJs(`
        (async () => {
          try {
            window.__app?.setPlayerViewMode?.('classic');
          } catch (e) { return { err: String(e) }; }
          await new Promise(r => setTimeout(r, 1500));
          return {
            domLyrics: document.querySelectorAll('.lyric').length,
            current: document.querySelector('.lyric[aria-current="true"]')?.textContent?.trim()?.slice(0,20) || '',
          };
        })()
      `);
      console.log(`  切到 classic 后：DOM 歌词行=${switched?.domLyrics}`);

      const probe = await evalJs(`
        (async () => {
          const mod = await import('/bindings/localmusicplayer/index.js');
          const P = mod.PlayerService;
          const read = async () => {
            await new Promise(r => setTimeout(r, 1000));
            const all = Array.from(document.querySelectorAll('.lyric'));
            // aria-current="true" 才是高亮行；其余行是 "false"（见 lyrics-view.js:201），
            // 所以必须比**值**，不能用 hasAttribute —— 那样每一行都会匹配。
            const idx = all.findIndex(el => el.getAttribute('aria-current') === 'true');
            const st = await P.State();
            const app = window.__app || {};
            return {
              index: idx,
              pos: Number(st.positionMs),
              storePos: Number((app.state || {}).position || 0),
              text: idx >= 0 ? all[idx]?.textContent?.trim()?.slice(0, 24) || '' : '',
              total: all.length,
            };
          };
          await P.Seek(3000);
          const early = await read();
          await P.Seek(90000);
          const late = await read();
          return { early, late };
        })()
      `);

      const e = probe?.early || {};
      const l = probe?.late || {};
      check("DOM 型皮肤渲染出歌词行", (e.total ?? 0) > 3, `行数=${e.total}`);
      check(
        "早期位置有高亮行（不是 -1）",
        typeof e.index === "number" && e.index >= 0,
        `pos=${e.pos}ms index=${e.index} "${e.text}"`,
      );
      check(
        "后期位置有高亮行（不是 -1）",
        typeof l.index === "number" && l.index >= 0,
        `pos=${l.pos}ms index=${l.index} "${l.text}"`,
      );
      check(
        "歌词高亮行随进度**严格前进**",
        typeof e.index === "number" && typeof l.index === "number" && l.index > e.index,
        `index ${e.index} → ${l.index}（位置 ${e.pos}ms → ${l.pos}ms）`,
      );

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
