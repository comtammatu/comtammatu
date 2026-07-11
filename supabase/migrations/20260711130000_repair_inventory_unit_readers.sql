BEGIN;

CREATE OR REPLACE FUNCTION public.scan_inventory_alerts()
RETURNS TABLE(low_stock_count bigint, expiry_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_low bigint := 0;
  v_exp bigint := 0;
  v_today text := to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD');
BEGIN
  WITH inserted AS (
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, dedup_key, meta,
      expires_at
    )
    SELECT
      sl.tenant_id,
      sl.branch_id,
      ARRAY['branch_manager', 'owner']::text[],
      'inventory.stock_low',
      'warning',
      format('Tồn kho thấp: %s', ing.name),
      format(
        'Còn %s (ngưỡng đặt lại %s)',
        trim(trailing '.0' from sl.current_quantity::text),
        trim(trailing '.0' from ing.reorder_point::text)
      ),
      'ingredient',
      ing.id,
      format('/inventory/stock?ingredient=%s&branch=%s', ing.id, sl.branch_id),
      format('stock_low:ingredient:%s:branch:%s:%s', ing.id, sl.branch_id, v_today),
      jsonb_build_object(
        'current_quantity', sl.current_quantity,
        'reorder_point', ing.reorder_point,
        'branch_id', sl.branch_id
      ),
      now() + interval '7 days'
    FROM public.stock_levels sl
    JOIN public.ingredients ing
      ON ing.id = sl.ingredient_id
     AND ing.tenant_id = sl.tenant_id
    WHERE ing.reorder_point IS NOT NULL
      AND ing.reorder_point > 0
      AND sl.current_quantity <= ing.reorder_point
      AND ing.is_active = true
    ON CONFLICT (tenant_id, dedup_key)
      WHERE dedup_key IS NOT NULL
      DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_low FROM inserted;

  DELETE FROM public.notifications
  WHERE expires_at IS NOT NULL
    AND expires_at < now();

  RETURN QUERY SELECT v_low, v_exp;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_inventory_alerts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scan_inventory_alerts() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_inventory_alerts() TO service_role;

CREATE OR REPLACE FUNCTION public.get_stock_movement_report(
  p_start_date date,
  p_end_date date,
  p_branch_id bigint DEFAULT NULL
)
RETURNS TABLE(
  ingredient_id bigint,
  ingredient_name text,
  unit text,
  opening numeric,
  grn_receipt numeric,
  transfer_in numeric,
  transfer_out numeric,
  consumption numeric,
  production_consumption numeric,
  production_output numeric,
  adjustment numeric,
  closing numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NULL THEN
    IF NOT (
      public.has_permission_any('inventory:read')
      OR public.has_permission_any('reports:view_branch')
      OR public.has_permission_any('reports:view_tenant')
    ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (
    public.has_permission(p_branch_id, 'inventory:read')
    OR public.has_permission(NULL, 'reports:view_branch')
    OR public.has_permission(NULL, 'reports:view_tenant')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_start := p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end := (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  WITH loc AS (
    SELECT il.id
    FROM public.inventory_locations il
    JOIN public.branches b ON b.id = il.branch_id
    WHERE il.tenant_id = v_tenant
      AND il.is_active = true
      AND (p_branch_id IS NULL OR il.branch_id = p_branch_id)
      AND (
        il.location_kind = 'warehouse'
        OR (b.branch_kind = 'central_kitchen' AND il.location_kind = 'production_storage')
      )
  ),
  cur AS (
    SELECT sl.ingredient_id, SUM(sl.current_quantity) AS current_quantity
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.location_id IN (SELECT id FROM loc)
      AND (p_branch_id IS NULL OR sl.branch_id = p_branch_id)
    GROUP BY sl.ingredient_id
  ),
  aft AS (
    SELECT sm.ingredient_id, SUM(sm.quantity_change) AS after_sum
    FROM public.stock_movements sm
    WHERE sm.tenant_id = v_tenant
      AND sm.location_id IN (SELECT id FROM loc)
      AND (p_branch_id IS NULL OR sm.branch_id = p_branch_id)
      AND sm.created_at >= v_end
    GROUP BY sm.ingredient_id
  ),
  per AS (
    SELECT
      sm.ingredient_id,
      SUM(sm.quantity_change) FILTER (WHERE sm.type IN ('grn_receipt', 'grn_amend')) AS grn_receipt,
      SUM(sm.quantity_change) FILTER (WHERE sm.type = 'transfer_in') AS transfer_in,
      SUM(sm.quantity_change) FILTER (WHERE sm.type = 'transfer_out') AS transfer_out,
      SUM(sm.quantity_change) FILTER (WHERE sm.type = 'consumption') AS consumption,
      SUM(sm.quantity_change) FILTER (WHERE sm.type = 'production_consumption') AS production_consumption,
      SUM(sm.quantity_change) FILTER (WHERE sm.type = 'production_output') AS production_output,
      SUM(sm.quantity_change) FILTER (WHERE sm.type IN ('adjustment', 'count_adjustment', 'supplier_return', 'refund_restore')) AS adjustment
    FROM public.stock_movements sm
    WHERE sm.tenant_id = v_tenant
      AND sm.location_id IN (SELECT id FROM loc)
      AND (p_branch_id IS NULL OR sm.branch_id = p_branch_id)
      AND sm.created_at >= v_start
      AND sm.created_at < v_end
    GROUP BY sm.ingredient_id
  ),
  computed AS (
    SELECT
      ing.id AS ingredient_id,
      ing.name AS ingredient_name,
      public.inventory_entry_unit_code(v_tenant, ing.id, NULL) AS unit,
      COALESCE(cur.current_quantity, 0) - COALESCE(aft.after_sum, 0) AS closing,
      COALESCE(per.grn_receipt, 0)
        + COALESCE(per.transfer_in, 0)
        + COALESCE(per.transfer_out, 0)
        + COALESCE(per.consumption, 0)
        + COALESCE(per.production_consumption, 0)
        + COALESCE(per.production_output, 0)
        + COALESCE(per.adjustment, 0) AS period_total,
      COALESCE(per.grn_receipt, 0) AS grn_receipt,
      COALESCE(per.transfer_in, 0) AS transfer_in,
      COALESCE(per.transfer_out, 0) AS transfer_out,
      COALESCE(per.consumption, 0) AS consumption,
      COALESCE(per.production_consumption, 0) AS production_consumption,
      COALESCE(per.production_output, 0) AS production_output,
      COALESCE(per.adjustment, 0) AS adjustment
    FROM public.ingredients ing
    LEFT JOIN cur ON cur.ingredient_id = ing.id
    LEFT JOIN aft ON aft.ingredient_id = ing.id
    LEFT JOIN per ON per.ingredient_id = ing.id
    WHERE ing.tenant_id = v_tenant
      AND ing.is_active = true
  )
  SELECT
    c.ingredient_id,
    c.ingredient_name,
    c.unit,
    c.closing - c.period_total AS opening,
    c.grn_receipt,
    c.transfer_in,
    c.transfer_out,
    c.consumption,
    c.production_consumption,
    c.production_output,
    c.adjustment,
    c.closing
  FROM computed c
  WHERE c.closing - c.period_total <> 0
     OR c.closing <> 0
     OR c.period_total <> 0
  ORDER BY c.ingredient_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stock_movement_report(date, date, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stock_movement_report(date, date, bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_stocktake_lines_blind(p_session_id bigint)
RETURNS TABLE(
  line_id bigint,
  ingredient_id bigint,
  ingredient_name text,
  unit text,
  abc_class char,
  round_no smallint,
  counted_quantity numeric,
  counted_by uuid,
  counted_at timestamptz,
  needs_recount boolean,
  is_final boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_ss record;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT s.branch_id, s.tenant_id
  INTO v_ss
  FROM public.stocktake_sessions s
  WHERE s.id = p_session_id;

  IF NOT FOUND OR v_ss.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_ss.branch_id, 'inventory:stocktake_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    sl.id,
    sl.ingredient_id,
    ing.name,
    public.inventory_entry_unit_code(v_tenant, ing.id, NULL),
    sl.abc_class,
    sl.round_no,
    sl.counted_quantity,
    sl.counted_by,
    sl.counted_at,
    sl.needs_recount,
    sl.is_final
  FROM public.stocktake_lines sl
  JOIN public.ingredients ing ON ing.id = sl.ingredient_id
  WHERE sl.session_id = p_session_id
  ORDER BY sl.round_no, ing.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stocktake_lines_blind(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stocktake_lines_blind(bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prevent_recipe_entry_unit_invalidation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.unit_id IS NOT DISTINCT FROM NEW.unit_id
       AND (OLD.is_active IS NOT TRUE OR NEW.is_active IS TRUE) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.recipes r
    WHERE r.tenant_id = OLD.tenant_id
      AND r.ingredient_id = OLD.ingredient_id
      AND r.entry_unit_id = OLD.unit_id
  ) THEN
    RAISE EXCEPTION 'ingredient_unit_in_use_by_recipe' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.production_recipes pr
    WHERE pr.tenant_id = OLD.tenant_id
      AND pr.ingredient_id = OLD.ingredient_id
      AND pr.entry_unit_id = OLD.unit_id
  ) THEN
    RAISE EXCEPTION 'ingredient_unit_in_use_by_production_recipe' USING ERRCODE = '23503';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_recipe_entry_unit_invalidation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_recipe_entry_unit_invalidation() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_recipe_entry_unit_invalidation ON public.ingredient_units;
DROP TRIGGER IF EXISTS trg_prevent_recipe_entry_unit_delete ON public.ingredient_units;
DROP TRIGGER IF EXISTS trg_prevent_recipe_entry_unit_update ON public.ingredient_units;

CREATE TRIGGER trg_prevent_recipe_entry_unit_delete
BEFORE DELETE ON public.ingredient_units
FOR EACH ROW
EXECUTE FUNCTION public.prevent_recipe_entry_unit_invalidation();

CREATE TRIGGER trg_prevent_recipe_entry_unit_update
BEFORE UPDATE OF is_active, unit_id ON public.ingredient_units
FOR EACH ROW
EXECUTE FUNCTION public.prevent_recipe_entry_unit_invalidation();

COMMIT;
