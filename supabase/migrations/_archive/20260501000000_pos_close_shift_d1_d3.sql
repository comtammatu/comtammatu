-- =============================================================
-- POS close-shift: D1 carry-forward + D3 variance approval
--
-- Owner decisions 2026-04-26 (tasks/owner-decisions-pos-pass-1.md):
--
-- D1 (close shift while active orders exist):
--   Allow close. Đơn `active/preparing/served/unpaid` carry forward —
--   ca sau (next opener) vẫn nhìn thấy đơn. `expected_cash` chỉ tính
--   `payment_status='paid'`, đơn unpaid không cộng vào ca đang close;
--   khi pay ở ca sau → cộng vào `expected_cash` của ca đó.
--
-- D3 (variance threshold approval):
--   Threshold = max(50.000đ, 0.5% × expected_cash). Khi
--   |cash_difference| vượt threshold:
--     (a) caller phải có quyền `pos:close_shift_variance_override`
--     (b) `p_variance_note` phải ≥ 10 ký tự (sau trim)
--   Cashier role không có override → block với code
--   `variance_requires_bm_approval`. BM/AM/SM/owner mới override được.
-- =============================================================

-- 1. Schema additions on pos_sessions

ALTER TABLE public.pos_sessions
  ADD COLUMN IF NOT EXISTS variance_approval_note TEXT,
  ADD COLUMN IF NOT EXISTS variance_approver_user_id UUID REFERENCES public.profiles(id);

COMMENT ON COLUMN public.pos_sessions.variance_approval_note IS
  'Lý do duyệt chênh lệch cuối ca khi |cash_difference| > max(50k, 0.5% × expected_cash). NULL khi diff trong ngưỡng.';
COMMENT ON COLUMN public.pos_sessions.variance_approver_user_id IS
  'User duyệt chênh lệch (auth.uid() tại close time, phải có pos:close_shift_variance_override). NULL khi diff trong ngưỡng.';

-- 2. Permission catalog + role grants

INSERT INTO public.permission_keys (key, module, description, scope) VALUES
  ('pos:close_shift_variance_override', 'pos',
   'Duyệt đóng ca khi chênh lệch tiền vượt ngưỡng', 'branch')
ON CONFLICT (key) DO NOTHING;

UPDATE public.role_templates
   SET permission_keys = ARRAY(SELECT DISTINCT UNNEST(permission_keys || ARRAY['pos:close_shift_variance_override']))
 WHERE position_code IN ('quan_ly_CN', 'quan_ly_vung', 'super_manager', 'owner')
   AND NOT ('pos:close_shift_variance_override' = ANY(permission_keys));

SELECT public.sync_missing_permissions_from_template();

-- 3. close_pos_session RPC — replace with D1 + D3 semantics

DROP FUNCTION IF EXISTS public.close_pos_session(BIGINT, NUMERIC, TEXT);

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
  v_paid_revenue NUMERIC(15,2);
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

  -- D1: only paid orders contribute to expected_cash. Unpaid orders
  -- carry forward to the next session (ca sau vẫn thấy chúng); when
  -- paid, that revenue counts toward the new session's expected_cash.
  SELECT
    COUNT(*) FILTER (WHERE payment_status = 'paid'),
    COUNT(*) FILTER (WHERE payment_status <> 'paid'),
    COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0)
  INTO v_paid_count, v_unpaid_count, v_paid_revenue
  FROM public.orders
  WHERE pos_session_id = p_session_id
    AND status NOT IN ('cancelled');

  v_expected_cash := v_session.opening_cash + v_paid_revenue;
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

GRANT EXECUTE ON FUNCTION public.close_pos_session(BIGINT, NUMERIC, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.close_pos_session(BIGINT, NUMERIC, TEXT, TEXT) IS
  'Close cashier session with D1 carry-forward + D3 variance approval. '
  'expected_cash sums only payment_status=paid orders (unpaid carry to next '
  'session). When |cash_difference| > max(50k, 0.5% × expected_cash), '
  'requires pos:close_shift_variance_override + variance_note ≥ 10 chars. '
  'Reference: tasks/owner-decisions-pos-pass-1.md (2026-04-26).';
