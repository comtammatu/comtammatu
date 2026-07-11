-- =============================================================
-- HĐĐT reconcile cron — Path B foundation (audit 2026-05-13).
--
-- Adds:
--   1. reconcile_run_log table — per-row per-attempt audit trail.
--      Distinct from summary_run_queue (which tracks daily batch
--      runs); reconcile is per-invoice polling so a row-per-attempt
--      shape fits better than a queue-per-(branch,date) shape.
--   2. Partial index on tax_invoices for pollable rows so reconcile
--      query stays O(stuck rows) not O(all invoices).
--
-- No behavior change at apply time — cron route + action layer ship
-- behind feature flag HDDT_RECONCILE_ENABLED (default false).
-- =============================================================

-- ─── 1. reconcile_run_log ───

CREATE TABLE public.reconcile_run_log (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id            BIGINT NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  branch_id            BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  tax_invoice_id       BIGINT NOT NULL REFERENCES public.tax_invoices(id) ON DELETE CASCADE,
  trigger_source       TEXT   NOT NULL CHECK (trigger_source IN ('cron', 'manual')),
  triggered_by         UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  before_status        TEXT   NOT NULL,
  after_status         TEXT   NULL,
  provider_returned    TEXT   NULL,
  outcome              TEXT   NOT NULL CHECK (outcome IN (
    'transitioned', 'no_change', 'race_lost',
    'provider_error', 'unknown_status', 'giveup_24h'
  )),
  error                TEXT   NULL,
  attempt_age_seconds  INTEGER NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rrl_invoice_recent
  ON public.reconcile_run_log (tax_invoice_id, created_at DESC);
CREATE INDEX idx_rrl_tenant_recent
  ON public.reconcile_run_log (tenant_id, created_at DESC);
CREATE INDEX idx_rrl_outcome
  ON public.reconcile_run_log (tenant_id, outcome, created_at DESC)
  WHERE outcome IN ('provider_error', 'giveup_24h', 'unknown_status');

ALTER TABLE public.reconcile_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rrl_select" ON public.reconcile_run_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id()
         AND public.has_permission_any('finance:view'));

GRANT SELECT ON public.reconcile_run_log TO authenticated;
-- INSERT only via service-role client (cron + manual action use service client).

COMMENT ON TABLE public.reconcile_run_log IS
  'Per-attempt audit for HĐĐT reconcile cron + manual force-resync. 1 row per (invoice, attempt). Distinct from summary_run_queue (batch-run scoped). outcome=transitioned means state machine RPC succeeded; race_lost = RPC raised illegal_transition (22023); provider_error = getStatus threw or returned error envelope; unknown_status = provider returned a code not in our matrix; giveup_24h = stuck >24h, forced to cancelled.';

COMMENT ON COLUMN public.reconcile_run_log.attempt_age_seconds IS
  'now() - signing_started_at at attempt time. Drives giveup threshold (>86400s = 24h forces cancel).';

COMMENT ON COLUMN public.reconcile_run_log.provider_returned IS
  'Internal-state mapping of provider response (issued|submitted|cancelled|replaced|draft|error|null). NULL when call did not fire (e.g., race_lost on pre-check).';


-- ─── 2. Partial index on tax_invoices for pollable rows ───

-- Reconcile query: WHERE provider_ref IS NOT NULL
--                  AND status IN ('signing','submitted')
--                  AND signing_started_at < NOW() - INTERVAL '60s'
-- Partial index keeps it tiny (terminal rows + drafts + not_required excluded).
CREATE INDEX idx_tax_invoices_reconcile_pending
  ON public.tax_invoices (branch_id, signing_started_at ASC)
  WHERE status IN ('signing', 'submitted')
    AND provider_ref IS NOT NULL;

COMMENT ON INDEX public.idx_tax_invoices_reconcile_pending IS
  'Reconcile cron hot path. Partial WHERE excludes terminal (cancelled/replaced/issued/not_required) and drafts (no provider call yet). Ordered ASC so oldest-first dequeue.';
