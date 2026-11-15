-- « La Gazette » : moteur de publication multi-canal (site, forum, Facebook, Instagram, TikTok).
-- Appliqué sur le projet zfnjljfmhlnctlidtvqm le 14/11/2026.

-- 1. une ligne de `blog` = une publication déclinée sur tous les canaux
alter table public.blog
  add column if not exists forum_body  text,
  add column if not exists fb          text,
  add column if not exists ig          text,
  add column if not exists tiktok      text,
  add column if not exists k           text,        -- jeton de validation, usage unique (lien du mail)
  add column if not exists post_id     bigint,      -- fil ouvert sur le forum
  add column if not exists social_at   timestamptz,
  add column if not exists social_log  jsonb,
  add column if not exists score       int,         -- note 0-100 (boucle IA)
  add column if not exists reviewed_at timestamptz;

create index if not exists blog_status_idx on public.blog (status, created_at desc);

-- 2. mémoire de la boucle IA : ce qui a marché, ce qui n'a pas marché
create table if not exists public.content_learn (
  id         bigserial primary key,
  d          date        not null default current_date,
  lesson     text        not null,
  evidence   jsonb,
  weight     int         not null default 1,
  created_at timestamptz not null default now()
);
alter table public.content_learn enable row level security;   -- service role uniquement
comment on table public.content_learn is 'Enseignements de la boucle IA, relus par le prompt de rédaction.';

-- 3. les cartes qui bougent VRAIMENT
-- Le fournisseur de cotes sort des valeurs aberrantes : 171 cartes pile à -80 % (prix divisé par 5),
-- des +4947 % sur des cotes de départ à 5 €. Sans garde-fou, la Gazette publierait des chiffres faux.
create or replace function public.gazette_movers(p_limit int default 6)
returns table (nom text, num text, cote numeric, avant numeric, delta int, releve date)
language sql stable security definer set search_path to 'public'
as $$
  with d as (
    select coalesce(c.name_fr, c.name) as nom,
           c.local_id::text            as num,
           c.price_eur                 as cote,
           c.price_prev                as avant,
           round(((c.price_eur / c.price_prev) - 1) * 100)::int as delta,
           c.price_prev_at::date       as releve,
           row_number() over (partition by coalesce(c.name_fr, c.name)
             order by abs((c.price_eur / c.price_prev) - 1) desc) as rn
    from public.cards c
    where c.lang = 'fr'
      and c.price_eur  >= 2                                     -- une petite cote fait des % absurdes
      and c.price_prev >= 2
      and c.price_prev_at > now() - interval '21 days'           -- sinon ce n'est plus l'actualité
      and abs(c.price_eur - c.price_prev) >= 0.5                 -- pas de « +12 % » sur 30 centimes
      and abs((c.price_eur / c.price_prev) - 1) between 0.08 and 0.40
  )
  select nom, num, cote, avant, delta, releve
  from d where rn = 1                                            -- une seule ligne par nom de carte
  order by abs(delta) desc, cote desc
  limit greatest(1, least(p_limit, 20));
$$;
revoke all on function public.gazette_movers(int) from public;
grant execute on function public.gazette_movers(int) to service_role;

-- 4. le compte robot qui signe les publications sur le forum
-- Le pseudo ne peut pas contenir d'espace (profiles_pseudo_check) : « LaGazette », pas « La Gazette ».
create or replace function public.gazette_id()
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare v_id uuid;
begin
  select id into v_id from public.profiles where pseudo = 'LaGazette';
  if v_id is not null then return v_id; end if;

  select id into v_id from auth.users where email = 'gazette@table-des-doubles.invalid';
  if v_id is null then
    raise exception 'compte Gazette absent : la fonction blog le crée au premier passage';
  end if;

  insert into public.profiles (id, pseudo, birthdate, bio, avatar, theme, show_collection, show_badges)
  values (v_id, 'LaGazette', '1990-01-01', 'Le journal du site : cotes, extensions et vie de la table.', '3:5', 'gold', false, false)
  on conflict (id) do update set pseudo = 'LaGazette';
  return v_id;
end $$;
revoke all on function public.gazette_id() from public;
grant execute on function public.gazette_id() to service_role;

-- 5. la boucle d'auto-amélioration, 30 min avant la rédaction du lundi
-- select cron.schedule('gazette-learn', '41 5 * * 1', $$ ... blog/learn ... $$);  -- appliqué via pg_cron
