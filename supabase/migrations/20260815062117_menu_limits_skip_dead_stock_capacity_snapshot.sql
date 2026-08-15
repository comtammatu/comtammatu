-- ADR 0026 / D064: warehouse stock may go negative (post-and-flag). Live
-- capacity comes from branch_menu_limit_availability, not the dead
-- branch_menu_item_daily_limits.stock_capacity snapshot. Writer RPCs must not
-- refresh that column from compute_menu_item_stock_capacity - a negative
-- compute result violates stock_capacity_check (>= 0) and blocks managers from
-- setting manual limits or stock_allowance_quantity when reopen-sell is needed.

CREATE OR REPLACE FUNCTION public.set_branch_menu_daily_limit(
  p_branch_id bigint,
  p_menu_item_id bigint,
  p_limit_quantity integer,
  p_is_disabled boolean
) RETURNS jsonb
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

  INSERT INTO public.branch_menu_item_daily_limits
    (
      tenant_id,
      branch_id,
      menu_item_id,
      limit_date,
      limit_quantity,
      is_disabled,
      sold_today
    )
  VALUES
    (
      v_tenant_id,
      p_branch_id,
      p_menu_item_id,
      v_today,
      p_limit_quantity,
      p_is_disabled,
      0
    )
  ON CONFLICT (branch_id, menu_item_id, limit_date)
  DO UPDATE SET
    limit_quantity = EXCLUDED.limit_quantity,
    is_disabled    = EXCLUDED.is_disabled,
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

COMMENT ON FUNCTION public.set_branch_menu_daily_limit(
  p_branch_id bigint,
  p_menu_item_id bigint,
  p_limit_quantity integer,
  p_is_disabled boolean
) IS 'Upserts today''s manual daily limit row. limit_quantity is a pure manual cap: NULL = no manual limit (never defaulted or clamped from stock capacity — D064 limit-ratchet invariant); is_disabled is settable for every active item including capacity-NULL ones. Does not write the dead stock_capacity snapshot (ADR 0026 negative on-hand safe).';

CREATE OR REPLACE FUNCTION public.set_branch_menu_stock_allowance(
  p_branch_id bigint,
  p_menu_item_id bigint,
  p_stock_allowance_quantity integer
) RETURNS jsonb
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

  IF p_stock_allowance_quantity IS NOT NULL AND p_stock_allowance_quantity < 0 THEN
    RAISE EXCEPTION 'stock_allowance_quantity must be nonnegative or null'
      USING ERRCODE = '22023';
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

  INSERT INTO public.branch_menu_item_daily_limits (
    tenant_id,
    branch_id,
    menu_item_id,
    limit_date,
    limit_quantity,
    is_disabled,
    sold_today,
    stock_allowance_quantity
  )
  VALUES (
    v_tenant_id,
    p_branch_id,
    p_menu_item_id,
    v_today,
    NULL,
    false,
    0,
    p_stock_allowance_quantity
  )
  ON CONFLICT (branch_id, menu_item_id, limit_date)
  DO UPDATE SET
    stock_allowance_quantity = EXCLUDED.stock_allowance_quantity,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'branch_id', v_row.branch_id,
    'menu_item_id', v_row.menu_item_id,
    'limit_date', v_row.limit_date,
    'stock_allowance_quantity', v_row.stock_allowance_quantity,
    'is_disabled', v_row.is_disabled,
    'sold_today', v_row.sold_today,
    'stock_capacity', v_row.stock_capacity
  );
END;
$$;

COMMENT ON FUNCTION public.set_branch_menu_stock_allowance(
  p_branch_id bigint,
  p_menu_item_id bigint,
  p_stock_allowance_quantity integer
) IS 'ADR 0026: sets today''s supplemental sellable allowance (add-N-on-top portions) for one menu item. Does not book warehouse movements. Does not write the dead stock_capacity snapshot (negative on-hand safe).';

REVOKE ALL ON FUNCTION public.set_branch_menu_daily_limit(
  bigint, bigint, integer, boolean
) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_branch_menu_daily_limit(
  bigint, bigint, integer, boolean
) TO authenticated;
GRANT ALL ON FUNCTION public.set_branch_menu_daily_limit(
  bigint, bigint, integer, boolean
) TO service_role;

REVOKE ALL ON FUNCTION public.set_branch_menu_stock_allowance(
  bigint, bigint, integer
) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_branch_menu_stock_allowance(
  bigint, bigint, integer
) TO authenticated;
GRANT ALL ON FUNCTION public.set_branch_menu_stock_allowance(
  bigint, bigint, integer
) TO service_role;
