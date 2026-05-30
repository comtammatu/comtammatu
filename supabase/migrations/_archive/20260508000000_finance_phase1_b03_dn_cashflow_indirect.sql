-- =============================================================
-- M6 Finance Phase 1.6 — B03-DN Báo cáo lưu chuyển tiền tệ
-- =============================================================
-- Indirect method (phương pháp gián tiếp) per TT200 schedule B03-DN.
-- Reuses existing vas_report_lines DSL + fn_eval_account_expr — adds
-- 'B03-DN' to the form_code CHECK and seeds the line definitions.
-- A custom wrapper fn_generate_b03_dn rolls up subtotals (lines 20,
-- 30, 40, 50) since the DSL has no cross-line reference; opening
-- cash (line 60) requires a balance up to start_date - 1 which the
-- DSL also can't express directly. All other lines flow through
-- fn_eval_account_expr unchanged.
--
-- Audit invariant: line 70 (closing cash) - line 60 (opening cash)
-- MUST equal line 50 (net cashflow); the wrapper exposes the diff
-- in a 'consistency_check' JSONB block so the UI can flag a tie-out
-- mismatch.
--
-- Pilot scope: lines 01, 02, 09, 10, 11 (operating); 21, 22 (investing);
-- 31, 34 (financing); 20, 30, 40, 50, 60, 70 (subtotals + cash). TT200
-- has many more lines (03-08, 12-19, 23-29, 32-33, 35-39, 41-49, 61) —
-- those derive from instruments pilot doesn't have (long-term debt,
-- FX gain/loss, interest paid). Add them when the underlying entry
-- types appear in journal_entries.
--
-- Rule CASHFLOW-CLASSIFY-USES-COA-FLAG (regression rule 2026-04-28):
-- Future report changes MUST classify by chart_of_accounts.cashflow_section
-- enum, NEVER hardcode account_code prefixes outside this seed file.
-- =============================================================

-- ─── 1. Extend form_code CHECK to allow B03-DN ───

ALTER TABLE public.vas_report_lines
  DROP CONSTRAINT IF EXISTS vas_report_lines_form_code_check;

ALTER TABLE public.vas_report_lines
  ADD CONSTRAINT vas_report_lines_form_code_check
    CHECK (form_code IN ('B01-DN', 'B02-DN', 'B03-DN', '01-GTGT'))
    NOT VALID;

ALTER TABLE public.vas_report_lines
  VALIDATE CONSTRAINT vas_report_lines_form_code_check;

-- ─── 2. Seed B03-DN line definitions (tenant_id NULL = global default) ───

-- Idempotent: existing migration leaves UNIQUE(form_code, line_code,
-- tenant_id, formula_version); ON CONFLICT DO NOTHING lets re-run
-- be safe.
INSERT INTO public.vas_report_lines
  (tenant_id, form_code, line_code, line_label_vi, parent_line, level, formula, display_order, is_total)
VALUES
  -- ── I. Lưu chuyển tiền từ hoạt động kinh doanh ──
  (NULL, 'B03-DN', '01', 'Lợi nhuận trước thuế', NULL, 1,
   '{"op":"sum","args":[
      {"op":"period_credit","account":"511"},
      {"op":"period_credit","account":"515"},
      {"op":"negate","arg":{"op":"period_debit","account":"621"}},
      {"op":"negate","arg":{"op":"period_debit","account":"622"}},
      {"op":"negate","arg":{"op":"period_debit","account":"627"}},
      {"op":"negate","arg":{"op":"period_debit","account":"641"}},
      {"op":"negate","arg":{"op":"period_debit","account":"642"}},
      {"op":"negate","arg":{"op":"period_debit","account":"811"}}
    ]}'::JSONB,
   10, false),

  (NULL, 'B03-DN', '02', 'Khấu hao TSCĐ', '01', 2,
   '{"op":"period_credit","account":"214"}'::JSONB,
   20, false),

  (NULL, 'B03-DN', '09', 'Tăng (giảm) các khoản phải thu', '01', 2,
   '{"op":"negate","arg":{"op":"sum","args":[
      {"op":"period_debit","account":"131"},
      {"op":"negate","arg":{"op":"period_credit","account":"131"}}
    ]}}'::JSONB,
   30, false),

  (NULL, 'B03-DN', '10', 'Tăng (giảm) hàng tồn kho', '01', 2,
   '{"op":"negate","arg":{"op":"sum","args":[
      {"op":"period_debit","account":"152"},
      {"op":"negate","arg":{"op":"period_credit","account":"152"}},
      {"op":"period_debit","account":"153"},
      {"op":"negate","arg":{"op":"period_credit","account":"153"}},
      {"op":"period_debit","account":"156"},
      {"op":"negate","arg":{"op":"period_credit","account":"156"}}
    ]}}'::JSONB,
   40, false),

  (NULL, 'B03-DN', '11', 'Tăng (giảm) các khoản phải trả', '01', 2,
   '{"op":"sum","args":[
      {"op":"period_credit","account":"331"},
      {"op":"negate","arg":{"op":"period_debit","account":"331"}},
      {"op":"period_credit","account":"334"},
      {"op":"negate","arg":{"op":"period_debit","account":"334"}},
      {"op":"period_credit","account":"335"},
      {"op":"negate","arg":{"op":"period_debit","account":"335"}},
      {"op":"period_credit","account":"338"},
      {"op":"negate","arg":{"op":"period_debit","account":"338"}}
    ]}'::JSONB,
   50, false),

  -- Subtotal — computed in wrapper
  (NULL, 'B03-DN', '20', 'Lưu chuyển tiền thuần từ hoạt động kinh doanh', NULL, 1,
   '{"op":"literal","value":0}'::JSONB,
   60, true),

  -- ── II. Lưu chuyển tiền từ hoạt động đầu tư ──
  (NULL, 'B03-DN', '21', 'Tiền chi để mua sắm, xây dựng TSCĐ', NULL, 2,
   '{"op":"negate","arg":{"op":"period_debit","account":"211"}}'::JSONB,
   70, false),

  (NULL, 'B03-DN', '22', 'Tiền thu từ thanh lý, nhượng bán TSCĐ', NULL, 2,
   '{"op":"period_credit","account":"211"}'::JSONB,
   80, false),

  -- Subtotal — computed in wrapper
  (NULL, 'B03-DN', '30', 'Lưu chuyển tiền thuần từ hoạt động đầu tư', NULL, 1,
   '{"op":"literal","value":0}'::JSONB,
   90, true),

  -- ── III. Lưu chuyển tiền từ hoạt động tài chính ──
  (NULL, 'B03-DN', '31', 'Tiền thu từ phát hành cổ phiếu, nhận vốn góp', NULL, 2,
   '{"op":"period_credit","account":"411"}'::JSONB,
   100, false),

  (NULL, 'B03-DN', '34', 'Tiền chi cổ tức, chủ sở hữu rút vốn', NULL, 2,
   '{"op":"negate","arg":{"op":"sum","args":[
      {"op":"period_debit","account":"411"},
      {"op":"period_debit","account":"421"}
    ]}}'::JSONB,
   110, false),

  -- Subtotal — computed in wrapper
  (NULL, 'B03-DN', '40', 'Lưu chuyển tiền thuần từ hoạt động tài chính', NULL, 1,
   '{"op":"literal","value":0}'::JSONB,
   120, true),

  -- ── Tổng + đối chiếu tiền ──
  (NULL, 'B03-DN', '50', 'Lưu chuyển tiền thuần trong kỳ', NULL, 1,
   '{"op":"literal","value":0}'::JSONB,
   130, true),

  (NULL, 'B03-DN', '60', 'Tiền và tương đương tiền đầu kỳ', NULL, 1,
   '{"op":"literal","value":0}'::JSONB,
   140, false),

  (NULL, 'B03-DN', '70', 'Tiền và tương đương tiền cuối kỳ', NULL, 1,
   '{"op":"sum","args":[
      {"op":"debit_balance","account":"111"},
      {"op":"debit_balance","account":"112"}
    ]}'::JSONB,
   150, true)
ON CONFLICT (form_code, line_code, tenant_id, formula_version) DO NOTHING;

-- ─── 3. Wrapper RPC fn_generate_b03_dn ───

CREATE OR REPLACE FUNCTION public.fn_generate_b03_dn(
  p_tenant_id  BIGINT,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lines  JSONB := '[]'::JSONB;
  v_row    RECORD;
  v_amount NUMERIC(15,2);
  v_status TEXT := 'draft';
  v_open_count INT;
  -- Per-line buckets to support derived subtotals
  v_t01 NUMERIC(15,2) := 0;
  v_t02 NUMERIC(15,2) := 0;
  v_t09 NUMERIC(15,2) := 0;
  v_t10 NUMERIC(15,2) := 0;
  v_t11 NUMERIC(15,2) := 0;
  v_t20 NUMERIC(15,2) := 0;
  v_t21 NUMERIC(15,2) := 0;
  v_t22 NUMERIC(15,2) := 0;
  v_t30 NUMERIC(15,2) := 0;
  v_t31 NUMERIC(15,2) := 0;
  v_t34 NUMERIC(15,2) := 0;
  v_t40 NUMERIC(15,2) := 0;
  v_t50 NUMERIC(15,2) := 0;
  v_t60 NUMERIC(15,2) := 0;
  v_t70 NUMERIC(15,2) := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id <> public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
  END IF;

  -- 'final' only if every month spanned is closed (mirror B02-DN)
  SELECT COUNT(*) INTO v_open_count
  FROM generate_series(
    date_trunc('month', p_start_date)::DATE,
    date_trunc('month', p_end_date)::DATE,
    INTERVAL '1 month'
  ) AS m
  LEFT JOIN public.fiscal_periods fp
    ON fp.tenant_id = p_tenant_id
   AND fp.period_year = EXTRACT(YEAR FROM m)::INT
   AND fp.period_month = EXTRACT(MONTH FROM m)::INT
  WHERE COALESCE(fp.status, 'open') <> 'closed';
  IF v_open_count = 0 THEN
    v_status := 'final';
  END IF;

  -- Iterate lines in display_order. Subtotals (20, 30, 40, 50) and
  -- opening cash (60) are computed from buckets; everything else
  -- evaluates through the DSL.
  FOR v_row IN
    SELECT line_code, line_label_vi, parent_line, level, formula, display_order, is_total
    FROM public.vas_report_lines
    WHERE form_code = 'B03-DN'
      AND tenant_id IS NULL
    ORDER BY display_order
  LOOP
    IF v_row.line_code = '20' THEN
      v_amount := v_t01 + v_t02 + v_t09 + v_t10 + v_t11;
      v_t20 := v_amount;
    ELSIF v_row.line_code = '30' THEN
      v_amount := v_t21 + v_t22;
      v_t30 := v_amount;
    ELSIF v_row.line_code = '40' THEN
      v_amount := v_t31 + v_t34;
      v_t40 := v_amount;
    ELSIF v_row.line_code = '50' THEN
      v_amount := v_t20 + v_t30 + v_t40;
      v_t50 := v_amount;
    ELSIF v_row.line_code = '60' THEN
      -- Opening cash = balance(111+112) up to (start_date - 1)
      v_amount := public.fn_eval_account_expr(
        p_tenant_id,
        NULL,
        (p_start_date - INTERVAL '1 day')::DATE,
        '{"op":"sum","args":[
           {"op":"debit_balance","account":"111"},
           {"op":"debit_balance","account":"112"}
         ]}'::JSONB
      );
      v_t60 := v_amount;
    ELSE
      v_amount := public.fn_eval_account_expr(
        p_tenant_id,
        p_start_date,
        p_end_date,
        v_row.formula
      );
      -- Capture into bucket vars for subtotal computation
      IF v_row.line_code = '01' THEN v_t01 := v_amount;
      ELSIF v_row.line_code = '02' THEN v_t02 := v_amount;
      ELSIF v_row.line_code = '09' THEN v_t09 := v_amount;
      ELSIF v_row.line_code = '10' THEN v_t10 := v_amount;
      ELSIF v_row.line_code = '11' THEN v_t11 := v_amount;
      ELSIF v_row.line_code = '21' THEN v_t21 := v_amount;
      ELSIF v_row.line_code = '22' THEN v_t22 := v_amount;
      ELSIF v_row.line_code = '31' THEN v_t31 := v_amount;
      ELSIF v_row.line_code = '34' THEN v_t34 := v_amount;
      ELSIF v_row.line_code = '70' THEN v_t70 := v_amount;
      END IF;
    END IF;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'line_code',  v_row.line_code,
      'line_label', v_row.line_label_vi,
      'parent',     v_row.parent_line,
      'level',      v_row.level,
      'amount',     v_amount,
      'is_total',   v_row.is_total
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'form', 'B03-DN',
    'tenant_id', p_tenant_id,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'status', v_status,
    'generated_at', now(),
    'lines', v_lines,
    'consistency_check', jsonb_build_object(
      'opening_cash', v_t60,
      'closing_cash', v_t70,
      'closing_minus_opening', v_t70 - v_t60,
      'net_cashflow', v_t50,
      'difference', (v_t70 - v_t60) - v_t50,
      'consistent', ABS((v_t70 - v_t60) - v_t50) < 1
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_generate_b03_dn(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_generate_b03_dn(BIGINT, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.fn_generate_b03_dn(BIGINT, DATE, DATE) IS
  'TT200 B03-DN Báo cáo lưu chuyển tiền tệ (indirect method). '
  'Returns lines + consistency_check (closing_minus_opening should equal net_cashflow). '
  'Subtotals 20/30/40/50 and opening cash 60 computed in wrapper; '
  'other lines via fn_eval_account_expr DSL.';
