/**
 * Feature-gate map — source of truth: SUBSCRIPTION_PLANS.md
 * Tiers (ordered): free < pro < business
 */
const TIER_RANK = { free: 0, pro: 1, business: 2 };

const FEATURES = {
  // Cloud sync — data stored locally on free tier only
  cloud_sync:      'pro',

  // PDF / Excel export and full report access
  export_reports:  'pro',

  // Book sharing / collaboration
  book_sharing:    'pro',

  // Guest access (pro = 1, business = 10)
  guest_access:    'pro',

  // Backup history
  backup_history:  'pro',

  // Attachments — available on all tiers
  attachments:     'free',
};

/**
 * Per-feature limits per tier. Infinity = unlimited.
 * Only entries where a tier has a non-unlimited cap are listed.
 */
const LIMITS = {
  // Owned cashbooks
  books:          { free: 3,  pro: 15, business: Infinity },

  // Invited guests per account
  guest_access:   { free: 0,  pro: 1,  business: 10 },

  // Backup history in days (0 = none)
  backup_days:    { free: 0,  pro: 7,  business: 30 },
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
 */
export function getLimit(user, feature) {
  const userTier = user?.subscription_tier ?? 'free';
  return LIMITS[feature]?.[userTier] ?? Infinity;
}

/** Convenience constants — use instead of magic numbers in the UI. */
export const FREE_BOOK_LIMIT     = LIMITS.books.free;     // 3
export const PRO_BOOK_LIMIT      = LIMITS.books.pro;      // 15
export const BUSINESS_BOOK_LIMIT = LIMITS.books.business; // Infinity
