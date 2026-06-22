-- =========================================================================
-- HRM "1 trục Ngày công" — sửa quyền nghỉ phép tận gốc + bỏ flow đăng ký ca
--
-- 1) Nghỉ phép "không có quyền" (cả nhân viên lẫn quản lý):
--    20260610110000 chỉ seed hr:request_leave / hr:approve_leave_request vào
--    role_templates. Template là snapshot-only (không tự cập nhật grant cho
--    user hiện hữu) và migration đó không gọi sync — prod có 0 grant cho cả
--    hai key. Backfill additive bằng sync_missing_permissions_from_template()
--    (chỉ INSERT ... ON CONFLICT DO NOTHING, không thu hồi gì).
--
-- 2) submit_leave_request v2: thêm notification cho người duyệt (bucket
--    branch_manager/super_manager/owner; BM gửi thì target cấp trên).
--
-- 3) Quán chạy ca mặc định mỗi ngày — flow đăng ký ca chưa từng được dùng
--    (shift_requests 0 dòng từ trước tới nay, UI duyệt chưa từng render).
--    Drop RPCs + bảng + enum + key hr:register_shift (kèm grants/template).
--    GIỮ hr:approve_shift_request: key này đang gate DUYỆT KẾT CA
--    (employee/checkout-approvals) — chỉ cập nhật description.
-- =========================================================================

BEGIN;

-- ─── 1. Backfill grant nghỉ phép cho user hiện hữu (additive-only) ───────

SELECT public.sync_missing_permissions_from_template();

-- ─── 2. submit_leave_request v2 — thêm notification cho người duyệt ──────

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
  v_tenant_id     BIGINT := public.auth_tenant_id();
  v_user_id       UUID   := auth.uid();
  v_employee_id   BIGINT;
  v_request_id    BIGINT;
  v_today         DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_leave_type    TEXT := COALESCE(NULLIF(trim(p_leave_type), ''), 'annual');
  v_reason        TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_employee_name TEXT;
  v_requester_bucket TEXT := public.auth_role();
  v_target_roles  TEXT[];
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

  SELECT e.id, p.full_name INTO v_employee_id, v_employee_name
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

  -- Người gửi là branch_manager thì chỉ cấp trên duyệt (RPC duyệt đã chặn
  -- tự duyệt; target_roles mang access bucket, không phải position code).
  IF v_requester_bucket = 'branch_manager' THEN
    v_target_roles := ARRAY['super_manager', 'owner'];
  ELSE
    v_target_roles := ARRAY['branch_manager', 'super_manager', 'owner'];
  END IF;

  INSERT INTO public.notifications (
    tenant_id,
    target_branch_id,
    target_roles,
    kind,
    severity,
    title,
    body,
    entity_type,
    entity_id,
    action_url,
    meta,
    dedup_key
  )
  VALUES (
    v_tenant_id,
    p_branch_id,
    v_target_roles,
    'hr.leave_requested',
    'info',
    'Yêu cầu nghỉ phép mới',
    format(
      '%s xin nghỉ %s.',
      COALESCE(v_employee_name, 'Nhân viên'),
      CASE
        WHEN p_start_date = p_end_date
          THEN format('ngày %s', to_char(p_start_date, 'DD/MM'))
        ELSE format(
          'từ %s đến %s',
          to_char(p_start_date, 'DD/MM'),
          to_char(p_end_date, 'DD/MM')
        )
      END
    ),
    'leave_request',
    v_request_id,
    '/hr',
    jsonb_build_object(
      'leave_request_id', v_request_id,
      'employee_id', v_employee_id,
      'branch_id', p_branch_id,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'leave_type', v_leave_type,
      'requester_bucket', v_requester_bucket
    ),
    format('hr.leave_request:%s', v_request_id)
  )
  ON CONFLICT (tenant_id, dedup_key)
    WHERE dedup_key IS NOT NULL
  DO UPDATE SET
    created_at = EXCLUDED.created_at,
    expires_at = NULL,
    meta = EXCLUDED.meta;

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
  'Employee submits a branch-scoped leave request. Resolves employee_id from auth.uid(), enforces hr:request_leave, blocks past/overlapping pending+approved ranges, notifies approver buckets. Does not mutate attendance or payroll.';

REVOKE ALL ON FUNCTION public.submit_leave_request(BIGINT, DATE, DATE, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_leave_request(BIGINT, DATE, DATE, TEXT, TEXT) TO authenticated, service_role;

-- ─── 3. Bỏ flow đăng ký ca (chưa từng được dùng trên prod) ────────────────

DROP FUNCTION IF EXISTS public.submit_shift_request(bigint, bigint, date, text);
DROP FUNCTION IF EXISTS public.cancel_shift_request(bigint);
DROP FUNCTION IF EXISTS public.approve_shift_request(bigint);
DROP FUNCTION IF EXISTS public.reject_shift_request(bigint, text);

DROP TABLE IF EXISTS public.shift_requests;
DROP TYPE IF EXISTS public.shift_request_status;

DELETE FROM public.staff_permissions
WHERE permission_key = 'hr:register_shift';

UPDATE public.role_templates
SET permission_keys = array_remove(permission_keys, 'hr:register_shift')
WHERE permission_keys @> ARRAY['hr:register_shift'];

DELETE FROM public.permission_keys
WHERE key = 'hr:register_shift';

-- Key này được giữ vì đang gate duyệt KẾT CA (employee/checkout-approvals).
UPDATE public.permission_keys
SET description = 'Duyệt kết ca nhân viên theo chi nhánh'
WHERE key = 'hr:approve_shift_request';

COMMIT;
