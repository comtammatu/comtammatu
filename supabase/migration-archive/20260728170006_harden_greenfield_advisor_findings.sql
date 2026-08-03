-- Harden Greenfield Supabase advisor findings after the 24h error-log review.
-- Scope:
--   1) Revoke anon EXECUTE on two SECURITY DEFINER RPCs that regained PUBLIC/anon.
--   2) Add explicit deny-all RLS policies on internal tables (RLS on, zero policies).
--   3) Init-plan wrap auth helpers on stock_issues / stock_issue_items write policies.
--   4) Drop duplicate branches (id, tenant_id) unique constraint.

BEGIN;

-- ── 1) Anon must not execute SECURITY DEFINER helpers / RPCs ────────────────

REVOKE ALL ON FUNCTION public.next_inventory_doc_number(bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_inventory_doc_number(bigint, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.attach_supplier_invoice_vat_evidence(bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_supplier_invoice_vat_evidence(bigint, text)
  TO authenticated, service_role;

-- ── 2) RLS-enabled internal tables: explicit deny for client roles ──────────

DROP POLICY IF EXISTS archive_run_log_no_client_access
  ON public.archive_run_log;
CREATE POLICY archive_run_log_no_client_access
  ON public.archive_run_log
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS feedback_rate_buckets_no_client_access
  ON public.feedback_rate_buckets;
CREATE POLICY feedback_rate_buckets_no_client_access
  ON public.feedback_rate_buckets
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS kds_ticket_events_no_client_access
  ON public.kds_ticket_events;
CREATE POLICY kds_ticket_events_no_client_access
  ON public.kds_ticket_events
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS order_daily_counters_no_client_access
  ON public.order_daily_counters;
CREATE POLICY order_daily_counters_no_client_access
  ON public.order_daily_counters
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS reconcile_run_log_no_client_access
  ON public.reconcile_run_log;
CREATE POLICY reconcile_run_log_no_client_access
  ON public.reconcile_run_log
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS self_order_rate_buckets_no_client_access
  ON public.self_order_rate_buckets;
CREATE POLICY self_order_rate_buckets_no_client_access
  ON public.self_order_rate_buckets
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS self_order_request_operations_no_client_access
  ON public.self_order_request_operations;
CREATE POLICY self_order_request_operations_no_client_access
  ON public.self_order_request_operations
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS tax_invoice_buyer_requests_no_client_access
  ON public.tax_invoice_buyer_requests;
CREATE POLICY tax_invoice_buyer_requests_no_client_access
  ON public.tax_invoice_buyer_requests
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ── 3) auth_rls_initplan on stock issue write policies ──────────────────────

DROP POLICY IF EXISTS stock_issues_insert ON public.stock_issues;
CREATE POLICY stock_issues_insert
  ON public.stock_issues
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.auth_tenant_id())
    AND created_by = (SELECT auth.uid())
    AND status = 'draft'
    AND public.has_permission(branch_id, 'inventory:write')
  );

DROP POLICY IF EXISTS stock_issues_update ON public.stock_issues;
CREATE POLICY stock_issues_update
  ON public.stock_issues
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (SELECT public.auth_tenant_id())
    AND created_by = (SELECT auth.uid())
    AND status = 'draft'
    AND (
      issue_type <> 'writeoff'
      OR approval_status = 'not_required'
    )
    AND public.has_permission(branch_id, 'inventory:write')
  )
  WITH CHECK (
    tenant_id = (SELECT public.auth_tenant_id())
    AND created_by = (SELECT auth.uid())
    AND status = 'cancelled'
    AND (
      issue_type <> 'writeoff'
      OR approval_status = 'not_required'
    )
    AND public.has_permission(branch_id, 'inventory:write')
  );

DROP POLICY IF EXISTS stock_issue_items_write ON public.stock_issue_items;
CREATE POLICY stock_issue_items_write
  ON public.stock_issue_items
  TO authenticated
  USING (
    tenant_id = (SELECT public.auth_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM public.stock_issues AS issue
      WHERE issue.id = stock_issue_items.issue_id
        AND issue.tenant_id = stock_issue_items.tenant_id
        AND issue.created_by = (SELECT auth.uid())
        AND issue.status = 'draft'
        AND (
          issue.issue_type <> 'writeoff'
          OR issue.approval_status = 'not_required'
        )
        AND public.has_permission(issue.branch_id, 'inventory:write')
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.auth_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM public.stock_issues AS issue
      WHERE issue.id = stock_issue_items.issue_id
        AND issue.tenant_id = stock_issue_items.tenant_id
        AND issue.created_by = (SELECT auth.uid())
        AND issue.status = 'draft'
        AND (
          issue.issue_type <> 'writeoff'
          OR issue.approval_status = 'not_required'
        )
        AND public.has_permission(issue.branch_id, 'inventory:write')
    )
  );

-- ── 4) Duplicate unique on branches(id, tenant_id) ──────────────────────────
-- All composite FKs currently reference branches_id_tenant_unique; drop the
-- later duplicate branches_id_tenant_key.

ALTER TABLE public.branches
  DROP CONSTRAINT IF EXISTS branches_id_tenant_key;

COMMIT;
