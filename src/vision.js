// Species models and the one shader that turns a 360° snapshot of the room
// into what each animal would (approximately) see.
//
// Pipeline per frame:
//   1. Render the room into a cube map from the eye position (normal light).
//   2. If needed, render again with every surface painted by its UV
//      reflectance (bee) or by its temperature (snake).
//   3. A full-screen shader picks a direction for each pixel through the
//      species' field of view, samples the cube maps with the species'
//      blur, converts colour with its cone model, and tone-maps.
import * as THREE from 'three';

// acuity: how many times coarser than human 20/20 the finest detail is
//         (1 = human; the screen pixel stands in for the human limit)
// fov / binoc: total horizontal field and binocular overlap in degrees
// gain: how much more a species gets out of dim light than we do
// eye: eye height in metres when "each at its own height" is on
export const SPECIES = [
  {
    id: 'human', emoji: '🧒', color: '#f2b84b',
    name: { zh: '人', en: 'Human' }, latin: 'Homo sapiens',
    mode: 0, acuity: 1, sat: 1, gain: 1, scotopic: 1, fov: 200, binoc: 120, eye: 1.55,
    info: {
      zh: { colour: '三色视觉：约 420 / 530 / 560 nm 三种视锥', acuity: '20/20，约 30 周/度（本页的参照）', fov: '约 200°，双眼重叠约 120°', night: '参照值：弱光下颜色先消失', height: '大人站着约 1.55 m', look: '这是对照组。记住红球有多显眼、视力表能看到第几行。' },
      en: { colour: 'Trichromat: cones near 420 / 530 / 560 nm', acuity: '20/20, about 30 cycles/degree (the reference)', fov: 'About 200°, ~120° binocular', night: 'Reference: colour fades first in dim light', height: 'Standing adult ≈ 1.55 m', look: 'The control. Note how loud the red ball is and how far down the eye chart you can read.' },
    },
  },
  {
    id: 'dog', emoji: '🐶', color: '#c98b4f',
    name: { zh: '狗', en: 'Dog' }, latin: 'Canis familiaris',
    mode: 1, acuity: 3.75, sat: 0.95, gain: 3.5, scotopic: 1, fov: 250, binoc: 60, eye: 0.5,
    info: {
      zh: { colour: '二色视觉：约 429 / 555 nm 两种视锥，红绿合一，蓝黄分明', acuity: '约 20/75，细节约为人的 1/4', fov: '约 240–250°，双眼重叠约 60°', night: '视网膜后有反光层，弱光下明显好于人', height: '中型犬约 0.5 m', look: '绿毯上的红皮球还显眼吗？红封面的书和绿玻璃瓶还分得开吗？' },
      en: { colour: 'Dichromat: cones near 429 / 555 nm; red and green merge, blue and yellow stay', acuity: 'About 20/75, a quarter of our detail', fov: 'About 240–250°, ~60° binocular', night: 'Reflective tapetum: clearly better than us in dim light', height: 'Medium dog ≈ 0.5 m', look: 'Is the red ball still loud on the green rug? Can you tell the red book from the green bottle?' },
    },
  },
  {
    id: 'cat', emoji: '🐱', color: '#8a8f9c',
    name: { zh: '猫', en: 'Cat' }, latin: 'Felis catus',
    mode: 1, acuity: 7, sat: 0.6, gain: 6, scotopic: 1, fov: 200, binoc: 140, eye: 0.25,
    info: {
      zh: { colour: '二色视觉：约 450 / 555 nm，视锥少，颜色很淡', acuity: '约 20/100–20/200，远处一片朦胧', fov: '约 200°，双眼重叠约 140°', night: '只需人类约 1/6 的光就能看清', height: '约 0.25 m', look: '关灯试试：人眼一片黑的时候，猫还能看到多少？' },
      en: { colour: 'Dichromat: cones near 450 / 555 nm; few cones, washed-out colour', acuity: 'About 20/100–20/200; distance is a soft haze', fov: 'About 200°, ~140° binocular', night: 'Needs roughly 1/6 of the light we do', height: '≈ 0.25 m', look: 'Turn the lights off: when we see black, how much does the cat still see?' },
    },
  },
  {
    id: 'bee', emoji: '🐝', color: '#f6c21c',
    name: { zh: '蜜蜂', en: 'Honeybee' }, latin: 'Apis mellifera',
    mode: 2, acuity: 1.6, mosaic: 1.8, sat: 1, gain: 0.8, scotopic: 0, fov: 330, binoc: 30, eye: 0.85,
    info: {
      zh: { colour: '三色，但换了一组：紫外 344 / 蓝 436 / 绿 544 nm，看不到红。假色显示：绿→红、蓝→绿、紫外→蓝', acuity: '复眼每个"像素"约 1.5–2°，非常粗', fov: '接近 360°，只有身后一小块盲区', night: '白天活动，弱光下很差', height: '悬停在花旁约 0.85 m', look: '向日葵的花瓣在紫外里是"靶心"：外圈亮、里圈暗，指向花蜜。' },
      en: { colour: 'Trichromat with a shifted set: UV 344 / blue 436 / green 544 nm, blind to red. False colour: green→red, blue→green, UV→blue', acuity: 'Each compound-eye "pixel" spans about 1.5–2°', fov: 'Nearly 360°, small blind spot behind', night: 'Day-active, poor in dim light', height: 'Hovering by the flowers ≈ 0.85 m', look: 'In UV the sunflower petals form a bullseye, bright tips and dark centre, pointing at the nectar.' },
    },
  },
  {
    id: 'eagle', emoji: '🦅', color: '#7a5230',
    name: { zh: '鹰', en: 'Eagle' }, latin: 'Aquila / Haliaeetus',
    mode: 3, acuity: 0.35, fovea: 0.3, sat: 1.18, gain: 0.8, scotopic: 1, fov: 220, binoc: 40, eye: 1.0,
    info: {
      zh: { colour: '四色视觉（多一种短波视锥），视锥里的油滴让颜色更饱和', acuity: '约 20/5，是人的 3–4 倍；深中央凹像一个长焦镜头', fov: '约 200° 以上，双眼重叠很窄（约 30–50°）', night: '白天的猎手，夜里不如人', height: '落在椅背上约 1.0 m', look: '视力表最下面一行。中间会被"放大"，那是中央凹的长焦效果。' },
      en: { colour: 'Tetrachromat (an extra short-wave cone); oil droplets sharpen colour', acuity: 'About 20/5, 3–4× ours; the deep fovea acts like a telephoto lens', fov: '200°+, narrow binocular zone (~30–50°)', night: 'A daytime hunter; worse than us at night', height: 'Perched on a chair back ≈ 1.0 m', look: 'The bottom row of the eye chart. The centre is magnified: that is the fovea\'s telephoto effect.' },
    },
  },
  {
    id: 'snake', emoji: '🐍', color: '#4f9a45',
    name: { zh: '蝮蛇', en: 'Pit viper' }, latin: 'Crotalinae',
    mode: 4, acuity: 6, sat: 0.35, gain: 2, scotopic: 1, fov: 170, binoc: 45, eye: 0.03, thermalBlur: 2.2,
    info: {
      zh: { colour: '眼睛是二色视觉；眼睛和鼻孔之间的"颊窝"能感受热（红外）', acuity: '眼睛一般；颊窝的热像更模糊，像隔着毛玻璃', fov: '约 170°（示意，因种而异）', night: '热像不需要光：关灯也照样"看见"温度', height: '贴着地面约 3 cm', look: '找那杯刚泡的热茶，再对比茶几上凉掉的那杯和暖气片。窗玻璃对它来说是一堵冷墙。' },
      en: { colour: 'Eyes are dichromatic; the "pit" between eye and nostril senses heat (infrared)', acuity: 'Modest eyes; the pit image is blurrier still, like frosted glass', fov: 'About 170° (illustrative; varies by species)', night: 'Heat needs no light: lights off changes nothing', height: 'Flat on the floor ≈ 3 cm', look: 'Find the freshly made tea, then compare the cold cup on the coffee table and the radiator. Window glass is a cold wall to it.' },
    },
  },
];

// Machado, Oliveira & Fernandes (2009), deuteranopia, severity 1.0 (linear RGB).
// Dogs and cats keep a short-wave cone and one long-wave cone near 555 nm,
// so red-green information collapses in the same way.
const DEUTAN = new THREE.Matrix3().set(
  0.367322, 0.860646, -0.227968,
  0.280085, 0.672501, 0.047413,
  -0.011820, 0.042940, 0.968881,
);

const frag = /* glsl */`
uniform samplerCube tN;
uniform samplerCube tU;
uniform samplerCube tT;
uniform mat3 uRot;
uniform mat3 uDeutan;
uniform vec4 uRect;       // viewport x, y, w, h in device px
uniform float uHfov;      // radians across the viewport
uniform float uCubeRes;
uniform float uCubeResSmall;
uniform float uDpr;
uniform int uMode;
uniform float uAcuity;
uniform float uMosaic;    // radians, 0 = none
uniform float uFovea;
uniform float uSat;
uniform float uGain;
uniform float uScotopic;
uniform float uThermalBlur;
uniform float uExposure;
uniform float uTime;
uniform float uFlash;     // brief brightness pulse when switching species
in vec2 vUv;
out vec4 outColor;

const float PI = 3.14159265;

vec3 dirFromP(vec2 p) {
  float r = length(p);
  float th = 2.0 * atan(r * 0.5);              // stereographic: r = 2 tan(theta/2)
  vec2 xy = r > 1e-6 ? p / r * sin(th) : vec2(0.0);
  return normalize(uRot * vec3(xy, -cos(th)));
}

vec3 tangentA(vec3 d) { return normalize(cross(abs(d.y) < 0.99 ? vec3(0,1,0) : vec3(1,0,0), d)); }

vec3 sampleBlur(samplerCube t, vec3 d, float rad, float res) {
  float texel = (PI * 0.5) / res;
  if (rad < texel * 0.75) return textureLod(t, d, 0.0).rgb;
  float lod = clamp(log2(rad / texel) - 0.6, 0.0, 9.0);
  vec3 a = tangentA(d), b = cross(d, a);
  vec3 acc = textureLod(t, d, lod).rgb * 2.0;
  float w = 2.0;
  for (int i = 0; i < 8; i++) {
    float ang = float(i) * PI * 0.25 + 0.39;
    vec3 dd = normalize(d + (a * cos(ang) + b * sin(ang)) * rad * 0.7);
    acc += textureLod(t, dd, lod).rgb;
    w += 1.0;
  }
  return acc / w;
}

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// ACES Filmic, exactly as three.js's ACESFilmicToneMapping (exposure is applied before, via uExposure)
vec3 avRRTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 x) {
  const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  x = ACESInputMat * (x / 0.6);
  x = avRRTFit(x);
  return clamp(ACESOutputMat * x, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// inferno-like ramp for heat
vec3 heatRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.0, 0.0, 0.02), c1 = vec3(0.34, 0.06, 0.43), c2 = vec3(0.85, 0.26, 0.2), c3 = vec3(0.99, 0.65, 0.04), c4 = vec3(0.99, 0.99, 0.75);
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.5) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c2, c3, (t - 0.5) / 0.25);
  return mix(c3, c4, (t - 0.75) / 0.25);
}

void main() {
  vec2 local = gl_FragCoord.xy - uRect.xy;
  vec2 ndc = local / uRect.zw * 2.0 - 1.0;
  float k = 2.0 * tan(uHfov * 0.25);
  vec2 q = vec2(ndc.x, ndc.y * uRect.w / uRect.z);
  // eagle: the deep fovea magnifies the centre of the view
  if (uFovea > 0.0) q *= 1.0 - uFovea * exp(-dot(q, q) / 0.06);
  vec2 p = q * k;
  float pxAngle = (2.0 * k / uRect.z) / (1.0 + dot(p, p) * 0.25);

  float hexEdge = 0.0;
  if (uMosaic > 0.0) {
    // honeybee ommatidia: a hexagonal mosaic of ~1.8° facets
    vec2 s = vec2(1.0, 1.7320508);
    vec2 g = p / uMosaic;
    vec2 a = mod(g, s) - s * 0.5;
    vec2 b = mod(g - s * 0.5, s) - s * 0.5;
    vec2 h = dot(a, a) < dot(b, b) ? a : b;
    vec2 centre = g - h;
    p = centre * uMosaic;
    float e = max(abs(h.x) * 0.866 + abs(h.y) * 0.5, abs(h.y));
    hexEdge = smoothstep(0.40, 0.5, e);
  }

  vec3 d = dirFromP(p);
  float blur = uAcuity * pxAngle * uDpr + uMosaic * 0.35;
  vec3 c = sampleBlur(tN, d, max(blur, 0.0), uCubeRes);

  if (uMode == 1) {                       // dog / cat: dichromat
    c = max(uDeutan * c, 0.0);
  } else if (uMode == 2) {                // bee: UV / blue / green, false colour
    float uv = sampleBlur(tU, d, blur, uCubeResSmall).r;
    float gB = dot(c, vec3(0.12, 0.80, 0.08));
    float bB = dot(c, vec3(0.02, 0.18, 0.80));
    c = vec3(gB, bB, uv * 0.9);
  } else if (uMode == 3) {                // eagle: crisper, richer
    vec3 soft = sampleBlur(tN, d, pxAngle * uDpr * 2.5, uCubeRes);
    c = max(c + (c - soft) * 0.9, 0.0);
  } else if (uMode == 4) {                // pit viper: dim dichromat eyes + infrared pits
    c = max(uDeutan * c, 0.0) * 0.55;
  }

  float L = lum(c);
  c = max(mix(vec3(L), c, uSat), 0.0);
  c *= uExposure * uGain;

  // dim light: rods take over, colour drains, a blue-grey grain appears
  float Lg = lum(c);
  float rod = uScotopic * (1.0 - smoothstep(0.004, 0.06, Lg));
  c = mix(c, vec3(Lg) * vec3(0.82, 0.95, 1.2), rod * 0.85);
  c += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * rod * 0.02;

  if (uMode == 4) {
    float t = sampleBlur(tT, d, max(blur, uThermalBlur * PI / 180.0), uCubeResSmall).r;
    // room temperature sits near black; only warm things light up
    float tw = smoothstep(0.17, 0.95, t);
    vec3 hc = heatRamp(tw) * 1.4;
    float heat = smoothstep(0.02, 0.45, tw);
    c = mix(c, hc, heat) + hc * 0.25;
  }

  c = aces(c);
  c *= 1.0 - hexEdge * 0.35;
  // gentle vignette so wide views read as an eye, not a camera
  float vig = smoothstep(1.45, 0.55, length(ndc * vec2(1.0, 0.9)));
  c *= mix(0.72, 1.0, vig);
  c += uFlash;
  outColor = vec4(toSRGB(clamp(c, 0.0, 1.0)), 1.0);
}
`;

const vert = /* glsl */`
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export function makeVisionMaterial() {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vert,
    fragmentShader: frag,
    depthTest: false, depthWrite: false,
    uniforms: {
      tN: { value: null }, tU: { value: null }, tT: { value: null },
      uRot: { value: new THREE.Matrix3() },
      uDeutan: { value: DEUTAN },
      uRect: { value: new THREE.Vector4() },
      uHfov: { value: 1.7 }, uCubeRes: { value: 512 }, uCubeResSmall: { value: 512 }, uDpr: { value: 1 },
      uMode: { value: 0 }, uAcuity: { value: 1 }, uMosaic: { value: 0 }, uFovea: { value: 0 },
      uSat: { value: 1 }, uGain: { value: 1 }, uScotopic: { value: 1 }, uThermalBlur: { value: 0 },
      uExposure: { value: 1 }, uTime: { value: 0 }, uFlash: { value: 0 },
    },
  });
}

export function applySpecies(mat, sp, { realFov, baseFov, night }) {
  const u = mat.uniforms;
  u.uMode.value = sp.mode;
  // Human acuity is the screen pixel, so "1" means no blur at all.
  u.uAcuity.value = Math.max(0, sp.acuity - 1) * 0.9;
  u.uMosaic.value = sp.mosaic ? sp.mosaic * Math.PI / 180 : 0;
  u.uFovea.value = sp.fovea || 0;
  u.uSat.value = sp.sat;
  u.uGain.value = night ? sp.gain : 1;
  u.uScotopic.value = sp.scotopic;
  u.uThermalBlur.value = sp.thermalBlur || 0;
  u.uHfov.value = (realFov ? Math.min(sp.fov, 230) : baseFov) * Math.PI / 180; // wider than ~230° turns into a tiny-planet swirl on a flat screen
}
