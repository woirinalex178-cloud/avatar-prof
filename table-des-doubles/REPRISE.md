# REPRISE — Sharing Cards (ex « Table des Doubles »)

À coller en début de nouvelle session : « Lis table-des-doubles/REPRISE.md et continue. »

## Adresses
- Site : https://table-des-doubles.vercel.app (URL inchangée malgré le nouveau nom)
- Code : GitHub `woirinalex178-cloud/avatar-prof`, branche `claude/pokemon-cards-marketplace-wiwxqw`, dossier `table-des-doubles/`
- Tâches utilisateur : `A-FAIRE.md` · Concurrence : `CONCURRENCE.md`

## Infra
- **Supabase** `zfnjljfmhlnctlidtvqm` (eu-west-3). Clé publique dans `config.js`.
  - Tables : settings, profiles (18+ via `check_age`), sets, cards (~116k, 7 langues), collection, listings, offers, messages, posts, reports, reviews, auth_checks, pokemon_names, sync_queue, `private.app_secrets`.
  - RPC : offer_action, finalize_offer, auto_release, attach_auth, my_progress, coll_info, scan_match, jp_to_fr, delete_my_account, check_cron_token, copy_en_set, copy_intl.
  - Déclencheurs : `offers_before_insert` (frais, plafond 100 € nouveaux comptes), `listings_before_insert` (**doubles uniquement ×2, 3 annonces/carte, 30 actives**, photo ≥ 50 €, code de vérif), filtre coordonnées `guard_text`.
  - Vue `public_profiles` : rating, reviews_count, verified, **passionne** (≥100 cartes ou 1 extension à 50 %), **filleuls** (actifs).
  - **Parrainage** : `profiles.ref_code` / `referred_by` / `free_trades` (3 par défaut). RPC `apply_referral(code)` (+1 filleul, ≤7 j après inscription). Trigger `profiles_ref` : +1 parrain à la 1re transaction du filleul. `offers_before_insert` consomme un `free_trades` si `trade_fee` > 0. Lien : `/?ref=CODE` (capturé dans localStorage `sc_ref`).
  - Droits : `authenticated` ne peut écrire que pseudo, region, accepted_rules_at (+ id, birthdate à l'insertion).
  - Cron : sync-cards (1 min), refresh-prices (**chaque nuit** 3h17), purge-price-history (le 1er du mois), auto-release (h:07), release-payouts (15 min).
  - Edge functions : `sync-cards`, `payments` (checkout/connect/webhook/release, verify_jwt off), `img` (proxy tcgdex).
  - Secrets (dans Supabase uniquement, jamais dans le chat) : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_WEBHOOK_SECRET_CONNECT, CRON_SECRET.
- **Stripe** Connect Express, séquestre (charges et transferts séparés), **mode test**, 2 webhooks.
- **Vercel** : équipe `team_rtfEEmT0BrvApJexTj1FsiDo`, projet `table-des-doubles` (`prj_KNpBSY9eunXrqV8ThzHV79GRFuB9`). Déployer via `create_deployment` gitSource (org woirinalex178-cloud, repo avatar-prof, ref = branche, sha) + `projectSettings.rootDirectory = "table-des-doubles"`.

## Adresses & profils (ajout 30/09)
- Table `addresses` (privée, RLS propriétaire). RPC `offer_address(offer)` : adresse du partenaire seulement si statut `paid`. Trigger `offers_ship_addr` : pas d'expédition sans adresse du destinataire.
- Offre payée → bouton « 📦 Préparer l'envoi » : adresse, lien Lettre suivie, étiquette imprimable (`printLabel`, A6).
- `profiles` : avatar (`k:h`, 8 créatures × 8 teintes via `critterSVG`), bio, fav, theme, show_collection, show_badges, badges (sync `rpc set_badges` dans `checkUnlock`). Filtre anti-coordonnées sur pseudo/bio/fav.
- Page publique `#/membre/<id>` (`public_collection` respecte show_collection). Guide `#/guide` (`guide.js`).

## Cotes (ajout 02/10)
- Table `price_history` (tcg_id, d, price) remplie par le trigger `cards_price_hist` (cartes EN ≥ 0,50 €, variation ≥ 2 %), qui renseigne aussi `cards.price_prev/price_prev_at` (recopiés par `copy_en_set`). Front : `trend(c)` (▲▼ %) et `sparks()` (courbe 1 an sur la fiche d'annonce).

## Bordereaux prépayés (ajout 01/10)
- `addresses.phone` (exigé par les transporteurs). Œil afficher/masquer sur tous les mots de passe (MutationObserver `eyes()`).
- `offers.ship_mode` (manual/relay/home) + `ship_price` (trigger `offers_ship_price`, tarifs `settings.ship_relay/ship_home`), ajouté au checkout Stripe.
- Table `shipments` (1 par envoi). Vente payée → colis vendeur créé payé (trigger `offers_paid_shipment`). Échange → `rpc order_label(offer, mode)` puis `payments/label` (Stripe) → webhook met `paid`.
- Edge `shipping` : `/relays?zip=`, `/create` (génère le PDF dans le bucket privé `labels`, renseigne le suivi dans l'offre), `/webhook` (à brancher). **Boxtal API v3 branché** (token `/iam/account-app/token`, points relais `/shipping/v3.2/parcel-point-by-shipping-offer`, commande `/shipping/v3.1/shipping-order`, documents, suivi, webhooks `TRACKING_CHANGED`/`DOCUMENT_CREATED` signés HMAC `x-bxt-signature`, secret = HMAC(BOXTAL_SECRET,'sharing-cards-webhook')). Codes d'offre dans `settings.boxtal_relay_offer` (MONR-CpourToi, vérifié) / `boxtal_home_offer` (POFR-ColissimoAccess, **à vérifier**). Étiquettes réelles seulement si secret `BOXTAL_LIVE=1`, sinon PDF d'essai. Diagnostic : `/shipping/status?zip=` (jeton cron). Au passage en réel : vider les `addresses.relay` dont l'id commence par `TEST-`.
- `addresses.relay` = point relais de réception choisi (Compte ou formulaire d'achat).
- Sources des fonctions : `supabase/functions/payments`, `supabase/functions/shipping`.

## Front (JS vanilla, sans build)
`index.html`, `style.css` (thème tapis vert/or), `app.js` (routeur, vues), `auth.js` (authenticité photo), `game.js` (51 badges dont 3 Ambassadeur, XP, défis), `legal.js` (7 textes légaux), `sw.js` (cache `tdd-v12`), `intro.js` (cinématique dragon original, 1re visite, `localStorage sc_intro`, lien « Revoir l'intro » `[data-intro]`), `critters.js` (8 créatures SVG originales, attraper = badge secret `x_catch`), `fx.js` (tilt 3D + holo sur `.tile`, apparitions `.rv`, braises canvas, compteurs), `affiche.html` + `img/qr-boutique.png`, `manifest.json`, `img/` (logo, bannière, icônes, og).

## Publications automatiques — « La Gazette » (ajout 14/11)
Un seul moteur alimente tous les canaux. **Une ligne de `blog` = une publication déclinée.**

```
lundi 5h41  pg_cron `gazette-learn`  → blog/learn    : note les publications passées, écrit 3 enseignements dans `content_learn`
lundi 6h13  pg_cron `blog-weekly`    → blog/generate : faits réels + mémoire → IA → article + forum + FB + IG + script TikTok
                                                        auto-contrôle `contact_violation()`, 1 reprise, sinon version « maison »
                                                        → `blog` status=draft + jeton `k` à usage unique
                                        appelle n8n `sc-gazette-valider` → UN mail Brevo « Publier / Jeter »
clic Publier → blog/approve?id&k     : status=published · fil du forum signé `LaGazette` (épinglé, `posts.blog_id`) 
                                        → appelle n8n `sc-gazette-reseaux` → Facebook + Instagram
```

- **Edge function `blog`** (`supabase/functions/blog/index.ts`, verify_jwt off) : `/generate`, `/approve`, `/reject`, `/learn`, `/pending`.
  `/approve` et `/reject` ne sont pas protégés par le jeton cron mais par `blog.k`, aléatoire et à usage unique (lien du mail).
- **Colonnes ajoutées à `blog`** : `forum_body`, `fb`, `ig`, `tiktok`, `k`, `post_id`, `social_at`, `social_log`, `score`, `reviewed_at`.
- **Table `content_learn`** : mémoire de la boucle (lesson, weight, evidence), 30 lignes max, relue par le prompt.
- **RPC `gazette_movers(limit)`** : cartes dont la cote a vraiment bougé. Garde-fous indispensables — le fournisseur sort des
  valeurs aberrantes (171 cartes pile à −80 %, des +4947 % sur des cotes de départ à 5 €). Retenu : cote et cote précédente ≥ 2 €,
  mouvement ≥ 0,50 €, variation entre 8 % et 40 %, relevé < 21 jours, une ligne par nom de carte.
- **RPC `gazette_id()`** : compte robot `LaGazette` (pseudo sans espace : `profiles_pseudo_check`). Recrée le profil s'il manque.
- **n8n** workflow `StcinxUjfXgoNGIQ` « 🃏 SHARING CARDS — La Gazette » (actif) : 2 webhooks (`sc-gazette-valider`,
  `sc-gazette-reseaux`), mail via l'identifiant Brevo existant, 4 nœuds Facebook/Instagram **grisés** jusqu'à la Page + le jeton.
- **Coût : 0 €** (Gemini gratuit, Groq en secours, Brevo 300 mails/jour, n8n sur le VPS déjà en place).

### Le journal du site (ajout 14/11)
`blog` existait depuis octobre, **mais aucune page ne l'affichait** : les articles étaient écrits dans le vide,
et le lien que la Gazette posait sur Facebook ne menait nulle part. C'est réparé.
- Route **`#/journal`** (liste) et **`#/journal/<slug>`** (article), fichier `journal.js` (rendu + markdown
  minimal : `##`, `###`, listes, `**gras**`, `*italique*`, `![image](url)`, liens — tout est échappé avant mise en forme).
- Lien dans la navigation, styles `.jr-*` en fin de `style.css`, `sw.js` passé en `tdd-v29`.
- RPC `blog_view(slug)` : compteur de lectures. **Sans lui la boucle d'amélioration notait à l'aveugle**,
  `views` restant à 0.
- Trigger `blog_cover_bi` : un article sans illustration reçoit l'image de la carte vedette de la semaine
  (convention TCGdex `<image>/high.webp`), sinon le visuel du site.
- Trois articles de fond écrits et publiés le 14/11 (Règne Delta, grille d'état NM/EX/GD/PL, six réflexes
  d'échange), chacun avec son fil de forum. Le filtre `contact_violation` a refusé le premier essai : le mot
  **« signal »** est dans la liste noire (« signal d'alerte »). Bon rappel que les textes du forum doivent
  éviter aussi : tel, numero, fb, snap, rib, signal.

### Vidéo — YouTube (ajout 14/11)
La Gazette ne refait pas de chaîne vidéo : elle **appelle celle qui existe**, `LnHApbawsIE4dw70`
« 🎬 Shorts — Faits racontés (Pexels + voix off) », 39 nœuds déjà éprouvés (TTS Google, sous-titres ASS
calés au dixième de seconde, ducking de la musique, loudnorm en deux passes, upload YouTube **en privé**).

Deux retouches chirurgicales seulement, le comportement d'origine est intact :
- nœud **« Appel depuis la Gazette »** (`executeWorkflowTrigger`) → « Preparer le dossier » ;
- `Choisir le theme` accepte un `domaine` injecté ; sans appel extérieur, la rotation habituelle reprend
  (la référence au nœud échoue, on retombe dans le `catch`) ;
- `Preparer le montage` ajoute le lien du site à la description YouTube quand l'appel vient de nous.

Côté Gazette (`StcinxUjfXgoNGIQ`) : « Réglages Sharing Cards » → **« Sujet de la vidéo »** → **« Lancer la
vidéo (YouTube) »** (`waitForSubWorkflow: false`, le montage prend plusieurs minutes). Le domaine injecté est
*« les cartes Pokémon à collectionner : rareté, cotes, contrefaçons, état et conservation »* : l'agent éditorial
y cherche un fait qui corrige une idée reçue, le **vérifie dans une encyclopédie**, puis écrit le script.
Ce n'est donc pas un résumé des cotes mais un Short qui tient tout seul — c'est ce qui marche sur YouTube.

**TikTok et Instagram Reels restent manuels** : aucune API gratuite ne publie dessus (la chaîne
`EFZy3OZHCzikCqQS` existe mais finit par un envoi par mail, pas par une publication). La même vidéo verticale
sert aux trois. Piste : Reels est publiable via l'API Graph, à faire après la Page Facebook.

### Points de vigilance
- `GEMINI_API_KEY` **absente** : `ai_hits` est à 0, tout a été rédigé par le moteur de secours. C'est le seul verrou qui sépare
  d'un rendu vraiment pro (étape 1 ter d'`A-FAIRE.md`).
- Trigger `blog_slug_bi` (slug unique en cas de double rédaction le même jour) : **migration en attente de confirmation**.
- **TTS Google en panne (403)** : `texttospeech.googleapis.com` répond `PERMISSION_DENIED / ACCESS_DENIED`.
  Les 3 derniers passages programmés du workflow Shorts ont échoué (13/11 18h, 14/11 6h, 14/11 18h) : **aucune
  vidéo ne se monte plus**, et ce depuis avant la Gazette. À débloquer dans Google Cloud (étape 7 bis d'`A-FAIRE.md`).
  Sans carte bancaire, l'alternative est le TTS de Gemini, mais son palier gratuit (3 requêtes/min, 15/jour)
  ne tient pas : la chaîne appelle le TTS une fois par phrase pour mesurer chaque durée de sous-titre.
- Le modèle principal du workflow Shorts, `gemini-flash-latest`, échoue (`fetch failed`) : seul le modèle de
  secours répond, ce qui fait durer l'agent éditorial 5 minutes au lieu de quelques secondes. À revoir.
- Instagram refuse une publication sans image : à défaut de `blog.cover`, le moteur envoie `img/og.jpg`. Un visuel par article
  serait mieux (piste : la carte vedette via la fonction `img`, à arbitrer côté droits Nintendo).

## Décisions prises
- **Aucun visuel Pokémon officiel en décoration** (risque Nintendo) : dragon et créatures sont des créations originales ; seules les images de cartes du catalogue sont utilisées.
- Frais façon Vinted : vendeur 0 %, acheteur 0,50 € + 3 %. Échanges gratuits (bêta).
- 18+, aucune coordonnée, tout passe par l'appli, séquestre, auto-libération 7 j.
- Positionnement : **réservé aux collectionneurs passionnés** (règles anti-revendeurs en base).

## Prochaines tâches techniques
1. Régler les seuils d'authenticité (attendre les scores de l'utilisateur, étape 4 d'A-FAIRE).
2. Remplir `LEGAL` en haut de `legal.js` (nom, SIRET, adresse, e-mail, médiateur).
3. RGPD : purge auto comptes inactifs 3 ans et messages 3 ans (pg_cron).
4. Après la bêta : passer `settings.trade_fee` à 0.99 **et** coder le paiement Stripe de ces frais pour les échanges sans argent (aujourd'hui seul `fee` est encaissé). Export DAC7.
5. Page modération (signalements, litiges).
6. Plan d'action de `CONCURRENCE.md` : import CSV, parrainage, liste de souhaits, défi hebdo.
7. Plus tard : nom de domaine + Resend, renommer le projet Vercel.

## Pièges connus
- Le conteneur n'a pas de réseau sortant sauf GitHub → passer par les outils MCP et `pg_net` en SQL.
- Vercel : sans `rootDirectory`, 404.
- PostgREST limite à 1000 lignes → paginer.
- Cartes JP : noms FR via `pokemon_names` et `name_fr` des sets.
- Commits : auteur woirinalex178 <woirinalex178@gmail.com>, pas d'identifiant de modèle.
