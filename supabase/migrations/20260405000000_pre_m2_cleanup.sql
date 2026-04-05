-- =============================================================
-- Pre-M2 Cleanup: Drop stale overload + add missing indexes
-- =============================================================

-- 1. Drop old 4-param admin_update_profile overload
--    The 6-param version (from 20260402000002) is the current one.
--    PostgreSQL treats different param counts as separate overloads,
--    so both coexist. The 4-param one is stale and can cause ambiguity.
DROP FUNCTION IF EXISTS public.admin_update_profile(
  UUID, public.staff_role, BIGINT, BOOLEAN
);

-- 2. Add missing tenant_id indexes for RLS performance
--    menu_categories and menu_items already have these;
--    variants, modifiers, and available_sides were missed.
CREATE INDEX IF NOT EXISTS idx_menu_item_variants_tenant
  ON public.menu_item_variants(tenant_id);

CREATE INDEX IF NOT EXISTS idx_menu_item_modifiers_tenant
  ON public.menu_item_modifiers(tenant_id);

CREATE INDEX IF NOT EXISTS idx_menu_item_available_sides_tenant
  ON public.menu_item_available_sides(tenant_id);
