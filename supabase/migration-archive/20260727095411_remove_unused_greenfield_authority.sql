BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.companies)
     OR EXISTS (SELECT 1 FROM public.operational_sites)
     OR EXISTS (SELECT 1 FROM public.tenants WHERE company_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM private.identity_provisioning_requests)
     OR EXISTS (SELECT 1 FROM private.company_memberships)
     OR EXISTS (SELECT 1 FROM private.tenant_memberships)
     OR EXISTS (SELECT 1 FROM private.site_assignments)
     OR EXISTS (SELECT 1 FROM private.access_bindings)
     OR EXISTS (SELECT 1 FROM private.access_audit_log)
     OR EXISTS (SELECT 1 FROM private.access_bootstrap_state) THEN
    RAISE EXCEPTION 'authority cleanup requires empty operational relations'
      USING ERRCODE = '55000';
  END IF;

  IF (SELECT count(*) FROM private.capabilities) <> 9
     OR EXISTS (
       SELECT 1
       FROM private.capabilities
       WHERE key NOT IN (
         'access:manage_bindings',
         'branch:workspace_enter',
         'catalog:read',
         'company:dashboard_view',
         'finance:consolidated_read',
         'sites:oversee',
         'workforce:assign_site',
         'workforce:read',
         'workforce:self_read'
       )
     )
     OR (SELECT count(*) FROM private.capability_scopes) <> 9
     OR (SELECT count(*) FROM private.access_roles) <> 5
     OR EXISTS (
       SELECT 1
       FROM private.access_roles
       WHERE key NOT IN (
         'branch_operator',
         'company_admin',
         'office_member',
         'security_admin',
         'tenant_observer'
       )
     )
     OR (SELECT count(*) FROM private.access_role_capabilities) <> 11 THEN
    RAISE EXCEPTION 'authority cleanup found unexpected catalog state'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS access_audit_log_append_only
  ON private.access_audit_log;
DROP TRIGGER IF EXISTS access_bindings_guard_update
  ON private.access_bindings;
DROP TRIGGER IF EXISTS access_bindings_validate
  ON private.access_bindings;
DROP TRIGGER IF EXISTS access_role_capabilities_validate
  ON private.access_role_capabilities;
DROP TRIGGER IF EXISTS company_memberships_guard_update
  ON private.company_memberships;
DROP TRIGGER IF EXISTS tenant_memberships_guard_update
  ON private.tenant_memberships;
DROP TRIGGER IF EXISTS site_assignments_guard_update
  ON private.site_assignments;

DROP FUNCTION IF EXISTS private.can_company(text, bigint);
DROP FUNCTION IF EXISTS private.can_tenant(text, bigint);
DROP FUNCTION IF EXISTS private.can_site(text, bigint);
DROP FUNCTION IF EXISTS private.validate_access_binding();
DROP FUNCTION IF EXISTS private.validate_access_role_capability();
DROP FUNCTION IF EXISTS private.guard_access_binding_update();
DROP FUNCTION IF EXISTS private.guard_lifecycle_update();
DROP FUNCTION IF EXISTS private.prevent_access_audit_mutation();
DROP FUNCTION IF EXISTS private.assignment_class_rank(text);

DROP TABLE private.access_bootstrap_state;
DROP TABLE private.access_audit_log;
DROP TABLE private.access_bindings;
DROP TABLE private.access_role_capabilities;
DROP TABLE private.site_assignments;
DROP TABLE private.tenant_memberships;
DROP TABLE private.company_memberships;
DROP TABLE private.identity_provisioning_requests;
DROP TABLE private.access_roles;
DROP TABLE private.capability_scopes;
DROP TABLE private.capabilities;

DROP TABLE public.operational_sites;

ALTER TABLE public.tenants
  DROP CONSTRAINT tenants_id_company_id_key,
  DROP CONSTRAINT tenants_company_id_fkey,
  DROP COLUMN company_id;

DROP TABLE public.companies;
DROP EXTENSION btree_gist;

COMMIT;
