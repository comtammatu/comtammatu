-- =============================================================
-- M5-Ext S8: recipe yield_factor, supplier payment_terms,
-- supplier_invoices AP tracking columns, fix consume_stock_for_order
-- =============================================================

-- ─── 1. recipes: add yield_factor ───

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS yield_factor NUMERIC(5,3) NOT NULL DEFAULT 1.000;

COMMENT ON COLUMN public.recipes.yield_factor
  IS 'Cooking yield multiplier (0.001–9.999). E.g. 0.850 = 15% loss. Raw qty needed = recipe.quantity / yield_factor.';

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_yield_factor_positive CHECK (yield_factor > 0);

-- ─── 2. suppliers: add payment_terms ───

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS payment_terms_days INT,
  ADD COLUMN IF NOT EXISTS payment_terms_note TEXT;

COMMENT ON COLUMN public.suppliers.payment_terms_days
  IS 'Standard payment terms in days (e.g. 30 = Net 30). NULL = immediate / not set.';
COMMENT ON COLUMN public.suppliers.payment_terms_note
  IS 'Free-text payment terms description (e.g. "Net 30, 2% discount if paid within 10 days").';

-- ─── 3. supplier_invoices: AP tracking columns ───

ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE public.supplier_invoices
  ADD CONSTRAINT supplier_invoices_payment_status_check
    CHECK (payment_status IN ('unpaid', 'partial', 'paid'));

ALTER TABLE public.supplier_invoices
  ADD CONSTRAINT supplier_invoices_paid_amount_non_negative
    CHECK (paid_amount >= 0);

COMMENT ON COLUMN public.supplier_invoices.due_date
  IS 'Payment due date. Can be auto-calculated from invoice_date + supplier.payment_terms_days.';
COMMENT ON COLUMN public.supplier_invoices.payment_status
  IS 'AP status: unpaid (default), partial, paid.';
COMMENT ON COLUMN public.supplier_invoices.paid_amount
  IS 'Total amount paid so far toward this invoice.';
COMMENT ON COLUMN public.supplier_invoices.paid_at
  IS 'Timestamp of last/final payment.';

-- Index for AP aging queries (filter by due_date + payment_status)
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_ap_aging
  ON public.supplier_invoices(tenant_id, payment_status, due_date)
  WHERE payment_status <> 'paid';

-- ─── 4. Fix consume_stock_for_order to use yield_factor ───
--
-- Before: need_qty = SUM(order_item.quantity * recipe.quantity)
-- After:  need_qty = SUM(order_item.quantity * recipe.quantity / recipe.yield_factor)
--
-- yield_factor = 1.0 (default) means no change in behavior for existing recipes.
-- yield_factor = 0.85 means 15% loss → need 1/0.85 ≈ 1.176x the raw ingredient.

CREATE OR REPLACE FUNCTION public.consume_stock_for_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_tenant    BIGINT := public.auth_tenant_id();
  v_order     RECORD;
  v_need      RECORD;
  v_sl        NUMERIC(15,3);
  v_total     NUMERIC(15,3);
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

  -- Idempotency: skip if already consumed
  IF EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.order_id = p_order_id AND sm.type = 'consumption' AND sm.tenant_id = v_tenant
  ) THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'skipped', true, 'reason', 'already_consumed');
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
      AND oi.tenant_id = v_tenant
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    SELECT sl.current_quantity INTO v_sl
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_order.branch_id
      AND sl.ingredient_id = v_need.ingredient_id;

    v_total := COALESCE(v_sl, 0);
    IF v_total < v_need.need_qty THEN
      RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need.ingredient_id USING ERRCODE = 'P0001';
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
      AND oi.tenant_id = v_tenant
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, order_id, unit_cost
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
      COALESCE(sl.avg_unit_cost, 0)
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_order.branch_id
      AND sl.ingredient_id = v_need.ingredient_id;
  END LOOP;

  RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_stock_for_order(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_stock_for_order(BIGINT) TO authenticated;
