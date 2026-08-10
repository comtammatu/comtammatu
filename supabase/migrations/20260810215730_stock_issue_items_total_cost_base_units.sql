-- stock_issue_items.quantity is entry-unit qty; unit_cost is per-base WAC.
-- The old generated total_cost = quantity * unit_cost under-counted whenever
-- entry unit ≠ base. Generated columns cannot call STABLE inv_to_base*, so
-- replace with a maintained column + BEFORE trigger.

CREATE OR REPLACE FUNCTION public.stock_issue_items_set_total_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_base_quantity numeric;
BEGIN
  v_base_quantity := public.inv_to_base_for_tenant(
    NEW.tenant_id,
    NEW.ingredient_id,
    NEW.entry_unit_id,
    NEW.quantity
  );
  NEW.total_cost := pg_catalog.round(
    coalesce(v_base_quantity, 0) * coalesce(NEW.unit_cost, 0),
    2
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.stock_issue_items_set_total_cost() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_issue_items_set_total_cost()
  TO postgres, service_role;

ALTER TABLE public.stock_issue_items
  ALTER COLUMN total_cost DROP EXPRESSION IF EXISTS;

ALTER TABLE public.stock_issue_items
  ALTER COLUMN total_cost SET DEFAULT 0;

UPDATE public.stock_issue_items AS item
SET total_cost = pg_catalog.round(
  item.quantity * unit_ladder.to_base_factor * item.unit_cost,
  2
)
FROM public.ingredient_units AS unit_ladder
WHERE unit_ladder.tenant_id = item.tenant_id
  AND unit_ladder.ingredient_id = item.ingredient_id
  AND unit_ladder.unit_id = item.entry_unit_id;

ALTER TABLE public.stock_issue_items
  ALTER COLUMN total_cost SET NOT NULL;

DROP TRIGGER IF EXISTS trg_stock_issue_items_set_total_cost
  ON public.stock_issue_items;

CREATE TRIGGER trg_stock_issue_items_set_total_cost
  BEFORE INSERT OR UPDATE OF quantity, unit_cost, entry_unit_id, ingredient_id, tenant_id
  ON public.stock_issue_items
  FOR EACH ROW
  EXECUTE FUNCTION public.stock_issue_items_set_total_cost();

COMMENT ON COLUMN public.stock_issue_items.total_cost IS
  'Line value in VND: entry quantity converted to base × per-base unit_cost.';

COMMENT ON FUNCTION public.stock_issue_items_set_total_cost() IS
  'Maintains stock_issue_items.total_cost as base_qty × per-base WAC.';
