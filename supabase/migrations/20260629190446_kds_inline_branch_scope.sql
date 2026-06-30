CREATE OR REPLACE FUNCTION public.bump_kds_ticket(p_ticket_id bigint) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ticket    RECORD;
  v_new_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('kds:mark_ready') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id, tenant_id, branch_id, station_id, order_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND (public.auth_role() = 'owner' OR branch_id = public.auth_branch_id())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ticket.status = 'pending' THEN
    v_new_status := 'preparing';
  ELSIF v_ticket.status = 'preparing' THEN
    v_new_status := 'ready';
  ELSE
    RAISE EXCEPTION 'Ticket cannot be bumped from status %', v_ticket.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.kds_tickets
  SET status    = v_new_status,
      bumped_at = now(),
      bumped_by = auth.uid()
  WHERE id = p_ticket_id;

  IF v_new_status = 'ready' THEN
    PERFORM public.check_order_ready(v_ticket.order_id);
  END IF;

  RETURN v_new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_kds_tickets(p_branch_id bigint, p_ticket_ids bigint[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_ticket_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_updated_ticket_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_order_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_requested_count INT := 0;
  v_locked_count INT := 0;
  v_completed_count INT := 0;
  v_group_count INT := 0;
  v_order_id BIGINT;
  v_print_result JSONB := jsonb_build_object(
    'jobs', '[]'::jsonb,
    'requested_ticket_count', 0,
    'printed_ticket_count', 0,
    'skipped_ticket_count', 0
  );
  v_print_warning TEXT := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NULL OR p_branch_id <= 0 THEN
    RAISE EXCEPTION 'invalid_branch' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission_any('kds:mark_ready') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT ticket_id), ARRAY[]::BIGINT[])
  INTO v_ticket_ids
  FROM unnest(COALESCE(p_ticket_ids, ARRAY[]::BIGINT[])) AS input(ticket_id)
  WHERE ticket_id IS NOT NULL AND ticket_id > 0;

  v_requested_count := COALESCE(array_length(v_ticket_ids, 1), 0);

  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'no_tickets' USING ERRCODE = '22023';
  END IF;

  WITH locked AS (
    SELECT kt.id
    FROM public.kds_tickets kt
    WHERE kt.id = ANY(v_ticket_ids)
      AND kt.tenant_id = public.auth_tenant_id()
      AND kt.branch_id = p_branch_id
      AND (public.auth_role() = 'owner' OR kt.branch_id = public.auth_branch_id())
    FOR UPDATE
  )
  SELECT COUNT(*) INTO v_locked_count
  FROM locked;

  IF v_locked_count <> v_requested_count THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(DISTINCT COALESCE(
    'batch:' || kt.kitchen_send_batch_id::TEXT,
    'order:' || kt.order_id::TEXT
  ))
  INTO v_group_count
  FROM public.kds_tickets kt
  WHERE kt.id = ANY(v_ticket_ids)
    AND kt.tenant_id = public.auth_tenant_id()
    AND kt.branch_id = p_branch_id;

  IF v_group_count <> 1 THEN
    RAISE EXCEPTION 'mixed_kds_card' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT kt.order_id), ARRAY[]::BIGINT[])
  INTO v_order_ids
  FROM public.kds_tickets kt
  WHERE kt.id = ANY(v_ticket_ids)
    AND kt.tenant_id = public.auth_tenant_id()
    AND kt.branch_id = p_branch_id;

  WITH updated AS (
    UPDATE public.kds_tickets kt
    SET status = 'ready',
        bumped_at = now(),
        bumped_by = v_uid,
        updated_at = now()
    WHERE kt.id = ANY(v_ticket_ids)
      AND kt.tenant_id = public.auth_tenant_id()
      AND kt.branch_id = p_branch_id
      AND kt.status IN ('pending', 'preparing')
    RETURNING kt.id
  )
  SELECT
    COALESCE(array_agg(id), ARRAY[]::BIGINT[]),
    COUNT(*)
  INTO v_updated_ticket_ids, v_completed_count
  FROM updated;

  IF v_completed_count > 0 THEN
    BEGIN
      v_print_result := private.enqueue_kitchen_completion_print_internal(
        p_branch_id,
        v_updated_ticket_ids,
        v_uid
      );

      IF COALESCE((v_print_result->>'skipped_ticket_count')::INT, 0) > 0 THEN
        v_print_warning := 'kitchen_print_skipped';
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_print_warning := 'kitchen_print_enqueue_failed';
        v_print_result := jsonb_build_object(
          'jobs', '[]'::jsonb,
          'requested_ticket_count', v_completed_count,
          'printed_ticket_count', 0,
          'skipped_ticket_count', v_completed_count
        );
        RAISE LOG 'complete_kds_tickets print enqueue skipped branch_id=%, ticket_ids=%, sqlstate=%, error=%',
          p_branch_id,
          v_updated_ticket_ids,
          SQLSTATE,
          SQLERRM;
    END;
  END IF;

  FOREACH v_order_id IN ARRAY v_order_ids LOOP
    PERFORM public.check_order_ready(v_order_id);
  END LOOP;

  RETURN jsonb_build_object(
    'requested_count', v_requested_count,
    'completed_count', v_completed_count,
    'print_jobs', COALESCE(v_print_result->'jobs', '[]'::jsonb),
    'printed_ticket_count', COALESCE((v_print_result->>'printed_ticket_count')::INT, 0),
    'skipped_ticket_count', COALESCE((v_print_result->>'skipped_ticket_count')::INT, 0),
    'print_warning', v_print_warning
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_kds_item_out_of_stock(p_ticket_id bigint, p_disable_for_day boolean DEFAULT true, p_reason text DEFAULT 'Hết món'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
    AND (public.auth_role() = 'owner' OR kt.branch_id = public.auth_branch_id())
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
    ARRAY['cashier', 'branch_manager']::TEXT[],
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

CREATE OR REPLACE FUNCTION public.recall_kds_ticket(p_ticket_id bigint) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ticket     RECORD;
  v_new_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('kds:recall') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id, tenant_id, branch_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND (public.auth_role() = 'owner' OR branch_id = public.auth_branch_id())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ticket.status = 'ready' THEN
    v_new_status := 'preparing';
  ELSIF v_ticket.status = 'preparing' THEN
    v_new_status := 'pending';
  ELSE
    RAISE EXCEPTION 'Ticket cannot be recalled from status %', v_ticket.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.kds_tickets
  SET status    = v_new_status,
      bumped_at = NULL,
      bumped_by = NULL
  WHERE id = p_ticket_id;

  RETURN v_new_status;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.can_access_branch(bigint)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.can_access_branch(bigint) FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.can_access_branch(bigint);
