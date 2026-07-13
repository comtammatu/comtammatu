BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.webhook_events
  ADD CONSTRAINT webhook_events_tenant_id_id_key UNIQUE (tenant_id, id);

ALTER TABLE public.supplier_payments
  ADD COLUMN sepay_webhook_event_id bigint,
  ADD CONSTRAINT supplier_payments_sepay_event_tenant_fkey
    FOREIGN KEY (tenant_id, sepay_webhook_event_id)
    REFERENCES public.webhook_events(tenant_id, id)
    ON DELETE RESTRICT;

CREATE INDEX idx_supplier_payments_sepay_event
  ON public.supplier_payments (tenant_id, sepay_webhook_event_id)
  WHERE sepay_webhook_event_id IS NOT NULL;

DROP POLICY IF EXISTS supplier_payments_write ON public.supplier_payments;
REVOKE ALL ON TABLE public.supplier_payments
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.supplier_payments TO authenticated;
REVOKE ALL ON SEQUENCE public.supplier_payments_id_seq
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_sepay_supplier_payment_links(
  p_event_id bigint,
  p_supplier_payment_ids bigint[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_user_id uuid := auth.uid();
  v_event public.webhook_events%ROWTYPE;
  v_supplier_payment_ids bigint[] := ARRAY[]::bigint[];
  v_old_supplier_payment_ids bigint[] := ARRAY[]::bigint[];
  v_affected_payment_ids bigint[] := ARRAY[]::bigint[];
  v_input_count integer := cardinality(
    COALESCE(p_supplier_payment_ids, ARRAY[]::bigint[])
  );
  v_payment_count integer := 0;
  v_transfer_amount numeric;
  v_payment_total numeric(15, 2) := 0;
BEGIN
  IF v_user_id IS NULL OR NOT public.auth_is_owner(v_user_id) THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF v_tenant_id IS NULL
    OR NOT public.has_permission_any('finance:ap_pay')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    array_agg(DISTINCT selected.payment_id ORDER BY selected.payment_id),
    ARRAY[]::bigint[]
  )
  INTO v_supplier_payment_ids
  FROM unnest(COALESCE(p_supplier_payment_ids, ARRAY[]::bigint[]))
    AS selected(payment_id)
  WHERE selected.payment_id IS NOT NULL;

  IF v_input_count <> cardinality(v_supplier_payment_ids) THEN
    RAISE EXCEPTION 'supplier_payment_link_invalid'
      USING ERRCODE = '23514';
  END IF;

  v_payment_count := cardinality(v_supplier_payment_ids);

  SELECT *
  INTO v_event
  FROM public.webhook_events
  WHERE id = p_event_id
    AND provider = 'sepay'
    AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.signature_valid IS NOT TRUE THEN
    RAISE EXCEPTION 'webhook_event_signature_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF v_event.processing_status <> 'ignored'
    OR (
      v_event.error_code IS NOT NULL
      AND v_event.error_code <> 'transfer_type_out'
    )
  THEN
    RAISE EXCEPTION 'webhook_event_not_final_unclassified'
      USING ERRCODE = '23514';
  END IF;

  IF v_event.order_id IS NOT NULL OR v_event.payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'webhook_event_matches_payment'
      USING ERRCODE = '23514';
  END IF;

  IF lower(COALESCE(v_event.payload->>'transferType', '')) <> 'out' THEN
    RAISE EXCEPTION 'webhook_event_not_out' USING ERRCODE = '23514';
  END IF;

  SELECT CASE
    WHEN COALESCE(v_event.payload->>'transferAmount', '')
      ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN abs((v_event.payload->>'transferAmount')::numeric)
    ELSE NULL
  END
  INTO v_transfer_amount;

  IF v_transfer_amount IS NULL
    OR v_transfer_amount <= 0
    OR round(v_transfer_amount, 2) <> v_transfer_amount
  THEN
    RAISE EXCEPTION 'supplier_payment_amount_mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF v_event.expense_id IS NOT NULL OR EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches match
    WHERE match.tenant_id = v_tenant_id
      AND match.webhook_event_id = p_event_id
  ) THEN
    RAISE EXCEPTION 'webhook_event_matches_expense'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(
    array_agg(DISTINCT affected.payment_id ORDER BY affected.payment_id),
    ARRAY[]::bigint[]
  )
  INTO v_affected_payment_ids
  FROM (
    SELECT payment.id AS payment_id
    FROM public.supplier_payments payment
    WHERE payment.tenant_id = v_tenant_id
      AND payment.sepay_webhook_event_id = p_event_id
    UNION ALL
    SELECT unnest(v_supplier_payment_ids)
  ) affected;

  PERFORM payment.id
  FROM public.supplier_payments payment
  WHERE payment.tenant_id = v_tenant_id
    AND payment.id = ANY(v_affected_payment_ids)
  ORDER BY payment.id
  FOR UPDATE;

  SELECT COALESCE(
    array_agg(payment.id ORDER BY payment.id),
    ARRAY[]::bigint[]
  )
  INTO v_old_supplier_payment_ids
  FROM public.supplier_payments payment
  WHERE payment.tenant_id = v_tenant_id
    AND payment.sepay_webhook_event_id = p_event_id;

  IF (
    SELECT count(*)
    FROM public.supplier_payments payment
    WHERE payment.tenant_id = v_tenant_id
      AND payment.id = ANY(v_supplier_payment_ids)
  ) <> v_payment_count
  THEN
    RAISE EXCEPTION 'supplier_payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_payments payment
    WHERE payment.tenant_id = v_tenant_id
      AND payment.id = ANY(v_supplier_payment_ids)
      AND payment.payment_method <> 'bank_transfer'
  ) THEN
    RAISE EXCEPTION 'supplier_payment_not_bank_transfer'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_payments payment
    WHERE payment.tenant_id = v_tenant_id
      AND payment.id = ANY(v_supplier_payment_ids)
      AND payment.sepay_webhook_event_id IS NOT NULL
      AND payment.sepay_webhook_event_id <> p_event_id
  ) THEN
    RAISE EXCEPTION 'supplier_payment_already_linked'
      USING ERRCODE = '23505';
  END IF;

  SELECT COALESCE(sum(payment.amount), 0)
  INTO v_payment_total
  FROM public.supplier_payments payment
  WHERE payment.tenant_id = v_tenant_id
    AND payment.id = ANY(v_supplier_payment_ids);

  IF v_payment_count > 0 AND v_payment_total <> v_transfer_amount THEN
    RAISE EXCEPTION 'supplier_payment_amount_mismatch'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.supplier_payments payment
  SET sepay_webhook_event_id = NULL
  WHERE payment.tenant_id = v_tenant_id
    AND payment.sepay_webhook_event_id = p_event_id
    AND NOT (payment.id = ANY(v_supplier_payment_ids));

  UPDATE public.supplier_payments payment
  SET sepay_webhook_event_id = p_event_id
  WHERE payment.tenant_id = v_tenant_id
    AND payment.id = ANY(v_supplier_payment_ids)
    AND payment.sepay_webhook_event_id IS DISTINCT FROM p_event_id;

  PERFORM public.log_audit(
    'set_sepay_supplier_payment_links',
    'webhook_event',
    p_event_id,
    jsonb_build_object(
      'supplier_payment_ids', to_jsonb(v_old_supplier_payment_ids)
    ),
    jsonb_build_object(
      'supplier_payment_ids', to_jsonb(v_supplier_payment_ids),
      'matched_amount', CASE
        WHEN v_payment_count = 0 THEN 0
        ELSE v_transfer_amount
      END
    )
  );

  RETURN jsonb_build_object(
    'matched_count', v_payment_count,
    'supplier_payment_ids', to_jsonb(v_supplier_payment_ids),
    'matched_amount', CASE
      WHEN v_payment_count = 0 THEN 0
      ELSE v_transfer_amount
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_sepay_expense_allocations(
  p_event_id bigint,
  p_allocations jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_service boolean := auth.role() = 'service_role';
  v_tenant_id bigint := public.auth_tenant_id();
  v_user_id uuid := auth.uid();
  v_event public.webhook_events%ROWTYPE;
  v_allocations jsonb := COALESCE(p_allocations, '[]'::jsonb);
  v_expense_ids bigint[] := ARRAY[]::bigint[];
  v_affected_expense_ids bigint[] := ARRAY[]::bigint[];
  v_allocation_count integer := 0;
  v_distinct_expense_count integer := 0;
  v_transfer_amount numeric(15, 2);
  v_allocation_total numeric(15, 2) := 0;
  v_first_expense_id bigint;
  v_result_allocations jsonb := '[]'::jsonb;
BEGIN
  IF NOT v_is_service THEN
    IF v_user_id IS NULL
      OR v_tenant_id IS NULL
      OR NOT public.has_permission_any('finance:expense_create')
    THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF jsonb_typeof(v_allocations) <> 'array' THEN
    RAISE EXCEPTION 'expense_allocation_invalid' USING ERRCODE = '23514';
  END IF;

  BEGIN
    SELECT
      COALESCE(
        array_agg(allocation.expense_id ORDER BY allocation.expense_id),
        ARRAY[]::bigint[]
      ),
      count(*)::integer,
      count(DISTINCT allocation.expense_id)::integer,
      COALESCE(sum(allocation.amount), 0)
    INTO
      v_expense_ids,
      v_allocation_count,
      v_distinct_expense_count,
      v_allocation_total
    FROM jsonb_to_recordset(v_allocations)
      AS allocation(expense_id bigint, amount numeric);
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'expense_allocation_invalid' USING ERRCODE = '23514';
  END;

  IF v_allocation_count <> v_distinct_expense_count
    OR EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(v_allocations)
        AS allocation(expense_id bigint, amount numeric)
      WHERE allocation.expense_id IS NULL
         OR allocation.amount IS NULL
         OR allocation.amount <= 0
         OR round(allocation.amount, 2) <> allocation.amount
    )
  THEN
    RAISE EXCEPTION 'expense_allocation_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO v_event
  FROM public.webhook_events
  WHERE id = p_event_id
    AND provider = 'sepay'
    AND (v_is_service OR tenant_id = v_tenant_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_is_service THEN
    v_tenant_id := v_event.tenant_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_payments payment
    WHERE payment.tenant_id = v_tenant_id
      AND payment.sepay_webhook_event_id = p_event_id
  ) THEN
    RAISE EXCEPTION 'webhook_event_matches_supplier_payment'
      USING ERRCODE = '23514';
  END IF;

  IF v_event.signature_valid IS NOT TRUE THEN
    RAISE EXCEPTION 'webhook_event_signature_invalid' USING ERRCODE = '23514';
  END IF;

  IF v_event.processing_status = 'failed' THEN
    RAISE EXCEPTION 'webhook_event_failed' USING ERRCODE = '23514';
  END IF;

  IF v_event.payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'webhook_event_matches_payment' USING ERRCODE = '23514';
  END IF;

  IF lower(COALESCE(v_event.payload->>'transferType', '')) <> 'out' THEN
    RAISE EXCEPTION 'webhook_event_not_out' USING ERRCODE = '23514';
  END IF;

  SELECT CASE
    WHEN COALESCE(v_event.payload->>'transferAmount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN abs((v_event.payload->>'transferAmount')::numeric)
    ELSE NULL
  END
  INTO v_transfer_amount;

  IF v_transfer_amount IS NULL OR v_transfer_amount <= 0 THEN
    RAISE EXCEPTION 'expense_amount_mismatch' USING ERRCODE = '23514';
  END IF;

  IF v_allocation_count > 0 AND v_allocation_total <> v_transfer_amount THEN
    RAISE EXCEPTION 'expense_amount_mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(
    array_agg(DISTINCT affected.expense_id ORDER BY affected.expense_id),
    ARRAY[]::bigint[]
  )
  INTO v_affected_expense_ids
  FROM (
    SELECT match.expense_id
    FROM public.bank_transaction_expense_matches match
    WHERE match.tenant_id = v_tenant_id
      AND match.webhook_event_id = p_event_id
    UNION ALL
    SELECT unnest(v_expense_ids)
  ) affected;

  PERFORM expense.id
  FROM public.expenses expense
  WHERE expense.tenant_id = v_tenant_id
    AND expense.id = ANY(v_affected_expense_ids)
  ORDER BY expense.id
  FOR UPDATE;

  IF (
    SELECT count(*)
    FROM public.expenses expense
    WHERE expense.tenant_id = v_tenant_id
      AND expense.id = ANY(v_expense_ids)
      AND expense.payment_method IN ('transfer', 'unpaid')
  ) <> v_allocation_count
  THEN
    RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM match.id
  FROM public.bank_transaction_expense_matches match
  WHERE match.tenant_id = v_tenant_id
    AND match.expense_id = ANY(v_affected_expense_ids)
  ORDER BY match.expense_id, match.webhook_event_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.expenses expense
    LEFT JOIN LATERAL (
      SELECT match.allocated_amount
      FROM public.bank_transaction_expense_matches match
      WHERE match.tenant_id = v_tenant_id
        AND match.webhook_event_id = p_event_id
        AND match.expense_id = expense.id
    ) current_allocation ON true
    LEFT JOIN LATERAL (
      SELECT allocation.amount
      FROM jsonb_to_recordset(v_allocations)
        AS allocation(expense_id bigint, amount numeric)
      WHERE allocation.expense_id = expense.id
    ) proposed_allocation ON true
    WHERE expense.tenant_id = v_tenant_id
      AND expense.id = ANY(v_affected_expense_ids)
      AND expense.paid_by_bank_allocation IS NULL
      AND current_allocation.allocated_amount IS DISTINCT FROM
        proposed_allocation.amount
  ) THEN
    RAISE EXCEPTION 'expense_paid_provenance_unknown'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(v_allocations)
      AS allocation(expense_id bigint, amount numeric)
    JOIN public.expenses expense
      ON expense.id = allocation.expense_id
     AND expense.tenant_id = v_tenant_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(sum(match.allocated_amount), 0) AS allocated_amount
      FROM public.bank_transaction_expense_matches match
      WHERE match.tenant_id = v_tenant_id
        AND match.expense_id = allocation.expense_id
        AND match.webhook_event_id <> p_event_id
    ) existing ON true
    WHERE existing.allocated_amount + allocation.amount > expense.amount
  ) THEN
    RAISE EXCEPTION 'expense_allocation_exceeds_expense'
      USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.bank_transaction_expense_matches
  WHERE tenant_id = v_tenant_id
    AND webhook_event_id = p_event_id
    AND NOT (expense_id = ANY(v_expense_ids));

  INSERT INTO public.bank_transaction_expense_matches (
    tenant_id,
    webhook_event_id,
    expense_id,
    allocated_amount,
    created_by
  )
  SELECT
    v_tenant_id,
    p_event_id,
    allocation.expense_id,
    allocation.amount,
    CASE WHEN v_is_service THEN NULL ELSE v_user_id END
  FROM jsonb_to_recordset(v_allocations)
    AS allocation(expense_id bigint, amount numeric)
  ON CONFLICT (tenant_id, webhook_event_id, expense_id) DO UPDATE
  SET
    allocated_amount = EXCLUDED.allocated_amount,
    created_by = COALESCE(
      bank_transaction_expense_matches.created_by,
      EXCLUDED.created_by
    );

  IF v_allocation_count > 0 AND (
    SELECT COALESCE(sum(match.allocated_amount), 0)
    FROM public.bank_transaction_expense_matches match
    WHERE match.tenant_id = v_tenant_id
      AND match.webhook_event_id = p_event_id
  ) <> v_transfer_amount
  THEN
    RAISE EXCEPTION 'expense_allocation_event_total_mismatch'
      USING ERRCODE = '23514';
  END IF;

  WITH expense_totals AS (
    SELECT
      affected.expense_id,
      COALESCE(sum(match.allocated_amount), 0) AS allocated_amount
    FROM unnest(v_affected_expense_ids) AS affected(expense_id)
    LEFT JOIN public.bank_transaction_expense_matches match
      ON match.tenant_id = v_tenant_id
     AND match.expense_id = affected.expense_id
    GROUP BY affected.expense_id
  )
  UPDATE public.expenses expense
  SET
    payment_method = CASE
      WHEN totals.allocated_amount = expense.amount THEN 'transfer'
      WHEN expense.paid_by_bank_allocation THEN 'unpaid'
      ELSE expense.payment_method
    END,
    paid_at = CASE
      WHEN totals.allocated_amount = expense.amount
        THEN COALESCE(expense.paid_at, v_event.created_at, now())
      WHEN expense.paid_by_bank_allocation THEN NULL
      ELSE expense.paid_at
    END,
    paid_by_bank_allocation = CASE
      WHEN totals.allocated_amount = expense.amount
        THEN expense.paid_by_bank_allocation OR expense.paid_at IS NULL
      WHEN expense.paid_by_bank_allocation THEN false
      ELSE expense.paid_by_bank_allocation
    END
  FROM expense_totals totals
  WHERE expense.tenant_id = v_tenant_id
    AND expense.id = totals.expense_id;

  v_first_expense_id := v_expense_ids[1];

  UPDATE public.webhook_events
  SET expense_id = v_first_expense_id
  WHERE id = p_event_id
    AND tenant_id = v_tenant_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'expenseId', match.expense_id,
        'amount', match.allocated_amount
      )
      ORDER BY match.expense_id
    ),
    '[]'::jsonb
  )
  INTO v_result_allocations
  FROM public.bank_transaction_expense_matches match
  WHERE match.tenant_id = v_tenant_id
    AND match.webhook_event_id = p_event_id;

  RETURN jsonb_build_object(
    'matched_count', v_allocation_count,
    'expense_ids', to_jsonb(v_expense_ids),
    'matched_amount', CASE
      WHEN v_allocation_count = 0 THEN 0
      ELSE v_transfer_amount
    END,
    'allocations', v_result_allocations
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_sepay_supplier_payment_links(bigint, bigint[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_sepay_supplier_payment_links(bigint, bigint[])
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_sepay_expense_allocations(bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_sepay_expense_allocations(bigint, jsonb)
  TO authenticated, service_role;

COMMIT;
