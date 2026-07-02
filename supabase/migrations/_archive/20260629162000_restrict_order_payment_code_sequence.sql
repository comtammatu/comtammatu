REVOKE ALL ON SEQUENCE public.order_payment_code_sequence FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.order_payment_code_sequence FROM anon;
GRANT USAGE, SELECT ON SEQUENCE public.order_payment_code_sequence TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.order_payment_code_sequence TO service_role;
