-- Migration 036: Add display_order to customers and suppliers
-- Allows per-book custom drag sort order for each contact type

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- Backfill customers: sequential order per book based on created_at
WITH ranked AS (
  SELECT id,
         (ROW_NUMBER() OVER (PARTITION BY book_id ORDER BY created_at) - 1)::integer AS rn
  FROM   customers
)
UPDATE customers
SET    display_order = ranked.rn
FROM   ranked
WHERE  customers.id = ranked.id;

-- Backfill suppliers: sequential order per book based on created_at
WITH ranked AS (
  SELECT id,
         (ROW_NUMBER() OVER (PARTITION BY book_id ORDER BY created_at) - 1)::integer AS rn
  FROM   suppliers
)
UPDATE suppliers
SET    display_order = ranked.rn
FROM   ranked
WHERE  suppliers.id = ranked.id;

-- Indexes for fast ORDER BY display_order within a book
CREATE INDEX IF NOT EXISTS idx_customers_book_display_order
  ON customers (book_id, display_order);

CREATE INDEX IF NOT EXISTS idx_suppliers_book_display_order
  ON suppliers (book_id, display_order);
