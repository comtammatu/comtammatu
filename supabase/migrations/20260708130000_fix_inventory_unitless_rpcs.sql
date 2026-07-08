CREATE OR REPLACE FUNCTION public.create_purchase_order_with_lines(
  p_supplier_id bigint,
  p_branch_id bigint,
  p_notes text,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines) AS x(
      ingredient_id bigint,
      quantity numeric,
      entry_unit_id bigint,
      unit_price_est numeric
    )
    WHERE x.ingredient_id IS NULL
       OR x.quantity IS NULL
       OR x.quantity <= 0
       OR x.entry_unit_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.ingredient_units iu
         WHERE iu.tenant_id = v_tenant_id
           AND iu.ingredient_id = x.ingredient_id
           AND iu.unit_id = x.entry_unit_id
           AND iu.is_active = true
       )
  ) THEN
    RAISE EXCEPTION 'invalid_po_lines' USING ERRCODE = '22023';
  END IF;

  v_display := public.next_po_display_id(v_tenant_id);

  INSERT INTO public.purchase_orders (
    tenant_id, branch_id, supplier_id, po_number, display_id, status, notes, created_by
  ) VALUES (
    v_tenant_id, p_branch_id, p_supplier_id, v_display, v_display, 'draft',
    NULLIF(btrim(p_notes), ''), v_uid
  ) RETURNING id INTO v_po_id;

  INSERT INTO public.purchase_order_items (
    tenant_id, po_id, ingredient_id, quantity, entry_unit_id, unit_price_est, line_total
  )
  SELECT
    v_tenant_id,
    v_po_id,
    x.ingredient_id,
    x.quantity,
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
$function$;

CREATE OR REPLACE FUNCTION public.create_grn_from_po(p_po_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id    UUID   := auth.uid();
  v_tenant_id  BIGINT := public.auth_tenant_id();
  v_po         RECORD;
  v_branch     RECORD;
  v_supplier   RECORD;
  v_grn_id     BIGINT;
  v_grn_number TEXT;
  v_count      INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_po: anonymous caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_po: missing tenant_id claim'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_po_id IS NULL OR p_po_id <= 0 THEN
    RAISE EXCEPTION 'create_grn_from_po: invalid PO id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT id, supplier_id, status, branch_id
    INTO v_po
    FROM public.purchase_orders
   WHERE id = p_po_id
     AND tenant_id = v_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_grn_from_po: PO not found in tenant scope'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_po.status NOT IN ('sent', 'partially_received') THEN
    RAISE EXCEPTION 'create_grn_from_po: PO status not eligible'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.branch_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_po: PO has no destination branch'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, branch_kind, is_active
    INTO v_branch
    FROM public.branches
   WHERE id = v_po.branch_id
     AND tenant_id = v_tenant_id;

  IF NOT FOUND OR NOT v_branch.is_active THEN
    RAISE EXCEPTION 'create_grn_from_po: branch inactive or out of scope'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_branch.branch_kind NOT IN ('branch', 'central_supply', 'central_kitchen') THEN
    RAISE EXCEPTION 'create_grn_from_po: branch is not a procurement site'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, is_active
    INTO v_supplier
    FROM public.suppliers
   WHERE id = v_po.supplier_id
     AND tenant_id = v_tenant_id;

  IF NOT FOUND OR NOT v_supplier.is_active THEN
    RAISE EXCEPTION 'create_grn_from_po: supplier inactive or out of scope'
      USING ERRCODE = 'check_violation';
  END IF;

  CREATE TEMP TABLE _grn_remaining ON COMMIT DROP AS
    WITH received AS (
      SELECT gi.ingredient_id,
             SUM(public.inv_to_base(gi.ingredient_id, gi.entry_unit_id, COALESCE(gi.received_quantity, 0)))::NUMERIC(15,3) AS base_done
        FROM public.grn_items gi
        JOIN public.goods_received_notes g
          ON g.id = gi.grn_id
         AND g.tenant_id = gi.tenant_id
       WHERE g.po_id = v_po.id
         AND g.tenant_id = v_tenant_id
         AND g.status = 'confirmed'
       GROUP BY gi.ingredient_id
    )
    SELECT poi.ingredient_id,
           poi.entry_unit_id,
           poi.quantity::NUMERIC(15,3)                    AS po_quantity,
           COALESCE(poi.unit_price_est, 0)::NUMERIC(15,2) AS po_unit_price,
           ROUND(
             (public.inv_to_base(poi.ingredient_id, poi.entry_unit_id, poi.quantity)
                - COALESCE(received.base_done, 0))
             / public.inv_to_base(poi.ingredient_id, poi.entry_unit_id, 1),
             3
           )::NUMERIC(15,3) AS remaining
      FROM public.purchase_order_items poi
      LEFT JOIN received USING (ingredient_id)
     WHERE poi.po_id = v_po.id
       AND poi.tenant_id = v_tenant_id;

  IF NOT EXISTS (SELECT 1 FROM _grn_remaining WHERE remaining > 0) THEN
    RAISE EXCEPTION 'create_grn_from_po: PO already fully received'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_grn_number := 'GRN-' || substring(replace(gen_random_uuid()::TEXT, '-', '') from 1 for 8);

  INSERT INTO public.goods_received_notes (
    tenant_id, branch_id, supplier_id, po_id,
    grn_number, status, created_by
  ) VALUES (
    v_tenant_id, v_branch.id, v_supplier.id, v_po.id,
    v_grn_number, 'draft', v_user_id
  ) RETURNING id INTO v_grn_id;

  IF v_grn_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_po: header insert blocked (RLS)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.grn_items (
    tenant_id, grn_id, ingredient_id,
    po_quantity, po_unit_price,
    received_quantity, entry_unit_id, unit_cost, total_cost,
    quality_status
  )
  SELECT v_tenant_id,
         v_grn_id,
         r.ingredient_id,
         r.po_quantity,
         r.po_unit_price,
         r.remaining,
         r.entry_unit_id,
         r.po_unit_price,
         ROUND(r.remaining * r.po_unit_price, 2),
         'accepted'
    FROM _grn_remaining r
   WHERE r.remaining > 0;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'create_grn_from_po: items insert blocked (RLS)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.log_audit(
    'inventory.grn.created_from_po',
    'goods_received_note',
    v_grn_id,
    NULL,
    jsonb_build_object(
      'po_id',     v_po.id,
      'lines',     v_count,
      'branch_id', v_branch.id
    )
  );

  RETURN jsonb_build_object(
    'grn_id',     v_grn_id,
    'grn_number', v_grn_number,
    'lines',      v_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_stocktake_session(
  p_branch_id bigint,
  p_location_id bigint DEFAULT NULL::bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_session_id BIGINT;
  v_loc_id BIGINT;
  v_branch_kind TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'tenant_not_found' USING ERRCODE = '22023'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:stocktake_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT branch_kind INTO v_branch_kind
  FROM public.branches
  WHERE id = p_branch_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002'; END IF;

  IF p_location_id IS NOT NULL THEN
    SELECT il.id INTO v_loc_id
    FROM public.inventory_locations il
    WHERE il.id = p_location_id
      AND il.branch_id = p_branch_id
      AND il.tenant_id = v_tenant
      AND il.is_active = TRUE;
    IF NOT FOUND THEN RAISE EXCEPTION 'location_not_found_or_inactive' USING ERRCODE = 'P0002'; END IF;
  ELSE
    IF v_branch_kind = 'branch' THEN
      SELECT il.id INTO v_loc_id
      FROM public.inventory_locations il
      WHERE il.branch_id = p_branch_id
        AND il.tenant_id = v_tenant
        AND il.location_kind = 'kitchen'
        AND il.is_active = TRUE
      ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
      LIMIT 1;
    ELSE
      SELECT il.id INTO v_loc_id
      FROM public.inventory_locations il
      WHERE il.branch_id = p_branch_id
        AND il.tenant_id = v_tenant
        AND il.is_default_receive = TRUE
        AND il.is_active = TRUE
      ORDER BY il.sort_order NULLS LAST, il.id
      LIMIT 1;
    END IF;
  END IF;

  IF v_loc_id IS NULL THEN
    RAISE EXCEPTION 'location_not_found_or_inactive' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = p_branch_id
      AND sl.location_id = v_loc_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.ingredient_units iu
        JOIN public.units u
          ON u.id = iu.unit_id
         AND u.tenant_id = iu.tenant_id
         AND u.is_active = TRUE
        WHERE iu.tenant_id = v_tenant
          AND iu.ingredient_id = sl.ingredient_id
          AND iu.is_base = TRUE
          AND iu.is_active = TRUE
      )
  ) THEN
    RAISE EXCEPTION 'stocktake_entry_unit_missing' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.stocktake_sessions (tenant_id, branch_id, location_id, created_by)
  VALUES (v_tenant, p_branch_id, v_loc_id, v_uid)
  RETURNING id INTO v_session_id;

  INSERT INTO public.stocktake_lines (
    tenant_id, session_id, ingredient_id, system_quantity, entry_unit_id
  )
  SELECT v_tenant, v_session_id, sl.ingredient_id, sl.current_quantity, bu.unit_id
  FROM public.stock_levels sl
  JOIN LATERAL (
    SELECT iu.unit_id
    FROM public.ingredient_units iu
    JOIN public.units u
      ON u.id = iu.unit_id
     AND u.tenant_id = iu.tenant_id
     AND u.is_active = TRUE
    WHERE iu.tenant_id = v_tenant
      AND iu.ingredient_id = sl.ingredient_id
      AND iu.is_base = TRUE
      AND iu.is_active = TRUE
    ORDER BY iu.sort_order ASC, iu.id ASC
    LIMIT 1
  ) bu ON TRUE
  WHERE sl.tenant_id = v_tenant
    AND sl.branch_id = p_branch_id
    AND sl.location_id = v_loc_id;

  RETURN jsonb_build_object('id', v_session_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_stocktake(
  p_branch_id bigint,
  p_location_id bigint DEFAULT NULL::bigint,
  p_mode text DEFAULT 'daily'::text,
  p_blind_mode boolean DEFAULT NULL::boolean,
  p_auditor_id uuid DEFAULT NULL::uuid,
  p_threshold_pct numeric DEFAULT NULL::numeric,
  p_threshold_vnd numeric DEFAULT NULL::numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant BIGINT;
  v_blind BOOLEAN;
  v_session BIGINT;
  v_is_unaud BOOLEAN := false;
  v_rows INT := 0;
  v_loc_id BIGINT := p_location_id;
  v_branch_kind TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:stocktake_create') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_mode NOT IN ('daily','weekly','monthly','quarterly','spot') THEN RAISE EXCEPTION 'invalid mode' USING ERRCODE = '22023'; END IF;

  SELECT tenant_id, branch_kind INTO v_tenant, v_branch_kind
  FROM public.branches
  WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002'; END IF;

  IF v_loc_id IS NOT NULL THEN
    SELECT il.id INTO v_loc_id
    FROM public.inventory_locations il
    WHERE il.id = p_location_id
      AND il.branch_id = p_branch_id
      AND il.tenant_id = v_tenant
      AND il.is_active = TRUE;
    IF NOT FOUND THEN RAISE EXCEPTION 'location_not_found_or_inactive' USING ERRCODE = 'P0002'; END IF;
  END IF;

  v_blind := COALESCE(p_blind_mode, CASE p_mode
    WHEN 'daily' THEN false WHEN 'weekly' THEN false
    WHEN 'monthly' THEN true WHEN 'quarterly' THEN true WHEN 'spot' THEN true END);
  IF p_mode IN ('monthly','quarterly') AND p_auditor_id IS NULL THEN v_is_unaud := true; END IF;

  IF v_loc_id IS NULL THEN
    IF v_branch_kind = 'branch' THEN
      SELECT il.id INTO v_loc_id
      FROM public.inventory_locations il
      WHERE il.branch_id = p_branch_id
        AND il.tenant_id = v_tenant
        AND il.location_kind = 'kitchen'
        AND il.is_active = TRUE
      ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
      LIMIT 1;
    ELSE
      SELECT il.id INTO v_loc_id
      FROM public.inventory_locations il
      WHERE il.branch_id = p_branch_id
        AND il.tenant_id = v_tenant
        AND il.is_default_receive = TRUE
        AND il.is_active = TRUE
      ORDER BY il.sort_order NULLS LAST, il.id
      LIMIT 1;
    END IF;
  END IF;

  IF v_loc_id IS NULL THEN
    RAISE EXCEPTION 'location_not_found_or_inactive' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = p_branch_id
      AND sl.location_id = v_loc_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.ingredient_units iu
        JOIN public.units u
          ON u.id = iu.unit_id
         AND u.tenant_id = iu.tenant_id
         AND u.is_active = TRUE
        WHERE iu.tenant_id = v_tenant
          AND iu.ingredient_id = sl.ingredient_id
          AND iu.is_base = TRUE
          AND iu.is_active = TRUE
      )
  ) THEN
    RAISE EXCEPTION 'stocktake_entry_unit_missing' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.stocktake_sessions (
    tenant_id, branch_id, location_id, status, started_at, created_by,
    mode, blind_mode, auditor_id, is_unaudited, variance_threshold_pct, variance_threshold_vnd,
    abc_snapshot_at, current_round
  )
  VALUES (
    v_tenant, p_branch_id, v_loc_id, 'in_progress', now(), v_uid, p_mode, v_blind,
    p_auditor_id, v_is_unaud, COALESCE(p_threshold_pct, 5.00), COALESCE(p_threshold_vnd, 200000), now(), 1
  )
  RETURNING id INTO v_session;

  INSERT INTO public.stocktake_lines (
    tenant_id, session_id, ingredient_id, system_quantity, round_no, abc_class, entry_unit_id
  )
  SELECT v_tenant, v_session, sl.ingredient_id, COALESCE(sl.current_quantity, 0), 1,
         public.get_ingredient_abc_class(p_branch_id, sl.ingredient_id), bu.unit_id
  FROM public.stock_levels sl
  JOIN public.ingredients ing ON ing.id = sl.ingredient_id
  JOIN LATERAL (
    SELECT iu.unit_id
    FROM public.ingredient_units iu
    JOIN public.units u
      ON u.id = iu.unit_id
     AND u.tenant_id = iu.tenant_id
     AND u.is_active = TRUE
    WHERE iu.tenant_id = v_tenant
      AND iu.ingredient_id = sl.ingredient_id
      AND iu.is_base = TRUE
      AND iu.is_active = TRUE
    ORDER BY iu.sort_order ASC, iu.id ASC
    LIMIT 1
  ) bu ON TRUE
  WHERE sl.branch_id = p_branch_id
    AND sl.location_id = v_loc_id
    AND ing.is_active = true;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('session_id', v_session, 'mode', p_mode, 'blind_mode', v_blind,
    'is_unaudited', v_is_unaud, 'seeded_lines', v_rows, 'abc_snapshot_at', now());
END;
$function$;
