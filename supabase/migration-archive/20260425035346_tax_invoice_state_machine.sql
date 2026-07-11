-- =============================================================
-- M6 Branch A — HĐĐT state machine + audit events + idempotency
-- =============================================================
-- Hardens tax_invoices for real MISA wiring (Plan A v1):
-- 1. UNIQUE partial constraint blocks duplicate active invoice per order
--    when cashier double-clicks "Xuất hóa đơn" (regression: existing
--    `maybeSingle()` check is racy without DB-level enforcement).
-- 2. `signing_started_at` column tracks orphan recovery candidates —
--    when status='signing' for > 10 min, a future reconcile job can
--    poll provider getStatus() and resolve to issued/draft.
-- 3. `tax_invoice_events` table is the immutable transition log so
--    `cancelTaxInvoice` no longer overwrites the original MISA payload
--    in `provider_data` (the cancel receipt is logged separately).
-- 4. `transition_tax_invoice_state` RPC enforces the allowed-transition
--    matrix server-side — clients can no longer flip status arbitrarily.
--    Allowed transitions:
--       draft     → signing, cancelled
--       signing   → submitted, issued, draft (retry on fail), cancelled
--       submitted → issued, cancelled
--       issued    → cancelled, replaced
--       cancelled → (terminal)
--       replaced  → (terminal)
--
-- Note: We do NOT seed a SALE_VAT_OUT posting rule. The POS sale path
-- already auto-posts revenue 511 + VAT 33311 via create_order → auto_post_journal,
-- so duplicating the JE on tax invoice issuance would double-count. HĐĐT is
-- documentary (CQT submission) — not a separate accounting event.

-- ─── 1. Schema additions ───

ALTER TABLE public.tax_invoices
  ADD COLUMN IF NOT EXISTS signing_started_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_invoices_active_per_order
  ON public.tax_invoices (order_id)
  WHERE status NOT IN ('cancelled', 'replaced');


-- ─── 2. Audit events table ───

CREATE TABLE public.tax_invoice_events (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tax_invoice_id  BIGINT NOT NULL REFERENCES public.tax_invoices(id) ON DELETE RESTRICT,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_status     TEXT,
  to_status       TEXT NOT NULL,
  actor_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  payload         JSONB,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tie_invoice ON public.tax_invoice_events (tax_invoice_id, created_at DESC);
CREATE INDEX idx_tie_tenant_created ON public.tax_invoice_events (tenant_id, created_at DESC);

ALTER TABLE public.tax_invoice_events ENABLE ROW LEVEL SECURITY;

-- Read: any staff with finance:view permission, scoped to tenant
CREATE POLICY "tie_select" ON public.tax_invoice_events
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:view')
  );

-- No direct INSERT/UPDATE/DELETE — only via SECURITY DEFINER RPC
GRANT SELECT ON TABLE public.tax_invoice_events TO authenticated;


-- ─── 3. State transition RPC ───

CREATE OR REPLACE FUNCTION public.transition_tax_invoice_state(
  p_tax_invoice_id BIGINT,
  p_to_status      TEXT,
  p_payload        JSONB DEFAULT NULL,
  p_note           TEXT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice  RECORD;
  v_uid      UUID := auth.uid();
  v_allowed  BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Lock invoice row to prevent concurrent transitions
  SELECT * INTO v_invoice
  FROM public.tax_invoices
  WHERE id = p_tax_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.tenant_id <> public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  -- Permission: cancel/replace require finance approval (owner/super_manager);
  -- everything else (draft → signing → submitted → issued) is the cashier flow
  -- and uses orders:write permission.
  IF p_to_status IN ('cancelled', 'replaced') THEN
    IF NOT public.has_permission_any('settings:tenant') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_permission_any('orders:write') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Allowed transition matrix
  v_allowed := (
    (v_invoice.status = 'draft'     AND p_to_status IN ('signing', 'cancelled'))
    OR (v_invoice.status = 'signing'   AND p_to_status IN ('submitted', 'issued', 'draft', 'cancelled'))
    OR (v_invoice.status = 'submitted' AND p_to_status IN ('issued', 'cancelled'))
    OR (v_invoice.status = 'issued'    AND p_to_status IN ('cancelled', 'replaced'))
  );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'illegal_transition: % -> %', v_invoice.status, p_to_status
      USING ERRCODE = '22023';
  END IF;

  -- Apply transition. provider_data accumulates per-state snapshots via
  -- coalesce/concat so old MISA payloads are not destroyed by cancel.
  UPDATE public.tax_invoices
  SET
    status = p_to_status,
    issued_at = CASE WHEN p_to_status = 'issued' THEN now() ELSE issued_at END,
    cancelled_at = CASE WHEN p_to_status = 'cancelled' THEN now() ELSE cancelled_at END,
    signing_started_at = CASE WHEN p_to_status = 'signing' THEN now() ELSE signing_started_at END,
    provider_data = CASE
      WHEN p_payload IS NULL THEN provider_data
      WHEN provider_data IS NULL THEN p_payload
      ELSE provider_data || p_payload
    END,
    updated_at = now()
  WHERE id = p_tax_invoice_id;

  -- Append audit event
  INSERT INTO public.tax_invoice_events
    (tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note)
  VALUES
    (p_tax_invoice_id, v_invoice.tenant_id, v_invoice.status, p_to_status, v_uid, p_payload, p_note);

  RETURN jsonb_build_object(
    'tax_invoice_id', p_tax_invoice_id,
    'from_status', v_invoice.status,
    'to_status', p_to_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_tax_invoice_state(BIGINT, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_tax_invoice_state(BIGINT, TEXT, JSONB, TEXT) TO authenticated;
