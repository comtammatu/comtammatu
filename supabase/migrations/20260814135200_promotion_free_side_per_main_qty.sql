-- free_side: free_side_qty applies per qualifying main portion, not once per order.
-- Example: N=1, three Cơm sườn + Chả lines → comp three Chả (auto when unambiguous).

COMMENT ON COLUMN public.promotions.free_side_qty IS
  'free_side: free side portions per qualifying main unit (order_item.quantity multiplier).';

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
  v_line_qty integer;
  v_line_need integer;
  v_per_main integer;
BEGIN
  IF p_promo.kind IS DISTINCT FROM 'free_side' THEN
    RETURN v_out;
  END IF;

  v_per_main := COALESCE(p_promo.free_side_qty, 0);
  IF v_per_main < 1 THEN
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
    v_line_qty := GREATEST(COALESCE(v_item.quantity, 1), 1);
    v_line_need := v_per_main * v_line_qty;
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
      v_max := v_side_qty * v_line_qty;
      v_name := COALESCE(NULLIF(btrim(v_side ->> 'name'), ''), 'Ăn kèm');
      v_out := v_out || jsonb_build_array(
        jsonb_build_object(
          'order_item_id', v_item.id,
          'side_item_id', v_side_id,
          'name', v_name,
          'unit_price', v_price,
          'max_units', v_max,
          'parent_name', COALESCE(v_item.item_name, ''),
          'line_qty', v_line_qty,
          'line_need', v_line_need
        )
      );
    END LOOP;
  END LOOP;

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.promotion_free_side_total_need(p_candidates jsonb)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT SUM(line_need)::integer
      FROM (
        SELECT DISTINCT ON ((value ->> 'order_item_id')::bigint)
          (value ->> 'line_need')::integer AS line_need
        FROM jsonb_array_elements(p_candidates) AS t(value)
        ORDER BY (value ->> 'order_item_id')::bigint
      ) lines
    ),
    0
  );
$$;

CREATE OR REPLACE FUNCTION public.promotion_free_side_lines_eligible(p_candidates jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT bool_and(capacity >= line_need)
      FROM (
        SELECT
          (value ->> 'order_item_id')::bigint AS order_item_id,
          MAX((value ->> 'line_need')::integer) AS line_need,
          SUM((value ->> 'max_units')::integer) AS capacity
        FROM jsonb_array_elements(p_candidates) AS t(value)
        GROUP BY 1
      ) lines
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.promotion_free_side_needs_manual_selection(
  p_candidates jsonb
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_candidates) AS t(value)
    GROUP BY (value ->> 'order_item_id')::bigint
    HAVING COUNT(DISTINCT (value ->> 'side_item_id')::bigint) > 1
  );
$$;

CREATE OR REPLACE FUNCTION public.promotion_free_side_auto_selections(p_candidates jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'order_item_id', order_item_id,
        'side_item_id', side_item_id,
        'units', LEAST(line_need, max_units)
      )
      ORDER BY order_item_id, side_item_id
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      (value ->> 'order_item_id')::bigint AS order_item_id,
      (value ->> 'side_item_id')::bigint AS side_item_id,
      MAX((value ->> 'line_need')::integer) AS line_need,
      MAX((value ->> 'max_units')::integer) AS max_units
    FROM jsonb_array_elements(p_candidates) AS t(value)
    GROUP BY 1, 2
  ) rows;
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
  v_total_need integer;
  v_manual boolean;
  v_hint numeric := 0;
  v_row jsonb;
  v_auto jsonb;
BEGIN
  v_candidates := public.promotion_free_side_candidates(p_order, p_promo);
  IF jsonb_array_length(v_candidates) < 1 THEN
    RETURN NULL;
  END IF;
  IF NOT public.promotion_free_side_lines_eligible(v_candidates) THEN
    RETURN NULL;
  END IF;

  v_total_need := public.promotion_free_side_total_need(v_candidates);
  IF v_total_need < 1 THEN
    RETURN NULL;
  END IF;

  v_manual := public.promotion_free_side_needs_manual_selection(v_candidates);
  IF NOT v_manual THEN
    v_auto := public.promotion_free_side_auto_selections(v_candidates);
    FOR v_row IN SELECT * FROM jsonb_array_elements(v_auto)
    LOOP
      v_hint := v_hint + (v_row ->> 'units')::integer * (
        SELECT (value ->> 'unit_price')::numeric
        FROM jsonb_array_elements(v_candidates) AS t(value)
        WHERE (value ->> 'order_item_id')::bigint = (v_row ->> 'order_item_id')::bigint
          AND (value ->> 'side_item_id')::bigint = (v_row ->> 'side_item_id')::bigint
        LIMIT 1
      );
    END LOOP;
  ELSE
    SELECT COALESCE(
      SUM(line_need * min_price),
      0
    )
    INTO v_hint
    FROM (
      SELECT
        MAX((value ->> 'line_need')::integer) AS line_need,
        MIN((value ->> 'unit_price')::numeric) AS min_price
      FROM jsonb_array_elements(v_candidates) AS t(value)
      GROUP BY (value ->> 'order_item_id')::bigint
    ) lines;
  END IF;

  RETURN jsonb_build_object(
    'promotion_id', p_promo.id,
    'name', p_promo.name,
    'kind', 'free_side',
    'free_qty', v_total_need,
    'candidates', v_candidates,
    'amount_hint', v_hint,
    'needs_side_selection', v_manual,
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
  v_manual boolean;
  v_sel jsonb;
  v_units integer;
  v_sum_units integer := 0;
  v_amount numeric := 0;
  v_seen jsonb := '{}'::jsonb;
  v_line_amounts jsonb := '{}'::jsonb;
  v_line_units jsonb := '{}'::jsonb;
  v_cand jsonb;
  v_key text;
  v_max integer;
  v_price numeric;
  v_order_item_id bigint;
  v_side_item_id bigint;
  v_line_amount numeric;
  v_line_need integer;
  v_line_sum integer;
  v_ids bigint[] := ARRAY[]::bigint[];
  v_note text;
  v_item_id text;
  v_code_id bigint;
  v_effective jsonb;
BEGIN
  IF p_promo.kind IS DISTINCT FROM 'free_side' THEN
    RAISE EXCEPTION 'promotion_kind_mismatch' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_promo.free_side_qty, 0) < 1 THEN
    RAISE EXCEPTION 'promotion_not_eligible' USING ERRCODE = '22023';
  END IF;

  v_candidates := public.promotion_free_side_candidates(p_order, p_promo);
  IF jsonb_array_length(v_candidates) < 1
     OR NOT public.promotion_free_side_lines_eligible(v_candidates) THEN
    RAISE EXCEPTION 'promotion_not_eligible' USING ERRCODE = '22023';
  END IF;

  v_need := public.promotion_free_side_total_need(v_candidates);
  v_manual := public.promotion_free_side_needs_manual_selection(v_candidates);

  IF p_selections IS NULL
     OR jsonb_typeof(p_selections) <> 'array'
     OR jsonb_array_length(p_selections) = 0 THEN
    IF v_manual THEN
      RAISE EXCEPTION 'promotion_side_selection_required' USING ERRCODE = '22023';
    END IF;
    v_effective := public.promotion_free_side_auto_selections(v_candidates);
  ELSE
    v_effective := p_selections;
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

  FOR v_sel IN SELECT * FROM jsonb_array_elements(v_effective)
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
    v_line_units := jsonb_set(
      v_line_units,
      ARRAY[v_order_item_id::text],
      to_jsonb(
        COALESCE((v_line_units ->> v_order_item_id::text)::integer, 0) + v_units
      ),
      true
    );
  END LOOP;

  IF v_sum_units IS DISTINCT FROM v_need THEN
    RAISE EXCEPTION 'promotion_side_selection_qty' USING ERRCODE = '22023';
  END IF;

  FOR v_order_item_id, v_line_need IN
    SELECT DISTINCT
      (value ->> 'order_item_id')::bigint,
      (value ->> 'line_need')::integer
    FROM jsonb_array_elements(v_candidates) AS t(value)
  LOOP
    v_line_sum := COALESCE((v_line_units ->> v_order_item_id::text)::integer, 0);
    IF v_line_sum IS DISTINCT FROM v_line_need THEN
      RAISE EXCEPTION 'promotion_side_selection_qty' USING ERRCODE = '22023';
    END IF;
  END LOOP;

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
      'needs_side_selection', COALESCE((v_offer ->> 'needs_side_selection')::boolean, false),
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

REVOKE ALL ON FUNCTION public.promotion_free_side_total_need(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_free_side_total_need(jsonb)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.promotion_free_side_lines_eligible(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_free_side_lines_eligible(jsonb)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.promotion_free_side_needs_manual_selection(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_free_side_needs_manual_selection(jsonb)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.promotion_free_side_auto_selections(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_free_side_auto_selections(jsonb)
  TO authenticated, service_role;
