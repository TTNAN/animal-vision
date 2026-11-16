import { SPECIES, LIGHTS, SAMPLES, UI } from './species.js';
import { Renderer, lightFor } from './gl.js';

const $ = (id) => document.getElementById(id);
const byId = (list, id) => list.find((x) => x.id === id);
const qs = new URLSearchParams(location.search);

const state = {
  lang: qs.get('lang') || (/^zh/i.test(navigator.language) ? 'zh' : 'en'),
  img: byId(SAMPLES, qs.get('img')) ? qs.get('img') : 'orchard',
  eye: qs.get('eye') && byId(SPECIES, qs.get('eye')) && qs.get('eye') !== 'human' ? qs.get('eye') : null,
  light: byId(LIGHTS, qs.get('light')) ? qs.get('light') : null,
  view: qs.get('view') === 'grid' ? 'grid' : 'compare',
  split: qs.has('split') ? Math.min(1, Math.max(0, parseFloat(qs.get('split')))) : 0.5,
  loupe: null, loupeOn: true, facets: true,
  imgW: 3840, imgH: 2561, upload: null,
};
const sample0 = byId(SAMPLES, state.img);
state.eye ??= sample0.eye;
state.light ??= sample0.light;

const stage = $('stage'), canvas = $('view'), divider = $('divider'), loupeEl = $('loupe');
let R = null;
try { R = new Renderer(canvas); } catch (e) { $('nogl').hidden = false; }
const T = () => UI[state.lang];
const eyeSp = () => byId(SPECIES, state.eye);
const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
const isMobile = () => matchMedia('(max-width: 720px)').matches;
const gridShape = () => (isMobile() ? [2, 3] : [3, 2]);

/* ---------------- layout ---------------- */
let css = { w: 0, h: 0 };
function layout() {
  const col = stage.parentElement;
  const avail = getComputedStyle(col).display === 'contents' ? col.parentElement.clientWidth : col.clientWidth;
  const [cols, rows] = gridShape();
  const aspect = state.view === 'grid' ? (cols * state.imgW) / (rows * state.imgH) : state.imgW / state.imgH;
  const top = stage.getBoundingClientRect().top + scrollY;
  const maxH = Math.max(260, isMobile() ? innerHeight * 0.62 : Math.min(innerHeight * 0.8, innerHeight - Math.min(top, 260) - 86));
  const w = Math.floor(Math.min(avail, maxH * aspect));
  const h = Math.floor(w / aspect);
  css = { w, h };
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  document.documentElement.style.setProperty('--stageW', w + 'px');
  document.documentElement.style.setProperty('--stageH', h + 'px');
  if (R) { canvas.width = Math.round(w * DPR()); canvas.height = Math.round(h * DPR()); }
  placeDivider();
  placeGridTags();
  draw();
}

function tiles(W, H) {
  const [cols, rows] = gridShape();
  const gap = Math.round(2 * (W / css.w));
  const tw = (W - gap * (cols - 1)) / cols, th = (H - gap * (rows - 1)) / rows;
  return SPECIES.map((sp, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = Math.round(c * (tw + gap)), yTop = Math.round(r * (th + gap));
    return { sp, x, y: Math.round(H - yTop - th), w: Math.round(tw), h: Math.round(th), cssX: (x / W) * css.w, cssY: (yTop / H) * css.h, cssW: (tw / W) * css.w, cssH: (th / H) * css.h };
  });
}

/* ---------------- drawing ---------------- */
let time = 0, raf = 0;
const L = () => byId(LIGHTS, state.light).L;

function render(fb, W, H, scaleMul = 1, withLoupe = true) {
  const gl = R.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.disable(gl.SCISSOR_TEST);
  gl.viewport(0, 0, W, H);
  gl.clearColor(0.03, 0.03, 0.035, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  const scale = (W / css.w) * scaleMul;
  const base = { L: L(), time, facets: state.facets, outFb: fb, scale };
  if (state.view === 'grid') {
    for (const t of tiles(W, H)) R.drawEye(t.sp, t, base);
    return;
  }
  const rect = { x: 0, y: 0, w: W, h: H };
  R.drawEye(SPECIES[0], rect, base);
  const sx = Math.round(state.split * W);
  let loupe = null;
  if (withLoupe && state.eye === 'eagle' && state.loupeOn && state.loupe) {
    const k = W / css.w;
    loupe = { x: state.loupe.x * k, y: H - state.loupe.y * k, r: state.loupe.r * k };
  }
  R.drawEye(eyeSp(), rect, { ...base, clip: [sx, W], loupe });
}

function draw() {
  if (!R || !R.src) return;
  render(null, canvas.width, canvas.height);
  const animated = state.light !== 'day';
  if (animated && !raf) {
    let last = 0;
    const tick = (now) => {
      raf = 0;
      if (state.light === 'day') return;
      if (now - last > 60) { time = (time + 0.137) % 1000; last = now; render(null, canvas.width, canvas.height); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
}

/* ---------------- images ---------------- */
let loadToken = 0;
function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
async function useSample(id, { keepEye = false } = {}) {
  const s = byId(SAMPLES, id);
  const tok = ++loadToken;
  state.img = id; state.upload = null;
  state.imgW = s.w; state.imgH = s.h;
  if (!keepEye) { state.eye = s.eye; state.light = s.light; }
  syncUI(); layout();
  $('loading').classList.add('on');
  try {
    const th = await loadImg(`assets/photos/${id}-thumb.jpg`);
    if (tok !== loadToken) return;
    R?.setImage(th); draw();
    const full = await loadImg(`assets/photos/${id}.jpg`);
    if (tok !== loadToken) return;
    R?.setImage(fit(full)); draw();
    window.__ready = (window.__ready || 0) + 1;
    document.body.classList.add('loaded');
  } finally { if (tok === loadToken) $('loading').classList.remove('on'); }
}

// Keep textures within the GPU limit (and 4096 px, plenty for any screen).
function fit(im) {
  const lim = Math.min(R ? R.maxTex : 4096, 4096);
  const w = im.width || im.naturalWidth, h = im.height || im.naturalHeight;
  if (Math.max(w, h) <= lim) return im;
  const k = lim / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(im, 0, 0, c.width, c.height);
  return c;
}

async function useFile(file) {
  if (!file || !/^image\//.test(file.type)) return;
  const tok = ++loadToken;
  $('loading').classList.add('on');
  try {
    let im;
    try { im = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { im = await loadImg(URL.createObjectURL(file)); }
    if (tok !== loadToken) return;
    const tex = fit(im);
    state.img = null; state.upload = file.name;
    state.imgW = tex.width; state.imgH = tex.height;
    R?.setImage(tex);
    const tile = $('uploadTile');
    if (tile.dataset.url) URL.revokeObjectURL(tile.dataset.url);
    tile.dataset.url = URL.createObjectURL(file);
    tile.style.background = `linear-gradient(rgba(0,0,0,.15), rgba(0,0,0,.75)), center / cover url("${tile.dataset.url}")`;
    syncUI(); layout();
    stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally { if (tok === loadToken) $('loading').classList.remove('on'); }
}

/* ---------------- UI ---------------- */
let prevView = null, prevLight = null;
const ML = { zh: ['光谱峰值', '清晰度', '弱光增益', '人'], en: ['Cone peaks', 'Acuity', 'Low-light gain', 'human'] };
function meters(sp) {
  const L = ML[state.lang];
  const x = (nm) => ((nm - 300) / 400 * 100).toFixed(2) + '%';
  const ticks = (sp.cones || []).map((nm) => `<i style="--x:${x(nm)}" title="${nm} nm"></i>`).join('');
  const lg = (m) => Math.log(60 / m) / Math.log(60 / 0.35);
  const acu = Math.max(0.03, lg(sp.mar)), hum = lg(1);
  const gain = Math.min(1, Math.log(1 + sp.gain) / Math.log(7)), hg = Math.log(2) / Math.log(7);
  return `<div class="meter"><div class="meter-h"><span>${L[0]}</span><em>${(sp.cones || []).join(' · ')} nm</em></div>
    <div class="spec"><span class="band"></span>${ticks}</div><div class="spec-scale"><span>300</span><span>UV · 380</span><span>500</span><span>700</span></div></div>
  <div class="meter has-mark"><div class="meter-h"><span>${L[1]}</span><em>${sp.mar}′</em></div><div class="rail"><b style="--v:${(acu * 100).toFixed(1)}%"></b><s style="--h:${(hum * 100).toFixed(1)}%" data-l="${L[3]}"></s></div></div>
  <div class="meter has-mark"><div class="meter-h"><span>${L[2]}</span><em>×${sp.gain}</em></div><div class="rail"><b style="--v:${(gain * 100).toFixed(1)}%"></b><s style="--h:${(hg * 100).toFixed(1)}%" data-l="${L[3]}"></s></div></div>`;
}
const ICONS = {
  compare: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4" width="15" height="12" rx="2"/><path d="M10 4v12"/></svg>',
  grid: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4" width="6.5" height="5.2" rx="1.2"/><rect x="11" y="4" width="6.5" height="5.2" rx="1.2"/><rect x="2.5" y="10.8" width="6.5" height="5.2" rx="1.2"/><rect x="11" y="10.8" width="6.5" height="5.2" rx="1.2"/></svg>',
};
function seg(el, items, cur, label, pick) {
  el.innerHTML = '';
  const pill = document.createElement('span'); pill.className = 'pill'; el.appendChild(pill);
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button'; b.role = 'radio';
    b.innerHTML = (it.icon || '') + `<span>${label(it)}</span>`;
    b.setAttribute('aria-label', label(it));
    b.setAttribute('aria-checked', it.id === cur);
    b.onclick = () => pick(it.id);
    el.appendChild(b);
  }
  requestAnimationFrame(() => {
    const on = el.querySelector('[aria-checked="true"]');
    if (on) { pill.style.left = on.offsetLeft + 'px'; pill.style.width = on.offsetWidth + 'px'; }
  });
}

function buildEyes() {
  const el = $('eyes'); el.innerHTML = '';
  SPECIES.forEach((sp) => {
    const b = document.createElement('button');
    b.type = 'button'; b.role = 'tab'; b.className = 'eye' + (sp.id === 'human' ? ' human' : '');
    b.style.setProperty('--c', sp.accent);
    b.innerHTML = `<b>${sp.name[state.lang]}</b><i>${sp.name.en === sp.name[state.lang] ? '' : sp.name.en}</i>`;
    b.setAttribute('aria-selected', sp.id === state.eye);
    b.onclick = () => setEye(sp.id);
    el.appendChild(b);
  });
}

function buildThumbs() {
  const el = $('thumbs');
  el.querySelectorAll('.thumb').forEach((n) => n.remove());
  const up = $('uploadTile');
  for (const s of SAMPLES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'thumb' + (s.id === state.img ? ' on' : '');
    b.innerHTML = `<img src="assets/photos/${s.id}-thumb.jpg" alt="" loading="lazy"><span>${s.title[state.lang]}</span>`;
    b.onclick = () => { useSample(s.id); stage.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    el.insertBefore(b, up);
  }
  up.classList.toggle('on', !!state.upload);
}

function setEye(id) {
  if (id === 'human' && state.view !== 'grid') return;
  state.eye = id === 'human' ? state.eye : id;
  if (state.view === 'grid') state.view = 'compare';
  syncUI(); layout();
}

function placeDivider() {
  divider.style.left = state.split * 100 + '%';
  divider.setAttribute('aria-valuenow', Math.round(state.split * 100));
  $('tagL').style.opacity = state.split < 0.16 ? 0 : 1;
  $('tagR').style.opacity = state.split > 0.84 ? 0 : 1;
}

function placeGridTags() {
  const el = $('gridtags'); el.innerHTML = '';
  if (state.view !== 'grid') return;
  for (const t of tiles(css.w, css.h)) {
    const d = document.createElement('div');
    d.style.cssText = `left:${t.cssX}px;top:${t.cssY}px;width:${t.cssW}px;height:${t.cssH}px`;
    d.innerHTML = `<span>${t.sp.name[state.lang]}<i>${t.sp.latin}</i></span>`;
    el.appendChild(d);
  }
}

function syncUI() {
  const t = T(), sp = eyeSp();
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  document.documentElement.style.setProperty('--acc', sp.accent);
  $('lang').textContent = state.lang === 'zh' ? 'EN' : '中';
  $('tagline').textContent = t.tagline;
  $('eyebrow').innerHTML = `<b>Comparative Vision</b><span>${state.lang === 'zh' ? '六种视觉系统的比较' : 'Six visual systems, side by side'}</span>`;
  $('lede').textContent = t.lede;
  $('tagL').innerHTML = `${t.you}`;
  const tagR = $('tagR'), tagHTML = `${sp.name[state.lang]} <i>${sp.latin}</i>`;
  if (tagR.innerHTML !== tagHTML) { tagR.innerHTML = tagHTML; tagR.classList.remove('swap'); void tagR.offsetWidth; tagR.classList.add('swap'); }
  document.body.dataset.eye = sp.id; document.body.dataset.light = state.light;
  if (prevView !== null && (prevView !== state.view || prevLight !== state.light)) { stage.classList.remove('flash'); void stage.offsetWidth; stage.classList.add('flash'); }
  prevView = state.view; prevLight = state.light;
  $('saveText').textContent = t.download;
  $('dropText').textContent = t.dropHere;
  $('nogl').textContent = t.noGL;
  stage.classList.toggle('grid', state.view === 'grid');
  stage.classList.toggle('eagle', state.view !== 'grid' && state.eye === 'eagle');
  document.querySelector('.stage-wrap').classList.toggle('gridmode', state.view === 'grid');
  buildEyes();
  seg($('lights'), LIGHTS, state.light, (l) => l.name[state.lang], (id) => { state.light = id; syncUI(); draw(); });
  seg($('views'), [{ id: 'compare', icon: ICONS.compare }, { id: 'grid', icon: ICONS.grid }], state.view, (v) => t[v.id], (id) => { state.view = id; syncUI(); layout(); });

  // about this eye
  const about = $('about');
  const key = sp.id + state.lang;
  if (about.dataset.key !== key) {
    about.dataset.key = key;
    $('latin').textContent = sp.latin;
    $('spName').textContent = sp.name[state.lang];
    $('spLine').textContent = sp.line[state.lang];
    $('spCaveat').textContent = sp.caveat ? sp.caveat[state.lang] : '';
    $('facts').innerHTML = sp.facts[state.lang].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    const idx = SPECIES.indexOf(sp);
    $('spIdx').innerHTML = `<b>${String(idx + 1).padStart(2, '0')}</b> / ${String(SPECIES.length).padStart(2, '0')}`;
    $('spKind').textContent = state.lang === 'zh' ? '这双眼睛' : 'This eye';
    $('meters').innerHTML = meters(sp);
    for (const n of [about.querySelector('.about-top'), about.querySelector('.about-head'), $('meters'), $('facts')]) { n.classList.remove('swap'); void n.offsetWidth; n.classList.add('swap'); }
  }
  const opts = $('opts'); opts.innerHTML = '';
  const tog = (label, on, fn) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'toggle';
    b.setAttribute('aria-pressed', on); b.innerHTML = `<span class="sw"></span>${label}`;
    b.onclick = fn; opts.appendChild(b);
  };
  if (sp.id === 'eagle') tog(t.loupe, state.loupeOn, () => { state.loupeOn = !state.loupeOn; syncUI(); draw(); });
  if (sp.id === 'bee') tog(t.facets, state.facets, () => { state.facets = !state.facets; syncUI(); draw(); });

  // gallery + notes
  $('samplesH').textContent = t.samples;
  const s = byId(SAMPLES, state.img);
  $('hint').textContent = s ? s.hint[state.lang] : t.yours;
  $('uploadT').textContent = t.upload;
  $('uploadS').textContent = t.uploadSub;
  buildThumbs();
  $('sciH').textContent = t.scienceTitle;
  $('notes').innerHTML = t.notes.map(([k, v]) => `<div><b>${k}</b><p>${v}</p></div>`).join('');
  $('credits').innerHTML = `${t.credits} (CC0, Wikimedia Commons): ` + SAMPLES.map((x) => `<a href="${x.page}" target="_blank" rel="noopener">${x.title[state.lang]} · ${x.credit}</a>`).join(', ') + '.';
  if (!state.loupeOn || state.eye !== 'eagle' || state.view === 'grid') loupeEl.classList.remove('on');

  // shareable URL
  const p = new URLSearchParams();
  if (state.img) p.set('img', state.img);
  p.set('eye', state.eye); p.set('light', state.light);
  if (state.view === 'grid') p.set('view', 'grid');
  if (qs.get('lang')) p.set('lang', state.lang);
  history.replaceState(null, '', '?' + p.toString());
}

/* ---------------- interaction ---------------- */
let drag = null;
function local(e) { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function setSplit(x) { state.split = Math.min(1, Math.max(0, x / css.w)); placeDivider(); draw(); }
function moveLoupe(p, show) {
  const r = Math.round(Math.min(130, Math.max(70, css.w * 0.13)));
  if (!show || p.x < state.split * css.w) { state.loupe = null; loupeEl.classList.remove('on'); draw(); return; }
  state.loupe = { x: p.x, y: p.y, r };
  loupeEl.style.cssText = `left:${p.x - r}px;top:${p.y - r}px;width:${2 * r}px;height:${2 * r}px`;
  loupeEl.classList.add('on');
  draw();
}
const eagleLive = () => state.view !== 'grid' && state.eye === 'eagle' && state.loupeOn;

stage.addEventListener('pointerdown', (e) => {
  if (!R) return;
  const p = local(e);
  if (state.view === 'grid') {
    const t = tiles(css.w, css.h).find((t) => p.x >= t.cssX && p.x <= t.cssX + t.cssW && p.y >= t.cssY && p.y <= t.cssY + t.cssH);
    if (t) { state.view = 'compare'; if (t.sp.id !== 'human') state.eye = t.sp.id; syncUI(); layout(); }
    return;
  }
  const onLine = Math.abs(p.x - state.split * css.w) < 26;
  if (eagleLive() && !onLine && p.x > state.split * css.w && e.pointerType !== 'mouse') {
    drag = 'loupe'; moveLoupe(p, true);
  } else {
    drag = 'split'; stage.classList.add('dragging'); setSplit(p.x);
  }
  stage.setPointerCapture(e.pointerId);
  e.preventDefault();
});
let glowRaf = 0;
stage.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const cx = e.clientX, cy = e.clientY;
  cancelAnimationFrame(glowRaf);
  glowRaf = requestAnimationFrame(() => { const r = stage.getBoundingClientRect(); stage.style.setProperty('--mx', (cx - r.left) + 'px'); stage.style.setProperty('--my', (cy - r.top) + 'px'); });
});
stage.addEventListener('pointermove', (e) => {
  const p = local(e);
  if (drag === 'split') setSplit(p.x);
  if (drag === 'loupe' || (!drag && e.pointerType === 'mouse' && eagleLive())) moveLoupe(p, true);
  else if (drag === 'split' && eagleLive() && e.pointerType === 'mouse') moveLoupe(p, true);
});
const end = (e) => {
  if (drag === 'loupe') moveLoupe({ x: 0, y: 0 }, false);
  drag = null; stage.classList.remove('dragging');
};
stage.addEventListener('pointerup', end);
stage.addEventListener('pointercancel', end);
stage.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !drag) moveLoupe({ x: 0, y: 0 }, false); });

divider.addEventListener('keydown', (e) => {
  const d = e.shiftKey ? 0.1 : 0.02;
  if (e.key === 'ArrowLeft') { state.split = Math.max(0, state.split - d); placeDivider(); draw(); e.preventDefault(); }
  if (e.key === 'ArrowRight') { state.split = Math.min(1, state.split + d); placeDivider(); draw(); e.preventDefault(); }
});
addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 5) setEye(SPECIES[n].id);
  if (e.key === 'g') { state.view = state.view === 'grid' ? 'compare' : 'grid'; syncUI(); layout(); }
});

$('lang').onclick = () => { state.lang = state.lang === 'zh' ? 'en' : 'zh'; syncUI(); placeGridTags(); };
$('file').onchange = (e) => useFile(e.target.files[0]);
addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])].find((f) => /^image\//.test(f.type)); if (f) useFile(f); });
let dragDepth = 0;
addEventListener('dragenter', (e) => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; document.body.classList.add('dragover'); } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragover'); } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragover'); useFile(e.dataTransfer.files[0]); });

/* ---------------- save ---------------- */
$('save').onclick = () => {
  if (!R || !R.src) return;
  const outW = Math.min(2400, Math.max(1200, R.srcW));
  const outH = Math.round(outW * (css.h / css.w));
  const c = R.snapshot(outW, outH, (fb) => render(fb, outW, outH, 1, false));
  const ctx = c.getContext('2d');
  const k = outW / css.w;
  const font = (px, serif) => `${serif ? 'italic ' : '500 '}${Math.round(px * k)}px ${serif ? '"Instrument Serif", Georgia, serif' : 'Inter, "PingFang SC", sans-serif'}`;
  const pill = (text, x, y, alignRight) => {
    ctx.font = font(12);
    const w = ctx.measureText(text).width + 22 * k, h = 26 * k;
    const x0 = alignRight ? x - w : x;
    ctx.fillStyle = 'rgba(10,10,11,.55)';
    ctx.beginPath(); ctx.roundRect(x0, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = '#ece8e1'; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + 11 * k, y + h / 2 + 0.5 * k);
  };
  if (state.view === 'grid') {
    for (const t of tiles(outW, outH)) pill(t.sp.name[state.lang], t.x + 12 * k, outH - t.y - t.h + 12 * k);
  } else {
    const sx = state.split * outW;
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillRect(sx - 0.75 * k, 0, 1.5 * k, outH);
    if (state.split > 0.16) pill(T().you, 14 * k, 14 * k);
    if (state.split < 0.84) pill(`${eyeSp().name[state.lang]} · ${eyeSp().latin}`, outW - 14 * k, 14 * k, true);
  }
  ctx.font = font(15, true); ctx.fillStyle = 'rgba(236,232,225,.85)'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'right';
  ctx.fillText('Animal Vision · ttnan.github.io/animal-vision', outW - 16 * k, outH - 14 * k);
  c.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `animal-vision-${state.view === 'grid' ? 'all' : state.eye}.jpg`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/jpeg', 0.92);
};

/* ---------------- start ---------------- */
let rz = 0;
addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(layout); });
const io = new IntersectionObserver((es) => es.forEach((x) => x.isIntersecting && x.target.classList.add('in')), { threshold: 0.12 });
document.querySelectorAll('.science').forEach((n) => { n.classList.add('rv'); io.observe(n); });

syncUI();
useSample(state.img, { keepEye: true }).then(() => {
  if (qs.has('split') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // a short sweep so the line announces itself
  const t0 = performance.now(), from = 0.86, to = state.split;
  const step = (now) => {
    const u = Math.min(1, (now - t0) / 1400), e = 1 - Math.pow(1 - u, 4);
    state.split = from + (to - from) * e; placeDivider(); draw();
    if (u < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});
window.AV = { state, draw, layout, useSample, syncUI };
