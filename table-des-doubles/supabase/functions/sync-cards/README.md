Fonction Edge `sync-cards` (source : `index.ts`, version 11).
- `?plan=1` : liste les séries de chaque langue depuis TCGdex et remplit `sync_queue`.
- sans paramètre : traite la file ~100 s (pg_cron chaque minute).
- Cotes : lues carte par carte pour l'anglais **et le japonais** (chacun a sa fiche Cardmarket).
  On stocke tendance, moyennes 7 j / 30 j, prix bas (Cardmarket) + prix TCGplayer converti en euros (`price_alt`).
  `price_basis` dit quelle valeur sert de cote. Carte seulement holo → valeurs « -holo ».
  Tendance écartée de plus du double de la moyenne 30 j → on retient la moyenne 30 j.
- `copy_en_set` recopie la cote anglaise vers FR, DE, ES, IT, PT.
- `?ko=1` : noms coréens des séries + `ko_mirror()` (catalogue coréen calqué sur le japonais).
- pg_cron `refresh-prices` : chaque nuit 3h17, remet les séries EN et JA en file.
