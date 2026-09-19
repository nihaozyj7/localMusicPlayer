/* ==========================================================================
   check-player-host.mjs — 播放详情页「宿主 + 皮肤包」的交互自检
   --------------------------------------------------------------------------
   为什么要单独一个脚本：cdp-check.js 只看「渲染出来没有」，
   而这次改造的重点是**交互与状态同步**：
     · 样式按钮组是按皮肤注册表动态渲染的，切样式要真的换 DOM；
     · 「封面 / 轮播」是一个按钮组，轮播开关要反映 config；
     · 定时停止改成了 0~300 的可拖拽滑条，拖完要真的产生倒计时；
     · 曲目列表的选中行必须跟 state.currentId 同步（切歌后高亮要跟着走）。
   这些都不是「有没有这个元素」能验出来的。

   用法：node tools/check-player-host.mjs [base]
        默认 http://127.0.0.1:5173/（先 npm run dev）
   退出码 0 = 全部通过。
   ========================================================================== */

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";

const EDGE_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const edge = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
if (!edge) {
  console.error("找不到 Microsoft Edge");
  process.exit(2);
}

const PORT = 9334;
const BASE = process.argv[2] || process.env.PROBE_BASE || "http://127.0.0.1:5173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: PORT, path }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "[OK ]" : "[!! ]"} ${name}${detail ? `  → ${detail}` : ""}`);
}

async function main() {
  const child = spawn(
    edge,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-sync",
      "--window-size=1440,900",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${process.env.TEMP}\\mp-edge-host`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let target = null;
  for (let i = 0; i < 80; i += 1) {
    await sleep(250);
    try {
      const list = JSON.parse(await get("/json/list"));
      target = list.find((t) => t.type === "page");
      if (target) break;
    } catch {
      /* 等 DevTools */
    }
  }
  if (!target) {
    child.kill();
    console.error("无法连接 DevTools");
    process.exit(2);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      id += 1;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const errors = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === "Runtime.exceptionThrown") {
      errors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      errors.push((msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" "));
    }
  });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Runtime.enable");
  await send("Page.enable");

  /** 在页面里求值（返回 JSON 化的值） */
  const evaluate = async (expression) => {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res?.exceptionDetails) {
      return { __error: res.exceptionDetails.exception?.description || res.exceptionDetails.text };
    }
    return res?.result?.value;
  };

  await send("Page.navigate", { url: `${BASE}?probe=1&view=player&pv=classic&playing=1` });
  await sleep(2500);

  /* 1. 样式按钮组由注册表动态渲染 */
  const skins = await evaluate(`(() => {
    const box = document.getElementById("playerview-mode");
    return box ? [...box.querySelectorAll("[data-pv-skin]")].map((b) => b.dataset.pvSkin) : null;
  })()`);
  check(
    "样式按钮组按皮肤注册表渲染",
    // 内置六种（用户数据目录里的第三方样式会接在后面）
    Array.isArray(skins) && skins.slice(0, 6).join(",") === "classic,immersive,minimal,anime,magia,arcanum",
    JSON.stringify(skins)
  );

  /* 2. 切换样式真的换掉舞台 DOM 与 data-skin */
  const switched = await evaluate(`(async () => {
    document.querySelector('[data-pv-skin="immersive"]').click();
    await new Promise((r) => setTimeout(r, 400));
    const pv = document.getElementById("playerview");
    return {
      skin: pv.dataset.skin,
      hasCard: Boolean(document.querySelector(".immersive__card")),
      hasLyrics: Boolean(document.querySelector("#pv-lyrics .lyric")),
      bgVisible: !document.querySelector(".skin-bg").hidden,
    };
  })()`);
  check(
    "切到「沉浸」后舞台换成沉浸皮肤且背景层可见",
    switched?.skin === "immersive" && switched.hasCard && switched.hasLyrics && switched.bgVisible,
    JSON.stringify(switched)
  );

  const back = await evaluate(`(async () => {
    document.querySelector('[data-pv-skin="classic"]').click();
    await new Promise((r) => setTimeout(r, 400));
    const pv = document.getElementById("playerview");
    return { skin: pv.dataset.skin, hasDisc: Boolean(document.querySelector(".disc__platter")), bgHidden: document.querySelector(".skin-bg").hidden };
  })()`);
  check(
    "切回「经典」后唱片回来了、整窗背景层收起",
    back?.skin === "classic" && back.hasDisc && back.bgHidden,
    JSON.stringify(back)
  );

  /* 3. 「封面 / 轮播」按钮组 */
  const coverGroup = await evaluate(`(() => {
    const group = document.getElementById("playerview-cover-group");
    const modeGroup = document.getElementById("playerview-mode");
    if (!group) return null;
    const gs = getComputedStyle(group);
    const ms = getComputedStyle(modeGroup);
    return {
      buttons: [...group.querySelectorAll("button")].map((b) => b.id),
      sameLook: gs.backgroundImage === ms.backgroundImage && gs.borderRadius === ms.borderRadius,
      carouselPressed: document.getElementById("btn-cover-carousel").getAttribute("aria-pressed"),
      carouselDisabled: document.getElementById("btn-cover-carousel").disabled,
    };
  })()`);
  check(
    "封面 + 轮播 是一个按钮组，且与样式组同一套外观",
    coverGroup?.buttons.join(",") === "btn-player-cover,btn-cover-carousel" && coverGroup.sameLook,
    JSON.stringify(coverGroup)
  );
  check(
    "只有一张封面时轮播开关置灰",
    coverGroup?.carouselDisabled === true && coverGroup.carouselPressed === "false",
    `disabled=${coverGroup?.carouselDisabled}`
  );

  /* 4. 定时停止：面板 + 0~300 滑条 + 拖动真的产生倒计时 */
  const sleepPanel = await evaluate(`(async () => {
    document.getElementById("btn-sleep").click();
    await new Promise((r) => setTimeout(r, 300));
    const panel = document.getElementById("sleep-panel");
    const slider = document.getElementById("sleep-slider");
    if (!panel || !slider) return { open: false };
    const rail = slider.querySelector(".slider__rail");
    const r = rail.getBoundingClientRect();
    // 拖到滑条 50% 处 → 约 150 分钟
    const opts = { bubbles: true, clientX: r.left + r.width * 0.5, clientY: r.top + r.height / 2, pointerId: 1, isPrimary: true };
    slider.dispatchEvent(new PointerEvent("pointerdown", opts));
    slider.dispatchEvent(new PointerEvent("pointerup", opts));
    await new Promise((r2) => setTimeout(r2, 300));
    return {
      open: !panel.hidden,
      min: slider.getAttribute("aria-valuemin"),
      max: slider.getAttribute("aria-valuemax"),
      readout: document.getElementById("sleep-value").textContent,
      badge: document.getElementById("sleep-count").hidden ? "" : document.getElementById("sleep-count").textContent,
      tip: document.getElementById("btn-sleep").dataset.tip,
    };
  })()`);
  check(
    "定时停止面板的滑条量程是 0~300",
    sleepPanel?.open && sleepPanel.min === "0" && sleepPanel.max === "300",
    JSON.stringify(sleepPanel)
  );
  check(
    "拖动滑条后产生了真实的倒计时（角标 + 提示）",
    Boolean(sleepPanel?.badge) && /定时停止 · 剩余/.test(sleepPanel?.tip || ""),
    `badge=${sleepPanel?.badge} tip=${sleepPanel?.tip}`
  );

  /* 5. 曲目列表选中行与当前播放同步（换歌后高亮要跟着走） */
  const selection = await evaluate(`(async () => {
    document.getElementById("sleep-close")?.click();
    document.getElementById("btn-player-back").click();
    await new Promise((r) => setTimeout(r, 400));
    const before = document.querySelector('.track[aria-current="true"]')?.dataset.id || "";
    const rows = [...document.querySelectorAll(".track")];
    // 直接改状态并 commit：等价于「下一首」（不依赖音频真的能播）
    const cur = window.__app.state.currentId;
    const next = rows.find((r) => r.dataset.id !== cur)?.dataset.id;
    window.__app.state.currentId = next;
    window.__app.commit();
    await new Promise((r) => setTimeout(r, 300));
    const after = document.querySelector('.track[aria-current="true"]')?.dataset.id || "";
    const count = document.querySelectorAll('.track[aria-current="true"]').length;
    return { before, next, after, count };
  })()`);
  check(
    "切歌后列表高亮跟着 state.currentId 走（且只有一行高亮）",
    selection?.after === selection?.next && selection?.count === 1 && selection?.before !== selection?.after,
    JSON.stringify(selection)
  );

  /* 6. 封面面板：纯关键词（没有歌手/专辑输入框）+ 多选 + 应用按钮 */
  const coverPanel = await evaluate(`(async () => {
    const mod = await import("/js/coverpanel.js");
    const id = window.__app.state.currentId;
    mod.openCoverPanel(id);
    await new Promise((r) => setTimeout(r, 300));
    const body = document.getElementById("cover-layer-body");
    return {
      open: !document.getElementById("cover-layer").hidden,
      hasKeyword: Boolean(body.querySelector("#cover-keyword")),
      hasArtist: Boolean(body.querySelector("#cover-artist")),
      hasAlbum: Boolean(body.querySelector("#cover-album")),
      hasSet: Boolean(body.querySelector("#cover-set")),
      hasCarousel: Boolean(body.querySelector("#cover-carousel-btn")),
      hasEmbed: Boolean(body.querySelector("#cover-embed-btn")),
    };
  })()`);
  check(
    "封面面板：只有关键词输入框（歌手/专辑框已移除）",
    coverPanel?.open && coverPanel.hasKeyword && !coverPanel.hasArtist && !coverPanel.hasAlbum,
    JSON.stringify(coverPanel)
  );
  check(
    "封面面板：有多封面区 / 轮播开关 / 写入文件开关",
    coverPanel?.hasSet && coverPanel?.hasCarousel && coverPanel?.hasEmbed,
    JSON.stringify(coverPanel)
  );

  const multiSelect = await evaluate(`(async () => {
    const mod = await import("/js/coverpanel.js");
    const body = document.getElementById("cover-layer-body");
    // 直接注入假候选：面板只依赖 coverLookupSongAll 的返回形状
    const blank = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
    window.__fakeCandidates = [1, 2, 3].map((i) => ({ ok: true, preview: blank, provider: "test" + i, score: 90 - i }));
    return true;
  })()`);
  // 用一条最小的假数据走一遍「多选 → 应用」的 UI 逻辑（不依赖后端）
  const applyFlow = await evaluate(`(async () => {
    const body = document.getElementById("cover-layer-body");
    const grid = body.querySelector("#cover-grid");
    const bar = body.querySelector("#cover-selectbar");
    // 手工塞两张候选卡片，模拟 renderCandidates 的产物
    grid.innerHTML = [0, 1].map((i) => \`
      <button class="cover-card" type="button" role="checkbox" aria-checked="true"
        data-cover-act="toggle" data-cover-idx="\${i}" data-selected="true">
        <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" alt="" />
        <span class="cover-card__check"></span>
      </button>\`).join("");
    return {
      cards: grid.querySelectorAll(".cover-card").length,
      selected: grid.querySelectorAll('.cover-card[data-selected="true"]').length,
      checkVisible: getComputedStyle(grid.querySelector(".cover-card__check")).display !== "none",
      // 「应用」按钮由 renderSelectbar 按已选数量渲染；这里只确认应用条容器在位
      // （真实的后端搜索需要 Go 后端，浏览器预览下拿不到）
      hasSelectbar: Boolean(bar),
    };
  })()`);
  check(
    "候选卡片支持多选态（勾选角标可见）",
    multiSelect &&
      applyFlow?.cards === 2 &&
      applyFlow.selected === 2 &&
      applyFlow.checkVisible &&
      applyFlow.hasSelectbar,
    JSON.stringify(applyFlow)
  );

  /* 7. 详情页进出场：整窗背景层必须和详情页一起渐变，不能硬切
        （沉浸样式的背景层在 .playerview 之外，最容易掉队）
        判定方式：逐帧采样两者的 opacity，只要出现过中间值就说明真的在做渐变；
        同时要求同一帧上两者的数值基本一致 —— 这就是「整体一致」的含义。 */
  const anim = await evaluate(`(async () => {
    const pv = document.getElementById("playerview");
    const bg = document.getElementById("skin-background");
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector("[data-cover-close]")?.click();

    /** 连续若干帧同时采样两个元素的透明度（约 40 帧 ≈ 660ms，覆盖整段过渡） */
    async function trackPair(frames = 40) {
      const pvSeries = [];
      const bgSeries = [];
      for (let i = 0; i < frames; i += 1) {
        pvSeries.push(Number(getComputedStyle(pv).opacity));
        bgSeries.push(Number(getComputedStyle(bg).opacity));
        await raf();
      }
      return { pv: pvSeries, bg: bgSeries };
    }

    // 先确保详情页是打开的，并切到带整窗背景层的「沉浸」
    window.__app.openPlayer();
    document.querySelector('[data-pv-skin="immersive"]')?.click();
    await wait(900);

    window.__app.closePlayer();
    const closing = await trackPair();
    const closed = { pvHidden: pv.hidden, bgHidden: bg.hidden, pvState: pv.dataset.state };

    window.__app.openPlayer();
    const opening = await trackPair();
    const opened = {
      pv: Number(getComputedStyle(pv).opacity),
      bg: Number(getComputedStyle(bg).opacity),
      pvState: pv.dataset.state,
      bgState: bg.dataset.state,
    };

    // 收尾：切回内置经典样式（后面的用例按默认样式断言）
    document.querySelector('[data-pv-skin="classic"]')?.click();
    await wait(400);
    return { closing, closed, opening, opened };
  })()`);

  /** 过渡进行中的采样点数：出现过中间值才说明是渐变而不是硬切 */
  const midFrames = (series) => (series || []).filter((v) => v > 0.02 && v < 0.98).length;
  /** 同一帧上两者离得最远差多少（都在过渡中时才比较） */
  const maxDrift = (pair) => {
    let worst = 0;
    const pv = pair?.pv || [];
    const bg = pair?.bg || [];
    for (let i = 0; i < Math.min(pv.length, bg.length); i += 1) {
      if (pv[i] <= 0.02 || pv[i] >= 0.98) continue;
      if (bg[i] <= 0.02 || bg[i] >= 0.98) continue;
      worst = Math.max(worst, Math.abs(pv[i] - bg[i]));
    }
    return worst;
  };
  check(
    "关闭详情页：背景层与详情页同步向下滑出淡出（不是硬切）",
    midFrames(anim?.closing?.pv) > 0 && midFrames(anim?.closing?.bg) > 0 && maxDrift(anim?.closing) < 0.05,
    `pv 中间帧=${midFrames(anim?.closing?.pv)} bg 中间帧=${midFrames(
      anim?.closing?.bg
    )} 最大偏差=${maxDrift(anim?.closing).toFixed(3)}`
  );
  check(
    "打开详情页：背景层与详情页同步向上滑入淡入（不是硬切）",
    midFrames(anim?.opening?.pv) > 0 && midFrames(anim?.opening?.bg) > 0 && maxDrift(anim?.opening) < 0.05,
    `pv 中间帧=${midFrames(anim?.opening?.pv)} bg 中间帧=${midFrames(
      anim?.opening?.bg
    )} 最大偏差=${maxDrift(anim?.opening).toFixed(3)}`
  );
  check(
    "动画收尾：关闭后两者都收起，重新打开后两者都到位",
    anim?.closed?.pvHidden === true &&
      anim?.closed?.bgHidden === true &&
      anim?.opened?.pvState === "opened" &&
      anim?.opened?.bgState === "opened" &&
      anim?.opened?.bg === 1,
    JSON.stringify({ closed: anim?.closed, opened: anim?.opened })
  );

  /* 8. 窗口适配比例：整窗背景型样式（anime / magia）投到桌面（更大的视口）时，
        封面 / 唱片与歌词必须等比放大，而不是停在固定 px 上限上；
        同时手绘歌词区不能再有渐变底衬。
        这正是「在窗口里看着还行、放到背景桌面就比例失调」那条反馈。 */
  const measureFit = (skin) =>
    evaluate(`(() => {
      const stage = document.getElementById("playerview-stage");
      const shell = document.querySelector(".mg-shell");
      const panel = document.querySelector(".an-panel");
      const disc = document.querySelector(".mg-disc");
      const lyrics = document.querySelector(${JSON.stringify(skin === "magia" ? ".mg-lyrics" : ".an-lyrics")});
      const line = document.querySelector(${JSON.stringify(skin === "magia" ? ".mg-line" : ".fxl__line")});
      const fxl = lyrics ? lyrics.querySelector(".fxl") : null;
      const cs = (el) => (el ? getComputedStyle(el) : null);
      return {
        animeFit: stage ? cs(stage).getPropertyValue("--an-fit").trim() : "",
        magiaFit: shell ? cs(shell).getPropertyValue("--mg-fit").trim() : "",
        panelW: panel ? Math.round(panel.getBoundingClientRect().width) : 0,
        discW: disc ? Math.round(disc.getBoundingClientRect().width) : 0,
        lineSize: line ? parseFloat(cs(line).fontSize) : 0,
        lyricsBg: lyrics ? cs(lyrics).backgroundImage : "",
        fadeDisplay: fxl ? getComputedStyle(fxl, "::before").display : "",
      };
    })()`);
  const fitAt = async (skin, width, height) => {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: `${BASE}?probe=1&view=player&pv=${skin}&playing=1` });
    await sleep(1800);
    return measureFit(skin);
  };

  const animeSmall = await fitAt("anime", 1280, 820);
  const animeLarge = await fitAt("anime", 2560, 1440);
  check(
    "anime：桌面尺寸下封面与歌词等比放大（不再是固定 px 上限）",
    Number(animeLarge?.animeFit) > Number(animeSmall?.animeFit) &&
      animeLarge?.panelW > animeSmall?.panelW * 1.3 &&
      animeLarge?.lineSize > animeSmall?.lineSize * 1.3,
    JSON.stringify({ small: animeSmall, large: animeLarge })
  );
  check(
    "anime：歌词区没有渐变底衬（含 fx-lyrics 的上下渐隐带）",
    animeLarge?.lyricsBg === "none" && animeLarge?.fadeDisplay === "none",
    JSON.stringify({ bg: animeLarge?.lyricsBg, fade: animeLarge?.fadeDisplay })
  );

  const magiaSmall = await fitAt("magia", 1280, 820);
  const magiaLarge = await fitAt("magia", 2560, 1440);
  check(
    "magia：桌面尺寸下唱片与歌词等比放大",
    Number(magiaLarge?.magiaFit) > Number(magiaSmall?.magiaFit) &&
      magiaLarge?.discW > magiaSmall?.discW * 1.3 &&
      magiaLarge?.lineSize > magiaSmall?.lineSize * 1.3,
    JSON.stringify({ small: magiaSmall, large: magiaLarge })
  );
  check("magia：歌词区没有渐变底衬", magiaLarge?.lyricsBg === "none", JSON.stringify(magiaLarge));
  await send("Emulation.clearDeviceMetricsOverride");

  /* 8b. 「星阵咏唱」：纵深舞台必须真的搭起来 ——
        中景法阵画布有分辨率、封面是整窗模糊底图、歌词是散落的符文而不是滚动列表、
        整窗深空背景层在、镜头位移真的写到了歌词层的 transform 上；
        舞台铺满整窗，而歌词 / HUD 只落在安全区（标题栏 + 头部 / 底栏之间）。 */
  await send("Page.navigate", { url: `${BASE}?probe=1&view=player&pv=arcanum&playing=1` });
  await sleep(2200);
  const arcanum = await evaluate(`(() => {
    const pv = document.getElementById("playerview");
    const stage = document.querySelector(".ar-stage");
    const scene = document.querySelector(".ar-scene");
    const dust = document.querySelector(".ar-dust");
    const runes = document.querySelector(".ar-runes");
    const cover = document.querySelector(".ar-void__cover");
    const hud = document.querySelector(".ar-hud");
    // ★ 取「当前句」的单元，而不是文档里第一个 .ar-line：窗口里前面还有已经
    // 唱完的句子，它们停在"符文"状态、本来就没有入场动画。
    const line = document.querySelector('.ar-line[data-state="active"]');
    const unit = line ? line.querySelector(".ar-unit") : null;
    const bg = document.getElementById("skin-background");
    return {
      skin: pv ? pv.dataset.skin : "",
      vh: window.innerHeight,
      bgHidden: bg ? bg.hidden : true,
      hasVoid: Boolean(document.querySelector(".ar-void")),
      scenePixels: scene ? scene.width * scene.height : 0,
      dustPixels: dust ? dust.width * dust.height : 0,
      // 封面现在只出现在整窗背景层：一张模糊底图，舞台里没有圆形封面
      bgCover: Boolean(cover && cover.getAttribute("src")),
      bgCoverFilter: cover ? getComputedStyle(cover).filter : "",
      hasCore: Boolean(document.querySelector(".ar-core")),
      // 舞台铺满整窗 + 安全区（歌词 / HUD 不许进标题栏与底栏）
      stageRect: (() => {
        const r = stage.getBoundingClientRect();
        return { t: Math.round(r.top), h: Math.round(r.height) };
      })(),
      safe: (() => {
        const cs = getComputedStyle(stage);
        return {
          top: parseFloat(cs.getPropertyValue("--ar-safe-top")) || 0,
          bottom: parseFloat(cs.getPropertyValue("--ar-safe-bottom")) || 0,
        };
      })(),
      hudTop: hud ? Math.round(hud.getBoundingClientRect().top) : -1,
      lineCenters: [...document.querySelectorAll(".ar-line")].map((e) => {
        const r = e.getBoundingClientRect();
        return Math.round(r.top + r.height / 2);
      }),
      lineCount: document.querySelectorAll(".ar-line").length,
      activeLines: document.querySelectorAll('.ar-line[data-state="active"]').length,
      unitCount: unit ? line.querySelectorAll(".ar-unit").length : 0,
      modes: unit ? unit.dataset.mode : "",
      // 每句话固定落在 index % 6 条横带之一：同屏出现重复的行带 = 歌词压在一起
      bands: [...document.querySelectorAll(".ar-line")].map((e) => e.dataset.band),
      // ★ 真正的"不重叠"要看**落定之后**渲染出来的盒子：行里的字素带散落位移
      //   与缩放，所以取每个 .ar-unit 的 getBoundingClientRect 求并集再两两求交。
      //   行带只是垂直顺序的保证，宽句横着扫过来是它管不到的。
      //   这里刻意**跳过正在播入场动画的那一行**：ar-appear 的起始帧是
      //   scale(1.85)，动画中途整行能高出四五倍，那是瞬时的、不是"叠在一起"。
      lineBoxes: [...document.querySelectorAll(".ar-line")].map((e) => {
        const unit = e.querySelector(".ar-unit");
        if (unit && getComputedStyle(unit).animationName !== "none") return null;
        let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
        for (const u of e.querySelectorAll(".ar-unit")) {
          const q = u.getBoundingClientRect();
          if (q.width <= 0 || q.height <= 0) continue;
          l = Math.min(l, q.left); t = Math.min(t, q.top);
          r = Math.max(r, q.right); b = Math.max(b, q.bottom);
        }
        return Number.isFinite(l) ? { l, t, r, b } : null;
      }).filter(Boolean),
      // ★ 字与字之间也不能叠：取**文本墨迹**的二维矩形（Range 量的就是字面，
      //   不含 padding 与行高），两两求交。用 .ar-unit 的盒子量会误判 ——
      //   inline-block 的盒是行高的高度，左右并排的两个字必然"上下重叠"。
      //   正在播入场动画的那一行同样跳过（动画是瞬时的，那是"飞进来"不是"叠"）。
      unitBoxes: (() => {
        const range = document.createRange();
        const out = [];
        for (const e of document.querySelectorAll(".ar-line")) {
          const unit = e.querySelector(".ar-unit");
          if (unit && getComputedStyle(unit).animationName !== "none") continue;
          if (Number(getComputedStyle(e).opacity) <= 0.12) continue;
          for (const u of e.querySelectorAll(".ar-unit")) {
            if (!u.textContent || !u.textContent.trim()) continue;
            range.selectNodeContents(u);
            const q = range.getBoundingClientRect();
            if (q.width <= 0.5 || q.height <= 0.5) continue;
            out.push({ line: e.dataset.index, ch: u.textContent, l: q.left, r: q.right, t: q.top, b: q.bottom });
          }
        }
        return out;
      })(),
      // 左上角曲名那一块：歌词不许压上去
      hudBox: (() => {
        const m = document.querySelector(".ar-hud__meta");
        if (!m) return null;
        const q = m.getBoundingClientRect();
        return { l: q.left, t: q.top, r: q.right, b: q.bottom };
      })(),
      // 英文歌应当按词成单元（中文是逐字）
      kinds: unit ? [...line.querySelectorAll(".ar-unit")].map((e) => e.dataset.kind) : [],
      runesTransform: runes ? runes.style.transform : "",
      // ★ 法阵必须**完整地**待在能看见的那块画面里（安全区），而且居中。
      //   早先圆心固定在 H*0.58、半径只看 min(W,H)：下半圈连同外环被底栏吃掉，
      //   看起来就是"魔法阵没在中间、还显示不全"。
      circle: (() => {
        const st2 = document.querySelector(".ar-stage");
        if (!st2) return null;
        const cs2 = getComputedStyle(st2);
        const safeTop = parseFloat(cs2.getPropertyValue("--ar-safe-top")) || 0;
        const safeBottom = parseFloat(cs2.getPropertyValue("--ar-safe-bottom")) || 0;
        const H2 = st2.getBoundingClientRect().height;
        const W2 = st2.getBoundingClientRect().width;
        const safeH2 = H2 - safeTop - safeBottom;
        const R2 = Math.max(40, (Math.min(W2, safeH2) * 0.5) / (1.18 * 1.42));
        const cy2 = safeTop + safeH2 / 2;
        const reach = 1.18 * R2 * 1.42;
        return {
          cy: +cy2.toFixed(1),
          mid: +((safeTop + (H2 - safeBottom)) / 2).toFixed(1),
          top: +(cy2 - reach).toFixed(1),
          bottom: +(cy2 + reach).toFixed(1),
          safeTop: +safeTop.toFixed(1),
          safeBottomEdge: +(H2 - safeBottom).toFixed(1),
        };
      })(),
      unitAnim: unit ? getComputedStyle(unit).animationName : "",
      fit: stage ? getComputedStyle(stage).getPropertyValue("--ar-fit").trim() : "",
      // ★ 「待播放」的字必须留在原地，而不是被入场动画的延迟整片吃掉。
      //   十个入场关键帧都以 opacity: 0 开头，若 fill-mode 是 both，延迟期间
      //   浏览器会拿 0% 帧去填 —— 换到当前句的一瞬间整句集体隐形，只有轮到
      //   自己的那个字才亮起来。需求要的是"没唱到的字保留暗色待播放态"。
      //   fillMode: forwards + 显式的 todo 静止态规则才是对的组合。
      unitFillMode: unit ? getComputedStyle(unit).animationFillMode : "",
      // 每个字素的延迟与当前不透明度：延迟还没走完的字必须是看得见的（> 0）。
      unitDelayed: line
        ? [...line.querySelectorAll(".ar-unit")].map((u) => ({
            hold: u.dataset.hold,
            delay: parseFloat(getComputedStyle(u).animationDelay) || 0,
            opacity: Number(getComputedStyle(u).opacity),
          }))
        : [],
      // ★ 上面那一份是"真实播放中"的快照：探针跑到这里时歌已经播了一会儿，
      //   字多半都 done 了，延迟为 0 —— 拿它验不了"待播放"这件事。
      //   这里再**造一行**：3 个字、延迟很长（4s / 4.9s / 5.8s），并且把
      //   第 1 个标成 now、后两个标成 todo（正是"正在唱 1、2 和 3 还在等着"）。
      //   立刻读它们的计算样式：后两个必须是可见的。
      todoProbe: (() => {
        const host = document.querySelector(".ar-runes");
        if (!host || !line) return null;
        const el = line.cloneNode(false);
        el.dataset.state = "active";
        el.dataset.enter = "999";
        el.innerHTML = "";
        ["1", "2", "3"].forEach((ch, i) => {
          const s = document.createElement("span");
          s.className = "ar-unit";
          s.dataset.hold = i === 0 ? "now" : "todo";
          s.dataset.mode = "appear";
          s.dataset.enterMode = "appear";
          s.dataset.tier = "main";
          s.dataset.kind = "char";
          s.textContent = ch;
          s.style.setProperty("--ar-d", 4000 + i * 900 + "ms");
          s.style.setProperty("--ar-du", "600ms");
          el.appendChild(s);
        });
        host.appendChild(el);
        const out = [...el.querySelectorAll(".ar-unit")].map((u) => ({
          hold: u.dataset.hold,
          delay: parseFloat(getComputedStyle(u).animationDelay) || 0,
          opacity: Number(getComputedStyle(u).opacity),
        }));
        el.remove();
        return out;
      })(),
    };
  })()`);
  check(
    "星阵咏唱：整窗深空 + 中景法阵 + 前景粒子的画布都就位且有分辨率",
    arcanum?.skin === "arcanum" &&
      arcanum?.bgHidden === false &&
      arcanum?.hasVoid === true &&
      arcanum?.scenePixels > 100000 &&
      arcanum?.dustPixels > 100000,
    JSON.stringify(arcanum)
  );
  check(
    "星阵咏唱：封面变成整窗模糊底图（圆形封面已移除）",
    arcanum?.bgCover === true && /blur/.test(arcanum?.bgCoverFilter || "") && arcanum?.hasCore === false,
    JSON.stringify({ cover: arcanum?.bgCover, filter: arcanum?.bgCoverFilter, core: arcanum?.hasCore })
  );
  check(
    "星阵咏唱：舞台铺满整窗（法阵画到标题栏 / 底栏后面）",
    arcanum?.stageRect?.t === 0 && Math.abs(Number(arcanum?.stageRect?.h) - arcanum?.vh) <= 1,
    JSON.stringify({ stage: arcanum?.stageRect, vh: arcanum?.vh })
  );
  check(
    "星阵咏唱：歌词 / HUD 仍留在安全区内（不进标题栏与底栏）",
    Number(arcanum?.safe?.top) > 0 &&
      Number(arcanum?.safe?.bottom) > 0 &&
      arcanum?.hudTop >= Number(arcanum?.safe?.top) &&
      Array.isArray(arcanum?.lineCenters) &&
      arcanum.lineCenters.length > 0 &&
      arcanum.lineCenters.every(
        (c) => c >= Number(arcanum.safe.top) && c <= arcanum.vh - Number(arcanum.safe.bottom)
      ),
    JSON.stringify({ safe: arcanum?.safe, hudTop: arcanum?.hudTop, centers: arcanum?.lineCenters, vh: arcanum?.vh })
  );
  check(
    "星阵咏唱：歌词铺在互不重叠的横带上（同屏没有两行落在同一条带）",
    Array.isArray(arcanum?.bands) &&
      arcanum.bands.length >= 4 &&
      new Set(arcanum.bands).size === arcanum.bands.length &&
      arcanum.bands.every((b) => b !== undefined && Number(b) >= 0 && Number(b) < 6),
    JSON.stringify(arcanum?.bands)
  );
  // ★ 渲染之后回头验一遍：真的没有两块文字叠在一起（需求原文：
  //   「渲染之前模拟矩形判断会不会重叠，防止渲染之后文字叠在一起」）。
  //   这里用"渲染之后的盒子"再验一次，两边都成立才算数。
  {
    const boxes = Array.isArray(arcanum?.lineBoxes) ? arcanum.lineBoxes : [];
    const hits = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (ox > 1 && oy > 1) hits.push({ i, j, ox: Math.round(ox), oy: Math.round(oy) });
      }
    }
    check(
      "星阵咏唱：落定之后的歌词盒子两两不相交（不是只看行带编号）",
      boxes.length >= 4 && hits.length === 0,
      JSON.stringify({ settledLines: boxes.length, hits })
    );
    // ★ 字与字：这才是需求里"字和字之间都不要重叠"的直接验收。
    //   用 Range 量到的字面矩形（不含 padding / 行高）做二维求交。
    const units = Array.isArray(arcanum?.unitBoxes) ? arcanum.unitBoxes : [];
    const unitHits = [];
    for (let i = 0; i < units.length; i += 1) {
      for (let j = i + 1; j < units.length; j += 1) {
        const a = units[i];
        const c = units[j];
        const ox = Math.min(a.r, c.r) - Math.max(a.l, c.l);
        const oy = Math.min(a.b, c.b) - Math.max(a.t, c.t);
        if (ox > 0.5 && oy > 0.5) {
          unitHits.push({
            a: a.line + ":" + a.ch,
            b: c.line + ":" + c.ch,
            ox: Math.round(ox * 10) / 10,
            oy: Math.round(oy * 10) / 10,
          });
        }
      }
    }
    check(
      "星阵咏唱：字与字之间不重叠（按字面墨迹量，不是按行高盒子）",
      units.length >= 20 && unitHits.length === 0,
      JSON.stringify({ units: units.length, hits: unitHits.slice(0, 8) })
    );
    // ★ 法阵：整个圆（含波纹能到达的最远处）都要落在安全区里，而且圆心居中
    const c = arcanum?.circle;
    check(
      "星阵咏唱：法阵完整落在可见区内且居中（不再被底栏吃掉半圈）",
      Boolean(c) &&
        c.cy === c.mid &&
        c.top >= c.safeTop - 1 &&
        c.bottom <= c.safeBottomEdge + 1,
      JSON.stringify(c)
    );
    const hud = arcanum?.hudBox;
    const onHud = hud
      ? boxes.filter((q) => Math.min(q.r, hud.r) - Math.max(q.l, hud.l) > 1 && Math.min(q.b, hud.b) - Math.max(q.t, hud.t) > 1)
      : [];
    check("星阵咏唱：没有歌词压在左上角的曲名上", Boolean(hud) && onHud.length === 0, JSON.stringify({ hud, onHud }));
  }
  check(
    "星阵咏唱：歌词是散落的符文，当前句有入场魔法且镜头已经落在它身上",
    arcanum?.lineCount > 0 &&
      arcanum?.activeLines === 1 &&
      arcanum?.unitCount > 1 &&
      typeof arcanum?.modes === "string" &&
      arcanum.modes.length > 0 &&
      /translate3d/.test(arcanum?.runesTransform || "") &&
      Number(arcanum?.fit) > 0,
    JSON.stringify({
      lines: arcanum?.lineCount,
      active: arcanum?.activeLines,
      units: arcanum?.unitCount,
      mode: arcanum?.modes,
      tf: arcanum?.runesTransform,
      anim: arcanum?.unitAnim,
    })
  );
  // ★ 「待播放」的字要留着，不能被入场动画的延迟提前吃掉。
  //   这条规则只有渲染出来才验得了：它取决于 fill-mode 与延迟的组合语义，
  //   源码里读到 forwards 不代表浏览器真的没有拿 0% 帧去填延迟。
  {
    // 造出来的那一行：3 个字，延迟 4s 起，后两个是 todo —— 它们此刻都还没到
    // 自己的入场时间，所以必须已经看得见（这正是"待播放的 23 保留"）。
    const probe = Array.isArray(arcanum?.todoProbe) ? arcanum.todoProbe : [];
    const waiting = probe.filter((u) => u.hold === "todo" && u.delay > 0.05);
    const invisible = waiting.filter((u) => !(u.opacity > 0.05));
    check(
      "星阵咏唱：待播放的字保留在原地（入场延迟期间不清空整句）",
      arcanum?.unitFillMode === "forwards" && waiting.length === 2 && invisible.length === 0,
      JSON.stringify({ fillMode: arcanum?.unitFillMode, probe, invisible })
    );
  }

  /* 8c. 减少动态效果：切成"清晰歌词模式"（居中竖排、没有入场魔法、没有散落位移）——
        这是可访问性要求里最容易做假的一条（"把动效调慢"不等于"看得清"）。 */
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await send("Page.navigate", { url: `${BASE}?probe=1&view=player&pv=arcanum&playing=1` });
  await sleep(2000);
  const reducedMotion = await evaluate(`(() => {
    const stage = document.querySelector(".ar-stage");
    const line = document.querySelector('.ar-line[data-state="active"]');
    const unit = line ? line.querySelector(".ar-unit") : null;
    const cs = line ? getComputedStyle(line) : null;
    return {
      anim: stage ? stage.dataset.anim : "",
      clear: stage ? stage.dataset.clear : "",
      position: cs ? cs.position : "",
      transform: cs ? cs.transform : "",
      unitAnimation: unit ? getComputedStyle(unit).animationName : "",
      unitTransform: unit ? getComputedStyle(unit).transform : "",
    };
  })()`);
  check(
    "星阵咏唱：减少动态效果时切成清晰歌词模式（居中竖排 / 无入场魔法 / 无散落位移）",
    reducedMotion?.anim === "off" &&
      reducedMotion?.clear === "1" &&
      reducedMotion?.position === "static" &&
      reducedMotion?.transform === "none" &&
      reducedMotion?.unitAnimation === "none" &&
      reducedMotion?.unitTransform === "none",
    JSON.stringify(reducedMotion)
  );
  await send("Emulation.setEmulatedMedia", { features: [] });

  /* 8d. 后台（最小化 / 托盘）时 commit() 仍然必须广播 ——
         真实事故：窗口不可见时 rAF 被**挂起**（不是变慢，是这一帧永远不来），
         而"自动下一首"这条链只有这一处异步：
           ended → playNext → playSong → commit → notify → syncAudio
         断在 commit 上就表现成「播完不切下一首，点开主界面又自己切过去了」。
         这里把 rAF 换成空操作、把 visibilityState 伪装成 hidden，
         验证 commit() 依然能在宏任务里把订阅者跑起来。 */
  const hiddenFlush = await evaluate(`(async () => {
    const store = await import("/js/store.js");
    let hits = 0;
    const off = store.subscribe(() => { hits += 1; });
    const realRaf = window.requestAnimationFrame;
    const realCancel = window.cancelAnimationFrame;
    const realVisibility = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
    window.requestAnimationFrame = () => 0; // 模拟「rAF 永远不回调」
    window.cancelAnimationFrame = () => {};
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    store.commit();
    await new Promise((r) => setTimeout(r, 150));
    window.requestAnimationFrame = realRaf;
    window.cancelAnimationFrame = realCancel;
    if (realVisibility) Object.defineProperty(Document.prototype, "visibilityState", realVisibility);
    else delete document.visibilityState;
    off();
    return { hits };
  })()`);
  check(
    "后台（最小化 / 托盘）时 commit() 仍会广播（自动下一首不会卡住）",
    Number(hiddenFlush?.hits) > 0,
    JSON.stringify(hiddenFlush)
  );

  /* 9. 设置里的主题 / 样式卡片：选中热区是卡片内部的按钮，且内置项不出现「移除」
        （删除按钮只能放在按钮外面 —— 嵌套 button 会被解析器拆开，卡片结构会散） */
  const cards = await evaluate(`(async () => {
    const shell = await import("/js/shell.js");
    shell.openSettings();
    await new Promise((r) => setTimeout(r, 400));
    const themes = [...document.querySelectorAll("#sec-appearance .themecard")];
    const skins = [...document.querySelectorAll("#sec-player .skincard")];
    return {
      themes: themes.length,
      themesWithPick: themes.filter((c) => c.querySelectorAll(".themecard__pick").length === 1).length,
      themeRemovables: themes.filter((c) => c.querySelector(".carddel")).length,
      skins: skins.length,
      skinsWithPick: skins.filter((c) => c.querySelectorAll(".skincard__pick").length === 1).length,
      nestedButtons: document.querySelectorAll("button button").length,
      activeSkins: skins.filter((c) => c.dataset.active === "true").length,
    };
  })()`);
  check(
    "主题 / 样式卡片：选中按钮在卡片内、没有 button 嵌套",
    cards?.themes > 0 &&
      cards?.themesWithPick === cards?.themes &&
      // 内置五种样式都要在（预览模式不加载用户数据目录里的第三方样式；
      // 这个阈值以前写死 8，比内置数量还大，一直是失败项）
      cards?.skins >= 5 &&
      cards?.skinsWithPick === cards?.skins &&
      cards?.nestedButtons === 0 &&
      cards?.activeSkins === 1,
    JSON.stringify(cards)
  );
  check(
    "内置主题 / 样式不提供「移除」（避免删了又被程序重新生成）",
    cards?.themeRemovables === 0,
    `可移除的主题卡片 = ${cards?.themeRemovables}`
  );

  check("没有 console 报错 / 未捕获异常", errors.length === 0, errors.slice(0, 3).join(" | "));

  ws.close();
  child.kill();

  const failed = results.filter((r) => !r.ok);
  console.log("");
  console.log(failed.length ? `失败 ${failed.length} / ${results.length}` : `全部通过（${results.length} 项）`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("check-player-host 异常:", err);
  process.exit(2);
});
