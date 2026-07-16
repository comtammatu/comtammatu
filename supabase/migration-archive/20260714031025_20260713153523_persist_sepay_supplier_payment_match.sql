ALTER TABLE public.supplier_payments
  ADD COLUMN webhook_event_id bigint
  REFERENCES public.webhook_events(id) ON DELETE SET NULL;

CREATE INDEX supplier_payments_webhook_event_idx
  ON public.supplier_payments (tenant_id, webhook_event_id)
  WHERE webhook_event_id IS NOT NULL;

REVOKE INSERT, UPDATE, DELETE ON public.supplier_payments
  FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.match_sepay_transaction_supplier_payments(
  p_event_id bigint,
  p_supplier_payment_ids bigint[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_event public.webhook_events%ROWTYPE;
  v_supplier_payment_ids bigint[];
  v_transfer_amount numeric;
  v_payment_count integer;
  v_payment_total numeric;
BEGIN
  IF v_user_id IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_user_id)
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    array_agg(DISTINCT supplier_payment_id ORDER BY supplier_payment_id),
    ARRAY[]::bigint[]
  )
  INTO v_supplier_payment_ids
  FROM unnest(
    COALESCE(p_supplier_payment_ids, ARRAY[]::bigint[])
  ) AS selected(supplier_payment_id)
  WHERE selected.supplier_payment_id IS NOT NULL;

  SELECT *
  INTO v_event
  FROM public.webhook_events
  WHERE id = p_event_id
    AND tenant_id = v_tenant_id
    AND provider = 'sepay'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.signature_valid IS NOT TRUE THEN
    RAISE EXCEPTION 'webhook_event_signature_invalid' USING ERRCODE = '23514';
  END IF;

  IF v_event.processing_status = 'failed' THEN
    RAISE EXCEPTION 'webhook_event_failed' USING ERRCODE = '23514';
  END IF;

  IF v_event.payment_id IS NOT NULL
    OR lower(COALESCE(v_event.payload->>'transferType', '')) <> 'out'
  THEN
    RAISE EXCEPTION 'webhook_event_not_supplier_payment'
      USING ERRCODE = '23514';
  END IF;

  SELECT CASE
    WHEN COALESCE(v_event.payload->>'transferAmount', '')
      ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN abs((v_event.payload->>'transferAmount')::numeric)
    ELSE NULL
  END
  INTO v_transfer_amount;

  IF v_transfer_amount IS NULL OR v_transfer_amount <= 0 THEN
    RAISE EXCEPTION 'supplier_payment_amount_mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF cardinality(v_supplier_payment_ids) = 0 THEN
    UPDATE public.supplier_payments
    SET webhook_event_id = NULL,
        updated_at = now()
    WHERE tenant_id = v_tenant_id
      AND webhook_event_id = p_event_id;

    RETURN jsonb_build_object(
      'matched_count', 0,
      'supplier_payment_ids', '[]'::jsonb,
      'matched_amount', 0
    );
  END IF;

  IF v_event.expense_id IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches expense_match
      WHERE expense_match.tenant_id = v_tenant_id
        AND expense_match.webhook_event_id = p_event_id
    )
  THEN
    RAISE EXCEPTION 'webhook_event_already_linked'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.supplier_payments payment
  WHERE payment.tenant_id = v_tenant_id
    AND payment.id = ANY(v_supplier_payment_ids)
  ORDER BY payment.id
  FOR UPDATE;

  SELECT count(*), COALESCE(sum(payment.amount), 0)
  INTO v_payment_count, v_payment_total
  FROM public.supplier_payments payment
  WHERE payment.tenant_id = v_tenant_id
    AND payment.id = ANY(v_supplier_payment_ids)
    AND payment.payment_method = 'bank_transfer'
    AND (
      payment.webhook_event_id IS NULL
      OR payment.webhook_event_id = p_event_id
    );

  IF v_payment_count <> cardinality(v_supplier_payment_ids) THEN
    RAISE EXCEPTION 'supplier_payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_payment_total <> v_transfer_amount THEN
    RAISE EXCEPTION 'supplier_payment_amount_mismatch'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.supplier_payments
  SET webhook_event_id = NULL,
      updated_at = now()
  WHERE tenant_id = v_tenant_id
    AND webhook_event_id = p_event_id
    AND NOT (id = ANY(v_supplier_payment_ids));

  UPDATE public.supplier_payments
  SET webhook_event_id = p_event_id,
      updated_at = now()
  WHERE tenant_id = v_tenant_id
    AND id = ANY(v_supplier_payment_ids);

  RETURN jsonb_build_object(
    'matched_count', cardinality(v_supplier_payment_ids),
    'supplier_payment_ids', to_jsonb(v_supplier_payment_ids),
    'matched_amount', v_transfer_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.match_sepay_transaction_supplier_payments(
  bigint,
  bigint[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_sepay_transaction_supplier_payments(
  bigint,
  bigint[]
) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_expense_match_without_supplier_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.supplier_payments payment
    WHERE payment.tenant_id = NEW.tenant_id
      AND payment.webhook_event_id = NEW.webhook_event_id
  ) THEN
    RAISE EXCEPTION 'webhook_event_already_linked'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_expense_match_without_supplier_payment
  ON public.bank_transaction_expense_matches;
CREATE TRIGGER guard_expense_match_without_supplier_payment
BEFORE INSERT OR UPDATE OF webhook_event_id
ON public.bank_transaction_expense_matches
FOR EACH ROW
EXECUTE FUNCTION public.guard_expense_match_without_supplier_payment();
