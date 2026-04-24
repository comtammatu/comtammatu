-- =============================================================
-- S0-b Foundation — Ingredient review policy scaffold
--
-- Two-level flag for GRN auto-approve condition 7 (cold-chain /
-- manual-review SKUs cannot auto-approve):
--   * Category-level default in ingredient_category_review_policy
--   * Item-level override in ingredients.review_override (nullable)
--
-- Resolver: inventory_requires_manual_review(ingredient_id) returns
-- override ?? category policy ?? false.
--
-- MV access wrappers for mv_inventory_stock_current /
-- mv_grn_price_baseline / mv_inventory_value_ranking are DEFERRED
-- to the sprint that creates each MV (S1 / S4 / S5). Regression
-- rule RLS-NOT-APPLIED-ON-MV enforces the pattern.
--
-- Spec: docs/plan/inventory-redesign.md §Q4a + §B3
-- =============================================================

-- ---------- Category-level review policy table ----------------

CREATE TABLE IF NOT EXISTS public.ingredient_category_review_policy (
  tenant_id              BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category               TEXT   NOT NULL,
  requires_manual_review BOOLEAN NOT NULL DEFAULT false,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by             UUID REFERENCES auth.users(id),
  PRIMARY KEY (tenant_id, category)
);

COMMENT ON TABLE public.ingredient_category_review_policy IS
  'Per-tenant, per-category default for the manual-review flag used by GRN auto-approve condition 7. Admin-maintained. Item-level overrides live on ingredients.review_override.';

ALTER TABLE public.ingredient_category_review_policy ENABLE ROW LEVEL SECURITY;

-- Select: any authenticated user in the tenant can read (needed for
-- evaluator function running under SECURITY INVOKER callers).
CREATE POLICY "policy_read_own_tenant"
  ON public.ingredient_category_review_policy
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

-- Write: gated by inventory:catalog_review_policy_set (Admin).
CREATE POLICY "policy_write_admin"
  ON public.ingredient_category_review_policy
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'inventory:catalog_review_policy_set')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'inventory:catalog_review_policy_set')
  );

-- ---------- Item-level override ------------------------------

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS review_override BOOLEAN;

COMMENT ON COLUMN public.ingredients.review_override IS
  'Nullable flag. NULL = inherit category policy. TRUE/FALSE = explicit per-item override. Set by QLV via inventory:item_review_override_set.';

-- ---------- Resolver helper ----------------------------------

CREATE OR REPLACE FUNCTION public.inventory_requires_manual_review(
  p_ingredient_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH ing AS (
    SELECT tenant_id, category, review_override
    FROM public.ingredients
    WHERE id = p_ingredient_id
  )
  SELECT COALESCE(
    (SELECT review_override FROM ing),
    (SELECT p.requires_manual_review
     FROM ing i
     LEFT JOIN public.ingredient_category_review_policy p
       ON p.tenant_id = i.tenant_id
      AND p.category  = i.category),
    false
  );
$function$;

COMMENT ON FUNCTION public.inventory_requires_manual_review(BIGINT) IS
  'Effective manual-review flag: item override takes precedence over category policy; defaults to false. Used by GRN auto-approve evaluator.';

GRANT EXECUTE ON FUNCTION public.inventory_requires_manual_review(BIGINT)
  TO authenticated;
