-- L'IA recopie fidèlement les dates que la base lui donne, donc au format 2026-11-13.
-- Dans un article publié, ça fait « écrit par une machine ». On les repasse en français
-- juste avant l'enregistrement, sur tous les canaux d'un coup (article, forum, FB, IG, TikTok).
-- Appliqué sur zfnjljfmhlnctlidtvqm le 15/11/2026.
create or replace function public.texte_dates_fr(txt text)
returns text language plpgsql immutable set search_path to 'public'
as $$
declare
  m text[];
  mois text[] := array['janvier','février','mars','avril','mai','juin',
                       'juillet','août','septembre','octobre','novembre','décembre'];
  jour text;
begin
  if txt is null then return null; end if;
  for m in select regexp_matches(txt, '(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])', 'g') loop
    jour := ltrim(m[3], '0');
    if jour = '1' then jour := '1er'; end if;
    txt := replace(txt, m[1] || '-' || m[2] || '-' || m[3],
                   jour || ' ' || mois[m[2]::int] || ' ' || m[1]);
  end loop;
  return txt;
end $$;

create or replace function public.blog_dates_bi()
returns trigger language plpgsql set search_path to 'public'
as $$
begin
  new.title      := public.texte_dates_fr(new.title);
  new.excerpt    := public.texte_dates_fr(new.excerpt);
  new.body       := public.texte_dates_fr(new.body);
  new.forum_body := public.texte_dates_fr(new.forum_body);
  new.fb         := public.texte_dates_fr(new.fb);
  new.ig         := public.texte_dates_fr(new.ig);
  new.tiktok     := public.texte_dates_fr(new.tiktok);
  return new;
end $$;

create or replace trigger blog_dates_bi before insert on public.blog
  for each row execute function public.blog_dates_bi();
