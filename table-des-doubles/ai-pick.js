// Le « choix de l'IA » : relier ce que l'IA a lu (nom, numéro, langue) à une carte du catalogue.
// Règle : un numéro seul ne suffit pas. La carte de l'IA porte le nom lu, le numéro lu et la langue lue.
// Module sans dépendance : testé tel quel par .github/scripts/test-ai-pick.mjs

// nom comparable : sans accents, casse, espaces ni ponctuation (Pikachu-ex = pikachu ex)
export const nkey = s => String(s || '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
// numéro comparable : 030 = 30, tg05 = TG05
export const numKey = x => String(x ?? '').replace(/\s/g, '').replace(/^0+/, '').toUpperCase();

// la lecture de l'IA, si elle a vu une carte et lu au moins un nom ou un numéro
export const aiRead = h => { const r = h?.read; return r && r.is_card !== false && (r.name || r.name_en || r.number) ? r : null; };

const lev = (a, b) => {
  let p = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const q = [i];
    for (let j = 1; j <= b.length; j++) q[j] = Math.min(p[j] + 1, q[j - 1] + 1, p[j - 1] + (a[i - 1] !== b[j - 1]));
    p = q;
  }
  return p[b.length];
};
// deux noms désignent la même carte : égaux, l'un contient l'autre (suffixe V, ex, VMAX…),
// ou une lettre mal lue sur un nom assez long
const sameName = (k, n) => {
  if (k === n) return true;
  const [s, l] = k.length < n.length ? [k, n] : [n, k];
  if (s.length >= 3 && l.includes(s) && s.length / l.length >= .6) return true;
  return l.length >= 5 && lev(k, n) <= Math.max(1, Math.floor(l.length / 6));
};
// la carte porte le nom lu par l'IA (dans la langue imprimée ou en anglais). Sans nom lu : rien à contredire.
export function nameOk(c, r) {
  const ns = [r?.name, r?.name_en].map(nkey).filter(n => n.length >= 2);
  if (!ns.length) return true;
  return [c?.name, c?.name_fr].map(nkey).filter(Boolean).some(k => ns.some(n => sameName(k, n)));
}
// LA carte lue : même nom, même numéro, même langue
export const isExact = (c, r) => !!(r && c && numKey(r.number) && numKey(c.local_id) === numKey(r.number)
  && c.lang === String(r.language || '').toLowerCase() && nameOk(c, r));

// Marque et range : la carte lue (aiPick), puis celles qui portent son nom (aiName),
// dans la langue lue d'abord, au numéro lu d'abord, puis l'ordre du serveur.
export function aiSort(list, r) {
  const L = String(r?.language || '').toLowerCase(), N = numKey(r?.number), named = !!(r?.name || r?.name_en);
  const num = c => !!N && numKey(c.local_id) === N;
  return list.map(c => ({ ...c, aiPick: isExact(c, r), aiName: named && nameOk(c, r) }))
    .sort((a, b) => (b.aiPick - a.aiPick) || (b.aiName - a.aiName) || ((b.lang === L) - (a.lang === L))
      || (num(b) - num(a)) || ((b.score || 0) - (a.score || 0)));
}

// « sûre » : une seule carte a le nom, le numéro et la langue lus (ou nettement mieux notée que sa jumelle)
export function aiSure(list) {
  const ex = list.filter(c => c.aiPick);
  return ex.length === 1 || (ex.length > 1 && (ex[0].score || 0) - (ex[1].score || 0) >= 3);
}
