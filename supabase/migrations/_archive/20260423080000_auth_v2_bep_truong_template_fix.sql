-- =============================================================
-- Auth v2 — bep_truong (Bếp trưởng) template fix (task α2)
-- =============================================================
-- Adds 3 permission keys missing from the `bep_truong` role_template:
--   * menu:write               — CRUD production_recipes (menu_items RLS requires)
--   * inventory:transfer_create — ship finished goods branch → branch warehouses
--   * procurement:read         — visibility of PO/GRN for arriving ingredients
--
-- Context: workflow "chi nhánh → chi nhánh" in the current Inventory
-- contract cannot run end-to-end because
-- the seed template (20260422120001_auth_v2_seed_catalog.sql:178) shipped with
-- 7 keys and missed the above 3.
--
-- Idempotency: UPDATE uses `SELECT DISTINCT unnest(... || ARRAY[new_keys])`.
-- INSERT uses ON CONFLICT DO NOTHING against the partial unique index
-- idx_staff_permissions_branch_uniq(user_id, branch_id, permission_key) WHERE branch_id IS NOT NULL.
--
-- NOTE: public.sync_missing_permissions_from_template() is currently broken —
-- it still references profiles.role which was dropped in M5 cleanup
-- (2026-04-23). Tracked as separate task; this migration bypasses the RPC and
-- grants directly for users whose position code is bep_truong.
--
-- Known blocker (tracked as task α4): 17 SECURITY DEFINER RPCs still gate via
-- auth_role(). After this migration, QL chi nhánh holds the correct grants
-- but mutating RPCs (create_production_order, upsert_recipe_lines,
-- create_stock_transfer_draft, …) still reject until Phase 2-RPC cutover lands.
-- =============================================================

-- 1. Defensive guard: verify all 3 keys exist in the catalog.
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.permission_keys
      WHERE key IN (
        'menu:write',
        'inventory:transfer_create',
        'procurement:read'
      )) <> 3 THEN
    RAISE EXCEPTION 'bep_truong template fix: permission_keys catalog missing one or more required keys';
  END IF;
END $$;

-- 2. Extend the template (multi-tenant safe: matches every tenant's system bep_truong template).
UPDATE public.role_templates
SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(
        permission_keys || ARRAY[
          'menu:write',
          'inventory:transfer_create',
          'procurement:read'
        ]::TEXT[]
      )
    ),
    updated_at = now()
WHERE position_code = 'bep_truong'
  AND is_system = TRUE;

-- 3. Additive grant backfill for active users holding the bep_truong position,
--    scoped to their assigned branch.
INSERT INTO public.staff_permissions (
  user_id, tenant_id, branch_id, permission_key, source_template, granted_at, valid_from
)
SELECT pr.id, pr.tenant_id, pr.branch_id, k.key, rt.id, now(), now()
FROM public.profiles pr
JOIN public.positions pos
  ON pos.id = pr.position_id
JOIN public.role_templates rt
  ON rt.tenant_id = pr.tenant_id
 AND rt.position_code = pos.code
 AND rt.is_system = TRUE
CROSS JOIN LATERAL (
  VALUES ('menu:write'), ('inventory:transfer_create'), ('procurement:read')
) AS k(key)
WHERE pos.code = 'bep_truong'
  AND pr.is_active = TRUE
  AND pr.branch_id IS NOT NULL
ON CONFLICT (user_id, branch_id, permission_key) WHERE (branch_id IS NOT NULL)
DO NOTHING;
