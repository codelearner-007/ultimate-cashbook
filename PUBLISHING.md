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

## 0. Accounts to create (one-time, paid/identity-gated)

| Account | Why | Notes |
|---|---|---|
| Apple Developer Program | iOS App Store | $99/yr, requires legal identity / D-U-N-S for orgs |
| Google Play Console | Android | $25 one-time |
| RevenueCat | Subscriptions | free tier fine to start |
| Supabase (prod project) | DB/Auth/Storage | confirm whether the project in `eas.json` is your prod one |
| Render (or host) | FastAPI backend | already referenced: `ultimate-cashbook.onrender.com` |
| Sentry (optional) | Error reporting | only needed to turn on monitoring |

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
