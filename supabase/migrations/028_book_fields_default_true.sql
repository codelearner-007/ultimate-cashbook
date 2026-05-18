-- Change show_* column defaults to true so new books have all fields enabled.
-- Also backfill existing books so all four fields are on.

alter table books
  alter column show_customer   set default true,
  alter column show_supplier   set default true,
  alter column show_category   set default true,
  alter column show_attachment set default true;

update books
set
  show_customer   = true,
  show_supplier   = true,
  show_category   = true,
  show_attachment = true
where
  show_customer   = false
  or show_supplier   = false
  or show_category   = false
  or show_attachment = false;
