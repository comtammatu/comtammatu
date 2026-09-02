-- Migration: align_inventory_threshold_catalog_authority

-- Keep the threshold master-data RPC on the same authority boundary as the
-- ingredient catalog. Operational inventory:write alone must not grant access.
CREATE OR REPLACE FUNCTION public.update_ingredient_thresholds_bulk(
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_row jsonb;
  v_value numeric;
  v_field text;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT (
    public.has_permission_any('inventory:catalog_write')
    OR public.has_position('central_supply_ops')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NOT NULL
     AND jsonb_typeof(p_payload) = 'array' THEN
    FOR v_row IN
      SELECT item.value
      FROM jsonb_array_elements(p_payload) AS item(value)
    LOOP
      FOREACH v_field IN ARRAY ARRAY[
        'min_stock_level',
        'max_stock_level',
        'reorder_point'
      ]::text[]
      LOOP
        IF v_row ? v_field
           AND v_row ->> v_field IS NOT NULL
           AND v_row ->> v_field <> '' THEN
          v_value := (v_row ->> v_field)::numeric;
          IF v_value = 'NaN'::numeric
             OR v_value = 'Infinity'::numeric
             OR v_value = '-Infinity'::numeric THEN
            RAISE EXCEPTION 'thresholds.bulk: non-finite value'
              USING ERRCODE = '22023';
          END IF;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  RETURN private.execute_update_ingredient_thresholds_bulk(p_payload);
END;
$$;

REVOKE ALL ON FUNCTION public.update_ingredient_thresholds_bulk(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_ingredient_thresholds_bulk(jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.update_ingredient_thresholds_bulk(jsonb) IS
  'Bulk-update ingredient thresholds atomically; capability-gated by inventory:catalog_write with the central_supply_ops position adapter.';

-- The stock screen exposes location overrides to every inventory operator.
-- Preserve own-site scope for branch/kitchen actors while allowing the
-- tenant-wide warehouse coordinator to manage every operational site.
CREATE OR REPLACE FUNCTION public.upsert_branch_stock_thresholds(
  p_branch_id bigint,
  p_location_id bigint,
  p_thresholds jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_item jsonb;
  v_ingredient_id bigint;
  v_min_stock numeric;
  v_target_stock numeric;
  v_reorder_quantity numeric;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('inventory:write')
     OR NOT (
       public.auth_role() = 'owner'
       OR public.has_position('central_supply_ops')
       OR (
         public.auth_role() IN ('central_kitchen_lead', 'branch_manager')
         AND public.auth_branch_id() IS NOT DISTINCT FROM p_branch_id
       )
     ) THEN
    RAISE EXCEPTION 'forbidden_threshold_write' USING ERRCODE = '42501';
  END IF;

  IF p_thresholds IS NULL OR jsonb_typeof(p_thresholds) <> 'array' THEN
    RAISE EXCEPTION 'threshold_payload_invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_thresholds) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'threshold_payload_size_invalid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = p_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = p_branch_id
      AND location.is_active
      AND location.location_kind IN ('warehouse', 'kitchen')
  ) THEN
    RAISE EXCEPTION 'threshold_location_invalid' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_thresholds)
  LOOP
    v_ingredient_id := nullif(v_item ->> 'ingredient_id', '')::bigint;
    v_min_stock := coalesce(
      nullif(v_item ->> 'min_stock_level', '')::numeric,
      0
    );
    v_target_stock := coalesce(
      nullif(v_item ->> 'target_stock_level', '')::numeric,
      v_min_stock * 2
    );
    v_reorder_quantity := nullif(
      v_item ->> 'reorder_quantity',
      ''
    )::numeric;

    IF v_ingredient_id IS NULL
       OR v_min_stock < 0
       OR v_target_stock < v_min_stock
       OR v_min_stock IN (
         'NaN'::numeric,
         'Infinity'::numeric,
         '-Infinity'::numeric
       )
       OR v_target_stock IN (
         'NaN'::numeric,
         'Infinity'::numeric,
         '-Infinity'::numeric
       )
       OR (
         v_reorder_quantity IS NOT NULL
         AND v_reorder_quantity IN (
           'NaN'::numeric,
           'Infinity'::numeric,
           '-Infinity'::numeric
         )
       )
       OR NOT EXISTS (
         SELECT 1
         FROM public.ingredients AS ingredient
         WHERE ingredient.id = v_ingredient_id
           AND ingredient.tenant_id = v_tenant
           AND ingredient.is_active
       ) THEN
      RAISE EXCEPTION 'threshold_item_invalid' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.branch_ingredient_thresholds (
      tenant_id,
      branch_id,
      location_id,
      ingredient_id,
      min_stock_level,
      target_stock_level,
      reorder_quantity,
      is_active,
      updated_at
    ) VALUES (
      v_tenant,
      p_branch_id,
      p_location_id,
      v_ingredient_id,
      v_min_stock,
      v_target_stock,
      CASE
        WHEN v_reorder_quantity > 0 THEN v_reorder_quantity
        ELSE NULL
      END,
      TRUE,
      now()
    ) ON CONFLICT (
      tenant_id,
      branch_id,
      location_id,
      ingredient_id
    ) DO UPDATE SET
      min_stock_level = excluded.min_stock_level,
      target_stock_level = excluded.target_stock_level,
      reorder_quantity = excluded.reorder_quantity,
      is_active = TRUE,
      updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  PERFORM public.log_audit(
    'inventory.thresholds.location_updated',
    'inventory_location',
    p_location_id,
    NULL,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'updated_count', v_count
    )
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'branch_id', p_branch_id,
    'location_id', p_location_id,
    'updated_count', v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_branch_stock_thresholds(
  bigint,
  bigint,
  jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_branch_stock_thresholds(
  bigint,
  bigint,
  jsonb
) TO authenticated, service_role;

COMMENT ON FUNCTION public.upsert_branch_stock_thresholds(
  bigint,
  bigint,
  jsonb
) IS
  'Upsert location-specific thresholds for owner, tenant-wide central supply, or own-site central kitchen/branch operators with inventory:write.';
