-- Phase 2A: add compatibility columns for location-ledger rollout.
-- This migration intentionally does NOT backfill data, tighten NOT NULL,
-- or change RPC / trigger behavior yet. It only prepares the schema so the
-- app can begin dual-write once Phase 1 has been applied by the owner.

-- ─── 1. stock_levels ───

ALTER TABLE public.stock_levels
  ADD COLUMN IF NOT EXISTS location_id BIGINT
  REFERENCES public.inventory_locations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_stock_levels_location
  ON public.stock_levels(location_id)
  WHERE location_id IS NOT NULL;

COMMENT ON COLUMN public.stock_levels.location_id IS
  'Compatibility column for location-level ledger. NULL until Phase 2 backfill/cutover.';

-- ─── 2. stock_movements ───

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS location_id BIGINT
  REFERENCES public.inventory_locations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_stock_movements_location
  ON public.stock_movements(location_id)
  WHERE location_id IS NOT NULL;

COMMENT ON COLUMN public.stock_movements.location_id IS
  'Compatibility column for location-level stock movements. NULL until Phase 2 backfill/cutover.';

-- ─── 3. stock_transfers ───

ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS from_location_id BIGINT
  REFERENCES public.inventory_locations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS to_location_id BIGINT
  REFERENCES public.inventory_locations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_location
  ON public.stock_transfers(from_location_id)
  WHERE from_location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_location
  ON public.stock_transfers(to_location_id)
  WHERE to_location_id IS NOT NULL;

COMMENT ON COLUMN public.stock_transfers.from_location_id IS
  'Compatibility column for transfer source location. NULL until Phase 2 backfill/cutover.';

COMMENT ON COLUMN public.stock_transfers.to_location_id IS
  'Compatibility column for transfer destination location. NULL until Phase 2 backfill/cutover.';

-- ─── 4. stock_issues ───

ALTER TABLE public.stock_issues
  ADD COLUMN IF NOT EXISTS source_location_id BIGINT
  REFERENCES public.inventory_locations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS target_location_id BIGINT
  REFERENCES public.inventory_locations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_stock_issues_source_location
  ON public.stock_issues(source_location_id)
  WHERE source_location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_issues_target_location
  ON public.stock_issues(target_location_id)
  WHERE target_location_id IS NOT NULL;

COMMENT ON COLUMN public.stock_issues.source_location_id IS
  'Compatibility column for issue source location. NULL until Phase 2 backfill/cutover.';

COMMENT ON COLUMN public.stock_issues.target_location_id IS
  'Compatibility column for issue target location (for kitchen_use/internal handoff). NULL until Phase 2 backfill/cutover.';

-- ─── 5. stocktake_sessions ───

ALTER TABLE public.stocktake_sessions
  ADD COLUMN IF NOT EXISTS location_id BIGINT
  REFERENCES public.inventory_locations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_stocktake_sessions_location
  ON public.stocktake_sessions(location_id)
  WHERE location_id IS NOT NULL;

COMMENT ON COLUMN public.stocktake_sessions.location_id IS
  'Compatibility column for stocktake location scope. NULL until Phase 2 backfill/cutover.';
