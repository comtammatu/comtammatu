-- Rollback for 20260601700000_dead_rpc_drop_tier_a_pilot.sql
-- Per RPC-ROLLBACK-MUST-INCLUDE-BODY: full CREATE OR REPLACE bodies inlined
-- from canonical source migrations (`20260422130000_auth_v2_backfill.sql` +
-- `20260419000000_gl_posting_rules.sql`).

-- ─── 1. _auth_v2_is_tenant_wide_role (define first — backfill depends) ──
CREATE OR REPLACE FUNCTION public._auth_v2_is_tenant_wide_role(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_role IN ('owner', 'super_manager', 'office');
$$;

-- ─── 2. backfill_permissions_from_role ──────────────────────────
CREATE OR REPLACE FUNCTION public.backfill_permissions_from_role()
RETURNS TABLE (
  total_profiles        INTEGER,
  positions_set         INTEGER,
  perm_rows_inserted    INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile          RECORD;
  v_position_code    TEXT;
  v_position_id      BIGINT;
  v_template         RECORD;
  v_perm_key         TEXT;
  v_branch_for_grant BIGINT;
  v_area_branch      RECORD;
  v_total_profiles   INTEGER := 0;
  v_positions_set    INTEGER := 0;
  v_perm_inserted    INTEGER := 0;
  v_rows_affected    INTEGER;
BEGIN
  FOR v_profile IN
    SELECT p.id AS user_id, p.tenant_id, p.branch_id, p.role::text AS role
    FROM public.profiles p
    WHERE p.role IS NOT NULL
      AND p.is_active = TRUE
  LOOP
    v_total_profiles := v_total_profiles + 1;

    v_position_code := public._auth_v2_role_to_position(v_profile.role);
    IF v_position_code IS NULL THEN
      CONTINUE;
    END IF;

    SELECT id INTO v_position_id
    FROM public.positions
    WHERE tenant_id = v_profile.tenant_id AND code = v_position_code
    LIMIT 1;

    IF v_position_id IS NULL THEN
      RAISE WARNING 'position % not seeded for tenant %', v_position_code, v_profile.tenant_id;
      CONTINUE;
    END IF;

    UPDATE public.profiles
    SET position_id = v_position_id
    WHERE id = v_profile.user_id AND position_id IS NULL;
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    v_positions_set := v_positions_set + v_rows_affected;

    SELECT rt.id, rt.permission_keys INTO v_template
    FROM public.role_templates rt
    WHERE rt.tenant_id = v_profile.tenant_id AND rt.position_code = v_position_code
    LIMIT 1;

    IF v_template.permission_keys IS NULL THEN
      RAISE WARNING 'role_template missing for position=% tenant=%', v_position_code, v_profile.tenant_id;
      CONTINUE;
    END IF;

    IF v_profile.role = 'area_manager' THEN
      FOR v_area_branch IN
        SELECT ab.branch_id
        FROM public.area_branches ab
        JOIN public.profiles p ON p.id = v_profile.user_id
        JOIN public.areas a ON a.tenant_id = p.tenant_id
        WHERE ab.tenant_id = v_profile.tenant_id
          AND ab.area_id = a.id
          AND a.id = (SELECT area_id FROM public.profiles WHERE id = v_profile.user_id)
      LOOP
        FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
          INSERT INTO public.staff_permissions (
            user_id, tenant_id, branch_id, permission_key, source_template
          ) VALUES (
            v_profile.user_id, v_profile.tenant_id, v_area_branch.branch_id, v_perm_key, v_template.id
          ) ON CONFLICT DO NOTHING;
          GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
          v_perm_inserted := v_perm_inserted + v_rows_affected;
        END LOOP;
      END LOOP;

    ELSIF public._auth_v2_is_tenant_wide_role(v_profile.role) THEN
      FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
        INSERT INTO public.staff_permissions (
          user_id, tenant_id, branch_id, permission_key, source_template
        ) VALUES (
          v_profile.user_id, v_profile.tenant_id, NULL, v_perm_key, v_template.id
        ) ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
        v_perm_inserted := v_perm_inserted + v_rows_affected;
      END LOOP;

    ELSE
      v_branch_for_grant := v_profile.branch_id;
      IF v_branch_for_grant IS NULL THEN
        RAISE WARNING 'user % has role % but no branch_id; skipping branch-scoped grants',
          v_profile.user_id, v_profile.role;
        CONTINUE;
      END IF;

      FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
        INSERT INTO public.staff_permissions (
          user_id, tenant_id, branch_id, permission_key, source_template
        ) VALUES (
          v_profile.user_id, v_profile.tenant_id, v_branch_for_grant, v_perm_key, v_template.id
        ) ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
        v_perm_inserted := v_perm_inserted + v_rows_affected;
      END LOOP;
    END IF;

  END LOOP;

  RETURN QUERY SELECT v_total_profiles, v_positions_set, v_perm_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_permissions_from_role() FROM PUBLIC;

-- ─── 3. seed_posting_rules ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_posting_rules(p_tenant_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.posting_rules WHERE tenant_id = p_tenant_id LIMIT 1) THEN
    RETURN;
  END IF;

  INSERT INTO public.posting_rules (tenant_id, rule_code, description, transaction_type, debit_account_code, credit_account_code)
  VALUES
    (p_tenant_id, 'SALE_CASH',             'Doanh thu bán hàng tiền mặt',          'sale', '111', '511'),
    (p_tenant_id, 'SALE_BANK',             'Doanh thu bán hàng chuyển khoản',      'sale', '112', '511'),
    (p_tenant_id, 'SALE_VAT_CASH',         'Thuế GTGT đầu ra (tiền mặt)',          'sale', '111', '33311'),
    (p_tenant_id, 'SALE_VAT_BANK',         'Thuế GTGT đầu ra (chuyển khoản)',      'sale', '112', '33311'),
    (p_tenant_id, 'SALE_COGS',             'Giá vốn hàng bán (xuất kho NVL)',      'sale', '621', '152'),
    (p_tenant_id, 'GRN_INVENTORY',         'Nhập kho nguyên liệu',                 'purchase', '152', '331'),
    (p_tenant_id, 'GRN_VAT_INPUT',         'Thuế GTGT đầu vào',                    'purchase', '33312', '331'),
    (p_tenant_id, 'SUPPLIER_PAYMENT_CASH', 'Trả tiền NCC bằng tiền mặt',           'purchase', '331', '111'),
    (p_tenant_id, 'SUPPLIER_PAYMENT_BANK', 'Trả tiền NCC bằng chuyển khoản',       'purchase', '331', '112'),
    (p_tenant_id, 'PAYROLL_SALARY',        'Chi phí lương nhân công',               'payroll', '622', '334'),
    (p_tenant_id, 'PAYROLL_BHXH_ER',       'BHXH phần doanh nghiệp',               'payroll', '627', '3383'),
    (p_tenant_id, 'PAYROLL_BHYT_ER',       'BHYT phần doanh nghiệp',               'payroll', '627', '3384'),
    (p_tenant_id, 'PAYROLL_BHTN_ER',       'BHTN phần doanh nghiệp',               'payroll', '627', '3386'),
    (p_tenant_id, 'PAYROLL_PIT',           'Thuế TNCN khấu trừ',                   'payroll', '334', '3335'),
    (p_tenant_id, 'PAYROLL_BHXH_EE',      'BHXH phần người lao động',              'payroll', '334', '3383'),
    (p_tenant_id, 'PAYROLL_BHYT_EE',      'BHYT phần người lao động',              'payroll', '334', '3384'),
    (p_tenant_id, 'PAYROLL_BHTN_EE',      'BHTN phần người lao động',              'payroll', '334', '3386'),
    (p_tenant_id, 'TRANSFER_INVENTORY',    'Chuyển kho liên chi nhánh',             'transfer', '152', '152'),
    (p_tenant_id, 'PRODUCTION_CONSUME',    'Tiêu thụ NVL cho sản xuất',            'production', '621', '152'),
    (p_tenant_id, 'PRODUCTION_OUTPUT',     'Nhập kho thành phẩm sản xuất',         'production', '155', '621');
END;
$$;
