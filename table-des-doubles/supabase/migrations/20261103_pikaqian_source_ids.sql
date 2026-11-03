-- Identifiants externes nécessaires pour joindre les scans PikaQian sans
-- remplacer les identifiants TCGdex déjà utilisés par l'application.
alter table public.cards add column if not exists pikaqian_id text;
alter table public.sets add column if not exists pikaqian_id text;

create unique index if not exists cards_pikaqian_id_unique
  on public.cards (pikaqian_id)
  where pikaqian_id is not null;

create unique index if not exists sets_pikaqian_id_unique
  on public.sets (pikaqian_id)
  where pikaqian_id is not null;
