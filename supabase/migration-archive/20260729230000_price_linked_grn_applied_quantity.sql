BEGIN;

CREATE OR REPLACE FUNCTION private.set_grn_line_total_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  NEW.total_cost := pg_catalog.round(
    CASE
      WHEN NEW.purchase_order_item_id IS NULL
        THEN NEW.received_quantity - NEW.rejected_quantity
      ELSE NEW.po_applied_quantity
    END * NEW.unit_cost,
    2
  );
  RETURN NEW;
END;
$$;

SELECT pg_catalog.set_config('comtammatu.grn_confirm', 'true', true);

UPDATE public.grn_items item
SET total_cost = pg_catalog.round(
  item.po_applied_quantity * item.unit_cost,
  2
)
FROM public.goods_received_notes grn
WHERE grn.id = item.grn_id
  AND grn.tenant_id = item.tenant_id
  AND grn.creation_idempotency_key IS NOT NULL
  AND item.purchase_order_item_id IS NOT NULL
  AND item.total_cost IS DISTINCT FROM pg_catalog.round(
    item.po_applied_quantity * item.unit_cost,
    2
  );

COMMIT;
