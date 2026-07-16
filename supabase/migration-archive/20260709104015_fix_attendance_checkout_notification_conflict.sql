WITH duplicate_notifications AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, dedup_key
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.notifications
  WHERE dedup_key IS NOT NULL
)
DELETE FROM public.notifications n
USING duplicate_notifications d
WHERE n.id = d.id
  AND d.rn > 1;

DROP INDEX IF EXISTS public.ux_notifications_dedup;
CREATE UNIQUE INDEX ux_notifications_dedup
  ON public.notifications USING btree (tenant_id, dedup_key)
  WHERE (dedup_key IS NOT NULL);

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
  v_business_date date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF v_uid IS NULL OR v_uid <> p_approved_by THEN
    RAISE EXCEPTION 'not_authenticated_or_mismatch' USING ERRCODE = '28000';
  END IF;

  SELECT ar.check_in
  INTO v_check_in
  FROM public.attendance_records ar
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND ar.branch_id = p_branch_id
    AND ar.check_in IS NOT NULL
    AND ar.check_out IS NULL
    AND ar.date < v_business_date
  FOR UPDATE OF ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale_attendance_request_not_found' USING ERRCODE = 'P0002';
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

REVOKE ALL ON FUNCTION public.employee_request_clock_out(bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_force_close_attendance(bigint, bigint, bigint, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.employee_request_clock_out(bigint, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_force_close_attendance(bigint, bigint, bigint, uuid, text) TO service_role, authenticated;
