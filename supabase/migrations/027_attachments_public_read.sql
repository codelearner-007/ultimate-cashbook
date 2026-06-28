-- ============================================================
-- Migration 027: Allow public read on attachments bucket
-- ============================================================
-- The attachments bucket was switched to public=true in the
-- Supabase dashboard, but the existing RLS policy only allows
-- reads "to authenticated". This means React Native's <Image>
-- component (which sends no auth header) gets a 403 when trying
-- to load an attachment URL — including after reinstall/restore.
--
-- Fix: add a "to public" select policy matching the avatars bucket
-- pattern. URLs are UUID-based (unguessable), so public read is safe.
-- ============================================================

drop policy if exists "attachments_public_read" on storage.objects;

create policy "attachments_public_read"
  on storage.objects for select to public
  using (bucket_id = 'attachments');
