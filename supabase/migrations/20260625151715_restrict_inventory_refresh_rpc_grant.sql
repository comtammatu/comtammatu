REVOKE EXECUTE ON FUNCTION public.refresh_inventory_dashboard() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.refresh_inventory_dashboard() TO service_role;
