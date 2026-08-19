-- Catalog + ACL for guest Self-Order promo apply/clear.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_apply oid := to_regprocedure(
    'public.self_order_apply_promotion_code(text, uuid, text)'
  );
  v_clear oid := to_regprocedure(
    'public.self_order_clear_promotion(text, uuid)'
  );
  v_bill oid := to_regprocedure('public.bill_line_items(bigint)');
  v_apply_def text;
  v_bill_def text;
BEGIN
  IF v_apply IS NULL OR v_clear IS NULL THEN
    RAISE EXCEPTION 'self_order_guest_promotion_rpc_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc function_row
    WHERE function_row.oid = v_apply
      AND function_row.prosecdef
      AND EXISTS (
        SELECT 1
        FROM unnest(function_row.proconfig) AS cfg
        WHERE cfg LIKE 'search_path%'
      )
  ) THEN
    RAISE EXCEPTION 'self_order_apply_promotion_code_acl_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc function_row
    WHERE function_row.oid = v_clear
      AND function_row.prosecdef
      AND EXISTS (
        SELECT 1
        FROM unnest(function_row.proconfig) AS cfg
        WHERE cfg LIKE 'search_path%'
      )
  ) THEN
    RAISE EXCEPTION 'self_order_clear_promotion_acl_invalid';
  END IF;

  IF has_function_privilege('anon', v_apply, 'EXECUTE')
    OR has_function_privilege('authenticated', v_apply, 'EXECUTE')
    OR NOT has_function_privilege('service_role', v_apply, 'EXECUTE')
    OR has_function_privilege('anon', v_clear, 'EXECUTE')
    OR has_function_privilege('authenticated', v_clear, 'EXECUTE')
    OR NOT has_function_privilege('service_role', v_clear, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'self_order_guest_promotion_execute_grant_invalid';
  END IF;

  SELECT pg_get_functiondef(v_apply) INTO v_apply_def;
  IF v_apply_def IS NULL
    OR v_apply_def NOT ILIKE '%promotion_guest_staff_required%'
    OR v_apply_def NOT ILIKE '%order_pct%'
    OR v_apply_def NOT ILIKE '%voucher_face%'
  THEN
    RAISE EXCEPTION 'self_order_apply_promotion_code_kind_guard_missing';
  END IF;

  IF v_bill IS NULL THEN
    RAISE EXCEPTION 'bill_line_items_missing';
  END IF;
  SELECT pg_get_functiondef(v_bill) INTO v_bill_def;
  IF v_bill_def IS NULL OR v_bill_def NOT ILIKE '%discount_amount%' THEN
    RAISE EXCEPTION 'bill_line_items_discount_amount_missing';
  END IF;
END;
$$;

ROLLBACK;
