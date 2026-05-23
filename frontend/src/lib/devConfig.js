/**
 * Dev-only configuration helpers.
 *
 * EXPO_PUBLIC_DEV_OVERRIDE_TIER overrides the subscription tier for:
 *   - Feature gates (canAccess / getLimit)
 *   - Data routing (local SQLite vs cloud API)
 *
 * Allowed values: "free" | "pro" | "business"
 * Leave the variable blank (or remove it entirely) for production builds.
 * In production, DEV_TIER exports null and every helper returns null, so
 * all code falls back to the real Supabase profile value.
 */

const VALID_TIERS = ['free', 'pro', 'business'];
const isDev = process.env.NODE_ENV !== 'production';

const raw = isDev
  ? process.env.EXPO_PUBLIC_DEV_OVERRIDE_TIER?.trim().toLowerCase()
  : undefined;

/** The overridden tier string, or null if no override is active. */
export const DEV_TIER = isDev && VALID_TIERS.includes(raw) ? raw : null;

/** Returns true when any dev override is active. */
export const isDevOverride = () => DEV_TIER !== null;

/**
 * When true, forces ALL data routing to local SQLite regardless of DEV_TIER.
 * Set EXPO_PUBLIC_DEV_OVERRIDE_LOCAL=true in .env.local to enable.
 * Has no effect in production (NODE_ENV === 'production' → always false).
 */
export const DEV_OVERRIDE_LOCAL =
  isDev &&
  process.env.EXPO_PUBLIC_DEV_OVERRIDE_LOCAL?.trim().toLowerCase() === 'true';
