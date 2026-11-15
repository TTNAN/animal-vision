// Every texture in the room is painted on a <canvas> at start-up.
// No image files to download, nothing copyrighted, and the repo stays tiny.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// Small deterministic RNG so the room looks the same on every load.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tex(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  return t;
}

function cloud(ctx, x, y, s, fill) {
  ctx.fillStyle = fill;
  const puffs = [[0, 0, 1], [-0.9, 0.25, 0.75], [0.9, 0.2, 0.8], [-0.45, -0.45, 0.7], [0.4, -0.5, 0.75], [1.6, 0.4, 0.55], [-1.6, 0.45, 0.5]];
  ctx.beginPath();
  for (const [dx, dy, r] of puffs) {
    ctx.moveTo(x + dx * s + r * s, y + dy * s);
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillRect(x - 1.7 * s, y + 0.2 * s, 3.4 * s, 0.75 * s);
}

// Blue sky with soft white clouds: a nod to a certain famous toy-filled bedroom.
export function cloudWallpaper() {
  const [c, ctx] = canvas(1024, 1024);
  const g = ctx.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0, '#6aa6e0');
  g.addColorStop(1, '#86b9e8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 1024);
  const r = rng(7);
  for (let i = 0; i < 9; i++) {
    const x = (i % 3) * 341 + 120 + r() * 120;
    const y = Math.floor(i / 3) * 341 + 120 + r() * 120;
    const s = 38 + r() * 18;
    // draw wrapped copies so the tile repeats seamlessly
    for (const ox of [-1024, 0, 1024]) for (const oy of [-1024, 0, 1024]) {
      cloud(ctx, x + ox + 4, y + oy + 6, s, 'rgba(70,120,180,0.18)');
      cloud(ctx, x + ox, y + oy, s, '#fbfdff');
    }
  }
  return tex(c, { repeat: [2.2, 1.2] });
}

export function woodFloor() {
  const [c, ctx] = canvas(1024, 1024);
  const r = rng(3);
  const plankH = 64;
  for (let row = 0; row < 1024 / plankH; row++) {
    let x = -r() * 400;
    while (x < 1024) {
      const len = 300 + r() * 400;
      const tone = 150 + r() * 40;
      ctx.fillStyle = `rgb(${tone + 40},${tone - 2},${tone - 55})`;
      ctx.fillRect(x, row * plankH, len, plankH);
      // grain
      for (let k = 0; k < 14; k++) {
        ctx.strokeStyle = `rgba(90,50,20,${0.05 + r() * 0.1})`;
        ctx.lineWidth = 1 + r() * 2;
        ctx.beginPath();
        const yy = row * plankH + r() * plankH;
        ctx.moveTo(x, yy);
        ctx.bezierCurveTo(x + len * 0.3, yy + (r() - 0.5) * 12, x + len * 0.6, yy + (r() - 0.5) * 12, x + len, yy + (r() - 0.5) * 6);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(60,35,15,0.55)';
      ctx.fillRect(x, row * plankH, 2, plankH);
      x += len;
    }
    ctx.fillStyle = 'rgba(60,35,15,0.5)';
    ctx.fillRect(0, row * plankH, 1024, 2);
  }
  return tex(c, { repeat: [2.5, 2.5] });
}

// Round green rug: the stage for the red-ball test.
export function rug() {
  const [c, ctx] = canvas(1024, 1024);
  const rings = [['#2f7d45', 512], ['#f2c14e', 470], ['#2f7d45', 440], ['#3a91c9', 330], ['#2f7d45', 300], ['#f2c14e', 150], ['#2f7d45', 128]];
  for (const [col, rad] of rings) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(512, 512, rad, 0, Math.PI * 2); ctx.fill();
  }
  // braided texture
  const r = rng(11);
  for (let i = 0; i < 9000; i++) {
    const a = r() * Math.PI * 2, d = r() * 510;
    ctx.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`;
    ctx.fillRect(512 + Math.cos(a) * d, 512 + Math.sin(a) * d, 3, 3);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function letterBlock(letter, bg, fg) {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = fg; ctx.lineWidth = 16; ctx.strokeRect(18, 18, 220, 220);
  ctx.fillStyle = fg;
  ctx.font = 'bold 170px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 140);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Tumbling-E acuity chart: the sharpest test in the room.
export function eyeChart() {
  const [c, ctx] = canvas(512, 768);
  ctx.fillStyle = '#fbfaf5'; ctx.fillRect(0, 0, 512, 768);
  ctx.fillStyle = '#c0392b';
  ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('视 力 表', 256, 52);
  const r = rng(5);
  let y = 90;
  const sizes = [120, 84, 60, 44, 32, 24, 17, 12, 9];
  ctx.fillStyle = '#111';
  for (const s of sizes) {
    const n = Math.min(8, Math.max(1, Math.floor(400 / (s * 1.6))));
    const total = n * s * 1.6;
    for (let i = 0; i < n; i++) {
      const x = 256 - total / 2 + i * s * 1.6 + s * 0.3;
      drawE(ctx, x, y, s, Math.floor(r() * 4));
    }
    y += s * 1.45;
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function drawE(ctx, x, y, s, rot) {
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  ctx.rotate(rot * Math.PI / 2);
  const u = s / 5;
  ctx.fillRect(-s / 2, -s / 2, u, s);
  for (let k = 0; k < 3; k++) ctx.fillRect(-s / 2, -s / 2 + k * 2 * u, s, u);
  ctx.restore();
}

export function bookSpine(seed, color) {
  const [c, ctx] = canvas(64, 256);
  const r = rng(seed);
  ctx.fillStyle = color; ctx.fillRect(0, 0, 64, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  const bands = 1 + Math.floor(r() * 3);
  for (let i = 0; i < bands; i++) ctx.fillRect(0, 20 + i * 14 + r() * 4, 64, 4);
  ctx.fillRect(0, 216, 64, 5);
  // a "title" of tiny glyph strokes: readable as texture, gives the eagle something to resolve
  ctx.fillStyle = r() < 0.5 ? '#fff7e0' : '#1d1d1d';
  for (let i = 0; i < 6 + r() * 6; i++) ctx.fillRect(22 + r() * 6, 70 + i * 13, 14 + r() * 8, 7);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function quilt() {
  const [c, ctx] = canvas(512, 512);
  const cols = ['#e85d4a', '#f6f1e7', '#3c7dc4', '#f6f1e7', '#f2b84b', '#f6f1e7', '#55a868', '#f6f1e7'];
  const n = 8, s = 512 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    ctx.fillStyle = cols[(i + j * 3) % cols.length];
    ctx.fillRect(i * s, j * s, s, s);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
    ctx.strokeRect(i * s + 5, j * s + 5, s - 10, s - 10);
  }
  return tex(c, { repeat: [1.5, 1.5] });
}

export function stripes(a, b, n = 10) {
  const [c, ctx] = canvas(256, 64);
  for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? a : b; ctx.fillRect(i * 256 / n, 0, 256 / n, 64); }
  return tex(c, { repeat: [3, 1] });
}

// What you see through the window: sky, a hill, a tree, a neighbour's roof.
export function outside() {
  const [c, ctx] = canvas(1024, 768);
  const g = ctx.createLinearGradient(0, 0, 0, 768);
  g.addColorStop(0, '#5d9ee6'); g.addColorStop(0.65, '#bfe0ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 768);
  cloud(ctx, 260, 160, 40, '#ffffff');
  cloud(ctx, 760, 110, 30, '#ffffff');
  ctx.fillStyle = '#8fc46a';
  ctx.beginPath(); ctx.moveTo(0, 560); ctx.quadraticCurveTo(400, 430, 1024, 540); ctx.lineTo(1024, 768); ctx.lineTo(0, 768); ctx.fill();
  ctx.fillStyle = '#6aa84f';
  ctx.beginPath(); ctx.moveTo(0, 640); ctx.quadraticCurveTo(600, 560, 1024, 650); ctx.lineTo(1024, 768); ctx.lineTo(0, 768); ctx.fill();
  // tree
  ctx.fillStyle = '#7a5230'; ctx.fillRect(760, 420, 26, 170);
  ctx.fillStyle = '#4f9a45';
  for (const [x, y, rr] of [[773, 400, 80], [720, 440, 60], [830, 445, 62], [773, 340, 60]]) { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill(); }
  // neighbour roof + fence
  ctx.fillStyle = '#c0504d'; ctx.beginPath(); ctx.moveTo(120, 520); ctx.lineTo(260, 430); ctx.lineTo(400, 520); ctx.fill();
  ctx.fillStyle = '#f3ead8'; ctx.fillRect(150, 520, 220, 110);
  ctx.fillStyle = '#ffffff';
  for (let x = 0; x < 1024; x += 34) ctx.fillRect(x, 640, 16, 90);
  ctx.fillRect(0, 665, 1024, 10);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function kidDrawing() {
  const [c, ctx] = canvas(512, 384);
  ctx.fillStyle = '#fffdf6'; ctx.fillRect(0, 0, 512, 384);
  ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.strokeStyle = '#f2b400'; ctx.beginPath(); ctx.arc(420, 80, 40, 0, 7); ctx.stroke();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(420 + Math.cos(a) * 52, 80 + Math.sin(a) * 52); ctx.lineTo(420 + Math.cos(a) * 72, 80 + Math.sin(a) * 72); ctx.stroke(); }
  ctx.strokeStyle = '#d63b2f'; ctx.beginPath(); ctx.moveTo(110, 200); ctx.lineTo(200, 120); ctx.lineTo(290, 200); ctx.stroke();
  ctx.strokeStyle = '#2d6cc0'; ctx.strokeRect(125, 200, 150, 120);
  ctx.strokeStyle = '#2e9c4b'; ctx.beginPath(); ctx.moveTo(0, 330); ctx.quadraticCurveTo(256, 300, 512, 335); ctx.stroke();
  ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.arc(370, 245, 18, 0, 7); ctx.moveTo(370, 263); ctx.lineTo(370, 310); ctx.moveTo(345, 280); ctx.lineTo(395, 280); ctx.moveTo(370, 310); ctx.lineTo(352, 335); ctx.moveTo(370, 310); ctx.lineTo(388, 335); ctx.stroke();
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function spacePoster() {
  const [c, ctx] = canvas(384, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#0c1a3a'); g.addColorStop(1, '#2b1a4f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 384, 512);
  const r = rng(21);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 140; i++) ctx.fillRect(r() * 384, r() * 512, 2, 2);
  const planet = (x, y, rr, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill(); };
  planet(120, 160, 70, '#e8a33d');
  ctx.strokeStyle = '#f6d58c'; ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(120, 160, 110, 24, -0.3, 0, 7); ctx.stroke();
  planet(290, 330, 40, '#4aa3df');
  planet(90, 400, 22, '#d9534f');
  ctx.fillStyle = '#ffd34d'; ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('TO SPACE!', 192, 480);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// Flower heads. `uvGuide` paints what the flower looks like in ultraviolet:
// bright petal tips, a dark "bullseye" toward the centre. Real flowers like
// Rudbeckia and sunflowers carry exactly this pattern, invisible to us.
export function flowerHead({ petals = 16, petal = '#f6c21c', centre = '#5a3410', uvGuide = false, daisy = false } = {}) {
  const [c, ctx] = canvas(512, 512);
  ctx.clearRect(0, 0, 512, 512);
  ctx.translate(256, 256);
  for (let i = 0; i < petals; i++) {
    ctx.save();
    ctx.rotate(i / petals * Math.PI * 2);
    if (uvGuide) {
      const g = ctx.createLinearGradient(0, 0, 0, -250);
      g.addColorStop(0, '#000'); g.addColorStop(0.45, '#0a0a0a'); g.addColorStop(0.62, '#e8e8e8'); g.addColorStop(1, '#ffffff');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = petal;
    }
    ctx.beginPath();
    ctx.ellipse(0, -150, daisy ? 30 : 38, 105, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!uvGuide) {
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(0, -235); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.fillStyle = uvGuide ? '#050505' : centre;
  ctx.beginPath(); ctx.arc(0, 0, daisy ? 46 : 70, 0, Math.PI * 2); ctx.fill();
  if (!uvGuide) {
    const r = rng(9);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 160; i++) { const a = r() * 7, d = r() * (daisy ? 42 : 64); ctx.fillRect(Math.cos(a) * d, Math.sin(a) * d, 4, 4); }
  }
  const t = new THREE.CanvasTexture(c);
  if (!uvGuide) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function starSticker() {
  const [c, ctx] = canvas(128, 128);
  ctx.translate(64, 64);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? 24 : 58, a = i / 10 * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function wallClock() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(128, 128, 124, 0, 7); ctx.fill();
  ctx.fillStyle = '#222'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2 - Math.PI / 2; ctx.fillText(String(i), 128 + Math.cos(a) * 95, 128 + Math.sin(a) * 95); }
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// ---------------------------------------------------------------- sunflowers
// One petal: yellow for us; in UV the base is dark and the tip bright (the "bullseye").
export function petal(uv = false) {
  const [c, ctx] = canvas(64, 256);
  ctx.clearRect(0, 0, 64, 256);
  ctx.beginPath();
  ctx.moveTo(32, 256);
  ctx.bezierCurveTo(-4, 190, 6, 40, 32, 2);
  ctx.bezierCurveTo(58, 40, 68, 190, 32, 256);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 256, 0, 0);
  if (uv) { g.addColorStop(0, '#050505'); g.addColorStop(0.45, '#0a0a0a'); g.addColorStop(0.62, '#d8d8d8'); g.addColorStop(1, '#ffffff'); }
  else { g.addColorStop(0, '#d98b06'); g.addColorStop(0.3, '#f2b50f'); g.addColorStop(1, '#f9cf2e'); }
  ctx.fillStyle = g; ctx.fill();
  if (!uv) {
    ctx.strokeStyle = 'rgba(160,90,0,0.25)'; ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(32 + i * 3, 250); ctx.quadraticCurveTo(32 + i * 7, 120, 32 + i * 2, 12); ctx.stroke(); }
  }
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function seedHead() {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#2a1608'; ctx.fillRect(0, 0, 512, 512);
  // Fibonacci spiral of florets
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 1400; i++) {
    const r = Math.sqrt(i / 1400) * 250, a = i * golden;
    const x = 256 + Math.cos(a) * r, y = 256 + Math.sin(a) * r;
    const k = r / 250;
    ctx.fillStyle = `rgb(${70 + k * 60},${38 + k * 30},${12 + k * 8})`;
    ctx.beginPath(); ctx.arc(x, y, 3.2 + k * 1.6, 0, Math.PI * 2); ctx.fill();
  }
  return tex(c);
}

export function leaf() {
  const [c, ctx] = canvas(128, 192);
  ctx.clearRect(0, 0, 128, 192);
  ctx.beginPath();
  ctx.moveTo(64, 190);
  ctx.bezierCurveTo(0, 150, 0, 60, 64, 2);
  ctx.bezierCurveTo(128, 60, 128, 150, 64, 190);
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, '#3f6a24'); g.addColorStop(0.5, '#5d8a35'); g.addColorStop(1, '#3f6a24');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(200,230,150,0.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(64, 188); ctx.lineTo(64, 10); ctx.stroke();
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) { const y = 160 - i * 20; ctx.beginPath(); ctx.moveTo(64, y); ctx.lineTo(20, y - 22); ctx.moveTo(64, y); ctx.lineTo(108, y - 22); ctx.stroke(); }
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
