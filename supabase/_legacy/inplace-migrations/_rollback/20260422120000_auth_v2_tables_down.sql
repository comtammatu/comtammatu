-- Rollback for auth v2 M1 (tables + seed + helpers).
-- NOT auto-applied. Run manually if aborting before M2.
-- Order matters: drop dependents first.

DROP FUNCTION IF EXISTS public.current_position();
DROP FUNCTION IF EXISTS public.has_position(TEXT);
DROP FUNCTION IF EXISTS public.has_permission(BIGINT, TEXT);

ALTER TABLE public.profiles DROP COLUMN IF EXISTS position_id;

DROP TABLE IF EXISTS public.staff_permissions;
DROP TABLE IF EXISTS public.role_templates;
DROP TABLE IF EXISTS public.positions;
DROP TABLE IF EXISTS public.permission_keys;
