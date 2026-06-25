DROP POLICY IF EXISTS order_daily_counters_write
ON public.order_daily_counters;

REVOKE ALL ON TABLE public.order_daily_counters
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.order_daily_counters
TO service_role;

REVOKE ALL ON SEQUENCE public.order_daily_counters_id_seq
FROM PUBLIC, anon, authenticated;

GRANT ALL ON SEQUENCE public.order_daily_counters_id_seq
TO service_role;
