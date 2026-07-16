-- Tighten GRN read policies from tenant-wide to branch-scoped so a procurement
-- user on one branch cannot read GRNs (and their cost data) of other branches.
-- Mirrors the branch-scoped pattern already used by grn_hardblock_overrides and
-- grn_express_extend_audit. Also adds a menu:read gate to recipes_select for
-- parity with the sibling recipes_write / production_recipes_select policies.
--
-- A user who currently relies on the tenant-wide read will now need
-- procurement:read on the GRN's branch (or reports:view_branch / :view_tenant
-- for oversight roles, matching the hardblock policy). No data backfill; this
-- only narrows the SELECT policy.

SET search_path = '';

-- 1. goods_received_notes: tenant-wide -> branch-scoped (table has branch_id).
DROP POLICY IF EXISTS grn_select ON public.goods_received_notes;
CREATE POLICY grn_select ON public.goods_received_notes
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'procurement:read'::text)
      OR public.has_permission(NULL::bigint, 'reports:view_branch'::text)
      OR public.has_permission(NULL::bigint, 'reports:view_tenant'::text)
    )
  );

-- 2. grn_items: no branch_id column -> resolve parent GRN branch.
--    Cost data (unit_cost, total_cost, baseline_variance_pct) lives here, so the
--    join is required to close the cross-branch leak.
DROP POLICY IF EXISTS grn_items_select ON public.grn_items;
CREATE POLICY grn_items_select ON public.grn_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.goods_received_notes g
      WHERE g.id = grn_items.grn_id
        AND g.tenant_id = grn_items.tenant_id
        AND (
          public.has_permission(g.branch_id, 'procurement:read'::text)
          OR public.has_permission(NULL::bigint, 'reports:view_branch'::text)
          OR public.has_permission(NULL::bigint, 'reports:view_tenant'::text)
        )
    )
  );

-- 3. recipes: add menu:read gate for parity with recipes_write (menu:write) and
--    production_recipes_select (menu:read / menu:write). The table is
--    tenant-scoped (no branch_id), so has_permission_any is the correct helper.
DROP POLICY IF EXISTS recipes_select ON public.recipes;
CREATE POLICY recipes_select ON public.recipes
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('menu:read'::text)
      OR public.has_permission_any('menu:write'::text)
    )
  );
