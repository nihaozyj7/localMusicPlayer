// 生成 stableId 测试向量（与 frontend/src/js/utils.js#stableId 完全同一算法）
function stableId(input, prefix = "t") {
  let h = 0x811c9dc5;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${prefix}_${h.toString(36)}`;
}

const cases = [
  "D:\\Music\\音乐库\\陈默\\静默频率\\夜航西飞.flac",
  "C:\\Users\\Example\\Music\\Downloads\\Aurora Lane\\Paper Cities\\Rooftop Rain.flac",
  "/home/user/music/a.mp3",
  "D:\\Music\\音乐库",
  "",
  "x",
  "E:\\Backup\\FLAC\\2024\\周叙\\玻璃海\\玻璃海.flac",
];

for (const c of cases) {
  console.log(`${JSON.stringify(c)} ${stableId(c)} ${stableId(c, "folder")}`);
}
