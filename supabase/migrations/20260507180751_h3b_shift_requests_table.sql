-- =========================================================================
-- HR Phase 3b — `shift_requests` table + RLS + RPCs
--
-- Mode A: employee submits availability/preference for a future date+shift.
-- Manager (branch_manager+) reviews and either approves (atomic insert into
-- `shift_assignments`) or rejects. Employee can cancel own pending request.
--
-- Tables modified: NONE (new table only).
-- Tables created : shift_requests
-- Functions created:
--   submit_shift_request(branch_id, shift_id, date, note)
--   approve_shift_request(request_id)
--   reject_shift_request(request_id, reason)
--   cancel_shift_request(request_id)
--
-- ACL keys (already seeded in 20260507180459_h3a_shift_request_perms):
--   hr:register_shift          — employee submit/cancel own
--   hr:approve_shift_request   — manager approve/reject within branch scope
-- =========================================================================

-- ─── 1. Status enum ─────────────────────────────────────────────────────

CREATE TYPE public.shift_request_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

-- ─── 2. Table ───────────────────────────────────────────────────────────

CREATE TABLE public.shift_requests (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  employee_id     BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_id        BIGINT NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  date            DATE NOT NULL,

  status          public.shift_request_status NOT NULL DEFAULT 'pending',
  note            TEXT,

  -- Approval/rejection metadata
  reviewed_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  rejected_reason TEXT,

  -- Back-reference to the assignment created on approval (nullable)
  assignment_id   BIGINT REFERENCES public.shift_assignments(id) ON DELETE SET NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only ONE pending request per (employee, shift, date) — but allow multiple
-- historical rows in non-pending states (rejected, cancelled, approved).
CREATE UNIQUE INDEX idx_shift_requests_pending_unique
  ON public.shift_requests(employee_id, shift_id, date, tenant_id)
  WHERE status = 'pending';

CREATE INDEX idx_shift_requests_branch_date ON public.shift_requests(branch_id, date);
CREATE INDEX idx_shift_requests_employee   ON public.shift_requests(employee_id, status);
CREATE INDEX idx_shift_requests_tenant     ON public.shift_requests(tenant_id);

CREATE TRIGGER trg_shift_requests_updated_at
  BEFORE UPDATE ON public.shift_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.shift_requests ENABLE ROW LEVEL SECURITY;

-- ─── 3. RLS policies ────────────────────────────────────────────────────

-- 3.1 SELECT: employee sees own + manager sees branch (with approve perm) +
--             senior roles (hr:view_employee) see tenant-wide
CREATE POLICY shift_requests_select ON public.shift_requests
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = shift_requests.employee_id
          AND e.profile_id = auth.uid()
      )
      OR public.has_permission(branch_id, 'hr:approve_shift_request')
      OR public.has_permission_any('hr:view_employee')
    )
  );

-- 3.2 INSERT: employee inserts own pending row.
--   - status MUST be pending (default)
--   - employee_id must be the caller's own employee row
--   - date must be today or future
--   - caller must hold hr:register_shift
CREATE POLICY shift_requests_self_insert ON public.shift_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND status = 'pending'
    AND date >= CURRENT_DATE
    AND assignment_id IS NULL
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND public.has_permission_any('hr:register_shift')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shift_requests.employee_id
        AND e.profile_id = auth.uid()
        AND e.tenant_id = public.auth_tenant_id()
        AND e.is_active = true
    )
  );

-- 3.3 UPDATE: manager-only with branch-scoped approve perm.
--   (Self-cancel is implemented via cancel_shift_request RPC, not direct UPDATE,
--    so we do not need a self-update policy here.)
CREATE POLICY shift_requests_manager_update ON public.shift_requests
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'hr:approve_shift_request')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'hr:approve_shift_request')
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.shift_requests TO authenticated;

-- ─── 4. RPC: submit_shift_request ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_shift_request(
  p_branch_id BIGINT,
  p_shift_id  BIGINT,
  p_date      DATE,
  p_note      TEXT DEFAULT NULL
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
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'submit_shift_request: missing auth context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_permission_any('hr:register_shift') THEN
    RAISE EXCEPTION 'submit_shift_request: missing permission hr:register_shift'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'submit_shift_request: cannot register a past date'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Resolve caller's employee row (must be active in this tenant)
  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE profile_id = v_user_id
    AND tenant_id = v_tenant_id
    AND is_active = true
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'submit_shift_request: no active employee record'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Validate shift belongs to branch + tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.id = p_shift_id
      AND s.branch_id = p_branch_id
      AND s.tenant_id = v_tenant_id
      AND s.is_active = true
  ) THEN
    RAISE EXCEPTION 'submit_shift_request: shift not found or inactive'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Reject if employee already has an approved shift_assignment overlapping
  -- this exact (date, shift) — they're already rostered.
  IF EXISTS (
    SELECT 1 FROM public.shift_assignments sa
    WHERE sa.employee_id = v_employee_id
      AND sa.shift_id = p_shift_id
      AND sa.date = p_date
      AND sa.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'submit_shift_request: already assigned to this shift'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.shift_requests
    (tenant_id, branch_id, employee_id, shift_id, date, status, note)
  VALUES
    (v_tenant_id, p_branch_id, v_employee_id, p_shift_id, p_date, 'pending', p_note)
  RETURNING id INTO v_request_id;

  PERFORM public.log_audit(
    'submit'::TEXT,
    'shift_request'::TEXT,
    v_request_id,
    NULL,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'shift_id', p_shift_id,
      'date', p_date,
      'employee_id', v_employee_id
    )
  );

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION public.submit_shift_request(BIGINT, BIGINT, DATE, TEXT) IS
  'Employee submits a shift availability request. Resolves employee_id from auth.uid(); enforces hr:register_shift; rejects past dates or already-assigned slots.';

GRANT EXECUTE ON FUNCTION public.submit_shift_request(BIGINT, BIGINT, DATE, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_shift_request(BIGINT, BIGINT, DATE, TEXT) FROM anon, public;

-- ─── 5. RPC: approve_shift_request (atomic) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_shift_request(
  p_request_id BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id    BIGINT := public.auth_tenant_id();
  v_user_id      UUID   := auth.uid();
  v_request      public.shift_requests%ROWTYPE;
  v_assignment_id BIGINT;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'approve_shift_request: missing auth context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Lock the request row
  SELECT * INTO v_request
  FROM public.shift_requests
  WHERE id = p_request_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'approve_shift_request: request not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_permission(v_request.branch_id, 'hr:approve_shift_request') THEN
    RAISE EXCEPTION 'approve_shift_request: missing permission for this branch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'approve_shift_request: request is %, not pending', v_request.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Approver cannot self-approve own request (sock-puppet protection)
  IF EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_request.employee_id
      AND e.profile_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'approve_shift_request: cannot approve own request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotent insert into shift_assignments. ON CONFLICT (employee_id, date,
  -- tenant_id) DO NOTHING to handle race where manager directly assigned via
  -- another path before approval.
  INSERT INTO public.shift_assignments
    (tenant_id, branch_id, employee_id, shift_id, date)
  VALUES
    (v_request.tenant_id, v_request.branch_id, v_request.employee_id,
     v_request.shift_id, v_request.date)
  ON CONFLICT (employee_id, date, tenant_id) DO NOTHING
  RETURNING id INTO v_assignment_id;

  -- If conflict swallowed the insert, fetch existing assignment id
  IF v_assignment_id IS NULL THEN
    SELECT id INTO v_assignment_id
    FROM public.shift_assignments
    WHERE employee_id = v_request.employee_id
      AND date = v_request.date
      AND tenant_id = v_request.tenant_id;
  END IF;

  UPDATE public.shift_requests
  SET status = 'approved',
      reviewed_by = v_user_id,
      reviewed_at = now(),
      assignment_id = v_assignment_id
  WHERE id = p_request_id;

  PERFORM public.log_audit(
    'approve'::TEXT,
    'shift_request'::TEXT,
    p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'approved', 'assignment_id', v_assignment_id)
  );

  RETURN v_assignment_id;
END;
$$;

COMMENT ON FUNCTION public.approve_shift_request(BIGINT) IS
  'Atomic: insert shift_assignments row + flip request to approved. Manager only via hr:approve_shift_request on the request''s branch. Cannot self-approve.';

GRANT EXECUTE ON FUNCTION public.approve_shift_request(BIGINT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_shift_request(BIGINT) FROM anon, public;

-- ─── 6. RPC: reject_shift_request ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_shift_request(
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
  v_request   public.shift_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'reject_shift_request: missing auth context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_request
  FROM public.shift_requests
  WHERE id = p_request_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'reject_shift_request: request not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_permission(v_request.branch_id, 'hr:approve_shift_request') THEN
    RAISE EXCEPTION 'reject_shift_request: missing permission for this branch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'reject_shift_request: request is %, not pending', v_request.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.shift_requests
  SET status = 'rejected',
      reviewed_by = v_user_id,
      reviewed_at = now(),
      rejected_reason = p_reason
  WHERE id = p_request_id;

  PERFORM public.log_audit(
    'reject'::TEXT,
    'shift_request'::TEXT,
    p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'rejected', 'reason', p_reason)
  );
END;
$$;

COMMENT ON FUNCTION public.reject_shift_request(BIGINT, TEXT) IS
  'Manager rejects a pending shift_request. Records reason and flips status.';

GRANT EXECUTE ON FUNCTION public.reject_shift_request(BIGINT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_shift_request(BIGINT, TEXT) FROM anon, public;

-- ─── 7. RPC: cancel_shift_request (employee self) ───────────────────────

CREATE OR REPLACE FUNCTION public.cancel_shift_request(
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
  v_request   public.shift_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'cancel_shift_request: missing auth context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_request
  FROM public.shift_requests
  WHERE id = p_request_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'cancel_shift_request: request not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Caller must own the request's employee row
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_request.employee_id
      AND e.profile_id = v_user_id
      AND e.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'cancel_shift_request: not the request owner'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'cancel_shift_request: request is %, not pending', v_request.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.shift_requests
  SET status = 'cancelled',
      reviewed_by = v_user_id,
      reviewed_at = now()
  WHERE id = p_request_id;

  PERFORM public.log_audit(
    'cancel'::TEXT,
    'shift_request'::TEXT,
    p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'cancelled')
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_shift_request(BIGINT) IS
  'Employee cancels own pending shift request. Caller must own the underlying employee row.';

GRANT EXECUTE ON FUNCTION public.cancel_shift_request(BIGINT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_shift_request(BIGINT) FROM anon, public;
