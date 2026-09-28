// Contrôle d'authenticité par photo, 100 % dans le navigateur (gratuit, rien n'est envoyé à un tiers).
// Il ne remplace pas une expertise (PSA, CGC, PCA) : il repère des signes fréquents de contrefaçon.
// Tests : 1) couleurs et mise en page comparées à l'image officielle, 2) texte (nom et numéro) lu sur la carte,
//         3) teinte du dos, 4) test de la lampe (les vraies cartes ont une couche noire qui bloque la lumière).
import { SUPABASE_URL } from './config.js';

const W = 252, H = 352; // format 63 x 88 mm
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));

async function toCanvas(src, w = W, h = H) {
  const bmp = await createImageBitmap(src);
  const r = w / h, sr = bmp.width / bmp.height;
  let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
  if (sr > r) { sw = bmp.height * r; sx = (bmp.width - sw) / 2; } else { sh = bmp.width / r; sy = (bmp.height - sh) / 2; }
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h }), cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  return cx.getImageData(0, 0, w, h).data;
}
const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
}
function lev(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase(); const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

// 1) Couleurs + mise en page : grille 12x16, normalisée (retire l'effet de l'éclairage), corrélation avec l'officielle
function gridVec(d) {
  const gx = 12, gy = 16, v = [];
  for (let y = 0; y < gy; y++) for (let x = 0; x < gx; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = Math.floor(y * H / gy); yy < Math.floor((y + 1) * H / gy); yy += 2) for (let xx = Math.floor(x * W / gx); xx < Math.floor((x + 1) * W / gx); xx += 2) { const i = (yy * W + xx) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    v.push(r / n, g / n, b / n);
  }
  for (let c = 0; c < 3; c++) { // normalisation par canal
    const xs = v.filter((_, i) => i % 3 === c), m = xs.reduce((a, x) => a + x, 0) / xs.length, s = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length) || 1;
    for (let i = c; i < v.length; i += 3) v[i] = (v[i] - m) / s;
  }
  return v;
}
const corr = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0) / a.length;
function satMean(d) { let s = 0, n = 0; for (let i = 0; i < d.length; i += 16) { s += hsv(d[i], d[i + 1], d[i + 2])[1]; n++; } return s / n; }
function sharp(d) { // variance du laplacien : photo nette ou floue
  const g = new Float32Array(W * H); for (let i = 0; i < W * H; i++) g[i] = lum(d, i * 4);
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x, l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - W] - g[i + W]; s += l; s2 += l * l; n++; }
  return s2 / n - (s / n) ** 2;
}
async function testRecto(photo, card) {
  const d = await toCanvas(photo), out = { sharp: Math.round(sharp(d)) };
  if (out.sharp < 40) return { ...out, skip: 'Photo trop floue : recommence bien à plat, sans reflet.' };
  if (!card.image) return { ...out, skip: 'Pas d\'image officielle pour comparer.' };
  const ref = await fetch(`${SUPABASE_URL}/functions/v1/img?u=${encodeURIComponent(card.image + '/high.webp')}`);
  if (!ref.ok) return { ...out, skip: 'Image officielle indisponible.' };
  const r = await toCanvas(await ref.blob());
  const c = corr(gridVec(d), gridVec(r)), sr = satMean(d) / (satMean(r) || 1);
  out.match = Math.round(c * 100); out.satRatio = +sr.toFixed(2);
  out.score = clamp(((c - 0.45) / 0.4) * 100 - (sr > 1.35 ? 25 : 0) - (sr < 0.6 ? 15 : 0));
  out.note = c > 0.75 ? 'Couleurs et mise en page conformes à l\'officielle.' : c > 0.55 ? 'Ressemblance partielle (reflet, holo ou cadrage ?).' : 'Différences importantes avec la carte officielle.';
  if (sr > 1.35) out.note += ' Couleurs trop saturées : fréquent sur les fausses.';
  return out;
}

// 2) Texte : nom et numéro lus doivent correspondre
async function testTexte(photo, card, H) {
  await H.loadTesseract();
  const { data: { text } } = await Tesseract.recognize(await H.shrink(photo), 'eng');
  const num = [...text.matchAll(/(\d{1,3})\s*\/\s*(\d{2,3})/g)].pop();
  const words = text.match(/[A-Za-zÀ-ÿ'-]{3,}/g) || [];
  const target = (card.lang === 'ja' ? '' : card.name).replace(/[^A-Za-zÀ-ÿ' -]/g, '').trim();
  const best = target ? Math.min(...words.map(w => lev(w, target.split(' ')[0])), 99) : null;
  const numOk = num && !isNaN(+card.local_id) ? +num[1] === +card.local_id : null;
  let score = 50, note = [];
  if (numOk === true) { score += 25; note.push('Numéro correct.'); } else if (numOk === false) { score -= 35; note.push(`Numéro lu ${num[1]}/${num[2]} ≠ ${card.local_id} : suspect.`); } else note.push('Numéro illisible.');
  if (best !== null) { if (best <= 1) { score += 25; note.push('Nom bien orthographié.'); } else if (best <= 3) note.push('Nom partiellement lu.'); else { score -= 15; note.push('Nom non retrouvé (faute d\'orthographe ?).'); } }
  return { score: clamp(score), note: note.join(' '), read: num ? num[0] : null };
}

// 3) Dos : le bleu officiel est profond (teinte ~205-230°, bien saturé). Les faux tirent souvent vers le violet ou le pâle.
async function testDos(photo) {
  const d = await toCanvas(photo); let h = 0, s = 0, n = 0;
  for (let i = 0; i < d.length; i += 8) { const [hh, ss, vv] = hsv(d[i], d[i + 1], d[i + 2]); if (hh > 180 && hh < 280 && ss > 0.35 && vv > 0.15) { h += hh; s += ss; n++; } }
  if (n < d.length / 8 * 0.25) return { score: 20, note: 'Peu de bleu détecté : dos non conforme ou mauvaise photo.' };
  h /= n; s /= n;
  const score = clamp(100 - Math.max(0, Math.abs(h - 217) - 10) * 5 - Math.max(0, 0.55 - s) * 150);
  return { score, hue: Math.round(h), sat: +s.toFixed(2), note: score >= 70 ? `Bleu conforme (teinte ${Math.round(h)}°).` : `Bleu inhabituel (teinte ${Math.round(h)}°, saturation ${s.toFixed(2)}) : à vérifier.` };
}

// 4) Lampe : vraie carte = couche noire interne, la lumière passe très peu. Fausse = la carte « s'allume ».
async function testLampe(photo) {
  const d = await toCanvas(photo), L = [];
  for (let i = 0; i < d.length; i += 4) L.push(lum(d, i));
  const sorted = [...L].sort((a, b) => a - b), mx = sorted[Math.floor(L.length * 0.995)] || 1;
  let c = 0, n = 0;
  for (let y = Math.floor(H * 0.3); y < H * 0.7; y++) for (let x = Math.floor(W * 0.3); x < W * 0.7; x++) { c += L[y * W + x]; n++; }
  const ratio = c / n / mx;
  return { score: clamp((0.75 - ratio) / 0.45 * 100), ratio: +ratio.toFixed(2), note: ratio < 0.35 ? 'Très peu de lumière traverse la carte : bon signe.' : ratio < 0.55 ? 'Un peu de lumière passe : à comparer avec une carte sûre.' : 'La carte laisse passer beaucoup de lumière : signe typique de contrefaçon.' };
}

const TESTS = [
  ['recto', 'Recto', 'Carte bien à plat, cadrée au plus près, sans reflet ni flash.', true],
  ['dos', 'Dos', 'Même cadrage, côté dos (bleu).', false],
  ['lampe', 'Test de la lampe', 'Pièce sombre, lampe du téléphone collée DERRIÈRE la carte, photo de face avec un autre appareil.', false]
];

export function openAuth(card, H, opts = {}) {
  const files = {};
  H.modal(`<div class="form"><h2 style="margin:0">Contrôle d'authenticité</h2>
  <p class="small mut" style="margin:0">${H.esc(H.nm(card))} · ${H.esc(card.local_id)} — plus tu ajoutes de photos, plus le score est fiable.</p>
  ${TESTS.map(([k, t, h, req]) => `<label class="panel small" style="display:flex;gap:10px;align-items:center;cursor:pointer"><span style="flex:1"><b>${t}</b>${req ? '' : ' <span class="mut">(conseillé)</span>'}<br><span class="mut">${h}</span></span><span class="btn sm ghost" id="st-${k}">📷 Photo</span><input type="file" accept="image/*" capture="environment" data-k="${k}" hidden></label>`).join('')}
  <button class="btn" id="agogo" disabled>Analyser</button><div id="ares" role="status"></div>
  <p class="small mut">Indicatif : un contrôle photo ne remplace pas une expertise. Pour une carte de plus de 100 €, préfère une carte gradée (PSA, CGC, PCA).</p></div>`);
  H.$('#dbody').onchange = e => { const k = e.target.dataset.k; if (!k) return; files[k] = e.target.files[0]; H.$('#st-' + k).textContent = '✔ Prise'; H.$('#agogo').disabled = !files.recto; };
  H.$('#agogo').onclick = async () => {
    const box = H.$('#ares'); H.$('#agogo').disabled = true; box.innerHTML = '<p class="small">Analyse en cours… (10 à 20 secondes)</p>';
    const rep = {};
    try {
      rep.recto = await testRecto(files.recto, card);
      rep.texte = await testTexte(files.recto, card, H);
      if (files.dos) rep.dos = await testDos(files.dos);
      if (files.lampe) rep.lampe = await testLampe(files.lampe);
    } catch (err) { box.innerHTML = `<p class="err">${H.esc(err.message)}</p>`; H.$('#agogo').disabled = false; return; }
    const w = { recto: 30, texte: 25, dos: 20, lampe: 25 }; let s = 0, t = 0;
    for (const k in rep) if (rep[k].score != null && !rep[k].skip) { s += rep[k].score * w[k]; t += w[k]; }
    const score = t ? Math.round(s / t) : 0, bad = Object.values(rep).some(r => r.score != null && r.score < 30);
    const verdict = !t ? ['Photos insuffisantes', 'p-PL'] : score >= 75 && !bad ? ['Aucun signe de contrefaçon détecté', 'p-NM'] : score >= 50 ? ['À vérifier de plus près', 'p-GD'] : ['Signes de contrefaçon', 'p-PL'];
    rep.meta = { score, verdict: verdict[0], tests: Object.keys(rep).length, confidence: t >= 75 ? 'bonne' : t >= 55 ? 'moyenne' : 'faible' };
    const label = { recto: 'Couleurs & mise en page', texte: 'Texte imprimé', dos: 'Couleur du dos', lampe: 'Test de la lampe' };
    box.innerHTML = `<div class="panel"><div style="display:flex;align-items:center;gap:14px"><div class="ring" style="--p:${score};width:84px;height:84px"><span style="font-size:18px">${score}</span></div>
      <div><span class="pill ${verdict[1]}">${verdict[0]}</span><p class="small mut" style="margin:4px 0 0">Fiabilité ${rep.meta.confidence} (${Object.keys(rep).length - 1} test(s)). ${t < 75 ? 'Ajoute le dos et le test de la lampe pour un résultat plus sûr.' : ''}</p></div></div>
      <ul class="small" style="margin:10px 0 0;padding-left:18px">${Object.entries(rep).filter(([k]) => k !== 'meta').map(([k, r]) => `<li><b>${label[k]}</b> : ${r.skip ? H.esc(r.skip) : `${r.score}/100 — ${H.esc(r.note)}`}</li>`).join('')}</ul></div>`;
    if (H.sb && H.loggedIn()) {
      const { data, error } = await H.sb.from('auth_checks').insert({ card_id: card.id, listing_id: opts.listingId || null, offer_id: opts.offerId || null, score, report: rep }).select('id').single();
      if (!error && opts.listingId) { const r = await H.sb.rpc('attach_auth', { p_listing: opts.listingId, p_check: data.id }); if (!r.error) H.toast('Résultat ajouté à ton annonce'); }
    }
    H.done?.();
    if (opts.offerId && score < 50) box.insertAdjacentHTML('beforeend', `<p class="small">⚠️ Ne confirme pas la réception : ouvre un litige depuis l'offre. L'argent reste bloqué.</p>`);
    H.$('#agogo').disabled = false; H.$('#agogo').textContent = 'Relancer l\'analyse';
  };
}
