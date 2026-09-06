# CLAUDE.md — Backend (cashbook/backend)

> **Auto-update rule:** Whenever any file inside `backend/` is edited (router, model, auth, config, utils), re-read that file and update the matching section in this file before finishing the task.

---

## Folder Structure

```
backend/
├── app/
│   ├── main.py               # FastAPI app instance, CORS, router registration
│   ├── config.py             # Pydantic BaseSettings — reads from .env
│   ├── auth/
│   │   └── jwt.py            # Supabase JWT validation, get_current_user dependency
│   ├── routers/
│   │   ├── auth.py           # POST /api/v1/auth/send-otp + /verify-otp (production Gmail SMTP; 503 → dev fallback)
│   │   ├── profile.py        # GET/PUT /api/v1/profile + GET /api/v1/profile/search
│   │   ├── books.py          # GET/POST/PUT/DELETE /api/v1/books + GET /api/v1/books/shared
│   │   ├── sharing.py        # GET/POST/PATCH/DELETE /api/v1/books/{id}/shares + DELETE /leave
│   │   ├── entries.py        # GET/POST/PUT/DELETE /api/v1/books/{id}/entries + summary
│   │   ├── contacts.py       # GET/POST/PUT/DELETE /api/v1/books/{id}/customers + /suppliers
│   │   ├── categories.py     # GET/POST/PUT/DELETE /api/v1/books/{id}/categories + /{id}/entries
│   │   ├── admin.py          # GET/PATCH /api/v1/admin/* (superadmin only)
│   │   ├── reports.py        # POST /api/v1/books/{id}/report/pdf + /excel (stateless — renders client-supplied entries, no DB read)
│   │   └── upload.py         # POST /api/v1/upload/attachment
│   ├── models/
│   │   ├── profile.py        # ProfileResponse, ProfileUpdate, UserWithStats
│   │   ├── book.py           # BookCreate, BookUpdate, BookResponse
│   │   ├── entry.py          # EntryCreate, EntryUpdate, EntryResponse, BookSummary
│   │   ├── contact.py        # ContactCreate, ContactUpdate, ContactResponse, ContactWithBalance
│   │   ├── category.py       # CategoryCreate, CategoryUpdate, CategoryResponse
│   │   └── report.py         # ReportEntry, ReportFilters, ReportRequest — request body for reports.py
│   ├── db/
│   │   └── supabase.py       # Supabase service client singleton
│   └── utils/
│       ├── pdf.py            # generate_pdf(...) → bytes
│       ├── excel.py          # generate_excel(...) → bytes
│       ├── book_access.py    # get_book_owner_id / get_book_access / require_rights
│       └── rate_limit.py     # InMemoryRateLimiter — per-process, per-key sliding window (used by reports.py)
├── requirements.txt
├── Procfile                  # web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
├── .env                      # NEVER commit
└── .env.example
```

---

## Tech Stack

| Concern | Library |
|---|---|
| Framework | FastAPI 0.111 |
| Server | Uvicorn (ASGI) |
| Database client | supabase-py 2.4 (service role — bypasses RLS) |
| JWT validation | python-jose[cryptography] (HS256, no aud check) |
| PDF export | ReportLab 4.1 |
| Excel export | openpyxl 3.1 |
| Config | pydantic-settings |
| HTTP client | httpx |

---

## Environment Variables

```
SUPABASE_URL=          # Project URL (https://xxx.supabase.co)
SUPABASE_SERVICE_KEY=  # service_role key (NOT the anon key)
SUPABASE_JWT_SECRET=   # JWT secret from Project Settings → API
ALLOWED_ORIGINS=       # Optional: comma-separated CORS origins, e.g. "https://app.example.com"
                       # Defaults to "*" (allow all) when not set — fine for mobile-only apps

# Gmail SMTP — required for production magic-link emails (leave empty in local dev)
GMAIL_SMTP_USER=       # farhan.butt2023@gmail.com
GMAIL_SMTP_PASSWORD=   # 16-char App Password (NOT account password)
GMAIL_FROM_NAME=       # Ultimate CashBook
GMAIL_FROM_ADDRESS=    # info@ultimatecashbook.com
```

**Never use the anon key on the backend.** The service key bypasses RLS — always add `user_id` filters manually in every query (defence in depth).

---

## Auth Middleware (`app/auth/jwt.py`)

- Supports HS256 (secret-based) and ES256/RS256 (JWKS-based) Supabase tokens
- JWKS cache has a 1-hour TTL; on unknown `kid`, the cache is cleared and re-fetched once before failing
- All JWKS fetches use `httpx.AsyncClient` (non-blocking)

```python
async def get_current_user(authorization: str = Header(...)) -> str:
    token = authorization.removeprefix("Bearer ").strip()
    # HS256 path uses SUPABASE_JWT_SECRET; ES256/RS256 fetches JWKS asynchronously
    user_id = payload.get("sub")   # UUID of the authenticated user
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user_id
```

**Rule:** Every protected endpoint must declare `user_id: str = Depends(get_current_user)` and filter all DB queries by that `user_id`. Never trust a `user_id` from the request body.

**Shared-book rule:** Routers that handle book data (entries, categories, contacts, payment_modes, reports) must resolve the owner's user_id via `get_book_access(sb, book_id, user_id)` and use the returned `owner_id` for every DB query. Mutating endpoints must also call `require_rights(rights, required_level)` to enforce the collaborator's access level.

### Superadmin guard (`routers/admin.py`)

```python
async def require_superadmin(user_id: str = Depends(get_current_user)) -> str:
    sb = get_supabase()
    res = sb.table("profiles").select("role").eq("id", user_id).single().execute()
    if not res.data or res.data["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return user_id
```

Used as `admin_id: str = Depends(require_superadmin)` on every admin endpoint.

---

## API Endpoint Reference

All routes are prefixed `/api/v1`. All protected routes require `Authorization: Bearer <JWT>`.

### Auth (`routers/auth.py`) — prefix `/api/v1/auth`

No JWT auth required (these are the endpoints that issue the JWT).

| Method | Path | Description |
|---|---|---|
| POST | `/send-magic-link` | Upsert user in Supabase Auth, generate a magic link via Admin API (`generate-link`), and email it via Gmail SMTP. `redirectTo` = `ultimatecashbook://auth/callback`. Returns 503 when `GMAIL_SMTP_USER` is empty (dev fallback signal to frontend). |

**Dev/prod branching:** When `GMAIL_SMTP_USER` is not set, `send-magic-link` returns HTTP 503. The frontend catches this and falls back to `supabase.auth.signInWithOtp({ shouldCreateUser: true })` (Supabase native → Inbucket). Verification is always handled client-side: the user taps the link → deep-link opens the app → `supabase.auth.onAuthStateChange` fires `SIGNED_IN` automatically.

**No `otp_codes` table needed** — verification is delegated entirely to Supabase (magic-link token exchange happens inside Supabase's own auth flow).

---

### Profile (`routers/profile.py`) — prefix `/api/v1/profile`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `` | Get authenticated user's profile. Computes real `storage_mb` (RPC, fallback 0), `entry_count` (entries table), and `shared_books_count` (accepted book_shares where user is owner). | ✅ |
| PUT | `` | Update own profile (full_name, phone, avatar_url) | ✅ |
| PATCH | `/subscription` | Update subscription tier, status, billing cycle, expires_at, cancel_at_period_end. Backend calculates `expires_at` from `subscription_started_at + billing_cycle` if not provided; sets `cloud_data_delete_at` on lapse; clears it on resubscribe. | ✅ |
| DELETE | `` | Permanently delete the caller's account. Collects the caller's Supabase-hosted attachment paths + avatar path (via `storage.list()`), then deletes the `auth.users` row through the Admin API (`DELETE {SUPABASE_URL}/auth/v1/admin/users/{user_id}`, same direct-`httpx` pattern as `verify_otp` in `auth.py`) — this cascades via `ON DELETE CASCADE` through `profiles` → `books` → `entries`/`categories`/`customers`/`suppliers`/`payment_modes`, and through `profiles` → `book_shares`/`user_notifications`/`push_tokens`. Storage objects aren't part of the Postgres FK graph, so the collected attachment + avatar paths are removed from the `attachments`/`avatars` buckets afterward, same two-phase pattern as `delete_book()` in `books.py`. | ✅ |

---

### Books (`routers/books.py`) — prefix `/api/v1/books`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `` | List all books for current user (net_balance, last_entry_at, field_settings) | ✅ |
| POST | `` | Create a new book | ✅ |
| PUT | `/{book_id}` | Rename or update book currency | ✅ |
| DELETE | `/{book_id}` | Delete a book (cascades entries) | ✅ |
| PATCH | `/{book_id}/field-settings` | Save entry field visibility toggles for a book | ✅ |
| GET | `/shared` | List all books shared WITH the current user (recipient view) | ✅ |

### Sharing (`routers/sharing.py`) — prefix `/api/v1/books`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/{book_id}/shares` | List collaborators for a book (owner only) | ✅ |
| POST | `/{book_id}/shares` | Send invitation — `{ email, screens, rights }` → status `pending` | ✅ |
| PATCH | `/{book_id}/shares/{share_id}/respond` | Recipient accepts/rejects — `{ action: "accept"\|"reject" }` | ✅ |
| PATCH | `/{book_id}/shares/{share_id}` | Update rights/screens for an accepted collaborator | ✅ |
| DELETE | `/{book_id}/shares/{share_id}` | Remove a collaborator/invitation (owner only) | ✅ |
| DELETE | `/{book_id}/leave` | Recipient removes themselves from a shared book | ✅ |

**Rights levels:** `view` | `view_create_edit` | `view_create_edit_delete`
**Screens JSONB keys:** `entries`, `categories`, `contacts`, `payment_modes`, `reports`, `settings`
**Invitation flow:** `POST /shares` creates a `pending` share (no access until accepted). Recipient calls `/respond` with `action=accept` → status becomes `accepted`; `action=reject` → **row is deleted** (invitation disappears from both screens). On either response a notification is created for the book owner via `notifications` + `user_notifications` tables.

### Invitations (`routers/invitations.py`) — prefix `/api/v1/invitations`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/received` | All invitations sent TO the current user (all statuses) | ✅ |
| GET | `/given` | All invitations sent BY the current user across all books (all statuses) | ✅ |

### Profile search — prefix `/api/v1/profile`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/search?q=email` | Search active non-superadmin users by email (max 10) | ✅ |

**GET /books** — tries `get_books_with_summary` RPC first (single round-trip, includes pre-computed `net_balance`, `last_entry_at`, and `field_settings`). Falls back to a direct table query if the RPC is not yet defined (migration 002 not run).

**POST /books** — returns the new book immediately; `net_balance` defaults to 0 (trigger fires on first entry).

**PATCH /books/:id/field-settings body:** `{ "showCustomer": bool, "showSupplier": bool, "showCategory": bool, "showAttachment": bool }` — updates the book's 4 individual boolean columns (`show_customer`, `show_supplier`, `show_category`, `show_attachment`).

---

### Entries (`routers/entries.py`) — prefix `/api/v1/books`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/{book_id}/entries` | List entries (optional: date_from, date_to, type filters); regenerates permanent public URLs from `attachment_path` via `get_public_url()` for every entry that has an attachment so `<Image>` loads without auth headers | ✅ |
| POST | `/{book_id}/entries` | Create an entry | ✅ |
| PUT | `/{book_id}/entries/{entry_id}` | Update an entry | ✅ |
| DELETE | `/{book_id}/entries/{entry_id}` | Delete an entry | ✅ |
| GET | `/{book_id}/summary` | Get balance summary (via DB function) | ✅ |

Entry endpoints use `get_book_owner_id(sb, book_id, user_id)` (reads) or `get_book_access(sb, book_id, user_id)` + `require_rights()` (writes/deletes) — not a standalone `_verify_book` helper.

**POST /entries body:**
```json
{
  "type": "in",
  "amount": 5000.00,
  "remark": "optional note",
  "category": "optional",
  "payment_mode": "cash",
  "contact_name": "optional",
  "entry_date": "YYYY-MM-DD",
  "entry_time": "HH:MM"
}
```

**GET /summary response:**
```json
{ "total_in": 10000.0, "total_out": 4500.0, "net_balance": 5500.0 }
```

**Balance rule:** `books.net_balance` is maintained by a DB trigger — never recompute in Python. The summary endpoint uses the `get_book_summary()` PostgreSQL function with a direct-query fallback.

---

### Admin (`routers/admin.py`) — prefix `/api/v1/admin`

All endpoints require `require_superadmin` dependency (403 if not superadmin).

| Method | Path | Description |
|---|---|---|
| GET | `/users` | All non-superadmin profiles with computed stats (book_count, entry_count, storage_mb, shared_books_count) |
| GET | `/users/{user_id}/books` | Any user's books (with net_balance and last_entry_at) |
| POST | `/notifications` | Create notification + fan-out to target users |
| GET | `/notifications` | All notifications sent by this admin (with recipient_count) |
| POST | `/cleanup-expired-cloud-data` | Delete cloud books for users whose `cloud_data_delete_at` has passed; called by external cron |

**GET /users** — N+1 pattern: one extra query per user for book count and entry count, plus two RPC calls (`get_user_data_bytes`, `get_user_storage_bytes`) for real storage. Each RPC has a try/except fallback to 0 if migration 013 hasn't run. Acceptable for admin dashboards at current scale.

**GET /users/:id/books** — tries `get_books_with_summary` RPC first, falls back to direct table query. Same fallback pattern as `/books`.

**POST /admin/notifications body:**
```json
{
  "title": "string",
  "body": "string",
  "target_type": "all",
  "user_ids": ["uuid", "..."],
  "days_threshold": 30
}
```
`target_type` supported values:
- `'all'` — all non-superadmin users (admin also receives a copy)
- `'new_users'` — users created within the last `days_threshold` days (default 30); admin receives a copy
- `'plan_free'` — free-tier users
- `'plan_pro_m'` — Pro monthly subscribers
- `'plan_pro_y'` — Pro yearly subscribers
- `'plan_biz_m'` — Business monthly subscribers
- `'plan_biz_y'` — Business yearly subscribers
- `'specific'` — user_ids list required; all supplied IDs must be real non-superadmin profiles (422 otherwise)

Superadmin is included only for `'all'` and `'new_users'`; plan-based and `'specific'` targets do not auto-append admin.
Returns `NotificationResponse` with `recipient_count`. Push notifications sent via Expo Push API (batched, fire-and-forget).

---

### Notifications (`routers/notifications.py`) — prefix `/api/v1/notifications`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `` | User's notification inbox; `?unread=true` filters to unread only | ✅ |
| POST | `/bulk-delete` | Delete multiple notifications `{ ids: [...] }` | ✅ |
| POST | `/bulk-read` | Mark multiple notifications as read `{ ids: [...] }` | ✅ |
| PATCH | `/read-all` | Mark every unread notification as read | ✅ |
| DELETE | `/{id}` | Permanently delete one notification | ✅ |
| PATCH | `/{id}/read` | Mark one notification as read | ✅ |

---

### Reports (`routers/reports.py`) — prefix `/api/v1/books`

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/{book_id}/report/pdf` | Render a PDF report from client-supplied entries | ✅ |
| POST | `/{book_id}/report/excel` | Render an Excel report from client-supplied entries | ✅ |

**Stateless renderer — no DB query.** These endpoints do **not** read `books`/`entries` from Supabase at all; `book_id` in the URL is unused (kept only for REST-path consistency with the rest of the book-scoped API). The request body (`ReportRequest` in `models/report.py`: `book_name`, `currency`, `date_from`, `date_to`, `filters`, `entries: List[ReportEntry]`) supplies everything needed — the router just recomputes `total_in`/`total_out`/`net_balance` from `entries` and calls `generate_pdf()`/`generate_excel()`. `get_current_user` is still required (auth only — there's no DB-side book to check ownership against, since a free-tier user's own book may exist only in local SQLite).

**Abuse hardening (no DB-backed ownership check is possible here, so the limits live in the request shape and call frequency instead):**
- `ReportRequest`/`ReportEntry`/`ReportFilters` fields all carry `max_length` caps (`models/report.py`) — `entries` is capped at `MAX_REPORT_ENTRIES` (5000) and every string field (book_name, currency, remark, category, contact_name, payment_mode, filter values, dates) has a hard length limit. A request over any of these caps is rejected by Pydantic with a 422 before any PDF/Excel rendering starts.
- `POST /{book_id}/report/pdf` and `/excel` are both rate-limited per user via `InMemoryRateLimiter` (`utils/rate_limit.py`) — 10 calls per 60s per `user_id`, checked first thing in each handler; over the limit returns `429`. This is in-process only (resets on restart, not shared across multiple server instances) — enough to blunt a single client hammering the endpoint, not a substitute for a distributed limiter if the service is ever scaled to multiple dynos.

**Why:** the previous implementation looked the book and its entries up in the cloud DB, which 404'd for any of a free-tier user's own books — those live in local SQLite only (`shouldBackupToCloud()` always returns `false`, and `cloud_sync` is a `'pro'`-tier feature per `frontend/src/lib/canAccess.js`) while `export_reports` is advertised as a `'free'`-tier feature. A free user's own (never-synced) book could never generate a report. The frontend (`ReportsScreen.jsx`) already has the correct entries in hand — loaded via `apiGetEntries()` from `lib/dataSource.js`, which transparently resolves local SQLite for own books or the cloud API for shared books — so it now POSTs that already-loaded, already-filtered data directly instead of asking the backend to re-fetch it. This works uniformly for own (local) and shared (cloud) books.

**`contact_type` still labels the report correctly.** The frontend applies all filters (date, type, contact, category, payment mode) client-side before sending `entries`, so the backend no longer filters anything — `filters` in the request body is display-only (drives the "Applied Filters" section of the rendered document; `contact_type` picks the "Customer"/"Supplier"/"Contact" label).

**Report generation sanitizes all user-controlled strings before rendering** (`utils/pdf.py`, `utils/excel.py`) — book name, currency, and every filter display value (category/contact_name/payment_mode/entry_type), not just entry fields:
- **PDF (`generate_pdf`)** — `_p()` XML-escapes every string before wrapping it in a ReportLab `Paragraph` (`xml.sax.saxutils.escape`); an unescaped `<`/`>`/`&` in a book name, currency symbol, or filter value used to raise an uncaught ReportLab parse `ValueError` (crashes the whole PDF export). Filter *display* values are also clipped to 120 chars (`_clip()` in `_build_filter_items()`) — unlike entry table cells (already truncated at `[:32]`/`[:14]`), filter values were unbounded and a long one (~4–8K+ chars, trivially passed via the `filters.category`/`filters.contact_name`/`filters.payment_mode` request body fields — unvalidated `str` fields on `ReportFilters`) made the single-row filter table taller than a page, raising an uncaught `reportlab.platypus.doctemplate.LayoutError`.
- **Excel (`generate_excel`)** — `_clean()` strips XML-illegal control characters (`\x00-\x08`, `\x0b`, `\x0c`, `\x0e-\x1f`) from every cell value (book name banner, filter rows, and the per-row `_d()` helper covering remark/category/contact_name/payment_mode) before assignment; openpyxl raises `IllegalCharacterError` on these otherwise. These characters are genuinely reachable through normal use — `models/entry.py` has no field-level sanitization on `remark`/`category`/`contact_name`, and Postgres only rejects literal `\x00`, so e.g. a `\x0b` typed into a remark survives the full round-trip from entry creation to report export.

---

### Upload (`routers/upload.py`) — prefix `/api/v1/upload`

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/attachment` | Upload entry photo to Supabase Storage | ✅ |
| POST | `/avatar` | Upload profile photo to Supabase Storage (`avatars` bucket) | ✅ |

- `POST /attachment` — `multipart/form-data` with optional `entry_id` (form field) + `file`; generates a UUID path if `entry_id` omitted; allowed types: JPEG, PNG, WebP, HEIC, PDF; max 5 MB; path `{user_id}/{storage_id}/attachment.{ext}`; returns permanent public URL via `get_public_url()` (not signed, never expires) + `{ attachment_url, path, provider: "supabase" }`. Only ever called from `syncLocalToCloud()` during a manual "Upload to Cloud" — never at photo-picker time, for any tier.
- `DELETE /attachment?path=...` — removes file from `attachments` bucket; verifies path starts with `{user_id}/` before deleting
- `POST /avatar` — `multipart/form-data` with `file` (image only); path `{user_id}/profile.{ext}`; creates/uses public `avatars` bucket; updates `profiles.avatar_url`; returns `{ "avatar_url": "<public-url>" }`
- Images + PDF: max 5 MB; image compression is done client-side before upload (see `storage.js`)

---

## Pydantic Models

### `models/profile.py`
```python
class ProfileResponse:    id, email, full_name, phone, age (int, optional), avatar_url, role, currency (default 'PKR'), is_dark_mode, subscription_tier (default 'free'), subscription_status (default 'free'), subscription_started_at?, subscription_billing_cycle (default 'monthly'), subscription_expires_at?, subscription_cancel_at_period_end (default False), cloud_data_delete_at? (set when subscription lapses; cleared on resubscribe), created_at, updated_at, storage_mb (float, default 0.0), entry_count (int, default 0), shared_books_count (int, default 0)
class ProfileUpdate:      full_name?, phone?, age (int, optional)?, avatar_url?, currency?
class UserWithStats:      ProfileResponse + book_count, entry_count, storage_mb, shared_books_count (all override base defaults)
class SubscriptionUpdate: subscription_tier: Literal["free","pro","business"], subscription_status: Literal["free","active","cancelled","expired","past_due"] = "active", billing_cycle: Literal["monthly","yearly"] = "monthly", expires_at?: datetime, cancel_at_period_end: bool = False
```

### `models/book.py`
```python
class BookCreate:         name, currency (default PKR)
class BookUpdate:         name?, currency?
class FieldSettingsBody:  showCustomer, showSupplier, showCategory, showAttachment (all bool, default False)
class BookResponse:       id, user_id, name, currency, net_balance (float, default 0), show_customer (bool), show_supplier (bool), show_category (bool), show_attachment (bool), created_at, updated_at?, last_entry_at?
```

### `models/entry.py`
```python
class EntryCreate:   type, amount, remark?, category?, payment_mode, contact_name?, customer_id?, supplier_id?, attachment_url?, attachment_path?, attachment_provider?, entry_date, entry_time
class EntryUpdate:   all EntryCreate fields optional
class EntryResponse: EntryCreate fields + id, book_id, user_id, created_at
                     Validator strips HH:MM:SS → HH:MM (Postgres time type)
class BookSummary:   total_in, total_out, net_balance
```

### `models/contact.py`
```python
class ContactCreate:      name, phone?, email?, address?
class ContactUpdate:      all fields optional
class ContactReorder:     ordered_ids: List[str]
class ContactResponse:    id, book_id, user_id, name, phone?, email?, address?, display_order (int, default 0), total_in, total_out, net_balance, created_at, updated_at
class ContactWithBalance: ContactResponse + balance (mirrors net_balance — kept for API backwards compat)
```

### `models/category.py`
```python
class CategoryCreate:   name (str, required)
class CategoryUpdate:   name? (str, optional)
class CategoryReorder:  ordered_ids: List[str]
class CategoryResponse: id, book_id, user_id, name, display_order (int, default 0), total_in, total_out, net_balance, created_at
```

### `models/report.py`
```python
class ReportEntry:   type (≤20), amount, remark? (≤500), category? (≤100), payment_mode? (≤50), contact_name? (≤100), entry_date? (≤20), entry_time? (≤20)
class ReportFilters: entry_type?, contact_name?, contact_type?, category?, payment_mode?  (all ≤120) — display-only, not applied server-side
class ReportRequest: book_name (≤200), currency (default 'PKR', ≤10), date_from? (≤20), date_to? (≤20), filters?: ReportFilters, entries: List[ReportEntry] = [] (max MAX_REPORT_ENTRIES = 5000)
```
Request body for `POST /api/v1/books/{id}/report/pdf` and `/excel` — see the Reports section above for why this is POST + client-supplied data rather than a server-side DB read. All `max_length` caps exist purely to bound how much work a single report request can trigger (see "Abuse hardening" in the Reports section).

### Categories (`routers/categories.py`) — prefix `/api/v1/books`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/{book_id}/categories` | List all categories (ordered by display_order, then created_at) | ✅ |
| POST | `/{book_id}/categories` | Create category (name required, unique per book) | ✅ |
| PUT | `/{book_id}/categories/{id}` | Rename category | ✅ |
| DELETE | `/{book_id}/categories/{id}` | Delete category (entries.category_id → NULL via FK) | ✅ |
| PATCH | `/{book_id}/categories/reorder` | Save drag-sorted order `{ ordered_ids: [uuid,...] }` | ✅ |
| GET | `/{book_id}/categories/{id}/entries` | Entries assigned to this category | ✅ |

**Balance rule:** `total_in`, `total_out`, `net_balance` are maintained by `trg_update_category_balance` (DB trigger on `entries`). Read directly from the row — never recompute in Python.
**Uniqueness:** category names are case-insensitive unique per book (DB UNIQUE constraint + `ilike` pre-check in the router for a friendly 409 error).
**Sort order:** `display_order` column added by migration 035; backfilled from `created_at` order per book.

---

### Contacts endpoints (`routers/contacts.py`) — prefix `/api/v1/books`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/{book_id}/customers` | List customers (ordered by display_order, then name) | ✅ |
| POST | `/{book_id}/customers` | Create customer (name required) | ✅ |
| GET | `/{book_id}/customers/{id}` | Get customer with balance | ✅ |
| PUT | `/{book_id}/customers/{id}` | Update customer (not balance) | ✅ |
| DELETE | `/{book_id}/customers/{id}` | Delete customer (entries keep contact_name) | ✅ |
| GET | `/{book_id}/customers/{id}/entries` | Entries linked to this customer | ✅ |
| PATCH | `/{book_id}/customers/reorder` | Save drag-sorted order `{ ordered_ids: [uuid,...] }` | ✅ |
| GET | `/{book_id}/suppliers` | List suppliers (ordered by display_order, then name) | ✅ |
| POST | `/{book_id}/suppliers` | Create supplier | ✅ |
| GET | `/{book_id}/suppliers/{id}` | Get supplier with balance | ✅ |
| PUT | `/{book_id}/suppliers/{id}` | Update supplier | ✅ |
| DELETE | `/{book_id}/suppliers/{id}` | Delete supplier | ✅ |
| GET | `/{book_id}/suppliers/{id}/entries` | Entries linked to this supplier | ✅ |
| PATCH | `/{book_id}/suppliers/reorder` | Save drag-sorted order `{ ordered_ids: [uuid,...] }` | ✅ |

**Balance rule:** `total_in`, `total_out`, `net_balance` are stored columns maintained by `trg_update_contact_balance` (DB trigger on `entries`). Read them directly from the row — never recompute in Python. `balance` in `ContactWithBalance` mirrors `net_balance`.
**Sort order:** `display_order` column added by migration 036; backfilled from `created_at` order per book. Previously ordered alphabetically by name — reorder endpoint overrides that with user-set order.

---

## Database Query Patterns

**Always filter by user_id** (service key bypasses RLS):

```python
# ✅ Correct
sb.table("entries").select("*").eq("book_id", book_id).eq("user_id", user_id).execute()

# ❌ Wrong — missing user_id filter
sb.table("entries").select("*").eq("book_id", book_id).execute()
```

**Shared-book access pattern** (entries, categories, contacts, payment_modes):
```python
from app.utils.book_access import get_book_access, require_rights

# Read-only endpoint — any access level is fine
owner_id, rights = get_book_access(sb, book_id, user_id)

# Create / edit endpoint — requires view_create_edit or higher
owner_id, rights = get_book_access(sb, book_id, user_id)
require_rights(rights, "view_create_edit")

# Delete endpoint — requires view_create_edit_delete or owner
owner_id, rights = get_book_access(sb, book_id, user_id)
require_rights(rights, "view_create_edit_delete")
```

`get_book_owner_id` still exists for read-only endpoints that only need the `owner_id`. `reports.py` no longer calls into `book_access.py` at all — see the Reports section above.

**Use DB functions for aggregation:**
```python
# Books with balance and last_entry_at — single round-trip
sb.rpc("get_books_with_summary", {"p_user_id": user_id}).execute()

# Summary for a book
sb.rpc("get_book_summary", {"p_book_id": book_id, "p_user_id": user_id}).execute()
```

**Fallback pattern** (used in books.py and admin.py when RPC may not exist):
```python
try:
    result = sb.rpc("get_books_with_summary", {"p_user_id": uid}).execute()
    return result.data or []
except Exception:
    result = sb.table("books").select("*").eq("user_id", uid).order("created_at", desc=True).execute()
    return [{**b, "net_balance": b.get("net_balance", 0), "last_entry_at": None} for b in (result.data or [])]
```

---

## Main App Setup (`app/main.py`)

```python
app.include_router(profile.router, prefix="/api/v1/profile",  tags=["profile"])
app.include_router(books.router,   prefix="/api/v1/books",    tags=["books"])
app.include_router(entries.router, prefix="/api/v1/books",    tags=["entries"])
app.include_router(reports.router, prefix="/api/v1/books",    tags=["reports"])
app.include_router(upload.router,  prefix="/api/v1/upload",   tags=["upload"])
app.include_router(admin.router,    prefix="/api/v1/admin",    tags=["admin"])
app.include_router(contacts.router,    prefix="/api/v1/books",    tags=["contacts"])
app.include_router(categories.router,  prefix="/api/v1/books",    tags=["categories"])
```

**`GET /health`** — health check, `{"status": "ok"}`.

**`GET /account-deletion`** — public, unauthenticated HTML page (defined directly in `main.py`, not a router). Fulfills Google Play's User Data policy requirement for a web resource where account deletion can be requested without the app installed: explains the in-app path (Settings → Delete Account) and an email-request fallback to `settings.GMAIL_FROM_ADDRESS`. Kept in `main.py` rather than a router since it's a single static page, not an API endpoint.

**`GET /privacy-policy`** — public, unauthenticated HTML page (also in `main.py`). Fulfills Google Play Console's App Content and Data safety requirement for a live privacy-policy URL — the in-app `PrivacyPolicyScreen` alone doesn't satisfy this. `_PRIVACY_SECTIONS` mirrors `frontend/src/screens/PrivacyPolicyScreen.jsx`'s `SECTIONS` array **verbatim, including the exact `support@ultimatecashbook.com` contact address** (deliberately not `settings.GMAIL_FROM_ADDRESS`, which is a different mailbox) — when either changes, update both so the disclosed policy text matches word for word. `_render_policy_body()` converts each section's `\n\n`-separated, `• `-bulleted body text into `<p>`/`<ul>` HTML. Both pages share one CSS shell via `_page_shell()`/`_PAGE_STYLE`.

Both public pages are shared visually and share a support-contact inconsistency worth resolving: the privacy policy promises `support@ultimatecashbook.com`, while the account-deletion page and all transactional email (OTP, etc.) actually send from `settings.GMAIL_FROM_ADDRESS` (`info@ultimatecashbook.com`). Neither page invents a new address — this mismatch predates both pages and should be resolved by picking one real, monitored inbox.

---

## Dev Commands

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
# Copy .env.example → .env and fill values
uvicorn app.main:app --reload  # Dev server at http://localhost:8000
```

Swagger UI: `http://localhost:8000/docs`

---

## Deployment (Render)

- `Procfile`: `web: uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Set all env vars in Render dashboard (Environment → Environment Variables)
- Health check endpoint: `GET /health` → `{"status": "ok"}`

---

## When to Update This File

- New router/endpoint added or endpoint shape changes
- Pydantic model added or field modified
- New env variable required
- Auth middleware logic changes
- New DB function used or fallback pattern added
- Admin endpoints' stats computation method changes
