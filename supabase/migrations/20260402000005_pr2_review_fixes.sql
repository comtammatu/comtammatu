-- =============================================================
-- PR #2 Review Fixes
-- 1. CHECK constraints on price columns (menu_items, menu_item_modifiers)
-- 2. Fix GRANT on menu_item_available_sides (remove UPDATE — no UPDATE policy)
-- =============================================================

-- 1a. menu_items.base_price >= 0
ALTER TABLE public.menu_items
  ADD CONSTRAINT chk_menu_items_base_price CHECK (base_price >= 0);

-- 1b. menu_item_modifiers.price >= 0
ALTER TABLE public.menu_item_modifiers
  ADD CONSTRAINT chk_menu_item_modifiers_price CHECK (price >= 0);

-- 2. Revoke UPDATE on junction table (no UPDATE RLS policy exists)
REVOKE UPDATE ON TABLE public.menu_item_available_sides FROM authenticated;
