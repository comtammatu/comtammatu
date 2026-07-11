-- =============================================================
-- Auth v2 — Phase 2-RPC: migrate SECURITY DEFINER function gates
-- from auth_role() IN (...) → has_permission*() checks.
--
-- Scope: 13 of the 17 remaining RPCs. The other 4 (admin_update_profile,
-- toggle_profile_active, can_access_branch, stock_transfer_list_branches)
-- use auth_role() as TEXT value for role-hierarchy branching — they stay
-- on the legacy_role_code shadow and work unchanged.
--
-- Gate replacements (branch-scoped RPCs → has_permission(branch, key);
-- tenant-wide RPCs → has_permission_any(key)):
--   bump_kds_ticket              → kds:mark_ready   (any branch; ticket scope enforced by can_access_branch)
--   recall_kds_ticket            → kds:recall       (any branch; ticket scope enforced)
--   close_fiscal_period          → settings:tenant  (tenant-wide)
--   set_branch_kind              → settings:tenant
--   create_supplier_payment      → finance:ap_pay
--   post_payroll_journal         → finance:payroll_approve
--   gl_reconciliation            → finance:view
--   upsert_recipe_lines          → menu:write
--   cancel_production_order      → inventory:production_confirm (any; branch checked later)
--   confirm_production_order     → inventory:production_confirm
--   create_production_order      → has_permission(p_branch_id, 'inventory:production_create')
--   create_stock_transfer_draft  → has_permission on from OR to branch
--   create_stocktake_session     → has_permission(p_branch_id, 'inventory:stocktake_create')
--
-- Owner still bypasses via has_permission()'s built-in positions.code='owner'
-- check. Structural branch_kind gates preserved.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- bump_kds_ticket — kds:mark_ready
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bump_kds_ticket(p_ticket_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_ticket    RECORD;
  v_new_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('kds:mark_ready') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id, tenant_id, branch_id, station_id, order_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND public.can_access_branch(branch_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ticket.status = 'pending' THEN
    v_new_status := 'preparing';
  ELSIF v_ticket.status = 'preparing' THEN
    v_new_status := 'ready';
  ELSE
    RAISE EXCEPTION 'Ticket cannot be bumped from status %', v_ticket.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.kds_tickets
  SET status    = v_new_status,
      bumped_at = now(),
      bumped_by = auth.uid()
  WHERE id = p_ticket_id;

  IF v_new_status = 'ready' THEN
    PERFORM public.check_order_ready(v_ticket.order_id);
  END IF;

  RETURN v_new_status;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- recall_kds_ticket — kds:recall
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recall_kds_ticket(p_ticket_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_ticket     RECORD;
  v_new_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('kds:recall') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id, tenant_id, branch_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND public.can_access_branch(branch_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ticket.status = 'ready' THEN
    v_new_status := 'preparing';
  ELSIF v_ticket.status = 'preparing' THEN
    v_new_status := 'pending';
  ELSE
    RAISE EXCEPTION 'Ticket cannot be recalled from status %', v_ticket.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.kds_tickets
  SET status    = v_new_status,
      bumped_at = NULL,
      bumped_by = NULL
  WHERE id = p_ticket_id;

  RETURN v_new_status;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- close_fiscal_period — settings:tenant
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_fiscal_period(p_tenant_id BIGINT, p_year INTEGER, p_month INTEGER, p_notes TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_period    RECORD;
  v_recon     JSONB;
  v_has_diff  BOOLEAN := FALSE;
  v_item      JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id <> public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT fp.* INTO v_period FROM public.fiscal_periods fp
  WHERE fp.tenant_id = p_tenant_id AND fp.period_month = p_month AND fp.period_year = p_year
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fiscal_period_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_period.status = 'closed' THEN RAISE EXCEPTION 'fiscal_period_already_closed' USING ERRCODE = '22023'; END IF;

  UPDATE public.fiscal_periods SET status = 'closing', updated_at = now() WHERE id = v_period.id;
  PERFORM public.refresh_finance_views();
  v_recon := public.gl_reconciliation(p_tenant_id, p_year, p_month);

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_recon) LOOP
    IF ABS((v_item ->> 'difference')::NUMERIC) > 1 THEN v_has_diff := TRUE; END IF;
  END LOOP;

  UPDATE public.fiscal_periods
  SET status = 'closed', closed_by = v_uid, closed_at = now(),
      notes = concat_ws(' ', NULLIF(v_period.notes, ''), NULLIF(p_notes, ''),
                       CASE WHEN v_has_diff THEN '[CẢNH BÁO: Có chênh lệch đối chiếu]' END),
      updated_at = now()
  WHERE id = v_period.id;

  RETURN jsonb_build_object('period_id', v_period.id, 'status', 'closed',
                            'has_discrepancies', v_has_diff, 'reconciliation', v_recon);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- set_branch_kind — settings:tenant
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_branch_kind(p_branch_id BIGINT, p_kind TEXT DEFAULT 'branch')
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_tenant BIGINT := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('branch', 'branch', 'branch') THEN
    RAISE EXCEPTION 'invalid branch_kind: %', p_kind USING ERRCODE = '22023';
  END IF;
  UPDATE public.branches SET branch_kind = p_kind, updated_at = now()
   WHERE id = p_branch_id AND tenant_id = v_tenant AND is_active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002'; END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- create_supplier_payment — finance:ap_pay
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_supplier_payment(p_tenant_id BIGINT, p_supplier_invoice_id BIGINT, p_amount NUMERIC, p_payment_method TEXT, p_reference_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_invoice RECORD; v_payment_id BIGINT; v_new_paid NUMERIC(15,2); v_new_status TEXT;
  v_journal_id BIGINT; v_rule_code TEXT; v_lines JSONB;
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
  v_journal_id := public.auto_post_journal(p_tenant_id, v_invoice.branch_id, 'purchase',
    p_supplier_invoice_id, 'Thanh toán NCC hóa đơn #' || COALESCE(v_invoice.invoice_number, v_invoice.id::text),
    v_lines, now(), v_uid);
  IF v_journal_id IS NOT NULL THEN
    UPDATE public.supplier_payments SET journal_entry_id = v_journal_id WHERE id = v_payment_id;
  END IF;

  RETURN jsonb_build_object('payment_id', v_payment_id, 'payment_status', v_new_status, 'journal_entry_id', v_journal_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- post_payroll_journal — finance:payroll_approve
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_payroll_journal(p_payroll_period_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_period RECORD; v_totals RECORD; v_lines JSONB := '[]'::JSONB; v_journal_id BIGINT; v_desc TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission_any('finance:payroll_approve') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT pp.* INTO v_period FROM public.payroll_periods pp
  WHERE pp.id = p_payroll_period_id AND pp.tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payroll_period_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_period.status NOT IN ('approved', 'paid') THEN RAISE EXCEPTION 'payroll_not_approved' USING ERRCODE = '22023'; END IF;
  IF v_period.journal_entry_id IS NOT NULL THEN RETURN v_period.journal_entry_id; END IF;

  SELECT
    COALESCE(SUM(pe.gross_total), 0) AS total_gross,
    COALESCE(SUM(pe.bhxh_employee), 0) AS total_bhxh_ee,
    COALESCE(SUM(pe.bhyt_employee), 0) AS total_bhyt_ee,
    COALESCE(SUM(pe.bhtn_employee), 0) AS total_bhtn_ee,
    COALESCE(SUM(pe.bhxh_employer), 0) AS total_bhxh_er,
    COALESCE(SUM(pe.bhyt_employer), 0) AS total_bhyt_er,
    COALESCE(SUM(pe.bhtn_employer), 0) AS total_bhtn_er,
    COALESCE(SUM(pe.pit_tax), 0) AS total_pit
  INTO v_totals
  FROM public.payroll_entries pe
  WHERE pe.payroll_period_id = p_payroll_period_id AND pe.tenant_id = v_tenant;

  IF v_totals.total_gross > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('rule_code','PAYROLL_SALARY','amount',v_totals.total_gross,
      'line_description','Lương T'||v_period.period_month||'/'||v_period.period_year));
  END IF;
  IF v_totals.total_bhxh_er > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('rule_code','PAYROLL_BHXH_ER','amount',v_totals.total_bhxh_er,
      'line_description','BHXH DN T'||v_period.period_month||'/'||v_period.period_year));
  END IF;
  IF v_totals.total_bhyt_er > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('rule_code','PAYROLL_BHYT_ER','amount',v_totals.total_bhyt_er,
      'line_description','BHYT DN T'||v_period.period_month||'/'||v_period.period_year));
  END IF;
  IF v_totals.total_bhtn_er > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('rule_code','PAYROLL_BHTN_ER','amount',v_totals.total_bhtn_er,
      'line_description','BHTN DN T'||v_period.period_month||'/'||v_period.period_year));
  END IF;
  IF v_totals.total_pit > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('rule_code','PAYROLL_PIT','amount',v_totals.total_pit,
      'line_description','Thuế TNCN T'||v_period.period_month||'/'||v_period.period_year));
  END IF;
  IF v_totals.total_bhxh_ee > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('rule_code','PAYROLL_BHXH_EE','amount',v_totals.total_bhxh_ee,
      'line_description','BHXH NLĐ T'||v_period.period_month||'/'||v_period.period_year));
  END IF;
  IF v_totals.total_bhyt_ee > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('rule_code','PAYROLL_BHYT_EE','amount',v_totals.total_bhyt_ee,
      'line_description','BHYT NLĐ T'||v_period.period_month||'/'||v_period.period_year));
  END IF;
  IF v_totals.total_bhtn_ee > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('rule_code','PAYROLL_BHTN_EE','amount',v_totals.total_bhtn_ee,
      'line_description','BHTN NLĐ T'||v_period.period_month||'/'||v_period.period_year));
  END IF;

  v_desc := 'Lương tháng ' || v_period.period_month || '/' || v_period.period_year;
  v_journal_id := public.auto_post_journal(v_tenant, NULL, 'payroll', p_payroll_period_id, v_desc, v_lines,
    (make_date(v_period.period_year, v_period.period_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::TIMESTAMPTZ, v_uid);
  IF v_journal_id IS NOT NULL THEN
    UPDATE public.payroll_periods SET journal_entry_id = v_journal_id WHERE id = p_payroll_period_id;
  END IF;
  RETURN v_journal_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- gl_reconciliation — finance:view
-- Body preserved as-is from previous version; only gate changes.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gl_reconciliation(p_tenant_id BIGINT, p_year INTEGER, p_month INTEGER)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_start_date DATE; v_end_date DATE;
  v_result JSONB := '[]'::JSONB; v_sub_total NUMERIC(15,2); v_gl_total NUMERIC(15,2); v_entry_ids BIGINT[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id <> public.auth_tenant_id() THEN RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501'; END IF;

  v_start_date := make_date(p_year, p_month, 1);
  v_end_date   := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  SELECT ARRAY_AGG(je.id) INTO v_entry_ids
  FROM public.journal_entries je
  WHERE je.tenant_id = p_tenant_id AND je.status = 'posted'
    AND je.entry_date >= v_start_date AND je.entry_date < (v_end_date + INTERVAL '1 day');
  IF v_entry_ids IS NULL THEN v_entry_ids := ARRAY[]::BIGINT[]; END IF;

  -- 1. Sales
  SELECT COALESCE(SUM(p.amount), 0) INTO v_sub_total FROM public.payments p
  WHERE p.tenant_id = p_tenant_id AND p.status = 'completed'
    AND p.paid_at >= v_start_date AND p.paid_at < (v_end_date + INTERVAL '1 day');
  SELECT COALESCE(SUM(jel.credit_amount), 0) INTO v_gl_total
  FROM public.journal_entry_lines jel
  JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.tenant_id = p_tenant_id AND jel.journal_entry_id = ANY(v_entry_ids)
    AND coa.account_code IN ('511','33311') AND je.reference_type = 'sale';
  v_result := v_result || jsonb_build_array(jsonb_build_object(
    'category','Doanh thu + VAT (511+33311)','subledger_total',v_sub_total,
    'gl_total',v_gl_total,'difference',v_sub_total - v_gl_total));

  -- 2. COGS
  SELECT COALESCE(SUM(ABS(sm.quantity_change) * sm.unit_cost), 0) INTO v_sub_total
  FROM public.stock_movements sm
  WHERE sm.tenant_id = p_tenant_id AND sm.type = 'consumption'
    AND sm.created_at >= v_start_date AND sm.created_at < (v_end_date + INTERVAL '1 day');
  SELECT COALESCE(SUM(jel.debit_amount), 0) INTO v_gl_total
  FROM public.journal_entry_lines jel JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.tenant_id = p_tenant_id AND jel.journal_entry_id = ANY(v_entry_ids)
    AND coa.account_code = '621' AND je.reference_type = 'sale';
  v_result := v_result || jsonb_build_array(jsonb_build_object(
    'category','Giá vốn bán hàng (621-sale)','subledger_total',v_sub_total,
    'gl_total',v_gl_total,'difference',v_sub_total - v_gl_total));

  -- 3. Inventory in
  SELECT COALESCE(SUM(sm.quantity_change * sm.unit_cost), 0) INTO v_sub_total
  FROM public.stock_movements sm
  WHERE sm.tenant_id = p_tenant_id AND sm.type = 'grn_receipt'
    AND sm.created_at >= v_start_date AND sm.created_at < (v_end_date + INTERVAL '1 day');
  SELECT COALESCE(SUM(jel.debit_amount), 0) INTO v_gl_total
  FROM public.journal_entry_lines jel JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.tenant_id = p_tenant_id AND jel.journal_entry_id = ANY(v_entry_ids)
    AND coa.account_code = '152' AND je.reference_type = 'purchase';
  v_result := v_result || jsonb_build_array(jsonb_build_object(
    'category','Nhập kho NVL (152-purchase)','subledger_total',v_sub_total,
    'gl_total',v_gl_total,'difference',v_sub_total - v_gl_total));

  -- 4. Payroll
  SELECT COALESCE(SUM(pe.gross_total), 0) INTO v_sub_total
  FROM public.payroll_entries pe JOIN public.payroll_periods pp ON pp.id = pe.payroll_period_id
  WHERE pe.tenant_id = p_tenant_id AND pp.period_year = p_year AND pp.period_month = p_month
    AND pp.status IN ('approved','paid');
  SELECT COALESCE(SUM(jel.debit_amount), 0) INTO v_gl_total
  FROM public.journal_entry_lines jel JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.tenant_id = p_tenant_id AND jel.journal_entry_id = ANY(v_entry_ids)
    AND coa.account_code = '622' AND je.reference_type = 'payroll';
  v_result := v_result || jsonb_build_array(jsonb_build_object(
    'category','Lương nhân công (622)','subledger_total',v_sub_total,
    'gl_total',v_gl_total,'difference',v_sub_total - v_gl_total));

  -- 5. AP payments
  SELECT COALESCE(SUM(sp.amount), 0) INTO v_sub_total
  FROM public.supplier_payments sp
  WHERE sp.tenant_id = p_tenant_id AND sp.payment_date >= v_start_date AND sp.payment_date < (v_end_date + INTERVAL '1 day');
  SELECT COALESCE(SUM(jel.debit_amount), 0) INTO v_gl_total
  FROM public.journal_entry_lines jel JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.tenant_id = p_tenant_id AND jel.journal_entry_id = ANY(v_entry_ids)
    AND coa.account_code = '331' AND je.reference_type = 'purchase';
  v_result := v_result || jsonb_build_array(jsonb_build_object(
    'category','Thanh toán NCC (331-purchase)','subledger_total',v_sub_total,
    'gl_total',v_gl_total,'difference',v_sub_total - v_gl_total));

  RETURN v_result;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- upsert_recipe_lines — menu:write
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_recipe_lines(p_menu_item_id BIGINT, p_lines JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_uid    UUID   := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_kept   BIGINT[] := ARRAY[]::BIGINT[];
  v_line   JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission_any('menu:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.menu_items mi WHERE mi.id = p_menu_item_id AND mi.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'menu_item_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'lines_must_be_array' USING ERRCODE = '22023'; END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF (v_line->>'ingredient_id') IS NULL OR (v_line->>'quantity') IS NULL OR (v_line->>'unit') IS NULL THEN
      RAISE EXCEPTION 'invalid_line_shape' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.recipes (tenant_id, menu_item_id, ingredient_id, quantity, unit, note, yield_factor)
    VALUES (v_tenant, p_menu_item_id, (v_line->>'ingredient_id')::BIGINT,
            (v_line->>'quantity')::NUMERIC, v_line->>'unit',
            NULLIF(v_line->>'note',''), COALESCE((v_line->>'yield_factor')::NUMERIC, 1.000))
    ON CONFLICT (menu_item_id, ingredient_id, tenant_id)
    DO UPDATE SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit,
                  note = EXCLUDED.note, yield_factor = EXCLUDED.yield_factor;
    v_kept := v_kept || (v_line->>'ingredient_id')::BIGINT;
  END LOOP;

  DELETE FROM public.recipes r
  WHERE r.tenant_id = v_tenant AND r.menu_item_id = p_menu_item_id
    AND NOT (r.ingredient_id = ANY(v_kept));

  RETURN jsonb_build_object('menu_item_id', p_menu_item_id, 'kept_count', COALESCE(array_length(v_kept, 1), 0));
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- cancel_production_order — inventory:production_confirm
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_production_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_tenant BIGINT := public.auth_tenant_id(); v_order RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission_any('inventory:production_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM public.production_orders
  WHERE id = p_order_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'production_order_not_found' USING ERRCODE = 'P0002'; END IF;

  -- Branch-scoped users must be at the order's branch (kept from legacy)
  IF public.auth_role() IN ('branch_manager', 'production_manager')
     AND (public.auth_branch_id() IS NULL OR public.auth_branch_id() <> v_order.branch_id) THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  IF v_order.status <> 'draft' THEN RAISE EXCEPTION 'production_order_not_draft' USING ERRCODE = '22023'; END IF;

  UPDATE public.production_orders SET status = 'cancelled', updated_at = now()
  WHERE id = p_order_id AND tenant_id = v_tenant;

  RETURN jsonb_build_object('production_order_id', p_order_id, 'status', 'cancelled');
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- create_production_order — has_permission(branch, 'inventory:production_create')
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_production_order(p_branch_id BIGINT, p_production_number TEXT, p_notes TEXT DEFAULT NULL, p_items JSONB DEFAULT '[]'::JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_uid    UUID   := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_branch RECORD; v_order_id BIGINT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:production_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_production_number IS NULL OR btrim(p_production_number) = '' THEN
    RAISE EXCEPTION 'production_number_required' USING ERRCODE = '22023';
  END IF;

  SELECT id, branch_kind INTO v_branch FROM public.branches
  WHERE id = p_branch_id AND tenant_id = v_tenant AND is_active = TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_branch.branch_kind <> 'branch' THEN
    RAISE EXCEPTION 'branch_must_be_branch' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.production_orders (tenant_id, branch_id, production_number, status, notes, created_by)
  VALUES (v_tenant, p_branch_id, p_production_number, 'draft', p_notes, v_uid)
  RETURNING id INTO v_order_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    INSERT INTO public.production_order_items (tenant_id, production_order_id, finished_good_id, quantity, unit)
    SELECT v_tenant, v_order_id, (line->>'finishedGoodId')::BIGINT,
           (line->>'quantity')::NUMERIC(15,3), NULLIF(btrim(line->>'unit'), '')
    FROM jsonb_array_elements(p_items) AS line
    WHERE line ? 'finishedGoodId' AND line ? 'quantity' AND line ? 'unit'
    ON CONFLICT (production_order_id, finished_good_id, tenant_id)
    DO UPDATE SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit;
  END IF;

  RETURN jsonb_build_object('id', v_order_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- confirm_production_order — inventory:production_confirm + branch scope preserved
-- (Large body; gate swap + branch check, rest identical.)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_production_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_order RECORD; v_item RECORD; v_recipe RECORD;
  v_raw_need NUMERIC(15,3); v_output_cost NUMERIC(15,2);
  v_old_q NUMERIC(15,3); v_old_wac NUMERIC(15,2); v_new_q NUMERIC(15,3); v_new_wac NUMERIC(15,2);
  v_need_map JSONB := '{}'::JSONB; v_cost_map JSONB := '{}'::JSONB;
  v_key TEXT; v_need_qty NUMERIC(15,3); v_cost_total NUMERIC(15,2); v_has_recipe BOOLEAN;
  v_total_consumption NUMERIC(15,2) := 0; v_total_output NUMERIC(15,2) := 0;
  v_journal_id BIGINT; v_lines JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission_any('inventory:production_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT po.*, b.branch_kind INTO v_order
  FROM public.production_orders po JOIN public.branches b ON b.id = po.branch_id
  WHERE po.id = p_order_id AND po.tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'production_order_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_order.status <> 'draft' THEN RAISE EXCEPTION 'production_order_not_draft' USING ERRCODE = '22023'; END IF;
  IF v_order.branch_kind <> 'branch' THEN
    RAISE EXCEPTION 'branch_must_be_branch' USING ERRCODE = '23514';
  END IF;
  IF public.auth_role() = 'branch_manager'
     AND (public.auth_branch_id() IS NULL OR public.auth_branch_id() <> v_order.branch_id) THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.production_order_items poi
                 WHERE poi.production_order_id = p_order_id AND poi.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'production_order_empty' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT poi.*, fg.item_kind FROM public.production_order_items poi
                JOIN public.ingredients fg ON fg.id = poi.finished_good_id
                WHERE poi.production_order_id = p_order_id AND poi.tenant_id = v_tenant LOOP
    IF v_item.item_kind <> 'finished_good' THEN
      RAISE EXCEPTION 'production_item_must_be_finished_good' USING ERRCODE = '23514';
    END IF;
    v_output_cost := 0; v_has_recipe := FALSE;
    FOR v_recipe IN
      SELECT pr.ingredient_id, pr.quantity, pr.yield_factor,
             COALESCE(sl.avg_unit_cost, ing.unit_cost, 0) AS raw_unit_cost
      FROM public.production_recipes pr
      JOIN public.ingredients ing ON ing.id = pr.ingredient_id
      LEFT JOIN public.stock_levels sl
        ON sl.tenant_id = v_tenant AND sl.branch_id = v_order.branch_id AND sl.ingredient_id = pr.ingredient_id
      WHERE pr.tenant_id = v_tenant AND pr.finished_good_id = v_item.finished_good_id
    LOOP
      v_has_recipe := TRUE;
      v_raw_need := (v_item.quantity * v_recipe.quantity) / COALESCE(v_recipe.yield_factor, 1.0);
      v_key := v_recipe.ingredient_id::text;
      v_need_map := jsonb_set(v_need_map, ARRAY[v_key],
        to_jsonb(COALESCE((v_need_map ->> v_key)::numeric, 0) + v_raw_need), TRUE);
      v_cost_map := jsonb_set(v_cost_map, ARRAY[v_key],
        to_jsonb(COALESCE((v_cost_map ->> v_key)::numeric, 0) + (v_raw_need * COALESCE(v_recipe.raw_unit_cost, 0))), TRUE);
      v_output_cost := v_output_cost + (v_raw_need * COALESCE(v_recipe.raw_unit_cost, 0));
    END LOOP;
    IF NOT v_has_recipe THEN RAISE EXCEPTION 'production_recipe_missing' USING ERRCODE = 'P0001'; END IF;
    IF v_output_cost < 0 THEN RAISE EXCEPTION 'production_cost_invalid' USING ERRCODE = '22023'; END IF;
    v_cost_total := v_output_cost;
    UPDATE public.production_order_items
    SET unit_cost_at_production = CASE WHEN v_item.quantity > 0 THEN ROUND(v_cost_total / v_item.quantity, 2) ELSE 0 END
    WHERE id = v_item.id;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM jsonb_each_text(v_need_map) AS need(ingredient_id, need_qty)
    LEFT JOIN public.stock_levels sl ON sl.tenant_id = v_tenant
       AND sl.branch_id = v_order.branch_id AND sl.ingredient_id = need.ingredient_id::BIGINT
    WHERE COALESCE(sl.current_quantity, 0) < need.need_qty::NUMERIC
  ) THEN RAISE EXCEPTION 'insufficient_stock_for_production' USING ERRCODE = 'P0001'; END IF;

  FOR v_key, v_need_qty IN SELECT key, value::NUMERIC(15,3) FROM jsonb_each_text(v_need_map) LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant AND sl.branch_id = v_order.branch_id AND sl.ingredient_id = v_key::BIGINT;
    IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;
    INSERT INTO public.stock_movements (tenant_id, branch_id, ingredient_id, type, quantity_change,
                                        reason, created_by, production_order_id, unit_cost)
    VALUES (v_tenant, v_order.branch_id, v_key::BIGINT, 'production_consumption', -v_need_qty,
            'Production ' || v_order.production_number, v_uid, p_order_id, COALESCE(v_old_wac, 0));
    v_total_consumption := v_total_consumption + (v_need_qty * COALESCE(v_old_wac, 0));
  END LOOP;

  FOR v_item IN SELECT poi.*, fg.item_kind FROM public.production_order_items poi
                JOIN public.ingredients fg ON fg.id = poi.finished_good_id
                WHERE poi.production_order_id = p_order_id AND poi.tenant_id = v_tenant LOOP
    v_cost_total := COALESCE(v_item.unit_cost_at_production, 0);
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant AND sl.branch_id = v_order.branch_id AND sl.ingredient_id = v_item.finished_good_id;
    IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;
    INSERT INTO public.stock_movements (tenant_id, branch_id, ingredient_id, type, quantity_change,
                                        reason, created_by, production_order_id, unit_cost)
    VALUES (v_tenant, v_order.branch_id, v_item.finished_good_id, 'production_output', v_item.quantity,
            'Production ' || v_order.production_number, v_uid, p_order_id, v_cost_total);
    v_new_q := COALESCE(v_old_q, 0) + v_item.quantity;
    IF v_new_q > 0 THEN
      v_new_wac := (COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_item.quantity * v_cost_total) / v_new_q;
    ELSE v_new_wac := v_cost_total; END IF;
    UPDATE public.stock_levels sl SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id = v_tenant AND sl.branch_id = v_order.branch_id AND sl.ingredient_id = v_item.finished_good_id;
    UPDATE public.ingredients SET unit_cost = v_cost_total, updated_at = now()
    WHERE id = v_item.finished_good_id AND tenant_id = v_tenant;
    v_total_output := v_total_output + (v_item.quantity * v_cost_total);
  END LOOP;

  UPDATE public.production_orders SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_order_id AND tenant_id = v_tenant;

  v_lines := '[]'::JSONB;
  IF v_total_consumption > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PRODUCTION_CONSUME', 'amount', v_total_consumption,
      'line_description', 'NVL sản xuất ' || v_order.production_number));
  END IF;
  IF v_total_output > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PRODUCTION_OUTPUT', 'amount', v_total_output,
      'line_description', 'Thành phẩm ' || v_order.production_number));
  END IF;
  IF jsonb_array_length(v_lines) > 0 THEN
    v_journal_id := public.auto_post_journal(v_tenant, v_order.branch_id, 'production', p_order_id,
      'Sản xuất ' || v_order.production_number, v_lines, now(), v_uid);
    IF v_journal_id IS NOT NULL THEN
      UPDATE public.production_orders SET journal_entry_id = v_journal_id WHERE id = p_order_id;
    END IF;
  END IF;
  RETURN jsonb_build_object('production_order_id', p_order_id, 'status', 'completed', 'journal_entry_id', v_journal_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- create_stock_transfer_draft — has_permission on from OR to branch
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_stock_transfer_draft(p_from_branch_id BIGINT, p_to_branch_id BIGINT, p_transfer_number TEXT, p_notes TEXT DEFAULT NULL, p_vehicle_info TEXT DEFAULT NULL, p_lines JSONB DEFAULT '[]'::JSONB, p_from_location_id BIGINT DEFAULT NULL, p_to_location_id BIGINT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_transfer_id BIGINT;
  v_is_intra BOOLEAN := (p_from_branch_id = p_to_branch_id);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'tenant_not_found' USING ERRCODE = '22023'; END IF;

  IF NOT (
    public.has_permission(p_from_branch_id, 'inventory:transfer_create')
    OR public.has_permission(p_to_branch_id, 'inventory:transfer_create')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_is_intra THEN
    IF p_from_location_id IS NULL OR p_to_location_id IS NULL THEN
      RAISE EXCEPTION 'intra_branch_requires_locations' USING ERRCODE = '22023';
    END IF;
    IF p_from_location_id = p_to_location_id THEN
      RAISE EXCEPTION 'intra_branch_same_location' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.stock_transfers (
    tenant_id, from_branch_id, to_branch_id, from_location_id, to_location_id,
    transfer_number, status, notes, vehicle_info, created_by
  ) VALUES (
    v_tenant, p_from_branch_id, p_to_branch_id, p_from_location_id, p_to_location_id,
    p_transfer_number, 'draft', p_notes,
    CASE WHEN v_is_intra THEN NULL ELSE p_vehicle_info END, v_uid
  ) RETURNING id INTO v_transfer_id;

  IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
    INSERT INTO public.stock_transfer_items (tenant_id, transfer_id, ingredient_id, quantity, unit)
    SELECT v_tenant, v_transfer_id, (line->>'ingredientId')::BIGINT,
           (line->>'quantity')::NUMERIC(15,3), NULLIF(BTRIM(line->>'unit'), '')
    FROM jsonb_array_elements(p_lines) AS line
    WHERE line ? 'ingredientId' AND line ? 'quantity' AND line ? 'unit'
    ON CONFLICT (transfer_id, ingredient_id, tenant_id)
    DO UPDATE SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit;
  END IF;

  RETURN jsonb_build_object('id', v_transfer_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- create_stocktake_session — has_permission(branch, 'inventory:stocktake_create')
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_stocktake_session(p_branch_id BIGINT, p_location_id BIGINT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_session_id BIGINT; v_loc_id BIGINT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'tenant_not_found' USING ERRCODE = '22023'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:stocktake_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_location_id IS NOT NULL THEN
    SELECT il.id INTO v_loc_id FROM public.inventory_locations il
    WHERE il.id = p_location_id AND il.branch_id = p_branch_id AND il.tenant_id = v_tenant AND il.is_active = TRUE;
    IF NOT FOUND THEN RAISE EXCEPTION 'location_not_found_or_inactive' USING ERRCODE = 'P0002'; END IF;
  ELSE
    SELECT il.id INTO v_loc_id FROM public.inventory_locations il
    WHERE il.branch_id = p_branch_id AND il.tenant_id = v_tenant
      AND il.is_default_receive = TRUE AND il.is_active = TRUE LIMIT 1;
  END IF;

  INSERT INTO public.stocktake_sessions (tenant_id, branch_id, location_id, created_by)
  VALUES (v_tenant, p_branch_id, v_loc_id, v_uid) RETURNING id INTO v_session_id;

  INSERT INTO public.stocktake_lines (tenant_id, session_id, ingredient_id, system_quantity)
  SELECT v_tenant, v_session_id, sl.ingredient_id, sl.current_quantity
  FROM public.stock_levels sl WHERE sl.tenant_id = v_tenant AND sl.branch_id = p_branch_id;

  RETURN jsonb_build_object('id', v_session_id);
END;
$$;
