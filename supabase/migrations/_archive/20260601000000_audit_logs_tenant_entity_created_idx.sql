-- =============================================================
-- Composite index for audit_logs hot-path query.
-- Driver: 4-agent security audit 2026-05-07 — admin audit reader
-- (`apps/web/app/admin/_lib/audit.ts#fetchAuditLogs`,
-- `apps/web/app/admin/staff/audit/page.tsx`) filters by
-- `tenant_id + entity_type` ordered by `created_at DESC`. Existing
-- single-column indexes (`idx_audit_logs_tenant`,
-- `idx_audit_logs_entity (entity_type, entity_id)`,
-- `idx_audit_logs_created (created_at DESC)`) force a planner merge.
--
-- Composite `(tenant_id, entity_type, created_at DESC)` covers the
-- list query in one index scan.
--
-- DROP redundant `idx_audit_logs_tenant` — fully covered by the
-- new composite (left-prefix match). KEEP `idx_audit_logs_entity`
-- (covers `entity_type + entity_id` lookups) and
-- `idx_audit_logs_created` (covers global `created_at` ordering
-- inside RPC bodies).
--
-- Plain CREATE INDEX (not CONCURRENTLY) — Supabase migration runs
-- inside a transaction wrapper which is incompatible with
-- CONCURRENTLY. AccessExclusive lock on `audit_logs` is brief and
-- acceptable pre-pilot. When prod traffic exists, swap to
-- CONCURRENTLY in a manual `psql` apply.
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_entity_created
  ON public.audit_logs (tenant_id, entity_type, created_at DESC);

DROP INDEX IF EXISTS public.idx_audit_logs_tenant;

COMMENT ON INDEX public.idx_audit_logs_tenant_entity_created IS
  'Hot path for /admin/staff/audit list (tenant_id + entity_type filter, created_at DESC sort). Supersedes idx_audit_logs_tenant.';
