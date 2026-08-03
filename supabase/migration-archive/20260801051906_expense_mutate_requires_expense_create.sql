-- Align operating-expense mutate authority with RLS:
-- Owner (has_permission_any bypass) + Accountant need finance:expense_create
-- for create/edit/cancel and unpaid → cash|transfer payment transitions.

DO $expense_mutate_rpc_permission$
DECLARE
  v_before text;
  v_definition text;
  v_proc regprocedure;
BEGIN
  FOREACH v_proc IN ARRAY ARRAY[
    'public.update_operating_expense(bigint,bigint,date,text,jsonb,text,text)'::regprocedure,
    'public.cancel_expense(bigint)'::regprocedure,
    'public.transition_expense_payment(bigint,text)'::regprocedure
  ]
  LOOP
    SELECT pg_catalog.pg_get_functiondef(v_proc) INTO v_definition;
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      $$public.has_permission_any('finance:view')$$,
      $$public.has_permission_any('finance:expense_create')$$
    );
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'expense_mutate_rpc_permission_not_found'
        USING DETAIL = v_proc::text;
    END IF;
    EXECUTE v_definition;
  END LOOP;
END;
$expense_mutate_rpc_permission$;

DO $expense_evidence_mutate_permission$
DECLARE
  v_before text;
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.guard_finance_expense_evidence_mutation()'::regprocedure
  ) INTO v_definition;
  v_before := v_definition;

  v_definition := replace(
    v_definition,
    $$public.has_permission_any('finance:view')$$,
    $$public.has_permission_any('finance:expense_create')$$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'expense_evidence_permission_not_found';
  END IF;

  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $$  IF TG_OP = 'UPDATE'
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
  THEN$$,
    $$  IF TG_OP = 'UPDATE'
    AND current_setting('app.expense_payment_transition_id', true) = OLD.id::text
    AND auth.uid() IS NOT NULL
    AND OLD.tenant_id IS NOT DISTINCT FROM public.auth_tenant_id()
    AND (
      public.auth_is_owner(auth.uid())
      OR public.has_position('accountant')
    )
    AND public.has_permission_any('finance:expense_create')
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
        NEW.payment_method = 'transfer'
        AND NEW.paid_at IS NOT NULL
      ) OR (
        NEW.payment_method = 'unpaid'
        AND NEW.paid_at IS NULL
      )
    )
  THEN$$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'expense_payment_transition_evidence_authorization_not_found';
  END IF;

  EXECUTE v_definition;
END;
$expense_evidence_mutate_permission$;
