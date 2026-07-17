BEGIN;

REVOKE ALL ON TABLE public.staff_permissions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.staff_permissions TO authenticated;
REVOKE ALL ON SEQUENCE public.staff_permissions_id_seq FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS staff_permissions_select_admin ON public.staff_permissions;
DROP POLICY IF EXISTS staff_permissions_select_self ON public.staff_permissions;
DROP POLICY IF EXISTS staff_permissions_select ON public.staff_permissions;

CREATE POLICY staff_permissions_select
ON public.staff_permissions
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (
    tenant_id = (SELECT public.auth_tenant_id())
    AND (SELECT public.has_permission(NULL::bigint, 'staff:assign_permission'))
  )
);

COMMIT;
