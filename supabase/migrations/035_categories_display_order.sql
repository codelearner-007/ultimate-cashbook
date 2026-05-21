-- Migration 035: Add display_order to categories
-- Allows per-book custom drag sort order for categories

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- Backfill: assign sequential order per book based on created_at
WITH ranked AS (
  SELECT id,
         (ROW_NUMBER() OVER (PARTITION BY book_id ORDER BY created_at) - 1)::integer AS rn
  FROM   categories
)
UPDATE categories
SET    display_order = ranked.rn
FROM   ranked
WHERE  categories.id = ranked.id;

-- Index for fast ORDER BY display_order within a book
CREATE INDEX IF NOT EXISTS idx_categories_book_display_order
  ON categories (book_id, display_order);
