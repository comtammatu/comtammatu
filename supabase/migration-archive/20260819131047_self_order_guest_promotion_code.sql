-- Guest Self-Order promo codes (order_pct / order_vnd / voucher_face) plus
-- per-line discount fields on the public snapshot and printed bill lines.
-- Money still lands on existing discount columns (ADR 0039 / ADR 0034).

CREATE OR REPLACE FUNCTION public.bill_line_items(p_order_id bigint)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(jsonb_agg(line ORDER BY first_id), '[]'::jsonb)
  FROM (
    SELECT
      jsonb_build_object(
        'item_name',     oi.item_name,
        'variant_name',  oi.variant_name,
        'category_type', mc.type,
        'quantity',      SUM(oi.quantity),
        'unit_price',    oi.unit_price,
        'modifiers',     oi.modifiers,
        'sides',         oi.sides,
        'subtotal',      SUM(oi.subtotal),
        'discount_amount', COALESCE(SUM(oi.discount_amount), 0),
        'discount_note', MAX(oi.discount_note),
        'vat_rate',      oi.vat_rate,
        'note',          NULL::text
      ) AS line,
      MIN(oi.id) AS first_id
    FROM public.order_items oi
    LEFT JOIN public.menu_items mi
      ON mi.id = oi.menu_item_id
     AND mi.tenant_id = oi.tenant_id
    LEFT JOIN public.menu_categories mc
      ON mc.id = mi.category_id
     AND mc.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.status <> 'cancelled'
    GROUP BY
      oi.menu_item_id, oi.variant_id, oi.item_name, oi.variant_name,
      oi.unit_price, oi.modifiers, oi.sides, oi.vat_rate, mc.type
  ) grouped;
$$;

COMMENT ON FUNCTION public.bill_line_items(bigint) IS
  'Payment-bill line items: one entry per distinct sold product; quantity, subtotal, and item discount summed. Item note is hidden on bills. vat_rate is snapshotted for print-render. Not for HDDT.';

REVOKE ALL ON FUNCTION public.bill_line_items(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bill_line_items(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.bill_line_items(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bill_line_items(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.self_order_get_snapshot(p_token text, p_client_op_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_table record;
  v_request public.self_order_requests%ROWTYPE;
  v_request_found boolean := false;
  v_open_order_count integer := 0;
  v_order_id bigint;
  v_order_payload jsonb := NULL;
  v_rounds_payload jsonb := '[]'::jsonb;
  v_payment_payload jsonb := NULL;
  v_request_payload jsonb := NULL;
  v_state text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT
    t.id AS table_id,
    t.tenant_id,
    t.branch_id,
    t.number AS table_number,
    b.name AS branch_name,
    b.phone AS branch_phone,
    b.google_review_url AS branch_google_review_url
  INTO v_table
  FROM public.tables t
  JOIN public.branches b
    ON b.id = t.branch_id
   AND b.tenant_id = t.tenant_id
   AND b.is_active = true
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  IF NOT public.self_order_branch_has_open_pos_session(
    v_table.tenant_id,
    v_table.branch_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'pos_session_closed');
  END IF;

  SELECT r.*
  INTO v_request
  FROM public.self_order_requests r
  WHERE r.tenant_id = v_table.tenant_id
    AND r.table_id = v_table.table_id
    AND r.status = 'pending'
  ORDER BY r.id DESC
  LIMIT 1;
  v_request_found := FOUND;

  IF NOT v_request_found AND p_client_op_id IS NOT NULL THEN
    SELECT r.*
    INTO v_request
    FROM public.self_order_requests r
    WHERE r.tenant_id = v_table.tenant_id
      AND r.table_id = v_table.table_id
      AND r.client_op_id = p_client_op_id
      AND r.status = 'rejected'
    ORDER BY r.id DESC
    LIMIT 1;
    v_request_found := FOUND;
  END IF;

  IF v_request_found THEN
    v_request_payload := jsonb_build_object(
      'id', v_request.id,
      'clientOpId', v_request.client_op_id,
      'status', v_request.status,
      'items', v_request.cart_payload,
      'customerNote', v_request.customer_note,
      'orderId', v_request.order_id,
      'createdAt', v_request.created_at,
      'decidedAt', v_request.decided_at
    );
  END IF;

  SELECT count(*)::integer, min(o.id)
  INTO v_open_order_count, v_order_id
  FROM public.orders o
  WHERE o.tenant_id = v_table.tenant_id
    AND o.branch_id = v_table.branch_id
    AND o.table_id = v_table.table_id
    AND o.payment_status <> 'paid'
    AND o.status NOT IN ('completed', 'cancelled')
    AND o.merged_into_order_id IS NULL;

  IF v_open_order_count = 1 THEN
    SELECT jsonb_build_object(
      'id', o.id,
      'orderNumber', o.order_number,
      'status', o.status,
      'paymentStatus', o.payment_status,
      'paymentMethod', o.payment_method,
      'subtotal', o.subtotal,
      'serviceCharge', o.service_charge,
      'discountAmount', o.discount_amount,
      'orderDiscountAmount', COALESCE(o.order_discount_amount, 0),
      'itemDiscountAmount', COALESCE(o.item_discount_amount, 0),
      'discountNote', o.discount_note,
      'promotionName', p.name,
      'promotionCode', pc.code,
      'totalAmount', o.total_amount,
      'itemCount', (
        SELECT COALESCE(sum(oi.quantity), 0)::integer
        FROM public.order_items oi
        WHERE oi.tenant_id = o.tenant_id
          AND oi.order_id = o.id
          AND oi.status <> 'cancelled'
      ),
      'items', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'menuItemId', oi.menu_item_id,
            'itemName', oi.item_name,
            'variantId', oi.variant_id,
            'variantName', oi.variant_name,
            'quantity', oi.quantity,
            'unitPrice', oi.unit_price,
            'lineTotal', oi.subtotal,
            'discountAmount', COALESCE(oi.discount_amount, 0),
            'discountNote', oi.discount_note,
            'modifiers', COALESCE(oi.modifiers, '[]'::jsonb),
            'sides', COALESCE(oi.sides, '[]'::jsonb),
            'note', oi.note
          ) ORDER BY oi.id
        ), '[]'::jsonb)
        FROM public.order_items oi
        WHERE oi.tenant_id = o.tenant_id
          AND oi.order_id = o.id
          AND oi.status <> 'cancelled'
      )
    )
    INTO v_order_payload
    FROM public.orders o
    LEFT JOIN public.promotions p
      ON p.id = o.promotion_id
     AND p.tenant_id = o.tenant_id
    LEFT JOIN public.promotion_codes pc
      ON pc.id = o.promotion_code_id
     AND pc.tenant_id = o.tenant_id
    WHERE o.id = v_order_id
      AND o.tenant_id = v_table.tenant_id;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', ksb.id,
        'sendSeq', ksb.send_seq,
        'kind', ksb.kind,
        'ticketNumber', ksb.kitchen_ticket_number,
        'createdAt', ksb.created_at,
        'items', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', lines.id,
              'itemName', lines.item_name,
              'variantName', lines.variant_name,
              'quantity', lines.quantity,
              'modifiers', lines.modifiers,
              'sides', lines.sides,
              'note', lines.note
            ) ORDER BY lines.id
          )
          FROM (
            SELECT DISTINCT ON (oi.id)
              oi.id,
              oi.item_name,
              oi.variant_name,
              oi.quantity,
              COALESCE(oi.modifiers, '[]'::jsonb) AS modifiers,
              COALESCE(oi.sides, '[]'::jsonb) AS sides,
              oi.note
            FROM public.kds_tickets kt
            JOIN public.order_items oi
              ON oi.id = kt.order_item_id
             AND oi.tenant_id = kt.tenant_id
            WHERE kt.tenant_id = v_table.tenant_id
              AND kt.kitchen_send_batch_id = ksb.id
            ORDER BY oi.id, kt.id
          ) lines
        ), '[]'::jsonb)
      ) ORDER BY ksb.send_seq
    ), '[]'::jsonb)
    INTO v_rounds_payload
    FROM public.kitchen_send_batches ksb
    WHERE ksb.tenant_id = v_table.tenant_id
      AND ksb.order_id = v_order_id;

    SELECT public.self_order_payment_request_public_payload(pr.id)
    INTO v_payment_payload
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = v_table.tenant_id
      AND pr.order_id = v_order_id
      AND pr.status IN ('cash_call', 'vietqr_pending')
      AND pr.expires_at > now()
    ORDER BY pr.id DESC
    LIMIT 1;
  END IF;

  v_state := CASE
    WHEN v_request_found AND v_request.status = 'pending'
      THEN 'awaiting_confirmation'
    WHEN v_open_order_count > 1
      THEN 'multiple_open_orders'
    WHEN v_open_order_count = 1 AND v_payment_payload IS NOT NULL
      THEN 'payment_pending'
    WHEN v_open_order_count = 1
      THEN 'open'
    WHEN v_request_found AND v_request.status = 'rejected'
      THEN 'rejected'
    ELSE 'unopened'
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'state', v_state,
    'branch', jsonb_build_object(
      'name', v_table.branch_name,
      'phone', v_table.branch_phone,
      'googleReviewUrl', v_table.branch_google_review_url
    ),
    'table', jsonb_build_object(
      'id', v_table.table_id,
      'number', v_table.table_number
    ),
    'openOrderCount', v_open_order_count,
    'order', CASE WHEN v_open_order_count = 1 THEN v_order_payload ELSE NULL END,
    'rounds', CASE WHEN v_open_order_count = 1 THEN v_rounds_payload ELSE '[]'::jsonb END,
    'request', v_request_payload,
    'paymentRequest', CASE WHEN v_open_order_count = 1 THEN v_payment_payload ELSE NULL END,
    'menu', public.self_order_menu_payload(v_table.tenant_id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.self_order_apply_promotion_code(
  p_token text,
  p_client_op_id uuid,
  p_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table public.tables%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_code public.promotion_codes%ROWTYPE;
  v_promo public.promotions%ROWTYPE;
  v_open_order_count integer := 0;
  v_order_id bigint;
  v_norm text;
  v_base numeric;
  v_amount numeric;
  v_note text;
  v_totals record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_client_op_id IS NULL THEN
    RAISE EXCEPTION 'self_order_missing_operation_id' USING ERRCODE = '22023';
  END IF;

  SELECT t.*
  INTO v_table
  FROM public.tables t
  JOIN public.branches b
    ON b.id = t.branch_id
   AND b.tenant_id = t.tenant_id
   AND b.is_active = true
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(v_table.id::text)
  );

  SELECT t.*
  INTO v_table
  FROM public.tables t
  WHERE t.id = v_table.id
    AND t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;
  IF NOT public.self_order_branch_has_open_pos_session(
    v_table.tenant_id,
    v_table.branch_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'pos_session_closed');
  END IF;

  SELECT count(*)::integer, min(o.id)
  INTO v_open_order_count, v_order_id
  FROM public.orders o
  WHERE o.tenant_id = v_table.tenant_id
    AND o.branch_id = v_table.branch_id
    AND o.table_id = v_table.id
    AND o.payment_status <> 'paid'
    AND o.status NOT IN ('completed', 'cancelled')
    AND o.merged_into_order_id IS NULL;

  IF v_open_order_count = 0 THEN
    RAISE EXCEPTION 'self_order_order_not_open' USING ERRCODE = '22023';
  END IF;
  IF v_open_order_count > 1 THEN
    RAISE EXCEPTION 'self_order_order_ambiguous' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(v_order_id);
  SELECT * INTO v_order FROM public.orders WHERE id = v_order_id FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = v_table.tenant_id
      AND pr.order_id = v_order.id
      AND pr.status IN ('cash_call', 'vietqr_pending')
      AND pr.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'self_order_active_payment_intent' USING ERRCODE = '22023';
  END IF;

  PERFORM public.promotion_assert_order_mutable(v_order);
  IF v_order.promotion_id IS NOT NULL THEN
    RAISE EXCEPTION 'promotion_already_applied' USING ERRCODE = '22023';
  END IF;
  IF v_order.discount_type IS NOT NULL
     AND COALESCE(v_order.order_discount_amount, 0) > 0 THEN
    RAISE EXCEPTION 'manual_discount_present' USING ERRCODE = '22023';
  END IF;

  v_norm := public.promotion_normalize_code(p_code);
  SELECT * INTO v_code
  FROM public.promotion_codes
  WHERE tenant_id = v_order.tenant_id AND code = v_norm
  FOR UPDATE;
  IF NOT FOUND OR v_code.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'promotion_code_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_promo FROM public.promotions WHERE id = v_code.promotion_id;
  IF v_promo.kind IN ('free_side', 'free_item', 'bxgy') THEN
    RAISE EXCEPTION 'promotion_guest_staff_required' USING ERRCODE = '22023';
  END IF;
  IF v_promo.kind NOT IN ('order_pct', 'order_vnd', 'voucher_face') THEN
    RAISE EXCEPTION 'promotion_not_eligible' USING ERRCODE = '22023';
  END IF;

  v_base := GREATEST(
    COALESCE(v_order.subtotal, 0) - COALESCE(v_order.item_discount_amount, 0),
    0
  );
  IF NOT public.promotion_is_eligible(
    v_promo, v_order.branch_id, v_order.order_type, v_base, now()
  ) THEN
    RAISE EXCEPTION 'promotion_not_eligible' USING ERRCODE = '22023';
  END IF;
  IF v_code.redeemed_count >= v_code.max_redemptions THEN
    RAISE EXCEPTION 'promotion_code_spent' USING ERRCODE = '22023';
  END IF;

  v_amount := public.promotion_order_amount(v_promo, v_code, v_base);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'discount_zero_amount' USING ERRCODE = '22023';
  END IF;
  v_note := v_promo.name || ' · ' || v_code.code;
  PERFORM public.promotion_apply_to_order(
    v_order, v_promo, v_code, v_amount, v_note, NULL::uuid
  );

  UPDATE public.promotion_codes
  SET
    redeemed_count = redeemed_count + 1,
    status = CASE
      WHEN kind = 'unique' OR redeemed_count + 1 >= max_redemptions THEN 'redeemed'
      ELSE status
    END
  WHERE id = v_code.id;

  SELECT order_discount_amount, discount_amount, total_amount
  INTO v_totals FROM public.orders WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'ok', true,
    'orderId', v_order.id,
    'promotionId', v_promo.id,
    'code', v_code.code,
    'name', v_promo.name,
    'discountAmount', v_totals.order_discount_amount,
    'totalDiscountAmount', v_totals.discount_amount,
    'totalAmount', v_totals.total_amount,
    'appliedAmount', v_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_clear_promotion(
  p_token text,
  p_client_op_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table public.tables%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_code public.promotion_codes%ROWTYPE;
  v_promo public.promotions%ROWTYPE;
  v_open_order_count integer := 0;
  v_order_id bigint;
  v_reason text := 'Khách bỏ mã';
  v_totals record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_client_op_id IS NULL THEN
    RAISE EXCEPTION 'self_order_missing_operation_id' USING ERRCODE = '22023';
  END IF;

  SELECT t.*
  INTO v_table
  FROM public.tables t
  JOIN public.branches b
    ON b.id = t.branch_id
   AND b.tenant_id = t.tenant_id
   AND b.is_active = true
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(v_table.id::text)
  );

  SELECT t.*
  INTO v_table
  FROM public.tables t
  WHERE t.id = v_table.id
    AND t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;
  IF NOT public.self_order_branch_has_open_pos_session(
    v_table.tenant_id,
    v_table.branch_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'pos_session_closed');
  END IF;

  SELECT count(*)::integer, min(o.id)
  INTO v_open_order_count, v_order_id
  FROM public.orders o
  WHERE o.tenant_id = v_table.tenant_id
    AND o.branch_id = v_table.branch_id
    AND o.table_id = v_table.id
    AND o.payment_status <> 'paid'
    AND o.status NOT IN ('completed', 'cancelled')
    AND o.merged_into_order_id IS NULL;

  IF v_open_order_count = 0 THEN
    RAISE EXCEPTION 'self_order_order_not_open' USING ERRCODE = '22023';
  END IF;
  IF v_open_order_count > 1 THEN
    RAISE EXCEPTION 'self_order_order_ambiguous' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(v_order_id);
  SELECT * INTO v_order FROM public.orders WHERE id = v_order_id FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = v_table.tenant_id
      AND pr.order_id = v_order.id
      AND pr.status IN ('cash_call', 'vietqr_pending')
      AND pr.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'self_order_active_payment_intent' USING ERRCODE = '22023';
  END IF;

  PERFORM public.promotion_assert_order_mutable(v_order);
  IF v_order.promotion_id IS NULL THEN
    RAISE EXCEPTION 'promotion_not_applied' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_promo FROM public.promotions WHERE id = v_order.promotion_id;
  IF v_promo.kind NOT IN ('order_pct', 'order_vnd', 'voucher_face') THEN
    RAISE EXCEPTION 'promotion_guest_staff_required' USING ERRCODE = '22023';
  END IF;

  IF v_order.promotion_code_id IS NOT NULL THEN
    SELECT * INTO v_code FROM public.promotion_codes
    WHERE id = v_order.promotion_code_id FOR UPDATE;
    IF FOUND AND v_code.kind = 'unique' THEN
      UPDATE public.promotion_codes
      SET redeemed_count = GREATEST(redeemed_count - 1, 0), status = 'active'
      WHERE id = v_code.id;
    ELSIF FOUND THEN
      UPDATE public.promotion_codes
      SET redeemed_count = GREATEST(redeemed_count - 1, 0),
          status = CASE WHEN status = 'redeemed' THEN 'active' ELSE status END
      WHERE id = v_code.id;
    END IF;
  END IF;

  UPDATE public.promotion_redemptions
  SET status = 'cleared', cleared_at = now(), cleared_reason = v_reason
  WHERE order_id = v_order.id AND status = 'applied';

  UPDATE public.orders
  SET
    discount_type = NULL,
    discount_value = NULL,
    discount_note = NULL,
    promotion_id = NULL,
    promotion_code_id = NULL,
    updated_at = now()
  WHERE id = v_order.id;

  SELECT total_amount INTO v_totals FROM public.orders WHERE id = v_order.id;
  RETURN jsonb_build_object(
    'ok', true,
    'orderId', v_order.id,
    'totalAmount', v_totals.total_amount
  );
END;
$$;

COMMENT ON FUNCTION public.self_order_apply_promotion_code(text, uuid, text) IS
  'Guest QR apply of order-level promo/voucher codes. service_role only. Picker kinds stay staff-owned.';

COMMENT ON FUNCTION public.self_order_clear_promotion(text, uuid) IS
  'Guest QR clear of order-level promo/voucher codes applied on the open table bill.';

REVOKE ALL ON FUNCTION public.self_order_apply_promotion_code(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.self_order_apply_promotion_code(text, uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.self_order_clear_promotion(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.self_order_clear_promotion(text, uuid)
  TO service_role;
