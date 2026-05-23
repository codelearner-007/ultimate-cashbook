-- ============================================================
-- Migration 001: Core Tables — profiles, books, entries
-- ============================================================
-- Creates the three foundational tables with all final columns,
-- triggers (updated_at, book balance, profile auto-create),
-- RLS policies, and indexes.
-- ============================================================


-- ── Extensions ───────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";


-- ── profiles ─────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id                        uuid         primary key references auth.users(id) on delete cascade,
  email                     text         not null,
  full_name                 text,
  phone                     text,
  avatar_url                text,
  role                      text         not null default 'user'
                                         check (role in ('superadmin', 'user')),
  currency                  text         not null default 'PKR',
  is_dark_mode              boolean      not null default false,
  subscription_tier         text         not null default 'free'
                                         check (subscription_tier in ('free', 'pro', 'business')),
  subscription_started_at   timestamptz,
  subscription_billing_cycle text        not null default 'monthly'
                                         check (subscription_billing_cycle in ('monthly', 'yearly')),
  created_at                timestamptz  not null default now(),
  updated_at                timestamptz  not null default now()
);

alter table public.profiles enable row level security;

create policy "Users read own profile"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

create index if not exists profiles_role_idx        on public.profiles(role);
create index if not exists profiles_created_at_idx  on public.profiles(created_at desc);


-- ── Auto-create profile on auth sign-up ──────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_role text;
begin
  select case when count(*) = 0 then 'superadmin' else 'user' end
    into v_role
    from public.profiles;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    NEW.id,
    NEW.email,
    coalesce(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    v_role
  );
  return NEW;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ── profiles updated_at ───────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- ── books ─────────────────────────────────────────────────────────────────────

create table if not exists public.books (
  id               uuid           primary key default gen_random_uuid(),
  user_id          uuid           not null references auth.users(id) on delete cascade,
  name             text           not null,
  currency         text           not null default 'PKR',
  net_balance      numeric(14,2)  not null default 0,
  show_customer    boolean        not null default true,
  show_supplier    boolean        not null default true,
  show_category    boolean        not null default true,
  show_attachment  boolean        not null default true,
  created_at       timestamptz    not null default now(),
  updated_at       timestamptz    not null default now()
);

alter table public.books enable row level security;

create policy "Users own their books"
  on public.books for all
  using (auth.uid() = user_id);

create index if not exists books_user_created_idx on public.books(user_id, created_at desc);

drop trigger if exists books_updated_at on public.books;
create trigger books_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();


-- ── entries ───────────────────────────────────────────────────────────────────

create table if not exists public.entries (
  id                  uuid           primary key default gen_random_uuid(),
  book_id             uuid           not null references public.books(id) on delete cascade,
  user_id             uuid           not null references auth.users(id) on delete cascade,
  type                text           not null check (type in ('in', 'out')),
  amount              numeric(12,2)  not null,
  remark              text,
  category            text,
  payment_mode        text           default 'cash',
  contact_name        text,
  attachment_url      text,
  attachment_path     text,
  attachment_provider text           default 'supabase',
  entry_date          date           not null default current_date,
  entry_time          time           not null default current_time,
  created_at          timestamptz    not null default now()
);

alter table public.entries enable row level security;

create policy "Users own their entries"
  on public.entries for all
  using (auth.uid() = user_id);

create index if not exists entries_book_id_idx    on public.entries(book_id);
create index if not exists entries_user_id_idx    on public.entries(user_id);
create index if not exists entries_entry_date_idx on public.entries(entry_date);
create index if not exists entries_book_date_idx  on public.entries(book_id, entry_date desc, entry_time desc);
create index if not exists entries_user_date_idx  on public.entries(user_id, entry_date desc);


-- ── Book balance trigger ──────────────────────────────────────────────────────
-- Maintains books.net_balance automatically. Never compute it in app code.

create or replace function public.update_book_balance()
returns trigger language plpgsql security definer as $$
begin
  if (TG_OP = 'INSERT') then
    update public.books
      set net_balance = net_balance + case when NEW.type = 'in' then NEW.amount else -NEW.amount end
      where id = NEW.book_id;

  elsif (TG_OP = 'DELETE') then
    update public.books
      set net_balance = net_balance + case when OLD.type = 'in' then -OLD.amount else OLD.amount end
      where id = OLD.book_id;

  elsif (TG_OP = 'UPDATE') then
    -- reverse old, apply new (handles type change + amount change atomically)
    update public.books
      set net_balance = net_balance
        + case when OLD.type = 'in' then -OLD.amount else OLD.amount end
        + case when NEW.type = 'in' then  NEW.amount else -NEW.amount end
      where id = NEW.book_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_update_book_balance on public.entries;
create trigger trg_update_book_balance
  after insert or update or delete on public.entries
  for each row execute function public.update_book_balance();


-- ── Helper functions ──────────────────────────────────────────────────────────

create or replace function public.get_books_with_summary(p_user_id uuid)
returns table (
  id               uuid,
  user_id          uuid,
  name             text,
  currency         text,
  net_balance      numeric,
  show_customer    boolean,
  show_supplier    boolean,
  show_category    boolean,
  show_attachment  boolean,
  created_at       timestamptz,
  updated_at       timestamptz,
  last_entry_at    text
)
language sql security definer as $$
  select
    b.id,
    b.user_id,
    b.name,
    b.currency,
    b.net_balance,
    b.show_customer,
    b.show_supplier,
    b.show_category,
    b.show_attachment,
    b.created_at,
    b.updated_at,
    max(e.entry_date::text || 'T' || e.entry_time::text) as last_entry_at
  from public.books b
  left join public.entries e on e.book_id = b.id
  where b.user_id = p_user_id
  group by b.id
  order by b.created_at desc;
$$;

create or replace function public.get_book_summary(p_book_id uuid, p_user_id uuid)
returns table (total_in numeric, total_out numeric, net_balance numeric)
language sql security definer as $$
  select
    coalesce(sum(case when type = 'in'  then amount else 0 end), 0) as total_in,
    coalesce(sum(case when type = 'out' then amount else 0 end), 0) as total_out,
    coalesce(sum(case when type = 'in'  then amount else -amount end), 0) as net_balance
  from public.entries
  where book_id = p_book_id
    and user_id = p_user_id;
$$;
