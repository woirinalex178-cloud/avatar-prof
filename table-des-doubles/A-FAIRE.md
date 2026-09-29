# À faire (toi) — étape par étape

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

## ÉTAPE 2 — Tester l'appli à deux (20 min)
1. Ton frère crée son compte (étape 1.c) sur son téléphone.
2. Chacun ajoute quelques cartes au classeur, dont une en double (bouton **+**).
3. Toi : sur la carte en double, bouton **Poser**, choisis l'état et un prix de moins de 50 € (la photo n'est pas obligatoire sous 50 €).
4. Lui : **La table** → ta carte → **Acheter**.
5. Toi : **Offres** → **Reçues** → **Accepter**.
6. Lui : **Payer (mode test)**. Aucun argent réel n'est débité.
7. Toi : **J'ai expédié**, puis mets un faux numéro de suivi (ex. `TEST12345678`).
8. Lui : **Vérifier la carte reçue** (test d'authenticité), puis **J'ai reçu la carte**.
9. Chacun laisse un avis. Regardez aussi vos trophées (🏆).
10. Essayez d'écrire un numéro de téléphone ou « snap » dans le chat : ça doit être bloqué.
11. Note tout ce qui coince et envoie-le-moi.

---

## ÉTAPE 3 — Vrais paiements Stripe en mode test (40 min, gratuit)

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

### 3.e Le webhook (Stripe prévient l'appli quand quelqu'un a payé)
1. Stripe → **Développeurs** → **Webhooks** → **Ajouter un endpoint** (ou « Add destination »).
2. URL : `https://zfnjljfmhlnctlidtvqm.supabase.co/functions/v1/payments/webhook`
3. Événements : coche `checkout.session.completed` et `account.updated`. Pour ce dernier, coche aussi l'option « comptes connectés » si elle est proposée.
4. Valide. Sur la page du webhook : **Clé de signature** → **Révéler**, puis copie la clé (`whsec_…`).
5. Supabase → **Edge Functions** → **Secrets** → nouveau secret `STRIPE_WEBHOOK_SECRET` = `whsec_…`. **Save**.

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
2. **Nom libre ?** https://data.inpi.fr → recherche « Table des Doubles » en marques. Si rien d'identique en classes 9/35/42 : OK. (Le dépôt de marque est payant, 190 € : pas obligatoire pour démarrer.)
3. **Textes légaux** : dis-moi « rédige les CGU » et je te prépare les CGU/CGV, les mentions légales et la politique de confidentialité (RGPD). Il faudra ton SIRET et une adresse.
4. **Stripe en mode réel** : finaliser l'activation Stripe (pièce d'identité, IBAN, SIRET). Ensuite, je passe l'appli en paiements réels.
5. **DAC7** (plus tard) : chaque année en janvier, déclarer aux impôts les vendeurs qui ont fait plus de 30 ventes ou 2 000 €. L'appli pourra générer le fichier.

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
