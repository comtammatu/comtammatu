-- =============================================================
-- Auth v3 — H2b: hr_payroll RLS policies → has_permission_any gate
--
-- Driver: 4-agent security audit 2026-05-07. H2a (refunds) refactored
-- redundant `auth_role() IN ('owner','super_manager')` → has_permission gate.
-- Same pattern remains in `supabase/migrations/20260416040000_hr_payroll.sql`
-- at 6 sites (3 in pp_* + 3 in pe_* policies, USING + WITH CHECK).
--
-- Scope: 4 RLS policies (`pp_select`, `pp_manage`, `pe_select`, `pe_manage`)
-- in `payroll_periods` + `payroll_entries`. Replace auth_role() check with
-- `has_permission_any('finance:payroll_calculate')` — payroll is tenant-wide
-- (no branch_id), grant catalog already includes the key
-- (`packages/shared/src/auth/permissions.ts` FINANCE_PAYROLL_CALCULATE).
--
-- Why `payroll_calculate` and not `payroll_approve`: calculate covers all
-- payroll workflow access (read, create, update, finalize). Approve is a
-- finer-grained gate enforced separately at status transition (draft →
-- approved). RLS row-level access only needs the broader key.
--
-- Owner bypass: has_permission_any short-circuits via _auth_v2_is_owner
-- (positions.code='owner') — owner without explicit grant still passes.
--
-- Stale-revoke window closure: previous auth_role() reads JWT user_role
-- claim cached ~1h. Revoking finance:payroll_calculate from a former
-- super_manager now blocks RLS access immediately (DB-live query).
--
-- See: tasks/regressions.md RLS-DESTRUCTIVE-MUST-USE-HAS-PERMISSION (H2a
-- precedent).
-- =============================================================

-- ─── 1. PRE-FLIGHT GATE ───────────────────────────────────────
-- Verify the permission key exists in catalog + super_manager template
-- contains it + every active super_manager has the grant. Mirrors H2a
-- (`20260601200000_h2a_refunds_update_perm_gate.sql:40-94`).
DO $$
DECLARE
  v_orphan_count INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.permission_keys WHERE key = 'finance:payroll_calculate'
  ) THEN
    RAISE EXCEPTION
      'H2b pre-flight: permission_keys missing row ''finance:payroll_calculate''. Verify auth_v2_seed_catalog.sql applied.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.role_templates
     WHERE position_code = 'super_manager'
       AND 'finance:payroll_calculate' = ANY(permission_keys)
  ) THEN
    RAISE EXCEPTION
      'H2b pre-flight: role_template position_code=super_manager missing key finance:payroll_calculate. Re-run seed.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*) INTO v_orphan_count
    FROM public.profiles p
    JOIN public.positions po ON po.id = p.position_id
   WHERE po.legacy_role_code = 'super_manager'
     AND p.is_active = TRUE
     AND NOT EXISTS (
       SELECT 1 FROM public.staff_permissions sp
        WHERE sp.user_id = p.id
          AND sp.permission_key = 'finance:payroll_calculate'
          AND sp.valid_from <= now()
          AND (sp.valid_until IS NULL OR sp.valid_until > now())
     );

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION
      'H2b pre-flight: % active super_manager(s) lack finance:payroll_calculate grant. Without this they lose payroll RLS access. Apply per user: SELECT apply_template_to_user(p_target_id, NULL, ''super_manager'').',
      v_orphan_count
      USING ERRCODE = 'P0001';
  END IF;
END$$;

-- ─── 2. SWAP payroll_periods POLICIES ─────────────────────────
DROP POLICY IF EXISTS "pp_select" ON public.payroll_periods;
DROP POLICY IF EXISTS "pp_manage" ON public.payroll_periods;

CREATE POLICY "pp_select" ON public.payroll_periods
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:payroll_calculate')
  );

CREATE POLICY "pp_manage" ON public.payroll_periods
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:payroll_calculate')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:payroll_calculate')
  );

-- ─── 3. SWAP payroll_entries POLICIES ─────────────────────────
DROP POLICY IF EXISTS "pe_select" ON public.payroll_entries;
DROP POLICY IF EXISTS "pe_manage" ON public.payroll_entries;

CREATE POLICY "pe_select" ON public.payroll_entries
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:payroll_calculate')
  );

CREATE POLICY "pe_manage" ON public.payroll_entries
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:payroll_calculate')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:payroll_calculate')
  );

COMMENT ON POLICY "pp_manage" ON public.payroll_periods IS
  'H2b (2026-05-07): destructive ALL gated by has_permission_any(''finance:payroll_calculate''). Owner bypass via positions.code=''owner''. Closes 1h stale-revoke window from previous auth_role() check.';

COMMENT ON POLICY "pe_manage" ON public.payroll_entries IS
  'H2b (2026-05-07): destructive ALL gated by has_permission_any(''finance:payroll_calculate''). Approve transition (draft → approved) gated separately by finance:payroll_approve at app/RPC level.';
