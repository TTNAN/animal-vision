import { chromium } from 'playwright-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const T = { '.js': 'text/javascript', '.html': 'text/html', '.css':'text/css' };
const server = http.createServer((q, r) => { const f = path.join(process.cwd(), decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(0);
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux-arm64/chrome-headless-shell', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 300, height: 200 } }); p.setDefaultTimeout(900000);
p.on('pageerror', e => console.log('err', e.message));
await p.goto(`http://localhost:${server.address().port}/index.html?cube=128&mode=single&sp=snake&view=hamster`);
await p.waitForFunction(() => (window.__frames || 0) > 2);
const r = await p.evaluate(() => {
  const { renderer, rtT, THREE, meshes } = window.AV; const S = rtT.width;
  const avg = f => { const buf = new Uint16Array(S * S * 4); renderer.readRenderTargetPixels(rtT, 0, 0, S, S, buf, f); let r = 0, mx = 0; for (let i = 0; i < buf.length; i += 4) { const v = THREE.DataUtils.fromHalfFloat(buf[i]); r += v; mx = Math.max(mx, v); } return [+(r / S / S).toFixed(3), +mx.toFixed(3)]; };
  const temps = {}; for (const m of meshes) temps[m.userData.temp] = (temps[m.userData.temp] || 0) + 1;
  return { S, type: rtT.texture.type, faces: [0,1,2,3,4,5].map(avg), temps };
});
console.log(JSON.stringify(r)); await b.close(); server.close();
