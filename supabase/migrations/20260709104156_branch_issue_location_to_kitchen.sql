SET search_path = '';

DO $$
DECLARE
  v_sql text;
BEGIN
  SELECT pg_get_functiondef('public.enforce_branch_stock_availability()'::regprocedure)
  INTO v_sql;

  IF position('ORDER BY il.is_default_issue DESC, il.sort_order NULLS LAST, il.id' in v_sql) = 0 THEN
    RAISE EXCEPTION 'enforce_branch_stock_availability_location_pattern_missing' USING ERRCODE = 'P0001';
  END IF;

  EXECUTE replace(
    v_sql,
    'ORDER BY il.is_default_issue DESC, il.sort_order NULLS LAST, il.id',
    'ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id'
  );

  SELECT pg_get_functiondef('public.post_pos_sale_consumption_if_ready(bigint, uuid)'::regprocedure)
  INTO v_sql;

  IF position('RAISE WARNING ''default_issue_location_missing:branch %; using warehouse location %''' in v_sql) = 0 THEN
    RAISE EXCEPTION 'post_pos_sale_consumption_location_pattern_missing' USING ERRCODE = 'P0001';
  END IF;

  v_sql := replace(v_sql, 'SELECT il.id, il.is_default_issue', 'SELECT il.id, il.is_default_consumption');
  v_sql := replace(
    v_sql,
    'ORDER BY il.is_default_issue DESC, il.sort_order NULLS LAST, il.id',
    'ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id'
  );
  v_sql := replace(
    v_sql,
    'RAISE WARNING ''default_issue_location_missing:branch %; using warehouse location %''',
    'RAISE WARNING ''default_consumption_location_missing:branch %; using kitchen location %'''
  );
  EXECUTE v_sql;

  SELECT pg_get_functiondef('public.post_pos_cancelled_ready_waste(bigint, uuid, text)'::regprocedure)
  INTO v_sql;

  IF position('RAISE WARNING ''default_issue_location_missing:branch %; using kitchen location %''' in v_sql) = 0 THEN
    RAISE EXCEPTION 'post_pos_cancelled_ready_waste_location_pattern_missing' USING ERRCODE = 'P0001';
  END IF;

  v_sql := replace(v_sql, 'SELECT il.id, il.is_default_issue', 'SELECT il.id, il.is_default_consumption');
  v_sql := replace(
    v_sql,
    'ORDER BY il.is_default_issue DESC, il.sort_order NULLS LAST, il.id',
    'ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id'
  );
  v_sql := replace(
    v_sql,
    'RAISE WARNING ''default_issue_location_missing:branch %; using kitchen location %''',
    'RAISE WARNING ''default_consumption_location_missing:branch %; using kitchen location %'''
  );
  EXECUTE v_sql;
END $$;

CREATE OR REPLACE FUNCTION public.adjust_stock_exception(
  p_branch_id bigint,
  p_ingredient_id bigint,
  p_quantity_change numeric,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_location_id bigint;
  v_entry_unit_id bigint;
  v_movement_id bigint;
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_required' USING ERRCODE = '28000';
  END IF;
  IF p_branch_id IS NULL OR p_ingredient_id IS NULL THEN
    RAISE EXCEPTION 'invalid_adjustment_target' USING ERRCODE = '22023';
  END IF;
  IF p_quantity_change IS NULL OR p_quantity_change = 0 THEN
    RAISE EXCEPTION 'quantity_change_nonzero' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT il.id
  INTO v_location_id
  FROM public.inventory_locations il
  JOIN public.branches b
    ON b.id = il.branch_id
   AND b.tenant_id = il.tenant_id
  WHERE il.tenant_id = v_tenant
    AND il.branch_id = p_branch_id
    AND il.is_active = TRUE
    AND (
      (b.branch_kind = 'branch' AND il.location_kind = 'kitchen')
      OR (b.branch_kind IS DISTINCT FROM 'branch' AND il.is_default_issue = TRUE)
    )
  ORDER BY
    CASE WHEN b.branch_kind = 'branch' AND il.location_kind = 'kitchen' THEN 0 ELSE 1 END,
    il.is_default_consumption DESC,
    il.is_default_issue DESC,
    il.sort_order NULLS LAST,
    il.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'default_issue_location_required' USING ERRCODE = '23502';
  END IF;

  SELECT iu.unit_id
  INTO v_entry_unit_id
  FROM public.ingredients ing
  JOIN public.ingredient_units iu
    ON iu.tenant_id = ing.tenant_id
   AND iu.ingredient_id = ing.id
  JOIN public.units u
    ON u.tenant_id = iu.tenant_id
   AND u.id = iu.unit_id
  WHERE ing.tenant_id = v_tenant
    AND ing.id = p_ingredient_id
    AND ing.is_active = TRUE
    AND iu.is_base = TRUE
    AND iu.is_active = TRUE
    AND u.is_active = TRUE
  ORDER BY iu.sort_order, iu.id
  LIMIT 1;

  IF v_entry_unit_id IS NULL THEN
    RAISE EXCEPTION 'entry_unit_not_found:%', p_ingredient_id USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.stock_movements (
    tenant_id, branch_id, ingredient_id, type, quantity_change,
    reason, created_by, location_id, entry_unit_id, entry_quantity
  ) VALUES (
    v_tenant, p_branch_id, p_ingredient_id, 'adjustment', p_quantity_change,
    v_reason, v_uid, v_location_id, v_entry_unit_id, abs(p_quantity_change)
  )
  RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object('success', true, 'movement_id', v_movement_id);
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_stock_exception(bigint, bigint, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_stock_exception(bigint, bigint, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock_exception(bigint, bigint, numeric, text) TO service_role;
