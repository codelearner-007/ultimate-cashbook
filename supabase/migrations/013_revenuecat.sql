-- ============================================================
-- Migration 013: RevenueCat webhook idempotency
-- ============================================================
-- Records processed RevenueCat event ids so duplicate webhook
-- deliveries (RevenueCat retries on non-2xx) are no-ops.
--
-- Subscription state itself lives on profiles (migrations 001 + 009)
-- and is written ONLY by the verified webhook via the service role.
-- The 011 column-guard trigger prevents users from writing it directly.
--
-- Run via `supabase db push` or the SQL editor — do not auto-run.
-- ============================================================

create table if not exists public.processed_webhook_events (
  event_id     text        primary key,
  event_type   text,
  app_user_id  uuid,
  processed_at timestamptz not null default now()
);

alter table public.processed_webhook_events enable row level security;
revoke all on public.processed_webhook_events from anon, authenticated;
-- No policies on purpose: only the service-role backend may read/write this table.
