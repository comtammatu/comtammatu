-- ADR 0042: kept GRN quantity amends the PO line; warehouse may close remainder.

CREATE OR REPLACE FUNCTION public.close_purchase_order(
  p_po_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_po public.purchase_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF pg_catalog.length(
    pg_catalog.btrim(coalesce(p_reason, ''))
  ) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT po.*
  INTO v_po
  FROM public.purchase_orders AS po
  WHERE po.id = p_po_id
    AND po.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    public.has_permission(v_po.branch_id, 'procurement:po_approve')
    OR public.has_permission(v_po.branch_id, 'procurement:grn_confirm')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_po.status <> 'partially_received' THEN
    RAISE EXCEPTION 'purchase_order_not_closable'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.goods_received_notes
  SET status = 'cancelled',
      notes = pg_catalog.concat_ws(
        E'\n',
        nullif(notes, ''),
        'Đóng phần còn lại của PO: ' || pg_catalog.btrim(p_reason)
      ),
      updated_at = pg_catalog.now()
  WHERE tenant_id = v_tenant
    AND po_id = p_po_id
    AND status = 'draft';

  UPDATE public.purchase_orders
  SET status = 'closed',
      status_reason = pg_catalog.btrim(p_reason),
      closed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = p_po_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'procurement.po.closed',
    'purchase_order',
    p_po_id,
    pg_catalog.to_jsonb(v_po),
    pg_catalog.jsonb_build_object(
      'status', 'closed',
      'reason', pg_catalog.btrim(p_reason)
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', p_po_id,
    'status', 'closed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_purchase_order(bigint, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_purchase_order(bigint, text)
TO authenticated, service_role;

COMMENT ON FUNCTION public.close_purchase_order(bigint, text) IS
  'Closes a partially received PO: cancel leftover Auto-GRN drafts, status closed. Warehouse grn_confirm or po_approve.';

DO $patch_confirm$
DECLARE
  v_def text;
  v_updated text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'confirm_goods_receipt_note'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_grn_id bigint';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'confirm_goods_receipt_note missing';
  END IF;

  v_def := replace(replace(v_def, E'\r\n', E'\n'), E'\r', E'\n');
  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  v_updated := regexp_replace(
    v_def,
    'v_applied := pg_catalog\.round\(v_applied_base / v_po_factor, 3\);\s+SELECT stock\.current_quantity, stock\.avg_unit_cost',
    $kept$v_applied := pg_catalog.round(v_applied_base / v_po_factor, 3);

    IF v_accepted_base > v_remaining_base THEN
      v_applied := pg_catalog.round(v_accepted_base / v_po_factor, 3);
      UPDATE public.purchase_order_items AS po_line
      SET quantity = v_previously_applied + v_applied
      WHERE po_line.id = v_item.purchase_order_item_id
        AND po_line.tenant_id = v_tenant;
      v_applied_base := v_accepted_base;
    END IF;

    SELECT stock.current_quantity, stock.avg_unit_cost$kept$
  );

  IF v_updated = v_def THEN
    RAISE EXCEPTION 'confirm_goods_receipt_note kept-qty patch failed';
  END IF;
  IF v_updated !~ 'quantity = v_previously_applied \+ v_applied' THEN
    RAISE EXCEPTION 'confirm_goods_receipt_note PO amend missing';
  END IF;

  EXECUTE v_updated;
END;
$patch_confirm$;

COMMENT ON FUNCTION public.confirm_goods_receipt_note(bigint) IS
  'Confirm a draft GRN. Remaining and apply compare in base units. Kept qty above remaining raises the PO line so po_applied equals accepted. Over-receipt does not block confirm.';
