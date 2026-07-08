-- Stock ledger reconciliation + sign-vs-type CHECK.
--
-- (1) public.stock_ledger_reconciliation: returns one row per
--     (ingredient, location) where the running ledger sum diverges from
--     stock_levels.current_quantity beyond 0.001. Operators call it to detect
--     drift between the append-only stock_movements ledger and the mutable
--     stock_levels saldo. SECURITY DEFINER + auth_tenant_id() scope keeps it
--     RLS-safe across tenants.
--
-- (2) A CHECK on stock_movements.quantity_change tying the sign to the movement
--     type. Positive-only: grn_receipt, transfer_in, production_output,
--     refund_restore. Negative-only: consumption, transfer_out,
--     supplier_return, production_consumption. Any sign: adjustment,
--     count_adjustment, grn_amend (grn_amend is a correction delta and may be
--     positive or negative). A precheck runs first and raises if any existing
--     row violates the rule, so the migration fails clean rather than aborting
--     mid-statement.

SET search_path = '';
SET check_function_bodies = off;

-- ============================================================
-- 1) Reconciliation function
-- ============================================================
CREATE OR REPLACE FUNCTION public.stock_ledger_reconciliation(
  p_branch_id bigint,
  p_location_id bigint DEFAULT NULL::bigint
)
RETURNS TABLE (
  ingredient_id bigint,
  ingredient_name text,
  location_id bigint,
  ledger_sum numeric,
  stock_levels_qty numeric,
  drift numeric,
  drift_pct numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_not_found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'inventory:read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH ledger AS (
    SELECT sm.ingredient_id,
           sm.location_id,
           COALESCE(SUM(sm.quantity_change), 0)::numeric AS ledger_sum
    FROM public.stock_movements sm
    WHERE sm.tenant_id = v_tenant
      AND sm.branch_id = p_branch_id
      AND (p_location_id IS NULL OR sm.location_id = p_location_id)
    GROUP BY sm.ingredient_id, sm.location_id
  ),
  levels AS (
    SELECT sl.ingredient_id,
           sl.location_id,
           sl.current_quantity::numeric AS stock_levels_qty
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = p_branch_id
      AND (p_location_id IS NULL OR sl.location_id = p_location_id)
  ),
  pairs AS (
    SELECT
      COALESCE(l.ingredient_id, lv.ingredient_id) AS ingredient_id,
      COALESCE(l.location_id, lv.location_id) AS location_id,
      COALESCE(l.ledger_sum, 0)::numeric AS ledger_sum,
      COALESCE(lv.stock_levels_qty, 0)::numeric AS stock_levels_qty
    FROM ledger l
    FULL OUTER JOIN levels lv USING (ingredient_id, location_id)
  )
  SELECT
    p.ingredient_id,
    i.name AS ingredient_name,
    p.location_id,
    p.ledger_sum,
    p.stock_levels_qty,
    (p.stock_levels_qty - p.ledger_sum)::numeric AS drift,
    CASE
      WHEN abs(p.ledger_sum) > 0.001
        THEN round(((p.stock_levels_qty - p.ledger_sum) / abs(p.ledger_sum)) * 100, 3)
      ELSE NULL
    END AS drift_pct
  FROM pairs p
  JOIN public.ingredients i
    ON i.id = p.ingredient_id
   AND i.tenant_id = v_tenant
  WHERE abs(p.stock_levels_qty - p.ledger_sum) > 0.001
  ORDER BY i.name, p.location_id;
END;
$$;

REVOKE ALL ON FUNCTION public.stock_ledger_reconciliation(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_ledger_reconciliation(bigint, bigint) TO authenticated, service_role;

COMMENT ON FUNCTION public.stock_ledger_reconciliation(bigint, bigint) IS
  'Returns ingredient/location rows where the stock_movements ledger sum diverges from stock_levels.current_quantity beyond 0.001. Call with (branch_id) or (branch_id, location_id).';

-- ============================================================
-- 2) Sign-vs-type CHECK on stock_movements.quantity_change
-- ============================================================

-- 2a. Precheck: surface dirty data before the constraint is added. Zero is
--     permitted in the positive/negative buckets (no-op movements are allowed),
--     so the precheck only flags a strictly wrong sign.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements
    WHERE NOT (
      (type IN ('grn_receipt', 'transfer_in', 'production_output', 'refund_restore') AND quantity_change >= 0)
      OR (type IN ('consumption', 'transfer_out', 'supplier_return', 'production_consumption') AND quantity_change <= 0)
      OR (type IN ('adjustment', 'count_adjustment', 'grn_amend'))
    )
  ) THEN
    RAISE EXCEPTION 'stock_movements_quantity_sign_precheck_failed' USING ERRCODE = '23514';
  END IF;
END $$;

-- 2b. Add the CHECK NOT VALID, then VALIDATE. NOT VALID skips the full-table
--     rewrite; VALIDATE checks existing rows without holding ACCESS EXCLUSIVE.
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_quantity_sign_by_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_quantity_sign_by_type_check
  CHECK (
    (type IN ('grn_receipt', 'transfer_in', 'production_output', 'refund_restore') AND quantity_change >= 0)
    OR (type IN ('consumption', 'transfer_out', 'supplier_return', 'production_consumption') AND quantity_change <= 0)
    OR (type IN ('adjustment', 'count_adjustment', 'grn_amend'))
  ) NOT VALID;

ALTER TABLE public.stock_movements
  VALIDATE CONSTRAINT stock_movements_quantity_sign_by_type_check;
