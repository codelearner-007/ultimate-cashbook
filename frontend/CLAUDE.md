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
│           └── business/
│               ├── index.jsx     # → BusinessSettingsScreen
│               ├── profile.jsx   # → BusinessProfileScreen
│               └── delete.jsx    # → DeleteBusinessScreen
├── src/
│   ├── screens/                  # All screen components (one file = one screen)
│   ├── components/
│   │   ├── books/
│   │   │   ├── BookMenu.jsx      # Bottom-sheet action menu for a book (delete)
│   │   │   ├── DraggableList.jsx # Custom drag-reorder list for books
│   │   │   └── SortSheet.jsx     # Sort-mode picker bottom sheet
│   │   ├── entry/
│   │   │   ├── EntryForm.jsx         # Shared form for add/edit entry
│   │   │   └── ContactPickerModal.jsx # Bottom sheet: search customers/suppliers, create new, import from phone
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
│   │       └── FreshStartSheet.jsx    # 2-step confirm: delete all cloud + local data
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
│   │   ├── dataSource.js         # Data-source router: cloud API (paid/superadmin+online) vs local SQLite (free/offline)
│   │   ├── supabase.js           # Supabase client (SecureStore / localStorage adapter)
│   │   ├── storage.js            # Provider-agnostic attachment abstraction (uploadAttachment, removeAttachment) — superadmin always uses Supabase Storage
│   │   └── toast.js              # Toast helper
│   ├── store/
│   │   ├── authStore.js          # Zustand: user, session, setUser, clearUser
│   │   ├── themeStore.js         # Zustand: isDark, toggle
│   │   ├── bookFieldsStore.js    # Zustand: per-book field visibility toggles
│   │   └── syncStore.js          # Zustand: isOnline, isSyncing, isRestoring, progress, restoreProgress, lastSyncedAt
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
- Shown once after the splash screen on first install; skipped on all subsequent launches
- Persistence: `expo-secure-store` key `onboarding_seen_v1` (native) / `localStorage` (web)
- 5 horizontal swipeable slides, each with an in-app mock illustration, title, subtitle
- Dot indicators: active dot = 24 px wide teal; inactive = 8 px grey
- **Skip** button (top-right, slides 1–4): marks flag + navigates
- **Next** button: advances to next slide; becomes **Get Started** on slide 5
- `onFinish` prop called by both Skip and Get Started → `app/index.jsx` writes flag then navigates
- `AuthGuard` in `_layout.jsx` is inert while on the root index (`segments[0] === undefined`)

---

### `LoginScreen` → `/(auth)/login`
- Email/password or Google → `supabase.auth.signIn*` → on session event → `apiGetProfile()` → `setUser(profile, session)`
- AuthGuard redirects based on role after login

---

### `BooksScreen` → `/(app)/books` _(regular user)_
- `useBooks()` — queryKey `['books']`, staleTime 2 min, calls `GET /api/v1/books`
- Header: total net balance (sum across all books), book count, theme toggle, avatar → settings
- Sort modes: `updated` (default) | `created` | `alpha` | `custom` (drag-reorder)
- FAB → "Add New Book" modal → `useCreateBook().mutate({ name })`
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
- `useQuery({ queryKey: ['admin-users'], queryFn: apiGetAllUsers, refetchInterval: 10000 })`
  - Polls every **10 seconds** so new user registrations appear near-instantly
- `useQuery({ queryKey: ['books'], queryFn: apiGetBooks })` — admin's own books for header stats
- Header stats: Total Users (+ active sub-count) | Total Books | Storage
- Each user row: avatar, full name, status pill (read-only `is_active`), email, **access badge** (share icon + `shared_books_count` when > 0) — storage shown only in the detail modal, not in the row
- **No status toggle** — `is_active` is read-only, reflects actual DB state
- Tap user card → **User Detail Modal** (read-only):
  - Avatar, name, email, status pill
  - Stats row: Books / Entries / Storage / Access Given (`shared_books_count`)
  - Account Status info card: lock icon + Active/Inactive badge — no Switch or confirm dialog
  - Access Given info card: only shown when `shared_books_count > 0`; shows share icon + description
- Filters (all compose client-side, horizontal scroll row):
  - **All** chip — resets all filters
  - **Status** dropdown → Active / Inactive
  - **Access** dropdown → Has Shared Books / No Shared Books (filters by `shared_books_count`)
  - **Date** dropdown → Today / Last 7 Days / This Month / This Year / All Time (filters by `created_at`)
- The `books` stat in the header = `filteredUsers.reduce(book_count) + adminOwnBooks.length` (admin books only added when no filters active)

---

### `BookDetailScreen` → `/(app)/books/[id]`
- Fetches entries (`['entries', bookId]`) and summary (`['summary', bookId]`)
- Search bar (client-side), filter chips (client-side)
- Entries grouped by date; long-press entry → delete
- "Cash In" / "Cash Out" → `add-entry?type=in|out`
- Reports icon → `/(app)/books/[id]/reports`
- Settings icon → `/(app)/books/[id]/book-settings`

---

### `AddEntryScreen` → `/(app)/books/[id]/add-entry`
- `type` param from query string (`'in'` or `'out'`)
- On save: `apiCreateEntry(bookId, payload)` → invalidates `['entries', bookId]`, `['summary', bookId]`, `['books']`

---

### `EditEntryScreen` → `/(app)/books/[id]/edit-entry`
- Toggle type allowed; delete button → confirm → pop
- On save: `apiUpdateEntry` → invalidates entries, summary, books

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
- Gated: paid / superadmin only (`canAccess(user, 'cloud_sync')`); free users see upgrade card
- Status card: online dot (animated pulse), last-sync time, upload + restore progress bars
- Local data card: counts for books / entries / categories / customers / suppliers
- **Cloud Actions** (paid only):
  - "Sync to Cloud" → `SyncConfirmSheet` → `syncLocalToCloud(onProgress)` → toast
  - "Restore from Cloud" → `RestoreOrFreshSheet` → `syncCloudToLocal(onProgress)` → toast
  - "Clear local data only" → `ClearLocalDataSheet` → `localClearAll()`
- **Danger Zone**: "Start Fresh" → `FreshStartSheet` (2-step confirm) → `apiDeleteBook()` for each cloud book → `localClearAll()` → toast
- All sync/restore state in `useSyncStore`: `isSyncing`, `isRestoring`, `progress`, `restoreProgress`

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

## Books CRUD — Data Flow

### Create
1. Modal → `useCreateBook().mutate({ name })`
2. `onMutate`: optimistic prepend with `id: '__optimistic__'` → UI updates instantly
3. `POST /api/v1/books` → real book inserted in DB
4. `onSuccess`: `invalidateQueries(['books'])` → refetch → cache = real DB row with actual UUID
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
| `syncStore` | Zustand | `isOnline`, `isSyncing`, `isRestoring`, `progress { done, total, step }`, `restoreProgress { done, total, step }`, `lastSyncedAt`, `syncError`, `restoreError`, `showRestorePrompt`; actions: `startSync`, `finishSync`, `failSync`, `startRestore`, `finishRestore`, `failRestore`, `setProgress`, `setRestoreProgress` |
| `['books']` | React Query | All books for current user; staleTime 2 min |
| `['admin-users']` | React Query | All non-admin users; refetchInterval 10 s |
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
