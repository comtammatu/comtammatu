-- Require a reusable promo code for order_pct / order_vnd, and void prior
-- active reusable codes on the same campaign when the code rotates.

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
  p_reusable_code text
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

  IF p_id IS NULL THEN
    INSERT INTO public.promotions (
      tenant_id, name, status, kind, discount_type, discount_value,
      min_subtotal, max_discount_amount, stack_with_item_discount,
      starts_at, ends_at, time_windows, service_modes,
      bxgy_buy_qty, bxgy_get_qty, created_by
    ) VALUES (
      v_tenant, btrim(p_name), COALESCE(p_status, 'draft'), p_kind,
      p_discount_type, p_discount_value,
      COALESCE(p_min_subtotal, 0), p_max_discount_amount,
      COALESCE(p_stack_with_item_discount, true),
      p_starts_at, p_ends_at, COALESCE(p_time_windows, '[]'::jsonb),
      COALESCE(p_service_modes, ARRAY['dine_in', 'takeaway']::text[]),
      p_bxgy_buy_qty, p_bxgy_get_qty, v_uid
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

  v_code := public.promotion_normalize_code(p_reusable_code);
  IF p_kind IN ('order_pct', 'order_vnd') THEN
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

REVOKE ALL ON FUNCTION public.upsert_promotion(bigint, text, text, text, text, numeric, numeric, numeric, boolean, timestamptz, timestamptz, jsonb, text[], integer, integer, bigint[], jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_promotion(bigint, text, text, text, text, numeric, numeric, numeric, boolean, timestamptz, timestamptz, jsonb, text[], integer, integer, bigint[], jsonb, text) TO authenticated, service_role;
