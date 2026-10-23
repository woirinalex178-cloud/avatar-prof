# REPRISE — Sharing Cards (ex « Table des Doubles »)

À coller en début de nouvelle session : « Lis table-des-doubles/REPRISE.md et continue. »

## Adresses
- Site : https://table-des-doubles.vercel.app (URL inchangée malgré le nouveau nom)
- Code : GitHub `woirinalex178-cloud/avatar-prof`, branche `claude/relaxed-galileo-u5yzct`, dossier `table-des-doubles/`
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

## Décisions prises
- **Aucun visuel Pokémon officiel en décoration** (risque Nintendo) : dragon et créatures sont des créations originales ; seules les images de cartes du catalogue sont utilisées.
- Frais façon Vinted : vendeur 0 %, acheteur 0,50 € + 3 %. Échanges gratuits (bêta).
- 18+, aucune coordonnée, tout passe par l'appli, séquestre, auto-libération 7 j.
- Positionnement : **réservé aux collectionneurs passionnés** (règles anti-revendeurs en base).

## Modération, RGPD, frais d'échange, souhaits, CSV, défi hebdo (ajout 21/10)
- **Admin** : `profiles.is_admin` (coché pour alex_et_celeste), `suspended_until` / `suspend_reason`, `last_seen` (RPC `touch_me()` à chaque session). Trigger `block_suspended` sur listings/offers/posts/messages/reviews.
- **Page `#/moderation`** (visible seulement si `is_admin`, lien dans Compte) : 3 onglets.
  - Signalements : `admin_reports(status)` + `admin_act(report, action, note, days)` — actions `remove` / `suspend` (7 j) / `ban` / `dismiss` / `unsuspend`. `reports` a maintenant `status`, `target_user` (rempli par le trigger `reports_before_insert`), `handled_by/at`, `note`. Signalement possible sur annonce, post, **message** et profil, avec motif (`reportModal`).
  - Litiges : `admin_disputes()` (messages, contrôles d'authenticité, suivis) + `admin_offer_resolve(offer, 'release'|'refund'|'reopen'|'note')`. Remboursement : `offers.refund_requested/refunded_at` → route `payments/refunds` (cron 15 min) qui appelle `stripe.refunds.create`.
  - RGPD : compteurs + bouton « Lancer la purge » (`admin_purge()` → `rgpd_purge()`), cron quotidien 4 h 23. Purge : messages/posts > 3 ans, contrôles > 2 ans, signalements traités > 1 an, comptes sans visite depuis 3 ans anonymisés (sauf transaction en cours), journal `rgpd_log`.
- **Frais d'échange payés** : `offers.trade_paid_buyer/seller` (+ `trade_session_*`). `offers_before_insert` ne met plus `trade_fee` à 0 quand un `free_trades` est consommé : il marque la part de l'acheteur comme payée. `offer_action('accept')` consomme un `free_trades` du vendeur sinon laisse l'offre en `accepted`, action `tradepay` (mode test) ou route `payments/trade` (Stripe) → webhook → `trade_fee_paid(offer, role)` → `paid` quand les deux ont payé.
- **Liste de souhaits** : table `wishlist` (RLS propriétaire), étoile ☆ sur les cartes (classeur, scan, annonce), page `#/souhaits` avec les annonces correspondantes, tri « ⭐ Ma liste » sur la table, `public_wishlist(user)` sur le profil public (respecte show_collection).
- **Import / export CSV** du classeur : bouton dans le classeur et dans Compte. Colonnes `extension;numero;nom;quantite;langue`, rapprochement en base par `csv_match(rows, lang)` (code d'extension, nom FR/EN, numéro sans zéros), aperçu avant import, export UTF-8 avec la cote.
- **Défi de la semaine** (`game.js`) : 5 défis en rotation (cartes ajoutées, scans, doubles posés, souhaits, contrôles), compteur local par semaine ISO, trophée `x_week` (3 semaines réussies). Affiché dans le classeur et les trophées.
- **SQL de référence** : `supabase/sql/2026-10-21-moderation-rgpd-echanges.sql`. ⚠️ Le bloc RGPD (fonctions avec `delete`) + les 2 lignes `cron.schedule` doivent être collés une fois dans Supabase → SQL Editor : l'outil MCP refuse les instructions destructrices sans confirmation humaine.

## Trophées honnêtes, forum en sections, blog (ajout 22/10)
- **Compteurs en base** : table `stats(user_id,k,n,nd,nw,d,w)` + `bump(k,n)` (plafonds par jour, anti-triche) + `my_stats()`. `game.js` n'utilise plus `localStorage` dès qu'on est connecté (`Game.init({bump})`, `Game.setStats()`), le local ne sert plus qu'au mode invité et à la célébration des nouveaux trophées.
- **Anti-aller-retour** : `collection.since` (trigger `collection_since`) ; une carte ne compte pour les trophées et l'XP qu'après `Game.STABLE_DAYS` = 7 jours. Le classeur affiche « ⏳ n carte(s) en attente ».
- **Série de jours côté serveur** : `profiles.streak` / `streak_best` via `my_visit()` (remplace `touch_me()`, dont le type de retour ne pouvait plus changer).
- **Trophées vivants** : ils restent recalculés à chaque visite ; `profiles.badges` est resynchronisé. Bouton « Remettre ses trophées à zéro » (`admin_reset_stats`) dans les signalements. Badges/XP des 2 comptes existants remis à zéro le 22/10.
- **Masquage des coordonnées** : `mask_contacts()` + `safe_words` (noms de Pokémon, extensions, raretés, vocabulaire courant, reconstruits par `rebuild_safe_words()`). Les posts sont **masqués** (`posts.body`), l'original reste dans `posts.body_raw` (colonne révoquée pour les membres, lisible par la modération via `admin_reports`). La messagerie privée et les annonces restent **bloquantes**.
- **Forum en 5 sections** : libre, recherche, idees (avec votes `post_votes` → `posts.votes`), presentation, blog. `posts.section`, `posts.title` (propositions).
- **Blog** : table `blog`, page `#/blog` + `#/blog/<slug>`, rendu markdown maison (`md()` dans app.js), commentaires = `posts` avec `blog_id` (section blog). Onglet **Blog** dans la modération : générer / publier / dépublier / modifier / corbeille (`admin_blog`).
- **Edge function `blog`** (`/generate`, verify_jwt off) : rassemble les vraies données (hausses de cote, dernière extension, activité), rédige avec Gemini puis Groq en secours, **sans clé IA écrit quand même** un article factuel. Toujours en brouillon. Cron `blog-weekly` lundi 6 h 13 UTC. Premier brouillon créé le 22/10 (version « maison », clé Gemini encore absente).
- **SQL de référence** : `supabase/sql/2026-10-22-trophees-forum-blog.sql`.
- Messages du forum : limite portée à **2 000 caractères** (`posts_body_check`), champs à 1900 et troncature dans `posts_before_insert` après masquage (le masquage peut rallonger le texte).

## Prochaines tâches techniques
1. Régler les seuils d'authenticité (attendre les scores de l'utilisateur, étape 4 d'A-FAIRE).
2. Remplir `LEGAL` en haut de `legal.js` (nom, SIRET, adresse, e-mail, médiateur).
4. Après la bêta : passer `settings.trade_fee` à 0.99 (le paiement Stripe de ces frais est codé). Export DAC7.
5. Coller le bloc RGPD du fichier `supabase/sql/2026-10-21-moderation-rgpd-echanges.sql` (purge + crons).
6. Reste de `CONCURRENCE.md` : alertes e-mail sur la liste de souhaits (attend un domaine + Resend).
7. Plus tard : nom de domaine + Resend, renommer le projet Vercel.

## Pièges connus
- Le conteneur n'a pas de réseau sortant sauf GitHub → passer par les outils MCP et `pg_net` en SQL.
- Vercel : sans `rootDirectory`, 404.
- PostgREST limite à 1000 lignes → paginer.
- Cartes JP : noms FR via `pokemon_names` et `name_fr` des sets.
- Commits : auteur woirinalex178 <woirinalex178@gmail.com>, pas d'identifiant de modèle.
