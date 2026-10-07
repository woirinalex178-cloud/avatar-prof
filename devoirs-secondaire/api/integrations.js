// Point d'entrée commun pour le cahier de textes. Aucun identifiant scolaire côté client.
// Pronote / autres ENT : adaptateurs à implémenter et valider avant activation.
import { checkPin } from './_lib.js';
export async function fetchHomework() {
  const provider = process.env.HOMEWORK_PROVIDER || 'manual';
  if (provider === 'one') {
    if (!process.env.ONE_LOGIN || !process.env.ONE_PASSWORD) {
      return { connected: false, devoirs: [], info: 'ONE : compte non configuré.' };
    }
    const { fetchOne } = await import('./one.js');
    const result = await fetchOne();
    return { ...result, connected: true, info: result.info || 'Lecture ONE terminée.' };
  }
  return {
    connected: false, provider, devoirs: [],
    info: provider === 'pronote'
      ? 'Pronote : connecteur à développer et à tester avec ton établissement. Import par photo, fichier ou texte disponible.'
      : 'Import par photo, fichier ou texte actif. Connexions Pronote et ENT à configurer et valider.',
  };
}
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!checkPin(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  try { res.json(await fetchHomework()); }
  catch { res.status(502).json({ error: 'La connexion au cahier de textes a échoué. Tu peux importer le devoir manuellement.' }); }
}
