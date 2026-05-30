-- =========================================================================
-- cancel_order: fanout cancel tickets to kitchen for items already sent
--
-- Bug: cancel_order RPC sets every order_item.status = 'cancelled' but does
-- NOT print cancel tickets, so the kitchen keeps cooking. Only voidOrderItem
-- (single-item void) was wired to enqueue_cancel_ticket_print. Symptom
-- reported: 1-món order → "Huỷ đơn" → bếp vẫn làm món vừa huỷ.
--
-- Fix:
-- 1. cancel_order: after cancelling items + order, loop through items that
--    had sent_to_kitchen_at IS NOT NULL and PERFORM enqueue_cancel_ticket_print
--    on each. Wrapped in BEGIN/EXCEPTION so a single printer failure does
--    not roll back the whole cancel.
-- 2. enqueue_cancel_ticket_print: relax permission to accept pos:void_order
--    (in addition to pos:send_kitchen) — anyone allowed to cancel an order
--    must also be allowed to notify the kitchen about that cancel.
--
-- Both functions preserved verbatim from prior versions; only the new
-- permission disjunction + the fanout loop are added.
-- =========================================================================

-- ─── 1. enqueue_cancel_ticket_print — relax permission ────────────────

CREATE OR REPLACE FUNCTION public.enqueue_cancel_ticket_print(
  p_order_item_id BIGINT,
  p_reason        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID;
  v_item          public.order_items%ROWTYPE;
  v_order         public.orders%ROWTYPE;
  v_table_no      INT;
  v_slot          SMALLINT;
  v_printer_id    BIGINT;
  v_voided_by     TEXT;
  v_flag_enabled  TEXT;
  v_items_payload JSONB;
  v_payload       JSONB;
  v_idempotency   TEXT;
  v_job_id        BIGINT;
  v_now           TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  -- Permission: anyone allowed to cancel (void_order) must be allowed to
  -- notify the kitchen about that cancel. send_kitchen kept for direct
  -- callers (voidOrderItem flow) where it's the natural permission.
  IF NOT (
    public.has_permission_any('pos:send_kitchen')
    OR public.has_permission_any('pos:void_order')
  ) THEN
    RAISE EXCEPTION 'permission denied: pos:send_kitchen or pos:void_order' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_cancel_ticket_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'feature_disabled');
  END IF;

  IF v_item.sent_to_kitchen_at IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_sent');
  END IF;

  SELECT mc.kitchen_printer INTO v_slot
  FROM public.menu_items mi
  JOIN public.menu_categories mc ON mc.id = mi.category_id
  WHERE mi.id = v_item.menu_item_id;

  IF v_slot IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_slot');
  END IF;

  SELECT id INTO v_printer_id
  FROM public.printers
  WHERE branch_id = v_order.branch_id
    AND tenant_id = v_order.tenant_id
    AND role = 'kitchen_' || v_slot::TEXT
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_printer');
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_voided_by
  FROM public.profiles WHERE id = v_uid;

  v_items_payload := jsonb_build_array(jsonb_build_object(
    'item_name',    v_item.item_name,
    'variant_name', v_item.variant_name,
    'quantity',     v_item.quantity,
    'modifiers',    v_item.modifiers,
    'sides',        v_item.sides
  ));

  v_payload := jsonb_build_object(
    'kind',          'cancel_ticket',
    'order_number',  v_order.order_number,
    'order_type',    v_order.order_type,
    'table_number',  v_table_no,
    'slot',          v_slot,
    'items',         v_items_payload,
    'reason',        COALESCE(NULLIF(trim(p_reason), ''), v_item.cancel_reason, ''),
    'voided_by',     COALESCE(v_voided_by, ''),
    'printed_at',    to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                             'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || v_order.id::TEXT
    || ':cancel:' || p_order_item_id::TEXT;

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  ) VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'cancel_ticket',
    v_order.id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'job_id',     v_job_id,
    'printer_id', v_printer_id,
    'slot',       v_slot
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_cancel_ticket_print(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_cancel_ticket_print(BIGINT, TEXT) TO authenticated;


-- ─── 2. cancel_order — fanout cancel tickets after cancelling ──────────

CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id BIGINT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_order RECORD;
  v_item_id BIGINT;
  v_tickets_enqueued INT := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(po.legacy_role_code, 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN ('branch_manager', 'cashier', 'waiter') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, status, table_id, order_type
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  -- Persist cancel reason on items so the cancel-ticket payload (looked up
  -- inside enqueue_cancel_ticket_print) shows the right "LÝ DO" text.
  UPDATE public.order_items
  SET status = 'cancelled',
      cancel_reason = p_reason,
      updated_at = now()
  WHERE order_id = p_order_id AND status <> 'cancelled';

  UPDATE public.kds_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = p_order_id AND tenant_id = v_order.tenant_id;

  UPDATE public.orders
  SET
    status = 'cancelled',
    subtotal = 0,
    total_amount = 0 + COALESCE(service_charge, 0) - COALESCE(discount_amount, 0),
    updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_order.status, 'cancelled', v_uid, p_reason
  );

  -- NEW: fanout cancel tickets to the kitchen for every item that the chef
  -- already saw on paper. Skip silently per-item if the printer is offline,
  -- the slot is unset, or the feature flag disabled — never roll back the
  -- cancel itself just because a printer hiccuped.
  FOR v_item_id IN
    SELECT id FROM public.order_items
    WHERE order_id = p_order_id
      AND sent_to_kitchen_at IS NOT NULL
    ORDER BY id
  LOOP
    BEGIN
      PERFORM public.enqueue_cancel_ticket_print(v_item_id, p_reason);
      v_tickets_enqueued := v_tickets_enqueued + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[cancel_order] cancel-ticket enqueue skipped for item %: %',
        v_item_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'order_id',         p_order_id,
    'status',           'cancelled',
    'cancel_tickets',   v_tickets_enqueued
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_order(BIGINT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.cancel_order(BIGINT, TEXT) IS
  'Cancel entire order + all order_items + KDS tickets. After update, fans '
  'out one cancel-ticket print per item that was previously sent to kitchen, '
  'so the chef stops cooking. Print failures are logged but never rollback '
  'the cancel — kitchen sync is best-effort.';
