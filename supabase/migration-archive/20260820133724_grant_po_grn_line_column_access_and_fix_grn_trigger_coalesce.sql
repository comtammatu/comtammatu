-- Production triage 2026-08-20: purchase workspace SELECT on new ADR 0043 columns
-- failed with 42501; create_purchase_order submit hit coalesce(text, unknown)
-- in enforce_linked_grn_line_immutability when Auto-GRN inserted grn_items.

GRANT SELECT (supplier_id) ON public.purchase_order_items TO authenticated;
GRANT SELECT (confirmed_at) ON public.grn_items TO authenticated;

CREATE OR REPLACE FUNCTION private.enforce_linked_grn_line_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_grn record;
  v_po_item record;
  v_confirming boolean := pg_catalog.coalesce(
    pg_catalog.current_setting('comtammatu.grn_confirm', TRUE),
    'false'::pg_catalog.text
  ) = 'true';
  v_owner_price_patch boolean := pg_catalog.coalesce(
    pg_catalog.current_setting('comtammatu.owner_grn_unit_cost_patch', TRUE),
    'false'::pg_catalog.text
  ) = 'true';
BEGIN
  IF TG_OP = 'UPDATE'
     AND (
       to_jsonb(NEW) - 'entry_to_base_factor' - 'entry_unit_code'
     ) IS NOT DISTINCT FROM (
       to_jsonb(OLD) - 'entry_to_base_factor' - 'entry_unit_code'
     ) THEN
    RETURN NEW;
  END IF;

  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = pg_catalog.coalesce(NEW.grn_id, OLD.grn_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_grn.status = 'draft' AND OLD.confirmed_at IS NULL THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'confirmed_grn_lines_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.grn_id IS DISTINCT FROM OLD.grn_id
       OR NEW.purchase_order_item_id IS DISTINCT FROM
         OLD.purchase_order_item_id
       OR NEW.ingredient_id IS DISTINCT FROM OLD.ingredient_id
       OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
     ) THEN
    RAISE EXCEPTION 'grn_line_identity_immutable'
      USING ERRCODE = '23514';
  END IF;

  SELECT po_item.ingredient_id, po_item.supplier_id
  INTO v_po_item
  FROM public.purchase_order_items AS po_item
  WHERE po_item.id = NEW.purchase_order_item_id
    AND po_item.tenant_id = v_grn.tenant_id
    AND po_item.po_id = v_grn.po_id;

  IF NOT FOUND
     OR NEW.ingredient_id <> v_po_item.ingredient_id
     OR NEW.supplier_id <> v_po_item.supplier_id THEN
    RAISE EXCEPTION 'grn_line_po_mismatch' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ingredient_units AS ingredient_unit
    WHERE ingredient_unit.tenant_id = NEW.tenant_id
      AND ingredient_unit.ingredient_id = NEW.ingredient_id
      AND ingredient_unit.unit_id = NEW.entry_unit_id
      AND ingredient_unit.is_active
  ) THEN
    RAISE EXCEPTION 'entry_unit_not_configured' USING ERRCODE = '23503';
  END IF;

  IF v_confirming THEN
    RETURN NEW;
  END IF;

  IF v_owner_price_patch AND TG_OP = 'UPDATE' THEN
    IF NEW.received_quantity IS DISTINCT FROM OLD.received_quantity
       OR NEW.rejected_quantity IS DISTINCT FROM OLD.rejected_quantity
       OR NEW.entry_unit_id IS DISTINCT FROM OLD.entry_unit_id
       OR NEW.po_applied_quantity IS DISTINCT FROM OLD.po_applied_quantity
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
       OR NEW.rejected_photo_url IS DISTINCT FROM OLD.rejected_photo_url THEN
      RAISE EXCEPTION 'confirmed_grn_lines_immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'confirmed_grn_lines_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'confirmed_grn_lines_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.unit_cost > 0 THEN
    NEW.total_cost := private.grn_line_book_total(
      NEW.tenant_id,
      NEW.ingredient_id,
      NEW.received_quantity - NEW.rejected_quantity,
      NEW.entry_unit_id,
      NEW.unit_cost,
      NEW.unit_cost_unit_id
    );
  ELSE
    NEW.total_cost := 0;
  END IF;
  NEW.po_applied_quantity := 0;
  RETURN NEW;
END;
$function$;
