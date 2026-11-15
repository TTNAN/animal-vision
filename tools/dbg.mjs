import { chromium } from 'playwright-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const T = { '.js': 'text/javascript', '.html': 'text/html', '.css':'text/css' };
const server = http.createServer((q, r) => { const f = path.join(process.cwd(), decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(0);
const bb0 = 0; const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux-arm64/chrome-headless-shell', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 300, height: 200 } }); p.setDefaultTimeout(900000);
p.on('console', m => { if (m.type() !== 'log') console.log('C', m.type(), m.text().slice(0, 300)); });
p.on('pageerror', e => console.log('err', e.message));
await p.goto(`http://localhost:${server.address().port}/index.html?cube=128&mode=single&sp=human&view=rug`);
await p.waitForFunction(() => (window.__frames || 0) > 1);
const r = await p.evaluate(() => {
  const { renderer, rtN, meshes, scene, camN } = window.AV;
  const S = 128;
  function nanFaces() {
    window.AV.cubeUpdate(camN);
    const out = [];
    for (let f = 0; f < 6; f++) { const buf = new Uint16Array(S * S * 4); renderer.readRenderTargetPixels(rtN, 0, 0, S, S, buf, f); let n = 0, z = 0; for (let i = 0; i < buf.length; i += 4) if (buf[i] === 0 && buf[i+1] === 0 && buf[i+2] === 0) z++; for (let i = 0; i < buf.length; i++) if ((buf[i] & 0x7c00) === 0x7c00) n++; out.push([n, z]); }
    return out;
  }
  const bad = []; const base = nanFaces();
  const res = {};
  const avg = f => { const buf = new Uint16Array(S * S * 4); renderer.readRenderTargetPixels(rtN, 0, 0, S, S, buf, f); const { THREE } = window.AV; let r = 0, g = 0, b = 0; for (let i = 0; i < buf.length; i += 4) { r += THREE.DataUtils.fromHalfFloat(buf[i]); g += THREE.DataUtils.fromHalfFloat(buf[i+1]); b += THREE.DataUtils.fromHalfFloat(buf[i+2]); } const n = S * S; return [r / n, g / n, b / n].map(v => +v.toFixed(3)); };
  window.AV.cubeUpdate(camN);
  res.faces = [0,1,2,3,4,5].map(avg);
  const rt = rtN;
  for (const f of [5,4,3,2,1,0]) { renderer.setRenderTarget(rt, f); renderer.clear(); renderer.render(scene, camN.children[f]); }
  renderer.setRenderTarget(null);
  res.rev = [0,1,2,3,4,5].map(avg);
  // rotate cube camera 90deg so -x scene direction falls on another face
  camN.rotation.y = Math.PI / 2; camN.updateMatrixWorld(true);
  window.AV.cubeUpdate(camN);
  res.rot = [0,1,2,3,4,5].map(avg);
  camN.rotation.y = 0; camN.updateMatrixWorld(true);
  { const { THREE } = window.AV; const rc = new THREE.Raycaster(); rc.near = 0; 
    for (const d of [[-1,0,0],[-1,0.3,0.2],[-1,-0.05,-0.3]]) { rc.set(camN.position.clone(), new THREE.Vector3(...d).normalize()); res['hit' + d] = rc.intersectObjects(scene.children, true).slice(0, 3).map(h => [h.distance.toFixed(2), h.object.type, h.object.geometry && h.object.geometry.type, h.object.name, h.object.material && h.object.material.type, h.object.visible]); } }
  { const { THREE } = window.AV; const c = camN.position; res.inside = []; scene.traverse(o => { if (!o.isMesh) return; const b = new THREE.Box3().setFromObject(o); if (b.containsPoint(c) || (b.min.x < c.x && b.max.z > 1.3 && b.min.z < 1.8 && b.max.x < 0.4 && b.max.x > -0.5)) res.inside.push([o.geometry.type, o.material.type || 'multi', o.material.side, b.min.toArray().map(v=>+v.toFixed(2)), b.max.toArray().map(v=>+v.toFixed(2)), o.visible]); }); }
  { const { THREE } = window.AV; scene.overrideMaterial = new THREE.MeshNormalMaterial(); window.AV.cubeUpdate(camN); res.normalOv = [0,1,2,3,4,5].map(avg); scene.overrideMaterial = null;
    const keepL = []; scene.traverse(o => { if (o.isLight) keepL.push([o, o.intensity]); });
    for (const [l] of keepL) l.intensity = 0; scene.environmentIntensity = 1.5; window.AV.cubeUpdate(camN); res.envOnly = [0,1,2,3,4,5].map(avg);
    scene.environmentIntensity = 0; for (const [l, i] of keepL) if (l.isHemisphereLight) l.intensity = i; window.AV.cubeUpdate(camN); res.hemiOnly = [0,1,2,3,4,5].map(avg);
    for (const [l, i] of keepL) l.intensity = i; scene.environmentIntensity = 1.5; }
  { const { THREE } = window.AV; const pc = new THREE.PerspectiveCamera(90, 1, 0.015, 30); pc.position.copy(camN.position); pc.up.set(0, 1, 0); pc.lookAt(camN.position.clone().add(new THREE.Vector3(-1, 0, 0))); pc.updateMatrixWorld();
    renderer.setRenderTarget(rtN, 1); renderer.clear(); renderer.render(scene, pc); renderer.setRenderTarget(null); res.fresh = avg(1);
    const c1 = camN.children[1]; res.c1 = { pm: Array.from(c1.projectionMatrix.elements).map(v=>+v.toFixed(3)), up: c1.up.toArray(), layers: c1.layers.mask, mw: Array.from(c1.matrixWorld.elements).map(v=>+v.toFixed(3)) };
    const c0 = camN.children[0]; res.c0 = { layers: c0.layers.mask, mw: Array.from(c0.matrixWorld.elements).map(v=>+v.toFixed(3)) }; }
  { const { THREE } = window.AV; const img = (f) => { const buf = new Uint16Array(S * S * 4); renderer.readRenderTargetPixels(rtN, 0, 0, S, S, buf, f); const cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d'); const id = ctx.createImageData(S, S); for (let i = 0; i < S * S; i++) for (let k = 0; k < 3; k++) id.data[i * 4 + k] = Math.min(255, Math.pow(THREE.DataUtils.fromHalfFloat(buf[i * 4 + k]) * 2, 1 / 2.2) * 255); for (let i = 0; i < S*S; i++) id.data[i*4+3] = 255; ctx.putImageData(id, 0, 0); return cv.toDataURL(); };
    window.AV.cubeUpdate(camN); for (let f = 0; f < 6; f++) res['f' + f] = img(f);
    scene.overrideMaterial = new THREE.MeshNormalMaterial(); window.AV.cubeUpdate(camN); res.img1n = img(1); scene.overrideMaterial = null; }
  { renderer.info.autoReset = false; res.calls = []; for (let f = 0; f < 6; f++) { renderer.info.reset(); renderer.setRenderTarget(rtN, f); renderer.clear(); renderer.render(scene, camN.children[f]); res.calls.push(renderer.info.render.calls); } renderer.setRenderTarget(null); renderer.info.autoReset = true; }
  { const { THREE } = window.AV; const fr = new THREE.Frustum(); res.cull = [];
    for (let f = 0; f < 2; f++) { const c = camN.children[f]; c.updateMatrixWorld(); const m = new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse); fr.setFromProjectionMatrix(m, renderer.coordinateSystem);
      let vis = 0, tot = 0, wallsIn = []; scene.traverse(o => { if (!o.isMesh) return; tot++; if (fr.intersectsObject(o)) vis++; if (o.geometry.type === 'BoxGeometry' && o.geometry.parameters.height === 2.6) wallsIn.push([+o.position.x.toFixed(2), +o.position.z.toFixed(2), fr.intersectsObject(o)]); });
      res.cull.push({ f, vis, tot, wallsIn, mwi: Array.from(c.matrixWorldInverse.elements).map(v => +v.toFixed(2)) }); } }
  { const { THREE } = window.AV; const c = camN.children[1]; const fr = new THREE.Frustum(); fr.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse), renderer.coordinateSystem);
    const f1 = () => { renderer.setRenderTarget(rtN, 1); renderer.clear(); renderer.render(scene, c); renderer.setRenderTarget(null); const buf = new Uint16Array(S*S*4); renderer.readRenderTargetPixels(rtN, 0, 0, S, S, buf, 1); let z = 0; for (let i = 0; i < buf.length; i += 4) if (!buf[i] && !buf[i+1] && !buf[i+2]) z++; return z; };
    res.f1base = f1(); res.cures = [];
    const vis = []; scene.traverse(o => { if (o.isMesh && o.visible && fr.intersectsObject(o)) vis.push(o); });
    for (const o of vis) { o.visible = false; const z = f1(); o.visible = true; if (z < res.f1base) { const b = new THREE.Box3().setFromObject(o); res.cures.push([z, o.geometry.type, o.material.type, o.name, o.userData.temp, b.min.toArray().map(v=>+v.toFixed(2)), b.max.toArray().map(v=>+v.toFixed(2))]); } }
    res.nvis = vis.length; }
  res.programs = renderer.info.programs.length; res.texCount = renderer.info.memory.textures;
  res.dirs = camN.children.map(c => c.getWorldDirection(c.position.clone()).toArray().map(v => +v.toFixed(2)));
  return { base, res };

});
for (const k of ['f0','f1','f2','f3','f4','f5','img1n']) { fs.writeFileSync('/tmp/' + k + '.png', Buffer.from(r.res[k].split(',')[1], 'base64')); delete r.res[k]; }
console.log(JSON.stringify([r.res.f1base, r.res.nvis, r.res.cures]));
await b.close(); server.close();
