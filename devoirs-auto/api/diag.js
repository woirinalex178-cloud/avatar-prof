// Diagnostic de la connexion ONE (protégé par ?k=CRON_SECRET). N'affiche jamais identifiant ni mot de passe.
const RAW = process.env.ONE_URL || 'https://one.opendigitaleducation.com';
const BASE = new URL(RAW.includes('://') ? RAW : 'https://' + RAW).origin;
const names = h => (h.getSetCookie?.() || []).map(c => c.split('=')[0]);

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.query.k !== process.env.CRON_SECRET) return res.status(401).end();
  const L = process.env.ONE_LOGIN || '', P = process.env.ONE_PASSWORD || '';
  const out = { base: BASE, login: { longueur: L.length, arobase: L.includes('@'), point: L.includes('.'), espaces: L !== L.trim() }, mdp: { longueur: P.length, espaces: P !== P.trim() } };
  try {
    const g = await fetch(`${BASE}/auth/login`, { redirect: 'manual' });
    const html = await g.text();
    out.page = { status: g.status, location: g.headers.get('location'), cookies: names(g.headers),
      champs: [...html.matchAll(/name="([^"]+)"/g)].map(m => m[1]).slice(0, 20),
      action: html.match(/<form[^>]*action="([^"]*)"/)?.[1], titre: html.match(/<title>([^<]*)/)?.[1] };
    const r = await fetch(`${BASE}/auth/login`, {
      method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: (g.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ') },
      body: new URLSearchParams({ email: L.trim(), password: P, callBack: '' }),
    });
    const body = await r.text();
    out.post = { status: r.status, location: r.headers.get('location'), cookies: names(r.headers), extrait: body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300) };
  } catch (e) { out.erreur = e.message; }
  res.json(out);
}
