-- La page « Journal » du site (route #/journal) et ce qu'il lui faut côté base.
-- Appliqué sur zfnjljfmhlnctlidtvqm le 14/11/2026.

-- 1. Compteur de lectures, appelé par le front à l'ouverture d'un article.
-- Sans lui, `blog.views` restait à 0 : la notation hebdomadaire des publications
-- (fonction Edge blog/learn) n'avait aucune matière pour apprendre.
create or replace function public.blog_view(p_slug text)
returns void
language sql security definer set search_path to 'public'
as $$
  update public.blog set views = coalesce(views, 0) + 1
  where slug = p_slug and status = 'published';
$$;
grant execute on function public.blog_view(text) to anon, authenticated;

-- 2. Illustration automatique.
-- Un article sans image passe mal sur le site comme sur les réseaux — Instagram refuse
-- même de publier sans visuel. À défaut d'illustration fournie, on prend l'image de la
-- carte vedette de la semaine, sinon le visuel du site.
create or replace function public.blog_cover_auto()
returns trigger
language plpgsql set search_path to 'public'
as $$
declare v_img text;
begin
  if new.cover is not null and new.cover <> '' then return new; end if;

  select c.image into v_img
  from public.gazette_movers(6) m
  join public.cards c
    on c.lang = 'fr' and coalesce(c.name_fr, c.name) = m.nom and c.local_id::text = m.num
  where c.image is not null
  limit 1;

  if v_img is not null then
    new.cover := v_img || '/high.webp';          -- convention TCGdex : /low.webp ou /high.webp
  else
    new.cover := 'https://table-des-doubles.vercel.app/img/og.jpg';
  end if;
  return new;
end $$;

create or replace trigger blog_cover_bi before insert on public.blog
  for each row execute function public.blog_cover_auto();
