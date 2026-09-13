/* ==========================================================================
   downloads.js — 标题栏下载入口 + 下载任务面板
   --------------------------------------------------------------------------
   需求：
     1. 标题栏有一个下载按钮，**存在下载任务时才显示**；
     2. 点它弹出「下载任务」面板，显示当前的下载任务（进度 / 结果 / 失败原因）。

   真源在后端：DownloadService 为每次下载留一条 DownloadTask 快照，
   并通过 `download:tasks` 事件把整份列表推过来。前端**不自己累计进度**——
   进度事件是节流过的，前端自己拼极易出现「暂停在 87%」的错觉；
   推整份快照、直接覆盖本地列表最简单也最不容易错。

   入口按钮静态写在 index.html 里（设计约束 15：不要运行时 inject 按钮），
   这里只负责按任务数量控制 hidden 与角标。
   ========================================================================== */

import { $, toast } from "./dom.js";
import { backend, isWails, on } from "./bridge.js";
import { esc } from "./utils.js";

/** 后端推来的任务列表（保持后端顺序：先发的在前） */
let tasks = [];
/** 面板是否展开 */
let open = false;
let built = false;
/**
 * 收到过多少次后端推送。
 *
 * 用于识别「首次拉取的结果已经过期」：事件订阅在 fetch 之前注册，若 fetch 期间
 * 来了新事件，fetch 回来的就是更旧的快照，直接覆盖会让面板回退（出现「进度倒退」）。
 */
let eventSeq = 0;

let panelEl = null;
let bodyEl = null;
let countEl = null;
let clearBtn = null;
let badgeEl = null;
let buttonEl = null;

/* --------------------------------------------------------------------------
   小工具
   -------------------------------------------------------------------------- */
function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let x = v;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i += 1;
  }
  return `${x >= 10 || i === 0 ? Math.round(x) : x.toFixed(1)} ${units[i]}`;
}

function fileName(p) {
  const s = String(p || "");
  const at = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/"));
  return at >= 0 ? s.slice(at + 1) : s;
}

function runningTasks() {
  return tasks.filter((t) => t?.state === "running");
}

/* --------------------------------------------------------------------------
   DOM
   -------------------------------------------------------------------------- */
function build() {
  if (built) return true;
  buttonEl = $("#btn-downloads");
  panelEl = $("#download-panel");
  if (!buttonEl || !panelEl) return false;
  built = true;

  badgeEl = $("#download-badge");
  bodyEl = $("#download-panel-body");
  countEl = $("#download-panel-count");
  clearBtn = $("#download-clear");

  buttonEl.addEventListener("click", () => togglePanel());
  $("#download-close")?.addEventListener("click", () => closePanel());
  clearBtn?.addEventListener("click", clearFinished);
  // 打开下载目录：优先用任务自己的目录，没有任务时交给后端用配置值
  $("#download-open-dir")?.addEventListener("click", () => {
    const dir = tasks.find((t) => t?.dir)?.dir || "";
    backend.downloadOpenDir(dir).catch((err) => toast(`打开目录失败：${err?.message ?? err}`, { tone: "error" }));
  });

  // 点某条已完成的下载 → 在文件管理器里定位到那个文件
  bodyEl?.addEventListener("click", (e) => {
    const row = e.target.closest("[data-download-id]");
    if (!row) return;
    const task = tasks.find((t) => t.id === row.dataset.downloadId);
    const target = task?.path || task?.dir;
    if (!target) return;
    backend
      .downloadOpenDir(target)
      .catch((err) => toast(`打开失败：${err?.message ?? err}`, { tone: "error" }));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) closePanel();
  });

  return true;
}

/* --------------------------------------------------------------------------
   入口按钮
   -------------------------------------------------------------------------- */
function paintButton() {
  if (!buttonEl) return;
  // 「存在下载任务时显示这个按钮」：任务清空后按钮也跟着消失
  buttonEl.hidden = tasks.length === 0;
  const running = runningTasks().length;
  if (badgeEl) {
    badgeEl.hidden = running === 0;
    badgeEl.textContent = String(running);
  }
  buttonEl.dataset.tip = running
    ? `下载任务（${running} 个进行中）`
    : `下载任务（${tasks.length} 条记录）`;
}

/* --------------------------------------------------------------------------
   面板
   -------------------------------------------------------------------------- */
export function togglePanel(force) {
  const next = typeof force === "boolean" ? force : !open;
  if (next) openPanel();
  else closePanel();
}

export function openPanel() {
  if (!built && !build()) return;
  open = true;
  panelEl.hidden = false;
  // 先解除 hidden 再切 opened：同一帧里改，过渡不会触发
  requestAnimationFrame(() => panelEl.setAttribute("data-state", "opened"));
  buttonEl?.setAttribute("aria-pressed", "true");
  renderPanel();
}

export function closePanel() {
  open = false;
  buttonEl?.setAttribute("aria-pressed", "false");
  if (!panelEl) return;
  panelEl.setAttribute("data-state", "closed");
  setTimeout(() => {
    if (!open && panelEl) panelEl.hidden = true;
  }, 180);
}

function renderPanel() {
  if (!bodyEl) return;
  const running = runningTasks().length;
  if (countEl) countEl.textContent = running ? `${running} 个下载中` : `共 ${tasks.length} 个`;
  const hasFinished = tasks.some((t) => t?.state !== "running");
  if (clearBtn) clearBtn.disabled = !hasFinished;

  if (!tasks.length) {
    bodyEl.innerHTML = `<div class="download-panel__empty">还没有下载任务</div>`;
    return;
  }

  bodyEl.innerHTML = tasks
    .map((t) => {
      const state = t.state === "running" ? "running" : t.state === "failed" ? "failed" : "done";
      const total = Number(t.total) || 0;
      const done = Number(t.done) || 0;
      const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
      // 条宽走 data-value + CSS（项目约束：不写行内 style，见 settings.css 的同一套做法），
      // 按 5% 取整 —— 进度条本来也不该显示 1% 的差别。
      const bucket = Math.max(0, Math.min(100, Math.round(pct / 5) * 5));
      const active = state === "running";

      let stateText = `${pct}%`;
      if (state === "done") stateText = "已完成";
      else if (state === "failed") stateText = "失败";
      else if (total <= 0) stateText = "下载中";

      let meta = "";
      if (active) {
        meta = total > 0 ? `${fmtBytes(done)} / ${fmtBytes(total)}` : fmtBytes(done);
      } else if (state === "done") {
        meta = `${fmtBytes(done || total)} · ${esc(t.path ? fileName(t.path) : t.dir || "")}`;
      } else {
        meta = esc(t.message || "下载失败");
      }

      return `
      <div class="download-item" data-state="${state}" data-download-id="${esc(t.id)}"
        ${state === "done" ? `role="button" tabindex="0" data-tip="在文件夹中显示"` : ""}>
        <div class="download-item__title">${esc(t.title || t.bvid || "未命名")}</div>
        <div class="download-item__state">${esc(stateText)}</div>
        <div class="download-item__bar" ${active ? "" : "hidden"} data-unknown="${total > 0 ? "false" : "true"}">
          <div class="download-item__fill" data-value="${bucket}"></div>
        </div>
        <div class="download-item__meta${state === "failed" ? " download-item__meta--error" : ""}">${meta}</div>
      </div>`;
    })
    .join("");
}

/* --------------------------------------------------------------------------
   与后端同步
   -------------------------------------------------------------------------- */
function applySnapshot(payload) {
  if (!payload || !Array.isArray(payload.tasks)) return;
  tasks = payload.tasks;
  paintButton();
  if (open) renderPanel();
}

async function clearFinished() {
  if (!isWails()) {
    tasks = runningTasks();
    paintButton();
    renderPanel();
    return;
  }
  try {
    const res = await backend.downloadClearFinished();
    applySnapshot(res);
    renderPanel();
  } catch (err) {
    toast(`清除失败：${err?.message ?? err}`, { tone: "error" });
  }
}

/** 对外接口：在 main.js 里显式调用（按钮与面板都依赖它） */
export async function initDownloads() {
  if (!build()) {
    console.warn("[downloads] 缺少 #btn-downloads / #download-panel 容器");
    return;
  }
  // 后端推整份任务快照，前端只做覆盖
  on("download:tasks", (payload) => {
    eventSeq += 1;
    applySnapshot(payload);
  });

  if (!isWails()) {
    if (seedPreviewTasks()) {
      paintButton();
      openPanel();
      return;
    }
    paintButton();
    return;
  }
  const beforeFetch = eventSeq;
  try {
    const snapshot = await backend.downloadTasks();
    // 期间已经有推送进来过：以推送为准，别用更旧的快照覆盖
    if (eventSeq === beforeFetch) applySnapshot(snapshot);
  } catch (err) {
    console.info("[downloads] 拉取下载任务失败", err?.message ?? err);
  }
}

/* --------------------------------------------------------------------------
   浏览器预览：?downloads=1 灌一份假任务
   --------------------------------------------------------------------------
   与 main.js 里 ?scan=1 / ?playing=1 同一套做法：预览模式下没有后端，
   但下载按钮/面板的排版与状态色需要能单独定格出来（截图评审、无头自检）。
   真实模式永远走后端，这段不会执行。
   -------------------------------------------------------------------------- */
function seedPreviewTasks() {
  if (isWails()) return false;
  if (new URLSearchParams(location.search).get("downloads") !== "1") return false;
  tasks = [
    {
      id: "preview-1",
      bvid: "BV1xx411c7mD",
      title: "晴天 - 周杰伦",
      state: "running",
      done: 2310000,
      total: 4700000,
      dir: "C:\\Users\\Me\\Music\\downloads",
    },
    {
      id: "preview-2",
      bvid: "BV1yy411c7mE",
      title: "孤勇者 - 陈奕迅",
      state: "done",
      done: 3900000,
      total: 3900000,
      path: "C:\\Users\\Me\\Music\\downloads\\孤勇者 - 陈奕迅.m4a",
      dir: "C:\\Users\\Me\\Music\\downloads",
    },
    {
      id: "preview-3",
      bvid: "BV1zz411c7mF",
      title: "一首标题很长很长、长到面板里必须被省略号截断的测试歌曲",
      state: "failed",
      done: 120000,
      total: 5000000,
      message: "下载到的内容为空",
      dir: "C:\\Users\\Me\\Music\\downloads",
    },
  ];
  return true;
}

export const _internals = { fmtBytes, fileName, runningTasks };
