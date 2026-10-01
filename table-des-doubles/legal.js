// Textes légaux. À COMPLÉTER : remplis l'objet LEGAL une fois la micro-entreprise créée.
// Modèles rédigés pour une place de marché entre particuliers en France. À faire relire par un professionnel avant l'ouverture au public.
export const LEGAL = {
  site: 'Sharing Cards', url: 'https://table-des-doubles.vercel.app',
  editeur: 'Alexandre Woirin', statut: 'Entrepreneur individuel (micro-entreprise)',
  siret: '106 507 239 00015', adresse: '36 rue Sheffer, 75016 Paris',
  email: 'contact@celesteroom.com', directeur: 'Alexandre Woirin',
  mediateur: '[À COMPLÉTER : nom et site du médiateur de la consommation]',
  maj: '1er octobre 2026'
};
const L = LEGAL;

const SECTIONS = [
['mentions', 'Mentions légales', `
<p><b>Éditeur :</b> ${L.editeur}, ${L.statut}. SIRET : ${L.siret}. Adresse : ${L.adresse}. Contact : ${L.email}.</p>
<p><b>Directeur de la publication :</b> ${L.directeur}.</p>
<p><b>Hébergement du site :</b> Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis (vercel.com).<br>
<b>Hébergement des données :</b> Supabase Inc., 970 Toa Payoh North #07-04, Singapour 318992 (supabase.com), serveurs situés à Paris (Union européenne).</p>
<p><b>Propriété intellectuelle :</b> le site, son code, sa marque et son design appartiennent à l'éditeur. Les noms, images et illustrations des cartes Pokémon® sont la propriété de Nintendo, The Pokémon Company, Creatures et Game Freak. ${L.site} est un service indépendant, <b>non affilié, non sponsorisé et non approuvé</b> par ces sociétés. Les images de cartes proviennent de la base communautaire TCGdex et sont affichées à titre d'identification.</p>
<p><b>Cotes :</b> indicatives, issues de données publiques (Cardmarket, TCGplayer via TCGdex). Elles ne constituent ni une estimation officielle ni un conseil financier.</p>`],

['cgu', 'Conditions générales d\'utilisation (CGU)', `
<h4>1. Objet</h4><p>${L.site} permet aux collectionneurs de gérer leur collection de cartes (« classeur »), de publier des annonces pour leurs doubles et de conclure des ventes ou des échanges entre particuliers. L'éditeur agit comme <b>intermédiaire technique</b> : il n'est ni vendeur ni acheteur des cartes.</p>
<h4>2. Acceptation</h4><p>L'inscription vaut acceptation des présentes CGU, des Conditions de vente et de la Politique de confidentialité. Les CGU peuvent évoluer ; les membres sont informés des changements importants.</p>
<h4>3. Accès réservé aux majeurs</h4><p>La création d'un compte et toute transaction sont <b>réservées aux personnes âgées de 18 ans ou plus</b>. La date de naissance est contrôlée à l'inscription et ne peut pas être modifiée. Les vendeurs qui reçoivent de l'argent font vérifier leur identité par notre prestataire de paiement (Stripe). Toute fausse déclaration entraîne la fermeture du compte. Le classeur en mode invité (sans compte) reste accessible à tous.</p>
<h4>4. Compte</h4><p>Un seul compte par personne. Le membre garde ses identifiants secrets et est responsable de l'activité de son compte. Le pseudo ne doit pas contenir de coordonnées ni porter atteinte aux droits d'autrui.</p>
<h4>5. Règles de la place de marché</h4><ul>
<li><b>Tout passe par l'appli</b> : offres, messages, paiement, suivi d'envoi. Il est interdit de conclure ou de proposer une transaction en dehors de ${L.site}.</li>
<li><b>Collectionneurs uniquement</b> : ${L.site} est réservé aux particuliers collectionneurs. Seuls les doubles peuvent être mis en vente ou à l'échange (carte présente au moins en ×2 dans le classeur), dans la limite de 3 annonces par carte et 30 annonces actives. Les professionnels et l'activité de revente habituelle sont interdits ; l'éditeur peut fermer un compte qui détourne le service à cette fin.</li>
<li><b>Aucune coordonnée</b> : téléphone, e-mail, adresse, réseaux sociaux, liens, IBAN ou rendez-vous « en main propre » sont interdits dans les annonces, messages, pseudos et forum. Un filtre automatique les bloque.</li>
<li><b>Annonces honnêtes</b> : carte réellement possédée, état décrit fidèlement (NM, EX, GD, PL), photo de la carte réelle avec le code de vérification lorsqu'elle est demandée.</li>
<li><b>Contrefaçons, reproductions et « proxies » interdits</b>, ainsi que toute carte volée ou tout objet autre qu'une carte à collectionner.</li>
<li><b>Envoi suivi obligatoire</b>, carte protégée (sleeve + toploader + enveloppe rigide).</li>
<li><b>Respect</b> : pas d'insultes, de harcèlement, de spam ni de contenu illicite dans le forum et les messages.</li></ul>
<h4>6. Contrôle d'authenticité</h4><p>Le contrôle photo proposé par l'appli fournit des <b>indices</b> calculés automatiquement. Il ne constitue ni une expertise ni une garantie d'authenticité et n'engage pas la responsabilité de l'éditeur.</p>
<h4>7. Modération et sanctions</h4><p>Tout membre peut signaler une annonce, un message ou un membre. L'éditeur peut retirer un contenu, suspendre ou fermer un compte en cas de manquement aux CGU, après information du membre sauf urgence (fraude, contrefaçon, sécurité). Le membre peut contester par e-mail à ${L.email}.</p>
<h4>8. Responsabilité</h4><p>Chaque membre est responsable de ses annonces, de ses cartes et du respect de ses engagements. L'éditeur met en œuvre des moyens raisonnables pour sécuriser les transactions (paiement bloqué jusqu'à réception, litiges, plafonds pour les nouveaux comptes) mais ne garantit pas la qualité, l'authenticité ou la conformité des cartes, ni la disponibilité permanente du service.</p>
<h4>9. Fin du compte</h4><p>Le membre peut supprimer son compte à tout moment depuis la page Compte, une fois ses transactions en cours terminées.</p>
<h4>10. Droit applicable</h4><p>Les présentes CGU sont soumises au droit français. En cas de litige, une solution amiable est recherchée en priorité ; à défaut, les tribunaux français sont compétents, sous réserve des règles protectrices du consommateur.</p>`],

['cgv', 'Conditions de vente et frais (CGV)', `
<h4>1. Qui vend ?</h4><p>Les ventes et échanges sont conclus <b>directement entre membres particuliers</b>. L'éditeur vend uniquement un service : la <b>protection acheteur</b> (paiement sécurisé, séquestre, médiation).</p>
<h4>2. Frais</h4><ul>
<li><b>Vendeur : 0 %.</b> Le vendeur reçoit l'intégralité du prix affiché.</li>
<li><b>Acheteur : protection acheteur de 0,50 € + 3 % du prix de la carte</b>, affichée avant validation.</li>
<li><b>Livraison :</b> pour un achat, l'acheteur choisit le mode d'envoi et paie les frais de port avec sa commande (point relais ou Colissimo domicile, bordereau prépayé fourni au vendeur), ou « Lettre suivie » organisée par le vendeur. Pour un échange, chaque membre paie le bordereau de son propre envoi. En cas d'annulation avant dépôt du colis, les frais de port sont remboursés.</li>
<li><b>Échange carte contre carte : gratuit pendant la bêta.</b> Un tarif (0,99 € par personne) pourra être introduit ; il sera annoncé avant toute application. Chaque membre reçoit 3 échanges offerts à l'inscription, et 1 de plus par parrainage validé (le filleul reçoit 1 échange à l'inscription avec le code ; le parrain reçoit le sien quand le filleul termine sa première transaction). Les échanges offerts n'ont aucune valeur monétaire et ne sont ni cessibles ni remboursables.</li></ul>
<h4>3. Paiement et séquestre</h4><p>Le paiement est traité par <b>Stripe</b> (établissement de paiement agréé). L'argent n'est jamais détenu par l'éditeur : il reste bloqué chez Stripe jusqu'à ce que l'acheteur confirme la réception, ou automatiquement 7 jours après l'envoi suivi sans litige. Le vendeur est alors payé sur son compte vendeur Stripe.</p>
<h4>4. Plafonds de sécurité</h4><p>Tant qu'un des deux membres compte moins de 3 transactions réussies, une transaction est limitée à 100 €.</p>
<h4>5. Litiges et remboursement</h4><p>En cas de carte non reçue, non conforme à l'annonce ou suspecte, l'acheteur ouvre un litige depuis l'offre <b>avant de confirmer la réception</b>. L'argent reste bloqué pendant l'examen. Si le litige est fondé, l'acheteur est remboursé (prix + protection acheteur) après retour éventuel de la carte. La protection acheteur n'est pas remboursée en cas d'annulation de la part de l'acheteur après paiement sans faute du vendeur.</p>
<h4>6. Droit de rétractation</h4><p>Les ventes entre particuliers ne relèvent pas du droit de rétractation du Code de la consommation. La <b>protection acheteur</b> est un service exécuté immédiatement à la demande de l'acheteur : en payant, celui-ci accepte son exécution immédiate et renonce au délai de rétractation pour ce service (article L221-28 du Code de la consommation). Il conserve la procédure de litige ci-dessus.</p>
<h4>7. Médiation</h4><p>En cas de litige avec l'éditeur non résolu par écrit à ${L.email}, le consommateur peut recourir gratuitement au médiateur de la consommation : ${L.mediateur}. Plateforme européenne : ec.europa.eu/consumers/odr.</p>`],

['plateforme', 'Fonctionnement de la plateforme', `
<p>Informations fournies en application de l'article L111-7 du Code de la consommation.</p>
<ul><li><b>Qui vend :</b> des particuliers. Le droit de la consommation (garanties légales, rétractation) ne s'applique pas aux ventes entre particuliers.</li>
<li><b>Qui peut vendre :</b> uniquement des particuliers collectionneurs, pour leurs doubles (au moins ×2 dans le classeur ; 3 annonces maximum par carte, 30 annonces actives). Aucun vendeur professionnel n'est accepté.</li>
<li><b>Classement des annonces :</b> par défaut de la plus récente à la plus ancienne. Tris proposés : prix croissant, « meilleure affaire » (prix rapporté à la cote), « il me manque » (cartes absentes de ton classeur). Aucun vendeur ne peut payer pour être mieux classé.</li>
<li><b>Rémunération de la plateforme :</b> uniquement la protection acheteur (0,50 € + 3 %). Aucune commission vendeur, aucune publicité.</li>
<li><b>Avis :</b> seuls les membres ayant terminé une transaction ensemble peuvent se noter. Les avis ne sont ni achetés ni filtrés, sauf contenu illicite.</li>
<li><b>Badges :</b> « ✔ identité vérifiée » signifie que Stripe a vérifié l'identité du vendeur ; « IA » affiche le score du contrôle photo, qui est indicatif.</li></ul>`],

['confidentialite', 'Politique de confidentialité (RGPD)', `
<p><b>Responsable du traitement :</b> ${L.editeur}, ${L.adresse}, ${L.email}.</p>
<h4>Données collectées</h4><ul>
<li><b>Compte :</b> e-mail, mot de passe (chiffré), pseudo, date de naissance (vérification 18+, jamais affichée), région (facultative).</li>
<li><b>Adresse postale :</b> conservée dans un espace privé ; communiquée uniquement à l'autre membre d'une transaction, une fois celle-ci payée (ou l'échange accepté), pour l'expédition. Jamais affichée publiquement.</li>
<li><b>Profil public :</b> pseudo, avatar, bio, Pokémon préféré, région, avis ; collection et trophées seulement si tu choisis de les montrer.</li>
<li><b>Utilisation :</b> classeur, annonces et photos, offres, messages, avis, messages du forum, signalements, contrôles d'authenticité.</li>
<li><b>Paiement :</b> traité par Stripe. Nous ne voyons jamais ton numéro de carte ; nous conservons l'identifiant du paiement et du compte vendeur Stripe.</li>
<li><b>Suivi d'envoi :</b> numéros de suivi saisis par les membres. Les adresses postales ne sont pas collectées par ${L.site}.</li></ul>
<h4>Finalités et bases légales</h4><ul>
<li>Fournir le service et exécuter les transactions (exécution du contrat).</li>
<li>Sécurité, lutte contre la fraude et les contrefaçons, contrôle de l'âge (intérêt légitime et obligation légale).</li>
<li>Obligations comptables et fiscales, dont la déclaration DAC7 des vendeurs (obligation légale).</li></ul>
<p>Aucune publicité, aucune revente de données, aucun profilage commercial.</p>
<h4>Durées de conservation</h4><ul>
<li>Compte : jusqu'à sa suppression. Un compte inactif pendant 3 ans est supprimé après avertissement.</li>
<li>Transactions et pièces comptables : 10 ans (Code de commerce), sous forme anonymisée après suppression du compte.</li>
<li>Messages liés à une transaction : 3 ans après la transaction (preuve en cas de litige).</li>
<li>Données DAC7 : 10 ans.</li></ul>
<h4>Sous-traitants</h4><ul>
<li>Supabase (base de données et fichiers, serveurs à Paris).</li>
<li>Vercel (hébergement du site, États-Unis : clauses contractuelles types de la Commission européenne).</li>
<li>Stripe (paiements, vérification d'identité).</li>
<li>Google Fonts (polices d'écriture), jsDelivr (scripts), TCGdex (images des cartes) : ils reçoivent ton adresse IP lors du chargement de ces ressources.</li></ul>
<h4>Tes droits</h4><p>Accès, rectification, effacement, limitation, opposition, portabilité, et directives post-mortem. Depuis la page <b>Compte</b> : « Télécharger mes données » et « Supprimer mon compte ». Pour tout le reste : ${L.email} (réponse sous 1 mois). Tu peux saisir la CNIL (cnil.fr).</p>`],

['cookies', 'Cookies et stockage local', `
<p>${L.site} n'utilise <b>aucun cookie publicitaire ni outil de mesure d'audience</b>. Seul un stockage technique est utilisé dans ton navigateur (localStorage) :</p>
<ul><li>ta session de connexion ;</li><li>ton classeur en mode invité ;</li><li>ta progression (trophées, série de jours, défi du jour) et ta langue préférée ;</li><li>la version hors ligne de l'appli (cache).</li></ul>
<p>Ce stockage est strictement nécessaire au service : il est dispensé de consentement (article 82 de la loi Informatique et Libertés). C'est pourquoi aucun bandeau cookies n'est affiché. Tu peux l'effacer à tout moment depuis les réglages de ton navigateur.</p>`],

['vendeurs', 'Obligations des vendeurs (impôts et DAC7)', `
<p>Vendre ses doubles de temps en temps relève en général de la <b>gestion de son patrimoine personnel</b>. Acheter pour revendre de façon régulière peut en revanche constituer une <b>activité commerciale</b> soumise à déclaration (statut professionnel, impôt sur le revenu, TVA le cas échéant).</p>
<p><b>DAC7 :</b> la loi oblige les plateformes à transmettre chaque année à l'administration fiscale les informations des vendeurs ayant réalisé <b>au moins 30 ventes ou au moins 2 000 €</b> sur l'année civile (identité, adresse, date de naissance, montants, frais). Ces vendeurs devront compléter leurs informations dans l'appli et en recevront une copie.</p>
<p>Plus d'informations : impots.gouv.fr, rubrique « Revenus des plateformes en ligne ».</p>`]
];

export function renderLegal(esc, focus) {
  return `<div class="panel legal" style="max-width:860px;margin:auto">
  <h1 style="font-size:26px;margin:0">Informations légales</h1><p class="mut small">Dernière mise à jour : ${L.maj}</p>
  <nav class="seg" style="margin:12px 0 4px">${SECTIONS.map(([id, t]) => `<a class="bdg" href="#/legal/${id}">${t}</a>`).join('')}</nav>
  ${SECTIONS.map(([id, t, h]) => `<section id="lg-${id}" ${focus === id ? 'class="focus"' : ''}><h2>${t}</h2>${h}</section>`).join('')}</div>`;
}
