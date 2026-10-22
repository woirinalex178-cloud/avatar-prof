import { createClient } from 'npm:@supabase/supabase-js@2';

// Blog hebdomadaire. /generate (cron du lundi ou modération) écrit un article en BROUILLON :
// rien n'est publié sans un clic dans la page de modération.
// Les données viennent du catalogue (hausses de cote, nouvelle extension, activité) ;
// l'IA ne fait que la rédaction. Sans clé IA, un article « maison » est quand même produit.
const SITE = 'https://table-des-doubles.vercel.app';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-cron' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const GEM = Deno.env.get('GEMINI_API_KEY'), GROQ = Deno.env.get('GROQ_API_KEY');

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

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

async function facts() {
  const [{ data: up }, { data: sets }, { count: listings }, { count: members }, { data: pricey }] = await Promise.all([
    db.from('cards').select('name,name_fr,local_id,price_eur,price_prev,set_id').eq('lang', 'fr').not('price_prev', 'is', null).gt('price_prev', 1).order('price_eur', { ascending: false }).limit(200),
    db.from('sets').select('name,name_fr,code,released,card_count').eq('lang', 'fr').not('released', 'is', null).order('released', { ascending: false }).limit(3),
    db.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('cards').select('name,name_fr,price_eur,local_id').eq('lang', 'fr').not('price_eur', 'is', null).order('price_eur', { ascending: false }).limit(5)
  ]);
  const movers = (up ?? []).map(c => ({ nom: c.name_fr || c.name, num: c.local_id, cote: c.price_eur, avant: c.price_prev, delta: Math.round(((c.price_eur / c.price_prev) - 1) * 100) }))
    .filter(c => Math.abs(c.delta) >= 5).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 6);
  return { movers, sets: sets ?? [], listings: listings ?? 0, members: members ?? 0, top: (pricey ?? []).map(c => ({ nom: c.name_fr || c.name, cote: c.price_eur })) };
}

const PROMPT = (f: unknown) => `Tu es le rédacteur du blog de « Sharing Cards », un site français d'échange de cartes Pokémon entre collectionneurs passionnés (18+, 0 % de frais vendeur, échange gratuit, paiement sécurisé).
Écris l'article de la semaine, en français, ton chaleureux et concret, tutoiement, sans superlatifs publicitaires et sans conseil d'investissement.
Appuie-toi UNIQUEMENT sur ces données réelles du site (cotes Cardmarket via TCGdex) : ${JSON.stringify(f)}
Contraintes : 450 à 700 mots ; markdown avec des titres "## " et "### " ; pas d'image ; pas de lien externe ; une liste à puces des cartes qui bougent avec leur cote en euros ; un paragraphe pratique pour les collectionneurs (état, protection, double à poser) ; termine par UNE question ouverte pour lancer la discussion.
Réponds en JSON strict : {"title": "...", "excerpt": "une phrase", "tag": "Cotes|Extensions|Conseils|Communauté", "body": "markdown"}`;

async function gemini(p: string) {
  for (const m of ['gemini-2.0-flash', 'gemini-2.0-flash-lite']) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${GEM}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: p }] }], generationConfig: { temperature: 0.8, responseMimeType: 'application/json' } })
    });
    if (r.ok) { const j = await r.json(); const t = j.candidates?.[0]?.content?.parts?.[0]?.text; if (t) return t; }
  }
  return null;
}
async function groq(p: string) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.8, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: p }] })
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? null;
}

// Secours sans IA : un article factuel écrit à partir des mêmes données
function maison(f: { movers: { nom: string; num: string; cote: number; avant: number; delta: number }[]; sets: { name: string; name_fr: string | null; released: string; card_count: number }[]; listings: number; members: number }) {
  const s = f.sets[0];
  const body = `## Les cotes qui bougent cette semaine\n\n${f.movers.length ? f.movers.map(m => `- **${m.nom}** (n° ${m.num}) : ${m.cote} € ${m.delta > 0 ? '▲' : '▼'} ${Math.abs(m.delta)} %`).join('\n') : "- Rien de spectaculaire cette semaine : les cotes sont stables."}\n\n### Ce qu'il faut en retenir\n\nUne cote n'est qu'un repère : c'est l'état réel de la carte qui décide du prix final. Une Near Mint se négocie au prix affiché, une carte jouée perd vite 30 à 50 %.\n\n## Côté extensions\n\n${s ? `La dernière extension française référencée est **${s.name_fr || s.name}** (${s.card_count} cartes, sortie le ${new Date(s.released).toLocaleDateString('fr-FR')}).` : ''}\n\n## La table cette semaine\n\n${f.listings} double(s) posé(s) par ${f.members} collectionneur(s). Pense à poser les tiens : une carte en double dans ton classeur, c'est une carte qui manque à quelqu'un d'autre.\n\n### Le réflexe emballage\n\nSleeve, toploader, carton, enveloppe à bulles, envoi suivi. Dix minutes de soin évitent un litige.\n\n## À toi\n\nQuelle carte cherches-tu depuis trop longtemps ?`;
  return { title: `Les cotes de la semaine${f.movers[0] ? ` : ${f.movers[0].nom} en ${f.movers[0].delta > 0 ? 'hausse' : 'baisse'}` : ''}`, excerpt: 'Le point hebdo sur les cotes, les extensions et la table.', tag: 'Cotes', body };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const path = new URL(req.url).pathname.split('/').pop();
  try {
    if (path !== 'generate') return json({ error: 'route inconnue' }, 404);
    if (!(await cronOk(req))) return json({ error: 'interdit' }, 403);
    const f = await facts();
    let art: { title: string; excerpt: string; tag: string; body: string } | null = null;
    const p = PROMPT(f);
    for (const call of [GEM ? () => gemini(p) : null, GROQ ? () => groq(p) : null].filter(Boolean) as (() => Promise<string | null>)[]) {
      try {
        const raw = await call();
        if (!raw) continue;
        const j = JSON.parse(raw.replace(/^```json\s*|```$/g, ''));
        if (j?.title && j?.body) { art = j; break; }
      } catch (e) { console.error('ia', (e as Error).message); }
    }
    const ia = !!art;
    if (!art) art = maison(f as never);
    const slug = `${slugify(art.title)}-${new Date().toISOString().slice(0, 10)}`;
    const { data, error } = await db.from('blog').insert({
      slug, title: art.title.slice(0, 140), excerpt: (art.excerpt || '').slice(0, 240),
      tag: art.tag || 'Cotes', body: art.body, status: 'draft'
    }).select('id,slug,title,status').single();
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, article: data, source: ia ? 'ia' : 'maison' });
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 400); }
});
