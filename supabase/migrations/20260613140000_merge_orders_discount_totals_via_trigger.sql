-- merge_orders: delegate discount/total computation to the order-totals trigger.
--
-- The target/source UPDATEs previously hand-set discount_amount and
-- total_amount via the order-only compute_discount_amount path. Those writes
-- were immediately overwritten by pos_normalize_order_discount_totals (a BEFORE
-- trigger that fires on the subtotal/discount_* columns this UPDATE sets) and
-- did not account for per-item discounts on the re-pointed order_items.
--
-- This recreates the function so the UPDATEs set only the trigger inputs
-- (subtotal + merged discount_type/value/note); the trigger owns
-- discount_amount, item_discount_amount, order_discount_amount, and
-- total_amount. The return value re-reads the stored total post-trigger.
-- Behaviour is unchanged: the trigger recomputes the same order-level discount
-- (now correctly on the post-item-discount base) and nulls the metadata when
-- the amount resolves to 0, which the prior hand-block also did. Role gate is
-- written without the two unreachable legacy intermediate-scope tokens (D018).

CREATE OR REPLACE FUNCTION public.merge_orders(p_source_order_id bigint, p_target_order_id bigint, p_idempotency_key uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid                  UUID;
  v_prof_tenant          BIGINT;
  v_prof_branch          BIGINT;
  v_prof_role            TEXT;
  v_source               RECORD;
  v_target               RECORD;
  v_lock_lo              BIGINT;
  v_lock_hi              BIGINT;
  v_flag_enabled         TEXT;
  v_moved_count          INT;
  v_target_subtotal      NUMERIC(15,2);
  v_target_discount_type   TEXT;
  v_target_discount_value  NUMERIC(15,2);
  v_target_discount_note   TEXT;
  v_target_total           NUMERIC(15,2);
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'branch_manager', 'cashier', 'waiter')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_source_order_id = p_target_order_id THEN
    RAISE EXCEPTION 'merge_self' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT t.id INTO v_lock_lo
    FROM public.orders t
    WHERE t.id = p_target_order_id
      AND t.merge_request_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      SELECT subtotal, total_amount INTO v_target_subtotal, v_target_total
      FROM public.orders WHERE id = p_target_order_id;
      RETURN jsonb_build_object(
        'source_order_id',  p_source_order_id,
        'target_order_id',  p_target_order_id,
        'target_subtotal',  COALESCE(v_target_subtotal, 0),
        'target_total',     COALESCE(v_target_total, 0),
        'idempotent',       true
      );
    END IF;
  END IF;

  v_lock_lo := LEAST(p_source_order_id, p_target_order_id);
  v_lock_hi := GREATEST(p_source_order_id, p_target_order_id);
  PERFORM pg_advisory_xact_lock(v_lock_lo);
  PERFORM pg_advisory_xact_lock(v_lock_hi);

  IF v_lock_lo = p_source_order_id THEN
    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.customer_count, o.order_number
    INTO v_source FROM public.orders o WHERE o.id = p_source_order_id FOR UPDATE;

    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.customer_count, o.order_number
    INTO v_target FROM public.orders o WHERE o.id = p_target_order_id FOR UPDATE;
  ELSE
    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.customer_count, o.order_number
    INTO v_target FROM public.orders o WHERE o.id = p_target_order_id FOR UPDATE;

    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.customer_count, o.order_number
    INTO v_source FROM public.orders o WHERE o.id = p_source_order_id FOR UPDATE;
  END IF;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'source order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'target order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_source.tenant_id <> v_prof_tenant OR v_target.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_source.branch_id <> v_target.branch_id THEN
    RAISE EXCEPTION 'merge_different_branch' USING ERRCODE = '22023';
  END IF;

  IF v_prof_role IN ('owner') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_source.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_source.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_source.tenant_id AND key = 'pos_split_merge_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'split_merge_disabled' USING ERRCODE = 'P0001';
  END IF;

  IF v_source.order_type <> 'dine_in' OR v_target.order_type <> 'dine_in' THEN
    RAISE EXCEPTION 'merge_dine_in_only' USING ERRCODE = '22023';
  END IF;

  IF v_source.table_id IS NULL OR v_target.table_id IS NULL
     OR v_source.table_id <> v_target.table_id
  THEN
    RAISE EXCEPTION 'merge_different_tables' USING ERRCODE = '22023';
  END IF;

  IF v_source.status IN ('completed', 'cancelled')
     OR v_target.status IN ('completed', 'cancelled')
  THEN
    RAISE EXCEPTION 'merge_terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_source.payment_status, 'unpaid') = 'paid'
     OR COALESCE(v_target.payment_status, 'unpaid') = 'paid'
  THEN
    RAISE EXCEPTION 'merge_paid' USING ERRCODE = '22023';
  END IF;

  IF v_source.merged_into_order_id IS NOT NULL OR v_target.merged_into_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'merge_already_merged' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.payments
  WHERE order_id IN (p_source_order_id, p_target_order_id)
    AND status NOT IN ('failed', 'completed');
  IF FOUND THEN
    RAISE EXCEPTION 'merge_payment_pending' USING ERRCODE = '22023';
  END IF;

  IF (v_source.discount_type = 'pct' AND COALESCE(v_source.discount_amount, 0) > 0)
     OR (v_target.discount_type = 'pct' AND COALESCE(v_target.discount_amount, 0) > 0)
  THEN
    RAISE EXCEPTION 'merge_pct_discount_blocked' USING ERRCODE = '22023';
  END IF;

  IF v_source.discount_type = 'vnd' AND v_target.discount_type = 'vnd' THEN
    v_target_discount_type  := 'vnd';
    v_target_discount_value := COALESCE(v_source.discount_value, 0)
                             + COALESCE(v_target.discount_value, 0);
    v_target_discount_note  := COALESCE(v_target.discount_note, '')
      || ' + ' || COALESCE(v_source.discount_note, '');
  ELSIF v_source.discount_type = 'vnd' AND v_target.discount_type IS NULL THEN
    v_target_discount_type  := 'vnd';
    v_target_discount_value := v_source.discount_value;
    v_target_discount_note  := v_source.discount_note;
  ELSIF v_target.discount_type = 'vnd' AND v_source.discount_type IS NULL THEN
    v_target_discount_type  := 'vnd';
    v_target_discount_value := v_target.discount_value;
    v_target_discount_note  := v_target.discount_note;
  ELSE
    v_target_discount_type  := NULL;
    v_target_discount_value := NULL;
    v_target_discount_note  := NULL;
  END IF;

  UPDATE public.order_items
     SET order_id   = p_target_order_id,
         updated_at = now()
   WHERE order_id = p_source_order_id
     AND status <> 'cancelled';
  GET DIAGNOSTICS v_moved_count = ROW_COUNT;

  UPDATE public.kds_tickets
     SET order_id   = p_target_order_id,
         updated_at = now()
   WHERE order_id = p_source_order_id;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_target_subtotal
  FROM public.order_items
  WHERE order_id = p_target_order_id AND status <> 'cancelled';

  -- Set only the trigger inputs. pos_normalize_order_discount_totals fires on
  -- subtotal/discount_* and computes discount_amount, item_discount_amount,
  -- order_discount_amount, and total_amount (including the re-pointed items'
  -- per-item discounts), nulling the order-level metadata if it resolves to 0.
  UPDATE public.orders
     SET subtotal             = v_target_subtotal,
         discount_type        = v_target_discount_type,
         discount_value       = v_target_discount_value,
         discount_note        = v_target_discount_note,
         customer_count       = GREATEST(v_target.customer_count, v_source.customer_count),
         note                 = CASE
                                  WHEN v_source.note IS NOT NULL AND length(trim(v_source.note)) > 0
                                  THEN COALESCE(v_target.note || E'\n', '')
                                       || '[Gộp từ ' || v_source.order_number || ']: ' || v_source.note
                                  ELSE v_target.note
                                END,
         merge_request_key    = p_idempotency_key,
         updated_at           = now()
   WHERE id = p_target_order_id;

  UPDATE public.orders
     SET status               = 'cancelled',
         subtotal             = 0,
         discount_type        = NULL,
         discount_value       = NULL,
         discount_note        = NULL,
         merged_into_order_id = p_target_order_id,
         updated_at           = now()
   WHERE id = p_source_order_id;

  SELECT total_amount INTO v_target_total
  FROM public.orders WHERE id = p_target_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES
    (v_source.tenant_id, p_source_order_id, v_source.status, 'cancelled', v_uid,
     'merged_into: ' || v_target.order_number || ' (#' || p_target_order_id::TEXT
       || '), moved ' || v_moved_count::TEXT || ' items'),
    (v_target.tenant_id, p_target_order_id, v_target.status, v_target.status, v_uid,
     'merged_from: ' || v_source.order_number || ' (#' || p_source_order_id::TEXT
       || '), received ' || v_moved_count::TEXT || ' items');

  RETURN jsonb_build_object(
    'source_order_id',  p_source_order_id,
    'target_order_id',  p_target_order_id,
    'moved_count',      v_moved_count,
    'target_subtotal',  v_target_subtotal,
    'target_total',     COALESCE(v_target_total, 0)
  );
END;
$$;
