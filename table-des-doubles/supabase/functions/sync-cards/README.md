Fonction Edge `sync-cards` (version 3, déployée sur Supabase `table-des-doubles`).
- `?plan=1` : liste les sets de chaque langue (en, fr, de, es, it, pt, ja) depuis TCGdex et remplit `sync_queue`.
- sans paramètre : traite la file ~100 s (pg_cron chaque minute). Les sets EN récupèrent rareté + cote Cardmarket carte par carte,
  puis `copy_en_set` recopie cote/rareté/image vers FR, DE, ES, IT, PT. Le japonais n'a pas de cote.
- pg_cron `refresh-prices` : chaque dimanche 3h17, remet les sets EN en file (rafraîchissement des cotes).
