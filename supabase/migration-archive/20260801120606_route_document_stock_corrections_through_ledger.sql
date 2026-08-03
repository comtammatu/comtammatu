ALTER TABLE public.stock_movements
ADD COLUMN correction_idempotency_key uuid;

ALTER TABLE public.stock_movements
ADD CONSTRAINT stock_movements_document_correction_type_check
CHECK (correction_idempotency_key IS NULL OR type = 'adjustment');

CREATE UNIQUE INDEX stock_movements_document_correction_idempotency_idx
ON public.stock_movements (tenant_id, correction_idempotency_key)
WHERE correction_idempotency_key IS NOT NULL;

CREATE FUNCTION public.create_inventory_document_correction(
  p_document_type text,
  p_document_id bigint,
  p_branch_id bigint,
  p_ingredient_id bigint,
  p_quantity_change numeric,
  p_reason text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_source_code text;
  v_source_label text;
  v_location_id bigint;
  v_entry_unit_id bigint;
  v_entry_to_base_factor numeric(18,12);
  v_movement_id bigint;
  v_current_quantity numeric(15,3);
  v_existing public.stock_movements%ROWTYPE;
  v_grn_id bigint;
  v_issue_id bigint;
  v_transfer_id bigint;
  v_production_run_id bigint;
  v_grn record;
  v_issue record;
  v_transfer record;
  v_run record;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_document_type IS NULL
     OR p_document_type NOT IN ('grn', 'issue', 'transfer', 'production_run')
     OR p_document_id IS NULL
     OR p_document_id <= 0
     OR p_branch_id IS NULL
     OR p_branch_id <= 0
     OR p_ingredient_id IS NULL
     OR p_ingredient_id <= 0
     OR p_quantity_change IS NULL
     OR p_quantity_change = 0
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'invalid_document_correction' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_reason) < 10 OR pg_catalog.length(v_reason) > 500 THEN
    RAISE EXCEPTION 'invalid_document_correction_reason' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = v_actor
      AND profile.tenant_id = v_tenant
      AND coalesce(profile.is_active, TRUE)
  ) OR NOT public.has_permission(p_branch_id, 'inventory:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_document_type = 'grn' THEN
    SELECT note.id, note.branch_id, note.location_id, note.status, note.grn_number
    INTO v_grn
    FROM public.goods_received_notes AS note
    WHERE note.id = p_document_id
      AND note.tenant_id = v_tenant
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'source_document_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_grn.status <> 'confirmed' THEN
      RAISE EXCEPTION 'source_document_not_posted' USING ERRCODE = '23514';
    END IF;
    IF v_grn.branch_id <> p_branch_id THEN
      RAISE EXCEPTION 'source_scope_mismatch' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.grn_items AS item
      WHERE item.tenant_id = v_tenant
        AND item.grn_id = v_grn.id
        AND item.ingredient_id = p_ingredient_id
    ) THEN
      RAISE EXCEPTION 'source_ingredient_missing' USING ERRCODE = '23514';
    END IF;
    v_grn_id := v_grn.id;
    v_location_id := v_grn.location_id;
    v_source_code := v_grn.grn_number;
    v_source_label := 'Phiếu nhập';
  ELSIF p_document_type = 'issue' THEN
    SELECT issue.id, issue.branch_id, issue.source_location_id, issue.status,
           issue.issue_number, issue.source_ref
    INTO v_issue
    FROM public.stock_issues AS issue
    WHERE issue.id = p_document_id
      AND issue.tenant_id = v_tenant
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'source_document_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_issue.status <> 'confirmed' THEN
      RAISE EXCEPTION 'source_document_not_posted' USING ERRCODE = '23514';
    END IF;
    IF v_issue.branch_id <> p_branch_id THEN
      RAISE EXCEPTION 'source_scope_mismatch' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.stock_issue_items AS item
      WHERE item.tenant_id = v_tenant
        AND item.issue_id = v_issue.id
        AND item.ingredient_id = p_ingredient_id
    ) THEN
      RAISE EXCEPTION 'source_ingredient_missing' USING ERRCODE = '23514';
    END IF;
    v_issue_id := v_issue.id;
    v_location_id := v_issue.source_location_id;
    v_source_code := v_issue.issue_number;
    v_source_label := 'Phiếu xuất';
    IF v_issue.source_ref ->> 'source' = 'attendance_consumption_report' THEN
      v_source_label := v_source_label || ' ' || v_source_code || ' - '
        || coalesce(
          nullif(v_issue.source_ref ->> 'source_label', ''),
          'Nhân sự - Tiêu hao bếp trong ngày'
        );
      v_source_code := NULL;
    END IF;
  ELSIF p_document_type = 'transfer' THEN
    SELECT transfer.id, transfer.from_branch_id, transfer.to_branch_id,
           transfer.from_location_id, transfer.to_location_id,
           transfer.status, transfer.transfer_number
    INTO v_transfer
    FROM public.stock_transfers AS transfer
    WHERE transfer.id = p_document_id
      AND transfer.tenant_id = v_tenant
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'source_document_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_transfer.status NOT IN (
      'confirmed_ship', 'in_transit', 'confirmed_receive', 'received'
    ) THEN
      RAISE EXCEPTION 'source_document_not_posted' USING ERRCODE = '23514';
    END IF;
    IF p_branch_id NOT IN (v_transfer.from_branch_id, v_transfer.to_branch_id)
       OR (
         v_transfer.status <> 'received'
         AND p_branch_id <> v_transfer.from_branch_id
       ) THEN
      RAISE EXCEPTION 'source_scope_mismatch' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.stock_transfer_items AS item
      WHERE item.tenant_id = v_tenant
        AND item.transfer_id = v_transfer.id
        AND item.ingredient_id = p_ingredient_id
    ) THEN
      RAISE EXCEPTION 'source_ingredient_missing' USING ERRCODE = '23514';
    END IF;
    v_transfer_id := v_transfer.id;
    v_location_id := CASE
      WHEN p_branch_id = v_transfer.from_branch_id
        THEN v_transfer.from_location_id
      ELSE v_transfer.to_location_id
    END;
    v_source_code := v_transfer.transfer_number;
    v_source_label := 'Điều chuyển';
  ELSIF p_document_type = 'production_run' THEN
    SELECT run.id, run.target_branch_id, run.target_location_id, run.status,
           run.production_number, run.finished_good_id
    INTO v_run
    FROM public.production_runs AS run
    WHERE run.id = p_document_id
      AND run.tenant_id = v_tenant
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'source_document_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_run.status <> 'completed' THEN
      RAISE EXCEPTION 'source_document_not_posted' USING ERRCODE = '23514';
    END IF;
    IF v_run.target_branch_id <> p_branch_id THEN
      RAISE EXCEPTION 'source_scope_mismatch' USING ERRCODE = '42501';
    END IF;
    IF v_run.finished_good_id <> p_ingredient_id THEN
      RAISE EXCEPTION 'source_ingredient_missing' USING ERRCODE = '23514';
    END IF;
    v_production_run_id := v_run.id;
    v_location_id := v_run.target_location_id;
    v_source_code := v_run.production_number;
    v_source_label := 'Sản xuất';
  END IF;

  IF v_location_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = v_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = p_branch_id
  ) THEN
    RAISE EXCEPTION 'source_location_invalid' USING ERRCODE = '23514';
  END IF;

  v_reason := v_source_label
    || CASE WHEN v_source_code IS NULL THEN '' ELSE ' ' || v_source_code END
    || ': ' || v_reason;

  SELECT movement.*
  INTO v_existing
  FROM public.stock_movements AS movement
  WHERE movement.tenant_id = v_tenant
    AND movement.correction_idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.branch_id IS DISTINCT FROM p_branch_id
       OR v_existing.ingredient_id IS DISTINCT FROM p_ingredient_id
       OR v_existing.quantity_change IS DISTINCT FROM p_quantity_change
       OR v_existing.reason IS DISTINCT FROM v_reason
       OR v_existing.created_by IS DISTINCT FROM v_actor
       OR v_existing.location_id IS DISTINCT FROM v_location_id
       OR v_existing.grn_id IS DISTINCT FROM v_grn_id
       OR v_existing.issue_id IS DISTINCT FROM v_issue_id
       OR v_existing.transfer_id IS DISTINCT FROM v_transfer_id
       OR v_existing.production_run_id IS DISTINCT FROM v_production_run_id THEN
      RAISE EXCEPTION 'document_correction_idempotency_conflict'
        USING ERRCODE = '23505';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'success', TRUE,
      'movement_id', v_existing.id,
      'idempotent', TRUE
    );
  END IF;

  SELECT ingredient_unit.unit_id, ingredient_unit.to_base_factor
  INTO v_entry_unit_id, v_entry_to_base_factor
  FROM public.ingredient_units AS ingredient_unit
  JOIN public.ingredients AS ingredient
    ON ingredient.id = ingredient_unit.ingredient_id
   AND ingredient.tenant_id = ingredient_unit.tenant_id
  JOIN public.units AS unit
    ON unit.id = ingredient_unit.unit_id
   AND unit.tenant_id = ingredient_unit.tenant_id
  WHERE ingredient_unit.tenant_id = v_tenant
    AND ingredient_unit.ingredient_id = p_ingredient_id
    AND ingredient_unit.is_active
    AND unit.is_active
    AND ingredient_unit.unit_id = ingredient.issue_unit_id
  ORDER BY ingredient_unit.sort_order, ingredient_unit.id
  LIMIT 1;
  IF v_entry_unit_id IS NULL OR v_entry_to_base_factor <= 0 THEN
    RAISE EXCEPTION 'entry_unit_not_found' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, ingredient_id, location_id, current_quantity
  ) VALUES (
    v_tenant, p_branch_id, p_ingredient_id, v_location_id, 0
  )
  ON CONFLICT ON CONSTRAINT stock_levels_ingredient_branch_location_tenant_key
  DO NOTHING;

  SELECT stock.current_quantity
  INTO v_current_quantity
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = p_branch_id
    AND stock.location_id = v_location_id
    AND stock.ingredient_id = p_ingredient_id
  FOR UPDATE;

  IF v_current_quantity + p_quantity_change < 0 THEN
    RAISE EXCEPTION 'insufficient_stock' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.stock_movements (
    tenant_id,
    branch_id,
    ingredient_id,
    type,
    quantity_change,
    entry_unit_id,
    entry_quantity,
    reason,
    created_by,
    location_id,
    grn_id,
    issue_id,
    transfer_id,
    production_run_id,
    correction_idempotency_key
  ) VALUES (
    v_tenant,
    p_branch_id,
    p_ingredient_id,
    'adjustment',
    p_quantity_change,
    v_entry_unit_id,
    pg_catalog.round(
      pg_catalog.abs(p_quantity_change) / v_entry_to_base_factor,
      3
    ),
    v_reason,
    v_actor,
    v_location_id,
    v_grn_id,
    v_issue_id,
    v_transfer_id,
    v_production_run_id,
    p_idempotency_key
  )
  RETURNING id INTO v_movement_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'movement_id', v_movement_id,
    'idempotent', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_inventory_document_correction(
  text, bigint, bigint, bigint, numeric, text, uuid
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_inventory_document_correction(
  text, bigint, bigint, bigint, numeric, text, uuid
) TO authenticated;
