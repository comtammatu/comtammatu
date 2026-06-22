BEGIN;

-- sync_missing_permissions_from_template() is a permission-maintenance helper:
-- it iterates active profiles and adds missing permission grants from role
-- templates. Verified on PROD it has NO app .rpc() caller and NO internal/cron
-- caller — it is only invoked manually during admin maintenance / migrations
-- (as postgres/service_role). Leaving it EXECUTE-able by authenticated lets any
-- logged-in user trigger a tenant-wide permission re-sync (a privilege-management
-- surface). Lock it to the definer/service roles. REVOKE is a no-op when absent.

REVOKE EXECUTE ON FUNCTION public.sync_missing_permissions_from_template() FROM anon, authenticated, public;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.sync_missing_permissions_from_template()', 'execute')
     OR has_function_privilege('anon', 'public.sync_missing_permissions_from_template()', 'execute') THEN
    RAISE EXCEPTION 'sync_missing_permissions_from_template still executable by an API role';
  END IF;
END $$;

COMMIT;
