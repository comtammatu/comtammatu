BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.bank_transaction_expense_matches
  ADD COLUMN allocated_amount numeric(15, 2);

ALTER TABLE public.expenses
  ADD COLUMN paid_by_bank_allocation boolean;

ALTER TABLE public.expenses
  ALTER COLUMN paid_by_bank_allocation SET DEFAULT false;

COMMENT ON COLUMN public.expenses.paid_by_bank_allocation IS
  'True when paid_at was set by complete bank allocation coverage; NULL requires legacy provenance triage.';

UPDATE public.expenses expense
SET paid_by_bank_allocation = false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.bank_transaction_expense_matches match
  WHERE match.expense_id = expense.id
    AND match.tenant_id = expense.tenant_id
);

ALTER TABLE public.bank_transaction_expense_matches
  DROP CONSTRAINT bank_transaction_expense_matches_expense_id_fkey,
  ADD CONSTRAINT bank_transaction_expense_matches_expense_id_fkey
    FOREIGN KEY (expense_id)
    REFERENCES public.expenses(id)
    ON DELETE RESTRICT;

ALTER TABLE public.webhook_events
  DROP CONSTRAINT webhook_events_expense_id_fkey,
  ADD CONSTRAINT webhook_events_expense_id_fkey
    FOREIGN KEY (expense_id)
    REFERENCES public.expenses(id)
    ON DELETE RESTRICT;

DROP POLICY IF EXISTS expenses_update ON public.expenses;
REVOKE UPDATE ON TABLE public.expenses FROM anon, authenticated;
REVOKE INSERT ON TABLE public.expenses FROM anon, authenticated;
GRANT INSERT (
  tenant_id,
  branch_id,
  expense_date,
  category,
  amount,
  payment_method,
  paid_at,
  vendor_name,
  note,
  created_by
) ON TABLE public.expenses TO authenticated;

WITH match_shape AS (
  SELECT
    match.id,
    expense.amount::numeric AS expense_amount,
    CASE
      WHEN COALESCE(event.payload->>'transferAmount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN abs((event.payload->>'transferAmount')::numeric)
      ELSE NULL
    END AS event_amount,
    count(*) OVER (
      PARTITION BY match.tenant_id, match.webhook_event_id
    ) AS event_match_count,
    count(*) OVER (
      PARTITION BY match.tenant_id, match.expense_id
    ) AS expense_match_count
  FROM public.bank_transaction_expense_matches match
  JOIN public.webhook_events event
    ON event.id = match.webhook_event_id
   AND event.tenant_id = match.tenant_id
  JOIN public.expenses expense
    ON expense.id = match.expense_id
   AND expense.tenant_id = match.tenant_id
)
UPDATE public.bank_transaction_expense_matches match
SET allocated_amount = CASE
  WHEN shape.event_match_count = 1 THEN shape.event_amount
  WHEN shape.expense_match_count = 1 THEN shape.expense_amount
  ELSE NULL
END
FROM match_shape shape
WHERE shape.id = match.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches match
    JOIN public.webhook_events event
      ON event.id = match.webhook_event_id
     AND event.tenant_id = match.tenant_id
    WHERE event.provider <> 'sepay'
       OR event.signature_valid IS NOT TRUE
       OR event.processing_status = 'failed'
       OR lower(COALESCE(event.payload->>'transferType', '')) <> 'out'
       OR NOT (
         COALESCE(event.payload->>'transferAmount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
       )
       OR CASE
         WHEN COALESCE(event.payload->>'transferAmount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN abs((event.payload->>'transferAmount')::numeric) <= 0
         ELSE true
       END
  ) THEN
    RAISE EXCEPTION 'expense_allocation_invalid_bank_evidence'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches
    WHERE allocated_amount IS NULL OR allocated_amount <= 0
  ) THEN
    RAISE EXCEPTION 'expense_allocation_backfill_ambiguous'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches match
    JOIN public.webhook_events event
      ON event.id = match.webhook_event_id
     AND event.tenant_id = match.tenant_id
    GROUP BY
      match.tenant_id,
      match.webhook_event_id,
      event.payload->>'transferAmount'
    HAVING sum(match.allocated_amount) <>
      abs((event.payload->>'transferAmount')::numeric)
  ) THEN
    RAISE EXCEPTION 'expense_allocation_event_total_mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches match
    JOIN public.expenses expense
      ON expense.id = match.expense_id
     AND expense.tenant_id = match.tenant_id
    GROUP BY match.tenant_id, match.expense_id, expense.amount
    HAVING sum(match.allocated_amount) > expense.amount
  ) THEN
    RAISE EXCEPTION 'expense_allocation_exceeds_expense'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches match
    JOIN public.expenses expense
      ON expense.id = match.expense_id
     AND expense.tenant_id = match.tenant_id
    GROUP BY match.tenant_id, match.expense_id, expense.amount
    HAVING sum(match.allocated_amount) < expense.amount
  ) THEN
    RAISE EXCEPTION 'expense_allocation_legacy_partial_requires_triage'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.expenses expense
    WHERE EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches match
      WHERE match.tenant_id = expense.tenant_id
        AND match.expense_id = expense.id
    )
      AND (
        expense.payment_method <> 'transfer'
        OR expense.paid_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'expense_allocation_legacy_paid_state_requires_triage'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE public.bank_transaction_expense_matches
  ALTER COLUMN allocated_amount SET NOT NULL,
  ADD CONSTRAINT bank_tx_expense_matches_allocated_amount_check
    CHECK (allocated_amount > 0);

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
  v_expense_ids bigint[] := ARRAY[]::bigint[];
  v_transfer_amount numeric(15, 2);
  v_allocations jsonb := '[]'::jsonb;
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
  FROM unnest(COALESCE(p_expense_ids, ARRAY[]::bigint[]))
    AS selected(expense_id)
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
    AND (v_is_service OR tenant_id = v_tenant_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT CASE
    WHEN COALESCE(v_event.payload->>'transferAmount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN abs((v_event.payload->>'transferAmount')::numeric)
    ELSE NULL
  END
  INTO v_transfer_amount;

  IF cardinality(v_expense_ids) = 1 THEN
    v_allocations := jsonb_build_array(
      jsonb_build_object(
        'expense_id', v_expense_ids[1],
        'amount', v_transfer_amount
      )
    );
  ELSIF cardinality(v_expense_ids) > 1 THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'expense_id', expense.id,
          'amount', expense.amount - COALESCE(existing.allocated_amount, 0)
        )
        ORDER BY expense.id
      ),
      '[]'::jsonb
    )
    INTO v_allocations
    FROM public.expenses expense
    LEFT JOIN LATERAL (
      SELECT sum(match.allocated_amount) AS allocated_amount
      FROM public.bank_transaction_expense_matches match
      WHERE match.tenant_id = expense.tenant_id
        AND match.expense_id = expense.id
        AND match.webhook_event_id <> p_event_id
    ) existing ON true
    WHERE expense.tenant_id = v_event.tenant_id
      AND expense.id = ANY(v_expense_ids);

    IF jsonb_array_length(v_allocations) <> cardinality(v_expense_ids) THEN
      RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN public.set_sepay_expense_allocations(p_event_id, v_allocations);
END;
$$;

REVOKE ALL ON FUNCTION public.set_sepay_expense_allocations(bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_sepay_expense_allocations(bigint, jsonb)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.match_sepay_transaction_expenses(bigint, bigint[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_sepay_transaction_expenses(bigint, bigint[])
  TO authenticated, service_role;

COMMIT;
