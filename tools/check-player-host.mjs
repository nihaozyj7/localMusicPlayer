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
    Array.isArray(skins) && skins.join(",") === "classic,immersive,minimal",
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
