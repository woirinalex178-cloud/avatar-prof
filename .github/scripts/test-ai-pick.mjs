// Test du « choix de l'IA » (table-des-doubles/ai-pick.js) sur des cartes réelles du catalogue.
// Lancer : node .github/scripts/test-ai-pick.mjs
import { aiSort, aiSure, isExact, nameOk } from '../../table-des-doubles/ai-pick.js';

let ko = 0;
const check = (nom, cond, info = '') => { console.log(`${cond ? 'OK ' : 'KO '} ${nom}${cond ? '' : ' — ' + info}`); if (!cond) ko++; };
const C = (id, name, local_id, score, name_fr = null) => ({ id, name, name_fr, lang: id.split(':')[0], local_id, score });

// 1. Capture du 13/11 : l'IA lit « 마이농 (Minun) 030/067 KO », le catalogue n'a aucun Minun n° 030.
//    Le serveur renvoyait des 030/067 sans rapport (Garbodor V, Mesprit…) : aucun ne doit passer pour sa carte.
const minun = { name: '마이농', name_en: 'Minun', number: '030', total: '067', language: 'ko' };
const srv = [C('ko:S7D-030', '더스트나V', '030', 11), C('ko:S10P-030', '엠라이트', '030', 11), C('ja:S10P-030', 'エムリット', '030', 9),
  C('ja:S9a-030', 'ムウマ', '030', 9), C('ko:SV3a-015', '마이농', '015', 7), C('en:sv04-061', 'Minun', '061', 4), C('ko:SM7-036', '마이농', '036', 7)];
let l = aiSort(srv, minun);
check('Minun 030 : aucune carte prise pour celle de l\'IA', !l.some(c => c.aiPick), l.filter(c => c.aiPick).map(c => c.id).join());
check('Minun 030 : pas « sûre »', !aiSure(l));
check('Minun 030 : les Minun coréens passent en tête', l[0].id.startsWith('ko:') && l[0].name === '마이농' && l[1].name === '마이농', l.slice(0, 3).map(c => c.id).join());
check('Minun 030 : Garbodor V n\'a pas le nom lu', !l.find(c => c.id === 'ko:S7D-030').aiName);

// 2. Ancien défaut : un seul 030/067 coréen au catalogue -> l'ancien barème l'ouvrait d'office (11 points).
l = aiSort([C('ko:S7D-030', '더스트나V', '030', 11), C('ja:S7D-030', 'ダストダスV', '030', 7)], minun);
check('Un seul 030/067 d\'un autre nom : jamais ouvert d\'office', !aiSure(l) && !l.some(c => c.aiPick));

// 3. Lecture juste (Mesprit coréen 030/067) : sa carte en tête, ouverte d'office.
const mesprit = { name: '엠라이트', name_en: 'Mesprit', number: '030', total: '067', language: 'ko' };
l = aiSort(srv, mesprit);
check('Mesprit : la carte de l\'IA est la bonne', l[0].id === 'ko:S10P-030' && l[0].aiPick, l[0].id);
check('Mesprit : une seule carte de l\'IA, donc sûre', l.filter(c => c.aiPick).length === 1 && aiSure(l));

// 4. Une lettre mal lue (Négapl au lieu de Négapi) : c'est quand même sa carte.
const neg = { name: 'Négapl', name_en: 'Minun', number: '061', total: '182', language: 'fr' };
l = aiSort([C('en:sv04-061', 'Minun', '061', 9), C('fr:sv04-194', 'Négapi', '194', 6), C('fr:sv04-061', 'Négapi', '061', 12)], neg);
check('Négapl lu -> Négapi 061 FR', l[0].id === 'fr:sv04-061' && l[0].aiPick && aiSure(l), l[0].id);

// 5. Suffixe oublié par l'IA (« Aquali » pour « Aquali VMAX »), numéro sans zéro au catalogue (30 = 030).
check('Aquali 030 -> Aquali VMAX n° 30', isExact(C('fr:swsh7-30', 'Aquali VMAX', '30'), { name: 'Aquali', number: '030', language: 'fr' }));
check('Aquali 030 -> pas Suicune V', !isExact(C('fr:swsh7-31', 'Suicune V', '30'), { name: 'Aquali', number: '030', language: 'fr' }));

// 6. Noms voisins mais différents : Mew n'est pas Mewtwo.
check('Mew n\'est pas Mewtwo', !nameOk(C('en:x-030', 'Mewtwo', '030'), { name: 'Mew' }));
check('Mew = Mew ex', nameOk(C('en:x-030', 'Mew ex', '030'), { name: 'Mew' }));

// 7. Sans nom lu (numéro et langue seulement) : la seule carte qui colle est sûre.
l = aiSort([C('ko:SV2a-025', '피카츄', '025', 11, 'Pikachu'), C('ja:SV2a-025', 'ピカチュウ', '025', 9, 'Pikachu')], { number: '025', language: 'ko' });
check('Sans nom : 025 coréen unique', l[0].id === 'ko:SV2a-025' && aiSure(l));

// 8. Langue imprimée décisive : Pikachu coréen, pas le japonais ni le français au même numéro.
l = aiSort([C('ja:SV2a-025', 'ピカチュウ', '025', 9, 'Pikachu'), C('fr:sv03.5-025', 'Pikachu', '025', 8), C('ko:SV2a-025', '피카츄', '025', 12, 'Pikachu')],
  { name: '피카츄', name_en: 'Pikachu', number: '025', total: '165', language: 'ko' });
check('Pikachu KO : seule la coréenne est la carte de l\'IA', l.filter(c => c.aiPick).map(c => c.id).join() === 'ko:SV2a-025', l.filter(c => c.aiPick).map(c => c.id).join());

console.log(ko ? `\n${ko} échec(s)` : '\nTout est bon.');
process.exit(ko ? 1 : 0);
