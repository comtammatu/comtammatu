-- =============================================================
-- S1.3 Enqueue print RPCs
--   1. enqueue_kitchen_print(order_id)   → 1..2 rows (one per slot)
--   2. enqueue_receipt_print(order_id)   → 1 row (receipt printer)
--
-- Both run SECURITY DEFINER, validate tenant + permissions,
-- insert into print_jobs, rely on UNIQUE(idempotency_key) for replay safety.
-- Payload is normalized JSON — agent re-renders to ESC/POS.
-- =============================================================

CREATE OR REPLACE FUNCTION public.enqueue_kitchen_print(
  p_order_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_table_no     INT;
  v_send_seq     INT;
  v_slot         SMALLINT;
  v_printer_id   BIGINT;
  v_printer_role TEXT;
  v_items        JSONB;
  v_payload      JSONB;
  v_idempotency  TEXT;
  v_job_id       BIGINT;
  v_jobs         JSONB := '[]'::jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('pos:send_kitchen') THEN
    RAISE EXCEPTION 'permission denied: pos:send_kitchen' USING ERRCODE = '42501';
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  UPDATE public.orders
    SET kitchen_send_count = kitchen_send_count + 1
    WHERE id = p_order_id
    RETURNING kitchen_send_count INTO v_send_seq;

  FOR v_slot IN SELECT generate_series(1, 2)::SMALLINT
  LOOP
    SELECT jsonb_agg(
      jsonb_build_object(
        'item_name',    oi.item_name,
        'variant_name', oi.variant_name,
        'quantity',     oi.quantity,
        'modifiers',    oi.modifiers,
        'sides',        oi.sides,
        'note',         oi.note
      )
      ORDER BY oi.id
    )
    INTO v_items
    FROM public.order_items oi
    JOIN public.menu_items mi ON mi.id = oi.menu_item_id
    JOIN public.menu_categories mc ON mc.id = mi.category_id
    WHERE oi.order_id = p_order_id
      AND oi.sent_to_kitchen_at IS NULL
      AND mc.kitchen_printer = v_slot;

    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
      CONTINUE;
    END IF;

    v_printer_role := 'kitchen_' || v_slot::TEXT;

    SELECT id INTO v_printer_id
    FROM public.printers
    WHERE branch_id = v_order.branch_id
      AND tenant_id = v_order.tenant_id
      AND role = v_printer_role
      AND is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'no active % printer for branch %', v_printer_role, v_order.branch_id
        USING ERRCODE = 'P0002';
    END IF;

    v_payload := jsonb_build_object(
      'kind',         'kitchen_ticket',
      'order_number', v_order.order_number,
      'order_type',   v_order.order_type,
      'table_number', v_table_no,
      'send_seq',     v_send_seq,
      'slot',         v_slot,
      'note',         v_order.note,
      'items',        v_items,
      'printed_at',   to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
                              'YYYY-MM-DD"T"HH24:MI:SS')
    );

    v_idempotency := 'order:' || p_order_id::TEXT
      || ':kitchen:' || v_slot::TEXT
      || ':send:' || v_send_seq::TEXT;

    INSERT INTO public.print_jobs (
      tenant_id, branch_id, printer_id, job_type,
      order_id, payload, idempotency_key, created_by
    )
    VALUES (
      v_order.tenant_id, v_order.branch_id, v_printer_id, 'kitchen_ticket',
      p_order_id, v_payload, v_idempotency, v_uid
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;

    IF v_job_id IS NULL THEN
      SELECT id INTO v_job_id FROM public.print_jobs
        WHERE idempotency_key = v_idempotency;
    END IF;

    v_jobs := v_jobs || jsonb_build_object(
      'slot', v_slot,
      'printer_id', v_printer_id,
      'job_id', v_job_id,
      'item_count', jsonb_array_length(v_items)
    );
  END LOOP;

  UPDATE public.order_items
    SET sent_to_kitchen_at = now()
    WHERE order_id = p_order_id AND sent_to_kitchen_at IS NULL;

  RETURN jsonb_build_object(
    'order_id',  p_order_id,
    'send_seq',  v_send_seq,
    'jobs',      v_jobs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_kitchen_print(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_kitchen_print(BIGINT) TO authenticated;


CREATE OR REPLACE FUNCTION public.enqueue_receipt_print(
  p_order_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_table_no     INT;
  v_printer_id   BIGINT;
  v_items        JSONB;
  v_payload      JSONB;
  v_idempotency  TEXT;
  v_job_id       BIGINT;
  v_now          TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_permission_any('pos:print')
    OR public.has_permission_any('pos:reprint_receipt')
  ) THEN
    RAISE EXCEPTION 'permission denied: pos:print' USING ERRCODE = '42501';
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT id INTO v_printer_id
  FROM public.printers
  WHERE branch_id = v_order.branch_id
    AND tenant_id = v_order.tenant_id
    AND role = 'receipt'
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active receipt printer for branch %', v_order.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'item_name',    oi.item_name,
      'variant_name', oi.variant_name,
      'quantity',     oi.quantity,
      'unit_price',   oi.unit_price,
      'modifiers',    oi.modifiers,
      'sides',        oi.sides,
      'subtotal',     oi.subtotal,
      'note',         oi.note
    )
    ORDER BY oi.id
  )
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  v_payload := jsonb_build_object(
    'kind',          'receipt',
    'order_number',  v_order.order_number,
    'order_type',    v_order.order_type,
    'table_number',  v_table_no,
    'customer_count', v_order.customer_count,
    'note',          v_order.note,
    'items',         v_items,
    'subtotal',      v_order.subtotal,
    'total_amount',  v_order.total_amount,
    'printed_at',    to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                             'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || p_order_id::TEXT
    || ':receipt:' || extract(epoch from v_now)::BIGINT::TEXT;

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  )
  VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'receipt',
    p_order_id, v_payload, v_idempotency, v_uid
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'order_id',   p_order_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_receipt_print(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_receipt_print(BIGINT) TO authenticated;


CREATE OR REPLACE FUNCTION public.claim_print_job(
  p_job_id   BIGINT,
  p_agent_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE public.print_jobs
    SET status = 'processing',
        claimed_by_agent = p_agent_id,
        claimed_at = now(),
        attempts = attempts + 1
    WHERE id = p_job_id
      AND status = 'pending'
      AND tenant_id = public.auth_tenant_id();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_print_job(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_print_job(BIGINT, TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION public.complete_print_job(
  p_job_id  BIGINT,
  p_success BOOLEAN,
  p_error   TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.print_jobs
    SET status = CASE WHEN p_success THEN 'printed' ELSE 'failed' END,
        printed_at = CASE WHEN p_success THEN now() ELSE printed_at END,
        last_error = CASE WHEN p_success THEN NULL ELSE p_error END
    WHERE id = p_job_id
      AND tenant_id = public.auth_tenant_id();
END;
$$;

REVOKE ALL ON FUNCTION public.complete_print_job(BIGINT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_print_job(BIGINT, BOOLEAN, TEXT) TO authenticated;
