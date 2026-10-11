/* ==========================================================================
   深渊 abyss · lib/gl.js —— WebGL2 流场（半分辨率 ping-pong）
   --------------------------------------------------------------------------
   探针 P1 在真机 WebView2 里量到的（见待设计稿 §2）：
     · `webgl2` 拿得到，走真 GPU（ANGLE / D3D11），`alpha:true` 与
       `premultipliedAlpha:false` 都被接受 —— 水才是**半透明**的，能透出背景层；
     · `EXT_color_buffer_float` ✓ ⇒ 流场用 `RGBA16F`（速度需要带符号小数）；
       没有这个扩展时退回 `RGBA8`（速度被量化，但画面依然成立）；
     · `EXT_disjoint_timer_query_webgl2` ✓ ⇒ **能拿真实 GPU 时间**。

   两条踩过的坑（自检里固定成断言）：
     1. `gl.finish()` 在 ANGLE 上基本不等 GPU（实测"0ms"），测耗时只能用
        GPU 计时器，或者回读 1 像素强制同步；
     2. 渲染目标**不能同时当采样源**（反馈环）：会报 1282 `INVALID_OPERATION`
        并且整帧绘制被丢掉（表现是"每帧 0.008ms，快得像没画"）。所以两张
        纹理 ping-pong，而且**每帧查一次 `getError()`**。
   ========================================================================== */

/* 子模块之间**不许**静态 import：`/skins/<id>/lib/gl.js?t=<token>` 里的相对 import
   会解析成不带 token 的 URL（宿主同源托管路由会 404），而且同一个模块会被当成
   两个 URL 各加载一次。所以依赖一律由 skin.js 注进来。 */

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

/* 推进：半拉格朗日回采 + 加力（频谱推的力 + 中频噪声） + 颜料扩散 */
const FS_FLOW = `#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform vec2 uForce;
uniform float uTurb;
uniform float uTime;
uniform float uDiss;
uniform float uLift;
out vec4 o;
float hash(vec2 v) { return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec2 v = texture(uPrev, uv).xy;
  vec2 back = uv - v * uTexel * 1.6;
  vec4 s = texture(uPrev, back);
  float n = hash(floor(uv * 48.0) + floor(uTime * 6.0));
  vec2 f = uForce * (0.02 + 0.06 * uLift) + (vec2(n, hash(uv + n)) - 0.5) * 0.07 * uTurb;
  v = v * uDiss + f;
  float dB = texture(uPrev, back + uTexel * 1.5).z;
  float d = mix(s.z, dB, 0.25);
  o = vec4(v, d, s.w * 0.995);
}`;

/* 成画：域扭曲 + 封面颜料 + 字形遮罩的梯度当法线（压出凹陷）+ 泡沫 + 暗角 */
const FS_DRAW = `#version 300 es
precision highp float;
uniform sampler2D uFlow;
uniform sampler2D uCover;
uniform sampler2D uMask;
uniform vec2 uRes;
uniform vec2 uMaskRes;
uniform float uTime;
uniform float uLift;
uniform float uTurb;
uniform float uFoam;
uniform float uSurge;
uniform vec3 uBg;
uniform vec3 uFg;
uniform vec3 uAccent;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 flow = texture(uFlow, uv).xy;
  vec2 mt = 1.0 / uMaskRes;
  float m = texture(uMask, uv).r;
  float mx = texture(uMask, uv + vec2(mt.x, 0.0)).r;
  float my = texture(uMask, uv + vec2(0.0, mt.y)).r;
  vec2 grad = vec2(mx - m, my - m);
  vec2 wuv = uv + flow * (0.0035 + 0.012 * uTurb);
  wuv += vec2(sin(uTime * 0.35 + uv.y * 6.2831), cos(uTime * 0.27 + uv.x * 6.2831)) * 0.0035 * (0.35 + uTurb);
  vec2 ruv = wuv + grad * (0.35 + 0.9 * uLift) + vec2(0.0, -uSurge * 0.05) + flow * 0.02;
  float dens = texture(uCover, fract(ruv * 1.35 + vec2(0.07, 0.11))).a;
  float pig = texture(uCover, fract(ruv * 0.8 - 0.2)).b;
  vec3 water = mix(uBg * 0.6, uAccent * 0.75, dens * 0.55 + pig * 0.15);
  float edge = clamp(length(grad) * 6.0, 0.0, 1.0);
  water += uFg * edge * (0.22 + 0.35 * uLift) * 0.55;
  water -= uBg * m * 0.25;
  float g = fract(sin(dot(floor(uv * uRes), vec2(12.9898, 78.233))) * 43758.5453);
  water += (g - 0.5) * 0.06 * uFoam;
  water *= mix(0.55, 1.0, smoothstep(0.0, 0.55, uv.y + uLift * 0.1));
  water *= 1.0 - 0.45 * pow(length(uv - 0.5), 1.6);
  float a = clamp(0.42 + dens * 0.45 + edge * 0.2, 0.0, 0.95);
  o = vec4(water, a);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`shader: ${log}`);
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`link: ${log}`);
  }
  return p;
}

/**
 * 建 GL 渲染器。拿不到 `webgl2`、着色器编译失败、FBO 不完整时**返回 null**
 * （调用方无缝切 Canvas2D 兜底），绝不抛出去把皮肤挂载搞崩。
 */
export function createGL(canvas, opts = {}) {
  const flowSize = typeof opts.flowSize === "function" ? opts.flowSize : null;
  if (!flowSize) return { ok: false, error: "no-flowSize", dispose() {} };
  let gl = null;
  try {
    gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: opts.powerPreference || "high-performance",
    });
  } catch {
    gl = null;
  }
  if (!gl) return null;

  const halfFloat = !!gl.getExtension("EXT_color_buffer_float");
  const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const lose = gl.getExtension("WEBGL_lose_context");
  const internal = halfFloat ? gl.RGBA16F : gl.RGBA8;
  const type = halfFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  let progFlow = null;
  let progDraw = null;
  try {
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    progFlow = program(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FS_FLOW));
    progDraw = program(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FS_DRAW));
    gl.deleteShader(vs);
  } catch (e) {
    if (progFlow) gl.deleteProgram(progFlow);
    if (progDraw) gl.deleteProgram(progDraw);
    return { ok: false, error: String((e && e.message) || e), dispose() {} };
  }

  /* 全屏三角形（比两个三角形省一次光栅化边界） */
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const bindQuad = (p) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    const loc = gl.getAttribLocation(p, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  };
  bindQuad(progFlow);
  bindQuad(progDraw);

  const U = {};
  const cache = (p, name) => {
    const key = p === progFlow ? `f:${name}` : `d:${name}`;
    if (!(key in U)) U[key] = gl.getUniformLocation(p, name);
    return U[key];
  };

  /* --- 流场目标：两张纹理 ping-pong --- */
  let rw = 0;
  let rh = 0;
  let rt = [];
  const mkRT = (w, h) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, ok: st === gl.FRAMEBUFFER_COMPLETE, status: st };
  };
  const freeRT = () => {
    for (const r of rt) {
      gl.deleteFramebuffer(r.fbo);
      gl.deleteTexture(r.tex);
    }
    rt = [];
  };
  const ensureRT = (w, h) => {
    if (rt.length === 2 && rw === w && rh === h) return;
    freeRT();
    rw = w;
    rh = h;
    rt = [mkRT(w, h), mkRT(w, h)];
  };

  /* --- 封面颜料（每首歌上传一次） --- */
  const coverTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, coverTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([4, 18, 27, 90]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  let coverSize = 1;

  /* --- 字形遮罩（每行上传一次，不是每帧） --- */
  const maskTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, maskTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  let maskW = 1;
  let maskH = 1;

  const stats = { draws: 0, errors: 0, lastError: 0, samples: 0, avgMs: -1, halfFloat, timer: !!timer };
  let query = null;
  let queryFrames = 0;
  let measuring = false;
  let sumMs = 0;
  let sumFrames = 0;

  const api = {
    ok: true,
    kind: "gl",
    halfFloat,
    timer: !!timer,
    stats,
    /** 舞台尺寸 / dpr / 档位 → 流场分辨率（顺带把画布尺寸同步到设备像素） */
    resize(cssW, cssH, dpr, tier) {
      const size = flowSize(cssW, cssH, dpr, tier);
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      ensureRT(size.w, size.h);
      return { ...size, ok: rt.every((r) => r.ok), status: rt[0] ? rt[0].status : 0 };
    },
    setCover(pixels, size) {
      if (!pixels || !pixels.length) return;
      coverSize = size || Math.round(Math.sqrt(pixels.length / 4));
      gl.bindTexture(gl.TEXTURE_2D, coverTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, coverSize, coverSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    },
    /** 传一张 canvas 进来（字形遮罩）—— 上传一次，之后每帧只是采样 */
    setMask(srcCanvas) {
      if (!srcCanvas || !srcCanvas.width || !srcCanvas.height) return { w: maskW, h: maskH };
      maskW = srcCanvas.width;
      maskH = srcCanvas.height;
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      // canvas 是"y 向下"，GL 的 v=0 在下边：翻转上传，两套坐标才对得上
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      return { w: maskW, h: maskH };
    },
    beginMeasure() {
      /* 上一窗口的结果还没取走时不许开新窗口 —— 否则 `query` 被覆盖，
         那个已经结束的计时结果就永远读不到了（表现是 GPU 时间一直是空的） */
      if (!timer || measuring || query) return false;
      query = gl.createQuery();
      gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      queryFrames = 0;
      measuring = true;
      return true;
    },
    endMeasure() {
      if (!measuring) return;
      gl.endQuery(timer.TIME_ELAPSED_EXT);
      measuring = false;
    },
    /** 在帧循环里顺手看一眼计时结果（**不额外开 rAF**）；攒够一个窗口就返回平均毫秒 */
    pollMeasure() {
      if (!timer || !query || measuring) return null;
      const avail = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
      const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
      if (disjoint) {
        gl.deleteQuery(query);
        query = null;
        return null;
      }
      if (!avail) return null;
      const ns = gl.getQueryParameter(query, gl.QUERY_RESULT);
      gl.deleteQuery(query);
      query = null;
      if (queryFrames > 0 && ns > 0) {
        sumMs += ns / 1e6;
        sumFrames += queryFrames;
      }
      if (sumFrames >= 30) {
        const avg = sumMs / sumFrames;
        sumMs = 0;
        sumFrames = 0;
        stats.samples += 1;
        stats.avgMs = Math.round(avg * 1000) / 1000;
        return stats.avgMs;
      }
      return null;
    },
    /** 一帧：推进（写 rt[1]）→ 成画（写画布）→ 交换 */
    frame(u) {
      const a = rt[0];
      const b = rt[1];
      if (!a || !b) return;
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      // --- 推进 ---
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
      gl.viewport(0, 0, rw, rh);
      gl.useProgram(progFlow);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, a.tex);
      gl.uniform1i(cache(progFlow, "uPrev"), 0);
      gl.uniform2f(cache(progFlow, "uTexel"), 1 / rw, 1 / rh);
      gl.uniform2f(cache(progFlow, "uForce"), u.forceX || 0, u.forceY || 0);
      gl.uniform1f(cache(progFlow, "uTurb"), u.turb || 0);
      gl.uniform1f(cache(progFlow, "uTime"), u.time || 0);
      gl.uniform1f(cache(progFlow, "uDiss"), u.diss || 0.985);
      gl.uniform1f(cache(progFlow, "uLift"), u.lift || 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (measuring) queryFrames += 1;
      stats.draws += 1;
      // --- 成画 ---
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(progDraw);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, b.tex);
      gl.uniform1i(cache(progDraw, "uFlow"), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, coverTex);
      gl.uniform1i(cache(progDraw, "uCover"), 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.uniform1i(cache(progDraw, "uMask"), 2);
      gl.uniform2f(cache(progDraw, "uRes"), canvas.width, canvas.height);
      gl.uniform2f(cache(progDraw, "uMaskRes"), maskW, maskH);
      gl.uniform1f(cache(progDraw, "uTime"), u.time || 0);
      gl.uniform1f(cache(progDraw, "uLift"), u.lift || 0);
      gl.uniform1f(cache(progDraw, "uTurb"), u.turb || 0);
      gl.uniform1f(cache(progDraw, "uFoam"), u.foam || 0);
      gl.uniform1f(cache(progDraw, "uSurge"), u.surge || 0);
      gl.uniform3f(cache(progDraw, "uBg"), u.bg[0], u.bg[1], u.bg[2]);
      gl.uniform3f(cache(progDraw, "uFg"), u.fg[0], u.fg[1], u.fg[2]);
      gl.uniform3f(cache(progDraw, "uAccent"), u.accent[0], u.accent[1], u.accent[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      stats.draws += 1;
      // --- 每帧查一次错误（反馈环那种"静默丢帧"只能靠它抓到） ---
      const e = gl.getError();
      if (e) {
        stats.errors += 1;
        stats.lastError = e;
      }
      rt[0] = b;
      rt[1] = a;
    },
    /** 上下文丢了没有（宿主/系统会在切显卡、休眠、驱动复位时丢） */
    isLost() {
      return !!(gl && gl.isContextLost && gl.isContextLost());
    },
    dispose() {
      freeRT();
      gl.deleteTexture(coverTex);
      gl.deleteTexture(maskTex);
      gl.deleteBuffer(quad);
      if (query) {
        gl.deleteQuery(query);
        query = null;
      }
      gl.deleteProgram(progFlow);
      gl.deleteProgram(progDraw);
      progFlow = null;
      progDraw = null;
      // 主动还上下文：GPU 资源立刻释放，不用等 GC
      try {
        lose?.loseContext?.();
      } catch {
        /* 已经丢了 */
      }
      gl = null;
    },
  };
  return api;
}
