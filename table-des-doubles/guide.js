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
export function renderGuide() {
  return `<div style="max-width:820px;margin:auto">
  <h1 style="font-size:clamp(24px,4vw,34px);margin-top:18px">Guide des échanges</h1>
  <p class="lead mut">Comment se passe une transaction sur Sharing Cards, et comment bien préparer ton envoi.</p>
  <h2>Le protocole, étape par étape</h2>
  <ol class="proto">${STEPS.map(([i, t, d], n) => `<li class="panel"><span class="pi">${i}</span><div><b>${n + 1}. ${t}</b><p class="small mut">${d}</p></div></li>`).join('')}</ol>
  <h2>Bien préparer son envoi</h2>
  <div class="faq">${FAQ.map(([q, a], n) => `<details class="panel" ${n === 0 ? 'open' : ''}><summary>${q}</summary><div class="small">${a}</div></details>`).join('')}</div>
  <p class="small mut" style="margin-top:18px">Voir aussi : <a href="#/regles">Charte & sécurité</a> · <a href="#/legal/cgv">Conditions de vente</a></p></div>`;
}
