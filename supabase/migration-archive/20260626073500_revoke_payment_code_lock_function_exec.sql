REVOKE ALL ON FUNCTION public.order_payment_code_is_exposed(bigint, bigint, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_payment_code_is_exposed(bigint, bigint, bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.order_payment_code_is_exposed(bigint, bigint, bigint, text) FROM authenticated;

REVOKE ALL ON FUNCTION public.prevent_order_amount_mutation_after_payment_code_exposed() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_order_amount_mutation_after_payment_code_exposed() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_order_amount_mutation_after_payment_code_exposed() FROM authenticated;
