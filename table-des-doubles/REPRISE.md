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
  - Cron : sync-cards (1 min), refresh-prices (dim. 3h17), auto-release (h:07), release-payouts (15 min).
  - Edge functions : `sync-cards`, `payments` (checkout/connect/webhook/release, verify_jwt off), `img` (proxy tcgdex).
  - Secrets (dans Supabase uniquement, jamais dans le chat) : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_WEBHOOK_SECRET_CONNECT, CRON_SECRET.
- **Stripe** Connect Express, séquestre (charges et transferts séparés), **mode test**, 2 webhooks.
- **Vercel** : équipe `team_rtfEEmT0BrvApJexTj1FsiDo`, projet `table-des-doubles` (`prj_KNpBSY9eunXrqV8ThzHV79GRFuB9`). Déployer via `create_deployment` gitSource (org woirinalex178-cloud, repo avatar-prof, ref = branche, sha) + `projectSettings.rootDirectory = "table-des-doubles"`.

## Adresses & profils (ajout 30/09)
- Table `addresses` (privée, RLS propriétaire). RPC `offer_address(offer)` : adresse du partenaire seulement si statut `paid`. Trigger `offers_ship_addr` : pas d'expédition sans adresse du destinataire.
- Offre payée → bouton « 📦 Préparer l'envoi » : adresse, lien Lettre suivie, étiquette imprimable (`printLabel`, A6).
- `profiles` : avatar (`k:h`, 8 créatures × 8 teintes via `critterSVG`), bio, fav, theme, show_collection, show_badges, badges (sync `rpc set_badges` dans `checkUnlock`). Filtre anti-coordonnées sur pseudo/bio/fav.
- Page publique `#/membre/<id>` (`public_collection` respecte show_collection). Guide `#/guide` (`guide.js`).

## Bordereaux prépayés (ajout 01/10)
- `offers.ship_mode` (manual/relay/home) + `ship_price` (trigger `offers_ship_price`, tarifs `settings.ship_relay/ship_home`), ajouté au checkout Stripe.
- Table `shipments` (1 par envoi). Vente payée → colis vendeur créé payé (trigger `offers_paid_shipment`). Échange → `rpc order_label(offer, mode)` puis `payments/label` (Stripe) → webhook met `paid`.
- Edge `shipping` : `/relays?zip=`, `/create` (génère le PDF dans le bucket privé `labels`, renseigne le suivi dans l'offre), `/webhook` (à brancher). Fournisseur **Test** actif ; **Boxtal** = stub à coder quand `BOXTAL_KEY/SECRET` existent (devis, commande, points relais, suivi).
- `addresses.relay` = point relais de réception choisi (Compte ou formulaire d'achat).
- Sources des fonctions : `supabase/functions/payments`, `supabase/functions/shipping`.

## Front (JS vanilla, sans build)
`index.html`, `style.css` (thème tapis vert/or), `app.js` (routeur, vues), `auth.js` (authenticité photo), `game.js` (51 badges dont 3 Ambassadeur, XP, défis), `legal.js` (7 textes légaux), `sw.js` (cache `tdd-v12`), `intro.js` (cinématique dragon original, 1re visite, `localStorage sc_intro`, lien « Revoir l'intro » `[data-intro]`), `critters.js` (8 créatures SVG originales, attraper = badge secret `x_catch`), `fx.js` (tilt 3D + holo sur `.tile`, apparitions `.rv`, braises canvas, compteurs), `affiche.html` + `img/qr-boutique.png`, `manifest.json`, `img/` (logo, bannière, icônes, og).

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
