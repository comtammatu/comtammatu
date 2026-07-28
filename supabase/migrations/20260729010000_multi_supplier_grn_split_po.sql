-- Multi-supplier GRN: line-level supplier_id, nullable header supplier,
-- purchase_orders.source_grn_id, split PO RPC, confirm/approve gates.
-- Do not apply to production without Environment Registry check + owner delegation.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.grn_items
  ADD COLUMN IF NOT EXISTS supplier_id bigint;

UPDATE public.grn_items gi
SET supplier_id = g.supplier_id
FROM public.goods_received_notes g
WHERE gi.grn_id = g.id
  AND gi.tenant_id = g.tenant_id
  AND gi.supplier_id IS NULL
  AND g.supplier_id IS NOT NULL;

-- Lines without a resolvable header supplier cannot remain; fail closed if any.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.grn_items WHERE supplier_id IS NULL
  ) THEN
    RAISE EXCEPTION 'multi_supplier_grn_backfill_incomplete: grn_items.supplier_id still null';
  END IF;
END $$;

ALTER TABLE public.grn_items
  ALTER COLUMN supplier_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grn_items_supplier_id_fkey'
  ) THEN
    ALTER TABLE public.grn_items
      ADD CONSTRAINT grn_items_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS grn_items_supplier_id_idx
  ON public.grn_items (supplier_id);

COMMENT ON COLUMN public.grn_items.supplier_id IS
  'Supplier for this receipt line. Multi-supplier GRNs carry distinct suppliers per line; POs split by this column.';

ALTER TABLE public.goods_received_notes
  ALTER COLUMN supplier_id DROP NOT NULL;

COMMENT ON COLUMN public.goods_received_notes.supplier_id IS
  'Optional header supplier. NULL for multi-supplier drafts; UI derives suppliers from grn_items. Legacy single-supplier rows may retain a value.';

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS source_grn_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'purchase_orders_source_grn_id_fkey'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_source_grn_id_fkey
      FOREIGN KEY (source_grn_id) REFERENCES public.goods_received_notes(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS purchase_orders_source_grn_id_idx
  ON public.purchase_orders (source_grn_id)
  WHERE source_grn_id IS NOT NULL;

-- Backfill source_grn_id from legacy GRN.po_id one-to-one links.
UPDATE public.purchase_orders po
SET source_grn_id = g.id
FROM public.goods_received_notes g
WHERE g.po_id = po.id
  AND g.tenant_id = po.tenant_id
  AND po.source_grn_id IS NULL;

COMMENT ON COLUMN public.purchase_orders.source_grn_id IS
  'GRN draft that spawned this PO. One GRN may source many POs (one per supplier).';

DROP INDEX IF EXISTS public.uq_grn_active_free_draft_per_user_supplier_branch;

CREATE UNIQUE INDEX uq_grn_active_free_draft_per_user_branch
  ON public.goods_received_notes (tenant_id, created_by, branch_id)
  WHERE status = 'draft'
    AND created_by IS NOT NULL
    AND po_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Supplier-item mapping trigger: prefer line supplier_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_supplier_item_line_mapping()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_supplier_id bigint;
BEGIN
  IF TG_TABLE_NAME = 'purchase_order_items' THEN
    SELECT po.supplier_id
      INTO v_supplier_id
      FROM public.purchase_orders po
     WHERE po.id = NEW.po_id
       AND po.tenant_id = NEW.tenant_id;
  ELSIF TG_TABLE_NAME = 'grn_items' THEN
    -- Legacy PO→GRN inserts omit line supplier; fill from header when present.
    IF NEW.supplier_id IS NULL THEN
      SELECT grn.supplier_id
        INTO NEW.supplier_id
        FROM public.goods_received_notes grn
       WHERE grn.id = NEW.grn_id
         AND grn.tenant_id = NEW.tenant_id;
    END IF;
    v_supplier_id := NEW.supplier_id;
  ELSE
    RAISE EXCEPTION 'unsupported_supplier_item_line_table'
      USING ERRCODE = '22023';
  END IF;

  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'supplier_item_parent_not_found'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
       SELECT 1
         FROM public.supplier_items si
        WHERE si.tenant_id = NEW.tenant_id
          AND si.supplier_id = v_supplier_id
          AND si.ingredient_id = NEW.ingredient_id
          AND si.is_active
     ) THEN
    RAISE EXCEPTION 'supplier_item_mapping_required'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grn_items_supplier_mapping ON public.grn_items;
CREATE TRIGGER grn_items_supplier_mapping
BEFORE INSERT OR UPDATE OF tenant_id, grn_id, ingredient_id, supplier_id
ON public.grn_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_supplier_item_line_mapping();

CREATE OR REPLACE FUNCTION public.enforce_supplier_items_on_document_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'purchase_orders'
     AND NEW.status = 'sent'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1
         FROM public.purchase_order_items poi
        WHERE poi.po_id = NEW.id
          AND poi.tenant_id = NEW.tenant_id
          AND NOT EXISTS (
            SELECT 1
              FROM public.supplier_items si
             WHERE si.tenant_id = NEW.tenant_id
               AND si.supplier_id = NEW.supplier_id
               AND si.ingredient_id = poi.ingredient_id
               AND si.is_active
          )
     ) THEN
    RAISE EXCEPTION 'supplier_item_mapping_required'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'goods_received_notes'
     AND NEW.status = 'confirmed'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1
         FROM public.grn_items gi
        WHERE gi.grn_id = NEW.id
          AND gi.tenant_id = NEW.tenant_id
          AND NOT EXISTS (
            SELECT 1
              FROM public.supplier_items si
             WHERE si.tenant_id = NEW.tenant_id
               AND si.supplier_id = gi.supplier_id
               AND si.ingredient_id = gi.ingredient_id
               AND si.is_active
          )
     ) THEN
    RAISE EXCEPTION 'supplier_item_mapping_required'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Split PO from multi-supplier GRN
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_purchase_orders_from_grn(p_grn_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_grn record;
  v_supplier_id bigint;
  v_po_id bigint;
  v_display text;
  v_line_count integer;
  v_total_lines integer := 0;
  v_po_count integer := 0;
  v_first_po_id bigint := NULL;
  v_by_supplier jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission_any('procurement:po_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT g.*
  INTO v_grn
  FROM public.goods_received_notes g
  WHERE g.id = p_grn_id
    AND g.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '22023';
  END IF;

  IF v_grn.po_id IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM public.purchase_orders po
       WHERE po.source_grn_id = p_grn_id
         AND po.tenant_id = v_tenant
     ) THEN
    RAISE EXCEPTION 'grn_already_linked_to_po' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id
      AND gi.tenant_id = v_tenant
      AND gi.quality_status <> 'rejected'
      AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0
      AND gi.supplier_id IS NULL
  ) THEN
    RAISE EXCEPTION 'grn_line_supplier_required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id
      AND gi.tenant_id = v_tenant
      AND gi.quality_status <> 'rejected'
      AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0
  ) THEN
    RAISE EXCEPTION 'grn_has_no_receivable_lines' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = v_grn.branch_id
      AND b.tenant_id = v_tenant
      AND b.is_active = true
      AND b.branch_kind IN ('branch', 'central_supply', 'central_kitchen')
  ) THEN
    RAISE EXCEPTION 'invalid_branch' USING ERRCODE = 'P0002';
  END IF;

  FOR v_supplier_id IN
    SELECT DISTINCT gi.supplier_id
    FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id
      AND gi.tenant_id = v_tenant
      AND gi.quality_status <> 'rejected'
      AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0
    ORDER BY gi.supplier_id
  LOOP
    v_display := public.next_po_display_id(v_tenant);

    INSERT INTO public.purchase_orders (
      tenant_id, branch_id, supplier_id, po_number, display_id, status,
      notes, created_by, source_grn_id
    ) VALUES (
      v_tenant, v_grn.branch_id, v_supplier_id, v_display, v_display, 'draft',
      NULLIF(btrim(v_grn.notes), ''), v_uid, p_grn_id
    ) RETURNING id INTO v_po_id;

    IF v_first_po_id IS NULL THEN
      v_first_po_id := v_po_id;
    END IF;

    INSERT INTO public.purchase_order_items (
      tenant_id, po_id, ingredient_id, quantity, entry_unit_id, unit_price_est, line_total
    )
    SELECT
      v_tenant,
      v_po_id,
      gi.ingredient_id,
      (gi.received_quantity - COALESCE(gi.rejected_quantity, 0))::numeric(15,3),
      gi.entry_unit_id,
      CASE
        WHEN gi.unit_cost IS NOT NULL AND gi.unit_cost > 0 THEN gi.unit_cost
        ELSE NULL
      END,
      CASE
        WHEN gi.unit_cost IS NOT NULL AND gi.unit_cost > 0 THEN
          ROUND(
            (gi.received_quantity - COALESCE(gi.rejected_quantity, 0)) * gi.unit_cost,
            2
          )
        ELSE NULL
      END
    FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id
      AND gi.tenant_id = v_tenant
      AND gi.supplier_id = v_supplier_id
      AND gi.quality_status <> 'rejected'
      AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0;

    GET DIAGNOSTICS v_line_count = ROW_COUNT;
    v_total_lines := v_total_lines + v_line_count;
    v_po_count := v_po_count + 1;

    UPDATE public.grn_items gi
    SET po_quantity = gi.received_quantity - COALESCE(gi.rejected_quantity, 0)
    WHERE gi.grn_id = p_grn_id
      AND gi.tenant_id = v_tenant
      AND gi.supplier_id = v_supplier_id
      AND gi.quality_status <> 'rejected'
      AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0;

    v_by_supplier := v_by_supplier || jsonb_build_array(
      jsonb_build_object(
        'supplier_id', v_supplier_id,
        'po_id', v_po_id,
        'display_id', v_display,
        'line_count', v_line_count
      )
    );

    PERFORM public.log_audit(
      'inventory.po.created_from_grn_draft',
      'purchase_order',
      v_po_id,
      NULL,
      jsonb_build_object(
        'grn_id', p_grn_id,
        'supplier_id', v_supplier_id,
        'lines', v_line_count,
        'branch_id', v_grn.branch_id
      )
    );
  END LOOP;

  -- Legacy single pointer: first PO. Confirm gate reads source_grn_id set.
  UPDATE public.goods_received_notes
  SET po_id = v_first_po_id, updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'po_id', v_first_po_id,
    'po_ids', (
      SELECT COALESCE(jsonb_agg(po.id ORDER BY po.id), '[]'::jsonb)
      FROM public.purchase_orders po
      WHERE po.source_grn_id = p_grn_id
        AND po.tenant_id = v_tenant
    ),
    'po_count', v_po_count,
    'line_count', v_total_lines,
    'by_supplier', v_by_supplier,
    'status', 'draft'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_orders_from_grn(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_purchase_orders_from_grn(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_orders_from_grn(bigint) TO service_role;

COMMENT ON FUNCTION public.create_purchase_orders_from_grn(bigint) IS
  'Create one draft PO per distinct grn_items.supplier_id from a multi-supplier GRN draft. Sets purchase_orders.source_grn_id and legacy goods_received_notes.po_id to the first PO.';

-- Keep old name as thin wrapper for callers that still pass a single-PO shape.
CREATE OR REPLACE FUNCTION public.create_purchase_order_from_grn(p_grn_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.create_purchase_orders_from_grn(p_grn_id);
  RETURN jsonb_build_object(
    'po_id', v_result->>'po_id',
    'display_id', (
      SELECT po.display_id
      FROM public.purchase_orders po
      WHERE po.id = (v_result->>'po_id')::bigint
    ),
    'grn_id', p_grn_id,
    'line_count', (v_result->>'line_count')::integer,
    'po_count', (v_result->>'po_count')::integer,
    'po_ids', v_result->'po_ids',
    'by_supplier', v_result->'by_supplier',
    'status', 'draft'
  );
END;
$$;

COMMENT ON FUNCTION public.create_purchase_order_from_grn(bigint) IS
  'Compatibility wrapper around create_purchase_orders_from_grn (multi-supplier split).';

-- ---------------------------------------------------------------------------
-- 4. Approve: sync prices for GRNs linked via source_grn_id or legacy po_id,
--    matching line supplier_id to PO.supplier_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_purchase_order(p_po_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_po record;
  v_synced_lines integer := 0;
  v_missing_price integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'approve_purchase_order: anonymous caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'approve_purchase_order: missing tenant_id claim'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_po_id IS NULL OR p_po_id <= 0 THEN
    RAISE EXCEPTION 'approve_purchase_order: invalid PO id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT id, branch_id, po_number, status, supplier_id, source_grn_id
    INTO v_po
    FROM public.purchase_orders
   WHERE id = p_po_id
     AND tenant_id = v_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_purchase_order: PO not found in tenant scope'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.has_permission(v_po.branch_id, 'procurement:po_approve') THEN
    RAISE EXCEPTION 'approve_purchase_order: forbidden'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.status <> 'draft' THEN
    RAISE EXCEPTION 'approve_purchase_order: invalid status transition'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.purchase_order_items
     WHERE tenant_id = v_tenant_id
       AND po_id = v_po.id
  ) THEN
    RAISE EXCEPTION 'approve_purchase_order: PO has no lines'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*)::integer
    INTO v_missing_price
    FROM public.purchase_order_items poi
   WHERE poi.tenant_id = v_tenant_id
     AND poi.po_id = v_po.id
     AND poi.quantity > 0
     AND (poi.unit_price_est IS NULL OR poi.unit_price_est <= 0);

  IF v_missing_price > 0 THEN
    RAISE EXCEPTION 'approve_purchase_order: unit_price_est required on all lines'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.purchase_orders
     SET status = 'sent',
         updated_at = now()
   WHERE id = v_po.id
     AND tenant_id = v_tenant_id;

  WITH linked_grn AS (
    SELECT g.id AS grn_id
      FROM public.goods_received_notes g
     WHERE g.tenant_id = v_tenant_id
       AND g.status = 'draft'
       AND (
         g.po_id = v_po.id
         OR (v_po.source_grn_id IS NOT NULL AND g.id = v_po.source_grn_id)
       )
  ),
  synced AS (
    UPDATE public.grn_items gi
       SET unit_cost = poi.unit_price_est,
           po_unit_price = poi.unit_price_est,
           total_cost = ROUND(
             (gi.received_quantity - COALESCE(gi.rejected_quantity, 0))
             * poi.unit_price_est,
             2
           )
      FROM linked_grn lg, public.purchase_order_items poi
     WHERE gi.tenant_id = v_tenant_id
       AND gi.grn_id = lg.grn_id
       AND gi.supplier_id = v_po.supplier_id
       AND poi.tenant_id = v_tenant_id
       AND poi.po_id = v_po.id
       AND poi.ingredient_id = gi.ingredient_id
       AND gi.quality_status <> 'rejected'
       AND (gi.received_quantity - COALESCE(gi.rejected_quantity, 0)) > 0
    RETURNING gi.id
  )
  SELECT COUNT(*)::integer INTO v_synced_lines FROM synced;

  PERFORM public.log_audit(
    'inventory.po.approved',
    'purchase_order',
    v_po.id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object(
      'status', 'sent',
      'branch_id', v_po.branch_id,
      'po_number', v_po.po_number,
      'grn_unit_cost_synced_lines', v_synced_lines
    )
  );

  RETURN jsonb_build_object(
    'id', v_po.id,
    'status', 'sent',
    'grn_unit_cost_synced_lines', v_synced_lines
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_purchase_order(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_order(bigint)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_purchase_order(bigint) IS
  'Approve PO draft→sent. Syncs unit_price_est into draft GRN lines matching PO supplier (source_grn_id or legacy po_id).';

-- ---------------------------------------------------------------------------
-- 5. Confirm: require every source PO approved; update each PO fulfillment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(p_grn_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid             uuid   := auth.uid();
  v_tenant          bigint := public.auth_tenant_id();
  v_grn             record;
  v_item            record;
  v_branch          record;
  v_old_q           numeric(15,3);
  v_old_wac         numeric(15,2);
  v_recv            numeric(15,3);
  v_recv_base       numeric(15,3);
  v_cost            numeric(15,2);
  v_money           numeric(15,2);
  v_cost_base       numeric(15,2);
  v_new_q           numeric(15,3);
  v_new_wac         numeric(15,2);
  v_location_id     bigint;
  v_all_fulfilled   boolean;
  v_po_status       text;
  v_review_pct      numeric(5,2);
  v_review_count    int := 0;
  v_po_id           bigint;
  v_po_ids          bigint[];
  v_unapproved      integer;
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

  IF v_grn.location_id IS NOT NULL THEN
    SELECT il.id INTO v_location_id
    FROM public.inventory_locations il
    WHERE il.id = v_grn.location_id
      AND il.branch_id = v_grn.branch_id
      AND il.tenant_id = v_tenant
      AND il.is_active = TRUE
    LIMIT 1;

    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'grn_receive_location_invalid' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT il.id INTO v_location_id
    FROM public.inventory_locations il
    WHERE il.branch_id = v_grn.branch_id
      AND il.tenant_id = v_tenant
      AND il.is_default_receive = TRUE
      AND il.is_active = TRUE
    ORDER BY il.sort_order NULLS LAST, il.id
    LIMIT 1;
  END IF;

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

    v_recv_base := public.inv_to_base(v_item.ingredient_id, v_item.entry_unit_id, v_recv);
    v_cost      := v_item.unit_cost;
    v_money     := ROUND(v_recv * v_cost, 2);
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

  SELECT COALESCE(array_agg(po.id ORDER BY po.id), ARRAY[]::bigint[])
  INTO v_po_ids
  FROM public.purchase_orders po
  WHERE po.tenant_id = v_tenant
    AND (
      po.source_grn_id = p_grn_id
      OR (v_grn.po_id IS NOT NULL AND po.id = v_grn.po_id)
    );

  IF cardinality(v_po_ids) = 0 THEN
    RAISE EXCEPTION 'grn_confirm_requires_approved_po' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_unapproved
  FROM public.purchase_orders po
  WHERE po.id = ANY (v_po_ids)
    AND po.tenant_id = v_tenant
    AND po.status NOT IN ('sent', 'partially_received');

  IF v_unapproved > 0 THEN
    RAISE EXCEPTION 'grn_confirm_requires_approved_po' USING ERRCODE = '22023';
  END IF;

  v_po_id := v_po_ids[1];

  UPDATE public.goods_received_notes
  SET status = 'confirmed', po_id = v_po_id, location_id = v_location_id, updated_at = now()
  WHERE id = p_grn_id;

  FOREACH v_po_id IN ARRAY v_po_ids
  LOOP
    PERFORM 1
    FROM public.purchase_orders
    WHERE id = v_po_id AND tenant_id = v_tenant
    FOR UPDATE;

    WITH ordered AS (
      SELECT poi.ingredient_id,
             SUM(public.inv_to_base(poi.ingredient_id, poi.entry_unit_id, poi.quantity))::numeric(15,3) AS qty
      FROM public.purchase_order_items poi
      WHERE poi.po_id = v_po_id
        AND poi.tenant_id = v_tenant
      GROUP BY poi.ingredient_id
    ),
    received AS (
      SELECT gi.ingredient_id,
             SUM(public.inv_to_base(gi.ingredient_id, gi.entry_unit_id,
                   gi.received_quantity - COALESCE(gi.rejected_quantity, 0)))::numeric(15,3) AS qty
      FROM public.grn_items gi
      JOIN public.goods_received_notes g
        ON g.id = gi.grn_id AND g.status = 'confirmed'
      JOIN public.purchase_orders po
        ON po.id = v_po_id
       AND po.tenant_id = v_tenant
      WHERE (
          g.po_id = v_po_id
          OR po.source_grn_id = g.id
        )
        AND gi.tenant_id = v_tenant
        AND gi.supplier_id = po.supplier_id
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
            WHERE (
                g2.po_id = v_po_id
                OR EXISTS (
                  SELECT 1 FROM public.purchase_orders px
                  WHERE px.id = v_po_id AND px.source_grn_id = g2.id
                )
              )
              AND g2.tenant_id = v_tenant
              AND gi2.short_delivery_action = 'accept_and_close'
          ) THEN 'received'
          ELSE 'partially_received'
        END,
        updated_at = now()
    WHERE po.id = v_po_id
      AND po.tenant_id = v_tenant
      AND po.status IN ('sent', 'partially_received')
    RETURNING po.status INTO v_po_status;
  END LOOP;

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'status', 'confirmed',
    'po_id', v_po_ids[1],
    'po_ids', to_jsonb(v_po_ids),
    'po_status', v_po_status,
    'review_count', v_review_count
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_goods_receipt_note(bigint) IS
  'Atomic confirm GRN. Fail-closed unless every PO linked via source_grn_id (or legacy po_id) is sent/partially_received.';

-- ---------------------------------------------------------------------------
-- 6. Legacy PO→GRN paths: set grn_items.supplier_id from PO
-- ---------------------------------------------------------------------------

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

  UPDATE public.purchase_orders
  SET source_grn_id = COALESCE(source_grn_id, v_grn_id)
  WHERE id = v_po.id
    AND tenant_id = v_tenant_id;

  INSERT INTO public.grn_items (
    tenant_id, grn_id, ingredient_id, supplier_id,
    po_quantity, po_unit_price,
    received_quantity, entry_unit_id, unit_cost, total_cost,
    quality_status
  )
  SELECT v_tenant_id,
         v_grn_id,
         r.ingredient_id,
         v_supplier.id,
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
      'po_id', v_po.id,
      'branch_id', v_branch.id,
      'lines', v_count
    )
  );

  RETURN jsonb_build_object(
    'grn_id', v_grn_id,
    'grn_number', v_grn_number,
    'lines', v_count
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. recreate_grn_at_receiving_site: copy line supplier_id + source_grn_id
-- ---------------------------------------------------------------------------

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
    tenant_id, grn_id, ingredient_id, supplier_id, po_quantity, received_quantity,
    entry_unit_id, unit_cost, total_cost, quality_status, rejected_quantity,
    rejection_reason, expiry_date, batch_number, receiving_temperature,
    po_unit_price, price_override_note, price_override_photo_url,
    rejected_photo_url, requires_review, short_delivery_action
  )
  SELECT
    tenant_id, v_new_grn_id, ingredient_id, supplier_id, po_quantity, received_quantity,
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
      tenant_id, branch_id, supplier_id, po_number, display_id, status, notes, created_by, source_grn_id
    ) VALUES (
      v_tenant, p_target_branch_id, COALESCE(v_old_grn.supplier_id, (
        SELECT gi.supplier_id FROM public.grn_items gi
        WHERE gi.grn_id = v_new_grn_id AND gi.tenant_id = v_tenant
        ORDER BY gi.id LIMIT 1
      )), v_new_po_display,
      v_new_po_display, 'received', NULLIF(btrim(v_old_grn.notes), ''), v_uid, v_new_grn_id
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


-- ---------------------------------------------------------------------------
-- 8. create_grn_from_approved_po: set line supplier_id + source_grn_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_grn_from_approved_po(p_po_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_po record;
  v_grn_id bigint;
  v_grn_number text;
  v_location_id bigint;
  v_line_count integer := 0;
  v_existing_draft_count integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_po_id IS NULL OR p_po_id <= 0 THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: invalid PO id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT purchase_order.*
  INTO v_po
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = p_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: PO not found'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_po.status NOT IN ('sent', 'partially_received') THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: PO status not eligible'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*)::integer, min(grn.id)
  INTO v_existing_draft_count, v_grn_id
  FROM public.goods_received_notes AS grn
  WHERE grn.tenant_id = v_po.tenant_id
    AND grn.po_id = v_po.id
    AND grn.status = 'draft';

  IF v_existing_draft_count > 1 THEN
    RAISE EXCEPTION
      'create_grn_from_approved_po: multiple linked drafts'
      USING ERRCODE = 'unique_violation';
  END IF;

  IF v_existing_draft_count = 1 THEN
    SELECT grn.grn_number
    INTO v_grn_number
    FROM public.goods_received_notes AS grn
    WHERE grn.id = v_grn_id
      AND grn.tenant_id = v_po.tenant_id;

    SELECT count(*)::integer
    INTO v_line_count
    FROM public.grn_items AS item
    WHERE item.tenant_id = v_po.tenant_id
      AND item.grn_id = v_grn_id;

    RETURN jsonb_build_object(
      'grn_id', v_grn_id,
      'grn_number', v_grn_number,
      'lines', v_line_count,
      'reused', TRUE
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.id = v_po.branch_id
      AND branch.tenant_id = v_po.tenant_id
      AND branch.is_active IS TRUE
      AND branch.branch_kind IN (
        'branch',
        'central_supply',
        'central_kitchen'
      )
  ) THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: branch invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.suppliers AS supplier
    WHERE supplier.id = v_po.supplier_id
      AND supplier.tenant_id = v_po.tenant_id
      AND supplier.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: supplier invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_order_items AS item
    WHERE item.tenant_id = v_po.tenant_id
      AND item.po_id = v_po.id
  ) THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: PO has no lines'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.purchase_order_items AS item
    WHERE item.tenant_id = v_po.tenant_id
      AND item.po_id = v_po.id
      AND (
        item.quantity <= 0
        OR item.unit_price_est IS NULL
        OR item.unit_price_est <= 0
      )
  ) THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: invalid approved price'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_po.tenant_id
    AND location.branch_id = v_po.branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
    AND location.is_default_receive IS TRUE;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: warehouse missing'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    WITH received AS (
      SELECT
        item.ingredient_id,
        sum(public.inv_to_base_for_tenant(
          v_po.tenant_id,
          item.ingredient_id,
          item.entry_unit_id,
          item.received_quantity - item.rejected_quantity
        )) AS base_quantity
      FROM public.grn_items AS item
      JOIN public.goods_received_notes AS grn
        ON grn.id = item.grn_id
       AND grn.tenant_id = item.tenant_id
      WHERE grn.po_id = v_po.id
        AND grn.tenant_id = v_po.tenant_id
        AND grn.status = 'confirmed'
      GROUP BY item.ingredient_id
    )
    SELECT 1
    FROM public.purchase_order_items AS po_item
    LEFT JOIN received USING (ingredient_id)
    WHERE po_item.tenant_id = v_po.tenant_id
      AND po_item.po_id = v_po.id
      AND public.inv_to_base_for_tenant(
        v_po.tenant_id,
        po_item.ingredient_id,
        po_item.entry_unit_id,
        po_item.quantity
      ) > coalesce(received.base_quantity, 0)
  ) THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: PO fully received'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_grn_number := public.next_inventory_doc_number(
    v_po.tenant_id,
    'grn'
  );

  PERFORM pg_catalog.set_config(
    'comtammatu.grn_recovery_insert',
    'true',
    TRUE
  );

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    location_id,
    supplier_id,
    po_id,
    grn_number,
    status,
    created_by
  )
  VALUES (
    v_po.tenant_id,
    v_po.branch_id,
    v_location_id,
    v_po.supplier_id,
    v_po.id,
    v_grn_number,
    'draft',
    v_po.created_by
  )
  RETURNING id INTO v_grn_id;

  UPDATE public.purchase_orders
  SET source_grn_id = COALESCE(source_grn_id, v_grn_id)
  WHERE id = v_po.id
    AND tenant_id = v_po.tenant_id;

  WITH received AS (
    SELECT
      item.ingredient_id,
      sum(public.inv_to_base_for_tenant(
        v_po.tenant_id,
        item.ingredient_id,
        item.entry_unit_id,
        item.received_quantity - item.rejected_quantity
      )) AS base_quantity
    FROM public.grn_items AS item
    JOIN public.goods_received_notes AS grn
      ON grn.id = item.grn_id
     AND grn.tenant_id = item.tenant_id
    WHERE grn.po_id = v_po.id
      AND grn.tenant_id = v_po.tenant_id
      AND grn.status = 'confirmed'
    GROUP BY item.ingredient_id
  ),
  remaining AS (
    SELECT
      po_item.ingredient_id,
      po_item.entry_unit_id,
      po_item.unit_price_est,
      round(
        (
          public.inv_to_base_for_tenant(
            v_po.tenant_id,
            po_item.ingredient_id,
            po_item.entry_unit_id,
            po_item.quantity
          ) - coalesce(received.base_quantity, 0)
        ) / public.inv_to_base_for_tenant(
          v_po.tenant_id,
          po_item.ingredient_id,
          po_item.entry_unit_id,
          1
        ),
        3
      )::numeric(15,3) AS quantity
    FROM public.purchase_order_items AS po_item
    LEFT JOIN received USING (ingredient_id)
    WHERE po_item.tenant_id = v_po.tenant_id
      AND po_item.po_id = v_po.id
  )
  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    supplier_id,
    received_quantity,
    rejected_quantity,
    rejection_reason,
    rejected_photo_url,
    entry_unit_id,
    unit_cost,
    total_cost
  )
  SELECT
    v_po.tenant_id,
    v_grn_id,
    remaining.ingredient_id,
    v_po.supplier_id,
    remaining.quantity,
    0,
    NULL,
    NULL,
    remaining.entry_unit_id,
    remaining.unit_price_est,
    round(remaining.quantity * remaining.unit_price_est, 2)
  FROM remaining
  WHERE remaining.quantity > 0;

  GET DIAGNOSTICS v_line_count = ROW_COUNT;

  PERFORM pg_catalog.set_config(
    'comtammatu.grn_recovery_insert',
    'false',
    TRUE
  );

  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  )
  VALUES (
    v_po.tenant_id,
    NULL,
    'inventory.grn.recovered_from_approved_po',
    'goods_received_note',
    v_grn_id,
    NULL,
    jsonb_build_object(
      'actor_type', 'service_role',
      'po_id', v_po.id,
      'branch_id', v_po.branch_id,
      'lines', v_line_count
    )
  );

  RETURN jsonb_build_object(
    'grn_id', v_grn_id,
    'grn_number', v_grn_number,
    'lines', v_line_count
  );
END;
$$;


REVOKE ALL ON FUNCTION public.create_grn_from_approved_po(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_grn_from_approved_po(bigint) TO service_role;
