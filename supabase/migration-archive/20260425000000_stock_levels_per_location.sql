-- =============================================================
-- Stock Levels Per-Location (Branch Kitchen Split)
--
-- BEFORE: stock_levels keyed by (ingredient, branch, tenant) — one row per
-- branch; Kho CN + Bếp CN shared the same balance. `stock_issue(kitchen_use)`
-- was used as a workaround to "consume" from warehouse when issuing to
-- kitchen, treating the transfer as consumption even though the goods still
-- existed physically.
--
-- AFTER: stock_levels keyed by (ingredient, branch, location, tenant). Each
-- Branch has two independent balances (warehouse row + kitchen row). The
-- ledger (stock_movements) has always been location-aware since phase 2;
-- this migration finally makes the balance table agree with it.
--
-- Decisions (from 4-agent debate 2026-04-23):
--   • Transfer Kho CN → Bếp CN uses 1-step state machine (draft → received).
--   • Reverse Bếp CN → Kho CN allowed (no DB restriction; direction trigger
--     skips intra-branch).
--   • `stock_issue.issue_type='kitchen_use'` is RETIRED — BEFORE INSERT
--     trigger rejects new rows. History remains readable.
--   • Dev env only — no backfill/dual-read/cutover. Big-bang.
--
-- Scope of this migration:
--   1. Drop old stock_levels unique key (ingredient, branch, tenant)
--   2. Seed zero-qty stock_levels rows for Branch kitchen locations
--   3. Add new unique key (ingredient, branch, location, tenant) + NOT NULL
--   4. Backfill any remaining NULL location_ids on stock_movements
--   5. Rewrite trg_update_stock_on_movement to upsert by location
--   6. Retire kitchen_use stock_issue via reject trigger
--   7. Rewrite 8 RPCs to read/write stock_levels by location:
--        confirm_goods_receipt_note
--        stock_transfer_confirm_ship (intra-branch WAC fix)
--        stock_transfer_receive
--        confirm_stock_issue (also fixes pre-existing double-decrement bug)
--        consume_stock_for_order
--        consume_stock_for_order_service
--        confirm_production_order
--        complete_stocktake
-- =============================================================

-- ═══════════════════════════════════════════════════════════════
-- PART 1 — Schema: stock_levels keyed by location
-- ═══════════════════════════════════════════════════════════════

-- Drop the auto-upsert trigger first; the function body references the old
-- ON CONFLICT target (ingredient, branch, tenant). We recreate both below.
DROP TRIGGER IF EXISTS trg_stock_movement_update_levels ON public.stock_movements;
DROP FUNCTION IF EXISTS public.trg_update_stock_on_movement();

-- Drop old unique constraint (will be replaced with 4-column version).
ALTER TABLE public.stock_levels
  DROP CONSTRAINT IF EXISTS stock_levels_ingredient_id_branch_id_tenant_id_key;

-- Safety backfill: any stock_levels row still missing location_id gets the
-- branch's default_receive location. Phase-2 migrations already did this,
-- so normally this is a no-op.
UPDATE public.stock_levels sl
SET location_id = il.id
FROM public.inventory_locations il
WHERE sl.location_id IS NULL
  AND il.branch_id = sl.branch_id
  AND il.tenant_id = sl.tenant_id
  AND il.is_default_receive = TRUE
  AND il.is_active = TRUE;

-- Seed zero-qty rows for each Branch kitchen location × every ingredient that
-- has a warehouse row at that branch. This guarantees every ingredient can
-- be transferred warehouse→kitchen without the RPC needing an insert path.
INSERT INTO public.stock_levels (
  tenant_id, branch_id, ingredient_id, location_id, current_quantity, avg_unit_cost
)
SELECT
  sl.tenant_id,
  sl.branch_id,
  sl.ingredient_id,
  il_kitchen.id,
  0,
  sl.avg_unit_cost
FROM public.stock_levels sl
JOIN public.inventory_locations il_wh
  ON il_wh.id = sl.location_id AND il_wh.location_kind = 'warehouse'
JOIN public.branches b
  ON b.id = sl.branch_id AND b.branch_kind = 'branch'
JOIN public.inventory_locations il_kitchen
  ON il_kitchen.branch_id = sl.branch_id
 AND il_kitchen.tenant_id = sl.tenant_id
 AND il_kitchen.location_kind = 'kitchen'
 AND il_kitchen.is_active = TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.stock_levels sl2
  WHERE sl2.tenant_id     = sl.tenant_id
    AND sl2.branch_id     = sl.branch_id
    AND sl2.ingredient_id = sl.ingredient_id
    AND sl2.location_id   = il_kitchen.id
);

ALTER TABLE public.stock_levels
  ALTER COLUMN location_id SET NOT NULL;

ALTER TABLE public.stock_levels
  ADD CONSTRAINT stock_levels_ingredient_branch_location_tenant_key
  UNIQUE (ingredient_id, branch_id, location_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_stock_levels_location
  ON public.stock_levels(location_id);

-- ═══════════════════════════════════════════════════════════════
-- PART 2 — stock_movements.location_id NOT NULL going forward
-- ═══════════════════════════════════════════════════════════════

UPDATE public.stock_movements sm
SET location_id = il.id
FROM public.inventory_locations il
WHERE sm.location_id IS NULL
  AND il.branch_id = sm.branch_id
  AND il.tenant_id = sm.tenant_id
  AND il.is_default_receive = TRUE
  AND il.is_active = TRUE;

ALTER TABLE public.stock_movements
  ALTER COLUMN location_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_location
  ON public.stock_movements(location_id);

-- ═══════════════════════════════════════════════════════════════
-- PART 3 — Recreate trigger: upsert stock_levels by location
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_update_stock_on_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.location_id IS NULL THEN
    RAISE EXCEPTION 'stock_movements.location_id required (after per-location migration)'
      USING ERRCODE = '23502';
  END IF;

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, ingredient_id, location_id, current_quantity
  )
  VALUES (
    NEW.tenant_id, NEW.branch_id, NEW.ingredient_id, NEW.location_id, NEW.quantity_change
  )
  ON CONFLICT (ingredient_id, branch_id, location_id, tenant_id)
  DO UPDATE SET
    current_quantity = public.stock_levels.current_quantity + NEW.quantity_change,
    updated_at = now();

  IF NEW.type = 'count_adjustment' THEN
    UPDATE public.stock_levels
    SET last_counted_at = now()
    WHERE ingredient_id = NEW.ingredient_id
      AND branch_id     = NEW.branch_id
      AND location_id   = NEW.location_id
      AND tenant_id     = NEW.tenant_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_movement_update_levels
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_update_stock_on_movement();

-- ═══════════════════════════════════════════════════════════════
-- PART 4 — Retire stock_issue(kitchen_use) via reject trigger
-- ═══════════════════════════════════════════════════════════════
-- Replaces the 20260424000000 scope-limit trigger with an outright reject on
-- INSERT. UPDATEs that don't change issue_type are still permitted so any
-- pre-existing draft can be cancelled/edited.

DROP TRIGGER IF EXISTS trg_stock_issue_kitchen_use_scope ON public.stock_issues;
DROP FUNCTION IF EXISTS public.enforce_stock_issue_kitchen_use_scope();

CREATE OR REPLACE FUNCTION public.reject_stock_issue_kitchen_use()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.issue_type = 'kitchen_use' THEN
    RAISE EXCEPTION 'stock_issue.issue_type=kitchen_use is retired; use stock_transfers (intra-branch) instead'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.issue_type = 'kitchen_use'
     AND OLD.issue_type IS DISTINCT FROM 'kitchen_use' THEN
    RAISE EXCEPTION 'cannot flip stock_issue to retired type kitchen_use'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_issue_reject_kitchen_use
  BEFORE INSERT OR UPDATE OF issue_type ON public.stock_issues
  FOR EACH ROW EXECUTE FUNCTION public.reject_stock_issue_kitchen_use();

COMMENT ON FUNCTION public.reject_stock_issue_kitchen_use() IS
  'Blocks new stock_issue rows with issue_type=kitchen_use. Replaced by intra-branch stock_transfers after per-location split (2026-04-25).';

-- ═══════════════════════════════════════════════════════════════
-- PART 5 — RPC: confirm_goods_receipt_note (location-keyed WAC read/update)
-- ═══════════════════════════════════════════════════════════════
-- Latest prior version: 20260424100000_grn_qc_and_supplier_returns.sql
-- Change: stock_levels reads + avg_unit_cost UPDATE now key on location_id.

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(p_grn_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid             UUID   := auth.uid();
  v_tenant          BIGINT := public.auth_tenant_id();
  v_grn             RECORD;
  v_item            RECORD;
  v_branch          RECORD;
  v_old_q           NUMERIC(15,3);
  v_old_wac         NUMERIC(15,2);
  v_recv            NUMERIC(15,3);
  v_cost            NUMERIC(15,2);
  v_new_q           NUMERIC(15,3);
  v_new_wac         NUMERIC(15,2);
  v_location_id     BIGINT;
  v_inventory_total NUMERIC(15,2) := 0;
  v_journal_id      BIGINT;
  v_lines           JSONB;
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
    AND b.branch_kind IN ('branch', 'branch');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_branch_must_be_procurement' USING ERRCODE = '23514';
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

    IF v_item.quality_status = 'rejected' OR v_item.received_quantity <= 0 THEN
      CONTINUE;
    END IF;

    v_recv := v_item.received_quantity;
    v_cost := v_item.unit_cost;

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
      reason, created_by, grn_id, unit_cost, location_id
    ) VALUES (
      v_tenant, v_grn.branch_id, v_item.ingredient_id, 'grn_receipt', v_recv,
      'GRN ' || v_grn.grn_number, v_uid, p_grn_id, v_cost, v_location_id
    );

    v_new_q := COALESCE(v_old_q, 0) + v_recv;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_recv * v_cost
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_grn.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_item.ingredient_id;

    UPDATE public.ingredients i
    SET unit_cost = v_cost, updated_at = now()
    WHERE i.id = v_item.ingredient_id AND i.tenant_id = v_tenant;

    v_inventory_total := v_inventory_total + (v_recv * v_cost);
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'confirmed', updated_at = now()
  WHERE id = p_grn_id;

  IF v_inventory_total > 0 THEN
    v_lines := jsonb_build_array(jsonb_build_object(
      'rule_code', 'GRN_INVENTORY',
      'amount', v_inventory_total,
      'line_description', 'Nhap kho GRN #' || v_grn.grn_number
    ));
    v_journal_id := public.auto_post_journal(
      v_tenant, v_grn.branch_id, 'purchase', p_grn_id,
      'Nhap kho phieu ' || v_grn.grn_number, v_lines, now(), v_uid
    );
    IF v_journal_id IS NOT NULL THEN
      UPDATE public.goods_received_notes
      SET journal_entry_id = v_journal_id
      WHERE id = p_grn_id;
    END IF;
  END IF;

  IF v_grn.po_id IS NOT NULL THEN
    PERFORM 1
    FROM public.purchase_orders
    WHERE id = v_grn.po_id AND tenant_id = v_tenant
    FOR UPDATE;

    WITH ordered AS (
      SELECT poi.ingredient_id, SUM(poi.quantity)::NUMERIC(15,3) AS qty
      FROM public.purchase_order_items poi
      WHERE poi.po_id = v_grn.po_id
        AND poi.tenant_id = v_tenant
      GROUP BY poi.ingredient_id
    ),
    received AS (
      SELECT gi.ingredient_id, SUM(gi.received_quantity)::NUMERIC(15,3) AS qty
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
    'journal_entry_id', v_journal_id,
    'po_id', v_grn.po_id,
    'po_status', v_po_status,
    'review_count', v_review_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_goods_receipt_note(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt_note(BIGINT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- PART 6 — RPC: stock_transfer_confirm_ship (intra-branch WAC preserve)
-- ═══════════════════════════════════════════════════════════════
-- Latest prior version: 20260417050001_multi_warehouse_locations_and_rpcs.sql
-- Changes:
--   • Source stock lookup now keyed by (branch, from_location_id).
--   • Intra-branch: propagate source WAC to destination location row so
--     kitchen inherits warehouse cost (same physical pool moving).

CREATE OR REPLACE FUNCTION public.stock_transfer_confirm_ship(p_transfer_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_tenant    BIGINT := public.auth_tenant_id();
  v_tr        RECORD;
  v_line      RECORD;
  v_src_q     NUMERIC(15,3);
  v_src_wac   NUMERIC(15,2);
  v_is_intra  BOOLEAN;
  v_dst_old_q   NUMERIC(15,3);
  v_dst_old_wac NUMERIC(15,2);
  v_dst_new_q   NUMERIC(15,3);
  v_dst_new_wac NUMERIC(15,2);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_tr FROM public.stock_transfers
  WHERE id = p_transfer_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tr.status <> 'draft' THEN
    RAISE EXCEPTION 'transfer_not_draft' USING ERRCODE = '22023';
  END IF;

  IF v_tr.from_location_id IS NULL THEN
    RAISE EXCEPTION 'transfer_from_location_missing' USING ERRCODE = '23502';
  END IF;

  v_is_intra := (v_tr.from_branch_id = v_tr.to_branch_id);

  IF v_is_intra AND v_tr.to_location_id IS NULL THEN
    RAISE EXCEPTION 'intra_branch_transfer_requires_to_location' USING ERRCODE = '23502';
  END IF;

  FOR v_line IN
    SELECT * FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id AND tenant_id = v_tenant
  LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_src_q, v_src_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_tr.from_branch_id
      AND sl.location_id   = v_tr.from_location_id
      AND sl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND OR COALESCE(v_src_q, 0) < v_line.quantity THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_line.ingredient_id USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, transfer_id, unit_cost, location_id
    ) VALUES (
      v_tenant, v_tr.from_branch_id, v_line.ingredient_id, 'transfer_out', -v_line.quantity,
      'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_src_wac,
      v_tr.from_location_id
    );

    UPDATE public.stock_transfer_items
    SET unit_cost_at_ship = v_src_wac
    WHERE id = v_line.id;

    IF v_is_intra THEN
      -- Destination WAC pre-read (row guaranteed by PART 1 seed)
      SELECT sl.current_quantity, sl.avg_unit_cost INTO v_dst_old_q, v_dst_old_wac
      FROM public.stock_levels sl
      WHERE sl.tenant_id     = v_tenant
        AND sl.branch_id     = v_tr.to_branch_id
        AND sl.location_id   = v_tr.to_location_id
        AND sl.ingredient_id = v_line.ingredient_id;

      IF NOT FOUND THEN
        v_dst_old_q   := 0;
        v_dst_old_wac := NULL;
      END IF;

      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by, transfer_id, unit_cost, location_id
      ) VALUES (
        v_tenant, v_tr.to_branch_id, v_line.ingredient_id, 'transfer_in', v_line.quantity,
        'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_src_wac,
        v_tr.to_location_id
      );

      v_dst_new_q := COALESCE(v_dst_old_q, 0) + v_line.quantity;
      IF v_dst_new_q > 0 THEN
        v_dst_new_wac := (
          COALESCE(v_dst_old_q, 0) * COALESCE(v_dst_old_wac, 0)
            + v_line.quantity * COALESCE(v_src_wac, 0)
        ) / v_dst_new_q;
      ELSE
        v_dst_new_wac := v_src_wac;
      END IF;

      UPDATE public.stock_levels sl
      SET avg_unit_cost = v_dst_new_wac, updated_at = now()
      WHERE sl.tenant_id     = v_tenant
        AND sl.branch_id     = v_tr.to_branch_id
        AND sl.location_id   = v_tr.to_location_id
        AND sl.ingredient_id = v_line.ingredient_id;

      UPDATE public.stock_transfer_items
      SET quantity_received = v_line.quantity
      WHERE id = v_line.id;
    END IF;
  END LOOP;

  IF v_is_intra THEN
    UPDATE public.stock_transfers
    SET status = 'received',
        shipped_at = now(),
        received_at = now(),
        updated_at = now()
    WHERE id = p_transfer_id;

    RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'received');
  ELSE
    UPDATE public.stock_transfers
    SET status = 'confirmed_ship', shipped_at = now(), updated_at = now()
    WHERE id = p_transfer_id;

    RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'confirmed_ship');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_confirm_ship(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_transfer_confirm_ship(BIGINT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- PART 7 — RPC: stock_transfer_receive (fix missing location_id regression)
-- ═══════════════════════════════════════════════════════════════
-- Latest prior version: 20260419120000_gl_transfer_autopost.sql (dropped
-- location_id from movement insert + stock_levels WHERE). Restore both.

CREATE OR REPLACE FUNCTION public.stock_transfer_receive(
  p_transfer_id BIGINT,
  p_items       JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_tenant    BIGINT := public.auth_tenant_id();
  v_tr        RECORD;
  v_line      RECORD;
  v_recv      NUMERIC(15,3);
  v_note      TEXT;
  v_cost      NUMERIC(15,2);
  v_old_q     NUMERIC(15,3);
  v_old_wac   NUMERIC(15,2);
  v_new_q     NUMERIC(15,3);
  v_new_wac   NUMERIC(15,2);
  v_key       TEXT;
  v_transfer_total NUMERIC(15,2) := 0;
  v_journal_id     BIGINT;
  v_lines          JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_tr FROM public.stock_transfers
  WHERE id = p_transfer_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tr.status <> 'confirmed_receive' THEN
    RAISE EXCEPTION 'transfer_not_in_confirmed_receive' USING ERRCODE = '22023';
  END IF;

  IF v_tr.to_location_id IS NULL THEN
    RAISE EXCEPTION 'transfer_to_location_missing' USING ERRCODE = '23502';
  END IF;

  FOR v_line IN
    SELECT * FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id AND tenant_id = v_tenant
  LOOP
    v_recv := v_line.quantity;
    v_note := NULL;

    IF p_items IS NOT NULL THEN
      v_key := v_line.ingredient_id::text;
      IF (p_items ? v_key) THEN
        IF jsonb_typeof(p_items -> v_key) = 'object' THEN
          v_recv := ((p_items -> v_key) ->> 'qty')::numeric;
          v_note := (p_items -> v_key) ->> 'note';
        ELSE
          v_recv := (p_items ->> v_key)::numeric;
        END IF;
      END IF;
    END IF;

    IF v_recv < 0 OR v_recv > v_line.quantity THEN
      RAISE EXCEPTION 'invalid_receive_qty:%', v_line.ingredient_id USING ERRCODE = '22023';
    END IF;

    IF v_recv <= 0 THEN
      UPDATE public.stock_transfer_items
      SET quantity_received = 0, receive_note = v_note
      WHERE id = v_line.id;
      CONTINUE;
    END IF;

    v_cost := COALESCE(v_line.unit_cost_at_ship, 0);

    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_tr.to_branch_id
      AND sl.location_id   = v_tr.to_location_id
      AND sl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, transfer_id, unit_cost, location_id
    ) VALUES (
      v_tenant, v_tr.to_branch_id, v_line.ingredient_id, 'transfer_in', v_recv,
      'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_cost,
      v_tr.to_location_id
    );

    v_new_q := COALESCE(v_old_q, 0) + v_recv;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_recv * v_cost
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_tr.to_branch_id
      AND sl.location_id   = v_tr.to_location_id
      AND sl.ingredient_id = v_line.ingredient_id;

    UPDATE public.stock_transfer_items
    SET quantity_received = v_recv, receive_note = v_note
    WHERE id = v_line.id;

    v_transfer_total := v_transfer_total + (v_recv * v_cost);
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'received', received_at = now(), updated_at = now()
  WHERE id = p_transfer_id;

  IF v_transfer_total > 0 THEN
    v_lines := jsonb_build_array(jsonb_build_object(
      'rule_code', 'TRANSFER_INVENTORY',
      'amount', v_transfer_total,
      'line_description', 'Chuyển kho ' || v_tr.transfer_number
    ));

    v_journal_id := public.auto_post_journal(
      v_tenant,
      v_tr.to_branch_id,
      'transfer',
      p_transfer_id,
      'Nhận chuyển kho ' || v_tr.transfer_number,
      v_lines,
      now(),
      v_uid
    );

    IF v_journal_id IS NOT NULL THEN
      UPDATE public.stock_transfers
      SET journal_entry_id = v_journal_id
      WHERE id = p_transfer_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'received',
    'journal_entry_id', v_journal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_receive(BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_transfer_receive(BIGINT, JSONB) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- PART 8 — RPC: confirm_stock_issue
-- ═══════════════════════════════════════════════════════════════
-- Latest prior version: 20260417050002_location_ledger_phase2_completion.sql
-- Fixes:
--   (a) pre-existing double-decrement bug (manual UPDATE + trigger both
--       subtracted from current_quantity).
--   (b) stock-sufficiency read now keyed by source_location_id.

CREATE OR REPLACE FUNCTION public.confirm_stock_issue(p_issue_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID   := auth.uid();
  v_tenant  BIGINT := public.auth_tenant_id();
  v_issue   RECORD;
  v_item    RECORD;
  v_sl      NUMERIC(15,3);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_issue
  FROM public.stock_issues
  WHERE id = p_issue_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_issue.status <> 'draft' THEN
    RAISE EXCEPTION 'issue_not_draft' USING ERRCODE = '22023';
  END IF;

  IF v_issue.source_location_id IS NULL THEN
    RAISE EXCEPTION 'issue_source_location_missing' USING ERRCODE = '23502';
  END IF;

  FOR v_item IN
    SELECT * FROM public.stock_issue_items
    WHERE issue_id = p_issue_id AND tenant_id = v_tenant
  LOOP
    SELECT sl.current_quantity INTO v_sl
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_issue.branch_id
      AND sl.location_id   = v_issue.source_location_id
      AND sl.ingredient_id = v_item.ingredient_id;

    IF NOT FOUND THEN
      v_sl := 0;
    END IF;

    IF v_sl < v_item.quantity THEN
      RAISE EXCEPTION 'insufficient_stock_for_%', v_item.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    -- Movement alone decrements via trg_update_stock_on_movement.
    -- (Prior version also ran an explicit UPDATE, causing a double-dec bug.)
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type,
      quantity_change, unit_cost, reason, created_by, issue_id, location_id
    ) VALUES (
      v_tenant,
      v_issue.branch_id,
      v_item.ingredient_id,
      'consumption',
      -v_item.quantity,
      v_item.unit_cost,
      COALESCE(v_item.reason, v_issue.notes),
      v_uid,
      p_issue_id,
      v_issue.source_location_id
    );
  END LOOP;

  UPDATE public.stock_issues
  SET status = 'confirmed'
  WHERE id = p_issue_id AND tenant_id = v_tenant;

  RETURN jsonb_build_object('ok', true, 'issue_id', p_issue_id);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_stock_issue(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_stock_issue(BIGINT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- PART 9 — RPC: consume_stock_for_order (location-keyed kitchen balance)
-- ═══════════════════════════════════════════════════════════════
-- Reads current_quantity + avg_unit_cost from the kitchen row
-- (is_default_consumption). Prior version still read by branch only.

CREATE OR REPLACE FUNCTION public.consume_stock_for_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_order         RECORD;
  v_need          RECORD;
  v_sl            NUMERIC(15,3);
  v_total         NUMERIC(15,3);
  v_location_id   BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.status
  INTO v_order FROM public.orders o
  WHERE o.id = p_order_id AND o.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.order_id = p_order_id AND sm.type = 'consumption' AND sm.tenant_id = v_tenant
  ) THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'skipped', true, 'reason', 'already_consumed');
  END IF;

  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_tenant
    AND il.is_default_consumption = TRUE
    AND il.is_active = TRUE
  LIMIT 1;

  IF v_location_id IS NULL THEN
    -- CRITICAL: never fail the order. Fall back to default_receive (warehouse)
    -- so consumption still completes, and emit a NOTICE for ops visibility.
    SELECT il.id INTO v_location_id
    FROM public.inventory_locations il
    WHERE il.branch_id = v_order.branch_id
      AND il.tenant_id = v_tenant
      AND il.is_default_receive = TRUE
      AND il.is_active = TRUE
    LIMIT 1;
    RAISE NOTICE 'consume_stock_for_order: default_consumption missing for branch %; falling back to default_receive', v_order.branch_id;
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'consume_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(oi.quantity::numeric * r.quantity / r.yield_factor) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_tenant
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    SELECT sl.current_quantity INTO v_sl
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_order.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id;

    v_total := COALESCE(v_sl, 0);
    IF v_total < v_need.need_qty THEN
      RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need.ingredient_id USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(oi.quantity::numeric * r.quantity / r.yield_factor) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_tenant
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, order_id, unit_cost, location_id
    )
    SELECT
      v_tenant,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      -v_need.need_qty,
      'Order ' || p_order_id::text,
      v_uid,
      p_order_id,
      COALESCE(sl.avg_unit_cost, 0),
      v_location_id
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_order.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id;
  END LOOP;

  RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_stock_for_order(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_stock_for_order(BIGINT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- PART 10 — RPC: consume_stock_for_order_service (webhook variant)
-- ═══════════════════════════════════════════════════════════════
-- Latest prior version: 20260418000000_inventory_gap_fixes.sql (regressed:
-- dropped location_id resolution).

CREATE OR REPLACE FUNCTION public.consume_stock_for_order_service(
  p_order_id BIGINT,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor         UUID := COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_order         RECORD;
  v_need          RECORD;
  v_sl            NUMERIC(15,3);
  v_total         NUMERIC(15,3);
  v_location_id   BIGINT;
BEGIN
  SELECT o.id, o.tenant_id, o.branch_id, o.status
  INTO v_order FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.order_id = p_order_id
      AND sm.type = 'consumption'
      AND sm.tenant_id = v_order.tenant_id
  ) THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id, 'skipped', true, 'reason', 'already_consumed'
    );
  END IF;

  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_order.tenant_id
    AND il.is_default_consumption = TRUE
    AND il.is_active = TRUE
  LIMIT 1;

  IF v_location_id IS NULL THEN
    SELECT il.id INTO v_location_id
    FROM public.inventory_locations il
    WHERE il.branch_id = v_order.branch_id
      AND il.tenant_id = v_order.tenant_id
      AND il.is_default_receive = TRUE
      AND il.is_active = TRUE
    LIMIT 1;
    RAISE NOTICE 'consume_stock_for_order_service: default_consumption missing for branch %; falling back to default_receive', v_order.branch_id;
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'consume_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(oi.quantity::numeric * r.quantity / r.yield_factor) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_order.tenant_id
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    SELECT sl.current_quantity INTO v_sl
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_order.tenant_id
      AND sl.branch_id     = v_order.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id;

    v_total := COALESCE(v_sl, 0);
    IF v_total < v_need.need_qty THEN
      RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need.ingredient_id
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(oi.quantity::numeric * r.quantity / r.yield_factor) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_order.tenant_id
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, order_id, unit_cost, location_id
    )
    SELECT
      v_order.tenant_id,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      -v_need.need_qty,
      'Order ' || p_order_id::text,
      v_actor,
      p_order_id,
      COALESCE(sl.avg_unit_cost, 0),
      v_location_id
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_order.tenant_id
      AND sl.branch_id     = v_order.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id;
  END LOOP;

  RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_stock_for_order_service(BIGINT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_stock_for_order_service(BIGINT, UUID) TO service_role;

-- ═══════════════════════════════════════════════════════════════
-- PART 11 — RPC: confirm_production_order (location-aware branch)
-- ═══════════════════════════════════════════════════════════════
-- Latest prior version: 20260423110000_auth_v2_phase2_rpc_gates_residue.sql
-- Change: resolve branch default_receive location (production_storage) and carry
-- it on every stock_movements insert + all stock_levels reads/writes.

CREATE OR REPLACE FUNCTION public.confirm_production_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_order RECORD; v_item RECORD; v_recipe RECORD;
  v_raw_need NUMERIC(15,3); v_output_cost NUMERIC(15,2);
  v_old_q NUMERIC(15,3); v_old_wac NUMERIC(15,2);
  v_new_q NUMERIC(15,3); v_new_wac NUMERIC(15,2);
  v_need_map JSONB := '{}'::JSONB; v_cost_map JSONB := '{}'::JSONB;
  v_key TEXT; v_need_qty NUMERIC(15,3); v_cost_total NUMERIC(15,2); v_has_recipe BOOLEAN;
  v_total_consumption NUMERIC(15,2) := 0; v_total_output NUMERIC(15,2) := 0;
  v_journal_id BIGINT; v_lines JSONB;
  v_location_id BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('inventory:production_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT po.*, b.branch_kind INTO v_order
  FROM public.production_orders po JOIN public.branches b ON b.id = po.branch_id
  WHERE po.id = p_order_id AND po.tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.status <> 'draft' THEN
    RAISE EXCEPTION 'production_order_not_draft' USING ERRCODE = '22023';
  END IF;
  IF v_order.branch_kind <> 'branch' THEN
    RAISE EXCEPTION 'branch_must_be_branch' USING ERRCODE = '23514';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'inventory:production_confirm') THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_tenant
    AND il.is_default_receive = TRUE
    AND il.is_active = TRUE
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'production_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.production_order_items poi
    WHERE poi.production_order_id = p_order_id AND poi.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'production_order_empty' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT poi.*, fg.item_kind
    FROM public.production_order_items poi
    JOIN public.ingredients fg ON fg.id = poi.finished_good_id
    WHERE poi.production_order_id = p_order_id AND poi.tenant_id = v_tenant
  LOOP
    IF v_item.item_kind <> 'finished_good' THEN
      RAISE EXCEPTION 'production_item_must_be_finished_good' USING ERRCODE = '23514';
    END IF;
    v_output_cost := 0; v_has_recipe := FALSE;
    FOR v_recipe IN
      SELECT pr.ingredient_id, pr.quantity, pr.yield_factor,
             COALESCE(sl.avg_unit_cost, ing.unit_cost, 0) AS raw_unit_cost
      FROM public.production_recipes pr
      JOIN public.ingredients ing ON ing.id = pr.ingredient_id
      LEFT JOIN public.stock_levels sl
        ON sl.tenant_id     = v_tenant
       AND sl.branch_id     = v_order.branch_id
       AND sl.location_id   = v_location_id
       AND sl.ingredient_id = pr.ingredient_id
      WHERE pr.tenant_id = v_tenant AND pr.finished_good_id = v_item.finished_good_id
    LOOP
      v_has_recipe := TRUE;
      v_raw_need := (v_item.quantity * v_recipe.quantity) / COALESCE(v_recipe.yield_factor, 1.0);
      v_key := v_recipe.ingredient_id::text;
      v_need_map := jsonb_set(v_need_map, ARRAY[v_key],
        to_jsonb(COALESCE((v_need_map ->> v_key)::numeric, 0) + v_raw_need), TRUE);
      v_cost_map := jsonb_set(v_cost_map, ARRAY[v_key],
        to_jsonb(COALESCE((v_cost_map ->> v_key)::numeric, 0) + (v_raw_need * COALESCE(v_recipe.raw_unit_cost, 0))), TRUE);
      v_output_cost := v_output_cost + (v_raw_need * COALESCE(v_recipe.raw_unit_cost, 0));
    END LOOP;
    IF NOT v_has_recipe THEN
      RAISE EXCEPTION 'production_recipe_missing' USING ERRCODE = 'P0001';
    END IF;
    IF v_output_cost < 0 THEN
      RAISE EXCEPTION 'production_cost_invalid' USING ERRCODE = '22023';
    END IF;
    v_cost_total := v_output_cost;
    UPDATE public.production_order_items
    SET unit_cost_at_production = CASE WHEN v_item.quantity > 0 THEN ROUND(v_cost_total / v_item.quantity, 2) ELSE 0 END
    WHERE id = v_item.id;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM jsonb_each_text(v_need_map) AS need(ingredient_id, need_qty)
    LEFT JOIN public.stock_levels sl
      ON sl.tenant_id     = v_tenant
     AND sl.branch_id     = v_order.branch_id
     AND sl.location_id   = v_location_id
     AND sl.ingredient_id = need.ingredient_id::BIGINT
    WHERE COALESCE(sl.current_quantity, 0) < need.need_qty::NUMERIC
  ) THEN
    RAISE EXCEPTION 'insufficient_stock_for_production' USING ERRCODE = 'P0001';
  END IF;

  FOR v_key, v_need_qty IN SELECT key, value::NUMERIC(15,3) FROM jsonb_each_text(v_need_map) LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_order.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_key::BIGINT;
    IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, production_order_id, unit_cost, location_id
    )
    VALUES (
      v_tenant, v_order.branch_id, v_key::BIGINT, 'production_consumption', -v_need_qty,
      'Production ' || v_order.production_number, v_uid, p_order_id,
      COALESCE(v_old_wac, 0), v_location_id
    );
    v_total_consumption := v_total_consumption + (v_need_qty * COALESCE(v_old_wac, 0));
  END LOOP;

  FOR v_item IN
    SELECT poi.*, fg.item_kind FROM public.production_order_items poi
    JOIN public.ingredients fg ON fg.id = poi.finished_good_id
    WHERE poi.production_order_id = p_order_id AND poi.tenant_id = v_tenant
  LOOP
    v_cost_total := COALESCE(v_item.unit_cost_at_production, 0);
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_order.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_item.finished_good_id;
    IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, production_order_id, unit_cost, location_id
    )
    VALUES (
      v_tenant, v_order.branch_id, v_item.finished_good_id, 'production_output', v_item.quantity,
      'Production ' || v_order.production_number, v_uid, p_order_id, v_cost_total, v_location_id
    );

    v_new_q := COALESCE(v_old_q, 0) + v_item.quantity;
    IF v_new_q > 0 THEN
      v_new_wac := (COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_item.quantity * v_cost_total) / v_new_q;
    ELSE
      v_new_wac := v_cost_total;
    END IF;

    UPDATE public.stock_levels sl SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_order.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_item.finished_good_id;

    UPDATE public.ingredients SET unit_cost = v_cost_total, updated_at = now()
    WHERE id = v_item.finished_good_id AND tenant_id = v_tenant;

    v_total_output := v_total_output + (v_item.quantity * v_cost_total);
  END LOOP;

  UPDATE public.production_orders SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_order_id AND tenant_id = v_tenant;

  v_lines := '[]'::JSONB;
  IF v_total_consumption > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PRODUCTION_CONSUME', 'amount', v_total_consumption,
      'line_description', 'NVL sản xuất ' || v_order.production_number));
  END IF;
  IF v_total_output > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PRODUCTION_OUTPUT', 'amount', v_total_output,
      'line_description', 'Thành phẩm ' || v_order.production_number));
  END IF;
  IF jsonb_array_length(v_lines) > 0 THEN
    v_journal_id := public.auto_post_journal(v_tenant, v_order.branch_id, 'production', p_order_id,
      'Sản xuất ' || v_order.production_number, v_lines, now(), v_uid);
    IF v_journal_id IS NOT NULL THEN
      UPDATE public.production_orders SET journal_entry_id = v_journal_id WHERE id = p_order_id;
    END IF;
  END IF;
  RETURN jsonb_build_object('production_order_id', p_order_id, 'status', 'completed', 'journal_entry_id', v_journal_id);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_production_order(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_production_order(BIGINT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- PART 12 — RPC: complete_stocktake (location-keyed variance calc)
-- ═══════════════════════════════════════════════════════════════
-- Latest prior version: 20260417050002_location_ledger_phase2_completion.sql
-- Change: fresh_qty read now keyed by session.location_id so stocktakes at
-- kitchen vs warehouse don't cross-read each other's balance.

CREATE OR REPLACE FUNCTION public.complete_stocktake(p_session_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_session       RECORD;
  v_line          RECORD;
  v_fresh_qty     NUMERIC(15,3);
  v_adjustment    NUMERIC(15,3);
  v_total_lines   INT := 0;
  v_adjusted      INT := 0;
  v_total_var_abs NUMERIC(15,3) := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT s.* INTO v_session
  FROM public.stocktake_sessions s
  WHERE s.id = p_session_id AND s.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session_not_in_progress' USING ERRCODE = '22023';
  END IF;

  IF v_session.location_id IS NULL THEN
    RAISE EXCEPTION 'session_location_missing' USING ERRCODE = '23502';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stocktake_lines sl
    WHERE sl.session_id = p_session_id
      AND sl.tenant_id = v_tenant
      AND sl.counted_quantity IS NULL
  ) THEN
    RAISE EXCEPTION 'uncounted_lines_exist' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT * FROM public.stocktake_lines sl
    WHERE sl.session_id = p_session_id AND sl.tenant_id = v_tenant
  LOOP
    v_total_lines := v_total_lines + 1;

    SELECT COALESCE(stl.current_quantity, 0) INTO v_fresh_qty
    FROM public.stock_levels stl
    WHERE stl.tenant_id     = v_tenant
      AND stl.branch_id     = v_session.branch_id
      AND stl.location_id   = v_session.location_id
      AND stl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND THEN
      v_fresh_qty := 0;
    END IF;

    v_adjustment := v_line.counted_quantity - v_fresh_qty;

    IF v_adjustment <> 0 THEN
      v_adjusted := v_adjusted + 1;
      v_total_var_abs := v_total_var_abs + abs(v_adjustment);

      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by, location_id
      ) VALUES (
        v_tenant,
        v_session.branch_id,
        v_line.ingredient_id,
        'count_adjustment',
        v_adjustment,
        COALESCE(v_line.variance_reason, 'Stocktake #' || p_session_id::text),
        v_uid,
        v_session.location_id
      );
    END IF;
  END LOOP;

  UPDATE public.stocktake_sessions
  SET status = 'completed', completed_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'total_lines', v_total_lines,
    'adjusted_lines', v_adjusted,
    'total_variance_abs', v_total_var_abs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_stocktake(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_stocktake(BIGINT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- PART 13 — Validation
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_null_levels    INT;
  v_null_movements INT;
  v_branch_gaps    INT;
BEGIN
  SELECT COUNT(*) INTO v_null_levels
  FROM public.stock_levels WHERE location_id IS NULL;

  SELECT COUNT(*) INTO v_null_movements
  FROM public.stock_movements WHERE location_id IS NULL;

  -- Any operational branch missing its kitchen stock_levels fan-out?
  SELECT COUNT(*) INTO v_branch_gaps
  FROM public.stock_levels sl
  JOIN public.inventory_locations il_wh
    ON il_wh.id = sl.location_id AND il_wh.location_kind = 'warehouse'
  JOIN public.branches b
    ON b.id = sl.branch_id AND b.branch_kind = 'branch'
  JOIN public.inventory_locations il_kitchen
    ON il_kitchen.branch_id = sl.branch_id
   AND il_kitchen.tenant_id = sl.tenant_id
   AND il_kitchen.location_kind = 'kitchen'
   AND il_kitchen.is_active = TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM public.stock_levels sl2
    WHERE sl2.tenant_id     = sl.tenant_id
      AND sl2.branch_id     = sl.branch_id
      AND sl2.ingredient_id = sl.ingredient_id
      AND sl2.location_id   = il_kitchen.id
  );

  RAISE NOTICE 'Per-location split validation: stock_levels_null=%, stock_movements_null=%, kitchen_gaps=%',
    v_null_levels, v_null_movements, v_branch_gaps;

  IF v_null_levels > 0 OR v_null_movements > 0 THEN
    RAISE EXCEPTION 'Per-location split: NULL location_id rows remain; aborting';
  END IF;

  IF v_branch_gaps > 0 THEN
    RAISE EXCEPTION 'Per-location split: % branch×ingredient pairs missing kitchen row; aborting', v_branch_gaps;
  END IF;
END;
$$;
