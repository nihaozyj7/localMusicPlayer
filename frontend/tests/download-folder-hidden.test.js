/* ==========================================================================
   download-folder-hidden.test.js — 隐式下载根不进「文件夹」列表
   --------------------------------------------------------------------------
   下载目录由程序管理：`EffectiveFolders() = 用户文件夹 + 下载目录`，所以曲库
   会扫它（下载完的歌直接出现在「本地歌曲」里），但它**不是用户添加的文件夹**，
   也不在 `config.Folders` 里。

   用户报的现象：添加歌曲路径时，下载目录赫然出现在扫描路径列表里，
   而且那一行的「移除」永远失败（不在配置里，删不掉）。

   这里守住两件事：
     · Go 侧 `LibraryService.Folders()` 把隐式下载根滤掉（界面唯一的数据来源）；
     · 前端即使从 localStorage 里翻出旧版本存下的那一行，也不会渲染出来。
    ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { DOWNLOAD_FOLDER_ID, userFolders } from "../src/js/store.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("userFolders：滤掉隐式下载根，其余原样保留", () => {
  const list = [
    { id: "auto_downloads", path: "C:/Users/me/Music/downloads" },
    { id: "f1", path: "D:/Music" },
  ];
  const out = userFolders(list);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "f1");
  // 一共就一个用户文件夹，输入数组不能被就地改动
  assert.equal(list.length, 2);
});

test("userFolders：没有下载根时不下手，空输入也安全", () => {
  const only = [{ id: "f1", path: "D:/Music" }];
  assert.deepEqual(userFolders(only), only);
  assert.deepEqual(userFolders([]), []);
  assert.deepEqual(userFolders(undefined), []);
});

test("DOWNLOAD_FOLDER_ID 必须与 Go 侧 bootstrap.DownloadFolderID 一致", () => {
  const go = readFileSync(join(root, "internal/bootstrap/config.go"), "utf8");
  const m = go.match(/DownloadFolderID\s*=\s*"([^"]+)"/);
  assert.ok(m, "Go 侧找不到 DownloadFolderID —— 常量被改名了？");
  assert.equal(DOWNLOAD_FOLDER_ID, m[1], "两端的隐式下载根 id 必须一致（它决定哪些行被滤掉）");
});

test("Go 侧 Folders() 把隐式下载根挡在界面之外", () => {
  const src = readFileSync(join(root, "services.go"), "utf8");
  const start = src.indexOf("func (s *LibraryService) Folders()");
  assert.ok(start > 0, "services.go 里找不到 LibraryService.Folders()");
  const body = src.slice(start, src.indexOf("\n}", start));
  assert.match(body, /bootstrap\.DownloadFolderID/, "Folders() 没有滤掉隐式下载根 —— 它会重新出现在设置界面里");
  // 曲库真正扫描哪些根仍然由 EffectiveFolders 决定，这个方法只影响「界面上列什么」
  assert.doesNotMatch(body, /EffectiveFolders/, "Folders() 是界面口径，不该改成直接返回扫描根");
});

test("「添加文件夹」不再有「选择器打不开 → 手输路径」的回退", () => {
  const src = readFileSync(join(root, "frontend/src/js/settings.js"), "utf8");
  const start = src.indexOf('case "add-folder"');
  assert.ok(start > 0, "settings.js 里找不到 add-folder 分支");
  const body = src.slice(start, src.indexOf('case "remove-folder"', start));
  assert.ok(body.length > 100, "add-folder 分支看起来不完整");

  // 只有浏览器预览模式那一段才允许手输路径，且必须在 isWails() 分支之外/之后
  const wailsAt = body.indexOf("if (isWails())");
  const promptAt = body.indexOf("promptPath(");
  assert.ok(wailsAt > 0, "add-folder 里找不到 isWails() 分支");
  assert.ok(promptAt > wailsAt, "桌面模式里又出现了手输路径回退 —— 用户点「取消」会被追着要路径");
});

test("取消是正常结果：Go 侧把「用户取消」与真失败分开", () => {
  const src = readFileSync(join(root, "services.go"), "utf8");
  assert.match(src, /func isDialogCancelled\(/, "services.go 里找不到 isDialogCancelled");
  assert.ok(
    src.includes("cancelled by user"),
    "isDialogCancelled 没有按 Wails 的错误文本判定（那个包在 internal 下，取不到变量）"
  );
});
