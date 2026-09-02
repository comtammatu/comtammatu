-- Re-validate promotion eligibility before the order_pct/order_vnd/voucher_face
-- evaluate short-circuit so a cart mutation that drops subtotal below
-- promotions.min_subtotal clears the campaign. Body is the current baseline
-- evaluate_order_promotions function plus that control-flow change only.

CREATE OR REPLACE FUNCTION public.evaluate_order_promotions(p_order_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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
  v_current numeric;
  v_expected numeric;
  v_code_text text;
  v_snap jsonb;
  v_sel jsonb;
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
    IF NOT public.promotion_is_eligible(
      v_promo, v_order.branch_id, v_order.order_type, v_base, now()
    ) THEN
      PERFORM public.clear_promotion(p_order_id, 'Khuyến mãi hết điều kiện');
      SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    ELSIF v_promo.kind IN ('order_pct', 'order_vnd', 'voucher_face') THEN
      SELECT order_discount_amount, discount_amount, total_amount, promotion_id
      INTO v_totals FROM public.orders WHERE id = p_order_id;
      RETURN jsonb_build_object(
        'order_id', p_order_id,
        'promotion_id', v_order.promotion_id,
        'discount_amount', v_totals.order_discount_amount,
        'total_amount', v_totals.total_amount,
        'offers', '[]'::jsonb
      );
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
      ELSIF COALESCE((v_offer ->> 'needs_side_selection')::boolean, false) IS NOT TRUE THEN
        v_expected := COALESCE((v_offer ->> 'amount_hint')::numeric, 0);
        v_current := public.promotion_free_side_applied_amount(p_order_id, v_promo.id);
        IF v_expected > 0 AND v_current IS DISTINCT FROM v_expected THEN
          v_code_text := NULLIF(btrim(COALESCE(v_offer ->> 'code', '')), '');
          IF v_code_text IS NULL AND v_order.promotion_code_id IS NOT NULL THEN
            SELECT code INTO v_code_text
            FROM public.promotion_codes
            WHERE id = v_order.promotion_code_id;
          END IF;
          PERFORM public.clear_promotion(p_order_id, 'Tính lại miễn phí ăn kèm');
          SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
          v_base := GREATEST(
            COALESCE(v_order.subtotal, 0) - COALESCE(v_order.item_discount_amount, 0),
            0
          );
          IF public.promotion_is_eligible(
            v_promo, v_order.branch_id, v_order.order_type, v_base, now()
          ) THEN
            IF v_code_text IS NOT NULL AND v_promo.allow_code IS TRUE THEN
              PERFORM public.apply_free_side_selection(
                p_order_id, v_promo.id, v_code_text, '[]'::jsonb
              );
            ELSIF v_promo.allow_auto IS TRUE THEN
              PERFORM public.apply_free_side_selection(
                p_order_id, v_promo.id, NULL, '[]'::jsonb
              );
            END IF;
          END IF;
          SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
        END IF;
      END IF;
    ELSIF v_promo.kind = 'free_item' THEN
      v_offer := public.promotion_free_item_offer_json(v_order, v_promo);
      IF v_offer IS NULL THEN
        PERFORM public.clear_promotion(p_order_id, 'Khuyến mãi hết điều kiện');
        SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
      ELSE
        SELECT snapshot INTO v_snap
        FROM public.promotion_redemptions
        WHERE order_id = p_order_id AND status = 'applied'
        ORDER BY id DESC LIMIT 1;
        v_sel := COALESCE(v_snap -> 'selections', '[]'::jsonb);
        IF jsonb_typeof(v_sel) IS DISTINCT FROM 'array'
           OR jsonb_array_length(v_sel) = 0
           OR public.promotion_free_item_amount(
             v_offer -> 'candidates', v_sel
           ) <= 0 THEN
          IF COALESCE((v_offer ->> 'needs_side_selection')::boolean, false) THEN
            PERFORM public.clear_promotion(p_order_id, 'Khuyến mãi hết điều kiện');
            SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
            v_sel := NULL;
          ELSE
            v_sel := '[]'::jsonb;
          END IF;
        END IF;
        IF v_sel IS NOT NULL THEN
          v_expected := CASE
            WHEN jsonb_typeof(v_sel) = 'array' AND jsonb_array_length(v_sel) > 0 THEN
              public.promotion_free_item_amount(v_offer -> 'candidates', v_sel)
            ELSE COALESCE((v_offer ->> 'amount_hint')::numeric, 0)
          END;
          v_current := public.promotion_free_item_applied_amount(p_order_id, v_promo.id);
          IF v_expected > 0 AND v_current IS DISTINCT FROM v_expected THEN
            v_code_text := NULLIF(btrim(COALESCE(v_offer ->> 'code', '')), '');
            IF v_code_text IS NULL AND v_order.promotion_code_id IS NOT NULL THEN
              SELECT code INTO v_code_text
              FROM public.promotion_codes
              WHERE id = v_order.promotion_code_id;
            END IF;
            PERFORM public.clear_promotion(p_order_id, 'Tính lại món tặng');
            SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
            v_base := GREATEST(
              COALESCE(v_order.subtotal, 0) - COALESCE(v_order.item_discount_amount, 0),
              0
            );
            IF v_code_text IS NOT NULL
               AND public.promotion_is_eligible(
                 v_promo, v_order.branch_id, v_order.order_type, v_base, now()
               )
            THEN
              PERFORM public.apply_free_item_selection(
                p_order_id, v_promo.id, v_code_text, v_sel
              );
            END IF;
            SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
          END IF;
        END IF;
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
