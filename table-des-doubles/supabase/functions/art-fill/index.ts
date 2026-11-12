import { createClient } from 'npm:@supabase/supabase-js@2';

// Visuels des cartes japonaises et chinoises.
// TCGdex ne fournit pas d'image pour une bonne partie des séries japonaises (ni pour les chinoises).
// Limitless publie, pour chaque série japonaise, une page listant toutes les cartes avec leur visuel.
// On lit cette page (une requête par série), on garde l'adresse du visuel, et on la range dans `cards.image_url`.
// Les séries chinoises reprennent les codes japonais : le visuel japonais sert d'illustration, c'est annoncé dans l'appli.
const SITE = 'https://limitlesstcg.com/cards/jp/';
const UA = 'SharingCards/1.0 (catalogue de cartes entre collectionneurs ; contact : https://table-des-doubles.vercel.app)';
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

// Récupère { "1": "https://…_LG.png", "2": … } pour une série.
async function setImages(code: string) {
  const r = await fetch(SITE + encodeURIComponent(code), { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const html = await r.text(), out: Record<string, string> = {};
  const esc = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`https://[^"' ]+/tpc/${esc}/[^"' ]*?_(\\d+)_[A-Z]+_JP(?:_SM|_LG)?\\.png`, "g");
  for (const m of html.matchAll(re)) {
    const num = m[1];
    if (!out[num]) out[num] = m[0].replace(/_SM\.png$/, '_LG.png');
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (!(await cronOk(req))) return json({ error: 'interdit' }, 403);
  const n = Number(new URL(req.url).searchParams.get('sets') || 6);
  const { data: todo } = await db.rpc('art_todo', { p_limit: Math.min(12, Math.max(1, n)) });
  const done: Record<string, number> = {}, vides: string[] = [];
  for (const s of (todo ?? []) as { set_id: string; code: string; lang: string }[]) {
    try {
      const imgs = await setImages(s.code);
      if (!imgs || !Object.keys(imgs).length) { await db.rpc('art_apply', { p_set: s.set_id, p_imgs: {} }); vides.push(s.set_id); continue; }
      const { data: k } = await db.rpc('art_apply', { p_set: s.set_id, p_imgs: imgs });
      done[s.set_id] = k ?? 0;
    } catch (e) { console.error('art-fill', s.set_id, (e as Error).message); }
  }
  return json({ ok: true, rempli: done, sans_visuel: vides });
});
