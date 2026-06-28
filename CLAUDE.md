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
- **Deployment:** Render (API), Expo EAS (mobile builds)

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
| `superadmin` | First user to register | `/(app)/dashboard` | Dashboard (Users tab + Books tab), all book CRUD, settings |
| `user` | All subsequent users | `/(app)/books` | Books screen (own books), book CRUD, settings |

**First-user rule:** Implemented in the `handle_new_user` PostgreSQL trigger — if `profiles` table has 0 rows at the time of insert, the new profile gets `role = 'superadmin'`; all others get `role = 'user'`.

**AuthGuard** in `app/_layout.jsx` reads the user's role from `authStore` and redirects accordingly after login.

---

## 2. Super Admin Dashboard (`/(app)/dashboard`)

Three tabs rendered by `app/(app)/dashboard/_layout.jsx` (Expo Router `<Tabs>`):

| Tab | Route file | Screen component | Purpose |
|---|---|---|---|
| Users | `dashboard/users.jsx` | `AdminUsersScreen` | View all non-superadmin users, toggle active/inactive, view their books |
| My Books | `dashboard/books.jsx` | `AdminBooksScreen` | Admin's own books — identical CRUD to regular BooksScreen |
| Settings | `dashboard/settings.jsx` | `SettingsScreen` | Same settings screen reused |

### Users Tab (`AdminUsersScreen`)
- Lists all non-superadmin users fetched from `GET /api/v1/admin/users`
- Polls every **10 seconds** (`refetchInterval: 10000`) so new users appear near-instantly without full-page refresh
- Header stats: Total Users, Active Users, Total Books, Storage
- Each row shows: avatar initials, full name, email, book count, storage, entry count, active toggle
- Toggle switch → `PATCH /api/v1/admin/users/:id/status` → optimistic cache update + refetch
- Tap user card → modal showing that user's books (fetched from `GET /api/v1/admin/users/:id/books`)

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

## 4. Books CRUD — Data Flow (same for both roles)

**Create:**
1. User types name in modal, presses "Create"
2. `createBook.mutate({ name })` fires **before** `setShowModal(false)` — critical ordering: optimistic update must land in cache before modal closes so the book appears instantly when the sheet dismisses
3. `onMutate`: optimistically prepends a placeholder book (id `__optimistic__`) to `['books']` cache → UI updates immediately
4. `localCreateBook()` writes to SQLite instantly; cloud backup fires in background (paid/superadmin only)
5. `onSuccess`: replaces optimistic placeholder with real local book row, then `invalidateQueries(['books'])` → refetch

**Delete:**
1. User confirms in `BookMenu`
2. `useDeleteBook().mutate(bookId)` fires
3. `onMutate`: optimistically removes the book from `['books']` cache → UI updates immediately
4. `DELETE /api/v1/books/:id` → DB delete (cascades all entries; balance trigger fires)
5. `onSuccess`: `invalidateQueries(['books'])` → `GET /api/v1/books` refetch → cache reflects actual DB state

**Rule:** The UI always shows real DB data after any mutation. Optimistic updates exist only for perceived speed — the refetch on success always replaces them with the DB truth.

---

## 5. FRONTEND Stack

- **React Native + Expo SDK 51** (JavaScript, not TypeScript)
- **Expo Router v3** — file-based routing
- **TanStack React Query v5** — server state, caching, mutations, polling
- **Zustand v4** — auth state + UI preferences only (no server data in Zustand)
- **Axios** — HTTP client; auth interceptor attaches Supabase JWT automatically
- **Supabase JS client** — auth session management
- **@expo-google-fonts/inter** — Inter 400/500/600/700/800
- **expo-secure-store** — encrypted session storage (iOS/Android); localStorage on web

### Key folders

```
frontend/src/
├── screens/          # One file per screen
├── components/
│   ├── books/        # BookMenu, DraggableList, SortSheet
│   ├── entry/        # EntryForm
│   └── ui/           # Input, Icons, DatePickerModal, TimePickerModal
├── hooks/
│   ├── useBooks.js   # useBooks, useCreateBook, useDeleteBook
│   ├── useBookSort.js
│   ├── useProfile.js
│   └── useTheme.js   # Returns { C, Font, isDark, toggleTheme }
├── lib/
│   ├── api.js        # All Axios API calls (real backend, no mocks)
│   ├── supabase.js   # Supabase client
│   └── toast.js
├── store/
│   ├── authStore.js       # user, session, setUser, clearUser
│   ├── themeStore.js      # isDark, toggle
│   └── bookFieldsStore.js # per-book field visibility
└── constants/
    ├── colors.js     # LightColors, DarkColors, CARD_ACCENTS
    ├── fonts.js      # Font.regular/medium/semiBold/bold/extraBold
    ├── categories.js
    └── shadows.js
```

### Styling rules
- Always use `useTheme()` → `{ C, Font }` — **never** hardcode hex colors or font families
- `C` resolves to `LightColors` or `DarkColors` based on `isDark`
- Per-screen styles via `StyleSheet.create()` inside a local `makeStyles(C, Font)` function

---

## 6. BACKEND Stack

- **FastAPI 0.111** + **Uvicorn**
- **supabase-py 2.4** — service role client (bypasses RLS; manually filter by user_id)
- **python-jose** — JWT validation (HS256, no aud check)
- **ReportLab** — PDF export; **openpyxl** — Excel export
- **pydantic-settings** — env config

### Environment Variables

```
SUPABASE_URL=           # https://xxx.supabase.co
SUPABASE_SERVICE_KEY=   # service_role key — NEVER the anon key
SUPABASE_JWT_SECRET=    # Project Settings → API → JWT Secret
```

**Rule:** Every protected endpoint uses `Depends(get_current_user)`. Every DB query filters by `user_id` even though the service key bypasses RLS (defence in depth).

### Router prefixes

| Router | Prefix |
|---|---|
| profile | `/api/v1/profile` |
| books | `/api/v1/books` |
| entries | `/api/v1/books` |
| reports | `/api/v1/books` |
| upload | `/api/v1/upload` |
| admin | `/api/v1/admin` |

---

## 7. Database (Supabase PostgreSQL)

Five tables: `profiles`, `books`, `entries`, `customers`/`suppliers`, `categories`.

**Local SQLite** (frontend only) also has a `deleted_entries` tombstone table — see Section 8 / Sync Rules.

Key invariants:
- `books.net_balance` is **auto-maintained** by the `trg_update_book_balance` trigger on `entries` — never compute it in application code
- `categories.total_in/out/net_balance` are **auto-maintained** by the `trg_update_category_balance` trigger on `entries` — never compute in application code
- `categories` are per-book; UNIQUE(book_id, name) prevents duplicates; `entries.category_id` FK → ON DELETE SET NULL (keeps `entries.category` text snapshot)
- `profiles.role` is either `'superadmin'` or `'user'`; set once by the `on_auth_user_created` trigger
- Backend uses service role key → bypasses RLS → must manually add `user_id` filter on every query
- RLS policies on `books` and `entries` use `auth.uid() = user_id` (last-resort safety net for direct client calls)

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

### Sync Rules (own books — manual upload only)
- `shouldBackupToCloud()` in `dataSource.js` always returns `false` — no write ever triggers an automatic cloud push
- The owner must go to Settings → Backup & Sync → "Upload to Cloud" to push any local change to the cloud
- `syncLocalToCloud()` in `syncManager.js` handles the full upload in 7 steps: books → delete orphan books → categories → customers → suppliers → payment modes → entries → **delete orphan entries (tombstones)**
- **Entry deletion tombstones:** `localDeleteEntry()` and `localDeleteAllEntries()` write a row to the `deleted_entries` SQLite table (`cloud_entry_id`, `cloud_book_id`, `deleted_at`) before removing the local row. Step 7 of `syncLocalToCloud()` reads these tombstones and calls `DELETE /api/v1/books/:id/entries/:eid` for each. Tombstones are cleared on success or 404; left in place on other errors (retried next sync). Works regardless of whether the owner was online or offline at delete time.

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

| Screen file | Route | Role | Status |
|---|---|---|---|
| `BooksScreen.jsx` | `/(app)/books` | user | ✅ Complete |
| `AdminBooksScreen.jsx` | `/(app)/dashboard/books` | superadmin | ✅ Complete |
| `AdminUsersScreen.jsx` | `/(app)/dashboard/users` | superadmin | ✅ Complete |
| `BookDetailScreen.jsx` | `/(app)/books/[id]` | both | ✅ Complete |
| `AddEntryScreen.jsx` | `/(app)/books/[id]/add-entry` | both | ✅ Complete |
| `EditEntryScreen.jsx` | `/(app)/books/[id]/edit-entry` | both | ✅ Complete |
| `EntryDetailScreen.jsx` | `/(app)/books/[id]/entry-detail` | both | ✅ Complete |
| `CategoryDetailScreen.jsx` | `/(app)/books/[id]/category-detail` | both | ✅ Complete |
| `ReportsScreen.jsx` | `/(app)/books/[id]/reports` | both | ✅ Skeleton |
| `BookSettingsScreen.jsx` | `/(app)/books/[id]/book-settings` | both | ✅ Complete |
| `SettingsScreen.jsx` | `/(app)/settings` | both | ✅ Complete |
| `ProfileScreen.jsx` | `/(app)/settings/profile` | both | ✅ Complete |
| `LoginScreen.jsx` | `/(auth)/login` | — | ✅ Complete |
| `DashboardScreen.jsx` | `/(app)/dashboard` | superadmin | Alias → AdminUsersScreen |

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
| Login / signup | Supabase Auth (Google OAuth, Email OTP) |
| Role assignment | Supabase trigger (first user = superadmin) |
| Book & entry data | Supabase database via FastAPI |
| Balance calculation | Supabase trigger (`trg_update_book_balance`) |
| Admin user management | FastAPI `/api/v1/admin/*` (superadmin only) |
| Receipts / photo attachments | Supabase Storage (`attachments` bucket); local `file:///` copy on device after upload or restore |
| Real-time admin user list | React Query polling (10 s interval) |
| Token storage | Expo SecureStore (native) / localStorage (web) |
| Entry deletion cloud sync | Tombstone log (`deleted_entries` SQLite table) — replayed during next manual "Upload to Cloud" |
| Cloud → device restore | `syncCloudToLocal()` — downloads entries + attachments; each entry linked to its cloud UUID via `cloud_entry_id` so re-upload never duplicates |
| Restore button availability | Live delta (`onlyInCloudEntries`, `newBooks`) — button stays active until all cloud data is locally present; no session flag can hide it |
