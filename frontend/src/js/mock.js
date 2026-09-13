/* ==========================================================================
   mock.js — 界面预览用的假数据（接入 Go 后端后可整文件删除）
   ========================================================================== */

import { placeholderCover, stableId } from "./utils.js";

const RAW = [
  ["夜航西飞", "陈默", "静默频率", "flac", 268_400, 38_420_000],
  ["Rooftop Rain", "Aurora Lane", "Paper Cities", "flac", 231_000, 31_870_000],
  ["城南旧事", "林一叶", "南方以南", "mp3", 254_000, 9_640_000],
  ["Neon Tide", "Kite & Ivory", "Submerged", "mp3", 198_000, 8_120_000],
  ["玻璃海", "周叙", "玻璃海", "flac", 312_000, 44_910_000],
  ["Slow Motion", "Hana Sato", "Tokyo Drift Tape", "m4a", 224_000, 11_240_000],
  ["冬天不冷", "沈拾", "雪线以上", "mp3", 245_000, 9_180_000],
  ["Paper Planes", "The Quiet Hours", "Analog Sunsets", "flac", 289_000, 40_230_000],
  ["旧信封", "陈默", "静默频率", "flac", 276_000, 37_150_000],
  ["Midnight Commute", "Aurora Lane", "Paper Cities", "mp3", 209_000, 8_760_000],
  ["风穿过走廊", "苏木", "长夏", "wav", 301_000, 52_680_000],
  ["Evergreen", "Kite & Ivory", "Submerged", "flac", 243_000, 33_440_000],
  ["六月雪", "周叙", "玻璃海", "mp3", 187_000, 7_020_000],
  ["Ferris Wheel", "Hana Sato", "Tokyo Drift Tape", "flac", 258_000, 36_910_000],
  ["未寄出的信", "沈拾", "雪线以上", "mp3", 233_000, 8_940_000],
  ["Static Bloom", "The Quiet Hours", "Analog Sunsets", "flac", 271_000, 39_070_000],
  ["海边旅馆", "林一叶", "南方以南", "mp3", 262_000, 9_870_000],
  ["Low Battery", "Kite & Ivory", "Submerged", "mp3", 176_000, 6_540_000],
  ["候鸟", "苏木", "长夏", "flac", 294_000, 42_310_000],
  ["Cassette Love", "The Quiet Hours", "Analog Sunsets", "m4a", 213_000, 10_680_000],
  ["空房间", "陈默", "静默频率", "mp3", 241_000, 9_120_000],
  ["Harbour Lights", "Aurora Lane", "Paper Cities", "flac", 265_000, 37_860_000],
  ["南方以南", "林一叶", "南方以南", "mp3", 228_000, 8_640_000],
  ["Dust & Daydream", "Hana Sato", "Tokyo Drift Tape", "flac", 249_000, 35_220_000],
  ["雪线以上", "沈拾", "雪线以上", "mp3", 219_000, 8_310_000],
  ["Long Way Home", "The Quiet Hours", "Analog Sunsets", "flac", 302_000, 43_590_000],
  ["夏夜虫鸣", "苏木", "长夏", "mp3", 195_000, 7_380_000],
  ["Overexposed", "Kite & Ivory", "Submerged", "mp3", 205_000, 8_210_000],
  ["半途而废", "周叙", "玻璃海", "flac", 286_000, 41_070_000],
  ["Snowfall Theme", "Hana Sato", "Tokyo Drift Tape", "flac", 237_000, 34_180_000],
  ["夜行人", "陈默", "静默频率", "mp3", 251_000, 9_460_000],
  ["Room 402", "Aurora Lane", "Paper Cities", "wav", 318_000, 55_120_000],
  ["野草与铁轨", "苏木", "长夏", "mp3", 210_000, 7_890_000],
  ["Undertow", "The Quiet Hours", "Analog Sunsets", "flac", 277_000, 38_940_000],
  ["最后一个夏天", "沈拾", "雪线以上", "mp3", 236_000, 9_010_000],
  ["Pixel Rain", "Kite & Ivory", "Submerged", "m4a", 188_000, 9_760_000],
  ["北方来信", "林一叶", "南方以南", "flac", 273_000, 39_330_000],
  ["Cold Brew", "Hana Sato", "Tokyo Drift Tape", "mp3", 202_000, 8_040_000],
  ["归途", "周叙", "玻璃海", "flac", 297_000, 42_770_000],
  ["Afterglow", "Aurora Lane", "Paper Cities", "flac", 259_000, 36_450_000],
];

/** 用于演示过滤规则的脏文件（小于 10KB、非音频扩展名等） */
const JUNK = [
  ["track_notes", "Unknown", "未分类", "mp4", 7_400, 7_600],
  ["desktop", "Unknown", "未分类", "ini", 120, 120],
  ["cover_preview", "Unknown", "未分类", "mp4", 8_900, 9_100],
  ["readme", "Unknown", "未分类", "txt", 2_100, 2_100],
];

function build(rows, baseDir, seedBase) {
  const albums = new Map();
  return rows.map((row, i) => {
    const [title, artist, album, ext, duration, size] = row;
    if (!albums.has(`${artist}|${album}`)) {
      albums.set(`${artist}|${album}`, albums.size + seedBase);
    }
    const albumSeed = albums.get(`${artist}|${album}`);
    const path = `${baseDir}\\${artist}\\${album}\\${title}.${ext}`;
    // id 由路径派生 → 重复扫描结果稳定，歌单 / 播放队列的引用不会失效
    const id = stableId(path);
    return {
      id,
      path,
      title,
      artist,
      album,
      ext,
      duration,
      size,
      sampleRate: ext === "flac" ? 96000 : 44100,
      bitrate: ext === "flac" ? 1411 : 320,
      addedAt: Date.now() - (rows.length - i) * 86_400_000,
      playCount: (i * 7) % 23,
      cover: placeholderCover(title.slice(0, 1), albumSeed),
      albumSeed,
    };
  });
}

export const MOCK_FOLDERS = [
  {
    id: "folder_1",
    path: "D:\\Music\\音乐库",
    trackCount: 40,
    status: "ok",
    watching: true,
    addedAt: Date.now() - 86_400_000 * 30,
  },
  {
    id: "folder_2",
    path: "E:\\Backup\\FLAC\\2024",
    trackCount: 0,
    status: "missing",
    watching: false,
    addedAt: Date.now() - 86_400_000 * 12,
  },
  {
    id: "folder_3",
    path: "C:\\Users\\Example\\Music\\Downloads",
    trackCount: 0,
    status: "ok",
    watching: true,
    addedAt: Date.now() - 86_400_000 * 3,
  },
];

export const MOCK_SONGS = [
  ...build(RAW.slice(0, 24), "D:\\Music\\音乐库", 1),
  ...build(RAW.slice(24), "C:\\Users\\Example\\Music\\Downloads", 13),
  ...build(JUNK, "D:\\Music\\音乐库", 21),
];

export const MOCK_PLAYLISTS = [
  {
    id: "liked",
    name: "我喜欢",
    locked: true,
    builtin: true,
    icon: "heart",
    songIds: MOCK_SONGS.slice(0, 6).map((s) => s.id),
    createdAt: Date.now() - 86_400_000 * 60,
  },
  {
    id: "pl_late_night",
    name: "深夜循环",
    locked: false,
    builtin: false,
    songIds: MOCK_SONGS.slice(6, 11).map((s) => s.id),
    createdAt: Date.now() - 86_400_000 * 20,
  },
  {
    id: "pl_focus",
    name: "工作专注",
    locked: false,
    builtin: false,
    songIds: MOCK_SONGS.slice(11, 16).map((s) => s.id),
    createdAt: Date.now() - 86_400_000 * 9,
  },
  {
    id: "pl_road",
    name: "开车路上",
    locked: false,
    builtin: false,
    songIds: MOCK_SONGS.slice(16, 19).map((s) => s.id),
    createdAt: Date.now() - 86_400_000 * 4,
  },
];

export const MOCK_FILTER_RULES = [
  {
    id: "rule_size",
    type: "size",
    op: "lt",
    value: "10240",
    unit: "B",
    scope: "exclude",
    enabled: true,
  },
  {
    id: "rule_ext",
    type: "regex",
    op: "match",
    value: "\\.mp4$",
    scope: "exclude",
    enabled: true,
  },
  {
    id: "rule_tmp",
    type: "regex",
    op: "match",
    value: "(^|[\\\\/])_tmp|^\\.|~$",
    scope: "exclude",
    enabled: false,
  },
];

export const MOCK_LYRICS = `[00:00.00]夜航西飞
[00:04.50]作词：陈默
[00:08.00]作曲：陈默
[00:12.00]
[00:14.20]云层之下 是没有尽头的黑
[00:21.60]仪表盘的微光 替我数着心跳
[00:29.10]我把那年夏天 折成一张登机牌
[00:36.80]越过换日线 就当作没有告别
[00:44.30]夜航西飞 星光落在机翼
[00:51.90]我把想说的话 全留在云上
[00:59.40]如果天亮之后 你还在原地
[01:07.00]请把这些年 都当作一场时差
[01:15.20]
[01:18.00]无线电里 有人说着晚安
[01:25.50]我数到第三千次 才敢闭上眼
[01:33.10]如果降落时 世界还认得我
[01:40.70]我会把行李 轻轻地放在门口
[01:48.40]夜航西飞 星光落在机翼
[01:56.00]我把想说的话 全留在云上
[02:03.60]如果天亮之后 你还在原地
[02:11.20]请把这些年 都当作一场时差
[02:19.40]
[02:24.00]（间奏）
[02:38.00]
[02:44.80]夜航西飞 星光落在机翼
[02:52.40]我把没说完的 都留在云上
[03:00.00]如果天亮之后 你还在原地
[03:07.60]请把这些年 都当作一场时差
[03:15.20]
[03:20.00]降落的时候 天刚刚亮
[03:28.00]而我终于 学会不再回头
[03:38.00]
`;

export const MOCK_LYRICS_ALT = `[00:00.00]Rooftop Rain
[00:03.80](Instrumental)
[00:18.00]Rain on the rooftop, counting every drop
[00:25.50]The city keeps its secrets, I keep mine
[00:33.00]We were paper cities in a paper world
[00:40.50]Burning slow beneath the neon signs
[00:48.00]And if the morning comes without a warning
[00:55.50]I'll be the last one standing in the rain
[01:03.00]Rooftop rain, washing all the names
[01:10.50]Rooftop rain, nothing feels the same
[01:18.00]
[01:26.00]I left a light on in the hallway
[01:33.50]Just in case you found your way back home
[01:41.00]But the paper cities fold so easily
[01:48.50]And I've been standing here on my own
[01:56.00]Rooftop rain, washing all the names
[02:03.50]Rooftop rain, nothing feels the same
[02:11.00]
[02:18.00](Bridge)
[02:34.00]Rooftop rain, washing all the names
[02:41.50]Rooftop rain, nothing feels the same
[02:49.00]Nothing feels the same
[02:56.00]
`;
