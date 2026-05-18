# CashBook — Subscription Plan & Remaining Development Roadmap

> **This is the single source of truth** for what the subscription system looks like and what remains to be built before launch.
> Plans are finalized. Sequence below is the order of implementation.

---

## Finalized Subscription Plans

### Feature Matrix

| Feature | Free | Pro | Business |
|---|---|---|---|
| Books | 3 | 15 | Unlimited |
| Entries | Unlimited | Unlimited | Unlimited |
| Storage | Local only | Cloud sync | Cloud sync |
| Multi-device | No | Yes | Yes |
| PDF / Excel Export | No | Yes | Yes |
| Customers & Suppliers | Full access | Full access | Full access |
| Categories | Full access | Full access | Full access |
| Reports | View only (no download / share) | Full access | Full access |
| Shared Books (Team) | No | Yes | Yes |
| Backup History | No | 7 days | 30 days |
| Guest Access | No | 1 guest (View / Edit / Full) | Up to 10 guests (View / Edit / Full — owner sets per guest) |
| Receive Shared Access | Yes (cloud for shared books only — own books stay local) | Yes | Yes |

### Pricing

| Plan | Monthly | Yearly | Yearly Savings |
|---|---|---|---|
| Free | $0 | $0 | — |
| Pro | $4.99 / mo | $41.99 / yr | 30% off |
| Business | $9.99 / mo | $83.99 / yr | 30% off |

### Guest Access Permission Levels (Pro: 1 guest · Business: up to 10 guests)

| Permission | View entries | Add entries | Edit / Delete | Manage books & categories |
|---|---|---|---|---|
| View only | Yes | No | No | No |
| Edit | Yes | Yes | Yes | No |
| Full | Yes | Yes | Yes | Yes |

---

## What Is Already Complete

| Area | Status |
|---|---|
| Login (Google OAuth + Email OTP) | Done |
| Books CRUD (create, rename, delete, sort, drag reorder) | Done |
| Book Detail Screen (entries list, filters, balance) | Done |
| Add / Edit / Delete Entry | Done |
| Entry Detail Screen | Done |
| Category system (CRUD, profile, balance) | Done |
| Customers & Suppliers (CRUD, contact picker) | Done |
| Reports (view, bar chart, PDF export, Excel export) | Done |
| Book Settings (field visibility, categories, contacts, payment modes) | Done |
| Settings Screen | Done |
| Profile Screen (name, avatar, phone) | Done |
| Admin Dashboard (users, books, status toggle) | Done |
| Real-time sync for collaborator sharing (hooks) | Done |
| Theme (dark / light toggle) | Done |

---

## What Remains — In Sequence

Work through these phases **in order**. Do not start a later phase before the previous is complete.

---

### Phase 1 — Local SQLite Database (Free Tier Foundation)

The free tier stores all data on-device only. This requires a local database layer.

- [ ] Install `expo-sqlite` and create a local DB schema mirroring the Supabase tables:
  `books`, `entries`, `categories`, `customers`, `suppliers`
- [ ] Build a **data source abstraction layer**: every read/write call goes through a router that checks the user's tier — free users hit SQLite, paid users hit the API
- [ ] Implement local CRUD for: books, entries, categories, customers, suppliers
- [ ] Net balance calculation done locally (no trigger — computed from entries sum)
- [ ] Show a persistent banner on the Books screen for free users:
  *"Your data is stored only on this device. Upgrade to back it up to the cloud."*
- [ ] When a free user upgrades, **migrate local data to cloud** automatically:
  - Prompt: *"We found data on this device. Upload it to your new account?"*
  - On confirm: call `POST /api/v1/migrate/offline` with all local books + entries
  - On success: local SQLite becomes read-only cache; Supabase becomes source of truth

---

### Phase 2 — Subscription Data Model

- [ ] **Supabase migration:** add these columns to `profiles`:

  | Column | Type | Values |
  |---|---|---|
  | `subscription_tier` | text | `FREE` / `PRO` / `BUSINESS` |
  | `subscription_status` | text | `active` / `expired` / `cancelled` |
  | `billing_cycle` | text | `monthly` / `yearly` / `none` |
  | `subscribed_at` | timestamp | Date of first paid subscription |
  | `expires_at` | timestamp | End of current billing period |
  | `revenuecat_user_id` | text | Links profile to RevenueCat |

- [ ] **Backend:** add `subscription_tier` and `subscription_status` to the profile response model
- [ ] **Frontend:** add `subscription_tier`, `subscription_status`, `expires_at` to `authStore`
- [ ] Store `subscription_tier` in `expo-secure-store` locally so gates work offline

---

### Phase 3 — RevenueCat Integration

RevenueCat handles all billing for both App Store (iOS) and Google Play (Android).

- [ ] Create RevenueCat account and project
- [ ] Configure entitlements in RevenueCat dashboard:
  - `pro` entitlement → Pro plan
  - `business` entitlement → Business plan
- [ ] Set up products in **App Store Connect**:
  - `cashbook_pro_monthly` — $4.99 / month
  - `cashbook_pro_yearly` — $41.99 / year
  - `cashbook_business_monthly` — $9.99 / month
  - `cashbook_business_yearly` — $83.99 / year
- [ ] Mirror the same 4 products in **Google Play Console**
- [ ] Install `react-native-purchases` (RevenueCat SDK) in the frontend
- [ ] On login: identify the user in RevenueCat with their Supabase user ID
- [ ] **Backend webhook:** `POST /api/v1/webhooks/revenuecat`
  - On `INITIAL_PURCHASE` or `RENEWAL` → update `subscription_tier`, `subscription_status`, `expires_at` in Supabase
  - On `CANCELLATION` or `EXPIRATION` → downgrade tier to `FREE`
- [ ] Add migration: `POST /api/v1/migrate/offline` endpoint for local→cloud data upload

---

### Phase 3b — Testing Strategy (Local vs Cloud)

Use this throughout all phases to test both tiers without real purchases.

#### During Development (no RevenueCat needed)

Add a **dev-only tier switcher** row to SettingsScreen, visible only when `__DEV__ === true`:

- Renders a row: *"Dev: Switch Tier → Free / Pro / Business"*
- Tapping an option writes `subscription_tier` to `authStore` and `expo-secure-store`
- `canAccess()` reads from `authStore` → all gates and paywalls reflect the change instantly
- No backend call, no purchase, works fully offline
- Automatically hidden in production builds (`__DEV__` is `false` in EAS production)

This lets you flip between all 3 tiers in seconds to test every gate and paywall screen during Phases 4–7.

#### During Store Testing (after RevenueCat is integrated)

| Platform | How to test purchases for free |
|---|---|
| iOS | Create a **Sandbox Apple ID** in App Store Connect — makes real purchases for $0 in TestFlight / Simulator |
| Android | Add your account as a **License Tester** in Google Play Console — purchases go through with no real charge |

RevenueCat's own dashboard lets you simulate subscription renewals, cancellations, and expirations on any sandbox purchase — use this to test the webhook and tier downgrade flows.

#### Recommended Testing Order

1. Dev tier switcher → test all gates and paywall UI (Phases 4–7)
2. RevenueCat sandbox → test the actual purchase and webhook flow (Phase 3)
3. TestFlight / Play Internal Testing → full end-to-end before public release (Phase 9)

---

### Phase 4 — Feature Gates, Crown Badge & Paywall UI

**Golden rule for this phase:** existing code must run exactly as before for every paid user. Only the behavior for under-tier users changes. Never hide a gated element — always render it, add the crown badge, and intercept the press.

---

#### 4.1 — `canAccess(feature)` Utility

**File:** `frontend/src/lib/subscriptionGate.js` _(new file)_

Reads `subscription_tier` from `authStore` synchronously — no network call, no async. Returns `true` (allowed) or `false` (blocked). Also exports `bookLimit(tier)` → `3 | 15 | Infinity`.

| Feature key | FREE | PRO | BUSINESS |
|---|---|---|---|
| `add_book` | ❌ if books ≥ 3 | ❌ if books ≥ 15 | ✅ unlimited |
| `export_pdf_excel` | ❌ | ✅ | ✅ |
| `reports_download_share` | ❌ | ✅ | ✅ |
| `shared_books` | ❌ | ✅ | ✅ |
| `backup_history` | ❌ | ✅ (7 days) | ✅ (30 days) |
| `guest_access` | ❌ | ✅ 1 guest | ✅ up to 10 |
| `manage_access` | ❌ | ✅ (1 guest limit) | ✅ (10 guest limit) |

**Note:** Customers & Suppliers and Categories are fully available (add/edit/delete) on all tiers including Free. These are local-data features — no gate applies.

`add_book` takes `bookCount` as a second argument:
```js
canAccess('add_book', books.length)  // returns false when limit reached for tier
```

---

#### 4.2 — `CrownBadge` Reusable Component

**File:** `frontend/src/components/ui/CrownBadge.jsx` _(new file)_

A small visual badge placed on or next to any gated UI element. It never handles touch — the parent element intercepts the press and opens the `PaywallSheet`.

**Props:**
| Prop | Type | Values | Notes |
|---|---|---|---|
| `tier` | string | `'pro'` \| `'business'` | Controls color + icon |
| `size` | string | `'sm'` (default) \| `'md'` | `sm` = 16×16, `md` = 22×22 |
| `style` | object | — | Extra style on the wrapper |

**Visual spec:**
- Icon: `MaterialCommunityIcons` `crown` — already a dep via react-native-vector-icons
- Pro badge: amber/gold fill `#F59E0B`, white crown icon
- Business badge: purple fill `#7C3AED`, white crown icon
- Shape: circle with `borderRadius: size/2`, background color, 1px white border (so it pops on any bg)
- `sm` (16px): icon size 10; used for FAB overlay and toggle row
- `md` (22px): icon size 14; used for button overlays and navigation rows

**Usage variants (all via the same component):**

| Variant | How to position |
|---|---|
| FAB corner overlay | Wrap FAB in `<View style={{ position:'relative' }}>`, render `<CrownBadge tier="pro" style={{ position:'absolute', top:-4, right:-4 }} />` |
| Export / action button overlay | Same pattern — absolute top-right on button wrapper |
| Settings row right-side inline | Render `<CrownBadge tier="pro" />` to the left of the row's right arrow, replacing the arrow |
| Toggle switch next to label | Render `<CrownBadge tier="pro" size="sm" />` to the right of the label; Switch rendered with `disabled={true}` + 40% opacity |

---

#### 4.3 — `PaywallSheet` Reusable Component

**File:** `frontend/src/components/ui/PaywallSheet.jsx` _(new file)_

Follows the exact bottom-sheet pattern already used in `DeleteAllEntriesSheet.jsx` (handle bar, rounded top, keyboard-aware, `C.overlay` backdrop).

**Props:**
| Prop | Type | Notes |
|---|---|---|
| `visible` | bool | Controls sheet open/close |
| `onClose` | fn | Called on "Maybe Later" or backdrop tap |
| `requiredTier` | `'pro'` \| `'business'` | Controls copy and crown color |
| `featureLabel` | string | e.g. `'PDF & Excel Export'`, `'Guest Access'` |

**Layout (top → bottom inside sheet):**
1. Handle bar (36×4, `C.border` color, centered)
2. Large crown icon — 52×52 circle, amber bg for Pro / purple bg for Business, white crown 28px
3. Heading: `"Upgrade to Pro"` / `"Upgrade to Business"` — `Font.bold`, 18px, `C.text`
4. Subtext: `"Unlock [featureLabel] and more"` — `Font.regular`, 13px, `C.subtext`
5. 3 bullet rows (Feather check icon `C.cashIn`, 13px text) — showing the top 3 benefits of the required tier (hardcoded per tier, not dynamic)
6. Primary CTA button: `"See Plans"` — full width, `C.primary` bg, `C.onPrimary` text → `router.push('/(app)/settings/plans')`
7. Secondary: `"Maybe Later"` — plain text link, `C.subtext`, centered → `onClose()`

---

#### 4.4 — Touch Point Implementation Map

Every element below must: (a) always render, (b) show `CrownBadge`, (c) intercept press → `PaywallSheet` when tier is insufficient. Existing behavior for allowed tiers is untouched.

---

**`frontend/src/components/books/BooksView.jsx`**

| Element | Current behavior | Gate condition | Crown placement | PaywallSheet tier |
|---|---|---|---|---|
| FAB "+" (personal workspace) | Opens "Add New Book" modal | Free AND `books.length >= 3`; OR Pro AND `books.length >= 15` | `CrownBadge size="sm"` overlaid top-right on FAB circle | `'pro'` (if Free) or `'business'` (if Pro at limit) |

Implementation notes:
- FAB is at line ~797 in `BooksView.jsx` (`onPress={() => setShowModal(true)}`)
- Wrap press handler: `if (!canAccess('add_book', books.length)) { setPaywall({ visible: true, tier: ..., label: 'More Books' }); return; }`
- `CrownBadge` renders conditionally only when `!canAccess('add_book', books.length)` — hidden for users within their limit
- State: add `const [paywallConfig, setPaywall] = useState(null)` + render `<PaywallSheet>` at bottom of component

---

**`frontend/src/screens/ReportsScreen.jsx`**

All 8 gated elements below share the same gate: `canAccess('export_pdf_excel')` and `canAccess('reports_download_share')`.

| Element | Current location | Crown placement |
|---|---|---|
| Header PDF button | ~line 765 | `CrownBadge size="sm"` top-right overlay on button wrapper |
| Header XLS button | ~line 772 | same |
| Export section "Export as PDF" card | ~line 925 | `CrownBadge size="md"` top-right on card |
| Export section "Export as Excel" card | ~line 942 | same |
| Preview modal Download button | ~line 714 | `CrownBadge size="sm"` overlay |
| Preview modal Share button | ~line 718 | `CrownBadge size="sm"` overlay |
| Preview header Download icon | ~line 597 | `CrownBadge size="sm"` overlay on icon wrapper |
| Preview header Share icon | ~line 600 | `CrownBadge size="sm"` overlay on icon wrapper |

Implementation notes:
- `featureLabel` for PaywallSheet: `'PDF & Excel Export'`
- "Preview Report" button (`setShowPreview(true)`) is **NOT gated** — free users can view the report on screen
- Add single `paywallVisible` state; all 8 buttons funnel to the same `PaywallSheet` instance

---

**`frontend/src/screens/BookSettingsScreen.jsx`**

| Element | Current behavior | Gate | Crown placement | PaywallSheet label |
|---|---|---|---|---|
| Customers toggle (Switch) | Toggles `show_customer` field | ✅ No gate — free on all tiers | — | — |
| Suppliers toggle (Switch) | Toggles `show_supplier` field | ✅ No gate — free on all tiers | — | — |
| Categories toggle (Switch) | Toggles `show_category` field | ✅ No gate — free on all tiers | — | — |
| Customers row (navigate) | → `ContactsListScreen` | ✅ No gate — free on all tiers | — | — |
| Suppliers row (navigate) | → `ContactsListScreen` | ✅ No gate — free on all tiers | — | — |
| Categories row (navigate) | → `CategoriesSettingsScreen` | ✅ No gate — free on all tiers | — | — |
| Manage Access row | → `ManageSharesScreen` | `canAccess('manage_access')` — Pro+ (FREE blocked) | `CrownBadge tier="pro" size="sm"` replacing right arrow | `'Guest Access & Sharing'` |

Implementation notes:
- Only the Manage Access row is gated in this screen (for Free users)
- Pro users can navigate in; the ManageSharesScreen itself enforces the 1-guest limit
- Gated row: keep rendered, swap right-side Feather `chevron-right` to `<CrownBadge tier="pro">`, intercept `onPress` → `PaywallSheet`

---

**`frontend/src/screens/SettingsScreen.jsx`**

| Element | Gate | Crown placement | PaywallSheet label |
|---|---|---|---|
| "Manage Access" row | `canAccess('manage_access')` — Pro+ (FREE blocked) | `CrownBadge tier="pro" size="sm"` replacing right chevron | `'Guest Access & Sharing'` |
| "Backup & Sync" row | `canAccess('backup_history')` — Pro+ | `CrownBadge tier="pro" size="sm"` replacing right chevron | `'Backup & Sync'` |

---

**`frontend/src/screens/BookDetailScreen.jsx`**

| Element | Gate | Crown placement | PaywallSheet label |
|---|---|---|---|
| "Manage Shares" icon (header, ~line 567) | `canAccess('manage_access')` — Pro+ (FREE blocked) | `CrownBadge tier="pro" size="sm"` overlaid top-right on icon button | `'Guest Access & Sharing'` |

---

**`frontend/src/screens/CategoriesSettingsScreen.jsx`**

No subscription gates apply. Free users have full CRUD on categories.

---

**`frontend/src/screens/ContactsListScreen.jsx`** (both customers and suppliers)

No subscription gates apply. Free users have full CRUD on customers and suppliers.

---

#### 4.5 — Behavioral Rules (Non-Negotiable)

1. **Never hide gated elements.** The crown badge is the signal. Hiding breaks UX and discoverability of upgrade prompts.
2. **Existing paid-tier behavior is 100% unchanged.** The gate check is a no-op for users within their tier.
3. **Free-tier viewing is always allowed.** Navigating to Reports, viewing report data, viewing categories/contacts — all free. Only write actions and exports are gated.
4. **Crown badge is conditional.** Only render `<CrownBadge>` when `!canAccess(...)`. Do not show it for users who have access.
5. **One `PaywallSheet` instance per screen.** Use a single `paywallConfig` state `{ visible, tier, label }` and one `<PaywallSheet>` at the bottom of the JSX tree.
6. **No backend calls change in this phase.** Gate logic is client-only. Backend enforcement is added in Phase 4b below.
7. **Dev tier switcher (Phase 3b) must be implemented before wiring gates**, so all tiers can be tested without real purchases.

---

#### 4.6 — Phase 4b: Backend Enforcement (Defence in Depth)

Added to backend **after** Phase 4 frontend is complete. Never trust the client alone.

- [ ] `POST /api/v1/books` — read `profiles.subscription_tier` for the requesting user; compare `books` count to `3` (FREE) / `15` (PRO); return `HTTP 403 {"detail": "Book limit reached for your plan. Upgrade to add more."}` if exceeded
- [ ] Export endpoints (`GET /api/v1/books/:id/report/pdf` and `.../report/excel`) — check tier is `PRO` or `BUSINESS`; return `HTTP 403` if `FREE`
- [ ] Share endpoints (`POST /api/v1/books/:id/shares`) — check tier is `PRO` or `BUSINESS`; return `HTTP 403` if `FREE`
- [ ] Frontend already handles `403` responses from Axios interceptor with an `Alert` — no new error handling needed for backend rejections

---

### Phase 5 — Plans & Upgrade Screen

- [ ] Build `PlansScreen` (accessible from `PaywallSheet` and Settings):
  - Toggle: Monthly / Yearly (yearly shows "30% off" badge)
  - 3 plan cards: Free · Pro · Business with feature list per plan
  - "Current plan" badge on active plan
  - "Subscribe" / "Upgrade" button per plan → triggers RevenueCat purchase flow
  - Restore Purchases link (required by App Store rules)
- [ ] Add **Subscription row** to SettingsScreen under Account section:
  - Shows: current plan + renewal date
  - Tap → `PlansScreen`
- [ ] On successful purchase:
  - RevenueCat webhook fires → backend updates Supabase
  - Frontend polls or listens for `authStore` update → UI refreshes instantly

---

### Phase 6 — Guest Access (Business Feature)

- [ ] **Database migration:** create `book_guests` table:

  | Column | Type | Notes |
  |---|---|---|
  | `id` | uuid | PK |
  | `book_id` | uuid | FK → books |
  | `owner_id` | uuid | FK → profiles (the Business user) |
  | `guest_user_id` | uuid | FK → profiles (the invitee) |
  | `permission` | text | `view` / `edit` / `full` |
  | `invited_at` | timestamp | |
  | `accepted_at` | timestamp | null until accepted |

- [ ] **Backend endpoints:**
  - `POST /api/v1/books/:id/guests` — invite a guest by email
  - `GET /api/v1/books/:id/guests` — list all guests for a book
  - `PATCH /api/v1/books/:id/guests/:guest_id` — change permission level
  - `DELETE /api/v1/books/:id/guests/:guest_id` — remove guest
  - `GET /api/v1/me/shared-books` — list books shared with the logged-in user

- [ ] **Frontend — Book Settings → Guests tab** (Business plan only):
  - List of invited guests with their permission level
  - Change permission dropdown per guest (View / Edit / Full)
  - Remove guest button
  - "+ Invite Guest" → enter email → send invite
  - Shows remaining guest slots (e.g. "7 of 10 used")

- [ ] **Guest experience:**
  - Guest receives email invite (Supabase email or custom)
  - On login, guest sees a "Shared Books" section on their BooksScreen
  - Guest can access the owner's cloud books per their permission level
  - Guest's own books remain local (Free tier) unless they have their own subscription

- [ ] **Free-tier guest — hybrid access model:**

  When a Business/Pro owner shares a book with a free-tier user, that user enters a **hybrid state**:

  | Area | Storage | Behavior |
  |---|---|---|
  | Guest's own books | Local SQLite only | Unchanged — free-tier rules still apply (≤3 books, no cloud sync) |
  | Shared book(s) from owner | Cloud (owner's Supabase) | Full cloud access scoped to those books only |

  Implementation notes:
  - The data source abstraction layer (Phase 1) must route shared books to the API, not SQLite, regardless of the guest's own tier
  - Identify shared books in the data router by checking `sharedBooks` from `GET /api/v1/me/shared-books` — these always use the API path
  - The free-tier "local-only" banner must **not** appear on shared books
  - No paywall is shown for shared book actions (add entry, export, etc.) — the owner's tier grants those features; the backend enforces this by checking the book owner's tier, not the guest's tier
  - If the owner downgrades or removes the guest, the shared book disappears from the guest's "Shared Books" section; their own local books are unaffected

- [ ] Enforce guest limits per tier on both backend and frontend:
  - Pro: max 1 guest per book
  - Business: max 10 guests per account

---

### Phase 7 — Backup History

- [ ] **Backend:**
  - Pro: expose last 7 days of entry history with restore option
  - Business: expose last 30 days
  - `GET /api/v1/books/:id/backups` — list available restore points
  - `POST /api/v1/books/:id/backups/restore` — restore to a specific point

- [ ] **Frontend — Backup & Sync screen** (Settings → Backup & Sync):
  - Currently a TODO row in SettingsScreen — implement it
  - Shows last backup time
  - List of restore points (7 or 30 days depending on plan)
  - "Restore" button per restore point with confirmation sheet
  - Free users see locked state + upgrade prompt

---

### Phase 8 — Remaining Incomplete Screens

These screens exist but are skeleton / TODO:

- [ ] **BusinessSettingsScreen** (`/(app)/settings/business`):
  - Business name, address, logo, tax number
  - Used for PDF report headers
  - `PUT /api/v1/profile/business` endpoint

- [ ] **CurrencyScreen** (`/(app)/settings/currency`):
  - List of currencies with symbol and name
  - Selected currency stored in profile
  - Applied to all amount displays app-wide

- [ ] **SettingsScreen — Support rows** (currently no-op):
  - **Help & FAQ** → in-app FAQ screen or link to web page
  - **Rate the App** → `expo-store-review` (native rating prompt)
  - **Share App** → `expo-sharing` share sheet with store link

- [ ] **EntryDetailScreen — Backup Entry** (currently TODO in ⋮ menu):
  - Export single entry as PDF or share as text
  - Gate: export requires Pro / Business

---

### Phase 9 — App Store & Play Store Launch Prep

- [ ] Configure **EAS Build** (`eas.json`) for production builds
- [ ] Set app version, bundle ID, package name
- [ ] Create app icons (all required sizes for iOS + Android)
- [ ] Create splash screens
- [ ] Write **App Store listing**:
  - App name, subtitle, description, keywords
  - 6.7" and 5.5" iPhone screenshots
  - iPad screenshots (if supporting iPad)
- [ ] Write **Google Play listing**:
  - Short + full description, feature graphic
  - Phone screenshots (multiple aspect ratios)
- [ ] Privacy Policy page (required by both stores) — describes what data is collected
- [ ] Terms of Service page
- [ ] Submit for **TestFlight** (iOS beta) before public release
- [ ] Submit for **Google Play Internal Testing** before public release
- [ ] Submit for App Store review + Google Play review

---

## Summary — Remaining Work at a Glance

| Phase | What | Complexity |
|---|---|---|
| 1 | Local SQLite for free tier + offline → cloud migration | High |
| 2 | Subscription data model (Supabase + backend + authStore) | Low |
| 3 | RevenueCat setup + webhook + store products | Medium |
| 3b | Dev-only tier switcher in Settings for local testing | Low |
| 4 | `canAccess()` utility + `CrownBadge` + `PaywallSheet` + wire all 12 touch points | Medium |
| 4b | Backend enforcement (403 on book limit + export + share endpoints) | Low |
| 5 | Plans screen + upgrade flow + subscription row in Settings | Medium |
| 6 | Guest access (DB migration, backend endpoints, frontend ManageShares UI; Pro=1, Business=10) | High |
| 7 | Backup history (backend + Backup & Sync settings screen) | Medium |
| 8 | Remaining skeleton screens (Business settings, Currency, Help, Rate, EntryDetail export) | Low |
| 9 | App Store + Play Store launch prep (icons, listings, TestFlight) | Medium |
