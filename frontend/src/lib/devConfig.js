/**
 * Dev-only configuration helpers.
 *
 * EXPO_PUBLIC_DEV_OVERRIDE_TIER overrides the subscription tier for:
 *   - Feature gates (canAccess / getLimit)
 *   - Data routing (local SQLite vs cloud API)
 *
 * Allowed values: "free" | "pro" | "business"
 * Leave the variable blank (or remove it entirely) for production builds.
 * In production, DEV_TIER is undefined and every helper returns null, so
 * all code falls back to the real Supabase profile value.
 */

const VALID_TIERS = ['free', 'pro', 'business'];

const raw = process.env.EXPO_PUBLIC_DEV_OVERRIDE_TIER?.trim().toLowerCase();

/** The overridden tier string, or null if no override is active. */
export const DEV_TIER = VALID_TIERS.includes(raw) ? raw : null;

/** Returns true when any dev override is active. */
export const isDevOverride = () => DEV_TIER !== null;
