-- Remove is_active column from profiles — access is now controlled by subscription tier
drop index if exists public.profiles_is_active_idx;
alter table public.profiles drop column if exists is_active;
