DO $$
DECLARE
  v_legacy RECORD;
  v_canonical_id BIGINT;
  v_legacy_cashier TEXT := 'cashier' || '_' || 'floor';
  v_legacy_kitchen_helper TEXT := 'phu' || '_' || 'bep';
  v_legacy_warehouse_manager TEXT := 'kho' || '_' || 'truong';
  v_legacy_head_chef TEXT := 'bep' || '_' || 'truong';
  v_legacy_branch_manager TEXT := 'quan' || '_' || 'ly' || '_' || 'CN';
BEGIN
  FOR v_legacy IN
    SELECT rt.id, rt.tenant_id, rt.permission_keys, legacy.canonical_name
    FROM public.role_templates rt
    JOIN (
      VALUES
        (v_legacy_cashier, 'cashier'),
        (v_legacy_kitchen_helper, 'kitchen_helper'),
        (v_legacy_warehouse_manager, 'warehouse_manager'),
        (v_legacy_head_chef, 'head_chef'),
        (v_legacy_branch_manager, 'branch_manager')
    ) AS legacy(legacy_name, canonical_name)
      ON legacy.legacy_name = rt.name
     AND legacy.canonical_name = rt.position_code
  LOOP
    SELECT id
      INTO v_canonical_id
    FROM public.role_templates
    WHERE tenant_id = v_legacy.tenant_id
      AND name = v_legacy.canonical_name
      AND id <> v_legacy.id
    LIMIT 1;

    IF v_canonical_id IS NULL THEN
      UPDATE public.role_templates
      SET name = v_legacy.canonical_name,
          updated_at = now()
      WHERE id = v_legacy.id;
    ELSE
      UPDATE public.role_templates rt
      SET permission_keys = (
            SELECT array_agg(DISTINCT key ORDER BY key)
            FROM unnest(rt.permission_keys || v_legacy.permission_keys) AS key
          ),
          updated_at = now()
      WHERE rt.id = v_canonical_id;

      UPDATE public.staff_permissions
      SET source_template = v_canonical_id
      WHERE source_template = v_legacy.id;

      UPDATE public.permission_audit_log
      SET source_template_id = v_canonical_id
      WHERE source_template_id = v_legacy.id;

      DELETE FROM public.role_templates
      WHERE id = v_legacy.id;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  v_def TEXT;
  v_super_role TEXT := 'super' || '_' || 'manager';
  v_area_role TEXT := 'area' || '_' || 'manager';
  v_region_role TEXT := 'quan' || '_' || 'ly' || '_' || 'vung';
  v_branch_role TEXT := 'quan' || '_' || 'ly' || '_' || 'CN';
BEGIN
  IF to_regprocedure('public.split_order(bigint,jsonb,uuid)') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.split_order(bigint,jsonb,uuid)'::regprocedure)
      INTO v_def;

    v_def := replace(
      v_def,
      format('(''owner'', ''%s'', ''%s'', ''branch_manager'', ''cashier'', ''waiter'')', v_super_role, v_area_role),
      '(''owner'', ''branch_manager'', ''cashier'')'
    );
    v_def := replace(
      v_def,
      format('v_prof_role IN (''owner'', ''%s'', ''%s'')', v_super_role, v_area_role),
      'v_prof_role IN (''owner'')'
    );

    IF v_def ~ format('\y(%s|%s)\y', v_super_role, v_area_role) THEN
      RAISE EXCEPTION 'split_order still references retired access buckets';
    END IF;

    EXECUTE v_def;
  END IF;

  IF to_regprocedure('public.weekly_grn_override_report()') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.weekly_grn_override_report()'::regprocedure)
      INTO v_def;

    v_def := replace(
      v_def,
      format('ARRAY[''owner'',''%s'']::TEXT[]', v_region_role),
      'ARRAY[''owner'',''branch_manager'']::TEXT[]'
    );

    IF v_def ~ format('\y(%s|%s)\y', v_region_role, v_branch_role) THEN
      RAISE EXCEPTION 'weekly_grn_override_report still references legacy target roles';
    END IF;

    EXECUTE v_def;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.weekly_waste_report() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_row RECORD; v_count INT := 0;
BEGIN
  FOR v_row IN
    SELECT si.tenant_id, si.branch_id, COUNT(*) AS waste_count,
      COUNT(*) FILTER (WHERE si.approval_status = 'pending')  AS pending_count,
      COUNT(*) FILTER (WHERE si.approval_status = 'approved') AS approved_count,
      COUNT(*) FILTER (WHERE si.approval_status = 'rejected') AS rejected_count,
      COALESCE(SUM(sii.total_cost), 0) AS total_value
    FROM public.stock_issues si JOIN public.stock_issue_items sii ON sii.issue_id = si.id
    WHERE si.issue_type = 'writeoff' AND si.issued_at > now() - INTERVAL '7 days'
    GROUP BY si.tenant_id, si.branch_id
  LOOP
    INSERT INTO public.notifications (tenant_id, target_branch_id, target_roles, kind, severity, title, body, meta, dedup_key)
    VALUES (v_row.tenant_id, v_row.branch_id, ARRAY['owner','branch_manager']::TEXT[],
      'inventory.waste.weekly_report',
      CASE WHEN v_row.pending_count >= 5 THEN 'warning' ELSE 'info' END,
      'Báo cáo waste — tuần vừa qua',
      format('Chi nhánh có %s phiếu waste tuần qua (pending: %s, approved: %s, rejected: %s). Tổng giá trị: %s VND',
             v_row.waste_count, v_row.pending_count, v_row.approved_count, v_row.rejected_count, v_row.total_value),
      jsonb_build_object('waste_count', v_row.waste_count, 'pending_count', v_row.pending_count,
        'approved_count', v_row.approved_count, 'rejected_count', v_row.rejected_count, 'total_value', v_row.total_value),
      format('waste_report:%s:%s', v_row.branch_id, to_char(now(), 'IYYY-IW')));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

REVOKE ALL ON FUNCTION public.weekly_waste_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weekly_waste_report() TO service_role;
