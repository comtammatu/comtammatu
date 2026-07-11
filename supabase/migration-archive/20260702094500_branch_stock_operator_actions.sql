UPDATE public.role_templates
SET permission_keys = ARRAY(
  SELECT DISTINCT unnest(COALESCE(permission_keys, ARRAY[]::text[]) || ARRAY['inventory:writeoff']) ORDER BY 1
)
WHERE position_code = 'branch_manager';

INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template,
  granted_at,
  valid_from
)
SELECT
  p.id,
  p.tenant_id,
  p.branch_id,
  'inventory:writeoff',
  rt.id,
  now(),
  now()
FROM public.profiles p
JOIN public.positions po
  ON po.id = p.position_id
 AND po.tenant_id = p.tenant_id
LEFT JOIN public.role_templates rt
  ON rt.tenant_id = p.tenant_id
 AND rt.position_code = 'branch_manager'
WHERE po.code = 'branch_manager'
  AND p.branch_id IS NOT NULL
  AND p.is_active IS DISTINCT FROM false
ON CONFLICT (user_id, branch_id, permission_key) WHERE branch_id IS NOT NULL
DO UPDATE SET
  source_template = COALESCE(public.staff_permissions.source_template, EXCLUDED.source_template);

CREATE OR REPLACE FUNCTION public.create_stock_transfer_draft(
  p_from_branch_id bigint,
  p_to_branch_id bigint,
  p_transfer_number text,
  p_notes text DEFAULT NULL::text,
  p_vehicle_info text DEFAULT NULL::text,
  p_lines jsonb DEFAULT '[]'::jsonb,
  p_from_location_id bigint DEFAULT NULL::bigint,
  p_to_location_id bigint DEFAULT NULL::bigint
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_tenant       BIGINT := public.auth_tenant_id();
  v_role         TEXT := public.auth_role();
  v_branch_claim BIGINT := public.auth_branch_id();
  v_transfer_id  BIGINT;
  v_is_intra     BOOLEAN := (p_from_branch_id = p_to_branch_id);
  v_from_kind    TEXT;
  v_to_kind      TEXT;
  v_from_loc     RECORD;
  v_to_loc       RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_not_found' USING ERRCODE = '22023';
  END IF;

  SELECT branch_kind INTO v_from_kind
  FROM public.branches
  WHERE id = p_from_branch_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  SELECT branch_kind INTO v_to_kind
  FROM public.branches
  WHERE id = p_to_branch_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF v_from_kind IS NULL OR v_to_kind IS NULL THEN
    RAISE EXCEPTION 'transfer_branch_invalid' USING ERRCODE = '23514';
  END IF;

  IF p_from_location_id IS NULL THEN
    RAISE EXCEPTION 'transfer_from_location_missing' USING ERRCODE = '23502';
  END IF;

  IF p_to_location_id IS NULL THEN
    RAISE EXCEPTION 'transfer_to_location_missing' USING ERRCODE = '23502';
  END IF;

  SELECT id, branch_id, location_kind, is_default_consumption
  INTO v_from_loc
  FROM public.inventory_locations
  WHERE id = p_from_location_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF NOT FOUND OR v_from_loc.branch_id <> p_from_branch_id THEN
    RAISE EXCEPTION 'transfer_from_location_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT id, branch_id, location_kind, is_default_consumption
  INTO v_to_loc
  FROM public.inventory_locations
  WHERE id = p_to_location_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF NOT FOUND OR v_to_loc.branch_id <> p_to_branch_id THEN
    RAISE EXCEPTION 'transfer_to_location_invalid' USING ERRCODE = '23514';
  END IF;

  IF v_is_intra THEN
    IF v_from_kind <> 'branch' OR v_to_kind <> 'branch' THEN
      RAISE EXCEPTION 'intra_branch_requires_branch_site' USING ERRCODE = '23514';
    END IF;

    IF p_from_location_id = p_to_location_id THEN
      RAISE EXCEPTION 'intra_branch_same_location' USING ERRCODE = '22023';
    END IF;

    IF v_from_loc.location_kind <> 'warehouse' THEN
      RAISE EXCEPTION 'intra_branch_source_must_be_warehouse' USING ERRCODE = '23514';
    END IF;

    IF v_to_loc.location_kind <> 'kitchen' THEN
      RAISE EXCEPTION 'intra_branch_target_must_be_kitchen' USING ERRCODE = '23514';
    END IF;

    IF v_to_loc.is_default_consumption IS DISTINCT FROM TRUE THEN
      RAISE WARNING 'default_consumption_location_not_marked:branch %, location %',
        p_to_branch_id,
        p_to_location_id;
    END IF;
  ELSE
    IF v_role = 'branch_manager' THEN
      IF v_branch_claim IS NULL OR p_to_branch_id <> v_branch_claim THEN
        RAISE EXCEPTION 'branch_manager_inbound_request_forbidden' USING ERRCODE = '42501';
      END IF;

      IF v_to_kind <> 'branch' OR v_from_kind NOT IN ('central_supply', 'central_kitchen') THEN
        RAISE EXCEPTION 'branch_manager_inbound_request_source_invalid' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF v_role = 'branch_manager' THEN
    IF NOT public.has_permission(p_to_branch_id, 'inventory:transfer_create') THEN
      RAISE EXCEPTION 'forbidden_transfer_create' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_permission(p_from_branch_id, 'inventory:transfer_create') THEN
      RAISE EXCEPTION 'forbidden_transfer_create' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'transfer_lines_invalid' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_lines) AS line(value)
    LEFT JOIN public.ingredients i
      ON i.id = (line.value->>'ingredientId')::BIGINT
     AND i.tenant_id = v_tenant
    WHERE NOT (line.value ? 'ingredientId')
       OR NOT (line.value ? 'quantity')
       OR NOT (line.value ? 'unit')
       OR (line.value->>'quantity')::NUMERIC <= 0
       OR NULLIF(BTRIM(line.value->>'unit'), '') IS NULL
       OR i.id IS NULL
  ) THEN
    RAISE EXCEPTION 'transfer_lines_invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stock_transfers (
    tenant_id,
    from_branch_id,
    to_branch_id,
    from_location_id,
    to_location_id,
    transfer_number,
    status,
    notes,
    vehicle_info,
    created_by
  ) VALUES (
    v_tenant,
    p_from_branch_id,
    p_to_branch_id,
    p_from_location_id,
    p_to_location_id,
    p_transfer_number,
    'draft',
    p_notes,
    CASE WHEN v_is_intra THEN NULL ELSE p_vehicle_info END,
    v_uid
  )
  RETURNING id INTO v_transfer_id;

  INSERT INTO public.stock_transfer_items (
    tenant_id,
    transfer_id,
    ingredient_id,
    quantity,
    unit,
    entry_unit_id,
    unit_cost_at_ship
  )
  SELECT
    v_tenant,
    v_transfer_id,
    (line.value->>'ingredientId')::BIGINT,
    (line.value->>'quantity')::NUMERIC(15,3),
    NULLIF(BTRIM(line.value->>'unit'), ''),
    NULLIF(line.value->>'entryUnitId', '')::BIGINT,
    (
      SELECT sl.avg_unit_cost
      FROM public.stock_levels sl
      WHERE sl.tenant_id = v_tenant
        AND sl.branch_id = p_from_branch_id
        AND sl.location_id = p_from_location_id
        AND sl.ingredient_id = (line.value->>'ingredientId')::BIGINT
      LIMIT 1
    )
  FROM jsonb_array_elements(p_lines) AS line(value)
  ON CONFLICT (transfer_id, ingredient_id, tenant_id)
  DO UPDATE SET
    quantity = EXCLUDED.quantity,
    unit = EXCLUDED.unit,
    entry_unit_id = EXCLUDED.entry_unit_id,
    unit_cost_at_ship = EXCLUDED.unit_cost_at_ship;

  RETURN jsonb_build_object('id', v_transfer_id, 'status', 'draft');
END;
$$;

REVOKE ALL ON FUNCTION public.create_stock_transfer_draft(
  bigint,
  bigint,
  text,
  text,
  text,
  jsonb,
  bigint,
  bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer_draft(
  bigint,
  bigint,
  text,
  text,
  text,
  jsonb,
  bigint,
  bigint
) TO authenticated, service_role;
