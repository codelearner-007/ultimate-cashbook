-- ============================================================
-- Migration 012: Sync Model — client-authoritative shared UUIDs
--                + soft-delete tombstones + delta cursors
-- ============================================================
-- DO NOT auto-run. Apply via Supabase SQL editor or `supabase db push`.
-- Fully idempotent (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS).
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- The mobile app is LOCAL-FIRST: every read/write hits SQLite first.
-- For paid/superadmin users the cloud is a background mirror. The old sync
-- engine pushed LOCAL row ids as cloud ids (which never existed → silent 404
-- on update/delete) and deduped by a lossy content fingerprint (dropping
-- legitimately-identical entries). The fix: the client UUID (localDb.newId())
-- becomes the SHARED primary key in BOTH SQLite and Postgres, so update/delete
-- by id work everywhere and dedup is by id, never by fingerprint.
--
-- Create endpoints therefore accept a client-supplied `id` (see backend models +
-- routers). The default gen_random_uuid() still applies when no id is sent.
--
-- SOFT-DELETE SCHEME (the one chosen here — documented for future readers)
-- -----------------------------------------------------------------------
-- Two distinct schemes, picked for correctness of the trigger-maintained
-- money balances:
--
--   * books / categories / customers / suppliers / payment_modes
--       → SOFT delete via a nullable `deleted_at timestamptz` column.
--         Their balances are *derived* aggregates (read directly from the row),
--         not summed into books.net_balance, so a soft-deleted row simply gets
--         hidden by every LIST/GET query (`deleted_at IS NULL`). The delta
--         endpoint returns these rows *including* the deleted_at value so other
--         devices can tombstone them locally.
--
--   * entries
--       → HARD delete (row is physically removed). This is REQUIRED: the
--         existing AFTER INSERT/UPDATE/DELETE balance triggers
--         (trg_update_book_balance, trg_update_category_balance,
--         trg_update_contact_balance, trg_update_payment_mode_balance) must
--         fire on DELETE to reverse the entry's contribution to every balance.
--         A soft-delete column would NOT reverse balances and would corrupt
--         books.net_balance. To still propagate the deletion to other devices,
--         a BEFORE DELETE trigger records the deleted entry id in a lightweight
--         `deleted_entries` tombstone table that the delta endpoint reports.
--
-- This keeps money/balance semantics identical to before — never changed.
-- ============================================================


-- ── 1. updated_at columns on tables that lack them ────────────────────────────
-- (books / customers / suppliers already have updated_at from migrations 001/004)

alter table public.entries        add column if not exists updated_at timestamptz not null default now();
alter table public.categories     add column if not exists updated_at timestamptz not null default now();
alter table public.payment_modes  add column if not exists updated_at timestamptz not null default now();


-- ── 2. deleted_at (soft-delete) columns on the six syncable tables ────────────

alter table public.books          add column if not exists deleted_at timestamptz;
alter table public.entries         add column if not exists deleted_at timestamptz;
alter table public.categories      add column if not exists deleted_at timestamptz;
alter table public.customers       add column if not exists deleted_at timestamptz;
alter table public.suppliers       add column if not exists deleted_at timestamptz;
alter table public.payment_modes   add column if not exists deleted_at timestamptz;


-- ── 3. BEFORE UPDATE triggers to maintain updated_at ──────────────────────────
-- Reuse the existing public.set_updated_at() defined in migration 001.
-- books / customers / suppliers already have these triggers — only add the
-- three missing ones (entries / categories / payment_modes).

drop trigger if exists entries_updated_at on public.entries;
create trigger entries_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();

drop trigger if exists categories_updated_at on public.categories;
create trigger categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists payment_modes_updated_at on public.payment_modes;
create trigger payment_modes_updated_at
  before update on public.payment_modes
  for each row execute function public.set_updated_at();


-- ── 4. Client now owns default payment modes ──────────────────────────────────
-- The client seeds Cash/Cheque locally (localDb.localCreateBook) and pushes them
-- like any other row (with their shared ids). The old server-side seed trigger
-- would create *server-generated* ids that the client can never match, breaking
-- id-based dedup. Drop the trigger + its function.

drop trigger if exists trg_seed_payment_modes on public.books;
drop function if exists public.seed_default_payment_modes();


-- ── 5. Entry tombstone table + BEFORE DELETE trigger ──────────────────────────
-- Records every hard-deleted entry so the delta endpoint can tell other devices
-- which entries to remove locally. user_id/book_id are scoped on read.

create table if not exists public.deleted_entries (
  id          uuid         primary key,
  book_id     uuid         not null,
  user_id     uuid         not null,
  deleted_at  timestamptz  not null default now()
);

alter table public.deleted_entries enable row level security;

drop policy if exists "Users read own deleted entries" on public.deleted_entries;
create policy "Users read own deleted entries"
  on public.deleted_entries for select
  using (auth.uid() = user_id);

create index if not exists deleted_entries_user_deleted_idx
  on public.deleted_entries(user_id, deleted_at);

create or replace function public.record_deleted_entry()
returns trigger language plpgsql security definer as $$
begin
  insert into public.deleted_entries (id, book_id, user_id, deleted_at)
  values (OLD.id, OLD.book_id, OLD.user_id, now())
  on conflict (id) do update set deleted_at = excluded.deleted_at;
  return OLD;
end;
$$;

drop trigger if exists trg_record_deleted_entry on public.entries;
create trigger trg_record_deleted_entry
  before delete on public.entries
  for each row execute function public.record_deleted_entry();


-- ── 6. Delta indexes: (user_id, updated_at) for fast "changes since" queries ──

create index if not exists books_user_updated_idx         on public.books(user_id, updated_at);
create index if not exists entries_user_updated_idx        on public.entries(user_id, updated_at);
create index if not exists categories_user_updated_idx     on public.categories(user_id, updated_at);
create index if not exists customers_user_updated_idx      on public.customers(user_id, updated_at);
create index if not exists suppliers_user_updated_idx      on public.suppliers(user_id, updated_at);
create index if not exists payment_modes_user_updated_idx  on public.payment_modes(user_id, updated_at);
