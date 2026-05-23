# CLAUDE.md — Supabase (cashbook/supabase)

> **Auto-update rule:** Whenever a migration SQL file is added or modified, or when Supabase config (auth, storage, RLS) changes, update the matching section in this file before finishing the task.

---

## Project Overview

Supabase provides three things for Ultimate CashBook:
1. **PostgreSQL database** — profiles, books, entries tables
2. **Auth** — Google OAuth + Email OTP + JWT issuance
3. **Storage** — entry photo attachments

---

## Migration Order

1. `supabase/migrations/001_init.sql` — books, entries tables, basic RLS
2. `supabase/migrations/002_profiles_and_roles.sql` — profiles, triggers, balance trigger, indexes, DB functions
3. `supabase/migrations/003_fix_last_entry_at.sql` — fix last_entry_at computation
4. `supabase/migrations/004_avatars_bucket.sql` (now `005_avatars_bucket.sql`) — create public `avatars` storage bucket + RLS policies
5. `supabase/migrations/006_add_currency_to_profiles.sql` — add `currency` column to profiles (default `'PKR'`)
6. `supabase/migrations/007_add_dark_mode_to_profiles.sql` — add `is_dark_mode` boolean to profiles
7. `supabase/migrations/008_contacts.sql` — `customers` and `suppliers` tables (with stored `total_in`/`total_out`/`net_balance`) + `customer_id`/`supplier_id` FK columns on entries; RLS; `trg_update_contact_balance` trigger keeps balances in sync automatically
8. `supabase/migrations/009_clear_contact_name_on_delete.sql` — `BEFORE DELETE` triggers on `customers` and `suppliers` that null out `entries.contact_name` for all linked entries when a contact is deleted (FK `ON DELETE SET NULL` handles `customer_id`/`supplier_id`; this covers the snapshot name field)
9. `supabase/migrations/010_categories.sql` — `categories` table per book (with stored `total_in`/`total_out`/`net_balance`) + `category_id` FK column on entries (ON DELETE SET NULL); UNIQUE(book_id, name); RLS; `trg_update_category_balance` trigger keeps balances in sync automatically
10. `supabase/migrations/012_payment_modes.sql` — `payment_modes` table per book; Cash + Cheque seeded on book creation; `entries.payment_mode_id` nullable FK
11. `supabase/migrations/013_storage_calc.sql` — `get_user_data_bytes()` and `get_user_storage_bytes()` security-definer functions for real admin storage stats
12. `supabase/migrations/014_attachment_metadata.sql` — attachment metadata columns on entries
13. `supabase/migrations/015_book_field_settings.sql` — `field_settings JSONB` column on `books` (superseded by 016)
14. `supabase/migrations/016_book_field_settings_normalized.sql` — replaces `field_settings` JSONB with 4 individual boolean columns (`show_customer`, `show_supplier`, `show_category`, `show_attachment`); migrates existing data; recreates `get_books_with_summary` RPC
15. `supabase/migrations/017_payment_mode_balances.sql` — `total_in`, `total_out`, `net_balance` columns on `payment_modes`; `trg_update_payment_mode_balance` trigger keeps them in sync; backfills existing data
16. `supabase/migrations/018_notifications.sql` — `notifications` and `user_notifications` tables; `target_type` ('all'|'specific') on notifications; RLS policies; indexes

17. `supabase/migrations/019_push_tokens.sql` — Expo push tokens table, unique(user_id, token), RLS
18. `supabase/migrations/020_book_sharing.sql` — `book_shares` table; owner shares a book with a recipient; configurable `screens` JSONB and `rights` level; unique(book_id, shared_with_id); two RLS policies (owner: ALL, recipient: SELECT)
19. `supabase/migrations/021_sharing_status.sql` — adds `status` column (`pending`|`accepted`) to `book_shares`; backfills existing rows to `accepted`; adds RLS UPDATE policy for recipients to respond to invitations. **Invitation flow:** accept → `status='accepted'`; decline → row is deleted (no rejected state stored)
20. `supabase/migrations/023_collaborator_entries_rls.sql` — SELECT policy on `entries` for accepted collaborators; required for Supabase Realtime events
21. `supabase/migrations/024_realtime_book_shares.sql` — adds `book_shares`, `entries`, and `books` tables to the `supabase_realtime` publication
22. `supabase/migrations/025_collaborator_books_rls.sql` — SELECT policy on `books` for accepted collaborators; required so Supabase Realtime delivers `books` UPDATE events (field-settings toggles) to collaborators in real time

**All migrations must be run in order** before the app works correctly. Run them in the Supabase SQL Editor.

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
| `is_active` | boolean | NOT NULL, default `true` |
| `currency` | text | NOT NULL, default `'PKR'` — user's preferred currency for new books |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` (auto-updated by trigger) |

**First-user rule:** The `handle_new_user` trigger fires on every `auth.users` INSERT. It counts existing profiles — if 0, it assigns `role = 'superadmin'`; otherwise `role = 'user'`. Profile is auto-created; no manual insert needed.

---

### `public.books`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `user_id` | uuid | FK → `auth.users(id)` ON DELETE CASCADE, NOT NULL |
| `name` | text | NOT NULL |
| `currency` | text | default `'PKR'` |
| `net_balance` | numeric(14,2) | NOT NULL, default `0` — maintained by trigger |
| `show_customer` | boolean | NOT NULL, default `false` |
| `show_supplier` | boolean | NOT NULL, default `false` |
| `show_category` | boolean | NOT NULL, default `false` |
| `show_attachment` | boolean | NOT NULL, default `false` |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` (auto-updated by trigger) |

**`net_balance` is maintained automatically** by the `trg_update_book_balance` trigger on the `entries` table. Never compute it in application code — read it directly from the `books` row.

---

### `public.customers` (one table per book)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `book_id` | uuid | FK → `public.books(id)` ON DELETE CASCADE, NOT NULL |
| `user_id` | uuid | FK → `auth.users(id)` ON DELETE CASCADE, NOT NULL |
| `name` | text | NOT NULL |
| `phone` | text | nullable |
| `email` | text | nullable |
| `address` | text | nullable |
| `total_in` | numeric(14,2) | NOT NULL, default 0 — maintained by trigger |
| `total_out` | numeric(14,2) | NOT NULL, default 0 — maintained by trigger |
| `net_balance` | numeric(14,2) | NOT NULL, default 0 — maintained by trigger |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` (auto-updated by trigger) |

**`total_in`, `total_out`, `net_balance` are maintained automatically** by the `trg_update_contact_balance` trigger on the `entries` table. Never compute them in application code — read directly from the row.

### `public.suppliers` (same structure as customers)

Identical columns to `customers`, including `total_in`, `total_out`, `net_balance`. Kept as a separate table by design — each book has its own customer and supplier lists.

---

### `public.categories` (one per book)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `book_id` | uuid | FK → `public.books(id)` ON DELETE CASCADE, NOT NULL |
| `user_id` | uuid | FK → `auth.users(id)` ON DELETE CASCADE, NOT NULL |
| `name` | text | NOT NULL |
| `total_in` | numeric(14,2) | NOT NULL, default 0 — maintained by trigger |
| `total_out` | numeric(14,2) | NOT NULL, default 0 — maintained by trigger |
| `net_balance` | numeric(14,2) | NOT NULL, default 0 — maintained by trigger |
| `created_at` | timestamptz | default `now()` |
| UNIQUE | `(book_id, name)` | No duplicate category names within a book |

**`total_in`, `total_out`, `net_balance` are maintained automatically** by the `trg_update_category_balance` trigger on the `entries` table. Never compute them in application code.

---

### `public.entries`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `book_id` | uuid | FK → `public.books(id)` ON DELETE CASCADE, NOT NULL |
| `user_id` | uuid | FK → `auth.users(id)` ON DELETE CASCADE, NOT NULL |
| `type` | text | CHECK `type IN ('in', 'out')`, NOT NULL |
| `amount` | numeric(12,2) | NOT NULL |
| `remark` | text | nullable |
| `category` | text | nullable — name snapshot, preserved if category is deleted |
| `category_id` | uuid | FK → `public.categories(id)` ON DELETE SET NULL, nullable |
| `payment_mode` | text | default `'cash'` |
| `contact_name` | text | nullable — cleared to NULL when the linked customer/supplier is deleted (migration 009) |
| `customer_id` | uuid | FK → `public.customers(id)` ON DELETE SET NULL, nullable |
| `supplier_id` | uuid | FK → `public.suppliers(id)` ON DELETE SET NULL, nullable |
| `attachment_url` | text | nullable |
| `entry_date` | date | NOT NULL, default `current_date` |
| `entry_time` | time | NOT NULL, default `current_time` |
| `created_at` | timestamptz | default `now()` |

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
| `target_type` | text | NOT NULL, default `'all'`, CHECK IN (`'all'`, `'specific'`) |
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

**Fan-out rule:** When admin sends a notification, the backend inserts 1 row into `notifications` + 1 row into `user_notifications` per recipient. The backend handles fan-out — there are no DB triggers involved.

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
```

---

## Row Level Security (RLS)

RLS is enabled on all three tables. The backend uses the **service role key** which bypasses RLS, so backend code must always add `user_id` filters manually. RLS is a last-resort safety net for any direct client calls.

### profiles
```sql
create policy "Users read own profile"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
```

### books & entries
```sql
create policy "Users own their books" on public.books
  for all using (auth.uid() = user_id);

-- migration 025: collaborators can SELECT books shared with them (required for Realtime)
create policy "collaborators can view books" on public.books
  for select using (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.book_shares bs
      WHERE bs.book_id = books.id AND bs.shared_with_id = auth.uid() AND bs.status = 'accepted'
    )
  );

create policy "Users own their entries" on public.entries
  for all using (auth.uid() = user_id);

-- migration 023: collaborators can SELECT entries of shared books (required for Realtime)
create policy "collaborators can view entries" on public.entries
  for select using (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.book_shares bs
      WHERE bs.book_id = entries.book_id AND bs.shared_with_id = auth.uid() AND bs.status = 'accepted'
    )
  );
```

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
| `trg_update_contact_balance` | `entries` | AFTER INSERT/UPDATE/DELETE | Maintain `customers.total_in/out/net_balance` and `suppliers.total_in/out/net_balance` |
| `customers_clear_contact_name` | `customers` | BEFORE DELETE | Set `entries.contact_name = NULL` for all entries linked to the deleted customer |
| `suppliers_clear_contact_name` | `suppliers` | BEFORE DELETE | Set `entries.contact_name = NULL` for all entries linked to the deleted supplier |
| `trg_update_category_balance` | `entries` | AFTER INSERT/UPDATE/DELETE | Maintain `categories.total_in/out/net_balance` |

### Balance trigger logic (`update_book_balance`)
- **INSERT:** `net_balance += amount` if `type='in'`, `-= amount` if `type='out'`
- **DELETE:** reverse of INSERT
- **UPDATE:** reverse old entry, apply new entry (handles type change and amount change atomically)

---

## PostgreSQL Functions (called via `supabase.rpc()`)

| Function | Args | Returns | Use |
|---|---|---|---|
| `get_books_with_summary(p_user_id)` | uuid | table(id, user_id, name, currency, net_balance, show_customer, show_supplier, show_category, show_attachment, created_at, updated_at, last_entry_at) | GET /books — single round-trip |
| `get_book_summary(p_book_id, p_user_id)` | uuid, uuid | table(total_in, total_out, net_balance) | GET /books/:id/summary |
| `get_user_data_bytes(p_user_id)` | uuid | bigint | Admin: actual DB row bytes via `pg_column_size()` across all 7 user tables |
| `get_user_storage_bytes(p_user_id)` | uuid | bigint | Admin: actual Storage file bytes from `storage.objects` (attachments + avatars buckets) |

`get_books_with_summary` computes `last_entry_at` by joining `entries` and taking `MAX(entry_date || 'T' || entry_time)` per book. The result is ordered by `books.created_at DESC`.

Both functions are `security definer` — they run with the privileges of the function owner, not the caller.

---

## Auth Setup

### Google OAuth
1. Go to **Authentication → Providers → Google** in Supabase dashboard
2. Enable Google provider; paste Google Client ID and Secret from Google Cloud Console
3. Set Authorized Redirect URI in Google Cloud: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Add mobile deep-link: `cashbook://auth/callback` to allowed redirect URLs in Supabase

### Email OTP (magic link)
- Enabled by default in Supabase → Authentication → Providers → Email
- No additional configuration needed

### JWT
- Algorithm: **HS256**
- Secret: **Project Settings → API → JWT Secret** (copy to backend `.env` as `SUPABASE_JWT_SECRET`)
- Backend decodes without hitting Supabase (stateless validation)
- Token `sub` claim = `auth.users.id` = `profiles.id` = `books.user_id`
- `verify_aud` = false (Supabase tokens don't use standard audience claim)

### Session persistence (mobile)
- Stored in **Expo SecureStore** (native) or **localStorage** (web)
- `autoRefreshToken: true`, `persistSession: true`
- Root `_layout.jsx` calls `supabase.auth.getSession()` on app start to restore session

---

## Storage

### Bucket: `attachments`
- **Visibility:** private
- **Path pattern:** `{user_id}/{entry_id}/attachment.{ext}`
- URLs are **signed** (1-hour expiry), generated by the backend

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

The `GET /api/v1/admin/users` endpoint computes stats per user in Python (N+1 pattern — one extra DB query per user):

| Stat | Source |
|---|---|
| `book_count` | `SELECT count(*) FROM books WHERE user_id = ?` |
| `entry_count` | `SELECT count(*) FROM entries WHERE user_id = ?` |
| `storage_mb` | `get_user_data_bytes(user_id)` + `get_user_storage_bytes(user_id)` converted to MB (migration 013) |

`storage_mb` reflects actual usage: DB row bytes across all 7 user tables (entries, books, categories, profiles, payment_modes, customers, suppliers) plus real file sizes from Supabase Storage (attachments + avatars buckets). Both RPC calls have try/except fallbacks — if migration 013 hasn't run, storage_mb returns 0.

---

## Setup Checklist (new project)

- [ ] Create project at supabase.com
- [ ] Run `001_init.sql` in SQL Editor
- [ ] Run `002_profiles_and_roles.sql` in SQL Editor
- [ ] Enable Google OAuth (Authentication → Providers → Google)
  - [ ] Add Google Client ID and Secret
  - [ ] Set redirect URL: `https://<ref>.supabase.co/auth/v1/callback`
  - [ ] Add mobile redirect: `cashbook://auth/callback` to allowed URLs
- [ ] Create Storage bucket named `attachments` (private)
  - [ ] Apply storage insert and select policies (see above)
- [ ] Copy values to env files:
  - **Frontend `.env`:** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`
  - **Backend `.env`:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`

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
