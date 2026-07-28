-- Greenfield: every active operational site has exactly one active warehouse.
-- Historical location kinds remain readable but cannot be active.

SET search_path = '';

CREATE OR REPLACE FUNCTION public.ensure_branch_inventory_location_defaults(
  p_tenant_id bigint,
  p_branch_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_branch_kind text;
  v_branch_active boolean;
  v_warehouse_id bigint;
  v_warehouse_name text;
BEGIN
  SELECT b.branch_kind, b.is_active
  INTO v_branch_kind, v_branch_active
  FROM public.branches AS b
  WHERE b.id = p_branch_id
    AND b.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_branch_active IS DISTINCT FROM TRUE
     OR v_branch_kind NOT IN ('branch', 'central_supply', 'central_kitchen') THEN
    RETURN;
  END IF;

  v_warehouse_name := CASE v_branch_kind
    WHEN 'central_supply' THEN 'Kho Tổng'
    WHEN 'central_kitchen' THEN 'Kho Bếp Trung Tâm'
    ELSE 'Kho chi nhánh'
  END;

  SELECT il.id
  INTO v_warehouse_id
  FROM public.inventory_locations AS il
  WHERE il.tenant_id = p_tenant_id
    AND il.branch_id = p_branch_id
    AND il.location_kind = 'warehouse'
  ORDER BY il.is_active DESC, il.is_default_receive DESC,
    il.sort_order NULLS LAST, il.id
  LIMIT 1
  FOR UPDATE;

  IF v_warehouse_id IS NULL THEN
    INSERT INTO public.inventory_locations (
      tenant_id,
      branch_id,
      code,
      name,
      location_kind,
      is_active,
      is_default_receive,
      is_default_issue,
      is_default_consumption,
      sort_order
    )
    VALUES (
      p_tenant_id,
      p_branch_id,
      'main_warehouse',
      v_warehouse_name,
      'warehouse',
      FALSE,
      FALSE,
      FALSE,
      FALSE,
      0
    )
    RETURNING id INTO v_warehouse_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_locations AS other
    JOIN public.stock_levels AS sl
      ON sl.tenant_id = other.tenant_id
     AND sl.branch_id = other.branch_id
     AND sl.location_id = other.id
    WHERE other.tenant_id = p_tenant_id
      AND other.branch_id = p_branch_id
      AND other.id <> v_warehouse_id
      AND other.is_active = TRUE
      AND sl.current_quantity IS DISTINCT FROM 0
  ) THEN
    RAISE EXCEPTION 'inventory_location_consolidation_required'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.inventory_locations
  SET is_active = FALSE,
      is_default_receive = FALSE,
      is_default_issue = FALSE,
      is_default_consumption = FALSE,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND id <> v_warehouse_id
    AND (
      is_active = TRUE
      OR is_default_receive = TRUE
      OR is_default_issue = TRUE
      OR is_default_consumption = TRUE
    );

  UPDATE public.inventory_locations
  SET name = v_warehouse_name,
      location_kind = 'warehouse',
      is_active = TRUE,
      is_default_receive = TRUE,
      is_default_issue = TRUE,
      is_default_consumption = TRUE,
      sort_order = 0,
      updated_at = now()
  WHERE id = v_warehouse_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_branch_inventory_location_defaults(bigint, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_branch_inventory_location_defaults(bigint, bigint)
  TO service_role;

DO $$
DECLARE
  v_site record;
BEGIN
  FOR v_site IN
    SELECT b.tenant_id, b.id
    FROM public.branches AS b
    WHERE b.is_active = TRUE
      AND b.branch_kind IN ('branch', 'central_supply', 'central_kitchen')
    ORDER BY b.tenant_id, b.id
  LOOP
    PERFORM public.ensure_branch_inventory_location_defaults(
      v_site.tenant_id,
      v_site.id
    );
  END LOOP;
END;
$$;

ALTER TABLE public.inventory_locations
  ADD CONSTRAINT inventory_locations_active_site_warehouse_chk
  CHECK (
    NOT is_active
    OR (
      location_kind = 'warehouse'
      AND is_default_receive
      AND is_default_issue
      AND is_default_consumption
    )
  ) NOT VALID;

ALTER TABLE public.inventory_locations
  VALIDATE CONSTRAINT inventory_locations_active_site_warehouse_chk;

CREATE UNIQUE INDEX inventory_locations_one_active_per_site_idx
  ON public.inventory_locations (tenant_id, branch_id)
  WHERE is_active = TRUE;

CREATE OR REPLACE FUNCTION public.trg_assert_active_site_has_warehouse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.branches AS b
    WHERE b.is_active = TRUE
      AND b.branch_kind IN ('branch', 'central_supply', 'central_kitchen')
      AND NOT EXISTS (
        SELECT 1
        FROM public.inventory_locations AS il
        WHERE il.tenant_id = b.tenant_id
          AND il.branch_id = b.id
          AND il.location_kind = 'warehouse'
          AND il.is_active = TRUE
          AND il.is_default_receive = TRUE
          AND il.is_default_issue = TRUE
          AND il.is_default_consumption = TRUE
      )
  ) THEN
    RAISE EXCEPTION 'active_site_warehouse_required'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_assert_active_site_has_warehouse()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_branches_ensure_inventory_locations
  ON public.branches;
CREATE TRIGGER trg_branches_ensure_inventory_locations
  AFTER INSERT OR UPDATE OF branch_kind, is_active
  ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ensure_branch_inventory_location_defaults();

CREATE CONSTRAINT TRIGGER trg_inventory_locations_active_site_warehouse
  AFTER INSERT OR UPDATE OR DELETE
  ON public.inventory_locations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_assert_active_site_has_warehouse();

CREATE CONSTRAINT TRIGGER trg_branches_active_site_warehouse
  AFTER INSERT OR UPDATE OR DELETE
  ON public.branches
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_assert_active_site_has_warehouse();

DO $$
DECLARE
  v_signature regprocedure;
  v_sql text;
  v_before text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.branch_manager_approve_consumption_report(bigint,bigint)'::regprocedure,
    'public.consume_stock_for_order(bigint)'::regprocedure,
    'public.consume_stock_for_order_service(bigint,uuid)'::regprocedure,
    'public.create_production_run_with_locations(bigint,bigint,numeric,bigint,text,bigint,jsonb,bigint,bigint)'::regprocedure,
    'public.get_production_recipe_context_for_location(bigint,bigint,bigint)'::regprocedure
  ]
  LOOP
    SELECT pg_catalog.pg_get_functiondef(v_signature::oid)
    INTO v_sql;
    v_before := v_sql;

    v_sql := pg_catalog.replace(
      v_sql,
      'location_kind = ''kitchen''',
      'location_kind = ''warehouse'''
    );
    v_sql := pg_catalog.replace(
      v_sql,
      'location_kind = ''production_storage''',
      'location_kind = ''warehouse'''
    );
    v_sql := pg_catalog.replace(
      v_sql,
      'using kitchen location',
      'using warehouse location'
    );

    IF v_sql = v_before THEN
      RAISE EXCEPTION 'warehouse_routing_patch_not_applied:%', v_signature
        USING ERRCODE = '23514';
    END IF;

    EXECUTE v_sql;
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_signature regprocedure;
  v_source text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.branch_manager_approve_consumption_report(bigint,bigint)'::regprocedure,
    'public.consume_stock_for_order(bigint)'::regprocedure,
    'public.consume_stock_for_order_service(bigint,uuid)'::regprocedure,
    'public.create_production_run_with_locations(bigint,bigint,numeric,bigint,text,bigint,jsonb,bigint,bigint)'::regprocedure,
    'public.get_production_recipe_context_for_location(bigint,bigint,bigint)'::regprocedure
  ]
  LOOP
    SELECT p.prosrc
    INTO v_source
    FROM pg_catalog.pg_proc AS p
    WHERE p.oid = v_signature::oid;

    IF v_source LIKE '%location_kind = ''kitchen''%'
       OR v_source LIKE '%location_kind = ''production_storage''%' THEN
      RAISE EXCEPTION 'legacy_inventory_routing_remains:%', v_signature
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
END;
$$;
