BEGIN;

REVOKE ALL ON FUNCTION public.enforce_grn_central_site_only()
FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.activate_inventory_valuation_cutover(uuid)
SECURITY INVOKER;

COMMIT;
