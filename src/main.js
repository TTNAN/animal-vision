import * as THREE from 'three';
import { buildRoom, animateRoom, ROOM } from './room.js';
import { SPECIES, makeVisionMaterial, applySpecies } from './vision.js';
import { I18N, QUESTS } from './i18n.js';

// ------------------------------------------------------------------ setup
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: new URLSearchParams(location.search).get('aa') !== '0', powerPreference: 'high-performance', preserveDrawingBuffer: true });
const DPR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(DPR);
// Colour pipeline. The room is rendered linear (HDR, half-float) into cube maps; the vision shader
// samples those and finishes the image itself, so it reads these two settings and applies
// ACES Filmic (three.js's own curve) and the sRGB encode at the very end, after the animal's eye.
renderer.outputColorSpace = THREE.SRGBColorSpace;
if (new URLSearchParams(location.search).get('tm') !== '0') renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = Number(new URLSearchParams(location.search).get('exposure')) || 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.autoClear = false;

const isSmall = Math.min(screen.width, screen.height) < 700;
const params = new URLSearchParams(location.search);
const CUBE = Number(params.get('cube')) || (isSmall ? 512 : 1024);
const floatOK = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
function cubeTarget(size = CUBE) {
  return new THREE.WebGLCubeRenderTarget(size, {
    type: floatOK ? THREE.HalfFloatType : THREE.UnsignedByteType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });
}
// the UV and heat images are blurred anyway, so they get smaller maps
const SMALL = Math.min(CUBE, 512);
const rtN = cubeTarget(), rtU = cubeTarget(SMALL), rtT = cubeTarget(SMALL);
const near = 0.015, far = 30;
const camN = new THREE.CubeCamera(near, far, rtN);
const camU = new THREE.CubeCamera(near, far, rtU);
const camT = new THREE.CubeCamera(near, far, rtT);
// Anti-aliasing for the colour pass only: the face target below is 4× multisampled. The UV and heat passes are blurred anyway and skip it. ?msaa=0 turns it off.
const MSAA = params.get('msaa') !== '0' && !isSmall && renderer.capabilities.maxSamples >= 4;
// The colour pass always draws each face into this 2D target first, then copies it into the cube:
// three.js's transmission pass (window and bottle glass) restores the render target without its
// cube face, which would wipe face 0 and leave the others empty.
const msaaRT = new THREE.WebGLRenderTarget(CUBE, CUBE, { type: floatOK ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: MSAA ? 4 : 0, depthBuffer: true });
// One camera object renders all six faces: the glass's transmission buffer is cached per camera,
// so this keeps it to one buffer instead of six.
const faceCam = new THREE.PerspectiveCamera(90, 1, near, far);
const copyMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false, uniforms: { t: { value: null } },
  vertexShader: 'out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'uniform sampler2D t; in vec2 vUv; out vec4 o; void main() { o = texture(t, vUv); }',
});
const copyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat); copyQuad.frustumCulled = false;
const copyScene = new THREE.Scene(); copyScene.add(copyQuad);
const copyCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const loadingEl = document.createElement('div');
loadingEl.id = 'loading';
loadingEl.textContent = '0%';
document.body.appendChild(loadingEl);
const room = await buildRoom(scene, renderer, f => { loadingEl.textContent = Math.round(f * 100) + '%'; });
loadingEl.remove();
scene.add(camN, camU, camT);

// --------------------------------------------------- UV / thermal passes
const meshes = [];
room.groupRoot.traverse(o => { if (o.isMesh) { o.userData.matN = o.material; meshes.push(o); } });
const cache = new Map();
function alphaOpts(orig) {
  const o = Array.isArray(orig) ? orig[0] : orig;
  if (o.alphaTest > 0 || o.alphaMap) return { map: o.map || null, alphaMap: o.alphaMap || null, alphaTest: o.alphaTest || 0.4, transparent: !!o.alphaMap, side: o.side };
  return { side: o.side };
}
function uvMat(m) {
  const ud = m.userData;
  const key = `uv:${ud.uv}:${ud.uvMap ? ud.uvMap.uuid : ''}:${ud.uvEmit}:${ud.glass}:${m.userData.matN.uuid}`;
  if (cache.has(key)) return cache.get(key);
  const c = new THREE.Color(ud.uv, ud.uv, ud.uv);
  let mat;
  if (ud.glass) mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.12 });
  else if (ud.uvEmit) mat = new THREE.MeshBasicMaterial({ color: c, side: ud.matN.side });
  else if (ud.uvMap) mat = new THREE.MeshLambertMaterial({ map: ud.uvMap, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  else { const a = alphaOpts(ud.matN); delete a.map; mat = new THREE.MeshLambertMaterial({ color: c, ...a }); }
  cache.set(key, mat);
  return mat;
}
const tNorm = t => THREE.MathUtils.clamp((t - 12) / 40, 0, 1);
function thermalMat(m) {
  const ud = m.userData;
  const v = tNorm(ud.temp);
  const a = alphaOpts(ud.matN);
  const key = `t:${v.toFixed(3)}:${a.map ? a.map.uuid : ''}:${a.alphaMap ? a.alphaMap.uuid : ''}`;
  if (cache.has(key)) return cache.get(key);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v), ...a });
  if (a.map) { mat.color.setRGB(v / 0.95, v, v); }
  cache.set(key, mat);
  return mat;
}
const bgUV = new THREE.Color(0.75, 0.75, 0.75), bgT = new THREE.Color(tNorm(9), tNorm(9), tNorm(9));
let bgNormalIntensity = 2.2;
function setPass(pass) {
  for (const m of meshes) m.material = pass === 'uv' ? uvMat(m) : pass === 'thermal' ? thermalMat(m) : m.userData.matN;
  // lights don't matter to the thermal pass (MeshBasic), but the UV pass is lit
}

// Render the six faces ourselves, clearing each one (CubeCamera.update skipped
// the clear with autoClear off and left a face black on some drivers).
function cubeUpdate(cam, aa = false) {
  if (cam.coordinateSystem !== renderer.coordinateSystem) { cam.coordinateSystem = renderer.coordinateSystem; cam.updateCoordinateSystem(); }
  cam.updateMatrixWorld();
  const rt = cam.renderTarget, mips = rt.texture.generateMipmaps;
  const ms = aa && msaaRT && msaaRT.width === rt.width;
  for (let f = 0; f < 6; f++) {
    const c = cam.children[f];
    c.matrixWorld.decompose(faceCam.position, faceCam.quaternion, faceCam.scale);
    faceCam.projectionMatrix.copy(c.projectionMatrix); faceCam.projectionMatrixInverse.copy(c.projectionMatrixInverse);
    faceCam.updateMatrixWorld(true);
    // first frame: build the mip chain after every face, which some drivers need before a face can be drawn into
    rt.texture.generateMipmaps = (f === 5 || !rt.warm) ? mips : false;
    if (ms) {
      renderer.setRenderTarget(msaaRT);
      renderer.clear();
      renderer.render(scene, faceCam);
      copyMat.uniforms.t.value = msaaRT.texture;
      renderer.setRenderTarget(rt, f);
      renderer.render(copyScene, copyCam);
    } else {
      renderer.setRenderTarget(rt, f);
      renderer.clear();
      renderer.render(scene, faceCam);
    }
  }
  renderer.setRenderTarget(null);
  rt.warm = true;
}

// ------------------------------------------------------- full-screen pass
const visionMat = makeVisionMaterial();
visionMat.uniforms.tN.value = rtN.texture;
visionMat.uniforms.tU.value = rtU.texture;
visionMat.uniforms.tT.value = rtT.texture;
visionMat.uniforms.uCubeRes.value = CUBE;
visionMat.uniforms.uCubeResSmall.value = SMALL;
visionMat.uniforms.uDpr.value = DPR;
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), visionMat);
quad.frustumCulled = false;
const quadScene = new THREE.Scene(); quadScene.add(quad);
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ----------------------------------------------------------------- state
const state = {
  lang: (navigator.language || 'zh').startsWith('zh') ? 'zh' : 'en',
  species: 'dog',
  compare: 'split',     // single | split | grid
  height: 'toy',        // toy | baby | own
  night: false,
  realFov: false,
  split: 0.5,
  pos: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  bob: 0,
};
if (params.get('lang')) state.lang = params.get('lang');
const BASE_FOV = 100;
const HEIGHTS = { toy: 0.1, baby: 0.35 };
const sp = id => SPECIES.find(s => s.id === id);

function eyeHeight() {
  if (state.height === 'own' && state.compare === 'single') return sp(state.species).eye;
  return HEIGHTS[state.height === 'own' ? 'toy' : state.height];
}

// ---------------------------------------------------------- movement
const keys = new Set();
const tween = { active: false };
function blocked(x, z, y) {
  const r = 0.09;
  if (x < -ROOM.w / 2 + r || x > ROOM.w / 2 - r || z < -ROOM.d / 2 + r || z > ROOM.d / 2 - r) return true;
  for (const c of room.colliders) {
    if (y < c.y0 || y > c.y1) continue;
    if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true;
  }
  return false;
}
function free(x, z, y) {
  if (!blocked(x, z, y)) return [x, z];
  for (let rad = 0.05; rad < 2; rad += 0.05) for (let a = 0; a < 16; a++) {
    const nx = x + Math.cos(a / 16 * Math.PI * 2) * rad, nz = z + Math.sin(a / 16 * Math.PI * 2) * rad;
    if (!blocked(nx, nz, y)) return [nx, nz];
  }
  return [x, z];
}
function goTo(name, instant = false) {
  const p = room.presets[name];
  if (!p) return;
  const from = { x: state.pos.x, z: state.pos.z, yaw: state.yaw, pitch: state.pitch };
  let dyaw = p.yaw - from.yaw;
  dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  const to = { x: p.pos[0], z: p.pos[1], yaw: from.yaw + dyaw, pitch: p.pitch };
  if (instant) { state.pos.x = to.x; state.pos.z = to.z; state.yaw = to.yaw; state.pitch = to.pitch; return; }
  Object.assign(tween, { active: true, t: 0, from, to });
}

// pointer look
let drag = null;
canvas.addEventListener('pointerdown', e => {
  if (state.compare === 'split' && Math.abs(e.clientX - canvas.getBoundingClientRect().left - state.split * canvas.clientWidth) < 22) {
    drag = { split: true };
  } else drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, pitch: state.pitch };
  canvas.setPointerCapture(e.pointerId);
  tween.active = false;
  hideHint();
});
canvas.addEventListener('pointermove', e => {
  if (!drag) {
    if (state.compare === 'split') {
      const near = Math.abs(e.clientX - canvas.getBoundingClientRect().left - state.split * canvas.clientWidth) < 22;
      canvas.style.cursor = near ? 'ew-resize' : 'grab';
    }
    return;
  }
  if (drag.split) {
    const r = canvas.getBoundingClientRect();
    state.split = THREE.MathUtils.clamp((e.clientX - r.left) / r.width, 0.05, 0.95);
    return;
  }
  const s = 2.6 / canvas.clientWidth * (BASE_FOV / 100);
  state.yaw = drag.yaw + (e.clientX - drag.x) * s;
  state.pitch = THREE.MathUtils.clamp(drag.pitch + (e.clientY - drag.y) * s, -0.6, 1.25);
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
window.addEventListener('keydown', e => {
  if (e.target.closest('input,textarea')) return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { keys.add(k); tween.active = false; hideHint(); if (k.startsWith('arrow')) e.preventDefault(); }
  const idx = '123456'.indexOf(e.key);
  if (idx >= 0) setSpecies(SPECIES[idx].id);
  if (k === 'n') toggle('night');
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
document.querySelectorAll('[data-dpad]').forEach(b => {
  const k = b.dataset.dpad;
  const on = e => { e.preventDefault(); keys.add(k); tween.active = false; hideHint(); };
  const off = () => keys.delete(k);
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});

function updateMove(dt) {
  if (tween.active) {
    tween.t = Math.min(1, tween.t + dt / 1.1);
    const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
    state.pos.x = THREE.MathUtils.lerp(tween.from.x, tween.to.x, e);
    state.pos.z = THREE.MathUtils.lerp(tween.from.z, tween.to.z, e);
    state.yaw = THREE.MathUtils.lerp(tween.from.yaw, tween.to.yaw, e);
    state.pitch = THREE.MathUtils.lerp(tween.from.pitch, tween.to.pitch, e);
    if (tween.t >= 1) tween.active = false;
  }
  let f = 0, s = 0, turn = 0;
  if (keys.has('w') || keys.has('arrowup')) f += 1;
  if (keys.has('s') || keys.has('arrowdown')) f -= 1;
  if (keys.has('a')) s -= 1;
  if (keys.has('d')) s += 1;
  if (keys.has('arrowleft')) turn += 1;
  if (keys.has('arrowright')) turn -= 1;
  state.yaw += turn * dt * 1.4;
  const moving = f || s;
  if (moving) {
    const speed = (keys.has('shift') ? 1.2 : 0.55) * dt;
    const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
    const rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);
    const dx = (fx * f + rx * s) * speed, dz = (fz * f + rz * s) * speed;
    const y = eyeHeight();
    if (!blocked(state.pos.x + dx, state.pos.z, y)) state.pos.x += dx;
    if (!blocked(state.pos.x, state.pos.z + dz, y)) state.pos.z += dz;
    state.bob += dt * 9;
  }
}

// ------------------------------------------------------------------ night
const DAY = {
  sun: room.lights.sun.intensity, sky: room.lights.skyPanel.intensity, hemi: room.lights.hemi.intensity,
  lamp: room.lights.lamp.intensity, pendant: room.lights.pendant.intensity, env: scene.environmentIntensity,
  skyMat: room.lights.skyMat.color.r, bulb: room.lights.lampBulb.material.emissiveIntensity,
};
function applyLighting() {
  const L = room.lights, n = state.night;
  // lights off: no sun, no lamps; only a little blue moonlight and city glow through the window
  L.sun.intensity = n ? 0.22 : DAY.sun;
  L.sun.color.set(n ? 0x8fa8ff : 0xffe0b8);
  L.skyPanel.intensity = n ? 0.1 : DAY.sky;
  L.skyPanel.color.set(n ? 0x5a78c8 : 0xc5d4e8);
  L.hemi.intensity = n ? 0.004 : DAY.hemi;
  L.lamp.intensity = n ? 0 : DAY.lamp;
  L.pendant.intensity = n ? 0 : DAY.pendant;
  L.lampBulb.material.emissiveIntensity = n ? 0 : DAY.bulb;
  L.lampBulb.userData.temp = n ? 24 : 75;
  scene.environmentIntensity = n ? 0.02 : DAY.env;
  L.skyMat.color.setScalar(n ? 0.03 : DAY.skyMat);
  renderer.shadowMap.needsUpdate = true;
}

// --------------------------------------------------------------- viewports
function viewports() {
  const W = canvas.width, H = canvas.height;
  const cur = sp(state.species);
  if (state.compare === 'single') return [{ sp: cur, rect: [0, 0, W, H], label: true }];
  if (state.compare === 'split') {
    const sx = Math.round(state.split * W);
    return [
      { sp: sp('human'), rect: [0, 0, W, H], scissor: [0, 0, sx, H], label: 'left' },
      { sp: cur, rect: [0, 0, W, H], scissor: [sx, 0, W - sx, H], label: 'right' },
    ];
  }
  const portrait = H > W * 1.1;
  const cols = portrait ? 2 : 3, rows = portrait ? 3 : 2;
  const gap = Math.round(3 * DPR);
  const cw = Math.floor((W - gap * (cols - 1)) / cols), chh = Math.floor((H - gap * (rows - 1)) / rows);
  return SPECIES.map((s, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = c * (cw + gap), y = H - (r + 1) * chh - r * gap;
    return { sp: s, rect: [x, y, cw, chh], scissor: [x, y, cw, chh], label: 'grid' };
  });
}

// ---------------------------------------------------------------- render
const rotM4 = new THREE.Matrix4();
const euler = new THREE.Euler();
let last = performance.now(), flashAt = -1e9, tStart = last;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  resize();
  updateMove(dt);
  const t = (now - tStart) / 1000;
  animateRoom(room.animated, t);

  const y = eyeHeight() + (keysMoving() ? Math.sin(state.bob) * 0.006 : 0);
  const eye = new THREE.Vector3(state.pos.x, y, state.pos.z);
  camN.position.copy(eye); camU.position.copy(eye); camT.position.copy(eye);

  const vps = viewports();
  const needUV = vps.some(v => v.sp.mode === 2);
  const needT = vps.some(v => v.sp.mode === 4);
  setPass('normal'); cubeUpdate(camN, true);
  if (needUV) { setPass('uv'); cubeUpdate(camU); }
  if (needT) { setPass('thermal'); cubeUpdate(camT); }
  if (needUV || needT) setPass('normal');

  euler.set(state.pitch, state.yaw, (keysMoving() ? Math.sin(state.bob * 0.5) * 0.01 : 0), 'YXZ');
  rotM4.makeRotationFromEuler(euler);
  visionMat.uniforms.uRot.value.setFromMatrix4(rotM4);
  visionMat.uniforms.uTime.value = t;
  const flash = Math.max(0, 1 - (now - flashAt) / 450);

  renderer.setRenderTarget(null);
  renderer.setScissorTest(false);
  renderer.setClearColor(0x0e0c0a, 1);
  renderer.clear();
  renderer.setScissorTest(true);
  for (const v of vps) {
    applySpecies(visionMat, v.sp, { realFov: state.realFov, baseFov: BASE_FOV, night: state.night });
    visionMat.uniforms.uExposure.value = renderer.toneMappingExposure;
    visionMat.uniforms.uFlash.value = v.sp.id === state.species ? flash * 0.15 : 0;
    const [x, y0, w, h] = v.rect;
    visionMat.uniforms.uRect.value.set(x, y0, w, h);
    renderer.setViewport(x / DPR, y0 / DPR, w / DPR, h / DPR);
    const s = v.scissor || v.rect;
    renderer.setScissor(s[0] / DPR, s[1] / DPR, s[2] / DPR, s[3] / DPR);
    renderer.render(quadScene, quadCam);
  }
  renderer.setScissorTest(false);
  placeLabels(vps);
  window.__frames = (window.__frames || 0) + 1;
  requestAnimationFrame(frame);
}
const keysMoving = () => ['w', 's', 'a', 'd', 'arrowup', 'arrowdown'].some(k => keys.has(k));

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * DPR) || canvas.height !== Math.round(h * DPR)) renderer.setSize(w, h, false);
}

// ------------------------------------------------------------------- UI
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const labelsEl = $('#labels');
let labelKey = '';
function placeLabels(vps) {
  const key = state.compare + state.species + state.lang + state.split.toFixed(3) + canvas.width + canvas.height;
  if (key === labelKey) return;
  labelKey = key;
  const L = state.lang;
  labelsEl.innerHTML = '';
  const W = canvas.width, H = canvas.height;
  for (const v of vps) {
    const el = document.createElement('div');
    el.className = 'vlabel';
    el.style.setProperty('--c', v.sp.color);
    el.innerHTML = `<span>${v.sp.emoji}</span>${v.sp.name[L]}`;
    if (v.label === 'grid') {
      el.style.left = (v.rect[0] / W * 100) + '%';
      el.style.top = ((H - v.rect[1] - v.rect[3]) / H * 100) + '%';
    } else if (v.label === 'left') {
      el.style.left = '0'; el.style.top = '0';
      el.style.opacity = state.split < 0.12 ? 0 : 1;
    } else if (v.label === 'right') {
      el.style.right = '0'; el.style.top = '0';
      el.style.opacity = state.split > 0.88 ? 0 : 1;
    } else { el.style.left = '0'; el.style.top = '0'; }
    labelsEl.appendChild(el);
  }
  const hd = $('#splitHandle');
  hd.hidden = state.compare !== 'split';
  hd.style.left = (state.split * 100) + '%';
}

function t(key) { return (I18N[state.lang] && I18N[state.lang][key]) ?? I18N.zh[key] ?? key; }

function renderInfo() {
  const s = sp(state.species), L = state.lang, inf = s.info[L];
  $('#infoName').innerHTML = `<span class="em">${s.emoji}</span>${s.name[L]} <i>${s.latin}</i>`;
  $('#infoRows').innerHTML = [['colour', inf.colour], ['acuity', inf.acuity], ['fov', inf.fov], ['night', inf.night], ['height', inf.height]]
    .map(([k, v]) => `<div class="row"><b>${t('row_' + k)}</b><span>${v}</span></div>`).join('');
  $('#infoLook').textContent = inf.look;
  $('#fovSvg').innerHTML = fovSvg(s);
  document.documentElement.style.setProperty('--accent', s.color);
}

function wedge(cx, cy, r, deg, fill, opacity) {
  if (deg >= 359) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}"/>`;
  const a0 = (-90 - deg / 2) * Math.PI / 180, a1 = (-90 + deg / 2) * Math.PI / 180;
  const large = deg > 180 ? 1 : 0;
  return `<path d="M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z" fill="${fill}" opacity="${opacity}"/>`;
}
function fovSvg(s) {
  const h = sp('human');
  return `<svg viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-opacity=".15"/>
    ${wedge(60, 60, 52, h.fov, 'none', 1).replace('fill="none"', 'fill="none" stroke="currentColor" stroke-dasharray="3 3" stroke-opacity=".45"')}
    ${wedge(60, 60, 50, s.fov, s.color, 0.35)}
    ${wedge(60, 60, 50, s.binoc, s.color, 0.75)}
    <circle cx="60" cy="60" r="5" fill="currentColor"/>
    <text x="60" y="117" text-anchor="middle" font-size="9" fill="currentColor" opacity=".7">${s.fov}° · ${t('binoc')} ${s.binoc}°</text>
  </svg>`;
}

function renderQuests() {
  $('#quests').innerHTML = QUESTS.map((q, i) => `<button class="quest" data-q="${i}"><span>${q.emoji}</span><span>${q[state.lang]}</span></button>`).join('');
  $$('#quests .quest').forEach(b => b.addEventListener('click', () => {
    const q = QUESTS[+b.dataset.q];
    if (q.night !== undefined) setToggle('night', q.night);
    if (q.realFov !== undefined) setToggle('realFov', q.realFov);
    setCompare(q.compare || 'split');
    setSpecies(q.species);
    if (q.height) setHeight(q.height);
    goTo(q.preset);
    if (window.innerWidth <= 900) setInfo(false);
  }));
}

function applyI18n() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  document.title = t('docTitle');
  $$('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  $('#tests').innerHTML = t('s2Items').map(([e, h, p]) => `<div class="test"><div class="te">${e}</div><h4>${h}</h4><p>${p}</p></div>`).join('');
  $('#langBtn').textContent = state.lang === 'zh' ? 'EN' : '中文';
  $$('.chip').forEach(c => { const s = sp(c.dataset.sp); c.querySelector('.n').textContent = s.name[state.lang]; });
  renderInfo(); renderQuests(); labelKey = '';
  updateNotes();
}

function setSpecies(id) {
  if (id === 'human' && state.compare === 'split') id = state.species === 'human' ? 'dog' : id;
  state.species = id;
  $$('.chip').forEach(c => c.classList.toggle('on', c.dataset.sp === id));
  flashAt = performance.now();
  renderInfo(); labelKey = '';
  const [x, z] = free(state.pos.x, state.pos.z, eyeHeight()); state.pos.x = x; state.pos.z = z;
  updateNotes();
}
function setCompare(m) {
  state.compare = m;
  $$('[data-compare]').forEach(b => b.classList.toggle('on', b.dataset.compare === m));
  if (m === 'split' && state.species === 'human') setSpecies('dog');
  labelKey = ''; updateNotes();
}
function setHeight(h) {
  state.height = h;
  $$('[data-height]').forEach(b => b.classList.toggle('on', b.dataset.height === h));
  const [x, z] = free(state.pos.x, state.pos.z, eyeHeight()); state.pos.x = x; state.pos.z = z;
  updateNotes();
}
function setToggle(k, v) {
  state[k] = v;
  $(`[data-toggle="${k}"]`).classList.toggle('on', v);
  $(`[data-toggle="${k}"]`).setAttribute('aria-pressed', v);
  if (k === 'night') { applyLighting(); document.body.classList.toggle('night', v); }
  updateNotes();
}
const toggle = k => setToggle(k, !state[k]);

function updateNotes() {
  const msgs = [];
  if (state.height === 'own' && state.compare !== 'single') msgs.push(t('noteOwnHeight'));
  const s = sp(state.species);
  if (s.mode === 2) msgs.push(t('noteBee'));
  if (s.mode === 4) msgs.push(t('noteSnake'));
  if (state.night) msgs.push(t('noteNight'));
  $('#stageNote').innerHTML = msgs.join(' · ');
  $('#stageNote').hidden = !msgs.length;
}

let hintTimer;
function hideHint() { $('#hint').classList.add('gone'); }

// build the species chips
$('#chips').innerHTML = SPECIES.map((s, i) => `<button class="chip" data-sp="${s.id}" style="--c:${s.color}" title="${i + 1}"><span class="e">${s.emoji}</span><span class="n"></span></button>`).join('');
$$('.chip').forEach(c => c.addEventListener('click', () => setSpecies(c.dataset.sp)));
$$('[data-compare]').forEach(b => b.addEventListener('click', () => setCompare(b.dataset.compare)));
$$('[data-height]').forEach(b => b.addEventListener('click', () => setHeight(b.dataset.height)));
$$('[data-toggle]').forEach(b => b.addEventListener('click', () => toggle(b.dataset.toggle)));
$$('[data-preset]').forEach(b => b.addEventListener('click', () => goTo(b.dataset.preset)));
$('#langBtn').addEventListener('click', () => { state.lang = state.lang === 'zh' ? 'en' : 'zh'; applyI18n(); });
function setInfo(open) { $('#info').classList.toggle('open', open); $('.hero').classList.toggle('info-open', open); }
$('#infoToggle').addEventListener('click', () => setInfo(!$('#info').classList.contains('open')));
setInfo(window.innerWidth > 900 && params.get('info') !== '0' && params.get('mode') !== 'grid');
$('#shotBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = `animal-vision-${state.species}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
});
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

// initial state (URL params let you share a view, e.g. ?sp=bee&view=flower&mode=single)
goTo(params.get('view') || 'door', true);
if (params.get('yaw')) state.yaw = +params.get('yaw');
if (params.get('pitch')) state.pitch = +params.get('pitch');
if (params.get('x')) { state.pos.x = +params.get('x'); state.pos.z = +params.get('z'); }
if (params.get('mode')) state.compare = params.get('mode');
setCompare(state.compare);
setSpecies(params.get('sp') || state.species);
setHeight(params.get('h') || 'toy');
if (params.get('night') === '1') setToggle('night', true);
if (params.get('fov') === '1') setToggle('realFov', true);
if (params.get('split')) state.split = +params.get('split');
applyLighting();
applyI18n();
document.body.classList.add('ready');
requestAnimationFrame(frame);

// expose a tiny API for the capture script
window.AV = { room, THREE, applyLighting, DAY, cubeUpdate, renderer, rtN, rtT, camT, meshes, scene, camN, setSpecies, setCompare, setHeight, setToggle, goTo, state, SPECIES };
