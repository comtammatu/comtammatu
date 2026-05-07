-- =============================================================
-- Auth v3 — H2a: refunds UPDATE RLS policy → has_permission gate
--
-- Driver: 4-agent security audit 2026-05-07. Original audit flagged 7 May
-- 2026 migrations using auth_role() instead of has_permission(). Concrete
-- file reading split them into:
--   - 1 pure permission-gate refactor (this file): refunds_update policy
--   - 5 intentional side/scope guards or named helpers (KEEP, documented)
--   - 1 doc comment only (NO ACTION)
--   - 1 module-ACL fast-path (daily limits — deferred per BMIDL-RLS-INTENTIONAL-ROLE-FASTPATH rule)
--
-- Scope: `supabase/migrations/20260505010000_refunds_table.sql:69-80`. The
-- `refunds_update` policy currently gates via:
--     has_permission(branch_id, 'orders:refund')
--     AND auth_role() IN ('owner', 'super_manager')
--
-- The auth_role() clause is redundant + introduces a 1-hour stale-revoke
-- window: when an admin demotes a super_manager, the JWT user_role claim
-- persists until token refresh, allowing a destructive UPDATE during that
-- window. has_permission() queries staff_permissions live → revoke is
-- immediate. App-code path `apps/web/app/orders/refund-actions.ts:251`
-- does direct `from('refunds').update(...)` for refund REJECT, so RLS IS
-- the canonical gate (not just defense-in-depth).
--
-- Permission key `orders:refund_approve` already exists in catalog +
-- role_templates seed (`20260510000000_m4_refund_reversal_foundation.sql:49-66`)
-- for owner + super_manager. Reverse-payment RPC at
-- `20260524000000_db_rls_rpc_hot_path_optimization.sql:330` already enforces
-- this same key. RLS now mirrors that gate.
--
-- Owner bypass: has_permission() short-circuits for users whose
-- positions.code='owner' (`20260423040000_auth_v2_m5_hotfix_has_permission.sql:14-18`),
-- so owner without explicit grant still passes.
--
-- See: tasks/regressions.md RLS-DESTRUCTIVE-MUST-USE-HAS-PERMISSION (new),
-- BMIDL-RLS-INTENTIONAL-ROLE-FASTPATH (new).
-- =============================================================

-- ─── 1. PRE-FLIGHT GATE ───────────────────────────────────────
-- Refuse to apply if:
--   (a) catalog row missing,
--   (b) super_manager role_template lacks the key (means seed never ran),
--   (c) any active super_manager user lacks an unrevoked grant
--       (means apply_template_to_user was never run for them).
-- Owner bypass is positional, no grant required. Other roles never gained
-- approve access pre-refactor; refactor preserves their non-access.
DO $$
DECLARE
  v_orphan_count INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.permission_keys WHERE key = 'orders:refund_approve'
  ) THEN
    RAISE EXCEPTION
      'H2a pre-flight: permission_keys missing row ''orders:refund_approve''. Apply 20260510000000_m4_refund_reversal_foundation.sql first.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.role_templates
     WHERE position_code = 'super_manager'
       AND 'orders:refund_approve' = ANY(permission_keys)
  ) THEN
    RAISE EXCEPTION
      'H2a pre-flight: role_template position_code=super_manager missing key orders:refund_approve. Re-run seed.'
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
          AND sp.permission_key = 'orders:refund_approve'
          AND sp.valid_from <= now()
          AND (sp.valid_until IS NULL OR sp.valid_until > now())
     );

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION
      'H2a pre-flight: % active super_manager(s) lack orders:refund_approve grant. Without this, they lose UPDATE access on refunds. Apply per user: SELECT apply_template_to_user(p_target_id, NULL, ''super_manager''). Inspect: SELECT p.id FROM profiles p JOIN positions po ON po.id=p.position_id WHERE po.legacy_role_code=''super_manager'' AND p.is_active AND NOT EXISTS (SELECT 1 FROM staff_permissions sp WHERE sp.user_id=p.id AND sp.permission_key=''orders:refund_approve'' AND sp.valid_from <= now() AND (sp.valid_until IS NULL OR sp.valid_until > now()));',
      v_orphan_count
      USING ERRCODE = 'P0001';
  END IF;
END$$;

-- ─── 2. SWAP THE POLICY ────────────────────────────────────────
DROP POLICY IF EXISTS "refunds_update" ON public.refunds;

CREATE POLICY "refunds_update" ON public.refunds
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:refund_approve')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:refund_approve')
  );

COMMENT ON POLICY "refunds_update" ON public.refunds IS
  'H2a (2026-05-07): destructive UPDATE gated by has_permission(branch_id, ''orders:refund_approve''). Owner bypass via positions.code=''owner''. Replaces previous auth_role() IN (...) check which had a 1h stale-revoke window via JWT user_role caching.';
