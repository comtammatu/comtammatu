-- Migration: atomic_count_slip_waste_approval
-- Keep count-slip approval and its shortage writeoff in one transaction.
-- The count snapshot is audit evidence, while each shortage line still carries
-- the photo required by the waste-tier policy.

CREATE OR REPLACE FUNCTION public.approve_inventory_count_slip_with_waste(
  p_slip_id bigint,
  p_photo_urls jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_slip public.inventory_count_slips%ROWTYPE;
  v_items jsonb;
  v_waste jsonb;
  v_approval jsonb;
  v_existing_issue record;
  v_requires_approval boolean := false;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_photo_urls IS NULL OR jsonb_typeof(p_photo_urls) <> 'object' THEN
    RAISE EXCEPTION 'count_slip_waste_photos_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT slip.*
  INTO v_slip
  FROM public.inventory_count_slips AS slip
  WHERE slip.id = p_slip_id
    AND slip.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'slip_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_slip.status NOT IN ('submitted', 'approved') THEN
    RAISE EXCEPTION 'slip_not_submitted' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(v_slip.branch_id, 'inventory:count_approve')
     OR NOT public.has_permission(v_slip.branch_id, 'inventory:writeoff') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.employees AS employee
    WHERE employee.id = v_slip.employee_id
      AND employee.tenant_id = v_tenant
      AND employee.profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'cannot_review_own_slip' USING ERRCODE = '42501';
  END IF;

  SELECT
    issue.id,
    issue.issue_number,
    coalesce(bool_or(item.approval_required), false) AS requires_approval,
    count(item.id)::integer AS item_count
  INTO v_existing_issue
  FROM public.stock_issues AS issue
  LEFT JOIN public.stock_issue_items AS item
    ON item.issue_id = issue.id
   AND item.tenant_id = issue.tenant_id
  WHERE issue.tenant_id = v_tenant
    AND issue.issue_type = 'writeoff'
    AND (
      issue.source_ref @> jsonb_build_object(
        'source', 'count_slip_auto_waste',
        'count_slip_id', p_slip_id
      )
      OR issue.source_ref @> jsonb_build_object('countSlipId', p_slip_id)
    )
  GROUP BY issue.id, issue.issue_number
  ORDER BY issue.id
  LIMIT 1;

  IF v_existing_issue.id IS NOT NULL THEN
    v_approval := public.approve_inventory_count_slip(p_slip_id);
    RETURN coalesce(v_approval, '{}'::jsonb) || jsonb_build_object(
      'waste_created', true,
      'waste_issue_id', v_existing_issue.id,
      'waste_issue_number', v_existing_issue.issue_number,
      'waste_items_count', v_existing_issue.item_count,
      'requires_approval', v_existing_issue.requires_approval
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_count_slip_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.slip_id = p_slip_id
      AND line.system_quantity > coalesce(
        line.counted_base_quantity,
        public.inv_to_base_for_tenant(
          v_tenant,
          line.ingredient_id,
          line.entry_unit_id,
          line.counted_quantity
        )
      )
      AND (
        NOT (p_photo_urls ? line.id::text)
        OR jsonb_typeof(p_photo_urls -> line.id::text) <> 'array'
        OR jsonb_array_length(p_photo_urls -> line.id::text) = 0
        OR jsonb_array_length(p_photo_urls -> line.id::text) > 10
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_photo_urls -> line.id::text)
            AS photo(value)
          WHERE jsonb_typeof(photo.value) <> 'string'
            OR nullif(pg_catalog.btrim(photo.value #>> '{}'), '') IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'count_slip_waste_photo_required'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_count_slip_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.slip_id = p_slip_id
      AND line.system_quantity > coalesce(
        line.counted_base_quantity,
        public.inv_to_base_for_tenant(
          v_tenant,
          line.ingredient_id,
          line.entry_unit_id,
          line.counted_quantity
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.ingredient_units AS ingredient_unit
        WHERE ingredient_unit.tenant_id = v_tenant
          AND ingredient_unit.ingredient_id = line.ingredient_id
          AND ingredient_unit.is_base IS TRUE
          AND ingredient_unit.is_active IS TRUE
      )
  ) THEN
    RAISE EXCEPTION 'count_slip_waste_base_unit_missing'
      USING ERRCODE = '23503';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'ingredient_id', shortage.ingredient_id,
      'quantity', shortage.shortage_quantity,
      'entry_unit_id', shortage.base_unit_id,
      'reason_code', 'spoiled',
      'note', format('Hao hụt kiểm đếm giao ca #%s', v_slip.slip_number),
      'photo_urls', p_photo_urls -> shortage.line_id::text
    )
    ORDER BY shortage.line_id
  )
  INTO v_items
  FROM (
    SELECT
      line.id AS line_id,
      line.ingredient_id,
      base_unit.unit_id AS base_unit_id,
      round(
        line.system_quantity - coalesce(
          line.counted_base_quantity,
          public.inv_to_base_for_tenant(
            v_tenant,
            line.ingredient_id,
            line.entry_unit_id,
            line.counted_quantity
          )
        ),
        3
      )::numeric(15,3) AS shortage_quantity
    FROM public.inventory_count_slip_lines AS line
    JOIN LATERAL (
      SELECT ingredient_unit.unit_id
      FROM public.ingredient_units AS ingredient_unit
      WHERE ingredient_unit.tenant_id = v_tenant
        AND ingredient_unit.ingredient_id = line.ingredient_id
        AND ingredient_unit.is_base IS TRUE
        AND ingredient_unit.is_active IS TRUE
      ORDER BY ingredient_unit.id
      LIMIT 1
    ) AS base_unit ON true
    WHERE line.tenant_id = v_tenant
      AND line.slip_id = p_slip_id
      AND line.system_quantity > coalesce(
        line.counted_base_quantity,
        public.inv_to_base_for_tenant(
          v_tenant,
          line.ingredient_id,
          line.entry_unit_id,
          line.counted_quantity
        )
      )
  ) AS shortage
  WHERE shortage.shortage_quantity > 0;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    v_approval := public.approve_inventory_count_slip(p_slip_id);
    RETURN coalesce(v_approval, '{}'::jsonb) || jsonb_build_object(
      'waste_created', false,
      'waste_items_count', 0,
      'requires_approval', false
    );
  END IF;

  v_waste := private.execute_create_waste_entry(
    v_slip.branch_id,
    v_slip.location_id,
    v_items,
    'manual',
    jsonb_build_object(
      'source', 'count_slip_auto_waste',
      'count_slip_id', p_slip_id,
      'count_slip_number', v_slip.slip_number
    ),
    format('Hao hụt kiểm đếm giao ca #%s', v_slip.slip_number)
  );

  v_approval := public.approve_inventory_count_slip(p_slip_id);
  v_requires_approval := coalesce(
    (v_waste ->> 'requires_approval')::boolean,
    false
  );

  RETURN coalesce(v_approval, '{}'::jsonb) || jsonb_build_object(
    'waste_created', true,
    'waste_issue_id', (v_waste ->> 'issue_id')::bigint,
    'waste_issue_number', v_waste ->> 'issue_number',
    'waste_items_count', jsonb_array_length(v_items),
    'requires_approval', v_requires_approval
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_inventory_count_slip_with_waste(
  bigint,
  jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_inventory_count_slip_with_waste(
  bigint,
  jsonb
) TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_inventory_count_slip_with_waste(
  bigint,
  jsonb
) IS 'Atomically approves a count slip and creates its photo-backed shortage writeoff; safe to retry and supports recovery of approved slips missing the linked writeoff.';

-- Manual writeoffs always require one real image per line. Automated order/KDS
-- sources keep their existing source-owned evidence contracts.
CREATE OR REPLACE FUNCTION public.create_waste_entry(
  p_branch_id bigint,
  p_location_id bigint,
  p_items jsonb,
  p_source_type text DEFAULT 'manual'::text,
  p_source_ref jsonb DEFAULT NULL::jsonb,
  p_notes text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_item jsonb;
  v_ingredient_id bigint;
  v_entry_unit_id bigint;
  v_quantity numeric;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:writeoff') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM location.id
  FROM public.inventory_locations AS location
  JOIN public.branches AS branch
    ON branch.id = location.branch_id
   AND branch.tenant_id = location.tenant_id
   AND branch.is_active IS TRUE
  WHERE location.id = p_location_id
    AND location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
  FOR UPDATE OF location;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_scope_mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'waste_items_invalid' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT item.value
    FROM jsonb_array_elements(p_items) AS item(value)
  LOOP
    v_ingredient_id := nullif(v_item ->> 'ingredient_id', '')::bigint;
    v_entry_unit_id := nullif(v_item ->> 'entry_unit_id', '')::bigint;
    v_quantity := nullif(v_item ->> 'quantity', '')::numeric;

    IF v_ingredient_id IS NULL OR v_entry_unit_id IS NULL
       OR v_quantity IS NULL OR v_quantity <= 0
       OR v_quantity = 'NaN'::numeric
       OR v_quantity = 'Infinity'::numeric
       OR v_quantity = '-Infinity'::numeric THEN
      RAISE EXCEPTION 'waste_item_invalid' USING ERRCODE = '22023';
    END IF;
    IF coalesce(p_source_type, 'manual') = 'manual' THEN
      IF coalesce(jsonb_typeof(v_item -> 'photo_urls'), 'null') <> 'array' THEN
        RAISE EXCEPTION 'waste_photo_required' USING ERRCODE = '22023';
      END IF;
      IF jsonb_array_length(v_item -> 'photo_urls') NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'waste_photo_required' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_item -> 'photo_urls') AS photo(value)
        WHERE jsonb_typeof(photo.value) <> 'string'
          OR nullif(pg_catalog.btrim(photo.value #>> '{}'), '') IS NULL
      ) THEN
        RAISE EXCEPTION 'waste_photo_required' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.ingredients AS ingredient
      JOIN public.ingredient_units AS ingredient_unit
        ON ingredient_unit.ingredient_id = ingredient.id
       AND ingredient_unit.tenant_id = ingredient.tenant_id
       AND ingredient_unit.unit_id = v_entry_unit_id
       AND ingredient_unit.is_active IS TRUE
      JOIN public.units AS unit
        ON unit.id = ingredient_unit.unit_id
       AND unit.tenant_id = ingredient_unit.tenant_id
       AND unit.is_active IS TRUE
      WHERE ingredient.id = v_ingredient_id
        AND ingredient.tenant_id = v_tenant
        AND ingredient.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'waste_item_unit_invalid' USING ERRCODE = '23503';
    END IF;
  END LOOP;

  RETURN private.execute_create_waste_entry(
    p_branch_id,
    p_location_id,
    p_items,
    p_source_type,
    p_source_ref,
    p_notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_waste_entry(
  bigint,
  bigint,
  jsonb,
  text,
  jsonb,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_waste_entry(
  bigint,
  bigint,
  jsonb,
  text,
  jsonb,
  text
) TO authenticated, service_role;
