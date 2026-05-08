-- =============================================================
-- Add toggle_ingredient_active RPC mirror toggle_item_active pattern.
-- SECURITY INVOKER → relies on existing ingredients_update RLS
-- (gate to owner | super_manager | warehouse_manager | production_manager
-- per migration 20260422104856_ingredients_catalog_roles_policy_fix.sql).
-- =============================================================

CREATE OR REPLACE FUNCTION public.toggle_ingredient_active(p_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  new_state BOOLEAN;
BEGIN
  UPDATE public.ingredients
    SET is_active = NOT is_active,
        updated_at = now()
    WHERE id = p_id
      AND tenant_id = public.auth_tenant_id()
    RETURNING is_active INTO new_state;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  RETURN new_state;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_ingredient_active(BIGINT) TO authenticated;
