-- Seed Cash + Cheque for all existing books that don't have them yet.
-- Run this once if you skipped the seed trigger for older books.

insert into public.payment_modes (book_id, user_id, name, display_order)
select b.id, b.user_id, m.name, m.ord
from public.books b
cross join (values ('Cash', 0), ('Cheque', 1)) as m(name, ord)
on conflict do nothing;
