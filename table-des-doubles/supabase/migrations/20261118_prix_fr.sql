-- L'IA recopie les prix tels que la base les lui donne : « 815.9 € », « 497.55 € ».
-- En français on écrit « 815,90 € ». Même principe que pour les dates : on corrige
-- juste avant l'enregistrement, sur tous les canaux d'un coup (article, forum, FB, IG,
-- TikTok, X, Threads). Appliqué sur zfnjljfmhlnctlidtvqm le 18/11/2026.
create or replace function public.texte_prix_fr(txt text)
returns text language plpgsql immutable set search_path to 'public'
as $$
declare m text[]; dec text;
begin
  if txt is null then return null; end if;
  for m in select regexp_matches(txt, '(\d+)\.(\d{1,2})(?= ?€)', 'g') loop
    dec := m[2];
    if length(dec) = 1 then dec := dec || '0'; end if;   -- 815.9 € -> 815,90 €
    txt := replace(txt, m[1] || '.' || m[2] || ' €', m[1] || ',' || dec || ' €');
    txt := replace(txt, m[1] || '.' || m[2] || '€',  m[1] || ',' || dec || '€');
  end loop;
  return txt;
end $$;

create or replace function public.blog_dates_bi()
returns trigger language plpgsql set search_path to 'public'
as $$
begin
  new.title      := public.texte_prix_fr(public.texte_dates_fr(new.title));
  new.excerpt    := public.texte_prix_fr(public.texte_dates_fr(new.excerpt));
  new.body       := public.texte_prix_fr(public.texte_dates_fr(new.body));
  new.forum_body := public.texte_prix_fr(public.texte_dates_fr(new.forum_body));
  new.fb         := public.texte_prix_fr(public.texte_dates_fr(new.fb));
  new.ig         := public.texte_prix_fr(public.texte_dates_fr(new.ig));
  new.tiktok     := public.texte_prix_fr(public.texte_dates_fr(new.tiktok));
  new.x          := public.texte_prix_fr(public.texte_dates_fr(new.x));
  new.threads    := public.texte_prix_fr(public.texte_dates_fr(new.threads));
  return new;
end $$;
