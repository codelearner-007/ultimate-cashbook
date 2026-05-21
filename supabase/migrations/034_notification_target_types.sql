-- Migration 034: Expand notification target_type CHECK constraint
-- Adds plan-based targeting: plan_free, plan_pro_m, plan_pro_y, plan_biz_m, plan_biz_y
-- Also adds days_threshold column if not present (was missing from some installs).

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_target_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_target_type_check
    CHECK (target_type IN (
      'all',
      'new_users',
      'plan_free',
      'plan_pro_m',
      'plan_pro_y',
      'plan_biz_m',
      'plan_biz_y',
      'specific'
    ));

-- Ensure days_threshold column exists (may be missing on older installs)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS days_threshold int;
