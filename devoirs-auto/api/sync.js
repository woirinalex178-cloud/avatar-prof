// POST { devoirs, packs, results, deleted, jours } -> fusionne avec la sauvegarde famille et renvoie l'état commun.
// Même code famille = mêmes devoirs sur tous les appareils (stockage Supabase gratuit).
import { createHash } from 'node:crypto';
import { checkPin } from './_lib.js';

const { SUPABASE_URL, SUPABASE_KEY, SYNC_SECRET = '' } = process.env;
export const famille = pin => createHash('sha256').update(SYNC_SECRET + ':' + pin).digest('hex');

export async function rpc(fn, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Sauvegarde ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

const later = (x, y) => ((x?.at || 0) >= (y?.at || 0) ? x : y);

export function merge(a = {}, b = {}) {
  const month = Date.now() - 30 * 864e5;
  const deleted = Object.fromEntries(Object.entries({ ...a.deleted, ...b.deleted }).filter(([, t]) => t > month));
  const devoirs = {};
  for (const d of [...(a.devoirs || []), ...(b.devoirs || [])]) if (d?.id && !deleted[d.id]) devoirs[d.id] = d;
  const pick = (x = {}, y = {}) => {
    const out = {};
    for (const id of new Set([...Object.keys(x), ...Object.keys(y)])) if (devoirs[id]) out[id] = later(x[id], y[id]);
    return out;
  };
  return {
    devoirs: Object.values(devoirs).sort((p, q) => p.pour.localeCompare(q.pour)),
    packs: pick(a.packs, b.packs),
    results: pick(a.results, b.results),
    deleted,
    fiches: Object.fromEntries([...new Set([...Object.keys(a.fiches || {}), ...Object.keys(b.fiches || {})])]
      .filter(id => !deleted['fiche:' + id]).map(id => [id, later(a.fiches?.[id], b.fiches?.[id])])),
    jours: [...new Set([...(a.jours || []), ...(b.jours || [])])].sort().slice(-60),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!checkPin(req, res)) return;
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.json({ off: true });
  try {
    const id = famille(req.headers['x-pin'] || '');
    const state = merge(await rpc('devoirs_get', { p_famille: id }), req.body || {});
    await rpc('devoirs_put', { p_famille: id, p_data: state });
    res.json(state);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
