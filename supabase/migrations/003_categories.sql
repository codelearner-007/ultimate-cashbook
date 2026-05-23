-- ============================================================
-- Migration 003: Categories
-- ============================================================
-- Per-book categories with auto-maintained balances.
-- Adds category_id FK to entries (ON DELETE SET NULL).
-- Trigger clears category text snapshot on category delete.
-- ============================================================


-- ── Table ────────────────────────────────────────────────────────────────────

create table if not exists public.categories (
  id            uuid           primary key default gen_random_uuid(),
  book_id       uuid           not null references public.books(id) on delete cascade,
  user_id       uuid           not null references auth.users(id) on delete cascade,
  name          text           not null,
  total_in      numeric(14,2)  not null default 0,
  total_out     numeric(14,2)  not null default 0,
  net_balance   numeric(14,2)  not null default 0,
  display_order integer        not null default 0,
  created_at    timestamptz    not null default now(),
  constraint categories_book_name_unique unique (book_id, name)
);

alter table public.categories enable row level security;

create policy "Users manage own categories"
  on public.categories for all
  using (auth.uid() = user_id);

create index if not exists categories_book_idx              on public.categories(book_id);
create index if not exists categories_user_idx              on public.categories(user_id);
create index if not exists idx_categories_book_display_order on public.categories(book_id, display_order);


-- ── FK on entries ─────────────────────────────────────────────────────────────

alter table public.entries
  add column if not exists category_id uuid references public.categories(id) on delete set null;

create index if not exists entries_category_id_idx on public.entries(category_id);


-- ── Balance trigger ───────────────────────────────────────────────────────────

create or replace function public.update_category_balance()
returns trigger language plpgsql security definer as $$
begin
  if (TG_OP = 'INSERT') then
    if NEW.category_id is not null then
      update public.categories set
        total_in    = total_in    + case when NEW.type = 'in'  then NEW.amount else 0 end,
        total_out   = total_out   + case when NEW.type = 'out' then NEW.amount else 0 end,
        net_balance = net_balance + case when NEW.type = 'in'  then NEW.amount else -NEW.amount end
      where id = NEW.category_id;
    end if;

  elsif (TG_OP = 'DELETE') then
    if OLD.category_id is not null then
      update public.categories set
        total_in    = total_in    - case when OLD.type = 'in'  then OLD.amount else 0 end,
        total_out   = total_out   - case when OLD.type = 'out' then OLD.amount else 0 end,
        net_balance = net_balance - case when OLD.type = 'in'  then OLD.amount else -OLD.amount end
      where id = OLD.category_id;
    end if;

  elsif (TG_OP = 'UPDATE') then
    if OLD.category_id is not null then
      update public.categories set
        total_in    = total_in    - case when OLD.type = 'in'  then OLD.amount else 0 end,
        total_out   = total_out   - case when OLD.type = 'out' then OLD.amount else 0 end,
        net_balance = net_balance - case when OLD.type = 'in'  then OLD.amount else -OLD.amount end
      where id = OLD.category_id;
    end if;
    if NEW.category_id is not null then
      update public.categories set
        total_in    = total_in    + case when NEW.type = 'in'  then NEW.amount else 0 end,
        total_out   = total_out   + case when NEW.type = 'out' then NEW.amount else 0 end,
        net_balance = net_balance + case when NEW.type = 'in'  then NEW.amount else -NEW.amount end
      where id = NEW.category_id;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_update_category_balance on public.entries;
create trigger trg_update_category_balance
  after insert or update or delete on public.entries
  for each row execute function public.update_category_balance();


-- ── Clear category text snapshot on delete ────────────────────────────────────

create or replace function public.clear_category_on_delete()
returns trigger language plpgsql security definer as $$
begin
  update public.entries set category = null where category_id = OLD.id;
  return OLD;
end;
$$;

drop trigger if exists categories_clear_category on public.categories;
create trigger categories_clear_category
  before delete on public.categories
  for each row execute function public.clear_category_on_delete();
