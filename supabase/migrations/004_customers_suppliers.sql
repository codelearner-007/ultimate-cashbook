-- ============================================================
-- Migration 004: Customers & Suppliers
-- ============================================================
-- Per-book contact tables with auto-maintained balances.
-- Adds customer_id / supplier_id FKs to entries (ON DELETE SET NULL).
-- Trigger clears contact_name text snapshot on contact delete.
-- ============================================================


-- ── customers ─────────────────────────────────────────────────────────────────

create table if not exists public.customers (
  id            uuid           primary key default gen_random_uuid(),
  book_id       uuid           not null references public.books(id) on delete cascade,
  user_id       uuid           not null references auth.users(id) on delete cascade,
  name          text           not null,
  phone         text,
  email         text,
  address       text,
  total_in      numeric(14,2)  not null default 0,
  total_out     numeric(14,2)  not null default 0,
  net_balance   numeric(14,2)  not null default 0,
  display_order integer        not null default 0,
  created_at    timestamptz    not null default now(),
  updated_at    timestamptz    not null default now(),
  constraint customers_book_name_unique unique (book_id, name)
);

alter table public.customers enable row level security;

create policy "Users manage own customers"
  on public.customers for all
  using (auth.uid() = user_id);

create index if not exists customers_book_idx               on public.customers(book_id);
create index if not exists customers_user_idx               on public.customers(user_id);
create index if not exists idx_customers_book_display_order on public.customers(book_id, display_order);

drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();


-- ── suppliers ─────────────────────────────────────────────────────────────────

create table if not exists public.suppliers (
  id            uuid           primary key default gen_random_uuid(),
  book_id       uuid           not null references public.books(id) on delete cascade,
  user_id       uuid           not null references auth.users(id) on delete cascade,
  name          text           not null,
  phone         text,
  email         text,
  address       text,
  total_in      numeric(14,2)  not null default 0,
  total_out     numeric(14,2)  not null default 0,
  net_balance   numeric(14,2)  not null default 0,
  display_order integer        not null default 0,
  created_at    timestamptz    not null default now(),
  updated_at    timestamptz    not null default now(),
  constraint suppliers_book_name_unique unique (book_id, name)
);

alter table public.suppliers enable row level security;

create policy "Users manage own suppliers"
  on public.suppliers for all
  using (auth.uid() = user_id);

create index if not exists suppliers_book_idx               on public.suppliers(book_id);
create index if not exists suppliers_user_idx               on public.suppliers(user_id);
create index if not exists idx_suppliers_book_display_order on public.suppliers(book_id, display_order);

drop trigger if exists suppliers_updated_at on public.suppliers;
create trigger suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();


-- ── FKs on entries ────────────────────────────────────────────────────────────

alter table public.entries
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

alter table public.entries
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

create index if not exists entries_customer_id_idx on public.entries(customer_id);
create index if not exists entries_supplier_id_idx on public.entries(supplier_id);


-- ── Contact balance trigger ───────────────────────────────────────────────────

create or replace function public.update_contact_balance()
returns trigger language plpgsql security definer as $$
begin
  if (TG_OP = 'INSERT') then
    if NEW.customer_id is not null then
      update public.customers set
        total_in    = total_in    + case when NEW.type = 'in'  then NEW.amount else 0 end,
        total_out   = total_out   + case when NEW.type = 'out' then NEW.amount else 0 end,
        net_balance = net_balance + case when NEW.type = 'in'  then NEW.amount else -NEW.amount end
      where id = NEW.customer_id;
    end if;
    if NEW.supplier_id is not null then
      update public.suppliers set
        total_in    = total_in    + case when NEW.type = 'in'  then NEW.amount else 0 end,
        total_out   = total_out   + case when NEW.type = 'out' then NEW.amount else 0 end,
        net_balance = net_balance + case when NEW.type = 'in'  then NEW.amount else -NEW.amount end
      where id = NEW.supplier_id;
    end if;

  elsif (TG_OP = 'DELETE') then
    if OLD.customer_id is not null then
      update public.customers set
        total_in    = total_in    - case when OLD.type = 'in'  then OLD.amount else 0 end,
        total_out   = total_out   - case when OLD.type = 'out' then OLD.amount else 0 end,
        net_balance = net_balance - case when OLD.type = 'in'  then OLD.amount else -OLD.amount end
      where id = OLD.customer_id;
    end if;
    if OLD.supplier_id is not null then
      update public.suppliers set
        total_in    = total_in    - case when OLD.type = 'in'  then OLD.amount else 0 end,
        total_out   = total_out   - case when OLD.type = 'out' then OLD.amount else 0 end,
        net_balance = net_balance - case when OLD.type = 'in'  then OLD.amount else -OLD.amount end
      where id = OLD.supplier_id;
    end if;

  elsif (TG_OP = 'UPDATE') then
    -- reverse old
    if OLD.customer_id is not null then
      update public.customers set
        total_in    = total_in    - case when OLD.type = 'in'  then OLD.amount else 0 end,
        total_out   = total_out   - case when OLD.type = 'out' then OLD.amount else 0 end,
        net_balance = net_balance - case when OLD.type = 'in'  then OLD.amount else -OLD.amount end
      where id = OLD.customer_id;
    end if;
    if OLD.supplier_id is not null then
      update public.suppliers set
        total_in    = total_in    - case when OLD.type = 'in'  then OLD.amount else 0 end,
        total_out   = total_out   - case when OLD.type = 'out' then OLD.amount else 0 end,
        net_balance = net_balance - case when OLD.type = 'in'  then OLD.amount else -OLD.amount end
      where id = OLD.supplier_id;
    end if;
    -- apply new
    if NEW.customer_id is not null then
      update public.customers set
        total_in    = total_in    + case when NEW.type = 'in'  then NEW.amount else 0 end,
        total_out   = total_out   + case when NEW.type = 'out' then NEW.amount else 0 end,
        net_balance = net_balance + case when NEW.type = 'in'  then NEW.amount else -NEW.amount end
      where id = NEW.customer_id;
    end if;
    if NEW.supplier_id is not null then
      update public.suppliers set
        total_in    = total_in    + case when NEW.type = 'in'  then NEW.amount else 0 end,
        total_out   = total_out   + case when NEW.type = 'out' then NEW.amount else 0 end,
        net_balance = net_balance + case when NEW.type = 'in'  then NEW.amount else -NEW.amount end
      where id = NEW.supplier_id;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_update_contact_balance on public.entries;
create trigger trg_update_contact_balance
  after insert or update or delete on public.entries
  for each row execute function public.update_contact_balance();


-- ── Clear contact_name snapshot on delete ─────────────────────────────────────

create or replace function public.clear_customer_contact_name()
returns trigger language plpgsql security definer as $$
begin
  update public.entries set contact_name = null where customer_id = OLD.id;
  return OLD;
end;
$$;

drop trigger if exists customers_clear_contact_name on public.customers;
create trigger customers_clear_contact_name
  before delete on public.customers
  for each row execute function public.clear_customer_contact_name();

create or replace function public.clear_supplier_contact_name()
returns trigger language plpgsql security definer as $$
begin
  update public.entries set contact_name = null where supplier_id = OLD.id;
  return OLD;
end;
$$;

drop trigger if exists suppliers_clear_contact_name on public.suppliers;
create trigger suppliers_clear_contact_name
  before delete on public.suppliers
  for each row execute function public.clear_supplier_contact_name();
