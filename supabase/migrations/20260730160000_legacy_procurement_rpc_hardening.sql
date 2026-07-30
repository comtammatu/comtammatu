REVOKE ALL ON FUNCTION public.create_purchase_order_from_grn(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_from_grn(bigint)
  TO service_role;

REVOKE ALL ON FUNCTION public.create_purchase_orders_from_request(bigint, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_orders_from_request(bigint, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.enforce_grn_central_site_only()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_grn_central_site_only()
  TO service_role;

REVOKE ALL ON FUNCTION public.confirm_goods_receipt_note_legacy(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt_note_legacy(bigint)
  TO service_role;

NOTIFY pgrst, 'reload schema';
