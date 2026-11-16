// Screenshot helper for the README images.
//   npm run capture                                   -> default set into assets/
//   node tools/capture.mjs 1440 900 "img=orchard&eye=dog=out.jpg" "img=night&eye=cat@stage=stage.jpg"
// A job is "<query>[@stage|@full]=<file>": @stage crops to the comparison, @full is the whole page.
// Uses CHROME_PATH if set, then a Playwright headless shell if installed, then your local Chrome.
import { chromium } from 'playwright-core';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
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
  ['img=portrait&lang=zh@full', 'assets/cover.jpg'],
  ['img=portrait&theme=light&lang=zh@full', 'assets/cover-light.jpg'],
  ['img=portrait&view=grid&lang=zh@stage', 'assets/shots/grid.jpg'],
  ['img=orchard&eye=dog&split=0.5&lang=zh@stage', 'assets/shots/dog.jpg'],
  ['img=sunflower&eye=bee&split=0.25&lang=zh@stage', 'assets/shots/bee.jpg'],
  ['img=night&eye=cat&light=night&split=0.5&lang=zh@stage', 'assets/shots/cat-night.jpg'],
  ['img=valley&eye=eagle&split=0.35&loupe=0.62,0.38&lang=zh@stage', 'assets/shots/eagle.jpg'],
  ['img=cat&eye=mouse&split=0.5&lang=zh@stage', 'assets/shots/mouse.jpg'],
];

let [w, h, ...jobs] = process.argv.slice(2);
const list = jobs.length ? jobs.map(j => { const i = j.lastIndexOf('='); return [j.slice(0, i), j.slice(i + 1)]; }) : DEFAULT;
w = +(w || 1440); h = +(h || 900);

const browser = await chromium.launch(launchOptions());
for (const [job, out] of list) {
  const [q, mode = 'full'] = job.split('@');
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +(process.env.DSF || 1), isMobile: w < 600, hasTouch: w < 600, colorScheme: process.env.SCHEME || 'dark' });
  page.setDefaultTimeout(180000);
  page.on('pageerror', e => console.log('pageerror:', e.message));
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await page.goto(`http://localhost:${PORT}/index.html?` + q);
  await page.waitForFunction(() => (window.__ready || 0) >= 1);
  const lp = new URLSearchParams(q).get('loupe');
  if (lp) {
    const [fx, fy] = lp.split(',').map(Number);
    const box = await page.locator('#stage').boundingBox();
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
  }
  await page.evaluate(() => { document.querySelectorAll('.rv').forEach(n => n.classList.add('in')); return document.fonts.ready; });
  await page.waitForTimeout(3500);
  const opt = out.endsWith('.jpg') ? { path: out, type: 'jpeg', quality: 88 } : { path: out };
  if (mode === 'stage') await page.locator('#stage').screenshot(opt);
  else await page.screenshot({ ...opt, fullPage: mode === 'long' });
  await page.close();
  console.log('ok', out);
}
await browser.close();
server.close();
