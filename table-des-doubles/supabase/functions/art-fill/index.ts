import { createClient } from 'npm:@supabase/supabase-js@2';

// Visuels manquants du catalogue.
// TCGdex n'a pas d'image pour une partie des séries japonaises et chinoises, ni pour plusieurs séries
// internationales (McDonald's, coffres, galeries, kits du dresseur, promos).
// Deux sources publiques, une page par série :
//   1. Scrydex (anglais et japonais, y compris McDonald's, galeries et séries anciennes) ;
//   2. Limitless (japonais récent, promos) en second recours.
// On range l'adresse du visuel dans `cards.image_url`, en notant la langue du visuel trouvé.
const V = 3; // version de la recherche : l'augmenter relance toutes les séries encore incomplètes
const SCRY = 'https://scrydex.com/pokemon/expansions/x/';
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
// même règle que la fonction SQL art_key : « SV001 » = « SV1 », « 077 » = « 77 », sans tenir compte de la casse
const key = (s: string) => s.replace(/^([A-Za-z]*)0+(?=\d)/, '$1').toUpperCase();
type Set = { set_id: string; code: string; lang: string; name: string; en_name: string | null; limitless: string | null; scrydex: string | null };
type Found = { imgs: Record<string, string>; src: string; lang: string };

// Scrydex : identifiants possibles d'une série du catalogue
function scrydexIds(s: Set): string[] {
  const c = s.code, out: (string | null)[] = [s.scrydex];
  if (['ja', 'ko'].includes(s.lang)) {
    let b = c.toLowerCase().replace(/\+/g, 'p').replace(/[^a-z0-9]/g, '');
    out.push(b + '_ja');
    if (/^s\d/.test(b)) out.push('swsh' + b.slice(1) + '_ja');   // S1H -> swsh1h
    if (/^sp$/.test(b)) out.push('swshp_ja');
    if (/^e\d/.test(b)) out.push('ecard' + b.slice(1) + '_ja');   // E1 -> ecard1
    if (/^pmcg\d/.test(b)) out.push('base' + b.slice(4) + '_ja'); // PMCG1 -> base1
    if (/^l\d/.test(b)) out.push('l' + b.slice(1) + '_ja', 'l' + b.slice(1) + 'hg_ja', 'l' + b.slice(1) + 'ss_ja');
  } else if (!s.lang.startsWith('zh')) {
    const b = c.toLowerCase();
    const mc = b.match(/^20(\d\d)[a-z]+$/);                        // 2021swsh -> mcd21
    if (mc) out.push('mcd' + mc[1]);
    out.push(b.replace(/\.5/g, 'pt5').replace(/[^a-z0-9]/g, ''));  // swsh12.5gg -> swsh12pt5gg
    out.push(b.replace(/[^a-z0-9]/g, ''));                         // sm3.5 -> sm35, swsh4.5sv -> swsh45sv
    out.push(b.replace(/^(sv|me)0(\d)/, '$1$2').replace(/\.5/g, 'pt5').replace(/[^a-z0-9]/g, '')); // sv08.5 -> sv8pt5
    if (b === 'cel25cc') out.push('cel25c');
    if (b === '30th-c') out.push('me55c');
  }
  return [...new Set(out.filter(Boolean) as string[])];
}

async function scrydex(id: string): Promise<Record<string, string> | null> {
  const r = await fetch(SCRY + encodeURIComponent(id), { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const html = await r.text(), out: Record<string, string> = {};
  const re = new RegExp(`https://images\\.scrydex\\.com/pokemon/${esc(id)}-([0-9A-Za-z!?]+)/`, 'g');
  for (const m of html.matchAll(re)) {
    if (/^(logo|symbol)$/i.test(m[1])) continue;
    const k = key(m[1]);
    if (!out[k]) out[k] = `https://images.scrydex.com/pokemon/${id}-${m[1]}/large`;
  }
  return Object.keys(out).length ? out : null;
}

// Limitless : { "1": "https://…_LG.png", … }
async function limitless(url: string, code: string, zone: 'tpc' | 'tpci', lang: 'JP' | 'EN') {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const html = await r.text(), out: Record<string, string> = {};
  const re = new RegExp(`https://[^"' ]+/${zone}/${esc(code)}/[^"' ]*?_(\\d+)_[A-Z]+_${lang}(?:_SM|_LG)?\\.png`, 'g');
  for (const m of html.matchAll(re)) { const k = key(m[1]); if (!out[k]) out[k] = m[0].replace(/_SM\.png$/, '_LG.png'); }
  return Object.keys(out).length ? out : null;
}

// Toutes les sources donnant quelque chose : on les cumule (l'une comble les trous de l'autre).
async function findImages(s: Set): Promise<Found[]> {
  const found: Found[] = [], asia = ['ja', 'ko'].includes(s.lang) || s.lang.startsWith('zh');
  for (const id of scrydexIds(s)) {
    try { const imgs = await scrydex(id); if (imgs) { found.push({ imgs, src: 'scrydex:' + id, lang: asia ? 'ja' : 'en' }); break; } }
    catch (e) { console.error('scrydex', id, (e as Error).message); }
  }
  const tries: { url: string; code: string; zone: 'tpc' | 'tpci'; lang: 'JP' | 'EN' }[] = [];
  if (asia) tries.push({ url: JP + encodeURIComponent(s.code), code: s.code, zone: 'tpc', lang: 'JP' });
  else for (const c of [...new Set([s.limitless, s.code.toUpperCase(), s.code.replace(/\./g, '').toUpperCase()].filter(Boolean) as string[])])
    tries.push({ url: INT + encodeURIComponent(c), code: c, zone: 'tpci', lang: 'EN' });
  for (const t of tries) {
    try { const imgs = await limitless(t.url, t.code, t.zone, t.lang); if (imgs) { found.push({ imgs, src: t.code, lang: t.lang === 'JP' ? 'ja' : 'en' }); break; } }
    catch (e) { console.error('limitless', t.url, (e as Error).message); }
  }
  return found;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (!(await cronOk(req))) return json({ error: 'interdit' }, 403);
  const n = Number(new URL(req.url).searchParams.get('sets') || 6), t0 = Date.now();
  const { data: todo } = await db.rpc('art_todo2', { p_limit: Math.min(25, Math.max(1, n)), p_v: V });
  const rempli: Record<string, number> = {}, sans: string[] = [];
  for (const s of (todo ?? []) as Set[]) {
    if (Date.now() - t0 > 110_000) break;
    try {
      const found = await findImages(s);
      let k = 0;
      if (!found.length) await db.rpc('art_apply2', { p_set: s.set_id, p_imgs: {}, p_src: null, p_lang: null, p_v: V });
      for (const f of found) {
        const { data, error } = await db.rpc('art_apply2', { p_set: s.set_id, p_imgs: f.imgs, p_src: f.src, p_lang: f.lang, p_v: V });
        if (error) throw error;
        k += data ?? 0;
      }
      if (k) rempli[s.set_id] = k; else sans.push(s.set_id);
    } catch (e) { console.error('art-fill', s.set_id, (e as Error).message); }
  }
  return json({ ok: true, rempli, sans_visuel: sans });
});
