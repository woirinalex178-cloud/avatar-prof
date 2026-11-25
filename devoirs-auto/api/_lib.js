// Outils partagés : code famille + appel Gemini (offre gratuite).
export function checkPin(req, res) {
  const pin = process.env.APP_PIN;
  if (pin && req.headers['x-pin'] !== pin) {
    res.status(401).json({ error: 'Code famille incorrect' });
    return false;
  }
  return true;
}

const API = 'https://generativelanguage.googleapis.com/v1beta';
let models = null;

// Modèles "flash" proposés à cette clé, du plus récent au plus ancien (Google renomme souvent ses modèles).
async function listModels(key) {
  if (models) return models;
  const r = await fetch(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Gemini ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const names = ((await r.json()).models || [])
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => m.name.replace('models/', ''));
  const ver = n => parseFloat(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] || 0);
  const tri = l => l.sort((a, b) => ver(b) - ver(a));
  const stables = tri(names.filter(n => /^gemini-[\d.]+-flash(-latest)?$/.test(n)));
  const lite = tri(names.filter(n => /^gemini-[\d.]+-flash-lite(-latest)?$/.test(n)));
  models = [...new Set([...stables.slice(0, 2), 'gemini-flash-latest', ...lite.slice(0, 1)])];
  return models;
}
export async function modeles() { return listModels(process.env.GEMINI_API_KEY); }

// Un appel à un modèle. Réflexion réduite au minimum : sinon certains modèles dépassent la limite de 60 s.
async function call(model, key, parts, { json, temperature }, ms, think = true) {
  const generationConfig = { temperature, ...(json && { responseMimeType: 'application/json' }) };
  if (think) generationConfig.thinkingConfig = /gemini-2\./.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'low' };
  const r = await fetch(`${API}/models/${model}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(ms),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig }),
  });
  if (!r.ok) {
    const msg = await r.text();
    if (think && r.status === 400 && /think/i.test(msg)) return call(model, key, parts, { json, temperature }, ms, false);
    const e = new Error(`Gemini ${r.status} (${model}) : ${msg.slice(0, 200)}`); e.status = r.status; throw e;
  }
  const d = await r.json();
  const txt = d.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('') || '';
  return json ? JSON.parse(txt.replace(/^\s*```json\s*|```\s*$/g, '')) : txt;
}

// Essaie le modèle le plus récent puis bascule sur un autre si trop lent, saturé ou retiré (en restant sous 60 s).
export async function gemini(parts, { json = true, temperature = 0.7 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY manquante');
  const env = process.env.GEMINI_MODEL;
  const liste = [...new Set([...(env && env !== 'auto' ? [env] : []), ...(await listModels(key))])];
  const fin = Date.now() + 52000;
  let err;
  for (const [i, model] of liste.entries()) {
    const reste = fin - Date.now();
    if (reste < 8000) break;
    try { return await call(model, key, parts, { json, temperature }, i === 0 ? Math.min(32000, reste) : reste); }
    catch (e) { err = e; if (e.status === 401 || e.status === 403) break; }   // clé refusée : inutile d'insister
  }
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new Error('Gemini trop lent : réessaie dans un instant');
  throw err || new Error('Gemini indisponible');
}
