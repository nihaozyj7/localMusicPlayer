/* ==========================================================================
   fetch-ffmpeg.mjs — 下载内置 ffmpeg（静态构建，单文件，无需 DLL）
   --------------------------------------------------------------------------
   为什么需要：
     打包后的应用要开箱即用（转码 + 响度测量都依赖 ffmpeg），因此把 ffmpeg
     编译进 exe。二进制约 155MB，不适合入库，所以放在这里按需下载。

   产出：internal/ffmpeg/bin/ffmpeg.exe
   说明：只有带 production 构建标签（wails3 build 默认会加）的构建才会
         用 go:embed 把它编译进去；日常开发与测试不受影响。

   用法：
     node tools/fetch-ffmpeg.mjs            # 已存在则跳过
     node tools/fetch-ffmpeg.mjs --force    # 强制重新下载

   许可提示：这里下载的是 GPL 构建版，许可证随二进制一起放在
             internal/ffmpeg/bin/FFMPEG-LICENSE.txt，分发时请保留。
   ========================================================================== */

import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BIN_DIR = path.join(ROOT, "internal", "ffmpeg", "bin");
const TARGET = path.join(BIN_DIR, "ffmpeg.exe");
const LICENSE = path.join(BIN_DIR, "FFMPEG-LICENSE.txt");

// 用固定版本号而不是 latest，保证多次构建拿到同一份二进制（可复现）
const RELEASE = process.env.MP_FFMPEG_RELEASE || "latest";
const ASSET = process.env.MP_FFMPEG_ASSET || "ffmpeg-n8.1-latest-win64-gpl-8.1.zip";
const URL_ = `https://github.com/BtbN/FFmpeg-Builds/releases/download/${RELEASE}/${ASSET}`;

const force = process.argv.includes("--force");

async function main() {
  mkdirSync(BIN_DIR, { recursive: true });

  if (!force && existsSync(TARGET)) {
    const mb = statSync(TARGET).size / 1024 / 1024;
    console.log(`[ffmpeg] 已存在，跳过下载：${TARGET}（${mb.toFixed(1)} MB）`);
    console.log("[ffmpeg] 需要重新下载请加 --force");
    return;
  }

  console.log(`[ffmpeg] 下载 ${ASSET}`);
  console.log(`[ffmpeg] 来源 ${URL_}`);
  console.log("[ffmpeg] 约 183MB，只取其中的 ffmpeg.exe，请耐心等待…");

  const res = await fetch(URL_, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`下载失败: HTTP ${res.status} ${res.statusText}`);
  }

  const total = Number(res.headers.get("content-length") || 0);
  let seen = 0;
  let lastLog = 0;

  const zipPath = path.join(BIN_DIR, "ffmpeg-download.zip");
  const body = Readable.fromWeb(res.body);
  body.on("data", (chunk) => {
    seen += chunk.length;
    const now = Date.now();
    if (now - lastLog > 2000) {
      lastLog = now;
      const pct = total ? ` (${((seen / total) * 100).toFixed(1)}%)` : "";
      process.stdout.write(`\r[ffmpeg] 已下载 ${(seen / 1024 / 1024).toFixed(1)}MB${pct}   `);
    }
  });
  await pipeline(body, createWriteStream(zipPath));
  process.stdout.write("\n");

  // 解压：优先用 Expand-Archive（Windows 自带），失败则退回 tar
  const extractDir = path.join(BIN_DIR, "_extract");
  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });

  console.log("[ffmpeg] 解压中…");
  extractZip(zipPath, extractDir);

  const found = findFile(extractDir, "ffmpeg.exe");
  if (!found) {
    throw new Error("压缩包里没找到 ffmpeg.exe");
  }
  const license = findFile(extractDir, "LICENSE.txt");

  // 复制到目标位置
  const { copyFileSync } = await import("node:fs");
  copyFileSync(found, TARGET);
  if (license) copyFileSync(license, LICENSE);

  rmSync(extractDir, { recursive: true, force: true });
  rmSync(zipPath, { force: true });

  const mb = statSync(TARGET).size / 1024 / 1024;
  console.log(`[ffmpeg] 完成：${TARGET}（${mb.toFixed(1)} MB）`);

  // 记录版本信息，便于排查「内置的是哪一版」
  const version = safeVersion(TARGET);
  if (version) {
    writeFileSync(path.join(BIN_DIR, "VERSION.txt"), `${ASSET}\n${version}\n`, "utf8");
    console.log(`[ffmpeg] 版本：${version.split("\n")[0]}`);
  }
}

function extractZip(zipPath, dest) {
  // Windows 上优先 PowerShell，其它平台用 unzip
  if (process.platform === "win32") {
    execFileSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${dest}' -Force`],
      { stdio: "inherit" }
    );
    return;
  }
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", dest], { stdio: "inherit" });
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findFile(full, name);
      if (nested) return nested;
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      return full;
    }
  }
  return null;
}

function safeVersion(exe) {
  try {
    const out = execFileSync(exe, ["-hide_banner", "-version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.split("\n").slice(0, 3).join("\n");
  } catch {
    return "";
  }
}

main().catch((err) => {
  console.error(`\n[ffmpeg] 失败: ${err.message}`);
  console.error("[ffmpeg] 可以手动下载静态构建，把 ffmpeg.exe 放到 internal/ffmpeg/bin/ 即可：");
  console.error("         https://github.com/BtbN/FFmpeg-Builds/releases");
  process.exit(1);
});
