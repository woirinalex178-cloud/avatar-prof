-- Sharing Cards — 22/10/2026
-- Trophées/XP honnêtes (compteurs en base, anti-aller-retour), forum en sections,
-- blog hebdomadaire, masquage des coordonnées dans les messages publics.
-- Tout a été appliqué sur le projet zfnjljfmhlnctlidtvqm : ce fichier est la trace.
-- (Pas de DROP / DELETE ici : rien à recoller à la main.)

-- ===== compteurs officiels, côté serveur =====
create table if not exists public.stats (
  user_id uuid not null references public.profiles(id) on delete cascade,
  k text not null, n integer not null default 0, nd integer not null default 0,
  nw integer not null default 0, d date, w text, primary key (user_id, k));
alter table public.stats enable row level security;
-- create policy "mes compteurs" on public.stats for select to authenticated using (user_id = auth.uid());

-- anti-aller-retour : une carte ne compte qu'après 7 jours dans le classeur
alter table public.collection add column if not exists since date not null default current_date;
-- trigger collection_since (before insert or update) : since = date de première entrée

-- série de jours + dernière visite (sert aussi à la purge RGPD)
alter table public.profiles add column if not exists streak integer not null default 0,
  add column if not exists streak_best integer not null default 0;

-- fonctions : iso_week(), bump(k, n) [plafonds journaliers], my_stats(), my_visit(),
-- admin_reset_stats(user)  → voir la base pour le corps à jour.
-- Plafonds de bump : add 200/j, scan 100/j, auth 20/j, list 30/j, wish 50/j, catch 20/j,
-- night/early/logo 1 fois, daily 1/jour, weekly 1/semaine.

-- ===== masquage des coordonnées (forum et commentaires du blog) =====
create table if not exists public.safe_words (w text primary key);
alter table public.safe_words enable row level security;
-- rebuild_safe_words() : noms de Pokémon, extensions, séries, raretés + vocabulaire courant
-- mask_contacts(texte) : e-mail, lien, téléphone, @pseudo, IBAN → ###### ;
--   deux mots capitalisés de suite (nom de famille) → ###### sauf mots du catalogue.
-- posts.body est stocké masqué, posts.body_raw garde l'original (colonne non lisible
-- par les membres : revoke select (body_raw) on public.posts from authenticated, anon),
-- la modération le voit via admin_reports().

-- ===== forum en sections + votes =====
alter table public.posts
  add column if not exists section text not null default 'libre',
  add column if not exists title text,
  add column if not exists blog_id uuid references public.blog(id) on delete cascade,
  add column if not exists votes integer not null default 0,
  add column if not exists body_raw text;
-- sections : libre, recherche, idees, presentation, blog
create table if not exists public.post_votes (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (post_id, user_id));
alter table public.post_votes enable row level security;
-- trigger post_votes_count : tient posts.votes à jour

-- ===== blog =====
create table if not exists public.blog (
  id uuid primary key default gen_random_uuid(), slug text unique not null, title text not null,
  excerpt text, body text not null, cover text, tag text, status text not null default 'draft',
  created_at timestamptz not null default now(), published_at timestamptz, views integer not null default 0);
alter table public.blog enable row level security;
-- create policy "articles publiés" on public.blog for select to anon, authenticated
--   using (status = 'published' or public.is_admin());
-- admin_blog(action, id, patch) : list / publish / unpublish / trash / edit

-- edge function `blog` (verify_jwt off) : POST /generate → article en brouillon.
-- cron hebdomadaire :
-- select cron.schedule('blog-weekly', '13 6 * * 1', $cron$
-- select net.http_post(url := 'https://zfnjljfmhlnctlidtvqm.supabase.co/functions/v1/blog/generate',
--   headers := jsonb_build_object('x-cron', (select v from private.app_secrets where k = 'cron'), 'Content-Type', 'application/json'),
--   body := '{}'::jsonb, timeout_milliseconds := 120000) $cron$);
