CREATE OR REPLACE FUNCTION public.enforce_supplier_item_line_mapping()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_supplier_id bigint;
BEGIN
  IF TG_TABLE_NAME = 'purchase_order_items' THEN
    SELECT po.supplier_id
      INTO v_supplier_id
      FROM public.purchase_orders po
     WHERE po.id = NEW.po_id
       AND po.tenant_id = NEW.tenant_id;
  ELSIF TG_TABLE_NAME = 'grn_items' THEN
    SELECT grn.supplier_id
      INTO v_supplier_id
      FROM public.goods_received_notes grn
     WHERE grn.id = NEW.grn_id
       AND grn.tenant_id = NEW.tenant_id;
  ELSE
    RAISE EXCEPTION 'unsupported_supplier_item_line_table'
      USING ERRCODE = '22023';
  END IF;

  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'supplier_item_parent_not_found'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
       SELECT 1
         FROM public.supplier_items si
        WHERE si.tenant_id = NEW.tenant_id
          AND si.supplier_id = v_supplier_id
          AND si.ingredient_id = NEW.ingredient_id
          AND si.is_active
     ) THEN
    RAISE EXCEPTION 'supplier_item_mapping_required'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_supplier_items_on_document_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'purchase_orders'
     AND NEW.status = 'sent'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1
         FROM public.purchase_order_items poi
        WHERE poi.po_id = NEW.id
          AND poi.tenant_id = NEW.tenant_id
          AND NOT EXISTS (
            SELECT 1
              FROM public.supplier_items si
             WHERE si.tenant_id = NEW.tenant_id
               AND si.supplier_id = NEW.supplier_id
               AND si.ingredient_id = poi.ingredient_id
               AND si.is_active
          )
     ) THEN
    RAISE EXCEPTION 'supplier_item_mapping_required'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'goods_received_notes'
     AND NEW.status = 'confirmed'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1
         FROM public.grn_items gi
        WHERE gi.grn_id = NEW.id
          AND gi.tenant_id = NEW.tenant_id
          AND NOT EXISTS (
            SELECT 1
              FROM public.supplier_items si
             WHERE si.tenant_id = NEW.tenant_id
               AND si.supplier_id = NEW.supplier_id
               AND si.ingredient_id = gi.ingredient_id
               AND si.is_active
          )
     ) THEN
    RAISE EXCEPTION 'supplier_item_mapping_required'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_supplier_item_line_mapping() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_supplier_items_on_document_status() FROM PUBLIC;

CREATE TRIGGER purchase_order_items_supplier_mapping
BEFORE INSERT OR UPDATE OF tenant_id, po_id, ingredient_id
ON public.purchase_order_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_supplier_item_line_mapping();

CREATE TRIGGER grn_items_supplier_mapping
BEFORE INSERT OR UPDATE OF tenant_id, grn_id, ingredient_id
ON public.grn_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_supplier_item_line_mapping();

CREATE TRIGGER purchase_orders_supplier_mapping_on_approval
BEFORE UPDATE OF status
ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_supplier_items_on_document_status();

CREATE TRIGGER goods_received_notes_supplier_mapping_on_confirm
BEFORE UPDATE OF status
ON public.goods_received_notes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_supplier_items_on_document_status();

COMMENT ON TABLE public.supplier_items IS
  'Supplier-specific ingredient mappings used to constrain PO and GRN lines.';
