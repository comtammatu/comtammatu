-- consume_stock_for_order(bigint) is superseded by consume_stock_for_order_service
-- (service_role only); authenticated must not deplete inventory by calling it directly.
REVOKE EXECUTE ON FUNCTION public.consume_stock_for_order(bigint) FROM authenticated;

-- confirm_payment_and_post has no application caller; remove the authenticated money path.
REVOKE EXECUTE ON FUNCTION public.confirm_payment_and_post(bigint, bigint, bigint, text) FROM authenticated;

-- payroll_entries / payroll_periods are RPC-only (upsert_payroll_calculation, SECURITY DEFINER).
-- Direct DML grants bypass the draft/calculated status guard.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.payroll_entries FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.payroll_periods FROM authenticated, anon;

-- Money columns are NUMERIC(15,2); expenses.amount was NUMERIC(14,2).
ALTER TABLE public.expenses ALTER COLUMN amount TYPE numeric(15, 2);
