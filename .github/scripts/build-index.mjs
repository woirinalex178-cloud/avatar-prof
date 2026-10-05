// Construit l'index de reconnaissance des cartes : une empreinte visuelle (DINOv2) par illustration.
// Lancé par GitHub Actions (gratuit). Sortie : table-des-doubles/idx/{meta.json, vec.bin, pca.bin, report.json}
import fs from 'fs';
import sharp from 'sharp';
import { pipeline, env, RawImage } from '@huggingface/transformers';
import { Matrix, EigenvalueDecomposition } from 'ml-matrix';

const MODEL = 'Xenova/dinov2-small', DTYPE = 'q8', DIM = 128, OUT = 'table-des-doubles/idx';
const LIMIT = +process.env.LIMIT || Infinity; // pour un essai rapide
const cfg = fs.readFileSync('table-des-doubles/config.js', 'utf8');
const SB = cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)[1], KEY = cfg.match(/SUPABASE_KEY\s*=\s*'([^']+)'/)[1];
env.allowLocalModels = false;

// zone de l'illustration (identique dans toutes les langues) : même découpe que dans l'appli (scan.js)
export const ART = { x0: .08, y0: .09, x1: .92, y1: .53 }, SIDE = 256;
async function artFromBuffer(buf) {
  const img = sharp(buf).rotate(), m = await img.metadata(), W = m.width, H = m.height;
  const left = Math.round(ART.x0 * W), top = Math.round(ART.y0 * H), width = Math.round((ART.x1 - ART.x0) * W), height = Math.round((ART.y1 - ART.y0) * H);
  const { data, info } = await sharp(buf).extract({ left, top, width, height }).resize(SIDE, SIDE, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3);
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
async function getJSON(u) { for (let i = 0; i < 5; i++) { try { const r = await fetch(u, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }); if (r.ok) return r.json(); } catch { } await new Promise(r => setTimeout(r, 2000 * (i + 1))); } throw new Error('fetch ' + u); }
async function getBuf(u) { for (let i = 0; i < 4; i++) { try { const r = await fetch(u); if (r.ok) return Buffer.from(await r.arrayBuffer()); if (r.status === 404) return null; } catch { } await new Promise(r => setTimeout(r, 1500 * (i + 1))); } return null; }

// 1) une image par illustration : clé = id sans la langue ; anglais > japonais > français > autres
const PREF = ['en', 'ja', 'fr', 'de', 'it', 'es', 'pt'];
const best = new Map();
for (let from = 0; ; from += 1000) {
  const rows = await getJSON(`${SB}/rest/v1/cards?select=id,lang,image&image=not.is.null&order=id&offset=${from}&limit=1000`);
  for (const c of rows) {
    const k = c.id.replace(/^[a-z]{2}:/, ''), p = PREF.indexOf(c.lang) < 0 ? 99 : PREF.indexOf(c.lang), cur = best.get(k);
    if (!cur || p < cur.p) best.set(k, { p, image: c.image, id: c.id });
  }
  if (rows.length < 1000) break;
}
let keys = [...best.keys()].sort(); if (keys.length > LIMIT) keys = keys.filter((_, i) => i % Math.ceil(keys.length / LIMIT) === 0);
log('illustrations', keys.length);

const extractor = await pipeline('image-feature-extraction', MODEL, { dtype: DTYPE });
async function embed(raw) {
  const out = await extractor(raw); // [1, 1+patchs, 384] ; on garde le jeton CLS
  const v = Float32Array.from(out.data.slice(0, out.dims[2])); let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
  return v.map(x => x / n);
}

// 2) empreintes
const vecs = new Array(keys.length), ok = new Uint8Array(keys.length);
let done = 0, idx = 0;
async function worker() {
  while (idx < keys.length) {
    const i = idx++, b = best.get(keys[i]);
    const buf = await getBuf(b.image + '/low.webp');
    if (buf) { try { vecs[i] = await embed(await artFromBuffer(buf)); ok[i] = 1; } catch (e) { } }
    if (++done % 500 === 0) log(done, '/', keys.length);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
const K = keys.filter((_, i) => ok[i]), V = vecs.filter((_, i) => ok[i]), D = V[0].length;
log('empreintes', K.length, 'dim', D);

// 3) ACP : 384 -> 128 dimensions (index 3x plus léger), puis quantification int8
const mean = new Float64Array(D); for (const v of V) for (let j = 0; j < D; j++) mean[j] += v[j] / V.length;
const C = new Float64Array(D * D), c = new Float64Array(D);
for (const v of V) { for (let j = 0; j < D; j++) c[j] = v[j] - mean[j]; for (let a = 0; a < D; a++) { const ca = c[a], o = a * D; for (let b2 = a; b2 < D; b2++) C[o + b2] += ca * c[b2]; } }
const cov = new Matrix(D, D); for (let a = 0; a < D; a++) for (let b2 = a; b2 < D; b2++) { cov.set(a, b2, C[a * D + b2]); cov.set(b2, a, C[a * D + b2]); }
const evd = new EigenvalueDecomposition(cov, { assumeSymmetric: true }), ev = evd.realEigenvalues, E = evd.eigenvectorMatrix;
const order = ev.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, DIM).map(x => x[1]);
const P = new Float32Array(D * DIM); for (let j = 0; j < D; j++) for (let k = 0; k < DIM; k++) P[j * DIM + k] = E.get(j, order[k]);
export function project(v) { const o = new Float32Array(DIM); for (let j = 0; j < D; j++) { const c = v[j] - mean[j]; if (!c) continue; for (let k = 0; k < DIM; k++) o[k] += c * P[j * DIM + k]; } let n = 0; for (const x of o) n += x * x; n = Math.sqrt(n) || 1; return o.map(x => x / n); }
const Q = new Int8Array(K.length * DIM); K.forEach((_, i) => { const p = project(V[i]); for (let k = 0; k < DIM; k++) Q[i * DIM + k] = Math.max(-127, Math.min(127, Math.round(p[k] * 127))); });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/vec.bin`, Buffer.from(Q.buffer));
const pca = new Float32Array(D + D * DIM); pca.set(Float32Array.from(mean)); pca.set(P, D);
fs.writeFileSync(`${OUT}/pca.bin`, Buffer.from(pca.buffer));
fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify({ model: MODEL, dtype: DTYPE, dim: DIM, src: D, art: ART, side: SIDE, n: K.length, built: new Date().toISOString(), keys: K }));
log('index écrit', (Q.length / 1e6).toFixed(1), 'Mo');

// 4) contrôle qualité : fausses « photos » (cadrage décalé, rotation, lumière, flou, fond) -> la bonne carte sort-elle 1re ?
const search = q => { const p = project(q), s = new Float32Array(K.length); for (let i = 0; i < K.length; i++) { let d = 0; for (let k = 0; k < DIM; k++) d += p[k] * Q[i * DIM + k]; s[i] = d / 127; } return s; };
const rnd = (a, b) => a + Math.random() * (b - a), N = Math.min(300, K.length), res = [];
for (let t = 0; t < N; t++) {
  const i = Math.floor(Math.random() * K.length), b = best.get(K[i]), buf = await getBuf(b.image + '/high.webp') || await getBuf(b.image + '/low.webp'); if (!buf) continue;
  const m = await sharp(buf).metadata(), pad = Math.round(m.width * rnd(0, .06));
  let ph = await sharp(buf).rotate(rnd(-5, 5), { background: { r: 60, g: 45, b: 35 } }).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 60, g: 45, b: 35 } })
    .modulate({ brightness: rnd(.7, 1.25), saturation: rnd(.75, 1.2) }).blur(rnd(.3, 1.6)).jpeg({ quality: 70 }).toBuffer();
  const pm = await sharp(ph).metadata(), cut = Math.round(pm.width * .03);
  ph = await sharp(ph).extract({ left: cut, top: cut, width: pm.width - 2 * cut, height: pm.height - 2 * cut }).toBuffer(); // le cadre de l'appli rogne un peu
  const s = search(await embed(await artFromBuffer(ph)));
  const top = [...s.keys()].sort((a, c) => s[c] - s[a]).slice(0, 5), rank = top.indexOf(i);
  res.push({ key: K[i], rank, s1: +s[top[0]].toFixed(3), s2: +s[top[1]].toFixed(3), right: +s[i].toFixed(3) });
}
const top1 = res.filter(r => r.rank === 0).length, top5 = res.filter(r => r.rank >= 0).length;
const q = (arr, p) => arr.length ? arr.sort((a, b) => a - b)[Math.floor(p * (arr.length - 1))] : null;
const goodGap = res.filter(r => r.rank === 0).map(r => r.s1 - r.s2), badS1 = res.filter(r => r.rank !== 0).map(r => r.s1);
const report = { tests: res.length, top1, top5, pct1: +(top1 / res.length * 100).toFixed(1), pct5: +(top5 / res.length * 100).toFixed(1),
  gap_ok_p10: q(goodGap, .1), gap_ok_p50: q(goodGap, .5), s1_ok_p10: q(res.filter(r => r.rank === 0).map(r => r.s1), .1), s1_bad_p50: q(badS1, .5), fails: res.filter(r => r.rank !== 0).slice(0, 30) };
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
log('contrôle', JSON.stringify({ ...report, fails: undefined }));
