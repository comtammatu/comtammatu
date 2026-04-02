-- =============================================================
-- PR #3 Review Fixes
-- 1. check_table_zone_tenant: enforce branch_id isolation
-- 2. save_item_variants/modifiers/sides: FOR UPDATE parent lock
-- 3. Trigger UPDATE OF clauses: include tenant_id
-- =============================================================

-- 1. Zone-to-table assignment must match both tenant AND branch
CREATE OR REPLACE FUNCTION public.check_table_zone_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.zone_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branch_zones
    WHERE id = NEW.zone_id
      AND tenant_id = NEW.tenant_id
      AND branch_id = NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'zone does not belong to tenant/branch'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

-- 2a. save_item_variants — add FOR UPDATE parent lock
CREATE OR REPLACE FUNCTION public.save_item_variants(
  p_item_id BIGINT,
  p_variants JSONB
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

  -- Lock parent row to serialize concurrent replace operations
  PERFORM 1 FROM public.menu_items
    WHERE id = p_item_id AND tenant_id = v_tenant_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

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

-- 2b. save_item_modifiers — add FOR UPDATE parent lock
CREATE OR REPLACE FUNCTION public.save_item_modifiers(
  p_item_id BIGINT,
  p_modifiers JSONB
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

  PERFORM 1 FROM public.menu_items
    WHERE id = p_item_id AND tenant_id = v_tenant_id
    FOR UPDATE;

  IF NOT FOUND THEN
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

-- 2c. save_item_sides — add FOR UPDATE parent lock
CREATE OR REPLACE FUNCTION public.save_item_sides(
  p_main_item_id BIGINT,
  p_sides JSONB
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

  PERFORM 1 FROM public.menu_items
    WHERE id = p_main_item_id AND tenant_id = v_tenant_id
    FOR UPDATE;

  IF NOT FOUND THEN
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

-- 3. Recreate triggers with tenant_id in UPDATE OF clauses

-- 3a. menu_items: fire on category_id OR tenant_id change
DROP TRIGGER IF EXISTS trg_menu_items_check_tenant ON public.menu_items;
CREATE TRIGGER trg_menu_items_check_tenant
  BEFORE INSERT OR UPDATE OF category_id, tenant_id ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.check_menu_item_tenant();

-- 3b. menu_item_variants: fire on item_id OR tenant_id change
DROP TRIGGER IF EXISTS trg_menu_item_variants_check_tenant ON public.menu_item_variants;
CREATE TRIGGER trg_menu_item_variants_check_tenant
  BEFORE INSERT OR UPDATE OF item_id, tenant_id ON public.menu_item_variants
  FOR EACH ROW EXECUTE FUNCTION public.check_variant_tenant();

-- 3c. menu_item_modifiers: fire on item_id OR tenant_id change
DROP TRIGGER IF EXISTS trg_menu_item_modifiers_check_tenant ON public.menu_item_modifiers;
CREATE TRIGGER trg_menu_item_modifiers_check_tenant
  BEFORE INSERT OR UPDATE OF item_id, tenant_id ON public.menu_item_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.check_variant_tenant();

-- 3d. menu_item_available_sides: fire on INSERT and UPDATE (tenant_id, main_item_id, side_item_id)
DROP TRIGGER IF EXISTS trg_menu_item_available_sides_check_tenant ON public.menu_item_available_sides;
CREATE TRIGGER trg_menu_item_available_sides_check_tenant
  BEFORE INSERT OR UPDATE OF tenant_id, main_item_id, side_item_id ON public.menu_item_available_sides
  FOR EACH ROW EXECUTE FUNCTION public.check_sides_tenant();

-- 3e. tables: fire on zone_id OR tenant_id change
DROP TRIGGER IF EXISTS trg_tables_check_zone_tenant ON public.tables;
CREATE TRIGGER trg_tables_check_zone_tenant
  BEFORE INSERT OR UPDATE OF zone_id, tenant_id ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.check_table_zone_tenant();
