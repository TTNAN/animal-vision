// Screenshot helper (also used to make the README images).
//   npm run capture                         -> writes the default set into assets/
//   node tools/capture.mjs 1280 760 "sp=bee&view=flower=out.png" ...
// Uses CHROME_PATH if set, then a Playwright headless shell if installed, then your local Chrome.
import { chromium } from 'playwright-core';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

// tiny static server: ES modules and model files can't load from file://
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const f = path.join(process.cwd(), decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
const PORT = server.address().port;

function launchOptions() {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  if (process.env.CHROME_PATH) return { executablePath: process.env.CHROME_PATH, args };
  const base = path.join(os.homedir(), process.platform === 'win32' ? 'AppData/Local/ms-playwright' : '.cache/ms-playwright');
  try {
    const dir = fs.readdirSync(base).find(d => d.startsWith('chromium_headless_shell'));
    const sub = fs.readdirSync(path.join(base, dir)).find(d => d.startsWith('chrome-headless-shell'));
    const exe = path.join(base, dir, sub, process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell');
    if (fs.existsSync(exe)) return { executablePath: exe, args };
  } catch {}
  return { channel: 'chrome', args };
}

const DEFAULT = [
  ['lang=zh&cube=1024&mode=split&sp=dog&view=rug&info=0', 'assets/cover.jpg'],
  ['lang=zh&cube=1024&mode=grid&view=rug', 'assets/grid.jpg'],
  ['lang=zh&cube=1024&mode=split&sp=dog&view=rug&info=0', 'assets/shots/dog.jpg'],
  ['lang=zh&cube=1024&mode=split&sp=cat&view=door&night=1&info=0', 'assets/shots/cat-night.jpg'],
  ['lang=zh&cube=1024&mode=split&sp=bee&view=flower&info=0', 'assets/shots/bee.jpg'],
  ['lang=zh&cube=1024&mode=split&sp=eagle&view=chest&info=0', 'assets/shots/eagle.jpg'],
  ['lang=zh&cube=1024&mode=split&sp=snake&view=hamster&night=1&info=0', 'assets/shots/snake.jpg'],
  ['lang=zh&cube=1024&mode=single&sp=human&view=bed&info=0', 'assets/shots/under-bed.jpg'],
];

let [w, h, ...jobs] = process.argv.slice(2);
let list = jobs.length ? jobs.map(j => { const i = j.lastIndexOf('='); return [j.slice(0, i), j.slice(i + 1)]; }) : DEFAULT;
w = +(w || 1280); h = +(h || 760);

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: w, height: h } });
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.log('pageerror:', e.message));
for (const [q, out] of list) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await page.goto(`http://localhost:${PORT}/index.html?` + q);
  await page.waitForFunction(() => (window.__frames || 0) > 2);
  await page.waitForTimeout(600); // let the switch flash fade
  await page.screenshot(out.endsWith('.jpg') ? { path: out, type: 'jpeg', quality: 86 } : { path: out });
  console.log('ok', out);
}
await browser.close();
server.close();
