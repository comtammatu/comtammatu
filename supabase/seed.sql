-- =============================================================================
-- Dev / staging: tạo 2 auth user tối thiểu cho DB project mới.
-- Mật khẩu: MATU1245!
--
-- Apply with: supabase db query --linked --file supabase/seed.sql
--
-- Tài khoản (password: MATU1245!):
--   • owner@comtammatu.com    – owner         (tenant-level, pin Kho Tổng)
--   • manager@comtammatu.com  – super_manager (tenant-level, pin Kho Tổng)
--
-- Điều kiện:
--   - Tenant slug `comtammatu` (migration 20260401000002_seed_tenant.sql)
--   - Branch "Kho Tổng" với branch_kind='central_warehouse'
--     (sau khi migration 20260424000000 rename is_headquarters → branch_kind).
--
-- Idempotent: DELETE user theo email (CASCADE profile + employees) rồi INSERT lại.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- ─── 1) Cleanup: xoá 2 auth user nếu đã tồn tại (CASCADE profiles, employees) ───
DELETE FROM auth.users
WHERE email IN (
  'owner@comtammatu.com',
  'manager@comtammatu.com'
);

-- ─── 2) Seed auth.users + auth.identities + employees ───
DO $$
DECLARE
  v_tenant BIGINT;
  v_hq     BIGINT;
  v_pw     TEXT := 'MATU1245!';
  v_crypt  TEXT;
  r RECORD;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy tenant comtammatu — chạy migrations trước.';
  END IF;

  SELECT id INTO v_hq
  FROM public.branches
  WHERE tenant_id = v_tenant
    AND branch_kind = 'central_warehouse'
    AND is_active = true
  ORDER BY id
  LIMIT 1;

  IF v_hq IS NULL THEN
    RAISE EXCEPTION 'Chưa có Kho Tổng (central_warehouse) — chạy seed_tenant + rename migrations trước.';
  END IF;

  FOR r IN
    SELECT *
    FROM (VALUES
      ('a0000001-0000-4000-8000-000000000001'::uuid, 'owner@comtammatu.com'::text,   'owner'::text,         'Owner'::text,        'EMP-OWNER'::text),
      ('a0000002-0000-4000-8000-000000000002'::uuid, 'manager@comtammatu.com'::text, 'super_manager'::text, 'Quản lý tổng'::text, 'EMP-MGR'::text)
    ) q(user_id, email, role, full_name, emp_code)
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
      jsonb_build_object(
        'provider', 'email',
        'providers', jsonb_build_array('email'),
        'tenant_id', v_tenant,
        'role', r.role,
        'full_name', r.full_name,
        'branch_id', v_hq
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

-- ─── 3) Auth v2: backfill staff_permissions từ position template ──
-- handle_new_user chỉ set position_id; grant permissions phải gọi tay.
DO $$
DECLARE
  v_res RECORD;
BEGIN
  SELECT * INTO v_res FROM public.sync_missing_permissions_from_template();
  RAISE NOTICE 'Auth v2 seed: staff_permissions rows added=%', v_res.rows_added;
END $$;

COMMIT;
