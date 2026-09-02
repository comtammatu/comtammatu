-- ADR 0039 amend: free_side kind, activation flags, staff side selection.

-- ── Schema ──

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS free_side_qty integer,
  ADD COLUMN IF NOT EXISTS allow_code boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_auto boolean NOT NULL DEFAULT false;

ALTER TABLE public.promotions
  DROP CONSTRAINT IF EXISTS promotions_kind_check;

ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_kind_check CHECK (
    kind IN (
      'order_pct',
      'order_vnd',
      'voucher_face',
      'auto_order',
      'bxgy',
      'free_side'
    )
  );

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
  );

COMMENT ON COLUMN public.promotions.free_side_qty IS
  'free_side: number of side portions to comp per order redemption.';
COMMENT ON COLUMN public.promotions.allow_code IS
  'When true, cashiers may redeem via promo code (required path for order_pct/order_vnd).';
COMMENT ON COLUMN public.promotions.allow_auto IS
  'When true, evaluate_order_promotions may surface an offer (free_side) or apply auto_order/bxgy.';

-- ── Helpers ──

CREATE OR REPLACE FUNCTION public.promotion_free_side_candidates(
  p_order public.orders,
  p_promo public.promotions
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_item record;
  v_side jsonb;
  v_side_id bigint;
  v_side_qty integer;
  v_price numeric;
  v_max integer;
  v_name text;
BEGIN
  IF p_promo.kind IS DISTINCT FROM 'free_side' THEN
    RETURN v_out;
  END IF;

  FOR v_item IN
    SELECT oi.id, oi.item_name, oi.quantity, oi.menu_item_id, oi.sides
    FROM public.order_items oi
    WHERE oi.order_id = p_order.id
      AND oi.status <> 'cancelled'
      AND EXISTS (
        SELECT 1
        FROM public.promotion_items pi
        WHERE pi.promotion_id = p_promo.id
          AND pi.menu_item_id = oi.menu_item_id
          AND pi.item_role = 'buy'
      )
  LOOP
    IF v_item.sides IS NULL OR jsonb_typeof(v_item.sides) <> 'array' THEN
      CONTINUE;
    END IF;
    FOR v_side IN SELECT * FROM jsonb_array_elements(v_item.sides)
    LOOP
      v_side_id := NULLIF(v_side ->> 'side_item_id', '')::bigint;
      IF v_side_id IS NULL THEN
        CONTINUE;
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.promotion_items pi
        WHERE pi.promotion_id = p_promo.id
          AND pi.menu_item_id = v_side_id
          AND pi.item_role = 'get'
      ) THEN
        CONTINUE;
      END IF;
      v_side_qty := GREATEST(COALESCE(NULLIF(v_side ->> 'quantity', '')::integer, 1), 1);
      v_price := GREATEST(COALESCE(NULLIF(v_side ->> 'price', '')::numeric, 0), 0);
      IF v_price <= 0 THEN
        CONTINUE;
      END IF;
      v_max := v_side_qty * GREATEST(v_item.quantity, 1);
      v_name := COALESCE(NULLIF(btrim(v_side ->> 'name'), ''), 'Ăn kèm');
      v_out := v_out || jsonb_build_array(
        jsonb_build_object(
          'order_item_id', v_item.id,
          'side_item_id', v_side_id,
          'name', v_name,
          'unit_price', v_price,
          'max_units', v_max,
          'parent_name', COALESCE(v_item.item_name, '')
        )
      );
    END LOOP;
  END LOOP;

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.promotion_free_side_offer_json(
  p_order public.orders,
  p_promo public.promotions
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_candidates jsonb;
  v_hint numeric := 0;
  v_need integer;
  v_row jsonb;
  v_take integer;
  v_left integer;
BEGIN
  v_candidates := public.promotion_free_side_candidates(p_order, p_promo);
  IF jsonb_array_length(v_candidates) < 1 THEN
    RETURN NULL;
  END IF;
  v_need := COALESCE(p_promo.free_side_qty, 0);
  IF v_need < 1 THEN
    RETURN NULL;
  END IF;

  -- Amount hint: cheapest units first (display only; staff still selects).
  v_left := v_need;
  FOR v_row IN
    SELECT value
    FROM jsonb_array_elements(v_candidates) AS t(value)
    ORDER BY (value ->> 'unit_price')::numeric ASC,
             (value ->> 'order_item_id')::bigint ASC,
             (value ->> 'side_item_id')::bigint ASC
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_left, GREATEST((v_row ->> 'max_units')::integer, 0));
    v_hint := v_hint + v_take * (v_row ->> 'unit_price')::numeric;
    v_left := v_left - v_take;
  END LOOP;
  IF v_left > 0 THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'promotion_id', p_promo.id,
    'name', p_promo.name,
    'kind', 'free_side',
    'free_qty', v_need,
    'candidates', v_candidates,
    'amount_hint', v_hint,
    'allow_code', p_promo.allow_code,
    'allow_auto', p_promo.allow_auto
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.promotion_apply_free_side_core(
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
  v_need integer;
  v_sel jsonb;
  v_units integer;
  v_sum_units integer := 0;
  v_amount numeric := 0;
  v_seen jsonb := '{}'::jsonb;
  v_line_amounts jsonb := '{}'::jsonb;
  v_cand jsonb;
  v_key text;
  v_max integer;
  v_price numeric;
  v_order_item_id bigint;
  v_side_item_id bigint;
  v_line_amount numeric;
  v_ids bigint[] := ARRAY[]::bigint[];
  v_note text;
  v_item_id text;
  v_code_id bigint;
BEGIN
  IF p_promo.kind IS DISTINCT FROM 'free_side' THEN
    RAISE EXCEPTION 'promotion_kind_mismatch' USING ERRCODE = '22023';
  END IF;
  v_need := COALESCE(p_promo.free_side_qty, 0);
  IF v_need < 1 THEN
    RAISE EXCEPTION 'promotion_not_eligible' USING ERRCODE = '22023';
  END IF;
  IF p_selections IS NULL OR jsonb_typeof(p_selections) <> 'array' THEN
    RAISE EXCEPTION 'promotion_side_selection_required' USING ERRCODE = '22023';
  END IF;

  v_candidates := public.promotion_free_side_candidates(p_order, p_promo);
  IF jsonb_array_length(v_candidates) < 1 THEN
    RAISE EXCEPTION 'promotion_not_eligible' USING ERRCODE = '22023';
  END IF;

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

  FOR v_sel IN SELECT * FROM jsonb_array_elements(p_selections)
  LOOP
    v_order_item_id := NULLIF(v_sel ->> 'order_item_id', '')::bigint;
    v_side_item_id := NULLIF(v_sel ->> 'side_item_id', '')::bigint;
    v_units := COALESCE(NULLIF(v_sel ->> 'units', '')::integer, 0);
    IF v_order_item_id IS NULL OR v_side_item_id IS NULL OR v_units < 1 THEN
      RAISE EXCEPTION 'promotion_side_selection_invalid' USING ERRCODE = '22023';
    END IF;
    v_cand := NULL;
    SELECT value INTO v_cand
    FROM jsonb_array_elements(v_candidates) AS t(value)
    WHERE (value ->> 'order_item_id')::bigint = v_order_item_id
      AND (value ->> 'side_item_id')::bigint = v_side_item_id
    LIMIT 1;
    IF v_cand IS NULL THEN
      RAISE EXCEPTION 'promotion_side_selection_invalid' USING ERRCODE = '22023';
    END IF;
    v_max := (v_cand ->> 'max_units')::integer;
    v_price := (v_cand ->> 'unit_price')::numeric;
    v_key := v_order_item_id::text || ':' || v_side_item_id::text;
    IF v_seen ? v_key THEN
      RAISE EXCEPTION 'promotion_side_selection_invalid' USING ERRCODE = '22023';
    END IF;
    IF v_units > v_max THEN
      RAISE EXCEPTION 'promotion_side_selection_invalid' USING ERRCODE = '22023';
    END IF;
    v_seen := v_seen || jsonb_build_object(v_key, v_units);
    v_sum_units := v_sum_units + v_units;
    v_line_amount := v_units * v_price;
    v_amount := v_amount + v_line_amount;
    v_line_amounts := jsonb_set(
      v_line_amounts,
      ARRAY[v_order_item_id::text],
      to_jsonb(
        COALESCE((v_line_amounts ->> v_order_item_id::text)::numeric, 0) + v_line_amount
      ),
      true
    );
  END LOOP;

  IF v_sum_units IS DISTINCT FROM v_need THEN
    RAISE EXCEPTION 'promotion_side_selection_qty' USING ERRCODE = '22023';
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
      'kind', 'free_side',
      'item_ids', to_jsonb(v_ids),
      'selections', p_selections
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

-- ── upsert_promotion (extended signature) ──

DROP FUNCTION IF EXISTS public.upsert_promotion(
  bigint, text, text, text, text, numeric, numeric, numeric, boolean,
  timestamptz, timestamptz, jsonb, text[], integer, integer, bigint[], jsonb, text
);

CREATE FUNCTION public.upsert_promotion(
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
  p_allow_auto boolean DEFAULT false
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
      bxgy_buy_qty, bxgy_get_qty, free_side_qty, allow_code, allow_auto, created_by
    ) VALUES (
      v_tenant, btrim(p_name), COALESCE(p_status, 'draft'), p_kind,
      p_discount_type, p_discount_value,
      COALESCE(p_min_subtotal, 0), p_max_discount_amount,
      COALESCE(p_stack_with_item_discount, true),
      p_starts_at, p_ends_at, COALESCE(p_time_windows, '[]'::jsonb),
      COALESCE(p_service_modes, ARRAY['dine_in', 'takeaway']::text[]),
      p_bxgy_buy_qty, p_bxgy_get_qty,
      CASE WHEN p_kind = 'free_side' THEN p_free_side_qty ELSE NULL END,
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

  v_code := public.promotion_normalize_code(p_reusable_code);
  IF p_kind IN ('order_pct', 'order_vnd')
     OR (p_kind = 'free_side' AND v_allow_code)
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
  integer, boolean, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_promotion(
  bigint, text, text, text, text, numeric, numeric, numeric, boolean,
  timestamptz, timestamptz, jsonb, text[], integer, integer, bigint[], jsonb, text,
  integer, boolean, boolean
) TO authenticated, service_role;

-- ── preview / apply code ──

CREATE OR REPLACE FUNCTION public.preview_promotion_code(p_order_id bigint, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_prof_tenant bigint;
  v_order public.orders;
  v_code public.promotion_codes;
  v_promo public.promotions;
  v_base numeric;
  v_amount numeric;
  v_norm text;
  v_offer jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  SELECT p.tenant_id INTO v_prof_tenant FROM public.profiles p WHERE p.id = v_uid;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_norm := public.promotion_normalize_code(p_code);
  SELECT * INTO v_code FROM public.promotion_codes
  WHERE tenant_id = v_order.tenant_id AND code = v_norm;
  IF NOT FOUND OR v_code.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'promotion_code_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_promo FROM public.promotions WHERE id = v_code.promotion_id;
  IF v_promo.kind = 'free_side' AND v_promo.allow_code IS NOT TRUE THEN
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
  IF v_code.kind = 'unique' AND v_code.redeemed_count >= v_code.max_redemptions THEN
    RAISE EXCEPTION 'promotion_code_spent' USING ERRCODE = '22023';
  END IF;

  IF v_promo.kind = 'free_side' THEN
    v_offer := public.promotion_free_side_offer_json(v_order, v_promo);
    IF v_offer IS NULL THEN
      RAISE EXCEPTION 'promotion_not_eligible' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'promotion_id', v_promo.id,
      'name', v_promo.name,
      'code', v_code.code,
      'kind', v_promo.kind,
      'amount', COALESCE((v_offer ->> 'amount_hint')::numeric, 0),
      'needs_side_selection', true,
      'free_qty', v_offer -> 'free_qty',
      'candidates', v_offer -> 'candidates',
      'amount_hint', v_offer -> 'amount_hint'
    );
  END IF;

  v_amount := public.promotion_order_amount(v_promo, v_code, v_base);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'discount_zero_amount' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'promotion_id', v_promo.id,
    'name', v_promo.name,
    'code', v_code.code,
    'kind', v_promo.kind,
    'amount', v_amount,
    'needs_side_selection', false
  );
END;
$$;

DROP FUNCTION IF EXISTS public.apply_promotion_code(bigint, text);

CREATE FUNCTION public.apply_promotion_code(
  p_order_id bigint,
  p_code text,
  p_side_selections jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_prof_tenant bigint;
  v_order public.orders;
  v_code public.promotion_codes;
  v_promo public.promotions;
  v_base numeric;
  v_amount numeric;
  v_norm text;
  v_note text;
  v_totals record;
  v_empty_code public.promotion_codes;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  SELECT p.tenant_id INTO v_prof_tenant FROM public.profiles p WHERE p.id = v_uid;

  PERFORM pg_advisory_xact_lock(p_order_id);
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM public.promotion_assert_order_mutable(v_order);
  IF v_order.promotion_id IS NOT NULL THEN
    RAISE EXCEPTION 'promotion_already_applied' USING ERRCODE = '22023';
  END IF;
  IF v_order.discount_type IS NOT NULL AND COALESCE(v_order.order_discount_amount, 0) > 0 THEN
    RAISE EXCEPTION 'manual_discount_present' USING ERRCODE = '22023';
  END IF;

  v_norm := public.promotion_normalize_code(p_code);
  SELECT * INTO v_code FROM public.promotion_codes
  WHERE tenant_id = v_order.tenant_id AND code = v_norm
  FOR UPDATE;
  IF NOT FOUND OR v_code.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'promotion_code_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_promo FROM public.promotions WHERE id = v_code.promotion_id;
  IF v_promo.kind = 'free_side' AND v_promo.allow_code IS NOT TRUE THEN
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

  IF v_promo.kind = 'free_side' THEN
    v_empty_code := v_code;
    v_amount := public.promotion_apply_free_side_core(
      v_order, v_promo, v_empty_code, p_side_selections, v_uid
    );
  ELSE
    v_amount := public.promotion_order_amount(v_promo, v_code, v_base);
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'discount_zero_amount' USING ERRCODE = '22023';
    END IF;
    v_note := v_promo.name || ' · ' || v_code.code;
    PERFORM public.promotion_apply_to_order(v_order, v_promo, v_code, v_amount, v_note, v_uid);
  END IF;

  UPDATE public.promotion_codes
  SET
    redeemed_count = redeemed_count + 1,
    status = CASE
      WHEN kind = 'unique' OR redeemed_count + 1 >= max_redemptions THEN 'redeemed'
      ELSE status
    END
  WHERE id = v_code.id;

  SELECT order_discount_amount, discount_amount, total_amount
  INTO v_totals FROM public.orders WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'promotion_id', v_promo.id,
    'code', v_code.code,
    'name', v_promo.name,
    'discount_amount', v_totals.order_discount_amount,
    'total_discount_amount', v_totals.discount_amount,
    'total_amount', v_totals.total_amount,
    'applied_amount', v_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_promotion_code(bigint, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_promotion_code(bigint, text, jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_free_side_selection(
  p_order_id bigint,
  p_promotion_id bigint,
  p_code text,
  p_selections jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_prof_tenant bigint;
  v_order public.orders;
  v_promo public.promotions;
  v_code public.promotion_codes;
  v_norm text;
  v_base numeric;
  v_amount numeric;
  v_totals record;
  v_empty public.promotion_codes;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  SELECT p.tenant_id INTO v_prof_tenant FROM public.profiles p WHERE p.id = v_uid;

  PERFORM pg_advisory_xact_lock(p_order_id);
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM public.promotion_assert_order_mutable(v_order);
  IF v_order.promotion_id IS NOT NULL THEN
    RAISE EXCEPTION 'promotion_already_applied' USING ERRCODE = '22023';
  END IF;
  IF v_order.discount_type IS NOT NULL AND COALESCE(v_order.order_discount_amount, 0) > 0 THEN
    RAISE EXCEPTION 'manual_discount_present' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_promo
  FROM public.promotions
  WHERE id = p_promotion_id AND tenant_id = v_order.tenant_id;
  IF NOT FOUND OR v_promo.kind IS DISTINCT FROM 'free_side' THEN
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

  v_empty := NULL;
  IF NULLIF(btrim(COALESCE(p_code, '')), '') IS NOT NULL THEN
    IF v_promo.allow_code IS NOT TRUE THEN
      RAISE EXCEPTION 'promotion_not_eligible' USING ERRCODE = '22023';
    END IF;
    v_norm := public.promotion_normalize_code(p_code);
    SELECT * INTO v_code FROM public.promotion_codes
    WHERE tenant_id = v_order.tenant_id AND code = v_norm
    FOR UPDATE;
    IF NOT FOUND OR v_code.status IS DISTINCT FROM 'active'
       OR v_code.promotion_id IS DISTINCT FROM v_promo.id
    THEN
      RAISE EXCEPTION 'promotion_code_invalid' USING ERRCODE = '22023';
    END IF;
    IF v_code.redeemed_count >= v_code.max_redemptions THEN
      RAISE EXCEPTION 'promotion_code_spent' USING ERRCODE = '22023';
    END IF;
    v_amount := public.promotion_apply_free_side_core(
      v_order, v_promo, v_code, p_selections, v_uid
    );
    UPDATE public.promotion_codes
    SET
      redeemed_count = redeemed_count + 1,
      status = CASE
        WHEN kind = 'unique' OR redeemed_count + 1 >= max_redemptions THEN 'redeemed'
        ELSE status
      END
    WHERE id = v_code.id;
  ELSE
    IF v_promo.allow_auto IS NOT TRUE THEN
      RAISE EXCEPTION 'promotion_not_eligible' USING ERRCODE = '22023';
    END IF;
    v_amount := public.promotion_apply_free_side_core(
      v_order, v_promo, v_empty, p_selections, v_uid
    );
  END IF;

  SELECT order_discount_amount, discount_amount, total_amount
  INTO v_totals FROM public.orders WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'promotion_id', v_promo.id,
    'name', v_promo.name,
    'applied_amount', v_amount,
    'discount_amount', v_totals.order_discount_amount,
    'total_discount_amount', v_totals.discount_amount,
    'total_amount', v_totals.total_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_free_side_selection(bigint, bigint, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_free_side_selection(bigint, bigint, text, jsonb)
  TO authenticated, service_role;

-- ── clear_promotion: also free_side item discounts ──

CREATE OR REPLACE FUNCTION public.clear_promotion(p_order_id bigint, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_prof_tenant bigint;
  v_order public.orders;
  v_reason text;
  v_code public.promotion_codes;
  v_promo public.promotions;
  v_snap jsonb;
  v_item_id bigint;
  v_totals record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  v_reason := btrim(COALESCE(p_reason, ''));
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'discount_note_required' USING ERRCODE = '22023';
  END IF;
  SELECT p.tenant_id INTO v_prof_tenant FROM public.profiles p WHERE p.id = v_uid;

  PERFORM pg_advisory_xact_lock(p_order_id);
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM public.promotion_assert_order_mutable(v_order);
  IF v_order.promotion_id IS NULL THEN
    RAISE EXCEPTION 'promotion_not_applied' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_promo FROM public.promotions WHERE id = v_order.promotion_id;
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

  SELECT snapshot INTO v_snap
  FROM public.promotion_redemptions
  WHERE order_id = p_order_id AND status = 'applied'
  ORDER BY id DESC LIMIT 1;

  IF v_promo.kind IN ('bxgy', 'free_side') AND v_snap ? 'item_ids' THEN
    FOR v_item_id IN SELECT jsonb_array_elements_text(v_snap -> 'item_ids')::bigint
    LOOP
      UPDATE public.order_items
      SET discount_type = NULL, discount_value = NULL, discount_note = NULL, updated_at = now()
      WHERE id = v_item_id AND order_id = p_order_id;
    END LOOP;
  END IF;

  UPDATE public.promotion_redemptions
  SET status = 'cleared', cleared_at = now(), cleared_reason = v_reason
  WHERE order_id = p_order_id AND status = 'applied';

  UPDATE public.orders
  SET
    discount_type = NULL,
    discount_value = NULL,
    discount_note = NULL,
    promotion_id = NULL,
    promotion_code_id = NULL,
    updated_at = now()
  WHERE id = p_order_id;

  SELECT total_amount INTO v_totals FROM public.orders WHERE id = p_order_id;
  RETURN jsonb_build_object('order_id', p_order_id, 'total_amount', v_totals.total_amount);
END;
$$;

-- ── evaluate: return free_side offers; do not auto-apply money ──

CREATE OR REPLACE FUNCTION public.evaluate_order_promotions(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_prof_tenant bigint;
  v_order public.orders;
  v_promo public.promotions;
  v_base numeric;
  v_amount numeric;
  v_note text;
  v_totals record;
  v_offers jsonb := '[]'::jsonb;
  v_offer jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  SELECT p.tenant_id INTO v_prof_tenant FROM public.profiles p WHERE p.id = v_uid;

  PERFORM pg_advisory_xact_lock(p_order_id);
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM public.promotion_assert_order_mutable(v_order);

  v_base := GREATEST(
    COALESCE(v_order.subtotal, 0) - COALESCE(v_order.item_discount_amount, 0),
    0
  );

  IF v_order.promotion_id IS NOT NULL THEN
    SELECT * INTO v_promo FROM public.promotions WHERE id = v_order.promotion_id;
    IF v_promo.kind IN ('order_pct', 'order_vnd', 'voucher_face') THEN
      SELECT order_discount_amount, discount_amount, total_amount, promotion_id
      INTO v_totals FROM public.orders WHERE id = p_order_id;
      RETURN jsonb_build_object(
        'order_id', p_order_id,
        'promotion_id', v_order.promotion_id,
        'discount_amount', v_totals.order_discount_amount,
        'total_amount', v_totals.total_amount,
        'offers', '[]'::jsonb
      );
    END IF;
    IF NOT public.promotion_is_eligible(
      v_promo, v_order.branch_id, v_order.order_type, v_base, now()
    ) THEN
      PERFORM public.clear_promotion(p_order_id, 'Khuyến mãi hết điều kiện');
      SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    ELSIF v_promo.kind = 'auto_order' THEN
      v_amount := public.promotion_order_amount(v_promo, NULL::public.promotion_codes, v_base);
      v_note := v_promo.name;
      UPDATE public.orders
      SET
        discount_type = v_promo.discount_type,
        discount_value = CASE
          WHEN v_promo.discount_type = 'pct' THEN v_promo.discount_value
          ELSE v_amount
        END,
        discount_note = v_note,
        updated_at = now()
      WHERE id = p_order_id;
    ELSIF v_promo.kind = 'bxgy' THEN
      PERFORM public.clear_promotion(p_order_id, 'Tính lại mua X tặng Y');
      SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
      IF public.promotion_is_eligible(
        v_promo, v_order.branch_id, v_order.order_type, v_base, now()
      ) THEN
        PERFORM public.promotion_apply_bxgy(v_order, v_promo);
      END IF;
    ELSIF v_promo.kind = 'free_side' THEN
      v_offer := public.promotion_free_side_offer_json(v_order, v_promo);
      IF v_offer IS NULL THEN
        PERFORM public.clear_promotion(p_order_id, 'Khuyến mãi hết điều kiện');
        SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order.promotion_id IS NULL
     AND (v_order.discount_type IS NULL OR COALESCE(v_order.order_discount_amount, 0) = 0)
  THEN
    SELECT p.* INTO v_promo
    FROM public.promotions p
    WHERE p.tenant_id = v_order.tenant_id
      AND p.kind = 'auto_order'
      AND public.promotion_is_eligible(
        p, v_order.branch_id, v_order.order_type, v_base, now()
      )
    ORDER BY p.id
    LIMIT 1;
    IF FOUND THEN
      v_amount := public.promotion_order_amount(v_promo, NULL::public.promotion_codes, v_base);
      IF v_amount > 0 THEN
        UPDATE public.orders
        SET
          discount_type = v_promo.discount_type,
          discount_value = CASE
            WHEN v_promo.discount_type = 'pct' THEN v_promo.discount_value
            ELSE v_amount
          END,
          discount_note = v_promo.name,
          promotion_id = v_promo.id,
          updated_at = now()
        WHERE id = p_order_id;
        INSERT INTO public.promotion_redemptions (
          tenant_id, promotion_id, order_id, branch_id,
          applied_amount, applied_as, snapshot, status, redeemed_by
        ) VALUES (
          v_order.tenant_id, v_promo.id, p_order_id, v_order.branch_id,
          v_amount, 'order',
          jsonb_build_object('name', v_promo.name, 'kind', 'auto_order'),
          'applied', v_uid
        );
      END IF;
    ELSE
      SELECT p.* INTO v_promo
      FROM public.promotions p
      WHERE p.tenant_id = v_order.tenant_id
        AND p.kind = 'bxgy'
        AND public.promotion_is_eligible(
          p, v_order.branch_id, v_order.order_type,
          COALESCE(v_order.subtotal, 0), now()
        )
      ORDER BY p.id
      LIMIT 1;
      IF FOUND THEN
        PERFORM public.promotion_apply_bxgy(v_order, v_promo);
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order.promotion_id IS NULL
     AND (v_order.discount_type IS NULL OR COALESCE(v_order.order_discount_amount, 0) = 0)
  THEN
    FOR v_promo IN
      SELECT p.*
      FROM public.promotions p
      WHERE p.tenant_id = v_order.tenant_id
        AND p.kind = 'free_side'
        AND p.allow_auto IS TRUE
        AND public.promotion_is_eligible(
          p, v_order.branch_id, v_order.order_type, v_base, now()
        )
      ORDER BY p.id
    LOOP
      v_offer := public.promotion_free_side_offer_json(v_order, v_promo);
      IF v_offer IS NOT NULL THEN
        v_offers := v_offers || jsonb_build_array(v_offer);
      END IF;
    END LOOP;
  END IF;

  SELECT order_discount_amount, discount_amount, total_amount, promotion_id
  INTO v_totals FROM public.orders WHERE id = p_order_id;
  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'promotion_id', v_totals.promotion_id,
    'discount_amount', v_totals.order_discount_amount,
    'total_discount_amount', v_totals.discount_amount,
    'total_amount', v_totals.total_amount,
    'offers', v_offers
  );
END;
$$;

REVOKE ALL ON FUNCTION public.promotion_free_side_candidates(public.orders, public.promotions)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_free_side_candidates(public.orders, public.promotions)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.promotion_free_side_offer_json(public.orders, public.promotions)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_free_side_offer_json(public.orders, public.promotions)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.promotion_apply_free_side_core(
  public.orders, public.promotions, public.promotion_codes, jsonb, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_apply_free_side_core(
  public.orders, public.promotions, public.promotion_codes, jsonb, uuid
) TO service_role;
