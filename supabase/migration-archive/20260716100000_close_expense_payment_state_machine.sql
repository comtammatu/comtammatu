BEGIN;

CREATE OR REPLACE FUNCTION public.transition_expense_payment(
  p_expense_id bigint,
  p_target_method text
) RETURNS TABLE(
  expense_id bigint,
  payment_method text,
  paid_at timestamptz,
  transfer_content text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_user_id uuid := auth.uid();
  v_expense public.expenses%ROWTYPE;
  v_updated public.expenses%ROWTYPE;
  v_prelock_transfer_content text;
  v_prefix text;
  v_expense_token text;
  v_transfer_content text;
BEGIN
  IF v_user_id IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_user_id)
    OR NOT EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = v_user_id
        AND profile.tenant_id = v_tenant_id
        AND COALESCE(profile.is_active, true)
    )
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_target_method IS NULL
    OR p_target_method NOT IN ('cash', 'transfer', 'unpaid')
  THEN
    RAISE EXCEPTION 'expense_payment_target_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT expense.transfer_content
  INTO v_prelock_transfer_content
  FROM public.expenses expense
  WHERE expense.id = p_expense_id
    AND expense.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_target_method = 'unpaid'
    AND v_prelock_transfer_content IS NOT NULL
  THEN
    PERFORM event.id
    FROM public.webhook_events event
    WHERE event.tenant_id = v_tenant_id
      AND event.provider = 'sepay'
      AND private.sepay_payload_contains_transfer_content(
        event.payload,
        v_prelock_transfer_content
      )
    ORDER BY event.id
    FOR UPDATE;
  END IF;

  SELECT expense.*
  INTO v_expense
  FROM public.expenses expense
  WHERE expense.id = p_expense_id
    AND expense.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_target_method = 'unpaid'
    AND v_expense.transfer_content IS NOT NULL
    AND v_expense.transfer_content IS DISTINCT FROM v_prelock_transfer_content
  THEN
    RAISE EXCEPTION 'expense_payment_state_changed' USING ERRCODE = '40001';
  END IF;

  IF NOT (
    v_expense.category = ANY (ARRAY[
      'rent',
      'utilities',
      'gas_fuel',
      'salary',
      'supplies',
      'repair',
      'marketing',
      'fees_tax',
      'other'
    ]::text[])
  ) THEN
    RAISE EXCEPTION 'expense_payment_transition_not_operating'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches match
    WHERE match.tenant_id = v_tenant_id
      AND match.expense_id = v_expense.id
  ) OR EXISTS (
    SELECT 1
    FROM public.webhook_events event
    WHERE event.tenant_id = v_tenant_id
      AND event.provider = 'sepay'
      AND event.expense_id = v_expense.id
  ) THEN
    RAISE EXCEPTION 'expense_already_matched' USING ERRCODE = '23505';
  END IF;

  IF p_target_method = 'cash'
    AND v_expense.payment_method = 'cash'
    AND v_expense.paid_at IS NOT NULL
    AND v_expense.transfer_content IS NULL
  THEN
    RETURN QUERY SELECT
      v_expense.id,
      v_expense.payment_method,
      v_expense.paid_at,
      v_expense.transfer_content;
    RETURN;
  END IF;

  IF p_target_method = 'transfer'
    AND v_expense.payment_method = 'unpaid'
    AND v_expense.paid_at IS NULL
    AND v_expense.transfer_content IS NOT NULL
  THEN
    RETURN QUERY SELECT
      v_expense.id,
      v_expense.payment_method,
      v_expense.paid_at,
      v_expense.transfer_content;
    RETURN;
  END IF;

  IF p_target_method = 'unpaid'
    AND v_expense.payment_method = 'unpaid'
    AND v_expense.paid_at IS NULL
    AND v_expense.transfer_content IS NULL
  THEN
    RETURN QUERY SELECT
      v_expense.id,
      v_expense.payment_method,
      v_expense.paid_at,
      v_expense.transfer_content;
    RETURN;
  END IF;

  IF v_expense.payment_method <> 'unpaid'
    OR v_expense.paid_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'expense_payment_state_final' USING ERRCODE = '23514';
  END IF;

  IF p_target_method = 'cash'
    AND v_expense.transfer_content IS NOT NULL
  THEN
    RAISE EXCEPTION 'expense_transfer_instruction_must_cancel'
      USING ERRCODE = '23514';
  END IF;

  IF p_target_method = 'transfer' THEN
    SELECT
      COALESCE(
        NULLIF(
          regexp_replace(
            upper(max(setting.value) FILTER (
              WHERE setting.key = 'payment_content_prefix'
            )),
            '[^A-Z0-9]+',
            '',
            'g'
          ),
          ''
        ),
        'MATU'
      ),
      COALESCE(
        NULLIF(
          regexp_replace(
            upper(max(setting.value) FILTER (
              WHERE setting.key = 'payment_content_expense_token'
            )),
            '[^A-Z0-9]+',
            '',
            'g'
          ),
          ''
        ),
        'CHI'
      )
    INTO v_prefix, v_expense_token
    FROM public.system_settings setting
    WHERE setting.tenant_id = v_tenant_id
      AND setting.key IN (
        'payment_content_prefix',
        'payment_content_expense_token'
      );

    IF char_length(v_prefix) NOT BETWEEN 2 AND 16
      OR char_length(v_expense_token) NOT BETWEEN 2 AND 16
    THEN
      RAISE EXCEPTION 'payment_content_settings_invalid'
        USING ERRCODE = '23514';
    END IF;

    v_transfer_content :=
      v_prefix || ' ' || v_expense_token || ' ' || v_expense.id::text;
  END IF;

  PERFORM set_config(
    'app.expense_payment_transition_id',
    v_expense.id::text,
    true
  );

  UPDATE public.expenses expense
  SET payment_method = CASE
        WHEN p_target_method = 'cash' THEN 'cash'
        ELSE 'unpaid'
      END,
      paid_at = CASE
        WHEN p_target_method = 'cash' THEN now()
        ELSE NULL
      END,
      transfer_content = CASE
        WHEN p_target_method = 'transfer' THEN v_transfer_content
        ELSE NULL
      END
  WHERE expense.id = v_expense.id
    AND expense.tenant_id = v_tenant_id
  RETURNING expense.* INTO v_updated;

  PERFORM set_config('app.expense_payment_transition_id', '', true);

  PERFORM public.log_audit(
    'update',
    'expense',
    v_expense.id,
    to_jsonb(v_expense),
    to_jsonb(v_updated)
  );

  RETURN QUERY SELECT
    v_updated.id,
    v_updated.payment_method,
    v_updated.paid_at,
    v_updated.transfer_content;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_expense_payment(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_expense_payment(bigint, text)
  TO authenticated;

REVOKE UPDATE ON TABLE public.expenses FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_expense(
  p_expense_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_user_id uuid := auth.uid();
  v_expense public.expenses%ROWTYPE;
  v_prelock_transfer_content text;
BEGIN
  IF v_user_id IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_user_id)
    OR NOT EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = v_user_id
        AND profile.tenant_id = v_tenant_id
        AND COALESCE(profile.is_active, true)
    )
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT expense.transfer_content
  INTO v_prelock_transfer_content
  FROM public.expenses expense
  WHERE expense.id = p_expense_id
    AND expense.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_prelock_transfer_content IS NOT NULL THEN
    PERFORM event.id
    FROM public.webhook_events event
    WHERE event.tenant_id = v_tenant_id
      AND event.provider = 'sepay'
      AND private.sepay_payload_contains_transfer_content(
        event.payload,
        v_prelock_transfer_content
      )
    ORDER BY event.id
    FOR UPDATE;
  END IF;

  SELECT expense.*
  INTO v_expense
  FROM public.expenses expense
  WHERE expense.id = p_expense_id
    AND expense.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_expense.transfer_content IS DISTINCT FROM v_prelock_transfer_content THEN
    RAISE EXCEPTION 'expense_payment_state_changed' USING ERRCODE = '40001';
  END IF;

  IF NOT (
    v_expense.category = ANY (ARRAY[
      'rent',
      'utilities',
      'gas_fuel',
      'salary',
      'supplies',
      'repair',
      'marketing',
      'fees_tax',
      'other'
    ]::text[])
  ) THEN
    RAISE EXCEPTION 'expense_cancel_not_operating' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches match
    WHERE match.tenant_id = v_tenant_id
      AND match.expense_id = v_expense.id
  ) OR EXISTS (
    SELECT 1
    FROM public.webhook_events event
    WHERE event.tenant_id = v_tenant_id
      AND event.provider = 'sepay'
      AND event.expense_id = v_expense.id
  ) THEN
    RAISE EXCEPTION 'expense_already_matched' USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('app.expense_cancel_id', v_expense.id::text, true);

  PERFORM public.log_audit(
    'cancel',
    'expense',
    v_expense.id,
    to_jsonb(v_expense),
    NULL
  );

  DELETE FROM public.expenses expense
  WHERE expense.id = v_expense.id
    AND expense.tenant_id = v_tenant_id;

  PERFORM set_config('app.expense_cancel_id', '', true);

  RETURN jsonb_build_object(
    'cancelled', true,
    'expense_id', v_expense.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_expense(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_expense(bigint)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_finance_expense_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_expense_id bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.transfer_content IS NOT NULL
      AND (
        auth.uid() IS NULL
        OR NEW.tenant_id IS DISTINCT FROM public.auth_tenant_id()
        OR NOT public.auth_is_owner(auth.uid())
      )
    THEN
      RAISE EXCEPTION 'expense_transfer_intent_owner_required'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  v_expense_id := OLD.id;

  IF TG_OP = 'UPDATE'
    AND current_setting('app.expense_payment_transition_id', true) = OLD.id::text
    AND auth.uid() IS NOT NULL
    AND OLD.tenant_id IS NOT DISTINCT FROM public.auth_tenant_id()
    AND public.auth_is_owner(auth.uid())
    AND OLD.category <> 'bank_deposit'
    AND OLD.payment_method = 'unpaid'
    AND OLD.paid_at IS NULL
    AND to_jsonb(NEW)
      - 'payment_method'
      - 'paid_at'
      - 'transfer_content'
      - 'updated_at'
      = to_jsonb(OLD)
      - 'payment_method'
      - 'paid_at'
      - 'transfer_content'
      - 'updated_at'
    AND NOT EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches match
      WHERE match.tenant_id = OLD.tenant_id
        AND match.expense_id = OLD.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.webhook_events event
      WHERE event.tenant_id = OLD.tenant_id
        AND event.provider = 'sepay'
        AND event.expense_id = OLD.id
    )
    AND (
      (
        NEW.payment_method = 'cash'
        AND NEW.paid_at IS NOT NULL
        AND NEW.transfer_content IS NULL
      ) OR (
        NEW.payment_method = 'unpaid'
        AND NEW.paid_at IS NULL
      )
    )
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE'
    AND current_setting('app.expense_cancel_id', true) = OLD.id::text
    AND auth.uid() IS NOT NULL
    AND OLD.tenant_id IS NOT DISTINCT FROM public.auth_tenant_id()
    AND public.auth_is_owner(auth.uid())
    AND OLD.category <> 'bank_deposit'
    AND NOT EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches match
      WHERE match.tenant_id = OLD.tenant_id
        AND match.expense_id = OLD.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.webhook_events event
      WHERE event.tenant_id = OLD.tenant_id
        AND event.provider = 'sepay'
        AND event.expense_id = OLD.id
    )
  THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.transfer_content IS NULL
    AND NEW.transfer_content IS NOT NULL
  THEN
    RAISE EXCEPTION 'expense_transfer_intent_requires_atomic_create'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.category <> 'bank_deposit'
    AND OLD.payment_method = 'unpaid'
    AND OLD.paid_at IS NULL
    AND NEW.payment_method = 'transfer'
    AND NEW.paid_at IS NOT NULL
    AND to_jsonb(NEW) - 'payment_method' - 'paid_at' - 'updated_at'
      = to_jsonb(OLD) - 'payment_method' - 'paid_at' - 'updated_at'
    AND EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches match
      JOIN public.webhook_events event
        ON event.tenant_id = match.tenant_id
       AND event.id = match.webhook_event_id
      WHERE match.tenant_id = OLD.tenant_id
        AND match.expense_id = OLD.id
        AND event.provider = 'sepay'
        AND event.signature_valid IS TRUE
        AND event.processing_status IS DISTINCT FROM 'failed'
        AND event.payment_id IS NULL
        AND lower(COALESCE(event.payload->>'transferType', '')) = 'out'
        AND COALESCE(event.payload->>'transferAmount', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        AND NEW.paid_at IS NOT DISTINCT FROM event.created_at
        AND (
          OLD.transfer_content IS NULL
          OR (
            abs((event.payload->>'transferAmount')::numeric) = OLD.amount
            AND private.sepay_payload_contains_transfer_content(
              event.payload,
              OLD.transfer_content
            )
          )
        )
    )
    AND (
      OLD.transfer_content IS NULL
      OR (
        SELECT count(*)
        FROM public.bank_transaction_expense_matches match
        WHERE match.tenant_id = OLD.tenant_id
          AND match.expense_id = OLD.id
      ) = 1
    )
  THEN
    RETURN NEW;
  END IF;

  IF OLD.transfer_content IS NOT NULL THEN
    RAISE EXCEPTION 'expense_transfer_intent_immutable'
      USING ERRCODE = '42501';
  END IF;

  IF (
    OLD.category = 'bank_deposit'
    OR (TG_OP = 'UPDATE' AND NEW.category = 'bank_deposit')
    OR EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches match
      WHERE match.tenant_id = OLD.tenant_id
        AND match.expense_id = v_expense_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.webhook_events event
      WHERE event.tenant_id = OLD.tenant_id
        AND event.provider = 'sepay'
        AND event.expense_id = v_expense_id
    )
  ) THEN
    RAISE EXCEPTION 'reconciled_expense_immutable'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit(
      'delete',
      'expense',
      OLD.id,
      to_jsonb(OLD),
      NULL
    );
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_finance_expense_evidence_mutation()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.match_sepay_transfer_intent_event(
  p_event_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_event public.webhook_events%ROWTYPE;
  v_locked_expense public.expenses%ROWTYPE;
  v_transfer_amount numeric;
  v_candidate_ids bigint[];
  v_expense_id bigint;
  v_match_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT event.*
  INTO v_event
  FROM public.webhook_events event
  WHERE event.id = p_event_id
    AND event.provider = 'sepay'
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

  IF v_event.payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'webhook_event_matches_payment' USING ERRCODE = '23514';
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

  IF v_transfer_amount IS NULL OR v_transfer_amount <= 0 THEN
    RAISE EXCEPTION 'expense_amount_mismatch' USING ERRCODE = '23514';
  END IF;

  WITH payload_tokens AS (
    SELECT DISTINCT token.value::bigint AS expense_id
    FROM unnest(ARRAY[
      COALESCE(v_event.payload->>'content', ''),
      COALESCE(v_event.payload->>'description', ''),
      COALESCE(v_event.payload->>'code', '')
    ]) AS candidate(raw_value)
    CROSS JOIN LATERAL regexp_split_to_table(
      btrim(regexp_replace(candidate.raw_value, '[^0-9]+', ' ', 'g')),
      ' +'
    ) AS token(value)
    WHERE token.value ~ '^[0-9]{1,18}$'
  )
  SELECT COALESCE(
    array_agg(expense.id ORDER BY expense.id),
    ARRAY[]::bigint[]
  )
  INTO v_candidate_ids
  FROM payload_tokens token
  JOIN public.expenses expense
    ON expense.id = token.expense_id
   AND expense.tenant_id = v_event.tenant_id
  WHERE expense.transfer_content IS NOT NULL
    AND expense.category <> 'bank_deposit'
    AND expense.payment_method IN ('unpaid', 'transfer')
    AND expense.amount = v_transfer_amount
    AND private.sepay_payload_contains_transfer_content(
      v_event.payload,
      expense.transfer_content
    );

  IF cardinality(v_candidate_ids) = 0 THEN
    RETURN jsonb_build_object('matched', false);
  END IF;

  IF cardinality(v_candidate_ids) <> 1 THEN
    RAISE EXCEPTION 'expense_transfer_intent_ambiguous'
      USING ERRCODE = '23505';
  END IF;

  v_expense_id := v_candidate_ids[1];

  SELECT expense.*
  INTO v_locked_expense
  FROM public.expenses expense
  WHERE expense.id = v_expense_id
    AND expense.tenant_id = v_event.tenant_id
    AND expense.transfer_content IS NOT NULL
    AND expense.category <> 'bank_deposit'
    AND expense.payment_method IN ('unpaid', 'transfer')
    AND expense.amount = v_transfer_amount
    AND private.sepay_payload_contains_transfer_content(
      v_event.payload,
      expense.transfer_content
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('matched', false);
  END IF;

  v_match_result := public.match_sepay_transaction_expenses(
    p_event_id,
    ARRAY[v_expense_id]
  );

  UPDATE public.webhook_events
  SET processing_status = 'processed',
      http_status = 200,
      error_code = NULL,
      processed_at = COALESCE(processed_at, now())
  WHERE id = p_event_id
    AND tenant_id = v_event.tenant_id;

  RETURN v_match_result || jsonb_build_object(
    'matched', true,
    'expense_id', v_expense_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.match_sepay_transfer_intent_event(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_sepay_transfer_intent_event(bigint)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_operating_cash_movement_for_period(
  p_start_date date,
  p_end_date date,
  p_branch_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_cash_collections numeric;
  v_cash_refunds numeric;
  v_cash_expenses numeric;
  v_cash_supplier_payments numeric;
  v_cash_out numeric;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date
  THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023';
  END IF;

  v_start_at := p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end_at := (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  SELECT COALESCE(sum(payment.amount), 0)
  INTO v_cash_collections
  FROM public.payments payment
  WHERE payment.tenant_id = v_tenant_id
    AND payment.method = 'cash'
    AND payment.status IN ('completed', 'refunded')
    AND payment.paid_at >= v_start_at
    AND payment.paid_at < v_end_at
    AND (p_branch_id IS NULL OR payment.branch_id = p_branch_id);

  SELECT COALESCE(sum(refund.amount), 0)
  INTO v_cash_refunds
  FROM public.refunds refund
  WHERE refund.tenant_id = v_tenant_id
    AND refund.status = 'approved'
    AND refund.payout_method = 'cash'
    AND refund.approved_at >= v_start_at
    AND refund.approved_at < v_end_at
    AND (p_branch_id IS NULL OR refund.branch_id = p_branch_id);

  SELECT COALESCE(sum(expense.amount), 0)
  INTO v_cash_expenses
  FROM public.expenses expense
  WHERE expense.tenant_id = v_tenant_id
    AND expense.payment_method = 'cash'
    AND expense.paid_at >= v_start_at
    AND expense.paid_at < v_end_at
    AND expense.category IN (
      'rent',
      'utilities',
      'gas_fuel',
      'salary',
      'supplies',
      'repair',
      'marketing',
      'fees_tax',
      'other'
    )
    AND (p_branch_id IS NULL OR expense.branch_id = p_branch_id);

  SELECT COALESCE(sum(supplier_payment.amount), 0)
  INTO v_cash_supplier_payments
  FROM public.supplier_payments supplier_payment
  JOIN public.supplier_invoices supplier_invoice
    ON supplier_invoice.id = supplier_payment.supplier_invoice_id
   AND supplier_invoice.tenant_id = supplier_payment.tenant_id
  LEFT JOIN public.goods_received_notes grn
    ON grn.id = supplier_invoice.grn_id
   AND grn.tenant_id = supplier_invoice.tenant_id
  WHERE supplier_payment.tenant_id = v_tenant_id
    AND supplier_payment.payment_method = 'cash'
    AND supplier_payment.payment_date >= v_start_at
    AND supplier_payment.payment_date < v_end_at
    AND (p_branch_id IS NULL OR grn.branch_id = p_branch_id);

  v_cash_out := v_cash_refunds + v_cash_expenses + v_cash_supplier_payments;

  RETURN jsonb_build_object(
    'cash_collections', v_cash_collections,
    'cash_refunds', v_cash_refunds,
    'cash_expenses', v_cash_expenses,
    'cash_supplier_payments', v_cash_supplier_payments,
    'cash_out', v_cash_out,
    'net_cash_movement', v_cash_collections - v_cash_out
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_operating_cash_movement_for_period(
  date,
  date,
  bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_operating_cash_movement_for_period(
  date,
  date,
  bigint
) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cash_ledger_movement_since(
  p_since timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_cash_collections numeric;
  v_cash_refunds numeric;
  v_cash_expenses numeric;
  v_cash_supplier_payments numeric;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(sum(payment.amount), 0)
  INTO v_cash_collections
  FROM public.payments payment
  WHERE payment.tenant_id = v_tenant_id
    AND payment.method = 'cash'
    AND payment.status IN ('completed', 'refunded')
    AND payment.paid_at >= p_since;

  SELECT COALESCE(sum(refund.amount), 0)
  INTO v_cash_refunds
  FROM public.refunds refund
  WHERE refund.tenant_id = v_tenant_id
    AND refund.status = 'approved'
    AND refund.payout_method = 'cash'
    AND refund.approved_at >= p_since;

  SELECT COALESCE(sum(expense.amount), 0)
  INTO v_cash_expenses
  FROM public.expenses expense
  WHERE expense.tenant_id = v_tenant_id
    AND expense.payment_method = 'cash'
    AND expense.paid_at >= p_since;

  SELECT COALESCE(sum(supplier_payment.amount), 0)
  INTO v_cash_supplier_payments
  FROM public.supplier_payments supplier_payment
  WHERE supplier_payment.tenant_id = v_tenant_id
    AND supplier_payment.payment_method = 'cash'
    AND supplier_payment.payment_date >= p_since;

  RETURN jsonb_build_object(
    'cash_collections', v_cash_collections,
    'cash_refunds', v_cash_refunds,
    'cash_expenses', v_cash_expenses,
    'cash_supplier_payments', v_cash_supplier_payments
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_cash_ledger_movement_since(timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_ledger_movement_since(timestamptz)
  TO authenticated;

COMMIT;
