-- ============================================================
-- Migration 008: Backfill Display Orders
-- ============================================================
-- Sets display_order for any existing categories, customers,
-- suppliers, and payment_modes that were created before the
-- display_order column existed (value = 0 means not yet set).
-- Safe to re-run; uses ROW_NUMBER() ordered by created_at.
-- ============================================================


-- ── categories ────────────────────────────────────────────────────────────────

update public.categories c
set display_order = ranked.rn - 1
from (
  select id,
         row_number() over (partition by book_id order by created_at) as rn
  from public.categories
  where display_order = 0
) ranked
where c.id = ranked.id;


-- ── customers ─────────────────────────────────────────────────────────────────

update public.customers c
set display_order = ranked.rn - 1
from (
  select id,
         row_number() over (partition by book_id order by created_at) as rn
  from public.customers
  where display_order = 0
) ranked
where c.id = ranked.id;


-- ── suppliers ─────────────────────────────────────────────────────────────────

update public.suppliers s
set display_order = ranked.rn - 1
from (
  select id,
         row_number() over (partition by book_id order by created_at) as rn
  from public.suppliers
  where display_order = 0
) ranked
where s.id = ranked.id;


-- ── payment_modes ─────────────────────────────────────────────────────────────

update public.payment_modes pm
set display_order = ranked.rn - 1
from (
  select id,
         row_number() over (partition by book_id order by created_at) as rn
  from public.payment_modes
  where display_order = 0
) ranked
where pm.id = ranked.id;


-- ── Admin data bytes helper (all tables now exist) ────────────────────────────

create or replace function public.get_user_data_bytes(p_user_id uuid)
returns bigint language sql security definer as $$
  select coalesce(
    (select sum(pg_column_size(e))  from public.entries e        where e.user_id  = p_user_id) +
    (select sum(pg_column_size(b))  from public.books b          where b.user_id  = p_user_id) +
    (select sum(pg_column_size(c))  from public.categories c     where c.user_id  = p_user_id) +
    (select sum(pg_column_size(p))  from public.profiles p       where p.id       = p_user_id) +
    (select sum(pg_column_size(m))  from public.payment_modes m  where m.user_id  = p_user_id) +
    (select sum(pg_column_size(cu)) from public.customers cu     where cu.user_id = p_user_id) +
    (select sum(pg_column_size(s))  from public.suppliers s      where s.user_id  = p_user_id),
    0
  )::bigint;
$$;
