-- Re-enforce advisor harden after inventory_topology_physical_qc_cleanup.
-- Local filename order places topology after 20260728170006, so a fresh replay
-- can recreate next_inventory_doc_number without anon revoke, restore the
-- duplicate branches unique, and rewrite stock_issues policies without initplans.
-- Idempotent on already-hardened Greenfield.

BEGIN;

REVOKE ALL ON FUNCTION public.next_inventory_doc_number(bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_inventory_doc_number(bigint, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.attach_supplier_invoice_vat_evidence(bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_supplier_invoice_vat_evidence(bigint, text)
  TO authenticated, service_role;

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

ALTER TABLE public.branches
  DROP CONSTRAINT IF EXISTS branches_id_tenant_key;

COMMIT;
