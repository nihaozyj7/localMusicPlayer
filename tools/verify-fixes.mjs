/* ==========================================================================
   verify-fixes.mjs — 用真实应用（WebView2 + CDP）验证本轮 5 个修复
   --------------------------------------------------------------------------
   和 tools/appinspect.mjs 一样走远程调试端口，但这里只做「断言」：
   每个修复对应一段在页面里求值的表达式，最后汇总 PASS/FAIL。

   用法：node tools/verify-fixes.mjs
   ========================================================================== */

import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const EXE = path.resolve(ROOT, "bin/lmplayer.exe");
const PORT = 9334;
const WAIT = 16000;
const CONFIG = path.join(process.env.APPDATA || "", "LocalMusicPlayer", "config.json");
const CONFIG_BAK = `${CONFIG}.verify-bak`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(EXE)) {
  console.error(`找不到可执行文件：${EXE}`);
  process.exit(1);
}

/*
  配置保护 —— 这里是**用户的真实配置**（音乐文件夹、歌单、AI Key 都在里面），
  测试只能动「与本次验证相关」的几个字段，并且必须能完整还原。

  教训：先把文件整体读进内存、结束时写回，是不够的 —— 应用在退出时会自己
  把配置刷一遍（见 services.go#SetDesktopLyrics → store.Update），
  如果那时我们还没等进程真正退出，应用就会把我们恢复的内容覆盖掉。
  所以这里用「备份文件 + 等进程退出后再还原」这套更笨但更可靠的流程。
*/
if (!existsSync(CONFIG)) {
  console.error(`找不到配置文件：${CONFIG}`);
  process.exit(1);
}
copyFileSync(CONFIG, CONFIG_BAK);
const configSnapshot = JSON.parse(readFileSync(CONFIG, "utf8"));
console.log(`[setup] 已备份配置到 ${CONFIG_BAK}`);

function restoreConfig() {
  try {
    copyFileSync(CONFIG_BAK, CONFIG);
    rmSync(CONFIG_BAK, { force: true });
    console.log("[teardown] 已还原用户配置");
  } catch (err) {
    console.error(`[teardown] 还原配置失败（备份在 ${CONFIG_BAK}）:`, err.message);
  }
}
// 任何意外退出也要还原
process.on("exit", () => {
  if (existsSync(CONFIG_BAK)) restoreConfig();
});

/* 只改与本次验证相关的字段，其余原样保留 */
try {
  const cfg = { ...configSnapshot };
  cfg.theme = "cover-dark";
  cfg.themeMode = "dark";
  cfg.accentFromCover = true;
  cfg.showDesktopLyrics = true;
  cfg.coverSeed = "";
  cfg.coverSeed2 = "";
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), "utf8");
  console.log("[setup] 已临时设置 cover-dark + accentFromCover + showDesktopLyrics");
} catch (err) {
  console.warn("[setup] 写配置失败（继续）:", err.message);
}

const workDir = path.join(ROOT, ".tmp-verify");
mkdirSync(workDir, { recursive: true });
const logPath = path.join(workDir, "app.log");
const logFd = openSync(logPath, "w");
const child = spawn(EXE, [], {
  env: {
    ...process.env,
    LMPLAYER_DEBUG_PORT: String(PORT),
    WEBVIEW2_USER_DATA_FOLDER: path.join(workDir, "wv2"),
  },
  stdio: ["ignore", logFd, logFd],
});
closeSync(logFd);

let target = null;
for (let i = 0; i < 60 && !target; i += 1) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    // 桌面歌词是一个**独立页面**（lyrics.html），它也挂在同一个调试端口上。
    // 这里必须挑主界面，否则所有断言都会在一个空白小窗里跑。
    const pages = list.filter((x) => x.type === "page" && x.webSocketDebuggerUrl);
    target = pages.find((p) => !/lyrics\.html/i.test(p.url)) || null;
  } catch {
    /* 还没起来 */
  }
}
if (!target) {
  console.error("无法连上 WebView2 调试端口，看 " + logPath);
  child.kill();
  process.exit(1);
}
console.log(`已接入页面：${target.url}`);

const ws = new WebSocket(target.webSocketDebuggerUrl);
let msgId = 0;
const waiting = new Map();
const exceptions = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) {
    waiting.get(m.id)(m.result);
    waiting.delete(m.id);
  }
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    exceptions.push(`${d.text} ${d.exception?.description || ""}`);
  }
});
function send(method, params = {}) {
  msgId += 1;
  const id = msgId;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");
console.log(`等待 ${WAIT / 1000}s 让应用完成启动与扫描…`);
await sleep(WAIT);

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res?.exceptionDetails) {
    return { __error: res.exceptionDetails.text + " " + (res.exceptionDetails.exception?.description || "") };
  }
  return res?.result?.value;
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`);
}

/* -------------------------------------------------------------------------
   0. 桌面歌词：启动时就要自己出现（这是本轮修复的第一个问题）
   -------------------------------------------------------------------------
   用 Win32 枚举窗口，看应用进程里有没有一个**可见**的「桌面歌词」窗口。
   它是独立进程里的独立 HWND，只能从操作系统这一层观察。
   ------------------------------------------------------------------------- */
function desktopLyricsWindowVisible() {
  return new Promise((resolve) => {
    const ps = spawn(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "..", ".task", "enum-windows.ps1")],
      { stdio: ["ignore", "pipe", "ignore"] }
    );
    let out = "";
    ps.stdout.on("data", (c) => (out += c));
    ps.on("exit", () => {
      const line = out.split(/\r?\n/).find((l) => l.includes("桌面歌词"));
      // 表格行： HWND  Visible  Title  Class  Size  Pos
      resolve(Boolean(line && /\bTrue\b/.test(line)));
    });
    ps.on("error", () => resolve(false));
  });
}
const lyricsVisible = await desktopLyricsWindowVisible();
check("0a 启动后桌面歌词窗口自动出现且可见", lyricsVisible, lyricsVisible ? "" : "没找到可见的桌面歌词窗口");

/* -------------------------------------------------------------------------
   1. 首帧主题脚本：/early-theme.js 必须能拿到、内容里要有 data-theme
   ------------------------------------------------------------------------- */
const early = await evaluate(`(async () => {
  const res = await fetch('/early-theme.js', { cache: 'no-store' });
  return { ok: res.ok, status: res.status, body: await res.text() };
})()`);
check("1a 首帧主题脚本可获取", early?.ok && /data-theme/.test(early.body || ""), `status=${early?.status}`);
check(
  "1b 首帧主题带上保存的主题",
  /setAttribute\('data-theme',"cover-dark"\)/.test(early?.body || ""),
  (early?.body || "").slice(0, 120)
);

/* -------------------------------------------------------------------------
   2. 取色：换封面/换歌之后 --seed 必须跟着变（而不是卡在第一首的颜色）
   -------------------------------------------------------------------------
   显式暴露的 window.__app 里没有取色函数（它是 main.js 的模块内私有状态），
   所以这里从**可观察的结果**验证：
     a) 启动后种子已经算出来并落到令牌 + 配置上（说明走了新的驱动路径）；
     b) 换一张封面（这里放一张纯色 data URL，等价于「换歌」）后，
        --seed 与配置都必须跟着变，而不是停在上一张的颜色。
   ------------------------------------------------------------------------- */
const accent = await evaluate(`(async () => {
  const { state, commit } = window.__app;
  const seedOf = () => getComputedStyle(document.documentElement).getPropertyValue('--seed').trim();
  const initial = { seed: seedOf(), cfg: state.config.coverSeed };

  // 造一张纯红封面并让底栏用它：等价于用户切到另一首封面完全不同的歌
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d81e2c';
  ctx.fillRect(0, 0, 64, 64);
  const redCover = canvas.toDataURL('image/png');

  const { setCoverSet } = await import('/assets/index-sQr03V-f.js').catch(() => ({}));
  // 直接改封面覆盖表：coverOf(song) 会优先用它（与「手动匹配封面」同一条路）
  const songId = state.currentId;
  window.__verifyCover = true;
  // 通过公开路径：把覆盖表写进 state 并重绘底栏
  const { coverVersion } = window.__app;
  state.coverSets.set(songId, { items: [{ preview: redCover, source: 'verify' }], active: 0 });
  commit();
  await new Promise((r) => setTimeout(r, 2600));
  const after = { seed: seedOf(), cfg: state.config.coverSeed, barSrc: document.getElementById('bar-cover-img')?.getAttribute('src') };
  return { initial, after, songId };
})()`);
check(
  "2a 启动后已经算出封面主色并写入令牌",
  Boolean(accent && !accent.error && /^#[0-9a-f]{6}$/.test(accent.initial?.cfg || "")),
  accent?.error || `${accent?.initial?.cfg} / ${accent?.initial?.seed}`
);
check(
  "2b 换封面后 --seed 与配置都跟着变（不再卡在第一张）",
  Boolean(
    accent &&
    !accent.error &&
    accent.after?.cfg &&
    accent.after.cfg !== accent.initial?.cfg &&
    accent.after.seed !== accent.initial?.seed
  ),
  accent?.error || `${accent?.initial?.cfg} → ${accent?.after?.cfg}`
);
check(
  "2c 换封面后配置里的种子仍是合法颜色",
  Boolean(accent && !accent.error && /^#[0-9a-f]{6}$/.test(accent.after?.cfg || "")),
  accent?.after?.cfg
);

/* -------------------------------------------------------------------------
   3. 定位按钮：曲库 / 歌单 / 播放列表面板都要有，且点了真的滚到当前行
   ------------------------------------------------------------------------- */
const locate = await evaluate(`(async () => {
  const { state } = window.__app;
  const out = {};
  out.libraryBtn = Boolean(document.querySelector('#content-tools [data-tool="locate"]'));
  out.queuePanelBtn = Boolean(document.querySelector('#queue-locate'));

  const scroller = document.getElementById('content-body');

  // 先用「多行内容」把滚动区撑起来，这样滚动有没有发生是可观测的：
  // 曲库可能只有一两首歌（滚动区根本不可滚），那验证不了「定位会滚动」。
  // 留白必须插在**列表前面**，否则滚到底时列表仍然在视野里，行不会被推出屏幕。
  const filler = document.createElement('div');
  filler.id = 'verify-filler';
  filler.style.height = '2000px';
  scroller.insertBefore(filler, scroller.firstChild);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const scrollable = scroller.scrollHeight > scroller.clientHeight + 10;

  // 停在最上方：此时当前播放行被那 2000px 留白推到视野之外
  scroller.scrollTop = 0;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const before = scroller.scrollTop;
  const rowBeforeRect = document.querySelector('.track[aria-current="true"]')?.getBoundingClientRect();
  const scrRect0 = scroller.getBoundingClientRect();
  out.rowHiddenBefore = Boolean(rowBeforeRect && rowBeforeRect.top > scrRect0.bottom);

  document.querySelector('#content-tools [data-tool="locate"]').click();
  await new Promise((r) => setTimeout(r, 1200));

  const row = document.querySelector('.track[aria-current="true"]');
  const rowRect = row ? row.getBoundingClientRect() : null;
  const scrRect = scroller.getBoundingClientRect();
  out.scrollBefore = before;
  out.scrollAfter = scroller.scrollTop;
  out.scrollable = scrollable;
  out.currentId = state.currentId;
  out.rowVisible = Boolean(rowRect && rowRect.top >= scrRect.top - 4 && rowRect.bottom <= scrRect.bottom + 4);
  out.located = Boolean(row && row.classList.contains('is-located'));
  filler.remove();
  return out;
})()`);
check("3a 曲库工具条有「定位到当前播放」按钮", locate?.libraryBtn === true);
check("3b 播放列表面板有「定位到当前播放」按钮", locate?.queuePanelBtn === true);
check("3c 定位前当前播放行确实在视野之外", locate?.rowHiddenBefore === true, JSON.stringify(locate));
check(
  "3d 点定位后把当前行滚回视野",
  locate?.rowVisible === true && locate?.scrollAfter !== locate?.scrollBefore,
  `scrollTop ${locate?.scrollBefore} → ${locate?.scrollAfter}`
);
check("3e 定位行有落点提示（is-located）", locate?.located === true);

/* -------------------------------------------------------------------------
   4. 设置：主题 / 播放器样式选中后要立刻反映在设置层里
   ------------------------------------------------------------------------- */
const settingsSync = await evaluate(`(async () => {
  const { state } = window.__app;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.getElementById('btn-settings').click();
  await sleep(400);

  const cardFor = (id) => document.querySelector('.themecard__pick[data-id="' + id + '"]');
  const targetTheme = state.config.theme === 'light-minimal' ? 'dark-minimal' : 'light-minimal';
  cardFor(targetTheme).click();
  await sleep(600);
  const themeCard = cardFor(targetTheme);
  const themeResult = {
    target: targetTheme,
    ariaPressed: themeCard?.getAttribute('aria-pressed'),
    cardActive: themeCard?.closest('.themecard')?.dataset.active,
    domTheme: document.documentElement.dataset.theme,
  };

  const skinBtn = document.querySelector('.skincard__pick[data-id]');
  const skinId = skinBtn?.dataset.id;
  skinBtn?.click();
  await sleep(600);
  const skinAfter = document.querySelector('.skincard__pick[data-id="' + skinId + '"]');
  const skinResult = {
    target: skinId,
    ariaPressed: skinAfter?.getAttribute('aria-pressed'),
    cardActive: skinAfter?.closest('.skincard')?.dataset.active,
    configMode: state.config.playerViewMode,
  };
  document.querySelector('.settings-layer__close')?.click();
  return { themeResult, skinResult };
})()`);
check(
  "4a 点主题卡片后选中态立即同步",
  settingsSync?.themeResult?.ariaPressed === "true" && settingsSync?.themeResult?.cardActive === "true",
  JSON.stringify(settingsSync?.themeResult)
);
check(
  "4b 点播放器样式后选中态立即同步",
  settingsSync?.skinResult?.ariaPressed === "true" && settingsSync?.skinResult?.cardActive === "true",
  JSON.stringify(settingsSync?.skinResult)
);

/* -------------------------------------------------------------------------
   5. 落点提示的清理 + 没有回归性异常
   ------------------------------------------------------------------------- */
const cleanup = await evaluate(`(async () => {
  await new Promise((r) => setTimeout(r, 1200));
  return {
    locatedRows: document.querySelectorAll('.track.is-located').length,
    bodyReady: document.body.dataset.ready === 'true',
  };
})()`);
check("5a 落点提示会自动消失", cleanup?.locatedRows === 0, `剩余 ${cleanup?.locatedRows}`);
check("5b 页面正常完成启动", cleanup?.bodyReady === true);
check("5c 没有未捕获异常", exceptions.length === 0, exceptions.slice(0, 3).join(" | "));

ws.close();
child.kill();
// 等进程真的退出：应用在退出路径上会自己刷一遍配置，抢在它前面还原会被覆盖
for (let i = 0; i < 40; i += 1) {
  await sleep(250);
  if (child.exitCode !== null || child.signalCode !== null) break;
}
restoreConfig();

const failed = results.filter((r) => !r.ok);
console.log(`\n================ 结果：${results.length - failed.length}/${results.length} 通过 ================`);
if (failed.length) {
  for (const f of failed) console.log(`  FAIL  ${f.name}  ${f.detail || ""}`);
}
writeFileSync(path.join(workDir, "result.json"), JSON.stringify({ results, exceptions }, null, 2), "utf8");
process.exit(failed.length ? 1 : 0);
