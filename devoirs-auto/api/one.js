// GET -> devoirs à venir lus dans le "Cahier de textes" de l'ENT ONE (compte parent).
// ONE n'a pas d'API publique : on se connecte comme le navigateur puis on lit le JSON de l'appli.
import { checkPin } from './_lib.js';

// ONE_URL peut être l'adresse du site ou celle d'une page copiée du navigateur : on garde le site,
// et l'identifiant du cahier de textes s'il y est (…/homeworks/id/<id>).
const RAW = process.env.ONE_URL || 'https://one.opendigitaleducation.com';
const BASE = new URL(RAW.includes('://') ? RAW : 'https://' + RAW).origin;
const CAHIER = RAW.match(/homeworks\/(?:id\/|#\/view\/)?([0-9a-f-]{20,})/i)?.[1];
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

// Parcourt le JSON : la date et la matière se transmettent aux éléments enfants
// (ex. cahier -> jour { date } -> entrées { title, value }).
function extract(node, ctx, out) {
  if (Array.isArray(node)) return node.forEach(n => extract(n, ctx, out));
  if (!node || typeof node !== 'object') return;
  const date = day(node.dueDate || node.due_date || node.plannedDate || node.date || node.day) || ctx.date;
  const mat = strip(node.subject?.label || (typeof node.subject === 'string' && node.subject) || node.matiere || node.discipline?.label || '') || ctx.mat;
  const txt = strip(node.description || node.value || node.content || node.text || '');
  const title = strip(typeof node.title === 'string' ? node.title : '');
  if (txt && date) out.push({ matiere: mat || title || 'Devoir', consigne: title && mat && title !== mat && !txt.startsWith(title) ? `${title} : ${txt}` : txt, pour: date, source: 'ONE' });
  for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object' && k !== 'owner' && k !== 'shared') extract(v, { date, mat }, out);
}

// Pas de révision pour les tâches pratiques (signatures, affaires à apporter…).
const ADMIN = /\b(faire signer|signer|signature|rapporter|apporter|ramener|permis|autorisation)\b/i;
// Classe à double niveau : « CM1: … CM2: … » -> on ne garde que la partie du niveau de l'élève.
const NIV = (process.env.NIVEAU || 'CM2').toUpperCase();
// Classe à double niveau : ne garder que ce qui concerne le niveau de l'élève.
// Gère « CM1: … CM2: … », « CM2 - … », « (CM1) … », « pour les CM2 : … », « CM1/CM2 : … », « CM1 et CM2 … »,
// les retours à la ligne, et les entrées réservées à un autre niveau (« CM1 leçon H2 »).
const NIVS = 'CP|CE1|CE2|CM1|CM2';
const MARQUE = new RegExp(`(?:\\(\\s*)?(?:pour\\s+(?:les\\s+)?)?((?:${NIVS})(?:\\s*(?:\\/|-|et|&|,)\\s*(?:${NIVS}))*)\\b\\s*\\)?\\s*[:\\-–—]?\\s*`, 'gi');
function pourNiveau(txt) {
  txt = String(txt || '').trim();
  const reperes = [...txt.matchAll(MARQUE)];
  if (!reperes.length) return txt;                                 // rien de précisé : pour toute la classe
  const niveaux = m => m[1].toUpperCase().match(new RegExp(NIVS, 'g'));
  const commun = txt.slice(0, reperes[0].index).trim();
  const pourMoi = reperes.map((m, i) => ({ niv: niveaux(m), txt: txt.slice(m.index + m[0].length, reperes[i + 1]?.index ?? txt.length).trim() }))
    .filter(x => x.niv.includes(NIV)).map(x => x.txt).filter(Boolean);
  if (pourMoi.length) return [commun, ...pourMoi].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return '';   // seulement des consignes pour d'autres niveaux (ou un intitulé commun qui les annonce) : pas pour l'élève
}
// Matière sans le niveau (« Histoire CM1 » -> « Histoire »).
const sansNiveau = m => String(m || '').replace(new RegExp(`\\b(${NIVS})\\b`, 'gi'), '').replace(/\s*[-–:/]\s*$/, '').replace(/\s+/g, ' ').trim();

// Devoirs à venir + petit diagnostic (pour comprendre si ONE change son format).
export { pourNiveau };
export async function fetchOne() {
  if (!process.env.ONE_LOGIN) return { devoirs: [], info: 'ONE non configuré' };
  const cookie = await login();
  const out = [];
  const list = await get('/homeworks/list', cookie);
  const cahiers = Array.isArray(list) ? list : [];
  if (CAHIER && !cahiers.some(h => h._id === CAHIER)) cahiers.unshift({ _id: CAHIER });
  for (const h of cahiers.slice(0, 10)) extract(await get(`/homeworks/get/${h._id}`, cookie) || h, {}, out);
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);   // 2 semaines
  const seen = new Set();
  const devoirs = out
    .map(d => {   // le niveau peut aussi être écrit dans l'intitulé de l'entrée (« HISTOIRE CM1 »)
      const niveauMatiere = d.matiere.match(new RegExp(`\\b(${NIVS})\\b`, 'gi'));
      const hors = niveauMatiere && !niveauMatiere.some(n => n.toUpperCase() === NIV);
      return { ...d, matiere: sansNiveau(d.matiere) || 'Devoir', consigne: hors ? '' : pourNiveau(d.consigne) };
    })
    .filter(d => d.consigne && !ADMIN.test(d.consigne) && d.pour >= today && d.pour <= horizon
      && !seen.has(d.pour + d.consigne) && seen.add(d.pour + d.consigne))
    .sort((a, b) => a.pour.localeCompare(b.pour));
  return { devoirs, info: `ONE connecté : ${cahiers.length} cahier(s), ${devoirs.length} devoir(s) à venir` };
}

export default async function handler(req, res) {
  if (!checkPin(req, res)) return;
  try { res.json(await fetchOne()); }
  catch (e) { res.status(502).json({ error: e.message, devoirs: [] }); }
}
