-- Phase A: ingredient multi-unit model + category master (additive only).
-- Base unit per ingredient = current purchase_unit (stock/recipes already in it).
-- Legacy columns (purchase_unit/measure_unit/purchase_to_measure_factor/unit, category text)
-- are retained here and dropped in Phase C after code stops reading them.

-- 1) Unit dictionary (tenant-scoped canonical unit codes).
CREATE TABLE public.units (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT units_code_tenant_key UNIQUE (code, tenant_id)
);

-- 2) Ingredient category master.
CREATE TABLE public.ingredient_categories (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  tone_class TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ingredient_categories_name_tenant_key UNIQUE (name, tenant_id)
);

-- 3) Per-ingredient unit rows: flat to_base_factor (no pairwise conversion graph),
--    plus per-role flags. base_qty = entry_qty * to_base_factor.
CREATE TABLE public.ingredient_units (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ingredient_id   BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  unit_id         BIGINT NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  to_base_factor  NUMERIC(18,6) NOT NULL DEFAULT 1,
  is_base         BOOLEAN NOT NULL DEFAULT false,
  allow_purchase  BOOLEAN NOT NULL DEFAULT false,
  allow_issue     BOOLEAN NOT NULL DEFAULT false,
  allow_production BOOLEAN NOT NULL DEFAULT false,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ingredient_units_to_base_positive CHECK (to_base_factor > 0),
  CONSTRAINT ingredient_units_ing_unit_key UNIQUE (ingredient_id, unit_id, tenant_id)
);
CREATE UNIQUE INDEX ingredient_units_one_base ON public.ingredient_units (ingredient_id) WHERE is_base;
CREATE INDEX ingredient_units_ingredient_idx ON public.ingredient_units (ingredient_id);

-- 4) Ingredient category FK (nullable during transition).
ALTER TABLE public.ingredients ADD COLUMN category_id BIGINT REFERENCES public.ingredient_categories(id) ON DELETE SET NULL;

-- 5) updated_at triggers.
CREATE TRIGGER trg_units_updated_at BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_ingredient_categories_updated_at BEFORE UPDATE ON public.ingredient_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_ingredient_units_updated_at BEFORE UPDATE ON public.ingredient_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 6) Grants (least privilege: authenticated + service_role; RLS gates rows).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.units TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ingredient_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ingredient_units TO authenticated;
GRANT ALL ON TABLE public.units TO service_role;
GRANT ALL ON TABLE public.ingredient_categories TO service_role;
GRANT ALL ON TABLE public.ingredient_units TO service_role;

-- 7) RLS: tenant scope + inventory read/write (catalog roles already hold inventory:write).
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY units_select ON public.units FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND (SELECT public.has_permission_any('inventory:read')));
CREATE POLICY units_insert ON public.units FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.auth_tenant_id() AND (SELECT public.has_permission_any('inventory:write')));
CREATE POLICY units_update ON public.units FOR UPDATE TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND (SELECT public.has_permission_any('inventory:write')))
  WITH CHECK (tenant_id = public.auth_tenant_id() AND (SELECT public.has_permission_any('inventory:write')));
CREATE POLICY units_delete ON public.units FOR DELETE TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND (SELECT public.has_permission_any('inventory:write')));

CREATE POLICY ingredient_categories_select ON public.ingredient_categories FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND (SELECT public.has_permission_any('inventory:read')));
CREATE POLICY ingredient_categories_insert ON public.ingredient_categories FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.auth_tenant_id() AND (SELECT public.has_permission_any('inventory:write')));
CREATE POLICY ingredient_categories_update ON public.ingredient_categories FOR UPDATE TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND (SELECT public.has_permission_any('inventory:write')))
  WITH CHECK (tenant_id = public.auth_tenant_id() AND (SELECT public.has_permission_any('inventory:write')));
CREATE POLICY ingredient_categories_delete ON public.ingredient_categories FOR DELETE TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND (SELECT public.has_permission_any('inventory:write')));

CREATE POLICY ingredient_units_select ON public.ingredient_units FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND (SELECT public.has_permission_any('inventory:read')));
CREATE POLICY ingredient_units_insert ON public.ingredient_units FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.auth_tenant_id() AND (SELECT public.has_permission_any('inventory:write')));
CREATE POLICY ingredient_units_update ON public.ingredient_units FOR UPDATE TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND (SELECT public.has_permission_any('inventory:write')))
  WITH CHECK (tenant_id = public.auth_tenant_id() AND (SELECT public.has_permission_any('inventory:write')));
CREATE POLICY ingredient_units_delete ON public.ingredient_units FOR DELETE TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND (SELECT public.has_permission_any('inventory:write')));

-- 8) Backfill from existing 104 ingredients.
INSERT INTO public.units (tenant_id, code, name)
SELECT tenant_id, code, code FROM (
  SELECT DISTINCT tenant_id, trim(purchase_unit) AS code FROM public.ingredients WHERE coalesce(trim(purchase_unit),'') <> ''
  UNION
  SELECT DISTINCT tenant_id, trim(measure_unit)  AS code FROM public.ingredients WHERE coalesce(trim(measure_unit),'') <> ''
) s
ON CONFLICT (code, tenant_id) DO NOTHING;

INSERT INTO public.ingredient_categories (tenant_id, name)
SELECT DISTINCT tenant_id, trim(category) FROM public.ingredients WHERE coalesce(trim(category),'') <> ''
ON CONFLICT (name, tenant_id) DO NOTHING;

UPDATE public.ingredients i
SET category_id = c.id
FROM public.ingredient_categories c
WHERE c.tenant_id = i.tenant_id
  AND c.name = trim(i.category)
  AND coalesce(trim(i.category),'') <> '';

-- base unit = purchase_unit; single-unit ingredients also allow production.
INSERT INTO public.ingredient_units
  (tenant_id, ingredient_id, unit_id, to_base_factor, is_base, allow_purchase, allow_issue, allow_production)
SELECT i.tenant_id, i.id, u.id, 1, true, true, true, (i.purchase_unit = i.measure_unit)
FROM public.ingredients i
JOIN public.units u ON u.tenant_id = i.tenant_id AND u.code = trim(i.purchase_unit)
WHERE coalesce(trim(i.purchase_unit),'') <> '';

-- secondary unit = measure_unit (when distinct): 1 measure = 1/factor base; production role.
INSERT INTO public.ingredient_units
  (tenant_id, ingredient_id, unit_id, to_base_factor, is_base, allow_purchase, allow_issue, allow_production, sort_order)
SELECT i.tenant_id, i.id, u.id, (1.0 / i.purchase_to_measure_factor), false, false, false, true, 1
FROM public.ingredients i
JOIN public.units u ON u.tenant_id = i.tenant_id AND u.code = trim(i.measure_unit)
WHERE coalesce(trim(i.measure_unit),'') <> '' AND i.measure_unit <> i.purchase_unit;
