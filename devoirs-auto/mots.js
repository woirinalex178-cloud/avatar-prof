// Listes de mots à mémoriser (CM1/CM2). Une liste par semaine, à savoir le lundi.
// *mot = mot invariable (en gras sur la feuille). Toutes les listes incluent les mots réservés aux CM2.
const MOTS = {
  1: 'comparer flocon récompense complet allonger annoncer mignon *sinon contraire compte',
  2: 'enlever camper enveloppe exemple trembler avancer banc puissant urgent charmant',
  3: 'grimper informer refrain médecin brun éteindre musicien *ainsi imprimante craindre',
  4: 'rencontrer accuser choc flaque accord quitter direct inquiet *puisque *quant_à',
  5: 'traverser remercier révolution respect façon rassurer scène tendresse cerveau sens',
  6: 'briser noisette horizon trésor résultat raisonnable désert vase paisiblement résister',
  7: [1, 6],
  8: 'guider bagage aigu gouverner fatigue goutte gloire grave *malgré régulier',
  9: 'surgir objet agile énergie étagère personnage joindre plongeon davantage geste',
  10: 'effort épais général installer durée paysan aimer thé *hélas détruire',
  11: 'accepter chêne fontaine satisfaire barrière jeunesse baguette peine superbe naître',
  12: 'vérifier caillou conseil noyau billet sautiller employer frayeur client meilleur',
  13: 'abandonner corbeille bal délicieux obéir faux sommeil invention *auprès type',
  14: [8, 13],
  15: 'plier odeur engager *cependant océan patron agent kilogramme couloir cruel franc',
  16: 'bonheur attacher mémoire signer *là mystérieux soigner habitude profond vallée trou',
  17: 'chaleur calme protéger *parmi végétal militaire poids assister rouleau propos affirmer',
  18: 'erreur détail craquer particulier rideau avis appartenir abriter métal nul adroit',
  19: 'humeur refuser pleine fier carnet consulter *plutôt cercle élément rhume croire',
  20: 'couvrir tiroir poussière remplacer *dès_que viser instinct terrible beauté penser suffire',
  21: [15, 20],
  22: 'victoire horloge attendre ignorer point précipiter aspect attentif pot différent tronc *selon',
  23: 'coiffer incendie faible esprit wagon arrière escalader embrasser obstacle recevoir sensible *parfois',
  24: 'joie tellement déclarer soirée liberté violent précéder confier distance envoyer berceau essayer',
  25: '*tandis_que saluer divers condamner autorité canne sévère espèce réussir évènement tente baisser',
  26: 'coûter *soit secret guerre lien expédier chagrin naturel moitié presser région exiger',
  27: '*tant construire multicolore enseigner hurler blessure humide palais expérience drap sursauter soldat',
  28: [22, 27],
  29: 'échapper bout commande projet imperméable mourir question situation série rocher souriant élever',
  30: 'système effondrer liquide lointain équiper suivant moteur se_taire seau numérique répéter plainte',
  31: 'éclairer *aussitôt manuel nécessaire participer mélodie siècle trait période brusque ombre songer',
  32: 'géant gazon serrer paraître pierre race souple succès rêver queue défaut lisse',
  33: '*dedans venger important transformer étonner bureau calendrier matière peuple immense *afin rapport',
  34: 'enfoncer fixe aventure obscur tapis fer empêcher frotter endroit sciences embellir principe',
  35: [28, 34],
};
const DERNIERE = 35;
// Lundi de référence : le lundi 16 novembre 2026, c'est la liste 9 à savoir.
const MOTS_REF = { n: 9, lundi: '2026-11-16' };
// Vacances communes à toute la France (pas de nouvelle liste ces lundis-là).
const VACANCES = [['2026-12-19', '2027-01-03']];

// Mots d'une semaine : [{ mot, inv }] (une semaine de révision regroupe les listes indiquées).
function motsDe(n) {
  const v = MOTS[n];
  if (!v) return [];
  if (Array.isArray(v)) { const o = []; for (let i = v[0]; i <= v[1]; i++) if (!Array.isArray(MOTS[i])) o.push(...motsDe(i)); return o; }
  return v.split(' ').map(m => ({ mot: m.replace('*', '').replace(/_/g, ' '), inv: m.startsWith('*') }));
}
