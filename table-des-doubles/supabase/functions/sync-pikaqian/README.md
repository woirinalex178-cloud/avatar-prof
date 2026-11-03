# Import PikaQian (chinois simplifié)

La fonction utilise uniquement l'API PikaQian ; la clé reste dans les secrets Supabase.

Secrets requis :

- `PIKAQIAN_API_KEY` : clé `pk_live_...` PikaQian
- `PIKAQIAN_SYNC_SECRET` : secret aléatoire réservé à la tâche d'import

La fonction doit être appelée avec le jeton service role dans `Authorization` et
`x-sync-token: <PIKAQIAN_SYNC_SECRET>`. Sans `apply=1`, elle reste en simulation.

Exemples :

- Simulation des 6 premiers sets : `?offset=0&take=6`
- Import réel : `?apply=1&offset=0&take=6`
- Seulement les sets déjà présents : ajouter `&existing_only=1`

Chaque passage renvoie `next_offset` : l'appeler de nouveau avec cette valeur
jusqu'à `null`. Les cartes existantes ne sont complétées que si leur image est
absente ; les scans existants ne sont jamais remplacés.
