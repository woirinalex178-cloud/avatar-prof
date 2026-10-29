# À faire (toi) — checklist avant l'ouverture

*Mise à jour : 29/10/2026. Tout est gratuit. L'ordre compte : fais le bloc A en entier avant d'inviter qui que ce soit.*

---

# BLOC A — Avant d'inviter les premiers collectionneurs
**Total : environ 2 h, étalables sur une semaine.**

## A1. Coller le fichier SQL (2 min) — LE PLUS IMPORTANT
Sans ça, la purge RGPD automatique et surtout le **remboursement automatique d'un litige** ne tournent pas : si tu tranches « rembourser l'acheteur », rien ne part chez Stripe.

1. Ouvre https://github.com/woirinalex178-cloud/avatar-prof/blob/claude/relaxed-galileo-u5yzct/table-des-doubles/supabase/sql/2026-10-21-moderation-rgpd-echanges.sql
2. En haut à droite du cadre de code : bouton **« Copy raw file »** (icône deux feuilles).
3. https://supabase.com/dashboard → projet **table-des-doubles** → menu de gauche **SQL Editor** → **New query**.
4. Colle (Ctrl+V), puis bouton vert **Run**.
5. Attendu : **Success**. Si c'est rouge, envoie-moi la ligne d'erreur.
6. Vérif : appli → **Compte → Modération → RGPD & données** : les compteurs s'affichent.

## A2. Les deux clés d'IA (5 min)
Elles rendent le scanner plus malin et le blog plus vivant. Ne colle **jamais** une clé dans le chat.

- **Gemini** : https://aistudio.google.com/apikey → « Create API key » (compte Google, pas de carte bancaire) → Supabase → **Edge Functions → Secrets** → `GEMINI_API_KEY` = ta clé.
- **Groq** (secours quand Gemini sature) : https://console.groq.com → API Keys → « Create API Key » → Supabase → Secrets → `GROQ_API_KEY`.

## A3. Amorcer le site (30 min) — sinon personne ne reste
Aujourd'hui : **0 annonce**. Un site d'échange vide, le visiteur part et ne revient pas.

1. Toi + ton frère : posez **30 à 50 doubles** sur la table (Classeur → carte en ×2 → **Poser**).
2. Lance **4 sujets** dans le forum : une présentation dans *Présentez-vous*, une idée dans *Améliorations / propositions*, une carte cherchée dans *Recherche de cartes*, un message dans *Expression libre*.
3. **Publie un article** : Compte → Modération → onglet **Blog** → « Lire / modifier » → corrige si besoin → **Publier**. (2 brouillons t'attendent.)
4. Ajoute ta première **boutique partenaire** si tu en as déjà une (onglet Boutiques).

## A4. Test complet à deux, avec de vrais bordereaux (30 min)
1. Chacun : **Compte → Mon adresse d'expédition** (adresse + **téléphone**) → Enregistrer, puis **📍 Mon point relais → Choisir**.
2. Toi : sur un double, **Poser** (état, prix < 50 €).
3. Lui : **La table** → ta carte → **Acheter** → livraison **📍 Point relais** → Confirmer.
4. Toi : **Offres → Reçues → Accepter**. Lui : **Payer** avec la carte de test `4242 4242 4242 4242` (date future, code au hasard).
5. Toi : **📄 Générer mon bordereau** → un PDF marqué TEST se télécharge, le suivi se remplit seul.
6. Lui : **Vérifier la carte reçue** → **J'ai reçu la carte**. Chacun laisse un avis.
7. Refaites en **échange** (bouton *Proposer un échange*) : chacun paie son bordereau.
8. **Teste aussi un litige** : ouvre un litige sur une offre, va dans Modération → Litiges → « Rembourser l'acheteur », et vérifie que le remboursement apparaît dans Stripe (c'est ce que A1 débloque).
9. Note tout ce qui coince (capture d'écran) et envoie-le-moi.

## A5. Régler l'authenticité (15 min)
1. Classeur → **📷 Scanner une carte** → une **vraie** carte → **🔍 Authentifier**.
2. Ajoute les photos du dos et du test de la lampe (pièce sombre, lampe d'un 2ᵉ téléphone collée derrière la carte).
3. Note le score. Refais avec une **fausse** carte si tu en as une (1 € sur AliExpress).
4. Envoie-moi les deux scores : je règle les seuils avec.

## A6. Vérifications juridiques (20 min)
- **INPI** : https://data.inpi.fr → recherche « Sharing Cards » en **marques**. Si rien d'identique en classes 9/35/42, tu peux continuer sereinement. (Le dépôt, 190 €, n'est pas obligatoire pour démarrer.)
- **Relire** une dernière fois Mentions légales / CGU / CGV / Confidentialité (bas du site) : ton SIRET, ton adresse et ton médiateur CM2C y sont déjà.
- **CM2C** : si ton contrat te donne un numéro d'adhérent à afficher, envoie-le-moi.
- Conseil gratuit : permanence juridique de ta mairie, de la CCI ou de l'ordre des avocats.

➡️ **Quand A1 à A6 sont faits, tu peux lancer la vague 1** (10-20 invitations). Les textes sont prêts dans `LANCEMENT.md`.

---

# BLOC B — Avant d'accepter de l'argent (ventes réelles)
Tant que ce bloc n'est pas fait, **les échanges carte contre carte fonctionnent**, mais un vendeur ne serait jamais payé pour de vrai. Les paiements tournent sur des clés Stripe de **test**.

## B1. Stripe en mode réel
1. https://dashboard.stripe.com → finis l'activation : identité, **IBAN**, **SIRET**.
2. Développeurs → Clés API → copie la clé **live** (`sk_live_…`).
3. Supabase → Edge Functions → Secrets → remplace `STRIPE_SECRET_KEY`.
4. Refais les **2 webhooks** en mode réel (Votre compte : `checkout.session.completed` ; Comptes connectés : `account.updated`), même URL `https://zfnjljfmhlnctlidtvqm.supabase.co/functions/v1/payments/webhook`, et remplace `STRIPE_WEBHOOK_SECRET` et `STRIPE_WEBHOOK_SECRET_CONNECT`.
5. Écris-moi **« Stripe réel OK »** : je vérifie tout et on fait un achat à 1 € en vrai.

## B2. Boxtal en réel
1. Boxtal → Mon compte → Paiement : enregistre une carte bancaire (chaque étiquette est prélevée, tu es remboursé par le port payé par les membres).
2. Supabase → Secrets → `BOXTAL_LIVE` = `1`.
3. Dis-le-moi : je vérifie le code d'offre Colissimo et on fait un vrai envoi.

## B3. Question au support Boxtal (5 min, à faire quand tu veux)
> « Puis-je obtenir via l'API v3 une étiquette **QR code / sans impression** pour Mondial Relay et Chronopost Shop2Shop ? Quel `shippingOfferCode` ou quel type de document ? »

→ Transmets-moi la réponse, je l'affiche dans l'appli (beaucoup de gens n'ont pas d'imprimante).

---

# BLOC C — Quand il y a du monde
- **Nom de domaine** (~10 €/an chez OVH ou Gandi) → je le branche sur Vercel.
- **Resend** (gratuit, 3 000 mails/mois) avec ce domaine → je réactive la confirmation par e-mail et les alertes « une carte de ta liste de souhaits vient d'être posée ».
- **Google Play** (25 $ une fois) puis **App Store** (99 $/an).
- **DAC7** : chaque janvier, déclarer aux impôts les vendeurs ayant dépassé 30 ventes ou 2 000 €. L'appli pourra générer le fichier.
- **Accès de ton frère** : GitHub → Collaborators, et Supabase → Team.

---

# Ce que je fais dès que tu me le dis
- « **SQL OK** » → je vérifie que la purge et les remboursements tournent.
- « **Stripe réel OK** » → j'active les vrais paiements et je teste tout.
- « **scores authenticité : X et Y** » → je règle les seuils.
- « **boutique : [nom, ville]** » → je l'ajoute aux partenaires (ou tu le fais toi-même en 20 s).
- Tout bug remonté pendant le test à deux → correction le jour même.

---

# Déjà fait ✅
Inscriptions · Stripe en test · Boxtal connecté (vrais points relais) · textes légaux + médiateur · page de modération (signalements, litiges, RGPD) · liste de souhaits · import/export CSV · défi de la semaine · frais d'échange payables · forum en 5 sections · blog hebdomadaire automatique · masquage des coordonnées · trophées honnêtes · page Boutiques partenaires · kit de lancement (`LANCEMENT.md`).
