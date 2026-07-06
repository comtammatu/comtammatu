-- D068: Kho CN (branch) tự nhận NCC (GRN) trực tiếp + sản xuất tại chi nhánh.
-- Actor = branch_manager, own-branch, create + confirm. PO vẫn đóng với branch.
-- Owner-delegated apply (MCP is read-only PROD SELECT). Idempotent form modeled
-- on 20260702094500_branch_stock_operator_actions.sql.
--
-- Until this migration applies, branch_manager holds no grant → the feature is
-- dormant, not broken (the code ships in the same PR).

-- ─────────────────────────────────────────────────────────────────────────────
-- (a) Grants — role_templates + branch-scoped staff_permissions backfill.
--     6 keys: procurement:grn_create/grn_confirm/read/supplier_manage +
--     inventory:production_create/production_confirm. All six already exist in
--     the permission_keys catalog (verified against PROD 2026-07-05).
-- ─────────────────────────────────────────────────────────────────────────────

-- The role_templates UPDATE is intentionally NOT tenant-scoped: Má Tư is
-- single-tenant (D002, tenant id=1), so every branch_manager template row is
-- this tenant's, and DISTINCT-unnest keeps it idempotent. The staff_permissions
-- backfill below IS tenant-scoped (via the profiles join). Add `AND tenant_id =
-- …` here only if this DB ever becomes multi-tenant.
UPDATE public.role_templates
SET permission_keys = ARRAY(
  SELECT DISTINCT unnest(
    COALESCE(permission_keys, ARRAY[]::text[]) || ARRAY[
      'procurement:grn_create',
      'procurement:grn_confirm',
      'procurement:read',
      'procurement:supplier_manage',
      'inventory:production_create',
      'inventory:production_confirm'
    ]
  ) ORDER BY 1
)
WHERE position_code = 'branch_manager';

-- Branch-scoped backfill for active branch_manager operators. branch_id =
-- p.branch_id (NEVER NULL — a null/tenant-wide grant would defeat the RLS
-- branch-membership check). One row per (user, branch, key).
INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template,
  granted_at,
  valid_from
)
SELECT
  p.id,
  p.tenant_id,
  p.branch_id,
  k.permission_key,
  rt.id,
  now(),
  now()
FROM public.profiles p
JOIN public.positions po
  ON po.id = p.position_id
 AND po.tenant_id = p.tenant_id
LEFT JOIN public.role_templates rt
  ON rt.tenant_id = p.tenant_id
 AND rt.position_code = 'branch_manager'
CROSS JOIN (
  VALUES
    ('procurement:grn_create'),
    ('procurement:grn_confirm'),
    ('procurement:read'),
    ('procurement:supplier_manage'),
    ('inventory:production_create'),
    ('inventory:production_confirm')
) AS k(permission_key)
WHERE po.code = 'branch_manager'
  AND p.branch_id IS NOT NULL
  AND p.is_active IS DISTINCT FROM false
ON CONFLICT (user_id, branch_id, permission_key) WHERE branch_id IS NOT NULL
DO UPDATE SET
  source_template = COALESCE(public.staff_permissions.source_template, EXCLUDED.source_template);

-- ─────────────────────────────────────────────────────────────────────────────
-- (b) GRN RLS hardening (F1.2) — DEFERRED, intentionally NOT applied.
--     The MANDATORY cross-branch guard is the app layer (isProcurementBranchInScope
--     / canAccessProcurementBranch), already shipped in the same PR. Hardening
--     grn_insert/update/items_write from has_permission_any(key) to
--     has_permission(branch_id, key) was defense-in-depth only.
--     PROD reality (verified 2026-07-05): grn_create grants are per-branch —
--     owner holds it on branch 2 only, office on 2/3 only — and the current
--     has_permission_any lets them create GRNs for the central sites (Kho Tổng
--     branch 15 / Bếp TT 16). Applying this hardening would LOCK owner/office out
--     of central-site GRN creation. It only closes a pre-existing direct-PostgREST
--     path (branch_manager already held grn_create before D068), so deferring is
--     not a regression. Re-introduce as a separate migration AFTER normalizing
--     grn_create grants (owner → tenant-wide/null grant, or explicit per-central
--     grants). See docs/worklog/t3-branch-operator-receiving-production-2026-07-05.md.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- (c) Production RLS relax — allow branch sites, not only central_kitchen.
--     Keep the has_permission(branch_id, …) branch-membership arms unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS production_orders_write ON public.production_orders;
CREATE POLICY production_orders_write ON public.production_orders
  TO authenticated
  USING (
    (tenant_id = public.auth_tenant_id())
    AND public.is_inventory_production_operator()
    AND (
      public.has_permission(branch_id, 'inventory:production_create'::text)
      OR public.has_permission(branch_id, 'inventory:production_confirm'::text)
    )
    AND (EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = production_orders.branch_id
        AND b.tenant_id = production_orders.tenant_id
        AND b.branch_kind IN ('central_kitchen', 'branch')
        AND b.is_active = true
    ))
  )
  WITH CHECK (
    (tenant_id = public.auth_tenant_id())
    AND public.is_inventory_production_operator()
    AND (
      public.has_permission(branch_id, 'inventory:production_create'::text)
      OR public.has_permission(branch_id, 'inventory:production_confirm'::text)
    )
    AND (EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = production_orders.branch_id
        AND b.tenant_id = production_orders.tenant_id
        AND b.branch_kind IN ('central_kitchen', 'branch')
        AND b.is_active = true
    ))
  );

DROP POLICY IF EXISTS production_order_items_write ON public.production_order_items;
CREATE POLICY production_order_items_write ON public.production_order_items
  TO authenticated
  USING (
    (tenant_id = public.auth_tenant_id())
    AND public.is_inventory_production_operator()
    AND (EXISTS (
      SELECT 1
      FROM (public.production_orders po
        JOIN public.branches b ON b.id = po.branch_id)
      WHERE po.id = production_order_items.production_order_id
        AND po.tenant_id = production_order_items.tenant_id
        AND po.tenant_id = public.auth_tenant_id()
        AND b.tenant_id = po.tenant_id
        AND b.branch_kind IN ('central_kitchen', 'branch')
        AND b.is_active = true
        AND (
          public.has_permission(po.branch_id, 'inventory:production_create'::text)
          OR public.has_permission(po.branch_id, 'inventory:production_confirm'::text)
        )
    ))
  )
  WITH CHECK (
    (tenant_id = public.auth_tenant_id())
    AND public.is_inventory_production_operator()
    AND (EXISTS (
      SELECT 1
      FROM (public.production_orders po
        JOIN public.branches b ON b.id = po.branch_id)
      WHERE po.id = production_order_items.production_order_id
        AND po.tenant_id = production_order_items.tenant_id
        AND po.tenant_id = public.auth_tenant_id()
        AND b.tenant_id = po.tenant_id
        AND b.branch_kind IN ('central_kitchen', 'branch')
        AND b.is_active = true
        AND (
          public.has_permission(po.branch_id, 'inventory:production_create'::text)
          OR public.has_permission(po.branch_id, 'inventory:production_confirm'::text)
        )
    ))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- (d) Production operator function — add branch_manager. Preserve STABLE +
--     SET search_path TO '' (function is NOT SECURITY DEFINER — do not add it).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_inventory_production_operator() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT public.auth_role() IN ('owner', 'production_manager', 'branch_manager');
$$;
