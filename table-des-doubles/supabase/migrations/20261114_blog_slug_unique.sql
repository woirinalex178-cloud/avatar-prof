-- EN ATTENTE DE CONFIRMATION (non appliqué au 14/11/2026).
-- Deux rédactions le même jour sur la même carte vedette produisaient le même slug : erreur blog_slug_key.
-- Le slug se rend unique tout seul : « …-2026-11-14 », puis « …-2026-11-14-2 ».
create or replace function public.blog_slug_unique()
returns trigger
language plpgsql set search_path to 'public'
as $$
declare base text; n int := 1;
begin
  if new.slug is null or new.slug = '' then
    new.slug := 'article-' || to_char(now(), 'YYYY-MM-DD-HH24MI');
  end if;
  base := new.slug;
  while exists (select 1 from public.blog where slug = new.slug and (tg_op = 'INSERT' or id <> new.id)) loop
    n := n + 1;
    new.slug := left(base, 70) || '-' || n;
    if n > 50 then
      new.slug := left(base, 60) || '-' || to_char(now(), 'HH24MISS');
      exit;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists blog_slug_bi on public.blog;
create trigger blog_slug_bi before insert or update of slug on public.blog
  for each row execute function public.blog_slug_unique();
