-- Atomic PO header + lines in one transaction. No EXCEPTION block: an uncaught
-- RAISE must roll back header + lines together (the orphan/partial PO this RPC
-- replaces). SECURITY DEFINER bypasses RLS, so the tenant derivation and the
-- has_permission_any gate ARE the security boundary (mirrors create_order).
CREATE OR REPLACE FUNCTION public.create_purchase_order_with_lines(
  p_supplier_id bigint,
  p_branch_id   bigint,
  p_notes       text,
  p_lines       jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_uid       uuid    := auth.uid();
  v_tenant_id bigint  := public.auth_tenant_id();
  v_branch    RECORD;
  v_po_id     bigint;
  v_display   text;
  v_count     integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission_any('procurement:po_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'invalid_po_lines' USING ERRCODE = '22023';
  END IF;

  -- Branch must be an active procurement site in this tenant
  -- (mirrors fetchProcurementBranches).
  SELECT id, branch_kind, is_active INTO v_branch
    FROM public.branches
   WHERE id = p_branch_id AND tenant_id = v_tenant_id;
  IF NOT FOUND OR NOT v_branch.is_active
     OR v_branch.branch_kind NOT IN ('branch', 'central_supply', 'central_kitchen') THEN
    RAISE EXCEPTION 'invalid_branch' USING ERRCODE = 'P0002';
  END IF;

  -- Supplier must belong to this tenant (the FK is tenant-agnostic and DEFINER
  -- bypasses RLS, so a cross-tenant supplier_id would otherwise be accepted).
  IF NOT EXISTS (
    SELECT 1 FROM public.suppliers
     WHERE id = p_supplier_id AND tenant_id = v_tenant_id AND is_active
  ) THEN
    RAISE EXCEPTION 'invalid_supplier' USING ERRCODE = 'P0002';
  END IF;

  v_display := public.next_po_display_id(v_tenant_id);

  INSERT INTO public.purchase_orders (
    tenant_id, branch_id, supplier_id, po_number, display_id, status, notes, created_by
  ) VALUES (
    v_tenant_id, p_branch_id, p_supplier_id, v_display, v_display, 'draft',
    NULLIF(btrim(p_notes), ''), v_uid
  ) RETURNING id INTO v_po_id;

  INSERT INTO public.purchase_order_items (
    tenant_id, po_id, ingredient_id, quantity, unit, unit_price_est, line_total
  )
  SELECT
    v_tenant_id, v_po_id, x.ingredient_id, x.quantity, x.unit, x.unit_price_est,
    CASE WHEN x.unit_price_est IS NULL THEN NULL
         ELSE round(x.quantity * x.unit_price_est, 2) END
  FROM jsonb_to_recordset(p_lines) AS x(
    ingredient_id  bigint,
    quantity       numeric,
    unit           text,
    unit_price_est numeric
  )
  ON CONFLICT (po_id, ingredient_id, tenant_id) DO UPDATE SET
    quantity       = EXCLUDED.quantity,
    unit           = EXCLUDED.unit,
    unit_price_est = EXCLUDED.unit_price_est,
    line_total     = EXCLUDED.line_total;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'invalid_po_lines' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object('id', v_po_id, 'display_id', v_display, 'lines', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_order_with_lines(bigint, bigint, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_with_lines(bigint, bigint, text, jsonb) TO authenticated;
