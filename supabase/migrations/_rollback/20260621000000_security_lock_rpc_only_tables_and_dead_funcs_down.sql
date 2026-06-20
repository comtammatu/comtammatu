GRANT EXECUTE ON FUNCTION public.consume_stock_for_order(bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.confirm_payment_and_post(bigint, bigint, bigint, text) TO authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE public.payroll_entries TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.payroll_periods TO authenticated, anon;

ALTER TABLE public.expenses ALTER COLUMN amount TYPE numeric(14, 2);
