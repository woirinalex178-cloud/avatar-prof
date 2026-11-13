-- Visuels confirmés par les membres.
-- Quand une carte n'a pas de visuel, le membre touche, parmi les propositions du scan, l'image qui va avec.
-- Le visuel est appliqué tout de suite à la carte (et aux autres langues de la même illustration sans visuel),
-- et chaque choix est gardé dans art_suggest : qui, quand, quelle image. La modération peut l'annuler.

alter table public.cards add column if not exists image_by uuid;

create table if not exists public.art_suggest (
  card_id text not null references public.cards(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_card text,
  image text not null,
  created_at timestamptz not null default now(),
  primary key (card_id, user_id)
);
alter table public.art_suggest enable row level security;
drop policy if exists art_suggest_read on public.art_suggest;
create policy art_suggest_read on public.art_suggest for select using (user_id = auth.uid() or public.is_admin());

create or replace function public.art_confirm(p_card text, p_from text) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare tgt public.cards; src public.cards; url text; k text; n integer;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour associer un visuel.' using errcode = 'P0001'; end if;
  select * into tgt from public.cards where id = p_card;
  if not found then raise exception 'Carte inconnue.' using errcode = 'P0001'; end if;
  if tgt.image is not null or tgt.image_url is not null then return 0; end if;
  select * into src from public.cards where id = p_from;
  if not found then raise exception 'Visuel inconnu.' using errcode = 'P0001'; end if;
  url := coalesce(src.image_url, case when src.image is not null then src.image || '/high.webp' end);
  if url is null then raise exception 'Cette proposition n''a pas de visuel non plus.' using errcode = 'P0001'; end if;
  -- garde-fou : 60 visuels par jour et par membre
  if (select count(*) from public.art_suggest where user_id = auth.uid() and created_at > now() - interval '1 day') >= 60 then
    raise exception 'Limite de 60 visuels par jour atteinte : merci, reviens demain !' using errcode = 'P0001'; end if;
  insert into public.art_suggest(card_id, user_id, from_card, image) values (p_card, auth.uid(), p_from, url)
    on conflict (card_id, user_id) do update set from_card = excluded.from_card, image = excluded.image, created_at = now();
  -- la carte, et la même illustration dans les autres langues quand elle n'a pas de visuel
  k := regexp_replace(p_card, '^[a-z]{2}(-[a-z]{2})?:', '');
  update public.cards c set image_url = url, image_lang = coalesce(src.image_lang, src.lang), image_by = auth.uid()
   where (c.id = p_card or regexp_replace(c.id, '^[a-z]{2}(-[a-z]{2})?:', '') = k)
     and c.image is null and c.image_url is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.art_confirm(text, text) from public, anon;
grant execute on function public.art_confirm(text, text) to authenticated;

-- Modération : retirer un visuel posé par un membre (toutes les langues qui l'ont reçu)
create or replace function public.admin_art_revert(p_card text) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare url text; n integer;
begin
  if not public.is_admin() then raise exception 'Réservé à la modération.' using errcode = 'P0001'; end if;
  select image_url into url from public.cards where id = p_card and image_by is not null;
  if url is null then return 0; end if;
  update public.cards set image_url = null, image_lang = null, image_by = null where image_url = url and image_by is not null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.admin_art_revert(text) from public, anon;
grant execute on function public.admin_art_revert(text) to authenticated;
