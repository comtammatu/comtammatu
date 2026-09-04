-- Migration: promo_gift_picker_merge_release_and_branch_incident

-- 1. apply_gift_promotion_selection: Atomically add gift item + apply free_item promotion
CREATE OR REPLACE FUNCTION public.apply_gift_promotion_selection(
  p_order_id bigint,
  p_promotion_id bigint,
  p_code text,
  p_menu_item_id bigint,
  p_units integer DEFAULT 1
)
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
  v_menu_item public.menu_items;
  v_quota integer;
  v_new_item_id bigint;
  v_selections jsonb;
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

  SELECT * INTO v_promo
  FROM public.promotions
  WHERE id = p_promotion_id AND tenant_id = v_order.tenant_id;
  IF NOT FOUND OR v_promo.kind IS DISTINCT FROM 'free_item' THEN
    RAISE EXCEPTION 'promotion_not_eligible' USING ERRCODE = '22023';
  END IF;

  -- Validate menu item is marked as 'get' for this campaign
  IF NOT EXISTS (
    SELECT 1 FROM public.promotion_items pi
    WHERE pi.promotion_id = v_promo.id
      AND pi.menu_item_id = p_menu_item_id
      AND pi.item_role = 'get'
  ) THEN
    RAISE EXCEPTION 'promotion_item_selection_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_menu_item
  FROM public.menu_items
  WHERE id = p_menu_item_id AND tenant_id = v_order.tenant_id;
  IF NOT FOUND OR v_menu_item.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'menu_item_not_available' USING ERRCODE = '22023';
  END IF;

  v_quota := COALESCE(v_promo.free_item_qty, 1);
  IF p_units < 1 OR p_units > v_quota THEN
    RAISE EXCEPTION 'promotion_item_selection_qty' USING ERRCODE = '22023';
  END IF;

  -- Insert the gift item into order_items
  INSERT INTO public.order_items (
    tenant_id,
    order_id,
    menu_item_id,
    item_name,
    quantity,
    unit_price,
    subtotal,
    status,
    notes,
    modifiers,
    sides,
    created_at,
    updated_at
  ) VALUES (
    v_order.tenant_id,
    v_order.id,
    v_menu_item.id,
    v_menu_item.name,
    p_units,
    v_menu_item.price,
    v_menu_item.price * p_units,
    'pending',
    '[TẶNG] ' || v_promo.name,
    '[]'::jsonb,
    '[]'::jsonb,
    now(),
    now()
  ) RETURNING id INTO v_new_item_id;

  -- Re-read order totals updated by triggers
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

  v_selections := jsonb_build_array(
    jsonb_build_object(
      'order_item_id', v_new_item_id,
      'units', p_units
    )
  );

  RETURN public.apply_free_item_selection(p_order_id, p_promotion_id, p_code, v_selections);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_gift_promotion_selection(bigint, bigint, text, bigint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_gift_promotion_selection(bigint, bigint, text, bigint, integer) TO authenticated, service_role;

-- 2. merge_orders_auto_clear_promo: Gracefully clear promos and merge orders
CREATE OR REPLACE FUNCTION public.merge_orders_auto_clear_promo(
  p_source_order_id bigint,
  p_target_order_id bigint,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_prof_tenant bigint;
  v_source public.orders;
  v_target public.orders;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id INTO v_prof_tenant FROM public.profiles p WHERE p.id = v_uid;

  SELECT * INTO v_source FROM public.orders WHERE id = p_source_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_source.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_source.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target FROM public.orders WHERE id = p_target_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_source.promotion_id IS NOT NULL THEN
    PERFORM public.clear_promotion(p_source_order_id, 'Hủy khuyến mãi để gộp bàn');
  END IF;
  IF v_target.promotion_id IS NOT NULL THEN
    PERFORM public.clear_promotion(p_target_order_id, 'Hủy khuyến mãi để gộp bàn');
  END IF;

  RETURN public.merge_orders(p_source_order_id, p_target_order_id, p_idempotency_key);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_orders_auto_clear_promo(bigint, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_orders_auto_clear_promo(bigint, bigint, uuid) TO authenticated, service_role;

-- 3. preview_promotion_code: Return gift_items candidates when free_item not yet in order
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
  v_gift_items jsonb;
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
  IF v_promo.kind = 'free_item' AND v_promo.allow_code IS NOT TRUE THEN
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

  IF v_promo.kind = 'free_item' THEN
    v_offer := public.promotion_free_item_offer_json(v_order, v_promo);
    IF v_offer IS NOT NULL THEN
      RETURN jsonb_build_object(
        'promotion_id', v_promo.id,
        'name', v_promo.name,
        'code', v_code.code,
        'kind', v_promo.kind,
        'amount', COALESCE((v_offer ->> 'amount_hint')::numeric, 0),
        'needs_side_selection', COALESCE((v_offer ->> 'needs_side_selection')::boolean, false),
        'free_qty', v_offer -> 'free_qty',
        'candidates', v_offer -> 'candidates',
        'amount_hint', v_offer -> 'amount_hint',
        'gift_items', '[]'::jsonb
      );
    ELSE
      -- Order does not have the gift item yet; query available gift items to auto-add
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'menu_item_id', mi.id,
            'name', mi.name,
            'unit_price', mi.price
          )
        ),
        '[]'::jsonb
      ) INTO v_gift_items
      FROM public.promotion_items pi
      JOIN public.menu_items mi ON mi.id = pi.menu_item_id
      WHERE pi.promotion_id = v_promo.id
        AND pi.item_role = 'get'
        AND mi.is_active IS TRUE;

      IF jsonb_array_length(v_gift_items) = 0 THEN
        RAISE EXCEPTION 'promotion_not_eligible' USING ERRCODE = '22023';
      END IF;

      RETURN jsonb_build_object(
        'promotion_id', v_promo.id,
        'name', v_promo.name,
        'code', v_code.code,
        'kind', v_promo.kind,
        'amount', 0,
        'needs_side_selection', true,
        'free_qty', COALESCE(v_promo.free_item_qty, 1),
        'candidates', '[]'::jsonb,
        'amount_hint', 0,
        'gift_items', v_gift_items
      );
    END IF;
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

REVOKE ALL ON FUNCTION public.preview_promotion_code(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_promotion_code(bigint, text) TO authenticated, service_role;

-- 4. create_branch_incident_task: Branch incident reporting to Workspace
CREATE OR REPLACE FUNCTION public.create_branch_incident_task(
  p_branch_id bigint,
  p_category text,
  p_title text,
  p_description text DEFAULT NULL,
  p_priority text DEFAULT 'urgent'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_branch record;
  v_dept_id bigint;
  v_task public.work_tasks%ROWTYPE;
  v_final_title text;
  v_final_desc text;
  v_prio text := COALESCE(NULLIF(btrim(p_priority), ''), 'urgent');
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, name, code INTO v_branch
  FROM public.branches
  WHERE id = p_branch_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.auth_is_owner(v_actor)
    OR public.has_permission(p_branch_id, 'pos:use')
    OR public.has_permission(p_branch_id, 'branch:view')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF char_length(btrim(COALESCE(p_title, ''))) < 1 THEN
    RAISE EXCEPTION 'invalid_title' USING ERRCODE = '22023';
  END IF;

  -- Auto-route to department based on category
  SELECT id INTO v_dept_id
  FROM public.work_departments
  WHERE tenant_id = v_tenant
    AND is_active IS TRUE
    AND (
      (p_category = 'it' AND (name ILIKE '%IT%' OR name ILIKE '%kỹ thuật%'))
      OR (p_category = 'kitchen' AND (name ILIKE '%bếp%' OR name ILIKE '%bảo trì%'))
      OR (p_category = 'facility' AND (name ILIKE '%bảo trì%' OR name ILIKE '%cơ sở%'))
      OR (p_category = 'service' AND (name ILIKE '%vận hành%' OR name ILIKE '%dịch vụ%'))
    )
  ORDER BY id ASC
  LIMIT 1;

  IF v_dept_id IS NULL THEN
    SELECT id INTO v_dept_id
    FROM public.work_departments
    WHERE tenant_id = v_tenant AND is_active IS TRUE
    ORDER BY id ASC
    LIMIT 1;
  END IF;

  IF v_dept_id IS NULL THEN
    INSERT INTO public.work_departments (tenant_id, name, is_active)
    VALUES (v_tenant, 'Vận hành', true)
    ON CONFLICT (tenant_id, name) DO UPDATE SET is_active = true
    RETURNING id INTO v_dept_id;
  END IF;

  IF v_prio <> ALL (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]) THEN
    v_prio := 'urgent';
  END IF;

  v_final_title := '[Sự cố - ' || v_branch.name || '] ' || btrim(p_title);
  v_final_desc := 'Chi nhánh: ' || v_branch.name || ' (' || COALESCE(v_branch.code, '') || ')' || E'\n'
    || 'Phân loại: ' || COALESCE(p_category, 'Chung') || E'\n'
    || 'Chi tiết sự cố: ' || E'\n' || COALESCE(p_description, '(Không có mô tả thêm)');

  INSERT INTO public.work_tasks (
    tenant_id,
    department_id,
    project_id,
    title,
    description,
    status,
    priority,
    created_by
  ) VALUES (
    v_tenant,
    v_dept_id,
    NULL,
    left(v_final_title, 300),
    v_final_desc,
    'todo',
    v_prio,
    v_actor
  ) RETURNING * INTO v_task;

  RETURN jsonb_build_object(
    'task_id', v_task.id,
    'department_id', v_task.department_id,
    'title', v_task.title,
    'priority', v_task.priority,
    'status', v_task.status,
    'created_at', v_task.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_branch_incident_task(bigint, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_branch_incident_task(bigint, text, text, text, text) TO authenticated, service_role;
