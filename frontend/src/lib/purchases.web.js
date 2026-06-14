/**
 * Web stub for the RevenueCat purchase wrapper.
 *
 * The RevenueCat native SDK is unavailable in the browser, so purchases are not
 * offered on web. `isPurchasesAvailable()` is false and the UI falls back to a
 * store redirect (production) or the dev tier override (development).
 */

export function isPurchasesAvailable() {
  return false;
}

export async function configurePurchases() {}

export async function getOfferings() {
  return null;
}

export async function purchaseTier() {
  throw new Error('Purchases are not available on web');
}

export async function restorePurchases() {
  return null;
}
