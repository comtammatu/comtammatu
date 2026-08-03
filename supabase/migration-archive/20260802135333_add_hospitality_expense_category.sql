ALTER TABLE public.expenses
  DROP CONSTRAINT expenses_category_check,
  ADD CONSTRAINT expenses_category_check CHECK (
    category = ANY (ARRAY[
      'rent',
      'utilities',
      'gas_fuel',
      'salary',
      'cogs_manual',
      'supplies',
      'repair',
      'marketing',
      'fees_tax',
      'hospitality',
      'bank_deposit',
      'other'
    ]::text[])
  );

DO $hospitality_expense_category$
DECLARE
  v_before text;
  v_definition text;
  v_proc regprocedure;
BEGIN
  FOREACH v_proc IN ARRAY ARRAY[
    'public.cancel_expense(bigint)'::regprocedure,
    'public.create_expense_transfer_intent(bigint,date,text,jsonb,text,text,text)'::regprocedure,
    'public.get_operating_cash_movement_for_period(date,date,bigint)'::regprocedure,
    'public.guard_finance_expense_evidence_mutation()'::regprocedure,
    'public.reconcile_bank_transaction_targets(bigint,text,bigint[])'::regprocedure,
    'public.transition_expense_payment(bigint,text)'::regprocedure,
    'public.update_operating_expense(bigint,bigint,date,text,jsonb,text,text)'::regprocedure
  ]
  LOOP
    SELECT pg_catalog.pg_get_functiondef(v_proc) INTO v_definition;
    v_before := v_definition;
    v_definition := regexp_replace(
      v_definition,
      $$('fees_tax',)([[:space:]]*)'other'$$,
      $$\1\2'hospitality',\2'other'$$,
      'g'
    );
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'hospitality_expense_category_boundary_not_found'
        USING DETAIL = v_proc::text;
    END IF;
    EXECUTE v_definition;
  END LOOP;
END;
$hospitality_expense_category$;
