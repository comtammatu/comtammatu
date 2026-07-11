-- ============================================================================
-- POS/KDS: harden route_order_to_kds execute grants
--
-- Older migrations granted execute broadly on route_order_to_kds. The function
-- is SECURITY INVOKER, but kitchen routing is still an authenticated operator
-- action and should not be executable by anon.
-- ============================================================================

REVOKE ALL ON FUNCTION public.route_order_to_kds(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.route_order_to_kds(BIGINT) TO authenticated;
