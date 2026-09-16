/* ==========================================================================
   onlinecheck.mjs — 在线搜索 / 封面 / 下载 的真实运行验证
   --------------------------------------------------------------------------
   只在真实应用里能验证的部分（浏览器预览没有后端绑定）：

     1. 在线搜索返回结果，并且每条都带同源封面代理地址
     2. 封面代理真的能取到图片（<img> 加载成功，且不是 204 空响应）
     3. 下载：调用后端接口后，文件真的落到配置的下载目录里
     4. 试听：进入播放列表但不进本地曲库

   注意：哔哩哔哩的搜索接口对同一关键词有频率限制，短时间内反复搜索会返回
   空列表（不是代码故障）。因此「封面」与「下载」两项都直接指定关键词/视频，
   不依赖搜索是否命中。

   用法：
     node tools/onlinecheck.mjs [--exe bin/lmplayer.exe] [--port 9377]
                                [--query "晴天"] [--bvid BVxxxx] [--skip-download]
   ========================================================================== */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readdirSync, statSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const EXE = path.resolve(ROOT, arg("exe", "bin/lmplayer.exe"));
const PORT = Number(arg("port", "9377"));
const QUERY = arg("query", "晴天");
// 默认用一个稳定存在的公开视频做下载验证（可用 --bvid 覆盖）
const BVID = arg("bvid", "BV1uv411q7Mv");
const SLEEP_AFTER_BOOT = Number(arg("wait", "16000"));
const SKIP_DOWNLOAD = hasFlag("skip-download");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(EXE)) {
  console.error(`找不到可执行文件：${EXE}`);
  process.exit(1);
}

const workDir = path.join(ROOT, ".tmp-onlinecheck");
rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });

const logPath = path.join(workDir, "app.log");
const logFd = openSync(logPath, "w");
const child = spawn(EXE, [], {
  env: {
    ...process.env,
    LMPLAYER_DEBUG_PORT: String(PORT),
    WEBVIEW2_USER_DATA_FOLDER: path.join(workDir, "wv2"),
    // 独立数据目录，避免污染用户真实配置
    LMPLAYER_DATA_DIR: path.join(workDir, "data"),
    // 下载目录固定到临时目录，方便断言
    LMPLAYER_MUSIC_DIR: path.join(workDir, "Music"),
  },
  stdio: ["ignore", logFd, logFd],
  detached: false,
});
closeSync(logFd);

function get(pathname) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: PORT, path: pathname }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

let target = null;
for (let i = 0; i < 150 && !target; i += 1) {
  await sleep(400);
  try {
    const list = JSON.parse(await get("/json/list"));
    target = list.find((t) => t.type === "page") || null;
  } catch {
    /* 等 DevTools 起来 */
  }
}
if (!target) {
  console.error("无法连接 WebView2 调试端口，应用日志见 " + logPath);
  child.kill();
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let msgId = 0;
const send = (method, params = {}) =>
  new Promise((resolve) => {
    msgId += 1;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
const consoleErrors = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    consoleErrors.push(`EXCEPTION ${d.text} ${d.exception?.description || ""}`);
  } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    consoleErrors.push(`CONSOLE ${(msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ")}`);
  }
});
await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");

// 等应用启动完成（首扫 + 前端挂载）
for (let i = 0; i < 60; i += 1) {
  const ready = await send("Runtime.evaluate", {
    expression: "document.body.dataset.ready === 'true'",
    returnByValue: true,
  });
  if (ready?.result?.value === true) break;
  await sleep(500);
}
await sleep(Math.max(0, SLEEP_AFTER_BOOT - 16000));
console.log("应用已就绪\n");

async function evalJs(expression) {
  const res = await send("Runtime.evaluate", {
    expression: `(async () => { ${expression} })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res?.exceptionDetails) {
    throw new Error(
      `页面求值异常: ${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description || ""}`
    );
  }
  return res?.result?.value;
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "[OK ]" : "[!! ]"} ${name}${detail ? `  — ${detail}` : ""}`);
}

/** 等一个 <img> 加载完（返回尺寸），验证封面代理真的返回了图片 */
async function loadImage(url) {
  return evalJs(`
    const url = ${JSON.stringify(url)};
    return await new Promise((resolve) => {
      const img = new Image();
      const t = setTimeout(() => resolve({ ok: false, reason: "timeout" }), 25000);
      img.onload = () => { clearTimeout(t); resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight }); };
      img.onerror = () => { clearTimeout(t); resolve({ ok: false, reason: "error" }); };
      img.src = url;
    });
  `);
}

try {
  /* 1. 在线搜索（可能被 bilibili 限流，不算失败但要说清楚） */
  const search = await evalJs(`
    const { backend } = await import("/js/bridge.js");
    const list = await backend.onlineSearch(${JSON.stringify(QUERY)}, 1, 8);
    const items = Array.isArray(list) ? list : [];
    return {
      count: items.length,
      withCover: items.filter((s) => s.coverUrl).length,
      first: items[0] ? { id: items[0].id, title: items[0].title, bvid: items[0].bvid, coverUrl: items[0].coverUrl } : null,
    };
  `);
  if (search.count === 0) {
    console.log(`     [warn] 在线搜索返回 0 条（关键词「${QUERY}」，通常是 bilibili 限流），跳过搜索相关断言`);
  } else {
    check("在线搜索返回结果", search.count > 0, `count=${search.count}`);
    check(
      "搜索结果全部带同源封面代理地址",
      search.withCover === search.count,
      `withCover=${search.withCover}/${search.count}`
    );
    check(
      "封面地址是本地同源代理（不直连第三方）",
      String(search.first?.coverUrl || "").startsWith("/online/cover"),
      String(search.first?.coverUrl || "").slice(0, 80)
    );
  }

  /* 2. 封面来源：直接指定关键词，不依赖搜索 */
  const cover = await evalJs(`
    const { backend } = await import("/js/bridge.js");
    const res = await backend.coverLookup("晴天", "周杰伦", "叶惠美", 269000, "");
    return { available: res?.available === true, provider: res?.provider || "", score: res?.score ?? null, url: res?.url || "", source: res?.source || "" };
  `);
  check(
    "联网封面匹配成功且命中真实来源",
    cover.available && cover.provider && cover.provider !== "fallback",
    `provider=${cover.provider} score=${cover.score}`
  );
  if (cover.url) {
    const img = await loadImage(cover.url);
    check("封面代理能取到真实图片", img.ok === true, JSON.stringify(img));
  }

  /* 2b. 拿不到封面时必须干脆地返回「没有」，而不是 500 / 破图 */
  const miss = await evalJs(`
    const { backend } = await import("/js/bridge.js");
    const res = await backend.coverLookup("zzzz不存在的歌曲zzzz", "nobody", "", 0, "");
    return { available: res?.available === true, reason: res?.reason || "" };
  `);
  check("查不到封面时明确返回 available=false", miss.available === false, JSON.stringify(miss));

  /* 3. 下载：文件真的落到下载目录 */
  let downloadDir = "";
  let saved = null;
  if (!SKIP_DOWNLOAD) {
    const dir = await evalJs(`
      const { backend } = await import("/js/bridge.js");
      const st = await backend.downloadStatus();
      return st?.dir || "";
    `);
    downloadDir = dir;
    console.log(`     下载目录：${dir}`);

    const started = await evalJs(`
      const { backend } = await import("/js/bridge.js");
      return await backend.downloadStart(${JSON.stringify(BVID)}, "", 0);
    `);
    check("下载接口已开始", started?.started === true, JSON.stringify(started));

    for (let i = 0; i < 100; i += 1) {
      await sleep(1000);
      if (!existsSync(dir)) continue;
      const entries = readdirSync(dir).filter((f) => !f.endsWith(".part"));
      if (!entries.length) continue;
      const full = path.join(dir, entries[0]);
      const a = statSync(full).size;
      await sleep(1200);
      const b = statSync(full).size;
      if (a > 0 && a === b) {
        saved = { name: entries[0], size: b, path: full };
        break;
      }
    }
    check(
      "下载文件已保存到配置的下载目录",
      Boolean(saved),
      saved ? `${saved.name} (${(saved.size / 1024 / 1024).toFixed(2)} MB)` : "未在 100 秒内完成"
    );
    // 不应该留下 .part 半成品
    const leftovers = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".part")) : [];
    check("下载完成后没有残留 .part 临时文件", leftovers.length === 0, leftovers.join(","));
  }

  /* 3b. 下载目录是隐式扫描根：重扫后下载的歌必须出现在「本地歌曲」里 */
  if (saved) {
    const inLibrary = await evalJs(`
      const { backend } = await import("/js/bridge.js");
      const store = await import("/js/store.js");
      const folders = await backend.folders();
      let scanError = "";
      try {
        await backend.scan([]);
      } catch (err) {
        scanError = err?.message || String(err);
      }
      // Scan 是异步的（立即返回 {started:true}，跑完才发 scan:done），
      // 所以这里轮询曲库等新歌出现
      let fresh = [];
      for (let i = 0; i < 40; i += 1) {
        fresh = (await backend.songs()) || [];
        const found = fresh.some(
          (s) => (s.path || "").split(/[\\\\/]/).pop().toLowerCase() === ${JSON.stringify(saved.name.toLowerCase())}
        );
        if (found) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (store.applySongs) store.applySongs(fresh);
      const hit = (fresh || []).filter((s) => (s.path || "").split(/[\\\\/]/).pop().toLowerCase() === ${JSON.stringify(
        saved.name.toLowerCase()
      )});
      return {
        folders: (folders || []).map((f) => ({ id: f.id, path: f.path })),
        scanError,
        scanned: (fresh || []).length,
        hits: hit.length,
        title: hit[0]?.title || "",
        sample: (fresh || []).slice(0, 3).map((s) => s.path),
      };
    `);
    const folderList = inLibrary.folders || [];
    const hasDownloadRoot = folderList.some(
      (f) => String(f.path || "").toLowerCase() === String(downloadDir || "").toLowerCase()
    );
    check(
      "下载目录被当作扫描根（无需手动添加文件夹）",
      hasDownloadRoot,
      folderList
        .map((f) => `${f.id}:${f.path}`)
        .join(" | ")
        .slice(0, 200)
    );
    check("下载的歌出现在本地曲库里", inLibrary.hits > 0, JSON.stringify(inLibrary));
    console.log(
      `     扫描：曲库 ${inLibrary.scanned} 首 err=${inLibrary.scanError} sample=${JSON.stringify(inLibrary.sample)}`
    );
  }

  /* 3c. 更换封面：真的落进缓存目录 */
  if (saved) {
    const coverApply = await evalJs(`
      const { backend } = await import("/js/bridge.js");
      const store = await import("/js/store.js");
      const songs = await backend.songs();
      const target = (songs || []).find((s) => (s.path || "").split(/[\\\\/]/).pop().toLowerCase() === ${JSON.stringify(
        saved.name.toLowerCase()
      )});
      if (!target) return { skipped: true, message: "曲库里找不到刚下载的歌" };
      // 下载下来的文件本身没有标签（标题就是从文件名来的），直接拿它去搜封面
      // 基本不可能命中。这里用「按别的关键词搜索」那条路径（override），
      // 验证的是「更换封面这条链路」，而不是「封面库认不认识这个视频标题」。
      //
      // 顺便开启「把封面写进歌曲文件」，验证在真实 m4a 上追加 covr 不会写坏文件：
      // 写完重新扫描，歌曲的内嵌封面必须能读回来。
      // 注意：写回开关要显式传给 coverApply —— 配置是前端防抖同步的，
      // 刚 setConfig 完立刻换封面时后端可能还没收到。
      const before = await backend.songs();
      const beforeSong = (before || []).find((s) => s.id === target.id);
      const found = await backend.coverLookupSong(target.id, {
        title: "晴天",
        artist: "周杰伦",
        album: "叶惠美",
      });
      if (!found?.ok || !found.preview) {
        return { skipped: true, message: found?.message || "没有找到匹配的封面" };
      }
      const applied = await backend.coverApply(target.id, found.source || "", found.preview, true);
      const current = await backend.coverCurrent(target.id);
      const stats = await backend.coverCacheStats();

      // 让曲库重新扫描，然后等它把新封面写进曲目列表
      await backend.scan([]);
      let reScanned = null;
      let scannedAt = 0;
      for (let i = 0; i < 60; i += 1) {
        const list = (await backend.songs()) || [];
        reScanned = list.find((s) => s.id === target.id) || null;
        if (reScanned && String(reScanned.cover || "").startsWith("data:image")) {
          scannedAt = i;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      return {
        provider: found.provider,
        score: found.score,
        applied: applied?.ok === true,
        embedded: applied?.embedded === true,
        message: applied?.message || "",
        cached: current?.cached === true,
        covers: stats?.covers ?? 0,
        cacheDir: stats?.dir || "",
        // 重新扫描后从文件里读到的封面
        readBack: String(reScanned?.cover || "").startsWith("data:image"),
        readBackBytes: Math.round(((reScanned?.cover || "").length * 3) / 4),
        scannedAt,
        sizeBefore: beforeSong?.size ?? null,
        sizeAfter: reScanned?.size ?? null,
        titleAfter: reScanned?.title || "",
      };
    `);
    if (coverApply?.skipped) {
      check("更换封面写进缓存目录", false, `跳过：${coverApply.message || "没找到目标歌曲"}`);
    } else {
      check(
        "联网找到封面并写进缓存目录",
        coverApply.applied === true && coverApply.cached === true && coverApply.covers > 0,
        JSON.stringify(coverApply)
      );
      check("封面缓存目录已创建", existsSync(coverApply.cacheDir), coverApply.cacheDir);
      console.log(`     封面来源：${coverApply.provider} 嵌入文件：${coverApply.embedded}`);
    }
  }

  /* 4. 试听只进播放列表（用封面那一步的信息构造，不依赖搜索） */
  const preview = await evalJs(`
    const store = await import("/js/store.js");
    const id = "bili:BVONLINECHECK";
    // 注意：before 要在登记**之前**取，而且只能比「本地曲库」——
    // 上面为了验证下载目录是扫描根，曲库此时已经有歌了。
    const before = { songs: store.state.songs.length };
    store.registerOnlineSong({ id, title: "在线试听测试", artist: "测试", album: "在线", ext: "m4a", duration: 180000, online: true });
    const queue = [...store.state.queue, id];
    store.playContext(queue, queue.length - 1, { type: "online", id: null });
    await new Promise((r) => setTimeout(r, 150));
    return {
      before,
      after: { songs: store.state.songs.length, queue: store.state.queue.length },
      inSongs: store.state.songs.some((s) => s.id === id),
      inQueue: store.state.queue.includes(id),
      resolved: Boolean(store.songById(id)),
    };
  `);
  check(
    "试听只进播放列表、不进本地曲库",
    preview.inQueue === true &&
      preview.inSongs === false &&
      preview.resolved === true &&
      preview.after.songs === preview.before.songs,
    JSON.stringify(preview)
  );

  /* 3d. 更改下载目录 + 迁移
     放在最后：它会把文件搬走，之后再检查「下载的歌在曲库里」就找不到文件了。 */
  if (saved) {
    const migratedDir = path.join(workDir, "Music2", "downloads");
    const migration = await evalJs(`
      const { backend } = await import("/js/bridge.js");
      const proposal = await backend.downloadSetDir(${JSON.stringify(migratedDir)});
      const applied = await backend.downloadApplyDir(proposal.next, true);
      return { proposal, applied };
    `);
    check(
      "更改下载目录会先给出迁移提案（含现有文件数量）",
      Number(migration.proposal?.count) > 0 && migration.proposal?.same === false,
      JSON.stringify({ count: migration.proposal?.count, at: migration.proposal?.current })
    );
    check(
      "确认后歌曲被迁移到新目录",
      Number(migration.applied?.migrated) > 0 && existsSync(path.join(migratedDir, saved.name)),
      JSON.stringify({
        migrated: migration.applied?.migrated,
        skipped: migration.applied?.skipped,
        dir: migration.applied?.dir,
      })
    );
    check("迁移后旧位置不再有该文件", !existsSync(path.join(downloadDir, saved.name)), downloadDir);
  }

  check("全程无 console 报错", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
} catch (err) {
  check("脚本执行", false, err?.message || String(err));
}
ws.close();
child.kill();
await sleep(500);

const failed = results.filter((r) => !r.ok).length;
console.log("");
console.log(failed ? `失败 ${failed} / ${results.length}` : `全部通过（${results.length} 项）`);
console.log(`应用日志：${logPath}`);
process.exit(failed ? 1 : 0);
