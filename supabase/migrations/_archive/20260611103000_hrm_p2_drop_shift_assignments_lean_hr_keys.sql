-- =========================================================================
-- HRM "1 trục Ngày công" — Phase 2: bỏ hẳn Phân ca + gom permission keys HR
--
-- 1) Phân ca (shift_assignments) bỏ hẳn theo quyết định owner 2026-06-11:
--    bảng 0 dòng trên prod từ trước tới nay, quán chạy ca mặc định. Drop
--    bảng + 3 RPC bulk + nhánh override trong RPC chấm công (template giờ
--    lấy thẳng từ employees.default_checklist_template_id).
--
-- 2) Gom permission keys HR 9 → 5:
--    - Xóa 4 key chết (UI hợp đồng đã bị gỡ, không RPC/feature nào check):
--      hr:contract_create, hr:contract_sign, hr:terminate (kèm DROP policy
--      contracts_write — không còn đường ghi hợp lệ từ client; payroll vẫn
--      ĐỌC employment_contracts qua policy select hiện hữu),
--      hr:dependent_manage (mồ côi — update_my_dependents_count tự guard
--      self-service, không check key).
--    - Rename hr:approve_shift_request → hr:approve_checkout (key chỉ còn
--      gate duyệt KẾT CA; RPC branch_manager_approve_employee_clock_out
--      không hardcode key nên chỉ cần dời data + app constant).
-- =========================================================================

BEGIN;

-- ─── A1. Chấm công v4: bỏ nhánh override theo phân ca ─────────────────────

DROP FUNCTION IF EXISTS public.employee_clock_in_with_checklist(
  bigint,
  bigint,
  bigint,
  bigint,
  date,
  text
);

CREATE OR REPLACE FUNCTION public.employee_clock_in_with_checklist(
  p_tenant_id bigint,
  p_employee_id bigint,
  p_branch_id bigint,
  p_shift_id bigint,
  p_business_date date,
  p_photo_path text
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_attendance_id bigint;
  v_shift_id bigint;
  v_template_id bigint;
BEGIN
  IF p_photo_path IS NULL OR btrim(p_photo_path) = '' THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = '23514';
  END IF;

  SELECT e.default_checklist_template_id
  INTO v_template_id
  FROM public.employees e
  JOIN public.profiles p
    ON p.id = e.profile_id
   AND p.tenant_id = e.tenant_id
  WHERE e.id = p_employee_id
    AND e.tenant_id = p_tenant_id
    AND e.is_active = true
    AND p.branch_id = p_branch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = p_tenant_id
      AND COALESCE(b.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_shift_id IS NOT NULL AND p_shift_id <> 0 THEN
    SELECT s.id
    INTO v_shift_id
    FROM public.shifts s
    WHERE s.id = p_shift_id
      AND s.tenant_id = p_tenant_id
      AND s.branch_id = p_branch_id
      AND COALESCE(s.is_active, true) = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Phân ca đã bỏ (Phase 2): checklist lấy thẳng từ template mặc định của
  -- nhân viên, còn hiệu lực và đúng phạm vi chi nhánh.
  IF v_template_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.shift_checklist_templates t
      WHERE t.id = v_template_id
        AND t.tenant_id = p_tenant_id
        AND t.is_active = true
        AND (t.branch_id IS NULL OR t.branch_id = p_branch_id)
    ) THEN
    v_template_id := NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.attendance_records ar
    WHERE ar.tenant_id = p_tenant_id
      AND ar.employee_id = p_employee_id
      AND ar.date = p_business_date
  ) THEN
    RAISE EXCEPTION 'duplicate_clock_in' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.attendance_records (
    tenant_id,
    branch_id,
    employee_id,
    shift_id,
    date,
    check_in,
    status,
    method,
    code_verified,
    check_in_photo_path,
    checklist_template_id
  )
  VALUES (
    p_tenant_id,
    p_branch_id,
    p_employee_id,
    v_shift_id,
    p_business_date,
    now(),
    'present',
    'pwa',
    false,
    p_photo_path,
    v_template_id
  )
  RETURNING id INTO v_attendance_id;

  INSERT INTO public.attendance_checklist_items (
    tenant_id,
    attendance_record_id,
    template_item_id,
    title,
    phase,
    done_definition,
    is_required,
    sort_order
  )
  SELECT
    p_tenant_id,
    v_attendance_id,
    i.id,
    i.title,
    i.phase,
    i.done_definition,
    i.is_required,
    row_number() OVER (ORDER BY i.sort_order, i.id)::integer
  FROM public.shift_checklist_template_items i
  WHERE i.tenant_id = p_tenant_id
    AND i.template_id = v_template_id
    AND i.is_active = true
  ORDER BY i.sort_order, i.id;

  RETURN v_attendance_id;
END;
$$;

REVOKE ALL ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
) TO service_role;

COMMENT ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
) IS 'Employee clock-in with checklist snapshot from the employee default template (shift-assignment overrides removed in Phase 2).';

-- ─── A2. Drop 3 RPC bulk scheduling (mọi overload) + bảng phân ca ──────────

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'bulk_upsert_shift_assignments',
        'copy_shift_assignments_week',
        'bulk_delete_future_shift_assignments'
      )
  LOOP
    EXECUTE format('DROP FUNCTION %s', r.sig);
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.shift_assignments;

-- ─── B1. Xóa 4 key HR chết (kèm policy ghi hợp đồng không còn UI) ──────────

DROP POLICY IF EXISTS contracts_write ON public.employment_contracts;

DELETE FROM public.staff_permissions
WHERE permission_key IN (
  'hr:contract_create', 'hr:contract_sign', 'hr:terminate', 'hr:dependent_manage'
);

UPDATE public.role_templates
SET permission_keys = array_remove(array_remove(array_remove(array_remove(
      permission_keys,
      'hr:contract_create'), 'hr:contract_sign'), 'hr:terminate'), 'hr:dependent_manage')
WHERE permission_keys && ARRAY[
  'hr:contract_create', 'hr:contract_sign', 'hr:terminate', 'hr:dependent_manage'
];

DELETE FROM public.permission_keys
WHERE key IN (
  'hr:contract_create', 'hr:contract_sign', 'hr:terminate', 'hr:dependent_manage'
);

-- ─── B2. Rename hr:approve_shift_request → hr:approve_checkout ─────────────
-- FK staff_permissions.permission_key → permission_keys(key) ON DELETE
-- RESTRICT: chèn key mới trước, dời grants, rồi mới xóa key cũ.

INSERT INTO public.permission_keys (key, module, description, scope)
VALUES ('hr:approve_checkout', 'hr', 'Duyệt kết ca nhân viên theo chi nhánh', 'branch')
ON CONFLICT (key) DO NOTHING;

UPDATE public.staff_permissions
SET permission_key = 'hr:approve_checkout'
WHERE permission_key = 'hr:approve_shift_request';

UPDATE public.role_templates
SET permission_keys = array_replace(
      permission_keys, 'hr:approve_shift_request', 'hr:approve_checkout')
WHERE permission_keys @> ARRAY['hr:approve_shift_request'];

DELETE FROM public.permission_keys
WHERE key = 'hr:approve_shift_request';

-- ─── C. Tự kiểm — fail là rollback nguyên transaction ──────────────────────

DO $$
DECLARE
  v_count integer;
BEGIN
  IF to_regclass('public.shift_assignments') IS NOT NULL THEN
    RAISE EXCEPTION 'shift_assignments still exists';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.permission_keys
  WHERE key IN (
    'hr:contract_create', 'hr:contract_sign', 'hr:terminate',
    'hr:dependent_manage', 'hr:approve_shift_request'
  );
  IF v_count > 0 THEN
    RAISE EXCEPTION '% retired HR permission keys still present', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.staff_permissions
  WHERE permission_key IN (
    'hr:contract_create', 'hr:contract_sign', 'hr:terminate',
    'hr:dependent_manage', 'hr:approve_shift_request'
  );
  IF v_count > 0 THEN
    RAISE EXCEPTION '% grants still reference retired HR keys', v_count;
  END IF;

  -- Grants duyệt kết ca phải được dời nguyên vẹn sang key mới (no-op trên
  -- DB rỗng nên chỉ assert không-mất: key mới tồn tại trong catalog).
  IF NOT EXISTS (
    SELECT 1 FROM public.permission_keys WHERE key = 'hr:approve_checkout'
  ) THEN
    RAISE EXCEPTION 'hr:approve_checkout missing from permission_keys';
  END IF;
END $$;

COMMIT;
