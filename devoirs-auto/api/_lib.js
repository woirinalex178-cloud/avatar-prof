// Outils partagés : code famille + appel Gemini (offre gratuite).
export function checkPin(req, res) {
  const pin = process.env.APP_PIN;
  if (pin && req.headers['x-pin'] !== pin) {
    res.status(401).json({ error: 'Code famille incorrect' });
    return false;
  }
  return true;
}

export async function gemini(parts, { json = true, temperature = 0.7 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY manquante');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature, ...(json && { responseMimeType: 'application/json' }) },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  const txt = d.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  return json ? JSON.parse(txt.replace(/^```json\s*|```$/g, '')) : txt;
}
