-- Sequential inventory document numbers (PREFIX-YYYY-####).
-- Mirrors next_po_display_id / tenant_po_counters. Existing codes unchanged.

-- ── 1) Counter table ────────────────────────────────────────────────────────

CREATE TABLE public.tenant_inventory_doc_counters (
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  doc_kind text NOT NULL,
  year smallint NOT NULL,
  next_seq bigint DEFAULT 1 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tenant_inventory_doc_counters_pkey PRIMARY KEY (tenant_id, doc_kind, year),
  CONSTRAINT tenant_inventory_doc_counters_kind_check CHECK (
    doc_kind = ANY (ARRAY[
      'grn'::text,
      'transfer'::text,
      'issue'::text,
      'waste'::text,
      'production'::text,
      'stocktake'::text,
      'count_slip'::text
    ])
  ),
  CONSTRAINT tenant_inventory_doc_counters_next_seq_check CHECK (next_seq >= 1)
);

COMMENT ON TABLE public.tenant_inventory_doc_counters IS
  'Per-tenant per-kind per-year sequence for inventory document codes (PREFIX-YYYY-####). Year scoped to Asia/Ho_Chi_Minh. Updated by next_inventory_doc_number.';

ALTER TABLE public.tenant_inventory_doc_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_inventory_doc_counters_no_client_access
  ON public.tenant_inventory_doc_counters
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

GRANT ALL ON TABLE public.tenant_inventory_doc_counters TO service_role;

-- ── 2) Allocator RPC ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.next_inventory_doc_number(
  p_tenant_id bigint,
  p_doc_kind text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_year SMALLINT;
  v_seq  BIGINT;
  v_prefix TEXT;
  v_kind TEXT := lower(btrim(COALESCE(p_doc_kind, '')));
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id <= 0 THEN
    RAISE EXCEPTION 'next_inventory_doc_number: invalid tenant_id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF public.auth_tenant_id() IS NULL OR public.auth_tenant_id() <> p_tenant_id THEN
    RAISE EXCEPTION 'next_inventory_doc_number: tenant scope mismatch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_prefix := CASE v_kind
    WHEN 'grn' THEN 'GRN'
    WHEN 'transfer' THEN 'DC'
    WHEN 'issue' THEN 'PXK'
    WHEN 'waste' THEN 'HH'
    WHEN 'production' THEN 'LSX'
    WHEN 'stocktake' THEN 'KK'
    WHEN 'count_slip' THEN 'PD'
    ELSE NULL
  END;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'next_inventory_doc_number: invalid doc_kind'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_year := EXTRACT(year FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::SMALLINT;

  INSERT INTO public.tenant_inventory_doc_counters (tenant_id, doc_kind, year, next_seq, updated_at)
  VALUES (p_tenant_id, v_kind, v_year, 2, now())
  ON CONFLICT (tenant_id, doc_kind, year) DO UPDATE
    SET next_seq = public.tenant_inventory_doc_counters.next_seq + 1,
        updated_at = now()
  RETURNING (
    CASE
      WHEN xmax::TEXT::INT = 0 THEN 1
      ELSE public.tenant_inventory_doc_counters.next_seq - 1
    END
  ) INTO v_seq;

  RETURN v_prefix || '-' || v_year::TEXT || '-' || lpad(v_seq::TEXT, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.next_inventory_doc_number(bigint, text) IS
  'Atomically allocate the next inventory document code for the caller tenant in the current VN-timezone year. Returns PREFIX-YYYY-####. Concurrent-safe via single-statement upsert.';

REVOKE ALL ON FUNCTION public.next_inventory_doc_number(bigint, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.next_inventory_doc_number(bigint, text) TO authenticated;
GRANT ALL ON FUNCTION public.next_inventory_doc_number(bigint, text) TO service_role;

-- ── 3) Persist codes on stocktake + count slips ─────────────────────────────

ALTER TABLE public.stocktake_sessions
  ADD COLUMN IF NOT EXISTS session_number text;

UPDATE public.stocktake_sessions
SET session_number = 'KK-' || id::text
WHERE session_number IS NULL;

ALTER TABLE public.stocktake_sessions
  ALTER COLUMN session_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stocktake_sessions_tenant_session_number
  ON public.stocktake_sessions (tenant_id, session_number);

COMMENT ON COLUMN public.stocktake_sessions.session_number IS
  'Human document code KK-YYYY-#### (or KK-{id} for rows created before sequential numbering).';

ALTER TABLE public.inventory_count_slips
  ADD COLUMN IF NOT EXISTS slip_number text;

UPDATE public.inventory_count_slips
SET slip_number = 'PD-' || id::text
WHERE slip_number IS NULL;

ALTER TABLE public.inventory_count_slips
  ALTER COLUMN slip_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_count_slips_tenant_slip_number
  ON public.inventory_count_slips (tenant_id, slip_number);

COMMENT ON COLUMN public.inventory_count_slips.slip_number IS
  'Human document code PD-YYYY-#### (or PD-{id} for rows created before sequential numbering).';

-- ── 4) Wire create paths ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_grn_from_po(p_po_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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

  v_grn_number := public.next_inventory_doc_number(v_tenant_id, 'grn');

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
$$;

CREATE OR REPLACE FUNCTION public.create_production_run_with_locations(p_branch_id bigint, p_finished_good_id bigint, p_planned_quantity numeric, p_entry_unit_id bigint, p_notes text DEFAULT NULL::text, p_target_branch_id bigint DEFAULT NULL::bigint, p_ingredients_override jsonb DEFAULT NULL::jsonb, p_source_location_id bigint DEFAULT NULL::bigint, p_target_location_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_new_id bigint;
  v_number text;
  v_target_branch_id bigint;
  v_entry_unit_id bigint := p_entry_unit_id;
  v_source_location_id bigint := p_source_location_id;
  v_target_location_id bigint := p_target_location_id;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'inventory:production_create') THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  IF p_planned_quantity IS NULL OR p_planned_quantity <= 0 THEN
    RAISE EXCEPTION 'invalid_planned_quantity' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ingredients i
    WHERE i.id = p_finished_good_id
      AND i.tenant_id = v_tenant
      AND i.item_kind = 'finished_good'
      AND i.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'finished_good_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_entry_unit_id IS NULL THEN
    SELECT iu.unit_id INTO v_entry_unit_id
    FROM public.ingredient_units iu
    JOIN public.units u
      ON u.id = iu.unit_id
     AND u.tenant_id = iu.tenant_id
     AND u.is_active = TRUE
    WHERE iu.tenant_id = v_tenant
      AND iu.ingredient_id = p_finished_good_id
      AND iu.is_base = TRUE
      AND iu.is_active = TRUE
    ORDER BY iu.sort_order ASC, iu.id ASC
    LIMIT 1;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.ingredient_units iu
      JOIN public.units u
        ON u.id = iu.unit_id
       AND u.tenant_id = iu.tenant_id
       AND u.is_active = TRUE
      WHERE iu.tenant_id = v_tenant
        AND iu.ingredient_id = p_finished_good_id
        AND iu.unit_id = v_entry_unit_id
        AND iu.is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'entry_unit_not_found:%', p_finished_good_id USING ERRCODE = '23503';
    END IF;
  END IF;

  IF v_entry_unit_id IS NULL THEN
    RAISE EXCEPTION 'entry_unit_not_found:%', p_finished_good_id USING ERRCODE = '23503';
  END IF;

  v_target_branch_id := COALESCE(p_target_branch_id, p_branch_id);

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = v_target_branch_id
      AND b.tenant_id = v_tenant
      AND b.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'target_branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_source_location_id IS NULL THEN
    SELECT il.id INTO v_source_location_id
    FROM public.branches b
    JOIN public.inventory_locations il
      ON il.tenant_id = b.tenant_id
     AND il.branch_id = b.id
     AND il.is_active = TRUE
    WHERE b.tenant_id = v_tenant
      AND b.id = p_branch_id
    ORDER BY
      CASE
        WHEN b.branch_kind = 'branch' AND il.location_kind = 'kitchen' THEN 0
        WHEN b.branch_kind = 'central_kitchen' AND il.location_kind = 'production_storage' THEN 0
        WHEN il.is_default_issue = TRUE THEN 1
        WHEN il.is_default_receive = TRUE THEN 2
        ELSE 3
      END,
      il.is_default_consumption DESC,
      il.sort_order NULLS LAST,
      il.id
    LIMIT 1;
  ELSE
    SELECT il.id INTO v_source_location_id
    FROM public.inventory_locations il
    WHERE il.id = v_source_location_id
      AND il.tenant_id = v_tenant
      AND il.branch_id = p_branch_id
      AND il.is_active = TRUE
    LIMIT 1;
  END IF;

  IF v_source_location_id IS NULL THEN
    RAISE EXCEPTION 'production_source_location_missing:%', p_branch_id USING ERRCODE = 'P0002';
  END IF;

  IF v_target_location_id IS NULL THEN
    SELECT il.id INTO v_target_location_id
    FROM public.inventory_locations il
    WHERE il.tenant_id = v_tenant
      AND il.branch_id = v_target_branch_id
      AND il.is_active = TRUE
    ORDER BY
      il.is_default_receive DESC,
      il.sort_order NULLS LAST,
      il.id
    LIMIT 1;
  ELSE
    SELECT il.id INTO v_target_location_id
    FROM public.inventory_locations il
    WHERE il.id = v_target_location_id
      AND il.tenant_id = v_tenant
      AND il.branch_id = v_target_branch_id
      AND il.is_active = TRUE
    LIMIT 1;
  END IF;

  IF v_target_location_id IS NULL THEN
    RAISE EXCEPTION 'production_target_location_missing:%', v_target_branch_id USING ERRCODE = 'P0002';
  END IF;

  v_number := public.next_inventory_doc_number(v_tenant, 'production');

  INSERT INTO public.production_runs (
    tenant_id,
    production_number,
    branch_id,
    source_location_id,
    target_branch_id,
    target_location_id,
    finished_good_id,
    planned_quantity,
    entry_unit_id,
    notes,
    created_by,
    status,
    ingredients_override
  ) VALUES (
    v_tenant,
    v_number,
    p_branch_id,
    v_source_location_id,
    v_target_branch_id,
    v_target_location_id,
    p_finished_good_id,
    p_planned_quantity,
    v_entry_unit_id,
    p_notes,
    v_uid,
    'draft',
    p_ingredients_override
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('production_run_id', v_new_id, 'production_number', v_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_stock_transfer_draft(p_from_branch_id bigint, p_to_branch_id bigint, p_transfer_number text, p_notes text DEFAULT NULL::text, p_vehicle_info text DEFAULT NULL::text, p_lines jsonb DEFAULT '[]'::jsonb, p_from_location_id bigint DEFAULT NULL::bigint, p_to_location_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_role text := public.auth_role();
  v_branch_claim bigint := public.auth_branch_id();
  v_transfer_id bigint;
  v_is_intra boolean := p_from_branch_id = p_to_branch_id;
  v_from_kind text;
  v_to_kind text;
  v_from_loc record;
  v_to_loc record;
  v_line jsonb;
  v_ingredient_id bigint;
  v_entry_unit_id bigint;
  v_entry_qty numeric(15,3);
  v_transfer_number text;
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

    IF v_from_loc.location_kind <> 'warehouse' OR v_to_loc.location_kind <> 'kitchen' THEN
      RAISE EXCEPTION 'intra_branch_location_invalid' USING ERRCODE = '23514';
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

  -- p_transfer_number kept for API compat; server allocates sequential DC-YYYY-####.
  v_transfer_number := public.next_inventory_doc_number(v_tenant, 'transfer');

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
    v_transfer_number,
    'draft',
    p_notes,
    CASE WHEN v_is_intra THEN NULL ELSE p_vehicle_info END,
    v_uid
  )
  RETURNING id INTO v_transfer_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) AS line(value)
  LOOP
    v_ingredient_id := NULLIF(COALESCE(v_line->>'ingredientId', v_line->>'ingredient_id'), '')::bigint;
    v_entry_qty := NULLIF(v_line->>'quantity', '')::numeric(15,3);
    v_entry_unit_id := NULLIF(COALESCE(v_line->>'entryUnitId', v_line->>'entry_unit_id'), '')::bigint;

    IF v_ingredient_id IS NULL OR v_entry_qty IS NULL OR v_entry_qty <= 0 THEN
      RAISE EXCEPTION 'transfer_lines_invalid' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.ingredients i
      WHERE i.id = v_ingredient_id
        AND i.tenant_id = v_tenant
        AND i.is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'transfer_ingredient_invalid:%', v_ingredient_id USING ERRCODE = '23514';
    END IF;

    IF v_entry_unit_id IS NULL THEN
      SELECT iu.unit_id INTO v_entry_unit_id
      FROM public.ingredient_units iu
      JOIN public.units u
        ON u.id = iu.unit_id
       AND u.tenant_id = iu.tenant_id
       AND u.is_active = TRUE
      WHERE iu.tenant_id = v_tenant
        AND iu.ingredient_id = v_ingredient_id
        AND iu.is_base = TRUE
        AND iu.is_active = TRUE
      ORDER BY iu.sort_order ASC, iu.id ASC
      LIMIT 1;
    ELSE
      IF NOT EXISTS (
        SELECT 1
        FROM public.ingredient_units iu
        JOIN public.units u
          ON u.id = iu.unit_id
         AND u.tenant_id = iu.tenant_id
         AND u.is_active = TRUE
        WHERE iu.tenant_id = v_tenant
          AND iu.ingredient_id = v_ingredient_id
          AND iu.unit_id = v_entry_unit_id
          AND iu.is_active = TRUE
      ) THEN
        RAISE EXCEPTION 'entry_unit_not_found:%', v_ingredient_id USING ERRCODE = '23503';
      END IF;
    END IF;

    IF v_entry_unit_id IS NULL THEN
      RAISE EXCEPTION 'entry_unit_not_found:%', v_ingredient_id USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.stock_transfer_items (
      tenant_id,
      transfer_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      unit_cost_at_ship
    ) VALUES (
      v_tenant,
      v_transfer_id,
      v_ingredient_id,
      v_entry_qty,
      v_entry_unit_id,
      (
        SELECT sl.avg_unit_cost
        FROM public.stock_levels sl
        WHERE sl.tenant_id = v_tenant
          AND sl.branch_id = p_from_branch_id
          AND sl.location_id = p_from_location_id
          AND sl.ingredient_id = v_ingredient_id
        LIMIT 1
      )
    )
    ON CONFLICT (transfer_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      entry_unit_id = EXCLUDED.entry_unit_id,
      unit_cost_at_ship = EXCLUDED.unit_cost_at_ship;
  END LOOP;

  RETURN jsonb_build_object('id', v_transfer_id, 'status', 'draft', 'transfer_number', v_transfer_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_stocktake_session(p_branch_id bigint, p_location_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
        AND il.location_kind = 'warehouse'
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

  INSERT INTO public.stocktake_sessions (tenant_id, branch_id, location_id, created_by, session_number)
  VALUES (v_tenant, p_branch_id, v_loc_id, v_uid, public.next_inventory_doc_number(v_tenant, 'stocktake'))
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

  RETURN jsonb_build_object(
    'id', v_session_id,
    'session_number', (SELECT session_number FROM public.stocktake_sessions WHERE id = v_session_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_stocktake(p_branch_id bigint, p_location_id bigint DEFAULT NULL::bigint, p_mode text DEFAULT 'daily'::text, p_blind_mode boolean DEFAULT NULL::boolean, p_auditor_id uuid DEFAULT NULL::uuid, p_threshold_pct numeric DEFAULT NULL::numeric, p_threshold_vnd numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
        AND il.location_kind = 'warehouse'
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
    abc_snapshot_at, current_round, session_number
  )
  VALUES (
    v_tenant, p_branch_id, v_loc_id, 'in_progress', now(), v_uid, p_mode, v_blind,
    p_auditor_id, v_is_unaud, COALESCE(p_threshold_pct, 5.00), COALESCE(p_threshold_vnd, 200000), now(), 1,
    public.next_inventory_doc_number(v_tenant, 'stocktake')
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
  RETURN jsonb_build_object(
    'session_id', v_session,
    'session_number', (SELECT session_number FROM public.stocktake_sessions WHERE id = v_session),
    'mode', p_mode,
    'blind_mode', v_blind,
    'is_unaudited', v_is_unaud,
    'seeded_lines', v_rows,
    'abc_snapshot_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_waste_entry(p_branch_id bigint, p_location_id bigint, p_items jsonb, p_source_type text DEFAULT 'manual'::text, p_source_ref jsonb DEFAULT NULL::jsonb, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid(); v_tenant BIGINT; v_location RECORD; v_shift_key TEXT; v_issue_id BIGINT;
  v_issue_no TEXT; v_item JSONB; v_photos TEXT[]; v_created INT := 0; v_needs_appr BOOLEAN := false;
  v_entry_unit_id BIGINT;
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
  v_issue_no := public.next_inventory_doc_number(v_tenant, 'waste');
  INSERT INTO public.stock_issues (tenant_id, branch_id, issue_number, issue_type, status, notes,
    issued_at, created_by, source_location_id, approval_status, shift_key, source_type, source_ref)
  VALUES (v_tenant, p_branch_id, v_issue_no, 'writeoff', 'draft', p_notes,
    now(), v_uid, p_location_id, 'not_required', v_shift_key, COALESCE(p_source_type, 'manual'), p_source_ref)
  RETURNING id INTO v_issue_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_entry_unit_id := NULLIF(v_item->>'entry_unit_id','')::BIGINT;
    IF v_entry_unit_id IS NULL THEN
      RAISE EXCEPTION 'entry_unit_required' USING ERRCODE = '22023';
    END IF;
    v_photos := CASE WHEN v_item ? 'photo_urls'
                     THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'photo_urls'))
                     ELSE ARRAY[]::TEXT[] END;
    INSERT INTO public.stock_issue_items (tenant_id, issue_id, ingredient_id, quantity, entry_unit_id, unit_cost,
      reason_code, photo_urls, reason)
    VALUES (
      v_tenant,
      v_issue_id,
      (v_item->>'ingredient_id')::BIGINT,
      (v_item->>'quantity')::NUMERIC,
      v_entry_unit_id,
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

CREATE OR REPLACE FUNCTION public.create_expiry_writeoff(p_branch_id bigint, p_location_id bigint, p_ingredient_id bigint, p_quantity numeric, p_grn_item_id bigint DEFAULT NULL::bigint, p_note text DEFAULT NULL::text, p_photo_urls text[] DEFAULT ARRAY[]::text[]) RETURNS jsonb
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

  IF v_entry_unit_id IS NULL THEN
    SELECT iu.unit_id INTO v_entry_unit_id
      FROM public.ingredient_units iu
     WHERE iu.tenant_id = v_tenant
       AND iu.ingredient_id = p_ingredient_id
       AND iu.is_base = TRUE
       AND iu.is_active = TRUE
     LIMIT 1;
  END IF;
  IF v_entry_unit_id IS NULL THEN
    RAISE EXCEPTION 'entry_unit_required' USING ERRCODE = '22023';
  END IF;

  v_shift_key := public.inventory_shift_key(p_branch_id, now());
  v_issue_no := public.next_inventory_doc_number(v_tenant, 'waste');

  INSERT INTO public.stock_issues (tenant_id, branch_id, issue_number, issue_type, status, notes,
    issued_at, created_by, source_location_id, approval_status, shift_key, source_type, source_ref)
  VALUES (v_tenant, p_branch_id, v_issue_no, 'writeoff', 'draft', p_note,
    now(), v_uid, p_location_id, 'not_required', v_shift_key, 'manual', v_source_ref)
  RETURNING id INTO v_issue_id;

  SELECT avg_unit_cost INTO v_seed_cost
    FROM public.stock_levels
   WHERE tenant_id = v_tenant AND branch_id = p_branch_id
     AND location_id = p_location_id AND ingredient_id = p_ingredient_id;

  INSERT INTO public.stock_issue_items (tenant_id, issue_id, ingredient_id, quantity, entry_unit_id, unit_cost,
    reason_code, photo_urls, reason)
  VALUES (v_tenant, v_issue_id, p_ingredient_id, p_quantity, v_entry_unit_id,
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
END;
$$;

CREATE OR REPLACE FUNCTION public.recreate_grn_at_receiving_site(p_grn_id bigint, p_target_branch_id bigint, p_target_location_id bigint, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  c_numeric_15_3_max CONSTANT numeric := 999999999999.999;
  c_numeric_15_2_max CONSTANT numeric := 9999999999999.99;
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_old_grn record;
  v_target_location record;
  v_old_location_id bigint;
  v_new_grn_id bigint;
  v_new_po_id bigint;
  v_new_grn_number text;
  v_new_po_display text;
  v_line record;
  v_net_qty numeric;
  v_net_base numeric;
  v_cost_base numeric;
  v_old_current_qty numeric;
  v_target_current_qty numeric;
  v_target_wac numeric;
  v_next_wac numeric;
  v_old_po_auto boolean := false;
  v_auto_po_lines integer := 0;
  v_invoice_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'reason_required_min_10_chars' USING ERRCODE = '22023';
  END IF;

  SELECT g.* INTO v_old_grn
  FROM public.goods_received_notes g
  WHERE g.id = p_grn_id
    AND g.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_old_grn.status <> 'confirmed' THEN
    RAISE EXCEPTION 'grn_not_confirmed' USING ERRCODE = '22023';
  END IF;

  IF v_old_grn.branch_id = p_target_branch_id THEN
    RAISE EXCEPTION 'same_branch_use_location_amend' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission(v_old_grn.branch_id, 'procurement:grn_amend') THEN
    RAISE EXCEPTION 'forbidden_source_branch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(p_target_branch_id, 'procurement:grn_amend')
     OR NOT public.has_permission(p_target_branch_id, 'procurement:grn_confirm') THEN
    RAISE EXCEPTION 'forbidden_target_branch' USING ERRCODE = '42501';
  END IF;

  SELECT il.id, il.branch_id, il.location_kind
  INTO v_target_location
  FROM public.inventory_locations il
  WHERE il.id = p_target_location_id
    AND il.tenant_id = v_tenant
    AND il.branch_id = p_target_branch_id
    AND il.is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_location_invalid' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_returns sr
    WHERE sr.tenant_id = v_tenant
      AND sr.grn_id = p_grn_id
      AND sr.status <> 'cancelled'
  )
  OR EXISTS (
    SELECT 1
    FROM public.supplier_return_items sri
    JOIN public.supplier_returns sr
      ON sr.id = sri.return_id
     AND sr.tenant_id = sri.tenant_id
    JOIN public.grn_items gi
      ON gi.id = sri.grn_item_id
     AND gi.tenant_id = sri.tenant_id
    WHERE sri.tenant_id = v_tenant
      AND gi.grn_id = p_grn_id
      AND sr.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'has_active_supplier_return' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_invoices si
    WHERE si.tenant_id = v_tenant
      AND si.grn_id = p_grn_id
      AND (
        COALESCE(si.payment_status, 'unpaid') <> 'unpaid'
        OR COALESCE(si.paid_amount, 0) > 0
        OR COALESCE(si.credit_applied_amount, 0) > 0
      )
  ) THEN
    RAISE EXCEPTION 'has_paid_invoice' USING ERRCODE = '23514';
  END IF;

  IF v_old_grn.po_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.audit_logs al
      WHERE al.tenant_id = v_tenant
        AND al.action = 'inventory.po.created_from_grn'
        AND al.entity_type = 'purchase_order'
        AND al.entity_id = v_old_grn.po_id
        AND al.new_data ->> 'grn_id' = p_grn_id::text
    ) INTO v_old_po_auto;

    IF NOT v_old_po_auto THEN
      RAISE EXCEPTION 'source_po_attached' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.goods_received_notes g
      WHERE g.tenant_id = v_tenant
        AND g.po_id = v_old_grn.po_id
        AND g.id <> p_grn_id
        AND g.status = 'confirmed'
    ) THEN
      RAISE EXCEPTION 'source_po_shared' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_old_grn.location_id IS NOT NULL THEN
    SELECT il.id INTO v_old_location_id
    FROM public.inventory_locations il
    WHERE il.id = v_old_grn.location_id
      AND il.tenant_id = v_tenant
      AND il.branch_id = v_old_grn.branch_id
      AND il.is_active = TRUE;
  ELSE
    SELECT il.id INTO v_old_location_id
    FROM public.inventory_locations il
    WHERE il.tenant_id = v_tenant
      AND il.branch_id = v_old_grn.branch_id
      AND il.is_default_receive = TRUE
      AND il.is_active = TRUE
    ORDER BY il.sort_order NULLS LAST, il.id
    LIMIT 1;
  END IF;

  IF v_old_location_id IS NULL THEN
    RAISE EXCEPTION 'source_location_missing' USING ERRCODE = '23502';
  END IF;

  FOR v_line IN
    SELECT gi.*
    FROM public.grn_items gi
    WHERE gi.tenant_id = v_tenant
      AND gi.grn_id = p_grn_id
    ORDER BY gi.id
    FOR UPDATE
  LOOP
    v_net_qty := v_line.received_quantity - COALESCE(v_line.rejected_quantity, 0);
    v_net_base := public.inv_to_base(v_line.ingredient_id, v_line.entry_unit_id, v_net_qty);
    v_cost_base := CASE
      WHEN v_net_base <> 0 THEN ROUND((v_net_qty * v_line.unit_cost) / v_net_base, 2)
      ELSE v_line.unit_cost
    END;

    IF abs(v_net_base) > c_numeric_15_3_max
       OR abs(v_cost_base) > c_numeric_15_2_max THEN
      RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
    END IF;

    IF v_net_base <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.stock_levels (
      tenant_id, branch_id, ingredient_id, location_id, current_quantity
    ) VALUES (
      v_tenant, p_target_branch_id, v_line.ingredient_id, p_target_location_id, 0
    )
    ON CONFLICT ON CONSTRAINT stock_levels_ingredient_branch_location_tenant_key
    DO NOTHING;

    PERFORM 1
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.ingredient_id = v_line.ingredient_id
      AND (
        (sl.branch_id = v_old_grn.branch_id AND sl.location_id = v_old_location_id)
        OR (sl.branch_id = p_target_branch_id AND sl.location_id = p_target_location_id)
      )
    ORDER BY sl.branch_id, sl.location_id, sl.ingredient_id
    FOR UPDATE;

    SELECT sl.current_quantity
    INTO v_old_current_qty
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_old_grn.branch_id
      AND sl.location_id = v_old_location_id
      AND sl.ingredient_id = v_line.ingredient_id;

    IF COALESCE(v_old_current_qty, 0) < v_net_base THEN
      RAISE EXCEPTION 'insufficient_source_stock:%', v_line.ingredient_id USING ERRCODE = '23514';
    END IF;
  END LOOP;

  v_new_grn_number := public.next_inventory_doc_number(v_tenant, 'grn');

  INSERT INTO public.goods_received_notes (
    tenant_id, branch_id, location_id, supplier_id, po_id, grn_number,
    received_date, received_by, status, notes, created_by
  ) VALUES (
    v_tenant, p_target_branch_id, p_target_location_id, v_old_grn.supplier_id,
    NULL, v_new_grn_number, v_old_grn.received_date, v_uid, 'confirmed',
    NULLIF(btrim(v_old_grn.notes), ''), v_uid
  )
  RETURNING id INTO v_new_grn_id;

  INSERT INTO public.grn_items (
    tenant_id, grn_id, ingredient_id, po_quantity, received_quantity,
    entry_unit_id, unit_cost, total_cost, quality_status, rejected_quantity,
    rejection_reason, expiry_date, batch_number, receiving_temperature,
    po_unit_price, price_override_note, price_override_photo_url,
    rejected_photo_url, requires_review, short_delivery_action
  )
  SELECT
    tenant_id, v_new_grn_id, ingredient_id, po_quantity, received_quantity,
    entry_unit_id, unit_cost, total_cost, quality_status, rejected_quantity,
    rejection_reason, expiry_date, batch_number, receiving_temperature,
    po_unit_price, price_override_note, price_override_photo_url,
    rejected_photo_url, requires_review, short_delivery_action
  FROM public.grn_items
  WHERE tenant_id = v_tenant
    AND grn_id = p_grn_id
  ORDER BY id;

  IF EXISTS (
    SELECT 1
    FROM public.grn_items gi
    WHERE gi.tenant_id = v_tenant
      AND gi.grn_id = v_new_grn_id
      AND gi.quality_status <> 'rejected'
      AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0
  ) THEN
    v_new_po_display := public.next_po_display_id(v_tenant);

    INSERT INTO public.purchase_orders (
      tenant_id, branch_id, supplier_id, po_number, display_id, status, notes, created_by
    ) VALUES (
      v_tenant, p_target_branch_id, v_old_grn.supplier_id, v_new_po_display,
      v_new_po_display, 'received', NULLIF(btrim(v_old_grn.notes), ''), v_uid
    )
    RETURNING id INTO v_new_po_id;

    INSERT INTO public.purchase_order_items (
      tenant_id, po_id, ingredient_id, quantity, entry_unit_id, unit_price_est, line_total
    )
    SELECT
      v_tenant,
      v_new_po_id,
      gi.ingredient_id,
      (gi.received_quantity - COALESCE(gi.rejected_quantity, 0))::numeric(15,3),
      gi.entry_unit_id,
      gi.unit_cost,
      ROUND((gi.received_quantity - COALESCE(gi.rejected_quantity, 0)) * gi.unit_cost, 2)
    FROM public.grn_items gi
    WHERE gi.tenant_id = v_tenant
      AND gi.grn_id = v_new_grn_id
      AND gi.quality_status <> 'rejected'
      AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0;

    GET DIAGNOSTICS v_auto_po_lines = ROW_COUNT;

    UPDATE public.grn_items gi
    SET po_quantity = gi.received_quantity - COALESCE(gi.rejected_quantity, 0),
        po_unit_price = gi.unit_cost
    WHERE gi.tenant_id = v_tenant
      AND gi.grn_id = v_new_grn_id
      AND gi.quality_status <> 'rejected'
      AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0;

    UPDATE public.goods_received_notes
    SET po_id = v_new_po_id, updated_at = now()
    WHERE id = v_new_grn_id
      AND tenant_id = v_tenant;

    PERFORM public.log_audit(
      'inventory.po.created_from_grn',
      'purchase_order',
      v_new_po_id,
      NULL,
      jsonb_build_object(
        'grn_id', v_new_grn_id,
        'lines', v_auto_po_lines,
        'branch_id', p_target_branch_id
      )
    );
  END IF;

  FOR v_line IN
    SELECT gi.*
    FROM public.grn_items gi
    WHERE gi.tenant_id = v_tenant
      AND gi.grn_id = p_grn_id
    ORDER BY gi.id
  LOOP
    v_net_qty := v_line.received_quantity - COALESCE(v_line.rejected_quantity, 0);
    v_net_base := public.inv_to_base(v_line.ingredient_id, v_line.entry_unit_id, v_net_qty);
    v_cost_base := CASE
      WHEN v_net_base <> 0 THEN ROUND((v_net_qty * v_line.unit_cost) / v_net_base, 2)
      ELSE v_line.unit_cost
    END;

    IF v_net_base <= 0 THEN
      CONTINUE;
    END IF;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_target_current_qty, v_target_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = p_target_branch_id
      AND sl.location_id = p_target_location_id
      AND sl.ingredient_id = v_line.ingredient_id;

    v_target_current_qty := COALESCE(v_target_current_qty, 0);

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, grn_id, unit_cost, location_id,
      entry_unit_id, entry_quantity
    ) VALUES (
      v_tenant, v_old_grn.branch_id, v_line.ingredient_id, 'grn_amend',
      -v_net_base,
      'GRN ' || v_old_grn.grn_number || ' recreated at ' || v_new_grn_number ||
        ': reverse source receipt - ' || trim(p_reason),
      v_uid, p_grn_id, v_cost_base, v_old_location_id,
      v_line.entry_unit_id, v_net_qty
    );

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, grn_id, unit_cost, location_id,
      entry_unit_id, entry_quantity
    ) VALUES (
      v_tenant, p_target_branch_id, v_line.ingredient_id, 'grn_receipt',
      v_net_base,
      'GRN ' || v_new_grn_number || ' recreated from ' || v_old_grn.grn_number ||
        ': target receipt - ' || trim(p_reason),
      v_uid, v_new_grn_id, v_cost_base, p_target_location_id,
      v_line.entry_unit_id, v_net_qty
    );

    v_next_wac := CASE
      WHEN v_target_current_qty + v_net_base > 0 THEN ROUND(
        ((v_target_current_qty * COALESCE(v_target_wac, 0)) + (v_net_base * v_cost_base))
        / (v_target_current_qty + v_net_base),
        2
      )
      ELSE v_cost_base
    END;

    IF abs(v_next_wac) > c_numeric_15_2_max THEN
      RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_next_wac,
        updated_at = now()
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = p_target_branch_id
      AND sl.location_id = p_target_location_id
      AND sl.ingredient_id = v_line.ingredient_id;

    UPDATE public.ingredients i
    SET unit_cost = v_cost_base,
        updated_at = now()
    WHERE i.tenant_id = v_tenant
      AND i.id = v_line.ingredient_id;
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  IF v_old_po_auto THEN
    UPDATE public.purchase_orders
    SET status = 'cancelled', updated_at = now()
    WHERE id = v_old_grn.po_id
      AND tenant_id = v_tenant
      AND status IN ('sent', 'partially_received', 'received');
  END IF;

  UPDATE public.supplier_invoices
  SET grn_id = v_new_grn_id,
      po_id = v_new_po_id,
      updated_at = now()
  WHERE tenant_id = v_tenant
    AND grn_id = p_grn_id
    AND COALESCE(payment_status, 'unpaid') = 'unpaid'
    AND COALESCE(paid_amount, 0) = 0
    AND COALESCE(credit_applied_amount, 0) = 0;

  FOR v_invoice_id IN
    SELECT id
    FROM public.supplier_invoices
    WHERE tenant_id = v_tenant
      AND grn_id = v_new_grn_id
  LOOP
    PERFORM public.recompute_supplier_invoice_matching(v_invoice_id);
  END LOOP;

  PERFORM public.log_audit(
    'inventory.grn.recreated_receiving_site',
    'goods_received_note',
    p_grn_id,
    jsonb_build_object(
      'grn_id', p_grn_id,
      'grn_number', v_old_grn.grn_number,
      'branch_id', v_old_grn.branch_id,
      'location_id', v_old_location_id,
      'po_id', v_old_grn.po_id,
      'status', 'confirmed'
    ),
    jsonb_build_object(
      'new_grn_id', v_new_grn_id,
      'new_grn_number', v_new_grn_number,
      'branch_id', p_target_branch_id,
      'location_id', p_target_location_id,
      'po_id', v_new_po_id,
      'old_auto_po_cancelled', v_old_po_auto,
      'reason', trim(p_reason)
    )
  );

  PERFORM public.log_audit(
    'inventory.grn.recreated_from_source',
    'goods_received_note',
    v_new_grn_id,
    NULL,
    jsonb_build_object(
      'source_grn_id', p_grn_id,
      'source_grn_number', v_old_grn.grn_number,
      'reason', trim(p_reason)
    )
  );

  RETURN jsonb_build_object(
    'old_grn_id', p_grn_id,
    'old_grn_number', v_old_grn.grn_number,
    'new_grn_id', v_new_grn_id,
    'new_grn_number', v_new_grn_number,
    'new_po_id', v_new_po_id,
    'old_auto_po_cancelled', v_old_po_auto
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_inventory_count_slip(p_branch_id bigint, p_location_id bigint, p_lines jsonb, p_shift_id bigint DEFAULT NULL::bigint) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant        BIGINT := public.auth_tenant_id();
  v_uid           UUID   := auth.uid();
  v_employee_id   BIGINT;
  v_employee_name TEXT;
  v_today         DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_shift_id      BIGINT := p_shift_id;
  v_slip_id       BIGINT;
  v_status        TEXT;
  v_line          jsonb;
  v_ingredient_id BIGINT;
  v_counted       NUMERIC(15,3);
  v_assigned_count INT;
  v_line_count    INT;
  v_location_id   BIGINT := p_location_id;
  v_branch_kind   TEXT;
  v_location_kind TEXT;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'empty_count' USING ERRCODE = '22023';
  END IF;

  SELECT b.branch_kind, l.location_kind
  INTO v_branch_kind, v_location_kind
  FROM public.inventory_locations l
  JOIN public.branches b
    ON b.id = l.branch_id
   AND b.tenant_id = l.tenant_id
  WHERE l.id = p_location_id
    AND l.branch_id = p_branch_id
    AND l.tenant_id = v_tenant
    AND l.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_branch_kind = 'branch' AND v_location_kind <> 'warehouse' THEN
    SELECT l.id INTO v_location_id
    FROM public.inventory_locations l
    WHERE l.branch_id = p_branch_id
      AND l.tenant_id = v_tenant
      AND l.location_kind = 'warehouse'
      AND l.is_active
    ORDER BY l.is_default_consumption DESC, l.sort_order NULLS LAST, l.id
    LIMIT 1;

    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'branch_warehouse_location_missing' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF v_shift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.id = v_shift_id
      AND s.tenant_id = v_tenant
      AND s.is_active
      AND (s.branch_id IS NULL OR s.branch_id = p_branch_id)
  ) THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT e.id, pr.full_name INTO v_employee_id, v_employee_name
  FROM public.employees e
  JOIN public.profiles pr ON pr.id = e.profile_id
  WHERE e.profile_id = v_uid AND e.tenant_id = v_tenant AND e.is_active
    AND pr.tenant_id = v_tenant AND pr.branch_id = p_branch_id
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'no_active_employee_in_branch' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(v_employee_id);

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_ingredient_id := (v_line->>'ingredient_id')::BIGINT;
    v_counted := (v_line->>'counted_quantity')::NUMERIC;
    IF v_ingredient_id IS NULL OR v_counted IS NULL THEN
      RAISE EXCEPTION 'invalid_line' USING ERRCODE = '22023';
    END IF;
    IF v_counted < 0 THEN
      RAISE EXCEPTION 'negative_count' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.inventory_count_assignments a
      WHERE a.tenant_id = v_tenant AND a.branch_id = p_branch_id
        AND a.location_id = v_location_id AND a.employee_id = v_employee_id
        AND a.ingredient_id = v_ingredient_id AND a.is_active
        AND (
          (v_shift_id IS NULL AND a.shift_id IS NULL)
          OR (
            v_shift_id IS NOT NULL
            AND (
              a.shift_id = v_shift_id
              OR (
                a.shift_id IS NULL
                AND NOT EXISTS (
                  SELECT 1 FROM public.inventory_count_assignments specific
                  WHERE specific.tenant_id = v_tenant
                    AND specific.branch_id = p_branch_id
                    AND specific.location_id = v_location_id
                    AND specific.ingredient_id = v_ingredient_id
                    AND specific.shift_id = v_shift_id
                    AND specific.is_active
                )
              )
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'not_assigned' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  SELECT count(DISTINCT a.ingredient_id) INTO v_assigned_count
  FROM public.inventory_count_assignments a
  WHERE a.tenant_id = v_tenant AND a.branch_id = p_branch_id
    AND a.location_id = v_location_id AND a.employee_id = v_employee_id
    AND a.is_active
    AND (
      (v_shift_id IS NULL AND a.shift_id IS NULL)
      OR (
        v_shift_id IS NOT NULL
        AND (
          a.shift_id = v_shift_id
          OR (
            a.shift_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM public.inventory_count_assignments specific
              WHERE specific.tenant_id = v_tenant
                AND specific.branch_id = p_branch_id
                AND specific.location_id = v_location_id
                AND specific.ingredient_id = a.ingredient_id
                AND specific.shift_id = v_shift_id
                AND specific.is_active
            )
          )
        )
      )
    );

  SELECT count(DISTINCT (l->>'ingredient_id')::BIGINT) INTO v_line_count
  FROM jsonb_array_elements(p_lines) l;

  IF v_line_count <> v_assigned_count THEN
    RAISE EXCEPTION 'incomplete_count' USING ERRCODE = '22023';
  END IF;

  SELECT id, status INTO v_slip_id, v_status
  FROM public.inventory_count_slips
  WHERE tenant_id = v_tenant AND branch_id = p_branch_id AND location_id = v_location_id
    AND employee_id = v_employee_id AND count_date = v_today
    AND shift_id IS NOT DISTINCT FROM v_shift_id
  FOR UPDATE;

  IF v_slip_id IS NOT NULL AND v_status = 'approved' THEN
    RAISE EXCEPTION 'slip_already_approved' USING ERRCODE = '22023';
  END IF;

  IF v_slip_id IS NULL THEN
    INSERT INTO public.inventory_count_slips
      (tenant_id, branch_id, location_id, employee_id, count_date, shift_id, status, submitted_by, submitted_at, slip_number)
    VALUES
      (v_tenant, p_branch_id, v_location_id, v_employee_id, v_today, v_shift_id, 'submitted', v_uid, now(),
       public.next_inventory_doc_number(v_tenant, 'count_slip'))
    RETURNING id INTO v_slip_id;
  ELSE
    UPDATE public.inventory_count_slips
    SET status = 'submitted', submitted_by = v_uid, submitted_at = now(),
        reviewed_by = NULL, reviewed_at = NULL, review_note = NULL, updated_at = now()
    WHERE id = v_slip_id;
    DELETE FROM public.inventory_count_slip_lines WHERE slip_id = v_slip_id;
  END IF;

  INSERT INTO public.inventory_count_slip_lines
    (tenant_id, slip_id, ingredient_id, system_quantity, counted_quantity, entry_unit_id, note)
  SELECT
    v_tenant,
    v_slip_id,
    (l->>'ingredient_id')::BIGINT,
    COALESCE((
      SELECT stl.current_quantity FROM public.stock_levels stl
      WHERE stl.tenant_id = v_tenant AND stl.branch_id = p_branch_id
        AND stl.location_id = v_location_id AND stl.ingredient_id = (l->>'ingredient_id')::BIGINT
    ), 0),
    (l->>'counted_quantity')::NUMERIC,
    NULLIF(l->>'entry_unit_id','')::BIGINT,
    NULLIF(trim(l->>'note'), '')
  FROM jsonb_array_elements(p_lines) l;

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, meta, dedup_key
  )
  VALUES (
    v_tenant,
    p_branch_id,
    ARRAY['branch_manager', 'owner', 'owner']::text[],
    'inventory.count_slip_submitted',
    'info',
    'Phiếu đếm tồn mới',
    format('%s đã gửi phiếu đếm tồn (%s mục) chờ duyệt.', COALESCE(v_employee_name, 'Nhân viên'), v_line_count),
    'inventory_count_slip',
    v_slip_id,
    format('/br/%s/stock/count-slips', p_branch_id),
    jsonb_build_object(
      'slip_id', v_slip_id,
      'employee_id', v_employee_id,
      'branch_id', p_branch_id,
      'location_id', v_location_id,
      'shift_id', v_shift_id,
      'line_count', v_line_count
    ),
    format('inventory.count_slip:%s:submitted', v_slip_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;

  PERFORM public.log_audit(
    'submit'::TEXT,
    'inventory_count_slip'::TEXT,
    v_slip_id,
    NULL,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'location_id', v_location_id,
      'shift_id', v_shift_id,
      'line_count', v_line_count
    )
  );

  RETURN v_slip_id;
END;
$$;
