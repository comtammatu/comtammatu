-- Allow GRN / stock-issue / transfer entry units to be either receipt or issue.
-- PO stays receipt-only; production recipes/runs stay production-only.
-- Stock UI may display in issue units; ledger base unit is unchanged.

CREATE OR REPLACE FUNCTION private.entry_unit_matches_roles(
  p_tenant_id bigint,
  p_ingredient_id bigint,
  p_entry_unit_id bigint,
  p_roles text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_roles text[] := string_to_array(p_roles, ',');
  v_receipt_unit_id bigint;
  v_issue_unit_id bigint;
  v_production_unit_id bigint;
BEGIN
  SELECT
    ingredient.receipt_unit_id,
    ingredient.issue_unit_id,
    ingredient.production_unit_id
  INTO
    v_receipt_unit_id,
    v_issue_unit_id,
    v_production_unit_id
  FROM public.ingredients AS ingredient
  WHERE ingredient.tenant_id = p_tenant_id
    AND ingredient.id = p_ingredient_id;

  IF 'receipt' = ANY (v_roles)
     AND v_receipt_unit_id IS NOT NULL
     AND p_entry_unit_id IS NOT DISTINCT FROM v_receipt_unit_id THEN
    RETURN TRUE;
  END IF;

  IF 'issue' = ANY (v_roles)
     AND v_issue_unit_id IS NOT NULL
     AND p_entry_unit_id IS NOT DISTINCT FROM v_issue_unit_id THEN
    RETURN TRUE;
  END IF;

  IF 'production' = ANY (v_roles)
     AND v_production_unit_id IS NOT NULL
     AND p_entry_unit_id IS NOT DISTINCT FROM v_production_unit_id THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_inventory_unit_roles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NOT private.entry_unit_matches_roles(
    NEW.tenant_id,
    NEW.ingredient_id,
    NEW.entry_unit_id,
    TG_ARGV[0]
  ) THEN
    RAISE EXCEPTION 'inventory_unit_role_mismatch:%', TG_ARGV[0]
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_inventory_unit_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NOT private.entry_unit_matches_roles(
    NEW.tenant_id,
    NEW.ingredient_id,
    NEW.entry_unit_id,
    TG_ARGV[0]
  ) THEN
    RAISE EXCEPTION 'inventory_unit_role_mismatch:%', TG_ARGV[0]
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_grn_entry_unit_role ON public.grn_items;
CREATE TRIGGER enforce_grn_entry_unit_role
  BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id
  ON public.grn_items
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_inventory_unit_roles('receipt,issue');

DROP TRIGGER IF EXISTS enforce_transfer_entry_unit_role ON public.stock_transfer_items;
CREATE TRIGGER enforce_transfer_entry_unit_role
  BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id
  ON public.stock_transfer_items
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_inventory_unit_roles('issue,receipt');

DROP TRIGGER IF EXISTS enforce_issue_entry_unit_role ON public.stock_issue_items;
CREATE TRIGGER enforce_issue_entry_unit_role
  BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id
  ON public.stock_issue_items
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_inventory_unit_roles('issue,receipt');

DROP TRIGGER IF EXISTS enforce_purchase_order_entry_unit_role ON public.purchase_order_items;
CREATE TRIGGER enforce_purchase_order_entry_unit_role
  BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id
  ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_inventory_unit_roles('receipt');

DROP TRIGGER IF EXISTS enforce_production_recipe_entry_unit_role ON public.production_recipes;
CREATE TRIGGER enforce_production_recipe_entry_unit_role
  BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id
  ON public.production_recipes
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_inventory_unit_roles('production');

CREATE OR REPLACE FUNCTION private.enforce_stock_movement_unit_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.type IN ('production_consumption', 'production_output') THEN
    IF NOT private.entry_unit_matches_roles(
      NEW.tenant_id,
      NEW.ingredient_id,
      NEW.entry_unit_id,
      'production'
    ) THEN
      RAISE EXCEPTION 'inventory_unit_role_mismatch:production' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT private.entry_unit_matches_roles(
    NEW.tenant_id,
    NEW.ingredient_id,
    NEW.entry_unit_id,
    'receipt,issue'
  ) THEN
    RAISE EXCEPTION 'inventory_unit_role_mismatch:receipt,issue' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
