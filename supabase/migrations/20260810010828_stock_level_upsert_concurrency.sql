-- INV-2: first stock_levels row per location must survive concurrent movements.
-- Replace UPDATE-then-INSERT with a single INSERT … ON CONFLICT DO UPDATE so two
-- concurrent first movements for the same (ingredient, branch, location, tenant)
-- both succeed instead of one raising a unique violation that aborts the host
-- transaction (GRN confirm, transfer receive, or POS payment).

CREATE OR REPLACE FUNCTION public.trg_update_stock_on_movement() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.location_id IS NULL THEN
    RAISE EXCEPTION 'stock_movements.location_id required (after per-location migration)'
      USING ERRCODE = '23502';
  END IF;

  INSERT INTO public.stock_levels (
    tenant_id,
    branch_id,
    ingredient_id,
    location_id,
    current_quantity,
    last_counted_at
  )
  VALUES (
    NEW.tenant_id,
    NEW.branch_id,
    NEW.ingredient_id,
    NEW.location_id,
    NEW.quantity_change,
    CASE
      WHEN NEW.type = 'count_adjustment' THEN now()
      ELSE NULL
    END
  )
  ON CONFLICT (ingredient_id, branch_id, location_id, tenant_id)
  DO UPDATE SET
    current_quantity = public.stock_levels.current_quantity + EXCLUDED.current_quantity,
    last_counted_at = CASE
      WHEN NEW.type = 'count_adjustment' THEN now()
      ELSE public.stock_levels.last_counted_at
    END,
    updated_at = now();

  RETURN NEW;
END;
$$;
