// WebGL2 renderer: one photo in, any eye out.
//
// Per view:  source (mipmapped sRGB texture)
//   → down pass into an sRGB render target, scaled down when the blur is big
//   → separable Gaussian (horizontal, vertical)
//   → final pass: colour model, light level, noise, bee facets, eagle loupe
// sRGB8_ALPHA8 targets keep the blur in linear light at 8-bit cost.
import { SPECIES, MATRICES, ARCMIN_PER_CSS_PX } from './species.js';

const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS_DOWN = `#version 300 es
precision highp float;
uniform sampler2D tSrc; in vec2 vUv; out vec4 o;
void main(){ o = vec4(texture(tSrc, vec2(vUv.x, 1.0 - vUv.y)).rgb, 1.0); }`;

const FS_BLUR = `#version 300 es
precision highp float;
uniform sampler2D t; uniform vec2 uStep; uniform float uSigma;
in vec2 vUv; out vec4 o;
void main(){
  float s = max(uSigma, 0.01);
  float R = min(ceil(s * 3.0), 20.0);
  vec3 acc = vec3(0.0); float ws = 0.0;
  for (int i = -20; i <= 20; i++) {
    float fi = float(i);
    if (abs(fi) > R) continue;
    float w = exp(-0.5 * fi * fi / (s * s));
    acc += w * texture(t, vUv + uStep * fi).rgb; ws += w;
  }
  o = vec4(acc / ws, 1.0);
}`;

const FS_FINAL = `#version 300 es
precision highp float;
uniform sampler2D tSrc;      // original photo (y flipped)
uniform sampler2D tBase;     // processed (blurred) view, linear via sRGB target
uniform bool uBaseIsSrc;
uniform vec4 uView;          // viewport x, y, w, h in target px
uniform int uMode;
uniform mat3 uMat;
uniform bool uUseMat;
uniform float uSat, uE, uChroma, uNoise, uTime;
uniform float uHex;          // facet size in target px, 0 = off
uniform float uSharpen;
uniform vec3 uLoupe;         // centre (target px, view-local), radius; z <= 0 off
uniform float uLoupeMag;
uniform bool uEncode;
in vec2 vUv; out vec4 o;

vec3 src(vec2 uv){ return texture(tSrc, vec2(uv.x, 1.0 - uv.y)).rgb; }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 eye(vec3 c){
  if (uMode == 3) {                       // honeybee false colour
    float uv = max(0.0, c.b - 0.15 * max(c.r, c.g)) * 1.1 + 0.15 * min(c.r, min(c.g, c.b));
    c = vec3(c.g, c.b, uv);
  } else if (uUseMat) {
    c = max(uMat * c, 0.0);
  }
  float y = luma(c);
  c = max(mix(vec3(y), c, uSat), 0.0);
  return c;
}

void main(){
  vec2 px = gl_FragCoord.xy - uView.xy;
  vec2 uv = px / uView.zw;
  vec3 c;

  bool inLoupe = uLoupe.z > 0.0 && distance(px, uLoupe.xy) < uLoupe.z;
  if (inLoupe) {
    vec2 cuv = uLoupe.xy / uView.zw;
    c = src(cuv + (uv - cuv) / uLoupeMag);
  } else if (uHex > 0.0) {
    vec2 r = vec2(1.0, 1.7320508);
    vec2 q = px / uHex;
    vec2 a = mod(q, r) - r * 0.5;
    vec2 b = mod(q - r * 0.5, r) - r * 0.5;
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    vec2 centre = (q - g) * uHex / uView.zw;
    c = texture(tBase, clamp(centre, 0.0, 1.0)).rgb;
    vec2 ag = abs(g);
    float d = max(dot(ag, normalize(vec2(1.0, 1.7320508))), ag.x) * 2.0;   // 0 centre, 1 edge
    c *= 1.0 - 0.32 * smoothstep(0.82, 1.0, d) - 0.06 * d * d;
  } else if (uBaseIsSrc) {
    c = src(uv);
  } else {
    c = texture(tBase, uv).rgb;
  }

  if (uSharpen > 0.0 && !inLoupe) {
    vec3 sharp = src(uv);
    vec3 soft = texture(tBase, uv).rgb;
    c = max(sharp + uSharpen * (sharp - soft), 0.0);
  }

  c *= uE;
  // Rods take over in dim light: colour drains, blue-greens hold on longer (Purkinje shift)
  float rod = dot(c, vec3(0.05, 0.45, 0.50));
  c = eye(c);
  c = mix(vec3(rod), c, uChroma);
  if (uNoise > 0.0) {
    vec2 gp = floor(gl_FragCoord.xy / 1.5);
    float n = hash(gp + fract(uTime) * 517.0) - 0.5;
    float m = hash(gp.yx * 1.3 + fract(uTime * 1.7) * 311.0) - 0.5;
    c += (n + m) * uNoise * (0.5 * sqrt(max(c, 0.0)) + 0.012);
  }
  o = vec4(uEncode ? toSRGB(c) : c, 1.0);
}`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

export function lightFor(sp, L) {
  const E = L >= 0.999 ? 1 : Math.min(1, L * sp.gain);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const chroma = ss(0.008, 0.08, E);
  return { E, chroma, noise: 0.3 * (1 - ss(0.02, 0.5, E)), blurMul: 1 + 1.5 * (1 - chroma) };
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('webgl2');
    this.gl = gl; this.canvas = canvas;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.down = compile(gl, VS, FS_DOWN);
    this.blur = compile(gl, VS, FS_BLUR);
    this.final = compile(gl, VS, FS_FINAL);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.targets = [];
    this.src = null;
  }

  // source: HTMLImageElement / HTMLCanvasElement / ImageBitmap
  setImage(source) {
    const gl = this.gl;
    if (this.src) gl.deleteTexture(this.src);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    this.src = t;
    this.srcW = source.width; this.srcH = source.height;
  }

  // A small pool of sRGB render targets reused across frames.
  target(i, w, h) {
    const gl = this.gl;
    let t = this.targets[i];
    if (t && t.w === w && t.h === h) return t;
    if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.SRGB8_ALPHA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    t = this.targets[i] = { tex, fb, w, h };
    return t;
  }

  // Draw one eye into rect {x,y,w,h} (px of the bound framebuffer).
  // scale: target px per CSS px. clip: optional [x0, x1] scissor in px.
  drawEye(sp, rect, opts) {
    const gl = this.gl;
    const { scale, L = 1, time = 0, loupe = null, facets = true, outFb = null, encode = true, clip = null } = opts;
    const lt = lightFor(sp, L);
    let sigmaCss = 0;
    if (sp.id === 'eagle') sigmaCss = 1.1;                       // reference blur for unsharp mask
    else if (sp.mar > 1) sigmaCss = 0.42 * Math.sqrt(sp.mar * sp.mar - 1) / ARCMIN_PER_CSS_PX;
    if (sp.id !== 'eagle') sigmaCss *= lt.blurMul;
    const hexPx = sp.hex && facets ? (sp.hex * 60 / ARCMIN_PER_CSS_PX) * scale : 0;
    if (hexPx > 0) sigmaCss = Math.max(sigmaCss * 0.35, hexPx / scale * 0.45);
    const sigma = sigmaCss * scale;

    let baseTex = null;
    if (sigma > 0.25) {
      const k = Math.max(1, sigma / 3);
      const w = Math.max(2, Math.ceil(rect.w / k)), h = Math.max(2, Math.ceil(rect.h / k));
      const s = sigma / k;
      const a = this.target(0, w, h), b = this.target(1, w, h);
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, w, h);
      gl.useProgram(this.down.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.src);
      gl.uniform1i(this.down.u.tSrc, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.useProgram(this.blur.p);
      gl.uniform1i(this.blur.u.t, 0);
      gl.uniform1f(this.blur.u.uSigma, s);
      gl.bindTexture(gl.TEXTURE_2D, a.tex); gl.uniform2f(this.blur.u.uStep, 1 / w, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, b.tex); gl.uniform2f(this.blur.u.uStep, 0, 1 / h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb); gl.drawArrays(gl.TRIANGLES, 0, 3);
      baseTex = a.tex;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, outFb);
    gl.viewport(rect.x, rect.y, rect.w, rect.h);
    if (clip) { gl.enable(gl.SCISSOR_TEST); gl.scissor(clip[0], rect.y, Math.max(0, clip[1] - clip[0]), rect.h); }
    else gl.disable(gl.SCISSOR_TEST);
    const f = this.final;
    gl.useProgram(f.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.src); gl.uniform1i(f.u.tSrc, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, baseTex || this.src); gl.uniform1i(f.u.tBase, 1);
    gl.uniform1i(f.u.uBaseIsSrc, baseTex ? 0 : 1);
    gl.uniform4f(f.u.uView, rect.x, rect.y, rect.w, rect.h);
    gl.uniform1i(f.u.uMode, sp.mode);
    const m = MATRICES[sp.matrix];
    gl.uniform1i(f.u.uUseMat, m ? 1 : 0);
    gl.uniformMatrix3fv(f.u.uMat, true, m || [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    gl.uniform1f(f.u.uSat, sp.sat);
    gl.uniform1f(f.u.uE, lt.E);
    gl.uniform1f(f.u.uChroma, lt.chroma);
    gl.uniform1f(f.u.uNoise, lt.noise);
    gl.uniform1f(f.u.uTime, time);
    gl.uniform1f(f.u.uHex, hexPx);
    gl.uniform1f(f.u.uSharpen, sp.id === 'eagle' && baseTex ? 0.45 : 0);
    if (loupe) gl.uniform3f(f.u.uLoupe, loupe.x, loupe.y, loupe.r); else gl.uniform3f(f.u.uLoupe, 0, 0, -1);
    gl.uniform1f(f.u.uLoupeMag, 3);
    gl.uniform1i(f.u.uEncode, encode ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
  }

  // Render into an offscreen RGBA8 target and return a 2D canvas.
  snapshot(w, h, draw) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    draw(fb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb); gl.deleteTexture(tex);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    const row = w * 4;
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

export { SPECIES };
