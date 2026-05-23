-- ============================================================
-- Migration 007: Book Sharing & Collaborator Access
-- ============================================================
-- book_shares table with invitation flow (pending → accepted;
-- decline = DELETE row). Collaborator RLS policies on books
-- and entries so Supabase Realtime delivers change events.
-- REPLICA IDENTITY FULL on books for Realtime UPDATE delivery.
-- Security-definer helper avoids nested RLS in Realtime.
-- ============================================================


-- ── book_shares ───────────────────────────────────────────────────────────────

create table if not exists public.book_shares (
  id              uuid    primary key default gen_random_uuid(),
  book_id         uuid    not null references public.books(id) on delete cascade,
  owner_id        uuid    not null references public.profiles(id) on delete cascade,
  shared_with_id  uuid    not null references public.profiles(id) on delete cascade,
  screens         jsonb   not null default '{
    "entries": true,
    "categories": false,
    "contacts": false,
    "payment_modes": false,
    "reports": false,
    "settings": false
  }'::jsonb,
  rights          text    not null default 'view'
                          check (rights in ('view', 'view_create_edit', 'view_create_edit_delete')),
  status          text    not null default 'pending'
                          check (status in ('pending', 'accepted')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint book_shares_unique unique (book_id, shared_with_id),
  constraint book_shares_no_self_share check (owner_id <> shared_with_id)
);

alter table public.book_shares enable row level security;

-- Owner has full control
create policy "Owner manages book shares"
  on public.book_shares for all to authenticated
  using (auth.uid() = owner_id);

-- Recipient can see their pending/accepted invitations
create policy "Recipient views own shares"
  on public.book_shares for select to authenticated
  using (auth.uid() = shared_with_id);

-- Recipient can accept the invitation (status update only)
create policy "Recipient responds to invitation"
  on public.book_shares for update to authenticated
  using (auth.uid() = shared_with_id);

create index if not exists book_shares_book_id_idx       on public.book_shares(book_id);
create index if not exists book_shares_shared_with_id_idx on public.book_shares(shared_with_id);
create index if not exists book_shares_owner_id_idx       on public.book_shares(owner_id);

drop trigger if exists book_shares_updated_at on public.book_shares;
create trigger book_shares_updated_at
  before update on public.book_shares
  for each row execute function public.set_updated_at();


-- ── Security-definer helper (avoids nested RLS in Realtime evaluator) ─────────

create or replace function public.is_accepted_collaborator(p_book_id uuid, p_user_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.book_shares
    where book_id = p_book_id
      and shared_with_id = p_user_id
      and status = 'accepted'
  );
$$;


-- ── Collaborator RLS on books ─────────────────────────────────────────────────

drop policy if exists "collaborators can view books" on public.books;
create policy "collaborators can view books"
  on public.books for select to authenticated
  using (
    auth.uid() = user_id
    or public.is_accepted_collaborator(id, auth.uid())
  );


-- ── Collaborator RLS on entries ───────────────────────────────────────────────

drop policy if exists "collaborators can view entries" on public.entries;
create policy "collaborators can view entries"
  on public.entries for select to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.book_shares bs
      where bs.book_id = entries.book_id
        and bs.shared_with_id = auth.uid()
        and bs.status = 'accepted'
    )
  );


-- ── Realtime publication ──────────────────────────────────────────────────────

-- REPLICA IDENTITY FULL is required so Realtime delivers full row on UPDATE
alter table public.books replica identity full;

-- Add tables to realtime publication (idempotent via DO block)
do $$
begin
  begin
    alter publication supabase_realtime add table public.book_shares;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.entries;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.books;
  exception when duplicate_object then null;
  end;
end;
$$;
