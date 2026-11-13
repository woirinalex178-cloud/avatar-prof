import { createClient } from 'npm:@supabase/supabase-js@2';

// Identification d'une carte par IA de vision (Google Gemini, palier gratuit) :
// l'IA lit le nom, le numéro complet (123/124), la langue et la série, puis la base trouve la carte exacte.
// Secret requis : GEMINI_API_KEY (Supabase -> Edge Functions -> Secrets). Optionnel : GEMINI_MODEL.
// IA de secours (gratuites), essayées dans l'ordre si Gemini est saturé — chacune ne sert que si sa clé est posée :
//   GROQ_API_KEY (Llama 4 vision), OPENROUTER_API_KEY (modèles de vision gratuits), HF_TOKEN (Hugging Face, Qwen-VL),
//   GITHUB_MODELS_TOKEN (GitHub Models, GPT-4.1 mini), CF_AI_TOKEN + CF_ACCOUNT_ID (Cloudflare Workers AI),
//   MISTRAL_API_KEY (Pixtral).
const KEY = Deno.env.get('GEMINI_API_KEY');
// Échelle de modèles : le meilleur d'abord, puis on descend quand il est saturé, absent ou trop lent.
// GEMINI_MODEL force un modèle en tête de liste.
const MODELS = [...new Set([Deno.env.get('GEMINI_MODEL'), 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-flash-latest',
  'gemini-2.5-flash-lite', 'gemini-flash-lite-latest'].filter(Boolean))] as string[];
// jsonMode : le service accepte de forcer une réponse JSON (sinon on extrait l'objet du texte)
const BACKUPS = [
  { name: 'groq', key: Deno.env.get('GROQ_API_KEY'), url: 'https://api.groq.com/openai/v1/chat/completions', model: Deno.env.get('GROQ_MODEL') || 'meta-llama/llama-4-scout-17b-16e-instruct', jsonMode: true },
  { name: 'openrouter', key: Deno.env.get('OPENROUTER_API_KEY'), url: 'https://openrouter.ai/api/v1/chat/completions', model: Deno.env.get('OPENROUTER_MODEL') || 'qwen/qwen2.5-vl-72b-instruct:free', jsonMode: false },
  { name: 'hf', key: Deno.env.get('HF_TOKEN'), url: 'https://router.huggingface.co/v1/chat/completions', model: Deno.env.get('HF_MODEL') || 'Qwen/Qwen2.5-VL-7B-Instruct', jsonMode: false },
  { name: 'github', key: Deno.env.get('GITHUB_MODELS_TOKEN'), url: 'https://models.github.ai/inference/chat/completions', model: Deno.env.get('GITHUB_MODEL') || 'openai/gpt-4.1-mini', jsonMode: true },
  { name: 'cloudflare', key: Deno.env.get('CF_AI_TOKEN'), url: `https://api.cloudflare.com/client/v4/accounts/${Deno.env.get('CF_ACCOUNT_ID')}/ai/v1/chat/completions`, model: Deno.env.get('CF_MODEL') || '@cf/meta/llama-4-scout-17b-16e-instruct', jsonMode: false },
  { name: 'mistral', key: Deno.env.get('MISTRAL_API_KEY'), url: 'https://api.mistral.ai/v1/chat/completions', model: Deno.env.get('MISTRAL_MODEL') || 'pixtral-12b-2409', jsonMode: true }
].filter(b => b.key && !b.url.includes('/accounts/undefined/'));
// Mémoire des modèles fatigués : quota épuisé = 10 min de repos, modèle absent = 12 h, panne = 1 min.
// Évite de perdre 10 secondes à réessayer un modèle qui vient de refuser.
const cool = new Map<string, number>();
const tired = (m: string) => (cool.get(m) ?? 0) > Date.now();
const rest = (m: string, ms: number) => cool.set(m, Date.now() + ms);
const CALL_MS = Number(Deno.env.get('AI_CALL_MS') || 11000);   // une tentative
const TOTAL_MS = Number(Deno.env.get('AI_TOTAL_MS') || 26000); // toutes tentatives confondues
// Un appel qui traîne est abandonné : mieux vaut descendre d'un modèle que faire attendre une minute.
async function post(url: string, init: RequestInit, ms = CALL_MS) {
  const a = new AbortController(), t = setTimeout(() => a.abort(), ms);
  try { return await fetch(url, { ...init, signal: a.signal }); } finally { clearTimeout(t); }
}
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const hits = new Map<string, number[]>(); // anti-abus simple : 20 analyses / minute / adresse

const PROMPT = `You are an expert Pokémon Trading Card Game identifier. The photo shows ONE physical Pokémon card (maybe in a sleeve, with glare).
Read what is PRINTED on the card and answer ONLY with this JSON:
{"is_card": true|false,
 "name": "card name exactly as printed, with its suffix (ex, EX, GX, V, VMAX, VSTAR, δ, ★...), in the printed language",
 "name_en": "the same card name in English",
 "number": "collector number BEFORE the slash exactly as printed (e.g. \\"045\\", \\"TG05\\", \\"GG12\\", \\"SWSH050\\"), or null",
 "total": "number AFTER the slash (e.g. \\"165\\"), or null",
 "language": "fr|en|ja|de|it|es|pt|ko|zh — language of the printed text",
 "set_name_en": "English name of the expansion if you can tell (set symbol, set code like MEW/PAR/OBF, regulation mark, layout, card number range), else null",
 "set_code": "small printed set abbreviation near the number (e.g. PAR, MEW, SVI), else null",
 "lang_code": "the 2-letter language code printed right after the set code on recent cards (e.g. \"PAR FR\" -> \"FR\", \"MEW EN\" -> \"EN\"), else null",
 "regulation_mark": "single letter in the small white box at the bottom left (e.g. G, H, I), else null",
 "rarity_symbol": "rarity symbol printed next to the number: circle | diamond | star | two stars | three stars | gold star, else null",
 "confidence": 0.0-1.0}
The bottom strip of the card (e.g. \"G  PAR FR  020/182 ●\") is the most reliable part: read it carefully, even rotated or in a sleeve.
If lang_code is printed, "language" MUST match it. Otherwise decide the language from the printed words, not from the Pokémon.
Never invent: use null when you cannot read a field.`;

// si un modèle est saturé (503) ou indisponible, on passe au suivant : les modèles gratuits ont chacun leur quota
async function gemini(b64: string, until: number) {
  if (!KEY) throw new Error('pas de clé Gemini');
  let last = '', skipped = 0;
  for (const m of MODELS) {
    if (tired(m)) { skipped++; continue; }
    if (Date.now() > until) break;
    let r: Response;
    try {
      r = await post(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: b64 } }, { text: PROMPT }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' } })
      }, Math.min(CALL_MS, until - Date.now()));
    } catch (e) { // trop lent ou réseau : on repose ce modèle une minute et on descend d'un cran
      last = `${m} ${(e as Error).name === 'AbortError' ? 'trop lent' : (e as Error).message}`; console.error('gemini', last);
      rest(m, 60000); continue;
    }
    if (!r.ok) {
      last = `${m} ${r.status} ${(await r.text()).slice(0, 160)}`; console.error('gemini', last);
      if (r.status === 429) { rest(m, 600000); continue; }        // quota épuisé : 10 min de repos
      if (r.status === 404 || r.status === 400) { rest(m, 43200000); continue; } // modèle absent de cette clé : 12 h
      rest(m, 60000); continue;                                    // 500/503 : 1 min
    }
    const j = await r.json(), t = j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '{}';
    return { model: m, read: JSON.parse(t.replace(/^```json|```$/g, '').trim()) };
  }
  throw new Error(/ 429 /.test(last) ? 'quota' : 'IA indisponible : ' + (last || (skipped ? 'tous les modèles se reposent' : 'aucun modèle')));
}

// IA de secours au format « OpenAI » (Groq, Mistral) : même consigne, même réponse JSON
async function backup(b64: string, until: number) {
  let last = '';
  for (const b of BACKUPS) {
    if (tired(b.name) || Date.now() > until) continue;
    try {
      const r = await post(b.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${b.key}` },
        body: JSON.stringify({ model: b.model, temperature: 0, ...(b.jsonMode ? { response_format: { type: 'json_object' } } : {}), max_tokens: 600,
          messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }] }] }) });
      if (!r.ok) { last = `${b.name} ${r.status} ${(await r.text()).slice(0, 160)}`; console.error('secours', last);
        rest(b.name, r.status === 429 ? 600000 : 60000); continue; }
      const t = (await r.json()).choices?.[0]?.message?.content || '{}';
      return { model: `${b.name}:${b.model}`, read: JSON.parse(String(t).replace(/^[^{]*/, '').replace(/[^}]*$/, '')) };
    } catch (e) { last = `${b.name} ${(e as Error).message}`; console.error('secours', last); rest(b.name, 60000); }
  }
  throw new Error(last || 'aucune IA de secours');
}
async function readCard(b64: string) {
  const until = Date.now() + TOTAL_MS;
  try { return await gemini(b64, until); }
  catch (e) { if (!BACKUPS.length) throw e; console.error('gemini indisponible, secours', (e as Error).message); return await backup(b64, until); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (!KEY && !BACKUPS.length) return json({ error: 'ia_off' }, 503);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? '?', now = Date.now(), h = (hits.get(ip) ?? []).filter(t => now - t < 60000);
  if (h.length >= 20) return json({ error: 'trop de demandes, patiente une minute' }, 429);
  h.push(now); hits.set(ip, h);
  try {
    const { image } = await req.json();
    if (typeof image !== 'string' || image.length > 3_000_000) return json({ error: 'image invalide' }, 400);
    const t0 = Date.now();
    const { model, read } = await readCard(image.replace(/^data:image\/\w+;base64,/, ''));
    const ms = Date.now() - t0;
    if (read.is_card === false) return json({ read, cards: [], model, ms });
    const LC: Record<string, string> = { FR: 'fr', EN: 'en', DE: 'de', IT: 'it', ES: 'es', PT: 'pt', JP: 'ja', JA: 'ja', KR: 'ko', KO: 'ko', TW: 'zh-tw', CN: 'zh-cn' };
    const printed = LC[String(read.lang_code || '').trim().toUpperCase()];
    if (printed) read.language = printed;
    if (read.language === 'zh') read.language = 'zh-tw';
    const num = read.number ? String(read.number).replace(/\s/g, '') : null, total = read.total && /^\d+$/.test(String(read.total)) ? +read.total : null;
    const args = { p_num: num, p_total: total, p_lang: read.language || 'fr', p_set: read.set_name_en || null };
    let { data } = await db.rpc('match_card', { ...args, p_name: read.name || read.name_en || '' });
    if (read.name_en && read.name_en !== read.name) { // nom anglais en plus : utile si la carte est dans une autre langue
      const r2 = await db.rpc('match_card', { ...args, p_name: read.name_en });
      const seen = new Map((data ?? []).map((c: { id: string }) => [c.id, c])); for (const c of r2.data ?? []) { const o = seen.get(c.id) as { score: number } | undefined; if (!o || o.score < c.score) seen.set(c.id, c); }
      data = [...seen.values()].sort((a: { score: number }, b: { score: number }) => b.score - a.score).slice(0, 10);
    }
    // la langue lue sur la carte départage les versions d'une même carte
    const cards = (data ?? []).map((c: { lang: string; score: number }) => ({ ...c, score: c.score + (c.lang === read.language ? 2 : 0) })).sort((a: { score: number }, b: { score: number }) => b.score - a.score);
    return json({ model, ms, read, cards });
  } catch (e) {
    const m = String((e as Error).message ?? e); console.error('identify', m);
    return json({ error: m === 'quota' ? 'quota' : m }, m === 'quota' ? 429 : 500);
  }
});
