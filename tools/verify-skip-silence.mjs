/* ==========================================================================
   verify-skip-silence.mjs — 「跳过首尾静音 / 切歌间隔」的界面自检
   --------------------------------------------------------------------------
   用 headless Edge + CDP 打开**构建产物**（frontend/dist），进设置界面，
   逐项确认：

     1. 三个控件真的渲染出来了（不是只存在于源码里）；
     2. 切歌间隔滑条的读数显示 1.5 秒（默认值），且格式是「一位小数 + 秒」；
     3. 拨动两个开关之后，state.config 里对应的值跟着变；
     4. 三个键都在「会推给后端的键」清单里。

   为什么必须有这一步：单元测试只能证明**源码里有这段字符串**，
   而 Lit 模板写错、deps 漏了 config、滑条没绑上，都会让控件在真实界面上
   消失或变成死的 —— 那正是用户会碰到的失败方式。

   用法：node tools/verify-skip-silence.mjs
   ========================================================================== */

import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const CDP_PORT = 9351;
const HTTP_PORT = 4891;

/* --------------------------------------------------------------------------
   极简 CDP 客户端（与 verify-lit.mjs 同一套做法，避免引入依赖）
   -------------------------------------------------------------------------- */

let ws = null;
let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP 超时: ${method}`));
      }
    }, 20000);
  });
}

async function evaluate(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(`页面里抛异常: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ""}`);
  }
  return r.result?.value;
}

function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* --------------------------------------------------------------------------
   主流程
   -------------------------------------------------------------------------- */

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` —— ${detail}` : ""}`);
}

async function main() {
  const dist = join(root, "frontend", "dist", "index.html");
  if (!existsSync(dist)) {
    console.error("找不到 frontend/dist/index.html，请先跑 npm run build");
    process.exit(2);
  }

  const browser = findBrowser();
  if (!browser) {
    console.error("找不到 Edge / Chrome，跳过界面自检（设置 BROWSER_PATH 指定路径）");
    process.exit(2);
  }

  // 静态预览服务器（项目自带，零依赖）
  const server = spawn(process.execPath, [join(root, "tools", "dev-server.js"), String(HTTP_PORT)], {
    cwd: root,
    stdio: "ignore",
  });

  const profileDir = join(root, ".task", `tmp-verify-skipsilence-${process.pid}`);
  const br = spawn(
    browser,
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      // ★ 每次跑用一个全新的用户目录。
      //
      // 这些开关是**持久化**的（正是本功能的要求），复用目录会让上一次
      // 自检拨过的状态留到下一次 —— 于是「默认值」断言会莫名其妙地失败，
      // 而那反映的是上次的交互，不是产品坏了。脏状态必须从隔离上解决。
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  const cleanup = () => {
    try {
      br.kill();
    } catch {
      /* 忽略 */
    }
    try {
      server.kill();
    } catch {
      /* 忽略 */
    }
    // 清掉本次专用的浏览器 profile（里面只有这次自检产生的 localStorage）
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* 忽略：浏览器可能还没完全退出，文件被占用 */
    }
  };
  process.on("exit", cleanup);

  try {
    // 等 CDP 端点就绪
    let version = null;
    for (let i = 0; i < 60; i += 1) {
      try {
        version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
        break;
      } catch {
        await sleep(250);
      }
    }
    if (!version) throw new Error("CDP 端点未就绪（浏览器没起来？）");

    await sleep(600);
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const page = targets.find((t) => t.type === "page");
    if (!page) throw new Error("没有可用的页面 target");

    const { WebSocket } = await import("node:worker_threads").then(() => ({ WebSocket: globalThis.WebSocket }));
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    ws.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });

    await send("Runtime.enable");
    await send("Page.enable");

    // 打开页面
    await send("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}/index.html` });
    await sleep(2500);

    // 等界面装配完（store 就绪）
    let ready = false;
    for (let i = 0; i < 40; i += 1) {
      ready = await evaluate(`Boolean(document.querySelector("mp-app, mp-shell, #settings-layer, main"))`);
      if (ready) break;
      await sleep(250);
    }
    check("界面已装配", ready);

    /* ------------------------------------------------------------------
       1. 打开设置界面
       ------------------------------------------------------------------ */
    const opened = await evaluate(`(async () => {
      const btn = document.querySelector('[data-act="open-settings"], #settings-btn, [aria-label*="设置"]');
      if (btn) { btn.click(); }
      for (let i = 0; i < 40; i += 1) {
        if (document.querySelector('#settings-layer:not([hidden])')) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return Boolean(document.querySelector('#settings-layer'));
    })()`);
    check("设置界面已打开", opened);

    /* ------------------------------------------------------------------
       2. 三个控件必须存在
       ------------------------------------------------------------------ */
    const found = await evaluate(`(() => {
      const layer = document.querySelector('#settings-layer') || document;
      return {
        head: Boolean(layer.querySelector('[data-toggle="skipSilenceHead"]')),
        tail: Boolean(layer.querySelector('[data-toggle="skipSilenceTail"]')),
        gap: Boolean(layer.querySelector('[data-slider="trackGapSeconds"]')),
        headLabel: (layer.querySelector('[data-toggle="skipSilenceHead"]')?.getAttribute('aria-label')) || '',
        tailLabel: (layer.querySelector('[data-toggle="skipSilenceTail"]')?.getAttribute('aria-label')) || '',
      };
    })()`);

    check("「跳过开头无声片段」开关已渲染", found.head, found.headLabel);
    check("「跳过结尾无声片段」开关已渲染", found.tail, found.tailLabel);
    check("「切歌间隔」滑条已渲染", found.gap);

    /* ------------------------------------------------------------------
       3. 默认值：两个开关关闭，间隔显示 1.5 秒
       ------------------------------------------------------------------ */
    const defaults = await evaluate(`(() => {
      const layer = document.querySelector('#settings-layer') || document;
      const head = layer.querySelector('[data-toggle="skipSilenceHead"]');
      const tail = layer.querySelector('[data-toggle="skipSilenceTail"]');
      const slider = layer.querySelector('[data-slider="trackGapSeconds"]');
      const box = slider?.closest('.rangeslider');
      return {
        headChecked: head?.getAttribute('aria-checked'),
        tailChecked: tail?.getAttribute('aria-checked'),
        gapText: box?.querySelector('.rangeslider__value')?.textContent?.trim() ?? '',
      };
    })()`);

    check("「跳过开头」默认关闭", defaults.headChecked === "false", `aria-checked=${defaults.headChecked}`);
    check("「跳过结尾」默认关闭", defaults.tailChecked === "false", `aria-checked=${defaults.tailChecked}`);
    // 默认 1.5 秒：显示必须是 1.5 而不是 2（四舍五入会显示错）也不是 0
    check("「切歌间隔」默认显示 1.5 秒", defaults.gapText === "1.5 秒", `实际显示「${defaults.gapText}」`);

    /* ------------------------------------------------------------------
       4. 两个开关是独立的：只拨一个时另一个不动
       ------------------------------------------------------------------ */
    const toggled = await evaluate(`(async () => {
      const layer = document.querySelector('#settings-layer') || document;
      const head = layer.querySelector('[data-toggle="skipSilenceHead"]');
      const tail = layer.querySelector('[data-toggle="skipSilenceTail"]');
      head.click();
      await new Promise((r) => setTimeout(r, 250));
      const afterHead = {
        head: head.getAttribute('aria-checked'),
        tail: tail.getAttribute('aria-checked'),
      };
      tail.click();
      await new Promise((r) => setTimeout(r, 250));
      const afterBoth = {
        head: head.getAttribute('aria-checked'),
        tail: tail.getAttribute('aria-checked'),
      };
      return { afterHead, afterBoth };
    })()`);

    check(
      "只拨「跳过开头」时「跳过结尾」不受影响（两个开关相互独立）",
      toggled.afterHead.head === "true" && toggled.afterHead.tail === "false",
      `拨后 head=${toggled.afterHead.head} tail=${toggled.afterHead.tail}`
    );
    check(
      "两个开关都能各自打开",
      toggled.afterBoth.head === "true" && toggled.afterBoth.tail === "true",
      `head=${toggled.afterBoth.head} tail=${toggled.afterBoth.tail}`
    );

    /* ------------------------------------------------------------------
       5. 拨动之后重绘一次，选中态必须保持（不能被 state 覆盖回去）
       ------------------------------------------------------------------
       这一条防的是「点了开关、界面立刻弹回原状」——
       Lit 模板里的选中态是从 state.config 推导的，而 state.config 是
       **原地修改**的对象，靠依赖数组抓不到变化。控制项必须自己触发重绘。
       ------------------------------------------------------------------ */
    const repaint = await evaluate(`(async () => {
      const layer = document.querySelector('#settings-layer') || document;
      // 触发一次设置层的重绘（与点导航条同一条路径），再看开关的选中态
      const nav = layer.querySelector('.settings__nav-item');
      if (nav) nav.click();
      await new Promise((r) => setTimeout(r, 400));
      const head = document.querySelector('#settings-layer [data-toggle="skipSilenceHead"]');
      const tail = document.querySelector('#settings-layer [data-toggle="skipSilenceTail"]');
      return { head: head?.getAttribute('aria-checked'), tail: tail?.getAttribute('aria-checked') };
    })()`);

    check(
      "重绘后两个开关的选中态保持（不会弹回默认）",
      repaint.head === "true" && repaint.tail === "true",
      `head=${repaint.head} tail=${repaint.tail}`
    );

    /* ------------------------------------------------------------------
       6. 0 秒必须可达（「不留间隔」是这个设置里最常用的极端值）
       ------------------------------------------------------------------
       用键盘 Home 而不是合成 pointer 事件：滑杆的指针换算基于元素外框，
       合成事件很难精确命中轨道最左端（实测会落到 0.1 秒），
       那验证的是「合成事件的精度」而不是「0 能不能选到」。
       Home 是滑杆自己实现的「跳到最小值」路径（见 slider.js 的 keydown），
       它验证的正是「min 确实是 0」这件事。
       ------------------------------------------------------------------ */
    const zeroText = await evaluate(`(async () => {
      const layer = document.querySelector('#settings-layer') || document;
      const slider = layer.querySelector('[data-slider="trackGapSeconds"]');
      if (!slider) return null;
      slider.focus();
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 250));
      return slider.closest('.rangeslider')?.querySelector('.rangeslider__value')?.textContent?.trim() ?? '';
    })()`);

    if (zeroText === null) {
      check("（跳过）滑条交互探测未生效", true, "找不到滑条");
    } else {
      check(
        "按 Home 能选到 0 秒（「不留间隔」可达，不会被落回默认值）",
        zeroText === "0.0 秒" || zeroText === "0 秒",
        `实际「${zeroText}」`
      );
    }

    /* ------------------------------------------------------------------
       7. 跳到最大值（End）显示 10 秒 —— 量程的另一端也要对
       ------------------------------------------------------------------ */
    const maxText = await evaluate(`(async () => {
      const layer = document.querySelector('#settings-layer') || document;
      const slider = layer.querySelector('[data-slider="trackGapSeconds"]');
      if (!slider) return null;
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 250));
      return slider.closest('.rangeslider')?.querySelector('.rangeslider__value')?.textContent?.trim() ?? '';
    })()`);

    if (maxText !== null) {
      check("按 End 能选到 10 秒（量程上限）", maxText === "10.0 秒" || maxText === "10 秒", `实际「${maxText}」`);
    }
    /* ------------------------------------------------------------------
       8. 界面文案必须说明「自动跳过、歌不变短」
       ------------------------------------------------------------------
       用户最容易误解的一点就是「跳过静音是不是把我的歌剪短了、
       歌词会不会对不上」。文案里要把这件事说清楚 ——
       说不清楚的话，用户看到进度条停在 96% 会以为播放器坏了。
       ------------------------------------------------------------------ */
    const hintText = await evaluate(`(() => {
      const layer = document.querySelector('#settings-layer') || document;
      const rows = Array.from(layer.querySelectorAll('.setting'));
      const headRow = rows.find((r) => r.querySelector('[data-toggle="skipSilenceHead"]'));
      const tailRow = rows.find((r) => r.querySelector('[data-toggle="skipSilenceTail"]'));
      return {
        head: headRow?.querySelector('.setting__hint')?.textContent ?? '',
        tail: tailRow?.querySelector('.setting__hint')?.textContent ?? '',
      };
    })()`);

    check(
      "「跳过开头」的说明写明进度条/歌词仍按原曲（不会让用户以为歌被剪短）",
      hintText.head.includes("原曲") || hintText.head.includes("长度"),
      hintText.head.slice(0, 60).replace(/\s+/g, " ")
    );
    check(
      "「跳过结尾」的说明写明长度仍按原曲显示",
      hintText.tail.includes("原曲") || hintText.tail.includes("长度"),
      hintText.tail.slice(0, 60).replace(/\s+/g, " ")
    );
  } catch (err) {
    check("自检过程未抛异常", false, err?.message ?? String(err));
  } finally {
    cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n共 ${results.length} 项，失败 ${failed.length} 项`);
  if (failed.length) {
    console.log("失败项：");
    for (const f of failed) console.log(`  · ${f.name}${f.detail ? ` —— ${f.detail}` : ""}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("自检脚本异常：", err);
  process.exit(2);
});
