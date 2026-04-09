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
  v_keeper UUID := 'a0000002-0000-4000-8000-000000000002'::uuid; -- supermanager (will be kept)
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

-- ─── 0.5) Idempotent cleanup: reassign FKs to a keeper profile ───
-- Some audit tables reference profiles(id) with NOT NULL FK. Reassign those rows
-- to the keeper (supermanager) so we can recreate other users safely.
DO $$
DECLARE
  v_tenant BIGINT;
  v_keeper UUID := 'a0000002-0000-4000-8000-000000000002'::uuid; -- supermanager
  v_to_delete UUID[] := ARRAY[
    'a0000001-0000-4000-8000-000000000001'::uuid, -- owner
    'a0000003-0000-4000-8000-000000000003'::uuid, -- manager.datdo
    'a0000004-0000-4000-8000-000000000004'::uuid, -- cashier.datdo
    'a0000005-0000-4000-8000-000000000005'::uuid, -- waiter.datdo
    'a0000006-0000-4000-8000-000000000006'::uuid, -- chef.datdo
    'a0000007-0000-4000-8000-000000000007'::uuid, -- cashier.phuochai
    'a0000008-0000-4000-8000-000000000008'::uuid  -- office
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
  v_hq       BIGINT;
  v_pw       TEXT := 'Test1234!';
  v_crypt    TEXT;

  r RECORD;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1;
  SELECT id INTO v_hq
  FROM public.branches
  WHERE tenant_id = v_tenant AND COALESCE(is_headquarters, false) = true
  ORDER BY (name = 'Trụ sở chính') DESC
  LIMIT 1;

  IF v_hq IS NULL THEN
    RAISE EXCEPTION 'Chưa có chi nhánh HQ — chạy seed tenant trước.';
  END IF;

  SELECT id INTO v_datdo FROM public.branches WHERE tenant_id = v_tenant AND name = 'Chi nhánh Đất Đỏ' LIMIT 1;
  SELECT id INTO v_phuochai FROM public.branches WHERE tenant_id = v_tenant AND name = 'Chi nhánh Phước Hải' LIMIT 1;

  IF v_datdo IS NULL OR v_phuochai IS NULL THEN
    RAISE EXCEPTION 'Thiếu Chi nhánh Đất Đỏ hoặc Chi nhánh Phước Hải.';
  END IF;

  FOR r IN
    SELECT *
    FROM (
      -- Owner / Super Manager: tenant-level but we pin branch_id to HQ for dev
      -- so auth_branch_id() is never NULL (unblocks branch-scoped RLS/RPC).
      SELECT 'a0000001-0000-4000-8000-000000000001'::uuid AS user_id, 'owner@comtammatu.vn'::text AS email, 'owner'::text AS role, v_hq::bigint AS branch_id, 'Owner'::text AS full_name, 'EMP-OWNER'::text AS emp_code
      UNION ALL
      SELECT 'a0000002-0000-4000-8000-000000000002'::uuid, 'supermanager@comtammatu.vn'::text, 'super_manager'::text, v_hq::bigint, 'Quản lý tổng'::text, 'EMP-SM'::text
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

    -- Idempotent: if keeper (supermanager) exists, rotate password + app metadata
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

COMMIT;
