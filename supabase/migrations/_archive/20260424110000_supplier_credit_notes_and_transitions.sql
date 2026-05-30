-- =============================================================
-- Supplier credit notes + supplier_returns transition RPC
--
-- When a supplier_return reaches status='credited' (resolution=credit_note)
-- or 'refunded' (resolution=cash_refund), a supplier_credit_notes row is
-- auto-created so finance has a tracking record of what is owed back to us.
--
-- Application of a credit note against a specific supplier_invoice is left
-- as a manual step (similar to 3-way invoice matching) — surfaced in the AP
-- workspace via the supplier_credit_notes table.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.supplier_credit_notes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id     BIGINT NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  return_id       BIGINT NOT NULL REFERENCES public.supplier_returns(id) ON DELETE CASCADE,
  invoice_id      BIGINT REFERENCES public.supplier_invoices(id) ON DELETE SET NULL,
  credit_number   TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('credit_note', 'cash_refund')),
  amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'applied', 'cancelled')),
  applied_amount  NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (applied_amount >= 0),
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at      TIMESTAMPTZ,

  UNIQUE (credit_number, tenant_id),
  -- One credit note per return (idempotent generation)
  UNIQUE (return_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_credit_notes_tenant   ON public.supplier_credit_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_notes_supplier ON public.supplier_credit_notes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_notes_status   ON public.supplier_credit_notes(status);

ALTER TABLE public.supplier_credit_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_credit_notes_select" ON public.supplier_credit_notes;
CREATE POLICY "supplier_credit_notes_select" ON public.supplier_credit_notes
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'procurement:read')
  );

GRANT SELECT ON TABLE public.supplier_credit_notes TO authenticated;

-- ─── RPC: transition_supplier_return ───
-- Move return.status forward: draft → sent → credited / refunded / cancelled.
-- Credit/refund auto-creates a supplier_credit_notes row.
CREATE OR REPLACE FUNCTION public.transition_supplier_return(
  p_return_id     BIGINT,
  p_target_status TEXT,
  p_notes         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid       UUID   := auth.uid();
  v_tenant    BIGINT := public.auth_tenant_id();
  v_ret       RECORD;
  v_credit_id BIGINT;
  v_credit_no TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_target_status NOT IN ('credited', 'refunded', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_target_status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_ret
  FROM public.supplier_returns
  WHERE id = p_return_id AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'return_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Permission: confirm-grade for credit/refund (impacts AP); confirm-grade for cancel too
  IF NOT public.has_permission(v_ret.branch_id, 'supplier_return:confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- State transition rules
  IF p_target_status = 'cancelled' AND v_ret.status NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'cannot_cancel_after_credit' USING ERRCODE = '22023';
  END IF;
  IF p_target_status IN ('credited', 'refunded') AND v_ret.status <> 'sent' THEN
    RAISE EXCEPTION 'must_be_sent_before_credit' USING ERRCODE = '22023';
  END IF;
  IF p_target_status = 'credited' AND v_ret.resolution <> 'credit_note' THEN
    RAISE EXCEPTION 'resolution_mismatch_credit' USING ERRCODE = '22023';
  END IF;
  IF p_target_status = 'refunded' AND v_ret.resolution <> 'cash_refund' THEN
    RAISE EXCEPTION 'resolution_mismatch_refund' USING ERRCODE = '22023';
  END IF;

  -- Move state
  UPDATE public.supplier_returns
  SET status = p_target_status,
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_return_id;

  -- Auto-create supplier_credit_note for credited/refunded
  IF p_target_status IN ('credited', 'refunded') THEN
    v_credit_no := 'CN-' || to_char(now(),'YYMMDD') || '-' ||
                   lpad(nextval('public.supplier_credit_notes_id_seq')::TEXT, 4, '0');

    INSERT INTO public.supplier_credit_notes (
      tenant_id, supplier_id, return_id, credit_number,
      kind, amount, status, notes, created_by, applied_at
    ) VALUES (
      v_tenant, v_ret.supplier_id, p_return_id, v_credit_no,
      CASE WHEN p_target_status = 'credited' THEN 'credit_note' ELSE 'cash_refund' END,
      v_ret.total_value,
      CASE WHEN p_target_status = 'refunded' THEN 'applied' ELSE 'open' END,
      p_notes,
      v_uid,
      CASE WHEN p_target_status = 'refunded' THEN now() ELSE NULL END
    )
    ON CONFLICT (return_id, tenant_id) DO NOTHING
    RETURNING id INTO v_credit_id;
  END IF;

  RETURN jsonb_build_object(
    'return_id', p_return_id,
    'status', p_target_status,
    'credit_note_id', v_credit_id,
    'credit_number', v_credit_no
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_supplier_return(BIGINT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_supplier_return(BIGINT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.transition_supplier_return(BIGINT, TEXT, TEXT) IS
  'Transitions supplier_returns.status from sent → credited|refunded|cancelled. For credited/refunded, auto-inserts a supplier_credit_notes row (idempotent on return_id).';
