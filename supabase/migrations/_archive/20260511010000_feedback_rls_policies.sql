-- =========================================================================
-- feedback module — Slice 1: RLS + GRANT/REVOKE
--
-- Security model:
--
--   feedback_qr_codes    — authenticated CRUD (admin manages QR via app)
--   feedbacks            — SELECT via has_permission; INSERT/UPDATE/DELETE REVOKED
--                          (only submit_feedback SECURITY DEFINER can INSERT)
--   telegram_destinations — authenticated CRUD (admin manages targets)
--   telegram_outbox      — SELECT only for debugging; INSERT/UPDATE/DELETE REVOKED
--                          (only submit_feedback SECURITY DEFINER can INSERT;
--                           worker runs as service_role via Edge Function)
--
-- Pattern mirrors 20260505020000_audit_logs_rpc_only_insert.sql:
--   REVOKE DML on sensitive write paths, expose one SECURITY DEFINER RPC.
-- =========================================================================

-- ─── 1. Enable + Force RLS ───────────────────────────────────────────────
--
-- FORCE RLS ensures even the table owner (postgres role) is subject to
-- policies when acting as a non-superuser within a transaction. Matches
-- the pattern used in audit_logs and other sensitive tables in this project.

ALTER TABLE public.feedback_qr_codes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_qr_codes     FORCE ROW LEVEL SECURITY;

ALTER TABLE public.feedbacks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedbacks             FORCE ROW LEVEL SECURITY;

ALTER TABLE public.telegram_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_destinations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.telegram_outbox       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_outbox       FORCE ROW LEVEL SECURITY;

-- ─── 2. REVOKE direct DML on write-protected tables ──────────────────────
--
-- feedbacks: INSERT path is locked to submit_feedback() SECURITY DEFINER RPC
-- (service_role). Prevents clients from forging ratings, spoofing qr_code_id,
-- or injecting arbitrary tenant_id/branch_id. UPDATE/DELETE also revoked —
-- feedback rows are immutable once submitted (Slice 2 adds AI fields via
-- service_role UPDATE only).
--
-- telegram_outbox: INSERT locked to submit_feedback() SECURITY DEFINER.
-- UPDATE locked to the worker Edge Function (service_role). Prevents
-- authenticated users from acking/retrying alerts or faking sent_at.

REVOKE INSERT, UPDATE, DELETE ON TABLE public.feedbacks         FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.telegram_outbox   FROM authenticated;

-- ─── 3. GRANT baseline SELECT to authenticated ───────────────────────────
--
-- SELECT is further filtered by RLS policies below. Granting SELECT here
-- satisfies Supabase PostgREST privilege check without opening up writes.

GRANT SELECT ON TABLE public.feedback_qr_codes     TO authenticated;
GRANT SELECT ON TABLE public.feedbacks             TO authenticated;
GRANT SELECT ON TABLE public.telegram_destinations TO authenticated;
GRANT SELECT ON TABLE public.telegram_outbox       TO authenticated;

-- ─── 4. GRANT INSERT + UPDATE on admin-managed tables ────────────────────
--
-- feedback_qr_codes: admins create/rotate QR codes via app.
-- telegram_destinations: admins configure alert targets via app.
-- (DELETE is excluded — soft-delete via is_active flag instead.)

GRANT INSERT, UPDATE ON TABLE public.feedback_qr_codes     TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.telegram_destinations TO authenticated;

-- ─── 5. RLS Policies — feedback_qr_codes ────────────────────────────────

-- SELECT: tenant-scoped (all authenticated users in tenant can read QR list)
CREATE POLICY "fqr_select" ON public.feedback_qr_codes
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

-- INSERT: requires feedback:manage_qr permission on the target branch
CREATE POLICY "fqr_insert" ON public.feedback_qr_codes
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'feedback:manage_qr')
  );

-- UPDATE: same gate as INSERT (rotate, deactivate)
CREATE POLICY "fqr_update" ON public.feedback_qr_codes
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'feedback:manage_qr')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'feedback:manage_qr')
  );

-- ─── 6. RLS Policies — feedbacks ────────────────────────────────────────
--
-- Single permissive SELECT policy using has_permission() which already
-- encodes branch/tenant scope per role. Avoids the RLS-PERMISSIVE-POLICIES-OR
-- footgun (two permissive policies become OR, exposing cross-branch data).
--
-- Phone is always present in SELECT result here — app MUST always query
-- via feedbacks_with_masked_phone view, which applies column-level masking
-- based on feedback:view_phone permission.

CREATE POLICY "feedbacks_select" ON public.feedbacks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'feedback:view')
  );

-- No INSERT/UPDATE/DELETE policies — DML is revoked above. service_role
-- (submit_feedback RPC + worker) bypasses RLS entirely per Supabase defaults.

-- ─── 7. RLS Policies — telegram_destinations ────────────────────────────

CREATE POLICY "telegram_dest_select" ON public.telegram_destinations
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      -- HQ-level destinations: any user with feedback:manage_telegram in any branch
      (branch_id IS NULL AND public.has_permission_any('feedback:manage_telegram'))
      -- Branch-level destinations: scoped to the specific branch
      OR (branch_id IS NOT NULL AND public.has_permission(branch_id, 'feedback:manage_telegram'))
    )
  );

CREATE POLICY "telegram_dest_insert" ON public.telegram_destinations
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      (branch_id IS NULL AND public.has_permission_any('feedback:manage_telegram'))
      OR (branch_id IS NOT NULL AND public.has_permission(branch_id, 'feedback:manage_telegram'))
    )
  );

CREATE POLICY "telegram_dest_update" ON public.telegram_destinations
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      (branch_id IS NULL AND public.has_permission_any('feedback:manage_telegram'))
      OR (branch_id IS NOT NULL AND public.has_permission(branch_id, 'feedback:manage_telegram'))
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      (branch_id IS NULL AND public.has_permission_any('feedback:manage_telegram'))
      OR (branch_id IS NOT NULL AND public.has_permission(branch_id, 'feedback:manage_telegram'))
    )
  );

-- ─── 8. RLS Policies — telegram_outbox ──────────────────────────────────
--
-- SELECT only — DML is revoked. Restricted to users who can view feedback
-- for the related branch. Slice 3 dashboard will add finer-grained ops view.
-- JOIN to feedbacks needed for branch scope — use EXISTS subquery.

CREATE POLICY "telegram_outbox_select" ON public.telegram_outbox
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.feedbacks f
      WHERE f.id = feedback_id
        AND f.tenant_id = public.auth_tenant_id()
        AND public.has_permission(f.branch_id, 'feedback:view')
    )
  );
