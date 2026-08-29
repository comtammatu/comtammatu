-- Migration: branch_ingredient_thresholds_and_reorder
-- Provides per-branch/per-location safety stock thresholds and smart reorder suggestions.

-- ─── 1. Table: branch_ingredient_thresholds ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.branch_ingredient_thresholds (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id bigint NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  ingredient_id bigint NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  min_stock_level numeric NOT NULL DEFAULT 0,
  reorder_quantity numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_ingredient_thresholds_tenant_branch_ingredient_key UNIQUE (tenant_id, branch_id, ingredient_id)
);

ALTER TABLE public.branch_ingredient_thresholds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branch_ingredient_thresholds_tenant_isolation" ON public.branch_ingredient_thresholds;
CREATE POLICY "branch_ingredient_thresholds_tenant_isolation"
  ON public.branch_ingredient_thresholds
  FOR ALL
  TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

CREATE INDEX IF NOT EXISTS idx_branch_ingredient_thresholds_branch
  ON public.branch_ingredient_thresholds(tenant_id, branch_id, ingredient_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branch_ingredient_thresholds TO authenticated, service_role;

-- ─── 2. RPC: get_branch_stock_thresholds ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_branch_stock_thresholds(
  p_branch_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'ingredient_id', i.id,
      'ingredient_name', i.name,
      'sku', i.sku,
      'category_name', c.name,
      'base_unit_id', i.receipt_unit_id,
      'base_unit_code', u.code,
      'base_unit_name', u.name,
      'global_min_stock', i.min_stock_level,
      'branch_min_stock', t.min_stock_level,
      'effective_min_stock', COALESCE(t.min_stock_level, i.min_stock_level, 0),
      'reorder_quantity', t.reorder_quantity,
      'is_customized', (t.id IS NOT NULL),
      'fulfill_from_central_kitchen', i.fulfill_from_central_kitchen,
      'fulfill_from_central_supply', i.fulfill_from_central_supply,
      'default_fulfill_site_kind', i.default_fulfill_site_kind
    ) ORDER BY c.name NULLS LAST, i.name ASC
  ), '[]'::jsonb)
  INTO v_result
  FROM public.ingredients i
  LEFT JOIN public.ingredient_categories c ON c.id = i.category_id AND c.tenant_id = v_tenant
  LEFT JOIN public.units u ON u.id = i.receipt_unit_id AND u.tenant_id = v_tenant
  LEFT JOIN public.branch_ingredient_thresholds t
    ON t.ingredient_id = i.id
    AND t.branch_id = p_branch_id
    AND t.tenant_id = v_tenant
    AND t.is_active = true
  WHERE i.tenant_id = v_tenant
    AND i.is_active = true;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_branch_stock_thresholds(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_branch_stock_thresholds(bigint) TO authenticated, service_role;

-- ─── 3. RPC: upsert_branch_stock_thresholds ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_branch_stock_thresholds(
  p_branch_id bigint,
  p_thresholds jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_ingredient_id bigint;
  v_min_stock numeric;
  v_reorder_qty numeric;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_thresholds)
  LOOP
    v_ingredient_id := (v_item ->> 'ingredient_id')::bigint;
    v_min_stock := COALESCE((v_item ->> 'min_stock_level')::numeric, 0);
    v_reorder_qty := (v_item ->> 'reorder_quantity')::numeric;

    IF v_ingredient_id IS NOT NULL THEN
      INSERT INTO public.branch_ingredient_thresholds (
        tenant_id,
        branch_id,
        ingredient_id,
        min_stock_level,
        reorder_quantity,
        is_active,
        updated_at
      ) VALUES (
        v_tenant,
        p_branch_id,
        v_ingredient_id,
        GREATEST(0, v_min_stock),
        CASE WHEN v_reorder_qty > 0 THEN v_reorder_qty ELSE NULL END,
        true,
        now()
      )
      ON CONFLICT (tenant_id, branch_id, ingredient_id)
      DO UPDATE SET
        min_stock_level = EXCLUDED.min_stock_level,
        reorder_quantity = EXCLUDED.reorder_quantity,
        is_active = true,
        updated_at = now();

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'branch_id', p_branch_id,
    'updated_count', v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_branch_stock_thresholds(bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_branch_stock_thresholds(bigint, jsonb) TO authenticated, service_role;

-- ─── 4. RPC: get_branch_smart_reorder_suggestions ───────────────────────────

CREATE OR REPLACE FUNCTION public.get_branch_smart_reorder_suggestions(
  p_branch_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  WITH branch_stock AS (
    SELECT
      sl.ingredient_id,
      COALESCE(SUM(sl.current_quantity), 0) AS on_hand_qty
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = p_branch_id
    GROUP BY sl.ingredient_id
  ),
  threshold_calc AS (
    SELECT
      i.id AS ingredient_id,
      i.name AS ingredient_name,
      i.sku,
      c.name AS category_name,
      i.receipt_unit_id AS base_unit_id,
      u.code AS base_unit_code,
      u.name AS base_unit_name,
      COALESCE(bs.on_hand_qty, 0) AS current_on_hand,
      COALESCE(t.min_stock_level, i.min_stock_level, 0) AS effective_min_stock,
      t.reorder_quantity,
      i.fulfill_from_central_kitchen,
      i.fulfill_from_central_supply,
      i.default_fulfill_site_kind,
      CASE
        WHEN i.fulfill_from_central_kitchen = true THEN 'internal_transfer_kitchen'
        WHEN i.fulfill_from_central_supply = true THEN 'internal_transfer_supply'
        ELSE 'supplier_po'
      END AS supply_channel
    FROM public.ingredients i
    LEFT JOIN public.ingredient_categories c ON c.id = i.category_id AND c.tenant_id = v_tenant
    LEFT JOIN public.units u ON u.id = i.receipt_unit_id AND u.tenant_id = v_tenant
    LEFT JOIN public.branch_ingredient_thresholds t
      ON t.ingredient_id = i.id
      AND t.branch_id = p_branch_id
      AND t.tenant_id = v_tenant
      AND t.is_active = true
    LEFT JOIN branch_stock bs ON bs.ingredient_id = i.id
    WHERE i.tenant_id = v_tenant
      AND i.is_active = true
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'ingredient_id', tc.ingredient_id,
      'ingredient_name', tc.ingredient_name,
      'sku', tc.sku,
      'category_name', tc.category_name,
      'base_unit_id', tc.base_unit_id,
      'base_unit_code', tc.base_unit_code,
      'base_unit_name', tc.base_unit_name,
      'current_on_hand', tc.current_on_hand,
      'min_stock_level', tc.effective_min_stock,
      'suggested_reorder_qty', CASE
        WHEN tc.reorder_quantity IS NOT NULL AND tc.reorder_quantity > 0 THEN tc.reorder_quantity
        ELSE GREATEST(0, (tc.effective_min_stock * 2) - tc.current_on_hand)
      END,
      'supply_channel', tc.supply_channel,
      'is_below_min', (tc.effective_min_stock > 0 AND tc.current_on_hand <= tc.effective_min_stock)
    ) ORDER BY (tc.effective_min_stock > 0 AND tc.current_on_hand <= tc.effective_min_stock) DESC, tc.ingredient_name ASC
  ), '[]'::jsonb)
  INTO v_result
  FROM threshold_calc tc;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_branch_smart_reorder_suggestions(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_branch_smart_reorder_suggestions(bigint) TO authenticated, service_role;
