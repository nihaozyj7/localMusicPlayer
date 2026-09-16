/* ==========================================================================
   measure-template.mjs — 量测用的「复制 frontend/src + 注入测量脚本」公共逻辑
   --------------------------------------------------------------------------
   为什么要有这个文件：之前各个量测脚本各自依赖 .task/measure 下的一份副本，
   结果量到的是**过期的 CSS**（改了源码却没重新复制），诊断结论跟着错。
   现在统一：每次运行都从 frontend/src 重新复制，保证量的一定是最新源码。
   ========================================================================== */

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";

/** 注入的测量脚本的名字（写成独立文件，见 prepareMeasureDir 里的说明） */
export const MEASURE_SCRIPT = "__measure.js";

/** 注入的测量脚本内容：两帧后把结果写成 #measure-out 的文本 */
export const MEASURE_CODE = `
  const R = (n) => {
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width),
             h: Math.round(r.height), bottom: Math.round(r.bottom), right: Math.round(r.right) };
  };
  const run = () => {
    const out = { viewport: { w: innerWidth, h: innerHeight }, problems: [] };
    const head = document.querySelector(".tracks__head");
    const tracks = document.querySelector(".tracks");
    const rows = [...document.querySelectorAll(".track")];
    const cb = document.getElementById("content-body");

    out.tracks = R(tracks);
    out.head = R(head);
    out.headCss = head ? { position: getComputedStyle(head).position, top: getComputedStyle(head).top,
                           height: getComputedStyle(head).height, alignItems: getComputedStyle(head).alignItems,
                           gridTemplateRows: getComputedStyle(head).gridTemplateRows } : null;
    out.page = R(document.querySelector(".page"));
    out.contentBody = R(cb);
    out.contentHeader = R(document.querySelector(".content-header"));
    out.rowCount = rows.length;
    out.row1 = R(rows[0]);
    out.row2 = R(rows[1]);
    out.tracksCss = tracks ? { display: getComputedStyle(tracks).display,
                               flexDirection: getComputedStyle(tracks).flexDirection,
                               overflow: getComputedStyle(tracks).overflow } : null;

    out.headCells = [...(head ? head.children : [])].map((c) => ({
      cls: c.className, text: (c.textContent || "").trim().slice(0, 6), box: R(c),
    }));
    out.headSvgs = [...(head ? head.querySelectorAll("svg, img") : [])].map((s) => ({
      tag: s.tagName, parent: s.parentElement?.className, box: R(s),
    }));

    const row1Cells = rows[0] ? [...rows[0].children] : [];
    out.colAlign = (head ? [...head.children] : []).map((hc, i) => {
      const rc = row1Cells[i];
      return { i, head: hc.className, row: rc ? rc.className : null,
               headX: Math.round(hc.getBoundingClientRect().left),
               rowX: rc ? Math.round(rc.getBoundingClientRect().left) : null,
               dx: rc ? Math.round(hc.getBoundingClientRect().left - rc.getBoundingClientRect().left) : null };
    });

    out.scrollContainer = cb ? { id: cb.id, overflowY: getComputedStyle(cb).overflowY } : null;

    if (out.head && out.row1) {
      out.gapHeadToRow1 = out.row1.y - out.head.bottom;
      if (out.head.bottom > out.row1.y + 1) {
        out.problems.push("表头底部(" + out.head.bottom + ") 越过第一行顶部(" + out.row1.y + ")");
      }
      if (out.head.y >= out.row1.y) {
        out.problems.push("表头 y(" + out.head.y + ") 不在第一行之上");
      }
    }
    for (const c of out.headCells) {
      if (!c.box || !out.head || c.box.h === 0) continue;
      if (c.box.y < out.head.y - 1 || c.box.bottom > out.head.bottom + 1) {
        out.problems.push("表头单元格「" + c.text + "」超出表头盒子 cell=[" + c.box.y + "," + c.box.bottom +
                          "] head=[" + out.head.y + "," + out.head.bottom + "]");
      }
    }
    for (const s of out.headSvgs) {
      if (s.box && (s.box.w > 100 || s.box.h > 50)) {
        out.problems.push("表头图标尺寸失控 " + s.box.w + "×" + s.box.h + "（." + s.parent + "），应显式给宽高");
      }
    }
    for (const c of out.colAlign) {
      if (c.dx !== null && Math.abs(c.dx) > 1) {
        out.problems.push("第 " + c.i + " 列横向错位 " + c.dx + "px：" + c.head + " vs " + c.row);
      }
    }
    const el = document.getElementById("measure-out");
    if (el) el.textContent = "MEASURE_JSON:" + JSON.stringify(out);
  };
  requestAnimationFrame(() => requestAnimationFrame(run));
`;

/** 裸包名 → 量测页里可直接解析的同源路径（没有打包器，也没有 import map 可用） */
const BARE_SPECIFIERS = [
  ["@localmusicplayer/player-skins/contract", "/packages/player-skins/src/contract.js"],
  ["@localmusicplayer/player-skins", "/packages/player-skins/src/index.js"],
];

/**
 * 把 JS 源码改写成「浏览器原生 ESM 直接能跑」的形态。两处必须改：
 *
 * 1. **摘掉 `import "./x.css"`**：Vite 能处理 CSS import（打包时抽成样式表），
 *    但量测页是浏览器直接加载源码，`import "./lyrics.css"` 会抛
 *    `Failed to load module script: MIME type of "text/css"` —— 整个模块图挂掉，
 *    页面一片空白，量出来的全是 undefined。改成「摘掉 + 用 <link> 引入」，
 *    样式照样生效，只是换成了浏览器原生支持的方式。
 *
 * 2. **把工作区包名换成同源路径**：`import "@localmusicplayer/player-skins"` 是裸说明符，
 *    浏览器不认识。本来可以用 import map，但 import map 是**内联脚本**，
 *    会被页面的 CSP（`script-src 'self'`）拦掉 —— 实测就是被拦掉，
 *    于是模块解析失败、页面全空。直接改写说明符最稳，不依赖 CSP 放宽。
 */
function rewriteForBrowser(dir, rootDir, collected) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      rewriteForBrowser(full, rootDir, collected);
      continue;
    }
    if (!e.name.endsWith(".js") && !e.name.endsWith(".mjs")) continue;
    const src = readFileSync(full, "utf8");
    if (!src.includes(".css") && !src.includes("@localmusicplayer/")) continue;

    const kept = [];
    let changed = false;
    for (const line of src.split("\n")) {
      const m = /^\s*import\s+["'](.+\.css)["'];?\s*$/.exec(line);
      if (m) {
        const cssPath = resolve(dirname(full), m[1]);
        const rel = relative(rootDir, cssPath).split(sep).join("/");
        collected.push("/" + rel);
        changed = true;
        continue;
      }
      let next = line;
      for (const [bare, target] of BARE_SPECIFIERS) {
        if (next.includes(`"${bare}"`)) next = next.replace(`"${bare}"`, `"${target}"`);
        if (next.includes(`'${bare}'`)) next = next.replace(`'${bare}'`, `"${target}"`);
      }
      if (next !== line) changed = true;
      kept.push(next);
    }
    if (changed) writeFileSync(full, kept.join("\n"));
  }
}

/**
 * 从 frontend/src 复制一份到 targetDir，并注入测量脚本。
 * 每次都重新复制，确保量的就是当前源码。
 *
 * 四件必要的加工（少一件量出来的就是空盒子）：
 *   1. 把 frontend/packages（工作区独立包，如播放界面皮肤）一起复制过来；
 *   2. 把工作区包名改写成同源路径（裸说明符浏览器不认识，而 import map 是内联脚本，
 *      会被 CSP 拦掉，详见 rewriteForBrowser）；
 *   3. 摘掉 JS 里的 CSS import 改用 <link>（浏览器原生 ESM 不能 import CSS）；
 *   4. 测量脚本写成**独立文件**再用 <script src> 引入 —— 内联脚本同样会被 CSP 拦掉，
 *      之前量出来全是 undefined 就是这个原因（报告根本没写进 #measure-out）。
 */
export function prepareMeasureDir(srcDir, targetDir) {
  rmSync(targetDir, { recursive: true, force: true });
  const copy = (from, to) => {
    mkdirSync(to, { recursive: true });
    for (const e of readdirSync(from, { withFileTypes: true })) {
      const s = join(from, e.name);
      const d = join(to, e.name);
      if (e.isDirectory()) copy(s, d);
      else writeFileSync(d, readFileSync(s));
    }
  };
  copy(srcDir, targetDir);
  const packagesDir = join(srcDir, "..", "packages");
  if (existsSync(packagesDir)) copy(packagesDir, join(targetDir, "packages"));

  // 改写必须发生在复制之后（改的是副本，不能碰源码）
  const cssFiles = [];
  rewriteForBrowser(targetDir, targetDir, cssFiles);

  writeFileSync(join(targetDir, MEASURE_SCRIPT), MEASURE_CODE);

  const idx = join(targetDir, "index.html");
  const cssLinks = [...new Set(cssFiles)].map((href) => `<link rel="stylesheet" href="${href}" />`).join("\n    ");
  writeFileSync(
    idx,
    readFileSync(idx, "utf8")
      .replace("</head>", `${cssLinks}\n  </head>`)
      .replace(
        "</body>",
        `<div id="measure-out" hidden></div>\n<script type="module" src="/${MEASURE_SCRIPT}"></script>\n</body>`
      )
  );
  return targetDir;
}
