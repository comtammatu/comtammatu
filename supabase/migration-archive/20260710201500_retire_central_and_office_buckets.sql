-- D076: retire the `office`, `warehouse_manager`, and `production_manager`
-- access buckets. The app layer (packages/shared/src/auth) already dropped
-- central-site soft-routing and narrowed ACCESS_BUCKETS to the surviving 5
-- buckets (owner | branch_manager | cashier | chef | branch_staff). This
-- migration catches up the SQL side:
--   1) Hard-deletes staff accounts on the retired buckets — owner decision,
--      NO auto-remap to a surviving bucket.
--   2) Soft-retires the underlying HR position codes and drops their
--      role_templates rows.
--   3) Re-points every SQL twin of the position→role mapper (and every RPC
--      that inlined the retired literals) at the surviving 5-bucket
--      contract.
-- `branch_kind` enum values (central_supply / central_kitchen) are NOT
-- touched — kept on the enum for historical inventory rows per owner
-- decision. Physical branches of those kinds are untouched; only the two
-- role buckets that used to soft-route onto them are retired.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Identify affected profiles by CURRENT position code (unambiguous —
--    does not depend on the mapper function this migration is about to
--    replace).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _retired_bucket_profiles ON COMMIT DROP AS
SELECT p.id AS profile_id, p.tenant_id AS tenant_id
FROM public.profiles p
JOIN public.positions po
  ON po.id = p.position_id
 AND po.tenant_id = p.tenant_id
WHERE po.code IN (
  'office', 'accountant', 'marketing', 'technician', 'design_construction',
  'warehouse_manager', 'central_supply_manager',
  'production_manager', 'central_kitchen_manager', 'head_chef'
);

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Reassign non-cascading FK references (audit/business columns without
--    ON DELETE SET NULL/CASCADE) to the owning tenant's owner before the
--    hard delete, so the delete cannot fail on a foreign key violation.
--    This mirrors the QA-user fixture's own-account cleanup pattern.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT DISTINCT rb.profile_id, t.owner_user_id
    FROM _retired_bucket_profiles rb
    JOIN public.tenants t ON t.id = rb.tenant_id
    WHERE t.owner_user_id IS NOT NULL
      AND t.owner_user_id <> rb.profile_id
  LOOP
    UPDATE public.goods_received_notes SET created_by = v_row.owner_user_id WHERE created_by = v_row.profile_id;
    UPDATE public.goods_received_notes SET received_by = v_row.owner_user_id WHERE received_by = v_row.profile_id;
    UPDATE public.inventory_qc_settings SET updated_by = v_row.owner_user_id WHERE updated_by = v_row.profile_id;
    UPDATE public.kds_tickets SET bumped_by = v_row.owner_user_id WHERE bumped_by = v_row.profile_id;
    UPDATE public.kitchen_send_batches SET created_by = v_row.owner_user_id WHERE created_by = v_row.profile_id;
    UPDATE public.order_items SET priority_marked_by = v_row.owner_user_id WHERE priority_marked_by = v_row.profile_id;
    UPDATE public.order_status_history SET changed_by = v_row.owner_user_id WHERE changed_by = v_row.profile_id;
    UPDATE public.orders SET created_by = v_row.owner_user_id WHERE created_by = v_row.profile_id;
    UPDATE public.orders SET priority_marked_by = v_row.owner_user_id WHERE priority_marked_by = v_row.profile_id;
    UPDATE public.payments SET created_by = v_row.owner_user_id WHERE created_by = v_row.profile_id;
    UPDATE public.pos_sessions SET opened_by = v_row.owner_user_id WHERE opened_by = v_row.profile_id;
    UPDATE public.pos_sessions SET closed_by = v_row.owner_user_id WHERE closed_by = v_row.profile_id;
    UPDATE public.pos_sessions SET variance_approver_user_id = v_row.owner_user_id WHERE variance_approver_user_id = v_row.profile_id;
    UPDATE public.purchase_orders SET created_by = v_row.owner_user_id WHERE created_by = v_row.profile_id;
    UPDATE public.stock_movements SET created_by = v_row.owner_user_id WHERE created_by = v_row.profile_id;
    UPDATE public.stock_transfers SET created_by = v_row.owner_user_id WHERE created_by = v_row.profile_id;
    UPDATE public.supplier_credit_notes SET created_by = v_row.owner_user_id WHERE created_by = v_row.profile_id;
    UPDATE public.supplier_invoices SET created_by = v_row.owner_user_id WHERE created_by = v_row.profile_id;
    UPDATE public.supplier_returns SET confirmed_by = v_row.owner_user_id WHERE confirmed_by = v_row.profile_id;
    UPDATE public.supplier_returns SET created_by = v_row.owner_user_id WHERE created_by = v_row.profile_id;
    UPDATE public.tax_invoices SET created_by = v_row.owner_user_id WHERE created_by = v_row.profile_id;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Delete staff_permissions, then hard-delete the auth.users rows.
--    profiles/employees cascade off auth.users.id (ON DELETE CASCADE).
-- ─────────────────────────────────────────────────────────────────────────
DELETE FROM public.staff_permissions
WHERE user_id IN (SELECT profile_id FROM _retired_bucket_profiles);

DELETE FROM auth.users
WHERE id IN (SELECT profile_id FROM _retired_bucket_profiles);

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Soft-retire the underlying HR position codes (kept for history — never
--    hard-deleted, so historical FKs from e.g. attendance/payroll rows stay
--    resolvable) and drop their role_templates presets.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE public.positions
SET is_active = false
WHERE code IN (
  'office', 'accountant', 'marketing', 'technician', 'design_construction',
  'warehouse_manager', 'central_supply_manager',
  'production_manager', 'central_kitchen_manager', 'head_chef'
);

DELETE FROM public.role_templates
WHERE position_code IN (
  'office', 'accountant', 'marketing', 'technician', 'design_construction',
  'warehouse_manager', 'central_supply_manager',
  'production_manager', 'central_kitchen_manager', 'head_chef'
);

-- ─────────────────────────────────────────────────────────────────────────
-- 5) SQL twin of packages/shared/src/auth/types.ts POSITION_CODE_TO_STAFF_ROLE.
--    Retired codes are intentionally absent — private.staff_role_from_position_code
--    returns NULL for them (callers fail-safe to 'unassigned').
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.staff_role_from_position_code(p_code text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_code
    WHEN 'owner' THEN 'owner'
    WHEN 'branch_manager' THEN 'branch_manager'
    WHEN 'kitchen_counter' THEN 'chef'
    WHEN 'kitchen_helper' THEN 'chef'
    WHEN 'grill_counter' THEN 'chef'
    WHEN 'chef' THEN 'chef'
    WHEN 'cashier' THEN 'cashier'
    WHEN 'cashier_server' THEN 'cashier'
    WHEN 'waiter' THEN 'cashier'
    WHEN 'cleaner' THEN 'branch_staff'
    WHEN 'guard' THEN 'branch_staff'
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION private.staff_role_from_position_code(text) IS
  'SQL twin of POSITION_CODE_TO_STAFF_ROLE (packages/shared/src/auth/types.ts). D076: office/warehouse_manager/production_manager/head_chef/accountant/marketing/technician/design_construction retired — absent by design, resolves to unassigned.';

-- ─────────────────────────────────────────────────────────────────────────
-- 6) Access-bucket → preferred position code, used at Auth user creation
--    when the caller supplies a bare access bucket instead of a position
--    code. Retired buckets removed.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_role_to_position(p_role text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN 'owner'
    WHEN 'branch_manager' THEN 'branch_manager'
    WHEN 'chef' THEN 'chef'
    WHEN 'cashier' THEN 'cashier'
    WHEN 'waiter' THEN 'cashier'
    WHEN 'branch_staff' THEN 'cleaner'
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION public.auth_role_to_position(text) IS
  'Maps compatibility access buckets to the canonical HR position code used at Auth user creation. D076: office/warehouse_manager/production_manager retired.';

REVOKE ALL ON FUNCTION public.auth_role_to_position(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_role_to_position(text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 7) Resolve an access bucket to a tenant HR position id. Retired
--    tie-break entries removed from the ORDER BY; surviving codes unchanged.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.position_id_from_access_bucket(p_access_bucket text, p_tenant bigint)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH resolved AS (
    SELECT public.auth_role_to_position(p_access_bucket) AS preferred_position_code,
      COALESCE(private.staff_role_from_position_code(public.auth_role_to_position(p_access_bucket)), p_access_bucket) AS access_bucket
  )
  SELECT po.id
  FROM public.positions po
  CROSS JOIN resolved r
  WHERE po.tenant_id = p_tenant
    AND COALESCE(po.is_active, true) = true
    AND private.staff_role_from_position_code(po.code) = r.access_bucket
  ORDER BY
    CASE WHEN po.code = r.preferred_position_code THEN -1 ELSE 0 END,
    CASE po.code
      WHEN 'owner' THEN 0
      WHEN 'branch_manager' THEN 0
      WHEN 'chef' THEN 0
      WHEN 'cashier' THEN 0
      WHEN 'kitchen_counter' THEN 1
      WHEN 'kitchen_helper' THEN 1
      WHEN 'grill_counter' THEN 1
      WHEN 'cashier_server' THEN 1
      ELSE 9
    END,
    po.id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.position_id_from_access_bucket(text, bigint) IS
  'Resolves an access bucket to the tenant HR position used when Auth creates a profile. D076: office/warehouse_manager/production_manager/head_chef tie-break entries retired.';

REVOKE ALL ON FUNCTION public.position_id_from_access_bucket(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.position_id_from_access_bucket(text, bigint) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 8) admin_update_profile: drop retired buckets from the bare-bucket
--    allowlist and the central-site branch-nulling special case (no role
--    keeps a null-branch tenant-level claim anymore).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id uuid,
  p_full_name text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_role text DEFAULT NULL::text,
  p_branch_id bigint DEFAULT NULL::bigint,
  p_is_active boolean DEFAULT NULL::boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_tenant bigint;
  v_actor_role_text text;
  v_actor_branch bigint;
  v_target record;
  v_target_role text;
  v_final_role text;
  v_final_branch bigint;
  v_final_position bigint;
  v_final_position_code text;
  v_requested_code text;
  v_required_branch_kind text;
  v_branch_kind text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, private.staff_role_from_position_code(po.code), p.branch_id
  INTO v_actor_tenant, v_actor_role_text, v_actor_branch
  FROM public.profiles p
  JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE p.id = v_actor_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_actor_tenant IS NULL OR v_actor_role_text IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('staff:manage') THEN
    RAISE EXCEPTION 'forbidden: missing staff:manage' USING ERRCODE = '42501';
  END IF;

  IF (p_role IS NOT NULL OR p_branch_id IS NOT NULL)
     AND NOT public.has_permission_any('staff:assign_position') THEN
    RAISE EXCEPTION 'forbidden: missing staff:assign_position' USING ERRCODE = '42501';
  END IF;

  SELECT p.id, p.branch_id, p.full_name, p.phone, p.tenant_id, p.position_id,
         po.code AS position_code,
         private.staff_role_from_position_code(po.code) AS role_text
  INTO v_target
  FROM public.profiles p
  JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE p.id = p_target_id
    AND p.tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_profile_not_found_in_tenant' USING ERRCODE = 'P0002';
  END IF;

  v_target_role := v_target.role_text;
  v_requested_code := NULLIF(p_role, '');

  IF v_requested_code IS NULL THEN
    v_final_position := v_target.position_id;
    v_final_position_code := v_target.position_code;
    v_final_role := v_target_role;
  ELSE
    SELECT po.id, po.code, private.staff_role_from_position_code(po.code)
    INTO v_final_position, v_final_position_code, v_final_role
    FROM public.positions po
    WHERE po.tenant_id = v_actor_tenant
      AND po.code = v_requested_code
      AND COALESCE(po.is_active, true) = true
    LIMIT 1;

    IF v_final_position IS NULL THEN
      v_final_role := CASE
        WHEN v_requested_code = 'waiter' THEN 'cashier'
        ELSE v_requested_code
      END;
      IF v_final_role NOT IN (
        'owner',
        'branch_manager',
        'cashier',
        'chef',
        'branch_staff'
      ) THEN
        RAISE EXCEPTION 'invalid_access_bucket: %', v_requested_code USING ERRCODE = '22023';
      END IF;
      v_final_position := public.position_id_from_access_bucket(v_final_role, v_actor_tenant);
      SELECT po.code INTO v_final_position_code
      FROM public.positions po
      WHERE po.id = v_final_position
        AND po.tenant_id = v_actor_tenant;
    END IF;
  END IF;

  IF v_final_position IS NULL OR v_final_role IS NULL OR v_final_position_code IS NULL THEN
    RAISE EXCEPTION 'admin_update_profile: position_not_resolved for position=% tenant=%',
      v_requested_code,
      v_actor_tenant
      USING ERRCODE = 'P0001';
  END IF;

  IF v_final_role = 'owner' THEN
    RAISE EXCEPTION 'cannot_modify_owner' USING ERRCODE = '42501';
  END IF;

  v_required_branch_kind := CASE v_final_position_code
    WHEN 'branch_manager' THEN 'branch'
    WHEN 'cashier' THEN 'branch'
    WHEN 'cashier_server' THEN 'branch'
    WHEN 'chef' THEN 'branch'
    WHEN 'kitchen_counter' THEN 'branch'
    WHEN 'kitchen_helper' THEN 'branch'
    WHEN 'grill_counter' THEN 'branch'
    WHEN 'cleaner' THEN 'branch'
    WHEN 'waiter' THEN 'branch'
    WHEN 'guard' THEN 'branch'
    ELSE NULL
  END;

  IF v_required_branch_kind IS NULL AND v_requested_code IS NOT NULL THEN
    v_final_branch := NULL;
  ELSE
    v_final_branch := COALESCE(p_branch_id, v_target.branch_id);
  END IF;

  IF v_required_branch_kind IS NOT NULL AND v_final_branch IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_position' USING ERRCODE = 'P0001';
  END IF;

  IF v_final_branch IS NOT NULL THEN
    SELECT branch_kind INTO v_branch_kind
    FROM public.branches
    WHERE id = v_final_branch
      AND tenant_id = v_actor_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch_not_found_in_tenant' USING ERRCODE = 'P0002';
    END IF;
    IF v_required_branch_kind IS NOT NULL AND v_branch_kind <> v_required_branch_kind THEN
      RAISE EXCEPTION 'position_site_kind_mismatch' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_actor_role_text = 'owner' THEN
    NULL;
  ELSIF v_actor_role_text = 'branch_manager' THEN
    IF v_target.branch_id IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager_target_not_in_branch' USING ERRCODE = '42501';
    END IF;
    IF v_target_role = 'branch_manager' THEN
      RAISE EXCEPTION 'branch_manager_cannot_modify_peer' USING ERRCODE = '42501';
    END IF;
    IF v_final_role NOT IN ('cashier', 'chef')
       AND v_final_position_code NOT IN ('guard', 'cleaner', 'waiter') THEN
      RAISE EXCEPTION 'branch_manager_can_only_assign_branch_staff' USING ERRCODE = '42501';
    END IF;
    IF v_final_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager_cannot_reassign_branch' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'insufficient_privileges_for_profile_management' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET full_name = COALESCE(p_full_name, full_name),
      phone = COALESCE(p_phone, phone),
      position_id = v_final_position,
      branch_id = v_final_branch,
      is_active = COALESCE(p_is_active, is_active),
      updated_at = now()
  WHERE id = p_target_id
    AND tenant_id = v_actor_tenant;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'user_role', v_final_role,
      'role', v_final_role,
      'access_bucket', v_final_role,
      'position', v_final_position_code,
      'position_code', v_final_position_code,
      'branch_id', v_final_branch
    )
  WHERE id = p_target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_profile(uuid, text, text, text, bigint, boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text, bigint, boolean)
TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 9) Checkout-request / count-slip / leave notification RPCs: retire the
--    'office' fallback role label (dead-end even before this migration —
--    no account ever carried it as a live claim) in favor of 'unassigned',
--    matching staffRoleFromPositionCode's own fail-safe. Branching logic is
--    unchanged: an unresolved requester/employee role still falls through
--    to the owner/branch_manager target arrays it always did.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.employee_request_clock_out(
  p_tenant_id bigint,
  p_employee_id bigint,
  p_attendance_id bigint
) RETURNS timestamp with time zone
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_record public.attendance_records%ROWTYPE;
  v_requested_at timestamptz;
  v_employee_name text;
  v_requester_role text;
  v_target_roles text[];
  v_business_date date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  SELECT ar.*
  INTO v_record
  FROM public.attendance_records ar
  JOIN public.employees e
    ON e.id = ar.employee_id
   AND e.tenant_id = ar.tenant_id
  JOIN public.profiles p
    ON p.id = e.profile_id
   AND p.tenant_id = e.tenant_id
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND ar.employee_id = p_employee_id
    AND ar.branch_id = p.branch_id
    AND ar.date = v_business_date
    AND ar.check_out IS NULL
    AND COALESCE(e.is_active, true) = true
    AND COALESCE(p.is_active, true) = true
  FOR UPDATE OF ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open_attendance_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_record.checkout_requested_at IS NOT NULL THEN
    RETURN v_record.checkout_requested_at;
  END IF;

  v_requested_at := now();

  SELECT
    p.full_name,
    COALESCE(private.staff_role_from_position_code(po.code), 'unassigned')
  INTO v_employee_name, v_requester_role
  FROM public.employees e
  LEFT JOIN public.profiles p
    ON p.id = e.profile_id
   AND p.tenant_id = e.tenant_id
  LEFT JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE e.id = p_employee_id
    AND e.tenant_id = p_tenant_id;

  v_requester_role := COALESCE(v_requester_role, 'unassigned');
  v_target_roles := CASE
    WHEN v_requester_role = 'branch_manager' THEN ARRAY['owner']::text[]
    WHEN v_requester_role IN ('cashier', 'chef', 'branch_staff') THEN ARRAY['branch_manager']::text[]
    ELSE ARRAY['owner']::text[]
  END;

  UPDATE public.attendance_records
  SET
    checkout_requested_at = v_requested_at,
    checkout_requested_by_role = v_requester_role,
    checkout_approval_target_roles = v_target_roles,
    check_out_code_verified = false,
    updated_at = now()
  WHERE id = p_attendance_id
    AND tenant_id = p_tenant_id
    AND employee_id = p_employee_id
    AND branch_id = v_record.branch_id
    AND date = v_business_date
    AND check_out IS NULL;

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
    p_tenant_id,
    v_record.branch_id,
    v_target_roles,
    'attendance.checkout_requested',
    'info',
    'Yêu cầu duyệt kết ca',
    format(
      '%s đã gửi yêu cầu kết ca lúc %s.',
      COALESCE(v_employee_name, 'Nhân viên'),
      to_char(v_requested_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM')
    ),
    'attendance_record',
    p_attendance_id,
    format('/br/%s/shift/checkout-approvals', v_record.branch_id),
    jsonb_build_object(
      'attendance_id', p_attendance_id,
      'employee_id', p_employee_id,
      'requester_role', v_requester_role,
      'approval_target_roles', to_jsonb(v_target_roles),
      'branch_id', v_record.branch_id,
      'business_date', v_record.date,
      'requested_at', v_requested_at
    ),
    format('attendance.checkout_request:%s', p_attendance_id)
  )
  ON CONFLICT (tenant_id, dedup_key)
    WHERE dedup_key IS NOT NULL
  DO UPDATE SET
    created_at = EXCLUDED.created_at,
    expires_at = NULL,
    meta = EXCLUDED.meta;

  RETURN v_requested_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.branch_manager_approve_employee_clock_out(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_attendance_id bigint,
  p_approved_by uuid,
  p_note text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_record_branch_id bigint;
  v_requester_profile_id uuid;
  v_requester_role text;
  v_approver_branch_id bigint;
  v_approver_role text;
  v_requested_at timestamptz;
  v_check_out timestamptz;
BEGIN
  SELECT
    ar.branch_id,
    e.profile_id,
    COALESCE(ar.checkout_requested_by_role, private.staff_role_from_position_code(po.code), 'unassigned'),
    ar.checkout_requested_at
  INTO
    v_record_branch_id,
    v_requester_profile_id,
    v_requester_role,
    v_requested_at
  FROM public.attendance_records ar
  JOIN public.employees e
    ON e.id = ar.employee_id
   AND e.tenant_id = ar.tenant_id
  LEFT JOIN public.profiles p
    ON p.id = e.profile_id
   AND p.tenant_id = e.tenant_id
  LEFT JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND ar.branch_id = p_branch_id
    AND ar.check_out IS NULL
    AND ar.checkout_requested_at IS NOT NULL
  FOR UPDATE OF ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_requester_profile_id = p_approved_by THEN
    RAISE EXCEPTION 'cannot_approve_own_checkout' USING ERRCODE = '42501';
  END IF;

  SELECT
    p.branch_id,
    private.staff_role_from_position_code(po.code)
  INTO v_approver_branch_id, v_approver_role
  FROM public.profiles p
  JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE p.id = p_approved_by
    AND p.tenant_id = p_tenant_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_approver_role IS NULL THEN
    RAISE EXCEPTION 'checkout_approver_not_found' USING ERRCODE = '42501';
  END IF;

  v_requester_role := COALESCE(v_requester_role, 'unassigned');

  IF v_requester_role = 'branch_manager' THEN
    IF v_approver_role NOT IN ('owner') THEN
      RAISE EXCEPTION 'checkout_requires_upper_manager' USING ERRCODE = '42501';
    END IF;
  ELSIF v_approver_role = 'branch_manager' THEN
    IF v_approver_branch_id IS DISTINCT FROM p_branch_id THEN
      RAISE EXCEPTION 'checkout_approver_wrong_branch' USING ERRCODE = '42501';
    END IF;

    IF v_requester_role NOT IN ('cashier', 'chef', 'branch_staff') THEN
      RAISE EXCEPTION 'branch_manager_can_only_approve_branch_staff' USING ERRCODE = '42501';
    END IF;
  ELSIF v_approver_role NOT IN ('owner') THEN
    RAISE EXCEPTION 'checkout_approver_not_allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_records
  SET
    check_out = v_requested_at,
    check_out_code_verified = false,
    checkout_approved_at = now(),
    checkout_approved_by = p_approved_by,
    checkout_approval_note = NULLIF(btrim(p_note), ''),
    updated_at = now()
  WHERE id = p_attendance_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND check_out IS NULL
  RETURNING check_out INTO v_check_out;

  RETURN v_check_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.branch_manager_reject_employee_clock_out(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_attendance_id bigint,
  p_rejected_by uuid,
  p_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_requester_profile_id uuid;
  v_requester_role text;
  v_approver_branch_id bigint;
  v_approver_role text;
BEGIN
  SELECT
    e.profile_id,
    COALESCE(ar.checkout_requested_by_role, private.staff_role_from_position_code(po.code), 'unassigned')
  INTO
    v_requester_profile_id,
    v_requester_role
  FROM public.attendance_records ar
  JOIN public.employees e
    ON e.id = ar.employee_id
   AND e.tenant_id = ar.tenant_id
  LEFT JOIN public.profiles p
    ON p.id = e.profile_id
   AND p.tenant_id = e.tenant_id
  LEFT JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND ar.branch_id = p_branch_id
    AND ar.check_out IS NULL
    AND ar.checkout_requested_at IS NOT NULL
  FOR UPDATE OF ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_requester_profile_id = p_rejected_by THEN
    RAISE EXCEPTION 'cannot_approve_own_checkout' USING ERRCODE = '42501';
  END IF;

  SELECT
    p.branch_id,
    private.staff_role_from_position_code(po.code)
  INTO v_approver_branch_id, v_approver_role
  FROM public.profiles p
  JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE p.id = p_rejected_by
    AND p.tenant_id = p_tenant_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_approver_role IS NULL THEN
    RAISE EXCEPTION 'checkout_approver_not_found' USING ERRCODE = '42501';
  END IF;

  v_requester_role := COALESCE(v_requester_role, 'unassigned');

  IF v_requester_role = 'branch_manager' THEN
    IF v_approver_role NOT IN ('owner') THEN
      RAISE EXCEPTION 'checkout_requires_upper_manager' USING ERRCODE = '42501';
    END IF;
  ELSIF v_approver_role = 'branch_manager' THEN
    IF v_approver_branch_id IS DISTINCT FROM p_branch_id THEN
      RAISE EXCEPTION 'checkout_approver_wrong_branch' USING ERRCODE = '42501';
    END IF;

    IF v_requester_role NOT IN ('cashier', 'chef', 'branch_staff') THEN
      RAISE EXCEPTION 'branch_manager_can_only_approve_branch_staff' USING ERRCODE = '42501';
    END IF;
  ELSIF v_approver_role NOT IN ('owner') THEN
    RAISE EXCEPTION 'checkout_approver_not_allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_records
  SET
    checkout_requested_at = NULL,
    checkout_requested_by_role = NULL,
    checkout_approval_target_roles = ARRAY[]::text[],
    checkout_approval_note = NULLIF(btrim(p_note), ''),
    updated_at = now()
  WHERE id = p_attendance_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND check_out IS NULL
    AND checkout_requested_at IS NOT NULL;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_inventory_count_slip(p_slip_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant          BIGINT := public.auth_tenant_id();
  v_uid             UUID   := auth.uid();
  v_slip            public.inventory_count_slips%ROWTYPE;
  v_line            RECORD;
  v_fresh           NUMERIC(15,3);
  v_counted_base    NUMERIC(15,3);
  v_delta           NUMERIC(15,3);
  v_adjusted        INT := 0;
  v_employee_bucket TEXT;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_slip
  FROM public.inventory_count_slips
  WHERE id = p_slip_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF v_slip.id IS NULL THEN
    RAISE EXCEPTION 'slip_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_slip.branch_id, 'inventory:count_approve') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_slip.status = 'approved' THEN
    RETURN jsonb_build_object('success', true, 'slip_id', p_slip_id, 'already_approved', true);
  END IF;

  IF v_slip.status <> 'submitted' THEN
    RAISE EXCEPTION 'slip_not_submitted' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_slip.employee_id AND e.profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'cannot_review_own_slip' USING ERRCODE = '42501';
  END IF;

  FOR v_line IN
    SELECT * FROM public.inventory_count_slip_lines
    WHERE slip_id = p_slip_id AND tenant_id = v_tenant
  LOOP
    SELECT COALESCE(stl.current_quantity, 0) INTO v_fresh
    FROM public.stock_levels stl
    WHERE stl.tenant_id = v_tenant AND stl.branch_id = v_slip.branch_id
      AND stl.location_id = v_slip.location_id AND stl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND THEN
      v_fresh := 0;
    END IF;

    v_counted_base := public.inv_to_base(v_line.ingredient_id, v_line.entry_unit_id, v_line.counted_quantity);
    v_delta := v_counted_base - v_fresh;

    IF v_delta <> 0 THEN
      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by, location_id, entry_unit_id, entry_quantity
      ) VALUES (
        v_tenant, v_slip.branch_id, v_line.ingredient_id, 'count_adjustment', v_delta,
        'Count slip #' || p_slip_id::text, v_uid, v_slip.location_id,
        v_line.entry_unit_id, v_line.counted_quantity
      );
      v_adjusted := v_adjusted + 1;
    END IF;
  END LOOP;

  UPDATE public.inventory_count_slips
  SET status = 'approved', reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
  WHERE id = p_slip_id;

  PERFORM public.log_audit(
    'approve'::TEXT,
    'inventory_count_slip'::TEXT,
    p_slip_id,
    jsonb_build_object('status', 'submitted'),
    jsonb_build_object('status', 'approved', 'adjusted_lines', v_adjusted)
  );

  SELECT COALESCE(private.staff_role_from_position_code(po.code), 'unassigned')
    INTO v_employee_bucket
    FROM public.employees e
    JOIN public.profiles p ON p.id = e.profile_id AND p.tenant_id = e.tenant_id
    LEFT JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
   WHERE e.id = v_slip.employee_id AND e.tenant_id = v_tenant;

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, meta, dedup_key
  )
  VALUES (
    v_tenant,
    v_slip.branch_id,
    ARRAY[COALESCE(v_employee_bucket, 'unassigned')]::text[],
    'inventory.count_slip_approved',
    'info',
    'Phiếu đếm tồn đã được duyệt',
    'Phiếu đếm tồn của bạn đã được duyệt và điều chỉnh kho.',
    'inventory_count_slip',
    p_slip_id,
    format('/br/%s/stock/count', v_slip.branch_id),
    jsonb_build_object(
      'slip_id', p_slip_id, 'employee_id', v_slip.employee_id,
      'branch_id', v_slip.branch_id, 'result', 'approved', 'adjusted_lines', v_adjusted
    ),
    format('inventory.count_slip:%s:approved', p_slip_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;

  RETURN jsonb_build_object('success', true, 'slip_id', p_slip_id, 'adjusted_lines', v_adjusted);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_leave_request(p_request_id bigint, p_reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_user_id   UUID   := auth.uid();
  v_request   public.leave_requests%ROWTYPE;
  v_reason    TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_employee_bucket TEXT;
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

  SELECT COALESCE(private.staff_role_from_position_code(po.code), 'unassigned')
    INTO v_employee_bucket
    FROM public.employees e
    JOIN public.profiles p ON p.id = e.profile_id AND p.tenant_id = e.tenant_id
    LEFT JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
   WHERE e.id = v_request.employee_id
     AND e.tenant_id = v_tenant_id;

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
    v_request.branch_id,
    ARRAY[COALESCE(v_employee_bucket, 'unassigned')]::text[],
    'hr.leave_rejected',
    'info',
    'Đơn nghỉ phép bị từ chối',
    format(
      'Đơn nghỉ %s đã bị từ chối%s',
      CASE
        WHEN v_request.start_date = v_request.end_date
          THEN format('ngày %s', to_char(v_request.start_date, 'DD/MM'))
        ELSE format('từ %s đến %s', to_char(v_request.start_date, 'DD/MM'), to_char(v_request.end_date, 'DD/MM'))
      END,
      CASE WHEN v_reason IS NOT NULL THEN format(' (Lý do: %s)', v_reason) ELSE '' END
    ),
    'leave_request',
    p_request_id,
    format('/br/%s/shift/schedule/leave', v_request.branch_id),
    jsonb_build_object(
      'leave_request_id', p_request_id,
      'employee_id', v_request.employee_id,
      'branch_id', v_request.branch_id,
      'start_date', v_request.start_date,
      'end_date', v_request.end_date,
      'leave_type', v_request.leave_type,
      'result', 'rejected',
      'reason', v_reason
    ),
    format('hr.leave_rejected:%s', p_request_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_inventory_count_recount(p_slip_id bigint, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant          BIGINT := public.auth_tenant_id();
  v_uid             UUID   := auth.uid();
  v_slip            public.inventory_count_slips%ROWTYPE;
  v_note            TEXT := NULLIF(trim(COALESCE(p_note, '')), '');
  v_employee_bucket TEXT;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_note IS NOT NULL AND char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'note_too_long' USING ERRCODE = 'string_data_right_truncation';
  END IF;

  SELECT * INTO v_slip
  FROM public.inventory_count_slips
  WHERE id = p_slip_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF v_slip.id IS NULL THEN
    RAISE EXCEPTION 'slip_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_slip.branch_id, 'inventory:count_approve') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_slip.status <> 'submitted' THEN
    RAISE EXCEPTION 'slip_not_submitted' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_slip.employee_id AND e.profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'cannot_review_own_slip' USING ERRCODE = '42501';
  END IF;

  UPDATE public.inventory_count_slips
  SET status = 'needs_changes', review_note = v_note, reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
  WHERE id = p_slip_id;

  PERFORM public.log_audit(
    'request_recount'::TEXT,
    'inventory_count_slip'::TEXT,
    p_slip_id,
    jsonb_build_object('status', 'submitted'),
    jsonb_build_object('status', 'needs_changes')
  );

  SELECT COALESCE(private.staff_role_from_position_code(po.code), 'unassigned')
    INTO v_employee_bucket
    FROM public.employees e
    JOIN public.profiles p ON p.id = e.profile_id AND p.tenant_id = e.tenant_id
    LEFT JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
   WHERE e.id = v_slip.employee_id AND e.tenant_id = v_tenant;

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, meta, dedup_key
  )
  VALUES (
    v_tenant,
    v_slip.branch_id,
    ARRAY[COALESCE(v_employee_bucket, 'unassigned')]::text[],
    'inventory.count_slip_recount',
    'warning',
    'Phiếu đếm tồn cần đếm lại',
    COALESCE(format('Quản lý yêu cầu đếm lại: %s', v_note), 'Quản lý yêu cầu đếm lại phiếu đếm tồn của bạn.'),
    'inventory_count_slip',
    p_slip_id,
    format('/br/%s/stock/count', v_slip.branch_id),
    jsonb_build_object(
      'slip_id', p_slip_id, 'employee_id', v_slip.employee_id,
      'branch_id', v_slip.branch_id, 'result', 'needs_changes'
    ),
    format('inventory.count_slip:%s:recount', p_slip_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;
END;
$$;

REVOKE ALL ON FUNCTION public.employee_request_clock_out(bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.branch_manager_approve_employee_clock_out(bigint, bigint, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.branch_manager_reject_employee_clock_out(bigint, bigint, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_inventory_count_slip(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_leave_request(bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_inventory_count_recount(bigint, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.employee_request_clock_out(bigint, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.branch_manager_approve_employee_clock_out(bigint, bigint, bigint, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.branch_manager_reject_employee_clock_out(bigint, bigint, bigint, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_inventory_count_slip(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_leave_request(bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_inventory_count_recount(bigint, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 10) stock_transfer_receive: branch-scoped own-branch guard drops the
--     retired central-site roles. branch_manager is the only pinned-branch
--     role left; owner stays tenant-wide via the has_permission() check
--     below (unchanged).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stock_transfer_receive(p_transfer_id bigint, p_items jsonb DEFAULT NULL::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_tenant       BIGINT := public.auth_tenant_id();
  v_role         TEXT := public.auth_role();
  v_branch_claim BIGINT := public.auth_branch_id();
  v_tr           RECORD;
  v_line         RECORD;
  v_recv         NUMERIC(15,3);
  v_recv_base    NUMERIC(15,3);
  v_note         TEXT;
  v_cost         NUMERIC(15,2);
  v_old_q        NUMERIC(15,3);
  v_old_wac      NUMERIC(15,2);
  v_new_q        NUMERIC(15,3);
  v_new_wac      NUMERIC(15,2);
  v_key          TEXT;
  v_to_loc       RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_tr
  FROM public.stock_transfers
  WHERE id = p_transfer_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tr.from_branch_id = v_tr.to_branch_id THEN
    RAISE EXCEPTION 'intra_branch_transfer_already_atomic' USING ERRCODE = '22023';
  END IF;

  IF v_role IN ('branch_manager')
     AND (v_branch_claim IS NULL OR v_branch_claim <> v_tr.to_branch_id) THEN
    RAISE EXCEPTION 'forbidden_transfer_receive' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_tr.to_branch_id, 'inventory:transfer_receive') THEN
    RAISE EXCEPTION 'forbidden_transfer_receive' USING ERRCODE = '42501';
  END IF;

  IF v_tr.status <> 'confirmed_receive' THEN
    RAISE EXCEPTION 'transfer_not_in_confirmed_receive' USING ERRCODE = '22023';
  END IF;

  IF v_tr.to_location_id IS NULL THEN
    RAISE EXCEPTION 'transfer_to_location_missing' USING ERRCODE = '23502';
  END IF;

  SELECT id, branch_id
  INTO v_to_loc
  FROM public.inventory_locations
  WHERE id = v_tr.to_location_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF NOT FOUND OR v_to_loc.branch_id <> v_tr.to_branch_id THEN
    RAISE EXCEPTION 'transfer_to_location_invalid' USING ERRCODE = '23514';
  END IF;

  FOR v_line IN
    SELECT * FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id
      AND tenant_id = v_tenant
  LOOP
    v_recv := v_line.quantity;
    v_note := NULL;

    IF p_items IS NOT NULL THEN
      v_key := v_line.ingredient_id::TEXT;
      IF (p_items ? v_key) THEN
        IF jsonb_typeof(p_items -> v_key) = 'object' THEN
          v_recv := ((p_items -> v_key) ->> 'qty')::NUMERIC;
          v_note := (p_items -> v_key) ->> 'note';
        ELSE
          v_recv := (p_items ->> v_key)::NUMERIC;
        END IF;
      END IF;
    END IF;

    IF v_recv < 0 OR v_recv > v_line.quantity THEN
      RAISE EXCEPTION 'invalid_receive_qty:%', v_line.ingredient_id USING ERRCODE = '22023';
    END IF;

    IF v_recv <= 0 THEN
      UPDATE public.stock_transfer_items
      SET quantity_received = 0,
          receive_note = v_note
      WHERE id = v_line.id;
      CONTINUE;
    END IF;

    v_recv_base := public.inv_to_base(v_line.ingredient_id, v_line.entry_unit_id, v_recv)::NUMERIC(15,3);
    v_cost := COALESCE(v_line.unit_cost_at_ship, 0);

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.to_branch_id
      AND sl.location_id = v_tr.to_location_id
      AND sl.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, transfer_id, unit_cost, location_id,
      entry_unit_id, entry_quantity
    ) VALUES (
      v_tenant, v_tr.to_branch_id, v_line.ingredient_id, 'transfer_in', v_recv_base,
      'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_cost,
      v_tr.to_location_id,
      v_line.entry_unit_id, v_recv
    );

    v_new_q := COALESCE(v_old_q, 0) + v_recv_base;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_recv_base * v_cost
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac,
        updated_at = now()
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.to_branch_id
      AND sl.location_id = v_tr.to_location_id
      AND sl.ingredient_id = v_line.ingredient_id;

    UPDATE public.stock_transfer_items
    SET quantity_received = v_recv,
        receive_note = v_note
    WHERE id = v_line.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'received',
      received_at = now(),
      updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'received'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_receive(bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_transfer_receive(bigint, jsonb) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 11) submit_inventory_count_slip: drop the retired warehouse_manager
--     bucket from the "count slip submitted" notification target array.
--     branch_manager + owner remain — never office.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_inventory_count_slip(
  p_branch_id bigint,
  p_location_id bigint,
  p_lines jsonb,
  p_shift_id bigint DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tenant        BIGINT := public.auth_tenant_id();
  v_uid           UUID   := auth.uid();
  v_employee_id   BIGINT;
  v_employee_name TEXT;
  v_today         DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_shift_id      BIGINT := p_shift_id;
  v_slip_id       BIGINT;
  v_status        TEXT;
  v_line          jsonb;
  v_ingredient_id BIGINT;
  v_counted       NUMERIC(15,3);
  v_assigned_count INT;
  v_line_count    INT;
  v_location_id   BIGINT := p_location_id;
  v_branch_kind   TEXT;
  v_location_kind TEXT;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'empty_count' USING ERRCODE = '22023';
  END IF;

  SELECT b.branch_kind, l.location_kind
  INTO v_branch_kind, v_location_kind
  FROM public.inventory_locations l
  JOIN public.branches b
    ON b.id = l.branch_id
   AND b.tenant_id = l.tenant_id
  WHERE l.id = p_location_id
    AND l.branch_id = p_branch_id
    AND l.tenant_id = v_tenant
    AND l.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_branch_kind = 'branch' AND v_location_kind <> 'kitchen' THEN
    SELECT l.id INTO v_location_id
    FROM public.inventory_locations l
    WHERE l.branch_id = p_branch_id
      AND l.tenant_id = v_tenant
      AND l.location_kind = 'kitchen'
      AND l.is_active
    ORDER BY l.is_default_consumption DESC, l.sort_order NULLS LAST, l.id
    LIMIT 1;

    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'branch_kitchen_location_missing' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF v_shift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.id = v_shift_id
      AND s.tenant_id = v_tenant
      AND s.is_active
      AND (s.branch_id IS NULL OR s.branch_id = p_branch_id)
  ) THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT e.id, pr.full_name INTO v_employee_id, v_employee_name
  FROM public.employees e
  JOIN public.profiles pr ON pr.id = e.profile_id
  WHERE e.profile_id = v_uid AND e.tenant_id = v_tenant AND e.is_active
    AND pr.tenant_id = v_tenant AND pr.branch_id = p_branch_id
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'no_active_employee_in_branch' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(v_employee_id);

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_ingredient_id := (v_line->>'ingredient_id')::BIGINT;
    v_counted := (v_line->>'counted_quantity')::NUMERIC;
    IF v_ingredient_id IS NULL OR v_counted IS NULL THEN
      RAISE EXCEPTION 'invalid_line' USING ERRCODE = '22023';
    END IF;
    IF v_counted < 0 THEN
      RAISE EXCEPTION 'negative_count' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.inventory_count_assignments a
      WHERE a.tenant_id = v_tenant AND a.branch_id = p_branch_id
        AND a.location_id = v_location_id AND a.employee_id = v_employee_id
        AND a.ingredient_id = v_ingredient_id AND a.is_active
        AND (
          (v_shift_id IS NULL AND a.shift_id IS NULL)
          OR (
            v_shift_id IS NOT NULL
            AND (
              a.shift_id = v_shift_id
              OR (
                a.shift_id IS NULL
                AND NOT EXISTS (
                  SELECT 1 FROM public.inventory_count_assignments specific
                  WHERE specific.tenant_id = v_tenant
                    AND specific.branch_id = p_branch_id
                    AND specific.location_id = v_location_id
                    AND specific.ingredient_id = v_ingredient_id
                    AND specific.shift_id = v_shift_id
                    AND specific.is_active
                )
              )
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'not_assigned' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  SELECT count(DISTINCT a.ingredient_id) INTO v_assigned_count
  FROM public.inventory_count_assignments a
  WHERE a.tenant_id = v_tenant AND a.branch_id = p_branch_id
    AND a.location_id = v_location_id AND a.employee_id = v_employee_id
    AND a.is_active
    AND (
      (v_shift_id IS NULL AND a.shift_id IS NULL)
      OR (
        v_shift_id IS NOT NULL
        AND (
          a.shift_id = v_shift_id
          OR (
            a.shift_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM public.inventory_count_assignments specific
              WHERE specific.tenant_id = v_tenant
                AND specific.branch_id = p_branch_id
                AND specific.location_id = v_location_id
                AND specific.ingredient_id = a.ingredient_id
                AND specific.shift_id = v_shift_id
                AND specific.is_active
            )
          )
        )
      )
    );

  SELECT count(DISTINCT (l->>'ingredient_id')::BIGINT) INTO v_line_count
  FROM jsonb_array_elements(p_lines) l;

  IF v_line_count <> v_assigned_count THEN
    RAISE EXCEPTION 'incomplete_count' USING ERRCODE = '22023';
  END IF;

  SELECT id, status INTO v_slip_id, v_status
  FROM public.inventory_count_slips
  WHERE tenant_id = v_tenant AND branch_id = p_branch_id AND location_id = v_location_id
    AND employee_id = v_employee_id AND count_date = v_today
    AND shift_id IS NOT DISTINCT FROM v_shift_id
  FOR UPDATE;

  IF v_slip_id IS NOT NULL AND v_status = 'approved' THEN
    RAISE EXCEPTION 'slip_already_approved' USING ERRCODE = '22023';
  END IF;

  IF v_slip_id IS NULL THEN
    INSERT INTO public.inventory_count_slips
      (tenant_id, branch_id, location_id, employee_id, count_date, shift_id, status, submitted_by, submitted_at)
    VALUES
      (v_tenant, p_branch_id, v_location_id, v_employee_id, v_today, v_shift_id, 'submitted', v_uid, now())
    RETURNING id INTO v_slip_id;
  ELSE
    UPDATE public.inventory_count_slips
    SET status = 'submitted', submitted_by = v_uid, submitted_at = now(),
        reviewed_by = NULL, reviewed_at = NULL, review_note = NULL, updated_at = now()
    WHERE id = v_slip_id;
    DELETE FROM public.inventory_count_slip_lines WHERE slip_id = v_slip_id;
  END IF;

  INSERT INTO public.inventory_count_slip_lines
    (tenant_id, slip_id, ingredient_id, system_quantity, counted_quantity, entry_unit_id, note)
  SELECT
    v_tenant,
    v_slip_id,
    (l->>'ingredient_id')::BIGINT,
    COALESCE((
      SELECT stl.current_quantity FROM public.stock_levels stl
      WHERE stl.tenant_id = v_tenant AND stl.branch_id = p_branch_id
        AND stl.location_id = v_location_id AND stl.ingredient_id = (l->>'ingredient_id')::BIGINT
    ), 0),
    (l->>'counted_quantity')::NUMERIC,
    NULLIF(l->>'entry_unit_id','')::BIGINT,
    NULLIF(trim(l->>'note'), '')
  FROM jsonb_array_elements(p_lines) l;

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, meta, dedup_key
  )
  VALUES (
    v_tenant,
    p_branch_id,
    ARRAY['branch_manager', 'owner']::text[],
    'inventory.count_slip_submitted',
    'info',
    'Phiếu đếm tồn mới',
    format('%s đã gửi phiếu đếm tồn (%s mục) chờ duyệt.', COALESCE(v_employee_name, 'Nhân viên'), v_line_count),
    'inventory_count_slip',
    v_slip_id,
    '/inventory/count-slips',
    jsonb_build_object(
      'slip_id', v_slip_id,
      'employee_id', v_employee_id,
      'branch_id', p_branch_id,
      'location_id', v_location_id,
      'shift_id', v_shift_id,
      'line_count', v_line_count
    ),
    format('inventory.count_slip:%s:submitted', v_slip_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;

  PERFORM public.log_audit(
    'submit'::TEXT,
    'inventory_count_slip'::TEXT,
    v_slip_id,
    NULL,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'location_id', v_location_id,
      'shift_id', v_shift_id,
      'line_count', v_line_count
    )
  );

  RETURN v_slip_id;
END;
$$;

COMMENT ON FUNCTION public.submit_inventory_count_slip(bigint, bigint, jsonb, bigint) IS
  'Employee submits assigned count lines. Branch sites normalize count slips to the branch kitchen location. D076: notification target array drops the retired warehouse_manager bucket.';

REVOKE ALL ON FUNCTION public.submit_inventory_count_slip(bigint, bigint, jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_inventory_count_slip(bigint, bigint, jsonb, bigint) TO authenticated, service_role;

COMMIT;
