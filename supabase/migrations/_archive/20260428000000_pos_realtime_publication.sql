-- =============================================================
-- POS realtime sync — add orders + tables to supabase_realtime
--
-- Enables cross-terminal POS sync without a custom WebSocket server.
-- RLS SELECT policies on these tables already tenant-scope broadcasts;
-- the POS client filter `branch_id=eq.{branchId}` (from URL) narrows
-- per-branch. Tenant-wide roles (owner, super_manager, area_manager)
-- use the same URL-derived filter — no cross-branch flood.
--
-- kds_tickets was added in 20260407110000_kds_tickets.sql.
--
-- order_items intentionally NOT added:
--   - POS list view reads only orders + tables (no per-item row rendered)
--   - order_items.status changes originate from kds_tickets bumps via
--     trigger trg_sync_order_item_status — POS detail views that need
--     live item status subscribe to kds_tickets directly (already published)
--   - Avoids schema denormalization (minimum-code principle)
--
-- Idempotent: dev DB may already have these published out-of-band.
-- =============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tables'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;
  END IF;
END $$;
