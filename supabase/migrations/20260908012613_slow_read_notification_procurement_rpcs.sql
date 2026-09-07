-- Migration: slow_read_notification_procurement_rpcs
-- Badge counts and procurement/transfer lists authorize once. PostgREST
-- policies on the source tables stay unchanged for other callers.

CREATE OR REPLACE FUNCTION public.count_unread_notifications_by_target()
RETURNS TABLE(
  kind text,
  action_url text,
  target_branch_id bigint,
  unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH ctx AS MATERIALIZED (
    SELECT
      auth.uid() AS user_id,
      public.auth_tenant_id() AS tenant_id,
      public.auth_branch_id() AS branch_id,
      public.auth_role() AS user_role
  )
  SELECT
    notification.kind,
    notification.action_url,
    notification.target_branch_id,
    count(*)::bigint AS unread_count
  FROM ctx
  JOIN public.notifications AS notification
    ON notification.tenant_id = ctx.tenant_id
  WHERE ctx.user_id IS NOT NULL
    AND ctx.tenant_id IS NOT NULL
    AND ctx.user_role IS NOT NULL
    AND notification.target_roles @> ARRAY[ctx.user_role]::text[]
    AND (
      notification.target_branch_id IS NULL
      OR notification.target_branch_id = ctx.branch_id
      OR ctx.user_role IN ('owner')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.notification_reads AS notification_read
      WHERE notification_read.notification_id = notification.id
        AND notification_read.user_id = ctx.user_id
    )
    AND (
      notification.expires_at IS NULL
      OR notification.expires_at > now()
    )
    AND (
      NOT (notification.meta ? 'target_user_id')
      OR (notification.meta ->> 'target_user_id') = ctx.user_id::text
    )
  GROUP BY
    notification.kind,
    notification.action_url,
    notification.target_branch_id;
$$;

REVOKE ALL ON FUNCTION public.count_unread_notifications_by_target() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_unread_notifications_by_target() FROM anon;
GRANT ALL ON FUNCTION public.count_unread_notifications_by_target() TO authenticated;
GRANT ALL ON FUNCTION public.count_unread_notifications_by_target() TO service_role;
COMMENT ON FUNCTION public.count_unread_notifications_by_target() IS
  'DEFINER unread counts grouped by navigation target and branch; visibility matches count_unread_notifications.';

CREATE OR REPLACE FUNCTION public.list_suppliers_with_item_counts()
RETURNS TABLE (
  id bigint,
  tenant_id bigint,
  name text,
  tax_code text,
  phone text,
  address text,
  notes text,
  is_active boolean,
  payment_terms_days integer,
  payment_terms_note text,
  created_at timestamptz,
  updated_at timestamptz,
  ingredient_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    supplier.id,
    supplier.tenant_id,
    supplier.name,
    supplier.tax_code,
    supplier.phone,
    supplier.address,
    supplier.notes,
    supplier.is_active,
    supplier.payment_terms_days,
    supplier.payment_terms_note,
    supplier.created_at,
    supplier.updated_at,
    (
      SELECT count(*)::bigint
      FROM public.supplier_items AS item
      WHERE item.tenant_id = supplier.tenant_id
        AND item.supplier_id = supplier.id
        AND item.is_active
    ) AS ingredient_count
  FROM public.suppliers AS supplier
  WHERE supplier.tenant_id = v_tenant
  ORDER BY supplier.name ASC;
END;
$$;

COMMENT ON FUNCTION public.list_suppliers_with_item_counts() IS
  'Supplier directory plus active item counts after one procurement:read check.';

REVOKE ALL ON FUNCTION public.list_suppliers_with_item_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_suppliers_with_item_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_suppliers_with_item_counts() TO authenticated;

DROP FUNCTION IF EXISTS public.list_grn_receive_lines(bigint[]);

CREATE OR REPLACE FUNCTION public.list_grn_receive_lines(
  p_grn_ids bigint[],
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  grn_id bigint,
  purchase_order_item_id bigint,
  received_quantity numeric,
  rejected_quantity numeric,
  confirmed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_limit integer;
  v_offset integer;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_grn_ids IS NULL OR cardinality(p_grn_ids) = 0 THEN
    RETURN;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 500);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  RETURN QUERY
  WITH readable AS MATERIALIZED (
    SELECT branch.id
    FROM public.branches AS branch
    WHERE branch.tenant_id = v_tenant
      AND public.has_permission(branch.id, 'procurement:read')
  )
  SELECT
    line.grn_id,
    line.purchase_order_item_id,
    line.received_quantity,
    line.rejected_quantity,
    line.confirmed_at
  FROM public.grn_items AS line
  JOIN public.goods_received_notes AS grn
    ON grn.id = line.grn_id
   AND grn.tenant_id = line.tenant_id
  JOIN readable
    ON readable.id = grn.branch_id
  WHERE line.tenant_id = v_tenant
    AND line.grn_id = ANY (p_grn_ids)
  ORDER BY line.grn_id ASC, line.id ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

COMMENT ON FUNCTION public.list_grn_receive_lines(bigint[], integer, integer) IS
  'PO-workspace GRN line quantities. Permission is the readable-branch set once; pages of 500 keep PostgREST db-max-rows from truncating received qty.';

REVOKE ALL ON FUNCTION public.list_grn_receive_lines(bigint[], integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_grn_receive_lines(bigint[], integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_grn_receive_lines(bigint[], integer, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.list_receipt_allocations_for_grns(bigint[]);

CREATE OR REPLACE FUNCTION public.list_receipt_allocations_for_grns(
  p_grn_ids bigint[],
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  supplier_invoice_id bigint,
  grn_id bigint,
  purchase_order_item_id bigint,
  billed_quantity numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_limit integer;
  v_offset integer;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  -- Matches supplier_invoice_receipt_allocations_select (monetary gate).
  IF NOT public.can_read_inventory_monetary('procurement:price_list_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_grn_ids IS NULL OR cardinality(p_grn_ids) = 0 THEN
    RETURN;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 500);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  RETURN QUERY
  WITH readable AS MATERIALIZED (
    SELECT branch.id
    FROM public.branches AS branch
    WHERE branch.tenant_id = v_tenant
      AND public.has_permission(branch.id, 'procurement:read')
  )
  SELECT
    allocation.supplier_invoice_id,
    allocation.grn_id,
    allocation.purchase_order_item_id,
    allocation.billed_quantity
  FROM public.supplier_invoice_receipt_allocations AS allocation
  JOIN public.goods_received_notes AS grn
    ON grn.id = allocation.grn_id
   AND grn.tenant_id = allocation.tenant_id
  JOIN readable
    ON readable.id = grn.branch_id
  WHERE allocation.tenant_id = v_tenant
    AND allocation.grn_id = ANY (p_grn_ids)
    AND allocation.purchase_order_item_id IS NOT NULL
  ORDER BY allocation.grn_id ASC, allocation.id ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

COMMENT ON FUNCTION public.list_receipt_allocations_for_grns(bigint[], integer, integer) IS
  'Invoice-to-GRN billed quantities after monetary + readable-branch set; pages of 500.';

REVOKE ALL ON FUNCTION public.list_receipt_allocations_for_grns(bigint[], integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_receipt_allocations_for_grns(bigint[], integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_receipt_allocations_for_grns(bigint[], integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_stock_transfers_for_branch(
  p_branch_id bigint DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  id bigint,
  transfer_number text,
  status text,
  transfer_scope text,
  stock_request_id bigint,
  from_branch_id bigint,
  to_branch_id bigint,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_limit integer;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NOT NULL THEN
    IF NOT public.has_permission(p_branch_id, 'inventory:read') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.has_permission_any('inventory:read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 200);

  -- Row visibility matches stock_transfers_select: inventory:read on from or to.
  -- Readable branches are computed once; do not call has_permission per row.
  RETURN QUERY
  WITH readable AS MATERIALIZED (
    SELECT branch.id
    FROM public.branches AS branch
    WHERE branch.tenant_id = v_tenant
      AND public.has_permission(branch.id, 'inventory:read')
  )
  SELECT
    transfer.id,
    transfer.transfer_number,
    transfer.status,
    transfer.transfer_scope::text,
    transfer.stock_request_id,
    transfer.from_branch_id,
    transfer.to_branch_id,
    transfer.created_at
  FROM public.stock_transfers AS transfer
  WHERE transfer.tenant_id = v_tenant
    AND (
      p_branch_id IS NULL
      OR transfer.from_branch_id = p_branch_id
      OR transfer.to_branch_id = p_branch_id
    )
    AND (
      transfer.from_branch_id IN (SELECT readable.id FROM readable)
      OR transfer.to_branch_id IN (SELECT readable.id FROM readable)
    )
  ORDER BY transfer.created_at DESC, transfer.id DESC
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.list_stock_transfers_for_branch(bigint, integer) IS
  'Transfer headers visible on from/to branches the caller may inventory:read.';

REVOKE ALL ON FUNCTION public.list_stock_transfers_for_branch(bigint, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_stock_transfers_for_branch(bigint, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_stock_transfers_for_branch(bigint, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_open_stock_transfers(
  p_branch_id bigint DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_count bigint := 0;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NOT NULL THEN
    IF NOT public.has_permission(p_branch_id, 'inventory:read') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.has_permission_any('inventory:read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH readable AS MATERIALIZED (
    SELECT branch.id
    FROM public.branches AS branch
    WHERE branch.tenant_id = v_tenant
      AND public.has_permission(branch.id, 'inventory:read')
  )
  SELECT count(*)
    INTO v_count
    FROM public.stock_transfers AS transfer
   WHERE transfer.tenant_id = v_tenant
     AND transfer.status = ANY (
       ARRAY[
         'draft',
         'confirmed',
         'confirmed_ship',
         'in_transit',
         'confirmed_receive'
       ]::text[]
     )
     AND (
       p_branch_id IS NULL
       OR transfer.from_branch_id = p_branch_id
       OR transfer.to_branch_id = p_branch_id
     )
     AND (
       transfer.from_branch_id IN (SELECT readable.id FROM readable)
       OR transfer.to_branch_id IN (SELECT readable.id FROM readable)
     );

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.count_open_stock_transfers(bigint) IS
  'Open transfer count limited to from/to branches the caller may inventory:read.';

REVOKE ALL ON FUNCTION public.count_open_stock_transfers(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_open_stock_transfers(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.count_open_stock_transfers(bigint) TO authenticated;
