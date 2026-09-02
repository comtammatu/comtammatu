-- Migration: 20260822120500_ops_realtime_and_query_indexes.sql
-- Purpose: Optimize query performance for active operations (POS active orders, KDS live stations, Warehouse in-flight transfers, Stock movements).

-- 1. Accelerate active stock movement history lookups per branch/ingredient
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch_created_ing
ON public.stock_movements (tenant_id, branch_id, created_at DESC, ingredient_id);

-- 2. Partial index for in-flight stock transfers (Draft, Shipped, In Transit, Receiving)
CREATE INDEX IF NOT EXISTS idx_stock_transfers_in_flight
ON public.stock_transfers (tenant_id, from_branch_id, to_branch_id, status)
WHERE status IN ('draft', 'confirmed_ship', 'in_transit', 'confirmed_receive');

-- 3. Partial index for active/draft Goods Received Notes
CREATE INDEX IF NOT EXISTS idx_grn_draft_location
ON public.goods_received_notes (tenant_id, location_id, created_at DESC)
WHERE status = 'draft';

-- 4. Partial index for active KDS tickets per station
CREATE INDEX IF NOT EXISTS idx_kds_tickets_active_lookup
ON public.kds_tickets (tenant_id, branch_id, station_id, status, created_at DESC)
WHERE status IN ('pending', 'preparing', 'ready');
