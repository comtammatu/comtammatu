-- =============================================================
-- PR #2 Review Fixes
-- 1. CHECK constraints on price columns
-- 2. Fix GRANT on menu_item_available_sides
-- 3. Atomic toggle RPCs
-- 4. Add updated_at to branch_zones
-- 5. Cross-tenant FK validation triggers (W4)
-- 6. Transactional bulk save RPCs (W2)
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

-- =============================================================
-- 5. Cross-tenant FK validation (W4)
-- Ensures child rows reference parents within the same tenant.
-- =============================================================

-- 5a. menu_items.category_id must share same tenant_id
CREATE OR REPLACE FUNCTION public.check_menu_item_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.menu_categories
    WHERE id = NEW.category_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'category does not belong to tenant'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_menu_items_check_tenant
  BEFORE INSERT OR UPDATE OF category_id ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.check_menu_item_tenant();

-- 5b. menu_item_variants.item_id must share same tenant_id
CREATE OR REPLACE FUNCTION public.check_variant_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.menu_items
    WHERE id = NEW.item_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'item does not belong to tenant'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_menu_item_variants_check_tenant
  BEFORE INSERT OR UPDATE OF item_id ON public.menu_item_variants
  FOR EACH ROW EXECUTE FUNCTION public.check_variant_tenant();

-- 5c. menu_item_modifiers.item_id must share same tenant_id
CREATE TRIGGER trg_menu_item_modifiers_check_tenant
  BEFORE INSERT OR UPDATE OF item_id ON public.menu_item_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.check_variant_tenant();

-- 5d. menu_item_available_sides — both main_item_id and side_item_id must share tenant
CREATE OR REPLACE FUNCTION public.check_sides_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.menu_items
    WHERE id = NEW.main_item_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'main item does not belong to tenant'
      USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.menu_items
    WHERE id = NEW.side_item_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'side item does not belong to tenant'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_menu_item_available_sides_check_tenant
  BEFORE INSERT ON public.menu_item_available_sides
  FOR EACH ROW EXECUTE FUNCTION public.check_sides_tenant();

-- 5e. tables.zone_id must share same tenant_id (when not null)
CREATE OR REPLACE FUNCTION public.check_table_zone_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.zone_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branch_zones
    WHERE id = NEW.zone_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'zone does not belong to tenant'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tables_check_zone_tenant
  BEFORE INSERT OR UPDATE OF zone_id ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.check_table_zone_tenant();

-- =============================================================
-- 6. Transactional bulk save RPCs (W2)
-- Wraps delete+insert in a single transaction to prevent data loss.
-- =============================================================

-- 6a. save_item_variants — atomic replace all variants for an item
CREATE OR REPLACE FUNCTION public.save_item_variants(
  p_item_id BIGINT,
  p_variants JSONB  -- [{ "name": text, "price_adjustment": numeric, "sort_order": int }]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_tenant_id BIGINT;
  v JSONB;
  i INT := 0;
BEGIN
  IF p_variants IS NULL OR jsonb_typeof(p_variants) <> 'array' THEN
    RAISE EXCEPTION 'p_variants must be a JSON array' USING ERRCODE = '22023';
  END IF;

  v_tenant_id := public.auth_tenant_id();

  -- Verify item belongs to caller's tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.menu_items WHERE id = p_item_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  -- Atomic: delete all then insert new
  DELETE FROM public.menu_item_variants
    WHERE item_id = p_item_id AND tenant_id = v_tenant_id;

  FOR v IN SELECT * FROM jsonb_array_elements(p_variants)
  LOOP
    INSERT INTO public.menu_item_variants (tenant_id, item_id, name, price_adjustment, sort_order)
    VALUES (
      v_tenant_id,
      p_item_id,
      v ->> 'name',
      (v ->> 'price_adjustment')::NUMERIC(15,2),
      COALESCE((v ->> 'sort_order')::INT, i)
    );
    i := i + 1;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_item_variants(BIGINT, JSONB) TO authenticated;

-- 6b. save_item_modifiers — atomic replace all modifiers for an item
CREATE OR REPLACE FUNCTION public.save_item_modifiers(
  p_item_id BIGINT,
  p_modifiers JSONB  -- [{ "name": text, "price": numeric, "sort_order": int }]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_tenant_id BIGINT;
  m JSONB;
  i INT := 0;
BEGIN
  IF p_modifiers IS NULL OR jsonb_typeof(p_modifiers) <> 'array' THEN
    RAISE EXCEPTION 'p_modifiers must be a JSON array' USING ERRCODE = '22023';
  END IF;

  v_tenant_id := public.auth_tenant_id();

  IF NOT EXISTS (
    SELECT 1 FROM public.menu_items WHERE id = p_item_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.menu_item_modifiers
    WHERE item_id = p_item_id AND tenant_id = v_tenant_id;

  FOR m IN SELECT * FROM jsonb_array_elements(p_modifiers)
  LOOP
    INSERT INTO public.menu_item_modifiers (tenant_id, item_id, name, price, sort_order)
    VALUES (
      v_tenant_id,
      p_item_id,
      m ->> 'name',
      (m ->> 'price')::NUMERIC(15,2),
      COALESCE((m ->> 'sort_order')::INT, i)
    );
    i := i + 1;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_item_modifiers(BIGINT, JSONB) TO authenticated;

-- 6c. save_item_sides — atomic replace all available sides for an item
CREATE OR REPLACE FUNCTION public.save_item_sides(
  p_main_item_id BIGINT,
  p_sides JSONB  -- [{ "side_item_id": bigint, "is_default": boolean }]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_tenant_id BIGINT;
  s JSONB;
BEGIN
  IF p_sides IS NULL OR jsonb_typeof(p_sides) <> 'array' THEN
    RAISE EXCEPTION 'p_sides must be a JSON array' USING ERRCODE = '22023';
  END IF;

  v_tenant_id := public.auth_tenant_id();

  IF NOT EXISTS (
    SELECT 1 FROM public.menu_items WHERE id = p_main_item_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.menu_item_available_sides
    WHERE main_item_id = p_main_item_id AND tenant_id = v_tenant_id;

  FOR s IN SELECT * FROM jsonb_array_elements(p_sides)
  LOOP
    INSERT INTO public.menu_item_available_sides (tenant_id, main_item_id, side_item_id, is_default)
    VALUES (
      v_tenant_id,
      p_main_item_id,
      (s ->> 'side_item_id')::BIGINT,
      COALESCE((s ->> 'is_default')::BOOLEAN, false)
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_item_sides(BIGINT, JSONB) TO authenticated;
