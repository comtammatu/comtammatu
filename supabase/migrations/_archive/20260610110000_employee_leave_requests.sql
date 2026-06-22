-- =========================================================================
-- Employee Portal + HRM leave requests
--
-- Adds a branch-scoped leave request workflow:
--   - Employee submits/cancels own pending leave request from /employee/leave.
--   - HR/branch manager reviews from /hr using branch-scoped permission.
--
-- This slice intentionally does NOT calculate leave balance, payroll deduction,
-- or attendance rows. It records the approved operational state only.
-- =========================================================================

-- ─── 1. Permission keys + role-template backfill ────────────────────────

INSERT INTO public.permission_keys (key, module, description, scope) VALUES
  ('hr:request_leave',          'hr', 'Gửi yêu cầu nghỉ phép',             'branch'),
  ('hr:approve_leave_request',  'hr', 'Duyệt yêu cầu nghỉ phép theo chi nhánh', 'branch')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    UPDATE public.role_templates
    SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY['hr:request_leave']) ORDER BY 1
    )
    WHERE tenant_id = t.id
      AND position_code IN (
        'waiter', 'cashier', 'chef', 'phu_bep',
        'thu_kho', 'kho_truong', 'bep_truong',
        'quan_ly_CN', 'quan_ly_vung',
        'ke_toan', 'ke_toan_truong', 'office', 'tro_ly_giam_doc',
        'super_manager', 'owner',
        'branch_manager', 'warehouse_head', 'warehouse_keeper',
        'head_chef', 'kitchen_helper', 'accountant', 'chief_accountant',
        'executive_assistant', 'warehouse_manager', 'production_manager'
      );

    UPDATE public.role_templates
    SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY['hr:approve_leave_request']) ORDER BY 1
    )
    WHERE tenant_id = t.id
      AND position_code IN (
        'quan_ly_CN', 'quan_ly_vung', 'office', 'ke_toan_truong',
        'tro_ly_giam_doc', 'super_manager', 'owner',
        'branch_manager', 'chief_accountant', 'executive_assistant'
      );
  END LOOP;
END $$;

-- ─── 2. Table ───────────────────────────────────────────────────────────

CREATE TABLE public.leave_requests (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  employee_id     BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  leave_type      TEXT NOT NULL DEFAULT 'annual',
  status          TEXT NOT NULL DEFAULT 'pending',
  reason          TEXT,

  reviewed_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  rejected_reason TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT leave_requests_date_range_check CHECK (start_date <= end_date),
  CONSTRAINT leave_requests_type_check CHECK (
    leave_type = ANY (ARRAY['annual', 'sick', 'unpaid', 'personal', 'other'])
  ),
  CONSTRAINT leave_requests_status_check CHECK (
    status = ANY (ARRAY['pending', 'approved', 'rejected', 'cancelled'])
  ),
  CONSTRAINT leave_requests_reason_length_check CHECK (
    reason IS NULL OR char_length(reason) <= 500
  ),
  CONSTRAINT leave_requests_rejected_reason_length_check CHECK (
    rejected_reason IS NULL OR char_length(rejected_reason) <= 500
  )
);

CREATE UNIQUE INDEX idx_leave_requests_pending_unique
  ON public.leave_requests(tenant_id, employee_id, start_date, end_date)
  WHERE status = 'pending';

CREATE INDEX idx_leave_requests_branch_status_start
  ON public.leave_requests(tenant_id, branch_id, status, start_date);

CREATE INDEX idx_leave_requests_employee_status
  ON public.leave_requests(tenant_id, employee_id, status);

CREATE INDEX idx_leave_requests_employee_range
  ON public.leave_requests(tenant_id, employee_id, start_date, end_date);

CREATE TRIGGER trg_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- ─── 3. RLS + Data API grants ───────────────────────────────────────────

CREATE POLICY leave_requests_select ON public.leave_requests
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = leave_requests.employee_id
          AND e.profile_id = auth.uid()
      )
      OR public.has_permission(branch_id, 'hr:approve_leave_request')
      OR public.has_permission_any('hr:view_employee')
    )
  );

CREATE POLICY leave_requests_self_insert ON public.leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND status = 'pending'
    AND start_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    AND start_date <= end_date
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND public.has_permission(branch_id, 'hr:request_leave')
    AND EXISTS (
      SELECT 1
      FROM public.employees e
      JOIN public.profiles p ON p.id = e.profile_id
      WHERE e.id = leave_requests.employee_id
        AND e.profile_id = auth.uid()
        AND e.tenant_id = public.auth_tenant_id()
        AND e.is_active = true
        AND p.tenant_id = public.auth_tenant_id()
        AND p.branch_id = leave_requests.branch_id
    )
  );

CREATE POLICY leave_requests_manager_update ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'hr:approve_leave_request')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'hr:approve_leave_request')
  );

GRANT SELECT ON TABLE public.leave_requests TO authenticated;
GRANT ALL ON TABLE public.leave_requests TO service_role;
GRANT ALL ON SEQUENCE public.leave_requests_id_seq TO service_role;

-- ─── 4. RPC: submit_leave_request ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_leave_request(
  p_branch_id  BIGINT,
  p_start_date DATE,
  p_end_date   DATE,
  p_leave_type TEXT DEFAULT 'annual',
  p_reason     TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id   BIGINT := public.auth_tenant_id();
  v_user_id     UUID   := auth.uid();
  v_employee_id BIGINT;
  v_request_id  BIGINT;
  v_today       DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_leave_type  TEXT := COALESCE(NULLIF(trim(p_leave_type), ''), 'annual');
  v_reason      TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'submit_leave_request: missing auth context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'hr:request_leave') THEN
    RAISE EXCEPTION 'submit_leave_request: missing permission hr:request_leave'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'submit_leave_request: invalid date range'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_start_date < v_today THEN
    RAISE EXCEPTION 'submit_leave_request: cannot request past date'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_leave_type NOT IN ('annual', 'sick', 'unpaid', 'personal', 'other') THEN
    RAISE EXCEPTION 'submit_leave_request: invalid leave type'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'submit_leave_request: reason too long'
      USING ERRCODE = 'string_data_right_truncation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = v_tenant_id
      AND b.is_active = true
  ) THEN
    RAISE EXCEPTION 'submit_leave_request: branch not found or inactive'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT e.id INTO v_employee_id
  FROM public.employees e
  JOIN public.profiles p ON p.id = e.profile_id
  WHERE e.profile_id = v_user_id
    AND e.tenant_id = v_tenant_id
    AND e.is_active = true
    AND p.tenant_id = v_tenant_id
    AND p.branch_id = p_branch_id
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'submit_leave_request: no active employee in this branch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_advisory_xact_lock(v_employee_id);

  IF EXISTS (
    SELECT 1
    FROM public.leave_requests lr
    WHERE lr.tenant_id = v_tenant_id
      AND lr.employee_id = v_employee_id
      AND lr.status IN ('pending', 'approved')
      AND daterange(lr.start_date, lr.end_date, '[]')
          && daterange(p_start_date, p_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'submit_leave_request: date range overlaps existing request'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.leave_requests
    (tenant_id, branch_id, employee_id, start_date, end_date, leave_type, status, reason)
  VALUES
    (v_tenant_id, p_branch_id, v_employee_id, p_start_date, p_end_date, v_leave_type, 'pending', v_reason)
  RETURNING id INTO v_request_id;

  PERFORM public.log_audit(
    'submit'::TEXT,
    'leave_request'::TEXT,
    v_request_id,
    NULL,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'employee_id', v_employee_id,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'leave_type', v_leave_type
    )
  );

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION public.submit_leave_request(BIGINT, DATE, DATE, TEXT, TEXT) IS
  'Employee submits a branch-scoped leave request. Resolves employee_id from auth.uid(), enforces hr:request_leave, blocks past/overlapping pending+approved ranges.';

REVOKE ALL ON FUNCTION public.submit_leave_request(BIGINT, DATE, DATE, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_leave_request(BIGINT, DATE, DATE, TEXT, TEXT) TO authenticated, service_role;

-- ─── 5. RPC: cancel_leave_request ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cancel_leave_request(
  p_request_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_user_id   UUID   := auth.uid();
  v_request   public.leave_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'cancel_leave_request: missing auth context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_request
  FROM public.leave_requests
  WHERE id = p_request_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'cancel_leave_request: request not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_request.employee_id
      AND e.profile_id = v_user_id
      AND e.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'cancel_leave_request: not the request owner'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'cancel_leave_request: request is %, not pending', v_request.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.leave_requests
  SET status = 'cancelled',
      reviewed_by = v_user_id,
      reviewed_at = now()
  WHERE id = p_request_id;

  PERFORM public.log_audit(
    'cancel'::TEXT,
    'leave_request'::TEXT,
    p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'cancelled')
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_leave_request(BIGINT) IS
  'Employee cancels own pending leave request. Caller must own the underlying employee row.';

REVOKE ALL ON FUNCTION public.cancel_leave_request(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_leave_request(BIGINT) TO authenticated, service_role;

-- ─── 6. RPC: approve_leave_request ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_leave_request(
  p_request_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_user_id   UUID   := auth.uid();
  v_request   public.leave_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'approve_leave_request: missing auth context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_request
  FROM public.leave_requests
  WHERE id = p_request_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'approve_leave_request: request not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_permission(v_request.branch_id, 'hr:approve_leave_request') THEN
    RAISE EXCEPTION 'approve_leave_request: missing permission for this branch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'approve_leave_request: request is %, not pending', v_request.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_request.employee_id
      AND e.profile_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'approve_leave_request: cannot review own request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.leave_requests
  SET status = 'approved',
      reviewed_by = v_user_id,
      reviewed_at = now()
  WHERE id = p_request_id;

  PERFORM public.log_audit(
    'approve'::TEXT,
    'leave_request'::TEXT,
    p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'approved')
  );
END;
$$;

COMMENT ON FUNCTION public.approve_leave_request(BIGINT) IS
  'Manager approves a pending leave_request within branch scope. Does not mutate attendance or payroll.';

REVOKE ALL ON FUNCTION public.approve_leave_request(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_leave_request(BIGINT) TO authenticated, service_role;

-- ─── 7. RPC: reject_leave_request ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_leave_request(
  p_request_id BIGINT,
  p_reason     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_user_id   UUID   := auth.uid();
  v_request   public.leave_requests%ROWTYPE;
  v_reason    TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'reject_leave_request: missing auth context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'reject_leave_request: reason too long'
      USING ERRCODE = 'string_data_right_truncation';
  END IF;

  SELECT * INTO v_request
  FROM public.leave_requests
  WHERE id = p_request_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'reject_leave_request: request not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_permission(v_request.branch_id, 'hr:approve_leave_request') THEN
    RAISE EXCEPTION 'reject_leave_request: missing permission for this branch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'reject_leave_request: request is %, not pending', v_request.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_request.employee_id
      AND e.profile_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'reject_leave_request: cannot review own request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.leave_requests
  SET status = 'rejected',
      reviewed_by = v_user_id,
      reviewed_at = now(),
      rejected_reason = v_reason
  WHERE id = p_request_id;

  PERFORM public.log_audit(
    'reject'::TEXT,
    'leave_request'::TEXT,
    p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'rejected', 'reason', v_reason)
  );
END;
$$;

COMMENT ON FUNCTION public.reject_leave_request(BIGINT, TEXT) IS
  'Manager rejects a pending leave_request within branch scope and records an optional reason.';

REVOKE ALL ON FUNCTION public.reject_leave_request(BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_leave_request(BIGINT, TEXT) TO authenticated, service_role;
