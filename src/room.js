// A real child's bedroom, 4.6 × 4.0 m, 2.6 m ceiling. 1 unit = 1 metre.
// Furniture and props are photoscanned CC0 models from Poly Haven; floor, walls,
// fabrics and the view out of the window are Poly Haven CC0 textures / HDRI.
// The camera lives ~10 cm off the floor, so the bed is a cliff and the desk a roof.
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
const WIN = { x0: -1.05, x1: 0.45, y0: 0.85, y1: 2.2 };
const WALL_T = 0.2;

const MODELS = ['wooden_display_shelves_01', 'side_table_01', 'painted_wooden_chair_01', 'small_wooden_table_01',
  'desk_lamp_arm_01', 'vintage_wooden_drawer_01', 'wicker_basket_01', 'rubber_duck_toy', 'alarm_clock_01', 'wall_clock',
  'potted_plant_01', 'throw_pillows_01', 'standing_picture_frame_01', 'stationery_supplies', 'football', 'baseball_01',
  'cardboard_box_01', 'modern_ceiling_lamp_01', 'planter_pot_clay', 'carved_wooden_elephant'];

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
  const SURF = ['oak_wood_planks', 'painted_plaster_wall', 'poly_wool_herringbone', 'rough_linen', 'cotton_jersey', 'oak_veneer_01'];
  const [surfTex, models, sky] = await Promise.all([
    Promise.all(SURF.map(n => Promise.all([loadTex(`assets/tex/${n}_diff.webp`, true), loadTex(`assets/tex/${n}_nor.webp`), loadTex(`assets/tex/${n}_arm.webp`)]))),
    Promise.all(MODELS.map(n => gltfLoader.loadAsync(`assets/models/${n}.glb`).then(g => [n, g.scene]))),
    loadTex('assets/tex/sky.jpg', true),
  ]);
  const S = Object.fromEntries(SURF.map((n, i) => [n, surfTex[i]]));
  const M = Object.fromEntries(models);

  sky.mapping = THREE.EquirectangularReflectionMapping;
  // the garden outside: a big panorama sphere (part of the scene, so every eye pass sees it)
  sky.mapping = THREE.UVMapping;
  const skyMat = new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false, toneMapped: false });
  skyMat.color.setScalar(2.2);
  const skyGeo = new THREE.SphereGeometry(25, 64, 32);
  skyGeo.rotateY(-Math.PI / 2);
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.position.set(0, 1.2, 0);
  skyMesh.userData = { temp: 10, uv: 0.8, uvEmit: true, sky: true };
  skyMesh.frustumCulled = false;
  groupRoot.add(skyMesh);
  lights.skyMat = skyMat;

  // PBR surface material from a Poly Haven texture set; every user gets its own clones so repeats differ.
  function pbr(name, rx, ry, o = {}) {
    const [d, n, a] = S[name].map(t => { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; });
    return new THREE.MeshStandardMaterial({ map: d, normalMap: n, aoMap: a, roughnessMap: a, roughness: 1, metalness: 0, ...o });
  }
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });

  function tag(m, opt) {
    m.castShadow = opt.cast !== false;
    m.receiveShadow = opt.receive !== false;
    m.userData.temp = opt.temp ?? 20;
    m.userData.uv = opt.uv ?? 0.08;
    if (opt.uvMap) m.userData.uvMap = opt.uvMap;
    if (opt.glass) m.userData.glass = true;
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
  const rbox = (w, h, d, r, mat, pos, opt) => add(new RoundedBoxGeometry(w, h, d, 3, r), mat, pos, opt);
  const collide = (x0, x1, z0, z1, y0 = 0, y1 = 3) => colliders.push({ x0, x1, z0, z1, y0, y1 });

  // Drop a scanned model into the room. Collision box follows its real footprint.
  function place(name, pos, o = {}) {
    const src = M[name];
    const g = src.clone(true);
    g.position.set(pos[0], pos[1], pos[2]);
    g.rotation.y = o.ry || 0;
    if (o.rx) g.rotation.x = o.rx;
    if (o.rz) g.rotation.z = o.rz;
    g.scale.setScalar(o.s || 1);
    g.traverse(m => { if (m.isMesh && m.material.transmission > 0) {
      // transmission needs an extra render pass that breaks cube-camera faces: fake the glass instead
      m.material = m.material.clone(); m.material.transmission = 0; m.material.transparent = true; m.material.opacity = 0.15; m.material.depthWrite = false; m.castShadow = false; m.userData.glass = true;
    } });
    g.traverse(m => { if (m.isMesh) { m.userData.fromModel = true; tag(m, { temp: o.temp, uv: o.uv, cast: m.userData.glass ? false : o.cast, glass: m.userData.glass }); if (o.tint) { m.material = m.material.clone(); m.material.color.multiply(new THREE.Color(o.tint)); } } });
    (o.parent || groupRoot).add(g);
    g.updateMatrixWorld(true);
    if (o.collide !== false && !o.parent) {
      const b = new THREE.Box3().setFromObject(g);
      collide(b.min.x - 0.03, b.max.x + 0.03, b.min.z - 0.03, b.max.z + 0.03, b.min.y - 0.02, b.max.y);
    }
    return g;
  }

  // ---------------------------------------------------------------- shell
  const floorMat = pbr('oak_wood_planks', ROOM.w / 2.2, ROOM.d / 2.2, { roughness: 0.9 });
  floorMat.normalScale.set(0.6, 0.6);
  add(new THREE.BoxGeometry(ROOM.w, 0.04, ROOM.d), floorMat, [0, -0.02, 0], { temp: 19.5, cast: false });

  const paint = 0xdfe6ea;                 // pale blue-grey emulsion
  // emulsion paint: flat colour, only the plaster's fine relief shows through
  const wallMat = (w, h) => { const m = pbr('painted_plaster_wall', w / 1.6, h / 1.6, { color: paint, roughness: 0.92 }); m.map = null; m.aoMap = null; m.normalScale.set(0.25, 0.25); return m; };
  const ceilMat = pbr('painted_plaster_wall', ROOM.w / 1.6, ROOM.d / 1.6, { color: 0xfbfaf6, roughness: 0.95 });
  ceilMat.map = null; ceilMat.aoMap = null; ceilMat.normalScale.set(0.2, 0.2);
  add(new THREE.PlaneGeometry(ROOM.w, ROOM.d, 23, 20), ceilMat, [0, ROOM.h, 0], { rot: [Math.PI / 2, 0, 0], temp: 22, cast: false });

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
  // a roof slab above so no light leaks in over the walls
  box(ROOM.w + 0.6, 0.2, ROOM.d + 0.6, std(0x808080), [0, ROOM.h + 0.1, 0], { temp: 20 });

  // skirting boards: satin white, 9 cm, with a rounded top edge
  const satin = std(0xf7f5ef, { roughness: 0.35 });
  const skirt = (len, x, z, ry) => { const m = rbox(len, 0.09, 0.016, 0.005, satin, [x, 0.045, z], { rot: [0, ry, 0], temp: 19.5 }); return m; };
  skirt(WIN.x0 + HX, (-HX + WIN.x0) / 2, -HZ + 0.008, 0); skirt(HX - WIN.x0, (WIN.x0 + HX) / 2, -HZ + 0.008, 0);
  skirt(ROOM.w, 0, HZ - 0.008, 0); skirt(ROOM.d, -HX + 0.008, 0, Math.PI / 2); skirt(ROOM.d, HX - 0.008, 0, Math.PI / 2);

  // ------------------------------------------------------------- window
  const wcx = (WIN.x0 + WIN.x1) / 2, ww = WIN.x1 - WIN.x0, wh = WIN.y1 - WIN.y0, wcy = (WIN.y0 + WIN.y1) / 2;
  const reveal = wallMat(1, 1);
  // plaster reveals inside the opening
  box(0.01, wh, WALL_T, reveal, [WIN.x0 + 0.005, wcy, bz]);
  box(0.01, wh, WALL_T, reveal, [WIN.x1 - 0.005, wcy, bz]);
  box(ww, 0.01, WALL_T, reveal, [wcx, WIN.y1 - 0.005, bz]);
  // white uPVC casement set near the outside face, centre mullion, glass
  const pvc = std(0xf4f4f2, { roughness: 0.3 });
  const fz = -HZ - 0.15;
  rbox(ww, 0.07, 0.07, 0.01, pvc, [wcx, WIN.y0 + 0.035, fz]);
  rbox(ww, 0.07, 0.07, 0.01, pvc, [wcx, WIN.y1 - 0.035, fz]);
  rbox(0.07, wh, 0.07, 0.01, pvc, [WIN.x0 + 0.035, wcy, fz]);
  rbox(0.07, wh, 0.07, 0.01, pvc, [WIN.x1 - 0.035, wcy, fz]);
  rbox(0.09, wh, 0.08, 0.01, pvc, [wcx, wcy, fz]);
  for (const s of [-1, 1]) {
    const cx = wcx + s * ww / 4;
    rbox(ww / 2 - 0.1, 0.05, 0.05, 0.008, pvc, [cx, WIN.y0 + 0.09, fz + 0.02]);
    rbox(ww / 2 - 0.1, 0.05, 0.05, 0.008, pvc, [cx, WIN.y1 - 0.09, fz + 0.02]);
  }
  add(new THREE.BoxGeometry(0.02, 0.12, 0.02), std(0xe8e8e8, { metalness: 0.8, roughness: 0.25 }), [wcx + 0.07, wcy, fz + 0.05]);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, roughness: 0.02, metalness: 0, envMapIntensity: 0.4, depthWrite: false });
  add(new THREE.PlaneGeometry(ww - 0.1, wh - 0.1), glass, [wcx, wcy, fz], { cast: false, receive: false, temp: 13, uv: 0.5, glass: true });
  // window board (sill) in white, overhanging the radiator
  rbox(ww + 0.12, 0.025, WALL_T + 0.03, 0.006, satin, [wcx, WIN.y0 - 0.012, -HZ - WALL_T / 2 + 0.015], { temp: 18 });

  // floor-length linen curtains with real folds, on a black metal pole
  const linen = pbr('rough_linen', 1.2, 2.6, { color: 0xeee8dc, side: THREE.DoubleSide, roughness: 1 });
  function curtain(xc, width, gather, seed) {
    const H = 2.38, seg = 90;
    const geo = new THREE.PlaneGeometry(width, H, seg, 24);
    const p = geo.attributes.position, r = T.rng(seed);
    const ph = [r() * 6, r() * 6, r() * 6];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), v = (H / 2 - y) / H;   // v: 0 at top, 1 at hem
      const f = Math.sin(x * 38 + ph[0]) * 0.045 + Math.sin(x * 71 + ph[1]) * 0.012 + Math.sin(x * 13 + ph[2] + v * 1.5) * 0.02;
      p.setZ(i, f * (0.8 + 0.4 * v) * gather);
      p.setX(i, x * (1 + 0.08 * v * Math.sign(x)));            // hem flares a little
    }
    geo.computeVertexNormals();
    add(geo, linen, [xc, 2.38 - H / 2 + 0.01, -HZ + 0.11], { temp: 19 });
  }
  curtain(WIN.x0 - 0.24, 0.6, 1.0, 3);
  curtain(WIN.x1 + 0.24, 0.6, 1.0, 9);
  const blackMetal = std(0x1c1c1c, { metalness: 0.6, roughness: 0.4 });
  add(new THREE.CylinderGeometry(0.012, 0.012, ww + 1.3, 16), blackMetal, [wcx, 2.42, -HZ + 0.11], { rot: [0, 0, Math.PI / 2] });
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.022, 16, 12), blackMetal, [wcx + s * (ww / 2 + 0.66), 2.42, -HZ + 0.11]);
    box(0.02, 0.05, 0.11, blackMetal, [wcx + s * (ww / 2 + 0.5), 2.44, -HZ + 0.055]);
  }

  // panel radiator under the window: the warmest big thing in the room
  const radMat = std(0xf2f2ef, { roughness: 0.3, metalness: 0.1 });
  const rad = new THREE.Group(); rad.position.set(wcx, 0.14, -HZ + 0.07); groupRoot.add(rad);
  for (let i = 0; i < 36; i++) add(new THREE.CapsuleGeometry(0.013, 0.5, 4, 10), radMat, [-0.49 + i * 0.028, 0.27, 0.012], { parent: rad, temp: 52 }).scale.set(1, 1, 0.6);
  box(1.0, 0.54, 0.02, radMat, [0, 0.27, -0.005], { parent: rad, temp: 52 });
  box(1.0, 0.012, 0.06, std(0xe9e9e6, { roughness: 0.5 }), [0, 0.55, 0.0], { parent: rad, temp: 50 });
  const chrome = std(0xdadada, { metalness: 1, roughness: 0.18 });
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 12), chrome, [s * 0.47, -0.07, 0.03], { parent: rad, temp: 55 });
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.06, 20), std(0xffffff, { roughness: 0.4 }), [0.53, 0.0, 0.03], { parent: rad, rot: [0, 0, Math.PI / 2], temp: 40 });
  collide(wcx - 0.55, wcx + 0.55, -HZ, -HZ + 0.13, 0.05, 0.75);

  // ------------------------------------------------------------------ bed
  // single bed, head against the back wall: the toy's cave
  const oak = pbr('oak_veneer_01', 1, 2, { roughness: 0.8 });
  const oakS = pbr('oak_veneer_01', 0.4, 1, { roughness: 0.8 });
  const bed = { x0: -HX + 0.02, x1: -HX + 0.98, z0: -HZ + 0.02, z1: -HZ + 2.08 };
  const bcx = (bed.x0 + bed.x1) / 2, bcz = (bed.z0 + bed.z1) / 2, bw = bed.x1 - bed.x0, bl = bed.z1 - bed.z0;
  for (const [x, z] of [[bed.x0 + 0.035, bed.z0 + 0.035], [bed.x1 - 0.035, bed.z0 + 0.035], [bed.x0 + 0.035, bed.z1 - 0.035], [bed.x1 - 0.035, bed.z1 - 0.035]]) {
    rbox(0.065, 0.3, 0.065, 0.006, oakS, [x, 0.15, z]);
    collide(x - 0.045, x + 0.045, z - 0.045, z + 0.045);
  }
  rbox(0.025, 0.14, bl, 0.004, oak, [bed.x1 - 0.0125, 0.29, bcz]);          // side rail
  rbox(0.025, 0.14, bl, 0.004, oak, [bed.x0 + 0.0125, 0.29, bcz]);
  rbox(bw, 0.14, 0.025, 0.004, oak, [bcx, 0.29, bed.z1 - 0.0125]);          // foot rail
  for (let i = 0; i < 13; i++) rbox(bw - 0.06, 0.012, 0.07, 0.003, oakS, [bcx, 0.27, bed.z0 + 0.1 + i * 0.145], { temp: 20 }); // slats
  rbox(bw, 0.62, 0.03, 0.008, oak, [bcx, 0.62, bed.z0 + 0.015]);            // headboard
  collide(bed.x0, bed.x1, bed.z0, bed.z1, 0.22, 3);                        // can crawl under the rails
  // mattress, fitted sheet
  const sheet = pbr('cotton_jersey', 2, 4, { color: 0xf5f3ee });
  rbox(bw - 0.04, 0.2, bl - 0.05, 0.05, sheet, [bcx, 0.4, bcz + 0.01], { temp: 21, uv: 0.5 });
  // duvet: draped over the room side and the foot, wrinkled, turned down at the head
  const duvetMat = pbr('rough_linen', 2.5, 3, { color: 0x8aa3b8, side: THREE.DoubleSide });
  add(duvetGeometry(bw + 0.02, 1.5, 0.42, 0.33, 0.04, 21), duvetMat, [bed.x0 - 0.01, 0.535, bed.z1 - 1.5 + 0.03], { temp: 22 });
  // turned-down fold
  const fold = rbox(bw - 0.02, 0.05, 0.22, 0.025, duvetMat, [bcx, 0.545, bed.z1 - 1.5 + 0.02], { temp: 22 });
  fold.rotation.x = 0.05;
  // pillow
  const pillow = add(pillowGeometry(0.62, 0.13, 0.4), pbr('cotton_jersey', 1, 1, { color: 0xffffff }), [bcx, 0.56, bed.z0 + 0.3], { uv: 0.55, temp: 21 });
  pillow.rotation.set(-0.12, 0.04, 0);
  place('throw_pillows_01', [bcx + 0.05, 0.5, bed.z0 + 0.62], { ry: Math.PI / 2 + 0.15, s: 0.62, collide: false });

  // under the bed: a cardboard box of stuff and two old footballs
  place('cardboard_box_01', [bcx - 0.1, 0, bed.z0 + 0.45], { ry: 0.3, s: 0.65, collide: false });
  collide(bed.x0, bed.x0 + 0.5, bed.z0 + 0.2, bed.z0 + 0.7, 0, 0.25);
  place('football', [bcx + 0.05, 0, bed.z0 + 1.3], { ry: 1.2, s: 0.85 });

  // nightstand by the head of the bed: alarm clock, photo, a glass of water
  const ns = place('side_table_01', [-1.08, 0, -HZ + 0.27], { ry: 0, s: 0.92 });
  const nsTop = 0.548 * 0.92;
  place('alarm_clock_01', [-1.2, nsTop, -HZ + 0.25], { ry: 0.5, s: 0.8, temp: 21 });
  place('standing_picture_frame_01', [-0.95, nsTop, -HZ + 0.2], { ry: -Math.PI / 2 + 0.4, s: 0.85 });
  add(new THREE.CylinderGeometry(0.032, 0.028, 0.1, 24, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide }), [-1.0, nsTop + 0.05, -HZ + 0.36], { cast: false, glass: true, temp: 18 });

  // a plug-in night light by the bed (glows when the lights are off)
  const nlMesh = rbox(0.05, 0.07, 0.03, 0.012, new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffc870, emissiveIntensity: 0.0, roughness: 0.4 }), [-HX + 0.016, 0.3, 0.32], { rot: [0, Math.PI / 2, 0], temp: 30 });
  lights.nightLightMesh = nlMesh;
  const nl = new THREE.PointLight(0xffb85c, 0, 3.5, 1.8);
  nl.position.set(-HX + 0.06, 0.3, 0.32); scene.add(nl); lights.nightLight = nl;

  // chest of drawers on the left wall, a wall clock above it
  place('vintage_wooden_drawer_01', [-HX + 0.32, 0, 1.25], { ry: Math.PI / 2, s: 0.62 });
  place('wall_clock', [-HX + 0.002, 1.75, 1.25], { ry: Math.PI / 2, s: 0.9, collide: false });
  place('carved_wooden_elephant', [-HX + 0.25, 1.09 * 0.62, 1.55], { ry: Math.PI / 2 + 0.5, s: 1.3, collide: false });

  // ---------------------------------------------------- right-hand wall
  // cube shelving with fabric bins, books and toys
  const shelfS = 1.0;
  place('wooden_display_shelves_01', [HX - 0.19, 0, -1.2], { ry: Math.PI, s: shelfS });
  // books on the shelves: real proportions, muted colours, a few leaning
  const bookCols = ['#6d2e2e', '#2f4b6e', '#c9a227', '#3e6b48', '#b4532a', '#e8e1d0', '#24323f', '#8c5a8a', '#d9d0bd', '#7a8b99'];
  const br = T.rng(12);
  function bookRow(xFront, z0, z1, y, maxH) {
    let z = z0;
    let lean = 0;
    while (z < z1 - 0.03) {
      const t = 0.015 + br() * 0.03, h = Math.min(maxH, 0.17 + br() * 0.12), d = 0.13 + br() * 0.06;
      const col = bookCols[Math.floor(br() * bookCols.length)];
      const mats = [std(0xf3eee2, { roughness: 0.9 }), std(col), std(col), std(col), std(0xffffff, { map: T.bookSpine(Math.floor(br() * 1000), col), roughness: 0.7 }), std(col)];
      // box faces: +x, -x, +y, -y, +z, -z; the spine (-x) faces the room
      const b = add(new THREE.BoxGeometry(d, h, t), [mats[0], mats[4], mats[0], mats[1], mats[1], mats[1]], [xFront + d / 2 + 0.01, y + h / 2, z + t / 2], { uv: 0.1 });
      if (br() < 0.12 && z < z1 - 0.2) { lean = 0.25; b.rotation.x = lean; b.position.y -= 0.01; z += t + 0.04; } else z += t + 0.002;
    }
  }
  const shelfFront = HX - 0.37;
  bookRow(shelfFront, -1.7, -1.26, 0.395, 0.3);
  bookRow(shelfFront, -1.14, -0.72, 0.78, 0.3);
  place('rubber_duck_toy', [shelfFront + 0.12, 1.165, -1.45], { ry: -Math.PI / 2 - 0.3, s: 0.42, collide: false, uv: 0.05 });
  place('baseball_01', [shelfFront + 0.1, 1.165 + 0.035, -0.95], { s: 1, collide: false });
  place('potted_plant_01', [shelfFront + 0.18, 1.56, -1.0], { s: 0.32, collide: false });
  place('wicker_basket_01', [HX - 0.6, 0, -0.42], { ry: 0.2, s: 1.1 });

  // kid's desk against the wall, chair pulled out, lamp, pens, a mug of cocoa
  const desk = { x: HX - 0.23, z: 0.45, h: 0.533 };
  place('small_wooden_table_01', [desk.x, 0, desk.z], { ry: Math.PI / 2, s: 1.0 });
  place('painted_wooden_chair_01', [desk.x - 0.62, 0, desk.z + 0.08], { ry: -Math.PI / 2 - 0.25, s: 0.85 });
  const lamp = place('desk_lamp_arm_01', [desk.x + 0.06, desk.h, desk.z - 0.3], { ry: -Math.PI / 2 + 0.5, s: 0.62, collide: false, temp: 30 });
  place('stationery_supplies', [desk.x - 0.02, desk.h + 0.074 * 0.9, desk.z + 0.18], { ry: Math.PI / 2 + 0.2, s: 0.9, collide: false });
  // drawing paper and the hot cocoa (one of the warmest things in the room)
  box(0.297, 0.002, 0.21, std(0xffffff, { map: T.kidDrawing(), roughness: 0.9 }), [desk.x - 0.08, desk.h + 0.002, desk.z - 0.02], { rot: [0, 0.25, 0], uv: 0.7, cast: false });
  const mugMat = std(0xf3f0ea, { roughness: 0.25 });
  const mug = new THREE.Group(); mug.position.set(desk.x + 0.02, desk.h, desk.z + 0.36); groupRoot.add(mug);
  add(new THREE.LatheGeometry([[0.0, 0], [0.036, 0], [0.04, 0.005], [0.042, 0.095], [0.038, 0.095], [0.036, 0.008], [0, 0.008]].map(([x, y]) => new THREE.Vector2(x, y)), 32), mugMat, [0, 0, 0], { parent: mug, temp: 58 });
  add(new THREE.TorusGeometry(0.026, 0.007, 10, 24, Math.PI * 1.2), mugMat, [0.042, 0.05, 0], { parent: mug, rot: [0, 0, -Math.PI * 0.6], temp: 45 });
  add(new THREE.CircleGeometry(0.037, 28), std(0x4a2a17, { roughness: 0.2 }), [0, 0.08, 0], { parent: mug, rot: [-Math.PI / 2, 0, 0], temp: 64 });
  // lamp cable down to a socket
  const cable = new THREE.CatmullRomCurve3([[desk.x + 0.1, desk.h, desk.z - 0.36], [desk.x + 0.2, desk.h - 0.05, desk.z - 0.38], [HX - 0.02, 0.35, desk.z - 0.42], [HX - 0.03, 0.05, desk.z - 0.5], [HX - 0.05, 0.006, desk.z - 0.65], [HX - 0.02, 0.15, desk.z - 0.8], [HX - 0.02, 0.28, desk.z - 0.82]].map(a => new THREE.Vector3(...a)));
  add(new THREE.TubeGeometry(cable, 80, 0.003, 6), std(0xf0f0f0, { roughness: 0.5 }), null, { cast: false });
  socket([HX - 0.002, 0.3, desk.z - 0.85], -Math.PI / 2);
  socket([-HX + 0.002, 0.3, 0.32 + 0.08], Math.PI / 2);
  socket([1.75, 0.3, HZ - 0.002], Math.PI);

  // eye chart on the back wall, framed (for testing everyone's acuity)
  const ecx = 1.45, ecy = 1.45;
  box(0.43, 0.6, 0.02, std(0x1a1a1a, { roughness: 0.4 }), [ecx, ecy, -HZ + 0.01]);
  add(new THREE.PlaneGeometry(0.39, 0.56), std(0xffffff, { map: T.eyeChart(), roughness: 0.6 }), [ecx, ecy, -HZ + 0.0205], { uv: 0.7, cast: false });
  add(new THREE.PlaneGeometry(0.39, 0.56), glass, [ecx, ecy, -HZ + 0.024], { cast: false, receive: false, glass: true });

  // sunflowers in a clay pot by the window: petals carry the UV bullseye bees navigate by
  place('planter_pot_clay', [0.85, 0, -HZ + 0.3], { s: 1.15, collide: false });
  sunflowers([0.85, 0.22 * 1.15, -HZ + 0.3]);
  collide(0.68, 1.02, -HZ + 0.13, -HZ + 0.47, 0, 1);

  // hamster cage on a mat by the desk: a 37 °C surprise for the snake
  hamsterCage([1.85, 0, 1.35], -0.2);

  // door, frame and light switch on the front wall
  door(0.85);

  // ------------------------------------------------------------ the floor
  // wool rug, herringbone weave, green: the stage for the red ball test
  const rugMat = pbr('poly_wool_herringbone', 4, 3, { color: 0x5f8f4e });
  rbox(2.0, 0.012, 1.45, 0.005, rugMat, [0.05, 0.006, 0.45], { temp: 20, cast: false });
  const ballMat = new THREE.MeshPhysicalMaterial({ color: 0xc8231b, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.35 });
  const ball = add(new THREE.SphereGeometry(0.085, 48, 32), ballMat, [0.42, 0.097, 0.65]);
  add(new THREE.TorusGeometry(0.0852, 0.004, 8, 64), std(0x8d1610, { roughness: 0.5 }), [0, 0, 0], { parent: ball, rot: [0.3, 0, 0] });
  animated.push({ kind: 'ball', mesh: ball, base: ball.position.clone() });

  // wooden alphabet blocks: red next to green on purpose
  const letters = [['A', '#c8231b', '#fff'], ['B', '#2c6fb0', '#fff'], ['C', '#2f8a3e', '#fff'], ['D', '#e3b31b', '#333'], ['E', '#c8231b', '#fff'], ['F', '#2f8a3e', '#fff']];
  const blockMats = letters.map(([l, bg, fg]) => std(0xffffff, { map: T.letterBlock(l, bg, fg), roughness: 0.75 }));
  const B = 0.05;
  [[-0.45, 0.012 + B / 2, 0.25, 0.1], [-0.45, 0.012 + B * 1.5, 0.25, -0.2], [-0.38, 0.012 + B / 2, 0.33, 0.6], [-0.56, 0.012 + B / 2, 0.36, -0.4], [-0.3, 0.012 + B / 2, 0.16, 0.25], [-0.5, 0.012 + B / 2, 0.12, 0.9]]
    .forEach(([x, y, z, ry], i) => rbox(B, B, B, 0.004, blockMats[i % blockMats.length], [x, y, z], { rot: [0, ry, 0] }));
  collide(-0.62, -0.24, 0.06, 0.42, 0, 0.12);

  // wooden train set: an oval of grooved beech track and a painted train
  trainSet({ cx: -0.05, cz: 0.95, rx: 0.5, rz: 0.24 });

  // a picture book left open on the floor
  const book = new THREE.Group(); book.position.set(0.55, 0.012, 1.0); book.rotation.y = -0.35; groupRoot.add(book);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.19, 0.008, 0.25), std(0xfaf7ef, { roughness: 0.9 }), [s * 0.095, 0.006, 0], { parent: book, rot: [0, 0, s * -0.06], uv: 0.75, cast: false });
  add(new THREE.PlaneGeometry(0.15, 0.11), std(0xffffff, { map: T.kidDrawing() }), [0.095, 0.0125, 0], { parent: book, rot: [-Math.PI / 2, 0, 0.06], uv: 0.75, cast: false });
  box(0.4, 0.004, 0.26, std(0x2c6fb0), [0, 0.001, 0], { parent: book, cast: false });

  // a sock that never made it to the laundry
  const sock = add(new THREE.CapsuleGeometry(0.025, 0.12, 6, 12), pbr('cotton_jersey', 0.3, 0.3, { color: 0xd9d9d9 }), [-1.05, 0.016, 0.85], { rot: [Math.PI / 2, 0, 0.7], temp: 20 });
  sock.scale.set(1, 1, 0.45);

  // ceiling pendant and a few glow-in-the-dark stars above the bed
  place('modern_ceiling_lamp_01', [0, ROOM.h - 1.173, 0.2], { collide: false, cast: false, temp: 26 });
  const starMat = new THREE.MeshStandardMaterial({ color: 0xe8f2cf, alphaMap: T.starSticker(), transparent: true, emissive: 0xb8ff8a, emissiveIntensity: 0.0, roughness: 0.8 });
  lights.starMat = starMat;
  const sr = T.rng(77);
  for (let i = 0; i < 18; i++) {
    const s = 0.05 + sr() * 0.04;
    add(new THREE.PlaneGeometry(s, s), starMat, [bed.x0 + 0.15 + sr() * 1.1, ROOM.h - 0.002, bed.z0 + 0.2 + sr() * 1.8], { rot: [Math.PI / 2, 0, sr() * 6], cast: false, receive: false });
  }

  // ----------------------------------------------------------------- light
  // late-afternoon sun through the window, a soft sky panel, and the room's own bounce
  const sun = new THREE.DirectionalLight(0xffe7c4, 7.0);
  sun.position.set(-0.7, 6.3, -7.6);
  sun.target.position.set(0.1, 0.3, 0.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -3.5, right: 3.5, top: 3.5, bottom: -3.5, near: 1, far: 14 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.015; sun.shadow.radius = 3;
  scene.add(sun, sun.target); lights.sun = sun;

  const skyPanel = new THREE.RectAreaLight(0xcfe2ff, 9.0, ww, wh);
  skyPanel.position.set(wcx, wcy, -HZ - 0.02);
  skyPanel.lookAt(wcx, wcy - 0.5, 0);
  scene.add(skyPanel); lights.skyPanel = skyPanel;

  const hemi = new THREE.HemisphereLight(0xeef4ff, 0x9a7a5c, 0.9);
  scene.add(hemi); lights.hemi = hemi;
  // light bouncing up off the sunlit floor
  const bounce = new THREE.PointLight(0xffe2c0, 1.6, 6, 1.2);
  bounce.position.set(-0.2, 0.35, 0.1);
  scene.add(bounce); lights.bounce = bounce;

  // desk lamp: a warm spot on the desk (switched on)
  const lb = new THREE.Box3().setFromObject(lamp);
  const lampPos = new THREE.Vector3((lb.min.x + lb.max.x) / 2 - 0.05, lb.max.y - 0.08, (lb.min.z + lb.max.z) / 2 + 0.05);
  const deskLamp = new THREE.SpotLight(0xffd9a0, 2.2, 2.5, 0.8, 0.6, 1.6);
  deskLamp.position.copy(lampPos);
  deskLamp.target.position.set(desk.x - 0.05, desk.h, desk.z);
  scene.add(deskLamp, deskLamp.target); lights.lamp = deskLamp;
  const bulb = add(new THREE.SphereGeometry(0.018, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffe2b0, emissiveIntensity: 2.0 }), lampPos.toArray(), { cast: false, temp: 75 });
  lights.lampBulb = bulb;

  // merge static procedural pieces that share a material: hundreds of draw calls become a few dozen
  const keep = new Set();
  for (const a of animated) { if (a.mesh) a.mesh.traverse(o => keep.add(o)); if (a.cars) a.cars.forEach(c => c.traverse(o => keep.add(o))); }
  keep.add(bulb); keep.add(nlMesh);
  const buckets = new Map();
  groupRoot.updateMatrixWorld(true);
  groupRoot.traverse(o => {
    if (!o.isMesh || keep.has(o) || Array.isArray(o.material) || o.userData.fromModel) return;
    const k = [o.material.uuid, o.userData.temp, o.userData.uv, o.userData.uvMap ? o.userData.uvMap.uuid : '', !!o.userData.glass, o.castShadow, o.receiveShadow].join('|');
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(o);
  });
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = list.map(o => { let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n); g.applyMatrix4(o.matrixWorld); return g; });
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
  const pmrem = new THREE.PMREMGenerator(renderer);
  renderer.shadowMap.needsUpdate = true;
  const env = pmrem.fromScene(scene, 0.02, 0.05, 30, { position: new THREE.Vector3(0, 1.0, 0.2) });
  scene.environment = env.texture;
  scene.environmentIntensity = 1.5;
  lights.env = env.texture;
  pmrem.dispose();

  // ------------------------------------------------------- viewpoints
  // yaw 0 looks at the window wall (-z); positive yaw turns left
  const presets = {
    door:    { pos: [0.95, 1.55], yaw: 0.55, pitch: 0.16 },
    rug:     { pos: [0.3, 1.55], yaw: 0.1, pitch: 0.1 },
    bed:     { pos: [-1.95, -0.7], yaw: -1.8, pitch: 0.04 },
    chest:   { pos: [1.15, -0.55], yaw: -0.85, pitch: 0.28 },
    flower:  { pos: [0.62, -1.0], yaw: 0.0, pitch: 0.42 },
    hamster: { pos: [1.25, 0.8], yaw: -2.1, pitch: 0.06 },
  };

  return { colliders, animated, lights, presets, groupRoot };

  // ---------------------------------------------------------------- helpers
  function socket(p, ry) {
    const g = new THREE.Group(); g.position.set(...p); g.rotation.y = ry; groupRoot.add(g);
    rbox(0.08, 0.08, 0.01, 0.006, std(0xf6f5f1, { roughness: 0.35 }), [0, 0, 0.005], { parent: g, cast: false });
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 10), std(0x222222), [s * 0.012, 0, 0.0105], { parent: g, rot: [Math.PI / 2, 0, 0], cast: false });
  }

  function door(xc) {
    const W = 0.82, H = 2.03, z = HZ - 0.02;
    const doorMat = std(0xf8f6f0, { roughness: 0.4 });
    const g = new THREE.Group(); g.position.set(xc, 0, z); groupRoot.add(g);
    rbox(W, H, 0.04, 0.004, doorMat, [0, H / 2, 0], { parent: g });
    // six-panel recesses
    for (const [y, h] of [[0.42, 0.62], [1.12, 0.52], [1.7, 0.42]]) for (const s of [-1, 1]) {
      box(0.27, h, 0.006, std(0xefece4, { roughness: 0.45 }), [s * 0.18, y, -0.022], { parent: g });
    }
    // architrave
    for (const s of [-1, 1]) rbox(0.07, H + 0.04, 0.02, 0.005, satin, [s * (W / 2 + 0.035), (H + 0.04) / 2, -0.01], { parent: g });
    rbox(W + 0.14, 0.07, 0.02, 0.005, satin, [0, H + 0.055, -0.01], { parent: g });
    // lever handle
    const steel = std(0xc9c9c9, { metalness: 1, roughness: 0.25 });
    rbox(0.04, 0.16, 0.008, 0.004, steel, [-W / 2 + 0.07, 1.02, -0.024], { parent: g });
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.11, 14), steel, [-W / 2 + 0.11, 1.05, -0.05], { parent: g, rot: [0, 0, Math.PI / 2] });
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 14), steel, [-W / 2 + 0.07, 1.05, -0.034], { parent: g, rot: [Math.PI / 2, 0, 0] });
    // light switch beside the door
    rbox(0.085, 0.085, 0.01, 0.006, std(0xf6f5f1, { roughness: 0.35 }), [W / 2 + 0.2, 1.05, -0.005], { parent: g });
    rbox(0.03, 0.05, 0.008, 0.004, std(0xffffff, { roughness: 0.3 }), [W / 2 + 0.2, 1.05, -0.012], { parent: g });
    collide(xc - W / 2 - 0.1, xc + W / 2 + 0.1, z - 0.06, HZ, 0, 3);
  }

  function trainSet(tr) {
    const beech = pbr('oak_veneer_01', 6, 0.15, { color: 0xf3dcb8, roughness: 0.7 });
    // grooved track as one ribbon: across-section [outer, groove, centre, groove, inner]
    const N = 160, prof = [[-0.02, 0.012], [-0.015, 0.012], [-0.015, 0.008], [-0.008, 0.008], [-0.008, 0.012], [0.008, 0.012], [0.008, 0.008], [0.015, 0.008], [0.015, 0.012], [0.02, 0.012]];
    const pos = [], uvs = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N * Math.PI * 2;
      const cx = tr.cx + Math.cos(u) * tr.rx, cz = tr.cz + Math.sin(u) * tr.rz;
      const tx = -Math.sin(u) * tr.rx, tz = Math.cos(u) * tr.rz, l = Math.hypot(tx, tz);
      const nx = tz / l, nz = -tx / l;
      const all = [[-0.02, 0.0], ...prof, [0.02, 0.0]];
      for (const [o, y] of all) { pos.push(cx + nx * o, y + 0.012, cz + nz * o); uvs.push(i / N * 10, (o + 0.02) / 0.04); }
    }
    const cols = 12;
    for (let i = 0; i < N; i++) for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = a + cols;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const tm = add(geo, beech, null, { cast: false });
    tm.material.side = THREE.DoubleSide;
    const cars = [];
    const paints = [0xb3261e, 0x1f5fa8, 0xe0a91b, 0x2f7d3b];
    const wheelMat = std(0x9e1b14, { roughness: 0.4 });
    paints.forEach((col, i) => {
      const car = new THREE.Group(); groupRoot.add(car);
      const body = std(col, { roughness: 0.45 });
      rbox(0.1, 0.035, 0.045, 0.006, beech, [0, 0.028, 0], { parent: car });
      rbox(0.095, 0.035, 0.042, 0.008, body, [0, 0.062, 0], { parent: car });
      if (i === 0) {
        add(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 18), body, [0.02, 0.07, 0], { parent: car, rot: [0, 0, Math.PI / 2] });
        add(new THREE.CylinderGeometry(0.008, 0.01, 0.03, 12), std(0x1b1b1b), [0.035, 0.1, 0], { parent: car });
        rbox(0.035, 0.05, 0.045, 0.006, body, [-0.03, 0.09, 0], { parent: car });
      }
      for (const [dx, dz] of [[-0.03, 0.026], [0.03, 0.026], [-0.03, -0.026], [0.03, -0.026]]) add(new THREE.CylinderGeometry(0.012, 0.012, 0.008, 16), wheelMat, [dx, 0.024, dz], { parent: car, rot: [Math.PI / 2, 0, 0] });
      car.traverse(o => { if (o.isMesh) o.castShadow = false; });
      cars.push(car);
    });
    animated.push({ kind: 'train', cars, track: tr });
  }

  function hamsterCage(p, ry) {
    const g = new THREE.Group(); g.position.set(...p); g.rotation.y = ry; groupRoot.add(g);
    const W = 0.6, D = 0.38, H = 0.32, baseH = 0.11;
    const plastic = new THREE.MeshPhysicalMaterial({ color: 0x4f8fbf, roughness: 0.35, clearcoat: 0.3 });
    rbox(W, baseH, D, 0.02, plastic, [0, baseH / 2, 0], { parent: g });
    box(W - 0.03, 0.03, D - 0.03, std(0xe8d3a5, { roughness: 1 }), [0, baseH - 0.02, 0], { parent: g, temp: 22 }); // bedding
    const wire = std(0xe8e8e8, { metalness: 0.9, roughness: 0.3 });
    const bars = new THREE.CylinderGeometry(0.0018, 0.0018, H, 4);
    for (let i = 0; i <= 30; i++) for (const s of [-1, 1]) add(bars, wire, [-W / 2 + 0.01 + i * (W - 0.02) / 30, baseH + H / 2, s * (D / 2 - 0.01)], { parent: g, cast: false });
    for (let i = 0; i <= 18; i++) for (const s of [-1, 1]) add(bars, wire, [s * (W / 2 - 0.01), baseH + H / 2, -D / 2 + 0.01 + i * (D - 0.02) / 18], { parent: g, cast: false });
    for (let i = 0; i <= 30; i++) add(new THREE.CylinderGeometry(0.0018, 0.0018, D - 0.02, 4), wire, [-W / 2 + 0.01 + i * (W - 0.02) / 30, baseH + H, 0], { parent: g, rot: [Math.PI / 2, 0, 0], cast: false });
    for (const y of [baseH + 0.005, baseH + H * 0.5]) for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.0022, 0.0022, W - 0.02, 4), wire, [0, y, s * (D / 2 - 0.01)], { parent: g, rot: [0, 0, Math.PI / 2], cast: false });
      add(new THREE.CylinderGeometry(0.0022, 0.0022, D - 0.02, 4), wire, [s * (W / 2 - 0.01), y, 0], { parent: g, rot: [Math.PI / 2, 0, 0], cast: false });
    }
    const wheel = add(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0xf28c28, roughness: 0.4, side: THREE.DoubleSide }), [0.15, baseH + 0.1, -0.05], { parent: g, rot: [Math.PI / 2, 0, 0] });
    animated.push({ kind: 'wheel', mesh: wheel });
    rbox(0.12, 0.08, 0.1, 0.02, std(0xf6d365, { roughness: 0.5 }), [-0.18, baseH + 0.03, 0.09], { parent: g }); // little house
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 16), new THREE.MeshPhysicalMaterial({ color: 0xddeeff, transparent: true, opacity: 0.45, roughness: 0.05 }), [0.05, baseH + 0.18, D / 2 + 0.02], { parent: g, glass: true, temp: 19 });
    // the hamster, curled up in the bedding
    const fur = std(0xcf9a62, { roughness: 1 });
    add(pillowGeometry(0.11, 0.06, 0.075, 0.6), fur, [-0.03, baseH + 0.02, -0.08], { parent: g, temp: 37 });
    add(new THREE.SphereGeometry(0.03, 20, 14), fur, [0.02, baseH + 0.035, -0.08], { parent: g, temp: 37 });
    add(new THREE.SphereGeometry(0.035, 20, 14), std(0xf2e2c8, { roughness: 1 }), [-0.02, baseH + 0.01, -0.075], { parent: g, temp: 37 }).scale.set(1.2, 0.6, 0.9);
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(0.009, 10, 8), std(0xe8b4b4), [0.012, baseH + 0.065, -0.08 + s * 0.018], { parent: g, temp: 35 });
      add(new THREE.SphereGeometry(0.004, 8, 6), std(0x0a0a0a, { roughness: 0.1 }), [0.044, baseH + 0.045, -0.08 + s * 0.012], { parent: g, temp: 36 });
    }
    collide(p[0] - 0.36, p[0] + 0.36, p[2] - 0.28, p[2] + 0.28, 0, 0.5);
  }

  function sunflowers(base) {
    const g = new THREE.Group(); g.position.set(...base); groupRoot.add(g);
    const stemMat = std(0x557a35, { roughness: 0.7 });
    const leafMat = std(0xffffff, { map: T.leaf(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.65 });
    const petalMap = T.petal(false), petalUV = T.petal(true);
    const petalMat = std(0xffffff, { map: petalMap, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
    const seedMat = std(0xffffff, { map: T.seedHead(), roughness: 0.85 });
    const backMat = std(0x4f6e2c, { roughness: 0.8 });
    const flowers = [[-0.04, 0.58, 0.02, 0.105, 0.35], [0.07, 0.48, 0.05, 0.09, -0.4], [-0.07, 0.4, 0.07, 0.07, 0.9]];
    const toyEye = new THREE.Vector3(0.6, 0.1, 0.9);
    for (const [x, y, z, r, tw] of flowers) {
      const top = new THREE.Vector3(x, y, z);
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x * 0.2, 0, z * 0.2), new THREE.Vector3(x * 0.6 + 0.01, y * 0.5, z * 0.5), top]);
      add(new THREE.TubeGeometry(curve, 24, 0.006, 8), stemMat, null, { parent: g, uv: 0.05 });
      for (let k = 0; k < 2; k++) {
        const lf = add(new THREE.PlaneGeometry(0.11, 0.16, 4, 4), leafMat, curve.getPoint(0.35 + k * 0.25).toArray(), { parent: g, uv: 0.06 });
        bendLeaf(lf.geometry);
        lf.rotation.set(-0.6, tw + k * 2.4, 0.3);
      }
      const head = new THREE.Group(); head.position.copy(top); g.add(head);
      const world = top.clone().add(g.position);
      head.lookAt(new THREE.Vector3().subVectors(toyEye, world).normalize().add(world));
      head.lookAt(toyEye);
      head.rotateX(-0.15);
      // seed disc, slightly domed
      const disc = add(new THREE.SphereGeometry(r * 0.42, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.32), seedMat, [0, 0, -r * 0.3], { parent: head, rot: [Math.PI / 2, 0, 0], uv: 0.02 });
      disc.scale.set(1, 0.6, 1);
      add(new THREE.CylinderGeometry(r * 0.45, r * 0.3, 0.03, 28), backMat, [0, 0, -0.02], { parent: head, rot: [Math.PI / 2, 0, 0], uv: 0.05 });
      // two rings of curved petals
      for (let ring = 0; ring < 2; ring++) {
        const n = 21;
        for (let i = 0; i < n; i++) {
          const a = (i + ring * 0.5) / n * Math.PI * 2;
          const pg = new THREE.PlaneGeometry(r * 0.32, r * 0.75, 1, 6);
          const pp = pg.attributes.position;
          for (let v = 0; v < pp.count; v++) { const yy = pp.getY(v) / (r * 0.75) + 0.5; pp.setZ(v, Math.sin(yy * 2.4) * r * 0.12 - yy * yy * r * 0.15 * (ring ? 1 : 0.5)); }
          pg.translate(0, r * 0.75 / 2 + r * 0.36, 0);
          pg.computeVertexNormals();
          const pm = add(pg, petalMat, [0, 0, -0.005 - ring * 0.006], { parent: head, uvMap: petalUV, uv: 1, cast: ring === 0 });
          pm.rotation.z = a;
        }
      }
    }
  }
}

function bendLeaf(geo) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -x * x * 8 + y * y * 2); }
  geo.translate(0, 0.08, 0);
  geo.computeVertexNormals();
}

// A wrinkled duvet: flat on top, rolling over the long side (+x) and the foot (+z), hanging down.
function duvetGeometry(w, len, hangSide, hangFoot, puff, seed) {
  const segX = 70, segZ = 90, r = 0.06;
  const geo = new THREE.PlaneGeometry(1, 1, segX, segZ);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  const rnd = T.rng(seed), ph = Array.from({ length: 8 }, () => rnd() * 6.28);
  const bend = (s, L) => {
    if (s <= L) return [s, 0];
    const t = s - L, arc = r * Math.PI / 2;
    if (t < arc) { const a = t / r; return [L + r * Math.sin(a), r * (1 - Math.cos(a))]; }
    return [L + r, r + (t - arc)];
  };
  const totX = w + hangSide, totZ = len + hangFoot;
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i), v = 1 - uv.getY(i);
    const sx = u * totX, sz = v * totZ;
    const [ax, dx] = bend(sx, w), [az, dz] = bend(sz, len);
    const drop = Math.max(dx, dz) + Math.min(dx, dz) * 0.3;
    const onTop = sx < w && sz < len;
    // soft quilted puff on top, gentle folds where it hangs
    const wr = Math.sin(sx * 9 + ph[0]) * Math.sin(sz * 7 + ph[1]) * 0.012 + Math.sin(sx * 23 + sz * 5 + ph[2]) * 0.004 + Math.sin(sz * 31 + ph[3]) * 0.003;
    const edgeFall = onTop ? Math.min(1, Math.min(w - sx, len - sz) / 0.12) : 0;
    const y = (onTop ? puff * edgeFall : 0) + wr * (onTop ? 1 : 0.4) - drop;
    let fx = 0, fz = 0;
    if (dx > 0.05) fz += Math.sin(sz * 26 + ph[4]) * 0.018 * Math.min(1, dx * 3);   // vertical folds on the side drop
    if (dz > 0.05) fx += Math.sin(sx * 26 + ph[5]) * 0.018 * Math.min(1, dz * 3);
    p.setXYZ(i, ax + (dx > 0 ? 0.004 : 0) + (dz > 0.05 ? fx * 0.3 : 0), y, az + fz * 0.3);
    if (dx > 0.05) p.setX(i, p.getX(i) + Math.abs(fz) * 0.4);
    if (dz > 0.05) p.setZ(i, p.getZ(i) + Math.abs(fx) * 0.4);
    uv.setXY(i, sx, sz);
  }
  geo.computeVertexNormals();
  return geo;
}

// A pillow-ish superellipsoid: flat edges, plump middle.
function pillowGeometry(w, h, d, e = 0.35) {
  const geo = new THREE.SphereGeometry(1, 48, 32);
  const p = geo.attributes.position;
  const f = v => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const sx = f(x), sz = f(z);
    const edge = Math.max(Math.abs(sx), Math.abs(sz));
    p.setXYZ(i, sx * w / 2, y * h / 2 * (1 - 0.55 * edge * edge), sz * d / 2);
  }
  geo.computeVertexNormals();
  return geo;
}

// Per-frame motion: the train loops, the ball wobbles, the hamster wheel turns.
export function animateRoom(animated, t) {
  for (const a of animated) {
    if (a.kind === 'train') {
      a.cars.forEach((car, i) => {
        const u = t * 0.3 - i * 0.24;
        const x = a.track.cx + Math.cos(u) * a.track.rx, z = a.track.cz + Math.sin(u) * a.track.rz;
        const dx = -Math.sin(u) * a.track.rx, dz = Math.cos(u) * a.track.rz;
        car.position.set(x, 0.008, z);
        car.rotation.y = Math.atan2(-dz, dx);
      });
    } else if (a.kind === 'ball') {
      const k = Math.sin(t * 0.7) * 0.05;
      a.mesh.position.x = a.base.x + k;
      a.mesh.rotation.z = -k / 0.085;
    } else if (a.kind === 'wheel') {
      a.mesh.rotation.y = t * 2.5;
    }
  }
}
