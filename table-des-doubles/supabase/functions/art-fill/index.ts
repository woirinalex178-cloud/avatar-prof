import { createClient } from 'npm:@supabase/supabase-js@2';

// Visuels manquants du catalogue.
// TCGdex n'a pas d'image pour une bonne partie des séries japonaises et chinoises,
// ni pour certaines séries internationales (McDonald's, coffres, galeries, promos).
// Limitless publie une page par série, avec tous les visuels : on la lit (une requête par série)
// et on range l'adresse dans `cards.image_url`, en notant la langue du visuel trouvé.
const JP = 'https://limitlesstcg.com/cards/jp/';
const INT = 'https://limitlesstcg.com/cards/';
const UA = 'SharingCards/1.0 (catalogue entre collectionneurs ; https://table-des-doubles.vercel.app)';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-cron' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

async function cronOk(req: Request) {
  const t = req.headers.get('x-cron') ?? '';
  if (t && Deno.env.get('CRON_SECRET') && t === Deno.env.get('CRON_SECRET')) return true;
  if (t) { const { data } = await db.rpc('check_cron_token', { t }); if (data === true) return true; }
  const a = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!a) return false;
  const { data: u } = await db.auth.getUser(a);
  if (!u.user) return false;
  const { data: p } = await db.from('profiles').select('is_admin').eq('id', u.user.id).single();
  return !!p?.is_admin;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Lit une page de série et renvoie { "1": "https://…_LG.png", … }
async function readPage(url: string, code: string, zone: 'tpc' | 'tpci', lang: 'JP' | 'EN') {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const html = await r.text(), out: Record<string, string> = {};
  const re = new RegExp(`https://[^"' ]+/${zone}/${esc(code)}/[^"' ]*?_(\\d+)_[A-Z]+_${lang}(?:_SM|_LG)?\\.png`, 'g');
  for (const m of html.matchAll(re)) {
    const num = m[1];
    if (!out[num]) out[num] = m[0].replace(/_SM\.png$/, '_LG.png');
  }
  return Object.keys(out).length ? out : null;
}

// Pour une série du catalogue, on essaie les adresses plausibles chez Limitless.
async function findImages(set: { lang: string; code: string; alias?: string | null }) {
  const code = set.code, tries: { url: string; code: string; zone: 'tpc' | 'tpci'; lang: 'JP' | 'EN' }[] = [];
  if (set.lang === 'ja' || set.lang.startsWith('zh')) {
    tries.push({ url: JP + encodeURIComponent(code), code, zone: 'tpc', lang: 'JP' });
  } else {
    const cands = [set.alias, code.toUpperCase(), code.replace(/\./g, '').toUpperCase()].filter(Boolean) as string[];
    for (const c of [...new Set(cands)]) tries.push({ url: INT + encodeURIComponent(c), code: c, zone: 'tpci', lang: 'EN' });
  }
  for (const t of tries) {
    try {
      const imgs = await readPage(t.url, t.code, t.zone, t.lang);
      if (imgs) return { imgs, src: t.code, lang: t.lang === 'JP' ? 'ja' : 'en' };
    } catch (e) { console.error('art-fill', t.url, (e as Error).message); }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (!(await cronOk(req))) return json({ error: 'interdit' }, 403);
  const n = Number(new URL(req.url).searchParams.get('sets') || 6);
  const { data: todo } = await db.rpc('art_todo', { p_limit: Math.min(12, Math.max(1, n)) });
  const rempli: Record<string, number> = {}, sans: string[] = [];
  for (const s of (todo ?? []) as { set_id: string; code: string; lang: string; alias: string | null }[]) {
    try {
      const found = await findImages(s);
      if (!found) { await db.rpc('art_apply', { p_set: s.set_id, p_imgs: {} }); sans.push(s.set_id); continue; }
      const { data: k } = await db.rpc('art_apply', { p_set: s.set_id, p_imgs: found.imgs, p_src: found.src, p_lang: found.lang });
      rempli[s.set_id] = k ?? 0;
    } catch (e) { console.error('art-fill', s.set_id, (e as Error).message); }
  }
  return json({ ok: true, rempli, sans_visuel: sans });
});
