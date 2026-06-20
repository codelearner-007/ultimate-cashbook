-- ============================================================
-- Migration 011: Cloud data expiry for lapsed subscriptions
-- ============================================================
-- When a user's paid subscription expires or is cancelled,
-- their cloud data (books + entries) is retained for a grace
-- period matching their last plan's backup retention window:
--   Pro      → 7 days  after subscription_expires_at
--   Business → 15 days after subscription_expires_at
--
-- cloud_data_delete_at is set by the backend when the
-- subscription lapses. A scheduled cleanup job deletes the
-- user's cloud books (and cascaded entries) once this date
-- passes. It is cleared when the user resubscribes.
-- ============================================================

alter table public.profiles
  add column if not exists cloud_data_delete_at timestamptz;

comment on column public.profiles.cloud_data_delete_at is
  'When set, the user''s cloud data will be deleted on or after this timestamp. '
  'Set when subscription lapses; cleared when user resubscribes.';
