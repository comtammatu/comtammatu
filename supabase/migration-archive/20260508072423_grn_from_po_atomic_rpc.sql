-- =========================================================================
-- create_grn_from_po: replace the 2-statement compound at
-- apps/web/app/inventory/grn-actions.ts:610-752 with a single atomic RPC.
--
-- Old path: header INSERT → items bulk INSERT → best-effort header DELETE
-- on items failure. RLS reject on items insert can silently leave an
-- empty header (orphan GRN) if the rollback DELETE itself is RLS-blocked.
--
-- New path: single PL/pgSQL transaction. Validates → locks PO → inserts
-- header → inserts items via INSERT … SELECT from CTE. Any RAISE rolls
-- back atomically. SELECT … FOR UPDATE on the PO row serializes
-- concurrent "Tạo GRN từ PO" clicks against the same PO.
--
-- Per CLAUDE.md "multi-item atomic writes → Postgres RPC" (Sprint 5 #2).
-- =========================================================================

CREATE OR REPLACE FUNCTION public.create_grn_from_po(
  p_po_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id    UUID   := auth.uid();
  v_tenant_id  BIGINT := public.auth_tenant_id();
  v_po         RECORD;
  v_branch     RECORD;
  v_supplier   RECORD;
  v_grn_id     BIGINT;
  v_grn_number TEXT;
  v_count      INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_po: anonymous caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_po: missing tenant_id claim'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_po_id IS NULL OR p_po_id <= 0 THEN
    RAISE EXCEPTION 'create_grn_from_po: invalid PO id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Lock the PO row to serialize concurrent "Create GRN" clicks; any
  -- second caller blocks here until the first transaction commits.
  SELECT id, supplier_id, status, branch_id
    INTO v_po
    FROM public.purchase_orders
   WHERE id = p_po_id
     AND tenant_id = v_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_grn_from_po: PO not found in tenant scope'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_po.status NOT IN ('sent', 'partially_received') THEN
    RAISE EXCEPTION 'create_grn_from_po: PO status not eligible'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.branch_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_po: PO has no destination branch'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Branch must be a procurement site (branch / branch).
  SELECT id, branch_kind, is_active
    INTO v_branch
    FROM public.branches
   WHERE id = v_po.branch_id
     AND tenant_id = v_tenant_id;

  IF NOT FOUND OR NOT v_branch.is_active THEN
    RAISE EXCEPTION 'create_grn_from_po: branch inactive or out of scope'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_branch.branch_kind NOT IN ('branch', 'branch') THEN
    RAISE EXCEPTION 'create_grn_from_po: branch is not a procurement site'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Supplier must still be active.
  SELECT id, is_active
    INTO v_supplier
    FROM public.suppliers
   WHERE id = v_po.supplier_id
     AND tenant_id = v_tenant_id;

  IF NOT FOUND OR NOT v_supplier.is_active THEN
    RAISE EXCEPTION 'create_grn_from_po: supplier inactive or out of scope'
      USING ERRCODE = 'check_violation';
  END IF;

  -- CTE materializing remaining qty per ingredient (ordered − already
  -- received from prior confirmed GRNs against this PO).
  CREATE TEMP TABLE _grn_remaining ON COMMIT DROP AS
    WITH received AS (
      SELECT gi.ingredient_id,
             SUM(COALESCE(gi.received_quantity, 0))::NUMERIC(15,3) AS qty_done
        FROM public.grn_items gi
        JOIN public.goods_received_notes g
          ON g.id = gi.grn_id
         AND g.tenant_id = gi.tenant_id
       WHERE g.po_id = v_po.id
         AND g.tenant_id = v_tenant_id
         AND g.status = 'confirmed'
       GROUP BY gi.ingredient_id
    )
    SELECT poi.ingredient_id,
           poi.unit,
           poi.quantity::NUMERIC(15,3)         AS po_quantity,
           COALESCE(poi.unit_price_est, 0)::NUMERIC(15,2) AS po_unit_price,
           ROUND(
             poi.quantity - COALESCE(received.qty_done, 0),
             3
           )::NUMERIC(15,3) AS remaining
      FROM public.purchase_order_items poi
      LEFT JOIN received USING (ingredient_id)
     WHERE poi.po_id = v_po.id
       AND poi.tenant_id = v_tenant_id;

  IF NOT EXISTS (SELECT 1 FROM _grn_remaining WHERE remaining > 0) THEN
    RAISE EXCEPTION 'create_grn_from_po: PO already fully received'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_grn_number := 'GRN-' || substring(replace(gen_random_uuid()::TEXT, '-', '') from 1 for 8);

  INSERT INTO public.goods_received_notes (
    tenant_id, branch_id, supplier_id, po_id,
    grn_number, status, created_by
  ) VALUES (
    v_tenant_id, v_branch.id, v_supplier.id, v_po.id,
    v_grn_number, 'draft', v_user_id
  ) RETURNING id INTO v_grn_id;

  IF v_grn_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_po: header insert blocked (RLS)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.grn_items (
    tenant_id, grn_id, ingredient_id,
    po_quantity, po_unit_price,
    received_quantity, unit, unit_cost, total_cost,
    quality_status
  )
  SELECT v_tenant_id,
         v_grn_id,
         r.ingredient_id,
         r.po_quantity,
         r.po_unit_price,
         r.remaining,
         r.unit,
         r.po_unit_price,
         ROUND(r.remaining * r.po_unit_price, 2),
         'accepted'
    FROM _grn_remaining r
   WHERE r.remaining > 0;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    -- Defense-in-depth: items insert returned zero rows under RLS.
    -- The CTE proved >0 remaining lines exist; if zero rows persisted,
    -- RLS rejected silently. Raise to roll back the header.
    RAISE EXCEPTION 'create_grn_from_po: items insert blocked (RLS)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.log_audit(
    'inventory.grn.created_from_po',
    'goods_received_note',
    v_grn_id,
    NULL,
    jsonb_build_object(
      'po_id',     v_po.id,
      'lines',     v_count,
      'branch_id', v_branch.id
    )
  );

  RETURN jsonb_build_object(
    'grn_id',     v_grn_id,
    'grn_number', v_grn_number,
    'lines',      v_count
  );
END;
$$;

COMMENT ON FUNCTION public.create_grn_from_po(BIGINT) IS
  'Atomic PO→GRN copy. Validates PO + branch + supplier eligibility, locks the PO row FOR UPDATE to serialize concurrent callers, copies remaining lines (ordered − received) into a new draft GRN, and writes one audit_logs row. Replaces the 2-statement compound at apps/web/app/inventory/grn-actions.ts:createGrnFromPo. Sprint 5 #2.';

GRANT EXECUTE ON FUNCTION public.create_grn_from_po(BIGINT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_grn_from_po(BIGINT) FROM anon, public;
