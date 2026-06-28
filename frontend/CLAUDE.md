# CLAUDE.md — Frontend (cashbook/frontend)

> **Auto-update rule:** Whenever any file inside `frontend/` is edited (screen, component, hook, store, lib), re-read that file and update the matching section in this file before finishing the task.

---

## Folder Structure

```
frontend/
├── app/                          # Expo Router file-based routes
│   ├── _layout.jsx               # Root layout: fonts, QueryClient, AuthGuard, Toast
│   ├── index.jsx                 # Splash / onboarding redirect
│   ├── (auth)/
│   │   ├── _layout.jsx           # Auth stack (no tab bar)
│   │   └── login.jsx             # → LoginScreen
│   └── (app)/
│       ├── _layout.jsx           # App layout (Stack, no header)
│       ├── books/
│       │   ├── index.jsx                         # → BooksScreen
│       │   ├── [id].jsx                          # → BookDetailScreen
│       │   └── [id]/
│       │       ├── add-entry.jsx                 # → AddEntryScreen
│       │       ├── edit-entry.jsx                # → EditEntryScreen
│       │       ├── entry-detail.jsx              # → EntryDetailScreen
│       │       ├── reports.jsx                   # → ReportsScreen
│       │       ├── book-settings.jsx             # → BookSettingsScreen
│       │       ├── manage-shares.jsx             # → ManageSharesScreen
│       │       ├── add-collaborator.jsx          # → AddCollaboratorScreen
│       │       ├── categories-settings.jsx       # → CategoriesSettingsScreen
│       │       ├── category-detail.jsx           # → CategoryDetailScreen (entries list)
│       │       ├── category-profile.jsx          # → CategoryProfileScreen (detail/edit/delete)
│       │       ├── contact-settings.jsx          # → ContactSettingsScreen
│       │       ├── payment-mode-settings.jsx     # → PaymentModeSettingsScreen
│       │       ├── customers.jsx                 # → ContactsListScreen (type=customer)
│       │       ├── suppliers.jsx                 # → ContactsListScreen (type=supplier)
│       │       ├── contact-detail.jsx            # → ContactDetailScreen
│       │       └── contact-balance.jsx           # → ContactBalanceScreen
│       ├── dashboard/
│       │   ├── _layout.jsx       # Tabs layout (Users | My Books | Settings)
│       │   ├── users.jsx         # → AdminUsersScreen  (superadmin only)
│       │   ├── books.jsx         # → AdminBooksScreen  (superadmin only)
│       │   ├── settings.jsx      # → SettingsScreen    (reused)
│       │   ├── index.jsx         # href: null (redirected by _layout)
│       │   └── books/
│       │       ├── _layout.jsx                       # Stack (admin books sub-nav)
│       │       ├── index.jsx                         # → AdminBooksScreen
│       │       └── [id]/
│       │           ├── _layout.jsx                   # Stack
│       │           ├── add-entry.jsx                 # → AddEntryScreen
│       │           ├── edit-entry.jsx                # → EditEntryScreen
│       │           ├── entry-detail.jsx              # → EntryDetailScreen
│       │           ├── reports.jsx                   # → ReportsScreen
│       │           ├── book-settings.jsx             # → BookSettingsScreen
│       │           ├── categories-settings.jsx       # → CategoriesSettingsScreen
│       │           ├── category-detail.jsx           # → CategoryDetailScreen
│       │           ├── contact-settings.jsx          # → ContactSettingsScreen
│       │           ├── payment-mode-settings.jsx     # → PaymentModeSettingsScreen
│       │           ├── payment-mode-detail.jsx       # → PaymentModeDetailScreen
│       │           └── payment-mode-balance.jsx      # → PaymentModeBalanceScreen
│       └── settings/
│           ├── index.jsx         # → SettingsScreen
│           ├── profile.jsx       # → ProfileScreen
│           ├── currency.jsx      # → CurrencyScreen
│           ├── manage-access.jsx # → ManageAccessScreen
│           ├── subscription.jsx  # → SubscriptionScreen
│           ├── privacy-policy.jsx # → PrivacyPolicyScreen
├── src/
│   ├── screens/                  # All screen components (one file = one screen)
│   ├── components/
│   │   ├── books/
│   │   │   ├── BookMenu.jsx      # Bottom-sheet action menu for a book (delete)
│   │   │   ├── DraggableList.jsx # Custom drag-reorder list for books
│   │   │   └── SortSheet.jsx     # Sort-mode picker bottom sheet
│   │   ├── entry/
│   │   │   ├── EntryForm.jsx         # Shared form for add/edit entry (see EntryForm section below)
│   │   │   ├── ContactPickerModal.jsx # Bottom sheet: search customers/suppliers, create new, import from phone
│   │   │   └── CategoryPickerModal.jsx # Bottom sheet: select or create a category for an entry
│   │   ├── notifications/
│   │   │   └── NotificationInbox.jsx # Shared inbox used by NotificationsScreen + AdminNotificationsInboxScreen
│   │   └── ui/
│   │       ├── Input.jsx
│   │       ├── Icons.jsx
│   │       ├── CrownBadge.jsx         # Inline tier badge (👑 Pro / Enterprise) for locked features
│   │       ├── DatePickerModal.jsx
│   │       ├── TimePickerModal.jsx
│   │       ├── SyncConfirmSheet.jsx   # Confirm upload local → cloud
│   │       ├── ClearLocalDataSheet.jsx # Confirm clear local data (cloud unaffected)
│   │       ├── RestoreOrFreshSheet.jsx # Restore-or-Later sheet (launch + BackupSyncScreen)
│   │       ├── FreshStartSheet.jsx    # 2-step confirm: delete all cloud + local data
│   │       └── LimitReachedSheet.jsx  # Plan-limit notification sheet (books & shares); props: visible, onDismiss, limitType ('books'|'shares'), currentLimit, currentTier
│   ├── hooks/
│   │   ├── useBooks.js           # useBooks, useCreateBook, useDeleteBook (React Query)
│   │   ├── useBookSort.js        # Sort state + sorted list derivation
│   │   ├── useCategories.js      # useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory, useCategoryEntries, useReorderCategories
│   │   ├── useContacts.js        # useCustomers/Suppliers, useCreateContact, useDeleteContact, useReorderCustomers, useReorderSuppliers, useReorderContacts, etc.
│   │   ├── useProfile.js         # useProfile, useUpdateProfile
│   │   ├── useSharing.js         # useSharedBooks, useBookShares, useAddCollaborator, useUpdateShare, useRemoveCollaborator, useRemoveShareByOwner, useLeaveSharedBook, useReceivedInvitations, useGivenInvitations, useRespondToInvitation
│   │   └── useTheme.js           # Returns { C, Font, isDark, toggleTheme }
│   ├── lib/
│   │   ├── api.js                # All Axios API calls (real backend, no mocks)
│   │   ├── canAccess.js          # Feature-gate: canAccess(user, feature), getLimit(user, feature) — superadmin always returns true/Infinity
│   │   ├── dataSource.js         # Data-source router: own books → local SQLite only (no background cloud push — manual upload only via BackupSyncScreen); shared books → cloud API directly (via isLocalBook() check). Entry update/delete use cloud_entry_id for correct cloud targeting.
│   │   ├── supabase.js           # Supabase client (SecureStore / localStorage adapter)
│   │   ├── storage.js            # Provider-agnostic attachment abstraction (uploadAttachment, removeAttachment) — superadmin always uses Supabase Storage
│   │   └── toast.js              # Toast helper
│   ├── store/
│   │   ├── authStore.js          # Zustand: user, session, setUser, clearUser
│   │   ├── themeStore.js         # Zustand: isDark, toggle
│   │   ├── bookFieldsStore.js    # Zustand: per-book field visibility toggles
│   │   └── syncStore.js          # Zustand: isOnline, isSyncing, isRestoring, progress, restoreProgress, lastSyncedAt; actions: startSync, finishSync, failSync, stampLastSynced (timestamp-only, never resets isSyncing), startRestore, finishRestore, failRestore
│   └── constants/
│       ├── colors.js             # LightColors, DarkColors, CARD_ACCENTS
│       ├── currencies.js         # CURRENCIES list (160+ ISO 4217), getCurrency(code) helper
│       ├── fonts.js              # Font.regular/medium/semiBold/bold/extraBold
│       ├── categories.js         # Default category list
│       └── shadows.js            # Shadow presets
```

---

## Tech Stack

| Concern | Library |
|---|---|
| Framework | React Native + Expo SDK 51 (JavaScript) |
| Routing | Expo Router v3 (file-based) |
| Server state | TanStack React Query v5 |
| Global state | Zustand v4 |
| HTTP | Axios (+ Supabase client for auth) |
| Auth | Supabase Auth (Google OAuth + Email OTP) |
| Token storage | Expo SecureStore (native) / localStorage (web) |
| Fonts | @expo-google-fonts/inter |
| Date/time pickers | react-native-modal-datetime-picker |

---

## Auth & Navigation Logic

### Root Layout (`app/_layout.jsx`)
- Loads Inter 400/500/600/700/800; hides splash screen when ready
- Wraps app in `QueryClientProvider` (single `QueryClient` instance at module level)
- `AuthGuard` watches `useAuthStore → user` and `useSegments`:
  - No user + inside `(app)` → `router.replace('/(auth)/login')`
  - User + inside `(auth)` + role `superadmin` → `router.replace('/(app)/dashboard')`
  - User + inside `(auth)` + role `user` → `router.replace('/(app)/books')`
- Renders `<Slot />` (page content) + `<Toast />` (global toast layer)
- `InitialPullMonitor` — runs on **every login** (session-scoped, not persisted):
  - Eligible users: superadmin OR paid subscription tier (non-free)
  - If local DB is empty AND cloud has books → `apiGetCloudBooks()` → sets `showRestorePrompt=true` → `RestoreCloudModal` appears
  - New users (cloud also empty) → no prompt; `AuthGuard` redirects straight to books
  - If local already has data → no prompt (user is returning on a device with existing data)
- `RestoreCloudModal` — centered full-screen `Modal` (not a bottom sheet), shown when `showRestorePrompt=true`:
  - **"Restore from Cloud"** → `syncCloudToLocal()` with `setRestoreJustCompleted(true)` → toast → `router.replace(target)`
  - **"Start Fresh"** → dismisses prompt → toast → `router.replace(target)`; cloud data stays safe
  - `target` is role-aware: `/(app)/dashboard/users` for superadmin, `/(app)/books` for regular users
- `RestoreCompletionOverlay` — full-screen animated overlay (`zIndex: 9999`), rendered in `_layout.jsx` above `<Slot />`:
  - Active when `isRestoring === true` OR `restoreJustCompleted === true`
  - Fades in on start, shows pulsing ☁️ icon + progress bar; title changes to "Restore complete! / Loading your books…" when done
  - Fades out (350 ms) when `restoreJustCompleted` is cleared — either by `BooksView` (when `!isLoading`) or by a 2.5 s timeout fallback in the overlay itself (safety net for navigation races where `BooksView` mounts after `isLoading` is already `false`)
- ~~`AutoSyncMonitor`~~ — **removed**; cloud upload is now **manual only**. The owner must go to Backup & Sync and press "Upload to Cloud". No automatic background pushes occur.
- `AutoDeleteMonitor` — on reconnect, deletes from cloud any books removed locally while offline (only runs when device has previously synced, i.e. `localCloudIds.size > 0`)
- `NotificationPopup` — centered modal card for unread notifications; auto-shows for regular users; also shows tapped notifications from the OS tray for any logged-in user

### Back Navigation Rules
- **Admin Books tab has its own Stack** (`app/(app)/dashboard/books/_layout.jsx`). This means `books/[id]` screens are pushed within the books-tab Stack (not the outer `(app)` Stack). `router.back()` from BookDetailScreen therefore pops correctly to AdminBooksScreen — NOT to the Dashboard/Users tab.
- `BookDetailScreen` uses `router.canGoBack() ? router.back() : router.navigate(basePath)`. The fallback fires only on deep-links (no prior history).
- Admin books routing layout: `dashboard/books/_layout.jsx` (Stack) → `dashboard/books/index.jsx` (AdminBooksScreen, Stack root) → `dashboard/books/[id]/_layout.jsx` (Stack) → BookDetailScreen. The sibling `dashboard/books.jsx` also imports AdminBooksScreen; if Expo Router warns about a duplicate route, delete `books.jsx` (the directory+layout takes precedence).
- All sub-screens of `BookDetailScreen` (add-entry, edit-entry, entry-detail, reports, book-settings) use `router.back()` — correct because they are pushed within the books/[id] Stack.
- `EntryDetailScreen` builds the edit-entry path via `useBookBasePath()` so the route stays within the correct user/admin subtree.
- Screens that are tab roots (e.g. `dashboard/settings`) must not show a back button — `SettingsScreen` detects this via `useSegments` (`segments[1] === 'dashboard' && segments.length <= 3`).
- **Admin profile is at `/(app)/admin-profile`** (`app/(app)/admin-profile.jsx`) — intentionally in the outer `(app)` Stack, NOT inside the Dashboard Tabs directory. This ensures `router.back()` pops the Stack and returns to whichever tab was active (Settings or Users), preserving tab state. `dashboard/profile.jsx` was deleted for this reason.

### Role-based routing

| Role | Landing route | Can access |
|---|---|---|
| `user` | `/(app)/books` | Books, entries, settings |
| `superadmin` | `/(app)/dashboard` | Dashboard (Users + Books + Settings tabs) |

---

## Screen Logic Reference

### `OnboardingScreen` — rendered inside `app/index.jsx` (first launch only)
- Shown once after the 1.8 s splash delay on first install; skipped on all subsequent launches
- `app/index.jsx` checks `onboarding_seen_v1` (SecureStore native / localStorage web) before navigating
- When flag absent → `setShowOnboarding(true)` → renders `<OnboardingScreen onFinish={handleOnboardingFinish} />` in place of the splash
- `onFinish` → `setOnboardingSeen()` writes flag → navigates based on `user` role (or to login if no user)
- `AuthGuard` in `_layout.jsx` is inert while on the root index (`segments[0] === undefined`)

---

### `LoginScreen` → `/(auth)/login`
- **Google:** native `GoogleSignin.signIn()` → `supabase.auth.signInWithIdToken()` — hidden in Expo Go (native module unavailable)
- **Email OTP:** two-step bottom sheet (`EmailModal`):
  - Step 1: `POST /api/v1/auth/send-otp` (falls back to `supabase.auth.signInWithOtp()` if 503)
  - Step 2: `POST /api/v1/auth/verify-otp` → `supabase.auth.setSession()` → `apiGetProfile()` → `setUser()` (falls back to `supabase.auth.verifyOtp()` if 503)
- Email button visible when `IS_EXPO_GO || __DEV__` (hidden in production EAS builds)
- After session: `SupabaseAuthListener` fires `SIGNED_IN` → `resolveProfile(session)` → `setUser(profile, session)` → `AuthGuard` redirects based on role

---

### `BooksScreen` → `/(app)/books` _(regular user)_
- `useBooks()` — queryKey `['books']`, staleTime 2 min, calls `GET /api/v1/books`
- Header: total net balance (sum across all books), book count, theme toggle, avatar → settings
- Sort modes: `updated` (default) | `created` | `alpha` | `custom` (drag-reorder)
- FAB → if limit reached: button turns grey (`C.cardAlt` bg, no shadow), icon + label dimmed (`C.textSubtle`); tapping fires a `Toast.info` ("Book limit reached" + tier/limit message) — no sheet, no navigation
- If somehow a create request reaches the backend and returns `BOOK_LIMIT_REACHED:{n}` (403), `LimitReachedSheet` is shown as a fallback safety net
- ⋮ on card → `BookMenu` bottom sheet → confirm delete → `useDeleteBook().mutate(id)`
- Tap book → `/(app)/books/[id]`
- Bottom nav: Cashbooks | Help | Settings

---

### `AdminBooksScreen` → `/(app)/dashboard/books` _(superadmin)_
- Identical to `BooksScreen` — same hooks, same CRUD flow, same sort/drag
- Header shows "Admin Workspace ▾" instead of "Personal Workspace ▾"
- FAB at `bottom: 16` (no bottom nav bar — nav is handled by dashboard tab bar)
- No bottom nav bar (the dashboard `_layout.jsx` tab bar replaces it)

---

### `AdminUsersScreen` → `/(app)/dashboard/users` _(superadmin)_
- `useQuery({ queryKey: ['admin-users'], staleTime: 0, refetchOnMount: 'always', refetchInterval: isFocused ? 10000 : false })` — polls every 10 s only while tab is focused; `useFocusEffect` manages `isFocused` and also invalidates `['admin-users']` + `['books']` on every tab focus
- `useQuery({ queryKey: ['books'], staleTime: 0, refetchOnMount: 'always' })` — admin's own books (local SQLite) for header stats and `adminItem.book_count`
- `useQuery({ queryKey: ['local-user-stats'], queryFn: localGetUserStats, staleTime: 0 })` — `{ book_count, entry_count }` from local SQLite; authoritative source for admin's own counts
- **Data sources by role:**
  - **Superadmin row (`adminItem`):** `book_count` = `books.length` (local SQLite), `entry_count` = `localStats.entry_count` (local SQLite), `storage_mb` + `shared_books_count` = `adminProfile` (cloud via `GET /api/v1/profile`)
  - **Paid subscriber rows:** all stats from `GET /admin/users` (cloud DB)
  - **Free user rows:** all stats hard-zeroed in the modal (`isFreeUser` guard) — free users never sync to cloud
- Header stats: Total Users | Total Books | Storage (include admin row when no filters active)
- Admin row always first in list, gold-tinted card border + `SuperAdminBadge` in the status slot
- Each user row: avatar (photo or initials with plan-color bg), full name, **plan pill** (color per `planColor(tier)`, label from `planLabel(tier, cycle)`), email, **access badge** (share icon + count when `shared_books_count > 0` and non-free)
- Tap user card → **User Detail Modal** (bottom sheet, read-only):
  - Avatar ring (plan color), name, email
  - **Super Admin badge** (animated gold `SuperAdminBadge`) below email when `selectedUser.isAdmin === true`
  - Stats row: Books / Entries / Storage / Access Given — free users see zeroes; Access Given highlighted `C.primary` when > 0
  - Access Given info card: non-admin + non-free + `shared_books_count > 0`
  - Subscription card: non-admin users only; accent = `planColor(tier, C.primary)`
- Filters (client-side, horizontal scroll row, each picker sheet has a "Clear" row when active):
  - **All** chip — resets `dateFilter` + `planFilter`
  - **Plan** dropdown → Free / Pro · Monthly / Pro · Yearly / Business · Monthly / Business · Yearly
  - **Date** dropdown → All Time / Today / Last 7 Days / This Month / This Year (filters by `created_at`)
- Header `books` stat = `filteredUsers.reduce(book_count) + adminOwnBooks.length` (admin books included only when no filters active)

---

### `BookDetailScreen` → `/(app)/books/[id]`

**Data fetching:**
- `useBooks()` + `useSharedBooks()` to determine `isOwner`; ownership is gate on `bookOwnershipKnown` (`!booksLoading`) so shared-book vs owned-book path resolves correctly before queries fire
- `['entries', bookId]` — `staleTime:0`; polls every 5 s for shared books, disabled for owned books (local SQLite)
- `['summary', bookId]` — same poll / disable pattern
- `useRealtimeEntries(bookId)` — Supabase Realtime subscription for shared-book live updates
- Error state: only shown for collaborators whose cloud fetch fails (owners never error — they read from local SQLite); offline collaborators see a dedicated offline state with "Go Back" button

**Header (two modes):**
- **Normal:** back chevron, book name + "Add Member, Book Activity etc" subtitle, share icon (owner only; 👑 badge + amber color when canShare is false), dots menu
- **Selection mode:** X close button, "N entries selected" title, "Select All / Deselect All" text button, trash icon (disabled when 0 selected)

**Search + Filters:**
- Full-width search bar (remark, amount, contact_name, category)
- Filter chip bar: "All" chip (always left-anchored, resets all filters) + scrollable chips: Date | Entry Type | Cust. & Supp. | Category | Payment
- Each chip opens a bottom-sheet picker modal (slide-up); active chip shows selected value + × clear button
- Date picker: Today / Yesterday / This Week / This Month (2×2 grid)
- Entry Type: Cash In / Cash Out (2-column card buttons)
- Customers & Suppliers: tabbed list with search bar; avatars with first-letter initial; green/red accent per tab
- Category: scrollable list of categories used in this book's entries
- Payment: grid of payment modes used in this book's entries
- `activeFilterCount` drives the "All" chip active state and entry count label ("filtered" vs "total")
- When filters or search are active, `displaySummary` is recomputed client-side from the filtered entries; otherwise shows full DB summary

**Balance Card (`BalanceCard`):**
- Net balance (large, green/red), Total In (+), Total Out (−)
- "VIEW REPORTS ›" button visible when `canViewReports`; tapping navigates to ReportsScreen, forwarding all active filters as `initialDate`, `initialType`, `initialContact`, `initialCategory`, `initialPayment` params

**Entry List:**
- Entries grouped by date (`groupByDate`); each group has a collapsible header (day name, date, count, day net)
- `EntryCard` shows: payment mode badge (colored per mode), remark, category, "Entry by Owner · HH:MM AM/PM", paperclip dot when attachment exists, amount (green/red)
- Entry count row with "filtered" / "total" label + "Clear" button when filters active

**Selection mode (bulk delete):**
- Long-pressing any entry (requires `canDelete`) enters selection mode
- Checkbox appears on each card; tap to toggle; "Select All / Deselect All" in header
- Trash icon → `DeleteEntrySheet` with bulk count; `bulkDeleteEntries` mutation calls `apiDeleteEntry` sequentially
- Exits selection mode on successful bulk delete or pressing X

**Single-entry delete:**
- `DeleteEntrySheet` (bottom sheet) shown for single entry delete; `deleteEntry` mutation
- Entry target set via `setDeleteEntryTarget`; sheet resolves single vs bulk via `deleteEntryTarget._bulk`

**Delete All Entries:**
- Dots menu → "Delete All Entries" → `DeleteAllEntriesSheet` (bottom sheet with animated close callback via `closeRef`)
- `deleteAllEntries` mutation; `SuccessDialog` shown after sheet closes

**Dots menu:**
- Sync (shown only when `canSync`; label changes: Syncing… / Synced / Sync; icon: check-circle when synced)
- Book Settings
- Delete All Entries (shown only when `canDelete`)

**Action Buttons:**
- "CASH IN" (green) and "CASH OUT" (red) always side-by-side at the bottom
- Hidden when `!canCreate` OR when collaborator is offline (`!isOwner && !isOnline`)

**Loading state:** `BalanceCardSkeleton` + three `EntryGroupSkeleton` shimmer placeholders
**Empty state (`EmptyState`):** animated cascading chevrons pointing down + "start here" hint (nudge + cascade loop using `Animated.loop` with `useNativeDriver`)

**Rights resolution:**
- Owner (`isOwner`): `rights = 'view_create_edit_delete'`; `canCreate = true`; `canDelete = true`; `canViewReports = true`
- Collaborator: rights from `sharedBook.rights`; `canCreate`, `canDelete`, `canViewReports` derived from rights + screens JSONB

---

### `EntryForm` component (`components/entry/EntryForm.jsx`)

Shared `forwardRef` component used by both `AddEntryScreen` and `EditEntryScreen`. Exposes `{ getValues(), validate() }` via `ref`.

**Fields rendered (conditional on book field-settings):**
- **Type toggle** (`showTypeToggle` prop) — Cash In / Cash Out buttons
- **Date + Time** — two side-by-side pickers; opens `DatePickerModal` / `TimePickerModal`
- **Amount** — decimal-pad input, required; `autoFocusAmount` prop available
- **Contact** (shown when `showCustomer || showSupplier`) — opens `ContactPickerModal`; label adapts to Customer/Supplier/Both; amber warning when contact was deleted (ID gone but name still set); × clears
- **Remark** — multiline text input with 🎤 emoji decoration
- **Attachment** (shown when `showAttachment`) — three states: empty (dashed button), uploading (spinner), preview (thumb + "Tap to change"); opens animated bottom sheet with Camera / Gallery / PDF options + Remove row when file exists; inline error card on upload failure; image compressed to 1200px wide JPEG (72% quality) via `expo-image-manipulator` before upload; PDFs capped at 6 MB and sent as-is; full-screen image viewer modal on eye-icon tap
- **Category** (shown when `showCategory`) — opens `CategoryPickerModal`; amber warning when category deleted; × clears
- **Payment Mode** — chip row fetched from DB via `usePaymentModes(bookId)`; required field; auto-selects first mode if current selection no longer exists

**ID resolution for restored entries:**
- Cloud-restored entries have `contact_name` / `category` text but `null` IDs (IDs are local)
- Form lazy-fetches `['customers', bookId]`, `['suppliers', bookId]`, `['categories', bookId]` only when the ID is missing but the name is present
- On fetch: auto-matches by name and sets the correct ID so edits save correctly

**Deleted-contact / deleted-category warnings:**
- If name is present but ID is still `null` after resolution → `contactDeleted` / `categoryDeleted = true`
- Parent screens receive callbacks via `onContactDeletedChange` / `onCategoryDeletedChange` props to show a warning banner

**`getValues()` output:** `type, amount, remark, category, category_id, payment_mode, payment_mode_id, contact_name, customer_id, supplier_id, attachment_url, attachment_path, attachment_provider, entry_date (YYYY-MM-DD), entry_time (HH:MM)` — nulls set for deleted contacts/categories

**`validate()`:** returns `'amount'` if empty/zero/NaN, `'payment_mode'` if no mode selected, `null` if valid

---

### `AddEntryScreen` → `/(app)/books/[id]/add-entry`
- `type` param from query string (`'in'` or `'out'`)
- Renders `<EntryForm>` with `initialType={type}` and `autoFocusAmount`
- On save: `apiCreateEntry(bookId, payload)` → invalidates `['entries', bookId]`, `['summary', bookId]`, `['books']`

---

### `EditEntryScreen` → `/(app)/books/[id]/edit-entry`
- Loads existing entry via `useQuery(['entries', bookId])` and finds by `eid` param
- Renders `<EntryForm showTypeToggle initialValues={entry}>`; type toggle always visible
- Shows deleted-contact / deleted-category warning banners driven by `EntryForm` callbacks
- Delete button → confirm → `apiDeleteEntry` → pop
- On save: `apiUpdateEntry` → invalidates entries, summary, books, categories, category-entries, report-entries

---

### `ReportsScreen` → `/(app)/books/[id]/reports`
- Filter chips: This Month | Last Month | Last 3 Months | All Time | Custom
- Selecting a preset chip derives `dateFrom` / `dateTo` from the current date (no API call just for the range)
- "Custom" chip reveals two date picker buttons; each opens `DateTimePickerModal` (date mode) to set `customFrom` / `customTo`
- Query: `['report-entries', bookId, dateFrom, dateTo]` → `GET /api/v1/books/:id/entries?date_from=&date_to=`; staleTime 2 min; re-fetches automatically when date range changes
- Summary (Income, Expenses, Net) computed client-side from the filtered entries list
- Bar chart: 3 bars (In/Out/Net), height proportional to largest value, uses `C.cashIn` / `C.cashOut` from theme
- Recent Entries shows up to 8 rows; shows "+N more" note if list is longer
- Export: tapping PDF or Excel calls `FileSystem.downloadAsync(backendUrl, cacheDir/filename, { headers: { Authorization } })` then `Sharing.shareAsync(localUri)` — opens native OS share sheet (WhatsApp, Email, Google Drive, Save to Files, etc.)
- Loading indicator shown inline next to date range label while fetching
- Both export buttons disabled while any export is in progress

---

### `BackupSyncScreen` → `/(app)/settings/backup-sync`
- Open to all users; content varies by tier
- **Status card** (all users): online dot (animated pulse), last-sync time, upload + restore progress bars
  - `lastSyncedAt` is stamped after every **manual** "Upload to Cloud" action from BackupSyncScreen (`finishSync` in `BackupSyncScreen.jsx`)
- **LOCAL DATA section** (all users): section label separated above card with `marginTop: 24`; card with `marginTop: 8` shows counts for books / entries / categories / customers / suppliers
- **Backup Data section** (paid / superadmin, not lapsed): retention window (Pro=7 days, Business/Superadmin=15 days) and last backup timestamp
- **SHARED BOOKS section** (free users with `sharedBookCount > 0` only): shows count of accepted shared books and online/offline sync status row — lets free users confirm their shared data is current
- **CLOUD ACTIONS** (paid / superadmin only):
  - "Upload to Cloud" → `SyncConfirmSheet` → `syncLocalToCloud(onProgress)` → toast; if local empty → "Nothing to sync" modal alert. **Manual only — no auto-upload happens.** Owner must come here to push new data.
  - "Restore from Cloud" — conditional render → `RestoreOrFreshSheet` (mode="confirm") → `syncCloudToLocal(onProgress)` → toast
- **Danger Zone** (paid / superadmin only): "Start Fresh" → `FreshStartSheet` (2-step confirm) → `apiGetBooks()` → `apiDeleteBook()` for each → `localClearAll()` → toast
- **Free-tier gate**: shown only when `!canSync && !freeHasSharedAccess`; shows upgrade card; hidden if free user has shared access (shared books section shown instead)
- **Info note** (all users): text varies by canSync state and whether user has shared access
- All sync/restore state in `useSyncStore`: `isSyncing`, `isRestoring`, `progress`, `restoreProgress`

#### "Restore from Cloud" button — visibility logic
```js
const hasUnrestoredCloudData = canSync && !deltaLoading && hasCloudData &&
  ((delta?.onlyInCloudEntries ?? 0) > 0 || (delta?.newBooks ?? 0) > 0);
```
Button renders whenever `hasUnrestoredCloudData` is true — **the `hasRestoredFromCloud` flag is no longer part of the condition.** The delta is the live source of truth: once all cloud data is locally present, `onlyInCloudEntries` and `newBooks` both drop to 0 and the button disappears naturally. This means the button stays visible and re-appears after a partial restore (e.g. mid-download network failure) so the user can retry. Disabled (but shown) when offline, syncing, or restoring.

---

### `SettingsScreen` → `/(app)/settings` (and `/(app)/dashboard/settings`)
- Sections: Account | App | Support
- Logout → `supabase.auth.signOut()` → `clearUser()` → AuthGuard redirects to login

---

### `ProfileScreen` → `/(app)/settings/profile`
- `useProfile()` loads data; save → `useUpdateProfile(payload)` → `invalidate(['profile'])`

---

### `PrivacyPolicyScreen` → `/(app)/settings/privacy-policy`
- Static scrollable screen — no API calls, no state
- Intro card with `C.primaryLight` / `C.primaryMid` styling; 11 policy sections rendered in a single `C.card` container
- Back navigates to settings; header matches all other settings sub-screens

---

### `CurrencyScreen` → `/(app)/settings/currency`
- Full list of world currencies from `constants/currencies.js` (160+ ISO 4217 entries)
- Search bar filters by code, name, or symbol (client-side, no API call)
- Selected currency is highlighted with a checkmark; code comes from `profile?.currency`
- Tapping a row → `useUpdateProfile().mutate({ currency: code })` → `invalidate(['profile'])` → `router.back()`
- `SettingsScreen` reads `profile.currency`, looks it up with `getCurrency()`, and shows `"CODE – Name"` as the sub-label

---

### `ManageAccessScreen` → `/(app)/settings/manage-access`
- Always navigated to from SettingsScreen (no pre-navigation gate — paywall is rendered inline)
- `canAccess(user, 'book_sharing')` checked on mount:
  - **Free tier** → `PaywallOverlay` covers the content area (absolute, `zIndex: 10`), header + back button remain accessible
    - Overlay: frosted backdrop (`rgba(0,0,0,0.75)` dark / `rgba(255,255,255,0.78)` light) + centered card
    - Card: lock icon (`Feather lock`) in `C.primaryLight` circle, "Pro Feature" title, description, "Upgrade to Pro" button → `router.push('/(app)/settings/subscription')`
  - **Pro / Business / Superadmin** → full screen accessible, no overlay
- Two tabs: **Received** (pending badge count) | **Given**
- Real-time via `useRealtimeInvitations(user.id)` + `useRealtimeGivenInvitations(user.id)`
- **Received tab:** `useReceivedInvitations()` → pending/accepted cards; Accept / Decline (→ `DeclineSheet`) / Leave Book (→ `LeaveBookSheet`)
- **Given tab:** `useGivenInvitations()` → collaborator cards; edit (→ `EditShareSheet`) / remove (→ `Alert` confirm → `useRemoveShareByOwner()`)

---

## Books CRUD — Data Flow

### Create
1. Modal → `createBook.mutate({ name })` fires first, then `setShowModal(false)` — this ordering ensures the optimistic update lands in the cache before the modal closes, so the new book is visible the instant the sheet dismisses
2. `onMutate`: optimistic prepend with `id: '__optimistic__'` → UI updates instantly
3. `localCreateBook()` writes to SQLite and returns immediately; cloud backup fires in the background (paid/superadmin only)
4. `onSuccess`: replaces optimistic placeholder with real local book, then `invalidateQueries(['books'])` → refetch
5. `onError`: rollback to snapshot

### Delete
1. `BookMenu` confirm → `useDeleteBook().mutate(bookId)`
2. `onMutate`: optimistic remove from cache → UI updates instantly
3. `DELETE /api/v1/books/:id` → DB delete (cascades entries)
4. `onSuccess`: `invalidateQueries(['books'])` → refetch → cache = remaining books from DB
5. `onError`: rollback to snapshot

**Invariant:** After `onSuccess`, the cache always reflects real DB data — not just the optimistic state.

---

## DraggableList Sync Rule

`DraggableList` maintains its own `items` state for drag ordering. It syncs with the parent `books` prop via `useEffect`:

```js
useEffect(() => {
  if (dragIdx < 0) {        // don't interrupt an active drag
    setItems([...books]);
  }
}, [books, dragIdx]);
```

This ensures that after a create or delete (which invalidates `['books']` and triggers a refetch), the drag list updates to show the real DB state without requiring the user to switch sort modes.

---

## Data Source Layer (`src/lib/dataSource.js`)

Routes every read and write through `isLocalBook(bookId)` — a fast SQLite check — before deciding where data lives:

| Book type | Reads | Writes |
|---|---|---|
| **Own books** | Local SQLite (all tiers, works offline) | Local SQLite only — **no automatic cloud push** |
| **Shared books** | Cloud API directly | Cloud API directly (backend stores under owner's `user_id`) |

**Manual upload rule:** `shouldBackupToCloud()` in `dataSource.js` always returns `false`. Own-book writes go to SQLite only. The owner must go to Settings → Backup & Sync and tap "Upload to Cloud" to push data to the cloud. `syncLocalToCloud()` in `syncManager.js` handles the full upload when triggered manually.

`isLocalBook()` calls `localBookExists(bookId)` in `localDb.js`. Shared books are never pulled into the recipient's SQLite, so the check returns `false` and the cloud path is taken automatically.

### Entry cloud-ID tracking (`cloud_entry_id`)
The local `entries.cloud_entry_id` column links a local row to its cloud UUID. It is set in two places:
- **Upload (`syncLocalToCloud` Case C):** after a new entry is created in the cloud, the returned UUID is stored via `localSetEntryCloudId()`.
- **Restore (`syncCloudToLocal`):** after a cloud entry is written to local SQLite, the cloud entry's `id` is stored immediately via `localSetEntryCloudId()` — so a future upload can update that cloud row instead of creating a duplicate.

This enables:
- **Update reconciliation:** `syncLocalToCloud` sees `cloud_entry_id` is known but fingerprint changed → Case B → updates existing cloud row.
- **Delete reconciliation:** See tombstone section below.
- **Idempotent re-upload after restore:** Case A fingerprint match back-fills `cloud_entry_id` if somehow still null (safety net).

### Deletion tombstone log (`deleted_entries` SQLite table)

**Problem solved:** When an owner deletes a local entry that was previously synced, the row (including its `cloud_entry_id`) disappears from SQLite. The sync loop only iterates over *existing* entries, so it could never detect the deletion — the cloud entry would remain forever.

**Solution:** A `deleted_entries` table acts as a tombstone log:

```
deleted_entries
  id             INTEGER PRIMARY KEY AUTOINCREMENT
  cloud_entry_id TEXT NOT NULL   — cloud UUID of the deleted entry
  cloud_book_id  TEXT NOT NULL   — cloud UUID of its parent book
  deleted_at     TEXT NOT NULL   — ISO timestamp
```

**Write path (both single and bulk delete):**
- `localDeleteEntry()` — reads `cloud_entry_id` + `books.cloud_id` before deleting; inserts a tombstone row if both are non-null (i.e. the entry was previously synced). No tombstone for unsynced entries.
- `localDeleteAllEntries()` — bulk-reads all synced entries for the book first, inserts a tombstone for each, then does the bulk `DELETE`.

**Sync path (`syncLocalToCloud` — step 7):**
1. Tombstones are fetched at function start and included in the `total` progress count.
2. After entries are uploaded/updated, step 7 loops over tombstones and calls `apiDeleteEntry(cloud_book_id, cloud_entry_id)` for each.
3. On success or 404 (already gone) → tombstone cleared via `localClearDeletedEntry(id)`.
4. On any other network error → tombstone is **left in place** and retried on the next manual sync.

**Offline behaviour:** Tombstones are pure SQLite writes — no network required at delete time. They accumulate until the owner next presses "Upload to Cloud", at which point all pending deletions are replayed against the cloud.

**Helpers exported from `localDb.js`:**
- `localGetDeletedEntries()` — returns all rows ordered by `deleted_at ASC`
- `localClearDeletedEntry(id)` — removes a single tombstone row after successful cloud delete

### Attachment sync rules

Attachments have three fields in SQLite: `attachment_url`, `attachment_path`, `attachment_provider`.

| Field | Role |
|---|---|
| `attachment_url` | URI used for **display** (`<Image source={{ uri }}>`) — may be a local `file:///` path or a Supabase HTTPS URL |
| `attachment_path` | Supabase Storage object path (e.g. `attachments/entry-id/attachment.jpg`) — used for **deletion** and **sync dedup** |
| `attachment_provider` | `'local'` or `'supabase'` — tells sync whether the file already lives in cloud storage |

#### Upload (`syncLocalToCloud`)

| Entry attachment state | What sync does |
|---|---|
| `provider = 'local'`, file exists | Uploads file to Supabase Storage, updates cloud entry with returned URL/path, mirrors Supabase URL back to **local** SQLite (so `attachment_url` becomes the Supabase URL and `provider` becomes `'supabase'`) |
| `provider = 'supabase'` | Passes existing `attachment_url`, `attachment_path`, `provider` through in the payload — no re-upload |
| `provider = null` / no attachment | Sends nulls — no file operation |

For **Case B** (edited entry with `cloud_entry_id`): same attachment upload logic as Case C, applied before the cloud update call.

#### Restore (`syncCloudToLocal`)

For each cloud entry with a Supabase attachment:
1. Creates `{documentDirectory}attachments/restored_{seq}.jpg` (or `.pdf`) using a **monotonic per-book counter** — never `Date.now()`, so filenames are unique even when entries are processed within the same millisecond.
2. Calls `FileSystem.deleteAsync(dest, { idempotent: true })` before download to clean up any stale file from a previous restore run at the same sequence position.
3. Downloads via `FileSystem.downloadAsync(cloudUrl, localDest)`.
4. On success:
   - `attachment_url` = local `file:///` path (offline display works)
   - `attachment_path` = original Supabase Storage path (deletion / sync knows the cloud location)
   - `attachment_provider` = `'supabase'` (sync will NOT re-upload — file is already in cloud)
5. On failure (network error, non-200 status): falls back to storing the Supabase URL as `attachment_url` — images display when online; `attachment_provider` stays `'supabase'` so the next restore attempt skips the entry (fingerprint match) but the Supabase URL fallback remains visible online. The "Restore from Cloud" button stays active until `onlyInCloudEntries` reaches zero, so the user can retry if needed.

**Free-tier users** whose attachments were stored with `provider = 'local'` and were never manually uploaded to cloud will have null attachment fields after restore — the files were never backed up.

### `stampSyncTime()` helper
No longer used for background pushes (those are removed). Still present in `dataSource.js` but `shouldBackupToCloud()` always returns `false` so the branches that call it never execute. `lastSyncedAt` is now only updated by `finishSync()` in `BackupSyncScreen` after a manual upload completes.

---

## API Layer (`src/lib/api.js`)

All functions call the real FastAPI backend. Axios interceptor attaches the Supabase JWT automatically. 401/403 responses trigger `supabase.auth.signOut()`.

| Function | HTTP | Endpoint |
|---|---|---|
| `apiGetBooks()` | GET | `/api/v1/books` |
| `apiCreateBook(name, currency)` | POST | `/api/v1/books` |
| `apiUpdateBook(bookId, payload)` | PUT | `/api/v1/books/:id` |
| `apiDeleteBook(bookId)` | DELETE | `/api/v1/books/:id` |
| `apiUpdateBookFieldSettings(bookId, fieldSettings)` | PATCH | `/api/v1/books/:id/field-settings` |
| `apiGetSharedBooks()` | GET | `/api/v1/books/shared` — accepted books shared with me |
| `apiGetBookShares(bookId)` | GET | `/api/v1/books/:id/shares` — collaborators on my book (all statuses) |
| `apiAddCollaborator(bookId, payload)` | POST | `/api/v1/books/:id/shares` — send invitation (creates pending share) |
| `apiUpdateShare(bookId, shareId, payload)` | PATCH | `/api/v1/books/:id/shares/:shareId` — update rights/screens |
| `apiRemoveCollaborator(bookId, shareId)` | DELETE | `/api/v1/books/:id/shares/:shareId` |
| `apiLeaveSharedBook(bookId)` | DELETE | `/api/v1/books/:id/leave` — recipient removes self |
| `apiRespondToInvitation(bookId, shareId, action)` | PATCH | `/api/v1/books/:id/shares/:shareId/respond` — `action: "accept"\|"reject"` |
| `apiGetReceivedInvitations()` | GET | `/api/v1/invitations/received` — all invitations to me |
| `apiGetGivenInvitations()` | GET | `/api/v1/invitations/given` — all invitations I sent |
| `apiSearchUsers(q)` | GET | `/api/v1/profile/search?q=...` — find user by email |
| `apiGetProfile()` | GET | `/api/v1/profile` |
| `apiUpdateProfile(payload)` | PUT | `/api/v1/profile` |
| `apiUpdateSubscription({ tier, subscription_status, billing_cycle, expires_at?, cancel_at_period_end? })` | PATCH | `/api/v1/profile/subscription` |
| `apiUploadAvatar(uri, mimeType)` | POST | `/api/v1/upload/avatar` — multipart, returns `{ avatar_url }` |
| `apiUploadAttachment(uri, mimeType, filename, entryId?)` | POST | `/api/v1/upload/attachment` — multipart, returns `{ attachment_url, path, provider }` |
| `apiDeleteAttachment(path)` | DELETE | `/api/v1/upload/attachment?path=...` — removes file from Supabase Storage |
| `apiGetEntries(bookId, params)` | GET | `/api/v1/books/:id/entries` |
| `apiGetSummary(bookId)` | GET | `/api/v1/books/:id/summary` |
| `apiCreateEntry(bookId, payload)` | POST | `/api/v1/books/:id/entries` |
| `apiUpdateEntry(bookId, entryId, payload)` | PUT | `/api/v1/books/:id/entries/:eid` |
| `apiDeleteEntry(bookId, entryId)` | DELETE | `/api/v1/books/:id/entries/:eid` |
| `apiGetCategories(bookId)` | GET | `/api/v1/books/:id/categories` |
| `apiCreateCategory(bookId, payload)` | POST | `/api/v1/books/:id/categories` |
| `apiUpdateCategory(bookId, categoryId, payload)` | PUT | `/api/v1/books/:id/categories/:id` |
| `apiDeleteCategory(bookId, categoryId)` | DELETE | `/api/v1/books/:id/categories/:id` |
| `apiGetCategoryEntries(bookId, categoryId)` | GET | `/api/v1/books/:id/categories/:id/entries` |
| `apiReorderCategories(bookId, orderedIds)` | PATCH | `/api/v1/books/:id/categories/reorder` |
| `apiGetCustomers(bookId)` | GET | `/api/v1/books/:id/customers` |
| `apiCreateCustomer(bookId, payload)` | POST | `/api/v1/books/:id/customers` |
| `apiGetCustomer(bookId, id)` | GET | `/api/v1/books/:id/customers/:id` |
| `apiUpdateCustomer(bookId, id, payload)` | PUT | `/api/v1/books/:id/customers/:id` |
| `apiDeleteCustomer(bookId, id)` | DELETE | `/api/v1/books/:id/customers/:id` |
| `apiGetCustomerEntries(bookId, id)` | GET | `/api/v1/books/:id/customers/:id/entries` |
| `apiReorderCustomers(bookId, orderedIds)` | PATCH | `/api/v1/books/:id/customers/reorder` |
| `apiGetSuppliers(bookId)` | GET | `/api/v1/books/:id/suppliers` |
| `apiCreateSupplier(bookId, payload)` | POST | `/api/v1/books/:id/suppliers` |
| `apiGetSupplier(bookId, id)` | GET | `/api/v1/books/:id/suppliers/:id` |
| `apiUpdateSupplier(bookId, id, payload)` | PUT | `/api/v1/books/:id/suppliers/:id` |
| `apiDeleteSupplier(bookId, id)` | DELETE | `/api/v1/books/:id/suppliers/:id` |
| `apiGetSupplierEntries(bookId, id)` | GET | `/api/v1/books/:id/suppliers/:id/entries` |
| `apiReorderSuppliers(bookId, orderedIds)` | PATCH | `/api/v1/books/:id/suppliers/reorder` |
| `apiGetAllUsers()` | GET | `/api/v1/admin/users` |
| `apiToggleUserStatus(userId, is_active)` | PATCH | `/api/v1/admin/users/:id/status` |
| `apiGetUserBooks(userId)` | GET | `/api/v1/admin/users/:id/books` |
| `apiSendNotification(payload)` | POST | `/api/v1/admin/notifications` — `{ title, body, target_type, user_ids? }` |
| `apiGetSentNotifications()` | GET | `/api/v1/admin/notifications` |
| `apiGetNotifications({ unread? })` | GET | `/api/v1/notifications[?unread=true]` |
| `apiMarkNotificationRead(id)` | PATCH | `/api/v1/notifications/:id/read` |
| `apiMarkAllNotificationsRead()` | PATCH | `/api/v1/notifications/read-all` |
| `apiDeleteNotification(id)` | DELETE | `/api/v1/notifications/:id` |
| `apiBulkDeleteNotifications(ids)` | POST | `/api/v1/notifications/bulk-delete` |
| `apiBulkMarkNotificationsRead(ids)` | POST | `/api/v1/notifications/bulk-read` |

---

## State Management

| Store / Cache | Library | Contents |
|---|---|---|
| `authStore` | Zustand | `user`, `session`, `setUser(user, session)`, `clearUser()` |
| `themeStore` | Zustand | `isDark`, `toggle()` |
| `bookFieldsStore` | Zustand | Empty store (stub); field visibility is persisted as individual boolean columns on `books` (DB) and read from `['books']` React Query cache as `show_customer`, `show_supplier`, `show_category`, `show_attachment` |
| `syncStore` | Zustand | `isOnline`, `isSyncing`, `isRestoring`, `progress { done, total, step }`, `restoreProgress { done, total, step }`, `lastSyncedAt`, `syncError`, `restoreError`, `showRestorePrompt`; actions: `startSync`, `finishSync`, `failSync`, `stampLastSynced` (timestamp only — never resets isSyncing/progress), `startRestore`, `finishRestore`, `failRestore`, `setProgress`, `setRestoreProgress` |
| `['books']` | React Query | All books for current user; staleTime 2 min |
| `['admin-users']` | React Query | All non-admin users; polls every 10 s while Users tab is focused (refetchInterval disabled when tab is not focused) |
| `['local-user-stats']` | React Query | Local SQLite counts: `{ book_count, entry_count }` for the superadmin row in AdminUsersScreen; staleTime 0, refetchOnMount always |
| `['entries', bookId]` | React Query | Entries for a specific book; staleTime 2 min |
| `['summary', bookId]` | React Query | Balance summary for a specific book; staleTime 2 min |
| `['profile']` | React Query | Current user profile; staleTime 5 min |
| `['user-books', userId]` | React Query | A specific user's books (admin modal); enabled when userId is set |

**Rule:** Never store server data in Zustand. Zustand = auth state + UI preferences only.

---

## Bottom Sheet / Modal Pattern (keyboard-aware)

Every bottom sheet that contains a `TextInput` **must** use this structure. **Never** use `KeyboardAvoidingView` for bottom sheets — it leaves residual space at the bottom on Android after the keyboard dismisses.

```jsx
// 1. Keyboard listeners (non-native driver — drives marginBottom, not transform)
const kbOffset = useRef(new Animated.Value(0)).current;

useEffect(() => {
  const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
  const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
  const up   = Keyboard.addListener(showEvent, (e) =>
    Animated.timing(kbOffset, { toValue: e.endCoordinates.height, duration: Platform.OS === 'ios' ? e.duration : 150, useNativeDriver: false }).start()
  );
  const down = Keyboard.addListener(hideEvent, (e) =>
    Animated.timing(kbOffset, { toValue: 0, duration: Platform.OS === 'ios' ? e.duration : 150, useNativeDriver: false }).start()
  );
  return () => { up.remove(); down.remove(); };
}, []);

// 2. Modal structure
<Modal transparent statusBarTranslucent>
  {/* Dim backdrop — absoluteFill, independent of sheet layout */}
  <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', opacity: bgOpacity }]}>
    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={close} />
  </Animated.View>

  {/* Sheet anchor: absolute bottom; kbOffset (non-native) lifts sheet above keyboard */}
  <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
    <Animated.View style={{ marginBottom: kbOffset }}>
      {/* slideY (native driver) must be on a separate inner Animated.View */}
      <Animated.View style={[s.sheet, { transform: [{ translateY: slideY }] }]}>
        {/* content */}
      </Animated.View>
    </Animated.View>
  </View>
</Modal>
```

**Why two nested `Animated.View`s:** `marginBottom` (non-native driver) and `transform` (native driver) cannot share the same `Animated.Value` or the same `Animated.View`. Separate wrappers are required.

**Why not `KeyboardAvoidingView`:** On Android, `behavior='height'` does not fully restore the component height when the keyboard dismisses, leaving a gap between the sheet and the screen bottom.

**Existing sheet components using this pattern:**
- `components/ui/DeleteAllEntriesSheet.jsx`
- `components/ui/DeleteContactSheet.jsx`

---

## Styling Rules

- Always use `useTheme()` → `{ C, Font }` — never hardcode hex colors or font family strings
- `C` resolves to `LightColors` or `DarkColors` from `constants/colors.js`
- `Font` resolves to Inter variant constants from `constants/fonts.js`
- Per-screen styles via `StyleSheet.create()` inside a local `makeStyles(C, Font)` function called with current theme values
- `CARD_ACCENTS` from `constants/colors.js` — color each book card by `index % CARD_ACCENTS.length`

### Design Consistency — mandatory for every new screen and component

Before writing any new screen or component, open a similar existing screen and match its visual pattern exactly. Non-negotiable rules:

| Element | Rule |
|---|---|
| **Header** | `C.primary` bg, `C.onPrimary` text, back button in same position/size, icon buttons in 44×44 `C.onPrimaryIconBg` circles |
| **Cards** | `C.card` bg, `1.5px C.border` border, same `borderRadius` as nearby screens |
| **Typography** | Use `Font.*` constants only — never a raw string. Scale: caption 10–11, label 12, body 13–14, subtitle 15–16, title 18–20 |
| **Status colors** | Income/positive → `C.cashIn` / `C.cashInLight`; Expense/destructive → `C.danger` / `C.dangerLight`; Accent → `C.primary` / `C.primaryLight` |
| **Spacing** | `paddingHorizontal: 16` on list content, `20` on headers/modals; match `gap` and `marginBottom` from adjacent screens |
| **Bottom sheets / Modals** | Handle bar (`width:36, height:4, C.border`), rounded top corners (`borderRadius:20–24`), `C.overlay` backdrop — no new layouts |
| **Empty states** | 80×80 icon box with `C.primaryLight` bg, `borderRadius:24`, bold title, muted subtitle — same structure as all other empty states |
| **Icons** | Default to `Feather`; only use another set when Feather has no suitable icon — add a comment explaining why |
| **No one-off styles** | If a style differs from every other screen without a clear reason, redesign it to match — consistency is more important than novelty |

---

## React Query Conventions

| Query key | staleTime | refetchInterval | Data |
|---|---|---|---|
| `['books']` | 2 min | — | Books list |
| `['admin-users']` | 0 | 10 s | All non-admin users |
| `['local-user-stats']` | 0 | — | Local SQLite book + entry counts for superadmin row; refetchOnMount always |
| `['entries', bookId]` | 2 min | — | Book entries |
| `['summary', bookId]` | 2 min | — | Book balance summary |
| `['profile']` | 5 min | — | User profile |
| `['user-books', userId]` | 0 | — | Specific user's books (admin modal) |
| `['categories', bookId]` | 2 min | — | All categories for a book |
| `['category-entries', bookId, id]` | 2 min | — | Entries assigned to a category |
| `['customers', bookId]` | 2 min | — | All customers for a book |
| `['customer', bookId, id]` | 2 min | — | Single customer with balance |
| `['customer-entries', bookId, id]` | 2 min | — | Entries linked to a customer |
| `['suppliers', bookId]` | 2 min | — | All suppliers for a book |
| `['supplier', bookId, id]` | 2 min | — | Single supplier with balance |
| `['supplier-entries', bookId, id]` | 2 min | — | Entries linked to a supplier |
| `['report-entries', bookId, dateFrom, dateTo]` | 2 min | — | Filtered entries for ReportsScreen; dateFrom/dateTo are YYYY-MM-DD strings or null |
| `['notifications']` | 1 min | — | User's full notification inbox |
| `['invitations', 'received']` | 0 | 30 s | All invitations received; polls so new invitations appear while app is open; feeds pending badge in BooksView + SettingsScreen |
| `['invitations', 'given']` | 0 | — | All invitations sent by the user; invalidated on add/update/remove collaborator |
| `['notifications', 'unread']` | 0 | 15 s | Unread-only; used by popup in `_layout.jsx`; polls so new notifications auto-show while app is open |
| `['sent-notifications']` | 2 min | — | Admin's sent notification history |

Mutations use `qc.setQueryData(...)` for optimistic updates + `qc.invalidateQueries(...)` on success to sync with DB.

---

## When to Update This File

- New screen added or an existing screen's route changes
- New hook added or its query key / stale time changes
- New API function added to `api.js`
- New Zustand store or store field added
- Component moved, renamed, or has a new significant behaviour

## skeleton.md Update Rule

**Every prompt that touches a screen or component file must also update [skeleton.md](../skeleton.md).**
This includes: icon changes, label renames, layout changes, new/removed buttons or modals, filter/sort changes, color or style overhauls, new states — anything a user would see or interact with.
No frontend change is complete until skeleton.md reflects it.
