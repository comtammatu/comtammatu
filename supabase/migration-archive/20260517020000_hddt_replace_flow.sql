-- =============================================================
-- HĐĐT Replace flow — Path C foundation (audit 2026-05-13).
--
-- TT78/2021 §7 + NĐ 70/2025: thay thế hóa đơn khi có sai sót
-- (sai MST, tên, địa chỉ, số tiền...). Provider gọi cùng
-- createInvoice endpoint với adjustmentType=3 + original refs.
--
-- Adds:
--   1. tax_invoices.replaced_for BIGINT — NEW row pointer to OLD
--      (forensic forward link; balance to existing replaced_by which
--      points OLD → NEW). ON DELETE RESTRICT: chain integrity.
--   2. replace_tax_invoice SECURITY DEFINER RPC — atomic dual
--      transition: flip OLD status='replaced', INSERT NEW draft,
--      link both via replaced_by/replaced_for, write events. ALL in
--      single Postgres tx — no window of illegal "both issued" state.
--   3. Chain depth guard: max 3 levels (replace-of-replace allowed
--      but capped to prevent runaway chains).
--
-- MVP scope (per 4-agent debate 2026-05-13):
--   - B2B per_order only (B2C summary replace deferred to v2)
--   - REPLACE only (adjustmentType=3); ADJUST flow (5) deferred
--   - Permission gate: settings:tenant (mirror cancel)
-- =============================================================

-- ─── 1. tax_invoices.replaced_for column ───

ALTER TABLE public.tax_invoices
  ADD COLUMN replaced_for BIGINT REFERENCES public.tax_invoices(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.tax_invoices.replaced_for IS
  'NEW-row pointer to OLD row in a TT78 §7 replace chain. NULL for originals. Balance to existing replaced_by (OLD→NEW); together they form a doubly-linked chain. ON DELETE RESTRICT ensures chain integrity (cannot hard-delete a row that other rows reference).';

CREATE INDEX idx_tax_invoices_replaced_for
  ON public.tax_invoices (replaced_for)
  WHERE replaced_for IS NOT NULL;


-- ─── 2. replace_tax_invoice RPC ───

-- SECURITY DEFINER + user-permission gated (NOT service-role).
-- Atomic dual transition: locks OLD, validates eligibility,
-- INSERTs NEW draft, flips OLD → replaced, writes events.
-- Provider call happens AFTER this RPC returns — separate
-- concern (apps/web/app/finance/actions.ts::replaceTaxInvoice).
CREATE OR REPLACE FUNCTION public.replace_tax_invoice(
  p_old_id          BIGINT,
  p_reason          TEXT,
  p_agreement_ref   TEXT,
  p_agreement_date  TIMESTAMPTZ,
  p_buyer_name      TEXT,
  p_buyer_tax_code  TEXT,
  p_buyer_address   TEXT,
  p_subtotal        NUMERIC(15,2),
  p_vat_rate        NUMERIC(5,2),
  p_vat_amount      NUMERIC(15,2),
  p_total_amount    NUMERIC(15,2),
  p_provider        TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old        RECORD;
  v_actor      UUID;
  v_new_id     BIGINT;
  v_chain_depth INTEGER;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'forbidden_no_auth' USING ERRCODE = '42501';
  END IF;

  -- Reason min length mirrors HDDT-CANCEL-REASON-MIN-20.
  IF p_reason IS NULL OR length(trim(p_reason)) < 20 THEN
    RAISE EXCEPTION 'reason_too_short' USING ERRCODE = '23514';
  END IF;
  IF length(p_reason) > 255 THEN
    RAISE EXCEPTION 'reason_too_long' USING ERRCODE = '23514';
  END IF;

  -- additionalReferenceDesc max from Viettel HDSD §III.2 line 710.
  IF p_agreement_ref IS NULL OR length(trim(p_agreement_ref)) = 0 THEN
    RAISE EXCEPTION 'agreement_ref_required' USING ERRCODE = '23514';
  END IF;
  IF length(p_agreement_ref) > 225 THEN
    RAISE EXCEPTION 'agreement_ref_too_long' USING ERRCODE = '23514';
  END IF;

  -- Lock OLD row, validate eligibility.
  SELECT * INTO v_old
  FROM public.tax_invoices
  WHERE id = p_old_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_old.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'permission_denied_settings_tenant' USING ERRCODE = '42501';
  END IF;

  IF v_old.status IS DISTINCT FROM 'issued' THEN
    RAISE EXCEPTION 'only_issued_can_be_replaced' USING ERRCODE = '22023';
  END IF;

  IF v_old.replaced_by IS NOT NULL THEN
    RAISE EXCEPTION 'already_replaced' USING ERRCODE = '22023';
  END IF;

  -- MVP: B2B per_order only (B2C summary deferred to v2).
  IF v_old.invoice_kind IS DISTINCT FROM 'per_order' THEN
    RAISE EXCEPTION 'b2c_summary_replace_not_supported' USING ERRCODE = '0A000';
  END IF;

  -- Agreement date sanity: must NOT be in future, must NOT precede
  -- old.issued_at (logically impossible to agree before issuance).
  IF p_agreement_date > now() THEN
    RAISE EXCEPTION 'agreement_date_in_future' USING ERRCODE = '22008';
  END IF;
  IF v_old.issued_at IS NOT NULL AND p_agreement_date < v_old.issued_at THEN
    RAISE EXCEPTION 'agreement_date_before_issued_at' USING ERRCODE = '22008';
  END IF;

  -- Chain depth check: count how many replacements precede this one.
  -- Walk replaced_for backwards. Cap at 3 levels to prevent runaway.
  WITH RECURSIVE chain AS (
    SELECT id, replaced_for, 1 AS depth
    FROM public.tax_invoices
    WHERE id = p_old_id
    UNION ALL
    SELECT t.id, t.replaced_for, c.depth + 1
    FROM public.tax_invoices t
    JOIN chain c ON t.id = c.replaced_for
    WHERE c.depth < 10  -- safety bound on recursion
  )
  SELECT MAX(depth) INTO v_chain_depth FROM chain;

  IF v_chain_depth >= 3 THEN
    RAISE EXCEPTION 'replacement_chain_too_deep_max_3' USING ERRCODE = '22023';
  END IF;

  -- STEP A: Flip OLD to 'replaced' FIRST. This removes it from
  -- uq_tax_invoices_active_per_order partial index (excludes
  -- 'cancelled','replaced','not_required'), opening the slot for
  -- the NEW draft INSERT below without 23505 collision.
  UPDATE public.tax_invoices
  SET status = 'replaced',
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_old_id;

  -- STEP B: INSERT NEW draft. Copies order_id + branch_id + tenant
  -- from old; buyer/amounts from caller (caller passes corrected
  -- payload). Sets replaced_for=old.id.
  INSERT INTO public.tax_invoices (
    tenant_id, branch_id, order_id,
    status, invoice_kind,
    buyer_name, buyer_tax_code, buyer_address,
    subtotal, vat_rate, vat_amount, total_amount,
    provider, provider_data,
    replaced_for,
    created_by
  )
  VALUES (
    v_old.tenant_id, v_old.branch_id, v_old.order_id,
    'draft', 'per_order',
    p_buyer_name, p_buyer_tax_code, p_buyer_address,
    p_subtotal, p_vat_rate, p_vat_amount, p_total_amount,
    p_provider,
    jsonb_build_object(
      'replace', jsonb_build_object(
        'reason', p_reason,
        'agreement_ref', p_agreement_ref,
        'agreement_date', p_agreement_date,
        'original_invoice_id', v_old.id,
        'original_invoice_number', v_old.invoice_number,
        'original_issued_at', v_old.issued_at,
        'original_provider_ref', v_old.provider_ref
      )
    ),
    p_old_id,
    v_actor
  )
  RETURNING id INTO v_new_id;

  -- STEP C: Link OLD → NEW via replaced_by.
  UPDATE public.tax_invoices
  SET replaced_by = v_new_id
  WHERE id = p_old_id;

  -- STEP D: Audit events for both transitions.
  INSERT INTO public.tax_invoice_events
    (tax_invoice_id, from_status, to_status, payload, note, actor_id, tenant_id)
  VALUES
    (p_old_id, 'issued', 'replaced',
     jsonb_build_object(
       'reason', p_reason,
       'replaced_by', v_new_id,
       'agreement_ref', p_agreement_ref,
       'agreement_date', p_agreement_date
     ),
     'TT78 §7 replace: ' || p_reason,
     v_actor,
     v_old.tenant_id),
    (v_new_id, NULL, 'draft',
     jsonb_build_object(
       'replaces', p_old_id,
       'original_invoice_number', v_old.invoice_number
     ),
     'Replacement draft for invoice ' || COALESCE(v_old.invoice_number, '#' || p_old_id::TEXT),
     v_actor,
     v_old.tenant_id);

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replace_tax_invoice FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_tax_invoice TO authenticated;

COMMENT ON FUNCTION public.replace_tax_invoice IS
  'TT78 §7 atomic replacement RPC. Locks OLD invoice, flips to replaced, INSERTs NEW draft, links both via replaced_by/replaced_for, audits via tax_invoice_events — all in single tx. Caller then transitions NEW: draft → signing → call provider with adjustmentType=3 → issued|submitted|draft. Requires settings:tenant + same tenant. Chain depth capped at 3.';


-- ─── 3. Expand archive partial index to cover replaced/cancelled ───
-- Legal retention TT78 §10 requires PDF/XML for replaced + cancelled
-- invoices too. Original index (migration 20260517010000) only covered
-- status='issued' — expand here so archive cron query stays index-served.

DROP INDEX IF EXISTS public.idx_tax_invoices_archive_pending;

CREATE INDEX idx_tax_invoices_archive_pending
  ON public.tax_invoices (branch_id, issued_at ASC)
  WHERE status IN ('issued', 'replaced', 'cancelled')
    AND pdf_url IS NULL
    AND archive_attempts < 5;

COMMENT ON INDEX public.idx_tax_invoices_archive_pending IS
  'Archive cron hot path. Partial WHERE covers all retention-required statuses (issued + replaced + cancelled) where archive not yet completed. Ordered ASC for oldest-first dequeue. archive_attempts < 5 caps retry count.';
