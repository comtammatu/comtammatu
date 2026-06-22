CREATE OR REPLACE FUNCTION public.trg_update_stock_on_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.location_id IS NULL THEN
    RAISE EXCEPTION 'stock_movements.location_id required (after per-location migration)'
      USING ERRCODE = '23502';
  END IF;

  UPDATE public.stock_levels
  SET
    current_quantity = current_quantity + NEW.quantity_change,
    updated_at = now()
  WHERE ingredient_id = NEW.ingredient_id
    AND branch_id IS NOT DISTINCT FROM NEW.branch_id
    AND location_id = NEW.location_id
    AND tenant_id = NEW.tenant_id;

  IF NOT FOUND THEN
    INSERT INTO public.stock_levels (
      tenant_id,
      branch_id,
      ingredient_id,
      location_id,
      current_quantity
    )
    VALUES (
      NEW.tenant_id,
      NEW.branch_id,
      NEW.ingredient_id,
      NEW.location_id,
      NEW.quantity_change
    );
  END IF;

  IF NEW.type = 'count_adjustment' THEN
    UPDATE public.stock_levels
    SET last_counted_at = now()
    WHERE ingredient_id = NEW.ingredient_id
      AND branch_id IS NOT DISTINCT FROM NEW.branch_id
      AND location_id = NEW.location_id
      AND tenant_id = NEW.tenant_id;
  END IF;

  RETURN NEW;
END;
$$;
