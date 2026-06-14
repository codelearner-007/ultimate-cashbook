# CLAUDE.md — Supabase (cashbook/supabase)

> **Auto-update rule:** Whenever a migration SQL file is added or modified, or when Supabase config (auth, storage, RLS) changes, update the matching section in this file before finishing the task.

---

## Project Overview

Supabase provides three things for Ultimate CashBook:
1. **PostgreSQL database** — the cloud mirror for paid/superadmin users (the app itself is local-first; see root CLAUDE.md)
2. **Auth** — Google OAuth + custom Gmail email-OTP + JWT issuance
3. **Storage** — entry photo attachments + avatars

The app is **local-first**: free users live entirely in on-device SQLite. Paid/superadmin users additionally mirror to this Postgres database via a durable outbox + delta-pull (`GET /books/sync/changes`), keyed by a client-supplied shared UUID. Migration 012 is what makes the schema sync-ready.

---

## Migration Order

There are exactly **14** migration files (`supabase/migrations/`). Run them in order in the Supabase SQL Editor (or `supabase db push`). All are idempotent where practical.

| # | File | What it does |
|---|---|---|
| 001 | `001_profiles_books_entries.sql` | `uuid-ossp` ext; the three core tables `profiles` (role, currency, is_dark_mode, subscription_tier/started_at/billing_cycle), `books` (net_balance + four `show_*` flags, **default true**), `entries` (incl `attachment_path`, `attachment_provider`). `handle_new_user` first-user-superadmin trigger, `set_updated_at` + updated_at triggers, `update_book_balance` trigger, base RLS, indexes, `get_books_with_summary` + `get_book_summary` RPCs. |
| 002 | `002_storage.sql` | Public `avatars` bucket (5 MB, image MIME types) + private `attachments` bucket, with storage.objects RLS policies. `get_user_storage_bytes(p_user_id)` RPC. |
| 003 | `003_categories.sql` | Per-book `categories` (UNIQUE(book_id,name), auto balances, display_order); `entries.category_id` FK (SET NULL); `update_category_balance` trigger; `clear_category_on_delete` BEFORE DELETE (nulls `entries.category` snapshot). |
| 004 | `004_customers_suppliers.sql` | Per-book `customers` + `suppliers` (auto balances, display_order, updated_at); `entries.customer_id`/`supplier_id` FKs (SET NULL); shared `update_contact_balance` trigger; BEFORE DELETE triggers nulling `entries.contact_name`. |
| 005 | `005_payment_modes.sql` | Per-book `payment_modes` (auto balances, display_order); `entries.payment_mode_id` FK (SET NULL); `seed_default_payment_modes` trigger (Cash+Cheque) **— dropped in 012**; `update_payment_mode_balance` trigger. |
| 006 | `006_notifications_push_tokens.sql` | `notifications` (8-value `target_type` + `days_threshold`), `user_notifications` (per-user fan-out, is_read/read_at), `push_tokens` (Expo tokens, platform). RLS on all three. |
| 007 | `007_book_sharing.sql` | `book_shares` (screens JSONB, rights enum, status pending/accepted, UNIQUE(book_id,shared_with_id), no-self-share check) with owner+recipient RLS. `is_accepted_collaborator` helper, collaborator SELECT policies on books/entries, `books` REPLICA IDENTITY FULL, realtime publication. |
| 008 | `008_backfill_display_orders.sql` | Backfills `display_order` for pre-existing categories/customers/suppliers/payment_modes. Adds `get_user_data_bytes(p_user_id)` RPC. |
| 009 | `009_subscription_status.sql` | Adds `profiles.subscription_status` (free/active/cancelled/expired/past_due), `subscription_expires_at`, `subscription_cancel_at_period_end`. |
| 010 | `010_otp_codes.sql` | `otp_codes` table (email, code, expires_at, used) for the Gmail email-OTP flow. |
| 011 | `011_security_hardening.sql` | Security audit pass — see the **Security Hardening (011)** section below. Adds `profiles.is_active`; `protect_profile_columns` trigger; locks down `otp_codes` RLS (+ `attempts`); `book_shares` recipient anti-escalation trigger; rebuilds owner policies with `WITH CHECK` + book-ownership; tightens notifications/user_notifications policies. |
| 012 | `012_sync_model.sql` | **Client-authoritative shared-UUID sync model.** Adds `updated_at` to entries/categories/payment_modes (+ triggers); nullable `deleted_at` to all six syncable tables; **drops** `trg_seed_payment_modes` + `seed_default_payment_modes()` (client now seeds Cash/Cheque with shared ids); `deleted_entries(id, book_id, user_id, deleted_at)` tombstone table + `record_deleted_entry` BEFORE DELETE trigger; `(user_id, updated_at)` delta indexes on all six syncable tables. Soft-delete = `deleted_at` for books/categories/customers/suppliers/payment_modes; entries are HARD-deleted (balance triggers reverse) + tombstoned. |
| 013 | `013_revenuecat.sql` | `processed_webhook_events` (event_id PK, event_type, app_user_id, processed_at) for webhook idempotency. RLS deny-all (service-role only). |
| 014 | `014_admin_stats_rpc.sql` | `get_admin_user_stats()` security-definer RPC: one row per non-superadmin profile + computed book_count, entry_count, shared_books_count, data_bytes, storage_bytes — single round-trip replacing the old N+1. Counts exclude soft-deleted rows. |

**All migrations must be run in order** before the app works correctly.

---

## Database Schema

### `public.profiles` (1:1 with auth.users)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, FK → `auth.users(id)` ON DELETE CASCADE |
| `email` | text | NOT NULL |
| `full_name` | text | nullable |
| `phone` | text | nullable |
| `avatar_url` | text | nullable |
| `role` | text | NOT NULL, default `'user'`, CHECK IN (`'superadmin'`, `'user'`) |
| `currency` | text | NOT NULL, default `'PKR'` — preferred currency for new books |
| `is_dark_mode` | boolean | NOT NULL, default `false` |
| `subscription_tier` | text | NOT NULL, default `'free'`, CHECK IN (`'free'`,`'pro'`,`'business'`) |
| `subscription_started_at` | timestamptz | nullable |
| `subscription_billing_cycle` | text | NOT NULL, default `'monthly'`, CHECK IN (`'monthly'`,`'yearly'`) |
| `subscription_status` | text | NOT NULL, default `'free'`, CHECK IN (`'free'`,`'active'`,`'cancelled'`,`'expired'`,`'past_due'`) — **migration 009** |
| `subscription_expires_at` | timestamptz | nullable — **migration 009** |
| `subscription_cancel_at_period_end` | boolean | NOT NULL, default `false` — **migration 009** |
| `is_active` | boolean | NOT NULL, default `true` — **migration 011** |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` (auto-updated by trigger) |

**First-user rule:** The `handle_new_user` trigger fires on every `auth.users` INSERT. If 0 profiles exist → `role = 'superadmin'`; otherwise `role = 'user'`. Profile is auto-created; no manual insert needed.

**Privileged columns** (`role`, `is_active`, all `subscription_*`) are frozen by the `protect_profile_columns` trigger when `auth.uid()` is non-null (migration 011) — only the service-role backend / RevenueCat webhook can change them. The RevenueCat webhook is the sole writer of `subscription_*`.

---

### `public.books`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` (or client-supplied shared UUID) |
| `user_id` | uuid | FK → `auth.users(id)` ON DELETE CASCADE, NOT NULL |
| `name` | text | NOT NULL |
| `currency` | text | NOT NULL, default `'PKR'` |
| `net_balance` | numeric(14,2) | NOT NULL, default `0` — maintained by trigger |
| `show_customer` | boolean | NOT NULL, default **`true`** |
| `show_supplier` | boolean | NOT NULL, default **`true`** |
| `show_category` | boolean | NOT NULL, default **`true`** |
| `show_attachment` | boolean | NOT NULL, default **`true`** |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` (auto-updated by trigger) |
| `deleted_at` | timestamptz | nullable — soft-delete tombstone (**migration 012**) |

**`net_balance` is maintained automatically** by the `trg_update_book_balance` trigger on the `entries` table. Never compute it in application code — read it directly from the `books` row. `books` carries `REPLICA IDENTITY FULL` (migration 007) so Realtime UPDATE events include full rows.

---

### `public.customers` (one table per book)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` (or client-supplied shared UUID) |
| `book_id` | uuid | FK → `public.books(id)` ON DELETE CASCADE, NOT NULL |
| `user_id` | uuid | FK → `auth.users(id)` ON DELETE CASCADE, NOT NULL |
| `name` | text | NOT NULL |
| `phone` | text | nullable |
| `email` | text | nullable |
| `address` | text | nullable |
| `total_in` / `total_out` / `net_balance` | numeric(14,2) | NOT NULL, default 0 — maintained by trigger |
| `display_order` | integer | NOT NULL, default 0 |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` (auto-updated by trigger) |
| `deleted_at` | timestamptz | nullable — soft-delete (**migration 012**) |
| UNIQUE | `(book_id, name)` | |

**`total_in`, `total_out`, `net_balance` are maintained automatically** by the `trg_update_contact_balance` trigger on the `entries` table. Never compute them in application code.

### `public.suppliers` (same structure as customers)

Identical columns to `customers`, including balances, `display_order`, `updated_at`, `deleted_at`, and UNIQUE(book_id, name). Each book has its own customer and supplier lists.

---

### `public.categories` (one per book)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` (or client-supplied shared UUID) |
| `book_id` | uuid | FK → `public.books(id)` ON DELETE CASCADE, NOT NULL |
| `user_id` | uuid | FK → `auth.users(id)` ON DELETE CASCADE, NOT NULL |
| `name` | text | NOT NULL |
| `total_in` / `total_out` / `net_balance` | numeric(14,2) | NOT NULL, default 0 — maintained by trigger |
| `display_order` | integer | NOT NULL, default 0 |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` (auto-updated by trigger) — **migration 012** |
| `deleted_at` | timestamptz | nullable — soft-delete (**migration 012**) |
| UNIQUE | `(book_id, name)` | No duplicate category names within a book |

**Balances maintained automatically** by the `trg_update_category_balance` trigger on `entries`. Never compute in application code.

---

### `public.payment_modes` (one per book)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` (or client-supplied shared UUID) |
| `book_id` | uuid | FK → `public.books(id)` ON DELETE CASCADE, NOT NULL |
| `user_id` | uuid | FK → `auth.users(id)` ON DELETE CASCADE, NOT NULL |
| `name` | text | NOT NULL |
| `total_in` / `total_out` / `net_balance` | numeric(14,2) | NOT NULL, default 0 — maintained by trigger |
| `display_order` | integer | NOT NULL, default 0 |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` (auto-updated by trigger) — **migration 012** |
| `deleted_at` | timestamptz | nullable — soft-delete (**migration 012**) |
| UNIQUE | `(book_id, name)` | |

Cash + Cheque are no longer seeded by a DB trigger (dropped in migration 012). The client now seeds default modes locally and pushes them with their shared ids. Balances maintained by `trg_update_payment_mode_balance` on `entries`.

---

### `public.entries`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` (or client-supplied shared UUID) |
| `book_id` | uuid | FK → `public.books(id)` ON DELETE CASCADE, NOT NULL |
| `user_id` | uuid | FK → `auth.users(id)` ON DELETE CASCADE, NOT NULL |
| `type` | text | CHECK `type IN ('in', 'out')`, NOT NULL |
| `amount` | numeric(12,2) | NOT NULL |
| `remark` | text | nullable |
| `category` | text | nullable — name snapshot, preserved if category is deleted |
| `category_id` | uuid | FK → `public.categories(id)` ON DELETE SET NULL, nullable (migration 003) |
| `payment_mode` | text | default `'cash'` |
| `payment_mode_id` | uuid | FK → `public.payment_modes(id)` ON DELETE SET NULL, nullable (migration 005) |
| `contact_name` | text | nullable — cleared to NULL when the linked customer/supplier is deleted |
| `customer_id` | uuid | FK → `public.customers(id)` ON DELETE SET NULL, nullable (migration 004) |
| `supplier_id` | uuid | FK → `public.suppliers(id)` ON DELETE SET NULL, nullable (migration 004) |
| `attachment_url` | text | nullable |
| `attachment_path` | text | nullable — storage path for deletion |
| `attachment_provider` | text | default `'supabase'` — `'supabase'` or `'local'` |
| `entry_date` | date | NOT NULL, default `current_date` |
| `entry_time` | time | NOT NULL, default `current_time` |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` (auto-updated by trigger) — **migration 012** |
| `deleted_at` | timestamptz | nullable — present for schema uniformity, but **entries are HARD-deleted** (tombstoned in `deleted_entries`) |

**Note:** `entries.user_id` is redundant (derivable via `book_id → books.user_id`) but is kept for RLS policies, performance, and defence-in-depth on the backend.

---

### `public.book_shares`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `book_id` | uuid | FK → `public.books(id)` ON DELETE CASCADE, NOT NULL |
| `owner_id` | uuid | FK → `public.profiles(id)` ON DELETE CASCADE, NOT NULL |
| `shared_with_id` | uuid | FK → `public.profiles(id)` ON DELETE CASCADE, NOT NULL |
| `screens` | jsonb | NOT NULL, default `{"entries":true,"categories":false,"contacts":false,"payment_modes":false,"reports":false,"settings":false}` |
| `rights` | text | NOT NULL, default `'view'`, CHECK IN (`'view'`,`'view_create_edit'`,`'view_create_edit_delete'`) |
| `status` | text | NOT NULL, default `'pending'`, CHECK IN (`'pending'`, `'accepted'`) |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` |
| UNIQUE | `(book_id, shared_with_id)` | One share per book per recipient |
| CHECK | `owner_id <> shared_with_id` | Cannot share with yourself |

**Rights levels:** `view` = read-only; `view_create_edit` = add/edit entries; `view_create_edit_delete` = full access including delete.
**Screens JSONB** controls which book sections are visible to the recipient.
**Invitation flow:** `POST /shares` creates row with `status='pending'` — no access until recipient accepts. On accept: `status='accepted'`. On decline: **row is deleted** — invitation disappears from both screens; owner is notified via in-app notification. Access checks in `book_access.py` and `GET /books/shared` only consider `status='accepted'` rows.

---

### `public.notifications`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `title` | text | NOT NULL |
| `body` | text | NOT NULL |
| `target_type` | text | NOT NULL, default `'all'`, CHECK IN (`'all'`, `'new_users'`, `'plan_free'`, `'plan_pro_m'`, `'plan_pro_y'`, `'plan_biz_m'`, `'plan_biz_y'`, `'specific'`) |
| `days_threshold` | integer | nullable — used when `target_type = 'new_users'` |
| `created_by` | uuid | FK → `profiles(id)` ON DELETE SET NULL, nullable |
| `created_at` | timestamptz | default `now()` |

### `public.user_notifications`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `user_id` | uuid | FK → `profiles(id)` ON DELETE CASCADE, NOT NULL |
| `notification_id` | uuid | FK → `notifications(id)` ON DELETE CASCADE, NOT NULL |
| `is_read` | boolean | NOT NULL, default `false` |
| `read_at` | timestamptz | nullable |
| `created_at` | timestamptz | default `now()` |
| UNIQUE | `(user_id, notification_id)` | One row per user per notification |

**Fan-out rule:** When admin sends a notification, the backend inserts 1 row into `notifications` + 1 row into `user_notifications` per resolved-segment recipient (and best-effort Expo push). The backend handles fan-out — no DB triggers involved.

### `public.push_tokens`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `user_id` | uuid | FK → `profiles(id)` ON DELETE CASCADE, NOT NULL |
| `token` | text | NOT NULL |
| `platform` | text | CHECK IN (`'ios'`,`'android'`), nullable |
| `created_at` / `updated_at` | timestamptz | default `now()` |
| UNIQUE | `(user_id, token)` | |

### `public.otp_codes` (custom email-OTP login)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `email` | text | NOT NULL |
| `code` | text | NOT NULL — stored as a **SHA-256 hash** of `email:code`, never plaintext |
| `expires_at` | timestamptz | NOT NULL — 5-minute expiry |
| `used` | boolean | default `false` |
| `attempts` | integer | NOT NULL, default 0 — **migration 011** (brute-force cap = 5) |
| `created_at` | timestamptz | default `now()` |

RLS enabled with **no policies** (deny-all) + revoked from anon/authenticated (migration 011). Only the service-role backend reads/writes codes.

### `public.deleted_entries` (entry tombstones — **migration 012**)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK — holds the deleted entry's id |
| `book_id` | uuid | NOT NULL |
| `user_id` | uuid | NOT NULL |
| `deleted_at` | timestamptz | NOT NULL, default `now()` |

Populated by the `record_deleted_entry` BEFORE DELETE trigger on `entries`. RLS: SELECT where `auth.uid() = user_id`. The delta endpoint reads this to report hard-deleted entries to clients.

### `public.processed_webhook_events` (RevenueCat idempotency — **migration 013**)

| Column | Type | Constraints |
|---|---|---|
| `event_id` | text | PK |
| `event_type` | text | nullable |
| `app_user_id` | uuid | nullable |
| `processed_at` | timestamptz | NOT NULL, default `now()` |

RLS deny-all + revoked from anon/authenticated — service-role only. The webhook checks this table before applying an event to guarantee idempotency.

---

## Indexes

```sql
-- profiles
profiles_role_idx         on profiles(role)
profiles_is_active_idx    on profiles(is_active)
profiles_created_at_idx   on profiles(created_at desc)

-- books
books_user_created_idx    on books(user_id, created_at desc)

-- entries
entries_book_id_idx       on entries(book_id)
entries_user_id_idx       on entries(user_id)
entries_entry_date_idx    on entries(entry_date)
entries_book_date_idx     on entries(book_id, entry_date desc, entry_time desc)
entries_user_date_idx     on entries(user_id, entry_date desc)

-- delta indexes (migration 012) — one per syncable table
<table>_user_updated_idx  on <table>(user_id, updated_at)   -- books, entries, categories, customers, suppliers, payment_modes
deleted_entries_user_deleted_idx on deleted_entries(user_id, deleted_at)
```

---

## Row Level Security (RLS)

RLS is enabled on every table. The backend uses the **service role key** (bypasses RLS), so backend code must always add `user_id` filters manually. RLS is the last-resort safety net for direct client calls and the basis for Supabase Realtime delivery. Migration 011 hardened the owner policies with explicit `WITH CHECK` + book-ownership.

### profiles
```sql
-- SELECT own; UPDATE own (privileged columns additionally frozen by protect_profile_columns trigger)
create policy "Users read own profile"   on public.profiles for select to authenticated using (auth.uid() = id);
create policy "Users update own profile"  on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
```

### books & entries (and categories / customers / suppliers / payment_modes)
```sql
-- migration 011: owner FOR ALL with explicit WITH CHECK
create policy "Users own their books" on public.books
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- migration 011: child tables add a book-ownership check so a user can't insert
-- a row carrying their own user_id but pointing at someone else's book_id
create policy "Users own their entries" on public.entries
  for all to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.books b WHERE b.id = entries.book_id AND b.user_id = auth.uid()));
-- categories / customers / suppliers / payment_modes follow the same pattern

-- migration 007: accepted collaborators can SELECT shared books + their entries (for Realtime)
create policy "collaborators can view books" on public.books
  for select using (auth.uid() = user_id OR public.is_accepted_collaborator(books.id, auth.uid()));
create policy "collaborators can view entries" on public.entries
  for select using (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.book_shares bs
    WHERE bs.book_id = entries.book_id AND bs.shared_with_id = auth.uid() AND bs.status = 'accepted'));
```

### Other tables
- **book_shares:** owner FOR ALL (`auth.uid()=owner_id`); recipient SELECT + UPDATE (`auth.uid()=shared_with_id`). The recipient UPDATE is further constrained by the `guard_recipient_share_update` trigger (status-only changes).
- **notifications:** SELECT only for rows actually delivered to the caller (EXISTS in `user_notifications`) — migration 011 replaced the old `using(true)`.
- **user_notifications:** SELECT own; UPDATE own with `WITH CHECK` (can't reassign to another user).
- **push_tokens:** FOR ALL own (`auth.uid()=user_id`).
- **deleted_entries:** SELECT own; written only by the security-definer trigger.
- **otp_codes / processed_webhook_events:** RLS deny-all (no policies) + revoked from anon/authenticated — service-role only.

---

## Triggers

| Trigger | Table | Event | Purpose |
|---|---|---|---|
| `on_auth_user_created` | `auth.users` | AFTER INSERT | Auto-create profile; first user = superadmin |
| `profiles_updated_at` | `profiles` | BEFORE UPDATE | Maintain `updated_at` |
| `books_updated_at` | `books` | BEFORE UPDATE | Maintain `updated_at` |
| `trg_update_book_balance` | `entries` | AFTER INSERT/UPDATE/DELETE | Maintain `books.net_balance` |
| `customers_updated_at` | `customers` | BEFORE UPDATE | Maintain `updated_at` |
| `suppliers_updated_at` | `suppliers` | BEFORE UPDATE | Maintain `updated_at` |
| `trg_update_contact_balance` | `entries` | AFTER INSERT/UPDATE/DELETE | Maintain `customers` and `suppliers` `total_in/out/net_balance` |
| `customers_clear_contact_name` | `customers` | BEFORE DELETE | Set `entries.contact_name = NULL` for linked entries |
| `suppliers_clear_contact_name` | `suppliers` | BEFORE DELETE | Set `entries.contact_name = NULL` for linked entries |
| `trg_update_category_balance` | `entries` | AFTER INSERT/UPDATE/DELETE | Maintain `categories.total_in/out/net_balance` |
| `categories_clear_category` | `categories` | BEFORE DELETE | Null `entries.category` text snapshot for the deleted category |
| `trg_update_payment_mode_balance` | `entries` | AFTER INSERT/UPDATE/DELETE | Maintain `payment_modes.total_in/out/net_balance` |
| `book_shares_updated_at` | `book_shares` | BEFORE UPDATE | Maintain `updated_at` |
| `trg_protect_profile_columns` | `profiles` | BEFORE UPDATE | **011** — freeze `role`/`is_active`/`subscription_*` when `auth.uid()` is non-null |
| `trg_guard_recipient_share_update` | `book_shares` | BEFORE UPDATE | **011** — recipient may change only `status`, not rights/screens/ids |
| `entries_updated_at` | `entries` | BEFORE UPDATE | Maintain `updated_at` (migration 012) |
| `categories_updated_at` | `categories` | BEFORE UPDATE | Maintain `updated_at` (migration 012) |
| `payment_modes_updated_at` | `payment_modes` | BEFORE UPDATE | Maintain `updated_at` (migration 012) |
| `trg_record_deleted_entry` | `entries` | BEFORE DELETE | Insert tombstone into `deleted_entries` for the delta endpoint (migration 012) |
| ~~`trg_seed_payment_modes`~~ | ~~`books`~~ | — | **Dropped in migration 012** — the client now seeds Cash/Cheque locally with shared ids |

### Sync columns (migration 012)
- `entries`, `categories`, `payment_modes` gained `updated_at timestamptz` (books/customers/suppliers already had it).
- All six syncable tables (books, entries, categories, customers, suppliers, payment_modes) gained nullable `deleted_at timestamptz` for soft-delete tombstones (entries are still hard-deleted; their deletions are tracked in `deleted_entries`).
- New table `public.deleted_entries(id uuid pk, book_id uuid, user_id uuid, deleted_at timestamptz)` — populated by the BEFORE DELETE trigger on entries; RLS allows `auth.uid() = user_id` SELECT.
- Delta indexes `<table>_user_updated_idx` on `(user_id, updated_at)` for fast "changes since" queries.
- **Client-supplied ids:** create endpoints accept an optional `id` so the client UUID becomes the SHARED primary key in both SQLite and Postgres. `gen_random_uuid()` still applies when no id is sent.

### Balance trigger logic (`update_book_balance`)
- **INSERT:** `net_balance += amount` if `type='in'`, `-= amount` if `type='out'`
- **DELETE:** reverse of INSERT
- **UPDATE:** reverse old entry, apply new entry (handles type change and amount change atomically)

---

## PostgreSQL Functions (called via `supabase.rpc()`)

| Function | Args | Returns | Use |
|---|---|---|---|
| `get_books_with_summary(p_user_id)` | uuid | table(id, user_id, name, currency, net_balance, show_customer, show_supplier, show_category, show_attachment, created_at, updated_at, last_entry_at) | GET /books — single round-trip. The backend additionally filters out `deleted_at`-soft-deleted rows. |
| `get_book_summary(p_book_id, p_user_id)` | uuid, uuid | table(total_in, total_out, net_balance) | GET /books/:id/summary |
| `get_user_data_bytes(p_user_id)` | uuid | bigint | Admin: DB row bytes via `pg_column_size()` across all 7 user tables (migration 008) |
| `get_user_storage_bytes(p_user_id)` | uuid | bigint | Admin: Storage file bytes from `storage.objects` (attachments + avatars buckets) (migration 002) |
| `get_admin_user_stats()` | — | table: all profile columns + book_count, entry_count, shared_books_count, data_bytes, storage_bytes | Admin users list — one row per non-superadmin profile, single round-trip (migration 014). Counts exclude soft-deleted rows; `shared_books_count` = accepted shares owned by the user. |
| `is_accepted_collaborator(p_book_id, p_user_id)` | uuid, uuid | boolean | Used in books RLS to avoid nested-RLS in Realtime (migration 007) |

`get_books_with_summary` computes `last_entry_at` by joining `entries` and taking `MAX(entry_date || 'T' || entry_time)` per book, ordered by `books.created_at DESC`.

All of the above are `security definer` (except `is_accepted_collaborator` is also definer) — they run with the privileges of the function owner.

---

## Security Hardening (migration 011)

A dedicated security-audit migration. Each item:

1. **`profiles.is_active`** — added (boolean, default true) + `profiles_is_active_idx`. Source of truth for admin deactivation; enforced server-side in `get_current_user` (deactivated → 401).
2. **`protect_profile_columns` trigger (BEFORE UPDATE on profiles).** When `auth.uid()` is non-null (i.e. a client call, not the service role), it pins `role`, `is_active`, and all six `subscription_*` columns to their OLD values. End-users may still edit `full_name`, `phone`, `avatar_url`, `currency`, `is_dark_mode`. The service-role backend and the RevenueCat webhook (no `sub` claim → `auth.uid()` NULL) remain the only writers of privileged columns.
3. **`otp_codes` lockdown.** RLS enabled with **no policies** (deny-all) + `revoke all ... from anon, authenticated`. Adds `attempts integer` for the verify-otp brute-force cap. Only the service-role backend touches codes.
4. **`guard_recipient_share_update` trigger (BEFORE UPDATE on book_shares).** For the recipient only (`auth.uid() = shared_with_id` and not the owner): any change to `rights`/`screens`/`owner_id`/`book_id`/`shared_with_id` raises an exception, and `status` must stay in (pending, accepted). Prevents a recipient from escalating their own access.
5. **`WITH CHECK` + book-ownership on owner policies.** `books`/`entries`/`categories`/`customers`/`suppliers`/`payment_modes` owner policies were recreated with explicit `WITH CHECK`. Child tables additionally require the referenced `book_id` to belong to the caller — closing the hole where a user could insert a child row with their own `user_id` but a victim's `book_id` (which would corrupt the victim's balances via triggers).
6. **`notifications` SELECT fix.** The old `using(true)` policy (any authenticated user could read every notification) was dropped; replaced with a policy that only returns notifications actually delivered to the caller (EXISTS in `user_notifications`).
7. **`user_notifications` UPDATE `WITH CHECK`** added so a row can't be reassigned to a different `user_id`.

Migration 013 (`processed_webhook_events`) is similarly locked down (RLS deny-all, service-role only).

---

## Auth Setup

### Google OAuth
1. Go to **Authentication → Providers → Google** in Supabase dashboard
2. Enable Google provider; paste Google Client ID and Secret from Google Cloud Console
3. Set Authorized Redirect URI in Google Cloud: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Add mobile deep-link: `cashbook://auth/callback` to allowed redirect URLs in Supabase

### Email OTP (custom, Gmail SMTP)
- Implemented by the backend `auth` router (`POST /api/v1/auth/send-otp` + `/verify-otp`), NOT Supabase's built-in magic link.
- Codes are crypto-random 6-digit (`secrets.randbelow`), stored **SHA-256 hashed** in `otp_codes` (never plaintext), 5-minute expiry, rate-limited (max 3 sends / email / 10 min), and attempt-capped (5 wrong tries burns the code).
- Verification upserts the Supabase auth user and exchanges a magic-link token for an access/refresh session.
- If `GMAIL_SMTP_USER` is empty (local dev), both endpoints return 503 and the frontend falls back to Supabase native OTP.

### JWT
- Validated with **PyJWT** on the backend. HS256 via `SUPABASE_JWT_SECRET`; ES256/RS256 via the Supabase JWKS endpoint (cached `PyJWKClient`).
- Secret: **Project Settings → API → JWT Secret** (copy to backend `.env` as `SUPABASE_JWT_SECRET`)
- Backend decodes statelessly; `verify_aud = false`.
- Token `sub` claim = `auth.users.id` = `profiles.id` = `books.user_id`
- `get_current_user` additionally checks `profiles.is_active` — a deactivated account is rejected with 401.

### Session persistence (mobile)
- Stored in **Expo SecureStore** (native) or **localStorage** (web)
- `autoRefreshToken: true`, `persistSession: true`
- Root `_layout.jsx` calls `supabase.auth.getSession()` on app start to restore session

---

## Storage

### Bucket: `attachments`
- **Visibility:** private
- **Path pattern:** `{user_id}/{entry_id_or_storage_id}/attachment.{ext}`
- URLs are **signed** (7-day expiry), generated by the backend. Max upload 6 MB; types JPEG/PNG/WebP/HEIC/PDF
- Free/offline users store attachments on the local filesystem instead (see frontend `storage.js`)

### Bucket: `avatars`
- **Visibility:** public — URLs are permanent and never expire
- **Path pattern:** `{user_id}/profile.{ext}` — one file per user, upserted on every upload
- Created by `005_avatars_bucket.sql`; also auto-created by the backend on first upload
- Public URL format: `https://<project>.supabase.co/storage/v1/object/public/avatars/{user_id}/profile.{ext}`
- **URL is written to `profiles.avatar_url`** on every successful upload (done inside `POST /api/v1/upload/avatar`)

### Storage policies
```sql
-- attachments (private)
create policy "Users upload own attachments" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users read own attachments" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

-- avatars (public)
create policy "avatars_auth_write" on storage.objects
  for all to authenticated
  using  (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_public_read" on storage.objects
  for select to public
  using (bucket_id = 'avatars');
```

---

## Admin User Stats — How They're Computed

The `GET /api/v1/admin/users` endpoint reads the `get_admin_user_stats()` RPC (migration 014) — a single round-trip that returns every non-superadmin profile with computed stats. (A per-user Python fallback exists if the RPC isn't defined.)

| Stat | Source (within `get_admin_user_stats`) |
|---|---|
| `book_count` | count of non-soft-deleted books for the user |
| `entry_count` | count of entries for the user |
| `shared_books_count` | accepted `book_shares` where `owner_id = user.id` |
| `storage_mb` | (`data_bytes` + `storage_bytes`) / 1MB |

`data_bytes` = DB row bytes across all 7 user tables (entries, books, categories, profiles, payment_modes, customers, suppliers); `storage_bytes` = real file sizes from Supabase Storage (attachments + avatars buckets). The RPC inlines the same logic as `get_user_data_bytes` / `get_user_storage_bytes`.

---

## Setup Checklist (new project)

- [ ] Create project at supabase.com
- [ ] Run migrations `001` → `014` in order in the SQL Editor (buckets are created by `002`)
- [ ] Enable Google OAuth (Authentication → Providers → Google)
  - [ ] Add Google Client ID and Secret
  - [ ] Set redirect URL: `https://<ref>.supabase.co/auth/v1/callback`
  - [ ] Add mobile redirect: `cashbook://auth/callback` to allowed URLs
- [ ] Configure the RevenueCat webhook to `POST /api/v1/webhooks/revenuecat` with the `REVENUECAT_WEBHOOK_AUTH` secret in its Authorization header
- [ ] Copy values to env files:
  - **Frontend `.env`:** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`
  - **Backend `.env`:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`, `REVENUECAT_WEBHOOK_AUTH`, `GMAIL_SMTP_*` (for production OTP)

---

## Adding a New Migration

1. Create: `supabase/migrations/00N_description.sql`
2. Run it in Supabase SQL Editor
3. Update the schema table(s) and any new functions/triggers in this file
4. Document new indexes

---

## When to Update This File

- New migration SQL file added or run
- New table, column, index, or trigger added
- RLS policies created, modified, or dropped
- New Storage bucket or policy created
- Auth provider configuration changes
- New PostgreSQL function added or changed
- Stats computation method changes in admin router
