"""生成一套「演示曲库」：给 tools/shots.mjs 的真实应用截图当素材。

- 全部内容都是本机生成的合成物：正弦和弦 + 自己写的歌词 + 自己画的封面，
  标题 / 歌手都是「演示音源」这类虚构值，**不含任何真实音乐或用户数据**；
- 封面用 Pillow 画渐变 + 专辑名（字体取系统微软雅黑）—— 需要 `pip install Pillow`；
- 音频用本机**完整版** ffmpeg 生成（20~40 秒）并写入标签与内嵌封面
  （m4a 的 covr / flac 的 PICTURE / mp3 的 APIC）。注意程序内嵌的那份精简 ffmpeg
  **只有 flac / pcm 编码器**，编不出 aac / mp3，所以这里必须用完整版；
- 每首另存一份 .lrc（同样是自己写的词），让歌词面板有内容。

输出目录（已被 .gitignore 忽略）：.tmp-demo/library/<专辑>/<曲目>.ext
"""

import math
import os
import shutil
import struct
import subprocess
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / ".tmp-demo" / "library"
COVERS = ROOT / ".tmp-demo" / "covers"
FONT = r"C:\Windows\Fonts\msyh.ttc"


def find_ffmpeg() -> Path:
    """找一个**完整版** ffmpeg：内置的精简版编不了 aac / mp3。"""
    for cand in (os.environ.get("LMPLAYER_FFMPEG"), shutil.which("ffmpeg")):
        if cand and Path(cand).exists():
            return Path(cand)
    raise SystemExit(
        "找不到 ffmpeg。请装一个完整版并加进 PATH，或用 LMPLAYER_FFMPEG 指过去\n"
        "（程序内嵌的精简 ffmpeg 只有 flac / pcm 编码器，编不出演示用的 aac / mp3）"
    )


FFMPEG = find_ffmpeg()

ALBUMS = [
    {
        "name": "夜航",
        "artist": "演示音源",
        "year": "2026",
        "colors": ((24, 32, 64), (86, 60, 140)),
        "tracks": [
            ("01 起雾的跑道", 24),
            ("02 三万英尺的云", 27),
            ("03 夜航西飞", 31),
            ("04 落地前的十分钟", 26),
            ("05 摆渡车", 21),
        ],
    },
    {
        "name": "城市清晨",
        "artist": "演示音源",
        "year": "2025",
        "colors": ((247, 214, 160), (196, 122, 88)),
        "tracks": [
            ("01 便利店的第一杯", 22),
            ("02 七点零五的站台", 25),
            ("03 天台上的风", 29),
        ],
    },
    {
        "name": "演示单曲",
        "artist": "演示音源",
        "year": "2026",
        "colors": ((18, 18, 22), (60, 90, 110)),
        "tracks": [("凌晨三点的电台", 33)],
    },
]


def make_cover(path: Path, title: str, subtitle: str, colors) -> None:
    w = h = 600
    img = Image.new("RGB", (w, h))
    px = img.load()
    (r1, g1, b1), (r2, g2, b2) = colors
    for y in range(h):
        for x in range(w):
            t = (x + y) / (w + h - 2)
            # 一层很轻的斜向渐变 + 一点径向压暗，看起来像唱片封面而不是纯色块
            d = math.hypot(x - w / 2, y - h / 2) / (w * 0.72)
            k = max(0.0, 1.0 - 0.35 * d)
            px[x, y] = (
                int((r1 + (r2 - r1) * t) * k),
                int((g1 + (g2 - g1) * t) * k),
                int((b1 + (b2 - b1) * t) * k),
            )
    draw = ImageDraw.Draw(img)
    try:
        f_big = ImageFont.truetype(FONT, 96)
        f_small = ImageFont.truetype(FONT, 34)
    except OSError:
        f_big = f_small = ImageFont.load_default()
    draw.text((60, 300), title, font=f_big, fill=(255, 255, 255))
    draw.text((64, 430), subtitle, font=f_small, fill=(255, 255, 255, 200))
    draw.rectangle([60, 260, 200, 268], fill=(255, 255, 255))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")


def make_wav(path: Path, seconds: int, base: float) -> None:
    """用标准库写一段 WAV：一个三音和弦 + 缓慢的颤音，听感上像音乐而不是蜂鸣。"""
    rate = 44100
    frames = bytearray()
    for i in range(rate * seconds):
        t = i / rate
        env = min(1.0, t / 0.8) * min(1.0, (seconds - t) / 1.2)  # 淡入淡出
        trem = 0.85 + 0.15 * math.sin(2 * math.pi * 0.7 * t)
        s = 0.0
        for mult, amp in ((1.0, 0.5), (1.25, 0.28), (1.5, 0.2)):
            s += amp * math.sin(2 * math.pi * base * mult * t)
        s = max(-1.0, min(1.0, s * env * trem * 0.55))
        frames += struct.pack("<h", int(s * 32000))
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        f.writeframes(bytes(frames))


def mux(wav: Path, cover: Path, out: Path, meta: dict) -> None:
    ext = out.suffix.lower()
    out.parent.mkdir(parents=True, exist_ok=True)
    args = [str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav)]
    has_cover = ext in (".m4a", ".mp3", ".flac")
    if has_cover:
        args += ["-i", str(cover)]
    args += ["-map", "0:a"]
    if has_cover:
        args += ["-map", "1:v", "-disposition:v", "attached_pic"]
    for k, v in meta.items():
        args += ["-metadata", f"{k}={v}"]
    if ext == ".m4a":
        args += ["-c:a", "aac", "-b:a", "128k", "-c:v", "copy", "-movflags", "+faststart"]
    elif ext == ".mp3":
        args += ["-c:a", "libmp3lame", "-b:a", "160k", "-c:v", "copy", "-id3v2_version", "3"]
    elif ext == ".flac":
        args += ["-c:a", "flac", "-c:v", "copy", "-disposition:v", "attached_pic"]
    args += [str(out)]
    subprocess.run(args, check=True)


LYRICS_TEXT = {
    "起雾的跑道": [
        "雾在跑道上慢慢散开",
        "塔台说可以走了",
        "我把昨天的天气收进口袋",
        "发动机把清晨吹成一条线",
        "再见 落地的那座城",
    ],
    "三万英尺的云": [
        "三万英尺的云在脚下排队",
        "像谁把一天叠成了白色",
        "副驾驶调低了广播的音量",
        "我们在云上没有地址",
    ],
    "夜航西飞": [
        "舷窗外只有一层黑",
        "和仪表盘上那颗绿灯",
        "城市在身后变成一小片光",
        "我们朝着更深的夜里飞",
    ],
    "落地前的十分钟": [
        "收起小桌板 系好安全带",
        "十分钟之后就是另一段生活",
        "跑道灯一排排亮起来",
        "像有人在夜里替我们数着",
    ],
    "摆渡车": [
        "摆渡车慢慢开过停机坪",
        "玻璃上还留着白天的温度",
        "有人已经拨通了电话",
        "有人只是把外套裹紧",
    ],
    "便利店的第一杯": [
        "自动门打开的时候风先到",
        "第一杯咖啡还在等滴完",
        "收银台的灯比太阳早",
        "城市就是这样醒过来的",
    ],
    "七点零五的站台": [
        "七点零五的站台挤满了人",
        "每个人都在等同一阵风",
        "耳机里那首歌刚刚好",
        "刚好盖住车厢的轰鸣",
    ],
    "天台上的风": [
        "天台上的风比楼下大一点",
        "晾衣绳把天空分成了几块",
        "我在这里看完了一整场日落",
        "然后下楼 继续做个普通人",
    ],
    "凌晨三点的电台": [
        "凌晨三点的电台还在说话",
        "主持人的声音像隔了一层雾",
        "我把音量调到刚刚好",
        "刚好听得见 又刚好能睡着",
    ],
}


def make_lrc(title: str) -> str:
    """给自己的演示曲目配一份自己的歌词（本机自造文本，不来自任何在线来源）。"""
    lines = [f"[00:00.00]{title}", "[00:01.50]演示音源"]
    at = 4.0
    for line in LYRICS_TEXT.get(title, []):
        lines.append(f"[{int(at // 60):02d}:{at % 60:05.2f}]{line}")
        at += 3.6
    return "\n".join(lines) + "\n"


def main() -> None:
    exts = [".m4a", ".flac", ".mp3", ".m4a", ".flac", ".m4a", ".mp3", ".m4a", ".flac"]
    i = 0
    for album in ALBUMS:
        cover = COVERS / f"{album['name']}.png"
        make_cover(cover, album["name"], album["artist"], album["colors"])
        for n, (title, seconds) in enumerate(album["tracks"], start=1):
            ext = exts[i % len(exts)]
            i += 1
            kind = "album" if len(album["tracks"]) > 1 else "single"
            out = LIB / album["name"] / f"{title}{ext}"
            wav = ROOT / ".tmp-demo" / "wav" / f"{title}.wav"
            make_wav(wav, seconds, 196.0 + (n * 18))
            mux(
                wav,
                cover,
                out,
                {
                    "title": title.split(" ", 1)[-1],
                    "artist": album["artist"],
                    "album": album["name"] if kind == "album" else "",
                    "date": album["year"],
                    "track": f"{n}",
                    "genre": "Demo",
                    "comment": "本地音乐播放器演示曲目（FFmpeg 生成，非真实音乐）",
                },
            )
            print("生成", out.relative_to(ROOT))
            (out.with_suffix(".lrc")).write_text(make_lrc(title.split(" ", 1)[-1]), encoding="utf-8")
            wav.unlink()


if __name__ == "__main__":
    main()
