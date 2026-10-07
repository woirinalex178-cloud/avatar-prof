// Tâche automatique (chaque jour, lancée par Vercel) : lit le connecteur configuré, ajoute les nouveaux devoirs
// Activation après validation du connecteur et de la sauvegarde, voir README.
import { fetchHomework } from './integrations.js';
import { normalizeProfile } from '../lib/profile.js';
import { makePack } from './generate.js';
import { famille, rpc, merge } from './sync.js';

const idOf = d => (d.pour + '|' + d.matiere + '|' + d.consigne).toLowerCase().replace(/\s+/g, ' ');

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();
  const t0 = Date.now();
  try {
    const { devoirs: lus, info, connected } = await fetchHomework();
    if (!connected) return res.status(503).json({ error: info });
    if (!process.env.APP_PIN || !process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) return res.status(503).json({ error: 'Accès privé et sauvegarde à configurer.' });
    const profil = normalizeProfile({ classe: process.env.STUDENT_CLASS, voie: process.env.STUDENT_TRACK });
    const id = famille(process.env.APP_PIN || '');
    let S = merge(await rpc('devoirs_get', { p_famille: id }), {});
    const today = new Date().toISOString().slice(0, 10);
    const nouveaux = lus.map(d => ({ ...d, profil, id: profil.classe + '|' + profil.voie + '|' + idOf(d) })).filter(d => !S.devoirs.some(o => o.id === d.id) && !S.deleted[d.id]);
    S.devoirs.push(...nouveaux);
    let prepares = 0;
    for (const d of S.devoirs.filter(d => d.pour >= today && !S.packs[d.id])) {
      if (Date.now() - t0 > 35000) break;   // limite de temps du plan gratuit : le reste au prochain passage / à l'ouverture
      const p = { ...(await makePack(d, today)), at: Date.now() };
      S.packs[d.id] = p;
      S.fiches[d.id] = { matiere: d.matiere, consigne: d.consigne, profil: d.profil, titre: p.titre, type: p.type, fiche: p.fiche || {}, date: today, at: Date.now() };
      prepares++;
    }
    // relit juste avant d'écrire pour ne rien écraser fait entre-temps sur un appareil
    S = merge(await rpc('devoirs_get', { p_famille: id }), S);
    await rpc('devoirs_put', { p_famille: id, p_data: S });
    res.json({ info, nouveaux: nouveaux.length, prepares });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
