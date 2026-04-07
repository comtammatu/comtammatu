-- =============================================================================
-- Dev / staging: tạo Auth users → profile (trigger handle_new_user) + employees
-- Mật khẩu tất cả: Test1234!
--
-- Chạy: Supabase Dashboard → SQL Editor (role postgres).
--
-- Điều kiện: tenant slug `comtammatu`; seed tenant có "Trụ sở chính" (HQ), "Chi nhánh Đất Đỏ",
-- "Chi nhánh Phước Hải" (giống migration 20260401000002_seed_tenant.sql).
--
-- Bước 0: gọi `set_headquarters` cho chi nhánh HQ hiện có (đảm bảo đúng một HQ, hai cửa hàng).
--
-- Idempotent: DELETE user theo email (CASCADE profile + employees) rồi INSERT lại.
--
-- Nếu lỗi cột auth.users / auth.identities: so khớp với schema GoTrue trên project.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- ─── 0) Đồng bộ cờ HQ với migration seed ("Trụ sở chính") ───
DO $$
DECLARE
  v_tenant BIGINT;
  v_hq     BIGINT;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy tenant comtammatu — chạy seed tenant trước.';
  END IF;

  SELECT id INTO v_hq
  FROM public.branches
  WHERE tenant_id = v_tenant
    AND (
      COALESCE(is_headquarters, false) = true
      OR name IN ('Trụ sở chính', 'Trụ sở')
    )
  ORDER BY (name = 'Trụ sở chính') DESC
  LIMIT 1;

  IF v_hq IS NULL THEN
    RAISE EXCEPTION 'Chưa có chi nhánh HQ — chạy SQL trong 20260401000002_seed_tenant.sql trước.';
  END IF;

  PERFORM public.set_headquarters(v_hq);
END;
$$;

DELETE FROM auth.users
WHERE email IN (
  'owner@comtammatu.vn',
  'supermanager@comtammatu.vn',
  'manager.datdo@comtammatu.vn',
  'cashier.datdo@comtammatu.vn',
  'waiter.datdo@comtammatu.vn',
  'chef.datdo@comtammatu.vn',
  'cashier.phuochai@comtammatu.vn',
  'office@comtammatu.vn'
);

DO $$
DECLARE
  v_tenant   BIGINT;
  v_datdo    BIGINT;
  v_phuochai BIGINT;
  v_pw       TEXT := 'Test1234!';
  v_crypt    TEXT;

  r RECORD;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1;
  SELECT id INTO v_datdo FROM public.branches WHERE tenant_id = v_tenant AND name = 'Chi nhánh Đất Đỏ' LIMIT 1;
  SELECT id INTO v_phuochai FROM public.branches WHERE tenant_id = v_tenant AND name = 'Chi nhánh Phước Hải' LIMIT 1;

  IF v_datdo IS NULL OR v_phuochai IS NULL THEN
    RAISE EXCEPTION 'Thiếu Chi nhánh Đất Đỏ hoặc Chi nhánh Phước Hải.';
  END IF;

  FOR r IN
    SELECT *
    FROM (
      SELECT 'a0000001-0000-4000-8000-000000000001'::uuid AS user_id, 'owner@comtammatu.vn'::text AS email, 'owner'::text AS role, NULL::bigint AS branch_id, 'Owner'::text AS full_name, 'EMP-OWNER'::text AS emp_code
      UNION ALL
      SELECT 'a0000002-0000-4000-8000-000000000002'::uuid, 'supermanager@comtammatu.vn'::text, 'super_manager'::text, NULL::bigint, 'Quản lý tổng'::text, 'EMP-SM'::text
      UNION ALL
      SELECT 'a0000003-0000-4000-8000-000000000003'::uuid, 'manager.datdo@comtammatu.vn'::text, 'branch_manager'::text, v_datdo, 'QL Chi nhánh Đất Đỏ'::text, 'EMP-MGR-DD'::text
      UNION ALL
      SELECT 'a0000004-0000-4000-8000-000000000004'::uuid, 'cashier.datdo@comtammatu.vn'::text, 'cashier'::text, v_datdo, 'Thu ngân Đất Đỏ'::text, 'EMP-CASH-DD'::text
      UNION ALL
      SELECT 'a0000005-0000-4000-8000-000000000005'::uuid, 'waiter.datdo@comtammatu.vn'::text, 'waiter'::text, v_datdo, 'Phục vụ Đất Đỏ'::text, 'EMP-WAIT-DD'::text
      UNION ALL
      SELECT 'a0000006-0000-4000-8000-000000000006'::uuid, 'chef.datdo@comtammatu.vn'::text, 'chef'::text, v_datdo, 'Bếp Đất Đỏ'::text, 'EMP-CHEF-DD'::text
      UNION ALL
      SELECT 'a0000007-0000-4000-8000-000000000007'::uuid, 'cashier.phuochai@comtammatu.vn'::text, 'cashier'::text, v_phuochai, 'Thu ngân Phước Hải'::text, 'EMP-CASH-PH'::text
      UNION ALL
      SELECT 'a0000008-0000-4000-8000-000000000008'::uuid, 'office@comtammatu.vn'::text, 'office'::text, NULL::bigint, 'Văn phòng'::text, 'EMP-OFF'::text
    ) q
  LOOP
    v_crypt := crypt(v_pw, gen_salt('bf'));

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      is_sso_user
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      r.user_id,
      'authenticated',
      'authenticated',
      r.email,
      v_crypt,
      now(),
      (
        jsonb_build_object(
          'provider', 'email',
          'providers', jsonb_build_array('email'),
          'tenant_id', v_tenant,
          'role', r.role,
          'full_name', r.full_name
        )
        || CASE
          WHEN r.branch_id IS NULL THEN '{}'::jsonb
          ELSE jsonb_build_object('branch_id', r.branch_id)
        END
      ),
      jsonb_build_object('full_name', r.full_name),
      now(),
      now(),
      '',
      '',
      '',
      '',
      false
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      r.user_id,
      jsonb_build_object('sub', r.user_id::text, 'email', r.email),
      'email',
      r.email,
      now(),
      now(),
      now()
    );

    INSERT INTO public.employees (tenant_id, profile_id, employee_code, is_active)
    VALUES (v_tenant, r.user_id, r.emp_code, true);
  END LOOP;
END;
$$;

COMMIT;
