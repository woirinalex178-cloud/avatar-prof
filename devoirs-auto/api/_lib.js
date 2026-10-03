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
let picked = null;

// Choisit le modèle "flash" stable le plus récent proposé à cette clé (Google renomme souvent ses modèles).
async function pickModel(key) {
  if (picked) return picked;
  const r = await fetch(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
  if (!r.ok) throw new Error(`Gemini ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const names = ((await r.json()).models || [])
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => m.name.replace('models/', ''));
  const ver = n => parseFloat(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] || 0);
  const best = list => list.sort((a, b) => ver(b) - ver(a))[0];
  picked = best(names.filter(n => /^gemini-[\d.]+-flash(-latest)?$/.test(n)))
    || best(names.filter(n => /flash/.test(n) && !/lite|image|tts|live|audio/.test(n)))
    || 'gemini-flash-latest';
  return picked;
}

export async function gemini(parts, { json = true, temperature = 0.7 } = {}, retry = true) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY manquante');
  const env = process.env.GEMINI_MODEL;
  const model = env && env !== 'auto' && retry ? env : await pickModel(key);
  const r = await fetch(`${API}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature, ...(json && { responseMimeType: 'application/json' }) },
    }),
  });
  if (!r.ok) {
    const msg = await r.text();
    // modèle retiré ou inconnu -> on bascule une fois sur le plus récent disponible
    if (retry && (r.status === 404 || /not found|deprecat|no longer|not supported/i.test(msg))) {
      picked = null;
      return gemini(parts, { json, temperature }, false);
    }
    throw new Error(`Gemini ${r.status} (${model}) : ${msg.slice(0, 200)}`);
  }
  const d = await r.json();
  const txt = d.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  return json ? JSON.parse(txt.replace(/^```json\s*|```$/g, '')) : txt;
}
