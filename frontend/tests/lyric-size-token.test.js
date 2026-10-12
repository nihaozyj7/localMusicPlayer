/* ==========================================================================
   lyric-size-token.test.js — 歌词字号必须真的传得到歌词上
   --------------------------------------------------------------------------
   守的是一条**出过事、而且出了事没有任何报错**的链路：

     设置 → 歌词字号（config.lyricsFontSize）
       → 宿主把值当 CSS 变量 --lyric-size 下发（theme.js#applyResolvedTheme）
       → 样式包的歌词零件（packages/player-skins/src/lyrics.css）读它

   真实故障：骨架在 `.lyrics` 元素上写着 `--lyric-size: 16px`。自定义属性是普通
   继承，本元素上的声明**就近压过** :root，于是用户拖字号滑杆时值确实写进了
   :root，却到不了 `.lyric` —— 表现是「改歌词字号完全没反应」，而控制台一片干净。
   同一类问题还有两处：内置样式 classic / immersive 也各自写死了字号（它们被宿主
   包在 @layer skin 里，本来也压不过未分层的骨架，属于双重失效）。

   所以这里断言三件事，都是**源码层面**能精确守住的：
     1. 字号换算（含越界夹回）在唯一的 helper 里；
     2. 骨架与两个内置样式都**不声明** --lyric-size（否则又是就近遮蔽）；
     3. 宿主在启动路径上真的下发了这个令牌 —— 只写在滑杆的 onChange 里，
        重启后配置里的字号就谁也不管（歌词永远停在 16px）。
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  LYRIC_SIZE_DEFAULT,
  LYRIC_SIZE_MAX,
  LYRIC_SIZE_MIN,
  lyricSizeToken,
} from "../src/js/ui/lyric-size.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/** 骨架 + 两个内置样式（第三方样式不归这里管，它们有自己的自检） */
const sizeCssFiles = [
  "frontend/packages/player-skins/src/lyrics.css",
  "internal/skins/resources/player-skins/classic/skin.css",
  "internal/skins/resources/player-skins/immersive/skin.css",
];

/**
 * 找出 `--lyric-size: …` 形式的**声明行**（不是 var() 引用、也不是 -active）。
 * 命中即说明该文件把用户字号就地钉死了。
 */
function pinnedSizeDeclarations(css) {
  return css
    .split("\n")
    .map((line, i) => ({ line: line.trim(), no: i + 1 }))
    .filter(({ line }) => /(^|[\s{;])--lyric-size\s*:/.test(line));
}

/* ==========================================================================
   一、字号换算只有一处，并且夹回量程
   ========================================================================== */

test("歌词字号换算会夹回 14~72，非法值回到默认", () => {
  assert.equal(lyricSizeToken(32), "32px");
  assert.equal(lyricSizeToken(40.6), "41px", "应当四舍五入成整数像素");
  assert.equal(lyricSizeToken(LYRIC_SIZE_MIN - 1), `${LYRIC_SIZE_MIN}px`);
  assert.equal(lyricSizeToken(LYRIC_SIZE_MAX + 1), `${LYRIC_SIZE_MAX}px`);
  for (const bad of [undefined, null, NaN, 0, -5, ""]) {
    assert.equal(lyricSizeToken(bad), `${LYRIC_SIZE_DEFAULT}px`, `非法值 ${String(bad)} 应回到默认字号`);
  }
});

/* ==========================================================================
   二、骨架与内置样式都不许就地钉死 --lyric-size
   ========================================================================== */

test("样式侧不声明 --lyric-size（否则就近遮蔽掉用户字号）", () => {
  for (const file of sizeCssFiles) {
    const hits = pinnedSizeDeclarations(read(file));
    assert.deepEqual(
      hits,
      [],
      `${file} 里不该出现 --lyric-size 的声明（第 ${hits.map((h) => h.no).join("、")} 行）：` +
        `宿主把用户字号写在 :root 上，本元素一写死就近压过它，改字号就再也没反应了`
    );
  }
});

test("骨架的字号/亮度一律走使用点兜底，当前行字号由正文字号派生", () => {
  const css = read("frontend/packages/player-skins/src/lyrics.css");
  assert.ok(!/var\(--lyric-size\)/.test(css), "--lyric-size 的引用必须带兜底值（var(--lyric-size, 16px)）");
  assert.ok(!/var\(--lyric-dim\)/.test(css), "--lyric-dim 的引用必须带兜底值（var(--lyric-dim, 0.36)）");
  assert.match(
    css,
    /--lyric-active-size:\s*var\(--lyric-size-active,\s*calc\(var\(--lyric-size/,
    "当前行字号应当是「样式包给了就用，没给就按正文字号推导」"
  );
  // 当前行与退场动画都必须读派生量，不能绕过它去读会被遮蔽的原始旋钮
  assert.match(css, /\.lyric\[aria-current="true"\]\s*\{[^}]*font-size:\s*var\(--lyric-active-size\)/);
  assert.match(css, /scale\(calc\(var\(--lyric-active-size\)/);
});

test("两个内置样式只声明自己的相对差异（比例，不是绝对像素）", () => {
  const classic = read("internal/skins/resources/player-skins/classic/skin.css");
  const immersive = read("internal/skins/resources/player-skins/immersive/skin.css");
  assert.match(classic, /--lyric-size-active:\s*calc\(var\(--lyric-size,\s*16px\)\s*\*/);
  assert.match(immersive, /--lyric-size-active:\s*calc\(var\(--lyric-size,\s*16px\)\s*\*/);
  // 16px 时的效果与改动前逐像素一致：经典 21px、沉浸 22px
  const ratio = (css) => {
    const m = /--lyric-size-active:\s*calc\(var\(--lyric-size,\s*16px\)\s*\*\s*([\d.]+)\)/.exec(css);
    assert.ok(m, "内置样式的当前行字号应当写成「正文字号 × 系数」");
    return Math.round(16 * Number(m[1]));
  };
  assert.equal(ratio(classic), 21);
  assert.equal(ratio(immersive), 22);
});

/* ==========================================================================
   三、宿主接线：启动路径要下发，滑杆要复用同一份换算
   ========================================================================== */

test("宿主在启动路径（applyResolvedTheme）里下发 --lyric-size", () => {
  const theme = read("frontend/src/js/theme.js");
  assert.match(theme, /import\s*\{[^}]*lyricSizeToken[^}]*\}\s*from\s*"\.\/ui\/lyric-size\.js"/);
  assert.match(
    theme,
    /"--lyric-size":\s*lyricSizeToken\(config\.lyricsFontSize\)/,
    "applyResolvedTheme 必须把配置里的字号下发成运行时令牌（只写在滑杆里，重启后就丢了）"
  );
});

test("两个字号滑杆都复用同一份换算", () => {
  for (const file of ["frontend/src/js/ui/panels.js", "frontend/src/js/ui/settings-view.js"]) {
    const src = read(file);
    assert.match(src, /lyricSizeToken\(v\)/, `${file} 应当用 lyricSizeToken 下发字号`);
    assert.ok(!/setRuntimeToken\("--lyric-size",\s*`\$\{v\}px`\)/.test(src), `${file} 里不该再有手拼的 px`);
  }
});
