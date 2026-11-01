// Guide des échanges : protocole pas à pas + FAQ « bien préparer son envoi »
const STEPS = [
  ['🤝', 'Offre', 'Tu proposes un prix ou un échange sur un double posé sur la table.'],
  ['✅', 'Acceptation', 'Le propriétaire accepte. Les cartes concernées sont réservées.'],
  ['🔒', 'Paiement bloqué', 'Achat : tu paies dans l\'appli, l\'argent est bloqué (séquestre). Échange pur : l\'acceptation suffit.'],
  ['🏠', 'Adresses', 'L\'adresse de l\'autre membre apparaît, uniquement pour cette transaction.'],
  ['📦', 'Envoi sous 5 jours', 'Bordereau prépayé téléchargeable dans l\'offre (point relais ou Colissimo) : on l\'imprime, on le colle, on dépose. Le suivi se remplit tout seul. Option : Lettre suivie achetée soi-même.'],
  ['🔍', 'Réception', 'Tu vérifies la carte (contrôle d\'authenticité photo possible) puis tu confirmes.'],
  ['💶', 'Versement + avis', 'L\'argent part au vendeur. Sans réponse 7 jours après l\'arrivée, il est versé automatiquement. Chacun laisse un avis.'],
  ['⚖️', 'Problème ?', 'Carte absente, abîmée ou fausse : ouvre un litige AVANT de confirmer. L\'argent reste bloqué pendant l\'examen.']
];
// Bonnes pratiques : avant l'envoi, il y a tout ce qui évite les problèmes
const USAGE = [
  ['Comment juger l\'état de ma carte ?', `<p>Regarde la carte sous une <b>lumière rasante</b>, recto puis verso, et vérifie 5 choses : les <b>coins</b> (blanchiment, pliure), les <b>bords</b>, la <b>surface</b> (rayures, traces de doigt), le <b>centrage</b> et la <b>brillance</b>.</p>
  <ul><li><b>NM — Near Mint</b> : comme sortie du booster. Aucun défaut visible à l'œil nu.</li>
  <li><b>EX — Excellent</b> : micro-défauts, un très léger blanchiment sur un bord ou un coin.</li>
  <li><b>GD — Bon</b> : usure nette, coins ou bords marqués, petites rayures visibles.</li>
  <li><b>PL — Joué</b> : pliure, rayure profonde, usure forte, traces d'eau.</li></ul>
  <p>Dans le doute, <b>descends d'un cran</b> : un acheteur déçu ouvre un litige, un acheteur surpris en bien laisse 5 étoiles. Décris les défauts dans la note de l'annonce et photographie-les.</p>`],
  ['La cote affichée, ça veut dire quoi ?', `<p>La cote vient de données publiques (Cardmarket / TCGplayer via TCGdex) et décrit une carte <b>Near Mint</b>. L'appli en déduit une fourchette : environ ×0,85 en EX, ×0,65 en GD, ×0,40 en PL.</p>
  <p>C'est un <b>ordre de grandeur</b>, pas un prix garanti : l'édition, la demande du moment et l'état réel décident. Les <b>cartes japonaises ne sont pas cotées en Europe</b> : l'appli affiche alors, à titre indicatif, la cote de la version anglaise de la même carte quand elle existe.</p>
  <p class="small mut">Sharing Cards n'intervient jamais dans le prix : c'est le vendeur qui le fixe et l'acheteur qui accepte.</p>`],
  ['Les pièges à connaître', `<ul>
  <li><b>« On fait ça en direct, ce sera plus simple »</b> → non. Hors de l'appli, il n'y a ni paiement bloqué, ni litige, ni recours. C'est le signal d'arnaque n°1, et c'est interdit par la charte.</li>
  <li><b>Photo trop belle ou introuvable ailleurs</b> → exige la photo avec le <b>code de vérification</b> visible. Sans ce code, la photo peut venir d'internet.</li>
  <li><b>« Confirme vite la réception, j'ai besoin de l'argent »</b> → prends ton temps : tant que tu n'as pas confirmé, tu es protégé.</li>
  <li><b>Prix très en dessous de la cote sur une carte chère</b> → méfiance : contrefaçon ou carte abîmée non déclarée.</li>
  <li><b>Fausses cartes</b> : au doigt, une fausse est souvent plus lisse et plus légère ; à la lampe, elle laisse passer beaucoup plus de lumière. Lance le contrôle photo à la réception.</li></ul>`],
  ['Que faire à la réception ?', `<ol><li><b>Filme l'ouverture</b> du colis d'un seul plan, sans coupure : c'est ta preuve si la carte est absente ou cassée.</li>
  <li>Vérifie l'état annoncé et lance le <b>contrôle d'authenticité</b> depuis l'offre.</li>
  <li>Tout est conforme → <b>J'ai reçu la carte</b>, et laisse un avis.</li>
  <li>Un problème → <b>n'appuie pas sur « reçu »</b> : ouvre un litige avec tes photos. L'argent reste bloqué.</li></ol>
  <p class="small mut">Sans réponse de ta part, l'argent est versé automatiquement 7 jours après la livraison.</p>`],
  ['Vendre ou échanger proprement', `<ul><li>On ne pose que ses <b>doubles</b> : la carte doit être au moins en ×2 dans ton classeur.</li>
  <li>Photographie <b>ta</b> carte, pas l'image officielle, avec le code de vérification.</li>
  <li>Annonce l'état <b>honnêtement</b> et signale le moindre défaut.</li>
  <li>Expédie <b>sous 5 jours</b> et colle le numéro de suivi dans l'offre.</li>
  <li>Réponds dans la messagerie : un vendeur qui répond rassure et vend mieux.</li>
  <li>Un envoi = <b>un suivi</b>. Jamais de lettre simple, même pour une carte à 2 €.</li></ul>`],
  ['Mes données, ma sécurité', `<ul><li>Ton adresse n'est jamais publique : elle n'apparaît à ton partenaire qu'une fois la transaction payée ou l'échange accepté.</li>
  <li>Téléphone, e-mail, réseaux sociaux, IBAN : <b>bloqués</b> dans les annonces et la messagerie, <b>masqués</b> (######) dans le forum et le blog.</li>
  <li>Tes coordonnées bancaires restent chez Stripe : le site ne les voit jamais.</li>
  <li>Tu peux télécharger toutes tes données ou supprimer ton compte depuis <a href="#/compte">Compte → Mes données</a>.</li></ul>`]
];
const FAQ = [
  ['Quel matériel faut-il ?', `<ul><li><b>Sleeve</b> (pochette souple) : la carte entre dedans en premier.</li><li><b>Toploader</b> (étui rigide) : la carte sous sleeve glisse dedans.</li><li><b>Scotch de peintre</b> ou une languette pour fermer le toploader (jamais de scotch sur la carte).</li><li>Un <b>carton rigide</b> de chaque côté (type dos de bloc-notes).</li><li>Une <b>enveloppe à bulles</b> ou une enveloppe rigide.</li></ul><p class="small mut">Budget : environ 0,30 € par envoi si tu achètes sleeves et toploaders par lots.</p>`],
  ['Comment emballer, étape par étape ?', `<ol><li>Carte → sleeve.</li><li>Sleeve → toploader, ouverture fermée par une languette de scotch de peintre.</li><li>Toploader entre deux cartons, maintenus par un élastique ou du scotch.</li><li>Le tout dans l'enveloppe à bulles. Secoue : rien ne doit bouger.</li><li>Écris « <b>Ne pas plier</b> » au recto.</li><li>Colle l'étiquette imprimée depuis l'offre (ou recopie l'adresse lisiblement).</li></ol>`],
  ['Quel envoi choisir ?', `<ul><li><b>Moins de 50 €</b> : <b>Lettre suivie</b> (La Poste, en ligne ou au guichet, environ 2 à 3 €).</li><li><b>50 € et plus</b> : <b>Colissimo</b> ou envoi <b>recommandé</b> avec la valeur déclarée (assurance).</li><li>Point relais (Mondial Relay, Relais Colis) : possible, avec suivi.</li><li>Jamais de lettre simple : sans numéro de suivi, pas de protection.</li></ul><p class="small mut">Tarifs indicatifs, à vérifier sur le site du transporteur.</p>`],
  ['Acheter la Lettre suivie sans aller à la Poste ?', `<p>Oui : sur <a href="https://www.laposte.fr/lettre-suivie" target="_blank" rel="noopener">laposte.fr/lettre-suivie</a>, tu paies en ligne, tu imprimes l'étiquette (ou tu écris le code sur l'enveloppe) et tu déposes dans une boîte aux lettres. Le numéro de suivi est donné tout de suite : colle-le dans l'appli.</p>`],
  ['Faut-il prendre des photos ?', `<p>Oui, c'est ta meilleure preuve : la carte recto/verso, puis le colis fermé avec l'étiquette. Garde aussi la <b>preuve de dépôt</b> jusqu'à la fin de la transaction.</p>`],
  ['Et à l\'étranger ?', `<p>Utilise un envoi international suivi (Lettre internationale suivie, Colissimo International). Les délais sont plus longs : préviens l'autre membre dans la messagerie de l'offre.</p>`],
  ['Le colis est perdu ou la carte arrive abîmée ?', `<p>Ne confirme pas la réception. Ouvre un <b>litige</b> depuis l'offre avec des photos. L'argent reste bloqué. Si l'emballage respectait ce guide et que l'envoi était assuré, l'expéditeur fait la réclamation auprès du transporteur.</p>`],
  ['Pourquoi je ne vois pas l\'adresse avant ?', `<p>Pour ta sécurité : l'adresse n'est révélée qu'à ton partenaire, et seulement une fois la transaction payée ou l'échange accepté. Elle n'est jamais publique. Renseigne la tienne dans <a href="#/compte">Compte → Mon adresse d'expédition</a>.</p>`]
];
// ancres pour les liens contextuels (#/guide/emballer…)
const SID = { 2: 'paiement', 4: 'envoi-delai', 7: 'litige' }, FID = { 0: 'materiel', 1: 'emballer', 2: 'envoi', 6: 'perdu' };
export function renderGuide() {
  return `<div style="max-width:820px;margin:auto">
  <h1 style="font-size:clamp(24px,4vw,34px);margin-top:18px">Guide des échanges</h1>
  <p class="lead mut">Comment se passe une transaction sur Sharing Cards, et comment bien préparer ton envoi.</p>
  <h2 id="g-protocole">Le protocole, étape par étape</h2>
  <ol class="proto">${STEPS.map(([i, t, d], n) => `<li class="panel" id="g-${SID[n] || 's' + n}"><span class="pi">${i}</span><div><b>${n + 1}. ${t}</b><p class="small mut">${d}</p></div></li>`).join('')}</ol>
  <h2 id="g-usage">Bien utiliser Sharing Cards</h2>
  <p class="small mut">Six réflexes qui évitent 90 % des problèmes : état, prix, pièges, réception, bonnes manières, données.</p>
  <div class="faq">${USAGE.map(([q, a], n) => `<details class="panel" id="g-u${n}"><summary>${q}</summary><div class="small">${a}</div></details>`).join('')}</div>
  <h2>Bien préparer son envoi</h2>
  <div class="faq">${FAQ.map(([q, a], n) => `<details class="panel" id="g-${FID[n] || 'f' + n}" ${n === 0 ? 'open' : ''}><summary>${q}</summary><div class="small">${a}</div></details>`).join('')}</div>
  <p class="disc" style="margin-top:18px">⚠️ Sharing Cards héberge des annonces entre particuliers : le site n'est ni vendeur, ni acheteur, ni expert. Les cotes sont indicatives et ne valent pas conseil d'achat ou d'investissement ; le contrôle d'authenticité est une aide automatique qui ne remplace pas une expertise ; le transport relève du transporteur choisi. Les conseils de ce guide sont donnés à titre informatif et n'engagent pas la responsabilité du site.</p>
  <p class="small mut">Voir aussi : <a href="#/regles">Charte & sécurité</a> · <a href="#/legal/cgv">Conditions de vente</a> · <a href="#/legal/cgu">CGU</a></p></div>`;
}
