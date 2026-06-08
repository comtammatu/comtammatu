-- =============================================================================
-- LEAN CUTOVER — comtammatu CTCP → Hộ Kinh Doanh lean (single app)
-- =============================================================================
-- Áp lên schema ĐẦY ĐỦ (118-baseline / prod 116, có HĐĐT) + 6 fix db-debt-cleanup
-- đã fold; TRIM ~61 bảng dư → lean ~57 bảng (đủ + hardened + lean).
-- Apply → pg_dump → produces the lean baseline.sql (replay-from-empty verified).
--
-- ⚠️ THỨ TỰ CỨNG (grounded trên baseline.sql):
--   1. Drop FK columns (journal_entry_id ×5 KEEP, profiles.area_id, matching cols) TRƯỚC
--   2. Drop bảng CUT (CASCADE)
--   3. ADD cash_entries
--   4. RUNTIME DE-WIRE (C4/C10 RPC recreate) — section riêng bên dưới, soạn từ thân RPC
--
-- ⚠️ KEEP (KHÔNG drop — FK từ bảng GIỮ): inventory_locations (stock_levels/movements/
--    stocktake_sessions FK; stocktake_sessions ON DELETE RESTRICT). branch_attendance_config,
--    branch_feature_flags, printer_agents giữ tạm (fat-trim sau, cần FK-care).
-- =============================================================================

BEGIN;

-- ========================================================================
-- STEP 1 — Gỡ cột FK trỏ vào bảng sắp cắt (làm TRƯỚC để DROP TABLE không bị chặn)
-- ========================================================================

-- 1a. C10: cột journal_entry_id trên 5 bảng GIỮ (GL bị cắt) — baseline L32447/31703/32503/33783/33855
ALTER TABLE public.payments              DROP COLUMN IF EXISTS journal_entry_id;
ALTER TABLE public.goods_received_notes  DROP COLUMN IF EXISTS journal_entry_id;
ALTER TABLE public.payroll_periods       DROP COLUMN IF EXISTS journal_entry_id;
ALTER TABLE public.supplier_invoices     DROP COLUMN IF EXISTS journal_entry_id;
ALTER TABLE public.supplier_payments     DROP COLUMN IF EXISTS journal_entry_id;

-- 1b. C4: cột stock_consumed_status + CHECK trên payments (baseline L23610/23614) — "không trừ kho"
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_stock_consumed_status_check;
ALTER TABLE public.payments DROP COLUMN IF EXISTS stock_consumed_status;

-- 1c. C6: cột 3-way-match trên supplier_invoices (số dư = total_amount − paid_amount, header đã có)
ALTER TABLE public.supplier_invoices DROP COLUMN IF EXISTS matching_status;
ALTER TABLE public.supplier_invoices DROP COLUMN IF EXISTS credit_applied_amount;

-- 1d. flat-branch / area: cột area_id trên profiles (area bị cắt) — ON DELETE SET NULL
ALTER TABLE public.profiles DROP COLUMN IF EXISTS area_id;

-- ========================================================================
-- STEP 2 — Drop RPC sắp bỏ (de-wire body recreate ở STEP 5)
-- ========================================================================
DROP FUNCTION IF EXISTS public.consume_stock_for_order(bigint)              CASCADE; -- C4 L5108
DROP FUNCTION IF EXISTS public.consume_stock_for_order_service(bigint,uuid) CASCADE; -- C4 L5236
DROP FUNCTION IF EXISTS public.create_production_order(bigint,text,text,jsonb) CASCADE; -- L6154
DROP FUNCTION IF EXISTS public.confirm_production_order(bigint)             CASCADE; -- L4412
-- 16 RPC thuần GL/production/transfer (C10/flat-branch) → drop hẳn (verified local: drop sạch, 116→khớp).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT 'public.'||quote_ident(p.proname)||'('||pg_get_function_identity_arguments(p.oid)||')' AS sig
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.prokind='f'
             AND p.proname IN ('auto_post_journal','create_manual_journal_entry','post_manual_journal_entry',
               'void_manual_journal_entry','next_manual_journal_entry_number','fn_eval_account_expr',
               'fn_reconcile_drilldown','fn_reconcile_period','fn_reconcile_sales_by_day',
               'guard_journal_entry_no_delete_posted','guard_journal_entry_period','post_payroll_journal',
               'seed_chart_of_accounts','validate_journal_balance','cancel_production_order','stock_transfer_receive')
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS '||r.sig||' CASCADE'; END LOOP;
END $$;
-- Còn 9 RPC money/GRN/dashboard cần DE-WIRE (giữ logic tiền, bỏ nhánh GL/consume) — xem STEP 5.

-- ========================================================================
-- STEP 3 — Drop bảng CUT theo cụm (CASCADE gỡ FK/policy phụ thuộc còn sót)
-- ========================================================================

-- C10 — GL/VAS (8)
DROP TABLE IF EXISTS
  public.journal_entry_lines, public.journal_entries, public.chart_of_accounts,
  public.posting_rules, public.accounting_periods, public.fiscal_periods,
  public.vas_report_lines, public.permission_audit_log CASCADE;

-- C4 — recipes (menu-BOM, không trừ kho)
DROP TABLE IF EXISTS public.recipes CASCADE;

-- Flat-branch — production (bếp trung tâm) + transfers/issues (inter-branch)
DROP TABLE IF EXISTS
  public.production_order_items, public.production_orders, public.production_recipes,
  public.stock_transfer_items, public.stock_transfers,
  public.stock_issue_items, public.stock_issues CASCADE;

-- C8 — inventory nặng (11)
DROP TABLE IF EXISTS
  public.stocktake_drafts, public.stocktake_conflicts, public.stocktake_zone_locks,
  public.branch_daily_waste_cap, public.branch_express_window, public.grn_express_extend_audit,
  public.grn_hardblock_overrides, public.grn_baseline_pause,
  public.ingredient_abc_class, public.ingredient_category_review_policy,
  public.inventory_qc_settings CASCADE;

-- C6 — supplier engine (giữ suppliers/invoices/payments/GRN; bỏ engine)
DROP TABLE IF EXISTS
  public.supplier_credit_notes, public.supplier_returns, public.supplier_return_items,
  public.supplier_price_list, public.supplier_items CASCADE;

-- C11 — feedback/CRM (6) + notifications phụ + telegram
DROP TABLE IF EXISTS
  public.feedbacks, public.feedback_settings, public.feedback_qr_codes,
  public.feedback_daily_reports, public.feedback_branch_review_settings,
  public.feedback_photo_cleanup_queue,
  public.notification_reads, public.notification_outbox,
  public.telegram_destinations, public.telegram_outbox CASCADE;

-- PO cluster (mua→GRN phẳng) + area + override/trust chuỗi
DROP TABLE IF EXISTS
  public.purchase_order_items, public.purchase_orders, public.tenant_po_counters,
  public.area_branches, public.areas,
  public.branch_override_attempts, public.branch_override_codes,
  public.branch_trusted_egress_ips, public.user_trust_score CASCADE;

-- HRM lean (bỏ HĐLĐ formal + shift machinery cũ → default_shift_id + leave_requests fold sau)
DROP TABLE IF EXISTS
  public.employment_contracts, public.shift_assignments, public.shift_requests CASCADE;

-- Print phụ (C16 — routing gộp JSONB app-side; giữ printers + print_jobs + printer_agents tạm)
DROP TABLE IF EXISTS
  public.printer_print_types, public.printer_menu_categories,
  public.printer_agent_presence_tokens, public.print_template_versions CASCADE;

-- Misc fat
DROP TABLE IF EXISTS
  public.kitchen_daily_counters,   -- C3: derive từ kitchen_send_batches
  public.role_templates,           -- seed-as-code (4 role cố định)
  public.mv_refresh_log CASCADE;

-- ========================================================================
-- STEP 4 — ADD cash_entries (sổ quỹ; thay vai GL đã cắt)
-- ⚠️ Reconcile DDL với bản continue-ts 20260606140000 trước khi chốt (port, đừng divergent)
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.cash_entries (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id   bigint NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  entry_date  date   NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
  direction   text   NOT NULL CHECK (direction IN ('in','out')),
  category    text,
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  note        text,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cash_entries_branch_date_idx ON public.cash_entries (branch_id, entry_date);
ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.cash_entries TO authenticated;
-- RLS: branch+role (mirror pattern bảng tài chính GIỮ — has_permission(branch_id,'finance:view'/'finance:expense_create'))
-- TODO: dán đúng policy theo helper has_permission khi recreate (STEP 5 cùng pass).

COMMIT;

-- =============================================================================
-- STEP 5 — RUNTIME DE-WIRE (CREATE OR REPLACE — soạn từ thân RPC, slice kế)
-- =============================================================================
-- DDL ở trên đã cắt schema; các RPC sau vẫn THAM CHIẾU tên đã drop → phải recreate
-- để KHÔNG lỗi runtime. plpgsql không khoá DROP nên tách được, NHƯNG bắt buộc làm
-- trước khi env phục vụ traffic.
--
-- C4 — bỏ nhánh consume (baseline):
--   • RPC chứa `PERFORM consume_stock_for_order_service(...)` @L3512 (+ SET stock_consumed_status L3523/3585)
--   • RPC chứa `PERFORM consume_stock_for_order(...)` @L19625
--   • reverse_payment_and_post @~L16057-16181: bỏ nhánh khôi-phục-kho theo stock_consumed_status
--
-- C10 — bỏ nhánh auto_post_journal ở 8 caller (baseline lines):
--   confirm_cash_payment L4205 · confirm_payment_and_post L4380 · confirm_vietqr_payment L5049
--   create_payment L6109 · create_supplier_payment L6585 · (production L4635 → RPC đã drop)
--   (payroll L13967) · GRN-confirm L18624
--   → giữ nhánh tiền (đã fail-OPEN EXCEPTION→skip L4387/5060/6120), xoá khối post.
--
-- flat-branch — bỏ validation branch_kind central (L360-376/4100-4104/4443-4453);
--   collapse branches.branch_kind → chỉ 'branch' (update + drop CHECK central).
-- =============================================================================
