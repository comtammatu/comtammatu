-- =============================================================
-- Inventory Gap Fixes: P0 + P2 (app-only) + P3
--
-- P0: Service-role-safe stock consumption for Momo webhook
-- P3: Transfer receive discrepancy notes
-- =============================================================

-- ─── 1. consume_stock_for_order_service (P0) ───
--
-- Clone of consume_stock_for_order but callable by service role:
-- • Does NOT require auth.uid() — uses p_actor_id parameter
-- • Derives tenant_id from order row, not JWT
-- • GRANTed to service_role instead of authenticated
-- • Same idempotency + yield_factor + 2-phase logic

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
  v_actor     UUID := COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_order     RECORD;
  v_need      RECORD;
  v_sl        NUMERIC(15,3);
  v_total     NUMERIC(15,3);
BEGIN
  -- Look up order (no tenant filter — SECURITY DEFINER bypasses RLS)
  SELECT o.id, o.tenant_id, o.branch_id, o.status
  INTO v_order FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: skip if already consumed
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

  -- Phase 1: validate sufficient stock for all ingredients
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
    WHERE sl.tenant_id = v_order.tenant_id
      AND sl.branch_id = v_order.branch_id
      AND sl.ingredient_id = v_need.ingredient_id;

    v_total := COALESCE(v_sl, 0);
    IF v_total < v_need.need_qty THEN
      RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need.ingredient_id
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- Phase 2: insert consumption movements
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
      reason, created_by, order_id, unit_cost
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
      COALESCE(sl.avg_unit_cost, 0)
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_order.tenant_id
      AND sl.branch_id = v_order.branch_id
      AND sl.ingredient_id = v_need.ingredient_id;
  END LOOP;

  RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_stock_for_order_service(BIGINT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_stock_for_order_service(BIGINT, UUID) TO service_role;


-- ─── 2. stock_transfer_items: add receive_note (P3) ───

ALTER TABLE public.stock_transfer_items
  ADD COLUMN IF NOT EXISTS receive_note TEXT;

COMMENT ON COLUMN public.stock_transfer_items.receive_note
  IS 'Free-text note explaining quantity discrepancy at receive time.';


-- ─── 3. stock_transfer_receive: support receive_note in p_items (P3) ───
--
-- Extends p_items JSONB to support two formats per key:
--   Legacy:  {"123": 10}                     (ingredient_id → quantity)
--   New:     {"123": {"qty": 10, "note": "Hàng hư 2 đơn vị"}}
-- Both formats can be mixed in the same call.

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

  FOR v_line IN
    SELECT * FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id AND tenant_id = v_tenant
  LOOP
    v_recv := v_line.quantity;
    v_note := NULL;

    IF p_items IS NOT NULL THEN
      v_key := v_line.ingredient_id::text;
      IF (p_items ? v_key) THEN
        -- Support both formats: number or {"qty": N, "note": "..."}
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
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.to_branch_id
      AND sl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, transfer_id, unit_cost
    ) VALUES (
      v_tenant, v_tr.to_branch_id, v_line.ingredient_id, 'transfer_in', v_recv,
      'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_cost
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
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.to_branch_id
      AND sl.ingredient_id = v_line.ingredient_id;

    UPDATE public.stock_transfer_items
    SET quantity_received = v_recv, receive_note = v_note
    WHERE id = v_line.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'received', received_at = now(), updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'received');
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_receive(BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_transfer_receive(BIGINT, JSONB) TO authenticated;
