/**
 * RevenueCat purchase wrapper (native: iOS / Android).
 *
 * Entitlements are the server's source of truth — granted ONLY by the RevenueCat
 * webhook (backend/app/routers/webhooks.py) after a verified store purchase. This
 * module just drives the native purchase UI and reports success; the app then
 * re-fetches the profile to pick up the webhook-applied tier.
 *
 * The native module is absent in Expo Go and on web, so the require is guarded:
 * `isPurchasesAvailable()` returns false there and callers fall back gracefully.
 *
 * Setup (real builds):
 *   - `npx expo install react-native-purchases` + a custom dev/EAS build (not Expo Go).
 *   - EXPO_PUBLIC_REVENUECAT_IOS_KEY / EXPO_PUBLIC_REVENUECAT_ANDROID_KEY in env.
 *   - RevenueCat dashboard: products named so the identifier contains the tier
 *     ("pro"/"business") and the period ("month"/"year"|"annual"); configure the
 *     webhook Authorization header to match backend REVENUECAT_WEBHOOK_AUTH; set
 *     the RevenueCat app_user_id to the Supabase user id (done via configure()).
 */

import { Platform } from 'react-native';

let Purchases = null;
try {
  // Native-only; throws in Expo Go (no native module) — handled gracefully.
  Purchases = require('react-native-purchases').default;
} catch {
  Purchases = null;
}

const API_KEY =
  Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

let _configured = false;

/** True only when the native SDK loaded AND an API key is configured. */
export function isPurchasesAvailable() {
  return !!Purchases && !!API_KEY;
}

/** Configure RevenueCat once, binding purchases to the Supabase user id. */
export async function configurePurchases(userId) {
  if (!isPurchasesAvailable() || _configured || !userId) return;
  try {
    Purchases.configure({ apiKey: API_KEY, appUserID: userId });
    _configured = true;
  } catch {
    /* non-fatal — purchases simply stay unavailable */
  }
}

export async function getOfferings() {
  if (!isPurchasesAvailable()) return null;
  return Purchases.getOfferings();
}

function matchPackage(offerings, tier, billing) {
  const current = offerings?.current;
  const pkgs = current?.availablePackages || [];
  const wantYear = billing === 'yearly';
  const idOf = (p) => (p.product?.identifier || p.identifier || '').toLowerCase();
  return (
    pkgs.find((p) => {
      const id = idOf(p);
      const periodOk = wantYear
        ? id.includes('year') || id.includes('annual')
        : id.includes('month');
      return id.includes(tier) && periodOk;
    }) ||
    pkgs.find((p) => idOf(p).includes(tier)) ||
    null
  );
}

/** Launch the native purchase flow for a tier + billing cycle. Throws on cancel/error. */
export async function purchaseTier(tier, billing) {
  if (!isPurchasesAvailable()) throw new Error('Purchases unavailable');
  const offerings = await Purchases.getOfferings();
  const pkg = matchPackage(offerings, tier, billing);
  if (!pkg) throw new Error('No matching product offering for this plan');
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

/** Restore prior purchases (Apple requires a visible restore action). */
export async function restorePurchases() {
  if (!isPurchasesAvailable()) return null;
  return Purchases.restorePurchases();
}
