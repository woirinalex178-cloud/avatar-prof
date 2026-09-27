# Table des Doubles

Classeur de cartes + place d'échange de doubles (18+).

- Site : https://table-des-doubles.vercel.app
- Base : Supabase `table-des-doubles` (auth, RLS, photos, temps réel)
- Cotes Cardmarket via TCGdex (fonction `sync-cards`)

Règles appliquées côté base : 18+ obligatoire, coordonnées bloquées, transactions uniquement via `offer_action()`.
