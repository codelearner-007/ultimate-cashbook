# CLAUDE.md — Backend (cashbook/backend)

> **Auto-update rule:** Whenever any file inside `backend/` is edited (router, model, auth, config, utils), re-read that file and update the matching section in this file before finishing the task.

---

## Folder Structure

```
backend/
├── app/
│   ├── main.py               # FastAPI app, CORS, 14 router registrations, exception handler, optional Sentry
│   ├── config.py             # Pydantic BaseSettings — reads from .env
│   ├── auth/
│   │   └── jwt.py            # PyJWT validation, get_current_user (enforces is_active)
│   ├── routers/
│   │   ├── auth.py           # POST /api/v1/auth/send-otp + /verify-otp (Gmail SMTP; hashed OTP; 503 → dev fallback)
│   │   ├── profile.py        # GET/PUT/DELETE /api/v1/profile, GET /search, PATCH /subscription (403 in prod)
│   │   ├── books.py          # GET/POST/PUT/DELETE /api/v1/books, /shared, /sync/changes (delta)
│   │   ├── sharing.py        # /api/v1/books/{id}/shares CRUD + /respond + /leave (402 gates)
│   │   ├── invitations.py    # GET /api/v1/invitations/received + /given
│   │   ├── entries.py        # GET/POST/PUT/DELETE /api/v1/books/{id}/entries + summary
│   │   ├── contacts.py       # /api/v1/books/{id}/customers + /suppliers CRUD + reorder + /entries
│   │   ├── categories.py     # /api/v1/books/{id}/categories CRUD + reorder + /{id}/entries
│   │   ├── payment_modes.py  # /api/v1/books/{id}/payment-modes CRUD + reorder + /entries
│   │   ├── notifications.py  # /api/v1/notifications inbox + push-token + bulk ops
│   │   ├── admin.py          # /api/v1/admin/* (superadmin only) incl /users/{id}/status
│   │   ├── reports.py        # GET /api/v1/books/{id}/report/pdf + /excel (402 export gate)
│   │   ├── upload.py         # POST /api/v1/upload/attachment + /avatar
│   │   └── webhooks.py       # POST /api/v1/webhooks/revenuecat (sole writer of subscription_*)
│   ├── models/
│   │   ├── profile.py        # ProfileResponse, ProfileUpdate, UserWithStats, StatusUpdate, SubscriptionUpdate
│   │   ├── book.py           # BookCreate, BookUpdate, FieldSettingsBody, BookResponse
│   │   ├── entry.py          # EntryCreate, EntryUpdate, EntryResponse, BookSummary
│   │   ├── contact.py        # ContactCreate, ContactUpdate, ContactReorder, ContactResponse, ContactWithBalance
│   │   ├── category.py       # CategoryCreate, CategoryUpdate, CategoryReorder, CategoryResponse
│   │   ├── payment_mode.py   # PaymentModeCreate, PaymentModeUpdate, PaymentModeReorder, PaymentModeResponse
│   │   └── sharing.py        # ScreensConfig, ShareCreate/Update/Respond, ShareResponse, *Invitation, notification.py
│   ├── db/
│   │   └── supabase.py       # Supabase service client singleton
│   └── utils/
│       ├── pdf.py            # generate_pdf(...) → bytes
│       ├── excel.py          # generate_excel(...) → bytes
│       ├── book_access.py    # get_book_owner_id / get_book_access / require_rights
│       ├── reorder.py        # apply_display_order(sb, table, book_id, owner_id, ordered_ids) — shared drag-order loop
│       └── plans.py          # TIER_RANK, FEATURES, LIMITS, effective_tier, require_feature (→ 402)
├── requirements.txt
├── Procfile                  # web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
├── .env                      # NEVER commit
└── .env.example
```

*(The `migration` router was removed in the production-hardening pass.)*

---

## Tech Stack

| Concern | Library |
|---|---|
| Framework | FastAPI 0.111 |
| Server | Uvicorn (ASGI) |
| Database client | supabase-py 2.4 (service role — bypasses RLS) |
| JWT validation | **PyJWT 2.10 (`PyJWT[crypto]`)** (HS256 + JWKS ES256/RS256, no aud check) — *python-jose removed (CVE)* |
| PDF export | ReportLab 4.1 |
| Excel export | openpyxl 3.1 |
| Config | pydantic-settings |
| HTTP client | httpx |
| Error reporting | sentry-sdk[fastapi] (optional, only when `SENTRY_DSN` set) |

---

## Environment Variables

```
SUPABASE_URL=                   # Project URL (https://xxx.supabase.co)        — required
SUPABASE_SERVICE_KEY=           # service_role key (NOT the anon key)          — required
SUPABASE_JWT_SECRET=            # JWT secret from Project Settings → API       — required
ALLOWED_ORIGINS=                # comma-separated CORS origins; default "*"     (allow_credentials is OFF)
REVENUECAT_WEBHOOK_AUTH=        # shared secret the RevenueCat webhook must send in Authorization
SENTRY_DSN=                     # optional — enables Sentry when set
DEV_ALLOW_CLIENT_SUBSCRIPTION=  # dev only, default False — lets the client PATCH its own tier

# Gmail SMTP — required for production email-OTP (leave empty in local dev → 503 fallback)
GMAIL_SMTP_USER=                # OTP sender account
GMAIL_SMTP_PASSWORD=            # 16-char App Password (NOT account password)
GMAIL_FROM_NAME=                # default "Ultimate CashBook"
GMAIL_FROM_ADDRESS=             # default "info@ultimatecashbook.com"
```

**Never use the anon key on the backend.** The service key bypasses RLS — always add `user_id` filters manually in every query (defence in depth).

### App setup (`main.py`)
- CORS: `allow_origins = settings.cors_origins`, **`allow_credentials = False`** (no wildcard-with-credentials).
- A global exception handler logs server-side and returns a generic `{"detail": "Internal server error"}` — internals are never leaked to clients. Its manual CORS headers echo the request `Origin` when it is in the allow-list (and `Vary: Origin`), so 500s don't get a mismatched `Access-Control-Allow-Origin` in multi-origin setups.
- Sentry is initialized only when `SENTRY_DSN` is set.

---

## Auth Middleware (`app/auth/jwt.py`)

- Uses **PyJWT** (`import jwt`, `PyJWKClient`). Supports HS256 (via `SUPABASE_JWT_SECRET`) and ES256/RS256 (via the Supabase JWKS endpoint, resolved by a cached `PyJWKClient` off the event loop). All paths set `verify_aud = False`.
- After decoding, `get_current_user` calls `_assert_active(user_id)` — selects `profiles.is_active`; if false → **401 "Account deactivated"**.

```python
async def get_current_user(authorization: str = Header(...)) -> str:
    token = authorization.removeprefix("Bearer ").strip()
    # HS256 via SUPABASE_JWT_SECRET; ES256/RS256 via PyJWKClient JWKS
    user_id = payload.get("sub")        # UUID of the authenticated user
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    await _assert_active(user_id)       # deactivated account → 401
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

No JWT auth required (these endpoints issue the session).

| Method | Path | Description |
|---|---|---|
| POST | `/send-otp` | Generate a crypto-random 6-digit code (`secrets.randbelow`), store its **SHA-256 hash** in `otp_codes` (5-min expiry), and email it via Gmail SMTP (587 STARTTLS → 465 SSL fallback). Rate-limited to 3 / email / 10 min (429). Returns 503 when `GMAIL_SMTP_USER` is empty (dev fallback signal). |
| POST | `/verify-otp` | Verify the latest unused/unexpired code. **Attempt cap of 5** burns the code; wrong code increments `attempts`. On success: mark used + delete codes, upsert the Supabase auth user, generate a magic-link token, exchange it for an access/refresh session, return `{ session, user }`. Uniform "Invalid or expired code" error (no brute-force hint). |

**Dev/prod branching:** When `GMAIL_SMTP_USER` is unset, both endpoints return 503; the frontend falls back to Supabase native OTP. OTP codes are crypto-random, hashed at rest in `otp_codes`, and attempt-capped (migration 011 added the `attempts` column + RLS lockdown).

---

### Profile (`routers/profile.py`) — prefix `/api/v1/profile`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `` | Authenticated user's profile (incl real `storage_mb` via RPC + `entry_count`; 0 fallback) | ✅ |
| PUT | `` | Update own profile (full_name, phone, avatar_url, currency, is_dark_mode) | ✅ |
| PATCH | `/subscription` | **Disabled in prod — returns 403** unless `DEV_ALLOW_CLIENT_SUBSCRIPTION=true`. The RevenueCat webhook is the sole writer of `subscription_*`. | ✅ |
| GET | `/search?q=email` | ilike-search users by email (exclude self, max 10) | ✅ |
| DELETE | `` | **Permanently delete own account.** Purges storage (entry attachments from `entries.attachment_path` + avatar folder) best-effort, then `sb.auth.admin.delete_user(user_id)` cascades every DB row via the `on delete cascade` FKs to `auth.users`. Returns 204. Required for App Store launch (Apple Guideline 5.1.1(x)). | ✅ |

---

### Books (`routers/books.py`) — prefix `/api/v1/books`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `` | List all books for current user (net_balance, last_entry_at, field_settings); excludes soft-deleted | ✅ |
| POST | `` | Create a new book — **enforces the book limit, returns 402 when over** (free 3 / pro 15 / business ∞) | ✅ |
| PUT | `/{book_id}` | Rename or update book currency | ✅ |
| DELETE | `/{book_id}` | **Soft delete** (`deleted_at = now()`) | ✅ |
| PATCH | `/{book_id}/field-settings` | Save entry field visibility toggles (collaborator needs ≥ view_create_edit) | ✅ |
| GET | `/shared` | List all books shared WITH the current user (recipient view, accepted only) | ✅ |
| GET | `/sync/changes?since=<iso>` | **Delta pull** for multi-device sync (declared BEFORE `/{book_id}`) | ✅ |

**Sync model (migration 012):** The client UUID is the SHARED primary key in both SQLite and Postgres. All five create endpoints (`POST /books`, `/entries`, `/categories`, `/customers`+`/suppliers`, `/payment-modes`) accept an optional `id` in the body — included in the insert only when present, else Postgres `gen_random_uuid()`. DELETE is a **soft delete** (`deleted_at = now()`) for books/categories/customers/suppliers/payment_modes; entries stay **hard-deleted** (so the balance triggers reverse) and are tracked in `deleted_entries`. Every LIST/GET/summary query adds `.is_("deleted_at", "null")` to hide soft-deleted rows. Uniqueness pre-checks (categories/payment_modes) and limit/count checks also filter `deleted_at IS NULL`.

**GET /books/sync/changes** — returns, scoped by `user_id`, every row with `updated_at > since` (everything when `since` empty), INCLUDING soft-deleted rows and entry tombstones:
```json
{ "server_time": "<iso>", "books": [...], "entries": [...], "deleted_entry_ids": ["<uuid>", ...],
  "categories": [...], "customers": [...], "suppliers": [...], "payment_modes": [...] }
```
`server_time` is the cursor for the next call. The route is declared before `/{book_id}` so `sync` isn't captured as a path param.

### Sharing (`routers/sharing.py`) — prefix `/api/v1/books`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/{book_id}/shares` | List collaborators for a book (owner only) | ✅ |
| POST | `/{book_id}/shares` | Send invitation — `{ email, screens, rights }` → status `pending`. **Gated:** `book_sharing` feature → 402; distinct-guest cap (free 0 / pro 1 / business 10) → 402 | ✅ |
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

### Webhooks (`routers/webhooks.py`) — prefix `/api/v1/webhooks`

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/revenuecat` | RevenueCat subscription webhook — **the sole writer of `profiles.subscription_*`** | Header secret |

- **Auth:** the `Authorization` header must equal `REVENUECAT_WEBHOOK_AUTH` (missing config → 503, mismatch → 401).
- **Idempotency:** checks `processed_webhook_events` by `event_id`; duplicates return `{"status":"duplicate"}`; records the event id at the end.
- **Tier mapping:** product/entitlement id containing "business"/"biz" → `business`, else `pro`.
- **Events:** INITIAL_PURCHASE/RENEWAL/PRODUCT_CHANGE/UNCANCELLATION/NON_RENEWING_PURCHASE → set tier + active + billing cycle + expiry; CANCELLATION → cancelled + cancel_at_period_end=true; EXPIRATION → free/expired; BILLING_ISSUE → past_due; others (TRANSFER, SUBSCRIPTION_PAUSED, TEST) → acknowledged no-op.

**GET /books** — tries `get_books_with_summary` RPC first (single round-trip, includes pre-computed `net_balance`, `last_entry_at`, and `field_settings`; backend filters out soft-deleted rows). Falls back to a direct table query if the RPC is not yet defined.

**POST /books** — returns the new book immediately; `net_balance` defaults to 0 (trigger fires on first entry).

**PATCH /books/:id/field-settings body:** `{ "showCustomer": bool, "showSupplier": bool, "showCategory": bool, "showAttachment": bool }` — updates the book's 4 individual boolean columns (`show_customer`, `show_supplier`, `show_category`, `show_attachment`).

---

### Entries (`routers/entries.py`) — prefix `/api/v1/books`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/{book_id}/entries` | List entries (optional: date_from, date_to, type filters) | ✅ |
| POST | `/{book_id}/entries` | Create an entry | ✅ |
| PUT | `/{book_id}/entries/{entry_id}` | Update an entry | ✅ |
| DELETE | `/{book_id}/entries/{entry_id}` | Delete an entry | ✅ |
| GET | `/{book_id}/summary` | Get balance summary (via DB function) | ✅ |

All entry endpoints resolve access via `get_book_access(sb, book_id, user_id)` (404 if no access) and mutations call `require_rights` (create/edit → `view_create_edit`; delete + delete-all → `view_create_edit_delete`). Entries are **hard-deleted** (the balance triggers reverse). `DELETE /{book_id}/entries` (no entry id) deletes all entries in the book.

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
| GET | `/users` | All non-superadmin profiles with computed stats (book_count, entry_count, shared_books_count, storage_mb) |
| PATCH | `/users/{user_id}/status` | Toggle `profiles.is_active` (`{ is_active: bool }`). 404 if missing, 400 if target is superadmin |
| GET | `/users/{user_id}/books` | Any user's books (with net_balance and last_entry_at) |
| POST | `/notifications` | Create notification + fan-out to a target segment (+ best-effort Expo push) |
| GET | `/notifications` | All notifications sent by this admin (with recipient_count) |

**GET /users** — reads the `get_admin_user_stats()` RPC (single round-trip; migration 014) with a per-user Python fallback. Deactivating a user via `/users/{id}/status` makes their next API call fail with 401 in `get_current_user`.

**GET /users/:id/books** — tries `get_books_with_summary` RPC first, falls back to a direct table query.

**POST /admin/notifications body:** `{ title, body, target_type, days_threshold?, user_ids? }`. `target_type` ∈ `all | new_users | plan_free | plan_pro_m | plan_pro_y | plan_biz_m | plan_biz_y | specific`. `user_ids` is required when `target_type='specific'` (must be real non-superadmin profiles, else 422); `days_threshold` applies to `new_users`. Returns `NotificationResponse` with `recipient_count`.

---

### Notifications (`routers/notifications.py`) — prefix `/api/v1/notifications`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `` | User's notification inbox; `?unread=true` filters to unread only | ✅ |
| POST | `/push-token` | Upsert the caller's Expo push token | ✅ |
| POST | `/bulk-delete` | Delete multiple notifications `{ ids: [...] }` | ✅ |
| POST | `/bulk-read` | Mark multiple notifications as read `{ ids: [...] }` | ✅ |
| PATCH | `/read-all` | Mark every unread notification as read | ✅ |
| DELETE | `/{id}` | Permanently delete one notification | ✅ |
| PATCH | `/{id}/read` | Mark one notification as read | ✅ |

---

### Payment Modes (`routers/payment_modes.py`) — prefix `/api/v1/books`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/{book_id}/payment-modes` | List payment modes (ordered by display_order) | ✅ |
| POST | `/{book_id}/payment-modes` | Create (name required, case-insensitive unique → 409); accepts client `id` | ✅ |
| PUT | `/{book_id}/payment-modes/{id}` | Rename | ✅ |
| DELETE | `/{book_id}/payment-modes/{id}` | **Soft delete**; blocks deleting the last mode (400) | ✅ |
| PATCH | `/{book_id}/payment-modes/reorder` | Save drag order `{ ordered_ids }` | ✅ |
| GET | `/{book_id}/payment-modes/{id}/entries` | Entries linked to this mode | ✅ |

Balances (`total_in/out/net_balance`) maintained by `trg_update_payment_mode_balance`. All mutations enforce `require_rights`. The reorder endpoint delegates the `display_order` loop to `apply_display_order` in `app/utils/reorder.py`.

---

### Reports (`routers/reports.py`) — prefix `/api/v1/books`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/{book_id}/report/pdf` | Download PDF report — **`require_feature(export_reports)` → 402** | ✅ |
| GET | `/{book_id}/report/excel` | Download Excel report — **`require_feature(export_reports)` → 402** | ✅ |

Query params: `?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`. Summary math uses `Decimal`.

---

### Upload (`routers/upload.py`) — prefix `/api/v1/upload`

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/attachment` | Upload entry photo/PDF to Supabase Storage | ✅ |
| POST | `/avatar` | Upload profile photo to Supabase Storage (`avatars` bucket) | ✅ |

- `POST /attachment` — `multipart/form-data` with optional `entry_id` + `file`; generates a UUID path if `entry_id` omitted; allowed types JPEG/PNG/WebP/HEIC/PDF; **max 6 MB**; path `{user_id}/{storage_id}/attachment.{ext}`; returns 7-day signed URL + `{ attachment_url, path, provider: "supabase" }`
- `DELETE /attachment?path=...` — removes the file; verifies path starts with `{user_id}/` (else 403)
- `POST /avatar` — image only; path `{user_id}/profile.{ext}`; public `avatars` bucket; updates `profiles.avatar_url`; returns `{ "avatar_url": "<public-url>" }`
- Image compression is done client-side before upload (see frontend `EntryForm` / `storage.js`)

---

## Plan Limits (`app/utils/plans.py`)

The server-side source of truth for entitlements and limits. The frontend `canAccess.js` mirrors these for UI only — it does not enforce anything.

- `TIER_RANK = { free: 0, pro: 1, business: 2 }`
- `FEATURES` (min tier): `cloud_sync`, `export_reports`, `book_sharing`, `guest_access`, `backup_history` → `pro`; `attachments` → `free`.
- `LIMITS`: `books { free:3, pro:15, business:None }`; `guest_access { free:0, pro:1, business:10 }`; `backup_days { free:0, pro:7, business:30 }`.
- `effective_tier(profile)`: superadmin → `business` always; status `active` → stored tier; `cancelled` & unexpired → tier; otherwise `free`.
- `require_feature(profile, feature)` raises **HTTP 402** when the effective tier can't access the feature. Paywall violations use **402** (not 403). Enforced in `POST /books`, `POST /shares`, and the report endpoints.

---

## Pydantic Models

### `models/profile.py`
```python
class ProfileResponse:    id, email, full_name, phone, avatar_url, role, is_active (default True), currency (default 'PKR'), is_dark_mode, subscription_tier (default 'free'), subscription_status (default 'free'), subscription_started_at?, subscription_billing_cycle (default 'monthly'), subscription_expires_at?, subscription_cancel_at_period_end (default False), created_at, updated_at, storage_mb (float, default 0.0), entry_count (int, default 0)
class ProfileUpdate:      full_name?, phone?, avatar_url?, currency?, is_dark_mode?
class UserWithStats:      ProfileResponse + book_count, entry_count, storage_mb, shared_books_count (overrides base)
class StatusUpdate:       is_active: bool          # admin PATCH /users/{id}/status
class SubscriptionUpdate: subscription_tier: Literal["free","pro","business"], subscription_status: Literal["free","active","cancelled","expired","past_due"] = "active", billing_cycle: Literal["monthly","yearly"] = "monthly", expires_at?: datetime, cancel_at_period_end: bool = False
```

**Client-id models (migration 012):** `BookCreate`, `EntryCreate`, `CategoryCreate`, `ContactCreate`, `PaymentModeCreate` each carry `id: Optional[str] = None` (client-supplied shared UUID; trusted because ownership is already scoped by `user_id`/`book_id`).

### `models/payment_mode.py`
```python
class PaymentModeCreate:   id?, name
class PaymentModeUpdate:   name?
class PaymentModeReorder:  ordered_ids: List[str]
class PaymentModeResponse: id, book_id, user_id, name, display_order (int, default 0), total_in, total_out, net_balance, created_at
```

### `models/sharing.py`
```python
class ScreensConfig:       entries (default True), categories/contacts/payment_modes/reports/settings (default False)
class ShareCreate:         email, screens, rights (default "view")
class ShareUpdate / ShareRespondPayload(action) / ShareResponse / SharedBookResponse / ReceivedInvitation / GivenInvitation
```

### `models/book.py`
```python
class BookCreate:         id?, name, currency (default PKR)
class BookUpdate:         name?, currency?
class FieldSettingsBody:  showCustomer, showSupplier, showCategory, showAttachment (all bool, default False)
class BookResponse:       id, user_id, name, currency, net_balance (float, default 0), show_customer (bool), show_supplier (bool), show_category (bool), show_attachment (bool), created_at, updated_at?, last_entry_at?
```

### `models/entry.py`
```python
class EntryCreate:   id?, type, amount, remark?, category?, category_id?, payment_mode (default "Cash"), payment_mode_id?, contact_name?, customer_id?, supplier_id?, attachment_url?, attachment_path?, attachment_provider?, entry_date, entry_time
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

### Categories (`routers/categories.py`) — prefix `/api/v1/books`

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/{book_id}/categories` | List all categories (ordered by display_order, then created_at) | ✅ |
| POST | `/{book_id}/categories` | Create category (name required, unique per book) | ✅ |
| PUT | `/{book_id}/categories/{id}` | Rename category | ✅ |
| DELETE | `/{book_id}/categories/{id}` | **Soft delete** (`deleted_at`); entries.category_id → NULL via FK | ✅ |
| PATCH | `/{book_id}/categories/reorder` | Save drag-sorted order `{ ordered_ids: [uuid,...] }` | ✅ |
| GET | `/{book_id}/categories/{id}/entries` | Entries assigned to this category | ✅ |

**Balance rule:** `total_in`, `total_out`, `net_balance` are maintained by `trg_update_category_balance` (DB trigger on `entries`). Read directly from the row — never recompute in Python.
**Uniqueness:** category names are case-insensitive unique per book (DB UNIQUE constraint + `ilike` pre-check for a friendly 409).
**Sort order:** `display_order` column (migration 003, backfilled by migration 008). All mutations enforce `require_rights`. The reorder endpoint delegates the `display_order` loop to `apply_display_order` in `app/utils/reorder.py`.

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
**Sort order:** `display_order` column (migration 004, backfilled by migration 008); reorder endpoint overrides the default order with user-set order. The reorder endpoints delegate the `display_order` loop to `apply_display_order` in `app/utils/reorder.py`.
**Soft delete:** DELETE sets `deleted_at`; all mutations enforce `require_rights`.
**Internal dedup:** customer & supplier route handlers are thin wrappers over shared `_list/_create/_get/_update/_delete/_get..entries/_reorder_contacts` helpers parametrized by table name + entity label; all routes, paths, auth, filters, client-id acceptance, `_with_balance`, and response_models are unchanged.

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

`get_book_owner_id` still exists for read-only endpoints that only need the `owner_id`.

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
app.include_router(profile.router,       prefix="/api/v1/profile",       tags=["profile"])
app.include_router(books.router,         prefix="/api/v1/books",         tags=["books"])
app.include_router(entries.router,       prefix="/api/v1/books",         tags=["entries"])
app.include_router(reports.router,       prefix="/api/v1/books",         tags=["reports"])
app.include_router(upload.router,        prefix="/api/v1/upload",        tags=["upload"])
app.include_router(admin.router,         prefix="/api/v1/admin",         tags=["admin"])
app.include_router(contacts.router,      prefix="/api/v1/books",         tags=["contacts"])
app.include_router(categories.router,    prefix="/api/v1/books",         tags=["categories"])
app.include_router(payment_modes.router, prefix="/api/v1/books",         tags=["payment_modes"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["notifications"])
app.include_router(sharing.router,       prefix="/api/v1/books",         tags=["sharing"])
app.include_router(invitations.router,   prefix="/api/v1/invitations",   tags=["invitations"])
app.include_router(auth.router,          prefix="/api/v1/auth",          tags=["auth"])
app.include_router(webhooks.router,      prefix="/api/v1/webhooks",      tags=["webhooks"])
# + GET /health  (non-router)
```

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
