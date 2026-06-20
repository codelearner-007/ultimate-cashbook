-- ============================================================
-- Migration 013: Storage calculation functions
-- ============================================================
-- get_user_data_bytes: sums pg_column_size() across all 7 user
-- tables so admin can see real DB row bytes per user.
-- get_user_storage_bytes is already defined in 002_storage.sql
-- but is re-declared here (CREATE OR REPLACE) for completeness.
-- ============================================================

-- ── DB row bytes across all user tables ──────────────────────────────────────

create or replace function public.get_user_data_bytes(p_user_id uuid)
returns bigint language sql security definer as $$
  select coalesce(
    (select sum(pg_column_size(e.*))::bigint from entries       e where e.user_id = p_user_id) +
    (select sum(pg_column_size(b.*))::bigint from books         b where b.user_id = p_user_id) +
    (select sum(pg_column_size(c.*))::bigint from categories    c where c.user_id = p_user_id) +
    (select sum(pg_column_size(cu.*))::bigint from customers    cu where cu.user_id = p_user_id) +
    (select sum(pg_column_size(s.*))::bigint from suppliers     s where s.user_id = p_user_id),
  0)::bigint;
$$;

-- ── Storage file bytes (re-declare in case 002 hasn't been applied) ──────────

create or replace function public.get_user_storage_bytes(p_user_id uuid)
returns bigint language sql security definer as $$
  select coalesce(
    sum((metadata->>'size')::bigint), 0
  )::bigint
  from storage.objects
  where bucket_id in ('attachments', 'avatars')
    and name like p_user_id::text || '/%';
$$;
