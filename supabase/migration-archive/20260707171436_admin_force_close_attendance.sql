-- Name: admin_force_close_attendance(bigint, bigint, bigint, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--
-- Description: Allows an authorized HR/Manager to force close a stale attendance record (forgot to check out).
-- It sets check_out = check_in to zero out worked hours (không tính công), per business rule.

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
  v_record_branch_id bigint;
  v_check_in timestamptz;
  v_check_out timestamptz;
BEGIN
  IF v_uid IS NULL OR v_uid <> p_approved_by THEN
    RAISE EXCEPTION 'not_authenticated_or_mismatch' USING ERRCODE = '28000';
  END IF;

  -- 1. Check if record exists, is open, and is stale (date < today)
  SELECT
    ar.branch_id,
    ar.check_in
  INTO
    v_record_branch_id,
    v_check_in
  FROM public.attendance_records ar
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND ar.branch_id = p_branch_id
    AND ar.check_in IS NOT NULL
    AND ar.check_out IS NULL
    AND ar.date < CURRENT_DATE
  FOR UPDATE OF ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale_attendance_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Verify permission (re-use hr:approve_checkout)
  IF NOT public.has_permission(v_record_branch_id, 'hr:approve_checkout') THEN
    RAISE EXCEPTION 'forbidden_checkout_approval' USING ERRCODE = '42501';
  END IF;

  -- 3. Update the record
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

-- Grant execution to authenticated roles
REVOKE ALL ON FUNCTION public.admin_force_close_attendance(bigint, bigint, bigint, uuid, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_force_close_attendance(bigint, bigint, bigint, uuid, text) TO service_role;
GRANT ALL ON FUNCTION public.admin_force_close_attendance(bigint, bigint, bigint, uuid, text) TO authenticated;
