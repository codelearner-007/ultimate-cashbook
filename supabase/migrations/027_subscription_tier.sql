-- Add subscription_tier to profiles
-- 'free'       = default tier (local SQLite, limited features)
-- 'pro'        = paid tier (cloud sync, all features except Guest Access)
-- 'enterprise' = top tier (all features including Guest Access)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'pro', 'enterprise'));
