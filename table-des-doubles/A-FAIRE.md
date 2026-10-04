# À faire (toi) — étape par étape

## Où en es-tu ? (au 04/10)
- [ ] **Test à deux** du nouveau parcours avec bordereaux (étape 2)
- [ ] **Scores d'authenticité** vraie / fausse carte (étape 4)
- [ ] **INPI** : vérifier que « Sharing Cards » est libre (étape 5.2)
- [ ] **Accès de ton frère** : GitHub → Collaborators + Supabase → Team
- [ ] **CM2C** : n° d'adhérent à afficher ? (en attente)
- [ ] **Ouverture** : Stripe en mode réel (SIRET, IBAN) → puis `BOXTAL_LIVE=1` + carte enregistrée chez Boxtal (étape 5 ter)
- [ ] **Boxtal, envoi sans imprimante** : demander au support (aide.boxtal.com ou chat) : « Puis-je obtenir via l'API v3 une étiquette **QR code / sans impression** pour Mondial Relay et Chronopost Shop2Shop ? Quel `shippingOfferCode` ou quel type de document ? » → transmets-moi la réponse, je l'affiche dans l'appli.
- ✅ Inscriptions, Stripe test, Boxtal, textes légaux, médiateur


Environ 1 h 30 pour les étapes 1 à 3. Tout est gratuit.


## ÉTAPE 1 — Faire marcher les inscriptions (10 min, gratuit) — PRIORITÉ

### 1.a Adresse du site dans Supabase
1. Va sur https://supabase.com/dashboard et connecte-toi.
2. Clique sur le projet **table-des-doubles**.
3. Menu de gauche : **Authentication** (icône de bonhomme), puis **URL Configuration**.
4. Champ **Site URL** : efface `http://localhost:3000` et colle `https://table-des-doubles.vercel.app`.
5. Plus bas, dans **Redirect URLs**, clique **Add URL**, colle `https://table-des-doubles.vercel.app/**` et valide.
6. Clique **Save**.

### 1.b E-mail de confirmation (le plus simple pour la bêta)
Le service d'e-mails fourni par défaut n'envoie que 2 à 3 mails par heure : les inscriptions bloqueraient.
1. Toujours dans **Authentication** : ouvre **Sign In / Providers** (parfois nommé **Providers**), puis **Email**.
2. Désactive **Confirm email**, puis **Save**.
   → Les gens s'inscrivent sans cliquer sur un lien. La vérification 18+ reste active (date de naissance obligatoire, contrôlée par la base).
3. Plus tard, avec un nom de domaine (étape 6) : on remettra la confirmation avec Resend. Sans domaine à toi, Resend ne sait envoyer des mails qu'à ta propre adresse.

### 1.c Test
1. Ouvre https://table-des-doubles.vercel.app → **Compte** → **Créer un compte**.
2. Remplis les champs (pseudo, date de naissance de plus de 18 ans, les 2 cases), puis valide.
3. Tu dois arriver sur ton classeur, avec ton pseudo en haut à droite.
4. Essaie avec une date de moins de 18 ans : le compte doit être refusé.
5. Envoie-moi une capture si ça bloque.

---

## ÉTAPE 2 — Tester l'appli à deux (30 min) — À REFAIRE avec les bordereaux
1. Chacun : **Compte** → *Mon adresse d'expédition* : adresse + **téléphone** → Enregistrer, puis **📍 Mon point relais → Choisir** (vrais points Mondial Relay).
2. Chacun ajoute quelques cartes au classeur, dont une en ×2 (bouton **+**).
3. Toi : sur le double, **Poser** (état, prix < 50 €).
4. Lui : **La table** → ta carte → **Acheter** → livraison **📍 Point relais** → Confirmer.
5. Toi : **Offres → Reçues → Accepter**. Lui : **Payer** avec la carte test `4242 4242 4242 4242`.
6. Toi : **📄 Générer mon bordereau** → un PDF d'essai (marqué TEST) se télécharge, le suivi se remplit seul.
7. Lui : **Vérifier la carte reçue** → **J'ai reçu la carte**. Chacun laisse un avis.
8. Refaites la même chose en **échange** (bouton *Proposer un échange*) : chacun paie et télécharge son propre bordereau.
9. Note tout ce qui coince (capture d'écran) et envoie-le-moi.

---

## ÉTAPE 3 — Vrais paiements Stripe en mode test ✅ FAIT (paiements activés le 29/09)
Pour tester : le vendeur va dans **Compte → Activer mes ventes** (Stripe propose « Utiliser des données de test »), puis l'acheteur paie avec la carte `4242 4242 4242 4242`.

### 3.a Créer le compte
1. Va sur https://dashboard.stripe.com/register et crée un compte (e-mail et mot de passe).
2. Tu n'as pas besoin de finir l'activation (pièce d'identité, IBAN) pour le mode test : laisse-la de côté.
3. En haut du tableau de bord, vérifie que le bouton **Mode test** (ou « Test mode ») est **activé**.

### 3.b Activer Connect (paiement aux vendeurs)
1. Menu **Connect** (ou **Paramètres → Connect**), puis **Commencer**.
2. Choisis **Plateforme / Marketplace**, puis laisse **Stripe gère l'onboarding (Express)**.
3. Réponds aux questions (activité : place de marché de cartes à collectionner, pays : France).

### 3.c Récupérer la clé secrète
1. Menu **Développeurs**, puis **Clés API**.
2. Ligne **Clé secrète** : **Révéler la clé de test**, puis copie la clé (elle commence par `sk_test_`).
3. ⚠️ Ne l'envoie à personne, pas même à moi dans le chat : elle se colle uniquement dans Supabase.

### 3.d La coller dans Supabase
1. Supabase → projet **table-des-doubles** → menu **Edge Functions**, puis **Secrets** (ou **Manage secrets**).
2. **Add new secret** : nom `STRIPE_SECRET_KEY`, valeur = la clé `sk_test_…`. **Save**.
3. **Add new secret** : nom `CRON_SECRET`, valeur = un mot de passe inventé et long (ex. `doubles-2026-xK9pQ`). **Save**.

### 3.e Les webhooks (Stripe prévient l'appli) — 2 destinations
Stripe sépare « Votre compte » (paiements) et « Comptes connectés » (vendeurs). Il en faut une de chaque, même URL :
`https://zfnjljfmhlnctlidtvqm.supabase.co/functions/v1/payments/webhook`

**Destination 1 : Votre compte**
1. Stripe → Développeurs → Webhooks → **Ajouter une destination** → **Votre compte** → Continuer.
2. Coche `checkout.session.completed` → Continuer → **Endpoint webhook** → colle l'URL → Créer.
3. **Clé secrète de signature** → Révéler → copie `whsec_…`.
4. Supabase → Edge Functions → Secrets → `STRIPE_WEBHOOK_SECRET` = cette clé → Save.

**Destination 2 : Comptes connectés**
1. **Ajouter une destination** → **Comptes connectés** → Continuer.
2. Coche `account.updated` → Continuer → **Endpoint webhook** → même URL → Créer.
3. Révèle et copie cette 2e clé `whsec_…` (différente).
4. Supabase → Secrets → `STRIPE_WEBHOOK_SECRET_CONNECT` = cette clé → Save.

### 3.f Me prévenir
- Écris-moi « Stripe OK ». J'active alors les paiements réels (en mode test) et le versement automatique aux vendeurs, puis je fais un test complet.
- Carte bancaire de test Stripe : `4242 4242 4242 4242`, n'importe quelle date future, n'importe quel code.

---

## ÉTAPE 4 — Tester l'authenticité (15 min)
1. Classeur → **📷 Scanner une carte** → prends une vraie carte en photo → **🔍 Authentifier**.
2. Ajoute les photos du dos et du test de la lampe (pièce sombre, lampe d'un 2e téléphone collée derrière la carte).
3. Note le score. Refais la même chose avec une fausse carte si tu en as une (1 € sur AliExpress).
4. Envoie-moi les deux scores : je réglerai les seuils avec.

---

## ÉTAPE 5 — Avant d'ouvrir au public (administratif, gratuit)
1. **Micro-entreprise** : https://autoentrepreneur.urssaf.fr → **Créer mon auto-entreprise**. Activité : « plateforme de mise en relation, commerce en ligne ». Environ 15 min, puis réception du numéro SIRET sous 1 à 4 semaines.
2. **Nom libre ?** https://data.inpi.fr → recherche « **Sharing Cards** » en marques. Si rien d'identique en classes 9/35/42 : OK. (Le dépôt de marque est payant, 190 € : pas obligatoire pour démarrer.)
3. **Textes légaux** ✅ complets (nom, SIRET, adresse, e-mail, médiateur CM2C). Si ton contrat CM2C donne un n° d'adhérent à afficher, envoie-le-moi (page « Infos légales » en bas du site). Il te reste à remplir **une seule fois** le haut du fichier `legal.js` (je peux le faire si tu me donnes les infos) :
   - ton prénom NOM, ton n° SIRET, ton adresse postale, un e-mail de contact ;
   - un **médiateur de la consommation** (obligatoire dès que tu vends un service à des particuliers ; environ 50 à 150 €/an, ex. CM2C, Medicys) ;
   - conseil : faire relire les textes gratuitement (permanences juridiques de ta mairie, de la CCI ou de l'ordre des avocats).
4. **Stripe en mode réel** : finaliser l'activation Stripe (pièce d'identité, IBAN, SIRET). Ensuite, je passe l'appli en paiements réels.
5. **DAC7** (plus tard) : chaque année en janvier, déclarer aux impôts les vendeurs qui ont fait plus de 30 ventes ou 2 000 €. L'appli pourra générer le fichier.

---

## ÉTAPE 5 bis — Les boutiques de cartes près de chez toi (0 €)
1. Ouvre https://table-des-doubles.vercel.app/affiche.html → bouton **🖨️ Imprimer** (A4 couleur, ~0,50 € en reprographie). Le QR code mène au site.
2. Liste 5 à 10 boutiques (Google Maps : « cartes Pokémon », « jeux de société », « boutique manga »).
3. Passe en semaine, pas le samedi (le vendeur a le temps). Phrase d'accroche :
   > « Bonjour, je lance Sharing Cards, un site gratuit pour que les collectionneurs échangent leurs doubles en sécurité. Ça ramène du monde qui cherche des boosters. Je peux laisser une affiche près des cartes ? »
4. Propose en échange : leur boutique citée sur le site (plus tard, une page « Boutiques partenaires ») et un tournoi / soirée d'échange organisé chez eux.
5. Note dans un tableau : boutique, date, réponse, contact du gérant.
6. Les visites venues de l'affiche arrivent avec `?src=boutique` : je pourrai les compter plus tard.

---

## ÉTAPE 5 ter — Bordereaux Boxtal ✅ connecté (01/10)
- Clés Boxtal en place : les **vrais points relais Mondial Relay** s'affichent déjà dans l'appli, et le suivi des colis est abonné (webhook).
- Les bordereaux restent **en mode essai** tant que Stripe est en mode test (sinon tu paierais de vraies étiquettes avec de faux paiements).
- **Le jour de l'ouverture** (Stripe en réel) :
  1. Boxtal → Mon compte → Paiement : enregistre une carte bancaire (Boxtal prélève chaque étiquette achetée) ou approvisionne un solde de quelques dizaines d'euros. Tu es remboursé par le port payé par les membres.
  2. Supabase → Edge Functions → Secrets : ajoute `BOXTAL_LIVE` = `1`.
  3. Dis-le-moi : je vérifie le code d'offre Colissimo et je fais un 1er envoi réel de test.
- **API Suivi La Poste** : pas indispensable. Boxtal envoie déjà le suivi de tous ses transporteurs (Mondial Relay, Colissimo, Chronopost…). Elle servira seulement pour les « Lettre suivie » achetées à part.
- Chaque membre doit indiquer un **téléphone** dans Compte → Mon adresse (exigé par les transporteurs, jamais affiché).

---

## ÉTAPE 6 — Quand il y a du monde (payant, optionnel)
1. **Nom de domaine** (~10 €/an, ex. table-des-doubles.fr chez OVH ou Gandi) → je le branche sur Vercel.
2. **Resend** (gratuit, 3 000 mails/mois) avec ce domaine → je réactive la confirmation par e-mail.
3. **Google Play** (25 $ une fois) puis **App Store** (99 $/an) : je transforme l'appli web en appli des stores.
4. **Communication** : groupes Facebook et Discord Pokémon TCG, boutiques locales (affiche avec QR code), TikTok.

---

## Ce que je fais de mon côté quand tu me le dis
- « Stripe OK » → activer les paiements et le versement aux vendeurs, puis tout tester.
- « scores authenticité : X et Y » → régler les seuils.
- « rédige les CGU » → textes légaux complets.
- Tout bug remonté pendant l'étape 2 → correction.
