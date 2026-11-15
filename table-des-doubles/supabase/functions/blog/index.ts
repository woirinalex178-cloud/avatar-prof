import { createClient } from 'npm:@supabase/supabase-js@2';

// « La Gazette » — moteur de publication multi-canal.
// Une ligne de `blog` = UNE publication déclinée : article du site, fil du forum,
// Facebook, Instagram, script TikTok. Rien ne part sans un clic dans le mail de validation.
//
// Routes
//   POST /generate        (cron lundi, ou admin)  → rédige un brouillon + ses déclinaisons, puis demande la validation par mail
//   GET  /approve?id=&k=  (lien du mail)          → publie l'article + le fil du forum, puis pousse vers les réseaux
//   GET  /reject?id=&k=   (lien du mail)          → jette le brouillon
//   POST /learn           (cron dimanche)         → note les publications passées et en tire des enseignements
//   GET  /pending         (cron, admin)           → brouillons en attente (relance)
//
// Les données viennent du catalogue et de l'activité réelle du site. L'IA ne fait que rédiger.
// Sans clé IA, une version « maison » factuelle est produite quand même.
const SITE = 'https://table-des-doubles.vercel.app';
const N8N = 'https://n8n.clairargent.fr/webhook';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-cron' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const GEM = Deno.env.get('GEMINI_API_KEY'), GROQ = Deno.env.get('GROQ_API_KEY');
const FORUM_MAX = 1900; // la base refuse au-delà de 2000 caractères

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

const page = (titre: string, corps: string) => new Response(
  `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titre} — Sharing Cards</title>
<style>:root{color-scheme:dark}body{margin:0;display:grid;place-items:center;min-height:100vh;background:#0d2b1d;color:#f3f0e7;font:16px/1.6 system-ui,sans-serif;padding:24px}
.c{max-width:34rem;background:#123c28;border:1px solid #d4af37;border-radius:14px;padding:28px;text-align:center}
h1{margin:0 0 .5rem;font-size:1.4rem;color:#d4af37}a{color:#d4af37}</style>
<div class="c"><h1>${titre}</h1>${corps}<p><a href="${SITE}">Retour à Sharing Cards</a></p></div>`,
  { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

// ---------- les faits réels du site ----------
async function facts() {
  const sem = new Date(Date.now() - 7 * 864e5).toISOString();
  const [{ data: mv }, { data: sets }, { count: listings }, { count: members }, { data: pricey }, { count: neufs }, { count: poses }, { data: wish }] = await Promise.all([
    db.rpc('gazette_movers', { p_limit: 6 }),
    db.from('sets').select('name,name_fr,code,released,card_count').eq('lang', 'fr').not('released', 'is', null).order('released', { ascending: false }).limit(3),
    db.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('cards').select('name,name_fr,price_eur,local_id').eq('lang', 'fr').not('price_eur', 'is', null).order('price_eur', { ascending: false }).limit(5),
    db.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', sem),
    db.from('listings').select('id', { count: 'exact', head: true }).gte('created_at', sem),
    db.from('wishlist').select('card_id').limit(200)
  ]);
  const movers = (mv ?? []) as { nom: string; num: string; cote: number; avant: number; delta: number; releve: string }[];
  return {
    movers, sets: sets ?? [], listings: listings ?? 0, members: members ?? 0,
    top: (pricey ?? []).map(c => ({ nom: c.name_fr || c.name, cote: c.price_eur })),
    semaine: { nouveaux_membres: neufs ?? 0, doubles_poses: poses ?? 0, cartes_recherchees: (wish ?? []).length }
  };
}

// ---------- la mémoire de la boucle IA ----------
async function memory() {
  const { data } = await db.from('content_learn').select('lesson,weight').order('weight', { ascending: false }).order('created_at', { ascending: false }).limit(8);
  return (data ?? []).map(l => `- ${l.lesson}`).join('\n');
}

// ---------- auto-contrôle : le filtre anti-coordonnées du site ----------
async function violation(txt: string): Promise<string | null> {
  const { data } = await db.rpc('contact_violation', { t: txt });
  return (data as string | null) ?? null;
}

type Art = { title: string; excerpt: string; tag: string; body: string; forum: string; facebook: string; instagram: string; tiktok: string };

const PROMPT = (f: unknown, mem: string, correctif = '') => `Tu es le rédacteur de « Sharing Cards », un site français d'échange de cartes Pokémon entre collectionneurs passionnés (18+, 0 % de frais vendeur, échange gratuit, paiement sécurisé par séquestre, livraison en point relais).
Tu produis la publication de la semaine, en français, ton chaleureux et concret, tutoiement, sans superlatif publicitaire et sans conseil d'investissement.

Appuie-toi UNIQUEMENT sur ces données réelles du site (cotes Cardmarket via TCGdex). Dans "movers", "delta" est la variation en % depuis le relevé précédent, daté par "releve" : écris « depuis le dernier relevé » ou cite la date, jamais « en un jour ». N'arrondis ni ne modifie aucun chiffre :
${JSON.stringify(f)}
${mem ? `\nCe que l'expérience des semaines passées a appris (à respecter) :\n${mem}\n` : ''}${correctif ? `\nCORRECTION OBLIGATOIRE : la version précédente a été refusée par le filtre du site (${correctif}). Réécris sans le mot ou la tournure en cause.\n` : ''}
INTERDIT dans le champ "forum" : les mots tel, telephone, numero, insta, fb, discord, snap, signal, rib, mail, gmail, whatsapp, iban, virement, cash, especes, liquide, main propre, ainsi que toute adresse, tout lien et toute invitation à discuter hors du site. Le filtre automatique du site refuse la publication sinon. Écris « un pareil » plutôt que « un tel », et « avertissement » plutôt que « signal ».

Réponds en JSON strict avec exactement ces clés :
{
 "title": "titre de l'article, moins de 70 caractères, sobre",
 "excerpt": "une phrase de résumé",
 "tag": "Cotes|Extensions|Conseils|Communauté",
 "body": "l'article, 450 à 700 mots, markdown avec des titres '## ' et '### ', une liste à puces des cartes qui bougent avec leur cote en euros, un paragraphe pratique (état, protection, double à poser), et une question ouverte pour finir",
 "forum": "le même sujet lancé sur le forum du site : 600 à 1200 caractères, pas de markdown, 2 ou 3 chiffres marquants, et une question ouverte à la fin pour faire répondre les membres",
 "facebook": "300 à 500 caractères, chaleureux, un ou deux emojis, une question à la fin, sans lien (il est ajouté automatiquement)",
 "instagram": "2 ou 3 phrases courtes, puis « Lien en bio », puis 6 à 10 hashtags français pertinents",
 "tiktok": "script d'une vidéo verticale de 25 secondes : une accroche de 3 secondes, 3 plans décrits entre crochets, une chute, et la phrase finale « Sharing Cards, l'espace des collectionneurs »"
}`;

async function gemini(p: string) {
  // Les noms de modèles expirent : Google a retiré gemini-2.0-flash le 15/11/2026
  // (« no longer available »). `gemini-flash-latest` est un alias qui suit les sorties,
  // les deux suivants sont des repêchages si l'alias venait à bouger.
  for (const m of ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.5-flash-lite']) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${GEM}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: p }] }], generationConfig: { temperature: 0.8, responseMimeType: 'application/json' } })
    });
    if (r.ok) { const j = await r.json(); const t = j.candidates?.[0]?.content?.parts?.[0]?.text; if (t) return t; }
    else console.error('gemini', m, r.status, (await r.text()).slice(0, 200));
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
async function redige(p: string): Promise<Art | null> {
  for (const call of [GEM ? () => gemini(p) : null, GROQ ? () => groq(p) : null].filter(Boolean) as (() => Promise<string | null>)[]) {
    try {
      const raw = await call();
      if (!raw) continue;
      const j = JSON.parse(raw.replace(/^```json\s*|```$/g, ''));
      if (j?.title && j?.body) return j as Art;
    } catch (e) { console.error('ia', (e as Error).message); }
  }
  return null;
}

type F = Awaited<ReturnType<typeof facts>>;

// Secours sans IA : une publication factuelle écrite à partir des mêmes données.
function maison(f: F): Art {
  const s = f.sets[0], m = f.movers;
  const liste = m.length ? m.map(x => `- **${x.nom}** (n° ${x.num}) : ${x.cote} € ${x.delta > 0 ? '▲' : '▼'} ${Math.abs(x.delta)} %`).join('\n') : '- Rien de spectaculaire cette semaine : les cotes sont stables.';
  const body = `## Les cotes qui bougent cette semaine\n\n${liste}\n\n_Variation depuis le dernier relevé des cotes Cardmarket._\n\n### Ce qu'il faut en retenir\n\nUne cote n'est qu'un repère : c'est l'état réel de la carte qui décide du prix final. Une Near Mint se négocie au prix affiché, une carte jouée perd vite 30 à 50 %.\n\n## Côté extensions\n\n${s ? `La dernière extension française référencée est **${s.name_fr || s.name}** (${s.card_count} cartes, sortie le ${new Date(s.released).toLocaleDateString('fr-FR')}).` : ''}\n\n## La table cette semaine\n\n${f.listings} double(s) posé(s) par ${f.members} collectionneur(s), dont ${f.semaine.doubles_poses} posé(s) ces sept derniers jours.\n\n### Le réflexe emballage\n\nSleeve, toploader, carton, enveloppe à bulles, envoi suivi. Dix minutes de soin évitent un litige.\n\n## À toi\n\nQuelle carte cherches-tu depuis trop longtemps ?`;
  const forum = `Le point de la semaine sur les cotes, depuis le dernier relevé.\n\n${m.slice(0, 3).map(x => `${x.nom} (n° ${x.num}) : ${x.cote} € ${x.delta > 0 ? 'en hausse de' : 'en baisse de'} ${Math.abs(x.delta)} %`).join('\n') || 'Les cotes sont restées stables.'}\n\nSur la table : ${f.listings} double(s) posé(s) par ${f.members} collectionneur(s).\n\nRappel utile : la cote est un repère, l'état décide du prix. Une carte jouée perd vite 30 à 50 % par rapport au prix affiché.\n\nEt vous, quelle carte cherchez-vous depuis trop longtemps ?`;
  return {
    title: `Les cotes de la semaine${m[0] ? ` : ${m[0].nom} en ${m[0].delta > 0 ? 'hausse' : 'baisse'}` : ''}`,
    excerpt: 'Le point hebdo sur les cotes, les extensions et la table.',
    tag: 'Cotes', body, forum,
    facebook: `📈 Le point de la semaine sur les cotes Pokémon.\n\n${m.slice(0, 3).map(x => `${x.nom} : ${x.cote} € ${x.delta > 0 ? '▲' : '▼'} ${Math.abs(x.delta)} %`).join('\n') || 'Semaine calme côté cotes.'}\n\nEt toi, tu gardes ou tu échanges ? 🃏`,
    instagram: `Les cotes bougent cette semaine.\n${m[0] ? `${m[0].nom} : ${m[0].cote} €.` : ''}\nLien en bio.\n\n#pokemon #cartespokemon #pokemontcg #collectionpokemon #echangedecartes #pokemonfr #tcgfrance #collectionneur`,
    tiktok: `[Plan 1 : une carte posée sur un tapis vert, lumière rasante] "Cette carte a ${m[0] && m[0].delta > 0 ? 'pris' : 'perdu'} ${m[0] ? Math.abs(m[0].delta) : 0} % depuis le dernier relevé."\n[Plan 2 : le classeur qui défile] "Et ton double, il vaut combien ?"\n[Plan 3 : le site à l'écran] "Tu le poses, quelqu'un le cherche."\nSharing Cards, l'espace des collectionneurs`
  };
}

// ---------- le compte robot qui signe les posts du forum ----------
// La résolution vit dans la fonction SQL `gazette_id()` : elle recrée le profil s'il manque.
// Ici on ne garde que la création du compte d'authentification, au tout premier passage.
async function gazetteId(): Promise<string> {
  const { data, error } = await db.rpc('gazette_id');
  if (data) return data as string;
  const email = 'gazette@table-des-doubles.invalid';
  const password = crypto.randomUUID() + crypto.randomUUID();
  await db.auth.admin.createUser({ email, password, email_confirm: true });
  const { data: again, error: e2 } = await db.rpc('gazette_id');
  if (again) return again as string;
  throw new Error('compte Gazette : ' + (e2?.message ?? error?.message ?? 'inconnu'));
}

// ---------- routes ----------
async function generate() {
  const f = await facts(), mem = await memory();
  let art = await redige(PROMPT(f, mem));
  let ia = !!art;
  if (art && !art.forum) art.forum = maison(f).forum;

  // auto-contrôle : le texte du forum doit passer le filtre du site. Une reprise, puis la version maison.
  if (art) {
    let why = await violation(art.forum.slice(0, FORUM_MAX));
    if (why) {
      const retry = await redige(PROMPT(f, mem, why));
      if (retry?.forum && !(await violation(retry.forum.slice(0, FORUM_MAX)))) art = retry;
      else { art.forum = maison(f).forum; why = await violation(art.forum); if (why) art = null; }
    }
  }
  if (!art) { art = maison(f); ia = false; }

  const k = crypto.randomUUID().replace(/-/g, '');
  const slug = `${slugify(art.title)}-${new Date().toISOString().slice(0, 10)}`;
  const { data, error } = await db.from('blog').insert({
    slug, title: art.title.slice(0, 140), excerpt: (art.excerpt || '').slice(0, 240),
    tag: art.tag || 'Cotes', body: art.body, status: 'draft', k,
    forum_body: art.forum.slice(0, FORUM_MAX), fb: art.facebook, ig: art.instagram, tiktok: art.tiktok
  }).select('id,slug,title,excerpt,status').single();
  if (error) return json({ error: error.message }, 400);

  const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1/blog`;
  const charge = {
    id: data.id, titre: data.title, resume: data.excerpt, tag: art.tag, source: ia ? 'ia' : 'maison',
    article_md: art.body, forum: art.forum.slice(0, FORUM_MAX), facebook: art.facebook, instagram: art.instagram, tiktok: art.tiktok,
    lien_publier: `${base}/approve?id=${data.id}&k=${k}`, lien_jeter: `${base}/reject?id=${data.id}&k=${k}`,
    lien_article: `${SITE}/#/journal/${data.slug}`
  };
  let mail = 'non envoyé';
  try {
    const r = await fetch(`${N8N}/sc-gazette-valider`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(charge) });
    mail = r.ok ? 'demande de validation envoyée' : `n8n a répondu ${r.status}`;
  } catch (e) { mail = 'n8n injoignable : ' + (e as Error).message; }
  return json({ ok: true, article: data, source: ia ? 'ia' : 'maison', validation: mail });
}

async function approve(id: string, k: string) {
  const { data: a } = await db.from('blog').select('*').eq('id', id).maybeSingle();
  if (!a) return page('Introuvable', '<p>Ce brouillon n’existe plus.</p>');
  if (a.status === 'published') return page('Déjà publié', `<p>« ${a.title} » est déjà en ligne.</p>`);
  if (!a.k || a.k !== k) return page('Lien expiré', '<p>Ce lien de validation a déjà servi ou n’est plus valable.</p>');

  await db.from('blog').update({ status: 'published', published_at: new Date().toISOString(), k: null }).eq('id', id);

  // le fil du forum, signé par « La Gazette » et rattaché à l'article
  let forum = 'non publié';
  try {
    const uid = await gazetteId();
    await db.from('posts').update({ pinned: false }).eq('user_id', uid).eq('pinned', true); // une seule à la une
    const { data: p, error } = await db.from('posts').insert({
      user_id: uid, body: (a.forum_body || a.excerpt || a.title).slice(0, FORUM_MAX),
      title: a.title.slice(0, 140), blog_id: a.id, pinned: true
    }).select('id').single();
    if (error) forum = 'refusé : ' + error.message;
    else { await db.from('blog').update({ post_id: p.id }).eq('id', id); forum = 'fil ouvert sur le forum'; }
  } catch (e) { forum = 'erreur : ' + (e as Error).message; }

  // les réseaux sociaux, via n8n
  let social = 'non envoyé';
  try {
    const r = await fetch(`${N8N}/sc-gazette-reseaux`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, titre: a.title, facebook: a.fb, instagram: a.ig, tiktok: a.tiktok, image: a.cover || `${SITE}/img/og.jpg`, lien_article: `${SITE}/#/journal/${a.slug}` })
    });
    social = r.ok ? 'envoyé aux réseaux' : `n8n a répondu ${r.status}`;
    await db.from('blog').update({ social_at: new Date().toISOString(), social_log: { n8n: social } }).eq('id', id);
  } catch (e) { social = 'n8n injoignable : ' + (e as Error).message; }

  return page('✅ Publié', `<p><b>${a.title}</b></p><p>Article en ligne · ${forum} · ${social}</p>`);
}

async function reject(id: string, k: string) {
  const { data: a } = await db.from('blog').select('id,title,k,status').eq('id', id).maybeSingle();
  if (!a) return page('Introuvable', '<p>Ce brouillon n’existe plus.</p>');
  if (!a.k || a.k !== k) return page('Lien expiré', '<p>Ce lien a déjà servi.</p>');
  await db.from('blog').update({ status: 'rejected', k: null, reviewed_at: new Date().toISOString() }).eq('id', id);
  return page('🗑️ Jeté', `<p>« ${a.title} » ne sera pas publié. Le moteur en proposera un autre au prochain passage.</p>`);
}

// ---------- la boucle : le moteur note son propre travail et en tire des leçons ----------
async function learn() {
  const { data: pubs } = await db.from('blog').select('id,title,tag,views,published_at,post_id,social_at').eq('status', 'published').order('published_at', { ascending: false }).limit(10);
  if (!pubs?.length) return json({ ok: true, note: 'rien de publié à analyser' });
  const ids = pubs.map(p => p.post_id).filter(Boolean);
  const { data: fils } = ids.length ? await db.from('posts').select('id,votes,replies').in('id', ids) : { data: [] };
  const bilan = pubs.map(p => {
    const fil = (fils ?? []).find(f => f.id === p.post_id);
    return { titre: p.title, tag: p.tag, vues: p.views ?? 0, votes: fil?.votes ?? 0, reponses: fil?.replies ?? 0, reseaux: !!p.social_at };
  });
  const moy = bilan.reduce((s, b) => s + b.vues, 0) / bilan.length;
  for (const p of pubs) {
    const b = bilan.find(x => x.titre === p.title)!;
    const note = Math.max(0, Math.min(100, Math.round((moy ? (b.vues / Math.max(moy, 1)) * 50 : 50) + b.reponses * 10 + b.votes * 5)));
    await db.from('blog').update({ score: note, reviewed_at: new Date().toISOString() }).eq('id', p.id);
  }
  const p = `Tu analyses les performances du journal de « Sharing Cards » (cartes Pokémon). Voici les dernières publications avec leurs vues sur le site, les votes et les réponses sur le forum :
${JSON.stringify(bilan)}
Tire 3 enseignements ACTIONNABLES pour la rédaction de la semaine prochaine (sujets à privilégier, longueur, type de question finale, ton). Chaque enseignement est une phrase impérative, concrète, vérifiable par ces chiffres. N'invente aucune donnée.
Réponds en JSON strict : {"lessons":[{"lesson":"...","weight":1},{"lesson":"...","weight":2},{"lesson":"...","weight":3}]}`;
  let lessons: { lesson: string; weight: number }[] = [];
  for (const call of [GEM ? () => gemini(p) : null, GROQ ? () => groq(p) : null].filter(Boolean) as (() => Promise<string | null>)[]) {
    try {
      const raw = await call();
      if (!raw) continue;
      const j = JSON.parse(raw.replace(/^```json\s*|```$/g, ''));
      if (Array.isArray(j?.lessons) && j.lessons.length) { lessons = j.lessons; break; }
    } catch (e) { console.error('ia', (e as Error).message); }
  }
  if (!lessons.length) {
    const best = [...bilan].sort((a, b) => b.vues - a.vues)[0];
    lessons = [{ lesson: `Reprendre l'angle de « ${best.titre} » (${best.tag}) : c'est la publication la plus lue des dernières semaines.`, weight: 2 }];
  }
  if (lessons.length) {
    await db.from('content_learn').insert(lessons.slice(0, 3).map(l => ({
      lesson: String(l.lesson).slice(0, 400), weight: Math.max(1, Math.min(5, Number(l.weight) || 1)), evidence: bilan
    })));
  }
  // on ne garde que la mémoire utile : les 30 derniers enseignements
  const { data: vieux } = await db.from('content_learn').select('id').order('created_at', { ascending: false }).range(30, 999);
  if (vieux?.length) await db.from('content_learn').delete().in('id', vieux.map(v => v.id));
  return json({ ok: true, notes: bilan.length, enseignements: lessons.map(l => l.lesson) });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const url = new URL(req.url), path = url.pathname.split('/').pop();
  try {
    // liens du mail de validation : protégés par le jeton à usage unique de la ligne, pas par le jeton cron
    if (path === 'approve' || path === 'reject') {
      const id = url.searchParams.get('id') ?? '', k = url.searchParams.get('k') ?? '';
      if (!id || !k) return page('Lien incomplet', '<p>Ce lien est incomplet.</p>');
      return path === 'approve' ? await approve(id, k) : await reject(id, k);
    }
    if (!(await cronOk(req))) return json({ error: 'interdit' }, 403);
    if (path === 'generate') return await generate();
    if (path === 'learn') return await learn();
    if (path === 'pending') {
      const { data } = await db.from('blog').select('id,title,status,created_at').eq('status', 'draft').order('created_at', { ascending: false });
      return json({ ok: true, brouillons: data ?? [] });
    }
    return json({ error: 'route inconnue' }, 404);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 400); }
});
