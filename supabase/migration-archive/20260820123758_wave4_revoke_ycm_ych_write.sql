-- Wave 4: freeze YCM/YCH writes after the warehouse PO/GRN soak.
-- Keep close/cancel so leftover vouchers can still be closed without convert.

REVOKE ALL ON FUNCTION public.save_purchase_demand(
  bigint, bigint, date, text, jsonb, boolean, uuid
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.review_purchase_demand(
  bigint, text, jsonb, text, uuid
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.save_stock_request(
  bigint, bigint, timestamp with time zone, text, jsonb, boolean, uuid
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.fulfill_stock_request_lines(
  bigint, text, bigint, bigint, bigint[]
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.reject_stock_request_lines(
  bigint, text, bigint[], text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_purchase_demand(
  bigint, bigint, date, text, jsonb, boolean, uuid
) TO service_role;

GRANT EXECUTE ON FUNCTION public.review_purchase_demand(
  bigint, text, jsonb, text, uuid
) TO service_role;

GRANT EXECUTE ON FUNCTION public.save_stock_request(
  bigint, bigint, timestamp with time zone, text, jsonb, boolean, uuid
) TO service_role;

GRANT EXECUTE ON FUNCTION public.fulfill_stock_request_lines(
  bigint, text, bigint, bigint, bigint[]
) TO service_role;

GRANT EXECUTE ON FUNCTION public.reject_stock_request_lines(
  bigint, text, bigint[], text
) TO service_role;
