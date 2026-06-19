# Ultimate CashBook — Subscription Lifecycle & Process

This document defines exactly how subscriptions work from first activation through cancellation and expiry.
It is the single source of truth for lifecycle decisions. Read before touching any subscription-related code.

---

## Payment Gateways

Ultimate CashBook uses **platform-native billing only**. There is no Stripe, no RevenueCat, and no other third-party payment processor.

| Platform | Gateway | API |
|---|---|---|
| Android | Google Play Billing | `react-native-iap` or Expo In-App Purchases |
| iOS | Apple App Store (StoreKit 2) | `react-native-iap` or Expo In-App Purchases |

**How verification works:**

- The payment sheet is opened by the platform SDK (Google Play / App Store) — the app never touches card data.
- After purchase, the platform returns a **purchase receipt / purchase token**.
- The app sends that token to the backend (`POST /api/v1/subscriptions/verify`).
- The backend verifies the token directly with Google Play Developer API or Apple App Store Server API (server-to-server, no third-party middleman).
- If valid, the backend writes the subscription record and returns the updated profile.

No webhook infrastructure is needed for the initial purchase. Server-to-server notifications (Google RTDN / Apple App Store Server Notifications) are used for renewals, cancellations, and expirations.

---

## Core Philosophy

- **There is no manual downgrade.** A user cannot choose to switch to a lower plan by themselves.
- **The only exit from a paid plan is cancellation.**
- Cancellation means: stop auto-renewal. It does NOT mean losing access immediately.
- When the billing period ends after cancellation, the system automatically moves the user to Free.
- A cancelled user keeps full paid-tier access until the last day of the period they already paid for.
- A user can re-subscribe at any time — before or after expiry.
- Superadmin is exempt from all subscription rules — always has full access regardless of tier.

---

## Subscription Lifecycle (Visual)

```
[Free]
   │
   │  User picks Pro or Business + billing cycle → pays via Google Play / App Store
   ▼
[Active]  ◄─────────────────────────────────────────────────────────────────┐
   │                                                                         │
   │  Platform auto-charges on renewal date                                 │
   │  Server notification received → expires_at extended                   │
   │  Continues silently — no user action needed                            │
   │                                                                         │
   │  User can also upgrade (Pro → Business) while active ──────────────────┘
   │
   │  User taps "Cancel Subscription"
   │
   ▼
[Cancelled — Still Active]
   │
   │  Full paid-tier access continues until expires_at
   │  "Cancels on [date]" badge shown on plan card
   │  No new charges will occur
   │  User can tap "Reactivate" to undo cancellation (if before expiry)
   │
   │  expires_at is reached
   │
   ▼
[Free]  (automatic — no user action needed)
   │
   │  User can re-subscribe anytime → goes back to [Active]
```

---

## Subscription States

| State | What It Means | Access Level | UI Badge |
|---|---|---|---|
| `free` | Never subscribed, or expired after cancellation | Free tier limits | "Free" chip |
| `active` | Paid and current — auto-renews on renewal date | Full paid-tier access | "Pro" or "Business" chip |
| `cancelled` | Cancelled but billing period not yet over | Full paid-tier access (until expires_at) | "Cancels on [date]" |
| `expired` | Period ended after cancellation — no renewal fired | Automatically moved to Free | "Free" chip |
| `past_due` | Renewal payment failed — retry window in progress | Full access during retry (up to 7 days) | "Payment failed" banner |

---

## Phase 1 — Subscribing (Free → Paid)

A user on the Free tier decides to upgrade.

### Step-by-Step

| Step | Actor | What Happens |
|---|---|---|
| 1 | User | Opens Subscription screen, selects Pro or Business |
| 2 | User | Selects billing cycle: Monthly or Yearly |
| 3 | User | Taps **Activate** |
| 4 | App | Opens platform payment sheet (Google Play Billing on Android / StoreKit on iOS) |
| 5 | User | Completes payment inside the platform sheet |
| 6 | Platform SDK | Returns purchase token / receipt to app |
| 7 | App | Sends token to `POST /api/v1/subscriptions/verify` |
| 8 | Backend | Verifies token with Google Play Developer API or Apple App Store Server API (server-to-server) |
| 9 | Backend | Updates DB: tier, status = `active`, started_at, expires_at, billing_cycle, platform, purchase_token |
| 10 | Frontend | Refreshes profile → new tier reflected in UI immediately |

### What Backend Sets on Successful Verification

| Field | Value Set |
|---|---|
| `subscription_tier` | `pro` or `business` |
| `subscription_status` | `active` |
| `billing_cycle` | `monthly` or `yearly` |
| `started_at` | current UTC timestamp |
| `expires_at` | now + 1 month (monthly) or now + 1 year (yearly) |
| `cancel_at_period_end` | `false` |
| `platform` | `google_play` or `app_store` |
| `purchase_token` | token from the platform (stored for server notification matching) |

### Verify Endpoint

```
POST /api/v1/subscriptions/verify
Body: { platform: "google_play" | "app_store", purchase_token: string, product_id: string }
Auth: Bearer <JWT>
```

Backend calls:
- **Google:** `GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{packageName}/purchases/subscriptions/{subscriptionId}/tokens/{token}`
- **Apple:** `POST https://api.storekit.itunes.apple.com/inApps/v2/transactions/verify` (StoreKit 2 JWS payload)

---

## Phase 2 — Active Period (Auto-Renewal)

Once active, the subscription renews silently every billing cycle. The platform handles charging — the backend only needs to react to server notifications.

### Renewal Flow

| Step | Actor | What Happens |
|---|---|---|
| 1 | Google Play / App Store | Charges user on renewal date |
| 2 | Platform | Sends server notification to backend (`/api/v1/subscriptions/notifications`) |
| 3 | Backend | Verifies notification authenticity (Google RTDN signed JWT / Apple JWS) |
| 4 | Backend | Extends `expires_at` by 1 month or 1 year, confirms `status = active` |
| 5 | User | Nothing to do — access continues uninterrupted |

### Server Notification Endpoints

| Platform | Notification Type | Backend Endpoint |
|---|---|---|
| Google Play | Real-Time Developer Notifications (RTDN) via Pub/Sub | `POST /api/v1/subscriptions/notifications/google` |
| Apple App Store | App Store Server Notifications (version 2) | `POST /api/v1/subscriptions/notifications/apple` |

### Billing Cycle Reference

| Billing Cycle | Renewal Frequency | Example |
|---|---|---|
| Monthly | Every 30 days | Subscribed May 1 → renews Jun 1, Jul 1 … |
| Yearly | Every 365 days | Subscribed May 1 → renews May 1 next year |

---

## Phase 3 — Upgrading (Pro → Business)

A user on Pro wants to move to Business. This is the only plan-switch available — there is no downgrade button.

### Step-by-Step

| Step | Actor | What Happens |
|---|---|---|
| 1 | User | Opens Subscription screen, taps **Activate Business** |
| 2 | App | Opens platform upgrade flow (Google Play handles proration; App Store upgrades immediately) |
| 3 | Platform | Calculates proration automatically and charges the difference |
| 4 | Platform | Sends subscription-updated server notification to backend |
| 5 | Backend | Updates `subscription_tier` to `business`, keeps existing `expires_at` |
| 6 | Frontend | Refreshes profile → Business features unlock immediately |

### Proration Reference

| Switch | Charge | Takes Effect |
|---|---|---|
| Pro Monthly → Business Monthly | Prorated difference (Google Play handles this automatically) | Immediately |
| Pro Yearly → Business Yearly | Prorated difference (Google Play handles this automatically) | Immediately |
| Pro → Business on iOS | Full Business price; Apple credits unused Pro time per App Store rules | Immediately |

---

## Phase 4 — Switching Billing Cycle (Same Plan)

A user wants to switch from Monthly to Yearly (or reverse) without changing their plan tier.

| Switch | Charge | Takes Effect |
|---|---|---|
| Monthly → Yearly (same plan) | Yearly price; platform credits unused days | Immediately — expires_at jumps to 1 year from now |
| Yearly → Monthly (same plan) | No immediate charge | At end of current yearly period — then billed monthly |

> **Note:** Cycle switching is handled by the platform billing flow. The backend learns about the change via a subscription-updated server notification and updates `billing_cycle` and `expires_at` accordingly.

---

## Phase 5 — Cancellation

The user decides to stop paying. **This is the only way to move from a paid plan to Free.**
There is no "Downgrade to Free" button — only "Cancel Subscription."

### What Cancellation Means

- Auto-renewal is stopped.
- No more charges will occur.
- The user keeps **full paid-tier access** for the rest of the period they already paid for.
- When `expires_at` is reached, the system automatically moves them to Free.

### Step-by-Step

| Step | Actor | What Happens |
|---|---|---|
| 1 | User | Taps **Cancel Subscription** on the Subscription screen |
| 2 | App | Shows confirmation sheet (see copy below) |
| 3 | User | Confirms cancellation |
| 4 | App | Deep-links user to Google Play Subscriptions page or Apple Subscriptions settings to cancel (platform-managed) |
| 5 | Platform | User completes cancellation on the platform side |
| 6 | Platform | Sends cancellation server notification to backend |
| 7 | Backend | Sets `cancel_at_period_end = true` in DB. No other fields change. |
| 8 | Frontend | Refreshes profile → "Cancels on [date]" badge appears on plan card |
| 9 | User | Continues using full paid-tier access until `expires_at` |
| 10 | expires_at reached | System automatically moves user to Free (see Phase 6) |

> **Why deep-link instead of in-app cancel:** Google Play and the App Store require subscriptions to be cancelled through their own subscription management UI. Apps cannot cancel on behalf of a user via API.

### Cancellation Confirmation Sheet Copy

> **Cancel Subscription?**
>
> You'll be taken to **[Google Play / App Store]** to cancel your subscription.
> You'll keep full **[Pro / Business]** access until **[expires_at formatted as "Month D, YYYY"]**.
> After that, your account moves to **Free** automatically.
>
> [**Go to [Google Play / App Store]**]   [Maybe Later]

### Deep-Link References

| Platform | Link |
|---|---|
| Google Play | `https://play.google.com/store/account/subscriptions` |
| Apple App Store | `itms-apps://apps.apple.com/account/subscriptions` |

### UI States After Cancellation

| Element | Before Cancel | After Cancel |
|---|---|---|
| Plan chip in Settings | "Pro" or "Business" | "Pro" or "Business" (unchanged — still active) |
| Subscription screen plan card | Active plan highlighted | Active plan + "Cancels on [date]" badge |
| CTA button on current plan card | "Cancel Subscription" | "Reactivate" |
| CTA button on other plan cards | "Activate [Plan]" | "Activate [Plan]" (still tappable — re-subscribing is allowed) |

---

## Phase 6 — Expiry (Automatic Move to Free)

Triggered by the `SUBSCRIPTION_EXPIRED` (Google) or `EXPIRED` (Apple) server notification when the billing period ends without renewal.
No user action is needed or possible — this is fully automatic.

### What Backend Does on Expiry

| Field | Value Set |
|---|---|
| `subscription_tier` | `free` |
| `subscription_status` | `expired` |
| `cancel_at_period_end` | `false` (reset) |
| `expires_at` | kept as-is (record of when it expired) |

### What Happens to User Data

| Data Type | What Happens |
|---|---|
| All entries | Kept — nothing is ever deleted |
| All books | Kept in DB — books beyond the Free limit (5) become read-only |
| Cloud sync | Pauses — last synced data remains accessible on that device |
| PDF / Excel export | Locked behind paywall again |
| Reports | View-only mode re-applied |
| Guests | Lose access to shared books immediately |
| Backup history | No longer accessible |

> **Data safety rule:** No user data is deleted on expiry. Books beyond the Free limit are made read-only,
> not deleted. The user gets them back immediately if they re-subscribe.

---

## Phase 7 — Reactivation

### Before Expiry (Still in Cancelled State)

The user goes back to the platform subscription management page to reactivate.

| Step | Actor | What Happens |
|---|---|---|
| 1 | User | Taps **Reactivate** on the Subscription screen |
| 2 | App | Deep-links to Google Play Subscriptions or Apple Subscriptions settings |
| 3 | User | Reactivates on the platform |
| 4 | Platform | Sends subscription-updated notification (cancellation flag removed) |
| 5 | Backend | Sets `cancel_at_period_end = false` in DB |
| 6 | Frontend | Polls profile → "Cancels on [date]" badge disappears — plan card returns to normal active state |

### After Expiry (Already on Free)

The user treats this as a brand-new subscription and goes through Phase 1 again.
Previous data is intact and becomes accessible again immediately after re-subscribing.

---

## Phase 8 — Payment Failure (Past Due)

If the renewal charge fails (expired card, insufficient funds):

| Timeline | What Happens |
|---|---|
| Day 0 (renewal date) | Charge fails — platform retries automatically |
| Days 1–7 | User keeps full paid-tier access — platform retries |
| During retry window | App shows a "Payment failed — please update your payment method" banner |
| User action | User updates payment method in Google Play / App Store account settings |
| Final retry succeeds | Server notification fires → `expires_at` extended → status back to `active` |
| All retries fail | `SUBSCRIPTION_EXPIRED` / `EXPIRED` notification fires → same as Phase 6 expiry |

---

## Server Notification Events to Handle

### Google Play (RTDN via Pub/Sub)

| `notificationType` | What Backend Does |
|---|---|
| `SUBSCRIPTION_PURCHASED` (1) | Set tier, status = active, started_at, expires_at, billing_cycle |
| `SUBSCRIPTION_RENEWED` (2) | Extend expires_at, confirm status = active |
| `SUBSCRIPTION_CANCELED` (3) | Set cancel_at_period_end = true |
| `SUBSCRIPTION_PURCHASED` after cancel | Set cancel_at_period_end = false (reactivation) |
| `SUBSCRIPTION_ON_HOLD` (5) | Set status = past_due |
| `SUBSCRIPTION_IN_GRACE_PERIOD` (6) | Keep status = active, show banner |
| `SUBSCRIPTION_RESTARTED` (7) | Set cancel_at_period_end = false |
| `SUBSCRIPTION_PRICE_CHANGE_CONFIRMED` (8) | No DB change needed |
| `SUBSCRIPTION_DEFERRED` (9) | Update expires_at |
| `SUBSCRIPTION_EXPIRED` (13) | Set tier = free, status = expired, cancel_at_period_end = false |
| `SUBSCRIPTION_REVOKED` (12) | Same as expired |
| `SUBSCRIPTION_PAUSED` (10) | Set status = past_due |

### Apple App Store (App Store Server Notifications v2)

| `notificationType` | What Backend Does |
|---|---|
| `SUBSCRIBED` | Set tier, status = active, started_at, expires_at, billing_cycle |
| `DID_RENEW` | Extend expires_at, confirm status = active |
| `DID_FAIL_TO_RENEW` | Set status = past_due, show banner |
| `EXPIRED` | Set tier = free, status = expired, cancel_at_period_end = false |
| `GRACE_PERIOD_EXPIRED` | Same as EXPIRED |
| `DID_CHANGE_RENEWAL_STATUS` (subtype `AUTO_RENEW_DISABLED`) | Set cancel_at_period_end = true |
| `DID_CHANGE_RENEWAL_STATUS` (subtype `AUTO_RENEW_ENABLED`) | Set cancel_at_period_end = false |
| `DID_CHANGE_RENEWAL_PREF` | Update billing_cycle or tier on next renewal |
| `REFUND` | Set tier = free, status = expired |
| `CONSUMPTION_REQUEST` | Log and respond — no DB change |

---

## Subscription Screen — CTA Button Logic

This table defines exactly which button to show on each plan card based on current state.

| User's Current Tier | User's Status | Plan Card Shown | Button Label | Button Action |
|---|---|---|---|---|
| free | — | Free card | "Current Plan" (disabled) | — |
| free | — | Pro card | "Activate Pro" | Start Phase 1 |
| free | — | Business card | "Activate Business" | Start Phase 1 |
| pro | active | Free card | "Cancel Subscription" | Start Phase 5 |
| pro | active | Pro card | "Current Plan" (disabled) | — |
| pro | active | Business card | "Upgrade to Business" | Start Phase 3 |
| pro | cancelled | Free card | "Cancels on [date]" (info only) | — |
| pro | cancelled | Pro card | "Current Plan — Cancels on [date]" (disabled) | — |
| pro | cancelled | Business card | "Reactivate & Upgrade" | Start Phase 3 (also removes cancel) |
| business | active | Free card | "Cancel Subscription" | Start Phase 5 |
| business | active | Pro card | (lower tier — no button) | — |
| business | active | Business card | "Current Plan" (disabled) | — |
| business | cancelled | Free card | "Cancels on [date]" (info only) | — |
| business | cancelled | Pro card | (lower tier — no button) | — |
| business | cancelled | Business card | "Current Plan — Cancels on [date]" (disabled) | — |

> **Rule:** There is never a "Downgrade" button anywhere in the UI.
> Cancellation is the only path to Free, and it happens automatically at period end.

---

## Database Fields Required

These live in a dedicated `subscriptions` table (not on `profiles` — Phase 3 migration in `SUBSCRIPTION_PROCESS.md`).
`profiles.subscription_tier` is a denormalized copy updated by the notification handler for fast feature-gate reads.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → profiles.id |
| `plan` | TEXT | `free`, `pro`, `business` |
| `status` | TEXT | `active`, `cancelled`, `expired`, `past_due` |
| `billing_cycle` | TEXT | `monthly`, `yearly`, `none` |
| `started_at` | TIMESTAMPTZ | When the current paid period started |
| `expires_at` | TIMESTAMPTZ | When the current paid period ends |
| `cancel_at_period_end` | BOOLEAN | true if cancelled but period still running |
| `platform` | TEXT | `google_play` or `app_store` |
| `purchase_token` | TEXT | Platform purchase token (used for server notification matching and verification) |
| `product_id` | TEXT | Platform product ID (e.g. `cashbook_pro_monthly`) |

---

## Feature Access After Each State

| Feature | Free | Active (Pro) | Cancelled-still-active (Pro) | Expired (back to Free) |
|---|---|---|---|---|
| Books limit | 3 (read-only beyond) | 15 | 15 (full access) | 3 (read-only beyond) |
| Cloud sync | No | Yes | Yes | No |
| PDF / Excel export | No | Yes | Yes | No |
| Reports (download) | No | Yes | Yes | No |
| Shared books | No | Yes | Yes (still active) | No (guests lose access) |
| Backup history | No | 7 days | 7 days | No |
| Guest access | No | 1 guest | 1 guest | No (guests removed) |

---

## Superadmin Exception

The superadmin account is outside the subscription system entirely:

- `canAccess()` returns `true` for every feature regardless of `subscription_tier`
- No subscription screen shown in the admin dashboard
- No Google Play or App Store interaction is ever triggered for superadmin accounts
- Superadmin does not count toward book limits
