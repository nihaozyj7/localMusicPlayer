#!/usr/bin/env bash
# ============================================================================
#  build-minimal.sh — 编译只含本项目所需能力的精简 ffmpeg
# ----------------------------------------------------------------------------
#  为什么：通用静态构建（ffmpeg-n8.1 win64-gpl）有 155MB，而本项目只用到
#  很小一部分能力，导致产物被撑到 168MB。自己按需编译后：
#    体积 155MB → 5.6MB，许可证 GPLv3 → LGPL-2.1+，产物 168MB → 18MB
#
#  不需要的统统关掉：所有视频、所有硬件加速、网络、字幕、设备输入、
#  外部第三方库（x264/opus/fdk-aac…）。因此产物是 LGPL 而非 GPL。
#
#  能力清单见同目录 features.env（唯一事实来源）。
#
#  用法（在 MSYS bash 下）：
#    bash build/ffmpeg/build-minimal.sh [源码目录] [输出路径]
#  通常不用手动跑，直接：
#    node tools/build-ffmpeg.mjs
# ============================================================================
set -euo pipefail

# 脚本会被 cd 到源码目录，所以先把相对路径解析成绝对路径
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC_DIR="$REPO_ROOT/${1:-build/ffmpeg/ffmpeg-8.1.2}"
case "${1:-}" in
  /*) SRC_DIR="$1" ;;
esac
OUT="$REPO_ROOT/${2:-internal/ffmpeg/bin/ffmpeg.exe}"
case "${2:-}" in
  /*) OUT="$2" ;;
esac

# 工具链位置：正常由 tools/build-ffmpeg.mjs 通过 MP_MINGW_BIN 传进来（它会先找
# PATH 里的 gcc，再退到 C:\msys64\mingw64\bin）。直接跑本脚本时留空即可 ——
# 前提是 mingw64/bin 已经在 PATH 里，这也是 MinGW 安装器的默认做法。
# 这里刻意不写死任何人的绝对路径。
MINGW_BIN="${MP_MINGW_BIN:-}"
# Windows 路径 → MSYS 风格，否则 bash 里的 PATH 不认反斜杠
case "$MINGW_BIN" in
  [A-Za-z]:*)
    drive="$(echo "${MINGW_BIN:0:1}" | tr 'A-Z' 'a-z')"
    rest="$(echo "${MINGW_BIN:2}" | tr '\\' '/')"
    MINGW_BIN="/$drive$rest"
    ;;
esac

# ---------------------------------------------------------------- 能力清单
# shellcheck source=features.env
. "$REPO_ROOT/build/ffmpeg/features.env"

echo "== 精简构建 ffmpeg =="
echo "  源码: $SRC_DIR"
echo "  输出: $OUT"
echo "  能力: $(echo "$DECODERS" | tr ',' '\n' | wc -l) 个解码器 / $(echo "$FILTERS" | tr ',' '\n' | wc -l) 个滤镜"

cd "$SRC_DIR"

# 让 configure 与 make 都能找到 MinGW 工具链
# （MINGW_BIN 为空时保持原 PATH 不变，直接用它自己找到的 gcc）
if [ -n "$MINGW_BIN" ]; then
  export PATH="$MINGW_BIN:/usr/bin:/bin:$PATH"
fi
export CC=gcc
export AR=ar
export RANLIB=ranlib
export STRIP=strip
export NASM=nasm

./configure \
  --prefix=/tmp/ffmpeg-minimal \
  --arch=x86_64 \
  --target-os=mingw32 \
  --cc=gcc \
  --enable-static \
  --disable-shared \
  --enable-ffmpeg \
  --disable-ffprobe \
  --disable-ffplay \
  --disable-doc \
  --disable-debug \
  --disable-autodetect \
  --disable-network \
  --disable-everything \
  --disable-vulkan \
  --disable-cuda-llvm \
  --disable-cuda-nvcc \
  --disable-vaapi \
  --disable-dxva2 \
  --disable-d3d11va \
  --disable-videotoolbox \
  --disable-mediafoundation \
  --disable-opencl \
  --disable-mediacodec \
  --disable-amf \
  --disable-nvenc \
  --disable-v4l2-m2m \
  --disable-schannel \
  --disable-securetransport \
  --disable-iconv \
  --disable-sdl2 \
  --disable-xlib \
  --disable-zlib \
  --disable-bzlib \
  --disable-lzma \
  --disable-pixelutils \
  --enable-avcodec \
  --enable-avformat \
  --enable-avfilter \
  --enable-swresample \
  --disable-avdevice \
  --enable-decoder="$DECODERS" \
  --enable-demuxer="$DEMUXERS" \
  --enable-encoder="$ENCODERS" \
  --enable-muxer="$MUXERS" \
  --enable-filter="$FILTERS" \
  --enable-protocol="$PROTOCOLS" \
  --enable-parser="$PARSERS" \
  --enable-bsf="$BSFS" \
  --extra-cflags="-O2 -pipe -ffunction-sections -fdata-sections" \
  --extra-ldflags="-static -static-libgcc -Wl,--gc-sections" \
  --extra-libs="-lm" \
  2>&1 | tail -25

echo
echo "== 编译 =="
NPROC=$(nproc 2>/dev/null || echo 4)
mingw32-make -j"$NPROC" 2>&1 | tail -12

mkdir -p "$(dirname "$OUT")"
cp ffmpeg.exe "$OUT"

echo
echo "== 结果 =="
ls -lh "$OUT"
"$OUT" -hide_banner -version | head -2
