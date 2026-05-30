-- =========================================================================
-- KDS dispatch exception: kitchen marks an active item as out of stock
-- =========================================================================
-- KDS owns kitchen fulfilment. This RPC lets chef/branch_manager reject a
-- pending/preparing ticket because the dish cannot be made, while POS keeps
-- the commercial replacement/payment flow.

CREATE OR REPLACE FUNCTION public.check_order_ready(p_order_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pending_count INT;
  v_current_status TEXT;
BEGIN
  SELECT status INTO v_current_status
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = public.auth_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_current_status IN ('ready', 'served', 'completed', 'cancelled') THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_pending_count
  FROM public.kds_tickets
  WHERE order_id = p_order_id
    AND tenant_id = public.auth_tenant_id()
    AND status NOT IN ('ready', 'served', 'cancelled');

  IF v_pending_count = 0 THEN
    UPDATE public.orders
    SET status = 'ready',
        updated_at = now()
    WHERE id = p_order_id
      AND tenant_id = public.auth_tenant_id();

    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by
    )
    SELECT tenant_id, id, v_current_status, 'ready', auth.uid()
    FROM public.orders
    WHERE id = p_order_id
      AND tenant_id = public.auth_tenant_id();
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_order_ready(BIGINT)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_kds_item_out_of_stock(
  p_ticket_id BIGINT,
  p_disable_for_day BOOLEAN DEFAULT TRUE,
  p_reason TEXT DEFAULT 'Hết món'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID := auth.uid();
  v_reason          TEXT := COALESCE(NULLIF(trim(p_reason), ''), 'Hết món');
  v_row             RECORD;
  v_subtotal        NUMERIC(15,2);
  v_discount_amount NUMERIC(15,2);
  v_limit           RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('kds:mark_ready') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  IF length(v_reason) < 2 THEN
    RAISE EXCEPTION 'reason too short' USING ERRCODE = '22023';
  END IF;

  SELECT
    kt.id AS ticket_id,
    kt.tenant_id,
    kt.branch_id,
    kt.status AS ticket_status,
    kt.order_id,
    kt.order_item_id,
    oi.menu_item_id,
    oi.item_name,
    oi.status AS item_status,
    o.order_number,
    o.status AS order_status,
    o.payment_status,
    o.service_charge,
    o.discount_type,
    o.discount_value
  INTO v_row
  FROM public.kds_tickets kt
  JOIN public.order_items oi
    ON oi.id = kt.order_item_id
   AND oi.tenant_id = kt.tenant_id
  JOIN public.orders o
    ON o.id = kt.order_id
   AND o.tenant_id = kt.tenant_id
  WHERE kt.id = p_ticket_id
    AND kt.tenant_id = public.auth_tenant_id()
    AND public.can_access_branch(kt.branch_id)
  FOR UPDATE OF kt, oi, o;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_row.order_id);

  IF v_row.order_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order_terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_row.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid' USING ERRCODE = '22023';
  END IF;

  IF v_row.ticket_status NOT IN ('pending', 'preparing')
     OR v_row.item_status NOT IN ('pending', 'preparing') THEN
    RAISE EXCEPTION 'item_not_out_of_stockable' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET status = 'cancelled',
      cancel_reason = 'kds_out_of_stock: ' || v_reason,
      updated_at = now()
  WHERE id = v_row.order_item_id
    AND tenant_id = v_row.tenant_id;

  UPDATE public.kds_tickets
  SET status = 'cancelled',
      bumped_at = now(),
      bumped_by = v_uid,
      updated_at = now()
  WHERE id = v_row.ticket_id
    AND tenant_id = v_row.tenant_id;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM public.order_items
  WHERE order_id = v_row.order_id
    AND tenant_id = v_row.tenant_id
    AND status <> 'cancelled';

  v_discount_amount := public.compute_discount_amount(
    v_row.discount_type,
    v_row.discount_value,
    v_subtotal
  );

  UPDATE public.orders o
  SET
    subtotal        = v_subtotal,
    discount_type   = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_type END,
    discount_value  = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_value END,
    discount_note   = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_note END,
    discount_amount = v_discount_amount,
    total_amount    = v_subtotal + COALESCE(o.service_charge, 0) - v_discount_amount,
    updated_at      = now()
  WHERE o.id = v_row.order_id
    AND o.tenant_id = v_row.tenant_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_row.tenant_id,
    v_row.order_id,
    v_row.order_status,
    v_row.order_status,
    v_uid,
    'kds_out_of_stock_item ' || v_row.order_item_id::TEXT || ': ' || v_reason
  );

  IF p_disable_for_day THEN
    INSERT INTO public.branch_menu_item_daily_limits (
      tenant_id,
      branch_id,
      menu_item_id,
      limit_date,
      limit_quantity,
      is_disabled,
      sold_today
    )
    VALUES (
      v_row.tenant_id,
      v_row.branch_id,
      v_row.menu_item_id,
      (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      NULL,
      TRUE,
      0
    )
    ON CONFLICT (branch_id, menu_item_id, limit_date)
    DO UPDATE SET
      is_disabled = TRUE,
      updated_at = now()
    RETURNING limit_quantity, is_disabled, sold_today
    INTO v_limit;
  ELSE
    SELECT limit_quantity, is_disabled, sold_today
    INTO v_limit
    FROM public.branch_menu_item_daily_limits
    WHERE branch_id = v_row.branch_id
      AND menu_item_id = v_row.menu_item_id
      AND limit_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

    IF NOT FOUND THEN
      SELECT NULL::INT AS limit_quantity,
             FALSE AS is_disabled,
             0::INT AS sold_today
      INTO v_limit;
    END IF;
  END IF;

  INSERT INTO public.notifications (
    tenant_id,
    target_branch_id,
    target_roles,
    kind,
    severity,
    title,
    body,
    entity_type,
    entity_id,
    action_url,
    dedup_key,
    meta
  )
  VALUES (
    v_row.tenant_id,
    v_row.branch_id,
    ARRAY['cashier', 'waiter', 'branch_manager']::TEXT[],
    'pos.kds_out_of_stock',
    'warning',
    format('Bếp báo hết món #%s', v_row.order_number),
    format('%s cần đổi món hoặc bỏ khỏi đơn.', v_row.item_name),
    'order_item',
    v_row.order_item_id,
    format('/br/%s/pos?order=%s', v_row.branch_id, v_row.order_id),
    format('kds_out_of_stock:%s', v_row.ticket_id),
    jsonb_build_object(
      'order_id', v_row.order_id,
      'order_number', v_row.order_number,
      'order_item_id', v_row.order_item_id,
      'menu_item_id', v_row.menu_item_id,
      'item_name', v_row.item_name,
      'reason', v_reason,
      'disabled_for_day', p_disable_for_day
    )
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET
    severity = EXCLUDED.severity,
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    action_url = EXCLUDED.action_url,
    meta = EXCLUDED.meta,
    created_at = now(),
    expires_at = NULL;

  PERFORM public.check_order_ready(v_row.order_id);

  RETURN jsonb_build_object(
    'ticket_id', v_row.ticket_id,
    'order_id', v_row.order_id,
    'order_item_id', v_row.order_item_id,
    'menu_item_id', v_row.menu_item_id,
    'item_name', v_row.item_name,
    'disabled_for_day', p_disable_for_day,
    'limit_quantity', v_limit.limit_quantity,
    'is_disabled', COALESCE(v_limit.is_disabled, p_disable_for_day),
    'sold_today', COALESCE(v_limit.sold_today, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.mark_kds_item_out_of_stock(BIGINT, BOOLEAN, TEXT) IS
  'KDS dispatch exception. Cancels one active kitchen ticket/order item as out-of-stock, optionally disables the menu item for the branch/day, and notifies POS.';

REVOKE ALL ON FUNCTION public.mark_kds_item_out_of_stock(BIGINT, BOOLEAN, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_kds_item_out_of_stock(BIGINT, BOOLEAN, TEXT)
  TO authenticated;
