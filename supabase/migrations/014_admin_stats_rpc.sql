-- ============================================================
-- Migration 014: get_admin_user_stats() — single-round-trip admin stats
-- ============================================================
-- Replaces the O(5N) per-user round-trips in GET /api/v1/admin/users
-- (book count, entry count, two storage RPCs, shared-books count) with a
-- single set-returning function: one row per non-superadmin profile,
-- carrying every profile column PLUS the computed stats.
--
-- Counts exclude soft-deleted books/entries (deleted_at IS NOT NULL).
-- data_bytes / storage_bytes reuse the exact logic of the existing
-- get_user_data_bytes() / get_user_storage_bytes() helpers so numbers match.
--
-- Idempotent (CREATE OR REPLACE). security definer — runs as the function
-- owner, not the caller. Do NOT auto-run; apply via SQL editor / supabase db push.
-- ============================================================

create or replace function public.get_admin_user_stats()
returns table (
  -- all profile columns (mirrors public.profiles)
  id                                uuid,
  email                             text,
  full_name                         text,
  phone                             text,
  avatar_url                        text,
  role                              text,
  is_active                         boolean,
  currency                          text,
  is_dark_mode                      boolean,
  subscription_tier                 text,
  subscription_status               text,
  subscription_started_at           timestamptz,
  subscription_billing_cycle        text,
  subscription_expires_at           timestamptz,
  subscription_cancel_at_period_end boolean,
  created_at                        timestamptz,
  updated_at                        timestamptz,
  -- computed stats
  book_count                        bigint,
  entry_count                       bigint,
  shared_books_count                bigint,
  data_bytes                        bigint,
  storage_bytes                     bigint
)
language sql
security definer
as $$
  select
    p.id,
    p.email,
    p.full_name,
    p.phone,
    p.avatar_url,
    p.role,
    p.is_active,
    p.currency,
    p.is_dark_mode,
    p.subscription_tier,
    p.subscription_status,
    p.subscription_started_at,
    p.subscription_billing_cycle,
    p.subscription_expires_at,
    p.subscription_cancel_at_period_end,
    p.created_at,
    p.updated_at,
    coalesce((
      select count(*) from public.books b
      where b.user_id = p.id and b.deleted_at is null
    ), 0) as book_count,
    coalesce((
      select count(*) from public.entries e
      where e.user_id = p.id and e.deleted_at is null
    ), 0) as entry_count,
    coalesce((
      select count(*) from public.book_shares bs
      where bs.owner_id = p.id and bs.status = 'accepted'
    ), 0) as shared_books_count,
    -- data_bytes: mirror of get_user_data_bytes(p.id)
    coalesce(
      (select sum(pg_column_size(e))  from public.entries e        where e.user_id  = p.id) +
      (select sum(pg_column_size(b))  from public.books b          where b.user_id  = p.id) +
      (select sum(pg_column_size(c))  from public.categories c     where c.user_id  = p.id) +
      (select sum(pg_column_size(pr)) from public.profiles pr      where pr.id      = p.id) +
      (select sum(pg_column_size(m))  from public.payment_modes m  where m.user_id  = p.id) +
      (select sum(pg_column_size(cu)) from public.customers cu     where cu.user_id = p.id) +
      (select sum(pg_column_size(s))  from public.suppliers s      where s.user_id  = p.id),
      0
    )::bigint as data_bytes,
    -- storage_bytes: mirror of get_user_storage_bytes(p.id)
    coalesce((
      select sum((o.metadata->>'size')::bigint)
      from storage.objects o
      where o.bucket_id in ('attachments', 'avatars')
        and o.name like p.id::text || '/%'
    ), 0)::bigint as storage_bytes
  from public.profiles p
  where p.role <> 'superadmin'
  order by p.created_at desc;
$$;

-- ── Lock down direct client access ─────────────────────────────────────────────
-- security-definer functions are EXECUTE-able by PUBLIC on creation. This one
-- returns EVERY user's stats, so deny anon/authenticated (who could otherwise call
-- it via PostgREST RPC and dump all users). The FastAPI backend uses service_role,
-- which keeps explicit execute.
revoke execute on function public.get_admin_user_stats() from public, anon, authenticated;
grant  execute on function public.get_admin_user_stats() to service_role;

-- Defence-in-depth: the other data-exposing security-definer RPCs take a user_id
-- argument and would otherwise let any authenticated client read another user's
-- data via PostgREST. Revoke them too; service_role keeps access. Guarded so this
-- migration never fails if a function isn't present in a given environment.
do $$
begin
  begin
    revoke execute on function public.get_books_with_summary(uuid) from public, anon, authenticated;
    grant  execute on function public.get_books_with_summary(uuid) to service_role;
  exception when undefined_function then null; end;
  begin
    revoke execute on function public.get_book_summary(uuid, uuid) from public, anon, authenticated;
    grant  execute on function public.get_book_summary(uuid, uuid) to service_role;
  exception when undefined_function then null; end;
  begin
    revoke execute on function public.get_user_data_bytes(uuid) from public, anon, authenticated;
    grant  execute on function public.get_user_data_bytes(uuid) to service_role;
  exception when undefined_function then null; end;
  begin
    revoke execute on function public.get_user_storage_bytes(uuid) from public, anon, authenticated;
    grant  execute on function public.get_user_storage_bytes(uuid) to service_role;
  exception when undefined_function then null; end;
end $$;
