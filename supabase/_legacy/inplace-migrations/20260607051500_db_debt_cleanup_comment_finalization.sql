COMMENT ON FUNCTION public.sync_missing_permissions_from_template() IS
  'Synchronizes missing staff permission rows from position templates after template changes.';

COMMENT ON TABLE public.notifications IS
  'Notification feed. Rows target role and branch; RLS enforces visibility.';

COMMENT ON COLUMN public.profiles.position_id IS
  'HR position assigned to this profile.';

COMMENT ON INDEX public.suppliers_tax_code_tenant_unique IS
  'Partial unique index that blocks duplicate non-null tax_code values inside one tenant.';
