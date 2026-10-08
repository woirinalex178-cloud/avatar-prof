// Reconnaissance d'une carte par photo, 100 % dans le navigateur (gratuit).
// 1) cadrage au format carte (caméra en direct ou photo), 2) lecture du numéro et du nom par zones,
// 3) recherche des candidats, 4) classement par ressemblance visuelle avec l'image officielle.
import { SUPABASE_URL } from './config.js';
import { toCanvas, gridVec, corr } from './auth.js';

const CW = 900, CH = 1257; // carte 63 x 88 mm, assez de pixels pour lire le petit numéro

// ---------- caméra ----------
export async function startCam(video, frame) {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
  catch { return null; }
  video.srcObject = stream; await video.play().catch(() => { });
  const stop = () => stream.getTracks().forEach(t => t.stop());
  const watch = setInterval(() => { if (!video.isConnected) { stop(); clearInterval(watch); } }, 500); // fenêtre fermée : on coupe la caméra
  // découpe exactement le cadre affiché (la vidéo est en object-fit: cover)
  // raw = même zone avec 10 % de marge, en pleine résolution : c'est elle qu'on envoie à l'IA (petits caractères lisibles)
  const capture = (raw = false) => {
    const vr = video.getBoundingClientRect(), fr = frame.getBoundingClientRect(), vw = video.videoWidth, vh = video.videoHeight;
    const k = Math.max(vr.width / vw, vr.height / vh), ox = (vr.width - vw * k) / 2, oy = (vr.height - vh * k) / 2;
    const sx = (fr.left - vr.left - ox) / k, sy = (fr.top - vr.top - oy) / k, sw = fr.width / k, sh = fr.height / k;
    const cv = Object.assign(document.createElement('canvas'), { width: CW, height: CH });
    cv.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, CW, CH);
    if (raw) {
      const mx = sw * .1, my = sh * .1, x0 = Math.max(0, sx - mx), y0 = Math.max(0, sy - my), x1 = Math.min(vw, sx + sw + mx), y1 = Math.min(vh, sy + sh + my);
      cv.raw = Object.assign(document.createElement('canvas'), { width: Math.round(x1 - x0), height: Math.round(y1 - y0) });
      cv.raw.getContext('2d').drawImage(video, x0, y0, x1 - x0, y1 - y0, 0, 0, cv.raw.width, cv.raw.height);
    }
    return cv;
  };
  return { capture, stop };
}

// repère la carte dans une photo : ce qui se détache du fond (couleur des bords de la photo)
export function findCard(src, W, H) {
  const w = 200, h = Math.max(1, Math.round(200 * H / W)), c = Object.assign(document.createElement('canvas'), { width: w, height: h }), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data, border = [];
  for (let i = 0; i < w; i++) border.push(i * 4, ((h - 1) * w + i) * 4); for (let j = 0; j < h; j++) border.push(j * w * 4, (j * w + w - 1) * 4);
  const med = k => { const v = border.map(i => d[i + k]).sort((a, b) => a - b); return v[v.length >> 1]; }, bg = [med(0), med(1), med(2)];
  const rows = new Array(h).fill(0), cols = new Array(w).fill(0);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const o = (j * w + i) * 4; if (Math.abs(d[o] - bg[0]) + Math.abs(d[o + 1] - bg[1]) + Math.abs(d[o + 2] - bg[2]) > 60) { rows[j]++; cols[i]++; } }
  const span = (a, n, t) => { let s = a.findIndex(v => v > n * t), e = a.length - 1 - [...a].reverse().findIndex(v => v > n * t); return s < 0 ? null : [s, e]; };
  const ry = span(rows, w, .2), rx = span(cols, h, .2); if (!ry || !rx) return null;
  const bw = (rx[1] - rx[0] + 1) / w, bh = (ry[1] - ry[0] + 1) / h; if (bw * bh < .05 || bw * bh > .97) return null;
  return { x: rx[0] / w * W, y: ry[0] / h * H, w: bw * W, h: bh * H };
}
// photo de la galerie : on cherche la carte, sinon recadrage centré au format carte
export async function fileToCard(file) {
  const bmp = await createImageBitmap(file), r = CW / CH, box = findCard(bmp, bmp.width, bmp.height);
  let { x: sx, y: sy, w: sw, h: sh } = box || { x: 0, y: 0, w: bmp.width, h: bmp.height };
  if (sw / sh > r) { const n = sw / r; sy -= (n - sh) / 2; sh = n; } else { const n = sh * r; sx -= (n - sw) / 2; sw = n; } // au format carte, autour de la carte
  const cv = Object.assign(document.createElement('canvas'), { width: CW, height: CH });
  cv.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, CW, CH);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)); // photo d'origine pour l'IA
  cv.raw = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  cv.raw.getContext('2d').drawImage(bmp, 0, 0, cv.raw.width, cv.raw.height);
  cv.found = !!box;
  return cv;
}
export const toBlob = cv => new Promise(r => cv.toBlob(r, 'image/jpeg', .9));

// ---------- lecture par zones ----------
// zone agrandie en niveaux de gris, contraste étiré ; texte toujours foncé sur fond clair (Tesseract binarise mieux lui-même)
function zone(src, x0, y0, x1, y1, k = 2) {
  const w = Math.round((x1 - x0) * CW * k), h = Math.round((y1 - y0) * CH * k);
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h }), cx = cv.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingQuality = 'high'; cx.filter = 'grayscale(1)';
  cx.drawImage(src, x0 * CW, y0 * CH, (x1 - x0) * CW, (y1 - y0) * CH, 0, 0, w, h);
  const im = cx.getImageData(0, 0, w, h), d = im.data, hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
  const n = d.length / 4, pct = q => { let c = 0; for (let t = 0; t < 256; t++) { c += hist[t]; if (c >= n * q) return t; } return 255; };
  const lo = pct(.02), hi = pct(.98), mid = pct(.5), inv = mid < (lo + hi) / 2; // fond sombre : on inverse
  for (let i = 0; i < d.length; i += 4) { let v = Math.max(0, Math.min(255, (d[i] - lo) * 255 / Math.max(1, hi - lo))); if (inv) v = 255 - v; d[i] = d[i + 1] = d[i + 2] = v; }
  cx.putImageData(im, 0, 0);
  return cv;
}

let worker;
async function ocr(H, cv, whitelist, psm = '7') {
  await H.loadTesseract();
  if (!worker) worker = await Tesseract.createWorker('eng');
  await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: whitelist || '' });
  const { data: { text } } = await worker.recognize(cv);
  return text.trim();
}

// « 199/165 », « 199 165 » ou « 1991165 » (barre lue comme un chiffre) -> candidats { num, total }
export function numCandidates(text, totals) {
  const out = [], add = (n, t) => { n = String(+n); if (+n > 0 && !out.some(o => o.num === n && o.total === +t)) out.push({ num: n, total: +t }); };
  // total lu inconnu (ex. 202) : on essaie les totaux de séries à un chiffre près (102)
  const near = t => [...totals].filter(T => String(T).length === t.length && [...t].filter((ch, i) => ch !== String(T)[i]).length === 1);
  for (const m of text.matchAll(/(\d{1,3})\s*\/\s*(\d{2,3})/g)) { if (totals.has(+m[2])) add(m[1], m[2]); else { near(m[2]).forEach(T => add(m[1], T)); add(m[1], m[2]); } }
  if (out.length) return out;
  for (const m of text.matchAll(/(\d{1,3})\s+(\d{2,3})(?!\d)/g)) if (totals.has(+m[2])) add(m[1], m[2]);
  for (const s of text.match(/\d{4,7}/g) || []) for (let i = 1; i < s.length - 1; i++) {
    for (const cut of [1, 0]) { const a = s.slice(0, i), b = s.slice(i + cut);
      if (a.length <= 3 && b.length >= 2 && b.length <= 3 && totals.has(+b) && +a <= +b + 150) add(a, b); }
  }
  return out.slice(0, 3);
}

export async function readCard(cv, H) {
  // numéro : en bas à gauche (cartes récentes) ou à droite (anciennes) ; texte libre puis chiffres seuls
  let text = '';
  const found = () => numCandidates(text, H.totals()).length;
  for (const [x0, x1] of [[.04, .5], [.5, .96]]) {
    for (const [y0, y1, wl] of [[.89, .975, ''], [.89, .975, '0123456789/'], [.86, .99, '']]) {
      text += ' ' + await ocr(H, zone(cv, x0, y0, x1, y1), wl, '11'); if (found()) break;
    }
    if (found()) break;
  }
  const name = await ocr(H, zone(cv, .05, .025, .72, .115, 2));
  const words = (name.match(/[A-Za-zÀ-ÿ-]{4,}/g) || []).filter(w => !/^(basic|base|stage|niveau|level|pokemon|pokémon)$/i.test(w)).slice(0, 4);
  return { nums: numCandidates(text, H.totals()), words, raw: text.trim() + ' | ' + name };
}

// ---------- ressemblance visuelle ----------
const refs = new Map(); // empreintes des images officielles déjà chargées (utile en rafale)
function refVec(c) {
  if (!c.image) return null;
  if (!refs.has(c.image)) refs.set(c.image, fetch(`${SUPABASE_URL}/functions/v1/img?u=${encodeURIComponent(c.image + '/low.webp')}`)
    .then(async r => r.ok ? gridVec(await toCanvas(await r.blob())) : null).catch(() => null));
  return refs.get(c.image);
}
const art = id => id.replace(/^[a-z]{2}:/, '').toLowerCase(); // même illustration dans toutes les langues
export async function rank(cards, cv, lang) {
  const me = gridVec(await toCanvas(cv));
  const sims = await Promise.all(cards.map(async c => { const v = await refVec(c); return v ? corr(me, v) : -1; }));
  const list = cards.map((c, i) => ({ ...c, sim: sims[i] })).sort((a, b) => (b.sim + b.score * .02 + (b.lang === lang ? .03 : 0)) - (a.sim + a.score * .02 + (a.lang === lang ? .03 : 0)));
  const top = list[0], rival = list.find(c => art(c.id) !== art(top?.id || '') && (c.lang !== 'ja' || top.lang === 'ja')); // l'édition japonaise partage souvent l'illustration
  const seen = list.some(c => c.sim > -1);
  const sure = !!top && (seen ? top.sim >= .6 && (!rival || top.sim - rival.sim >= .05) : !rival);
  return { list, sure, art };
}

// ---------- rafale : la carte a-t-elle bougé / changé ? ----------
export function thumb(cv) { // miniature 24x34 en niveaux de gris
  const t = Object.assign(document.createElement('canvas'), { width: 24, height: 34 }), x = t.getContext('2d', { willReadFrequently: true });
  x.drawImage(cv, 0, 0, 24, 34); const d = x.getImageData(0, 0, 24, 34).data, g = new Float32Array(24 * 34);
  for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
  return g;
}
export const frameDiff = (a, b) => { if (!a || !b) return 255; let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
// image presque unie (pochette vide, table) : pas de carte
export const isBlank = g => { let m = 0; for (const v of g) m += v; m /= g.length; let s = 0; for (const v of g) s += (v - m) ** 2; return Math.sqrt(s / g.length) < 14; };

// ---------- page de classeur 3 x 3 ----------
export async function splitPage(file, cols = 3, rows = 3) {
  const bmp = await createImageBitmap(file), cells = [], cw = bmp.width / cols, ch = bmp.height / rows, mx = cw * .04, my = ch * .03;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cv = Object.assign(document.createElement('canvas'), { width: CW, height: CH });
    cv.getContext('2d').drawImage(bmp, c * cw + mx, r * ch + my, cw - 2 * mx, ch - 2 * my, 0, 0, CW, CH);
    cells.push(cv);
  }
  return cells;
}
