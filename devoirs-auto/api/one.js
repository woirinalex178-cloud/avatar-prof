// GET -> devoirs à venir lus dans le "Cahier de textes" de l'ENT ONE (compte parent).
// ONE n'a pas d'API publique : on se connecte comme le navigateur puis on lit le JSON de l'appli.
import { checkPin } from './_lib.js';

const BASE = (process.env.ONE_URL || 'https://one.opendigitaleducation.com').replace(/\/$/, '');
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const day = v => {
  if (!v) return '';
  const d = new Date(typeof v === 'object' ? v.$date ?? v : v);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
};

async function login() {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: process.env.ONE_LOGIN, password: process.env.ONE_PASSWORD, callBack: '' }),
  });
  const cookie = (r.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  if (!/oneSessionId=/.test(cookie)) throw new Error('Connexion ONE refusée (identifiant / mot de passe ?)');
  return cookie;
}

async function get(path, cookie) {
  const r = await fetch(BASE + path, { headers: { cookie, Accept: 'application/json' } });
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

// Parcourt le JSON et garde tout objet qui ressemble à un devoir (texte + date).
function extract(node, ctx, out) {
  if (Array.isArray(node)) return node.forEach(n => extract(n, ctx, out));
  if (!node || typeof node !== 'object') return;
  const matiere = strip(node.subject?.label || (typeof node.subject === 'string' && node.subject) || node.matiere || '') || ctx;
  const txt = strip(node.description || node.value || node.content || node.text || '');
  const pour = day(node.dueDate || node.due_date || node.date || node.plannedDate);
  if (txt && pour) out.push({ matiere: matiere || 'Devoir', consigne: txt, pour, source: 'ONE' });
  for (const v of Object.values(node)) if (v && typeof v === 'object') extract(v, matiere, out);
}

export default async function handler(req, res) {
  if (!checkPin(req, res)) return;
  if (!process.env.ONE_LOGIN) return res.json({ devoirs: [], info: 'ONE non configuré' });
  try {
    const cookie = await login();
    const out = [];
    const list = await get('/homeworks/list', cookie);
    for (const h of (Array.isArray(list) ? list : []).slice(0, 10)) {
      extract(await get(`/homeworks/get/${h._id}`, cookie) || h, strip(h.title), out);
    }
    const today = new Date().toISOString().slice(0, 10);
    const seen = new Set();
    const devoirs = out.filter(d => d.pour >= today && !seen.has(d.pour + d.consigne) && seen.add(d.pour + d.consigne))
      .sort((a, b) => a.pour.localeCompare(b.pour));
    res.json({ devoirs });
  } catch (e) {
    res.status(502).json({ error: e.message, devoirs: [] });
  }
}
