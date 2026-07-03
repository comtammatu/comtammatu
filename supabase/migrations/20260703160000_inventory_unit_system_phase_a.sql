-- Phase A of the 2-tier inventory unit system (docs/plan/inventory-unit-system-2026-07-03.md).
-- Additive only: new nullable/defaulted columns, a derivation helper, a backfill
-- of existing ingredient_units rows into the anchor model, and an idempotent
-- seed. Does NOT touch upsert_ingredient_catalog or any of the 11 posting RPCs
-- (Phase B) and does not drop the legacy allow_*/purchase_unit columns
-- (Phase C). The catalog client still writes flat to_base_factor values
-- verbatim (Phase A2 wires the anchor-aware form); this migration only makes
-- the anchor model available and internally consistent for what already
-- exists.

/* ─── 1. Schema: units registry gets dimension + standard-factor ─── */

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS dimension text NULL,
  ADD COLUMN IF NOT EXISTS is_standard boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS standard_factor numeric(18,9) NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'units_dimension_check'
      AND conrelid = 'public.units'::regclass
  ) THEN
    ALTER TABLE public.units
      ADD CONSTRAINT units_dimension_check
        CHECK (dimension IS NULL OR dimension IN ('mass', 'volume'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'units_standard_factor_requires_dimension'
      AND conrelid = 'public.units'::regclass
  ) THEN
    ALTER TABLE public.units
      ADD CONSTRAINT units_standard_factor_requires_dimension
        CHECK (
          (is_standard = false AND standard_factor IS NULL)
          OR (is_standard = true AND dimension IS NOT NULL AND standard_factor > 0)
        );
  END IF;
END $$;

/* ─── 2. Schema: ingredient_units gets packaging anchor columns ─── */

ALTER TABLE public.ingredient_units
  ADD COLUMN IF NOT EXISTS anchor_unit_id bigint NULL REFERENCES public.units (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS anchor_factor numeric(18,9) NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ingredient_units_anchor_factor_positive'
      AND conrelid = 'public.ingredient_units'::regclass
  ) THEN
    ALTER TABLE public.ingredient_units
      ADD CONSTRAINT ingredient_units_anchor_factor_positive
        CHECK (anchor_factor IS NULL OR anchor_factor > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ingredient_units_anchor_pair'
      AND conrelid = 'public.ingredient_units'::regclass
  ) THEN
    ALTER TABLE public.ingredient_units
      ADD CONSTRAINT ingredient_units_anchor_pair
        CHECK (
          (anchor_unit_id IS NULL AND anchor_factor IS NULL)
          OR (anchor_unit_id IS NOT NULL AND anchor_factor IS NOT NULL)
        );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ingredient_units_anchor_unit_idx
  ON public.ingredient_units USING btree (anchor_unit_id);

/* ─── 3. Normalize existing packaging unit codes (idempotent) ───
   lit -> l, bich -> tui, piece -> cai. "ly" (POS serving unit, not a stock
   unit) is left as-is here; it is not seeded as a standard/packaging unit
   below and stays out of the units catalog going forward. Renaming an
   existing code keeps the same units.id (and every ingredient_units row
   that references it), so no ingredient mapping is disturbed. */

UPDATE public.units
SET code = 'l', name = 'Lít'
WHERE lower(code) = 'lit';

UPDATE public.units
SET code = 'túi', name = 'Túi'
WHERE lower(code) = 'bich';

UPDATE public.units
SET code = 'cái', name = 'Cái'
WHERE lower(code) = 'piece';

/* ─── 4. Seed standard units (mass + volume), idempotent per tenant ───
   is_standard = true, factor locked. Seeded for every existing tenant so a
   fresh environment and an existing one converge on the same catalog. */

INSERT INTO public.units (tenant_id, code, name, is_active, dimension, is_standard, standard_factor)
SELECT t.id, seed.code, seed.name, true, seed.dimension, true, seed.standard_factor
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('g',  'Gam',        'mass',   1::numeric),
    ('kg', 'Ki-lô-gam',  'mass',   1000::numeric),
    ('mg', 'Mi-li-gam',  'mass',   0.001::numeric),
    ('ml', 'Mi-li-lít',  'volume', 1::numeric),
    ('l',  'Lít',        'volume', 1000::numeric),
    ('cl', 'Xen-ti-lít', 'volume', 10::numeric)
) AS seed(code, name, dimension, standard_factor)
ON CONFLICT (code, tenant_id) DO UPDATE SET
  dimension = EXCLUDED.dimension,
  is_standard = true,
  standard_factor = EXCLUDED.standard_factor;

/* ─── 5. Seed packaging units, idempotent per tenant ───
   dimension = NULL, is_standard = false; owner declares anchor per
   ingredient when using one. Existing rows with these codes are left as
   plain packaging units (no dimension/standard flip). */

INSERT INTO public.units (tenant_id, code, name, is_active)
SELECT t.id, seed.code, seed.name, true
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('bao', 'Bao'),
    ('thùng', 'Thùng'),
    ('chai', 'Chai'),
    ('lon', 'Lon'),
    ('hũ', 'Hũ'),
    ('hộp', 'Hộp'),
    ('gói', 'Gói'),
    ('túi', 'Túi'),
    ('lốc', 'Lốc'),
    ('khay', 'Khay'),
    ('vỉ', 'Vỉ'),
    ('trái', 'Trái'),
    ('cái', 'Cái')
) AS seed(code, name)
ON CONFLICT (code, tenant_id) DO NOTHING;

/* ─── 6. Backfill: give every existing ingredient_units row an anchor-model
   equivalent of its current flat to_base_factor ───
   Base rows (is_base = true) already carry to_base_factor = 1 (enforced by
   upsert_ingredient_catalog); the base's own dimension/standard_factor (if
   any) lives on units and needs no per-row backfill. Non-base rows encode
   "1 this-unit = to_base_factor * base-unit" today — that is exactly the
   anchor relationship, so anchor_unit_id = the ingredient's base unit and
   anchor_factor = the existing to_base_factor makes every current row
   anchor-model-complete without changing any resolved quantity. Skipped for
   non-base rows whose unit is itself a standard unit (its ratio is already
   derived from units.standard_factor, not an anchor). */

UPDATE public.ingredient_units iu
SET anchor_unit_id = base.unit_id,
    anchor_factor = iu.to_base_factor
FROM public.ingredient_units base
JOIN public.units base_unit
  ON base_unit.id = base.unit_id AND base_unit.tenant_id = base.tenant_id
LEFT JOIN public.units iu_unit
  ON iu_unit.id = iu.unit_id AND iu_unit.tenant_id = iu.tenant_id
WHERE base.ingredient_id = iu.ingredient_id
  AND base.tenant_id = iu.tenant_id
  AND base.is_base = true
  AND iu.is_base = false
  AND iu.anchor_unit_id IS NULL
  AND coalesce(iu_unit.is_standard, false) = false;

/* ─── 7. Derivation helper: resolve to_base_factor for one ingredient_units row ───
   Fail-closed: RAISEs on cross-dimension anchor or a cycle. Tenant is taken
   from auth_tenant_id() internally (never a caller-supplied parameter), so a
   browser-executable call cannot probe another tenant's units catalog.
   Mirrored in TS at apps/web/app/(protected)/inventory/_lib/unit-derivation.ts
   — keep both in sync if the resolution rule changes. Not yet called by
   upsert_ingredient_catalog (Phase A2 wires the anchor-aware catalog form
   into the RPC in the same change); it is additive, callable infrastructure
   for that follow-up. */

CREATE OR REPLACE FUNCTION public.inv_derive_to_base_factor(
  p_base_unit_id bigint,
  p_unit_id bigint,
  p_is_base boolean,
  p_anchor_unit_id bigint,
  p_anchor_factor numeric,
  p_all_units jsonb
) RETURNS numeric
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant            bigint := public.auth_tenant_id();
  v_base_dimension    text;
  v_base_is_standard  boolean;
  v_unit_dimension    text;
  v_unit_is_standard  boolean;
  v_unit_std_factor   numeric;
  v_base_std_factor   numeric;
  v_seen              bigint[] := ARRAY[]::bigint[];
  v_current_unit      bigint;
  v_current_anchor    bigint;
  v_current_factor    numeric;
  v_hop_dimension     text;
  v_hop_is_standard   boolean;
  v_hop_std_factor    numeric;
  v_acc_factor        numeric := 1;
BEGIN
  IF p_is_base THEN
    RETURN 1;
  END IF;

  SELECT dimension, is_standard, standard_factor
  INTO v_base_dimension, v_base_is_standard, v_base_std_factor
  FROM public.units
  WHERE id = p_base_unit_id AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'base_unit_not_found' USING ERRCODE = '23503';
  END IF;

  SELECT dimension, is_standard, standard_factor
  INTO v_unit_dimension, v_unit_is_standard, v_unit_std_factor
  FROM public.units
  WHERE id = p_unit_id AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unit_not_found' USING ERRCODE = '23503';
  END IF;

  -- Case 1: this unit is itself a standard unit. Only valid when the
  -- ingredient's base is a standard unit of the SAME dimension; the ratio
  -- is then a pure system constant (never user-entered).
  IF v_unit_is_standard THEN
    IF NOT v_base_is_standard OR v_base_dimension IS DISTINCT FROM v_unit_dimension THEN
      RAISE EXCEPTION 'standard_unit_dimension_mismatch' USING ERRCODE = '23514';
    END IF;
    RETURN v_unit_std_factor / v_base_std_factor;
  END IF;

  -- Case 2: packaging unit. Walk the anchor chain until it reaches either
  -- the base unit or a standard unit, multiplying anchor_factor at each hop.
  -- Fail-closed on a missing anchor, a cycle, or a cross-dimension anchor
  -- once the chain reaches a standard unit.
  IF p_anchor_unit_id IS NULL OR p_anchor_factor IS NULL THEN
    RAISE EXCEPTION 'packaging_unit_requires_anchor' USING ERRCODE = '23514';
  END IF;

  v_current_unit := p_unit_id;
  v_current_anchor := p_anchor_unit_id;
  v_current_factor := p_anchor_factor;
  v_acc_factor := 1;

  LOOP
    IF v_current_unit = ANY (v_seen) THEN
      RAISE EXCEPTION 'unit_anchor_cycle' USING ERRCODE = '23514';
    END IF;
    v_seen := v_seen || v_current_unit;

    v_acc_factor := v_acc_factor * v_current_factor;

    IF v_current_anchor = p_base_unit_id THEN
      RETURN v_acc_factor;
    END IF;

    SELECT dimension, is_standard, standard_factor
    INTO v_hop_dimension, v_hop_is_standard, v_hop_std_factor
    FROM public.units
    WHERE id = v_current_anchor AND tenant_id = v_tenant;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'anchor_unit_not_found' USING ERRCODE = '23503';
    END IF;

    IF v_hop_is_standard THEN
      IF NOT v_base_is_standard OR v_base_dimension IS DISTINCT FROM v_hop_dimension THEN
        RAISE EXCEPTION 'standard_unit_dimension_mismatch' USING ERRCODE = '23514';
      END IF;
      RETURN v_acc_factor * (v_hop_std_factor / v_base_std_factor);
    END IF;

    -- Next hop: the anchor must itself be a packaging row on this
    -- ingredient (present in p_all_units), anchored further down the chain.
    v_current_unit := v_current_anchor;

    SELECT (e->>'anchor_unit_id')::bigint, (e->>'anchor_factor')::numeric
    INTO v_current_anchor, v_current_factor
    FROM jsonb_array_elements(p_all_units) e
    WHERE (e->>'unit_id')::bigint = v_current_unit;

    IF v_current_anchor IS NULL OR v_current_factor IS NULL THEN
      RAISE EXCEPTION 'unit_anchor_cycle' USING ERRCODE = '23514';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.inv_derive_to_base_factor(
  bigint, bigint, boolean, bigint, numeric, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inv_derive_to_base_factor(
  bigint, bigint, boolean, bigint, numeric, jsonb
) TO authenticated, service_role;

/* ─── 8. Permission: inventory:units_master ───
   Gates the standalone Units master screen (/inventory/settings/units)
   distinctly from the blanket inventory:write catalog permission, so a
   tenant can grant unit-registry management without full catalog write
   access. Granted by default to the existing catalog-management roles. */

INSERT INTO public.permission_keys (key, module, description, scope) VALUES
  ('inventory:units_master', 'inventory', 'Quản lý danh mục đơn vị đo (chuẩn + đóng gói)', 'tenant')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    UPDATE public.role_templates
    SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY['inventory:units_master']) ORDER BY 1
    )
    WHERE tenant_id = t.id
      AND position_code IN ('owner', 'warehouse_manager', 'production_manager');
  END LOOP;
END $$;
