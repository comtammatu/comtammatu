-- Mark operating-expense "transfer" as paid-by-bank confirmation.
-- Does not create SePay transfer_content intents from this RPC.

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
BEGIN
  IF v_user_id IS NULL
    OR v_tenant_id IS NULL
    OR NOT (
      public.auth_is_owner(v_user_id)
      OR public.has_position('accountant')
    )
    OR NOT public.has_permission_any('finance:view')
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

  IF p_target_method = 'unpaid'
    AND v_expense.transfer_content IS NULL
  THEN
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
        WHEN p_target_method IN ('cash', 'transfer') THEN now()
        ELSE NULL
      END,
      transfer_content = CASE
        WHEN p_target_method = 'transfer' THEN v_expense.transfer_content
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
  'Confirm unpaid operating expense as cash or bank transfer, or clear a transfer-content intent back to unpaid.';
