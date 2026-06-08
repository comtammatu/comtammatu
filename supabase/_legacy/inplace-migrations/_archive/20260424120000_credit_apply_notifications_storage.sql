-- =============================================================
-- 3 follow-ups in one migration:
--   1. AP credit-note apply: ALTER supplier_invoices + RPC
--   2. Notification outbox + grn_items requires_review trigger + alert webhook URL
--   3. Storage bucket + RLS for inventory attachments (rejection / variance photos)
-- =============================================================

-- ─── 1. AP credit_note apply ───
ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS credit_applied_amount NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (credit_applied_amount >= 0);

COMMENT ON COLUMN public.supplier_invoices.credit_applied_amount IS
  'Sum of supplier_credit_notes applied against this invoice. Effective AP balance = total_amount - paid_amount - credit_applied_amount.';

CREATE OR REPLACE FUNCTION public.apply_credit_note_to_invoice(
  p_credit_id  BIGINT,
  p_invoice_id BIGINT,
  p_amount     NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid     UUID   := auth.uid();
  v_tenant  BIGINT := public.auth_tenant_id();
  v_credit  RECORD;
  v_invoice RECORD;
  v_remaining_credit  NUMERIC(15,2);
  v_remaining_invoice NUMERIC(15,2);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(NULL, 'finance:ap_pay') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_credit
  FROM public.supplier_credit_notes
  WHERE id = p_credit_id AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_credit.status NOT IN ('open') THEN
    RAISE EXCEPTION 'credit_not_open' USING ERRCODE = '22023';
  END IF;
  IF v_credit.kind <> 'credit_note' THEN
    RAISE EXCEPTION 'credit_kind_mismatch' USING ERRCODE = '22023',
      DETAIL = 'Only credit_note kind can be applied to invoices; cash_refund is closed at issuance.';
  END IF;

  SELECT * INTO v_invoice
  FROM public.supplier_invoices
  WHERE id = p_invoice_id AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Same supplier guard
  IF v_invoice.supplier_id <> v_credit.supplier_id THEN
    RAISE EXCEPTION 'supplier_mismatch' USING ERRCODE = '22023';
  END IF;

  v_remaining_credit  := v_credit.amount - v_credit.applied_amount;
  v_remaining_invoice := v_invoice.total_amount
                       - COALESCE(v_invoice.paid_amount, 0)
                       - COALESCE(v_invoice.credit_applied_amount, 0);

  IF p_amount > v_remaining_credit THEN
    RAISE EXCEPTION 'amount_exceeds_credit' USING ERRCODE = '22023',
      DETAIL = format('credit_remaining=%s', v_remaining_credit);
  END IF;
  IF p_amount > v_remaining_invoice THEN
    RAISE EXCEPTION 'amount_exceeds_invoice' USING ERRCODE = '22023',
      DETAIL = format('invoice_remaining=%s', v_remaining_invoice);
  END IF;

  -- Apply
  UPDATE public.supplier_credit_notes
  SET applied_amount = applied_amount + p_amount,
      invoice_id = COALESCE(invoice_id, p_invoice_id),
      status = CASE
        WHEN applied_amount + p_amount >= amount THEN 'applied'
        ELSE 'open'
      END,
      applied_at = CASE
        WHEN applied_amount + p_amount >= amount THEN now()
        ELSE applied_at
      END
  WHERE id = p_credit_id;

  UPDATE public.supplier_invoices
  SET credit_applied_amount = COALESCE(credit_applied_amount, 0) + p_amount,
      updated_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'credit_id', p_credit_id,
    'invoice_id', p_invoice_id,
    'amount_applied', p_amount,
    'credit_remaining', v_remaining_credit - p_amount,
    'invoice_remaining', v_remaining_invoice - p_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_credit_note_to_invoice(BIGINT, BIGINT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_credit_note_to_invoice(BIGINT, BIGINT, NUMERIC) TO authenticated;

-- ─── 2. Notification outbox ───
ALTER TABLE public.inventory_qc_settings
  ADD COLUMN IF NOT EXISTS alert_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS alert_channel     TEXT
    DEFAULT 'generic' CHECK (alert_channel IN ('generic', 'telegram', 'discord', 'slack'));

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL DEFAULT 'inventory'
    CHECK (channel IN ('inventory', 'finance', 'ops')),
  topic        TEXT NOT NULL,
  payload      JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  retries      INT NOT NULL DEFAULT 0,
  last_error   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending
  ON public.notification_outbox(tenant_id, created_at)
  WHERE status = 'pending';

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_outbox_select" ON public.notification_outbox;
CREATE POLICY "notification_outbox_select" ON public.notification_outbox
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'settings:tenant')
  );

GRANT SELECT, UPDATE ON TABLE public.notification_outbox TO authenticated;

-- Trigger: when grn_items.requires_review becomes TRUE, queue an alert.
CREATE OR REPLACE FUNCTION public.trg_grn_requires_review_outbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_grn        RECORD;
  v_ingredient RECORD;
BEGIN
  IF NEW.requires_review IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.requires_review IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT g.id, g.grn_number, g.supplier_id, g.branch_id, s.name AS supplier_name, b.name AS branch_name
  INTO v_grn
  FROM public.goods_received_notes g
  LEFT JOIN public.suppliers s ON s.id = g.supplier_id
  LEFT JOIN public.branches b ON b.id = g.branch_id
  WHERE g.id = NEW.grn_id AND g.tenant_id = NEW.tenant_id;

  SELECT id, name, unit INTO v_ingredient
  FROM public.ingredients
  WHERE id = NEW.ingredient_id AND tenant_id = NEW.tenant_id;

  INSERT INTO public.notification_outbox (tenant_id, channel, topic, payload)
  VALUES (
    NEW.tenant_id,
    'inventory',
    'grn.requires_review',
    jsonb_build_object(
      'grn_id', v_grn.id,
      'grn_number', v_grn.grn_number,
      'branch_id', v_grn.branch_id,
      'branch_name', v_grn.branch_name,
      'supplier_id', v_grn.supplier_id,
      'supplier_name', v_grn.supplier_name,
      'ingredient_id', v_ingredient.id,
      'ingredient_name', v_ingredient.name,
      'unit', v_ingredient.unit,
      'po_unit_price', NEW.po_unit_price,
      'unit_cost', NEW.unit_cost,
      'price_variance_pct', NEW.price_variance_pct,
      'override_note', NEW.price_override_note
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grn_items_requires_review_outbox ON public.grn_items;
CREATE TRIGGER trg_grn_items_requires_review_outbox
  AFTER INSERT OR UPDATE OF requires_review ON public.grn_items
  FOR EACH ROW
  WHEN (NEW.requires_review IS TRUE)
  EXECUTE FUNCTION public.trg_grn_requires_review_outbox();

-- Same trigger for newly created supplier_returns (operations alert)
CREATE OR REPLACE FUNCTION public.trg_supplier_return_outbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_supplier_name TEXT;
  v_branch_name   TEXT;
BEGIN
  SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = NEW.supplier_id;
  SELECT name INTO v_branch_name FROM public.branches WHERE id = NEW.branch_id;

  INSERT INTO public.notification_outbox (tenant_id, channel, topic, payload)
  VALUES (
    NEW.tenant_id,
    'inventory',
    'supplier_return.created',
    jsonb_build_object(
      'return_id', NEW.id,
      'return_number', NEW.return_number,
      'supplier_name', v_supplier_name,
      'branch_name', v_branch_name,
      'reason', NEW.reason,
      'resolution', NEW.resolution,
      'source', NEW.source,
      'total_value', NEW.total_value
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_returns_outbox ON public.supplier_returns;
CREATE TRIGGER trg_supplier_returns_outbox
  AFTER INSERT ON public.supplier_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_supplier_return_outbox();

-- ─── 3. Storage bucket: inventory-attachments ───
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inventory-attachments',
  'inventory-attachments',
  true,  -- public read for shareable URLs (paths still tenant-scoped via prefix)
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS on storage.objects: write requires inventory perm + tenant prefix; public read.
DROP POLICY IF EXISTS "inv_attach_insert" ON storage.objects;
CREATE POLICY "inv_attach_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'inventory-attachments'
    AND (storage.foldername(name))[1] = public.auth_tenant_id()::TEXT
    AND (
      public.has_permission(NULL, 'procurement:grn_create')
      OR public.has_permission(NULL, 'supplier_return:create')
      OR public.has_permission(NULL, 'inventory:writeoff')
    )
  );

DROP POLICY IF EXISTS "inv_attach_update" ON storage.objects;
CREATE POLICY "inv_attach_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'inventory-attachments'
    AND (storage.foldername(name))[1] = public.auth_tenant_id()::TEXT
  )
  WITH CHECK (
    bucket_id = 'inventory-attachments'
    AND (storage.foldername(name))[1] = public.auth_tenant_id()::TEXT
  );

DROP POLICY IF EXISTS "inv_attach_delete" ON storage.objects;
CREATE POLICY "inv_attach_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'inventory-attachments'
    AND (storage.foldername(name))[1] = public.auth_tenant_id()::TEXT
  );

-- public read policy: bucket is public, but explicit policy for clarity
DROP POLICY IF EXISTS "inv_attach_read" ON storage.objects;
CREATE POLICY "inv_attach_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'inventory-attachments');
