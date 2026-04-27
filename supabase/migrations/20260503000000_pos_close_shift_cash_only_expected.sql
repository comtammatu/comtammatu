-- =============================================================
-- POS close-shift: expected_cash = opening_cash + CASH paid only
--
-- Bugfix to D1 (migration 20260501000000_pos_close_shift_d1_d3.sql).
--
-- Symptom (2026-04-27):
--   Cashier không đóng được ca: hệ thống báo "lệch tiền" khi két
--   thực tế khớp. Đơn thanh toán bằng VietQR/MoMo (chuyển khoản) bị
--   cộng vào `expected_cash`, nhưng tiền chuyển khoản KHÔNG chạm két
--   vật lý → cashier đếm tiền mặt thực sự < expected_cash bằng đúng
--   tổng tiền chuyển khoản trong ca.
--
-- Root cause:
--   `v_paid_revenue` SUM tất cả `payment_status='paid'` không phân
--   biệt `payment_method`. Mô hình đúng:
--     expected_cash = opening_cash + SUM(paid AND method='cash')
--   tiền VietQR/MoMo vào tài khoản ngân hàng, không vào két.
--
-- Fix:
--   Thêm filter `payment_method = 'cash'` vào subquery tính
--   v_paid_revenue. Giữ nguyên D1 carry-forward + D3 variance gate.
--
-- Reference: tasks/regressions.md POS-CLOSE-SHIFT-CASH-ONLY-EXPECTED
-- =============================================================

CREATE OR REPLACE FUNCTION public.close_pos_session(
  p_session_id BIGINT,
  p_closing_cash NUMERIC(15,2),
  p_note TEXT DEFAULT NULL,
  p_variance_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_session RECORD;
  v_paid_count INT;
  v_unpaid_count INT;
  v_cash_revenue NUMERIC(15,2);
  v_noncash_revenue NUMERIC(15,2);
  v_expected_cash NUMERIC(15,2);
  v_cash_difference NUMERIC(15,2);
  v_threshold NUMERIC(15,2);
  v_closed_by UUID;
  v_variance_approver UUID;
  v_variance_trim TEXT;
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

  -- D1 carry-forward + cash-only expected:
  --   * Only `payment_status='paid'` contributes to expected_cash.
  --   * Of those, only `payment_method='cash'` raises expected_cash.
  --     VietQR/MoMo paid orders settle to bank, not the cash drawer.
  --   * Unpaid orders carry forward to the next session.
  --   * `v_noncash_revenue` is exposed in the JSONB result for the
  --     close-summary UI / phiếu chốt ca audit even though it does
  --     NOT flow into expected_cash.
  SELECT
    COUNT(*) FILTER (WHERE payment_status = 'paid'),
    COUNT(*) FILTER (WHERE payment_status <> 'paid'),
    COALESCE(SUM(total_amount) FILTER (
      WHERE payment_status = 'paid' AND payment_method = 'cash'
    ), 0),
    COALESCE(SUM(total_amount) FILTER (
      WHERE payment_status = 'paid'
        AND (payment_method IS NULL OR payment_method <> 'cash')
    ), 0)
  INTO v_paid_count, v_unpaid_count, v_cash_revenue, v_noncash_revenue
  FROM public.orders
  WHERE pos_session_id = p_session_id
    AND status NOT IN ('cancelled');

  v_expected_cash := v_session.opening_cash + v_cash_revenue;
  v_cash_difference := p_closing_cash - v_expected_cash;

  -- D3: threshold + approval gate.
  v_threshold := GREATEST(50000::NUMERIC, ROUND(v_expected_cash * 0.005, 2));

  IF abs(v_cash_difference) > v_threshold THEN
    IF NOT public.has_permission_any('pos:close_shift_variance_override') THEN
      RAISE EXCEPTION 'variance_requires_bm_approval (diff=%, threshold=%)',
        v_cash_difference, v_threshold
        USING ERRCODE = '42501';
    END IF;

    v_variance_trim := btrim(COALESCE(p_variance_note, ''));
    IF length(v_variance_trim) < 10 THEN
      RAISE EXCEPTION 'variance_note_required (diff=%, threshold=%)',
        v_cash_difference, v_threshold
        USING ERRCODE = '22023';
    END IF;

    v_variance_approver := v_closed_by;
  END IF;

  UPDATE public.pos_sessions
  SET
    status = 'closed',
    closed_at = now(),
    closed_by = v_closed_by,
    closing_cash = p_closing_cash,
    expected_cash = v_expected_cash,
    cash_difference = v_cash_difference,
    note = p_note,
    variance_approval_note = CASE
      WHEN v_variance_approver IS NOT NULL THEN v_variance_trim
      ELSE NULL
    END,
    variance_approver_user_id = v_variance_approver
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id',         p_session_id,
    'opening_cash',       v_session.opening_cash,
    'closing_cash',       p_closing_cash,
    'expected_cash',      v_expected_cash,
    'cash_revenue',       v_cash_revenue,
    'noncash_revenue',    v_noncash_revenue,
    'cash_difference',    v_cash_difference,
    'variance_threshold', v_threshold,
    'variance_approved',  v_variance_approver IS NOT NULL,
    'order_count',        v_paid_count + v_unpaid_count,
    'paid_order_count',   v_paid_count,
    'unpaid_order_count', v_unpaid_count,
    'opened_at',          v_session.opened_at,
    'closed_at',          now()
  );
END;
$$;

COMMENT ON FUNCTION public.close_pos_session(BIGINT, NUMERIC, TEXT, TEXT) IS
  'Close cashier session. expected_cash = opening_cash + SUM(paid AND '
  'payment_method=cash) only — VietQR/MoMo settle to bank, not the cash '
  'drawer. Unpaid orders carry forward to the next session (D1). When '
  '|cash_difference| > max(50k, 0.5%% × expected_cash), requires '
  'pos:close_shift_variance_override + variance_note ≥ 10 chars (D3). '
  'JSONB result exposes cash_revenue + noncash_revenue separately for '
  'phiếu chốt ca audit. Reference: tasks/regressions.md '
  'POS-CLOSE-SHIFT-CASH-ONLY-EXPECTED (2026-04-27).';
