# Auth Implementation Plan
## Google OAuth + Custom Email OTP via Gmail Alias

---

## What We Are Building

Two login methods on `LoginScreen.jsx`:

1. **Continue with Google** — user taps, picks Gmail account, lands in the app. Zero OTP.
2. **Continue with Email** — user enters their email, gets a 6-digit OTP sent from `info@ultimatecashbook.com` (actually sent by `farhan.butt2023@gmail.com` via Gmail SMTP), enters code, lands in the app.

Supabase still handles the **session** (JWT, user record, profiles trigger). We are only replacing **who sends the OTP email** — from Supabase's default sender to our own Gmail.

---

## Architecture Overview

```
User taps "Continue with Email"
        │
        ▼
Frontend → POST /api/v1/auth/send-otp { email }
        │
        ▼
Backend:
  1. Generate 6-digit code
  2. Store code + expiry in Supabase `otp_codes` table (5 min TTL)
  3. Send email via Gmail SMTP
     From:    info@ultimatecashbook.com   ← display name / alias
     Reply-To: info@ultimatecashbook.com
     Actual sender: farhan.butt2023@gmail.com (authenticated to Gmail SMTP)
        │
        ▼
User enters OTP in app
        │
        ▼
Frontend → POST /api/v1/auth/verify-otp { email, code }
        │
        ▼
Backend:
  1. Validate code against `otp_codes` table
  2. If valid → call Supabase Admin API to create/get user + generate session
  3. Return { access_token, refresh_token, user }
        │
        ▼
Frontend stores session → AuthGuard redirects to app
```

---

## Step 1 — Gmail Setup (From Address Alias)

You want OTPs to show `From: info@ultimatecashbook.com` but sent by `farhan.butt2023@gmail.com`.

**This is a Gmail "Send mail as" alias — not a real domain email account.**

### 1a. Add the alias in Gmail

1. Open Gmail (`farhan.butt2023@gmail.com`)
2. Settings → **See all settings** → **Accounts and Import** tab
3. Under **"Send mail as"** → click **"Add another email address"**
4. Name: `Ultimate CashBook`
5. Email: `info@ultimatecashbook.com`
6. Uncheck "Treat as alias" ← important, this means it goes out as a real sender
7. Click **Next Step**
8. Gmail will ask for SMTP server — leave defaults (it will use Gmail's SMTP)
9. Gmail sends a **verification email** to `info@ultimatecashbook.com`

### 1b. Receive that verification email

Since you own the domain but have no email hosting, you need to **receive** one email at `info@ultimatecashbook.com` for verification. Options (pick one):

**Option A — Cloudflare Email Routing (free, easiest)**
- Go to Cloudflare dashboard → your domain → **Email** → **Email Routing**
- Enable Email Routing
- Add rule: `info@ultimatecashbook.com` → forwards to `farhan.butt2023@gmail.com`
- Now `info@ultimatecashbook.com` forwards to your Gmail
- The Gmail verification email arrives in your Gmail inbox
- Click the link → alias is verified

**Option B — Resend / Mailgun catch-all (if you plan to use them later)**
- Set up their inbound routing first, then do the alias verification

### 1c. Gmail App Password (for SMTP auth)

Gmail does NOT allow plain password auth for SMTP. You need an **App Password**:

1. Go to `myaccount.google.com`
2. Security → **2-Step Verification** must be ON
3. Security → **App passwords** → Select app: "Mail" → Select device: "Other" → type "UltimateCashBook Backend"
4. Copy the 16-character password shown (e.g. `abcd efgh ijkl mnop`)
5. Save it — you will never see it again

This is what the backend uses to authenticate to `smtp.gmail.com`.

---

## Step 2 — Supabase: `otp_codes` Table

Run this SQL in the Supabase SQL editor:

```sql
CREATE TABLE IF NOT EXISTS public.otp_codes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email       TEXT NOT NULL,
  code        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_otp_codes_email ON public.otp_codes(email);

-- Auto-delete expired/used codes (run once a day via pg_cron or just let the backend clean up)
-- Rows older than 10 minutes are useless — clean them on each verify call
```

No RLS needed — this table is only ever touched by the backend using the service key.

---

## Step 3 — Backend: New Router `auth.py`

Create `backend/app/routers/auth.py`:

### 3a. Environment variables to add to `.env`

```
GMAIL_SMTP_USER=farhan.butt2023@gmail.com
GMAIL_SMTP_APP_PASSWORD=abcdefghijklmnop    # 16-char app password, no spaces
GMAIL_FROM_NAME=Ultimate CashBook
GMAIL_FROM_ADDRESS=info@ultimatecashbook.com
SUPABASE_URL=...                            # already exists
SUPABASE_SERVICE_KEY=...                    # already exists
```

### 3b. Add to `backend/app/config.py`

```python
gmail_smtp_user:     str = ""
gmail_smtp_password: str = ""
gmail_from_name:     str = "Ultimate CashBook"
gmail_from_address:  str = "info@ultimatecashbook.com"
```

### 3c. `backend/app/routers/auth.py` — full logic

**POST /api/v1/auth/send-otp**
```
Body:  { "email": "user@example.com" }

Steps:
1. Normalize email (strip, lowercase)
2. Validate it looks like an email
3. Generate random 6-digit code: str(random.randint(100000, 999999))
4. Delete any existing unused codes for this email from otp_codes table
5. Insert new row: { email, code, expires_at: now + 5 minutes, used: false }
6. Send email via smtplib:
   - SMTP host: smtp.gmail.com, port: 587, STARTTLS
   - Login: GMAIL_SMTP_USER + GMAIL_SMTP_APP_PASSWORD
   - From: "Ultimate CashBook <info@ultimatecashbook.com>"
   - To: user's email
   - Subject: "Your Ultimate CashBook sign-in code: {code}"
   - Body: plain text + HTML with the 6-digit code prominently shown
7. Return { "message": "OTP sent" }

Errors:
- 400 if email is invalid
- 500 if SMTP fails (log the error, return generic message to client)
```

**POST /api/v1/auth/verify-otp**
```
Body:  { "email": "user@example.com", "code": "123456" }

Steps:
1. Normalize email
2. Query otp_codes: WHERE email = ? AND used = false AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1
3. If no row → 400 "Invalid or expired code"
4. If row.code != submitted code → 400 "Invalid or expired code"
   (do NOT say "wrong code" — don't help brute force)
5. Mark row as used: UPDATE otp_codes SET used = true WHERE id = ?
6. Delete old codes for this email (cleanup)
7. Upsert user in Supabase Auth via Admin API:
   POST {SUPABASE_URL}/auth/v1/admin/users
   Headers: { apikey: SERVICE_KEY, Authorization: Bearer SERVICE_KEY }
   Body: { "email": email, "email_confirm": true }
   → If user already exists (409) → GET user by email instead
8. Create a Supabase session for that user:
   POST {SUPABASE_URL}/auth/v1/token?grant_type=password  ← won't work
   
   Correct approach: use Supabase Admin API to generate a magic link
   then exchange it, OR generate a custom JWT signed with SUPABASE_JWT_SECRET.

   RECOMMENDED: Generate a session using the Supabase Admin API:
   POST {SUPABASE_URL}/auth/v1/admin/users/{user_id}/generate-link
   Body: { "type": "magiclink", "email": email }
   This returns a hashed_token — exchange it:
   GET {SUPABASE_URL}/auth/v1/verify?token={hashed_token}&type=magiclink&redirect_to=...
   
   SIMPLER APPROACH (what we will implement):
   Sign a JWT directly using SUPABASE_JWT_SECRET (HS256).
   Supabase validates tokens signed with this secret.
   Payload: { sub: user_id, email: email, role: "authenticated", aud: "authenticated",
              iat: now, exp: now + 3600 }
   Return: { access_token, user: { id, email, role (from profiles table) } }
   The frontend stores this exactly like a Supabase session.

9. Return { access_token, user: { id, email, full_name, role } }
```

### 3d. Register the router in `backend/app/main.py`

```python
from app.routers import auth
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
```

---

## Step 4 — Supabase: Google OAuth Setup

This is still handled by Supabase (no custom code needed for the session — Supabase issues the JWT).

### 4a. Google Cloud Console

1. Go to `console.cloud.google.com`
2. Create a project (or use existing)
3. APIs & Services → **OAuth consent screen**
   - App name: `Ultimate CashBook`
   - User support email: `farhan.butt2023@gmail.com`
   - Authorized domains: add `supabase.co` AND your Railway domain
4. APIs & Services → **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Name: `Ultimate CashBook Supabase`
   - Authorized redirect URIs: `https://<your-supabase-project>.supabase.co/auth/v1/callback`
   - Copy the **Client ID** and **Client Secret**

### 4b. Supabase Dashboard

1. Go to **Authentication** → **Providers** → **Google**
2. Toggle **Enable** ON
3. Paste **Client ID** and **Client Secret** from step 4a
4. Save

### 4c. Deep Link / Redirect URI in the app

In `app.json` (already should have `scheme: "cashbook"`):
```json
{
  "expo": {
    "scheme": "cashbook"
  }
}
```

The `LoginScreen.jsx` `handleGoogleSignIn` already calls:
```js
makeRedirectUri({ scheme: 'cashbook', path: 'auth/callback' })
```
This produces `cashbook://auth/callback` — Supabase redirects here after Google auth.

### 4d. Create the callback route

Create `frontend/app/auth/callback.jsx`:
```jsx
import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '../../src/lib/supabase';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const url = Linking.getInitialURL();
    // supabase-js detects the fragment/code automatically via onAuthStateChange
    // AuthGuard in _layout.jsx handles redirect once session fires
  }, []);

  return <View />;
}
```

The `supabase.auth.onAuthStateChange` listener (wherever it lives in your `_layout.jsx` or `authStore`) fires automatically when the deep link returns with a valid session. The AuthGuard then redirects.

---

## Step 5 — Frontend: Update `LoginScreen.jsx` for Custom OTP

The `EmailModal` currently calls `supabase.auth.signInWithOtp()` and `supabase.auth.verifyOtp()`.

Replace those two calls with calls to your own backend:

**Send OTP (replace `handleSend`):**
```js
// Old:
const { error } = await supabase.auth.signInWithOtp({ email: trimmed });

// New:
const res = await fetch(`${API_BASE_URL}/api/v1/auth/send-otp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: trimmed }),
});
if (!res.ok) {
  const data = await res.json();
  throw new Error(data.detail || 'Failed to send OTP');
}
```

**Verify OTP (replace `handleVerify`):**
```js
// Old:
const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });

// New:
const res = await fetch(`${API_BASE_URL}/api/v1/auth/verify-otp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: email.trim().toLowerCase(), code: otp.trim() }),
});
if (!res.ok) {
  const data = await res.json();
  throw new Error(data.detail || 'Invalid code');
}
const { access_token, user } = await res.json();

// Store the session manually (same as Supabase session shape):
await supabase.auth.setSession({ access_token, refresh_token: access_token });
// Then fetch the profile and call setUser:
const profile = await apiGetProfile();   // uses the token via axios interceptor
setUser(profile, { access_token });
```

---

## Step 6 — Email Template

The OTP email sent by the backend should look like this:

**Subject:** `123456 is your Ultimate CashBook sign-in code`

**HTML body:**
```html
<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #39AAAA;">Ultimate CashBook</h2>
  <p>Your sign-in code is:</p>
  <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #0F172A; 
              background: #F4FAFA; border: 2px solid #39AAAA; border-radius: 12px; 
              padding: 20px; text-align: center; margin: 20px 0;">
    123456
  </div>
  <p style="color: #64748B; font-size: 13px;">
    This code expires in <strong>5 minutes</strong>.<br>
    If you did not request this, ignore this email.
  </p>
  <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;">
  <p style="color: #94A3B8; font-size: 12px;">
    Ultimate CashBook · info@ultimatecashbook.com
  </p>
</div>
```

---

## Step 7 — Security Rules (implement in backend)

| Rule | Implementation |
|---|---|
| Rate limit send-otp | Max 3 OTP requests per email per 10 minutes (count rows in `otp_codes` where `created_at > now()-10min`) |
| OTP expiry | 5 minutes (`expires_at < now()` check on verify) |
| Single use | Mark `used = true` on first successful verify |
| Brute force | Always return same error message for wrong/expired code — never say which |
| Cleanup | DELETE old codes for email before inserting new one |
| HTTPS only | Railway enforces HTTPS on all endpoints |

---

## Step 8 — `requirements.txt` additions

```
# Already present (check first):
python-jose[cryptography]
httpx

# Add if not present:
# smtplib is part of Python stdlib — no install needed
# secrets is part of Python stdlib — no install needed
```

No new pip packages needed — `smtplib` and `secrets` are Python built-ins.

---

## Implementation Order

1. **Supabase SQL** — create `otp_codes` table (5 min)
2. **Gmail** — add alias + Cloudflare email routing + App Password (15 min)
3. **Backend** — write `auth.py` router + add env vars + register in `main.py` (30 min)
4. **Google Cloud + Supabase** — enable Google OAuth, paste credentials (10 min)
5. **Frontend callback route** — `app/auth/callback.jsx` (5 min)
6. **Frontend LoginScreen** — replace `supabase.auth.signInWithOtp/verifyOtp` with backend calls (15 min)
7. **Test** — run backend locally, send OTP to a real email, verify flow end-to-end

---

## Files That Will Change

| File | Change |
|---|---|
| `backend/app/routers/auth.py` | **NEW** — send-otp + verify-otp endpoints |
| `backend/app/main.py` | Register auth router |
| `backend/app/config.py` | Add 4 Gmail env vars |
| `backend/.env` | Add Gmail credentials (never commit) |
| `frontend/src/screens/LoginScreen.jsx` | Replace supabase OTP calls with backend calls |
| `frontend/app/auth/callback.jsx` | **NEW** — deep link callback for Google OAuth |
| `supabase/migrations/` | **NEW** — `otp_codes` table SQL |

---

## What Stays The Same

- Supabase still issues the **JWT session** for both login methods
- The `Authorization: Bearer <token>` header pattern on all API calls is unchanged
- `authStore`, `useAuthStore`, `get_current_user` dependency — all unchanged
- Google OAuth flow — Supabase handles the entire OAuth handshake
- The `profiles` table and first-user trigger — unchanged
