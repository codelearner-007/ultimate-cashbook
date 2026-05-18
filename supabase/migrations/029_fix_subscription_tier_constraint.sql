-- Fix subscription_tier CHECK constraint to use 'business' instead of 'enterprise'.
--
-- This migration is idempotent and handles three scenarios:
--   1. Migration 028 never ran  → old 'enterprise' constraint still present
--   2. Migration 028 ran with wrong name → two conflicting constraints exist
--      (making both 'enterprise' AND 'business' invalid — causing the error)
--   3. Migration 028 ran correctly → this is a safe no-op

-- Step 1: Drop every CHECK constraint on profiles that mentions subscription_tier,
--         regardless of its auto-generated name.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.profiles'::regclass
          AND contype   = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%subscription_tier%'
    LOOP
        EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', r.conname);
    END LOOP;
END
$$;

-- Step 2: Migrate any leftover 'enterprise' rows to 'business'
UPDATE public.profiles
SET subscription_tier = 'business'
WHERE subscription_tier = 'enterprise';

-- Step 3: Add the single, correct constraint
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_tier_check
    CHECK (subscription_tier IN ('free', 'pro', 'business'));
