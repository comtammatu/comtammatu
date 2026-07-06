CREATE OR REPLACE FUNCTION public.set_branch_menu_daily_limit(p_branch_id bigint, p_menu_item_id bigint, p_limit_quantity integer, p_is_disabled boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_role      TEXT   := public.auth_role();
  v_branch    BIGINT := public.auth_branch_id();
  v_today     DATE   := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_row       public.branch_menu_item_daily_limits;
  v_stock_capacity INTEGER;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF v_role NOT IN ('owner', 'branch_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_role = 'branch_manager'
     AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN
    RAISE EXCEPTION 'branch scope mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_limit_quantity IS NOT NULL AND p_limit_quantity < 0 THEN
    RAISE EXCEPTION 'limit_quantity must be nonnegative or null' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.menu_items mi
    WHERE mi.id = p_menu_item_id
      AND mi.tenant_id = v_tenant_id
      AND mi.is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'menu item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002';
  END IF;

  v_stock_capacity := public.compute_menu_item_stock_capacity(
    v_tenant_id,
    p_branch_id,
    p_menu_item_id
  );

  INSERT INTO public.branch_menu_item_daily_limits
    (
      tenant_id,
      branch_id,
      menu_item_id,
      limit_date,
      limit_quantity,
      is_disabled,
      sold_today,
      stock_capacity
    )
  VALUES
    (
      v_tenant_id,
      p_branch_id,
      p_menu_item_id,
      v_today,
      p_limit_quantity,
      p_is_disabled,
      0,
      v_stock_capacity
    )
  ON CONFLICT (branch_id, menu_item_id, limit_date)
  DO UPDATE SET
    limit_quantity = EXCLUDED.limit_quantity,
    is_disabled    = EXCLUDED.is_disabled,
    stock_capacity = EXCLUDED.stock_capacity,
    updated_at     = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'branch_id', v_row.branch_id,
    'menu_item_id', v_row.menu_item_id,
    'limit_date', v_row.limit_date,
    'limit_quantity', v_row.limit_quantity,
    'is_disabled', v_row.is_disabled,
    'sold_today', v_row.sold_today,
    'stock_capacity', v_row.stock_capacity
  );
END;
$$;

COMMENT ON FUNCTION public.set_branch_menu_daily_limit(p_branch_id bigint, p_menu_item_id bigint, p_limit_quantity integer, p_is_disabled boolean) IS 'Upserts today''s manual daily limit row. limit_quantity is a pure manual cap: NULL = no manual limit (never defaulted or clamped from stock capacity — D064 limit-ratchet invariant); is_disabled is settable for every active item including capacity-NULL ones.';

CREATE OR REPLACE FUNCTION public.clear_branch_menu_daily_limit(p_branch_id bigint, p_menu_item_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_role      TEXT   := public.auth_role();
  v_branch    BIGINT := public.auth_branch_id();
  v_today     DATE   := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_row       public.branch_menu_item_daily_limits;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF v_role NOT IN ('owner', 'branch_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_role = 'branch_manager'
     AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN
    RAISE EXCEPTION 'branch scope mismatch' USING ERRCODE = '42501';
  END IF;

  UPDATE public.branch_menu_item_daily_limits
     SET limit_quantity = NULL,
         is_disabled = FALSE,
         updated_at = now()
   WHERE tenant_id = v_tenant_id
     AND branch_id = p_branch_id
     AND menu_item_id = p_menu_item_id
     AND limit_date = v_today
   RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'deleted', 0,
      'cleared', 1,
      'sold_today', v_row.sold_today,
      'stock_capacity', v_row.stock_capacity
    );
  END IF;

  RETURN jsonb_build_object('deleted', 0, 'cleared', 0);
END;
$$;

COMMENT ON FUNCTION public.clear_branch_menu_daily_limit(p_branch_id bigint, p_menu_item_id bigint) IS 'Clears today''s manual limit by nulling limit_quantity and re-enabling the item while KEEPING the row, so sold_today survives a mid-day re-limit (deleting the row would reset the counter and over-permit). Never copies stock capacity into the manual limit.';
