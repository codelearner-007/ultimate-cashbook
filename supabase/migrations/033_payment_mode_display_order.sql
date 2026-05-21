-- Migration 033: Add display_order to payment_modes
-- Allows users to drag-reorder payment modes; order is preserved across add/edit entry chips.

alter table public.payment_modes
  add column if not exists display_order integer not null default 0;

-- Backfill existing rows: assign 0, 1, 2, … per book ordered by created_at
update public.payment_modes pm
set display_order = sub.rn
from (
  select id, row_number() over (partition by book_id order by created_at) - 1 as rn
  from public.payment_modes
) sub
where pm.id = sub.id;

-- Update seed trigger to set display_order (Cash=0, Cheque=1)
create or replace function public.seed_default_payment_modes()
returns trigger language plpgsql security definer as $$
begin
  insert into public.payment_modes (book_id, user_id, name, display_order) values
    (NEW.id, NEW.user_id, 'Cash',   0),
    (NEW.id, NEW.user_id, 'Cheque', 1);
  return NEW;
end;
$$;
