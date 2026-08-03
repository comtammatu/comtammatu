-- Allow pricing any draft PO linked to a draft GRN via source_grn_id
-- (multi-supplier split), not only goods_received_notes.po_id.

CREATE OR REPLACE FUNCTION public.update_purchase_order_prices_protected(
  p_po_id bigint,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_read_inventory_monetary(
    'procurement:price_list_read'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM purchase_order.id
  FROM public.purchase_orders AS purchase_order
  JOIN public.goods_received_notes AS grn
    ON grn.tenant_id = purchase_order.tenant_id
   AND grn.status = 'draft'
   AND (
     grn.po_id = purchase_order.id
     OR purchase_order.source_grn_id = grn.id
   )
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = v_tenant
    AND purchase_order.status = 'draft'
  FOR UPDATE OF purchase_order, grn;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_linked_to_draft_grn'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN public.update_purchase_order_prices(p_po_id, p_lines);
END;
$function$;

REVOKE ALL ON FUNCTION public.update_purchase_order_prices_protected(bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_purchase_order_prices_protected(bigint, jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.update_purchase_order_prices_protected(bigint, jsonb) IS
  'Price draft PO lines when linked to a draft GRN via po_id or source_grn_id (multi-supplier).';
