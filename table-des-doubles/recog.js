// Reconnaissance visuelle des cartes, comme les applis pro, mais gratuite et dans le navigateur :
// 1) le téléphone calcule l'« empreinte » de l'illustration photographiée (modèle de vision DINOv2, open source),
// 2) on la compare aux empreintes des ~24 000 illustrations officielles (index précalculé par GitHub Actions),
// 3) les plus proches sont les cartes candidates. Pas besoin de lire le numéro.
const TF = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
let ready = null;

export function loadRecog(onProgress) {
  ready ||= (async () => {
    const [tf, meta, vec, pca] = await Promise.all([
      import(TF),
      fetch('/idx/meta.json').then(r => { if (!r.ok) throw new Error('index absent'); return r.json(); }),
      fetch('/idx/vec.bin').then(r => r.arrayBuffer()),
      fetch('/idx/pca.bin').then(r => r.arrayBuffer())
    ]);
    tf.env.allowLocalModels = false;
    const ext = await tf.pipeline('image-feature-extraction', meta.model, { dtype: meta.dtype, device: 'wasm', progress_callback: onProgress });
    return { ext, RawImage: tf.RawImage, meta, Q: new Int8Array(vec), P: new Float32Array(pca) };
  })().catch(e => { ready = null; throw e; });
  return ready;
}

// découpe l'illustration exactement comme pour l'index (meta.art), en carré meta.side
function artPixels(cv, meta) {
  const A = meta.art, S = meta.side, c = Object.assign(document.createElement('canvas'), { width: S, height: S }), x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high';
  x.drawImage(cv, A.x0 * cv.width, A.y0 * cv.height, (A.x1 - A.x0) * cv.width, (A.y1 - A.y0) * cv.height, 0, 0, S, S);
  const d = x.getImageData(0, 0, S, S).data, rgb = new Uint8ClampedArray(S * S * 3);
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { rgb[j] = d[i]; rgb[j + 1] = d[i + 1]; rgb[j + 2] = d[i + 2]; }
  return rgb;
}

// renvoie les k illustrations les plus proches : [{ key, score }] (score de 0 à 1)
export async function recognize(cv, k = 8) {
  const R = await loadRecog(), { meta, Q, P } = R, D = meta.src, M = meta.dim, S = meta.side;
  const out = await R.ext(new R.RawImage(artPixels(cv, meta), S, S, 3));
  const v = out.data.slice(0, D); let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
  const p = new Float32Array(M); // projection ACP (moyenne puis matrice), comme à la construction de l'index
  for (let j = 0; j < D; j++) { const c = v[j] / n - P[j]; if (!c) continue; const o = D + j * M; for (let q = 0; q < M; q++) p[q] += c * P[o + q]; }
  let m = 0; for (const x of p) m += x * x; m = Math.sqrt(m) || 1;
  const top = []; // meilleurs scores (petite liste triée)
  for (let i = 0; i < meta.n; i++) {
    let s = 0; const o = i * M; for (let q = 0; q < M; q++) s += p[q] * Q[o + q];
    s /= 127 * m;
    if (top.length < k || s > top[top.length - 1].score) { top.push({ i, score: s }); top.sort((a, b) => b.score - a.score); if (top.length > k) top.pop(); }
  }
  return top.map(t => ({ key: meta.keys[t.i], score: t.score }));
}
