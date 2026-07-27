BEGIN;

CREATE OR REPLACE FUNCTION private.guard_access_binding_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'revoked bindings are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF ROW(
       NEW.id,
       NEW.auth_user_id,
       NEW.role_id,
       NEW.scope_kind,
       NEW.company_membership_id,
       NEW.tenant_membership_id,
       NEW.site_assignment_id,
       NEW.company_id,
       NEW.tenant_id,
       NEW.site_id,
       NEW.valid_from,
       NEW.created_by,
       NEW.create_reason,
       NEW.idempotency_key,
       NEW.created_at
     )
     IS DISTINCT FROM
     ROW(
       OLD.id,
       OLD.auth_user_id,
       OLD.role_id,
       OLD.scope_kind,
       OLD.company_membership_id,
       OLD.tenant_membership_id,
       OLD.site_assignment_id,
       OLD.company_id,
       OLD.tenant_id,
       OLD.site_id,
       OLD.valid_from,
       OLD.created_by,
       OLD.create_reason,
       OLD.idempotency_key,
       OLD.created_at
     ) THEN
    RAISE EXCEPTION 'binding identity, role, and scope are immutable'
      USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_access_binding_update()
  FROM PUBLIC, anon, authenticated;

COMMIT;
