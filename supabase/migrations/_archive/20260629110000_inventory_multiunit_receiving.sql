-- Phase B2 (Receiving): let PO/GRN lines carry an entry unit and convert to the
-- ingredient base unit at confirm. entry_unit_id NULL => quantities already in
-- base (back-compat with rows/callers predating this change).

ALTER TABLE public.purchase_order_items
  ADD COLUMN entry_unit_id BIGINT REFERENCES public.units(id) ON DELETE RESTRICT;
ALTER TABLE public.grn_items
  ADD COLUMN entry_unit_id BIGINT REFERENCES public.units(id) ON DELETE RESTRICT;
ALTER TABLE public.stock_movements
  ADD COLUMN entry_unit_id BIGINT REFERENCES public.units(id) ON DELETE RESTRICT,
  ADD COLUMN entry_quantity NUMERIC(15,3);

-- ── create_purchase_order_with_lines: accept entry_unit_id per line ──
CREATE OR REPLACE FUNCTION public.create_purchase_order_with_lines(p_supplier_id bigint, p_branch_id bigint, p_notes text, p_lines jsonb)
 RETURNS jsonb
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
    v_tenant_id, v_po_id, x.ingredient_id, x.quantity, x.unit, x.entry_unit_id, x.unit_price_est,
    CASE WHEN x.unit_price_est IS NULL THEN NULL
         ELSE round(x.quantity * x.unit_price_est, 2) END
  FROM jsonb_to_recordset(p_lines) AS x(
    ingredient_id  bigint,
    quantity       numeric,
    unit           text,
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
  IF v_count = 0 THEN
    RAISE EXCEPTION 'invalid_po_lines' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object('id', v_po_id, 'display_id', v_display, 'lines', v_count);
END;
$function$;

-- ── create_grn_from_po: carry entry_unit_id; compute remaining in base, then
--    re-express it in the PO line entry unit for the new GRN line ──
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
           poi.unit,
           poi.entry_unit_id,
           poi.quantity::NUMERIC(15,3)                  AS po_quantity,
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
    received_quantity, unit, entry_unit_id, unit_cost, total_cost,
    quality_status
  )
  SELECT v_tenant_id,
         v_grn_id,
         r.ingredient_id,
         r.po_quantity,
         r.po_unit_price,
         r.remaining,
         r.unit,
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

-- ── confirm_goods_receipt_note: convert received qty + cost to base before
--    posting the movement and recomputing WAC ──
CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(p_grn_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid             UUID   := auth.uid();
  v_tenant          BIGINT := public.auth_tenant_id();
  v_grn             RECORD;
  v_item            RECORD;
  v_branch          RECORD;
  v_old_q           NUMERIC(15,3);
  v_old_wac         NUMERIC(15,2);
  v_recv            NUMERIC(15,3);
  v_recv_base       NUMERIC(15,3);
  v_cost            NUMERIC(15,2);
  v_money           NUMERIC(15,2);
  v_cost_base       NUMERIC(15,2);
  v_new_q           NUMERIC(15,3);
  v_new_wac         NUMERIC(15,2);
  v_location_id     BIGINT;
  v_all_fulfilled   BOOLEAN;
  v_po_status       TEXT;
  v_review_pct      NUMERIC(5,2);
  v_review_count    INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT g.* INTO v_grn
  FROM public.goods_received_notes g
  WHERE g.id = p_grn_id AND g.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_grn.branch_id, 'procurement:grn_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '22023';
  END IF;

  SELECT b.id, b.branch_kind INTO v_branch
  FROM public.branches b
  WHERE b.id = v_grn.branch_id
    AND b.tenant_id = v_tenant
    AND b.branch_kind IN ('branch', 'central_supply', 'central_kitchen');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_branch_must_be_operational' USING ERRCODE = '23514';
  END IF;

  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_grn.branch_id
    AND il.tenant_id = v_tenant
    AND il.is_default_receive = TRUE
    AND il.is_active = TRUE
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'grn_default_receive_location_missing' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(qc.price_variance_review_pct, 15.0)
  INTO v_review_pct
  FROM public.inventory_qc_settings qc
  WHERE qc.tenant_id = v_tenant;
  IF NOT FOUND THEN
    v_review_pct := 15.0;
  END IF;

  FOR v_item IN
    SELECT * FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id AND gi.tenant_id = v_tenant
  LOOP
    IF v_item.price_variance_pct IS NOT NULL
       AND ABS(v_item.price_variance_pct) > v_review_pct THEN
      UPDATE public.grn_items
      SET requires_review = TRUE
      WHERE id = v_item.id;
      v_review_count := v_review_count + 1;
    END IF;

    v_recv := v_item.received_quantity - COALESCE(v_item.rejected_quantity, 0);

    IF v_item.quality_status = 'rejected' OR v_recv <= 0 THEN
      CONTINUE;
    END IF;

    -- entered quantity/cost are in v_item.entry_unit_id (NULL => base).
    v_recv_base := public.inv_to_base(v_item.ingredient_id, v_item.entry_unit_id, v_recv);
    v_cost      := v_item.unit_cost;                 -- per entered unit
    v_money     := ROUND(v_recv * v_cost, 2);        -- total paid for this line
    v_cost_base := CASE WHEN v_recv_base <> 0 THEN ROUND(v_money / v_recv_base, 2) ELSE v_cost END;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_grn.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_item.ingredient_id;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, grn_id, unit_cost, location_id,
      entry_unit_id, entry_quantity
    ) VALUES (
      v_tenant, v_grn.branch_id, v_item.ingredient_id, 'grn_receipt', v_recv_base,
      'GRN ' || v_grn.grn_number, v_uid, p_grn_id, v_cost_base, v_location_id,
      v_item.entry_unit_id, v_recv
    );

    v_new_q := COALESCE(v_old_q, 0) + v_recv_base;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_money
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost_base;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_grn.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_item.ingredient_id;

    UPDATE public.ingredients i
    SET unit_cost = v_cost_base, updated_at = now()
    WHERE i.id = v_item.ingredient_id AND i.tenant_id = v_tenant;
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'confirmed', updated_at = now()
  WHERE id = p_grn_id;

  IF v_grn.po_id IS NOT NULL THEN
    PERFORM 1
    FROM public.purchase_orders
    WHERE id = v_grn.po_id AND tenant_id = v_tenant
    FOR UPDATE;

    WITH ordered AS (
      SELECT poi.ingredient_id,
             SUM(public.inv_to_base(poi.ingredient_id, poi.entry_unit_id, poi.quantity))::NUMERIC(15,3) AS qty
      FROM public.purchase_order_items poi
      WHERE poi.po_id = v_grn.po_id
        AND poi.tenant_id = v_tenant
      GROUP BY poi.ingredient_id
    ),
    received AS (
      SELECT gi.ingredient_id,
             SUM(public.inv_to_base(gi.ingredient_id, gi.entry_unit_id,
                   gi.received_quantity - COALESCE(gi.rejected_quantity, 0)))::NUMERIC(15,3) AS qty
      FROM public.grn_items gi
      JOIN public.goods_received_notes g
        ON g.id = gi.grn_id AND g.status = 'confirmed'
      WHERE g.po_id = v_grn.po_id
        AND gi.tenant_id = v_tenant
      GROUP BY gi.ingredient_id
    )
    SELECT bool_and(COALESCE(r.qty, 0) >= o.qty * 0.95)
    INTO v_all_fulfilled
    FROM ordered o
    LEFT JOIN received r USING (ingredient_id)
    WHERE o.qty > 0;

    UPDATE public.purchase_orders po
    SET status = CASE
          WHEN COALESCE(v_all_fulfilled, TRUE) THEN 'received'
          WHEN EXISTS (
            SELECT 1 FROM public.grn_items gi2
            JOIN public.goods_received_notes g2 ON g2.id = gi2.grn_id
            WHERE g2.po_id = v_grn.po_id
              AND g2.tenant_id = v_tenant
              AND gi2.short_delivery_action = 'accept_and_close'
          ) THEN 'received'
          ELSE 'partially_received'
        END,
        updated_at = now()
    WHERE po.id = v_grn.po_id
      AND po.tenant_id = v_tenant
      AND po.status IN ('sent', 'partially_received')
    RETURNING po.status INTO v_po_status;
  END IF;

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'status', 'confirmed',
    'po_id', v_grn.po_id,
    'po_status', v_po_status,
    'review_count', v_review_count
  );
END;
$function$;
