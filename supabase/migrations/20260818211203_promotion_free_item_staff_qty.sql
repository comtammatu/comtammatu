-- free_item: staff picks 1..max units; NULL free_item_qty = no campaign cap.

ALTER TABLE public.promotions
  DROP CONSTRAINT IF EXISTS promotions_kind_fields_check;

ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_kind_fields_check CHECK (
    (
      kind = 'order_pct'
      AND discount_type = 'pct'
      AND discount_value IS NOT NULL
      AND discount_value > 0
    )
    OR (
      kind IN ('order_vnd', 'voucher_face', 'auto_order')
      AND discount_type IN ('pct', 'vnd')
      AND discount_value IS NOT NULL
      AND discount_value > 0
    )
    OR (
      kind = 'bxgy'
      AND bxgy_buy_qty IS NOT NULL
      AND bxgy_get_qty IS NOT NULL
      AND bxgy_buy_qty >= 1
      AND bxgy_get_qty >= 1
    )
    OR (
      kind = 'free_side'
      AND free_side_qty IS NOT NULL
      AND free_side_qty >= 1
      AND (allow_code OR allow_auto)
    )
    OR (
      kind = 'free_item'
      AND (free_item_qty IS NULL OR free_item_qty >= 1)
      AND allow_code IS TRUE
      AND allow_auto IS NOT TRUE
    )
  );

COMMENT ON COLUMN public.promotions.free_item_qty IS
  'free_item: optional max units per order. NULL = staff may pick any count up to eligible qty on the bill.';

CREATE OR REPLACE FUNCTION public.promotion_free_item_needs_manual_selection(
  p_candidates jsonb
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_array_length(COALESCE(p_candidates, '[]'::jsonb)), 0) >= 1;
$$;

CREATE OR REPLACE FUNCTION public.promotion_free_item_offer_json(
  p_order public.orders,
  p_promo public.promotions
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_candidates jsonb;
  v_cap integer;
  v_quota integer;
  v_code text;
BEGIN
  v_candidates := public.promotion_free_item_candidates(p_order, p_promo);
  v_cap := public.promotion_free_item_capacity(v_candidates);
  v_quota := LEAST(COALESCE(p_promo.free_item_qty, v_cap), v_cap);
  IF v_quota < 1
     OR jsonb_array_length(v_candidates) < 1
  THEN
    RETURN NULL;
  END IF;

  v_code := NULL;
  IF p_promo.allow_code IS TRUE THEN
    SELECT pc.code INTO v_code
    FROM public.promotion_codes pc
    WHERE pc.promotion_id = p_promo.id
      AND pc.kind = 'reusable'
      AND pc.status = 'active'
    ORDER BY pc.id
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'promotion_id', p_promo.id,
    'name', p_promo.name,
    'kind', 'free_item',
    'free_qty', v_quota,
    'candidates', v_candidates,
    'amount_hint', 0,
    'needs_side_selection', true,
    'allow_code', p_promo.allow_code,
    'allow_auto', false,
    'code', v_code
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.promotion_apply_free_item_core(
  p_order public.orders,
  p_promo public.promotions,
  p_code public.promotion_codes,
  p_selections jsonb,
  p_uid uuid
) RETURNS numeric
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_candidates jsonb;
  v_cap integer;
  v_quota integer;
  v_sel jsonb;
  v_units integer;
  v_sum_units integer := 0;
  v_amount numeric := 0;
  v_seen jsonb := '{}'::jsonb;
  v_line_amounts jsonb := '{}'::jsonb;
  v_cand jsonb;
  v_key text;
  v_line_max integer;
  v_price numeric;
  v_order_item_id bigint;
  v_side_item_id bigint;
  v_line_amount numeric;
  v_ids bigint[] := ARRAY[]::bigint[];
  v_note text;
  v_item_id text;
  v_code_id bigint;
  v_effective jsonb;
BEGIN
  IF p_promo.kind IS DISTINCT FROM 'free_item' THEN
    RAISE EXCEPTION 'promotion_kind_mismatch' USING ERRCODE = '22023';
  END IF;

  v_candidates := public.promotion_free_item_candidates(p_order, p_promo);
  v_cap := public.promotion_free_item_capacity(v_candidates);
  v_quota := LEAST(COALESCE(p_promo.free_item_qty, v_cap), v_cap);
  IF jsonb_array_length(v_candidates) < 1 OR v_quota < 1 THEN
    RAISE EXCEPTION 'promotion_not_eligible' USING ERRCODE = '22023';
  END IF;

  IF p_selections IS NULL
     OR jsonb_typeof(p_selections) <> 'array'
     OR jsonb_array_length(p_selections) = 0 THEN
    RAISE EXCEPTION 'promotion_item_selection_required' USING ERRCODE = '22023';
  END IF;
  v_effective := p_selections;

  IF p_promo.stack_with_item_discount IS FALSE THEN
    IF EXISTS (
      SELECT 1
      FROM public.order_items oi
      WHERE oi.order_id = p_order.id
        AND oi.status <> 'cancelled'
        AND COALESCE(oi.discount_amount, 0) > 0
    ) THEN
      RAISE EXCEPTION 'promotion_item_discount_blocked' USING ERRCODE = '22023';
    END IF;
  END IF;

  FOR v_sel IN SELECT * FROM jsonb_array_elements(v_effective)
  LOOP
    v_order_item_id := NULLIF(v_sel ->> 'order_item_id', '')::bigint;
    v_side_item_id := NULLIF(v_sel ->> 'side_item_id', '')::bigint;
    v_units := COALESCE(NULLIF(v_sel ->> 'units', '')::integer, 0);
    IF v_order_item_id IS NULL OR v_units < 1 THEN
      RAISE EXCEPTION 'promotion_item_selection_invalid' USING ERRCODE = '22023';
    END IF;
    v_cand := NULL;
    SELECT value INTO v_cand
    FROM jsonb_array_elements(v_candidates) AS t(value)
    WHERE (value ->> 'order_item_id')::bigint = v_order_item_id
      AND (
        v_side_item_id IS NULL
        OR (value ->> 'side_item_id')::bigint = v_side_item_id
      )
    LIMIT 1;
    IF v_cand IS NULL THEN
      RAISE EXCEPTION 'promotion_item_selection_invalid' USING ERRCODE = '22023';
    END IF;
    v_line_max := (v_cand ->> 'max_units')::integer;
    v_price := (v_cand ->> 'unit_price')::numeric;
    v_key := v_order_item_id::text;
    IF v_seen ? v_key THEN
      RAISE EXCEPTION 'promotion_item_selection_invalid' USING ERRCODE = '22023';
    END IF;
    IF v_units > v_line_max THEN
      RAISE EXCEPTION 'promotion_item_selection_invalid' USING ERRCODE = '22023';
    END IF;
    v_seen := v_seen || jsonb_build_object(v_key, v_units);
    v_sum_units := v_sum_units + v_units;
    v_line_amount := v_units * v_price;
    v_amount := v_amount + v_line_amount;
    v_line_amounts := jsonb_set(
      v_line_amounts,
      ARRAY[v_order_item_id::text],
      to_jsonb(v_line_amount),
      true
    );
  END LOOP;

  IF v_sum_units < 1 OR v_sum_units > v_quota THEN
    RAISE EXCEPTION 'promotion_item_selection_qty' USING ERRCODE = '22023';
  END IF;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'discount_zero_amount' USING ERRCODE = '22023';
  END IF;

  v_note := p_promo.name;
  v_code_id := NULL;
  IF p_code IS NOT NULL AND p_code.id IS NOT NULL THEN
    v_note := p_promo.name || ' · ' || p_code.code;
    v_code_id := p_code.id;
  END IF;

  FOR v_item_id IN SELECT key FROM jsonb_each_text(v_line_amounts)
  LOOP
    v_order_item_id := v_item_id::bigint;
    v_line_amount := (v_line_amounts ->> v_item_id)::numeric;
    UPDATE public.order_items
    SET
      discount_type = 'vnd',
      discount_value = v_line_amount,
      discount_note = v_note,
      updated_at = now()
    WHERE id = v_order_item_id AND order_id = p_order.id;
    v_ids := array_append(v_ids, v_order_item_id);
  END LOOP;

  INSERT INTO public.promotion_redemptions (
    tenant_id, promotion_id, code_id, order_id, branch_id,
    applied_amount, applied_as, snapshot, status, redeemed_by
  ) VALUES (
    p_order.tenant_id, p_promo.id, v_code_id, p_order.id, p_order.branch_id,
    v_amount, 'item',
    jsonb_build_object(
      'name', p_promo.name,
      'kind', 'free_item',
      'item_ids', to_jsonb(v_ids),
      'selections', v_effective
    ),
    'applied', p_uid
  );

  UPDATE public.orders
  SET
    promotion_id = p_promo.id,
    promotion_code_id = v_code_id,
    discount_note = v_note,
    updated_at = now()
  WHERE id = p_order.id;

  RETURN v_amount;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_promotion(
  p_id bigint,
  p_name text,
  p_kind text,
  p_status text,
  p_discount_type text,
  p_discount_value numeric,
  p_min_subtotal numeric,
  p_max_discount_amount numeric,
  p_stack_with_item_discount boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_time_windows jsonb,
  p_service_modes text[],
  p_bxgy_buy_qty integer,
  p_bxgy_get_qty integer,
  p_branch_ids bigint[],
  p_items jsonb,
  p_reusable_code text,
  p_free_side_qty integer DEFAULT NULL,
  p_allow_code boolean DEFAULT true,
  p_allow_auto boolean DEFAULT false,
  p_free_item_qty integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_tenant bigint;
  v_id bigint;
  v_code text;
  v_item jsonb;
  v_allow_code boolean;
  v_allow_auto boolean;
  v_has_buy boolean;
  v_has_get boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(NULL::bigint, 'promo:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT p.tenant_id INTO v_tenant FROM public.profiles p WHERE p.id = v_uid;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  v_allow_code := COALESCE(p_allow_code, true);
  v_allow_auto := COALESCE(p_allow_auto, false);
  IF p_kind = 'free_item' THEN
    v_allow_code := true;
    v_allow_auto := false;
    IF p_free_item_qty IS NOT NULL AND p_free_item_qty < 1 THEN
      RAISE EXCEPTION 'promotion_free_item_qty_required' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_kind = 'free_side' THEN
    IF NOT (v_allow_code OR v_allow_auto) THEN
      RAISE EXCEPTION 'promotion_activation_required' USING ERRCODE = '22023';
    END IF;
    IF p_free_side_qty IS NULL OR p_free_side_qty < 1 THEN
      RAISE EXCEPTION 'promotion_free_side_qty_required' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.promotions (
      tenant_id, name, status, kind, discount_type, discount_value,
      min_subtotal, max_discount_amount, stack_with_item_discount,
      starts_at, ends_at, time_windows, service_modes,
      bxgy_buy_qty, bxgy_get_qty, free_side_qty, free_item_qty,
      allow_code, allow_auto, created_by
    ) VALUES (
      v_tenant, btrim(p_name), COALESCE(p_status, 'draft'), p_kind,
      p_discount_type, p_discount_value,
      COALESCE(p_min_subtotal, 0), p_max_discount_amount,
      COALESCE(p_stack_with_item_discount, true),
      p_starts_at, p_ends_at, COALESCE(p_time_windows, '[]'::jsonb),
      COALESCE(p_service_modes, ARRAY['dine_in', 'takeaway']::text[]),
      p_bxgy_buy_qty, p_bxgy_get_qty,
      CASE WHEN p_kind = 'free_side' THEN p_free_side_qty ELSE NULL END,
      CASE WHEN p_kind = 'free_item' THEN p_free_item_qty ELSE NULL END,
      v_allow_code, v_allow_auto, v_uid
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.promotions
    SET
      name = btrim(p_name),
      status = COALESCE(p_status, status),
      kind = p_kind,
      discount_type = p_discount_type,
      discount_value = p_discount_value,
      min_subtotal = COALESCE(p_min_subtotal, 0),
      max_discount_amount = p_max_discount_amount,
      stack_with_item_discount = COALESCE(p_stack_with_item_discount, true),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      time_windows = COALESCE(p_time_windows, '[]'::jsonb),
      service_modes = COALESCE(p_service_modes, ARRAY['dine_in', 'takeaway']::text[]),
      bxgy_buy_qty = p_bxgy_buy_qty,
      bxgy_get_qty = p_bxgy_get_qty,
      free_side_qty = CASE WHEN p_kind = 'free_side' THEN p_free_side_qty ELSE NULL END,
      free_item_qty = CASE WHEN p_kind = 'free_item' THEN p_free_item_qty ELSE NULL END,
      allow_code = v_allow_code,
      allow_auto = v_allow_auto,
      updated_at = now()
    WHERE id = p_id AND tenant_id = v_tenant
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'promotion not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  DELETE FROM public.promotion_branches WHERE promotion_id = v_id;
  IF p_branch_ids IS NOT NULL THEN
    INSERT INTO public.promotion_branches (promotion_id, branch_id, tenant_id)
    SELECT v_id, b.id, v_tenant
    FROM public.branches b
    WHERE b.tenant_id = v_tenant
      AND b.id = ANY (p_branch_ids)
      AND b.branch_kind = 'branch';
  END IF;

  DELETE FROM public.promotion_items WHERE promotion_id = v_id;
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.promotion_items (promotion_id, menu_item_id, tenant_id, item_role)
      VALUES (
        v_id,
        (v_item ->> 'menu_item_id')::bigint,
        v_tenant,
        COALESCE(v_item ->> 'item_role', 'eligible')
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  IF p_kind = 'free_side' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.promotion_items
      WHERE promotion_id = v_id AND item_role = 'buy'
    ), EXISTS (
      SELECT 1 FROM public.promotion_items
      WHERE promotion_id = v_id AND item_role = 'get'
    )
    INTO v_has_buy, v_has_get;
    IF NOT v_has_buy OR NOT v_has_get THEN
      RAISE EXCEPTION 'promotion_free_side_items_required' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_kind = 'free_item' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.promotion_items
      WHERE promotion_id = v_id AND item_role = 'get'
    )
    INTO v_has_get;
    IF NOT v_has_get THEN
      RAISE EXCEPTION 'promotion_free_item_items_required' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_code := public.promotion_normalize_code(p_reusable_code);
  IF p_kind IN ('order_pct', 'order_vnd')
     OR (p_kind = 'free_side' AND v_allow_code)
     OR p_kind = 'free_item'
  THEN
    IF v_code = '' THEN
      RAISE EXCEPTION 'promotion_reusable_code_required' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.promotion_codes (
      tenant_id, promotion_id, code, kind, max_redemptions, status
    ) VALUES (
      v_tenant, v_id, v_code, 'reusable', 1000000, 'active'
    )
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET
      promotion_id = EXCLUDED.promotion_id,
      status = 'active',
      kind = 'reusable',
      voided_at = NULL,
      void_reason = NULL
    WHERE public.promotion_codes.kind = 'reusable';

    UPDATE public.promotion_codes
    SET
      status = 'void',
      voided_at = COALESCE(voided_at, now()),
      void_reason = COALESCE(void_reason, 'replaced_by_code_rotation')
    WHERE promotion_id = v_id
      AND tenant_id = v_tenant
      AND kind = 'reusable'
      AND status = 'active'
      AND code <> v_code;
  END IF;

  RETURN jsonb_build_object('id', v_id);
END;
$$;


REVOKE ALL ON FUNCTION public.upsert_promotion(
  bigint, text, text, text, text, numeric, numeric, numeric, boolean,
  timestamptz, timestamptz, jsonb, text[], integer, integer, bigint[], jsonb, text,
  integer, boolean, boolean, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_promotion(
  bigint, text, text, text, text, numeric, numeric, numeric, boolean,
  timestamptz, timestamptz, jsonb, text[], integer, integer, bigint[], jsonb, text,
  integer, boolean, boolean, integer
) TO authenticated, service_role;
