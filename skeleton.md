# Ultimate CashBook — Full App Skeleton & Use-Case Reference

This file is the authoritative click-by-click use-case map of the Ultimate CashBook app.
**Every time any screen, component, or navigation flow changes, update this file.**

---

## Navigation Overview

```
App Start
  └─ app/index.jsx
        └─ SplashScreen (full-screen teal, ~1.8 s) → /(auth)/login  (or /(app)/books|dashboard if already logged in)

/(auth)/login         LoginScreen
/(app)/books          BooksScreen          [role: user]
/(app)/dashboard      AdminUsersScreen     [role: superadmin]  ← lands here
/(app)/books/[id]                          BookDetailScreen
/(app)/books/[id]/add-entry               AddEntryScreen
/(app)/books/[id]/edit-entry              EditEntryScreen
/(app)/books/[id]/entry-detail            EntryDetailScreen
/(app)/books/[id]/category-detail         CategoryDetailScreen   (entries list)
/(app)/books/[id]/category-profile        CategoryProfileScreen  (detail/rename/delete)
/(app)/books/[id]/reports                 ReportsScreen
/(app)/books/[id]/book-settings           BookSettingsScreen
/(app)/settings                           SettingsScreen
/(app)/settings/profile                   ProfileScreen
/(app)/settings/business                  BusinessSettingsScreen
/(app)/settings/currency                  CurrencyScreen
/(app)/settings/subscription              SubscriptionScreen
/(app)/settings/privacy-policy            PrivacyPolicyScreen
/(app)/dashboard/users                    AdminUsersScreen     [superadmin]
/(app)/dashboard/books                    AdminBooksScreen     [superadmin]
/(app)/dashboard/settings                 SettingsScreen       [superadmin]
```

**Auth Guard logic** (`app/_layout.jsx`):
- After login, reads `user.role` from `authStore`
- `role === 'superadmin'` → push `/(app)/dashboard/users`
- `role === 'user'` → push `/(app)/books`
- On `SIGNED_OUT` event → push `/(auth)/login`

---

## 0. Splash Screen — `app/index.jsx`

**Purpose:** Full-screen branded splash shown on every launch while auth state resolves. Navigates automatically after ~1.8 s.

### Layout
- Full-screen teal (`#39AAAA`) background
- Centered card (glassmorphism — `rgba(255,255,255,0.15)`, rounded, border) with:
  - App icon (from `assets/icon.png`)
  - App name "Ultimate CashBook" in white bold
  - Three pill chips: Income · Expense · Reports
- "Developed by Devautobot / devautobot.com" footer at the bottom
- Card fades in + springs to scale on mount

### Flow
1. App opens → splash renders immediately
2. After 1.8 s → navigates based on auth state:
   - No user → `/(auth)/login`
   - `role === 'superadmin'` → `/(app)/dashboard/users`
   - `role === 'user'` → `/(app)/books`

---

## 1. LoginScreen — `/(auth)/login`

**Purpose:** Authenticate user via Google OAuth or Email OTP.

### UI Elements

| Element                           | Action | Result                                                                              |
|-----------------------------------|--------|-------------------------------------------------------------------------------------|
| "Continue with Google" button     | Tap    | `supabase.auth.signInWithOAuth({ provider: 'google' })` — opens browser OAuth flow |
| "Continue with Email" button      | Tap    | Opens EmailModal (Step 1) — **dev-only**, hidden in production builds (`__DEV__ === false`); the "or" divider is hidden with it |

### EmailModal — Step 1 (Email input)
| Element                           | Action | Result                                                           |
|-----------------------------------|--------|------------------------------------------------------------------|
| Email input                       | Type   | Updates local state                                              |
| "Send OTP" / "Continue" button    | Tap    | `supabase.auth.signInWithOtp({ email })` → advances to OTP step |
| Close / Back                      | Tap    | Closes modal                                                     |

### EmailModal — Step 2 (OTP verification)
| Element               | Action | Result                                                     |
|-----------------------|--------|------------------------------------------------------------|
| 6-digit OTP input     | Type   | Updates local state                                        |
| "Verify" button       | Tap    | `supabase.auth.verifyOtp({ email, token, type: 'email' })` |
| "Resend OTP"          | Tap    | Re-calls `signInWithOtp`                                   |

### After Successful Login
1. `SupabaseAuthListener` detects `SIGNED_IN` event
2. Fetches profile from `GET /api/v1/profile`
3. Stores in `authStore` (`setUser(profile, session)`)
4. `AuthGuard` redirects based on role

### Error States
- Invalid OTP → toast "Invalid OTP, please try again"
- Network error → toast with error message
- Inactive account → toast "Account disabled. Contact admin."

---

## 1b. Restore-or-Later — splash-screen sheet (paid/superadmin only)

**Trigger:** `app/index.jsx` checks after the 1.8 s splash delay when:
- User is paid tier or superadmin (`canAccess(user, 'cloud_sync')`)
- Device is online
- `getLocalStats().books === 0` AND `getCloudDeltaStats().hasCloudData === true`

**Rendered in:** `app/index.jsx` (above the splash content, as a bottom sheet)

### Layout
- `RestoreOrFreshSheet` — bottom sheet with handle bar, cloud icon, title, two option cards

### UI Elements

| Element               | Action | Result                                                                        |
|-----------------------|--------|-------------------------------------------------------------------------------|
| **Restore** card      | Tap    | Sheet dismisses → global `RestoreCompletionOverlay` shown → `syncCloudToLocal()` runs with animated progress bar → success/error toast → navigate to books → overlay persists until books load → overlay fades out |
| **Later** card        | Tap    | Sheet dismisses → navigate to books (no sync); user can restore from Backup & Sync later |

### RestoreCompletionOverlay (global full-screen animated overlay — `app/_layout.jsx`)
- Shown immediately after tapping **Restore** and stays visible across navigation (survives `router.replace()`)
- **Phase 1 — Downloading:** animated pulsing ☁️ icon, progress bar (0–100%), step label, item count, "Please keep the app open" note
- **Phase 2 — Loading books:** title changes to "Restore complete!", sub changes to "Loading your books…", progress bar stays at 100%
- Fades out with a 350 ms animation once `BooksView` signals books have finished loading (`restoreJustCompleted` cleared)
- Cannot be dismissed by the user
- Implemented in `app/_layout.jsx` as `<RestoreCompletionOverlay />` rendered above everything; `zIndex: 9999`
- State: `syncStore.restoreJustCompleted` (bool) — set `true` by `finishRestore()` callers, cleared `false` by `BooksView.useEffect` when `!isLoading`

### States
| State        | Display                                                                       |
|--------------|-------------------------------------------------------------------------------|
| Default      | Two option cards: Restore (teal) / Later (neutral)                             |
| Restoring    | Full-screen overlay with animated progress bar; sheet is hidden                |
| Restore done, books loading | Overlay shows "Restore complete! / Loading your books…", progress at 100% |
| Books loaded | Overlay fades out (350 ms); books list becomes visible                         |

### Notes
- Sheet only appears once per session (no SecureStore flag — re-checked every cold launch)
- If restore fails → error toast + navigate to books; user can retry from Settings → Backup & Sync
- `isRestoring` / `restoreProgress` / `restoreJustCompleted` stored in `syncStore.js`

---

## 2. BooksScreen — `/(app)/books` (role: user)

**Component:** `BooksScreen.jsx` → delegates entirely to `BooksView.jsx`

### Header Row
| Element                                | Action | Result                                                          |
|----------------------------------------|--------|-----------------------------------------------------------------|
| Avatar (top-left)                      | Tap    | Navigate to `/(app)/settings/profile`                           |
| User name                              | —      | Display only                                                    |
| Tier chip (FREE / PRO / BUSINESS)      | Tap    | Navigate to `/(app)/settings/subscription`                      |
| "Personal Workspace" subtitle          | —      | Display only; tappable workspace switcher if shared books exist  |
| Theme toggle (moon/sun icon)           | Tap    | `toggleTheme()` — switches dark/light mode globally             |

**Tier chip colours (on teal header):** FREE → semi-transparent white pill; PRO → amber pill (`#FCD34D`); BUSINESS → purple pill (`#C4B5FD`). Always visible.

### Free Plan Banner (free tier only)
| Element                                                              | Action | Result                                     |
|----------------------------------------------------------------------|--------|--------------------------------------------|
| "Free plan · Data stored on this device only. Tap to upgrade."       | Tap    | Navigate to `/(app)/settings/subscription` |

### Search Bar
| Element           | Action | Result                                            |
|-------------------|--------|---------------------------------------------------|
| Search input      | Type   | Filters books list by name (client-side, instant) |
| Clear (✕) button  | Tap    | Clears search query                               |

### Sort Button / Sort Sheet
| Element                     | Action | Result                                    |
|-----------------------------|--------|-------------------------------------------|
| Sort label / icon           | Tap    | Opens `SortSheet` bottom sheet            |
| **Last Updated** option     | Tap    | Sorts by `updated_at` descending          |
| **Created At** option       | Tap    | Sorts by `created_at` descending          |
| **Alphabetical** option     | Tap    | Sorts A→Z by book name                    |
| **Drag to Reorder** option  | Tap    | Activates drag-handle on each card        |

### Book Card
| Element          | Action | Result                                             |
|------------------|--------|----------------------------------------------------|
| Card body        | Tap    | Navigate to `/(app)/books/[id]` (BookDetailScreen) |
| ⋮ (3-dot menu)  | Tap    | Opens `BookMenu` bottom sheet                      |

### BookMenu Bottom Sheet
| Element              | Action | Result                                          |
|----------------------|--------|-------------------------------------------------|
| **Rename**           | Tap    | Opens rename modal with current name pre-filled |
| **Delete**           | Tap    | Opens delete confirmation modal                 |
| Dismiss / drag down  | —      | Closes sheet                                    |

#### Rename Modal
| Element                  | Action | Result                                                                   |
|--------------------------|--------|--------------------------------------------------------------------------|
| Name input               | Edit   | Updates new name state                                                   |
| "Save" / confirm button  | Tap    | `useRenameBook().mutate({ bookId, name })` → optimistic update + refetch |
| Cancel                   | Tap    | Closes modal without saving                                              |

#### Delete Confirmation Modal
| Element                  | Action | Result                                                                                       |
|--------------------------|--------|----------------------------------------------------------------------------------------------|
| "Delete" confirm button  | Tap    | `useDeleteBook().mutate(bookId)` → optimistic removal → `DELETE /api/v1/books/:id` → refetch |
| Cancel                   | Tap    | Closes modal                                                                                 |

### FAB ("+ Add New Book")
| Element    | Action | Result                     |
|------------|--------|----------------------------|
| FAB button | Tap    | Opens "Add New Book" modal |

#### Add New Book Modal
| Element          | Action | Result                                                                                    |
|------------------|--------|-------------------------------------------------------------------------------------------|
| Book name input  | Type   | Updates `newBookName` state                                                               |
| "Create" button  | Tap    | `useCreateBook().mutate({ name })` → optimistic prepend → `POST /api/v1/books` → refetch |
| Cancel / close   | Tap    | Closes modal, clears input                                                                |

### Bottom Navigation Bar
| Tab                     | Action | Result                         |
|-------------------------|--------|--------------------------------|
| **Cashbooks** (active)  | Tap    | Already on this screen         |
| **Help**                | Tap    | (TODO — no-op or placeholder)  |
| **Settings**            | Tap    | Navigate to `/(app)/settings`  |

### Loading / Error / Empty States
| State                        | Display                                                                                   |
|------------------------------|-------------------------------------------------------------------------------------------|
| Loading                      | Skeleton cards (animated placeholders)                                                    |
| Error                        | Error message + "Retry" button → re-triggers `useBooks()`                                 |
| Empty (no books, free tier)  | Empty icon box + "No books yet" + "Tap Add New Book to start tracking your cash flow"     |
| Empty (no books, paid/admin) | Empty icon box + "No books yet" + "Your cloud data can be restored from Backup & Sync in Settings" |
| Syncing / restore in progress| Cloud-lightning icon box + "Restoring your data…" + "Downloading books & entries from cloud" |
| Empty search results         | "No results found" + "No books match '[query]'"                                           |

---

## 3. AdminBooksScreen — `/(app)/dashboard/books` (role: superadmin)

**Identical to BooksScreen** with these differences:
- Header shows "Admin Workspace" instead of "Personal Workspace"
- No bottom nav bar (FAB is at `bottom: 16` instead of above nav)
- Book links go to `/(app)/dashboard/books/[id]` via `bookBasePath`

All interactions, mutations, states, and API calls are identical to BooksScreen.

---

## 4. AdminUsersScreen — `/(app)/dashboard/users` (role: superadmin)

**Layout:** Default landing for superadmin. Three tabs at the top (Expo `<Tabs>`):
- **Users** (this screen)
- **My Books** → AdminBooksScreen
- **Settings** → SettingsScreen

### Header Row
| Element                              | Action | Result                           |
|--------------------------------------|--------|----------------------------------|
| Avatar (top-left)                    | Tap    | Navigate to admin profile screen |
| "Dashboard" title                    | —      | Display only                     |
| SuperAdmin badge (animated sparks)   | —      | Display only                     |
| Theme toggle                         | Tap    | `toggleTheme()`                  |

### Stats Row (auto-refreshed every 10 s)
- Total Users count + active sub-count
- Total Books count (filtered users + admin's own books when no filter active)
- Storage used (sum of `storage_mb` across filtered users)

### Search Bar
| Element      | Action | Result                                           |
|--------------|--------|--------------------------------------------------|
| Search input | Type   | Filters user list by name or email (client-side) |
| Clear (✕)    | Tap    | Clears query                                     |

### Filter Row (horizontal scroll — chips compose together)

| Chip           | State | Action | Result |
|----------------|-------|--------|--------|
| **All**        | Active when all filters at default | Tap | Resets all filters to default |
| **Plan ▾**     | Highlighted when active | Tap | Opens **Plan Picker Sheet** |
| **All Time ▾** | Highlighted when date filter set | Tap | Opens **Date Picker Sheet** |

Both filters compose client-side.

#### Date Picker Sheet (filters by `created_at` join date)
| Option        | Result                                     |
|---------------|--------------------------------------------|
| All Time      | No date filter (default)                   |
| Today         | Users registered today                     |
| Last 7 Days   | Users registered in last 7 days            |
| This Month    | Users registered this calendar month       |
| This Year     | Users registered this calendar year        |

### User Card
Each card shows: avatar (or initials), full name, **subscription plan pill** (Free / Pro / Business — colored per plan), email, and **access badge** (if user has shared any books — shows share icon + count). Storage is shown only in the detail modal.

| Element | Action | Result                      |
|---------|--------|-----------------------------|
| Card    | Tap    | Opens **User Detail Modal** |

### User Detail Modal
| Element                                        | Action | Result         |
|------------------------------------------------|--------|----------------|
| Avatar ring, name, email                       | —      | Display only; avatar/ring/dot color driven by subscription plan color |
| Stats row: Books / Entries / Storage / Access  | —      | Display only; "Access Given" column shows count of accepted book shares; highlighted in primary color when > 0 |
| **Access Given info card** (only when count>0) | —      | Shows share icon + "Sharing N books with other users" |
| **Subscription card**                          | —      | Shows tier/cycle label; styled with plan accent color |
| Close (✕) / backdrop tap                       | Tap    | Closes modal   |

No Account Status card — users are differentiated by subscription tier (Free / Pro / Business), not by `is_active`.

### Data source
- User list: `GET /api/v1/admin/users` — returns `book_count`, `entry_count`, `storage_mb` (real bytes via RPC), `shared_books_count` (accepted `book_shares` where user is owner)
- `shared_books_count` counts accepted `book_shares` rows where `owner_id = user.id`

### Polling
- `GET /api/v1/admin/users` called every **10 seconds** while screen is focused
- New users appear automatically without manual refresh

### Error / Empty States
| State           | Display                                      |
|-----------------|----------------------------------------------|
| Loading         | Skeleton rows                                |
| Empty (filters) | Icon box + "No users found" + filter hint    |

---

## 5. BookDetailScreen — `/(app)/books/[id]`

**Purpose:** View and manage all entries in a single book.

### Header Row
| Element            | Action | Result                                            |
|--------------------|--------|---------------------------------------------------|
| Back (←)           | Tap    | Navigate back to BooksScreen                      |
| Book name (title)  | —      | Display only                                      |
| User-plus icon     | Tap    | (TODO — invite collaborator, not yet implemented) |
| ⋮ (3-dot menu)    | Tap    | Opens dropdown menu                               |

### Dropdown Menu
| Option                  | Action | Result                                           |
|-------------------------|--------|--------------------------------------------------|
| **Book Settings**       | Tap    | Navigate to `/(app)/books/[id]/book-settings`    |
| **Delete All Entries**  | Tap    | Opens `DeleteAllEntriesSheet` confirmation sheet |

### DeleteAllEntriesSheet
| Element               | Action | Result                                                    |
|-----------------------|--------|-----------------------------------------------------------|
| Entry count display   | —      | Shows "X entries will be deleted"                         |
| "Delete All" confirm  | Tap    | `DELETE /api/v1/books/:id/entries` (all) → success dialog |
| Cancel / drag down    | —      | Closes sheet                                              |

### Search Bar
| Element       | Action | Result                                             |
|---------------|--------|----------------------------------------------------|
| Search input  | Type   | Filters entries by remark or amount (client-side)  |
| Clear (✕)     | Tap    | Clears search                                      |

### Filter Chips Row
Each chip shows the active filter (or default label). Tap to open picker.

| Chip              | Picker Options                                             | Applies                                    |
|-------------------|------------------------------------------------------------|--------------------------------------------|
| **Date**          | Today / Yesterday / This Week / This Month / Custom range  | Filters by `entry_date`                    |
| **Entry Type**    | Cash In / Cash Out                                         | Filters by `type`                          |
| **Contact**       | List of Customers & Suppliers                              | Filters by `customer_id` or `supplier_id`  |
| **Category**      | List of book categories                                    | Filters by `category_id`                   |
| **Payment Mode**  | Cash / Online / Cheque / Other                             | Filters by `payment_mode`                  |

Active filter chips show a colored indicator. Tap active chip → clears that filter.

### Balance Summary Card
| Element              | Action | Result                                      |
|----------------------|--------|---------------------------------------------|
| Net Balance          | —      | Display only (from `books.net_balance`)     |
| Total In             | —      | Display only (from summary)                 |
| Total Out            | —      | Display only (from summary)                 |
| **"VIEW REPORTS"** button | Tap | Navigate to `/(app)/books/[id]/reports`  |

### Entry List (grouped by date)
Sections collapsed/expanded per date.

| Element              | Action      | Result                                                                               |
|----------------------|-------------|--------------------------------------------------------------------------------------|
| Date section header  | Tap         | Toggles collapse/expand for that date group                                          |
| Entry card           | Tap         | Navigate to `/(app)/books/[id]/entry-detail` with entry data                         |
| Entry card           | Long press  | Alert: "Delete this entry?" → confirm → `DELETE /api/v1/books/:id/entries/:entry_id` |

#### Entry Card displays:
- Payment mode badge (Cash / Online / Cheque / Other)
- Remark text
- Category name (if set)
- Time
- Amount (green = Cash In, red = Cash Out)

### Sticky Action Buttons (bottom)
| Button       | Action | Result                                                |
|--------------|--------|-------------------------------------------------------|
| **CASH IN**  | Tap    | Navigate to `/(app)/books/[id]/add-entry?type=in`     |
| **CASH OUT** | Tap    | Navigate to `/(app)/books/[id]/add-entry?type=out`    |

### Loading / Error / Empty States
| State                | Display                                                    |
|----------------------|------------------------------------------------------------|
| Loading entries      | Skeleton list                                              |
| Error                | Error message + retry                                      |
| Empty book           | "No entries yet. Add your first entry."                    |
| Empty filter result  | "No entries match your filters" with clear-filters button  |

---

## 6. AddEntryScreen — `/(app)/books/[id]/add-entry`

**Purpose:** Create a new Cash In or Cash Out entry.

### Header
| Element                         | Action | Result                          |
|---------------------------------|--------|---------------------------------|
| Back (←)                        | Tap    | Navigate back to BookDetailScreen |
| "Cash In" or "Cash Out" title   | —      | Derived from route param `type` |

### EntryForm Fields

| Field                    | Visibility                                       | Behavior                                      |
|--------------------------|--------------------------------------------------|-----------------------------------------------|
| **Amount**               | Always                                           | Auto-focused; numeric keyboard; required      |
| **Remark**               | Always                                           | Optional text; max length not enforced        |
| **Category**             | If `book.show_category = true`                   | Tap → opens CategoryPickerModal               |
| **Customer / Supplier**  | If `book.show_customer` or `book.show_supplier`  | Tap → opens ContactPickerModal                |
| **Payment Mode**         | Always                                           | Tap → opens dropdown; **required**            |
| **Date**                 | Always                                           | Tap → opens DatePickerModal (defaults today)  |
| **Time**                 | Always                                           | Tap → opens TimePickerModal (defaults now)    |
| **Attachment**           | If `book.show_attachment = true`                 | Tap → opens attachment picker sheet           |

#### CategoryPickerModal
| Element              | Action | Result                                |
|----------------------|--------|---------------------------------------|
| Search input         | Type   | Filters categories by name            |
| Category row         | Tap    | Selects category, closes modal        |
| "+ Create Category"  | Tap    | Creates category inline + selects it  |

#### ContactPickerModal
| Tab            | Content                             |
|----------------|-------------------------------------|
| **Customers**  | List of customers for this book     |
| **Suppliers**  | List of suppliers for this book     |

| Element                    | Action | Result                               |
|----------------------------|--------|--------------------------------------|
| Search input               | Type   | Filters contacts by name or phone    |
| Contact row                | Tap    | Selects contact, closes modal        |
| "+ Add Customer/Supplier"  | Tap    | Navigates to contact creation screen |

#### Attachment Picker Sheet
| Option                      | Action | Result                                                                              |
|-----------------------------|--------|-------------------------------------------------------------------------------------|
| **Take Photo**              | Tap    | Opens device camera; captured image is compressed (1000 px wide, 0.55 JPEG quality) |
| **Choose from Gallery**     | Tap    | Opens image picker; image compressed same way                                       |
| **Choose PDF / Document**   | Tap    | Opens file picker; PDF uploaded as-is                                               |
| Max size                    | —      | 6 MB limit; over-limit shows toast error                                            |

### Save Button
| State     | Behavior                                                                                                         |
|-----------|------------------------------------------------------------------------------------------------------------------|
| Disabled  | While save is in progress                                                                                        |
| Enabled   | Tap → validates form (amount + payment mode required) → `POST /api/v1/books/:id/entries` → on success navigate back |

### Error States
- Amount missing → inline validation error "Amount is required"
- Payment mode missing → inline validation error
- Attachment > 6 MB → toast "File too large (max 6 MB)"
- API error → toast with server message

---

## 7. EditEntryScreen — `/(app)/books/[id]/edit-entry`

**Purpose:** Edit an existing entry; pre-fills EntryForm with current values.

### Header
| Element             | Action | Result                       |
|---------------------|--------|------------------------------|
| Back (←)            | Tap    | Navigate back                |
| "Edit Entry" title  | —      | Display                      |
| Trash icon          | Tap    | Opens animated DeleteSheet   |

### EntryForm
- Same fields as AddEntryScreen
- `showTypeToggle = true` → user can switch type between In/Out
- Pre-filled from entry data passed via navigation params
- If linked contact was deleted → contact field shows "(deleted)" + form disabled
- If linked category was deleted → category shows "(deleted)"

### Update Button
| State     | Behavior                                                                              |
|-----------|---------------------------------------------------------------------------------------|
| Disabled  | If contact or category is deleted, or while saving                                    |
| Enabled   | Tap → validate → `PUT /api/v1/books/:id/entries/:entry_id` → navigate back on success |

### Delete Sheet (animated bottom sheet)
| Element                | Action | Result                                                                        |
|------------------------|--------|-------------------------------------------------------------------------------|
| "Delete Entry" button  | Tap    | Alert confirm → `DELETE /api/v1/books/:id/entries/:entry_id` → navigate back  |
| Cancel                 | Tap    | Closes sheet                                                                  |

---

## 8. EntryDetailScreen — `/(app)/books/[id]/entry-detail`

**Purpose:** Read-only view of a single entry with all details.

### Header
| Element               | Action | Result         |
|-----------------------|--------|----------------|
| Back (←)              | Tap    | Navigate back  |
| "Entry Detail" title  | —      | Display        |
| ⋮ (3-dot menu)       | Tap    | Opens dropdown |

### Dropdown Menu
| Option             | Action | Result                                                          |
|--------------------|--------|-----------------------------------------------------------------|
| **Backup Entry**   | Tap    | (TODO — not implemented)                                        |
| **Delete Entry**   | Tap    | Alert "Delete this entry?" → confirm → `DELETE` → navigate back |

### Amount Card
- Large amount display with +/− sign
- Type badge (CASH IN / CASH OUT)
- Date and time

### Detail Rows
| Row                    | Content                         |
|------------------------|---------------------------------|
| Remark                 | Entry remark text               |
| Category               | Category name (or "—" if none)  |
| Payment Mode           | Mode name                       |
| Customer / Supplier    | Contact name (or "—")           |
| Date                   | Formatted date                  |
| Time                   | Formatted time                  |
| Entry by               | User's name                     |

### Attachment Card (shown only if attachment exists)
| Element           | Action  | Result                                   |
|-------------------|---------|------------------------------------------|
| Image thumbnail   | Tap     | Opens full-screen image viewer modal     |
| PDF icon          | Tap     | Opens PDF URL in system browser / viewer |
| "View" button     | Tap     | Same as tapping thumbnail/icon           |

### Image Viewer Modal
| Element            | Action      | Result       |
|--------------------|-------------|--------------|
| Full-screen image  | Pinch/zoom  | Zoom in/out  |
| Close (✕) button   | Tap         | Closes modal |

### Bottom Bar
| Button            | Action | Result                                                         |
|-------------------|--------|----------------------------------------------------------------|
| **"Edit Entry"**  | Tap    | Navigate to `/(app)/books/[id]/edit-entry` with entry data     |

---

## 9. CategoryDetailScreen — `/(app)/books/[id]/category-detail`

**Purpose:** View all entries belonging to one category within a book.

### Header
| Element              | Action | Result            |
|----------------------|--------|-------------------|
| Back (←)             | Tap    | Navigate back     |
| Category name        | —      | Display           |
| "Category Balance"   | —      | Display           |

### Summary Card
- Cash In total
- Net Balance
- Cash Out total

### Search Bar
| Element       | Action | Result                                               |
|---------------|--------|------------------------------------------------------|
| Search input  | Type   | Filters entries by remark, payment mode, or amount   |
| Clear         | Tap    | Clears search                                        |

### Entry List (grouped by date, collapsible)
| Element              | Action | Result                        |
|----------------------|--------|-------------------------------|
| Date section header  | Tap    | Toggles collapse/expand       |
| Entry card           | Tap    | Navigate to EntryDetailScreen |

#### Entry Card displays:
- Left color border (green = in, red = out)
- Payment mode badge
- Remark
- Meta (category, time)
- Amount

### Loading / Empty States
| State    | Display                       |
|----------|-------------------------------|
| Loading  | Skeleton                      |
| Empty    | "No entries in this category" |

---

## 9b. CategoryProfileScreen — `/(app)/books/[id]/category-profile`

**Purpose:** View and manage a single category — balance, rename, view entries, delete.

**Navigation in:** `CategoriesSettingsScreen` → tap any category card

### Header
| Element              | Action | Result                           |
|----------------------|--------|----------------------------------|
| Back (←)             | Tap    | Navigate back to Categories list |
| "Category Details"   | —      | Display                          |

### Avatar Card
- Tag icon + category name + "Category" badge

### Balance Section
- Cash In total
- Net Balance (colour: green if ≥ 0, red if < 0)
- Cash Out total
- Values read from `categories` list cache (no separate API call)

### Category Info
| Element               | Action | Result                                    |
|-----------------------|--------|-------------------------------------------|
| Name field (AppInput) | Edit   | Marks form dirty; editable only if `canEdit` |

### Save Changes Button
- Visible only when `canEdit`
- Active only when form is dirty and not already saving
- On tap: `PUT /api/v1/books/:id/categories/:id` → invalidate `['categories', bookId]` → `SuccessDialog`

### View All Entries Button
| Element             | Action | Result                                            |
|---------------------|--------|---------------------------------------------------|
| "View All Entries"  | Tap    | Navigate to `CategoryDetailScreen` (entries list) |

### Danger Zone
- Visible only when `canDelete`
- "Delete Category" row → opens `DeleteCategorySheet` (requires typing category name to confirm)
- On confirm: `DELETE /api/v1/books/:id/categories/:id` → `router.back()`

### States
| State                   | Behaviour                                                     |
|-------------------------|---------------------------------------------------------------|
| Loading (first paint)   | `ActivityIndicator` while categories fetch                    |
| View-only collaborator  | Name field read-only; Save button hidden; Danger Zone hidden  |

---

## 10. ReportsScreen — `/(app)/books/[id]/reports`

**Status: Complete.**

### Header
| Element                | Action | Result        |
|------------------------|--------|---------------|
| Back (‹)               | Tap    | Navigate back |
| "Reports" + book name  | —      | Display only  |

### Date Filter Chips (horizontal scroll)
| Chip             | Effect                                                                           |
|------------------|----------------------------------------------------------------------------------|
| This Month       | Sets `date_from` = first day of current month, `date_to` = today                |
| Last Month       | Sets `date_from` / `date_to` to previous calendar month                          |
| Last 3 Months    | Sets `date_from` = 3 months ago (first of month), `date_to` = today             |
| All Time         | No date filter — loads all entries                                               |
| Custom           | Shows two date picker buttons (From / To) using DateTimePickerModal              |

Selecting any chip triggers a React Query refetch with the new date range.

### Custom Date Pickers (visible only when "Custom" chip is active)
| Element        | Action | Result                                                    |
|----------------|--------|-----------------------------------------------------------|
| "From" button  | Tap    | Opens DateTimePickerModal (date mode) → sets `customFrom` |
| "To" button    | Tap    | Opens DateTimePickerModal (date mode) → sets `customTo`   |

### Date Range Label
- Displays the active period (e.g. "Jan 1, 2025 – May 12, 2025") or "All entries"
- Shows a small ActivityIndicator while loading

### Summary Cards (3 in a row)
All values are computed client-side from the filtered entries list.
- **Income** (green, ↑) — sum of `type=in` amounts
- **Expenses** (red, ↓) — sum of `type=out` amounts
- **Net** (green/red, ≈) — income minus expenses

### Bar Chart — Income vs Expenses
- Three bars: In / Out / Net
- Bar heights are proportional to the largest value
- Values labeled above each bar; category labels below
- Uses `C.cashIn` / `C.cashOut` colours from theme

### Recent Entries Preview (up to 8)
- Each row: coloured dot icon, remark, date · category · mode · contact, amount (+/-)
- If more than 8 entries exist, shows "+N more entries included in export" note
- Empty state: "No entries for this period"

### Export Section
Data loaded: React Query key `['report-entries', bookId, dateFrom, dateTo]` via `GET /api/v1/books/:id/entries?date_from=&date_to=`.

| Button                              | Action | Result                                                                                                                                                   |
|-------------------------------------|--------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Export as PDF** (red border)      | Tap    | `FileSystem.downloadAsync` → `GET /api/v1/books/:id/report/pdf?date_from=&date_to=` with Bearer token → saves to cache dir → `Sharing.shareAsync()` opens native share sheet |
| **Export as Excel** (green border)  | Tap    | Same flow but `GET /api/v1/books/:id/report/excel` → `.xlsx` → `Sharing.shareAsync()`                                                                   |

Both buttons show `ActivityIndicator` while downloading.  Both buttons disabled while an export is in progress.  Share sheet includes: Save to Files, WhatsApp, Email, Google Drive, Dropbox, and any installed app that handles PDF or XLSX.

### Loading / Error / Empty States
| State                  | UI                                                |
|------------------------|---------------------------------------------------|
| Loading entries        | ActivityIndicator next to date range label        |
| No entries in range    | "No entries for this period" in entries section   |
| Export error           | `Alert.alert('Export Failed', message)`           |
| Sharing unavailable    | `Alert.alert('File Saved', localPath)`            |

---

## 11. BookSettingsScreen — `/(app)/books/[id]/book-settings`

**Purpose:** Configure which fields are visible in the EntryForm for this book.

### Header
| Element    | Action | Result        |
|------------|--------|---------------|
| Back (←)   | Tap    | Navigate back |
| Book name  | —      | Display       |

### Field Visibility Toggles
Each toggle calls `PATCH /api/v1/books/:id/field-settings` on change.

| Toggle             | Controls                                        |
|--------------------|-------------------------------------------------|
| Show Category      | Hides/shows category picker in EntryForm        |
| Show Customer      | Hides/shows contact picker (customer tab)       |
| Show Supplier      | Hides/shows contact picker (supplier tab)       |
| Show Attachment    | Hides/shows attachment picker in EntryForm      |

### Tabs in BookSettingsScreen
BookSettingsScreen has multiple tabs:

| Tab                 | Content                                      |
|---------------------|----------------------------------------------|
| **Fields**          | Toggle field visibility (above)              |
| **Categories**      | List all categories; add / rename / delete   |
| **Customers**       | List all customers; add / edit / delete      |
| **Suppliers**       | List all suppliers; add / edit / delete      |
| **Payment Modes**   | List payment modes; add / reorder / delete   |

#### Categories Tab (`CategoriesSettingsScreen`)
- Drag-reorder enabled: drag handle (≡) on the left of each card; order saved to backend via `PATCH /api/v1/books/:id/categories/reorder`
- Optimistic update on drag-end; refetched from server on settle
- Order persists across sessions and reflects in the category picker inside AddEntryScreen / EditEntryScreen

| Element                  | Action        | Result                                                          |
|--------------------------|---------------|-----------------------------------------------------------------|
| "+ Add Category" (FAB)   | Tap           | Opens add-category modal → `POST /api/v1/books/:id/categories`  |
| Drag handle (≡)          | Press & drag  | Reorders categories; calls `PATCH /categories/reorder` on drop  |
| Category row (body)      | Tap           | Navigate to `CategoryProfileScreen`                             |
| Balance pill             | Tap           | Navigate to `CategoryProfileScreen`                             |
| Search bar               | Type          | Filters list client-side; drag disabled while searching         |

#### Customers / Suppliers Tabs (`ContactsListScreen`)
- Drag-reorder enabled per type: drag handle (≡) on left of each card; order saved to backend via `PATCH /api/v1/books/:id/customers/reorder` or `.../suppliers/reorder`
- Optimistic update on drag-end; order persists and reflects in the contact picker inside AddEntryScreen / EditEntryScreen

| Element           | Action        | Result                                                    |
|-------------------|---------------|-----------------------------------------------------------|
| "+ Add Contact"   | Tap           | Opens add-contact modal (name + phone)                    |
| Drag handle (≡)   | Press & drag  | Reorders contacts; calls `PATCH .../reorder` on drop      |
| Contact row       | Tap           | Opens `ContactDetailScreen`                               |
| Contact row       | Long-press    | Opens `ContactMenuSheet` (Edit / Delete)                  |
| Balance pill      | Tap           | Navigate to `ContactBalanceScreen`                        |
| **Delete**        | Tap in menu   | Opens `DeleteContactSheet` confirm → `DELETE`             |

---

## 12. SettingsScreen — `/(app)/settings`

Used by both regular users (bottom nav) and superadmin (dashboard Settings tab).

### Avatar Card
| Element                                        | Action | Result                                     |
|------------------------------------------------|--------|--------------------------------------------|
| Avatar / initials                              | —      | Display only                               |
| Full name                                      | —      | Display only                               |
| Email                                          | —      | Display only                               |
| Admin badge                                    | —      | Shown if superadmin                        |
| **Tier chip** (Free / 👑 Pro / 👑 Enterprise)  | Tap    | Navigate to `/(app)/settings/subscription` |
| **"Edit Profile"** button                      | Tap    | Navigate to `/(app)/settings/profile`      |

### Account Section
| Row                    | Action | Result                                  |
|------------------------|--------|-----------------------------------------|
| **Profile**            | Tap    | Navigate to `/(app)/settings/profile`   |
| **Business Settings**  | Tap    | Navigate to `/(app)/settings/business`  |
| **Currency**           | Tap    | Navigate to `/(app)/settings/currency`  |

### Subscription Section
| Row                       | Icon                       | Action | Result                                     |
|---------------------------|----------------------------|--------|--------------------------------------------|
| **Subscription & Plans**  | Diamond icon (tier color)  | Tap    | Navigate to `/(app)/settings/subscription` |

### App Section
| Row                   | Crown?             | Action | Result                                                               |
|-----------------------|--------------------|--------|----------------------------------------------------------------------|
| **Manage Access**     | 👑 Pro (if free)  | Tap    | Navigate to manage-access (if Pro+) OR subscription screen (if free) |
| **Notifications**     | —                  | Tap    | Navigate to notifications                                            |
| **Privacy & Security** | —                 | Tap    | Navigate to `/(app)/settings/privacy-policy` (PrivacyPolicyScreen)  |
| **Backup & Sync**     | 👑 Pro (if free)  | Tap    | Navigate to subscription (if free), navigate to `/(app)/settings/backup-sync` (BackupSyncScreen) otherwise |
| Language              | —                  | TODO   | —                                                                    |

### Support Section (all TODO)
| Row           | Intended Action         |
|---------------|-------------------------|
| Help & FAQ    | Open help center        |
| Rate the App  | Open app store rating   |
| Share App     | Open OS share sheet     |

### Logout
| Element                  | Action | Result                                                                                    |
|--------------------------|--------|-------------------------------------------------------------------------------------------|
| **Logout** button / row  | Tap    | Alert "Are you sure?" → confirm → `supabase.auth.signOut()` + `clearUser()` → redirect to `/login` |

---

## 13. ProfileScreen — `/(app)/settings/profile`

### Header
| Element          | Action | Result        |
|------------------|--------|---------------|
| Back (←)         | Tap    | Navigate back |
| "Profile" title  | —      | Display       |

### Avatar Card (overlapping top)
| Element                   | Action | Result                       |
|---------------------------|--------|------------------------------|
| Avatar image or initials  | Tap    | Opens **Photo Picker Sheet** |
| Camera icon (overlay)     | Tap    | Opens Photo Picker Sheet     |

### Photo Picker Sheet
| Option                   | Action | Result                                                         |
|--------------------------|--------|----------------------------------------------------------------|
| **View Photo**           | Tap    | Opens image viewer modal (full-screen)                         |
| **Take Photo**           | Tap    | Opens camera → captured image uploaded via `useUploadAvatar()` |
| **Choose from Gallery**  | Tap    | Opens image library → selected image uploaded                  |
| Cancel                   | Tap    | Closes sheet                                                   |

### Form Fields
| Field          | Editable        | Validation              |
|----------------|-----------------|-------------------------|
| Full Name      | Yes             | Required, non-empty     |
| Email          | No (read-only)  | Shows "Verified" badge  |
| Phone Number   | Yes             | Optional                |

### Update Button
| State     | Behavior                                                                       |
|-----------|--------------------------------------------------------------------------------|
| Disabled  | No changes made or save in progress                                            |
| Enabled   | Tap → `useUpdateProfile().mutate(...)` → `PUT /api/v1/profile` → success toast |

### Image Viewer Modal
| Element            | Action | Result                  |
|--------------------|--------|-------------------------|
| Full-screen photo  | —      | Display current avatar  |
| Close (✕)          | Tap    | Closes modal            |

### Loading State
- Skeleton loader while profile is fetching

---

## 13b. BackupSyncScreen — `/(app)/settings/backup-sync`

**Component:** `BackupSyncScreen.jsx`
**Access:** Paid tier / superadmin only (free tier sees upgrade gate)

### Header
- Primary-color bg, "Backup & Sync" title, back button

### Status Card
- Animated dot: green (online) / red (offline), connection type label
- Last synced timestamp (or "Never synced")
- Upload progress bar (while syncing)
- Restore progress bar (while restoring) in green
- Error message if last sync/restore failed

### Local Data Card
- Counts: Cashbooks / Entries / Categories / Customers / Suppliers

### Cloud Actions Section (paid/superadmin only)
| Button                  | State                      | Action                                                                               |
|-------------------------|----------------------------|--------------------------------------------------------------------------------------|
| **Sync to Cloud**       | Default                    | Tap → `SyncConfirmSheet` → `syncLocalToCloud()` with progress                       |
| **Sync to Cloud**       | Already synced             | Disabled, shows "All Data Synced" + green check icon                                 |
| **Sync to Cloud**       | Syncing                    | Disabled, shows "Syncing…"                                                           |
| **Restore from Cloud**  | Has cloud data             | Tap → `RestoreOrFreshSheet` → `syncCloudToLocal()` with progress                    |
| **Restore from Cloud**  | No cloud data / offline    | Disabled, shows "No cloud data found" sub-label                                      |
| **Clear local data only** | Has local data           | Tap → `ClearLocalDataSheet` → `localClearAll()` (cloud unaffected)                  |

### Danger Zone Card
| Element                   | Action | Result                                                               |
|---------------------------|--------|----------------------------------------------------------------------|
| **Start Fresh** button    | Tap    | Opens `FreshStartSheet` (2-step confirm)                             |

#### FreshStartSheet — step 1 (warning)
- Lists what will be deleted: cloud books, local data, contacts/categories
- Warning box: "This action is permanent and cannot be recovered"
- Buttons: Cancel / Continue (→ step 2)

#### FreshStartSheet — step 2 (final confirm)
- Red box: "Last chance — confirm deletion"
- Buttons: Go Back / Delete Everything (red)
- On confirm: deletes all cloud books via `apiDeleteBook()` for each, then `localClearAll()`

### Free-Tier Gate
- Shows upgrade card with crown emoji, description, "View Plans 👑" button → subscription screen

### Sheets used
| Sheet                | Purpose                                      |
|----------------------|----------------------------------------------|
| `SyncConfirmSheet`   | Confirm upload local → cloud                 |
| `ClearLocalDataSheet`| Confirm clear local only (cloud safe)        |
| `RestoreOrFreshSheet`| Confirm restore cloud → local (from screen)  |
| `FreshStartSheet`    | 2-step confirm delete cloud + local          |

---

## 14. BusinessSettingsScreen — `/(app)/settings/business`

Allows user to set their business/company details (name, address, logo, etc.).
Used for PDF report headers.
*(Detailed use-case: populate when screen is implemented)*

---

## 15. CurrencyScreen — `/(app)/settings/currency`

Allows user to set their preferred currency symbol.
*(Detailed use-case: populate when screen is implemented)*

---

## 16. SubscriptionScreen — `/(app)/settings/subscription`

**Purpose:** Show available subscription tiers and let the user subscribe, upgrade, or cancel — all through platform-native billing (Google Play / App Store).

**Navigation in:** SettingsScreen → Subscription & Plans row, tier chip tap, any crown-gated feature tap.

### Subscription Model (per SUBSCRIPTION_LIFECYCLE.md)
- Payments are processed entirely by Google Play (Android) or App Store (iOS) — the app never touches card data.
- **No manual downgrade.** Cancellation is the only way to move from a paid plan to Free.
- Cancellation deep-links the user to the platform subscription management page.
- Cancelled users keep full paid access until `subscription_expires_at`.
- When the billing period ends, the system automatically moves the user to Free (server notification).

### Subscription States
| `subscription_status` | Meaning | Access |
|---|---|---|
| `free` | Never subscribed or expired | Free tier limits |
| `active` | Paid and current | Full paid access |
| `cancelled` | Cancelled; period still running | Full paid access until `expires_at` |
| `expired` | Period ended after cancellation | Moved to Free automatically |
| `past_due` | Renewal payment failed | Full access during retry window |

### Superadmin View (read-only)
When `user.role === 'superadmin'`, the screen is fully read-only:
- Info banner below the header: "👑 As an admin, all features are included at no cost. Plans are shown for reference only."
- Current Plan Banner shows **"Admin"** with "· All features included" subtitle (no billing cycle chip, no timing grid)
- Billing toggle (Monthly / Yearly) is **fully functional** — superadmin can switch to browse pricing
- Every plan card shows **"✓ Included"** outline button — no action buttons

### Current Plan Banner (regular users)
- Shows the user's active tier name + crown emoji (paid plans)
- Billing cycle chip (Monthly / Yearly) shown for paid plans
- **"Cancelled" pill** shown next to tier name when `subscription_cancel_at_period_end = true`
- Timing grid (Started / Access until or Renews / Days left) shown for paid plans only
- Free plan shows "· Always free" subtitle, no timing grid

### Past-Due Banner
Shown above the current plan banner when `subscription_status === 'past_due'`:
- Yellow warning card: "⚠️ Payment Failed — Please update your payment method in [Google Play / App Store]"
- Tappable "Open [Platform] →" link deep-links to platform subscription settings

### Plan Cards (stacked: Free → Pro → Business)

Each card shows:
- Tier name + crown emoji (Pro/Business), price, billing period
- "Cancels [date]" badge on the current plan card when cancelled
- Feature list with ✓ (included, accent color) / ✗ (excluded, muted)
- Action button (per CTA table below)

| Plan        | Color              | Crown | Monthly  | Yearly      |
|-------------|--------------------|-------|----------|-------------|
| Free        | C.primary (teal)   | —     | $0       | $0          |
| Pro         | #F59E0B (amber)    | 👑    | $4.99/mo | $41.99/yr   |
| Business    | #7C3AED (purple)   | 👑    | $9.99/mo | $83.99/yr   |

**Plan card CTA buttons (per SUBSCRIPTION_LIFECYCLE.md):**
| User's Tier | Status | Free card | Pro card | Business card |
|---|---|---|---|---|
| free | — | "Current Plan" (disabled) | "Activate Pro" | "Activate Business" |
| pro | active | "Cancel Subscription" (danger) | "Current Plan" (disabled) | "Upgrade to Business" |
| pro | cancelled | Info outline (no action) | "Reactivate" filled | "Reactivate & Upgrade" |
| business | active | "Cancel Subscription" (danger) | (no button — lower tier) | "Current Plan" (disabled) |
| business | cancelled | Info outline (no action) | (no button — lower tier) | "Reactivate" filled |
| any | (superadmin) | "✓ Included" (all cards) | — | — |

> **Rule:** There is never a "Downgrade to Free" button. Cancellation is the only path.

### Billing Toggle
- Monthly / Yearly selector; sticky below banner
- Yearly shows "Yearly plans save 30% — billed as one annual payment." note
- Superadmin can browse monthly/yearly pricing; their action buttons are always "✓ Included"

### Cancel Flow
1. Tap "Cancel Subscription" on the Free card (when on a paid plan)
2. `CancelSheet` bottom sheet opens with copy:
   - Platform name, expiry date, note that access continues until then
3. Tap "Go to [Google Play / App Store]" → `Linking.openURL(platform subscriptions URL)`
4. Sheet closes; user manages cancellation on the platform
5. When platform fires cancellation notification → backend sets `cancel_at_period_end = true`
6. Frontend polls profile → "Cancelled" pill + "Cancels [date]" badge appear

### Reactivate Flow
1. Tap "Reactivate" on the current plan card (when `cancelled`)
2. `Linking.openURL(platform subscriptions URL)` opens immediately — no confirmation sheet
3. User reactivates on the platform; platform fires notification → backend clears `cancel_at_period_end`
4. Frontend polls profile → "Cancelled" pill disappears

### Activate / Upgrade Flow
1. Tap "Activate [Plan]" or "Upgrade to Business"
2. `ActivateSheet` bottom sheet opens with plan chip + copy:
   - "You'll be taken to [Platform] to complete the subscription/upgrade."
3. Tap confirm → `Linking.openURL(platform URL)` → backend updated via server notification
4. Dev convenience: also fires `PATCH /api/v1/profile/subscription` to simulate the update locally
5. `onSuccess`: `setUser(updatedProfile, session)` + `qc.setQueryData(['profile'], updatedProfile)`

### Post-Upgrade: UpgradeSyncSheet (welcome modal)
Triggered when a **free-tier user** activates any paid plan.
- "Upload N Item(s)" button — uploads local SQLite data to cloud
- "Later" outline button → dismisses to SuccessDialog

---

## EntryForm Component (shared: AddEntry + EditEntry)

`src/components/entry/EntryForm.jsx`

This component is used in both AddEntryScreen and EditEntryScreen. It exposes a `ref` with:
- `getValues()` — returns all form field values
- `validate()` — returns `true` if form passes validation

### Field render conditions
| Field                  | Renders when                                                   |
|------------------------|----------------------------------------------------------------|
| Type toggle (In/Out)   | `showTypeToggle` prop is `true` (EditEntry only)               |
| Category picker        | `book.show_category === true`                                  |
| Contact picker         | `book.show_customer === true` OR `book.show_supplier === true` |
| Attachment picker      | `book.show_attachment === true`                                |
| Payment Mode           | Always                                                         |
| Amount                 | Always                                                         |
| Remark                 | Always                                                         |
| Date                   | Always                                                         |
| Time                   | Always                                                         |

### Attachment rules
- Images: compressed to 1000 px wide, 0.55 JPEG quality before upload
- PDFs: uploaded as-is
- Max 6 MB per file; over-limit → toast error, file not attached
- Upload API: `POST /api/v1/upload/attachment` → returns `{ url, path }`
- Delete old attachment on edit: `DELETE /api/v1/upload/attachment` before saving new one

---

## Known TODOs / Incomplete Features

| Feature                           | Screen                                    | Status                    |
|-----------------------------------|-------------------------------------------|---------------------------|
| Backup Entry                      | EntryDetailScreen ⋮ menu                  | Not implemented           |
| Export PDF                        | ReportsScreen                             | ✅ Complete (👑 Pro gate) |
| Export Excel                      | ReportsScreen                             | ✅ Complete (👑 Pro gate) |
| Subscription plans page           | SubscriptionScreen                        | ✅ Complete               |
| Crown gates on locked features    | SettingsScreen, ReportsScreen, BooksView  | ✅ Complete               |
| Invite collaborator               | BookDetailScreen user-plus icon           | Not implemented           |
| Notifications settings            | SettingsScreen                            | Not implemented           |
| Privacy & Security (Privacy Policy) | PrivacyPolicyScreen                     | ✅ Complete               |
| Backup & Sync                     | BackupSyncScreen (`/(app)/settings/backup-sync`) | ✅ Complete (👑 Pro gate) |
| Language picker                   | SettingsScreen                            | Not implemented           |
| Help & FAQ                        | SettingsScreen                            | Not implemented           |
| Rate the App                      | SettingsScreen                            | Not implemented           |
| Share App                         | SettingsScreen                            | Not implemented           |
| Business Settings                 | BusinessSettingsScreen                    | Skeleton only             |
| Currency picker                   | CurrencyScreen                            | Skeleton only             |
| Reports charts                    | ReportsScreen                             | ✅ Complete               |

---

## Common Error Patterns (App-wide)

| Error                | Trigger                             | Display                                |
|----------------------|-------------------------------------|----------------------------------------|
| 401 Unauthorized     | Expired/invalid JWT                 | Auto sign-out → redirect to login      |
| 403 Forbidden        | Role mismatch                       | Auto sign-out → redirect to login      |
| Network error        | No connectivity                     | Toast with message                     |
| Inactive account     | `is_active = false` on profile fetch | Toast + sign-out                      |
| Validation (client)  | Missing required field              | Inline field error                     |
| File too large       | Attachment > 6 MB                   | Toast "File too large (max 6 MB)"      |
| Duplicate category   | Same name in book                   | Toast from API error                   |

---

*Last updated: 2026-05-18*
*Update this file whenever any screen, button, navigation flow, or API call changes.*
