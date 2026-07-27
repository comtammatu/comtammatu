BEGIN;

CREATE INDEX tenants_company_id_idx
  ON public.tenants (company_id);

CREATE INDEX operational_sites_tenant_company_idx
  ON public.operational_sites (tenant_id, company_id);

CREATE INDEX identity_provisioning_requests_auth_user_idx
  ON private.identity_provisioning_requests (auth_user_id);

CREATE INDEX identity_provisioning_requests_company_idx
  ON private.identity_provisioning_requests (company_id);

CREATE INDEX identity_provisioning_requests_requested_by_idx
  ON private.identity_provisioning_requests (requested_by);

CREATE INDEX company_memberships_auth_user_idx
  ON private.company_memberships (auth_user_id);

CREATE INDEX company_memberships_company_idx
  ON private.company_memberships (company_id);

CREATE INDEX tenant_memberships_auth_user_idx
  ON private.tenant_memberships (auth_user_id);

CREATE INDEX tenant_memberships_company_membership_idx
  ON private.tenant_memberships (
    company_membership_id,
    auth_user_id,
    company_id
  );

CREATE INDEX tenant_memberships_tenant_lineage_idx
  ON private.tenant_memberships (tenant_id, company_id);

CREATE INDEX site_assignments_auth_user_idx
  ON private.site_assignments (auth_user_id);

CREATE INDEX site_assignments_tenant_membership_idx
  ON private.site_assignments (
    tenant_membership_id,
    auth_user_id,
    company_id,
    tenant_id
  );

CREATE INDEX site_assignments_site_lineage_idx
  ON private.site_assignments (site_id, tenant_id, company_id);

CREATE INDEX access_role_capabilities_role_scope_idx
  ON private.access_role_capabilities (role_id, role_scope_kind);

CREATE INDEX access_role_capabilities_capability_scope_idx
  ON private.access_role_capabilities (
    capability_key,
    capability_scope_kind
  );

CREATE INDEX access_bindings_role_scope_idx
  ON private.access_bindings (role_id, scope_kind);

CREATE INDEX access_bindings_company_membership_idx
  ON private.access_bindings (
    company_membership_id,
    auth_user_id,
    company_id
  );

CREATE INDEX access_bindings_tenant_membership_idx
  ON private.access_bindings (
    tenant_membership_id,
    auth_user_id,
    company_id,
    tenant_id
  );

CREATE INDEX access_bindings_site_assignment_idx
  ON private.access_bindings (
    site_assignment_id,
    auth_user_id,
    company_id,
    tenant_id,
    site_id
  );

CREATE INDEX access_bindings_created_by_idx
  ON private.access_bindings (created_by);

CREATE INDEX access_bindings_revoked_by_idx
  ON private.access_bindings (revoked_by);

CREATE INDEX access_audit_log_actor_idx
  ON private.access_audit_log (actor_user_id);

CREATE INDEX access_audit_log_target_idx
  ON private.access_audit_log (target_user_id);

CREATE INDEX access_audit_log_binding_idx
  ON private.access_audit_log (binding_id);

CREATE INDEX access_audit_log_company_idx
  ON private.access_audit_log (company_id);

CREATE INDEX access_bootstrap_state_completed_by_idx
  ON private.access_bootstrap_state (completed_by);

COMMIT;
