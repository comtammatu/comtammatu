-- Keep GRN last-price upsert compatible with the entry_unit_id contract after
-- legacy grn_items.unit was removed.

SET search_path = '';

CREATE OR REPLACE FUNCTION public.trg_upsert_grn_last_on_confirm()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  IF OLD.status = 'confirmed' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.express_approved, false) THEN RETURN NEW; END IF;

  INSERT INTO public.supplier_price_list (
    tenant_id,
    supplier_id,
    ingredient_id,
    uom,
    unit_price,
    source,
    effective_from,
    source_ref,
    created_by
  )
  SELECT
    NEW.tenant_id,
    NEW.supplier_id,
    gi.ingredient_id,
    public.inventory_entry_unit_code(NEW.tenant_id, gi.ingredient_id, gi.entry_unit_id),
    gi.unit_cost,
    'grn_last',
    CURRENT_DATE,
    jsonb_build_object('grn_id', NEW.id, 'grn_item_id', gi.id),
    NEW.created_by
  FROM public.grn_items gi
  WHERE gi.grn_id = NEW.id
    AND gi.received_quantity > 0
    AND gi.unit_cost IS NOT NULL
    AND gi.unit_cost > 0
  ON CONFLICT (tenant_id, supplier_id, ingredient_id, uom)
    WHERE source = 'grn_last' AND effective_to IS NULL
  DO UPDATE SET
    unit_price = EXCLUDED.unit_price,
    effective_from = EXCLUDED.effective_from,
    source_ref = EXCLUDED.source_ref,
    created_at = now(),
    created_by = EXCLUDED.created_by;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_upsert_grn_last_on_confirm() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_upsert_grn_last_on_confirm() TO service_role;
