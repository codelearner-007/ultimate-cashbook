-- ============================================================
-- Migration 005: Payment Modes
-- ============================================================
-- Per-book payment modes with auto-maintained balances.
-- Cash + Cheque seeded on every new book creation.
-- Adds payment_mode_id FK to entries (ON DELETE SET NULL).
-- ============================================================


-- ── Table ────────────────────────────────────────────────────────────────────

create table if not exists public.payment_modes (
  id            uuid           primary key default gen_random_uuid(),
  book_id       uuid           not null references public.books(id) on delete cascade,
  user_id       uuid           not null references auth.users(id) on delete cascade,
  name          text           not null,
  total_in      numeric(14,2)  not null default 0,
  total_out     numeric(14,2)  not null default 0,
  net_balance   numeric(14,2)  not null default 0,
  display_order integer        not null default 0,
  created_at    timestamptz    not null default now(),
  constraint payment_modes_book_name_unique unique (book_id, name)
);

alter table public.payment_modes enable row level security;

create policy "Users manage own payment modes"
  on public.payment_modes for all
  using (auth.uid() = user_id);

create index if not exists payment_modes_book_idx on public.payment_modes(book_id);
create index if not exists payment_modes_user_idx on public.payment_modes(user_id);


-- ── FK on entries ─────────────────────────────────────────────────────────────

alter table public.entries
  add column if not exists payment_mode_id uuid references public.payment_modes(id) on delete set null;

create index if not exists entries_payment_mode_id_idx on public.entries(payment_mode_id);


-- ── Seed trigger — Cash + Cheque on new book ─────────────────────────────────

create or replace function public.seed_default_payment_modes()
returns trigger language plpgsql security definer as $$
begin
  insert into public.payment_modes (book_id, user_id, name, display_order) values
    (NEW.id, NEW.user_id, 'Cash',   0),
    (NEW.id, NEW.user_id, 'Cheque', 1);
  return NEW;
end;
$$;

drop trigger if exists trg_seed_payment_modes on public.books;
create trigger trg_seed_payment_modes
  after insert on public.books
  for each row execute function public.seed_default_payment_modes();

-- Seed existing books that don't yet have payment modes
insert into public.payment_modes (book_id, user_id, name, display_order)
select b.id, b.user_id, m.name, m.ord
from public.books b
cross join (values ('Cash', 0), ('Cheque', 1)) as m(name, ord)
on conflict do nothing;


-- ── Payment mode balance trigger ──────────────────────────────────────────────

create or replace function public.update_payment_mode_balance()
returns trigger language plpgsql security definer as $$
begin
  if (TG_OP = 'INSERT') then
    if NEW.payment_mode_id is not null then
      update public.payment_modes set
        total_in    = total_in    + case when NEW.type = 'in'  then NEW.amount else 0 end,
        total_out   = total_out   + case when NEW.type = 'out' then NEW.amount else 0 end,
        net_balance = net_balance + case when NEW.type = 'in'  then NEW.amount else -NEW.amount end
      where id = NEW.payment_mode_id;
    end if;

  elsif (TG_OP = 'DELETE') then
    if OLD.payment_mode_id is not null then
      update public.payment_modes set
        total_in    = total_in    - case when OLD.type = 'in'  then OLD.amount else 0 end,
        total_out   = total_out   - case when OLD.type = 'out' then OLD.amount else 0 end,
        net_balance = net_balance - case when OLD.type = 'in'  then OLD.amount else -OLD.amount end
      where id = OLD.payment_mode_id;
    end if;

  elsif (TG_OP = 'UPDATE') then
    if OLD.payment_mode_id is not null then
      update public.payment_modes set
        total_in    = total_in    - case when OLD.type = 'in'  then OLD.amount else 0 end,
        total_out   = total_out   - case when OLD.type = 'out' then OLD.amount else 0 end,
        net_balance = net_balance - case when OLD.type = 'in'  then OLD.amount else -OLD.amount end
      where id = OLD.payment_mode_id;
    end if;
    if NEW.payment_mode_id is not null then
      update public.payment_modes set
        total_in    = total_in    + case when NEW.type = 'in'  then NEW.amount else 0 end,
        total_out   = total_out   + case when NEW.type = 'out' then NEW.amount else 0 end,
        net_balance = net_balance + case when NEW.type = 'in'  then NEW.amount else -NEW.amount end
      where id = NEW.payment_mode_id;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_update_payment_mode_balance on public.entries;
create trigger trg_update_payment_mode_balance
  after insert or update or delete on public.entries
  for each row execute function public.update_payment_mode_balance();
