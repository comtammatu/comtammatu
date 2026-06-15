-- D026 §2: position default checklist template. Runs after templates are seeded
-- (20260615160000). Clock-in resolves COALESCE(employee override, position
-- default), so staff with no override inherit their position's template.
--
-- Prod reality (active employees by position): cashier=14 (front-of-house:
-- serving + cashier), branch_manager=3, chef=9 (kitchen — several stations
-- under one role), waiter=2 residual (merging into cashier per D012),
-- head_chef/kitchen_helper/warehouse_manager=0.
--
-- Only positions that map cleanly to ONE checklist get a position default:
--   cashier        → 'Phục vụ'         (front-of-house: serving + cash; the
--                                        'Phục vụ' set holds the open/close cash
--                                        + screen tasks)
--   branch_manager → 'Cửa hàng trưởng'
--
-- The kitchen is multiple stations (Nướng / Phụ bếp / Quầy / Bếp trưởng) under
-- the single `chef` position, so `chef` gets NO position default — each cook is
-- assigned their station template per-person via
-- employees.default_checklist_template_id. Note: 'Quầy' is a kitchen station
-- (food counter / pass), not the cashier. All station templates are seeded in
-- 20260615160000; per-person assignment is manual (owner).

BEGIN;

DO $$
DECLARE
  v_tenant bigint;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants LOOP
    UPDATE public.positions po
    SET default_checklist_template_id = t.id
    FROM public.shift_checklist_templates t
    WHERE po.tenant_id = v_tenant
      AND t.tenant_id = v_tenant
      AND t.branch_id IS NULL
      AND t.is_active = true
      AND (
        (po.code = 'cashier' AND t.name = 'Phục vụ')
        OR (po.code = 'branch_manager' AND t.name = 'Cửa hàng trưởng')
      );
  END LOOP;
END $$;

COMMIT;
