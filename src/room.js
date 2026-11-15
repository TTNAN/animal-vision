// A child's bedroom, built entirely from code.
// Scale is real: 1 unit = 1 metre. The camera lives ~10 cm off the floor,
// so the bed is a cliff, the desk is a roof and the ball is a boulder.
//
// Every mesh carries two extra numbers used by the animal passes:
//   userData.temp : surface temperature in °C   (snake's infrared pits)
//   userData.uv   : ultraviolet reflectance 0-1  (bee's UV receptor)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import * as T from './textures.js';

export const ROOM = { w: 5.0, d: 4.4, h: 2.7 };
const HX = ROOM.w / 2, HZ = ROOM.d / 2;

export function buildRoom(scene) {
  RectAreaLightUniformsLib.init();
  const colliders = [];
  const animated = [];
  const lights = {};
  const groupRoot = new THREE.Group();
  scene.add(groupRoot);

  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...o });

  function add(geo, mat, pos, opt = {}) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (opt.rot) m.rotation.set(opt.rot[0], opt.rot[1], opt.rot[2]);
    m.castShadow = opt.cast !== false;
    m.receiveShadow = opt.receive !== false;
    m.userData.temp = opt.temp ?? 20;
    m.userData.uv = opt.uv ?? 0.08;
    if (opt.uvMap) m.userData.uvMap = opt.uvMap;
    if (opt.uvEmit) m.userData.uvEmit = true;
    (opt.parent || groupRoot).add(m);
    return m;
  }
  const box = (w, h, d, mat, pos, opt) => add(new THREE.BoxGeometry(w, h, d), mat, pos, opt);
  const rbox = (w, h, d, r, mat, pos, opt) => add(new RoundedBoxGeometry(w, h, d, 3, r), mat, pos, opt);
  const collide = (x0, x1, z0, z1, y0 = 0, y1 = 3) => colliders.push({ x0, x1, z0, z1, y0, y1 });

  // ---------------------------------------------------------------- shell
  const floorTex = T.woodFloor();
  box(ROOM.w, 0.02, ROOM.d, std(0xffffff, { map: floorTex, roughness: 0.55 }), [0, -0.01, 0], { temp: 19.5 });
  const ceil = box(ROOM.w, 0.02, ROOM.d, std(0xf7f3ea), [0, ROOM.h + 0.01, 0], { temp: 22 });
  ceil.castShadow = false;

  const paper = T.cloudWallpaper();
  const wallMat = std(0xffffff, { map: paper, roughness: 0.9 });
  const wt = 0.12;
  // back wall with a window opening: x -0.95..0.55, y 0.9..2.1
  const win = { x0: -0.95, x1: 0.55, y0: 0.9, y1: 2.1 };
  const bz = -HZ - wt / 2;
  const wallPiece = (x0, x1, y0, y1, z) => box(x1 - x0, y1 - y0, wt, wallMat, [(x0 + x1) / 2, (y0 + y1) / 2, z]);
  wallPiece(-HX, win.x0, 0, ROOM.h, bz);
  wallPiece(win.x1, HX, 0, ROOM.h, bz);
  wallPiece(win.x0, win.x1, 0, win.y0, bz);
  wallPiece(win.x0, win.x1, win.y1, ROOM.h, bz);
  box(ROOM.w, ROOM.h, wt, wallMat, [0, ROOM.h / 2, HZ + wt / 2]);               // front
  box(wt, ROOM.h, ROOM.d, wallMat, [-HX - wt / 2, ROOM.h / 2, 0]);              // left
  box(wt, ROOM.h, ROOM.d, wallMat, [HX + wt / 2, ROOM.h / 2, 0]);               // right

  // baseboards + picture rail
  const white = std(0xfbf8f2, { roughness: 0.5 });
  const trim = (len, along, x, z) => {
    box(along === 'x' ? len : 0.02, 0.1, along === 'x' ? 0.02 : len, white, [x, 0.05, z]);
    box(along === 'x' ? len : 0.025, 0.04, along === 'x' ? 0.025 : len, white, [x, 2.3, z]);
  };
  trim(ROOM.w, 'x', 0, -HZ + 0.01); trim(ROOM.w, 'x', 0, HZ - 0.01);
  trim(ROOM.d, 'z', -HX + 0.01, 0); trim(ROOM.d, 'z', HX - 0.01, 0);

  // window: frame, sill, glass, the outside world
  const frameMat = std(0xffffff, { roughness: 0.4 });
  const wcx = (win.x0 + win.x1) / 2, ww = win.x1 - win.x0, wh = win.y1 - win.y0, wcy = (win.y0 + win.y1) / 2;
  box(ww + 0.12, 0.06, 0.06, frameMat, [wcx, win.y0, -HZ + 0.02]);
  box(ww + 0.12, 0.06, 0.06, frameMat, [wcx, win.y1, -HZ + 0.02]);
  box(0.06, wh, 0.06, frameMat, [win.x0, wcy, -HZ + 0.02]);
  box(0.06, wh, 0.06, frameMat, [win.x1, wcy, -HZ + 0.02]);
  box(0.035, wh, 0.04, frameMat, [wcx, wcy, -HZ - 0.03]);
  box(ww, 0.035, 0.04, frameMat, [wcx, wcy + 0.15, -HZ - 0.03]);
  box(ww + 0.3, 0.04, 0.2, frameMat, [wcx, win.y0 - 0.02, -HZ + 0.08], { temp: 18 }); // sill
  // Glass: see-through for eyes, but opaque and cool to infrared.
  add(new THREE.PlaneGeometry(ww, wh), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0 }),
    [wcx, wcy, -HZ - 0.04], { cast: false, receive: false, temp: 13, uv: 0.5 }).userData.glass = true;
  const outsideMat = new THREE.MeshBasicMaterial({ map: T.outside() });
  add(new THREE.PlaneGeometry(4.2, 3.1), outsideMat, [wcx, 1.5, -HZ - 1.2], { cast: false, receive: false, temp: 9, uv: 0.85, uvEmit: true }).userData.sky = true;

  // curtains: wavy striped fabric either side of the window
  const curtainTex = T.stripes('#f6e7c8', '#f2c46d', 12);
  const curtainGeo = new THREE.PlaneGeometry(0.45, 2.0, 40, 1);
  const pa = curtainGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.sin(pa.getX(i) * 42) * 0.035);
  curtainGeo.computeVertexNormals();
  const curtainMat = std(0xffffff, { map: curtainTex, side: THREE.DoubleSide, roughness: 0.95 });
  add(curtainGeo, curtainMat, [win.x0 - 0.18, 1.3, -HZ + 0.1]);
  add(curtainGeo, curtainMat, [win.x1 + 0.18, 1.3, -HZ + 0.1]);
  add(new THREE.CylinderGeometry(0.015, 0.015, ww + 1.0, 12), std(0x8a5a2b), [wcx, 2.32, -HZ + 0.1], { rot: [0, 0, Math.PI / 2] });

  // radiator under the window (warm in infrared)
  const radMat = std(0xf2f2ee, { roughness: 0.35, metalness: 0.2 });
  for (let i = 0; i < 11; i++) rbox(0.07, 0.55, 0.09, 0.02, radMat, [win.x0 + 0.2 + i * 0.1, 0.38, -HZ + 0.08], { temp: 52 });
  box(1.1, 0.03, 0.04, radMat, [wcx, 0.14, -HZ + 0.08], { temp: 52 });
  collide(win.x0 + 0.1, win.x1 - 0.1, -HZ, -HZ + 0.15, 0.1, 0.7);

  // ------------------------------------------------------------------ bed
  const wood = std(0xb8834f, { roughness: 0.6 });
  const darkWood = std(0x8a5a33, { roughness: 0.6 });
  const bed = { x0: -HX + 0.05, x1: -HX + 1.05, z0: -HZ + 0.08, z1: -HZ + 2.08 };
  const bcx = (bed.x0 + bed.x1) / 2, bcz = (bed.z0 + bed.z1) / 2;
  for (const [x, z] of [[bed.x0 + 0.04, bed.z0 + 0.04], [bed.x1 - 0.04, bed.z0 + 0.04], [bed.x0 + 0.04, bed.z1 - 0.04], [bed.x1 - 0.04, bed.z1 - 0.04]]) {
    rbox(0.07, 0.34, 0.07, 0.015, darkWood, [x, 0.17, z]);
    collide(x - 0.05, x + 0.05, z - 0.05, z + 0.05);
  }
  box(1.0, 0.1, 2.0, wood, [bcx, 0.37, bcz]);
  rbox(0.96, 0.18, 1.94, 0.05, std(0xf4f1ea), [bcx, 0.51, bcz]);
  // quilt draped over the side facing the room
  const quiltMat = std(0xffffff, { map: T.quilt(), roughness: 0.95 });
  rbox(1.04, 0.06, 1.45, 0.03, quiltMat, [bcx + 0.01, 0.62, bcz + 0.25]);
  rbox(0.03, 0.36, 1.45, 0.012, quiltMat, [bed.x1 + 0.015, 0.46, bcz + 0.25]);
  rbox(0.75, 0.13, 0.4, 0.06, std(0xffffff), [bcx, 0.68, bed.z0 + 0.3], { uv: 0.55 }); // pillow (optical brighteners)
  // headboard + footboard
  rbox(1.06, 1.05, 0.07, 0.03, wood, [bcx, 0.53, bed.z0 - 0.02]);
  rbox(1.06, 0.62, 0.06, 0.03, wood, [bcx, 0.31, bed.z1 + 0.02]);
  collide(bed.x0, bed.x1 + 0.04, bed.z0 - 0.06, bed.z1 + 0.06, 0.3, 1.2);

  // teddy bear on the bed
  teddy([bcx + 0.15, 0.65, bed.z0 + 0.75], 0.8);

  // under the bed: storage box, a lost sock, dust bunnies, a forgotten ball
  rbox(0.5, 0.2, 0.38, 0.02, std(0x7fb3d5, { roughness: 0.4 }), [bcx - 0.1, 0.1, bcz - 0.45]);
  add(new THREE.CapsuleGeometry(0.03, 0.12, 6, 12), std(0xe74c3c), [bcx + 0.2, 0.03, bcz + 0.1], { rot: [Math.PI / 2, 0, 0.7] });
  const fluff = std(0x9a9a9a, { roughness: 1 });
  for (const [x, z, s] of [[bcx - 0.3, bcz + 0.3, 0.03], [bcx + 0.25, bcz - 0.1, 0.022], [bcx, bcz + 0.65, 0.026]]) add(new THREE.IcosahedronGeometry(s, 1), fluff, [x, s * 0.7, z]);
  add(new THREE.SphereGeometry(0.06, 24, 16), std(0x3c8de0, { roughness: 0.35 }), [bcx + 0.3, 0.06, bcz + 0.5]);

  // nightstand + lamp + alarm clock
  const ns = { x: -HX + 0.27, z: bed.z1 + 0.3 };
  rbox(0.42, 0.55, 0.42, 0.02, std(0xf2efe6), [ns.x, 0.275, ns.z]);
  box(0.3, 0.02, 0.02, std(0x8a5a33), [ns.x + 0.215, 0.38, ns.z], { rot: [0, Math.PI / 2, 0] });
  collide(ns.x - 0.22, ns.x + 0.22, ns.z - 0.22, ns.z + 0.22, 0, 0.6);
  add(new THREE.CylinderGeometry(0.07, 0.09, 0.05, 24), std(0x2f6f9f), [ns.x, 0.575, ns.z - 0.05]);
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 12), std(0xd4af37, { metalness: 0.6, roughness: 0.3 }), [ns.x, 0.72, ns.z - 0.05]);
  const shade = add(new THREE.CylinderGeometry(0.09, 0.14, 0.16, 32, 1, true), std(0xfff3d6, { side: THREE.DoubleSide, emissive: 0xffc77a, emissiveIntensity: 0.6 }), [ns.x, 0.86, ns.z - 0.05], { temp: 34 });
  const bulb = add(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd9a0, emissiveIntensity: 3 }), [ns.x, 0.82, ns.z - 0.05], { temp: 75, cast: false });
  lights.lampShade = shade; lights.lampBulb = bulb;
  const lamp = new THREE.PointLight(0xffc98a, 1.6, 5, 2);
  lamp.position.set(ns.x, 0.84, ns.z - 0.05);
  scene.add(lamp); lights.lamp = lamp;
  rbox(0.12, 0.09, 0.05, 0.015, std(0xe74c3c), [ns.x + 0.08, 0.6, ns.z + 0.1], { rot: [0, -0.4, 0] });
  // night-light plugged in by the floor
  const nl = add(new THREE.SphereGeometry(0.035, 16, 12, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xbfe3ff, emissive: 0x9fd2ff, emissiveIntensity: 0.4 }), [-HX + 0.005, 0.32, ns.z + 0.5], { rot: [0, Math.PI / 2, 0], temp: 28, cast: false });
  lights.nightLightMesh = nl;
  const nightLight = new THREE.PointLight(0x9fd2ff, 0, 2.2, 2);
  nightLight.position.set(-HX + 0.08, 0.32, ns.z + 0.5);
  scene.add(nightLight); lights.nightLight = nightLight;

  // wardrobe in the front-left corner
  const wardMat = std(0xf3e9d8, { roughness: 0.6 });
  rbox(0.6, 2.0, 1.1, 0.02, wardMat, [-HX + 0.31, 1.0, HZ - 0.6]);
  box(0.01, 1.85, 0.005, std(0xc8b89e), [-HX + 0.615, 1.02, HZ - 0.6], { rot: [0, Math.PI / 2, 0] });
  for (const dz of [-0.06, 0.06]) add(new THREE.SphereGeometry(0.02, 12, 8), std(0xd4af37, { metalness: 0.7, roughness: 0.3 }), [-HX + 0.625, 1.0, HZ - 0.6 + dz]);
  collide(-HX, -HX + 0.62, HZ - 1.16, HZ - 0.04);

  // ------------------------------------------------------- back-right corner
  // toy chest under the eye chart, lid propped open
  const chest = { x: 1.05, z: -HZ + 0.26 };
  const chestMat = std(0xd9534f, { roughness: 0.6 });
  rbox(0.8, 0.45, 0.42, 0.03, chestMat, [chest.x, 0.225, chest.z]);
  const lidPivot = new THREE.Group(); lidPivot.position.set(chest.x, 0.45, chest.z - 0.21); lidPivot.rotation.x = -1.1; groupRoot.add(lidPivot);
  rbox(0.82, 0.04, 0.44, 0.02, std(0xf2b84b), [0, 0.02, 0.22], { parent: lidPivot });
  for (let i = 0; i < 3; i++) box(0.82, 0.02, 0.01, std(0xf2b84b), [chest.x, 0.12 + i * 0.12, chest.z + 0.215]);
  collide(chest.x - 0.42, chest.x + 0.42, chest.z - 0.22, chest.z + 0.24, 0, 0.5);
  // toys peeking out
  add(new THREE.ConeGeometry(0.06, 0.18, 20), std(0x3c8de0), [chest.x - 0.2, 0.5, chest.z], { rot: [0, 0, 0.3] });
  add(new THREE.TorusGeometry(0.07, 0.02, 10, 24), std(0x55a868), [chest.x + 0.15, 0.48, chest.z + 0.05], { rot: [1.1, 0.3, 0] });
  add(new THREE.SphereGeometry(0.07, 20, 14), std(0xf2b84b), [chest.x + 0.02, 0.47, chest.z - 0.05]);

  // eye chart on the back wall
  add(new THREE.PlaneGeometry(0.46, 0.69), std(0xffffff, { map: T.eyeChart(), roughness: 0.8 }), [chest.x, 1.2, -HZ + 0.013], { uv: 0.6 });
  box(0.5, 0.73, 0.012, std(0x5b3a1e), [chest.x, 1.2, -HZ + 0.0], { cast: false });

  // bookshelf on the right wall
  const shelf = { x: HX - 0.18, z0: -HZ + 0.2, z1: -HZ + 1.2 };
  const shelfMat = std(0xe8d4b4, { roughness: 0.6 });
  const scz = (shelf.z0 + shelf.z1) / 2, slen = shelf.z1 - shelf.z0;
  box(0.34, 1.85, 0.03, shelfMat, [shelf.x, 0.925, shelf.z0]);
  box(0.34, 1.85, 0.03, shelfMat, [shelf.x, 0.925, shelf.z1]);
  box(0.02, 1.85, slen, shelfMat, [HX - 0.01, 0.925, scz]);
  const levels = [0.04, 0.42, 0.8, 1.18, 1.56, 1.84];
  for (const y of levels) box(0.34, 0.03, slen, shelfMat, [shelf.x, y, scz]);
  collide(shelf.x - 0.18, HX, shelf.z0 - 0.02, shelf.z1 + 0.02);
  const spineCols = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22', '#16a085', '#d35400', '#2c3e50', '#e84393', '#6c5ce7', '#00b894'];
  const spineMats = spineCols.map((c, i) => std(0xffffff, { map: T.bookSpine(i + 1, c), roughness: 0.7 }));
  const pageMat = std(0xfdf8ea);
  const r = T.rng(42);
  for (let li = 0; li < 4; li++) {
    let z = shelf.z0 + 0.03;
    const y0 = levels[li] + 0.015;
    while (z < shelf.z1 - 0.06) {
      const th = 0.025 + r() * 0.035, hh = 0.2 + r() * 0.13, dd = 0.2 + r() * 0.06;
      const mi = Math.floor(r() * spineMats.length);
      // only the -x face (the spine, facing the room) gets the texture
      const mats = [pageMat, spineMats[mi], pageMat, pageMat, pageMat, pageMat];
      const b = add(new THREE.BoxGeometry(dd, hh, th), mats, [shelf.x - 0.17 + dd / 2 + 0.005, y0 + hh / 2, z + th / 2], { uv: 0.35 });
      if (r() < 0.08 && z < shelf.z1 - 0.2) { b.rotation.x = 0.2; }
      z += th + 0.002;
      if (r() < 0.06) z += 0.05;
    }
  }
  // a globe and a toy robot on the top shelves
  add(new THREE.SphereGeometry(0.1, 32, 20), std(0x3d8fd1, { roughness: 0.4 }), [shelf.x - 0.02, 1.32, scz - 0.25]);
  robot([shelf.x - 0.03, 1.595, scz + 0.2], 0.55);

  // desk + chair + things on the desk
  const desk = { x0: HX - 0.65, x1: HX - 0.02, z0: -HZ + 1.55, z1: -HZ + 2.85, h: 0.72 };
  const dcx = (desk.x0 + desk.x1) / 2, dcz = (desk.z0 + desk.z1) / 2;
  box(desk.x1 - desk.x0, 0.035, desk.z1 - desk.z0, std(0xd8b48a, { roughness: 0.5 }), [dcx, desk.h, dcz]);
  for (const [x, z] of [[desk.x0 + 0.04, desk.z0 + 0.04], [desk.x0 + 0.04, desk.z1 - 0.04], [desk.x1 - 0.04, desk.z0 + 0.04], [desk.x1 - 0.04, desk.z1 - 0.04]]) {
    box(0.04, desk.h, 0.04, std(0xffffff), [x, desk.h / 2, z]);
    collide(x - 0.03, x + 0.03, z - 0.03, z + 0.03);
  }
  collide(desk.x0, desk.x1, desk.z0, desk.z1, 0.68, 1.0);
  // chair
  const ch = { x: desk.x0 - 0.12, z: dcz + 0.1 };
  const chairMat = std(0x3c8de0, { roughness: 0.5 });
  rbox(0.4, 0.04, 0.4, 0.015, chairMat, [ch.x, 0.44, ch.z]);
  rbox(0.04, 0.42, 0.4, 0.015, chairMat, [ch.x - 0.19, 0.68, ch.z]);
  for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
    box(0.03, 0.44, 0.03, std(0xdedede, { metalness: 0.5, roughness: 0.3 }), [ch.x + dx, 0.22, ch.z + dz]);
    collide(ch.x + dx - 0.025, ch.x + dx + 0.025, ch.z + dz - 0.025, ch.z + dz + 0.025);
  }
  collide(ch.x - 0.2, ch.x + 0.2, ch.z - 0.2, ch.z + 0.2, 0.4, 0.9);
  // desk lamp
  add(new THREE.CylinderGeometry(0.07, 0.08, 0.02, 20), std(0x2c3e50), [dcx + 0.15, desk.h + 0.03, desk.z0 + 0.15]);
  add(new THREE.CylinderGeometry(0.01, 0.01, 0.35, 8), std(0x2c3e50), [dcx + 0.15, desk.h + 0.2, desk.z0 + 0.15], { rot: [0, 0, 0.25] });
  add(new THREE.ConeGeometry(0.07, 0.1, 20, 1, true), std(0x2c3e50, { side: THREE.DoubleSide }), [dcx + 0.08, desk.h + 0.37, desk.z0 + 0.15], { rot: [0, 0, 0.9] });
  // mug of hot cocoa: one of the warmest things in the room
  add(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 24), std(0xf6f3ee, { roughness: 0.3 }), [desk.x0 + 0.12, desk.h + 0.07, dcz - 0.05], { temp: 58 });
  add(new THREE.CylinderGeometry(0.036, 0.036, 0.005, 24), std(0x5a3418), [desk.x0 + 0.12, desk.h + 0.115, dcz - 0.05], { temp: 62 });
  add(new THREE.TorusGeometry(0.025, 0.007, 8, 16), std(0xf6f3ee), [desk.x0 + 0.165, desk.h + 0.07, dcz - 0.05], { temp: 45 });
  // drawing paper + crayon cup
  box(0.3, 0.003, 0.22, std(0xffffff, { map: T.kidDrawing() }), [dcx - 0.02, desk.h + 0.02, dcz + 0.3], { rot: [0, 0.2, 0], uv: 0.6 });
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 16), std(0xf1c40f), [dcx + 0.15, desk.h + 0.065, dcz + 0.5]);
  ['#c0392b', '#2e86c1', '#27ae60', '#8e44ad'].forEach((c, i) => add(new THREE.CylinderGeometry(0.006, 0.006, 0.11, 8), std(c), [dcx + 0.14 + (i % 2) * 0.02, desk.h + 0.12, dcz + 0.49 + (i > 1 ? 0.02 : 0)], { rot: [0.1 * (i - 1.5), 0, 0.1 * (i - 1.5)] }));

  // hamster cage on the floor beside the desk: a 37 °C surprise for the snake
  hamsterCage([desk.x0 - 0.15, 0, desk.z1 + 0.45]);

  // posters + clock on the right wall
  add(new THREE.PlaneGeometry(0.42, 0.56), std(0xffffff, { map: T.spacePoster() }), [HX - 0.005, 1.55, dcz + 0.35], { rot: [0, -Math.PI / 2, 0] });
  add(new THREE.CircleGeometry(0.16, 40), std(0xffffff, { map: T.wallClock() }), [HX - 0.006, 1.9, dcz - 0.35], { rot: [0, -Math.PI / 2, 0] });
  add(new THREE.TorusGeometry(0.165, 0.015, 10, 40), std(0xe74c3c), [HX - 0.01, 1.9, dcz - 0.35], { rot: [0, -Math.PI / 2, 0] });
  // kid's drawing on the left wall above the nightstand
  add(new THREE.PlaneGeometry(0.48, 0.36), std(0xffffff, { map: T.kidDrawing() }), [-HX + 0.005, 1.25, ns.z + 0.05], { rot: [0, Math.PI / 2, 0], uv: 0.6 });

  // door on the front wall
  const doorMat = std(0xfaf6ee, { roughness: 0.5 });
  rbox(0.86, 2.02, 0.05, 0.01, doorMat, [1.15, 1.01, HZ - 0.02]);
  for (const [y, h] of [[0.55, 0.7], [1.5, 0.75]]) box(0.66, h, 0.012, std(0xf0eadc), [1.15, y, HZ - 0.05]);
  add(new THREE.SphereGeometry(0.03, 16, 10), std(0xd4af37, { metalness: 0.7, roughness: 0.25 }), [0.82, 1.0, HZ - 0.08]);

  // ------------------------------------------------------------ the floor
  // round rug with the famous red ball
  const rugMesh = add(new THREE.CircleGeometry(1.05, 72), std(0xffffff, { map: T.rug(), roughness: 1 }), [-0.1, 0.004, 0.25], { rot: [-Math.PI / 2, 0, 0] });
  rugMesh.castShadow = false;
  const ball = add(new THREE.SphereGeometry(0.09, 40, 28), std(0xd62b20, { roughness: 0.35 }), [0.3, 0.094, 0.45]);
  // white stripe round the ball so you can see it roll
  add(new THREE.TorusGeometry(0.0905, 0.008, 8, 48), std(0xffffff, { roughness: 0.35 }), [0, 0, 0], { parent: ball });
  animated.push({ kind: 'ball', mesh: ball, base: ball.position.clone() });

  // alphabet blocks: a tower and some loose ones; red next to green on purpose
  const letters = [['A', '#d62b20', '#fff'], ['B', '#2e86c1', '#fff'], ['C', '#2f9e44', '#fff'], ['D', '#f1c40f', '#333'], ['E', '#d62b20', '#fff'], ['F', '#2f9e44', '#fff']];
  const blockMats = letters.map(([l, bg, fg]) => std(0xffffff, { map: T.letterBlock(l, bg, fg), roughness: 0.6 }));
  const B = 0.1;
  const tower = [[-0.55, 0.05, 0.05, 0.1], [-0.55, 0.15, 0.05, -0.15], [-0.55, 0.25, 0.05, 0.3], [-0.42, 0.05, 0.12, 0.6], [-0.66, 0.05, 0.2, -0.4], [-0.3, 0.05, -0.05, 0.25]];
  tower.forEach(([x, y, z, ry], i) => rbox(B, B, B, 0.008, blockMats[i % blockMats.length], [x, y, z], { rot: [0, ry, 0] }));
  collide(-0.72, -0.24, -0.12, 0.28, 0, 0.35);

  // toy train looping on an oval track
  const track = { cx: -0.05, cz: -1.15, rx: 0.62, rz: 0.36 };
  const trackGeo = new THREE.TorusGeometry(1, 0.012, 6, 120);
  trackGeo.scale(track.rx, track.rz, 1);
  for (const k of [-0.035, 0.035]) {
    const g2 = new THREE.TorusGeometry(1, 0.006, 6, 120); g2.scale(track.rx + k, track.rz + k, 1);
    add(g2, std(0x9aa4ad, { metalness: 0.6, roughness: 0.3 }), [track.cx, 0.018, track.cz], { rot: [-Math.PI / 2, 0, 0], cast: false });
  }
  add(trackGeo, std(0x8a5a33), [track.cx, 0.008, track.cz], { rot: [-Math.PI / 2, 0, 0], cast: false });
  const train = [];
  const carCols = [0xd62b20, 0x2e86c1, 0xf1c40f, 0x2f9e44];
  carCols.forEach((col, i) => {
    const car = new THREE.Group(); groupRoot.add(car);
    rbox(0.12, 0.06, 0.07, 0.012, std(col, { roughness: 0.45 }), [0, 0.06, 0], { parent: car });
    if (i === 0) {
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.11, 16), std(col), [0.02, 0.1, 0], { parent: car, rot: [0, 0, Math.PI / 2] });
      add(new THREE.CylinderGeometry(0.012, 0.016, 0.06, 12), std(0x222222), [0.05, 0.15, 0], { parent: car });
      rbox(0.05, 0.07, 0.075, 0.01, std(0x222222), [-0.04, 0.12, 0], { parent: car });
    }
    for (const [dx, dz] of [[-0.035, 0.04], [0.035, 0.04], [-0.035, -0.04], [0.035, -0.04]]) {
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 14), std(0x222222), [dx, 0.025, dz], { parent: car, rot: [Math.PI / 2, 0, 0] });
    }
    car.traverse(o => { if (o.isMesh) o.castShadow = false; });
    train.push(car);
  });
  animated.push({ kind: 'train', cars: train, track, t: 0 });

  // toy rocket, dinosaur, car, spinning top, an open picture book
  rocket([0.95, 0, 0.05]);
  dino([-0.95, 0, 0.95], 1.0);
  toyCar([0.62, 0, 0.95], 0.4);
  add(new THREE.ConeGeometry(0.06, 0.08, 24), std(0x8e44ad, { roughness: 0.4 }), [-0.85, 0.05, 0.45], { rot: [Math.PI, 0, 0] });
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8), std(0x8e44ad), [-0.85, 0.11, 0.45]);
  const book = new THREE.Group(); book.position.set(0.15, 0.006, 0.9); book.rotation.y = -0.3; groupRoot.add(book);
  for (const s of [-1, 1]) {
    const pg = add(new THREE.BoxGeometry(0.2, 0.012, 0.26), std(0xfffdf7), [s * 0.1, 0.01, 0], { parent: book, rot: [0, 0, s * -0.12], uv: 0.75 });
    pg.castShadow = false;
  }
  add(new THREE.PlaneGeometry(0.16, 0.12), std(0xffffff, { map: T.kidDrawing() }), [0.1, 0.03, 0], { parent: book, rot: [-Math.PI / 2, 0, 0.12], uv: 0.75 });

  // a big floor cushion / dog bed by the wardrobe
  add(new THREE.TorusGeometry(0.28, 0.1, 16, 40), std(0x8c6d5a, { roughness: 1 }), [-1.7, 0.08, 1.55], { rot: [-Math.PI / 2, 0, 0] });
  add(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 32), std(0xb89a83, { roughness: 1 }), [-1.7, 0.03, 1.55]);
  collide(-2.1, -1.3, 1.15, 1.95, 0, 0.18);
  // chew toy bone
  const bone = new THREE.Group(); bone.position.set(-1.65, 0.1, 1.5); bone.rotation.y = 0.6; groupRoot.add(bone);
  add(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 10), std(0xf2eadf), [0, 0, 0], { parent: bone, rot: [0, 0, Math.PI / 2] });
  for (const s of [-1, 1]) for (const d of [-1, 1]) add(new THREE.SphereGeometry(0.024, 12, 8), std(0xf2eadf), [s * 0.07, 0, d * 0.016], { parent: bone });

  // flowers: a pot of sunflowers & daisies between the radiator and the chest.
  // Their petals carry the UV bullseye bees navigate by.
  flowerPot([0.5, 0, -HZ + 0.32]);
  // and a little vase on the window sill
  vase([wcx - 0.45, win.y0, -HZ + 0.1]);

  // ceiling: light fixture, fan, glow-in-the-dark stars
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 16), std(0xffffff), [0, ROOM.h - 0.04, 0.1]);
  const fan = new THREE.Group(); fan.position.set(0, ROOM.h - 0.22, 0.1); groupRoot.add(fan);
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), std(0xffffff), [0, 0.1, 0], { parent: fan, cast: false });
  add(new THREE.CylinderGeometry(0.09, 0.07, 0.07, 20), std(0xfaf3e3), [0, 0, 0], { parent: fan, cast: false, temp: 30 });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    const bl = add(new THREE.BoxGeometry(0.55, 0.012, 0.12), std(0xc89c6c), [Math.cos(a) * 0.33, -0.01, Math.sin(a) * 0.33], { parent: fan, rot: [0.08, -a, 0], cast: false });
    bl.castShadow = false;
  }
  animated.push({ kind: 'fan', mesh: fan });
  const starTex = T.starSticker();
  const starMat = new THREE.MeshStandardMaterial({ color: 0xeaf7c8, alphaMap: starTex, transparent: true, emissive: 0xc8ff9a, emissiveIntensity: 0.05, roughness: 0.8 });
  lights.starMat = starMat;
  const sr = T.rng(77);
  for (let i = 0; i < 26; i++) {
    const s = 0.06 + sr() * 0.06;
    add(new THREE.PlaneGeometry(s, s), starMat, [(sr() - 0.5) * 4.4, ROOM.h - 0.002, (sr() - 0.5) * 3.8], { rot: [Math.PI / 2, 0, sr() * 6], cast: false, receive: false });
  }

  // ----------------------------------------------------------------- light
  const hemi = new THREE.HemisphereLight(0xd8ebff, 0xa07a50, 0.9);
  scene.add(hemi); lights.hemi = hemi;
  const amb = new THREE.AmbientLight(0xfff4e6, 0.25);
  scene.add(amb); lights.amb = amb;
  const sun = new THREE.DirectionalLight(0xfff1d8, 4.0);
  sun.position.set(-1.6, 4.2, -6.5);
  sun.target.position.set(0.4, 0, 0.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -4; sun.shadow.camera.right = 4; sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 14;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target); lights.sun = sun;
  // soft daylight spilling in through the window
  const sky = new THREE.RectAreaLight(0xcfe5ff, 3.2, ww, wh);
  sky.position.set(wcx, wcy, -HZ + 0.02);
  sky.lookAt(wcx, wcy - 0.6, 0);
  scene.add(sky); lights.sky = sky;
  // ceiling bounce fill
  const fill = new THREE.PointLight(0xfff6ea, 1.2, 8, 1.6);
  fill.position.set(0.3, 2.3, 0.6);
  scene.add(fill); lights.fill = fill;

  // ---------------------------------------------------------------- helpers
  function teddy(p, s) {
    const g = new THREE.Group(); g.position.set(...p); g.scale.setScalar(s); g.rotation.y = 0.5; groupRoot.add(g);
    const fur = std(0xb5813f, { roughness: 1 }), muzzle = std(0xe9cfa4, { roughness: 1 }), eye = std(0x111111, { roughness: 0.2 });
    add(new THREE.SphereGeometry(0.12, 24, 18), fur, [0, 0.12, 0], { parent: g });
    add(new THREE.SphereGeometry(0.09, 24, 18), fur, [0, 0.3, 0], { parent: g });
    for (const s2 of [-1, 1]) {
      add(new THREE.SphereGeometry(0.035, 12, 10), fur, [s2 * 0.065, 0.38, 0], { parent: g });
      add(new THREE.SphereGeometry(0.045, 12, 10), fur, [s2 * 0.12, 0.17, 0.03], { parent: g });
      add(new THREE.SphereGeometry(0.05, 12, 10), fur, [s2 * 0.07, 0.03, 0.08], { parent: g });
      add(new THREE.SphereGeometry(0.012, 10, 8), eye, [s2 * 0.032, 0.32, 0.08], { parent: g });
    }
    add(new THREE.SphereGeometry(0.04, 14, 10), muzzle, [0, 0.28, 0.07], { parent: g });
    add(new THREE.SphereGeometry(0.012, 10, 8), eye, [0, 0.29, 0.11], { parent: g });
  }

  function robot(p, s) {
    const g = new THREE.Group(); g.position.set(...p); g.scale.setScalar(s); g.rotation.y = -Math.PI / 2 + 0.3; groupRoot.add(g);
    const metal = std(0xb7c3cc, { metalness: 0.6, roughness: 0.3 });
    rbox(0.14, 0.16, 0.1, 0.02, metal, [0, 0.12, 0], { parent: g });
    rbox(0.11, 0.09, 0.09, 0.02, metal, [0, 0.26, 0], { parent: g });
    for (const s2 of [-1, 1]) {
      add(new THREE.SphereGeometry(0.015, 10, 8), std(0x2ecc71, { emissive: 0x2ecc71, emissiveIntensity: 0.6 }), [s2 * 0.025, 0.27, 0.046], { parent: g });
      box(0.035, 0.05, 0.035, std(0xe74c3c), [s2 * 0.04, 0.025, 0], { parent: g });
    }
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), metal, [0, 0.33, 0], { parent: g });
    add(new THREE.SphereGeometry(0.012, 8, 6), std(0xe74c3c), [0, 0.365, 0], { parent: g });
  }

  function rocket(p) {
    const g = new THREE.Group(); g.position.set(...p); groupRoot.add(g);
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 24), std(0xf5f5f5, { roughness: 0.35 }), [0, 0.2, 0], { parent: g });
    add(new THREE.ConeGeometry(0.06, 0.14, 24), std(0xd62b20, { roughness: 0.35 }), [0, 0.43, 0], { parent: g });
    add(new THREE.CylinderGeometry(0.026, 0.026, 0.01, 20), std(0x3c8de0, { emissive: 0x1b4f8a, emissiveIntensity: 0.3 }), [0, 0.28, 0.056], { parent: g, rot: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      box(0.012, 0.12, 0.08, std(0xd62b20), [Math.cos(a) * 0.075, 0.08, Math.sin(a) * 0.075], { parent: g, rot: [0, -a, 0] });
    }
    add(new THREE.CylinderGeometry(0.045, 0.035, 0.04, 20), std(0x555555), [0, 0.03, 0], { parent: g });
    collide(p[0] - 0.12, p[0] + 0.12, p[2] - 0.12, p[2] + 0.12, 0, 0.5);
  }

  function dino(p, s) {
    const g = new THREE.Group(); g.position.set(...p); g.scale.setScalar(s); g.rotation.y = 0.9; groupRoot.add(g);
    const skin = std(0x5cb85c, { roughness: 0.5 }), belly = std(0xc8e6a0, { roughness: 0.5 });
    add(new THREE.CapsuleGeometry(0.09, 0.16, 8, 16), skin, [0, 0.2, 0], { parent: g, rot: [0, 0, Math.PI / 2 - 0.3] });
    add(new THREE.CapsuleGeometry(0.05, 0.12, 8, 12), skin, [0.15, 0.33, 0], { parent: g, rot: [0, 0, -0.5] });
    rbox(0.16, 0.09, 0.1, 0.035, skin, [0.23, 0.42, 0], { parent: g });
    add(new THREE.ConeGeometry(0.06, 0.3, 14), skin, [-0.22, 0.14, 0], { parent: g, rot: [0, 0, Math.PI / 2 + 0.35] });
    for (const s2 of [-1, 1]) {
      add(new THREE.CapsuleGeometry(0.035, 0.08, 6, 10), skin, [0.02, 0.07, s2 * 0.06], { parent: g });
      add(new THREE.SphereGeometry(0.013, 10, 8), std(0x111111, { roughness: 0.2 }), [0.27, 0.45, s2 * 0.04], { parent: g });
    }
    add(new THREE.SphereGeometry(0.075, 16, 12), belly, [0.05, 0.19, 0], { parent: g });
    for (let i = 0; i < 5; i++) add(new THREE.ConeGeometry(0.02, 0.05, 6), std(0xf39c12), [-0.12 + i * 0.07, 0.3 - Math.abs(i - 2) * 0.02, 0], { parent: g });
    collide(p[0] - 0.25, p[0] + 0.25, p[2] - 0.25, p[2] + 0.25, 0, 0.55);
  }

  function toyCar(p, ry) {
    const g = new THREE.Group(); g.position.set(...p); g.rotation.y = ry; groupRoot.add(g);
    rbox(0.24, 0.07, 0.12, 0.025, std(0x2e86c1, { roughness: 0.3, metalness: 0.2 }), [0, 0.06, 0], { parent: g });
    rbox(0.13, 0.06, 0.1, 0.025, std(0x2e86c1, { roughness: 0.3, metalness: 0.2 }), [-0.02, 0.11, 0], { parent: g });
    box(0.135, 0.04, 0.102, std(0xbfe3ff, { roughness: 0.1 }), [-0.02, 0.115, 0], { parent: g });
    for (const [dx, dz] of [[-0.07, 0.06], [0.07, 0.06], [-0.07, -0.06], [0.07, -0.06]]) add(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 18), std(0x1d1d1d), [dx, 0.03, dz], { parent: g, rot: [Math.PI / 2, 0, 0] });
    add(new THREE.SphereGeometry(0.012, 8, 6), std(0xfff3b0, { emissive: 0xfff3b0, emissiveIntensity: 0.4 }), [0.12, 0.065, 0.035], { parent: g });
    add(new THREE.SphereGeometry(0.012, 8, 6), std(0xfff3b0, { emissive: 0xfff3b0, emissiveIntensity: 0.4 }), [0.12, 0.065, -0.035], { parent: g });
  }

  function hamsterCage(p) {
    const g = new THREE.Group(); g.position.set(...p); g.rotation.y = -0.3; groupRoot.add(g);
    rbox(0.5, 0.06, 0.34, 0.015, std(0x6cc4a1, { roughness: 0.5 }), [0, 0.03, 0], { parent: g });
    box(0.46, 0.012, 0.3, std(0xf0deb4, { roughness: 1 }), [0, 0.066, 0], { parent: g }); // bedding
    const wire = std(0xdcdcdc, { metalness: 0.7, roughness: 0.3 });
    const H = 0.3;
    for (let i = 0; i <= 16; i++) for (const s2 of [-1, 1]) add(new THREE.CylinderGeometry(0.0025, 0.0025, H, 4), wire, [-0.24 + i * 0.03, 0.06 + H / 2, s2 * 0.165], { parent: g, cast: false });
    for (let i = 0; i <= 10; i++) for (const s2 of [-1, 1]) add(new THREE.CylinderGeometry(0.0025, 0.0025, H, 4), wire, [s2 * 0.245, 0.06 + H / 2, -0.15 + i * 0.03], { parent: g, cast: false });
    box(0.5, 0.01, 0.34, std(0x6cc4a1), [0, 0.06 + H, 0], { parent: g });
    // wheel
    const wheel = add(new THREE.TorusGeometry(0.08, 0.008, 8, 32), std(0xf39c12), [0.12, 0.16, 0], { parent: g });
    animated.push({ kind: 'wheel', mesh: wheel });
    // the hamster, curled up in the corner
    const fur = std(0xd9a066, { roughness: 1 });
    add(new THREE.SphereGeometry(0.045, 20, 14), fur, [-0.12, 0.11, 0.05], { parent: g, temp: 37 }).scale.set(1.3, 0.9, 1);
    add(new THREE.SphereGeometry(0.03, 16, 12), fur, [-0.065, 0.12, 0.05], { parent: g, temp: 37 });
    add(new THREE.SphereGeometry(0.012, 10, 8), std(0xf5c6c6), [-0.075, 0.15, 0.07], { parent: g, temp: 36 });
    add(new THREE.SphereGeometry(0.012, 10, 8), std(0xf5c6c6), [-0.075, 0.15, 0.03], { parent: g, temp: 36 });
    add(new THREE.SphereGeometry(0.006, 8, 6), std(0x111111), [-0.04, 0.125, 0.065], { parent: g, temp: 36 });
    // food bowl
    add(new THREE.CylinderGeometry(0.04, 0.03, 0.025, 16), std(0xe74c3c), [-0.12, 0.08, -0.08], { parent: g });
    collide(p[0] - 0.28, p[0] + 0.28, p[2] - 0.22, p[2] + 0.22, 0, 0.4);
  }

  function flowerHeadMesh(parent, pos, size, opts, look) {
    const map = T.flowerHead(opts);
    const uvMap = T.flowerHead({ ...opts, uvGuide: true });
    const mat = std(0xffffff, { map, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
    const m = add(new THREE.PlaneGeometry(size, size), mat, pos, { parent, uvMap, uv: 1 });
    m.lookAt(look);
    return m;
  }

  function flowerPot(p) {
    const g = new THREE.Group(); g.position.set(...p); groupRoot.add(g);
    add(new THREE.CylinderGeometry(0.13, 0.1, 0.24, 28), std(0xc96a3b, { roughness: 0.9 }), [0, 0.12, 0], { parent: g });
    add(new THREE.CylinderGeometry(0.12, 0.12, 0.01, 28), std(0x4a3222, { roughness: 1 }), [0, 0.235, 0], { parent: g });
    const stem = std(0x4f9a45, { roughness: 0.8 });
    const look = new THREE.Vector3(0.0, 0.0, 1.2);
    const heads = [
      [-0.07, 0.5, 0.02, 0.24, { petals: 22, petal: '#f6c21c', centre: '#4a2a0c' }],
      [0.1, 0.44, 0.06, 0.2, { petals: 20, petal: '#f6b80f', centre: '#5a3410' }],
      [-0.13, 0.34, 0.1, 0.12, { petals: 16, petal: '#ffffff', centre: '#f2c21c', daisy: true }],
      [0.12, 0.31, 0.12, 0.11, { petals: 16, petal: '#ffffff', centre: '#f2c21c', daisy: true }],
    ];
    for (const [x, y, z, s, o] of heads) {
      const sm = add(new THREE.CylinderGeometry(0.006, 0.008, y - 0.22, 6), stem, [x * 0.6, 0.22 + (y - 0.22) / 2, z * 0.4], { parent: g, rot: [0.1, 0, -x] });
      sm.castShadow = false;
      const w = new THREE.Vector3(x, y, z).add(g.position);
      const target = new THREE.Vector3(look.x + w.x * 0.2, 0.0, look.z + w.z);
      flowerHeadMesh(g, [x, y, z], s, o, target);
    }
    for (let i = 0; i < 6; i++) {
      const lf = add(new THREE.SphereGeometry(0.05, 10, 6), std(0x58a84f), [Math.cos(i) * 0.06, 0.27 + i * 0.03, Math.sin(i) * 0.06], { parent: g, cast: false });
      lf.scale.set(1.4, 0.18, 0.6); lf.rotation.y = i;
    }
    collide(p[0] - 0.14, p[0] + 0.14, p[2] - 0.14, p[2] + 0.14, 0, 0.9);
  }

  function vase(p) {
    const g = new THREE.Group(); g.position.set(...p); groupRoot.add(g);
    add(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 20), std(0x5dade2, { roughness: 0.15, metalness: 0.1 }), [0, 0.08, 0], { parent: g });
    const look = new THREE.Vector3(p[0] + 0.5, -0.3, 1.5);
    const cols = ['#e84393', '#ffffff', '#f6c21c'];
    cols.forEach((c, i) => {
      add(new THREE.CylinderGeometry(0.003, 0.003, 0.14, 5), std(0x4f9a45), [(i - 1) * 0.03, 0.2, 0], { parent: g, rot: [0, 0, (i - 1) * 0.3], cast: false });
      flowerHeadMesh(g, [(i - 1) * 0.06, 0.28 + (i === 1 ? 0.03 : 0), 0.01], 0.09, { petals: 10 + i * 3, petal: c, centre: '#f2c21c', daisy: i !== 2 }, look);
    });
  }

  // ------------------------------------------------------- viewpoints
  const presets = {
    door:   { pos: [1.55, 1.75], yaw: 0.62, pitch: 0.17 },
    rug:    { pos: [0.15, 1.25], yaw: 0.05, pitch: 0.12 },
    bed:    { pos: [-1.9, -1.55], yaw: -1.95, pitch: 0.06 },
    chest:  { pos: [0.75, -0.75], yaw: -0.12, pitch: 0.32 },
    flower: { pos: [0.3, -1.0], yaw: 0.0, pitch: 0.42 },
    hamster:{ pos: [0.9, 0.95], yaw: -1.25, pitch: 0.0 },
  };

  return { colliders, animated, lights, presets, groupRoot };
}

// Per-frame motion: the train loops, the fan turns, the ball wobbles.
export function animateRoom(animated, t, night) {
  for (const a of animated) {
    if (a.kind === 'train') {
      a.cars.forEach((car, i) => {
        const u = t * 0.35 - i * 0.24;
        const x = a.track.cx + Math.cos(u) * a.track.rx, z = a.track.cz + Math.sin(u) * a.track.rz;
        const dx = -Math.sin(u) * a.track.rx, dz = Math.cos(u) * a.track.rz;
        car.position.set(x, 0.012, z);
        car.rotation.y = Math.atan2(-dz, dx);
      });
    } else if (a.kind === 'fan') {
      a.mesh.rotation.y = night ? a.mesh.rotation.y : t * 2.2;
    } else if (a.kind === 'ball') {
      const k = Math.sin(t * 0.8) * 0.06;
      a.mesh.position.x = a.base.x + k;
      a.mesh.rotation.z = -k / 0.09;
    } else if (a.kind === 'wheel') {
      a.mesh.rotation.z = t * 3;
    }
  }
}
