CREATE OR REPLACE FUNCTION public.match_sepay_transaction_expenses(
  p_event_id bigint,
  p_expense_ids bigint[]
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
  v_expense_ids bigint[];
  v_first_expense_id bigint;
  v_transfer_amount numeric;
  v_expense_total numeric;
BEGIN
  IF NOT v_is_service THEN
    IF v_user_id IS NULL
      OR v_tenant_id IS NULL
      OR NOT public.has_permission_any('finance:expense_create')
    THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COALESCE(
    array_agg(DISTINCT expense_id ORDER BY expense_id),
    ARRAY[]::bigint[]
  )
  INTO v_expense_ids
  FROM unnest(COALESCE(p_expense_ids, ARRAY[]::bigint[])) AS selected(expense_id)
  WHERE selected.expense_id IS NOT NULL;

  IF v_is_service AND cardinality(v_expense_ids) <> 1 THEN
    RAISE EXCEPTION 'system_expense_match_requires_single_expense'
      USING ERRCODE = '23514';
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

  IF cardinality(v_expense_ids) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(v_expense_ids) AS selected(expense_id)
      LEFT JOIN public.expenses e
        ON e.id = selected.expense_id
       AND e.tenant_id = v_tenant_id
       AND e.payment_method IN ('transfer', 'unpaid')
      WHERE e.id IS NULL
    ) THEN
      RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(sum(e.amount), 0)
    INTO v_expense_total
    FROM public.expenses e
    WHERE e.tenant_id = v_tenant_id
      AND e.id = ANY(v_expense_ids);

    IF v_expense_total <> v_transfer_amount THEN
      RAISE EXCEPTION 'expense_amount_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;

  DELETE FROM public.bank_transaction_expense_matches
  WHERE tenant_id = v_tenant_id
    AND webhook_event_id = p_event_id
    AND NOT (expense_id = ANY(v_expense_ids));

  INSERT INTO public.bank_transaction_expense_matches (
    tenant_id,
    webhook_event_id,
    expense_id,
    created_by
  )
  SELECT
    v_tenant_id,
    p_event_id,
    selected.expense_id,
    CASE WHEN v_is_service THEN NULL ELSE v_user_id END
  FROM unnest(v_expense_ids) AS selected(expense_id)
  ON CONFLICT DO NOTHING;

  IF cardinality(v_expense_ids) > 0 THEN
    UPDATE public.expenses
    SET
      payment_method = 'transfer',
      paid_at = COALESCE(paid_at, v_event.created_at, now())
    WHERE tenant_id = v_tenant_id
      AND id = ANY(v_expense_ids)
      AND payment_method = 'unpaid';
  END IF;

  v_first_expense_id := v_expense_ids[1];

  UPDATE public.webhook_events
  SET expense_id = v_first_expense_id
  WHERE id = p_event_id
    AND tenant_id = v_tenant_id;

  RETURN jsonb_build_object(
    'matched_count', cardinality(v_expense_ids),
    'expense_ids', to_jsonb(v_expense_ids),
    'matched_amount', CASE
      WHEN cardinality(v_expense_ids) = 0 THEN 0
      ELSE v_transfer_amount
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.match_sepay_transaction_expenses(bigint, bigint[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_sepay_transaction_expenses(bigint, bigint[])
  TO authenticated, service_role;
