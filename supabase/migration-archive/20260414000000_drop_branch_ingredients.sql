-- =============================================================
-- Remove branch_ingredients allowlist.
-- Design decision: ingredients are a tenant-level catalog managed
-- by super_manager only. Per-branch allowlisting was incorrect
-- semantics and has been removed from the application.
-- =============================================================

-- 1. Drop trigger that enforced the allowlist on stock_movements
DROP TRIGGER IF EXISTS trg_stock_movements_branch_ingredient_allowlist
  ON public.stock_movements;

-- 2. Drop the trigger function
DROP FUNCTION IF EXISTS public.enforce_stock_movement_branch_ingredient();

-- 3. Drop the allowlist table (CASCADE drops policies, indexes, grants)
DROP TABLE IF EXISTS public.branch_ingredients CASCADE;
