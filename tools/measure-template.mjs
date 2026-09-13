/* ==========================================================================
   measure-template.mjs — 量测用的「复制 frontend/src + 注入测量脚本」公共逻辑
   --------------------------------------------------------------------------
   为什么要有这个文件：之前各个量测脚本各自依赖 .task/measure 下的一份副本，
   结果量到的是**过期的 CSS**（改了源码却没重新复制），诊断结论跟着错。
   现在统一：每次运行都从 frontend/src 重新复制，保证量的一定是最新源码。
   ========================================================================== */

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** 注入的测量脚本：两帧后把结果写成 #measure-out 的文本 */
export const INJECT = `
<div id="measure-out" style="display:none"></div>
<script type="module">
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
<\/script>
`;

/**
 * 从 frontend/src 复制一份到 targetDir，并注入测量脚本。
 * 每次都重新复制，确保量的就是当前源码。
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
  const idx = join(targetDir, "index.html");
  writeFileSync(idx, readFileSync(idx, "utf8").replace("</body>", INJECT + "</body>"));
  return targetDir;
}
