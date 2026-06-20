# Ultimate CashBook

Daily income & expense tracker — React Native (Expo) + FastAPI + Supabase.

```
ultimate-cashbook/
├── frontend/     React Native Expo app (JavaScript)
├── backend/      FastAPI backend (Python)
├── supabase/     SQL migrations
└── CLAUDE.md     Full implementation guide
```

---

## Frontend

```bash
cd frontend

# Install dependencies (first time only)
npm install

# Start dev server (local network)
npx expo start
npx expo start --clear

# Start dev server (tunnel — use if local network doesn't work)
npx expo start --tunnel

# Build Android preview APK (EAS)
npx eas build --platform android --profile preview

# Build iOS preview (EAS)
npx eas build --platform ios --profile preview
```

### Frontend environment variables (`frontend/.env`)

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
EXPO_PUBLIC_API_URL=http://<your-local-ip>:8000
```

### Key packages

| Package | Purpose |
|---|---|
| `expo-router` | File-based navigation |
| `expo-secure-store` | Encrypted session storage on device |
| `expo-image-picker` | Profile photo + attachment upload |
| `expo-file-system` | Download PDF/Excel reports to device |
| `expo-sharing` | Share downloaded reports via OS sheet |
| `expo-notifications` | Device push notifications (iOS + Android) |
| `@tanstack/react-query` | Server state, caching, mutations |
| `zustand` | Auth state + UI preferences |
| `axios` | HTTP client (JWT interceptor) |
| `@supabase/supabase-js` | Auth session management |
| `@expo-google-fonts/inter` | Inter 400/500/600/700/800 |
| `@expo/vector-icons` | Feather icon set |
| `react-native-modal-datetime-picker` | Date & time picker modals |

---

## Backend

```bash
cd backend

# Create virtual environment (first time only)
python -m venv venv

# Activate virtual environment
venv\Scripts\activate          # Windows
source venv/bin/activate       # macOS / Linux

# Install dependencies (first time or after requirements change)
pip install -r requirements.txt

# Start dev server with auto-reload
uvicorn app.main:app --reload

# Expose to local network (required when Expo runs on a physical device)
uvicorn app.main:app --reload --host 0.0.0.0
```

Swagger UI: `http://localhost:8000/docs`

### Backend environment variables (`backend/.env`)

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service_role_key>
SUPABASE_JWT_SECRET=<jwt_secret>
```

---

## Supabase

All migrations live in `supabase/migrations/`. Run them **in order** in the Supabase SQL Editor.

| # | File | What it does |
|---|---|---|
| 1 | `001_profiles_books_entries.sql` | profiles, books, entries tables; RLS; balance trigger; first-user superadmin trigger |
| 2 | `002_storage.sql` | avatars + attachments storage buckets and RLS policies |
| 3 | `003_categories.sql` | categories table + balance trigger; field-visibility columns on books |
| 4 | `004_customers_suppliers.sql` | customers and suppliers tables + contact balance trigger |
| 5 | `005_payment_modes.sql` | payment_modes table; Cash + Cheque seeded on book create; payment mode balance trigger |
| 6 | `006_notifications_push_tokens.sql` | notifications, user_notifications, push_tokens tables |
| 7 | `007_book_sharing.sql` | book_shares table; sharing invitation flow (pending → accepted); collaborator RLS on books and entries |
| 8 | `008_backfill_display_orders.sql` | backfill display_order for existing books |
| 9 | `009_subscription_status.sql` | subscription columns on profiles (tier, status, billing_cycle, expires_at, etc.) |
| 10 | `010_otp_codes.sql` | otp_codes table for email-based subscription verification |
| 11 | `011_cloud_data_expiry.sql` | cloud_data_delete_at on profiles; set when subscription lapses |
| 12 | `026_add_age_to_profiles.sql` | nullable age column on profiles |

### One-time setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run all migrations above in the SQL Editor (in order)
3. Enable Google OAuth: **Authentication → Providers → Google**
   - Add redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Add mobile redirect: `cashbook://auth/callback`
4. Copy keys into `frontend/.env` and `backend/.env` (see above)

---

## Supabase Local ↔ Cloud Workflow

### Prerequisites

```bash
# Install Supabase CLI
scoop install supabase          # Windows (scoop)
npm install -g supabase         # cross-platform

supabase --version
```

### 1. Log in

```bash
supabase login
```

### 2. Link to your cloud project

```bash
supabase link --project-ref <project-ref>
# project-ref = subdomain of your Supabase URL
# e.g. https://abcdefghijkl.supabase.co → abcdefghijkl
```

### 3. Push migrations to cloud

```bash
supabase db push
# Applies all pending migrations to the linked cloud project
```

> **Warning:** `db push` runs against the cloud database. Verify you're linked to the correct project first.

### 4. Start local Supabase (Docker required)

```bash
supabase start
# Starts local Postgres, Auth, Storage, and Studio at http://localhost:54323
```

```bash
supabase stop           # stop containers (data preserved)
supabase stop --no-backup   # stop and wipe local data
```

### 5. Pull schema changes from cloud

```bash
supabase db pull
# Generates a migration file with the diff from cloud SQL Editor changes
```

### 6. Reset local DB

```bash
supabase db reset
# Drops and recreates local DB, replays all migrations — use to test a new migration locally
```

### Environment switching (local vs cloud)

| File | Points to |
|---|---|
| `backend/.env` | Active environment |
| `backend/.env.local` | Local Supabase credentials |
| `backend/.env.production` | Cloud Supabase credentials |

```bash
cp backend/.env.local backend/.env       # switch to local
cp backend/.env.production backend/.env  # switch to cloud
```

Do the same for `frontend/.env`. **Never commit any `.env` file.**

### Common issues

| Problem | Fix |
|---|---|
| `supabase link` fails with auth error | Run `supabase login` again — token may have expired |
| `db push` says "no migrations to push" | Check `supabase/migrations/` has new files not yet applied |
| Local Studio not loading | Ensure Docker Desktop is running before `supabase start` |
| JWT mismatch between local and backend | Use the `JWT Secret` printed by `supabase start`, not the cloud secret |
| Port 54321 already in use | Stop the conflicting process or change the port in `supabase/config.toml` |
