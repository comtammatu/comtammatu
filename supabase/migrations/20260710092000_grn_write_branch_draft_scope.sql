SET search_path = '';

-- grn_items_write was FOR ALL with a tenant-wide has_permission_any('grn_create')
-- predicate: a grn_create holder at any branch could UPDATE/DELETE grn_items of a
-- CONFIRMED GRN at any other branch (diverging the document from posted stock,
-- bypassing the audited amend_grn_line RPC), and FOR ALL also granted a second
-- tenant-wide SELECT path over the branch-scoped grn_items_select. Replace it with
-- explicit INSERT/UPDATE/DELETE policies scoped to the parent GRN's branch and to
-- a draft parent, mirroring the sibling stock_issue_items_write. SELECT is left to
-- grn_items_select alone. Verified against PROD: every active procurement operator
-- holds grn_create at their assigned branch (or tenant-wide), or is owner (bypass),
-- so no legitimate write path loses access; post-confirm edits stay on amend_grn_line.

DROP POLICY IF EXISTS grn_items_write ON public.grn_items;

CREATE POLICY grn_items_insert ON public.grn_items
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.goods_received_notes g
      WHERE g.id = grn_items.grn_id
        AND g.tenant_id = grn_items.tenant_id
        AND g.status = 'draft'
        AND public.has_permission(g.branch_id, 'procurement:grn_create')
    )
  );

CREATE POLICY grn_items_update ON public.grn_items
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.goods_received_notes g
      WHERE g.id = grn_items.grn_id
        AND g.tenant_id = grn_items.tenant_id
        AND g.status = 'draft'
        AND public.has_permission(g.branch_id, 'procurement:grn_create')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.goods_received_notes g
      WHERE g.id = grn_items.grn_id
        AND g.tenant_id = grn_items.tenant_id
        AND g.status = 'draft'
        AND public.has_permission(g.branch_id, 'procurement:grn_create')
    )
  );

CREATE POLICY grn_items_delete ON public.grn_items
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.goods_received_notes g
      WHERE g.id = grn_items.grn_id
        AND g.tenant_id = grn_items.tenant_id
        AND g.status = 'draft'
        AND public.has_permission(g.branch_id, 'procurement:grn_create')
    )
  );

-- grn_update was tenant-wide (has_permission_any) with no status gate: a
-- grn_create/grn_confirm holder at any branch could directly UPDATE a confirmed
-- GRN header at any other branch. Scope to the row's branch and gate to draft.
-- WITH CHECK also admits 'cancelled' so discardGrnDraft (draft -> cancelled) still
-- works; the draft -> confirmed transition remains RPC-only (confirm_goods_receipt_note,
-- SECURITY DEFINER), so no user-client update needs a non-draft pre-image.
DROP POLICY IF EXISTS grn_update ON public.goods_received_notes;

CREATE POLICY grn_update ON public.goods_received_notes
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND status = 'draft'
    AND (
      public.has_permission(branch_id, 'procurement:grn_create')
      OR public.has_permission(branch_id, 'procurement:grn_confirm')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND status IN ('draft', 'cancelled')
    AND (
      public.has_permission(branch_id, 'procurement:grn_create')
      OR public.has_permission(branch_id, 'procurement:grn_confirm')
    )
  );
