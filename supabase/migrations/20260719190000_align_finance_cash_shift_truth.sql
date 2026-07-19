-- Keep Finance cash, POS shift settlement, and payment-method corrections on
-- one auditable source chain. This migration is additive before replacing the
-- affected RPCs so application deployment can follow the schema deployment.

ALTER TABLE public.pos_sessions
  ADD COLUMN IF NOT EXISTS variance_resolution_type text,
  ADD COLUMN IF NOT EXISTS variance_settlement_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS variance_resolved_at timestamptz;

ALTER TABLE public.pos_sessions
  DROP CONSTRAINT IF EXISTS pos_sessions_variance_resolution_type_check;

ALTER TABLE public.pos_sessions
  ADD CONSTRAINT pos_sessions_variance_resolution_type_check
  CHECK (
    variance_resolution_type IS NULL
    OR variance_resolution_type IN ('staff_repaid', 'accepted_adjustment')
  );

COMMENT ON COLUMN public.pos_sessions.variance_resolution_type IS
  'Structured resolution for an over-threshold cash variance: full staff repayment for a shortage, or an accepted cash-book adjustment.';
COMMENT ON COLUMN public.pos_sessions.variance_settlement_amount IS
  'Amount settled by the selected variance resolution. Full shortage amount for staff_repaid; zero for accepted_adjustment.';
COMMENT ON COLUMN public.pos_sessions.variance_resolved_at IS
  'Timestamp when an authorized manager resolved the variance.';

CREATE OR REPLACE FUNCTION public.close_pos_session(
  p_session_id bigint,
  p_closing_cash numeric,
  p_note text DEFAULT NULL::text,
  p_variance_note text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_session record;
  v_paid_count integer;
  v_unpaid_count integer;
  v_cash_revenue numeric(15,2);
  v_noncash_revenue numeric(15,2);
  v_expected_cash numeric(15,2);
  v_cash_difference numeric(15,2);
  v_threshold numeric(15,2);
  v_closed_by uuid;
  v_variance_trim text;
BEGIN
  IF p_closing_cash IS NULL OR p_closing_cash < 0 THEN
    RAISE EXCEPTION 'closing_cash must be non-negative' USING ERRCODE = '22023';
  END IF;

  v_closed_by := auth.uid();
  IF v_closed_by IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, tenant_id, branch_id, opening_cash, opened_at, status
  INTO v_session
  FROM public.pos_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'session_already_closed' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE o.payment_status = 'paid'),
    COUNT(*) FILTER (WHERE o.payment_status <> 'paid')
  INTO v_paid_count, v_unpaid_count
  FROM public.orders o
  WHERE o.pos_session_id = p_session_id
    AND o.status <> 'cancelled';

  SELECT
    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0),
    COALESCE(SUM(p.amount) FILTER (WHERE p.method <> 'cash'), 0)
  INTO v_cash_revenue, v_noncash_revenue
  FROM public.payments p
  JOIN public.orders o
    ON o.id = p.order_id
   AND o.tenant_id = p.tenant_id
  WHERE o.pos_session_id = p_session_id
    AND o.status <> 'cancelled'
    AND o.payment_status = 'paid'
    AND p.status = 'completed';

  v_expected_cash := v_session.opening_cash + v_cash_revenue;
  v_cash_difference := p_closing_cash - v_expected_cash;
  v_threshold := GREATEST(50000::numeric, ROUND(v_expected_cash * 0.005, 2));
  v_variance_trim := NULLIF(btrim(COALESCE(p_variance_note, '')), '');

  UPDATE public.pos_sessions
  SET
    status = 'closed',
    closed_at = now(),
    closed_by = v_closed_by,
    closing_cash = p_closing_cash,
    expected_cash = v_expected_cash,
    cash_difference = v_cash_difference,
    note = p_note,
    variance_approval_note = v_variance_trim,
    variance_approver_user_id = NULL,
    variance_resolution_type = NULL,
    variance_settlement_amount = NULL,
    variance_resolved_at = NULL
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'opening_cash', v_session.opening_cash,
    'closing_cash', p_closing_cash,
    'expected_cash', v_expected_cash,
    'cash_revenue', v_cash_revenue,
    'noncash_revenue', v_noncash_revenue,
    'cash_difference', v_cash_difference,
    'variance_threshold', v_threshold,
    'variance_breached', abs(v_cash_difference) > v_threshold,
    'order_count', v_paid_count + v_unpaid_count,
    'paid_order_count', v_paid_count,
    'unpaid_order_count', v_unpaid_count,
    'opened_at', v_session.opened_at,
    'closed_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.close_pos_session(bigint, numeric, text, text) IS
  'Closes a POS session. Expected cash is opening cash plus completed cash payments for paid, non-cancelled orders in that session.';

CREATE OR REPLACE FUNCTION public.resolve_pos_session_variance(
  p_session_id bigint,
  p_resolution_type text,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_session record;
  v_threshold numeric(15,2);
  v_settlement numeric(15,2);
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_resolution_type NOT IN ('staff_repaid', 'accepted_adjustment') THEN
    RAISE EXCEPTION 'invalid_resolution_type' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 10 OR length(p_note) > 500 THEN
    RAISE EXCEPTION 'invalid_resolution_note' USING ERRCODE = '22023';
  END IF;

  SELECT ps.*
  INTO v_session
  FROM public.pos_sessions ps
  WHERE ps.id = p_session_id
    AND ps.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_session.branch_id, 'pos:close_shift') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_session.status <> 'closed' THEN
    RAISE EXCEPTION 'session_not_closed' USING ERRCODE = 'P0001';
  END IF;

  v_threshold := GREATEST(
    50000::numeric,
    ROUND(COALESCE(v_session.expected_cash, 0) * 0.005, 2)
  );
  IF v_session.cash_difference IS NULL
     OR abs(v_session.cash_difference) <= v_threshold THEN
    RAISE EXCEPTION 'variance_not_actionable' USING ERRCODE = 'P0001';
  END IF;
  IF v_session.variance_resolution_type IS NOT NULL
     OR v_session.variance_approval_note IS NOT NULL THEN
    RAISE EXCEPTION 'variance_already_resolved' USING ERRCODE = 'P0001';
  END IF;
  IF p_resolution_type = 'staff_repaid'
     AND v_session.cash_difference >= 0 THEN
    RAISE EXCEPTION 'staff_repayment_requires_shortage' USING ERRCODE = '22023';
  END IF;

  v_settlement := CASE
    WHEN p_resolution_type = 'staff_repaid'
      THEN abs(v_session.cash_difference)
    ELSE 0
  END;

  UPDATE public.pos_sessions
  SET
    variance_approval_note = btrim(p_note),
    variance_approver_user_id = v_actor,
    variance_resolution_type = p_resolution_type,
    variance_settlement_amount = v_settlement,
    variance_resolved_at = now(),
    updated_at = now()
  WHERE id = v_session.id;

  PERFORM public.log_audit(
    'pos_session.variance_resolve',
    'pos_session',
    v_session.id,
    jsonb_build_object(
      'cash_difference', v_session.cash_difference,
      'resolution_type', NULL
    ),
    jsonb_build_object(
      'cash_difference', v_session.cash_difference,
      'resolution_type', p_resolution_type,
      'settlement_amount', v_settlement,
      'note', btrim(p_note)
    )
  );

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'resolution_type', p_resolution_type,
    'settlement_amount', v_settlement,
    'cash_difference', v_session.cash_difference
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_pos_session_variance(bigint, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_pos_session_variance(bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_pos_session_variance(bigint, text, text) TO service_role;

COMMENT ON FUNCTION public.resolve_pos_session_variance(bigint, text, text) IS
  'Resolves an over-threshold closed-session variance as a full staff repayment for a shortage or an accepted cash-book adjustment. The original counted cash and difference remain immutable.';

CREATE OR REPLACE FUNCTION public.correct_payment_method(
  p_payment_id bigint,
  p_new_method text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_payment record;
  v_order record;
  v_session record;
  v_cash_revenue numeric(15,2);
  v_expected_cash numeric(15,2);
  v_cash_difference numeric(15,2);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant claim missing' USING ERRCODE = '28000';
  END IF;
  IF p_new_method IS NULL OR p_new_method NOT IN ('cash', 'vietqr') THEN
    RAISE EXCEPTION 'invalid method: %', p_new_method USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;
  IF length(p_reason) > 500 THEN
    RAISE EXCEPTION 'reason exceeds 500 chars' USING ERRCODE = '22023';
  END IF;

  SELECT p.id, p.tenant_id, p.branch_id, p.order_id, p.status, p.method
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.auth_is_owner(v_actor)
     OR NOT public.has_permission(v_payment.branch_id, 'orders:refund_approve') THEN
    RAISE EXCEPTION 'permission denied: orders:refund_approve required'
      USING ERRCODE = '42501';
  END IF;
  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'payment_not_completed: status=%', v_payment.status
      USING ERRCODE = 'P0001';
  END IF;
  IF v_payment.method = p_new_method THEN
    RAISE EXCEPTION 'method_unchanged: already %', p_new_method
      USING ERRCODE = 'P0001';
  END IF;

  SELECT o.id, o.pos_session_id, o.payment_method
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_payment.order_id
    AND o.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.payments
  SET method = p_new_method, updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.orders
  SET payment_method = p_new_method, updated_at = now()
  WHERE id = v_order.id;

  IF v_order.pos_session_id IS NOT NULL THEN
    SELECT ps.*
    INTO v_session
    FROM public.pos_sessions ps
    WHERE ps.id = v_order.pos_session_id
      AND ps.tenant_id = v_tenant
    FOR UPDATE;

    IF FOUND AND v_session.status = 'closed' THEN
      SELECT COALESCE(SUM(p.amount), 0)
      INTO v_cash_revenue
      FROM public.payments p
      JOIN public.orders o
        ON o.id = p.order_id
       AND o.tenant_id = p.tenant_id
      WHERE o.pos_session_id = v_session.id
        AND o.status <> 'cancelled'
        AND o.payment_status = 'paid'
        AND p.status = 'completed'
        AND p.method = 'cash';

      v_expected_cash := v_session.opening_cash + v_cash_revenue;
      v_cash_difference := v_session.closing_cash - v_expected_cash;

      UPDATE public.pos_sessions
      SET
        expected_cash = v_expected_cash,
        cash_difference = v_cash_difference,
        variance_approval_note = NULL,
        variance_approver_user_id = NULL,
        variance_resolution_type = NULL,
        variance_settlement_amount = NULL,
        variance_resolved_at = NULL,
        updated_at = now()
      WHERE id = v_session.id;
    END IF;
  END IF;

  PERFORM public.log_audit(
    'payment.method_correct',
    'payment',
    v_payment.id,
    jsonb_build_object(
      'method', v_payment.method,
      'order_payment_method', v_order.payment_method,
      'pos_session_id', v_order.pos_session_id
    ),
    jsonb_build_object(
      'method', p_new_method,
      'order_payment_method', p_new_method,
      'pos_session_id', v_order.pos_session_id,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'status', 'corrected',
    'payment_id', v_payment.id,
    'order_id', v_order.id,
    'pos_session_id', v_order.pos_session_id,
    'old_method', v_payment.method,
    'new_method', p_new_method
  );
END;
$$;

COMMENT ON FUNCTION public.correct_payment_method(bigint, text, text) IS
  'Owner-level audited correction that updates the completed payment and order display mirror, then recalculates any closed POS session from completed payments.';

CREATE OR REPLACE FUNCTION public.get_cash_ledger_movement_since(
  p_since timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_cash_collections numeric;
  v_cash_refunds numeric;
  v_cash_expenses numeric;
  v_cash_supplier_payments numeric;
  v_cash_variance_adjustments numeric;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(sum(payment.amount), 0)
  INTO v_cash_collections
  FROM public.payments payment
  WHERE payment.tenant_id = v_tenant_id
    AND payment.method = 'cash'
    AND payment.status IN ('completed', 'refunded')
    AND payment.paid_at >= p_since;

  SELECT COALESCE(sum(refund.amount), 0)
  INTO v_cash_refunds
  FROM public.refunds refund
  WHERE refund.tenant_id = v_tenant_id
    AND refund.status = 'approved'
    AND refund.payout_method = 'cash'
    AND refund.approved_at >= p_since;

  SELECT COALESCE(sum(expense.amount), 0)
  INTO v_cash_expenses
  FROM public.expenses expense
  WHERE expense.tenant_id = v_tenant_id
    AND expense.payment_method = 'cash'
    AND expense.paid_at >= p_since;

  SELECT COALESCE(sum(supplier_payment.amount), 0)
  INTO v_cash_supplier_payments
  FROM public.supplier_payments supplier_payment
  WHERE supplier_payment.tenant_id = v_tenant_id
    AND supplier_payment.payment_method = 'cash'
    AND supplier_payment.payment_date >= p_since;

  SELECT COALESCE(sum(pos_session.cash_difference), 0)
  INTO v_cash_variance_adjustments
  FROM public.pos_sessions pos_session
  WHERE pos_session.tenant_id = v_tenant_id
    AND pos_session.variance_resolution_type = 'accepted_adjustment'
    AND pos_session.variance_resolved_at >= p_since;

  RETURN jsonb_build_object(
    'cash_collections', v_cash_collections,
    'cash_refunds', v_cash_refunds,
    'cash_expenses', v_cash_expenses,
    'cash_supplier_payments', v_cash_supplier_payments,
    'cash_variance_adjustments', v_cash_variance_adjustments
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_inventory_value_period(
  p_start_date date,
  p_end_date date,
  p_branch_id bigint DEFAULT NULL::bigint
) RETURNS TABLE(branch_id bigint, opening_value numeric, closing_value numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
  END IF;
  IF p_branch_id IS NOT NULL
     AND NOT public.has_permission(p_branch_id, 'inventory:read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_start := p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end := (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  WITH allowed_branches AS (
    SELECT b.id
    FROM public.branches b
    WHERE b.tenant_id = v_tenant
      AND b.is_active = true
      AND (p_branch_id IS NULL OR b.id = p_branch_id)
      AND public.has_permission(b.id, 'inventory:read')
  ),
  stock_locations AS (
    SELECT il.id, il.branch_id
    FROM public.inventory_locations il
    JOIN public.branches b ON b.id = il.branch_id
    WHERE il.tenant_id = v_tenant
      AND il.branch_id IN (SELECT ab.id FROM allowed_branches ab)
      AND il.is_active = true
      AND (
        il.location_kind = 'warehouse'
        OR (b.branch_kind = 'central_kitchen' AND il.location_kind = 'production_storage')
      )
  ),
  current_value AS (
    SELECT
      sl.branch_id,
      COALESCE(SUM(
        sl.current_quantity * COALESCE(sl.avg_unit_cost, ingredient.unit_cost, 0)
      ), 0) AS amount
    FROM public.stock_levels sl
    JOIN stock_locations loc ON loc.id = sl.location_id
    LEFT JOIN public.ingredients ingredient
      ON ingredient.id = sl.ingredient_id
     AND ingredient.tenant_id = sl.tenant_id
    WHERE sl.tenant_id = v_tenant
    GROUP BY sl.branch_id
  ),
  after_period_value AS (
    SELECT
      movement.branch_id,
      COALESCE(SUM(
        movement.quantity_change * COALESCE(movement.unit_cost, ingredient.unit_cost, 0)
      ), 0) AS amount
    FROM public.stock_movements movement
    JOIN stock_locations loc ON loc.id = movement.location_id
    LEFT JOIN public.ingredients ingredient
      ON ingredient.id = movement.ingredient_id
     AND ingredient.tenant_id = movement.tenant_id
    WHERE movement.tenant_id = v_tenant
      AND movement.created_at >= v_end
    GROUP BY movement.branch_id
  ),
  period_value AS (
    SELECT
      movement.branch_id,
      COALESCE(SUM(
        movement.quantity_change * COALESCE(movement.unit_cost, ingredient.unit_cost, 0)
      ), 0) AS amount
    FROM public.stock_movements movement
    JOIN stock_locations loc ON loc.id = movement.location_id
    LEFT JOIN public.ingredients ingredient
      ON ingredient.id = movement.ingredient_id
     AND ingredient.tenant_id = movement.tenant_id
    WHERE movement.tenant_id = v_tenant
      AND movement.created_at >= v_start
      AND movement.created_at < v_end
    GROUP BY movement.branch_id
  )
  SELECT
    branch.id AS branch_id,
    COALESCE(current_value.amount, 0)
      - COALESCE(after_period_value.amount, 0)
      - COALESCE(period_value.amount, 0) AS opening_value,
    COALESCE(current_value.amount, 0)
      - COALESCE(after_period_value.amount, 0) AS closing_value
  FROM allowed_branches branch
  LEFT JOIN current_value ON current_value.branch_id = branch.id
  LEFT JOIN after_period_value ON after_period_value.branch_id = branch.id
  LEFT JOIN period_value ON period_value.branch_id = branch.id
  ORDER BY branch.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_inventory_value_period(date, date, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_value_period(date, date, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_value_period(date, date, bigint) TO service_role;

COMMENT ON FUNCTION public.get_inventory_value_period(date, date, bigint) IS
  'Returns opening and period-end operational inventory value by reversing post-period and in-period stock movements from current stock value. Movement unit cost falls back to the ingredient reference cost.';

CREATE OR REPLACE FUNCTION public.trg_notify_pos_shift_variance() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_threshold numeric(15,2);
  v_severity text;
  v_cashier_name text;
  v_diff_label text;
  v_diff_amount text;
BEGIN
  IF NEW.status = 'closed'
     AND OLD.status = 'open'
     AND NEW.cash_difference IS NOT NULL
     AND NEW.expected_cash IS NOT NULL THEN
    v_threshold := GREATEST(
      50000::numeric,
      ROUND(COALESCE(NEW.expected_cash, 0) * 0.005, 2)
    );

    IF abs(NEW.cash_difference) > v_threshold THEN
      v_severity := CASE
        WHEN abs(NEW.cash_difference) > v_threshold * 5 THEN 'critical'
        ELSE 'warning'
      END;

      SELECT full_name INTO v_cashier_name
      FROM public.profiles
      WHERE id = NEW.closed_by;

      v_diff_label := CASE
        WHEN NEW.cash_difference > 0 THEN 'thừa'
        ELSE 'thiếu'
      END;
      v_diff_amount := to_char(abs(NEW.cash_difference), 'FM999G999G999');

      INSERT INTO public.notifications (
        tenant_id, target_branch_id, target_roles,
        kind, severity, title, body,
        entity_type, entity_id, action_url, meta,
        dedup_key
      )
      VALUES (
        NEW.tenant_id,
        NEW.branch_id,
        ARRAY['branch_manager', 'owner']::text[],
        'pos.shift_variance',
        v_severity,
        format('Lệch quỹ ca #%s: %s %sđ', NEW.id, v_diff_label, v_diff_amount),
        format(
          '%s đóng ca lúc %s. Két thực %sđ — kỳ vọng %sđ. Ngưỡng cảnh báo %sđ.',
          COALESCE(v_cashier_name, 'Thu ngân'),
          to_char(NEW.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'),
          to_char(COALESCE(NEW.closing_cash, 0), 'FM999G999G999'),
          to_char(NEW.expected_cash, 'FM999G999G999'),
          to_char(v_threshold, 'FM999G999G999')
        ),
        'pos_session',
        NEW.id,
        format('/br/%s/pos-sessions?session=%s', NEW.branch_id, NEW.id),
        jsonb_build_object(
          'session_id', NEW.id,
          'cashier_name', v_cashier_name,
          'opening_cash', NEW.opening_cash,
          'closing_cash', NEW.closing_cash,
          'expected_cash', NEW.expected_cash,
          'cash_difference', NEW.cash_difference,
          'variance_threshold', v_threshold,
          'variance_note', NEW.variance_approval_note
        ),
        format('pos.shift_variance:%s', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notify_pos_shift_variance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_notify_pos_shift_variance() TO service_role;

UPDATE public.notifications
SET action_url = regexp_replace(
  action_url,
  '^(/br/[0-9]+)/settings/pos-sessions',
  '\1/pos-sessions'
)
WHERE kind = 'pos.shift_variance'
  AND action_url ~ '^/br/[0-9]+/settings/pos-sessions';
