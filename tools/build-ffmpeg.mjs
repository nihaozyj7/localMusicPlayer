/* ==========================================================================
   build-ffmpeg.mjs — 从源码编译「只含本项目所需能力」的精简 ffmpeg
   --------------------------------------------------------------------------
   为什么要自己编译：
     之前直接下载 BtbN 的通用静态构建，单文件 155MB（GPL），把产物撑到 168MB。
     本项目其实只用到很小一部分能力，自己编译后：
        · 体积 155MB → 5.6MB（产物 167.6MB → 18.0MB）
        · 许可证 GPLv3 → LGPL-2.1+（不带任何 GPL 组件）
        · 可复现：版本号固定在 SOURCE_VERSION，任何人都能编译出同样的东西

   实际用到的能力（要改这里的清单，请先确认代码里没有别的依赖）：
     · 解码：各种音频解码器（响度测量、转码都要完整解码一遍）
     · 滤镜：loudnorm（EBU R128 测量）、aresample/aformat（转码重采样）
     · 编码：pcm_s16le、flac
     · 封装：pcm_s16le / pcm_f32le（裸 PCM，WAV 头由 Go 自己写）、wav、flac、null

   前置条件（Windows）：
     · MinGW-w64（gcc + nasm + mingw32-make）—— 用 MSYS 的 bash 驱动
     · 一个 POSIX shell（Git for Windows 自带的 PortableGit 即可）
     路径通过下面的常量配置，必要时用环境变量覆盖：
       MP_MINGW_BIN   MinGW 的 bin 目录
       MP_BASH        bash.exe 的路径
       MP_FFMPEG_SRC  ffmpeg 源码目录（默认 build/ffmpeg/ffmpeg-<版本>）

   用法：
     node tools/build-ffmpeg.mjs              # 已有产物则跳过
     node tools/build-ffmpeg.mjs --force      # 强制重新编译
     node tools/build-ffmpeg.mjs --download   # 只下载并解压源码，不编译

   许可提示：本构建**未启用 --enable-gpl/--enable-nonfree**，因此是
             LGPL-2.1-or-later。许可证说明见 internal/ffmpeg/bin/FFMPEG-LICENSE.txt，
             分发时请保留。（对照：FFmpeg 的 AAC 解码器与 loudnorm 滤镜都是 LGPL，
             所以能既小又不引入 GPL 义务。）
   ========================================================================== */

import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BIN_DIR = path.join(ROOT, "internal", "ffmpeg", "bin");
const TARGET = path.join(BIN_DIR, "ffmpeg.exe");
const BUILD_DIR = path.join(ROOT, "build", "ffmpeg");

/* 固定版本，保证可复现 */
const SOURCE_VERSION = process.env.MP_FFMPEG_VERSION || "8.1.2";
const SOURCE_DIR = path.join(BUILD_DIR, `ffmpeg-${SOURCE_VERSION}`);
const TARBALL = path.join(BUILD_DIR, `ffmpeg-${SOURCE_VERSION}.tar.xz`);
const SOURCE_URL = `https://ffmpeg.org/releases/ffmpeg-${SOURCE_VERSION}.tar.xz`;

const MINGW_BIN = process.env.MP_MINGW_BIN || "C:\\Users\\Example\\Application\\mingw64\\bin";
const BASH = process.env.MP_BASH || "C:\\Users\\Example\\Application\\PortableGit\\usr\\bin\\bash.exe";

const force = process.argv.includes("--force");
const downloadOnly = process.argv.includes("--download");
const infoOnly = process.argv.includes("--info");

/** Windows 路径 → MSYS 风格（C:\a\b → /c/a/b） */
function toMsys(p) {
  const abs = path.resolve(p).replace(/\\/g, "/");
  return "/" + abs[0].toLowerCase() + abs.slice(2);
}

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

/* ------------------------------------------------------------------ 下载 */
async function download() {
  // 源码包与解压结果跟 --force 无关：重新编译不需要重新下载。
  // 要重新下载请手动删掉 build/ffmpeg/*.tar.xz。
  if (existsSync(TARBALL)) {
    const mb = statSync(TARBALL).size / 1024 / 1024;
    console.log(`[ffmpeg] 源码包已存在，跳过下载（${mb.toFixed(1)} MB）`);
    return;
  }
  mkdirSync(BUILD_DIR, { recursive: true });
  console.log(`[ffmpeg] 下载源码 ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length") || 0);
  let got = 0;
  // 只在整 MB 变化时打一行，避免刷屏（日志/后台任务里逐字节刷新会淹掉输出）
  let lastMark = -1;
  const body = Readable.fromWeb(res.body);
  body.on("data", (c) => {
    got += c.length;
    const mark = Math.floor(got / 1048576);
    if (mark !== lastMark) {
      lastMark = mark;
      console.log(`[ffmpeg]   ${mark} / ${total ? Math.round(total / 1048576) : "?"} MB`);
    }
  });
  await pipeline(body, createWriteStream(TARBALL));
  console.log("[ffmpeg] 下载完成");
}

function extract() {
  if (existsSync(path.join(SOURCE_DIR, "configure"))) {
    console.log("[ffmpeg] 源码已解压，跳过");
    return;
  }
  console.log("[ffmpeg] 解压源码…");
  rmSync(SOURCE_DIR, { recursive: true, force: true });
  run(BASH, ["-c", `cd '${toMsys(BUILD_DIR)}' && tar -xf '${path.basename(TARBALL)}'`]);
}

/* ------------------------------------------------------------------ 编译 */
function build() {
  const script = path.join(BUILD_DIR, "build-minimal.sh");
  console.log("[ffmpeg] 开始编译（首次约 6~10 分钟，其中 configure 约 2~3 分钟）…");
  run(BASH, ["-c", `cd '${toMsys(ROOT)}' && bash '${toMsys(script)}'`], {
    env: { ...process.env, MP_MINGW_BIN: MINGW_BIN },
  });
}

/* ------------------------------------------------------------------ 校验 */
function verify() {
  if (!existsSync(TARGET)) throw new Error(`编译似乎成功但找不到产物：${TARGET}`);
  const mb = statSync(TARGET).size / 1048576;

  // 体积护栏：精简构建应该在个位数 MB，超过说明 configure 漏关了东西
  if (mb > 30) {
    console.warn(`[ffmpeg] 警告：产物 ${mb.toFixed(1)} MB，远大于预期（约 5~6 MB），检查 configure 选项是否被改动`);
  }

  // 能力自检：确认三条调用路径需要的组件都在
  const out = execFileSync(TARGET, ["-hide_banner", "-L"], { encoding: "utf8" });
  const licence = /GNU Lesser General Public/i.test(out) ? "LGPL-2.1+" : "非 LGPL（检查是否误开了 --enable-gpl）";
  console.log(`[ffmpeg] ✓ 产物 ${TARGET}（${mb.toFixed(2)} MB，${licence}）`);
  if (licence !== "LGPL-2.1+") {
    console.warn("[ffmpeg] 警告：许可证不是 LGPL —— 若并非有意启用 GPL 组件，请检查 configure 参数");
  }
  return { mb, licence };
}

/**
 * 从 ffmpeg 的列表输出里抠出条目名。
 *
 * 三种列表的列格式各不相同，但规则可以统一：
 *   · 图例行都含 " = "（如 " A..... = Audio"）→ 跳过
 *   · 分隔行是 " ---" → 跳过
 *   · 只有一列（-protocols）→ 整行就是名字，如 "  pipe"
 *   · 有多列（-decoders/-muxers/-filters）→ 取第二列
 *       -decoders : " A..... aac            AAC (Advanced Audio Coding)"
 *       -muxers   : "  E  f32le           PCM 32-bit floating-point little-endian"
 *       -filters  : " TSC loudnorm        EBU R128 loudness normalization"
 */
function parseListing(text) {
  const names = [];
  for (const raw of text.split("\n")) {
    if (raw.includes(" = ")) continue; // 图例
    if (/^\s*-{3,}\s*$/.test(raw)) continue; // 分隔线
    const parts = raw.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    if (parts.some((p) => p.includes(":"))) continue; // "Input:" / "Supported file protocols:"
    if (/^-+$/.test(parts[0])) continue;
    // 单列（协议）取第一部分；多列取第二部分（第一部分是能力标记）
    const name = parts.length === 1 ? parts[0] : parts[1];
    if (name && name !== "=") names.push(name);
  }
  // -protocols 会分别列 Input 与 Output，去重
  return [...new Set(names)];
}

/** 读取能力清单（唯一事实来源），用于核对实际产物 */
function readFeatures() {
  const file = path.join(BUILD_DIR, "features.env");
  if (!existsSync(file)) return null;
  const out = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}

/** 只报告当前状态，不编译 */
function report() {
  if (!existsSync(TARGET)) {
    console.log("[ffmpeg] 尚未编译内置 ffmpeg，运行 `node tools/build-ffmpeg.mjs` 生成");
    return;
  }
  const mb = statSync(TARGET).size / 1048576;
  const out = execFileSync(TARGET, ["-hide_banner", "-L"], { encoding: "utf8" });
  const lgpl = /GNU Lesser General Public/i.test(out);
  console.log(`[ffmpeg] ${TARGET}`);
  console.log(`         体积 ${mb.toFixed(2)} MB    许可证 ${lgpl ? "LGPL-2.1-or-later" : "非 LGPL"}`);

  const actual = {
    解码器: parseListing(execFileSync(TARGET, ["-hide_banner", "-decoders"], { encoding: "utf8" })),
    封装器: parseListing(execFileSync(TARGET, ["-hide_banner", "-muxers"], { encoding: "utf8" })),
    滤镜: parseListing(execFileSync(TARGET, ["-hide_banner", "-filters"], { encoding: "utf8" })),
    协议: parseListing(execFileSync(TARGET, ["-hide_banner", "-protocols"], { encoding: "utf8" })),
  };
  console.log("         实际能力:");
  for (const [label, names] of Object.entries(actual)) {
    console.log(`           ${label}(${names.length}): ${names.join(", ")}`);
  }

  // 与 features.env 核对：清单里要求的能力是否真的都在
  const want = readFeatures();
  if (!want) {
    console.log("\n         （找不到 build/ffmpeg/features.env，跳过清单核对）");
    return;
  }
  const expect = {
    解码器: (want.DECODERS || "").split(","),
    封装器: (want.MUXERS || "").split(",").map((n) => n.replace(/^pcm_/, "")),
    滤镜: (want.FILTERS || "").split(","),
    协议: (want.PROTOCOLS || "").split(","),
  };
  const missing = [];
  for (const [label, names] of Object.entries(expect)) {
    for (const n of names) {
      if (n && !actual[label].includes(n)) missing.push(`${label}:${n}`);
    }
  }
  console.log("");
  if (missing.length) {
    console.log(`         ✗ 清单里有 ${missing.length} 项没编进去: ${missing.join(", ")}`);
    console.log("           检查 configure 是否失败，或 features.env 里的名字写错（muxer 需带 pcm_ 前缀）");
    process.exitCode = 1;
  } else {
    console.log("         ✓ 清单里的能力全部就位");
  }
}

async function main() {
  if (infoOnly) {
    report();
    return;
  }
  if (!existsSync(BASH)) {
    console.error(`[ffmpeg] 找不到 bash：${BASH}\n  请安装 Git for Windows，或设置 MP_BASH 指向 bash.exe`);
    process.exit(1);
  }
  if (!existsSync(path.join(MINGW_BIN, "gcc.exe"))) {
    console.error(`[ffmpeg] 找不到 MinGW gcc：${MINGW_BIN}\n  请安装 MinGW-w64，或设置 MP_MINGW_BIN`);
    process.exit(1);
  }

  if (!force && existsSync(TARGET)) {
    const mb = statSync(TARGET).size / 1048576;
    console.log(`[ffmpeg] 已存在，跳过编译：${TARGET}（${mb.toFixed(2)} MB）`);
    console.log("         要重新编译请加 --force");
    return;
  }

  await download();
  if (downloadOnly) {
    extract();
    console.log("[ffmpeg] 仅下载模式：源码已就绪，未编译");
    return;
  }
  extract();
  build();
  verify();
  console.log("[ffmpeg] 完成。production 构建会把该二进制编译进 exe。");
}

main().catch((err) => {
  console.error(`[ffmpeg] 失败：${err.message}`);
  process.exit(1);
});
