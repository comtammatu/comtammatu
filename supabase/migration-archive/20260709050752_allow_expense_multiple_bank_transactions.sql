ALTER TABLE public.bank_transaction_expense_matches
  DROP CONSTRAINT IF EXISTS bank_transaction_expense_matches_expense_key;

CREATE OR REPLACE FUNCTION public.match_sepay_transaction_expenses(
  p_event_id bigint,
  p_expense_ids bigint[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_user_id uuid := auth.uid();
  v_event public.webhook_events%ROWTYPE;
  v_expense_ids bigint[];
  v_first_expense_id bigint;
BEGIN
  IF v_user_id IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.has_permission_any('finance:expense_create')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT expense_id ORDER BY expense_id), ARRAY[]::bigint[])
  INTO v_expense_ids
  FROM unnest(COALESCE(p_expense_ids, ARRAY[]::bigint[])) AS selected(expense_id)
  WHERE selected.expense_id IS NOT NULL;

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

  IF v_event.payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'webhook_event_matches_payment' USING ERRCODE = '23514';
  END IF;

  IF lower(COALESCE(v_event.payload->>'transferType', '')) <> 'out' THEN
    RAISE EXCEPTION 'webhook_event_not_out' USING ERRCODE = '23514';
  END IF;

  IF cardinality(v_expense_ids) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(v_expense_ids) AS selected(expense_id)
      LEFT JOIN public.expenses e
        ON e.id = selected.expense_id
       AND e.tenant_id = v_tenant_id
       AND e.payment_method = 'transfer'
      WHERE e.id IS NULL
    ) THEN
      RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
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
  SELECT v_tenant_id, p_event_id, selected.expense_id, v_user_id
  FROM unnest(v_expense_ids) AS selected(expense_id)
  ON CONFLICT DO NOTHING;

  v_first_expense_id := v_expense_ids[1];

  UPDATE public.webhook_events
  SET expense_id = v_first_expense_id
  WHERE id = p_event_id
    AND tenant_id = v_tenant_id;

  RETURN jsonb_build_object(
    'matched_count', cardinality(v_expense_ids),
    'expense_ids', to_jsonb(v_expense_ids)
  );
END;
$$;
