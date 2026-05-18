-- Mark 028 as applied so the CLI stops retrying it
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('028', '028_rename_enterprise_to_business', ARRAY[]::text[])
ON CONFLICT (version) DO NOTHING;

-- ── 029: fix subscription_tier constraint ────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%subscription_tier%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', r.conname);
  END LOOP;
END$$;

UPDATE public.profiles
  SET subscription_tier = 'business'
  WHERE subscription_tier = 'enterprise';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_tier_check
    CHECK (subscription_tier IN ('free', 'pro', 'business'));

-- ── 030: subscription timing columns ────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_billing_cycle TEXT NOT NULL DEFAULT 'monthly'
    CHECK (subscription_billing_cycle IN ('monthly', 'yearly'));

-- Mark 029 and 030 as applied
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES
  ('029', '029_fix_subscription_tier_constraint', ARRAY[]::text[]),
  ('030', '030_subscription_timing',              ARRAY[]::text[])
ON CONFLICT (version) DO NOTHING;
