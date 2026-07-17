CREATE OR REPLACE FUNCTION public.admin_force_close_attendance(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_attendance_id bigint,
  p_approved_by uuid,
  p_note text DEFAULT NULL::text
) RETURNS timestamp with time zone
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_record_date date;
  v_shift_start time;
  v_shift_end time;
  v_shift_end_at timestamp;
  v_now_local timestamp := now() AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_business_date date := v_now_local::date;
BEGIN
  IF v_uid IS NULL OR v_uid <> p_approved_by THEN
    RAISE EXCEPTION 'not_authenticated_or_mismatch' USING ERRCODE = '28000';
  END IF;

  SELECT ar.check_in, ar.date, s.start_time, s.end_time
  INTO v_check_in, v_record_date, v_shift_start, v_shift_end
  FROM public.attendance_records ar
  LEFT JOIN public.shifts s
    ON s.id = ar.shift_id
   AND s.tenant_id = ar.tenant_id
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND ar.branch_id = p_branch_id
    AND ar.check_in IS NOT NULL
    AND ar.check_out IS NULL
  FOR UPDATE OF ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale_attendance_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_shift_start IS NULL OR v_shift_end IS NULL THEN
    IF v_record_date >= v_business_date THEN
      RAISE EXCEPTION 'stale_attendance_request_not_found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_shift_end_at := v_record_date + v_shift_end;
    IF v_shift_end <= v_shift_start THEN
      v_shift_end_at := v_shift_end_at + INTERVAL '1 day';
    END IF;

    IF v_now_local < v_shift_end_at THEN
      RAISE EXCEPTION 'stale_attendance_request_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF NOT public.has_permission(p_branch_id, 'hr:approve_checkout') THEN
    RAISE EXCEPTION 'forbidden_checkout_approval' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_records
  SET
    check_out = v_check_in,
    check_out_code_verified = false,
    checkout_approved_at = now(),
    checkout_approved_by = p_approved_by,
    checkout_approval_note = COALESCE(NULLIF(btrim(p_note), ''), 'Force closed: Quên kết ca trong ngày (không tính công)'),
    updated_at = now()
  WHERE id = p_attendance_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  RETURNING check_out INTO v_check_out;

  RETURN v_check_out;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_force_close_attendance(bigint, bigint, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_close_attendance(bigint, bigint, bigint, uuid, text) TO service_role, authenticated;
