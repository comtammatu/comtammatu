-- Ensure operational branches always have the inventory locations required by
-- intra-branch Cap bep and POS consumption flows.
--
-- Contract:
-- - branch_kind = 'branch' must have an active warehouse location.
-- - branch_kind = 'branch' must have an active kitchen marked
--   is_default_consumption = true.
-- - branch and branch branches are intentionally excluded.

CREATE OR REPLACE FUNCTION public.ensure_branch_inventory_location_defaults(
  p_tenant_id BIGINT,
  p_branch_id BIGINT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_kind TEXT;
  v_warehouse_id BIGINT;
  v_kitchen_id BIGINT;
  v_needs_default_receive BOOLEAN;
  v_needs_default_issue BOOLEAN;
BEGIN
  SELECT branch_kind
  INTO v_branch_kind
  FROM public.branches
  WHERE id = p_branch_id
    AND tenant_id = p_tenant_id;

  IF NOT FOUND OR v_branch_kind IS DISTINCT FROM 'branch' THEN
    RETURN;
  END IF;

  SELECT il.id
  INTO v_warehouse_id
  FROM public.inventory_locations il
  WHERE il.tenant_id = p_tenant_id
    AND il.branch_id = p_branch_id
    AND il.location_kind = 'warehouse'
    AND il.is_active = TRUE
  ORDER BY il.is_default_receive DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  v_needs_default_receive := NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations il
    WHERE il.tenant_id = p_tenant_id
      AND il.branch_id = p_branch_id
      AND il.is_default_receive = TRUE
      AND il.is_active = TRUE
  );

  v_needs_default_issue := NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations il
    WHERE il.tenant_id = p_tenant_id
      AND il.branch_id = p_branch_id
      AND il.is_default_issue = TRUE
      AND il.is_active = TRUE
  );

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
      U&'Kho chi nh\00E1nh',
      'warehouse',
      TRUE,
      v_needs_default_receive,
      v_needs_default_issue,
      FALSE,
      0
    )
    ON CONFLICT (code, branch_id, tenant_id) DO UPDATE
    SET name = EXCLUDED.name,
        location_kind = 'warehouse',
        is_active = TRUE,
        is_default_receive = EXCLUDED.is_default_receive,
        is_default_issue = EXCLUDED.is_default_issue,
        is_default_consumption = FALSE,
        sort_order = EXCLUDED.sort_order,
        updated_at = now()
    RETURNING id INTO v_warehouse_id;
  ELSE
    IF v_needs_default_receive THEN
      UPDATE public.inventory_locations
      SET is_default_receive = TRUE,
          updated_at = now()
      WHERE id = v_warehouse_id;
    END IF;

    IF v_needs_default_issue THEN
      UPDATE public.inventory_locations
      SET is_default_issue = TRUE,
          updated_at = now()
      WHERE id = v_warehouse_id;
    END IF;
  END IF;

  SELECT il.id
  INTO v_kitchen_id
  FROM public.inventory_locations il
  WHERE il.tenant_id = p_tenant_id
    AND il.branch_id = p_branch_id
    AND il.location_kind = 'kitchen'
    AND il.is_active = TRUE
    AND il.is_default_consumption = TRUE
  ORDER BY il.sort_order NULLS LAST, il.id
  LIMIT 1;

  IF v_kitchen_id IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.inventory_locations
  SET is_default_consumption = FALSE,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND is_active = TRUE
    AND is_default_consumption = TRUE;

  SELECT il.id
  INTO v_kitchen_id
  FROM public.inventory_locations il
  WHERE il.tenant_id = p_tenant_id
    AND il.branch_id = p_branch_id
    AND il.location_kind = 'kitchen'
    AND il.is_active = TRUE
  ORDER BY il.sort_order NULLS LAST, il.id
  LIMIT 1;

  IF v_kitchen_id IS NOT NULL THEN
    UPDATE public.inventory_locations
    SET is_default_consumption = TRUE,
        updated_at = now()
    WHERE id = v_kitchen_id;
    RETURN;
  END IF;

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
    'kitchen',
    U&'B\1EBFp',
    'kitchen',
    TRUE,
    FALSE,
    FALSE,
    TRUE,
    10
  )
  ON CONFLICT (code, branch_id, tenant_id) DO UPDATE
  SET name = EXCLUDED.name,
      location_kind = 'kitchen',
      is_active = TRUE,
      is_default_receive = FALSE,
      is_default_issue = FALSE,
      is_default_consumption = TRUE,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_branch_inventory_location_defaults(BIGINT, BIGINT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trg_ensure_branch_inventory_location_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.branch_kind = 'branch' THEN
    PERFORM public.ensure_branch_inventory_location_defaults(NEW.tenant_id, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_ensure_branch_inventory_location_defaults() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_branches_ensure_inventory_locations ON public.branches;

CREATE TRIGGER trg_branches_ensure_inventory_locations
  AFTER INSERT OR UPDATE OF branch_kind ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ensure_branch_inventory_location_defaults();

DO $$
DECLARE
  v_branch RECORD;
BEGIN
  FOR v_branch IN
    SELECT tenant_id, id
    FROM public.branches
    WHERE branch_kind = 'branch'
  LOOP
    PERFORM public.ensure_branch_inventory_location_defaults(
      v_branch.tenant_id,
      v_branch.id
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_missing_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_missing_count
  FROM public.branches b
  WHERE b.branch_kind = 'branch'
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.inventory_locations wh
        WHERE wh.tenant_id = b.tenant_id
          AND wh.branch_id = b.id
          AND wh.location_kind = 'warehouse'
          AND wh.is_active = TRUE
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.inventory_locations kit
        WHERE kit.tenant_id = b.tenant_id
          AND kit.branch_id = b.id
          AND kit.location_kind = 'kitchen'
          AND kit.is_default_consumption = TRUE
          AND kit.is_active = TRUE
      )
    );

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'branch_inventory_location_defaults_missing:%', v_missing_count
      USING ERRCODE = '23514';
  END IF;
END;
$$;
