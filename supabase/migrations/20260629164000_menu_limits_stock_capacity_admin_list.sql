DROP FUNCTION IF EXISTS public.list_branch_menu_daily_limits(bigint, date);

CREATE FUNCTION public.list_branch_menu_daily_limits(
  p_branch_id bigint,
  p_limit_date date DEFAULT NULL::date
)
RETURNS TABLE(
  menu_item_id bigint,
  item_name text,
  category_id bigint,
  category_name text,
  base_price numeric,
  limit_id bigint,
  limit_date date,
  limit_quantity integer,
  is_disabled boolean,
  sold_today integer,
  stock_capacity integer
)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_role      TEXT   := public.auth_role();
  v_branch    BIGINT := public.auth_branch_id();
  v_date      DATE   := COALESCE(
    p_limit_date,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  );
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF v_role NOT IN ('owner')
     AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN
    RAISE EXCEPTION 'branch scope mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.branches b
   WHERE b.id = p_branch_id AND b.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    mi.id,
    mi.name,
    mc.id,
    mc.name,
    mi.base_price,
    bl.id,
    bl.limit_date,
    bl.limit_quantity,
    COALESCE(bl.is_disabled, FALSE),
    COALESCE(bl.sold_today, 0),
    bl.stock_capacity
  FROM public.menu_items mi
  JOIN public.menu_categories mc ON mc.id = mi.category_id
  LEFT JOIN public.branch_menu_item_daily_limits bl
    ON bl.menu_item_id = mi.id
   AND bl.branch_id = p_branch_id
   AND bl.limit_date = v_date
  WHERE mi.tenant_id = v_tenant_id
    AND mi.is_active = TRUE
  ORDER BY mc.sort_order, mi.sort_order, mi.name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_branch_menu_daily_limits(bigint, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_branch_menu_daily_limits(bigint, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.clear_branch_menu_daily_limit(
  p_branch_id bigint,
  p_menu_item_id bigint
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_role      TEXT   := public.auth_role();
  v_branch    BIGINT := public.auth_branch_id();
  v_today     DATE   := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_deleted   INT;
  v_row       public.branch_menu_item_daily_limits;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF v_role NOT IN ('owner',
                    'branch_manager', 'cashier', 'chef') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_role IN ('branch_manager', 'cashier', 'chef')
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
     AND stock_capacity IS NOT NULL
   RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'deleted', 0,
      'cleared', 1,
      'sold_today', v_row.sold_today,
      'stock_capacity', v_row.stock_capacity
    );
  END IF;

  DELETE FROM public.branch_menu_item_daily_limits
   WHERE tenant_id = v_tenant_id
     AND branch_id = p_branch_id
     AND menu_item_id = p_menu_item_id
     AND limit_date = v_today;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_deleted, 'cleared', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.clear_branch_menu_daily_limit(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_branch_menu_daily_limit(bigint, bigint) TO authenticated, service_role;
