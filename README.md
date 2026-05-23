# CashBook

Daily income & expense tracker — React Native (Expo) + FastAPI + Supabase.

```
cashbook/
├── frontend/     React Native Expo app
├── backend/      FastAPI backend
├── supabase/     SQL migrations + setup guide
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

# Start for web only
npx expo start --web

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

### Frontend packages

Core packages installed via `npm install` (see `package.json`). Notable additions beyond the default Expo SDK:

| Package | Version | Purpose |
|---|---|---|
| `expo-router` | SDK-matched | File-based navigation |
| `expo-secure-store` | SDK-matched | Encrypted session storage on device |
| `expo-font` | SDK-matched | Custom Inter font loading |
| `expo-image-picker` | SDK-matched | Profile photo + attachment upload |
| `expo-image` | SDK-matched | Optimised image rendering (`<ExpoImage>`) |
| `expo-file-system` | SDK-matched | Download PDF/Excel reports to device |
| `expo-sharing` | SDK-matched | Share downloaded reports via OS sheet |
| `expo-notifications` | `~0.32.x` | Device push notifications (iOS + Android) |
| `expo-device` | `~8.x` | Detect physical device vs simulator |
| `expo-constants` | `~18.x` | Read Expo project config / EAS project ID |
| `@tanstack/react-query` | `^5.x` | Server state, caching, mutations |
| `zustand` | `^4.x` | Auth state + UI preferences |
| `axios` | `^1.x` | HTTP client (JWT interceptor) |
| `@supabase/supabase-js` | `^2.x` | Auth session management |
| `@expo-google-fonts/inter` | latest | Inter 400/500/600/700/800 |
| `react-native-safe-area-context` | SDK-matched | Safe area insets |
| `@expo/vector-icons` | SDK-matched | Feather icon set |
| `react-native-modal-datetime-picker` | latest | Date & time picker modals |

Install commands for the above packages (run inside `frontend/`):

```bash
# Expo-managed packages (use `npx expo install` to get SDK-matched versions)
npx expo install expo-secure-store expo-font expo-image-picker expo-image \
  expo-file-system expo-sharing expo-notifications expo-device expo-constants \
  react-native-safe-area-context @expo/vector-icons

# npm packages (version-pinned or latest)
npm install @tanstack/react-query zustand axios @supabase/supabase-js \
  @expo-google-fonts/inter react-native-modal-datetime-picker \
  @react-native-community/datetimepicker
```

> **Push notifications note:** `expo-notifications`, `expo-device`, and `expo-constants` are native-only. They are wrapped in platform-specific files (`src/lib/pushNotifications.native.js` / `pushNotifications.js`) so web builds are unaffected. Physical device required — push tokens do not work on iOS Simulator.

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

# API docs available at:
# http://localhost:8000/docs
```

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
| 001 | `001_init.sql` | books, entries tables, basic RLS |
| 002 | `002_profiles_and_roles.sql` | profiles, triggers, balance trigger, indexes |
| 003 | `003_fix_last_entry_at.sql` | fix last_entry_at computation |
| 004 | `005_avatars_bucket.sql` | public avatars storage bucket + RLS |
| 005 | `006_add_currency_to_profiles.sql` | currency column on profiles |
| 006 | `007_add_dark_mode_to_profiles.sql` | is_dark_mode column on profiles |
| 007 | `008_contacts.sql` | customers and suppliers tables |
| 008 | `009_clear_contact_name_on_delete.sql` | null out contact_name on contact delete |
| 009 | `010_categories.sql` | categories table + balance trigger |
| 010 | `012_payment_modes.sql` | payment_modes table; Cash + Cheque seeded on book create |
| 011 | `013_storage_calc.sql` | DB functions for real admin storage stats |
| 012 | `014_attachment_metadata.sql` | attachment metadata columns on entries |
| 013 | `015_book_field_settings.sql` | field_settings JSONB on books (superseded by 016) |
| 014 | `016_book_field_settings_normalized.sql` | 4 boolean field-visibility columns; recreates RPC |
| 015 | `017_payment_mode_balances.sql` | total_in/out/net_balance on payment_modes + trigger |
| 016 | `018_notifications.sql` | notifications + user_notifications tables; RLS |
| 017 | `019_push_tokens.sql` | push_tokens table for Expo device tokens; RLS |

### One-time setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run all migrations above in the SQL Editor (in order)
3. Enable Google OAuth: **Authentication → Providers → Google**
   - Add redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Add mobile redirect: `cashbook://auth/callback`
4. Create a private Storage bucket named `attachments`
5. Copy keys into `frontend/.env` and `backend/.env` (see above)

---

## Supabase Local ↔ Cloud Workflow

This section covers linking your local Supabase CLI setup to a cloud project so migrations run consistently in both environments.

### Prerequisites

```bash
# Install Supabase CLI (Windows via scoop, or download from GitHub releases)
scoop install supabase

# Or via npm (cross-platform)
npm install -g supabase

# Verify
supabase --version
```

### 1. Log in to Supabase

```bash
supabase login
# Opens a browser — authorize with your Supabase account
```

### 2. Link the local project to your cloud project

Run this once from the repo root (where `supabase/` lives):

```bash
supabase link --project-ref <project-ref>
# <project-ref> is the subdomain of your Supabase URL:
# e.g. https://abcdefghijkl.supabase.co → project-ref = abcdefghijkl

# You will be prompted for your database password (set when you created the project)
```

After linking, a `supabase/.temp/project-ref` file is created — this is gitignored by default.

### 3. Start local Supabase (Docker required)

```bash
supabase start
# Starts local Postgres, Auth, Storage, and Studio at http://localhost:54323
```

Local credentials are printed on first start. Add them to your `.env` files for local development:

```
# frontend/.env  (local dev)
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<local_anon_key>

# backend/.env  (local dev)
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_KEY=<local_service_role_key>
SUPABASE_JWT_SECRET=<local_jwt_secret>
```

### 4. Push migrations to cloud

After writing a new migration file in `supabase/migrations/`:

```bash
supabase db push
# Applies all pending migrations to the LINKED CLOUD project
```

> **Warning:** `db push` runs against the cloud database. Double-check you are linked to the correct project before running.

### 5. Pull schema changes from cloud (optional)

If you edited the schema directly in the cloud SQL Editor and want to capture the diff locally:

```bash
supabase db pull
# Generates a new migration file in supabase/migrations/ with the diff
```

### 6. Run migrations locally

```bash
supabase db reset
# Drops and recreates the local DB, then replays all migration files in order
# Use this after adding a new migration to test it locally before pushing
```

### 7. Stop local Supabase

```bash
supabase stop
# Stops all local Docker containers (data is preserved)

supabase stop --no-backup
# Stops and wipes local DB data (clean slate)
```

### Environment switching (local vs cloud)

Keep two `.env` files and swap them as needed:

| File | Points to |
|---|---|
| `backend/.env` | Active environment (local or cloud) |
| `backend/.env.local` | Local Supabase credentials |
| `backend/.env.production` | Cloud Supabase credentials |

```bash
# Switch to local
cp backend/.env.local backend/.env

# Switch to cloud
cp backend/.env.production backend/.env
```

Do the same for `frontend/.env`. **Never commit any `.env` file.**

### Common issues

| Problem | Fix |
|---|---|
| `supabase link` fails with auth error | Run `supabase login` again — token may have expired |
| `db push` says "no migrations to push" | Check `supabase/migrations/` has new files not yet applied |
| Local Studio not loading | Ensure Docker Desktop is running before `supabase start` |
| JWT mismatch between local and backend | Use the `JWT Secret` printed by `supabase start`, not the cloud secret |
| Port 54321 already in use | Another process is using the port — stop it or change the port in `supabase/config.toml` |
