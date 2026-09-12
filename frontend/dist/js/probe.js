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
  // 播放界面打开时侧边栏会被收起（宽度 0），此时不再校验侧边栏宽度
  const playerOpen = document.getElementById("app")?.dataset.view === "player";
  const expect = {
    ".titlebar": { h: parseFloat(cs.getPropertyValue("--h-titlebar")) },
    ".sidebar": { w: playerOpen ? 0 : parseFloat(cs.getPropertyValue("--w-sidebar")) },
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

  /* 7. 毛玻璃是否真的生效 */
  const bar = document.querySelector(".playerbar");
  const barStyle = bar ? getComputedStyle(bar) : null;
  info.backdropFilter = barStyle?.backdropFilter || barStyle?.webkitBackdropFilter || "none";
  if (barStyle && !/blur/.test(info.backdropFilter)) issues.push("底栏未应用毛玻璃 backdrop-filter");

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
