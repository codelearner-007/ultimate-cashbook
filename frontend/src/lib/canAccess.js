/**
 * Feature-gate map.
 * Tiers (ordered): free < pro < enterprise
 * Phase 3 (RevenueCat) will flip subscription_tier on purchase.
 */
const TIER_RANK = { free: 0, pro: 1, enterprise: 2 };

const FEATURES = {
  // Phase 1 — cloud sync (free tier uses local SQLite only)
  cloud_sync:       'pro',

  // Phase 5 — unlimited books (free tier capped)
  unlimited_books:  'pro',

  // Phase 5 — PDF / Excel export
  export_reports:   'pro',

  // Phase 5 — advanced reports
  advanced_reports: 'pro',

  // Phase 5 — book sharing / collaboration (pro = 1 guest, enterprise = unlimited)
  book_sharing:     'pro',

  // Phase 5 — multiple currencies per book
  multi_currency:   'pro',

  // Phase 5 — attachment uploads
  attachments:      'free',

  // Phase 6 — guest access (pro = 1, enterprise = unlimited)
  guest_access:     'pro',
};

/**
 * Per-feature limits per tier. Infinity = unlimited.
 * Only define entries where a tier has a non-unlimited cap.
 */
const LIMITS = {
  guest_access: { free: 0, pro: 1, enterprise: 10 },
};

/**
 * Returns true if the user's tier meets the minimum required for the feature.
 */
export function canAccess(user, feature) {
  const userTier = user?.subscription_tier ?? 'free';
  const required = FEATURES[feature] ?? 'free';
  return (TIER_RANK[userTier] ?? 0) >= (TIER_RANK[required] ?? 0);
}

/**
 * Returns the numeric limit for a feature on the user's tier.
 * Returns Infinity if no cap is defined for that tier.
 *
 * Usage: getLimit(user, 'guest_access') → 1 (pro) or Infinity (enterprise)
 */
export function getLimit(user, feature) {
  const userTier = user?.subscription_tier ?? 'free';
  return LIMITS[feature]?.[userTier] ?? Infinity;
}
