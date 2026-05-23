# Ultimate CashBook — CodeRabbit Audit Fix Tracker

Generated: 2026-05-13  
Auditor: CodeRabbit (coderabbit:code-reviewer agent)

---

## How to use
- [ ] = not started  
- [x] = fixed  
Fixes are applied directly to the codebase — each item links to the file and line(s) changed.

---

## CRITICAL

- [x] **C1 — N+1 in `GET /admin/users`** (`backend/app/routers/admin.py:62–101`)  
  5 DB queries per user (book_count, entry_count, 2× storage RPCs, assemble). Fires on every 10 s poll.  
  _Fix: Consolidated stats computation into a shared `_build_user_stats()` helper; book/entry counts use COUNT RPC-compatible pattern. Full SQL consolidation requires a new DB function (future migration)._

- [x] **C2 — JWKS cache never expires** (`backend/app/auth/jwt.py:9`)  
  Module-level dict set once, never invalidated — key rotation breaks auth permanently until process restart.  
  _Fix: Added TTL (1 hour) + re-fetch on verification failure._

- [x] **C3 — Blocking `httpx.get()` in async context** (`backend/app/auth/jwt.py:17`)  
  Sync HTTP call inside `async def get_current_user` blocks the event loop.  
  _Fix: Replaced with `httpx.AsyncClient` + `await`; made `_get_jwks()` async._

- [ ] **C4 — Supabase singleton has no reconnection logic** (`backend/app/db/supabase.py`)  
  A network blip permanently breaks DB access — no health check or reconnect.  
  _Fix needed: catch connection errors and rebuild client._

- [x] **C5 — Missing collaborator rights check on mutating entry endpoints** (`backend/app/routers/entries.py`)  
  A `view`-only collaborator can create, edit, and delete all entries.  
  _Fix: Added rights enforcement in `get_book_owner_id` — returns `(owner_id, rights)` tuple; each endpoint checks required level._

- [x] **C6 — Missing `user_id`/`book_id` filter on final SELECT in contacts.py** (`backend/app/routers/contacts.py:59,123`)  
  `update_customer` and `update_supplier` do the final read without scoping to the authenticated user.  
  _Fix: Added `.eq("user_id", owner_id).eq("book_id", book_id)` to both final SELECT calls._

- [ ] **C7 — Non-atomic notification fan-out** (`backend/app/routers/admin.py:261–296`)  
  Notification row inserted before recipients resolved — partial failure leaves orphaned notifications.  
  _Fix needed: wrap in a PostgreSQL function for atomicity._

---

## MAJOR

- [x] **M1 — Deprecated `@validator` in Pydantic V2** (`backend/app/models/entry.py:64–74`)  
  `@validator` removed in Pydantic V3. Use `@field_validator(mode='before')`.  
  _Fix: Replaced both `@validator` decorators with `@field_validator`._

- [x] **M2 — `CORS allow_origins=["*"]`** (`backend/app/main.py:10`)  
  Any website can make credentialed API calls. Should be restricted or env-configurable.  
  _Fix: Read `ALLOWED_ORIGINS` from settings; fallback to `["*"]` only when not set._

- [x] **M3 — Hardcoded `role: 'user'` in `resolveProfile` fallback** (`frontend/app/_layout.jsx:91`)  
  A superadmin offline gets redirected to books screen instead of dashboard.  
  _Fix: Fallback reads role from Supabase session metadata; defaults `'user'` only if truly unknown._

- [x] **M4 — Missing `customers` in `useEffect` deps in `BookDetailScreen`** (`frontend/src/screens/BookDetailScreen.jsx:332`)  
  Stale tab selection when customers load after the picker opens.  
  _Fix: Added `customers` and `suppliers` to the dependency array._

- [ ] **M5 — `_layout.jsx` auth listener `useEffect` has empty `[]` deps** (`frontend/app/_layout.jsx:102`)  
  Closes over `setUser`, `clearUser`, `setIsDark` — technically stale in strict mode.  
  _Low risk (Zustand setters are stable) — documented with a comment._

- [ ] **M6 — Admin notification insert before recipient resolution (TOCTOU)** (`backend/app/routers/admin.py:272–276`)  
  Users who register between insert and resolution are excluded from `target_type='all'`.  
  _Fix needed: resolve recipients before inserting notification row._

- [ ] **M7 — `get_books_with_summary` returns wrong columns if migration 016 not applied**  
  RPC silently succeeds but missing 4 boolean columns — Pydantic fills them as `False`.  
  _Fix needed: add migration guard or version check._

- [ ] **M8 — `transformOrigin` not supported in React Native StyleSheet**  
  Used in `AdminUsersScreen.jsx`, `BooksView.jsx`, `SortSheet.jsx` — silently ignored on native.  
  _Fix needed: replace with manual `translate` transforms._

---

## MINOR

- [x] **m1 — Missing `await` on 4 delete functions in `api.js`** (`frontend/src/lib/api.js:191,218,241,264`)  
  `apiDeleteCustomer`, `apiDeleteSupplier`, `apiDeleteCategory`, `apiDeletePaymentMode` return unresolved Promises.  
  _Fix: Added `await` + `.data` to all four._

- [ ] **m2 — Attachment signed URLs expire after 7 days with no refresh** (`backend/app/routers/upload.py:13`)  
  Old entries show broken images. No mechanism to regenerate.  
  _Fix needed: add `GET /upload/attachment-url?path=...` refresh endpoint._

- [x] **m3 — Push error silently discarded** (`backend/app/routers/admin.py:44`)  
  `except Exception: pass` swallows all push delivery errors including dead tokens.  
  _Fix: Added `logger.warning()` so failures are visible in logs._

- [x] **m4 — N+1 in `list_sent_notifications`** (`backend/app/routers/admin.py:312–322`)  
  Separate `COUNT` per notification. 51 queries for 50 notifications.  
  _Fix: Single `GROUP BY` aggregation query replaces the loop._

- [ ] **m5 — `useContacts` always fires both customer and supplier queries** (`frontend/src/hooks/useContacts.js`)  
  Doubles network traffic regardless of `type` param.  
  _Fix needed: use `enabled` flag to skip the unused query._

- [ ] **m6 — Duplicate icon definitions across multiple screens**  
  `SunIcon`, `MoonIcon`, `BookIcon`, `GearIcon` defined in multiple files.  
  _Fix needed: move to `src/components/ui/Icons.jsx`._

- [ ] **m7 — `payment_mode` case inconsistency (`'cash'` vs `'Cash'`)**  
  Old entries have lowercase; `PAYMENT_LABEL` map in `BookDetailScreen` only matches lowercase.  
  _Fix needed: data migration + normalise map to handle both cases._

- [ ] **m8 — Missing index on `user_notifications(notification_id)`** (`supabase/migrations/018`)  
  Count queries for admin notification list do full scans.  
  _Fix needed: new migration adding the index._

- [ ] **m9 — `bookFieldsStore.js` is an empty stub**  
  Dead code in the store layer.  
  _Fix needed: delete file and remove all imports._

- [ ] **m10 — `update_payment_mode_balance` trigger missing `security definer`** (`supabase/migrations/017`)  
  Inconsistency with all other balance triggers.  
  _Fix needed: new migration to alter the function._

---

## RECOMMENDATIONS (architectural, no urgent fix needed)

- [ ] **R1** — Create `get_all_user_stats()` PostgreSQL function to eliminate admin N+1 entirely
- [ ] **R2** — Add `payment_mode_id` index on `entries` for payment mode balance queries  
- [ ] **R3** — Add `slowapi` rate limiting to `/profile/search`, `/upload/attachment`, `/upload/avatar`
- [ ] **R4** — Consolidate `pdf_report` and `excel_report` handlers into shared helper
- [ ] **R5** — Add `staleTime: 2min` to contact queries in `useContacts.js`

---

_Last updated: 2026-05-13_
