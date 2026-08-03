-- Scoped access bindings for the HR control plane.

CREATE OR REPLACE FUNCTION private.staff_role_from_position_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_code
    WHEN 'owner' THEN 'owner'
    WHEN 'accountant' THEN 'accountant'
    WHEN 'central_supply_ops' THEN 'central_supply_ops'
    WHEN 'central_kitchen_lead' THEN 'central_kitchen_lead'
    WHEN 'branch_manager' THEN 'branch_manager'
    WHEN 'cashier' THEN 'cashier'
    WHEN 'chef' THEN 'chef'
    WHEN 'kitchen_counter' THEN 'chef'
    WHEN 'kitchen_helper' THEN 'chef'
    WHEN 'grill_counter' THEN 'chef'
    WHEN 'cleaner' THEN 'branch_staff'
    WHEN 'guard' THEN 'branch_staff'
    WHEN 'hr_manager' THEN 'branch_staff'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION private.required_branch_kind_for_position_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_code
    WHEN 'owner' THEN NULL
    WHEN 'accountant' THEN NULL
    WHEN 'hr_manager' THEN NULL
    WHEN 'central_supply_ops' THEN 'central_supply'
    WHEN 'central_kitchen_lead' THEN 'central_kitchen'
    WHEN 'branch_manager' THEN 'branch'
    WHEN 'cashier' THEN 'branch'
    WHEN 'chef' THEN 'branch'
    WHEN 'kitchen_counter' THEN 'branch'
    WHEN 'kitchen_helper' THEN 'branch'
    WHEN 'grill_counter' THEN 'branch'
    WHEN 'cleaner' THEN 'branch'
    WHEN 'guard' THEN 'branch'
    ELSE 'unassigned'
  END
$$;

INSERT INTO public.permission_keys (key, module, description, scope, is_delegable_to_staff)
VALUES
  ('hr:view_sensitive_employee', 'hr', 'View employee identity, contract, bank, and salary data', 'tenant', true),
  ('hr:force_close_attendance', 'hr', 'Close stale attendance with an audited reason', 'either', true),
  ('hr:correct_attendance', 'hr', 'Correct attendance through an audited RPC', 'tenant', true),
  ('hr:manage_leave_policy', 'hr', 'Manage tenant leave and workday policy', 'tenant', true),
  ('hr:manage_shift_catalog', 'hr', 'Manage the tenant shift catalog', 'tenant', true),
  ('hr:manage_position_tasks', 'hr', 'Manage position and employee shift task templates', 'tenant', true),
  ('hr:payroll_prepare', 'hr', 'Prepare payroll previews and adjustments', 'tenant', true),
  ('hr:payroll_snapshot', 'hr', 'Finalize one immutable payroll snapshot per period', 'tenant', true),
  ('staff:provision', 'staff', 'Create, lock, and restore staff accounts', 'tenant', true),
  ('auth:binding_read', 'auth', 'Read access role bindings', 'tenant', true),
  ('auth:binding_manage', 'auth', 'Grant and revoke access role bindings', 'tenant', false),
  ('auth:audit_read', 'auth', 'Read authorization audit history', 'tenant', true)
ON CONFLICT (key) DO UPDATE SET
  module = EXCLUDED.module,
  description = EXCLUDED.description,
  scope = EXCLUDED.scope,
  is_delegable_to_staff = EXCLUDED.is_delegable_to_staff;

CREATE TABLE public.auth_access_roles (
  code text PRIMARY KEY,
  label_vi text NOT NULL,
  allowed_scope text NOT NULL,
  CONSTRAINT auth_access_roles_scope_check
    CHECK (allowed_scope IN ('tenant', 'branch'))
);

CREATE TABLE public.auth_access_role_capabilities (
  role_code text NOT NULL
    REFERENCES public.auth_access_roles(code) ON DELETE CASCADE,
  permission_key text NOT NULL
    REFERENCES public.permission_keys(key) ON DELETE CASCADE,
  PRIMARY KEY (role_code, permission_key)
);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_tenant_key UNIQUE (id, tenant_id);

CREATE TABLE public.auth_role_bindings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role_code text NOT NULL
    REFERENCES public.auth_access_roles(code) ON DELETE RESTRICT,
  scope_type text NOT NULL,
  branch_id bigint,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  CONSTRAINT auth_role_bindings_user_tenant_fkey
    FOREIGN KEY (user_id, tenant_id)
    REFERENCES public.profiles(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT auth_role_bindings_branch_tenant_fkey
    FOREIGN KEY (branch_id, tenant_id)
    REFERENCES public.branches(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT auth_role_bindings_scope_check CHECK (
    (scope_type = 'tenant' AND branch_id IS NULL)
    OR (scope_type = 'branch' AND branch_id IS NOT NULL)
  ),
  CONSTRAINT auth_role_bindings_validity_check
    CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE UNIQUE INDEX auth_role_bindings_one_active_scope
  ON public.auth_role_bindings (
    tenant_id,
    user_id,
    role_code,
    scope_type,
    COALESCE(branch_id, 0)
  )
  WHERE valid_until IS NULL;

CREATE INDEX auth_role_bindings_actor_lookup
  ON public.auth_role_bindings (user_id, tenant_id, valid_from, valid_until);

CREATE TABLE public.auth_role_binding_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  role_code text NOT NULL,
  scope_type text NOT NULL,
  branch_id bigint,
  action text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_role_binding_audit_action_check
    CHECK (action IN ('grant', 'revoke'))
);

INSERT INTO public.auth_access_roles (code, label_vi, allowed_scope)
VALUES
  ('tenant_owner', 'Chủ sở hữu', 'tenant'),
  ('hr_manager', 'Quản lý nhân sự', 'tenant'),
  ('branch_manager', 'Quản lý chi nhánh', 'branch'),
  ('security_admin', 'Quản trị phân quyền', 'tenant');

INSERT INTO public.auth_access_role_capabilities (role_code, permission_key)
SELECT 'tenant_owner', key
FROM public.permission_keys
WHERE key <> 'auth:binding_manage';

INSERT INTO public.auth_access_role_capabilities (role_code, permission_key)
VALUES
  ('hr_manager', 'hr:view_employee'),
  ('hr_manager', 'hr:view_sensitive_employee'),
  ('hr_manager', 'hr:manage_employee'),
  ('hr_manager', 'hr:assign_shift'),
  ('hr_manager', 'hr:approve_checkout'),
  ('hr_manager', 'hr:approve_leave_request'),
  ('hr_manager', 'hr:force_close_attendance'),
  ('hr_manager', 'hr:correct_attendance'),
  ('hr_manager', 'hr:manage_leave_policy'),
  ('hr_manager', 'hr:manage_shift_catalog'),
  ('hr_manager', 'hr:manage_position_tasks'),
  ('hr_manager', 'hr:payroll_prepare'),
  ('hr_manager', 'hr:payroll_snapshot'),
  ('hr_manager', 'staff:view'),
  ('hr_manager', 'staff:manage'),
  ('hr_manager', 'staff:provision'),
  ('hr_manager', 'staff:assign_position'),
  ('hr_manager', 'auth:binding_read'),
  ('branch_manager', 'hr:view_employee'),
  ('branch_manager', 'hr:assign_shift'),
  ('branch_manager', 'hr:approve_checkout'),
  ('branch_manager', 'hr:approve_leave_request'),
  ('branch_manager', 'hr:force_close_attendance'),
  ('security_admin', 'auth:binding_read'),
  ('security_admin', 'auth:binding_manage'),
  ('security_admin', 'auth:audit_read');

-- Bootstrap explicit bindings once; later position changes never alter access.
INSERT INTO public.auth_role_bindings (
  tenant_id, user_id, role_code, scope_type, branch_id, granted_by
)
SELECT profile.tenant_id, profile.id, binding.role_code, 'tenant', NULL, profile.id
FROM public.profiles profile
JOIN public.positions position
  ON position.id = profile.position_id
 AND position.tenant_id = profile.tenant_id
CROSS JOIN (VALUES ('tenant_owner'), ('security_admin')) AS binding(role_code)
WHERE position.code = 'owner'
  AND profile.is_active;

INSERT INTO public.auth_role_bindings (
  tenant_id, user_id, role_code, scope_type, branch_id, granted_by
)
SELECT profile.tenant_id, profile.id, 'branch_manager', 'branch', profile.branch_id, profile.id
FROM public.profiles profile
JOIN public.positions position
  ON position.id = profile.position_id
 AND position.tenant_id = profile.tenant_id
WHERE position.code = 'branch_manager'
  AND profile.branch_id IS NOT NULL
  AND profile.is_active;

CREATE OR REPLACE FUNCTION private.has_role_capability(
  p_user_id uuid,
  p_tenant_id bigint,
  p_branch_id bigint,
  p_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.auth_role_bindings binding
    JOIN public.auth_access_role_capabilities capability
      ON capability.role_code = binding.role_code
     AND capability.permission_key = p_key
    JOIN public.auth_access_roles role
      ON role.code = binding.role_code
     AND role.allowed_scope = binding.scope_type
    JOIN public.profiles profile
      ON profile.id = binding.user_id
     AND profile.tenant_id = binding.tenant_id
     AND profile.is_active
    WHERE binding.user_id = p_user_id
      AND binding.tenant_id = p_tenant_id
      AND binding.valid_from <= now()
      AND (binding.valid_until IS NULL OR binding.valid_until > now())
      AND (
        binding.scope_type = 'tenant'
        OR (p_branch_id IS NOT NULL AND binding.branch_id = p_branch_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(p_branch_id bigint, p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT private.has_role_capability(
      auth.uid(),
      public.auth_tenant_id(),
      p_branch_id,
      p_key
    )
    OR EXISTS (
      SELECT 1
      FROM public.staff_permissions sp
      JOIN public.profiles pr
        ON pr.id = sp.user_id
       AND pr.tenant_id = sp.tenant_id
      JOIN public.positions po
        ON po.id = pr.position_id
       AND po.tenant_id = pr.tenant_id
      JOIN public.permission_keys pk ON pk.key = sp.permission_key
      WHERE sp.user_id = auth.uid()
        AND pr.tenant_id = public.auth_tenant_id()
        AND pr.is_active
        AND po.is_active
        AND sp.permission_key = p_key
        AND pk.is_delegable_to_staff
        AND sp.valid_from <= now()
        AND (sp.valid_until IS NULL OR sp.valid_until > now())
        AND CASE pk.scope
          WHEN 'tenant' THEN sp.branch_id IS NULL
          WHEN 'branch' THEN
            p_branch_id IS NOT NULL
            AND sp.branch_id = p_branch_id
            AND pr.branch_id = p_branch_id
          ELSE
            sp.branch_id IS NULL
            OR (
              p_branch_id IS NOT NULL
              AND sp.branch_id = p_branch_id
              AND pr.branch_id = p_branch_id
            )
        END
        AND (
          p_key <> ALL (ARRAY[
            'hr:approve_checkout',
            'hr:approve_leave_request'
          ]::text[])
          OR (
            private.staff_role_from_position_code(po.code) = 'branch_manager'
            AND p_branch_id IS NOT NULL
            AND pr.branch_id = p_branch_id
            AND sp.branch_id = p_branch_id
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.has_permission_any(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT private.has_role_capability(
      auth.uid(),
      public.auth_tenant_id(),
      NULL,
      p_key
    )
    OR EXISTS (
      SELECT 1
      FROM public.auth_role_bindings binding
      JOIN public.auth_access_role_capabilities capability
        ON capability.role_code = binding.role_code
       AND capability.permission_key = p_key
      JOIN public.profiles profile
        ON profile.id = binding.user_id
       AND profile.tenant_id = binding.tenant_id
       AND profile.is_active
      WHERE binding.user_id = auth.uid()
        AND binding.tenant_id = public.auth_tenant_id()
        AND binding.scope_type = 'branch'
        AND binding.valid_from <= now()
        AND (binding.valid_until IS NULL OR binding.valid_until > now())
    )
    OR EXISTS (
      SELECT 1
      FROM public.staff_permissions sp
      JOIN public.profiles pr
        ON pr.id = sp.user_id
       AND pr.tenant_id = sp.tenant_id
      JOIN public.positions po
        ON po.id = pr.position_id
       AND po.tenant_id = pr.tenant_id
      JOIN public.permission_keys pk ON pk.key = sp.permission_key
      WHERE sp.user_id = auth.uid()
        AND pr.tenant_id = public.auth_tenant_id()
        AND pr.is_active
        AND po.is_active
        AND sp.permission_key = p_key
        AND pk.is_delegable_to_staff
        AND sp.valid_from <= now()
        AND (sp.valid_until IS NULL OR sp.valid_until > now())
        AND CASE pk.scope
          WHEN 'tenant' THEN sp.branch_id IS NULL
          WHEN 'branch' THEN sp.branch_id IS NOT NULL AND sp.branch_id = pr.branch_id
          ELSE sp.branch_id IS NULL OR sp.branch_id = pr.branch_id
        END
        AND (
          p_key <> ALL (ARRAY[
            'hr:approve_checkout',
            'hr:approve_leave_request'
          ]::text[])
          OR (
            private.staff_role_from_position_code(po.code) = 'branch_manager'
            AND pr.branch_id IS NOT NULL
            AND sp.branch_id = pr.branch_id
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.set_auth_role_binding(
  p_target_user_id uuid,
  p_role_code text,
  p_branch_id bigint DEFAULT NULL,
  p_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_scope_type text;
  v_binding_id bigint;
BEGIN
  IF v_actor IS NULL OR v_tenant_id IS NULL
     OR NOT public.has_permission(NULL, 'auth:binding_manage') THEN
    RAISE EXCEPTION 'binding_manage_forbidden' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN
    RAISE EXCEPTION 'aal2_required' USING ERRCODE = '42501';
  END IF;

  SELECT role.allowed_scope
  INTO v_scope_type
  FROM public.auth_access_roles role
  WHERE role.code = p_role_code;
  IF v_scope_type IS NULL THEN
    RAISE EXCEPTION 'role_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = p_target_user_id
      AND profile.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'target_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF (v_scope_type = 'tenant' AND p_branch_id IS NOT NULL)
     OR (v_scope_type = 'branch' AND p_branch_id IS NULL) THEN
    RAISE EXCEPTION 'binding_scope_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches branch
    WHERE branch.id = p_branch_id
      AND branch.tenant_id = v_tenant_id
      AND branch.is_active
  ) THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT p_active
     AND p_target_user_id = v_actor
     AND p_role_code IN ('tenant_owner', 'security_admin') THEN
    RAISE EXCEPTION 'self_security_revoke_forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_active THEN
    SELECT binding.id INTO v_binding_id
    FROM public.auth_role_bindings binding
    WHERE binding.tenant_id = v_tenant_id
      AND binding.user_id = p_target_user_id
      AND binding.role_code = p_role_code
      AND binding.scope_type = v_scope_type
      AND binding.branch_id IS NOT DISTINCT FROM p_branch_id
      AND binding.valid_until IS NULL
    FOR UPDATE;

    IF v_binding_id IS NULL THEN
      INSERT INTO public.auth_role_bindings (
        tenant_id, user_id, role_code, scope_type, branch_id, granted_by
      ) VALUES (
        v_tenant_id, p_target_user_id, p_role_code, v_scope_type, p_branch_id, v_actor
      )
      RETURNING id INTO v_binding_id;

      INSERT INTO public.auth_role_binding_audit_log (
        tenant_id, actor_user_id, target_user_id, role_code,
        scope_type, branch_id, action
      ) VALUES (
        v_tenant_id, v_actor, p_target_user_id, p_role_code,
        v_scope_type, p_branch_id, 'grant'
      );
    END IF;
  ELSE
    UPDATE public.auth_role_bindings binding
    SET valid_until = now()
    WHERE binding.tenant_id = v_tenant_id
      AND binding.user_id = p_target_user_id
      AND binding.role_code = p_role_code
      AND binding.scope_type = v_scope_type
      AND binding.branch_id IS NOT DISTINCT FROM p_branch_id
      AND binding.valid_until IS NULL
    RETURNING binding.id INTO v_binding_id;

    IF v_binding_id IS NOT NULL THEN
      INSERT INTO public.auth_role_binding_audit_log (
        tenant_id, actor_user_id, target_user_id, role_code,
        scope_type, branch_id, action
      ) VALUES (
        v_tenant_id, v_actor, p_target_user_id, p_role_code,
        v_scope_type, p_branch_id, 'revoke'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'binding_id', v_binding_id,
    'active', p_active,
    'role_code', p_role_code,
    'scope_type', v_scope_type,
    'branch_id', p_branch_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_attendance_record(
  p_attendance_id bigint,
  p_check_in timestamptz,
  p_check_out timestamptz,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_previous jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_tenant_id IS NULL
     OR NOT public.has_permission(NULL, 'hr:correct_attendance') THEN
    RAISE EXCEPTION 'attendance_correction_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_check_in IS NULL OR (p_check_out IS NOT NULL AND p_check_out <= p_check_in) THEN
    RAISE EXCEPTION 'attendance_correction_time_invalid' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'attendance_correction_reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(attendance)
  INTO v_previous
  FROM public.attendance_records attendance
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = v_tenant_id
  FOR UPDATE;
  IF v_previous IS NULL THEN
    RAISE EXCEPTION 'attendance_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.attendance_records attendance
  SET check_in = p_check_in,
      check_out = p_check_out,
      note = concat_ws(E'\n', NULLIF(attendance.note, ''), btrim(p_reason)),
      updated_at = now()
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = v_tenant_id;

  PERFORM public.log_audit(
    'update',
    'attendance_record',
    p_attendance_id,
    v_previous,
    jsonb_build_object(
      'check_in', p_check_in,
      'check_out', p_check_out,
      'reason', btrim(p_reason)
    )
  );

  RETURN jsonb_build_object(
    'attendance_id', p_attendance_id,
    'check_in', p_check_in,
    'check_out', p_check_out
  );
END;
$$;

ALTER TABLE public.auth_access_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_access_role_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_role_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_role_binding_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_access_roles_read ON public.auth_access_roles
FOR SELECT TO authenticated
USING (public.has_permission(NULL, 'auth:binding_read'));

CREATE POLICY auth_access_role_capabilities_read
ON public.auth_access_role_capabilities
FOR SELECT TO authenticated
USING (public.has_permission(NULL, 'auth:binding_read'));

CREATE POLICY auth_role_bindings_read ON public.auth_role_bindings
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(NULL, 'auth:binding_read')
);

CREATE POLICY auth_role_binding_audit_read
ON public.auth_role_binding_audit_log
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(NULL, 'auth:audit_read')
);

REVOKE ALL ON TABLE public.auth_access_roles FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.auth_access_role_capabilities FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.auth_role_bindings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.auth_role_binding_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.auth_access_roles TO authenticated, service_role;
GRANT SELECT ON TABLE public.auth_access_role_capabilities TO authenticated, service_role;
GRANT SELECT ON TABLE public.auth_role_bindings TO authenticated, service_role;
GRANT SELECT ON TABLE public.auth_role_binding_audit_log TO authenticated, service_role;
GRANT ALL ON TABLE public.auth_access_roles TO service_role;
GRANT ALL ON TABLE public.auth_access_role_capabilities TO service_role;
GRANT ALL ON TABLE public.auth_role_bindings TO service_role;
GRANT ALL ON TABLE public.auth_role_binding_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.auth_role_bindings_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.auth_role_binding_audit_log_id_seq TO service_role;

REVOKE ALL ON FUNCTION private.has_role_capability(uuid, bigint, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_auth_role_binding(uuid, text, bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_auth_role_binding(uuid, text, bigint, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.correct_attendance_record(bigint, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_attendance_record(bigint, timestamptz, timestamptz, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.grant_permission(uuid, bigint, text, bigint, timestamptz, timestamptz) FROM authenticated;
REVOKE ALL ON FUNCTION public.revoke_permission(uuid, bigint, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.apply_template_to_user(uuid, bigint, bigint, timestamptz, timestamptz) FROM authenticated;

DROP POLICY contracts_select ON public.employment_contracts;
CREATE POLICY contracts_select ON public.employment_contracts
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(NULL, 'hr:view_sensitive_employee')
);

DROP POLICY contracts_write ON public.employment_contracts;
CREATE POLICY contracts_write ON public.employment_contracts
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(NULL, 'hr:manage_employee')
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(NULL, 'hr:manage_employee')
);

DROP POLICY employees_select ON public.employees;
CREATE POLICY employees_select ON public.employees
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND (
    public.has_permission(NULL, 'hr:view_employee')
    OR EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = employees.profile_id
        AND profile.tenant_id = employees.tenant_id
        AND profile.branch_id IS NOT NULL
        AND public.has_permission(profile.branch_id, 'hr:view_employee')
    )
  )
);

DROP POLICY employees_write ON public.employees;
CREATE POLICY employees_write ON public.employees
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(NULL, 'hr:manage_employee')
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(NULL, 'hr:manage_employee')
);

DROP POLICY profiles_select_authorized ON public.profiles;
CREATE POLICY profiles_select_authorized ON public.profiles
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND (
    id = auth.uid()
    OR public.has_permission(NULL, 'hr:view_employee')
    OR (branch_id IS NOT NULL AND public.has_permission(branch_id, 'hr:view_employee'))
  )
);

DROP POLICY payroll_adjustments_select ON public.payroll_adjustments;
CREATE POLICY payroll_adjustments_select ON public.payroll_adjustments
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(NULL, 'hr:payroll_prepare')
);

DROP POLICY payroll_entries_select ON public.payroll_entries;
CREATE POLICY payroll_entries_select ON public.payroll_entries
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND (
    (
      EXISTS (
        SELECT 1 FROM public.employees employee
        WHERE employee.id = payroll_entries.employee_id
          AND employee.profile_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM public.payroll_periods period
        WHERE period.id = payroll_entries.payroll_period_id
          AND period.status = 'paid'
      )
    )
    OR public.has_permission(NULL, 'hr:payroll_prepare')
  )
);

DROP POLICY payroll_entries_write ON public.payroll_entries;
CREATE POLICY payroll_entries_write ON public.payroll_entries
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(NULL, 'hr:payroll_snapshot')
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(NULL, 'hr:payroll_snapshot')
);

DROP POLICY payroll_periods_select ON public.payroll_periods;
CREATE POLICY payroll_periods_select ON public.payroll_periods
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(NULL, 'hr:payroll_prepare')
);

DROP POLICY payroll_periods_write ON public.payroll_periods;
CREATE POLICY payroll_periods_write ON public.payroll_periods
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(NULL, 'hr:payroll_snapshot')
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(NULL, 'hr:payroll_snapshot')
);

CREATE OR REPLACE FUNCTION public.snapshot_payroll_calculation(
  p_period_year integer,
  p_period_month integer,
  p_standard_days numeric,
  p_entries jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_period_id bigint;
  v_period_status text;
  v_entry_count integer;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL
     OR NOT public.has_permission(NULL, 'hr:payroll_snapshot') THEN
    RAISE EXCEPTION 'missing_payroll_snapshot_permission' USING ERRCODE = '42501';
  END IF;
  IF p_period_year < 2020
     OR p_period_month NOT BETWEEN 1 AND 12
     OR p_standard_days IS NULL
     OR p_standard_days <= 0
     OR p_standard_days > 31
     OR p_entries IS NULL
     OR jsonb_typeof(p_entries) <> 'array'
     OR jsonb_array_length(p_entries) = 0 THEN
    RAISE EXCEPTION 'invalid_payroll_snapshot' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(format('%s:%s:%s', v_tenant_id, p_period_year, p_period_month), 0)
  );

  SELECT period.id, period.status
  INTO v_period_id, v_period_status
  FROM public.payroll_periods period
  WHERE period.tenant_id = v_tenant_id
    AND period.period_year = p_period_year
    AND period.period_month = p_period_month
  FOR UPDATE;

  IF FOUND AND v_period_status IN ('approved', 'paid') THEN
    SELECT count(*)::integer
    INTO v_entry_count
    FROM public.payroll_entries entry
    WHERE entry.tenant_id = v_tenant_id
      AND entry.payroll_period_id = v_period_id;

    RETURN jsonb_build_object(
      'period_id', v_period_id,
      'employee_count', v_entry_count,
      'status', 'already_finalized'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_populate_recordset(NULL::public.payroll_entries, p_entries) entry
    GROUP BY entry.employee_id
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_populate_recordset(NULL::public.payroll_entries, p_entries) entry
    LEFT JOIN public.employees employee
      ON employee.id = entry.employee_id
     AND employee.tenant_id = v_tenant_id
    WHERE employee.id IS NULL
      OR entry.working_days IS NULL OR entry.working_days < 0
      OR entry.paid_leave_days IS NULL OR entry.paid_leave_days < 0
      OR entry.unpaid_leave_days IS NULL OR entry.unpaid_leave_days < 0
      OR entry.payable_days IS NULL OR entry.payable_days < 0
      OR entry.payable_days > p_standard_days
      OR entry.standard_days IS DISTINCT FROM p_standard_days
      OR entry.base_salary IS NULL OR entry.base_salary < 0
      OR entry.gross_total IS NULL OR entry.gross_total < 0
      OR entry.net_salary IS NULL OR entry.net_salary < 0
  ) THEN
    RAISE EXCEPTION 'invalid_payroll_entry' USING ERRCODE = '23514';
  END IF;

  IF v_period_id IS NULL THEN
    INSERT INTO public.payroll_periods (
      tenant_id, period_year, period_month, standard_days,
      status, approved_by, approved_at
    ) VALUES (
      v_tenant_id, p_period_year, p_period_month, p_standard_days,
      'approved', v_user_id, now()
    )
    RETURNING id INTO v_period_id;
  ELSE
    UPDATE public.payroll_periods
    SET standard_days = p_standard_days,
        status = 'approved',
        approved_by = v_user_id,
        approved_at = now(),
        updated_at = now()
    WHERE id = v_period_id
      AND tenant_id = v_tenant_id;
  END IF;

  DELETE FROM public.payroll_entries entry
  WHERE entry.tenant_id = v_tenant_id
    AND entry.payroll_period_id = v_period_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_populate_recordset(NULL::public.payroll_entries, p_entries) source
      WHERE source.employee_id = entry.employee_id
    );

  INSERT INTO public.payroll_entries (
    tenant_id, payroll_period_id, employee_id,
    working_days, paid_leave_days, unpaid_leave_days, payable_days,
    standard_days, overtime_hours, base_salary, allowances,
    tax_exempt_allowances, overtime_pay, bonus, gross_total,
    bhxh_employee, bhyt_employee, bhtn_employee, total_insurance_employee,
    bhxh_employer, bhyt_employer, bhtn_employer, total_insurance_employer,
    personal_deduction, dependent_count, dependent_deduction, charity_deduction,
    taxable_income, pit_tax, advance_deduction, other_deductions, net_salary,
    insurance_base
  )
  SELECT
    v_tenant_id, v_period_id, entry.employee_id,
    entry.working_days, entry.paid_leave_days, entry.unpaid_leave_days, entry.payable_days,
    entry.standard_days, entry.overtime_hours, entry.base_salary, entry.allowances,
    entry.tax_exempt_allowances, entry.overtime_pay, entry.bonus, entry.gross_total,
    entry.bhxh_employee, entry.bhyt_employee, entry.bhtn_employee, entry.total_insurance_employee,
    entry.bhxh_employer, entry.bhyt_employer, entry.bhtn_employer, entry.total_insurance_employer,
    entry.personal_deduction, entry.dependent_count, entry.dependent_deduction, entry.charity_deduction,
    entry.taxable_income, entry.pit_tax, entry.advance_deduction, entry.other_deductions, entry.net_salary,
    entry.insurance_base
  FROM jsonb_populate_recordset(NULL::public.payroll_entries, p_entries) entry
  ON CONFLICT (payroll_period_id, employee_id, tenant_id) DO UPDATE SET
    working_days = EXCLUDED.working_days,
    paid_leave_days = EXCLUDED.paid_leave_days,
    unpaid_leave_days = EXCLUDED.unpaid_leave_days,
    payable_days = EXCLUDED.payable_days,
    standard_days = EXCLUDED.standard_days,
    overtime_hours = EXCLUDED.overtime_hours,
    base_salary = EXCLUDED.base_salary,
    allowances = EXCLUDED.allowances,
    tax_exempt_allowances = EXCLUDED.tax_exempt_allowances,
    overtime_pay = EXCLUDED.overtime_pay,
    bonus = EXCLUDED.bonus,
    gross_total = EXCLUDED.gross_total,
    bhxh_employee = EXCLUDED.bhxh_employee,
    bhyt_employee = EXCLUDED.bhyt_employee,
    bhtn_employee = EXCLUDED.bhtn_employee,
    total_insurance_employee = EXCLUDED.total_insurance_employee,
    bhxh_employer = EXCLUDED.bhxh_employer,
    bhyt_employer = EXCLUDED.bhyt_employer,
    bhtn_employer = EXCLUDED.bhtn_employer,
    total_insurance_employer = EXCLUDED.total_insurance_employer,
    personal_deduction = EXCLUDED.personal_deduction,
    dependent_count = EXCLUDED.dependent_count,
    dependent_deduction = EXCLUDED.dependent_deduction,
    charity_deduction = EXCLUDED.charity_deduction,
    taxable_income = EXCLUDED.taxable_income,
    pit_tax = EXCLUDED.pit_tax,
    advance_deduction = EXCLUDED.advance_deduction,
    other_deductions = EXCLUDED.other_deductions,
    net_salary = EXCLUDED.net_salary,
    insurance_base = EXCLUDED.insurance_base,
    updated_at = now();

  GET DIAGNOSTICS v_entry_count = ROW_COUNT;

  PERFORM public.log_audit(
    'approve',
    'payroll_period',
    v_period_id,
    NULL,
    jsonb_build_object(
      'period_year', p_period_year,
      'period_month', p_period_month,
      'standard_days', p_standard_days,
      'employee_count', v_entry_count,
      'status', 'approved'
    )
  );

  RETURN jsonb_build_object(
    'period_id', v_period_id,
    'employee_count', v_entry_count,
    'status', 'approved'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.force_close_stale_attendance(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_attendance_id bigint,
  p_approved_by uuid,
  p_note text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_record public.attendance_records%ROWTYPE;
  v_requester uuid;
  v_shift_start time;
  v_shift_end time;
  v_shift_end_at timestamp;
  v_now_local timestamp := now() AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_check_out timestamptz;
BEGIN
  IF v_actor IS NULL
     OR v_actor <> p_approved_by
     OR p_tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'not_authenticated_or_mismatch' USING ERRCODE = '28000';
  END IF;

  SELECT attendance.*
  INTO v_record
  FROM public.attendance_records attendance
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = p_tenant_id
    AND attendance.branch_id IS NOT DISTINCT FROM p_branch_id
    AND attendance.check_in IS NOT NULL
    AND attendance.check_out IS NULL
  FOR UPDATE;
  IF v_record.id IS NULL THEN
    RAISE EXCEPTION 'stale_attendance_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_record.branch_id, 'hr:force_close_attendance') THEN
    RAISE EXCEPTION 'force_close_scope_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT employee.profile_id, shift_row.start_time, shift_row.end_time
  INTO v_requester, v_shift_start, v_shift_end
  FROM public.employees employee
  LEFT JOIN public.shifts shift_row
    ON shift_row.id = v_record.shift_id
   AND shift_row.tenant_id = v_record.tenant_id
  WHERE employee.id = v_record.employee_id
    AND employee.tenant_id = v_record.tenant_id;
  IF v_requester IS NULL OR v_actor = v_requester THEN
    RAISE EXCEPTION 'cannot_force_close_own_attendance' USING ERRCODE = '42501';
  END IF;

  IF v_shift_start IS NULL OR v_shift_end IS NULL THEN
    IF v_record.date >= v_now_local::date THEN
      RAISE EXCEPTION 'stale_attendance_request_not_found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_shift_end_at := v_record.date + v_shift_end;
    IF v_shift_end <= v_shift_start THEN
      v_shift_end_at := v_shift_end_at + interval '1 day';
    END IF;
    IF v_now_local < v_shift_end_at THEN
      RAISE EXCEPTION 'stale_attendance_request_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  UPDATE public.attendance_records attendance
  SET check_out = v_record.check_in,
      checkout_approved_at = now(),
      checkout_approved_by = v_actor,
      checkout_approval_note = COALESCE(
        NULLIF(btrim(p_note), ''),
        'Force closed: missed checkout, no workday credit'
      ),
      updated_at = now()
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = p_tenant_id
    AND attendance.branch_id IS NOT DISTINCT FROM p_branch_id
    AND attendance.check_out IS NULL
  RETURNING attendance.check_out INTO v_check_out;

  PERFORM public.log_audit(
    'update',
    'attendance_record',
    p_attendance_id,
    jsonb_build_object('check_out', NULL),
    jsonb_build_object(
      'check_out', v_check_out,
      'reason', NULLIF(btrim(COALESCE(p_note, '')), '')
    )
  );

  RETURN v_check_out;
END;
$$;
