-- =============================================================
-- M6 Branch C — TT200 BCTC mapping table + recursive evaluator
-- =============================================================
-- Stores TT200/2014/TT-BTC line definitions as data, not code.
-- Each line has a JSONB formula DSL evaluated by fn_eval_account_expr.
-- DSL ops:
--   {"op":"balance","account":"AAA"}            -> SUM(debit-credit) up to date (signed)
--   {"op":"debit_balance","account":"AAA"}      -> GREATEST(balance, 0) — for assets
--   {"op":"credit_balance","account":"AAA"}     -> GREATEST(-balance, 0) — for liabilities
--   {"op":"period_credit","account":"AAA"}      -> SUM(credit_amount) within [start, end]
--   {"op":"period_debit","account":"AAA"}       -> SUM(debit_amount) within [start, end]
--   {"op":"sum","args":[...]}                    -> sum of nested expressions
--   {"op":"negate","arg":{...}}                  -> -1 * eval(arg)
--   {"op":"max_zero","arg":{...}}                -> GREATEST(eval(arg), 0)
--
-- account_code matching is PREFIX (e.g. "333" matches "33311"+"33312") so
-- aggregation works even when sub-accounts skip an explicit parent row.
--
-- Single-tenant default: rows seeded with tenant_id = NULL act as fallback
-- when no per-tenant override exists.

CREATE TABLE public.vas_report_lines (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT REFERENCES public.tenants(id) ON DELETE CASCADE,
  form_code       TEXT NOT NULL CHECK (form_code IN ('B01-DN', 'B02-DN', '01-GTGT')),
  line_code       TEXT NOT NULL,
  line_label_vi   TEXT NOT NULL,
  parent_line     TEXT,
  level           INT NOT NULL DEFAULT 1,
  formula         JSONB NOT NULL,
  formula_version TEXT NOT NULL DEFAULT 'TT200-2014',
  display_order   INT NOT NULL,
  is_total        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(form_code, line_code, tenant_id, formula_version)
);

CREATE INDEX idx_vrl_form_order
  ON public.vas_report_lines (form_code, display_order)
  WHERE tenant_id IS NULL;

ALTER TABLE public.vas_report_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vrl_select" ON public.vas_report_lines
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id = public.auth_tenant_id()
  );

GRANT SELECT ON public.vas_report_lines TO authenticated;


-- ─── Recursive expression evaluator ───
-- p_start_date NULL = "from beginning of time" (point-in-time balance sheet);
-- when both dates set, only entries with entry_date in [start, end] participate.

CREATE OR REPLACE FUNCTION public.fn_eval_account_expr(
  p_tenant_id  BIGINT,
  p_start_date DATE,
  p_end_date   DATE,
  p_expr       JSONB
)
RETURNS NUMERIC(15,2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op   TEXT;
  v_acc  TEXT;
  v_sum  NUMERIC(15,2) := 0;
  v_arg  JSONB;
  v_val  NUMERIC(15,2);
BEGIN
  v_op := p_expr ->> 'op';

  IF v_op = 'balance' THEN
    v_acc := p_expr ->> 'account';
    SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
    INTO v_sum
    FROM public.journal_entry_lines jel
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.tenant_id = p_tenant_id
      AND je.status = 'posted'
      AND je.entry_date <= p_end_date
      AND (p_start_date IS NULL OR je.entry_date >= p_start_date)
      AND coa.account_code LIKE v_acc || '%';
    RETURN v_sum;

  ELSIF v_op = 'debit_balance' THEN
    v_acc := p_expr ->> 'account';
    SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
    INTO v_sum
    FROM public.journal_entry_lines jel
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.tenant_id = p_tenant_id
      AND je.status = 'posted'
      AND je.entry_date <= p_end_date
      AND (p_start_date IS NULL OR je.entry_date >= p_start_date)
      AND coa.account_code LIKE v_acc || '%';
    RETURN GREATEST(v_sum, 0);

  ELSIF v_op = 'credit_balance' THEN
    v_acc := p_expr ->> 'account';
    SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0)
    INTO v_sum
    FROM public.journal_entry_lines jel
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.tenant_id = p_tenant_id
      AND je.status = 'posted'
      AND je.entry_date <= p_end_date
      AND (p_start_date IS NULL OR je.entry_date >= p_start_date)
      AND coa.account_code LIKE v_acc || '%';
    RETURN GREATEST(v_sum, 0);

  ELSIF v_op = 'period_credit' THEN
    IF p_start_date IS NULL THEN
      RETURN 0;
    END IF;
    v_acc := p_expr ->> 'account';
    SELECT COALESCE(SUM(jel.credit_amount), 0)
    INTO v_sum
    FROM public.journal_entry_lines jel
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.tenant_id = p_tenant_id
      AND je.status = 'posted'
      AND je.entry_date >= p_start_date
      AND je.entry_date <= p_end_date
      AND coa.account_code LIKE v_acc || '%';
    RETURN v_sum;

  ELSIF v_op = 'period_debit' THEN
    IF p_start_date IS NULL THEN
      RETURN 0;
    END IF;
    v_acc := p_expr ->> 'account';
    SELECT COALESCE(SUM(jel.debit_amount), 0)
    INTO v_sum
    FROM public.journal_entry_lines jel
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.tenant_id = p_tenant_id
      AND je.status = 'posted'
      AND je.entry_date >= p_start_date
      AND je.entry_date <= p_end_date
      AND coa.account_code LIKE v_acc || '%';
    RETURN v_sum;

  ELSIF v_op = 'sum' THEN
    FOR v_arg IN SELECT * FROM jsonb_array_elements(p_expr -> 'args') LOOP
      v_sum := v_sum + public.fn_eval_account_expr(p_tenant_id, p_start_date, p_end_date, v_arg);
    END LOOP;
    RETURN v_sum;

  ELSIF v_op = 'negate' THEN
    RETURN -1 * public.fn_eval_account_expr(p_tenant_id, p_start_date, p_end_date, p_expr -> 'arg');

  ELSIF v_op = 'max_zero' THEN
    v_val := public.fn_eval_account_expr(p_tenant_id, p_start_date, p_end_date, p_expr -> 'arg');
    RETURN GREATEST(v_val, 0);

  ELSIF v_op = 'literal' THEN
    RETURN COALESCE((p_expr ->> 'value')::NUMERIC(15,2), 0);

  ELSE
    RAISE EXCEPTION 'unknown_dsl_op: %', v_op USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_eval_account_expr(BIGINT, DATE, DATE, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_eval_account_expr(BIGINT, DATE, DATE, JSONB) TO authenticated;


-- ─── Generate B01-DN (Bảng Cân Đối Kế Toán) ───
CREATE OR REPLACE FUNCTION public.fn_generate_b01_dn(
  p_tenant_id  BIGINT,
  p_as_of_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lines    JSONB := '[]'::JSONB;
  v_row      RECORD;
  v_amount   NUMERIC(15,2);
  v_period   RECORD;
  v_status   TEXT := 'draft';
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

  -- Determine draft vs final based on whether the period containing as_of_date is closed
  SELECT fp.status INTO v_period
  FROM public.fiscal_periods fp
  WHERE fp.tenant_id = p_tenant_id
    AND fp.period_year = EXTRACT(YEAR FROM p_as_of_date)::INT
    AND fp.period_month = EXTRACT(MONTH FROM p_as_of_date)::INT;
  IF FOUND AND v_period.status = 'closed' THEN
    v_status := 'final';
  END IF;

  FOR v_row IN
    SELECT line_code, line_label_vi, parent_line, level, formula, display_order, is_total
    FROM public.vas_report_lines
    WHERE form_code = 'B01-DN'
      AND tenant_id IS NULL
    ORDER BY display_order
  LOOP
    v_amount := public.fn_eval_account_expr(p_tenant_id, NULL, p_as_of_date, v_row.formula);

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
    'form', 'B01-DN',
    'tenant_id', p_tenant_id,
    'as_of_date', p_as_of_date,
    'status', v_status,
    'generated_at', now(),
    'lines', v_lines
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_generate_b01_dn(BIGINT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_generate_b01_dn(BIGINT, DATE) TO authenticated;


-- ─── Generate B02-DN (Báo Cáo Kết Quả Kinh Doanh) ───
CREATE OR REPLACE FUNCTION public.fn_generate_b02_dn(
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

  -- "final" only if every month spanned is closed
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

  FOR v_row IN
    SELECT line_code, line_label_vi, parent_line, level, formula, display_order, is_total
    FROM public.vas_report_lines
    WHERE form_code = 'B02-DN'
      AND tenant_id IS NULL
    ORDER BY display_order
  LOOP
    v_amount := public.fn_eval_account_expr(p_tenant_id, p_start_date, p_end_date, v_row.formula);

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
    'form', 'B02-DN',
    'tenant_id', p_tenant_id,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'status', v_status,
    'generated_at', now(),
    'lines', v_lines
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_generate_b02_dn(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_generate_b02_dn(BIGINT, DATE, DATE) TO authenticated;


-- ─── Generate Form 01/GTGT (Tờ khai thuế GTGT tháng/quý) ───
CREATE OR REPLACE FUNCTION public.fn_generate_form_01_gtgt(
  p_tenant_id  BIGINT,
  p_year       INT,
  p_month      INT
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
  v_start  DATE;
  v_end    DATE;
  v_status TEXT := 'draft';
  v_period RECORD;
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

  v_start := make_date(p_year, p_month, 1);
  v_end   := (v_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  SELECT fp.status INTO v_period
  FROM public.fiscal_periods fp
  WHERE fp.tenant_id = p_tenant_id
    AND fp.period_year = p_year
    AND fp.period_month = p_month;
  IF FOUND AND v_period.status = 'closed' THEN
    v_status := 'final';
  END IF;

  FOR v_row IN
    SELECT line_code, line_label_vi, parent_line, level, formula, display_order, is_total
    FROM public.vas_report_lines
    WHERE form_code = '01-GTGT'
      AND tenant_id IS NULL
    ORDER BY display_order
  LOOP
    v_amount := public.fn_eval_account_expr(p_tenant_id, v_start, v_end, v_row.formula);

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
    'form', '01-GTGT',
    'tenant_id', p_tenant_id,
    'year', p_year,
    'month', p_month,
    'status', v_status,
    'generated_at', now(),
    'lines', v_lines
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_generate_form_01_gtgt(BIGINT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_generate_form_01_gtgt(BIGINT, INT, INT) TO authenticated;


-- =============================================================
-- SEED: B01-DN (Bảng Cân Đối Kế Toán)
-- =============================================================
-- Mapping bám sát chart of accounts thực tế (F&B simplified):
-- - Không có 632 → GVHB tổng từ 621+622+627
-- - Không có 1331 → VAT đầu vào dùng 33312
-- - Không có 821/635/711 → các dòng tương ứng = 0 (literal)

INSERT INTO public.vas_report_lines
  (tenant_id, form_code, line_code, line_label_vi, parent_line, level, display_order, is_total, formula)
VALUES
  -- A. TÀI SẢN NGẮN HẠN
  (NULL, 'B01-DN', '100', 'A. TÀI SẢN NGẮN HẠN', NULL, 1, 100, true,
   '{"op":"sum","args":[
       {"op":"debit_balance","account":"111"},
       {"op":"debit_balance","account":"112"},
       {"op":"debit_balance","account":"131"},
       {"op":"debit_balance","account":"152"},
       {"op":"debit_balance","account":"153"},
       {"op":"debit_balance","account":"156"}
     ]}'::JSONB),

  (NULL, 'B01-DN', '110', 'I. Tiền và các khoản tương đương tiền', '100', 2, 110, false,
   '{"op":"sum","args":[
       {"op":"debit_balance","account":"111"},
       {"op":"debit_balance","account":"112"}
     ]}'::JSONB),
  (NULL, 'B01-DN', '111', '1. Tiền', '110', 3, 111, false,
   '{"op":"debit_balance","account":"111"}'::JSONB),
  (NULL, 'B01-DN', '112', '2. Tiền gửi ngân hàng', '110', 3, 112, false,
   '{"op":"debit_balance","account":"112"}'::JSONB),

  (NULL, 'B01-DN', '130', 'III. Các khoản phải thu ngắn hạn', '100', 2, 130, false,
   '{"op":"debit_balance","account":"131"}'::JSONB),
  (NULL, 'B01-DN', '131', '1. Phải thu khách hàng', '130', 3, 131, false,
   '{"op":"debit_balance","account":"131"}'::JSONB),

  (NULL, 'B01-DN', '140', 'IV. Hàng tồn kho', '100', 2, 140, false,
   '{"op":"sum","args":[
       {"op":"debit_balance","account":"152"},
       {"op":"debit_balance","account":"153"},
       {"op":"debit_balance","account":"156"}
     ]}'::JSONB),
  (NULL, 'B01-DN', '141', '1. Hàng tồn kho', '140', 3, 141, false,
   '{"op":"sum","args":[
       {"op":"debit_balance","account":"152"},
       {"op":"debit_balance","account":"153"},
       {"op":"debit_balance","account":"156"}
     ]}'::JSONB),

  -- B. TÀI SẢN DÀI HẠN
  (NULL, 'B01-DN', '200', 'B. TÀI SẢN DÀI HẠN', NULL, 1, 200, true,
   '{"op":"sum","args":[
       {"op":"debit_balance","account":"211"},
       {"op":"negate","arg":{"op":"credit_balance","account":"214"}}
     ]}'::JSONB),
  (NULL, 'B01-DN', '220', 'II. Tài sản cố định', '200', 2, 220, false,
   '{"op":"sum","args":[
       {"op":"debit_balance","account":"211"},
       {"op":"negate","arg":{"op":"credit_balance","account":"214"}}
     ]}'::JSONB),
  (NULL, 'B01-DN', '221', '1. TSCĐ hữu hình - Nguyên giá', '220', 3, 221, false,
   '{"op":"debit_balance","account":"211"}'::JSONB),
  (NULL, 'B01-DN', '222', '   - Giá trị hao mòn lũy kế', '220', 3, 222, false,
   '{"op":"negate","arg":{"op":"credit_balance","account":"214"}}'::JSONB),

  -- TỔNG TÀI SẢN
  (NULL, 'B01-DN', '270', 'TỔNG CỘNG TÀI SẢN (270 = 100 + 200)', NULL, 1, 270, true,
   '{"op":"sum","args":[
       {"op":"debit_balance","account":"111"},
       {"op":"debit_balance","account":"112"},
       {"op":"debit_balance","account":"131"},
       {"op":"debit_balance","account":"152"},
       {"op":"debit_balance","account":"153"},
       {"op":"debit_balance","account":"156"},
       {"op":"debit_balance","account":"211"},
       {"op":"negate","arg":{"op":"credit_balance","account":"214"}}
     ]}'::JSONB),

  -- C. NỢ PHẢI TRẢ
  (NULL, 'B01-DN', '300', 'C. NỢ PHẢI TRẢ', NULL, 1, 300, true,
   '{"op":"sum","args":[
       {"op":"credit_balance","account":"331"},
       {"op":"credit_balance","account":"334"},
       {"op":"credit_balance","account":"335"},
       {"op":"credit_balance","account":"338"},
       {"op":"credit_balance","account":"3335"},
       {"op":"credit_balance","account":"33311"},
       {"op":"credit_balance","account":"33312"}
     ]}'::JSONB),

  (NULL, 'B01-DN', '310', 'I. Nợ ngắn hạn', '300', 2, 310, false,
   '{"op":"sum","args":[
       {"op":"credit_balance","account":"331"},
       {"op":"credit_balance","account":"334"},
       {"op":"credit_balance","account":"335"},
       {"op":"credit_balance","account":"338"},
       {"op":"credit_balance","account":"3335"},
       {"op":"credit_balance","account":"33311"},
       {"op":"credit_balance","account":"33312"}
     ]}'::JSONB),
  (NULL, 'B01-DN', '311', '1. Phải trả người bán ngắn hạn', '310', 3, 311, false,
   '{"op":"credit_balance","account":"331"}'::JSONB),
  (NULL, 'B01-DN', '313', '3. Thuế và các khoản phải nộp Nhà nước', '310', 3, 313, false,
   '{"op":"sum","args":[
       {"op":"credit_balance","account":"3335"},
       {"op":"credit_balance","account":"33311"}
     ]}'::JSONB),
  (NULL, 'B01-DN', '314', '4. Phải trả người lao động', '310', 3, 314, false,
   '{"op":"credit_balance","account":"334"}'::JSONB),
  (NULL, 'B01-DN', '315', '5. Chi phí phải trả ngắn hạn', '310', 3, 315, false,
   '{"op":"credit_balance","account":"335"}'::JSONB),
  (NULL, 'B01-DN', '319', '9. Phải trả ngắn hạn khác', '310', 3, 319, false,
   '{"op":"credit_balance","account":"338"}'::JSONB),

  -- D. VỐN CHỦ SỞ HỮU
  (NULL, 'B01-DN', '400', 'D. VỐN CHỦ SỞ HỮU', NULL, 1, 400, true,
   '{"op":"sum","args":[
       {"op":"credit_balance","account":"411"},
       {"op":"credit_balance","account":"421"},
       {"op":"period_credit","account":"511"},
       {"op":"period_credit","account":"515"},
       {"op":"negate","arg":{"op":"period_debit","account":"521"}},
       {"op":"negate","arg":{"op":"period_debit","account":"621"}},
       {"op":"negate","arg":{"op":"period_debit","account":"622"}},
       {"op":"negate","arg":{"op":"period_debit","account":"627"}},
       {"op":"negate","arg":{"op":"period_debit","account":"641"}},
       {"op":"negate","arg":{"op":"period_debit","account":"642"}},
       {"op":"negate","arg":{"op":"period_debit","account":"811"}}
     ]}'::JSONB),

  (NULL, 'B01-DN', '410', 'I. Vốn chủ sở hữu', '400', 2, 410, false,
   '{"op":"sum","args":[
       {"op":"credit_balance","account":"411"},
       {"op":"credit_balance","account":"421"},
       {"op":"period_credit","account":"511"},
       {"op":"period_credit","account":"515"},
       {"op":"negate","arg":{"op":"period_debit","account":"521"}},
       {"op":"negate","arg":{"op":"period_debit","account":"621"}},
       {"op":"negate","arg":{"op":"period_debit","account":"622"}},
       {"op":"negate","arg":{"op":"period_debit","account":"627"}},
       {"op":"negate","arg":{"op":"period_debit","account":"641"}},
       {"op":"negate","arg":{"op":"period_debit","account":"642"}},
       {"op":"negate","arg":{"op":"period_debit","account":"811"}}
     ]}'::JSONB),
  (NULL, 'B01-DN', '411', '1. Vốn góp của chủ sở hữu', '410', 3, 411, false,
   '{"op":"credit_balance","account":"411"}'::JSONB),
  (NULL, 'B01-DN', '421', '11. LN sau thuế chưa phân phối (gồm kỳ này)', '410', 3, 421, false,
   '{"op":"sum","args":[
       {"op":"credit_balance","account":"421"},
       {"op":"period_credit","account":"511"},
       {"op":"period_credit","account":"515"},
       {"op":"negate","arg":{"op":"period_debit","account":"521"}},
       {"op":"negate","arg":{"op":"period_debit","account":"621"}},
       {"op":"negate","arg":{"op":"period_debit","account":"622"}},
       {"op":"negate","arg":{"op":"period_debit","account":"627"}},
       {"op":"negate","arg":{"op":"period_debit","account":"641"}},
       {"op":"negate","arg":{"op":"period_debit","account":"642"}},
       {"op":"negate","arg":{"op":"period_debit","account":"811"}}
     ]}'::JSONB),

  -- TỔNG NGUỒN VỐN
  (NULL, 'B01-DN', '440', 'TỔNG CỘNG NGUỒN VỐN (440 = 300 + 400)', NULL, 1, 440, true,
   '{"op":"sum","args":[
       {"op":"credit_balance","account":"331"},
       {"op":"credit_balance","account":"334"},
       {"op":"credit_balance","account":"335"},
       {"op":"credit_balance","account":"338"},
       {"op":"credit_balance","account":"3335"},
       {"op":"credit_balance","account":"33311"},
       {"op":"credit_balance","account":"33312"},
       {"op":"credit_balance","account":"411"},
       {"op":"credit_balance","account":"421"},
       {"op":"period_credit","account":"511"},
       {"op":"period_credit","account":"515"},
       {"op":"negate","arg":{"op":"period_debit","account":"521"}},
       {"op":"negate","arg":{"op":"period_debit","account":"621"}},
       {"op":"negate","arg":{"op":"period_debit","account":"622"}},
       {"op":"negate","arg":{"op":"period_debit","account":"627"}},
       {"op":"negate","arg":{"op":"period_debit","account":"641"}},
       {"op":"negate","arg":{"op":"period_debit","account":"642"}},
       {"op":"negate","arg":{"op":"period_debit","account":"811"}}
     ]}'::JSONB);

-- =============================================================
-- SEED: B02-DN (Báo Cáo Kết Quả Kinh Doanh)
-- =============================================================
INSERT INTO public.vas_report_lines
  (tenant_id, form_code, line_code, line_label_vi, parent_line, level, display_order, is_total, formula)
VALUES
  (NULL, 'B02-DN', '01', '1. Doanh thu bán hàng và cung cấp dịch vụ', NULL, 1, 1, false,
   '{"op":"period_credit","account":"511"}'::JSONB),
  (NULL, 'B02-DN', '02', '2. Các khoản giảm trừ doanh thu', NULL, 1, 2, false,
   '{"op":"period_debit","account":"521"}'::JSONB),
  (NULL, 'B02-DN', '10', '3. Doanh thu thuần (10 = 01 - 02)', NULL, 1, 10, true,
   '{"op":"sum","args":[
       {"op":"period_credit","account":"511"},
       {"op":"negate","arg":{"op":"period_debit","account":"521"}}
     ]}'::JSONB),
  (NULL, 'B02-DN', '11', '4. Giá vốn hàng bán', NULL, 1, 11, false,
   '{"op":"sum","args":[
       {"op":"period_debit","account":"621"},
       {"op":"period_debit","account":"622"},
       {"op":"period_debit","account":"627"}
     ]}'::JSONB),
  (NULL, 'B02-DN', '20', '5. Lợi nhuận gộp (20 = 10 - 11)', NULL, 1, 20, true,
   '{"op":"sum","args":[
       {"op":"period_credit","account":"511"},
       {"op":"negate","arg":{"op":"period_debit","account":"521"}},
       {"op":"negate","arg":{"op":"period_debit","account":"621"}},
       {"op":"negate","arg":{"op":"period_debit","account":"622"}},
       {"op":"negate","arg":{"op":"period_debit","account":"627"}}
     ]}'::JSONB),
  (NULL, 'B02-DN', '21', '6. Doanh thu hoạt động tài chính', NULL, 1, 21, false,
   '{"op":"period_credit","account":"515"}'::JSONB),
  (NULL, 'B02-DN', '22', '7. Chi phí tài chính', NULL, 1, 22, false,
   '{"op":"literal","value":"0"}'::JSONB),
  (NULL, 'B02-DN', '24', '9. Chi phí bán hàng', NULL, 1, 24, false,
   '{"op":"period_debit","account":"641"}'::JSONB),
  (NULL, 'B02-DN', '25', '10. Chi phí quản lý doanh nghiệp', NULL, 1, 25, false,
   '{"op":"period_debit","account":"642"}'::JSONB),
  (NULL, 'B02-DN', '30', '11. LN thuần từ HĐKD (30 = 20 + 21 - 22 - 24 - 25)', NULL, 1, 30, true,
   '{"op":"sum","args":[
       {"op":"period_credit","account":"511"},
       {"op":"period_credit","account":"515"},
       {"op":"negate","arg":{"op":"period_debit","account":"521"}},
       {"op":"negate","arg":{"op":"period_debit","account":"621"}},
       {"op":"negate","arg":{"op":"period_debit","account":"622"}},
       {"op":"negate","arg":{"op":"period_debit","account":"627"}},
       {"op":"negate","arg":{"op":"period_debit","account":"641"}},
       {"op":"negate","arg":{"op":"period_debit","account":"642"}}
     ]}'::JSONB),
  (NULL, 'B02-DN', '31', '12. Thu nhập khác', NULL, 1, 31, false,
   '{"op":"literal","value":"0"}'::JSONB),
  (NULL, 'B02-DN', '32', '13. Chi phí khác', NULL, 1, 32, false,
   '{"op":"period_debit","account":"811"}'::JSONB),
  (NULL, 'B02-DN', '40', '14. Lợi nhuận khác (40 = 31 - 32)', NULL, 1, 40, true,
   '{"op":"negate","arg":{"op":"period_debit","account":"811"}}'::JSONB),
  (NULL, 'B02-DN', '50', '15. Tổng LN trước thuế (50 = 30 + 40)', NULL, 1, 50, true,
   '{"op":"sum","args":[
       {"op":"period_credit","account":"511"},
       {"op":"period_credit","account":"515"},
       {"op":"negate","arg":{"op":"period_debit","account":"521"}},
       {"op":"negate","arg":{"op":"period_debit","account":"621"}},
       {"op":"negate","arg":{"op":"period_debit","account":"622"}},
       {"op":"negate","arg":{"op":"period_debit","account":"627"}},
       {"op":"negate","arg":{"op":"period_debit","account":"641"}},
       {"op":"negate","arg":{"op":"period_debit","account":"642"}},
       {"op":"negate","arg":{"op":"period_debit","account":"811"}}
     ]}'::JSONB),
  (NULL, 'B02-DN', '51', '16. Chi phí thuế TNDN hiện hành', NULL, 1, 51, false,
   '{"op":"literal","value":"0"}'::JSONB),
  (NULL, 'B02-DN', '52', '17. Chi phí thuế TNDN hoãn lại', NULL, 1, 52, false,
   '{"op":"literal","value":"0"}'::JSONB),
  (NULL, 'B02-DN', '60', '18. LN sau thuế TNDN (60 = 50 - 51 - 52)', NULL, 1, 60, true,
   '{"op":"sum","args":[
       {"op":"period_credit","account":"511"},
       {"op":"period_credit","account":"515"},
       {"op":"negate","arg":{"op":"period_debit","account":"521"}},
       {"op":"negate","arg":{"op":"period_debit","account":"621"}},
       {"op":"negate","arg":{"op":"period_debit","account":"622"}},
       {"op":"negate","arg":{"op":"period_debit","account":"627"}},
       {"op":"negate","arg":{"op":"period_debit","account":"641"}},
       {"op":"negate","arg":{"op":"period_debit","account":"642"}},
       {"op":"negate","arg":{"op":"period_debit","account":"811"}}
     ]}'::JSONB);

-- =============================================================
-- SEED: 01-GTGT (Tờ khai thuế GTGT)
-- =============================================================
INSERT INTO public.vas_report_lines
  (tenant_id, form_code, line_code, line_label_vi, parent_line, level, display_order, is_total, formula)
VALUES
  (NULL, '01-GTGT', '25_out', '[25] VAT đầu ra (Σ credit 33311)', NULL, 1, 1, false,
   '{"op":"period_credit","account":"33311"}'::JSONB),
  (NULL, '01-GTGT', '25_in', '[25] VAT đầu vào được khấu trừ (Σ debit 33312)', NULL, 1, 2, false,
   '{"op":"period_debit","account":"33312"}'::JSONB),
  (NULL, '01-GTGT', '40', '[40] VAT phải nộp = max(0, đầu ra - đầu vào)', NULL, 1, 3, true,
   '{"op":"max_zero","arg":{"op":"sum","args":[
       {"op":"period_credit","account":"33311"},
       {"op":"negate","arg":{"op":"period_debit","account":"33312"}}
     ]}}'::JSONB),
  (NULL, '01-GTGT', '41', '[41] VAT khấu trừ chuyển kỳ sau = max(0, đầu vào - đầu ra)', NULL, 1, 4, true,
   '{"op":"max_zero","arg":{"op":"sum","args":[
       {"op":"period_debit","account":"33312"},
       {"op":"negate","arg":{"op":"period_credit","account":"33311"}}
     ]}}'::JSONB);
