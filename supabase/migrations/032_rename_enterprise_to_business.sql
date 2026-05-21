-- Rename subscription tier: 'enterprise' → 'business'
-- Also update the check constraint to match the new tier names.

-- 1. Drop the old check constraint (Postgres requires dropping before adding)
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_tier_check;

-- 2. Migrate any existing 'enterprise' rows
UPDATE profiles SET subscription_tier = 'business' WHERE subscription_tier = 'enterprise';

-- 3. Add updated check constraint
ALTER TABLE profiles
  ADD CONSTRAINT profiles_subscription_tier_check
    CHECK (subscription_tier IN ('free', 'pro', 'business'));
