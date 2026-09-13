/* ==========================================================================
   probe.js — 界面自检探针（仅在 URL 带 ?probe=1 时运行）
   --------------------------------------------------------------------------
   目标：在没有人工肉眼检查的情况下发现「布局写坏」的硬伤：
     · 横向溢出
     · 固定区域（标题栏/侧边栏/底栏）尺寸与设计稿不一致
     · 元素跑出视口
     · 文字颜色与背景对比度过低（简易亮度差判断）
     · 主题令牌是否缺失
   结果写入 document.title 与一个 <pre id="probe-report">，可用 --dump-dom 读取。
   ========================================================================== */

const REQUIRED_TOKENS = [
  "--bg-app",
  "--glass-bg",
  "--glass-blur",
  "--glass-border",
  "--accent",
  "--text-1",
  "--text-2",
  "--text-3",
  "--border-1",
  "--r-md",
  "--h-titlebar",
  "--w-sidebar",
  "--h-playerbar",
  "--h-header",
  "--row-h",
  "--dur",
  "--ease",
];

function rect(sel) {
  const n = document.querySelector(sel);
  if (!n) return null;
  const r = n.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) };
}

/**
 * 找出元素与其滚动祖先之间「最近的那个会滚动/裁剪的祖先」。
 *
 * sticky 只在「最近的可滚动祖先」里生效：一旦中间某层写了
 * overflow: hidden / auto / scroll，表头就会跟着内容一起滚走。
 * overflow: clip 会裁剪内容但不产生滚动容器，是允许的。
 *
 * 这里把「除 html/body 之外、且不是 .content-body 本身」的第一个
 * 这样的祖先返回给调用方判断。
 */
function nearestScrollAncestor(el) {
  let node = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const cs = getComputedStyle(node);
    if (cs.overflowY !== "visible" && cs.overflowY !== "clip") return node;
    node = node.parentElement;
  }
  return null;
}

function parseColor(str) {
  const m = String(str).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
}

function luminance({ r, g, b }) {
  const f = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function runProbe() {
  const info = {};
  const issues = [];
  const cs = getComputedStyle(document.documentElement);
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  /* 1. 令牌完整性 */
  const missing = REQUIRED_TOKENS.filter((t) => !cs.getPropertyValue(t).trim());
  if (missing.length) issues.push(`缺少主题令牌: ${missing.join(", ")}`);

  /* 2. 横向溢出 */
  if (document.documentElement.scrollWidth > vw + 1) {
    issues.push(`页面横向溢出: scrollWidth=${document.documentElement.scrollWidth} > ${vw}`);
  }
  if (document.body.scrollWidth > vw + 1) {
    issues.push(`body 横向溢出: ${document.body.scrollWidth} > ${vw}`);
  }

  /* 3. 固定区域尺寸 */
  // 播放界面打开时侧边栏依旧保持原宽（播放界面停在它右侧），因此恒定校验
  const expect = {
    ".titlebar": { h: parseFloat(cs.getPropertyValue("--h-titlebar")) },
    ".sidebar": { w: parseFloat(cs.getPropertyValue("--w-sidebar")) },
    ".playerbar": { h: parseFloat(cs.getPropertyValue("--h-playerbar")) },
    ".content-header": { h: parseFloat(cs.getPropertyValue("--h-header")) },
  };
  for (const [sel, want] of Object.entries(expect)) {
    const r = rect(sel);
    if (!r) {
      issues.push(`找不到关键区域: ${sel}`);
      continue;
    }
    info[sel] = r;
    if (want.h && Math.abs(r.h - want.h) > 2) issues.push(`${sel} 高度 ${r.h}px ≠ 设计 ${want.h}px`);
    if (want.w && Math.abs(r.w - want.w) > 2) issues.push(`${sel} 宽度 ${r.w}px ≠ 设计 ${want.w}px`);
  }

  /* 4. 元素是否跑出视口 */
  const outside = [];
  document.querySelectorAll(".playerbar__tools, .playerbar__center, .content-header__tools").forEach((n) => {
    const r = n.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) outside.push(`${n.className} right=${Math.round(r.right)}`);
  });
  if (outside.length) issues.push(`元素超出视口: ${outside.join(" | ")}`);

  /* 4.1 底栏结构：进度条在上、控制行在下；各部分不能互相重叠 */
  const playerbarEl = document.querySelector(".playerbar");
  if (playerbarEl) {
    const barRect = playerbarEl.getBoundingClientRect();
    const prog = rect(".playerbar__progress");
    const row = rect(".playerbar__row");
    const now = rect(".playerbar__now");
    const center = rect(".playerbar__center");
    const tools = rect(".playerbar__tools");
    info.playerbar = { bar: { w: Math.round(barRect.width), h: Math.round(barRect.height) }, prog, row, now, center, tools };
    if (!prog || !row) {
      issues.push("底栏缺少进度条或控制行");
    } else {
      if (prog.y + prog.h > row.y + 2) issues.push("底栏进度条与控制行重叠");
      if (now && center && now.x + now.w > center.x + 1) issues.push("底栏「当前曲目」与传输控制重叠");
      if (center && tools && center.x + center.w > tools.x + 1) issues.push("底栏传输控制与右侧工具重叠");
      if (row.y + row.h > barRect.bottom + 1) issues.push("底栏控制行超出播放控件区域");
    }
    // 元素必须保持在底栏范围内
    for (const [label, r] of [
      ["进度条", prog],
      ["控制行", row],
    ]) {
      if (r && (r.y < barRect.top - 1 || r.y + r.h > barRect.bottom + 1)) {
        issues.push(`底栏${label}超出范围: y=${r.y} h=${r.h} bar=[${Math.round(barRect.top)},${Math.round(barRect.bottom)}]`);
      }
    }
  }

  /* 4.2 标题栏：设置按钮在主题切换右侧；侧边栏底部不再有设置入口 */
  const themeBtn = rect("#btn-theme-toggle");
  const settingsBtn = rect("#btn-settings");
  info.titlebar = { themeBtn, settingsBtn };
  if (!settingsBtn) issues.push("标题栏缺少设置按钮");
  else if (themeBtn && settingsBtn.x < themeBtn.x) issues.push("标题栏设置按钮不在主题切换右侧");
  if (document.querySelector(".sidebar__foot")) issues.push("侧边栏底部仍存在旧的操作区");

  /* 4.3 沉浸模式：详情页不能有卡片边框；整窗背景层存在且可见 */
  const pv = document.getElementById("playerview");
  if (pv?.dataset.mode === "immersive" && pv.dataset.state === "opened") {
    const card = document.querySelector(".immersive__card");
    const cardStyle = card ? getComputedStyle(card) : null;
    info.immersive = cardStyle
      ? {
          background: cardStyle.backgroundColor,
          borderWidth: cardStyle.borderTopWidth,
          boxShadow: cardStyle.boxShadow,
        }
      : null;
    if (cardStyle) {
      if (cardStyle.borderTopWidth !== "0px") issues.push(`沉浸模式歌词区仍有边框: ${cardStyle.borderTopWidth}`);
      if (cardStyle.backgroundColor !== "rgba(0, 0, 0, 0)") {
        issues.push(`沉浸模式歌词区仍有背景色: ${cardStyle.backgroundColor}`);
      }
      if (cardStyle.boxShadow !== "none") issues.push(`沉浸模式歌词区仍有阴影: ${cardStyle.boxShadow}`);
    }
    const bg = document.querySelector(".immersive-bg");
    const bgRect = bg ? bg.getBoundingClientRect() : null;
    info.immersiveBg = bgRect
      ? { hidden: bg.hidden, w: Math.round(bgRect.width), h: Math.round(bgRect.height) }
      : null;
    if (!bg || bg.hidden) issues.push("沉浸模式缺少整窗背景层");
    else if (bgRect.width < vw - 1 || bgRect.height < vh - 1) {
      issues.push(`沉浸背景未铺满窗口: ${Math.round(bgRect.width)}x${Math.round(bgRect.height)} ≠ ${vw}x${vh}`);
    }
    // 标题栏与播放控件在沉浸模式下不能有实色背景
    const barBg = playerbarEl ? getComputedStyle(playerbarEl).backgroundColor : "";
    const tbBg = getComputedStyle(document.querySelector(".titlebar")).backgroundColor;
    if (barBg !== "rgba(0, 0, 0, 0)") issues.push(`沉浸模式播放控件仍有背景色: ${barBg}`);
    if (tbBg !== "rgba(0, 0, 0, 0)") issues.push(`沉浸模式标题栏仍有背景色: ${tbBg}`);
  }

  /* 4.4 歌词区：能滚动（内容高度超过容器）且当前行已定位 */
  const lyrScroll = document.querySelector("#pv-lyrics .lyrics__scroll");
  if (lyrScroll && pv?.dataset.state === "opened") {
    const scrollable = lyrScroll.scrollHeight - lyrScroll.clientHeight;
    const active = lyrScroll.querySelector('.lyric[aria-current="true"]');
    info.lyrics = {
      scrollHeight: lyrScroll.scrollHeight,
      clientHeight: lyrScroll.clientHeight,
      scrollTop: Math.round(lyrScroll.scrollTop),
      hasActive: Boolean(active),
    };
    if (lyrScroll.scrollHeight <= lyrScroll.clientHeight) {
      issues.push("歌词区不可滚动（内容没有超出容器）");
    }
    if (!active && lyrScroll.querySelector(".lyric")) {
      issues.push("歌词区没有定位到当前行");
    }
    if (active && scrollable > 0 && lyrScroll.scrollTop === 0) {
      const activeTop = active.offsetTop;
      if (activeTop > lyrScroll.clientHeight) issues.push("歌词未自动滚动到当前行");
    }
  }

  /* 5. 对比度（抽样正文与次要文字） */
  const textChecks = [
    [".content-header__title", "标题"],
    [".track__title", "曲目标题"],
    [".track__time", "时长"],
    [".navitem__text", "侧边栏文字"],
  ];
  info.contrast = {};
  for (const [sel, label] of textChecks) {
    const n = document.querySelector(sel);
    if (!n) continue;
    const st = getComputedStyle(n);
    const fg = parseColor(st.color);
    if (!fg) continue;
    // 以应用底色为背景近似（毛玻璃面板透明度低，误差可接受）
    const bg = parseColor(getComputedStyle(document.body).backgroundColor) || { r: 8, g: 8, b: 10 };
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    info.contrast[label] = Number(ratio.toFixed(2));
    const threshold = sel === ".track__time" || sel === ".navitem__text" ? 2.2 : 3.5;
    if (ratio < threshold) issues.push(`${label} 对比度偏低: ${ratio.toFixed(2)} (阈值 ${threshold})`);
  }

  /* 6. 曲目行数 / 列对齐 */
  const rows = document.querySelectorAll(".track");
  info.trackRows = rows.length;
  if (rows.length) {
    const first = rows[0].getBoundingClientRect();
    const head = document.querySelector(".tracks__head")?.getBoundingClientRect();
    if (head && Math.abs(first.left - head.left) > 1) issues.push("表头与行左边界不对齐");
    const rowH = parseFloat(cs.getPropertyValue("--row-h"));
    if (Math.abs(first.height - rowH) > 2) issues.push(`行高 ${Math.round(first.height)}px ≠ 设计 ${rowH}px`);
  }

  /* 6b. 表头与数据行的网格列模板必须一致
     列数/宽度只要有一处对不上，表头每个单元格就会整体错位一格
     （例如「标题」跑到曲名那一列、看起来像钻进了正文里），
     而左边界仍然是对齐的，所以必须单独比较网格模板。 */
  const headEl = document.querySelector(".tracks__head");
  const bodyRow = document.querySelector(".tracks__body .track");
  if (headEl && bodyRow) {
    const headCols = getComputedStyle(headEl).gridTemplateColumns;
    const rowCols = getComputedStyle(bodyRow).gridTemplateColumns;
    info.gridColumns = { head: headCols, row: rowCols };
    if (headCols !== rowCols) {
      const n = (s) => s.split(/\s+/).filter(Boolean).length;
      issues.push(
        `表头与数据行网格列不一致（表头 ${n(headCols)} 列 / 行 ${n(rowCols)} 列），表头会错位`
      );
    }
  }

  /* 6c. 表头吸顶是否真的生效
     --------------------------------------------------------------------
     这里**不能**断言 top > 0。滚动容器是 .content-body，而 .content-header
     是 .main 网格里的独立一行、位于滚动容器之外，所以吸顶参照物就是
     .content-body 自己的 padding 盒 —— top: 0 才是正确的值
     （写成 --h-header 反而会把表头往下推进第一行数据里，见 tracktable.css 注释）。

     真正要防的是「sticky 静默失效」：祖先元素只要出现 overflow: hidden /
     auto / scroll，它就会成为最近的可滚动祖先，sticky 便跟着内容一起滚走。
     所以这里改成检查祖先链上没有意外的滚动容器（overflow: clip 不算）。 */
  if (headEl) {
    const bodyEl = document.getElementById("content-body");
    const scroller = nearestScrollAncestor(headEl);
    info.stickyHead = {
      top: parseFloat(getComputedStyle(headEl).top),
      scroller: scroller ? scroller.className || scroller.tagName : null,
    };
    if (bodyEl && !bodyEl.contains(headEl)) {
      issues.push("表头不在滚动容器 .content-body 内，无法吸顶");
    } else if (scroller && scroller !== bodyEl) {
      issues.push(
        `表头被 .${scroller.className || scroller.tagName} 截成了滚动容器，sticky 会失效（该祖先应使用 overflow: clip）`
      );
    }
  }

  /* 6d. 表头内部不能被撑高：grid 行高必须与表头盒子高度一致
     表头只有 34px，若某个子元素（典型是漏了尺寸的 <svg>，浏览器会退到
     SVG 默认的 300×150）把 grid 隐式行撑高，align-items:center 就会把
     表头文字居中到那个高行里 —— 表现为文字整体下移约 1.5 行。 */
  if (headEl) {
    const rows = getComputedStyle(headEl).gridTemplateRows;
    const rowPx = rows.split(/\s+/).map(parseFloat).filter((n) => !Number.isNaN(n));
    const maxRow = rowPx.length ? Math.max(...rowPx) : 0;
    info.headGrid = { height: headEl.getBoundingClientRect().height, rows, maxRow };
    if (maxRow > headEl.getBoundingClientRect().height + 1) {
      issues.push(
        `表头内部行高 ${Math.round(maxRow)}px 超过表头高度 ${Math.round(headEl.getBoundingClientRect().height)}px，表头文字会被推下`
      );
    }
    // 顺带把"尺寸失控的图标"直接点名（宽>100 或 高>50 基本只有 SVG 默认尺寸会造成）
    const huge = Array.from(headEl.querySelectorAll("svg, img")).filter((n) => {
      const r = n.getBoundingClientRect();
      return r.width > 100 || r.height > 50;
    });
    for (const n of huge) {
      const r = n.getBoundingClientRect();
      issues.push(
        `表头内图标尺寸失控 ${Math.round(r.width)}×${Math.round(r.height)}（容器 .${n.parentElement?.className}），应显式给宽高`
      );
    }
  }

  /* 7. chrome 渐变是否生效（标题栏与播放控件共用主界面渐变，不自铺底色） */
  const bar = document.querySelector(".playerbar");
  const barStyle = bar ? getComputedStyle(bar) : null;
  info.backdropFilter = barStyle?.backdropFilter || barStyle?.webkitBackdropFilter || "none";
  info.chromeGradient = {
    top: getComputedStyle(document.getElementById("app"), "::before").backgroundImage,
    bottom: getComputedStyle(document.getElementById("app"), "::after").backgroundImage,
    titlebarBg: getComputedStyle(document.querySelector(".titlebar")).backgroundColor,
    playerbarBg: barStyle?.backgroundColor ?? "",
  };
  if (!/gradient/.test(info.chromeGradient.top)) issues.push("顶部 chrome 渐变未生效");
  if (!/gradient/.test(info.chromeGradient.bottom)) issues.push("底部 chrome 渐变未生效");
  if (info.chromeGradient.titlebarBg !== "rgba(0, 0, 0, 0)") {
    issues.push(`标题栏不应自铺底色: ${info.chromeGradient.titlebarBg}`);
  }
  if (info.chromeGradient.playerbarBg !== "rgba(0, 0, 0, 0)") {
    issues.push(`播放控件不应自铺底色: ${info.chromeGradient.playerbarBg}`);
  }

  const report = {
    ok: issues.length === 0,
    issues,
    info,
    viewport: { vw, vh },
    theme: document.documentElement.dataset.theme,
  };

  const pre = document.createElement("pre");
  pre.id = "probe-report";
  pre.textContent = JSON.stringify(report, null, 2);
  document.body.appendChild(pre);
  document.title = issues.length ? `PROBE-FAIL(${issues.length})` : "PROBE-OK";
  return report;
}
