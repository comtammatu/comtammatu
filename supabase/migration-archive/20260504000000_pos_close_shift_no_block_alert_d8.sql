-- =============================================================
-- POS close-shift: bỏ variance block, thay bằng alert cho manager
--
-- Owner decision D8 (2026-04-27): kết ca KHÔNG được block khi lệch quỹ.
-- Thu ngân vẫn đóng ca bình thường; hệ thống gửi notification về cho
-- branch_manager + super_manager + area_manager + owner để xử lý hậu kiểm.
--
-- Supersedes D3 (2026-04-26 — variance > threshold cần BM PIN + note).
-- Lý do: thực tế ca lệch quỹ vẫn cần đóng để bàn giao; chặn close khiến
-- cashier kẹt cuối ca, ăn lương ngoài giờ vô ích, không giải quyết được
-- gốc rễ (lệch tiền là vấn đề audit, không phải vấn đề lock-down).
--
-- Changes:
--   1. close_pos_session RPC: drop RAISE EXCEPTION cho variance — luôn
--      cho phép close. Vẫn record variance_approval_note nếu caller
--      truyền (audit optional, không bắt buộc).
--   2. New trigger trg_notify_pos_shift_variance: AFTER UPDATE OF status
--      trên pos_sessions, fire khi status flip open → closed AND
--      |cash_difference| > max(50.000đ, 0.5% × expected_cash). Insert
--      notification kind 'pos.shift_variance'.
--   3. Permission `pos:close_shift_variance_override` còn lại là no-op —
--      không drop để giữ backward-compat của UI flag, nhưng không gate
--      bất kỳ flow nào nữa.
--
-- Reference: tasks/regressions.md POS-CLOSE-SHIFT-NO-BLOCK-ALERT.
-- =============================================================

-- ─── 1. Replace close_pos_session — drop variance block ──────────────────

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

  -- expected_cash = opening_cash + cash-only paid revenue.
  -- VietQR/MoMo settle to bank, không vào két (POS-CLOSE-SHIFT-CASH-ONLY-EXPECTED).
  -- Unpaid orders carry forward to next session (D1).
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
  v_threshold := GREATEST(50000::NUMERIC, ROUND(v_expected_cash * 0.005, 2));

  -- D8 (2026-04-27): KHÔNG block close khi |diff| > threshold.
  -- Variance > threshold → trigger notify_pos_shift_variance gửi alert
  -- cho manager (xem trigger AFTER UPDATE phía dưới).
  --
  -- variance_approval_note vẫn được record nếu caller truyền (audit
  -- optional). Không validate độ dài, không gate quyền — UI mới đã bỏ
  -- ô input này. Giữ tham số để backward-compat với client cũ chưa update.
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
    -- variance_approver_user_id = NULL (D8 retired approval flow)
    variance_approver_user_id = NULL
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
    'variance_breached',  abs(v_cash_difference) > v_threshold,
    'order_count',        v_paid_count + v_unpaid_count,
    'paid_order_count',   v_paid_count,
    'unpaid_order_count', v_unpaid_count,
    'opened_at',          v_session.opened_at,
    'closed_at',          now()
  );
END;
$$;

COMMENT ON FUNCTION public.close_pos_session(BIGINT, NUMERIC, TEXT, TEXT) IS
  'Close cashier session — KHÔNG block khi variance vượt ngưỡng (D8 2026-04-27). '
  'Variance breach trigger notification về manager qua trg_notify_pos_shift_variance. '
  'expected_cash = opening + SUM(paid AND payment_method=cash). '
  'Unpaid orders carry forward to next session (D1). '
  'JSONB result thêm variance_breached flag để UI hiện toast "đã gửi alert".';


-- ─── 2. Trigger: notify manager khi |diff| > threshold ───────────────────

CREATE OR REPLACE FUNCTION public.trg_notify_pos_shift_variance()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_threshold NUMERIC(15,2);
  v_severity TEXT;
  v_cashier_name TEXT;
  v_diff_label TEXT;
  v_diff_amount TEXT;
BEGIN
  -- Fire chỉ khi đang flip từ open → closed (đảm bảo không trigger lại
  -- bởi correction/audit UPDATE sau đó).
  IF NEW.status = 'closed'
     AND OLD.status = 'open'
     AND NEW.cash_difference IS NOT NULL
     AND NEW.expected_cash IS NOT NULL THEN

    v_threshold := GREATEST(
      50000::NUMERIC,
      ROUND(COALESCE(NEW.expected_cash, 0) * 0.005, 2)
    );

    IF abs(NEW.cash_difference) > v_threshold THEN
      -- Severity: critical nếu vượt 5× threshold (lệch nghiêm trọng,
      -- thường là sót đơn hoặc rút quỹ trộm), warning ngược lại.
      v_severity := CASE
        WHEN abs(NEW.cash_difference) > v_threshold * 5 THEN 'critical'
        ELSE 'warning'
      END;

      SELECT full_name INTO v_cashier_name
      FROM public.profiles WHERE id = NEW.closed_by;

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
        ARRAY['branch_manager', 'super_manager', 'area_manager', 'owner']::TEXT[],
        'pos.shift_variance',
        v_severity,
        format('Lệch quỹ ca #%s: %s %sđ', NEW.id, v_diff_label, v_diff_amount),
        format(
          '%s đóng ca lúc %s. Két thực %sđ — kỳ vọng %sđ. Ngưỡng cảnh báo %sđ.',
          COALESCE(v_cashier_name, 'Thu ngân'),
          to_char(NEW.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                  'HH24:MI DD/MM'),
          to_char(COALESCE(NEW.closing_cash, 0), 'FM999G999G999'),
          to_char(NEW.expected_cash, 'FM999G999G999'),
          to_char(v_threshold, 'FM999G999G999')
        ),
        'pos_session',
        NEW.id,
        format('/br/%s/settings/pos-sessions?session=%s',
               NEW.branch_id, NEW.id),
        jsonb_build_object(
          'session_id',         NEW.id,
          'cashier_name',       v_cashier_name,
          'opening_cash',       NEW.opening_cash,
          'closing_cash',       NEW.closing_cash,
          'expected_cash',      NEW.expected_cash,
          'cash_difference',    NEW.cash_difference,
          'variance_threshold', v_threshold,
          'variance_note',      NEW.variance_approval_note
        ),
        -- Dedup per session: re-close (impossible by design but defensive)
        -- doesn't double-notify.
        format('pos.shift_variance:%s', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_pos_shift_variance_after_update
  ON public.pos_sessions;

CREATE TRIGGER notify_pos_shift_variance_after_update
  AFTER UPDATE OF status ON public.pos_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_pos_shift_variance();

COMMENT ON FUNCTION public.trg_notify_pos_shift_variance() IS
  'D8 (2026-04-27): emit pos.shift_variance notification khi cashier đóng '
  'ca với |cash_difference| > max(50k, 0.5%% × expected_cash). Severity '
  'critical nếu > 5× threshold (~lệch nghiêm trọng), warning ngược lại. '
  'Dedup per session_id chống re-fire.';
