-- Migration: fix service-role detection in create_order functions
--
-- 20260825083000 added `OR (current_user IN ('postgres','supabase_admin','service_role'))`
-- to v_is_service. Under SECURITY DEFINER, current_user is the function OWNER
-- (postgres), so the clause is always true at runtime: branch-scope and
-- profile checks were bypassed for every authenticated caller, and an anon
-- caller passing p_created_by was accepted. This restores JWT-only detection
-- (auth.role()) and the original created_by guard:
--   authenticated -> own auth.uid(); service without uid -> p_created_by;
--   anon -> 28000 regardless of p_created_by.

CREATE OR REPLACE FUNCTION public.create_order(p_tenant_id bigint, p_branch_id bigint, p_created_by uuid, p_items jsonb, p_order_type text DEFAULT 'dine_in'::text, p_table_id bigint DEFAULT NULL::bigint, p_pos_session_id bigint DEFAULT NULL::bigint, p_note text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid, p_delivery_platform text DEFAULT NULL::text, p_external_order_ref text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_service       BOOLEAN := COALESCE(auth.role() = 'service_role', false);
  v_created_by       UUID;
  v_order_id         BIGINT;
  v_order_number     TEXT;
  v_date_part        TEXT;
  v_subtotal         NUMERIC(15,2) := 0;
  v_seq              INT;
  v_table_number     INT;
  v_item             JSONB;
  v_base_price       NUMERIC(15,2);
  v_variant_adj      NUMERIC(15,2);
  v_modifier_sum     NUMERIC(15,2);
  v_sides_sum        NUMERIC(15,2);
  v_enriched_sides   JSONB;
  v_unit_price       NUMERIC(15,2);
  v_item_subtotal    NUMERIC(15,2);
  v_menu_item_id     BIGINT;
  v_variant_id       BIGINT;
  v_quantity         INT;
  v_prof_tenant      BIGINT;
  v_prof_branch      BIGINT;
  v_prof_role        TEXT;
  v_branch_code      TEXT;
  v_item_discount    NUMERIC(15,2);
  v_platform         TEXT := NULLIF(lower(btrim(COALESCE(p_delivery_platform, ''))), '');
  v_external_ref     TEXT := NULLIF(btrim(COALESCE(p_external_order_ref, '')), '');
BEGIN
  v_created_by := auth.uid();
  IF v_created_by IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_is_service AND v_created_by IS NULL THEN
    v_created_by := p_created_by;
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'unassigned')
    INTO v_prof_tenant, v_prof_branch, v_prof_role
    FROM public.profiles p
    LEFT JOIN public.positions po ON po.id = p.position_id
   WHERE p.id = v_created_by;

  IF FOUND THEN
    IF v_prof_tenant IS DISTINCT FROM p_tenant_id THEN
      RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
    END IF;

    IF v_prof_role IN ('owner') OR v_is_service THEN
      SELECT b.code INTO v_branch_code
        FROM public.branches b
       WHERE b.id = p_branch_id AND b.tenant_id = p_tenant_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
      END IF;
    ELSIF v_prof_branch IS NOT NULL THEN
      IF p_branch_id IS DISTINCT FROM v_prof_branch THEN
        RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
      END IF;
      SELECT b.code INTO v_branch_code
        FROM public.branches b
       WHERE b.id = p_branch_id AND b.tenant_id = p_tenant_id;
    ELSE
      RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT v_is_service THEN
      RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
    END IF;
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = p_branch_id AND b.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  IF p_order_type NOT IN ('dine_in', 'takeaway', 'delivery') THEN
    RAISE EXCEPTION 'p_order_type must be dine_in, takeaway, or delivery' USING ERRCODE = '22023';
  END IF;

  IF p_order_type = 'delivery' THEN
    IF v_platform IS NULL OR v_platform NOT IN ('grab', 'shopee', 'be', 'green_sm') THEN
      RAISE EXCEPTION 'delivery_platform_required' USING ERRCODE = '22023';
    END IF;
    IF v_external_ref IS NULL THEN
      RAISE EXCEPTION 'external_order_ref_required' USING ERRCODE = '22023';
    END IF;
    IF p_table_id IS NOT NULL THEN
      RAISE EXCEPTION 'delivery_orders_forbid_table' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_platform := NULL;
    v_external_ref := NULL;
  END IF;

  IF p_table_id IS NOT NULL THEN
    SELECT t.number INTO v_table_number
      FROM public.tables t
     WHERE t.id = p_table_id AND t.branch_id = p_branch_id AND t.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Table does not belong to this branch' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_pos_session_id IS NOT NULL THEN
    PERFORM 1 FROM public.pos_sessions
     WHERE id = p_pos_session_id
       AND branch_id = p_branch_id
       AND tenant_id = p_tenant_id
       AND status = 'open';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'POS session does not belong to this branch or is not open' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT o.id, o.order_number INTO v_order_id, v_order_number
      FROM public.orders o
     WHERE o.tenant_id = p_tenant_id
       AND o.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
    END IF;
  END IF;

  INSERT INTO public.order_daily_counters (
    tenant_id, branch_id, counter_date, last_seq
  )
  VALUES (
    p_tenant_id,
    p_branch_id,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    1
  )
  ON CONFLICT (tenant_id, branch_id, counter_date)
  DO UPDATE SET
    last_seq   = public.order_daily_counters.last_seq + 1,
    updated_at = now()
  RETURNING last_seq INTO v_seq;

  v_date_part := to_char(
    CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh',
    'YYMMDD'
  );

  IF p_order_type = 'dine_in' THEN
    v_order_number := 'TC-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  ELSIF p_order_type = 'delivery' THEN
    v_order_number := 'GH-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  ELSE
    v_order_number := 'MV-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  END IF;

  IF v_branch_code IS NOT NULL THEN
    v_order_number := v_order_number || '-' || v_branch_code;
  END IF;

  BEGIN
    INSERT INTO public.orders (
      tenant_id, branch_id, table_id, order_number, order_type,
      subtotal, total_amount, note, created_by,
      pos_session_id, idempotency_key,
      delivery_platform, external_order_ref
    )
    VALUES (
      p_tenant_id, p_branch_id, p_table_id, v_order_number, p_order_type,
      0, 0, p_note, v_created_by,
      p_pos_session_id, p_idempotency_key,
      v_platform, v_external_ref
    )
    RETURNING id INTO v_order_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF p_idempotency_key IS NOT NULL THEN
        SELECT o.id, o.order_number INTO v_order_id, v_order_number
          FROM public.orders o
         WHERE o.tenant_id = p_tenant_id
           AND o.idempotency_key = p_idempotency_key;
        IF FOUND THEN
          RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
        END IF;
      END IF;
      RAISE;
  END;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS value
  LOOP
    v_menu_item_id := (v_item ->> 'menu_item_id')::BIGINT;
    v_variant_id   := NULLIF(v_item ->> 'variant_id', '')::BIGINT;
    v_quantity     := (v_item ->> 'quantity')::INT;

    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'invalid quantity' USING ERRCODE = '22023';
    END IF;

    v_base_price := public.pos_resolve_item_list_price(
      p_tenant_id,
      v_menu_item_id,
      p_order_type,
      v_platform
    );

    v_variant_adj := 0;
    IF v_variant_id IS NOT NULL THEN
      SELECT price_adjustment INTO v_variant_adj
        FROM public.menu_item_variants
       WHERE id = v_variant_id AND item_id = v_menu_item_id AND tenant_id = p_tenant_id AND is_active = TRUE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant % not found or inactive', v_variant_id USING ERRCODE = 'P0002';
      END IF;
    END IF;

    v_modifier_sum := public.pos_order_modifier_sum(
      p_tenant_id,
      v_menu_item_id,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB)
    );

    SELECT sides_sum, enriched_sides
      INTO v_sides_sum, v_enriched_sides
      FROM public.pos_enrich_order_sides(
        p_tenant_id,
        v_menu_item_id,
        COALESCE(v_item -> 'sides', '[]'::JSONB),
        p_order_type,
        v_platform
      );

    v_unit_price    := v_base_price + v_variant_adj + v_modifier_sum + COALESCE(v_sides_sum, 0);
    v_item_subtotal := v_unit_price * v_quantity;
    v_subtotal      := v_subtotal + v_item_subtotal;

    INSERT INTO public.order_items (
      tenant_id, order_id, menu_item_id, variant_id,
      item_name, variant_name, quantity, unit_price,
      modifiers, sides, subtotal, note,
      discount_type, discount_value, discount_note
    )
    VALUES (
      p_tenant_id, v_order_id, v_menu_item_id, v_variant_id,
      v_item ->> 'item_name', v_item ->> 'variant_name',
      v_quantity, v_unit_price,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB),
      COALESCE(v_enriched_sides, '[]'::JSONB),
      v_item_subtotal, v_item ->> 'note',
      NULLIF(v_item ->> 'discount_type', ''),
      CASE WHEN NULLIF(v_item ->> 'discount_value', '') IS NOT NULL
           THEN (v_item ->> 'discount_value')::NUMERIC
           ELSE NULL END,
      NULLIF(trim(COALESCE(v_item ->> 'discount_note', '')), '')
    );
  END LOOP;

  UPDATE public.orders
     SET subtotal = v_subtotal, total_amount = v_subtotal
   WHERE id = v_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by
  )
  VALUES (p_tenant_id, v_order_id, NULL, 'new', v_created_by);

  IF p_order_type = 'dine_in' AND p_table_id IS NOT NULL THEN
    UPDATE public.tables
       SET status = 'occupied'
     WHERE id = p_table_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update table status' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  PERFORM public.route_order_to_kds(v_order_id);

  SELECT COALESCE(o.item_discount_amount, 0) INTO v_item_discount
    FROM public.orders o WHERE o.id = v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'item_discount_amount', v_item_discount
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_order_with_daily_limit_hold(p_tenant_id bigint, p_branch_id bigint, p_created_by uuid, p_items jsonb, p_order_type text DEFAULT 'dine_in'::text, p_table_id bigint DEFAULT NULL::bigint, p_pos_session_id bigint DEFAULT NULL::bigint, p_note text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid, p_daily_limit_hold_token uuid DEFAULT NULL::uuid, p_delivery_platform text DEFAULT NULL::text, p_external_order_ref text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_is_service boolean := COALESCE(auth.role() = 'service_role', false);
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_order_id bigint;
BEGIN
  IF v_uid IS NULL AND v_is_service THEN
    v_uid := p_created_by;
  END IF;

  IF p_daily_limit_hold_token IS NOT NULL THEN
    PERFORM set_config(
      'comtammatu.daily_limit_hold_token',
      p_daily_limit_hold_token::text,
      true
    );
  END IF;

  v_result := public.create_order(
    p_tenant_id,
    p_branch_id,
    p_created_by,
    p_items,
    p_order_type,
    p_table_id,
    p_pos_session_id,
    p_note,
    p_idempotency_key,
    p_delivery_platform,
    p_external_order_ref
  );

  v_order_id := NULLIF(v_result ->> 'order_id', '')::bigint;

  IF p_daily_limit_hold_token IS NOT NULL AND v_order_id IS NOT NULL THEN
    UPDATE public.branch_menu_item_daily_holds h
    SET committed_at = COALESCE(h.committed_at, now()),
        order_id = COALESCE(h.order_id, v_order_id),
        updated_at = now()
    WHERE h.tenant_id = p_tenant_id
      AND h.branch_id = p_branch_id
      AND h.hold_token = p_daily_limit_hold_token
      AND (v_uid IS NULL OR h.held_by = v_uid)
      AND h.committed_at IS NULL
      AND h.released_at IS NULL
      AND h.expires_at > now();
  END IF;

  RETURN v_result;
END;
$function$;
