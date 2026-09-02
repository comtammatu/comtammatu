-- Legacy overload retired by unify_stock_fulfillment; live cancel is
-- public.cancel_stock_request(bigint, text). Baseline still installed the
-- one-arg signature, so empty-DB/e2e replay keeps it until this drop.

DROP FUNCTION IF EXISTS public.cancel_stock_request(bigint);
