-- Every store branch owns exactly one warehouse and one kitchen. Central Supply and
-- Central Kitchen remain single-warehouse sites. The legacy split flag is kept
-- only as a compatibility marker for functions introduced by ADR 0048.

CREATE OR REPLACE FUNCTION private.assert_inventory_site_warehouse(
  p_tenant_id bigint,
  p_branch_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_branch_kind text;
  v_warehouse_count integer;
  v_kitchen_count integer;
  v_receive_count integer;
  v_issue_count integer;
  v_consumption_count integer;
  v_consumption_kind text;
BEGIN
  SELECT branch.branch_kind
  INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.tenant_id = p_tenant_id
    AND branch.is_active;

  IF NOT FOUND OR v_branch_kind NOT IN (
    'branch', 'central_supply', 'central_kitchen'
  ) THEN
    RETURN;
  END IF;

  SELECT
    count(*) FILTER (WHERE location_kind = 'warehouse')::integer,
    count(*) FILTER (WHERE location_kind = 'kitchen')::integer,
    count(*) FILTER (WHERE is_default_receive)::integer,
    count(*) FILTER (WHERE is_default_issue)::integer,
    count(*) FILTER (WHERE is_default_consumption)::integer,
    max(location_kind) FILTER (WHERE is_default_consumption)
  INTO v_warehouse_count, v_kitchen_count, v_receive_count,
       v_issue_count, v_consumption_count, v_consumption_kind
  FROM public.inventory_locations
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND is_active;

  IF v_warehouse_count <> 1
     OR v_receive_count <> 1
     OR v_issue_count <> 1
     OR v_consumption_count <> 1 THEN
    RAISE EXCEPTION 'inventory_site_defaults_invalid:%', p_branch_id
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_locations
    WHERE tenant_id = p_tenant_id
      AND branch_id = p_branch_id
      AND is_active
      AND (is_default_receive OR is_default_issue)
      AND location_kind <> 'warehouse'
  ) THEN
    RAISE EXCEPTION 'inventory_site_warehouse_must_own_receive_issue:%', p_branch_id
      USING ERRCODE = '23514';
  END IF;

  IF v_branch_kind = 'branch' THEN
    IF v_kitchen_count <> 1
       OR v_consumption_kind <> 'kitchen'
       OR EXISTS (
         SELECT 1
         FROM public.inventory_locations
         WHERE tenant_id = p_tenant_id
           AND branch_id = p_branch_id
           AND is_active
           AND location_kind NOT IN ('warehouse', 'kitchen')
       ) THEN
      RAISE EXCEPTION 'branch_inventory_topology_invalid:%', p_branch_id
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_kitchen_count <> 0 OR v_consumption_kind <> 'warehouse' THEN
    RAISE EXCEPTION 'central_inventory_topology_invalid:%', p_branch_id
      USING ERRCODE = '23514';
  END IF;

  IF v_branch_kind <> 'central_kitchen' AND EXISTS (
    SELECT 1
    FROM public.inventory_locations
    WHERE tenant_id = p_tenant_id
      AND branch_id = p_branch_id
      AND is_active
      AND location_kind = 'production_storage'
  ) THEN
    RAISE EXCEPTION 'production_storage_requires_central_kitchen:%', p_branch_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

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
  v_warehouse_id bigint;
  v_kitchen_id bigint;
  v_warehouse_name text;
BEGIN
  SELECT branch.branch_kind
  INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.tenant_id = p_tenant_id
    AND branch.is_active
  FOR UPDATE;

  IF NOT FOUND OR v_branch_kind NOT IN (
    'branch', 'central_supply', 'central_kitchen'
  ) THEN
    RETURN;
  END IF;

  UPDATE public.inventory_locations
  SET is_default_receive = FALSE,
      is_default_issue = FALSE,
      is_default_consumption = FALSE,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND (
      is_default_receive
      OR is_default_issue
      OR is_default_consumption
    );

  v_warehouse_name := CASE v_branch_kind
    WHEN 'central_supply' THEN 'Kho Tổng'
    WHEN 'central_kitchen' THEN 'Kho Bếp Trung Tâm'
    ELSE 'Kho'
  END;

  SELECT location.id
  INTO v_warehouse_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = p_tenant_id
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
  ORDER BY location.is_active DESC, location.sort_order, location.id
  LIMIT 1
  FOR UPDATE;

  IF v_warehouse_id IS NULL THEN
    INSERT INTO public.inventory_locations (
      tenant_id, branch_id, code, name, location_kind, is_active,
      is_default_receive, is_default_issue, is_default_consumption, sort_order
    ) VALUES (
      p_tenant_id, p_branch_id, 'main_warehouse', v_warehouse_name, 'warehouse',
      TRUE, TRUE, TRUE, v_branch_kind <> 'branch', 0
    ) RETURNING id INTO v_warehouse_id;
  END IF;

  IF v_branch_kind = 'branch' THEN
    SELECT location.id
    INTO v_kitchen_id
    FROM public.inventory_locations AS location
    WHERE location.tenant_id = p_tenant_id
      AND location.branch_id = p_branch_id
      AND location.location_kind = 'kitchen'
    ORDER BY location.is_active DESC, location.sort_order, location.id
    LIMIT 1
    FOR UPDATE;

    IF v_kitchen_id IS NULL THEN
      INSERT INTO public.inventory_locations (
        tenant_id, branch_id, code, name, location_kind, is_active,
        is_default_receive, is_default_issue, is_default_consumption, sort_order
      ) VALUES (
        p_tenant_id, p_branch_id, 'kitchen', 'Bếp', 'kitchen',
        TRUE, FALSE, FALSE, TRUE, 10
      ) RETURNING id INTO v_kitchen_id;
    END IF;
  END IF;

  UPDATE public.inventory_locations
  SET is_default_receive = id = v_warehouse_id,
      is_default_issue = id = v_warehouse_id,
      is_default_consumption = CASE
        WHEN v_branch_kind = 'branch' THEN id = v_kitchen_id
        ELSE id = v_warehouse_id
      END,
      is_active = CASE
        WHEN id = v_warehouse_id THEN TRUE
        WHEN v_branch_kind = 'branch' AND id = v_kitchen_id THEN TRUE
        WHEN location_kind IN ('warehouse', 'kitchen') THEN FALSE
        ELSE is_active
      END,
      name = CASE
        WHEN id = v_warehouse_id THEN v_warehouse_name
        WHEN id = v_kitchen_id THEN 'Bếp'
        ELSE name
      END,
      sort_order = CASE
        WHEN id = v_warehouse_id THEN 0
        WHEN id = v_kitchen_id THEN 10
        ELSE sort_order
      END,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id;

  IF v_branch_kind = 'branch' THEN
    INSERT INTO public.branch_feature_flags (
      branch_id, flag_key, enabled, enabled_at, disabled_at, notes, updated_at
    ) VALUES (
      p_branch_id, 'branch_kitchen_inventory_split', TRUE, now(), NULL,
      'Mandatory branch warehouse-kitchen topology compatibility marker', now()
    ) ON CONFLICT (branch_id, flag_key) DO UPDATE SET
      enabled = TRUE,
      enabled_at = coalesce(branch_feature_flags.enabled_at, now()),
      disabled_at = NULL,
      notes = excluded.notes,
      updated_at = now();

    INSERT INTO public.branch_feature_flags (
      branch_id, flag_key, enabled, enabled_at, disabled_at, updated_at
    ) VALUES (
      p_branch_id, 'pos_stock_outcome_posting', TRUE, now(), NULL, now()
    ) ON CONFLICT (branch_id, flag_key) DO NOTHING;

    UPDATE public.inventory_count_assignments
    SET location_id = v_kitchen_id,
        updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND branch_id = p_branch_id
      AND is_active
      AND location_id IS DISTINCT FROM v_kitchen_id;
  ELSIF v_branch_kind IN ('central_supply', 'central_kitchen') THEN
    DELETE FROM public.branch_feature_flags
    WHERE branch_id = p_branch_id
      AND flag_key = 'branch_kitchen_inventory_split';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_branch_inventory_location_defaults(
  bigint, bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_branch_inventory_location_defaults(
  bigint, bigint
) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_ensure_branch_inventory_location_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.branch_kind IN ('branch', 'central_supply', 'central_kitchen') THEN
    PERFORM public.ensure_branch_inventory_location_defaults(
      NEW.tenant_id,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_ensure_branch_inventory_location_defaults()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_ensure_branch_inventory_location_defaults()
  TO service_role;

DO $backfill_mandatory_branch_locations$
DECLARE
  branch_row record;
BEGIN
  FOR branch_row IN
    SELECT branch.tenant_id, branch.id
    FROM public.branches AS branch
    WHERE branch.is_active
      AND branch.branch_kind IN ('branch', 'central_supply', 'central_kitchen')
    ORDER BY branch.tenant_id, branch.id
  LOOP
    PERFORM public.ensure_branch_inventory_location_defaults(
      branch_row.tenant_id,
      branch_row.id
    );
    PERFORM private.assert_inventory_site_warehouse(
      branch_row.tenant_id,
      branch_row.id
    );
  END LOOP;
END;
$backfill_mandatory_branch_locations$;

DELETE FROM public.branch_feature_flags AS flag
USING public.branches AS branch
WHERE branch.id = flag.branch_id
  AND branch.branch_kind <> 'branch'
  AND flag.flag_key = 'branch_kitchen_inventory_split';

CREATE OR REPLACE FUNCTION private.enforce_mandatory_branch_kitchen_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_branch_kind text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.flag_key <> 'branch_kitchen_inventory_split' THEN
      RETURN OLD;
    END IF;

    SELECT branch.branch_kind
    INTO v_branch_kind
    FROM public.branches AS branch
    WHERE branch.id = OLD.branch_id;

    IF v_branch_kind = 'branch' THEN
      RAISE EXCEPTION 'branch_kitchen_topology_mandatory:%', OLD.branch_id
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.flag_key = 'branch_kitchen_inventory_split'
     AND (
       NEW.flag_key IS DISTINCT FROM OLD.flag_key
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     ) THEN
    SELECT branch.branch_kind
    INTO v_branch_kind
    FROM public.branches AS branch
    WHERE branch.id = OLD.branch_id;

    IF v_branch_kind = 'branch' THEN
      RAISE EXCEPTION 'branch_kitchen_topology_mandatory:%', OLD.branch_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.flag_key <> 'branch_kitchen_inventory_split' THEN
    RETURN NEW;
  END IF;

  SELECT branch.branch_kind
  INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = NEW.branch_id;

  IF v_branch_kind IS DISTINCT FROM 'branch'
     OR NEW.enabled IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'branch_kitchen_topology_mandatory:%', NEW.branch_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS branch_kitchen_topology_mandatory
  ON public.branch_feature_flags;
CREATE TRIGGER branch_kitchen_topology_mandatory
  BEFORE INSERT OR UPDATE OR DELETE ON public.branch_feature_flags
  FOR EACH ROW EXECUTE FUNCTION private.enforce_mandatory_branch_kitchen_flag();

REVOKE EXECUTE ON FUNCTION private.enforce_mandatory_branch_kitchen_flag()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_mandatory_branch_kitchen_flag()
  TO service_role;

DROP FUNCTION public.prepare_branch_kitchen_split(bigint);
DROP FUNCTION public.set_branch_kitchen_split(bigint, boolean, uuid);

COMMENT ON FUNCTION public.ensure_branch_inventory_location_defaults(
  bigint, bigint
) IS
  'Ensures store branches own mandatory warehouse and kitchen locations; central sites own a warehouse only.';
