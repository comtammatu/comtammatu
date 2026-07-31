CREATE FUNCTION public.update_operating_expense(
  p_expense_id bigint,
  p_branch_id bigint,
  p_expense_date date,
  p_category text,
  p_vat_breakdown jsonb,
  p_note text,
  p_invoice_attachment_url text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_user_id uuid := auth.uid();
  v_expense public.expenses%ROWTYPE;
  v_updated public.expenses%ROWTYPE;
  v_note text := NULLIF(btrim(p_note), '');
  v_attachment text := NULLIF(btrim(p_invoice_attachment_url), '');
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

  IF p_expense_date IS NULL
    OR p_category IS NULL
    OR NOT (
      p_category = ANY (ARRAY[
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
    )
    OR p_vat_breakdown IS NULL
    OR char_length(v_note) NOT BETWEEN 5 AND 500
    OR char_length(v_attachment) > 2048
    OR (v_attachment IS NOT NULL AND v_attachment !~* '^https?://')
  THEN
    RAISE EXCEPTION 'expense_update_invalid' USING ERRCODE = '23514';
  END IF;

  IF p_branch_id IS NOT NULL THEN
    PERFORM 1
    FROM public.branches branch
    WHERE branch.id = p_branch_id
      AND branch.tenant_id = v_tenant_id
      AND branch.is_active IS TRUE
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
    END IF;
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
    RAISE EXCEPTION 'expense_update_not_operating' USING ERRCODE = '23514';
  END IF;

  IF v_expense.transfer_content IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches match
      WHERE match.tenant_id = v_tenant_id
        AND match.expense_id = v_expense.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.webhook_events event
      WHERE event.tenant_id = v_tenant_id
        AND event.provider = 'sepay'
        AND event.expense_id = v_expense.id
    )
  THEN
    RAISE EXCEPTION 'expense_already_matched' USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('app.expense_update_id', v_expense.id::text, true);

  UPDATE public.expenses expense
  SET
    branch_id = p_branch_id,
    expense_date = p_expense_date,
    category = p_category,
    vat_breakdown = p_vat_breakdown,
    note = v_note,
    invoice_attachment_url = v_attachment
  WHERE expense.id = v_expense.id
    AND expense.tenant_id = v_tenant_id
  RETURNING expense.* INTO v_updated;

  PERFORM public.log_audit(
    'update',
    'expense',
    v_expense.id,
    to_jsonb(v_expense),
    to_jsonb(v_updated)
  );

  PERFORM set_config('app.expense_update_id', '', true);

  RETURN jsonb_build_object('expense_id', v_updated.id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_operating_expense(
  bigint,
  bigint,
  date,
  text,
  jsonb,
  text,
  text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.update_operating_expense(
  bigint,
  bigint,
  date,
  text,
  jsonb,
  text,
  text
) TO authenticated;

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

  IF TG_OP = 'UPDATE'
    AND current_setting('app.expense_update_id', true) = OLD.id::text
    AND auth.uid() IS NOT NULL
    AND OLD.tenant_id IS NOT DISTINCT FROM public.auth_tenant_id()
    AND public.auth_is_owner(auth.uid())
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
