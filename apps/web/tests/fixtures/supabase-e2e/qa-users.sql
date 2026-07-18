-- =============================================================================
-- CI-only E2E fixture: tạo Auth users → profile (trigger handle_new_user) + employees
-- Mật khẩu tất cả: Test1234!
--
-- Copied only into the isolated CI scratch project by scripts/supabase-e2e-bringup.mjs.
--
-- Điều kiện:
--   - Tenant slug `comtammatu`; seed tenant có "Chi nhánh Đất Đỏ",
--     "Chi nhánh Phước Hải" (migration 20260401000002_seed_tenant.sql).
--
-- Step 0: normalize seeded operating branch records without touching central sites.
--
-- Tài khoản QA được seed (password: Test1234!):
--   • owner@comtammatu.vn              – owner (tenant-level, pinned to a dev branch)
--   • keeper@comtammatu.vn       – owner (keeper, không bị xoá)
--   • manager.datdo@comtammatu.vn      – branch_manager Đất Đỏ
--   • cashier.datdo@comtammatu.vn      – cashier Đất Đỏ
--   • cashier.service.datdo@comtammatu.vn – cashier service Đất Đỏ
--   • chef.datdo@comtammatu.vn         – chef Đất Đỏ
--   • manager.phuochai@comtammatu.vn   – branch_manager Phước Hải
--   • cashier.phuochai@comtammatu.vn   – cashier Phước Hải
--   • cashier.service.phuochai@comtammatu.vn – cashier service Phước Hải
--   • chef.phuochai@comtammatu.vn      – chef Phước Hải
--
-- Idempotent: DELETE user theo email (CASCADE profile + employees) rồi INSERT lại.
--
-- Nếu lỗi cột auth.users / auth.identities: so khớp với schema GoTrue trên project.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- ─── 0) Đồng bộ branch_kind cho các chi nhánh vận hành trong seed ───
DO $$
DECLARE
  v_tenant BIGINT;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy tenant comtammatu — chạy seed tenant trước.';
  END IF;

  UPDATE public.branches
  SET branch_kind = 'branch',
      updated_at = now()
  WHERE tenant_id = v_tenant
    AND name IN ('Chi nhánh Đất Đỏ', 'Chi nhánh Phước Hải')
    AND branch_kind IS DISTINCT FROM 'branch';

  INSERT INTO public.branches (tenant_id, name, branch_kind, is_active)
  VALUES
    (v_tenant, 'Kho Tổng', 'central_supply', true),
    (v_tenant, 'Bếp Trung Tâm', 'central_kitchen', true)
  ON CONFLICT (name, tenant_id) DO UPDATE
  SET branch_kind = EXCLUDED.branch_kind,
      is_active = true,
      updated_at = now();
END;
$$;

-- ─── 0.5) Idempotent cleanup: reassign FKs to a keeper profile ───
-- Some audit tables reference profiles(id) with NOT NULL FK. Reassign those rows
-- to the keeper so we can recreate other users safely.
DO $$
DECLARE
  v_tenant BIGINT;
  v_keeper UUID := 'a0000002-0000-4000-8000-000000000002'::uuid; -- keeper
  v_to_delete UUID[] := ARRAY[
    'a0000001-0000-4000-8000-000000000001'::uuid, -- owner
    'a0000003-0000-4000-8000-000000000003'::uuid, -- manager.datdo
    'a0000004-0000-4000-8000-000000000004'::uuid, -- cashier.datdo
    'a0000005-0000-4000-8000-000000000005'::uuid, -- cashier.service.datdo
    'a0000006-0000-4000-8000-000000000006'::uuid, -- chef.datdo
    'a0000007-0000-4000-8000-000000000007'::uuid, -- cashier.phuochai
    'a000000c-0000-4000-8000-00000000000c'::uuid, -- manager.phuochai
    'a000000d-0000-4000-8000-00000000000d'::uuid, -- cashier.service.phuochai
    'a000000e-0000-4000-8000-00000000000e'::uuid  -- chef.phuochai
  ];
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1;

  -- orders + status history
  UPDATE public.orders
    SET created_by = v_keeper
    WHERE tenant_id = v_tenant AND created_by = ANY(v_to_delete);

  UPDATE public.order_status_history
    SET changed_by = v_keeper
    WHERE tenant_id = v_tenant AND changed_by = ANY(v_to_delete);

  -- POS sessions
  UPDATE public.pos_sessions
    SET opened_by = v_keeper
    WHERE tenant_id = v_tenant AND opened_by = ANY(v_to_delete);

  UPDATE public.pos_sessions
    SET closed_by = v_keeper
    WHERE tenant_id = v_tenant AND closed_by = ANY(v_to_delete);

  -- stock / procurement / finance references
  UPDATE public.stock_movements
    SET created_by = v_keeper
    WHERE tenant_id = v_tenant AND created_by = ANY(v_to_delete);

  UPDATE public.purchase_orders
    SET created_by = v_keeper
    WHERE tenant_id = v_tenant AND created_by = ANY(v_to_delete);

  UPDATE public.goods_received_notes
    SET created_by = v_keeper
    WHERE tenant_id = v_tenant AND created_by = ANY(v_to_delete);

  UPDATE public.goods_received_notes
    SET received_by = v_keeper
    WHERE tenant_id = v_tenant AND received_by = ANY(v_to_delete);

  UPDATE public.stock_transfers
    SET created_by = v_keeper
    WHERE tenant_id = v_tenant AND created_by = ANY(v_to_delete);

  UPDATE public.supplier_invoices
    SET created_by = v_keeper
    WHERE tenant_id = v_tenant AND created_by = ANY(v_to_delete);

  UPDATE public.payments
    SET created_by = v_keeper
    WHERE tenant_id = v_tenant AND created_by = ANY(v_to_delete);

  UPDATE public.kds_tickets
    SET bumped_by = v_keeper
    WHERE tenant_id = v_tenant AND bumped_by = ANY(v_to_delete);
END;
$$;

-- ─── 1) Delete auth users except keeper ───
DELETE FROM auth.users
WHERE email IN (
  'owner@comtammatu.vn',
  'manager.datdo@comtammatu.vn',
  'cashier.datdo@comtammatu.vn',
  'cashier.service.datdo@comtammatu.vn',
  'chef.datdo@comtammatu.vn',
  'cashier.phuochai@comtammatu.vn',
  'manager.phuochai@comtammatu.vn',
  'cashier.service.phuochai@comtammatu.vn',
  'chef.phuochai@comtammatu.vn'
);

DO $$
DECLARE
  v_tenant   BIGINT;
  v_datdo    BIGINT;
  v_phuochai BIGINT;
  v_dev_branch BIGINT;
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

  SELECT id INTO v_dev_branch
  FROM public.branches
  WHERE tenant_id = v_tenant AND branch_kind = 'branch' AND is_active = true
  ORDER BY (id = v_datdo) DESC, id
  LIMIT 1;

  IF v_dev_branch IS NULL THEN
    RAISE EXCEPTION 'Thiếu chi nhánh active — chạy seed tenant trước.';
  END IF;

  FOR r IN
    SELECT *
    FROM (
      -- Owner / Super Manager: tenant-level but we pin branch_id to a dev branch
      -- so auth_branch_id() is never NULL (unblocks branch-scoped RLS/RPC).
      SELECT 'a0000001-0000-4000-8000-000000000001'::uuid AS user_id, 'owner@comtammatu.vn'::text AS email, 'owner'::text AS role, v_dev_branch::bigint AS branch_id, 'Owner'::text AS full_name, 'EMP-OWNER'::text AS emp_code
      UNION ALL
      SELECT 'a0000002-0000-4000-8000-000000000002'::uuid, 'keeper@comtammatu.vn'::text, 'owner'::text, v_dev_branch::bigint, 'Owner (keeper)'::text, 'EMP-KEEPER'::text
      UNION ALL
      SELECT 'a0000003-0000-4000-8000-000000000003'::uuid, 'manager.datdo@comtammatu.vn'::text, 'branch_manager'::text, v_datdo, 'QL Chi nhánh Đất Đỏ'::text, 'EMP-MGR-DD'::text
      UNION ALL
      SELECT 'a0000004-0000-4000-8000-000000000004'::uuid, 'cashier.datdo@comtammatu.vn'::text, 'cashier'::text, v_datdo, 'Thu ngân Đất Đỏ'::text, 'EMP-CASH-DD'::text
      UNION ALL
      SELECT 'a0000005-0000-4000-8000-000000000005'::uuid, 'cashier.service.datdo@comtammatu.vn'::text, 'cashier'::text, v_datdo, 'Thu ngân phục vụ Đất Đỏ'::text, 'EMP-CASH-SVC-DD'::text
      UNION ALL
      SELECT 'a0000006-0000-4000-8000-000000000006'::uuid, 'chef.datdo@comtammatu.vn'::text, 'chef'::text, v_datdo, 'Bếp Đất Đỏ'::text, 'EMP-CHEF-DD'::text
      UNION ALL
      SELECT 'a0000007-0000-4000-8000-000000000007'::uuid, 'cashier.phuochai@comtammatu.vn'::text, 'cashier'::text, v_phuochai, 'Thu ngân Phước Hải'::text, 'EMP-CASH-PH'::text
      UNION ALL
      SELECT 'a000000c-0000-4000-8000-00000000000c'::uuid, 'manager.phuochai@comtammatu.vn'::text, 'branch_manager'::text, v_phuochai, 'QL Chi nhánh Phước Hải'::text, 'EMP-MGR-PH'::text
      UNION ALL
      SELECT 'a000000d-0000-4000-8000-00000000000d'::uuid, 'cashier.service.phuochai@comtammatu.vn'::text, 'cashier'::text, v_phuochai, 'Thu ngân phục vụ Phước Hải'::text, 'EMP-CASH-SVC-PH'::text
      UNION ALL
      SELECT 'a000000e-0000-4000-8000-00000000000e'::uuid, 'chef.phuochai@comtammatu.vn'::text, 'chef'::text, v_phuochai, 'Bếp Phước Hải'::text, 'EMP-CHEF-PH'::text
    ) q
  LOOP
    v_crypt := extensions.crypt(v_pw, extensions.gen_salt('bf'));

    -- Idempotent: if keeper exists, rotate password + app metadata
    IF r.user_id = 'a0000002-0000-4000-8000-000000000002'::uuid
       AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.user_id) THEN
      UPDATE auth.users
      SET encrypted_password = v_crypt,
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          raw_app_meta_data = (
            jsonb_build_object(
              'provider', 'email',
              'providers', jsonb_build_array('email'),
              'tenant_id', v_tenant,
              'role', r.role,
              'full_name', r.full_name
            )
          ),
          raw_user_meta_data = jsonb_build_object('full_name', r.full_name),
          updated_at = now()
      WHERE id = r.user_id;

      -- ensure identity exists (ignore if already present)
      IF NOT EXISTS (
        SELECT 1 FROM auth.identities i
        WHERE i.user_id = r.user_id AND i.provider = 'email' AND i.provider_id = r.email
      ) THEN
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
      END IF;

      -- ensure employee exists
      INSERT INTO public.employees (tenant_id, profile_id, employee_code, is_active)
      VALUES (v_tenant, r.user_id, r.emp_code, true)
      ON CONFLICT (tenant_id, profile_id) DO UPDATE
        SET employee_code = EXCLUDED.employee_code,
            is_active = true;

      CONTINUE;
    END IF;

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

-- ─── Auth: backfill staff_permissions cho tất cả profile vừa seed ──
-- handle_new_user chỉ set position_id; grant permissions qua template phải
-- gọi tay. sync_missing_permissions_from_template() additive + idempotent.
DO $$
DECLARE
  v_res RECORD;
BEGIN
  SELECT * INTO v_res FROM public.sync_missing_permissions_from_template();
  RAISE NOTICE 'Auth seed: staff_permissions rows added=%', v_res.rows_added;
END $$;

-- ─── QA fixture: a pending annual leave for cashier.datdo so preview branches can
-- exercise the HR leave approve/reject + notification flow. Guarded: a fixture
-- failure raises a WARNING and never aborts the seed.
DO $$
DECLARE
  v_tenant BIGINT;
  v_branch BIGINT;
  v_emp    BIGINT;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1;
  SELECT id INTO v_branch FROM public.branches
    WHERE tenant_id = v_tenant AND name = 'Chi nhánh Đất Đỏ' LIMIT 1;
  SELECT e.id INTO v_emp FROM public.employees e
    WHERE e.tenant_id = v_tenant
      AND e.profile_id = 'a0000004-0000-4000-8000-000000000004'::uuid LIMIT 1;
  IF v_tenant IS NOT NULL AND v_branch IS NOT NULL AND v_emp IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.leave_requests
       WHERE tenant_id = v_tenant AND employee_id = v_emp
         AND status = 'pending' AND reason = 'QA seed: pending leave fixture'
     ) THEN
    INSERT INTO public.leave_requests
      (tenant_id, branch_id, employee_id, start_date, end_date, leave_type, status, reason)
    VALUES
      (v_tenant, v_branch, v_emp, current_date + 14, current_date + 15, 'annual', 'pending', 'QA seed: pending leave fixture');
    RAISE NOTICE 'QA leave fixture: pending annual leave created for employee %', v_emp;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'QA leave fixture skipped: %', SQLERRM;
END $$;

COMMIT;
