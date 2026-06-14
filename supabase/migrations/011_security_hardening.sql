-- ============================================================
-- Migration 011: Security Hardening (RLS)
-- ============================================================
-- Closes critical/high access-control holes found in the
-- production audit. All of these are exploitable directly from
-- the shipped anon-key supabase-js client (which the app embeds
-- for auth + realtime). The FastAPI backend uses the service
-- role and bypasses RLS, so none of these changes affect the
-- app's normal data paths (all data writes go through the API).
--
-- Fixes:
--   1. profiles: freeze privileged columns (role, subscription_*)
--      against direct user updates  -> stops free self-upgrade and
--      self-promotion to superadmin.
--   2. otp_codes: enable RLS (no anon/auth policy) -> stops plaintext
--      sign-in codes leaking to any anon client (account takeover).
--   3. book_shares: block a recipient from escalating their own
--      rights/screens; they may only flip status.
--   4. books/entries/categories/customers/suppliers/payment_modes:
--      add WITH CHECK incl. book-ownership so a user cannot insert
--      child rows pointing at another user's book.
--   5. notifications: scope SELECT to delivered notifications only.
--   6. user_notifications: add WITH CHECK so a row cannot be
--      reassigned to another user_id.
--
-- Safe to run once on an existing prod database (uses DROP ... IF
-- EXISTS + CREATE). Run via Supabase CLI `supabase db push` or paste
-- into the SQL Editor.
-- ============================================================


-- ── 1a. profiles: account activation flag ──────────────────────────────────────
-- Source of truth for admin deactivation. Referenced by the admin dashboard and
-- enforced server-side in get_current_user (a deactivated user is rejected 403).
alter table public.profiles
  add column if not exists is_active boolean not null default true;
create index if not exists profiles_is_active_idx on public.profiles(is_active);


-- ── 1b. profiles: protect privileged columns ──────────────────────────────────
-- RLS WITH CHECK cannot diff OLD vs NEW, so use a BEFORE UPDATE trigger.
-- When a real end-user performs the update, auth.uid() is their id (the RLS
-- USING clause already guarantees auth.uid() = id). The service-role backend
-- has no `sub` claim, so auth.uid() is NULL there -> the backend (and the
-- RevenueCat webhook) remain the only writers of these columns.

create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    -- An authenticated end-user is updating their own row: pin privileged
    -- columns to their existing values. full_name / phone / avatar_url /
    -- currency / is_dark_mode remain freely editable.
    NEW.role                              := OLD.role;
    NEW.is_active                         := OLD.is_active;
    NEW.subscription_tier                 := OLD.subscription_tier;
    NEW.subscription_status               := OLD.subscription_status;
    NEW.subscription_started_at           := OLD.subscription_started_at;
    NEW.subscription_billing_cycle        := OLD.subscription_billing_cycle;
    NEW.subscription_expires_at           := OLD.subscription_expires_at;
    NEW.subscription_cancel_at_period_end := OLD.subscription_cancel_at_period_end;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_protect_profile_columns on public.profiles;
create trigger trg_protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();


-- ── 2. otp_codes: enable RLS, deny all direct client access ────────────────────
-- Only the service-role backend (which bypasses RLS) may read/write codes.

alter table public.otp_codes enable row level security;
revoke all on public.otp_codes from anon, authenticated;
-- No policies are created on purpose: with RLS enabled and no policy, every
-- anon/authenticated request returns zero rows and cannot insert/update/delete.

-- Per-code attempt counter so verify-otp can lock out brute-force guessing.
alter table public.otp_codes add column if not exists attempts integer not null default 0;


-- ── 3. book_shares: block recipient privilege escalation ───────────────────────
-- The existing "Recipient responds to invitation" UPDATE policy has no WITH
-- CHECK, letting a recipient set rights='view_create_edit_delete' on their own
-- share. Keep the policy (so accept still works if ever done client-side) but
-- add a trigger that rejects any recipient-initiated change other than status.

create or replace function public.guard_recipient_share_update()
returns trigger language plpgsql security definer as $$
begin
  -- Only constrain updates performed by the recipient (not the owner / backend).
  if auth.uid() = NEW.shared_with_id and auth.uid() <> NEW.owner_id then
    if NEW.rights         is distinct from OLD.rights
       or NEW.screens     is distinct from OLD.screens
       or NEW.owner_id    is distinct from OLD.owner_id
       or NEW.book_id     is distinct from OLD.book_id
       or NEW.shared_with_id is distinct from OLD.shared_with_id then
      raise exception 'recipients may only change invitation status';
    end if;
    if NEW.status not in ('pending', 'accepted') then
      raise exception 'invalid status transition';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_guard_recipient_share_update on public.book_shares;
create trigger trg_guard_recipient_share_update
  before update on public.book_shares
  for each row execute function public.guard_recipient_share_update();


-- ── 4. core data tables: add WITH CHECK incl. book ownership ───────────────────
-- The FOR ALL policies created in 001/003/004/005 only check the row's own
-- user_id (no WITH CHECK), so a user could INSERT a child row carrying their
-- own user_id but pointing at someone else's book_id; the balance triggers then
-- corrupt the victim book's totals. Recreate each policy with an explicit
-- WITH CHECK that also verifies the referenced book belongs to the caller.

-- books (no book_id; just own-row ownership). Keep collaborator SELECT (007).
drop policy if exists "Users own their books" on public.books;
create policy "Users own their books"
  on public.books for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- entries
drop policy if exists "Users own their entries" on public.entries;
create policy "Users own their entries"
  on public.entries for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.books b
      where b.id = entries.book_id and b.user_id = auth.uid()
    )
  );

-- categories
drop policy if exists "Users manage own categories" on public.categories;
create policy "Users manage own categories"
  on public.categories for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.books b
      where b.id = categories.book_id and b.user_id = auth.uid()
    )
  );

-- customers
drop policy if exists "Users manage own customers" on public.customers;
create policy "Users manage own customers"
  on public.customers for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.books b
      where b.id = customers.book_id and b.user_id = auth.uid()
    )
  );

-- suppliers
drop policy if exists "Users manage own suppliers" on public.suppliers;
create policy "Users manage own suppliers"
  on public.suppliers for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.books b
      where b.id = suppliers.book_id and b.user_id = auth.uid()
    )
  );

-- payment_modes
drop policy if exists "Users manage own payment modes" on public.payment_modes;
create policy "Users manage own payment modes"
  on public.payment_modes for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.books b
      where b.id = payment_modes.book_id and b.user_id = auth.uid()
    )
  );


-- ── 5. notifications: scope SELECT to delivered rows ───────────────────────────
-- Old policy used `using (true)`, letting any authenticated user read every
-- notification (including ones targeted at other users).

drop policy if exists "Authenticated users can read notifications" on public.notifications;
create policy "Users read delivered notifications"
  on public.notifications for select to authenticated
  using (
    exists (
      select 1 from public.user_notifications un
      where un.notification_id = notifications.id
        and un.user_id = auth.uid()
    )
  );


-- ── 6. user_notifications: add WITH CHECK to UPDATE ────────────────────────────
-- Old UPDATE policy had no WITH CHECK, allowing a user to reassign a row's
-- user_id to someone else.

drop policy if exists "Users mark notifications read" on public.user_notifications;
create policy "Users mark notifications read"
  on public.user_notifications for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
