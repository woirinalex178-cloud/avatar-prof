import { createClient } from 'npm:@supabase/supabase-js@2';

// Identification d'une carte par IA de vision (Google Gemini, palier gratuit) :
// l'IA lit le nom, le numéro complet (123/124), la langue et la série, puis la base trouve la carte exacte.
// Secret requis : GEMINI_API_KEY (Supabase -> Edge Functions -> Secrets). Optionnel : GEMINI_MODEL.
const KEY = Deno.env.get('GEMINI_API_KEY'), MODELS = [Deno.env.get('GEMINI_MODEL'), 'gemini-flash-latest', 'gemini-2.5-flash'].filter(Boolean) as string[];
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
 "set_code": "small printed set abbreviation near the number (e.g. MEW), else null",
 "regulation_mark": "single letter in the small box near the number, else null",
 "confidence": 0.0-1.0}
Never invent: use null when you cannot read a field.`;

async function gemini(b64: string) {
  let last = '';
  for (const m of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: b64 } }, { text: PROMPT }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' } })
    });
    if (r.status === 404) { last = 'modèle ' + m + ' introuvable'; continue; }
    if (r.status === 429) throw new Error('quota');
    if (!r.ok) throw new Error('gemini ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json(), t = j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '{}';
    return { model: m, read: JSON.parse(t.replace(/^```json|```$/g, '').trim()) };
  }
  throw new Error(last || 'aucun modèle');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (!KEY) return json({ error: 'ia_off' }, 503);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? '?', now = Date.now(), h = (hits.get(ip) ?? []).filter(t => now - t < 60000);
  if (h.length >= 20) return json({ error: 'trop de demandes, patiente une minute' }, 429);
  h.push(now); hits.set(ip, h);
  try {
    const { image } = await req.json();
    if (typeof image !== 'string' || image.length > 1_500_000) return json({ error: 'image invalide' }, 400);
    const { model, read } = await gemini(image.replace(/^data:image\/\w+;base64,/, ''));
    if (read.is_card === false) return json({ read, cards: [] });
    const num = read.number ? String(read.number).replace(/\s/g, '') : null, total = read.total && /^\d+$/.test(String(read.total)) ? +read.total : null;
    const args = { p_num: num, p_total: total, p_lang: read.language || 'fr', p_set: read.set_name_en || null };
    let { data } = await db.rpc('match_card', { ...args, p_name: read.name || read.name_en || '' });
    if (read.name_en && read.name_en !== read.name) { // nom anglais en plus : utile si la carte est dans une autre langue
      const r2 = await db.rpc('match_card', { ...args, p_name: read.name_en });
      const seen = new Map((data ?? []).map((c: { id: string }) => [c.id, c])); for (const c of r2.data ?? []) { const o = seen.get(c.id) as { score: number } | undefined; if (!o || o.score < c.score) seen.set(c.id, c); }
      data = [...seen.values()].sort((a: { score: number }, b: { score: number }) => b.score - a.score).slice(0, 10);
    }
    return json({ model, read, cards: data ?? [] });
  } catch (e) {
    const m = String((e as Error).message ?? e);
    return json({ error: m === 'quota' ? 'quota' : m }, m === 'quota' ? 429 : 500);
  }
});
