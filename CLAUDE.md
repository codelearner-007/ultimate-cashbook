# CLAUDE.md — Ultimate CashBook App Implementation Guide

This file is the single source of truth for AI-assisted development of the Ultimate CashBook app.
Read this fully before writing any code.

## Sub-Documentation (read before touching that area)

Each sub-folder has its own `CLAUDE.md` with detailed, up-to-date logic for that layer.
**Rule:** When any code file in a folder is changed, also update that folder's `CLAUDE.md` before finishing.

| Area | File | What's inside |
|---|---|---|
| Frontend | [frontend/CLAUDE.md](frontend/CLAUDE.md) | Screen logic, routes, hooks, API calls, state, styling |
| Backend | [backend/CLAUDE.md](backend/CLAUDE.md) | Endpoints, Pydantic models, auth middleware, DB patterns |
| Supabase | [supabase/CLAUDE.md](supabase/CLAUDE.md) | Schema, RLS, Storage, Auth setup, migrations |
| Publishing | [PUBLISHING.md](PUBLISHING.md) | Step-by-step launch runbook: Supabase/Render/RevenueCat/EAS provisioning + store compliance |

## App Skeleton (click-by-click use-case map)

**File:** [skeleton.md](skeleton.md)

This file documents every screen, every button, every navigation flow, every API call triggered, and every error/loading state in the app. It is the single reference for "what happens when I tap X."

**Rule: Update [skeleton.md](skeleton.md) after EVERY change to any screen or component, including:**
- Any visual/design change: layout, colors, icons, typography, spacing, card style
- A screen gains or loses a button, tab, modal, sheet, or chip
- A button's action changes (different navigation target, different API call, new behavior)
- A new screen is added or an existing screen is removed
- A feature moves from TODO/skeleton to implemented
- Navigation routes change
- An error or loading state is added or removed
- Filter, sort, or search behavior changes
- Any icon swap or label rename on an interactive element
- Any new state variable that changes what the user sees

**This is non-negotiable: no prompt that touches a screen file is complete until skeleton.md is also updated.**

Update the relevant section(s) only — do not rewrite unrelated sections.

---

## Project Identity

- **App Name:** Ultimate CashBook
- **Purpose:** Daily income & expense tracker with multiple books per user
- **Platforms:** Android + iOS (via React Native + Expo)
- **Backend:** FastAPI (Python)
- **Database + Auth:** Supabase (PostgreSQL + Google OAuth / Email OTP)
- **Billing:** RevenueCat (App Store / Google Play in-app purchases)
- **Deployment:** Render (API), Expo EAS (mobile builds)

### Architecture: LOCAL-FIRST (not cloud-first)

**Every read and write hits a local SQLite database first** (`frontend/src/lib/localDb.js`; on web `localDb.web.js` backed by IndexedDB), routed through `frontend/src/lib/dataSource.js`. The app is fully usable with no internet for any CRUD operation, on any tier.

- **Free tier:** local only. No cloud mirror.
- **Paid (pro/business) tier + superadmin:** local + a background cloud mirror. The cloud is never the source of truth for the UI — it is a durable backup/sync layer.
- The predicate that decides whether a write is also mirrored to the cloud is `shouldBackupToCloud()` in `dataSource.js` (superadmin → always; else `subscription_tier !== 'free'`). It is **tier-based, not connectivity-based** — writes are queued whether online or offline and drained when a connection is available.

#### Cloud sync model (paid/superadmin)
- **Shared UUID:** the client-generated UUID (`localDb.newId()`) is the SHARED primary key in both SQLite and Postgres. Create endpoints accept that `id`, so update/delete by id work identically locally and on the server. There is no local→cloud id mapping (the `books.cloud_id` column is kept only for back-compat; `dataSource.resolveCloudBookId()` is the identity function).
- **Durable outbox:** every paid/superadmin write enqueues a row in the local `sync_outbox` table `(seq, op, entity, entity_id, book_id, payload, attempts, last_error, created_at)`. Writes are never fire-and-forget.
- **`AutoSyncMonitor`** (`app/_layout.jsx`) drains the outbox FIFO on reconnect (offline→online edge) and on app-foreground: each row resolves to its `api.js` call by shared id; rows are deleted on success or on benign `404` (delete-of-missing) / `409` (create-of-existing); other failures bump `attempts` and the row is dropped after `8` attempts with a `console.warn`. It then runs an incremental **delta pull**.
- **Delta pull:** `GET /api/v1/books/sync/changes?since=<cursor>` returns every row changed since the cursor (plus a `server_time` cursor for next time). Applied via last-write-wins on `updated_at`. Tombstones: entries are **hard-deleted** locally + propagated via the `deleted_entries` table; all other entities use a `deleted_at` soft-delete.
- **No fingerprint/name dedup. No destructive auto-delete** — a cloud row is never deleted just because it is absent locally.

---

## Monorepo Structure

```
cashbook/
├── CLAUDE.md                  ← You are here
├── frontend/                  ← React Native Expo app (JavaScript, not TypeScript)
│   ├── app/                   ← Expo Router file-based routes
│   ├── src/                   ← Screens, components, hooks, store, lib, constants
│   └── node_modules/
├── backend/                   ← FastAPI backend (Python)
│   ├── app/                   ← Routers, models, auth, db, utils
│   └── venv/
└── supabase/                  ← SQL migrations + Supabase config
    └── migrations/
```

---

## 1. Roles & Access Control

Two roles exist, assigned automatically at registration:

| Role | Assigned when | Landing route | Can access |
|---|---|---|---|
| `superadmin` | First user to register | `/(app)/dashboard/users` | Dashboard (Users + My Books + Notify + Settings tabs), all features at no cost, all book CRUD |
| `user` | All subsequent users | `/(app)/books` | Books screen (own books), book CRUD, settings, sharing/subscription |

**First-user rule:** Implemented in the `handle_new_user` PostgreSQL trigger — if `profiles` table has 0 rows at the time of insert, the new profile gets `role = 'superadmin'`; all others get `role = 'user'`.

**Superadmin entitlements:** superadmin always behaves as `business` tier (`utils/plans.py effective_tier`; `canAccess.js` returns `true`/`Infinity`) — all paid features unlocked, no limits.

**AuthGuard** in `app/_layout.jsx` reads the user's role from `authStore` and redirects accordingly after login.

---

## 2. Super Admin Dashboard (`/(app)/dashboard`)

Superadmin lands on `/(app)/dashboard/users`. Four tabs rendered by `app/(app)/dashboard/_layout.jsx` (Expo Router `<Tabs>` with a custom `AdminTabBar`):

| Tab | Route file | Screen component | Purpose |
|---|---|---|---|
| Users | `dashboard/users.jsx` | `AdminUsersScreen` | View all non-superadmin users, stats, filters, read-only detail modal |
| My Books | `dashboard/books/` (own Stack) | `AdminBooksScreen` | Admin's own books — identical CRUD to regular BooksScreen |
| Notify | `dashboard/notifications.jsx` | `AdminNotificationsScreen` | Compose + send push notifications to user segments; sent history |
| Settings | `dashboard/settings.jsx` | `SettingsScreen` | Same settings screen reused (admin profile lives at `/(app)/admin-profile`) |

### Users Tab (`AdminUsersScreen`)
- Lists all non-superadmin users fetched from `GET /api/v1/admin/users` (backed by the `get_admin_user_stats()` RPC)
- Polls every **10 seconds** (`refetchInterval: 10000`) so new users appear near-instantly without full-page refresh
- Header stats: Total Users (+ active sub-count), Total Books, Storage
- Each row shows: avatar initials, full name, email, **subscription plan pill** (Free/Pro/Business), and an access badge when the user has shared books. Status (`is_active`) and storage are shown in the detail modal.
- Tap user card → read-only **User Detail Modal** (books / entries / storage / access-given stats, subscription card, account-status card)
- Filters: All / Plan / Date — compose client-side
- **Admin can deactivate a user** via `PATCH /api/v1/admin/users/:id/status` (`apiToggleUserStatus`) which toggles `profiles.is_active`; a deactivated user is rejected at `get_current_user` (401). The toggle UI is not on the row in the current build.

### My Books Tab (`AdminBooksScreen`)
- Functionally identical to `BooksScreen` — same hooks (`useBooks`, `useCreateBook`, `useDeleteBook`)
- Same optimistic-update + invalidate-and-refetch pattern
- Header shows "Admin Workspace" instead of "Personal Workspace"
- FAB positioned at `bottom: 16` (no bottom nav bar in admin layout)

---

## 3. Regular User Books (`/(app)/books`)

`BooksScreen` — all books belonging to the authenticated user:
- `GET /api/v1/books` on mount (staleTime 2 min)
- Header: total net balance, book count, theme toggle, avatar → settings
- Sort: by last-updated (default), created-at, alphabetical, custom drag-reorder
- FAB → "Add New Book" modal → `POST /api/v1/books` → instant optimistic prepend + refetch
- ⋮ menu on each card → `BookMenu` bottom sheet → confirm delete → `DELETE /api/v1/books/:id` → instant optimistic remove + refetch
- Tap book → `/(app)/books/[id]` (BookDetailScreen)
- Bottom nav: Cashbooks | Help | Settings

---

## 4. Books CRUD — Data Flow (local-first, same for both roles)

All hooks (`useCreateBook`, `useDeleteBook`, etc.) call the `api*` functions in `frontend/src/lib/api.js`, but those functions are thin wrappers — the real CRUD goes through `frontend/src/lib/dataSource.js`, which always writes to local SQLite first and conditionally enqueues a cloud-sync outbox row.

**Create:**
1. User types name, presses "Create" → `useCreateBook().mutate({ name })`
2. `onMutate`: optimistically prepends a placeholder to the `['books']` cache → UI updates immediately
3. `dataSource.apiCreateBook(name, currency, id)` → `localDb.localCreateBook(...)` inserts into SQLite with the **client-generated shared UUID** (instant, offline-safe)
4. If `shouldBackupToCloud()` (paid/superadmin): a `create`/`book` row + a `create`/`payment_mode` row per seeded default mode are enqueued in `sync_outbox`
5. `onSuccess`: `invalidateQueries(['books'])` → re-read from local SQLite → cache reflects local truth

**Delete:**
1. User confirms in `BookMenu` → `useDeleteBook().mutate(bookId)`
2. `onMutate`: optimistic removal from `['books']` cache
3. `dataSource.apiDeleteBook(bookId)` → `localDb.localDeleteBook(...)` **soft-deletes** the book and cascade-soft-deletes its children (sets `deleted_at`); reads always exclude `deleted_at IS NOT NULL`
4. If paid/superadmin: a `delete`/`book` outbox row is enqueued
5. `onSuccess`: `invalidateQueries(['books'])` → re-read from local

**Sync to cloud (paid/superadmin):** `AutoSyncMonitor` drains the outbox to the server in the background, and the delta pull (`GET /api/v1/books/sync/changes`) brings server changes back. The server is a mirror, not the read path.

**Rule:** The UI always shows local SQLite truth after any mutation. The cloud is reconciled asynchronously by the outbox + delta pull — never on the critical path.

---

## 5. FRONTEND Stack

- **React Native 0.81 + Expo SDK 54 + React 19.1** (JavaScript, not TypeScript)
- **Expo Router v6** — file-based routing
- **expo-sqlite** (native) / **IndexedDB** (web) — local-first data store (`lib/localDb.js` / `lib/localDb.web.js`)
- **TanStack React Query v5** — cache/mutation layer over the local-first data source
- **Zustand v4** — auth state + UI preferences + sync/workspace state (no server data)
- **Axios** — HTTP client for the cloud mirror; auth interceptor attaches the Supabase JWT and signs out only on 401
- **Supabase JS client** — auth session management
- **react-native-purchases (RevenueCat)** — in-app purchases (native only; web is a no-op stub)
- **@expo-google-fonts/inter** — Inter 400/500/600/700/800
- **expo-secure-store** — encrypted session/preference storage (iOS/Android); localStorage on web

### Key folders

```
frontend/src/
├── screens/          # One file per screen (~31 screens)
├── components/
│   ├── books/        # BooksView, BookMenu, DraggableList, SortSheet, *MenuSheet
│   ├── entry/        # EntryForm, CategoryPickerModal, ContactPickerModal
│   ├── notifications/# NotificationInbox (shared by user + admin)
│   ├── sharing/      # EditShareSheet, RemoveAccessSheet
│   └── ui/           # Input, Icons, CrownBadge, pickers, confirm sheets, Sync/Restore/FreshStart sheets
├── hooks/            # useBooks, useCategories, useContacts, usePaymentModes, useSharing,
│                     # useNotifications, useProfile, useRealtimeSync, useBookSort, useBookBasePath, useTheme
├── lib/
│   ├── api.js        # Axios calls to the cloud mirror (also wraps dataSource for CRUD)
│   ├── dataSource.js # Local-first router: SQLite first, conditional cloud-sync outbox enqueue
│   ├── localDb.js    # SQLite implementation (localDb.web.js = IndexedDB mirror)
│   ├── syncManager.js# pullDelta / syncCloudToLocal / syncLocalToCloud
│   ├── canAccess.js  # COSMETIC client-side feature gating (server is the real gate)
│   ├── purchases.js  # RevenueCat (purchases.web.js = no-op)
│   ├── storage.js    # Attachment abstraction (local vs Supabase Storage)
│   ├── pushNotifications.js, devConfig.js, supabase.js, toast.js
├── store/
│   ├── authStore.js          # user, session, subscription_tier (persisted), setUser, clearUser
│   ├── themeStore.js         # isDark, toggle
│   ├── syncStore.js          # isOnline, isSyncing, isRestoring, progress, syncCursor, ...
│   ├── workspaceStore.js     # activeWorkspace 'personal' | 'shared'
│   └── notificationPopupStore.js # tappedId for OS-tray taps
└── constants/
    ├── colors.js, fonts.js, currencies.js, categories.js, shadows.js
    ├── plans.js      # PLAN_META (colors/labels) — tier ranks live in canAccess.js
    └── sharing.js    # rights/screens constants
```

### Styling rules
- Always use `useTheme()` → `{ C, Font }` — **never** hardcode hex colors or font families
- `C` resolves to `LightColors` or `DarkColors` based on `isDark`
- Per-screen styles via `StyleSheet.create()` inside a local `makeStyles(C, Font)` function

---

## 6. BACKEND Stack

- **FastAPI 0.111** + **Uvicorn**
- **supabase-py 2.4** — service role client (bypasses RLS; manually filter by user_id)
- **PyJWT 2.10 (`PyJWT[crypto]`)** — JWT validation (HS256 via secret, ES256/RS256 via JWKS; no aud check). *python-jose was removed (CVE).*
- **ReportLab** — PDF export; **openpyxl** — Excel export
- **pydantic-settings** — env config
- **sentry-sdk[fastapi]** — optional error reporting (only initialized when `SENTRY_DSN` is set)

### Environment Variables

```
SUPABASE_URL=                   # https://xxx.supabase.co
SUPABASE_SERVICE_KEY=           # service_role key — NEVER the anon key
SUPABASE_JWT_SECRET=            # Project Settings → API → JWT Secret
ALLOWED_ORIGINS=                # comma-separated CORS origins; default "*" but allow_credentials=False
GMAIL_SMTP_USER=                # email-OTP sender (empty in local dev → 503 fallback)
GMAIL_SMTP_PASSWORD=            # 16-char Gmail App Password
GMAIL_FROM_NAME=                # default "Ultimate CashBook"
GMAIL_FROM_ADDRESS=             # default "info@ultimatecashbook.com"
REVENUECAT_WEBHOOK_AUTH=        # shared secret the RevenueCat webhook must send in Authorization
SENTRY_DSN=                     # optional; enables Sentry when set
DEV_ALLOW_CLIENT_SUBSCRIPTION=  # dev only; default False — lets the client PATCH its own tier
```

**Rule:** Every protected endpoint uses `Depends(get_current_user)`. Every DB query filters by `user_id` even though the service key bypasses RLS (defence in depth). `get_current_user` also enforces `profiles.is_active` — a deactivated account is rejected with 401.

### Router prefixes (14 routers registered in `main.py`)

| Router | Prefix |
|---|---|
| profile | `/api/v1/profile` |
| books | `/api/v1/books` |
| entries | `/api/v1/books` |
| reports | `/api/v1/books` |
| upload | `/api/v1/upload` |
| admin | `/api/v1/admin` |
| contacts | `/api/v1/books` |
| categories | `/api/v1/books` |
| payment_modes | `/api/v1/books` |
| notifications | `/api/v1/notifications` |
| sharing | `/api/v1/books` |
| invitations | `/api/v1/invitations` |
| auth | `/api/v1/auth` |
| webhooks | `/api/v1/webhooks` |

Plus a non-router `GET /health`. *(The old `migration` router was removed.)*

### Monetization & entitlements
- Tiers: `free < pro < business`. The user's tier (`profiles.subscription_*`) is written **only** by the RevenueCat webhook (`POST /api/v1/webhooks/revenuecat`, Authorization-verified, idempotent via the `processed_webhook_events` table).
- The client `PATCH /api/v1/profile/subscription` is **disabled in production** (returns 403) unless `DEV_ALLOW_CLIENT_SUBSCRIPTION=true`.
- Server-side limits are enforced and return **HTTP 402** when exceeded (`utils/plans.py`): book limit on `POST /books`, `book_sharing` feature + distinct-guest cap on `POST /shares`, `export_reports` on the PDF/Excel report endpoints. The frontend `canAccess.js` gate is cosmetic only.

---

## 7. Database (Supabase PostgreSQL)

Tables: `profiles`, `books`, `entries`, `categories`, `customers`, `suppliers`, `payment_modes`, `book_shares`, `notifications`, `user_notifications`, `push_tokens`, `otp_codes`, `deleted_entries`, `processed_webhook_events`. Full schema, triggers, RPCs, and RLS are documented in [supabase/CLAUDE.md](supabase/CLAUDE.md).

Key invariants:
- `books.net_balance` is **auto-maintained** by the `trg_update_book_balance` trigger on `entries` — never compute it in application code
- `categories`/`customers`/`suppliers`/`payment_modes` `total_in/out/net_balance` are **auto-maintained** by trigger — never compute in application code
- `categories` and `payment_modes` are per-book; UNIQUE(book_id, name) prevents duplicates; `entries.category_id` FK → ON DELETE SET NULL (keeps `entries.category` text snapshot)
- `profiles.role` is `'superadmin'` or `'user'` (set once by the `handle_new_user` trigger); `profiles.is_active` controls account access; `profiles.subscription_*` columns hold the tier
- **Privileged profile columns** (`role`, `is_active`, all `subscription_*`) are frozen by the `protect_profile_columns` trigger when `auth.uid()` is non-null — only the service-role backend / RevenueCat webhook can change them
- **Sync columns:** entries/categories/payment_modes gained `updated_at`; all six syncable tables (books, entries, categories, customers, suppliers, payment_modes) have nullable `deleted_at` for soft-delete tombstones. Entries are hard-deleted and tracked in `deleted_entries`.
- Backend uses the service role key → bypasses RLS → must manually add the `user_id` filter on every query
- RLS (hardened in migration 011) uses `auth.uid() = user_id` with `WITH CHECK` + book-ownership; collaborator SELECT policies exist for accepted shares (for Realtime)

---

## 8. Coding Rules

### General
- Use JavaScript (`.js`, `.jsx`) in frontend — not TypeScript
- Use Pydantic models in FastAPI — no raw dicts
- Never hardcode credentials — always use `.env`
- Every API endpoint must use `get_current_user` dependency
- Use `user_id` from JWT token — never trust a user-supplied `user_id`
- No inline hex colors in frontend — always use `C.*` from `useTheme()`

### Frontend
- Use Expo Router for all navigation
- **Route hierarchy rule:** if screen B is always opened from screen A, put B in a subfolder under A
- All server state via React Query; Zustand only for auth + UI prefs
- All screens must handle loading, error, and empty states
- `DraggableList` syncs its internal `items` with the `books` prop via `useEffect` when not dragging

### Design Consistency (applies to every new screen and component)
Every new or modified screen/component **must match the visual language of the existing app**. Before writing any JSX, look at a similar existing screen for reference. Specific rules:
- **Header:** primary-color background (`C.primary`), white text (`C.onPrimary`), icon buttons in `C.onPrimaryIconBg` circles — same height and padding as other headers
- **Cards:** `C.card` background, `C.border` border at `1.5` width, rounded corners consistent with existing cards (`borderRadius` matching nearby screens)
- **Typography:** always `Font.regular / medium / semiBold / bold / extraBold` — never a raw `fontFamily` string; font sizes must match the scale used elsewhere (body 13–14, label 11–12, title 16–18)
- **Colors:** `C.cashIn` / `C.cashInLight` for positive/income; `C.danger` / `C.dangerLight` for negative/destructive; `C.primary` / `C.primaryLight` for accent — no one-off colors
- **Spacing:** use the same `paddingHorizontal: 16/20`, `gap`, and `marginBottom` values seen in adjacent screens
- **Modals and sheets:** follow the existing bottom-sheet pattern (handle bar, rounded top corners, `C.overlay` backdrop) — do not invent new modal layouts
- **Empty states:** icon box with `C.primaryLight` background, bold title, muted subtitle — same structure as existing empty states
- **Icons:** use `Feather` by default; only import another set (e.g. `MaterialCommunityIcons`) when Feather has no suitable icon, and document why
- **No one-off styles:** if a style looks different from every other screen, reconsider it — consistency beats novelty

### Backend
- All routers return typed Pydantic response models
- Admin endpoints (`/api/v1/admin/*`) guarded by `require_superadmin` dependency
- `GET /admin/users/:id/books` has try/except fallback — works even if migration 002 hasn't run
- Balance never computed in Python — read `books.net_balance` from DB or use `get_book_summary()` RPC

### Database Migrations
- **Never run migration files automatically** — always provide the user with the exact command to run and let them execute it
- When a new migration is needed, write the SQL file to `supabase/migrations/` and then tell the user to run it with the Supabase CLI command, e.g.:
  ```bash
  supabase db push
  ```
  or paste it manually in the Supabase SQL editor

### Git
- Never commit `.env` files
- Branch per feature: `feature/books-screen`, `feature/add-entry`
- Commit format: `feat: add cash-in entry form`

---

## 9. Screen Inventory

Both regular-user (`books/[id]/*`) and admin (`dashboard/books/[id]/*`) route trees render the same book sub-screens. The full route tree + per-screen detail is in [frontend/CLAUDE.md](frontend/CLAUDE.md) and the click-by-click map is in [skeleton.md](skeleton.md).

| Screen file | Route | Role |
|---|---|---|
| `LoginScreen.jsx` | `/(auth)/login` | — |
| `BooksScreen.jsx` | `/(app)/books` | user |
| `AdminBooksScreen.jsx` | `/(app)/dashboard/books` | superadmin |
| `AdminUsersScreen.jsx` | `/(app)/dashboard/users` | superadmin |
| `AdminNotificationsScreen.jsx` | `/(app)/dashboard/notifications` | superadmin |
| `AdminNotificationsInboxScreen.jsx` | `/(app)/settings/notifications` (admin) | superadmin |
| `NotificationsScreen.jsx` | `/(app)/settings/notifications` (user) | user |
| `BookDetailScreen.jsx` | `books/[id]` | both |
| `AddEntryScreen.jsx` | `books/[id]/add-entry` | both |
| `EditEntryScreen.jsx` | `books/[id]/edit-entry` | both |
| `EntryDetailScreen.jsx` | `books/[id]/entry-detail` | both |
| `ReportsScreen.jsx` | `books/[id]/reports` | both |
| `BookSettingsScreen.jsx` | `books/[id]/book-settings` | both |
| `CategoriesSettingsScreen.jsx` | `books/[id]/categories-settings` | both |
| `CategoryDetailScreen.jsx` | `books/[id]/category-detail` | both |
| `CategoryProfileScreen.jsx` | `books/[id]/category-profile` | both |
| `ContactsListScreen.jsx` | `books/[id]/customers` & `/suppliers` | both |
| `ContactDetailScreen.jsx` | `books/[id]/contact-detail` | both |
| `ContactBalanceScreen.jsx` | `books/[id]/contact-balance` | both |
| `PaymentModeSettingsScreen.jsx` | `books/[id]/payment-mode-settings` | both |
| `PaymentModeDetailScreen.jsx` | `books/[id]/payment-mode-detail` | both |
| `PaymentModeBalanceScreen.jsx` | `books/[id]/payment-mode-balance` | both |
| `ManageSharesScreen.jsx` | `books/[id]/manage-shares` | both |
| `AddCollaboratorScreen.jsx` | `books/[id]/add-collaborator` | both |
| `SettingsScreen.jsx` | `/(app)/settings` & `/(app)/dashboard/settings` | both |
| `ProfileScreen.jsx` | `/(app)/settings/profile` & `/(app)/admin-profile` | both |
| `CurrencyScreen.jsx` | `/(app)/settings/currency` | both |
| `ManageAccessScreen.jsx` | `/(app)/settings/manage-access` | both |
| `SubscriptionScreen.jsx` | `/(app)/settings/subscription` | both |
| `BackupSyncScreen.jsx` | `/(app)/settings/backup-sync` | both (gated) |
| `PrivacyPolicyScreen.jsx` | `/(app)/settings/privacy-policy` | both |

*Removed in the production-hardening pass: `OnboardingScreen`, `DashboardScreen`, `SplashScreen`, `BusinessSettingsScreen`, `BusinessProfileScreen`, `DeleteBusinessScreen`, `ContactSettingsScreen` (and their routes).*

---

## 10. Commands Reference

### Frontend
```bash
cd frontend
npx expo start                  # Dev server
npx expo start --tunnel         # If local network issues
npx eas build --platform android --profile preview   # Test APK
```

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate           # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload   # Dev server at http://localhost:8000
```
Swagger UI: `http://localhost:8000/docs`

---

## 11. Service Responsibilities

| Need | Handled by |
|---|---|
| Login / signup | Supabase Auth (Google OAuth) + custom Gmail email-OTP (`/api/v1/auth/send-otp` + `/verify-otp`) |
| Role assignment | Supabase trigger (first user = superadmin) |
| Book & entry data (read/write) | **Local SQLite first** (`localDb`), routed by `dataSource.js` |
| Cloud backup/sync (paid/superadmin) | `sync_outbox` + `AutoSyncMonitor` + delta pull via FastAPI/Supabase |
| Balance calculation | Local recompute (SQLite) + Supabase trigger (`trg_update_book_balance`) on the mirror |
| Subscriptions / entitlements | RevenueCat IAP → webhook writes `profiles.subscription_*` (server is source of truth) |
| Server-side plan limits | `utils/plans.py` → HTTP 402 on over-limit |
| Admin user management | FastAPI `/api/v1/admin/*` (superadmin only); `is_active` toggle |
| Receipts / photo attachments | `storage.js` → local FS (free/offline) or Supabase Storage (paid/superadmin) |
| Real-time admin user list | React Query polling (10 s interval) |
| Token / preference storage | Expo SecureStore (native) / localStorage (web) |
