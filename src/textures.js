// Canvas textures, kept only for the few things that must be drawn in code:
//   - the eye chart (its letters are the acuity test),
//   - the sunflower petals and leaves (the petal's UV "bullseye" map is the bee test),
//   - soft contact-shadow masks under furniture.
// Everything else in the room uses photoscanned Poly Haven models and PBR textures.
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

function tex(c, { srgb = true, clamp = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Paper: an uneven off-white ground, a haze of fibres, a little foxing.
function paperGround(ctx, w, h, r, base = [246, 242, 232]) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  // low-frequency cloudiness from a coarse random grid, bilinearly sampled
  const G = 24, grid = Array.from({ length: (G + 1) * (G + 1) }, () => r());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = x / w * G, gy = y / h * G, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const a = grid[iy * (G + 1) + ix], b = grid[iy * (G + 1) + ix + 1], c = grid[(iy + 1) * (G + 1) + ix], e = grid[(iy + 1) * (G + 1) + ix + 1];
    const cloud = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy;
    const n = (cloud - 0.5) * 7 + (r() - 0.5) * 6;
    const i = (y * w + x) * 4;
    d[i] = base[0] + n; d[i + 1] = base[1] + n; d[i + 2] = base[2] + n * 1.2; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // fibres: thousands of short, faint curved strokes
  ctx.lineCap = 'round';
  for (let i = 0; i < w * h / 900; i++) {
    const x = r() * w, y = r() * h, l = 6 + r() * 26, a = r() * Math.PI * 2, k = (r() - 0.5) * 0.6;
    ctx.strokeStyle = r() < 0.5 ? `rgba(120,105,80,${0.025 + r() * 0.05})` : `rgba(255,255,250,${0.05 + r() * 0.08})`;
    ctx.lineWidth = 0.6 + r() * 0.9;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + k) * l * 0.5, y + Math.sin(a + k) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  // foxing and a faint water mark near one corner
  for (let i = 0; i < 26; i++) {
    const x = r() * w, y = r() * h, s = 2 + r() * 7;
    const g = ctx.createRadialGradient(x, y, 0, x, y, s);
    g.addColorStop(0, `rgba(150,110,60,${0.08 + r() * 0.12})`); g.addColorStop(1, 'rgba(150,110,60,0)');
    ctx.fillStyle = g; ctx.fillRect(x - s, y - s, s * 2, s * 2);
  }
  const g = ctx.createRadialGradient(w * 0.88, h * 0.93, w * 0.02, w * 0.88, h * 0.93, w * 0.16);
  g.addColorStop(0, 'rgba(170,140,90,0)'); g.addColorStop(0.85, 'rgba(170,140,90,0.06)'); g.addColorStop(1, 'rgba(170,140,90,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

// Tumbling-E acuity chart printed on matte paper: the sharpest test in the room.
export function eyeChart() {
  const W = 2048, H = 2880;
  const [c, ctx] = canvas(W, H);
  const r = rng(5);
  paperGround(ctx, W, H, r);
  const ink = 'rgba(18,17,16,0.94)';
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.font = '600 92px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('VISUAL ACUITY · 视力表', W / 2, 190);
  ctx.font = '400 40px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = 'rgba(18,17,16,0.7)';
  ctx.fillText('5 m', W / 2, 260);
  let y = 360;
  const sizes = [440, 300, 220, 160, 118, 88, 64, 46, 34];
  const labels = ['0.1', '0.15', '0.2', '0.3', '0.4', '0.5', '0.6', '0.8', '1.0'];
  sizes.forEach((s, row) => {
    const n = Math.min(8, Math.max(1, Math.floor(1640 / (s * 1.7))));
    const total = n * s * 1.7 - s * 0.7;
    ctx.fillStyle = ink;
    for (let i = 0; i < n; i++) drawE(ctx, W / 2 - total / 2 + i * s * 1.7, y, s, Math.floor(r() * 4));
    ctx.fillStyle = 'rgba(18,17,16,0.55)';
    ctx.font = '400 34px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(labels[row], 70, y + s / 2 + 12);
    ctx.textAlign = 'center';
    y += s * 1.42 + 22;
  });
  // printer's registration line and a pencil tick someone left by the 0.8 row
  ctx.strokeStyle = 'rgba(18,17,16,0.35)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(140, H - 120); ctx.lineTo(W - 140, H - 120); ctx.stroke();
  ctx.strokeStyle = 'rgba(70,70,75,0.55)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(1880, y - 210); ctx.lineTo(1900, y - 190); ctx.lineTo(1940, y - 250); ctx.stroke();
  return tex(c);
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

// ---------------------------------------------------------------- sunflowers
// One ray petal, as a 1:3 strip. Visible: warm yellow with fine parallel veins and a
// darker, slightly bruised base. UV (uv=true): dark base, bright tip, the bee's bullseye.
// The UV ramp is unchanged from v2/v3; only the resolution and petal outline are new.
export function petal(uv = false) {
  const W = 704, H = 2048;
  const [c, ctx] = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(W * 0.5, H);
    ctx.bezierCurveTo(W * 0.08, H * 0.82, W * 0.02, H * 0.25, W * 0.36, H * 0.03);
    ctx.quadraticCurveTo(W * 0.5, H * 0.07, W * 0.6, H * 0.01);
    ctx.bezierCurveTo(W * 0.98, H * 0.22, W * 0.94, H * 0.8, W * 0.5, H);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(0, H, 0, 0);
  if (uv) { g.addColorStop(0, '#050505'); g.addColorStop(0.45, '#0a0a0a'); g.addColorStop(0.62, '#d8d8d8'); g.addColorStop(1, '#ffffff'); }
  else { g.addColorStop(0, '#b86a06'); g.addColorStop(0.12, '#d98e08'); g.addColorStop(0.35, '#eeb012'); g.addColorStop(1, '#f6c62a'); }
  // the petal mesh carries the outline itself, so the map fills the whole strip
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (!uv) {
    ctx.save();
    const r = rng(31);
    // parallel veins converging at the base
    for (let i = 0; i < 46; i++) {
      const t = i / 45 - 0.5;
      ctx.strokeStyle = r() < 0.5 ? `rgba(150,82,0,${0.10 + r() * 0.1})` : `rgba(255,236,150,${0.08 + r() * 0.1})`;
      ctx.lineWidth = 2 + r() * 3;
      ctx.beginPath(); ctx.moveTo(W * 0.5 + t * W * 0.1, H);
      ctx.bezierCurveTo(W * 0.5 + t * W * 0.7, H * 0.7, W * 0.5 + t * W * 0.9, H * 0.3, W * 0.5 + t * W * 0.8, 0);
      ctx.stroke();
    }
    // mottling and a browned, dried edge near the tip
    for (let i = 0; i < 900; i++) {
      const x = r() * W, y = r() * H, s = 4 + r() * 18;
      ctx.fillStyle = r() < 0.5 ? `rgba(200,120,0,${r() * 0.06})` : `rgba(255,240,170,${r() * 0.06})`;
      ctx.fillRect(x, y, s, s * 2.5);
    }
    // browned, drying margins
    for (const x of [0, W]) { const e = ctx.createLinearGradient(x, 0, W / 2, 0); e.addColorStop(0, 'rgba(150,85,10,0.45)'); e.addColorStop(0.18, 'rgba(150,85,10,0)'); ctx.fillStyle = e; ctx.fillRect(0, 0, W, H * 0.35); }
    ctx.restore();
  }
  return tex(c, { srgb: !uv });
}

// Sunflower leaf: dark green, netted veins, serrated outline (alpha-tested).
export function leaf() {
  const W = 1024, H = 1536;
  const [c, ctx] = canvas(W, H);
  const r = rng(17);
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  ctx.moveTo(W * 0.5, H);
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const wdt = Math.sin(Math.pow(t, 0.75) * Math.PI) * (1 - t * 0.25) * 0.47;
    pts.push([wdt + (i % 2 ? 0.012 : 0) * (1 - t), t]);
  }
  for (const [x, t] of pts) ctx.lineTo(W * (0.5 - x), H * (1 - t));
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(W * (0.5 + pts[i][0]), H * (1 - pts[i][1]));
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#2f4d1b'); g.addColorStop(0.5, '#47702a'); g.addColorStop(1, '#2f4d1b');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  for (let i = 0; i < 2600; i++) {
    const x = r() * W, y = r() * H, s = 3 + r() * 14;
    ctx.fillStyle = r() < 0.5 ? `rgba(20,40,10,${r() * 0.12})` : `rgba(140,170,80,${r() * 0.08})`;
    ctx.fillRect(x, y, s, s);
  }
  ctx.strokeStyle = 'rgba(170,200,120,0.55)'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(W / 2, H); ctx.quadraticCurveTo(W * 0.52, H * 0.5, W / 2, H * 0.04); ctx.stroke();
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(160,190,110,0.4)';
  for (let i = 0; i < 9; i++) {
    const y = H * (0.88 - i * 0.09);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(W / 2, y); ctx.quadraticCurveTo(W / 2 + s * W * 0.18, y - H * 0.04, W / 2 + s * W * 0.4, y - H * 0.12); ctx.stroke(); }
  }
  ctx.restore();
  return tex(c);
}

// Soft contact-shadow mask (white = full shadow) used as an alphaMap under furniture.
export function contactShadow() {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  ctx.filter = 'blur(26px)';
  ctx.fillStyle = '#fff'; ctx.fillRect(52, 52, S - 104, S - 104);
  ctx.filter = 'none';
  return tex(c, { srgb: false });
}
