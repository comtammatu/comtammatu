-- Run against a non-production database with migrations and dev seed applied:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/supplier_payment_idempotency_test.sql

\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION public.test_supplier_payment_forced_update_failure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF pg_catalog.current_setting(
    'comtammatu.test_supplier_payment_failure',
    true
  ) = 'on' THEN
    RAISE EXCEPTION 'forced_supplier_payment_update_failure'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER test_supplier_payment_forced_update_failure
BEFORE UPDATE ON public.supplier_invoices
FOR EACH ROW
EXECUTE FUNCTION public.test_supplier_payment_forced_update_failure();

DO $$
DECLARE
  v_tenant bigint;
  v_branch bigint;
  v_owner uuid;
  v_non_owner uuid;
  v_supplier bigint;
  v_grn bigint;
  v_invoice bigint;
  v_key_a uuid := pg_catalog.gen_random_uuid();
  v_key_b uuid := pg_catalog.gen_random_uuid();
  v_key_c uuid := pg_catalog.gen_random_uuid();
  v_denied_key uuid := pg_catalog.gen_random_uuid();
  v_tenant_denied_key uuid := pg_catalog.gen_random_uuid();
  v_missing_grn_key uuid := pg_catalog.gen_random_uuid();
  v_unmatched_key uuid := pg_catalog.gen_random_uuid();
  v_atomic_key uuid := pg_catalog.gen_random_uuid();
  v_overflow_key uuid := pg_catalog.gen_random_uuid();
  v_closed_key uuid := pg_catalog.gen_random_uuid();
  v_result_a jsonb;
  v_result_b jsonb;
  v_result_c jsonb;
  v_replay jsonb;
  v_payment_a bigint;
  v_payment_b bigint;
  v_payment_c bigint;
  v_count integer;
  v_sum numeric;
  v_paid numeric;
  v_credit numeric;
  v_status text;
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.record_supplier_payment(bigint,bigint,numeric,text,uuid,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'required-key supplier payment RPC is missing';
  END IF;

  IF pg_catalog.to_regprocedure(
    'public.create_supplier_payment(bigint,bigint,numeric,text,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'DB-first compatibility RPC is missing';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.record_supplier_payment(bigint,bigint,numeric,text,uuid,text)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    'public.record_supplier_payment(bigint,bigint,numeric,text,uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'supplier payment RPC grants are invalid';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.create_supplier_payment(bigint,bigint,numeric,text,text)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    'public.create_supplier_payment(bigint,bigint,numeric,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'compatibility supplier payment RPC grants are invalid';
  END IF;

  IF pg_catalog.has_function_privilege(
    'authenticated',
    'public.apply_credit_note_to_invoice(bigint,bigint,numeric)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'dormant credit-application RPC remains exposed';
  END IF;

  IF pg_catalog.has_table_privilege(
    'authenticated',
    'public.supplier_payments',
    'INSERT'
  ) OR pg_catalog.has_table_privilege(
    'authenticated',
    'public.supplier_payments',
    'UPDATE'
  ) OR pg_catalog.has_table_privilege(
    'authenticated',
    'public.supplier_payments',
    'DELETE'
  ) THEN
    RAISE EXCEPTION 'authenticated direct supplier payment DML is exposed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes AS i
    WHERE i.schemaname = 'public'
      AND i.indexname = 'supplier_payments_tenant_id_idempotency_key_uidx'
      AND i.indexdef LIKE '%UNIQUE%'
      AND i.indexdef LIKE '%(tenant_id, idempotency_key)%'
      AND i.indexdef LIKE '%WHERE (idempotency_key IS NOT NULL)%'
  ) THEN
    RAISE EXCEPTION 'supplier payment idempotency index is missing';
  END IF;

  SELECT p.tenant_id, p.id, b.id
  INTO v_tenant, v_owner, v_branch
  FROM public.profiles AS p
  JOIN auth.users AS u ON u.id = p.id
  JOIN public.positions AS po
    ON po.id = p.position_id
    AND po.tenant_id = p.tenant_id
  JOIN public.branches AS b
    ON b.tenant_id = p.tenant_id
    AND b.is_active = true
    AND b.branch_kind IN ('branch', 'central_supply', 'central_kitchen')
  WHERE po.code = 'owner'
    AND COALESCE(p.is_active, true)
  ORDER BY b.id
  LIMIT 1;

  SELECT p.id
  INTO v_non_owner
  FROM public.profiles AS p
  JOIN auth.users AS u ON u.id = p.id
  JOIN public.positions AS po
    ON po.id = p.position_id
    AND po.tenant_id = p.tenant_id
  WHERE p.tenant_id = v_tenant
    AND po.code <> 'owner'
    AND COALESCE(p.is_active, true)
  ORDER BY p.id
  LIMIT 1;

  IF v_tenant IS NULL
    OR v_branch IS NULL
    OR v_owner IS NULL
    OR v_non_owner IS NULL THEN
    RAISE EXCEPTION 'Seed data missing for supplier payment acceptance';
  END IF;

  DELETE FROM public.staff_permissions
  WHERE user_id = v_non_owner
    AND permission_key IN ('finance:ap_pay', 'finance:view')
    AND branch_id IS NULL;

  INSERT INTO public.staff_permissions (
    user_id,
    tenant_id,
    branch_id,
    permission_key,
    granted_by
  ) VALUES
    (v_non_owner, v_tenant, NULL, 'finance:ap_pay', v_owner),
    (v_non_owner, v_tenant, NULL, 'finance:view', v_owner);

  INSERT INTO public.suppliers (tenant_id, name)
  VALUES (
    v_tenant,
    '__supplier_payment_test_' || pg_catalog.gen_random_uuid()::text
  )
  RETURNING id INTO v_supplier;

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    supplier_id,
    grn_number,
    status,
    created_by
  ) VALUES (
    v_tenant,
    v_branch,
    v_supplier,
    '__SPAY_GRN_' || pg_catalog.gen_random_uuid()::text,
    'confirmed',
    v_owner
  )
  RETURNING id INTO v_grn;

  INSERT INTO public.supplier_invoices (
    tenant_id,
    supplier_id,
    grn_id,
    invoice_number,
    invoice_date,
    subtotal,
    vat_rate,
    vat_amount,
    total_amount,
    matching_status,
    created_by,
    payment_status,
    paid_amount,
    credit_applied_amount
  ) VALUES (
    v_tenant,
    v_supplier,
    v_grn,
    '__SPAY_INV_' || pg_catalog.gen_random_uuid()::text,
    pg_catalog.now(),
    1000,
    0,
    0,
    1000,
    'matched',
    v_owner,
    'unpaid',
    0,
    200
  )
  RETURNING id INTO v_invoice;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    v_non_owner::text,
    true
  );
  PERFORM pg_catalog.set_config(
    'request.jwt.claim.role',
    'authenticated',
    true
  );
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_non_owner::text,
      'role', 'authenticated',
      'app_metadata', pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant,
        'branch_id', v_branch
      )
    )::text,
    true
  );

  IF NOT public.has_permission_any('finance:ap_pay')
    OR NOT public.has_permission_any('finance:view')
    OR public.auth_is_owner(v_non_owner) THEN
    RAISE EXCEPTION 'non-owner permission fixture is invalid';
  END IF;

  BEGIN
    PERFORM public.record_supplier_payment(
      v_tenant,
      v_invoice,
      100,
      'bank_transfer',
      v_denied_key,
      'DENIED'
    );
    RAISE EXCEPTION 'non-owner payment unexpectedly succeeded';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      IF SQLERRM <> 'forbidden_owner_only' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.get_ap_aging();
    RAISE EXCEPTION 'non-owner AP aging unexpectedly succeeded';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      IF SQLERRM <> 'forbidden_owner_only' THEN
        RAISE;
      END IF;
  END;

  SELECT COUNT(*)
  INTO v_count
  FROM public.supplier_payments
  WHERE supplier_invoice_id = v_invoice;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'denied payment mutated the ledger';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    v_owner::text,
    true
  );
  PERFORM pg_catalog.set_config(
    'request.jwt.claim.role',
    'authenticated',
    true
  );
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant,
        'branch_id', v_branch
      )
    )::text,
    true
  );

  BEGIN
    PERFORM public.record_supplier_payment(
      v_tenant + 999999,
      v_invoice,
      100,
      'bank_transfer',
      v_tenant_denied_key,
      NULL
    );
    RAISE EXCEPTION 'wrong-tenant payment unexpectedly succeeded';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      IF SQLERRM <> 'tenant_mismatch' THEN
        RAISE;
      END IF;
  END;

  UPDATE public.supplier_invoices
  SET grn_id = NULL
  WHERE id = v_invoice;

  BEGIN
    PERFORM public.record_supplier_payment(
      v_tenant,
      v_invoice,
      100,
      'bank_transfer',
      v_missing_grn_key,
      NULL
    );
    RAISE EXCEPTION 'missing-GRN payment unexpectedly succeeded';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      IF SQLERRM <> 'invoice_missing_grn_for_payment' THEN
        RAISE;
      END IF;
  END;

  UPDATE public.supplier_invoices
  SET grn_id = v_grn,
      matching_status = 'pending'
  WHERE id = v_invoice;

  BEGIN
    PERFORM public.record_supplier_payment(
      v_tenant,
      v_invoice,
      100,
      'bank_transfer',
      v_unmatched_key,
      NULL
    );
    RAISE EXCEPTION 'unmatched invoice payment unexpectedly succeeded';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      IF SQLERRM <> 'invoice_not_matched_for_payment' THEN
        RAISE;
      END IF;
  END;

  UPDATE public.supplier_invoices
  SET matching_status = 'matched'
  WHERE id = v_invoice;

  PERFORM pg_catalog.set_config(
    'comtammatu.test_supplier_payment_failure',
    'on',
    true
  );

  BEGIN
    PERFORM public.record_supplier_payment(
      v_tenant,
      v_invoice,
      100,
      'bank_transfer',
      v_atomic_key,
      NULL
    );
    RAISE EXCEPTION 'forced post-insert failure unexpectedly committed';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'forced_supplier_payment_update_failure' THEN
        RAISE;
      END IF;
  END;

  PERFORM pg_catalog.set_config(
    'comtammatu.test_supplier_payment_failure',
    'off',
    true
  );

  IF EXISTS (
    SELECT 1
    FROM public.supplier_payments
    WHERE tenant_id = v_tenant
      AND idempotency_key = v_atomic_key
  ) OR EXISTS (
    SELECT 1
    FROM public.supplier_invoices
    WHERE id = v_invoice
      AND paid_amount <> 0
  ) THEN
    RAISE EXCEPTION 'post-insert failure did not roll back atomically';
  END IF;

  v_result_a := public.record_supplier_payment(
    v_tenant,
    v_invoice,
    300,
    'bank_transfer',
    v_key_a,
    '  BANK-REF-A  '
  );
  v_payment_a := (v_result_a ->> 'payment_id')::bigint;

  IF v_payment_a IS NULL OR v_result_a ->> 'payment_status' <> 'partial' THEN
    RAISE EXCEPTION 'first supplier payment returned an invalid result: %',
      v_result_a;
  END IF;

  BEGIN
    UPDATE public.supplier_payments
    SET idempotency_result_status = NULL
    WHERE id = v_payment_a;
    RAISE EXCEPTION 'keyed payment accepted a null replay result';
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      NULL;
  END;

  BEGIN
    PERFORM public.record_supplier_payment(
      v_tenant,
      v_invoice,
      301,
      'bank_transfer',
      v_key_a,
      'BANK-REF-A'
    );
    RAISE EXCEPTION 'changed-payload replay unexpectedly succeeded';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      IF SQLERRM <> 'supplier_payment_idempotency_conflict' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.record_supplier_payment(
      v_tenant,
      v_invoice,
      501,
      'cash',
      v_overflow_key,
      NULL
    );
    RAISE EXCEPTION 'credit-aware overpayment unexpectedly succeeded';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      IF SQLERRM <> 'payment_exceeds_invoice_total' THEN
        RAISE;
      END IF;
  END;

  v_result_b := public.record_supplier_payment(
    v_tenant,
    v_invoice,
    200,
    'cash',
    v_key_b,
    NULL
  );
  v_payment_b := (v_result_b ->> 'payment_id')::bigint;

  IF v_payment_b IS NULL
    OR v_payment_b = v_payment_a
    OR v_result_b ->> 'payment_status' <> 'partial' THEN
    RAISE EXCEPTION 'second partial payment returned an invalid result: %',
      v_result_b;
  END IF;

  v_result_c := public.record_supplier_payment(
    v_tenant,
    v_invoice,
    300,
    'cash',
    v_key_c,
    NULL
  );
  v_payment_c := (v_result_c ->> 'payment_id')::bigint;

  IF v_payment_c IS NULL
    OR v_payment_c IN (v_payment_a, v_payment_b)
    OR v_result_c ->> 'payment_status' <> 'paid' THEN
    RAISE EXCEPTION 'final supplier payment returned an invalid result: %',
      v_result_c;
  END IF;

  v_replay := public.record_supplier_payment(
    v_tenant,
    v_invoice,
    300,
    'bank_transfer',
    v_key_a,
    'BANK-REF-A'
  );

  IF (v_replay ->> 'payment_id')::bigint <> v_payment_a
    OR v_replay ->> 'payment_status' <> 'partial'
    OR v_replay <> v_result_a THEN
    RAISE EXCEPTION 'exact replay did not preserve the first result: %',
      v_replay;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(amount), 0)
  INTO v_count, v_sum
  FROM public.supplier_payments
  WHERE supplier_invoice_id = v_invoice;

  SELECT paid_amount, credit_applied_amount, payment_status
  INTO v_paid, v_credit, v_status
  FROM public.supplier_invoices
  WHERE id = v_invoice;

  IF v_count <> 3
    OR v_sum <> 800
    OR v_paid <> 800
    OR v_credit <> 200
    OR v_status <> 'paid' THEN
    RAISE EXCEPTION
      'supplier payment ledger mismatch count=% sum=% paid=% credit=% status=%',
      v_count,
      v_sum,
      v_paid,
      v_credit,
      v_status;
  END IF;

  UPDATE public.supplier_invoices
  SET payment_status = 'partial'
  WHERE id = v_invoice;

  BEGIN
    PERFORM public.record_supplier_payment(
      v_tenant,
      v_invoice,
      1,
      'cash',
      v_closed_key,
      NULL
    );
    RAISE EXCEPTION 'zero-balance invoice unexpectedly accepted a payment';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'invoice_already_paid' THEN
        RAISE;
      END IF;
  END;

  IF EXISTS (
    SELECT 1
    FROM public.get_ap_aging() AS aging
    WHERE aging.supplier_id = v_supplier
  ) THEN
    RAISE EXCEPTION 'zero-balance credited invoice remains in AP aging';
  END IF;
END;
$$;

ROLLBACK;
