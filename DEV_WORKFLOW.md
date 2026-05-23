# Ultimate CashBook — Dev / Production Workflow

This document is the **single source of truth** for how to develop, test, and ship
the Ultimate CashBook app safely.

Two environments exist and must never share data:

| Environment    | Git branch  | Backend                                | Supabase project | Who uses it |
|----------------|-------------|----------------------------------------|------------------|-------------|
| **Dev**        | `dev`       | Local FastAPI (or Railway dev service) | `cashbook-dev`   | You — for building and testing |
| **Production** | `main`      | Railway prod service                   | `cashbook-prod`  | Real users |

---

## Table of Contents

1. [One-time Setup — Git Branches](#1-one-time-setup--git-branches)
2. [One-time Setup — GitHub Branch Protection](#2-one-time-setup--github-branch-protection)
3. [One-time Setup — Two Supabase Projects](#3-one-time-setup--two-supabase-projects)
4. [One-time Setup — Backend (Railway)](#4-one-time-setup--backend-railway)
5. [One-time Setup — Frontend Env Files](#5-one-time-setup--frontend-env-files)
6. [One-time Setup — EAS Build Profiles](#6-one-time-setup--eas-build-profiles)
7. [Day-to-Day Development Workflow](#7-day-to-day-development-workflow)
8. [Database Migration Workflow](#8-database-migration-workflow)
9. [Releasing to Production](#9-releasing-to-production)
10. [Subscription Tier Override (Dev Only)](#10-subscription-tier-override-dev-only)
11. [Quick Reference Cheatsheet](#11-quick-reference-cheatsheet)

---

## 1. One-time Setup — Git Branches

You currently have one branch: `main` (production). You need to create a `dev`
branch and make it your default working branch.

### What you do

Open a terminal in the project root and run:

```bash
# Create the dev branch from the current state of main
git checkout -b dev

# Push it to GitHub and set it as the upstream
git push -u origin dev
```

From this moment on, **you never work directly on `main`**. All changes go to `dev`
first.

To confirm the branch exists on GitHub:
- Go to `https://github.com/codelearner-007/ultimate-cashbook`
- Click the branch dropdown (top-left of the file list)
- You should see both `main` and `dev`

---

## 2. One-time Setup — GitHub Branch Protection

This prevents you from accidentally pushing directly to `main` and forcing all
code through a pull-request review before it goes live.

### What you do

1. Go to `https://github.com/codelearner-007/ultimate-cashbook`
2. Click **Settings** (top menu of the repo)
3. In the left sidebar, under **Code and automation**, click **Rules → Rulesets**
4. Click **New ruleset → New branch ruleset**
5. Fill in the form exactly as follows:

   **Ruleset Name:** `Protect main`

   **Enforcement status:** change from `Disabled` → **Active**

   **Target branches:**
   - Click **Add target → Include by pattern**
   - Type `main` and click **Add**

   **Branch rules — scroll down and enable:**
   - ✅ **Require a pull request before merging**
     - Set **Required approvals** to `1`
     - ✅ **Dismiss stale pull request approvals when new commits are pushed**

   **Bypass list:** leave empty (no one can bypass the rules)

6. Click **Create** at the bottom of the page

### What this gives you

- `git push origin main` will now be **rejected** by GitHub
- Code can only enter `main` via a pull request from `dev`
- You review your own PR before merging — this is your manual quality gate

---

## 3. One-time Setup — Two Supabase Projects

You need two completely separate Supabase projects so dev data and prod data
never mix.

### 3a. Create the dev project

**Option A — Use your local Supabase CLI (recommended for dev)**

If you have the Supabase CLI installed and Docker running:

```bash
# In the project root
supabase start
```

This starts a local Supabase instance at `http://127.0.0.1:54321`.
Your local anon key and service key are printed in the terminal output.
The local Studio UI is at `http://127.0.0.1:54323`.

Run all migrations against it:

```bash
supabase db push
```

**Option B — Free cloud Supabase project**

1. Go to `https://supabase.com` and sign in
2. Click **New Project**
3. Name it `cashbook-dev`
4. Choose a region close to you
5. Set a database password (save it — you will need it)
6. Wait for it to provision (~1 minute)
7. Go to **Project Settings → API** and copy:
   - `Project URL`
   - `anon` key (public)
   - `service_role` key (secret — never commit this)
   - JWT Secret (under **JWT Settings**)

Then run all your migration files in the **SQL Editor** (Supabase dashboard → SQL
Editor) in order:

```
001_init.sql
002_profiles_and_roles.sql
003_fix_last_entry_at.sql
... all the way to the latest migration
```

### 3b. Create the prod project

1. Go to `https://supabase.com` and sign in
2. Click **New Project**
3. Name it `cashbook-prod`
4. Choose the same region as your Railway deployment
5. Set a strong database password (save it)
6. Wait for it to provision
7. Go to **Project Settings → API** and copy all 4 values (URL, anon key,
   service key, JWT secret) — store them in a password manager

Run the same set of migration files in the SQL Editor, in the same order.

### 3c. Auth setup for each project

Repeat these steps in **both** Supabase projects:

**Email OTP** — enabled by default. Nothing to do.

**Google OAuth:**
1. Go to **Authentication → Providers → Google**
2. Enable the Google provider
3. Paste your Google Client ID and Google Client Secret
   (from Google Cloud Console → Credentials)
4. In the Google Cloud Console, add these to **Authorized redirect URIs**:
   - `https://<project-ref>.supabase.co/auth/v1/callback`
   - `cashbook://auth/callback`

---

## 4. One-time Setup — Backend (Railway)

You need two Railway services — one per environment — both deployed from the
same GitHub repo but tracking different branches with different env vars.

### What you do

1. Go to `https://railway.app` and sign in
2. Click **New Project → Deploy from GitHub repo**
3. Select `codelearner-007/ultimate-cashbook`

#### Service 1 — Dev backend

1. Railway creates a service. Click it and go to **Settings**
2. Rename it to `cashbook-api-dev`
3. Under **Source**, set the branch to `dev`
4. Under **Deploy**, set the **Root Directory** to `backend`
5. Go to **Variables** and add:

   ```
   SUPABASE_URL=<dev project URL>
   SUPABASE_SERVICE_KEY=<dev service_role key>
   SUPABASE_JWT_SECRET=<dev JWT secret>
   ```

6. Go to **Settings → Networking** and click **Generate Domain**
   Copy the URL — you will need it for the frontend `.env` file (e.g.
   `https://cashbook-api-dev.up.railway.app`)

#### Service 2 — Prod backend

1. In the same Railway project, click **New Service → GitHub Repo**
2. Select the same repo
3. Rename it to `cashbook-api-prod`
4. Under **Source**, set the branch to `main`
5. Under **Deploy**, set the **Root Directory** to `backend`
6. Go to **Variables** and add:

   ```
   SUPABASE_URL=<prod project URL>
   SUPABASE_SERVICE_KEY=<prod service_role key>
   SUPABASE_JWT_SECRET=<prod JWT secret>
   ```

7. Generate a domain for this service too and copy the URL

### How auto-deploy works

- When you push to `dev` → Railway automatically rebuilds `cashbook-api-dev`
- When a PR is merged to `main` → Railway automatically rebuilds `cashbook-api-prod`

No manual deploys needed after this setup.

---

## 5. One-time Setup — Frontend Env Files

The frontend uses environment variables to know which Supabase project and
backend URL to talk to. You need two files — one for local dev, one for
production builds.

### Important rule

These files contain secrets. They must **never** be committed to Git.
Confirm your `.gitignore` (in the `frontend/` folder) contains:

```
.env
.env.development
.env.production
.env.local
```

If `.gitignore` does not exist in `frontend/`, create it with those four lines.

### 5a. Create `frontend/.env` (used by `npx expo start`)

This file is loaded automatically when you run the app locally. It points at
your local or dev Supabase and dev backend.

```env
# Dev / local environment
EXPO_PUBLIC_SUPABASE_URL=http://192.168.0.101:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<dev anon key>
EXPO_PUBLIC_API_URL=http://192.168.0.101:8000

# Subscription tier override — forces the app to behave as this tier locally.
# Allowed values: free | pro | business
# Leave blank to use the real Supabase profile value.
EXPO_PUBLIC_DEV_OVERRIDE_TIER=pro
```

Replace the IP address with your machine's local IP if you are testing on a
physical phone (phone and PC must be on the same Wi-Fi network).
If using a local Supabase CLI, use `http://127.0.0.1:54321`.
If using a cloud dev Supabase project, paste its URL here.

### 5b. Create `frontend/.env.production` (used by EAS production builds)

This file is loaded by EAS when you build with `--profile production`. It
points at your live Supabase and prod backend. Real users hit this.

```env
# Production environment
EXPO_PUBLIC_SUPABASE_URL=https://<prod-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<prod anon key>
EXPO_PUBLIC_API_URL=https://cashbook-api-prod.up.railway.app

# Never set this in production. Leave blank.
EXPO_PUBLIC_DEV_OVERRIDE_TIER=
```

### 5c. Verify `.env.example` is committed

The file `frontend/.env.example` is already committed and shows the shape of
the env file without any real secrets. Keep it up to date whenever you add a
new env variable.

---

## 6. One-time Setup — EAS Build Profiles

EAS build profiles control which `.env` file gets bundled into the app and
whether the build is for testing or for the app stores.

### What you do

Create the file `frontend/eas.json` with this content:

```json
{
  "cli": {
    "version": ">= 10.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "APP_ENV": "development"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "env": {
        "APP_ENV": "development"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      },
      "env": {
        "APP_ENV": "production"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

### What each profile does

| Profile | Distribution | Env file used | Backend |
|---|---|---|---|
| `development` | Internal (dev client) | `.env.development` → falls back to `.env` | Dev |
| `preview` | Internal APK (share via link) | `.env.development` → falls back to `.env` | Dev |
| `production` | App Store / Play Store | `.env.production` | Prod |

### How EAS picks the env file

EAS reads the `APP_ENV` variable set in the profile:
- `APP_ENV=development` → EAS looks for `.env.development`, falls back to `.env`
- `APP_ENV=production` → EAS looks for `.env.production`

This means your production builds **automatically** use the prod Supabase URL
and prod backend — no manual swapping of files needed.

### Install EAS CLI (if not done)

```bash
npm install -g eas-cli
eas login
```

---

## 7. Day-to-Day Development Workflow

This is the loop you follow for every feature or bug fix.

### Step 1 — Make sure you are on the `dev` branch

```bash
git checkout dev
git pull origin dev    # get the latest changes
```

### Step 2 — Make your changes

Edit files normally. Test with:

```bash
cd frontend
npx expo start
```

The app runs against your dev Supabase and dev backend (from `frontend/.env`).
`EXPO_PUBLIC_DEV_OVERRIDE_TIER=pro` means all subscription gates behave as if
you are a Pro user — no real payment needed.

### Step 3 — Commit your changes to `dev`

```bash
git add <specific files>     # never use git add -A blindly
git commit -m "feat: describe what you built"
git push origin dev
```

This push triggers **Railway to redeploy `cashbook-api-dev`** automatically.
Within ~2 minutes your dev backend is running the new code.

### Step 4 — Test on a physical device

Build a preview APK (targets dev backend, has the tier override):

```bash
cd frontend
npx eas build --profile preview --platform android
```

EAS gives you a QR code and a download link. Install the APK on your phone and
test the full flow.

### Step 5 — Repeat until the feature is ready

Continue committing to `dev` and rebuilding as needed. Nothing you do here
affects production.

---

## 8. Database Migration Workflow

Migrations must always be applied to dev first, verified, then applied to prod.
Never run a migration directly on the prod database without testing it on dev.

### Step 1 — Write the migration file

Create the next numbered file in `supabase/migrations/`:

```
supabase/migrations/026_your_feature.sql
```

Write your SQL changes. Follow the pattern of existing migrations.

### Step 2 — Apply to dev Supabase

**If using local Supabase CLI:**

```bash
supabase db push
```

**If using a cloud dev Supabase project:**

1. Open the Supabase dashboard for `cashbook-dev`
2. Go to **SQL Editor**
3. Paste the contents of your migration file
4. Click **Run**

### Step 3 — Test thoroughly on dev

Run the app, exercise the affected screens, confirm everything works.

### Step 4 — Apply to prod Supabase (done at release time, not before)

Only do this when you are ready to merge to `main` (see Section 9).

**If using Supabase CLI with prod connection:**

```bash
supabase db push --db-url "postgresql://postgres:<password>@db.<prod-ref>.supabase.co:5432/postgres"
```

**If using Supabase dashboard:**

1. Open the Supabase dashboard for `cashbook-prod`
2. Go to **SQL Editor**
3. Paste the migration file contents
4. Click **Run**

Apply migrations to prod **before** merging the PR to `main`, so the database
schema is ready before the new backend code deploys.

---

## 9. Releasing to Production

This is the sequence you follow every time you want to ship something to real
users.

### Step 1 — Make sure dev is fully tested

The feature is working on the preview APK. No known bugs. All migration files
have been written and tested against the dev Supabase.

### Step 2 — Apply migrations to prod Supabase

Before the new code reaches prod, the database must have the correct schema.
Follow Step 4 from Section 8 for every new migration that hasn't been applied
to prod yet.

### Step 3 — Open a pull request on GitHub

1. Go to `https://github.com/codelearner-007/ultimate-cashbook`
2. Click **Pull requests → New pull request**
3. Set:
   - **base:** `main`
   - **compare:** `dev`
4. Write a clear title and description of what changed
5. Click **Create pull request**

### Step 4 — Review the PR

Read through your own diff. Check:
- No `.env` files or secrets are included
- No debug code or `console.log` left in
- Migration files are present for any schema changes
- The change does what it says

### Step 5 — Merge the PR

Click **Merge pull request** → **Confirm merge**.

This triggers **Railway to redeploy `cashbook-api-prod`** automatically within
~2 minutes. The new backend code is now live.

### Step 6 — Build and submit the production app (when ready for a new app release)

A backend deploy happens on every merge to `main`. A new app build only needs
to happen when there are frontend changes or when you want to push a new version
to the app stores.

```bash
cd frontend

# Android — builds an AAB for Play Store submission
npx eas build --profile production --platform android

# iOS — builds an IPA for App Store submission
npx eas build --profile production --platform ios
```

These builds automatically use `frontend/.env.production` (prod Supabase URL,
prod backend, no tier override).

To submit directly to the stores:

```bash
npx eas submit --platform android
npx eas submit --platform ios
```

### Step 7 — Sync `dev` back up with `main`

After the merge, pull the updated `main` into `dev` so they stay in sync:

```bash
git checkout dev
git pull origin main
git push origin dev
```

---

## 10. Subscription Tier Override (Dev Only)

The file `frontend/src/lib/devConfig.js` reads `EXPO_PUBLIC_DEV_OVERRIDE_TIER`
from the env and exports it as `DEV_TIER`. Both `canAccess()` and the
local-vs-cloud data routing in `dataSource.js` check this value before reading
the real Supabase profile.

### How to use it

In `frontend/.env`, set the tier you want to test:

```env
# Test as a Pro user — cloud routing + Pro feature gates enabled
EXPO_PUBLIC_DEV_OVERRIDE_TIER=pro

# Test as a Business user
EXPO_PUBLIC_DEV_OVERRIDE_TIER=business

# Test as a Free user (SQLite only, feature gates locked)
EXPO_PUBLIC_DEV_OVERRIDE_TIER=free

# Use the real Supabase profile value (no override)
EXPO_PUBLIC_DEV_OVERRIDE_TIER=
```

After changing this value you must restart Expo with the cache cleared:

```bash
npx expo start --clear
```

### What the override affects

| System | Dev override active | Dev override blank |
|---|---|---|
| `canAccess(user, feature)` | Uses override tier | Uses real profile tier |
| `getLimit(user, feature)` | Uses override tier | Uses real profile tier |
| `useLocalDb()` in dataSource.js | Uses override tier for cloud/SQLite routing | Uses real profile tier |
| `apiUpdateSubscription` (SubscriptionScreen) | Not affected — still calls real API | Not affected |
| Production builds | Never active — `.env.production` always has blank value | Always blank |

### Production safety guarantee

`frontend/.env.production` always has `EXPO_PUBLIC_DEV_OVERRIDE_TIER=` (blank).
EAS production builds load `.env.production`. Therefore the override **cannot**
appear in a production build even if you forget to remove it from `.env`.

---

## 11. Quick Reference Cheatsheet

### Start local dev

```bash
git checkout dev
cd frontend
npx expo start
```

### Push a change to dev (triggers Railway dev redeploy)

```bash
git add <files>
git commit -m "feat: ..."
git push origin dev
```

### Build a test APK (dev env, share with testers)

```bash
cd frontend
npx eas build --profile preview --platform android
```

### Apply a new migration to dev Supabase

Paste the SQL file into the Supabase SQL Editor for `cashbook-dev` and click Run.

### Ship to production

```bash
# 1. Apply migrations to cashbook-prod Supabase (SQL Editor)
# 2. Open PR on GitHub: dev → main
# 3. Review and merge PR (Railway auto-deploys cashbook-api-prod)
# 4. Build and submit the app (only needed for frontend changes):
cd frontend
npx eas build --profile production --platform android
npx eas submit --platform android
# 5. Sync dev back up:
git checkout dev && git pull origin main && git push origin dev
```

### Switch subscription tier for local testing

Edit `EXPO_PUBLIC_DEV_OVERRIDE_TIER` in `frontend/.env`, then:

```bash
npx expo start --clear
```

### Emergency — revert a bad prod deploy

```bash
# Find the last good commit hash on main
git log origin/main --oneline

# Create a revert commit (safe — does not rewrite history)
git checkout main
git revert <bad-commit-hash>
git push origin main    # this will be rejected — open a PR instead
```

Because `main` is protected, create a revert PR from a hotfix branch:

```bash
git checkout main
git pull origin main
git checkout -b hotfix/revert-bad-deploy
git revert <bad-commit-hash>
git push origin hotfix/revert-bad-deploy
# Open PR: hotfix/revert-bad-deploy → main
```

---

## File Map — What Goes Where

```
ultimate-cashbook/
├── DEV_WORKFLOW.md              ← This file
├── CLAUDE.md                    ← AI dev instructions
├── skeleton.md                  ← Screen-by-screen app map
├── frontend/
│   ├── .env                     ← Dev env vars (gitignored)
│   ├── .env.production          ← Prod env vars (gitignored)
│   ├── .env.example             ← Committed — shows variable names only
│   ├── eas.json                 ← EAS build profiles (commit this)
│   └── src/lib/devConfig.js     ← Reads DEV_OVERRIDE_TIER
├── backend/
│   ├── .env                     ← Backend env vars (gitignored)
│   └── .env.example             ← Committed — shows variable names only
└── supabase/
    └── migrations/              ← All SQL migration files (committed)
```

**Commit:** `eas.json`, `.env.example` files, `devConfig.js`, migration SQL files
**Never commit:** `.env`, `.env.production`, `.env.development`, any `.env` with real values
