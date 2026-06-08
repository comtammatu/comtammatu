-- =============================================================
-- Add covering index on `order_items.variant_id` foreign key.
-- Driver: Supabase advisor `unindexed_foreign_keys` lint —
-- `order_items_variant_id_fkey` had no index, forcing seq scan
-- on FK constraint checks (e.g. when deactivating a variant).
--
-- Plain CREATE INDEX (not CONCURRENTLY) — Supabase migration
-- runs inside a transaction wrapper which is incompatible with
-- CONCURRENTLY. AccessExclusive lock on `order_items` is brief
-- and irrelevant pre-pilot. When prod traffic exists, swap to
-- CONCURRENTLY in a manual `psql` apply.
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_order_items_variant_id
  ON public.order_items (variant_id);
