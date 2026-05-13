-- =============================================================
-- HĐĐT PDF/XML archive — Path D foundation (audit 2026-05-13).
--
-- Adds:
--   1. tax_invoices columns: pdf_sha256, xml_sha256, archived_at,
--      archive_attempts, archive_last_error — track per-row archive
--      lifecycle without polluting provider_data.
--   2. Storage bucket 'hddt-archive' — PRIVATE (RLS-gated, signed-URL
--      only). 10-year legal retention (TT 78/2021 §10, NĐ 70/2025).
--      Authenticated SELECT scoped by tenant prefix + finance:view.
--      INSERT/UPDATE/DELETE service-role only (cron + admin actions).
--   3. archive_run_log — per-attempt audit table. Mirrors
--      reconcile_run_log shape but DISTINCT outcome enum.
--   4. Partial index on tax_invoices for cron candidate query.
--
-- pdf_url / xml_url columns already exist (migration 20260508053555);
-- semantic change: store STORAGE PATH (not URL). Signed URL minted
-- on demand server-side via createSignedUrl(path, 300). NEVER persist
-- signed URLs (they expire).
-- =============================================================

-- ─── 1. tax_invoices columns ───

ALTER TABLE public.tax_invoices
  ADD COLUMN pdf_sha256          TEXT,
  ADD COLUMN xml_sha256          TEXT,
  ADD COLUMN archived_at         TIMESTAMPTZ,
  ADD COLUMN archive_attempts    SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN archive_last_error  TEXT;

COMMENT ON COLUMN public.tax_invoices.pdf_url IS
  'Storage path within hddt-archive bucket (NOT a URL). Call createSignedUrl(path, 300) server-side to mint a 5-min signed URL for UI download. NULL until archive cron succeeds.';
COMMENT ON COLUMN public.tax_invoices.xml_url IS
  'Storage path within hddt-archive bucket (NOT a URL). Same semantics as pdf_url.';
COMMENT ON COLUMN public.tax_invoices.pdf_sha256 IS
  'SHA-256 hex digest of PDF bytes AT TIME OF DOWNLOAD from provider. NEVER overwrite — signature integrity proof for tax audit. Mismatch on re-download = corruption alert.';
COMMENT ON COLUMN public.tax_invoices.xml_sha256 IS
  'SHA-256 hex digest of XML bytes AT TIME OF DOWNLOAD. Same integrity rules as pdf_sha256.';
COMMENT ON COLUMN public.tax_invoices.archived_at IS
  'Set on successful archive (pdf_url + xml_url + both hashes populated). Used by candidate query: WHERE archived_at IS NULL.';
COMMENT ON COLUMN public.tax_invoices.archive_attempts IS
  'Incremented every reconcile attempt regardless of outcome. Giveup threshold = 5 attempts; manual backfill resets via admin action.';


-- ─── 2. Storage bucket hddt-archive (private) ───

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hddt-archive',
  'hddt-archive',
  false,                                                    -- PRIVATE
  10485760,                                                 -- 10 MB hard cap
  ARRAY['application/pdf', 'application/xml', 'text/xml']
)
ON CONFLICT (id) DO NOTHING;

-- SELECT: tenant-scoped + finance:view. Path layout enforced:
-- {tenant_id}/{yyyy}/{mm}/{tax_invoice_id}-{invoice_no}.{pdf|xml}
DROP POLICY IF EXISTS "hddt_archive_select" ON storage.objects;
CREATE POLICY "hddt_archive_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'hddt-archive'
    AND (storage.foldername(name))[1] = public.auth_tenant_id()::TEXT
    AND public.has_permission_any('finance:view')
  );

-- INSERT/UPDATE/DELETE: NO policy for authenticated.
-- Service-role bypasses RLS, so cron + admin actions can write.
-- This is intentional — UI never writes to this bucket directly.


-- ─── 3. archive_run_log ───

CREATE TABLE public.archive_run_log (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id            BIGINT NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  branch_id            BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  tax_invoice_id       BIGINT NOT NULL REFERENCES public.tax_invoices(id) ON DELETE CASCADE,
  trigger_source       TEXT   NOT NULL CHECK (trigger_source IN ('cron', 'manual', 'backfill')),
  triggered_by         UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  outcome              TEXT   NOT NULL CHECK (outcome IN (
    'archived',
    'no_change',
    'provider_error',
    'storage_error',
    'invalid_payload',
    'hash_mismatch',
    'giveup'
  )),
  pdf_bytes            INTEGER NULL,
  xml_bytes            INTEGER NULL,
  pdf_sha256           TEXT NULL,
  xml_sha256           TEXT NULL,
  attempt_number       SMALLINT NOT NULL,
  error                TEXT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_arl_invoice_recent
  ON public.archive_run_log (tax_invoice_id, created_at DESC);
CREATE INDEX idx_arl_tenant_recent
  ON public.archive_run_log (tenant_id, created_at DESC);
CREATE INDEX idx_arl_failure
  ON public.archive_run_log (tenant_id, outcome, created_at DESC)
  WHERE outcome IN ('provider_error', 'storage_error', 'invalid_payload', 'hash_mismatch', 'giveup');

ALTER TABLE public.archive_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "arl_select" ON public.archive_run_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id()
         AND public.has_permission_any('finance:view'));

GRANT SELECT ON public.archive_run_log TO authenticated;
-- INSERT only via service-role client.

COMMENT ON TABLE public.archive_run_log IS
  'Per-attempt audit for HĐĐT PDF/XML archive cron + manual triggers. outcome=archived means pdf_url+xml_url+hashes persisted to tax_invoices; storage_error = Storage upload failed; invalid_payload = magic byte or size check failed; hash_mismatch = re-download yielded different bytes (corruption alert); giveup = archive_attempts >= 5, manual review needed.';

COMMENT ON COLUMN public.archive_run_log.attempt_number IS
  'Snapshot of tax_invoices.archive_attempts at the time of the attempt. Eases forensic queries vs joining back to tax_invoices.';


-- ─── 4. Partial index on tax_invoices for archive candidates ───

-- Archive cron query: WHERE status='issued' AND pdf_url IS NULL
--                      AND archive_attempts < 5
-- Partial index excludes terminal-archived rows + draft/signing/cancelled.
CREATE INDEX idx_tax_invoices_archive_pending
  ON public.tax_invoices (branch_id, issued_at ASC)
  WHERE status = 'issued'
    AND pdf_url IS NULL
    AND archive_attempts < 5;

COMMENT ON INDEX public.idx_tax_invoices_archive_pending IS
  'Archive cron hot path. Partial WHERE excludes already-archived + non-issued. Ordered ASC so oldest-first dequeue. archive_attempts < 5 caps retry count.';
