-- Allow Owner/Accountant with finance:expense_create to correct an unmatched
-- operating-expense payment method after cash/transfer confirmation
-- (cash ↔ transfer ↔ unpaid). Matched / bank_deposit / transfer-intent rows stay locked.

CREATE OR REPLACE FUNCTION public.transition_expense_payment(
  p_expense_id bigint,
  p_target_method text
) RETURNS TABLE(
  expense_id bigint,
  payment_method text,
  paid_at timestamp with time zone,
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
  v_is_paid_correction boolean := false;
BEGIN
  IF v_user_id IS NULL
    OR v_tenant_id IS NULL
    OR NOT (
      public.auth_is_owner(v_user_id)
      OR public.has_position('accountant')
    )
    OR NOT public.has_permission_any('finance:expense_create')
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
    AND v_expense.payment_method = 'transfer'
    AND v_expense.paid_at IS NOT NULL
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

  v_is_paid_correction :=
    v_expense.paid_at IS NOT NULL
    AND v_expense.payment_method IN ('cash', 'transfer')
    AND p_target_method IS DISTINCT FROM v_expense.payment_method;

  IF v_is_paid_correction THEN
    NULL;
  ELSIF v_expense.payment_method = 'unpaid'
    AND v_expense.paid_at IS NULL
  THEN
    IF p_target_method = 'cash'
      AND v_expense.transfer_content IS NOT NULL
    THEN
      RAISE EXCEPTION 'expense_transfer_instruction_must_cancel'
        USING ERRCODE = '23514';
    END IF;

    IF p_target_method = 'unpaid'
      AND v_expense.transfer_content IS NULL
    THEN
      RAISE EXCEPTION 'expense_payment_state_final' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'expense_payment_state_final' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config(
    'app.expense_payment_transition_id',
    v_expense.id::text,
    true
  );

  UPDATE public.expenses expense
  SET payment_method = CASE
        WHEN p_target_method = 'cash' THEN 'cash'
        WHEN p_target_method = 'transfer' THEN 'transfer'
        ELSE 'unpaid'
      END,
      paid_at = CASE
        WHEN p_target_method = 'unpaid' THEN NULL
        WHEN v_expense.paid_at IS NOT NULL THEN v_expense.paid_at
        ELSE now()
      END,
      transfer_content = CASE
        WHEN p_target_method = 'transfer'
          AND NOT v_is_paid_correction
          THEN v_expense.transfer_content
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

COMMENT ON FUNCTION public.transition_expense_payment(bigint, text) IS
  'Confirm unpaid operating expense as cash or bank transfer, cancel a transfer-content intent, or correct an unmatched paid method (cash/transfer/unpaid) for Owner/Accountant with finance:expense_create.';

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
    AND (
      public.auth_is_owner(auth.uid())
      OR public.has_position('accountant')
    )
    AND public.has_permission_any('finance:expense_create')
    AND OLD.category <> 'bank_deposit'
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
        OLD.payment_method = 'unpaid'
        AND OLD.paid_at IS NULL
        AND (
          (
            NEW.payment_method = 'cash'
            AND NEW.paid_at IS NOT NULL
            AND NEW.transfer_content IS NULL
          ) OR (
            NEW.payment_method = 'transfer'
            AND NEW.paid_at IS NOT NULL
          ) OR (
            NEW.payment_method = 'unpaid'
            AND NEW.paid_at IS NULL
          )
        )
      ) OR (
        OLD.paid_at IS NOT NULL
        AND OLD.payment_method IN ('cash', 'transfer')
        AND (
          (
            NEW.payment_method = 'cash'
            AND NEW.paid_at IS NOT NULL
            AND NEW.transfer_content IS NULL
          ) OR (
            NEW.payment_method = 'transfer'
            AND NEW.paid_at IS NOT NULL
            AND NEW.transfer_content IS NULL
          ) OR (
            NEW.payment_method = 'unpaid'
            AND NEW.paid_at IS NULL
            AND NEW.transfer_content IS NULL
          )
        )
      )
    )
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND current_setting('app.expense_update_id', true) = OLD.id::text
    AND auth.uid() IS NOT NULL
    AND OLD.tenant_id IS NOT DISTINCT FROM public.auth_tenant_id()
    AND (
      public.auth_is_owner(auth.uid())
      OR public.has_position('accountant')
    )
    AND public.has_permission_any('finance:expense_create')
    AND OLD.transfer_content IS NULL
    AND NEW.transfer_content IS NULL
    AND OLD.payment_method IS NOT DISTINCT FROM NEW.payment_method
    AND OLD.paid_at IS NOT DISTINCT FROM NEW.paid_at
    AND OLD.category = ANY (ARRAY[
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
    AND NEW.category = ANY (ARRAY[
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
    AND to_jsonb(NEW)
      - 'branch_id'
      - 'expense_date'
      - 'category'
      - 'vat_breakdown'
      - 'subtotal'
      - 'vat_amount'
      - 'amount'
      - 'note'
      - 'invoice_attachment_url'
      - 'updated_at'
      = to_jsonb(OLD)
      - 'branch_id'
      - 'expense_date'
      - 'category'
      - 'vat_breakdown'
      - 'subtotal'
      - 'vat_amount'
      - 'amount'
      - 'note'
      - 'invoice_attachment_url'
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
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE'
    AND current_setting('app.expense_cancel_id', true) = OLD.id::text
    AND auth.uid() IS NOT NULL
    AND OLD.tenant_id IS NOT DISTINCT FROM public.auth_tenant_id()
    AND (
      public.auth_is_owner(auth.uid())
      OR public.has_position('accountant')
    )
    AND public.has_permission_any('finance:expense_create')
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
REVOKE ALL ON FUNCTION public.transition_expense_payment(bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_expense_payment(bigint, text)
  TO authenticated;
GRANT ALL ON FUNCTION public.guard_finance_expense_evidence_mutation()
  TO service_role;
