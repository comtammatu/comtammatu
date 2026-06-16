BEGIN;

-- Forward replay of the never-applied 20260602010000_rls_policy_dedup (archived
-- below baseline, 0 rows in schema_migrations) plus app/RLS permission-key
-- alignment for stock_transfer_items. Permissive policies OR-combine, so the
-- leftover tenant-only sti_select/sti_manage neutralize the hardened per-branch
-- permission gate. All DROP/CREATE are idempotent; safe to re-run.

-- 1. stock_transfer_items — drop the tenant-only bypass policies
DROP POLICY IF EXISTS "sti_select" ON public.stock_transfer_items;
DROP POLICY IF EXISTS "sti_manage" ON public.stock_transfer_items;

-- 1b. Align the surviving hardened policies with the permission keys the
-- direct-PostgREST server actions already enforce (transfer-actions.ts):
-- from-side create/ship gate on inventory:transfer_create / inventory:transfer_ship,
-- to-side receive on inventory:transfer_receive. The original inventory:read /
-- inventory:write arms are preserved via OR, so no existing access is removed.
DROP POLICY IF EXISTS "stock_transfer_items_select" ON public.stock_transfer_items;
CREATE POLICY "stock_transfer_items_select" ON public.stock_transfer_items
  FOR SELECT TO authenticated
  USING (
    (tenant_id = public.auth_tenant_id())
    AND (EXISTS (
      SELECT 1 FROM public.stock_transfers t
      WHERE t.id = stock_transfer_items.transfer_id
        AND t.tenant_id = stock_transfer_items.tenant_id
        AND (
          public.has_permission(t.from_branch_id, 'inventory:read'::text)
          OR public.has_permission(t.to_branch_id, 'inventory:read'::text)
          OR public.has_permission(t.from_branch_id, 'inventory:transfer_create'::text)
          OR public.has_permission(t.from_branch_id, 'inventory:transfer_ship'::text)
          OR public.has_permission(t.to_branch_id, 'inventory:transfer_receive'::text)
        )
    ))
  );

DROP POLICY IF EXISTS "stock_transfer_items_write" ON public.stock_transfer_items;
CREATE POLICY "stock_transfer_items_write" ON public.stock_transfer_items
  FOR ALL TO authenticated
  USING (
    (tenant_id = public.auth_tenant_id())
    AND (EXISTS (
      SELECT 1 FROM public.stock_transfers t
      WHERE t.id = stock_transfer_items.transfer_id
        AND t.tenant_id = stock_transfer_items.tenant_id
        AND (
          public.has_permission(t.from_branch_id, 'inventory:write'::text)
          OR public.has_permission(t.to_branch_id, 'inventory:write'::text)
          OR public.has_permission(t.from_branch_id, 'inventory:transfer_create'::text)
          OR public.has_permission(t.from_branch_id, 'inventory:transfer_ship'::text)
          OR public.has_permission(t.to_branch_id, 'inventory:transfer_receive'::text)
        )
    ))
  )
  WITH CHECK (
    (tenant_id = public.auth_tenant_id())
    AND (EXISTS (
      SELECT 1 FROM public.stock_transfers t
      WHERE t.id = stock_transfer_items.transfer_id
        AND t.tenant_id = stock_transfer_items.tenant_id
        AND (
          public.has_permission(t.from_branch_id, 'inventory:write'::text)
          OR public.has_permission(t.to_branch_id, 'inventory:write'::text)
          OR public.has_permission(t.from_branch_id, 'inventory:transfer_create'::text)
          OR public.has_permission(t.from_branch_id, 'inventory:transfer_ship'::text)
          OR public.has_permission(t.to_branch_id, 'inventory:transfer_receive'::text)
        )
    ))
  );

-- 2. payroll_periods — drop byte-identical / covered duplicates; keep the
-- hardened payroll_periods_select (finance:view) + payroll_periods_write
-- (finance:payroll_calculate).
DROP POLICY IF EXISTS "pp_manage" ON public.payroll_periods;
DROP POLICY IF EXISTS "pp_select" ON public.payroll_periods;

-- 3. payroll_entries — drop only the byte-identical duplicates. pe_select is
-- covered by payroll_entries_select (OR-includes finance:payroll_calculate);
-- pe_manage is byte-identical to payroll_entries_write. pe_employee_self_select
-- is KEPT: it exposes self rows for ALL period statuses, a SUPERSET of the
-- survivor's paid-only self arm, so dropping it would NARROW self-access.
DROP POLICY IF EXISTS "pe_select" ON public.payroll_entries;
DROP POLICY IF EXISTS "pe_manage" ON public.payroll_entries;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='stock_transfer_items'
    AND policyname IN ('sti_select','sti_manage');
  IF v_count <> 0 THEN RAISE EXCEPTION 'sti bypass policies not dropped: %', v_count; END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='stock_transfer_items';
  IF v_count <> 2 THEN RAISE EXCEPTION 'stock_transfer_items policy count expected 2, got %', v_count; END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='stock_transfer_items'
    AND policyname='stock_transfer_items_write'
    AND qual LIKE '%inventory:transfer_receive%'
    AND with_check LIKE '%inventory:transfer_create%';
  IF v_count <> 1 THEN RAISE EXCEPTION 'stock_transfer_items_write not aligned to transfer_* keys'; END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='stock_transfer_items'
    AND policyname='stock_transfer_items_select'
    AND qual LIKE '%inventory:transfer_receive%';
  IF v_count <> 1 THEN RAISE EXCEPTION 'stock_transfer_items_select not aligned to transfer_* keys'; END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='payroll_periods'
    AND policyname IN ('pp_manage','pp_select');
  IF v_count <> 0 THEN RAISE EXCEPTION 'payroll_periods duplicates not dropped: %', v_count; END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='payroll_periods'
    AND policyname IN ('payroll_periods_select','payroll_periods_write');
  IF v_count <> 2 THEN RAISE EXCEPTION 'payroll_periods survivors missing: %', v_count; END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='payroll_entries'
    AND policyname IN ('pe_select','pe_manage');
  IF v_count <> 0 THEN RAISE EXCEPTION 'payroll_entries duplicates not dropped: %', v_count; END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='payroll_entries'
    AND policyname IN ('payroll_entries_select','payroll_entries_write','pe_employee_self_select');
  IF v_count <> 3 THEN RAISE EXCEPTION 'payroll_entries survivors expected 3, got %', v_count; END IF;
END $$;

COMMIT;
