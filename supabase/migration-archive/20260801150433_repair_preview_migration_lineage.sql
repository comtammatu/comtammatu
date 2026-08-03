-- Restore SQL payloads that were recorded as empty by an earlier external apply.
-- Version and name checks make the metadata repair fail closed on ledger drift.

DO $repair$
DECLARE
  migration record;
BEGIN
  FOR migration IN
    SELECT version, name, source_sql
    FROM (VALUES
    ('20260729010000', 'multi_supplier_grn_split_po', $migration_20260729010000$-- Multi-supplier GRN: line-level supplier_id, nullable header supplier,
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
$migration_20260729010000$::text),
    ('20260729120000', 'fix_multi_supplier_grn_post_qc_schema', $migration_20260729120000$-- Fix multi-supplier GRN RPCs for post-QC schema.
-- 20260729010000 incorrectly referenced dropped physical-QC-only columns.
-- Post-QC grn_items columns: id, tenant_id, grn_id, ingredient_id,
-- received_quantity, unit_cost, total_cost, rejected_quantity,
-- rejection_reason, rejected_photo_url, entry_unit_id, supplier_id.
-- Multi-supplier columns that remain valid: grn_items.supplier_id,
-- nullable goods_received_notes.supplier_id, purchase_orders.source_grn_id.
-- Do not apply without Environment Registry check + owner delegation.

-- ---------------------------------------------------------------------------
-- 1. Supplier-item mapping on document status (line supplier_id; receivable)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_supplier_items_on_document_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
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
          AND gi.received_quantity - gi.rejected_quantity > 0
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
-- 2. Split draft POs from multi-supplier GRN (post-QC receivable filter)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_purchase_orders_from_grn(p_grn_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_grn record;
  v_supplier_id bigint;
  v_po_id bigint;
  v_location_id bigint;
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

  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = p_grn_id
    AND grn.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_grn.branch_id, 'procurement:po_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '22023';
  END IF;
  IF v_grn.po_id IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM public.purchase_orders AS po
       WHERE po.source_grn_id = p_grn_id
         AND po.tenant_id = v_tenant
     ) THEN
    RAISE EXCEPTION 'grn_already_linked_to_po' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity > 0
      AND item.supplier_id IS NULL
  ) THEN
    RAISE EXCEPTION 'grn_line_supplier_required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity > 0
  ) THEN
    RAISE EXCEPTION 'grn_has_no_receivable_lines' USING ERRCODE = '22023';
  END IF;

  IF NOT private.grn_physical_qc_is_valid(v_tenant, p_grn_id) THEN
    RAISE EXCEPTION 'grn_physical_qc_incomplete'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.id = v_grn.branch_id
      AND branch.tenant_id = v_tenant
      AND branch.is_active IS TRUE
      AND branch.branch_kind IN (
        'branch',
        'central_supply',
        'central_kitchen'
      )
  ) THEN
    RAISE EXCEPTION 'invalid_branch' USING ERRCODE = 'P0002';
  END IF;

  IF v_grn.location_id IS NULL THEN
    SELECT location.id
    INTO v_location_id
    FROM public.inventory_locations AS location
    WHERE location.tenant_id = v_tenant
      AND location.branch_id = v_grn.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
      AND location.is_default_receive IS TRUE;
  ELSE
    SELECT location.id
    INTO v_location_id
    FROM public.inventory_locations AS location
    WHERE location.id = v_grn.location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_grn.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE;
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'grn_receiving_warehouse_required'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_supplier_id IN
    SELECT DISTINCT item.supplier_id
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity > 0
    ORDER BY item.supplier_id
  LOOP
    v_display := public.next_po_display_id(v_tenant);

    INSERT INTO public.purchase_orders (
      tenant_id,
      branch_id,
      supplier_id,
      po_number,
      display_id,
      status,
      notes,
      created_by,
      source_grn_id
    )
    VALUES (
      v_tenant,
      v_grn.branch_id,
      v_supplier_id,
      v_display,
      v_display,
      'draft',
      NULLIF(btrim(v_grn.notes), ''),
      v_uid,
      p_grn_id
    )
    RETURNING id INTO v_po_id;

    IF v_first_po_id IS NULL THEN
      v_first_po_id := v_po_id;
    END IF;

    INSERT INTO public.purchase_order_items (
      tenant_id,
      po_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      unit_price_est,
      line_total
    )
    SELECT
      v_tenant,
      v_po_id,
      item.ingredient_id,
      (
        item.received_quantity - item.rejected_quantity
      )::numeric(15,3),
      item.entry_unit_id,
      NULL::numeric,
      NULL::numeric
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.supplier_id = v_supplier_id
      AND item.received_quantity - item.rejected_quantity > 0;

    GET DIAGNOSTICS v_line_count = ROW_COUNT;
    v_total_lines := v_total_lines + v_line_count;
    v_po_count := v_po_count + 1;

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

  -- Legacy single pointer: first PO. Confirm gate also reads source_grn_id.
  UPDATE public.goods_received_notes
  SET po_id = v_first_po_id,
      location_id = v_location_id,
      updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'po_id', v_first_po_id,
    'po_ids', (
      SELECT COALESCE(jsonb_agg(po.id ORDER BY po.id), '[]'::jsonb)
      FROM public.purchase_orders AS po
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

REVOKE ALL ON FUNCTION public.create_purchase_orders_from_grn(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_orders_from_grn(bigint)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.create_purchase_orders_from_grn(bigint) IS
  'Create one draft PO per distinct grn_items.supplier_id from a multi-supplier GRN draft. Sets purchase_orders.source_grn_id and legacy goods_received_notes.po_id to the first PO.';

-- ---------------------------------------------------------------------------
-- 3. Compatibility wrapper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_purchase_order_from_grn(
  p_grn_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.create_purchase_orders_from_grn(p_grn_id);
  RETURN jsonb_build_object(
    'po_id', (v_result->>'po_id')::bigint,
    'display_id', (
      SELECT po.display_id
      FROM public.purchase_orders AS po
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

REVOKE ALL ON FUNCTION public.create_purchase_order_from_grn(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_from_grn(bigint)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.create_purchase_order_from_grn(bigint) IS
  'Compatibility wrapper around create_purchase_orders_from_grn (multi-supplier split).';

-- ---------------------------------------------------------------------------
-- 4. Approve: sync unit_cost for matching supplier lines only
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

  SELECT
    purchase_order.id,
    purchase_order.branch_id,
    purchase_order.po_number,
    purchase_order.status,
    purchase_order.supplier_id,
    purchase_order.source_grn_id
  INTO v_po
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_purchase_order: PO not found in tenant scope'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.has_permission(
    v_po.branch_id,
    'procurement:po_approve'
  ) THEN
    RAISE EXCEPTION 'approve_purchase_order: forbidden'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.status <> 'draft' THEN
    RAISE EXCEPTION 'approve_purchase_order: invalid status transition'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM grn.id
  FROM public.goods_received_notes AS grn
  WHERE grn.tenant_id = v_tenant_id
    AND grn.status = 'draft'
    AND (
      grn.po_id = v_po.id
      OR (
        v_po.source_grn_id IS NOT NULL
        AND grn.id = v_po.source_grn_id
      )
    )
  FOR UPDATE OF grn;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'approve_purchase_order: linked draft GRN required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*)::integer
  INTO v_missing_price
  FROM public.purchase_order_items AS item
  WHERE item.tenant_id = v_tenant_id
    AND item.po_id = v_po.id
    AND (
      item.quantity <= 0
      OR item.unit_price_est IS NULL
      OR item.unit_price_est <= 0
    );

  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_order_items AS item
    WHERE item.tenant_id = v_tenant_id
      AND item.po_id = v_po.id
  ) THEN
    RAISE EXCEPTION 'approve_purchase_order: PO has no lines'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_missing_price > 0 THEN
    RAISE EXCEPTION 'approve_purchase_order: positive price required'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.purchase_order_items
  SET line_total = round(quantity * unit_price_est, 2)
  WHERE tenant_id = v_tenant_id
    AND po_id = v_po.id;

  WITH linked_grn AS (
    SELECT grn.id AS grn_id
    FROM public.goods_received_notes AS grn
    WHERE grn.tenant_id = v_tenant_id
      AND grn.status = 'draft'
      AND (
        grn.po_id = v_po.id
        OR (
          v_po.source_grn_id IS NOT NULL
          AND grn.id = v_po.source_grn_id
        )
      )
  ),
  synced AS (
    UPDATE public.grn_items AS grn_item
    SET unit_cost = po_item.unit_price_est,
        total_cost = round(
          (
            grn_item.received_quantity
            - grn_item.rejected_quantity
          ) * po_item.unit_price_est,
          2
        )
    FROM linked_grn, public.purchase_order_items AS po_item
    WHERE grn_item.tenant_id = v_tenant_id
      AND grn_item.grn_id = linked_grn.grn_id
      AND grn_item.supplier_id = v_po.supplier_id
      AND po_item.tenant_id = v_tenant_id
      AND po_item.po_id = v_po.id
      AND po_item.ingredient_id = grn_item.ingredient_id
      AND po_item.entry_unit_id IS NOT DISTINCT FROM
        grn_item.entry_unit_id
      AND grn_item.received_quantity - grn_item.rejected_quantity > 0
    RETURNING grn_item.id
  )
  SELECT count(*)::integer
  INTO v_synced_lines
  FROM synced;

  IF EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    JOIN public.grn_items AS grn_item
      ON grn_item.grn_id = grn.id
     AND grn_item.tenant_id = grn.tenant_id
    WHERE grn.tenant_id = v_tenant_id
      AND grn.status = 'draft'
      AND (
        grn.po_id = v_po.id
        OR (
          v_po.source_grn_id IS NOT NULL
          AND grn.id = v_po.source_grn_id
        )
      )
      AND grn_item.supplier_id = v_po.supplier_id
      AND grn_item.received_quantity - grn_item.rejected_quantity > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.purchase_order_items AS po_item
        WHERE po_item.tenant_id = v_tenant_id
          AND po_item.po_id = v_po.id
          AND po_item.ingredient_id = grn_item.ingredient_id
          AND po_item.entry_unit_id IS NOT DISTINCT FROM
            grn_item.entry_unit_id
      )
  ) THEN
    RAISE EXCEPTION 'approve_purchase_order: GRN line missing from PO'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.purchase_orders
  SET status = 'sent',
      updated_at = now()
  WHERE id = v_po.id
    AND tenant_id = v_tenant_id;

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

REVOKE ALL ON FUNCTION public.approve_purchase_order(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_order(bigint)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_purchase_order(bigint) IS
  'Approve PO draft→sent. Syncs unit_price_est into draft GRN lines matching PO supplier (source_grn_id or legacy po_id).';

-- ---------------------------------------------------------------------------
-- 5. Confirm: require every linked PO approved; fulfill per supplier
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(
  p_grn_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_grn record;
  v_item record;
  v_old_q numeric(15,3);
  v_old_wac numeric(15,2);
  v_recv numeric(15,3);
  v_recv_base numeric(15,3);
  v_cost numeric(15,2);
  v_money numeric(15,2);
  v_cost_base numeric(15,2);
  v_new_q numeric(15,3);
  v_new_wac numeric(15,2);
  v_location_id bigint;
  v_all_fulfilled boolean;
  v_po_status text;
  v_po_id bigint;
  v_po_ids bigint[];
  v_unapproved integer;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
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
  IF NOT public.has_permission(
    v_grn.branch_id,
    'procurement:grn_confirm'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.id = v_grn.branch_id
      AND branch.tenant_id = v_tenant
      AND branch.is_active IS TRUE
      AND branch.branch_kind IN (
        'branch',
        'central_supply',
        'central_kitchen'
      )
  ) THEN
    RAISE EXCEPTION 'grn_branch_must_be_operational'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_grn.location_id IS NULL THEN
    SELECT location.id
    INTO v_location_id
    FROM public.inventory_locations AS location
    WHERE location.tenant_id = v_tenant
      AND location.branch_id = v_grn.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
      AND location.is_default_receive IS TRUE
      AND location.is_default_issue IS TRUE
      AND location.is_default_consumption IS TRUE;
  ELSE
    SELECT location.id
    INTO v_location_id
    FROM public.inventory_locations AS location
    WHERE location.id = v_grn.location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_grn.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE;
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'grn_warehouse_location_missing'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT COALESCE(array_agg(po.id ORDER BY po.id), ARRAY[]::bigint[])
  INTO v_po_ids
  FROM public.purchase_orders AS po
  WHERE po.tenant_id = v_tenant
    AND (
      po.source_grn_id = p_grn_id
      OR (v_grn.po_id IS NOT NULL AND po.id = v_grn.po_id)
    );

  IF cardinality(v_po_ids) = 0 THEN
    RAISE EXCEPTION 'grn_confirm_requires_approved_po'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_unapproved
  FROM public.purchase_orders AS po
  WHERE po.id = ANY (v_po_ids)
    AND po.tenant_id = v_tenant
    AND po.status NOT IN ('sent', 'partially_received');

  IF v_unapproved > 0 THEN
    RAISE EXCEPTION 'grn_confirm_requires_approved_po'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM 1
  FROM public.purchase_orders AS po
  WHERE po.id = ANY (v_po_ids)
    AND po.tenant_id = v_tenant
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND (
        item.rejected_quantity < 0
        OR item.rejected_quantity > item.received_quantity
      )
  ) THEN
    RAISE EXCEPTION 'rejected_exceeds_received'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.rejected_quantity > 0
      AND NULLIF(btrim(item.rejection_reason), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'grn_qc_reason_required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.rejected_quantity > 0
      AND NOT private.grn_rejection_photo_exists(
        item.tenant_id,
        item.grn_id,
        item.id,
        item.rejected_photo_url
      )
  ) THEN
    RAISE EXCEPTION 'grn_qc_photo_required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Each receivable line must match a PO item on the PO for that line's supplier.
  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity > 0
      AND (
        item.unit_cost <= 0
        OR NOT EXISTS (
          SELECT 1
          FROM public.purchase_orders AS po
          JOIN public.purchase_order_items AS po_item
            ON po_item.po_id = po.id
           AND po_item.tenant_id = po.tenant_id
          WHERE po.tenant_id = v_tenant
            AND po.id = ANY (v_po_ids)
            AND po.supplier_id = item.supplier_id
            AND po_item.ingredient_id = item.ingredient_id
            AND po_item.entry_unit_id IS NOT DISTINCT FROM
              item.entry_unit_id
            AND po_item.unit_price_est > 0
            AND po_item.unit_price_est = item.unit_cost
        )
      )
  ) THEN
    RAISE EXCEPTION 'grn_approved_po_price_missing_or_stale'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_item IN
    SELECT item.*
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity > 0
    ORDER BY item.id
    FOR UPDATE
  LOOP
    v_recv := v_item.received_quantity - v_item.rejected_quantity;
    v_recv_base := public.inv_to_base(
      v_item.ingredient_id,
      v_item.entry_unit_id,
      v_recv
    );
    v_cost := v_item.unit_cost;
    v_money := round(v_recv * v_cost, 2);
    v_cost_base := CASE
      WHEN v_recv_base <> 0 THEN round(v_money / v_recv_base, 2)
      ELSE v_cost
    END;

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_grn.branch_id
      AND stock.location_id = v_location_id
      AND stock.ingredient_id = v_item.ingredient_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      quantity_change,
      reason,
      created_by,
      grn_id,
      unit_cost,
      location_id,
      entry_unit_id,
      entry_quantity
    )
    VALUES (
      v_tenant,
      v_grn.branch_id,
      v_item.ingredient_id,
      'grn_receipt',
      v_recv_base,
      'GRN ' || v_grn.grn_number,
      v_uid,
      p_grn_id,
      v_cost_base,
      v_location_id,
      v_item.entry_unit_id,
      v_recv
    );

    v_new_q := coalesce(v_old_q, 0) + v_recv_base;
    v_new_wac := CASE
      WHEN v_new_q > 0 THEN (
        coalesce(v_old_q, 0) * coalesce(v_old_wac, 0) + v_money
      ) / v_new_q
      ELSE v_cost_base
    END;

    UPDATE public.stock_levels AS stock
    SET avg_unit_cost = v_new_wac,
        updated_at = now()
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_grn.branch_id
      AND stock.location_id = v_location_id
      AND stock.ingredient_id = v_item.ingredient_id;

    UPDATE public.ingredients AS ingredient
    SET unit_cost = v_cost_base,
        updated_at = now()
    WHERE ingredient.id = v_item.ingredient_id
      AND ingredient.tenant_id = v_tenant;
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'confirmed',
      po_id = COALESCE(v_grn.po_id, v_po_ids[1]),
      location_id = v_location_id,
      updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  FOREACH v_po_id IN ARRAY v_po_ids
  LOOP
    WITH ordered AS (
      SELECT
        po_item.ingredient_id,
        sum(public.inv_to_base(
          po_item.ingredient_id,
          po_item.entry_unit_id,
          po_item.quantity
        ))::numeric(15,3) AS quantity
      FROM public.purchase_order_items AS po_item
      WHERE po_item.po_id = v_po_id
        AND po_item.tenant_id = v_tenant
      GROUP BY po_item.ingredient_id
    ),
    received AS (
      SELECT
        item.ingredient_id,
        sum(public.inv_to_base(
          item.ingredient_id,
          item.entry_unit_id,
          item.received_quantity - item.rejected_quantity
        ))::numeric(15,3) AS quantity
      FROM public.grn_items AS item
      JOIN public.goods_received_notes AS grn
        ON grn.id = item.grn_id
       AND grn.tenant_id = item.tenant_id
      JOIN public.purchase_orders AS po
        ON po.id = v_po_id
       AND po.tenant_id = v_tenant
      WHERE grn.tenant_id = v_tenant
        AND grn.status = 'confirmed'
        AND (
          grn.po_id = v_po_id
          OR po.source_grn_id = grn.id
        )
        AND item.supplier_id = po.supplier_id
      GROUP BY item.ingredient_id
    )
    SELECT bool_and(coalesce(received.quantity, 0) >= ordered.quantity)
    INTO v_all_fulfilled
    FROM ordered
    LEFT JOIN received USING (ingredient_id)
    WHERE ordered.quantity > 0;

    UPDATE public.purchase_orders
    SET status = CASE
          WHEN coalesce(v_all_fulfilled, FALSE) THEN 'received'
          ELSE 'partially_received'
        END,
        updated_at = now()
    WHERE id = v_po_id
      AND tenant_id = v_tenant
      AND status IN ('sent', 'partially_received')
    RETURNING status INTO v_po_status;
  END LOOP;

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'status', 'confirmed',
    'po_id', COALESCE(v_grn.po_id, v_po_ids[1]),
    'po_ids', to_jsonb(v_po_ids),
    'po_status', v_po_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_goods_receipt_note(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt_note(bigint)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.confirm_goods_receipt_note(bigint) IS
  'Atomic confirm GRN. Fail-closed unless every PO linked via source_grn_id (or legacy po_id) is sent/partially_received.';

-- ---------------------------------------------------------------------------
-- 6. Legacy PO→GRN path (post-QC insert columns + line supplier_id)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_grn_from_po(p_po_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_po record;
  v_grn_id bigint;
  v_grn_number text;
  v_location_id bigint;
  v_count integer := 0;
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

  SELECT
    purchase_order.id,
    purchase_order.supplier_id,
    purchase_order.status,
    purchase_order.branch_id,
    purchase_order.tenant_id,
    purchase_order.source_grn_id
  INTO v_po
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = v_tenant_id
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
  IF NOT EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.id = v_po.branch_id
      AND branch.tenant_id = v_tenant_id
      AND branch.is_active IS TRUE
      AND branch.branch_kind IN (
        'branch',
        'central_supply',
        'central_kitchen'
      )
  ) THEN
    RAISE EXCEPTION 'create_grn_from_po: branch inactive or out of scope'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.suppliers AS supplier
    WHERE supplier.id = v_po.supplier_id
      AND supplier.tenant_id = v_tenant_id
      AND supplier.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'create_grn_from_po: supplier inactive or out of scope'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant_id
    AND location.branch_id = v_po.branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
    AND location.is_default_receive IS TRUE;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_po: warehouse missing'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    WITH received AS (
      SELECT
        item.ingredient_id,
        sum(public.inv_to_base(
          item.ingredient_id,
          item.entry_unit_id,
          item.received_quantity - item.rejected_quantity
        )) AS base_quantity
      FROM public.grn_items AS item
      JOIN public.goods_received_notes AS grn
        ON grn.id = item.grn_id
       AND grn.tenant_id = item.tenant_id
      WHERE grn.po_id = v_po.id
        AND grn.tenant_id = v_tenant_id
        AND grn.status = 'confirmed'
      GROUP BY item.ingredient_id
    )
    SELECT 1
    FROM public.purchase_order_items AS po_item
    LEFT JOIN received USING (ingredient_id)
    WHERE po_item.tenant_id = v_tenant_id
      AND po_item.po_id = v_po.id
      AND public.inv_to_base(
        po_item.ingredient_id,
        po_item.entry_unit_id,
        po_item.quantity
      ) > coalesce(received.base_quantity, 0)
  ) THEN
    RAISE EXCEPTION 'create_grn_from_po: PO already fully received'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_grn_number := public.next_inventory_doc_number(v_tenant_id, 'grn');

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
    v_tenant_id,
    v_po.branch_id,
    v_location_id,
    v_po.supplier_id,
    v_po.id,
    v_grn_number,
    'draft',
    v_user_id
  )
  RETURNING id INTO v_grn_id;

  IF v_grn_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_po: header insert blocked (RLS)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.purchase_orders
  SET source_grn_id = COALESCE(source_grn_id, v_grn_id)
  WHERE id = v_po.id
    AND tenant_id = v_tenant_id;

  WITH received AS (
    SELECT
      item.ingredient_id,
      sum(public.inv_to_base(
        item.ingredient_id,
        item.entry_unit_id,
        item.received_quantity - item.rejected_quantity
      )) AS base_quantity
    FROM public.grn_items AS item
    JOIN public.goods_received_notes AS grn
      ON grn.id = item.grn_id
     AND grn.tenant_id = item.tenant_id
    WHERE grn.po_id = v_po.id
      AND grn.tenant_id = v_tenant_id
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
          public.inv_to_base(
            po_item.ingredient_id,
            po_item.entry_unit_id,
            po_item.quantity
          ) - coalesce(received.base_quantity, 0)
        ) / public.inv_to_base(
          po_item.ingredient_id,
          po_item.entry_unit_id,
          1
        ),
        3
      )::numeric(15,3) AS quantity
    FROM public.purchase_order_items AS po_item
    LEFT JOIN received USING (ingredient_id)
    WHERE po_item.tenant_id = v_tenant_id
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
    v_tenant_id,
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
      'branch_id', v_po.branch_id,
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

REVOKE ALL ON FUNCTION public.create_grn_from_po(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_grn_from_po(bigint)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Recreate GRN at receiving site (post-QC columns only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recreate_grn_at_receiving_site(
  p_grn_id bigint,
  p_target_branch_id bigint,
  p_target_location_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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

  SELECT grn.*
  INTO v_old_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = p_grn_id
    AND grn.tenant_id = v_tenant
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

  SELECT location.id, location.branch_id, location.location_kind
  INTO v_target_location
  FROM public.inventory_locations AS location
  WHERE location.id = p_target_location_id
    AND location.tenant_id = v_tenant
    AND location.branch_id = p_target_branch_id
    AND location.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_location_invalid' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_returns AS supplier_return
    WHERE supplier_return.tenant_id = v_tenant
      AND supplier_return.grn_id = p_grn_id
      AND supplier_return.status <> 'cancelled'
  )
  OR EXISTS (
    SELECT 1
    FROM public.supplier_return_items AS return_item
    JOIN public.supplier_returns AS supplier_return
      ON supplier_return.id = return_item.return_id
     AND supplier_return.tenant_id = return_item.tenant_id
    JOIN public.grn_items AS grn_item
      ON grn_item.id = return_item.grn_item_id
     AND grn_item.tenant_id = return_item.tenant_id
    WHERE return_item.tenant_id = v_tenant
      AND grn_item.grn_id = p_grn_id
      AND supplier_return.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'has_active_supplier_return' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_invoices AS invoice
    WHERE invoice.tenant_id = v_tenant
      AND invoice.grn_id = p_grn_id
      AND (
        COALESCE(invoice.payment_status, 'unpaid') <> 'unpaid'
        OR COALESCE(invoice.paid_amount, 0) > 0
        OR COALESCE(invoice.credit_applied_amount, 0) > 0
      )
  ) THEN
    RAISE EXCEPTION 'has_paid_invoice' USING ERRCODE = '23514';
  END IF;

  IF v_old_grn.po_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.audit_logs AS audit_log
      WHERE audit_log.tenant_id = v_tenant
        AND audit_log.action = 'inventory.po.created_from_grn'
        AND audit_log.entity_type = 'purchase_order'
        AND audit_log.entity_id = v_old_grn.po_id
        AND audit_log.new_data ->> 'grn_id' = p_grn_id::text
    ) INTO v_old_po_auto;

    IF NOT v_old_po_auto THEN
      RAISE EXCEPTION 'source_po_attached' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.goods_received_notes AS grn
      WHERE grn.tenant_id = v_tenant
        AND grn.po_id = v_old_grn.po_id
        AND grn.id <> p_grn_id
        AND grn.status = 'confirmed'
    ) THEN
      RAISE EXCEPTION 'source_po_shared' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_old_grn.location_id IS NOT NULL THEN
    SELECT location.id
    INTO v_old_location_id
    FROM public.inventory_locations AS location
    WHERE location.id = v_old_grn.location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_old_grn.branch_id
      AND location.is_active IS TRUE;
  ELSE
    SELECT location.id
    INTO v_old_location_id
    FROM public.inventory_locations AS location
    WHERE location.tenant_id = v_tenant
      AND location.branch_id = v_old_grn.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_default_receive IS TRUE
      AND location.is_active IS TRUE
    ORDER BY location.id
    LIMIT 1;
  END IF;

  IF v_old_location_id IS NULL THEN
    RAISE EXCEPTION 'source_location_missing' USING ERRCODE = '23502';
  END IF;

  FOR v_line IN
    SELECT item.*
    FROM public.grn_items AS item
    WHERE item.tenant_id = v_tenant
      AND item.grn_id = p_grn_id
    ORDER BY item.id
    FOR UPDATE
  LOOP
    v_net_qty := v_line.received_quantity - v_line.rejected_quantity;
    v_net_base := public.inv_to_base(
      v_line.ingredient_id,
      v_line.entry_unit_id,
      v_net_qty
    );
    v_cost_base := CASE
      WHEN v_net_base <> 0 THEN ROUND(
        (v_net_qty * v_line.unit_cost) / v_net_base,
        2
      )
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
      tenant_id,
      branch_id,
      ingredient_id,
      location_id,
      current_quantity
    ) VALUES (
      v_tenant,
      p_target_branch_id,
      v_line.ingredient_id,
      p_target_location_id,
      0
    )
    ON CONFLICT ON CONSTRAINT stock_levels_ingredient_branch_location_tenant_key
    DO NOTHING;

    PERFORM 1
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.ingredient_id = v_line.ingredient_id
      AND (
        (
          stock.branch_id = v_old_grn.branch_id
          AND stock.location_id = v_old_location_id
        )
        OR (
          stock.branch_id = p_target_branch_id
          AND stock.location_id = p_target_location_id
        )
      )
    ORDER BY stock.branch_id, stock.location_id, stock.ingredient_id
    FOR UPDATE;

    SELECT stock.current_quantity
    INTO v_old_current_qty
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_old_grn.branch_id
      AND stock.location_id = v_old_location_id
      AND stock.ingredient_id = v_line.ingredient_id;

    IF COALESCE(v_old_current_qty, 0) < v_net_base THEN
      RAISE EXCEPTION 'insufficient_source_stock:%', v_line.ingredient_id
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  v_new_grn_number := public.next_inventory_doc_number(v_tenant, 'grn');

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    location_id,
    supplier_id,
    po_id,
    grn_number,
    received_date,
    received_by,
    status,
    notes,
    created_by
  ) VALUES (
    v_tenant,
    p_target_branch_id,
    p_target_location_id,
    v_old_grn.supplier_id,
    NULL,
    v_new_grn_number,
    v_old_grn.received_date,
    v_uid,
    'confirmed',
    NULLIF(btrim(v_old_grn.notes), ''),
    v_uid
  )
  RETURNING id INTO v_new_grn_id;

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    supplier_id,
    received_quantity,
    entry_unit_id,
    unit_cost,
    total_cost,
    rejected_quantity,
    rejection_reason,
    rejected_photo_url
  )
  SELECT
    item.tenant_id,
    v_new_grn_id,
    item.ingredient_id,
    item.supplier_id,
    item.received_quantity,
    item.entry_unit_id,
    item.unit_cost,
    item.total_cost,
    item.rejected_quantity,
    item.rejection_reason,
    item.rejected_photo_url
  FROM public.grn_items AS item
  WHERE item.tenant_id = v_tenant
    AND item.grn_id = p_grn_id
  ORDER BY item.id;

  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.tenant_id = v_tenant
      AND item.grn_id = v_new_grn_id
      AND item.received_quantity - item.rejected_quantity > 0
  ) THEN
    v_new_po_display := public.next_po_display_id(v_tenant);

    INSERT INTO public.purchase_orders (
      tenant_id,
      branch_id,
      supplier_id,
      po_number,
      display_id,
      status,
      notes,
      created_by,
      source_grn_id
    ) VALUES (
      v_tenant,
      p_target_branch_id,
      COALESCE(
        v_old_grn.supplier_id,
        (
          SELECT item.supplier_id
          FROM public.grn_items AS item
          WHERE item.grn_id = v_new_grn_id
            AND item.tenant_id = v_tenant
          ORDER BY item.id
          LIMIT 1
        )
      ),
      v_new_po_display,
      v_new_po_display,
      'received',
      NULLIF(btrim(v_old_grn.notes), ''),
      v_uid,
      v_new_grn_id
    )
    RETURNING id INTO v_new_po_id;

    INSERT INTO public.purchase_order_items (
      tenant_id,
      po_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      unit_price_est,
      line_total
    )
    SELECT
      v_tenant,
      v_new_po_id,
      item.ingredient_id,
      (
        item.received_quantity - item.rejected_quantity
      )::numeric(15,3),
      item.entry_unit_id,
      item.unit_cost,
      ROUND(
        (item.received_quantity - item.rejected_quantity) * item.unit_cost,
        2
      )
    FROM public.grn_items AS item
    WHERE item.tenant_id = v_tenant
      AND item.grn_id = v_new_grn_id
      AND item.received_quantity - item.rejected_quantity > 0;

    GET DIAGNOSTICS v_auto_po_lines = ROW_COUNT;

    UPDATE public.goods_received_notes
    SET po_id = v_new_po_id,
        updated_at = now()
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
    SELECT item.*
    FROM public.grn_items AS item
    WHERE item.tenant_id = v_tenant
      AND item.grn_id = p_grn_id
    ORDER BY item.id
  LOOP
    v_net_qty := v_line.received_quantity - v_line.rejected_quantity;
    v_net_base := public.inv_to_base(
      v_line.ingredient_id,
      v_line.entry_unit_id,
      v_net_qty
    );
    v_cost_base := CASE
      WHEN v_net_base <> 0 THEN ROUND(
        (v_net_qty * v_line.unit_cost) / v_net_base,
        2
      )
      ELSE v_line.unit_cost
    END;

    IF v_net_base <= 0 THEN
      CONTINUE;
    END IF;

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_target_current_qty, v_target_wac
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = p_target_branch_id
      AND stock.location_id = p_target_location_id
      AND stock.ingredient_id = v_line.ingredient_id;

    v_target_current_qty := COALESCE(v_target_current_qty, 0);

    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      quantity_change,
      reason,
      created_by,
      grn_id,
      unit_cost,
      location_id,
      entry_unit_id,
      entry_quantity
    ) VALUES (
      v_tenant,
      v_old_grn.branch_id,
      v_line.ingredient_id,
      'grn_amend',
      -v_net_base,
      'GRN ' || v_old_grn.grn_number || ' recreated at ' || v_new_grn_number ||
        ': reverse source receipt - ' || trim(p_reason),
      v_uid,
      p_grn_id,
      v_cost_base,
      v_old_location_id,
      v_line.entry_unit_id,
      v_net_qty
    );

    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      quantity_change,
      reason,
      created_by,
      grn_id,
      unit_cost,
      location_id,
      entry_unit_id,
      entry_quantity
    ) VALUES (
      v_tenant,
      p_target_branch_id,
      v_line.ingredient_id,
      'grn_receipt',
      v_net_base,
      'GRN ' || v_new_grn_number || ' recreated from ' || v_old_grn.grn_number ||
        ': target receipt - ' || trim(p_reason),
      v_uid,
      v_new_grn_id,
      v_cost_base,
      p_target_location_id,
      v_line.entry_unit_id,
      v_net_qty
    );

    v_next_wac := CASE
      WHEN v_target_current_qty + v_net_base > 0 THEN ROUND(
        (
          (v_target_current_qty * COALESCE(v_target_wac, 0))
          + (v_net_base * v_cost_base)
        ) / (v_target_current_qty + v_net_base),
        2
      )
      ELSE v_cost_base
    END;

    IF abs(v_next_wac) > c_numeric_15_2_max THEN
      RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
    END IF;

    UPDATE public.stock_levels AS stock
    SET avg_unit_cost = v_next_wac,
        updated_at = now()
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = p_target_branch_id
      AND stock.location_id = p_target_location_id
      AND stock.ingredient_id = v_line.ingredient_id;

    UPDATE public.ingredients AS ingredient
    SET unit_cost = v_cost_base,
        updated_at = now()
    WHERE ingredient.tenant_id = v_tenant
      AND ingredient.id = v_line.ingredient_id;
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  IF v_old_po_auto THEN
    UPDATE public.purchase_orders
    SET status = 'cancelled',
        updated_at = now()
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
    SELECT invoice.id
    FROM public.supplier_invoices AS invoice
    WHERE invoice.tenant_id = v_tenant
      AND invoice.grn_id = v_new_grn_id
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

REVOKE ALL ON FUNCTION public.recreate_grn_at_receiving_site(
  bigint,
  bigint,
  bigint,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recreate_grn_at_receiving_site(
  bigint,
  bigint,
  bigint,
  text
) TO authenticated, service_role;
$migration_20260729120000$::text),
    ('20260729120100', 'fix_multi_supplier_grn_link_snapshot', $migration_20260729120100$-- Fix retrospective GRN↔PO link trigger for multi-supplier drafts (D092).
-- When goods_received_notes.supplier_id is NULL, the legacy po_id pointer is the
-- first split PO only; snapshot compare must use lines for that PO's supplier.

CREATE OR REPLACE FUNCTION private.enforce_retrospective_grn_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_po record;
  v_trusted_rpc boolean;
  v_recovery_insert boolean :=
    COALESCE(
      pg_catalog.current_setting(
        'comtammatu.grn_recovery_insert',
        TRUE
      ),
      'false'
    ) = 'true';
BEGIN
  SELECT CURRENT_USER = pg_catalog.pg_get_userbyid(relation.relowner)
  INTO v_trusted_rpc
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = 'public.goods_received_notes'::pg_catalog.regclass;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'grn_must_start_as_draft'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.po_id IS NOT NULL
       AND (
         v_trusted_rpc IS DISTINCT FROM TRUE
         OR auth.role() IS DISTINCT FROM 'service_role'
         OR NOT v_recovery_insert
       ) THEN
      RAISE EXCEPTION 'linked_grn_must_start_as_unlinked_draft'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'retrospective-grn:' || OLD.id::text,
      0
    )
  );

  IF TG_OP = 'DELETE' THEN
    IF OLD.po_id IS NOT NULL THEN
      RAISE EXCEPTION 'linked_grn_immutable'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.po_id IS NOT NULL THEN
    IF v_trusted_rpc IS TRUE
       AND NEW.id IS NOT DISTINCT FROM OLD.id
       AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
       AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
       AND NEW.po_id IS NOT DISTINCT FROM OLD.po_id
       AND NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id
       AND NEW.grn_number IS NOT DISTINCT FROM OLD.grn_number
       AND NEW.received_date IS NOT DISTINCT FROM OLD.received_date
       AND NEW.received_by IS NOT DISTINCT FROM OLD.received_by
       AND NEW.notes IS NOT DISTINCT FROM OLD.notes
       AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
       AND NEW.location_id IS NOT DISTINCT FROM OLD.location_id
       AND OLD.status = 'draft'
       AND NEW.status = 'confirmed' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'linked_grn_immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.po_id IS NULL THEN
    IF OLD.status IS DISTINCT FROM 'confirmed'
       AND NEW.status = 'confirmed' THEN
      RAISE EXCEPTION 'grn_confirm_requires_approved_po'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF v_trusted_rpc IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'grn_po_link_requires_rpc'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'retrospective-po:' || NEW.po_id::text,
      0
    )
  );

  SELECT purchase_order.*
  INTO v_po
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = NEW.po_id;

  IF NOT FOUND
     OR v_po.tenant_id <> NEW.tenant_id
     OR v_po.branch_id <> NEW.branch_id
     OR (
       NEW.supplier_id IS NOT NULL
       AND v_po.supplier_id IS DISTINCT FROM NEW.supplier_id
     )
     OR v_po.status <> 'draft'
     OR NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_po_link_invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = NEW.location_id
      AND location.tenant_id = NEW.tenant_id
      AND location.branch_id = NEW.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'grn_receiving_warehouse_required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT private.grn_physical_qc_is_valid(NEW.tenant_id, NEW.id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.grn_items AS item
       WHERE item.tenant_id = NEW.tenant_id
         AND item.grn_id = NEW.id
         AND item.received_quantity - item.rejected_quantity > 0
     ) THEN
    RAISE EXCEPTION 'grn_physical_qc_incomplete'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    WITH grn_snapshot AS (
      SELECT
        item.ingredient_id,
        item.entry_unit_id,
        sum(
          item.received_quantity - item.rejected_quantity
        )::numeric(15,3) AS quantity
      FROM public.grn_items AS item
      WHERE item.tenant_id = NEW.tenant_id
        AND item.grn_id = NEW.id
        AND item.received_quantity - item.rejected_quantity > 0
        AND (
          -- Single-supplier header: all receivable lines.
          -- Multi-supplier (NULL header): lines for the linked first PO only.
          NEW.supplier_id IS NOT NULL
          OR item.supplier_id = v_po.supplier_id
        )
      GROUP BY item.ingredient_id, item.entry_unit_id
    ),
    po_snapshot AS (
      SELECT
        item.ingredient_id,
        item.entry_unit_id,
        sum(item.quantity)::numeric(15,3) AS quantity
      FROM public.purchase_order_items AS item
      WHERE item.tenant_id = NEW.tenant_id
        AND item.po_id = NEW.po_id
      GROUP BY item.ingredient_id, item.entry_unit_id
    )
    SELECT 1
    FROM grn_snapshot
    FULL JOIN po_snapshot
      ON po_snapshot.ingredient_id = grn_snapshot.ingredient_id
     AND po_snapshot.entry_unit_id IS NOT DISTINCT FROM
       grn_snapshot.entry_unit_id
    WHERE grn_snapshot.ingredient_id IS NULL
       OR po_snapshot.ingredient_id IS NULL
       OR grn_snapshot.quantity <> po_snapshot.quantity
  ) THEN
    RAISE EXCEPTION 'grn_po_snapshot_mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION private.enforce_retrospective_grn_immutability() IS
  'Retrospective GRN↔PO link guard. Multi-supplier drafts (NULL header supplier_id) snapshot only the lines for the linked first PO supplier.';
$migration_20260729120100$::text),
    ('20260729120200', 'fix_multi_supplier_grn_line_price_sync', $migration_20260729120200$-- Allow GRN line unit_cost sync from any draft PO linked via source_grn_id
-- (multi-supplier split), not only goods_received_notes.po_id.

CREATE OR REPLACE FUNCTION private.enforce_linked_grn_line_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_grn_id bigint;
  v_grn_ids bigint[];
  v_old_tenant_id bigint;
  v_new_tenant_id bigint;
  v_linked boolean := FALSE;
  v_grn_status text;
  v_trusted_rpc boolean;
  v_recovery_insert boolean :=
    COALESCE(
      pg_catalog.current_setting(
        'comtammatu.grn_recovery_insert',
        TRUE
      ),
      'false'
    ) = 'true';
BEGIN
  SELECT CURRENT_USER = pg_catalog.pg_get_userbyid(relation.relowner)
  INTO v_trusted_rpc
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = 'public.grn_items'::pg_catalog.regclass;

  IF TG_OP = 'INSERT' THEN
    v_grn_ids := ARRAY[NEW.grn_id];
    v_new_tenant_id := NEW.tenant_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_grn_ids := ARRAY[OLD.grn_id];
    v_old_tenant_id := OLD.tenant_id;
  ELSE
    v_grn_ids := ARRAY[OLD.grn_id, NEW.grn_id];
    v_old_tenant_id := OLD.tenant_id;
    v_new_tenant_id := NEW.tenant_id;
  END IF;

  FOR v_grn_id IN
    SELECT DISTINCT candidate.grn_id
    FROM unnest(v_grn_ids) AS candidate(grn_id)
    WHERE candidate.grn_id IS NOT NULL
    ORDER BY candidate.grn_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'retrospective-grn:' || v_grn_id::text,
        0
      )
    );
  END LOOP;

  SELECT EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.id = ANY (v_grn_ids)
      AND (
        grn.po_id IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.purchase_orders AS po
          WHERE po.source_grn_id = grn.id
            AND po.tenant_id = grn.tenant_id
        )
      )
      AND (
        grn.tenant_id = v_old_tenant_id
        OR grn.tenant_id = v_new_tenant_id
      )
  )
  INTO v_linked;

  IF NOT v_linked THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     AND v_trusted_rpc IS TRUE
     AND auth.role() = 'service_role'
     AND v_recovery_insert THEN
    RETURN NEW;
  END IF;

  -- Price sync from approve_purchase_order: match draft PO by legacy po_id
  -- or source_grn_id, scoped to the line's supplier when set.
  IF TG_OP = 'UPDATE'
     AND v_trusted_rpc IS TRUE
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.grn_id IS NOT DISTINCT FROM OLD.grn_id
     AND NEW.ingredient_id IS NOT DISTINCT FROM OLD.ingredient_id
     AND NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id
     AND NEW.received_quantity IS NOT DISTINCT FROM OLD.received_quantity
     AND NEW.rejected_quantity IS NOT DISTINCT FROM OLD.rejected_quantity
     AND NEW.rejection_reason IS NOT DISTINCT FROM OLD.rejection_reason
     AND NEW.rejected_photo_url IS NOT DISTINCT FROM OLD.rejected_photo_url
     AND NEW.entry_unit_id IS NOT DISTINCT FROM OLD.entry_unit_id THEN
    IF EXISTS (
      SELECT 1
      FROM public.goods_received_notes AS grn
      JOIN public.purchase_orders AS purchase_order
        ON purchase_order.tenant_id = grn.tenant_id
       AND (
         purchase_order.id = grn.po_id
         OR purchase_order.source_grn_id = grn.id
       )
      JOIN public.purchase_order_items AS po_item
        ON po_item.po_id = purchase_order.id
       AND po_item.tenant_id = purchase_order.tenant_id
       AND po_item.ingredient_id = NEW.ingredient_id
       AND po_item.entry_unit_id IS NOT DISTINCT FROM
         NEW.entry_unit_id
      WHERE grn.id = NEW.grn_id
        AND grn.tenant_id = NEW.tenant_id
        AND purchase_order.status = 'draft'
        AND (
          NEW.supplier_id IS NULL
          OR purchase_order.supplier_id = NEW.supplier_id
        )
        AND po_item.unit_price_est > 0
        AND NEW.unit_cost = po_item.unit_price_est
        AND NEW.total_cost = pg_catalog.round(
          (
            NEW.received_quantity - NEW.rejected_quantity
          ) * po_item.unit_price_est,
          2
        )
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND v_trusted_rpc IS TRUE
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.grn_id IS NOT DISTINCT FROM OLD.grn_id
     AND NEW.ingredient_id IS NOT DISTINCT FROM OLD.ingredient_id
     AND NEW.unit_cost IS NOT DISTINCT FROM OLD.unit_cost
     AND NEW.entry_unit_id IS NOT DISTINCT FROM OLD.entry_unit_id
     AND NEW.received_quantity >= 0
     AND NEW.received_quantity NOT IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     AND NEW.rejected_quantity >= 0
     AND NEW.rejected_quantity NOT IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     AND NEW.rejected_quantity <= NEW.received_quantity
     AND (
       NEW.rejected_quantity = 0
       OR (
         NULLIF(pg_catalog.btrim(NEW.rejection_reason), '') IS NOT NULL
         AND private.grn_rejection_photo_exists(
           NEW.tenant_id,
           NEW.grn_id,
           NEW.id,
           NEW.rejected_photo_url
         )
       )
     )
     AND NEW.total_cost = pg_catalog.round(
       (
         NEW.received_quantity - NEW.rejected_quantity
       ) * NEW.unit_cost,
       2
     ) THEN
    SELECT grn.status
    INTO v_grn_status
    FROM public.goods_received_notes AS grn
    WHERE grn.id = NEW.grn_id
      AND grn.tenant_id = NEW.tenant_id
      AND (
        grn.po_id IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.purchase_orders AS po
          WHERE po.source_grn_id = grn.id
            AND po.tenant_id = grn.tenant_id
        )
      );

    IF v_grn_status = 'confirmed' THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'linked_grn_lines_immutable'
    USING ERRCODE = 'check_violation';
END;
$function$;

COMMENT ON FUNCTION private.enforce_linked_grn_line_immutability() IS
  'Linked GRN line immutability. Allows approve price sync from any draft PO linked via po_id or source_grn_id (multi-supplier).';
$migration_20260729120200$::text),
    ('20260729120300', 'fix_multi_supplier_po_price_link', $migration_20260729120300$-- Allow pricing any draft PO linked to a draft GRN via source_grn_id
-- (multi-supplier split), not only goods_received_notes.po_id.

CREATE OR REPLACE FUNCTION public.update_purchase_order_prices_protected(
  p_po_id bigint,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_read_inventory_monetary(
    'procurement:price_list_read'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM purchase_order.id
  FROM public.purchase_orders AS purchase_order
  JOIN public.goods_received_notes AS grn
    ON grn.tenant_id = purchase_order.tenant_id
   AND grn.status = 'draft'
   AND (
     grn.po_id = purchase_order.id
     OR purchase_order.source_grn_id = grn.id
   )
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = v_tenant
    AND purchase_order.status = 'draft'
  FOR UPDATE OF purchase_order, grn;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_linked_to_draft_grn'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN public.update_purchase_order_prices(p_po_id, p_lines);
END;
$function$;

REVOKE ALL ON FUNCTION public.update_purchase_order_prices_protected(bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_purchase_order_prices_protected(bigint, jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.update_purchase_order_prices_protected(bigint, jsonb) IS
  'Price draft PO lines when linked to a draft GRN via po_id or source_grn_id (multi-supplier).';
$migration_20260729120300$::text),
    ('20260729120400', 'fix_multi_supplier_po_status_link', $migration_20260729120400$-- Treat purchase_orders.source_grn_id as a retrospective GRN link so
-- confirm can move split POs sent → received/partially_received.

CREATE OR REPLACE FUNCTION private.enforce_retrospective_purchase_order_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_linked boolean := FALSE;
  v_trusted_rpc boolean;
BEGIN
  SELECT CURRENT_USER = pg_catalog.pg_get_userbyid(relation.relowner)
  INTO v_trusted_rpc
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = 'public.purchase_orders'::pg_catalog.regclass;

  IF TG_OP = 'INSERT' THEN
    IF v_trusted_rpc IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'purchase_order_insert_requires_rpc'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'purchase_order_must_start_as_draft'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'retrospective-po:' || OLD.id::text,
      0
    )
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.tenant_id = OLD.tenant_id
      AND (
        grn.po_id = OLD.id
        OR OLD.source_grn_id = grn.id
      )
  )
  INTO v_linked;

  IF TG_OP = 'DELETE' THEN
    IF v_linked THEN
      RAISE EXCEPTION 'linked_grn_purchase_order_immutable'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT v_linked THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF v_trusted_rpc IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'purchase_order_status_requires_rpc'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF OLD.status <> 'draft' OR NEW.status <> 'sent' THEN
        RAISE EXCEPTION 'purchase_order_status_transition_invalid'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF v_trusted_rpc IS TRUE
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
     AND NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id
     AND NEW.po_number IS NOT DISTINCT FROM OLD.po_number
     AND NEW.ordered_at IS NOT DISTINCT FROM OLD.ordered_at
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.display_id IS NOT DISTINCT FROM OLD.display_id
     AND NEW.source_grn_id IS NOT DISTINCT FROM OLD.source_grn_id
     AND (
       (
         OLD.status = 'draft'
         AND NEW.status = 'sent'
       )
       OR (
         OLD.status IN ('sent', 'partially_received', 'received')
         AND NEW.status IN ('partially_received', 'received')
       )
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'linked_grn_purchase_order_immutable'
    USING ERRCODE = 'check_violation';
END;
$function$;

COMMENT ON FUNCTION private.enforce_retrospective_purchase_order_immutability() IS
  'Retrospective PO immutability. Links via grn.po_id or purchase_orders.source_grn_id (multi-supplier split).';
$migration_20260729120400$::text),
    ('20260729140200', 'fix_supplier_invoice_multi_supplier_matching', $migration_20260729140200$-- D092: supplier invoice create + matching scoped per GRN supplier slice.
-- Header goods_received_notes.supplier_id may be NULL on multi-NCC GRNs;
-- affiliation and net accepted value use grn_items.supplier_id. Effective PO
-- may be a split source_grn_id PO for that supplier, not only grn.po_id.

CREATE OR REPLACE FUNCTION public.recompute_supplier_invoice_matching(
  p_invoice_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_invoice public.supplier_invoices%ROWTYPE;
  v_grn public.goods_received_notes%ROWTYPE;
  v_grn_subtotal numeric(15,2);
  v_po_subtotal numeric(15,2);
  v_effective_po_id bigint;
  v_grn_found boolean := false;
  v_supplier_ok boolean := false;
  v_status text := 'pending';
  v_reason text := 'missing_grn';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:invoice_match') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_invoice
  FROM public.supplier_invoices
  WHERE id = p_invoice_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.grn_id IS NULL THEN
    UPDATE public.supplier_invoices
    SET matching_status = v_status,
        updated_at = pg_catalog.now()
    WHERE id = p_invoice_id;

    RETURN pg_catalog.jsonb_build_object(
      'invoice_id', p_invoice_id,
      'matching_status', v_status,
      'reason', v_reason
    );
  END IF;

  SELECT *
  INTO v_grn
  FROM public.goods_received_notes
  WHERE id = v_invoice.grn_id
    AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    v_status := 'discrepancy';
    v_reason := 'grn_supplier_mismatch';
  ELSE
    v_grn_found := true;
    v_supplier_ok := (
      v_grn.supplier_id IS NOT DISTINCT FROM v_invoice.supplier_id
      OR (
        v_grn.supplier_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.grn_items gi
          WHERE gi.grn_id = v_grn.id
            AND gi.tenant_id = v_tenant
            AND gi.supplier_id = v_invoice.supplier_id
        )
      )
    );

    IF NOT v_supplier_ok THEN
      v_status := 'discrepancy';
      v_reason := 'grn_supplier_mismatch';
    ELSIF v_grn.status <> 'confirmed' THEN
      v_status := 'pending';
      v_reason := 'grn_not_confirmed';
    ELSE
      SELECT COALESCE(
        SUM(
          pg_catalog.round(
            (received_quantity - COALESCE(rejected_quantity, 0)) * unit_cost,
            2
          )
        ),
        0
      )
      INTO v_grn_subtotal
      FROM public.grn_items
      WHERE grn_id = v_grn.id
        AND tenant_id = v_tenant
        AND (
          supplier_id = v_invoice.supplier_id
          OR (
            supplier_id IS NULL
            AND v_grn.supplier_id IS NOT DISTINCT FROM v_invoice.supplier_id
          )
        );

      v_status := 'matched';
      v_reason := 'grn_net_subtotal_within_tolerance';

      IF (
        v_grn_subtotal <= 0
        AND v_invoice.subtotal > 0
      ) OR (
        v_grn_subtotal > 0
        AND pg_catalog.abs(v_invoice.subtotal - v_grn_subtotal)
          / v_grn_subtotal > 0.02
      ) THEN
        v_status := 'discrepancy';
        v_reason := 'grn_net_subtotal_mismatch';
      END IF;
    END IF;
  END IF;

  IF v_invoice.po_id IS NOT NULL THEN
    v_effective_po_id := v_invoice.po_id;
  ELSIF v_grn_found THEN
    SELECT po.id
    INTO v_effective_po_id
    FROM public.purchase_orders po
    WHERE po.tenant_id = v_tenant
      AND po.supplier_id = v_invoice.supplier_id
      AND po.source_grn_id = v_grn.id
    ORDER BY po.id
    LIMIT 1;

    IF v_effective_po_id IS NULL
      AND v_grn.po_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.purchase_orders po
        WHERE po.id = v_grn.po_id
          AND po.tenant_id = v_tenant
          AND po.supplier_id = v_invoice.supplier_id
      ) THEN
      v_effective_po_id := v_grn.po_id;
    END IF;
  END IF;

  IF v_status = 'matched' AND v_grn_found AND v_invoice.po_id IS NOT NULL THEN
    IF NOT (
      v_invoice.po_id IS NOT DISTINCT FROM v_grn.po_id
      OR EXISTS (
        SELECT 1
        FROM public.purchase_orders po
        WHERE po.id = v_invoice.po_id
          AND po.tenant_id = v_tenant
          AND po.source_grn_id = v_grn.id
      )
    ) THEN
      v_status := 'discrepancy';
      v_reason := 'po_grn_mismatch';
    END IF;
  END IF;

  IF v_status = 'matched' AND v_effective_po_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.purchase_orders
      WHERE id = v_effective_po_id
        AND tenant_id = v_tenant
        AND supplier_id = v_invoice.supplier_id
    ) THEN
      v_status := 'discrepancy';
      v_reason := 'po_supplier_mismatch';
    ELSE
      SELECT CASE
        WHEN COUNT(*) > 0 AND COUNT(line_total) = COUNT(*)
          THEN SUM(line_total)
        ELSE NULL
      END
      INTO v_po_subtotal
      FROM public.purchase_order_items
      WHERE po_id = v_effective_po_id
        AND tenant_id = v_tenant;

      IF v_po_subtotal > 0
        AND pg_catalog.abs(v_invoice.subtotal - v_po_subtotal)
          / v_po_subtotal > 0.02 THEN
        v_status := 'discrepancy';
        v_reason := 'po_subtotal_mismatch';
      ELSIF v_po_subtotal > 0 THEN
        v_reason := 'grn_and_po_net_subtotals_within_tolerance';
      END IF;
    END IF;
  END IF;

  UPDATE public.supplier_invoices
  SET po_id = COALESCE(po_id, v_effective_po_id),
      matching_status = v_status,
      updated_at = pg_catalog.now()
  WHERE id = p_invoice_id;

  RETURN pg_catalog.jsonb_build_object(
    'invoice_id', p_invoice_id,
    'matching_status', v_status,
    'reason', v_reason,
    'invoice_subtotal', v_invoice.subtotal,
    'grn_subtotal', v_grn_subtotal,
    'po_subtotal', v_po_subtotal
  );
END;
$$;

COMMENT ON FUNCTION public.recompute_supplier_invoice_matching(bigint) IS
  'Matches supplier-invoice pre-VAT subtotal to confirmed net accepted GRN value for the invoice supplier (header or line-scoped) and, when fully priced, the linked source or legacy PO subtotal.';

REVOKE ALL ON FUNCTION public.recompute_supplier_invoice_matching(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_supplier_invoice_matching(bigint)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_supplier_invoice_with_vat_breakdown(
  p_supplier_id bigint,
  p_grn_id bigint,
  p_po_id bigint,
  p_invoice_number text,
  p_invoice_date date,
  p_vat_breakdown jsonb,
  p_matching_notes text,
  p_due_date date
) RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_user_id uuid := auth.uid();
  v_payment_terms_days integer;
  v_effective_po_id bigint := p_po_id;
  v_due_date date := p_due_date;
  v_grn record;
  v_invoice_id bigint;
  v_supplier_ok boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:invoice_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT payment_terms_days
  INTO v_payment_terms_days
  FROM public.suppliers
  WHERE id = p_supplier_id
    AND tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_grn_id IS NOT NULL THEN
    SELECT id, supplier_id, po_id, status
    INTO v_grn
    FROM public.goods_received_notes
    WHERE id = p_grn_id
      AND tenant_id = v_tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_grn.status <> 'confirmed' THEN
      RAISE EXCEPTION 'grn_not_confirmed' USING ERRCODE = '22023';
    END IF;

    v_supplier_ok := (
      v_grn.supplier_id IS NOT DISTINCT FROM p_supplier_id
      OR (
        v_grn.supplier_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.grn_items gi
          WHERE gi.grn_id = p_grn_id
            AND gi.tenant_id = v_tenant_id
            AND gi.supplier_id = p_supplier_id
        )
      )
    );
    IF NOT v_supplier_ok THEN
      RAISE EXCEPTION 'grn_supplier_mismatch' USING ERRCODE = '22023';
    END IF;

    IF p_po_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.purchase_orders po
        WHERE po.id = p_po_id
          AND po.tenant_id = v_tenant_id
          AND po.supplier_id = p_supplier_id
          AND (
            po.id IS NOT DISTINCT FROM v_grn.po_id
            OR po.source_grn_id = p_grn_id
          )
      ) THEN
        RAISE EXCEPTION 'po_grn_mismatch' USING ERRCODE = '22023';
      END IF;
      v_effective_po_id := p_po_id;
    ELSE
      SELECT po.id
      INTO v_effective_po_id
      FROM public.purchase_orders po
      WHERE po.tenant_id = v_tenant_id
        AND po.supplier_id = p_supplier_id
        AND po.source_grn_id = p_grn_id
      ORDER BY po.id
      LIMIT 1;

      IF v_effective_po_id IS NULL
        AND v_grn.po_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.purchase_orders po
          WHERE po.id = v_grn.po_id
            AND po.tenant_id = v_tenant_id
            AND po.supplier_id = p_supplier_id
        ) THEN
        v_effective_po_id := v_grn.po_id;
      END IF;
    END IF;
  ELSIF p_po_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.purchase_orders
    WHERE id = p_po_id
      AND tenant_id = v_tenant_id
      AND supplier_id = p_supplier_id
  ) THEN
    RAISE EXCEPTION 'po_supplier_mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_due_date IS NULL
    AND v_payment_terms_days IS NOT NULL
    AND v_payment_terms_days > 0 THEN
    v_due_date := p_invoice_date + v_payment_terms_days;
  END IF;

  INSERT INTO public.supplier_invoices (
    tenant_id,
    supplier_id,
    grn_id,
    po_id,
    invoice_number,
    invoice_date,
    subtotal,
    vat_rate,
    vat_amount,
    total_amount,
    vat_breakdown,
    matching_notes,
    created_by,
    due_date,
    payment_status
  ) VALUES (
    v_tenant_id,
    p_supplier_id,
    p_grn_id,
    v_effective_po_id,
    p_invoice_number,
    p_invoice_date,
    0,
    NULL,
    0,
    0,
    p_vat_breakdown,
    NULLIF(pg_catalog.btrim(p_matching_notes), ''),
    v_user_id,
    v_due_date,
    'unpaid'
  )
  RETURNING id INTO v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

COMMENT ON FUNCTION public.create_supplier_invoice_with_vat_breakdown(
  bigint, bigint, bigint, text, date, jsonb, text, date
) IS
  'Creates one tenant-scoped supplier invoice with multi-rate input-VAT breakdown; links GRN/PO per supplier including multi-NCC GRN slices.';

REVOKE ALL ON FUNCTION public.create_supplier_invoice_with_vat_breakdown(
  bigint, bigint, bigint, text, date, jsonb, text, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_invoice_with_vat_breakdown(
  bigint, bigint, bigint, text, date, jsonb, text, date
) TO authenticated;
$migration_20260729140200$::text),
    ('20260729140300', 'drop_legacy_create_grn_from_po', $migration_20260729140300$-- D091/D092: GRN-first procurement. Authenticated PO→GRN creator must not
-- survive; recovery stays on create_grn_from_approved_po (service_role only).

DROP FUNCTION IF EXISTS public.create_grn_from_po(bigint);
$migration_20260729140300$::text),
    ('20260729140400', 'supplier_item_preferred', $migration_20260729140400$-- D094: preferred supplier mapping for multi-NCC ingredients.
-- At most one active preferred supplier_items row per ingredient.
-- GRN draft auto-selects preferred when >1 active mapping; picker still allows override.

ALTER TABLE public.supplier_items
  ADD COLUMN IF NOT EXISTS is_preferred boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.supplier_items.is_preferred IS
  'Preferred active mapping for an ingredient. At most one per tenant+ingredient among active rows.';

-- Backfill sole active mappings so catalog state matches auto-select behavior.
UPDATE public.supplier_items AS target
SET is_preferred = true
WHERE target.is_active
  AND NOT target.is_preferred
  AND (
    SELECT count(*)::integer
    FROM public.supplier_items AS peer
    WHERE peer.tenant_id = target.tenant_id
      AND peer.ingredient_id = target.ingredient_id
      AND peer.is_active
  ) = 1;

CREATE UNIQUE INDEX IF NOT EXISTS supplier_items_one_preferred_per_ingredient_uidx
  ON public.supplier_items (tenant_id, ingredient_id)
  WHERE is_active AND is_preferred;

GRANT SELECT (is_preferred) ON public.supplier_items TO authenticated;
GRANT INSERT (is_preferred) ON public.supplier_items TO authenticated;
GRANT UPDATE (is_preferred) ON public.supplier_items TO authenticated;

CREATE OR REPLACE FUNCTION public.set_supplier_item_preferred(
  p_item_id bigint,
  p_is_preferred boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_item public.supplier_items%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'missing_tenant' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:price_list_write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_item_id IS NULL OR p_item_id <= 0 THEN
    RAISE EXCEPTION 'invalid_supplier_item_id' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_item
  FROM public.supplier_items
  WHERE id = p_item_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier_item_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_item.is_active THEN
    RAISE EXCEPTION 'supplier_item_inactive' USING ERRCODE = '22023';
  END IF;

  IF p_is_preferred THEN
    UPDATE public.supplier_items
    SET is_preferred = false,
        updated_at = pg_catalog.now()
    WHERE tenant_id = v_tenant
      AND ingredient_id = v_item.ingredient_id
      AND is_active
      AND is_preferred
      AND id IS DISTINCT FROM p_item_id;

    UPDATE public.supplier_items
    SET is_preferred = true,
        updated_at = pg_catalog.now()
    WHERE id = p_item_id
      AND tenant_id = v_tenant;
  ELSE
    UPDATE public.supplier_items
    SET is_preferred = false,
        updated_at = pg_catalog.now()
    WHERE id = p_item_id
      AND tenant_id = v_tenant;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'item_id', p_item_id,
    'ingredient_id', v_item.ingredient_id,
    'supplier_id', v_item.supplier_id,
    'is_preferred', p_is_preferred
  );
END;
$$;

COMMENT ON FUNCTION public.set_supplier_item_preferred(bigint, boolean) IS
  'Sets or clears preferred supplier mapping for an ingredient; clears other active preferreds when enabling.';

REVOKE ALL ON FUNCTION public.set_supplier_item_preferred(bigint, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_supplier_item_preferred(bigint, boolean)
  TO authenticated;
$migration_20260729140400$::text),
    ('20260729140600', 'printer_fleet_sort_order', $migration_20260729140600$-- P1 printer fleet: drop 3-slot role topology, add sort_order routing.

ALTER TABLE public.printers
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

UPDATE public.printers
   SET sort_order = CASE role
     WHEN 'receipt' THEN 0
     WHEN 'kitchen_1' THEN 1
     WHEN 'kitchen_2' THEN 2
     ELSE 9
   END
 WHERE sort_order = 0;

-- Resolve duplicate names before unique constraint (keep lowest id, suffix others).
WITH ranked AS (
  SELECT id,
         tenant_id,
         branch_id,
         name,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, branch_id, lower(trim(name))
           ORDER BY id
         ) AS rn
  FROM public.printers
)
UPDATE public.printers p
   SET name = p.name || ' (' || ranked.rn::text || ')'
  FROM ranked
 WHERE p.id = ranked.id
   AND ranked.rn > 1;

ALTER TABLE public.printers DROP CONSTRAINT IF EXISTS printers_role_check;

ALTER TABLE public.printers DROP CONSTRAINT IF EXISTS printers_branch_id_role_tenant_id_key;

ALTER TABLE public.printers
  ADD CONSTRAINT printers_tenant_branch_name_key
  UNIQUE (tenant_id, branch_id, name);

-- public.resolve_branch_printer_for_type
CREATE OR REPLACE FUNCTION public.resolve_branch_printer_for_type(p_tenant_id bigint, p_branch_id bigint, p_print_type text) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id
  FROM public.printers p
  JOIN public.printer_print_types ppt
    ON ppt.printer_id = p.id
   AND ppt.tenant_id = p.tenant_id
   AND ppt.branch_id = p.branch_id
   AND ppt.print_type = p_print_type
  WHERE p.tenant_id = p_tenant_id
    AND p.branch_id = p_branch_id
    AND (
      auth.role() = 'service_role'
      OR (
        p_tenant_id = public.auth_tenant_id()
        AND (
          public.auth_branch_id() IS NULL
          OR p_branch_id = public.auth_branch_id()
        )
      )
    )
    AND p.is_active = TRUE
  ORDER BY p.sort_order, p.id
  LIMIT 1;
$$;

-- public.upsert_printer_with_routes
CREATE OR REPLACE FUNCTION public.upsert_printer_with_routes(p_printer_id bigint DEFAULT NULL::bigint, p_branch_id bigint DEFAULT NULL::bigint, p_role text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_lan_host text DEFAULT NULL::text, p_lan_port integer DEFAULT NULL::integer, p_paper_width_mm smallint DEFAULT 80, p_code_page text DEFAULT 'CP1258'::text, p_is_active boolean DEFAULT true, p_print_types text[] DEFAULT ARRAY[]::text[], p_category_ids bigint[] DEFAULT ARRAY[]::bigint[]) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID;
  v_tenant_id BIGINT;
  v_claim_branch_id BIGINT;
  v_existing RECORD;
  v_printer_id BIGINT;
  v_print_type TEXT;
  v_category_id BIGINT;
  v_role TEXT;
  v_sort_order INT;
  v_allowed_print_types TEXT[] := ARRAY[
    'receipt',
    'provisional_bill',
    'shift_close_report',
    'kitchen_ticket',
    'cancel_ticket'
  ];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  v_tenant_id := public.auth_tenant_id();
  v_claim_branch_id := public.auth_branch_id();

  IF p_branch_id IS NULL OR p_name IS NULL THEN
    RAISE EXCEPTION 'invalid_printer_payload' USING ERRCODE = '22023';
  END IF;

  IF v_claim_branch_id IS NOT NULL AND v_claim_branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'printer:manage') THEN
    RAISE EXCEPTION 'permission denied: printer:manage' USING ERRCODE = '42501';
  END IF;

  v_role := COALESCE(NULLIF(trim(COALESCE(p_role, '')), ''), 'custom');

  PERFORM 1
  FROM public.branches
  WHERE id = p_branch_id
    AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002';
  END IF;

IF NULLIF(trim(COALESCE(p_lan_host, '')), '') IS NULL THEN
    RAISE EXCEPTION 'lan host required' USING ERRCODE = '22023';
  END IF;

  IF p_paper_width_mm NOT IN (58, 80) THEN
    RAISE EXCEPTION 'invalid paper width' USING ERRCODE = '22023';
  END IF;

  FOREACH v_print_type IN ARRAY COALESCE(p_print_types, ARRAY[]::TEXT[])
  LOOP
    IF NOT v_print_type = ANY(v_allowed_print_types) THEN
      RAISE EXCEPTION 'invalid print type: %', v_print_type USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOREACH v_category_id IN ARRAY COALESCE(p_category_ids, ARRAY[]::BIGINT[])
  LOOP
    PERFORM 1
    FROM public.menu_categories
    WHERE id = v_category_id
      AND tenant_id = v_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'category not found: %', v_category_id USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  IF p_printer_id IS NOT NULL THEN
    SELECT id, branch_id, role
    INTO v_existing
    FROM public.printers
    WHERE id = p_printer_id
      AND tenant_id = v_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'printer not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_existing.branch_id <> p_branch_id THEN
      RAISE EXCEPTION 'cannot move printer across branches' USING ERRCODE = '22023';
    END IF;

    UPDATE public.printers
       SET role = v_role,
           name = trim(p_name),
           connection_type = 'lan',
           lan_host = trim(p_lan_host),
           lan_port = COALESCE(p_lan_port, 9100),
           paper_width_mm = p_paper_width_mm,
           code_page = COALESCE(NULLIF(trim(p_code_page), ''), 'CP1258'),
           is_active = COALESCE(p_is_active, TRUE)
     WHERE id = p_printer_id
       AND tenant_id = v_tenant_id
     RETURNING id INTO v_printer_id;
  ELSE
    SELECT COALESCE(MAX(sort_order), -1) + 1
      INTO v_sort_order
      FROM public.printers
     WHERE tenant_id = v_tenant_id
       AND branch_id = p_branch_id;

    INSERT INTO public.printers (
      tenant_id,
      branch_id,
      role,
      name,
      sort_order,
      connection_type,
      lan_host,
      lan_port,
      paper_width_mm,
      code_page,
      is_active
    ) VALUES (
      v_tenant_id,
      p_branch_id,
      v_role,
      trim(p_name),
      v_sort_order,
      'lan',
      trim(p_lan_host),
      COALESCE(p_lan_port, 9100),
      p_paper_width_mm,
      COALESCE(NULLIF(trim(p_code_page), ''), 'CP1258'),
      COALESCE(p_is_active, TRUE)
    )
    RETURNING id INTO v_printer_id;
  END IF;

  DELETE FROM public.printer_print_types ppt
  WHERE ppt.tenant_id = v_tenant_id
    AND ppt.branch_id = p_branch_id
    AND ppt.printer_id <> v_printer_id
    AND ppt.print_type = ANY(COALESCE(p_print_types, ARRAY[]::TEXT[]))
    AND ppt.print_type IN ('receipt', 'provisional_bill', 'shift_close_report');

  DELETE FROM public.printer_print_types
  WHERE tenant_id = v_tenant_id
    AND branch_id = p_branch_id
    AND printer_id = v_printer_id;

  INSERT INTO public.printer_print_types (tenant_id, branch_id, printer_id, print_type)
  SELECT v_tenant_id, p_branch_id, v_printer_id, unnest(COALESCE(p_print_types, ARRAY[]::TEXT[]))
  ON CONFLICT (tenant_id, branch_id, printer_id, print_type) DO NOTHING;

  DELETE FROM public.printer_menu_categories
  WHERE tenant_id = v_tenant_id
    AND branch_id = p_branch_id
    AND printer_id = v_printer_id;

  IF COALESCE(array_length(p_category_ids, 1), 0) > 0 THEN
    DELETE FROM public.printer_menu_categories
    WHERE tenant_id = v_tenant_id
      AND branch_id = p_branch_id
      AND category_id = ANY(p_category_ids);

    INSERT INTO public.printer_menu_categories (
      tenant_id,
      branch_id,
      printer_id,
      category_id
    )
    SELECT DISTINCT v_tenant_id, p_branch_id, v_printer_id, x.category_id
    FROM unnest(p_category_ids) AS x(category_id)
    ON CONFLICT (tenant_id, branch_id, category_id) DO UPDATE
      SET printer_id = EXCLUDED.printer_id;
  END IF;

  RETURN v_printer_id;
END;
$$;

-- public.enqueue_cancel_ticket_print
CREATE OR REPLACE FUNCTION public.enqueue_cancel_ticket_print(p_order_item_id bigint, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid           UUID;
  v_item          public.order_items%ROWTYPE;
  v_order         public.orders%ROWTYPE;
  v_table_no      INT;
  v_slot          SMALLINT;
  v_printer_id    BIGINT;
  v_category_id   BIGINT;
  v_voided_by     TEXT;
  v_flag_enabled  TEXT;
  v_items_payload JSONB;
  v_payload       JSONB;
  v_idempotency   TEXT;
  v_job_id        BIGINT;
  v_now           TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('pos:send_kitchen') THEN
    RAISE EXCEPTION 'permission denied: pos:send_kitchen' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_cancel_ticket_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'feature_disabled');
  END IF;

  IF v_item.sent_to_kitchen_at IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_sent');
  END IF;

  SELECT mi.category_id INTO v_category_id
  FROM public.menu_items mi
  WHERE mi.id = v_item.menu_item_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.printer_menu_categories pmc
    WHERE pmc.tenant_id = v_order.tenant_id
      AND pmc.branch_id = v_order.branch_id
      AND pmc.category_id = v_category_id
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_slot');
  END IF;

  SELECT p.id, (p.sort_order + 1)::smallint
  INTO v_printer_id, v_slot
  FROM public.printer_menu_categories pmc
  JOIN public.printers p
    ON p.id = pmc.printer_id
   AND p.tenant_id = pmc.tenant_id
   AND p.branch_id = pmc.branch_id
   AND p.is_active = TRUE
  JOIN public.printer_print_types ppt
    ON ppt.printer_id = p.id
   AND ppt.tenant_id = p.tenant_id
   AND ppt.branch_id = p.branch_id
   AND ppt.print_type = 'cancel_ticket'
  WHERE pmc.tenant_id = v_order.tenant_id
    AND pmc.branch_id = v_order.branch_id
    AND pmc.category_id = v_category_id
  ORDER BY p.id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_printer');
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_voided_by
  FROM public.profiles WHERE id = v_uid;

  v_items_payload := jsonb_build_array(jsonb_build_object(
    'item_name',    v_item.item_name,
    'variant_name', v_item.variant_name,
    'quantity',     v_item.quantity,
    'modifiers',    v_item.modifiers,
    'sides',        v_item.sides,
    'note',         v_item.note
  ));

  v_payload := jsonb_build_object(
    'kind',          'cancel_ticket',
    'order_number',  v_order.order_number,
    'order_type',    v_order.order_type,
    'table_number',  v_table_no,
    'slot',          v_slot,
    'items',         v_items_payload,
    'reason',        COALESCE(NULLIF(trim(p_reason), ''), v_item.cancel_reason, ''),
    'voided_by',     COALESCE(v_voided_by, ''),
    'printed_at',    to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                             'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || v_order.id::TEXT
    || ':cancel:' || p_order_item_id::TEXT;

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  ) VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'cancel_ticket',
    v_order.id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'job_id',     v_job_id,
    'printer_id', v_printer_id,
    'slot',       v_slot
  );
END;
$$;

-- public.enqueue_edit_pending_order_item_quantity_print
CREATE OR REPLACE FUNCTION public.enqueue_edit_pending_order_item_quantity_print(p_order_item_id bigint, p_old_quantity integer, p_new_quantity integer, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid             UUID;
  v_item            public.order_items%ROWTYPE;
  v_order           public.orders%ROWTYPE;
  v_table_no        INT;
  v_slot            SMALLINT;
  v_printer_id      BIGINT;
  v_category_id     BIGINT;
  v_staff_name      TEXT;
  v_flag_enabled    TEXT;
  v_delta           INT;
  v_print_type      TEXT;
  v_items_payload   JSONB;
  v_payload         JSONB;
  v_idempotency     TEXT;
  v_job_id          BIGINT;
  v_now             TIMESTAMPTZ := now();
  v_change_note     TEXT;
  v_item_note       TEXT;
  v_event_token     TEXT;
  v_batch_ticket_number TEXT;
  v_batch_send_seq      INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_old_quantity IS NULL OR p_new_quantity IS NULL
     OR p_old_quantity < 1 OR p_new_quantity < 1
  THEN
    RAISE EXCEPTION 'quantity must be >= 1' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('pos:send_kitchen') THEN
    RAISE EXCEPTION 'permission denied: pos:send_kitchen' USING ERRCODE = '42501';
  END IF;

  IF v_item.sent_to_kitchen_at IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_sent');
  END IF;

  IF p_old_quantity = p_new_quantity THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_quantity_change');
  END IF;

  IF p_new_quantity < p_old_quantity THEN
    SELECT value INTO v_flag_enabled
    FROM public.system_settings
    WHERE tenant_id = v_order.tenant_id AND key = 'pos_reduce_qty_enabled';
    IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'feature_disabled');
    END IF;
  END IF;

  SELECT mi.category_id INTO v_category_id
  FROM public.menu_items mi
  WHERE mi.id = v_item.menu_item_id
    AND mi.tenant_id = v_order.tenant_id;

  IF v_category_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_slot');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.printer_menu_categories pmc
    WHERE pmc.tenant_id = v_order.tenant_id
      AND pmc.branch_id = v_order.branch_id
      AND pmc.category_id = v_category_id
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_slot');
  END IF;

  v_delta := abs(p_new_quantity - p_old_quantity);
  v_print_type := CASE
    WHEN p_new_quantity > p_old_quantity THEN 'kitchen_ticket'
    ELSE 'cancel_ticket'
  END;

  SELECT p.id, (p.sort_order + 1)::smallint
  INTO v_printer_id, v_slot
  FROM public.printer_menu_categories pmc
  JOIN public.printers p
    ON p.id = pmc.printer_id
   AND p.tenant_id = pmc.tenant_id
   AND p.branch_id = pmc.branch_id
   AND p.is_active = TRUE
  JOIN public.printer_print_types ppt
    ON ppt.printer_id = p.id
   AND ppt.tenant_id = p.tenant_id
   AND ppt.branch_id = p.branch_id
   AND ppt.print_type = v_print_type
  WHERE pmc.tenant_id = v_order.tenant_id
    AND pmc.branch_id = v_order.branch_id
    AND pmc.category_id = v_category_id
  ORDER BY p.id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_printer');
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_staff_name
  FROM public.profiles WHERE id = v_uid;

  SELECT ksb.kitchen_ticket_number, ksb.send_seq
  INTO v_batch_ticket_number, v_batch_send_seq
  FROM public.kds_tickets kt
  JOIN public.kitchen_send_batches ksb
    ON ksb.id = kt.kitchen_send_batch_id
  WHERE kt.tenant_id = v_order.tenant_id
    AND kt.order_item_id = v_item.id
  ORDER BY ksb.created_at DESC
  LIMIT 1;

  v_change_note := CASE
    WHEN p_new_quantity > p_old_quantity THEN
      'TANG SL ' || p_old_quantity::TEXT || ' -> ' || p_new_quantity::TEXT
    ELSE
      'GIAM SL ' || p_old_quantity::TEXT || ' -> ' || p_new_quantity::TEXT
  END;

  v_item_note := v_change_note
    || CASE
      WHEN NULLIF(trim(COALESCE(v_item.note, '')), '') IS NULL THEN ''
      ELSE ': ' || trim(v_item.note)
    END;

  v_items_payload := jsonb_build_array(jsonb_build_object(
    'item_name',    v_item.item_name,
    'variant_name', v_item.variant_name,
    'quantity',     v_delta,
    'modifiers',    v_item.modifiers,
    'sides',        v_item.sides,
    'note',         v_item_note
  ));

  v_event_token := replace(
    COALESCE(extract(epoch from v_item.updated_at)::NUMERIC(20,6)::TEXT, ''),
    '.',
    ''
  );

  IF p_new_quantity > p_old_quantity THEN
    v_payload := jsonb_build_object(
      'kind',                  'kitchen_ticket',
      'kitchen_ticket_number', COALESCE(v_batch_ticket_number, v_order.order_number),
      'source_order_number',   v_order.order_number,
      'order_number',          v_order.order_number,
      'order_type',            v_order.order_type,
      'table_number',          v_table_no,
      'cashier_name',          COALESCE(v_staff_name, ''),
      'send_seq',              COALESCE(v_batch_send_seq, v_order.kitchen_send_count, 1),
      'send_kind',             'append',
      'slot',                  v_slot,
      'note',                  v_change_note,
      'items',                 v_items_payload,
      'printed_at',            to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                       'YYYY-MM-DD"T"HH24:MI:SS')
    );
  ELSE
    v_payload := jsonb_build_object(
      'kind',         'cancel_ticket',
      'order_number', v_order.order_number,
      'order_type',   v_order.order_type,
      'table_number', v_table_no,
      'slot',         v_slot,
      'items',        v_items_payload,
      'reason',       v_change_note || ': '
                      || COALESCE(NULLIF(trim(p_reason), ''), 'Sua so luong mon'),
      'voided_by',    COALESCE(v_staff_name, ''),
      'printed_at',   to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                              'YYYY-MM-DD"T"HH24:MI:SS')
    );
  END IF;

  v_idempotency := 'order:' || v_order.id::TEXT
    || ':edit-qty:' || p_order_item_id::TEXT
    || ':' || p_old_quantity::TEXT || '->' || p_new_quantity::TEXT
    || ':printer:' || v_printer_id::TEXT
    || ':at:' || v_event_token;

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  ) VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, v_print_type,
    v_order.id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    SELECT id INTO v_job_id
    FROM public.print_jobs
    WHERE idempotency_key = v_idempotency;
  END IF;

  RETURN jsonb_build_object(
    'job_id',     v_job_id,
    'printer_id', v_printer_id,
    'slot',       v_slot,
    'job_type',   v_print_type,
    'delta',      v_delta
  );
END;
$$;

-- public.enqueue_partial_cancel_ticket_print
CREATE OR REPLACE FUNCTION public.enqueue_partial_cancel_ticket_print(p_order_item_id bigint, p_old_quantity integer, p_new_quantity integer, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid             UUID;
  v_item            public.order_items%ROWTYPE;
  v_order           public.orders%ROWTYPE;
  v_table_no        INT;
  v_slot            SMALLINT;
  v_printer_id      BIGINT;
  v_category_id     BIGINT;
  v_voided_by       TEXT;
  v_flag_enabled    TEXT;
  v_items_payload   JSONB;
  v_payload         JSONB;
  v_idempotency     TEXT;
  v_job_id          BIGINT;
  v_now             TIMESTAMPTZ := now();
  v_reason_prefixed TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('pos:send_kitchen') THEN
    RAISE EXCEPTION 'permission denied: pos:send_kitchen' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_reduce_qty_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'feature_disabled');
  END IF;

  IF v_item.sent_to_kitchen_at IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_sent');
  END IF;

  IF p_new_quantity >= p_old_quantity THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_reduction');
  END IF;

  SELECT mi.category_id INTO v_category_id
  FROM public.menu_items mi
  WHERE mi.id = v_item.menu_item_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.printer_menu_categories pmc
    WHERE pmc.tenant_id = v_order.tenant_id
      AND pmc.branch_id = v_order.branch_id
      AND pmc.category_id = v_category_id
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_slot');
  END IF;

  SELECT p.id, (p.sort_order + 1)::smallint
  INTO v_printer_id, v_slot
  FROM public.printer_menu_categories pmc
  JOIN public.printers p
    ON p.id = pmc.printer_id
   AND p.tenant_id = pmc.tenant_id
   AND p.branch_id = pmc.branch_id
   AND p.is_active = TRUE
  JOIN public.printer_print_types ppt
    ON ppt.printer_id = p.id
   AND ppt.tenant_id = p.tenant_id
   AND ppt.branch_id = p.branch_id
   AND ppt.print_type = 'cancel_ticket'
  WHERE pmc.tenant_id = v_order.tenant_id
    AND pmc.branch_id = v_order.branch_id
    AND pmc.category_id = v_category_id
  ORDER BY p.id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_printer');
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_voided_by
  FROM public.profiles WHERE id = v_uid;

  v_items_payload := jsonb_build_array(jsonb_build_object(
    'item_name',     v_item.item_name,
    'variant_name',  v_item.variant_name,
    'quantity',      p_old_quantity - p_new_quantity,
    'modifiers',     v_item.modifiers,
    'sides',         v_item.sides,
    'note',          v_item.note
  ));

  v_reason_prefixed := 'GIAM SL ' || p_old_quantity::TEXT
    || ' -> ' || p_new_quantity::TEXT
    || ': ' || COALESCE(NULLIF(trim(p_reason), ''), '');

  v_payload := jsonb_build_object(
    'kind',          'cancel_ticket',
    'order_number',  v_order.order_number,
    'order_type',    v_order.order_type,
    'table_number',  v_table_no,
    'slot',          v_slot,
    'items',         v_items_payload,
    'reason',        v_reason_prefixed,
    'voided_by',     COALESCE(v_voided_by, ''),
    'printed_at',    to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                             'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || v_order.id::TEXT
    || ':reduce:' || p_order_item_id::TEXT
    || ':' || p_old_quantity::TEXT || '->' || p_new_quantity::TEXT;

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  ) VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'cancel_ticket',
    v_order.id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'job_id',     v_job_id,
    'printer_id', v_printer_id,
    'slot',       v_slot
  );
END;
$$;

-- private.enqueue_kitchen_completion_print_internal
CREATE OR REPLACE FUNCTION private.enqueue_kitchen_completion_print_internal(p_branch_id bigint, p_ticket_ids bigint[], p_actor uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET join_collapse_limit TO '1'
    SET from_collapse_limit TO '1'
    AS $$
DECLARE
  v_ticket_ids bigint[] := ARRAY[]::bigint[];
  v_requested_count integer := 0;
  v_printed_ticket_count integer := 0;
  v_route record;
  v_payload jsonb;
  v_idempotency text;
  v_job_id bigint;
  v_jobs jsonb := '[]'::jsonb;
BEGIN
  SELECT COALESCE(
    array_agg(DISTINCT ticket_id),
    ARRAY[]::bigint[]
  )
  INTO v_ticket_ids
  FROM unnest(
    COALESCE(p_ticket_ids, ARRAY[]::bigint[])
  ) AS input(ticket_id)
  WHERE ticket_id IS NOT NULL
    AND ticket_id > 0;

  v_requested_count := COALESCE(array_length(v_ticket_ids, 1), 0);

  IF v_requested_count = 0 THEN
    RETURN jsonb_build_object(
      'jobs', v_jobs,
      'requested_ticket_count', 0,
      'printed_ticket_count', 0,
      'skipped_ticket_count', 0
    );
  END IF;

  FOR v_route IN
    WITH routed_items AS (
      SELECT
        ticket.id AS ticket_id,
        ticket.order_id,
        ticket.order_item_id,
        orders.tenant_id,
        orders.branch_id,
        orders.order_number,
        orders.order_type,
        orders.note AS order_note,
        dining_table.number AS table_number,
        COALESCE(profile.full_name, '') AS cashier_name,
        printer.id AS printer_id,
        printer.role AS printer_role,
        (printer.sort_order + 1)::smallint AS slot,
        COALESCE(
          batch.kitchen_ticket_number,
          orders.order_number
        ) AS kitchen_ticket_number,
        COALESCE(batch.send_seq, orders.kitchen_send_count) AS send_seq,
        COALESCE(batch.kind, 'manual') AS send_kind,
        jsonb_build_object(
          'order_item_id', item.id,
          'ticket_id', ticket.id,
          'item_name', item.item_name,
          'variant_name', item.variant_name,
          'quantity', item.quantity,
          'modifiers', item.modifiers,
          'sides', item.sides,
          'note', item.note
        ) AS item_payload
      FROM public.kds_tickets ticket
      JOIN public.order_items item
        ON item.tenant_id = ticket.tenant_id
       AND item.id = ticket.order_item_id
      JOIN public.orders orders
        ON orders.tenant_id = ticket.tenant_id
       AND orders.id = ticket.order_id
      LEFT JOIN public.tables dining_table
        ON dining_table.id = orders.table_id
      LEFT JOIN public.profiles profile
        ON profile.id = orders.created_by
      JOIN public.menu_items menu_item
        ON menu_item.id = item.menu_item_id
      JOIN LATERAL (
        SELECT
          candidate.id,
          candidate.role
        FROM public.printers candidate
        JOIN public.printer_print_types print_type
          ON print_type.printer_id = candidate.id
         AND print_type.tenant_id = candidate.tenant_id
         AND print_type.branch_id = candidate.branch_id
         AND print_type.print_type = 'kitchen_ticket'
        LEFT JOIN public.printer_menu_categories route
          ON route.printer_id = candidate.id
         AND route.tenant_id = candidate.tenant_id
         AND route.branch_id = candidate.branch_id
         AND route.category_id = menu_item.category_id
        WHERE candidate.tenant_id = orders.tenant_id
          AND candidate.branch_id = orders.branch_id
          AND candidate.is_active IS TRUE
          AND (
            route.id IS NOT NULL
            OR NOT EXISTS (
              SELECT 1
              FROM public.printer_menu_categories route_any
              WHERE route_any.tenant_id = orders.tenant_id
                AND route_any.branch_id = orders.branch_id
                AND route_any.category_id = menu_item.category_id
            )
          )
        ORDER BY
          CASE WHEN route.id IS NOT NULL THEN 0 ELSE 1 END,
          candidate.sort_order,
          candidate.id
        LIMIT 1
      ) printer ON true
      LEFT JOIN public.kitchen_send_batches batch
        ON batch.id = ticket.kitchen_send_batch_id
      WHERE ticket.id = ANY(v_ticket_ids)
        AND ticket.branch_id = p_branch_id
        AND item.sent_to_kitchen_at IS NULL
    ),
    grouped_routes AS (
      SELECT
        tenant_id,
        branch_id,
        order_id,
        printer_id,
        printer_role,
        slot,
        kitchen_ticket_number,
        order_number,
        order_type,
        table_number,
        cashier_name,
        send_seq,
        send_kind,
        order_note,
        array_agg(order_item_id ORDER BY order_item_id) AS item_ids,
        array_agg(ticket_id ORDER BY order_item_id) AS ticket_ids,
        jsonb_agg(item_payload ORDER BY order_item_id) AS items
      FROM routed_items
      GROUP BY
        tenant_id,
        branch_id,
        order_id,
        printer_id,
        printer_role,
        slot,
        kitchen_ticket_number,
        order_number,
        order_type,
        table_number,
        cashier_name,
        send_seq,
        send_kind,
        order_note
    )
    SELECT *
    FROM grouped_routes
    ORDER BY order_id, printer_role, printer_id
  LOOP
    v_job_id := NULL;

    v_payload := jsonb_build_object(
      'kind', 'kitchen_ticket',
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'source_order_number', v_route.order_number,
      'order_number', v_route.order_number,
      'order_type', v_route.order_type,
      'table_number', v_route.table_number,
      'cashier_name', v_route.cashier_name,
      'send_seq', v_route.send_seq,
      'send_kind', v_route.send_kind,
      'slot', v_route.slot,
      'note', v_route.order_note,
      'order_item_ids', to_jsonb(v_route.item_ids),
      'ticket_ids', to_jsonb(v_route.ticket_ids),
      'items', v_route.items,
      'printed_at', to_char(
        now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
        'YYYY-MM-DD"T"HH24:MI:SS'
      )
    );

    v_idempotency := 'order:' || v_route.order_id::text
      || ':kds-complete:printer:' || v_route.printer_id::text
      || ':tickets:' || md5(array_to_string(v_route.ticket_ids, ','));

    INSERT INTO public.print_jobs (
      tenant_id,
      branch_id,
      printer_id,
      job_type,
      order_id,
      payload,
      idempotency_key,
      created_by
    ) VALUES (
      v_route.tenant_id,
      v_route.branch_id,
      v_route.printer_id,
      'kitchen_ticket',
      v_route.order_id,
      v_payload,
      v_idempotency,
      p_actor
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;

    IF v_job_id IS NULL THEN
      SELECT job.id
      INTO v_job_id
      FROM public.print_jobs job
      WHERE job.idempotency_key = v_idempotency;
    END IF;

    UPDATE public.order_items
    SET sent_to_kitchen_at = COALESCE(sent_to_kitchen_at, now())
    WHERE id = ANY(v_route.item_ids)
      AND sent_to_kitchen_at IS NULL;

    v_printed_ticket_count := v_printed_ticket_count
      + COALESCE(array_length(v_route.ticket_ids, 1), 0);

    v_jobs := v_jobs || jsonb_build_object(
      'printer_id', v_route.printer_id,
      'job_id', v_job_id,
      'item_count', jsonb_array_length(v_route.items),
      'ticket_count', COALESCE(
        array_length(v_route.ticket_ids, 1),
        0
      ),
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'send_seq', v_route.send_seq
    );
  END LOOP;

  RETURN jsonb_build_object(
    'jobs', v_jobs,
    'requested_ticket_count', v_requested_count,
    'printed_ticket_count', v_printed_ticket_count,
    'skipped_ticket_count', GREATEST(
      v_requested_count - v_printed_ticket_count,
      0
    )
  );
END;
$$;

-- private.enqueue_kitchen_print_internal
CREATE OR REPLACE FUNCTION private.enqueue_kitchen_print_internal(p_order_id bigint, p_actor_override uuid DEFAULT NULL::uuid, p_enforce_request_auth boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_request_uid            UUID;
  v_uid                    UUID;
  v_order                  public.orders%ROWTYPE;
  v_table_no               INT;
  v_cashier_name           TEXT;
  v_route                  RECORD;
  v_payload                JSONB;
  v_idempotency            TEXT;
  v_job_id                 BIGINT;
  v_jobs                   JSONB := '[]'::jsonb;
  v_mapped_pending         INT;
  v_null_batch_pending     INT;
  v_fallback_batch_id      BIGINT;
  v_fallback_ticket_number TEXT;
  v_fallback_send_seq      INT;
  v_fallback_kind          TEXT;
  v_ticket_seq             INT;
  v_order_number_clean     TEXT;
  v_order_number_match     TEXT[];
  v_ticket_base            TEXT;
BEGIN
  v_request_uid := auth.uid();

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_enforce_request_auth THEN
    IF v_request_uid IS NULL THEN
      RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
    END IF;

    IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
      RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission_any('pos:send_kitchen') THEN
      RAISE EXCEPTION 'permission denied: pos:send_kitchen' USING ERRCODE = '42501';
    END IF;

    v_uid := v_request_uid;
  ELSE
    v_uid := COALESCE(p_actor_override, v_request_uid, v_order.created_by);
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
    END IF;
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_order.created_by;

  SELECT COUNT(*)
  INTO v_mapped_pending
  FROM public.order_items oi
  JOIN public.menu_items mi ON mi.id = oi.menu_item_id
  JOIN public.printer_menu_categories pmc
    ON pmc.category_id = mi.category_id
   AND pmc.tenant_id = v_order.tenant_id
   AND pmc.branch_id = v_order.branch_id
  WHERE oi.order_id = p_order_id
    AND oi.sent_to_kitchen_at IS NULL;

  IF v_mapped_pending = 0 THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id,
      'send_seq', v_order.kitchen_send_count,
      'jobs', v_jobs
    );
  END IF;

  SELECT COUNT(*)
  INTO v_null_batch_pending
  FROM public.order_items oi
  JOIN public.menu_items mi ON mi.id = oi.menu_item_id
  JOIN public.printer_menu_categories pmc
    ON pmc.category_id = mi.category_id
   AND pmc.tenant_id = v_order.tenant_id
   AND pmc.branch_id = v_order.branch_id
  LEFT JOIN public.kds_tickets kt
    ON kt.tenant_id = v_order.tenant_id
   AND kt.order_item_id = oi.id
  LEFT JOIN public.kitchen_send_batches ksb
    ON ksb.id = kt.kitchen_send_batch_id
  WHERE oi.order_id = p_order_id
    AND oi.sent_to_kitchen_at IS NULL
    AND ksb.id IS NULL;

  IF v_null_batch_pending > 0 THEN
    SELECT ksb.id, ksb.kitchen_ticket_number, ksb.send_seq, ksb.kind
    INTO v_fallback_batch_id, v_fallback_ticket_number, v_fallback_send_seq, v_fallback_kind
    FROM public.order_items oi
    JOIN public.kds_tickets kt
      ON kt.tenant_id = v_order.tenant_id
     AND kt.order_item_id = oi.id
    JOIN public.kitchen_send_batches ksb
      ON ksb.id = kt.kitchen_send_batch_id
    WHERE oi.order_id = p_order_id
      AND oi.sent_to_kitchen_at IS NULL
    ORDER BY ksb.created_at DESC, ksb.id DESC
    LIMIT 1;

    IF v_fallback_batch_id IS NULL THEN
      UPDATE public.orders
         SET kitchen_send_count = kitchen_send_count + 1
       WHERE id = p_order_id
       RETURNING kitchen_send_count INTO v_fallback_send_seq;

      INSERT INTO public.kitchen_daily_counters (
        tenant_id, branch_id, counter_date, last_seq
      )
      VALUES (
        v_order.tenant_id,
        v_order.branch_id,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
        1
      )
      ON CONFLICT (tenant_id, branch_id, counter_date)
      DO UPDATE SET
        last_seq = public.kitchen_daily_counters.last_seq + 1,
        updated_at = now()
      RETURNING last_seq INTO v_ticket_seq;

      v_order_number_clean := regexp_replace(
        btrim(COALESCE(v_order.order_number, '')),
        '^#+',
        ''
      );
      v_order_number_match := regexp_match(
        v_order_number_clean,
        '^(?:TC|MV)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,5})(?:-.+)?$',
        'i'
      );
      v_ticket_base := COALESCE(
        v_order_number_match[1],
        NULLIF(v_order_number_clean, ''),
        p_order_id::TEXT
      );
      v_fallback_ticket_number := '#' || v_ticket_base
        || CASE
             WHEN v_fallback_send_seq > 1
               THEN '-' || v_fallback_send_seq::TEXT
             ELSE ''
           END;
      v_fallback_kind := CASE WHEN v_fallback_send_seq = 1 THEN 'initial' ELSE 'append' END;

      INSERT INTO public.kitchen_send_batches (
        tenant_id, branch_id, order_id, counter_date, ticket_seq,
        kitchen_ticket_number, send_seq, kind, created_by
      )
      VALUES (
        v_order.tenant_id,
        v_order.branch_id,
        p_order_id,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
        v_ticket_seq,
        v_fallback_ticket_number,
        v_fallback_send_seq,
        v_fallback_kind,
        v_uid
      )
      RETURNING id INTO v_fallback_batch_id;
    END IF;

    UPDATE public.kds_tickets kt
       SET kitchen_send_batch_id = v_fallback_batch_id,
           updated_at = now()
      FROM public.order_items oi
      JOIN public.menu_items mi ON mi.id = oi.menu_item_id
      JOIN public.printer_menu_categories pmc
        ON pmc.category_id = mi.category_id
       AND pmc.tenant_id = v_order.tenant_id
       AND pmc.branch_id = v_order.branch_id
     WHERE kt.tenant_id = v_order.tenant_id
       AND kt.order_item_id = oi.id
       AND oi.order_id = p_order_id
       AND oi.sent_to_kitchen_at IS NULL
       AND kt.kitchen_send_batch_id IS NULL;
  END IF;

  FOR v_route IN
    WITH routed_items AS (
      SELECT
        p.id AS printer_id,
        p.role AS printer_role,
        (p.sort_order + 1)::smallint AS slot,
        COALESCE(ksb.id, v_fallback_batch_id) AS batch_id,
        COALESCE(ksb.kitchen_ticket_number, v_fallback_ticket_number) AS kitchen_ticket_number,
        COALESCE(ksb.send_seq, v_fallback_send_seq) AS send_seq,
        COALESCE(ksb.kind, v_fallback_kind) AS send_kind,
        COALESCE(ksb.created_at, now()) AS batch_created_at,
        oi.id AS order_item_id,
        jsonb_build_object(
          'item_name',    oi.item_name,
          'variant_name', oi.variant_name,
          'quantity',     oi.quantity,
          'modifiers',    oi.modifiers,
          'sides',        oi.sides,
          'note',         oi.note
        ) AS item_payload
      FROM public.order_items oi
      JOIN public.menu_items mi ON mi.id = oi.menu_item_id
      JOIN public.printer_menu_categories pmc
        ON pmc.category_id = mi.category_id
       AND pmc.tenant_id = v_order.tenant_id
       AND pmc.branch_id = v_order.branch_id
      JOIN public.printers p
        ON p.id = pmc.printer_id
       AND p.tenant_id = pmc.tenant_id
       AND p.branch_id = pmc.branch_id
       AND p.is_active = TRUE
      JOIN public.printer_print_types ppt
        ON ppt.printer_id = p.id
       AND ppt.tenant_id = p.tenant_id
       AND ppt.branch_id = p.branch_id
       AND ppt.print_type = 'kitchen_ticket'
      LEFT JOIN public.kds_tickets kt
        ON kt.tenant_id = v_order.tenant_id
       AND kt.order_item_id = oi.id
      LEFT JOIN public.kitchen_send_batches ksb
        ON ksb.id = kt.kitchen_send_batch_id
      WHERE oi.order_id = p_order_id
        AND oi.sent_to_kitchen_at IS NULL
    ),
    grouped_routes AS (
      SELECT
        printer_id,
        printer_role,
        slot,
        batch_id,
        kitchen_ticket_number,
        send_seq,
        send_kind,
        batch_created_at,
        array_agg(order_item_id ORDER BY order_item_id) AS item_ids,
        jsonb_agg(item_payload ORDER BY order_item_id) AS items
      FROM routed_items
      GROUP BY
        printer_id,
        printer_role,
        slot,
        batch_id,
        kitchen_ticket_number,
        send_seq,
        send_kind,
        batch_created_at
    )
    SELECT
      gr.*,
      EXISTS (
        SELECT 1
        FROM public.order_items sent_oi
        JOIN public.kds_tickets sent_kt
          ON sent_kt.tenant_id = v_order.tenant_id
         AND sent_kt.order_item_id = sent_oi.id
        WHERE sent_oi.order_id = p_order_id
          AND sent_oi.sent_to_kitchen_at IS NOT NULL
          AND sent_kt.kitchen_send_batch_id = gr.batch_id
      ) AS batch_has_sent_items
    FROM grouped_routes gr
    ORDER BY gr.batch_created_at, gr.printer_role, gr.printer_id
  LOOP
    v_job_id := NULL;

    v_payload := jsonb_build_object(
      'kind',                  'kitchen_ticket',
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'source_order_number',   v_order.order_number,
      'order_number',          v_order.order_number,
      'order_type',            v_order.order_type,
      'table_number',          v_table_no,
      'cashier_name',          COALESCE(v_cashier_name, ''),
      'send_seq',              v_route.send_seq,
      'send_kind',             CASE
                                  WHEN v_route.batch_has_sent_items THEN 'append'
                                  ELSE v_route.send_kind
                                END,
      'slot',                  v_route.slot,
      'note',                  v_order.note,
      'items',                 v_route.items,
      'printed_at',            to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                       'YYYY-MM-DD"T"HH24:MI:SS')
    );

    v_idempotency := 'order:' || p_order_id::TEXT
      || ':kitchen:printer:' || v_route.printer_id::TEXT
      || ':batch:' || v_route.batch_id::TEXT
      || ':items:' || md5(array_to_string(v_route.item_ids, ','));

    INSERT INTO public.print_jobs (
      tenant_id, branch_id, printer_id, job_type,
      order_id, payload, idempotency_key, created_by
    )
    VALUES (
      v_order.tenant_id, v_order.branch_id, v_route.printer_id, 'kitchen_ticket',
      p_order_id, v_payload, v_idempotency, v_uid
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;

    IF v_job_id IS NULL THEN
      SELECT id INTO v_job_id
      FROM public.print_jobs
      WHERE idempotency_key = v_idempotency;
    END IF;

    UPDATE public.order_items
       SET sent_to_kitchen_at = now()
     WHERE id = ANY(v_route.item_ids)
       AND sent_to_kitchen_at IS NULL;

    v_jobs := v_jobs || jsonb_build_object(
      'slot', v_route.slot,
      'printer_id', v_route.printer_id,
      'job_id', v_job_id,
      'item_count', jsonb_array_length(v_route.items),
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'send_seq', v_route.send_seq
    );
  END LOOP;

  IF jsonb_array_length(v_jobs) = 0 THEN
    RAISE EXCEPTION 'no active kitchen printer for branch %', v_order.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'send_seq', COALESCE(v_fallback_send_seq, v_order.kitchen_send_count),
    'jobs', v_jobs
  );
END;
$_$;

-- public.route_order_to_kds
CREATE OR REPLACE FUNCTION public.route_order_to_kds(p_order_id bigint) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_station_id BIGINT;
  v_has_printer_route BOOLEAN := FALSE;
  v_batch_id BIGINT;
  v_send_seq INT;
  v_ticket_seq INT;
  v_order_number_clean TEXT;
  v_order_number_match TEXT[];
  v_ticket_base TEXT;
  v_ticket_number TEXT;
  v_ticket_id BIGINT;
  v_table_no INT;
  v_cashier_name TEXT;
  v_route RECORD;
  v_payload JSONB;
  v_idempotency TEXT;
  v_job_id BIGINT;
  v_unrouted INT;
BEGIN
  SELECT tenant_id, branch_id, order_number, order_type, note, created_by,
         table_id, kitchen_send_count
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = public.auth_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_item IN
    SELECT oi.id AS order_item_id, mi.category_id
    FROM public.order_items oi
    JOIN public.menu_items mi
      ON mi.id = oi.menu_item_id
     AND mi.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.sent_to_kitchen_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_tickets kt
        WHERE kt.tenant_id = v_order.tenant_id
          AND kt.order_item_id = oi.id
      )
    ORDER BY oi.id
  LOOP
    v_station_id := NULL;
    v_has_printer_route := FALSE;

    SELECT sc.station_id INTO v_station_id
    FROM public.kds_station_categories sc
    JOIN public.kds_stations s ON s.id = sc.station_id
    WHERE sc.category_id = v_item.category_id
      AND s.branch_id = v_order.branch_id
      AND s.tenant_id = v_order.tenant_id
      AND s.is_active = TRUE
    ORDER BY s.position, s.id
    LIMIT 1;

    SELECT EXISTS (
      SELECT 1
      FROM public.printers p
      JOIN public.printer_print_types ppt
        ON ppt.printer_id = p.id
       AND ppt.tenant_id = p.tenant_id
       AND ppt.branch_id = p.branch_id
       AND ppt.print_type = 'kitchen_ticket'
      LEFT JOIN public.printer_menu_categories pmc
        ON pmc.printer_id = p.id
       AND pmc.tenant_id = p.tenant_id
       AND pmc.branch_id = p.branch_id
       AND pmc.category_id = v_item.category_id
      WHERE p.tenant_id = v_order.tenant_id
        AND p.branch_id = v_order.branch_id
        AND p.is_active = TRUE
        AND (
          pmc.id IS NOT NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.printer_menu_categories pmc_any
            WHERE pmc_any.tenant_id = v_order.tenant_id
              AND pmc_any.branch_id = v_order.branch_id
              AND pmc_any.category_id = v_item.category_id
          )
        )
    ) INTO v_has_printer_route;

    IF v_station_id IS NULL AND v_has_printer_route THEN
      CONTINUE;
    END IF;

    IF v_station_id IS NOT NULL THEN
      IF v_batch_id IS NULL THEN
        UPDATE public.orders
           SET kitchen_send_count = kitchen_send_count + 1
         WHERE id = p_order_id
         RETURNING kitchen_send_count INTO v_send_seq;

        INSERT INTO public.kitchen_daily_counters (
          tenant_id, branch_id, counter_date, last_seq
        )
        VALUES (
          v_order.tenant_id,
          v_order.branch_id,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
          1
        )
        ON CONFLICT (tenant_id, branch_id, counter_date)
        DO UPDATE SET
          last_seq = public.kitchen_daily_counters.last_seq + 1,
          updated_at = now()
        RETURNING last_seq INTO v_ticket_seq;

        v_order_number_clean := regexp_replace(
          btrim(COALESCE(v_order.order_number, '')),
          '^#+',
          ''
        );
        v_order_number_match := regexp_match(
          v_order_number_clean,
          '^(?:TC|MV)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,5})(?:-.+)?$',
          'i'
        );
        v_ticket_base := COALESCE(
          v_order_number_match[1],
          NULLIF(v_order_number_clean, ''),
          p_order_id::TEXT
        );
        v_ticket_number := '#' || v_ticket_base
          || CASE WHEN v_send_seq > 1 THEN '-' || v_send_seq::TEXT ELSE '' END;

        INSERT INTO public.kitchen_send_batches (
          tenant_id, branch_id, order_id, counter_date, ticket_seq,
          kitchen_ticket_number, send_seq, kind, created_by
        )
        VALUES (
          v_order.tenant_id,
          v_order.branch_id,
          p_order_id,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
          v_ticket_seq,
          v_ticket_number,
          v_send_seq,
          CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
          auth.uid()
        )
        RETURNING id INTO v_batch_id;
      END IF;

      INSERT INTO public.kds_tickets (
        tenant_id, branch_id, station_id, order_id, order_item_id,
        kitchen_send_batch_id
      )
      VALUES (
        v_order.tenant_id, v_order.branch_id, v_station_id,
        p_order_id, v_item.order_item_id, v_batch_id
      )
      ON CONFLICT (order_item_id, station_id, tenant_id) DO NOTHING
      RETURNING id INTO v_ticket_id;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.menu_items mi
      ON mi.id = oi.menu_item_id
     AND mi.tenant_id = oi.tenant_id
    JOIN LATERAL (
      SELECT p.id AS printer_id
      FROM public.printers p
      JOIN public.printer_print_types ppt
        ON ppt.printer_id = p.id
       AND ppt.tenant_id = p.tenant_id
       AND ppt.branch_id = p.branch_id
       AND ppt.print_type = 'kitchen_ticket'
      LEFT JOIN public.printer_menu_categories pmc
        ON pmc.printer_id = p.id
       AND pmc.tenant_id = p.tenant_id
       AND pmc.branch_id = p.branch_id
       AND pmc.category_id = mi.category_id
      WHERE p.tenant_id = v_order.tenant_id
        AND p.branch_id = v_order.branch_id
        AND p.is_active = TRUE
        AND (
          pmc.id IS NOT NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.printer_menu_categories pmc_any
            WHERE pmc_any.tenant_id = v_order.tenant_id
              AND pmc_any.branch_id = v_order.branch_id
              AND pmc_any.category_id = mi.category_id
          )
        )
      ORDER BY
        CASE WHEN pmc.id IS NOT NULL THEN 0 ELSE 1 END,
        p.sort_order, p.id
      LIMIT 1
    ) pr ON TRUE
    WHERE oi.order_id = p_order_id
      AND oi.sent_to_kitchen_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_tickets kt
        WHERE kt.tenant_id = v_order.tenant_id
          AND kt.order_item_id = oi.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_station_categories sc
        JOIN public.kds_stations s ON s.id = sc.station_id
        WHERE sc.category_id = mi.category_id
          AND s.branch_id = v_order.branch_id
          AND s.tenant_id = v_order.tenant_id
          AND s.is_active = TRUE
      )
    LIMIT 1
  ) THEN
    IF v_batch_id IS NULL THEN
      UPDATE public.orders
         SET kitchen_send_count = kitchen_send_count + 1
       WHERE id = p_order_id
       RETURNING kitchen_send_count INTO v_send_seq;

      INSERT INTO public.kitchen_daily_counters (
        tenant_id, branch_id, counter_date, last_seq
      )
      VALUES (
        v_order.tenant_id,
        v_order.branch_id,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
        1
      )
      ON CONFLICT (tenant_id, branch_id, counter_date)
      DO UPDATE SET
        last_seq = public.kitchen_daily_counters.last_seq + 1,
        updated_at = now()
      RETURNING last_seq INTO v_ticket_seq;

      v_order_number_clean := regexp_replace(
        btrim(COALESCE(v_order.order_number, '')),
        '^#+',
        ''
      );
      v_order_number_match := regexp_match(
        v_order_number_clean,
        '^(?:TC|MV)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,5})(?:-.+)?$',
        'i'
      );
      v_ticket_base := COALESCE(
        v_order_number_match[1],
        NULLIF(v_order_number_clean, ''),
        p_order_id::TEXT
      );
      v_ticket_number := '#' || v_ticket_base
        || CASE WHEN v_send_seq > 1 THEN '-' || v_send_seq::TEXT ELSE '' END;

      INSERT INTO public.kitchen_send_batches (
        tenant_id, branch_id, order_id, counter_date, ticket_seq,
        kitchen_ticket_number, send_seq, kind, created_by
      )
      VALUES (
        v_order.tenant_id,
        v_order.branch_id,
        p_order_id,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
        v_ticket_seq,
        v_ticket_number,
        v_send_seq,
        CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
        auth.uid()
      )
      RETURNING id INTO v_batch_id;
    ELSE
      SELECT kitchen_ticket_number, send_seq
        INTO v_ticket_number, v_send_seq
      FROM public.kitchen_send_batches
      WHERE id = v_batch_id;
    END IF;

    IF v_order.table_id IS NOT NULL THEN
      SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
    END IF;

    SELECT full_name INTO v_cashier_name
    FROM public.profiles WHERE id = v_order.created_by;

    FOR v_route IN
      WITH routed_items AS (
        SELECT
          pr.printer_id,
          pr.printer_role,
          pr.slot,
          oi.id AS order_item_id,
          jsonb_build_object(
            'item_name', oi.item_name,
            'variant_name', oi.variant_name,
            'quantity', oi.quantity,
            'modifiers', oi.modifiers,
            'sides', oi.sides,
            'note', oi.note
          ) AS item_payload
        FROM public.order_items oi
        JOIN public.menu_items mi
          ON mi.id = oi.menu_item_id
         AND mi.tenant_id = oi.tenant_id
        JOIN LATERAL (
          SELECT
            p.id AS printer_id,
            p.role AS printer_role,
            (p.sort_order + 1)::smallint AS slot
          FROM public.printers p
          JOIN public.printer_print_types ppt
            ON ppt.printer_id = p.id
           AND ppt.tenant_id = p.tenant_id
           AND ppt.branch_id = p.branch_id
           AND ppt.print_type = 'kitchen_ticket'
          LEFT JOIN public.printer_menu_categories pmc
            ON pmc.printer_id = p.id
           AND pmc.tenant_id = p.tenant_id
           AND pmc.branch_id = p.branch_id
           AND pmc.category_id = mi.category_id
          WHERE p.tenant_id = v_order.tenant_id
            AND p.branch_id = v_order.branch_id
            AND p.is_active = TRUE
            AND (
              pmc.id IS NOT NULL
              OR NOT EXISTS (
                SELECT 1
                FROM public.printer_menu_categories pmc_any
                WHERE pmc_any.tenant_id = v_order.tenant_id
                  AND pmc_any.branch_id = v_order.branch_id
                  AND pmc_any.category_id = mi.category_id
              )
            )
          ORDER BY
            CASE WHEN pmc.id IS NOT NULL THEN 0 ELSE 1 END,
            p.sort_order, p.id
          LIMIT 1
        ) pr ON TRUE
        WHERE oi.order_id = p_order_id
          AND oi.sent_to_kitchen_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.kds_tickets kt
            WHERE kt.tenant_id = v_order.tenant_id
              AND kt.order_item_id = oi.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.kds_station_categories sc
            JOIN public.kds_stations s ON s.id = sc.station_id
            WHERE sc.category_id = mi.category_id
              AND s.branch_id = v_order.branch_id
              AND s.tenant_id = v_order.tenant_id
              AND s.is_active = TRUE
          )
      ),
      grouped_routes AS (
        SELECT
          printer_id,
          printer_role,
          slot,
          array_agg(order_item_id ORDER BY order_item_id) AS item_ids,
          jsonb_agg(item_payload ORDER BY order_item_id) AS items
        FROM routed_items
        GROUP BY printer_id, printer_role, slot
      )
      SELECT *
      FROM grouped_routes
      ORDER BY printer_role, printer_id
    LOOP
      v_job_id := NULL;

      v_payload := jsonb_build_object(
        'kind', 'kitchen_ticket',
        'kitchen_ticket_number', v_ticket_number,
        'source_order_number', v_order.order_number,
        'order_number', v_order.order_number,
        'order_type', v_order.order_type,
        'table_number', v_table_no,
        'cashier_name', COALESCE(v_cashier_name, ''),
        'send_seq', v_send_seq,
        'send_kind', CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
        'slot', v_route.slot,
        'note', v_order.note,
        'items', v_route.items,
        'printed_at', to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
                              'YYYY-MM-DD"T"HH24:MI:SS')
      );

      v_idempotency := 'order:' || p_order_id::TEXT
        || ':non-kds-dispatch:printer:' || v_route.printer_id::TEXT
        || ':batch:' || v_batch_id::TEXT
        || ':items:' || md5(array_to_string(v_route.item_ids, ','));

      INSERT INTO public.print_jobs (
        tenant_id, branch_id, printer_id, job_type,
        order_id, payload, idempotency_key, created_by
      )
      VALUES (
        v_order.tenant_id, v_order.branch_id, v_route.printer_id,
        'kitchen_ticket', p_order_id, v_payload, v_idempotency, auth.uid()
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id INTO v_job_id;

      IF v_job_id IS NULL THEN
        SELECT id INTO v_job_id
        FROM public.print_jobs
        WHERE idempotency_key = v_idempotency;
      END IF;

      UPDATE public.order_items
         SET sent_to_kitchen_at = COALESCE(sent_to_kitchen_at, now())
       WHERE id = ANY(v_route.item_ids)
         AND sent_to_kitchen_at IS NULL;
    END LOOP;
  END IF;

  SELECT count(*)::int INTO v_unrouted
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled'
    AND oi.sent_to_kitchen_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.kds_tickets kt
      WHERE kt.tenant_id = v_order.tenant_id
        AND kt.order_item_id = oi.id
    );

  IF v_unrouted > 0 THEN
    RAISE EXCEPTION 'kds_no_route: order % has % unroutable item(s)',
      p_order_id, v_unrouted
      USING ERRCODE = '22023';
  END IF;
END;
$_$;


--
-- Name: FUNCTION route_order_to_kds(p_order_id bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.route_order_to_kds(p_order_id bigint) IS $$Routes explicit KDS categories to KDS tickets; otherwise queues kitchen printer jobs from category-specific or default kitchen printer routing. Missing KDS and printer routing fails loud.$$;
$migration_20260729140600$::text)
    ) AS expected(version, name, source_sql)
  LOOP
    UPDATE supabase_migrations.schema_migrations
    SET statements = ARRAY[migration.source_sql]::text[]
    WHERE version = migration.version
      AND name = migration.name
      AND (statements IS NULL OR cardinality(statements) = 0);

    IF NOT EXISTS (
      SELECT 1
      FROM supabase_migrations.schema_migrations
      WHERE version = migration.version
        AND name = migration.name
        AND cardinality(statements) = 1
        AND md5(statements[1]) = md5(migration.source_sql)
    ) THEN
      RAISE EXCEPTION 'preview_migration_lineage_mismatch:%', migration.version;
    END IF;
  END LOOP;
END
$repair$;
