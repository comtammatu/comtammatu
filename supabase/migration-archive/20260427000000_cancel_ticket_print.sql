-- =========================================================================
-- Phiếu huỷ món (cancel ticket kitchen print)
--
-- When a waiter/cashier voids an item that was already sent to kitchen, the
-- chef needs a paper ticket to stop preparing it. Without this, cooking
-- continues after the KDS card flips to `cancelled` (KDS realtime is a
-- secondary signal; paper is the primary floor communication).
--
-- Changes:
--   - order_items.cancel_reason TEXT — persist the void reason on the row
--     (previously only written to order_status_history.note). Needed for
--     the print payload AND for shift-level "món huỷ" reports
--   - system_settings.pos_cancel_ticket_enabled feature flag (default true)
--   - CREATE OR REPLACE void_order_item: write cancel_reason into
--     order_items during the status='cancelled' update. All existing logic
--     (permission check, order auto-cancel, advisory lock, audit history)
--     preserved verbatim from 20260426020000_allow_pos_staff_cancel_orders.sql
--   - NEW enqueue_cancel_ticket_print(p_order_item_id, p_reason) — builds
--     payload, inserts into print_jobs with job_type='cancel_ticket'
--     targeting the original menu_category.kitchen_printer slot. Skips
--     silently (no exception) when:
--       * feature flag off
--       * sent_to_kitchen_at IS NULL (chef never saw it)
--       * no active kitchen printer for the slot
--     Idempotency key 'order:{id}:cancel:{item_id}' — one cancel per item
--     (void RPC already blocks re-voiding via status guard)
--
-- Called by: voidOrderItem Server Action (after void RPC succeeds). Print
-- failures surface as a toast warning — void itself never rolls back.
-- =========================================================================

-- ─── 1. order_items.cancel_reason ────────────────────────────────────────

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

COMMENT ON COLUMN public.order_items.cancel_reason IS
  'Lý do huỷ món (do waiter/cashier nhập khi void). Null nếu chưa huỷ.';

-- ─── 2. feature flag ─────────────────────────────────────────────────────

INSERT INTO public.system_settings (tenant_id, key, value, description)
SELECT t.id, 'pos_cancel_ticket_enabled', 'true',
       'Feature flag: bật in phiếu huỷ món khi void item đã gửi bếp. Set ''false'' để kill switch.'
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings
  WHERE tenant_id = t.id AND key = 'pos_cancel_ticket_enabled'
);

-- ─── 3. void_order_item — persist cancel_reason ──────────────────────────

CREATE OR REPLACE FUNCTION public.void_order_item(
  p_order_item_id BIGINT,
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
  v_item RECORD;
  v_order RECORD;
  v_subtotal NUMERIC(15,2);
  v_all_cancelled BOOLEAN;
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

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_item.order_id);

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
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

  IF v_item.status IN ('served', 'cancelled') THEN
    RAISE EXCEPTION 'item not voidable' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  -- NEW: persist the cancel reason on the row so the cancel-ticket RPC
  -- (called by the Server Action after this commits) can include it in
  -- the print payload without needing the caller to pass it again.
  UPDATE public.order_items
  SET status = 'cancelled',
      cancel_reason = p_reason,
      updated_at = now()
  WHERE id = p_order_item_id;

  UPDATE public.kds_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE order_item_id = p_order_item_id AND tenant_id = v_item.tenant_id;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM public.order_items
  WHERE order_id = v_item.order_id AND status <> 'cancelled';

  SELECT NOT EXISTS (
    SELECT 1 FROM public.order_items WHERE order_id = v_item.order_id AND status <> 'cancelled'
  ) INTO v_all_cancelled;

  IF v_all_cancelled THEN
    UPDATE public.orders
    SET
      status = 'cancelled',
      subtotal = 0,
      total_amount = 0 + COALESCE(service_charge, 0) - COALESCE(discount_amount, 0),
      updated_at = now()
    WHERE id = v_item.order_id;

    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    )
    VALUES (
      v_item.tenant_id, v_item.order_id, v_order.status, 'cancelled', v_uid,
      'auto_cancel_all_items_voided: ' || p_reason
    );
  ELSE
    UPDATE public.orders o
    SET
      subtotal = v_subtotal,
      total_amount = v_subtotal + COALESCE(o.service_charge, 0) - COALESCE(o.discount_amount, 0),
      updated_at = now()
    WHERE o.id = v_item.order_id;

    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    )
    VALUES (
      v_item.tenant_id, v_item.order_id, v_order.status, v_order.status, v_uid,
      'void_item ' || p_order_item_id::text || ': ' || p_reason
    );
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_item.order_id,
    'auto_cancelled_order', v_all_cancelled,
    -- surface this so the Server Action knows whether to bother enqueuing
    -- the cancel ticket (no kitchen = no ticket)
    'was_sent_to_kitchen', v_item.sent_to_kitchen_at IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.void_order_item(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_order_item(BIGINT, TEXT) TO authenticated;

-- ─── 4. enqueue_cancel_ticket_print ──────────────────────────────────────

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

  IF NOT public.has_permission_any('pos:send_kitchen') THEN
    RAISE EXCEPTION 'permission denied: pos:send_kitchen' USING ERRCODE = '42501';
  END IF;

  -- Feature flag — kill switch for rapid rollback.
  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_cancel_ticket_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'feature_disabled');
  END IF;

  -- Skip silently if the kitchen never saw this item — nothing to cancel
  -- on paper.
  IF v_item.sent_to_kitchen_at IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_sent');
  END IF;

  -- Route to the original kitchen slot (not to both). If the category has
  -- no slot assigned, bail silently — the item was never routed either.
  SELECT mc.kitchen_printer INTO v_slot
  FROM public.menu_items mi
  JOIN public.menu_categories mc ON mc.id = mi.category_id
  WHERE mi.id = v_item.menu_item_id;

  IF v_slot IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_slot');
  END IF;

  -- No active printer for this slot → skip (don't raise). Cancel ticket is
  -- advisory; KDS realtime already flipped the card to cancelled.
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

  -- Payload items is an array to leave room for a future batched
  -- cancel_order variant; for now it always contains exactly one item.
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

  -- Deterministic idempotency key — one cancel ticket per item, period.
  -- Re-voiding is blocked at the status guard (`item not voidable`), so a
  -- second enqueue for the same item is impossible through the normal
  -- flow, but the UNIQUE(idempotency_key) on print_jobs gives belt-and-
  -- suspenders against rare races.
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

COMMENT ON FUNCTION public.enqueue_cancel_ticket_print(BIGINT, TEXT) IS
  'Enqueue a PHIẾU HUỶ MÓN print job targeting the original kitchen slot. '
  'Skips silently (returns skipped:true) when feature flag off, item never '
  'sent to kitchen, category has no slot, or no active printer for the slot. '
  'Called by the voidOrderItem Server Action after void_order_item commits.';
