-- =============================================================
-- Codex review hotfix — fix lint-red functions exposed by Auth v2 +
-- ingredient-cost migrations.
--
-- Scope (from `supabase db lint --linked` 2026-04-26):
--   1. toggle_profile_active reads dropped column profiles.role.
--   2. create_supplier_payment references v_invoice.branch_id, but
--      supplier_invoices has no branch_id; derive from grn → po.
--   3. rotate_/verify_branch_override_code call unqualified crypt()/
--      gen_salt() — function search_path is 'public', pgcrypto lives
--      in `extensions`. Qualify and ensure extension is present.
--   4. fn_reconcile_drilldown ap_payment branch reads sp.supplier_id;
--      column is supplier_invoice_id. Join supplier_invoices for the
--      supplier label.
--   5. mv_daily_revenue: revoke direct SELECT (RLS does not apply to
--      MVs) and expose via SECURITY DEFINER wrapper get_daily_revenue.
--   6. backfill_permissions_from_role still references profiles.role;
--      it is a one-shot ran by 20260422130000 and is now dead. Drop.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. toggle_profile_active — read role from positions table
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_profile_active(p_target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id     UUID;
  v_actor_role   TEXT;
  v_actor_tenant BIGINT;
  v_actor_branch BIGINT;
  v_actor_area   BIGINT;
  v_target_role   TEXT;
  v_target_branch BIGINT;
  v_target_active BOOLEAN;
  v_new_state     BOOLEAN;
BEGIN
  v_actor_id     := auth.uid();
  v_actor_role   := public.auth_role();
  v_actor_tenant := public.auth_tenant_id();
  v_actor_branch := public.auth_branch_id();
  v_actor_area   := public.auth_area_id();

  SELECT COALESCE(po.legacy_role_code, 'unassigned'),
         p.branch_id,
         p.is_active
    INTO v_target_role, v_target_branch, v_target_active
    FROM public.profiles p
    LEFT JOIN public.positions po ON po.id = p.position_id
    WHERE p.id = p_target_id AND p.tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF p_target_id = v_actor_id THEN
    RAISE EXCEPTION 'cannot_toggle_self';
  END IF;

  IF v_actor_role = 'owner' THEN
    NULL;
  ELSIF v_actor_role = 'super_manager' THEN
    IF v_target_role = 'owner' THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  ELSIF v_actor_role = 'area_manager' THEN
    IF v_target_role IN ('owner', 'super_manager', 'area_manager') THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
    IF v_target_branch IS NOT NULL THEN
      PERFORM 1 FROM public.area_branches
      WHERE area_id = v_actor_area
        AND branch_id = v_target_branch
        AND tenant_id = v_actor_tenant;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'area_manager: target not in your area';
      END IF;
    END IF;
  ELSIF v_actor_role = 'branch_manager' THEN
    IF v_target_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager: target not in your branch';
    END IF;
    IF v_target_role IN ('owner', 'super_manager', 'area_manager', 'branch_manager') THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  ELSE
    RAISE EXCEPTION 'permission_denied';
  END IF;

  UPDATE public.profiles
    SET is_active = NOT is_active
    WHERE id = p_target_id AND tenant_id = v_actor_tenant
    RETURNING is_active INTO v_new_state;

  RETURN v_new_state;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_profile_active(UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2. create_supplier_payment — derive branch_id from grn / po
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_supplier_payment(
  p_tenant_id           BIGINT,
  p_supplier_invoice_id BIGINT,
  p_amount              NUMERIC,
  p_payment_method      TEXT,
  p_reference_note      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_invoice     RECORD;
  v_branch_id   BIGINT;
  v_payment_id  BIGINT;
  v_new_paid    NUMERIC(15,2);
  v_new_status  TEXT;
  v_journal_id  BIGINT;
  v_rule_code   TEXT;
  v_lines       JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission_any('finance:ap_pay') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id <> public.auth_tenant_id() THEN RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501'; END IF;
  IF p_payment_method NOT IN ('cash', 'bank_transfer') THEN RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023'; END IF;

  SELECT si.* INTO v_invoice FROM public.supplier_invoices si
  WHERE si.id = p_supplier_invoice_id AND si.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_invoice.payment_status = 'paid' THEN RAISE EXCEPTION 'invoice_already_paid' USING ERRCODE = 'P0001'; END IF;

  v_new_paid := COALESCE(v_invoice.paid_amount, 0) + p_amount;
  IF v_new_paid > v_invoice.total_amount THEN RAISE EXCEPTION 'payment_exceeds_invoice_total' USING ERRCODE = '22023'; END IF;
  v_new_status := CASE WHEN v_new_paid >= v_invoice.total_amount THEN 'paid' ELSE 'partial' END;

  -- Resolve branch_id for the GL posting: prefer GRN, fall back to PO.
  -- supplier_invoices itself has no branch_id (header-level), but every
  -- AP invoice originates from a branch-scoped GRN or PO in this system.
  SELECT branch_id INTO v_branch_id
    FROM public.goods_received_notes
   WHERE id = v_invoice.grn_id;
  IF v_branch_id IS NULL THEN
    SELECT branch_id INTO v_branch_id
      FROM public.purchase_orders
     WHERE id = v_invoice.po_id;
  END IF;

  INSERT INTO public.supplier_payments (tenant_id, supplier_invoice_id, payment_method, amount, payment_date, reference_note, created_by)
  VALUES (p_tenant_id, p_supplier_invoice_id, p_payment_method, p_amount, now(), p_reference_note, v_uid)
  RETURNING id INTO v_payment_id;

  UPDATE public.supplier_invoices
  SET payment_status = v_new_status, paid_amount = v_new_paid,
      paid_at = CASE WHEN v_new_status = 'paid' THEN now() ELSE paid_at END, updated_at = now()
  WHERE id = p_supplier_invoice_id;

  v_rule_code := CASE WHEN p_payment_method = 'cash' THEN 'SUPPLIER_PAYMENT_CASH' ELSE 'SUPPLIER_PAYMENT_BANK' END;
  v_lines := jsonb_build_array(jsonb_build_object(
    'rule_code', v_rule_code, 'amount', p_amount,
    'line_description', 'Thanh toán hóa đơn NCC #' || COALESCE(v_invoice.invoice_number, v_invoice.id::text)
  ));
  v_journal_id := public.auto_post_journal(p_tenant_id, v_branch_id, 'purchase',
    p_supplier_invoice_id, 'Thanh toán NCC hóa đơn #' || COALESCE(v_invoice.invoice_number, v_invoice.id::text),
    v_lines, now(), v_uid);
  IF v_journal_id IS NOT NULL THEN
    UPDATE public.supplier_payments SET journal_entry_id = v_journal_id WHERE id = v_payment_id;
  END IF;

  RETURN jsonb_build_object('payment_id', v_payment_id, 'payment_status', v_new_status, 'journal_entry_id', v_journal_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_payment(BIGINT, BIGINT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_supplier_payment(BIGINT, BIGINT, NUMERIC, TEXT, TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3. branch_override_code RPCs — qualify pgcrypto, ensure extension
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.rotate_branch_override_code(
  p_branch_id BIGINT,
  p_new_code  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'procurement:override_code_rotate') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF length(p_new_code) < 6 THEN
    RAISE EXCEPTION 'override code must be at least 6 characters' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.branch_override_codes (branch_id, code_hash, rotated_at, rotated_by)
  VALUES (p_branch_id, extensions.crypt(p_new_code, extensions.gen_salt('bf', 10)), now(), v_uid)
  ON CONFLICT (branch_id) DO UPDATE
    SET code_hash  = EXCLUDED.code_hash,
        rotated_at = EXCLUDED.rotated_at,
        rotated_by = EXCLUDED.rotated_by;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rotate_branch_override_code(BIGINT, TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION public.verify_branch_override_code(
  p_branch_id BIGINT,
  p_code      TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         UUID := auth.uid();
  v_hash        TEXT;
  v_recent_fail INT;
  v_ok          BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT COUNT(*) INTO v_recent_fail
  FROM public.branch_override_attempts
  WHERE branch_id = p_branch_id
    AND user_id = v_uid
    AND success = false
    AND attempted_at > now() - INTERVAL '1 minute';

  IF v_recent_fail >= 3 THEN
    RAISE EXCEPTION 'override verify rate-limited' USING ERRCODE = '54000';
  END IF;

  SELECT code_hash INTO v_hash
  FROM public.branch_override_codes
  WHERE branch_id = p_branch_id;

  v_ok := v_hash IS NOT NULL AND extensions.crypt(p_code, v_hash) = v_hash;

  INSERT INTO public.branch_override_attempts (branch_id, user_id, success)
  VALUES (p_branch_id, v_uid, v_ok);

  RETURN v_ok;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.verify_branch_override_code(BIGINT, TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4. fn_reconcile_drilldown.ap_payment — fix supplier_id reference
--    Original signature kept (p_side, NUMERIC(15,2)). Only the
--    ap_payment branch changed: description joins supplier_invoices
--    → suppliers, since supplier_payments has no supplier_id.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reconcile_drilldown(
  p_tenant_id  BIGINT,
  p_start_date DATE,
  p_end_date   DATE,
  p_category   TEXT,
  p_side       TEXT,
  p_branch_id  BIGINT DEFAULT NULL,
  p_limit      INT DEFAULT 200
)
RETURNS TABLE (
  ref_id      BIGINT,
  ref_label   TEXT,
  ref_date    TIMESTAMPTZ,
  branch_id   BIGINT,
  amount      NUMERIC(15,2),
  description TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_ids BIGINT[];
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
  IF p_side NOT IN ('subledger', 'gl') THEN
    RAISE EXCEPTION 'invalid_side' USING ERRCODE = '22023';
  END IF;
  IF p_category NOT IN ('sales', 'cogs', 'inventory_in', 'payroll', 'ap_payment') THEN
    RAISE EXCEPTION 'invalid_category' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    p_limit := 200;
  END IF;

  IF p_side = 'gl' THEN
    SELECT ARRAY_AGG(je.id)
    INTO v_entry_ids
    FROM public.journal_entries je
    WHERE je.tenant_id = p_tenant_id
      AND je.status = 'posted'
      AND je.entry_date >= p_start_date
      AND je.entry_date < (p_end_date + INTERVAL '1 day')
      AND (p_branch_id IS NULL OR je.branch_id = p_branch_id);

    IF v_entry_ids IS NULL THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT
      je.id                      AS ref_id,
      je.entry_number            AS ref_label,
      je.entry_date::TIMESTAMPTZ AS ref_date,
      je.branch_id               AS branch_id,
      CASE
        WHEN p_category IN ('sales')                   THEN jel.credit_amount
        WHEN p_category IN ('cogs', 'inventory_in', 'payroll', 'ap_payment')
          THEN jel.debit_amount
        ELSE 0
      END                        AS amount,
      COALESCE(jel.description, je.description) AS description
    FROM public.journal_entry_lines jel
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.tenant_id = p_tenant_id
      AND jel.journal_entry_id = ANY(v_entry_ids)
      AND (
        (p_category = 'sales'        AND coa.account_code IN ('511', '33311') AND je.reference_type = 'sale') OR
        (p_category = 'cogs'         AND coa.account_code = '621'              AND je.reference_type = 'sale') OR
        (p_category = 'inventory_in' AND coa.account_code = '152'              AND je.reference_type = 'purchase') OR
        (p_category = 'payroll'      AND coa.account_code = '622'              AND je.reference_type = 'payroll') OR
        (p_category = 'ap_payment'   AND coa.account_code = '331'              AND je.reference_type = 'purchase')
      )
    ORDER BY je.entry_date DESC, je.id DESC
    LIMIT p_limit;
    RETURN;
  END IF;

  -- p_side = 'subledger'
  IF p_category = 'sales' THEN
    RETURN QUERY
    SELECT
      p.id                                  AS ref_id,
      ('PAY#' || p.id::TEXT)                AS ref_label,
      p.paid_at                             AS ref_date,
      p.branch_id                           AS branch_id,
      p.amount                              AS amount,
      ('Method: ' || COALESCE(p.method, '?')) AS description
    FROM public.payments p
    WHERE p.tenant_id = p_tenant_id
      AND p.status = 'completed'
      AND p.paid_at >= p_start_date
      AND p.paid_at < (p_end_date + INTERVAL '1 day')
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
    ORDER BY p.paid_at DESC
    LIMIT p_limit;

  ELSIF p_category = 'cogs' THEN
    RETURN QUERY
    SELECT
      sm.id                                       AS ref_id,
      ('SM#' || sm.id::TEXT)                      AS ref_label,
      sm.created_at                               AS ref_date,
      sm.branch_id                                AS branch_id,
      (ABS(sm.quantity_change) * sm.unit_cost)    AS amount,
      sm.type::TEXT                               AS description
    FROM public.stock_movements sm
    WHERE sm.tenant_id = p_tenant_id
      AND sm.type = 'consumption'
      AND sm.created_at >= p_start_date
      AND sm.created_at < (p_end_date + INTERVAL '1 day')
      AND (p_branch_id IS NULL OR sm.branch_id = p_branch_id)
    ORDER BY sm.created_at DESC
    LIMIT p_limit;

  ELSIF p_category = 'inventory_in' THEN
    RETURN QUERY
    SELECT
      sm.id                                  AS ref_id,
      ('GRN-SM#' || sm.id::TEXT)             AS ref_label,
      sm.created_at                          AS ref_date,
      sm.branch_id                           AS branch_id,
      (sm.quantity_change * sm.unit_cost)    AS amount,
      sm.type::TEXT                          AS description
    FROM public.stock_movements sm
    WHERE sm.tenant_id = p_tenant_id
      AND sm.type = 'grn_receipt'
      AND sm.created_at >= p_start_date
      AND sm.created_at < (p_end_date + INTERVAL '1 day')
      AND (p_branch_id IS NULL OR sm.branch_id = p_branch_id)
    ORDER BY sm.created_at DESC
    LIMIT p_limit;

  ELSIF p_category = 'payroll' THEN
    RETURN QUERY
    SELECT
      pe.id                                                            AS ref_id,
      ('Lương ' || pp.period_year || '-' || lpad(pp.period_month::TEXT, 2, '0')) AS ref_label,
      (make_date(pp.period_year, pp.period_month, 1))::TIMESTAMPTZ     AS ref_date,
      NULL::BIGINT                                                     AS branch_id,
      pe.gross_total                                                   AS amount,
      pp.status                                                        AS description
    FROM public.payroll_entries pe
    JOIN public.payroll_periods pp ON pp.id = pe.payroll_period_id
    WHERE pe.tenant_id = p_tenant_id
      AND make_date(pp.period_year, pp.period_month, 1) >= date_trunc('month', p_start_date)::DATE
      AND make_date(pp.period_year, pp.period_month, 1) <= date_trunc('month', p_end_date)::DATE
      AND pp.status IN ('approved', 'paid')
    ORDER BY pp.period_year DESC, pp.period_month DESC, pe.id DESC
    LIMIT p_limit;

  ELSIF p_category = 'ap_payment' THEN
    RETURN QUERY
    SELECT
      sp.id                        AS ref_id,
      ('SP#' || sp.id::TEXT)       AS ref_label,
      sp.payment_date::TIMESTAMPTZ AS ref_date,
      NULL::BIGINT                 AS branch_id,
      sp.amount                    AS amount,
      ('NCC ' || COALESCE(s.name, '#' || si.supplier_id::TEXT)
        || ' / HĐ ' || COALESCE(si.invoice_number, si.id::TEXT)) AS description
    FROM public.supplier_payments sp
    JOIN public.supplier_invoices si ON si.id = sp.supplier_invoice_id
    LEFT JOIN public.suppliers      s ON s.id  = si.supplier_id
    WHERE sp.tenant_id = p_tenant_id
      AND sp.payment_date >= p_start_date
      AND sp.payment_date < (p_end_date + INTERVAL '1 day')
    ORDER BY sp.payment_date DESC
    LIMIT p_limit;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_reconcile_drilldown(BIGINT, DATE, DATE, TEXT, TEXT, BIGINT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reconcile_drilldown(BIGINT, DATE, DATE, TEXT, TEXT, BIGINT, INT) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5. mv_daily_revenue — revoke direct grant, expose via wrapper
--    Mirrors the secure_finance_mvs pattern for top_items/food_cost.
-- ─────────────────────────────────────────────────────────────
REVOKE SELECT ON public.mv_daily_revenue FROM anon;
REVOKE SELECT ON public.mv_daily_revenue FROM authenticated;
REVOKE SELECT ON public.mv_daily_revenue FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_daily_revenue(
  p_branch_id  BIGINT,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  date            DATE,
  branch_id       BIGINT,
  tenant_id       BIGINT,
  order_count     BIGINT,
  total_revenue   NUMERIC,
  total_tax       NUMERIC,
  cash_revenue    NUMERIC,
  vietqr_revenue  NUMERIC,
  momo_revenue    NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID;
  v_tenant BIGINT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'permission denied: finance:view required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      m.date,
      m.branch_id,
      m.tenant_id,
      m.order_count,
      m.total_revenue,
      m.total_tax,
      m.cash_revenue,
      m.vietqr_revenue,
      m.momo_revenue
    FROM public.mv_daily_revenue m
    WHERE m.tenant_id = v_tenant
      AND m.branch_id = p_branch_id
      AND m.date >= p_start_date
      AND m.date <= p_end_date
    ORDER BY m.date;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_revenue(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_revenue(BIGINT, DATE, DATE) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6. Drop dead one-shot backfill_permissions_from_role (Auth v2)
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.backfill_permissions_from_role();
