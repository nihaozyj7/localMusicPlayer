/* ==========================================================================
   downloads.js — 下载任务的真源与动作（渲染在 ui/panels.js）
   --------------------------------------------------------------------------
   需求：
     1. 标题栏有一个下载按钮，**存在下载任务时才显示**；
     2. 点它弹出「下载任务」面板，显示当前的下载任务（进度 / 结果 / 失败原因）。

   真源在后端：DownloadService 为每次下载留一条 DownloadTask 快照，
   并通过 `download:tasks` 事件把整份列表推过来。前端**不自己累计进度**——
   进度事件是节流过的，前端自己拼极易出现「暂停在 87%」的错觉。

   迁移点：这个模块以前自己 `$("#download-panel-body").innerHTML = …`，
   还自己管 hidden / data-state。现在它只维护数据 + 版本号，
   渲染交给 <mp-download-panel> / <mp-titlebar>（它们把版本号放进依赖数组）。
   ========================================================================== */

import { backend, isWails, on } from "./bridge.js";
import { toast } from "./ui/overlays.js";
import { requestAppUpdate } from "./ui/base.js";

/** 后端推来的任务列表（保持后端顺序：先发的在前） */
let tasks = [];
/** 面板是否展开 */
let open = false;
/** 数据版本号：组件把它放进依赖数组（非 store 数据的响应式入口） */
let revision = 0;

/**
 * 收到过多少次后端推送。
 *
 * 用于识别「首次拉取的结果已经过期」：事件订阅在 fetch 之前注册，若 fetch 期间
 * 来了新事件，fetch 回来的就是更旧的快照，直接覆盖会让面板回退（出现「进度倒退」）。
 */
let eventSeq = 0;

function bump() {
  revision += 1;
  requestAppUpdate();
}

export function downloadsSnapshot() {
  const running = tasks.filter((t) => t?.state === "running").length;
  return {
    tasks,
    running,
    revision,
    open,
    // 入口按钮只在存在任务时出现
    visible: tasks.length > 0,
    badge: running > 0 ? String(running) : "",
  };
}

export function toggleDownloadPanel(force) {
  open = typeof force === "boolean" ? force : !open;
  bump();
}

export function closeDownloadPanel() {
  toggleDownloadPanel(false);
}

export async function clearFinishedDownloads() {
  if (!isWails()) {
    tasks = tasks.filter((t) => t?.state === "running");
    bump();
    return;
  }
  try {
    const res = await backend.downloadClearFinished();
    applySnapshot(res);
  } catch (err) {
    toast(`清除失败：${err?.message ?? err}`, { tone: "error" });
  }
}

export function openDownloadDir() {
  const dir = tasks.find((t) => t?.dir)?.dir || "";
  backend.downloadOpenDir(dir).catch((err) => toast(`打开目录失败：${err?.message ?? err}`, { tone: "error" }));
}

/** 点某条已完成的下载 → 在文件管理器里定位到那个文件 */
export function openDownloadLocation(id) {
  const task = tasks.find((t) => t.id === id);
  const target = task?.path || task?.dir;
  if (!target) return;
  backend.downloadOpenDir(target).catch((err) => toast(`打开失败：${err?.message ?? err}`, { tone: "error" }));
}

/* --------------------------------------------------------------------------
   与后端同步
   -------------------------------------------------------------------------- */
function applySnapshot(payload) {
  if (!payload || !Array.isArray(payload.tasks)) return;
  tasks = payload.tasks;
  bump();
}

/** 对外接口：在 main.js 里显式调用（按钮与面板都依赖它） */
export async function initDownloads() {
  // 后端推整份任务快照，前端只做覆盖
  on("download:tasks", (payload) => {
    eventSeq += 1;
    applySnapshot(payload);
  });

  if (!isWails()) {
    if (seedPreviewTasks()) {
      bump();
      open = true;
      bump();
      return;
    }
    bump();
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
