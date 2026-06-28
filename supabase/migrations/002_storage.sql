-- ============================================================
-- Migration 002: Storage Buckets — avatars & attachments
-- ============================================================
-- Creates both avatars and attachments as public buckets.
-- Write (upload/delete) is restricted to the owning user.
-- Read is open to public — URLs are UUID-based (unguessable)
-- and React Native's <Image> sends no auth header.
-- Also adds the get_user_storage_bytes() admin helper.
-- ============================================================


-- ── avatars bucket (public) ───────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,  -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update set public = true;

drop policy if exists "avatars_auth_write"  on storage.objects;
drop policy if exists "avatars_public_read" on storage.objects;

create policy "avatars_auth_write"
  on storage.objects for all to authenticated
  using  (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_public_read"
  on storage.objects for select to public
  using (bucket_id = 'avatars');


-- ── attachments bucket (public) ──────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do update set public = true;

drop policy if exists "Users upload own attachments" on storage.objects;
drop policy if exists "Users read own attachments"  on storage.objects;
drop policy if exists "attachments_public_read"     on storage.objects;

create policy "Users upload own attachments"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete own attachments"
  on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "attachments_public_read"
  on storage.objects for select to public
  using (bucket_id = 'attachments');


-- ── Storage bytes helper (tables don't exist yet; data bytes added in 008) ───

create or replace function public.get_user_storage_bytes(p_user_id uuid)
returns bigint language sql security definer as $$
  select coalesce(
    sum((metadata->>'size')::bigint), 0
  )::bigint
  from storage.objects
  where bucket_id in ('attachments', 'avatars')
    and name like p_user_id::text || '/%';
$$;
