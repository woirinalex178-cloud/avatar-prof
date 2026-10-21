-- Sharing Cards — 21/10/2026
-- Modération, purge RGPD, frais d'échange payés, liste de souhaits, import CSV.
-- Tout ce fichier est idempotent. Les blocs marqués [DÉJÀ APPLIQUÉ] l'ont été via l'outil Supabase ;
-- le bloc RGPD (en bas) doit être collé une fois dans Supabase → SQL Editor (il contient des DELETE,
-- que l'outil automatique refuse d'exécuter sans confirmation humaine).

-- ============ [DÉJÀ APPLIQUÉ] colonnes ============
alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists suspended_until timestamptz,
  add column if not exists suspend_reason text,
  add column if not exists last_seen date;
alter table public.reports
  add column if not exists status text not null default 'open',
  add column if not exists target_user uuid,
  add column if not exists handled_by uuid,
  add column if not exists handled_at timestamptz,
  add column if not exists note text;
alter table public.offers
  add column if not exists refund_requested boolean not null default false,
  add column if not exists refunded_at timestamptz,
  add column if not exists admin_note text,
  add column if not exists trade_paid_buyer boolean not null default false,
  add column if not exists trade_paid_seller boolean not null default false,
  add column if not exists trade_session_buyer text,
  add column if not exists trade_session_seller text;
create index if not exists reports_status_idx on public.reports (status, created_at desc);

-- ============ [DÉJÀ APPLIQUÉ] liste de souhaits ============
create table if not exists public.wishlist (
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id text not null references public.cards(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, card_id));
alter table public.wishlist enable row level security;
-- create policy "ma liste de souhaits" on public.wishlist for all to authenticated
--   using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists wishlist_card_idx on public.wishlist (card_id);

create table if not exists public.rgpd_log (id bigserial primary key, ran_at timestamptz not null default now(), result jsonb);
alter table public.rgpd_log enable row level security;

-- ============ RGPD : purge automatique (À COLLER DANS LE SQL EDITOR) ============
create or replace function public.rgpd_purge() returns jsonb
  language plpgsql security definer set search_path to 'public', 'auth' as $fn$
declare n_msg int; n_post int; n_rep int; n_chk int; n_acct int := 0; u uuid; res jsonb;
begin
  delete from public.messages m where m.created_at < now() - interval '3 years'
    and exists (select 1 from public.offers o where o.id = m.offer_id and o.status in ('completed','cancelled','declined','refunded'));
  get diagnostics n_msg = row_count;
  delete from public.posts where created_at < now() - interval '3 years';
  get diagnostics n_post = row_count;
  delete from public.reports where status <> 'open' and created_at < now() - interval '1 year';
  get diagnostics n_rep = row_count;
  delete from public.auth_checks where created_at < now() - interval '2 years';
  get diagnostics n_chk = row_count;
  for u in select p.id from public.profiles p
      where p.pseudo not like 'supprime|_%' escape '|'
        and greatest(coalesce(p.last_seen, p.created_at::date), p.created_at::date) < current_date - interval '3 years'
        and not exists (select 1 from public.offers o where p.id in (o.buyer_id, o.seller_id) and o.status in ('pending','accepted','paid','disputed'))
      limit 200
  loop
    perform set_config('app.deleting', '1', true);
    update public.listings set status = 'removed', note = null where user_id = u and status in ('active','reserved');
    delete from public.collection where user_id = u;
    delete from public.posts where user_id = u;
    delete from public.auth_checks where user_id = u;
    delete from public.wishlist where user_id = u;
    delete from public.addresses where user_id = u;
    update public.profiles set pseudo = 'supprime_' || substr(replace(u::text, '-', ''), 1, 10), region = null,
      birthdate = '1900-01-01', stripe_account_id = null, payouts_enabled = false, xp = 0,
      bio = null, fav = null, avatar = null where id = u;
    update auth.users set email = u::text || '@supprime.invalid', encrypted_password = '', phone = null,
      raw_user_meta_data = '{}'::jsonb, banned_until = 'infinity' where id = u;
    delete from auth.sessions where user_id = u;
    n_acct := n_acct + 1;
  end loop;
  res := jsonb_build_object('messages', n_msg, 'posts', n_post, 'signalements', n_rep, 'controles', n_chk, 'comptes_inactifs', n_acct);
  insert into public.rgpd_log (result) values (res);
  return res;
end $fn$;

-- modération : lancer la purge à la main
grant execute on function public.rgpd_purge() to authenticated;
create or replace function public.admin_purge() returns jsonb
  language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not public.is_admin() then raise exception 'Réservé à la modération.' using errcode = 'P0001'; end if;
  return public.rgpd_purge();
end $fn$;
revoke execute on function public.rgpd_purge() from authenticated;

-- tous les jours à 4 h 23 (heure serveur, UTC)
select cron.unschedule('rgpd-purge') where exists (select 1 from cron.job where jobname = 'rgpd-purge');
select cron.schedule('rgpd-purge', '23 4 * * *', 'select public.rgpd_purge()');

-- ============ remboursements Stripe (cron, toutes les 15 min) ============
select cron.unschedule('refunds') where exists (select 1 from cron.job where jobname = 'refunds');
select cron.schedule('refunds', '*/15 * * * *', $cron$
select net.http_post(
  url := 'https://zfnjljfmhlnctlidtvqm.supabase.co/functions/v1/payments/refunds',
  headers := jsonb_build_object('x-cron', (select v from private.app_secrets where k = 'cron'), 'Content-Type', 'application/json'),
  body := '{}'::jsonb, timeout_milliseconds := 60000)
$cron$);
