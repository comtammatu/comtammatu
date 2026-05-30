-- =========================================================================
-- Print pipeline safety net (P0 from 4-agent debate)
--
-- 1. enqueue_provisional_bill: block when order.status = 'cancelled'.
--    Previously only blocked payment_status='paid'; clicking "In tạm tính"
--    after "Huỷ đơn" produced an empty items array → agent Zod fail.
--
-- 2. confirm_cash_payment: wrap enqueue_receipt_print in BEGIN/EXCEPTION
--    so a printer-side failure does NOT roll back the cash payment + stock
--    consumption. Cashier already accepted physical cash — money is real.
--    Receipt becomes best-effort + surfaced as warning. Mirrors the
--    fail-soft contract used by the e-wallet `confirmPayment` Server Action.
--
-- 3. expire_stuck_print_jobs(): janitor RPC. Resets jobs stuck in
--    'processing' for >5 min back to 'pending' so the next drainPending
--    tick re-claims them. Without this, an agent crash mid-dispatch
--    silently orphans the job forever (idempotency UNIQUE blocks any
--    new insert, retry button can't reach it).
--    Returns count of revived jobs. Print-agent calls this every 60s.
--
-- 4. cancel_order returns per-item skip detail so the Server Action can
--    surface "đã huỷ NHƯNG bếp/bar không nhận" warnings (bottled-drinks
--    category has no kitchen_printer slot → silent skip today).
-- =========================================================================

-- ─── 1. enqueue_provisional_bill — block on cancelled order ──────────────

CREATE OR REPLACE FUNCTION public.enqueue_provisional_bill(
  p_order_id         bigint,
  p_qr_content       text DEFAULT NULL,
  p_qr_header_label  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_branch       public.branches%ROWTYPE;
  v_table_no     INT;
  v_printer_id   BIGINT;
  v_cashier_name TEXT;
  v_branch_tax   TEXT;
  v_qr_type      TEXT;
  v_flag_enabled TEXT;
  v_vietqr_bank  TEXT;
  v_vietqr_acc   TEXT;
  v_vietqr_name  TEXT;
  v_payment_qr   JSONB;
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

  IF NOT public.has_permission_any('pos:print') THEN
    RAISE EXCEPTION 'permission denied: pos:print' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_provisional_bill_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'provisional bill printing is disabled' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order already paid; cannot print provisional bill' USING ERRCODE = 'P0001';
  END IF;

  -- NEW: block on cancelled order — items SELECT would return empty array
  -- and agent-side Zod (items.min(1)) would fail with no useful diagnostic.
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'order is cancelled; cannot print provisional bill' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = v_order.branch_id;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_order.created_by;

  SELECT value INTO v_branch_tax
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'branch_tax_code';

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

  IF p_qr_content IS NOT NULL AND length(trim(p_qr_content)) > 0 THEN
    SELECT value INTO v_qr_type
    FROM public.system_settings
    WHERE tenant_id = v_order.tenant_id AND key = 'payment_qr_type';
    v_qr_type := COALESCE(v_qr_type, 'vietqr');

    IF v_qr_type = 'vietqr' THEN
      SELECT value INTO v_vietqr_bank FROM public.system_settings
       WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_bank_code';
      SELECT value INTO v_vietqr_acc FROM public.system_settings
       WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_no';
      SELECT value INTO v_vietqr_name FROM public.system_settings
       WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_name';
    END IF;

    v_payment_qr := jsonb_build_object(
      'type',          v_qr_type,
      'content',       p_qr_content,
      'header_label',  COALESCE(p_qr_header_label, UPPER(v_qr_type)),
      'account_no',    v_vietqr_acc,
      'account_name',  v_vietqr_name,
      'amount',        v_order.total_amount,
      'description',   'DH ' || v_order.order_number
    );
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
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  v_payload := jsonb_build_object(
    'kind',             'provisional_bill',
    'branch_name',      COALESCE(v_branch.name, ''),
    'branch_address',   COALESCE(v_branch.address, ''),
    'branch_phone',     COALESCE(v_branch.phone, ''),
    'branch_tax_code',  COALESCE(v_branch_tax, ''),
    'order_number',     v_order.order_number,
    'order_type',       v_order.order_type,
    'table_number',     v_table_no,
    'customer_count',   v_order.customer_count,
    'cashier_name',     COALESCE(v_cashier_name, ''),
    'note',             v_order.note,
    'items',            COALESCE(v_items, '[]'::jsonb),
    'subtotal',         v_order.subtotal,
    'tax_amount',       v_order.tax_amount,
    'service_charge',   v_order.service_charge,
    'discount_amount',  v_order.discount_amount,
    'total_amount',     v_order.total_amount,
    'payment_qr',       v_payment_qr,
    'created_at',       to_char(v_order.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS'),
    'printed_at',       to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || p_order_id::TEXT
    || ':provisional:' || extract(epoch from v_now)::BIGINT::TEXT;

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  )
  VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'provisional_bill',
    p_order_id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET payload = EXCLUDED.payload
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'order_id',   p_order_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id,
    'qr_type',    v_qr_type
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.enqueue_provisional_bill(bigint, text, text) TO authenticated;


-- ─── 2. confirm_cash_payment — fail-soft receipt enqueue ─────────────────

CREATE OR REPLACE FUNCTION public.confirm_cash_payment(
  p_order_id       bigint,
  p_cash_received  numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid             UUID;
  v_order           public.orders%ROWTYPE;
  v_payment_id      BIGINT;
  v_cash_change     NUMERIC(15,2);
  v_complete_res    RECORD;
  v_receipt_res     JSONB;
  v_print_warning   TEXT;
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
    public.has_permission_any('pos:payment')
    OR public.has_permission_any('pos:print')
  ) THEN
    RAISE EXCEPTION 'permission denied: pos:payment' USING ERRCODE = '42501';
  END IF;

  IF p_cash_received IS NULL OR p_cash_received < v_order.total_amount THEN
    RAISE EXCEPTION 'cash_received (%) must be >= total_amount (%)',
      p_cash_received, v_order.total_amount
      USING ERRCODE = 'P0001';
  END IF;

  IF p_cash_received > GREATEST(v_order.total_amount * 10, 50000000) THEN
    RAISE EXCEPTION 'cash_received (%) exceeds sane upper bound for total (%)',
      p_cash_received, v_order.total_amount
      USING ERRCODE = 'P0001';
  END IF;

  v_cash_change := p_cash_received - v_order.total_amount;

  SELECT id INTO v_payment_id
  FROM public.payments
  WHERE order_id = p_order_id
    AND method = 'cash'
    AND status = 'pending'
  ORDER BY id DESC
  LIMIT 1;

  IF v_payment_id IS NULL THEN
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id, method, amount, status, created_by
    ) VALUES (
      v_order.tenant_id, v_order.branch_id, p_order_id, 'cash',
      v_order.total_amount, 'pending', v_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  SELECT * INTO v_complete_res
  FROM public.complete_payment_and_consume_stock(
    v_payment_id,
    v_order.total_amount,
    jsonb_build_object('cash_received', p_cash_received, 'cash_change', v_cash_change),
    v_uid
  );

  IF v_complete_res.status NOT IN ('completed', 'already_completed') THEN
    RAISE EXCEPTION 'payment completion failed: % (detail: %)',
      v_complete_res.status, v_complete_res.detail
      USING ERRCODE = 'P0001';
  END IF;

  -- Receipt enqueue is best-effort: cashier has the cash, payment row is
  -- committed via complete_payment_and_consume_stock, stock is consumed.
  -- A printer hiccup (offline, RLS, payload too big) MUST NOT roll back
  -- the money. Surface as a warning to the Server Action so the cashier
  -- gets a toast and can hit "in lại" once the printer is back.
  BEGIN
    v_receipt_res := public.enqueue_receipt_print(
      p_order_id,
      p_cash_received,
      v_cash_change
    );
  EXCEPTION WHEN OTHERS THEN
    v_print_warning := SQLERRM;
    v_receipt_res := jsonb_build_object('error', SQLERRM);
    RAISE NOTICE '[confirm_cash_payment] receipt enqueue skipped for order %: %',
      p_order_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'order_id',       p_order_id,
    'payment_id',     v_payment_id,
    'cash_received',  p_cash_received,
    'cash_change',    v_cash_change,
    'print_job_id',   v_receipt_res->>'job_id',
    'print_warning',  v_print_warning
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_cash_payment(bigint, numeric) TO authenticated;


-- ─── 3. expire_stuck_print_jobs — janitor for orphaned 'processing' ──────

CREATE OR REPLACE FUNCTION public.expire_stuck_print_jobs(
  p_stale_after_seconds INT DEFAULT 300
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_revived INT;
BEGIN
  -- Move 'processing' jobs whose claimed_at is older than the threshold
  -- back to 'pending' so the next drainPending tick re-claims them.
  -- attempts is preserved so the agent can apply a retry budget on its
  -- side (not enforced here — keeps janitor a pure recovery primitive).
  UPDATE public.print_jobs
     SET status           = 'pending',
         claimed_by_agent = NULL,
         claimed_at       = NULL,
         last_error       = COALESCE(last_error, '') ||
                            CASE WHEN COALESCE(last_error, '') = '' THEN '' ELSE E'\n' END ||
                            'reaped: stuck in processing >' ||
                            p_stale_after_seconds || 's at ' || now()::text
   WHERE status     = 'processing'
     AND claimed_at < (now() - make_interval(secs => p_stale_after_seconds));

  GET DIAGNOSTICS v_revived = ROW_COUNT;
  RETURN v_revived;
END;
$function$;

REVOKE ALL ON FUNCTION public.expire_stuck_print_jobs(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stuck_print_jobs(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stuck_print_jobs(INT) TO service_role;

COMMENT ON FUNCTION public.expire_stuck_print_jobs(INT) IS
  'Janitor: revert print_jobs stuck in ''processing'' state (agent crashed '
  'mid-dispatch) back to ''pending'' so the next drain re-claims them. '
  'Returns count revived. Called by print-agent every 60s.';


-- ─── 4. cancel_order — return per-item skip detail ───────────────────────

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
  v_print_res JSONB;
  v_tickets_enqueued INT := 0;
  v_tickets_skipped  INT := 0;
  v_skip_reasons TEXT[] := ARRAY[]::TEXT[];
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

  -- Fanout cancel tickets, accumulating skip reasons (no_slot, no_printer,
  -- feature_disabled). The Server Action surfaces these as a UI warning
  -- so operators know which items the kitchen/bar was NOT notified about.
  FOR v_item_id IN
    SELECT id FROM public.order_items
    WHERE order_id = p_order_id
      AND sent_to_kitchen_at IS NOT NULL
    ORDER BY id
  LOOP
    BEGIN
      v_print_res := public.enqueue_cancel_ticket_print(v_item_id, p_reason);
      IF (v_print_res ? 'skipped') AND (v_print_res->>'skipped')::boolean THEN
        v_tickets_skipped := v_tickets_skipped + 1;
        v_skip_reasons := v_skip_reasons || COALESCE(v_print_res->>'reason', 'unknown');
      ELSE
        v_tickets_enqueued := v_tickets_enqueued + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_tickets_skipped := v_tickets_skipped + 1;
      v_skip_reasons := v_skip_reasons || ('error:' || SQLERRM);
      RAISE NOTICE '[cancel_order] cancel-ticket enqueue raised for item %: %',
        v_item_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'order_id',         p_order_id,
    'status',           'cancelled',
    'cancel_tickets',   v_tickets_enqueued,
    'cancel_skipped',   v_tickets_skipped,
    'skip_reasons',     to_jsonb(v_skip_reasons)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_order(BIGINT, TEXT) TO authenticated;
