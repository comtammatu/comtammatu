-- =============================================================
-- M4 P0-1 — reverse_payment_and_post atomic refund reversal RPC
--
-- Drafted from `docs/plan/m4-payments-fix.md` §3. Replaces the broken
-- approveRefund flow (status flag flip only) with a single transaction
-- that atomically:
--   1. Locks the refund + payment + order rows for update.
--   2. Validates payment.status='completed' and refund.status='pending'.
--   3. Posts a balanced GL reversal journal (Dr 5111 / Cr 1111 cash or
--      Cr 1121 bank/VietQR/Momo).
--   4. Restores ingredient stock if consumption happened (calls helper
--      restore_stock_for_order; no-op when stock was never consumed).
--   5. Flips payments.status='refunded', orders.payment_status='refunded'.
--   6. Stamps refund.status='approved', approved_at=now(), approved_by.
--   7. Writes one audit_logs row via log_audit().
--
-- Either ALL succeed or the whole transaction rolls back. Enforces
-- regression rule REFUND-MUST-REVERSE-ATOMICALLY.
--
-- Schema extensions also land here so this migration is self-contained:
--   - stock_movements.type CHECK extended to include 'refund_restore'
--   - journal_entries.reference_type CHECK extended to include 'refund'
--
-- Refs: docs/plan/m4-payments-fix.md (drafted 2026-04-28),
-- tasks/regressions.md REFUND-MUST-REVERSE-ATOMICALLY.
-- =============================================================

-- ─── 1. Extend CHECK constraints (additive, additive only) ───────────────

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_type_check
    CHECK (type IN ('adjustment', 'count_adjustment', 'consumption', 'refund_restore'));

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_reference_type_check
    CHECK (reference_type IN ('sale', 'purchase', 'payroll', 'manual', 'adjustment', 'transfer', 'production', 'refund'));


-- ─── 2. Internal helper — restore_stock_for_order ────────────────────────
-- Walks every order_item × recipe ingredient and inserts a positive
-- stock_movement of type='refund_restore'. Does NOT check stock_levels
-- (we already deducted; restoring may push above pre-order level — that's
-- correct, it means we never owed that consumption).
--
-- REVOKE FROM authenticated — only callable by reverse_payment_and_post
-- and other SECURITY DEFINER paths.

CREATE OR REPLACE FUNCTION public.restore_stock_for_order(
  p_order_id  BIGINT,
  p_actor_id  UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order   RECORD;
  v_count   INT := 0;
BEGIN
  SELECT id, tenant_id, branch_id INTO v_order
  FROM public.orders
  WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'restore_stock_for_order: order % not found', p_order_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Insert one positive stock_movement per recipe ingredient × ordered qty
  -- across all order_items that belong to this order. Joins through
  -- menu_items → recipes → recipe_ingredients (the standard consumption
  -- mapping used by consume_stock_for_order_service).
  WITH per_ingredient AS (
    SELECT
      ri.ingredient_id,
      SUM(oi.quantity * ri.quantity_required) AS qty
    FROM public.order_items oi
    JOIN public.menu_items mi
      ON mi.id = oi.menu_item_id
    JOIN public.recipes r
      ON r.menu_item_id = mi.id
    JOIN public.recipe_ingredients ri
      ON ri.recipe_id = r.id
    WHERE oi.order_id = p_order_id
      AND COALESCE(oi.status, '') <> 'cancelled'
    GROUP BY ri.ingredient_id
  ),
  inserted AS (
    INSERT INTO public.stock_movements
      (tenant_id, branch_id, ingredient_id, type, quantity_change, reason, created_by)
    SELECT
      v_order.tenant_id,
      v_order.branch_id,
      pi.ingredient_id,
      'refund_restore',
      pi.qty,
      'Hoàn tiền — restore tồn kho cho đơn ' || p_order_id::TEXT,
      COALESCE(p_actor_id, auth.uid())
    FROM per_ingredient pi
    WHERE pi.qty > 0
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_stock_for_order(BIGINT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_stock_for_order(BIGINT, UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.restore_stock_for_order(BIGINT, UUID) TO service_role;

COMMENT ON FUNCTION public.restore_stock_for_order(BIGINT, UUID) IS
  'M4 (2026-04-29): inserts positive stock_movements of type=refund_restore for every recipe ingredient × ordered quantity. Internal helper for reverse_payment_and_post. Not callable by authenticated users.';


-- ─── 3. reverse_payment_and_post — atomic refund reversal ────────────────

CREATE OR REPLACE FUNCTION public.reverse_payment_and_post(
  p_refund_id  BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_refund          RECORD;
  v_payment         RECORD;
  v_order           RECORD;
  v_actor           UUID := auth.uid();
  v_tenant          BIGINT := public.auth_tenant_id();
  v_je_id           BIGINT;
  v_dr_account_id   BIGINT;
  v_cr_account_id   BIGINT;
  v_cr_account_code TEXT;
  v_entry_number    TEXT;
  v_stock_count     INT := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant claim missing' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('orders:refund_approve') THEN
    RAISE EXCEPTION 'permission denied: orders:refund_approve required'
      USING ERRCODE = '42501';
  END IF;

  -- Lock order: refund → payment → order. Idempotent re-approval handled
  -- by the status check below.
  SELECT id, tenant_id, branch_id, payment_id, order_id, amount, status
  INTO v_refund
  FROM public.refunds
  WHERE id = p_refund_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund % not found', p_refund_id USING ERRCODE = 'P0002';
  END IF;
  IF v_refund.status = 'approved' THEN
    -- Idempotent: already-approved refund returns success without re-running.
    RETURN jsonb_build_object(
      'status', 'already_approved',
      'refund_id', v_refund.id
    );
  END IF;
  IF v_refund.status <> 'pending' THEN
    RAISE EXCEPTION 'refund cannot transition from % to approved', v_refund.status
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id, tenant_id, branch_id, amount, status, method,
         COALESCE(stock_consumed_status, 'ok') AS stock_consumed_status
  INTO v_payment
  FROM public.payments
  WHERE id = v_refund.payment_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % not found', v_refund.payment_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'payment status=% — refund requires completed',
      v_payment.status USING ERRCODE = 'P0001';
  END IF;
  IF v_refund.amount > v_payment.amount THEN
    RAISE EXCEPTION 'refund amount % exceeds payment amount %',
      v_refund.amount, v_payment.amount USING ERRCODE = 'P0001';
  END IF;

  SELECT id, tenant_id, branch_id, payment_status
  INTO v_order
  FROM public.orders
  WHERE id = v_refund.order_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', v_refund.order_id
      USING ERRCODE = 'P0002';
  END IF;

  -- ── Build the GL reversal journal ────────────────────────────────────
  -- Cash → Cr 1111. Bank-style (vietqr / momo / vnpay) → Cr 1121.
  -- Always Dr 5111 (Doanh thu bán hàng và cung cấp dịch vụ).
  v_cr_account_code := CASE
    WHEN v_payment.method = 'cash' THEN '1111'
    ELSE '1121'
  END;

  SELECT id INTO v_dr_account_id
  FROM public.chart_of_accounts
  WHERE tenant_id = v_tenant AND account_code = '5111'
  LIMIT 1;
  IF v_dr_account_id IS NULL THEN
    RAISE EXCEPTION 'chart_of_accounts: 5111 (Doanh thu) missing for tenant %',
      v_tenant USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_cr_account_id
  FROM public.chart_of_accounts
  WHERE tenant_id = v_tenant AND account_code = v_cr_account_code
  LIMIT 1;
  IF v_cr_account_id IS NULL THEN
    RAISE EXCEPTION 'chart_of_accounts: % missing for tenant %',
      v_cr_account_code, v_tenant USING ERRCODE = 'P0002';
  END IF;

  -- Generate entry_number — same JE-YYYYMMDD-NNN pattern as auto_post_journal.
  v_entry_number := 'JE-' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD') ||
                    '-RFN' || lpad(p_refund_id::TEXT, 4, '0');

  INSERT INTO public.journal_entries
    (tenant_id, branch_id, entry_number, entry_date, description,
     reference_type, reference_id, status, posted_by, posted_at, created_by)
  VALUES
    (v_tenant, v_payment.branch_id, v_entry_number, now(),
     'Hoàn tiền — đảo bút toán doanh thu refund #' || p_refund_id::TEXT,
     'refund', p_refund_id, 'posted', v_actor, now(), v_actor)
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines
    (tenant_id, journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES
    (v_tenant, v_je_id, v_dr_account_id, v_refund.amount, 0,
     'Reverse revenue (refund #' || p_refund_id::TEXT || ')'),
    (v_tenant, v_je_id, v_cr_account_id, 0, v_refund.amount,
     'Reverse cash/bank (refund #' || p_refund_id::TEXT || ')');

  -- ── Restore stock if it had been consumed ────────────────────────────
  IF v_payment.stock_consumed_status = 'ok' THEN
    BEGIN
      v_stock_count := public.restore_stock_for_order(v_refund.order_id, v_actor);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'restore_stock_for_order failed: %', SQLERRM;
    END;
  END IF;

  -- ── Flip payment + order status ──────────────────────────────────────
  UPDATE public.payments
     SET status = 'refunded', updated_at = now()
   WHERE id = v_payment.id;

  UPDATE public.orders
     SET payment_status = 'refunded', updated_at = now()
   WHERE id = v_order.id;

  UPDATE public.refunds
     SET status      = 'approved',
         approved_by = v_actor,
         approved_at = now(),
         updated_at  = now()
   WHERE id = v_refund.id;

  -- ── Audit trail ──────────────────────────────────────────────────────
  PERFORM public.log_audit(
    'refund.approve',
    'refund',
    v_refund.id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object(
      'status', 'approved',
      'journal_entry_id', v_je_id,
      'stock_movements_created', v_stock_count
    )
  );

  RETURN jsonb_build_object(
    'status', 'approved',
    'refund_id', v_refund.id,
    'journal_entry_id', v_je_id,
    'stock_movements_created', v_stock_count,
    'payment_new_status', 'refunded',
    'order_new_status', 'refunded'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reverse_payment_and_post(BIGINT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reverse_payment_and_post(BIGINT) TO authenticated;

COMMENT ON FUNCTION public.reverse_payment_and_post(BIGINT) IS
  'M4 P0-1 (2026-04-29): atomic refund reversal. Locks refund→payment→order, posts balanced GL reversal journal (Dr 5111 / Cr 1111 or 1121), restores stock if consumption happened, flips payment + order to refunded, stamps refund.approved_at/by, writes audit_log. Idempotent on already-approved. Gated by orders:refund_approve.';
