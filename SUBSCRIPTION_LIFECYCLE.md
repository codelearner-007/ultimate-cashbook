# CashBook — Subscription Lifecycle & Process

This document defines exactly how subscriptions work from first activation through cancellation and expiry.
It is the single source of truth for lifecycle decisions. Read before touching any subscription-related code.

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
   │  User picks Pro or Business + billing cycle → pays
   ▼
[Active]  ◄─────────────────────────────────────────────────────────────────┐
   │                                                                         │
   │  Stripe auto-charges on renewal date                                   │
   │  Webhook received → expires_at extended                                │
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
| 4 | App | Opens RevenueCat / Stripe payment sheet |
| 5 | User | Completes payment |
| 6 | Payment Gateway | Sends `INITIAL_PURCHASE` webhook to backend |
| 7 | Backend | Updates DB: tier, status = `active`, started_at, expires_at, billing_cycle |
| 8 | Frontend | Refreshes profile → new tier reflected in UI immediately |

### What Backend Sets on Successful Payment

| Field | Value Set |
|---|---|
| `subscription_tier` | `pro` or `business` |
| `subscription_status` | `active` |
| `billing_cycle` | `monthly` or `yearly` |
| `started_at` | current UTC timestamp |
| `expires_at` | now + 1 month (monthly) or now + 1 year (yearly) |
| `cancel_at_period_end` | `false` |

---

## Phase 2 — Active Period (Auto-Renewal)

Once active, the subscription renews silently every billing cycle.

### Renewal Flow

| Step | Actor | What Happens |
|---|---|---|
| 1 | Stripe / RevenueCat | Charges user on renewal date |
| 2 | Payment Gateway | Sends `RENEWAL` or `invoice.paid` webhook to backend |
| 3 | Backend | Extends `expires_at` by 1 month or 1 year |
| 4 | User | Nothing to do — access continues uninterrupted |

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
| 2 | App | Opens payment sheet for the Business plan |
| 3 | Payment Gateway | Calculates proration automatically: credits unused Pro days, charges only the Business difference |
| 4 | Payment Gateway | Sends `customer.subscription.updated` webhook |
| 5 | Backend | Updates `subscription_tier` to `business`, keeps existing `expires_at` |
| 6 | Frontend | Refreshes profile → Business features unlock immediately |

### Proration Reference

| Switch | Charge | Takes Effect |
|---|---|---|
| Pro Monthly → Business Monthly | Prorated difference only | Immediately |
| Pro Yearly → Business Yearly | Prorated difference only | Immediately |

---

## Phase 4 — Switching Billing Cycle (Same Plan)

A user wants to switch from Monthly to Yearly (or reverse) without changing their plan tier.

| Switch | Charge | Takes Effect |
|---|---|---|
| Monthly → Yearly (same plan) | Yearly price minus credit for unused days of current month | Immediately — expires_at jumps to 1 year from now |
| Yearly → Monthly (same plan) | No charge | At end of current yearly period — then billed monthly |

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
| 4 | Backend | Calls payment gateway to cancel at period end |
| 5 | Backend | Sets `cancel_at_period_end = true` in DB. No other fields change. |
| 6 | Frontend | Refreshes profile → "Cancels on [date]" badge appears on plan card |
| 7 | User | Continues using full paid-tier access until `expires_at` |
| 8 | expires_at reached | System automatically moves user to Free (see Phase 6) |

### Cancellation Confirmation Sheet Copy

> **Cancel Subscription?**
>
> Your subscription will not renew. You'll keep full **[Pro / Business]** access until **[expires_at formatted as "Month D, YYYY"]**.
> After that, your account moves to **Free** automatically.
>
> [**Confirm Cancel**]   [Maybe Later]

### UI States After Cancellation

| Element | Before Cancel | After Cancel |
|---|---|---|
| Plan chip in Settings | "Pro" or "Business" | "Pro" or "Business" (unchanged — still active) |
| Subscription screen plan card | Active plan highlighted | Active plan + "Cancels on [date]" badge |
| CTA button on current plan card | "Cancel Subscription" | "Reactivate" |
| CTA button on other plan cards | "Activate [Plan]" | "Activate [Plan]" (still tappable — re-subscribing is allowed) |

---

## Phase 6 — Expiry (Automatic Move to Free)

Triggered by the `customer.subscription.deleted` or `EXPIRATION` webhook when `expires_at` is reached.
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
| All books | Kept in DB — books beyond the Free limit (3) become read-only |
| Cloud sync | Pauses — last synced data remains accessible on that device |
| PDF / Excel export | Locked behind paywall again |
| Reports | View-only mode re-applied |
| Guests | Lose access to shared books immediately |
| Backup history | No longer accessible |

> **Data safety rule:** No user data is deleted on expiry. Books beyond the Free limit are made read-only,
> not deleted. The user gets them back immediately if they re-subscribe.

---

## Phase 7 — Reactivation

A user who cancelled but has not yet expired can undo the cancellation.

### Before Expiry (Still in Cancelled State)

| Step | Actor | What Happens |
|---|---|---|
| 1 | User | Taps **Reactivate** on the Subscription screen |
| 2 | Backend | Calls payment gateway to remove the `cancel_at_period_end` flag |
| 3 | Backend | Sets `cancel_at_period_end = false` in DB |
| 4 | Frontend | "Cancels on [date]" badge disappears — plan card returns to normal active state |
| 5 | Next renewal date | Auto-renewal fires as normal — subscription continues |

### After Expiry (Already on Free)

The user treats this as a brand-new subscription and goes through Phase 1 again.
Previous data is intact and cloud-synced data becomes accessible again immediately after re-subscribing.

---

## Phase 8 — Payment Failure (Past Due)

If the renewal charge fails (expired card, insufficient funds):

| Timeline | What Happens |
|---|---|
| Day 0 (renewal date) | Charge fails — Stripe retries automatically |
| Days 1–7 | User keeps full paid-tier access — Stripe retries up to 3 times |
| During retry window | App shows a "Payment failed — please update your card" banner |
| User action | User can update card via Stripe billing portal link |
| Final retry succeeds | Webhook fires → `expires_at` extended → status back to `active` |
| All retries fail (Day 7) | `customer.subscription.deleted` webhook fires → same as Phase 6 expiry |

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

## Backend Webhooks to Handle

| Webhook Event | What Backend Does |
|---|---|
| `INITIAL_PURCHASE` / `customer.subscription.created` | Set tier, status = active, started_at, expires_at, billing_cycle |
| `RENEWAL` / `invoice.paid` | Extend expires_at, confirm status = active |
| `customer.subscription.updated` | Update tier and/or billing_cycle (upgrade or cycle switch) |
| `CANCELLATION` (cancel_at_period_end set) | Set cancel_at_period_end = true in DB — no other changes |
| `EXPIRATION` / `customer.subscription.deleted` | Set tier = free, status = expired, cancel_at_period_end = false |
| `invoice.payment_failed` | Set status = past_due, trigger payment-failed banner |
| `invoice.payment_succeeded` (after past_due) | Set status = active, extend expires_at |

---

## Database Fields Required

These live in a dedicated `subscriptions` table (not on `profiles` — Phase 3 migration in `SUBSCRIPTION_PROCESS.md`).
`profiles.subscription_tier` is a denormalized copy updated by the webhook handler for fast feature-gate reads.

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
| `revenuecat_user_id` | TEXT | RevenueCat customer ID |
| `stripe_subscription_id` | TEXT | Stripe subscription object ID (if using Stripe) |

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
- No RevenueCat or Stripe interaction is ever triggered for superadmin accounts
- Superadmin does not count toward book limits
