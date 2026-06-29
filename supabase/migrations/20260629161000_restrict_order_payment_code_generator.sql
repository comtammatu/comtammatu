REVOKE ALL ON FUNCTION public.generate_order_payment_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_order_payment_code() FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_order_payment_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_payment_code() TO service_role;
