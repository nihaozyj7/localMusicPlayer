/* ==========================================================================
   verify-settings-autonext.mjs — 2026-10 那批设置改动 + 自动下一首的真机验收
   --------------------------------------------------------------------------
   背景：
     · 「显示歌词」从设置页搬进底栏「选项」面板；
     · 设置页里桌面歌词 / 桌面背景歌词的四个入口（两个开关、重置位置、
       启动时自动启用）全部移除，只留选项面板那组三选一；
     · 响度均衡卡片头改成与其它卡片同一套结构（card__icon + card__titles）；
     · 四款内置样式（简约 / 二次元手绘 / 魔法阵 / 星阵咏唱）移除并备份到桌面，
       老配置里指向它们的样式 id 必须自动归一化成内置样式；
     · **播完不自动下一首**（用户报 100% 复现、进度条卡在末尾）已修复 ——
       成因与修法见 audio.js#backendPlaying 与 services_player.go#Tick 的注释。

   做法：把真实数据目录复制到临时目录（**不动用户数据**）后启动 bin/lmplayer.exe，
   用 CDP 驱动真实界面（点按钮 / 读 DOM），最后真的把一首歌拖到结尾看它会不会切。

   用法：
     node tools/verify-settings-autonext.mjs            # 默认 bin/lmplayer.exe
     node tools/verify-settings-autonext.mjs --exe <path>
   ========================================================================== */

import { spawn } from "node:child_process";
import path from "node:path";
import { mkdtempSync, mkdirSync, copyFileSync, existsSync, openSync, closeSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXE = path.join(ROOT, "bin", "lmplayer.exe");
const PORT = Number(process.env.MP_PORT || 9421);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const REAL = path.join(process.env.APPDATA, "LocalMusicPlayer");
const WORK = mkdtempSync(path.join(tmpdir(), "accept-"));
const DATA = path.join(WORK, "data");
mkdirSync(DATA, { recursive: true });
for (const f of ["config.json", "metadata-cache.json", "loudness-cache.json"]) {
  const src = path.join(REAL, f);
  if (existsSync(src)) copyFileSync(src, path.join(DATA, f));
}
// 「老配置里的已移除样式 id 要被归一化」这条检查必须**自己造前提**：
// 真实配置里的 playerViewMode 会随着用户切换样式而变化（现在已经是合法的内置
// id 了），直接拷过来就等于"没有被测对象"。这里显式改回已移除的 anime。
const cfgPath = path.join(DATA, "config.json");
if (existsSync(cfgPath)) {
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  cfg.playerViewMode = "anime";
  writeFileSync(cfgPath, JSON.stringify(cfg));
}
// 造两个第三方插件包，用来验证契约 v3 的**配色声明**链路（需求的核心）：
//   accept-chrome —— 声明 colors.bg/fg → 宿主应把 --chrome-* 写到 <html> 上；
//   accept-plain  —— 不声明 colors   → 设置页应出现警告图标，且不写 --chrome-*。
// 两个包都放在数据目录里，走的就是「第三方样式」的那条加载路径。
const packDir = path.join(DATA, "player-skins");
const writePack = (id, manifest, js) => {
  const dir = path.join(packDir, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "skin.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(path.join(dir, "skin.js"), js);
  writeFileSync(path.join(dir, "skin.css"), `.demo{min-height:100%;box-sizing:border-box;padding:24px}\n.demo__t{font-size:24px}\n`);
};
writePack(
  "accept-chrome",
  {
    id: "accept-chrome",
    name: "验收配色包",
    version: "1.0.0",
    apiVersion: "3.0",
    entry: "skin.js",
    styles: ["skin.css"],
    order: 300,
    colors: { bg: "#0b0f1a", fg: "#eaf2ff", accent: "#7aa2ff" },
  },
  `export default {\n  mount(ctx) {\n    ctx.root.innerHTML = '<div class="demo"><div class="demo__t">accept-chrome</div></div>';\n  },\n};\n`
);
writePack(
  "accept-plain",
  {
    id: "accept-plain",
    name: "验收无配色包",
    version: "1.0.0",
    apiVersion: "3.0",
    entry: "skin.js",
    styles: ["skin.css"],
    order: 301,
  },
  `export default {\n  mount(ctx) {\n    ctx.root.innerHTML = '<div class="demo"><div class="demo__t">accept-plain</div></div>';\n  },\n};\n`
);
console.log("数据目录:", DATA);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

const logFd = openSync(path.join(WORK, "app.log"), "w");
const child = spawn(EXE, [], {
  env: {
    ...process.env,
    LMPLAYER_DATA_DIR: DATA,
    LMPLAYER_DEBUG_PORT: String(PORT),
    WEBVIEW2_USER_DATA_FOLDER: path.join(WORK, "wv2"),
  },
  stdio: ["ignore", logFd, logFd],
});
closeSync(logFd);

let target = null;
for (let i = 0; i < 80 && !target; i += 1) {
  await sleep(400);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((x) => x.type === "page" && x.webSocketDebuggerUrl);
  } catch {
    /* wait */
  }
}
if (!target) {
  console.error("无法接入 WebView2");
  child.kill();
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener("open", res, { once: true });
  ws.addEventListener("error", rej, { once: true });
});
let id = 0;
const pending = new Map();
const logs = [];
ws.addEventListener("message", (ev) => {
  let m;
  try {
    m = JSON.parse(ev.data);
  } catch {
    return;
  }
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === "Runtime.consoleAPICalled") {
    logs.push((m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" "));
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
  const res = r?.result;
  if (res?.exceptionDetails) {
    return { __error: res.exceptionDetails.exception?.description || res.exceptionDetails.text };
  }
  return res?.result?.value;
};

try {
  await evalJs("new Promise(r => setTimeout(r, 3000))");
  // 等前端把调试出口挂上（window.__app 在 main() 末尾才赋值）
  for (let i = 0; i < 40; i += 1) {
    const ok = await evalJs("Boolean(window.__app && window.__app.state)");
    if (ok === true) break;
    await sleep(500);
  }
  await evalJs(`
    (async () => {
      window.__ended = 0;
      let rt = null;
      try { rt = await import('/wails/runtime.js'); } catch {}
      if (!rt) { try { rt = await import('/bindings/github.com/wailsapp/wails/v3/internal/eventcreate.js'); } catch {} }
      if (rt && rt.Events && rt.Events.On) rt.Events.On('player:ended', () => { window.__ended += 1; });
      return true;
    })()
  `);

  /* ---- 4. 样式：老配置里的 anime 应当被归一化 ---- */
  // preloadSkins() 是启动时异步跑的，归一化在它完成之后才落到配置上 —— 这里轮询等它。
  let view = null;
  for (let i = 0; i < 30; i += 1) {
    const raw = await evalJs("String(window.__app.state.config.playerViewMode || '')");
    view = typeof raw === "string" ? raw : "";
    if (view === "classic") break;
    await sleep(400);
  }
  check("老配置的样式 id（anime）被归一化为内置样式", view === "classic", `playerViewMode=${JSON.stringify(view)}`);
  const skinIds = await evalJs(`
    (() => {
      const box = document.getElementById("playerview-mode");
      return box ? [...box.querySelectorAll("[data-pv-skin]")].map((b) => b.dataset.pvSkin) : null;
    })()
  `);
  check(
    "详情页样式按钮组：含内置两款，且不含已移除的四款",
    Array.isArray(skinIds) &&
      ["classic", "immersive"].every((id) => skinIds.includes(id)) &&
      ["minimal", "anime", "magia", "arcanum"].every((id) => !skinIds.includes(id)),
    JSON.stringify(skinIds)
  );

  /* ---- 1. 播放选项面板：显示歌词 ---- */
  await evalJs("(() => { const b = document.getElementById('btn-options'); if (b) b.click(); return true; })()");
  await sleep(600);
  const opt = await evalJs(`
    (() => {
      const panel = document.getElementById("options-panel");
      const sw = document.getElementById("opt-show-lyrics");
      const items = panel ? [...panel.querySelectorAll("[data-opt]")].map((x) => x.dataset.opt) : null;
      return {
        open: panel ? !panel.hidden : false,
        hasSwitch: Boolean(sw),
        checked: sw ? sw.getAttribute("aria-checked") : null,
        items,
        lyricsOn: document.getElementById("playerview")?.dataset.lyrics,
      };
    })()
  `);
  check("播放选项面板里有「显示歌词」开关", opt?.hasSwitch === true && opt?.open === true, JSON.stringify(opt?.items));
  const toggled = await evalJs(`
    (() => {
      document.getElementById("opt-show-lyrics").click();
      return { cfg: window.__app.state.config.showLyrics, attr: document.getElementById("playerview")?.dataset.lyrics };
    })()
  `);
  await sleep(300);
  const after = await evalJs(
    "({ cfg: window.__app.state.config.showLyrics, attr: document.getElementById('playerview')?.dataset.lyrics, checked: document.getElementById('opt-show-lyrics')?.getAttribute('aria-checked') })"
  );
  check(
    "点开关立刻生效（配置 + 详情页 data-lyrics + 开关选中态）",
    toggled?.cfg === false && after?.cfg === false && after?.attr === "off" && after?.checked === "false",
    JSON.stringify({ clicked: toggled, after })
  );
  // 还原
  await evalJs("(() => { document.getElementById('opt-show-lyrics').click(); return true; })()");
  await evalJs("(() => { const b = document.getElementById('options-close'); if (b) b.click(); return true; })()");

  /* ---- 2 & 3. 设置界面 ---- */
  await evalJs("(() => { document.getElementById('btn-settings').click(); return true; })()");
  await sleep(900);
  const settings = await evalJs(`
    (() => {
      const lyrics = document.getElementById("sec-lyrics");
      const loud = document.getElementById("sec-loudness");
      const player = document.getElementById("sec-player");
      const loudHead = loud ? loud.querySelector(".card__head") : null;
      const skinCards = player ? [...player.querySelectorAll(".skincard")].map((c) => c.querySelector(".skincard__id")?.textContent) : null;
      return {
        settingsOpen: document.getElementById("settings-layer")?.dataset.state,
        lyricsToggles: lyrics ? [...lyrics.querySelectorAll("[data-toggle]")].map((x) => x.dataset.toggle) : null,
        lyricsActions: lyrics ? [...lyrics.querySelectorAll("[data-act]")].map((x) => x.dataset.act) : null,
        loudIcon: Boolean(loudHead?.querySelector(".card__icon svg")),
        loudTitleInTitles: loudHead?.querySelector(".card__titles .card__title")?.textContent?.trim(),
        loudH2: Boolean(loudHead?.querySelector("h2.card__title")),
        loudIconInTitle: Boolean(loudHead?.querySelector(".card__title svg")),
        skinCards,
        // 契约 v3 的配色体检：每张卡应有「底色 / 前景」两个色块；
        // 内置两款都声明了 colors.theme → 不该出现警告图标（缺失才警告）
        skinChips: player
          ? [...player.querySelectorAll(".skincard")].map((c) => c.querySelectorAll(".skincard__swatch").length)
          : null,
        skinWarn: player ? player.querySelectorAll(".skincard__warn").length : null,
      };
    })()
  `);
  console.log("设置快照:", JSON.stringify(settings));
  check(
    "设置-歌词卡片里没有「显示歌词」开关",
    Array.isArray(settings?.lyricsToggles) && !settings.lyricsToggles.includes("showLyrics"),
    JSON.stringify(settings?.lyricsToggles)
  );
  check(
    "设置里没有桌面歌词 / 桌面背景歌词入口（含重置位置）",
    Array.isArray(settings?.lyricsToggles) &&
      !settings.lyricsToggles.some((k) => /Desktop/.test(k)) &&
      Array.isArray(settings?.lyricsActions) &&
      !settings.lyricsActions.includes("reset-desktop-lyrics-pos"),
    JSON.stringify({ toggles: settings?.lyricsToggles, actions: settings?.lyricsActions })
  );
  check(
    "响度均衡卡片头与其它卡片同构（card__icon + card__titles，无 h2/内联图标）",
    settings?.loudIcon === true &&
      settings?.loudTitleInTitles === "响度均衡" &&
      settings?.loudH2 === false &&
      settings?.loudIconInTitle === false,
    JSON.stringify({ icon: settings?.loudIcon, title: settings?.loudTitleInTitles, h2: settings?.loudH2 })
  );
  check(
    "设置-播放界面样式卡片 = 内置两款 + 脚本造的两个第三方包",
    JSON.stringify(settings?.skinCards) ===
      '["classic","immersive","accept-chrome","accept-plain"]',
    JSON.stringify(settings?.skinCards)
  );
  check(
    "样式卡片有配色体检色块；未声明 colors 的包出现警告图标（只警告它）",
    Array.isArray(settings?.skinChips) &&
      settings.skinChips.length === 4 &&
      settings.skinChips.every((n) => n === 2) &&
      settings?.skinWarn === 1,
    JSON.stringify({ chips: settings?.skinChips, warn: settings?.skinWarn })
  );
  await evalJs("(() => { const b = document.querySelector('#settings-layer [data-act=\\'close-settings\\']') || document.getElementById('settings-close'); if (b) b.click(); return true; })()");
  await sleep(400);

  /* ---- 4a. 配色声明 → 宿主壳配色（需求核心的端到端） ----
     选中脚本造的 accept-chrome（清单里声明了 colors.bg/fg）：宿主应当把派生出来的
     --chrome-* 写到 <html> 上，并让宿主壳的令牌（--text-1 等）跟随它 —— 这样插件
     画面与标题栏/底栏/浮层才是一套配色，而且对比度由宿主兜底（见 player-skins/colors.js）。 */
  await evalJs(`(() => { window.__app.setPlayerViewMode("accept-chrome"); window.__app.openPlayer(); return true; })()`);
  await sleep(1400);
  const chromeOn = await evalJs(`
    (() => {
      const root = document.documentElement;
      const cs = getComputedStyle(root);
      const fg = cs.getPropertyValue("--chrome-fg").trim();
      const title = document.querySelector(".titlebar");
      return {
        mounted: document.getElementById("playerview")?.dataset.skin || "",
        attr: root.dataset.chrome || "",
        bg: cs.getPropertyValue("--chrome-bg").trim(),
        fg,
        text1: cs.getPropertyValue("--text-1").trim(),
        titleColor: title ? getComputedStyle(title).color : "",
      };
    })()
  `);
  console.log("配色快照(开):", JSON.stringify(chromeOn));
  check(
    "声明 colors 的插件 → <html> 写上 --chrome-*，宿主壳令牌跟随它",
    chromeOn?.mounted === "accept-chrome" &&
      chromeOn?.attr === "on" &&
      chromeOn?.bg !== "" &&
      chromeOn?.fg !== "" &&
      chromeOn?.text1 === chromeOn?.fg,
    JSON.stringify(chromeOn)
  );
  await evalJs("(() => { window.__app.state.playerOpen = false; window.__app.commit(); return true; })()");
  await sleep(700);
  const chromeOff = await evalJs(`(() => ({ attr: document.documentElement.dataset.chrome || "" }))()`);
  console.log("配色快照(关):", JSON.stringify(chromeOff));
  check(
    "关掉详情页后 --chrome-* 被清掉（宿主壳回到主题配色）",
    chromeOff?.attr === "",
    JSON.stringify(chromeOff)
  );

  /* ---- 4b. 真机渲染：@scope 包裹后的插件 CSS 是否真的生效（契约 v3 最高风险项） ----
     前面那些检查读的都是"元数据"；这一条真的把详情页打开，看插件 CSS 有没有匹配上。
     宿主把插件 CSS 包成 `@layer skin { @scope (.playerview[data-skin=…], …) { … } }`，
     一旦作用域写法不被内核接受、或作用域根匹配不到，舞台会是"裸"的 —— 网格布局消失、
     唱片高度为 0（无样式的 div 高度就是 0）。只有真机算一遍样式才验得出来。 */
  await evalJs(`(() => { window.__app.setPlayerViewMode("classic"); window.__app.openPlayer(); return true; })()`);
  await sleep(1400);
  const render = await evalJs(`
    (() => {
      const stage = document.querySelector(".playerview__stage");
      const disc = document.querySelector(".disc");
      const view = document.getElementById("playerview");
      const styleEl = document.querySelector('style[data-skin="classic"]');
      let scopeRule = false;
      let ruleCount = 0;
      let topText = "";
      try {
        const rules = styleEl && styleEl.sheet ? [...styleEl.sheet.cssRules] : [];
        ruleCount = rules.length;
        // 顶层是 @layer skin { … }（CSSLayerBlockRule），@scope 是**它里面**的子规则 ——
        // 只看顶层会漏（第一版检测就是这么误报成 false 的）。
        const top = rules[0];
        topText = String(top?.cssText || "").slice(0, 120);
        const nested = top && typeof top.cssRules !== "undefined" ? [...top.cssRules] : rules;
        scopeRule =
          topText.startsWith("@layer") &&
          topText.includes("@scope") &&
          nested.some(
            (r) =>
              (r.constructor && r.constructor.name === "CSSScopeRule") ||
              String(r.cssText || "").startsWith("@scope")
          );
      } catch (err) {
        scopeRule = false;
      }
      const box = (el) => (el ? { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null);
      return {
        mounted: view?.dataset.skin || "",
        chromeOn: document.documentElement.dataset.chrome || "",
        stageDisplay: stage ? getComputedStyle(stage).display : null,
        disc: box(disc),
        styleInjected: Boolean(styleEl),
        ruleCount,
        topText,
        scopeRule,
      };
    })()
  `);
  console.log("渲染快照:", JSON.stringify(render));
  check(
    "打开详情页后插件真的渲染（@scope 包裹的 CSS 生效：舞台网格 + 唱片有高度）",
    render?.mounted === "classic" &&
      render?.styleInjected === true &&
      render?.scopeRule === true &&
      render?.stageDisplay === "grid" &&
      (render?.disc?.h ?? 0) > 100,
    JSON.stringify(render)
  );
  check(
    "内置样式声明 colors.theme → 宿主壳不写 --chrome-*（回落主题配色）",
    render?.chromeOn === "",
    JSON.stringify({ chrome: render?.chromeOn })
  );
  await evalJs("(() => { window.__app.state.playerOpen = false; window.__app.commit(); return true; })()");
  await sleep(700);

  /* ---- 5. 播完自动下一首 ---- */
  let songs = [];
  for (let i = 0; i < 60; i += 1) {
    await sleep(1000);
    songs = await evalJs("window.__app.state.songs.map(s => ({id: s.id, title: s.title, d: s.duration}))");
    if (Array.isArray(songs) && songs.length >= 3) break;
  }
  if (!Array.isArray(songs) || songs.length < 3) throw new Error("曲库没扫出来");
  console.log("曲库首曲:", JSON.stringify(songs[0]));

  const started = await evalJs(`
    (() => {
      const ids = window.__app.state.songs.map(s => s.id);
      const st = window.__app.state;
      st.queue = ids.slice();
      st.currentId = ids[0];
      st.playing = true;
      window.__app.commit();
      return { current: st.currentId };
    })()
  `);
  await sleep(2500);

  const dur = Number(songs[0].d) || 0;
  await evalJs(`
    (async () => {
      const mod = await import('/bindings/localmusicplayer/index.js');
      const st = window.__app.state;
      if (!st.playing) { st.playing = true; window.__app.commit(); }
      await mod.PlayerService.Seek(${Math.max(0, dur - 2500)});
      await mod.PlayerService.Play();
      return true;
    })()
  `);
  console.log("已拖到离结尾 2.5 秒，等待自动切歌…");

  let switched = false;
  let snap = null;
  for (let i = 0; i < 24; i += 1) {
    await sleep(500);
    snap = await evalJs(`
      (() => {
        const st = window.__app.state;
        return {
          id: st.currentId, playing: st.playing,
          pos: Math.round(st.position), dur: Math.round(st.duration),
          title: (document.getElementById('bar-title')||{}).textContent,
          ended: window.__ended || 0,
        };
      })()
    `);
    if (snap && snap.id !== started.current) {
      switched = true;
      break;
    }
  }
  console.log("播完时快照:", JSON.stringify(snap));
  check(
    "歌播完自动切到下一首（player:ended 到达 + currentId 前进）",
    switched && snap?.ended >= 1,
    JSON.stringify({ switched, ended: snap?.ended, id: snap?.id })
  );
  check("切歌后进度条不再是末尾的卡死值", switched && snap.pos < snap.dur, `${snap?.pos} / ${snap?.dur}`);

  /* ---- 5b. 拖到末尾再点播放（用户报的第二种复现方式） ---- */
  //
  // 刻意**全程走界面**：用底栏播放键暂停 → 拖到最右 → 再用底栏播放键起播。
  // （前两版脚本直接调 PlayerService.Pause/Play，绕开了前端 store，
  //   测的就不是用户真正走的那条路了。）
  // 同时把播放模式固定成顺序播放：随机模式下「下一首」是随机的，
  // 断言会变得不确定。
  const before = await evalJs(`
    (async () => {
      const mod = await import('/bindings/localmusicplayer/index.js');
      const st = window.__app.state;
      st.playMode = "sequence";
      window.__app.commit();
      // 先等这一首「稳定地在播」（至少播了 2 秒）再动手：切歌刚发生时
      // 后端的 playerLoad 还在飞，这时 Seek 会被随后的 engine.Load 覆盖掉 ——
      // 那是另一个（无关的）竞态，不该混进这条用例里。
      for (let i = 0; i < 40; i += 1) {
        const s = await mod.PlayerService.State();
        if (s && s.playing === true && Number(s.positionMs) > 2000) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      // 1) 用界面暂停（此刻前端与后端都认为在播 → 停了）
      if (st.playing) document.getElementById('btn-play').click();
      await new Promise((r) => setTimeout(r, 700));
      // 2) 拖到离结尾 400ms（用**后端**时长，它才是进度条真正的分母）
      const s0 = await mod.PlayerService.State();
      const live = Math.round(Number(s0 && s0.durationMs) || 0);
      await mod.PlayerService.Seek(Math.max(0, live - 400));
      await new Promise((r) => setTimeout(r, 900));
      const s1 = await mod.PlayerService.State();
      return {
        id: st.currentId, ended: window.__ended || 0, dur: live,
        playing: st.playing,
        bPosAfterSeek: s1 && s1.positionMs, bDur: s1 && s1.durationMs, bPlaying: s1 && s1.playing,
      };
    })()
  `);
  console.log("5b 起手:", JSON.stringify(before));
  // 3) 点底栏播放键
  await evalJs("(() => { document.getElementById('btn-play').click(); return true; })()");
  let switched2 = false;
  let snap2 = null;
  for (let i = 0; i < 30; i += 1) {
    await sleep(500);
    snap2 = await evalJs(`
      (async () => {
        const mod = await import('/bindings/localmusicplayer/index.js');
        const st = window.__app.state;
        const b = await mod.PlayerService.State();
        return {
          id: st.currentId, playing: st.playing,
          pos: Math.round(st.position), dur: Math.round(st.duration),
          ended: window.__ended || 0,
          bSong: b && b.songId, bPos: b && b.positionMs, bPlaying: b && b.playing,
        };
      })()
    `);
    console.log(`   (5b) +${((i + 1) * 0.5).toFixed(1)}s`, JSON.stringify(snap2));
    if (snap2 && snap2.id !== before.id) {
      switched2 = true;
      break;
    }
  }
  console.log("末尾点播放后快照:", JSON.stringify(snap2));
  check(
    "拖到末尾再点播放也能自动接下一首（不再卡住）",
    switched2 && snap2?.ended >= before.ended + 1,
    JSON.stringify({ switched2, ended: snap2?.ended })
  );

  console.log("--- 控制台相关日志 ---");
  console.log(logs.filter((l) => /skins|样式|player|音频/.test(l)).slice(-15).join("\n"));
} catch (err) {
  console.log("异常:", String(err));
  check("验收脚本正常跑完", false, String(err));
} finally {
  try {
    ws.close();
  } catch {
    /* 忽略 */
  }
  try {
    child.kill();
  } catch {
    /* 忽略 */
  }
  await sleep(500);
}

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(failed.length ? `失败 ${failed.length} / ${results.length}` : `全部通过（${results.length} 项）`);
process.exit(failed.length ? 1 : 0);
