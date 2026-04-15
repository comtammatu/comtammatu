-- =============================================================
-- GL Auto-Posting: Phase 2.1 — supplier_payments table + RPC
-- Tracks actual cash/bank payments to suppliers.
-- Auto-posts: Dr 331 (Phải trả NCC) / Cr 111|112 (Cash|Bank)
-- =============================================================

-- ─── 1. supplier_payments table ───

CREATE TABLE public.supplier_payments (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id             BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_invoice_id   BIGINT NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE RESTRICT,
  payment_method        TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer')),
  amount                NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  payment_date          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reference_note        TEXT,
  journal_entry_id      BIGINT REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sp_tenant ON public.supplier_payments(tenant_id);
CREATE INDEX idx_sp_invoice ON public.supplier_payments(supplier_invoice_id);
CREATE INDEX idx_sp_journal ON public.supplier_payments(journal_entry_id) WHERE journal_entry_id IS NOT NULL;

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sp_select" ON public.supplier_payments
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

CREATE POLICY "sp_manage" ON public.supplier_payments
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_payments TO authenticated;

CREATE TRIGGER trg_sp_updated_at
  BEFORE UPDATE ON public.supplier_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();


-- ─── 2. create_supplier_payment RPC ───

CREATE OR REPLACE FUNCTION public.create_supplier_payment(
  p_tenant_id           BIGINT,
  p_supplier_invoice_id BIGINT,
  p_amount              NUMERIC(15,2),
  p_payment_method      TEXT,
  p_reference_note      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID := auth.uid();
  v_invoice         RECORD;
  v_payment_id      BIGINT;
  v_new_paid        NUMERIC(15,2);
  v_new_status      TEXT;
  v_journal_id      BIGINT;
  v_rule_code       TEXT;
  v_lines           JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF public.auth_role() NOT IN ('owner', 'super_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_payment_method NOT IN ('cash', 'bank_transfer') THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
  END IF;

  -- Lock invoice
  SELECT si.*
  INTO v_invoice
  FROM public.supplier_invoices si
  WHERE si.id = p_supplier_invoice_id AND si.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.payment_status = 'paid' THEN
    RAISE EXCEPTION 'invoice_already_paid' USING ERRCODE = 'P0001';
  END IF;

  -- Validate amount does not exceed remaining
  v_new_paid := COALESCE(v_invoice.paid_amount, 0) + p_amount;
  IF v_new_paid > v_invoice.total_amount THEN
    RAISE EXCEPTION 'payment_exceeds_invoice_total' USING ERRCODE = '22023';
  END IF;

  -- Determine new payment status
  IF v_new_paid >= v_invoice.total_amount THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'partial';
  END IF;

  -- Insert supplier payment
  INSERT INTO public.supplier_payments (
    tenant_id, supplier_invoice_id, payment_method, amount,
    payment_date, reference_note, created_by
  ) VALUES (
    p_tenant_id, p_supplier_invoice_id, p_payment_method, p_amount,
    now(), p_reference_note, v_uid
  )
  RETURNING id INTO v_payment_id;

  -- Update invoice payment tracking
  UPDATE public.supplier_invoices
  SET payment_status = v_new_status,
      paid_amount = v_new_paid,
      paid_at = CASE WHEN v_new_status = 'paid' THEN now() ELSE paid_at END,
      updated_at = now()
  WHERE id = p_supplier_invoice_id;

  -- ═══ AUTO-POST GL JOURNAL ═══
  v_rule_code := CASE WHEN p_payment_method = 'cash'
    THEN 'SUPPLIER_PAYMENT_CASH'
    ELSE 'SUPPLIER_PAYMENT_BANK'
  END;

  v_lines := jsonb_build_array(jsonb_build_object(
    'rule_code', v_rule_code,
    'amount', p_amount,
    'line_description', 'Thanh toán hóa đơn NCC #' || v_invoice.invoice_number
  ));

  v_journal_id := public.auto_post_journal(
    p_tenant_id,
    v_invoice.branch_id,
    'purchase',
    p_supplier_invoice_id,
    'Thanh toán NCC hóa đơn #' || COALESCE(v_invoice.invoice_number, v_invoice.id::text),
    v_lines,
    now(),
    v_uid
  );

  -- Link journal to payment
  IF v_journal_id IS NOT NULL THEN
    UPDATE public.supplier_payments
    SET journal_entry_id = v_journal_id
    WHERE id = v_payment_id;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'payment_status', v_new_status,
    'journal_entry_id', v_journal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_payment(BIGINT, BIGINT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_supplier_payment(BIGINT, BIGINT, NUMERIC, TEXT, TEXT) TO authenticated;
