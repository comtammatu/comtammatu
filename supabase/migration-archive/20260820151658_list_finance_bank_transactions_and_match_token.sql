-- Bank list with match_kind in one query, plus bulk CHI/NỘP token match.

CREATE FUNCTION public.list_finance_bank_transactions(
  p_start_date date,
  p_end_date date,
  p_recon text DEFAULT 'all',
  p_cursor_id bigint DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_start_utc timestamptz;
  v_end_utc timestamptz;
  v_limit integer;
  v_recon text;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023';
  END IF;

  v_recon := lower(btrim(COALESCE(p_recon, 'all')));
  IF v_recon NOT IN (
    'all',
    'needs_review',
    'money_in_review',
    'money_out_review',
    'matched',
    'webhook_error'
  ) THEN
    RAISE EXCEPTION 'invalid_recon' USING ERRCODE = '22023';
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 100), 100));
  v_start_utc := p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end_utc := (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  WITH ledger AS (
    SELECT
      tx.id,
      tx.webhook_event_id,
      tx.occurred_at,
      tx.transfer_type,
      tx.amount,
      tx.balance_after,
      tx.account_number,
      tx.code,
      tx.content,
      tx.reference_code,
      tx.ingest_source,
      tx.provider_transaction_id
    FROM public.bank_transactions tx
    WHERE tx.tenant_id = v_tenant
      AND tx.occurred_at >= v_start_utc
      AND tx.occurred_at < v_end_utc
      AND (p_cursor_id IS NULL OR tx.id < p_cursor_id)
  ),
  matches AS (
    SELECT
      match.bank_transaction_id,
      array_remove(array_agg(DISTINCT match.payment_id), NULL) AS payment_ids,
      array_remove(array_agg(DISTINCT match.expense_id), NULL) AS expense_ids,
      array_remove(array_agg(DISTINCT match.supplier_payment_id), NULL)
        AS supplier_payment_ids,
      array_remove(array_agg(DISTINCT match.refund_id), NULL) AS refund_ids
    FROM public.bank_transaction_reconciliation_matches match
    WHERE match.tenant_id = v_tenant
      AND match.bank_transaction_id IN (SELECT ledger.id FROM ledger)
    GROUP BY match.bank_transaction_id
  ),
  annotated AS (
    SELECT
      ledger.*,
      event.processing_status,
      event.error_code,
      event.http_status,
      event.request_id,
      event.created_at AS webhook_created_at,
      event.order_id,
      event.payment_id AS webhook_payment_id,
      event.expense_id AS webhook_expense_id,
      COALESCE(matches.payment_ids, ARRAY[]::bigint[]) AS payment_ids,
      COALESCE(matches.expense_ids, ARRAY[]::bigint[]) AS expense_ids,
      COALESCE(matches.supplier_payment_ids, ARRAY[]::bigint[])
        AS supplier_payment_ids,
      COALESCE(matches.refund_ids, ARRAY[]::bigint[]) AS refund_ids,
      CASE
        WHEN cardinality(COALESCE(matches.payment_ids, ARRAY[]::bigint[])) > 0
          THEN 'payment'
        WHEN cardinality(COALESCE(matches.expense_ids, ARRAY[]::bigint[])) > 0
          THEN 'expense'
        WHEN cardinality(COALESCE(matches.supplier_payment_ids, ARRAY[]::bigint[])) > 0
          THEN 'supplier_payment'
        WHEN cardinality(COALESCE(matches.refund_ids, ARRAY[]::bigint[])) > 0
          THEN 'refund'
        WHEN event.payment_id IS NOT NULL THEN 'payment'
        WHEN event.expense_id IS NOT NULL THEN 'expense'
        ELSE 'none'
      END AS match_kind,
      CASE
        WHEN event.processing_status = 'failed' THEN true
        WHEN event.error_code IS NOT NULL
          AND event.processing_status IS DISTINCT FROM 'processed'
          THEN true
        ELSE false
      END AS webhook_error
    FROM ledger
    LEFT JOIN matches ON matches.bank_transaction_id = ledger.id
    LEFT JOIN public.webhook_events event
      ON event.id = ledger.webhook_event_id
     AND event.tenant_id = v_tenant
  ),
  classified AS (
    SELECT
      annotated.*,
      (
        NOT annotated.webhook_error
        AND annotated.match_kind = 'none'
      ) AS needs_review
    FROM annotated
  ),
  filtered AS (
    SELECT classified.*
    FROM classified
    WHERE
      CASE v_recon
        WHEN 'all' THEN true
        WHEN 'needs_review' THEN classified.needs_review
        WHEN 'money_in_review' THEN
          classified.needs_review AND classified.transfer_type = 'in'
        WHEN 'money_out_review' THEN
          classified.needs_review AND classified.transfer_type = 'out'
        WHEN 'matched' THEN classified.match_kind <> 'none'
        WHEN 'webhook_error' THEN classified.webhook_error
        ELSE true
      END
    ORDER BY classified.occurred_at DESC, classified.id DESC
    LIMIT v_limit
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'bank_transaction_id', filtered.id,
        'webhook_event_id', filtered.webhook_event_id,
        'occurred_at', filtered.occurred_at,
        'transfer_type', filtered.transfer_type,
        'amount', filtered.amount::text,
        'balance_after', filtered.balance_after::text,
        'account_number', filtered.account_number,
        'code', filtered.code,
        'content', filtered.content,
        'reference_code', filtered.reference_code,
        'ingest_source', filtered.ingest_source,
        'provider_transaction_id', filtered.provider_transaction_id,
        'processing_status', COALESCE(filtered.processing_status, 'processed'),
        'error_code', filtered.error_code,
        'http_status', filtered.http_status,
        'request_id', COALESCE(
          filtered.request_id,
          filtered.provider_transaction_id
        ),
        'webhook_created_at', filtered.webhook_created_at,
        'order_id', filtered.order_id,
        'match_kind', filtered.match_kind,
        'needs_review', filtered.needs_review,
        'payment_id', COALESCE(filtered.payment_ids[1], filtered.webhook_payment_id),
        'expense_ids', to_jsonb(
          CASE
            WHEN cardinality(filtered.expense_ids) > 0 THEN filtered.expense_ids
            WHEN filtered.webhook_expense_id IS NOT NULL
              THEN ARRAY[filtered.webhook_expense_id]
            ELSE ARRAY[]::bigint[]
          END
        ),
        'supplier_payment_ids', to_jsonb(filtered.supplier_payment_ids),
        'refund_ids', to_jsonb(filtered.refund_ids)
      )
      ORDER BY filtered.occurred_at DESC, filtered.id DESC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM filtered;

  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.list_finance_bank_transactions(
  date,
  date,
  text,
  bigint,
  integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_finance_bank_transactions(
  date,
  date,
  text,
  bigint,
  integer
) TO authenticated;

COMMENT ON FUNCTION public.list_finance_bank_transactions(
  date,
  date,
  text,
  bigint,
  integer
) IS
  'Paged bank ledger with match_kind for finance:view. Classify-only; does not change balances.';

CREATE FUNCTION public.match_bank_by_transfer_token(
  p_bank_transaction_ids bigint[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_tx public.bank_transactions%ROWTYPE;
  v_id bigint;
  v_matched integer := 0;
  v_skipped integer := 0;
  v_review integer := 0;
  v_expense_ids bigint[];
  v_branch_id bigint;
  v_already boolean;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_bank_transaction_ids IS NULL OR cardinality(p_bank_transaction_ids) = 0 THEN
    RETURN jsonb_build_object(
      'matched', 0,
      'skipped', 0,
      'needs_review', 0
    );
  END IF;

  FOREACH v_id IN ARRAY p_bank_transaction_ids LOOP
    SELECT tx.*
    INTO v_tx
    FROM public.bank_transactions tx
    WHERE tx.id = v_id
      AND tx.tenant_id = v_tenant;

    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.bank_transaction_reconciliation_matches match
      WHERE match.tenant_id = v_tenant
        AND match.bank_transaction_id = v_tx.id
    )
    INTO v_already;

    IF v_already THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_tx.transfer_type = 'out' THEN
      SELECT COALESCE(array_agg(expense.id ORDER BY expense.id), ARRAY[]::bigint[])
      INTO v_expense_ids
      FROM public.expenses expense
      WHERE expense.tenant_id = v_tenant
        AND expense.transfer_content IS NOT NULL
        AND expense.category IS DISTINCT FROM 'bank_deposit'
        AND expense.payment_method IN ('unpaid', 'transfer')
        AND expense.amount = v_tx.amount
        AND strpos(
          upper(COALESCE(v_tx.content, '') || ' ' || COALESCE(v_tx.code, '')),
          upper(expense.transfer_content)
        ) > 0;

      IF cardinality(v_expense_ids) <> 1 THEN
        v_review := v_review + 1;
        CONTINUE;
      END IF;

      BEGIN
        PERFORM public.reconcile_bank_transaction_targets(
          v_tx.id,
          'expense',
          v_expense_ids
        );
        v_matched := v_matched + 1;
      EXCEPTION
        WHEN OTHERS THEN
          v_review := v_review + 1;
      END;
      CONTINUE;
    END IF;

    IF v_tx.transfer_type = 'in' THEN
      SELECT (regexp_match(
        upper(COALESCE(v_tx.content, '') || ' ' || COALESCE(v_tx.code, '')),
        'MATU[[:space:]]+NOP[[:space:]]+([0-9]+)'
      ))[1]::bigint
      INTO v_branch_id;

      IF v_branch_id IS NULL THEN
        v_review := v_review + 1;
        CONTINUE;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM public.branches branch
        WHERE branch.id = v_branch_id
          AND branch.tenant_id = v_tenant
          AND branch.branch_kind = 'branch'
      ) THEN
        v_review := v_review + 1;
        CONTINUE;
      END IF;

      BEGIN
        PERFORM public.record_bank_transaction_cash_deposit(
          v_tx.id,
          v_branch_id
        );
        v_matched := v_matched + 1;
      EXCEPTION
        WHEN OTHERS THEN
          v_review := v_review + 1;
      END;
      CONTINUE;
    END IF;

    v_review := v_review + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'matched', v_matched,
    'skipped', v_skipped,
    'needs_review', v_review
  );
END;
$$;

REVOKE ALL ON FUNCTION public.match_bank_by_transfer_token(bigint[])
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.match_bank_by_transfer_token(bigint[])
TO authenticated;

COMMENT ON FUNCTION public.match_bank_by_transfer_token(bigint[]) IS
  'Bulk-match CHI/NỘP bank rows when exactly one candidate exists. Classify only.';
