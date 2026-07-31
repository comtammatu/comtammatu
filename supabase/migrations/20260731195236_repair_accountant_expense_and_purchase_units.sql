DO $operating_expense_accountant_authority$
DECLARE
  v_before text;
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.update_operating_expense(bigint,bigint,date,text,jsonb,text,text)'::regprocedure
  ) INTO v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $$OR NOT public.auth_is_owner(v_user_id)
    OR NOT EXISTS ($$,
    $$OR NOT (
      public.auth_is_owner(v_user_id)
      OR public.has_position('accountant')
    )
    OR NOT public.has_permission_any('finance:view')
    OR NOT EXISTS ($$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'update_operating_expense_authorization_not_found';
  END IF;
  EXECUTE v_definition;

  SELECT pg_catalog.pg_get_functiondef(
    'public.cancel_expense(bigint)'::regprocedure
  ) INTO v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $$OR NOT public.auth_is_owner(v_user_id)
    OR NOT EXISTS ($$,
    $$OR NOT (
      public.auth_is_owner(v_user_id)
      OR public.has_position('accountant')
    )
    OR NOT public.has_permission_any('finance:view')
    OR NOT EXISTS ($$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'cancel_expense_authorization_not_found';
  END IF;
  EXECUTE v_definition;
END;
$operating_expense_accountant_authority$;

DO $expense_vat_update_guard$
DECLARE
  v_before text;
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.normalize_expense_vat_breakdown()'::regprocedure
  ) INTO v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $$  IF TG_OP = 'UPDATE' AND (
    NEW.vat_breakdown IS DISTINCT FROM OLD.vat_breakdown
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
    OR NEW.amount IS DISTINCT FROM OLD.amount
  ) THEN$$,
    $$  IF TG_OP = 'UPDATE'
     AND current_setting('app.expense_update_id', true) IS DISTINCT FROM OLD.id::text
     AND (
       NEW.vat_breakdown IS DISTINCT FROM OLD.vat_breakdown
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
       OR NEW.amount IS DISTINCT FROM OLD.amount
     ) THEN$$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'normalize_expense_vat_update_guard_not_found';
  END IF;
  EXECUTE v_definition;
END;
$expense_vat_update_guard$;

DO $expense_evidence_accountant_authority$
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
    $$  IF TG_OP = 'UPDATE'
    AND current_setting('app.expense_update_id', true) = OLD.id::text
    AND auth.uid() IS NOT NULL
    AND OLD.tenant_id IS NOT DISTINCT FROM public.auth_tenant_id()
    AND public.auth_is_owner(auth.uid())
    AND OLD.transfer_content IS NULL$$,
    $$  IF TG_OP = 'UPDATE'
    AND current_setting('app.expense_update_id', true) = OLD.id::text
    AND auth.uid() IS NOT NULL
    AND OLD.tenant_id IS NOT DISTINCT FROM public.auth_tenant_id()
    AND (
      public.auth_is_owner(auth.uid())
      OR public.has_position('accountant')
    )
    AND public.has_permission_any('finance:view')
    AND OLD.transfer_content IS NULL$$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'expense_update_evidence_authorization_not_found';
  END IF;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $$  IF TG_OP = 'DELETE'
    AND current_setting('app.expense_cancel_id', true) = OLD.id::text
    AND auth.uid() IS NOT NULL
    AND OLD.tenant_id IS NOT DISTINCT FROM public.auth_tenant_id()
    AND public.auth_is_owner(auth.uid())
    AND OLD.category <> 'bank_deposit'$$,
    $$  IF TG_OP = 'DELETE'
    AND current_setting('app.expense_cancel_id', true) = OLD.id::text
    AND auth.uid() IS NOT NULL
    AND OLD.tenant_id IS NOT DISTINCT FROM public.auth_tenant_id()
    AND (
      public.auth_is_owner(auth.uid())
      OR public.has_position('accountant')
    )
    AND public.has_permission_any('finance:view')
    AND OLD.category <> 'bank_deposit'$$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'expense_cancel_evidence_authorization_not_found';
  END IF;
  EXECUTE v_definition;
END;
$expense_evidence_accountant_authority$;

DO $purchase_demand_receipt_unit_conversion$
DECLARE
  v_before text;
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.review_purchase_demand(bigint,text,jsonb,text,uuid)'::regprocedure
  ) INTO v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $$  FOR v_supplier IN$$,
    $$  IF EXISTS (
    SELECT 1
    FROM public.purchase_request_allocations AS allocation
    JOIN public.purchase_request_items AS demand_item
      ON demand_item.id = allocation.purchase_request_item_id
     AND demand_item.tenant_id = allocation.tenant_id
     AND demand_item.purchase_request_id = allocation.purchase_request_id
    LEFT JOIN public.ingredients AS ingredient
      ON ingredient.id = demand_item.ingredient_id
     AND ingredient.tenant_id = demand_item.tenant_id
    LEFT JOIN public.ingredient_units AS request_unit
      ON request_unit.tenant_id = demand_item.tenant_id
     AND request_unit.ingredient_id = demand_item.ingredient_id
     AND request_unit.unit_id = demand_item.entry_unit_id
    LEFT JOIN public.ingredient_units AS receipt_unit
      ON receipt_unit.tenant_id = ingredient.tenant_id
     AND receipt_unit.ingredient_id = ingredient.id
     AND receipt_unit.unit_id = ingredient.receipt_unit_id
    WHERE allocation.tenant_id = v_tenant
      AND allocation.purchase_request_id = p_demand_id
      AND (
        ingredient.id IS NULL
        OR ingredient.receipt_unit_id IS NULL
        OR request_unit.unit_id IS NULL
        OR receipt_unit.unit_id IS NULL
        OR receipt_unit.is_active IS NOT TRUE
        OR request_unit.to_base_factor <= 0
        OR receipt_unit.to_base_factor <= 0
        OR allocation.quantity * request_unit.to_base_factor
          / receipt_unit.to_base_factor
          <> pg_catalog.round(
            allocation.quantity * request_unit.to_base_factor
              / receipt_unit.to_base_factor,
            3
          )
      )
  ) THEN
    RAISE EXCEPTION 'purchase_demand_receipt_unit_conversion_invalid'
      USING ERRCODE = '23514';
  END IF;

  FOR v_supplier IN$$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'review_purchase_demand_conversion_precheck_not_found';
  END IF;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $$      allocation.quantity,
      demand_item.entry_unit_id,
      NULL,
      NULL
    FROM public.purchase_request_allocations AS allocation
    JOIN public.purchase_request_items AS demand_item
      ON demand_item.id = allocation.purchase_request_item_id
     AND demand_item.tenant_id = allocation.tenant_id
     AND demand_item.purchase_request_id = allocation.purchase_request_id$$,
    $$      allocation.quantity * request_unit.to_base_factor / receipt_unit.to_base_factor,
      ingredient.receipt_unit_id,
      NULL,
      NULL
    FROM public.purchase_request_allocations AS allocation
    JOIN public.purchase_request_items AS demand_item
      ON demand_item.id = allocation.purchase_request_item_id
     AND demand_item.tenant_id = allocation.tenant_id
     AND demand_item.purchase_request_id = allocation.purchase_request_id
    JOIN public.ingredients AS ingredient
      ON ingredient.id = demand_item.ingredient_id
     AND ingredient.tenant_id = demand_item.tenant_id
    JOIN public.ingredient_units AS request_unit
      ON request_unit.tenant_id = demand_item.tenant_id
     AND request_unit.ingredient_id = demand_item.ingredient_id
     AND request_unit.unit_id = demand_item.entry_unit_id
    JOIN public.ingredient_units AS receipt_unit
      ON receipt_unit.tenant_id = ingredient.tenant_id
     AND receipt_unit.ingredient_id = ingredient.id
     AND receipt_unit.unit_id = ingredient.receipt_unit_id$$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'review_purchase_demand_conversion_mapping_not_found';
  END IF;
  EXECUTE v_definition;
END;
$purchase_demand_receipt_unit_conversion$;
