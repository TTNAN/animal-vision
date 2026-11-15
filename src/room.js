// A lived-in living room, 4.6 × 4.0 m, 2.6 m ceiling. 1 unit = 1 metre.
// Sunday, about 10:30 in the morning. The window faces east-south-east and the sun
// has crept across the oak floor to the edge of the rug. Someone was here a minute ago:
// a linen throw left unfolded on the sofa, a book face-down by a cold cup of tea,
// a fresh mug steaming next to the reading lamp.
//
// Furniture and props are photoscanned / photogrammetry-textured CC0 models from Poly Haven;
// floor, walls and fabrics are Poly Haven CC0 PBR textures; the view outside is a Poly Haven HDRI.
// The camera lives ~10 cm off the floor: cat-on-the-floorboards height.
//
// Every mesh carries two extra numbers used by the animal passes:
//   userData.temp : surface temperature in °C   (pit viper's infrared pits)
//   userData.uv   : ultraviolet reflectance 0-1  (honeybee's UV receptor)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import * as T from './textures.js';

export const ROOM = { w: 4.6, d: 4.0, h: 2.6 };
const HX = ROOM.w / 2, HZ = ROOM.d / 2;
const WIN = { x0: -1.25, x1: 0.55, y0: 0.8, y1: 2.25 };
const WALL_T = 0.2;

const MODELS = ['Sofa_01', 'modern_coffee_table_01', 'steel_frame_shelves_03', 'book_encyclopedia_set_01', 'tea_set_01',
  'wine_bottles_01', 'ceramic_vase_04', 'ceramic_vase_03', 'dirty_football', 'hanging_picture_frame_02', 'standing_picture_frame_02',
  'potted_plant_02', 'mid_century_lounge_chair', 'side_table_01', 'desk_lamp_arm_01', 'vintage_wooden_drawer_01', 'wicker_basket_01',
  'wall_clock', 'potted_plant_01', 'throw_pillows_01', 'standing_picture_frame_01', 'modern_ceiling_lamp_01', 'planter_pot_clay'];

export async function buildRoom(scene, renderer, onProgress = () => {}) {
  RectAreaLightUniformsLib.init();
  const colliders = [];
  const animated = [];
  const lights = {};
  const groupRoot = new THREE.Group();
  scene.add(groupRoot);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // ------------------------------------------------------------- loading
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_, done, total) => onProgress(done / total);
  const texLoader = new THREE.TextureLoader(manager);
  const gltfLoader = new GLTFLoader(manager);
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  const loadTex = (url, srgb) => new Promise((res, rej) => texLoader.load(url, t => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; res(t);
  }, undefined, rej));
  const SURF = ['oak_wood_planks', 'plastered_wall_04', 'poly_wool_herringbone', 'rough_linen'];
  const [surfTex, models, sky] = await Promise.all([
    Promise.all(SURF.map(n => Promise.all([loadTex(`assets/tex/${n}_diff.webp`, true), loadTex(`assets/tex/${n}_nor.webp`), loadTex(`assets/tex/${n}_arm.webp`)]))),
    Promise.all(MODELS.map(n => gltfLoader.loadAsync(`assets/models/${n}.glb`).then(g => [n, g.scene]))),
    loadTex('assets/tex/sky.jpg', true),
  ]);
  const S = Object.fromEntries(SURF.map((n, i) => [n, surfTex[i]]));
  const M = Object.fromEntries(models);

  // the garden outside: a big photographic panorama sphere (part of the scene, so every eye pass sees it)
  sky.mapping = THREE.UVMapping;
  sky.wrapS = THREE.RepeatWrapping;
  const skyMat = new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false, toneMapped: false });
  const skyGeo = new THREE.SphereGeometry(25, 64, 32);
  skyGeo.rotateY(-Math.PI / 2 + 0.35);
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.position.set(0, 1.2, 0);
  skyMesh.userData = { temp: 10, uv: 0.8, uvEmit: true, sky: true };
  skyMesh.frustumCulled = false;
  groupRoot.add(skyMesh);
  skyMat.color.setScalar(1.8);
  lights.skyMat = skyMat;

  // ---------------------------------------------------------- materials
  // Linear albedo from an sRGB swatch. The fabric and plaster diffuse maps were normalised
  // offline to a neutral grey with mean linear albedo 0.5, so the tint *is* the final colour.
  const albedo = hex => new THREE.Color(hex).multiplyScalar(2);
  function pbr(name, rx, ry, o = {}) {
    const [d, n, a] = S[name].map(t => { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; });
    const Mat = o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const opts = { ...o }; delete opts.physical;
    return new Mat({ map: d, normalMap: n, aoMap: a, roughnessMap: a, roughness: 1, metalness: 0, ...opts });
  }
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });

  function tag(m, opt) {
    m.castShadow = opt.cast !== false;
    m.receiveShadow = opt.receive !== false;
    m.userData.temp = opt.temp ?? 20;
    m.userData.uv = opt.uv ?? 0.08;
    if (opt.uvMap) m.userData.uvMap = opt.uvMap;
    if (opt.glass) m.userData.glass = true;
    if (opt.noMerge) m.userData.noMerge = true;
  }
  function add(geo, mat, pos, opt = {}) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (opt.rot) m.rotation.set(opt.rot[0], opt.rot[1], opt.rot[2]);
    tag(m, opt);
    (opt.parent || groupRoot).add(m);
    return m;
  }
  const box = (w, h, d, mat, pos, opt) => add(new THREE.BoxGeometry(w, h, d), mat, pos, opt);
  const rbox = (w, h, d, r, mat, pos, opt) => add(new RoundedBoxGeometry(w, h, d, 4, r), mat, pos, opt);
  const collide = (x0, x1, z0, z1, y0 = 0, y1 = 3) => colliders.push({ x0, x1, z0, z1, y0, y1 });

  // glass that really refracts the curtains and the garden (see the cube-camera note in main.js)
  const glassMat = (tint = 0xffffff, o = {}) => new THREE.MeshPhysicalMaterial({
    color: tint, metalness: 0, roughness: 0.04, transmission: 1, thickness: 0.006, ior: 1.52, specularIntensity: 1, envMapIntensity: 1, ...o });

  function prepModel(g, o) {
    g.traverse(m => {
      if (!m.isMesh) return;
      m.userData.fromModel = true;
      const mat = m.material;
      if (o.glassTint !== undefined && /wine_(red|clear|light)/.test(mat.name)) m.visible = false;
      if (mat.transmission > 0 || mat.userData?.glass) {
        m.material = o.glassTint !== undefined ? glassMat(o.glassTint, { thickness: 0.004 }) : mat;
        m.userData.glass = true;
      }
      tag(m, { temp: o.temp, uv: o.uv, cast: m.userData.glass ? false : o.cast, glass: m.userData.glass });
      if (o.tint && !m.userData.glass) { m.material = m.material.clone(); m.material.color.multiply(new THREE.Color(o.tint)); }
    });
  }
  // Drop a scanned model into the room. Collision box follows its real footprint unless told otherwise.
  function place(name, pos, o = {}) {
    const g = M[name].clone(true);
    g.position.set(pos[0], pos[1], pos[2]);
    g.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
    if (Array.isArray(o.s)) g.scale.set(...o.s); else g.scale.setScalar(o.s || 1);
    prepModel(g, o);
    (o.parent || groupRoot).add(g);
    g.updateMatrixWorld(true);
    if (o.collide !== false && !o.parent) {
      const b = new THREE.Box3().setFromObject(g, true);
      collide(b.min.x - 0.03, b.max.x + 0.03, b.min.z - 0.03, b.max.z + 0.03, b.min.y - 0.02, b.max.y);
    }
    return g;
  }
  // Named pieces of a multi-object scan (a teapot and its lid out of a tea set, one book out of a row),
  // re-centred so their footprint centre sits on the origin and their base on y = 0.
  // Node transforms are kept: the quantised meshes rely on them.
  function piece(model, nodes, pos, o = {}) {
    const inner = new THREE.Group();
    for (const n of [].concat(nodes)) inner.add(M[model].getObjectByName(n).clone(true));
    inner.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(inner, true);
    inner.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    const g = new THREE.Group(); g.add(inner);
    g.position.set(pos[0], pos[1], pos[2]);
    g.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
    if (Array.isArray(o.s)) g.scale.set(...o.s); else g.scale.setScalar(o.s || 1);
    prepModel(g, o);
    (o.parent || groupRoot).add(g);
    g.updateMatrixWorld(true);
    g.userData.size = new THREE.Vector3().subVectors(b.max, b.min);
    return g;
  }
  // move an object so its world bounding box sits bottom-centre on p
  function settle(g, p) {
    g.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(g, true);
    g.position.x += p[0] - (b.min.x + b.max.x) / 2; g.position.y += p[1] - b.min.y; g.position.z += p[2] - (b.min.z + b.max.z) / 2;
    g.updateMatrixWorld(true);
  }
  // soft contact shadow under a piece of furniture: the light the floor can't see
  const csMap = T.contactShadow();
  function contact(cx, cz, w, d, ry = 0, strength = 0.55, y = 0.0012) {
    const m = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: csMap, transparent: true, opacity: strength, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const p = add(new THREE.PlaneGeometry(w, d), m, [cx, y, cz], { rot: [-Math.PI / 2, 0, ry], cast: false, receive: false, temp: 19.5, noMerge: true });
    p.renderOrder = 1;
    return p;
  }

  // ---------------------------------------------------------------- shell
  // Oak boards ~15 cm wide (the texture's 13 boards span 1.9 m). A low-frequency world-space
  // tint breaks up the tiling so the floor reads as many different boards.
  const FLOOR_TILE = 1.9;
  const floorMat = pbr('oak_wood_planks', ROOM.w / FLOOR_TILE, ROOM.d / FLOOR_TILE, { roughness: 1 });
  floorMat.normalScale.set(0.8, 0.8);
  floorMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWp;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{ float n = vn(vWp.xz * vec2(0.9, 2.2)) * 0.6 + vn(vWp.xz * vec2(2.3, 6.5) + 7.0) * 0.4;
  diffuseColor.rgb *= mix(0.84, 1.1, n) * vec3(1.0, 0.985 + 0.02 * n, 0.96 + 0.05 * n); }`);
  };
  add(new THREE.PlaneGeometry(ROOM.w, ROOM.d), floorMat, [0, 0, 0], { rot: [-Math.PI / 2, 0, 0], temp: 19.5, cast: false });

  // lime plaster, a warm grey-white, with its own relief and ambient occlusion
  const PLASTER = 0xdcd5ca;
  const wallMat = (w, h) => { const m = pbr('plastered_wall_04', w / 2.2, h / 2.2, { color: albedo(PLASTER), roughness: 1 }); m.normalScale.set(0.9, 0.9); return m; };
  const ceilMat = pbr('plastered_wall_04', ROOM.w / 2.2, ROOM.d / 2.2, { color: albedo(0xe6e1d8), roughness: 1 });
  ceilMat.normalScale.set(0.5, 0.5);
  add(new THREE.PlaneGeometry(ROOM.w, ROOM.d), ceilMat, [0, ROOM.h, 0], { rot: [Math.PI / 2, 0, 0], temp: 22, cast: false });

  // walls are thick boxes so the low sun casts a proper window-shaped patch
  const wbox = (w, h, d, pos) => box(w, h, d, wallMat(Math.max(w, d), h), pos, { temp: 20 });
  const bz = -HZ - WALL_T / 2;
  wbox(WIN.x0 + HX, ROOM.h, WALL_T, [(-HX + WIN.x0) / 2, ROOM.h / 2, bz]);
  wbox(HX - WIN.x1, ROOM.h, WALL_T, [(WIN.x1 + HX) / 2, ROOM.h / 2, bz]);
  wbox(WIN.x1 - WIN.x0, WIN.y0, WALL_T, [(WIN.x0 + WIN.x1) / 2, WIN.y0 / 2, bz]);
  wbox(WIN.x1 - WIN.x0, ROOM.h - WIN.y1, WALL_T, [(WIN.x0 + WIN.x1) / 2, (WIN.y1 + ROOM.h) / 2, bz]);
  wbox(ROOM.w + 0.4, ROOM.h, WALL_T, [0, ROOM.h / 2, HZ + WALL_T / 2]);
  wbox(WALL_T, ROOM.h, ROOM.d, [-HX - WALL_T / 2, ROOM.h / 2, 0]);
  wbox(WALL_T, ROOM.h, ROOM.d, [HX + WALL_T / 2, ROOM.h / 2, 0]);
  box(ROOM.w + 0.6, 0.2, ROOM.d + 0.6, std(0x808080), [0, ROOM.h + 0.1, 0], { temp: 20 });

  // skirting: an 11 cm moulded profile in satin paint, scuffed only by the light
  const satin = pbr('plastered_wall_04', 2, 0.2, { color: albedo(0xeae5dc), roughness: 0.42, roughnessMap: null, aoMap: null });
  satin.normalScale.set(0.12, 0.12);
  const skShape = new THREE.Shape();
  skShape.moveTo(0, 0); skShape.lineTo(0.016, 0); skShape.lineTo(0.016, 0.085);
  skShape.quadraticCurveTo(0.016, 0.095, 0.009, 0.098); skShape.lineTo(0.007, 0.104);
  skShape.quadraticCurveTo(0.004, 0.11, 0, 0.11); skShape.lineTo(0, 0);
  function skirt(len, x, z, ry) {
    const g = new THREE.ExtrudeGeometry(skShape, { depth: len, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, -len / 2);
    add(g, satin, [x, 0, z], { rot: [0, ry, 0], temp: 19.5, cast: false });
  }
  skirt(ROOM.d, -HX, 0, 0); skirt(ROOM.d, HX, 0, Math.PI);
  skirt(ROOM.w, 0, -HZ, Math.PI / 2); skirt(ROOM.w, 0, HZ, -Math.PI / 2);

  // ------------------------------------------------------------- window
  const wcx = (WIN.x0 + WIN.x1) / 2, ww = WIN.x1 - WIN.x0, wh = WIN.y1 - WIN.y0, wcy = (WIN.y0 + WIN.y1) / 2;
  const reveal = wallMat(1, 1);
  box(0.01, wh, WALL_T, reveal, [WIN.x0 + 0.005, wcy, bz]);
  box(0.01, wh, WALL_T, reveal, [WIN.x1 - 0.005, wcy, bz]);
  box(ww, 0.01, WALL_T, reveal, [wcx, WIN.y1 - 0.005, bz]);
  // painted timber casement near the outside face: frame, centre mullion, two sashes
  const paint = std(0xeeebe4, { roughness: 0.38 });
  const fz = -HZ - 0.15;
  rbox(ww, 0.07, 0.07, 0.008, paint, [wcx, WIN.y0 + 0.035, fz]);
  rbox(ww, 0.07, 0.07, 0.008, paint, [wcx, WIN.y1 - 0.035, fz]);
  rbox(0.07, wh, 0.07, 0.008, paint, [WIN.x0 + 0.035, wcy, fz]);
  rbox(0.07, wh, 0.07, 0.008, paint, [WIN.x1 - 0.035, wcy, fz]);
  rbox(0.08, wh, 0.08, 0.008, paint, [wcx, wcy, fz]);
  for (const s of [-1, 1]) {
    const cx = wcx + s * ww / 4;
    rbox(ww / 2 - 0.1, 0.05, 0.05, 0.006, paint, [cx, WIN.y0 + 0.09, fz + 0.02]);
    rbox(ww / 2 - 0.1, 0.05, 0.05, 0.006, paint, [cx, WIN.y1 - 0.09, fz + 0.02]);
    rbox(0.05, wh - 0.12, 0.05, 0.006, paint, [wcx + s * (ww / 2 - 0.095), wcy, fz + 0.02]);
    rbox(0.05, wh - 0.12, 0.05, 0.006, paint, [wcx + s * 0.065, wcy, fz + 0.02]);
  }
  const brass = std(0xb08d57, { metalness: 1, roughness: 0.32 });
  add(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 12), brass, [wcx + 0.06, wcy, fz + 0.06], { cast: false });
  const pane = (cx) => add(new THREE.PlaneGeometry(ww / 2 - 0.15, wh - 0.18), glassMat(0xf2f8f4), [cx, wcy, fz + 0.02], { cast: false, receive: false, temp: 13, uv: 0.5, glass: true, noMerge: true });
  pane(wcx - ww / 4); pane(wcx + ww / 4);
  // oak window board, a little proud of the plaster
  const oakBoard = pbr('oak_wood_planks', 0.9, 0.12, { roughness: 1 });
  rbox(ww + 0.16, 0.028, WALL_T + 0.035, 0.004, oakBoard, [wcx, WIN.y0 - 0.014, -HZ - WALL_T / 2 + 0.017], { temp: 18 });
  const SILL_Y = WIN.y0;

  // floor-length linen curtains, heavy enough to pool a few centimetres on the floor
  const linenCurtain = pbr('rough_linen', 2.2, 4.4, { color: albedo(0xe2dccf), side: THREE.DoubleSide, physical: true, sheen: 0.6, sheenRoughness: 0.8, sheenColor: 0xf3eee4 });
  function curtain(xc, width, seed) {
    const H = 2.47, seg = 110;
    const geo = new THREE.PlaneGeometry(width, H, seg, 60);
    const p = geo.attributes.position, r = T.rng(seed);
    const ph = [r() * 6, r() * 6, r() * 6, r() * 6];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), v = (H / 2 - y) / H;   // v: 0 at the rod, 1 at the hem
      const f = Math.sin(x * 36 + ph[0]) * 0.05 + Math.sin(x * 77 + ph[1]) * 0.011 + Math.sin(x * 15 + ph[2] + v * 1.8) * 0.022 + Math.sin(x * 140 + ph[3] + v * 6) * 0.002 * v;
      let z = f * (0.75 + 0.45 * v), yy = y;
      // the last 7 cm lie on the floor and run forward into the room
      const pool = Math.max(0, (H / 2 - y) - (H - 0.07));
      if (pool > 0) { yy = -H / 2 + 0.07 + 0.004; z += pool * 1.4 + 0.02; }
      p.setXYZ(i, x * (1 + 0.06 * v * Math.sign(x)), yy, z);
    }
    geo.computeVertexNormals();
    add(geo, linenCurtain, [xc, 2.43 - H / 2 + 0.0, -HZ + 0.11], { temp: 19 });
  }
  curtain(WIN.x0 - 0.22, 0.62, 3);
  curtain(WIN.x1 + 0.22, 0.62, 9);
  const blackMetal = std(0x1d1c1a, { metalness: 0.7, roughness: 0.45 });
  add(new THREE.CylinderGeometry(0.011, 0.011, ww + 1.3, 20), blackMetal, [wcx, 2.45, -HZ + 0.11], { rot: [0, 0, Math.PI / 2] });
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.02, 16, 12), blackMetal, [wcx + s * (ww / 2 + 0.66), 2.45, -HZ + 0.11]);
    box(0.02, 0.05, 0.11, blackMetal, [wcx + s * (ww / 2 + 0.5), 2.47, -HZ + 0.055]);
  }

  // column radiator under the window: the warmest big thing in the room
  const radPaint = pbr('plastered_wall_04', 0.4, 0.4, { color: albedo(0xece9e2), roughness: 0.35, roughnessMap: null, aoMap: null });
  radPaint.normalScale.set(0.08, 0.08);
  const rad = new THREE.Group(); rad.position.set(wcx, 0.14, -HZ + 0.07); groupRoot.add(rad);
  for (let i = 0; i < 30; i++) {
    for (const dz of [-0.018, 0.018]) add(new THREE.CapsuleGeometry(0.013, 0.48, 6, 14), radPaint, [-0.435 + i * 0.03, 0.27, dz], { parent: rad, temp: 52 }).scale.set(1, 1, 0.75);
    rbox(0.026, 0.05, 0.07, 0.01, radPaint, [-0.435 + i * 0.03, 0.025, 0], { parent: rad, temp: 52 });
    rbox(0.026, 0.05, 0.07, 0.01, radPaint, [-0.435 + i * 0.03, 0.52, 0], { parent: rad, temp: 52 });
  }
  const chrome = std(0xd0d0d0, { metalness: 1, roughness: 0.2 });
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 12), chrome, [s * 0.46, -0.07, 0.03], { parent: rad, temp: 55 });
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.06, 24), std(0xf2f2ee, { roughness: 0.4 }), [0.5, 0.0, 0.03], { parent: rad, rot: [0, 0, Math.PI / 2], temp: 40 });
  collide(wcx - 0.5, wcx + 0.5, -HZ, -HZ + 0.12, 0.05, 0.75);
  contact(wcx, -HZ + 0.07, 1.05, 0.2, 0, 0.35);

  // --------------------------------------------------------------- sofa
  // a linen settee on carved legs, against the left wall; there's a cat-sized gap underneath
  const SOFA_S = 1.1;
  const sofa = place('Sofa_01', [-HX + 0.45, 0, 0.15], { ry: Math.PI / 2, s: SOFA_S, collide: false, temp: 21 });
  const sofaBox = new THREE.Box3().setFromObject(sofa, true);
  // legs block at every height, the body only above the apron (12 cm)
  for (const lz of [-0.75, 0, 0.76]) for (const lx of [-0.33, 0.27]) {
    const wx = sofa.position.x + lx * SOFA_S, wz = sofa.position.z - lz * SOFA_S;
    collide(wx - 0.05, wx + 0.05, wz - 0.05, wz + 0.05, 0, 1);
  }
  collide(sofaBox.min.x, sofaBox.max.x, sofaBox.min.z, sofaBox.max.z, 0.12, 1.2);
  const hf = heightField(sofa, 0.01);
  // underneath: black dust cloth stapled to the frame, two raw beech battens, a little life
  const under = new THREE.Group(); under.position.copy(sofa.position); under.rotation.y = Math.PI / 2; under.scale.setScalar(SOFA_S); groupRoot.add(under);
  const dustCloth = pbr('rough_linen', 6, 3, { color: albedo(0x262422), roughness: 1, side: THREE.DoubleSide });
  const dcGeo = new THREE.PlaneGeometry(1.42, 0.5, 40, 16);
  { const p = dcGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -0.006 * Math.cos(x / 0.71 * Math.PI / 2) * Math.cos(y / 0.25 * Math.PI / 2) + Math.sin(x * 40) * 0.0008); } dcGeo.computeVertexNormals(); }
  add(dcGeo, dustCloth, [0, 0.205, -0.03], { parent: under, rot: [Math.PI / 2, 0, 0], temp: 20, cast: false });
  const rawWood = pbr('oak_wood_planks', 0.6, 0.08, { color: 0xe8d9c0, roughness: 1 });
  for (const x of [-0.36, 0.36]) rbox(0.04, 0.025, 0.52, 0.004, rawWood, [x, 0.19, -0.03], { parent: under, temp: 20 });
  for (const z of [-0.29, 0.23]) rbox(1.46, 0.03, 0.03, 0.004, rawWood, [0, 0.192, z], { parent: under, temp: 20 });
  // dust: fine grey fluff collects against the skirting and round the legs
  dustBunnies(sofa.position.x - 0.32, sofa.position.z, 0.36, 1.6, 41);
  // a pencil and a hair tie that went missing weeks ago
  const pencil = new THREE.Group(); pencil.position.set(sofa.position.x - 0.05, 0.0035, sofa.position.z + 0.32); pencil.rotation.y = 0.7; groupRoot.add(pencil);
  add(new THREE.CylinderGeometry(0.0035, 0.0035, 0.15, 6), std(0x2f4a3c, { roughness: 0.45 }), [0, 0, 0], { parent: pencil, rot: [0, 0, Math.PI / 2] });
  add(new THREE.ConeGeometry(0.0035, 0.018, 6), std(0xd9b88c, { roughness: 0.8 }), [0.084, 0, 0], { parent: pencil, rot: [0, 0, -Math.PI / 2] });
  add(new THREE.ConeGeometry(0.0012, 0.005, 6), std(0x222222, { roughness: 0.6 }), [0.0955, 0, 0], { parent: pencil, rot: [0, 0, -Math.PI / 2] });
  add(new THREE.TorusGeometry(0.014, 0.0022, 8, 28), std(0x1b1a19, { roughness: 0.85 }), [sofa.position.x + 0.12, 0.0022, sofa.position.z - 0.45], { rot: [-Math.PI / 2, 0, 0] });
  contact(sofa.position.x - 0.03, sofa.position.z, 0.95, 1.95, 0, 0.6);

  // the linen throw: draped from the backrest over the seat and off the front edge, not folded
  const throwMat = pbr('rough_linen', 3.2, 4.2, { color: albedo(0xb39e83), side: THREE.DoubleSide, physical: true, sheen: 0.8, sheenRoughness: 0.7, sheenColor: 0xd8c8b0 });
  add(drapeGeometry(hf, { z0: sofa.position.z + 0.2, z1: sofa.position.z + 0.86, xBack: sofaBox.min.x + 0.02, xFront: sofaBox.max.x, len: 1.75, seed: 5 }), throwMat, null, { temp: 22, uv: 0.4 });
  // cushions at the other end
  const seatY = hf.at(sofa.position.x - 0.02, sofa.position.z - 0.4);
  place('throw_pillows_01', [sofa.position.x - 0.12, seatY - 0.02, sofa.position.z - 0.42], { ry: Math.PI / 2 - 0.12, s: 0.82, collide: false });

  // picture above the sofa, hung a few millimetres off level
  place('hanging_picture_frame_02', [-HX + 0.003, 1.62, sofa.position.z + 0.05], { ry: Math.PI / 2, rz: 0.012, s: 1.0, collide: false });

  // ----------------------------------------------------- reading corner
  // side table between sofa and window: reading lamp, a fresh hot cup of tea
  const stPos = [-HX + 0.33, -1.45];
  place('side_table_01', [stPos[0], 0, stPos[1]], { ry: Math.PI / 2, s: 0.95 });
  contact(stPos[0], stPos[1], 0.62, 0.68, 0, 0.45);
  const stTop = 0.548 * 0.95;
  const lamp = place('desk_lamp_arm_01', [stPos[0] - 0.08, stTop, stPos[1] - 0.06], { ry: Math.PI * 0.85, s: 0.72, collide: false, temp: 32 });
  // a fresh cup of tea put down on the boards by the window, where someone sat in the sun to read;
  // on the floor so a viper (or a cat) at 3-10 cm can actually see it
  const hotCup = teaCup([0.25, 0, -1.55], 1.2, { hot: true });
  // the lamp's cable drops behind the table to a socket on the left wall
  const cable = new THREE.CatmullRomCurve3([[stPos[0] - 0.1, stTop + 0.005, stPos[1] - 0.12], [stPos[0] - 0.2, stTop - 0.02, stPos[1] - 0.16], [-HX + 0.03, 0.3, stPos[1] - 0.1], [-HX + 0.035, 0.03, stPos[1] + 0.05], [-HX + 0.06, 0.004, stPos[1] + 0.25], [-HX + 0.02, 0.2, stPos[1] + 0.42], [-HX + 0.012, 0.3, stPos[1] + 0.44]].map(a => new THREE.Vector3(...a)));
  add(new THREE.TubeGeometry(cable, 120, 0.0032, 8), std(0x1d1d1d, { roughness: 0.55 }), null, { cast: true });
  socket([-HX + 0.002, 0.3, stPos[1] + 0.44], Math.PI / 2);

  // --------------------------------------------------- rug & coffee table
  // flat-woven wool in olive green: the stage for the red ball test
  const RUG = { x: -0.15, z: 0.55, w: 2.4, d: 1.7 };
  const rugMat = pbr('poly_wool_herringbone', RUG.w / 0.27, RUG.d / 0.275, { color: albedo(0x6c7346), physical: true, sheen: 1, sheenRoughness: 0.55, sheenColor: 0x9aa070 });
  rugMat.normalScale.set(1.2, 1.2);
  const rugGeo = new RoundedBoxGeometry(RUG.w, 0.011, RUG.d, 2, 0.004);
  // RoundedBox uvs are per face; remap the top to the full rug so the weave runs continuously
  { const p = rugGeo.attributes.position, uv = rugGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / RUG.w + 0.5, p.getZ(i) / RUG.d + 0.5); }
  add(rugGeo, rugMat, [RUG.x, 0.0055, RUG.z], { temp: 20, cast: false });
  const RUG_TOP = 0.011;

  const ct = { x: -1.02, z: 0.2 };
  place('modern_coffee_table_01', [ct.x, RUG_TOP, ct.z], { s: 1.0 });
  contact(ct.x, ct.z, 0.75, 1.35, 0, 0.42, RUG_TOP + 0.0015);
  const ctTop = RUG_TOP + 0.39;
  // cold tea: teapot, cup on its saucer, a dried ring where yesterday's cup stood
  piece('tea_set_01', ['tea_set_01_teapot_01', 'tea_set_01_teapot_01_lid'], [ct.x - 0.1, ctTop, ct.z - 0.36], { ry: 2.4, temp: 24 });
  teaCup([ct.x + 0.08, ctTop, ct.z - 0.12], 0.3, { hot: false });
  // yesterday's cup, gone cold on the floor by the table: same cup, same tea, only the temperature differs
  teaCup([-0.55, 0, -0.6], 2.0, { hot: false });
  add(new THREE.RingGeometry(0.029, 0.032, 48), new THREE.MeshStandardMaterial({ color: 0x6b4a2a, transparent: true, opacity: 0.22, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), [ct.x - 0.06, ctTop + 0.0008, ct.z + 0.06], { rot: [-Math.PI / 2, 0, 0], cast: false, noMerge: true });
  // the book being read, face-down and open at the middle
  openBookFaceDown([ct.x + 0.02, ctTop, ct.z + 0.2], 0.4, 0x2e3a46);
  // green glass bottle doing duty as a vase, a stem of dried eucalyptus in it
  const bottle = piece('wine_bottles_01', 'wine_bottles_01_champagne', [ct.x + 0.12, ctTop, ct.z + 0.44], { ry: 1.0, glassTint: 0x6f9a62, temp: 20 });
  driedStem([ct.x + 0.12, ctTop + bottle.userData.size.y - 0.01, ct.z + 0.44]);

  // the red ball and a red cloth-bound book, on the green rug, in the middle of the floor
  const ball = place('dirty_football', [0.02, RUG_TOP, 0.42], { ry: 0.6, rx: 0.3, s: 0.92, temp: 20 });
  { const b = new THREE.Box3().setFromObject(ball, true); ball.position.y += RUG_TOP - b.min.y + 0.002; }
  // old leather gone dark with use; lift it back to a red whose luminance sits near the rug's
  ball.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.setRGB(1.75, 0.62, 0.55); } });
  contact(0.02, 0.42, 0.26, 0.26, 0, 0.55, RUG_TOP + 0.001);
  hardcover([0.31, RUG_TOP, 0.3], { w: 0.155, h: 0.235, t: 0.028, color: 0x8b1d17, ry: -0.5, seed: 3 });

  // ceiling pendant, a small one, over the coffee table
  const pend = place('modern_ceiling_lamp_01', [-0.75, ROOM.h - 1.173 + 0.3, 0.25], { s: 0.75, collide: false, cast: false, temp: 26 });

  // ------------------------------------------------- right wall: books
  const SH = { x: HX - 0.03 - 0.363 * 0.56, z: -1.05, s: [0.72, 0.74, 0.56] };
  const shelf = place('steel_frame_shelves_03', [SH.x, 0, SH.z], { ry: -Math.PI / 2, s: SH.s });
  contact(SH.x + 0.03, SH.z + 0.1, 0.5, 1.8, 0, 0.45);
  const levels = shelfLevels(shelf, SH.x, [SH.z + 0.45, SH.z - 0.45]);
  const bookRng = T.rng(12);
  // the right-hand bay (z > SH.z) is open from the floor; the left bay has drawers low down
  levels.right.forEach((y, i) => { if (y < 1.5) bookRow(SH.x - 0.17, SH.z + 0.07, SH.z + 0.88, y, i); });
  levels.left.forEach((y, i) => { if (y > 0.7 && y < 1.5) bookRow(SH.x - 0.17, SH.z - 0.7, SH.z - 0.06, y, i + 7); });
  const topR = levels.right.filter(y => y > 1.3).pop() || 1.6;
  place('potted_plant_01', [SH.x - 0.04, topR, SH.z + 0.6], { s: 0.3, collide: false });
  place('ceramic_vase_03', [SH.x - 0.05, topR, SH.z + 0.25], { s: 0.55, collide: false, ry: 0.4 });
  const midL = levels.left.find(y => y > 0.9) || 1.0;
  place('standing_picture_frame_02', [SH.x - 0.06, levels.left.find(y => y > 1.3) || 1.4, SH.z - 0.4], { ry: -Math.PI / 2 + 0.25, s: 1, collide: false });
  place('wicker_basket_01', [SH.x - 0.02, levels.right[0] ?? 0.02, SH.z + 0.5], { ry: Math.PI / 2, s: 0.95, collide: false });

  // eye chart: matte paper in a thin black frame, leaning on the wall, a little crooked
  eyeChartFrame([HX - 0.07, 0, 0.32]);

  // -------------------------------------------------- front of the room
  // sideboard by the door with a photo and a vase; clock above it
  place('vintage_wooden_drawer_01', [-1.15, 0, HZ - 0.03 - 0.567 * 0.62], { ry: Math.PI, s: 0.62 });
  contact(-1.15, HZ - 0.33, 1.2, 0.68, 0, 0.45);
  const sbTop = 1.09 * 0.62;
  place('standing_picture_frame_01', [-1.45, sbTop, HZ - 0.2], { ry: Math.PI + 0.35, s: 0.9, collide: false });
  place('ceramic_vase_04', [-0.85, sbTop, HZ - 0.24], { s: 0.6, collide: false, ry: 1.3 });
  place('wall_clock', [-1.15, 1.68, HZ - 0.002], { ry: Math.PI, s: 0.85, collide: false });

  // reading chair in the far corner
  place('mid_century_lounge_chair', [1.72, 0, 1.38], { ry: -2.45, s: 0.92 });
  contact(1.72, 1.38, 0.85, 0.85, -2.45, 0.4);
  // the big plant by the window
  place('potted_plant_02', [1.05, 0, -1.62], { ry: 0.7, s: 0.95 });
  contact(1.05, -1.62, 0.5, 0.5, 0, 0.4);

  // door, frame and light switch on the front wall
  door(0.85);
  socket([1.75, 0.3, HZ - 0.002], Math.PI);
  socket([HX - 0.002, 0.3, 0.75], -Math.PI / 2);

  // sunflowers on the window board, in a stoneware jug, beside an empty clay pot
  const jug = place('ceramic_vase_04', [wcx - 0.05, SILL_Y, -HZ - 0.05], { s: 0.72, collide: false, ry: 2.2 });
  place('planter_pot_clay', [wcx + 0.42, SILL_Y, -HZ - 0.06], { s: 0.55, collide: false, ry: 0.4 });
  sunflowers([wcx - 0.05, SILL_Y + 0.342 * 0.72, -HZ - 0.05]);

  // ----------------------------------------------------------------- light
  // 10:30 sun: ~48° up, 20° south of the window's normal; it lands on the floor in front of the window
  const sunDir = new THREE.Vector3(Math.sin(0.35) * Math.cos(0.84), Math.sin(0.84), -Math.cos(0.35) * Math.cos(0.84)).normalize();
  const sun = new THREE.DirectionalLight(0xffe0b8, 6.5);
  sun.target.position.set(wcx - 0.3, 0.2, -0.9);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -2.6, right: 2.6, top: 2.6, bottom: -2.6, near: 4, far: 15 });
  sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.012; sun.shadow.radius = 2;
  scene.add(sun, sun.target); lights.sun = sun;

  // cool skylight through the window: this is the colour of the shadows
  const skyPanel = new THREE.RectAreaLight(0xc5d4e8, 3.2, ww, wh);
  skyPanel.position.set(wcx, wcy, -HZ - 0.02);
  skyPanel.lookAt(wcx, wcy - 0.4, 0);
  scene.add(skyPanel); lights.skyPanel = skyPanel;

  const hemi = new THREE.HemisphereLight(0xdde6f0, 0x8a7560, 0.12);
  scene.add(hemi); lights.hemi = hemi;

  // reading lamp: a warm cone onto the sofa arm and the cup
  const lb = new THREE.Box3().setFromObject(lamp, true);
  const head = new THREE.Vector3();
  lamp.traverse(o => { if (o.isMesh) { const b = new THREE.Box3().setFromObject(o, true); if (b.max.y > lb.max.y - 0.02) b.getCenter(head); } });
  const lampPos = new THREE.Vector3(head.x + 0.03, head.y - 0.07, head.z + 0.04);
  const readLamp = new THREE.SpotLight(0xffcf96, 4.0, 3.0, 0.75, 0.55, 2.0);
  readLamp.position.copy(lampPos);
  readLamp.target.position.set(stPos[0] + 0.25, 0.35, stPos[1] + 0.55);
  readLamp.castShadow = true; readLamp.shadow.mapSize.set(1024, 1024); readLamp.shadow.bias = -0.0005; readLamp.shadow.camera.near = 0.03;
  scene.add(readLamp, readLamp.target); lights.lamp = readLamp;
  const bulb = add(new THREE.SphereGeometry(0.016, 16, 10), new THREE.MeshStandardMaterial({ color: 0xfff1d8, emissive: 0xffd9a6, emissiveIntensity: 3.0 }), lampPos.toArray(), { cast: false, temp: 75, noMerge: true });
  lights.lampBulb = bulb;
  // the small pendant: a low warm glow, not a floodlight
  const pb = new THREE.Box3().setFromObject(pend, true);
  const pendant = new THREE.PointLight(0xffd4a0, 0.9, 4.5, 2);
  pendant.position.set(-0.75, pb.min.y + 0.05, 0.25);
  scene.add(pendant); lights.pendant = pendant;

  // merge static procedural pieces that share a material: hundreds of draw calls become a few dozen
  const buckets = new Map();
  groupRoot.updateMatrixWorld(true);
  groupRoot.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material) || o.userData.fromModel || o.userData.noMerge || o.userData.sky) return;
    const k = [o.material.uuid, o.userData.temp, o.userData.uv, o.userData.uvMap ? o.userData.uvMap.uuid : '', !!o.userData.glass, o.castShadow, o.receiveShadow].join('|');
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(o);
  });
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = list.map(o => { let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n); g.applyMatrix4(o.matrixWorld); return g; });
    const attrs = geos.map(g => Object.keys(g.attributes).sort().join());
    if (new Set(attrs).size > 1) continue;
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const src = list[0];
    const m = new THREE.Mesh(merged, src.material);
    m.castShadow = src.castShadow; m.receiveShadow = src.receiveShadow;
    m.userData = { ...src.userData };
    groupRoot.add(m);
    for (const o of list) o.removeFromParent();
  }

  // the room's own light bouncing back: an environment map baked from the lit room
  const glassy = []; groupRoot.traverse(o => { if (o.isMesh && o.userData.glass && o.visible) { glassy.push(o); o.visible = false; } });
  const pmrem = new THREE.PMREMGenerator(renderer);
  renderer.shadowMap.needsUpdate = true;
  const env = pmrem.fromScene(scene, 0.02, 0.05, 30, { position: new THREE.Vector3(-0.3, 0.7, 0.3) });
  glassy.forEach(o => { o.visible = true; });
  scene.environment = env.texture;
  scene.environmentIntensity = 0.85;
  lights.env = env.texture;
  pmrem.dispose();

  // ------------------------------------------------------- viewpoints
  // yaw 0 looks at the window wall (-z); positive yaw turns left (objects slide right on screen)
  const presets = {
    door:     { pos: [0.75, 1.62], yaw: 0.42, pitch: 0.1 },
    rug:      { pos: [0.42, 1.12], yaw: 0.28, pitch: 0.05 },
    sofa:     { pos: [-1.98, 0.3], yaw: -1.45, pitch: 0.04 },
    shelf:    { pos: [0.95, 0.15], yaw: -1.25, pitch: 0.2 },
    flower:   { pos: [wcx - 0.05, -0.35], yaw: 0.6, pitch: 0.6 },
    radiator: { pos: [-0.3, 0.55], yaw: 0.35, pitch: 0.08 },
  };
  // names from v2/v3, so old shared links still land somewhere sensible
  presets.bed = presets.sofa; presets.chest = presets.shelf; presets.hamster = presets.radiator;

  return { colliders, animated, lights, presets, groupRoot };

  // ---------------------------------------------------------------- helpers
  function socket(p, ry) {
    const g = new THREE.Group(); g.position.set(...p); g.rotation.y = ry; groupRoot.add(g);
    rbox(0.082, 0.082, 0.011, 0.006, std(0xefede7, { roughness: 0.32 }), [0, 0, 0.0055], { parent: g, cast: false });
    add(new THREE.CylinderGeometry(0.019, 0.019, 0.004, 28), std(0xe6e3dc, { roughness: 0.35 }), [0, 0, 0.012], { parent: g, rot: [Math.PI / 2, 0, 0], cast: false });
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.0028, 0.0028, 0.004, 10), std(0x111111), [s * 0.0095, 0, 0.0135], { parent: g, rot: [Math.PI / 2, 0, 0], cast: false });
  }

  function door(xc) {
    const W = 0.82, H = 2.03, z = HZ - 0.02;
    const doorMat = std(0xebe7df, { roughness: 0.42 });
    const g = new THREE.Group(); g.position.set(xc, 0, z); groupRoot.add(g);
    rbox(W, H, 0.04, 0.004, doorMat, [0, H / 2, 0], { parent: g });
    for (const [y, h] of [[0.48, 0.7], [1.42, 0.92]]) {
      rbox(W - 0.24, h, 0.008, 0.003, std(0xe4e0d7, { roughness: 0.45 }), [0, y, -0.022], { parent: g });
    }
    for (const s of [-1, 1]) rbox(0.07, H + 0.04, 0.02, 0.005, satin, [s * (W / 2 + 0.035), (H + 0.04) / 2, -0.01], { parent: g });
    rbox(W + 0.14, 0.07, 0.02, 0.005, satin, [0, H + 0.055, -0.01], { parent: g });
    const steel = std(0x9c9a95, { metalness: 1, roughness: 0.38 });
    add(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 28), steel, [-W / 2 + 0.07, 1.02, -0.024], { parent: g, rot: [Math.PI / 2, 0, 0] });
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.11, 14), steel, [-W / 2 + 0.11, 1.02, -0.05], { parent: g, rot: [0, 0, Math.PI / 2] });
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 14), steel, [-W / 2 + 0.07, 1.02, -0.034], { parent: g, rot: [Math.PI / 2, 0, 0] });
    rbox(0.085, 0.085, 0.01, 0.006, std(0xefede7, { roughness: 0.32 }), [W / 2 + 0.2, 1.05, -0.005], { parent: g });
    rbox(0.03, 0.05, 0.008, 0.004, std(0xf7f6f2, { roughness: 0.3 }), [W / 2 + 0.2, 1.05, -0.012], { parent: g });
    // a canvas tote hung on the door handle
    collide(xc - W / 2 - 0.1, xc + W / 2 + 0.1, z - 0.06, HZ, 0, 3);
  }

  // Top-down height map of a model (max y per 1 cm cell), for draping cloth over it.
  function heightField(obj, cell) {
    const b = new THREE.Box3().setFromObject(obj, true);
    const nx = Math.ceil((b.max.x - b.min.x) / cell) + 1, nz = Math.ceil((b.max.z - b.min.z) / cell) + 1;
    const h = new Float32Array(nx * nz);
    const a = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
    obj.traverse(m => {
      if (!m.isMesh) return;
      const pos = m.geometry.attributes.position, idx = m.geometry.index;
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i += 3) {
        const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(m.matrixWorld);
        c.fromBufferAttribute(pos, ib).applyMatrix4(m.matrixWorld);
        d.fromBufferAttribute(pos, ic).applyMatrix4(m.matrixWorld);
        const x0 = Math.floor((Math.min(a.x, c.x, d.x) - b.min.x) / cell), x1 = Math.ceil((Math.max(a.x, c.x, d.x) - b.min.x) / cell);
        const z0 = Math.floor((Math.min(a.z, c.z, d.z) - b.min.z) / cell), z1 = Math.ceil((Math.max(a.z, c.z, d.z) - b.min.z) / cell);
        const den = (c.z - d.z) * (a.x - d.x) + (d.x - c.x) * (a.z - d.z);
        if (Math.abs(den) < 1e-12) continue;
        for (let iz = Math.max(0, z0); iz <= Math.min(nz - 1, z1); iz++) for (let ix = Math.max(0, x0); ix <= Math.min(nx - 1, x1); ix++) {
          const px = b.min.x + ix * cell, pz = b.min.z + iz * cell;
          const w1 = ((c.z - d.z) * (px - d.x) + (d.x - c.x) * (pz - d.z)) / den;
          const w2 = ((d.z - a.z) * (px - d.x) + (a.x - d.x) * (pz - d.z)) / den;
          const w3 = 1 - w1 - w2;
          if (w1 < -0.02 || w2 < -0.02 || w3 < -0.02) continue;
          const y = w1 * a.y + w2 * c.y + w3 * d.y;
          const k = iz * nx + ix;
          if (y > h[k]) h[k] = y;
        }
      }
    });
    const at = (x, z) => {
      const ix = Math.round((x - b.min.x) / cell), iz = Math.round((z - b.min.z) / cell);
      if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) return 0;
      return h[iz * nx + ix];
    };
    return { at, box: b };
  }

  // A throw laid over the sofa: for each slice across the sofa we follow the top surface
  // (back of the backrest -> over the top -> down the seat -> over the front edge -> hanging),
  // spaced by arc length so the cloth neither stretches nor bunches, then add real folds.
  function drapeGeometry(hf, o) {
    const segU = 80, segV = 150, r = T.rng(o.seed);
    const ph = Array.from({ length: 8 }, () => r() * 6.28);
    const geo = new THREE.PlaneGeometry(1, 1, segU, segV);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    const profiles = [];
    for (let iu = 0; iu <= segU; iu++) {
      const z = o.z0 + (o.z1 - o.z0) * iu / segU;
      // sample along x with a wide max filter: cloth bridges the seat crevice and the carving
      const pts = [];
      const N = 120;
      for (let k = 0; k <= N; k++) {
        const x = o.xBack + (o.xFront - o.xBack) * k / N;
        let y = 0;
        for (let dz = -0.05; dz <= 0.05; dz += 0.025) for (let dx = -0.04; dx <= 0.04; dx += 0.02) y = Math.max(y, hf.at(x + dx, z + dz));
        pts.push([x, y + 0.008]);
      }
      // smooth the top line
      for (let it = 0; it < 4; it++) for (let k = 1; k < N; k++) pts[k][1] = Math.max(pts[k][1], (pts[k - 1][1] + pts[k + 1][1]) / 2 * 0.98);
      // hang behind the backrest and in front of the seat
      const prof = [[o.xBack - 0.005, pts[0][1] - 0.12], ...pts, [o.xFront + 0.03, 0.08], [o.xFront + 0.05, 0.02]];
      // arc-length table
      const acc = [0];
      for (let k = 1; k < prof.length; k++) acc.push(acc[k - 1] + Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]));
      profiles.push({ z, prof, acc });
    }
    const start = 0.1;
    for (let i = 0; i < p.count; i++) {
      const u = uv.getX(i), v = 1 - uv.getY(i);
      const iu = Math.round(u * segU), P = profiles[iu];
      // the far corner is pulled shorter: the throw was dropped, not laid
      const len = o.len * (1 - 0.18 * u * u) + Math.sin(u * 5 + ph[0]) * 0.04;
      const s = Math.min(start + v * len, P.acc[P.acc.length - 1] - 0.001);
      let k = 1; while (P.acc[k] < s) k++;
      const t = (s - P.acc[k - 1]) / (P.acc[k] - P.acc[k - 1]);
      const x = P.prof[k - 1][0] + (P.prof[k][0] - P.prof[k - 1][0]) * t;
      let y = P.prof[k - 1][1] + (P.prof[k][1] - P.prof[k - 1][1]) * t;
      // folds: soft rumples on the seat, vertical folds where it hangs
      const hanging = Math.max(0, Math.min(1, (x - (o.xFront - 0.08)) / 0.1));
      const rump = Math.sin(u * 17 + v * 4 + ph[1]) * Math.sin(v * 11 + ph[2]) * 0.014 + Math.sin(u * 41 + ph[3]) * Math.sin(v * 23 + ph[4]) * 0.004;
      const fold = Math.sin(u * 46 + ph[5] + v * 2) * 0.016 * hanging;
      y += rump * (1 - hanging) + Math.abs(rump) * 0.6;
      const zz = P.z + fold * 0.4;
      p.setXYZ(i, x + fold, y, zz);
      uv.setXY(i, u * 1.3, v * 1.5);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function dustBunnies(cx, cz, wx, wz, seed) {
    const r = T.rng(seed);
    const fluff = pbr('rough_linen', 0.4, 0.4, { color: albedo(0x9b958c), roughness: 1, physical: true, sheen: 1, sheenRoughness: 1, sheenColor: 0xcfcac2 });
    const geos = [];
    for (let i = 0; i < 26; i++) {
      // most of it drifts to the wall side
      const x = cx + (Math.pow(r(), 2) - 0.5) * wx, z = cz + (r() - 0.5) * wz;
      const n = 3 + Math.floor(r() * 6), s = 0.004 + r() * 0.01;
      for (let k = 0; k < n; k++) {
        const g = new THREE.IcosahedronGeometry(s * (0.5 + r() * 0.7), 1);
        const pp = g.attributes.position;
        for (let j = 0; j < pp.count; j++) pp.setXYZ(j, pp.getX(j) * (1 + r() * 0.6), pp.getY(j) * 0.45, pp.getZ(j) * (1 + r() * 0.6));
        g.translate(x + (r() - 0.5) * s * 3, s * 0.3, z + (r() - 0.5) * s * 3);
        geos.push(g.toNonIndexed());
      }
    }
    const merged = mergeGeometries(geos.map(g => { g.computeVertexNormals(); return g; }));
    add(merged, fluff, null, { cast: false, temp: 19.5, uv: 0.3, noMerge: true });
  }

  // a porcelain cup on its saucer from the scanned tea set, with tea in it
  function teaCup(pos, ry, { hot }) {
    const g = new THREE.Group(); g.position.set(...pos); g.rotation.y = ry; groupRoot.add(g);
    const sau = piece('tea_set_01', 'tea_set_01_saucer_circular_03', [0, 0, 0], { parent: g, temp: hot ? 40 : 20.5 });
    const sh = sau.userData.size.y;
    const cup = piece('tea_set_01', 'tea_set_01_cup_small_01', [0, sh - 0.004, 0], { parent: g, temp: hot ? 58 : 21 });
    const cs = cup.userData.size;
    // the liquid surface: a disc just under the rim, dark amber, glossy
    const tea = new THREE.MeshPhysicalMaterial({ color: hot ? 0x5a2e10 : 0x4a2a12, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
    add(new THREE.CircleGeometry(Math.min(cs.x, cs.z) * 0.38, 40), tea, [0, sh - 0.004 + cs.y * 0.78, 0], { parent: g, rot: [-Math.PI / 2, 0, 0], temp: hot ? 64 : 21.5, cast: false, noMerge: true });
    if (!hot) add(new THREE.RingGeometry(Math.min(cs.x, cs.z) * 0.36, Math.min(cs.x, cs.z) * 0.385, 48), new THREE.MeshStandardMaterial({ color: 0x5a3a1c, transparent: true, opacity: 0.5, roughness: 0.6, depthWrite: false }), [0, sh - 0.004 + cs.y * 0.79, 0], { parent: g, rot: [-Math.PI / 2, 0, 0], cast: false, noMerge: true });
    g.updateMatrixWorld(true);
    return g;
  }

  // Cloth-bound hardback: boards with turned edges, a rounded spine, and a text block
  // whose leaves were never quite trimmed square.
  function hardcover(pos, o) {
    const g = new THREE.Group(); g.position.set(...pos); g.rotation.y = o.ry || 0; groupRoot.add(g);
    const cloth = pbr('rough_linen', o.w * 9, o.h * 9, { color: albedo(o.color), roughness: 1 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xe9e1cf, roughness: 0.92 });
    const bt = 0.0028, r = T.rng(o.seed || 1);
    // boards lie flat (book on its back): w along x, h along z, t up
    rbox(o.w, bt, o.h, 0.0012, cloth, [0, bt / 2, 0], { parent: g, temp: 20, uv: 0.1 });
    rbox(o.w, bt, o.h, 0.0012, cloth, [0, o.t - bt / 2, 0], { parent: g, temp: 20, uv: 0.1 });
    const spine = new THREE.CylinderGeometry(o.t / 2, o.t / 2, o.h, 20, 1, false, Math.PI, Math.PI);
    add(spine, cloth, [-o.w / 2, o.t / 2, 0], { parent: g, rot: [Math.PI / 2, 0, 0], temp: 20, uv: 0.1 });
    // text block in a few slightly uneven signatures
    const sigs = 5, sh = (o.t - 2 * bt) / sigs;
    for (let i = 0; i < sigs; i++) {
      const inset = 0.003 + r() * 0.0015;
      box(o.w - inset - 0.002, sh * 0.98, o.h - 2 * inset - r() * 0.001, paper, [-0.001 + (r() - 0.5) * 0.0012, bt + sh * (i + 0.5), (r() - 0.5) * 0.001], { parent: g, temp: 20, uv: 0.7 });
    }
    return g;
  }

  function openBookFaceDown(pos, ry, color) {
    const g = new THREE.Group(); g.position.set(...pos); g.rotation.y = ry; groupRoot.add(g);
    const cloth = pbr('rough_linen', 1.6, 2.2, { color: albedo(color), roughness: 1 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xece5d4, roughness: 0.9 });
    const W = 0.135, H = 0.205, tHalf = 0.012, a = 0.16; // each half tilts 9° off the table
    for (const s of [-1, 1]) {
      const half = new THREE.Group(); half.position.set(0, 0.024, 0); half.rotation.z = s * -a; g.add(half);
      rbox(W, 0.0026, H, 0.001, cloth, [s * W / 2, 0, 0], { parent: half, temp: 20, uv: 0.1 });
      // pages fan open underneath, top leaves lifting
      for (let k = 0; k < 4; k++) box(W - 0.006 - k * 0.001, tHalf / 4, H - 0.006, paper, [s * (W / 2 - 0.002), -0.0013 - tHalf / 8 - k * tHalf / 4, 0], { parent: half, rot: [0, 0, s * k * 0.012], temp: 20, uv: 0.7 });
    }
    add(new THREE.CylinderGeometry(0.008, 0.008, H, 16, 1, false, 0, Math.PI), cloth, [0, 0.026, 0], { parent: g, rot: [Math.PI / 2, 0, 0], temp: 20 });
  }

  function driedStem(base) {
    const g = new THREE.Group(); g.position.set(...base); groupRoot.add(g);
    const stemM = std(0x6a6b50, { roughness: 0.8 });
    const leafM = new THREE.MeshStandardMaterial({ color: 0x8c9a86, roughness: 0.75, side: THREE.DoubleSide });
    const curve = new THREE.CatmullRomCurve3([[0, -0.05, 0], [0.01, 0.12, 0.005], [0.05, 0.28, 0.02], [0.11, 0.38, 0.03]].map(a => new THREE.Vector3(...a)));
    add(new THREE.TubeGeometry(curve, 40, 0.0018, 6), stemM, null, { parent: g, uv: 0.05 });
    for (let i = 0; i < 9; i++) {
      const t = 0.3 + i * 0.075, p = curve.getPoint(Math.min(t, 1));
      const lg = new THREE.CircleGeometry(0.014 - i * 0.0007, 16); lg.scale(1, 0.85, 1);
      const pp = lg.attributes.position; for (let j = 0; j < pp.count; j++) pp.setZ(j, (pp.getX(j) ** 2 + pp.getY(j) ** 2) * 6);
      lg.computeVertexNormals();
      add(lg, leafM, p.toArray(), { parent: g, rot: [0.3, i * 2.4, 0.4], uv: 0.06 });
    }
  }

  // Shelf heights: cast rays straight down through each bay and keep the upward-facing boards.
  function shelfLevels(obj, x, zs) {
    const rc = new THREE.Raycaster();
    const res = zs.map(z => {
      rc.set(new THREE.Vector3(x - 0.05, 3, z), new THREE.Vector3(0, -1, 0));
      const hits = rc.intersectObject(obj, true).filter(h => h.face && h.face.normal.clone().transformDirection(h.object.matrixWorld).y > 0.8).map(h => h.point.y);
      const out = [];
      for (const y of hits.sort((a, b) => a - b)) if (!out.length || y - out[out.length - 1] > 0.08) out.push(y);
      return out;
    });
    return { right: res[0], left: res[1] };
  }

  // A run of books on a shelf: real scanned volumes, sized and toned so no two neighbours match,
  // with the odd one leaning, a horizontal stack, and a gap where something was taken out.
  function bookRow(xFront, z0, z1, y, seed) {
    const tints = [0xffffff, 0xd9e0ea, 0xead8cc, 0xd4dccb, 0xf2e8d6, 0xc9ccd2, 0xffffff, 0xe6d3c2];
    let z = z0 + 0.01 + bookRng() * 0.03;
    let made = 0;
    while (z < z1 - 0.04) {
      const nb = 1 + Math.floor(bookRng() * 20);
      const name = `book_encyclopedia_set_01_book${String(nb).padStart(2, '0')}`;
      const sy = 0.78 + bookRng() * 0.38, sx = 0.75 + bookRng() * 0.7, sz = 0.85 + bookRng() * 0.25;
      if (bookRng() < 0.07 && made > 2) { z += 0.05 + bookRng() * 0.06; continue; }         // a gap
      if (bookRng() < 0.08 && made > 1 && z < z1 - 0.3) {                                    // a small flat stack
        let yy = y;
        for (let k = 0; k < 3; k++) {
          const sb = piece('book_encyclopedia_set_01', `book_encyclopedia_set_01_book${String(1 + Math.floor(bookRng() * 20)).padStart(2, '0')}`, [0, 0, 0], { rz: Math.PI / 2, ry: -Math.PI / 2 + (bookRng() - 0.5) * 0.2, s: [1.1 - k * 0.08, 0.9 - k * 0.05, 1], tint: tints[Math.floor(bookRng() * tints.length)], uv: 0.1 });
          settle(sb, [xFront + 0.1, yy, z + 0.12]);
          yy = new THREE.Box3().setFromObject(sb, true).max.y;
        }
        z += 0.26; made = 0; continue;
      }
      const b = piece('book_encyclopedia_set_01', name, [0, y, 0], { ry: -Math.PI / 2, s: [sx, sy, sz], tint: tints[Math.floor(bookRng() * tints.length)], uv: 0.1 });
      const t = b.userData.size.x * sx, d = b.userData.size.z * sz;
      b.position.set(xFront + d / 2 + 0.005 + bookRng() * 0.012, y, z + t / 2);
      if (bookRng() < 0.06 && made > 3) { b.rotation.x = -0.22; b.position.z += 0.04; z += 0.05; }
      z += t + 0.0015;
      made++;
    }
  }

  function eyeChartFrame(p) {
    const W = 0.5, H = 0.705, fw = 0.012, fd = 0.018;
    const g = new THREE.Group(); groupRoot.add(g);
    g.position.set(p[0], p[1], p[2]);
    g.rotation.set(0, -Math.PI / 2 + 0.04, 0, 'YXZ');
    const tilt = new THREE.Group(); tilt.rotation.x = -0.1; g.add(tilt); // leaning back on the wall
    const blackAsh = std(0x151413, { roughness: 0.55 });
    rbox(W, fw, fd, 0.002, blackAsh, [0, fw / 2, 0], { parent: tilt });
    rbox(W, fw, fd, 0.002, blackAsh, [0, H - fw / 2, 0], { parent: tilt });
    rbox(fw, H, fd, 0.002, blackAsh, [-W / 2 + fw / 2, H / 2, 0], { parent: tilt });
    rbox(fw, H, fd, 0.002, blackAsh, [W / 2 - fw / 2, H / 2, 0], { parent: tilt });
    box(W - 0.01, H - 0.01, 0.003, std(0xb9b2a6, { roughness: 0.9 }), [0, H / 2, -0.006], { parent: tilt });
    // the print, slightly bowed, as paper in a frame without glass usually is
    const pg = new THREE.PlaneGeometry(W - 2 * fw, H - 2 * fw, 20, 28);
    { const pp = pg.attributes.position; for (let i = 0; i < pp.count; i++) pp.setZ(i, 0.0015 * Math.cos(pp.getX(i) / (W / 2) * Math.PI / 2) * Math.cos((pp.getY(i)) / (H / 2) * Math.PI / 2)); pg.computeVertexNormals(); }
    add(pg, new THREE.MeshStandardMaterial({ map: T.eyeChart(), roughness: 0.88 }), [0, H / 2, -0.002], { parent: tilt, uv: 0.7, noMerge: true });
    collide(p[0] - 0.12, HX, p[2] - 0.3, p[2] + 0.3, 0, 0.8);
    contact(p[0] - 0.02, p[2], 0.16, 0.6, 0, 0.35);
  }

  // Cut sunflowers in the jug: thick florets on a domed disc, two rings of curved petals with
  // real thickness, green bracts behind, hairy stems and two leaves each. Heads droop toward the room.
  function sunflowers(base) {
    const g = new THREE.Group(); g.position.set(...base); groupRoot.add(g);
    const stemMat = new THREE.MeshPhysicalMaterial({ color: 0x4f6e2c, roughness: 0.75, sheen: 1, sheenRoughness: 0.5, sheenColor: 0xa9c08a });
    const leafMat = new THREE.MeshPhysicalMaterial({ map: T.leaf(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, sheen: 0.6, sheenRoughness: 0.5, sheenColor: 0x9fbf7f });
    const petalMap = T.petal(false), petalUV = T.petal(true);
    const petalMat = new THREE.MeshPhysicalMaterial({ map: petalMap, side: THREE.DoubleSide, roughness: 0.62, sheen: 0.9, sheenRoughness: 0.45, sheenColor: 0xffe58a });
    const bractMat = new THREE.MeshPhysicalMaterial({ color: 0x3f5a22, roughness: 0.8, side: THREE.DoubleSide, sheen: 1, sheenRoughness: 0.5, sheenColor: 0x8faa6a });
    const discMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const rr = T.rng(23);
    // [lean x, height, lean z, disc radius, petal length, spin]
    const flowers = [[-0.06, 0.5, 0.05, 0.05, 0.05, 0.3], [0.07, 0.42, 0.08, 0.042, 0.045, -0.5], [-0.01, 0.34, 0.12, 0.034, 0.038, 1.1]];
    for (const [lx, hgt, lz, R, PL, spin] of flowers) {
      const top = new THREE.Vector3(lx, hgt, lz);
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(lx * 0.3, hgt * 0.45, lz * 0.3), new THREE.Vector3(lx * 0.85, hgt * 0.9, lz * 0.8), top]);
      add(new THREE.TubeGeometry(curve, 48, 0.0055, 10), stemMat, null, { parent: g, uv: 0.05, temp: 19 });
      for (let k = 0; k < 2; k++) {
        const at = curve.getPoint(0.42 + k * 0.22);
        const lf = new THREE.Group(); lf.position.copy(at); lf.rotation.set(0, spin + k * 2.6, 0); g.add(lf);
        const stalk = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, 0.015, 0), new THREE.Vector3(0.04, 0.02, 0)]);
        add(new THREE.TubeGeometry(stalk, 8, 0.0025, 6), stemMat, null, { parent: lf, uv: 0.05 });
        for (const off of [0, -0.0005]) {
          const lg = new THREE.PlaneGeometry(0.1, 0.15, 8, 12);
          const pp = lg.attributes.position;
          for (let j = 0; j < pp.count; j++) { const x = pp.getX(j), y = pp.getY(j) + 0.075; pp.setXYZ(j, x, y, x * x * 7 - y * y * 2.2 + off + Math.sin(y * 60) * 0.002 * Math.abs(x) * 10); }
          lg.computeVertexNormals();
          add(lg, leafMat, [0.04, 0.02, 0], { parent: lf, rot: [-1.15, 0, -Math.PI / 2], uv: 0.06, temp: 19 });
        }
      }
      // head: +z is the face; aim it into the room and down, like a heavy cut sunflower
      const head = new THREE.Group(); head.position.copy(top); g.add(head);
      head.lookAt(new THREE.Vector3(top.x + base[0] * 0 + 0.2 * Math.sin(spin), top.y - 0.45, top.z + 1.0));
      head.rotateZ(spin);
      // disc: a dome packed with ~600 florets in Fibonacci spirals, each a small six-sided cone
      const fl = [], cols = [];
      const golden = Math.PI * (3 - Math.sqrt(5)), N = Math.round(600 * (R / 0.05) ** 2);
      const colC = new THREE.Color();
      for (let i = 0; i < N; i++) {
        const k = Math.sqrt((i + 0.5) / N), rad = k * R, a = i * golden;
        const s = R * 0.07 * (0.75 + 0.5 * k);
        const dome = R * 0.32 * Math.sqrt(Math.max(0, 1 - k * k));
        const cg = new THREE.ConeGeometry(s, s * (1.6 - k * 0.6), 6, 1);
        cg.rotateX(Math.PI / 2);
        cg.translate(Math.cos(a) * rad, Math.sin(a) * rad, dome + s * 0.5);
        const ng = cg.toNonIndexed();
        // centre green-brown, then deep chocolate, outer florets open and dusted with pollen
        if (k < 0.3) colC.setRGB(0.09, 0.08, 0.025); else if (k < 0.82) colC.setRGB(0.05, 0.022, 0.008); else colC.setRGB(0.22, 0.12, 0.02);
        colC.multiplyScalar(0.8 + rr() * 0.4);
        const c = new Float32Array(ng.attributes.position.count * 3);
        for (let j = 0; j < c.length; j += 3) { c[j] = colC.r; c[j + 1] = colC.g; c[j + 2] = colC.b; }
        ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
        fl.push(ng);
      }
      // the receptacle the florets sit in: a shallow brown dome
      const dome = new THREE.SphereGeometry(R, 40, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).toNonIndexed();
      dome.rotateX(Math.PI / 2); dome.scale(1, 1, 0.32);
      const dc = new Float32Array(dome.attributes.position.count * 3); for (let j = 0; j < dc.length; j += 3) { dc[j] = 0.03; dc[j + 1] = 0.016; dc[j + 2] = 0.006; }
      dome.setAttribute('color', new THREE.BufferAttribute(dc, 3));
      fl.push(dome);
      for (const f of fl) if (f.attributes.uv) f.deleteAttribute('uv');
      add(mergeGeometries(fl), discMat, null, { parent: head, uv: 0.02, temp: 19, noMerge: true });
      // calyx and bracts
      const calyx = new THREE.SphereGeometry(R * 0.97, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
      calyx.rotateX(-Math.PI / 2); calyx.scale(1, 1, 0.55);
      add(calyx, bractMat, [0, 0, -0.002], { parent: head, uv: 0.05, temp: 19 });
      for (let i = 0; i < 22; i++) {
        const a = i / 22 * Math.PI * 2 + rr() * 0.2;
        const bg = new THREE.PlaneGeometry(R * 0.38, R * 0.6, 2, 6);
        const pp = bg.attributes.position;
        for (let j = 0; j < pp.count; j++) { const y = pp.getY(j) / (R * 0.6) + 0.5, x = pp.getX(j); pp.setX(j, x * (1 - y * 0.85)); pp.setZ(j, -y * y * R * 0.25 + x * x * 20); }
        bg.translate(0, R * 0.62, 0); bg.computeVertexNormals();
        const m = add(bg, bractMat, [0, 0, -R * 0.12], { parent: head, uv: 0.05, temp: 19 });
        m.rotation.set(-0.5, 0, a, 'ZYX');
      }
      // petals: a thin solid shell (0.6 mm), cupped across, curved along, some drooping
      for (let ring = 0; ring < 2; ring++) {
        const n = 19 + ring * 2;
        for (let i = 0; i < n; i++) {
          const a = (i + ring * 0.5) / n * Math.PI * 2 + (rr() - 0.5) * 0.1;
          const len = PL * (0.85 + rr() * 0.3), wid = len * 0.34;
          const pg = petalGeometry(wid, len, 0.0006, 0.12 + rr() * 0.12 + ring * 0.1, (rr() - 0.5) * 0.4);
          const pm = add(pg, petalMat, [0, 0, -0.002 - ring * 0.003], { parent: head, uvMap: petalUV, uv: 1, cast: ring === 0, temp: 19 });
          pm.rotation.set(0, 0, a - Math.PI / 2);
          pm.rotateX(0.18 - ring * 0.3 - rr() * 0.12);
          pm.position.set(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92, pm.position.z);
        }
      }
    }
  }
}

// Ray petal as a thin closed solid (two skins `thick` apart, stitched at the edges).
// Local +y runs base -> tip, +z is the petal's face. Cupped across, curved along, slightly twisted.
function petalGeometry(w, l, thick, droop, twist) {
  const segU = 8, segV = 20;
  const half = t => w / 2 * Math.pow(Math.sin(Math.PI * Math.min(0.999, Math.pow(t, 0.62))), 0.75) * (t > 0.9 ? 1 - (t - 0.9) * 2 : 1) + 0.0004;
  const pos = [], uvs = [], idx = [];
  const P = (i, j, side) => {
    const t = j / segV, u = i / segU * 2 - 1;
    const x = u * half(t), y = t * l;
    const cup = u * u * w * 0.16 * (1 - t * 0.5);
    const bend = -droop * t * t * l;
    const tw = twist * t;
    const z = cup + bend + x * Math.sin(tw) + (side ? thick / 2 : -thick / 2);
    pos.push(x * Math.cos(tw), y, z); uvs.push(0.5 + x / w * 0.98, t);
  };
  for (const side of [1, 0]) for (let j = 0; j <= segV; j++) for (let i = 0; i <= segU; i++) P(i, j, side);
  const row = segU + 1, off = row * (segV + 1);
  for (let j = 0; j < segV; j++) for (let i = 0; i < segU; i++) {
    const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, b, d, a, d, c);                                   // top skin
    idx.push(off + a, off + d, off + b, off + a, off + c, off + d); // bottom skin (reversed)
  }
  // edges: left, right, tip, base
  const edge = (a, b) => idx.push(a, b, off + b, a, off + b, off + a);
  for (let j = 0; j < segV; j++) { edge((j + 1) * row, j * row); edge(j * row + segU, (j + 1) * row + segU); }
  for (let i = 0; i < segU; i++) { edge(segV * row + i + 1, segV * row + i); edge(i, i + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Per-frame motion. The room is still on a Sunday morning; nothing moves on its own.
export function animateRoom(animated, t) {
  for (const a of animated) if (a.update) a.update(t);
}
