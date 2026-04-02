-- =============================================================
-- PR #2 Review Fixes
-- 1. CHECK constraints on price columns (menu_items, menu_item_modifiers)
-- 2. Fix GRANT on menu_item_available_sides (remove UPDATE — no UPDATE policy)
-- 3. Add updated_at + trigger to branch_zones (consistency with other tables)
-- =============================================================

-- 1a. menu_items.base_price >= 0
ALTER TABLE public.menu_items
  ADD CONSTRAINT chk_menu_items_base_price CHECK (base_price >= 0);

-- 1b. menu_item_modifiers.price >= 0
ALTER TABLE public.menu_item_modifiers
  ADD CONSTRAINT chk_menu_item_modifiers_price CHECK (price >= 0);

-- 2. Revoke UPDATE on junction table (no UPDATE RLS policy exists)
REVOKE UPDATE ON TABLE public.menu_item_available_sides FROM authenticated;

-- 3. Atomic toggle functions (avoid read-then-write race condition)
CREATE OR REPLACE FUNCTION public.toggle_category_active(p_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  new_state BOOLEAN;
BEGIN
  UPDATE public.menu_categories
    SET is_active = NOT is_active
    WHERE id = p_id AND tenant_id = public.auth_tenant_id()
    RETURNING is_active INTO new_state;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  RETURN new_state;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_category_active(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_item_active(p_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  new_state BOOLEAN;
BEGIN
  UPDATE public.menu_items
    SET is_active = NOT is_active
    WHERE id = p_id AND tenant_id = public.auth_tenant_id()
    RETURNING is_active INTO new_state;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  RETURN new_state;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_item_active(BIGINT) TO authenticated;

-- 4. Add updated_at to branch_zones for consistency
ALTER TABLE public.branch_zones
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TRIGGER trg_branch_zones_updated_at
  BEFORE UPDATE ON public.branch_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
