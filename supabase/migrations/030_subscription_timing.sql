-- Add subscription timing columns to profiles.
-- subscription_started_at  — when the current plan was activated (NULL = never set)
-- subscription_billing_cycle — 'monthly' | 'yearly'

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_billing_cycle TEXT NOT NULL DEFAULT 'monthly'
    CHECK (subscription_billing_cycle IN ('monthly', 'yearly'));
