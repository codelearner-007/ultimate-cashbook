-- ============================================================
-- Migration 026: Add age column to profiles
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age smallint CHECK (age >= 1 AND age <= 120);
