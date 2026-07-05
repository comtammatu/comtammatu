CREATE OR REPLACE FUNCTION public.inventory_entry_unit_code(
  p_tenant_id bigint,
  p_ingredient_id bigint,
  p_entry_unit_id bigint DEFAULT NULL::bigint
) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_code text;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_required' USING ERRCODE = '22023';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role'
     AND p_tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_ingredient_id IS NULL THEN
    RAISE EXCEPTION 'ingredient_required' USING ERRCODE = '22023';
  END IF;

  IF p_entry_unit_id IS NOT NULL THEN
    SELECT u.code
    INTO v_code
    FROM public.ingredient_units iu
    JOIN public.units u
      ON u.id = iu.unit_id
     AND u.tenant_id = iu.tenant_id
    WHERE iu.tenant_id = p_tenant_id
      AND iu.ingredient_id = p_ingredient_id
      AND iu.unit_id = p_entry_unit_id
      AND iu.is_active = TRUE
      AND u.is_active = TRUE;
  ELSE
    SELECT u.code
    INTO v_code
    FROM public.ingredient_units iu
    JOIN public.units u
      ON u.id = iu.unit_id
     AND u.tenant_id = iu.tenant_id
    WHERE iu.tenant_id = p_tenant_id
      AND iu.ingredient_id = p_ingredient_id
      AND iu.is_base = TRUE
      AND iu.is_active = TRUE
      AND u.is_active = TRUE
    ORDER BY iu.sort_order ASC, iu.id ASC
    LIMIT 1;
  END IF;

  IF NULLIF(btrim(v_code), '') IS NULL THEN
    RAISE EXCEPTION 'entry_unit_not_found:%', p_ingredient_id
      USING ERRCODE = '23503';
  END IF;

  RETURN btrim(v_code);
END;
$$;

COMMENT ON FUNCTION public.inventory_entry_unit_code(bigint, bigint, bigint) IS
  'Returns the persisted unit code for an ingredient entry_unit_id. NULL entry_unit_id resolves to the ingredient base unit.';

REVOKE ALL ON FUNCTION public.inventory_entry_unit_code(bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_entry_unit_code(bigint, bigint, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.create_expiry_writeoff(
  p_branch_id bigint,
  p_location_id bigint,
  p_ingredient_id bigint,
  p_quantity numeric,
  p_unit text,
  p_grn_item_id bigint DEFAULT NULL::bigint,
  p_note text DEFAULT NULL::text,
  p_photo_urls text[] DEFAULT ARRAY[]::text[]
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_loc RECORD; v_grn RECORD;
  v_shift_key text; v_issue_id bigint; v_issue_no text; v_approval text;
  v_seed_cost numeric(15, 2);
  v_source_ref jsonb := jsonb_build_object('kind', 'expiry');
  v_entry_unit_id bigint;
  v_unit text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:writeoff') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'quantity must be positive' USING ERRCODE = '22023'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501'; END IF;

  SELECT id, tenant_id, branch_id, is_active INTO v_loc
    FROM public.inventory_locations WHERE id = p_location_id;
  IF NOT FOUND OR NOT v_loc.is_active OR v_loc.tenant_id <> v_tenant OR v_loc.branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'location_scope_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_grn_item_id IS NOT NULL THEN
    SELECT gi.id, gi.batch_number, gi.expiry_date, gi.grn_id, gi.entry_unit_id INTO v_grn
      FROM public.grn_items gi
      JOIN public.goods_received_notes g ON g.id = gi.grn_id AND g.tenant_id = gi.tenant_id
     WHERE gi.id = p_grn_item_id AND gi.tenant_id = v_tenant
       AND g.branch_id = p_branch_id AND gi.ingredient_id = p_ingredient_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'grn_item_not_found' USING ERRCODE = '22023';
    END IF;
    v_entry_unit_id := v_grn.entry_unit_id;
    v_source_ref := v_source_ref || jsonb_build_object(
      'grn_item_id', v_grn.id, 'grn_id', v_grn.grn_id,
      'batch_number', v_grn.batch_number, 'expiry_date', v_grn.expiry_date);
  END IF;

  v_unit := public.inventory_entry_unit_code(v_tenant, p_ingredient_id, v_entry_unit_id);

  v_shift_key := public.inventory_shift_key(p_branch_id, now());
  v_issue_no := 'WO-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4);

  INSERT INTO public.stock_issues (tenant_id, branch_id, issue_number, issue_type, status, notes,
    issued_at, created_by, source_location_id, approval_status, shift_key, source_type, source_ref)
  VALUES (v_tenant, p_branch_id, v_issue_no, 'writeoff', 'draft', p_note,
    now(), v_uid, p_location_id, 'not_required', v_shift_key, 'manual', v_source_ref)
  RETURNING id INTO v_issue_id;

  SELECT avg_unit_cost INTO v_seed_cost
    FROM public.stock_levels
   WHERE tenant_id = v_tenant AND branch_id = p_branch_id
     AND location_id = p_location_id AND ingredient_id = p_ingredient_id;

  INSERT INTO public.stock_issue_items (tenant_id, issue_id, ingredient_id, quantity, unit, entry_unit_id, unit_cost,
    reason_code, photo_urls, reason)
  VALUES (v_tenant, v_issue_id, p_ingredient_id, p_quantity, v_unit, v_entry_unit_id,
    COALESCE(v_seed_cost, 0),
    'expired', COALESCE(p_photo_urls, ARRAY[]::text[]), p_note);

  SELECT approval_status INTO v_approval FROM public.stock_issues WHERE id = v_issue_id;
  IF v_approval = 'not_required' THEN
    PERFORM public._post_writeoff_movements(v_issue_id);
  END IF;

  RETURN jsonb_build_object(
    'issue_id', v_issue_id,
    'issue_number', v_issue_no,
    'requires_approval', v_approval = 'pending',
    'stock_decremented', v_approval = 'not_required'
  );
END $$;

CREATE OR REPLACE FUNCTION public.create_production_order(
  p_branch_id bigint,
  p_production_number text,
  p_notes text DEFAULT NULL::text,
  p_items jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid    UUID   := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_branch RECORD;
  v_order_id BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:production_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_production_number IS NULL OR btrim(p_production_number) = '' THEN
    RAISE EXCEPTION 'production_number_required' USING ERRCODE = '22023';
  END IF;

  SELECT id, branch_kind INTO v_branch
  FROM public.branches
  WHERE id = p_branch_id AND tenant_id = v_tenant AND is_active = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_branch.branch_kind NOT IN ('branch', 'central_kitchen') THEN
    RAISE EXCEPTION 'branch_must_be_operational' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.production_orders (
    tenant_id, branch_id, production_number, status, notes, created_by
  )
  VALUES (v_tenant, p_branch_id, p_production_number, 'draft', p_notes, v_uid)
  RETURNING id INTO v_order_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    INSERT INTO public.production_order_items (
      tenant_id, production_order_id, finished_good_id, quantity, unit, entry_unit_id
    )
    SELECT v_tenant, v_order_id,
      (line->>'finishedGoodId')::BIGINT,
      (line->>'quantity')::NUMERIC(15,3),
      public.inventory_entry_unit_code(
        v_tenant,
        (line->>'finishedGoodId')::BIGINT,
        NULLIF(line->>'entryUnitId', '')::BIGINT
      ),
      NULLIF(line->>'entryUnitId', '')::BIGINT
    FROM jsonb_array_elements(p_items) AS line
    WHERE line ? 'finishedGoodId' AND line ? 'quantity'
    ON CONFLICT (production_order_id, finished_good_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      unit = EXCLUDED.unit,
      entry_unit_id = EXCLUDED.entry_unit_id;
  END IF;

  RETURN jsonb_build_object('id', v_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_purchase_order_with_lines(
  p_supplier_id bigint,
  p_branch_id bigint,
  p_notes text,
  p_lines jsonb
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid       uuid    := auth.uid();
  v_tenant_id bigint  := public.auth_tenant_id();
  v_branch    RECORD;
  v_po_id     bigint;
  v_display   text;
  v_count     integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission_any('procurement:po_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'invalid_po_lines' USING ERRCODE = '22023';
  END IF;

  SELECT id, branch_kind, is_active INTO v_branch
    FROM public.branches
   WHERE id = p_branch_id AND tenant_id = v_tenant_id;
  IF NOT FOUND OR NOT v_branch.is_active
     OR v_branch.branch_kind NOT IN ('branch', 'central_supply', 'central_kitchen') THEN
    RAISE EXCEPTION 'invalid_branch' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.suppliers
     WHERE id = p_supplier_id AND tenant_id = v_tenant_id AND is_active
  ) THEN
    RAISE EXCEPTION 'invalid_supplier' USING ERRCODE = 'P0002';
  END IF;

  v_display := public.next_po_display_id(v_tenant_id);

  INSERT INTO public.purchase_orders (
    tenant_id, branch_id, supplier_id, po_number, display_id, status, notes, created_by
  ) VALUES (
    v_tenant_id, p_branch_id, p_supplier_id, v_display, v_display, 'draft',
    NULLIF(btrim(p_notes), ''), v_uid
  ) RETURNING id INTO v_po_id;

  INSERT INTO public.purchase_order_items (
    tenant_id, po_id, ingredient_id, quantity, unit, entry_unit_id, unit_price_est, line_total
  )
  SELECT
    v_tenant_id,
    v_po_id,
    x.ingredient_id,
    x.quantity,
    public.inventory_entry_unit_code(v_tenant_id, x.ingredient_id, x.entry_unit_id),
    x.entry_unit_id,
    x.unit_price_est,
    CASE WHEN x.unit_price_est IS NULL THEN NULL
         ELSE round(x.quantity * x.unit_price_est, 2) END
  FROM jsonb_to_recordset(p_lines) AS x(
    ingredient_id  bigint,
    quantity       numeric,
    entry_unit_id  bigint,
    unit_price_est numeric
  )
  ON CONFLICT (po_id, ingredient_id, tenant_id) DO UPDATE SET
    quantity       = EXCLUDED.quantity,
    unit           = EXCLUDED.unit,
    entry_unit_id  = EXCLUDED.entry_unit_id,
    unit_price_est = EXCLUDED.unit_price_est,
    line_total     = EXCLUDED.line_total;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'id', v_po_id,
    'display_id', v_display,
    'line_count', v_count
  );
END;
$$;

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
       OR (line.value->>'quantity')::NUMERIC <= 0
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
    public.inventory_entry_unit_code(
      v_tenant,
      (line.value->>'ingredientId')::BIGINT,
      NULLIF(line.value->>'entryUnitId', '')::BIGINT
    ),
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

CREATE OR REPLACE FUNCTION public.create_waste_entry(
  p_branch_id bigint,
  p_location_id bigint,
  p_items jsonb,
  p_source_type text DEFAULT 'manual'::text,
  p_source_ref jsonb DEFAULT NULL::jsonb,
  p_notes text DEFAULT NULL::text
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid(); v_tenant BIGINT; v_location RECORD; v_shift_key TEXT; v_issue_id BIGINT;
  v_issue_no TEXT; v_item JSONB; v_photos TEXT[]; v_created INT := 0; v_needs_appr BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:writeoff') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002'; END IF;
  SELECT tenant_id, branch_id INTO v_location FROM public.inventory_locations WHERE id = p_location_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_scope_mismatch' USING ERRCODE = '42501';
  END IF;
  IF v_location.tenant_id <> v_tenant OR v_location.branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'location_scope_mismatch' USING ERRCODE = '42501';
  END IF;
  v_shift_key := public.inventory_shift_key(p_branch_id, now());
  v_issue_no := 'WO-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || substr(gen_random_uuid()::TEXT, 1, 4);
  INSERT INTO public.stock_issues (tenant_id, branch_id, issue_number, issue_type, status, notes,
    issued_at, created_by, source_location_id, approval_status, shift_key, source_type, source_ref)
  VALUES (v_tenant, p_branch_id, v_issue_no, 'writeoff', 'draft', p_notes,
    now(), v_uid, p_location_id, 'not_required', v_shift_key, COALESCE(p_source_type, 'manual'), p_source_ref)
  RETURNING id INTO v_issue_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_photos := CASE WHEN v_item ? 'photo_urls'
                     THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'photo_urls'))
                     ELSE ARRAY[]::TEXT[] END;
    INSERT INTO public.stock_issue_items (tenant_id, issue_id, ingredient_id, quantity, unit, entry_unit_id, unit_cost,
      reason_code, photo_urls, reason)
    VALUES (
      v_tenant,
      v_issue_id,
      (v_item->>'ingredient_id')::BIGINT,
      (v_item->>'quantity')::NUMERIC,
      public.inventory_entry_unit_code(
        v_tenant,
        (v_item->>'ingredient_id')::BIGINT,
        NULLIF(v_item->>'entry_unit_id','')::BIGINT
      ),
      NULLIF(v_item->>'entry_unit_id','')::BIGINT,
      NULLIF(v_item->>'unit_cost','')::NUMERIC,
      v_item->>'reason_code',
      v_photos,
      v_item->>'note'
    );
    v_created := v_created + 1;
  END LOOP;
  SELECT bool_or(approval_required) INTO v_needs_appr FROM public.stock_issue_items WHERE issue_id = v_issue_id;
  IF NOT COALESCE(v_needs_appr, false) THEN
    PERFORM public._post_writeoff_movements(v_issue_id);
  END IF;
  RETURN jsonb_build_object('issue_id', v_issue_id, 'issue_number', v_issue_no,
    'shift_key', v_shift_key, 'items_created', v_created, 'requires_approval', COALESCE(v_needs_appr, false));
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_production_recipe_lines(
  p_finished_good_id bigint,
  p_lines jsonb
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid           UUID   := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_kept          BIGINT[] := ARRAY[]::BIGINT[];
  v_line          JSONB;
  v_ingredient_id BIGINT;
  v_entry_unit_id BIGINT;
  v_quantity      NUMERIC;
  v_yield_factor  NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('menu:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ingredients i
    WHERE i.id = p_finished_good_id AND i.tenant_id = v_tenant
      AND i.item_kind = 'finished_good' AND i.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'finished_good_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'lines_must_be_array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'lines_must_not_be_empty' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF (v_line->>'ingredient_id') IS NULL OR (v_line->>'quantity') IS NULL THEN
      RAISE EXCEPTION 'invalid_line_shape' USING ERRCODE = '22023';
    END IF;

    v_ingredient_id := (v_line->>'ingredient_id')::BIGINT;
    v_entry_unit_id := NULLIF(v_line->>'entry_unit_id', '')::BIGINT;
    v_quantity := (v_line->>'quantity')::NUMERIC;
    v_yield_factor := COALESCE(NULLIF(v_line->>'yield_factor', '')::NUMERIC, 1.000);

    IF v_quantity <= 0 OR v_yield_factor <= 0 THEN
      RAISE EXCEPTION 'invalid_line_quantity' USING ERRCODE = '22023';
    END IF;

    IF v_ingredient_id = ANY(v_kept) THEN
      RAISE EXCEPTION 'duplicate_ingredient' USING ERRCODE = '23505';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.ingredients i
      WHERE i.id = v_ingredient_id AND i.tenant_id = v_tenant
        AND i.item_kind = 'raw_material' AND i.is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.production_recipes (
      tenant_id, finished_good_id, ingredient_id,
      quantity, unit, entry_unit_id, note, yield_factor
    )
    VALUES (
      v_tenant, p_finished_good_id, v_ingredient_id,
      v_quantity,
      public.inventory_entry_unit_code(v_tenant, v_ingredient_id, v_entry_unit_id),
      v_entry_unit_id,
      NULLIF(v_line->>'note', ''), v_yield_factor
    )
    ON CONFLICT (finished_good_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity, unit = EXCLUDED.unit,
      entry_unit_id = EXCLUDED.entry_unit_id,
      note = EXCLUDED.note, yield_factor = EXCLUDED.yield_factor;

    v_kept := v_kept || v_ingredient_id;
  END LOOP;

  DELETE FROM public.production_recipes pr
  WHERE pr.tenant_id = v_tenant
    AND pr.finished_good_id = p_finished_good_id
    AND NOT (pr.ingredient_id = ANY(v_kept));

  RETURN jsonb_build_object(
    'finished_good_id', p_finished_good_id,
    'kept_count', COALESCE(array_length(v_kept, 1), 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_recipe_lines(
  p_menu_item_id bigint,
  p_lines jsonb
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid    UUID   := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_kept   BIGINT[] := ARRAY[]::BIGINT[];
  v_line   JSONB;
  v_ingredient_id BIGINT;
  v_entry_unit_id BIGINT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission_any('menu:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.menu_items mi WHERE mi.id = p_menu_item_id AND mi.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'menu_item_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'lines_must_be_array' USING ERRCODE = '22023'; END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF (v_line->>'ingredient_id') IS NULL OR (v_line->>'quantity') IS NULL THEN
      RAISE EXCEPTION 'invalid_line_shape' USING ERRCODE = '22023';
    END IF;

    v_ingredient_id := (v_line->>'ingredient_id')::BIGINT;
    v_entry_unit_id := NULLIF(v_line->>'entry_unit_id', '')::BIGINT;

    INSERT INTO public.recipes (tenant_id, menu_item_id, ingredient_id, quantity, unit, entry_unit_id, note, yield_factor)
    VALUES (
      v_tenant,
      p_menu_item_id,
      v_ingredient_id,
      (v_line->>'quantity')::NUMERIC,
      public.inventory_entry_unit_code(v_tenant, v_ingredient_id, v_entry_unit_id),
      v_entry_unit_id,
      NULLIF(v_line->>'note',''),
      COALESCE(NULLIF(v_line->>'yield_factor', '')::NUMERIC, 1.000)
    )
    ON CONFLICT (menu_item_id, ingredient_id, tenant_id)
    DO UPDATE SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit,
                  entry_unit_id = EXCLUDED.entry_unit_id,
                  note = EXCLUDED.note, yield_factor = EXCLUDED.yield_factor;
    v_kept := v_kept || v_ingredient_id;
  END LOOP;

  DELETE FROM public.recipes r
  WHERE r.tenant_id = v_tenant AND r.menu_item_id = p_menu_item_id
    AND NOT (r.ingredient_id = ANY(v_kept));

  RETURN jsonb_build_object('menu_item_id', p_menu_item_id, 'kept_count', COALESCE(array_length(v_kept, 1), 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_import_production_recipes(p_groups jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_recipes integer := 0;
  v_lines integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('menu:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_groups IS NULL OR jsonb_typeof(p_groups) <> 'array' OR jsonb_array_length(p_groups) = 0 THEN
    RAISE EXCEPTION 'groups_must_be_non_empty_array' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS pg_temp.bulk_import_production_groups;
  DROP TABLE IF EXISTS pg_temp.bulk_import_production_lines;

  CREATE TEMP TABLE pg_temp.bulk_import_production_groups ON COMMIT DROP AS
  SELECT
    raw.ordinality::integer AS group_no,
    (raw.value->>'finished_good_id')::bigint AS finished_good_id,
    raw.value->'lines' AS lines
  FROM jsonb_array_elements(p_groups) WITH ORDINALITY AS raw(value, ordinality);

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_groups
    WHERE finished_good_id IS NULL
       OR lines IS NULL
       OR jsonb_typeof(lines) <> 'array'
       OR jsonb_array_length(lines) = 0
  ) THEN
    RAISE EXCEPTION 'invalid_group_shape' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_groups
    GROUP BY finished_good_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_finished_good' USING ERRCODE = '23505';
  END IF;

  CREATE TEMP TABLE pg_temp.bulk_import_production_lines ON COMMIT DROP AS
  SELECT
    groups.finished_good_id,
    raw.ordinality::integer AS line_no,
    (raw.value->>'ingredient_id')::bigint AS ingredient_id,
    (raw.value->>'quantity')::numeric AS quantity,
    NULLIF(raw.value->>'entry_unit_id', '')::bigint AS entry_unit_id,
    nullif(btrim(coalesce(raw.value->>'note', '')), '') AS note,
    coalesce(NULLIF(raw.value->>'yield_factor', '')::numeric, 1) AS yield_factor
  FROM pg_temp.bulk_import_production_groups groups
  CROSS JOIN LATERAL jsonb_array_elements(groups.lines) WITH ORDINALITY AS raw(value, ordinality);

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_lines
    WHERE ingredient_id IS NULL
       OR quantity <= 0
       OR yield_factor <= 0
  ) THEN
    RAISE EXCEPTION 'invalid_line_shape' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_lines
    GROUP BY finished_good_id, ingredient_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_ingredient' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_groups groups
    LEFT JOIN public.ingredients finished_goods
      ON finished_goods.id = groups.finished_good_id
     AND finished_goods.tenant_id = v_tenant
     AND finished_goods.item_kind = 'finished_good'
     AND finished_goods.is_active
    WHERE finished_goods.id IS NULL
  ) THEN
    RAISE EXCEPTION 'finished_good_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_lines lines
    LEFT JOIN public.ingredients ingredients
      ON ingredients.id = lines.ingredient_id
     AND ingredients.tenant_id = v_tenant
     AND ingredients.item_kind = 'raw_material'
     AND ingredients.is_active
    WHERE ingredients.id IS NULL
  ) THEN
    RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.production_recipes (
    tenant_id, finished_good_id, ingredient_id,
    quantity, unit, entry_unit_id, note, yield_factor
  )
  SELECT
    v_tenant,
    lines.finished_good_id,
    lines.ingredient_id,
    lines.quantity,
    public.inventory_entry_unit_code(v_tenant, lines.ingredient_id, lines.entry_unit_id),
    lines.entry_unit_id,
    lines.note,
    lines.yield_factor
  FROM pg_temp.bulk_import_production_lines lines
  ON CONFLICT (finished_good_id, ingredient_id, tenant_id)
  DO UPDATE SET
    quantity = EXCLUDED.quantity,
    unit = EXCLUDED.unit,
    entry_unit_id = EXCLUDED.entry_unit_id,
    note = EXCLUDED.note,
    yield_factor = EXCLUDED.yield_factor;

  DELETE FROM public.production_recipes recipes
  USING pg_temp.bulk_import_production_groups groups
  WHERE recipes.tenant_id = v_tenant
    AND recipes.finished_good_id = groups.finished_good_id
    AND NOT EXISTS (
      SELECT 1
      FROM pg_temp.bulk_import_production_lines lines
      WHERE lines.finished_good_id = recipes.finished_good_id
        AND lines.ingredient_id = recipes.ingredient_id
    );

  SELECT count(*) INTO v_recipes
  FROM pg_temp.bulk_import_production_groups;

  SELECT count(*) INTO v_lines
  FROM pg_temp.bulk_import_production_lines;

  RETURN jsonb_build_object('recipes', v_recipes, 'lines', v_lines);
END;
$$;

REVOKE ALL ON FUNCTION public.create_expiry_writeoff(bigint, bigint, bigint, numeric, text, bigint, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_expiry_writeoff(bigint, bigint, bigint, numeric, text, bigint, text, text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_production_order(bigint, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_production_order(bigint, text, text, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_purchase_order_with_lines(bigint, bigint, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_with_lines(bigint, bigint, text, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_stock_transfer_draft(bigint, bigint, text, text, text, jsonb, bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer_draft(bigint, bigint, text, text, text, jsonb, bigint, bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_waste_entry(bigint, bigint, jsonb, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_waste_entry(bigint, bigint, jsonb, text, jsonb, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.upsert_production_recipe_lines(bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_production_recipe_lines(bigint, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.upsert_recipe_lines(bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_recipe_lines(bigint, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.bulk_import_production_recipes(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_import_production_recipes(jsonb) TO authenticated, service_role;
