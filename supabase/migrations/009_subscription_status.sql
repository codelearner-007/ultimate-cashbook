-- ============================================================
-- Migration 009: Subscription status fields on profiles
-- ============================================================
-- Adds subscription_status, subscription_expires_at, and
-- subscription_cancel_at_period_end to support the full
-- subscription lifecycle (active / cancelled / expired / past_due).
-- ============================================================

alter table public.profiles
  add column if not exists subscription_status text
    not null default 'free'
    check (subscription_status in ('free', 'active', 'cancelled', 'expired', 'past_due')),

  add column if not exists subscription_expires_at timestamptz,

  add column if not exists subscription_cancel_at_period_end boolean
    not null default false;
