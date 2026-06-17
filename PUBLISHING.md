# Publishing Ultimate CashBook

The codebase is launch-ready and verified. What remains is **external provisioning**
that requires *your* accounts, credentials, and payment — it can't be done from the
repo. This is the exact, ordered checklist. Each step says precisely what to set and
where. Values in `ALL_CAPS` are yours to fill.

> Already handled in code (no action needed): in-app account deletion (Apple 5.1.1(x)),
> Terms of Service / EULA + Privacy Policy screens, auto-renew paywall disclosure
> (Apple 3.1.2), deep-link scheme `ultimatecashbook://`, web login, RevenueCat webhook
> as the sole entitlement writer, Sentry (DSN-gated), `ITSAppUsesNonExemptEncryption=false`.

---

## 0. Costs, blockers & the cheapest path

**Almost everything is free.** The only unavoidable cost is the store developer
account(s). Everything else (Supabase, backend host, RevenueCat, Sentry, Google
login, email-OTP) runs on free tiers.

| Credential / account | Blocks what? | Needed to launch? | Cost |
|---|---|---|---|
| Supabase URL + anon key | All cloud features (auth, sync) | **Yes** — you already have one; confirm it's prod | Free |
| Backend URL (Render) | Cloud API | **Yes** — already deployed (`ultimate-cashbook.onrender.com`) | Free (sleeps when idle) |
| Supabase service key + JWT secret | Backend auth | **Yes** — set in Render env (never in repo) | Free |
| Google OAuth web client ID | Google login *only* | No — email-OTP works without it | Free |
| RevenueCat keys (`appl_`/`goog_`) | In-app purchases *only* | **No** — app disables purchases gracefully when blank | Free up to ~$2.5k/mo revenue |
| Sentry DSN | Error monitoring | No — no-op when blank | Free tier |
| Gmail SMTP | Production email-OTP | No — falls back to Supabase native OTP | Free (Gmail app password) |
| Google Play Console | Android publishing | **Yes for Android** | **$25 one-time** |
| Apple Developer Program | iOS publishing | **Yes for iOS** | **$99 / year** |

### Cheapest path to a live app — ~$25 total
1. **Android only**, **free app, no in-app purchases** → the only cost is the **$25** Play Console fee.
2. Skip RevenueCat, Apple, Sentry, and Gmail for now — none of them block a free Android launch.
3. Validate with real users, then add in-app subscriptions (RevenueCat, free), iOS ($99/yr), and monitoring (Sentry, free) when it's worth it.

> You already have a Supabase project + a deployed backend. If those are the ones you
> intend to ship, the most important free pieces are done — for a free Android launch
> you mainly need the $25 Play account. Step-by-step for every key is in §7.

---

## 1. Supabase (production project)

1. **Run migrations** `001`→`014` in order (SQL Editor or `supabase db push`). See `supabase/CLAUDE.md`.
2. **Auth → URL Configuration → Redirect URLs:** add `ultimatecashbook://auth/callback`.
3. **Auth → Providers → Google:** enable; paste Google client ID + secret. In Google
   Cloud Console set the authorized redirect URI to `https://YOUR_REF.supabase.co/auth/v1/callback`.
4. **Storage:** buckets `attachments` (private) + `avatars` (public) are created by migration `002`.
5. Copy these for the backend: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (service_role — never the anon key), `SUPABASE_JWT_SECRET` (Project Settings → API → JWT Secret).

---

## 2. Backend (Render)

Set environment variables (Render → Environment):

```
SUPABASE_URL=https://YOUR_REF.supabase.co
SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET=YOUR_JWT_SECRET
ALLOWED_ORIGINS=https://YOUR_WEB_ORIGIN            # comma-separated; or * (credentials are off)
REVENUECAT_WEBHOOK_AUTH=YOUR_SHARED_SECRET         # any long random string; reused in step 3
GMAIL_SMTP_USER=YOUR_GMAIL                         # for production email-OTP (else 503 → dev fallback)
GMAIL_SMTP_PASSWORD=YOUR_16_CHAR_APP_PASSWORD
SENTRY_DSN=                                         # optional
```

Health check: `GET /health` → `{"status":"ok"}`. Deploy uses `Procfile`.

---

## 3. RevenueCat (subscriptions)

1. Create the app(s) in RevenueCat; set **`app_user_id` = the Supabase user id** (the app
   passes `profiles.id`).
2. Create products in App Store Connect + Play Console, then import them into RevenueCat.
   **Product/entitlement IDs must contain the tier and period as substrings** — the webhook
   derives the plan from the id (`backend/app/routers/webhooks.py`):
   - tier: contains `business`/`biz` → Business; otherwise → Pro
   - period: contains `year`/`annual` → yearly; otherwise → monthly
   - e.g. `pro_monthly`, `pro_yearly`, `business_monthly`, `business_yearly`
3. **Webhook:** RevenueCat → Integrations → Webhooks → URL `https://YOUR_API/api/v1/webhooks/revenuecat`,
   and set the **Authorization header** to the exact `REVENUECAT_WEBHOOK_AUTH` value from step 2.
4. Copy the public SDK keys (`appl_…`, `goog_…`) into `eas.json` (step 4).

> Purchases are **native-only**. They require an EAS dev/production build — they do **not**
> work in Expo Go or on web (web is a graceful no-op).

---

## 4. Frontend config (`frontend/eas.json`)

Fill the empty/placeholder values in the `preview` + `production` env blocks:

```
EXPO_PUBLIC_SUPABASE_URL            # confirm this points at your PROD project
EXPO_PUBLIC_SUPABASE_ANON_KEY       # public anon key of that project
EXPO_PUBLIC_API_URL                 # your deployed backend URL
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID    # Google Cloud OAuth web client id
EXPO_PUBLIC_REVENUECAT_IOS_KEY      # appl_… (empty = purchases disabled)
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY  # goog_…
EXPO_PUBLIC_SENTRY_DSN              # optional
```

(Prefer EAS secrets for anything sensitive: `eas env:create`.)

---

## 5. Build & submit

```bash
cd frontend
eas build --platform all --profile production       # autoIncrement is on for production

# iOS — eas submit prompts for Apple ID / App Store Connect app id / Team ID
eas submit --platform ios --profile production

# Android — needs a Play service-account JSON at frontend/google-service-account.json (gitignored)
eas submit --platform android --profile production   # track: internal (raise in eas.json when ready)
```

---

## 6. Store listing compliance

| Requirement | Status |
|---|---|
| In-app account deletion | ✅ in code (Settings → Delete Account) |
| Terms of Service / EULA | ✅ in code (`/legal/terms`, paywall + login links) |
| Privacy Policy | ✅ in code (`/legal/privacy`) |
| Auto-renew disclosure on paywall | ✅ in code |
| Apple Privacy "nutrition labels" | ⬜ declare in App Store Connect: email + financial records you enter; not sold/shared |
| Google Play Data Safety form | ⬜ same declaration in Play Console |
| Screenshots / description / icon | ⬜ store listing assets |
| Subscription localizations + review screenshot | ⬜ App Store Connect / Play |
| Support + privacy-policy URLs | ⬜ host the policy text (also shipped in-app) |

Once steps 1–5 are filled in and the compliance items declared, the app is submittable.

---

## 7. How to get each key (step by step)

### Supabase (free) — URL, anon key, service key, JWT secret
1. supabase.com → **New project** (free tier), pick a nearby region.
2. **Project Settings → API**:
   - **Project URL** → `EXPO_PUBLIC_SUPABASE_URL` and backend `SUPABASE_URL`.
   - **anon / public key** → `EXPO_PUBLIC_SUPABASE_ANON_KEY`. *(New 2026 projects may show a `sb_publishable_…` key instead of a JWT — use that; it's the public/anon equivalent.)*
   - **service_role / secret key** → backend `SUPABASE_SERVICE_KEY` only. **Never** put this in the app or repo.
   - **JWT Secret** (same API page; new projects use ES256/JWKS, which the backend also supports) → backend `SUPABASE_JWT_SECRET`.
3. Run migrations `001`→`014` (SQL Editor or `supabase db push`).
4. **Auth → URL Configuration → Redirect URLs** → add `ultimatecashbook://auth/callback`.

### Backend host (Render, free)
1. render.com → **New → Web Service** → connect the repo → root directory `backend/`.
2. It uses the `Procfile`. Add the env vars from §2.
3. Copy the service URL → `EXPO_PUBLIC_API_URL`. (Free tier sleeps when idle; the first request after a nap is slow.)

### Google login (free, optional) — `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
1. console.cloud.google.com → new project.
2. **APIs & Services → OAuth consent screen** → External → fill app name + support email → save.
3. **Credentials → Create credentials → OAuth client ID → Web application** → copy the **Client ID** → `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Add authorized redirect `https://YOUR_REF.supabase.co/auth/v1/callback`.
4. (Android native) Also create an **Android** OAuth client with package `com.ultimatecashbook.app` + the SHA-1 from your EAS keystore (`eas credentials`).
5. Supabase → **Auth → Providers → Google** → paste the Web client ID + secret.
   *Skip all of this to launch with email-OTP only.*

### RevenueCat (free) — `appl_` / `goog_` keys  *(do AFTER you have store accounts; optional for a free launch)*
1. revenuecat.com → free account → **New project**.
2. Add your App Store + Play Store apps (the store app records must exist first).
3. Create **Entitlements** + **Products** mapped to your store subscriptions, named so the id contains the tier (`pro`/`business`) and period (`month`/`year`).
4. **Project settings → API keys** → copy the public app keys: `appl_…` → `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `goog_…` → `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
5. **Integrations → Webhooks** → URL `https://YOUR_API/api/v1/webhooks/revenuecat`, **Authorization** = your `REVENUECAT_WEBHOOK_AUTH`.

### Sentry (free, optional) — `EXPO_PUBLIC_SENTRY_DSN`
1. sentry.io → free account → **Create project → React Native** → copy the **DSN**.

### Gmail SMTP (free, optional) — production email-OTP
1. A Gmail account → enable **2-Step Verification** → **App Passwords** → create one (16 chars).
2. Backend env: `GMAIL_SMTP_USER` = the address, `GMAIL_SMTP_PASSWORD` = the app password. *(Skip → backend returns 503 → the app uses Supabase native OTP.)*

### Google Play Console — $25 one-time
1. play.google.com/console → pay $25 → complete identity verification (can take 1–2 days).
2. Create the app record.
3. **Setup → API access** → link a Google Cloud project → create a **service account** → grant it the release permission → download the JSON → save as `frontend/google-service-account.json` (already gitignored).

### Apple Developer Program — $99/year
1. developer.apple.com/programs → **Enroll** → identity verification.
2. **App Store Connect** → create the app record → note the **App ID** (`ascAppId`); your **Team ID** is under developer.apple.com → Membership. `eas submit` prompts for both.
