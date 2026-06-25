REVOKE EXECUTE ON FUNCTION public.aggregate_daily_b2c_invoice(bigint, date, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.aggregate_daily_b2c_invoice(bigint, date, uuid)
TO service_role;
