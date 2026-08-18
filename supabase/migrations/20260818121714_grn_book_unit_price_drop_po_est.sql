-- ADR 0041: GRN net unit price is the inventory book event.
-- Supplier invoice confirm is AP + VAT only (no invoice_reprice).
-- Drop leftover PO estimate columns.
-- Warehouse with procurement:grn_create must read/write GRN book price.

GRANT SELECT (unit_cost, total_cost) ON public.grn_items TO authenticated;
GRANT INSERT (unit_cost) ON public.grn_items TO authenticated;
GRANT UPDATE (unit_cost) ON public.grn_items TO authenticated;

ALTER TABLE public.grn_items
  ADD COLUMN IF NOT EXISTS unit_cost_unit_id bigint;

ALTER TABLE public.grn_items
  DROP CONSTRAINT IF EXISTS grn_items_unit_cost_unit_id_fkey;
ALTER TABLE public.grn_items
  ADD CONSTRAINT grn_items_unit_cost_unit_id_fkey
  FOREIGN KEY (unit_cost_unit_id) REFERENCES public.units(id);

-- Confirmed lines raise confirmed_grn_lines_immutable; draft updates would
-- also zero total_cost / po_applied_quantity. Backfill only the new column.
ALTER TABLE public.grn_items
  DISABLE TRIGGER trg_grn_items_linked_immutability;

UPDATE public.grn_items AS item
SET unit_cost_unit_id = COALESCE(
  (
    SELECT po_item.entry_unit_id
    FROM public.purchase_order_items AS po_item
    WHERE po_item.id = item.purchase_order_item_id
      AND po_item.tenant_id = item.tenant_id
      AND po_item.entry_unit_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.ingredient_units AS ingredient_unit
        WHERE ingredient_unit.tenant_id = item.tenant_id
          AND ingredient_unit.ingredient_id = item.ingredient_id
          AND ingredient_unit.unit_id = po_item.entry_unit_id
          AND ingredient_unit.is_active
      )
  ),
  item.entry_unit_id
)
WHERE item.unit_cost_unit_id IS NULL;

ALTER TABLE public.grn_items
  ENABLE TRIGGER trg_grn_items_linked_immutability;

ALTER TABLE public.grn_items
  DROP CONSTRAINT IF EXISTS grn_items_unit_cost_unit_required;
ALTER TABLE public.grn_items
  ADD CONSTRAINT grn_items_unit_cost_unit_required CHECK (
    unit_cost <= 0 OR unit_cost_unit_id IS NOT NULL
  );

GRANT SELECT (unit_cost_unit_id) ON public.grn_items TO authenticated;
GRANT INSERT (unit_cost_unit_id) ON public.grn_items TO authenticated;
GRANT UPDATE (unit_cost_unit_id) ON public.grn_items TO authenticated;

COMMENT ON COLUMN public.grn_items.unit_cost IS
  'Net VND quoted per unit_cost_unit_id. Never assume persist/entry qty unit.';
COMMENT ON COLUMN public.grn_items.unit_cost_unit_id IS
  'Active ingredient unit that unit_cost is quoted in.';

CREATE OR REPLACE FUNCTION private.grn_line_book_total(
  p_tenant_id bigint,
  p_ingredient_id bigint,
  p_accepted_qty numeric,
  p_entry_unit_id bigint,
  p_unit_cost numeric,
  p_unit_cost_unit_id bigint
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_accepted_base numeric;
  v_price_base_of_one numeric;
BEGIN
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'grn_unit_price_invalid' USING ERRCODE = '23514';
  END IF;
  IF p_unit_cost = 0 OR coalesce(p_accepted_qty, 0) <= 0 THEN
    RETURN 0;
  END IF;
  IF p_entry_unit_id IS NULL OR p_unit_cost_unit_id IS NULL THEN
    RAISE EXCEPTION 'grn_unit_price_unit_required' USING ERRCODE = '23514';
  END IF;
  v_accepted_base := public.inv_to_base_for_tenant(
    p_tenant_id,
    p_ingredient_id,
    p_entry_unit_id,
    p_accepted_qty
  );
  v_price_base_of_one := public.inv_to_base_for_tenant(
    p_tenant_id,
    p_ingredient_id,
    p_unit_cost_unit_id,
    1
  );
  IF v_accepted_base IS NULL
     OR v_price_base_of_one IS NULL
     OR v_price_base_of_one <= 0 THEN
    RAISE EXCEPTION 'grn_unit_price_unit_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN pg_catalog.round(
    v_accepted_base * p_unit_cost / v_price_base_of_one,
    2
  );
END;
$$;

REVOKE ALL ON FUNCTION private.grn_line_book_total(
  bigint, bigint, numeric, bigint, numeric, bigint
) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.grn_items
  DROP CONSTRAINT IF EXISTS grn_items_provisional_cost_source_check;

ALTER TABLE public.grn_items
  ADD CONSTRAINT grn_items_provisional_cost_source_check CHECK (
    provisional_cost_source IS NULL
    OR provisional_cost_source IN (
      'wac',
      'reference',
      'pending',
      'invoice',
      'grn_receipt'
    )
  );

CREATE OR REPLACE FUNCTION private.apply_latest_supplier_price_to_grn_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.unit_cost IS NULL OR NEW.unit_cost < 0 THEN
    RAISE EXCEPTION 'grn_unit_price_invalid'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.unit_cost > 0 THEN
    IF NEW.unit_cost_unit_id IS NULL THEN
      RAISE EXCEPTION 'grn_unit_price_unit_required'
        USING ERRCODE = '23514';
    END IF;
    NEW.cost_pending := FALSE;
    NEW.provisional_cost_source := 'grn_receipt';
    NEW.total_cost := private.grn_line_book_total(
      NEW.tenant_id,
      NEW.ingredient_id,
      NEW.received_quantity - NEW.rejected_quantity,
      NEW.entry_unit_id,
      NEW.unit_cost,
      NEW.unit_cost_unit_id
    );
  ELSE
    NEW.cost_pending := TRUE;
    NEW.provisional_cost_source := 'pending';
    NEW.total_cost := 0;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.apply_latest_supplier_price_to_grn_line()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS aaa_grn_items_latest_supplier_price
  ON public.grn_items;
CREATE TRIGGER aaa_grn_items_latest_supplier_price
BEFORE INSERT OR UPDATE OF
  unit_cost,
  unit_cost_unit_id,
  received_quantity,
  rejected_quantity,
  entry_unit_id
ON public.grn_items
FOR EACH ROW
EXECUTE FUNCTION private.apply_latest_supplier_price_to_grn_line();

DO $patch_linked$
DECLARE
  v_def text;
  v_updated text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'enforce_linked_grn_line_immutability';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'enforce_linked_grn_line_immutability missing';
  END IF;

  v_def := replace(replace(v_def, E'\r\n', E'\n'), E'\r', E'\n');
  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  v_updated := replace(
    v_def,
    $old$  IF TG_OP = 'UPDATE' THEN
    NEW.unit_cost := OLD.unit_cost;
    NEW.cost_pending := OLD.cost_pending;
    NEW.provisional_cost_source := OLD.provisional_cost_source;
  END IF;
  NEW.total_cost := 0;
  NEW.po_applied_quantity := 0;$old$,
    $new$  IF NEW.unit_cost > 0 THEN
    NEW.total_cost := private.grn_line_book_total(
      NEW.tenant_id,
      NEW.ingredient_id,
      NEW.received_quantity - NEW.rejected_quantity,
      NEW.entry_unit_id,
      NEW.unit_cost,
      NEW.unit_cost_unit_id
    );
  ELSE
    NEW.total_cost := 0;
  END IF;
  NEW.po_applied_quantity := 0;$new$
  );

  IF v_updated = v_def THEN
    RAISE EXCEPTION
      'enforce_linked_grn_line_immutability unit_cost patch failed';
  END IF;

  EXECUTE v_updated;
END;
$patch_linked$;

CREATE OR REPLACE FUNCTION private.settle_supplier_invoice_valuation(
  p_invoice_id bigint,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- ADR 0041: invoice does not reprice inventory, WAC, or food cost.
  RETURN pg_catalog.jsonb_build_object(
    'status', 'ap_only',
    'invoice_id', p_invoice_id,
    'idempotency_key', p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_goods_receipt_note(
  p_grn_id bigint,
  p_received_date timestamp with time zone,
  p_notes text,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_grn public.goods_received_notes%ROWTYPE;
  v_input_count integer;
  v_distinct_count integer;
  v_expected_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'grn_lines_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = p_grn_id
    AND grn.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_grn.branch_id, 'procurement:grn_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '23514';
  END IF;

  SELECT count(*), count(DISTINCT line.line_id)
  INTO v_input_count, v_distinct_count
  FROM jsonb_to_recordset(p_lines)
    AS line(line_id bigint);

  SELECT count(*)
  INTO v_expected_count
  FROM public.grn_items AS item
  WHERE item.grn_id = p_grn_id
    AND item.tenant_id = v_tenant;

  IF v_input_count <> v_distinct_count
     OR v_input_count <> v_expected_count
     OR EXISTS (
       SELECT 1
       FROM jsonb_to_recordset(p_lines)
         AS line(
           line_id bigint,
           received_quantity numeric,
           rejected_quantity numeric,
           rejection_reason text,
           rejected_photo_url text,
           entry_unit_id bigint,
           unit_cost numeric,
           unit_cost_unit_id bigint
         )
       LEFT JOIN public.grn_items AS item
         ON item.id = line.line_id
        AND item.grn_id = p_grn_id
        AND item.tenant_id = v_tenant
       WHERE item.id IS NULL
          OR line.received_quantity IS NULL
          OR line.received_quantity < 0
          OR COALESCE(line.rejected_quantity, 0) < 0
          OR COALESCE(line.rejected_quantity, 0) > line.received_quantity
          OR COALESCE(line.unit_cost, 0) < 0
          OR (
            COALESCE(line.unit_cost, item.unit_cost, 0) > 0
            AND COALESCE(line.unit_cost_unit_id, item.unit_cost_unit_id) IS NULL
          )
          OR (
            COALESCE(line.rejected_quantity, 0) > 0
            AND (
              length(btrim(COALESCE(line.rejection_reason, ''))) = 0
              OR length(btrim(COALESCE(line.rejected_photo_url, ''))) = 0
            )
          )
          OR (
            line.entry_unit_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.ingredient_units AS ingredient_unit
              WHERE ingredient_unit.tenant_id = item.tenant_id
                AND ingredient_unit.ingredient_id = item.ingredient_id
                AND ingredient_unit.unit_id = line.entry_unit_id
                AND ingredient_unit.is_active
            )
          )
          OR (
            COALESCE(line.unit_cost_unit_id, item.unit_cost_unit_id) IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.ingredient_units AS ingredient_unit
              WHERE ingredient_unit.tenant_id = item.tenant_id
                AND ingredient_unit.ingredient_id = item.ingredient_id
                AND ingredient_unit.unit_id = COALESCE(
                  line.unit_cost_unit_id,
                  item.unit_cost_unit_id
                )
                AND ingredient_unit.is_active
            )
          )
     ) THEN
    RAISE EXCEPTION 'grn_lines_invalid' USING ERRCODE = '23514';
  END IF;

  UPDATE public.grn_items AS item
  SET received_quantity = line.received_quantity::numeric(15,3),
      rejected_quantity = COALESCE(
        line.rejected_quantity,
        0
      )::numeric(15,3),
      rejection_reason = NULLIF(btrim(line.rejection_reason), ''),
      rejected_photo_url = NULLIF(btrim(line.rejected_photo_url), ''),
      entry_unit_id = COALESCE(line.entry_unit_id, item.entry_unit_id),
      unit_cost = COALESCE(line.unit_cost, item.unit_cost)::numeric(15,2),
      unit_cost_unit_id = COALESCE(
        line.unit_cost_unit_id,
        item.unit_cost_unit_id
      )
  FROM jsonb_to_recordset(p_lines)
    AS line(
      line_id bigint,
      received_quantity numeric,
      rejected_quantity numeric,
      rejection_reason text,
      rejected_photo_url text,
      entry_unit_id bigint,
      unit_cost numeric,
      unit_cost_unit_id bigint
    )
  WHERE item.id = line.line_id
    AND item.grn_id = p_grn_id
    AND item.tenant_id = v_tenant;

  UPDATE public.goods_received_notes
  SET received_date = COALESCE(p_received_date, received_date),
      notes = CASE
        WHEN p_notes IS NULL THEN notes
        ELSE NULLIF(btrim(p_notes), '')
      END,
      updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'inventory.grn.saved',
    'goods_received_note',
    p_grn_id,
    to_jsonb(v_grn),
    jsonb_build_object(
      'status', 'draft',
      'line_count', v_input_count,
      'received_date', p_received_date
    )
  );

  RETURN jsonb_build_object(
    'id', p_grn_id,
    'status', 'draft',
    'updated_lines', v_input_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.save_goods_receipt_note(
  bigint,
  timestamp with time zone,
  text,
  jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_goods_receipt_note(
  bigint,
  timestamp with time zone,
  text,
  jsonb
) TO authenticated, service_role;

DO $patch_confirm$
DECLARE
  v_def text;
  v_updated text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'confirm_goods_receipt_note'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_grn_id bigint';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'confirm_goods_receipt_note missing';
  END IF;

  v_def := replace(replace(v_def, E'\r\n', E'\n'), E'\r', E'\n');
  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  v_updated := replace(
    v_def,
    $old$  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft'
      USING ERRCODE = '23514';
  END IF;

  SELECT po.*$old$,
    $new$  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity > 0
      AND item.unit_cost <= 0
  ) THEN
    RAISE EXCEPTION 'grn_unit_price_required'
      USING ERRCODE = '23514';
  END IF;

  SELECT po.*$new$
  );

  v_updated := regexp_replace(
    v_updated,
    'v_applied_money := CASE\s+WHEN v_item\.cost_pending\s+THEN pg_catalog\.round\(\s+v_applied_base \* coalesce\(v_old_wac, 0\),\s+2\s+\)\s+ELSE pg_catalog\.round\(\s+v_applied_base \* \(v_item\.unit_cost / v_po_factor\),\s+2\s+\)\s+END;',
    $money$v_applied_money := private.grn_line_book_total(
      v_tenant,
      v_item.ingredient_id,
      v_accepted,
      v_item.entry_unit_id,
      v_item.unit_cost,
      v_item.unit_cost_unit_id
    );$money$
  );

  IF v_updated = v_def THEN
    RAISE EXCEPTION 'confirm_goods_receipt_note unit-price patch failed';
  END IF;
  IF v_updated ~ 'WHEN v_item\.cost_pending'
     OR v_updated !~ 'private\.grn_line_book_total'
  THEN
    RAISE EXCEPTION 'confirm_goods_receipt_note money formula patch failed';
  END IF;

  EXECUTE v_updated;
END;
$patch_confirm$;

DO $strip_po_est$
DECLARE
  v_row record;
  v_def text;
  v_updated text;
BEGIN
  FOR v_row IN
    SELECT
      p.oid,
      n.nspname,
      p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n
      ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prokind = 'f'
      AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%unit_price_est%'
  LOOP
    v_def := pg_catalog.pg_get_functiondef(v_row.oid);
    v_def := replace(replace(v_def, E'\r\n', E'\n'), E'\r', E'\n');
    v_def := regexp_replace(
      v_def,
      '^CREATE (OR REPLACE )?FUNCTION',
      'CREATE OR REPLACE FUNCTION'
    );
    v_updated := replace(
      v_def,
      'po_item.unit_price_est',
      '0::numeric(15,2)'
    );
    v_updated := replace(
      v_updated,
      'item.unit_price_est',
      '0::numeric(15,2)'
    );
    v_updated := replace(
      v_updated,
      'poi.unit_price_est',
      '0::numeric(15,2)'
    );
    v_updated := replace(
      v_updated,
      E'      entry_unit_id,\n      unit_price_est,\n      line_total\n    )',
      E'      entry_unit_id\n    )'
    );
    v_updated := replace(
      v_updated,
      E'      demand_item.entry_unit_id,\n      NULL,\n      NULL\n    FROM public.purchase_request_allocations',
      E'      demand_item.entry_unit_id\n    FROM public.purchase_request_allocations'
    );
    v_updated := regexp_replace(
      v_updated,
      'unit_price_est\s*=\s*line\.unit_price::numeric\(15,2\),',
      ''
    );
    v_updated := regexp_replace(
      v_updated,
      'line_total\s*=\s*round\(line\.quantity \* line\.unit_price, 2\)',
      'quantity = line.quantity::numeric(15,3)'
    );
    IF v_updated LIKE '%unit_price_est%' THEN
      RAISE EXCEPTION
        'could not strip unit_price_est from %.%(%)',
        v_row.nspname,
        v_row.proname,
        v_row.args;
    END IF;
    EXECUTE v_updated;
  END LOOP;
END;
$strip_po_est$;

ALTER TABLE public.purchase_order_items
  DROP COLUMN IF EXISTS unit_price_est,
  DROP COLUMN IF EXISTS line_total;

DO $assert_no_est$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT
      n.nspname,
      p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n
      ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prokind = 'f'
      AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%unit_price_est%'
  LOOP
    RAISE EXCEPTION
      'unit_price_est still referenced by %.%(%)',
      v_row.nspname,
      v_row.proname,
      v_row.args;
  END LOOP;
END;
$assert_no_est$;
