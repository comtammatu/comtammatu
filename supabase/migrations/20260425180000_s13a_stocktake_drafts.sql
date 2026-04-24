-- =============================================================
-- S13a Foundation — stocktake_drafts for auto-save resume
--
-- Enables 30s client-side auto-save so counter staff can resume
-- a session after browser crash / JWT refresh. Spec §Q2 + QA gap.
--
-- 1 row per session — counter data JSONB map
-- `{ ingredient_id: { qty, note, savedAt } }`.
-- Wiped on session finalize (CASCADE from parent session).
--
-- Spec: docs/plan/inventory-ui-wiring.md S13a
-- =============================================================

CREATE TABLE IF NOT EXISTS public.stocktake_drafts (
  session_id    BIGINT PRIMARY KEY REFERENCES public.stocktake_sessions(id) ON DELETE CASCADE,
  draft_counts  JSONB NOT NULL DEFAULT '{}',
  last_saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  saved_by      UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE public.stocktake_drafts IS
  'Counter auto-save draft (S13a). 30s heartbeat stash — never authoritative. On finalize the draft is discarded. Multiple counters on a zone-locked session write separately via zone_id partition inside draft_counts JSONB if ever needed.';

ALTER TABLE public.stocktake_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stocktake_drafts_read_session_branch"
  ON public.stocktake_drafts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stocktake_sessions ss
      WHERE ss.id = stocktake_drafts.session_id
        AND ss.tenant_id = public.auth_tenant_id()
        AND public.has_permission(ss.branch_id, 'inventory:stocktake_create')
    )
  );

CREATE POLICY "stocktake_drafts_write_session_branch"
  ON public.stocktake_drafts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stocktake_sessions ss
      WHERE ss.id = stocktake_drafts.session_id
        AND ss.tenant_id = public.auth_tenant_id()
        AND public.has_permission(ss.branch_id, 'inventory:stocktake_create')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stocktake_sessions ss
      WHERE ss.id = stocktake_drafts.session_id
        AND ss.tenant_id = public.auth_tenant_id()
        AND public.has_permission(ss.branch_id, 'inventory:stocktake_create')
    )
  );

CREATE INDEX IF NOT EXISTS idx_stocktake_drafts_saved_at
  ON public.stocktake_drafts (last_saved_at DESC);
