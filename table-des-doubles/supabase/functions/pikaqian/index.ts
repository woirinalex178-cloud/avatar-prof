import { createClient } from 'npm:@supabase/supabase-js@2';

// PikaQian : cartes en chinois simplifié, avec visuels (offre gratuite : pas de prix).
// Secret requis : PIKAQIAN_API_KEY. Quota gratuit : 60 demandes / minute, 500 / mois -> 100 cartes par demande.
// Chaque appel reprend la lecture là où la précédente s'est arrêtée (table pq_state), jusqu'à la fin de la liste.
//   ?probe=1&paths=/v1,...  : échantillon brut (diagnostic)
//   sans paramètre          : import des séries puis des cartes, ~40 pages max par appel
const API = 'https://api.pikaqian.com';
const KEY = Deno.env.get('PIKAQIAN_API_KEY');
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function cronOk(req: Request) {
  const t = req.headers.get('x-cron') ?? '';
  if (!t) return false;
  const { data } = await db.rpc('check_cron_token', { t });
  return data === true;
}
let left = 60;
async function get(path: string) {
  if (left <= 2) await sleep(61000);                       // on respecte la limite par minute
  const r = await fetch(API + path, { headers: { 'X-API-Key': KEY ?? '', Accept: 'application/json' } });
  left = Number(r.headers.get('x-ratelimit-remaining') ?? left - 1);
  const quota = Number(r.headers.get('x-ratelimit-quota-remaining') ?? 999);
  if (r.status === 429) throw new Error('limite atteinte');
  if (!r.ok) throw new Error(`${path} ${r.status} ${(await r.text()).slice(0, 200)}`);
  return { body: await r.json(), quota };
}

// lit une liste page par page, en reprenant au dernier curseur
async function pull(kind: 'sets' | 'cards', apply: string, maxPages: number, until: number) {
  const { data: st } = await db.from('pq_state').select('*').eq('k', kind).maybeSingle();
  if (st?.done) return { kind, done: true, pages: 0 };
  let cursor = st?.cursor ?? null, pages = 0, items = 0, quota = 999;
  while (pages < maxPages && Date.now() < until && quota > 20) {
    const q = `/v1/${kind}?page_size=100${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`;
    const r = await get(q); quota = r.quota;
    const rows = r.body.data ?? [];
    const { error } = await db.rpc(apply, { p: rows });
    if (error) throw error;
    pages++; items += rows.length; cursor = r.body.pagination?.next_cursor ?? null;
    await db.from('pq_state').upsert({ k: kind, cursor, done: !cursor, pages: (st?.pages ?? 0) + pages, items: (st?.items ?? 0) + items, updated_at: new Date().toISOString() });
    if (!cursor) return { kind, done: true, pages, items, quota };
  }
  return { kind, done: false, pages, items, quota };
}

Deno.serve(async req => {
  if (!(await cronOk(req))) return json({ error: 'interdit' }, 403);
  if (!KEY) return json({ error: 'PIKAQIAN_API_KEY absente' }, 503);
  const u = new URL(req.url);
  if (u.searchParams.get('probe')) {
    const out: Record<string, unknown> = {};
    for (const p of (u.searchParams.get('paths') || '/v1').split(',')) { try { out[p] = (await get(p)).body; } catch (e) { out[p] = String(e); } }
    return json(out);
  }
  const until = Date.now() + 120_000;
  try {
    const sets = await pull('sets', 'pq_apply_sets', 10, until);
    const cards = sets.done ? await pull('cards', 'pq_apply_cards', 40, until) : null;
    return json({ sets, cards });
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});
