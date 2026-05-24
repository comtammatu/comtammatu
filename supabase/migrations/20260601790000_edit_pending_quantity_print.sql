-- =========================================================================
-- POS: print kitchen quantity-change notice after editing a sent pending item
--
-- edit_pending_order_item already updates KDS realtime state, but paper
-- kitchens only see print_jobs. This RPC enqueues the paper delta after a
-- successful edit:
--   - increase: kitchen_ticket / GỌI THÊM, quantity = new - old
--   - decrease: cancel_ticket, quantity = old - new
--
-- It intentionally reuses existing print-agent payload kinds; no agent
-- deployment is required.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.enqueue_edit_pending_order_item_quantity_print(
  p_order_item_id BIGINT,
  p_old_quantity  INT,
  p_new_quantity  INT,
  p_reason        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID;
  v_item            public.order_items%ROWTYPE;
  v_order           public.orders%ROWTYPE;
  v_table_no        INT;
  v_slot            SMALLINT;
  v_printer_id      BIGINT;
  v_category_id     BIGINT;
  v_staff_name      TEXT;
  v_flag_enabled    TEXT;
  v_delta           INT;
  v_print_type      TEXT;
  v_items_payload   JSONB;
  v_payload         JSONB;
  v_idempotency     TEXT;
  v_job_id          BIGINT;
  v_now             TIMESTAMPTZ := now();
  v_change_note     TEXT;
  v_item_note       TEXT;
  v_event_token     TEXT;
  v_batch_ticket_number TEXT;
  v_batch_send_seq      INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_old_quantity IS NULL OR p_new_quantity IS NULL
     OR p_old_quantity < 1 OR p_new_quantity < 1
  THEN
    RAISE EXCEPTION 'quantity must be >= 1' USING ERRCODE = '22023';
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

  IF v_item.sent_to_kitchen_at IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_sent');
  END IF;

  IF p_old_quantity = p_new_quantity THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_quantity_change');
  END IF;

  IF p_new_quantity < p_old_quantity THEN
    SELECT value INTO v_flag_enabled
    FROM public.system_settings
    WHERE tenant_id = v_order.tenant_id AND key = 'pos_reduce_qty_enabled';
    IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'feature_disabled');
    END IF;
  END IF;

  SELECT mi.category_id INTO v_category_id
  FROM public.menu_items mi
  WHERE mi.id = v_item.menu_item_id
    AND mi.tenant_id = v_order.tenant_id;

  IF v_category_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_slot');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.printer_menu_categories pmc
    WHERE pmc.tenant_id = v_order.tenant_id
      AND pmc.branch_id = v_order.branch_id
      AND pmc.category_id = v_category_id
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_slot');
  END IF;

  v_delta := abs(p_new_quantity - p_old_quantity);
  v_print_type := CASE
    WHEN p_new_quantity > p_old_quantity THEN 'kitchen_ticket'
    ELSE 'cancel_ticket'
  END;

  SELECT p.id, CASE WHEN p.role = 'kitchen_2' THEN 2 ELSE 1 END
  INTO v_printer_id, v_slot
  FROM public.printer_menu_categories pmc
  JOIN public.printers p
    ON p.id = pmc.printer_id
   AND p.tenant_id = pmc.tenant_id
   AND p.branch_id = pmc.branch_id
   AND p.is_active = TRUE
  JOIN public.printer_print_types ppt
    ON ppt.printer_id = p.id
   AND ppt.tenant_id = p.tenant_id
   AND ppt.branch_id = p.branch_id
   AND ppt.print_type = v_print_type
  WHERE pmc.tenant_id = v_order.tenant_id
    AND pmc.branch_id = v_order.branch_id
    AND pmc.category_id = v_category_id
  ORDER BY p.id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_printer');
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_staff_name
  FROM public.profiles WHERE id = v_uid;

  SELECT ksb.kitchen_ticket_number, ksb.send_seq
  INTO v_batch_ticket_number, v_batch_send_seq
  FROM public.kds_tickets kt
  JOIN public.kitchen_send_batches ksb
    ON ksb.id = kt.kitchen_send_batch_id
  WHERE kt.tenant_id = v_order.tenant_id
    AND kt.order_item_id = v_item.id
  ORDER BY ksb.created_at DESC
  LIMIT 1;

  v_change_note := CASE
    WHEN p_new_quantity > p_old_quantity THEN
      'TANG SL ' || p_old_quantity::TEXT || ' -> ' || p_new_quantity::TEXT
    ELSE
      'GIAM SL ' || p_old_quantity::TEXT || ' -> ' || p_new_quantity::TEXT
  END;

  v_item_note := v_change_note
    || CASE
      WHEN NULLIF(trim(COALESCE(v_item.note, '')), '') IS NULL THEN ''
      ELSE ': ' || trim(v_item.note)
    END;

  v_items_payload := jsonb_build_array(jsonb_build_object(
    'item_name',    v_item.item_name,
    'variant_name', v_item.variant_name,
    'quantity',     v_delta,
    'modifiers',    v_item.modifiers,
    'sides',        v_item.sides,
    'note',         v_item_note
  ));

  v_event_token := replace(
    COALESCE(extract(epoch from v_item.updated_at)::NUMERIC(20,6)::TEXT, ''),
    '.',
    ''
  );

  IF p_new_quantity > p_old_quantity THEN
    v_payload := jsonb_build_object(
      'kind',                  'kitchen_ticket',
      'kitchen_ticket_number', COALESCE(v_batch_ticket_number, v_order.order_number),
      'source_order_number',   v_order.order_number,
      'order_number',          v_order.order_number,
      'order_type',            v_order.order_type,
      'table_number',          v_table_no,
      'cashier_name',          COALESCE(v_staff_name, ''),
      'send_seq',              COALESCE(v_batch_send_seq, v_order.kitchen_send_count, 1),
      'send_kind',             'append',
      'slot',                  v_slot,
      'note',                  v_change_note,
      'items',                 v_items_payload,
      'printed_at',            to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                       'YYYY-MM-DD"T"HH24:MI:SS')
    );
  ELSE
    v_payload := jsonb_build_object(
      'kind',         'cancel_ticket',
      'order_number', v_order.order_number,
      'order_type',   v_order.order_type,
      'table_number', v_table_no,
      'slot',         v_slot,
      'items',        v_items_payload,
      'reason',       v_change_note || ': '
                      || COALESCE(NULLIF(trim(p_reason), ''), 'Sua so luong mon'),
      'voided_by',    COALESCE(v_staff_name, ''),
      'printed_at',   to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                              'YYYY-MM-DD"T"HH24:MI:SS')
    );
  END IF;

  v_idempotency := 'order:' || v_order.id::TEXT
    || ':edit-qty:' || p_order_item_id::TEXT
    || ':' || p_old_quantity::TEXT || '->' || p_new_quantity::TEXT
    || ':printer:' || v_printer_id::TEXT
    || ':at:' || v_event_token;

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  ) VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, v_print_type,
    v_order.id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    SELECT id INTO v_job_id
    FROM public.print_jobs
    WHERE idempotency_key = v_idempotency;
  END IF;

  RETURN jsonb_build_object(
    'job_id',     v_job_id,
    'printer_id', v_printer_id,
    'slot',       v_slot,
    'job_type',   v_print_type,
    'delta',      v_delta
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_edit_pending_order_item_quantity_print(
  BIGINT, INT, INT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_edit_pending_order_item_quantity_print(
  BIGINT, INT, INT, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.enqueue_edit_pending_order_item_quantity_print(BIGINT, INT, INT, TEXT) IS
  'Enqueue a kitchen-visible print delta after edit_pending_order_item changes '
  'quantity for an already-sent pending item. Increase uses kitchen_ticket '
  '(GỌI THÊM); decrease uses cancel_ticket. Returns skipped reasons for '
  'not_sent, no_quantity_change, no_slot, no_printer, and feature_disabled.';
