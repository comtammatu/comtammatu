-- Rollback M2 backfill.
-- Clears backfilled rows and un-sets position_id where source_template is the system seed.

DELETE FROM public.staff_permissions
WHERE source_template IS NOT NULL;

UPDATE public.profiles
SET position_id = NULL
WHERE position_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.backfill_permissions_from_role();
DROP FUNCTION IF EXISTS public._auth_v2_is_tenant_wide_role(TEXT);
DROP FUNCTION IF EXISTS public._auth_v2_role_to_position(TEXT);
