DO $correct_payment_method_authority$
DECLARE
  v_before text;
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.correct_payment_method(bigint,text,text)'::regprocedure
  ) INTO v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $$IF NOT public.auth_is_owner(v_actor)
    OR NOT public.has_permission(
      v_payment.branch_id,
      'orders:refund_approve'
    )
  THEN$$,
    $$IF NOT (public.auth_is_owner(v_actor) OR public.has_position('accountant'))
    OR NOT public.has_permission_any('finance:view')
  THEN$$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'correct_payment_method_authorization_not_found';
  END IF;
  EXECUTE v_definition;
END;
$correct_payment_method_authority$;

DO $finance_funds_authority$
DECLARE
  v_before text;
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.create_finance_fund_adjustment(numeric,numeric,text,uuid)'::regprocedure
  ) INTO v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $$OR NOT public.auth_is_owner(v_actor)
  THEN$$,
    $$OR NOT (public.auth_is_owner(v_actor) OR public.has_position('accountant'))
    OR NOT public.has_permission_any('finance:view')
  THEN$$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'create_finance_fund_adjustment_authorization_not_found';
  END IF;
  EXECUTE v_definition;

  SELECT pg_catalog.pg_get_functiondef(
    'public.initialize_finance_funds(numeric,numeric,timestamp with time zone,text,uuid)'::regprocedure
  ) INTO v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $$OR NOT public.auth_is_owner(v_actor)
  THEN$$,
    $$OR NOT (public.auth_is_owner(v_actor) OR public.has_position('accountant'))
    OR NOT public.has_permission_any('finance:view')
  THEN$$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'initialize_finance_funds_authorization_not_found';
  END IF;
  EXECUTE v_definition;
END;
$finance_funds_authority$;

DO $revenue_targets_authority$
DECLARE
  v_signature regprocedure;
  v_before text;
  v_definition text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.list_branch_revenue_targets(date)'::regprocedure,
    'public.list_branch_revenue_target_reward_tiers(date)'::regprocedure,
    'public.upsert_branch_revenue_targets(date,jsonb)'::regprocedure,
    'public.delete_branch_revenue_target(date,bigint)'::regprocedure
  ] LOOP
    SELECT pg_catalog.pg_get_functiondef(v_signature) INTO v_definition;
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      $$IF NOT public.auth_is_owner(v_uid)
     OR NOT public.has_permission_any('finance:view') THEN$$,
      $$IF NOT (public.auth_is_owner(v_uid) OR public.has_position('accountant'))
     OR NOT public.has_permission_any('finance:view') THEN$$
    );
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'branch_revenue_target_authorization_not_found: %', v_signature;
    END IF;
    EXECUTE v_definition;
  END LOOP;
END;
$revenue_targets_authority$;

DROP POLICY IF EXISTS branch_revenue_targets_insert ON public.branch_revenue_targets;
DROP POLICY IF EXISTS branch_revenue_targets_update ON public.branch_revenue_targets;
DROP POLICY IF EXISTS branch_revenue_targets_delete ON public.branch_revenue_targets;

CREATE POLICY branch_revenue_targets_insert
  ON public.branch_revenue_targets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (public.auth_is_owner(auth.uid()) OR public.has_position('accountant'))
    AND public.has_permission_any('finance:view')
  );

CREATE POLICY branch_revenue_targets_update
  ON public.branch_revenue_targets
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (public.auth_is_owner(auth.uid()) OR public.has_position('accountant'))
    AND public.has_permission_any('finance:view')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (public.auth_is_owner(auth.uid()) OR public.has_position('accountant'))
    AND public.has_permission_any('finance:view')
  );

CREATE POLICY branch_revenue_targets_delete
  ON public.branch_revenue_targets
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (public.auth_is_owner(auth.uid()) OR public.has_position('accountant'))
    AND public.has_permission_any('finance:view')
  );

DO $supplier_advance_authority$
DECLARE
  v_before text;
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.record_supplier_payment_allocated(bigint,bigint,numeric,text,uuid,text,jsonb)'::regprocedure
  ) INTO v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $$IF NOT public.auth_is_owner(v_uid)
     AND p_amount IS DISTINCT FROM (
       SELECT COALESCE(
         sum((allocation.value->>'amount')::numeric),
         0
       )::numeric(15,2)
       FROM pg_catalog.jsonb_array_elements(p_allocations) allocation
     ) THEN
    RAISE EXCEPTION 'accountant_supplier_advance_forbidden'
      USING ERRCODE = '42501';
  END IF;

$$,
    ''
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'record_supplier_payment_allocated_authorization_not_found';
  END IF;
  EXECUTE v_definition;

  SELECT pg_catalog.pg_get_functiondef(
    'public.allocate_supplier_advance(bigint,uuid,jsonb)'::regprocedure
  ) INTO v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $$IF NOT public.auth_is_owner(v_uid)
     OR NOT public.has_permission_any('finance:ap_pay') THEN$$,
    $$IF NOT (public.auth_is_owner(v_uid) OR public.has_position('accountant'))
     OR NOT public.has_permission_any('finance:ap_pay') THEN$$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'allocate_supplier_advance_authorization_not_found';
  END IF;
  EXECUTE v_definition;
END;
$supplier_advance_authority$;

DO $tax_invoice_authority$
DECLARE
  v_signature regprocedure;
  v_before text;
  v_definition text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.queue_tax_invoice_issue_job_for_completed_order(bigint,jsonb)'::regprocedure,
    'public.requeue_tax_invoice_issue_job(bigint)'::regprocedure
  ] LOOP
    SELECT pg_catalog.pg_get_functiondef(v_signature) INTO v_definition;
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      $$OR NOT public.auth_is_owner(v_actor)
    OR NOT public.has_permission_any('settings:tenant') THEN$$,
      $$OR NOT (public.auth_is_owner(v_actor) OR public.has_position('accountant'))
    OR NOT public.has_permission_any('finance:view') THEN$$
    );
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'tax_invoice_authorization_not_found: %', v_signature;
    END IF;
    EXECUTE v_definition;
  END LOOP;

  SELECT pg_catalog.pg_get_functiondef(
    'public.reserve_tax_invoice_replacement(bigint,text,text,timestamp with time zone,text,text,text)'::regprocedure
  ) INTO v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $$IF v_actor IS NULL OR NOT public.has_permission(NULL, 'settings:tenant') THEN$$,
    $$IF v_actor IS NULL
    OR NOT (public.auth_is_owner(v_actor) OR public.has_position('accountant'))
    OR NOT public.has_permission_any('finance:view') THEN$$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'reserve_tax_invoice_replacement_authorization_not_found';
  END IF;
  EXECUTE v_definition;

  SELECT pg_catalog.pg_get_functiondef(
    'public.reconcile_tax_invoice_provider_issued(bigint,text,text,text,jsonb,timestamp with time zone,text)'::regprocedure
  ) INTO v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $$OR NOT public.auth_is_owner(v_actor)
      OR NOT public.has_permission_any('settings:tenant')
      OR NOT public.has_permission_any('finance:view') THEN$$,
    $$OR NOT (public.auth_is_owner(v_actor) OR public.has_position('accountant'))
      OR NOT public.has_permission_any('finance:view') THEN$$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'reconcile_tax_invoice_provider_issued_authorization_not_found';
  END IF;
  EXECUTE v_definition;

  SELECT pg_catalog.pg_get_functiondef(
    'public.transition_tax_invoice_state(bigint,text,jsonb,text)'::regprocedure
  ) INTO v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $$IF NOT public.has_permission(NULL, 'settings:tenant') THEN$$,
    $$IF NOT (public.auth_is_owner(v_uid) OR public.has_position('accountant'))
      OR NOT public.has_permission_any('finance:view') THEN$$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'transition_tax_invoice_state_authorization_not_found';
  END IF;
  EXECUTE v_definition;
END;
$tax_invoice_authority$;
