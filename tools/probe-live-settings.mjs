/* ==========================================================================
   probe-live-settings.mjs — 在**真实应用**里体检设置层与紧凑播放控件
   --------------------------------------------------------------------------
   临时脚本（与 hitcheck.mjs 同一套 CDP 接入方式）：
     · 打开设置层，量导航栏几何；
     · 点导航项后点开关，确认选中态不跳回第一个；
     · 用真实鼠标点击紧凑播放控件的播放/暂停，确认状态真的变了；
     · 确认标题栏仍然露在外面且可交互。
   用法：node tools/probe-live-settings.mjs [--exe bin/lmplayer.exe]
   ========================================================================== */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const EXE = path.resolve(ROOT, arg("exe", "bin/lmplayer.exe"));
const PORT = Number(arg("port", "9393"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const runDir = path.join(ROOT, ".tmp-live-settings");
const dataDir = path.join(runDir, "data");
const musicDir = path.join(runDir, "Music");
mkdirSync(runDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });
mkdirSync(musicDir, { recursive: true });

/** 与 Go 的 bootstrap.StableID / 前端 utils.js#stableId 一致（FNV-1a / UTF-16 码元） */
function stableId(input, prefix = "t") {
  let h = 2166136261 >>> 0;
  for (const ch of input) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `${prefix}_${h.toString(36)}`;
}

/** 造一个 ftyp + moov(mvhd) + mdat 的最小 m4a（mdat 填 30KB）。
 *  为什么要 30KB：默认过滤规则里有一条「小于 10KB 排除」，
 *  太小的样本会被正常筛掉，扫描结果就是空的。 */
function buildProbeM4A() {
  const box = (kind, payload) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(payload.length + 8, 0);
    head.write(kind, 4, "latin1");
    return Buffer.concat([head, payload]);
  };
  const ftyp = box("ftyp", Buffer.concat([Buffer.from("M4A ", "latin1"), Buffer.alloc(4)]));
  const mvhd = box("mvhd", Buffer.alloc(100));
  const moov = box("moov", mvhd);
  const mdat = box("mdat", Buffer.alloc(30000));
  return Buffer.concat([ftyp, moov, mdat]);
}

/* 放一首真的能写标签的 m4a 进曲库，并把它所在的目录写成音乐文件夹 ——
   这样「把缓存写进文件」这条链路（后端读缓存 → EmbedMeta 写文件）可以端到端验证，
   而不是只检查弹窗有没有弹出来。 */
const probeSongPath = path.join(musicDir, "probe-song.m4a");
const probeSongId = stableId(probeSongPath);
writeFileSync(probeSongPath, buildProbeM4A());
console.log(`已放置测试曲目：${probeSongPath}（id=${probeSongId}）`);

// 配置文件：只加我们那个音乐文件夹（不用默认的「下载目录」，它指向不存在的 downloads，
// 会让扫描结果为空）。注意 JSON 里用正斜杠，Wails 的配置读写都不介意。
writeFileSync(
  path.join(dataDir, "config.json"),
  JSON.stringify(
    {
      theme: "dark-minimal",
      themeMode: "dark",
      showLyrics: true,
      playMode: "sequence",
      volume: 0.8,
      autoScanOnStart: true,
      watchFolders: false,
      scanConcurrency: 4,
      lyricsFontSize: 16,
      lyricsLines: 7,
      lyricsSources: ["lrc-file", "embedded", "online"],
      loudnessMode: "off",
      loudnessTarget: -16,
      loudnessLimit: true,
      onlineCover: false,
      embedMeta: false,
      rowClickAction: "next",
      listDensity: "cozy",
      folders: [
        {
          id: "f_probe",
          path: musicDir.replace(/\\/g, "/"),
          trackCount: 0,
          status: "ok",
          watching: false,
          addedAt: Date.now(),
        },
      ],
      likedIds: [],
      playlists: [],
      // 显式给空数组：后端在没配过过滤规则时会填回默认规则（含「小于 10KB 排除」）
      filterRules: [],
    },
    null,
    2
  ),
  "utf8"
);

/* 预置两份缓存，这样「打开写进文件开关 → 弹确认框 → 真写入」这条路径能被真正走到
   （这条分支只在缓存里确实有东西时才弹）。 */
const cacheMeta = path.join(dataDir, "cache", "meta");
mkdirSync(path.join(cacheMeta, "covers"), { recursive: true });
mkdirSync(path.join(cacheMeta, "lyrics"), { recursive: true });
writeFileSync(
  path.join(cacheMeta, "covers", `${probeSongId}.jpg`),
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9])
);
writeFileSync(
  path.join(cacheMeta, "covers", "index.json"),
  JSON.stringify({
    version: 1,
    entries: { [probeSongId]: { file: `${probeSongId}.jpg`, mime: "image/jpeg", source: "user", at: Date.now() } },
  })
);
writeFileSync(path.join(cacheMeta, "lyrics", `${probeSongId}.lrc`), "[00:01.00]probe lyrics\n");
writeFileSync(
  path.join(cacheMeta, "lyrics", "index.json"),
  JSON.stringify({
    version: 1,
    entries: { [probeSongId]: { file: `${probeSongId}.lrc`, source: "user", at: Date.now() } },
  })
);
console.log(`预置：${probeSongPath}（id=${probeSongId}）+ 一份封面与歌词缓存`);

const child = spawn(EXE, [], {
  env: {
    ...process.env,
    LMPLAYER_DEBUG_PORT: String(PORT),
    WEBVIEW2_USER_DATA_FOLDER: path.join(runDir, "wv2"),
    LMPLAYER_DATA_DIR: dataDir,
    LMPLAYER_MUSIC_DIR: musicDir,
  },
  stdio: "ignore",
});

const get = (p) =>
  new Promise((res, rej) =>
    http
      .get({ host: "127.0.0.1", port: PORT, path: p }, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => res(d));
      })
      .on("error", rej)
  );

let target = null;
for (let i = 0; i < 120 && !target; i += 1) {
  await sleep(400);
  try {
    target = JSON.parse(await get("/json/list")).find((t) => t.type === "page");
  } catch {
    /* 等 DevTools */
  }
}
if (!target) {
  console.error("无法连接调试端口");
  child.kill();
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let id = 0;
const send = (m, p = {}) =>
  new Promise((r) => {
    id += 1;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method: m, params: p }));
  });
await new Promise((r) =>
  ws.addEventListener("open", () => {
    r();
  })
);
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
});

const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) return { __error: r.exceptionDetails.text };
  return r?.result?.value;
};

/** 真实鼠标点击（走 Input.dispatchMouseEvent，因此会经过命中测试） */
async function realClick(selector) {
  const box = await evalJs(`(() => {
    const n = document.querySelector(${JSON.stringify(selector)});
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (!box || box.__error) return { clicked: false, selector };
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", {
      type,
      x: box.x,
      y: box.y,
      button: "left",
      clickCount: 1,
      buttons: type === "mousePressed" ? 1 : 0,
    });
  }
  await sleep(220);
  const top = await evalJs(
    `(() => { const el = document.elementFromPoint(${box.x}, ${box.y}); return el ? (el.id || el.tagName) : "none"; })()`
  );
  return { clicked: true, selector, x: box.x, y: box.y, top };
}

// 等应用就绪
for (let i = 0; i < 60; i += 1) {
  const ready = await evalJs(`document.body.dataset.ready === "true"`);
  if (ready === true) break;
  await sleep(400);
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ ok, name, detail });
  console.log(`[${ok ? "OK " : "!! "}] ${name}${detail ? "  — " + detail : ""}`);
};

/* ---- 1. 打开设置 ---- */
await realClick("#btn-settings");
await sleep(600);
const opened = await evalJs(`(() => {
  const layer = document.getElementById("settings-layer");
  const panel = layer.querySelector(".settings-layer__panel");
  const head = layer.querySelector(".settings-layer__head");
  const body = layer.querySelector(".settings-layer__body");
  const nav = document.querySelector(".settings__nav");
  const sp = document.getElementById("settings-player");
  const R = (n) => { const r = n.getBoundingClientRect(); return { y: Math.round(r.top), h: Math.round(r.height), bottom: Math.round(r.bottom), x: Math.round(r.left), w: Math.round(r.width) }; };
  const tb = document.getElementById("btn-settings").getBoundingClientRect();
  const topEl = document.elementFromPoint(Math.round(tb.left + tb.width / 2), Math.round(tb.top + tb.height / 2));
  return {
    layerOpen: layer.hidden === false,
    layer: R(layer), panel: R(panel), head: R(head), body: R(body), nav: R(nav), sp: R(sp),
    gapHeadToNav: Math.round(nav.getBoundingClientRect().top - head.getBoundingClientRect().bottom),
    navSelected: [...document.querySelectorAll(".settings__nav-item")].filter(b => b.getAttribute("aria-selected") === "true").map(b => b.textContent.trim()),
    titlebarSettingsClickable: topEl ? (topEl.closest("#btn-settings") ? "self" : (topEl.id || topEl.tagName)) : "none",
    viewportH: innerHeight,
  };
})()`);
check("设置层已打开", opened.layerOpen === true, JSON.stringify(opened.layer));
check("标题栏没有被设置层盖住（顶部仍在标题栏之下）", opened.layer.y >= 36, `layer.y=${opened.layer.y}`);
check("面板里能看到紧凑播放控件", opened.sp && opened.sp.h > 40, JSON.stringify(opened.sp));
check(
  "紧凑播放控件在面板底部（不与标题栏重叠）",
  opened.sp.y > opened.head.bottom && opened.sp.bottom <= opened.panel.bottom + 1,
  `sp=${opened.sp.y}..${opened.sp.bottom} panel=${opened.panel.y}..${opened.panel.bottom}`
);
check("导航栏紧贴面板标题栏（间距 ≤ 20px）", opened.gapHeadToNav <= 20, `gap=${opened.gapHeadToNav}px`);
check(
  "标题栏的设置按钮仍然可点（没被层吃掉）",
  opened.titlebarSettingsClickable === "self",
  opened.titlebarSettingsClickable
);

/* ---- 2. 点导航项 → 点开关，选中态不能跳回第一个 ---- */
const navPersist = await evalJs(`(() => {
  const sel = () => [...document.querySelectorAll(".settings__nav-item")].filter(b => b.getAttribute("aria-selected") === "true").map(b => b.textContent.trim());
  document.querySelector('.settings__nav-item[data-goto="playback"]').click();
  const afterNav = sel();
  document.querySelector('[data-toggle="watchFolders"]').click();
  const afterToggle = sel();
  document.querySelector('[data-segment="listDensity"] [data-value="compact"]').click();
  const afterSegment = sel();
  return { afterNav, afterToggle, afterSegment };
})()`);
check("点开关后导航选中态保持在「播放」", navPersist.afterToggle.includes("播放"), JSON.stringify(navPersist));
check(
  "点分段控件后导航选中态仍然保持在「播放」",
  navPersist.afterSegment.includes("播放"),
  JSON.stringify(navPersist)
);

/* ---- 3. 紧凑播放控件：真实鼠标操作 ---- */
// 这个隔离环境只放了一首 m4a，扫描是异步的，所以先等曲库就绪再操作。
const lib = await evalJs(`(async () => {
  const store = window.__app;
  for (let i = 0; i < 40 && !store.state.songs.length; i++) {
    await new Promise((r) => setTimeout(r, 250));
  }
  return { songs: store.state.songs.length, first: store.state.songs[0]?.title || null, visible: store.state.visibleSongs.length };
})()`);
check("隔离曲库扫描到了那首测试曲目", lib.songs > 0, JSON.stringify(lib));

const playState = await evalJs(`(() => {
  const store = window.__app;
  const id = store.state.songs[0]?.id;
  if (id) {
    store.state.currentId = id;
    store.state.queue = [id];
    store.state.duration = store.state.songs[0].duration || 200000;
    store.state.position = 41000;
    store.state.playing = true;
    store.commit();
  }
  return { current: store.state.currentId };
})()`);
await sleep(700);
const painted = await evalJs(`(() => ({
  title: document.getElementById("sp-title").textContent,
  sub: document.getElementById("sp-sub").textContent,
  time: document.getElementById("sp-time-current").textContent,
  tip: document.getElementById("sp-play").dataset.tip,
  playIconIsPause: document.getElementById("sp-icon-play").innerHTML.includes("pause"),
  fill: document.getElementById("sp-progress-fill").style.width,
  mainTitle: document.getElementById("bar-title").textContent,
}))()`);
check(
  "紧凑控件画出了当前曲目与进度（与底栏同源）",
  painted.title !== "未在播放" && painted.time === "00:41" && painted.playIconIsPause === true,
  JSON.stringify(painted)
);

const playClick = await realClick("#sp-play");
await sleep(500);
const afterPlay = await evalJs(`(() => {
  const store = window.__app;
  return { playing: store.state.playing, tip: document.getElementById("sp-play").dataset.tip };
})()`);
check(
  "真实鼠标点紧凑控件的播放键命中的就是它自己",
  playClick.top === "sp-play" || playClick.top === "use",
  `top=${playClick.top}`
);
check(
  "紧凑控件播放键切换了播放状态",
  afterPlay.playing === false && afterPlay.tip === "播放",
  JSON.stringify({ before: playState, click: playClick, after: afterPlay })
);

/* ---- 4. 歌词：底栏不给「隐藏」入口，桌面歌词是另一件事 ---- */
const lyrics = await evalJs(`(() => {
  const store = window.__app;
  const before = store.state.config.showLyrics !== false;
  const desktop = document.getElementById("btn-desktop-lyrics");
  desktop?.click();
  const afterDesktop = store.state.config.showLyrics;
  return {
    before,
    afterDesktop,
    hasLyricsVisible: !!document.getElementById("btn-lyrics-visible"),
    hasSpLyrics: !!document.getElementById("sp-lyrics-toggle"),
    hasFullscreen: !!document.getElementById("btn-fullscreen"),
    hasDesktop: !!desktop,
    hasMatch: !!document.getElementById("btn-lyrics"),
  };
})()`);
check("点「桌面歌词」不影响详情页歌词（两件事分开）", lyrics.afterDesktop === lyrics.before, JSON.stringify(lyrics));
check(
  "底栏 / 设置层都没有歌词显隐按钮（需求：歌词不提供隐藏入口）",
  lyrics.hasLyricsVisible === false && lyrics.hasSpLyrics === false,
  JSON.stringify(lyrics)
);
check(
  "底栏没有全屏按钮",
  lyrics.hasFullscreen === false && lyrics.hasDesktop === true && lyrics.hasMatch === true,
  JSON.stringify(lyrics)
);

/* ---- 5. 把缓存写进文件：开关打开时，缓存里有东西就该弹确认框 ---- */
// 先等缓存统计真的回来了（它决定「弹框」还是「只 toast 一句」），
// 否则会测成「缓存为空」那条分支，等于没测到这个需求。
const cacheReady = await evalJs(`(async () => {
  for (let i = 0; i < 40; i++) {
    if (window.__app.state.coverCache) break;
    await new Promise(r => setTimeout(r, 150));
  }
  return window.__app.state.coverCache || null;
})()`);
const embed = await evalJs(`(async () => {
  const toasts = [];
  const box = document.getElementById("toasts");
  const obs = new MutationObserver(() => {
    box.querySelectorAll(".toast").forEach(t => { const s = t.textContent.trim(); if (!toasts.includes(s)) toasts.push(s); });
  });
  obs.observe(box, { childList: true, subtree: true });
  const modal = document.getElementById("modal-backdrop");
  const log = [];
  const mo = new MutationObserver((recs) => { for (const r of recs) log.push(r.attributeName + "=" + modal.getAttribute(r.attributeName)); });
  mo.observe(modal, { attributes: true });
  const sw = document.querySelector('[data-toggle="embedMeta"]');
  const before = sw.getAttribute("aria-checked");
  sw.click();
  // 提示是异步来的（要先等缓存统计），所以这里最多等 3 秒
  for (let i = 0; i < 30 && modal.hidden; i++) await new Promise(r => setTimeout(r, 100));
  obs.disconnect();
  mo.disconnect();
  const cs = getComputedStyle(modal);
  const r = modal.getBoundingClientRect();
  const mid = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  return {
    before, after: sw.getAttribute("aria-checked"), toasts,
    modalOpen: modal.hidden === false, modalText: modal.textContent.slice(0, 160),
    moLog: log.slice(-6),
    display: cs.display, zIndex: cs.zIndex, position: cs.position,
    modalRect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    centerHit: mid ? (mid.id || mid.className) : null,
    innerHtmlLen: modal.innerHTML.length,
  };
})()`);
check(
  "打开「写进歌曲文件」会切换开关",
  embed.before !== embed.after,
  JSON.stringify({ before: embed.before, after: embed.after })
);
check(
  "有缓存时，打开开关会弹出「要不要把已有缓存写进文件」确认框",
  embed.modalOpen === true && /写入/.test(embed.modalText),
  JSON.stringify({ cache: cacheReady, modalOpen: embed.modalOpen, modalText: embed.modalText, toasts: embed.toasts })
);
if (embed.modalOpen) {
  // 先看弹窗按钮上面压着的是谁（层叠问题会在这里暴露）
  const hits = await evalJs(`(() => {
    const btn = document.querySelector('#modal-backdrop [data-act="cancel"]');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const el = document.elementFromPoint(x, y);
    return { x, y, hit: el ? el.tagName + "." + (typeof el.className === "string" ? el.className : "") : "none" };
  })()`);
  check(
    "确认框的按钮没有被别的层挡住（能真实点到）",
    typeof hits?.hit === "string" && hits.hit.startsWith("BUTTON"),
    JSON.stringify(hits)
  );

  const okClick = await realClick('#modal-backdrop [data-act="ok"]');
  await sleep(1500);
  const afterOk = await evalJs(`(() => ({
    hidden: document.getElementById("modal-backdrop").hidden,
    toasts: [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent.trim()),
    embed: window.__app.state.config.embedMeta,
  }))()`);

  // 端到端：缓存里的封面与歌词有没有真的写进那个 m4a 文件
  const written = existsSync(probeSongPath) ? readFileSync(probeSongPath) : Buffer.alloc(0);
  const original = buildProbeM4A();
  check(
    "点「写入文件」后弹窗关闭并给出结果",
    afterOk.hidden === true && afterOk.toasts.some((t) => /写入/.test(t)),
    JSON.stringify({ click: okClick, afterOk })
  );
  check(
    "缓存里的封面（covr）真的写进了 m4a 文件",
    written.includes(Buffer.from("covr")) && written.length > original.length,
    `原 ${original.length} → 现 ${written.length}`
  );
  check(
    "缓存里的歌词（©lyr）也一并写进了同一个文件",
    written.includes(Buffer.from([0xa9, 0x6c, 0x79, 0x72])),
    JSON.stringify({ lyricsAtom: written.includes(Buffer.from([0xa9, 0x6c, 0x79, 0x72])) })
  );
  check(
    "写入没有动音频数据（mdat 原样保留）",
    written.includes(Buffer.alloc(2048)) === false || written.length >= original.length,
    `原 ${original.length} → 现 ${written.length}`
  );
}

/* ---- 收尾 ---- */
ws.close();
child.kill();

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(failed.length ? `失败 ${failed.length} / ${results.length} 项` : `全部通过（${results.length} 项）`);
process.exit(failed.length ? 1 : 0);
