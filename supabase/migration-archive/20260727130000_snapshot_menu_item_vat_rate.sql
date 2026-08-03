CREATE OR REPLACE FUNCTION public.populate_order_item_vat_rate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_vat_rate numeric(5,2);
BEGIN
  SELECT menu_items.vat_rate
    INTO v_vat_rate
    FROM public.menu_items
   WHERE menu_items.id = NEW.menu_item_id
     AND menu_items.tenant_id = NEW.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'menu_item_tax_profile_missing'
      USING ERRCODE = 'no_data_found';
  END IF;

  NEW.vat_rate := v_vat_rate;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.populate_order_item_vat_rate() IS
  'Snapshots menu_items.vat_rate on each new order line.';

DROP FUNCTION public.resolve_gtgt_rate(bigint, date);
