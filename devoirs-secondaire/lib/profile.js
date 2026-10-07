export const CLASSES = Object.freeze({
  '6e': '6e, collège, cycle 3', '5e': '5e, collège, cycle 4',
  '4e': '4e, collège, cycle 4', '3e': '3e, collège, préparation au brevet',
  '2de': 'seconde, lycée', '1re': 'première, lycée', 'terminale': 'terminale, lycée',
});
const VOIES = ['general', 'technologique', 'professionnelle'];
export function normalizeProfile(input = {}) {
  const classe = Object.hasOwn(CLASSES, input?.classe) ? input.classe : '6e';
  const lycee = ['2de', '1re', 'terminale'].includes(classe);
  return { classe, voie: lycee && VOIES.includes(input?.voie) ? input.voie : 'general' };
}
export function profileContext(input) {
  const p = normalizeProfile(input);
  const voie = { general: 'générale', technologique: 'technologique', professionnelle: 'professionnelle' }[p.voie];
  return `${CLASSES[p.classe]}${['2de', '1re', 'terminale'].includes(p.classe) ? ', voie ' + voie : ''}. Adapter le vocabulaire et la difficulté à cette classe. S’appuyer sur la leçon jointe ; pour les spécialités et séries, demander les précisions absentes.`;
}
